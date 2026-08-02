import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { computeLinks } from "../../../common/languages/linkComputer.js";
class SimpleLinkComputerTarget {
  constructor(_lines) {
    this._lines = _lines;
  }
  getLineCount() {
    return this._lines.length;
  }
  getLineContent(lineNumber) {
    return this._lines[lineNumber - 1];
  }
}
function myComputeLinks(lines) {
  const target = new SimpleLinkComputerTarget(lines);
  return computeLinks(target);
}
function assertLink(text, extractedLink) {
  let startColumn = 0, endColumn = 0, chr, i = 0;
  for (i = 0; i < extractedLink.length; i++) {
    chr = extractedLink.charAt(i);
    if (chr !== " " && chr !== "	") {
      startColumn = i + 1;
      break;
    }
  }
  for (i = extractedLink.length - 1; i >= 0; i--) {
    chr = extractedLink.charAt(i);
    if (chr !== " " && chr !== "	") {
      endColumn = i + 2;
      break;
    }
  }
  const r = myComputeLinks([text]);
  assert.deepStrictEqual(r, [{
    range: {
      startLineNumber: 1,
      startColumn,
      endLineNumber: 1,
      endColumn
    },
    url: extractedLink.substring(startColumn - 1, endColumn - 1)
  }]);
}
suite("Editor Modes - Link Computer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Null model", () => {
    const r = computeLinks(null);
    assert.deepStrictEqual(r, []);
  });
  test("Parsing", () => {
    assertLink(
      'x = "http://foo.bar";',
      "     http://foo.bar  "
    );
    assertLink(
      "x = (http://foo.bar);",
      "     http://foo.bar  "
    );
    assertLink(
      "x = [http://foo.bar];",
      "     http://foo.bar  "
    );
    assertLink(
      "x = 'http://foo.bar';",
      "     http://foo.bar  "
    );
    assertLink(
      "x =  http://foo.bar ;",
      "     http://foo.bar  "
    );
    assertLink(
      "x = <http://foo.bar>;",
      "     http://foo.bar  "
    );
    assertLink(
      "x = {http://foo.bar};",
      "     http://foo.bar  "
    );
    assertLink(
      "(see http://foo.bar)",
      "     http://foo.bar  "
    );
    assertLink(
      "[see http://foo.bar]",
      "     http://foo.bar  "
    );
    assertLink(
      "{see http://foo.bar}",
      "     http://foo.bar  "
    );
    assertLink(
      "<see http://foo.bar>",
      "     http://foo.bar  "
    );
    assertLink(
      "<url>http://mylink.com</url>",
      "     http://mylink.com      "
    );
    assertLink(
      "// Click here to learn more. https://go.microsoft.com/fwlink/?LinkID=513275&clcid=0x409",
      "                             https://go.microsoft.com/fwlink/?LinkID=513275&clcid=0x409"
    );
    assertLink(
      "// Click here to learn more. https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx",
      "                             https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx"
    );
    assertLink(
      "// https://github.com/projectkudu/kudu/blob/master/Kudu.Core/Scripts/selectNodeVersion.js",
      "   https://github.com/projectkudu/kudu/blob/master/Kudu.Core/Scripts/selectNodeVersion.js"
    );
    assertLink(
      "<!-- !!! Do not remove !!!   WebContentRef(link:https://go.microsoft.com/fwlink/?LinkId=166007, area:Admin, updated:2015, nextUpdate:2016, tags:SqlServer)   !!! Do not remove !!! -->",
      "                                                https://go.microsoft.com/fwlink/?LinkId=166007                                                                                        "
    );
    assertLink(
      "For instructions, see https://go.microsoft.com/fwlink/?LinkId=166007.</value>",
      "                      https://go.microsoft.com/fwlink/?LinkId=166007         "
    );
    assertLink(
      "For instructions, see https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx.</value>",
      "                      https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx         "
    );
    assertLink(
      'x = "https://en.wikipedia.org/wiki/Z\xFCrich";',
      "     https://en.wikipedia.org/wiki/Z\xFCrich  "
    );
    assertLink(
      "\u8ACB\u53C3\u95B1 http://go.microsoft.com/fwlink/?LinkId=761051\u3002",
      "    http://go.microsoft.com/fwlink/?LinkId=761051 "
    );
    assertLink(
      "\uFF08\u8ACB\u53C3\u95B1 http://go.microsoft.com/fwlink/?LinkId=761051\uFF09",
      "     http://go.microsoft.com/fwlink/?LinkId=761051 "
    );
    assertLink(
      'x = "file:///foo.bar";',
      "     file:///foo.bar  "
    );
    assertLink(
      'x = "file://c:/foo.bar";',
      "     file://c:/foo.bar  "
    );
    assertLink(
      'x = "file://shares/foo.bar";',
      "     file://shares/foo.bar  "
    );
    assertLink(
      'x = "file://sh\xE4res/foo.bar";',
      "     file://sh\xE4res/foo.bar  "
    );
    assertLink(
      "Some text, then http://www.bing.com.",
      "                http://www.bing.com "
    );
    assertLink(
      "let url = `http://***/_api/web/lists/GetByTitle('Teambuildingaanvragen')/items`;",
      "           http://***/_api/web/lists/GetByTitle('Teambuildingaanvragen')/items  "
    );
  });
  test("issue #7855", () => {
    assertLink(
      "7. At this point, ServiceMain has been called.  There is no functionality presently in ServiceMain, but you can consult the [MSDN documentation](https://msdn.microsoft.com/en-us/library/windows/desktop/ms687414(v=vs.85).aspx) to add functionality as desired!",
      "                                                                                                                                                 https://msdn.microsoft.com/en-us/library/windows/desktop/ms687414(v=vs.85).aspx                                  "
    );
  });
  test('issue #62278: "Ctrl + click to follow link" for IPv6 URLs', () => {
    assertLink(
      'let x = "http://[::1]:5000/connect/token"',
      "         http://[::1]:5000/connect/token  "
    );
  });
  test("issue #70254: bold links dont open in markdown file using editor mode with ctrl + click", () => {
    assertLink(
      "2. Navigate to **https://portal.azure.com**",
      "                 https://portal.azure.com  "
    );
  });
  test("issue #86358: URL wrong recognition pattern", () => {
    assertLink(
      "POST|https://portal.azure.com|2019-12-05|",
      "     https://portal.azure.com            "
    );
  });
  test("issue #67022: Space as end of hyperlink isn't always good idea", () => {
    assertLink(
      "aa  https://foo.bar/[this is foo site]  aa",
      "    https://foo.bar/[this is foo site]    "
    );
  });
  test("issue #100353: Link detection stops at \uFF06(double-byte)", () => {
    assertLink(
      "aa  http://tree-mark.chips.jp/\u30EC\u30FC\u30BA\u30F3\uFF06\u30D9\u30EA\u30FC\u30DF\u30C3\u30AF\u30B9  aa",
      "    http://tree-mark.chips.jp/\u30EC\u30FC\u30BA\u30F3\uFF06\u30D9\u30EA\u30FC\u30DF\u30C3\u30AF\u30B9    "
    );
  });
  test("issue #121438: Link detection stops at\u3010...\u3011", () => {
    assertLink(
      "aa  https://zh.wikipedia.org/wiki/\u3010\u6211\u63A8\u7684\u5B69\u5B50\u3011 aa",
      "    https://zh.wikipedia.org/wiki/\u3010\u6211\u63A8\u7684\u5B69\u5B50\u3011   "
    );
  });
  test("issue #121438: Link detection stops at\u300A...\u300B", () => {
    assertLink(
      "aa  https://zh.wikipedia.org/wiki/\u300A\u65B0\u9752\u5E74\u300B\u7F16\u8F91\u90E8\u65E7\u5740 aa",
      "    https://zh.wikipedia.org/wiki/\u300A\u65B0\u9752\u5E74\u300B\u7F16\u8F91\u90E8\u65E7\u5740   "
    );
  });
  test("issue #121438: Link detection stops at \u201C...\u201D", () => {
    assertLink(
      "aa  https://zh.wikipedia.org/wiki/\u201C\u5E38\u51EF\u7533\u201D\u8BEF\u8BD1\u4E8B\u4EF6 aa",
      "    https://zh.wikipedia.org/wiki/\u201C\u5E38\u51EF\u7533\u201D\u8BEF\u8BD1\u4E8B\u4EF6   "
    );
  });
  test("issue #150905: Colon after bare hyperlink is treated as its part", () => {
    assertLink(
      "https://site.web/page.html: blah blah blah",
      "https://site.web/page.html                "
    );
  });
  test("issue #156875: Links include quotes ", () => {
    assertLink(
      `"This file has been converted from https://github.com/jeff-hykin/better-c-syntax/blob/master/autogenerated/c.tmLanguage.json",`,
      `                                   https://github.com/jeff-hykin/better-c-syntax/blob/master/autogenerated/c.tmLanguage.json  `
    );
  });
  test("issue #225513: Cmd-Click doesn't work on JSDoc {@link URL|LinkText} format ", () => {
    assertLink(
      ` * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers|Promise.withResolvers}`,
      `          https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers                       `
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2Rlcy9saW5rQ29tcHV0ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElMaW5rIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGlua0NvbXB1dGVyVGFyZ2V0LCBjb21wdXRlTGlua3MgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xpbmtDb21wdXRlci5qcyc7XG5cbmNsYXNzIFNpbXBsZUxpbmtDb21wdXRlclRhcmdldCBpbXBsZW1lbnRzIElMaW5rQ29tcHV0ZXJUYXJnZXQge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgX2xpbmVzOiBzdHJpbmdbXSkge1xuXHRcdC8vIEludGVudGlvbmFsIEVtcHR5XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzLmxlbmd0aDtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lQ29udGVudChsaW5lTnVtYmVyOiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9saW5lc1tsaW5lTnVtYmVyIC0gMV07XG5cdH1cbn1cblxuZnVuY3Rpb24gbXlDb21wdXRlTGlua3MobGluZXM6IHN0cmluZ1tdKTogSUxpbmtbXSB7XG5cdGNvbnN0IHRhcmdldCA9IG5ldyBTaW1wbGVMaW5rQ29tcHV0ZXJUYXJnZXQobGluZXMpO1xuXHRyZXR1cm4gY29tcHV0ZUxpbmtzKHRhcmdldCk7XG59XG5cbmZ1bmN0aW9uIGFzc2VydExpbmsodGV4dDogc3RyaW5nLCBleHRyYWN0ZWRMaW5rOiBzdHJpbmcpOiB2b2lkIHtcblx0bGV0IHN0YXJ0Q29sdW1uID0gMCxcblx0XHRlbmRDb2x1bW4gPSAwLFxuXHRcdGNocjogc3RyaW5nLFxuXHRcdGkgPSAwO1xuXG5cdGZvciAoaSA9IDA7IGkgPCBleHRyYWN0ZWRMaW5rLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y2hyID0gZXh0cmFjdGVkTGluay5jaGFyQXQoaSk7XG5cdFx0aWYgKGNociAhPT0gJyAnICYmIGNociAhPT0gJ1xcdCcpIHtcblx0XHRcdHN0YXJ0Q29sdW1uID0gaSArIDE7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRmb3IgKGkgPSBleHRyYWN0ZWRMaW5rLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0Y2hyID0gZXh0cmFjdGVkTGluay5jaGFyQXQoaSk7XG5cdFx0aWYgKGNociAhPT0gJyAnICYmIGNociAhPT0gJ1xcdCcpIHtcblx0XHRcdGVuZENvbHVtbiA9IGkgKyAyO1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgciA9IG15Q29tcHV0ZUxpbmtzKFt0ZXh0XSk7XG5cdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwociwgW3tcblx0XHRyYW5nZToge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0c3RhcnRDb2x1bW46IHN0YXJ0Q29sdW1uLFxuXHRcdFx0ZW5kTGluZU51bWJlcjogMSxcblx0XHRcdGVuZENvbHVtbjogZW5kQ29sdW1uXG5cdFx0fSxcblx0XHR1cmw6IGV4dHJhY3RlZExpbmsuc3Vic3RyaW5nKHN0YXJ0Q29sdW1uIC0gMSwgZW5kQ29sdW1uIC0gMSlcblx0fV0pO1xufVxuXG5zdWl0ZSgnRWRpdG9yIE1vZGVzIC0gTGluayBDb21wdXRlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdOdWxsIG1vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHIgPSBjb21wdXRlTGlua3MobnVsbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1BhcnNpbmcnLCAoKSA9PiB7XG5cblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J3ggPSBcImh0dHA6Ly9mb28uYmFyXCI7Jyxcblx0XHRcdCcgICAgIGh0dHA6Ly9mb28uYmFyICAnXG5cdFx0KTtcblxuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQneCA9IChodHRwOi8vZm9vLmJhcik7Jyxcblx0XHRcdCcgICAgIGh0dHA6Ly9mb28uYmFyICAnXG5cdFx0KTtcblxuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQneCA9IFtodHRwOi8vZm9vLmJhcl07Jyxcblx0XHRcdCcgICAgIGh0dHA6Ly9mb28uYmFyICAnXG5cdFx0KTtcblxuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQneCA9IFxcJ2h0dHA6Ly9mb28uYmFyXFwnOycsXG5cdFx0XHQnICAgICBodHRwOi8vZm9vLmJhciAgJ1xuXHRcdCk7XG5cblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J3ggPSAgaHR0cDovL2Zvby5iYXIgOycsXG5cdFx0XHQnICAgICBodHRwOi8vZm9vLmJhciAgJ1xuXHRcdCk7XG5cblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J3ggPSA8aHR0cDovL2Zvby5iYXI+OycsXG5cdFx0XHQnICAgICBodHRwOi8vZm9vLmJhciAgJ1xuXHRcdCk7XG5cblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J3ggPSB7aHR0cDovL2Zvby5iYXJ9OycsXG5cdFx0XHQnICAgICBodHRwOi8vZm9vLmJhciAgJ1xuXHRcdCk7XG5cblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0JyhzZWUgaHR0cDovL2Zvby5iYXIpJyxcblx0XHRcdCcgICAgIGh0dHA6Ly9mb28uYmFyICAnXG5cdFx0KTtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J1tzZWUgaHR0cDovL2Zvby5iYXJdJyxcblx0XHRcdCcgICAgIGh0dHA6Ly9mb28uYmFyICAnXG5cdFx0KTtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J3tzZWUgaHR0cDovL2Zvby5iYXJ9Jyxcblx0XHRcdCcgICAgIGh0dHA6Ly9mb28uYmFyICAnXG5cdFx0KTtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0JzxzZWUgaHR0cDovL2Zvby5iYXI+Jyxcblx0XHRcdCcgICAgIGh0dHA6Ly9mb28uYmFyICAnXG5cdFx0KTtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0Jzx1cmw+aHR0cDovL215bGluay5jb208L3VybD4nLFxuXHRcdFx0JyAgICAgaHR0cDovL215bGluay5jb20gICAgICAnXG5cdFx0KTtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0Jy8vIENsaWNrIGhlcmUgdG8gbGVhcm4gbW9yZS4gaHR0cHM6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/TGlua0lEPTUxMzI3NSZjbGNpZD0weDQwOScsXG5cdFx0XHQnICAgICAgICAgICAgICAgICAgICAgICAgICAgICBodHRwczovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSUQ9NTEzMjc1JmNsY2lkPTB4NDA5J1xuXHRcdCk7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCcvLyBDbGljayBoZXJlIHRvIGxlYXJuIG1vcmUuIGh0dHBzOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvd2luZG93cy9kZXNrdG9wL2FhMzY1MjQ3KHY9dnMuODUpLmFzcHgnLFxuXHRcdFx0JyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaHR0cHM6Ly9tc2RuLm1pY3Jvc29mdC5jb20vZW4tdXMvbGlicmFyeS93aW5kb3dzL2Rlc2t0b3AvYWEzNjUyNDcodj12cy44NSkuYXNweCdcblx0XHQpO1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnLy8gaHR0cHM6Ly9naXRodWIuY29tL3Byb2plY3RrdWR1L2t1ZHUvYmxvYi9tYXN0ZXIvS3VkdS5Db3JlL1NjcmlwdHMvc2VsZWN0Tm9kZVZlcnNpb24uanMnLFxuXHRcdFx0JyAgIGh0dHBzOi8vZ2l0aHViLmNvbS9wcm9qZWN0a3VkdS9rdWR1L2Jsb2IvbWFzdGVyL0t1ZHUuQ29yZS9TY3JpcHRzL3NlbGVjdE5vZGVWZXJzaW9uLmpzJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCc8IS0tICEhISBEbyBub3QgcmVtb3ZlICEhISAgIFdlYkNvbnRlbnRSZWYobGluazpodHRwczovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSWQ9MTY2MDA3LCBhcmVhOkFkbWluLCB1cGRhdGVkOjIwMTUsIG5leHRVcGRhdGU6MjAxNiwgdGFnczpTcWxTZXJ2ZXIpICAgISEhIERvIG5vdCByZW1vdmUgISEhIC0tPicsXG5cdFx0XHQnICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaHR0cHM6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/TGlua0lkPTE2NjAwNyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnXG5cdFx0KTtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J0ZvciBpbnN0cnVjdGlvbnMsIHNlZSBodHRwczovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSWQ9MTY2MDA3LjwvdmFsdWU+Jyxcblx0XHRcdCcgICAgICAgICAgICAgICAgICAgICAgaHR0cHM6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/TGlua0lkPTE2NjAwNyAgICAgICAgICdcblx0XHQpO1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnRm9yIGluc3RydWN0aW9ucywgc2VlIGh0dHBzOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvd2luZG93cy9kZXNrdG9wL2FhMzY1MjQ3KHY9dnMuODUpLmFzcHguPC92YWx1ZT4nLFxuXHRcdFx0JyAgICAgICAgICAgICAgICAgICAgICBodHRwczovL21zZG4ubWljcm9zb2Z0LmNvbS9lbi11cy9saWJyYXJ5L3dpbmRvd3MvZGVza3RvcC9hYTM2NTI0Nyh2PXZzLjg1KS5hc3B4ICAgICAgICAgJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCd4ID0gXCJodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9aXHUwMEZDcmljaFwiOycsXG5cdFx0XHQnICAgICBodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9aXHUwMEZDcmljaCAgJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCdcdThBQ0JcdTUzQzNcdTk1QjEgaHR0cDovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSWQ9NzYxMDUxXHUzMDAyJyxcblx0XHRcdCcgICAgaHR0cDovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSWQ9NzYxMDUxICdcblx0XHQpO1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnXHVGRjA4XHU4QUNCXHU1M0MzXHU5NUIxIGh0dHA6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/TGlua0lkPTc2MTA1MVx1RkYwOScsXG5cdFx0XHQnICAgICBodHRwOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP0xpbmtJZD03NjEwNTEgJ1xuXHRcdCk7XG5cblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J3ggPSBcImZpbGU6Ly8vZm9vLmJhclwiOycsXG5cdFx0XHQnICAgICBmaWxlOi8vL2Zvby5iYXIgICdcblx0XHQpO1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQneCA9IFwiZmlsZTovL2M6L2Zvby5iYXJcIjsnLFxuXHRcdFx0JyAgICAgZmlsZTovL2M6L2Zvby5iYXIgICdcblx0XHQpO1xuXG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCd4ID0gXCJmaWxlOi8vc2hhcmVzL2Zvby5iYXJcIjsnLFxuXHRcdFx0JyAgICAgZmlsZTovL3NoYXJlcy9mb28uYmFyICAnXG5cdFx0KTtcblxuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQneCA9IFwiZmlsZTovL3NoXHUwMEU0cmVzL2Zvby5iYXJcIjsnLFxuXHRcdFx0JyAgICAgZmlsZTovL3NoXHUwMEU0cmVzL2Zvby5iYXIgICdcblx0XHQpO1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnU29tZSB0ZXh0LCB0aGVuIGh0dHA6Ly93d3cuYmluZy5jb20uJyxcblx0XHRcdCcgICAgICAgICAgICAgICAgaHR0cDovL3d3dy5iaW5nLmNvbSAnXG5cdFx0KTtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J2xldCB1cmwgPSBgaHR0cDovLyoqKi9fYXBpL3dlYi9saXN0cy9HZXRCeVRpdGxlKFxcJ1RlYW1idWlsZGluZ2FhbnZyYWdlblxcJykvaXRlbXNgOycsXG5cdFx0XHQnICAgICAgICAgICBodHRwOi8vKioqL19hcGkvd2ViL2xpc3RzL0dldEJ5VGl0bGUoXFwnVGVhbWJ1aWxkaW5nYWFudnJhZ2VuXFwnKS9pdGVtcyAgJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM3ODU1JywgKCkgPT4ge1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnNy4gQXQgdGhpcyBwb2ludCwgU2VydmljZU1haW4gaGFzIGJlZW4gY2FsbGVkLiAgVGhlcmUgaXMgbm8gZnVuY3Rpb25hbGl0eSBwcmVzZW50bHkgaW4gU2VydmljZU1haW4sIGJ1dCB5b3UgY2FuIGNvbnN1bHQgdGhlIFtNU0ROIGRvY3VtZW50YXRpb25dKGh0dHBzOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvd2luZG93cy9kZXNrdG9wL21zNjg3NDE0KHY9dnMuODUpLmFzcHgpIHRvIGFkZCBmdW5jdGlvbmFsaXR5IGFzIGRlc2lyZWQhJyxcblx0XHRcdCcgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaHR0cHM6Ly9tc2RuLm1pY3Jvc29mdC5jb20vZW4tdXMvbGlicmFyeS93aW5kb3dzL2Rlc2t0b3AvbXM2ODc0MTQodj12cy44NSkuYXNweCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzYyMjc4OiBcIkN0cmwgKyBjbGljayB0byBmb2xsb3cgbGlua1wiIGZvciBJUHY2IFVSTHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCdsZXQgeCA9IFwiaHR0cDovL1s6OjFdOjUwMDAvY29ubmVjdC90b2tlblwiJyxcblx0XHRcdCcgICAgICAgICBodHRwOi8vWzo6MV06NTAwMC9jb25uZWN0L3Rva2VuICAnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzcwMjU0OiBib2xkIGxpbmtzIGRvbnQgb3BlbiBpbiBtYXJrZG93biBmaWxlIHVzaW5nIGVkaXRvciBtb2RlIHdpdGggY3RybCArIGNsaWNrJywgKCkgPT4ge1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnMi4gTmF2aWdhdGUgdG8gKipodHRwczovL3BvcnRhbC5henVyZS5jb20qKicsXG5cdFx0XHQnICAgICAgICAgICAgICAgICBodHRwczovL3BvcnRhbC5henVyZS5jb20gICdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjODYzNTg6IFVSTCB3cm9uZyByZWNvZ25pdGlvbiBwYXR0ZXJuJywgKCkgPT4ge1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnUE9TVHxodHRwczovL3BvcnRhbC5henVyZS5jb218MjAxOS0xMi0wNXwnLFxuXHRcdFx0JyAgICAgaHR0cHM6Ly9wb3J0YWwuYXp1cmUuY29tICAgICAgICAgICAgJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM2NzAyMjogU3BhY2UgYXMgZW5kIG9mIGh5cGVybGluayBpc25cXCd0IGFsd2F5cyBnb29kIGlkZWEnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCdhYSAgaHR0cHM6Ly9mb28uYmFyL1t0aGlzIGlzIGZvbyBzaXRlXSAgYWEnLFxuXHRcdFx0JyAgICBodHRwczovL2Zvby5iYXIvW3RoaXMgaXMgZm9vIHNpdGVdICAgICdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTAwMzUzOiBMaW5rIGRldGVjdGlvbiBzdG9wcyBhdCBcdUZGMDYoZG91YmxlLWJ5dGUpJywgKCkgPT4ge1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnYWEgIGh0dHA6Ly90cmVlLW1hcmsuY2hpcHMuanAvXHUzMEVDXHUzMEZDXHUzMEJBXHUzMEYzXHVGRjA2XHUzMEQ5XHUzMEVBXHUzMEZDXHUzMERGXHUzMEMzXHUzMEFGXHUzMEI5ICBhYScsXG5cdFx0XHQnICAgIGh0dHA6Ly90cmVlLW1hcmsuY2hpcHMuanAvXHUzMEVDXHUzMEZDXHUzMEJBXHUzMEYzXHVGRjA2XHUzMEQ5XHUzMEVBXHUzMEZDXHUzMERGXHUzMEMzXHUzMEFGXHUzMEI5ICAgICdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTIxNDM4OiBMaW5rIGRldGVjdGlvbiBzdG9wcyBhdFx1MzAxMC4uLlx1MzAxMScsICgpID0+IHtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J2FhICBodHRwczovL3poLndpa2lwZWRpYS5vcmcvd2lraS9cdTMwMTBcdTYyMTFcdTYzQThcdTc2ODRcdTVCNjlcdTVCNTBcdTMwMTEgYWEnLFxuXHRcdFx0JyAgICBodHRwczovL3poLndpa2lwZWRpYS5vcmcvd2lraS9cdTMwMTBcdTYyMTFcdTYzQThcdTc2ODRcdTVCNjlcdTVCNTBcdTMwMTEgICAnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEyMTQzODogTGluayBkZXRlY3Rpb24gc3RvcHMgYXRcdTMwMEEuLi5cdTMwMEInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCdhYSAgaHR0cHM6Ly96aC53aWtpcGVkaWEub3JnL3dpa2kvXHUzMDBBXHU2NUIwXHU5NzUyXHU1RTc0XHUzMDBCXHU3RjE2XHU4RjkxXHU5MEU4XHU2NUU3XHU1NzQwIGFhJyxcblx0XHRcdCcgICAgaHR0cHM6Ly96aC53aWtpcGVkaWEub3JnL3dpa2kvXHUzMDBBXHU2NUIwXHU5NzUyXHU1RTc0XHUzMDBCXHU3RjE2XHU4RjkxXHU5MEU4XHU2NUU3XHU1NzQwICAgJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMjE0Mzg6IExpbmsgZGV0ZWN0aW9uIHN0b3BzIGF0IFx1MjAxQy4uLlx1MjAxRCcsICgpID0+IHtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J2FhICBodHRwczovL3poLndpa2lwZWRpYS5vcmcvd2lraS9cdTIwMUNcdTVFMzhcdTUxRUZcdTc1MzNcdTIwMURcdThCRUZcdThCRDFcdTRFOEJcdTRFRjYgYWEnLFxuXHRcdFx0JyAgICBodHRwczovL3poLndpa2lwZWRpYS5vcmcvd2lraS9cdTIwMUNcdTVFMzhcdTUxRUZcdTc1MzNcdTIwMURcdThCRUZcdThCRDFcdTRFOEJcdTRFRjYgICAnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE1MDkwNTogQ29sb24gYWZ0ZXIgYmFyZSBoeXBlcmxpbmsgaXMgdHJlYXRlZCBhcyBpdHMgcGFydCcsICgpID0+IHtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J2h0dHBzOi8vc2l0ZS53ZWIvcGFnZS5odG1sOiBibGFoIGJsYWggYmxhaCcsXG5cdFx0XHQnaHR0cHM6Ly9zaXRlLndlYi9wYWdlLmh0bWwgICAgICAgICAgICAgICAgJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdC8vIFJlbW92ZWQgYmVjYXVzZSBvZiAjMTU2ODc1XG5cdC8vIHRlc3QoJ2lzc3VlICMxNTE2MzE6IExpbmsgcGFyc2luZyBzdG9wZWQgd2hlcmUgY29tbWVudHMgaW5jbHVkZSBhIHNpbmdsZSBxdW90ZSAnLCAoKSA9PiB7XG5cdC8vIFx0YXNzZXJ0TGluayhcblx0Ly8gXHRcdGBhYSBodHRwczovL3JlZ2V4cGVyLmNvbS8jJTJGJyclMkYgYWFgLFxuXHQvLyBcdFx0YCAgIGh0dHBzOi8vcmVnZXhwZXIuY29tLyMlMkYnJyUyRiAgIGAsXG5cdC8vIFx0KTtcblx0Ly8gfSk7XG5cblx0dGVzdCgnaXNzdWUgIzE1Njg3NTogTGlua3MgaW5jbHVkZSBxdW90ZXMgJywgKCkgPT4ge1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHRgXCJUaGlzIGZpbGUgaGFzIGJlZW4gY29udmVydGVkIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL2plZmYtaHlraW4vYmV0dGVyLWMtc3ludGF4L2Jsb2IvbWFzdGVyL2F1dG9nZW5lcmF0ZWQvYy50bUxhbmd1YWdlLmpzb25cIixgLFxuXHRcdFx0YCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaHR0cHM6Ly9naXRodWIuY29tL2plZmYtaHlraW4vYmV0dGVyLWMtc3ludGF4L2Jsb2IvbWFzdGVyL2F1dG9nZW5lcmF0ZWQvYy50bUxhbmd1YWdlLmpzb24gIGAsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzIyNTUxMzogQ21kLUNsaWNrIGRvZXNuXFwndCB3b3JrIG9uIEpTRG9jIHtAbGluayBVUkx8TGlua1RleHR9IGZvcm1hdCAnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdGAgKiB7QGxpbmsgaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvUHJvbWlzZS93aXRoUmVzb2x2ZXJzfFByb21pc2Uud2l0aFJlc29sdmVyc31gLFxuXHRcdFx0YCAgICAgICAgICBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9Qcm9taXNlL3dpdGhSZXNvbHZlcnMgICAgICAgICAgICAgICAgICAgICAgIGAsXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUV4RCxTQUE4QixvQkFBb0I7QUFFbEQsTUFBTSx5QkFBd0Q7QUFBQSxFQUU3RCxZQUFvQixRQUFrQjtBQUFsQjtBQUFBLEVBRXBCO0FBQUEsRUFFTyxlQUF1QjtBQUM3QixXQUFPLEtBQUssT0FBTztBQUFBLEVBQ3BCO0FBQUEsRUFFTyxlQUFlLFlBQTRCO0FBQ2pELFdBQU8sS0FBSyxPQUFPLGFBQWEsQ0FBQztBQUFBLEVBQ2xDO0FBQ0Q7QUFFQSxTQUFTLGVBQWUsT0FBMEI7QUFDakQsUUFBTSxTQUFTLElBQUkseUJBQXlCLEtBQUs7QUFDakQsU0FBTyxhQUFhLE1BQU07QUFDM0I7QUFFQSxTQUFTLFdBQVcsTUFBYyxlQUE2QjtBQUM5RCxNQUFJLGNBQWMsR0FDakIsWUFBWSxHQUNaLEtBQ0EsSUFBSTtBQUVMLE9BQUssSUFBSSxHQUFHLElBQUksY0FBYyxRQUFRLEtBQUs7QUFDMUMsVUFBTSxjQUFjLE9BQU8sQ0FBQztBQUM1QixRQUFJLFFBQVEsT0FBTyxRQUFRLEtBQU07QUFDaEMsb0JBQWMsSUFBSTtBQUNsQjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsT0FBSyxJQUFJLGNBQWMsU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLO0FBQy9DLFVBQU0sY0FBYyxPQUFPLENBQUM7QUFDNUIsUUFBSSxRQUFRLE9BQU8sUUFBUSxLQUFNO0FBQ2hDLGtCQUFZLElBQUk7QUFDaEI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLFFBQU0sSUFBSSxlQUFlLENBQUMsSUFBSSxDQUFDO0FBQy9CLFNBQU8sZ0JBQWdCLEdBQUcsQ0FBQztBQUFBLElBQzFCLE9BQU87QUFBQSxNQUNOLGlCQUFpQjtBQUFBLE1BQ2pCO0FBQUEsTUFDQSxlQUFlO0FBQUEsTUFDZjtBQUFBLElBQ0Q7QUFBQSxJQUNBLEtBQUssY0FBYyxVQUFVLGNBQWMsR0FBRyxZQUFZLENBQUM7QUFBQSxFQUM1RCxDQUFDLENBQUM7QUFDSDtBQUVBLE1BQU0sZ0NBQWdDLE1BQU07QUFFM0MsMENBQXdDO0FBRXhDLE9BQUssY0FBYyxNQUFNO0FBQ3hCLFVBQU0sSUFBSSxhQUFhLElBQUk7QUFDM0IsV0FBTyxnQkFBZ0IsR0FBRyxDQUFDLENBQUM7QUFBQSxFQUM3QixDQUFDO0FBRUQsT0FBSyxXQUFXLE1BQU07QUFFckI7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFFQTtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUVBO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBRUE7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFFQTtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUVBO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBRUE7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFFQTtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0E7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQTtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0E7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQTtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0E7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQTtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0E7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQTtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBRUE7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQTtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUVBO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBRUE7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQTtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxlQUFlLE1BQU07QUFDekI7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDZEQUE2RCxNQUFNO0FBQ3ZFO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywyRkFBMkYsTUFBTTtBQUNyRztBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssK0NBQStDLE1BQU07QUFDekQ7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGtFQUFtRSxNQUFNO0FBQzdFO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw4REFBeUQsTUFBTTtBQUNuRTtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsseURBQStDLE1BQU07QUFDekQ7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHlEQUErQyxNQUFNO0FBQ3pEO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywwREFBZ0QsTUFBTTtBQUMxRDtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssb0VBQW9FLE1BQU07QUFDOUU7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFVRCxPQUFLLHdDQUF3QyxNQUFNO0FBQ2xEO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywrRUFBZ0YsTUFBTTtBQUMxRjtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
