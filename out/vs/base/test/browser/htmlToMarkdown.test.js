import assert from "assert";
import { convertHtmlToMarkdown } from "../../browser/htmlToMarkdown.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../common/utils.js";
suite("htmlToMarkdown", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("converts headings", () => {
    assert.strictEqual(convertHtmlToMarkdown("<h1>Title</h1>"), "# Title");
    assert.strictEqual(convertHtmlToMarkdown("<h2>Subtitle</h2>"), "## Subtitle");
    assert.strictEqual(convertHtmlToMarkdown("<h3>Section</h3>"), "### Section");
    assert.strictEqual(convertHtmlToMarkdown("<h4>Sub-section</h4>"), "#### Sub-section");
    assert.strictEqual(convertHtmlToMarkdown("<h5>Minor</h5>"), "##### Minor");
    assert.strictEqual(convertHtmlToMarkdown("<h6>Smallest</h6>"), "###### Smallest");
  });
  test("converts links", () => {
    assert.strictEqual(
      convertHtmlToMarkdown('<a href="https://example.com">Example</a>'),
      "[Example](https://example.com)"
    );
  });
  test("strips dangerous schemes from links", () => {
    assert.strictEqual(
      convertHtmlToMarkdown('<a href="javascript:alert(1)">click</a>'),
      "click"
    );
    assert.strictEqual(
      convertHtmlToMarkdown('<a href="vbscript:run">run</a>'),
      "run"
    );
    assert.strictEqual(
      convertHtmlToMarkdown('<a href="data:text/html,<h1>hi</h1>">data</a>'),
      "data"
    );
  });
  test("converts bold and italic", () => {
    assert.strictEqual(convertHtmlToMarkdown("<strong>bold</strong>"), "**bold**");
    assert.strictEqual(convertHtmlToMarkdown("<b>bold</b>"), "**bold**");
    assert.strictEqual(convertHtmlToMarkdown("<em>italic</em>"), "*italic*");
    assert.strictEqual(convertHtmlToMarkdown("<i>italic</i>"), "*italic*");
  });
  test("converts inline code", () => {
    assert.strictEqual(convertHtmlToMarkdown("<code>foo()</code>"), "`foo()`");
  });
  test("preserves HTML tag names inside inline code", () => {
    assert.strictEqual(convertHtmlToMarkdown("<code>&lt;aside&gt;</code>"), "`<aside>`");
    assert.strictEqual(convertHtmlToMarkdown("<code>&lt;details&gt;</code>"), "`<details>`");
  });
  test("preserves HTML tag names inside inline code with nested tags", () => {
    assert.strictEqual(
      convertHtmlToMarkdown('<code><span class="hl">&lt;aside&gt;</span></code>'),
      "`<aside>`"
    );
  });
  test("preserves HTML tag names inside code blocks", () => {
    assert.strictEqual(
      convertHtmlToMarkdown("<pre><code>&lt;aside&gt;</code></pre>"),
      "```\n<aside>\n```"
    );
  });
  test("converts code blocks", () => {
    assert.strictEqual(
      convertHtmlToMarkdown("<pre><code>const x = 1;</code></pre>"),
      "```\nconst x = 1;\n```"
    );
  });
  test("converts syntax-highlighted code blocks by stripping inner tags", () => {
    assert.strictEqual(
      convertHtmlToMarkdown('<pre><code><span class="kw">const</span> x = <span class="num">1</span>;</code></pre>'),
      "```\nconst x = 1;\n```"
    );
  });
  test("preserves indentation in code blocks", () => {
    assert.strictEqual(
      convertHtmlToMarkdown("<pre><code>function foo() {\n  return 1;\n}</code></pre>"),
      "```\nfunction foo() {\n  return 1;\n}\n```"
    );
  });
  test("converts unordered lists", () => {
    const html = "<ul><li>one</li><li>two</li><li>three</li></ul>";
    assert.strictEqual(convertHtmlToMarkdown(html), "- one\n- two\n- three");
  });
  test("converts ordered lists to numbered items", () => {
    const html = "<ol><li>first</li><li>second</li></ol>";
    assert.strictEqual(convertHtmlToMarkdown(html), "1. first\n2. second");
  });
  test("converts line breaks", () => {
    assert.strictEqual(convertHtmlToMarkdown("hello<br>world"), "hello\nworld");
    assert.strictEqual(convertHtmlToMarkdown("hello<br/>world"), "hello\nworld");
  });
  test("converts horizontal rules", () => {
    assert.strictEqual(convertHtmlToMarkdown("above<hr>below"), "above\n---\nbelow");
  });
  test("converts strikethrough", () => {
    assert.strictEqual(convertHtmlToMarkdown("<del>removed</del>"), "~~removed~~");
    assert.strictEqual(convertHtmlToMarkdown("<s>struck</s>"), "~~struck~~");
  });
  test("converts blockquotes", () => {
    assert.strictEqual(
      convertHtmlToMarkdown("<blockquote>quoted text</blockquote>"),
      "> quoted text"
    );
  });
  test("converts images", () => {
    assert.strictEqual(
      convertHtmlToMarkdown('<img src="https://example.com/img.png" alt="photo">'),
      "![photo](https://example.com/img.png)"
    );
  });
  test("decodes HTML entities", () => {
    assert.strictEqual(convertHtmlToMarkdown("&amp; &lt; &gt; &quot; &#39;"), `& < > " '`);
  });
  test("strips unknown tags", () => {
    assert.strictEqual(convertHtmlToMarkdown('<span class="x">hello</span>'), "hello");
  });
  test("handles nested inline elements", () => {
    assert.strictEqual(
      convertHtmlToMarkdown("<strong><em>bold italic</em></strong>"),
      "***bold italic***"
    );
  });
  test("handles link with bold text inside", () => {
    assert.strictEqual(
      convertHtmlToMarkdown('<a href="https://example.com"><strong>click here</strong></a>'),
      "[**click here**](https://example.com)"
    );
  });
  test("handles heading with link inside", () => {
    assert.strictEqual(
      convertHtmlToMarkdown('<h2><a href="https://example.com">Title</a></h2>'),
      "## [Title](https://example.com)"
    );
  });
  test("collapses excessive newlines", () => {
    const html = "<p>one</p><p></p><p></p><p>two</p>";
    const result = convertHtmlToMarkdown(html);
    assert.ok(!result.includes("\n\n\n"), "should not have 3+ consecutive newlines");
    assert.ok(result.includes("one"));
    assert.ok(result.includes("two"));
  });
  test("handles a realistic web page snippet", () => {
    const html = `
			<h1>Getting Started</h1>
			<p>Welcome to <strong>VS Code</strong>. Visit <a href="https://code.visualstudio.com">the website</a> for more info.</p>
			<ul>
				<li>Fast</li>
				<li>Extensible</li>
			</ul>
		`;
    const md = convertHtmlToMarkdown(html);
    assert.ok(md.includes("# Getting Started"));
    assert.ok(md.includes("**VS Code**"));
    assert.ok(md.includes("[the website](https://code.visualstudio.com)"));
    assert.ok(md.includes("- Fast"));
    assert.ok(md.includes("- Extensible"));
  });
  test("decodes numeric HTML entities", () => {
    assert.strictEqual(convertHtmlToMarkdown("&#60;tag&#62;"), "<tag>");
    assert.strictEqual(convertHtmlToMarkdown("&#x3C;tag&#x3E;"), "<tag>");
    assert.strictEqual(convertHtmlToMarkdown("&#8212;"), "\u2014");
    assert.strictEqual(convertHtmlToMarkdown("&#x2014;"), "\u2014");
  });
  test("falls back to tag-stripping for very large input", () => {
    const large = "<b>" + "x".repeat(200001) + "</b>";
    const result = convertHtmlToMarkdown(large);
    assert.ok(!result.includes("**"));
    assert.ok(!result.includes("<b>"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9icm93c2VyL2h0bWxUb01hcmtkb3duLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgY29udmVydEh0bWxUb01hcmtkb3duIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9odG1sVG9NYXJrZG93bi5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi9jb21tb24vdXRpbHMuanMnO1xuXG5zdWl0ZSgnaHRtbFRvTWFya2Rvd24nLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIGhlYWRpbmdzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxoMT5UaXRsZTwvaDE+JyksICcjIFRpdGxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnZlcnRIdG1sVG9NYXJrZG93bignPGgyPlN1YnRpdGxlPC9oMj4nKSwgJyMjIFN1YnRpdGxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnZlcnRIdG1sVG9NYXJrZG93bignPGgzPlNlY3Rpb248L2gzPicpLCAnIyMjIFNlY3Rpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udmVydEh0bWxUb01hcmtkb3duKCc8aDQ+U3ViLXNlY3Rpb248L2g0PicpLCAnIyMjIyBTdWItc2VjdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxoNT5NaW5vcjwvaDU+JyksICcjIyMjIyBNaW5vcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxoNj5TbWFsbGVzdDwvaDY+JyksICcjIyMjIyMgU21hbGxlc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnY29udmVydHMgbGlua3MnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y29udmVydEh0bWxUb01hcmtkb3duKCc8YSBocmVmPVwiaHR0cHM6Ly9leGFtcGxlLmNvbVwiPkV4YW1wbGU8L2E+JyksXG5cdFx0XHQnW0V4YW1wbGVdKGh0dHBzOi8vZXhhbXBsZS5jb20pJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwcyBkYW5nZXJvdXMgc2NoZW1lcyBmcm9tIGxpbmtzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNvbnZlcnRIdG1sVG9NYXJrZG93bignPGEgaHJlZj1cImphdmFzY3JpcHQ6YWxlcnQoMSlcIj5jbGljazwvYT4nKSxcblx0XHRcdCdjbGljaydcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNvbnZlcnRIdG1sVG9NYXJrZG93bignPGEgaHJlZj1cInZic2NyaXB0OnJ1blwiPnJ1bjwvYT4nKSxcblx0XHRcdCdydW4nXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxhIGhyZWY9XCJkYXRhOnRleHQvaHRtbCw8aDE+aGk8L2gxPlwiPmRhdGE8L2E+JyksXG5cdFx0XHQnZGF0YSdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb252ZXJ0cyBib2xkIGFuZCBpdGFsaWMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnZlcnRIdG1sVG9NYXJrZG93bignPHN0cm9uZz5ib2xkPC9zdHJvbmc+JyksICcqKmJvbGQqKicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxiPmJvbGQ8L2I+JyksICcqKmJvbGQqKicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxlbT5pdGFsaWM8L2VtPicpLCAnKml0YWxpYyonKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udmVydEh0bWxUb01hcmtkb3duKCc8aT5pdGFsaWM8L2k+JyksICcqaXRhbGljKicpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb252ZXJ0cyBpbmxpbmUgY29kZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udmVydEh0bWxUb01hcmtkb3duKCc8Y29kZT5mb28oKTwvY29kZT4nKSwgJ2Bmb28oKWAnKTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIEhUTUwgdGFnIG5hbWVzIGluc2lkZSBpbmxpbmUgY29kZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udmVydEh0bWxUb01hcmtkb3duKCc8Y29kZT4mbHQ7YXNpZGUmZ3Q7PC9jb2RlPicpLCAnYDxhc2lkZT5gJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnZlcnRIdG1sVG9NYXJrZG93bignPGNvZGU+Jmx0O2RldGFpbHMmZ3Q7PC9jb2RlPicpLCAnYDxkZXRhaWxzPmAnKTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIEhUTUwgdGFnIG5hbWVzIGluc2lkZSBpbmxpbmUgY29kZSB3aXRoIG5lc3RlZCB0YWdzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNvbnZlcnRIdG1sVG9NYXJrZG93bignPGNvZGU+PHNwYW4gY2xhc3M9XCJobFwiPiZsdDthc2lkZSZndDs8L3NwYW4+PC9jb2RlPicpLFxuXHRcdFx0J2A8YXNpZGU+YCdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgSFRNTCB0YWcgbmFtZXMgaW5zaWRlIGNvZGUgYmxvY2tzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNvbnZlcnRIdG1sVG9NYXJrZG93bignPHByZT48Y29kZT4mbHQ7YXNpZGUmZ3Q7PC9jb2RlPjwvcHJlPicpLFxuXHRcdFx0J2BgYFxcbjxhc2lkZT5cXG5gYGAnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY29udmVydHMgY29kZSBibG9ja3MnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y29udmVydEh0bWxUb01hcmtkb3duKCc8cHJlPjxjb2RlPmNvbnN0IHggPSAxOzwvY29kZT48L3ByZT4nKSxcblx0XHRcdCdgYGBcXG5jb25zdCB4ID0gMTtcXG5gYGAnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY29udmVydHMgc3ludGF4LWhpZ2hsaWdodGVkIGNvZGUgYmxvY2tzIGJ5IHN0cmlwcGluZyBpbm5lciB0YWdzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNvbnZlcnRIdG1sVG9NYXJrZG93bignPHByZT48Y29kZT48c3BhbiBjbGFzcz1cImt3XCI+Y29uc3Q8L3NwYW4+IHggPSA8c3BhbiBjbGFzcz1cIm51bVwiPjE8L3NwYW4+OzwvY29kZT48L3ByZT4nKSxcblx0XHRcdCdgYGBcXG5jb25zdCB4ID0gMTtcXG5gYGAnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIGluZGVudGF0aW9uIGluIGNvZGUgYmxvY2tzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNvbnZlcnRIdG1sVG9NYXJrZG93bignPHByZT48Y29kZT5mdW5jdGlvbiBmb28oKSB7XFxuICByZXR1cm4gMTtcXG59PC9jb2RlPjwvcHJlPicpLFxuXHRcdFx0J2BgYFxcbmZ1bmN0aW9uIGZvbygpIHtcXG4gIHJldHVybiAxO1xcbn1cXG5gYGAnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY29udmVydHMgdW5vcmRlcmVkIGxpc3RzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGh0bWwgPSAnPHVsPjxsaT5vbmU8L2xpPjxsaT50d288L2xpPjxsaT50aHJlZTwvbGk+PC91bD4nO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oaHRtbCksICctIG9uZVxcbi0gdHdvXFxuLSB0aHJlZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb252ZXJ0cyBvcmRlcmVkIGxpc3RzIHRvIG51bWJlcmVkIGl0ZW1zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGh0bWwgPSAnPG9sPjxsaT5maXJzdDwvbGk+PGxpPnNlY29uZDwvbGk+PC9vbD4nO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oaHRtbCksICcxLiBmaXJzdFxcbjIuIHNlY29uZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb252ZXJ0cyBsaW5lIGJyZWFrcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udmVydEh0bWxUb01hcmtkb3duKCdoZWxsbzxicj53b3JsZCcpLCAnaGVsbG9cXG53b3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oJ2hlbGxvPGJyLz53b3JsZCcpLCAnaGVsbG9cXG53b3JsZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb252ZXJ0cyBob3Jpem9udGFsIHJ1bGVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oJ2Fib3ZlPGhyPmJlbG93JyksICdhYm92ZVxcbi0tLVxcbmJlbG93Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIHN0cmlrZXRocm91Z2gnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnZlcnRIdG1sVG9NYXJrZG93bignPGRlbD5yZW1vdmVkPC9kZWw+JyksICd+fnJlbW92ZWR+ficpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxzPnN0cnVjazwvcz4nKSwgJ35+c3RydWNrfn4nKTtcblx0fSk7XG5cblx0dGVzdCgnY29udmVydHMgYmxvY2txdW90ZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y29udmVydEh0bWxUb01hcmtkb3duKCc8YmxvY2txdW90ZT5xdW90ZWQgdGV4dDwvYmxvY2txdW90ZT4nKSxcblx0XHRcdCc+IHF1b3RlZCB0ZXh0J1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIGltYWdlcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxpbWcgc3JjPVwiaHR0cHM6Ly9leGFtcGxlLmNvbS9pbWcucG5nXCIgYWx0PVwicGhvdG9cIj4nKSxcblx0XHRcdCchW3Bob3RvXShodHRwczovL2V4YW1wbGUuY29tL2ltZy5wbmcpJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29kZXMgSFRNTCBlbnRpdGllcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udmVydEh0bWxUb01hcmtkb3duKCcmYW1wOyAmbHQ7ICZndDsgJnF1b3Q7ICYjMzk7JyksICcmIDwgPiBcIiBcXCcnKTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIHVua25vd24gdGFncycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udmVydEh0bWxUb01hcmtkb3duKCc8c3BhbiBjbGFzcz1cInhcIj5oZWxsbzwvc3Bhbj4nKSwgJ2hlbGxvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgbmVzdGVkIGlubGluZSBlbGVtZW50cycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxzdHJvbmc+PGVtPmJvbGQgaXRhbGljPC9lbT48L3N0cm9uZz4nKSxcblx0XHRcdCcqKipib2xkIGl0YWxpYyoqKidcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIGxpbmsgd2l0aCBib2xkIHRleHQgaW5zaWRlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNvbnZlcnRIdG1sVG9NYXJrZG93bignPGEgaHJlZj1cImh0dHBzOi8vZXhhbXBsZS5jb21cIj48c3Ryb25nPmNsaWNrIGhlcmU8L3N0cm9uZz48L2E+JyksXG5cdFx0XHQnWyoqY2xpY2sgaGVyZSoqXShodHRwczovL2V4YW1wbGUuY29tKSdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIGhlYWRpbmcgd2l0aCBsaW5rIGluc2lkZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxoMj48YSBocmVmPVwiaHR0cHM6Ly9leGFtcGxlLmNvbVwiPlRpdGxlPC9hPjwvaDI+JyksXG5cdFx0XHQnIyMgW1RpdGxlXShodHRwczovL2V4YW1wbGUuY29tKSdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2xsYXBzZXMgZXhjZXNzaXZlIG5ld2xpbmVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGh0bWwgPSAnPHA+b25lPC9wPjxwPjwvcD48cD48L3A+PHA+dHdvPC9wPic7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEh0bWxUb01hcmtkb3duKGh0bWwpO1xuXHRcdGFzc2VydC5vayghcmVzdWx0LmluY2x1ZGVzKCdcXG5cXG5cXG4nKSwgJ3Nob3VsZCBub3QgaGF2ZSAzKyBjb25zZWN1dGl2ZSBuZXdsaW5lcycpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ29uZScpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCd0d28nKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgYSByZWFsaXN0aWMgd2ViIHBhZ2Ugc25pcHBldCcsICgpID0+IHtcblx0XHRjb25zdCBodG1sID0gYFxuXHRcdFx0PGgxPkdldHRpbmcgU3RhcnRlZDwvaDE+XG5cdFx0XHQ8cD5XZWxjb21lIHRvIDxzdHJvbmc+VlMgQ29kZTwvc3Ryb25nPi4gVmlzaXQgPGEgaHJlZj1cImh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tXCI+dGhlIHdlYnNpdGU8L2E+IGZvciBtb3JlIGluZm8uPC9wPlxuXHRcdFx0PHVsPlxuXHRcdFx0XHQ8bGk+RmFzdDwvbGk+XG5cdFx0XHRcdDxsaT5FeHRlbnNpYmxlPC9saT5cblx0XHRcdDwvdWw+XG5cdFx0YDtcblx0XHRjb25zdCBtZCA9IGNvbnZlcnRIdG1sVG9NYXJrZG93bihodG1sKTtcblx0XHRhc3NlcnQub2sobWQuaW5jbHVkZXMoJyMgR2V0dGluZyBTdGFydGVkJykpO1xuXHRcdGFzc2VydC5vayhtZC5pbmNsdWRlcygnKipWUyBDb2RlKionKSk7XG5cdFx0YXNzZXJ0Lm9rKG1kLmluY2x1ZGVzKCdbdGhlIHdlYnNpdGVdKGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tKScpKTtcblx0XHRhc3NlcnQub2sobWQuaW5jbHVkZXMoJy0gRmFzdCcpKTtcblx0XHRhc3NlcnQub2sobWQuaW5jbHVkZXMoJy0gRXh0ZW5zaWJsZScpKTtcblx0fSk7XG5cblx0dGVzdCgnZGVjb2RlcyBudW1lcmljIEhUTUwgZW50aXRpZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnZlcnRIdG1sVG9NYXJrZG93bignJiM2MDt0YWcmIzYyOycpLCAnPHRhZz4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udmVydEh0bWxUb01hcmtkb3duKCcmI3gzQzt0YWcmI3gzRTsnKSwgJzx0YWc+Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnZlcnRIdG1sVG9NYXJrZG93bignJiM4MjEyOycpLCAnXHUyMDE0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnZlcnRIdG1sVG9NYXJrZG93bignJiN4MjAxNDsnKSwgJ1x1MjAxNCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIHRhZy1zdHJpcHBpbmcgZm9yIHZlcnkgbGFyZ2UgaW5wdXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGFyZ2UgPSAnPGI+JyArICd4Jy5yZXBlYXQoMjAwXzAwMSkgKyAnPC9iPic7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEh0bWxUb01hcmtkb3duKGxhcmdlKTtcblx0XHQvLyBTaG91bGQgc3RyaXAgdGFncyBidXQgTk9UIGFwcGx5IG1hcmtkb3duIGJvbGQgZm9ybWF0dGluZ1xuXHRcdGFzc2VydC5vayghcmVzdWx0LmluY2x1ZGVzKCcqKicpKTtcblx0XHRhc3NlcnQub2soIXJlc3VsdC5pbmNsdWRlcygnPGI+JykpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sa0JBQWtCLE1BQU07QUFDN0IsMENBQXdDO0FBRXhDLE9BQUsscUJBQXFCLE1BQU07QUFDL0IsV0FBTyxZQUFZLHNCQUFzQixnQkFBZ0IsR0FBRyxTQUFTO0FBQ3JFLFdBQU8sWUFBWSxzQkFBc0IsbUJBQW1CLEdBQUcsYUFBYTtBQUM1RSxXQUFPLFlBQVksc0JBQXNCLGtCQUFrQixHQUFHLGFBQWE7QUFDM0UsV0FBTyxZQUFZ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
