import assert from "assert";
import { CharCode } from "../../common/charCode.js";
import * as extpath from "../../common/extpath.js";
import { isWindows } from "../../common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("Paths", () => {
  test("toForwardSlashes", () => {
    assert.strictEqual(extpath.toSlashes("\\\\server\\share\\some\\path"), "//server/share/some/path");
    assert.strictEqual(extpath.toSlashes("c:\\test"), "c:/test");
    assert.strictEqual(extpath.toSlashes("foo\\bar"), "foo/bar");
    assert.strictEqual(extpath.toSlashes("/user/far"), "/user/far");
  });
  test("getRoot", () => {
    assert.strictEqual(extpath.getRoot("/user/far"), "/");
    assert.strictEqual(extpath.getRoot("\\\\server\\share\\some\\path"), "//server/share/");
    assert.strictEqual(extpath.getRoot("//server/share/some/path"), "//server/share/");
    assert.strictEqual(extpath.getRoot("//server/share"), "/");
    assert.strictEqual(extpath.getRoot("//server"), "/");
    assert.strictEqual(extpath.getRoot("//server//"), "/");
    assert.strictEqual(extpath.getRoot("c:/user/far"), "c:/");
    assert.strictEqual(extpath.getRoot("c:user/far"), "c:");
    assert.strictEqual(extpath.getRoot("http://www"), "");
    assert.strictEqual(extpath.getRoot("http://www/"), "http://www/");
    assert.strictEqual(extpath.getRoot("file:///foo"), "file:///");
    assert.strictEqual(extpath.getRoot("file://foo"), "");
  });
  (!isWindows ? test.skip : test)("isUNC", () => {
    assert.ok(!extpath.isUNC("foo"));
    assert.ok(!extpath.isUNC("/foo"));
    assert.ok(!extpath.isUNC("\\foo"));
    assert.ok(!extpath.isUNC("\\\\foo"));
    assert.ok(extpath.isUNC("\\\\a\\b"));
    assert.ok(!extpath.isUNC("//a/b"));
    assert.ok(extpath.isUNC("\\\\server\\share"));
    assert.ok(extpath.isUNC("\\\\server\\share\\"));
    assert.ok(extpath.isUNC("\\\\server\\share\\path"));
  });
  test("isValidBasename", () => {
    assert.ok(!extpath.isValidBasename(null));
    assert.ok(!extpath.isValidBasename(""));
    assert.ok(extpath.isValidBasename("test.txt"));
    assert.ok(!extpath.isValidBasename("/test.txt"));
    if (isWindows) {
      assert.ok(!extpath.isValidBasename("\\test.txt"));
      assert.ok(!extpath.isValidBasename("aux"));
      assert.ok(!extpath.isValidBasename("Aux"));
      assert.ok(!extpath.isValidBasename("LPT0"));
      assert.ok(!extpath.isValidBasename("aux.txt"));
      assert.ok(!extpath.isValidBasename("com0.abc"));
      assert.ok(extpath.isValidBasename("LPT00"));
      assert.ok(extpath.isValidBasename("aux1"));
      assert.ok(extpath.isValidBasename("aux1.txt"));
      assert.ok(extpath.isValidBasename("aux1.aux.txt"));
      assert.ok(!extpath.isValidBasename("test.txt."));
      assert.ok(!extpath.isValidBasename("test.txt.."));
      assert.ok(!extpath.isValidBasename("test.txt "));
      assert.ok(!extpath.isValidBasename("test.txt	"));
      assert.ok(!extpath.isValidBasename("tes:t.txt"));
      assert.ok(!extpath.isValidBasename('tes"t.txt'));
    } else {
      assert.ok(extpath.isValidBasename("\\test.txt"));
    }
  });
  test("sanitizeFilePath", () => {
    if (isWindows) {
      assert.strictEqual(extpath.sanitizeFilePath(".", "C:\\the\\cwd"), "C:\\the\\cwd");
      assert.strictEqual(extpath.sanitizeFilePath("", "C:\\the\\cwd"), "C:\\the\\cwd");
      assert.strictEqual(extpath.sanitizeFilePath("C:", "C:\\the\\cwd"), "C:\\");
      assert.strictEqual(extpath.sanitizeFilePath("C:\\", "C:\\the\\cwd"), "C:\\");
      assert.strictEqual(extpath.sanitizeFilePath("C:\\\\", "C:\\the\\cwd"), "C:\\");
      assert.strictEqual(extpath.sanitizeFilePath("C:\\folder\\my.txt", "C:\\the\\cwd"), "C:\\folder\\my.txt");
      assert.strictEqual(extpath.sanitizeFilePath("C:\\folder\\my", "C:\\the\\cwd"), "C:\\folder\\my");
      assert.strictEqual(extpath.sanitizeFilePath("C:\\folder\\..\\my", "C:\\the\\cwd"), "C:\\my");
      assert.strictEqual(extpath.sanitizeFilePath("C:\\folder\\my\\", "C:\\the\\cwd"), "C:\\folder\\my");
      assert.strictEqual(extpath.sanitizeFilePath("C:\\folder\\my\\\\\\", "C:\\the\\cwd"), "C:\\folder\\my");
      assert.strictEqual(extpath.sanitizeFilePath("my.txt", "C:\\the\\cwd"), "C:\\the\\cwd\\my.txt");
      assert.strictEqual(extpath.sanitizeFilePath("my.txt\\", "C:\\the\\cwd"), "C:\\the\\cwd\\my.txt");
      assert.strictEqual(extpath.sanitizeFilePath("\\\\localhost\\folder\\my", "C:\\the\\cwd"), "\\\\localhost\\folder\\my");
      assert.strictEqual(extpath.sanitizeFilePath("\\\\localhost\\folder\\my\\", "C:\\the\\cwd"), "\\\\localhost\\folder\\my");
    } else {
      assert.strictEqual(extpath.sanitizeFilePath(".", "/the/cwd"), "/the/cwd");
      assert.strictEqual(extpath.sanitizeFilePath("", "/the/cwd"), "/the/cwd");
      assert.strictEqual(extpath.sanitizeFilePath("/", "/the/cwd"), "/");
      assert.strictEqual(extpath.sanitizeFilePath("/folder/my.txt", "/the/cwd"), "/folder/my.txt");
      assert.strictEqual(extpath.sanitizeFilePath("/folder/my", "/the/cwd"), "/folder/my");
      assert.strictEqual(extpath.sanitizeFilePath("/folder/../my", "/the/cwd"), "/my");
      assert.strictEqual(extpath.sanitizeFilePath("/folder/my/", "/the/cwd"), "/folder/my");
      assert.strictEqual(extpath.sanitizeFilePath("/folder/my///", "/the/cwd"), "/folder/my");
      assert.strictEqual(extpath.sanitizeFilePath("my.txt", "/the/cwd"), "/the/cwd/my.txt");
      assert.strictEqual(extpath.sanitizeFilePath("my.txt/", "/the/cwd"), "/the/cwd/my.txt");
    }
  });
  test("isRootOrDriveLetter", () => {
    if (isWindows) {
      assert.ok(extpath.isRootOrDriveLetter("c:"));
      assert.ok(extpath.isRootOrDriveLetter("D:"));
      assert.ok(extpath.isRootOrDriveLetter("D:/"));
      assert.ok(extpath.isRootOrDriveLetter("D:\\"));
      assert.ok(!extpath.isRootOrDriveLetter("D:\\path"));
      assert.ok(!extpath.isRootOrDriveLetter("D:/path"));
    } else {
      assert.ok(extpath.isRootOrDriveLetter("/"));
      assert.ok(!extpath.isRootOrDriveLetter("/path"));
    }
  });
  test("hasDriveLetter", () => {
    if (isWindows) {
      assert.ok(extpath.hasDriveLetter("c:"));
      assert.ok(extpath.hasDriveLetter("D:"));
      assert.ok(extpath.hasDriveLetter("D:/"));
      assert.ok(extpath.hasDriveLetter("D:\\"));
      assert.ok(extpath.hasDriveLetter("D:\\path"));
      assert.ok(extpath.hasDriveLetter("D:/path"));
    } else {
      assert.ok(!extpath.hasDriveLetter("/"));
      assert.ok(!extpath.hasDriveLetter("/path"));
    }
  });
  test("getDriveLetter", () => {
    if (isWindows) {
      assert.strictEqual(extpath.getDriveLetter("c:"), "c");
      assert.strictEqual(extpath.getDriveLetter("D:"), "D");
      assert.strictEqual(extpath.getDriveLetter("D:/"), "D");
      assert.strictEqual(extpath.getDriveLetter("D:\\"), "D");
      assert.strictEqual(extpath.getDriveLetter("D:\\path"), "D");
      assert.strictEqual(extpath.getDriveLetter("D:/path"), "D");
    } else {
      assert.ok(!extpath.getDriveLetter("/"));
      assert.ok(!extpath.getDriveLetter("/path"));
    }
  });
  test("isWindowsDriveLetter", () => {
    assert.ok(!extpath.isWindowsDriveLetter(0));
    assert.ok(!extpath.isWindowsDriveLetter(-1));
    assert.ok(extpath.isWindowsDriveLetter(CharCode.A));
    assert.ok(extpath.isWindowsDriveLetter(CharCode.z));
  });
  test("indexOfPath", () => {
    assert.strictEqual(extpath.indexOfPath("/foo", "/bar", true), -1);
    assert.strictEqual(extpath.indexOfPath("/foo", "/FOO", false), -1);
    assert.strictEqual(extpath.indexOfPath("/foo", "/FOO", true), 0);
    assert.strictEqual(extpath.indexOfPath("/some/long/path", "/some/long", false), 0);
    assert.strictEqual(extpath.indexOfPath("/some/long/path", "/PATH", true), 10);
  });
  test("parseLineAndColumnAware", () => {
    let res = extpath.parseLineAndColumnAware("/foo/bar");
    assert.strictEqual(res.path, "/foo/bar");
    assert.strictEqual(res.line, void 0);
    assert.strictEqual(res.column, void 0);
    res = extpath.parseLineAndColumnAware("/foo/bar:33");
    assert.strictEqual(res.path, "/foo/bar");
    assert.strictEqual(res.line, 33);
    assert.strictEqual(res.column, 1);
    res = extpath.parseLineAndColumnAware("/foo/bar:33:34");
    assert.strictEqual(res.path, "/foo/bar");
    assert.strictEqual(res.line, 33);
    assert.strictEqual(res.column, 34);
    res = extpath.parseLineAndColumnAware("C:\\foo\\bar");
    assert.strictEqual(res.path, "C:\\foo\\bar");
    assert.strictEqual(res.line, void 0);
    assert.strictEqual(res.column, void 0);
    res = extpath.parseLineAndColumnAware("C:\\foo\\bar:33");
    assert.strictEqual(res.path, "C:\\foo\\bar");
    assert.strictEqual(res.line, 33);
    assert.strictEqual(res.column, 1);
    res = extpath.parseLineAndColumnAware("C:\\foo\\bar:33:34");
    assert.strictEqual(res.path, "C:\\foo\\bar");
    assert.strictEqual(res.line, 33);
    assert.strictEqual(res.column, 34);
    res = extpath.parseLineAndColumnAware("/foo/bar:abb");
    assert.strictEqual(res.path, "/foo/bar:abb");
    assert.strictEqual(res.line, void 0);
    assert.strictEqual(res.column, void 0);
  });
  test("randomPath", () => {
    let res = extpath.randomPath("/foo/bar");
    assert.ok(res);
    res = extpath.randomPath("/foo/bar", "prefix-");
    assert.ok(res.indexOf("prefix-"));
    const r1 = extpath.randomPath("/foo/bar");
    const r2 = extpath.randomPath("/foo/bar");
    assert.notStrictEqual(r1, r2);
    const r3 = extpath.randomPath("", "", 3);
    assert.strictEqual(r3.length, 3);
    const r4 = extpath.randomPath();
    assert.ok(r4);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vZXh0cGF0aC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0ICogYXMgZXh0cGF0aCBmcm9tICcuLi8uLi9jb21tb24vZXh0cGF0aC5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbnN1aXRlKCdQYXRocycsICgpID0+IHtcblxuXHR0ZXN0KCd0b0ZvcndhcmRTbGFzaGVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLnRvU2xhc2hlcygnXFxcXFxcXFxzZXJ2ZXJcXFxcc2hhcmVcXFxcc29tZVxcXFxwYXRoJyksICcvL3NlcnZlci9zaGFyZS9zb21lL3BhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC50b1NsYXNoZXMoJ2M6XFxcXHRlc3QnKSwgJ2M6L3Rlc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC50b1NsYXNoZXMoJ2Zvb1xcXFxiYXInKSwgJ2Zvby9iYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC50b1NsYXNoZXMoJy91c2VyL2ZhcicpLCAnL3VzZXIvZmFyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFJvb3QnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguZ2V0Um9vdCgnL3VzZXIvZmFyJyksICcvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguZ2V0Um9vdCgnXFxcXFxcXFxzZXJ2ZXJcXFxcc2hhcmVcXFxcc29tZVxcXFxwYXRoJyksICcvL3NlcnZlci9zaGFyZS8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5nZXRSb290KCcvL3NlcnZlci9zaGFyZS9zb21lL3BhdGgnKSwgJy8vc2VydmVyL3NoYXJlLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmdldFJvb3QoJy8vc2VydmVyL3NoYXJlJyksICcvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguZ2V0Um9vdCgnLy9zZXJ2ZXInKSwgJy8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5nZXRSb290KCcvL3NlcnZlci8vJyksICcvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguZ2V0Um9vdCgnYzovdXNlci9mYXInKSwgJ2M6LycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmdldFJvb3QoJ2M6dXNlci9mYXInKSwgJ2M6Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguZ2V0Um9vdCgnaHR0cDovL3d3dycpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguZ2V0Um9vdCgnaHR0cDovL3d3dy8nKSwgJ2h0dHA6Ly93d3cvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguZ2V0Um9vdCgnZmlsZTovLy9mb28nKSwgJ2ZpbGU6Ly8vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguZ2V0Um9vdCgnZmlsZTovL2ZvbycpLCAnJyk7XG5cdH0pO1xuXG5cdCghaXNXaW5kb3dzID8gdGVzdC5za2lwIDogdGVzdCkoJ2lzVU5DJywgKCkgPT4ge1xuXHRcdGFzc2VydC5vayghZXh0cGF0aC5pc1VOQygnZm9vJykpO1xuXHRcdGFzc2VydC5vayghZXh0cGF0aC5pc1VOQygnL2ZvbycpKTtcblx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNVTkMoJ1xcXFxmb28nKSk7XG5cdFx0YXNzZXJ0Lm9rKCFleHRwYXRoLmlzVU5DKCdcXFxcXFxcXGZvbycpKTtcblx0XHRhc3NlcnQub2soZXh0cGF0aC5pc1VOQygnXFxcXFxcXFxhXFxcXGInKSk7XG5cdFx0YXNzZXJ0Lm9rKCFleHRwYXRoLmlzVU5DKCcvL2EvYicpKTtcblx0XHRhc3NlcnQub2soZXh0cGF0aC5pc1VOQygnXFxcXFxcXFxzZXJ2ZXJcXFxcc2hhcmUnKSk7XG5cdFx0YXNzZXJ0Lm9rKGV4dHBhdGguaXNVTkMoJ1xcXFxcXFxcc2VydmVyXFxcXHNoYXJlXFxcXCcpKTtcblx0XHRhc3NlcnQub2soZXh0cGF0aC5pc1VOQygnXFxcXFxcXFxzZXJ2ZXJcXFxcc2hhcmVcXFxccGF0aCcpKTtcblx0fSk7XG5cblx0dGVzdCgnaXNWYWxpZEJhc2VuYW1lJywgKCkgPT4ge1xuXHRcdGFzc2VydC5vayghZXh0cGF0aC5pc1ZhbGlkQmFzZW5hbWUobnVsbCkpO1xuXHRcdGFzc2VydC5vayghZXh0cGF0aC5pc1ZhbGlkQmFzZW5hbWUoJycpKTtcblx0XHRhc3NlcnQub2soZXh0cGF0aC5pc1ZhbGlkQmFzZW5hbWUoJ3Rlc3QudHh0JykpO1xuXHRcdGFzc2VydC5vayghZXh0cGF0aC5pc1ZhbGlkQmFzZW5hbWUoJy90ZXN0LnR4dCcpKTtcblxuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGFzc2VydC5vayghZXh0cGF0aC5pc1ZhbGlkQmFzZW5hbWUoJ1xcXFx0ZXN0LnR4dCcpKTtcblx0XHRcdGFzc2VydC5vayghZXh0cGF0aC5pc1ZhbGlkQmFzZW5hbWUoJ2F1eCcpKTtcblx0XHRcdGFzc2VydC5vayghZXh0cGF0aC5pc1ZhbGlkQmFzZW5hbWUoJ0F1eCcpKTtcblx0XHRcdGFzc2VydC5vayghZXh0cGF0aC5pc1ZhbGlkQmFzZW5hbWUoJ0xQVDAnKSk7XG5cdFx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNWYWxpZEJhc2VuYW1lKCdhdXgudHh0JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFleHRwYXRoLmlzVmFsaWRCYXNlbmFtZSgnY29tMC5hYmMnKSk7XG5cdFx0XHRhc3NlcnQub2soZXh0cGF0aC5pc1ZhbGlkQmFzZW5hbWUoJ0xQVDAwJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGV4dHBhdGguaXNWYWxpZEJhc2VuYW1lKCdhdXgxJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGV4dHBhdGguaXNWYWxpZEJhc2VuYW1lKCdhdXgxLnR4dCcpKTtcblx0XHRcdGFzc2VydC5vayhleHRwYXRoLmlzVmFsaWRCYXNlbmFtZSgnYXV4MS5hdXgudHh0JykpO1xuXG5cdFx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNWYWxpZEJhc2VuYW1lKCd0ZXN0LnR4dC4nKSk7XG5cdFx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNWYWxpZEJhc2VuYW1lKCd0ZXN0LnR4dC4uJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFleHRwYXRoLmlzVmFsaWRCYXNlbmFtZSgndGVzdC50eHQgJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFleHRwYXRoLmlzVmFsaWRCYXNlbmFtZSgndGVzdC50eHRcXHQnKSk7XG5cdFx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNWYWxpZEJhc2VuYW1lKCd0ZXM6dC50eHQnKSk7XG5cdFx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNWYWxpZEJhc2VuYW1lKCd0ZXNcInQudHh0JykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQub2soZXh0cGF0aC5pc1ZhbGlkQmFzZW5hbWUoJ1xcXFx0ZXN0LnR4dCcpKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Nhbml0aXplRmlsZVBhdGgnLCAoKSA9PiB7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguc2FuaXRpemVGaWxlUGF0aCgnLicsICdDOlxcXFx0aGVcXFxcY3dkJyksICdDOlxcXFx0aGVcXFxcY3dkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5zYW5pdGl6ZUZpbGVQYXRoKCcnLCAnQzpcXFxcdGhlXFxcXGN3ZCcpLCAnQzpcXFxcdGhlXFxcXGN3ZCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5zYW5pdGl6ZUZpbGVQYXRoKCdDOicsICdDOlxcXFx0aGVcXFxcY3dkJyksICdDOlxcXFwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLnNhbml0aXplRmlsZVBhdGgoJ0M6XFxcXCcsICdDOlxcXFx0aGVcXFxcY3dkJyksICdDOlxcXFwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLnNhbml0aXplRmlsZVBhdGgoJ0M6XFxcXFxcXFwnLCAnQzpcXFxcdGhlXFxcXGN3ZCcpLCAnQzpcXFxcJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLnNhbml0aXplRmlsZVBhdGgoJ0M6XFxcXGZvbGRlclxcXFxteS50eHQnLCAnQzpcXFxcdGhlXFxcXGN3ZCcpLCAnQzpcXFxcZm9sZGVyXFxcXG15LnR4dCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguc2FuaXRpemVGaWxlUGF0aCgnQzpcXFxcZm9sZGVyXFxcXG15JywgJ0M6XFxcXHRoZVxcXFxjd2QnKSwgJ0M6XFxcXGZvbGRlclxcXFxteScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguc2FuaXRpemVGaWxlUGF0aCgnQzpcXFxcZm9sZGVyXFxcXC4uXFxcXG15JywgJ0M6XFxcXHRoZVxcXFxjd2QnKSwgJ0M6XFxcXG15Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5zYW5pdGl6ZUZpbGVQYXRoKCdDOlxcXFxmb2xkZXJcXFxcbXlcXFxcJywgJ0M6XFxcXHRoZVxcXFxjd2QnKSwgJ0M6XFxcXGZvbGRlclxcXFxteScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguc2FuaXRpemVGaWxlUGF0aCgnQzpcXFxcZm9sZGVyXFxcXG15XFxcXFxcXFxcXFxcJywgJ0M6XFxcXHRoZVxcXFxjd2QnKSwgJ0M6XFxcXGZvbGRlclxcXFxteScpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5zYW5pdGl6ZUZpbGVQYXRoKCdteS50eHQnLCAnQzpcXFxcdGhlXFxcXGN3ZCcpLCAnQzpcXFxcdGhlXFxcXGN3ZFxcXFxteS50eHQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLnNhbml0aXplRmlsZVBhdGgoJ215LnR4dFxcXFwnLCAnQzpcXFxcdGhlXFxcXGN3ZCcpLCAnQzpcXFxcdGhlXFxcXGN3ZFxcXFxteS50eHQnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguc2FuaXRpemVGaWxlUGF0aCgnXFxcXFxcXFxsb2NhbGhvc3RcXFxcZm9sZGVyXFxcXG15JywgJ0M6XFxcXHRoZVxcXFxjd2QnKSwgJ1xcXFxcXFxcbG9jYWxob3N0XFxcXGZvbGRlclxcXFxteScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguc2FuaXRpemVGaWxlUGF0aCgnXFxcXFxcXFxsb2NhbGhvc3RcXFxcZm9sZGVyXFxcXG15XFxcXCcsICdDOlxcXFx0aGVcXFxcY3dkJyksICdcXFxcXFxcXGxvY2FsaG9zdFxcXFxmb2xkZXJcXFxcbXknKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguc2FuaXRpemVGaWxlUGF0aCgnLicsICcvdGhlL2N3ZCcpLCAnL3RoZS9jd2QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLnNhbml0aXplRmlsZVBhdGgoJycsICcvdGhlL2N3ZCcpLCAnL3RoZS9jd2QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLnNhbml0aXplRmlsZVBhdGgoJy8nLCAnL3RoZS9jd2QnKSwgJy8nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguc2FuaXRpemVGaWxlUGF0aCgnL2ZvbGRlci9teS50eHQnLCAnL3RoZS9jd2QnKSwgJy9mb2xkZXIvbXkudHh0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5zYW5pdGl6ZUZpbGVQYXRoKCcvZm9sZGVyL215JywgJy90aGUvY3dkJyksICcvZm9sZGVyL215Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5zYW5pdGl6ZUZpbGVQYXRoKCcvZm9sZGVyLy4uL215JywgJy90aGUvY3dkJyksICcvbXknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLnNhbml0aXplRmlsZVBhdGgoJy9mb2xkZXIvbXkvJywgJy90aGUvY3dkJyksICcvZm9sZGVyL215Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5zYW5pdGl6ZUZpbGVQYXRoKCcvZm9sZGVyL215Ly8vJywgJy90aGUvY3dkJyksICcvZm9sZGVyL215Jyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLnNhbml0aXplRmlsZVBhdGgoJ215LnR4dCcsICcvdGhlL2N3ZCcpLCAnL3RoZS9jd2QvbXkudHh0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5zYW5pdGl6ZUZpbGVQYXRoKCdteS50eHQvJywgJy90aGUvY3dkJyksICcvdGhlL2N3ZC9teS50eHQnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2lzUm9vdE9yRHJpdmVMZXR0ZXInLCAoKSA9PiB7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0YXNzZXJ0Lm9rKGV4dHBhdGguaXNSb290T3JEcml2ZUxldHRlcignYzonKSk7XG5cdFx0XHRhc3NlcnQub2soZXh0cGF0aC5pc1Jvb3RPckRyaXZlTGV0dGVyKCdEOicpKTtcblx0XHRcdGFzc2VydC5vayhleHRwYXRoLmlzUm9vdE9yRHJpdmVMZXR0ZXIoJ0Q6LycpKTtcblx0XHRcdGFzc2VydC5vayhleHRwYXRoLmlzUm9vdE9yRHJpdmVMZXR0ZXIoJ0Q6XFxcXCcpKTtcblx0XHRcdGFzc2VydC5vayghZXh0cGF0aC5pc1Jvb3RPckRyaXZlTGV0dGVyKCdEOlxcXFxwYXRoJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFleHRwYXRoLmlzUm9vdE9yRHJpdmVMZXR0ZXIoJ0Q6L3BhdGgnKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5vayhleHRwYXRoLmlzUm9vdE9yRHJpdmVMZXR0ZXIoJy8nKSk7XG5cdFx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNSb290T3JEcml2ZUxldHRlcignL3BhdGgnKSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdoYXNEcml2ZUxldHRlcicsICgpID0+IHtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRhc3NlcnQub2soZXh0cGF0aC5oYXNEcml2ZUxldHRlcignYzonKSk7XG5cdFx0XHRhc3NlcnQub2soZXh0cGF0aC5oYXNEcml2ZUxldHRlcignRDonKSk7XG5cdFx0XHRhc3NlcnQub2soZXh0cGF0aC5oYXNEcml2ZUxldHRlcignRDovJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGV4dHBhdGguaGFzRHJpdmVMZXR0ZXIoJ0Q6XFxcXCcpKTtcblx0XHRcdGFzc2VydC5vayhleHRwYXRoLmhhc0RyaXZlTGV0dGVyKCdEOlxcXFxwYXRoJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGV4dHBhdGguaGFzRHJpdmVMZXR0ZXIoJ0Q6L3BhdGgnKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5vayghZXh0cGF0aC5oYXNEcml2ZUxldHRlcignLycpKTtcblx0XHRcdGFzc2VydC5vayghZXh0cGF0aC5oYXNEcml2ZUxldHRlcignL3BhdGgnKSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdnZXREcml2ZUxldHRlcicsICgpID0+IHtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5nZXREcml2ZUxldHRlcignYzonKSwgJ2MnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmdldERyaXZlTGV0dGVyKCdEOicpLCAnRCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguZ2V0RHJpdmVMZXR0ZXIoJ0Q6LycpLCAnRCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguZ2V0RHJpdmVMZXR0ZXIoJ0Q6XFxcXCcpLCAnRCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguZ2V0RHJpdmVMZXR0ZXIoJ0Q6XFxcXHBhdGgnKSwgJ0QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmdldERyaXZlTGV0dGVyKCdEOi9wYXRoJyksICdEJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5vayghZXh0cGF0aC5nZXREcml2ZUxldHRlcignLycpKTtcblx0XHRcdGFzc2VydC5vayghZXh0cGF0aC5nZXREcml2ZUxldHRlcignL3BhdGgnKSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdpc1dpbmRvd3NEcml2ZUxldHRlcicsICgpID0+IHtcblx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNXaW5kb3dzRHJpdmVMZXR0ZXIoMCkpO1xuXHRcdGFzc2VydC5vayghZXh0cGF0aC5pc1dpbmRvd3NEcml2ZUxldHRlcigtMSkpO1xuXHRcdGFzc2VydC5vayhleHRwYXRoLmlzV2luZG93c0RyaXZlTGV0dGVyKENoYXJDb2RlLkEpKTtcblx0XHRhc3NlcnQub2soZXh0cGF0aC5pc1dpbmRvd3NEcml2ZUxldHRlcihDaGFyQ29kZS56KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luZGV4T2ZQYXRoJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmluZGV4T2ZQYXRoKCcvZm9vJywgJy9iYXInLCB0cnVlKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmluZGV4T2ZQYXRoKCcvZm9vJywgJy9GT08nLCBmYWxzZSksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5pbmRleE9mUGF0aCgnL2ZvbycsICcvRk9PJywgdHJ1ZSksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmluZGV4T2ZQYXRoKCcvc29tZS9sb25nL3BhdGgnLCAnL3NvbWUvbG9uZycsIGZhbHNlKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguaW5kZXhPZlBhdGgoJy9zb21lL2xvbmcvcGF0aCcsICcvUEFUSCcsIHRydWUpLCAxMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlTGluZUFuZENvbHVtbkF3YXJlJywgKCkgPT4ge1xuXHRcdGxldCByZXMgPSBleHRwYXRoLnBhcnNlTGluZUFuZENvbHVtbkF3YXJlKCcvZm9vL2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMucGF0aCwgJy9mb28vYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5saW5lLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuY29sdW1uLCB1bmRlZmluZWQpO1xuXG5cdFx0cmVzID0gZXh0cGF0aC5wYXJzZUxpbmVBbmRDb2x1bW5Bd2FyZSgnL2Zvby9iYXI6MzMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnBhdGgsICcvZm9vL2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMubGluZSwgMzMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuY29sdW1uLCAxKTtcblxuXHRcdHJlcyA9IGV4dHBhdGgucGFyc2VMaW5lQW5kQ29sdW1uQXdhcmUoJy9mb28vYmFyOjMzOjM0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5wYXRoLCAnL2Zvby9iYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmxpbmUsIDMzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmNvbHVtbiwgMzQpO1xuXG5cdFx0cmVzID0gZXh0cGF0aC5wYXJzZUxpbmVBbmRDb2x1bW5Bd2FyZSgnQzpcXFxcZm9vXFxcXGJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMucGF0aCwgJ0M6XFxcXGZvb1xcXFxiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmxpbmUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5jb2x1bW4sIHVuZGVmaW5lZCk7XG5cblx0XHRyZXMgPSBleHRwYXRoLnBhcnNlTGluZUFuZENvbHVtbkF3YXJlKCdDOlxcXFxmb29cXFxcYmFyOjMzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5wYXRoLCAnQzpcXFxcZm9vXFxcXGJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMubGluZSwgMzMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuY29sdW1uLCAxKTtcblxuXHRcdHJlcyA9IGV4dHBhdGgucGFyc2VMaW5lQW5kQ29sdW1uQXdhcmUoJ0M6XFxcXGZvb1xcXFxiYXI6MzM6MzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnBhdGgsICdDOlxcXFxmb29cXFxcYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5saW5lLCAzMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5jb2x1bW4sIDM0KTtcblxuXHRcdHJlcyA9IGV4dHBhdGgucGFyc2VMaW5lQW5kQ29sdW1uQXdhcmUoJy9mb28vYmFyOmFiYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMucGF0aCwgJy9mb28vYmFyOmFiYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMubGluZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmNvbHVtbiwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZG9tUGF0aCcsICgpID0+IHtcblx0XHRsZXQgcmVzID0gZXh0cGF0aC5yYW5kb21QYXRoKCcvZm9vL2JhcicpO1xuXHRcdGFzc2VydC5vayhyZXMpO1xuXG5cdFx0cmVzID0gZXh0cGF0aC5yYW5kb21QYXRoKCcvZm9vL2JhcicsICdwcmVmaXgtJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlcy5pbmRleE9mKCdwcmVmaXgtJykpO1xuXG5cdFx0Y29uc3QgcjEgPSBleHRwYXRoLnJhbmRvbVBhdGgoJy9mb28vYmFyJyk7XG5cdFx0Y29uc3QgcjIgPSBleHRwYXRoLnJhbmRvbVBhdGgoJy9mb28vYmFyJyk7XG5cblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocjEsIHIyKTtcblxuXHRcdGNvbnN0IHIzID0gZXh0cGF0aC5yYW5kb21QYXRoKCcnLCAnJywgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIzLmxlbmd0aCwgMyk7XG5cblx0XHRjb25zdCByNCA9IGV4dHBhdGgucmFuZG9tUGF0aCgpO1xuXHRcdGFzc2VydC5vayhyNCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sU0FBUyxNQUFNO0FBRXBCLE9BQUssb0JBQW9CLE1BQU07QUFDOUIsV0FBTyxZQUFZLFFBQVEsVUFBVSwrQkFBK0IsR0FBRywwQkFBMEI7QUFDakcsV0FBTyxZQUFZLFFBQVEsVUFBVSxVQUFVLEdBQUcsU0FBUztBQUMzRCxXQUFPLFlBQVksUUFBUSxVQUFVLFVBQVUsR0FBRyxTQUFTO0FBQzNELFdBQU8sWUFBWSxRQUFRLFVBQVUsV0FBVyxHQUFHLFdBQVc7QUFBQSxFQUMvRCxDQUFDO0FBRUQsT0FBSyxXQUFXLE1BQU07QUFDckIsV0FBTyxZQUFZLFFBQVEsUUFBUSxXQUFXLEdBQUcsR0FBRztBQUNwRCxXQUFPLFlBQVksUUFBUSxRQUFRLCtCQUErQixHQUFHLGlCQUFpQjtBQUN0RixXQUFPLFlBQVksUUFBUSxRQUFRLDBCQUEwQixHQUFHLGlCQUFpQjtBQUNqRixXQUFPLFlBQVksUUFBUSxRQUFRLGdCQUFnQixHQUFHLEdBQUc7QUFDekQsV0FBTyxZQUFZLFFBQVEsUUFBUSxVQUFVLEdBQUcsR0FBRztBQUNuRCxXQUFPLFlBQVksUUFBUSxRQUFRLFlBQVksR0FBRyxHQUFHO0FBQ3JELFdBQU8sWUFBWSxRQUFRLFFBQVEsYUFBYSxHQUFHLEtBQUs7QUFDeEQsV0FBTyxZQUFZLFFBQVEsUUFBUSxZQUFZLEdBQUcsSUFBSTtBQUN0RCxXQUFPLFlBQVksUUFBUSxRQUFRLFlBQVksR0FBRyxFQUFFO0FBQ3BELFdBQU8sWUFBWSxRQUFRLFFBQVEsYUFBYSxHQUFHLGFBQWE7QUFDaEUsV0FBTyxZQUFZLFFBQVEsUUFBUSxhQUFhLEdBQUcsVUFBVTtBQUM3RCxXQUFPLFlBQVksUUFBUSxRQUFRLFlBQVksR0FBRyxFQUFFO0FBQUEsRUFDckQsQ0FBQztBQUVELEdBQUMsQ0FBQyxZQUFZLEtBQUssT0FBTyxNQUFNLFNBQVMsTUFBTTtBQUM5QyxXQUFPLEdBQUcsQ0FBQyxRQUFRLE1BQU0sS0FBSyxDQUFDO0FBQy9CLFdBQU8sR0FBRyxDQUFDLFFBQVEsTUFBTSxNQUFNLENBQUM7QUFDaEMsV0FBTyxHQUFHLENBQUMsUUFBUSxNQUFNLE9BQU8sQ0FBQztBQUNqQyxXQUFPLEdBQUcsQ0FBQyxRQUFRLE1BQU0sU0FBUyxDQUFDO0FBQ25DLFdBQU8sR0FBRyxRQUFRLE1BQU0sVUFBVSxDQUFDO0FBQ25DLFdBQU8sR0FBRyxDQUFDLFFBQVEsTUFBTSxPQUFPLENBQUM7QUFDakMsV0FBTyxHQUFHLFFBQVEsTUFBTSxtQkFBbUIsQ0FBQztBQUM1QyxXQUFPLEdBQUcsUUFBUSxNQUFNLHFCQUFxQixDQUFDO0FBQzlDLFdBQU8sR0FBRyxRQUFRLE1BQU0seUJBQXlCLENBQUM7QUFBQSxFQUNuRCxDQUFDO0FBRUQsT0FBSyxtQkFBbUIsTUFBTTtBQUM3QixXQUFPLEdBQUcsQ0FBQyxRQUFRLGdCQUFnQixJQUFJLENBQUM7QUFDeEMsV0FBTyxHQUFHLENBQUMsUUFBUSxnQkFBZ0IsRUFBRSxDQUFDO0FBQ3RDLFdBQU8sR0FBRyxRQUFRLGdCQUFnQixVQUFVLENBQUM7QUFDN0MsV0FBTyxHQUFHLENBQUMsUUFBUSxnQkFBZ0IsV0FBVyxDQUFDO0FBRS9DLFFBQUksV0FBVztBQUNkLGFBQU8sR0FBRyxDQUFDLFFBQVEsZ0JBQWdCLFlBQVksQ0FBQztBQUNoRCxhQUFPLEdBQUcsQ0FBQyxRQUFRLGdCQUFnQixLQUFLLENBQUM7QUFDekMsYUFBTyxHQUFHLENBQUMsUUFBUSxnQkFBZ0IsS0FBSyxDQUFDO0FBQ3pDLGFBQU8sR0FBRyxDQUFDLFFBQVEsZ0JBQWdCLE1BQU0sQ0FBQztBQUMxQyxhQUFPLEdBQUcsQ0FBQyxRQUFRLGdCQUFnQixTQUFTLENBQUM7QUFDN0MsYUFBTyxHQUFHLENBQUMsUUFBUSxnQkFBZ0IsVUFBVSxDQUFDO0FBQzlDLGFBQU8sR0FBRyxRQUFRLGdCQUFnQixPQUFPLENBQUM7QUFDMUMsYUFBTyxHQUFHLFFBQVEsZ0JBQWdCLE1BQU0sQ0FBQztBQUN6QyxhQUFPLEdBQUcsUUFBUSxnQkFBZ0IsVUFBVSxDQUFDO0FBQzdDLGFBQU8sR0FBRyxRQUFRLGdCQUFnQixjQUFjLENBQUM7QUFFakQsYUFBTyxHQUFHLENBQUMsUUFBUSxnQkFBZ0IsV0FBVyxDQUFDO0FBQy9DLGFBQU8sR0FBRyxDQUFDLFFBQVEsZ0JBQWdCLFlBQVksQ0FBQztBQUNoRCxhQUFPLEdBQUcsQ0FBQyxRQUFRLGdCQUFnQixXQUFXLENBQUM7QUFDL0MsYUFBTyxHQUFHLENBQUMsUUFBUSxnQkFBZ0IsV0FBWSxDQUFDO0FBQ2hELGFBQU8sR0FBRyxDQUFDLFFBQVEsZ0JBQWdCLFdBQVcsQ0FBQztBQUMvQyxhQUFPLEdBQUcsQ0FBQyxRQUFRLGdCQUFnQixXQUFXLENBQUM7QUFBQSxJQUNoRCxPQUFPO0FBQ04sYUFBTyxHQUFHLFFBQVEsZ0JBQWdCLFlBQVksQ0FBQztBQUFBLElBQ2hEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxvQkFBb0IsTUFBTTtBQUM5QixRQUFJLFdBQVc7QUFDZCxhQUFPLFlBQVksUUFBUSxpQkFBaUIsS0FBSyxjQUFjLEdBQUcsY0FBYztBQUNoRixhQUFPLFlBQVksUUFBUSxpQkFBaUIsSUFBSSxjQUFjLEdBQUcsY0FBYztBQUUvRSxhQUFPLFlBQVksUUFBUSxpQkFBaUIsTUFBTSxjQUFjLEdBQUcsTUFBTTtBQUN6RSxhQUFPLFlBQVksUUFBUSxpQkFBaUIsUUFBUSxjQUFjLEdBQUcsTUFBTTtBQUMzRSxhQUFPLFlBQVksUUFBUSxpQkFBaUIsVUFBVSxjQUFjLEdBQUcsTUFBTTtBQUU3RSxhQUFPLFlBQVksUUFBUSxpQkFBaUIsc0JBQXNCLGNBQWMsR0FBRyxvQkFBb0I7QUFDdkcsYUFBTyxZQUFZLFFBQVEsaUJBQWlCLGtCQUFrQixjQUFjLEdBQUcsZ0JBQWdCO0FBQy9GLGFBQU8sWUFBWSxRQUFRLGlCQUFpQixzQkFBc0IsY0FBYyxHQUFHLFFBQVE7QUFDM0YsYUFBTyxZQUFZLFFBQVEsaUJBQWlCLG9CQUFvQixjQUFjLEdBQUcsZ0JBQWdCO0FBQ2pHLGFBQU8sWUFBWSxRQUFRLGlCQUFpQix3QkFBd0IsY0FBYyxHQUFHLGdCQUFnQjtBQUVyRyxhQUFPLFlBQVksUUFBUSxpQkFBaUIsVUFBVSxjQUFjLEdBQUcsc0JBQXNCO0FBQzdGLGFBQU8sWUFBWSxRQUFRLGlCQUFpQixZQUFZLGNBQWMsR0FBRyxzQkFBc0I7QUFFL0YsYUFBTyxZQUFZLFFBQVEsaUJBQWlCLDZCQUE2QixjQUFjLEdBQUcsMkJBQTJCO0FBQ3JILGFBQU8sWUFBWSxRQUFRLGlCQUFpQiwrQkFBK0IsY0FBYyxHQUFHLDJCQUEyQjtBQUFBLElBQ3hILE9BQU87QUFDTixhQUFPLFlBQVksUUFBUSxpQkFBaUIsS0FBSyxVQUFVLEdBQUcsVUFBVTtBQUN4RSxhQUFPLFlBQVksUUFBUSxpQkFBaUIsSUFBSSxVQUFVLEdBQUcsVUFBVTtBQUN2RSxhQUFPLFlBQVksUUFBUSxpQkFBaUIsS0FBSyxVQUFVLEdBQUcsR0FBRztBQUVqRSxhQUFPLFlBQVksUUFBUSxpQkFBaUIsa0JBQWtCLFVBQVUsR0FBRyxnQkFBZ0I7QUFDM0YsYUFBTyxZQUFZLFFBQVEsaUJBQWlCLGNBQWMsVUFBVSxHQUFHLFlBQVk7QUFDbkYsYUFBTyxZQUFZLFFBQVEsaUJBQWlCLGlCQUFpQixVQUFVLEdBQUcsS0FBSztBQUMvRSxhQUFPLFlBQVksUUFBUSxpQkFBaUIsZUFBZSxVQUFVLEdBQUcsWUFBWTtBQUNwRixhQUFPLFlBQVksUUFBUSxpQkFBaUIsaUJBQWlCLFVBQVUsR0FBRyxZQUFZO0FBRXRGLGFBQU8sWUFBWSxRQUFRLGlCQUFpQixVQUFVLFVBQVUsR0FBRyxpQkFBaUI7QUFDcEYsYUFBTyxZQUFZLFFBQVEsaUJBQWlCLFdBQVcsVUFBVSxHQUFHLGlCQUFpQjtBQUFBLElBQ3RGO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyx1QkFBdUIsTUFBTTtBQUNqQyxRQUFJLFdBQVc7QUFDZCxhQUFPLEdBQUcsUUFBUSxvQkFBb0IsSUFBSSxDQUFDO0FBQzNDLGFBQU8sR0FBRyxRQUFRLG9CQUFvQixJQUFJLENBQUM7QUFDM0MsYUFBTyxHQUFHLFFBQVEsb0JBQW9CLEtBQUssQ0FBQztBQUM1QyxhQUFPLEdBQUcsUUFBUSxvQkFBb0IsTUFBTSxDQUFDO0FBQzdDLGFBQU8sR0FBRyxDQUFDLFFBQVEsb0JBQW9CLFVBQVUsQ0FBQztBQUNsRCxhQUFPLEdBQUcsQ0FBQyxRQUFRLG9CQUFvQixTQUFTLENBQUM7QUFBQSxJQUNsRCxPQUFPO0FBQ04sYUFBTyxHQUFHLFFBQVEsb0JBQW9CLEdBQUcsQ0FBQztBQUMxQyxhQUFPLEdBQUcsQ0FBQyxRQUFRLG9CQUFvQixPQUFPLENBQUM7QUFBQSxJQUNoRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssa0JBQWtCLE1BQU07QUFDNUIsUUFBSSxXQUFXO0FBQ2QsYUFBTyxHQUFHLFFBQVEsZUFBZSxJQUFJLENBQUM7QUFDdEMsYUFBTyxHQUFHLFFBQVEsZUFBZSxJQUFJLENBQUM7QUFDdEMsYUFBTyxHQUFHLFFBQVEsZUFBZSxLQUFLLENBQUM7QUFDdkMsYUFBTyxHQUFHLFFBQVEsZUFBZSxNQUFNLENBQUM7QUFDeEMsYUFBTyxHQUFHLFFBQVEsZUFBZSxVQUFVLENBQUM7QUFDNUMsYUFBTyxHQUFHLFFBQVEsZUFBZSxTQUFTLENBQUM7QUFBQSxJQUM1QyxPQUFPO0FBQ04sYUFBTyxHQUFHLENBQUMsUUFBUSxlQUFlLEdBQUcsQ0FBQztBQUN0QyxhQUFPLEdBQUcsQ0FBQyxRQUFRLGVBQWUsT0FBTyxDQUFDO0FBQUEsSUFDM0M7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGtCQUFrQixNQUFNO0FBQzVCLFFBQUksV0FBVztBQUNkLGFBQU8sWUFBWSxRQUFRLGVBQWUsSUFBSSxHQUFHLEdBQUc7QUFDcEQsYUFBTyxZQUFZLFFBQVEsZUFBZSxJQUFJLEdBQUcsR0FBRztBQUNwRCxhQUFPLFlBQVksUUFBUSxlQUFlLEtBQUssR0FBRyxHQUFHO0FBQ3JELGFBQU8sWUFBWSxRQUFRLGVBQWUsTUFBTSxHQUFHLEdBQUc7QUFDdEQsYUFBTyxZQUFZLFFBQVEsZUFBZSxVQUFVLEdBQUcsR0FBRztBQUMxRCxhQUFPLFlBQVksUUFBUSxlQUFlLFNBQVMsR0FBRyxHQUFHO0FBQUEsSUFDMUQsT0FBTztBQUNOLGFBQU8sR0FBRyxDQUFDLFFBQVEsZUFBZSxHQUFHLENBQUM7QUFDdEMsYUFBTyxHQUFHLENBQUMsUUFBUSxlQUFlLE9BQU8sQ0FBQztBQUFBLElBQzNDO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyx3QkFBd0IsTUFBTTtBQUNsQyxXQUFPLEdBQUcsQ0FBQyxRQUFRLHFCQUFxQixDQUFDLENBQUM7QUFDMUMsV0FBTyxHQUFHLENBQUMsUUFBUSxxQkFBcUIsRUFBRSxDQUFDO0FBQzNDLFdBQU8sR0FBRyxRQUFRLHFCQUFxQixTQUFTLENBQUMsQ0FBQztBQUNsRCxXQUFPLEdBQUcsUUFBUSxxQkFBcUIsU0FBUyxDQUFDLENBQUM7QUFBQSxFQUNuRCxDQUFDO0FBRUQsT0FBSyxlQUFlLE1BQU07QUFDekIsV0FBTyxZQUFZLFFBQVEsWUFBWSxRQUFRLFFBQVEsSUFBSSxHQUFHLEVBQUU7QUFDaEUsV0FBTyxZQUFZLFFBQVEsWUFBWSxRQUFRLFFBQVEsS0FBSyxHQUFHLEVBQUU7QUFDakUsV0FBTyxZQUFZLFFBQVEsWUFBWSxRQUFRLFFBQVEsSUFBSSxHQUFHLENBQUM7QUFDL0QsV0FBTyxZQUFZLFFBQVEsWUFBWSxtQkFBbUIsY0FBYyxLQUFLLEdBQUcsQ0FBQztBQUNqRixXQUFPLFlBQVksUUFBUSxZQUFZLG1CQUFtQixTQUFTLElBQUksR0FBRyxFQUFFO0FBQUEsRUFDN0UsQ0FBQztBQUVELE9BQUssMkJBQTJCLE1BQU07QUFDckMsUUFBSSxNQUFNLFFBQVEsd0JBQXdCLFVBQVU7QUFDcEQsV0FBTyxZQUFZLElBQUksTUFBTSxVQUFVO0FBQ3ZDLFdBQU8sWUFBWSxJQUFJLE1BQU0sTUFBUztBQUN0QyxXQUFPLFlBQVksSUFBSSxRQUFRLE1BQVM7QUFFeEMsVUFBTSxRQUFRLHdCQUF3QixhQUFhO0FBQ25ELFdBQU8sWUFBWSxJQUFJLE1BQU0sVUFBVTtBQUN2QyxXQUFPLFlBQVksSUFBSSxNQUFNLEVBQUU7QUFDL0IsV0FBTyxZQUFZLElBQUksUUFBUSxDQUFDO0FBRWhDLFVBQU0sUUFBUSx3QkFBd0IsZ0JBQWdCO0FBQ3RELFdBQU8sWUFBWSxJQUFJLE1BQU0sVUFBVTtBQUN2QyxXQUFPLFlBQVksSUFBSSxNQUFNLEVBQUU7QUFDL0IsV0FBTyxZQUFZLElBQUksUUFBUSxFQUFFO0FBRWpDLFVBQU0sUUFBUSx3QkFBd0IsY0FBYztBQUNwRCxXQUFPLFlBQVksSUFBSSxNQUFNLGNBQWM7QUFDM0MsV0FBTyxZQUFZLElBQUksTUFBTSxNQUFTO0FBQ3RDLFdBQU8sWUFBWSxJQUFJLFFBQVEsTUFBUztBQUV4QyxVQUFNLFFBQVEsd0JBQXdCLGlCQUFpQjtBQUN2RCxXQUFPLFlBQVksSUFBSSxNQUFNLGNBQWM7QUFDM0MsV0FBTyxZQUFZLElBQUksTUFBTSxFQUFFO0FBQy9CLFdBQU8sWUFBWSxJQUFJLFFBQVEsQ0FBQztBQUVoQyxVQUFNLFFBQVEsd0JBQXdCLG9CQUFvQjtBQUMxRCxXQUFPLFlBQVksSUFBSSxNQUFNLGNBQWM7QUFDM0MsV0FBTyxZQUFZLElBQUksTUFBTSxFQUFFO0FBQy9CLFdBQU8sWUFBWSxJQUFJLFFBQVEsRUFBRTtBQUVqQyxVQUFNLFFBQVEsd0JBQXdCLGNBQWM7QUFDcEQsV0FBTyxZQUFZLElBQUksTUFBTSxjQUFjO0FBQzNDLFdBQU8sWUFBWSxJQUFJLE1BQU0sTUFBUztBQUN0QyxXQUFPLFlBQVksSUFBSSxRQUFRLE1BQVM7QUFBQSxFQUN6QyxDQUFDO0FBRUQsT0FBSyxjQUFjLE1BQU07QUFDeEIsUUFBSSxNQUFNLFFBQVEsV0FBVyxVQUFVO0FBQ3ZDLFdBQU8sR0FBRyxHQUFHO0FBRWIsVUFBTSxRQUFRLFdBQVcsWUFBWSxTQUFTO0FBQzlDLFdBQU8sR0FBRyxJQUFJLFFBQVEsU0FBUyxDQUFDO0FBRWhDLFVBQU0sS0FBSyxRQUFRLFdBQVcsVUFBVTtBQUN4QyxVQUFNLEtBQUssUUFBUSxXQUFXLFVBQVU7QUFFeEMsV0FBTyxlQUFlLElBQUksRUFBRTtBQUU1QixVQUFNLEtBQUssUUFBUSxXQUFXLElBQUksSUFBSSxDQUFDO0FBQ3ZDLFdBQU8sWUFBWSxHQUFHLFFBQVEsQ0FBQztBQUUvQixVQUFNLEtBQUssUUFBUSxXQUFXO0FBQzlCLFdBQU8sR0FBRyxFQUFFO0FBQUEsRUFDYixDQUFDO0FBRUQsMENBQXdDO0FBQ3pDLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
