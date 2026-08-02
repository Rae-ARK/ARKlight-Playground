import { deepStrictEqual, ok, strictEqual } from "assert";
import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { detectLinks, detectLinkSuffixes, getLinkSuffix, removeLinkQueryString, removeLinkSuffix } from "../../browser/terminalLinkParsing.js";
const operatingSystems = [
  OperatingSystem.Linux,
  OperatingSystem.Macintosh,
  OperatingSystem.Windows
];
const osTestPath = {
  [OperatingSystem.Linux]: "/test/path/linux",
  [OperatingSystem.Macintosh]: "/test/path/macintosh",
  [OperatingSystem.Windows]: "C:\\test\\path\\windows"
};
const osLabel = {
  [OperatingSystem.Linux]: "[Linux]",
  [OperatingSystem.Macintosh]: "[macOS]",
  [OperatingSystem.Windows]: "[Windows]"
};
const testRow = 339;
const testCol = 12;
const testRowEnd = 341;
const testColEnd = 789;
const testLinks = [
  // Simple
  { link: "foo", prefix: void 0, suffix: void 0, hasRow: false, hasCol: false },
  { link: "foo:339", prefix: void 0, suffix: ":339", hasRow: true, hasCol: false },
  { link: "foo:339:12", prefix: void 0, suffix: ":339:12", hasRow: true, hasCol: true },
  { link: "foo:339:12-789", prefix: void 0, suffix: ":339:12-789", hasRow: true, hasCol: true, hasRowEnd: false, hasColEnd: true },
  { link: "foo:339.12", prefix: void 0, suffix: ":339.12", hasRow: true, hasCol: true },
  { link: "foo:339.12-789", prefix: void 0, suffix: ":339.12-789", hasRow: true, hasCol: true, hasRowEnd: false, hasColEnd: true },
  { link: "foo:339.12-341.789", prefix: void 0, suffix: ":339.12-341.789", hasRow: true, hasCol: true, hasRowEnd: true, hasColEnd: true },
  { link: "foo#339", prefix: void 0, suffix: "#339", hasRow: true, hasCol: false },
  { link: "foo#339:12", prefix: void 0, suffix: "#339:12", hasRow: true, hasCol: true },
  { link: "foo#339:12-789", prefix: void 0, suffix: "#339:12-789", hasRow: true, hasCol: true, hasRowEnd: false, hasColEnd: true },
  { link: "foo#339.12", prefix: void 0, suffix: "#339.12", hasRow: true, hasCol: true },
  { link: "foo#339.12-789", prefix: void 0, suffix: "#339.12-789", hasRow: true, hasCol: true, hasRowEnd: false, hasColEnd: true },
  { link: "foo#339.12-341.789", prefix: void 0, suffix: "#339.12-341.789", hasRow: true, hasCol: true, hasRowEnd: true, hasColEnd: true },
  { link: "foo 339", prefix: void 0, suffix: " 339", hasRow: true, hasCol: false },
  { link: "foo 339:12", prefix: void 0, suffix: " 339:12", hasRow: true, hasCol: true },
  { link: "foo 339:12-789", prefix: void 0, suffix: " 339:12-789", hasRow: true, hasCol: true, hasRowEnd: false, hasColEnd: true },
  { link: "foo 339.12", prefix: void 0, suffix: " 339.12", hasRow: true, hasCol: true },
  { link: "foo 339.12-789", prefix: void 0, suffix: " 339.12-789", hasRow: true, hasCol: true, hasRowEnd: false, hasColEnd: true },
  { link: "foo 339.12-341.789", prefix: void 0, suffix: " 339.12-341.789", hasRow: true, hasCol: true, hasRowEnd: true, hasColEnd: true },
  { link: "foo, 339", prefix: void 0, suffix: ", 339", hasRow: true, hasCol: false },
  // Double quotes
  { link: '"foo",339', prefix: '"', suffix: '",339', hasRow: true, hasCol: false },
  { link: '"foo",339:12', prefix: '"', suffix: '",339:12', hasRow: true, hasCol: true },
  { link: '"foo",339.12', prefix: '"', suffix: '",339.12', hasRow: true, hasCol: true },
  { link: '"foo", line 339', prefix: '"', suffix: '", line 339', hasRow: true, hasCol: false },
  { link: '"foo", line 339, col 12', prefix: '"', suffix: '", line 339, col 12', hasRow: true, hasCol: true },
  { link: '"foo", line 339, column 12', prefix: '"', suffix: '", line 339, column 12', hasRow: true, hasCol: true },
  { link: '"foo":line 339', prefix: '"', suffix: '":line 339', hasRow: true, hasCol: false },
  { link: '"foo":line 339, col 12', prefix: '"', suffix: '":line 339, col 12', hasRow: true, hasCol: true },
  { link: '"foo":line 339, column 12', prefix: '"', suffix: '":line 339, column 12', hasRow: true, hasCol: true },
  { link: '"foo": line 339', prefix: '"', suffix: '": line 339', hasRow: true, hasCol: false },
  { link: '"foo": line 339, col 12', prefix: '"', suffix: '": line 339, col 12', hasRow: true, hasCol: true },
  { link: '"foo": line 339, column 12', prefix: '"', suffix: '": line 339, column 12', hasRow: true, hasCol: true },
  { link: '"foo" on line 339', prefix: '"', suffix: '" on line 339', hasRow: true, hasCol: false },
  { link: '"foo" on line 339, col 12', prefix: '"', suffix: '" on line 339, col 12', hasRow: true, hasCol: true },
  { link: '"foo" on line 339, column 12', prefix: '"', suffix: '" on line 339, column 12', hasRow: true, hasCol: true },
  { link: '"foo" line 339', prefix: '"', suffix: '" line 339', hasRow: true, hasCol: false },
  { link: '"foo" line 339 column 12', prefix: '"', suffix: '" line 339 column 12', hasRow: true, hasCol: true },
  // Single quotes
  { link: "'foo',339", prefix: "'", suffix: "',339", hasRow: true, hasCol: false },
  { link: "'foo',339:12", prefix: "'", suffix: "',339:12", hasRow: true, hasCol: true },
  { link: "'foo',339.12", prefix: "'", suffix: "',339.12", hasRow: true, hasCol: true },
  { link: "'foo', line 339", prefix: "'", suffix: "', line 339", hasRow: true, hasCol: false },
  { link: "'foo', line 339, col 12", prefix: "'", suffix: "', line 339, col 12", hasRow: true, hasCol: true },
  { link: "'foo', line 339, column 12", prefix: "'", suffix: "', line 339, column 12", hasRow: true, hasCol: true },
  { link: "'foo':line 339", prefix: "'", suffix: "':line 339", hasRow: true, hasCol: false },
  { link: "'foo':line 339, col 12", prefix: "'", suffix: "':line 339, col 12", hasRow: true, hasCol: true },
  { link: "'foo':line 339, column 12", prefix: "'", suffix: "':line 339, column 12", hasRow: true, hasCol: true },
  { link: "'foo': line 339", prefix: "'", suffix: "': line 339", hasRow: true, hasCol: false },
  { link: "'foo': line 339, col 12", prefix: "'", suffix: "': line 339, col 12", hasRow: true, hasCol: true },
  { link: "'foo': line 339, column 12", prefix: "'", suffix: "': line 339, column 12", hasRow: true, hasCol: true },
  { link: "'foo' on line 339", prefix: "'", suffix: "' on line 339", hasRow: true, hasCol: false },
  { link: "'foo' on line 339, col 12", prefix: "'", suffix: "' on line 339, col 12", hasRow: true, hasCol: true },
  { link: "'foo' on line 339, column 12", prefix: "'", suffix: "' on line 339, column 12", hasRow: true, hasCol: true },
  { link: "'foo' line 339", prefix: "'", suffix: "' line 339", hasRow: true, hasCol: false },
  { link: "'foo' line 339 column 12", prefix: "'", suffix: "' line 339 column 12", hasRow: true, hasCol: true },
  // No quotes
  { link: "foo, line 339", prefix: void 0, suffix: ", line 339", hasRow: true, hasCol: false },
  { link: "foo, line 339, col 12", prefix: void 0, suffix: ", line 339, col 12", hasRow: true, hasCol: true },
  { link: "foo, line 339, column 12", prefix: void 0, suffix: ", line 339, column 12", hasRow: true, hasCol: true },
  { link: "foo:line 339", prefix: void 0, suffix: ":line 339", hasRow: true, hasCol: false },
  { link: "foo:line 339, col 12", prefix: void 0, suffix: ":line 339, col 12", hasRow: true, hasCol: true },
  { link: "foo:line 339, column 12", prefix: void 0, suffix: ":line 339, column 12", hasRow: true, hasCol: true },
  { link: "foo: line 339", prefix: void 0, suffix: ": line 339", hasRow: true, hasCol: false },
  { link: "foo: line 339, col 12", prefix: void 0, suffix: ": line 339, col 12", hasRow: true, hasCol: true },
  { link: "foo: line 339, column 12", prefix: void 0, suffix: ": line 339, column 12", hasRow: true, hasCol: true },
  { link: "foo on line 339", prefix: void 0, suffix: " on line 339", hasRow: true, hasCol: false },
  { link: "foo on line 339, col 12", prefix: void 0, suffix: " on line 339, col 12", hasRow: true, hasCol: true },
  { link: "foo on line 339, column 12", prefix: void 0, suffix: " on line 339, column 12", hasRow: true, hasCol: true },
  { link: "foo line 339", prefix: void 0, suffix: " line 339", hasRow: true, hasCol: false },
  { link: "foo line 339 column 12", prefix: void 0, suffix: " line 339 column 12", hasRow: true, hasCol: true },
  // Parentheses
  { link: "foo(339)", prefix: void 0, suffix: "(339)", hasRow: true, hasCol: false },
  { link: "foo(339,12)", prefix: void 0, suffix: "(339,12)", hasRow: true, hasCol: true },
  { link: "foo(339, 12)", prefix: void 0, suffix: "(339, 12)", hasRow: true, hasCol: true },
  { link: "foo (339)", prefix: void 0, suffix: " (339)", hasRow: true, hasCol: false },
  { link: "foo (339,12)", prefix: void 0, suffix: " (339,12)", hasRow: true, hasCol: true },
  { link: "foo (339, 12)", prefix: void 0, suffix: " (339, 12)", hasRow: true, hasCol: true },
  { link: "foo: (339)", prefix: void 0, suffix: ": (339)", hasRow: true, hasCol: false },
  { link: "foo: (339,12)", prefix: void 0, suffix: ": (339,12)", hasRow: true, hasCol: true },
  { link: "foo: (339, 12)", prefix: void 0, suffix: ": (339, 12)", hasRow: true, hasCol: true },
  { link: "foo(339:12)", prefix: void 0, suffix: "(339:12)", hasRow: true, hasCol: true },
  { link: "foo (339:12)", prefix: void 0, suffix: " (339:12)", hasRow: true, hasCol: true },
  // Square brackets
  { link: "foo[339]", prefix: void 0, suffix: "[339]", hasRow: true, hasCol: false },
  { link: "foo[339,12]", prefix: void 0, suffix: "[339,12]", hasRow: true, hasCol: true },
  { link: "foo[339, 12]", prefix: void 0, suffix: "[339, 12]", hasRow: true, hasCol: true },
  { link: "foo [339]", prefix: void 0, suffix: " [339]", hasRow: true, hasCol: false },
  { link: "foo [339,12]", prefix: void 0, suffix: " [339,12]", hasRow: true, hasCol: true },
  { link: "foo [339, 12]", prefix: void 0, suffix: " [339, 12]", hasRow: true, hasCol: true },
  { link: "foo: [339]", prefix: void 0, suffix: ": [339]", hasRow: true, hasCol: false },
  { link: "foo: [339,12]", prefix: void 0, suffix: ": [339,12]", hasRow: true, hasCol: true },
  { link: "foo: [339, 12]", prefix: void 0, suffix: ": [339, 12]", hasRow: true, hasCol: true },
  { link: "foo[339:12]", prefix: void 0, suffix: "[339:12]", hasRow: true, hasCol: true },
  { link: "foo [339:12]", prefix: void 0, suffix: " [339:12]", hasRow: true, hasCol: true },
  // OCaml-style
  { link: '"foo", line 339, character 12', prefix: '"', suffix: '", line 339, character 12', hasRow: true, hasCol: true },
  { link: '"foo", line 339, characters 12-789', prefix: '"', suffix: '", line 339, characters 12-789', hasRow: true, hasCol: true, hasColEnd: true },
  { link: '"foo", lines 339-341', prefix: '"', suffix: '", lines 339-341', hasRow: true, hasCol: false, hasRowEnd: true },
  { link: '"foo", lines 339-341, characters 12-789', prefix: '"', suffix: '", lines 339-341, characters 12-789', hasRow: true, hasCol: true, hasRowEnd: true, hasColEnd: true },
  // Non-breaking space
  { link: "foo\xA0339:12", prefix: void 0, suffix: "\xA0339:12", hasRow: true, hasCol: true },
  { link: '"foo" on line 339,\xA0column 12', prefix: '"', suffix: '" on line 339,\xA0column 12', hasRow: true, hasCol: true },
  { link: "'foo' on line\xA0339, column 12", prefix: "'", suffix: "' on line\xA0339, column 12", hasRow: true, hasCol: true },
  { link: "foo (339,\xA012)", prefix: void 0, suffix: " (339,\xA012)", hasRow: true, hasCol: true },
  { link: "foo\xA0[339, 12]", prefix: void 0, suffix: "\xA0[339, 12]", hasRow: true, hasCol: true }
];
const testLinksWithSuffix = testLinks.filter((e) => !!e.suffix);
suite("TerminalLinkParsing", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("removeLinkSuffix", () => {
    for (const testLink of testLinks) {
      test("`" + testLink.link + "`", () => {
        deepStrictEqual(
          removeLinkSuffix(testLink.link),
          testLink.suffix === void 0 ? testLink.link : testLink.link.replace(testLink.suffix, "")
        );
      });
    }
  });
  suite("getLinkSuffix", () => {
    for (const testLink of testLinks) {
      test("`" + testLink.link + "`", () => {
        deepStrictEqual(
          getLinkSuffix(testLink.link),
          testLink.suffix === void 0 ? null : {
            row: testLink.hasRow ? testRow : void 0,
            col: testLink.hasCol ? testCol : void 0,
            rowEnd: testLink.hasRowEnd ? testRowEnd : void 0,
            colEnd: testLink.hasColEnd ? testColEnd : void 0,
            suffix: {
              index: testLink.link.length - testLink.suffix.length,
              text: testLink.suffix
            }
          }
        );
      });
    }
  });
  suite("detectLinkSuffixes", () => {
    for (const testLink of testLinks) {
      test("`" + testLink.link + "`", () => {
        deepStrictEqual(
          detectLinkSuffixes(testLink.link),
          testLink.suffix === void 0 ? [] : [{
            row: testLink.hasRow ? testRow : void 0,
            col: testLink.hasCol ? testCol : void 0,
            rowEnd: testLink.hasRowEnd ? testRowEnd : void 0,
            colEnd: testLink.hasColEnd ? testColEnd : void 0,
            suffix: {
              index: testLink.link.length - testLink.suffix.length,
              text: testLink.suffix
            }
          }]
        );
      });
    }
    test("foo(1, 2) bar[3, 4] baz on line 5", () => {
      deepStrictEqual(
        detectLinkSuffixes("foo(1, 2) bar[3, 4] baz on line 5"),
        [
          {
            col: 2,
            row: 1,
            rowEnd: void 0,
            colEnd: void 0,
            suffix: {
              index: 3,
              text: "(1, 2)"
            }
          },
          {
            col: 4,
            row: 3,
            rowEnd: void 0,
            colEnd: void 0,
            suffix: {
              index: 13,
              text: "[3, 4]"
            }
          },
          {
            col: void 0,
            row: 5,
            rowEnd: void 0,
            colEnd: void 0,
            suffix: {
              index: 23,
              text: " on line 5"
            }
          }
        ]
      );
    });
  });
  suite("removeLinkQueryString", () => {
    test("should remove any query string from the link", () => {
      strictEqual(removeLinkQueryString("?a=b"), "");
      strictEqual(removeLinkQueryString("foo?a=b"), "foo");
      strictEqual(removeLinkQueryString("./foo?a=b"), "./foo");
      strictEqual(removeLinkQueryString("/foo/bar?a=b"), "/foo/bar");
      strictEqual(removeLinkQueryString("foo?a=b?"), "foo");
      strictEqual(removeLinkQueryString("foo?a=b&c=d"), "foo");
    });
    test("should respect ? in UNC paths", () => {
      strictEqual(removeLinkQueryString("\\\\?\\foo?a=b"), "\\\\?\\foo");
    });
  });
  suite("detectLinks", () => {
    test('foo(1, 2) bar[3, 4] "baz" on line 5', () => {
      deepStrictEqual(
        detectLinks('foo(1, 2) bar[3, 4] "baz" on line 5', OperatingSystem.Linux),
        [
          {
            path: {
              index: 0,
              text: "foo"
            },
            prefix: void 0,
            suffix: {
              col: 2,
              row: 1,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: {
                index: 3,
                text: "(1, 2)"
              }
            }
          },
          {
            path: {
              index: 10,
              text: "bar"
            },
            prefix: void 0,
            suffix: {
              col: 4,
              row: 3,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: {
                index: 13,
                text: "[3, 4]"
              }
            }
          },
          {
            path: {
              index: 21,
              text: "baz"
            },
            prefix: {
              index: 20,
              text: '"'
            },
            suffix: {
              col: void 0,
              row: 5,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: {
                index: 24,
                text: '" on line 5'
              }
            }
          }
        ]
      );
    });
    test("should detect multiple links when opening brackets are in the text", () => {
      deepStrictEqual(
        detectLinks("notlink[foo:45]", OperatingSystem.Linux),
        [
          {
            path: {
              index: 0,
              text: "notlink[foo"
            },
            prefix: void 0,
            suffix: {
              col: void 0,
              row: 45,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: {
                index: 11,
                text: ":45"
              }
            }
          },
          {
            path: {
              index: 8,
              text: "foo"
            },
            prefix: void 0,
            suffix: {
              col: void 0,
              row: 45,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: {
                index: 11,
                text: ":45"
              }
            }
          }
        ]
      );
    });
    test("should extract the link prefix", () => {
      deepStrictEqual(
        detectLinks('"foo", line 5, col 6', OperatingSystem.Linux),
        [
          {
            path: {
              index: 1,
              text: "foo"
            },
            prefix: {
              index: 0,
              text: '"'
            },
            suffix: {
              row: 5,
              col: 6,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: {
                index: 4,
                text: '", line 5, col 6'
              }
            }
          }
        ]
      );
    });
    test("should be smart about determining the link prefix when multiple prefix characters exist", () => {
      deepStrictEqual(
        detectLinks(`echo '"foo", line 5, col 6'`, OperatingSystem.Linux),
        [
          {
            path: {
              index: 7,
              text: "foo"
            },
            prefix: {
              index: 6,
              text: '"'
            },
            suffix: {
              row: 5,
              col: 6,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: {
                index: 10,
                text: '", line 5, col 6'
              }
            }
          }
        ],
        "The outer single quotes should be excluded from the link prefix and suffix"
      );
    });
    test("should detect both suffix and non-suffix links on a single line", () => {
      deepStrictEqual(
        detectLinks(`PS C:\\Github\\microsoft\\vscode> echo '"foo", line 5, col 6'`, OperatingSystem.Windows),
        [
          {
            path: {
              index: 3,
              text: "C:\\Github\\microsoft\\vscode"
            },
            prefix: void 0,
            suffix: void 0
          },
          {
            path: {
              index: 38,
              text: "foo"
            },
            prefix: {
              index: 37,
              text: '"'
            },
            suffix: {
              row: 5,
              col: 6,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: {
                index: 41,
                text: '", line 5, col 6'
              }
            }
          }
        ]
      );
    });
    suite('"|"', () => {
      test("should exclude pipe characters from link paths", () => {
        deepStrictEqual(
          detectLinks("|C:\\Github\\microsoft\\vscode|", OperatingSystem.Windows),
          [
            {
              path: {
                index: 1,
                text: "C:\\Github\\microsoft\\vscode"
              },
              prefix: void 0,
              suffix: void 0
            }
          ]
        );
      });
      test("should exclude pipe characters from link paths with suffixes", () => {
        deepStrictEqual(
          detectLinks("|C:\\Github\\microsoft\\vscode:400|", OperatingSystem.Windows),
          [
            {
              path: {
                index: 1,
                text: "C:\\Github\\microsoft\\vscode"
              },
              prefix: void 0,
              suffix: {
                col: void 0,
                row: 400,
                rowEnd: void 0,
                colEnd: void 0,
                suffix: {
                  index: 27,
                  text: ":400"
                }
              }
            }
          ]
        );
      });
    });
    suite('"<>"', () => {
      for (const os of operatingSystems) {
        test(`should exclude bracket characters from link paths ${osLabel[os]}`, () => {
          deepStrictEqual(
            detectLinks(`<${osTestPath[os]}<`, os),
            [
              {
                path: {
                  index: 1,
                  text: osTestPath[os]
                },
                prefix: void 0,
                suffix: void 0
              }
            ]
          );
          deepStrictEqual(
            detectLinks(`>${osTestPath[os]}>`, os),
            [
              {
                path: {
                  index: 1,
                  text: osTestPath[os]
                },
                prefix: void 0,
                suffix: void 0
              }
            ]
          );
        });
        test(`should exclude bracket characters from link paths with suffixes ${osLabel[os]}`, () => {
          deepStrictEqual(
            detectLinks(`<${osTestPath[os]}:400<`, os),
            [
              {
                path: {
                  index: 1,
                  text: osTestPath[os]
                },
                prefix: void 0,
                suffix: {
                  col: void 0,
                  row: 400,
                  rowEnd: void 0,
                  colEnd: void 0,
                  suffix: {
                    index: 1 + osTestPath[os].length,
                    text: ":400"
                  }
                }
              }
            ]
          );
          deepStrictEqual(
            detectLinks(`>${osTestPath[os]}:400>`, os),
            [
              {
                path: {
                  index: 1,
                  text: osTestPath[os]
                },
                prefix: void 0,
                suffix: {
                  col: void 0,
                  row: 400,
                  rowEnd: void 0,
                  colEnd: void 0,
                  suffix: {
                    index: 1 + osTestPath[os].length,
                    text: ":400"
                  }
                }
              }
            ]
          );
        });
      }
    });
    suite("query strings", () => {
      for (const os of operatingSystems) {
        test(`should exclude query strings from link paths ${osLabel[os]}`, () => {
          deepStrictEqual(
            detectLinks(`${osTestPath[os]}?a=b`, os),
            [
              {
                path: {
                  index: 0,
                  text: osTestPath[os]
                },
                prefix: void 0,
                suffix: void 0
              }
            ]
          );
          deepStrictEqual(
            detectLinks(`${osTestPath[os]}?a=b&c=d`, os),
            [
              {
                path: {
                  index: 0,
                  text: osTestPath[os]
                },
                prefix: void 0,
                suffix: void 0
              }
            ]
          );
        });
        test("should not detect links starting with ? within query strings that contain posix-style paths (#204195)", () => {
          strictEqual(detectLinks(`http://foo.com/?bar=/a/b&baz=c`, os).some((e) => e.path.text.startsWith("?")), false);
        });
        test("should not detect links starting with ? within query strings that contain Windows-style paths (#204195)", () => {
          strictEqual(detectLinks(`http://foo.com/?bar=a:\\b&baz=c`, os).some((e) => e.path.text.startsWith("?")), false);
        });
      }
    });
    suite("should detect file names in git diffs", () => {
      test("--- a/foo/bar", () => {
        ["a", "c", "w", "i", "o"].forEach((prefix) => {
          deepStrictEqual(
            detectLinks(`--- ${prefix}/foo/bar`, OperatingSystem.Linux),
            [
              {
                path: {
                  index: 6,
                  text: "foo/bar"
                },
                prefix: void 0,
                suffix: void 0
              }
            ]
          );
        });
      });
      test("+++ b/foo/bar", () => {
        ["b", "c", "w", "i", "o"].forEach((prefix) => {
          deepStrictEqual(
            detectLinks(`+++ ${prefix}/foo/bar`, OperatingSystem.Linux),
            [
              {
                path: {
                  index: 6,
                  text: "foo/bar"
                },
                prefix: void 0,
                suffix: void 0
              }
            ]
          );
        });
      });
      test("diff --git a/foo/bar b/foo/baz", () => {
        [["a", "b"], ["c", "w"], ["i", "o"]].forEach(([sourcePrefix, destinationPrefix]) => {
          deepStrictEqual(
            detectLinks(`diff --git ${sourcePrefix}/foo/bar ${destinationPrefix}/foo/baz`, OperatingSystem.Linux),
            [
              {
                path: {
                  index: 13,
                  text: "foo/bar"
                },
                prefix: void 0,
                suffix: void 0
              },
              {
                path: {
                  index: 23,
                  text: "foo/baz"
                },
                prefix: void 0,
                suffix: void 0
              }
            ]
          );
        });
      });
      test("numeric prefixes used by git diff --no-index", () => {
        deepStrictEqual(
          [
            detectLinks("--- 1/foo/bar", OperatingSystem.Linux),
            detectLinks("+++ 2/foo/baz", OperatingSystem.Linux),
            detectLinks("diff --git 1/foo/bar 2/foo/baz", OperatingSystem.Linux)
          ],
          [
            [{
              path: { index: 6, text: "foo/bar" },
              prefix: void 0,
              suffix: void 0
            }],
            [{
              path: { index: 6, text: "foo/baz" },
              prefix: void 0,
              suffix: void 0
            }],
            [{
              path: { index: 13, text: "foo/bar" },
              prefix: void 0,
              suffix: void 0
            }, {
              path: { index: 23, text: "foo/baz" },
              prefix: void 0,
              suffix: void 0
            }]
          ]
        );
      });
      test("reversed numeric prefixes used by git diff --no-index -R", () => {
        deepStrictEqual(
          [
            detectLinks("--- 2/foo/baz", OperatingSystem.Linux),
            detectLinks("+++ 1/foo/bar", OperatingSystem.Linux),
            detectLinks("diff --git 2/foo/baz 1/foo/bar", OperatingSystem.Linux)
          ],
          [
            [{
              path: { index: 6, text: "foo/baz" },
              prefix: void 0,
              suffix: void 0
            }],
            [{
              path: { index: 6, text: "foo/bar" },
              prefix: void 0,
              suffix: void 0
            }],
            [{
              path: { index: 13, text: "foo/baz" },
              prefix: void 0,
              suffix: void 0
            }, {
              path: { index: 23, text: "foo/bar" },
              prefix: void 0,
              suffix: void 0
            }]
          ]
        );
      });
      test("ordinary numeric line suffix", () => {
        deepStrictEqual(
          detectLinks("foo 1", OperatingSystem.Linux),
          [{
            path: { index: 0, text: "foo" },
            prefix: void 0,
            suffix: {
              row: 1,
              col: void 0,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: { index: 3, text: " 1" }
            }
          }]
        );
      });
      test("numeric suffix followed by a path separator", () => {
        deepStrictEqual(
          detectLinks("foo 1/bar", OperatingSystem.Linux),
          [{
            path: { index: 4, text: "1/bar" },
            prefix: void 0,
            suffix: void 0
          }]
        );
      });
      test("ordinary numeric line suffix after diff --git text", () => {
        deepStrictEqual(
          detectLinks("diff --git foo.ts:123", OperatingSystem.Linux),
          [{
            path: { index: 11, text: "foo.ts" },
            prefix: void 0,
            suffix: {
              row: 123,
              col: void 0,
              rowEnd: void 0,
              colEnd: void 0,
              suffix: { index: 17, text: ":123" }
            }
          }]
        );
      });
    });
    suite("should detect 3 suffix links on a single line", () => {
      for (let i = 0; i < testLinksWithSuffix.length - 2; i++) {
        const link1 = testLinksWithSuffix[i];
        const link2 = testLinksWithSuffix[i + 1];
        const link3 = testLinksWithSuffix[i + 2];
        const line = ` ${link1.link} ${link2.link} ${link3.link} `;
        test("`" + line.replaceAll("\xA0", "<nbsp>") + "`", () => {
          strictEqual(detectLinks(line, OperatingSystem.Linux).length, 3);
          ok(link1.suffix);
          ok(link2.suffix);
          ok(link3.suffix);
          const detectedLink1 = {
            prefix: link1.prefix ? {
              index: 1,
              text: link1.prefix
            } : void 0,
            path: {
              index: 1 + (link1.prefix?.length ?? 0),
              text: link1.link.replace(link1.suffix, "").replace(link1.prefix || "", "")
            },
            suffix: {
              row: link1.hasRow ? testRow : void 0,
              col: link1.hasCol ? testCol : void 0,
              rowEnd: link1.hasRowEnd ? testRowEnd : void 0,
              colEnd: link1.hasColEnd ? testColEnd : void 0,
              suffix: {
                index: 1 + (link1.link.length - link1.suffix.length),
                text: link1.suffix
              }
            }
          };
          const detectedLink2 = {
            prefix: link2.prefix ? {
              index: (detectedLink1.prefix?.index ?? detectedLink1.path.index) + link1.link.length + 1,
              text: link2.prefix
            } : void 0,
            path: {
              index: (detectedLink1.prefix?.index ?? detectedLink1.path.index) + link1.link.length + 1 + (link2.prefix ?? "").length,
              text: link2.link.replace(link2.suffix, "").replace(link2.prefix ?? "", "")
            },
            suffix: {
              row: link2.hasRow ? testRow : void 0,
              col: link2.hasCol ? testCol : void 0,
              rowEnd: link2.hasRowEnd ? testRowEnd : void 0,
              colEnd: link2.hasColEnd ? testColEnd : void 0,
              suffix: {
                index: (detectedLink1.prefix?.index ?? detectedLink1.path.index) + link1.link.length + 1 + (link2.link.length - link2.suffix.length),
                text: link2.suffix
              }
            }
          };
          const detectedLink3 = {
            prefix: link3.prefix ? {
              index: (detectedLink2.prefix?.index ?? detectedLink2.path.index) + link2.link.length + 1,
              text: link3.prefix
            } : void 0,
            path: {
              index: (detectedLink2.prefix?.index ?? detectedLink2.path.index) + link2.link.length + 1 + (link3.prefix ?? "").length,
              text: link3.link.replace(link3.suffix, "").replace(link3.prefix ?? "", "")
            },
            suffix: {
              row: link3.hasRow ? testRow : void 0,
              col: link3.hasCol ? testCol : void 0,
              rowEnd: link3.hasRowEnd ? testRowEnd : void 0,
              colEnd: link3.hasColEnd ? testColEnd : void 0,
              suffix: {
                index: (detectedLink2.prefix?.index ?? detectedLink2.path.index) + link2.link.length + 1 + (link3.link.length - link3.suffix.length),
                text: link3.suffix
              }
            }
          };
          deepStrictEqual(
            detectLinks(line, OperatingSystem.Linux),
            [detectedLink1, detectedLink2, detectedLink3]
          );
        });
      }
    });
    suite("should ignore links with suffixes when the path itself is the empty string", () => {
      deepStrictEqual(
        detectLinks('""",1', OperatingSystem.Linux),
        []
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9saW5rcy90ZXN0L2Jyb3dzZXIvdGVybWluYWxMaW5rUGFyc2luZy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsLCBvaywgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBkZXRlY3RMaW5rcywgZGV0ZWN0TGlua1N1ZmZpeGVzLCBnZXRMaW5rU3VmZml4LCBJUGFyc2VkTGluaywgcmVtb3ZlTGlua1F1ZXJ5U3RyaW5nLCByZW1vdmVMaW5rU3VmZml4IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbExpbmtQYXJzaW5nLmpzJztcblxuaW50ZXJmYWNlIElUZXN0TGluayB7XG5cdGxpbms6IHN0cmluZztcblx0cHJlZml4OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHN1ZmZpeDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvLyBUT0RPOiBUaGVzZSBoYXMgdmFycyB3b3VsZCBiZSBuaWNlciBhcyBhIGZsYWdzIGVudW1cblx0aGFzUm93OiBib29sZWFuO1xuXHRoYXNDb2w6IGJvb2xlYW47XG5cdGhhc1Jvd0VuZD86IGJvb2xlYW47XG5cdGhhc0NvbEVuZD86IGJvb2xlYW47XG59XG5cbmNvbnN0IG9wZXJhdGluZ1N5c3RlbXM6IFJlYWRvbmx5QXJyYXk8T3BlcmF0aW5nU3lzdGVtPiA9IFtcblx0T3BlcmF0aW5nU3lzdGVtLkxpbnV4LFxuXHRPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoLFxuXHRPcGVyYXRpbmdTeXN0ZW0uV2luZG93c1xuXTtcbmNvbnN0IG9zVGVzdFBhdGg6IHsgW2tleTogbnVtYmVyIHwgT3BlcmF0aW5nU3lzdGVtXTogc3RyaW5nIH0gPSB7XG5cdFtPcGVyYXRpbmdTeXN0ZW0uTGludXhdOiAnL3Rlc3QvcGF0aC9saW51eCcsXG5cdFtPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoXTogJy90ZXN0L3BhdGgvbWFjaW50b3NoJyxcblx0W09wZXJhdGluZ1N5c3RlbS5XaW5kb3dzXTogJ0M6XFxcXHRlc3RcXFxccGF0aFxcXFx3aW5kb3dzJ1xufTtcbmNvbnN0IG9zTGFiZWw6IHsgW2tleTogbnVtYmVyIHwgT3BlcmF0aW5nU3lzdGVtXTogc3RyaW5nIH0gPSB7XG5cdFtPcGVyYXRpbmdTeXN0ZW0uTGludXhdOiAnW0xpbnV4XScsXG5cdFtPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoXTogJ1ttYWNPU10nLFxuXHRbT3BlcmF0aW5nU3lzdGVtLldpbmRvd3NdOiAnW1dpbmRvd3NdJ1xufTtcblxuY29uc3QgdGVzdFJvdyA9IDMzOTtcbmNvbnN0IHRlc3RDb2wgPSAxMjtcbmNvbnN0IHRlc3RSb3dFbmQgPSAzNDE7XG5jb25zdCB0ZXN0Q29sRW5kID0gNzg5O1xuY29uc3QgdGVzdExpbmtzOiBJVGVzdExpbmtbXSA9IFtcblx0Ly8gU2ltcGxlXG5cdHsgbGluazogJ2ZvbycsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6IHVuZGVmaW5lZCwgaGFzUm93OiBmYWxzZSwgaGFzQ29sOiBmYWxzZSB9LFxuXHR7IGxpbms6ICdmb286MzM5JywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJzozMzknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnZm9vOjMzOToxMicsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICc6MzM5OjEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vOjMzOToxMi03ODknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnOjMzOToxMi03ODknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSwgaGFzUm93RW5kOiBmYWxzZSwgaGFzQ29sRW5kOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbzozMzkuMTInLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnOjMzOS4xMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbzozMzkuMTItNzg5JywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJzozMzkuMTItNzg5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUsIGhhc1Jvd0VuZDogZmFsc2UsIGhhc0NvbEVuZDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb286MzM5LjEyLTM0MS43ODknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnOjMzOS4xMi0zNDEuNzg5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUsIGhhc1Jvd0VuZDogdHJ1ZSwgaGFzQ29sRW5kOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbyMzMzknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnIzMzOScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSB9LFxuXHR7IGxpbms6ICdmb28jMzM5OjEyJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJyMzMzk6MTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28jMzM5OjEyLTc4OScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcjMzM5OjEyLTc4OScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlLCBoYXNSb3dFbmQ6IGZhbHNlLCBoYXNDb2xFbmQ6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vIzMzOS4xMicsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcjMzM5LjEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vIzMzOS4xMi03ODknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnIzMzOS4xMi03ODknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSwgaGFzUm93RW5kOiBmYWxzZSwgaGFzQ29sRW5kOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbyMzMzkuMTItMzQxLjc4OScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcjMzM5LjEyLTM0MS43ODknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSwgaGFzUm93RW5kOiB0cnVlLCBoYXNDb2xFbmQ6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vIDMzOScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcgMzM5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IGZhbHNlIH0sXG5cdHsgbGluazogJ2ZvbyAzMzk6MTInLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnIDMzOToxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbyAzMzk6MTItNzg5JywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJyAzMzk6MTItNzg5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUsIGhhc1Jvd0VuZDogZmFsc2UsIGhhc0NvbEVuZDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28gMzM5LjEyJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJyAzMzkuMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28gMzM5LjEyLTc4OScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcgMzM5LjEyLTc4OScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlLCBoYXNSb3dFbmQ6IGZhbHNlLCBoYXNDb2xFbmQ6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vIDMzOS4xMi0zNDEuNzg5JywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJyAzMzkuMTItMzQxLjc4OScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlLCBoYXNSb3dFbmQ6IHRydWUsIGhhc0NvbEVuZDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28sIDMzOScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcsIDMzOScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSB9LFxuXG5cdC8vIERvdWJsZSBxdW90ZXNcblx0eyBsaW5rOiAnXCJmb29cIiwzMzknLCBwcmVmaXg6ICdcIicsIHN1ZmZpeDogJ1wiLDMzOScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSB9LFxuXHR7IGxpbms6ICdcImZvb1wiLDMzOToxMicsIHByZWZpeDogJ1wiJywgc3VmZml4OiAnXCIsMzM5OjEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnXCJmb29cIiwzMzkuMTInLCBwcmVmaXg6ICdcIicsIHN1ZmZpeDogJ1wiLDMzOS4xMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1wiZm9vXCIsIGxpbmUgMzM5JywgcHJlZml4OiAnXCInLCBzdWZmaXg6ICdcIiwgbGluZSAzMzknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnXCJmb29cIiwgbGluZSAzMzksIGNvbCAxMicsIHByZWZpeDogJ1wiJywgc3VmZml4OiAnXCIsIGxpbmUgMzM5LCBjb2wgMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcImZvb1wiLCBsaW5lIDMzOSwgY29sdW1uIDEyJywgcHJlZml4OiAnXCInLCBzdWZmaXg6ICdcIiwgbGluZSAzMzksIGNvbHVtbiAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1wiZm9vXCI6bGluZSAzMzknLCBwcmVmaXg6ICdcIicsIHN1ZmZpeDogJ1wiOmxpbmUgMzM5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IGZhbHNlIH0sXG5cdHsgbGluazogJ1wiZm9vXCI6bGluZSAzMzksIGNvbCAxMicsIHByZWZpeDogJ1wiJywgc3VmZml4OiAnXCI6bGluZSAzMzksIGNvbCAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1wiZm9vXCI6bGluZSAzMzksIGNvbHVtbiAxMicsIHByZWZpeDogJ1wiJywgc3VmZml4OiAnXCI6bGluZSAzMzksIGNvbHVtbiAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1wiZm9vXCI6IGxpbmUgMzM5JywgcHJlZml4OiAnXCInLCBzdWZmaXg6ICdcIjogbGluZSAzMzknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnXCJmb29cIjogbGluZSAzMzksIGNvbCAxMicsIHByZWZpeDogJ1wiJywgc3VmZml4OiAnXCI6IGxpbmUgMzM5LCBjb2wgMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcImZvb1wiOiBsaW5lIDMzOSwgY29sdW1uIDEyJywgcHJlZml4OiAnXCInLCBzdWZmaXg6ICdcIjogbGluZSAzMzksIGNvbHVtbiAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1wiZm9vXCIgb24gbGluZSAzMzknLCBwcmVmaXg6ICdcIicsIHN1ZmZpeDogJ1wiIG9uIGxpbmUgMzM5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IGZhbHNlIH0sXG5cdHsgbGluazogJ1wiZm9vXCIgb24gbGluZSAzMzksIGNvbCAxMicsIHByZWZpeDogJ1wiJywgc3VmZml4OiAnXCIgb24gbGluZSAzMzksIGNvbCAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1wiZm9vXCIgb24gbGluZSAzMzksIGNvbHVtbiAxMicsIHByZWZpeDogJ1wiJywgc3VmZml4OiAnXCIgb24gbGluZSAzMzksIGNvbHVtbiAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1wiZm9vXCIgbGluZSAzMzknLCBwcmVmaXg6ICdcIicsIHN1ZmZpeDogJ1wiIGxpbmUgMzM5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IGZhbHNlIH0sXG5cdHsgbGluazogJ1wiZm9vXCIgbGluZSAzMzkgY29sdW1uIDEyJywgcHJlZml4OiAnXCInLCBzdWZmaXg6ICdcIiBsaW5lIDMzOSBjb2x1bW4gMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXG5cdC8vIFNpbmdsZSBxdW90ZXNcblx0eyBsaW5rOiAnXFwnZm9vXFwnLDMzOScsIHByZWZpeDogJ1xcJycsIHN1ZmZpeDogJ1xcJywzMzknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnXFwnZm9vXFwnLDMzOToxMicsIHByZWZpeDogJ1xcJycsIHN1ZmZpeDogJ1xcJywzMzk6MTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcXCdmb29cXCcsMzM5LjEyJywgcHJlZml4OiAnXFwnJywgc3VmZml4OiAnXFwnLDMzOS4xMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1xcJ2Zvb1xcJywgbGluZSAzMzknLCBwcmVmaXg6ICdcXCcnLCBzdWZmaXg6ICdcXCcsIGxpbmUgMzM5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IGZhbHNlIH0sXG5cdHsgbGluazogJ1xcJ2Zvb1xcJywgbGluZSAzMzksIGNvbCAxMicsIHByZWZpeDogJ1xcJycsIHN1ZmZpeDogJ1xcJywgbGluZSAzMzksIGNvbCAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1xcJ2Zvb1xcJywgbGluZSAzMzksIGNvbHVtbiAxMicsIHByZWZpeDogJ1xcJycsIHN1ZmZpeDogJ1xcJywgbGluZSAzMzksIGNvbHVtbiAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1xcJ2Zvb1xcJzpsaW5lIDMzOScsIHByZWZpeDogJ1xcJycsIHN1ZmZpeDogJ1xcJzpsaW5lIDMzOScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSB9LFxuXHR7IGxpbms6ICdcXCdmb29cXCc6bGluZSAzMzksIGNvbCAxMicsIHByZWZpeDogJ1xcJycsIHN1ZmZpeDogJ1xcJzpsaW5lIDMzOSwgY29sIDEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnXFwnZm9vXFwnOmxpbmUgMzM5LCBjb2x1bW4gMTInLCBwcmVmaXg6ICdcXCcnLCBzdWZmaXg6ICdcXCc6bGluZSAzMzksIGNvbHVtbiAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1xcJ2Zvb1xcJzogbGluZSAzMzknLCBwcmVmaXg6ICdcXCcnLCBzdWZmaXg6ICdcXCc6IGxpbmUgMzM5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IGZhbHNlIH0sXG5cdHsgbGluazogJ1xcJ2Zvb1xcJzogbGluZSAzMzksIGNvbCAxMicsIHByZWZpeDogJ1xcJycsIHN1ZmZpeDogJ1xcJzogbGluZSAzMzksIGNvbCAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1xcJ2Zvb1xcJzogbGluZSAzMzksIGNvbHVtbiAxMicsIHByZWZpeDogJ1xcJycsIHN1ZmZpeDogJ1xcJzogbGluZSAzMzksIGNvbHVtbiAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1xcJ2Zvb1xcJyBvbiBsaW5lIDMzOScsIHByZWZpeDogJ1xcJycsIHN1ZmZpeDogJ1xcJyBvbiBsaW5lIDMzOScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSB9LFxuXHR7IGxpbms6ICdcXCdmb29cXCcgb24gbGluZSAzMzksIGNvbCAxMicsIHByZWZpeDogJ1xcJycsIHN1ZmZpeDogJ1xcJyBvbiBsaW5lIDMzOSwgY29sIDEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnXFwnZm9vXFwnIG9uIGxpbmUgMzM5LCBjb2x1bW4gMTInLCBwcmVmaXg6ICdcXCcnLCBzdWZmaXg6ICdcXCcgb24gbGluZSAzMzksIGNvbHVtbiAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ1xcJ2Zvb1xcJyBsaW5lIDMzOScsIHByZWZpeDogJ1xcJycsIHN1ZmZpeDogJ1xcJyBsaW5lIDMzOScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSB9LFxuXHR7IGxpbms6ICdcXCdmb29cXCcgbGluZSAzMzkgY29sdW1uIDEyJywgcHJlZml4OiAnXFwnJywgc3VmZml4OiAnXFwnIGxpbmUgMzM5IGNvbHVtbiAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cblx0Ly8gTm8gcXVvdGVzXG5cdHsgbGluazogJ2ZvbywgbGluZSAzMzknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnLCBsaW5lIDMzOScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSB9LFxuXHR7IGxpbms6ICdmb28sIGxpbmUgMzM5LCBjb2wgMTInLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnLCBsaW5lIDMzOSwgY29sIDEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vLCBsaW5lIDMzOSwgY29sdW1uIDEyJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJywgbGluZSAzMzksIGNvbHVtbiAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbzpsaW5lIDMzOScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICc6bGluZSAzMzknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnZm9vOmxpbmUgMzM5LCBjb2wgMTInLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnOmxpbmUgMzM5LCBjb2wgMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb286bGluZSAzMzksIGNvbHVtbiAxMicsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICc6bGluZSAzMzksIGNvbHVtbiAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbzogbGluZSAzMzknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnOiBsaW5lIDMzOScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSB9LFxuXHR7IGxpbms6ICdmb286IGxpbmUgMzM5LCBjb2wgMTInLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnOiBsaW5lIDMzOSwgY29sIDEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vOiBsaW5lIDMzOSwgY29sdW1uIDEyJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJzogbGluZSAzMzksIGNvbHVtbiAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbyBvbiBsaW5lIDMzOScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcgb24gbGluZSAzMzknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnZm9vIG9uIGxpbmUgMzM5LCBjb2wgMTInLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnIG9uIGxpbmUgMzM5LCBjb2wgMTInLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28gb24gbGluZSAzMzksIGNvbHVtbiAxMicsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcgb24gbGluZSAzMzksIGNvbHVtbiAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbyBsaW5lIDMzOScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcgbGluZSAzMzknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnZm9vIGxpbmUgMzM5IGNvbHVtbiAxMicsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcgbGluZSAzMzkgY29sdW1uIDEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblxuXHQvLyBQYXJlbnRoZXNlc1xuXHR7IGxpbms6ICdmb28oMzM5KScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcoMzM5KScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSB9LFxuXHR7IGxpbms6ICdmb28oMzM5LDEyKScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcoMzM5LDEyKScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbygzMzksIDEyKScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcoMzM5LCAxMiknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28gKDMzOSknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnICgzMzkpJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IGZhbHNlIH0sXG5cdHsgbGluazogJ2ZvbyAoMzM5LDEyKScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcgKDMzOSwxMiknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28gKDMzOSwgMTIpJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJyAoMzM5LCAxMiknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb286ICgzMzkpJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJzogKDMzOSknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnZm9vOiAoMzM5LDEyKScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICc6ICgzMzksMTIpJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vOiAoMzM5LCAxMiknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnOiAoMzM5LCAxMiknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28oMzM5OjEyKScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcoMzM5OjEyKScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbyAoMzM5OjEyKScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcgKDMzOToxMiknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXG5cdC8vIFNxdWFyZSBicmFja2V0c1xuXHR7IGxpbms6ICdmb29bMzM5XScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICdbMzM5XScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSB9LFxuXHR7IGxpbms6ICdmb29bMzM5LDEyXScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICdbMzM5LDEyXScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ2Zvb1szMzksIDEyXScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICdbMzM5LCAxMl0nLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28gWzMzOV0nLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnIFszMzldJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IGZhbHNlIH0sXG5cdHsgbGluazogJ2ZvbyBbMzM5LDEyXScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcgWzMzOSwxMl0nLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb28gWzMzOSwgMTJdJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJyBbMzM5LCAxMl0nLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb286IFszMzldJywgcHJlZml4OiB1bmRlZmluZWQsIHN1ZmZpeDogJzogWzMzOV0nLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogZmFsc2UgfSxcblx0eyBsaW5rOiAnZm9vOiBbMzM5LDEyXScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICc6IFszMzksMTJdJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnZm9vOiBbMzM5LCAxMl0nLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnOiBbMzM5LCAxMl0nLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdmb29bMzM5OjEyXScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICdbMzM5OjEyXScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbyBbMzM5OjEyXScsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICcgWzMzOToxMl0nLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSB9LFxuXG5cdC8vIE9DYW1sLXN0eWxlXG5cdHsgbGluazogJ1wiZm9vXCIsIGxpbmUgMzM5LCBjaGFyYWN0ZXIgMTInLCBwcmVmaXg6ICdcIicsIHN1ZmZpeDogJ1wiLCBsaW5lIDMzOSwgY2hhcmFjdGVyIDEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnXCJmb29cIiwgbGluZSAzMzksIGNoYXJhY3RlcnMgMTItNzg5JywgcHJlZml4OiAnXCInLCBzdWZmaXg6ICdcIiwgbGluZSAzMzksIGNoYXJhY3RlcnMgMTItNzg5JywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUsIGhhc0NvbEVuZDogdHJ1ZSB9LFxuXHR7IGxpbms6ICdcImZvb1wiLCBsaW5lcyAzMzktMzQxJywgcHJlZml4OiAnXCInLCBzdWZmaXg6ICdcIiwgbGluZXMgMzM5LTM0MScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiBmYWxzZSwgaGFzUm93RW5kOiB0cnVlIH0sXG5cdHsgbGluazogJ1wiZm9vXCIsIGxpbmVzIDMzOS0zNDEsIGNoYXJhY3RlcnMgMTItNzg5JywgcHJlZml4OiAnXCInLCBzdWZmaXg6ICdcIiwgbGluZXMgMzM5LTM0MSwgY2hhcmFjdGVycyAxMi03ODknLCBoYXNSb3c6IHRydWUsIGhhc0NvbDogdHJ1ZSwgaGFzUm93RW5kOiB0cnVlLCBoYXNDb2xFbmQ6IHRydWUgfSxcblxuXHQvLyBOb24tYnJlYWtpbmcgc3BhY2Vcblx0eyBsaW5rOiAnZm9vXFx1MDBBMDMzOToxMicsIHByZWZpeDogdW5kZWZpbmVkLCBzdWZmaXg6ICdcXHUwMEEwMzM5OjEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnXCJmb29cIiBvbiBsaW5lIDMzOSxcXHUwMEEwY29sdW1uIDEyJywgcHJlZml4OiAnXCInLCBzdWZmaXg6ICdcIiBvbiBsaW5lIDMzOSxcXHUwMEEwY29sdW1uIDEyJywgaGFzUm93OiB0cnVlLCBoYXNDb2w6IHRydWUgfSxcblx0eyBsaW5rOiAnXFwnZm9vXFwnIG9uIGxpbmVcXHUwMEEwMzM5LCBjb2x1bW4gMTInLCBwcmVmaXg6ICdcXCcnLCBzdWZmaXg6ICdcXCcgb24gbGluZVxcdTAwQTAzMzksIGNvbHVtbiAxMicsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ2ZvbyAoMzM5LFxcdTAwQTAxMiknLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnICgzMzksXFx1MDBBMDEyKScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5cdHsgbGluazogJ2Zvb1xcdTAwQTBbMzM5LCAxMl0nLCBwcmVmaXg6IHVuZGVmaW5lZCwgc3VmZml4OiAnXFx1MDBBMFszMzksIDEyXScsIGhhc1JvdzogdHJ1ZSwgaGFzQ29sOiB0cnVlIH0sXG5dO1xuY29uc3QgdGVzdExpbmtzV2l0aFN1ZmZpeCA9IHRlc3RMaW5rcy5maWx0ZXIoZSA9PiAhIWUuc3VmZml4KTtcblxuc3VpdGUoJ1Rlcm1pbmFsTGlua1BhcnNpbmcnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdyZW1vdmVMaW5rU3VmZml4JywgKCkgPT4ge1xuXHRcdGZvciAoY29uc3QgdGVzdExpbmsgb2YgdGVzdExpbmtzKSB7XG5cdFx0XHR0ZXN0KCdgJyArIHRlc3RMaW5rLmxpbmsgKyAnYCcsICgpID0+IHtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdHJlbW92ZUxpbmtTdWZmaXgodGVzdExpbmsubGluayksXG5cdFx0XHRcdFx0dGVzdExpbmsuc3VmZml4ID09PSB1bmRlZmluZWQgPyB0ZXN0TGluay5saW5rIDogdGVzdExpbmsubGluay5yZXBsYWNlKHRlc3RMaW5rLnN1ZmZpeCwgJycpXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xuXHRzdWl0ZSgnZ2V0TGlua1N1ZmZpeCcsICgpID0+IHtcblx0XHRmb3IgKGNvbnN0IHRlc3RMaW5rIG9mIHRlc3RMaW5rcykge1xuXHRcdFx0dGVzdCgnYCcgKyB0ZXN0TGluay5saW5rICsgJ2AnLCAoKSA9PiB7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRnZXRMaW5rU3VmZml4KHRlc3RMaW5rLmxpbmspLFxuXHRcdFx0XHRcdHRlc3RMaW5rLnN1ZmZpeCA9PT0gdW5kZWZpbmVkID8gbnVsbCA6IHtcblx0XHRcdFx0XHRcdHJvdzogdGVzdExpbmsuaGFzUm93ID8gdGVzdFJvdyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGNvbDogdGVzdExpbmsuaGFzQ29sID8gdGVzdENvbCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHJvd0VuZDogdGVzdExpbmsuaGFzUm93RW5kID8gdGVzdFJvd0VuZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGNvbEVuZDogdGVzdExpbmsuaGFzQ29sRW5kID8gdGVzdENvbEVuZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogdGVzdExpbmsubGluay5sZW5ndGggLSB0ZXN0TGluay5zdWZmaXgubGVuZ3RoLFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiB0ZXN0TGluay5zdWZmaXhcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGFzIFJldHVyblR5cGU8dHlwZW9mIGdldExpbmtTdWZmaXg+XG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xuXHRzdWl0ZSgnZGV0ZWN0TGlua1N1ZmZpeGVzJywgKCkgPT4ge1xuXHRcdGZvciAoY29uc3QgdGVzdExpbmsgb2YgdGVzdExpbmtzKSB7XG5cdFx0XHR0ZXN0KCdgJyArIHRlc3RMaW5rLmxpbmsgKyAnYCcsICgpID0+IHtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGRldGVjdExpbmtTdWZmaXhlcyh0ZXN0TGluay5saW5rKSxcblx0XHRcdFx0XHR0ZXN0TGluay5zdWZmaXggPT09IHVuZGVmaW5lZCA/IFtdIDogW3tcblx0XHRcdFx0XHRcdHJvdzogdGVzdExpbmsuaGFzUm93ID8gdGVzdFJvdyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGNvbDogdGVzdExpbmsuaGFzQ29sID8gdGVzdENvbCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHJvd0VuZDogdGVzdExpbmsuaGFzUm93RW5kID8gdGVzdFJvd0VuZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGNvbEVuZDogdGVzdExpbmsuaGFzQ29sRW5kID8gdGVzdENvbEVuZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogdGVzdExpbmsubGluay5sZW5ndGggLSB0ZXN0TGluay5zdWZmaXgubGVuZ3RoLFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiB0ZXN0TGluay5zdWZmaXhcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGFzIFJldHVyblR5cGU8dHlwZW9mIGdldExpbmtTdWZmaXg+XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnZm9vKDEsIDIpIGJhclszLCA0XSBiYXogb24gbGluZSA1JywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRkZXRlY3RMaW5rU3VmZml4ZXMoJ2ZvbygxLCAyKSBiYXJbMywgNF0gYmF6IG9uIGxpbmUgNScpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Y29sOiAyLFxuXHRcdFx0XHRcdFx0cm93OiAxLFxuXHRcdFx0XHRcdFx0cm93RW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRjb2xFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogMyxcblx0XHRcdFx0XHRcdFx0dGV4dDogJygxLCAyKSdcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGNvbDogNCxcblx0XHRcdFx0XHRcdHJvdzogMyxcblx0XHRcdFx0XHRcdHJvd0VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0Y29sRW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0aW5kZXg6IDEzLFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiAnWzMsIDRdJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Y29sOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRyb3c6IDUsXG5cdFx0XHRcdFx0XHRyb3dFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGNvbEVuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0c3VmZml4OiB7XG5cdFx0XHRcdFx0XHRcdGluZGV4OiAyMyxcblx0XHRcdFx0XHRcdFx0dGV4dDogJyBvbiBsaW5lIDUnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblx0c3VpdGUoJ3JlbW92ZUxpbmtRdWVyeVN0cmluZycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmVtb3ZlIGFueSBxdWVyeSBzdHJpbmcgZnJvbSB0aGUgbGluaycsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKHJlbW92ZUxpbmtRdWVyeVN0cmluZygnP2E9YicpLCAnJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZW1vdmVMaW5rUXVlcnlTdHJpbmcoJ2Zvbz9hPWInKSwgJ2ZvbycpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVtb3ZlTGlua1F1ZXJ5U3RyaW5nKCcuL2Zvbz9hPWInKSwgJy4vZm9vJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZW1vdmVMaW5rUXVlcnlTdHJpbmcoJy9mb28vYmFyP2E9YicpLCAnL2Zvby9iYXInKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlbW92ZUxpbmtRdWVyeVN0cmluZygnZm9vP2E9Yj8nKSwgJ2ZvbycpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVtb3ZlTGlua1F1ZXJ5U3RyaW5nKCdmb28/YT1iJmM9ZCcpLCAnZm9vJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJlc3BlY3QgPyBpbiBVTkMgcGF0aHMnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChyZW1vdmVMaW5rUXVlcnlTdHJpbmcoJ1xcXFxcXFxcP1xcXFxmb28/YT1iJyksICdcXFxcXFxcXD9cXFxcZm9vJyk7XG5cdFx0fSk7XG5cdH0pO1xuXHRzdWl0ZSgnZGV0ZWN0TGlua3MnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZm9vKDEsIDIpIGJhclszLCA0XSBcImJhelwiIG9uIGxpbmUgNScsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0ZGV0ZWN0TGlua3MoJ2ZvbygxLCAyKSBiYXJbMywgNF0gXCJiYXpcIiBvbiBsaW5lIDUnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogMCxcblx0XHRcdFx0XHRcdFx0dGV4dDogJ2Zvbydcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRjb2w6IDIsXG5cdFx0XHRcdFx0XHRcdHJvdzogMSxcblx0XHRcdFx0XHRcdFx0cm93RW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGNvbEVuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0XHRpbmRleDogMyxcblx0XHRcdFx0XHRcdFx0XHR0ZXh0OiAnKDEsIDIpJ1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdGluZGV4OiAxMCxcblx0XHRcdFx0XHRcdFx0dGV4dDogJ2Jhcidcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRjb2w6IDQsXG5cdFx0XHRcdFx0XHRcdHJvdzogMyxcblx0XHRcdFx0XHRcdFx0cm93RW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGNvbEVuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0XHRpbmRleDogMTMsXG5cdFx0XHRcdFx0XHRcdFx0dGV4dDogJ1szLCA0XSdcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogMjEsXG5cdFx0XHRcdFx0XHRcdHRleHQ6ICdiYXonXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0cHJlZml4OiB7XG5cdFx0XHRcdFx0XHRcdGluZGV4OiAyMCxcblx0XHRcdFx0XHRcdFx0dGV4dDogJ1wiJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRjb2w6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0cm93OiA1LFxuXHRcdFx0XHRcdFx0XHRyb3dFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0Y29sRW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRcdGluZGV4OiAyNCxcblx0XHRcdFx0XHRcdFx0XHR0ZXh0OiAnXCIgb24gbGluZSA1J1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdIGFzIElQYXJzZWRMaW5rW11cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZGV0ZWN0IG11bHRpcGxlIGxpbmtzIHdoZW4gb3BlbmluZyBicmFja2V0cyBhcmUgaW4gdGhlIHRleHQnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGRldGVjdExpbmtzKCdub3RsaW5rW2Zvbzo0NV0nLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogMCxcblx0XHRcdFx0XHRcdFx0dGV4dDogJ25vdGxpbmtbZm9vJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHByZWZpeDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0c3VmZml4OiB7XG5cdFx0XHRcdFx0XHRcdGNvbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRyb3c6IDQ1LFxuXHRcdFx0XHRcdFx0XHRyb3dFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0Y29sRW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRcdGluZGV4OiAxMSxcblx0XHRcdFx0XHRcdFx0XHR0ZXh0OiAnOjQ1J1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdGluZGV4OiA4LFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiAnZm9vJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHByZWZpeDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0c3VmZml4OiB7XG5cdFx0XHRcdFx0XHRcdGNvbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRyb3c6IDQ1LFxuXHRcdFx0XHRcdFx0XHRyb3dFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0Y29sRW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRcdGluZGV4OiAxMSxcblx0XHRcdFx0XHRcdFx0XHR0ZXh0OiAnOjQ1J1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSBhcyBJUGFyc2VkTGlua1tdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgdGhlIGxpbmsgcHJlZml4JywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRkZXRlY3RMaW5rcygnXCJmb29cIiwgbGluZSA1LCBjb2wgNicsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdGluZGV4OiAxLFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiAnZm9vJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHByZWZpeDoge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogMCxcblx0XHRcdFx0XHRcdFx0dGV4dDogJ1wiJyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0cm93OiA1LFxuXHRcdFx0XHRcdFx0XHRjb2w6IDYsXG5cdFx0XHRcdFx0XHRcdHJvd0VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRjb2xFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c3VmZml4OiB7XG5cdFx0XHRcdFx0XHRcdFx0aW5kZXg6IDQsXG5cdFx0XHRcdFx0XHRcdFx0dGV4dDogJ1wiLCBsaW5lIDUsIGNvbCA2J1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSBhcyBJUGFyc2VkTGlua1tdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGJlIHNtYXJ0IGFib3V0IGRldGVybWluaW5nIHRoZSBsaW5rIHByZWZpeCB3aGVuIG11bHRpcGxlIHByZWZpeCBjaGFyYWN0ZXJzIGV4aXN0JywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRkZXRlY3RMaW5rcygnZWNobyBcXCdcImZvb1wiLCBsaW5lIDUsIGNvbCA2XFwnJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0aW5kZXg6IDcsXG5cdFx0XHRcdFx0XHRcdHRleHQ6ICdmb28nXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0cHJlZml4OiB7XG5cdFx0XHRcdFx0XHRcdGluZGV4OiA2LFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiAnXCInLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRyb3c6IDUsXG5cdFx0XHRcdFx0XHRcdGNvbDogNixcblx0XHRcdFx0XHRcdFx0cm93RW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGNvbEVuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0XHRpbmRleDogMTAsXG5cdFx0XHRcdFx0XHRcdFx0dGV4dDogJ1wiLCBsaW5lIDUsIGNvbCA2J1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSBhcyBJUGFyc2VkTGlua1tdLFxuXHRcdFx0XHQnVGhlIG91dGVyIHNpbmdsZSBxdW90ZXMgc2hvdWxkIGJlIGV4Y2x1ZGVkIGZyb20gdGhlIGxpbmsgcHJlZml4IGFuZCBzdWZmaXgnXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRldGVjdCBib3RoIHN1ZmZpeCBhbmQgbm9uLXN1ZmZpeCBsaW5rcyBvbiBhIHNpbmdsZSBsaW5lJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRkZXRlY3RMaW5rcygnUFMgQzpcXFxcR2l0aHViXFxcXG1pY3Jvc29mdFxcXFx2c2NvZGU+IGVjaG8gXFwnXCJmb29cIiwgbGluZSA1LCBjb2wgNlxcJycsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0aW5kZXg6IDMsXG5cdFx0XHRcdFx0XHRcdHRleHQ6ICdDOlxcXFxHaXRodWJcXFxcbWljcm9zb2Z0XFxcXHZzY29kZSdcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHN1ZmZpeDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdGluZGV4OiAzOCxcblx0XHRcdFx0XHRcdFx0dGV4dDogJ2Zvbydcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRwcmVmaXg6IHtcblx0XHRcdFx0XHRcdFx0aW5kZXg6IDM3LFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiAnXCInLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRyb3c6IDUsXG5cdFx0XHRcdFx0XHRcdGNvbDogNixcblx0XHRcdFx0XHRcdFx0cm93RW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGNvbEVuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0XHRpbmRleDogNDEsXG5cdFx0XHRcdFx0XHRcdFx0dGV4dDogJ1wiLCBsaW5lIDUsIGNvbCA2J1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdIGFzIElQYXJzZWRMaW5rW11cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnXCJ8XCInLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdzaG91bGQgZXhjbHVkZSBwaXBlIGNoYXJhY3RlcnMgZnJvbSBsaW5rIHBhdGhzJywgKCkgPT4ge1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0ZGV0ZWN0TGlua3MoJ3xDOlxcXFxHaXRodWJcXFxcbWljcm9zb2Z0XFxcXHZzY29kZXwnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyksXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdFx0aW5kZXg6IDEsXG5cdFx0XHRcdFx0XHRcdFx0dGV4dDogJ0M6XFxcXEdpdGh1YlxcXFxtaWNyb3NvZnRcXFxcdnNjb2RlJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c3VmZml4OiB1bmRlZmluZWRcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdIGFzIElQYXJzZWRMaW5rW11cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIGV4Y2x1ZGUgcGlwZSBjaGFyYWN0ZXJzIGZyb20gbGluayBwYXRocyB3aXRoIHN1ZmZpeGVzJywgKCkgPT4ge1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0ZGV0ZWN0TGlua3MoJ3xDOlxcXFxHaXRodWJcXFxcbWljcm9zb2Z0XFxcXHZzY29kZTo0MDB8JywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0XHRcdGluZGV4OiAxLFxuXHRcdFx0XHRcdFx0XHRcdHRleHQ6ICdDOlxcXFxHaXRodWJcXFxcbWljcm9zb2Z0XFxcXHZzY29kZSdcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRcdGNvbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdHJvdzogNDAwLFxuXHRcdFx0XHRcdFx0XHRcdHJvd0VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdGNvbEVuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0aW5kZXg6IDI3LFxuXHRcdFx0XHRcdFx0XHRcdFx0dGV4dDogJzo0MDAnXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XSBhcyBJUGFyc2VkTGlua1tdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdcIjw+XCInLCAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IG9zIG9mIG9wZXJhdGluZ1N5c3RlbXMpIHtcblx0XHRcdFx0dGVzdChgc2hvdWxkIGV4Y2x1ZGUgYnJhY2tldCBjaGFyYWN0ZXJzIGZyb20gbGluayBwYXRocyAke29zTGFiZWxbb3NdfWAsICgpID0+IHtcblx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0XHRkZXRlY3RMaW5rcyhgPCR7b3NUZXN0UGF0aFtvc119PGAsIG9zKSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGluZGV4OiAxLFxuXHRcdFx0XHRcdFx0XHRcdFx0dGV4dDogb3NUZXN0UGF0aFtvc11cblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdHByZWZpeDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdHN1ZmZpeDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF0gYXMgSVBhcnNlZExpbmtbXVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdFx0ZGV0ZWN0TGlua3MoYD4ke29zVGVzdFBhdGhbb3NdfT5gLCBvcyksXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpbmRleDogMSxcblx0XHRcdFx0XHRcdFx0XHRcdHRleHQ6IG9zVGVzdFBhdGhbb3NdXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRzdWZmaXg6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdIGFzIElQYXJzZWRMaW5rW11cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVzdChgc2hvdWxkIGV4Y2x1ZGUgYnJhY2tldCBjaGFyYWN0ZXJzIGZyb20gbGluayBwYXRocyB3aXRoIHN1ZmZpeGVzICR7b3NMYWJlbFtvc119YCwgKCkgPT4ge1xuXHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRcdGRldGVjdExpbmtzKGA8JHtvc1Rlc3RQYXRoW29zXX06NDAwPGAsIG9zKSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGluZGV4OiAxLFxuXHRcdFx0XHRcdFx0XHRcdFx0dGV4dDogb3NUZXN0UGF0aFtvc11cblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdHByZWZpeDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29sOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRyb3c6IDQwMCxcblx0XHRcdFx0XHRcdFx0XHRcdHJvd0VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdFx0Y29sRW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0aW5kZXg6IDEgKyBvc1Rlc3RQYXRoW29zXS5sZW5ndGgsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHRleHQ6ICc6NDAwJ1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XSBhcyBJUGFyc2VkTGlua1tdXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0XHRkZXRlY3RMaW5rcyhgPiR7b3NUZXN0UGF0aFtvc119OjQwMD5gLCBvcyksXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpbmRleDogMSxcblx0XHRcdFx0XHRcdFx0XHRcdHRleHQ6IG9zVGVzdFBhdGhbb3NdXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdFx0cm93OiA0MDAsXG5cdFx0XHRcdFx0XHRcdFx0XHRyb3dFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRcdGNvbEVuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdFx0c3VmZml4OiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGluZGV4OiAxICsgb3NUZXN0UGF0aFtvc10ubGVuZ3RoLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR0ZXh0OiAnOjQwMCdcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF0gYXMgSVBhcnNlZExpbmtbXVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ3F1ZXJ5IHN0cmluZ3MnLCAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IG9zIG9mIG9wZXJhdGluZ1N5c3RlbXMpIHtcblx0XHRcdFx0dGVzdChgc2hvdWxkIGV4Y2x1ZGUgcXVlcnkgc3RyaW5ncyBmcm9tIGxpbmsgcGF0aHMgJHtvc0xhYmVsW29zXX1gLCAoKSA9PiB7XG5cdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdFx0ZGV0ZWN0TGlua3MoYCR7b3NUZXN0UGF0aFtvc119P2E9YmAsIG9zKSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGluZGV4OiAwLFxuXHRcdFx0XHRcdFx0XHRcdFx0dGV4dDogb3NUZXN0UGF0aFtvc11cblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdHByZWZpeDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdHN1ZmZpeDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF0gYXMgSVBhcnNlZExpbmtbXVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdFx0ZGV0ZWN0TGlua3MoYCR7b3NUZXN0UGF0aFtvc119P2E9YiZjPWRgLCBvcyksXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpbmRleDogMCxcblx0XHRcdFx0XHRcdFx0XHRcdHRleHQ6IG9zVGVzdFBhdGhbb3NdXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRzdWZmaXg6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdIGFzIElQYXJzZWRMaW5rW11cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVzdCgnc2hvdWxkIG5vdCBkZXRlY3QgbGlua3Mgc3RhcnRpbmcgd2l0aCA/IHdpdGhpbiBxdWVyeSBzdHJpbmdzIHRoYXQgY29udGFpbiBwb3NpeC1zdHlsZSBwYXRocyAoIzIwNDE5NSknLCAoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gPyBhcHBlbmRlZCB0byB0aGUgY3dkIHdpbGwgZXhpc3Qgc2luY2UgaXQncyBqdXN0IHRoZSBjd2Rcblx0XHRcdFx0XHRzdHJpY3RFcXVhbChkZXRlY3RMaW5rcyhgaHR0cDovL2Zvby5jb20vP2Jhcj0vYS9iJmJhej1jYCwgb3MpLnNvbWUoZSA9PiBlLnBhdGgudGV4dC5zdGFydHNXaXRoKCc/JykpLCBmYWxzZSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0ZXN0KCdzaG91bGQgbm90IGRldGVjdCBsaW5rcyBzdGFydGluZyB3aXRoID8gd2l0aGluIHF1ZXJ5IHN0cmluZ3MgdGhhdCBjb250YWluIFdpbmRvd3Mtc3R5bGUgcGF0aHMgKCMyMDQxOTUpJywgKCkgPT4ge1xuXHRcdFx0XHRcdC8vID8gYXBwZW5kZWQgdG8gdGhlIGN3ZCB3aWxsIGV4aXN0IHNpbmNlIGl0J3MganVzdCB0aGUgY3dkXG5cdFx0XHRcdFx0c3RyaWN0RXF1YWwoZGV0ZWN0TGlua3MoYGh0dHA6Ly9mb28uY29tLz9iYXI9YTpcXFxcYiZiYXo9Y2AsIG9zKS5zb21lKGUgPT4gZS5wYXRoLnRleHQuc3RhcnRzV2l0aCgnPycpKSwgZmFsc2UpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHN1aXRlKCdzaG91bGQgZGV0ZWN0IGZpbGUgbmFtZXMgaW4gZ2l0IGRpZmZzJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnLS0tIGEvZm9vL2JhcicsICgpID0+IHtcblx0XHRcdFx0WydhJywgJ2MnLCAndycsICdpJywgJ28nXS5mb3JFYWNoKHByZWZpeCA9PiB7XG5cdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdFx0ZGV0ZWN0TGlua3MoYC0tLSAke3ByZWZpeH0vZm9vL2JhcmAsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCksXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpbmRleDogNixcblx0XHRcdFx0XHRcdFx0XHRcdHRleHQ6ICdmb28vYmFyJ1xuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdFx0c3VmZml4OiB1bmRlZmluZWRcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XSBhcyBJUGFyc2VkTGlua1tdXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJysrKyBiL2Zvby9iYXInLCAoKSA9PiB7XG5cdFx0XHRcdFsnYicsICdjJywgJ3cnLCAnaScsICdvJ10uZm9yRWFjaChwcmVmaXggPT4ge1xuXHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRcdGRldGVjdExpbmtzKGArKysgJHtwcmVmaXh9L2Zvby9iYXJgLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpLFxuXHRcdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0aW5kZXg6IDYsXG5cdFx0XHRcdFx0XHRcdFx0XHR0ZXh0OiAnZm9vL2Jhcidcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdHByZWZpeDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdHN1ZmZpeDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF0gYXMgSVBhcnNlZExpbmtbXVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdkaWZmIC0tZ2l0IGEvZm9vL2JhciBiL2Zvby9iYXonLCAoKSA9PiB7XG5cdFx0XHRcdFtbJ2EnLCAnYiddLCBbJ2MnLCAndyddLCBbJ2knLCAnbyddXS5mb3JFYWNoKChbc291cmNlUHJlZml4LCBkZXN0aW5hdGlvblByZWZpeF0pID0+IHtcblx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0XHRkZXRlY3RMaW5rcyhgZGlmZiAtLWdpdCAke3NvdXJjZVByZWZpeH0vZm9vL2JhciAke2Rlc3RpbmF0aW9uUHJlZml4fS9mb28vYmF6YCwgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSxcblx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGluZGV4OiAxMyxcblx0XHRcdFx0XHRcdFx0XHRcdHRleHQ6ICdmb28vYmFyJ1xuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdFx0c3VmZml4OiB1bmRlZmluZWRcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGluZGV4OiAyMyxcblx0XHRcdFx0XHRcdFx0XHRcdHRleHQ6ICdmb28vYmF6J1xuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdFx0c3VmZml4OiB1bmRlZmluZWRcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XSBhcyBJUGFyc2VkTGlua1tdXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ251bWVyaWMgcHJlZml4ZXMgdXNlZCBieSBnaXQgZGlmZiAtLW5vLWluZGV4JywgKCkgPT4ge1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0ZGV0ZWN0TGlua3MoJy0tLSAxL2Zvby9iYXInLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpLFxuXHRcdFx0XHRcdFx0ZGV0ZWN0TGlua3MoJysrKyAyL2Zvby9iYXonLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpLFxuXHRcdFx0XHRcdFx0ZGV0ZWN0TGlua3MoJ2RpZmYgLS1naXQgMS9mb28vYmFyIDIvZm9vL2JheicsIE9wZXJhdGluZ1N5c3RlbS5MaW51eClcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRcdHBhdGg6IHsgaW5kZXg6IDYsIHRleHQ6ICdmb28vYmFyJyB9LFxuXHRcdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c3VmZml4OiB1bmRlZmluZWRcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdFx0cGF0aDogeyBpbmRleDogNiwgdGV4dDogJ2Zvby9iYXonIH0sXG5cdFx0XHRcdFx0XHRcdHByZWZpeDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWZmaXg6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0XHRwYXRoOiB7IGluZGV4OiAxMywgdGV4dDogJ2Zvby9iYXInIH0sXG5cdFx0XHRcdFx0XHRcdHByZWZpeDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWZmaXg6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0XHRwYXRoOiB7IGluZGV4OiAyMywgdGV4dDogJ2Zvby9iYXonIH0sXG5cdFx0XHRcdFx0XHRcdHByZWZpeDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWZmaXg6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHRdIGFzIElQYXJzZWRMaW5rW11bXVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdyZXZlcnNlZCBudW1lcmljIHByZWZpeGVzIHVzZWQgYnkgZ2l0IGRpZmYgLS1uby1pbmRleCAtUicsICgpID0+IHtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdGRldGVjdExpbmtzKCctLS0gMi9mb28vYmF6JywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSxcblx0XHRcdFx0XHRcdGRldGVjdExpbmtzKCcrKysgMS9mb28vYmFyJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSxcblx0XHRcdFx0XHRcdGRldGVjdExpbmtzKCdkaWZmIC0tZ2l0IDIvZm9vL2JheiAxL2Zvby9iYXInLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0XHRwYXRoOiB7IGluZGV4OiA2LCB0ZXh0OiAnZm9vL2JheicgfSxcblx0XHRcdFx0XHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHN1ZmZpeDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRcdHBhdGg6IHsgaW5kZXg6IDYsIHRleHQ6ICdmb28vYmFyJyB9LFxuXHRcdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c3VmZml4OiB1bmRlZmluZWRcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdFx0cGF0aDogeyBpbmRleDogMTMsIHRleHQ6ICdmb28vYmF6JyB9LFxuXHRcdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c3VmZml4OiB1bmRlZmluZWRcblx0XHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdFx0cGF0aDogeyBpbmRleDogMjMsIHRleHQ6ICdmb28vYmFyJyB9LFxuXHRcdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c3VmZml4OiB1bmRlZmluZWRcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0XSBhcyBJUGFyc2VkTGlua1tdW11cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnb3JkaW5hcnkgbnVtZXJpYyBsaW5lIHN1ZmZpeCcsICgpID0+IHtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGRldGVjdExpbmtzKCdmb28gMScsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCksXG5cdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdHBhdGg6IHsgaW5kZXg6IDAsIHRleHQ6ICdmb28nIH0sXG5cdFx0XHRcdFx0XHRwcmVmaXg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRyb3c6IDEsXG5cdFx0XHRcdFx0XHRcdGNvbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRyb3dFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0Y29sRW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHN1ZmZpeDogeyBpbmRleDogMywgdGV4dDogJyAxJyB9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV0gYXMgSVBhcnNlZExpbmtbXVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdudW1lcmljIHN1ZmZpeCBmb2xsb3dlZCBieSBhIHBhdGggc2VwYXJhdG9yJywgKCkgPT4ge1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0ZGV0ZWN0TGlua3MoJ2ZvbyAxL2JhcicsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCksXG5cdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdHBhdGg6IHsgaW5kZXg6IDQsIHRleHQ6ICcxL2JhcicgfSxcblx0XHRcdFx0XHRcdHByZWZpeDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0c3VmZml4OiB1bmRlZmluZWRcblx0XHRcdFx0XHR9XSBhcyBJUGFyc2VkTGlua1tdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ29yZGluYXJ5IG51bWVyaWMgbGluZSBzdWZmaXggYWZ0ZXIgZGlmZiAtLWdpdCB0ZXh0JywgKCkgPT4ge1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0ZGV0ZWN0TGlua3MoJ2RpZmYgLS1naXQgZm9vLnRzOjEyMycsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCksXG5cdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdHBhdGg6IHsgaW5kZXg6IDExLCB0ZXh0OiAnZm9vLnRzJyB9LFxuXHRcdFx0XHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0cm93OiAxMjMsXG5cdFx0XHRcdFx0XHRcdGNvbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRyb3dFbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0Y29sRW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHN1ZmZpeDogeyBpbmRleDogMTcsIHRleHQ6ICc6MTIzJyB9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV0gYXMgSVBhcnNlZExpbmtbXVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnc2hvdWxkIGRldGVjdCAzIHN1ZmZpeCBsaW5rcyBvbiBhIHNpbmdsZSBsaW5lJywgKCkgPT4ge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0ZXN0TGlua3NXaXRoU3VmZml4Lmxlbmd0aCAtIDI7IGkrKykge1xuXHRcdFx0XHRjb25zdCBsaW5rMSA9IHRlc3RMaW5rc1dpdGhTdWZmaXhbaV07XG5cdFx0XHRcdGNvbnN0IGxpbmsyID0gdGVzdExpbmtzV2l0aFN1ZmZpeFtpICsgMV07XG5cdFx0XHRcdGNvbnN0IGxpbmszID0gdGVzdExpbmtzV2l0aFN1ZmZpeFtpICsgMl07XG5cdFx0XHRcdGNvbnN0IGxpbmUgPSBgICR7bGluazEubGlua30gJHtsaW5rMi5saW5rfSAke2xpbmszLmxpbmt9IGA7XG5cdFx0XHRcdHRlc3QoJ2AnICsgbGluZS5yZXBsYWNlQWxsKCdcXHUwMEEwJywgJzxuYnNwPicpICsgJ2AnLCAoKSA9PiB7XG5cdFx0XHRcdFx0c3RyaWN0RXF1YWwoZGV0ZWN0TGlua3MobGluZSwgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KS5sZW5ndGgsIDMpO1xuXHRcdFx0XHRcdG9rKGxpbmsxLnN1ZmZpeCk7XG5cdFx0XHRcdFx0b2sobGluazIuc3VmZml4KTtcblx0XHRcdFx0XHRvayhsaW5rMy5zdWZmaXgpO1xuXHRcdFx0XHRcdGNvbnN0IGRldGVjdGVkTGluazE6IElQYXJzZWRMaW5rID0ge1xuXHRcdFx0XHRcdFx0cHJlZml4OiBsaW5rMS5wcmVmaXggPyB7XG5cdFx0XHRcdFx0XHRcdGluZGV4OiAxLFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiBsaW5rMS5wcmVmaXhcblx0XHRcdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdGluZGV4OiAxICsgKGxpbmsxLnByZWZpeD8ubGVuZ3RoID8/IDApLFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiBsaW5rMS5saW5rLnJlcGxhY2UobGluazEuc3VmZml4LCAnJykucmVwbGFjZShsaW5rMS5wcmVmaXggfHwgJycsICcnKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRyb3c6IGxpbmsxLmhhc1JvdyA/IHRlc3RSb3cgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGNvbDogbGluazEuaGFzQ29sID8gdGVzdENvbCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0cm93RW5kOiBsaW5rMS5oYXNSb3dFbmQgPyB0ZXN0Um93RW5kIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRjb2xFbmQ6IGxpbmsxLmhhc0NvbEVuZCA/IHRlc3RDb2xFbmQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHN1ZmZpeDoge1xuXHRcdFx0XHRcdFx0XHRcdGluZGV4OiAxICsgKGxpbmsxLmxpbmsubGVuZ3RoIC0gbGluazEuc3VmZml4Lmxlbmd0aCksXG5cdFx0XHRcdFx0XHRcdFx0dGV4dDogbGluazEuc3VmZml4XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGNvbnN0IGRldGVjdGVkTGluazI6IElQYXJzZWRMaW5rID0ge1xuXHRcdFx0XHRcdFx0cHJlZml4OiBsaW5rMi5wcmVmaXggPyB7XG5cdFx0XHRcdFx0XHRcdGluZGV4OiAoZGV0ZWN0ZWRMaW5rMS5wcmVmaXg/LmluZGV4ID8/IGRldGVjdGVkTGluazEucGF0aC5pbmRleCkgKyBsaW5rMS5saW5rLmxlbmd0aCArIDEsXG5cdFx0XHRcdFx0XHRcdHRleHQ6IGxpbmsyLnByZWZpeFxuXHRcdFx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0aW5kZXg6IChkZXRlY3RlZExpbmsxLnByZWZpeD8uaW5kZXggPz8gZGV0ZWN0ZWRMaW5rMS5wYXRoLmluZGV4KSArIGxpbmsxLmxpbmsubGVuZ3RoICsgMSArIChsaW5rMi5wcmVmaXggPz8gJycpLmxlbmd0aCxcblx0XHRcdFx0XHRcdFx0dGV4dDogbGluazIubGluay5yZXBsYWNlKGxpbmsyLnN1ZmZpeCwgJycpLnJlcGxhY2UobGluazIucHJlZml4ID8/ICcnLCAnJylcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0cm93OiBsaW5rMi5oYXNSb3cgPyB0ZXN0Um93IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRjb2w6IGxpbmsyLmhhc0NvbCA/IHRlc3RDb2wgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHJvd0VuZDogbGluazIuaGFzUm93RW5kID8gdGVzdFJvd0VuZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0Y29sRW5kOiBsaW5rMi5oYXNDb2xFbmQgPyB0ZXN0Q29sRW5kIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0XHRpbmRleDogKGRldGVjdGVkTGluazEucHJlZml4Py5pbmRleCA/PyBkZXRlY3RlZExpbmsxLnBhdGguaW5kZXgpICsgbGluazEubGluay5sZW5ndGggKyAxICsgKGxpbmsyLmxpbmsubGVuZ3RoIC0gbGluazIuc3VmZml4Lmxlbmd0aCksXG5cdFx0XHRcdFx0XHRcdFx0dGV4dDogbGluazIuc3VmZml4XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGNvbnN0IGRldGVjdGVkTGluazM6IElQYXJzZWRMaW5rID0ge1xuXHRcdFx0XHRcdFx0cHJlZml4OiBsaW5rMy5wcmVmaXggPyB7XG5cdFx0XHRcdFx0XHRcdGluZGV4OiAoZGV0ZWN0ZWRMaW5rMi5wcmVmaXg/LmluZGV4ID8/IGRldGVjdGVkTGluazIucGF0aC5pbmRleCkgKyBsaW5rMi5saW5rLmxlbmd0aCArIDEsXG5cdFx0XHRcdFx0XHRcdHRleHQ6IGxpbmszLnByZWZpeFxuXHRcdFx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0aW5kZXg6IChkZXRlY3RlZExpbmsyLnByZWZpeD8uaW5kZXggPz8gZGV0ZWN0ZWRMaW5rMi5wYXRoLmluZGV4KSArIGxpbmsyLmxpbmsubGVuZ3RoICsgMSArIChsaW5rMy5wcmVmaXggPz8gJycpLmxlbmd0aCxcblx0XHRcdFx0XHRcdFx0dGV4dDogbGluazMubGluay5yZXBsYWNlKGxpbmszLnN1ZmZpeCwgJycpLnJlcGxhY2UobGluazMucHJlZml4ID8/ICcnLCAnJylcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0cm93OiBsaW5rMy5oYXNSb3cgPyB0ZXN0Um93IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRjb2w6IGxpbmszLmhhc0NvbCA/IHRlc3RDb2wgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHJvd0VuZDogbGluazMuaGFzUm93RW5kID8gdGVzdFJvd0VuZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0Y29sRW5kOiBsaW5rMy5oYXNDb2xFbmQgPyB0ZXN0Q29sRW5kIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzdWZmaXg6IHtcblx0XHRcdFx0XHRcdFx0XHRpbmRleDogKGRldGVjdGVkTGluazIucHJlZml4Py5pbmRleCA/PyBkZXRlY3RlZExpbmsyLnBhdGguaW5kZXgpICsgbGluazIubGluay5sZW5ndGggKyAxICsgKGxpbmszLmxpbmsubGVuZ3RoIC0gbGluazMuc3VmZml4Lmxlbmd0aCksXG5cdFx0XHRcdFx0XHRcdFx0dGV4dDogbGluazMuc3VmZml4XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRcdGRldGVjdExpbmtzKGxpbmUsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCksXG5cdFx0XHRcdFx0XHRbZGV0ZWN0ZWRMaW5rMSwgZGV0ZWN0ZWRMaW5rMiwgZGV0ZWN0ZWRMaW5rM11cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRzdWl0ZSgnc2hvdWxkIGlnbm9yZSBsaW5rcyB3aXRoIHN1ZmZpeGVzIHdoZW4gdGhlIHBhdGggaXRzZWxmIGlzIHRoZSBlbXB0eSBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGRldGVjdExpbmtzKCdcIlwiXCIsMScsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCksXG5cdFx0XHRcdFtdIGFzIElQYXJzZWRMaW5rW11cblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGlCQUFpQixJQUFJLG1CQUFtQjtBQUNqRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWEsb0JBQW9CLGVBQTRCLHVC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
