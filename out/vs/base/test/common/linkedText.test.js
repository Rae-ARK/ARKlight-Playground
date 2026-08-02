import assert from "assert";
import { parseLinkedText } from "../../common/linkedText.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("LinkedText", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("parses correctly", () => {
    assert.deepStrictEqual(parseLinkedText("").nodes, []);
    assert.deepStrictEqual(parseLinkedText("hello").nodes, ["hello"]);
    assert.deepStrictEqual(parseLinkedText("hello there").nodes, ["hello there"]);
    assert.deepStrictEqual(parseLinkedText("Some message with [link text](http://link.href).").nodes, [
      "Some message with ",
      { label: "link text", href: "http://link.href" },
      "."
    ]);
    assert.deepStrictEqual(parseLinkedText('Some message with [link text](http://link.href "and a title").').nodes, [
      "Some message with ",
      { label: "link text", href: "http://link.href", title: "and a title" },
      "."
    ]);
    assert.deepStrictEqual(parseLinkedText("Some message with [link text](http://link.href 'and a title').").nodes, [
      "Some message with ",
      { label: "link text", href: "http://link.href", title: "and a title" },
      "."
    ]);
    assert.deepStrictEqual(parseLinkedText(`Some message with [link text](http://link.href "and a 'title'").`).nodes, [
      "Some message with ",
      { label: "link text", href: "http://link.href", title: "and a 'title'" },
      "."
    ]);
    assert.deepStrictEqual(parseLinkedText(`Some message with [link text](http://link.href 'and a "title"').`).nodes, [
      "Some message with ",
      { label: "link text", href: "http://link.href", title: 'and a "title"' },
      "."
    ]);
    assert.deepStrictEqual(parseLinkedText("Some message with [link text](random stuff).").nodes, [
      "Some message with [link text](random stuff)."
    ]);
    assert.deepStrictEqual(parseLinkedText("Some message with [https link](https://link.href).").nodes, [
      "Some message with ",
      { label: "https link", href: "https://link.href" },
      "."
    ]);
    assert.deepStrictEqual(parseLinkedText("Some message with [https link](https:).").nodes, [
      "Some message with [https link](https:)."
    ]);
    assert.deepStrictEqual(parseLinkedText("Some message with [a command](command:foobar).").nodes, [
      "Some message with ",
      { label: "a command", href: "command:foobar" },
      "."
    ]);
    assert.deepStrictEqual(parseLinkedText("Some message with [a command](command:).").nodes, [
      "Some message with [a command](command:)."
    ]);
    assert.deepStrictEqual(parseLinkedText('link [one](command:foo "nice") and link [two](http://foo)...').nodes, [
      "link ",
      { label: "one", href: "command:foo", title: "nice" },
      " and link ",
      { label: "two", href: "http://foo" },
      "..."
    ]);
    assert.deepStrictEqual(parseLinkedText('link\n[one](command:foo "nice")\nand link [two](http://foo)...').nodes, [
      "link\n",
      { label: "one", href: "command:foo", title: "nice" },
      "\nand link ",
      { label: "two", href: "http://foo" },
      "..."
    ]);
  });
  test("Should match non-greedily", () => {
    assert.deepStrictEqual(parseLinkedText('a [link text 1](http://link.href "title1") b [link text 2](http://link.href "title2") c').nodes, [
      "a ",
      { label: "link text 1", href: "http://link.href", title: "title1" },
      " b ",
      { label: "link text 2", href: "http://link.href", title: "title2" },
      " c"
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vbGlua2VkVGV4dC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgcGFyc2VMaW5rZWRUZXh0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2xpbmtlZFRleHQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbnN1aXRlKCdMaW5rZWRUZXh0JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdwYXJzZXMgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMaW5rZWRUZXh0KCcnKS5ub2RlcywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMaW5rZWRUZXh0KCdoZWxsbycpLm5vZGVzLCBbJ2hlbGxvJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMaW5rZWRUZXh0KCdoZWxsbyB0aGVyZScpLm5vZGVzLCBbJ2hlbGxvIHRoZXJlJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMaW5rZWRUZXh0KCdTb21lIG1lc3NhZ2Ugd2l0aCBbbGluayB0ZXh0XShodHRwOi8vbGluay5ocmVmKS4nKS5ub2RlcywgW1xuXHRcdFx0J1NvbWUgbWVzc2FnZSB3aXRoICcsXG5cdFx0XHR7IGxhYmVsOiAnbGluayB0ZXh0JywgaHJlZjogJ2h0dHA6Ly9saW5rLmhyZWYnIH0sXG5cdFx0XHQnLidcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGlua2VkVGV4dCgnU29tZSBtZXNzYWdlIHdpdGggW2xpbmsgdGV4dF0oaHR0cDovL2xpbmsuaHJlZiBcImFuZCBhIHRpdGxlXCIpLicpLm5vZGVzLCBbXG5cdFx0XHQnU29tZSBtZXNzYWdlIHdpdGggJyxcblx0XHRcdHsgbGFiZWw6ICdsaW5rIHRleHQnLCBocmVmOiAnaHR0cDovL2xpbmsuaHJlZicsIHRpdGxlOiAnYW5kIGEgdGl0bGUnIH0sXG5cdFx0XHQnLidcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGlua2VkVGV4dCgnU29tZSBtZXNzYWdlIHdpdGggW2xpbmsgdGV4dF0oaHR0cDovL2xpbmsuaHJlZiBcXCdhbmQgYSB0aXRsZVxcJykuJykubm9kZXMsIFtcblx0XHRcdCdTb21lIG1lc3NhZ2Ugd2l0aCAnLFxuXHRcdFx0eyBsYWJlbDogJ2xpbmsgdGV4dCcsIGhyZWY6ICdodHRwOi8vbGluay5ocmVmJywgdGl0bGU6ICdhbmQgYSB0aXRsZScgfSxcblx0XHRcdCcuJ1xuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMaW5rZWRUZXh0KCdTb21lIG1lc3NhZ2Ugd2l0aCBbbGluayB0ZXh0XShodHRwOi8vbGluay5ocmVmIFwiYW5kIGEgXFwndGl0bGVcXCdcIikuJykubm9kZXMsIFtcblx0XHRcdCdTb21lIG1lc3NhZ2Ugd2l0aCAnLFxuXHRcdFx0eyBsYWJlbDogJ2xpbmsgdGV4dCcsIGhyZWY6ICdodHRwOi8vbGluay5ocmVmJywgdGl0bGU6ICdhbmQgYSBcXCd0aXRsZVxcJycgfSxcblx0XHRcdCcuJ1xuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMaW5rZWRUZXh0KCdTb21lIG1lc3NhZ2Ugd2l0aCBbbGluayB0ZXh0XShodHRwOi8vbGluay5ocmVmIFxcJ2FuZCBhIFwidGl0bGVcIlxcJykuJykubm9kZXMsIFtcblx0XHRcdCdTb21lIG1lc3NhZ2Ugd2l0aCAnLFxuXHRcdFx0eyBsYWJlbDogJ2xpbmsgdGV4dCcsIGhyZWY6ICdodHRwOi8vbGluay5ocmVmJywgdGl0bGU6ICdhbmQgYSBcInRpdGxlXCInIH0sXG5cdFx0XHQnLidcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGlua2VkVGV4dCgnU29tZSBtZXNzYWdlIHdpdGggW2xpbmsgdGV4dF0ocmFuZG9tIHN0dWZmKS4nKS5ub2RlcywgW1xuXHRcdFx0J1NvbWUgbWVzc2FnZSB3aXRoIFtsaW5rIHRleHRdKHJhbmRvbSBzdHVmZikuJ1xuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMaW5rZWRUZXh0KCdTb21lIG1lc3NhZ2Ugd2l0aCBbaHR0cHMgbGlua10oaHR0cHM6Ly9saW5rLmhyZWYpLicpLm5vZGVzLCBbXG5cdFx0XHQnU29tZSBtZXNzYWdlIHdpdGggJyxcblx0XHRcdHsgbGFiZWw6ICdodHRwcyBsaW5rJywgaHJlZjogJ2h0dHBzOi8vbGluay5ocmVmJyB9LFxuXHRcdFx0Jy4nXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUxpbmtlZFRleHQoJ1NvbWUgbWVzc2FnZSB3aXRoIFtodHRwcyBsaW5rXShodHRwczopLicpLm5vZGVzLCBbXG5cdFx0XHQnU29tZSBtZXNzYWdlIHdpdGggW2h0dHBzIGxpbmtdKGh0dHBzOikuJ1xuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMaW5rZWRUZXh0KCdTb21lIG1lc3NhZ2Ugd2l0aCBbYSBjb21tYW5kXShjb21tYW5kOmZvb2JhcikuJykubm9kZXMsIFtcblx0XHRcdCdTb21lIG1lc3NhZ2Ugd2l0aCAnLFxuXHRcdFx0eyBsYWJlbDogJ2EgY29tbWFuZCcsIGhyZWY6ICdjb21tYW5kOmZvb2JhcicgfSxcblx0XHRcdCcuJ1xuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMaW5rZWRUZXh0KCdTb21lIG1lc3NhZ2Ugd2l0aCBbYSBjb21tYW5kXShjb21tYW5kOikuJykubm9kZXMsIFtcblx0XHRcdCdTb21lIG1lc3NhZ2Ugd2l0aCBbYSBjb21tYW5kXShjb21tYW5kOikuJ1xuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMaW5rZWRUZXh0KCdsaW5rIFtvbmVdKGNvbW1hbmQ6Zm9vIFwibmljZVwiKSBhbmQgbGluayBbdHdvXShodHRwOi8vZm9vKS4uLicpLm5vZGVzLCBbXG5cdFx0XHQnbGluayAnLFxuXHRcdFx0eyBsYWJlbDogJ29uZScsIGhyZWY6ICdjb21tYW5kOmZvbycsIHRpdGxlOiAnbmljZScgfSxcblx0XHRcdCcgYW5kIGxpbmsgJyxcblx0XHRcdHsgbGFiZWw6ICd0d28nLCBocmVmOiAnaHR0cDovL2ZvbycgfSxcblx0XHRcdCcuLi4nXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUxpbmtlZFRleHQoJ2xpbmtcXG5bb25lXShjb21tYW5kOmZvbyBcIm5pY2VcIilcXG5hbmQgbGluayBbdHdvXShodHRwOi8vZm9vKS4uLicpLm5vZGVzLCBbXG5cdFx0XHQnbGlua1xcbicsXG5cdFx0XHR7IGxhYmVsOiAnb25lJywgaHJlZjogJ2NvbW1hbmQ6Zm9vJywgdGl0bGU6ICduaWNlJyB9LFxuXHRcdFx0J1xcbmFuZCBsaW5rICcsXG5cdFx0XHR7IGxhYmVsOiAndHdvJywgaHJlZjogJ2h0dHA6Ly9mb28nIH0sXG5cdFx0XHQnLi4uJ1xuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdTaG91bGQgbWF0Y2ggbm9uLWdyZWVkaWx5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMaW5rZWRUZXh0KCdhIFtsaW5rIHRleHQgMV0oaHR0cDovL2xpbmsuaHJlZiBcInRpdGxlMVwiKSBiIFtsaW5rIHRleHQgMl0oaHR0cDovL2xpbmsuaHJlZiBcInRpdGxlMlwiKSBjJykubm9kZXMsIFtcblx0XHRcdCdhICcsXG5cdFx0XHR7IGxhYmVsOiAnbGluayB0ZXh0IDEnLCBocmVmOiAnaHR0cDovL2xpbmsuaHJlZicsIHRpdGxlOiAndGl0bGUxJyB9LFxuXHRcdFx0JyBiICcsXG5cdFx0XHR7IGxhYmVsOiAnbGluayB0ZXh0IDInLCBocmVmOiAnaHR0cDovL2xpbmsuaHJlZicsIHRpdGxlOiAndGl0bGUyJyB9LFxuXHRcdFx0JyBjJyxcblx0XHRdKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUV4RCxNQUFNLGNBQWMsTUFBTTtBQUN6QiwwQ0FBd0M7QUFFeEMsT0FBSyxvQkFBb0IsTUFBTTtBQUM5QixXQUFPLGdCQUFnQixnQkFBZ0IsRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBQ3BELFdBQU8sZ0JBQWdCLGdCQUFnQixPQUFPLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQztBQUNoRSxXQUFPLGdCQUFnQixnQkFBZ0IsYUFBYSxFQUFFLE9BQU8sQ0FBQyxhQUFhLENBQUM7QUFDNUUsV0FBTyxnQkFBZ0IsZ0JBQWdCLGtEQUFrRCxFQUFFLE9BQU87QUFBQSxNQUNqRztBQUFB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
