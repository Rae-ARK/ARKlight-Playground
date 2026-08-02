import assert from "assert";
import * as glob from "../../common/glob.js";
import { sep } from "../../common/path.js";
import { isLinux, isMacintosh, isWindows } from "../../common/platform.js";
import { URI } from "../../common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("Glob", () => {
  function assertGlobMatch(pattern, input, ignoreCase) {
    assert(glob.match(pattern, input, { ignoreCase }), `${JSON.stringify(pattern)} should match ${input}`);
    assert(glob.match(pattern, nativeSep(input), { ignoreCase }), `${pattern} should match ${nativeSep(input)}`);
  }
  function assertNoGlobMatch(pattern, input, ignoreCase) {
    assert(!glob.match(pattern, input, { ignoreCase }), `${pattern} should not match ${input}`);
    assert(!glob.match(pattern, nativeSep(input), { ignoreCase }), `${pattern} should not match ${nativeSep(input)}`);
  }
  test("simple", () => {
    let p = "node_modules";
    assertGlobMatch(p, "node_modules");
    assertNoGlobMatch(p, "node_module");
    assertNoGlobMatch(p, "/node_modules");
    assertNoGlobMatch(p, "test/node_modules");
    p = "test.txt";
    assertGlobMatch(p, "test.txt");
    assertNoGlobMatch(p, "test?txt");
    assertNoGlobMatch(p, "/text.txt");
    assertNoGlobMatch(p, "test/test.txt");
    p = "test(.txt";
    assertGlobMatch(p, "test(.txt");
    assertNoGlobMatch(p, "test?txt");
    p = "qunit";
    assertGlobMatch(p, "qunit");
    assertNoGlobMatch(p, "qunit.css");
    assertNoGlobMatch(p, "test/qunit");
    p = "/DNXConsoleApp/**/*.cs";
    assertGlobMatch(p, "/DNXConsoleApp/Program.cs");
    assertGlobMatch(p, "/DNXConsoleApp/foo/Program.cs");
    p = "C:/DNXConsoleApp/**/*.cs";
    assertGlobMatch(p, "C:\\DNXConsoleApp\\Program.cs");
    assertGlobMatch(p, "C:\\DNXConsoleApp\\foo\\Program.cs");
    p = "*";
    assertGlobMatch(p, "");
  });
  test("dot hidden", function() {
    let p = ".*";
    assertGlobMatch(p, ".git");
    assertGlobMatch(p, ".hidden.txt");
    assertNoGlobMatch(p, "git");
    assertNoGlobMatch(p, "hidden.txt");
    assertNoGlobMatch(p, "path/.git");
    assertNoGlobMatch(p, "path/.hidden.txt");
    p = "**/.*";
    assertGlobMatch(p, ".git");
    assertGlobMatch(p, "/.git");
    assertGlobMatch(p, ".hidden.txt");
    assertNoGlobMatch(p, "git");
    assertNoGlobMatch(p, "hidden.txt");
    assertGlobMatch(p, "path/.git");
    assertGlobMatch(p, "path/.hidden.txt");
    assertGlobMatch(p, "/path/.git");
    assertGlobMatch(p, "/path/.hidden.txt");
    assertNoGlobMatch(p, "path/git");
    assertNoGlobMatch(p, "pat.h/hidden.txt");
    p = "._*";
    assertGlobMatch(p, "._git");
    assertGlobMatch(p, "._hidden.txt");
    assertNoGlobMatch(p, "git");
    assertNoGlobMatch(p, "hidden.txt");
    assertNoGlobMatch(p, "path/._git");
    assertNoGlobMatch(p, "path/._hidden.txt");
    p = "**/._*";
    assertGlobMatch(p, "._git");
    assertGlobMatch(p, "._hidden.txt");
    assertNoGlobMatch(p, "git");
    assertNoGlobMatch(p, "hidden._txt");
    assertGlobMatch(p, "path/._git");
    assertGlobMatch(p, "path/._hidden.txt");
    assertGlobMatch(p, "/path/._git");
    assertGlobMatch(p, "/path/._hidden.txt");
    assertNoGlobMatch(p, "path/git");
    assertNoGlobMatch(p, "pat.h/hidden._txt");
  });
  test("file pattern", function() {
    let p = "*.js";
    assertGlobMatch(p, "foo.js");
    assertNoGlobMatch(p, "folder/foo.js");
    assertNoGlobMatch(p, "/node_modules/foo.js");
    assertNoGlobMatch(p, "foo.jss");
    assertNoGlobMatch(p, "some.js/test");
    p = "html.*";
    assertGlobMatch(p, "html.js");
    assertGlobMatch(p, "html.txt");
    assertNoGlobMatch(p, "htm.txt");
    p = "*.*";
    assertGlobMatch(p, "html.js");
    assertGlobMatch(p, "html.txt");
    assertGlobMatch(p, "htm.txt");
    assertNoGlobMatch(p, "folder/foo.js");
    assertNoGlobMatch(p, "/node_modules/foo.js");
    p = "node_modules/test/*.js";
    assertGlobMatch(p, "node_modules/test/foo.js");
    assertNoGlobMatch(p, "folder/foo.js");
    assertNoGlobMatch(p, "/node_module/test/foo.js");
    assertNoGlobMatch(p, "foo.jss");
    assertNoGlobMatch(p, "some.js/test");
  });
  test("star", () => {
    let p = "node*modules";
    assertGlobMatch(p, "node_modules");
    assertGlobMatch(p, "node_super_modules");
    assertNoGlobMatch(p, "node_module");
    assertNoGlobMatch(p, "/node_modules");
    assertNoGlobMatch(p, "test/node_modules");
    p = "*";
    assertGlobMatch(p, "html.js");
    assertGlobMatch(p, "html.txt");
    assertGlobMatch(p, "htm.txt");
    assertNoGlobMatch(p, "folder/foo.js");
    assertNoGlobMatch(p, "/node_modules/foo.js");
  });
  test("file / folder match", function() {
    const p = "**/node_modules/**";
    assertGlobMatch(p, "node_modules");
    assertGlobMatch(p, "node_modules/");
    assertGlobMatch(p, "a/node_modules");
    assertGlobMatch(p, "a/node_modules/");
    assertGlobMatch(p, "node_modules/foo");
    assertGlobMatch(p, "foo/node_modules/foo/bar");
    assertGlobMatch(p, "/node_modules");
    assertGlobMatch(p, "/node_modules/");
    assertGlobMatch(p, "/a/node_modules");
    assertGlobMatch(p, "/a/node_modules/");
    assertGlobMatch(p, "/node_modules/foo");
    assertGlobMatch(p, "/foo/node_modules/foo/bar");
  });
  test("questionmark", () => {
    let p = "node?modules";
    assertGlobMatch(p, "node_modules");
    assertNoGlobMatch(p, "node_super_modules");
    assertNoGlobMatch(p, "node_module");
    assertNoGlobMatch(p, "/node_modules");
    assertNoGlobMatch(p, "test/node_modules");
    p = "?";
    assertGlobMatch(p, "h");
    assertNoGlobMatch(p, "html.txt");
    assertNoGlobMatch(p, "htm.txt");
    assertNoGlobMatch(p, "folder/foo.js");
    assertNoGlobMatch(p, "/node_modules/foo.js");
  });
  test("globstar", () => {
    let p = "**/*.js";
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "/foo.js");
    assertGlobMatch(p, "folder/foo.js");
    assertGlobMatch(p, "/node_modules/foo.js");
    assertNoGlobMatch(p, "foo.jss");
    assertNoGlobMatch(p, "some.js/test");
    assertNoGlobMatch(p, "/some.js/test");
    assertNoGlobMatch(p, "\\some.js\\test");
    p = "**/project.json";
    assertGlobMatch(p, "project.json");
    assertGlobMatch(p, "/project.json");
    assertGlobMatch(p, "some/folder/project.json");
    assertGlobMatch(p, "/some/folder/project.json");
    assertNoGlobMatch(p, "some/folder/file_project.json");
    assertNoGlobMatch(p, "some/folder/fileproject.json");
    assertNoGlobMatch(p, "some/rrproject.json");
    assertNoGlobMatch(p, "some\\rrproject.json");
    p = "test/**";
    assertGlobMatch(p, "test");
    assertGlobMatch(p, "test/foo");
    assertGlobMatch(p, "test/foo/");
    assertGlobMatch(p, "test/foo.js");
    assertGlobMatch(p, "test/other/foo.js");
    assertNoGlobMatch(p, "est/other/foo.js");
    p = "**";
    assertGlobMatch(p, "/");
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "folder/foo.js");
    assertGlobMatch(p, "folder/foo/");
    assertGlobMatch(p, "/node_modules/foo.js");
    assertGlobMatch(p, "foo.jss");
    assertGlobMatch(p, "some.js/test");
    p = "test/**/*.js";
    assertGlobMatch(p, "test/foo.js");
    assertGlobMatch(p, "test/other/foo.js");
    assertGlobMatch(p, "test/other/more/foo.js");
    assertNoGlobMatch(p, "test/foo.ts");
    assertNoGlobMatch(p, "test/other/foo.ts");
    assertNoGlobMatch(p, "test/other/more/foo.ts");
    p = "**/**/*.js";
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "/foo.js");
    assertGlobMatch(p, "folder/foo.js");
    assertGlobMatch(p, "/node_modules/foo.js");
    assertNoGlobMatch(p, "foo.jss");
    assertNoGlobMatch(p, "some.js/test");
    p = "**/node_modules/**/*.js";
    assertNoGlobMatch(p, "foo.js");
    assertNoGlobMatch(p, "folder/foo.js");
    assertGlobMatch(p, "node_modules/foo.js");
    assertGlobMatch(p, "/node_modules/foo.js");
    assertGlobMatch(p, "node_modules/some/folder/foo.js");
    assertGlobMatch(p, "/node_modules/some/folder/foo.js");
    assertNoGlobMatch(p, "node_modules/some/folder/foo.ts");
    assertNoGlobMatch(p, "foo.jss");
    assertNoGlobMatch(p, "some.js/test");
    p = "{**/node_modules/**,**/.git/**,**/bower_components/**}";
    assertGlobMatch(p, "node_modules");
    assertGlobMatch(p, "/node_modules");
    assertGlobMatch(p, "/node_modules/more");
    assertGlobMatch(p, "some/test/node_modules");
    assertGlobMatch(p, "some\\test\\node_modules");
    assertGlobMatch(p, "/some/test/node_modules");
    assertGlobMatch(p, "\\some\\test\\node_modules");
    assertGlobMatch(p, "C:\\\\some\\test\\node_modules");
    assertGlobMatch(p, "C:\\\\some\\test\\node_modules\\more");
    assertGlobMatch(p, "bower_components");
    assertGlobMatch(p, "bower_components/more");
    assertGlobMatch(p, "/bower_components");
    assertGlobMatch(p, "some/test/bower_components");
    assertGlobMatch(p, "some\\test\\bower_components");
    assertGlobMatch(p, "/some/test/bower_components");
    assertGlobMatch(p, "\\some\\test\\bower_components");
    assertGlobMatch(p, "C:\\\\some\\test\\bower_components");
    assertGlobMatch(p, "C:\\\\some\\test\\bower_components\\more");
    assertGlobMatch(p, ".git");
    assertGlobMatch(p, "/.git");
    assertGlobMatch(p, "some/test/.git");
    assertGlobMatch(p, "some\\test\\.git");
    assertGlobMatch(p, "/some/test/.git");
    assertGlobMatch(p, "\\some\\test\\.git");
    assertGlobMatch(p, "C:\\\\some\\test\\.git");
    assertNoGlobMatch(p, "tempting");
    assertNoGlobMatch(p, "/tempting");
    assertNoGlobMatch(p, "some/test/tempting");
    assertNoGlobMatch(p, "some\\test\\tempting");
    assertNoGlobMatch(p, "/some/test/tempting");
    assertNoGlobMatch(p, "\\some\\test\\tempting");
    assertNoGlobMatch(p, "C:\\\\some\\test\\tempting");
    p = "{**/package.json,**/project.json}";
    assertGlobMatch(p, "package.json");
    assertGlobMatch(p, "/package.json");
    assertNoGlobMatch(p, "xpackage.json");
    assertNoGlobMatch(p, "/xpackage.json");
  });
  test("issue 41724", function() {
    let p = "some/**/*.js";
    assertGlobMatch(p, "some/foo.js");
    assertGlobMatch(p, "some/folder/foo.js");
    assertNoGlobMatch(p, "something/foo.js");
    assertNoGlobMatch(p, "something/folder/foo.js");
    p = "some/**/*";
    assertGlobMatch(p, "some/foo.js");
    assertGlobMatch(p, "some/folder/foo.js");
    assertNoGlobMatch(p, "something/foo.js");
    assertNoGlobMatch(p, "something/folder/foo.js");
  });
  test("brace expansion", function() {
    let p = "*.{html,js}";
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "foo.html");
    assertNoGlobMatch(p, "folder/foo.js");
    assertNoGlobMatch(p, "/node_modules/foo.js");
    assertNoGlobMatch(p, "foo.jss");
    assertNoGlobMatch(p, "some.js/test");
    p = "*.{html}";
    assertGlobMatch(p, "foo.html");
    assertNoGlobMatch(p, "foo.js");
    assertNoGlobMatch(p, "folder/foo.js");
    assertNoGlobMatch(p, "/node_modules/foo.js");
    assertNoGlobMatch(p, "foo.jss");
    assertNoGlobMatch(p, "some.js/test");
    p = "{node_modules,testing}";
    assertGlobMatch(p, "node_modules");
    assertGlobMatch(p, "testing");
    assertNoGlobMatch(p, "node_module");
    assertNoGlobMatch(p, "dtesting");
    p = "**/{foo,bar}";
    assertGlobMatch(p, "foo");
    assertGlobMatch(p, "bar");
    assertGlobMatch(p, "test/foo");
    assertGlobMatch(p, "test/bar");
    assertGlobMatch(p, "other/more/foo");
    assertGlobMatch(p, "other/more/bar");
    assertGlobMatch(p, "/foo");
    assertGlobMatch(p, "/bar");
    assertGlobMatch(p, "/test/foo");
    assertGlobMatch(p, "/test/bar");
    assertGlobMatch(p, "/other/more/foo");
    assertGlobMatch(p, "/other/more/bar");
    p = "{foo,bar}/**";
    assertGlobMatch(p, "foo");
    assertGlobMatch(p, "bar");
    assertGlobMatch(p, "bar/");
    assertGlobMatch(p, "foo/test");
    assertGlobMatch(p, "bar/test");
    assertGlobMatch(p, "bar/test/");
    assertGlobMatch(p, "foo/other/more");
    assertGlobMatch(p, "bar/other/more");
    assertGlobMatch(p, "bar/other/more/");
    p = "{**/*.d.ts,**/*.js}";
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "testing/foo.js");
    assertGlobMatch(p, "testing\\foo.js");
    assertGlobMatch(p, "/testing/foo.js");
    assertGlobMatch(p, "\\testing\\foo.js");
    assertGlobMatch(p, "C:\\testing\\foo.js");
    assertGlobMatch(p, "foo.d.ts");
    assertGlobMatch(p, "testing/foo.d.ts");
    assertGlobMatch(p, "testing\\foo.d.ts");
    assertGlobMatch(p, "/testing/foo.d.ts");
    assertGlobMatch(p, "\\testing\\foo.d.ts");
    assertGlobMatch(p, "C:\\testing\\foo.d.ts");
    assertNoGlobMatch(p, "foo.d");
    assertNoGlobMatch(p, "testing/foo.d");
    assertNoGlobMatch(p, "testing\\foo.d");
    assertNoGlobMatch(p, "/testing/foo.d");
    assertNoGlobMatch(p, "\\testing\\foo.d");
    assertNoGlobMatch(p, "C:\\testing\\foo.d");
    p = "{**/*.d.ts,**/*.js,path/simple.jgs}";
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "testing/foo.js");
    assertGlobMatch(p, "testing\\foo.js");
    assertGlobMatch(p, "/testing/foo.js");
    assertGlobMatch(p, "path/simple.jgs");
    assertNoGlobMatch(p, "/path/simple.jgs");
    assertGlobMatch(p, "\\testing\\foo.js");
    assertGlobMatch(p, "C:\\testing\\foo.js");
    p = "{**/*.d.ts,**/*.js,foo.[0-9]}";
    assertGlobMatch(p, "foo.5");
    assertGlobMatch(p, "foo.8");
    assertNoGlobMatch(p, "bar.5");
    assertNoGlobMatch(p, "foo.f");
    assertGlobMatch(p, "foo.js");
    p = "prefix/{**/*.d.ts,**/*.js,foo.[0-9]}";
    assertGlobMatch(p, "prefix/foo.5");
    assertGlobMatch(p, "prefix/foo.8");
    assertNoGlobMatch(p, "prefix/bar.5");
    assertNoGlobMatch(p, "prefix/foo.f");
    assertGlobMatch(p, "prefix/foo.js");
  });
  test("expression support (single)", function() {
    const siblings = ["test.html", "test.txt", "test.ts", "test.js"];
    const hasSibling = (name) => siblings.indexOf(name) !== -1;
    let expression = {
      "**/*.js": {
        when: "$(basename).ts"
      }
    };
    assert.strictEqual("**/*.js", glob.parse(expression)("test.js", void 0, hasSibling));
    assert.strictEqual(glob.parse(expression)("test.js", void 0, () => false), null);
    assert.strictEqual(glob.parse(expression)("test.js", void 0, (name) => name === "te.ts"), null);
    assert.strictEqual(glob.parse(expression)("test.js", void 0), null);
    expression = {
      "**/*.js": {
        when: ""
      }
    };
    assert.strictEqual(glob.parse(expression)("test.js", void 0, hasSibling), null);
    expression = {
      // eslint-disable-next-line local/code-no-any-casts
      "**/*.js": {}
    };
    assert.strictEqual("**/*.js", glob.parse(expression)("test.js", void 0, hasSibling));
    expression = {};
    assert.strictEqual(glob.parse(expression)("test.js", void 0, hasSibling), null);
  });
  test("expression support (multiple)", function() {
    const siblings = ["test.html", "test.txt", "test.ts", "test.js"];
    const hasSibling = (name) => siblings.indexOf(name) !== -1;
    const expression = {
      "**/*.js": { when: "$(basename).ts" },
      "**/*.as": true,
      "**/*.foo": false,
      // eslint-disable-next-line local/code-no-any-casts
      "**/*.bananas": { bananas: true }
    };
    assert.strictEqual("**/*.js", glob.parse(expression)("test.js", void 0, hasSibling));
    assert.strictEqual("**/*.as", glob.parse(expression)("test.as", void 0, hasSibling));
    assert.strictEqual("**/*.bananas", glob.parse(expression)("test.bananas", void 0, hasSibling));
    assert.strictEqual("**/*.bananas", glob.parse(expression)("test.bananas", void 0));
    assert.strictEqual(glob.parse(expression)("test.foo", void 0, hasSibling), null);
  });
  test("brackets", () => {
    let p = "foo.[0-9]";
    assertGlobMatch(p, "foo.5");
    assertGlobMatch(p, "foo.8");
    assertNoGlobMatch(p, "bar.5");
    assertNoGlobMatch(p, "foo.f");
    p = "foo.[^0-9]";
    assertNoGlobMatch(p, "foo.5");
    assertNoGlobMatch(p, "foo.8");
    assertNoGlobMatch(p, "bar.5");
    assertGlobMatch(p, "foo.f");
    p = "foo.[!0-9]";
    assertNoGlobMatch(p, "foo.5");
    assertNoGlobMatch(p, "foo.8");
    assertNoGlobMatch(p, "bar.5");
    assertGlobMatch(p, "foo.f");
    p = "foo.[0!^*?]";
    assertNoGlobMatch(p, "foo.5");
    assertNoGlobMatch(p, "foo.8");
    assertGlobMatch(p, "foo.0");
    assertGlobMatch(p, "foo.!");
    assertGlobMatch(p, "foo.^");
    assertGlobMatch(p, "foo.*");
    assertGlobMatch(p, "foo.?");
    p = "foo[/]bar";
    assertNoGlobMatch(p, "foo/bar");
    p = "foo.[[]";
    assertGlobMatch(p, "foo.[");
    p = "foo.[]]";
    assertGlobMatch(p, "foo.]");
    p = "foo.[][!]";
    assertGlobMatch(p, "foo.]");
    assertGlobMatch(p, "foo.[");
    assertGlobMatch(p, "foo.!");
    p = "foo.[]-]";
    assertGlobMatch(p, "foo.]");
    assertGlobMatch(p, "foo.-");
  });
  test("full path", function() {
    assertGlobMatch("testing/this/foo.txt", "testing/this/foo.txt");
  });
  test("ending path", function() {
    assertGlobMatch("**/testing/this/foo.txt", "some/path/testing/this/foo.txt");
  });
  test("prefix agnostic", function() {
    let p = "**/*.js";
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "/foo.js");
    assertGlobMatch(p, "\\foo.js");
    assertGlobMatch(p, "testing/foo.js");
    assertGlobMatch(p, "testing\\foo.js");
    assertGlobMatch(p, "/testing/foo.js");
    assertGlobMatch(p, "\\testing\\foo.js");
    assertGlobMatch(p, "C:\\testing\\foo.js");
    assertNoGlobMatch(p, "foo.ts");
    assertNoGlobMatch(p, "testing/foo.ts");
    assertNoGlobMatch(p, "testing\\foo.ts");
    assertNoGlobMatch(p, "/testing/foo.ts");
    assertNoGlobMatch(p, "\\testing\\foo.ts");
    assertNoGlobMatch(p, "C:\\testing\\foo.ts");
    assertNoGlobMatch(p, "foo.js.txt");
    assertNoGlobMatch(p, "testing/foo.js.txt");
    assertNoGlobMatch(p, "testing\\foo.js.txt");
    assertNoGlobMatch(p, "/testing/foo.js.txt");
    assertNoGlobMatch(p, "\\testing\\foo.js.txt");
    assertNoGlobMatch(p, "C:\\testing\\foo.js.txt");
    assertNoGlobMatch(p, "testing.js/foo");
    assertNoGlobMatch(p, "testing.js\\foo");
    assertNoGlobMatch(p, "/testing.js/foo");
    assertNoGlobMatch(p, "\\testing.js\\foo");
    assertNoGlobMatch(p, "C:\\testing.js\\foo");
    p = "**/foo.js";
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "/foo.js");
    assertGlobMatch(p, "\\foo.js");
    assertGlobMatch(p, "testing/foo.js");
    assertGlobMatch(p, "testing\\foo.js");
    assertGlobMatch(p, "/testing/foo.js");
    assertGlobMatch(p, "\\testing\\foo.js");
    assertGlobMatch(p, "C:\\testing\\foo.js");
  });
  test("cached properly", function() {
    const p = "**/*.js";
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "testing/foo.js");
    assertGlobMatch(p, "testing\\foo.js");
    assertGlobMatch(p, "/testing/foo.js");
    assertGlobMatch(p, "\\testing\\foo.js");
    assertGlobMatch(p, "C:\\testing\\foo.js");
    assertNoGlobMatch(p, "foo.ts");
    assertNoGlobMatch(p, "testing/foo.ts");
    assertNoGlobMatch(p, "testing\\foo.ts");
    assertNoGlobMatch(p, "/testing/foo.ts");
    assertNoGlobMatch(p, "\\testing\\foo.ts");
    assertNoGlobMatch(p, "C:\\testing\\foo.ts");
    assertNoGlobMatch(p, "foo.js.txt");
    assertNoGlobMatch(p, "testing/foo.js.txt");
    assertNoGlobMatch(p, "testing\\foo.js.txt");
    assertNoGlobMatch(p, "/testing/foo.js.txt");
    assertNoGlobMatch(p, "\\testing\\foo.js.txt");
    assertNoGlobMatch(p, "C:\\testing\\foo.js.txt");
    assertNoGlobMatch(p, "testing.js/foo");
    assertNoGlobMatch(p, "testing.js\\foo");
    assertNoGlobMatch(p, "/testing.js/foo");
    assertNoGlobMatch(p, "\\testing.js\\foo");
    assertNoGlobMatch(p, "C:\\testing.js\\foo");
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "testing/foo.js");
    assertGlobMatch(p, "testing\\foo.js");
    assertGlobMatch(p, "/testing/foo.js");
    assertGlobMatch(p, "\\testing\\foo.js");
    assertGlobMatch(p, "C:\\testing\\foo.js");
    assertNoGlobMatch(p, "foo.ts");
    assertNoGlobMatch(p, "testing/foo.ts");
    assertNoGlobMatch(p, "testing\\foo.ts");
    assertNoGlobMatch(p, "/testing/foo.ts");
    assertNoGlobMatch(p, "\\testing\\foo.ts");
    assertNoGlobMatch(p, "C:\\testing\\foo.ts");
    assertNoGlobMatch(p, "foo.js.txt");
    assertNoGlobMatch(p, "testing/foo.js.txt");
    assertNoGlobMatch(p, "testing\\foo.js.txt");
    assertNoGlobMatch(p, "/testing/foo.js.txt");
    assertNoGlobMatch(p, "\\testing\\foo.js.txt");
    assertNoGlobMatch(p, "C:\\testing\\foo.js.txt");
    assertNoGlobMatch(p, "testing.js/foo");
    assertNoGlobMatch(p, "testing.js\\foo");
    assertNoGlobMatch(p, "/testing.js/foo");
    assertNoGlobMatch(p, "\\testing.js\\foo");
    assertNoGlobMatch(p, "C:\\testing.js\\foo");
  });
  test("invalid glob", function() {
    const p = "**/*(.js";
    assertNoGlobMatch(p, "foo.js");
  });
  test("split glob aware", function() {
    assert.deepStrictEqual(glob.splitGlobAware("foo,bar", ","), ["foo", "bar"]);
    assert.deepStrictEqual(glob.splitGlobAware("foo", ","), ["foo"]);
    assert.deepStrictEqual(glob.splitGlobAware("{foo,bar}", ","), ["{foo,bar}"]);
    assert.deepStrictEqual(glob.splitGlobAware("foo,bar,{foo,bar}", ","), ["foo", "bar", "{foo,bar}"]);
    assert.deepStrictEqual(glob.splitGlobAware("{foo,bar},foo,bar,{foo,bar}", ","), ["{foo,bar}", "foo", "bar", "{foo,bar}"]);
    assert.deepStrictEqual(glob.splitGlobAware("[foo,bar]", ","), ["[foo,bar]"]);
    assert.deepStrictEqual(glob.splitGlobAware("foo,bar,[foo,bar]", ","), ["foo", "bar", "[foo,bar]"]);
    assert.deepStrictEqual(glob.splitGlobAware("[foo,bar],foo,bar,[foo,bar]", ","), ["[foo,bar]", "foo", "bar", "[foo,bar]"]);
  });
  test("expression with disabled glob", function() {
    const expr = { "**/*.js": false };
    assert.strictEqual(glob.match(expr, "foo.js"), null);
  });
  test("expression with two non-trivia globs", function() {
    const expr = {
      "**/*.j?": true,
      "**/*.t?": true
    };
    assert.strictEqual(glob.match(expr, "foo.js"), "**/*.j?");
    assert.strictEqual(glob.match(expr, "foo.as"), null);
  });
  test("expression with non-trivia glob (issue 144458)", function() {
    const pattern = "**/p*";
    assert.strictEqual(glob.match(pattern, "foo/barp"), false);
    assert.strictEqual(glob.match(pattern, "foo/bar/ap"), false);
    assert.strictEqual(glob.match(pattern, "ap"), false);
    assert.strictEqual(glob.match(pattern, "foo/barp1"), false);
    assert.strictEqual(glob.match(pattern, "foo/bar/ap1"), false);
    assert.strictEqual(glob.match(pattern, "ap1"), false);
    assert.strictEqual(glob.match(pattern, "/foo/barp"), false);
    assert.strictEqual(glob.match(pattern, "/foo/bar/ap"), false);
    assert.strictEqual(glob.match(pattern, "/ap"), false);
    assert.strictEqual(glob.match(pattern, "/foo/barp1"), false);
    assert.strictEqual(glob.match(pattern, "/foo/bar/ap1"), false);
    assert.strictEqual(glob.match(pattern, "/ap1"), false);
    assert.strictEqual(glob.match(pattern, "foo/pbar"), true);
    assert.strictEqual(glob.match(pattern, "/foo/pbar"), true);
    assert.strictEqual(glob.match(pattern, "foo/bar/pa"), true);
    assert.strictEqual(glob.match(pattern, "/p"), true);
  });
  test("expression with empty glob", function() {
    const expr = { "": true };
    assert.strictEqual(glob.match(expr, "foo.js"), null);
  });
  test("expression with other falsy value", function() {
    const expr = { "**/*.js": 0 };
    assert.strictEqual(glob.match(expr, "foo.js"), "**/*.js");
  });
  test("expression with two basename globs", function() {
    const expr = {
      "**/bar": true,
      "**/baz": true
    };
    assert.strictEqual(glob.match(expr, "bar"), "**/bar");
    assert.strictEqual(glob.match(expr, "foo"), null);
    assert.strictEqual(glob.match(expr, "foo/bar"), "**/bar");
    assert.strictEqual(glob.match(expr, "foo\\bar"), "**/bar");
    assert.strictEqual(glob.match(expr, "foo/foo"), null);
  });
  test("expression with two basename globs and a siblings expression", function() {
    const expr = {
      "**/bar": true,
      "**/baz": true,
      "**/*.js": { when: "$(basename).ts" }
    };
    const siblings = ["foo.ts", "foo.js", "foo", "bar"];
    const hasSibling = (name) => siblings.indexOf(name) !== -1;
    assert.strictEqual(glob.parse(expr)("bar", void 0, hasSibling), "**/bar");
    assert.strictEqual(glob.parse(expr)("foo", void 0, hasSibling), null);
    assert.strictEqual(glob.parse(expr)("foo/bar", void 0, hasSibling), "**/bar");
    if (isWindows) {
      assert.strictEqual(glob.parse(expr)("foo\\bar", void 0, hasSibling), "**/bar");
    }
    assert.strictEqual(glob.parse(expr)("foo/foo", void 0, hasSibling), null);
    assert.strictEqual(glob.parse(expr)("foo.js", void 0, hasSibling), "**/*.js");
    assert.strictEqual(glob.parse(expr)("bar.js", void 0, hasSibling), null);
  });
  test("expression with multipe basename globs", function() {
    const expr = {
      "**/bar": true,
      "{**/baz,**/foo}": true
    };
    assert.strictEqual(glob.match(expr, "bar"), "**/bar");
    assert.strictEqual(glob.match(expr, "foo"), "{**/baz,**/foo}");
    assert.strictEqual(glob.match(expr, "baz"), "{**/baz,**/foo}");
    assert.strictEqual(glob.match(expr, "abc"), null);
  });
  test("falsy expression/pattern", function() {
    assert.strictEqual(glob.match(null, "foo"), false);
    assert.strictEqual(glob.match("", "foo"), false);
    assert.strictEqual(glob.parse(null)("foo"), false);
    assert.strictEqual(glob.parse("")("foo"), false);
  });
  test("falsy path", function() {
    assert.strictEqual(glob.parse("foo")(null), false);
    assert.strictEqual(glob.parse("foo")(""), false);
    assert.strictEqual(glob.parse("**/*.j?")(null), false);
    assert.strictEqual(glob.parse("**/*.j?")(""), false);
    assert.strictEqual(glob.parse("**/*.foo")(null), false);
    assert.strictEqual(glob.parse("**/*.foo")(""), false);
    assert.strictEqual(glob.parse("**/foo")(null), false);
    assert.strictEqual(glob.parse("**/foo")(""), false);
    assert.strictEqual(glob.parse("{**/baz,**/foo}")(null), false);
    assert.strictEqual(glob.parse("{**/baz,**/foo}")(""), false);
    assert.strictEqual(glob.parse("{**/*.baz,**/*.foo}")(null), false);
    assert.strictEqual(glob.parse("{**/*.baz,**/*.foo}")(""), false);
  });
  test("expression/pattern basename", function() {
    assert.strictEqual(glob.parse("**/foo")("bar/baz", "baz"), false);
    assert.strictEqual(glob.parse("**/foo")("bar/foo", "foo"), true);
    assert.strictEqual(glob.parse("{**/baz,**/foo}")("baz/bar", "bar"), false);
    assert.strictEqual(glob.parse("{**/baz,**/foo}")("baz/foo", "foo"), true);
    const expr = { "**/*.js": { when: "$(basename).ts" } };
    const siblings = ["foo.ts", "foo.js"];
    const hasSibling = (name) => siblings.indexOf(name) !== -1;
    assert.strictEqual(glob.parse(expr)("bar/baz.js", "baz.js", hasSibling), null);
    assert.strictEqual(glob.parse(expr)("bar/foo.js", "foo.js", hasSibling), "**/*.js");
  });
  test("expression/pattern basename terms", function() {
    assert.deepStrictEqual(glob.getBasenameTerms(glob.parse("**/*.foo")), []);
    assert.deepStrictEqual(glob.getBasenameTerms(glob.parse("**/foo")), ["foo"]);
    assert.deepStrictEqual(glob.getBasenameTerms(glob.parse("**/foo/")), ["foo"]);
    assert.deepStrictEqual(glob.getBasenameTerms(glob.parse("{**/baz,**/foo}")), ["baz", "foo"]);
    assert.deepStrictEqual(glob.getBasenameTerms(glob.parse("{**/baz/,**/foo/}")), ["baz", "foo"]);
    assert.deepStrictEqual(glob.getBasenameTerms(glob.parse({
      "**/foo": true,
      "{**/bar,**/baz}": true,
      "{**/bar2/,**/baz2/}": true,
      "**/bulb": false
    })), ["foo", "bar", "baz", "bar2", "baz2"]);
    assert.deepStrictEqual(glob.getBasenameTerms(glob.parse({
      "**/foo": { when: "$(basename).zip" },
      "**/bar": true
    })), ["bar"]);
  });
  test("expression/pattern optimization for basenames", function() {
    assert.deepStrictEqual(glob.getBasenameTerms(glob.parse("**/foo/**")), []);
    assert.deepStrictEqual(glob.getBasenameTerms(glob.parse("**/foo/**", { trimForExclusions: true })), ["foo"]);
    testOptimizationForBasenames("**/*.foo/**", [], [["baz/bar.foo/bar/baz", true]]);
    testOptimizationForBasenames("**/foo/**", ["foo"], [["bar/foo", true], ["bar/foo/baz", false]]);
    testOptimizationForBasenames("{**/baz/**,**/foo/**}", ["baz", "foo"], [["bar/baz", true], ["bar/foo", true]]);
    testOptimizationForBasenames({
      "**/foo/**": true,
      "{**/bar/**,**/baz/**}": true,
      "**/bulb/**": false
    }, ["foo", "bar", "baz"], [
      ["bar/foo", "**/foo/**"],
      ["foo/bar", "{**/bar/**,**/baz/**}"],
      ["bar/nope", null]
    ]);
    const siblings = ["baz", "baz.zip", "nope"];
    const hasSibling = (name) => siblings.indexOf(name) !== -1;
    testOptimizationForBasenames({
      "**/foo/**": { when: "$(basename).zip" },
      "**/bar/**": true
    }, ["bar"], [
      ["bar/foo", null],
      ["bar/foo/baz", null],
      ["bar/foo/nope", null],
      ["foo/bar", "**/bar/**"]
    ], [
      null,
      hasSibling,
      hasSibling
    ]);
  });
  function testOptimizationForBasenames(pattern, basenameTerms, matches, siblingsFns = []) {
    const parsed = glob.parse(pattern, { trimForExclusions: true });
    assert.deepStrictEqual(glob.getBasenameTerms(parsed), basenameTerms);
    matches.forEach(([text, result], i) => {
      assert.strictEqual(parsed(text, null, siblingsFns[i]), result);
    });
  }
  test("trailing slash", function() {
    assert.strictEqual(glob.parse("**/foo/")("bar/baz", "baz"), false);
    assert.strictEqual(glob.parse("**/foo/")("bar/foo", "foo"), true);
    assert.strictEqual(glob.parse("**/*.foo/")("bar/file.baz", "file.baz"), false);
    assert.strictEqual(glob.parse("**/*.foo/")("bar/file.foo", "file.foo"), true);
    assert.strictEqual(glob.parse("{**/foo/,**/abc/}")("bar/baz", "baz"), false);
    assert.strictEqual(glob.parse("{**/foo/,**/abc/}")("bar/foo", "foo"), true);
    assert.strictEqual(glob.parse("{**/foo/,**/abc/}")("bar/abc", "abc"), true);
    assert.strictEqual(glob.parse("{**/foo/,**/abc/}", { trimForExclusions: true })("bar/baz", "baz"), false);
    assert.strictEqual(glob.parse("{**/foo/,**/abc/}", { trimForExclusions: true })("bar/foo", "foo"), true);
    assert.strictEqual(glob.parse("{**/foo/,**/abc/}", { trimForExclusions: true })("bar/abc", "abc"), true);
  });
  test("expression/pattern path", function() {
    assert.strictEqual(glob.parse("**/foo/bar")(nativeSep("foo/baz"), "baz"), false);
    assert.strictEqual(glob.parse("**/foo/bar")(nativeSep("foo/bar"), "bar"), true);
    assert.strictEqual(glob.parse("**/foo/bar")(nativeSep("bar/foo/bar"), "bar"), true);
    assert.strictEqual(glob.parse("**/foo/bar/**")(nativeSep("bar/foo/bar"), "bar"), true);
    assert.strictEqual(glob.parse("**/foo/bar/**")(nativeSep("bar/foo/bar/baz"), "baz"), true);
    assert.strictEqual(glob.parse("**/foo/bar/**", { trimForExclusions: true })(nativeSep("bar/foo/bar"), "bar"), true);
    assert.strictEqual(glob.parse("**/foo/bar/**", { trimForExclusions: true })(nativeSep("bar/foo/bar/baz"), "baz"), false);
    assert.strictEqual(glob.parse("foo/bar")(nativeSep("foo/baz"), "baz"), false);
    assert.strictEqual(glob.parse("foo/bar")(nativeSep("foo/bar"), "bar"), true);
    assert.strictEqual(glob.parse("foo/bar/baz")(nativeSep("foo/bar/baz"), "baz"), true);
    assert.strictEqual(glob.parse("foo/bar")(nativeSep("bar/foo/bar"), "bar"), false);
    assert.strictEqual(glob.parse("foo/bar/**")(nativeSep("foo/bar/baz"), "baz"), true);
    assert.strictEqual(glob.parse("foo/bar/**", { trimForExclusions: true })(nativeSep("foo/bar"), "bar"), true);
    assert.strictEqual(glob.parse("foo/bar/**", { trimForExclusions: true })(nativeSep("foo/bar/baz"), "baz"), false);
  });
  test("expression/pattern paths", function() {
    assert.deepStrictEqual(glob.getPathTerms(glob.parse("**/*.foo")), []);
    assert.deepStrictEqual(glob.getPathTerms(glob.parse("**/foo")), []);
    assert.deepStrictEqual(glob.getPathTerms(glob.parse("**/foo/bar")), ["*/foo/bar"]);
    assert.deepStrictEqual(glob.getPathTerms(glob.parse("**/foo/bar/")), ["*/foo/bar"]);
    const parsed = glob.parse({
      "**/foo/bar": true,
      "**/foo2/bar2": true,
      // Not supported
      // '{**/bar/foo,**/baz/foo}': true,
      // '{**/bar2/foo/,**/baz2/foo/}': true,
      "**/bulb": true,
      "**/bulb2": true,
      "**/bulb/foo": false
    });
    assert.deepStrictEqual(glob.getPathTerms(parsed), ["*/foo/bar", "*/foo2/bar2"]);
    assert.deepStrictEqual(glob.getBasenameTerms(parsed), ["bulb", "bulb2"]);
    assert.deepStrictEqual(glob.getPathTerms(glob.parse({
      "**/foo/bar": { when: "$(basename).zip" },
      "**/bar/foo": true,
      "**/bar2/foo2": true
    })), ["*/bar/foo", "*/bar2/foo2"]);
  });
  test("expression/pattern optimization for paths", function() {
    assert.deepStrictEqual(glob.getPathTerms(glob.parse("**/foo/bar/**")), []);
    assert.deepStrictEqual(glob.getPathTerms(glob.parse("**/foo/bar/**", { trimForExclusions: true })), ["*/foo/bar"]);
    testOptimizationForPaths("**/*.foo/bar/**", [], [[nativeSep("baz/bar.foo/bar/baz"), true]]);
    testOptimizationForPaths("**/foo/bar/**", ["*/foo/bar"], [[nativeSep("bar/foo/bar"), true], [nativeSep("bar/foo/bar/baz"), false]]);
    testOptimizationForPaths({
      "**/foo/bar/**": true,
      // Not supported
      // '{**/bar/bar/**,**/baz/bar/**}': true,
      "**/bulb/bar/**": false
    }, ["*/foo/bar"], [
      [nativeSep("bar/foo/bar"), "**/foo/bar/**"],
      // Not supported
      // [nativeSep('foo/bar/bar'), '{**/bar/bar/**,**/baz/bar/**}'],
      [nativeSep("/foo/bar/nope"), null]
    ]);
    const siblings = ["baz", "baz.zip", "nope"];
    const hasSibling = (name) => siblings.indexOf(name) !== -1;
    testOptimizationForPaths({
      "**/foo/123/**": { when: "$(basename).zip" },
      "**/bar/123/**": true
    }, ["*/bar/123"], [
      [nativeSep("bar/foo/123"), null],
      [nativeSep("bar/foo/123/baz"), null],
      [nativeSep("bar/foo/123/nope"), null],
      [nativeSep("foo/bar/123"), "**/bar/123/**"]
    ], [
      null,
      hasSibling,
      hasSibling
    ]);
  });
  function testOptimizationForPaths(pattern, pathTerms, matches, siblingsFns = []) {
    const parsed = glob.parse(pattern, { trimForExclusions: true });
    assert.deepStrictEqual(glob.getPathTerms(parsed), pathTerms);
    matches.forEach(([text, result], i) => {
      assert.strictEqual(parsed(text, null, siblingsFns[i]), result);
    });
  }
  function nativeSep(slashPath) {
    return slashPath.replace(/\//g, sep);
  }
  test("relative pattern - glob star", function() {
    if (isWindows) {
      const p = { base: "C:\\DNXConsoleApp\\foo", pattern: "**/*.cs" };
      assertGlobMatch(p, "C:\\DNXConsoleApp\\foo\\Program.cs");
      assertGlobMatch(p, "C:\\DNXConsoleApp\\foo\\bar\\Program.cs");
      assertNoGlobMatch(p, "C:\\DNXConsoleApp\\foo\\Program.ts");
      assertNoGlobMatch(p, "C:\\DNXConsoleApp\\Program.cs");
      assertNoGlobMatch(p, "C:\\other\\DNXConsoleApp\\foo\\Program.ts");
    } else {
      const p = { base: "/DNXConsoleApp/foo", pattern: "**/*.cs" };
      assertGlobMatch(p, "/DNXConsoleApp/foo/Program.cs");
      assertGlobMatch(p, "/DNXConsoleApp/foo/bar/Program.cs");
      assertNoGlobMatch(p, "/DNXConsoleApp/foo/Program.ts");
      assertNoGlobMatch(p, "/DNXConsoleApp/Program.cs");
      assertNoGlobMatch(p, "/other/DNXConsoleApp/foo/Program.ts");
    }
  });
  test("relative pattern - single star", function() {
    if (isWindows) {
      const p = { base: "C:\\DNXConsoleApp\\foo", pattern: "*.cs" };
      assertGlobMatch(p, "C:\\DNXConsoleApp\\foo\\Program.cs");
      assertNoGlobMatch(p, "C:\\DNXConsoleApp\\foo\\bar\\Program.cs");
      assertNoGlobMatch(p, "C:\\DNXConsoleApp\\foo\\Program.ts");
      assertNoGlobMatch(p, "C:\\DNXConsoleApp\\Program.cs");
      assertNoGlobMatch(p, "C:\\other\\DNXConsoleApp\\foo\\Program.ts");
    } else {
      const p = { base: "/DNXConsoleApp/foo", pattern: "*.cs" };
      assertGlobMatch(p, "/DNXConsoleApp/foo/Program.cs");
      assertNoGlobMatch(p, "/DNXConsoleApp/foo/bar/Program.cs");
      assertNoGlobMatch(p, "/DNXConsoleApp/foo/Program.ts");
      assertNoGlobMatch(p, "/DNXConsoleApp/Program.cs");
      assertNoGlobMatch(p, "/other/DNXConsoleApp/foo/Program.ts");
    }
  });
  test("relative pattern - single star with path", function() {
    if (isWindows) {
      const p = { base: "C:\\DNXConsoleApp\\foo", pattern: "something/*.cs" };
      assertGlobMatch(p, "C:\\DNXConsoleApp\\foo\\something\\Program.cs");
      assertNoGlobMatch(p, "C:\\DNXConsoleApp\\foo\\Program.cs");
    } else {
      const p = { base: "/DNXConsoleApp/foo", pattern: "something/*.cs" };
      assertGlobMatch(p, "/DNXConsoleApp/foo/something/Program.cs");
      assertNoGlobMatch(p, "/DNXConsoleApp/foo/Program.cs");
    }
  });
  test("relative pattern - single star alone", function() {
    if (isWindows) {
      const p = { base: "C:\\DNXConsoleApp\\foo\\something\\Program.cs", pattern: "*" };
      assertGlobMatch(p, "C:\\DNXConsoleApp\\foo\\something\\Program.cs");
      assertNoGlobMatch(p, "C:\\DNXConsoleApp\\foo\\Program.cs");
    } else {
      const p = { base: "/DNXConsoleApp/foo/something/Program.cs", pattern: "*" };
      assertGlobMatch(p, "/DNXConsoleApp/foo/something/Program.cs");
      assertNoGlobMatch(p, "/DNXConsoleApp/foo/Program.cs");
    }
  });
  test("relative pattern - ignores case on macOS/Windows", function() {
    if (isWindows) {
      const p = { base: "C:\\DNXConsoleApp\\foo", pattern: "something/*.cs" };
      assertGlobMatch(p, "C:\\DNXConsoleApp\\foo\\something\\Program.cs".toLowerCase());
    } else if (isMacintosh) {
      const p = { base: "/DNXConsoleApp/foo", pattern: "something/*.cs" };
      assertGlobMatch(p, "/DNXConsoleApp/foo/something/Program.cs".toLowerCase());
    } else if (isLinux) {
      const p = { base: "/DNXConsoleApp/foo", pattern: "something/*.cs" };
      assertNoGlobMatch(p, "/DNXConsoleApp/foo/something/Program.cs".toLowerCase());
    }
  });
  test("relative pattern - trailing slash / backslash (#162498)", function() {
    if (isWindows) {
      let p = { base: "C:\\", pattern: "foo.cs" };
      assertGlobMatch(p, "C:\\foo.cs");
      p = { base: "C:\\bar\\", pattern: "foo.cs" };
      assertGlobMatch(p, "C:\\bar\\foo.cs");
    } else {
      let p = { base: "/", pattern: "foo.cs" };
      assertGlobMatch(p, "/foo.cs");
      p = { base: "/bar/", pattern: "foo.cs" };
      assertGlobMatch(p, "/bar/foo.cs");
    }
  });
  test('pattern with "base" does not explode - #36081', function() {
    assert.ok(glob.match({ "base": true }, "base"));
  });
  test("relative pattern - #57475", function() {
    if (isWindows) {
      const p = { base: "C:\\DNXConsoleApp\\foo", pattern: "styles/style.css" };
      assertGlobMatch(p, "C:\\DNXConsoleApp\\foo\\styles\\style.css");
      assertNoGlobMatch(p, "C:\\DNXConsoleApp\\foo\\Program.cs");
    } else {
      const p = { base: "/DNXConsoleApp/foo", pattern: "styles/style.css" };
      assertGlobMatch(p, "/DNXConsoleApp/foo/styles/style.css");
      assertNoGlobMatch(p, "/DNXConsoleApp/foo/Program.cs");
    }
  });
  test("URI match", () => {
    const p = "scheme:/**/*.md";
    assertGlobMatch(p, URI.file("super/duper/long/some/file.md").with({ scheme: "scheme" }).toString());
  });
  test("expression fails when siblings use promises (https://github.com/microsoft/vscode/issues/146294)", async function() {
    const siblings = ["test.html", "test.txt", "test.ts"];
    const hasSibling = (name) => Promise.resolve(siblings.indexOf(name) !== -1);
    const expression = {
      "**/test.js": { when: "$(basename).js" },
      "**/*.js": { when: "$(basename).ts" }
    };
    const parsedExpression = glob.parse(expression);
    assert.strictEqual("**/*.js", await parsedExpression("test.js", void 0, hasSibling));
  });
  test("patternsEquals", () => {
    assert.ok(glob.patternsEquals(["a"], ["a"]));
    assert.ok(!glob.patternsEquals(["a"], ["b"]));
    assert.ok(glob.patternsEquals(["a", "b", "c"], ["a", "b", "c"]));
    assert.ok(!glob.patternsEquals(["1", "2"], ["1", "3"]));
    assert.ok(glob.patternsEquals([{ base: "a", pattern: "*" }, "b", "c"], [{ base: "a", pattern: "*" }, "b", "c"]));
    assert.ok(glob.patternsEquals(void 0, void 0));
    assert.ok(!glob.patternsEquals(void 0, ["b"]));
    assert.ok(!glob.patternsEquals(["a"], void 0));
  });
  test("isEmptyPattern", () => {
    assert.ok(glob.isEmptyPattern(glob.parse("")));
    assert.ok(glob.isEmptyPattern(glob.parse(void 0)));
    assert.ok(glob.isEmptyPattern(glob.parse(null)));
    assert.ok(glob.isEmptyPattern(glob.parse({})));
    assert.ok(glob.isEmptyPattern(glob.parse({ "": true })));
    assert.ok(glob.isEmptyPattern(glob.parse({ "**/*.js": false })));
  });
  test("caseInsensitiveMatch", () => {
    assertNoGlobMatch("PATH/FOO.js", "path/foo.js");
    assertGlobMatch("PATH/FOO.js", "path/foo.js", true);
    assertNoGlobMatch("**/*.JS", "bar/foo.js");
    assertGlobMatch("**/*.JS", "bar/foo.js", true);
    assertNoGlobMatch("**/package", "bar/Package");
    assertGlobMatch("**/package", "bar/Package", true);
    assertNoGlobMatch("{**/*.JS,**/*.TS}", "bar/foo.ts");
    assertNoGlobMatch("{**/*.JS,**/*.TS}", "bar/foo.js");
    assertGlobMatch("{**/*.JS,**/*.TS}", "bar/foo.ts", true);
    assertGlobMatch("{**/*.JS,**/*.TS}", "bar/foo.js", true);
    assertNoGlobMatch("**/FOO/Bar", "bar/foo/bar");
    assertGlobMatch("**/FOO/Bar", "bar/foo/bar", true);
    assertNoGlobMatch("FOO/Bar", "foo/bar");
    assertGlobMatch("FOO/Bar", "foo/bar", true);
    assertNoGlobMatch("some/*/Random/*/Path.FILE", "some/very/random/unusual/path.file");
    assertGlobMatch("some/*/Random/*/Path.FILE", "some/very/random/unusual/path.file", true);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vZ2xvYi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgZ2xvYiBmcm9tICcuLi8uLi9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBzZXAgfSBmcm9tICcuLi8uLi9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc0xpbnV4LCBpc01hY2ludG9zaCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbnN1aXRlKCdHbG9iJywgKCkgPT4ge1xuXG5cdC8vIHRlc3QoJ3BlcmYnLCAoKSA9PiB7XG5cblx0Ly8gXHRsZXQgcGF0dGVybnMgPSBbXG5cdC8vIFx0XHQneyoqLyouY3MsKiovKi5qc29uLCoqLyouY3Nwcm9qLCoqLyouc2xufScsXG5cdC8vIFx0XHQneyoqLyouY3MsKiovKi5jc3Byb2osKiovKi5zbG59Jyxcblx0Ly8gXHRcdCd7KiovKi50cywqKi8qLnRzeCwqKi8qLmpzLCoqLyouanN4LCoqLyouZXM2LCoqLyoubWpzLCoqLyouY2pzfScsXG5cdC8vIFx0XHQnKiovKi5nbycsXG5cdC8vIFx0XHQneyoqLyoucHMsKiovKi5wczF9Jyxcblx0Ly8gXHRcdCd7KiovKi5jLCoqLyouY3BwLCoqLyouaH0nLFxuXHQvLyBcdFx0J3sqKi8qLmZzeCwqKi8qLmZzaSwqKi8qLmZzLCoqLyoubWwsKiovKi5tbGl9Jyxcblx0Ly8gXHRcdCd7KiovKi5qcywqKi8qLmpzeCwqKi8qLmVzNiwqKi8qLm1qcywqKi8qLmNqc30nLFxuXHQvLyBcdFx0J3sqKi8qLnRzLCoqLyoudHN4fScsXG5cdC8vIFx0XHQneyoqLyoucGhwfScsXG5cdC8vIFx0XHQneyoqLyoucGhwfScsXG5cdC8vIFx0XHQneyoqLyoucGhwfScsXG5cdC8vIFx0XHQneyoqLyoucGhwfScsXG5cdC8vIFx0XHQneyoqLyoucHl9Jyxcblx0Ly8gXHRcdCd7KiovKi5weX0nLFxuXHQvLyBcdFx0J3sqKi8qLnB5fScsXG5cdC8vIFx0XHQneyoqLyoucnMsKiovKi5yc2xpYn0nLFxuXHQvLyBcdFx0J3sqKi8qLmNwcCwqKi8qLmNjLCoqLyouaH0nLFxuXHQvLyBcdFx0J3sqKi8qLm1kfScsXG5cdC8vIFx0XHQneyoqLyoubWR9Jyxcblx0Ly8gXHRcdCd7KiovKi5tZH0nXG5cdC8vIFx0XTtcblxuXHQvLyBcdGxldCBwYXRocyA9IFtcblx0Ly8gXHRcdCcvRE5YQ29uc29sZUFwcC9Qcm9ncmFtLmNzJyxcblx0Ly8gXHRcdCdDOlxcXFxETlhDb25zb2xlQXBwXFxcXGZvb1xcXFxQcm9ncmFtLmNzJyxcblx0Ly8gXHRcdCd0ZXN0L3F1bml0Jyxcblx0Ly8gXHRcdCd0ZXN0L3Rlc3QudHh0Jyxcblx0Ly8gXHRcdCd0ZXN0L25vZGVfbW9kdWxlcycsXG5cdC8vIFx0XHQnLmhpZGRlbi50eHQnLFxuXHQvLyBcdFx0Jy9ub2RlX21vZHVsZS90ZXN0L2Zvby5qcydcblx0Ly8gXHRdO1xuXG5cdC8vIFx0bGV0IHJlc3VsdHMgPSAwO1xuXHQvLyBcdGxldCBjID0gMTAwMDtcblx0Ly8gXHRjb25zb2xlLnByb2ZpbGUoJ2dsb2IubWF0Y2gnKTtcblx0Ly8gXHR3aGlsZSAoYy0tID4gMCkge1xuXHQvLyBcdFx0Zm9yIChsZXQgcGF0aCBvZiBwYXRocykge1xuXHQvLyBcdFx0XHRmb3IgKGxldCBwYXR0ZXJuIG9mIHBhdHRlcm5zKSB7XG5cdC8vIFx0XHRcdFx0bGV0IHIgPSBnbG9iLm1hdGNoKHBhdHRlcm4sIHBhdGgpO1xuXHQvLyBcdFx0XHRcdGlmIChyKSB7XG5cdC8vIFx0XHRcdFx0XHRyZXN1bHRzICs9IDQyO1xuXHQvLyBcdFx0XHRcdH1cblx0Ly8gXHRcdFx0fVxuXHQvLyBcdFx0fVxuXHQvLyBcdH1cblx0Ly8gXHRjb25zb2xlLnByb2ZpbGVFbmQoKTtcblx0Ly8gfSk7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0R2xvYk1hdGNoKHBhdHRlcm46IHN0cmluZyB8IGdsb2IuSVJlbGF0aXZlUGF0dGVybiwgaW5wdXQ6IHN0cmluZywgaWdub3JlQ2FzZT86IGJvb2xlYW4pIHtcblx0XHRhc3NlcnQoZ2xvYi5tYXRjaChwYXR0ZXJuLCBpbnB1dCwgeyBpZ25vcmVDYXNlIH0pLCBgJHtKU09OLnN0cmluZ2lmeShwYXR0ZXJuKX0gc2hvdWxkIG1hdGNoICR7aW5wdXR9YCk7XG5cdFx0YXNzZXJ0KGdsb2IubWF0Y2gocGF0dGVybiwgbmF0aXZlU2VwKGlucHV0KSwgeyBpZ25vcmVDYXNlIH0pLCBgJHtwYXR0ZXJufSBzaG91bGQgbWF0Y2ggJHtuYXRpdmVTZXAoaW5wdXQpfWApO1xuXHR9XG5cblx0ZnVuY3Rpb24gYXNzZXJ0Tm9HbG9iTWF0Y2gocGF0dGVybjogc3RyaW5nIHwgZ2xvYi5JUmVsYXRpdmVQYXR0ZXJuLCBpbnB1dDogc3RyaW5nLCBpZ25vcmVDYXNlPzogYm9vbGVhbikge1xuXHRcdGFzc2VydCghZ2xvYi5tYXRjaChwYXR0ZXJuLCBpbnB1dCwgeyBpZ25vcmVDYXNlIH0pLCBgJHtwYXR0ZXJufSBzaG91bGQgbm90IG1hdGNoICR7aW5wdXR9YCk7XG5cdFx0YXNzZXJ0KCFnbG9iLm1hdGNoKHBhdHRlcm4sIG5hdGl2ZVNlcChpbnB1dCksIHsgaWdub3JlQ2FzZSB9KSwgYCR7cGF0dGVybn0gc2hvdWxkIG5vdCBtYXRjaCAke25hdGl2ZVNlcChpbnB1dCl9YCk7XG5cdH1cblxuXHR0ZXN0KCdzaW1wbGUnLCAoKSA9PiB7XG5cdFx0bGV0IHAgPSAnbm9kZV9tb2R1bGVzJztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ25vZGVfbW9kdWxlJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy9ub2RlX21vZHVsZXMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAndGVzdC9ub2RlX21vZHVsZXMnKTtcblxuXHRcdHAgPSAndGVzdC50eHQnO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAndGVzdC50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAndGVzdD90eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL3RleHQudHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3Rlc3QvdGVzdC50eHQnKTtcblxuXHRcdHAgPSAndGVzdCgudHh0Jztcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3Rlc3QoLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0P3R4dCcpO1xuXG5cdFx0cCA9ICdxdW5pdCc7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3F1bml0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3F1bml0LmNzcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0L3F1bml0Jyk7XG5cblx0XHQvLyBBYnNvbHV0ZVxuXG5cdFx0cCA9ICcvRE5YQ29uc29sZUFwcC8qKi8qLmNzJztcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9ETlhDb25zb2xlQXBwL1Byb2dyYW0uY3MnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9ETlhDb25zb2xlQXBwL2Zvby9Qcm9ncmFtLmNzJyk7XG5cblx0XHRwID0gJ0M6L0ROWENvbnNvbGVBcHAvKiovKi5jcyc7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXFByb2dyYW0uY3MnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ0M6XFxcXEROWENvbnNvbGVBcHBcXFxcZm9vXFxcXFByb2dyYW0uY3MnKTtcblxuXHRcdHAgPSAnKic7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcnKTtcblx0fSk7XG5cblx0dGVzdCgnZG90IGhpZGRlbicsIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgcCA9ICcuKic7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy5naXQnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy5oaWRkZW4udHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2dpdCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdoaWRkZW4udHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3BhdGgvLmdpdCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdwYXRoLy5oaWRkZW4udHh0Jyk7XG5cblx0XHRwID0gJyoqLy4qJztcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy5naXQnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy8uZ2l0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcuaGlkZGVuLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdnaXQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnaGlkZGVuLnR4dCcpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAncGF0aC8uZ2l0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdwYXRoLy5oaWRkZW4udHh0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvcGF0aC8uZ2l0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvcGF0aC8uaGlkZGVuLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdwYXRoL2dpdCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdwYXQuaC9oaWRkZW4udHh0Jyk7XG5cblx0XHRwID0gJy5fKic7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy5fZ2l0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcuX2hpZGRlbi50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZ2l0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2hpZGRlbi50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAncGF0aC8uX2dpdCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdwYXRoLy5faGlkZGVuLnR4dCcpO1xuXG5cdFx0cCA9ICcqKi8uXyonO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnLl9naXQnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy5faGlkZGVuLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdnaXQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnaGlkZGVuLl90eHQnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3BhdGgvLl9naXQnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3BhdGgvLl9oaWRkZW4udHh0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvcGF0aC8uX2dpdCcpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL3BhdGgvLl9oaWRkZW4udHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3BhdGgvZ2l0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3BhdC5oL2hpZGRlbi5fdHh0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbGUgcGF0dGVybicsIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgcCA9ICcqLmpzJztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2ZvbGRlci9mb28uanMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL25vZGVfbW9kdWxlcy9mb28uanMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLmpzcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdzb21lLmpzL3Rlc3QnKTtcblxuXHRcdHAgPSAnaHRtbC4qJztcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2h0bWwuanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2h0bWwudHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2h0bS50eHQnKTtcblxuXHRcdHAgPSAnKi4qJztcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2h0bWwuanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2h0bWwudHh0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdodG0udHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2ZvbGRlci9mb28uanMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL25vZGVfbW9kdWxlcy9mb28uanMnKTtcblxuXHRcdHAgPSAnbm9kZV9tb2R1bGVzL3Rlc3QvKi5qcyc7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdub2RlX21vZHVsZXMvdGVzdC9mb28uanMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9sZGVyL2Zvby5qcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvbm9kZV9tb2R1bGUvdGVzdC9mb28uanMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLmpzcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdzb21lLmpzL3Rlc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhcicsICgpID0+IHtcblx0XHRsZXQgcCA9ICdub2RlKm1vZHVsZXMnO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdub2RlX21vZHVsZXMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ25vZGVfc3VwZXJfbW9kdWxlcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdub2RlX21vZHVsZScpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3Rlc3Qvbm9kZV9tb2R1bGVzJyk7XG5cblx0XHRwID0gJyonO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnaHRtbC5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnaHRtbC50eHQnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2h0bS50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9sZGVyL2Zvby5qcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvbm9kZV9tb2R1bGVzL2Zvby5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxlIC8gZm9sZGVyIG1hdGNoJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHAgPSAnKiovbm9kZV9tb2R1bGVzLyoqJztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdub2RlX21vZHVsZXMvJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdhL25vZGVfbW9kdWxlcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnYS9ub2RlX21vZHVsZXMvJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdub2RlX21vZHVsZXMvZm9vJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28vbm9kZV9tb2R1bGVzL2Zvby9iYXInKTtcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL25vZGVfbW9kdWxlcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL25vZGVfbW9kdWxlcy8nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9hL25vZGVfbW9kdWxlcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL2Evbm9kZV9tb2R1bGVzLycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL25vZGVfbW9kdWxlcy9mb28nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9mb28vbm9kZV9tb2R1bGVzL2Zvby9iYXInKTtcblx0fSk7XG5cblx0dGVzdCgncXVlc3Rpb25tYXJrJywgKCkgPT4ge1xuXHRcdGxldCBwID0gJ25vZGU/bW9kdWxlcyc7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ25vZGVfbW9kdWxlcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdub2RlX3N1cGVyX21vZHVsZXMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnbm9kZV9tb2R1bGUnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL25vZGVfbW9kdWxlcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0L25vZGVfbW9kdWxlcycpO1xuXG5cdFx0cCA9ICc/Jztcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2gnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnaHRtbC50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnaHRtLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb2xkZXIvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy9ub2RlX21vZHVsZXMvZm9vLmpzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dsb2JzdGFyJywgKCkgPT4ge1xuXHRcdGxldCBwID0gJyoqLyouanMnO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2ZvbGRlci9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9ub2RlX21vZHVsZXMvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Zvby5qc3MnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnc29tZS5qcy90ZXN0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy9zb21lLmpzL3Rlc3QnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnXFxcXHNvbWUuanNcXFxcdGVzdCcpO1xuXG5cdFx0cCA9ICcqKi9wcm9qZWN0Lmpzb24nO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdwcm9qZWN0Lmpzb24nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9wcm9qZWN0Lmpzb24nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3NvbWUvZm9sZGVyL3Byb2plY3QuanNvbicpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL3NvbWUvZm9sZGVyL3Byb2plY3QuanNvbicpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdzb21lL2ZvbGRlci9maWxlX3Byb2plY3QuanNvbicpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdzb21lL2ZvbGRlci9maWxlcHJvamVjdC5qc29uJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3NvbWUvcnJwcm9qZWN0Lmpzb24nKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnc29tZVxcXFxycnByb2plY3QuanNvbicpO1xuXG5cdFx0cCA9ICd0ZXN0LyoqJztcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3Rlc3QnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3Rlc3QvZm9vJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0L2Zvby8nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3Rlc3QvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0L290aGVyL2Zvby5qcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdlc3Qvb3RoZXIvZm9vLmpzJyk7XG5cblx0XHRwID0gJyoqJztcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy8nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9sZGVyL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9sZGVyL2Zvby8nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9ub2RlX21vZHVsZXMvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uanNzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdzb21lLmpzL3Rlc3QnKTtcblxuXHRcdHAgPSAndGVzdC8qKi8qLmpzJztcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3Rlc3QvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0L290aGVyL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAndGVzdC9vdGhlci9tb3JlL2Zvby5qcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0L2Zvby50cycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0L290aGVyL2Zvby50cycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0L290aGVyL21vcmUvZm9vLnRzJyk7XG5cblx0XHRwID0gJyoqLyoqLyouanMnO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2ZvbGRlci9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9ub2RlX21vZHVsZXMvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Zvby5qc3MnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnc29tZS5qcy90ZXN0Jyk7XG5cblx0XHRwID0gJyoqL25vZGVfbW9kdWxlcy8qKi8qLmpzJztcblxuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb28uanMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9sZGVyL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnbm9kZV9tb2R1bGVzL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL25vZGVfbW9kdWxlcy9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ25vZGVfbW9kdWxlcy9zb21lL2ZvbGRlci9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9ub2RlX21vZHVsZXMvc29tZS9mb2xkZXIvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ25vZGVfbW9kdWxlcy9zb21lL2ZvbGRlci9mb28udHMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLmpzcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdzb21lLmpzL3Rlc3QnKTtcblxuXHRcdHAgPSAneyoqL25vZGVfbW9kdWxlcy8qKiwqKi8uZ2l0LyoqLCoqL2Jvd2VyX2NvbXBvbmVudHMvKip9JztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvbm9kZV9tb2R1bGVzL21vcmUnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3NvbWUvdGVzdC9ub2RlX21vZHVsZXMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3NvbWVcXFxcdGVzdFxcXFxub2RlX21vZHVsZXMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9zb21lL3Rlc3Qvbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdcXFxcc29tZVxcXFx0ZXN0XFxcXG5vZGVfbW9kdWxlcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnQzpcXFxcXFxcXHNvbWVcXFxcdGVzdFxcXFxub2RlX21vZHVsZXMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ0M6XFxcXFxcXFxzb21lXFxcXHRlc3RcXFxcbm9kZV9tb2R1bGVzXFxcXG1vcmUnKTtcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnYm93ZXJfY29tcG9uZW50cycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnYm93ZXJfY29tcG9uZW50cy9tb3JlJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvYm93ZXJfY29tcG9uZW50cycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnc29tZS90ZXN0L2Jvd2VyX2NvbXBvbmVudHMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3NvbWVcXFxcdGVzdFxcXFxib3dlcl9jb21wb25lbnRzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvc29tZS90ZXN0L2Jvd2VyX2NvbXBvbmVudHMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ1xcXFxzb21lXFxcXHRlc3RcXFxcYm93ZXJfY29tcG9uZW50cycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnQzpcXFxcXFxcXHNvbWVcXFxcdGVzdFxcXFxib3dlcl9jb21wb25lbnRzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdDOlxcXFxcXFxcc29tZVxcXFx0ZXN0XFxcXGJvd2VyX2NvbXBvbmVudHNcXFxcbW9yZScpO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcuZ2l0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvLmdpdCcpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnc29tZS90ZXN0Ly5naXQnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3NvbWVcXFxcdGVzdFxcXFwuZ2l0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvc29tZS90ZXN0Ly5naXQnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ1xcXFxzb21lXFxcXHRlc3RcXFxcLmdpdCcpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnQzpcXFxcXFxcXHNvbWVcXFxcdGVzdFxcXFwuZ2l0Jyk7XG5cblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAndGVtcHRpbmcnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL3RlbXB0aW5nJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3NvbWUvdGVzdC90ZW1wdGluZycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdzb21lXFxcXHRlc3RcXFxcdGVtcHRpbmcnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL3NvbWUvdGVzdC90ZW1wdGluZycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdcXFxcc29tZVxcXFx0ZXN0XFxcXHRlbXB0aW5nJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ0M6XFxcXFxcXFxzb21lXFxcXHRlc3RcXFxcdGVtcHRpbmcnKTtcblxuXHRcdHAgPSAneyoqL3BhY2thZ2UuanNvbiwqKi9wcm9qZWN0Lmpzb259Jztcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3BhY2thZ2UuanNvbicpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL3BhY2thZ2UuanNvbicpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd4cGFja2FnZS5qc29uJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy94cGFja2FnZS5qc29uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlIDQxNzI0JywgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBwID0gJ3NvbWUvKiovKi5qcyc7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3NvbWUvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdzb21lL2ZvbGRlci9mb28uanMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnc29tZXRoaW5nL2Zvby5qcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdzb21ldGhpbmcvZm9sZGVyL2Zvby5qcycpO1xuXG5cdFx0cCA9ICdzb21lLyoqLyonO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdzb21lL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnc29tZS9mb2xkZXIvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3NvbWV0aGluZy9mb28uanMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnc29tZXRoaW5nL2ZvbGRlci9mb28uanMnKTtcblx0fSk7XG5cblx0dGVzdCgnYnJhY2UgZXhwYW5zaW9uJywgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBwID0gJyoue2h0bWwsanN9JztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uaHRtbCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb2xkZXIvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy9ub2RlX21vZHVsZXMvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Zvby5qc3MnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnc29tZS5qcy90ZXN0Jyk7XG5cblx0XHRwID0gJyoue2h0bWx9JztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLmh0bWwnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2ZvbGRlci9mb28uanMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL25vZGVfbW9kdWxlcy9mb28uanMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLmpzcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdzb21lLmpzL3Rlc3QnKTtcblxuXHRcdHAgPSAne25vZGVfbW9kdWxlcyx0ZXN0aW5nfSc7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdub2RlX21vZHVsZXMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3Rlc3RpbmcnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnbm9kZV9tb2R1bGUnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZHRlc3RpbmcnKTtcblxuXHRcdHAgPSAnKiove2ZvbyxiYXJ9Jztcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2ZvbycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnYmFyJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0L2ZvbycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAndGVzdC9iYXInKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ290aGVyL21vcmUvZm9vJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdvdGhlci9tb3JlL2JhcicpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL2ZvbycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL2JhcicpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL3Rlc3QvZm9vJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvdGVzdC9iYXInKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9vdGhlci9tb3JlL2ZvbycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL290aGVyL21vcmUvYmFyJyk7XG5cblx0XHRwID0gJ3tmb28sYmFyfS8qKic7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2JhcicpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnYmFyLycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vL3Rlc3QnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Jhci90ZXN0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdiYXIvdGVzdC8nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby9vdGhlci9tb3JlJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdiYXIvb3RoZXIvbW9yZScpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnYmFyL290aGVyL21vcmUvJyk7XG5cblx0XHRwID0gJ3sqKi8qLmQudHMsKiovKi5qc30nO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3Rlc3RpbmcvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0aW5nXFxcXGZvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL3Rlc3RpbmcvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdcXFxcdGVzdGluZ1xcXFxmb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ0M6XFxcXHRlc3RpbmdcXFxcZm9vLmpzJyk7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby5kLnRzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0aW5nL2Zvby5kLnRzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0aW5nXFxcXGZvby5kLnRzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvdGVzdGluZy9mb28uZC50cycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnXFxcXHRlc3RpbmdcXFxcZm9vLmQudHMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ0M6XFxcXHRlc3RpbmdcXFxcZm9vLmQudHMnKTtcblxuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb28uZCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nL2Zvby5kJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3Rlc3RpbmdcXFxcZm9vLmQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL3Rlc3RpbmcvZm9vLmQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnXFxcXHRlc3RpbmdcXFxcZm9vLmQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnQzpcXFxcdGVzdGluZ1xcXFxmb28uZCcpO1xuXG5cdFx0cCA9ICd7KiovKi5kLnRzLCoqLyouanMscGF0aC9zaW1wbGUuamdzfSc7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAndGVzdGluZy9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3Rlc3RpbmdcXFxcZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvdGVzdGluZy9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3BhdGgvc2ltcGxlLmpncycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvcGF0aC9zaW1wbGUuamdzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdcXFxcdGVzdGluZ1xcXFxmb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ0M6XFxcXHRlc3RpbmdcXFxcZm9vLmpzJyk7XG5cblx0XHRwID0gJ3sqKi8qLmQudHMsKiovKi5qcyxmb28uWzAtOV19JztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLjUnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby44Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Jhci41Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Zvby5mJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uanMnKTtcblxuXHRcdHAgPSAncHJlZml4L3sqKi8qLmQudHMsKiovKi5qcyxmb28uWzAtOV19JztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAncHJlZml4L2Zvby41Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdwcmVmaXgvZm9vLjgnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAncHJlZml4L2Jhci41Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3ByZWZpeC9mb28uZicpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAncHJlZml4L2Zvby5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHByZXNzaW9uIHN1cHBvcnQgKHNpbmdsZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2libGluZ3MgPSBbJ3Rlc3QuaHRtbCcsICd0ZXN0LnR4dCcsICd0ZXN0LnRzJywgJ3Rlc3QuanMnXTtcblx0XHRjb25zdCBoYXNTaWJsaW5nID0gKG5hbWU6IHN0cmluZykgPT4gc2libGluZ3MuaW5kZXhPZihuYW1lKSAhPT0gLTE7XG5cblx0XHQvLyB7IFwiKiovKi5qc1wiOiB7IFwid2hlblwiOiBcIiQoYmFzZW5hbWUpLnRzXCIgfSB9XG5cdFx0bGV0IGV4cHJlc3Npb246IGdsb2IuSUV4cHJlc3Npb24gPSB7XG5cdFx0XHQnKiovKi5qcyc6IHtcblx0XHRcdFx0d2hlbjogJyQoYmFzZW5hbWUpLnRzJ1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJyoqLyouanMnLCBnbG9iLnBhcnNlKGV4cHJlc3Npb24pKCd0ZXN0LmpzJywgdW5kZWZpbmVkLCBoYXNTaWJsaW5nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoZXhwcmVzc2lvbikoJ3Rlc3QuanMnLCB1bmRlZmluZWQsICgpID0+IGZhbHNlKSwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoZXhwcmVzc2lvbikoJ3Rlc3QuanMnLCB1bmRlZmluZWQsIG5hbWUgPT4gbmFtZSA9PT0gJ3RlLnRzJyksIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKGV4cHJlc3Npb24pKCd0ZXN0LmpzJywgdW5kZWZpbmVkKSwgbnVsbCk7XG5cblx0XHRleHByZXNzaW9uID0ge1xuXHRcdFx0JyoqLyouanMnOiB7XG5cdFx0XHRcdHdoZW46ICcnXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKGV4cHJlc3Npb24pKCd0ZXN0LmpzJywgdW5kZWZpbmVkLCBoYXNTaWJsaW5nKSwgbnVsbCk7XG5cblx0XHRleHByZXNzaW9uID0ge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHQnKiovKi5qcyc6IHtcblx0XHRcdH0gYXMgYW55XG5cdFx0fTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgnKiovKi5qcycsIGdsb2IucGFyc2UoZXhwcmVzc2lvbikoJ3Rlc3QuanMnLCB1bmRlZmluZWQsIGhhc1NpYmxpbmcpKTtcblxuXHRcdGV4cHJlc3Npb24gPSB7fTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKGV4cHJlc3Npb24pKCd0ZXN0LmpzJywgdW5kZWZpbmVkLCBoYXNTaWJsaW5nKSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cHJlc3Npb24gc3VwcG9ydCAobXVsdGlwbGUpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNpYmxpbmdzID0gWyd0ZXN0Lmh0bWwnLCAndGVzdC50eHQnLCAndGVzdC50cycsICd0ZXN0LmpzJ107XG5cdFx0Y29uc3QgaGFzU2libGluZyA9IChuYW1lOiBzdHJpbmcpID0+IHNpYmxpbmdzLmluZGV4T2YobmFtZSkgIT09IC0xO1xuXG5cdFx0Ly8geyBcIioqLyouanNcIjogeyBcIndoZW5cIjogXCIkKGJhc2VuYW1lKS50c1wiIH0gfVxuXHRcdGNvbnN0IGV4cHJlc3Npb246IGdsb2IuSUV4cHJlc3Npb24gPSB7XG5cdFx0XHQnKiovKi5qcyc6IHsgd2hlbjogJyQoYmFzZW5hbWUpLnRzJyB9LFxuXHRcdFx0JyoqLyouYXMnOiB0cnVlLFxuXHRcdFx0JyoqLyouZm9vJzogZmFsc2UsXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdCcqKi8qLmJhbmFuYXMnOiB7IGJhbmFuYXM6IHRydWUgfSBhcyBhbnlcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCcqKi8qLmpzJywgZ2xvYi5wYXJzZShleHByZXNzaW9uKSgndGVzdC5qcycsIHVuZGVmaW5lZCwgaGFzU2libGluZykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgnKiovKi5hcycsIGdsb2IucGFyc2UoZXhwcmVzc2lvbikoJ3Rlc3QuYXMnLCB1bmRlZmluZWQsIGhhc1NpYmxpbmcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJyoqLyouYmFuYW5hcycsIGdsb2IucGFyc2UoZXhwcmVzc2lvbikoJ3Rlc3QuYmFuYW5hcycsIHVuZGVmaW5lZCwgaGFzU2libGluZykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgnKiovKi5iYW5hbmFzJywgZ2xvYi5wYXJzZShleHByZXNzaW9uKSgndGVzdC5iYW5hbmFzJywgdW5kZWZpbmVkKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoZXhwcmVzc2lvbikoJ3Rlc3QuZm9vJywgdW5kZWZpbmVkLCBoYXNTaWJsaW5nKSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JyYWNrZXRzJywgKCkgPT4ge1xuXHRcdGxldCBwID0gJ2Zvby5bMC05XSc7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby41Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uOCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdiYXIuNScpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb28uZicpO1xuXG5cdFx0cCA9ICdmb28uW14wLTldJztcblxuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb28uNScpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb28uOCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdiYXIuNScpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLmYnKTtcblxuXHRcdHAgPSAnZm9vLlshMC05XSc7XG5cblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLjUnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLjgnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnYmFyLjUnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby5mJyk7XG5cblx0XHRwID0gJ2Zvby5bMCFeKj9dJztcblxuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb28uNScpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb28uOCcpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLjAnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby4hJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uXicpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLionKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby4/Jyk7XG5cblx0XHRwID0gJ2Zvb1svXWJhcic7XG5cblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vL2JhcicpO1xuXG5cdFx0cCA9ICdmb28uW1tdJztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLlsnKTtcblxuXHRcdHAgPSAnZm9vLltdXSc7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby5dJyk7XG5cblx0XHRwID0gJ2Zvby5bXVshXSc7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby5dJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uWycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLiEnKTtcblxuXHRcdHAgPSAnZm9vLltdLV0nO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uXScpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLi0nKTtcblx0fSk7XG5cblx0dGVzdCgnZnVsbCBwYXRoJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydEdsb2JNYXRjaCgndGVzdGluZy90aGlzL2Zvby50eHQnLCAndGVzdGluZy90aGlzL2Zvby50eHQnKTtcblx0fSk7XG5cblx0dGVzdCgnZW5kaW5nIHBhdGgnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKCcqKi90ZXN0aW5nL3RoaXMvZm9vLnR4dCcsICdzb21lL3BhdGgvdGVzdGluZy90aGlzL2Zvby50eHQnKTtcblx0fSk7XG5cblx0dGVzdCgncHJlZml4IGFnbm9zdGljJywgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBwID0gJyoqLyouanMnO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ1xcXFxmb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3Rlc3RpbmcvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0aW5nXFxcXGZvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL3Rlc3RpbmcvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdcXFxcdGVzdGluZ1xcXFxmb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ0M6XFxcXHRlc3RpbmdcXFxcZm9vLmpzJyk7XG5cblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLnRzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3Rlc3RpbmcvZm9vLnRzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3Rlc3RpbmdcXFxcZm9vLnRzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy90ZXN0aW5nL2Zvby50cycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdcXFxcdGVzdGluZ1xcXFxmb28udHMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnQzpcXFxcdGVzdGluZ1xcXFxmb28udHMnKTtcblxuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb28uanMudHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3Rlc3RpbmcvZm9vLmpzLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nXFxcXGZvby5qcy50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL3Rlc3RpbmcvZm9vLmpzLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdcXFxcdGVzdGluZ1xcXFxmb28uanMudHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ0M6XFxcXHRlc3RpbmdcXFxcZm9vLmpzLnR4dCcpO1xuXG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3Rlc3RpbmcuanMvZm9vJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3Rlc3RpbmcuanNcXFxcZm9vJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy90ZXN0aW5nLmpzL2ZvbycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdcXFxcdGVzdGluZy5qc1xcXFxmb28nKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnQzpcXFxcdGVzdGluZy5qc1xcXFxmb28nKTtcblxuXHRcdHAgPSAnKiovZm9vLmpzJztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdcXFxcZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0aW5nL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAndGVzdGluZ1xcXFxmb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy90ZXN0aW5nL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnXFxcXHRlc3RpbmdcXFxcZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdDOlxcXFx0ZXN0aW5nXFxcXGZvby5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYWNoZWQgcHJvcGVybHknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcCA9ICcqKi8qLmpzJztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0aW5nL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAndGVzdGluZ1xcXFxmb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy90ZXN0aW5nL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnXFxcXHRlc3RpbmdcXFxcZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdDOlxcXFx0ZXN0aW5nXFxcXGZvby5qcycpO1xuXG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Zvby50cycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nL2Zvby50cycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nXFxcXGZvby50cycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvdGVzdGluZy9mb28udHMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnXFxcXHRlc3RpbmdcXFxcZm9vLnRzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ0M6XFxcXHRlc3RpbmdcXFxcZm9vLnRzJyk7XG5cblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLmpzLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nL2Zvby5qcy50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAndGVzdGluZ1xcXFxmb28uanMudHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy90ZXN0aW5nL2Zvby5qcy50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnXFxcXHRlc3RpbmdcXFxcZm9vLmpzLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdDOlxcXFx0ZXN0aW5nXFxcXGZvby5qcy50eHQnKTtcblxuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nLmpzL2ZvbycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nLmpzXFxcXGZvbycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvdGVzdGluZy5qcy9mb28nKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnXFxcXHRlc3RpbmcuanNcXFxcZm9vJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ0M6XFxcXHRlc3RpbmcuanNcXFxcZm9vJyk7XG5cblx0XHQvLyBSdW4gYWdhaW4gYW5kIG1ha2Ugc3VyZSB0aGUgcmVnZXggYXJlIHByb3Blcmx5IHJldXNlZFxuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3Rlc3RpbmcvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0aW5nXFxcXGZvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL3Rlc3RpbmcvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdcXFxcdGVzdGluZ1xcXFxmb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ0M6XFxcXHRlc3RpbmdcXFxcZm9vLmpzJyk7XG5cblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLnRzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3Rlc3RpbmcvZm9vLnRzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3Rlc3RpbmdcXFxcZm9vLnRzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy90ZXN0aW5nL2Zvby50cycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdcXFxcdGVzdGluZ1xcXFxmb28udHMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnQzpcXFxcdGVzdGluZ1xcXFxmb28udHMnKTtcblxuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb28uanMudHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3Rlc3RpbmcvZm9vLmpzLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nXFxcXGZvby5qcy50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL3Rlc3RpbmcvZm9vLmpzLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdcXFxcdGVzdGluZ1xcXFxmb28uanMudHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ0M6XFxcXHRlc3RpbmdcXFxcZm9vLmpzLnR4dCcpO1xuXG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3Rlc3RpbmcuanMvZm9vJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3Rlc3RpbmcuanNcXFxcZm9vJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy90ZXN0aW5nLmpzL2ZvbycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdcXFxcdGVzdGluZy5qc1xcXFxmb28nKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnQzpcXFxcdGVzdGluZy5qc1xcXFxmb28nKTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZCBnbG9iJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHAgPSAnKiovKiguanMnO1xuXG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Zvby5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzcGxpdCBnbG9iIGF3YXJlJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5zcGxpdEdsb2JBd2FyZSgnZm9vLGJhcicsICcsJyksIFsnZm9vJywgJ2JhciddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdsb2Iuc3BsaXRHbG9iQXdhcmUoJ2ZvbycsICcsJyksIFsnZm9vJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5zcGxpdEdsb2JBd2FyZSgne2ZvbyxiYXJ9JywgJywnKSwgWyd7Zm9vLGJhcn0nXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnbG9iLnNwbGl0R2xvYkF3YXJlKCdmb28sYmFyLHtmb28sYmFyfScsICcsJyksIFsnZm9vJywgJ2JhcicsICd7Zm9vLGJhcn0nXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnbG9iLnNwbGl0R2xvYkF3YXJlKCd7Zm9vLGJhcn0sZm9vLGJhcix7Zm9vLGJhcn0nLCAnLCcpLCBbJ3tmb28sYmFyfScsICdmb28nLCAnYmFyJywgJ3tmb28sYmFyfSddKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5zcGxpdEdsb2JBd2FyZSgnW2ZvbyxiYXJdJywgJywnKSwgWydbZm9vLGJhcl0nXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnbG9iLnNwbGl0R2xvYkF3YXJlKCdmb28sYmFyLFtmb28sYmFyXScsICcsJyksIFsnZm9vJywgJ2JhcicsICdbZm9vLGJhcl0nXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnbG9iLnNwbGl0R2xvYkF3YXJlKCdbZm9vLGJhcl0sZm9vLGJhcixbZm9vLGJhcl0nLCAnLCcpLCBbJ1tmb28sYmFyXScsICdmb28nLCAnYmFyJywgJ1tmb28sYmFyXSddKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwcmVzc2lvbiB3aXRoIGRpc2FibGVkIGdsb2InLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZXhwciA9IHsgJyoqLyouanMnOiBmYWxzZSB9O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2goZXhwciwgJ2Zvby5qcycpLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwcmVzc2lvbiB3aXRoIHR3byBub24tdHJpdmlhIGdsb2JzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGV4cHIgPSB7XG5cdFx0XHQnKiovKi5qPyc6IHRydWUsXG5cdFx0XHQnKiovKi50Pyc6IHRydWVcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2goZXhwciwgJ2Zvby5qcycpLCAnKiovKi5qPycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKGV4cHIsICdmb28uYXMnKSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cHJlc3Npb24gd2l0aCBub24tdHJpdmlhIGdsb2IgKGlzc3VlIDE0NDQ1OCknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcGF0dGVybiA9ICcqKi9wKic7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5tYXRjaChwYXR0ZXJuLCAnZm9vL2JhcnAnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKHBhdHRlcm4sICdmb28vYmFyL2FwJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5tYXRjaChwYXR0ZXJuLCAnYXAnKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2gocGF0dGVybiwgJ2Zvby9iYXJwMScpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2gocGF0dGVybiwgJ2Zvby9iYXIvYXAxJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5tYXRjaChwYXR0ZXJuLCAnYXAxJyksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKHBhdHRlcm4sICcvZm9vL2JhcnAnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKHBhdHRlcm4sICcvZm9vL2Jhci9hcCcpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2gocGF0dGVybiwgJy9hcCcpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5tYXRjaChwYXR0ZXJuLCAnL2Zvby9iYXJwMScpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2gocGF0dGVybiwgJy9mb28vYmFyL2FwMScpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2gocGF0dGVybiwgJy9hcDEnKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2gocGF0dGVybiwgJ2Zvby9wYmFyJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKHBhdHRlcm4sICcvZm9vL3BiYXInKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2gocGF0dGVybiwgJ2Zvby9iYXIvcGEnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2gocGF0dGVybiwgJy9wJyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHByZXNzaW9uIHdpdGggZW1wdHkgZ2xvYicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBleHByID0geyAnJzogdHJ1ZSB9O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2goZXhwciwgJ2Zvby5qcycpLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwcmVzc2lvbiB3aXRoIG90aGVyIGZhbHN5IHZhbHVlJywgZnVuY3Rpb24gKCkge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnN0IGV4cHIgPSB7ICcqKi8qLmpzJzogMCB9IGFzIGFueTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKGV4cHIsICdmb28uanMnKSwgJyoqLyouanMnKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwcmVzc2lvbiB3aXRoIHR3byBiYXNlbmFtZSBnbG9icycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBleHByID0ge1xuXHRcdFx0JyoqL2Jhcic6IHRydWUsXG5cdFx0XHQnKiovYmF6JzogdHJ1ZVxuXHRcdH07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5tYXRjaChleHByLCAnYmFyJyksICcqKi9iYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5tYXRjaChleHByLCAnZm9vJyksIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKGV4cHIsICdmb28vYmFyJyksICcqKi9iYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5tYXRjaChleHByLCAnZm9vXFxcXGJhcicpLCAnKiovYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2goZXhwciwgJ2Zvby9mb28nKSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cHJlc3Npb24gd2l0aCB0d28gYmFzZW5hbWUgZ2xvYnMgYW5kIGEgc2libGluZ3MgZXhwcmVzc2lvbicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBleHByID0ge1xuXHRcdFx0JyoqL2Jhcic6IHRydWUsXG5cdFx0XHQnKiovYmF6JzogdHJ1ZSxcblx0XHRcdCcqKi8qLmpzJzogeyB3aGVuOiAnJChiYXNlbmFtZSkudHMnIH1cblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2libGluZ3MgPSBbJ2Zvby50cycsICdmb28uanMnLCAnZm9vJywgJ2JhciddO1xuXHRcdGNvbnN0IGhhc1NpYmxpbmcgPSAobmFtZTogc3RyaW5nKSA9PiBzaWJsaW5ncy5pbmRleE9mKG5hbWUpICE9PSAtMTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKGV4cHIpKCdiYXInLCB1bmRlZmluZWQsIGhhc1NpYmxpbmcpLCAnKiovYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoZXhwcikoJ2ZvbycsIHVuZGVmaW5lZCwgaGFzU2libGluZyksIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKGV4cHIpKCdmb28vYmFyJywgdW5kZWZpbmVkLCBoYXNTaWJsaW5nKSwgJyoqL2JhcicpO1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdC8vIGJhY2tzbGFzaCBpcyBhIHZhbGlkIGZpbGUgbmFtZSBjaGFyYWN0ZXIgb24gcG9zaXhcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKGV4cHIpKCdmb29cXFxcYmFyJywgdW5kZWZpbmVkLCBoYXNTaWJsaW5nKSwgJyoqL2JhcicpO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZShleHByKSgnZm9vL2ZvbycsIHVuZGVmaW5lZCwgaGFzU2libGluZyksIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKGV4cHIpKCdmb28uanMnLCB1bmRlZmluZWQsIGhhc1NpYmxpbmcpLCAnKiovKi5qcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKGV4cHIpKCdiYXIuanMnLCB1bmRlZmluZWQsIGhhc1NpYmxpbmcpLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwcmVzc2lvbiB3aXRoIG11bHRpcGUgYmFzZW5hbWUgZ2xvYnMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZXhwciA9IHtcblx0XHRcdCcqKi9iYXInOiB0cnVlLFxuXHRcdFx0J3sqKi9iYXosKiovZm9vfSc6IHRydWVcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2goZXhwciwgJ2JhcicpLCAnKiovYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2goZXhwciwgJ2ZvbycpLCAneyoqL2JheiwqKi9mb299Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2goZXhwciwgJ2JheicpLCAneyoqL2JheiwqKi9mb299Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2goZXhwciwgJ2FiYycpLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsc3kgZXhwcmVzc2lvbi9wYXR0ZXJuJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKG51bGwhLCAnZm9vJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5tYXRjaCgnJywgJ2ZvbycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UobnVsbCEpKCdmb28nKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCcnKSgnZm9vJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsc3kgcGF0aCcsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnZm9vJykobnVsbCEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJ2ZvbycpKCcnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCcqKi8qLmo/JykobnVsbCEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJyoqLyouaj8nKSgnJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnKiovKi5mb28nKShudWxsISksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnKiovKi5mb28nKSgnJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnKiovZm9vJykobnVsbCEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJyoqL2ZvbycpKCcnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCd7KiovYmF6LCoqL2Zvb30nKShudWxsISksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgneyoqL2JheiwqKi9mb299JykoJycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJ3sqKi8qLmJheiwqKi8qLmZvb30nKShudWxsISksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgneyoqLyouYmF6LCoqLyouZm9vfScpKCcnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHByZXNzaW9uL3BhdHRlcm4gYmFzZW5hbWUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJyoqL2ZvbycpKCdiYXIvYmF6JywgJ2JheicpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJyoqL2ZvbycpKCdiYXIvZm9vJywgJ2ZvbycpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCd7KiovYmF6LCoqL2Zvb30nKSgnYmF6L2JhcicsICdiYXInKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCd7KiovYmF6LCoqL2Zvb30nKSgnYmF6L2ZvbycsICdmb28nKSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBleHByID0geyAnKiovKi5qcyc6IHsgd2hlbjogJyQoYmFzZW5hbWUpLnRzJyB9IH07XG5cdFx0Y29uc3Qgc2libGluZ3MgPSBbJ2Zvby50cycsICdmb28uanMnXTtcblx0XHRjb25zdCBoYXNTaWJsaW5nID0gKG5hbWU6IHN0cmluZykgPT4gc2libGluZ3MuaW5kZXhPZihuYW1lKSAhPT0gLTE7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZShleHByKSgnYmFyL2Jhei5qcycsICdiYXouanMnLCBoYXNTaWJsaW5nKSwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoZXhwcikoJ2Jhci9mb28uanMnLCAnZm9vLmpzJywgaGFzU2libGluZyksICcqKi8qLmpzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cHJlc3Npb24vcGF0dGVybiBiYXNlbmFtZSB0ZXJtcycsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdsb2IuZ2V0QmFzZW5hbWVUZXJtcyhnbG9iLnBhcnNlKCcqKi8qLmZvbycpKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRCYXNlbmFtZVRlcm1zKGdsb2IucGFyc2UoJyoqL2ZvbycpKSwgWydmb28nXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnbG9iLmdldEJhc2VuYW1lVGVybXMoZ2xvYi5wYXJzZSgnKiovZm9vLycpKSwgWydmb28nXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnbG9iLmdldEJhc2VuYW1lVGVybXMoZ2xvYi5wYXJzZSgneyoqL2JheiwqKi9mb299JykpLCBbJ2JheicsICdmb28nXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnbG9iLmdldEJhc2VuYW1lVGVybXMoZ2xvYi5wYXJzZSgneyoqL2Jhei8sKiovZm9vL30nKSksIFsnYmF6JywgJ2ZvbyddKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRCYXNlbmFtZVRlcm1zKGdsb2IucGFyc2Uoe1xuXHRcdFx0JyoqL2Zvbyc6IHRydWUsXG5cdFx0XHQneyoqL2JhciwqKi9iYXp9JzogdHJ1ZSxcblx0XHRcdCd7KiovYmFyMi8sKiovYmF6Mi99JzogdHJ1ZSxcblx0XHRcdCcqKi9idWxiJzogZmFsc2Vcblx0XHR9KSksIFsnZm9vJywgJ2JhcicsICdiYXonLCAnYmFyMicsICdiYXoyJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRCYXNlbmFtZVRlcm1zKGdsb2IucGFyc2Uoe1xuXHRcdFx0JyoqL2Zvbyc6IHsgd2hlbjogJyQoYmFzZW5hbWUpLnppcCcgfSxcblx0XHRcdCcqKi9iYXInOiB0cnVlXG5cdFx0fSkpLCBbJ2JhciddKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwcmVzc2lvbi9wYXR0ZXJuIG9wdGltaXphdGlvbiBmb3IgYmFzZW5hbWVzJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRCYXNlbmFtZVRlcm1zKGdsb2IucGFyc2UoJyoqL2Zvby8qKicpKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRCYXNlbmFtZVRlcm1zKGdsb2IucGFyc2UoJyoqL2Zvby8qKicsIHsgdHJpbUZvckV4Y2x1c2lvbnM6IHRydWUgfSkpLCBbJ2ZvbyddKTtcblxuXHRcdHRlc3RPcHRpbWl6YXRpb25Gb3JCYXNlbmFtZXMoJyoqLyouZm9vLyoqJywgW10sIFtbJ2Jhei9iYXIuZm9vL2Jhci9iYXonLCB0cnVlXV0pO1xuXHRcdHRlc3RPcHRpbWl6YXRpb25Gb3JCYXNlbmFtZXMoJyoqL2Zvby8qKicsIFsnZm9vJ10sIFtbJ2Jhci9mb28nLCB0cnVlXSwgWydiYXIvZm9vL2JheicsIGZhbHNlXV0pO1xuXHRcdHRlc3RPcHRpbWl6YXRpb25Gb3JCYXNlbmFtZXMoJ3sqKi9iYXovKiosKiovZm9vLyoqfScsIFsnYmF6JywgJ2ZvbyddLCBbWydiYXIvYmF6JywgdHJ1ZV0sIFsnYmFyL2ZvbycsIHRydWVdXSk7XG5cblx0XHR0ZXN0T3B0aW1pemF0aW9uRm9yQmFzZW5hbWVzKHtcblx0XHRcdCcqKi9mb28vKionOiB0cnVlLFxuXHRcdFx0J3sqKi9iYXIvKiosKiovYmF6LyoqfSc6IHRydWUsXG5cdFx0XHQnKiovYnVsYi8qKic6IGZhbHNlXG5cdFx0fSwgWydmb28nLCAnYmFyJywgJ2JheiddLCBbXG5cdFx0XHRbJ2Jhci9mb28nLCAnKiovZm9vLyoqJ10sXG5cdFx0XHRbJ2Zvby9iYXInLCAneyoqL2Jhci8qKiwqKi9iYXovKip9J10sXG5cdFx0XHRbJ2Jhci9ub3BlJywgbnVsbCFdXG5cdFx0XSk7XG5cblx0XHRjb25zdCBzaWJsaW5ncyA9IFsnYmF6JywgJ2Jhei56aXAnLCAnbm9wZSddO1xuXHRcdGNvbnN0IGhhc1NpYmxpbmcgPSAobmFtZTogc3RyaW5nKSA9PiBzaWJsaW5ncy5pbmRleE9mKG5hbWUpICE9PSAtMTtcblx0XHR0ZXN0T3B0aW1pemF0aW9uRm9yQmFzZW5hbWVzKHtcblx0XHRcdCcqKi9mb28vKionOiB7IHdoZW46ICckKGJhc2VuYW1lKS56aXAnIH0sXG5cdFx0XHQnKiovYmFyLyoqJzogdHJ1ZVxuXHRcdH0sIFsnYmFyJ10sIFtcblx0XHRcdFsnYmFyL2ZvbycsIG51bGwhXSxcblx0XHRcdFsnYmFyL2Zvby9iYXonLCBudWxsIV0sXG5cdFx0XHRbJ2Jhci9mb28vbm9wZScsIG51bGwhXSxcblx0XHRcdFsnZm9vL2JhcicsICcqKi9iYXIvKionXSxcblx0XHRdLCBbXG5cdFx0XHRudWxsISxcblx0XHRcdGhhc1NpYmxpbmcsXG5cdFx0XHRoYXNTaWJsaW5nXG5cdFx0XSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHRlc3RPcHRpbWl6YXRpb25Gb3JCYXNlbmFtZXMocGF0dGVybjogc3RyaW5nIHwgZ2xvYi5JRXhwcmVzc2lvbiwgYmFzZW5hbWVUZXJtczogc3RyaW5nW10sIG1hdGNoZXM6IFtzdHJpbmcsIHN0cmluZyB8IGJvb2xlYW5dW10sIHNpYmxpbmdzRm5zOiAoKG5hbWU6IHN0cmluZykgPT4gYm9vbGVhbilbXSA9IFtdKSB7XG5cdFx0Y29uc3QgcGFyc2VkID0gZ2xvYi5wYXJzZSg8Z2xvYi5JRXhwcmVzc2lvbj5wYXR0ZXJuLCB7IHRyaW1Gb3JFeGNsdXNpb25zOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRCYXNlbmFtZVRlcm1zKHBhcnNlZCksIGJhc2VuYW1lVGVybXMpO1xuXHRcdG1hdGNoZXMuZm9yRWFjaCgoW3RleHQsIHJlc3VsdF0sIGkpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQodGV4dCwgbnVsbCEsIHNpYmxpbmdzRm5zW2ldKSwgcmVzdWx0KTtcblx0XHR9KTtcblx0fVxuXG5cdHRlc3QoJ3RyYWlsaW5nIHNsYXNoJywgZnVuY3Rpb24gKCkge1xuXHRcdC8vIFRlc3RpbmcgZXhpc3RpbmcgKG1vcmUgb3IgbGVzcyBpbnR1aXRpdmUpIGJlaGF2aW9yXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJyoqL2Zvby8nKSgnYmFyL2JheicsICdiYXonKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCcqKi9mb28vJykoJ2Jhci9mb28nLCAnZm9vJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCcqKi8qLmZvby8nKSgnYmFyL2ZpbGUuYmF6JywgJ2ZpbGUuYmF6JyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnKiovKi5mb28vJykoJ2Jhci9maWxlLmZvbycsICdmaWxlLmZvbycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgneyoqL2Zvby8sKiovYWJjL30nKSgnYmFyL2JheicsICdiYXonKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCd7KiovZm9vLywqKi9hYmMvfScpKCdiYXIvZm9vJywgJ2ZvbycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgneyoqL2Zvby8sKiovYWJjL30nKSgnYmFyL2FiYycsICdhYmMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJ3sqKi9mb28vLCoqL2FiYy99JywgeyB0cmltRm9yRXhjbHVzaW9uczogdHJ1ZSB9KSgnYmFyL2JheicsICdiYXonKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCd7KiovZm9vLywqKi9hYmMvfScsIHsgdHJpbUZvckV4Y2x1c2lvbnM6IHRydWUgfSkoJ2Jhci9mb28nLCAnZm9vJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCd7KiovZm9vLywqKi9hYmMvfScsIHsgdHJpbUZvckV4Y2x1c2lvbnM6IHRydWUgfSkoJ2Jhci9hYmMnLCAnYWJjJyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHByZXNzaW9uL3BhdHRlcm4gcGF0aCcsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnKiovZm9vL2JhcicpKG5hdGl2ZVNlcCgnZm9vL2JheicpLCAnYmF6JyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnKiovZm9vL2JhcicpKG5hdGl2ZVNlcCgnZm9vL2JhcicpLCAnYmFyJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCcqKi9mb28vYmFyJykobmF0aXZlU2VwKCdiYXIvZm9vL2JhcicpLCAnYmFyJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCcqKi9mb28vYmFyLyoqJykobmF0aXZlU2VwKCdiYXIvZm9vL2JhcicpLCAnYmFyJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCcqKi9mb28vYmFyLyoqJykobmF0aXZlU2VwKCdiYXIvZm9vL2Jhci9iYXonKSwgJ2JheicpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnKiovZm9vL2Jhci8qKicsIHsgdHJpbUZvckV4Y2x1c2lvbnM6IHRydWUgfSkobmF0aXZlU2VwKCdiYXIvZm9vL2JhcicpLCAnYmFyJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCcqKi9mb28vYmFyLyoqJywgeyB0cmltRm9yRXhjbHVzaW9uczogdHJ1ZSB9KShuYXRpdmVTZXAoJ2Jhci9mb28vYmFyL2JheicpLCAnYmF6JyksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCdmb28vYmFyJykobmF0aXZlU2VwKCdmb28vYmF6JyksICdiYXonKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCdmb28vYmFyJykobmF0aXZlU2VwKCdmb28vYmFyJyksICdiYXInKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJ2Zvby9iYXIvYmF6JykobmF0aXZlU2VwKCdmb28vYmFyL2JheicpLCAnYmF6JyksIHRydWUpOyAvLyAjMTU0MjRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnZm9vL2JhcicpKG5hdGl2ZVNlcCgnYmFyL2Zvby9iYXInKSwgJ2JhcicpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJ2Zvby9iYXIvKionKShuYXRpdmVTZXAoJ2Zvby9iYXIvYmF6JyksICdiYXonKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJ2Zvby9iYXIvKionLCB7IHRyaW1Gb3JFeGNsdXNpb25zOiB0cnVlIH0pKG5hdGl2ZVNlcCgnZm9vL2JhcicpLCAnYmFyJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCdmb28vYmFyLyoqJywgeyB0cmltRm9yRXhjbHVzaW9uczogdHJ1ZSB9KShuYXRpdmVTZXAoJ2Zvby9iYXIvYmF6JyksICdiYXonKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHByZXNzaW9uL3BhdHRlcm4gcGF0aHMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnbG9iLmdldFBhdGhUZXJtcyhnbG9iLnBhcnNlKCcqKi8qLmZvbycpKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRQYXRoVGVybXMoZ2xvYi5wYXJzZSgnKiovZm9vJykpLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnbG9iLmdldFBhdGhUZXJtcyhnbG9iLnBhcnNlKCcqKi9mb28vYmFyJykpLCBbJyovZm9vL2JhciddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdsb2IuZ2V0UGF0aFRlcm1zKGdsb2IucGFyc2UoJyoqL2Zvby9iYXIvJykpLCBbJyovZm9vL2JhciddKTtcblx0XHQvLyBOb3Qgc3VwcG9ydGVkXG5cdFx0Ly8gYXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnbG9iLmdldFBhdGhUZXJtcyhnbG9iLnBhcnNlKCd7KiovYmF6L2JhciwqKi9mb28vYmFyLCoqL2Jhcn0nKSksIFsnKi9iYXovYmFyJywgJyovZm9vL2JhciddKTtcblx0XHQvLyBhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdsb2IuZ2V0UGF0aFRlcm1zKGdsb2IucGFyc2UoJ3sqKi9iYXovYmFyLywqKi9mb28vYmFyLywqKi9iYXIvfScpKSwgWycqL2Jhei9iYXInLCAnKi9mb28vYmFyJ10pO1xuXG5cdFx0Y29uc3QgcGFyc2VkID0gZ2xvYi5wYXJzZSh7XG5cdFx0XHQnKiovZm9vL2Jhcic6IHRydWUsXG5cdFx0XHQnKiovZm9vMi9iYXIyJzogdHJ1ZSxcblx0XHRcdC8vIE5vdCBzdXBwb3J0ZWRcblx0XHRcdC8vICd7KiovYmFyL2ZvbywqKi9iYXovZm9vfSc6IHRydWUsXG5cdFx0XHQvLyAneyoqL2JhcjIvZm9vLywqKi9iYXoyL2Zvby99JzogdHJ1ZSxcblx0XHRcdCcqKi9idWxiJzogdHJ1ZSxcblx0XHRcdCcqKi9idWxiMic6IHRydWUsXG5cdFx0XHQnKiovYnVsYi9mb28nOiBmYWxzZVxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRQYXRoVGVybXMocGFyc2VkKSwgWycqL2Zvby9iYXInLCAnKi9mb28yL2JhcjInXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnbG9iLmdldEJhc2VuYW1lVGVybXMocGFyc2VkKSwgWydidWxiJywgJ2J1bGIyJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRQYXRoVGVybXMoZ2xvYi5wYXJzZSh7XG5cdFx0XHQnKiovZm9vL2Jhcic6IHsgd2hlbjogJyQoYmFzZW5hbWUpLnppcCcgfSxcblx0XHRcdCcqKi9iYXIvZm9vJzogdHJ1ZSxcblx0XHRcdCcqKi9iYXIyL2ZvbzInOiB0cnVlXG5cdFx0fSkpLCBbJyovYmFyL2ZvbycsICcqL2JhcjIvZm9vMiddKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwcmVzc2lvbi9wYXR0ZXJuIG9wdGltaXphdGlvbiBmb3IgcGF0aHMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnbG9iLmdldFBhdGhUZXJtcyhnbG9iLnBhcnNlKCcqKi9mb28vYmFyLyoqJykpLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnbG9iLmdldFBhdGhUZXJtcyhnbG9iLnBhcnNlKCcqKi9mb28vYmFyLyoqJywgeyB0cmltRm9yRXhjbHVzaW9uczogdHJ1ZSB9KSksIFsnKi9mb28vYmFyJ10pO1xuXG5cdFx0dGVzdE9wdGltaXphdGlvbkZvclBhdGhzKCcqKi8qLmZvby9iYXIvKionLCBbXSwgW1tuYXRpdmVTZXAoJ2Jhei9iYXIuZm9vL2Jhci9iYXonKSwgdHJ1ZV1dKTtcblx0XHR0ZXN0T3B0aW1pemF0aW9uRm9yUGF0aHMoJyoqL2Zvby9iYXIvKionLCBbJyovZm9vL2JhciddLCBbW25hdGl2ZVNlcCgnYmFyL2Zvby9iYXInKSwgdHJ1ZV0sIFtuYXRpdmVTZXAoJ2Jhci9mb28vYmFyL2JheicpLCBmYWxzZV1dKTtcblx0XHQvLyBOb3Qgc3VwcG9ydGVkXG5cdFx0Ly8gdGVzdE9wdGltaXphdGlvbkZvclBhdGhzKCd7KiovYmF6L2Jhci8qKiwqKi9mb28vYmFyLyoqfScsIFsnKi9iYXovYmFyJywgJyovZm9vL2JhciddLCBbW25hdGl2ZVNlcCgnYmFyL2Jhei9iYXInKSwgdHJ1ZV0sIFtuYXRpdmVTZXAoJ2Jhci9mb28vYmFyJyksIHRydWVdXSk7XG5cblx0XHR0ZXN0T3B0aW1pemF0aW9uRm9yUGF0aHMoe1xuXHRcdFx0JyoqL2Zvby9iYXIvKionOiB0cnVlLFxuXHRcdFx0Ly8gTm90IHN1cHBvcnRlZFxuXHRcdFx0Ly8gJ3sqKi9iYXIvYmFyLyoqLCoqL2Jhei9iYXIvKip9JzogdHJ1ZSxcblx0XHRcdCcqKi9idWxiL2Jhci8qKic6IGZhbHNlXG5cdFx0fSwgWycqL2Zvby9iYXInXSwgW1xuXHRcdFx0W25hdGl2ZVNlcCgnYmFyL2Zvby9iYXInKSwgJyoqL2Zvby9iYXIvKionXSxcblx0XHRcdC8vIE5vdCBzdXBwb3J0ZWRcblx0XHRcdC8vIFtuYXRpdmVTZXAoJ2Zvby9iYXIvYmFyJyksICd7KiovYmFyL2Jhci8qKiwqKi9iYXovYmFyLyoqfSddLFxuXHRcdFx0W25hdGl2ZVNlcCgnL2Zvby9iYXIvbm9wZScpLCBudWxsIV1cblx0XHRdKTtcblxuXHRcdGNvbnN0IHNpYmxpbmdzID0gWydiYXonLCAnYmF6LnppcCcsICdub3BlJ107XG5cdFx0Y29uc3QgaGFzU2libGluZyA9IChuYW1lOiBzdHJpbmcpID0+IHNpYmxpbmdzLmluZGV4T2YobmFtZSkgIT09IC0xO1xuXHRcdHRlc3RPcHRpbWl6YXRpb25Gb3JQYXRocyh7XG5cdFx0XHQnKiovZm9vLzEyMy8qKic6IHsgd2hlbjogJyQoYmFzZW5hbWUpLnppcCcgfSxcblx0XHRcdCcqKi9iYXIvMTIzLyoqJzogdHJ1ZVxuXHRcdH0sIFsnKi9iYXIvMTIzJ10sIFtcblx0XHRcdFtuYXRpdmVTZXAoJ2Jhci9mb28vMTIzJyksIG51bGwhXSxcblx0XHRcdFtuYXRpdmVTZXAoJ2Jhci9mb28vMTIzL2JheicpLCBudWxsIV0sXG5cdFx0XHRbbmF0aXZlU2VwKCdiYXIvZm9vLzEyMy9ub3BlJyksIG51bGwhXSxcblx0XHRcdFtuYXRpdmVTZXAoJ2Zvby9iYXIvMTIzJyksICcqKi9iYXIvMTIzLyoqJ10sXG5cdFx0XSwgW1xuXHRcdFx0bnVsbCEsXG5cdFx0XHRoYXNTaWJsaW5nLFxuXHRcdFx0aGFzU2libGluZ1xuXHRcdF0pO1xuXHR9KTtcblxuXHRmdW5jdGlvbiB0ZXN0T3B0aW1pemF0aW9uRm9yUGF0aHMocGF0dGVybjogc3RyaW5nIHwgZ2xvYi5JRXhwcmVzc2lvbiwgcGF0aFRlcm1zOiBzdHJpbmdbXSwgbWF0Y2hlczogW3N0cmluZywgc3RyaW5nIHwgYm9vbGVhbl1bXSwgc2libGluZ3NGbnM6ICgobmFtZTogc3RyaW5nKSA9PiBib29sZWFuKVtdID0gW10pIHtcblx0XHRjb25zdCBwYXJzZWQgPSBnbG9iLnBhcnNlKDxnbG9iLklFeHByZXNzaW9uPnBhdHRlcm4sIHsgdHJpbUZvckV4Y2x1c2lvbnM6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnbG9iLmdldFBhdGhUZXJtcyhwYXJzZWQpLCBwYXRoVGVybXMpO1xuXHRcdG1hdGNoZXMuZm9yRWFjaCgoW3RleHQsIHJlc3VsdF0sIGkpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQodGV4dCwgbnVsbCEsIHNpYmxpbmdzRm5zW2ldKSwgcmVzdWx0KTtcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIG5hdGl2ZVNlcChzbGFzaFBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHNsYXNoUGF0aC5yZXBsYWNlKC9cXC8vZywgc2VwKTtcblx0fVxuXG5cdHRlc3QoJ3JlbGF0aXZlIHBhdHRlcm4gLSBnbG9iIHN0YXInLCBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0Y29uc3QgcDogZ2xvYi5JUmVsYXRpdmVQYXR0ZXJuID0geyBiYXNlOiAnQzpcXFxcRE5YQ29uc29sZUFwcFxcXFxmb28nLCBwYXR0ZXJuOiAnKiovKi5jcycgfTtcblx0XHRcdGFzc2VydEdsb2JNYXRjaChwLCAnQzpcXFxcRE5YQ29uc29sZUFwcFxcXFxmb29cXFxcUHJvZ3JhbS5jcycpO1xuXHRcdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXGZvb1xcXFxiYXJcXFxcUHJvZ3JhbS5jcycpO1xuXHRcdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ0M6XFxcXEROWENvbnNvbGVBcHBcXFxcZm9vXFxcXFByb2dyYW0udHMnKTtcblx0XHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXFByb2dyYW0uY3MnKTtcblx0XHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdDOlxcXFxvdGhlclxcXFxETlhDb25zb2xlQXBwXFxcXGZvb1xcXFxQcm9ncmFtLnRzJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHA6IGdsb2IuSVJlbGF0aXZlUGF0dGVybiA9IHsgYmFzZTogJy9ETlhDb25zb2xlQXBwL2ZvbycsIHBhdHRlcm46ICcqKi8qLmNzJyB9O1xuXHRcdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvRE5YQ29uc29sZUFwcC9mb28vUHJvZ3JhbS5jcycpO1xuXHRcdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvRE5YQ29uc29sZUFwcC9mb28vYmFyL1Byb2dyYW0uY3MnKTtcblx0XHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvRE5YQ29uc29sZUFwcC9mb28vUHJvZ3JhbS50cycpO1xuXHRcdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy9ETlhDb25zb2xlQXBwL1Byb2dyYW0uY3MnKTtcblx0XHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvb3RoZXIvRE5YQ29uc29sZUFwcC9mb28vUHJvZ3JhbS50cycpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVsYXRpdmUgcGF0dGVybiAtIHNpbmdsZSBzdGFyJywgZnVuY3Rpb24gKCkge1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGNvbnN0IHA6IGdsb2IuSVJlbGF0aXZlUGF0dGVybiA9IHsgYmFzZTogJ0M6XFxcXEROWENvbnNvbGVBcHBcXFxcZm9vJywgcGF0dGVybjogJyouY3MnIH07XG5cdFx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ0M6XFxcXEROWENvbnNvbGVBcHBcXFxcZm9vXFxcXFByb2dyYW0uY3MnKTtcblx0XHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXGZvb1xcXFxiYXJcXFxcUHJvZ3JhbS5jcycpO1xuXHRcdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ0M6XFxcXEROWENvbnNvbGVBcHBcXFxcZm9vXFxcXFByb2dyYW0udHMnKTtcblx0XHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXFByb2dyYW0uY3MnKTtcblx0XHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdDOlxcXFxvdGhlclxcXFxETlhDb25zb2xlQXBwXFxcXGZvb1xcXFxQcm9ncmFtLnRzJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHA6IGdsb2IuSVJlbGF0aXZlUGF0dGVybiA9IHsgYmFzZTogJy9ETlhDb25zb2xlQXBwL2ZvbycsIHBhdHRlcm46ICcqLmNzJyB9O1xuXHRcdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvRE5YQ29uc29sZUFwcC9mb28vUHJvZ3JhbS5jcycpO1xuXHRcdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy9ETlhDb25zb2xlQXBwL2Zvby9iYXIvUHJvZ3JhbS5jcycpO1xuXHRcdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy9ETlhDb25zb2xlQXBwL2Zvby9Qcm9ncmFtLnRzJyk7XG5cdFx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL0ROWENvbnNvbGVBcHAvUHJvZ3JhbS5jcycpO1xuXHRcdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy9vdGhlci9ETlhDb25zb2xlQXBwL2Zvby9Qcm9ncmFtLnRzJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZWxhdGl2ZSBwYXR0ZXJuIC0gc2luZ2xlIHN0YXIgd2l0aCBwYXRoJywgZnVuY3Rpb24gKCkge1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGNvbnN0IHA6IGdsb2IuSVJlbGF0aXZlUGF0dGVybiA9IHsgYmFzZTogJ0M6XFxcXEROWENvbnNvbGVBcHBcXFxcZm9vJywgcGF0dGVybjogJ3NvbWV0aGluZy8qLmNzJyB9O1xuXHRcdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXGZvb1xcXFxzb21ldGhpbmdcXFxcUHJvZ3JhbS5jcycpO1xuXHRcdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ0M6XFxcXEROWENvbnNvbGVBcHBcXFxcZm9vXFxcXFByb2dyYW0uY3MnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcDogZ2xvYi5JUmVsYXRpdmVQYXR0ZXJuID0geyBiYXNlOiAnL0ROWENvbnNvbGVBcHAvZm9vJywgcGF0dGVybjogJ3NvbWV0aGluZy8qLmNzJyB9O1xuXHRcdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvRE5YQ29uc29sZUFwcC9mb28vc29tZXRoaW5nL1Byb2dyYW0uY3MnKTtcblx0XHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvRE5YQ29uc29sZUFwcC9mb28vUHJvZ3JhbS5jcycpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVsYXRpdmUgcGF0dGVybiAtIHNpbmdsZSBzdGFyIGFsb25lJywgZnVuY3Rpb24gKCkge1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGNvbnN0IHA6IGdsb2IuSVJlbGF0aXZlUGF0dGVybiA9IHsgYmFzZTogJ0M6XFxcXEROWENvbnNvbGVBcHBcXFxcZm9vXFxcXHNvbWV0aGluZ1xcXFxQcm9ncmFtLmNzJywgcGF0dGVybjogJyonIH07XG5cdFx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ0M6XFxcXEROWENvbnNvbGVBcHBcXFxcZm9vXFxcXHNvbWV0aGluZ1xcXFxQcm9ncmFtLmNzJyk7XG5cdFx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnQzpcXFxcRE5YQ29uc29sZUFwcFxcXFxmb29cXFxcUHJvZ3JhbS5jcycpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBwOiBnbG9iLklSZWxhdGl2ZVBhdHRlcm4gPSB7IGJhc2U6ICcvRE5YQ29uc29sZUFwcC9mb28vc29tZXRoaW5nL1Byb2dyYW0uY3MnLCBwYXR0ZXJuOiAnKicgfTtcblx0XHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL0ROWENvbnNvbGVBcHAvZm9vL3NvbWV0aGluZy9Qcm9ncmFtLmNzJyk7XG5cdFx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL0ROWENvbnNvbGVBcHAvZm9vL1Byb2dyYW0uY3MnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbGF0aXZlIHBhdHRlcm4gLSBpZ25vcmVzIGNhc2Ugb24gbWFjT1MvV2luZG93cycsIGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRjb25zdCBwOiBnbG9iLklSZWxhdGl2ZVBhdHRlcm4gPSB7IGJhc2U6ICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXGZvbycsIHBhdHRlcm46ICdzb21ldGhpbmcvKi5jcycgfTtcblx0XHRcdGFzc2VydEdsb2JNYXRjaChwLCAnQzpcXFxcRE5YQ29uc29sZUFwcFxcXFxmb29cXFxcc29tZXRoaW5nXFxcXFByb2dyYW0uY3MnLnRvTG93ZXJDYXNlKCkpO1xuXHRcdH0gZWxzZSBpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdGNvbnN0IHA6IGdsb2IuSVJlbGF0aXZlUGF0dGVybiA9IHsgYmFzZTogJy9ETlhDb25zb2xlQXBwL2ZvbycsIHBhdHRlcm46ICdzb21ldGhpbmcvKi5jcycgfTtcblx0XHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL0ROWENvbnNvbGVBcHAvZm9vL3NvbWV0aGluZy9Qcm9ncmFtLmNzJy50b0xvd2VyQ2FzZSgpKTtcblx0XHR9IGVsc2UgaWYgKGlzTGludXgpIHtcblx0XHRcdGNvbnN0IHA6IGdsb2IuSVJlbGF0aXZlUGF0dGVybiA9IHsgYmFzZTogJy9ETlhDb25zb2xlQXBwL2ZvbycsIHBhdHRlcm46ICdzb21ldGhpbmcvKi5jcycgfTtcblx0XHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvRE5YQ29uc29sZUFwcC9mb28vc29tZXRoaW5nL1Byb2dyYW0uY3MnLnRvTG93ZXJDYXNlKCkpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVsYXRpdmUgcGF0dGVybiAtIHRyYWlsaW5nIHNsYXNoIC8gYmFja3NsYXNoICgjMTYyNDk4KScsIGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRsZXQgcDogZ2xvYi5JUmVsYXRpdmVQYXR0ZXJuID0geyBiYXNlOiAnQzpcXFxcJywgcGF0dGVybjogJ2Zvby5jcycgfTtcblx0XHRcdGFzc2VydEdsb2JNYXRjaChwLCAnQzpcXFxcZm9vLmNzJyk7XG5cblx0XHRcdHAgPSB7IGJhc2U6ICdDOlxcXFxiYXJcXFxcJywgcGF0dGVybjogJ2Zvby5jcycgfTtcblx0XHRcdGFzc2VydEdsb2JNYXRjaChwLCAnQzpcXFxcYmFyXFxcXGZvby5jcycpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgcDogZ2xvYi5JUmVsYXRpdmVQYXR0ZXJuID0geyBiYXNlOiAnLycsIHBhdHRlcm46ICdmb28uY3MnIH07XG5cdFx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9mb28uY3MnKTtcblxuXHRcdFx0cCA9IHsgYmFzZTogJy9iYXIvJywgcGF0dGVybjogJ2Zvby5jcycgfTtcblx0XHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL2Jhci9mb28uY3MnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3BhdHRlcm4gd2l0aCBcImJhc2VcIiBkb2VzIG5vdCBleHBsb2RlIC0gIzM2MDgxJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydC5vayhnbG9iLm1hdGNoKHsgJ2Jhc2UnOiB0cnVlIH0sICdiYXNlJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWxhdGl2ZSBwYXR0ZXJuIC0gIzU3NDc1JywgZnVuY3Rpb24gKCkge1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGNvbnN0IHA6IGdsb2IuSVJlbGF0aXZlUGF0dGVybiA9IHsgYmFzZTogJ0M6XFxcXEROWENvbnNvbGVBcHBcXFxcZm9vJywgcGF0dGVybjogJ3N0eWxlcy9zdHlsZS5jc3MnIH07XG5cdFx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ0M6XFxcXEROWENvbnNvbGVBcHBcXFxcZm9vXFxcXHN0eWxlc1xcXFxzdHlsZS5jc3MnKTtcblx0XHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXGZvb1xcXFxQcm9ncmFtLmNzJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHA6IGdsb2IuSVJlbGF0aXZlUGF0dGVybiA9IHsgYmFzZTogJy9ETlhDb25zb2xlQXBwL2ZvbycsIHBhdHRlcm46ICdzdHlsZXMvc3R5bGUuY3NzJyB9O1xuXHRcdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvRE5YQ29uc29sZUFwcC9mb28vc3R5bGVzL3N0eWxlLmNzcycpO1xuXHRcdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy9ETlhDb25zb2xlQXBwL2Zvby9Qcm9ncmFtLmNzJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdVUkkgbWF0Y2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcCA9ICdzY2hlbWU6LyoqLyoubWQnO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCBVUkkuZmlsZSgnc3VwZXIvZHVwZXIvbG9uZy9zb21lL2ZpbGUubWQnKS53aXRoKHsgc2NoZW1lOiAnc2NoZW1lJyB9KS50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwcmVzc2lvbiBmYWlscyB3aGVuIHNpYmxpbmdzIHVzZSBwcm9taXNlcyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE0NjI5NCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2libGluZ3MgPSBbJ3Rlc3QuaHRtbCcsICd0ZXN0LnR4dCcsICd0ZXN0LnRzJ107XG5cdFx0Y29uc3QgaGFzU2libGluZyA9IChuYW1lOiBzdHJpbmcpID0+IFByb21pc2UucmVzb2x2ZShzaWJsaW5ncy5pbmRleE9mKG5hbWUpICE9PSAtMSk7XG5cblx0XHQvLyB7IFwiKiovKi5qc1wiOiB7IFwid2hlblwiOiBcIiQoYmFzZW5hbWUpLnRzXCIgfSB9XG5cdFx0Y29uc3QgZXhwcmVzc2lvbjogZ2xvYi5JRXhwcmVzc2lvbiA9IHtcblx0XHRcdCcqKi90ZXN0LmpzJzogeyB3aGVuOiAnJChiYXNlbmFtZSkuanMnIH0sXG5cdFx0XHQnKiovKi5qcyc6IHsgd2hlbjogJyQoYmFzZW5hbWUpLnRzJyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHBhcnNlZEV4cHJlc3Npb24gPSBnbG9iLnBhcnNlKGV4cHJlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCcqKi8qLmpzJywgYXdhaXQgcGFyc2VkRXhwcmVzc2lvbigndGVzdC5qcycsIHVuZGVmaW5lZCwgaGFzU2libGluZykpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXR0ZXJuc0VxdWFscycsICgpID0+IHtcblx0XHRhc3NlcnQub2soZ2xvYi5wYXR0ZXJuc0VxdWFscyhbJ2EnXSwgWydhJ10pKTtcblx0XHRhc3NlcnQub2soIWdsb2IucGF0dGVybnNFcXVhbHMoWydhJ10sIFsnYiddKSk7XG5cblx0XHRhc3NlcnQub2soZ2xvYi5wYXR0ZXJuc0VxdWFscyhbJ2EnLCAnYicsICdjJ10sIFsnYScsICdiJywgJ2MnXSkpO1xuXHRcdGFzc2VydC5vayghZ2xvYi5wYXR0ZXJuc0VxdWFscyhbJzEnLCAnMiddLCBbJzEnLCAnMyddKSk7XG5cblx0XHRhc3NlcnQub2soZ2xvYi5wYXR0ZXJuc0VxdWFscyhbeyBiYXNlOiAnYScsIHBhdHRlcm46ICcqJyB9LCAnYicsICdjJ10sIFt7IGJhc2U6ICdhJywgcGF0dGVybjogJyonIH0sICdiJywgJ2MnXSkpO1xuXG5cdFx0YXNzZXJ0Lm9rKGdsb2IucGF0dGVybnNFcXVhbHModW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQub2soIWdsb2IucGF0dGVybnNFcXVhbHModW5kZWZpbmVkLCBbJ2InXSkpO1xuXHRcdGFzc2VydC5vayghZ2xvYi5wYXR0ZXJuc0VxdWFscyhbJ2EnXSwgdW5kZWZpbmVkKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzRW1wdHlQYXR0ZXJuJywgKCkgPT4ge1xuXHRcdGFzc2VydC5vayhnbG9iLmlzRW1wdHlQYXR0ZXJuKGdsb2IucGFyc2UoJycpKSk7XG5cdFx0YXNzZXJ0Lm9rKGdsb2IuaXNFbXB0eVBhdHRlcm4oZ2xvYi5wYXJzZSh1bmRlZmluZWQhKSkpO1xuXHRcdGFzc2VydC5vayhnbG9iLmlzRW1wdHlQYXR0ZXJuKGdsb2IucGFyc2UobnVsbCEpKSk7XG5cblx0XHRhc3NlcnQub2soZ2xvYi5pc0VtcHR5UGF0dGVybihnbG9iLnBhcnNlKHt9KSkpO1xuXHRcdGFzc2VydC5vayhnbG9iLmlzRW1wdHlQYXR0ZXJuKGdsb2IucGFyc2UoeyAnJzogdHJ1ZSB9KSkpO1xuXHRcdGFzc2VydC5vayhnbG9iLmlzRW1wdHlQYXR0ZXJuKGdsb2IucGFyc2UoeyAnKiovKi5qcyc6IGZhbHNlIH0pKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nhc2VJbnNlbnNpdGl2ZU1hdGNoJywgKCkgPT4ge1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKCdQQVRIL0ZPTy5qcycsICdwYXRoL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaCgnUEFUSC9GT08uanMnLCAncGF0aC9mb28uanMnLCB0cnVlKTtcblx0XHQvLyBUMVxuXHRcdGFzc2VydE5vR2xvYk1hdGNoKCcqKi8qLkpTJywgJ2Jhci9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2goJyoqLyouSlMnLCAnYmFyL2Zvby5qcycsIHRydWUpO1xuXHRcdC8vIFQyXG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2goJyoqL3BhY2thZ2UnLCAnYmFyL1BhY2thZ2UnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2goJyoqL3BhY2thZ2UnLCAnYmFyL1BhY2thZ2UnLCB0cnVlKTtcblx0XHQvLyBUM1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKCd7KiovKi5KUywqKi8qLlRTfScsICdiYXIvZm9vLnRzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2goJ3sqKi8qLkpTLCoqLyouVFN9JywgJ2Jhci9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2goJ3sqKi8qLkpTLCoqLyouVFN9JywgJ2Jhci9mb28udHMnLCB0cnVlKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2goJ3sqKi8qLkpTLCoqLyouVFN9JywgJ2Jhci9mb28uanMnLCB0cnVlKTtcblx0XHQvLyBUNFxuXHRcdGFzc2VydE5vR2xvYk1hdGNoKCcqKi9GT08vQmFyJywgJ2Jhci9mb28vYmFyJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKCcqKi9GT08vQmFyJywgJ2Jhci9mb28vYmFyJywgdHJ1ZSk7XG5cdFx0Ly8gVDVcblx0XHRhc3NlcnROb0dsb2JNYXRjaCgnRk9PL0JhcicsICdmb28vYmFyJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKCdGT08vQmFyJywgJ2Zvby9iYXInLCB0cnVlKTtcblx0XHQvLyBPdGhlclxuXHRcdGFzc2VydE5vR2xvYk1hdGNoKCdzb21lLyovUmFuZG9tLyovUGF0aC5GSUxFJywgJ3NvbWUvdmVyeS9yYW5kb20vdW51c3VhbC9wYXRoLmZpbGUnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2goJ3NvbWUvKi9SYW5kb20vKi9QYXRoLkZJTEUnLCAnc29tZS92ZXJ5L3JhbmRvbS91bnVzdWFsL3BhdGguZmlsZScsIHRydWUpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFlBQVksVUFBVTtBQUN0QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxTQUFTLGFBQWEsaUJBQWlCO0FBQ2hELFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUV4RCxNQUFNLFFBQVEsTUFBTTtBQXNEbkIsV0FBUyxn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
