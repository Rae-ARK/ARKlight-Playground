import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { getNWords } from "../../../common/model/chatWordCounter.js";
suite("ChatWordCounter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function doTest(str, nWords, resultStr) {
    const result = getNWords(str, nWords);
    assert.strictEqual(result.value, resultStr);
    assert.strictEqual(result.returnedWordCount, nWords);
  }
  suite("getNWords", () => {
    test("matching actualWordCount", () => {
      const cases = [
        ["hello world", 1, "hello"],
        ["hello", 1, "hello"],
        ["hello world", 0, ""],
        ["here's, some.   punctuation?", 3, "here's, some.   punctuation?"],
        ["| markdown | _table_ | header |", 3, "| markdown | _table_ | header |"],
        ["| --- | --- | --- |", 1, "| ---"],
        ["| --- | --- | --- |", 3, "| --- | --- | --- |"],
        [" 	 some \n whitespace     \n\n\nhere   ", 3, " 	 some \n whitespace     \n\n\nhere   "]
      ];
      cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
    });
    test("whitespace", () => {
      assert.deepStrictEqual(
        getNWords("hello ", 1),
        {
          value: "hello ",
          returnedWordCount: 1,
          isFullString: true,
          totalWordCount: 1
        }
      );
      assert.deepStrictEqual(
        getNWords("hello\n\n", 1),
        {
          value: "hello\n\n",
          returnedWordCount: 1,
          isFullString: true,
          totalWordCount: 1
        }
      );
      assert.deepStrictEqual(
        getNWords("\nhello", 1),
        {
          value: "\nhello",
          returnedWordCount: 1,
          isFullString: true,
          totalWordCount: 1
        }
      );
    });
    test("matching links", () => {
      const cases = [
        ["[hello](https://example.com) world", 1, "[hello](https://example.com)"],
        ["[hello](https://example.com) world", 2, "[hello](https://example.com) world"],
        ['oh [hello](https://example.com "title") world', 1, "oh"],
        ['oh [hello](https://example.com "title") world', 2, 'oh [hello](https://example.com "title")'],
        // Parens in link destination
        ["[hello](https://example.com?()) world", 1, "[hello](https://example.com?())"],
        // Escaped brackets in link text
        ["[he \\[l\\] \\]lo](https://example.com?()) world", 1, "[he \\[l\\] \\]lo](https://example.com?())"]
      ];
      cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
    });
    test("code", () => {
      const cases = [
        ["let a=1-2", 2, "let a"],
        ["let a=1-2", 3, "let a="],
        ["let a=1-2", 4, "let a=1"],
        ["const myVar = 1+2", 4, "const myVar = 1"],
        ['<div id="myDiv"></div>', 3, "<div id="],
        ['<div id="myDiv"></div>', 4, '<div id="myDiv"></div>']
      ];
      cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
    });
    test("codeblocks", () => {
      const cases = [
        ["hello\n\n```\n```\n\nworld foo", 2, "hello\n\n```\n```\n\nworld"]
      ];
      cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
    });
    test("chinese characters", () => {
      const cases = [
        ["\u6211\u559C\u6B22\u4E2D\u56FD\u83DC", 3, "\u6211\u559C\u6B22"]
      ];
      cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
    });
    test(`Inline math shouldn't be broken up`, () => {
      const cases = [
        ["a $x + y$ b", 3, "a $x + y$ b"],
        ["a $\\frac{1}{2} + \\sqrt{x^2 + y^2}$ b", 3, "a $\\frac{1}{2} + \\sqrt{x^2 + y^2}$ b"]
      ];
      cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vbW9kZWwvY2hhdFdvcmRDb3VudGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGdldE5Xb3JkcywgSVdvcmRDb3VudFJlc3VsdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0V29yZENvdW50ZXIuanMnO1xuXG5zdWl0ZSgnQ2hhdFdvcmRDb3VudGVyJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBkb1Rlc3Qoc3RyOiBzdHJpbmcsIG5Xb3JkczogbnVtYmVyLCByZXN1bHRTdHI6IHN0cmluZykge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldE5Xb3JkcyhzdHIsIG5Xb3Jkcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC52YWx1ZSwgcmVzdWx0U3RyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnJldHVybmVkV29yZENvdW50LCBuV29yZHMpO1xuXHR9XG5cblx0c3VpdGUoJ2dldE5Xb3JkcycsICgpID0+IHtcblx0XHR0ZXN0KCdtYXRjaGluZyBhY3R1YWxXb3JkQ291bnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXNlczogW3N0cmluZywgbnVtYmVyLCBzdHJpbmddW10gPSBbXG5cdFx0XHRcdFsnaGVsbG8gd29ybGQnLCAxLCAnaGVsbG8nXSxcblx0XHRcdFx0WydoZWxsbycsIDEsICdoZWxsbyddLFxuXHRcdFx0XHRbJ2hlbGxvIHdvcmxkJywgMCwgJyddLFxuXHRcdFx0XHRbJ2hlcmVcXCdzLCBzb21lLiAgIHB1bmN0dWF0aW9uPycsIDMsICdoZXJlXFwncywgc29tZS4gICBwdW5jdHVhdGlvbj8nXSxcblx0XHRcdFx0Wyd8IG1hcmtkb3duIHwgX3RhYmxlXyB8IGhlYWRlciB8JywgMywgJ3wgbWFya2Rvd24gfCBfdGFibGVfIHwgaGVhZGVyIHwnXSxcblx0XHRcdFx0Wyd8IC0tLSB8IC0tLSB8IC0tLSB8JywgMSwgJ3wgLS0tJ10sXG5cdFx0XHRcdFsnfCAtLS0gfCAtLS0gfCAtLS0gfCcsIDMsICd8IC0tLSB8IC0tLSB8IC0tLSB8J10sXG5cdFx0XHRcdFsnIFxcdCBzb21lIFxcbiB3aGl0ZXNwYWNlICAgICBcXG5cXG5cXG5oZXJlICAgJywgMywgJyBcXHQgc29tZSBcXG4gd2hpdGVzcGFjZSAgICAgXFxuXFxuXFxuaGVyZSAgICddLFxuXHRcdFx0XTtcblxuXHRcdFx0Y2FzZXMuZm9yRWFjaCgoW3N0ciwgbldvcmRzLCByZXN1bHRdKSA9PiBkb1Rlc3Qoc3RyLCBuV29yZHMsIHJlc3VsdCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2hpdGVzcGFjZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldE5Xb3JkcygnaGVsbG8gJywgMSksXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR2YWx1ZTogJ2hlbGxvICcsXG5cdFx0XHRcdFx0cmV0dXJuZWRXb3JkQ291bnQ6IDEsXG5cdFx0XHRcdFx0aXNGdWxsU3RyaW5nOiB0cnVlLFxuXHRcdFx0XHRcdHRvdGFsV29yZENvdW50OiAxLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJV29yZENvdW50UmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldE5Xb3JkcygnaGVsbG9cXG5cXG4nLCAxKSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHZhbHVlOiAnaGVsbG9cXG5cXG4nLFxuXHRcdFx0XHRcdHJldHVybmVkV29yZENvdW50OiAxLFxuXHRcdFx0XHRcdGlzRnVsbFN0cmluZzogdHJ1ZSxcblx0XHRcdFx0XHR0b3RhbFdvcmRDb3VudDogMSxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSVdvcmRDb3VudFJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXROV29yZHMoJ1xcbmhlbGxvJywgMSksXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR2YWx1ZTogJ1xcbmhlbGxvJyxcblx0XHRcdFx0XHRyZXR1cm5lZFdvcmRDb3VudDogMSxcblx0XHRcdFx0XHRpc0Z1bGxTdHJpbmc6IHRydWUsXG5cdFx0XHRcdFx0dG90YWxXb3JkQ291bnQ6IDEsXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElXb3JkQ291bnRSZXN1bHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hpbmcgbGlua3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXNlczogW3N0cmluZywgbnVtYmVyLCBzdHJpbmddW10gPSBbXG5cdFx0XHRcdFsnW2hlbGxvXShodHRwczovL2V4YW1wbGUuY29tKSB3b3JsZCcsIDEsICdbaGVsbG9dKGh0dHBzOi8vZXhhbXBsZS5jb20pJ10sXG5cdFx0XHRcdFsnW2hlbGxvXShodHRwczovL2V4YW1wbGUuY29tKSB3b3JsZCcsIDIsICdbaGVsbG9dKGh0dHBzOi8vZXhhbXBsZS5jb20pIHdvcmxkJ10sXG5cdFx0XHRcdFsnb2ggW2hlbGxvXShodHRwczovL2V4YW1wbGUuY29tIFwidGl0bGVcIikgd29ybGQnLCAxLCAnb2gnXSxcblx0XHRcdFx0WydvaCBbaGVsbG9dKGh0dHBzOi8vZXhhbXBsZS5jb20gXCJ0aXRsZVwiKSB3b3JsZCcsIDIsICdvaCBbaGVsbG9dKGh0dHBzOi8vZXhhbXBsZS5jb20gXCJ0aXRsZVwiKSddLFxuXHRcdFx0XHQvLyBQYXJlbnMgaW4gbGluayBkZXN0aW5hdGlvblxuXHRcdFx0XHRbJ1toZWxsb10oaHR0cHM6Ly9leGFtcGxlLmNvbT8oKSkgd29ybGQnLCAxLCAnW2hlbGxvXShodHRwczovL2V4YW1wbGUuY29tPygpKSddLFxuXHRcdFx0XHQvLyBFc2NhcGVkIGJyYWNrZXRzIGluIGxpbmsgdGV4dFxuXHRcdFx0XHRbJ1toZSBcXFxcW2xcXFxcXSBcXFxcXWxvXShodHRwczovL2V4YW1wbGUuY29tPygpKSB3b3JsZCcsIDEsICdbaGUgXFxcXFtsXFxcXF0gXFxcXF1sb10oaHR0cHM6Ly9leGFtcGxlLmNvbT8oKSknXSxcblx0XHRcdF07XG5cblx0XHRcdGNhc2VzLmZvckVhY2goKFtzdHIsIG5Xb3JkcywgcmVzdWx0XSkgPT4gZG9UZXN0KHN0ciwgbldvcmRzLCByZXN1bHQpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXNlczogW3N0cmluZywgbnVtYmVyLCBzdHJpbmddW10gPSBbXG5cdFx0XHRcdFsnbGV0IGE9MS0yJywgMiwgJ2xldCBhJ10sXG5cdFx0XHRcdFsnbGV0IGE9MS0yJywgMywgJ2xldCBhPSddLFxuXHRcdFx0XHRbJ2xldCBhPTEtMicsIDQsICdsZXQgYT0xJ10sXG5cdFx0XHRcdFsnY29uc3QgbXlWYXIgPSAxKzInLCA0LCAnY29uc3QgbXlWYXIgPSAxJ10sXG5cdFx0XHRcdFsnPGRpdiBpZD1cIm15RGl2XCI+PC9kaXY+JywgMywgJzxkaXYgaWQ9J10sXG5cdFx0XHRcdFsnPGRpdiBpZD1cIm15RGl2XCI+PC9kaXY+JywgNCwgJzxkaXYgaWQ9XCJteURpdlwiPjwvZGl2PiddLFxuXHRcdFx0XTtcblxuXHRcdFx0Y2FzZXMuZm9yRWFjaCgoW3N0ciwgbldvcmRzLCByZXN1bHRdKSA9PiBkb1Rlc3Qoc3RyLCBuV29yZHMsIHJlc3VsdCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29kZWJsb2NrcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhc2VzOiBbc3RyaW5nLCBudW1iZXIsIHN0cmluZ11bXSA9IFtcblx0XHRcdFx0WydoZWxsb1xcblxcbmBgYFxcbmBgYFxcblxcbndvcmxkIGZvbycsIDIsICdoZWxsb1xcblxcbmBgYFxcbmBgYFxcblxcbndvcmxkJ10sXG5cdFx0XHRdO1xuXG5cdFx0XHRjYXNlcy5mb3JFYWNoKChbc3RyLCBuV29yZHMsIHJlc3VsdF0pID0+IGRvVGVzdChzdHIsIG5Xb3JkcywgcmVzdWx0KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjaGluZXNlIGNoYXJhY3RlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXNlczogW3N0cmluZywgbnVtYmVyLCBzdHJpbmddW10gPSBbXG5cdFx0XHRcdFsnXHU2MjExXHU1NTlDXHU2QjIyXHU0RTJEXHU1NkZEXHU4M0RDJywgMywgJ1x1NjIxMVx1NTU5Q1x1NkIyMiddLFxuXHRcdFx0XTtcblxuXHRcdFx0Y2FzZXMuZm9yRWFjaCgoW3N0ciwgbldvcmRzLCByZXN1bHRdKSA9PiBkb1Rlc3Qoc3RyLCBuV29yZHMsIHJlc3VsdCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdChgSW5saW5lIG1hdGggc2hvdWxkbid0IGJlIGJyb2tlbiB1cGAsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhc2VzOiBbc3RyaW5nLCBudW1iZXIsIHN0cmluZ11bXSA9IFtcblx0XHRcdFx0WydhICR4ICsgeSQgYicsIDMsICdhICR4ICsgeSQgYiddLFxuXHRcdFx0XHRbJ2EgJFxcXFxmcmFjezF9ezJ9ICsgXFxcXHNxcnR7eF4yICsgeV4yfSQgYicsIDMsICdhICRcXFxcZnJhY3sxfXsyfSArIFxcXFxzcXJ0e3heMiArIHleMn0kIGInXSxcblx0XHRcdF07XG5cblx0XHRcdGNhc2VzLmZvckVhY2goKFtzdHIsIG5Xb3JkcywgcmVzdWx0XSkgPT4gZG9UZXN0KHN0ciwgbldvcmRzLCByZXN1bHQpKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGlCQUFtQztBQUU1QyxNQUFNLG1CQUFtQixNQUFNO0FBQzlCLDBDQUF3QztBQUV4QyxXQUFTLE9BQU8sS0FBYSxRQUFnQixXQUFtQjtBQUMvRCxVQUFNLFNBQVMsVUFBVSxLQUFLLE1BQU07QUFDcEMsV0FBTyxZQUFZLE9BQU8sT0FBTyxTQUFTO0FBQzFDLFdBQU8sWUFBWSxPQUFPLG1CQUFtQixNQUFNO0FBQUEsRUFDcEQ7QUFFQSxRQUFNLGFBQWEsTUFBTTtBQUN4QixTQUFLLDRCQUE0QixNQUFNO0FBQ3RDLFlBQU0sUUFBb0M7QUFBQSxRQUN6QyxDQUFDLGVBQWUsR0FBRyxPQUFPO0FBQUEsUUFDMUIsQ0FBQyxTQUFTLEdBQUcsT0FBTztBQUFBLFFBQ3BCLENBQUMsZUFBZSxHQUFHLEVBQUU7QUFBQSxRQUNyQixDQUFDLGdDQUFpQyxHQUFHLDhCQUErQjtBQUFBLFFBQ3BFLENBQUMsbUNBQW1DLEdBQUcsaUNBQWlDO0FBQUEsUUFDeEUsQ0FBQyx1QkFBdUIsR0FBRyxPQUFPO0FBQUEsUUFDbEMsQ0FBQyx1QkFBdUIsR0FBRyxxQkFBcUI7QUFBQSxRQUNoRCxDQUFDLDJDQUE0QyxHQUFHLHlDQUEwQztBQUFBLE1BQzNGO0FBRUEsWUFBTSxRQUFR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
