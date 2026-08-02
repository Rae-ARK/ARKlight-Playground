import assert from "assert";
import { isWindows } from "../../common/platform.js";
import { URI, isUriComponents } from "../../common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("URI", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("file#toString", () => {
    assert.strictEqual(URI.file("c:/win/path").toString(), "file:///c%3A/win/path");
    assert.strictEqual(URI.file("C:/win/path").toString(), "file:///c%3A/win/path");
    assert.strictEqual(URI.file("c:/win/path/").toString(), "file:///c%3A/win/path/");
    assert.strictEqual(URI.file("/c:/win/path").toString(), "file:///c%3A/win/path");
  });
  test("URI.file (win-special)", () => {
    if (isWindows) {
      assert.strictEqual(URI.file("c:\\win\\path").toString(), "file:///c%3A/win/path");
      assert.strictEqual(URI.file("c:\\win/path").toString(), "file:///c%3A/win/path");
    } else {
      assert.strictEqual(URI.file("c:\\win\\path").toString(), "file:///c%3A%5Cwin%5Cpath");
      assert.strictEqual(URI.file("c:\\win/path").toString(), "file:///c%3A%5Cwin/path");
    }
  });
  test("file#fsPath (win-special)", () => {
    if (isWindows) {
      assert.strictEqual(URI.file("c:\\win\\path").fsPath, "c:\\win\\path");
      assert.strictEqual(URI.file("c:\\win/path").fsPath, "c:\\win\\path");
      assert.strictEqual(URI.file("c:/win/path").fsPath, "c:\\win\\path");
      assert.strictEqual(URI.file("c:/win/path/").fsPath, "c:\\win\\path\\");
      assert.strictEqual(URI.file("C:/win/path").fsPath, "c:\\win\\path");
      assert.strictEqual(URI.file("/c:/win/path").fsPath, "c:\\win\\path");
      assert.strictEqual(URI.file("./c/win/path").fsPath, "\\.\\c\\win\\path");
    } else {
      assert.strictEqual(URI.file("c:/win/path").fsPath, "c:/win/path");
      assert.strictEqual(URI.file("c:/win/path/").fsPath, "c:/win/path/");
      assert.strictEqual(URI.file("C:/win/path").fsPath, "c:/win/path");
      assert.strictEqual(URI.file("/c:/win/path").fsPath, "c:/win/path");
      assert.strictEqual(URI.file("./c/win/path").fsPath, "/./c/win/path");
    }
  });
  test("URI#fsPath - no `fsPath` when no `path`", () => {
    const value = URI.parse("file://%2Fhome%2Fticino%2Fdesktop%2Fcpluscplus%2Ftest.cpp");
    assert.strictEqual(value.authority, "/home/ticino/desktop/cpluscplus/test.cpp");
    assert.strictEqual(value.path, "/");
    if (isWindows) {
      assert.strictEqual(value.fsPath, "\\");
    } else {
      assert.strictEqual(value.fsPath, "/");
    }
  });
  test("http#toString", () => {
    assert.strictEqual(URI.from({ scheme: "http", authority: "www.example.com", path: "/my/path" }).toString(), "http://www.example.com/my/path");
    assert.strictEqual(URI.from({ scheme: "http", authority: "www.example.com", path: "/my/path" }).toString(), "http://www.example.com/my/path");
    assert.strictEqual(URI.from({ scheme: "http", authority: "www.EXAMPLE.com", path: "/my/path" }).toString(), "http://www.example.com/my/path");
    assert.strictEqual(URI.from({ scheme: "http", authority: "", path: "my/path" }).toString(), "http:/my/path");
    assert.strictEqual(URI.from({ scheme: "http", authority: "", path: "/my/path" }).toString(), "http:/my/path");
    assert.strictEqual(URI.from({ scheme: "http", authority: "example.com", path: "/", query: "test=true" }).toString(), "http://example.com/?test%3Dtrue");
    assert.strictEqual(URI.from({ scheme: "http", authority: "example.com", path: "/", query: "", fragment: "test=true" }).toString(), "http://example.com/#test%3Dtrue");
  });
  test("http#toString, encode=FALSE", () => {
    assert.strictEqual(URI.from({ scheme: "http", authority: "example.com", path: "/", query: "test=true" }).toString(true), "http://example.com/?test=true");
    assert.strictEqual(URI.from({ scheme: "http", authority: "example.com", path: "/", query: "", fragment: "test=true" }).toString(true), "http://example.com/#test=true");
    assert.strictEqual(URI.from({ scheme: "http", path: "/api/files/test.me", query: "t=1234" }).toString(true), "http:/api/files/test.me?t=1234");
    const value = URI.parse("file://shares/pr\xF6jects/c%23/#l12");
    assert.strictEqual(value.authority, "shares");
    assert.strictEqual(value.path, "/pr\xF6jects/c#/");
    assert.strictEqual(value.fragment, "l12");
    assert.strictEqual(value.toString(), "file://shares/pr%C3%B6jects/c%23/#l12");
    assert.strictEqual(value.toString(true), "file://shares/pr\xF6jects/c%23/#l12");
    const uri2 = URI.parse(value.toString(true));
    const uri3 = URI.parse(value.toString());
    assert.strictEqual(uri2.authority, uri3.authority);
    assert.strictEqual(uri2.path, uri3.path);
    assert.strictEqual(uri2.query, uri3.query);
    assert.strictEqual(uri2.fragment, uri3.fragment);
  });
  test("with, identity", () => {
    const uri = URI.parse("foo:bar/path");
    let uri2 = uri.with(null);
    assert.ok(uri === uri2);
    uri2 = uri.with(void 0);
    assert.ok(uri === uri2);
    uri2 = uri.with({});
    assert.ok(uri === uri2);
    uri2 = uri.with({ scheme: "foo", path: "bar/path" });
    assert.ok(uri === uri2);
  });
  test("with, changes", () => {
    assert.strictEqual(URI.parse("before:some/file/path").with({ scheme: "after" }).toString(), "after:some/file/path");
    assert.strictEqual(URI.from({ scheme: "s" }).with({ scheme: "http", path: "/api/files/test.me", query: "t=1234" }).toString(), "http:/api/files/test.me?t%3D1234");
    assert.strictEqual(URI.from({ scheme: "s" }).with({ scheme: "http", authority: "", path: "/api/files/test.me", query: "t=1234", fragment: "" }).toString(), "http:/api/files/test.me?t%3D1234");
    assert.strictEqual(URI.from({ scheme: "s" }).with({ scheme: "https", authority: "", path: "/api/files/test.me", query: "t=1234", fragment: "" }).toString(), "https:/api/files/test.me?t%3D1234");
    assert.strictEqual(URI.from({ scheme: "s" }).with({ scheme: "HTTP", authority: "", path: "/api/files/test.me", query: "t=1234", fragment: "" }).toString(), "HTTP:/api/files/test.me?t%3D1234");
    assert.strictEqual(URI.from({ scheme: "s" }).with({ scheme: "HTTPS", authority: "", path: "/api/files/test.me", query: "t=1234", fragment: "" }).toString(), "HTTPS:/api/files/test.me?t%3D1234");
    assert.strictEqual(URI.from({ scheme: "s" }).with({ scheme: "boo", authority: "", path: "/api/files/test.me", query: "t=1234", fragment: "" }).toString(), "boo:/api/files/test.me?t%3D1234");
  });
  test("with, remove components #8465", () => {
    assert.strictEqual(URI.parse("scheme://authority/path").with({ authority: "" }).toString(), "scheme:/path");
    assert.strictEqual(URI.parse("scheme:/path").with({ authority: "authority" }).with({ authority: "" }).toString(), "scheme:/path");
    assert.strictEqual(URI.parse("scheme:/path").with({ authority: "authority" }).with({ authority: null }).toString(), "scheme:/path");
    assert.strictEqual(URI.parse("scheme:/path").with({ authority: "authority" }).with({ path: "" }).toString(), "scheme://authority");
    assert.strictEqual(URI.parse("scheme:/path").with({ authority: "authority" }).with({ path: null }).toString(), "scheme://authority");
    assert.strictEqual(URI.parse("scheme:/path").with({ authority: "" }).toString(), "scheme:/path");
    assert.strictEqual(URI.parse("scheme:/path").with({ authority: null }).toString(), "scheme:/path");
  });
  test("with, validation", () => {
    const uri = URI.parse("foo:bar/path");
    assert.throws(() => uri.with({ scheme: "fai:l" }));
    assert.throws(() => uri.with({ scheme: "f\xE4il" }));
    assert.throws(() => uri.with({ authority: "fail" }));
    assert.throws(() => uri.with({ path: "//fail" }));
  });
  test("parse", () => {
    let value = URI.parse("http:/api/files/test.me?t=1234");
    assert.strictEqual(value.scheme, "http");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "/api/files/test.me");
    assert.strictEqual(value.query, "t=1234");
    assert.strictEqual(value.fragment, "");
    value = URI.parse("http://api/files/test.me?t=1234");
    assert.strictEqual(value.scheme, "http");
    assert.strictEqual(value.authority, "api");
    assert.strictEqual(value.path, "/files/test.me");
    assert.strictEqual(value.query, "t=1234");
    assert.strictEqual(value.fragment, "");
    value = URI.parse("file:///c:/test/me");
    assert.strictEqual(value.scheme, "file");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "/c:/test/me");
    assert.strictEqual(value.fragment, "");
    assert.strictEqual(value.query, "");
    assert.strictEqual(value.fsPath, isWindows ? "c:\\test\\me" : "c:/test/me");
    value = URI.parse("file://shares/files/c%23/p.cs");
    assert.strictEqual(value.scheme, "file");
    assert.strictEqual(value.authority, "shares");
    assert.strictEqual(value.path, "/files/c#/p.cs");
    assert.strictEqual(value.fragment, "");
    assert.strictEqual(value.query, "");
    assert.strictEqual(value.fsPath, isWindows ? "\\\\shares\\files\\c#\\p.cs" : "//shares/files/c#/p.cs");
    value = URI.parse("file:///c:/Source/Z%C3%BCrich%20or%20Zurich%20(%CB%88zj%CA%8A%C9%99r%C9%AAk,/Code/resources/app/plugins/c%23/plugin.json");
    assert.strictEqual(value.scheme, "file");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "/c:/Source/Z\xFCrich or Zurich (\u02C8zj\u028A\u0259r\u026Ak,/Code/resources/app/plugins/c#/plugin.json");
    assert.strictEqual(value.fragment, "");
    assert.strictEqual(value.query, "");
    value = URI.parse("file:///c:/test %25/path");
    assert.strictEqual(value.scheme, "file");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "/c:/test %/path");
    assert.strictEqual(value.fragment, "");
    assert.strictEqual(value.query, "");
    value = URI.parse("inmemory:");
    assert.strictEqual(value.scheme, "inmemory");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "");
    assert.strictEqual(value.query, "");
    assert.strictEqual(value.fragment, "");
    value = URI.parse("foo:api/files/test");
    assert.strictEqual(value.scheme, "foo");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "api/files/test");
    assert.strictEqual(value.query, "");
    assert.strictEqual(value.fragment, "");
    value = URI.parse("file:?q");
    assert.strictEqual(value.scheme, "file");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "/");
    assert.strictEqual(value.query, "q");
    assert.strictEqual(value.fragment, "");
    value = URI.parse("file:#d");
    assert.strictEqual(value.scheme, "file");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "/");
    assert.strictEqual(value.query, "");
    assert.strictEqual(value.fragment, "d");
    value = URI.parse("f3ile:#d");
    assert.strictEqual(value.scheme, "f3ile");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "");
    assert.strictEqual(value.query, "");
    assert.strictEqual(value.fragment, "d");
    value = URI.parse("foo+bar:path");
    assert.strictEqual(value.scheme, "foo+bar");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "path");
    assert.strictEqual(value.query, "");
    assert.strictEqual(value.fragment, "");
    value = URI.parse("foo-bar:path");
    assert.strictEqual(value.scheme, "foo-bar");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "path");
    assert.strictEqual(value.query, "");
    assert.strictEqual(value.fragment, "");
    value = URI.parse("foo.bar:path");
    assert.strictEqual(value.scheme, "foo.bar");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "path");
    assert.strictEqual(value.query, "");
    assert.strictEqual(value.fragment, "");
  });
  test("parse, disallow //path when no authority", () => {
    assert.throws(() => URI.parse("file:////shares/files/p.cs"));
  });
  test("URI#file, win-speciale", () => {
    if (isWindows) {
      let value = URI.file("c:\\test\\drive");
      assert.strictEqual(value.path, "/c:/test/drive");
      assert.strictEqual(value.toString(), "file:///c%3A/test/drive");
      value = URI.file("\\\\sh\xE4res\\path\\c#\\plugin.json");
      assert.strictEqual(value.scheme, "file");
      assert.strictEqual(value.authority, "sh\xE4res");
      assert.strictEqual(value.path, "/path/c#/plugin.json");
      assert.strictEqual(value.fragment, "");
      assert.strictEqual(value.query, "");
      assert.strictEqual(value.toString(), "file://sh%C3%A4res/path/c%23/plugin.json");
      value = URI.file("\\\\localhost\\c$\\GitDevelopment\\express");
      assert.strictEqual(value.scheme, "file");
      assert.strictEqual(value.path, "/c$/GitDevelopment/express");
      assert.strictEqual(value.fsPath, "\\\\localhost\\c$\\GitDevelopment\\express");
      assert.strictEqual(value.query, "");
      assert.strictEqual(value.fragment, "");
      assert.strictEqual(value.toString(), "file://localhost/c%24/GitDevelopment/express");
      value = URI.file("c:\\test with %\\path");
      assert.strictEqual(value.path, "/c:/test with %/path");
      assert.strictEqual(value.toString(), "file:///c%3A/test%20with%20%25/path");
      value = URI.file("c:\\test with %25\\path");
      assert.strictEqual(value.path, "/c:/test with %25/path");
      assert.strictEqual(value.toString(), "file:///c%3A/test%20with%20%2525/path");
      value = URI.file("c:\\test with %25\\c#code");
      assert.strictEqual(value.path, "/c:/test with %25/c#code");
      assert.strictEqual(value.toString(), "file:///c%3A/test%20with%20%2525/c%23code");
      value = URI.file("\\\\shares");
      assert.strictEqual(value.scheme, "file");
      assert.strictEqual(value.authority, "shares");
      assert.strictEqual(value.path, "/");
      value = URI.file("\\\\shares\\");
      assert.strictEqual(value.scheme, "file");
      assert.strictEqual(value.authority, "shares");
      assert.strictEqual(value.path, "/");
    }
  });
  test("VSCode URI module's driveLetterPath regex is incorrect, #32961", function() {
    const uri = URI.parse("file:///_:/path");
    assert.strictEqual(uri.fsPath, isWindows ? "\\_:\\path" : "/_:/path");
  });
  test("URI#file, no path-is-uri check", () => {
    const value = URI.file("file://path/to/file");
    assert.strictEqual(value.scheme, "file");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "/file://path/to/file");
  });
  test("URI#file, always slash", () => {
    let value = URI.file("a.file");
    assert.strictEqual(value.scheme, "file");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "/a.file");
    assert.strictEqual(value.toString(), "file:///a.file");
    value = URI.parse(value.toString());
    assert.strictEqual(value.scheme, "file");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "/a.file");
    assert.strictEqual(value.toString(), "file:///a.file");
  });
  test("URI.toString, only scheme and query", () => {
    const value = URI.parse("stuff:?q\xFCery");
    assert.strictEqual(value.toString(), "stuff:?q%C3%BCery");
  });
  test("URI#toString, upper-case percent espaces", () => {
    const value = URI.parse("file://sh%c3%a4res/path");
    assert.strictEqual(value.toString(), "file://sh%C3%A4res/path");
  });
  test("URI#toString, lower-case windows drive letter", () => {
    assert.strictEqual(URI.parse("untitled:c:/Users/jrieken/Code/abc.txt").toString(), "untitled:c%3A/Users/jrieken/Code/abc.txt");
    assert.strictEqual(URI.parse("untitled:C:/Users/jrieken/Code/abc.txt").toString(), "untitled:c%3A/Users/jrieken/Code/abc.txt");
  });
  test("URI#toString, escape all the bits", () => {
    const value = URI.file("/Users/jrieken/Code/_samples/18500/M\xF6del + Other Th\xEEng\xDF/model.js");
    assert.strictEqual(value.toString(), "file:///Users/jrieken/Code/_samples/18500/M%C3%B6del%20%2B%20Other%20Th%C3%AEng%C3%9F/model.js");
  });
  test("URI#toString, don't encode port", () => {
    let value = URI.parse("http://localhost:8080/far");
    assert.strictEqual(value.toString(), "http://localhost:8080/far");
    value = URI.from({ scheme: "http", authority: "l\xF6calhost:8080", path: "/far", query: void 0, fragment: void 0 });
    assert.strictEqual(value.toString(), "http://l%C3%B6calhost:8080/far");
  });
  test("URI#toString, user information in authority", () => {
    let value = URI.parse("http://foo:bar@localhost/far");
    assert.strictEqual(value.toString(), "http://foo:bar@localhost/far");
    value = URI.parse("http://foo@localhost/far");
    assert.strictEqual(value.toString(), "http://foo@localhost/far");
    value = URI.parse("http://foo:bAr@localhost:8080/far");
    assert.strictEqual(value.toString(), "http://foo:bAr@localhost:8080/far");
    value = URI.parse("http://foo@localhost:8080/far");
    assert.strictEqual(value.toString(), "http://foo@localhost:8080/far");
    value = URI.from({ scheme: "http", authority: "f\xF6\xF6:b\xF6r@l\xF6calhost:8080", path: "/far", query: void 0, fragment: void 0 });
    assert.strictEqual(value.toString(), "http://f%C3%B6%C3%B6:b%C3%B6r@l%C3%B6calhost:8080/far");
  });
  test("correctFileUriToFilePath2", () => {
    const test2 = (input, expected) => {
      const value = URI.parse(input);
      assert.strictEqual(value.fsPath, expected, "Result for " + input);
      const value2 = URI.file(value.fsPath);
      assert.strictEqual(value2.fsPath, expected, "Result for " + input);
      assert.strictEqual(value.toString(), value2.toString());
    };
    test2("file:///c:/alex.txt", isWindows ? "c:\\alex.txt" : "c:/alex.txt");
    test2("file:///c:/Source/Z%C3%BCrich%20or%20Zurich%20(%CB%88zj%CA%8A%C9%99r%C9%AAk,/Code/resources/app/plugins", isWindows ? "c:\\Source\\Z\xFCrich or Zurich (\u02C8zj\u028A\u0259r\u026Ak,\\Code\\resources\\app\\plugins" : "c:/Source/Z\xFCrich or Zurich (\u02C8zj\u028A\u0259r\u026Ak,/Code/resources/app/plugins");
    test2("file://monacotools/folder/isi.txt", isWindows ? "\\\\monacotools\\folder\\isi.txt" : "//monacotools/folder/isi.txt");
    test2("file://monacotools1/certificates/SSL/", isWindows ? "\\\\monacotools1\\certificates\\SSL\\" : "//monacotools1/certificates/SSL/");
  });
  test("URI - http, query & toString", function() {
    let uri = URI.parse("https://go.microsoft.com/fwlink/?LinkId=518008");
    assert.strictEqual(uri.query, "LinkId=518008");
    assert.strictEqual(uri.toString(true), "https://go.microsoft.com/fwlink/?LinkId=518008");
    assert.strictEqual(uri.toString(), "https://go.microsoft.com/fwlink/?LinkId%3D518008");
    let uri2 = URI.parse(uri.toString());
    assert.strictEqual(uri2.query, "LinkId=518008");
    assert.strictEqual(uri2.query, uri.query);
    uri = URI.parse("https://go.microsoft.com/fwlink/?LinkId=518008&fo\xF6&k\xE9\xA5=\xFC\xFC");
    assert.strictEqual(uri.query, "LinkId=518008&fo\xF6&k\xE9\xA5=\xFC\xFC");
    assert.strictEqual(uri.toString(true), "https://go.microsoft.com/fwlink/?LinkId=518008&fo\xF6&k\xE9\xA5=\xFC\xFC");
    assert.strictEqual(uri.toString(), "https://go.microsoft.com/fwlink/?LinkId%3D518008%26fo%C3%B6%26k%C3%A9%C2%A5%3D%C3%BC%C3%BC");
    uri2 = URI.parse(uri.toString());
    assert.strictEqual(uri2.query, "LinkId=518008&fo\xF6&k\xE9\xA5=\xFC\xFC");
    assert.strictEqual(uri2.query, uri.query);
    uri = URI.parse("https://twitter.com/search?src=typd&q=%23tag");
    assert.strictEqual(uri.toString(true), "https://twitter.com/search?src=typd&q=%23tag");
  });
  test("class URI cannot represent relative file paths #34449", function() {
    let path = "/foo/bar";
    assert.strictEqual(URI.file(path).path, path);
    path = "foo/bar";
    assert.strictEqual(URI.file(path).path, "/foo/bar");
    path = "./foo/bar";
    assert.strictEqual(URI.file(path).path, "/./foo/bar");
    const fileUri1 = URI.parse(`file:foo/bar`);
    assert.strictEqual(fileUri1.path, "/foo/bar");
    assert.strictEqual(fileUri1.authority, "");
    const uri = fileUri1.toString();
    assert.strictEqual(uri, "file:///foo/bar");
    const fileUri2 = URI.parse(uri);
    assert.strictEqual(fileUri2.path, "/foo/bar");
    assert.strictEqual(fileUri2.authority, "");
  });
  test("Ctrl click to follow hash query param url gets urlencoded #49628", function() {
    let input = "http://localhost:3000/#/foo?bar=baz";
    let uri = URI.parse(input);
    assert.strictEqual(uri.toString(true), input);
    input = "http://localhost:3000/foo?bar=baz";
    uri = URI.parse(input);
    assert.strictEqual(uri.toString(true), input);
  });
  test("Unable to open '%A0.txt': URI malformed #76506", function() {
    let uri = URI.file("/foo/%A0.txt");
    let uri2 = URI.parse(uri.toString());
    assert.strictEqual(uri.scheme, uri2.scheme);
    assert.strictEqual(uri.path, uri2.path);
    uri = URI.file("/foo/%2e.txt");
    uri2 = URI.parse(uri.toString());
    assert.strictEqual(uri.scheme, uri2.scheme);
    assert.strictEqual(uri.path, uri2.path);
  });
  test("Bug in URI.isUri() that fails `thing` type comparison #114971", function() {
    const uri = URI.file("/foo/bazz.txt");
    assert.strictEqual(URI.isUri(uri), true);
    assert.strictEqual(URI.isUri(uri.toJSON()), false);
    assert.strictEqual(URI.isUri({
      scheme: "file",
      authority: "",
      path: "/foo/bazz.txt",
      get fsPath() {
        return "/foo/bazz.txt";
      },
      query: "",
      fragment: "",
      with() {
        return this;
      },
      toString() {
        return "";
      }
    }), true);
    assert.strictEqual(URI.isUri({
      scheme: "file",
      authority: "",
      path: "/foo/bazz.txt",
      fsPath: "/foo/bazz.txt",
      query: "",
      fragment: "",
      with() {
        return this;
      },
      toString() {
        return "";
      }
    }), true);
    assert.strictEqual(URI.isUri(1), false);
    assert.strictEqual(URI.isUri("1"), false);
    assert.strictEqual(URI.isUri("http://sample.com"), false);
    assert.strictEqual(URI.isUri(null), false);
    assert.strictEqual(URI.isUri(void 0), false);
  });
  test("isUriComponents", function() {
    assert.ok(isUriComponents(URI.file("a")));
    assert.ok(isUriComponents(URI.file("a").toJSON()));
    assert.ok(isUriComponents(URI.file("")));
    assert.ok(isUriComponents(URI.file("").toJSON()));
    assert.strictEqual(isUriComponents(1), false);
    assert.strictEqual(isUriComponents(true), false);
    assert.strictEqual(isUriComponents("true"), false);
    assert.strictEqual(isUriComponents({}), false);
    assert.strictEqual(isUriComponents({ scheme: "" }), true);
    assert.strictEqual(isUriComponents({ scheme: "fo" }), true);
    assert.strictEqual(isUriComponents({ scheme: "fo", path: "/p" }), true);
    assert.strictEqual(isUriComponents({ path: "/p" }), false);
  });
  test("from, from(strict), revive", function() {
    assert.throws(() => URI.from({ scheme: "" }, true));
    assert.strictEqual(URI.from({ scheme: "" }).scheme, "file");
    assert.strictEqual(URI.revive({ scheme: "" }).scheme, "");
  });
  test("Unable to open '%A0.txt': URI malformed #76506, part 2", function() {
    assert.strictEqual(URI.parse("file://some/%.txt").toString(), "file://some/%25.txt");
    assert.strictEqual(URI.parse("file://some/%A0.txt").toString(), "file://some/%25A0.txt");
  });
  test.skip("Links in markdown are broken if url contains encoded parameters #79474", function() {
    const strIn = "https://myhost.com/Redirect?url=http%3A%2F%2Fwww.bing.com%3Fsearch%3Dtom";
    const uri1 = URI.parse(strIn);
    const strOut = uri1.toString();
    const uri2 = URI.parse(strOut);
    assert.strictEqual(uri1.scheme, uri2.scheme);
    assert.strictEqual(uri1.authority, uri2.authority);
    assert.strictEqual(uri1.path, uri2.path);
    assert.strictEqual(uri1.query, uri2.query);
    assert.strictEqual(uri1.fragment, uri2.fragment);
    assert.strictEqual(strIn, strOut);
  });
  test.skip("Uri#parse can break path-component #45515", function() {
    const strIn = "https://firebasestorage.googleapis.com/v0/b/brewlangerie.appspot.com/o/products%2FzVNZkudXJyq8bPGTXUxx%2FBetterave-Sesame.jpg?alt=media&token=0b2310c4-3ea6-4207-bbde-9c3710ba0437";
    const uri1 = URI.parse(strIn);
    const strOut = uri1.toString();
    const uri2 = URI.parse(strOut);
    assert.strictEqual(uri1.scheme, uri2.scheme);
    assert.strictEqual(uri1.authority, uri2.authority);
    assert.strictEqual(uri1.path, uri2.path);
    assert.strictEqual(uri1.query, uri2.query);
    assert.strictEqual(uri1.fragment, uri2.fragment);
    assert.strictEqual(strIn, strOut);
  });
  test("URI - (de)serialize", function() {
    const values = [
      URI.parse("http://localhost:8080/far"),
      URI.file("c:\\test with %25\\c#code"),
      URI.file("\\\\sh\xE4res\\path\\c#\\plugin.json"),
      URI.parse("http://api/files/test.me?t=1234"),
      URI.parse("http://api/files/test.me?t=1234#fff"),
      URI.parse("http://api/files/test.me#fff")
    ];
    for (const value of values) {
      const data = value.toJSON();
      const clone = URI.revive(data);
      assert.strictEqual(clone.scheme, value.scheme);
      assert.strictEqual(clone.authority, value.authority);
      assert.strictEqual(clone.path, value.path);
      assert.strictEqual(clone.query, value.query);
      assert.strictEqual(clone.fragment, value.fragment);
      assert.strictEqual(clone.fsPath, value.fsPath);
      assert.strictEqual(clone.toString(), value.toString());
    }
  });
  function assertJoined(base, fragment, expected, checkWithUrl = true) {
    const baseUri = URI.parse(base);
    const newUri = URI.joinPath(baseUri, fragment);
    const actual = newUri.toString(true);
    assert.strictEqual(actual, expected);
    if (checkWithUrl) {
      const actualUrl = new URL(fragment, base).href;
      assert.strictEqual(actualUrl, expected, "DIFFERENT from URL");
    }
  }
  test("URI#joinPath", function() {
    assertJoined("file:///foo/", "../../bazz", "file:///bazz");
    assertJoined("file:///foo", "../../bazz", "file:///bazz");
    assertJoined("file:///foo", "../../bazz", "file:///bazz");
    assertJoined("file:///foo/bar/", "./bazz", "file:///foo/bar/bazz");
    assertJoined("file:///foo/bar", "./bazz", "file:///foo/bar/bazz", false);
    assertJoined("file:///foo/bar", "bazz", "file:///foo/bar/bazz", false);
    assertJoined("file:", "bazz", "file:///bazz");
    assertJoined("http://domain", "bazz", "http://domain/bazz");
    assertJoined("https://domain", "bazz", "https://domain/bazz");
    assertJoined("http:", "bazz", "http:/bazz", false);
    assertJoined("https:", "bazz", "https:/bazz", false);
    assertJoined("foo:/", "bazz", "foo:/bazz");
    assertJoined("foo://bar/", "bazz", "foo://bar/bazz");
    assert.throws(() => assertJoined("foo:", "bazz", ""));
    assert.throws(() => new URL("bazz", "foo:"));
    assert.throws(() => assertJoined("foo://bar", "bazz", ""));
  });
  test("URI#joinPath (posix)", function() {
    if (isWindows) {
      this.skip();
    }
    assertJoined("file:///c:/foo/", "../../bazz", "file:///bazz", false);
    assertJoined("file://server/share/c:/", "../../bazz", "file://server/bazz", false);
    assertJoined("file://server/share/c:", "../../bazz", "file://server/bazz", false);
    assertJoined("file://ser/foo/", "../../bazz", "file://ser/bazz", false);
    assertJoined("file://ser/foo", "../../bazz", "file://ser/bazz", false);
  });
  test("URI#joinPath (windows)", function() {
    if (!isWindows) {
      this.skip();
    }
    assertJoined("file:///c:/foo/", "../../bazz", "file:///c:/bazz", false);
    assertJoined("file://server/share/c:/", "../../bazz", "file://server/share/bazz", false);
    assertJoined("file://server/share/c:", "../../bazz", "file://server/share/bazz", false);
    assertJoined("file://ser/foo/", "../../bazz", "file://ser/foo/bazz", false);
    assertJoined("file://ser/foo", "../../bazz", "file://ser/foo/bazz", false);
    assertJoined("file:///c:/foo/bar", "./other/foo.img", "file:///c:/foo/bar/other/foo.img", false);
  });
  test("vscode-uri: URI.toString() wrongly encode IPv6 literals #154048", function() {
    assert.strictEqual(URI.parse("http://[FEDC:BA98:7654:3210:FEDC:BA98:7654:3210]:80/index.html").toString(), "http://[fedc:ba98:7654:3210:fedc:ba98:7654:3210]:80/index.html");
    assert.strictEqual(URI.parse("http://user@[FEDC:BA98:7654:3210:FEDC:BA98:7654:3210]:80/index.html").toString(), "http://user@[fedc:ba98:7654:3210:fedc:ba98:7654:3210]:80/index.html");
    assert.strictEqual(URI.parse("http://us[er@[FEDC:BA98:7654:3210:FEDC:BA98:7654:3210]:80/index.html").toString(), "http://us%5Ber@[fedc:ba98:7654:3210:fedc:ba98:7654:3210]:80/index.html");
  });
  test("File paths containing apostrophes break URI parsing and cannot be opened #276075", function() {
    if (isWindows) {
      const filePath = "C:\\Users\\Abd-al-Haseeb's_Dell\\Studio\\w3mage\\wp-content\\database.ht.sqlite";
      const uri = URI.file(filePath);
      assert.strictEqual(uri.path, "/C:/Users/Abd-al-Haseeb's_Dell/Studio/w3mage/wp-content/database.ht.sqlite");
      assert.strictEqual(uri.fsPath, "c:\\Users\\Abd-al-Haseeb's_Dell\\Studio\\w3mage\\wp-content\\database.ht.sqlite");
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vdXJpLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cywgaXNVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuXG5zdWl0ZSgnVVJJJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdmaWxlI3RvU3RyaW5nJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnYzovd2luL3BhdGgnKS50b1N0cmluZygpLCAnZmlsZTovLy9jJTNBL3dpbi9wYXRoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5maWxlKCdDOi93aW4vcGF0aCcpLnRvU3RyaW5nKCksICdmaWxlOi8vL2MlM0Evd2luL3BhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZpbGUoJ2M6L3dpbi9wYXRoLycpLnRvU3RyaW5nKCksICdmaWxlOi8vL2MlM0Evd2luL3BhdGgvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5maWxlKCcvYzovd2luL3BhdGgnKS50b1N0cmluZygpLCAnZmlsZTovLy9jJTNBL3dpbi9wYXRoJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VSSS5maWxlICh3aW4tc3BlY2lhbCknLCAoKSA9PiB7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5maWxlKCdjOlxcXFx3aW5cXFxccGF0aCcpLnRvU3RyaW5nKCksICdmaWxlOi8vL2MlM0Evd2luL3BhdGgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnYzpcXFxcd2luL3BhdGgnKS50b1N0cmluZygpLCAnZmlsZTovLy9jJTNBL3dpbi9wYXRoJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnYzpcXFxcd2luXFxcXHBhdGgnKS50b1N0cmluZygpLCAnZmlsZTovLy9jJTNBJTVDd2luJTVDcGF0aCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5maWxlKCdjOlxcXFx3aW4vcGF0aCcpLnRvU3RyaW5nKCksICdmaWxlOi8vL2MlM0ElNUN3aW4vcGF0aCcpO1xuXG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdmaWxlI2ZzUGF0aCAod2luLXNwZWNpYWwpJywgKCkgPT4ge1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnYzpcXFxcd2luXFxcXHBhdGgnKS5mc1BhdGgsICdjOlxcXFx3aW5cXFxccGF0aCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5maWxlKCdjOlxcXFx3aW4vcGF0aCcpLmZzUGF0aCwgJ2M6XFxcXHdpblxcXFxwYXRoJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnYzovd2luL3BhdGgnKS5mc1BhdGgsICdjOlxcXFx3aW5cXFxccGF0aCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5maWxlKCdjOi93aW4vcGF0aC8nKS5mc1BhdGgsICdjOlxcXFx3aW5cXFxccGF0aFxcXFwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnQzovd2luL3BhdGgnKS5mc1BhdGgsICdjOlxcXFx3aW5cXFxccGF0aCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5maWxlKCcvYzovd2luL3BhdGgnKS5mc1BhdGgsICdjOlxcXFx3aW5cXFxccGF0aCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5maWxlKCcuL2Mvd2luL3BhdGgnKS5mc1BhdGgsICdcXFxcLlxcXFxjXFxcXHdpblxcXFxwYXRoJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnYzovd2luL3BhdGgnKS5mc1BhdGgsICdjOi93aW4vcGF0aCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5maWxlKCdjOi93aW4vcGF0aC8nKS5mc1BhdGgsICdjOi93aW4vcGF0aC8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnQzovd2luL3BhdGgnKS5mc1BhdGgsICdjOi93aW4vcGF0aCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5maWxlKCcvYzovd2luL3BhdGgnKS5mc1BhdGgsICdjOi93aW4vcGF0aCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5maWxlKCcuL2Mvd2luL3BhdGgnKS5mc1BhdGgsICcvLi9jL3dpbi9wYXRoJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdVUkkjZnNQYXRoIC0gbm8gYGZzUGF0aGAgd2hlbiBubyBgcGF0aGAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmFsdWUgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8lMkZob21lJTJGdGljaW5vJTJGZGVza3RvcCUyRmNwbHVzY3BsdXMlMkZ0ZXN0LmNwcCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5hdXRob3JpdHksICcvaG9tZS90aWNpbm8vZGVza3RvcC9jcGx1c2NwbHVzL3Rlc3QuY3BwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnBhdGgsICcvJyk7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmZzUGF0aCwgJ1xcXFwnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmZzUGF0aCwgJy8nKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2h0dHAjdG9TdHJpbmcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5mcm9tKHsgc2NoZW1lOiAnaHR0cCcsIGF1dGhvcml0eTogJ3d3dy5leGFtcGxlLmNvbScsIHBhdGg6ICcvbXkvcGF0aCcgfSkudG9TdHJpbmcoKSwgJ2h0dHA6Ly93d3cuZXhhbXBsZS5jb20vbXkvcGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZnJvbSh7IHNjaGVtZTogJ2h0dHAnLCBhdXRob3JpdHk6ICd3d3cuZXhhbXBsZS5jb20nLCBwYXRoOiAnL215L3BhdGgnIH0pLnRvU3RyaW5nKCksICdodHRwOi8vd3d3LmV4YW1wbGUuY29tL215L3BhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZyb20oeyBzY2hlbWU6ICdodHRwJywgYXV0aG9yaXR5OiAnd3d3LkVYQU1QTEUuY29tJywgcGF0aDogJy9teS9wYXRoJyB9KS50b1N0cmluZygpLCAnaHR0cDovL3d3dy5leGFtcGxlLmNvbS9teS9wYXRoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5mcm9tKHsgc2NoZW1lOiAnaHR0cCcsIGF1dGhvcml0eTogJycsIHBhdGg6ICdteS9wYXRoJyB9KS50b1N0cmluZygpLCAnaHR0cDovbXkvcGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZnJvbSh7IHNjaGVtZTogJ2h0dHAnLCBhdXRob3JpdHk6ICcnLCBwYXRoOiAnL215L3BhdGgnIH0pLnRvU3RyaW5nKCksICdodHRwOi9teS9wYXRoJyk7XG5cdFx0Ly9odHRwOi8vZXhhbXBsZS5jb20vI3Rlc3Q9dHJ1ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZnJvbSh7IHNjaGVtZTogJ2h0dHAnLCBhdXRob3JpdHk6ICdleGFtcGxlLmNvbScsIHBhdGg6ICcvJywgcXVlcnk6ICd0ZXN0PXRydWUnIH0pLnRvU3RyaW5nKCksICdodHRwOi8vZXhhbXBsZS5jb20vP3Rlc3QlM0R0cnVlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5mcm9tKHsgc2NoZW1lOiAnaHR0cCcsIGF1dGhvcml0eTogJ2V4YW1wbGUuY29tJywgcGF0aDogJy8nLCBxdWVyeTogJycsIGZyYWdtZW50OiAndGVzdD10cnVlJyB9KS50b1N0cmluZygpLCAnaHR0cDovL2V4YW1wbGUuY29tLyN0ZXN0JTNEdHJ1ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdodHRwI3RvU3RyaW5nLCBlbmNvZGU9RkFMU0UnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5mcm9tKHsgc2NoZW1lOiAnaHR0cCcsIGF1dGhvcml0eTogJ2V4YW1wbGUuY29tJywgcGF0aDogJy8nLCBxdWVyeTogJ3Rlc3Q9dHJ1ZScgfSkudG9TdHJpbmcodHJ1ZSksICdodHRwOi8vZXhhbXBsZS5jb20vP3Rlc3Q9dHJ1ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZnJvbSh7IHNjaGVtZTogJ2h0dHAnLCBhdXRob3JpdHk6ICdleGFtcGxlLmNvbScsIHBhdGg6ICcvJywgcXVlcnk6ICcnLCBmcmFnbWVudDogJ3Rlc3Q9dHJ1ZScgfSkudG9TdHJpbmcodHJ1ZSksICdodHRwOi8vZXhhbXBsZS5jb20vI3Rlc3Q9dHJ1ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZnJvbSh7IHNjaGVtZTogJ2h0dHAnLCBwYXRoOiAnL2FwaS9maWxlcy90ZXN0Lm1lJywgcXVlcnk6ICd0PTEyMzQnIH0pLnRvU3RyaW5nKHRydWUpLCAnaHR0cDovYXBpL2ZpbGVzL3Rlc3QubWU/dD0xMjM0Jyk7XG5cblx0XHRjb25zdCB2YWx1ZSA9IFVSSS5wYXJzZSgnZmlsZTovL3NoYXJlcy9wclx1MDBGNmplY3RzL2MlMjMvI2wxMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5hdXRob3JpdHksICdzaGFyZXMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJy9wclx1MDBGNmplY3RzL2MjLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mcmFnbWVudCwgJ2wxMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS50b1N0cmluZygpLCAnZmlsZTovL3NoYXJlcy9wciVDMyVCNmplY3RzL2MlMjMvI2wxMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS50b1N0cmluZyh0cnVlKSwgJ2ZpbGU6Ly9zaGFyZXMvcHJcdTAwRjZqZWN0cy9jJTIzLyNsMTInKTtcblxuXHRcdGNvbnN0IHVyaTIgPSBVUkkucGFyc2UodmFsdWUudG9TdHJpbmcodHJ1ZSkpO1xuXHRcdGNvbnN0IHVyaTMgPSBVUkkucGFyc2UodmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaTIuYXV0aG9yaXR5LCB1cmkzLmF1dGhvcml0eSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaTIucGF0aCwgdXJpMy5wYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpMi5xdWVyeSwgdXJpMy5xdWVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaTIuZnJhZ21lbnQsIHVyaTMuZnJhZ21lbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCd3aXRoLCBpZGVudGl0eScsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZvbzpiYXIvcGF0aCcpO1xuXG5cdFx0bGV0IHVyaTIgPSB1cmkud2l0aChudWxsISk7XG5cdFx0YXNzZXJ0Lm9rKHVyaSA9PT0gdXJpMik7XG5cdFx0dXJpMiA9IHVyaS53aXRoKHVuZGVmaW5lZCEpO1xuXHRcdGFzc2VydC5vayh1cmkgPT09IHVyaTIpO1xuXHRcdHVyaTIgPSB1cmkud2l0aCh7fSk7XG5cdFx0YXNzZXJ0Lm9rKHVyaSA9PT0gdXJpMik7XG5cdFx0dXJpMiA9IHVyaS53aXRoKHsgc2NoZW1lOiAnZm9vJywgcGF0aDogJ2Jhci9wYXRoJyB9KTtcblx0XHRhc3NlcnQub2sodXJpID09PSB1cmkyKTtcblx0fSk7XG5cblx0dGVzdCgnd2l0aCwgY2hhbmdlcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLnBhcnNlKCdiZWZvcmU6c29tZS9maWxlL3BhdGgnKS53aXRoKHsgc2NoZW1lOiAnYWZ0ZXInIH0pLnRvU3RyaW5nKCksICdhZnRlcjpzb21lL2ZpbGUvcGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZnJvbSh7IHNjaGVtZTogJ3MnIH0pLndpdGgoeyBzY2hlbWU6ICdodHRwJywgcGF0aDogJy9hcGkvZmlsZXMvdGVzdC5tZScsIHF1ZXJ5OiAndD0xMjM0JyB9KS50b1N0cmluZygpLCAnaHR0cDovYXBpL2ZpbGVzL3Rlc3QubWU/dCUzRDEyMzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZyb20oeyBzY2hlbWU6ICdzJyB9KS53aXRoKHsgc2NoZW1lOiAnaHR0cCcsIGF1dGhvcml0eTogJycsIHBhdGg6ICcvYXBpL2ZpbGVzL3Rlc3QubWUnLCBxdWVyeTogJ3Q9MTIzNCcsIGZyYWdtZW50OiAnJyB9KS50b1N0cmluZygpLCAnaHR0cDovYXBpL2ZpbGVzL3Rlc3QubWU/dCUzRDEyMzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZyb20oeyBzY2hlbWU6ICdzJyB9KS53aXRoKHsgc2NoZW1lOiAnaHR0cHMnLCBhdXRob3JpdHk6ICcnLCBwYXRoOiAnL2FwaS9maWxlcy90ZXN0Lm1lJywgcXVlcnk6ICd0PTEyMzQnLCBmcmFnbWVudDogJycgfSkudG9TdHJpbmcoKSwgJ2h0dHBzOi9hcGkvZmlsZXMvdGVzdC5tZT90JTNEMTIzNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZnJvbSh7IHNjaGVtZTogJ3MnIH0pLndpdGgoeyBzY2hlbWU6ICdIVFRQJywgYXV0aG9yaXR5OiAnJywgcGF0aDogJy9hcGkvZmlsZXMvdGVzdC5tZScsIHF1ZXJ5OiAndD0xMjM0JywgZnJhZ21lbnQ6ICcnIH0pLnRvU3RyaW5nKCksICdIVFRQOi9hcGkvZmlsZXMvdGVzdC5tZT90JTNEMTIzNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZnJvbSh7IHNjaGVtZTogJ3MnIH0pLndpdGgoeyBzY2hlbWU6ICdIVFRQUycsIGF1dGhvcml0eTogJycsIHBhdGg6ICcvYXBpL2ZpbGVzL3Rlc3QubWUnLCBxdWVyeTogJ3Q9MTIzNCcsIGZyYWdtZW50OiAnJyB9KS50b1N0cmluZygpLCAnSFRUUFM6L2FwaS9maWxlcy90ZXN0Lm1lP3QlM0QxMjM0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5mcm9tKHsgc2NoZW1lOiAncycgfSkud2l0aCh7IHNjaGVtZTogJ2JvbycsIGF1dGhvcml0eTogJycsIHBhdGg6ICcvYXBpL2ZpbGVzL3Rlc3QubWUnLCBxdWVyeTogJ3Q9MTIzNCcsIGZyYWdtZW50OiAnJyB9KS50b1N0cmluZygpLCAnYm9vOi9hcGkvZmlsZXMvdGVzdC5tZT90JTNEMTIzNCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd3aXRoLCByZW1vdmUgY29tcG9uZW50cyAjODQ2NScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLnBhcnNlKCdzY2hlbWU6Ly9hdXRob3JpdHkvcGF0aCcpLndpdGgoeyBhdXRob3JpdHk6ICcnIH0pLnRvU3RyaW5nKCksICdzY2hlbWU6L3BhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLnBhcnNlKCdzY2hlbWU6L3BhdGgnKS53aXRoKHsgYXV0aG9yaXR5OiAnYXV0aG9yaXR5JyB9KS53aXRoKHsgYXV0aG9yaXR5OiAnJyB9KS50b1N0cmluZygpLCAnc2NoZW1lOi9wYXRoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5wYXJzZSgnc2NoZW1lOi9wYXRoJykud2l0aCh7IGF1dGhvcml0eTogJ2F1dGhvcml0eScgfSkud2l0aCh7IGF1dGhvcml0eTogbnVsbCB9KS50b1N0cmluZygpLCAnc2NoZW1lOi9wYXRoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5wYXJzZSgnc2NoZW1lOi9wYXRoJykud2l0aCh7IGF1dGhvcml0eTogJ2F1dGhvcml0eScgfSkud2l0aCh7IHBhdGg6ICcnIH0pLnRvU3RyaW5nKCksICdzY2hlbWU6Ly9hdXRob3JpdHknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLnBhcnNlKCdzY2hlbWU6L3BhdGgnKS53aXRoKHsgYXV0aG9yaXR5OiAnYXV0aG9yaXR5JyB9KS53aXRoKHsgcGF0aDogbnVsbCB9KS50b1N0cmluZygpLCAnc2NoZW1lOi8vYXV0aG9yaXR5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5wYXJzZSgnc2NoZW1lOi9wYXRoJykud2l0aCh7IGF1dGhvcml0eTogJycgfSkudG9TdHJpbmcoKSwgJ3NjaGVtZTovcGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkucGFyc2UoJ3NjaGVtZTovcGF0aCcpLndpdGgoeyBhdXRob3JpdHk6IG51bGwgfSkudG9TdHJpbmcoKSwgJ3NjaGVtZTovcGF0aCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd3aXRoLCB2YWxpZGF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZm9vOmJhci9wYXRoJyk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB1cmkud2l0aCh7IHNjaGVtZTogJ2ZhaTpsJyB9KSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB1cmkud2l0aCh7IHNjaGVtZTogJ2ZcdTAwRTRpbCcgfSkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gdXJpLndpdGgoeyBhdXRob3JpdHk6ICdmYWlsJyB9KSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB1cmkud2l0aCh7IHBhdGg6ICcvL2ZhaWwnIH0pKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2UnLCAoKSA9PiB7XG5cdFx0bGV0IHZhbHVlID0gVVJJLnBhcnNlKCdodHRwOi9hcGkvZmlsZXMvdGVzdC5tZT90PTEyMzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuc2NoZW1lLCAnaHR0cCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5hdXRob3JpdHksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJy9hcGkvZmlsZXMvdGVzdC5tZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5xdWVyeSwgJ3Q9MTIzNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mcmFnbWVudCwgJycpO1xuXG5cdFx0dmFsdWUgPSBVUkkucGFyc2UoJ2h0dHA6Ly9hcGkvZmlsZXMvdGVzdC5tZT90PTEyMzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuc2NoZW1lLCAnaHR0cCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5hdXRob3JpdHksICdhcGknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJy9maWxlcy90ZXN0Lm1lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnF1ZXJ5LCAndD0xMjM0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmZyYWdtZW50LCAnJyk7XG5cblx0XHR2YWx1ZSA9IFVSSS5wYXJzZSgnZmlsZTovLy9jOi90ZXN0L21lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnNjaGVtZSwgJ2ZpbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuYXV0aG9yaXR5LCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnBhdGgsICcvYzovdGVzdC9tZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mcmFnbWVudCwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5xdWVyeSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mc1BhdGgsIGlzV2luZG93cyA/ICdjOlxcXFx0ZXN0XFxcXG1lJyA6ICdjOi90ZXN0L21lJyk7XG5cblx0XHR2YWx1ZSA9IFVSSS5wYXJzZSgnZmlsZTovL3NoYXJlcy9maWxlcy9jJTIzL3AuY3MnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuc2NoZW1lLCAnZmlsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5hdXRob3JpdHksICdzaGFyZXMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJy9maWxlcy9jIy9wLmNzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmZyYWdtZW50LCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnF1ZXJ5LCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmZzUGF0aCwgaXNXaW5kb3dzID8gJ1xcXFxcXFxcc2hhcmVzXFxcXGZpbGVzXFxcXGMjXFxcXHAuY3MnIDogJy8vc2hhcmVzL2ZpbGVzL2MjL3AuY3MnKTtcblxuXHRcdHZhbHVlID0gVVJJLnBhcnNlKCdmaWxlOi8vL2M6L1NvdXJjZS9aJUMzJUJDcmljaCUyMG9yJTIwWnVyaWNoJTIwKCVDQiU4OHpqJUNBJThBJUM5JTk5ciVDOSVBQWssL0NvZGUvcmVzb3VyY2VzL2FwcC9wbHVnaW5zL2MlMjMvcGx1Z2luLmpzb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuc2NoZW1lLCAnZmlsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5hdXRob3JpdHksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJy9jOi9Tb3VyY2UvWlx1MDBGQ3JpY2ggb3IgWnVyaWNoIChcdTAyQzh6alx1MDI4QVx1MDI1OXJcdTAyNkFrLC9Db2RlL3Jlc291cmNlcy9hcHAvcGx1Z2lucy9jIy9wbHVnaW4uanNvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mcmFnbWVudCwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5xdWVyeSwgJycpO1xuXG5cdFx0dmFsdWUgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vYzovdGVzdCAlMjUvcGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5zY2hlbWUsICdmaWxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmF1dGhvcml0eSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5wYXRoLCAnL2M6L3Rlc3QgJS9wYXRoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmZyYWdtZW50LCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnF1ZXJ5LCAnJyk7XG5cblx0XHR2YWx1ZSA9IFVSSS5wYXJzZSgnaW5tZW1vcnk6Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnNjaGVtZSwgJ2lubWVtb3J5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmF1dGhvcml0eSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5wYXRoLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnF1ZXJ5LCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmZyYWdtZW50LCAnJyk7XG5cblx0XHR2YWx1ZSA9IFVSSS5wYXJzZSgnZm9vOmFwaS9maWxlcy90ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnNjaGVtZSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5hdXRob3JpdHksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJ2FwaS9maWxlcy90ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnF1ZXJ5LCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmZyYWdtZW50LCAnJyk7XG5cblx0XHR2YWx1ZSA9IFVSSS5wYXJzZSgnZmlsZTo/cScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5zY2hlbWUsICdmaWxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmF1dGhvcml0eSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5wYXRoLCAnLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5xdWVyeSwgJ3EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuZnJhZ21lbnQsICcnKTtcblxuXHRcdHZhbHVlID0gVVJJLnBhcnNlKCdmaWxlOiNkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnNjaGVtZSwgJ2ZpbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuYXV0aG9yaXR5LCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnBhdGgsICcvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnF1ZXJ5LCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmZyYWdtZW50LCAnZCcpO1xuXG5cdFx0dmFsdWUgPSBVUkkucGFyc2UoJ2YzaWxlOiNkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnNjaGVtZSwgJ2YzaWxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmF1dGhvcml0eSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5wYXRoLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnF1ZXJ5LCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmZyYWdtZW50LCAnZCcpO1xuXG5cdFx0dmFsdWUgPSBVUkkucGFyc2UoJ2ZvbytiYXI6cGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5zY2hlbWUsICdmb28rYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmF1dGhvcml0eSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5wYXRoLCAncGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5xdWVyeSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mcmFnbWVudCwgJycpO1xuXG5cdFx0dmFsdWUgPSBVUkkucGFyc2UoJ2Zvby1iYXI6cGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5zY2hlbWUsICdmb28tYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmF1dGhvcml0eSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5wYXRoLCAncGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5xdWVyeSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mcmFnbWVudCwgJycpO1xuXG5cdFx0dmFsdWUgPSBVUkkucGFyc2UoJ2Zvby5iYXI6cGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5zY2hlbWUsICdmb28uYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmF1dGhvcml0eSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5wYXRoLCAncGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5xdWVyeSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mcmFnbWVudCwgJycpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZSwgZGlzYWxsb3cgLy9wYXRoIHdoZW4gbm8gYXV0aG9yaXR5JywgKCkgPT4ge1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gVVJJLnBhcnNlKCdmaWxlOi8vLy9zaGFyZXMvZmlsZXMvcC5jcycpKTtcblx0fSk7XG5cblx0dGVzdCgnVVJJI2ZpbGUsIHdpbi1zcGVjaWFsZScsICgpID0+IHtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRsZXQgdmFsdWUgPSBVUkkuZmlsZSgnYzpcXFxcdGVzdFxcXFxkcml2ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnBhdGgsICcvYzovdGVzdC9kcml2ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnRvU3RyaW5nKCksICdmaWxlOi8vL2MlM0EvdGVzdC9kcml2ZScpO1xuXG5cdFx0XHR2YWx1ZSA9IFVSSS5maWxlKCdcXFxcXFxcXHNoXHUwMEU0cmVzXFxcXHBhdGhcXFxcYyNcXFxccGx1Z2luLmpzb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5zY2hlbWUsICdmaWxlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuYXV0aG9yaXR5LCAnc2hcdTAwRTRyZXMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5wYXRoLCAnL3BhdGgvYyMvcGx1Z2luLmpzb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mcmFnbWVudCwgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnF1ZXJ5LCAnJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUudG9TdHJpbmcoKSwgJ2ZpbGU6Ly9zaCVDMyVBNHJlcy9wYXRoL2MlMjMvcGx1Z2luLmpzb24nKTtcblxuXHRcdFx0dmFsdWUgPSBVUkkuZmlsZSgnXFxcXFxcXFxsb2NhbGhvc3RcXFxcYyRcXFxcR2l0RGV2ZWxvcG1lbnRcXFxcZXhwcmVzcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnNjaGVtZSwgJ2ZpbGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5wYXRoLCAnL2MkL0dpdERldmVsb3BtZW50L2V4cHJlc3MnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mc1BhdGgsICdcXFxcXFxcXGxvY2FsaG9zdFxcXFxjJFxcXFxHaXREZXZlbG9wbWVudFxcXFxleHByZXNzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucXVlcnksICcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mcmFnbWVudCwgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnRvU3RyaW5nKCksICdmaWxlOi8vbG9jYWxob3N0L2MlMjQvR2l0RGV2ZWxvcG1lbnQvZXhwcmVzcycpO1xuXG5cdFx0XHR2YWx1ZSA9IFVSSS5maWxlKCdjOlxcXFx0ZXN0IHdpdGggJVxcXFxwYXRoJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJy9jOi90ZXN0IHdpdGggJS9wYXRoJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUudG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vYyUzQS90ZXN0JTIwd2l0aCUyMCUyNS9wYXRoJyk7XG5cblx0XHRcdHZhbHVlID0gVVJJLmZpbGUoJ2M6XFxcXHRlc3Qgd2l0aCAlMjVcXFxccGF0aCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnBhdGgsICcvYzovdGVzdCB3aXRoICUyNS9wYXRoJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUudG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vYyUzQS90ZXN0JTIwd2l0aCUyMCUyNTI1L3BhdGgnKTtcblxuXHRcdFx0dmFsdWUgPSBVUkkuZmlsZSgnYzpcXFxcdGVzdCB3aXRoICUyNVxcXFxjI2NvZGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5wYXRoLCAnL2M6L3Rlc3Qgd2l0aCAlMjUvYyNjb2RlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUudG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vYyUzQS90ZXN0JTIwd2l0aCUyMCUyNTI1L2MlMjNjb2RlJyk7XG5cblx0XHRcdHZhbHVlID0gVVJJLmZpbGUoJ1xcXFxcXFxcc2hhcmVzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuc2NoZW1lLCAnZmlsZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmF1dGhvcml0eSwgJ3NoYXJlcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnBhdGgsICcvJyk7IC8vIHNsYXNoIGlzIGFsd2F5cyB0aGVyZVxuXG5cdFx0XHR2YWx1ZSA9IFVSSS5maWxlKCdcXFxcXFxcXHNoYXJlc1xcXFwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5zY2hlbWUsICdmaWxlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuYXV0aG9yaXR5LCAnc2hhcmVzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJy8nKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ1ZTQ29kZSBVUkkgbW9kdWxlXFwncyBkcml2ZUxldHRlclBhdGggcmVnZXggaXMgaW5jb3JyZWN0LCAjMzI5NjEnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL186L3BhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLmZzUGF0aCwgaXNXaW5kb3dzID8gJ1xcXFxfOlxcXFxwYXRoJyA6ICcvXzovcGF0aCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdVUkkjZmlsZSwgbm8gcGF0aC1pcy11cmkgY2hlY2snLCAoKSA9PiB7XG5cblx0XHQvLyB3ZSBkb24ndCBjb21wbGFpbiBoZXJlXG5cdFx0Y29uc3QgdmFsdWUgPSBVUkkuZmlsZSgnZmlsZTovL3BhdGgvdG8vZmlsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5zY2hlbWUsICdmaWxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmF1dGhvcml0eSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5wYXRoLCAnL2ZpbGU6Ly9wYXRoL3RvL2ZpbGUnKTtcblx0fSk7XG5cblx0dGVzdCgnVVJJI2ZpbGUsIGFsd2F5cyBzbGFzaCcsICgpID0+IHtcblxuXHRcdGxldCB2YWx1ZSA9IFVSSS5maWxlKCdhLmZpbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuc2NoZW1lLCAnZmlsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5hdXRob3JpdHksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJy9hLmZpbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUudG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vYS5maWxlJyk7XG5cblx0XHR2YWx1ZSA9IFVSSS5wYXJzZSh2YWx1ZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuc2NoZW1lLCAnZmlsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5hdXRob3JpdHksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJy9hLmZpbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUudG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vYS5maWxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VSSS50b1N0cmluZywgb25seSBzY2hlbWUgYW5kIHF1ZXJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhbHVlID0gVVJJLnBhcnNlKCdzdHVmZjo/cVx1MDBGQ2VyeScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS50b1N0cmluZygpLCAnc3R1ZmY6P3ElQzMlQkNlcnknKTtcblx0fSk7XG5cblx0dGVzdCgnVVJJI3RvU3RyaW5nLCB1cHBlci1jYXNlIHBlcmNlbnQgZXNwYWNlcycsICgpID0+IHtcblx0XHRjb25zdCB2YWx1ZSA9IFVSSS5wYXJzZSgnZmlsZTovL3NoJWMzJWE0cmVzL3BhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUudG9TdHJpbmcoKSwgJ2ZpbGU6Ly9zaCVDMyVBNHJlcy9wYXRoJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VSSSN0b1N0cmluZywgbG93ZXItY2FzZSB3aW5kb3dzIGRyaXZlIGxldHRlcicsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLnBhcnNlKCd1bnRpdGxlZDpjOi9Vc2Vycy9qcmlla2VuL0NvZGUvYWJjLnR4dCcpLnRvU3RyaW5nKCksICd1bnRpdGxlZDpjJTNBL1VzZXJzL2pyaWVrZW4vQ29kZS9hYmMudHh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5wYXJzZSgndW50aXRsZWQ6QzovVXNlcnMvanJpZWtlbi9Db2RlL2FiYy50eHQnKS50b1N0cmluZygpLCAndW50aXRsZWQ6YyUzQS9Vc2Vycy9qcmlla2VuL0NvZGUvYWJjLnR4dCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdVUkkjdG9TdHJpbmcsIGVzY2FwZSBhbGwgdGhlIGJpdHMnLCAoKSA9PiB7XG5cblx0XHRjb25zdCB2YWx1ZSA9IFVSSS5maWxlKCcvVXNlcnMvanJpZWtlbi9Db2RlL19zYW1wbGVzLzE4NTAwL01cdTAwRjZkZWwgKyBPdGhlciBUaFx1MDBFRW5nXHUwMERGL21vZGVsLmpzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnRvU3RyaW5nKCksICdmaWxlOi8vL1VzZXJzL2pyaWVrZW4vQ29kZS9fc2FtcGxlcy8xODUwMC9NJUMzJUI2ZGVsJTIwJTJCJTIwT3RoZXIlMjBUaCVDMyVBRW5nJUMzJTlGL21vZGVsLmpzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VSSSN0b1N0cmluZywgZG9uXFwndCBlbmNvZGUgcG9ydCcsICgpID0+IHtcblx0XHRsZXQgdmFsdWUgPSBVUkkucGFyc2UoJ2h0dHA6Ly9sb2NhbGhvc3Q6ODA4MC9mYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUudG9TdHJpbmcoKSwgJ2h0dHA6Ly9sb2NhbGhvc3Q6ODA4MC9mYXInKTtcblxuXHRcdHZhbHVlID0gVVJJLmZyb20oeyBzY2hlbWU6ICdodHRwJywgYXV0aG9yaXR5OiAnbFx1MDBGNmNhbGhvc3Q6ODA4MCcsIHBhdGg6ICcvZmFyJywgcXVlcnk6IHVuZGVmaW5lZCwgZnJhZ21lbnQ6IHVuZGVmaW5lZCB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUudG9TdHJpbmcoKSwgJ2h0dHA6Ly9sJUMzJUI2Y2FsaG9zdDo4MDgwL2ZhcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdVUkkjdG9TdHJpbmcsIHVzZXIgaW5mb3JtYXRpb24gaW4gYXV0aG9yaXR5JywgKCkgPT4ge1xuXHRcdGxldCB2YWx1ZSA9IFVSSS5wYXJzZSgnaHR0cDovL2ZvbzpiYXJAbG9jYWxob3N0L2ZhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS50b1N0cmluZygpLCAnaHR0cDovL2ZvbzpiYXJAbG9jYWxob3N0L2ZhcicpO1xuXG5cdFx0dmFsdWUgPSBVUkkucGFyc2UoJ2h0dHA6Ly9mb29AbG9jYWxob3N0L2ZhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS50b1N0cmluZygpLCAnaHR0cDovL2Zvb0Bsb2NhbGhvc3QvZmFyJyk7XG5cblx0XHR2YWx1ZSA9IFVSSS5wYXJzZSgnaHR0cDovL2ZvbzpiQXJAbG9jYWxob3N0OjgwODAvZmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnRvU3RyaW5nKCksICdodHRwOi8vZm9vOmJBckBsb2NhbGhvc3Q6ODA4MC9mYXInKTtcblxuXHRcdHZhbHVlID0gVVJJLnBhcnNlKCdodHRwOi8vZm9vQGxvY2FsaG9zdDo4MDgwL2ZhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS50b1N0cmluZygpLCAnaHR0cDovL2Zvb0Bsb2NhbGhvc3Q6ODA4MC9mYXInKTtcblxuXHRcdHZhbHVlID0gVVJJLmZyb20oeyBzY2hlbWU6ICdodHRwJywgYXV0aG9yaXR5OiAnZlx1MDBGNlx1MDBGNjpiXHUwMEY2ckBsXHUwMEY2Y2FsaG9zdDo4MDgwJywgcGF0aDogJy9mYXInLCBxdWVyeTogdW5kZWZpbmVkLCBmcmFnbWVudDogdW5kZWZpbmVkIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS50b1N0cmluZygpLCAnaHR0cDovL2YlQzMlQjYlQzMlQjY6YiVDMyVCNnJAbCVDMyVCNmNhbGhvc3Q6ODA4MC9mYXInKTtcblx0fSk7XG5cblx0dGVzdCgnY29ycmVjdEZpbGVVcmlUb0ZpbGVQYXRoMicsICgpID0+IHtcblxuXHRcdGNvbnN0IHRlc3QgPSAoaW5wdXQ6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBVUkkucGFyc2UoaW5wdXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmZzUGF0aCwgZXhwZWN0ZWQsICdSZXN1bHQgZm9yICcgKyBpbnB1dCk7XG5cdFx0XHRjb25zdCB2YWx1ZTIgPSBVUkkuZmlsZSh2YWx1ZS5mc1BhdGgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlMi5mc1BhdGgsIGV4cGVjdGVkLCAnUmVzdWx0IGZvciAnICsgaW5wdXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnRvU3RyaW5nKCksIHZhbHVlMi50b1N0cmluZygpKTtcblx0XHR9O1xuXG5cdFx0dGVzdCgnZmlsZTovLy9jOi9hbGV4LnR4dCcsIGlzV2luZG93cyA/ICdjOlxcXFxhbGV4LnR4dCcgOiAnYzovYWxleC50eHQnKTtcblx0XHR0ZXN0KCdmaWxlOi8vL2M6L1NvdXJjZS9aJUMzJUJDcmljaCUyMG9yJTIwWnVyaWNoJTIwKCVDQiU4OHpqJUNBJThBJUM5JTk5ciVDOSVBQWssL0NvZGUvcmVzb3VyY2VzL2FwcC9wbHVnaW5zJywgaXNXaW5kb3dzID8gJ2M6XFxcXFNvdXJjZVxcXFxaXHUwMEZDcmljaCBvciBadXJpY2ggKFx1MDJDOHpqXHUwMjhBXHUwMjU5clx1MDI2QWssXFxcXENvZGVcXFxccmVzb3VyY2VzXFxcXGFwcFxcXFxwbHVnaW5zJyA6ICdjOi9Tb3VyY2UvWlx1MDBGQ3JpY2ggb3IgWnVyaWNoIChcdTAyQzh6alx1MDI4QVx1MDI1OXJcdTAyNkFrLC9Db2RlL3Jlc291cmNlcy9hcHAvcGx1Z2lucycpO1xuXHRcdHRlc3QoJ2ZpbGU6Ly9tb25hY290b29scy9mb2xkZXIvaXNpLnR4dCcsIGlzV2luZG93cyA/ICdcXFxcXFxcXG1vbmFjb3Rvb2xzXFxcXGZvbGRlclxcXFxpc2kudHh0JyA6ICcvL21vbmFjb3Rvb2xzL2ZvbGRlci9pc2kudHh0Jyk7XG5cdFx0dGVzdCgnZmlsZTovL21vbmFjb3Rvb2xzMS9jZXJ0aWZpY2F0ZXMvU1NMLycsIGlzV2luZG93cyA/ICdcXFxcXFxcXG1vbmFjb3Rvb2xzMVxcXFxjZXJ0aWZpY2F0ZXNcXFxcU1NMXFxcXCcgOiAnLy9tb25hY290b29sczEvY2VydGlmaWNhdGVzL1NTTC8nKTtcblx0fSk7XG5cblx0dGVzdCgnVVJJIC0gaHR0cCwgcXVlcnkgJiB0b1N0cmluZycsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGxldCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP0xpbmtJZD01MTgwMDgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnF1ZXJ5LCAnTGlua0lkPTUxODAwOCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkudG9TdHJpbmcodHJ1ZSksICdodHRwczovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSWQ9NTE4MDA4Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS50b1N0cmluZygpLCAnaHR0cHM6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/TGlua0lkJTNENTE4MDA4Jyk7XG5cblx0XHRsZXQgdXJpMiA9IFVSSS5wYXJzZSh1cmkudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaTIucXVlcnksICdMaW5rSWQ9NTE4MDA4Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaTIucXVlcnksIHVyaS5xdWVyeSk7XG5cblx0XHR1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP0xpbmtJZD01MTgwMDgmZm9cdTAwRjYma1x1MDBFOVx1MDBBNT1cdTAwRkNcdTAwRkMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnF1ZXJ5LCAnTGlua0lkPTUxODAwOCZmb1x1MDBGNiZrXHUwMEU5XHUwMEE1PVx1MDBGQ1x1MDBGQycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkudG9TdHJpbmcodHJ1ZSksICdodHRwczovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSWQ9NTE4MDA4JmZvXHUwMEY2JmtcdTAwRTlcdTAwQTU9XHUwMEZDXHUwMEZDJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS50b1N0cmluZygpLCAnaHR0cHM6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/TGlua0lkJTNENTE4MDA4JTI2Zm8lQzMlQjYlMjZrJUMzJUE5JUMyJUE1JTNEJUMzJUJDJUMzJUJDJyk7XG5cblx0XHR1cmkyID0gVVJJLnBhcnNlKHVyaS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpMi5xdWVyeSwgJ0xpbmtJZD01MTgwMDgmZm9cdTAwRjYma1x1MDBFOVx1MDBBNT1cdTAwRkNcdTAwRkMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpMi5xdWVyeSwgdXJpLnF1ZXJ5KTtcblxuXHRcdC8vICMyNDg0OVxuXHRcdHVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly90d2l0dGVyLmNvbS9zZWFyY2g/c3JjPXR5cGQmcT0lMjN0YWcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnRvU3RyaW5nKHRydWUpLCAnaHR0cHM6Ly90d2l0dGVyLmNvbS9zZWFyY2g/c3JjPXR5cGQmcT0lMjN0YWcnKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdjbGFzcyBVUkkgY2Fubm90IHJlcHJlc2VudCByZWxhdGl2ZSBmaWxlIHBhdGhzICMzNDQ0OScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGxldCBwYXRoID0gJy9mb28vYmFyJztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZpbGUocGF0aCkucGF0aCwgcGF0aCk7XG5cdFx0cGF0aCA9ICdmb28vYmFyJztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZpbGUocGF0aCkucGF0aCwgJy9mb28vYmFyJyk7XG5cdFx0cGF0aCA9ICcuL2Zvby9iYXInO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZShwYXRoKS5wYXRoLCAnLy4vZm9vL2JhcicpOyAvLyBtaXNzaW5nIG5vcm1hbGl6YXRpb25cblxuXHRcdGNvbnN0IGZpbGVVcmkxID0gVVJJLnBhcnNlKGBmaWxlOmZvby9iYXJgKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZVVyaTEucGF0aCwgJy9mb28vYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVVcmkxLmF1dGhvcml0eSwgJycpO1xuXHRcdGNvbnN0IHVyaSA9IGZpbGVVcmkxLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaSwgJ2ZpbGU6Ly8vZm9vL2JhcicpO1xuXHRcdGNvbnN0IGZpbGVVcmkyID0gVVJJLnBhcnNlKHVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVVcmkyLnBhdGgsICcvZm9vL2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlVXJpMi5hdXRob3JpdHksICcnKTtcblx0fSk7XG5cblx0dGVzdCgnQ3RybCBjbGljayB0byBmb2xsb3cgaGFzaCBxdWVyeSBwYXJhbSB1cmwgZ2V0cyB1cmxlbmNvZGVkICM0OTYyOCcsIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgaW5wdXQgPSAnaHR0cDovL2xvY2FsaG9zdDozMDAwLyMvZm9vP2Jhcj1iYXonO1xuXHRcdGxldCB1cmkgPSBVUkkucGFyc2UoaW5wdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkudG9TdHJpbmcodHJ1ZSksIGlucHV0KTtcblxuXHRcdGlucHV0ID0gJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9mb28/YmFyPWJheic7XG5cdFx0dXJpID0gVVJJLnBhcnNlKGlucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnRvU3RyaW5nKHRydWUpLCBpbnB1dCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VuYWJsZSB0byBvcGVuIFxcJyVBMC50eHRcXCc6IFVSSSBtYWxmb3JtZWQgIzc2NTA2JywgZnVuY3Rpb24gKCkge1xuXG5cdFx0bGV0IHVyaSA9IFVSSS5maWxlKCcvZm9vLyVBMC50eHQnKTtcblx0XHRsZXQgdXJpMiA9IFVSSS5wYXJzZSh1cmkudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5zY2hlbWUsIHVyaTIuc2NoZW1lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnBhdGgsIHVyaTIucGF0aCk7XG5cblx0XHR1cmkgPSBVUkkuZmlsZSgnL2Zvby8lMmUudHh0Jyk7XG5cdFx0dXJpMiA9IFVSSS5wYXJzZSh1cmkudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5zY2hlbWUsIHVyaTIuc2NoZW1lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnBhdGgsIHVyaTIucGF0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0J1ZyBpbiBVUkkuaXNVcmkoKSB0aGF0IGZhaWxzIGB0aGluZ2AgdHlwZSBjb21wYXJpc29uICMxMTQ5NzEnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9mb28vYmF6ei50eHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmlzVXJpKHVyaSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuaXNVcmkodXJpLnRvSlNPTigpKSwgZmFsc2UpO1xuXG5cdFx0Ly8gZnNQYXRoIC0+IGdldHRlclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuaXNVcmkoe1xuXHRcdFx0c2NoZW1lOiAnZmlsZScsXG5cdFx0XHRhdXRob3JpdHk6ICcnLFxuXHRcdFx0cGF0aDogJy9mb28vYmF6ei50eHQnLFxuXHRcdFx0Z2V0IGZzUGF0aCgpIHsgcmV0dXJuICcvZm9vL2JhenoudHh0JzsgfSxcblx0XHRcdHF1ZXJ5OiAnJyxcblx0XHRcdGZyYWdtZW50OiAnJyxcblx0XHRcdHdpdGgoKSB7IHJldHVybiB0aGlzOyB9LFxuXHRcdFx0dG9TdHJpbmcoKSB7IHJldHVybiAnJzsgfVxuXHRcdH0pLCB0cnVlKTtcblxuXHRcdC8vIGZzUGF0aCAtPiBwcm9wZXJ0eVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuaXNVcmkoe1xuXHRcdFx0c2NoZW1lOiAnZmlsZScsXG5cdFx0XHRhdXRob3JpdHk6ICcnLFxuXHRcdFx0cGF0aDogJy9mb28vYmF6ei50eHQnLFxuXHRcdFx0ZnNQYXRoOiAnL2Zvby9iYXp6LnR4dCcsXG5cdFx0XHRxdWVyeTogJycsXG5cdFx0XHRmcmFnbWVudDogJycsXG5cdFx0XHR3aXRoKCkgeyByZXR1cm4gdGhpczsgfSxcblx0XHRcdHRvU3RyaW5nKCkgeyByZXR1cm4gJyc7IH1cblx0XHR9KSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmlzVXJpKDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5pc1VyaSgnMScpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5pc1VyaSgnaHR0cDovL3NhbXBsZS5jb20nKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuaXNVcmkobnVsbCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmlzVXJpKHVuZGVmaW5lZCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaXNVcmlDb21wb25lbnRzJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0YXNzZXJ0Lm9rKGlzVXJpQ29tcG9uZW50cyhVUkkuZmlsZSgnYScpKSk7XG5cdFx0YXNzZXJ0Lm9rKGlzVXJpQ29tcG9uZW50cyhVUkkuZmlsZSgnYScpLnRvSlNPTigpKSk7XG5cdFx0YXNzZXJ0Lm9rKGlzVXJpQ29tcG9uZW50cyhVUkkuZmlsZSgnJykpKTtcblx0XHRhc3NlcnQub2soaXNVcmlDb21wb25lbnRzKFVSSS5maWxlKCcnKS50b0pTT04oKSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVXJpQ29tcG9uZW50cygxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VyaUNvbXBvbmVudHModHJ1ZSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVcmlDb21wb25lbnRzKCd0cnVlJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVcmlDb21wb25lbnRzKHt9KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VyaUNvbXBvbmVudHMoeyBzY2hlbWU6ICcnIH0pLCB0cnVlKTsgLy8gdmFsaWQgY29tcG9uZW50cyBidXQgSU5WQUxJRCB1cmlcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVcmlDb21wb25lbnRzKHsgc2NoZW1lOiAnZm8nIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVcmlDb21wb25lbnRzKHsgc2NoZW1lOiAnZm8nLCBwYXRoOiAnL3AnIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVcmlDb21wb25lbnRzKHsgcGF0aDogJy9wJyB9KSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdmcm9tLCBmcm9tKHN0cmljdCksIHJldml2ZScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gVVJJLmZyb20oeyBzY2hlbWU6ICcnIH0sIHRydWUpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZyb20oeyBzY2hlbWU6ICcnIH0pLnNjaGVtZSwgJ2ZpbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLnJldml2ZSh7IHNjaGVtZTogJycgfSkuc2NoZW1lLCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VuYWJsZSB0byBvcGVuIFxcJyVBMC50eHRcXCc6IFVSSSBtYWxmb3JtZWQgIzc2NTA2LCBwYXJ0IDInLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5wYXJzZSgnZmlsZTovL3NvbWUvJS50eHQnKS50b1N0cmluZygpLCAnZmlsZTovL3NvbWUvJTI1LnR4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkucGFyc2UoJ2ZpbGU6Ly9zb21lLyVBMC50eHQnKS50b1N0cmluZygpLCAnZmlsZTovL3NvbWUvJTI1QTAudHh0Jyk7XG5cdH0pO1xuXG5cdHRlc3Quc2tpcCgnTGlua3MgaW4gbWFya2Rvd24gYXJlIGJyb2tlbiBpZiB1cmwgY29udGFpbnMgZW5jb2RlZCBwYXJhbWV0ZXJzICM3OTQ3NCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzdHJJbiA9ICdodHRwczovL215aG9zdC5jb20vUmVkaXJlY3Q/dXJsPWh0dHAlM0ElMkYlMkZ3d3cuYmluZy5jb20lM0ZzZWFyY2glM0R0b20nO1xuXHRcdGNvbnN0IHVyaTEgPSBVUkkucGFyc2Uoc3RySW4pO1xuXHRcdGNvbnN0IHN0ck91dCA9IHVyaTEudG9TdHJpbmcoKTtcblx0XHRjb25zdCB1cmkyID0gVVJJLnBhcnNlKHN0ck91dCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpMS5zY2hlbWUsIHVyaTIuc2NoZW1lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpMS5hdXRob3JpdHksIHVyaTIuYXV0aG9yaXR5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpMS5wYXRoLCB1cmkyLnBhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkxLnF1ZXJ5LCB1cmkyLnF1ZXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpMS5mcmFnbWVudCwgdXJpMi5mcmFnbWVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0ckluLCBzdHJPdXQpOyAvLyBmYWlscyBoZXJlISFcblx0fSk7XG5cblx0dGVzdC5za2lwKCdVcmkjcGFyc2UgY2FuIGJyZWFrIHBhdGgtY29tcG9uZW50ICM0NTUxNScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzdHJJbiA9ICdodHRwczovL2ZpcmViYXNlc3RvcmFnZS5nb29nbGVhcGlzLmNvbS92MC9iL2JyZXdsYW5nZXJpZS5hcHBzcG90LmNvbS9vL3Byb2R1Y3RzJTJGelZOWmt1ZFhKeXE4YlBHVFhVeHglMkZCZXR0ZXJhdmUtU2VzYW1lLmpwZz9hbHQ9bWVkaWEmdG9rZW49MGIyMzEwYzQtM2VhNi00MjA3LWJiZGUtOWMzNzEwYmEwNDM3Jztcblx0XHRjb25zdCB1cmkxID0gVVJJLnBhcnNlKHN0ckluKTtcblx0XHRjb25zdCBzdHJPdXQgPSB1cmkxLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgdXJpMiA9IFVSSS5wYXJzZShzdHJPdXQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaTEuc2NoZW1lLCB1cmkyLnNjaGVtZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaTEuYXV0aG9yaXR5LCB1cmkyLmF1dGhvcml0eSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaTEucGF0aCwgdXJpMi5wYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpMS5xdWVyeSwgdXJpMi5xdWVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaTEuZnJhZ21lbnQsIHVyaTIuZnJhZ21lbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJJbiwgc3RyT3V0KTsgLy8gZmFpbHMgaGVyZSEhXG5cdH0pO1xuXG5cdHRlc3QoJ1VSSSAtIChkZSlzZXJpYWxpemUnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCB2YWx1ZXMgPSBbXG5cdFx0XHRVUkkucGFyc2UoJ2h0dHA6Ly9sb2NhbGhvc3Q6ODA4MC9mYXInKSxcblx0XHRcdFVSSS5maWxlKCdjOlxcXFx0ZXN0IHdpdGggJTI1XFxcXGMjY29kZScpLFxuXHRcdFx0VVJJLmZpbGUoJ1xcXFxcXFxcc2hcdTAwRTRyZXNcXFxccGF0aFxcXFxjI1xcXFxwbHVnaW4uanNvbicpLFxuXHRcdFx0VVJJLnBhcnNlKCdodHRwOi8vYXBpL2ZpbGVzL3Rlc3QubWU/dD0xMjM0JyksXG5cdFx0XHRVUkkucGFyc2UoJ2h0dHA6Ly9hcGkvZmlsZXMvdGVzdC5tZT90PTEyMzQjZmZmJyksXG5cdFx0XHRVUkkucGFyc2UoJ2h0dHA6Ly9hcGkvZmlsZXMvdGVzdC5tZSNmZmYnKSxcblx0XHRdO1xuXG5cdFx0Ly8gY29uc29sZS5wcm9maWxlKCk7XG5cdFx0Ly8gbGV0IGMgPSAxMDAwMDA7XG5cdFx0Ly8gd2hpbGUgKGMtLSA+IDApIHtcblx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHZhbHVlLnRvSlNPTigpIGFzIFVyaUNvbXBvbmVudHM7XG5cdFx0XHRjb25zdCBjbG9uZSA9IFVSSS5yZXZpdmUoZGF0YSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9uZS5zY2hlbWUsIHZhbHVlLnNjaGVtZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvbmUuYXV0aG9yaXR5LCB2YWx1ZS5hdXRob3JpdHkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb25lLnBhdGgsIHZhbHVlLnBhdGgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb25lLnF1ZXJ5LCB2YWx1ZS5xdWVyeSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvbmUuZnJhZ21lbnQsIHZhbHVlLmZyYWdtZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9uZS5mc1BhdGgsIHZhbHVlLmZzUGF0aCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvbmUudG9TdHJpbmcoKSwgdmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0fVxuXHRcdC8vIH1cblx0XHQvLyBjb25zb2xlLnByb2ZpbGVFbmQoKTtcblx0fSk7XG5cdGZ1bmN0aW9uIGFzc2VydEpvaW5lZChiYXNlOiBzdHJpbmcsIGZyYWdtZW50OiBzdHJpbmcsIGV4cGVjdGVkOiBzdHJpbmcsIGNoZWNrV2l0aFVybDogYm9vbGVhbiA9IHRydWUpIHtcblx0XHRjb25zdCBiYXNlVXJpID0gVVJJLnBhcnNlKGJhc2UpO1xuXHRcdGNvbnN0IG5ld1VyaSA9IFVSSS5qb2luUGF0aChiYXNlVXJpLCBmcmFnbWVudCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gbmV3VXJpLnRvU3RyaW5nKHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblxuXHRcdGlmIChjaGVja1dpdGhVcmwpIHtcblx0XHRcdGNvbnN0IGFjdHVhbFVybCA9IG5ldyBVUkwoZnJhZ21lbnQsIGJhc2UpLmhyZWY7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsVXJsLCBleHBlY3RlZCwgJ0RJRkZFUkVOVCBmcm9tIFVSTCcpO1xuXHRcdH1cblx0fVxuXHR0ZXN0KCdVUkkjam9pblBhdGgnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRhc3NlcnRKb2luZWQoKCdmaWxlOi8vL2Zvby8nKSwgJy4uLy4uL2JhenonLCAnZmlsZTovLy9iYXp6Jyk7XG5cdFx0YXNzZXJ0Sm9pbmVkKCgnZmlsZTovLy9mb28nKSwgJy4uLy4uL2JhenonLCAnZmlsZTovLy9iYXp6Jyk7XG5cdFx0YXNzZXJ0Sm9pbmVkKCgnZmlsZTovLy9mb28nKSwgJy4uLy4uL2JhenonLCAnZmlsZTovLy9iYXp6Jyk7XG5cdFx0YXNzZXJ0Sm9pbmVkKCgnZmlsZTovLy9mb28vYmFyLycpLCAnLi9iYXp6JywgJ2ZpbGU6Ly8vZm9vL2Jhci9iYXp6Jyk7XG5cdFx0YXNzZXJ0Sm9pbmVkKCgnZmlsZTovLy9mb28vYmFyJyksICcuL2JhenonLCAnZmlsZTovLy9mb28vYmFyL2JhenonLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Sm9pbmVkKCgnZmlsZTovLy9mb28vYmFyJyksICdiYXp6JywgJ2ZpbGU6Ly8vZm9vL2Jhci9iYXp6JywgZmFsc2UpO1xuXG5cdFx0Ly8gXCJhdXRvLXBhdGhcIiBzY2hlbWVcblx0XHRhc3NlcnRKb2luZWQoKCdmaWxlOicpLCAnYmF6eicsICdmaWxlOi8vL2JhenonKTtcblx0XHRhc3NlcnRKb2luZWQoKCdodHRwOi8vZG9tYWluJyksICdiYXp6JywgJ2h0dHA6Ly9kb21haW4vYmF6eicpO1xuXHRcdGFzc2VydEpvaW5lZCgoJ2h0dHBzOi8vZG9tYWluJyksICdiYXp6JywgJ2h0dHBzOi8vZG9tYWluL2JhenonKTtcblx0XHRhc3NlcnRKb2luZWQoKCdodHRwOicpLCAnYmF6eicsICdodHRwOi9iYXp6JywgZmFsc2UpO1xuXHRcdGFzc2VydEpvaW5lZCgoJ2h0dHBzOicpLCAnYmF6eicsICdodHRwczovYmF6eicsIGZhbHNlKTtcblxuXHRcdC8vIG5vIFwiYXV0by1wYXRoXCIgc2NoZW1lIHdpdGggYW5kIHcvbyBwYXRoc1xuXHRcdGFzc2VydEpvaW5lZCgoJ2ZvbzovJyksICdiYXp6JywgJ2ZvbzovYmF6eicpO1xuXHRcdGFzc2VydEpvaW5lZCgoJ2ZvbzovL2Jhci8nKSwgJ2JhenonLCAnZm9vOi8vYmFyL2JhenonKTtcblxuXHRcdC8vIG5vIFwiYXV0by1wYXRoXCIgKyBubyBwYXRoIC0+IGVycm9yXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBhc3NlcnRKb2luZWQoKCdmb286JyksICdiYXp6JywgJycpKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IG5ldyBVUkwoJ2JhenonLCAnZm9vOicpKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGFzc2VydEpvaW5lZCgoJ2ZvbzovL2JhcicpLCAnYmF6eicsICcnKSk7XG5cdFx0Ly8gYXNzZXJ0LnRocm93cygoKSA9PiBuZXcgVVJMKCdiYXp6JywgJ2ZvbzovL2JhcicpKTsgRWRnZSwgQ2hyb21lID0+IFRIUk9XLCBGaXJlZm94LCBTYWZhcmkgPT4gZm9vOi8vYmFyL2Jhenpcblx0fSk7XG5cblx0dGVzdCgnVVJJI2pvaW5QYXRoIChwb3NpeCknLCBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0dGhpcy5za2lwKCk7XG5cdFx0fVxuXHRcdGFzc2VydEpvaW5lZCgoJ2ZpbGU6Ly8vYzovZm9vLycpLCAnLi4vLi4vYmF6eicsICdmaWxlOi8vL2JhenonLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Sm9pbmVkKCgnZmlsZTovL3NlcnZlci9zaGFyZS9jOi8nKSwgJy4uLy4uL2JhenonLCAnZmlsZTovL3NlcnZlci9iYXp6JywgZmFsc2UpO1xuXHRcdGFzc2VydEpvaW5lZCgoJ2ZpbGU6Ly9zZXJ2ZXIvc2hhcmUvYzonKSwgJy4uLy4uL2JhenonLCAnZmlsZTovL3NlcnZlci9iYXp6JywgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0Sm9pbmVkKCgnZmlsZTovL3Nlci9mb28vJyksICcuLi8uLi9iYXp6JywgJ2ZpbGU6Ly9zZXIvYmF6eicsIGZhbHNlKTsgLy8gRmlyZWZveCAtPiBEaWZmZXJlbnQsIEVkZ2UsIENocm9tZSwgU2FmYXIgLT4gT0tcblx0XHRhc3NlcnRKb2luZWQoKCdmaWxlOi8vc2VyL2ZvbycpLCAnLi4vLi4vYmF6eicsICdmaWxlOi8vc2VyL2JhenonLCBmYWxzZSk7IC8vIEZpcmVmb3ggLT4gRGlmZmVyZW50LCBFZGdlLCBDaHJvbWUsIFNhZmFyIC0+IE9LXG5cdH0pO1xuXG5cdHRlc3QoJ1VSSSNqb2luUGF0aCAod2luZG93cyknLCBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdHRoaXMuc2tpcCgpO1xuXHRcdH1cblx0XHRhc3NlcnRKb2luZWQoKCdmaWxlOi8vL2M6L2Zvby8nKSwgJy4uLy4uL2JhenonLCAnZmlsZTovLy9jOi9iYXp6JywgZmFsc2UpO1xuXHRcdGFzc2VydEpvaW5lZCgoJ2ZpbGU6Ly9zZXJ2ZXIvc2hhcmUvYzovJyksICcuLi8uLi9iYXp6JywgJ2ZpbGU6Ly9zZXJ2ZXIvc2hhcmUvYmF6eicsIGZhbHNlKTtcblx0XHRhc3NlcnRKb2luZWQoKCdmaWxlOi8vc2VydmVyL3NoYXJlL2M6JyksICcuLi8uLi9iYXp6JywgJ2ZpbGU6Ly9zZXJ2ZXIvc2hhcmUvYmF6eicsIGZhbHNlKTtcblxuXHRcdGFzc2VydEpvaW5lZCgoJ2ZpbGU6Ly9zZXIvZm9vLycpLCAnLi4vLi4vYmF6eicsICdmaWxlOi8vc2VyL2Zvby9iYXp6JywgZmFsc2UpO1xuXHRcdGFzc2VydEpvaW5lZCgoJ2ZpbGU6Ly9zZXIvZm9vJyksICcuLi8uLi9iYXp6JywgJ2ZpbGU6Ly9zZXIvZm9vL2JhenonLCBmYWxzZSk7XG5cblx0XHQvL2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy85MzgzMVxuXHRcdGFzc2VydEpvaW5lZCgnZmlsZTovLy9jOi9mb28vYmFyJywgJy4vb3RoZXIvZm9vLmltZycsICdmaWxlOi8vL2M6L2Zvby9iYXIvb3RoZXIvZm9vLmltZycsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgndnNjb2RlLXVyaTogVVJJLnRvU3RyaW5nKCkgd3JvbmdseSBlbmNvZGUgSVB2NiBsaXRlcmFscyAjMTU0MDQ4JywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkucGFyc2UoJ2h0dHA6Ly9bRkVEQzpCQTk4Ojc2NTQ6MzIxMDpGRURDOkJBOTg6NzY1NDozMjEwXTo4MC9pbmRleC5odG1sJykudG9TdHJpbmcoKSwgJ2h0dHA6Ly9bZmVkYzpiYTk4Ojc2NTQ6MzIxMDpmZWRjOmJhOTg6NzY1NDozMjEwXTo4MC9pbmRleC5odG1sJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLnBhcnNlKCdodHRwOi8vdXNlckBbRkVEQzpCQTk4Ojc2NTQ6MzIxMDpGRURDOkJBOTg6NzY1NDozMjEwXTo4MC9pbmRleC5odG1sJykudG9TdHJpbmcoKSwgJ2h0dHA6Ly91c2VyQFtmZWRjOmJhOTg6NzY1NDozMjEwOmZlZGM6YmE5ODo3NjU0OjMyMTBdOjgwL2luZGV4Lmh0bWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLnBhcnNlKCdodHRwOi8vdXNbZXJAW0ZFREM6QkE5ODo3NjU0OjMyMTA6RkVEQzpCQTk4Ojc2NTQ6MzIxMF06ODAvaW5kZXguaHRtbCcpLnRvU3RyaW5nKCksICdodHRwOi8vdXMlNUJlckBbZmVkYzpiYTk4Ojc2NTQ6MzIxMDpmZWRjOmJhOTg6NzY1NDozMjEwXTo4MC9pbmRleC5odG1sJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGUgcGF0aHMgY29udGFpbmluZyBhcG9zdHJvcGhlcyBicmVhayBVUkkgcGFyc2luZyBhbmQgY2Fubm90IGJlIG9wZW5lZCAjMjc2MDc1JywgZnVuY3Rpb24gKCkge1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGNvbnN0IGZpbGVQYXRoID0gJ0M6XFxcXFVzZXJzXFxcXEFiZC1hbC1IYXNlZWJcXCdzX0RlbGxcXFxcU3R1ZGlvXFxcXHczbWFnZVxcXFx3cC1jb250ZW50XFxcXGRhdGFiYXNlLmh0LnNxbGl0ZSc7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZShmaWxlUGF0aCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnBhdGgsICcvQzovVXNlcnMvQWJkLWFsLUhhc2VlYlxcJ3NfRGVsbC9TdHVkaW8vdzNtYWdlL3dwLWNvbnRlbnQvZGF0YWJhc2UuaHQuc3FsaXRlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLmZzUGF0aCwgJ2M6XFxcXFVzZXJzXFxcXEFiZC1hbC1IYXNlZWJcXCdzX0RlbGxcXFxcU3R1ZGlvXFxcXHczbWFnZVxcXFx3cC1jb250ZW50XFxcXGRhdGFiYXNlLmh0LnNxbGl0ZScpO1xuXHRcdH1cblx0fSk7XG5cblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxLQUFvQix1QkFBdUI7QUFDcEQsU0FBUywrQ0FBK0M7QUFHeEQsTUFBTSxPQUFPLE1BQU07QUFDbEIsMENBQXdDO0FBRXhDLE9BQUssaUJBQWlCLE1BQU07QUFDM0IsV0FBTyxZQUFZLElBQUksS0FBSyxhQUFhLEVBQUUsU0FBUyxHQUFHLHVCQUF1QjtBQUM5RSxXQUFPLFlBQVksSUFBSSxLQUFLLGFBQWEsRUFBRSxTQUFTLEdBQUcsdUJBQXVCO0FBQzlFLFdBQU8sWUFBWSxJQUFJLEtBQUssY0FBYyxFQUFFLFNBQVMsR0FBRyx3QkFBd0I7QUFDaEYsV0FBTyxZQUFZLElBQUksS0FBSyxjQUFjLEVBQUUsU0FBUyxHQUFHLHVCQUF1QjtBQUFBLEVBQ2hGLENBQUM7QUFFRCxPQUFLLDBCQUEwQixNQUFNO0FBQ3BDLFFBQUksV0FBVztBQUNkLGFBQU8sWUFBWSxJQUFJLEtBQUssZUFBZSxFQUFFLFNBQVMsR0FBRyx1QkFBdUI7QUFDaEYsYUFBTyxZQUFZLElBQUksS0FBSyxjQUFjLEVBQUUsU0FBUyxHQUFHLHVCQUF1QjtBQUFBLElBQ2hGLE9BQU87QUFDTixhQUFPLFlBQVksSUFBSSxLQUFLLGVBQWUsRUFBRSxTQUFTLEdBQUcsMkJBQTJCO0FBQ3BGLGFBQU8sWUFBWSxJQUFJLEtBQUssY0FBYyxFQUFFLFNBQVMsR0FBRyx5QkFBeUI7QUFBQSxJQUVsRjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssNkJBQTZCLE1BQU07QUFDdkMs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
