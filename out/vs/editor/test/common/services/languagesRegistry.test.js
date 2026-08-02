import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { LanguagesRegistry } from "../../../common/services/languagesRegistry.js";
suite("LanguagesRegistry", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("output language does not have a name", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "outputLangId",
      extensions: [],
      aliases: [],
      mimetypes: ["outputLanguageMimeType"]
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), []);
    registry.dispose();
  });
  test("language with alias does have a name", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "langId",
      extensions: [],
      aliases: ["LangName"],
      mimetypes: ["bla"]
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: "LangName", languageId: "langId" }]);
    assert.deepStrictEqual(registry.getLanguageName("langId"), "LangName");
    registry.dispose();
  });
  test("language without alias gets a name", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "langId",
      extensions: [],
      mimetypes: ["bla"]
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: "langId", languageId: "langId" }]);
    assert.deepStrictEqual(registry.getLanguageName("langId"), "langId");
    registry.dispose();
  });
  test("bug #4360: f# not shown in status bar", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "langId",
      extensions: [".ext1"],
      aliases: ["LangName"],
      mimetypes: ["bla"]
    }]);
    registry._registerLanguages([{
      id: "langId",
      extensions: [".ext2"],
      aliases: [],
      mimetypes: ["bla"]
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: "LangName", languageId: "langId" }]);
    assert.deepStrictEqual(registry.getLanguageName("langId"), "LangName");
    registry.dispose();
  });
  test("issue #5278: Extension cannot override language name anymore", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "langId",
      extensions: [".ext1"],
      aliases: ["LangName"],
      mimetypes: ["bla"]
    }]);
    registry._registerLanguages([{
      id: "langId",
      extensions: [".ext2"],
      aliases: ["BetterLanguageName"],
      mimetypes: ["bla"]
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: "BetterLanguageName", languageId: "langId" }]);
    assert.deepStrictEqual(registry.getLanguageName("langId"), "BetterLanguageName");
    registry.dispose();
  });
  test("mimetypes are generated if necessary", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "langId"
    }]);
    assert.deepStrictEqual(registry.getMimeType("langId"), "text/x-langId");
    registry.dispose();
  });
  test("first mimetype wins", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "langId",
      mimetypes: ["text/langId", "text/langId2"]
    }]);
    assert.deepStrictEqual(registry.getMimeType("langId"), "text/langId");
    registry.dispose();
  });
  test("first mimetype wins 2", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "langId"
    }]);
    registry._registerLanguages([{
      id: "langId",
      mimetypes: ["text/langId"]
    }]);
    assert.deepStrictEqual(registry.getMimeType("langId"), "text/x-langId");
    registry.dispose();
  });
  test("aliases", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "a"
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: "a", languageId: "a" }]);
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a"), "a");
    assert.deepStrictEqual(registry.getLanguageName("a"), "a");
    registry._registerLanguages([{
      id: "a",
      aliases: ["A1", "A2"]
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: "A1", languageId: "a" }]);
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a"), "a");
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a1"), "a");
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a2"), "a");
    assert.deepStrictEqual(registry.getLanguageName("a"), "A1");
    registry._registerLanguages([{
      id: "a",
      aliases: ["A3", "A4"]
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: "A3", languageId: "a" }]);
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a"), "a");
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a1"), "a");
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a2"), "a");
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a3"), "a");
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a4"), "a");
    assert.deepStrictEqual(registry.getLanguageName("a"), "A3");
    registry.dispose();
  });
  test("empty aliases array means no alias", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "a"
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: "a", languageId: "a" }]);
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a"), "a");
    assert.deepStrictEqual(registry.getLanguageName("a"), "a");
    registry._registerLanguages([{
      id: "b",
      aliases: []
    }]);
    assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: "a", languageId: "a" }]);
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("a"), "a");
    assert.deepStrictEqual(registry.getLanguageIdByLanguageName("b"), "b");
    assert.deepStrictEqual(registry.getLanguageName("a"), "a");
    assert.deepStrictEqual(registry.getLanguageName("b"), null);
    registry.dispose();
  });
  test("extensions", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "a",
      aliases: ["aName"],
      extensions: ["aExt"]
    }]);
    assert.deepStrictEqual(registry.getExtensions("a"), ["aExt"]);
    registry._registerLanguages([{
      id: "a",
      extensions: ["aExt2"]
    }]);
    assert.deepStrictEqual(registry.getExtensions("a"), ["aExt", "aExt2"]);
    registry.dispose();
  });
  test("extensions of primary language registration come first", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "a",
      extensions: ["aExt3"]
    }]);
    assert.deepStrictEqual(registry.getExtensions("a")[0], "aExt3");
    registry._registerLanguages([{
      id: "a",
      configuration: URI.file("conf.json"),
      extensions: ["aExt"]
    }]);
    assert.deepStrictEqual(registry.getExtensions("a")[0], "aExt");
    registry._registerLanguages([{
      id: "a",
      extensions: ["aExt2"]
    }]);
    assert.deepStrictEqual(registry.getExtensions("a")[0], "aExt");
    registry.dispose();
  });
  test("filenames", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "a",
      aliases: ["aName"],
      filenames: ["aFilename"]
    }]);
    assert.deepStrictEqual(registry.getFilenames("a"), ["aFilename"]);
    registry._registerLanguages([{
      id: "a",
      filenames: ["aFilename2"]
    }]);
    assert.deepStrictEqual(registry.getFilenames("a"), ["aFilename", "aFilename2"]);
    registry.dispose();
  });
  test("configuration", () => {
    const registry = new LanguagesRegistry(false);
    registry._registerLanguages([{
      id: "a",
      aliases: ["aName"],
      configuration: URI.file("/path/to/aFilename")
    }]);
    assert.deepStrictEqual(registry.getConfigurationFiles("a"), [URI.file("/path/to/aFilename")]);
    assert.deepStrictEqual(registry.getConfigurationFiles("aname"), []);
    assert.deepStrictEqual(registry.getConfigurationFiles("aName"), []);
    registry._registerLanguages([{
      id: "a",
      configuration: URI.file("/path/to/aFilename2")
    }]);
    assert.deepStrictEqual(registry.getConfigurationFiles("a"), [URI.file("/path/to/aFilename"), URI.file("/path/to/aFilename2")]);
    assert.deepStrictEqual(registry.getConfigurationFiles("aname"), []);
    assert.deepStrictEqual(registry.getConfigurationFiles("aName"), []);
    registry.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZXNSZWdpc3RyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VzUmVnaXN0cnkuanMnO1xuXG5zdWl0ZSgnTGFuZ3VhZ2VzUmVnaXN0cnknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnb3V0cHV0IGxhbmd1YWdlIGRvZXMgbm90IGhhdmUgYSBuYW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IExhbmd1YWdlc1JlZ2lzdHJ5KGZhbHNlKTtcblxuXHRcdHJlZ2lzdHJ5Ll9yZWdpc3Rlckxhbmd1YWdlcyhbe1xuXHRcdFx0aWQ6ICdvdXRwdXRMYW5nSWQnLFxuXHRcdFx0ZXh0ZW5zaW9uczogW10sXG5cdFx0XHRhbGlhc2VzOiBbXSxcblx0XHRcdG1pbWV0eXBlczogWydvdXRwdXRMYW5ndWFnZU1pbWVUeXBlJ10sXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRTb3J0ZWRSZWdpc3RlcmVkTGFuZ3VhZ2VOYW1lcygpLCBbXSk7XG5cblx0XHRyZWdpc3RyeS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xhbmd1YWdlIHdpdGggYWxpYXMgZG9lcyBoYXZlIGEgbmFtZScsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBMYW5ndWFnZXNSZWdpc3RyeShmYWxzZSk7XG5cblx0XHRyZWdpc3RyeS5fcmVnaXN0ZXJMYW5ndWFnZXMoW3tcblx0XHRcdGlkOiAnbGFuZ0lkJyxcblx0XHRcdGV4dGVuc2lvbnM6IFtdLFxuXHRcdFx0YWxpYXNlczogWydMYW5nTmFtZSddLFxuXHRcdFx0bWltZXR5cGVzOiBbJ2JsYSddLFxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0U29ydGVkUmVnaXN0ZXJlZExhbmd1YWdlTmFtZXMoKSwgW3sgbGFuZ3VhZ2VOYW1lOiAnTGFuZ05hbWUnLCBsYW5ndWFnZUlkOiAnbGFuZ0lkJyB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRMYW5ndWFnZU5hbWUoJ2xhbmdJZCcpLCAnTGFuZ05hbWUnKTtcblxuXHRcdHJlZ2lzdHJ5LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbGFuZ3VhZ2Ugd2l0aG91dCBhbGlhcyBnZXRzIGEgbmFtZScsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBMYW5ndWFnZXNSZWdpc3RyeShmYWxzZSk7XG5cblx0XHRyZWdpc3RyeS5fcmVnaXN0ZXJMYW5ndWFnZXMoW3tcblx0XHRcdGlkOiAnbGFuZ0lkJyxcblx0XHRcdGV4dGVuc2lvbnM6IFtdLFxuXHRcdFx0bWltZXR5cGVzOiBbJ2JsYSddLFxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0U29ydGVkUmVnaXN0ZXJlZExhbmd1YWdlTmFtZXMoKSwgW3sgbGFuZ3VhZ2VOYW1lOiAnbGFuZ0lkJywgbGFuZ3VhZ2VJZDogJ2xhbmdJZCcgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0TGFuZ3VhZ2VOYW1lKCdsYW5nSWQnKSwgJ2xhbmdJZCcpO1xuXG5cdFx0cmVnaXN0cnkuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdidWcgIzQzNjA6IGYjIG5vdCBzaG93biBpbiBzdGF0dXMgYmFyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IExhbmd1YWdlc1JlZ2lzdHJ5KGZhbHNlKTtcblxuXHRcdHJlZ2lzdHJ5Ll9yZWdpc3Rlckxhbmd1YWdlcyhbe1xuXHRcdFx0aWQ6ICdsYW5nSWQnLFxuXHRcdFx0ZXh0ZW5zaW9uczogWycuZXh0MSddLFxuXHRcdFx0YWxpYXNlczogWydMYW5nTmFtZSddLFxuXHRcdFx0bWltZXR5cGVzOiBbJ2JsYSddLFxuXHRcdH1dKTtcblxuXHRcdHJlZ2lzdHJ5Ll9yZWdpc3Rlckxhbmd1YWdlcyhbe1xuXHRcdFx0aWQ6ICdsYW5nSWQnLFxuXHRcdFx0ZXh0ZW5zaW9uczogWycuZXh0MiddLFxuXHRcdFx0YWxpYXNlczogW10sXG5cdFx0XHRtaW1ldHlwZXM6IFsnYmxhJ10sXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRTb3J0ZWRSZWdpc3RlcmVkTGFuZ3VhZ2VOYW1lcygpLCBbeyBsYW5ndWFnZU5hbWU6ICdMYW5nTmFtZScsIGxhbmd1YWdlSWQ6ICdsYW5nSWQnIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldExhbmd1YWdlTmFtZSgnbGFuZ0lkJyksICdMYW5nTmFtZScpO1xuXG5cdFx0cmVnaXN0cnkuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNTI3ODogRXh0ZW5zaW9uIGNhbm5vdCBvdmVycmlkZSBsYW5ndWFnZSBuYW1lIGFueW1vcmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgTGFuZ3VhZ2VzUmVnaXN0cnkoZmFsc2UpO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2xhbmdJZCcsXG5cdFx0XHRleHRlbnNpb25zOiBbJy5leHQxJ10sXG5cdFx0XHRhbGlhc2VzOiBbJ0xhbmdOYW1lJ10sXG5cdFx0XHRtaW1ldHlwZXM6IFsnYmxhJ10sXG5cdFx0fV0pO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2xhbmdJZCcsXG5cdFx0XHRleHRlbnNpb25zOiBbJy5leHQyJ10sXG5cdFx0XHRhbGlhc2VzOiBbJ0JldHRlckxhbmd1YWdlTmFtZSddLFxuXHRcdFx0bWltZXR5cGVzOiBbJ2JsYSddLFxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0U29ydGVkUmVnaXN0ZXJlZExhbmd1YWdlTmFtZXMoKSwgW3sgbGFuZ3VhZ2VOYW1lOiAnQmV0dGVyTGFuZ3VhZ2VOYW1lJywgbGFuZ3VhZ2VJZDogJ2xhbmdJZCcgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0TGFuZ3VhZ2VOYW1lKCdsYW5nSWQnKSwgJ0JldHRlckxhbmd1YWdlTmFtZScpO1xuXG5cdFx0cmVnaXN0cnkuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdtaW1ldHlwZXMgYXJlIGdlbmVyYXRlZCBpZiBuZWNlc3NhcnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgTGFuZ3VhZ2VzUmVnaXN0cnkoZmFsc2UpO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2xhbmdJZCdcblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldE1pbWVUeXBlKCdsYW5nSWQnKSwgJ3RleHQveC1sYW5nSWQnKTtcblxuXHRcdHJlZ2lzdHJ5LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3QgbWltZXR5cGUgd2lucycsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBMYW5ndWFnZXNSZWdpc3RyeShmYWxzZSk7XG5cblx0XHRyZWdpc3RyeS5fcmVnaXN0ZXJMYW5ndWFnZXMoW3tcblx0XHRcdGlkOiAnbGFuZ0lkJyxcblx0XHRcdG1pbWV0eXBlczogWyd0ZXh0L2xhbmdJZCcsICd0ZXh0L2xhbmdJZDInXVxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0TWltZVR5cGUoJ2xhbmdJZCcpLCAndGV4dC9sYW5nSWQnKTtcblxuXHRcdHJlZ2lzdHJ5LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3QgbWltZXR5cGUgd2lucyAyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IExhbmd1YWdlc1JlZ2lzdHJ5KGZhbHNlKTtcblxuXHRcdHJlZ2lzdHJ5Ll9yZWdpc3Rlckxhbmd1YWdlcyhbe1xuXHRcdFx0aWQ6ICdsYW5nSWQnXG5cdFx0fV0pO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2xhbmdJZCcsXG5cdFx0XHRtaW1ldHlwZXM6IFsndGV4dC9sYW5nSWQnXVxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0TWltZVR5cGUoJ2xhbmdJZCcpLCAndGV4dC94LWxhbmdJZCcpO1xuXG5cdFx0cmVnaXN0cnkuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdhbGlhc2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IExhbmd1YWdlc1JlZ2lzdHJ5KGZhbHNlKTtcblxuXHRcdHJlZ2lzdHJ5Ll9yZWdpc3Rlckxhbmd1YWdlcyhbe1xuXHRcdFx0aWQ6ICdhJ1xuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0U29ydGVkUmVnaXN0ZXJlZExhbmd1YWdlTmFtZXMoKSwgW3sgbGFuZ3VhZ2VOYW1lOiAnYScsIGxhbmd1YWdlSWQ6ICdhJyB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRMYW5ndWFnZUlkQnlMYW5ndWFnZU5hbWUoJ2EnKSwgJ2EnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldExhbmd1YWdlTmFtZSgnYScpLCAnYScpO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2EnLFxuXHRcdFx0YWxpYXNlczogWydBMScsICdBMiddXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRTb3J0ZWRSZWdpc3RlcmVkTGFuZ3VhZ2VOYW1lcygpLCBbeyBsYW5ndWFnZU5hbWU6ICdBMScsIGxhbmd1YWdlSWQ6ICdhJyB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRMYW5ndWFnZUlkQnlMYW5ndWFnZU5hbWUoJ2EnKSwgJ2EnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZSgnYTEnKSwgJ2EnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZSgnYTInKSwgJ2EnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldExhbmd1YWdlTmFtZSgnYScpLCAnQTEnKTtcblxuXHRcdHJlZ2lzdHJ5Ll9yZWdpc3Rlckxhbmd1YWdlcyhbe1xuXHRcdFx0aWQ6ICdhJyxcblx0XHRcdGFsaWFzZXM6IFsnQTMnLCAnQTQnXVxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0U29ydGVkUmVnaXN0ZXJlZExhbmd1YWdlTmFtZXMoKSwgW3sgbGFuZ3VhZ2VOYW1lOiAnQTMnLCBsYW5ndWFnZUlkOiAnYScgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0TGFuZ3VhZ2VJZEJ5TGFuZ3VhZ2VOYW1lKCdhJyksICdhJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRMYW5ndWFnZUlkQnlMYW5ndWFnZU5hbWUoJ2ExJyksICdhJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRMYW5ndWFnZUlkQnlMYW5ndWFnZU5hbWUoJ2EyJyksICdhJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRMYW5ndWFnZUlkQnlMYW5ndWFnZU5hbWUoJ2EzJyksICdhJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRMYW5ndWFnZUlkQnlMYW5ndWFnZU5hbWUoJ2E0JyksICdhJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRMYW5ndWFnZU5hbWUoJ2EnKSwgJ0EzJyk7XG5cblx0XHRyZWdpc3RyeS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtcHR5IGFsaWFzZXMgYXJyYXkgbWVhbnMgbm8gYWxpYXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgTGFuZ3VhZ2VzUmVnaXN0cnkoZmFsc2UpO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2EnXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRTb3J0ZWRSZWdpc3RlcmVkTGFuZ3VhZ2VOYW1lcygpLCBbeyBsYW5ndWFnZU5hbWU6ICdhJywgbGFuZ3VhZ2VJZDogJ2EnIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZSgnYScpLCAnYScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0TGFuZ3VhZ2VOYW1lKCdhJyksICdhJyk7XG5cblx0XHRyZWdpc3RyeS5fcmVnaXN0ZXJMYW5ndWFnZXMoW3tcblx0XHRcdGlkOiAnYicsXG5cdFx0XHRhbGlhc2VzOiBbXVxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0U29ydGVkUmVnaXN0ZXJlZExhbmd1YWdlTmFtZXMoKSwgW3sgbGFuZ3VhZ2VOYW1lOiAnYScsIGxhbmd1YWdlSWQ6ICdhJyB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRMYW5ndWFnZUlkQnlMYW5ndWFnZU5hbWUoJ2EnKSwgJ2EnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZSgnYicpLCAnYicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0TGFuZ3VhZ2VOYW1lKCdhJyksICdhJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRMYW5ndWFnZU5hbWUoJ2InKSwgbnVsbCk7XG5cblx0XHRyZWdpc3RyeS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dGVuc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgTGFuZ3VhZ2VzUmVnaXN0cnkoZmFsc2UpO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2EnLFxuXHRcdFx0YWxpYXNlczogWydhTmFtZSddLFxuXHRcdFx0ZXh0ZW5zaW9uczogWydhRXh0J11cblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldEV4dGVuc2lvbnMoJ2EnKSwgWydhRXh0J10pO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2EnLFxuXHRcdFx0ZXh0ZW5zaW9uczogWydhRXh0MiddXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRFeHRlbnNpb25zKCdhJyksIFsnYUV4dCcsICdhRXh0MiddKTtcblxuXHRcdHJlZ2lzdHJ5LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZXh0ZW5zaW9ucyBvZiBwcmltYXJ5IGxhbmd1YWdlIHJlZ2lzdHJhdGlvbiBjb21lIGZpcnN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IExhbmd1YWdlc1JlZ2lzdHJ5KGZhbHNlKTtcblxuXHRcdHJlZ2lzdHJ5Ll9yZWdpc3Rlckxhbmd1YWdlcyhbe1xuXHRcdFx0aWQ6ICdhJyxcblx0XHRcdGV4dGVuc2lvbnM6IFsnYUV4dDMnXVxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0RXh0ZW5zaW9ucygnYScpWzBdLCAnYUV4dDMnKTtcblxuXHRcdHJlZ2lzdHJ5Ll9yZWdpc3Rlckxhbmd1YWdlcyhbe1xuXHRcdFx0aWQ6ICdhJyxcblx0XHRcdGNvbmZpZ3VyYXRpb246IFVSSS5maWxlKCdjb25mLmpzb24nKSxcblx0XHRcdGV4dGVuc2lvbnM6IFsnYUV4dCddXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRFeHRlbnNpb25zKCdhJylbMF0sICdhRXh0Jyk7XG5cblx0XHRyZWdpc3RyeS5fcmVnaXN0ZXJMYW5ndWFnZXMoW3tcblx0XHRcdGlkOiAnYScsXG5cdFx0XHRleHRlbnNpb25zOiBbJ2FFeHQyJ11cblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldEV4dGVuc2lvbnMoJ2EnKVswXSwgJ2FFeHQnKTtcblxuXHRcdHJlZ2lzdHJ5LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsZW5hbWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IExhbmd1YWdlc1JlZ2lzdHJ5KGZhbHNlKTtcblxuXHRcdHJlZ2lzdHJ5Ll9yZWdpc3Rlckxhbmd1YWdlcyhbe1xuXHRcdFx0aWQ6ICdhJyxcblx0XHRcdGFsaWFzZXM6IFsnYU5hbWUnXSxcblx0XHRcdGZpbGVuYW1lczogWydhRmlsZW5hbWUnXVxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0RmlsZW5hbWVzKCdhJyksIFsnYUZpbGVuYW1lJ10pO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2EnLFxuXHRcdFx0ZmlsZW5hbWVzOiBbJ2FGaWxlbmFtZTInXVxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0RmlsZW5hbWVzKCdhJyksIFsnYUZpbGVuYW1lJywgJ2FGaWxlbmFtZTInXSk7XG5cblx0XHRyZWdpc3RyeS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgTGFuZ3VhZ2VzUmVnaXN0cnkoZmFsc2UpO1xuXG5cdFx0cmVnaXN0cnkuX3JlZ2lzdGVyTGFuZ3VhZ2VzKFt7XG5cdFx0XHRpZDogJ2EnLFxuXHRcdFx0YWxpYXNlczogWydhTmFtZSddLFxuXHRcdFx0Y29uZmlndXJhdGlvbjogVVJJLmZpbGUoJy9wYXRoL3RvL2FGaWxlbmFtZScpXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uRmlsZXMoJ2EnKSwgW1VSSS5maWxlKCcvcGF0aC90by9hRmlsZW5hbWUnKV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvbkZpbGVzKCdhbmFtZScpLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uRmlsZXMoJ2FOYW1lJyksIFtdKTtcblxuXHRcdHJlZ2lzdHJ5Ll9yZWdpc3Rlckxhbmd1YWdlcyhbe1xuXHRcdFx0aWQ6ICdhJyxcblx0XHRcdGNvbmZpZ3VyYXRpb246IFVSSS5maWxlKCcvcGF0aC90by9hRmlsZW5hbWUyJylcblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25GaWxlcygnYScpLCBbVVJJLmZpbGUoJy9wYXRoL3RvL2FGaWxlbmFtZScpLCBVUkkuZmlsZSgnL3BhdGgvdG8vYUZpbGVuYW1lMicpXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uRmlsZXMoJ2FuYW1lJyksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25GaWxlcygnYU5hbWUnKSwgW10pO1xuXG5cdFx0cmVnaXN0cnkuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHlCQUF5QjtBQUVsQyxNQUFNLHFCQUFx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
