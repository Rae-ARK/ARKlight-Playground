import assert from "assert";
import * as path from "../../common/path.js";
import { isWeb, isWindows } from "../../common/platform.js";
import * as process from "../../common/process.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("Paths (Node Implementation)", () => {
  const __filename = "path.test.js";
  ensureNoDisposablesAreLeakedInTestSuite();
  test("join", () => {
    const failures = [];
    const backslashRE = /\\/g;
    const joinTests = [
      [
        [path.posix.join, path.win32.join],
        // arguments                     result
        [
          [[".", "x/b", "..", "/b/c.js"], "x/b/c.js"],
          [[], "."],
          [["/.", "x/b", "..", "/b/c.js"], "/x/b/c.js"],
          [["/foo", "../../../bar"], "/bar"],
          [["foo", "../../../bar"], "../../bar"],
          [["foo/", "../../../bar"], "../../bar"],
          [["foo/x", "../../../bar"], "../bar"],
          [["foo/x", "./bar"], "foo/x/bar"],
          [["foo/x/", "./bar"], "foo/x/bar"],
          [["foo/x/", ".", "bar"], "foo/x/bar"],
          [["./"], "./"],
          [[".", "./"], "./"],
          [[".", ".", "."], "."],
          [[".", "./", "."], "."],
          [[".", "/./", "."], "."],
          [[".", "/////./", "."], "."],
          [["."], "."],
          [["", "."], "."],
          [["", "foo"], "foo"],
          [["foo", "/bar"], "foo/bar"],
          [["", "/foo"], "/foo"],
          [["", "", "/foo"], "/foo"],
          [["", "", "foo"], "foo"],
          [["foo", ""], "foo"],
          [["foo/", ""], "foo/"],
          [["foo", "", "/bar"], "foo/bar"],
          [["./", "..", "/foo"], "../foo"],
          [["./", "..", "..", "/foo"], "../../foo"],
          [[".", "..", "..", "/foo"], "../../foo"],
          [["", "..", "..", "/foo"], "../../foo"],
          [["/"], "/"],
          [["/", "."], "/"],
          [["/", ".."], "/"],
          [["/", "..", ".."], "/"],
          [[""], "."],
          [["", ""], "."],
          [[" /foo"], " /foo"],
          [[" ", "foo"], " /foo"],
          [[" ", "."], " "],
          [[" ", "/"], " /"],
          [[" ", ""], " "],
          [["/", "foo"], "/foo"],
          [["/", "/foo"], "/foo"],
          [["/", "//foo"], "/foo"],
          [["/", "", "/foo"], "/foo"],
          [["", "/", "foo"], "/foo"],
          [["", "/", "/foo"], "/foo"]
        ]
      ]
    ];
    joinTests.push([
      path.win32.join,
      joinTests[0][1].slice(0).concat(
        [
          // arguments                     result
          // UNC path expected
          [["//foo/bar"], "\\\\foo\\bar\\"],
          [["\\/foo/bar"], "\\\\foo\\bar\\"],
          [["\\\\foo/bar"], "\\\\foo\\bar\\"],
          // UNC path expected - server and share separate
          [["//foo", "bar"], "\\\\foo\\bar\\"],
          [["//foo/", "bar"], "\\\\foo\\bar\\"],
          [["//foo", "/bar"], "\\\\foo\\bar\\"],
          // UNC path expected - questionable
          [["//foo", "", "bar"], "\\\\foo\\bar\\"],
          [["//foo/", "", "bar"], "\\\\foo\\bar\\"],
          [["//foo/", "", "/bar"], "\\\\foo\\bar\\"],
          // UNC path expected - even more questionable
          [["", "//foo", "bar"], "\\\\foo\\bar\\"],
          [["", "//foo/", "bar"], "\\\\foo\\bar\\"],
          [["", "//foo/", "/bar"], "\\\\foo\\bar\\"],
          // No UNC path expected (no double slash in first component)
          [["\\", "foo/bar"], "\\foo\\bar"],
          [["\\", "/foo/bar"], "\\foo\\bar"],
          [["", "/", "/foo/bar"], "\\foo\\bar"],
          // No UNC path expected (no non-slashes in first component -
          // questionable)
          [["//", "foo/bar"], "\\foo\\bar"],
          [["//", "/foo/bar"], "\\foo\\bar"],
          [["\\\\", "/", "/foo/bar"], "\\foo\\bar"],
          [["//"], "\\"],
          // No UNC path expected (share name missing - questionable).
          [["//foo"], "\\foo"],
          [["//foo/"], "\\foo\\"],
          [["//foo", "/"], "\\foo\\"],
          [["//foo", "", "/"], "\\foo\\"],
          // No UNC path expected (too many leading slashes - questionable)
          [["///foo/bar"], "\\foo\\bar"],
          [["////foo", "bar"], "\\foo\\bar"],
          [["\\\\\\/foo/bar"], "\\foo\\bar"],
          // Drive-relative vs drive-absolute paths. This merely describes the
          // status quo, rather than being obviously right
          [["c:"], "c:."],
          [["c:."], "c:."],
          [["c:", ""], "c:."],
          [["", "c:"], "c:."],
          [["c:.", "/"], "c:.\\"],
          [["c:.", "file"], "c:file"],
          [["c:", "/"], "c:\\"],
          [["c:", "file"], "c:\\file"]
        ]
      )
    ]);
    joinTests.forEach((test2) => {
      if (!Array.isArray(test2[0])) {
        test2[0] = [test2[0]];
      }
      test2[0].forEach((join) => {
        test2[1].forEach((test3) => {
          const actual = join.apply(null, test3[0]);
          const expected = test3[1];
          let actualAlt;
          let os;
          if (join === path.win32.join) {
            actualAlt = actual.replace(backslashRE, "/");
            os = "win32";
          } else {
            os = "posix";
          }
          const message = `path.${os}.join(${test3[0].map(JSON.stringify).join(",")})
  expect=${JSON.stringify(expected)}
  actual=${JSON.stringify(actual)}`;
          if (actual !== expected && actualAlt !== expected) {
            failures.push(`
${message}`);
          }
        });
      });
    });
    assert.strictEqual(failures.length, 0, failures.join(""));
  });
  test("dirname", () => {
    assert.strictEqual(path.posix.dirname("/a/b/"), "/a");
    assert.strictEqual(path.posix.dirname("/a/b"), "/a");
    assert.strictEqual(path.posix.dirname("/a"), "/");
    assert.strictEqual(path.posix.dirname(""), ".");
    assert.strictEqual(path.posix.dirname("/"), "/");
    assert.strictEqual(path.posix.dirname("////"), "/");
    assert.strictEqual(path.posix.dirname("//a"), "//");
    assert.strictEqual(path.posix.dirname("foo"), ".");
    assert.strictEqual(path.win32.dirname("c:\\"), "c:\\");
    assert.strictEqual(path.win32.dirname("c:\\foo"), "c:\\");
    assert.strictEqual(path.win32.dirname("c:\\foo\\"), "c:\\");
    assert.strictEqual(path.win32.dirname("c:\\foo\\bar"), "c:\\foo");
    assert.strictEqual(path.win32.dirname("c:\\foo\\bar\\"), "c:\\foo");
    assert.strictEqual(path.win32.dirname("c:\\foo\\bar\\baz"), "c:\\foo\\bar");
    assert.strictEqual(path.win32.dirname("\\"), "\\");
    assert.strictEqual(path.win32.dirname("\\foo"), "\\");
    assert.strictEqual(path.win32.dirname("\\foo\\"), "\\");
    assert.strictEqual(path.win32.dirname("\\foo\\bar"), "\\foo");
    assert.strictEqual(path.win32.dirname("\\foo\\bar\\"), "\\foo");
    assert.strictEqual(path.win32.dirname("\\foo\\bar\\baz"), "\\foo\\bar");
    assert.strictEqual(path.win32.dirname("c:"), "c:");
    assert.strictEqual(path.win32.dirname("c:foo"), "c:");
    assert.strictEqual(path.win32.dirname("c:foo\\"), "c:");
    assert.strictEqual(path.win32.dirname("c:foo\\bar"), "c:foo");
    assert.strictEqual(path.win32.dirname("c:foo\\bar\\"), "c:foo");
    assert.strictEqual(path.win32.dirname("c:foo\\bar\\baz"), "c:foo\\bar");
    assert.strictEqual(path.win32.dirname("file:stream"), ".");
    assert.strictEqual(path.win32.dirname("dir\\file:stream"), "dir");
    assert.strictEqual(
      path.win32.dirname("\\\\unc\\share"),
      "\\\\unc\\share"
    );
    assert.strictEqual(
      path.win32.dirname("\\\\unc\\share\\foo"),
      "\\\\unc\\share\\"
    );
    assert.strictEqual(
      path.win32.dirname("\\\\unc\\share\\foo\\"),
      "\\\\unc\\share\\"
    );
    assert.strictEqual(
      path.win32.dirname("\\\\unc\\share\\foo\\bar"),
      "\\\\unc\\share\\foo"
    );
    assert.strictEqual(
      path.win32.dirname("\\\\unc\\share\\foo\\bar\\"),
      "\\\\unc\\share\\foo"
    );
    assert.strictEqual(
      path.win32.dirname("\\\\unc\\share\\foo\\bar\\baz"),
      "\\\\unc\\share\\foo\\bar"
    );
    assert.strictEqual(path.win32.dirname("/a/b/"), "/a");
    assert.strictEqual(path.win32.dirname("/a/b"), "/a");
    assert.strictEqual(path.win32.dirname("/a"), "/");
    assert.strictEqual(path.win32.dirname(""), ".");
    assert.strictEqual(path.win32.dirname("/"), "/");
    assert.strictEqual(path.win32.dirname("////"), "/");
    assert.strictEqual(path.win32.dirname("foo"), ".");
    function assertDirname(p, expected, win = false) {
      const actual = win ? path.win32.dirname(p) : path.posix.dirname(p);
      if (actual !== expected) {
        assert.fail(`${p}: expected: ${expected}, ours: ${actual}`);
      }
    }
    assertDirname("foo/bar", "foo");
    assertDirname("foo\\bar", "foo", true);
    assertDirname("/foo/bar", "/foo");
    assertDirname("\\foo\\bar", "\\foo", true);
    assertDirname("/foo", "/");
    assertDirname("\\foo", "\\", true);
    assertDirname("/", "/");
    assertDirname("\\", "\\", true);
    assertDirname("foo", ".");
    assertDirname("f", ".");
    assertDirname("f/", ".");
    assertDirname("/folder/", "/");
    assertDirname("c:\\some\\file.txt", "c:\\some", true);
    assertDirname("c:\\some", "c:\\", true);
    assertDirname("c:\\", "c:\\", true);
    assertDirname("c:", "c:", true);
    assertDirname("\\\\server\\share\\some\\path", "\\\\server\\share\\some", true);
    assertDirname("\\\\server\\share\\some", "\\\\server\\share\\", true);
    assertDirname("\\\\server\\share\\", "\\\\server\\share\\", true);
  });
  test("extname", () => {
    const failures = [];
    const slashRE = /\//g;
    [
      [__filename, ".js"],
      ["", ""],
      ["/path/to/file", ""],
      ["/path/to/file.ext", ".ext"],
      ["/path.to/file.ext", ".ext"],
      ["/path.to/file", ""],
      ["/path.to/.file", ""],
      ["/path.to/.file.ext", ".ext"],
      ["/path/to/f.ext", ".ext"],
      ["/path/to/..ext", ".ext"],
      ["/path/to/..", ""],
      ["file", ""],
      ["file.ext", ".ext"],
      [".file", ""],
      [".file.ext", ".ext"],
      ["/file", ""],
      ["/file.ext", ".ext"],
      ["/.file", ""],
      ["/.file.ext", ".ext"],
      [".path/file.ext", ".ext"],
      ["file.ext.ext", ".ext"],
      ["file.", "."],
      [".", ""],
      ["./", ""],
      [".file.ext", ".ext"],
      [".file", ""],
      [".file.", "."],
      [".file..", "."],
      ["..", ""],
      ["../", ""],
      ["..file.ext", ".ext"],
      ["..file", ".file"],
      ["..file.", "."],
      ["..file..", "."],
      ["...", "."],
      ["...ext", ".ext"],
      ["....", "."],
      ["file.ext/", ".ext"],
      ["file.ext//", ".ext"],
      ["file/", ""],
      ["file//", ""],
      ["file./", "."],
      ["file.//", "."]
    ].forEach((test2) => {
      const expected = test2[1];
      [path.posix.extname, path.win32.extname].forEach((extname) => {
        let input = test2[0];
        let os;
        if (extname === path.win32.extname) {
          input = input.replace(slashRE, "\\");
          os = "win32";
        } else {
          os = "posix";
        }
        const actual = extname(input);
        const message = `path.${os}.extname(${JSON.stringify(input)})
  expect=${JSON.stringify(expected)}
  actual=${JSON.stringify(actual)}`;
        if (actual !== expected) {
          failures.push(`
${message}`);
        }
      });
      {
        const input = `C:${test2[0].replace(slashRE, "\\")}`;
        const actual = path.win32.extname(input);
        const message = `path.win32.extname(${JSON.stringify(input)})
  expect=${JSON.stringify(expected)}
  actual=${JSON.stringify(actual)}`;
        if (actual !== expected) {
          failures.push(`
${message}`);
        }
      }
    });
    assert.strictEqual(failures.length, 0, failures.join(""));
    assert.strictEqual(path.win32.extname(".\\"), "");
    assert.strictEqual(path.win32.extname("..\\"), "");
    assert.strictEqual(path.win32.extname("file.ext\\"), ".ext");
    assert.strictEqual(path.win32.extname("file.ext\\\\"), ".ext");
    assert.strictEqual(path.win32.extname("file\\"), "");
    assert.strictEqual(path.win32.extname("file\\\\"), "");
    assert.strictEqual(path.win32.extname("file.\\"), ".");
    assert.strictEqual(path.win32.extname("file.\\\\"), ".");
    assert.strictEqual(path.posix.extname(".\\"), "");
    assert.strictEqual(path.posix.extname("..\\"), ".\\");
    assert.strictEqual(path.posix.extname("file.ext\\"), ".ext\\");
    assert.strictEqual(path.posix.extname("file.ext\\\\"), ".ext\\\\");
    assert.strictEqual(path.posix.extname("file\\"), "");
    assert.strictEqual(path.posix.extname("file\\\\"), "");
    assert.strictEqual(path.posix.extname("file.\\"), ".\\");
    assert.strictEqual(path.posix.extname("file.\\\\"), ".\\\\");
    assert.strictEqual(path.extname("far.boo"), ".boo");
    assert.strictEqual(path.extname("far.b"), ".b");
    assert.strictEqual(path.extname("far."), ".");
    assert.strictEqual(path.extname("far.boo/boo.far"), ".far");
    assert.strictEqual(path.extname("far.boo/boo"), "");
  });
  test("resolve", () => {
    const failures = [];
    const slashRE = /\//g;
    const backslashRE = /\\/g;
    const resolveTests = [
      [
        path.win32.resolve,
        // arguments                               result
        [
          [["c:/blah\\blah", "d:/games", "c:../a"], "c:\\blah\\a"],
          [["c:/ignore", "d:\\a/b\\c/d", "\\e.exe"], "d:\\e.exe"],
          [["c:/ignore", "c:/some/file"], "c:\\some\\file"],
          [["d:/ignore", "d:some/dir//"], "d:\\ignore\\some\\dir"],
          [["//server/share", "..", "relative\\"], "\\\\server\\share\\relative"],
          [["c:/", "//"], "c:\\"],
          [["c:/", "//dir"], "c:\\dir"],
          [["c:/", "//server/share"], "\\\\server\\share\\"],
          [["c:/", "//server//share"], "\\\\server\\share\\"],
          [["c:/", "///some//dir"], "c:\\some\\dir"],
          [
            ["C:\\foo\\tmp.3\\", "..\\tmp.3\\cycles\\root.js"],
            "C:\\foo\\tmp.3\\cycles\\root.js"
          ]
        ]
      ],
      [
        path.posix.resolve,
        // arguments                    result
        [
          [["/var/lib", "../", "file/"], "/var/file"],
          [["/var/lib", "/../", "file/"], "/file"],
          [["/some/dir", ".", "/absolute/"], "/absolute"],
          [["/foo/tmp.3/", "../tmp.3/cycles/root.js"], "/foo/tmp.3/cycles/root.js"]
        ]
      ],
      [
        isWeb ? path.posix.resolve : path.resolve,
        // arguments						result
        [
          [["."], process.cwd()],
          [["a/b/c", "../../.."], process.cwd()]
        ]
      ]
    ];
    resolveTests.forEach((test2) => {
      const resolve = test2[0];
      test2[1].forEach((test3) => {
        const actual = resolve.apply(null, test3[0]);
        let actualAlt;
        const os = resolve === path.win32.resolve ? "win32" : "posix";
        if (resolve === path.win32.resolve && !isWindows) {
          actualAlt = actual.replace(backslashRE, "/");
        } else if (resolve !== path.win32.resolve && isWindows) {
          actualAlt = actual.replace(slashRE, "\\");
        }
        const expected = test3[1];
        const message = `path.${os}.resolve(${test3[0].map(JSON.stringify).join(",")})
  expect=${JSON.stringify(expected)}
  actual=${JSON.stringify(actual)}`;
        if (actual !== expected && actualAlt !== expected) {
          failures.push(`
${message}`);
        }
      });
    });
    assert.strictEqual(failures.length, 0, failures.join(""));
  });
  test("basename", () => {
    assert.strictEqual(path.basename(__filename), "path.test.js");
    assert.strictEqual(path.basename(__filename, ".js"), "path.test");
    assert.strictEqual(path.basename(".js", ".js"), "");
    assert.strictEqual(path.basename(""), "");
    assert.strictEqual(path.basename("/dir/basename.ext"), "basename.ext");
    assert.strictEqual(path.basename("/basename.ext"), "basename.ext");
    assert.strictEqual(path.basename("basename.ext"), "basename.ext");
    assert.strictEqual(path.basename("basename.ext/"), "basename.ext");
    assert.strictEqual(path.basename("basename.ext//"), "basename.ext");
    assert.strictEqual(path.basename("aaa/bbb", "/bbb"), "bbb");
    assert.strictEqual(path.basename("aaa/bbb", "a/bbb"), "bbb");
    assert.strictEqual(path.basename("aaa/bbb", "bbb"), "bbb");
    assert.strictEqual(path.basename("aaa/bbb//", "bbb"), "bbb");
    assert.strictEqual(path.basename("aaa/bbb", "bb"), "b");
    assert.strictEqual(path.basename("aaa/bbb", "b"), "bb");
    assert.strictEqual(path.basename("/aaa/bbb", "/bbb"), "bbb");
    assert.strictEqual(path.basename("/aaa/bbb", "a/bbb"), "bbb");
    assert.strictEqual(path.basename("/aaa/bbb", "bbb"), "bbb");
    assert.strictEqual(path.basename("/aaa/bbb//", "bbb"), "bbb");
    assert.strictEqual(path.basename("/aaa/bbb", "bb"), "b");
    assert.strictEqual(path.basename("/aaa/bbb", "b"), "bb");
    assert.strictEqual(path.basename("/aaa/bbb"), "bbb");
    assert.strictEqual(path.basename("/aaa/"), "aaa");
    assert.strictEqual(path.basename("/aaa/b"), "b");
    assert.strictEqual(path.basename("/a/b"), "b");
    assert.strictEqual(path.basename("//a"), "a");
    assert.strictEqual(path.basename("a", "a"), "");
    assert.strictEqual(path.win32.basename("\\dir\\basename.ext"), "basename.ext");
    assert.strictEqual(path.win32.basename("\\basename.ext"), "basename.ext");
    assert.strictEqual(path.win32.basename("basename.ext"), "basename.ext");
    assert.strictEqual(path.win32.basename("basename.ext\\"), "basename.ext");
    assert.strictEqual(path.win32.basename("basename.ext\\\\"), "basename.ext");
    assert.strictEqual(path.win32.basename("foo"), "foo");
    assert.strictEqual(path.win32.basename("aaa\\bbb", "\\bbb"), "bbb");
    assert.strictEqual(path.win32.basename("aaa\\bbb", "a\\bbb"), "bbb");
    assert.strictEqual(path.win32.basename("aaa\\bbb", "bbb"), "bbb");
    assert.strictEqual(path.win32.basename("aaa\\bbb\\\\\\\\", "bbb"), "bbb");
    assert.strictEqual(path.win32.basename("aaa\\bbb", "bb"), "b");
    assert.strictEqual(path.win32.basename("aaa\\bbb", "b"), "bb");
    assert.strictEqual(path.win32.basename("C:"), "");
    assert.strictEqual(path.win32.basename("C:."), ".");
    assert.strictEqual(path.win32.basename("C:\\"), "");
    assert.strictEqual(path.win32.basename("C:\\dir\\base.ext"), "base.ext");
    assert.strictEqual(path.win32.basename("C:\\basename.ext"), "basename.ext");
    assert.strictEqual(path.win32.basename("C:basename.ext"), "basename.ext");
    assert.strictEqual(path.win32.basename("C:basename.ext\\"), "basename.ext");
    assert.strictEqual(path.win32.basename("C:basename.ext\\\\"), "basename.ext");
    assert.strictEqual(path.win32.basename("C:foo"), "foo");
    assert.strictEqual(path.win32.basename("file:stream"), "file:stream");
    assert.strictEqual(path.win32.basename("a", "a"), "");
    assert.strictEqual(
      path.posix.basename("\\dir\\basename.ext"),
      "\\dir\\basename.ext"
    );
    assert.strictEqual(path.posix.basename("\\basename.ext"), "\\basename.ext");
    assert.strictEqual(path.posix.basename("basename.ext"), "basename.ext");
    assert.strictEqual(path.posix.basename("basename.ext\\"), "basename.ext\\");
    assert.strictEqual(path.posix.basename("basename.ext\\\\"), "basename.ext\\\\");
    assert.strictEqual(path.posix.basename("foo"), "foo");
    const controlCharFilename = `Icon${String.fromCharCode(13)}`;
    assert.strictEqual(
      path.posix.basename(`/a/b/${controlCharFilename}`),
      controlCharFilename
    );
    assert.strictEqual(path.basename("foo/bar"), "bar");
    assert.strictEqual(path.posix.basename("foo\\bar"), "foo\\bar");
    assert.strictEqual(path.win32.basename("foo\\bar"), "bar");
    assert.strictEqual(path.basename("/foo/bar"), "bar");
    assert.strictEqual(path.posix.basename("\\foo\\bar"), "\\foo\\bar");
    assert.strictEqual(path.win32.basename("\\foo\\bar"), "bar");
    assert.strictEqual(path.basename("./bar"), "bar");
    assert.strictEqual(path.posix.basename(".\\bar"), ".\\bar");
    assert.strictEqual(path.win32.basename(".\\bar"), "bar");
    assert.strictEqual(path.basename("/bar"), "bar");
    assert.strictEqual(path.posix.basename("\\bar"), "\\bar");
    assert.strictEqual(path.win32.basename("\\bar"), "bar");
    assert.strictEqual(path.basename("bar/"), "bar");
    assert.strictEqual(path.posix.basename("bar\\"), "bar\\");
    assert.strictEqual(path.win32.basename("bar\\"), "bar");
    assert.strictEqual(path.basename("bar"), "bar");
    assert.strictEqual(path.basename("////////"), "");
    assert.strictEqual(path.posix.basename("\\\\\\\\"), "\\\\\\\\");
    assert.strictEqual(path.win32.basename("\\\\\\\\"), "");
  });
  test("relative", () => {
    const failures = [];
    const relativeTests = [
      [
        path.win32.relative,
        // arguments                     result
        [
          ["c:/blah\\blah", "d:/games", "d:\\games"],
          ["c:/aaaa/bbbb", "c:/aaaa", ".."],
          ["c:/aaaa/bbbb", "c:/cccc", "..\\..\\cccc"],
          ["c:/aaaa/bbbb", "c:/aaaa/bbbb", ""],
          ["c:/aaaa/bbbb", "c:/aaaa/cccc", "..\\cccc"],
          ["c:/aaaa/", "c:/aaaa/cccc", "cccc"],
          ["c:/", "c:\\aaaa\\bbbb", "aaaa\\bbbb"],
          ["c:/aaaa/bbbb", "d:\\", "d:\\"],
          ["c:/AaAa/bbbb", "c:/aaaa/bbbb", ""],
          ["c:/aaaaa/", "c:/aaaa/cccc", "..\\aaaa\\cccc"],
          ["C:\\foo\\bar\\baz\\quux", "C:\\", "..\\..\\..\\.."],
          ["C:\\foo\\test", "C:\\foo\\test\\bar\\package.json", "bar\\package.json"],
          ["C:\\foo\\bar\\baz-quux", "C:\\foo\\bar\\baz", "..\\baz"],
          ["C:\\foo\\bar\\baz", "C:\\foo\\bar\\baz-quux", "..\\baz-quux"],
          ["\\\\foo\\bar", "\\\\foo\\bar\\baz", "baz"],
          ["\\\\foo\\bar\\baz", "\\\\foo\\bar", ".."],
          ["\\\\foo\\bar\\baz-quux", "\\\\foo\\bar\\baz", "..\\baz"],
          ["\\\\foo\\bar\\baz", "\\\\foo\\bar\\baz-quux", "..\\baz-quux"],
          ["C:\\baz-quux", "C:\\baz", "..\\baz"],
          ["C:\\baz", "C:\\baz-quux", "..\\baz-quux"],
          ["\\\\foo\\baz-quux", "\\\\foo\\baz", "..\\baz"],
          ["\\\\foo\\baz", "\\\\foo\\baz-quux", "..\\baz-quux"],
          ["C:\\baz", "\\\\foo\\bar\\baz", "\\\\foo\\bar\\baz"],
          ["\\\\foo\\bar\\baz", "C:\\baz", "C:\\baz"]
        ]
      ],
      [
        path.posix.relative,
        // arguments          result
        [
          ["/var/lib", "/var", ".."],
          ["/var/lib", "/bin", "../../bin"],
          ["/var/lib", "/var/lib", ""],
          ["/var/lib", "/var/apache", "../apache"],
          ["/var/", "/var/lib", "lib"],
          ["/", "/var/lib", "var/lib"],
          ["/foo/test", "/foo/test/bar/package.json", "bar/package.json"],
          ["/Users/a/web/b/test/mails", "/Users/a/web/b", "../.."],
          ["/foo/bar/baz-quux", "/foo/bar/baz", "../baz"],
          ["/foo/bar/baz", "/foo/bar/baz-quux", "../baz-quux"],
          ["/baz-quux", "/baz", "../baz"],
          ["/baz", "/baz-quux", "../baz-quux"]
        ]
      ]
    ];
    relativeTests.forEach((test2) => {
      const relative = test2[0];
      test2[1].forEach((test3) => {
        const actual = relative(test3[0], test3[1]);
        const expected = test3[2];
        const os = relative === path.win32.relative ? "win32" : "posix";
        const message = `path.${os}.relative(${test3.slice(0, 2).map(JSON.stringify).join(",")})
  expect=${JSON.stringify(expected)}
  actual=${JSON.stringify(actual)}`;
        if (actual !== expected) {
          failures.push(`
${message}`);
        }
      });
    });
    assert.strictEqual(failures.length, 0, failures.join(""));
  });
  test("normalize", () => {
    assert.strictEqual(
      path.win32.normalize("./fixtures///b/../b/c.js"),
      "fixtures\\b\\c.js"
    );
    assert.strictEqual(path.win32.normalize("/foo/../../../bar"), "\\bar");
    assert.strictEqual(path.win32.normalize("a//b//../b"), "a\\b");
    assert.strictEqual(path.win32.normalize("a//b//./c"), "a\\b\\c");
    assert.strictEqual(path.win32.normalize("a//b//."), "a\\b");
    assert.strictEqual(
      path.win32.normalize("//server/share/dir/file.ext"),
      "\\\\server\\share\\dir\\file.ext"
    );
    assert.strictEqual(path.win32.normalize("/a/b/c/../../../x/y/z"), "\\x\\y\\z");
    assert.strictEqual(path.win32.normalize("C:"), "C:.");
    assert.strictEqual(path.win32.normalize("C:..\\abc"), "C:..\\abc");
    assert.strictEqual(
      path.win32.normalize("C:..\\..\\abc\\..\\def"),
      "C:..\\..\\def"
    );
    assert.strictEqual(path.win32.normalize("C:\\."), "C:\\");
    assert.strictEqual(path.win32.normalize("file:stream"), "file:stream");
    assert.strictEqual(path.win32.normalize("bar\\foo..\\..\\"), "bar\\");
    assert.strictEqual(path.win32.normalize("bar\\foo..\\.."), "bar");
    assert.strictEqual(path.win32.normalize("bar\\foo..\\..\\baz"), "bar\\baz");
    assert.strictEqual(path.win32.normalize("bar\\foo..\\"), "bar\\foo..\\");
    assert.strictEqual(path.win32.normalize("bar\\foo.."), "bar\\foo..");
    assert.strictEqual(
      path.win32.normalize("..\\foo..\\..\\..\\bar"),
      "..\\..\\bar"
    );
    assert.strictEqual(
      path.win32.normalize("..\\...\\..\\.\\...\\..\\..\\bar"),
      "..\\..\\bar"
    );
    assert.strictEqual(
      path.win32.normalize("../../../foo/../../../bar"),
      "..\\..\\..\\..\\..\\bar"
    );
    assert.strictEqual(
      path.win32.normalize("../../../foo/../../../bar/../../"),
      "..\\..\\..\\..\\..\\..\\"
    );
    assert.strictEqual(
      path.win32.normalize("../foobar/barfoo/foo/../../../bar/../../"),
      "..\\..\\"
    );
    assert.strictEqual(
      path.win32.normalize("../.../../foobar/../../../bar/../../baz"),
      "..\\..\\..\\..\\baz"
    );
    assert.strictEqual(path.win32.normalize("foo/bar\\baz"), "foo\\bar\\baz");
    assert.strictEqual(
      path.posix.normalize("./fixtures///b/../b/c.js"),
      "fixtures/b/c.js"
    );
    assert.strictEqual(path.posix.normalize("/foo/../../../bar"), "/bar");
    assert.strictEqual(path.posix.normalize("a//b//../b"), "a/b");
    assert.strictEqual(path.posix.normalize("a//b//./c"), "a/b/c");
    assert.strictEqual(path.posix.normalize("a//b//."), "a/b");
    assert.strictEqual(path.posix.normalize("/a/b/c/../../../x/y/z"), "/x/y/z");
    assert.strictEqual(path.posix.normalize("///..//./foo/.//bar"), "/foo/bar");
    assert.strictEqual(path.posix.normalize("bar/foo../../"), "bar/");
    assert.strictEqual(path.posix.normalize("bar/foo../.."), "bar");
    assert.strictEqual(path.posix.normalize("bar/foo../../baz"), "bar/baz");
    assert.strictEqual(path.posix.normalize("bar/foo../"), "bar/foo../");
    assert.strictEqual(path.posix.normalize("bar/foo.."), "bar/foo..");
    assert.strictEqual(path.posix.normalize("../foo../../../bar"), "../../bar");
    assert.strictEqual(
      path.posix.normalize("../.../.././.../../../bar"),
      "../../bar"
    );
    assert.strictEqual(
      path.posix.normalize("../../../foo/../../../bar"),
      "../../../../../bar"
    );
    assert.strictEqual(
      path.posix.normalize("../../../foo/../../../bar/../../"),
      "../../../../../../"
    );
    assert.strictEqual(
      path.posix.normalize("../foobar/barfoo/foo/../../../bar/../../"),
      "../../"
    );
    assert.strictEqual(
      path.posix.normalize("../.../../foobar/../../../bar/../../baz"),
      "../../../../baz"
    );
    assert.strictEqual(path.posix.normalize("foo/bar\\baz"), "foo/bar\\baz");
  });
  test("isAbsolute", () => {
    assert.strictEqual(path.win32.isAbsolute("/"), true);
    assert.strictEqual(path.win32.isAbsolute("//"), true);
    assert.strictEqual(path.win32.isAbsolute("//server"), true);
    assert.strictEqual(path.win32.isAbsolute("//server/file"), true);
    assert.strictEqual(path.win32.isAbsolute("\\\\server\\file"), true);
    assert.strictEqual(path.win32.isAbsolute("\\\\server"), true);
    assert.strictEqual(path.win32.isAbsolute("\\\\"), true);
    assert.strictEqual(path.win32.isAbsolute("c"), false);
    assert.strictEqual(path.win32.isAbsolute("c:"), false);
    assert.strictEqual(path.win32.isAbsolute("c:\\"), true);
    assert.strictEqual(path.win32.isAbsolute("c:/"), true);
    assert.strictEqual(path.win32.isAbsolute("c://"), true);
    assert.strictEqual(path.win32.isAbsolute("C:/Users/"), true);
    assert.strictEqual(path.win32.isAbsolute("C:\\Users\\"), true);
    assert.strictEqual(path.win32.isAbsolute("C:cwd/another"), false);
    assert.strictEqual(path.win32.isAbsolute("C:cwd\\another"), false);
    assert.strictEqual(path.win32.isAbsolute("directory/directory"), false);
    assert.strictEqual(path.win32.isAbsolute("directory\\directory"), false);
    assert.strictEqual(path.posix.isAbsolute("/home/foo"), true);
    assert.strictEqual(path.posix.isAbsolute("/home/foo/.."), true);
    assert.strictEqual(path.posix.isAbsolute("bar/"), false);
    assert.strictEqual(path.posix.isAbsolute("./baz"), false);
    [
      "C:/",
      "C:\\",
      "C:/foo",
      "C:\\foo",
      "z:/foo/bar.txt",
      "z:\\foo\\bar.txt",
      "\\\\localhost\\c$\\foo",
      "/",
      "/foo"
    ].forEach((absolutePath) => {
      assert.ok(path.win32.isAbsolute(absolutePath), absolutePath);
    });
    [
      "/",
      "/foo",
      "/foo/bar.txt"
    ].forEach((absolutePath) => {
      assert.ok(path.posix.isAbsolute(absolutePath), absolutePath);
    });
    [
      "",
      "foo",
      "foo/bar",
      "./foo",
      "http://foo.com/bar"
    ].forEach((nonAbsolutePath) => {
      assert.ok(!path.win32.isAbsolute(nonAbsolutePath), nonAbsolutePath);
    });
    [
      "",
      "foo",
      "foo/bar",
      "./foo",
      "http://foo.com/bar",
      "z:/foo/bar.txt"
    ].forEach((nonAbsolutePath) => {
      assert.ok(!path.posix.isAbsolute(nonAbsolutePath), nonAbsolutePath);
    });
  });
  test("path", () => {
    assert.strictEqual(path.win32.sep, "\\");
    assert.strictEqual(path.posix.sep, "/");
    assert.strictEqual(path.win32.delimiter, ";");
    assert.strictEqual(path.posix.delimiter, ":");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vcGF0aC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLy8gTk9URTogVlNDb2RlJ3MgY29weSBvZiBub2RlanMgcGF0aCBsaWJyYXJ5IHRvIGJlIHVzYWJsZSBpbiBjb21tb24gKG5vbi1ub2RlKSBuYW1lc3BhY2Vcbi8vIENvcGllZCBmcm9tOiBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvdHJlZS80M2RkNDljOTc4Mjg0OGMyNWU1YjAzNDQ4YzhhMGY5MjNmMTNjMTU4XG5cbi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzV2ViLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0ICogYXMgcHJvY2VzcyBmcm9tICcuLi8uLi9jb21tb24vcHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuc3VpdGUoJ1BhdGhzIChOb2RlIEltcGxlbWVudGF0aW9uKScsICgpID0+IHtcblx0Y29uc3QgX19maWxlbmFtZSA9ICdwYXRoLnRlc3QuanMnO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0dGVzdCgnam9pbicsICgpID0+IHtcblx0XHRjb25zdCBmYWlsdXJlcyA9IFtdIGFzIHN0cmluZ1tdO1xuXHRcdGNvbnN0IGJhY2tzbGFzaFJFID0gL1xcXFwvZztcblxuXHRcdGNvbnN0IGpvaW5UZXN0czogYW55ID0gW1xuXHRcdFx0W1twYXRoLnBvc2l4LmpvaW4sIHBhdGgud2luMzIuam9pbl0sXG5cdFx0XHQvLyBhcmd1bWVudHMgICAgICAgICAgICAgICAgICAgICByZXN1bHRcblx0XHRcdFtbWycuJywgJ3gvYicsICcuLicsICcvYi9jLmpzJ10sICd4L2IvYy5qcyddLFxuXHRcdFx0W1tdLCAnLiddLFxuXHRcdFx0W1snLy4nLCAneC9iJywgJy4uJywgJy9iL2MuanMnXSwgJy94L2IvYy5qcyddLFxuXHRcdFx0W1snL2ZvbycsICcuLi8uLi8uLi9iYXInXSwgJy9iYXInXSxcblx0XHRcdFtbJ2ZvbycsICcuLi8uLi8uLi9iYXInXSwgJy4uLy4uL2JhciddLFxuXHRcdFx0W1snZm9vLycsICcuLi8uLi8uLi9iYXInXSwgJy4uLy4uL2JhciddLFxuXHRcdFx0W1snZm9vL3gnLCAnLi4vLi4vLi4vYmFyJ10sICcuLi9iYXInXSxcblx0XHRcdFtbJ2Zvby94JywgJy4vYmFyJ10sICdmb28veC9iYXInXSxcblx0XHRcdFtbJ2Zvby94LycsICcuL2JhciddLCAnZm9vL3gvYmFyJ10sXG5cdFx0XHRbWydmb28veC8nLCAnLicsICdiYXInXSwgJ2Zvby94L2JhciddLFxuXHRcdFx0W1snLi8nXSwgJy4vJ10sXG5cdFx0XHRbWycuJywgJy4vJ10sICcuLyddLFxuXHRcdFx0W1snLicsICcuJywgJy4nXSwgJy4nXSxcblx0XHRcdFtbJy4nLCAnLi8nLCAnLiddLCAnLiddLFxuXHRcdFx0W1snLicsICcvLi8nLCAnLiddLCAnLiddLFxuXHRcdFx0W1snLicsICcvLy8vLy4vJywgJy4nXSwgJy4nXSxcblx0XHRcdFtbJy4nXSwgJy4nXSxcblx0XHRcdFtbJycsICcuJ10sICcuJ10sXG5cdFx0XHRbWycnLCAnZm9vJ10sICdmb28nXSxcblx0XHRcdFtbJ2ZvbycsICcvYmFyJ10sICdmb28vYmFyJ10sXG5cdFx0XHRbWycnLCAnL2ZvbyddLCAnL2ZvbyddLFxuXHRcdFx0W1snJywgJycsICcvZm9vJ10sICcvZm9vJ10sXG5cdFx0XHRbWycnLCAnJywgJ2ZvbyddLCAnZm9vJ10sXG5cdFx0XHRbWydmb28nLCAnJ10sICdmb28nXSxcblx0XHRcdFtbJ2Zvby8nLCAnJ10sICdmb28vJ10sXG5cdFx0XHRbWydmb28nLCAnJywgJy9iYXInXSwgJ2Zvby9iYXInXSxcblx0XHRcdFtbJy4vJywgJy4uJywgJy9mb28nXSwgJy4uL2ZvbyddLFxuXHRcdFx0W1snLi8nLCAnLi4nLCAnLi4nLCAnL2ZvbyddLCAnLi4vLi4vZm9vJ10sXG5cdFx0XHRbWycuJywgJy4uJywgJy4uJywgJy9mb28nXSwgJy4uLy4uL2ZvbyddLFxuXHRcdFx0W1snJywgJy4uJywgJy4uJywgJy9mb28nXSwgJy4uLy4uL2ZvbyddLFxuXHRcdFx0W1snLyddLCAnLyddLFxuXHRcdFx0W1snLycsICcuJ10sICcvJ10sXG5cdFx0XHRbWycvJywgJy4uJ10sICcvJ10sXG5cdFx0XHRbWycvJywgJy4uJywgJy4uJ10sICcvJ10sXG5cdFx0XHRbWycnXSwgJy4nXSxcblx0XHRcdFtbJycsICcnXSwgJy4nXSxcblx0XHRcdFtbJyAvZm9vJ10sICcgL2ZvbyddLFxuXHRcdFx0W1snICcsICdmb28nXSwgJyAvZm9vJ10sXG5cdFx0XHRbWycgJywgJy4nXSwgJyAnXSxcblx0XHRcdFtbJyAnLCAnLyddLCAnIC8nXSxcblx0XHRcdFtbJyAnLCAnJ10sICcgJ10sXG5cdFx0XHRbWycvJywgJ2ZvbyddLCAnL2ZvbyddLFxuXHRcdFx0W1snLycsICcvZm9vJ10sICcvZm9vJ10sXG5cdFx0XHRbWycvJywgJy8vZm9vJ10sICcvZm9vJ10sXG5cdFx0XHRbWycvJywgJycsICcvZm9vJ10sICcvZm9vJ10sXG5cdFx0XHRbWycnLCAnLycsICdmb28nXSwgJy9mb28nXSxcblx0XHRcdFtbJycsICcvJywgJy9mb28nXSwgJy9mb28nXVxuXHRcdFx0XVxuXHRcdFx0XVxuXHRcdF07XG5cblx0XHQvLyBXaW5kb3dzLXNwZWNpZmljIGpvaW4gdGVzdHNcblx0XHRqb2luVGVzdHMucHVzaChbXG5cdFx0XHRwYXRoLndpbjMyLmpvaW4sXG5cdFx0XHRqb2luVGVzdHNbMF1bMV0uc2xpY2UoMCkuY29uY2F0KFxuXHRcdFx0XHRbLy8gYXJndW1lbnRzICAgICAgICAgICAgICAgICAgICAgcmVzdWx0XG5cdFx0XHRcdFx0Ly8gVU5DIHBhdGggZXhwZWN0ZWRcblx0XHRcdFx0XHRbWycvL2Zvby9iYXInXSwgJ1xcXFxcXFxcZm9vXFxcXGJhclxcXFwnXSxcblx0XHRcdFx0XHRbWydcXFxcL2Zvby9iYXInXSwgJ1xcXFxcXFxcZm9vXFxcXGJhclxcXFwnXSxcblx0XHRcdFx0XHRbWydcXFxcXFxcXGZvby9iYXInXSwgJ1xcXFxcXFxcZm9vXFxcXGJhclxcXFwnXSxcblx0XHRcdFx0XHQvLyBVTkMgcGF0aCBleHBlY3RlZCAtIHNlcnZlciBhbmQgc2hhcmUgc2VwYXJhdGVcblx0XHRcdFx0XHRbWycvL2ZvbycsICdiYXInXSwgJ1xcXFxcXFxcZm9vXFxcXGJhclxcXFwnXSxcblx0XHRcdFx0XHRbWycvL2Zvby8nLCAnYmFyJ10sICdcXFxcXFxcXGZvb1xcXFxiYXJcXFxcJ10sXG5cdFx0XHRcdFx0W1snLy9mb28nLCAnL2JhciddLCAnXFxcXFxcXFxmb29cXFxcYmFyXFxcXCddLFxuXHRcdFx0XHRcdC8vIFVOQyBwYXRoIGV4cGVjdGVkIC0gcXVlc3Rpb25hYmxlXG5cdFx0XHRcdFx0W1snLy9mb28nLCAnJywgJ2JhciddLCAnXFxcXFxcXFxmb29cXFxcYmFyXFxcXCddLFxuXHRcdFx0XHRcdFtbJy8vZm9vLycsICcnLCAnYmFyJ10sICdcXFxcXFxcXGZvb1xcXFxiYXJcXFxcJ10sXG5cdFx0XHRcdFx0W1snLy9mb28vJywgJycsICcvYmFyJ10sICdcXFxcXFxcXGZvb1xcXFxiYXJcXFxcJ10sXG5cdFx0XHRcdFx0Ly8gVU5DIHBhdGggZXhwZWN0ZWQgLSBldmVuIG1vcmUgcXVlc3Rpb25hYmxlXG5cdFx0XHRcdFx0W1snJywgJy8vZm9vJywgJ2JhciddLCAnXFxcXFxcXFxmb29cXFxcYmFyXFxcXCddLFxuXHRcdFx0XHRcdFtbJycsICcvL2Zvby8nLCAnYmFyJ10sICdcXFxcXFxcXGZvb1xcXFxiYXJcXFxcJ10sXG5cdFx0XHRcdFx0W1snJywgJy8vZm9vLycsICcvYmFyJ10sICdcXFxcXFxcXGZvb1xcXFxiYXJcXFxcJ10sXG5cdFx0XHRcdFx0Ly8gTm8gVU5DIHBhdGggZXhwZWN0ZWQgKG5vIGRvdWJsZSBzbGFzaCBpbiBmaXJzdCBjb21wb25lbnQpXG5cdFx0XHRcdFx0W1snXFxcXCcsICdmb28vYmFyJ10sICdcXFxcZm9vXFxcXGJhciddLFxuXHRcdFx0XHRcdFtbJ1xcXFwnLCAnL2Zvby9iYXInXSwgJ1xcXFxmb29cXFxcYmFyJ10sXG5cdFx0XHRcdFx0W1snJywgJy8nLCAnL2Zvby9iYXInXSwgJ1xcXFxmb29cXFxcYmFyJ10sXG5cdFx0XHRcdFx0Ly8gTm8gVU5DIHBhdGggZXhwZWN0ZWQgKG5vIG5vbi1zbGFzaGVzIGluIGZpcnN0IGNvbXBvbmVudCAtXG5cdFx0XHRcdFx0Ly8gcXVlc3Rpb25hYmxlKVxuXHRcdFx0XHRcdFtbJy8vJywgJ2Zvby9iYXInXSwgJ1xcXFxmb29cXFxcYmFyJ10sXG5cdFx0XHRcdFx0W1snLy8nLCAnL2Zvby9iYXInXSwgJ1xcXFxmb29cXFxcYmFyJ10sXG5cdFx0XHRcdFx0W1snXFxcXFxcXFwnLCAnLycsICcvZm9vL2JhciddLCAnXFxcXGZvb1xcXFxiYXInXSxcblx0XHRcdFx0XHRbWycvLyddLCAnXFxcXCddLFxuXHRcdFx0XHRcdC8vIE5vIFVOQyBwYXRoIGV4cGVjdGVkIChzaGFyZSBuYW1lIG1pc3NpbmcgLSBxdWVzdGlvbmFibGUpLlxuXHRcdFx0XHRcdFtbJy8vZm9vJ10sICdcXFxcZm9vJ10sXG5cdFx0XHRcdFx0W1snLy9mb28vJ10sICdcXFxcZm9vXFxcXCddLFxuXHRcdFx0XHRcdFtbJy8vZm9vJywgJy8nXSwgJ1xcXFxmb29cXFxcJ10sXG5cdFx0XHRcdFx0W1snLy9mb28nLCAnJywgJy8nXSwgJ1xcXFxmb29cXFxcJ10sXG5cdFx0XHRcdFx0Ly8gTm8gVU5DIHBhdGggZXhwZWN0ZWQgKHRvbyBtYW55IGxlYWRpbmcgc2xhc2hlcyAtIHF1ZXN0aW9uYWJsZSlcblx0XHRcdFx0XHRbWycvLy9mb28vYmFyJ10sICdcXFxcZm9vXFxcXGJhciddLFxuXHRcdFx0XHRcdFtbJy8vLy9mb28nLCAnYmFyJ10sICdcXFxcZm9vXFxcXGJhciddLFxuXHRcdFx0XHRcdFtbJ1xcXFxcXFxcXFxcXC9mb28vYmFyJ10sICdcXFxcZm9vXFxcXGJhciddLFxuXHRcdFx0XHRcdC8vIERyaXZlLXJlbGF0aXZlIHZzIGRyaXZlLWFic29sdXRlIHBhdGhzLiBUaGlzIG1lcmVseSBkZXNjcmliZXMgdGhlXG5cdFx0XHRcdFx0Ly8gc3RhdHVzIHF1bywgcmF0aGVyIHRoYW4gYmVpbmcgb2J2aW91c2x5IHJpZ2h0XG5cdFx0XHRcdFx0W1snYzonXSwgJ2M6LiddLFxuXHRcdFx0XHRcdFtbJ2M6LiddLCAnYzouJ10sXG5cdFx0XHRcdFx0W1snYzonLCAnJ10sICdjOi4nXSxcblx0XHRcdFx0XHRbWycnLCAnYzonXSwgJ2M6LiddLFxuXHRcdFx0XHRcdFtbJ2M6LicsICcvJ10sICdjOi5cXFxcJ10sXG5cdFx0XHRcdFx0W1snYzouJywgJ2ZpbGUnXSwgJ2M6ZmlsZSddLFxuXHRcdFx0XHRcdFtbJ2M6JywgJy8nXSwgJ2M6XFxcXCddLFxuXHRcdFx0XHRcdFtbJ2M6JywgJ2ZpbGUnXSwgJ2M6XFxcXGZpbGUnXVxuXHRcdFx0XHRdXG5cdFx0XHQpXG5cdFx0XSk7XG5cdFx0am9pblRlc3RzLmZvckVhY2goKHRlc3Q6IGFueVtdKSA9PiB7XG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkodGVzdFswXSkpIHtcblx0XHRcdFx0dGVzdFswXSA9IFt0ZXN0WzBdXTtcblx0XHRcdH1cblx0XHRcdHRlc3RbMF0uZm9yRWFjaCgoam9pbjogYW55KSA9PiB7XG5cdFx0XHRcdHRlc3RbMV0uZm9yRWFjaCgodGVzdDogYW55KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0dWFsID0gam9pbi5hcHBseShudWxsLCB0ZXN0WzBdKTtcblx0XHRcdFx0XHRjb25zdCBleHBlY3RlZCA9IHRlc3RbMV07XG5cdFx0XHRcdFx0Ly8gRm9yIG5vbi1XaW5kb3dzIHNwZWNpZmljIHRlc3RzIHdpdGggdGhlIFdpbmRvd3Mgam9pbigpLCB3ZSBuZWVkIHRvIHRyeVxuXHRcdFx0XHRcdC8vIHJlcGxhY2luZyB0aGUgc2xhc2hlcyBzaW5jZSB0aGUgbm9uLVdpbmRvd3Mgc3BlY2lmaWMgdGVzdHMnIGBleHBlY3RlZGBcblx0XHRcdFx0XHQvLyB1c2UgZm9yd2FyZCBzbGFzaGVzXG5cdFx0XHRcdFx0bGV0IGFjdHVhbEFsdDtcblx0XHRcdFx0XHRsZXQgb3M7XG5cdFx0XHRcdFx0aWYgKGpvaW4gPT09IHBhdGgud2luMzIuam9pbikge1xuXHRcdFx0XHRcdFx0YWN0dWFsQWx0ID0gYWN0dWFsLnJlcGxhY2UoYmFja3NsYXNoUkUsICcvJyk7XG5cdFx0XHRcdFx0XHRvcyA9ICd3aW4zMic7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG9zID0gJ3Bvc2l4Jztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9XG5cdFx0XHRcdFx0XHRgcGF0aC4ke29zfS5qb2luKCR7dGVzdFswXS5tYXAoSlNPTi5zdHJpbmdpZnkpLmpvaW4oJywnKX0pXFxuICBleHBlY3Q9JHtKU09OLnN0cmluZ2lmeShleHBlY3RlZCl9XFxuICBhY3R1YWw9JHtKU09OLnN0cmluZ2lmeShhY3R1YWwpfWA7XG5cdFx0XHRcdFx0aWYgKGFjdHVhbCAhPT0gZXhwZWN0ZWQgJiYgYWN0dWFsQWx0ICE9PSBleHBlY3RlZCkge1xuXHRcdFx0XHRcdFx0ZmFpbHVyZXMucHVzaChgXFxuJHttZXNzYWdlfWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFpbHVyZXMubGVuZ3RoLCAwLCBmYWlsdXJlcy5qb2luKCcnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpcm5hbWUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguZGlybmFtZSgnL2EvYi8nKSwgJy9hJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguZGlybmFtZSgnL2EvYicpLCAnL2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5kaXJuYW1lKCcvYScpLCAnLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmRpcm5hbWUoJycpLCAnLicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmRpcm5hbWUoJy8nKSwgJy8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5kaXJuYW1lKCcvLy8vJyksICcvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguZGlybmFtZSgnLy9hJyksICcvLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmRpcm5hbWUoJ2ZvbycpLCAnLicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnYzpcXFxcJyksICdjOlxcXFwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdjOlxcXFxmb28nKSwgJ2M6XFxcXCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJ2M6XFxcXGZvb1xcXFwnKSwgJ2M6XFxcXCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJ2M6XFxcXGZvb1xcXFxiYXInKSwgJ2M6XFxcXGZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJ2M6XFxcXGZvb1xcXFxiYXJcXFxcJyksICdjOlxcXFxmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdjOlxcXFxmb29cXFxcYmFyXFxcXGJheicpLCAnYzpcXFxcZm9vXFxcXGJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJ1xcXFwnKSwgJ1xcXFwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdcXFxcZm9vJyksICdcXFxcJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnXFxcXGZvb1xcXFwnKSwgJ1xcXFwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdcXFxcZm9vXFxcXGJhcicpLCAnXFxcXGZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJ1xcXFxmb29cXFxcYmFyXFxcXCcpLCAnXFxcXGZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJ1xcXFxmb29cXFxcYmFyXFxcXGJheicpLCAnXFxcXGZvb1xcXFxiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdjOicpLCAnYzonKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdjOmZvbycpLCAnYzonKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdjOmZvb1xcXFwnKSwgJ2M6Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnYzpmb29cXFxcYmFyJyksICdjOmZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJ2M6Zm9vXFxcXGJhclxcXFwnKSwgJ2M6Zm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnYzpmb29cXFxcYmFyXFxcXGJheicpLCAnYzpmb29cXFxcYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnZmlsZTpzdHJlYW0nKSwgJy4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdkaXJcXFxcZmlsZTpzdHJlYW0nKSwgJ2RpcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJ1xcXFxcXFxcdW5jXFxcXHNoYXJlJyksXG5cdFx0XHQnXFxcXFxcXFx1bmNcXFxcc2hhcmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdcXFxcXFxcXHVuY1xcXFxzaGFyZVxcXFxmb28nKSxcblx0XHRcdCdcXFxcXFxcXHVuY1xcXFxzaGFyZVxcXFwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdcXFxcXFxcXHVuY1xcXFxzaGFyZVxcXFxmb29cXFxcJyksXG5cdFx0XHQnXFxcXFxcXFx1bmNcXFxcc2hhcmVcXFxcJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnXFxcXFxcXFx1bmNcXFxcc2hhcmVcXFxcZm9vXFxcXGJhcicpLFxuXHRcdFx0J1xcXFxcXFxcdW5jXFxcXHNoYXJlXFxcXGZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJ1xcXFxcXFxcdW5jXFxcXHNoYXJlXFxcXGZvb1xcXFxiYXJcXFxcJyksXG5cdFx0XHQnXFxcXFxcXFx1bmNcXFxcc2hhcmVcXFxcZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnXFxcXFxcXFx1bmNcXFxcc2hhcmVcXFxcZm9vXFxcXGJhclxcXFxiYXonKSxcblx0XHRcdCdcXFxcXFxcXHVuY1xcXFxzaGFyZVxcXFxmb29cXFxcYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnL2EvYi8nKSwgJy9hJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnL2EvYicpLCAnL2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCcvYScpLCAnLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJycpLCAnLicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJy8nKSwgJy8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCcvLy8vJyksICcvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnZm9vJyksICcuJyk7XG5cblx0XHQvLyBUZXN0cyBmcm9tIFZTQ29kZVxuXG5cdFx0ZnVuY3Rpb24gYXNzZXJ0RGlybmFtZShwOiBzdHJpbmcsIGV4cGVjdGVkOiBzdHJpbmcsIHdpbiA9IGZhbHNlKSB7XG5cdFx0XHRjb25zdCBhY3R1YWwgPSB3aW4gPyBwYXRoLndpbjMyLmRpcm5hbWUocCkgOiBwYXRoLnBvc2l4LmRpcm5hbWUocCk7XG5cblx0XHRcdGlmIChhY3R1YWwgIT09IGV4cGVjdGVkKSB7XG5cdFx0XHRcdGFzc2VydC5mYWlsKGAke3B9OiBleHBlY3RlZDogJHtleHBlY3RlZH0sIG91cnM6ICR7YWN0dWFsfWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGFzc2VydERpcm5hbWUoJ2Zvby9iYXInLCAnZm9vJyk7XG5cdFx0YXNzZXJ0RGlybmFtZSgnZm9vXFxcXGJhcicsICdmb28nLCB0cnVlKTtcblx0XHRhc3NlcnREaXJuYW1lKCcvZm9vL2JhcicsICcvZm9vJyk7XG5cdFx0YXNzZXJ0RGlybmFtZSgnXFxcXGZvb1xcXFxiYXInLCAnXFxcXGZvbycsIHRydWUpO1xuXHRcdGFzc2VydERpcm5hbWUoJy9mb28nLCAnLycpO1xuXHRcdGFzc2VydERpcm5hbWUoJ1xcXFxmb28nLCAnXFxcXCcsIHRydWUpO1xuXHRcdGFzc2VydERpcm5hbWUoJy8nLCAnLycpO1xuXHRcdGFzc2VydERpcm5hbWUoJ1xcXFwnLCAnXFxcXCcsIHRydWUpO1xuXHRcdGFzc2VydERpcm5hbWUoJ2ZvbycsICcuJyk7XG5cdFx0YXNzZXJ0RGlybmFtZSgnZicsICcuJyk7XG5cdFx0YXNzZXJ0RGlybmFtZSgnZi8nLCAnLicpO1xuXHRcdGFzc2VydERpcm5hbWUoJy9mb2xkZXIvJywgJy8nKTtcblx0XHRhc3NlcnREaXJuYW1lKCdjOlxcXFxzb21lXFxcXGZpbGUudHh0JywgJ2M6XFxcXHNvbWUnLCB0cnVlKTtcblx0XHRhc3NlcnREaXJuYW1lKCdjOlxcXFxzb21lJywgJ2M6XFxcXCcsIHRydWUpO1xuXHRcdGFzc2VydERpcm5hbWUoJ2M6XFxcXCcsICdjOlxcXFwnLCB0cnVlKTtcblx0XHRhc3NlcnREaXJuYW1lKCdjOicsICdjOicsIHRydWUpO1xuXHRcdGFzc2VydERpcm5hbWUoJ1xcXFxcXFxcc2VydmVyXFxcXHNoYXJlXFxcXHNvbWVcXFxccGF0aCcsICdcXFxcXFxcXHNlcnZlclxcXFxzaGFyZVxcXFxzb21lJywgdHJ1ZSk7XG5cdFx0YXNzZXJ0RGlybmFtZSgnXFxcXFxcXFxzZXJ2ZXJcXFxcc2hhcmVcXFxcc29tZScsICdcXFxcXFxcXHNlcnZlclxcXFxzaGFyZVxcXFwnLCB0cnVlKTtcblx0XHRhc3NlcnREaXJuYW1lKCdcXFxcXFxcXHNlcnZlclxcXFxzaGFyZVxcXFwnLCAnXFxcXFxcXFxzZXJ2ZXJcXFxcc2hhcmVcXFxcJywgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dG5hbWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmFpbHVyZXMgPSBbXSBhcyBzdHJpbmdbXTtcblx0XHRjb25zdCBzbGFzaFJFID0gL1xcLy9nO1xuXG5cdFx0W1xuXHRcdFx0W19fZmlsZW5hbWUsICcuanMnXSxcblx0XHRcdFsnJywgJyddLFxuXHRcdFx0WycvcGF0aC90by9maWxlJywgJyddLFxuXHRcdFx0WycvcGF0aC90by9maWxlLmV4dCcsICcuZXh0J10sXG5cdFx0XHRbJy9wYXRoLnRvL2ZpbGUuZXh0JywgJy5leHQnXSxcblx0XHRcdFsnL3BhdGgudG8vZmlsZScsICcnXSxcblx0XHRcdFsnL3BhdGgudG8vLmZpbGUnLCAnJ10sXG5cdFx0XHRbJy9wYXRoLnRvLy5maWxlLmV4dCcsICcuZXh0J10sXG5cdFx0XHRbJy9wYXRoL3RvL2YuZXh0JywgJy5leHQnXSxcblx0XHRcdFsnL3BhdGgvdG8vLi5leHQnLCAnLmV4dCddLFxuXHRcdFx0WycvcGF0aC90by8uLicsICcnXSxcblx0XHRcdFsnZmlsZScsICcnXSxcblx0XHRcdFsnZmlsZS5leHQnLCAnLmV4dCddLFxuXHRcdFx0WycuZmlsZScsICcnXSxcblx0XHRcdFsnLmZpbGUuZXh0JywgJy5leHQnXSxcblx0XHRcdFsnL2ZpbGUnLCAnJ10sXG5cdFx0XHRbJy9maWxlLmV4dCcsICcuZXh0J10sXG5cdFx0XHRbJy8uZmlsZScsICcnXSxcblx0XHRcdFsnLy5maWxlLmV4dCcsICcuZXh0J10sXG5cdFx0XHRbJy5wYXRoL2ZpbGUuZXh0JywgJy5leHQnXSxcblx0XHRcdFsnZmlsZS5leHQuZXh0JywgJy5leHQnXSxcblx0XHRcdFsnZmlsZS4nLCAnLiddLFxuXHRcdFx0WycuJywgJyddLFxuXHRcdFx0WycuLycsICcnXSxcblx0XHRcdFsnLmZpbGUuZXh0JywgJy5leHQnXSxcblx0XHRcdFsnLmZpbGUnLCAnJ10sXG5cdFx0XHRbJy5maWxlLicsICcuJ10sXG5cdFx0XHRbJy5maWxlLi4nLCAnLiddLFxuXHRcdFx0WycuLicsICcnXSxcblx0XHRcdFsnLi4vJywgJyddLFxuXHRcdFx0WycuLmZpbGUuZXh0JywgJy5leHQnXSxcblx0XHRcdFsnLi5maWxlJywgJy5maWxlJ10sXG5cdFx0XHRbJy4uZmlsZS4nLCAnLiddLFxuXHRcdFx0WycuLmZpbGUuLicsICcuJ10sXG5cdFx0XHRbJy4uLicsICcuJ10sXG5cdFx0XHRbJy4uLmV4dCcsICcuZXh0J10sXG5cdFx0XHRbJy4uLi4nLCAnLiddLFxuXHRcdFx0WydmaWxlLmV4dC8nLCAnLmV4dCddLFxuXHRcdFx0WydmaWxlLmV4dC8vJywgJy5leHQnXSxcblx0XHRcdFsnZmlsZS8nLCAnJ10sXG5cdFx0XHRbJ2ZpbGUvLycsICcnXSxcblx0XHRcdFsnZmlsZS4vJywgJy4nXSxcblx0XHRcdFsnZmlsZS4vLycsICcuJ10sXG5cdFx0XS5mb3JFYWNoKCh0ZXN0KSA9PiB7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IHRlc3RbMV07XG5cdFx0XHRbcGF0aC5wb3NpeC5leHRuYW1lLCBwYXRoLndpbjMyLmV4dG5hbWVdLmZvckVhY2goKGV4dG5hbWUpID0+IHtcblx0XHRcdFx0bGV0IGlucHV0ID0gdGVzdFswXTtcblx0XHRcdFx0bGV0IG9zO1xuXHRcdFx0XHRpZiAoZXh0bmFtZSA9PT0gcGF0aC53aW4zMi5leHRuYW1lKSB7XG5cdFx0XHRcdFx0aW5wdXQgPSBpbnB1dC5yZXBsYWNlKHNsYXNoUkUsICdcXFxcJyk7XG5cdFx0XHRcdFx0b3MgPSAnd2luMzInO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG9zID0gJ3Bvc2l4Jztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBhY3R1YWwgPSBleHRuYW1lKGlucHV0KTtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGBwYXRoLiR7b3N9LmV4dG5hbWUoJHtKU09OLnN0cmluZ2lmeShpbnB1dCl9KVxcbiAgZXhwZWN0PSR7SlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWQpfVxcbiAgYWN0dWFsPSR7SlNPTi5zdHJpbmdpZnkoYWN0dWFsKX1gO1xuXHRcdFx0XHRpZiAoYWN0dWFsICE9PSBleHBlY3RlZCkge1xuXHRcdFx0XHRcdGZhaWx1cmVzLnB1c2goYFxcbiR7bWVzc2FnZX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGlucHV0ID0gYEM6JHt0ZXN0WzBdLnJlcGxhY2Uoc2xhc2hSRSwgJ1xcXFwnKX1gO1xuXHRcdFx0XHRjb25zdCBhY3R1YWwgPSBwYXRoLndpbjMyLmV4dG5hbWUoaW5wdXQpO1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gYHBhdGgud2luMzIuZXh0bmFtZSgke0pTT04uc3RyaW5naWZ5KGlucHV0KX0pXFxuICBleHBlY3Q9JHtKU09OLnN0cmluZ2lmeShleHBlY3RlZCl9XFxuICBhY3R1YWw9JHtKU09OLnN0cmluZ2lmeShhY3R1YWwpfWA7XG5cdFx0XHRcdGlmIChhY3R1YWwgIT09IGV4cGVjdGVkKSB7XG5cdFx0XHRcdFx0ZmFpbHVyZXMucHVzaChgXFxuJHttZXNzYWdlfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhaWx1cmVzLmxlbmd0aCwgMCwgZmFpbHVyZXMuam9pbignJykpO1xuXG5cdFx0Ly8gT24gV2luZG93cywgYmFja3NsYXNoIGlzIGEgcGF0aCBzZXBhcmF0b3IuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZXh0bmFtZSgnLlxcXFwnKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmV4dG5hbWUoJy4uXFxcXCcpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZXh0bmFtZSgnZmlsZS5leHRcXFxcJyksICcuZXh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZXh0bmFtZSgnZmlsZS5leHRcXFxcXFxcXCcpLCAnLmV4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmV4dG5hbWUoJ2ZpbGVcXFxcJyksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5leHRuYW1lKCdmaWxlXFxcXFxcXFwnKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmV4dG5hbWUoJ2ZpbGUuXFxcXCcpLCAnLicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmV4dG5hbWUoJ2ZpbGUuXFxcXFxcXFwnKSwgJy4nKTtcblxuXHRcdC8vIE9uICpuaXgsIGJhY2tzbGFzaCBpcyBhIHZhbGlkIG5hbWUgY29tcG9uZW50IGxpa2UgYW55IG90aGVyIGNoYXJhY3Rlci5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5leHRuYW1lKCcuXFxcXCcpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguZXh0bmFtZSgnLi5cXFxcJyksICcuXFxcXCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmV4dG5hbWUoJ2ZpbGUuZXh0XFxcXCcpLCAnLmV4dFxcXFwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5leHRuYW1lKCdmaWxlLmV4dFxcXFxcXFxcJyksICcuZXh0XFxcXFxcXFwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5leHRuYW1lKCdmaWxlXFxcXCcpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguZXh0bmFtZSgnZmlsZVxcXFxcXFxcJyksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5leHRuYW1lKCdmaWxlLlxcXFwnKSwgJy5cXFxcJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguZXh0bmFtZSgnZmlsZS5cXFxcXFxcXCcpLCAnLlxcXFxcXFxcJyk7XG5cblx0XHQvLyBUZXN0cyBmcm9tIFZTQ29kZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmV4dG5hbWUoJ2Zhci5ib28nKSwgJy5ib28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5leHRuYW1lKCdmYXIuYicpLCAnLmInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5leHRuYW1lKCdmYXIuJyksICcuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguZXh0bmFtZSgnZmFyLmJvby9ib28uZmFyJyksICcuZmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguZXh0bmFtZSgnZmFyLmJvby9ib28nKSwgJycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZhaWx1cmVzID0gW10gYXMgc3RyaW5nW107XG5cdFx0Y29uc3Qgc2xhc2hSRSA9IC9cXC8vZztcblx0XHRjb25zdCBiYWNrc2xhc2hSRSA9IC9cXFxcL2c7XG5cblx0XHRjb25zdCByZXNvbHZlVGVzdHMgPSBbXG5cdFx0XHRbcGF0aC53aW4zMi5yZXNvbHZlLFxuXHRcdFx0Ly8gYXJndW1lbnRzICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdFxuXHRcdFx0W1tbJ2M6L2JsYWhcXFxcYmxhaCcsICdkOi9nYW1lcycsICdjOi4uL2EnXSwgJ2M6XFxcXGJsYWhcXFxcYSddLFxuXHRcdFx0W1snYzovaWdub3JlJywgJ2Q6XFxcXGEvYlxcXFxjL2QnLCAnXFxcXGUuZXhlJ10sICdkOlxcXFxlLmV4ZSddLFxuXHRcdFx0W1snYzovaWdub3JlJywgJ2M6L3NvbWUvZmlsZSddLCAnYzpcXFxcc29tZVxcXFxmaWxlJ10sXG5cdFx0XHRbWydkOi9pZ25vcmUnLCAnZDpzb21lL2Rpci8vJ10sICdkOlxcXFxpZ25vcmVcXFxcc29tZVxcXFxkaXInXSxcblx0XHRcdFtbJy8vc2VydmVyL3NoYXJlJywgJy4uJywgJ3JlbGF0aXZlXFxcXCddLCAnXFxcXFxcXFxzZXJ2ZXJcXFxcc2hhcmVcXFxccmVsYXRpdmUnXSxcblx0XHRcdFtbJ2M6LycsICcvLyddLCAnYzpcXFxcJ10sXG5cdFx0XHRbWydjOi8nLCAnLy9kaXInXSwgJ2M6XFxcXGRpciddLFxuXHRcdFx0W1snYzovJywgJy8vc2VydmVyL3NoYXJlJ10sICdcXFxcXFxcXHNlcnZlclxcXFxzaGFyZVxcXFwnXSxcblx0XHRcdFtbJ2M6LycsICcvL3NlcnZlci8vc2hhcmUnXSwgJ1xcXFxcXFxcc2VydmVyXFxcXHNoYXJlXFxcXCddLFxuXHRcdFx0W1snYzovJywgJy8vL3NvbWUvL2RpciddLCAnYzpcXFxcc29tZVxcXFxkaXInXSxcblx0XHRcdFtbJ0M6XFxcXGZvb1xcXFx0bXAuM1xcXFwnLCAnLi5cXFxcdG1wLjNcXFxcY3ljbGVzXFxcXHJvb3QuanMnXSxcblx0XHRcdFx0J0M6XFxcXGZvb1xcXFx0bXAuM1xcXFxjeWNsZXNcXFxccm9vdC5qcyddXG5cdFx0XHRdXG5cdFx0XHRdLFxuXHRcdFx0W3BhdGgucG9zaXgucmVzb2x2ZSxcblx0XHRcdC8vIGFyZ3VtZW50cyAgICAgICAgICAgICAgICAgICAgcmVzdWx0XG5cdFx0XHRbW1snL3Zhci9saWInLCAnLi4vJywgJ2ZpbGUvJ10sICcvdmFyL2ZpbGUnXSxcblx0XHRcdFtbJy92YXIvbGliJywgJy8uLi8nLCAnZmlsZS8nXSwgJy9maWxlJ10sXG5cdFx0XHRbWycvc29tZS9kaXInLCAnLicsICcvYWJzb2x1dGUvJ10sICcvYWJzb2x1dGUnXSxcblx0XHRcdFtbJy9mb28vdG1wLjMvJywgJy4uL3RtcC4zL2N5Y2xlcy9yb290LmpzJ10sICcvZm9vL3RtcC4zL2N5Y2xlcy9yb290LmpzJ11cblx0XHRcdF1cblx0XHRcdF0sXG5cdFx0XHRbKGlzV2ViID8gcGF0aC5wb3NpeC5yZXNvbHZlIDogcGF0aC5yZXNvbHZlKSxcblx0XHRcdC8vIGFyZ3VtZW50c1x0XHRcdFx0XHRcdHJlc3VsdFxuXHRcdFx0W1tbJy4nXSwgcHJvY2Vzcy5jd2QoKV0sXG5cdFx0XHRbWydhL2IvYycsICcuLi8uLi8uLiddLCBwcm9jZXNzLmN3ZCgpXVxuXHRcdFx0XVxuXHRcdFx0XSxcblx0XHRdO1xuXHRcdHJlc29sdmVUZXN0cy5mb3JFYWNoKCh0ZXN0KSA9PiB7XG5cdFx0XHRjb25zdCByZXNvbHZlID0gdGVzdFswXTtcblx0XHRcdC8vQHRzLWV4cGVjdC1lcnJvclxuXHRcdFx0dGVzdFsxXS5mb3JFYWNoKCh0ZXN0KSA9PiB7XG5cdFx0XHRcdC8vQHRzLWV4cGVjdC1lcnJvclxuXHRcdFx0XHRjb25zdCBhY3R1YWwgPSByZXNvbHZlLmFwcGx5KG51bGwsIHRlc3RbMF0pO1xuXHRcdFx0XHRsZXQgYWN0dWFsQWx0O1xuXHRcdFx0XHRjb25zdCBvcyA9IHJlc29sdmUgPT09IHBhdGgud2luMzIucmVzb2x2ZSA/ICd3aW4zMicgOiAncG9zaXgnO1xuXHRcdFx0XHRpZiAocmVzb2x2ZSA9PT0gcGF0aC53aW4zMi5yZXNvbHZlICYmICFpc1dpbmRvd3MpIHtcblx0XHRcdFx0XHRhY3R1YWxBbHQgPSBhY3R1YWwucmVwbGFjZShiYWNrc2xhc2hSRSwgJy8nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIGlmIChyZXNvbHZlICE9PSBwYXRoLndpbjMyLnJlc29sdmUgJiYgaXNXaW5kb3dzKSB7XG5cdFx0XHRcdFx0YWN0dWFsQWx0ID0gYWN0dWFsLnJlcGxhY2Uoc2xhc2hSRSwgJ1xcXFwnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkID0gdGVzdFsxXTtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9XG5cdFx0XHRcdFx0YHBhdGguJHtvc30ucmVzb2x2ZSgke3Rlc3RbMF0ubWFwKEpTT04uc3RyaW5naWZ5KS5qb2luKCcsJyl9KVxcbiAgZXhwZWN0PSR7SlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWQpfVxcbiAgYWN0dWFsPSR7SlNPTi5zdHJpbmdpZnkoYWN0dWFsKX1gO1xuXHRcdFx0XHRpZiAoYWN0dWFsICE9PSBleHBlY3RlZCAmJiBhY3R1YWxBbHQgIT09IGV4cGVjdGVkKSB7XG5cdFx0XHRcdFx0ZmFpbHVyZXMucHVzaChgXFxuJHttZXNzYWdlfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFpbHVyZXMubGVuZ3RoLCAwLCBmYWlsdXJlcy5qb2luKCcnKSk7XG5cblx0XHQvLyBpZiAoaXNXaW5kb3dzKSB7XG5cdFx0Ly8gXHQvLyBUZXN0IHJlc29sdmluZyB0aGUgY3VycmVudCBXaW5kb3dzIGRyaXZlIGxldHRlciBmcm9tIGEgc3Bhd25lZCBwcm9jZXNzLlxuXHRcdC8vIFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9pc3N1ZXMvNzIxNVxuXHRcdC8vIFx0Y29uc3QgY3VycmVudERyaXZlTGV0dGVyID0gcGF0aC5wYXJzZShwcm9jZXNzLmN3ZCgpKS5yb290LnN1YnN0cmluZygwLCAyKTtcblx0XHQvLyBcdGNvbnN0IHJlc29sdmVGaXh0dXJlID0gZml4dHVyZXMucGF0aCgncGF0aC1yZXNvbHZlLmpzJyk7XG5cdFx0Ly8gXHRjb25zdCBzcGF3blJlc3VsdCA9IGNoaWxkLnNwYXduU3luYyhcblx0XHQvLyBcdFx0cHJvY2Vzcy5hcmd2WzBdLCBbcmVzb2x2ZUZpeHR1cmUsIGN1cnJlbnREcml2ZUxldHRlcl0pO1xuXHRcdC8vIFx0Y29uc3QgcmVzb2x2ZWRQYXRoID0gc3Bhd25SZXN1bHQuc3Rkb3V0LnRvU3RyaW5nKCkudHJpbSgpO1xuXHRcdC8vIFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkUGF0aC50b0xvd2VyQ2FzZSgpLCBwcm9jZXNzLmN3ZCgpLnRvTG93ZXJDYXNlKCkpO1xuXHRcdC8vIH1cblx0fSk7XG5cblx0dGVzdCgnYmFzZW5hbWUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoX19maWxlbmFtZSksICdwYXRoLnRlc3QuanMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZShfX2ZpbGVuYW1lLCAnLmpzJyksICdwYXRoLnRlc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZSgnLmpzJywgJy5qcycpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJycpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJy9kaXIvYmFzZW5hbWUuZXh0JyksICdiYXNlbmFtZS5leHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZSgnL2Jhc2VuYW1lLmV4dCcpLCAnYmFzZW5hbWUuZXh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJ2Jhc2VuYW1lLmV4dCcpLCAnYmFzZW5hbWUuZXh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJ2Jhc2VuYW1lLmV4dC8nKSwgJ2Jhc2VuYW1lLmV4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCdiYXNlbmFtZS5leHQvLycpLCAnYmFzZW5hbWUuZXh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJ2FhYS9iYmInLCAnL2JiYicpLCAnYmJiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJ2FhYS9iYmInLCAnYS9iYmInKSwgJ2JiYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCdhYWEvYmJiJywgJ2JiYicpLCAnYmJiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJ2FhYS9iYmIvLycsICdiYmInKSwgJ2JiYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCdhYWEvYmJiJywgJ2JiJyksICdiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJ2FhYS9iYmInLCAnYicpLCAnYmInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZSgnL2FhYS9iYmInLCAnL2JiYicpLCAnYmJiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJy9hYWEvYmJiJywgJ2EvYmJiJyksICdiYmInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZSgnL2FhYS9iYmInLCAnYmJiJyksICdiYmInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZSgnL2FhYS9iYmIvLycsICdiYmInKSwgJ2JiYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCcvYWFhL2JiYicsICdiYicpLCAnYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCcvYWFhL2JiYicsICdiJyksICdiYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCcvYWFhL2JiYicpLCAnYmJiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJy9hYWEvJyksICdhYWEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZSgnL2FhYS9iJyksICdiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJy9hL2InKSwgJ2InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZSgnLy9hJyksICdhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJ2EnLCAnYScpLCAnJyk7XG5cblx0XHQvLyBPbiBXaW5kb3dzIGEgYmFja3NsYXNoIGFjdHMgYXMgYSBwYXRoIHNlcGFyYXRvci5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnXFxcXGRpclxcXFxiYXNlbmFtZS5leHQnKSwgJ2Jhc2VuYW1lLmV4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmJhc2VuYW1lKCdcXFxcYmFzZW5hbWUuZXh0JyksICdiYXNlbmFtZS5leHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnYmFzZW5hbWUuZXh0JyksICdiYXNlbmFtZS5leHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnYmFzZW5hbWUuZXh0XFxcXCcpLCAnYmFzZW5hbWUuZXh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ2Jhc2VuYW1lLmV4dFxcXFxcXFxcJyksICdiYXNlbmFtZS5leHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnZm9vJyksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnYWFhXFxcXGJiYicsICdcXFxcYmJiJyksICdiYmInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnYWFhXFxcXGJiYicsICdhXFxcXGJiYicpLCAnYmJiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ2FhYVxcXFxiYmInLCAnYmJiJyksICdiYmInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnYWFhXFxcXGJiYlxcXFxcXFxcXFxcXFxcXFwnLCAnYmJiJyksICdiYmInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnYWFhXFxcXGJiYicsICdiYicpLCAnYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmJhc2VuYW1lKCdhYWFcXFxcYmJiJywgJ2InKSwgJ2JiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ0M6JyksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnQzouJyksICcuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ0M6XFxcXCcpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ0M6XFxcXGRpclxcXFxiYXNlLmV4dCcpLCAnYmFzZS5leHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnQzpcXFxcYmFzZW5hbWUuZXh0JyksICdiYXNlbmFtZS5leHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnQzpiYXNlbmFtZS5leHQnKSwgJ2Jhc2VuYW1lLmV4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmJhc2VuYW1lKCdDOmJhc2VuYW1lLmV4dFxcXFwnKSwgJ2Jhc2VuYW1lLmV4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmJhc2VuYW1lKCdDOmJhc2VuYW1lLmV4dFxcXFxcXFxcJyksICdiYXNlbmFtZS5leHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnQzpmb28nKSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmJhc2VuYW1lKCdmaWxlOnN0cmVhbScpLCAnZmlsZTpzdHJlYW0nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnYScsICdhJyksICcnKTtcblxuXHRcdC8vIE9uIHVuaXggYSBiYWNrc2xhc2ggaXMganVzdCB0cmVhdGVkIGFzIGFueSBvdGhlciBjaGFyYWN0ZXIuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguYmFzZW5hbWUoJ1xcXFxkaXJcXFxcYmFzZW5hbWUuZXh0JyksXG5cdFx0XHQnXFxcXGRpclxcXFxiYXNlbmFtZS5leHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5iYXNlbmFtZSgnXFxcXGJhc2VuYW1lLmV4dCcpLCAnXFxcXGJhc2VuYW1lLmV4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmJhc2VuYW1lKCdiYXNlbmFtZS5leHQnKSwgJ2Jhc2VuYW1lLmV4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmJhc2VuYW1lKCdiYXNlbmFtZS5leHRcXFxcJyksICdiYXNlbmFtZS5leHRcXFxcJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguYmFzZW5hbWUoJ2Jhc2VuYW1lLmV4dFxcXFxcXFxcJyksICdiYXNlbmFtZS5leHRcXFxcXFxcXCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmJhc2VuYW1lKCdmb28nKSwgJ2ZvbycpO1xuXG5cdFx0Ly8gUE9TSVggZmlsZW5hbWVzIG1heSBpbmNsdWRlIGNvbnRyb2wgY2hhcmFjdGVyc1xuXHRcdC8vIGMuZi4gaHR0cDovL3d3dy5kd2hlZWxlci5jb20vZXNzYXlzL2ZpeGluZy11bml4LWxpbnV4LWZpbGVuYW1lcy5odG1sXG5cdFx0Y29uc3QgY29udHJvbENoYXJGaWxlbmFtZSA9IGBJY29uJHtTdHJpbmcuZnJvbUNoYXJDb2RlKDEzKX1gO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmJhc2VuYW1lKGAvYS9iLyR7Y29udHJvbENoYXJGaWxlbmFtZX1gKSxcblx0XHRcdGNvbnRyb2xDaGFyRmlsZW5hbWUpO1xuXG5cdFx0Ly8gVGVzdHMgZnJvbSBWU0NvZGVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZSgnZm9vL2JhcicpLCAnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguYmFzZW5hbWUoJ2Zvb1xcXFxiYXInKSwgJ2Zvb1xcXFxiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnZm9vXFxcXGJhcicpLCAnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJy9mb28vYmFyJyksICdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5iYXNlbmFtZSgnXFxcXGZvb1xcXFxiYXInKSwgJ1xcXFxmb29cXFxcYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ1xcXFxmb29cXFxcYmFyJyksICdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZSgnLi9iYXInKSwgJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmJhc2VuYW1lKCcuXFxcXGJhcicpLCAnLlxcXFxiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnLlxcXFxiYXInKSwgJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCcvYmFyJyksICdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5iYXNlbmFtZSgnXFxcXGJhcicpLCAnXFxcXGJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmJhc2VuYW1lKCdcXFxcYmFyJyksICdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZSgnYmFyLycpLCAnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguYmFzZW5hbWUoJ2JhclxcXFwnKSwgJ2JhclxcXFwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnYmFyXFxcXCcpLCAnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJ2JhcicpLCAnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJy8vLy8vLy8vJyksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5iYXNlbmFtZSgnXFxcXFxcXFxcXFxcXFxcXCcpLCAnXFxcXFxcXFxcXFxcXFxcXCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmJhc2VuYW1lKCdcXFxcXFxcXFxcXFxcXFxcJyksICcnKTtcblx0fSk7XG5cblx0dGVzdCgncmVsYXRpdmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmFpbHVyZXMgPSBbXSBhcyBzdHJpbmdbXTtcblxuXHRcdGNvbnN0IHJlbGF0aXZlVGVzdHMgPSBbXG5cdFx0XHRbcGF0aC53aW4zMi5yZWxhdGl2ZSxcblx0XHRcdC8vIGFyZ3VtZW50cyAgICAgICAgICAgICAgICAgICAgIHJlc3VsdFxuXHRcdFx0W1snYzovYmxhaFxcXFxibGFoJywgJ2Q6L2dhbWVzJywgJ2Q6XFxcXGdhbWVzJ10sXG5cdFx0XHRbJ2M6L2FhYWEvYmJiYicsICdjOi9hYWFhJywgJy4uJ10sXG5cdFx0XHRbJ2M6L2FhYWEvYmJiYicsICdjOi9jY2NjJywgJy4uXFxcXC4uXFxcXGNjY2MnXSxcblx0XHRcdFsnYzovYWFhYS9iYmJiJywgJ2M6L2FhYWEvYmJiYicsICcnXSxcblx0XHRcdFsnYzovYWFhYS9iYmJiJywgJ2M6L2FhYWEvY2NjYycsICcuLlxcXFxjY2NjJ10sXG5cdFx0XHRbJ2M6L2FhYWEvJywgJ2M6L2FhYWEvY2NjYycsICdjY2NjJ10sXG5cdFx0XHRbJ2M6LycsICdjOlxcXFxhYWFhXFxcXGJiYmInLCAnYWFhYVxcXFxiYmJiJ10sXG5cdFx0XHRbJ2M6L2FhYWEvYmJiYicsICdkOlxcXFwnLCAnZDpcXFxcJ10sXG5cdFx0XHRbJ2M6L0FhQWEvYmJiYicsICdjOi9hYWFhL2JiYmInLCAnJ10sXG5cdFx0XHRbJ2M6L2FhYWFhLycsICdjOi9hYWFhL2NjY2MnLCAnLi5cXFxcYWFhYVxcXFxjY2NjJ10sXG5cdFx0XHRbJ0M6XFxcXGZvb1xcXFxiYXJcXFxcYmF6XFxcXHF1dXgnLCAnQzpcXFxcJywgJy4uXFxcXC4uXFxcXC4uXFxcXC4uJ10sXG5cdFx0XHRbJ0M6XFxcXGZvb1xcXFx0ZXN0JywgJ0M6XFxcXGZvb1xcXFx0ZXN0XFxcXGJhclxcXFxwYWNrYWdlLmpzb24nLCAnYmFyXFxcXHBhY2thZ2UuanNvbiddLFxuXHRcdFx0WydDOlxcXFxmb29cXFxcYmFyXFxcXGJhei1xdXV4JywgJ0M6XFxcXGZvb1xcXFxiYXJcXFxcYmF6JywgJy4uXFxcXGJheiddLFxuXHRcdFx0WydDOlxcXFxmb29cXFxcYmFyXFxcXGJheicsICdDOlxcXFxmb29cXFxcYmFyXFxcXGJhei1xdXV4JywgJy4uXFxcXGJhei1xdXV4J10sXG5cdFx0XHRbJ1xcXFxcXFxcZm9vXFxcXGJhcicsICdcXFxcXFxcXGZvb1xcXFxiYXJcXFxcYmF6JywgJ2JheiddLFxuXHRcdFx0WydcXFxcXFxcXGZvb1xcXFxiYXJcXFxcYmF6JywgJ1xcXFxcXFxcZm9vXFxcXGJhcicsICcuLiddLFxuXHRcdFx0WydcXFxcXFxcXGZvb1xcXFxiYXJcXFxcYmF6LXF1dXgnLCAnXFxcXFxcXFxmb29cXFxcYmFyXFxcXGJheicsICcuLlxcXFxiYXonXSxcblx0XHRcdFsnXFxcXFxcXFxmb29cXFxcYmFyXFxcXGJheicsICdcXFxcXFxcXGZvb1xcXFxiYXJcXFxcYmF6LXF1dXgnLCAnLi5cXFxcYmF6LXF1dXgnXSxcblx0XHRcdFsnQzpcXFxcYmF6LXF1dXgnLCAnQzpcXFxcYmF6JywgJy4uXFxcXGJheiddLFxuXHRcdFx0WydDOlxcXFxiYXonLCAnQzpcXFxcYmF6LXF1dXgnLCAnLi5cXFxcYmF6LXF1dXgnXSxcblx0XHRcdFsnXFxcXFxcXFxmb29cXFxcYmF6LXF1dXgnLCAnXFxcXFxcXFxmb29cXFxcYmF6JywgJy4uXFxcXGJheiddLFxuXHRcdFx0WydcXFxcXFxcXGZvb1xcXFxiYXonLCAnXFxcXFxcXFxmb29cXFxcYmF6LXF1dXgnLCAnLi5cXFxcYmF6LXF1dXgnXSxcblx0XHRcdFsnQzpcXFxcYmF6JywgJ1xcXFxcXFxcZm9vXFxcXGJhclxcXFxiYXonLCAnXFxcXFxcXFxmb29cXFxcYmFyXFxcXGJheiddLFxuXHRcdFx0WydcXFxcXFxcXGZvb1xcXFxiYXJcXFxcYmF6JywgJ0M6XFxcXGJheicsICdDOlxcXFxiYXonXVxuXHRcdFx0XVxuXHRcdFx0XSxcblx0XHRcdFtwYXRoLnBvc2l4LnJlbGF0aXZlLFxuXHRcdFx0Ly8gYXJndW1lbnRzICAgICAgICAgIHJlc3VsdFxuXHRcdFx0W1snL3Zhci9saWInLCAnL3ZhcicsICcuLiddLFxuXHRcdFx0WycvdmFyL2xpYicsICcvYmluJywgJy4uLy4uL2JpbiddLFxuXHRcdFx0WycvdmFyL2xpYicsICcvdmFyL2xpYicsICcnXSxcblx0XHRcdFsnL3Zhci9saWInLCAnL3Zhci9hcGFjaGUnLCAnLi4vYXBhY2hlJ10sXG5cdFx0XHRbJy92YXIvJywgJy92YXIvbGliJywgJ2xpYiddLFxuXHRcdFx0WycvJywgJy92YXIvbGliJywgJ3Zhci9saWInXSxcblx0XHRcdFsnL2Zvby90ZXN0JywgJy9mb28vdGVzdC9iYXIvcGFja2FnZS5qc29uJywgJ2Jhci9wYWNrYWdlLmpzb24nXSxcblx0XHRcdFsnL1VzZXJzL2Evd2ViL2IvdGVzdC9tYWlscycsICcvVXNlcnMvYS93ZWIvYicsICcuLi8uLiddLFxuXHRcdFx0WycvZm9vL2Jhci9iYXotcXV1eCcsICcvZm9vL2Jhci9iYXonLCAnLi4vYmF6J10sXG5cdFx0XHRbJy9mb28vYmFyL2JheicsICcvZm9vL2Jhci9iYXotcXV1eCcsICcuLi9iYXotcXV1eCddLFxuXHRcdFx0WycvYmF6LXF1dXgnLCAnL2JheicsICcuLi9iYXonXSxcblx0XHRcdFsnL2JheicsICcvYmF6LXF1dXgnLCAnLi4vYmF6LXF1dXgnXVxuXHRcdFx0XVxuXHRcdFx0XVxuXHRcdF07XG5cdFx0cmVsYXRpdmVUZXN0cy5mb3JFYWNoKCh0ZXN0KSA9PiB7XG5cdFx0XHRjb25zdCByZWxhdGl2ZSA9IHRlc3RbMF07XG5cdFx0XHQvL0B0cy1leHBlY3QtZXJyb3Jcblx0XHRcdHRlc3RbMV0uZm9yRWFjaCgodGVzdCkgPT4ge1xuXHRcdFx0XHQvL0B0cy1leHBlY3QtZXJyb3Jcblx0XHRcdFx0Y29uc3QgYWN0dWFsID0gcmVsYXRpdmUodGVzdFswXSwgdGVzdFsxXSk7XG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkID0gdGVzdFsyXTtcblx0XHRcdFx0Y29uc3Qgb3MgPSByZWxhdGl2ZSA9PT0gcGF0aC53aW4zMi5yZWxhdGl2ZSA/ICd3aW4zMicgOiAncG9zaXgnO1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gYHBhdGguJHtvc30ucmVsYXRpdmUoJHt0ZXN0LnNsaWNlKDAsIDIpLm1hcChKU09OLnN0cmluZ2lmeSkuam9pbignLCcpfSlcXG4gIGV4cGVjdD0ke0pTT04uc3RyaW5naWZ5KGV4cGVjdGVkKX1cXG4gIGFjdHVhbD0ke0pTT04uc3RyaW5naWZ5KGFjdHVhbCl9YDtcblx0XHRcdFx0aWYgKGFjdHVhbCAhPT0gZXhwZWN0ZWQpIHtcblx0XHRcdFx0XHRmYWlsdXJlcy5wdXNoKGBcXG4ke21lc3NhZ2V9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWlsdXJlcy5sZW5ndGgsIDAsIGZhaWx1cmVzLmpvaW4oJycpKTtcblx0fSk7XG5cblx0dGVzdCgnbm9ybWFsaXplJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLm5vcm1hbGl6ZSgnLi9maXh0dXJlcy8vL2IvLi4vYi9jLmpzJyksXG5cdFx0XHQnZml4dHVyZXNcXFxcYlxcXFxjLmpzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIubm9ybWFsaXplKCcvZm9vLy4uLy4uLy4uL2JhcicpLCAnXFxcXGJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLm5vcm1hbGl6ZSgnYS8vYi8vLi4vYicpLCAnYVxcXFxiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIubm9ybWFsaXplKCdhLy9iLy8uL2MnKSwgJ2FcXFxcYlxcXFxjJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIubm9ybWFsaXplKCdhLy9iLy8uJyksICdhXFxcXGInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5ub3JtYWxpemUoJy8vc2VydmVyL3NoYXJlL2Rpci9maWxlLmV4dCcpLFxuXHRcdFx0J1xcXFxcXFxcc2VydmVyXFxcXHNoYXJlXFxcXGRpclxcXFxmaWxlLmV4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLm5vcm1hbGl6ZSgnL2EvYi9jLy4uLy4uLy4uL3gveS96JyksICdcXFxceFxcXFx5XFxcXHonKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5ub3JtYWxpemUoJ0M6JyksICdDOi4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5ub3JtYWxpemUoJ0M6Li5cXFxcYWJjJyksICdDOi4uXFxcXGFiYycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLm5vcm1hbGl6ZSgnQzouLlxcXFwuLlxcXFxhYmNcXFxcLi5cXFxcZGVmJyksXG5cdFx0XHQnQzouLlxcXFwuLlxcXFxkZWYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5ub3JtYWxpemUoJ0M6XFxcXC4nKSwgJ0M6XFxcXCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLm5vcm1hbGl6ZSgnZmlsZTpzdHJlYW0nKSwgJ2ZpbGU6c3RyZWFtJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIubm9ybWFsaXplKCdiYXJcXFxcZm9vLi5cXFxcLi5cXFxcJyksICdiYXJcXFxcJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIubm9ybWFsaXplKCdiYXJcXFxcZm9vLi5cXFxcLi4nKSwgJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLm5vcm1hbGl6ZSgnYmFyXFxcXGZvby4uXFxcXC4uXFxcXGJheicpLCAnYmFyXFxcXGJheicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLm5vcm1hbGl6ZSgnYmFyXFxcXGZvby4uXFxcXCcpLCAnYmFyXFxcXGZvby4uXFxcXCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLm5vcm1hbGl6ZSgnYmFyXFxcXGZvby4uJyksICdiYXJcXFxcZm9vLi4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5ub3JtYWxpemUoJy4uXFxcXGZvby4uXFxcXC4uXFxcXC4uXFxcXGJhcicpLFxuXHRcdFx0Jy4uXFxcXC4uXFxcXGJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLm5vcm1hbGl6ZSgnLi5cXFxcLi4uXFxcXC4uXFxcXC5cXFxcLi4uXFxcXC4uXFxcXC4uXFxcXGJhcicpLFxuXHRcdFx0Jy4uXFxcXC4uXFxcXGJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLm5vcm1hbGl6ZSgnLi4vLi4vLi4vZm9vLy4uLy4uLy4uL2JhcicpLFxuXHRcdFx0Jy4uXFxcXC4uXFxcXC4uXFxcXC4uXFxcXC4uXFxcXGJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLm5vcm1hbGl6ZSgnLi4vLi4vLi4vZm9vLy4uLy4uLy4uL2Jhci8uLi8uLi8nKSxcblx0XHRcdCcuLlxcXFwuLlxcXFwuLlxcXFwuLlxcXFwuLlxcXFwuLlxcXFwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwYXRoLndpbjMyLm5vcm1hbGl6ZSgnLi4vZm9vYmFyL2JhcmZvby9mb28vLi4vLi4vLi4vYmFyLy4uLy4uLycpLFxuXHRcdFx0Jy4uXFxcXC4uXFxcXCdcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHBhdGgud2luMzIubm9ybWFsaXplKCcuLi8uLi4vLi4vZm9vYmFyLy4uLy4uLy4uL2Jhci8uLi8uLi9iYXonKSxcblx0XHRcdCcuLlxcXFwuLlxcXFwuLlxcXFwuLlxcXFxiYXonXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5ub3JtYWxpemUoJ2Zvby9iYXJcXFxcYmF6JyksICdmb29cXFxcYmFyXFxcXGJheicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXgubm9ybWFsaXplKCcuL2ZpeHR1cmVzLy8vYi8uLi9iL2MuanMnKSxcblx0XHRcdCdmaXh0dXJlcy9iL2MuanMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5ub3JtYWxpemUoJy9mb28vLi4vLi4vLi4vYmFyJyksICcvYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXgubm9ybWFsaXplKCdhLy9iLy8uLi9iJyksICdhL2InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5ub3JtYWxpemUoJ2EvL2IvLy4vYycpLCAnYS9iL2MnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5ub3JtYWxpemUoJ2EvL2IvLy4nKSwgJ2EvYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4Lm5vcm1hbGl6ZSgnL2EvYi9jLy4uLy4uLy4uL3gveS96JyksICcveC95L3onKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5ub3JtYWxpemUoJy8vLy4uLy8uL2Zvby8uLy9iYXInKSwgJy9mb28vYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXgubm9ybWFsaXplKCdiYXIvZm9vLi4vLi4vJyksICdiYXIvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXgubm9ybWFsaXplKCdiYXIvZm9vLi4vLi4nKSwgJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4Lm5vcm1hbGl6ZSgnYmFyL2Zvby4uLy4uL2JheicpLCAnYmFyL2JheicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4Lm5vcm1hbGl6ZSgnYmFyL2Zvby4uLycpLCAnYmFyL2Zvby4uLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4Lm5vcm1hbGl6ZSgnYmFyL2Zvby4uJyksICdiYXIvZm9vLi4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5ub3JtYWxpemUoJy4uL2Zvby4uLy4uLy4uL2JhcicpLCAnLi4vLi4vYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXgubm9ybWFsaXplKCcuLi8uLi4vLi4vLi8uLi4vLi4vLi4vYmFyJyksXG5cdFx0XHQnLi4vLi4vYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXgubm9ybWFsaXplKCcuLi8uLi8uLi9mb28vLi4vLi4vLi4vYmFyJyksXG5cdFx0XHQnLi4vLi4vLi4vLi4vLi4vYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXgubm9ybWFsaXplKCcuLi8uLi8uLi9mb28vLi4vLi4vLi4vYmFyLy4uLy4uLycpLFxuXHRcdFx0Jy4uLy4uLy4uLy4uLy4uLy4uLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHBhdGgucG9zaXgubm9ybWFsaXplKCcuLi9mb29iYXIvYmFyZm9vL2Zvby8uLi8uLi8uLi9iYXIvLi4vLi4vJyksXG5cdFx0XHQnLi4vLi4vJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cGF0aC5wb3NpeC5ub3JtYWxpemUoJy4uLy4uLi8uLi9mb29iYXIvLi4vLi4vLi4vYmFyLy4uLy4uL2JheicpLFxuXHRcdFx0Jy4uLy4uLy4uLy4uL2Jheidcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4Lm5vcm1hbGl6ZSgnZm9vL2JhclxcXFxiYXonKSwgJ2Zvby9iYXJcXFxcYmF6Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzQWJzb2x1dGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuaXNBYnNvbHV0ZSgnLycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5pc0Fic29sdXRlKCcvLycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5pc0Fic29sdXRlKCcvL3NlcnZlcicpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5pc0Fic29sdXRlKCcvL3NlcnZlci9maWxlJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmlzQWJzb2x1dGUoJ1xcXFxcXFxcc2VydmVyXFxcXGZpbGUnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuaXNBYnNvbHV0ZSgnXFxcXFxcXFxzZXJ2ZXInKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuaXNBYnNvbHV0ZSgnXFxcXFxcXFwnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuaXNBYnNvbHV0ZSgnYycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuaXNBYnNvbHV0ZSgnYzonKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmlzQWJzb2x1dGUoJ2M6XFxcXCcpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5pc0Fic29sdXRlKCdjOi8nKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuaXNBYnNvbHV0ZSgnYzovLycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5pc0Fic29sdXRlKCdDOi9Vc2Vycy8nKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuaXNBYnNvbHV0ZSgnQzpcXFxcVXNlcnNcXFxcJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmlzQWJzb2x1dGUoJ0M6Y3dkL2Fub3RoZXInKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmlzQWJzb2x1dGUoJ0M6Y3dkXFxcXGFub3RoZXInKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmlzQWJzb2x1dGUoJ2RpcmVjdG9yeS9kaXJlY3RvcnknKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmlzQWJzb2x1dGUoJ2RpcmVjdG9yeVxcXFxkaXJlY3RvcnknKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguaXNBYnNvbHV0ZSgnL2hvbWUvZm9vJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmlzQWJzb2x1dGUoJy9ob21lL2Zvby8uLicpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5pc0Fic29sdXRlKCdiYXIvJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5pc0Fic29sdXRlKCcuL2JheicpLCBmYWxzZSk7XG5cblx0XHQvLyBUZXN0cyBmcm9tIFZTQ29kZTpcblxuXHRcdC8vIEFic29sdXRlIFBhdGhzXG5cdFx0W1xuXHRcdFx0J0M6LycsXG5cdFx0XHQnQzpcXFxcJyxcblx0XHRcdCdDOi9mb28nLFxuXHRcdFx0J0M6XFxcXGZvbycsXG5cdFx0XHQnejovZm9vL2Jhci50eHQnLFxuXHRcdFx0J3o6XFxcXGZvb1xcXFxiYXIudHh0JyxcblxuXHRcdFx0J1xcXFxcXFxcbG9jYWxob3N0XFxcXGMkXFxcXGZvbycsXG5cblx0XHRcdCcvJyxcblx0XHRcdCcvZm9vJ1xuXHRcdF0uZm9yRWFjaChhYnNvbHV0ZVBhdGggPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKHBhdGgud2luMzIuaXNBYnNvbHV0ZShhYnNvbHV0ZVBhdGgpLCBhYnNvbHV0ZVBhdGgpO1xuXHRcdH0pO1xuXG5cdFx0W1xuXHRcdFx0Jy8nLFxuXHRcdFx0Jy9mb28nLFxuXHRcdFx0Jy9mb28vYmFyLnR4dCdcblx0XHRdLmZvckVhY2goYWJzb2x1dGVQYXRoID0+IHtcblx0XHRcdGFzc2VydC5vayhwYXRoLnBvc2l4LmlzQWJzb2x1dGUoYWJzb2x1dGVQYXRoKSwgYWJzb2x1dGVQYXRoKTtcblx0XHR9KTtcblxuXHRcdC8vIFJlbGF0aXZlIFBhdGhzXG5cdFx0W1xuXHRcdFx0JycsXG5cdFx0XHQnZm9vJyxcblx0XHRcdCdmb28vYmFyJyxcblx0XHRcdCcuL2ZvbycsXG5cdFx0XHQnaHR0cDovL2Zvby5jb20vYmFyJ1xuXHRcdF0uZm9yRWFjaChub25BYnNvbHV0ZVBhdGggPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKCFwYXRoLndpbjMyLmlzQWJzb2x1dGUobm9uQWJzb2x1dGVQYXRoKSwgbm9uQWJzb2x1dGVQYXRoKTtcblx0XHR9KTtcblxuXHRcdFtcblx0XHRcdCcnLFxuXHRcdFx0J2ZvbycsXG5cdFx0XHQnZm9vL2JhcicsXG5cdFx0XHQnLi9mb28nLFxuXHRcdFx0J2h0dHA6Ly9mb28uY29tL2JhcicsXG5cdFx0XHQnejovZm9vL2Jhci50eHQnLFxuXHRcdF0uZm9yRWFjaChub25BYnNvbHV0ZVBhdGggPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKCFwYXRoLnBvc2l4LmlzQWJzb2x1dGUobm9uQWJzb2x1dGVQYXRoKSwgbm9uQWJzb2x1dGVQYXRoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncGF0aCcsICgpID0+IHtcblx0XHQvLyBwYXRoLnNlcCB0ZXN0c1xuXHRcdC8vIHdpbmRvd3Ncblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5zZXAsICdcXFxcJyk7XG5cdFx0Ly8gcG9zaXhcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5zZXAsICcvJyk7XG5cblx0XHQvLyBwYXRoLmRlbGltaXRlciB0ZXN0c1xuXHRcdC8vIHdpbmRvd3Ncblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kZWxpbWl0ZXIsICc7Jyk7XG5cdFx0Ly8gcG9zaXhcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5kZWxpbWl0ZXIsICc6Jyk7XG5cblx0XHQvLyBpZiAoaXNXaW5kb3dzKSB7XG5cdFx0Ly8gXHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aCwgcGF0aC53aW4zMik7XG5cdFx0Ly8gfSBlbHNlIHtcblx0XHQvLyBcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLCBwYXRoLnBvc2l4KTtcblx0XHQvLyB9XG5cdH0pO1xuXG5cdC8vIHRlc3QoJ3BlcmYnLCAoKSA9PiB7XG5cdC8vIFx0Y29uc3QgZm9sZGVyTmFtZXMgPSBbXG5cdC8vIFx0XHQnYWJjJyxcblx0Ly8gXHRcdCdVc2VycycsXG5cdC8vIFx0XHQncmVhbGx5bG9uZ2ZvbGRlcm5hbWUnLFxuXHQvLyBcdFx0J3MnLFxuXHQvLyBcdFx0J3JlYWxseXJlYWxseXJlYWxseWxvbmdmb2xkZXJuYW1lJyxcblx0Ly8gXHRcdCdob21lJ1xuXHQvLyBcdF07XG5cblx0Ly8gXHRjb25zdCBiYXNlUGF0aHMgPSBbXG5cdC8vIFx0XHQnQzonLFxuXHQvLyBcdFx0JycsXG5cdC8vIFx0XTtcblxuXHQvLyBcdGNvbnN0IHNlcGFyYXRvcnMgPSBbXG5cdC8vIFx0XHQnXFxcXCcsXG5cdC8vIFx0XHQnLydcblx0Ly8gXHRdO1xuXG5cdC8vIFx0ZnVuY3Rpb24gcmFuZG9tSW50KGNpZWw6IG51bWJlcik6IG51bWJlciB7XG5cdC8vIFx0XHRyZXR1cm4gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogY2llbCk7XG5cdC8vIFx0fVxuXG5cdC8vIFx0bGV0IHBhdGhzVG9Ob3JtYWxpemUgPSBbXTtcblx0Ly8gXHRsZXQgcGF0aHNUb0pvaW4gPSBbXTtcblx0Ly8gXHRsZXQgaTtcblx0Ly8gXHRmb3IgKGkgPSAwOyBpIDwgMTAwMDAwMDsgaSsrKSB7XG5cdC8vIFx0XHRjb25zdCBiYXNlUGF0aCA9IGJhc2VQYXRoc1tyYW5kb21JbnQoYmFzZVBhdGhzLmxlbmd0aCldO1xuXHQvLyBcdFx0bGV0IGxlbmd0aE9mUGF0aCA9IHJhbmRvbUludCgxMCkgKyAyO1xuXG5cdC8vIFx0XHRsZXQgcGF0aFRvTm9ybWFsaXplID0gYmFzZVBhdGggKyBzZXBhcmF0b3JzW3JhbmRvbUludChzZXBhcmF0b3JzLmxlbmd0aCldO1xuXHQvLyBcdFx0d2hpbGUgKGxlbmd0aE9mUGF0aC0tID4gMCkge1xuXHQvLyBcdFx0XHRwYXRoVG9Ob3JtYWxpemUgPSBwYXRoVG9Ob3JtYWxpemUgKyBmb2xkZXJOYW1lc1tyYW5kb21JbnQoZm9sZGVyTmFtZXMubGVuZ3RoKV0gKyBzZXBhcmF0b3JzW3JhbmRvbUludChzZXBhcmF0b3JzLmxlbmd0aCldO1xuXHQvLyBcdFx0fVxuXG5cdC8vIFx0XHRwYXRoc1RvTm9ybWFsaXplLnB1c2gocGF0aFRvTm9ybWFsaXplKTtcblxuXHQvLyBcdFx0bGV0IHBhdGhUb0pvaW4gPSAnJztcblx0Ly8gXHRcdGxlbmd0aE9mUGF0aCA9IHJhbmRvbUludCgxMCkgKyAyO1xuXHQvLyBcdFx0d2hpbGUgKGxlbmd0aE9mUGF0aC0tID4gMCkge1xuXHQvLyBcdFx0XHRwYXRoVG9Kb2luID0gcGF0aFRvSm9pbiArIGZvbGRlck5hbWVzW3JhbmRvbUludChmb2xkZXJOYW1lcy5sZW5ndGgpXSArIHNlcGFyYXRvcnNbcmFuZG9tSW50KHNlcGFyYXRvcnMubGVuZ3RoKV07XG5cdC8vIFx0XHR9XG5cblx0Ly8gXHRcdHBhdGhzVG9Kb2luLnB1c2gocGF0aFRvSm9pbiArICcudHMnKTtcblx0Ly8gXHR9XG5cblx0Ly8gXHRsZXQgbmV3VGltZSA9IDA7XG5cblx0Ly8gXHRsZXQgajtcblx0Ly8gXHRmb3IoaiA9IDA7IGogPCBwYXRoc1RvSm9pbi5sZW5ndGg7IGorKykge1xuXHQvLyBcdFx0Y29uc3QgcGF0aDEgPSBwYXRoc1RvTm9ybWFsaXplW2pdO1xuXHQvLyBcdFx0Y29uc3QgcGF0aDIgPSBwYXRoc1RvTm9ybWFsaXplW2pdO1xuXG5cdC8vIFx0XHRjb25zdCBuZXdTdGFydCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuXHQvLyBcdFx0cGF0aC5qb2luKHBhdGgxLCBwYXRoMik7XG5cdC8vIFx0XHRuZXdUaW1lICs9IHBlcmZvcm1hbmNlLm5vdygpIC0gbmV3U3RhcnQ7XG5cdC8vIFx0fVxuXG5cdC8vIFx0YXNzZXJ0Lm9rKGZhbHNlLCBgVGltZTogJHtuZXdUaW1lfW1zLmApO1xuXHQvLyB9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBNkJBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFVBQVU7QUFDdEIsU0FBUyxPQUFPLGlCQUFpQjtBQUNqQyxZQUFZLGFBQWE7QUFDekIsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSwrQkFBK0IsTUFBTTtBQUMxQyxRQUFNLGFBQWE7QUFDbkIsMENBQXdDO0FBQ3hDLE9BQUssUUFBUSxNQUFNO0FBQ2xCLFVBQU0sV0FBVyxDQUFDO0FBQ2xCLFVBQU0sY0FBYztBQUVwQixVQUFNLFlBQWlCO0FBQUEsTUFDdEI7QUFBQSxRQUFDLENBQUMs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
