import assert from "assert";
import { fillInIncompleteTokens, renderMarkdown, renderAsPlaintext } from "../../browser/markdownRenderer.js";
import { MarkdownString } from "../../common/htmlContent.js";
import * as marked from "../../common/marked/marked.js";
import { parse } from "../../common/marshalling.js";
import { isWeb } from "../../common/platform.js";
import { URI } from "../../common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../common/utils.js";
function strToNode(str) {
  return new DOMParser().parseFromString(str, "text/html").body.firstChild;
}
function assertNodeEquals(actualNode, expectedHtml) {
  const expectedNode = strToNode(expectedHtml);
  assert.ok(
    actualNode.isEqualNode(expectedNode),
    `Expected: ${expectedNode.outerHTML}
Actual: ${actualNode.outerHTML}`
  );
}
suite("MarkdownRenderer", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  suite("Sanitization", () => {
    test("Should not render images with unknown schemes", () => {
      const markdown = { value: `![image](no-such://example.com/cat.gif)` };
      const result = store.add(renderMarkdown(markdown)).element;
      assert.strictEqual(result.innerHTML, '<p><img alt="image"></p>');
    });
    test("Strips links with disallowed schemes (default config)", () => {
      const markdown = { value: `Read [](vscode-agent-host://my-host/path/to/foo.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0)` };
      const result = store.add(renderMarkdown(markdown)).element;
      assert.strictEqual(result.querySelector("a"), null);
    });
    test("Preserves link when scheme is allowed via allowedLinkSchemes.augment", () => {
      const markdown = { value: `Read [](vscode-agent-host://my-host/path/to/foo.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0)` };
      const result = store.add(renderMarkdown(markdown, {
        sanitizerConfig: {
          allowedLinkSchemes: { augment: ["vscode-agent-host"] }
        }
      })).element;
      const anchor = result.querySelector("a");
      assert.ok(anchor, "expected <a> to be preserved when scheme is allowed");
      assert.strictEqual(anchor.dataset.href, "vscode-agent-host://my-host/path/to/foo.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0");
    });
    test("Transforms parsed link targets without changing labels, titles, or code", () => {
      const markdown = { value: '`[same](file:///same)` [a[b].ts](file:///same "file:///same") ![image](file:///same|width=10,height=20)' };
      const result = store.add(renderMarkdown(markdown, {
        transformUri: (href) => href === "file:///same" ? "https://example.com/a.ts" : href
      })).element;
      const anchor = result.querySelector("a");
      assert.deepStrictEqual(
        {
          anchorCount: result.querySelectorAll("a").length,
          text: anchor?.textContent,
          href: anchor?.dataset.href,
          title: anchor?.title,
          image: result.querySelector("img")?.src,
          imageWidth: result.querySelector("img")?.getAttribute("width"),
          imageHeight: result.querySelector("img")?.getAttribute("height")
        },
        {
          anchorCount: 1,
          text: "a[b].ts",
          href: "https://example.com/a.ts",
          title: "file:///same",
          image: "https://example.com/a.ts",
          imageWidth: "10",
          imageHeight: "20"
        }
      );
    });
  });
  suite("Images", () => {
    test("image rendering conforms to default", () => {
      const markdown = { value: `![image](http://example.com/cat.gif 'caption')` };
      const result = store.add(renderMarkdown(markdown)).element;
      assertNodeEquals(result, '<div><p><img title="caption" alt="image" src="http://example.com/cat.gif"></p></div>');
    });
    test("image rendering conforms to default without title", () => {
      const markdown = { value: `![image](http://example.com/cat.gif)` };
      const result = store.add(renderMarkdown(markdown)).element;
      assertNodeEquals(result, '<div><p><img alt="image" src="http://example.com/cat.gif"></p></div>');
    });
    test("image width from title params", () => {
      const result = store.add(renderMarkdown({ value: `![image](http://example.com/cat.gif|width=100px 'caption')` })).element;
      assertNodeEquals(result, `<div><p><img width="100" title="caption" alt="image" src="http://example.com/cat.gif"></p></div>`);
    });
    test("image height from title params", () => {
      const result = store.add(renderMarkdown({ value: `![image](http://example.com/cat.gif|height=100 'caption')` })).element;
      assertNodeEquals(result, `<div><p><img height="100" title="caption" alt="image" src="http://example.com/cat.gif"></p></div>`);
    });
    test("image width and height from title params", () => {
      const result = store.add(renderMarkdown({ value: `![image](http://example.com/cat.gif|height=200,width=100 'caption')` })).element;
      assertNodeEquals(result, `<div><p><img height="200" width="100" title="caption" alt="image" src="http://example.com/cat.gif"></p></div>`);
    });
    test("image with file uri should render as same origin uri", () => {
      if (isWeb) {
        return;
      }
      const result = store.add(renderMarkdown({ value: `![image](file:///images/cat.gif)` })).element;
      assertNodeEquals(result, '<div><p><img src="vscode-file://vscode-app/images/cat.gif" alt="image"></p></div>');
    });
  });
  suite("Code block renderer", () => {
    const simpleCodeBlockRenderer = (lang, code) => {
      const element = document.createElement("code");
      element.textContent = code;
      return Promise.resolve(element);
    };
    test("asyncRenderCallback should be invoked for code blocks", () => {
      const markdown = { value: "```js\n1 + 1;\n```" };
      return new Promise((resolve) => {
        store.add(renderMarkdown(markdown, {
          asyncRenderCallback: resolve,
          codeBlockRenderer: simpleCodeBlockRenderer
        }));
      });
    });
    test("asyncRenderCallback should not be invoked if result is immediately disposed", () => {
      const markdown = { value: "```js\n1 + 1;\n```" };
      return new Promise((resolve, reject) => {
        const result = renderMarkdown(markdown, {
          asyncRenderCallback: reject,
          codeBlockRenderer: simpleCodeBlockRenderer
        });
        result.dispose();
        setTimeout(resolve, 10);
      });
    });
    test("asyncRenderCallback should not be invoked if dispose is called before code block is rendered", () => {
      const markdown = { value: "```js\n1 + 1;\n```" };
      return new Promise((resolve, reject) => {
        let resolveCodeBlockRendering;
        const result = renderMarkdown(markdown, {
          asyncRenderCallback: reject,
          codeBlockRenderer: () => {
            return new Promise((resolve2) => {
              resolveCodeBlockRendering = resolve2;
            });
          }
        });
        setTimeout(() => {
          result.dispose();
          resolveCodeBlockRendering(document.createElement("code"));
          setTimeout(resolve, 10);
        }, 10);
      });
    });
    test("Code blocks should use leading language id (#157793)", async () => {
      const markdown = { value: "```js some other stuff\n1 + 1;\n```" };
      const lang = await new Promise((resolve) => {
        store.add(renderMarkdown(markdown, {
          codeBlockRenderer: async (lang2, value) => {
            resolve(lang2);
            return simpleCodeBlockRenderer(lang2, value);
          }
        }));
      });
      assert.strictEqual(lang, "js");
    });
  });
  suite("ThemeIcons Support On", () => {
    test("render appendText", () => {
      const mds = new MarkdownString(void 0, { supportThemeIcons: true });
      mds.appendText("$(zap) $(not a theme icon) $(add)");
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p>$(zap)&nbsp;$(not&nbsp;a&nbsp;theme&nbsp;icon)&nbsp;$(add)</p>`);
    });
    test("render appendMarkdown", () => {
      const mds = new MarkdownString(void 0, { supportThemeIcons: true });
      mds.appendMarkdown("$(zap) $(not a theme icon) $(add)");
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p><span class="codicon codicon-zap"></span> $(not a theme icon) <span class="codicon codicon-add"></span></p>`);
    });
    test("render appendMarkdown with escaped icon", () => {
      const mds = new MarkdownString(void 0, { supportThemeIcons: true });
      mds.appendMarkdown("\\$(zap) $(not a theme icon) $(add)");
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p>$(zap) $(not a theme icon) <span class="codicon codicon-add"></span></p>`);
    });
    test("render icon in link", () => {
      const mds = new MarkdownString(void 0, { supportThemeIcons: true });
      mds.appendMarkdown(`[$(zap)-link](#link)`);
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p><a href="" title="#link" draggable="false" data-href="#link"><span class="codicon codicon-zap"></span>-link</a></p>`);
    });
    test("render icon in table", () => {
      const mds = new MarkdownString(void 0, { supportThemeIcons: true });
      mds.appendMarkdown(`
| text   | text                 |
|--------|----------------------|
| $(zap) | [$(zap)-link](#link) |`);
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<table>
<thead>
<tr>
<th>text</th>
<th>text</th>
</tr>
</thead>
<tbody><tr>
<td><span class="codicon codicon-zap"></span></td>
<td><a href="" title="#link" draggable="false" data-href="#link"><span class="codicon codicon-zap"></span>-link</a></td>
</tr>
</tbody></table>
`);
    });
    test("render icon in <a> without href (#152170)", () => {
      const mds = new MarkdownString(void 0, { supportThemeIcons: true, supportHtml: true });
      mds.appendMarkdown(`<a>$(sync)</a>`);
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p><span class="codicon codicon-sync"></span></p>`);
    });
  });
  suite("ThemeIcons Support Off", () => {
    test("render appendText", () => {
      const mds = new MarkdownString(void 0, { supportThemeIcons: false });
      mds.appendText("$(zap) $(not a theme icon) $(add)");
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p>$(zap)&nbsp;$(not&nbsp;a&nbsp;theme&nbsp;icon)&nbsp;$(add)</p>`);
    });
    test("render appendMarkdown with escaped icon", () => {
      const mds = new MarkdownString(void 0, { supportThemeIcons: false });
      mds.appendMarkdown("\\$(zap) $(not a theme icon) $(add)");
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p>$(zap) $(not a theme icon) $(add)</p>`);
    });
  });
  suite("Alerts", () => {
    test("Should render alert with data-severity attribute and icon", () => {
      const markdown = new MarkdownString("> [!NOTE]\n> This is a note alert", { supportAlertSyntax: true });
      const result = store.add(renderMarkdown(markdown)).element;
      const blockquote = result.querySelector('blockquote[data-severity="note"]');
      assert.ok(blockquote, 'Should have blockquote with data-severity="note"');
      assert.ok(result.innerHTML.includes("This is a note alert"), "Should contain alert text");
      assert.ok(result.innerHTML.includes("codicon-info"), "Should contain info icon");
    });
    test("Should render regular blockquote when supportAlertSyntax is disabled", () => {
      const markdown = new MarkdownString("> [!NOTE]\n> This should be a regular blockquote");
      const result = store.add(renderMarkdown(markdown)).element;
      const blockquote = result.querySelector("blockquote");
      assert.ok(blockquote, "Should have blockquote");
      assert.strictEqual(blockquote?.getAttribute("data-severity"), null, "Should not have data-severity attribute");
      assert.ok(result.innerHTML.includes("[!NOTE]"), "Should contain literal [!NOTE] text");
    });
    test("Should not transform blockquotes without alert syntax", () => {
      const markdown = new MarkdownString("> This is a regular blockquote", { supportAlertSyntax: true });
      const result = store.add(renderMarkdown(markdown)).element;
      const blockquote = result.querySelector("blockquote");
      assert.strictEqual(blockquote?.getAttribute("data-severity"), null, "Should not have data-severity attribute");
    });
  });
  test("npm Hover Run Script not working #90855", function() {
    const md = JSON.parse('{"value":"[Run Script](command:npm.runScriptFromHover?%7B%22documentUri%22%3A%7B%22%24mid%22%3A1%2C%22fsPath%22%3A%22c%3A%5C%5CUsers%5C%5Cjrieken%5C%5CCode%5C%5C_sample%5C%5Cfoo%5C%5Cpackage.json%22%2C%22_sep%22%3A1%2C%22external%22%3A%22file%3A%2F%2F%2Fc%253A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22path%22%3A%22%2Fc%3A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22scheme%22%3A%22file%22%7D%2C%22script%22%3A%22echo%22%7D \\"Run the script as a task\\")","supportThemeIcons":false,"isTrusted":true,"uris":{"__uri_e49443":{"$mid":1,"fsPath":"c:\\\\Users\\\\jrieken\\\\Code\\\\_sample\\\\foo\\\\package.json","_sep":1,"external":"file:///c%3A/Users/jrieken/Code/_sample/foo/package.json","path":"/c:/Users/jrieken/Code/_sample/foo/package.json","scheme":"file"},"command:npm.runScriptFromHover?%7B%22documentUri%22%3A%7B%22%24mid%22%3A1%2C%22fsPath%22%3A%22c%3A%5C%5CUsers%5C%5Cjrieken%5C%5CCode%5C%5C_sample%5C%5Cfoo%5C%5Cpackage.json%22%2C%22_sep%22%3A1%2C%22external%22%3A%22file%3A%2F%2F%2Fc%253A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22path%22%3A%22%2Fc%3A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22scheme%22%3A%22file%22%7D%2C%22script%22%3A%22echo%22%7D":{"$mid":1,"path":"npm.runScriptFromHover","scheme":"command","query":"{\\"documentUri\\":\\"__uri_e49443\\",\\"script\\":\\"echo\\"}"}}}');
    const element = store.add(renderMarkdown(md)).element;
    const anchor = element.querySelector("a");
    assert.ok(anchor);
    assert.ok(anchor.dataset["href"]);
    const uri = URI.parse(anchor.dataset["href"]);
    const data = parse(decodeURIComponent(uri.query));
    assert.ok(data);
    assert.strictEqual(data.script, "echo");
    assert.ok(data.documentUri.toString().startsWith("file:///c%3A/"));
  });
  test("Should not render command links by default", () => {
    const md = new MarkdownString(`[command1](command:doFoo) <a href="command:doFoo">command2</a>`, {
      supportHtml: true
    });
    const result = store.add(renderMarkdown(md)).element;
    assert.strictEqual(result.innerHTML, `<p>command1 command2</p>`);
  });
  test("Should render command links in trusted strings", () => {
    const md = new MarkdownString(`[command1](command:doFoo) <a href="command:doFoo">command2</a>`, {
      isTrusted: true,
      supportHtml: true
    });
    const result = store.add(renderMarkdown(md)).element;
    assert.strictEqual(result.innerHTML, `<p><a href="" title="" draggable="false" data-href="command:doFoo">command1</a> <a href="" data-href="command:doFoo">command2</a></p>`);
  });
  test("Should remove relative links if there is no base url", () => {
    const md = new MarkdownString(`[text](./foo) <a href="./bar">bar</a>`, {
      isTrusted: true,
      supportHtml: true
    });
    const result = store.add(renderMarkdown(md)).element;
    assert.strictEqual(result.innerHTML, `<p>text bar</p>`);
  });
  test("Should support relative links if baseurl is set", () => {
    const md = new MarkdownString(`[text](./foo) <a href="./bar">bar</a> <img src="cat.gif">`, {
      isTrusted: true,
      supportHtml: true
    });
    md.baseUri = URI.parse("https://example.com/path/");
    const result = store.add(renderMarkdown(md)).element;
    assert.strictEqual(result.innerHTML, `<p><a href="" title="./foo" draggable="false" data-href="https://example.com/path/foo">text</a> <a href="" data-href="https://example.com/path/bar">bar</a> <img src="https://example.com/path/cat.gif"></p>`);
  });
  test("Should use decoded file path as title for file:// links", () => {
    const fileUri = URI.file("/home/user/project/lib.d.ts");
    const md = new MarkdownString(`[log](${fileUri.toString()})`, {});
    const result = store.add(renderMarkdown(md)).element;
    const anchor = result.querySelector("a");
    assert.ok(anchor);
    assert.strictEqual(anchor.title, fileUri.fsPath);
  });
  test("Should include fragment in title for file:// links with line numbers", () => {
    const fileUri = URI.file("/home/user/project/lib.d.ts");
    const md = new MarkdownString(`[log](${fileUri.toString()}#L42)`, {});
    const result = store.add(renderMarkdown(md)).element;
    const anchor = result.querySelector("a");
    assert.ok(anchor);
    assert.strictEqual(anchor.title, `${fileUri.fsPath}#L42`);
  });
  test("Should not override explicit title for file:// links", () => {
    const fileUri = URI.file("/home/user/project/lib.d.ts");
    const md = new MarkdownString(`[log](${fileUri.toString()} "Go to definition")`, {});
    const result = store.add(renderMarkdown(md)).element;
    const anchor = result.querySelector("a");
    assert.ok(anchor);
    assert.strictEqual(anchor.title, "Go to definition");
  });
  suite("PlaintextMarkdownRender", () => {
    test("test code, blockquote, heading, list, listitem, paragraph, table, tablerow, tablecell, strong, em, br, del, text are rendered plaintext", () => {
      const markdown = { value: "`code`\n>quote\n# heading\n- list\n\ntable | table2\n--- | --- \none | two\n\n\nbo**ld**\n_italic_\n~~del~~\nsome text" };
      const expected = "code\nquote\nheading\nlist\n\ntable table2\none two\nbold\nitalic\ndel\nsome text";
      const result = renderAsPlaintext(markdown);
      assert.strictEqual(result, expected);
    });
    test("test html, hr, image, link are rendered plaintext", () => {
      const markdown = { value: "<div>html</div>\n\n---\n![image](imageLink)\n[text](textLink)" };
      const expected = "text";
      const result = renderAsPlaintext(markdown);
      assert.strictEqual(result, expected);
    });
    test(`Should not remove html inside of code blocks`, () => {
      const markdown = {
        value: [
          "```html",
          "<form>html</form>",
          "```"
        ].join("\n")
      };
      const expected = [
        "```",
        "<form>html</form>",
        "```"
      ].join("\n");
      const result = renderAsPlaintext(markdown, { includeCodeBlocksFences: true });
      assert.strictEqual(result, expected);
    });
    test("does not double-escape entities inside code spans", () => {
      assert.strictEqual(renderAsPlaintext({ value: "Run `tests & build`" }), "Run tests & build");
      assert.strictEqual(renderAsPlaintext({ value: "Use `<form>` tag" }), "Use <form> tag");
    });
  });
  suite("supportHtml", () => {
    test("supportHtml is disabled by default", () => {
      const mds = new MarkdownString(void 0, {});
      mds.appendMarkdown("a<b>b</b>c");
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p>abc</p>`);
    });
    test("Renders html when supportHtml=true", () => {
      const mds = new MarkdownString(void 0, { supportHtml: true });
      mds.appendMarkdown("a<b>b</b>c");
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p>a<b>b</b>c</p>`);
    });
    test("Should not include scripts even when supportHtml=true", () => {
      const mds = new MarkdownString(void 0, { supportHtml: true });
      mds.appendMarkdown('a<b onclick="alert(1)">b</b><script>alert(2)<\/script>c');
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p>a<b>b</b>c</p>`);
    });
    test("Should not render html appended as text", () => {
      const mds = new MarkdownString(void 0, { supportHtml: true });
      mds.appendText("a<b>b</b>c");
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p>a&lt;b&gt;b&lt;/b&gt;c</p>`);
    });
    test("Should render html images", () => {
      if (isWeb) {
        return;
      }
      const mds = new MarkdownString(void 0, { supportHtml: true });
      mds.appendMarkdown(`<img src="http://example.com/cat.gif">`);
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<img src="http://example.com/cat.gif">`);
    });
    test("Should render html images with file uri as same origin uri", () => {
      if (isWeb) {
        return;
      }
      const mds = new MarkdownString(void 0, { supportHtml: true });
      mds.appendMarkdown(`<img src="file:///images/cat.gif">`);
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<img src="vscode-file://vscode-app/images/cat.gif">`);
    });
    test("Should only allow checkbox inputs", () => {
      const mds = new MarkdownString(
        'text: <input type="text">\ncheckbox:<input type="checkbox">',
        { supportHtml: true }
      );
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p>text: 
checkbox:<input type="checkbox" disabled=""></p>`);
    });
  });
  suite("fillInIncompleteTokens", () => {
    function ignoreRaw(...tokenLists) {
      tokenLists.forEach((tokens) => {
        tokens.forEach((t) => t.raw = "");
      });
    }
    const completeTable = "| a | b |\n| --- | --- |";
    suite("table", () => {
      test("complete table", () => {
        const tokens = marked.marked.lexer(completeTable);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.equal(newTokens, tokens);
      });
      test("full header only", () => {
        const incompleteTable = "| a | b |";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(completeTable);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("full header only with trailing space", () => {
        const incompleteTable = "| a | b | ";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(completeTable);
        const newTokens = fillInIncompleteTokens(tokens);
        if (newTokens) {
          ignoreRaw(newTokens, completeTableTokens);
        }
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("incomplete header", () => {
        const incompleteTable = "| a | b";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(completeTable);
        const newTokens = fillInIncompleteTokens(tokens);
        if (newTokens) {
          ignoreRaw(newTokens, completeTableTokens);
        }
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("incomplete header one column", () => {
        const incompleteTable = "| a ";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(incompleteTable + "|\n| --- |");
        const newTokens = fillInIncompleteTokens(tokens);
        if (newTokens) {
          ignoreRaw(newTokens, completeTableTokens);
        }
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("full header with extras", () => {
        const incompleteTable = "| a **bold** | b _italics_ |";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(incompleteTable + "\n| --- | --- |");
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("full header with leading text", () => {
        const incompleteTable = "here is a table\n| a | b |";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(incompleteTable + "\n| --- | --- |");
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("full header with leading other stuff", () => {
        const incompleteTable = "```js\nconst xyz = 123;\n```\n| a | b |";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(incompleteTable + "\n| --- | --- |");
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("full header with incomplete separator", () => {
        const incompleteTable = "| a | b |\n| ---";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(completeTable);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("full header with incomplete separator 2", () => {
        const incompleteTable = "| a | b |\n| --- |";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(completeTable);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("full header with incomplete separator 3", () => {
        const incompleteTable = "| a | b |\n|";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(completeTable);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("not a table", () => {
        const incompleteTable = "| a | b |\nsome text";
        const tokens = marked.marked.lexer(incompleteTable);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test("not a table 2", () => {
        const incompleteTable = "| a | b |\n| --- |\nsome text";
        const tokens = marked.marked.lexer(incompleteTable);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
    });
    function simpleMarkdownTestSuite(name, delimiter) {
      test(`incomplete ${name}`, () => {
        const incomplete = `${delimiter}code`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + delimiter);
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test(`complete ${name}`, () => {
        const text = `leading text ${delimiter}code${delimiter} trailing text`;
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test(`${name} with leading text`, () => {
        const incomplete = `some text and ${delimiter}some code`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + delimiter);
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test(`${name} with trailing space`, () => {
        const incomplete = `some text and ${delimiter}some code `;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete.trimEnd() + delimiter);
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test(`single loose "${delimiter}"`, () => {
        const text = `some text and ${delimiter}by itself
more text here`;
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test(`incomplete ${name} after newline`, () => {
        const text = `some text
more text here and ${delimiter}text`;
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(text + delimiter);
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test(`incomplete after complete ${name}`, () => {
        const text = `leading text ${delimiter}code${delimiter} trailing text and ${delimiter}another`;
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(text + delimiter);
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test(`incomplete ${name} in list`, () => {
        const text = `- list item one
- list item two and ${delimiter}text`;
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(text + delimiter);
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test(`incomplete ${name} in asterisk list`, () => {
        const text = `* list item one
* list item two and ${delimiter}text`;
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(text + delimiter);
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test(`incomplete ${name} in numbered list`, () => {
        const text = `1. list item one
2. list item two and ${delimiter}text`;
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(text + delimiter);
        assert.deepStrictEqual(newTokens, completeTokens);
      });
    }
    suite("list", () => {
      test("list with complete codeblock", () => {
        const list = `-
	\`\`\`js
	let x = 1;
	\`\`\`
- list item two
`;
        const tokens = marked.marked.lexer(list);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test.skip("list with incomplete codeblock", () => {
        const incomplete = `- list item one

	\`\`\`js
	let x = 1;`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "\n	```");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("list with subitems", () => {
        const list = `- hello
	- sub item
- text
	newline for some reason
`;
        const tokens = marked.marked.lexer(list);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test("ordered list with subitems", () => {
        const list = `1. hello
	- sub item
2. text
	newline for some reason
`;
        const tokens = marked.marked.lexer(list);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test("list with stuff", () => {
        const list = `- list item one \`codespan\` **bold** [link](http://microsoft.com) more text`;
        const tokens = marked.marked.lexer(list);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test("list with incomplete link text", () => {
        const incomplete = `- list item one
- item two [link`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "](https://microsoft.com)");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("list with incomplete link target", () => {
        const incomplete = `- list item one
- item two [link](`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("ordered list with incomplete link target", () => {
        const incomplete = `1. list item one
2. item two [link](`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("ordered list with extra whitespace", () => {
        const incomplete = `1. list item one
2. item two [link](`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("list with extra whitespace", () => {
        const incomplete = `- list item one
- item two [link](`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("list with incomplete link with other stuff", () => {
        const incomplete = `- list item one
- item two [\`link`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "`](https://microsoft.com)");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("ordered list with incomplete link with other stuff", () => {
        const incomplete = `1. list item one
1. item two [\`link`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "`](https://microsoft.com)");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("list with bold incomplete link target", () => {
        const incomplete = `- list item one
- **[link](http://microsoft`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")**");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("ordered list with bold incomplete link target", () => {
        const incomplete = `1. list item one
2. **[link](http://microsoft`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")**");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("list with incomplete subitem", () => {
        const incomplete = `1. list item one
	- `;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "&nbsp;");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("list with incomplete nested subitem", () => {
        const incomplete = `1. list item one
	- item 2
		- `;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "&nbsp;");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("text with start of list is not a heading", () => {
        const incomplete = `hello
- `;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + " &nbsp;");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("even more text with start of list is not a heading", () => {
        const incomplete = `# hello

text
-`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + " &nbsp;");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
    });
    suite("blockquote", () => {
      test("incomplete double star", () => {
        const incomplete = "> **text";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "**");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete double star before trailing quote-only lines", () => {
        const incomplete = "> **text\n>\n>";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer("> **text**\n>\n>");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("preserves reference links when completing inline tokens", () => {
        const incomplete = "[id]: https://example.com\n\n> [label][id] **text";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "**");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
    });
    suite("codespan", () => {
      simpleMarkdownTestSuite("codespan", "`");
      test(`backtick between letters`, () => {
        const text = "a`b";
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeCodespanTokens = marked.marked.lexer(text + "`");
        assert.deepStrictEqual(newTokens, completeCodespanTokens);
      });
      test(`nested pattern`, () => {
        const text = "sldkfjsd `abc __def__ ghi";
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(text + "`");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("codespan inside <body> wrapped markdown", () => {
        const text = "<body>\n\nCreated isolated worktree for branch `xyz\n\n</body>";
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer("<body>\n\nCreated isolated worktree for branch `xyz`\n\n</body>");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
    });
    suite("star", () => {
      simpleMarkdownTestSuite("star", "*");
      test(`star between letters`, () => {
        const text = "sldkfjsd a*b";
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(text + "*");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test(`nested pattern`, () => {
        const text = "sldkfjsd *abc __def__ ghi";
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(text + "*");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
    });
    suite("double star", () => {
      simpleMarkdownTestSuite("double star", "**");
      test(`double star between letters`, () => {
        const text = "a**b";
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(text + "**");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test.skip(`ending in doublestar`, () => {
        const incomplete = `some text and **`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete.trimEnd() + "**");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
    });
    suite("underscore", () => {
      simpleMarkdownTestSuite("underscore", "_");
      test(`underscore between letters`, () => {
        const text = `this_not_italics`;
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
    });
    suite("double underscore", () => {
      simpleMarkdownTestSuite("double underscore", "__");
      test(`double underscore between letters`, () => {
        const text = `this__not__bold`;
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
    });
    suite("link", () => {
      test("incomplete link text", () => {
        const incomplete = "abc [text";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "](https://microsoft.com)");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target", () => {
        const incomplete = "foo [text](http://microsoft";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target 2", () => {
        const incomplete = "foo [text](http://microsoft.com";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target inside parentheses", () => {
        const incomplete = "([text](http://microsoft.com";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target with extra stuff", () => {
        const incomplete = "[before `text` after](http://microsoft.com";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target with extra stuff and incomplete arg", () => {
        const incomplete = '[before `text` after](http://microsoft.com "more text ';
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + '")');
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target with incomplete arg", () => {
        const incomplete = 'foo [text](http://microsoft.com "more text here ';
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + '")');
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target with incomplete arg 2", () => {
        const incomplete = '[text](command:vscode.openRelativePath "arg';
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + '")');
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target with complete arg", () => {
        const incomplete = 'foo [text](http://microsoft.com "more text here"';
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("link text with incomplete codespan", () => {
        const incomplete = `text [\`codespan`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "`](https://microsoft.com)");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("link text with incomplete stuff", () => {
        const incomplete = `text [more text \`codespan\` text **bold`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "**](https://microsoft.com)");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("Looks like incomplete link target but isn't", () => {
        const complete = "**bold** `codespan` text](";
        const tokens = marked.marked.lexer(complete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(complete);
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link in list", () => {
        const incomplete = "- [text";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "](https://microsoft.com)");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target inside bold", () => {
        const incomplete = "**[text](http://microsoft";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")**");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target with arg inside bold", () => {
        const incomplete = '**[text](http://microsoft.com "more text ';
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + '")**');
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("square brace between letters", () => {
        const incomplete = "a[b";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test("square brace on previous line", () => {
        const incomplete = "text[\nmore text";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test("square braces in text", () => {
        const incomplete = "hello [what] is going on";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test("complete link", () => {
        const incomplete = "text [link](http://microsoft.com)";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9icm93c2VyL21hcmtkb3duUmVuZGVyZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGZpbGxJbkluY29tcGxldGVUb2tlbnMsIHJlbmRlck1hcmtkb3duLCByZW5kZXJBc1BsYWludGV4dCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCAqIGFzIG1hcmtlZCBmcm9tICcuLi8uLi9jb21tb24vbWFya2VkL21hcmtlZC5qcyc7XG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uL2NvbW1vbi91dGlscy5qcyc7XG5cbmZ1bmN0aW9uIHN0clRvTm9kZShzdHI6IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcblx0cmV0dXJuIG5ldyBET01QYXJzZXIoKS5wYXJzZUZyb21TdHJpbmcoc3RyLCAndGV4dC9odG1sJykuYm9keS5maXJzdENoaWxkIGFzIEhUTUxFbGVtZW50O1xufVxuXG5mdW5jdGlvbiBhc3NlcnROb2RlRXF1YWxzKGFjdHVhbE5vZGU6IEhUTUxFbGVtZW50LCBleHBlY3RlZEh0bWw6IHN0cmluZykge1xuXHRjb25zdCBleHBlY3RlZE5vZGUgPSBzdHJUb05vZGUoZXhwZWN0ZWRIdG1sKTtcblx0YXNzZXJ0Lm9rKFxuXHRcdGFjdHVhbE5vZGUuaXNFcXVhbE5vZGUoZXhwZWN0ZWROb2RlKSxcblx0XHRgRXhwZWN0ZWQ6ICR7ZXhwZWN0ZWROb2RlLm91dGVySFRNTH1cXG5BY3R1YWw6ICR7YWN0dWFsTm9kZS5vdXRlckhUTUx9YCk7XG59XG5cbnN1aXRlKCdNYXJrZG93blJlbmRlcmVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ1Nhbml0aXphdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdTaG91bGQgbm90IHJlbmRlciBpbWFnZXMgd2l0aCB1bmtub3duIHNjaGVtZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXJrZG93biA9IHsgdmFsdWU6IGAhW2ltYWdlXShuby1zdWNoOi8vZXhhbXBsZS5jb20vY2F0LmdpZilgIH07XG5cdFx0XHRjb25zdCByZXN1bHQ6IEhUTUxFbGVtZW50ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1hcmtkb3duKSkuZWxlbWVudDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5uZXJIVE1MLCAnPHA+PGltZyBhbHQ9XCJpbWFnZVwiPjwvcD4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1N0cmlwcyBsaW5rcyB3aXRoIGRpc2FsbG93ZWQgc2NoZW1lcyAoZGVmYXVsdCBjb25maWcpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSB7IHZhbHVlOiBgUmVhZCBbXSh2c2NvZGUtYWdlbnQtaG9zdDovL215LWhvc3QvcGF0aC90by9mb28udHM/X2FoJTNEZXlKelkyaGxiV1VpT2lKbWFXeGxJbjApYCB9O1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBIVE1MRWxlbWVudCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtYXJrZG93bikpLmVsZW1lbnQ7XG5cdFx0XHQvLyBObyA8YT4gZWxlbWVudCBzaG91bGQgcmVtYWluIGJlY2F1c2UgdGhlIHNjaGVtZSBpc24ndCBhbGxvd2VkLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5xdWVyeVNlbGVjdG9yKCdhJyksIG51bGwpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnUHJlc2VydmVzIGxpbmsgd2hlbiBzY2hlbWUgaXMgYWxsb3dlZCB2aWEgYWxsb3dlZExpbmtTY2hlbWVzLmF1Z21lbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXJrZG93biA9IHsgdmFsdWU6IGBSZWFkIFtdKHZzY29kZS1hZ2VudC1ob3N0Oi8vbXktaG9zdC9wYXRoL3RvL2Zvby50cz9fYWglM0RleUp6WTJobGJXVWlPaUptYVd4bEluMClgIH07XG5cdFx0XHRjb25zdCByZXN1bHQ6IEhUTUxFbGVtZW50ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1hcmtkb3duLCB7XG5cdFx0XHRcdHNhbml0aXplckNvbmZpZzoge1xuXHRcdFx0XHRcdGFsbG93ZWRMaW5rU2NoZW1lczogeyBhdWdtZW50OiBbJ3ZzY29kZS1hZ2VudC1ob3N0J10gfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pKS5lbGVtZW50O1xuXHRcdFx0Y29uc3QgYW5jaG9yID0gcmVzdWx0LnF1ZXJ5U2VsZWN0b3IoJ2EnKTtcblx0XHRcdGFzc2VydC5vayhhbmNob3IsICdleHBlY3RlZCA8YT4gdG8gYmUgcHJlc2VydmVkIHdoZW4gc2NoZW1lIGlzIGFsbG93ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhbmNob3IhLmRhdGFzZXQuaHJlZiwgJ3ZzY29kZS1hZ2VudC1ob3N0Oi8vbXktaG9zdC9wYXRoL3RvL2Zvby50cz9fYWglM0RleUp6WTJobGJXVWlPaUptYVd4bEluMCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnVHJhbnNmb3JtcyBwYXJzZWQgbGluayB0YXJnZXRzIHdpdGhvdXQgY2hhbmdpbmcgbGFiZWxzLCB0aXRsZXMsIG9yIGNvZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXJrZG93biA9IHsgdmFsdWU6ICdgW3NhbWVdKGZpbGU6Ly8vc2FtZSlgIFthW2JdLnRzXShmaWxlOi8vL3NhbWUgXCJmaWxlOi8vL3NhbWVcIikgIVtpbWFnZV0oZmlsZTovLy9zYW1lfHdpZHRoPTEwLGhlaWdodD0yMCknIH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWFya2Rvd24sIHtcblx0XHRcdFx0dHJhbnNmb3JtVXJpOiBocmVmID0+IGhyZWYgPT09ICdmaWxlOi8vL3NhbWUnID8gJ2h0dHBzOi8vZXhhbXBsZS5jb20vYS50cycgOiBocmVmLFxuXHRcdFx0fSkpLmVsZW1lbnQ7XG5cdFx0XHRjb25zdCBhbmNob3IgPSByZXN1bHQucXVlcnlTZWxlY3RvcignYScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGFuY2hvckNvdW50OiByZXN1bHQucXVlcnlTZWxlY3RvckFsbCgnYScpLmxlbmd0aCxcblx0XHRcdFx0XHR0ZXh0OiBhbmNob3I/LnRleHRDb250ZW50LFxuXHRcdFx0XHRcdGhyZWY6IGFuY2hvcj8uZGF0YXNldC5ocmVmLFxuXHRcdFx0XHRcdHRpdGxlOiBhbmNob3I/LnRpdGxlLFxuXHRcdFx0XHRcdGltYWdlOiByZXN1bHQucXVlcnlTZWxlY3RvcignaW1nJyk/LnNyYyxcblx0XHRcdFx0XHRpbWFnZVdpZHRoOiByZXN1bHQucXVlcnlTZWxlY3RvcignaW1nJyk/LmdldEF0dHJpYnV0ZSgnd2lkdGgnKSxcblx0XHRcdFx0XHRpbWFnZUhlaWdodDogcmVzdWx0LnF1ZXJ5U2VsZWN0b3IoJ2ltZycpPy5nZXRBdHRyaWJ1dGUoJ2hlaWdodCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YW5jaG9yQ291bnQ6IDEsXG5cdFx0XHRcdFx0dGV4dDogJ2FbYl0udHMnLFxuXHRcdFx0XHRcdGhyZWY6ICdodHRwczovL2V4YW1wbGUuY29tL2EudHMnLFxuXHRcdFx0XHRcdHRpdGxlOiAnZmlsZTovLy9zYW1lJyxcblx0XHRcdFx0XHRpbWFnZTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vYS50cycsXG5cdFx0XHRcdFx0aW1hZ2VXaWR0aDogJzEwJyxcblx0XHRcdFx0XHRpbWFnZUhlaWdodDogJzIwJyxcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdJbWFnZXMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnaW1hZ2UgcmVuZGVyaW5nIGNvbmZvcm1zIHRvIGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXJrZG93biA9IHsgdmFsdWU6IGAhW2ltYWdlXShodHRwOi8vZXhhbXBsZS5jb20vY2F0LmdpZiAnY2FwdGlvbicpYCB9O1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBIVE1MRWxlbWVudCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtYXJrZG93bikpLmVsZW1lbnQ7XG5cdFx0XHRhc3NlcnROb2RlRXF1YWxzKHJlc3VsdCwgJzxkaXY+PHA+PGltZyB0aXRsZT1cImNhcHRpb25cIiBhbHQ9XCJpbWFnZVwiIHNyYz1cImh0dHA6Ly9leGFtcGxlLmNvbS9jYXQuZ2lmXCI+PC9wPjwvZGl2PicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW1hZ2UgcmVuZGVyaW5nIGNvbmZvcm1zIHRvIGRlZmF1bHQgd2l0aG91dCB0aXRsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hcmtkb3duID0geyB2YWx1ZTogYCFbaW1hZ2VdKGh0dHA6Ly9leGFtcGxlLmNvbS9jYXQuZ2lmKWAgfTtcblx0XHRcdGNvbnN0IHJlc3VsdDogSFRNTEVsZW1lbnQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWFya2Rvd24pKS5lbGVtZW50O1xuXHRcdFx0YXNzZXJ0Tm9kZUVxdWFscyhyZXN1bHQsICc8ZGl2PjxwPjxpbWcgYWx0PVwiaW1hZ2VcIiBzcmM9XCJodHRwOi8vZXhhbXBsZS5jb20vY2F0LmdpZlwiPjwvcD48L2Rpdj4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ltYWdlIHdpZHRoIGZyb20gdGl0bGUgcGFyYW1zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBIVE1MRWxlbWVudCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bih7IHZhbHVlOiBgIVtpbWFnZV0oaHR0cDovL2V4YW1wbGUuY29tL2NhdC5naWZ8d2lkdGg9MTAwcHggJ2NhcHRpb24nKWAgfSkpLmVsZW1lbnQ7XG5cdFx0XHRhc3NlcnROb2RlRXF1YWxzKHJlc3VsdCwgYDxkaXY+PHA+PGltZyB3aWR0aD1cIjEwMFwiIHRpdGxlPVwiY2FwdGlvblwiIGFsdD1cImltYWdlXCIgc3JjPVwiaHR0cDovL2V4YW1wbGUuY29tL2NhdC5naWZcIj48L3A+PC9kaXY+YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbWFnZSBoZWlnaHQgZnJvbSB0aXRsZSBwYXJhbXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IEhUTUxFbGVtZW50ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKHsgdmFsdWU6IGAhW2ltYWdlXShodHRwOi8vZXhhbXBsZS5jb20vY2F0LmdpZnxoZWlnaHQ9MTAwICdjYXB0aW9uJylgIH0pKS5lbGVtZW50O1xuXHRcdFx0YXNzZXJ0Tm9kZUVxdWFscyhyZXN1bHQsIGA8ZGl2PjxwPjxpbWcgaGVpZ2h0PVwiMTAwXCIgdGl0bGU9XCJjYXB0aW9uXCIgYWx0PVwiaW1hZ2VcIiBzcmM9XCJodHRwOi8vZXhhbXBsZS5jb20vY2F0LmdpZlwiPjwvcD48L2Rpdj5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ltYWdlIHdpZHRoIGFuZCBoZWlnaHQgZnJvbSB0aXRsZSBwYXJhbXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IEhUTUxFbGVtZW50ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKHsgdmFsdWU6IGAhW2ltYWdlXShodHRwOi8vZXhhbXBsZS5jb20vY2F0LmdpZnxoZWlnaHQ9MjAwLHdpZHRoPTEwMCAnY2FwdGlvbicpYCB9KSkuZWxlbWVudDtcblx0XHRcdGFzc2VydE5vZGVFcXVhbHMocmVzdWx0LCBgPGRpdj48cD48aW1nIGhlaWdodD1cIjIwMFwiIHdpZHRoPVwiMTAwXCIgdGl0bGU9XCJjYXB0aW9uXCIgYWx0PVwiaW1hZ2VcIiBzcmM9XCJodHRwOi8vZXhhbXBsZS5jb20vY2F0LmdpZlwiPjwvcD48L2Rpdj5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ltYWdlIHdpdGggZmlsZSB1cmkgc2hvdWxkIHJlbmRlciBhcyBzYW1lIG9yaWdpbiB1cmknLCAoKSA9PiB7XG5cdFx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0OiBIVE1MRWxlbWVudCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bih7IHZhbHVlOiBgIVtpbWFnZV0oZmlsZTovLy9pbWFnZXMvY2F0LmdpZilgIH0pKS5lbGVtZW50O1xuXHRcdFx0YXNzZXJ0Tm9kZUVxdWFscyhyZXN1bHQsICc8ZGl2PjxwPjxpbWcgc3JjPVwidnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwL2ltYWdlcy9jYXQuZ2lmXCIgYWx0PVwiaW1hZ2VcIj48L3A+PC9kaXY+Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdDb2RlIGJsb2NrIHJlbmRlcmVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNpbXBsZUNvZGVCbG9ja1JlbmRlcmVyID0gKGxhbmc6IHN0cmluZywgY29kZTogc3RyaW5nKTogUHJvbWlzZTxIVE1MRWxlbWVudD4gPT4ge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NvZGUnKTtcblx0XHRcdGVsZW1lbnQudGV4dENvbnRlbnQgPSBjb2RlO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShlbGVtZW50KTtcblx0XHR9O1xuXG5cdFx0dGVzdCgnYXN5bmNSZW5kZXJDYWxsYmFjayBzaG91bGQgYmUgaW52b2tlZCBmb3IgY29kZSBibG9ja3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXJrZG93biA9IHsgdmFsdWU6ICdgYGBqc1xcbjEgKyAxO1xcbmBgYCcgfTtcblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0c3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1hcmtkb3duLCB7XG5cdFx0XHRcdFx0YXN5bmNSZW5kZXJDYWxsYmFjazogcmVzb2x2ZSxcblx0XHRcdFx0XHRjb2RlQmxvY2tSZW5kZXJlcjogc2ltcGxlQ29kZUJsb2NrUmVuZGVyZXJcblx0XHRcdFx0fSkpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhc3luY1JlbmRlckNhbGxiYWNrIHNob3VsZCBub3QgYmUgaW52b2tlZCBpZiByZXN1bHQgaXMgaW1tZWRpYXRlbHkgZGlzcG9zZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXJrZG93biA9IHsgdmFsdWU6ICdgYGBqc1xcbjEgKyAxO1xcbmBgYCcgfTtcblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlbmRlck1hcmtkb3duKG1hcmtkb3duLCB7XG5cdFx0XHRcdFx0YXN5bmNSZW5kZXJDYWxsYmFjazogcmVqZWN0LFxuXHRcdFx0XHRcdGNvZGVCbG9ja1JlbmRlcmVyOiBzaW1wbGVDb2RlQmxvY2tSZW5kZXJlclxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmVzdWx0LmRpc3Bvc2UoKTtcblx0XHRcdFx0c2V0VGltZW91dChyZXNvbHZlLCAxMCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FzeW5jUmVuZGVyQ2FsbGJhY2sgc2hvdWxkIG5vdCBiZSBpbnZva2VkIGlmIGRpc3Bvc2UgaXMgY2FsbGVkIGJlZm9yZSBjb2RlIGJsb2NrIGlzIHJlbmRlcmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSB7IHZhbHVlOiAnYGBganNcXG4xICsgMTtcXG5gYGAnIH07XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRsZXQgcmVzb2x2ZUNvZGVCbG9ja1JlbmRlcmluZzogKHg6IEhUTUxFbGVtZW50KSA9PiB2b2lkO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZW5kZXJNYXJrZG93bihtYXJrZG93biwge1xuXHRcdFx0XHRcdGFzeW5jUmVuZGVyQ2FsbGJhY2s6IHJlamVjdCxcblx0XHRcdFx0XHRjb2RlQmxvY2tSZW5kZXJlcjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlQ29kZUJsb2NrUmVuZGVyaW5nID0gcmVzb2x2ZTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdHJlc3VsdC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZUNvZGVCbG9ja1JlbmRlcmluZyhkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjb2RlJykpO1xuXHRcdFx0XHRcdHNldFRpbWVvdXQocmVzb2x2ZSwgMTApO1xuXHRcdFx0XHR9LCAxMCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NvZGUgYmxvY2tzIHNob3VsZCB1c2UgbGVhZGluZyBsYW5ndWFnZSBpZCAoIzE1Nzc5MyknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXJrZG93biA9IHsgdmFsdWU6ICdgYGBqcyBzb21lIG90aGVyIHN0dWZmXFxuMSArIDE7XFxuYGBgJyB9O1xuXHRcdFx0Y29uc3QgbGFuZyA9IGF3YWl0IG5ldyBQcm9taXNlPHN0cmluZz4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtYXJrZG93biwge1xuXHRcdFx0XHRcdGNvZGVCbG9ja1JlbmRlcmVyOiBhc3luYyAobGFuZywgdmFsdWUpID0+IHtcblx0XHRcdFx0XHRcdHJlc29sdmUobGFuZyk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gc2ltcGxlQ29kZUJsb2NrUmVuZGVyZXIobGFuZywgdmFsdWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFuZywgJ2pzJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdUaGVtZUljb25zIFN1cHBvcnQgT24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZW5kZXIgYXBwZW5kVGV4dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSk7XG5cdFx0XHRtZHMuYXBwZW5kVGV4dCgnJCh6YXApICQobm90IGEgdGhlbWUgaWNvbikgJChhZGQpJyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogSFRNTEVsZW1lbnQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWRzKSkuZWxlbWVudDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5uZXJIVE1MLCBgPHA+JCh6YXApJm5ic3A7JChub3QmbmJzcDthJm5ic3A7dGhlbWUmbmJzcDtpY29uKSZuYnNwOyQoYWRkKTwvcD5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlciBhcHBlbmRNYXJrZG93bicsICgpID0+IHtcblx0XHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSk7XG5cdFx0XHRtZHMuYXBwZW5kTWFya2Rvd24oJyQoemFwKSAkKG5vdCBhIHRoZW1lIGljb24pICQoYWRkKScpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQ6IEhUTUxFbGVtZW50ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1kcykpLmVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmlubmVySFRNTCwgYDxwPjxzcGFuIGNsYXNzPVwiY29kaWNvbiBjb2RpY29uLXphcFwiPjwvc3Bhbj4gJChub3QgYSB0aGVtZSBpY29uKSA8c3BhbiBjbGFzcz1cImNvZGljb24gY29kaWNvbi1hZGRcIj48L3NwYW4+PC9wPmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVyIGFwcGVuZE1hcmtkb3duIHdpdGggZXNjYXBlZCBpY29uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWRzID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwgeyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0XHRcdG1kcy5hcHBlbmRNYXJrZG93bignXFxcXCQoemFwKSAkKG5vdCBhIHRoZW1lIGljb24pICQoYWRkKScpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQ6IEhUTUxFbGVtZW50ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1kcykpLmVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmlubmVySFRNTCwgYDxwPiQoemFwKSAkKG5vdCBhIHRoZW1lIGljb24pIDxzcGFuIGNsYXNzPVwiY29kaWNvbiBjb2RpY29uLWFkZFwiPjwvc3Bhbj48L3A+YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5kZXIgaWNvbiBpbiBsaW5rJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWRzID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwgeyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0XHRcdG1kcy5hcHBlbmRNYXJrZG93bihgWyQoemFwKS1saW5rXSgjbGluaylgKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBIVE1MRWxlbWVudCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtZHMpKS5lbGVtZW50O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsIGA8cD48YSBocmVmPVwiXCIgdGl0bGU9XCIjbGlua1wiIGRyYWdnYWJsZT1cImZhbHNlXCIgZGF0YS1ocmVmPVwiI2xpbmtcIj48c3BhbiBjbGFzcz1cImNvZGljb24gY29kaWNvbi16YXBcIj48L3NwYW4+LWxpbms8L2E+PC9wPmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVyIGljb24gaW4gdGFibGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdFx0bWRzLmFwcGVuZE1hcmtkb3duKGBcbnwgdGV4dCAgIHwgdGV4dCAgICAgICAgICAgICAgICAgfFxufC0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS18XG58ICQoemFwKSB8IFskKHphcCktbGlua10oI2xpbmspIHxgKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBIVE1MRWxlbWVudCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtZHMpKS5lbGVtZW50O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsIGA8dGFibGU+XG48dGhlYWQ+XG48dHI+XG48dGg+dGV4dDwvdGg+XG48dGg+dGV4dDwvdGg+XG48L3RyPlxuPC90aGVhZD5cbjx0Ym9keT48dHI+XG48dGQ+PHNwYW4gY2xhc3M9XCJjb2RpY29uIGNvZGljb24temFwXCI+PC9zcGFuPjwvdGQ+XG48dGQ+PGEgaHJlZj1cIlwiIHRpdGxlPVwiI2xpbmtcIiBkcmFnZ2FibGU9XCJmYWxzZVwiIGRhdGEtaHJlZj1cIiNsaW5rXCI+PHNwYW4gY2xhc3M9XCJjb2RpY29uIGNvZGljb24temFwXCI+PC9zcGFuPi1saW5rPC9hPjwvdGQ+XG48L3RyPlxuPC90Ym9keT48L3RhYmxlPlxuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5kZXIgaWNvbiBpbiA8YT4gd2l0aG91dCBocmVmICgjMTUyMTcwKScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUsIHN1cHBvcnRIdG1sOiB0cnVlIH0pO1xuXHRcdFx0bWRzLmFwcGVuZE1hcmtkb3duKGA8YT4kKHN5bmMpPC9hPmApO1xuXG5cdFx0XHRjb25zdCByZXN1bHQ6IEhUTUxFbGVtZW50ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1kcykpLmVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmlubmVySFRNTCwgYDxwPjxzcGFuIGNsYXNzPVwiY29kaWNvbiBjb2RpY29uLXN5bmNcIj48L3NwYW4+PC9wPmApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnVGhlbWVJY29ucyBTdXBwb3J0IE9mZicsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JlbmRlciBhcHBlbmRUZXh0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWRzID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwgeyBzdXBwb3J0VGhlbWVJY29uczogZmFsc2UgfSk7XG5cdFx0XHRtZHMuYXBwZW5kVGV4dCgnJCh6YXApICQobm90IGEgdGhlbWUgaWNvbikgJChhZGQpJyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogSFRNTEVsZW1lbnQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWRzKSkuZWxlbWVudDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5uZXJIVE1MLCBgPHA+JCh6YXApJm5ic3A7JChub3QmbmJzcDthJm5ic3A7dGhlbWUmbmJzcDtpY29uKSZuYnNwOyQoYWRkKTwvcD5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlciBhcHBlbmRNYXJrZG93biB3aXRoIGVzY2FwZWQgaWNvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgc3VwcG9ydFRoZW1lSWNvbnM6IGZhbHNlIH0pO1xuXHRcdFx0bWRzLmFwcGVuZE1hcmtkb3duKCdcXFxcJCh6YXApICQobm90IGEgdGhlbWUgaWNvbikgJChhZGQpJyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogSFRNTEVsZW1lbnQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWRzKSkuZWxlbWVudDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5uZXJIVE1MLCBgPHA+JCh6YXApICQobm90IGEgdGhlbWUgaWNvbikgJChhZGQpPC9wPmApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQWxlcnRzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ1Nob3VsZCByZW5kZXIgYWxlcnQgd2l0aCBkYXRhLXNldmVyaXR5IGF0dHJpYnV0ZSBhbmQgaWNvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hcmtkb3duID0gbmV3IE1hcmtkb3duU3RyaW5nKCc+IFshTk9URV1cXG4+IFRoaXMgaXMgYSBub3RlIGFsZXJ0JywgeyBzdXBwb3J0QWxlcnRTeW50YXg6IHRydWUgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWFya2Rvd24pKS5lbGVtZW50O1xuXG5cdFx0XHRjb25zdCBibG9ja3F1b3RlID0gcmVzdWx0LnF1ZXJ5U2VsZWN0b3IoJ2Jsb2NrcXVvdGVbZGF0YS1zZXZlcml0eT1cIm5vdGVcIl0nKTtcblx0XHRcdGFzc2VydC5vayhibG9ja3F1b3RlLCAnU2hvdWxkIGhhdmUgYmxvY2txdW90ZSB3aXRoIGRhdGEtc2V2ZXJpdHk9XCJub3RlXCInKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5uZXJIVE1MLmluY2x1ZGVzKCdUaGlzIGlzIGEgbm90ZSBhbGVydCcpLCAnU2hvdWxkIGNvbnRhaW4gYWxlcnQgdGV4dCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbm5lckhUTUwuaW5jbHVkZXMoJ2NvZGljb24taW5mbycpLCAnU2hvdWxkIGNvbnRhaW4gaW5mbyBpY29uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdTaG91bGQgcmVuZGVyIHJlZ3VsYXIgYmxvY2txdW90ZSB3aGVuIHN1cHBvcnRBbGVydFN5bnRheCBpcyBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hcmtkb3duID0gbmV3IE1hcmtkb3duU3RyaW5nKCc+IFshTk9URV1cXG4+IFRoaXMgc2hvdWxkIGJlIGEgcmVndWxhciBibG9ja3F1b3RlJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWFya2Rvd24pKS5lbGVtZW50O1xuXG5cdFx0XHRjb25zdCBibG9ja3F1b3RlID0gcmVzdWx0LnF1ZXJ5U2VsZWN0b3IoJ2Jsb2NrcXVvdGUnKTtcblx0XHRcdGFzc2VydC5vayhibG9ja3F1b3RlLCAnU2hvdWxkIGhhdmUgYmxvY2txdW90ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJsb2NrcXVvdGU/LmdldEF0dHJpYnV0ZSgnZGF0YS1zZXZlcml0eScpLCBudWxsLCAnU2hvdWxkIG5vdCBoYXZlIGRhdGEtc2V2ZXJpdHkgYXR0cmlidXRlJyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmlubmVySFRNTC5pbmNsdWRlcygnWyFOT1RFXScpLCAnU2hvdWxkIGNvbnRhaW4gbGl0ZXJhbCBbIU5PVEVdIHRleHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1Nob3VsZCBub3QgdHJhbnNmb3JtIGJsb2NrcXVvdGVzIHdpdGhvdXQgYWxlcnQgc3ludGF4JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSBuZXcgTWFya2Rvd25TdHJpbmcoJz4gVGhpcyBpcyBhIHJlZ3VsYXIgYmxvY2txdW90ZScsIHsgc3VwcG9ydEFsZXJ0U3ludGF4OiB0cnVlIH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1hcmtkb3duKSkuZWxlbWVudDtcblxuXHRcdFx0Y29uc3QgYmxvY2txdW90ZSA9IHJlc3VsdC5xdWVyeVNlbGVjdG9yKCdibG9ja3F1b3RlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmxvY2txdW90ZT8uZ2V0QXR0cmlidXRlKCdkYXRhLXNldmVyaXR5JyksIG51bGwsICdTaG91bGQgbm90IGhhdmUgZGF0YS1zZXZlcml0eSBhdHRyaWJ1dGUnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbnBtIEhvdmVyIFJ1biBTY3JpcHQgbm90IHdvcmtpbmcgIzkwODU1JywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgbWQ6IElNYXJrZG93blN0cmluZyA9IEpTT04ucGFyc2UoJ3tcInZhbHVlXCI6XCJbUnVuIFNjcmlwdF0oY29tbWFuZDpucG0ucnVuU2NyaXB0RnJvbUhvdmVyPyU3QiUyMmRvY3VtZW50VXJpJTIyJTNBJTdCJTIyJTI0bWlkJTIyJTNBMSUyQyUyMmZzUGF0aCUyMiUzQSUyMmMlM0ElNUMlNUNVc2VycyU1QyU1Q2pyaWVrZW4lNUMlNUNDb2RlJTVDJTVDX3NhbXBsZSU1QyU1Q2ZvbyU1QyU1Q3BhY2thZ2UuanNvbiUyMiUyQyUyMl9zZXAlMjIlM0ExJTJDJTIyZXh0ZXJuYWwlMjIlM0ElMjJmaWxlJTNBJTJGJTJGJTJGYyUyNTNBJTJGVXNlcnMlMkZqcmlla2VuJTJGQ29kZSUyRl9zYW1wbGUlMkZmb28lMkZwYWNrYWdlLmpzb24lMjIlMkMlMjJwYXRoJTIyJTNBJTIyJTJGYyUzQSUyRlVzZXJzJTJGanJpZWtlbiUyRkNvZGUlMkZfc2FtcGxlJTJGZm9vJTJGcGFja2FnZS5qc29uJTIyJTJDJTIyc2NoZW1lJTIyJTNBJTIyZmlsZSUyMiU3RCUyQyUyMnNjcmlwdCUyMiUzQSUyMmVjaG8lMjIlN0QgXFxcXFwiUnVuIHRoZSBzY3JpcHQgYXMgYSB0YXNrXFxcXFwiKVwiLFwic3VwcG9ydFRoZW1lSWNvbnNcIjpmYWxzZSxcImlzVHJ1c3RlZFwiOnRydWUsXCJ1cmlzXCI6e1wiX191cmlfZTQ5NDQzXCI6e1wiJG1pZFwiOjEsXCJmc1BhdGhcIjpcImM6XFxcXFxcXFxVc2Vyc1xcXFxcXFxcanJpZWtlblxcXFxcXFxcQ29kZVxcXFxcXFxcX3NhbXBsZVxcXFxcXFxcZm9vXFxcXFxcXFxwYWNrYWdlLmpzb25cIixcIl9zZXBcIjoxLFwiZXh0ZXJuYWxcIjpcImZpbGU6Ly8vYyUzQS9Vc2Vycy9qcmlla2VuL0NvZGUvX3NhbXBsZS9mb28vcGFja2FnZS5qc29uXCIsXCJwYXRoXCI6XCIvYzovVXNlcnMvanJpZWtlbi9Db2RlL19zYW1wbGUvZm9vL3BhY2thZ2UuanNvblwiLFwic2NoZW1lXCI6XCJmaWxlXCJ9LFwiY29tbWFuZDpucG0ucnVuU2NyaXB0RnJvbUhvdmVyPyU3QiUyMmRvY3VtZW50VXJpJTIyJTNBJTdCJTIyJTI0bWlkJTIyJTNBMSUyQyUyMmZzUGF0aCUyMiUzQSUyMmMlM0ElNUMlNUNVc2VycyU1QyU1Q2pyaWVrZW4lNUMlNUNDb2RlJTVDJTVDX3NhbXBsZSU1QyU1Q2ZvbyU1QyU1Q3BhY2thZ2UuanNvbiUyMiUyQyUyMl9zZXAlMjIlM0ExJTJDJTIyZXh0ZXJuYWwlMjIlM0ElMjJmaWxlJTNBJTJGJTJGJTJGYyUyNTNBJTJGVXNlcnMlMkZqcmlla2VuJTJGQ29kZSUyRl9zYW1wbGUlMkZmb28lMkZwYWNrYWdlLmpzb24lMjIlMkMlMjJwYXRoJTIyJTNBJTIyJTJGYyUzQSUyRlVzZXJzJTJGanJpZWtlbiUyRkNvZGUlMkZfc2FtcGxlJTJGZm9vJTJGcGFja2FnZS5qc29uJTIyJTJDJTIyc2NoZW1lJTIyJTNBJTIyZmlsZSUyMiU3RCUyQyUyMnNjcmlwdCUyMiUzQSUyMmVjaG8lMjIlN0RcIjp7XCIkbWlkXCI6MSxcInBhdGhcIjpcIm5wbS5ydW5TY3JpcHRGcm9tSG92ZXJcIixcInNjaGVtZVwiOlwiY29tbWFuZFwiLFwicXVlcnlcIjpcIntcXFxcXCJkb2N1bWVudFVyaVxcXFxcIjpcXFxcXCJfX3VyaV9lNDk0NDNcXFxcXCIsXFxcXFwic2NyaXB0XFxcXFwiOlxcXFxcImVjaG9cXFxcXCJ9XCJ9fX0nKTtcblx0XHRjb25zdCBlbGVtZW50ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1kKSkuZWxlbWVudDtcblxuXHRcdGNvbnN0IGFuY2hvciA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcignYScpITtcblx0XHRhc3NlcnQub2soYW5jaG9yKTtcblx0XHRhc3NlcnQub2soYW5jaG9yLmRhdGFzZXRbJ2hyZWYnXSk7XG5cblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoYW5jaG9yLmRhdGFzZXRbJ2hyZWYnXSEpO1xuXG5cdFx0Y29uc3QgZGF0YSA9IDx7IHNjcmlwdDogc3RyaW5nOyBkb2N1bWVudFVyaTogVVJJIH0+cGFyc2UoZGVjb2RlVVJJQ29tcG9uZW50KHVyaS5xdWVyeSkpO1xuXHRcdGFzc2VydC5vayhkYXRhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5zY3JpcHQsICdlY2hvJyk7XG5cdFx0YXNzZXJ0Lm9rKGRhdGEuZG9jdW1lbnRVcmkudG9TdHJpbmcoKS5zdGFydHNXaXRoKCdmaWxlOi8vL2MlM0EvJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdTaG91bGQgbm90IHJlbmRlciBjb21tYW5kIGxpbmtzIGJ5IGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoYFtjb21tYW5kMV0oY29tbWFuZDpkb0ZvbykgPGEgaHJlZj1cImNvbW1hbmQ6ZG9Gb29cIj5jb21tYW5kMjwvYT5gLCB7XG5cdFx0XHRzdXBwb3J0SHRtbDogdHJ1ZVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBIVE1MRWxlbWVudCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtZCkpLmVsZW1lbnQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsIGA8cD5jb21tYW5kMSBjb21tYW5kMjwvcD5gKTtcblx0fSk7XG5cblx0dGVzdCgnU2hvdWxkIHJlbmRlciBjb21tYW5kIGxpbmtzIGluIHRydXN0ZWQgc3RyaW5ncycsICgpID0+IHtcblx0XHRjb25zdCBtZCA9IG5ldyBNYXJrZG93blN0cmluZyhgW2NvbW1hbmQxXShjb21tYW5kOmRvRm9vKSA8YSBocmVmPVwiY29tbWFuZDpkb0Zvb1wiPmNvbW1hbmQyPC9hPmAsIHtcblx0XHRcdGlzVHJ1c3RlZDogdHJ1ZSxcblx0XHRcdHN1cHBvcnRIdG1sOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBIVE1MRWxlbWVudCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtZCkpLmVsZW1lbnQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsIGA8cD48YSBocmVmPVwiXCIgdGl0bGU9XCJcIiBkcmFnZ2FibGU9XCJmYWxzZVwiIGRhdGEtaHJlZj1cImNvbW1hbmQ6ZG9Gb29cIj5jb21tYW5kMTwvYT4gPGEgaHJlZj1cIlwiIGRhdGEtaHJlZj1cImNvbW1hbmQ6ZG9Gb29cIj5jb21tYW5kMjwvYT48L3A+YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Nob3VsZCByZW1vdmUgcmVsYXRpdmUgbGlua3MgaWYgdGhlcmUgaXMgbm8gYmFzZSB1cmwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoYFt0ZXh0XSguL2ZvbykgPGEgaHJlZj1cIi4vYmFyXCI+YmFyPC9hPmAsIHtcblx0XHRcdGlzVHJ1c3RlZDogdHJ1ZSxcblx0XHRcdHN1cHBvcnRIdG1sOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1kKSkuZWxlbWVudDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmlubmVySFRNTCwgYDxwPnRleHQgYmFyPC9wPmApO1xuXHR9KTtcblxuXHR0ZXN0KCdTaG91bGQgc3VwcG9ydCByZWxhdGl2ZSBsaW5rcyBpZiBiYXNldXJsIGlzIHNldCcsICgpID0+IHtcblx0XHRjb25zdCBtZCA9IG5ldyBNYXJrZG93blN0cmluZyhgW3RleHRdKC4vZm9vKSA8YSBocmVmPVwiLi9iYXJcIj5iYXI8L2E+IDxpbWcgc3JjPVwiY2F0LmdpZlwiPmAsIHtcblx0XHRcdGlzVHJ1c3RlZDogdHJ1ZSxcblx0XHRcdHN1cHBvcnRIdG1sOiB0cnVlLFxuXHRcdH0pO1xuXHRcdG1kLmJhc2VVcmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGF0aC8nKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtZCkpLmVsZW1lbnQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsIGA8cD48YSBocmVmPVwiXCIgdGl0bGU9XCIuL2Zvb1wiIGRyYWdnYWJsZT1cImZhbHNlXCIgZGF0YS1ocmVmPVwiaHR0cHM6Ly9leGFtcGxlLmNvbS9wYXRoL2Zvb1wiPnRleHQ8L2E+IDxhIGhyZWY9XCJcIiBkYXRhLWhyZWY9XCJodHRwczovL2V4YW1wbGUuY29tL3BhdGgvYmFyXCI+YmFyPC9hPiA8aW1nIHNyYz1cImh0dHBzOi8vZXhhbXBsZS5jb20vcGF0aC9jYXQuZ2lmXCI+PC9wPmApO1xuXHR9KTtcblxuXHR0ZXN0KCdTaG91bGQgdXNlIGRlY29kZWQgZmlsZSBwYXRoIGFzIHRpdGxlIGZvciBmaWxlOi8vIGxpbmtzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVVcmkgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci9wcm9qZWN0L2xpYi5kLnRzJyk7XG5cdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoYFtsb2ddKCR7ZmlsZVVyaS50b1N0cmluZygpfSlgLCB7fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWQpKS5lbGVtZW50O1xuXHRcdGNvbnN0IGFuY2hvciA9IHJlc3VsdC5xdWVyeVNlbGVjdG9yKCdhJykhO1xuXHRcdGFzc2VydC5vayhhbmNob3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhbmNob3IudGl0bGUsIGZpbGVVcmkuZnNQYXRoKTtcblx0fSk7XG5cblx0dGVzdCgnU2hvdWxkIGluY2x1ZGUgZnJhZ21lbnQgaW4gdGl0bGUgZm9yIGZpbGU6Ly8gbGlua3Mgd2l0aCBsaW5lIG51bWJlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5maWxlKCcvaG9tZS91c2VyL3Byb2plY3QvbGliLmQudHMnKTtcblx0XHRjb25zdCBtZCA9IG5ldyBNYXJrZG93blN0cmluZyhgW2xvZ10oJHtmaWxlVXJpLnRvU3RyaW5nKCl9I0w0MilgLCB7fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWQpKS5lbGVtZW50O1xuXHRcdGNvbnN0IGFuY2hvciA9IHJlc3VsdC5xdWVyeVNlbGVjdG9yKCdhJykhO1xuXHRcdGFzc2VydC5vayhhbmNob3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhbmNob3IudGl0bGUsIGAke2ZpbGVVcmkuZnNQYXRofSNMNDJgKTtcblx0fSk7XG5cblx0dGVzdCgnU2hvdWxkIG5vdCBvdmVycmlkZSBleHBsaWNpdCB0aXRsZSBmb3IgZmlsZTovLyBsaW5rcycsICgpID0+IHtcblx0XHRjb25zdCBmaWxlVXJpID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdC9saWIuZC50cycpO1xuXHRcdGNvbnN0IG1kID0gbmV3IE1hcmtkb3duU3RyaW5nKGBbbG9nXSgke2ZpbGVVcmkudG9TdHJpbmcoKX0gXCJHbyB0byBkZWZpbml0aW9uXCIpYCwge30pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1kKSkuZWxlbWVudDtcblx0XHRjb25zdCBhbmNob3IgPSByZXN1bHQucXVlcnlTZWxlY3RvcignYScpITtcblx0XHRhc3NlcnQub2soYW5jaG9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYW5jaG9yLnRpdGxlLCAnR28gdG8gZGVmaW5pdGlvbicpO1xuXHR9KTtcblxuXHRzdWl0ZSgnUGxhaW50ZXh0TWFya2Rvd25SZW5kZXInLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCd0ZXN0IGNvZGUsIGJsb2NrcXVvdGUsIGhlYWRpbmcsIGxpc3QsIGxpc3RpdGVtLCBwYXJhZ3JhcGgsIHRhYmxlLCB0YWJsZXJvdywgdGFibGVjZWxsLCBzdHJvbmcsIGVtLCBiciwgZGVsLCB0ZXh0IGFyZSByZW5kZXJlZCBwbGFpbnRleHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXJrZG93biA9IHsgdmFsdWU6ICdgY29kZWBcXG4+cXVvdGVcXG4jIGhlYWRpbmdcXG4tIGxpc3RcXG5cXG50YWJsZSB8IHRhYmxlMlxcbi0tLSB8IC0tLSBcXG5vbmUgfCB0d29cXG5cXG5cXG5ibyoqbGQqKlxcbl9pdGFsaWNfXFxufn5kZWx+flxcbnNvbWUgdGV4dCcgfTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkID0gJ2NvZGVcXG5xdW90ZVxcbmhlYWRpbmdcXG5saXN0XFxuXFxudGFibGUgdGFibGUyXFxub25lIHR3b1xcbmJvbGRcXG5pdGFsaWNcXG5kZWxcXG5zb21lIHRleHQnO1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmcgPSByZW5kZXJBc1BsYWludGV4dChtYXJrZG93bik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBleHBlY3RlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0ZXN0IGh0bWwsIGhyLCBpbWFnZSwgbGluayBhcmUgcmVuZGVyZWQgcGxhaW50ZXh0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSB7IHZhbHVlOiAnPGRpdj5odG1sPC9kaXY+XFxuXFxuLS0tXFxuIVtpbWFnZV0oaW1hZ2VMaW5rKVxcblt0ZXh0XSh0ZXh0TGluayknIH07XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9ICd0ZXh0Jztcblx0XHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nID0gcmVuZGVyQXNQbGFpbnRleHQobWFya2Rvd24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZXhwZWN0ZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdChgU2hvdWxkIG5vdCByZW1vdmUgaHRtbCBpbnNpZGUgb2YgY29kZSBibG9ja3NgLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXJrZG93biA9IHtcblx0XHRcdFx0dmFsdWU6IFtcblx0XHRcdFx0XHQnYGBgaHRtbCcsXG5cdFx0XHRcdFx0Jzxmb3JtPmh0bWw8L2Zvcm0+Jyxcblx0XHRcdFx0XHQnYGBgJyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0XHQnYGBgJyxcblx0XHRcdFx0Jzxmb3JtPmh0bWw8L2Zvcm0+Jyxcblx0XHRcdFx0J2BgYCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmcgPSByZW5kZXJBc1BsYWludGV4dChtYXJrZG93biwgeyBpbmNsdWRlQ29kZUJsb2Nrc0ZlbmNlczogdHJ1ZSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGV4cGVjdGVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGRvdWJsZS1lc2NhcGUgZW50aXRpZXMgaW5zaWRlIGNvZGUgc3BhbnMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyQXNQbGFpbnRleHQoeyB2YWx1ZTogJ1J1biBgdGVzdHMgJiBidWlsZGAnIH0pLCAnUnVuIHRlc3RzICYgYnVpbGQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJBc1BsYWludGV4dCh7IHZhbHVlOiAnVXNlIGA8Zm9ybT5gIHRhZycgfSksICdVc2UgPGZvcm0+IHRhZycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc3VwcG9ydEh0bWwnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc3VwcG9ydEh0bWwgaXMgZGlzYWJsZWQgYnkgZGVmYXVsdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHt9KTtcblx0XHRcdG1kcy5hcHBlbmRNYXJrZG93bignYTxiPmI8L2I+YycpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWRzKSkuZWxlbWVudDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5uZXJIVE1MLCBgPHA+YWJjPC9wPmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnUmVuZGVycyBodG1sIHdoZW4gc3VwcG9ydEh0bWw9dHJ1ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgc3VwcG9ydEh0bWw6IHRydWUgfSk7XG5cdFx0XHRtZHMuYXBwZW5kTWFya2Rvd24oJ2E8Yj5iPC9iPmMnKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1kcykpLmVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmlubmVySFRNTCwgYDxwPmE8Yj5iPC9iPmM8L3A+YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdTaG91bGQgbm90IGluY2x1ZGUgc2NyaXB0cyBldmVuIHdoZW4gc3VwcG9ydEh0bWw9dHJ1ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgc3VwcG9ydEh0bWw6IHRydWUgfSk7XG5cdFx0XHRtZHMuYXBwZW5kTWFya2Rvd24oJ2E8YiBvbmNsaWNrPVwiYWxlcnQoMSlcIj5iPC9iPjxzY3JpcHQ+YWxlcnQoMik8L3NjcmlwdD5jJyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtZHMpKS5lbGVtZW50O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsIGA8cD5hPGI+YjwvYj5jPC9wPmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnU2hvdWxkIG5vdCByZW5kZXIgaHRtbCBhcHBlbmRlZCBhcyB0ZXh0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWRzID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwgeyBzdXBwb3J0SHRtbDogdHJ1ZSB9KTtcblx0XHRcdG1kcy5hcHBlbmRUZXh0KCdhPGI+YjwvYj5jJyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtZHMpKS5lbGVtZW50O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsIGA8cD5hJmx0O2ImZ3Q7YiZsdDsvYiZndDtjPC9wPmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnU2hvdWxkIHJlbmRlciBodG1sIGltYWdlcycsICgpID0+IHtcblx0XHRcdGlmIChpc1dlYikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgc3VwcG9ydEh0bWw6IHRydWUgfSk7XG5cdFx0XHRtZHMuYXBwZW5kTWFya2Rvd24oYDxpbWcgc3JjPVwiaHR0cDovL2V4YW1wbGUuY29tL2NhdC5naWZcIj5gKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1kcykpLmVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmlubmVySFRNTCwgYDxpbWcgc3JjPVwiaHR0cDovL2V4YW1wbGUuY29tL2NhdC5naWZcIj5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1Nob3VsZCByZW5kZXIgaHRtbCBpbWFnZXMgd2l0aCBmaWxlIHVyaSBhcyBzYW1lIG9yaWdpbiB1cmknLCAoKSA9PiB7XG5cdFx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IHN1cHBvcnRIdG1sOiB0cnVlIH0pO1xuXHRcdFx0bWRzLmFwcGVuZE1hcmtkb3duKGA8aW1nIHNyYz1cImZpbGU6Ly8vaW1hZ2VzL2NhdC5naWZcIj5gKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1kcykpLmVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmlubmVySFRNTCwgYDxpbWcgc3JjPVwidnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwL2ltYWdlcy9jYXQuZ2lmXCI+YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdTaG91bGQgb25seSBhbGxvdyBjaGVja2JveCBpbnB1dHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcoXG5cdFx0XHRcdCd0ZXh0OiA8aW5wdXQgdHlwZT1cInRleHRcIj5cXG5jaGVja2JveDo8aW5wdXQgdHlwZT1cImNoZWNrYm94XCI+Jyxcblx0XHRcdFx0eyBzdXBwb3J0SHRtbDogdHJ1ZSB9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1kcykpLmVsZW1lbnQ7XG5cblx0XHRcdC8vIElucHV0cyBzaG91bGQgYWx3YXlzIGJlIGRpc2FibGVkIHRvb1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsIGA8cD50ZXh0OiBcXG5jaGVja2JveDo8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgZGlzYWJsZWQ9XCJcIj48L3A+YCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmaWxsSW5JbmNvbXBsZXRlVG9rZW5zJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIGlnbm9yZVJhdyguLi50b2tlbkxpc3RzOiBtYXJrZWQuVG9rZW5bXVtdKTogdm9pZCB7XG5cdFx0XHR0b2tlbkxpc3RzLmZvckVhY2godG9rZW5zID0+IHtcblx0XHRcdFx0dG9rZW5zLmZvckVhY2godCA9PiB0LnJhdyA9ICcnKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbXBsZXRlVGFibGUgPSAnfCBhIHwgYiB8XFxufCAtLS0gfCAtLS0gfCc7XG5cblx0XHRzdWl0ZSgndGFibGUnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdjb21wbGV0ZSB0YWJsZScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihjb21wbGV0ZVRhYmxlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXHRcdFx0XHRhc3NlcnQuZXF1YWwobmV3VG9rZW5zLCB0b2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2Z1bGwgaGVhZGVyIG9ubHknLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGVUYWJsZSA9ICd8IGEgfCBiIHwnO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGVUYWJsZSk7XG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVGFibGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGNvbXBsZXRlVGFibGUpO1xuXG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVGFibGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2Z1bGwgaGVhZGVyIG9ubHkgd2l0aCB0cmFpbGluZyBzcGFjZScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZVRhYmxlID0gJ3wgYSB8IGIgfCAnO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGVUYWJsZSk7XG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVGFibGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGNvbXBsZXRlVGFibGUpO1xuXG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblx0XHRcdFx0aWYgKG5ld1Rva2Vucykge1xuXHRcdFx0XHRcdGlnbm9yZVJhdyhuZXdUb2tlbnMsIGNvbXBsZXRlVGFibGVUb2tlbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRhYmxlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdpbmNvbXBsZXRlIGhlYWRlcicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZVRhYmxlID0gJ3wgYSB8IGInO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGVUYWJsZSk7XG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVGFibGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGNvbXBsZXRlVGFibGUpO1xuXG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRpZiAobmV3VG9rZW5zKSB7XG5cdFx0XHRcdFx0aWdub3JlUmF3KG5ld1Rva2VucywgY29tcGxldGVUYWJsZVRva2Vucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVGFibGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2luY29tcGxldGUgaGVhZGVyIG9uZSBjb2x1bW4nLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGVUYWJsZSA9ICd8IGEgJztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlVGFibGUpO1xuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRhYmxlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlVGFibGUgKyAnfFxcbnwgLS0tIHwnKTtcblxuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0aWYgKG5ld1Rva2Vucykge1xuXHRcdFx0XHRcdGlnbm9yZVJhdyhuZXdUb2tlbnMsIGNvbXBsZXRlVGFibGVUb2tlbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRhYmxlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmdWxsIGhlYWRlciB3aXRoIGV4dHJhcycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZVRhYmxlID0gJ3wgYSAqKmJvbGQqKiB8IGIgX2l0YWxpY3NfIHwnO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGVUYWJsZSk7XG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVGFibGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGVUYWJsZSArICdcXG58IC0tLSB8IC0tLSB8Jyk7XG5cblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUYWJsZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZnVsbCBoZWFkZXIgd2l0aCBsZWFkaW5nIHRleHQnLCAoKSA9PiB7XG5cdFx0XHRcdC8vIFBhcnNpbmcgdGhpcyBnaXZlcyBvbmUgdG9rZW4gYW5kIG9uZSAndGV4dCcgc3VidG9rZW5cblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZVRhYmxlID0gJ2hlcmUgaXMgYSB0YWJsZVxcbnwgYSB8IGIgfCc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZVRhYmxlKTtcblx0XHRcdFx0Y29uc3QgY29tcGxldGVUYWJsZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZVRhYmxlICsgJ1xcbnwgLS0tIHwgLS0tIHwnKTtcblxuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRhYmxlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmdWxsIGhlYWRlciB3aXRoIGxlYWRpbmcgb3RoZXIgc3R1ZmYnLCAoKSA9PiB7XG5cdFx0XHRcdC8vIFBhcnNpbmcgdGhpcyBnaXZlcyBvbmUgdG9rZW4gYW5kIG9uZSAndGV4dCcgc3VidG9rZW5cblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZVRhYmxlID0gJ2BgYGpzXFxuY29uc3QgeHl6ID0gMTIzO1xcbmBgYFxcbnwgYSB8IGIgfCc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZVRhYmxlKTtcblx0XHRcdFx0Y29uc3QgY29tcGxldGVUYWJsZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZVRhYmxlICsgJ1xcbnwgLS0tIHwgLS0tIHwnKTtcblxuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRhYmxlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmdWxsIGhlYWRlciB3aXRoIGluY29tcGxldGUgc2VwYXJhdG9yJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlVGFibGUgPSAnfCBhIHwgYiB8XFxufCAtLS0nO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGVUYWJsZSk7XG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVGFibGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGNvbXBsZXRlVGFibGUpO1xuXG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVGFibGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2Z1bGwgaGVhZGVyIHdpdGggaW5jb21wbGV0ZSBzZXBhcmF0b3IgMicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZVRhYmxlID0gJ3wgYSB8IGIgfFxcbnwgLS0tIHwnO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGVUYWJsZSk7XG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVGFibGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGNvbXBsZXRlVGFibGUpO1xuXG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVGFibGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2Z1bGwgaGVhZGVyIHdpdGggaW5jb21wbGV0ZSBzZXBhcmF0b3IgMycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZVRhYmxlID0gJ3wgYSB8IGIgfFxcbnwnO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGVUYWJsZSk7XG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVGFibGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGNvbXBsZXRlVGFibGUpO1xuXG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVGFibGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ25vdCBhIHRhYmxlJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlVGFibGUgPSAnfCBhIHwgYiB8XFxuc29tZSB0ZXh0Jztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlVGFibGUpO1xuXG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIHRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnbm90IGEgdGFibGUgMicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZVRhYmxlID0gJ3wgYSB8IGIgfFxcbnwgLS0tIHxcXG5zb21lIHRleHQnO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGVUYWJsZSk7XG5cblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgdG9rZW5zKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0ZnVuY3Rpb24gc2ltcGxlTWFya2Rvd25UZXN0U3VpdGUobmFtZTogc3RyaW5nLCBkZWxpbWl0ZXI6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0dGVzdChgaW5jb21wbGV0ZSAke25hbWV9YCwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gYCR7ZGVsaW1pdGVyfWNvZGVgO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyBkZWxpbWl0ZXIpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoYGNvbXBsZXRlICR7bmFtZX1gLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBgbGVhZGluZyB0ZXh0ICR7ZGVsaW1pdGVyfWNvZGUke2RlbGltaXRlcn0gdHJhaWxpbmcgdGV4dGA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgdG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KGAke25hbWV9IHdpdGggbGVhZGluZyB0ZXh0YCwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gYHNvbWUgdGV4dCBhbmQgJHtkZWxpbWl0ZXJ9c29tZSBjb2RlYDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgZGVsaW1pdGVyKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KGAke25hbWV9IHdpdGggdHJhaWxpbmcgc3BhY2VgLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSBgc29tZSB0ZXh0IGFuZCAke2RlbGltaXRlcn1zb21lIGNvZGUgYDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlLnRyaW1FbmQoKSArIGRlbGltaXRlcik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdChgc2luZ2xlIGxvb3NlIFwiJHtkZWxpbWl0ZXJ9XCJgLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBgc29tZSB0ZXh0IGFuZCAke2RlbGltaXRlcn1ieSBpdHNlbGZcXG5tb3JlIHRleHQgaGVyZWA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgdG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KGBpbmNvbXBsZXRlICR7bmFtZX0gYWZ0ZXIgbmV3bGluZWAsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IGBzb21lIHRleHRcXG5tb3JlIHRleHQgaGVyZSBhbmQgJHtkZWxpbWl0ZXJ9dGV4dGA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCArIGRlbGltaXRlcik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdChgaW5jb21wbGV0ZSBhZnRlciBjb21wbGV0ZSAke25hbWV9YCwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gYGxlYWRpbmcgdGV4dCAke2RlbGltaXRlcn1jb2RlJHtkZWxpbWl0ZXJ9IHRyYWlsaW5nIHRleHQgYW5kICR7ZGVsaW1pdGVyfWFub3RoZXJgO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQgKyBkZWxpbWl0ZXIpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoYGluY29tcGxldGUgJHtuYW1lfSBpbiBsaXN0YCwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gYC0gbGlzdCBpdGVtIG9uZVxcbi0gbGlzdCBpdGVtIHR3byBhbmQgJHtkZWxpbWl0ZXJ9dGV4dGA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCArIGRlbGltaXRlcik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdChgaW5jb21wbGV0ZSAke25hbWV9IGluIGFzdGVyaXNrIGxpc3RgLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBgKiBsaXN0IGl0ZW0gb25lXFxuKiBsaXN0IGl0ZW0gdHdvIGFuZCAke2RlbGltaXRlcn10ZXh0YDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcih0ZXh0KTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcih0ZXh0ICsgZGVsaW1pdGVyKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KGBpbmNvbXBsZXRlICR7bmFtZX0gaW4gbnVtYmVyZWQgbGlzdGAsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IGAxLiBsaXN0IGl0ZW0gb25lXFxuMi4gbGlzdCBpdGVtIHR3byBhbmQgJHtkZWxpbWl0ZXJ9dGV4dGA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCArIGRlbGltaXRlcik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRzdWl0ZSgnbGlzdCcsICgpID0+IHtcblx0XHRcdHRlc3QoJ2xpc3Qgd2l0aCBjb21wbGV0ZSBjb2RlYmxvY2snLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGxpc3QgPSBgLVxuXHRcXGBcXGBcXGBqc1xuXHRsZXQgeCA9IDE7XG5cdFxcYFxcYFxcYFxuLSBsaXN0IGl0ZW0gdHdvXG5gO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGxpc3QpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIHRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdC5za2lwKCdsaXN0IHdpdGggaW5jb21wbGV0ZSBjb2RlYmxvY2snLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSBgLSBsaXN0IGl0ZW0gb25lXG5cblx0XFxgXFxgXFxganNcblx0bGV0IHggPSAxO2A7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICdcXG5cdGBgYCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2xpc3Qgd2l0aCBzdWJpdGVtcycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgbGlzdCA9IGAtIGhlbGxvXG5cdC0gc3ViIGl0ZW1cbi0gdGV4dFxuXHRuZXdsaW5lIGZvciBzb21lIHJlYXNvblxuYDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihsaXN0KTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCB0b2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ29yZGVyZWQgbGlzdCB3aXRoIHN1Yml0ZW1zJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBsaXN0ID0gYDEuIGhlbGxvXG5cdC0gc3ViIGl0ZW1cbjIuIHRleHRcblx0bmV3bGluZSBmb3Igc29tZSByZWFzb25cbmA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIobGlzdCk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgdG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdsaXN0IHdpdGggc3R1ZmYnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGxpc3QgPSBgLSBsaXN0IGl0ZW0gb25lIFxcYGNvZGVzcGFuXFxgICoqYm9sZCoqIFtsaW5rXShodHRwOi8vbWljcm9zb2Z0LmNvbSkgbW9yZSB0ZXh0YDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihsaXN0KTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCB0b2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2xpc3Qgd2l0aCBpbmNvbXBsZXRlIGxpbmsgdGV4dCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9IGAtIGxpc3QgaXRlbSBvbmVcbi0gaXRlbSB0d28gW2xpbmtgO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnXShodHRwczovL21pY3Jvc29mdC5jb20pJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnbGlzdCB3aXRoIGluY29tcGxldGUgbGluayB0YXJnZXQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSBgLSBsaXN0IGl0ZW0gb25lXG4tIGl0ZW0gdHdvIFtsaW5rXShgO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnKScpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ29yZGVyZWQgbGlzdCB3aXRoIGluY29tcGxldGUgbGluayB0YXJnZXQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSBgMS4gbGlzdCBpdGVtIG9uZVxuMi4gaXRlbSB0d28gW2xpbmtdKGA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICcpJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnb3JkZXJlZCBsaXN0IHdpdGggZXh0cmEgd2hpdGVzcGFjZScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9IGAxLiBsaXN0IGl0ZW0gb25lXG4yLiBpdGVtIHR3byBbbGlua10oYDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgJyknKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdsaXN0IHdpdGggZXh0cmEgd2hpdGVzcGFjZScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9IGAtIGxpc3QgaXRlbSBvbmVcbi0gaXRlbSB0d28gW2xpbmtdKGA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICcpJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnbGlzdCB3aXRoIGluY29tcGxldGUgbGluayB3aXRoIG90aGVyIHN0dWZmJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gYC0gbGlzdCBpdGVtIG9uZVxuLSBpdGVtIHR3byBbXFxgbGlua2A7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICdcXGBdKGh0dHBzOi8vbWljcm9zb2Z0LmNvbSknKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdvcmRlcmVkIGxpc3Qgd2l0aCBpbmNvbXBsZXRlIGxpbmsgd2l0aCBvdGhlciBzdHVmZicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9IGAxLiBsaXN0IGl0ZW0gb25lXG4xLiBpdGVtIHR3byBbXFxgbGlua2A7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICdcXGBdKGh0dHBzOi8vbWljcm9zb2Z0LmNvbSknKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdsaXN0IHdpdGggYm9sZCBpbmNvbXBsZXRlIGxpbmsgdGFyZ2V0JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gYC0gbGlzdCBpdGVtIG9uZVxuLSAqKltsaW5rXShodHRwOi8vbWljcm9zb2Z0YDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgJykqKicpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ29yZGVyZWQgbGlzdCB3aXRoIGJvbGQgaW5jb21wbGV0ZSBsaW5rIHRhcmdldCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9IGAxLiBsaXN0IGl0ZW0gb25lXG4yLiAqKltsaW5rXShodHRwOi8vbWljcm9zb2Z0YDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgJykqKicpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2xpc3Qgd2l0aCBpbmNvbXBsZXRlIHN1Yml0ZW0nLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSBgMS4gbGlzdCBpdGVtIG9uZVxuXHQtIGA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICcmbmJzcDsnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdsaXN0IHdpdGggaW5jb21wbGV0ZSBuZXN0ZWQgc3ViaXRlbScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9IGAxLiBsaXN0IGl0ZW0gb25lXG5cdC0gaXRlbSAyXG5cdFx0LSBgO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnJm5ic3A7Jyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgndGV4dCB3aXRoIHN0YXJ0IG9mIGxpc3QgaXMgbm90IGEgaGVhZGluZycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9IGBoZWxsb1xcbi0gYDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgJyAmbmJzcDsnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdldmVuIG1vcmUgdGV4dCB3aXRoIHN0YXJ0IG9mIGxpc3QgaXMgbm90IGEgaGVhZGluZycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9IGAjIGhlbGxvXFxuXFxudGV4dFxcbi1gO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnICZuYnNwOycpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnYmxvY2txdW90ZScsICgpID0+IHtcblx0XHRcdHRlc3QoJ2luY29tcGxldGUgZG91YmxlIHN0YXInLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSAnPiAqKnRleHQnO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnKionKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdpbmNvbXBsZXRlIGRvdWJsZSBzdGFyIGJlZm9yZSB0cmFpbGluZyBxdW90ZS1vbmx5IGxpbmVzJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gJz4gKip0ZXh0XFxuPlxcbj4nO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKCc+ICoqdGV4dCoqXFxuPlxcbj4nKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdwcmVzZXJ2ZXMgcmVmZXJlbmNlIGxpbmtzIHdoZW4gY29tcGxldGluZyBpbmxpbmUgdG9rZW5zJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gJ1tpZF06IGh0dHBzOi8vZXhhbXBsZS5jb21cXG5cXG4+IFtsYWJlbF1baWRdICoqdGV4dCc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICcqKicpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnY29kZXNwYW4nLCAoKSA9PiB7XG5cdFx0XHRzaW1wbGVNYXJrZG93blRlc3RTdWl0ZSgnY29kZXNwYW4nLCAnYCcpO1xuXG5cdFx0XHR0ZXN0KGBiYWNrdGljayBiZXR3ZWVuIGxldHRlcnNgLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSAnYWBiJztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcih0ZXh0KTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlQ29kZXNwYW5Ub2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQgKyAnYCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVDb2Rlc3BhblRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdChgbmVzdGVkIHBhdHRlcm5gLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSAnc2xka2Zqc2QgYGFiYyBfX2RlZl9fIGdoaSc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCArICdgJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnY29kZXNwYW4gaW5zaWRlIDxib2R5PiB3cmFwcGVkIG1hcmtkb3duJywgKCkgPT4ge1xuXHRcdFx0XHQvLyBUaGUgY2hhdCBjb250ZW50IHJlbmRlcmVyIHdyYXBzIGBzdXBwb3J0SHRtbGAgbWFya2Rvd24gaW5cblx0XHRcdFx0Ly8gYDxib2R5Pi4uLjwvYm9keT5gIHNvIGRvbXB1cmlmeSBrZWVwcyBsZWFkaW5nIGNvbW1lbnRzLiBUaGF0XG5cdFx0XHRcdC8vIG1ha2VzIGA8L2JvZHk+YCB0aGUgbGl0ZXJhbCBsYXN0IHRva2VuIFx1MjAxNCB0aGUgcGFyYWdyYXBoIHdpdGhcblx0XHRcdFx0Ly8gdGhlIGJhcmUgYmFja3RpY2sgaXMgbm8gbG9uZ2VyIGF0IHRoZSBlbmQuIFRoZSBmaXh1cCBtdXN0XG5cdFx0XHRcdC8vIHN0aWxsIGNsb3NlIHRoZSBjb2Rlc3BhbiB3aGlsZSBwcmVzZXJ2aW5nIHRoZSB0cmFpbGluZyBodG1sLlxuXHRcdFx0XHRjb25zdCB0ZXh0ID0gJzxib2R5PlxcblxcbkNyZWF0ZWQgaXNvbGF0ZWQgd29ya3RyZWUgZm9yIGJyYW5jaCBgeHl6XFxuXFxuPC9ib2R5Pic7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoJzxib2R5PlxcblxcbkNyZWF0ZWQgaXNvbGF0ZWQgd29ya3RyZWUgZm9yIGJyYW5jaCBgeHl6YFxcblxcbjwvYm9keT4nKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ3N0YXInLCAoKSA9PiB7XG5cdFx0XHRzaW1wbGVNYXJrZG93blRlc3RTdWl0ZSgnc3RhcicsICcqJyk7XG5cblx0XHRcdHRlc3QoYHN0YXIgYmV0d2VlbiBsZXR0ZXJzYCwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gJ3NsZGtmanNkIGEqYic7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCArICcqJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdChgbmVzdGVkIHBhdHRlcm5gLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSAnc2xka2Zqc2QgKmFiYyBfX2RlZl9fIGdoaSc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCArICcqJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdkb3VibGUgc3RhcicsICgpID0+IHtcblx0XHRcdHNpbXBsZU1hcmtkb3duVGVzdFN1aXRlKCdkb3VibGUgc3RhcicsICcqKicpO1xuXG5cdFx0XHR0ZXN0KGBkb3VibGUgc3RhciBiZXR3ZWVuIGxldHRlcnNgLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSAnYSoqYic7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCArICcqKicpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRPRE8gdHJpbSB0aGVzZSBwYXR0ZXJucyBmcm9tIGVuZFxuXHRcdFx0dGVzdC5za2lwKGBlbmRpbmcgaW4gZG91Ymxlc3RhcmAsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9IGBzb21lIHRleHQgYW5kICoqYDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlLnRyaW1FbmQoKSArICcqKicpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgndW5kZXJzY29yZScsICgpID0+IHtcblx0XHRcdHNpbXBsZU1hcmtkb3duVGVzdFN1aXRlKCd1bmRlcnNjb3JlJywgJ18nKTtcblxuXHRcdFx0dGVzdChgdW5kZXJzY29yZSBiZXR3ZWVuIGxldHRlcnNgLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBgdGhpc19ub3RfaXRhbGljc2A7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgdG9rZW5zKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2RvdWJsZSB1bmRlcnNjb3JlJywgKCkgPT4ge1xuXHRcdFx0c2ltcGxlTWFya2Rvd25UZXN0U3VpdGUoJ2RvdWJsZSB1bmRlcnNjb3JlJywgJ19fJyk7XG5cblx0XHRcdHRlc3QoYGRvdWJsZSB1bmRlcnNjb3JlIGJldHdlZW4gbGV0dGVyc2AsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IGB0aGlzX19ub3RfX2JvbGRgO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIHRva2Vucyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdsaW5rJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnaW5jb21wbGV0ZSBsaW5rIHRleHQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSAnYWJjIFt0ZXh0Jztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgJ10oaHR0cHM6Ly9taWNyb3NvZnQuY29tKScpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2luY29tcGxldGUgbGluayB0YXJnZXQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSAnZm9vIFt0ZXh0XShodHRwOi8vbWljcm9zb2Z0Jztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgJyknKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdpbmNvbXBsZXRlIGxpbmsgdGFyZ2V0IDInLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSAnZm9vIFt0ZXh0XShodHRwOi8vbWljcm9zb2Z0LmNvbSc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICcpJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnaW5jb21wbGV0ZSBsaW5rIHRhcmdldCBpbnNpZGUgcGFyZW50aGVzZXMnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSAnKFt0ZXh0XShodHRwOi8vbWljcm9zb2Z0LmNvbSc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICcpJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnaW5jb21wbGV0ZSBsaW5rIHRhcmdldCB3aXRoIGV4dHJhIHN0dWZmJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gJ1tiZWZvcmUgYHRleHRgIGFmdGVyXShodHRwOi8vbWljcm9zb2Z0LmNvbSc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICcpJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnaW5jb21wbGV0ZSBsaW5rIHRhcmdldCB3aXRoIGV4dHJhIHN0dWZmIGFuZCBpbmNvbXBsZXRlIGFyZycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9ICdbYmVmb3JlIGB0ZXh0YCBhZnRlcl0oaHR0cDovL21pY3Jvc29mdC5jb20gXCJtb3JlIHRleHQgJztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgJ1wiKScpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2luY29tcGxldGUgbGluayB0YXJnZXQgd2l0aCBpbmNvbXBsZXRlIGFyZycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9ICdmb28gW3RleHRdKGh0dHA6Ly9taWNyb3NvZnQuY29tIFwibW9yZSB0ZXh0IGhlcmUgJztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgJ1wiKScpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2luY29tcGxldGUgbGluayB0YXJnZXQgd2l0aCBpbmNvbXBsZXRlIGFyZyAyJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gJ1t0ZXh0XShjb21tYW5kOnZzY29kZS5vcGVuUmVsYXRpdmVQYXRoIFwiYXJnJztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgJ1wiKScpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2luY29tcGxldGUgbGluayB0YXJnZXQgd2l0aCBjb21wbGV0ZSBhcmcnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSAnZm9vIFt0ZXh0XShodHRwOi8vbWljcm9zb2Z0LmNvbSBcIm1vcmUgdGV4dCBoZXJlXCInO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnKScpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2xpbmsgdGV4dCB3aXRoIGluY29tcGxldGUgY29kZXNwYW4nLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSBgdGV4dCBbXFxgY29kZXNwYW5gO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnYF0oaHR0cHM6Ly9taWNyb3NvZnQuY29tKScpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2xpbmsgdGV4dCB3aXRoIGluY29tcGxldGUgc3R1ZmYnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSBgdGV4dCBbbW9yZSB0ZXh0IFxcYGNvZGVzcGFuXFxgIHRleHQgKipib2xkYDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgJyoqXShodHRwczovL21pY3Jvc29mdC5jb20pJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnTG9va3MgbGlrZSBpbmNvbXBsZXRlIGxpbmsgdGFyZ2V0IGJ1dCBpc25cXCd0JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb21wbGV0ZSA9ICcqKmJvbGQqKiBgY29kZXNwYW5gIHRleHRdKCc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGNvbXBsZXRlKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdpbmNvbXBsZXRlIGxpbmsgaW4gbGlzdCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9ICctIFt0ZXh0Jztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgJ10oaHR0cHM6Ly9taWNyb3NvZnQuY29tKScpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2luY29tcGxldGUgbGluayB0YXJnZXQgaW5zaWRlIGJvbGQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSAnKipbdGV4dF0oaHR0cDovL21pY3Jvc29mdCc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICcpKionKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdpbmNvbXBsZXRlIGxpbmsgdGFyZ2V0IHdpdGggYXJnIGluc2lkZSBib2xkJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gJyoqW3RleHRdKGh0dHA6Ly9taWNyb3NvZnQuY29tIFwibW9yZSB0ZXh0ICc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICdcIikqKicpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3NxdWFyZSBicmFjZSBiZXR3ZWVuIGxldHRlcnMnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSAnYVtiJztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCB0b2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3NxdWFyZSBicmFjZSBvbiBwcmV2aW91cyBsaW5lJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gJ3RleHRbXFxubW9yZSB0ZXh0Jztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCB0b2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3NxdWFyZSBicmFjZXMgaW4gdGV4dCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9ICdoZWxsbyBbd2hhdF0gaXMgZ29pbmcgb24nO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIHRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnY29tcGxldGUgbGluaycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9ICd0ZXh0IFtsaW5rXShodHRwOi8vbWljcm9zb2Z0LmNvbSknO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIHRva2Vucyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHdCQUF3QixnQkFBZ0IseUJBQXlCO0FBQzFFLFNBQTBCLHNCQUFzQjtBQUNoRCxZQUFZLFlBQVk7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsYUFBYTtBQUN0QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyxVQUFVLEtBQTBCO0FBQzVDLFNBQU8sSUFBSSxVQUFVLEVBQUUsZ0JBQWdCLEtBQUssV0FBVyxFQUFFLEtBQUs7QUFDL0Q7QUFFQSxTQUFTLGlCQUFpQixZQUF5QixjQUFzQjtBQUN4RSxRQUFNLGVBQWUsVUFBVSxZQUFZO0FBQzNDLFNBQU87QUFBQSxJQUNOLFdBQVcsWUFBWSxZQUFZO0FBQUEsSUFDbkMsYUFBYSxhQUFhLFNBQVM7QUFBQSxVQUFhLFdBQVcsU0FBUztBQUFBLEVBQUU7QUFDeEU7QUFFQSxNQUFNLG9CQUFvQixNQUFNO0FBRS9CLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsUUFBTSxnQkFBZ0IsTUFBTTtBQUMzQixTQUFLLGlEQUFpRCxNQUFNO0FBQzNELFlBQU0sV0FBVyxFQUFFLE9BQU8sMENBQTBDO0FBQ3BFLFlBQU0sU0FBc0IsTUFBTSxJQUFJLGVBQWUsUUFBUSxDQUFDLEVBQUU7QUFDaEUsYUFBTyxZQUFZLE9BQU8sV0FBVywwQkFBMEI7QUFBQSxJQUNoRSxDQUFDO0FBRUQsU0FBSyx5REFBeUQsTUFBTTtBQUNuRSxZQUFNLFdBQVcsRUFBRSxPQUFPLG9GQUFvRjtBQUM5RyxZQUFNLFNBQXNCLE1BQU0sSUFBSSxlQUFlLFFBQVEsQ0FBQyxFQUFFO0FBRWhFLGFBQU8sWUFBWSxPQUFPLGNBQWMsR0FBRyxHQUFHLElBQUk7QUFBQSxJQUNuRCxDQUFDO0FBRUQsU0FBSyx3RUFBd0UsTUFBTTtBQUNsRixZQUFNLFdBQVcsRUFBRSxPQUFPLG9GQUFvRjtBQUM5RyxZQUFNLFNBQXNCLE1BQU0sSUFBSSxlQUFlLFVBQVU7QUFBQSxRQUM5RCxpQkFBaUI7QUFBQSxVQUNoQixvQkFBb0IsRUFBRSxTQUFTLENBQUMsbUJBQW1CLEVBQUU7QUFBQSxRQUN0RDtBQUFBLE1BQ0QsQ0FBQyxDQUFDLEVBQUU7QUFDSixZQUFNLFNBQVMsT0FBTyxjQUFjLEdBQUc7QUFDdkMsYUFBTyxHQUFHLFFBQVEscURBQXFEO0FBQ3ZFLGFBQU8sWUFBWSxPQUFRLFFBQVEsTUFBTSwwRUFBMEU7QUFBQSxJQUNwSCxDQUFDO0FBRUQsU0FBSywyRUFBMkUsTUFBTTtBQUNyRixZQUFNLFdBQVcsRUFBRSxPQUFPLDBHQUEwRztBQUNwSSxZQUFNLFNBQVMsTUFBTSxJQUFJLGVBQWUsVUFBVTtBQUFBLFFBQ2pELGNBQWMsVUFBUSxTQUFTLGlCQUFpQiw2QkFBNkI7QUFBQSxNQUM5RSxDQUFDLENBQUMsRUFBRTtBQUNKLFlBQU0sU0FBUyxPQUFPLGNBQWMsR0FBRztBQUN2QyxhQUFPO0FBQUEsUUFDTjtBQUFBLFVBQ0MsYUFBYSxPQUFPLGlCQUFpQixHQUFHLEVBQUU7QUFBQSxVQUMxQyxNQUFNLFFBQVE7QUFBQSxVQUNkLE1BQU0sUUFBUSxRQUFRO0FBQUEsVUFDdEIsT0FBTyxRQUFRO0FBQUEsVUFDZixPQUFPLE9BQU8sY0FBYyxLQUFLLEdBQUc7QUFBQSxVQUNwQyxZQUFZLE9BQU8sY0FBYyxLQUFLLEdBQUcsYUFBYSxPQUFPO0FBQUEsVUFDN0QsYUFBYSxPQUFPLGNBQWMsS0FBSyxHQUFHLGFBQWEsUUFBUTtBQUFBLFFBQ2hFO0FBQUEsUUFDQTtBQUFBLFVBQ0MsYUFBYTtBQUFBLFVBQ2IsTUFBTTtBQUFBLFVBQ04sTUFBTTtBQUFBLFVBQ04sT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFVBQ1AsWUFBWTtBQUFBLFVBQ1osYUFBYTtBQUFBLFFBQ2Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxVQUFVLE1BQU07QUFDckIsU0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxZQUFNLFdBQVcsRUFBRSxPQUFPLGlEQUFpRDtBQUMzRSxZQUFNLFNBQXNCLE1BQU0sSUFBSSxlQUFlLFFBQVEsQ0FBQyxFQUFFO0FBQ2hFLHVCQUFpQixRQUFRLHNGQUFzRjtBQUFBLElBQ2hILENBQUM7QUFFRCxTQUFLLHFEQUFxRCxNQUFNO0FBQy9ELFlBQU0sV0FBVyxFQUFFLE9BQU8sdUNBQXVDO0FBQ2pFLFlBQU0sU0FBc0IsTUFBTSxJQUFJLGVBQWUsUUFBUSxDQUFDLEVBQUU7QUFDaEUsdUJBQWlCLFFBQVEsc0VBQXNFO0FBQUEsSUFDaEcsQ0FBQztBQUVELFNBQUssaUNBQWlDLE1BQU07QUFDM0MsWUFBTSxTQUFzQixNQUFNLElBQUksZUFBZSxFQUFFLE9BQU8sNkRBQTZELENBQUMsQ0FBQyxFQUFFO0FBQy9ILHVCQUFpQixRQUFRLGtHQUFrRztBQUFBLElBQzVILENBQUM7QUFFRCxTQUFLLGtDQUFrQyxNQUFNO0FBQzVDLFlBQU0sU0FBc0IsTUFBTSxJQUFJLGVBQWUsRUFBRSxPQUFPLDREQUE0RCxDQUFDLENBQUMsRUFBRTtBQUM5SCx1QkFBaUIsUUFBUSxtR0FBbUc7QUFBQSxJQUM3SCxDQUFDO0FBRUQsU0FBSyw0Q0FBNEMsTUFBTTtBQUN0RCxZQUFNLFNBQXNCLE1BQU0sSUFBSSxlQUFlLEVBQUUsT0FBTyxzRUFBc0UsQ0FBQyxDQUFDLEVBQUU7QUFDeEksdUJBQWlCLFFBQVEsK0dBQStHO0FBQUEsSUFDekksQ0FBQztBQUVELFNBQUssd0RBQXdELE1BQU07QUFDbEUsVUFBSSxPQUFPO0FBQ1Y7QUFBQSxNQUNEO0FBQ0EsWUFBTSxTQUFzQixNQUFNLElBQUksZUFBZSxFQUFFLE9BQU8sbUNBQW1DLENBQUMsQ0FBQyxFQUFFO0FBQ3JHLHVCQUFpQixRQUFRLG1GQUFtRjtBQUFBLElBQzdHLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHVCQUF1QixNQUFNO0FBQ2xDLFVBQU0sMEJBQTBCLENBQUMsTUFBYyxTQUF1QztBQUNyRixZQUFNLFVBQVUsU0FBUyxjQUFjLE1BQU07QUFDN0MsY0FBUSxjQUFjO0FBQ3RCLGFBQU8sUUFBUSxRQUFRLE9BQU87QUFBQSxJQUMvQjtBQUVBLFNBQUsseURBQXlELE1BQU07QUFDbkUsWUFBTSxXQUFXLEVBQUUsT0FBTyxxQkFBcUI7QUFDL0MsYUFBTyxJQUFJLFFBQWMsYUFBVztBQUNuQyxjQUFNLElBQUksZUFBZSxVQUFVO0FBQUEsVUFDbEMscUJBQXFCO0FBQUEsVUFDckIsbUJBQW1CO0FBQUEsUUFDcEIsQ0FBQyxDQUFDO0FBQUEsTUFDSCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSywrRUFBK0UsTUFBTTtBQUN6RixZQUFNLFdBQVcsRUFBRSxPQUFPLHFCQUFxQjtBQUMvQyxhQUFPLElBQUksUUFBYyxDQUFDLFNBQVMsV0FBVztBQUM3QyxjQUFNLFNBQVMsZUFBZSxVQUFVO0FBQUEsVUFDdkMscUJBQXFCO0FBQUEsVUFDckIsbUJBQW1CO0FBQUEsUUFDcEIsQ0FBQztBQUNELGVBQU8sUUFBUTtBQUNmLG1CQUFXLFNBQVMsRUFBRTtBQUFBLE1BQ3ZCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLGdHQUFnRyxNQUFNO0FBQzFHLFlBQU0sV0FBVyxFQUFFLE9BQU8scUJBQXFCO0FBQy9DLGFBQU8sSUFBSSxRQUFjLENBQUMsU0FBUyxXQUFXO0FBQzdDLFlBQUk7QUFDSixjQUFNLFNBQVMsZUFBZSxVQUFVO0FBQUEsVUFDdkMscUJBQXFCO0FBQUEsVUFDckIsbUJBQW1CLE1BQU07QUFDeEIsbUJBQU8sSUFBSSxRQUFRLENBQUFBLGFBQVc7QUFDN0IsMENBQTRCQTtBQUFBLFlBQzdCLENBQUM7QUFBQSxVQUNGO0FBQUEsUUFDRCxDQUFDO0FBQ0QsbUJBQVcsTUFBTTtBQUNoQixpQkFBTyxRQUFRO0FBQ2Ysb0NBQTBCLFNBQVMsY0FBYyxNQUFNLENBQUM7QUFDeEQscUJBQVcsU0FBUyxFQUFFO0FBQUEsUUFDdkIsR0FBRyxFQUFFO0FBQUEsTUFDTixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyx3REFBd0QsWUFBWTtBQUN4RSxZQUFNLFdBQVcsRUFBRSxPQUFPLHNDQUFzQztBQUNoRSxZQUFNLE9BQU8sTUFBTSxJQUFJLFFBQWdCLGFBQVc7QUFDakQsY0FBTSxJQUFJLGVBQWUsVUFBVTtBQUFBLFVBQ2xDLG1CQUFtQixPQUFPQyxPQUFNLFVBQVU7QUFDekMsb0JBQVFBLEtBQUk7QUFDWixtQkFBTyx3QkFBd0JBLE9BQU0sS0FBSztBQUFBLFVBQzNDO0FBQUEsUUFDRCxDQUFDLENBQUM7QUFBQSxNQUNILENBQUM7QUFDRCxhQUFPLFlBQVksTUFBTSxJQUFJO0FBQUEsSUFDOUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0seUJBQXlCLE1BQU07QUFFcEMsU0FBSyxxQkFBcUIsTUFBTTtBQUMvQixZQUFNLE1BQU0sSUFBSSxlQUFlLFFBQVcsRUFBRSxtQkFBbUIsS0FBSyxDQUFDO0FBQ3JFLFVBQUksV0FBVyxtQ0FBbUM7QUFFbEQsWUFBTSxTQUFzQixNQUFNLElBQUksZUFBZSxHQUFHLENBQUMsRUFBRTtBQUMzRCxhQUFPLFlBQVksT0FBTyxXQUFXLG1FQUFtRTtBQUFBLElBQ3pHLENBQUM7QUFFRCxTQUFLLHlCQUF5QixNQUFNO0FBQ25DLFlBQU0sTUFBTSxJQUFJLGVBQWUsUUFBVyxFQUFFLG1CQUFtQixLQUFLLENBQUM7QUFDckUsVUFBSSxlQUFlLG1DQUFtQztBQUV0RCxZQUFNLFNBQXNCLE1BQU0sSUFBSSxlQUFlLEdBQUcsQ0FBQyxFQUFFO0FBQzNELGFBQU8sWUFBWSxPQUFPLFdBQVcsZ0hBQWdIO0FBQUEsSUFDdEosQ0FBQztBQUVELFNBQUssMkNBQTJDLE1BQU07QUFDckQsWUFBTSxNQUFNLElBQUksZUFBZSxRQUFXLEVBQUUsbUJBQW1CLEtBQUssQ0FBQztBQUNyRSxVQUFJLGVBQWUscUNBQXFDO0FBRXhELFlBQU0sU0FBc0IsTUFBTSxJQUFJLGVBQWUsR0FBRyxDQUFDLEVBQUU7QUFDM0QsYUFBTyxZQUFZLE9BQU8sV0FBVyw2RUFBNkU7QUFBQSxJQUNuSCxDQUFDO0FBRUQsU0FBSyx1QkFBdUIsTUFBTTtBQUNqQyxZQUFNLE1BQU0sSUFBSSxlQUFlLFFBQVcsRUFBRSxtQkFBbUIsS0FBSyxDQUFDO0FBQ3JFLFVBQUksZUFBZSxzQkFBc0I7QUFFekMsWUFBTSxTQUFzQixNQUFNLElBQUksZUFBZSxHQUFHLENBQUMsRUFBRTtBQUMzRCxhQUFPLFlBQVksT0FBTyxXQUFXLHdIQUF3SDtBQUFBLElBQzlKLENBQUM7QUFFRCxTQUFLLHdCQUF3QixNQUFNO0FBQ2xDLFlBQU0sTUFBTSxJQUFJLGVBQWUsUUFBVyxFQUFFLG1CQUFtQixLQUFLLENBQUM7QUFDckUsVUFBSSxlQUFlO0FBQUE7QUFBQTtBQUFBLGtDQUdZO0FBRS9CLFlBQU0sU0FBc0IsTUFBTSxJQUFJLGVBQWUsR0FBRyxDQUFDLEVBQUU7QUFDM0QsYUFBTyxZQUFZLE9BQU8sV0FBVztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxDQVl2QztBQUFBLElBQ0MsQ0FBQztBQUVELFNBQUssNkNBQTZDLE1BQU07QUFDdkQsWUFBTSxNQUFNLElBQUksZUFBZSxRQUFXLEVBQUUsbUJBQW1CLE1BQU0sYUFBYSxLQUFLLENBQUM7QUFDeEYsVUFBSSxlQUFlLGdCQUFnQjtBQUVuQyxZQUFNLFNBQXNCLE1BQU0sSUFBSSxlQUFlLEdBQUcsQ0FBQyxFQUFFO0FBQzNELGFBQU8sWUFBWSxPQUFPLFdBQVcsbURBQW1EO0FBQUEsSUFDekYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sMEJBQTBCLE1BQU07QUFFckMsU0FBSyxxQkFBcUIsTUFBTTtBQUMvQixZQUFNLE1BQU0sSUFBSSxlQUFlLFFBQVcsRUFBRSxtQkFBbUIsTUFBTSxDQUFDO0FBQ3RFLFVBQUksV0FBVyxtQ0FBbUM7QUFFbEQsWUFBTSxTQUFzQixNQUFNLElBQUksZUFBZSxHQUFHLENBQUMsRUFBRTtBQUMzRCxhQUFPLFlBQVksT0FBTyxXQUFXLG1FQUFtRTtBQUFBLElBQ3pHLENBQUM7QUFFRCxTQUFLLDJDQUEyQyxNQUFNO0FBQ3JELFlBQU0sTUFBTSxJQUFJLGVBQWUsUUFBVyxFQUFFLG1CQUFtQixNQUFNLENBQUM7QUFDdEUsVUFBSSxlQUFlLHFDQUFxQztBQUV4RCxZQUFNLFNBQXNCLE1BQU0sSUFBSSxlQUFlLEdBQUcsQ0FBQyxFQUFFO0FBQzNELGFBQU8sWUFBWSxPQUFPLFdBQVcsMENBQTBDO0FBQUEsSUFDaEYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sVUFBVSxNQUFNO0FBQ3JCLFNBQUssNkRBQTZELE1BQU07QUFDdkUsWUFBTSxXQUFXLElBQUksZUFBZSxxQ0FBcUMsRUFBRSxvQkFBb0IsS0FBSyxDQUFDO0FBQ3JHLFlBQU0sU0FBUyxNQUFNLElBQUksZUFBZSxRQUFRLENBQUMsRUFBRTtBQUVuRCxZQUFNLGFBQWEsT0FBTyxjQUFjLGtDQUFrQztBQUMxRSxhQUFPLEdBQUcsWUFBWSxrREFBa0Q7QUFDeEUsYUFBTyxHQUFHLE9BQU8sVUFBVSxTQUFTLHNCQUFzQixHQUFHLDJCQUEyQjtBQUN4RixhQUFPLEdBQUcsT0FBTyxVQUFVLFNBQVMsY0FBYyxHQUFHLDBCQUEwQjtBQUFBLElBQ2hGLENBQUM7QUFFRCxTQUFLLHdFQUF3RSxNQUFNO0FBQ2xGLFlBQU0sV0FBVyxJQUFJLGVBQWUsa0RBQWtEO0FBQ3RGLFlBQU0sU0FBUyxNQUFNLElBQUksZUFBZSxRQUFRLENBQUMsRUFBRTtBQUVuRCxZQUFNLGFBQWEsT0FBTyxjQUFjLFlBQVk7QUFDcEQsYUFBTyxHQUFHLFlBQVksd0JBQXdCO0FBQzlDLGFBQU8sWUFBWSxZQUFZLGFBQWEsZUFBZSxHQUFHLE1BQU0seUNBQXlDO0FBQzdHLGFBQU8sR0FBRyxPQUFPLFVBQVUsU0FBUyxTQUFTLEdBQUcscUNBQXFDO0FBQUEsSUFDdEYsQ0FBQztBQUVELFNBQUsseURBQXlELE1BQU07QUFDbkUsWUFBTSxXQUFXLElBQUksZUFBZSxrQ0FBa0MsRUFBRSxvQkFBb0IsS0FBSyxDQUFDO0FBQ2xHLFlBQU0sU0FBUyxNQUFNLElBQUksZUFBZSxRQUFRLENBQUMsRUFBRTtBQUVuRCxZQUFNLGFBQWEsT0FBTyxjQUFjLFlBQVk7QUFDcEQsYUFBTyxZQUFZLFlBQVksYUFBYSxlQUFlLEdBQUcsTUFBTSx5Q0FBeUM7QUFBQSxJQUM5RyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywyQ0FBMkMsV0FBWTtBQUUzRCxVQUFNLEtBQXNCLEtBQUssTUFBTSw2MkNBQTYyQztBQUNwNUMsVUFBTSxVQUFVLE1BQU0sSUFBSSxlQUFlLEVBQUUsQ0FBQyxFQUFFO0FBRTlDLFVBQU0sU0FBUyxRQUFRLGNBQWMsR0FBRztBQUN4QyxXQUFPLEdBQUcsTUFBTTtBQUNoQixXQUFPLEdBQUcsT0FBTyxRQUFRLE1BQU0sQ0FBQztBQUVoQyxVQUFNLE1BQU0sSUFBSSxNQUFNLE9BQU8sUUFBUSxNQUFNLENBQUU7QUFFN0MsVUFBTSxPQUE2QyxNQUFNLG1CQUFtQixJQUFJLEtBQUssQ0FBQztBQUN0RixXQUFPLEdBQUcsSUFBSTtBQUNkLFdBQU8sWUFBWSxLQUFLLFFBQVEsTUFBTTtBQUN0QyxXQUFPLEdBQUcsS0FBSyxZQUFZLFNBQVMsRUFBRSxXQUFXLGVBQWUsQ0FBQztBQUFBLEVBQ2xFLENBQUM7QUFFRCxPQUFLLDhDQUE4QyxNQUFNO0FBQ3hELFVBQU0sS0FBSyxJQUFJLGVBQWUsa0VBQWtFO0FBQUEsTUFDL0YsYUFBYTtBQUFBLElBQ2QsQ0FBQztBQUVELFVBQU0sU0FBc0IsTUFBTSxJQUFJLGVBQWUsRUFBRSxDQUFDLEVBQUU7QUFDMUQsV0FBTyxZQUFZLE9BQU8sV0FBVywwQkFBMEI7QUFBQSxFQUNoRSxDQUFDO0FBRUQsT0FBSyxrREFBa0QsTUFBTTtBQUM1RCxVQUFNLEtBQUssSUFBSSxlQUFlLGtFQUFrRTtBQUFBLE1BQy9GLFdBQVc7QUFBQSxNQUNYLGFBQWE7QUFBQSxJQUNkLENBQUM7QUFFRCxVQUFNLFNBQXNCLE1BQU0sSUFBSSxlQUFlLEVBQUUsQ0FBQyxFQUFFO0FBQzFELFdBQU8sWUFBWSxPQUFPLFdBQVcsdUlBQXVJO0FBQUEsRUFDN0ssQ0FBQztBQUVELE9BQUssd0RBQXdELE1BQU07QUFDbEUsVUFBTSxLQUFLLElBQUksZUFBZSx5Q0FBeUM7QUFBQSxNQUN0RSxXQUFXO0FBQUEsTUFDWCxhQUFhO0FBQUEsSUFDZCxDQUFDO0FBRUQsVUFBTSxTQUFTLE1BQU0sSUFBSSxlQUFlLEVBQUUsQ0FBQyxFQUFFO0FBQzdDLFdBQU8sWUFBWSxPQUFPLFdBQVcsaUJBQWlCO0FBQUEsRUFDdkQsQ0FBQztBQUVELE9BQUssbURBQW1ELE1BQU07QUFDN0QsVUFBTSxLQUFLLElBQUksZUFBZSw2REFBNkQ7QUFBQSxNQUMxRixXQUFXO0FBQUEsTUFDWCxhQUFhO0FBQUEsSUFDZCxDQUFDO0FBQ0QsT0FBRyxVQUFVLElBQUksTUFBTSwyQkFBMkI7QUFFbEQsVUFBTSxTQUFTLE1BQU0sSUFBSSxlQUFlLEVBQUUsQ0FBQyxFQUFFO0FBQzdDLFdBQU8sWUFBWSxPQUFPLFdBQVcsOE1BQThNO0FBQUEsRUFDcFAsQ0FBQztBQUVELE9BQUssMkRBQTJELE1BQU07QUFDckUsVUFBTSxVQUFVLElBQUksS0FBSyw2QkFBNkI7QUFDdEQsVUFBTSxLQUFLLElBQUksZUFBZSxTQUFTLFFBQVEsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBRWhFLFVBQU0sU0FBUyxNQUFNLElBQUksZUFBZSxFQUFFLENBQUMsRUFBRTtBQUM3QyxVQUFNLFNBQVMsT0FBTyxjQUFjLEdBQUc7QUFDdkMsV0FBTyxHQUFHLE1BQU07QUFDaEIsV0FBTyxZQUFZLE9BQU8sT0FBTyxRQUFRLE1BQU07QUFBQSxFQUNoRCxDQUFDO0FBRUQsT0FBSyx3RUFBd0UsTUFBTTtBQUNsRixVQUFNLFVBQVUsSUFBSSxLQUFLLDZCQUE2QjtBQUN0RCxVQUFNLEtBQUssSUFBSSxlQUFlLFNBQVMsUUFBUSxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUM7QUFFcEUsVUFBTSxTQUFTLE1BQU0sSUFBSSxlQUFlLEVBQUUsQ0FBQyxFQUFFO0FBQzdDLFVBQU0sU0FBUyxPQUFPLGNBQWMsR0FBRztBQUN2QyxXQUFPLEdBQUcsTUFBTTtBQUNoQixXQUFPLFlBQVksT0FBTyxPQUFPLEdBQUcsUUFBUSxNQUFNLE1BQU07QUFBQSxFQUN6RCxDQUFDO0FBRUQsT0FBSyx3REFBd0QsTUFBTTtBQUNsRSxVQUFNLFVBQVUsSUFBSSxLQUFLLDZCQUE2QjtBQUN0RCxVQUFNLEtBQUssSUFBSSxlQUFlLFNBQVMsUUFBUSxTQUFTLENBQUMsd0JBQXdCLENBQUMsQ0FBQztBQUVuRixVQUFNLFNBQVMsTUFBTSxJQUFJLGVBQWUsRUFBRSxDQUFDLEVBQUU7QUFDN0MsVUFBTSxTQUFTLE9BQU8sY0FBYyxHQUFHO0FBQ3ZDLFdBQU8sR0FBRyxNQUFNO0FBQ2hCLFdBQU8sWUFBWSxPQUFPLE9BQU8sa0JBQWtCO0FBQUEsRUFDcEQsQ0FBQztBQUVELFFBQU0sMkJBQTJCLE1BQU07QUFFdEMsU0FBSywySUFBMkksTUFBTTtBQUNySixZQUFNLFdBQVcsRUFBRSxPQUFPLHlIQUF5SDtBQUNuSixZQUFNLFdBQVc7QUFDakIsWUFBTSxTQUFpQixrQkFBa0IsUUFBUTtBQUNqRCxhQUFPLFlBQVksUUFBUSxRQUFRO0FBQUEsSUFDcEMsQ0FBQztBQUVELFNBQUsscURBQXFELE1BQU07QUFDL0QsWUFBTSxXQUFXLEVBQUUsT0FBTyxnRUFBZ0U7QUFDMUYsWUFBTSxXQUFXO0FBQ2pCLFlBQU0sU0FBaUIsa0JBQWtCLFFBQVE7QUFDakQsYUFBTyxZQUFZLFFBQVEsUUFBUTtBQUFBLElBQ3BDLENBQUM7QUFFRCxTQUFLLGdEQUFnRCxNQUFNO0FBQzFELFlBQU0sV0FBVztBQUFBLFFBQ2hCLE9BQU87QUFBQSxVQUNOO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNELEVBQUUsS0FBSyxJQUFJO0FBQUEsTUFDWjtBQUNBLFlBQU0sV0FBVztBQUFBLFFBQ2hCO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJO0FBQ1gsWUFBTSxTQUFpQixrQkFBa0IsVUFBVSxFQUFFLHlCQUF5QixLQUFLLENBQUM7QUFDcEYsYUFBTyxZQUFZLFFBQVEsUUFBUTtBQUFBLElBQ3BDLENBQUM7QUFFRCxTQUFLLHFEQUFxRCxNQUFNO0FBQy9ELGFBQU8sWUFBWSxrQkFBa0IsRUFBRSxPQUFPLHNCQUFzQixDQUFDLEdBQUcsbUJBQW1CO0FBQzNGLGFBQU8sWUFBWSxrQkFBa0IsRUFBRSxPQUFPLG1CQUFtQixDQUFDLEdBQUcsZ0JBQWdCO0FBQUEsSUFDdEYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sZUFBZSxNQUFNO0FBQzFCLFNBQUssc0NBQXNDLE1BQU07QUFDaEQsWUFBTSxNQUFNLElBQUksZUFBZSxRQUFXLENBQUMsQ0FBQztBQUM1QyxVQUFJLGVBQWUsWUFBWTtBQUUvQixZQUFNLFNBQVMsTUFBTSxJQUFJLGVBQWUsR0FBRyxDQUFDLEVBQUU7QUFDOUMsYUFBTyxZQUFZLE9BQU8sV0FBVyxZQUFZO0FBQUEsSUFDbEQsQ0FBQztBQUVELFNBQUssc0NBQXNDLE1BQU07QUFDaEQsWUFBTSxNQUFNLElBQUksZUFBZSxRQUFXLEVBQUUsYUFBYSxLQUFLLENBQUM7QUFDL0QsVUFBSSxlQUFlLFlBQVk7QUFFL0IsWUFBTSxTQUFTLE1BQU0sSUFBSSxlQUFlLEdBQUcsQ0FBQyxFQUFFO0FBQzlDLGFBQU8sWUFBWSxPQUFPLFdBQVcsbUJBQW1CO0FBQUEsSUFDekQsQ0FBQztBQUVELFNBQUsseURBQXlELE1BQU07QUFDbkUsWUFBTSxNQUFNLElBQUksZUFBZSxRQUFXLEVBQUUsYUFBYSxLQUFLLENBQUM7QUFDL0QsVUFBSSxlQUFlLHlEQUF3RDtBQUUzRSxZQUFNLFNBQVMsTUFBTSxJQUFJLGVBQWUsR0FBRyxDQUFDLEVBQUU7QUFDOUMsYUFBTyxZQUFZLE9BQU8sV0FBVyxtQkFBbUI7QUFBQSxJQUN6RCxDQUFDO0FBRUQsU0FBSywyQ0FBMkMsTUFBTTtBQUNyRCxZQUFNLE1BQU0sSUFBSSxlQUFlLFFBQVcsRUFBRSxhQUFhLEtBQUssQ0FBQztBQUMvRCxVQUFJLFdBQVcsWUFBWTtBQUUzQixZQUFNLFNBQVMsTUFBTSxJQUFJLGVBQWUsR0FBRyxDQUFDLEVBQUU7QUFDOUMsYUFBTyxZQUFZLE9BQU8sV0FBVywrQkFBK0I7QUFBQSxJQUNyRSxDQUFDO0FBRUQsU0FBSyw2QkFBNkIsTUFBTTtBQUN2QyxVQUFJLE9BQU87QUFDVjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLE1BQU0sSUFBSSxlQUFlLFFBQVcsRUFBRSxhQUFhLEtBQUssQ0FBQztBQUMvRCxVQUFJLGVBQWUsd0NBQXdDO0FBRTNELFlBQU0sU0FBUyxNQUFNLElBQUksZUFBZSxHQUFHLENBQUMsRUFBRTtBQUM5QyxhQUFPLFlBQVksT0FBTyxXQUFXLHdDQUF3QztBQUFBLElBQzlFLENBQUM7QUFFRCxTQUFLLDhEQUE4RCxNQUFNO0FBQ3hFLFVBQUksT0FBTztBQUNWO0FBQUEsTUFDRDtBQUVBLFlBQU0sTUFBTSxJQUFJLGVBQWUsUUFBVyxFQUFFLGFBQWEsS0FBSyxDQUFDO0FBQy9ELFVBQUksZUFBZSxvQ0FBb0M7QUFFdkQsWUFBTSxTQUFTLE1BQU0sSUFBSSxlQUFlLEdBQUcsQ0FBQyxFQUFFO0FBQzlDLGFBQU8sWUFBWSxPQUFPLFdBQVcscURBQXFEO0FBQUEsSUFDM0YsQ0FBQztBQUVELFNBQUsscUNBQXFDLE1BQU07QUFDL0MsWUFBTSxNQUFNLElBQUk7QUFBQSxRQUNmO0FBQUEsUUFDQSxFQUFFLGFBQWEsS0FBSztBQUFBLE1BQUM7QUFFdEIsWUFBTSxTQUFTLE1BQU0sSUFBSSxlQUFlLEdBQUcsQ0FBQyxFQUFFO0FBRzlDLGFBQU8sWUFBWSxPQUFPLFdBQVc7QUFBQSxpREFBNkQ7QUFBQSxJQUNuRyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSwwQkFBMEIsTUFBTTtBQUNyQyxhQUFTLGFBQWEsWUFBb0M7QUFDekQsaUJBQVcsUUFBUSxZQUFVO0FBQzVCLGVBQU8sUUFBUSxPQUFLLEVBQUUsTUFBTSxFQUFFO0FBQUEsTUFDL0IsQ0FBQztBQUFBLElBQ0Y7QUFFQSxVQUFNLGdCQUFnQjtBQUV0QixVQUFNLFNBQVMsTUFBTTtBQUNwQixXQUFLLGtCQUFrQixNQUFNO0FBQzVCLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxhQUFhO0FBQ2hELGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUMvQyxlQUFPLE1BQU0sV0FBVyxNQUFNO0FBQUEsTUFDL0IsQ0FBQztBQUVELFdBQUssb0JBQW9CLE1BQU07QUFDOUIsY0FBTSxrQkFBa0I7QUFDeEIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLGVBQWU7QUFDbEQsY0FBTSxzQkFBc0IsT0FBTyxPQUFPLE1BQU0sYUFBYTtBQUU3RCxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFDL0MsZUFBTyxnQkFBZ0IsV0FBVyxtQkFBbUI7QUFBQSxNQUN0RCxDQUFDO0FBRUQsV0FBSyx3Q0FBd0MsTUFBTTtBQUNsRCxjQUFNLGtCQUFrQjtBQUN4QixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sZUFBZTtBQUNsRCxjQUFNLHNCQUFzQixPQUFPLE9BQU8sTUFBTSxhQUFhO0FBRTdELGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUMvQyxZQUFJLFdBQVc7QUFDZCxvQkFBVSxXQUFXLG1CQUFtQjtBQUFBLFFBQ3pDO0FBQ0EsZUFBTyxnQkFBZ0IsV0FBVyxtQkFBbUI7QUFBQSxNQUN0RCxDQUFDO0FBRUQsV0FBSyxxQkFBcUIsTUFBTTtBQUMvQixjQUFNLGtCQUFrQjtBQUN4QixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sZUFBZTtBQUNsRCxjQUFNLHNCQUFzQixPQUFPLE9BQU8sTUFBTSxhQUFhO0FBRTdELGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxZQUFJLFdBQVc7QUFDZCxvQkFBVSxXQUFXLG1CQUFtQjtBQUFBLFFBQ3pDO0FBQ0EsZUFBTyxnQkFBZ0IsV0FBVyxtQkFBbUI7QUFBQSxNQUN0RCxDQUFDO0FBRUQsV0FBSyxnQ0FBZ0MsTUFBTTtBQUMxQyxjQUFNLGtCQUFrQjtBQUN4QixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sZUFBZTtBQUNsRCxjQUFNLHNCQUFzQixPQUFPLE9BQU8sTUFBTSxrQkFBa0IsWUFBWTtBQUU5RSxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsWUFBSSxXQUFXO0FBQ2Qsb0JBQVUsV0FBVyxtQkFBbUI7QUFBQSxRQUN6QztBQUNBLGVBQU8sZ0JBQWdCLFdBQVcsbUJBQW1CO0FBQUEsTUFDdEQsQ0FBQztBQUVELFdBQUssMkJBQTJCLE1BQU07QUFDckMsY0FBTSxrQkFBa0I7QUFDeEIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLGVBQWU7QUFDbEQsY0FBTSxzQkFBc0IsT0FBTyxPQUFPLE1BQU0sa0JBQWtCLGlCQUFpQjtBQUVuRixjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFDL0MsZUFBTyxnQkFBZ0IsV0FBVyxtQkFBbUI7QUFBQSxNQUN0RCxDQUFDO0FBRUQsV0FBSyxpQ0FBaUMsTUFBTTtBQUUzQyxjQUFNLGtCQUFrQjtBQUN4QixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sZUFBZTtBQUNsRCxjQUFNLHNCQUFzQixPQUFPLE9BQU8sTUFBTSxrQkFBa0IsaUJBQWlCO0FBRW5GLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUMvQyxlQUFPLGdCQUFnQixXQUFXLG1CQUFtQjtBQUFBLE1BQ3RELENBQUM7QUFFRCxXQUFLLHdDQUF3QyxNQUFNO0FBRWxELGNBQU0sa0JBQWtCO0FBQ3hCLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxlQUFlO0FBQ2xELGNBQU0sc0JBQXNCLE9BQU8sT0FBTyxNQUFNLGtCQUFrQixpQkFBaUI7QUFFbkYsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBQy9DLGVBQU8sZ0JBQWdCLFdBQVcsbUJBQW1CO0FBQUEsTUFDdEQsQ0FBQztBQUVELFdBQUsseUNBQXlDLE1BQU07QUFDbkQsY0FBTSxrQkFBa0I7QUFDeEIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLGVBQWU7QUFDbEQsY0FBTSxzQkFBc0IsT0FBTyxPQUFPLE1BQU0sYUFBYTtBQUU3RCxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFDL0MsZUFBTyxnQkFBZ0IsV0FBVyxtQkFBbUI7QUFBQSxNQUN0RCxDQUFDO0FBRUQsV0FBSywyQ0FBMkMsTUFBTTtBQUNyRCxjQUFNLGtCQUFrQjtBQUN4QixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sZUFBZTtBQUNsRCxjQUFNLHNCQUFzQixPQUFPLE9BQU8sTUFBTSxhQUFhO0FBRTdELGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUMvQyxlQUFPLGdCQUFnQixXQUFXLG1CQUFtQjtBQUFBLE1BQ3RELENBQUM7QUFFRCxXQUFLLDJDQUEyQyxNQUFNO0FBQ3JELGNBQU0sa0JBQWtCO0FBQ3hCLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxlQUFlO0FBQ2xELGNBQU0sc0JBQXNCLE9BQU8sT0FBTyxNQUFNLGFBQWE7QUFFN0QsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBQy9DLGVBQU8sZ0JBQWdCLFdBQVcsbUJBQW1CO0FBQUEsTUFDdEQsQ0FBQztBQUVELFdBQUssZUFBZSxNQUFNO0FBQ3pCLGNBQU0sa0JBQWtCO0FBQ3hCLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxlQUFlO0FBRWxELGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUMvQyxlQUFPLGdCQUFnQixXQUFXLE1BQU07QUFBQSxNQUN6QyxDQUFDO0FBRUQsV0FBSyxpQkFBaUIsTUFBTTtBQUMzQixjQUFNLGtCQUFrQjtBQUN4QixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sZUFBZTtBQUVsRCxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFDL0MsZUFBTyxnQkFBZ0IsV0FBVyxNQUFNO0FBQUEsTUFDekMsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELGFBQVMsd0JBQXdCLE1BQWMsV0FBeUI7QUFDdkUsV0FBSyxjQUFjLElBQUksSUFBSSxNQUFNO0FBQ2hDLGNBQU0sYUFBYSxHQUFHLFNBQVM7QUFDL0IsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLFVBQVU7QUFDN0MsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGNBQU0saUJBQWlCLE9BQU8sT0FBTyxNQUFNLGFBQWEsU0FBUztBQUNqRSxlQUFPLGdCQUFnQixXQUFXLGNBQWM7QUFBQSxNQUNqRCxDQUFDO0FBRUQsV0FBSyxZQUFZLElBQUksSUFBSSxNQUFNO0FBQzlCLGNBQU0sT0FBTyxnQkFBZ0IsU0FBUyxPQUFPLFNBQVM7QUFDdEQsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLElBQUk7QUFDdkMsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGVBQU8sZ0JBQWdCLFdBQVcsTUFBTTtBQUFBLE1BQ3pDLENBQUM7QUFFRCxXQUFLLEdBQUcsSUFBSSxzQkFBc0IsTUFBTTtBQUN2QyxjQUFNLGFBQWEsaUJBQWlCLFNBQVM7QUFDN0MsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLFVBQVU7QUFDN0MsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGNBQU0saUJBQWlCLE9BQU8sT0FBTyxNQUFNLGFBQWEsU0FBUztBQUNqRSxlQUFPLGdCQUFnQixXQUFXLGNBQWM7QUFBQSxNQUNqRCxDQUFDO0FBRUQsV0FBSyxHQUFHLElBQUksd0JBQXdCLE1BQU07QUFDekMsY0FBTSxhQUFhLGlCQUFpQixTQUFTO0FBQzdDLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxVQUFVO0FBQzdDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxjQUFNLGlCQUFpQixPQUFPLE9BQU8sTUFBTSxXQUFXLFFBQVEsSUFBSSxTQUFTO0FBQzNFLGVBQU8sZ0JBQWdCLFdBQVcsY0FBYztBQUFBLE1BQ2pELENBQUM7QUFFRCxXQUFLLGlCQUFpQixTQUFTLEtBQUssTUFBTTtBQUN6QyxjQUFNLE9BQU8saUJBQWlCLFNBQVM7QUFBQTtBQUN2QyxjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sSUFBSTtBQUN2QyxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsZUFBTyxnQkFBZ0IsV0FBVyxNQUFNO0FBQUEsTUFDekMsQ0FBQztBQUVELFdBQUssY0FBYyxJQUFJLGtCQUFrQixNQUFNO0FBQzlDLGNBQU0sT0FBTztBQUFBLHFCQUFpQyxTQUFTO0FBQ3ZELGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxJQUFJO0FBQ3ZDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxjQUFNLGlCQUFpQixPQUFPLE9BQU8sTUFBTSxPQUFPLFNBQVM7QUFDM0QsZUFBTyxnQkFBZ0IsV0FBVyxjQUFjO0FBQUEsTUFDakQsQ0FBQztBQUVELFdBQUssNkJBQTZCLElBQUksSUFBSSxNQUFNO0FBQy9DLGNBQU0sT0FBTyxnQkFBZ0IsU0FBUyxPQUFPLFNBQVMsc0JBQXNCLFNBQVM7QUFDckYsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLElBQUk7QUFDdkMsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGNBQU0saUJBQWlCLE9BQU8sT0FBTyxNQUFNLE9BQU8sU0FBUztBQUMzRCxlQUFPLGdCQUFnQixXQUFXLGNBQWM7QUFBQSxNQUNqRCxDQUFDO0FBRUQsV0FBSyxjQUFjLElBQUksWUFBWSxNQUFNO0FBQ3hDLGNBQU0sT0FBTztBQUFBLHNCQUF3QyxTQUFTO0FBQzlELGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxJQUFJO0FBQ3ZDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxjQUFNLGlCQUFpQixPQUFPLE9BQU8sTUFBTSxPQUFPLFNBQVM7QUFDM0QsZUFBTyxnQkFBZ0IsV0FBVyxjQUFjO0FBQUEsTUFDakQsQ0FBQztBQUVELFdBQUssY0FBYyxJQUFJLHFCQUFxQixNQUFNO0FBQ2pELGNBQU0sT0FBTztBQUFBLHNCQUF3QyxTQUFTO0FBQzlELGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxJQUFJO0FBQ3ZDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxjQUFNLGlCQUFpQixPQUFPLE9BQU8sTUFBTSxPQUFPLFNBQVM7QUFDM0QsZUFBTyxnQkFBZ0IsV0FBVyxjQUFjO0FBQUEsTUFDakQsQ0FBQztBQUVELFdBQUssY0FBYyxJQUFJLHFCQUFxQixNQUFNO0FBQ2pELGNBQU0sT0FBTztBQUFBLHVCQUEwQyxTQUFTO0FBQ2hFLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxJQUFJO0FBQ3ZDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxjQUFNLGlCQUFpQixPQUFPLE9BQU8sTUFBTSxPQUFPLFNBQVM7QUFDM0QsZUFBTyxnQkFBZ0IsV0FBVyxjQUFjO0FBQUEsTUFDakQsQ0FBQztBQUFBLElBQ0Y7QUFFQSxVQUFNLFFBQVEsTUFBTTtBQUNuQixXQUFLLGdDQUFnQyxNQUFNO0FBQzFDLGNBQU0sT0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFNYixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sSUFBSTtBQUN2QyxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsZUFBTyxnQkFBZ0IsV0FBVyxNQUFNO0FBQUEsTUFDekMsQ0FBQztBQUVELFdBQUssS0FBSyxrQ0FBa0MsTUFBTTtBQUNqRCxjQUFNLGFBQWE7QUFBQTtBQUFBO0FBQUE7QUFJbkIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLFVBQVU7QUFDN0MsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGNBQU0saUJBQWlCLE9BQU8sT0FBTyxNQUFNLGFBQWEsUUFBUTtBQUNoRSxlQUFPLGdCQUFnQixXQUFXLGNBQWM7QUFBQSxNQUNqRCxDQUFDO0FBRUQsV0FBSyxzQkFBc0IsTUFBTTtBQUNoQyxjQUFNLE9BQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUtiLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxJQUFJO0FBQ3ZDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxlQUFPLGdCQUFnQixXQUFXLE1BQU07QUFBQSxNQUN6QyxDQUFDO0FBRUQsV0FBSyw4QkFBOEIsTUFBTTtBQUN4QyxjQUFNLE9BQU87QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUtiLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxJQUFJO0FBQ3ZDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxlQUFPLGdCQUFnQixXQUFXLE1BQU07QUFBQSxNQUN6QyxDQUFDO0FBRUQsV0FBSyxtQkFBbUIsTUFBTTtBQUM3QixjQUFNLE9BQU87QUFDYixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sSUFBSTtBQUN2QyxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsZUFBTyxnQkFBZ0IsV0FBVyxNQUFNO0FBQUEsTUFDekMsQ0FBQztBQUVELFdBQUssa0NBQWtDLE1BQU07QUFDNUMsY0FBTSxhQUFhO0FBQUE7QUFFbkIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLFVBQVU7QUFDN0MsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGNBQU0saUJBQWlCLE9BQU8sT0FBTyxNQUFNLGFBQWEsMEJBQTBCO0FBQ2xGLGVBQU8sZ0JBQWdCLFdBQVcsY0FBYztBQUFBLE1BQ2pELENBQUM7QUFFRCxXQUFLLG9DQUFvQyxNQUFNO0FBQzlDLGNBQU0sYUFBYTtBQUFBO0FBRW5CLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxVQUFVO0FBQzdDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxjQUFNLGlCQUFpQixPQUFPLE9BQU8sTUFBTSxhQUFhLEdBQUc7QUFDM0QsZUFBTyxnQkFBZ0IsV0FBVyxjQUFjO0FBQUEsTUFDakQsQ0FBQztBQUVELFdBQUssNENBQTRDLE1BQU07QUFDdEQsY0FBTSxhQUFhO0FBQUE7QUFFbkIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLFVBQVU7QUFDN0MsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGNBQU0saUJBQWlCLE9BQU8sT0FBTyxNQUFNLGFBQWEsR0FBRztBQUMzRCxlQUFPLGdCQUFnQixXQUFXLGNBQWM7QUFBQSxNQUNqRCxDQUFDO0FBRUQsV0FBSyxzQ0FBc0MsTUFBTTtBQUNoRCxjQUFNLGFBQWE7QUFBQTtBQUVuQixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sVUFBVTtBQUM3QyxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsY0FBTSxpQkFBaUIsT0FBTyxPQUFPLE1BQU0sYUFBYSxHQUFHO0FBQzNELGVBQU8sZ0JBQWdCLFdBQVcsY0FBYztBQUFBLE1BQ2pELENBQUM7QUFFRCxXQUFLLDhCQUE4QixNQUFNO0FBQ3hDLGNBQU0sYUFBYTtBQUFBO0FBRW5CLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxVQUFVO0FBQzdDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxjQUFNLGlCQUFpQixPQUFPLE9BQU8sTUFBTSxhQUFhLEdBQUc7QUFDM0QsZUFBTyxnQkFBZ0IsV0FBVyxjQUFjO0FBQUEsTUFDakQsQ0FBQztBQUVELFdBQUssOENBQThDLE1BQU07QUFDeEQsY0FBTSxhQUFhO0FBQUE7QUFFbkIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLFVBQVU7QUFDN0MsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGNBQU0saUJBQWlCLE9BQU8sT0FBTyxNQUFNLGFBQWEsMkJBQTRCO0FBQ3BGLGVBQU8sZ0JBQWdCLFdBQVcsY0FBYztBQUFBLE1BQ2pELENBQUM7QUFFRCxXQUFLLHNEQUFzRCxNQUFNO0FBQ2hFLGNBQU0sYUFBYTtBQUFBO0FBRW5CLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxVQUFVO0FBQzdDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxjQUFNLGlCQUFpQixPQUFPLE9BQU8sTUFBTSxhQUFhLDJCQUE0QjtBQUNwRixlQUFPLGdCQUFnQixXQUFXLGNBQWM7QUFBQSxNQUNqRCxDQUFDO0FBRUQsV0FBSyx5Q0FBeUMsTUFBTTtBQUNuRCxjQUFNLGFBQWE7QUFBQTtBQUVuQixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sVUFBVTtBQUM3QyxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsY0FBTSxpQkFBaUIsT0FBTyxPQUFPLE1BQU0sYUFBYSxLQUFLO0FBQzdELGVBQU8sZ0JBQWdCLFdBQVcsY0FBYztBQUFBLE1BQ2pELENBQUM7QUFFRCxXQUFLLGlEQUFpRCxNQUFNO0FBQzNELGNBQU0sYUFBYTtBQUFBO0FBRW5CLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxVQUFVO0FBQzdDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxjQUFNLGlCQUFpQixPQUFPLE9BQU8sTUFBTSxhQUFhLEtBQUs7QUFDN0QsZUFBTyxnQkFBZ0IsV0FBVyxjQUFjO0FBQUEsTUFDakQsQ0FBQztBQUVELFdBQUssZ0NBQWdDLE1BQU07QUFDMUMsY0FBTSxhQUFhO0FBQUE7QUFFbkIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLFVBQVU7QUFDN0MsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGNBQU0saUJBQWlCLE9BQU8sT0FBTyxNQUFNLGFBQWEsUUFBUTtBQUNoRSxlQUFPLGdCQUFnQixXQUFXLGNBQWM7QUFBQSxNQUNqRCxDQUFDO0FBRUQsV0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxjQUFNLGFBQWE7QUFBQTtBQUFBO0FBR25CLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxVQUFVO0FBQzdDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxjQUFNLGlCQUFpQixPQUFPLE9BQU8sTUFBTSxhQUFhLFFBQVE7QUFDaEUsZUFBTyxnQkFBZ0IsV0FBVyxjQUFjO0FBQUEsTUFDakQsQ0FBQztBQUVELFdBQUssNENBQTRDLE1BQU07QUFDdEQsY0FBTSxhQUFhO0FBQUE7QUFDbkIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLFVBQVU7QUFDN0MsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGNBQU0saUJBQWlCLE9BQU8sT0FBTyxNQUFNLGFBQWEsU0FBUztBQUNqRSxlQUFPLGdCQUFnQixXQUFXLGNBQWM7QUFBQSxNQUNqRCxDQUFDO0FBRUQsV0FBSyxzREFBc0QsTUFBTTtBQUNoRSxjQUFNLGFBQWE7QUFBQTtBQUFBO0FBQUE7QUFDbkIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLFVBQVU7QUFDN0MsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGNBQU0saUJBQWlCLE9BQU8sT0FBTyxNQUFNLGFBQWEsU0FBUztBQUNqRSxlQUFPLGdCQUFnQixXQUFXLGNBQWM7QUFBQSxNQUNqRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsVUFBTSxjQUFjLE1BQU07QUFDekIsV0FBSywwQkFBMEIsTUFBTTtBQUNwQyxjQUFNLGFBQWE7QUFDbkIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLFVBQVU7QUFDN0MsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGNBQU0saUJBQWlCLE9BQU8sT0FBTyxNQUFNLGFBQWEsSUFBSTtBQUM1RCxlQUFPLGdCQUFnQixXQUFXLGNBQWM7QUFBQSxNQUNqRCxDQUFDO0FBRUQsV0FBSywyREFBMkQsTUFBTTtBQUNyRSxjQUFNLGFBQWE7QUFDbkIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLFVBQVU7QUFDN0MsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGNBQU0saUJBQWlCLE9BQU8sT0FBTyxNQUFNLGtCQUFrQjtBQUM3RCxlQUFPLGdCQUFnQixXQUFXLGNBQWM7QUFBQSxNQUNqRCxDQUFDO0FBRUQsV0FBSywyREFBMkQsTUFBTTtBQUNyRSxjQUFNLGFBQWE7QUFDbkIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLFVBQVU7QUFDN0MsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGNBQU0saUJBQWlCLE9BQU8sT0FBTyxNQUFNLGFBQWEsSUFBSTtBQUM1RCxlQUFPLGdCQUFnQixXQUFXLGNBQWM7QUFBQSxNQUNqRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsVUFBTSxZQUFZLE1BQU07QUFDdkIsOEJBQXdCLFlBQVksR0FBRztBQUV2QyxXQUFLLDRCQUE0QixNQUFNO0FBQ3RDLGNBQU0sT0FBTztBQUNiLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxJQUFJO0FBQ3ZDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxjQUFNLHlCQUF5QixPQUFPLE9BQU8sTUFBTSxPQUFPLEdBQUc7QUFDN0QsZUFBTyxnQkFBZ0IsV0FBVyxzQkFBc0I7QUFBQSxNQUN6RCxDQUFDO0FBRUQsV0FBSyxrQkFBa0IsTUFBTTtBQUM1QixjQUFNLE9BQU87QUFDYixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sSUFBSTtBQUN2QyxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsY0FBTSxpQkFBaUIsT0FBTyxPQUFPLE1BQU0sT0FBTyxHQUFHO0FBQ3JELGVBQU8sZ0JBQWdCLFdBQVcsY0FBYztBQUFBLE1BQ2pELENBQUM7QUFFRCxXQUFLLDJDQUEyQyxNQUFNO0FBTXJELGNBQU0sT0FBTztBQUNiLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxJQUFJO0FBQ3ZDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxjQUFNLGlCQUFpQixPQUFPLE9BQU8sTUFBTSxpRUFBaUU7QUFDNUcsZUFBTyxnQkFBZ0IsV0FBVyxjQUFjO0FBQUEsTUFDakQsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFVBQU0sUUFBUSxNQUFNO0FBQ25CLDhCQUF3QixRQUFRLEdBQUc7QUFFbkMsV0FBSyx3QkFBd0IsTUFBTTtBQUNsQyxjQUFNLE9BQU87QUFDYixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sSUFBSTtBQUN2QyxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsY0FBTSxpQkFBaUIsT0FBTyxPQUFPLE1BQU0sT0FBTyxHQUFHO0FBQ3JELGVBQU8sZ0JBQWdCLFdBQVcsY0FBYztBQUFBLE1BQ2pELENBQUM7QUFFRCxXQUFLLGtCQUFrQixNQUFNO0FBQzVCLGNBQU0sT0FBTztBQUNiLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxJQUFJO0FBQ3ZDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxjQUFNLGlCQUFpQixPQUFPLE9BQU8sTUFBTSxPQUFPLEdBQUc7QUFDckQsZUFBTyxnQkFBZ0IsV0FBVyxjQUFjO0FBQUEsTUFDakQsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFVBQU0sZUFBZSxNQUFNO0FBQzFCLDhCQUF3QixlQUFlLElBQUk7QUFFM0MsV0FBSywrQkFBK0IsTUFBTTtBQUN6QyxjQUFNLE9BQU87QUFDYixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sSUFBSTtBQUN2QyxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsY0FBTSxpQkFBaUIsT0FBTyxPQUFPLE1BQU0sT0FBTyxJQUFJO0FBQ3RELGVBQU8sZ0JBQWdCLFdBQVcsY0FBYztBQUFBLE1BQ2pELENBQUM7QUFHRCxXQUFLLEtBQUssd0JBQXdCLE1BQU07QUFDdkMsY0FBTSxhQUFhO0FBQ25CLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxVQUFVO0FBQzdDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxjQUFNLGlCQUFpQixPQUFPLE9BQU8sTUFBTSxXQUFXLFFBQVEsSUFBSSxJQUFJO0FBQ3RFLGVBQU8sZ0JBQWdCLFdBQVcsY0FBYztBQUFBLE1BQ2pELENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxVQUFNLGNBQWMsTUFBTTtBQUN6Qiw4QkFBd0IsY0FBYyxHQUFHO0FBRXpDLFdBQUssOEJBQThCLE1BQU07QUFDeEMsY0FBTSxPQUFPO0FBQ2IsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLElBQUk7QUFDdkMsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGVBQU8sZ0JBQWdCLFdBQVcsTUFBTTtBQUFBLE1BQ3pDLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxVQUFNLHFCQUFxQixNQUFNO0FBQ2hDLDhCQUF3QixxQkFBcUIsSUFBSTtBQUVqRCxXQUFLLHFDQUFxQyxNQUFNO0FBQy9DLGNBQU0sT0FBTztBQUNiLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxJQUFJO0FBQ3ZDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxlQUFPLGdCQUFnQixXQUFXLE1BQU07QUFBQSxNQUN6QyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsVUFBTSxRQUFRLE1BQU07QUFDbkIsV0FBSyx3QkFBd0IsTUFBTTtBQUNsQyxjQUFNLGFBQWE7QUFDbkIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLFVBQVU7QUFDN0MsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGNBQU0saUJBQWlCLE9BQU8sT0FBTyxNQUFNLGFBQWEsMEJBQTBCO0FBQ2xGLGVBQU8sZ0JBQWdCLFdBQVcsY0FBYztBQUFBLE1BQ2pELENBQUM7QUFFRCxXQUFLLDBCQUEwQixNQUFNO0FBQ3BDLGNBQU0sYUFBYTtBQUNuQixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sVUFBVTtBQUM3QyxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsY0FBTSxpQkFBaUIsT0FBTyxPQUFPLE1BQU0sYUFBYSxHQUFHO0FBQzNELGVBQU8sZ0JBQWdCLFdBQVcsY0FBYztBQUFBLE1BQ2pELENBQUM7QUFFRCxXQUFLLDRCQUE0QixNQUFNO0FBQ3RDLGNBQU0sYUFBYTtBQUNuQixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sVUFBVTtBQUM3QyxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsY0FBTSxpQkFBaUIsT0FBTyxPQUFPLE1BQU0sYUFBYSxHQUFHO0FBQzNELGVBQU8sZ0JBQWdCLFdBQVcsY0FBYztBQUFBLE1BQ2pELENBQUM7QUFFRCxXQUFLLDZDQUE2QyxNQUFNO0FBQ3ZELGNBQU0sYUFBYTtBQUNuQixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sVUFBVTtBQUM3QyxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsY0FBTSxpQkFBaUIsT0FBTyxPQUFPLE1BQU0sYUFBYSxHQUFHO0FBQzNELGVBQU8sZ0JBQWdCLFdBQVcsY0FBYztBQUFBLE1BQ2pELENBQUM7QUFFRCxXQUFLLDJDQUEyQyxNQUFNO0FBQ3JELGNBQU0sYUFBYTtBQUNuQixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sVUFBVTtBQUM3QyxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsY0FBTSxpQkFBaUIsT0FBTyxPQUFPLE1BQU0sYUFBYSxHQUFHO0FBQzNELGVBQU8sZ0JBQWdCLFdBQVcsY0FBYztBQUFBLE1BQ2pELENBQUM7QUFFRCxXQUFLLDhEQUE4RCxNQUFNO0FBQ3hFLGNBQU0sYUFBYTtBQUNuQixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sVUFBVTtBQUM3QyxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsY0FBTSxpQkFBaUIsT0FBTyxPQUFPLE1BQU0sYUFBYSxJQUFJO0FBQzVELGVBQU8sZ0JBQWdCLFdBQVcsY0FBYztBQUFBLE1BQ2pELENBQUM7QUFFRCxXQUFLLDhDQUE4QyxNQUFNO0FBQ3hELGNBQU0sYUFBYTtBQUNuQixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sVUFBVTtBQUM3QyxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsY0FBTSxpQkFBaUIsT0FBTyxPQUFPLE1BQU0sYUFBYSxJQUFJO0FBQzVELGVBQU8sZ0JBQWdCLFdBQVcsY0FBYztBQUFBLE1BQ2pELENBQUM7QUFFRCxXQUFLLGdEQUFnRCxNQUFNO0FBQzFELGNBQU0sYUFBYTtBQUNuQixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sVUFBVTtBQUM3QyxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsY0FBTSxpQkFBaUIsT0FBTyxPQUFPLE1BQU0sYUFBYSxJQUFJO0FBQzVELGVBQU8sZ0JBQWdCLFdBQVcsY0FBYztBQUFBLE1BQ2pELENBQUM7QUFFRCxXQUFLLDRDQUE0QyxNQUFNO0FBQ3RELGNBQU0sYUFBYTtBQUNuQixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sVUFBVTtBQUM3QyxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsY0FBTSxpQkFBaUIsT0FBTyxPQUFPLE1BQU0sYUFBYSxHQUFHO0FBQzNELGVBQU8sZ0JBQWdCLFdBQVcsY0FBYztBQUFBLE1BQ2pELENBQUM7QUFFRCxXQUFLLHNDQUFzQyxNQUFNO0FBQ2hELGNBQU0sYUFBYTtBQUNuQixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sVUFBVTtBQUM3QyxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsY0FBTSxpQkFBaUIsT0FBTyxPQUFPLE1BQU0sYUFBYSwyQkFBMkI7QUFDbkYsZUFBTyxnQkFBZ0IsV0FBVyxjQUFjO0FBQUEsTUFDakQsQ0FBQztBQUVELFdBQUssbUNBQW1DLE1BQU07QUFDN0MsY0FBTSxhQUFhO0FBQ25CLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxVQUFVO0FBQzdDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxjQUFNLGlCQUFpQixPQUFPLE9BQU8sTUFBTSxhQUFhLDRCQUE0QjtBQUNwRixlQUFPLGdCQUFnQixXQUFXLGNBQWM7QUFBQSxNQUNqRCxDQUFDO0FBRUQsV0FBSywrQ0FBZ0QsTUFBTTtBQUMxRCxjQUFNLFdBQVc7QUFDakIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLFFBQVE7QUFDM0MsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGNBQU0saUJBQWlCLE9BQU8sT0FBTyxNQUFNLFFBQVE7QUFDbkQsZUFBTyxnQkFBZ0IsV0FBVyxjQUFjO0FBQUEsTUFDakQsQ0FBQztBQUVELFdBQUssMkJBQTJCLE1BQU07QUFDckMsY0FBTSxhQUFhO0FBQ25CLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxVQUFVO0FBQzdDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxjQUFNLGlCQUFpQixPQUFPLE9BQU8sTUFBTSxhQUFhLDBCQUEwQjtBQUNsRixlQUFPLGdCQUFnQixXQUFXLGNBQWM7QUFBQSxNQUNqRCxDQUFDO0FBRUQsV0FBSyxzQ0FBc0MsTUFBTTtBQUNoRCxjQUFNLGFBQWE7QUFDbkIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLFVBQVU7QUFDN0MsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGNBQU0saUJBQWlCLE9BQU8sT0FBTyxNQUFNLGFBQWEsS0FBSztBQUM3RCxlQUFPLGdCQUFnQixXQUFXLGNBQWM7QUFBQSxNQUNqRCxDQUFDO0FBRUQsV0FBSywrQ0FBK0MsTUFBTTtBQUN6RCxjQUFNLGFBQWE7QUFDbkIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLFVBQVU7QUFDN0MsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGNBQU0saUJBQWlCLE9BQU8sT0FBTyxNQUFNLGFBQWEsTUFBTTtBQUM5RCxlQUFPLGdCQUFnQixXQUFXLGNBQWM7QUFBQSxNQUNqRCxDQUFDO0FBRUQsV0FBSyxnQ0FBZ0MsTUFBTTtBQUMxQyxjQUFNLGFBQWE7QUFDbkIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLFVBQVU7QUFDN0MsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGVBQU8sZ0JBQWdCLFdBQVcsTUFBTTtBQUFBLE1BQ3pDLENBQUM7QUFFRCxXQUFLLGlDQUFpQyxNQUFNO0FBQzNDLGNBQU0sYUFBYTtBQUNuQixjQUFNLFNBQVMsT0FBTyxPQUFPLE1BQU0sVUFBVTtBQUM3QyxjQUFNLFlBQVksdUJBQXVCLE1BQU07QUFFL0MsZUFBTyxnQkFBZ0IsV0FBVyxNQUFNO0FBQUEsTUFDekMsQ0FBQztBQUVELFdBQUsseUJBQXlCLE1BQU07QUFDbkMsY0FBTSxhQUFhO0FBQ25CLGNBQU0sU0FBUyxPQUFPLE9BQU8sTUFBTSxVQUFVO0FBQzdDLGNBQU0sWUFBWSx1QkFBdUIsTUFBTTtBQUUvQyxlQUFPLGdCQUFnQixXQUFXLE1BQU07QUFBQSxNQUN6QyxDQUFDO0FBRUQsV0FBSyxpQkFBaUIsTUFBTTtBQUMzQixjQUFNLGFBQWE7QUFDbkIsY0FBTSxTQUFTLE9BQU8sT0FBTyxNQUFNLFVBQVU7QUFDN0MsY0FBTSxZQUFZLHVCQUF1QixNQUFNO0FBRS9DLGVBQU8sZ0JBQWdCLFdBQVcsTUFBTTtBQUFBLE1BQ3pDLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJyZXNvbHZlIiwgImxhbmciXQp9Cg==
