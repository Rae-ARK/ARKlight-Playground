import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { score, selectLanguageIds } from "../../../common/languageSelector.js";
suite("LanguageSelector", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  const model = {
    language: "farboo",
    uri: URI.parse("file:///testbed/file.fb")
  };
  test("score, invalid selector", function() {
    assert.strictEqual(score({}, model.uri, model.language, true, void 0, void 0), 0);
    assert.strictEqual(score(void 0, model.uri, model.language, true, void 0, void 0), 0);
    assert.strictEqual(score(null, model.uri, model.language, true, void 0, void 0), 0);
    assert.strictEqual(score("", model.uri, model.language, true, void 0, void 0), 0);
  });
  test("score, any language", function() {
    assert.strictEqual(score({ language: "*" }, model.uri, model.language, true, void 0, void 0), 5);
    assert.strictEqual(score("*", model.uri, model.language, true, void 0, void 0), 5);
    assert.strictEqual(score("*", URI.parse("foo:bar"), model.language, true, void 0, void 0), 5);
    assert.strictEqual(score("farboo", URI.parse("foo:bar"), model.language, true, void 0, void 0), 10);
  });
  test("score, default schemes", function() {
    const uri = URI.parse("git:foo/file.txt");
    const language = "farboo";
    assert.strictEqual(score("*", uri, language, true, void 0, void 0), 5);
    assert.strictEqual(score("farboo", uri, language, true, void 0, void 0), 10);
    assert.strictEqual(score({ language: "farboo", scheme: "" }, uri, language, true, void 0, void 0), 10);
    assert.strictEqual(score({ language: "farboo", scheme: "git" }, uri, language, true, void 0, void 0), 10);
    assert.strictEqual(score({ language: "farboo", scheme: "*" }, uri, language, true, void 0, void 0), 10);
    assert.strictEqual(score({ language: "farboo" }, uri, language, true, void 0, void 0), 10);
    assert.strictEqual(score({ language: "*" }, uri, language, true, void 0, void 0), 5);
    assert.strictEqual(score({ scheme: "*" }, uri, language, true, void 0, void 0), 5);
    assert.strictEqual(score({ scheme: "git" }, uri, language, true, void 0, void 0), 10);
  });
  test("score, filter", function() {
    assert.strictEqual(score("farboo", model.uri, model.language, true, void 0, void 0), 10);
    assert.strictEqual(score({ language: "farboo" }, model.uri, model.language, true, void 0, void 0), 10);
    assert.strictEqual(score({ language: "farboo", scheme: "file" }, model.uri, model.language, true, void 0, void 0), 10);
    assert.strictEqual(score({ language: "farboo", scheme: "http" }, model.uri, model.language, true, void 0, void 0), 0);
    assert.strictEqual(score({ pattern: "**/*.fb" }, model.uri, model.language, true, void 0, void 0), 10);
    assert.strictEqual(score({ pattern: "**/*.fb", scheme: "file" }, model.uri, model.language, true, void 0, void 0), 10);
    assert.strictEqual(score({ pattern: "**/*.fb" }, URI.parse("foo:bar"), model.language, true, void 0, void 0), 0);
    assert.strictEqual(score({ pattern: "**/*.fb", scheme: "foo" }, URI.parse("foo:bar"), model.language, true, void 0, void 0), 0);
    const doc = {
      uri: URI.parse("git:/my/file.js"),
      langId: "javascript"
    };
    assert.strictEqual(score("javascript", doc.uri, doc.langId, true, void 0, void 0), 10);
    assert.strictEqual(score({ language: "javascript", scheme: "git" }, doc.uri, doc.langId, true, void 0, void 0), 10);
    assert.strictEqual(score("*", doc.uri, doc.langId, true, void 0, void 0), 5);
    assert.strictEqual(score("fooLang", doc.uri, doc.langId, true, void 0, void 0), 0);
    assert.strictEqual(score(["fooLang", "*"], doc.uri, doc.langId, true, void 0, void 0), 5);
  });
  test("score, max(filters)", function() {
    const match = { language: "farboo", scheme: "file" };
    const fail = { language: "farboo", scheme: "http" };
    assert.strictEqual(score(match, model.uri, model.language, true, void 0, void 0), 10);
    assert.strictEqual(score(fail, model.uri, model.language, true, void 0, void 0), 0);
    assert.strictEqual(score([match, fail], model.uri, model.language, true, void 0, void 0), 10);
    assert.strictEqual(score([fail, fail], model.uri, model.language, true, void 0, void 0), 0);
    assert.strictEqual(score(["farboo", "*"], model.uri, model.language, true, void 0, void 0), 10);
    assert.strictEqual(score(["*", "farboo"], model.uri, model.language, true, void 0, void 0), 10);
  });
  test("score hasAccessToAllModels", function() {
    const doc = {
      uri: URI.parse("file:/my/file.js"),
      langId: "javascript"
    };
    assert.strictEqual(score("javascript", doc.uri, doc.langId, false, void 0, void 0), 0);
    assert.strictEqual(score({ language: "javascript", scheme: "file" }, doc.uri, doc.langId, false, void 0, void 0), 0);
    assert.strictEqual(score("*", doc.uri, doc.langId, false, void 0, void 0), 0);
    assert.strictEqual(score("fooLang", doc.uri, doc.langId, false, void 0, void 0), 0);
    assert.strictEqual(score(["fooLang", "*"], doc.uri, doc.langId, false, void 0, void 0), 0);
    assert.strictEqual(score({ language: "javascript", scheme: "file", hasAccessToAllModels: true }, doc.uri, doc.langId, false, void 0, void 0), 10);
    assert.strictEqual(score(["fooLang", "*", { language: "*", hasAccessToAllModels: true }], doc.uri, doc.langId, false, void 0, void 0), 5);
  });
  test("score, notebookType", function() {
    const obj = {
      uri: URI.parse("vscode-notebook-cell:///my/file.js#blabla"),
      langId: "javascript",
      notebookType: "fooBook",
      notebookUri: URI.parse("file:///my/file.js")
    };
    assert.strictEqual(score("javascript", obj.uri, obj.langId, true, void 0, void 0), 10);
    assert.strictEqual(score("javascript", obj.uri, obj.langId, true, obj.notebookUri, obj.notebookType), 10);
    assert.strictEqual(score({ notebookType: "fooBook" }, obj.uri, obj.langId, true, obj.notebookUri, obj.notebookType), 10);
    assert.strictEqual(score({ notebookType: "fooBook", language: "javascript", scheme: "file" }, obj.uri, obj.langId, true, obj.notebookUri, obj.notebookType), 10);
    assert.strictEqual(score({ notebookType: "fooBook", language: "*" }, obj.uri, obj.langId, true, obj.notebookUri, obj.notebookType), 10);
    assert.strictEqual(score({ notebookType: "*", language: "*" }, obj.uri, obj.langId, true, obj.notebookUri, obj.notebookType), 5);
    assert.strictEqual(score({ notebookType: "*", language: "javascript" }, obj.uri, obj.langId, true, obj.notebookUri, obj.notebookType), 10);
  });
  test("Snippet choices lost #149363", function() {
    const selector = {
      scheme: "vscode-notebook-cell",
      pattern: "/some/path/file.py",
      language: "python"
    };
    const modelUri = URI.parse("vscode-notebook-cell:///some/path/file.py");
    const nbUri = URI.parse("file:///some/path/file.py");
    assert.strictEqual(score(selector, modelUri, "python", true, nbUri, "jupyter"), 10);
    const selector2 = {
      ...selector,
      notebookType: "jupyter"
    };
    assert.strictEqual(score(selector2, modelUri, "python", true, nbUri, "jupyter"), 0);
  });
  test("Document selector match - unexpected result value #60232", function() {
    const selector = {
      language: "json",
      scheme: "file",
      pattern: "**/*.interface.json"
    };
    const value = score(selector, URI.parse("file:///C:/Users/zlhe/Desktop/test.interface.json"), "json", true, void 0, void 0);
    assert.strictEqual(value, 10);
  });
  test("Document selector match - platform paths #99938", function() {
    const selector = {
      pattern: {
        base: "/home/user/Desktop",
        pattern: "*.json"
      }
    };
    const value = score(selector, URI.file("/home/user/Desktop/test.json"), "json", true, void 0, void 0);
    assert.strictEqual(value, 10);
  });
  test("NotebookType without notebook", function() {
    const obj = {
      uri: URI.parse("file:///my/file.bat"),
      langId: "bat"
    };
    let value = score({
      language: "bat",
      notebookType: "xxx"
    }, obj.uri, obj.langId, true, void 0, void 0);
    assert.strictEqual(value, 0);
    value = score({
      language: "bat",
      notebookType: "*"
    }, obj.uri, obj.langId, true, void 0, void 0);
    assert.strictEqual(value, 0);
  });
  test("selectLanguageIds", function() {
    const result = /* @__PURE__ */ new Set();
    selectLanguageIds("typescript", result);
    assert.deepStrictEqual([...result], ["typescript"]);
    result.clear();
    selectLanguageIds({ language: "python", scheme: "file" }, result);
    assert.deepStrictEqual([...result], ["python"]);
    result.clear();
    selectLanguageIds({ scheme: "file" }, result);
    assert.deepStrictEqual([...result], []);
    result.clear();
    selectLanguageIds(["javascript", { language: "css" }, { scheme: "untitled" }], result);
    assert.deepStrictEqual([...result].sort(), ["css", "javascript"]);
    result.clear();
    selectLanguageIds("*", result);
    assert.deepStrictEqual([...result], ["*"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2Rlcy9sYW5ndWFnZVNlbGVjdG9yLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZVNlbGVjdG9yLCBzY29yZSwgc2VsZWN0TGFuZ3VhZ2VJZHMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VTZWxlY3Rvci5qcyc7XG5cbnN1aXRlKCdMYW5ndWFnZVNlbGVjdG9yJywgZnVuY3Rpb24gKCkge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IG1vZGVsID0ge1xuXHRcdGxhbmd1YWdlOiAnZmFyYm9vJyxcblx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0YmVkL2ZpbGUuZmInKVxuXHR9O1xuXG5cdHRlc3QoJ3Njb3JlLCBpbnZhbGlkIHNlbGVjdG9yJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7fSwgbW9kZWwudXJpLCBtb2RlbC5sYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUodW5kZWZpbmVkLCBtb2RlbC51cmksIG1vZGVsLmxhbmd1YWdlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZShudWxsISwgbW9kZWwudXJpLCBtb2RlbC5sYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoJycsIG1vZGVsLnVyaSwgbW9kZWwubGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3JlLCBhbnkgbGFuZ3VhZ2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKHsgbGFuZ3VhZ2U6ICcqJyB9LCBtb2RlbC51cmksIG1vZGVsLmxhbmd1YWdlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSgnKicsIG1vZGVsLnVyaSwgbW9kZWwubGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgNSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoJyonLCBVUkkucGFyc2UoJ2ZvbzpiYXInKSwgbW9kZWwubGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKCdmYXJib28nLCBVUkkucGFyc2UoJ2ZvbzpiYXInKSwgbW9kZWwubGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMTApO1xuXHR9KTtcblxuXHR0ZXN0KCdzY29yZSwgZGVmYXVsdCBzY2hlbWVzJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdnaXQ6Zm9vL2ZpbGUudHh0Jyk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2UgPSAnZmFyYm9vJztcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSgnKicsIHVyaSwgbGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKCdmYXJib28nLCB1cmksIGxhbmd1YWdlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoeyBsYW5ndWFnZTogJ2ZhcmJvbycsIHNjaGVtZTogJycgfSwgdXJpLCBsYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKHsgbGFuZ3VhZ2U6ICdmYXJib28nLCBzY2hlbWU6ICdnaXQnIH0sIHVyaSwgbGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7IGxhbmd1YWdlOiAnZmFyYm9vJywgc2NoZW1lOiAnKicgfSwgdXJpLCBsYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKHsgbGFuZ3VhZ2U6ICdmYXJib28nIH0sIHVyaSwgbGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7IGxhbmd1YWdlOiAnKicgfSwgdXJpLCBsYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCA1KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7IHNjaGVtZTogJyonIH0sIHVyaSwgbGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKHsgc2NoZW1lOiAnZ2l0JyB9LCB1cmksIGxhbmd1YWdlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDEwKTtcblx0fSk7XG5cblx0dGVzdCgnc2NvcmUsIGZpbHRlcicsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoJ2ZhcmJvbycsIG1vZGVsLnVyaSwgbW9kZWwubGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7IGxhbmd1YWdlOiAnZmFyYm9vJyB9LCBtb2RlbC51cmksIG1vZGVsLmxhbmd1YWdlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoeyBsYW5ndWFnZTogJ2ZhcmJvbycsIHNjaGVtZTogJ2ZpbGUnIH0sIG1vZGVsLnVyaSwgbW9kZWwubGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7IGxhbmd1YWdlOiAnZmFyYm9vJywgc2NoZW1lOiAnaHR0cCcgfSwgbW9kZWwudXJpLCBtb2RlbC5sYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7IHBhdHRlcm46ICcqKi8qLmZiJyB9LCBtb2RlbC51cmksIG1vZGVsLmxhbmd1YWdlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoeyBwYXR0ZXJuOiAnKiovKi5mYicsIHNjaGVtZTogJ2ZpbGUnIH0sIG1vZGVsLnVyaSwgbW9kZWwubGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7IHBhdHRlcm46ICcqKi8qLmZiJyB9LCBVUkkucGFyc2UoJ2ZvbzpiYXInKSwgbW9kZWwubGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKHsgcGF0dGVybjogJyoqLyouZmInLCBzY2hlbWU6ICdmb28nIH0sIFVSSS5wYXJzZSgnZm9vOmJhcicpLCBtb2RlbC5sYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAwKTtcblxuXHRcdGNvbnN0IGRvYyA9IHtcblx0XHRcdHVyaTogVVJJLnBhcnNlKCdnaXQ6L215L2ZpbGUuanMnKSxcblx0XHRcdGxhbmdJZDogJ2phdmFzY3JpcHQnXG5cdFx0fTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoJ2phdmFzY3JpcHQnLCBkb2MudXJpLCBkb2MubGFuZ0lkLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDEwKTsgLy8gMDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoeyBsYW5ndWFnZTogJ2phdmFzY3JpcHQnLCBzY2hlbWU6ICdnaXQnIH0sIGRvYy51cmksIGRvYy5sYW5nSWQsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMTApOyAvLyAxMDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoJyonLCBkb2MudXJpLCBkb2MubGFuZ0lkLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDUpOyAvLyA1XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKCdmb29MYW5nJywgZG9jLnVyaSwgZG9jLmxhbmdJZCwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAwKTsgLy8gMFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZShbJ2Zvb0xhbmcnLCAnKiddLCBkb2MudXJpLCBkb2MubGFuZ0lkLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDUpOyAvLyA1XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3JlLCBtYXgoZmlsdGVycyknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbWF0Y2ggPSB7IGxhbmd1YWdlOiAnZmFyYm9vJywgc2NoZW1lOiAnZmlsZScgfTtcblx0XHRjb25zdCBmYWlsID0geyBsYW5ndWFnZTogJ2ZhcmJvbycsIHNjaGVtZTogJ2h0dHAnIH07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUobWF0Y2gsIG1vZGVsLnVyaSwgbW9kZWwubGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZShmYWlsLCBtb2RlbC51cmksIG1vZGVsLmxhbmd1YWdlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZShbbWF0Y2gsIGZhaWxdLCBtb2RlbC51cmksIG1vZGVsLmxhbmd1YWdlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoW2ZhaWwsIGZhaWxdLCBtb2RlbC51cmksIG1vZGVsLmxhbmd1YWdlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZShbJ2ZhcmJvbycsICcqJ10sIG1vZGVsLnVyaSwgbW9kZWwubGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZShbJyonLCAnZmFyYm9vJ10sIG1vZGVsLnVyaSwgbW9kZWwubGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMTApO1xuXHR9KTtcblxuXHR0ZXN0KCdzY29yZSBoYXNBY2Nlc3NUb0FsbE1vZGVscycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBkb2MgPSB7XG5cdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovbXkvZmlsZS5qcycpLFxuXHRcdFx0bGFuZ0lkOiAnamF2YXNjcmlwdCdcblx0XHR9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSgnamF2YXNjcmlwdCcsIGRvYy51cmksIGRvYy5sYW5nSWQsIGZhbHNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7IGxhbmd1YWdlOiAnamF2YXNjcmlwdCcsIHNjaGVtZTogJ2ZpbGUnIH0sIGRvYy51cmksIGRvYy5sYW5nSWQsIGZhbHNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSgnKicsIGRvYy51cmksIGRvYy5sYW5nSWQsIGZhbHNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSgnZm9vTGFuZycsIGRvYy51cmksIGRvYy5sYW5nSWQsIGZhbHNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZShbJ2Zvb0xhbmcnLCAnKiddLCBkb2MudXJpLCBkb2MubGFuZ0lkLCBmYWxzZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7IGxhbmd1YWdlOiAnamF2YXNjcmlwdCcsIHNjaGVtZTogJ2ZpbGUnLCBoYXNBY2Nlc3NUb0FsbE1vZGVsczogdHJ1ZSB9LCBkb2MudXJpLCBkb2MubGFuZ0lkLCBmYWxzZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKFsnZm9vTGFuZycsICcqJywgeyBsYW5ndWFnZTogJyonLCBoYXNBY2Nlc3NUb0FsbE1vZGVsczogdHJ1ZSB9XSwgZG9jLnVyaSwgZG9jLmxhbmdJZCwgZmFsc2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgNSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3JlLCBub3RlYm9va1R5cGUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgb2JqID0ge1xuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ3ZzY29kZS1ub3RlYm9vay1jZWxsOi8vL215L2ZpbGUuanMjYmxhYmxhJyksXG5cdFx0XHRsYW5nSWQ6ICdqYXZhc2NyaXB0Jyxcblx0XHRcdG5vdGVib29rVHlwZTogJ2Zvb0Jvb2snLFxuXHRcdFx0bm90ZWJvb2tVcmk6IFVSSS5wYXJzZSgnZmlsZTovLy9teS9maWxlLmpzJylcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKCdqYXZhc2NyaXB0Jywgb2JqLnVyaSwgb2JqLmxhbmdJZCwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKCdqYXZhc2NyaXB0Jywgb2JqLnVyaSwgb2JqLmxhbmdJZCwgdHJ1ZSwgb2JqLm5vdGVib29rVXJpLCBvYmoubm90ZWJvb2tUeXBlKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7IG5vdGVib29rVHlwZTogJ2Zvb0Jvb2snIH0sIG9iai51cmksIG9iai5sYW5nSWQsIHRydWUsIG9iai5ub3RlYm9va1VyaSwgb2JqLm5vdGVib29rVHlwZSksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoeyBub3RlYm9va1R5cGU6ICdmb29Cb29rJywgbGFuZ3VhZ2U6ICdqYXZhc2NyaXB0Jywgc2NoZW1lOiAnZmlsZScgfSwgb2JqLnVyaSwgb2JqLmxhbmdJZCwgdHJ1ZSwgb2JqLm5vdGVib29rVXJpLCBvYmoubm90ZWJvb2tUeXBlKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7IG5vdGVib29rVHlwZTogJ2Zvb0Jvb2snLCBsYW5ndWFnZTogJyonIH0sIG9iai51cmksIG9iai5sYW5nSWQsIHRydWUsIG9iai5ub3RlYm9va1VyaSwgb2JqLm5vdGVib29rVHlwZSksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoeyBub3RlYm9va1R5cGU6ICcqJywgbGFuZ3VhZ2U6ICcqJyB9LCBvYmoudXJpLCBvYmoubGFuZ0lkLCB0cnVlLCBvYmoubm90ZWJvb2tVcmksIG9iai5ub3RlYm9va1R5cGUpLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoeyBub3RlYm9va1R5cGU6ICcqJywgbGFuZ3VhZ2U6ICdqYXZhc2NyaXB0JyB9LCBvYmoudXJpLCBvYmoubGFuZ0lkLCB0cnVlLCBvYmoubm90ZWJvb2tVcmksIG9iai5ub3RlYm9va1R5cGUpLCAxMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NuaXBwZXQgY2hvaWNlcyBsb3N0ICMxNDkzNjMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2VsZWN0b3I6IExhbmd1YWdlU2VsZWN0b3IgPSB7XG5cdFx0XHRzY2hlbWU6ICd2c2NvZGUtbm90ZWJvb2stY2VsbCcsXG5cdFx0XHRwYXR0ZXJuOiAnL3NvbWUvcGF0aC9maWxlLnB5Jyxcblx0XHRcdGxhbmd1YWdlOiAncHl0aG9uJ1xuXHRcdH07XG5cblx0XHRjb25zdCBtb2RlbFVyaSA9IFVSSS5wYXJzZSgndnNjb2RlLW5vdGVib29rLWNlbGw6Ly8vc29tZS9wYXRoL2ZpbGUucHknKTtcblx0XHRjb25zdCBuYlVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9zb21lL3BhdGgvZmlsZS5weScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZShzZWxlY3RvciwgbW9kZWxVcmksICdweXRob24nLCB0cnVlLCBuYlVyaSwgJ2p1cHl0ZXInKSwgMTApO1xuXG5cdFx0Y29uc3Qgc2VsZWN0b3IyOiBMYW5ndWFnZVNlbGVjdG9yID0ge1xuXHRcdFx0Li4uc2VsZWN0b3IsXG5cdFx0XHRub3RlYm9va1R5cGU6ICdqdXB5dGVyJ1xuXHRcdH07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoc2VsZWN0b3IyLCBtb2RlbFVyaSwgJ3B5dGhvbicsIHRydWUsIG5iVXJpLCAnanVweXRlcicpLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnRG9jdW1lbnQgc2VsZWN0b3IgbWF0Y2ggLSB1bmV4cGVjdGVkIHJlc3VsdCB2YWx1ZSAjNjAyMzInLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2VsZWN0b3IgPSB7XG5cdFx0XHRsYW5ndWFnZTogJ2pzb24nLFxuXHRcdFx0c2NoZW1lOiAnZmlsZScsXG5cdFx0XHRwYXR0ZXJuOiAnKiovKi5pbnRlcmZhY2UuanNvbidcblx0XHR9O1xuXHRcdGNvbnN0IHZhbHVlID0gc2NvcmUoc2VsZWN0b3IsIFVSSS5wYXJzZSgnZmlsZTovLy9DOi9Vc2Vycy96bGhlL0Rlc2t0b3AvdGVzdC5pbnRlcmZhY2UuanNvbicpLCAnanNvbicsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUsIDEwKTtcblx0fSk7XG5cblx0dGVzdCgnRG9jdW1lbnQgc2VsZWN0b3IgbWF0Y2ggLSBwbGF0Zm9ybSBwYXRocyAjOTk5MzgnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2VsZWN0b3IgPSB7XG5cdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdGJhc2U6ICcvaG9tZS91c2VyL0Rlc2t0b3AnLFxuXHRcdFx0XHRwYXR0ZXJuOiAnKi5qc29uJ1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgdmFsdWUgPSBzY29yZShzZWxlY3RvciwgVVJJLmZpbGUoJy9ob21lL3VzZXIvRGVza3RvcC90ZXN0Lmpzb24nKSwgJ2pzb24nLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLCAxMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ05vdGVib29rVHlwZSB3aXRob3V0IG5vdGVib29rJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG9iaiA9IHtcblx0XHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL215L2ZpbGUuYmF0JyksXG5cdFx0XHRsYW5nSWQ6ICdiYXQnLFxuXHRcdH07XG5cblx0XHRsZXQgdmFsdWUgPSBzY29yZSh7XG5cdFx0XHRsYW5ndWFnZTogJ2JhdCcsXG5cdFx0XHRub3RlYm9va1R5cGU6ICd4eHgnXG5cdFx0fSwgb2JqLnVyaSwgb2JqLmxhbmdJZCwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZSwgMCk7XG5cblx0XHR2YWx1ZSA9IHNjb3JlKHtcblx0XHRcdGxhbmd1YWdlOiAnYmF0Jyxcblx0XHRcdG5vdGVib29rVHlwZTogJyonXG5cdFx0fSwgb2JqLnVyaSwgb2JqLmxhbmdJZCwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZSwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGVjdExhbmd1YWdlSWRzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0c2VsZWN0TGFuZ3VhZ2VJZHMoJ3R5cGVzY3JpcHQnLCByZXN1bHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLnJlc3VsdF0sIFsndHlwZXNjcmlwdCddKTtcblxuXHRcdHJlc3VsdC5jbGVhcigpO1xuXHRcdHNlbGVjdExhbmd1YWdlSWRzKHsgbGFuZ3VhZ2U6ICdweXRob24nLCBzY2hlbWU6ICdmaWxlJyB9LCByZXN1bHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLnJlc3VsdF0sIFsncHl0aG9uJ10pO1xuXG5cdFx0cmVzdWx0LmNsZWFyKCk7XG5cdFx0c2VsZWN0TGFuZ3VhZ2VJZHMoeyBzY2hlbWU6ICdmaWxlJyB9LCByZXN1bHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLnJlc3VsdF0sIFtdKTtcblxuXHRcdHJlc3VsdC5jbGVhcigpO1xuXHRcdHNlbGVjdExhbmd1YWdlSWRzKFsnamF2YXNjcmlwdCcsIHsgbGFuZ3VhZ2U6ICdjc3MnIH0sIHsgc2NoZW1lOiAndW50aXRsZWQnIH1dLCByZXN1bHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLnJlc3VsdF0uc29ydCgpLCBbJ2NzcycsICdqYXZhc2NyaXB0J10pO1xuXG5cdFx0cmVzdWx0LmNsZWFyKCk7XG5cdFx0c2VsZWN0TGFuZ3VhZ2VJZHMoJyonLCByZXN1bHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLnJlc3VsdF0sIFsnKiddKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBMkIsT0FBTyx5QkFBeUI7QUFFM0QsTUFBTSxvQkFBb0IsV0FBWTtBQUVyQywwQ0FBd0M7QUFFeEMsUUFBTSxRQUFRO0FBQUEsSUFDYixVQUFVO0FBQUEsSUFDVixLQUFLLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUN6QztBQUVBLE9BQUssMkJBQTJCLFdBQVk7QUFDM0MsV0FBTyxZQUFZLE1BQU0sQ0FBQyxHQUFHLE1BQU0sS0FBSyxNQUFNLFVBQVUsTUFBTSxRQUFXLE1BQVMsR0FBRyxDQUFDO0FBQ3RGLFdBQU8sWUFBWSxNQUFNLFFBQVcsTUFBTSxLQUFLLE1BQU0sVUFBVSxNQUFNLFFBQVcsTUFBUyxHQUFHLENBQUM7QUFDN0YsV0FBTyxZQUFZLE1BQU0sTUFBTyxNQUFNLEtBQUssTUFBTSxVQUFVLE1BQU0sUUFBVyxNQUFTLEdBQUcsQ0FBQztBQUN6RixXQUFPLFlBQVksTUFBTSxJQUFJLE1BQU0sS0FBSyxNQUFNLFVBQVUsTUFBTSxRQUFXLE1BQVMs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
