import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { isValidExtensionVersion, isValidVersion, isValidVersionStr, normalizeVersion, parseVersion } from "../../common/extensionValidator.js";
suite("Extension Version Validator", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const productVersion = "2021-05-11T21:54:30.577Z";
  test("isValidVersionStr", () => {
    assert.strictEqual(isValidVersionStr("0.10.0-dev"), true);
    assert.strictEqual(isValidVersionStr("0.10.0"), true);
    assert.strictEqual(isValidVersionStr("0.10.1"), true);
    assert.strictEqual(isValidVersionStr("0.10.100"), true);
    assert.strictEqual(isValidVersionStr("0.11.0"), true);
    assert.strictEqual(isValidVersionStr("x.x.x"), true);
    assert.strictEqual(isValidVersionStr("0.x.x"), true);
    assert.strictEqual(isValidVersionStr("0.10.0"), true);
    assert.strictEqual(isValidVersionStr("0.10.x"), true);
    assert.strictEqual(isValidVersionStr("^0.10.0"), true);
    assert.strictEqual(isValidVersionStr("*"), true);
    assert.strictEqual(isValidVersionStr("0.x.x.x"), false);
    assert.strictEqual(isValidVersionStr("0.10"), false);
    assert.strictEqual(isValidVersionStr("0.10."), false);
  });
  test("parseVersion", () => {
    function assertParseVersion(version, hasCaret, hasGreaterEquals, majorBase, majorMustEqual, minorBase, minorMustEqual, patchBase, patchMustEqual, preRelease) {
      const actual = parseVersion(version);
      const expected = { hasCaret, hasGreaterEquals, majorBase, majorMustEqual, minorBase, minorMustEqual, patchBase, patchMustEqual, preRelease };
      assert.deepStrictEqual(actual, expected, "parseVersion for " + version);
    }
    assertParseVersion("0.10.0-dev", false, false, 0, true, 10, true, 0, true, "-dev");
    assertParseVersion("0.10.0", false, false, 0, true, 10, true, 0, true, null);
    assertParseVersion("0.10.1", false, false, 0, true, 10, true, 1, true, null);
    assertParseVersion("0.10.100", false, false, 0, true, 10, true, 100, true, null);
    assertParseVersion("0.11.0", false, false, 0, true, 11, true, 0, true, null);
    assertParseVersion("x.x.x", false, false, 0, false, 0, false, 0, false, null);
    assertParseVersion("0.x.x", false, false, 0, true, 0, false, 0, false, null);
    assertParseVersion("0.10.x", false, false, 0, true, 10, true, 0, false, null);
    assertParseVersion("^0.10.0", true, false, 0, true, 10, true, 0, true, null);
    assertParseVersion("^0.10.2", true, false, 0, true, 10, true, 2, true, null);
    assertParseVersion("^1.10.2", true, false, 1, true, 10, true, 2, true, null);
    assertParseVersion("*", false, false, 0, false, 0, false, 0, false, null);
    assertParseVersion(">=0.0.1", false, true, 0, true, 0, true, 1, true, null);
    assertParseVersion(">=2.4.3", false, true, 2, true, 4, true, 3, true, null);
    assertParseVersion("1.10.0-202105111430", false, false, 1, true, 10, true, 0, true, "-202105111430");
    assertParseVersion("^1.10.0-202105112359", true, false, 1, true, 10, true, 0, true, "-202105112359");
  });
  test("normalizeVersion", () => {
    function assertNormalizeVersion(version, majorBase, majorMustEqual, minorBase, minorMustEqual, patchBase, patchMustEqual, isMinimum, notBefore = 0) {
      const actual = normalizeVersion(parseVersion(version));
      const expected = { majorBase, majorMustEqual, minorBase, minorMustEqual, patchBase, patchMustEqual, isMinimum, notBefore };
      assert.deepStrictEqual(actual, expected, "parseVersion for " + version);
    }
    assertNormalizeVersion("0.10.0-dev", 0, true, 10, true, 0, true, false, 0);
    assertNormalizeVersion("0.10.0-222222222", 0, true, 10, true, 0, true, false, 0);
    assertNormalizeVersion("0.10.0-20210511", 0, true, 10, true, 0, true, false, (/* @__PURE__ */ new Date("2021-05-11T00:00:00Z")).getTime());
    assertNormalizeVersion("1.10.0-202105111430", 1, true, 10, true, 0, true, false, (/* @__PURE__ */ new Date("2021-05-11T14:30:00Z")).getTime());
    assertNormalizeVersion("1.10.0-202105112359", 1, true, 10, true, 0, true, false, (/* @__PURE__ */ new Date("2021-05-11T23:59:00Z")).getTime());
    assertNormalizeVersion("1.10.0-202105110000", 1, true, 10, true, 0, true, false, (/* @__PURE__ */ new Date("2021-05-11T00:00:00Z")).getTime());
    assertNormalizeVersion("0.10.0", 0, true, 10, true, 0, true, false);
    assertNormalizeVersion("0.10.1", 0, true, 10, true, 1, true, false);
    assertNormalizeVersion("0.10.100", 0, true, 10, true, 100, true, false);
    assertNormalizeVersion("0.11.0", 0, true, 11, true, 0, true, false);
    assertNormalizeVersion("x.x.x", 0, false, 0, false, 0, false, false);
    assertNormalizeVersion("0.x.x", 0, true, 0, false, 0, false, false);
    assertNormalizeVersion("0.10.x", 0, true, 10, true, 0, false, false);
    assertNormalizeVersion("^0.10.0", 0, true, 10, true, 0, false, false);
    assertNormalizeVersion("^0.10.2", 0, true, 10, true, 2, false, false);
    assertNormalizeVersion("^1.10.2", 1, true, 10, false, 2, false, false);
    assertNormalizeVersion("*", 0, false, 0, false, 0, false, false);
    assertNormalizeVersion(">=0.0.1", 0, true, 0, true, 1, true, true);
    assertNormalizeVersion(">=2.4.3", 2, true, 4, true, 3, true, true);
    assertNormalizeVersion(">=2.4.3", 2, true, 4, true, 3, true, true);
  });
  test("isValidVersion", () => {
    function testIsValidVersion(version, desiredVersion, expectedResult) {
      const actual = isValidVersion(version, productVersion, desiredVersion);
      assert.strictEqual(actual, expectedResult, "extension - vscode: " + version + ", desiredVersion: " + desiredVersion + " should be " + expectedResult);
    }
    testIsValidVersion("0.10.0-dev", "x.x.x", true);
    testIsValidVersion("0.10.0-dev", "0.x.x", true);
    testIsValidVersion("0.10.0-dev", "0.10.0", true);
    testIsValidVersion("0.10.0-dev", "0.10.2", false);
    testIsValidVersion("0.10.0-dev", "^0.10.2", false);
    testIsValidVersion("0.10.0-dev", "0.10.x", true);
    testIsValidVersion("0.10.0-dev", "^0.10.0", true);
    testIsValidVersion("0.10.0-dev", "*", true);
    testIsValidVersion("0.10.0-dev", ">=0.0.1", true);
    testIsValidVersion("0.10.0-dev", ">=0.0.10", true);
    testIsValidVersion("0.10.0-dev", ">=0.10.0", true);
    testIsValidVersion("0.10.0-dev", ">=0.10.1", false);
    testIsValidVersion("0.10.0-dev", ">=1.0.0", false);
    testIsValidVersion("0.10.0", "x.x.x", true);
    testIsValidVersion("0.10.0", "0.x.x", true);
    testIsValidVersion("0.10.0", "0.10.0", true);
    testIsValidVersion("0.10.0", "0.10.2", false);
    testIsValidVersion("0.10.0", "^0.10.2", false);
    testIsValidVersion("0.10.0", "0.10.x", true);
    testIsValidVersion("0.10.0", "^0.10.0", true);
    testIsValidVersion("0.10.0", "*", true);
    testIsValidVersion("0.10.1", "x.x.x", true);
    testIsValidVersion("0.10.1", "0.x.x", true);
    testIsValidVersion("0.10.1", "0.10.0", false);
    testIsValidVersion("0.10.1", "0.10.2", false);
    testIsValidVersion("0.10.1", "^0.10.2", false);
    testIsValidVersion("0.10.1", "0.10.x", true);
    testIsValidVersion("0.10.1", "^0.10.0", true);
    testIsValidVersion("0.10.1", "*", true);
    testIsValidVersion("0.10.100", "x.x.x", true);
    testIsValidVersion("0.10.100", "0.x.x", true);
    testIsValidVersion("0.10.100", "0.10.0", false);
    testIsValidVersion("0.10.100", "0.10.2", false);
    testIsValidVersion("0.10.100", "^0.10.2", true);
    testIsValidVersion("0.10.100", "0.10.x", true);
    testIsValidVersion("0.10.100", "^0.10.0", true);
    testIsValidVersion("0.10.100", "*", true);
    testIsValidVersion("0.11.0", "x.x.x", true);
    testIsValidVersion("0.11.0", "0.x.x", true);
    testIsValidVersion("0.11.0", "0.10.0", false);
    testIsValidVersion("0.11.0", "0.10.2", false);
    testIsValidVersion("0.11.0", "^0.10.2", false);
    testIsValidVersion("0.11.0", "0.10.x", false);
    testIsValidVersion("0.11.0", "^0.10.0", false);
    testIsValidVersion("0.11.0", "*", true);
    testIsValidVersion("1.0.0", "x.x.x", true);
    testIsValidVersion("1.0.0", "0.x.x", true);
    testIsValidVersion("1.0.0", "0.10.0", false);
    testIsValidVersion("1.0.0", "0.10.2", false);
    testIsValidVersion("1.0.0", "^0.10.2", true);
    testIsValidVersion("1.0.0", "0.10.x", true);
    testIsValidVersion("1.0.0", "^0.10.0", true);
    testIsValidVersion("1.0.0", "1.0.0", true);
    testIsValidVersion("1.0.0", "^1.0.0", true);
    testIsValidVersion("1.0.0", "^2.0.0", false);
    testIsValidVersion("1.0.0", "*", true);
    testIsValidVersion("1.0.0", ">=0.0.1", true);
    testIsValidVersion("1.0.0", ">=0.0.10", true);
    testIsValidVersion("1.0.0", ">=0.10.0", true);
    testIsValidVersion("1.0.0", ">=0.10.1", true);
    testIsValidVersion("1.0.0", ">=1.0.0", true);
    testIsValidVersion("1.0.0", ">=1.1.0", false);
    testIsValidVersion("1.0.0", ">=1.0.1", false);
    testIsValidVersion("1.0.0", ">=2.0.0", false);
    testIsValidVersion("1.0.100", "x.x.x", true);
    testIsValidVersion("1.0.100", "0.x.x", true);
    testIsValidVersion("1.0.100", "0.10.0", false);
    testIsValidVersion("1.0.100", "0.10.2", false);
    testIsValidVersion("1.0.100", "^0.10.2", true);
    testIsValidVersion("1.0.100", "0.10.x", true);
    testIsValidVersion("1.0.100", "^0.10.0", true);
    testIsValidVersion("1.0.100", "1.0.0", false);
    testIsValidVersion("1.0.100", "^1.0.0", true);
    testIsValidVersion("1.0.100", "^1.0.1", true);
    testIsValidVersion("1.0.100", "^2.0.0", false);
    testIsValidVersion("1.0.100", "*", true);
    testIsValidVersion("1.100.0", "x.x.x", true);
    testIsValidVersion("1.100.0", "0.x.x", true);
    testIsValidVersion("1.100.0", "0.10.0", false);
    testIsValidVersion("1.100.0", "0.10.2", false);
    testIsValidVersion("1.100.0", "^0.10.2", true);
    testIsValidVersion("1.100.0", "0.10.x", true);
    testIsValidVersion("1.100.0", "^0.10.0", true);
    testIsValidVersion("1.100.0", "1.0.0", false);
    testIsValidVersion("1.100.0", "^1.0.0", true);
    testIsValidVersion("1.100.0", "^1.1.0", true);
    testIsValidVersion("1.100.0", "^1.100.0", true);
    testIsValidVersion("1.100.0", "^2.0.0", false);
    testIsValidVersion("1.100.0", "*", true);
    testIsValidVersion("1.100.0", ">=1.99.0", true);
    testIsValidVersion("1.100.0", ">=1.100.0", true);
    testIsValidVersion("1.100.0", ">=1.101.0", false);
    testIsValidVersion("2.0.0", "x.x.x", true);
    testIsValidVersion("2.0.0", "0.x.x", false);
    testIsValidVersion("2.0.0", "0.10.0", false);
    testIsValidVersion("2.0.0", "0.10.2", false);
    testIsValidVersion("2.0.0", "^0.10.2", false);
    testIsValidVersion("2.0.0", "0.10.x", false);
    testIsValidVersion("2.0.0", "^0.10.0", false);
    testIsValidVersion("2.0.0", "1.0.0", false);
    testIsValidVersion("2.0.0", "^1.0.0", false);
    testIsValidVersion("2.0.0", "^1.1.0", false);
    testIsValidVersion("2.0.0", "^1.100.0", false);
    testIsValidVersion("2.0.0", "^2.0.0", true);
    testIsValidVersion("2.0.0", "*", true);
  });
  test("isValidExtensionVersion", () => {
    function testExtensionVersion(version, desiredVersion, isBuiltin, hasMain, expectedResult) {
      const manifest = {
        name: "test",
        publisher: "test",
        version: "0.0.0",
        engines: {
          vscode: desiredVersion
        },
        main: hasMain ? "something" : void 0
      };
      const reasons = [];
      const actual = isValidExtensionVersion(version, productVersion, manifest, isBuiltin, reasons);
      assert.strictEqual(actual, expectedResult, "version: " + version + ", desiredVersion: " + desiredVersion + ", desc: " + JSON.stringify(manifest) + ", reasons: " + JSON.stringify(reasons));
    }
    function testIsInvalidExtensionVersion(version, desiredVersion, isBuiltin, hasMain) {
      testExtensionVersion(version, desiredVersion, isBuiltin, hasMain, false);
    }
    function testIsValidExtensionVersion(version, desiredVersion, isBuiltin, hasMain) {
      testExtensionVersion(version, desiredVersion, isBuiltin, hasMain, true);
    }
    function testIsValidVersion(version, desiredVersion, expectedResult) {
      testExtensionVersion(version, desiredVersion, false, true, expectedResult);
    }
    testIsValidExtensionVersion("0.10.0-dev", "*", true, true);
    testIsValidExtensionVersion("0.10.0-dev", "x.x.x", true, true);
    testIsValidExtensionVersion("0.10.0-dev", "0.x.x", true, true);
    testIsValidExtensionVersion("0.10.0-dev", "0.10.x", true, true);
    testIsValidExtensionVersion("1.10.0-dev", "1.x.x", true, true);
    testIsValidExtensionVersion("1.10.0-dev", "1.10.x", true, true);
    testIsValidExtensionVersion("0.10.0-dev", "*", true, false);
    testIsValidExtensionVersion("0.10.0-dev", "x.x.x", true, false);
    testIsValidExtensionVersion("0.10.0-dev", "0.x.x", true, false);
    testIsValidExtensionVersion("0.10.0-dev", "0.10.x", true, false);
    testIsValidExtensionVersion("1.10.0-dev", "1.x.x", true, false);
    testIsValidExtensionVersion("1.10.0-dev", "1.10.x", true, false);
    testIsInvalidExtensionVersion("0.10.0-dev", "*", false, true);
    testIsInvalidExtensionVersion("0.10.0-dev", "x.x.x", false, true);
    testIsInvalidExtensionVersion("0.10.0-dev", "0.x.x", false, true);
    testIsValidExtensionVersion("0.10.0-dev", "0.10.x", false, true);
    testIsValidExtensionVersion("1.10.0-dev", "1.x.x", false, true);
    testIsValidExtensionVersion("1.10.0-dev", "1.10.x", false, true);
    testIsValidExtensionVersion("0.10.0-dev", "*", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "x.x.x", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "0.x.x", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "0.10.x", false, false);
    testIsValidExtensionVersion("1.10.0-dev", "1.x.x", false, false);
    testIsValidExtensionVersion("1.10.0-dev", "1.10.x", false, false);
    testIsValidExtensionVersion("0.10.0-dev", ">=0.9.1-pre.1", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "*", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "x.x.x", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "0.x.x", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "0.10.x", false, false);
    testIsValidExtensionVersion("1.10.0-dev", "1.x.x", false, false);
    testIsValidExtensionVersion("1.10.0-dev", "1.10.x", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "*", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "x.x.x", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "0.x.x", false, false);
    testIsValidExtensionVersion("0.10.0-dev", "0.10.x", false, false);
    testIsValidExtensionVersion("1.10.0-dev", "1.x.x", false, false);
    testIsValidExtensionVersion("1.10.0-dev", "1.10.x", false, false);
    testIsValidVersion("0.10.0-dev", "x.x.x", false);
    testIsValidVersion("0.10.0-dev", "0.x.x", false);
    testIsValidVersion("0.10.0-dev", "0.10.0", true);
    testIsValidVersion("0.10.0-dev", "0.10.2", false);
    testIsValidVersion("0.10.0-dev", "^0.10.2", false);
    testIsValidVersion("0.10.0-dev", "0.10.x", true);
    testIsValidVersion("0.10.0-dev", "^0.10.0", true);
    testIsValidVersion("0.10.0-dev", "*", false);
    testIsValidVersion("0.10.0", "x.x.x", false);
    testIsValidVersion("0.10.0", "0.x.x", false);
    testIsValidVersion("0.10.0", "0.10.0", true);
    testIsValidVersion("0.10.0", "0.10.2", false);
    testIsValidVersion("0.10.0", "^0.10.2", false);
    testIsValidVersion("0.10.0", "0.10.x", true);
    testIsValidVersion("0.10.0", "^0.10.0", true);
    testIsValidVersion("0.10.0", "*", false);
    testIsValidVersion("0.10.1", "x.x.x", false);
    testIsValidVersion("0.10.1", "0.x.x", false);
    testIsValidVersion("0.10.1", "0.10.0", false);
    testIsValidVersion("0.10.1", "0.10.2", false);
    testIsValidVersion("0.10.1", "^0.10.2", false);
    testIsValidVersion("0.10.1", "0.10.x", true);
    testIsValidVersion("0.10.1", "^0.10.0", true);
    testIsValidVersion("0.10.1", "*", false);
    testIsValidVersion("0.10.100", "x.x.x", false);
    testIsValidVersion("0.10.100", "0.x.x", false);
    testIsValidVersion("0.10.100", "0.10.0", false);
    testIsValidVersion("0.10.100", "0.10.2", false);
    testIsValidVersion("0.10.100", "^0.10.2", true);
    testIsValidVersion("0.10.100", "0.10.x", true);
    testIsValidVersion("0.10.100", "^0.10.0", true);
    testIsValidVersion("0.10.100", "*", false);
    testIsValidVersion("0.11.0", "x.x.x", false);
    testIsValidVersion("0.11.0", "0.x.x", false);
    testIsValidVersion("0.11.0", "0.10.0", false);
    testIsValidVersion("0.11.0", "0.10.2", false);
    testIsValidVersion("0.11.0", "^0.10.2", false);
    testIsValidVersion("0.11.0", "0.10.x", false);
    testIsValidVersion("0.11.0", "^0.10.0", false);
    testIsValidVersion("0.11.0", "*", false);
    testIsValidVersion("1.0.0", "x.x.x", false);
    testIsValidVersion("1.0.0", "0.x.x", false);
    testIsValidVersion("1.0.0", "0.10.0", false);
    testIsValidVersion("1.0.0", "0.10.2", false);
    testIsValidVersion("1.0.0", "^0.10.2", true);
    testIsValidVersion("1.0.0", "0.10.x", true);
    testIsValidVersion("1.0.0", "^0.10.0", true);
    testIsValidVersion("1.0.0", "*", false);
    testIsValidVersion("1.10.0", "x.x.x", false);
    testIsValidVersion("1.10.0", "1.x.x", true);
    testIsValidVersion("1.10.0", "1.10.0", true);
    testIsValidVersion("1.10.0", "1.10.2", false);
    testIsValidVersion("1.10.0", "^1.10.2", false);
    testIsValidVersion("1.10.0", "1.10.x", true);
    testIsValidVersion("1.10.0", "^1.10.0", true);
    testIsValidVersion("1.10.0", "*", false);
    testIsValidVersion("1.0.0", "x.x.x", false);
    testIsValidVersion("1.0.0", "0.x.x", false);
    testIsValidVersion("1.0.0", "0.10.0", false);
    testIsValidVersion("1.0.0", "0.10.2", false);
    testIsValidVersion("1.0.0", "^0.10.2", true);
    testIsValidVersion("1.0.0", "0.10.x", true);
    testIsValidVersion("1.0.0", "^0.10.0", true);
    testIsValidVersion("1.0.0", "1.0.0", true);
    testIsValidVersion("1.0.0", "^1.0.0", true);
    testIsValidVersion("1.0.0", "^2.0.0", false);
    testIsValidVersion("1.0.0", "*", false);
    testIsValidVersion("1.0.100", "x.x.x", false);
    testIsValidVersion("1.0.100", "0.x.x", false);
    testIsValidVersion("1.0.100", "0.10.0", false);
    testIsValidVersion("1.0.100", "0.10.2", false);
    testIsValidVersion("1.0.100", "^0.10.2", true);
    testIsValidVersion("1.0.100", "0.10.x", true);
    testIsValidVersion("1.0.100", "^0.10.0", true);
    testIsValidVersion("1.0.100", "1.0.0", false);
    testIsValidVersion("1.0.100", "^1.0.0", true);
    testIsValidVersion("1.0.100", "^1.0.1", true);
    testIsValidVersion("1.0.100", "^2.0.0", false);
    testIsValidVersion("1.0.100", "*", false);
    testIsValidVersion("1.100.0", "x.x.x", false);
    testIsValidVersion("1.100.0", "0.x.x", false);
    testIsValidVersion("1.100.0", "0.10.0", false);
    testIsValidVersion("1.100.0", "0.10.2", false);
    testIsValidVersion("1.100.0", "^0.10.2", true);
    testIsValidVersion("1.100.0", "0.10.x", true);
    testIsValidVersion("1.100.0", "^0.10.0", true);
    testIsValidVersion("1.100.0", "1.0.0", false);
    testIsValidVersion("1.100.0", "^1.0.0", true);
    testIsValidVersion("1.100.0", "^1.1.0", true);
    testIsValidVersion("1.100.0", "^1.100.0", true);
    testIsValidVersion("1.100.0", "^2.0.0", false);
    testIsValidVersion("1.100.0", "*", false);
    testIsValidVersion("2.0.0", "x.x.x", false);
    testIsValidVersion("2.0.0", "0.x.x", false);
    testIsValidVersion("2.0.0", "0.10.0", false);
    testIsValidVersion("2.0.0", "0.10.2", false);
    testIsValidVersion("2.0.0", "^0.10.2", false);
    testIsValidVersion("2.0.0", "0.10.x", false);
    testIsValidVersion("2.0.0", "^0.10.0", false);
    testIsValidVersion("2.0.0", "1.0.0", false);
    testIsValidVersion("2.0.0", "^1.0.0", false);
    testIsValidVersion("2.0.0", "^1.1.0", false);
    testIsValidVersion("2.0.0", "^1.100.0", false);
    testIsValidVersion("2.0.0", "^2.0.0", true);
    testIsValidVersion("2.0.0", "*", false);
    testIsValidVersion("1.10.0", "^1.10.0-20210511", true);
    testIsValidVersion("1.10.0", "^1.10.0-20210510", true);
    testIsValidVersion("1.10.0", "^1.10.0-20210512", false);
    testIsValidVersion("1.10.1", "^1.10.0-20200101", true);
    testIsValidVersion("1.11.0", "^1.10.0-20200101", true);
    testIsValidVersion("1.10.0", "^1.10.0-202105111400", true);
    testIsValidVersion("1.10.0", "^1.10.0-202105112359", false);
    testIsValidVersion("1.10.0", "^1.10.0-202105110000", true);
  });
  test("isValidExtensionVersion checks browser only extensions", () => {
    const manifest = {
      name: "test",
      publisher: "test",
      version: "0.0.0",
      engines: {
        vscode: "^1.45.0"
      },
      browser: "something"
    };
    assert.strictEqual(isValidExtensionVersion("1.44.0", void 0, manifest, false, []), false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVuc2lvbnMvdGVzdC9jb21tb24vZXh0ZW5zaW9uVmFsaWRhdG9yLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTm9ybWFsaXplZFZlcnNpb24sIElQYXJzZWRWZXJzaW9uLCBpc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbiwgaXNWYWxpZFZlcnNpb24sIGlzVmFsaWRWZXJzaW9uU3RyLCBub3JtYWxpemVWZXJzaW9uLCBwYXJzZVZlcnNpb24gfSBmcm9tICcuLi8uLi9jb21tb24vZXh0ZW5zaW9uVmFsaWRhdG9yLmpzJztcblxuc3VpdGUoJ0V4dGVuc2lvbiBWZXJzaW9uIFZhbGlkYXRvcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBwcm9kdWN0VmVyc2lvbiA9ICcyMDIxLTA1LTExVDIxOjU0OjMwLjU3N1onO1xuXG5cdHRlc3QoJ2lzVmFsaWRWZXJzaW9uU3RyJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkVmVyc2lvblN0cignMC4xMC4wLWRldicpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNWYWxpZFZlcnNpb25TdHIoJzAuMTAuMCcpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNWYWxpZFZlcnNpb25TdHIoJzAuMTAuMScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNWYWxpZFZlcnNpb25TdHIoJzAuMTAuMTAwJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkVmVyc2lvblN0cignMC4xMS4wJyksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVmFsaWRWZXJzaW9uU3RyKCd4LngueCcpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNWYWxpZFZlcnNpb25TdHIoJzAueC54JyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkVmVyc2lvblN0cignMC4xMC4wJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkVmVyc2lvblN0cignMC4xMC54JyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkVmVyc2lvblN0cignXjAuMTAuMCcpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNWYWxpZFZlcnNpb25TdHIoJyonKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNWYWxpZFZlcnNpb25TdHIoJzAueC54LngnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkVmVyc2lvblN0cignMC4xMCcpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVmFsaWRWZXJzaW9uU3RyKCcwLjEwLicpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlVmVyc2lvbicsICgpID0+IHtcblx0XHRmdW5jdGlvbiBhc3NlcnRQYXJzZVZlcnNpb24odmVyc2lvbjogc3RyaW5nLCBoYXNDYXJldDogYm9vbGVhbiwgaGFzR3JlYXRlckVxdWFsczogYm9vbGVhbiwgbWFqb3JCYXNlOiBudW1iZXIsIG1ham9yTXVzdEVxdWFsOiBib29sZWFuLCBtaW5vckJhc2U6IG51bWJlciwgbWlub3JNdXN0RXF1YWw6IGJvb2xlYW4sIHBhdGNoQmFzZTogbnVtYmVyLCBwYXRjaE11c3RFcXVhbDogYm9vbGVhbiwgcHJlUmVsZWFzZTogc3RyaW5nIHwgbnVsbCk6IHZvaWQge1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VWZXJzaW9uKHZlcnNpb24pO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQ6IElQYXJzZWRWZXJzaW9uID0geyBoYXNDYXJldCwgaGFzR3JlYXRlckVxdWFscywgbWFqb3JCYXNlLCBtYWpvck11c3RFcXVhbCwgbWlub3JCYXNlLCBtaW5vck11c3RFcXVhbCwgcGF0Y2hCYXNlLCBwYXRjaE11c3RFcXVhbCwgcHJlUmVsZWFzZSB9O1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsICdwYXJzZVZlcnNpb24gZm9yICcgKyB2ZXJzaW9uKTtcblx0XHR9XG5cblx0XHRhc3NlcnRQYXJzZVZlcnNpb24oJzAuMTAuMC1kZXYnLCBmYWxzZSwgZmFsc2UsIDAsIHRydWUsIDEwLCB0cnVlLCAwLCB0cnVlLCAnLWRldicpO1xuXHRcdGFzc2VydFBhcnNlVmVyc2lvbignMC4xMC4wJywgZmFsc2UsIGZhbHNlLCAwLCB0cnVlLCAxMCwgdHJ1ZSwgMCwgdHJ1ZSwgbnVsbCk7XG5cdFx0YXNzZXJ0UGFyc2VWZXJzaW9uKCcwLjEwLjEnLCBmYWxzZSwgZmFsc2UsIDAsIHRydWUsIDEwLCB0cnVlLCAxLCB0cnVlLCBudWxsKTtcblx0XHRhc3NlcnRQYXJzZVZlcnNpb24oJzAuMTAuMTAwJywgZmFsc2UsIGZhbHNlLCAwLCB0cnVlLCAxMCwgdHJ1ZSwgMTAwLCB0cnVlLCBudWxsKTtcblx0XHRhc3NlcnRQYXJzZVZlcnNpb24oJzAuMTEuMCcsIGZhbHNlLCBmYWxzZSwgMCwgdHJ1ZSwgMTEsIHRydWUsIDAsIHRydWUsIG51bGwpO1xuXG5cdFx0YXNzZXJ0UGFyc2VWZXJzaW9uKCd4LngueCcsIGZhbHNlLCBmYWxzZSwgMCwgZmFsc2UsIDAsIGZhbHNlLCAwLCBmYWxzZSwgbnVsbCk7XG5cdFx0YXNzZXJ0UGFyc2VWZXJzaW9uKCcwLngueCcsIGZhbHNlLCBmYWxzZSwgMCwgdHJ1ZSwgMCwgZmFsc2UsIDAsIGZhbHNlLCBudWxsKTtcblx0XHRhc3NlcnRQYXJzZVZlcnNpb24oJzAuMTAueCcsIGZhbHNlLCBmYWxzZSwgMCwgdHJ1ZSwgMTAsIHRydWUsIDAsIGZhbHNlLCBudWxsKTtcblx0XHRhc3NlcnRQYXJzZVZlcnNpb24oJ14wLjEwLjAnLCB0cnVlLCBmYWxzZSwgMCwgdHJ1ZSwgMTAsIHRydWUsIDAsIHRydWUsIG51bGwpO1xuXHRcdGFzc2VydFBhcnNlVmVyc2lvbignXjAuMTAuMicsIHRydWUsIGZhbHNlLCAwLCB0cnVlLCAxMCwgdHJ1ZSwgMiwgdHJ1ZSwgbnVsbCk7XG5cdFx0YXNzZXJ0UGFyc2VWZXJzaW9uKCdeMS4xMC4yJywgdHJ1ZSwgZmFsc2UsIDEsIHRydWUsIDEwLCB0cnVlLCAyLCB0cnVlLCBudWxsKTtcblx0XHRhc3NlcnRQYXJzZVZlcnNpb24oJyonLCBmYWxzZSwgZmFsc2UsIDAsIGZhbHNlLCAwLCBmYWxzZSwgMCwgZmFsc2UsIG51bGwpO1xuXG5cdFx0YXNzZXJ0UGFyc2VWZXJzaW9uKCc+PTAuMC4xJywgZmFsc2UsIHRydWUsIDAsIHRydWUsIDAsIHRydWUsIDEsIHRydWUsIG51bGwpO1xuXHRcdGFzc2VydFBhcnNlVmVyc2lvbignPj0yLjQuMycsIGZhbHNlLCB0cnVlLCAyLCB0cnVlLCA0LCB0cnVlLCAzLCB0cnVlLCBudWxsKTtcblxuXHRcdC8vIFBhcnNlIHZlcnNpb25zIHdpdGggSEhNTSBkYXRlIGZvcm1hdFxuXHRcdGFzc2VydFBhcnNlVmVyc2lvbignMS4xMC4wLTIwMjEwNTExMTQzMCcsIGZhbHNlLCBmYWxzZSwgMSwgdHJ1ZSwgMTAsIHRydWUsIDAsIHRydWUsICctMjAyMTA1MTExNDMwJyk7XG5cdFx0YXNzZXJ0UGFyc2VWZXJzaW9uKCdeMS4xMC4wLTIwMjEwNTExMjM1OScsIHRydWUsIGZhbHNlLCAxLCB0cnVlLCAxMCwgdHJ1ZSwgMCwgdHJ1ZSwgJy0yMDIxMDUxMTIzNTknKTtcblx0fSk7XG5cblx0dGVzdCgnbm9ybWFsaXplVmVyc2lvbicsICgpID0+IHtcblx0XHRmdW5jdGlvbiBhc3NlcnROb3JtYWxpemVWZXJzaW9uKHZlcnNpb246IHN0cmluZywgbWFqb3JCYXNlOiBudW1iZXIsIG1ham9yTXVzdEVxdWFsOiBib29sZWFuLCBtaW5vckJhc2U6IG51bWJlciwgbWlub3JNdXN0RXF1YWw6IGJvb2xlYW4sIHBhdGNoQmFzZTogbnVtYmVyLCBwYXRjaE11c3RFcXVhbDogYm9vbGVhbiwgaXNNaW5pbXVtOiBib29sZWFuLCBub3RCZWZvcmUgPSAwKTogdm9pZCB7XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBub3JtYWxpemVWZXJzaW9uKHBhcnNlVmVyc2lvbih2ZXJzaW9uKSk7XG5cdFx0XHRjb25zdCBleHBlY3RlZDogSU5vcm1hbGl6ZWRWZXJzaW9uID0geyBtYWpvckJhc2UsIG1ham9yTXVzdEVxdWFsLCBtaW5vckJhc2UsIG1pbm9yTXVzdEVxdWFsLCBwYXRjaEJhc2UsIHBhdGNoTXVzdEVxdWFsLCBpc01pbmltdW0sIG5vdEJlZm9yZSB9O1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCAncGFyc2VWZXJzaW9uIGZvciAnICsgdmVyc2lvbik7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Tm9ybWFsaXplVmVyc2lvbignMC4xMC4wLWRldicsIDAsIHRydWUsIDEwLCB0cnVlLCAwLCB0cnVlLCBmYWxzZSwgMCk7XG5cdFx0YXNzZXJ0Tm9ybWFsaXplVmVyc2lvbignMC4xMC4wLTIyMjIyMjIyMicsIDAsIHRydWUsIDEwLCB0cnVlLCAwLCB0cnVlLCBmYWxzZSwgMCk7XG5cdFx0YXNzZXJ0Tm9ybWFsaXplVmVyc2lvbignMC4xMC4wLTIwMjEwNTExJywgMCwgdHJ1ZSwgMTAsIHRydWUsIDAsIHRydWUsIGZhbHNlLCBuZXcgRGF0ZSgnMjAyMS0wNS0xMVQwMDowMDowMFonKS5nZXRUaW1lKCkpO1xuXG5cdFx0Ly8gTm9ybWFsaXplIHZlcnNpb25zIHdpdGggSEhNTSBkYXRlIGZvcm1hdFxuXHRcdGFzc2VydE5vcm1hbGl6ZVZlcnNpb24oJzEuMTAuMC0yMDIxMDUxMTE0MzAnLCAxLCB0cnVlLCAxMCwgdHJ1ZSwgMCwgdHJ1ZSwgZmFsc2UsIG5ldyBEYXRlKCcyMDIxLTA1LTExVDE0OjMwOjAwWicpLmdldFRpbWUoKSk7XG5cdFx0YXNzZXJ0Tm9ybWFsaXplVmVyc2lvbignMS4xMC4wLTIwMjEwNTExMjM1OScsIDEsIHRydWUsIDEwLCB0cnVlLCAwLCB0cnVlLCBmYWxzZSwgbmV3IERhdGUoJzIwMjEtMDUtMTFUMjM6NTk6MDBaJykuZ2V0VGltZSgpKTtcblx0XHRhc3NlcnROb3JtYWxpemVWZXJzaW9uKCcxLjEwLjAtMjAyMTA1MTEwMDAwJywgMSwgdHJ1ZSwgMTAsIHRydWUsIDAsIHRydWUsIGZhbHNlLCBuZXcgRGF0ZSgnMjAyMS0wNS0xMVQwMDowMDowMFonKS5nZXRUaW1lKCkpO1xuXG5cdFx0YXNzZXJ0Tm9ybWFsaXplVmVyc2lvbignMC4xMC4wJywgMCwgdHJ1ZSwgMTAsIHRydWUsIDAsIHRydWUsIGZhbHNlKTtcblx0XHRhc3NlcnROb3JtYWxpemVWZXJzaW9uKCcwLjEwLjEnLCAwLCB0cnVlLCAxMCwgdHJ1ZSwgMSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdGFzc2VydE5vcm1hbGl6ZVZlcnNpb24oJzAuMTAuMTAwJywgMCwgdHJ1ZSwgMTAsIHRydWUsIDEwMCwgdHJ1ZSwgZmFsc2UpO1xuXHRcdGFzc2VydE5vcm1hbGl6ZVZlcnNpb24oJzAuMTEuMCcsIDAsIHRydWUsIDExLCB0cnVlLCAwLCB0cnVlLCBmYWxzZSk7XG5cblx0XHRhc3NlcnROb3JtYWxpemVWZXJzaW9uKCd4LngueCcsIDAsIGZhbHNlLCAwLCBmYWxzZSwgMCwgZmFsc2UsIGZhbHNlKTtcblx0XHRhc3NlcnROb3JtYWxpemVWZXJzaW9uKCcwLngueCcsIDAsIHRydWUsIDAsIGZhbHNlLCAwLCBmYWxzZSwgZmFsc2UpO1xuXHRcdGFzc2VydE5vcm1hbGl6ZVZlcnNpb24oJzAuMTAueCcsIDAsIHRydWUsIDEwLCB0cnVlLCAwLCBmYWxzZSwgZmFsc2UpO1xuXHRcdGFzc2VydE5vcm1hbGl6ZVZlcnNpb24oJ14wLjEwLjAnLCAwLCB0cnVlLCAxMCwgdHJ1ZSwgMCwgZmFsc2UsIGZhbHNlKTtcblx0XHRhc3NlcnROb3JtYWxpemVWZXJzaW9uKCdeMC4xMC4yJywgMCwgdHJ1ZSwgMTAsIHRydWUsIDIsIGZhbHNlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Tm9ybWFsaXplVmVyc2lvbignXjEuMTAuMicsIDEsIHRydWUsIDEwLCBmYWxzZSwgMiwgZmFsc2UsIGZhbHNlKTtcblx0XHRhc3NlcnROb3JtYWxpemVWZXJzaW9uKCcqJywgMCwgZmFsc2UsIDAsIGZhbHNlLCAwLCBmYWxzZSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0Tm9ybWFsaXplVmVyc2lvbignPj0wLjAuMScsIDAsIHRydWUsIDAsIHRydWUsIDEsIHRydWUsIHRydWUpO1xuXHRcdGFzc2VydE5vcm1hbGl6ZVZlcnNpb24oJz49Mi40LjMnLCAyLCB0cnVlLCA0LCB0cnVlLCAzLCB0cnVlLCB0cnVlKTtcblx0XHRhc3NlcnROb3JtYWxpemVWZXJzaW9uKCc+PTIuNC4zJywgMiwgdHJ1ZSwgNCwgdHJ1ZSwgMywgdHJ1ZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzVmFsaWRWZXJzaW9uJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIHRlc3RJc1ZhbGlkVmVyc2lvbih2ZXJzaW9uOiBzdHJpbmcsIGRlc2lyZWRWZXJzaW9uOiBzdHJpbmcsIGV4cGVjdGVkUmVzdWx0OiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBpc1ZhbGlkVmVyc2lvbih2ZXJzaW9uLCBwcm9kdWN0VmVyc2lvbiwgZGVzaXJlZFZlcnNpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWRSZXN1bHQsICdleHRlbnNpb24gLSB2c2NvZGU6ICcgKyB2ZXJzaW9uICsgJywgZGVzaXJlZFZlcnNpb246ICcgKyBkZXNpcmVkVmVyc2lvbiArICcgc2hvdWxkIGJlICcgKyBleHBlY3RlZFJlc3VsdCk7XG5cdFx0fVxuXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAtZGV2JywgJ3gueC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAtZGV2JywgJzAueC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAtZGV2JywgJzAuMTAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wLWRldicsICcwLjEwLjInLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAtZGV2JywgJ14wLjEwLjInLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAtZGV2JywgJzAuMTAueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wLWRldicsICdeMC4xMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAtZGV2JywgJyonLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMC1kZXYnLCAnPj0wLjAuMScsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wLWRldicsICc+PTAuMC4xMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wLWRldicsICc+PTAuMTAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wLWRldicsICc+PTAuMTAuMScsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMC1kZXYnLCAnPj0xLjAuMCcsIGZhbHNlKTtcblxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wJywgJ3gueC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAnLCAnMC54LngnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMCcsICcwLjEwLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMCcsICcwLjEwLjInLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAnLCAnXjAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMCcsICcwLjEwLngnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMCcsICdeMC4xMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAnLCAnKicsIHRydWUpO1xuXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEnLCAneC54LngnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMScsICcwLngueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xJywgJzAuMTAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMScsICcwLjEwLjInLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEnLCAnXjAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMScsICcwLjEwLngnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMScsICdeMC4xMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEnLCAnKicsIHRydWUpO1xuXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEwMCcsICd4LngueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xMDAnLCAnMC54LngnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMTAwJywgJzAuMTAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMTAwJywgJzAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMTAwJywgJ14wLjEwLjInLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMTAwJywgJzAuMTAueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xMDAnLCAnXjAuMTAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xMDAnLCAnKicsIHRydWUpO1xuXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjExLjAnLCAneC54LngnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTEuMCcsICcwLngueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMS4wJywgJzAuMTAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTEuMCcsICcwLjEwLjInLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjExLjAnLCAnXjAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTEuMCcsICcwLjEwLngnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjExLjAnLCAnXjAuMTAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTEuMCcsICcqJywgdHJ1ZSk7XG5cblx0XHQvLyBBbnl0aGluZyA8IDEuMC4wIGlzIGNvbXBhdGlibGVcblxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAneC54LngnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJzAueC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICcwLjEwLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICcwLjEwLjInLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICdeMC4xMC4yJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICcwLjEwLngnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJ14wLjEwLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJzEuMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICdeMS4wLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJ14yLjAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJyonLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJz49MC4wLjEnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJz49MC4wLjEwJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICc+PTAuMTAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnPj0wLjEwLjEnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJz49MS4wLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJz49MS4xLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICc+PTEuMC4xJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnPj0yLjAuMCcsIGZhbHNlKTtcblxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjEwMCcsICd4LngueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjEwMCcsICcwLngueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjEwMCcsICcwLjEwLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMTAwJywgJzAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4xMDAnLCAnXjAuMTAuMicsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjEwMCcsICcwLjEwLngnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4xMDAnLCAnXjAuMTAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjEwMCcsICcxLjAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4xMDAnLCAnXjEuMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMTAwJywgJ14xLjAuMScsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjEwMCcsICdeMi4wLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMTAwJywgJyonLCB0cnVlKTtcblxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICd4LngueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICcwLngueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICcwLjEwLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJzAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAwLjAnLCAnXjAuMTAuMicsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICcwLjEwLngnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAwLjAnLCAnXjAuMTAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICcxLjAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAwLjAnLCAnXjEuMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJ14xLjEuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICdeMS4xMDAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICdeMi4wLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJyonLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAwLjAnLCAnPj0xLjk5LjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAwLjAnLCAnPj0xLjEwMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJz49MS4xMDEuMCcsIGZhbHNlKTtcblxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMi4wLjAnLCAneC54LngnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzIuMC4wJywgJzAueC54JywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMi4wLjAnLCAnMC4xMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMi4wLjAnLCAnMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMi4wLjAnLCAnXjAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzIuMC4wJywgJzAuMTAueCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzIuMC4wJywgJ14wLjEwLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcyLjAuMCcsICcxLjAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzIuMC4wJywgJ14xLjAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzIuMC4wJywgJ14xLjEuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzIuMC4wJywgJ14xLjEwMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMi4wLjAnLCAnXjIuMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcyLjAuMCcsICcqJywgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzVmFsaWRFeHRlbnNpb25WZXJzaW9uJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gdGVzdEV4dGVuc2lvblZlcnNpb24odmVyc2lvbjogc3RyaW5nLCBkZXNpcmVkVmVyc2lvbjogc3RyaW5nLCBpc0J1aWx0aW46IGJvb2xlYW4sIGhhc01haW46IGJvb2xlYW4sIGV4cGVjdGVkUmVzdWx0OiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0ID0ge1xuXHRcdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRcdHB1Ymxpc2hlcjogJ3Rlc3QnLFxuXHRcdFx0XHR2ZXJzaW9uOiAnMC4wLjAnLFxuXHRcdFx0XHRlbmdpbmVzOiB7XG5cdFx0XHRcdFx0dnNjb2RlOiBkZXNpcmVkVmVyc2lvblxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtYWluOiBoYXNNYWluID8gJ3NvbWV0aGluZycgOiB1bmRlZmluZWRcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gaXNWYWxpZEV4dGVuc2lvblZlcnNpb24odmVyc2lvbiwgcHJvZHVjdFZlcnNpb24sIG1hbmlmZXN0LCBpc0J1aWx0aW4sIHJlYXNvbnMpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZFJlc3VsdCwgJ3ZlcnNpb246ICcgKyB2ZXJzaW9uICsgJywgZGVzaXJlZFZlcnNpb246ICcgKyBkZXNpcmVkVmVyc2lvbiArICcsIGRlc2M6ICcgKyBKU09OLnN0cmluZ2lmeShtYW5pZmVzdCkgKyAnLCByZWFzb25zOiAnICsgSlNPTi5zdHJpbmdpZnkocmVhc29ucykpO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHRlc3RJc0ludmFsaWRFeHRlbnNpb25WZXJzaW9uKHZlcnNpb246IHN0cmluZywgZGVzaXJlZFZlcnNpb246IHN0cmluZywgaXNCdWlsdGluOiBib29sZWFuLCBoYXNNYWluOiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHR0ZXN0RXh0ZW5zaW9uVmVyc2lvbih2ZXJzaW9uLCBkZXNpcmVkVmVyc2lvbiwgaXNCdWlsdGluLCBoYXNNYWluLCBmYWxzZSk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKHZlcnNpb246IHN0cmluZywgZGVzaXJlZFZlcnNpb246IHN0cmluZywgaXNCdWlsdGluOiBib29sZWFuLCBoYXNNYWluOiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHR0ZXN0RXh0ZW5zaW9uVmVyc2lvbih2ZXJzaW9uLCBkZXNpcmVkVmVyc2lvbiwgaXNCdWlsdGluLCBoYXNNYWluLCB0cnVlKTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiB0ZXN0SXNWYWxpZFZlcnNpb24odmVyc2lvbjogc3RyaW5nLCBkZXNpcmVkVmVyc2lvbjogc3RyaW5nLCBleHBlY3RlZFJlc3VsdDogYm9vbGVhbik6IHZvaWQge1xuXHRcdFx0dGVzdEV4dGVuc2lvblZlcnNpb24odmVyc2lvbiwgZGVzaXJlZFZlcnNpb24sIGZhbHNlLCB0cnVlLCBleHBlY3RlZFJlc3VsdCk7XG5cdFx0fVxuXG5cdFx0Ly8gYnVpbHRpbiBhcmUgYWxsb3dlZCB0byB1c2UgKiBvciB4LngueFxuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMC4xMC4wLWRldicsICcqJywgdHJ1ZSwgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcwLjEwLjAtZGV2JywgJ3gueC54JywgdHJ1ZSwgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcwLjEwLjAtZGV2JywgJzAueC54JywgdHJ1ZSwgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcwLjEwLjAtZGV2JywgJzAuMTAueCcsIHRydWUsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMS4xMC4wLWRldicsICcxLngueCcsIHRydWUsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMS4xMC4wLWRldicsICcxLjEwLngnLCB0cnVlLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzAuMTAuMC1kZXYnLCAnKicsIHRydWUsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzAuMTAuMC1kZXYnLCAneC54LngnLCB0cnVlLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcwLjEwLjAtZGV2JywgJzAueC54JywgdHJ1ZSwgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMC4xMC4wLWRldicsICcwLjEwLngnLCB0cnVlLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcxLjEwLjAtZGV2JywgJzEueC54JywgdHJ1ZSwgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMS4xMC4wLWRldicsICcxLjEwLngnLCB0cnVlLCBmYWxzZSk7XG5cblx0XHQvLyBub3JtYWwgZXh0ZW5zaW9ucyBhcmUgYWxsb3dlZCB0byB1c2UgKiBvciB4LngueCBvbmx5IGlmIHRoZXkgaGF2ZSBubyBtYWluXG5cdFx0dGVzdElzSW52YWxpZEV4dGVuc2lvblZlcnNpb24oJzAuMTAuMC1kZXYnLCAnKicsIGZhbHNlLCB0cnVlKTtcblx0XHR0ZXN0SXNJbnZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMC4xMC4wLWRldicsICd4LngueCcsIGZhbHNlLCB0cnVlKTtcblx0XHR0ZXN0SXNJbnZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMC4xMC4wLWRldicsICcwLngueCcsIGZhbHNlLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzAuMTAuMC1kZXYnLCAnMC4xMC54JywgZmFsc2UsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMS4xMC4wLWRldicsICcxLngueCcsIGZhbHNlLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzEuMTAuMC1kZXYnLCAnMS4xMC54JywgZmFsc2UsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMC4xMC4wLWRldicsICcqJywgZmFsc2UsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzAuMTAuMC1kZXYnLCAneC54LngnLCBmYWxzZSwgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMC4xMC4wLWRldicsICcwLngueCcsIGZhbHNlLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcwLjEwLjAtZGV2JywgJzAuMTAueCcsIGZhbHNlLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcxLjEwLjAtZGV2JywgJzEueC54JywgZmFsc2UsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzEuMTAuMC1kZXYnLCAnMS4xMC54JywgZmFsc2UsIGZhbHNlKTtcblxuXHRcdC8vIGV4dGVuc2lvbnMgd2l0aG91dCBcIm1haW5cIiBnZXQgbm8gdmVyc2lvbiBjaGVja1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMC4xMC4wLWRldicsICc+PTAuOS4xLXByZS4xJywgZmFsc2UsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzAuMTAuMC1kZXYnLCAnKicsIGZhbHNlLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcwLjEwLjAtZGV2JywgJ3gueC54JywgZmFsc2UsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzAuMTAuMC1kZXYnLCAnMC54LngnLCBmYWxzZSwgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMC4xMC4wLWRldicsICcwLjEwLngnLCBmYWxzZSwgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMS4xMC4wLWRldicsICcxLngueCcsIGZhbHNlLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcxLjEwLjAtZGV2JywgJzEuMTAueCcsIGZhbHNlLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcwLjEwLjAtZGV2JywgJyonLCBmYWxzZSwgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMC4xMC4wLWRldicsICd4LngueCcsIGZhbHNlLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRFeHRlbnNpb25WZXJzaW9uKCcwLjEwLjAtZGV2JywgJzAueC54JywgZmFsc2UsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzAuMTAuMC1kZXYnLCAnMC4xMC54JywgZmFsc2UsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzEuMTAuMC1kZXYnLCAnMS54LngnLCBmYWxzZSwgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkRXh0ZW5zaW9uVmVyc2lvbignMS4xMC4wLWRldicsICcxLjEwLngnLCBmYWxzZSwgZmFsc2UpO1xuXG5cdFx0Ly8gbm9ybWFsIGV4dGVuc2lvbnMgd2l0aCBjb2RlXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAtZGV2JywgJ3gueC54JywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wLWRldicsICcwLngueCcsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMC1kZXYnLCAnMC4xMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAtZGV2JywgJzAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMC1kZXYnLCAnXjAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMC1kZXYnLCAnMC4xMC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjAtZGV2JywgJ14wLjEwLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMC1kZXYnLCAnKicsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wJywgJ3gueC54JywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wJywgJzAueC54JywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wJywgJzAuMTAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wJywgJzAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMCcsICdeMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wJywgJzAuMTAueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4wJywgJ14wLjEwLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMCcsICcqJywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEnLCAneC54LngnLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEnLCAnMC54LngnLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEnLCAnMC4xMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xJywgJzAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMScsICdeMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xJywgJzAuMTAueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xJywgJ14wLjEwLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMScsICcqJywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEwMCcsICd4LngueCcsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTAuMTAwJywgJzAueC54JywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xMDAnLCAnMC4xMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xMDAnLCAnMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xMDAnLCAnXjAuMTAuMicsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMC4xMDAnLCAnMC4xMC54JywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEwMCcsICdeMC4xMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjEwLjEwMCcsICcqJywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjExLjAnLCAneC54LngnLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjExLjAnLCAnMC54LngnLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcwLjExLjAnLCAnMC4xMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMS4wJywgJzAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTEuMCcsICdeMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMS4wJywgJzAuMTAueCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzAuMTEuMCcsICdeMC4xMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMC4xMS4wJywgJyonLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJ3gueC54JywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnMC54LngnLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICcwLjEwLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICcwLjEwLjInLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICdeMC4xMC4yJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICcwLjEwLngnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJ14wLjEwLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJyonLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAuMCcsICd4LngueCcsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAuMCcsICcxLngueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMC4wJywgJzEuMTAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMC4wJywgJzEuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAuMCcsICdeMS4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMC4wJywgJzEuMTAueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMC4wJywgJ14xLjEwLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAuMCcsICcqJywgZmFsc2UpOyAvLyBmYWlscyBkdWUgdG8gbGFjayBvZiBzcGVjaWZpY2l0eVxuXG5cblx0XHQvLyBBbnl0aGluZyA8IDEuMC4wIGlzIGNvbXBhdGlibGVcblxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAneC54LngnLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMCcsICcwLngueCcsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJzAuMTAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJzAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJ14wLjEwLjInLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJzAuMTAueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnXjAuMTAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnMS4wLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4wJywgJ14xLjAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnXjIuMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjAnLCAnKicsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjEwMCcsICd4LngueCcsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4xMDAnLCAnMC54LngnLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMTAwJywgJzAuMTAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4xMDAnLCAnMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjEwMCcsICdeMC4xMC4yJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMTAwJywgJzAuMTAueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjEwMCcsICdeMC4xMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMTAwJywgJzEuMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4wLjEwMCcsICdeMS4wLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4xMDAnLCAnXjEuMC4xJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjAuMTAwJywgJ14yLjAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMC4xMDAnLCAnKicsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICd4LngueCcsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAwLjAnLCAnMC54LngnLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJzAuMTAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAwLjAnLCAnMC4xMC4yJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICdeMC4xMC4yJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJzAuMTAueCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICdeMC4xMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJzEuMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMDAuMCcsICdeMS4wLjAnLCB0cnVlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAwLjAnLCAnXjEuMS4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJ14xLjEwMC4wJywgdHJ1ZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwMC4wJywgJ14yLjAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAwLjAnLCAnKicsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMi4wLjAnLCAneC54LngnLCBmYWxzZSk7IC8vIGZhaWxzIGR1ZSB0byBsYWNrIG9mIHNwZWNpZmljaXR5XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcyLjAuMCcsICcwLngueCcsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzIuMC4wJywgJzAuMTAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzIuMC4wJywgJzAuMTAuMicsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzIuMC4wJywgJ14wLjEwLjInLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcyLjAuMCcsICcwLjEwLngnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcyLjAuMCcsICdeMC4xMC4wJywgZmFsc2UpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMi4wLjAnLCAnMS4wLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcyLjAuMCcsICdeMS4wLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcyLjAuMCcsICdeMS4xLjAnLCBmYWxzZSk7XG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcyLjAuMCcsICdeMS4xMDAuMCcsIGZhbHNlKTtcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzIuMC4wJywgJ14yLjAuMCcsIHRydWUpO1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMi4wLjAnLCAnKicsIGZhbHNlKTsgLy8gZmFpbHMgZHVlIHRvIGxhY2sgb2Ygc3BlY2lmaWNpdHlcblxuXHRcdC8vIGRhdGUgdGFnc1xuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMC4wJywgJ14xLjEwLjAtMjAyMTA1MTEnLCB0cnVlKTsgLy8gY3VycmVudCBkYXRlXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwLjAnLCAnXjEuMTAuMC0yMDIxMDUxMCcsIHRydWUpOyAvLyBiZWZvcmUgZGF0ZVxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMC4wJywgJ14xLjEwLjAtMjAyMTA1MTInLCBmYWxzZSk7IC8vIGZ1dHVyZSBkYXRlXG5cdFx0dGVzdElzVmFsaWRWZXJzaW9uKCcxLjEwLjEnLCAnXjEuMTAuMC0yMDIwMDEwMScsIHRydWUpOyAvLyBiZWZvcmUgZGF0ZSwgYnV0IGFoZWFkIHZlcnNpb25cblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTEuMCcsICdeMS4xMC4wLTIwMjAwMTAxJywgdHJ1ZSk7XG5cblx0XHQvLyBUZXN0IHdpdGggSEhNTSBkYXRlIGZvcm1hdFxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMC4wJywgJ14xLjEwLjAtMjAyMTA1MTExNDAwJywgdHJ1ZSk7IC8vIHByb2R1Y3QgYXQgYmVnaW5uaW5nIG9mIGRheSwgcmVxdWlyZWQgdGltZSBhdCAxNDowMFxuXHRcdHRlc3RJc1ZhbGlkVmVyc2lvbignMS4xMC4wJywgJ14xLjEwLjAtMjAyMTA1MTEyMzU5JywgZmFsc2UpOyAvLyBwcm9kdWN0IGF0IGJlZ2lubmluZyBvZiBkYXksIHJlcXVpcmVkIHRpbWUgYXQgMjM6NTlcblx0XHR0ZXN0SXNWYWxpZFZlcnNpb24oJzEuMTAuMCcsICdeMS4xMC4wLTIwMjEwNTExMDAwMCcsIHRydWUpOyAvLyBwcm9kdWN0IGF0IGJlZ2lubmluZyBvZiBkYXksIHJlcXVpcmVkIHRpbWUgYXQgMDA6MDBcblx0fSk7XG5cblx0dGVzdCgnaXNWYWxpZEV4dGVuc2lvblZlcnNpb24gY2hlY2tzIGJyb3dzZXIgb25seSBleHRlbnNpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmlmZXN0ID0ge1xuXHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0cHVibGlzaGVyOiAndGVzdCcsXG5cdFx0XHR2ZXJzaW9uOiAnMC4wLjAnLFxuXHRcdFx0ZW5naW5lczoge1xuXHRcdFx0XHR2c2NvZGU6ICdeMS40NS4wJ1xuXHRcdFx0fSxcblx0XHRcdGJyb3dzZXI6ICdzb21ldGhpbmcnXG5cdFx0fTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNWYWxpZEV4dGVuc2lvblZlcnNpb24oJzEuNDQuMCcsIHVu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QixVQUFVLEtBQUssS0FBSztBQUV2Qyx1QkFBbUIsVUFBVSxTQUFTLEtBQUs7QUFDM0MsdUJBQW1CLFVBQVUsU0FBUyxLQUFLO0FBQzNDLHVCQUFtQixVQUFVLFVBQVUsS0FBSztBQUM1Qyx1QkFBbUIsVUFBVSxVQUFVLEtBQUs7QUFDNUMsdUJBQW1CLFVBQVUsV0FBVyxLQUFLO0FBQzdDLHVCQUFtQixVQUFVLFVBQVUsSUFBSTtBQUMzQyx1QkFBbUIsVUFBVSxXQUFXLElBQUk7QUFDNUMsdUJBQW1CLFVBQVUsS0FBSyxLQUFLO0FBRXZDLHVCQUFtQixZQUFZLFNBQVMsS0FBSztBQUM3Qyx1QkFBbUIsWUFBWSxTQUFTLEtBQUs7QUFDN0MsdUJBQW1CLFlBQVksVUFBVSxLQUFLO0FBQzlDLHVCQUFtQixZQUFZLFVBQVUsS0FBSztBQUM5Qyx1QkFBbUIsWUFBWSxXQUFXLElBQUk7QUFDOUMsdUJBQW1CLFlBQVksVUFBVSxJQUFJO0FBQzdDLHVCQUFtQixZQUFZLFdBQVcsSUFBSTtBQUM5Qyx1QkFBbUIsWUFBWSxLQUFLLEtBQUs7QUFFekMsdUJBQW1CLFVBQVUsU0FBUyxLQUFLO0FBQzNDLHVCQUFtQixVQUFVLFNBQVMsS0FBSztBQUMzQyx1QkFBbUIsVUFBVSxVQUFVLEtBQUs7QUFDNUMsdUJBQW1CLFVBQVUsVUFBVSxLQUFLO0FBQzVDLHVCQUFtQixVQUFVLFdBQVcsS0FBSztBQUM3Qyx1QkFBbUIsVUFBVSxVQUFVLEtBQUs7QUFDNUMsdUJBQW1CLFVBQVUsV0FBVyxLQUFLO0FBQzdDLHVCQUFtQixVQUFVLEtBQUssS0FBSztBQUV2Qyx1QkFBbUIsU0FBUyxTQUFTLEtBQUs7QUFDMUMsdUJBQW1CLFNBQVMsU0FBUyxLQUFLO0FBQzFDLHVCQUFtQixTQUFTLFVBQVUsS0FBSztBQUMzQyx1QkFBbUIsU0FBUyxVQUFVLEtBQUs7QUFDM0MsdUJBQW1CLFNBQVMsV0FBVyxJQUFJO0FBQzNDLHVCQUFtQixTQUFTLFVBQVUsSUFBSTtBQUMxQyx1QkFBbUIsU0FBUyxXQUFXLElBQUk7QUFDM0MsdUJBQW1CLFNBQVMsS0FBSyxLQUFLO0FBRXRDLHVCQUFtQixVQUFVLFNBQVMsS0FBSztBQUMzQyx1QkFBbUIsVUFBVSxTQUFTLElBQUk7QUFDMUMsdUJBQW1CLFVBQVUsVUFBVSxJQUFJO0FBQzNDLHVCQUFtQixVQUFVLFVBQVUsS0FBSztBQUM1Qyx1QkFBbUIsVUFBVSxXQUFXLEtBQUs7QUFDN0MsdUJBQW1CLFVBQVUsVUFBVSxJQUFJO0FBQzNDLHVCQUFtQixVQUFVLFdBQVcsSUFBSTtBQUM1Qyx1QkFBbUIsVUFBVSxLQUFLLEtBQUs7QUFLdkMsdUJBQW1CLFNBQVMsU0FBUyxLQUFLO0FBQzFDLHVCQUFtQixTQUFTLFNBQVMsS0FBSztBQUMxQyx1QkFBbUIsU0FBUyxVQUFVLEtBQUs7QUFDM0MsdUJBQW1CLFNBQVMsVUFBVSxLQUFLO0FBQzNDLHVCQUFtQixTQUFTLFdBQVcsSUFBSTtBQUMzQyx1QkFBbUIsU0FBUyxVQUFVLElBQUk7QUFDMUMsdUJBQW1CLFNBQVMsV0FBVyxJQUFJO0FBQzNDLHVCQUFtQixTQUFTLFNBQVMsSUFBSTtBQUN6Qyx1QkFBbUIsU0FBUyxVQUFVLElBQUk7QUFDMUMsdUJBQW1CLFNBQVMsVUFBVSxLQUFLO0FBQzNDLHVCQUFtQixTQUFTLEtBQUssS0FBSztBQUV0Qyx1QkFBbUIsV0FBVyxTQUFTLEtBQUs7QUFDNUMsdUJBQW1CLFdBQVcsU0FBUyxLQUFLO0FBQzVDLHVCQUFtQixXQUFXLFVBQVUsS0FBSztBQUM3Qyx1QkFBbUIsV0FBVyxVQUFVLEtBQUs7QUFDN0MsdUJBQW1CLFdBQVcsV0FBVyxJQUFJO0FBQzdDLHVCQUFtQixXQUFXLFVBQVUsSUFBSTtBQUM1Qyx1QkFBbUIsV0FBVyxXQUFXLElBQUk7QUFDN0MsdUJBQW1CLFdBQVcsU0FBUyxLQUFLO0FBQzVDLHVCQUFtQixXQUFXLFVBQVUsSUFBSTtBQUM1Qyx1QkFBbUIsV0FBVyxVQUFVLElBQUk7QUFDNUMsdUJBQW1CLFdBQVcsVUFBVSxLQUFLO0FBQzdDLHVCQUFtQixXQUFXLEtBQUssS0FBSztBQUV4Qyx1QkFBbUIsV0FBVyxTQUFTLEtBQUs7QUFDNUMsdUJBQW1CLFdBQVcsU0FBUyxLQUFLO0FBQzVDLHVCQUFtQixXQUFXLFVBQVUsS0FBSztBQUM3Qyx1QkFBbUIsV0FBVyxVQUFVLEtBQUs7QUFDN0MsdUJBQW1CLFdBQVcsV0FBVyxJQUFJO0FBQzdDLHVCQUFtQixXQUFXLFVBQVUsSUFBSTtBQUM1Qyx1QkFBbUIsV0FBVyxXQUFXLElBQUk7QUFDN0MsdUJBQW1CLFdBQVcsU0FBUyxLQUFLO0FBQzVDLHVCQUFtQixXQUFXLFVBQVUsSUFBSTtBQUM1Qyx1QkFBbUIsV0FBVyxVQUFVLElBQUk7QUFDNUMsdUJBQW1CLFdBQVcsWUFBWSxJQUFJO0FBQzlDLHVCQUFtQixXQUFXLFVBQVUsS0FBSztBQUM3Qyx1QkFBbUIsV0FBVyxLQUFLLEtBQUs7QUFFeEMsdUJBQW1CLFNBQVMsU0FBUyxLQUFLO0FBQzFDLHVCQUFtQixTQUFTLFNBQVMsS0FBSztBQUMxQyx1QkFBbUIsU0FBUyxVQUFVLEtBQUs7QUFDM0MsdUJBQW1CLFNBQVMsVUFBVSxLQUFLO0FBQzNDLHVCQUFtQixTQUFTLFdBQVcsS0FBSztBQUM1Qyx1QkFBbUIsU0FBUyxVQUFVLEtBQUs7QUFDM0MsdUJBQW1CLFNBQVMsV0FBVyxLQUFLO0FBQzVDLHVCQUFtQixTQUFTLFNBQVMsS0FBSztBQUMxQyx1QkFBbUIsU0FBUyxVQUFVLEtBQUs7QUFDM0MsdUJBQW1CLFNBQVMsVUFBVSxLQUFLO0FBQzNDLHVCQUFtQixTQUFTLFlBQVksS0FBSztBQUM3Qyx1QkFBbUIsU0FBUyxVQUFVLElBQUk7QUFDMUMsdUJBQW1CLFNBQVMsS0FBSyxLQUFLO0FBR3RDLHVCQUFtQixVQUFVLG9CQUFvQixJQUFJO0FBQ3JELHVCQUFtQixVQUFVLG9CQUFvQixJQUFJO0FBQ3JELHVCQUFtQixVQUFVLG9CQUFvQixLQUFLO0FBQ3RELHVCQUFtQixVQUFVLG9CQUFvQixJQUFJO0FBQ3JELHVCQUFtQixVQUFVLG9CQUFvQixJQUFJO0FBR3JELHVCQUFtQixVQUFVLHdCQUF3QixJQUFJO0FBQ3pELHVCQUFtQixVQUFVLHdCQUF3QixLQUFLO0FBQzFELHVCQUFtQixVQUFVLHdCQUF3QixJQUFJO0FBQUEsRUFDMUQsQ0FBQztBQUVELE9BQUssMERBQTBELE1BQU07QUFDcEUsVUFBTSxXQUFXO0FBQUEsTUFDaEIsTUFBTTtBQUFBLE1BQ04sV0FBVztBQUFBLE1BQ1gsU0FBUztBQUFBLE1BQ1QsU0FBUztBQUFBLFFBQ1IsUUFBUTtBQUFBLE1BQ1Q7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNWO0FBQ0EsV0FBTyxZQUFZLHdCQUF3QixVQUFVLFFBQVcsVUFBVSxPQUFPLENBQUMsQ0FBQyxHQUFHLEtBQUs7QUFBQSxFQUM1RixDQUFDO0FBRUYsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
