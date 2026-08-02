import assert from "assert";
import { escapeIcons, getCodiconAriaLabel, markdownEscapeEscapedIcons, matchesFuzzyIconAware, parseLabelWithIcons, stripIcons } from "../../common/iconLabels.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
function filterOk(filter, word, target, highlights) {
  const r = filter(word, target);
  assert(r);
  if (highlights) {
    assert.deepStrictEqual(r, highlights);
  }
}
suite("Icon Labels", () => {
  test("Can get proper aria labels", () => {
    const testCases = /* @__PURE__ */ new Map([
      ["", ""],
      ["asdf", "asdf"],
      ["asdf$(squirrel)asdf", "asdf squirrel asdf"],
      ["asdf $(squirrel) asdf", "asdf  squirrel  asdf"],
      ["$(rocket)asdf", "rocket asdf"],
      ["$(rocket) asdf", "rocket  asdf"],
      ["$(rocket)$(rocket)$(rocket)asdf", "rocket  rocket  rocket asdf"],
      ["$(rocket) asdf $(rocket)", "rocket  asdf  rocket"],
      ["$(rocket)asdf$(rocket)", "rocket asdf rocket"]
    ]);
    for (const [input, expected] of testCases) {
      assert.strictEqual(getCodiconAriaLabel(input), expected);
    }
  });
  test("matchesFuzzyIconAware", () => {
    filterOk(matchesFuzzyIconAware, "ccr", parseLabelWithIcons("$(codicon)CamelCaseRocks$(codicon)"), [
      { start: 10, end: 11 },
      { start: 15, end: 16 },
      { start: 19, end: 20 }
    ]);
    filterOk(matchesFuzzyIconAware, "ccr", parseLabelWithIcons("$(codicon) CamelCaseRocks $(codicon)"), [
      { start: 11, end: 12 },
      { start: 16, end: 17 },
      { start: 20, end: 21 }
    ]);
    filterOk(matchesFuzzyIconAware, "iut", parseLabelWithIcons("$(codicon) Indent $(octico) Using $(octic) Tpaces"), [
      { start: 11, end: 12 },
      { start: 28, end: 29 },
      { start: 43, end: 44 }
    ]);
    filterOk(matchesFuzzyIconAware, "using", parseLabelWithIcons("$(codicon) Indent Using Spaces"), [
      { start: 18, end: 23 }
    ]);
    filterOk(matchesFuzzyIconAware, "codicon", parseLabelWithIcons("This $(codicon Indent Using Spaces"), [
      { start: 7, end: 14 }
    ]);
    filterOk(matchesFuzzyIconAware, "indent", parseLabelWithIcons("This $codicon Indent Using Spaces"), [
      { start: 14, end: 20 }
    ]);
    filterOk(matchesFuzzyIconAware, "unt", parseLabelWithIcons("$(primitive-dot) $(file-text) Untitled-1"), [
      { start: 30, end: 33 }
    ]);
    filterOk(matchesFuzzyIconAware, "s", parseLabelWithIcons("$(loading~spin) start"), [
      { start: 16, end: 17 }
    ]);
  });
  test("stripIcons", () => {
    assert.strictEqual(stripIcons("Hello World"), "Hello World");
    assert.strictEqual(stripIcons("$(Hello World"), "$(Hello World");
    assert.strictEqual(stripIcons("$(Hello) World"), " World");
    assert.strictEqual(stripIcons("$(Hello) W$(oi)rld"), " Wrld");
  });
  test("escapeIcons", () => {
    assert.strictEqual(escapeIcons("Hello World"), "Hello World");
    assert.strictEqual(escapeIcons("$(Hello World"), "$(Hello World");
    assert.strictEqual(escapeIcons("$(Hello) World"), "\\$(Hello) World");
    assert.strictEqual(escapeIcons("\\$(Hello) W$(oi)rld"), "\\$(Hello) W\\$(oi)rld");
  });
  test("markdownEscapeEscapedIcons", () => {
    assert.strictEqual(markdownEscapeEscapedIcons("Hello World"), "Hello World");
    assert.strictEqual(markdownEscapeEscapedIcons("$(Hello) World"), "$(Hello) World");
    assert.strictEqual(markdownEscapeEscapedIcons("\\$(Hello) World"), "\\\\$(Hello) World");
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vaWNvbkxhYmVscy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgSU1hdGNoIH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgZXNjYXBlSWNvbnMsIGdldENvZGljb25BcmlhTGFiZWwsIElQYXJzZWRMYWJlbFdpdGhJY29ucywgbWFya2Rvd25Fc2NhcGVFc2NhcGVkSWNvbnMsIG1hdGNoZXNGdXp6eUljb25Bd2FyZSwgcGFyc2VMYWJlbFdpdGhJY29ucywgc3RyaXBJY29ucyB9IGZyb20gJy4uLy4uL2NvbW1vbi9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuXG5pbnRlcmZhY2UgSUljb25GaWx0ZXIge1xuXHQvLyBSZXR1cm5zIG51bGwgaWYgd29yZCBkb2Vzbid0IG1hdGNoLlxuXHQocXVlcnk6IHN0cmluZywgdGFyZ2V0OiBJUGFyc2VkTGFiZWxXaXRoSWNvbnMpOiBJTWF0Y2hbXSB8IG51bGw7XG59XG5cbmZ1bmN0aW9uIGZpbHRlck9rKGZpbHRlcjogSUljb25GaWx0ZXIsIHdvcmQ6IHN0cmluZywgdGFyZ2V0OiBJUGFyc2VkTGFiZWxXaXRoSWNvbnMsIGhpZ2hsaWdodHM/OiB7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyIH1bXSkge1xuXHRjb25zdCByID0gZmlsdGVyKHdvcmQsIHRhcmdldCk7XG5cdGFzc2VydChyKTtcblx0aWYgKGhpZ2hsaWdodHMpIHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHIsIGhpZ2hsaWdodHMpO1xuXHR9XG59XG5cbnN1aXRlKCdJY29uIExhYmVscycsICgpID0+IHtcblx0dGVzdCgnQ2FuIGdldCBwcm9wZXIgYXJpYSBsYWJlbHMnLCAoKSA9PiB7XG5cdFx0Ly8gbm90ZSwgdGhlIHNwYWNlcyBpbiB0aGUgcmVzdWx0cyBhcmUgaW1wb3J0YW50XG5cdFx0Y29uc3QgdGVzdENhc2VzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oW1xuXHRcdFx0WycnLCAnJ10sXG5cdFx0XHRbJ2FzZGYnLCAnYXNkZiddLFxuXHRcdFx0Wydhc2RmJChzcXVpcnJlbClhc2RmJywgJ2FzZGYgc3F1aXJyZWwgYXNkZiddLFxuXHRcdFx0Wydhc2RmICQoc3F1aXJyZWwpIGFzZGYnLCAnYXNkZiAgc3F1aXJyZWwgIGFzZGYnXSxcblx0XHRcdFsnJChyb2NrZXQpYXNkZicsICdyb2NrZXQgYXNkZiddLFxuXHRcdFx0WyckKHJvY2tldCkgYXNkZicsICdyb2NrZXQgIGFzZGYnXSxcblx0XHRcdFsnJChyb2NrZXQpJChyb2NrZXQpJChyb2NrZXQpYXNkZicsICdyb2NrZXQgIHJvY2tldCAgcm9ja2V0IGFzZGYnXSxcblx0XHRcdFsnJChyb2NrZXQpIGFzZGYgJChyb2NrZXQpJywgJ3JvY2tldCAgYXNkZiAgcm9ja2V0J10sXG5cdFx0XHRbJyQocm9ja2V0KWFzZGYkKHJvY2tldCknLCAncm9ja2V0IGFzZGYgcm9ja2V0J10sXG5cdFx0XSk7XG5cblx0XHRmb3IgKGNvbnN0IFtpbnB1dCwgZXhwZWN0ZWRdIG9mIHRlc3RDYXNlcykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENvZGljb25BcmlhTGFiZWwoaW5wdXQpLCBleHBlY3RlZCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdtYXRjaGVzRnV6enlJY29uQXdhcmUnLCAoKSA9PiB7XG5cblx0XHQvLyBDYW1lbCBDYXNlXG5cblx0XHRmaWx0ZXJPayhtYXRjaGVzRnV6enlJY29uQXdhcmUsICdjY3InLCBwYXJzZUxhYmVsV2l0aEljb25zKCckKGNvZGljb24pQ2FtZWxDYXNlUm9ja3MkKGNvZGljb24pJyksIFtcblx0XHRcdHsgc3RhcnQ6IDEwLCBlbmQ6IDExIH0sXG5cdFx0XHR7IHN0YXJ0OiAxNSwgZW5kOiAxNiB9LFxuXHRcdFx0eyBzdGFydDogMTksIGVuZDogMjAgfVxuXHRcdF0pO1xuXG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0Z1enp5SWNvbkF3YXJlLCAnY2NyJywgcGFyc2VMYWJlbFdpdGhJY29ucygnJChjb2RpY29uKSBDYW1lbENhc2VSb2NrcyAkKGNvZGljb24pJyksIFtcblx0XHRcdHsgc3RhcnQ6IDExLCBlbmQ6IDEyIH0sXG5cdFx0XHR7IHN0YXJ0OiAxNiwgZW5kOiAxNyB9LFxuXHRcdFx0eyBzdGFydDogMjAsIGVuZDogMjEgfVxuXHRcdF0pO1xuXG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0Z1enp5SWNvbkF3YXJlLCAnaXV0JywgcGFyc2VMYWJlbFdpdGhJY29ucygnJChjb2RpY29uKSBJbmRlbnQgJChvY3RpY28pIFVzaW5nICQob2N0aWMpIFRwYWNlcycpLCBbXG5cdFx0XHR7IHN0YXJ0OiAxMSwgZW5kOiAxMiB9LFxuXHRcdFx0eyBzdGFydDogMjgsIGVuZDogMjkgfSxcblx0XHRcdHsgc3RhcnQ6IDQzLCBlbmQ6IDQ0IH0sXG5cdFx0XSk7XG5cblx0XHQvLyBQcmVmaXhcblxuXHRcdGZpbHRlck9rKG1hdGNoZXNGdXp6eUljb25Bd2FyZSwgJ3VzaW5nJywgcGFyc2VMYWJlbFdpdGhJY29ucygnJChjb2RpY29uKSBJbmRlbnQgVXNpbmcgU3BhY2VzJyksIFtcblx0XHRcdHsgc3RhcnQ6IDE4LCBlbmQ6IDIzIH0sXG5cdFx0XSk7XG5cblx0XHQvLyBCcm9rZW4gQ29kaWNvblxuXG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0Z1enp5SWNvbkF3YXJlLCAnY29kaWNvbicsIHBhcnNlTGFiZWxXaXRoSWNvbnMoJ1RoaXMgJChjb2RpY29uIEluZGVudCBVc2luZyBTcGFjZXMnKSwgW1xuXHRcdFx0eyBzdGFydDogNywgZW5kOiAxNCB9LFxuXHRcdF0pO1xuXG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0Z1enp5SWNvbkF3YXJlLCAnaW5kZW50JywgcGFyc2VMYWJlbFdpdGhJY29ucygnVGhpcyAkY29kaWNvbiBJbmRlbnQgVXNpbmcgU3BhY2VzJyksIFtcblx0XHRcdHsgc3RhcnQ6IDE0LCBlbmQ6IDIwIH0sXG5cdFx0XSk7XG5cblx0XHQvLyBUZXN0aW5nICM1OTM0M1xuXHRcdGZpbHRlck9rKG1hdGNoZXNGdXp6eUljb25Bd2FyZSwgJ3VudCcsIHBhcnNlTGFiZWxXaXRoSWNvbnMoJyQocHJpbWl0aXZlLWRvdCkgJChmaWxlLXRleHQpIFVudGl0bGVkLTEnKSwgW1xuXHRcdFx0eyBzdGFydDogMzAsIGVuZDogMzMgfSxcblx0XHRdKTtcblxuXHRcdC8vIFRlc3RpbmcgIzEzNjE3MlxuXHRcdGZpbHRlck9rKG1hdGNoZXNGdXp6eUljb25Bd2FyZSwgJ3MnLCBwYXJzZUxhYmVsV2l0aEljb25zKCckKGxvYWRpbmd+c3Bpbikgc3RhcnQnKSwgW1xuXHRcdFx0eyBzdGFydDogMTYsIGVuZDogMTcgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBJY29ucycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaXBJY29ucygnSGVsbG8gV29ybGQnKSwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmlwSWNvbnMoJyQoSGVsbG8gV29ybGQnKSwgJyQoSGVsbG8gV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaXBJY29ucygnJChIZWxsbykgV29ybGQnKSwgJyBXb3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpcEljb25zKCckKEhlbGxvKSBXJChvaSlybGQnKSwgJyBXcmxkJyk7XG5cdH0pO1xuXG5cblx0dGVzdCgnZXNjYXBlSWNvbnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZUljb25zKCdIZWxsbyBXb3JsZCcpLCAnSGVsbG8gV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXNjYXBlSWNvbnMoJyQoSGVsbG8gV29ybGQnKSwgJyQoSGVsbG8gV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXNjYXBlSWNvbnMoJyQoSGVsbG8pIFdvcmxkJyksICdcXFxcJChIZWxsbykgV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXNjYXBlSWNvbnMoJ1xcXFwkKEhlbGxvKSBXJChvaSlybGQnKSwgJ1xcXFwkKEhlbGxvKSBXXFxcXCQob2kpcmxkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcmtkb3duRXNjYXBlRXNjYXBlZEljb25zJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZG93bkVzY2FwZUVzY2FwZWRJY29ucygnSGVsbG8gV29ybGQnKSwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtkb3duRXNjYXBlRXNjYXBlZEljb25zKCckKEhlbGxvKSBXb3JsZCcpLCAnJChIZWxsbykgV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Rvd25Fc2NhcGVFc2NhcGVkSWNvbnMoJ1xcXFwkKEhlbGxvKSBXb3JsZCcpLCAnXFxcXFxcXFwkKEhlbGxvKSBXb3JsZCcpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMsYUFBYSxxQkFBNEMsNEJBQTRCLHVCQUF1QixxQkFBcUIsa0JBQWtCO0FBQzVKLFNBQVMsK0NBQStDO0FBT3hELFNBQVMsU0FBUyxRQUFxQixNQUFjLFFBQStCLFlBQStDO0FBQ2xJLFFBQU0sSUFBSSxPQUFPLE1BQU0sTUFBTTtBQUM3QixTQUFPLENBQUM7QUFDUixNQUFJLFlBQVk7QUFDZixXQUFPLGdCQUFnQixHQUFHLFVBQVU7QUFBQSxFQUNyQztBQUNEO0FBRUEsTUFBTSxlQUFlLE1BQU07QUFDMUIsT0FBSyw4QkFBOEIsTUFBTTtBQUV4QyxVQUFNLFlBQVksb0JBQUksSUFBb0I7QUFBQSxNQUN6QyxDQUFDLElBQUksRUFBRTtBQUFBLE1BQ1AsQ0FBQyxRQUFRLE1BQU07QUFBQSxNQUNmLENBQUMsdUJBQXVCLG9CQUFvQjtBQUFBLE1BQzVDLENBQUMseUJBQXlCLHNCQUFzQjtBQUFBLE1BQ2hELENBQUMsaUJBQWlCLGFBQWE7QUFBQSxNQUMvQixDQUFDLGtCQUFrQixjQUFjO0FBQUEsTUFDakMsQ0FBQyxtQ0FBbUMsNkJBQTZCO0FBQUEsTUFDakUsQ0FBQyw0QkFBNEIsc0JBQXNCO0FBQUEsTUFDbkQsQ0FBQywwQkFBMEIsb0JBQW9CO0FBQUEsSUFDaEQsQ0FBQztBQUVELGVBQVcsQ0FBQyxPQUFPLFFBQVEsS0FBSyxXQUFXO0FBQzFDLGFBQU8sWUFBWSxvQkFBb0IsS0FBSyxHQUFHLFFBQVE7QUFBQSxJQUN4RDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsseUJBQXlCLE1BQU07QUFJbkMsYUFBUyx1QkFBdUIsT0FBTyxvQkFBb0Isb0NBQW9DLEdBQUc7QUFBQSxNQUNqRyxFQUFFLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxNQUNyQixFQUFFLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxNQUNyQixFQUFFLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxJQUN0QixDQUFDO0FBRUQsYUFBUyx1QkFBdUIsT0FBTyxvQkFBb0Isc0NBQXNDLEdBQUc7QUFBQSxNQUNuRyxFQUFFLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxNQUNyQixFQUFFLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxNQUNyQixFQUFFLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxJQUN0QixDQUFDO0FBRUQsYUFBUyx1QkFBdUIsT0FBTyxvQkFBb0IsbURBQW1ELEdBQUc7QUFBQSxNQUNoSCxFQUFFLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxNQUNyQixFQUFFLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxNQUNyQixFQUFFLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxJQUN0QixDQUFDO0FBSUQsYUFBUyx1QkFBdUIsU0FBUyxvQkFBb0IsZ0NBQWdDLEdBQUc7QUFBQSxNQUMvRixFQUFFLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxJQUN0QixDQUFDO0FBSUQsYUFBUyx1QkFBdUIsV0FBVyxvQkFBb0Isb0NBQW9DLEdBQUc7QUFBQSxNQUNyRyxFQUFFLE9BQU8sR0FBRyxLQUFLLEdBQUc7QUFBQSxJQUNyQixDQUFDO0FBRUQsYUFBUyx1QkFBdUIsVUFBVSxvQkFBb0IsbUNBQW1DLEdBQUc7QUFBQSxNQUNuRyxFQUFFLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxJQUN0QixDQUFDO0FBR0QsYUFBUyx1QkFBdUIsT0FBTyxvQkFBb0IsMENBQTBDLEdBQUc7QUFBQSxNQUN2RyxFQUFFLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxJQUN0QixDQUFDO0FBR0QsYUFBUyx1QkFBdUIsS0FBSyxvQkFBb0IsdUJBQXVCLEdBQUc7QUFBQSxNQUNsRixFQUFFLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFBQSxJQUN0QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxjQUFjLE1BQU07QUFDeEIsV0FBTyxZQUFZLFdBQVcsYUFBYSxHQUFHLGFBQWE7QUFDM0QsV0FBTyxZQUFZLFdBQVcsZUFBZSxHQUFHLGVBQWU7QUFDL0QsV0FBTyxZQUFZLFdBQVcsZ0JBQWdCLEdBQUcsUUFBUTtBQUN6RCxXQUFPLFlBQVksV0FBVyxvQkFBb0IsR0FBRyxPQUFPO0FBQUEsRUFDN0QsQ0FBQztBQUdELE9BQUssZUFBZSxNQUFNO0FBQ3pCLFdBQU8sWUFBWSxZQUFZLGFBQWEsR0FBRyxhQUFhO0FBQzVELFdBQU8sWUFBWSxZQUFZLGVBQWUsR0FBRyxlQUFlO0FBQ2hFLFdBQU8sWUFBWSxZQUFZLGdCQUFnQixHQUFHLGtCQUFrQjtBQUNwRSxXQUFPLFlBQVksWUFBWSxzQkFBc0IsR0FBRyx3QkFBd0I7QUFBQSxFQUNqRixDQUFDO0FBRUQsT0FBSyw4QkFBOEIsTUFBTTtBQUN4QyxXQUFPLFlBQVksMkJBQTJCLGFBQWEsR0FBRyxhQUFhO0FBQzNFLFdBQU8sWUFBWSwyQkFBMkIsZ0JBQWdCLEdBQUcsZ0JBQWdCO0FBQ2pGLFdBQU8sWUFBWSwyQkFBMkIsa0JBQWtCLEdBQUcsb0JBQW9CO0FBQUEsRUFDeEYsQ0FBQztBQUVELDBDQUF3QztBQUN6QyxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
