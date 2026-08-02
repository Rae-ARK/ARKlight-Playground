import assert from "assert";
import { isLinux, isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ContextKeyExpr, implies } from "../../common/contextkey.js";
function createContext(ctx) {
  return {
    getValue: (key) => {
      return ctx[key];
    }
  };
}
suite("ContextKeyExpr", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("ContextKeyExpr.equals", () => {
    const a = ContextKeyExpr.and(
      ContextKeyExpr.has("a1"),
      ContextKeyExpr.and(ContextKeyExpr.has("and.a")),
      ContextKeyExpr.has("a2"),
      ContextKeyExpr.regex("d3", /d.*/),
      ContextKeyExpr.regex("d4", /\*\*3*/),
      ContextKeyExpr.equals("b1", "bb1"),
      ContextKeyExpr.equals("b2", "bb2"),
      ContextKeyExpr.notEquals("c1", "cc1"),
      ContextKeyExpr.notEquals("c2", "cc2"),
      ContextKeyExpr.not("d1"),
      ContextKeyExpr.not("d2")
    );
    const b = ContextKeyExpr.and(
      ContextKeyExpr.equals("b2", "bb2"),
      ContextKeyExpr.notEquals("c1", "cc1"),
      ContextKeyExpr.not("d1"),
      ContextKeyExpr.regex("d4", /\*\*3*/),
      ContextKeyExpr.notEquals("c2", "cc2"),
      ContextKeyExpr.has("a2"),
      ContextKeyExpr.equals("b1", "bb1"),
      ContextKeyExpr.regex("d3", /d.*/),
      ContextKeyExpr.has("a1"),
      ContextKeyExpr.and(ContextKeyExpr.equals("and.a", true)),
      ContextKeyExpr.not("d2")
    );
    assert(a.equals(b), "expressions should be equal");
  });
  test("issue #134942: Equals in comparator expressions", () => {
    function testEquals(expr, str) {
      const deserialized = ContextKeyExpr.deserialize(str);
      assert.ok(expr);
      assert.ok(deserialized);
      assert.strictEqual(expr.equals(deserialized), true, str);
    }
    testEquals(ContextKeyExpr.greater("value", 0), "value > 0");
    testEquals(ContextKeyExpr.greaterEquals("value", 0), "value >= 0");
    testEquals(ContextKeyExpr.smaller("value", 0), "value < 0");
    testEquals(ContextKeyExpr.smallerEquals("value", 0), "value <= 0");
  });
  test("normalize", () => {
    const key1IsTrue = ContextKeyExpr.equals("key1", true);
    const key1IsNotFalse = ContextKeyExpr.notEquals("key1", false);
    const key1IsFalse = ContextKeyExpr.equals("key1", false);
    const key1IsNotTrue = ContextKeyExpr.notEquals("key1", true);
    assert.ok(key1IsTrue.equals(ContextKeyExpr.has("key1")));
    assert.ok(key1IsNotFalse.equals(ContextKeyExpr.has("key1")));
    assert.ok(key1IsFalse.equals(ContextKeyExpr.not("key1")));
    assert.ok(key1IsNotTrue.equals(ContextKeyExpr.not("key1")));
  });
  test("evaluate", () => {
    const context = createContext({
      "a": true,
      "b": false,
      "c": "5",
      "d": "d"
    });
    function testExpression(expr, expected) {
      const rules = ContextKeyExpr.deserialize(expr);
      assert.strictEqual(rules.evaluate(context), expected, expr);
    }
    function testBatch(expr, value) {
      testExpression(expr, !!value);
      testExpression(expr + " == true", !!value);
      testExpression(expr + " != true", !value);
      testExpression(expr + " == false", !value);
      testExpression(expr + " != false", !!value);
      testExpression(expr + " == 5", value == "5");
      testExpression(expr + " != 5", value != "5");
      testExpression("!" + expr, !value);
      testExpression(expr + " =~ /d.*/", /d.*/.test(value));
      testExpression(expr + " =~ /D/i", /D/i.test(value));
    }
    testBatch("a", true);
    testBatch("b", false);
    testBatch("c", "5");
    testBatch("d", "d");
    testBatch("z", void 0);
    testExpression("true", true);
    testExpression("false", false);
    testExpression("a && !b", true);
    testExpression("a && b", false);
    testExpression("a && !b && c == 5", true);
    testExpression("d =~ /e.*/", false);
    testExpression("b && a || a", true);
    testExpression("a || b", true);
    testExpression("b || b", false);
    testExpression("b && a || a && b", false);
  });
  test("negate", () => {
    function testNegate(expr, expected) {
      const actual = ContextKeyExpr.deserialize(expr).negate().serialize();
      assert.strictEqual(actual, expected);
    }
    testNegate("true", "false");
    testNegate("false", "true");
    testNegate("a", "!a");
    testNegate("a && b || c", "!a && !c || !b && !c");
    testNegate("a && b || c || d", "!a && !c && !d || !b && !c && !d");
    testNegate("!a && !b || !c && !d", "a && c || a && d || b && c || b && d");
    testNegate("!a && !b || !c && !d || !e && !f", "a && c && e || a && c && f || a && d && e || a && d && f || b && c && e || b && c && f || b && d && e || b && d && f");
  });
  test("false, true", () => {
    function testNormalize(expr, expected) {
      const actual = ContextKeyExpr.deserialize(expr).serialize();
      assert.strictEqual(actual, expected);
    }
    testNormalize("true", "true");
    testNormalize("!true", "false");
    testNormalize("false", "false");
    testNormalize("!false", "true");
    testNormalize("a && true", "a");
    testNormalize("a && false", "false");
    testNormalize("a || true", "true");
    testNormalize("a || false", "a");
    testNormalize("isMac", isMacintosh ? "true" : "false");
    testNormalize("isLinux", isLinux ? "true" : "false");
    testNormalize("isWindows", isWindows ? "true" : "false");
  });
  test("issue #101015: distribute OR", () => {
    function t(expr1, expr2, expected) {
      const e1 = ContextKeyExpr.deserialize(expr1);
      const e2 = ContextKeyExpr.deserialize(expr2);
      const actual = ContextKeyExpr.and(e1, e2)?.serialize();
      assert.strictEqual(actual, expected);
    }
    t("a", "b", "a && b");
    t("a || b", "c", "a && c || b && c");
    t("a || b", "c || d", "a && c || a && d || b && c || b && d");
    t("a || b", "c && d", "a && c && d || b && c && d");
    t("a || b", "c && d || e", "a && e || b && e || a && c && d || b && c && d");
  });
  test("ContextKeyInExpr", () => {
    const ainb = ContextKeyExpr.deserialize("a in b");
    assert.strictEqual(ainb.evaluate(createContext({ "a": 3, "b": [3, 2, 1] })), true);
    assert.strictEqual(ainb.evaluate(createContext({ "a": 3, "b": [1, 2, 3] })), true);
    assert.strictEqual(ainb.evaluate(createContext({ "a": 3, "b": [1, 2] })), false);
    assert.strictEqual(ainb.evaluate(createContext({ "a": 3 })), false);
    assert.strictEqual(ainb.evaluate(createContext({ "a": 3, "b": null })), false);
    assert.strictEqual(ainb.evaluate(createContext({ "a": "x", "b": ["x"] })), true);
    assert.strictEqual(ainb.evaluate(createContext({ "a": "x", "b": ["y"] })), false);
    assert.strictEqual(ainb.evaluate(createContext({ "a": "x", "b": {} })), false);
    assert.strictEqual(ainb.evaluate(createContext({ "a": "x", "b": { "x": false } })), true);
    assert.strictEqual(ainb.evaluate(createContext({ "a": "x", "b": { "x": true } })), true);
    assert.strictEqual(ainb.evaluate(createContext({ "a": "prototype", "b": {} })), false);
    if (isWindows) {
      assert.strictEqual(ainb.evaluate(createContext({ "a": "file:///c%3A/Users/path/file.ts", "b": ["file:///c%3A/users/path/file.ts"] })), true);
      assert.strictEqual(ainb.evaluate(createContext({ "a": "file:///c%3A/users/path/file.ts", "b": ["file:///c%3A/Users/path/file.ts"] })), true);
      assert.strictEqual(ainb.evaluate(createContext({ "a": "file:///c%3A/Users/path/file.ts", "b": { "file:///c%3A/users/path/file.ts": true } })), true);
      assert.strictEqual(ainb.evaluate(createContext({ "a": "git:/path/File.ts", "b": ["git:/path/file.ts"] })), false);
      assert.strictEqual(ainb.evaluate(createContext({ "a": "file:///c%3A/Users/path/file.ts", "b": ["file:///c%3A/Users/path/file.ts"] })), true);
    }
  });
  test("ContextKeyNotInExpr", () => {
    const aNotInB = ContextKeyExpr.deserialize("a not in b");
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": 3, "b": [3, 2, 1] })), false);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": 3, "b": [1, 2, 3] })), false);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": 3, "b": [1, 2] })), true);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": 3 })), true);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": 3, "b": null })), true);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": "x", "b": ["x"] })), false);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": "x", "b": ["y"] })), true);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": "x", "b": {} })), true);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": "x", "b": { "x": false } })), false);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": "x", "b": { "x": true } })), false);
    assert.strictEqual(aNotInB.evaluate(createContext({ "a": "prototype", "b": {} })), true);
    if (isWindows) {
      assert.strictEqual(aNotInB.evaluate(createContext({ "a": "file:///c%3A/Users/path/file.ts", "b": ["file:///c%3A/users/path/file.ts"] })), false);
      assert.strictEqual(aNotInB.evaluate(createContext({ "a": "file:///c%3A/users/path/file.ts", "b": ["file:///c%3A/Users/path/file.ts"] })), false);
      assert.strictEqual(aNotInB.evaluate(createContext({ "a": "git:/path/File.ts", "b": ["git:/path/file.ts"] })), true);
    }
  });
  test("issue #106524: distributing AND should normalize", () => {
    const actual = ContextKeyExpr.and(
      ContextKeyExpr.or(
        ContextKeyExpr.has("a"),
        ContextKeyExpr.has("b")
      ),
      ContextKeyExpr.has("c")
    );
    const expected = ContextKeyExpr.or(
      ContextKeyExpr.and(
        ContextKeyExpr.has("a"),
        ContextKeyExpr.has("c")
      ),
      ContextKeyExpr.and(
        ContextKeyExpr.has("b"),
        ContextKeyExpr.has("c")
      )
    );
    assert.strictEqual(actual.equals(expected), true);
  });
  test("issue #129625: Removes duplicated terms in OR expressions", () => {
    const expr = ContextKeyExpr.or(
      ContextKeyExpr.has("A"),
      ContextKeyExpr.has("B"),
      ContextKeyExpr.has("A")
    );
    assert.strictEqual(expr.serialize(), "A || B");
  });
  test("Resolves true constant OR expressions", () => {
    const expr = ContextKeyExpr.or(
      ContextKeyExpr.has("A"),
      ContextKeyExpr.not("A")
    );
    assert.strictEqual(expr.serialize(), "true");
  });
  test("Resolves false constant AND expressions", () => {
    const expr = ContextKeyExpr.and(
      ContextKeyExpr.has("A"),
      ContextKeyExpr.not("A")
    );
    assert.strictEqual(expr.serialize(), "false");
  });
  test("issue #129625: Removes duplicated terms in AND expressions", () => {
    const expr = ContextKeyExpr.and(
      ContextKeyExpr.has("A"),
      ContextKeyExpr.has("B"),
      ContextKeyExpr.has("A")
    );
    assert.strictEqual(expr.serialize(), "A && B");
  });
  test("issue #129625: Remove duplicated terms when negating", () => {
    const expr = ContextKeyExpr.and(
      ContextKeyExpr.has("A"),
      ContextKeyExpr.or(
        ContextKeyExpr.has("B1"),
        ContextKeyExpr.has("B2")
      )
    );
    assert.strictEqual(expr.serialize(), "A && B1 || A && B2");
    assert.strictEqual(expr.negate().serialize(), "!A || !A && !B1 || !A && !B2 || !B1 && !B2");
    assert.strictEqual(expr.negate().negate().serialize(), "A && B1 || A && B2");
    assert.strictEqual(expr.negate().negate().negate().serialize(), "!A || !A && !B1 || !A && !B2 || !B1 && !B2");
  });
  test("issue #129625: remove redundant terms in OR expressions", () => {
    function strImplies(p0, q0) {
      const p = ContextKeyExpr.deserialize(p0);
      const q = ContextKeyExpr.deserialize(q0);
      return implies(p, q);
    }
    assert.strictEqual(strImplies("a && b", "a"), true);
    assert.strictEqual(strImplies("a", "a && b"), false);
  });
  test("implies", () => {
    function strImplies(p0, q0) {
      const p = ContextKeyExpr.deserialize(p0);
      const q = ContextKeyExpr.deserialize(q0);
      return implies(p, q);
    }
    assert.strictEqual(strImplies("a", "a"), true);
    assert.strictEqual(strImplies("a", "a || b"), true);
    assert.strictEqual(strImplies("a", "a && b"), false);
    assert.strictEqual(strImplies("a", "a && b || a && c"), false);
    assert.strictEqual(strImplies("a && b", "a"), true);
    assert.strictEqual(strImplies("a && b", "b"), true);
    assert.strictEqual(strImplies("a && b", "a && b || c"), true);
    assert.strictEqual(strImplies("a || b", "a || c"), false);
    assert.strictEqual(strImplies("a || b", "a || b"), true);
    assert.strictEqual(strImplies("a && b", "a && b"), true);
    assert.strictEqual(strImplies("a || b", "a || b || c"), true);
    assert.strictEqual(strImplies("c && a && b", "c && a"), true);
  });
  test("Greater, GreaterEquals, Smaller, SmallerEquals evaluate", () => {
    function checkEvaluate(expr, ctx, expected) {
      const _expr = ContextKeyExpr.deserialize(expr);
      assert.strictEqual(_expr.evaluate(createContext(ctx)), expected);
    }
    checkEvaluate("a > 1", {}, false);
    checkEvaluate("a > 1", { a: 0 }, false);
    checkEvaluate("a > 1", { a: 1 }, false);
    checkEvaluate("a > 1", { a: 2 }, true);
    checkEvaluate("a > 1", { a: "0" }, false);
    checkEvaluate("a > 1", { a: "1" }, false);
    checkEvaluate("a > 1", { a: "2" }, true);
    checkEvaluate("a > 1", { a: "a" }, false);
    checkEvaluate("a > 10", { a: 2 }, false);
    checkEvaluate("a > 10", { a: 11 }, true);
    checkEvaluate("a > 10", { a: "11" }, true);
    checkEvaluate("a > 10", { a: "2" }, false);
    checkEvaluate("a > 10", { a: "11" }, true);
    checkEvaluate("a > 1.1", { a: 1 }, false);
    checkEvaluate("a > 1.1", { a: 2 }, true);
    checkEvaluate("a > 1.1", { a: 11 }, true);
    checkEvaluate("a > 1.1", { a: "1.1" }, false);
    checkEvaluate("a > 1.1", { a: "2" }, true);
    checkEvaluate("a > 1.1", { a: "11" }, true);
    checkEvaluate("a > b", { a: "b" }, false);
    checkEvaluate("a > b", { a: "c" }, false);
    checkEvaluate("a > b", { a: 1e3 }, false);
    checkEvaluate("a >= 2", { a: "1" }, false);
    checkEvaluate("a >= 2", { a: "2" }, true);
    checkEvaluate("a >= 2", { a: "3" }, true);
    checkEvaluate("a < 2", { a: "1" }, true);
    checkEvaluate("a < 2", { a: "2" }, false);
    checkEvaluate("a < 2", { a: "3" }, false);
    checkEvaluate("a <= 2", { a: "1" }, true);
    checkEvaluate("a <= 2", { a: "2" }, true);
    checkEvaluate("a <= 2", { a: "3" }, false);
  });
  test("Greater, GreaterEquals, Smaller, SmallerEquals negate", () => {
    function checkNegate(expr, expected) {
      const a = ContextKeyExpr.deserialize(expr);
      const b = a.negate();
      assert.strictEqual(b.serialize(), expected);
    }
    checkNegate("a > 1", "a <= 1");
    checkNegate("a > 1.1", "a <= 1.1");
    checkNegate("a > b", "a <= b");
    checkNegate("a >= 1", "a < 1");
    checkNegate("a >= 1.1", "a < 1.1");
    checkNegate("a >= b", "a < b");
    checkNegate("a < 1", "a >= 1");
    checkNegate("a < 1.1", "a >= 1.1");
    checkNegate("a < b", "a >= b");
    checkNegate("a <= 1", "a > 1");
    checkNegate("a <= 1.1", "a > 1.1");
    checkNegate("a <= b", "a > b");
  });
  test("issue #111899: context keys can use `<` or `>` ", () => {
    const actual = ContextKeyExpr.deserialize("editorTextFocus && vim.active && vim.use<C-r>");
    assert.ok(actual.equals(
      ContextKeyExpr.and(
        ContextKeyExpr.has("editorTextFocus"),
        ContextKeyExpr.has("vim.active"),
        ContextKeyExpr.has("vim.use<C-r>")
      )
    ));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2NvbnRleHRrZXkvdGVzdC9jb21tb24vY29udGV4dGtleS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGlzTGludXgsIGlzTWFjaW50b3NoLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBDb250ZXh0S2V5RXhwcmVzc2lvbiwgaW1wbGllcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5LmpzJztcblxuZnVuY3Rpb24gY3JlYXRlQ29udGV4dChjdHg6IGFueSkge1xuXHRyZXR1cm4ge1xuXHRcdGdldFZhbHVlOiAoa2V5OiBzdHJpbmcpID0+IHtcblx0XHRcdHJldHVybiBjdHhba2V5XTtcblx0XHR9XG5cdH07XG59XG5cbnN1aXRlKCdDb250ZXh0S2V5RXhwcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdDb250ZXh0S2V5RXhwci5lcXVhbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYSA9IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnYTEnKSxcblx0XHRcdENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5oYXMoJ2FuZC5hJykpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdhMicpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIucmVnZXgoJ2QzJywgL2QuKi8pLFxuXHRcdFx0Q29udGV4dEtleUV4cHIucmVnZXgoJ2Q0JywgL1xcKlxcKjMqLyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2IxJywgJ2JiMScpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdiMicsICdiYjInKSxcblx0XHRcdENvbnRleHRLZXlFeHByLm5vdEVxdWFscygnYzEnLCAnY2MxJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ2MyJywgJ2NjMicpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIubm90KCdkMScpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIubm90KCdkMicpXG5cdFx0KSE7XG5cdFx0Y29uc3QgYiA9IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnYjInLCAnYmIyJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ2MxJywgJ2NjMScpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIubm90KCdkMScpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIucmVnZXgoJ2Q0JywgL1xcKlxcKjMqLyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ2MyJywgJ2NjMicpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdhMicpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdiMScsICdiYjEnKSxcblx0XHRcdENvbnRleHRLZXlFeHByLnJlZ2V4KCdkMycsIC9kLiovKSxcblx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnYTEnKSxcblx0XHRcdENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2FuZC5hJywgdHJ1ZSkpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIubm90KCdkMicpXG5cdFx0KSE7XG5cdFx0YXNzZXJ0KGEuZXF1YWxzKGIpLCAnZXhwcmVzc2lvbnMgc2hvdWxkIGJlIGVxdWFsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMzQ5NDI6IEVxdWFscyBpbiBjb21wYXJhdG9yIGV4cHJlc3Npb25zJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIHRlc3RFcXVhbHMoZXhwcjogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQsIHN0cjogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRjb25zdCBkZXNlcmlhbGl6ZWQgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShzdHIpO1xuXHRcdFx0YXNzZXJ0Lm9rKGV4cHIpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRlc2VyaWFsaXplZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhwci5lcXVhbHMoZGVzZXJpYWxpemVkKSwgdHJ1ZSwgc3RyKTtcblx0XHR9XG5cdFx0dGVzdEVxdWFscyhDb250ZXh0S2V5RXhwci5ncmVhdGVyKCd2YWx1ZScsIDApLCAndmFsdWUgPiAwJyk7XG5cdFx0dGVzdEVxdWFscyhDb250ZXh0S2V5RXhwci5ncmVhdGVyRXF1YWxzKCd2YWx1ZScsIDApLCAndmFsdWUgPj0gMCcpO1xuXHRcdHRlc3RFcXVhbHMoQ29udGV4dEtleUV4cHIuc21hbGxlcigndmFsdWUnLCAwKSwgJ3ZhbHVlIDwgMCcpO1xuXHRcdHRlc3RFcXVhbHMoQ29udGV4dEtleUV4cHIuc21hbGxlckVxdWFscygndmFsdWUnLCAwKSwgJ3ZhbHVlIDw9IDAnKTtcblx0fSk7XG5cblx0dGVzdCgnbm9ybWFsaXplJywgKCkgPT4ge1xuXHRcdGNvbnN0IGtleTFJc1RydWUgPSBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2tleTEnLCB0cnVlKTtcblx0XHRjb25zdCBrZXkxSXNOb3RGYWxzZSA9IENvbnRleHRLZXlFeHByLm5vdEVxdWFscygna2V5MScsIGZhbHNlKTtcblx0XHRjb25zdCBrZXkxSXNGYWxzZSA9IENvbnRleHRLZXlFeHByLmVxdWFscygna2V5MScsIGZhbHNlKTtcblx0XHRjb25zdCBrZXkxSXNOb3RUcnVlID0gQ29udGV4dEtleUV4cHIubm90RXF1YWxzKCdrZXkxJywgdHJ1ZSk7XG5cblx0XHRhc3NlcnQub2soa2V5MUlzVHJ1ZS5lcXVhbHMoQ29udGV4dEtleUV4cHIuaGFzKCdrZXkxJykpKTtcblx0XHRhc3NlcnQub2soa2V5MUlzTm90RmFsc2UuZXF1YWxzKENvbnRleHRLZXlFeHByLmhhcygna2V5MScpKSk7XG5cdFx0YXNzZXJ0Lm9rKGtleTFJc0ZhbHNlLmVxdWFscyhDb250ZXh0S2V5RXhwci5ub3QoJ2tleTEnKSkpO1xuXHRcdGFzc2VydC5vayhrZXkxSXNOb3RUcnVlLmVxdWFscyhDb250ZXh0S2V5RXhwci5ub3QoJ2tleTEnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdldmFsdWF0ZScsICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlQ29udGV4dCh7XG5cdFx0XHQnYSc6IHRydWUsXG5cdFx0XHQnYic6IGZhbHNlLFxuXHRcdFx0J2MnOiAnNScsXG5cdFx0XHQnZCc6ICdkJ1xuXHRcdH0pO1xuXHRcdGZ1bmN0aW9uIHRlc3RFeHByZXNzaW9uKGV4cHI6IHN0cmluZywgZXhwZWN0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdC8vIGNvbnNvbGUubG9nKGV4cHIgKyAnICcgKyBleHBlY3RlZCk7XG5cdFx0XHRjb25zdCBydWxlcyA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGV4cHIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bGVzIS5ldmFsdWF0ZShjb250ZXh0KSwgZXhwZWN0ZWQsIGV4cHIpO1xuXHRcdH1cblx0XHRmdW5jdGlvbiB0ZXN0QmF0Y2goZXhwcjogc3RyaW5nLCB2YWx1ZTogYW55KTogdm9pZCB7XG5cdFx0XHQvKiBlc2xpbnQtZGlzYWJsZSBlcWVxZXEgKi9cblx0XHRcdHRlc3RFeHByZXNzaW9uKGV4cHIsICEhdmFsdWUpO1xuXHRcdFx0dGVzdEV4cHJlc3Npb24oZXhwciArICcgPT0gdHJ1ZScsICEhdmFsdWUpO1xuXHRcdFx0dGVzdEV4cHJlc3Npb24oZXhwciArICcgIT0gdHJ1ZScsICF2YWx1ZSk7XG5cdFx0XHR0ZXN0RXhwcmVzc2lvbihleHByICsgJyA9PSBmYWxzZScsICF2YWx1ZSk7XG5cdFx0XHR0ZXN0RXhwcmVzc2lvbihleHByICsgJyAhPSBmYWxzZScsICEhdmFsdWUpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHR0ZXN0RXhwcmVzc2lvbihleHByICsgJyA9PSA1JywgdmFsdWUgPT0gPGFueT4nNScpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHR0ZXN0RXhwcmVzc2lvbihleHByICsgJyAhPSA1JywgdmFsdWUgIT0gPGFueT4nNScpO1xuXHRcdFx0dGVzdEV4cHJlc3Npb24oJyEnICsgZXhwciwgIXZhbHVlKTtcblx0XHRcdHRlc3RFeHByZXNzaW9uKGV4cHIgKyAnID1+IC9kLiovJywgL2QuKi8udGVzdCh2YWx1ZSkpO1xuXHRcdFx0dGVzdEV4cHJlc3Npb24oZXhwciArICcgPX4gL0QvaScsIC9EL2kudGVzdCh2YWx1ZSkpO1xuXHRcdFx0LyogZXNsaW50LWVuYWJsZSBlcWVxZXEgKi9cblx0XHR9XG5cblx0XHR0ZXN0QmF0Y2goJ2EnLCB0cnVlKTtcblx0XHR0ZXN0QmF0Y2goJ2InLCBmYWxzZSk7XG5cdFx0dGVzdEJhdGNoKCdjJywgJzUnKTtcblx0XHR0ZXN0QmF0Y2goJ2QnLCAnZCcpO1xuXHRcdHRlc3RCYXRjaCgneicsIHVuZGVmaW5lZCk7XG5cblx0XHR0ZXN0RXhwcmVzc2lvbigndHJ1ZScsIHRydWUpO1xuXHRcdHRlc3RFeHByZXNzaW9uKCdmYWxzZScsIGZhbHNlKTtcblx0XHR0ZXN0RXhwcmVzc2lvbignYSAmJiAhYicsIHRydWUgJiYgIWZhbHNlKTtcblx0XHR0ZXN0RXhwcmVzc2lvbignYSAmJiBiJywgdHJ1ZSAmJiBmYWxzZSk7XG5cdFx0dGVzdEV4cHJlc3Npb24oJ2EgJiYgIWIgJiYgYyA9PSA1JywgdHJ1ZSAmJiAhZmFsc2UgJiYgJzUnID09PSAnNScpO1xuXHRcdHRlc3RFeHByZXNzaW9uKCdkID1+IC9lLiovJywgZmFsc2UpO1xuXG5cdFx0Ly8gcHJlY2VkZW5jZSB0ZXN0OiBmYWxzZSAmJiB0cnVlIHx8IHRydWUgPT09IHRydWUgYmVjYXVzZSAmJiBpcyBldmFsdWF0ZWQgZmlyc3Rcblx0XHR0ZXN0RXhwcmVzc2lvbignYiAmJiBhIHx8IGEnLCB0cnVlKTtcblxuXHRcdHRlc3RFeHByZXNzaW9uKCdhIHx8IGInLCB0cnVlKTtcblx0XHR0ZXN0RXhwcmVzc2lvbignYiB8fCBiJywgZmFsc2UpO1xuXHRcdHRlc3RFeHByZXNzaW9uKCdiICYmIGEgfHwgYSAmJiBiJywgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCduZWdhdGUnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gdGVzdE5lZ2F0ZShleHByOiBzdHJpbmcsIGV4cGVjdGVkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGV4cHIpIS5uZWdhdGUoKS5zZXJpYWxpemUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0XHR9XG5cdFx0dGVzdE5lZ2F0ZSgndHJ1ZScsICdmYWxzZScpO1xuXHRcdHRlc3ROZWdhdGUoJ2ZhbHNlJywgJ3RydWUnKTtcblx0XHR0ZXN0TmVnYXRlKCdhJywgJyFhJyk7XG5cdFx0dGVzdE5lZ2F0ZSgnYSAmJiBiIHx8IGMnLCAnIWEgJiYgIWMgfHwgIWIgJiYgIWMnKTtcblx0XHR0ZXN0TmVnYXRlKCdhICYmIGIgfHwgYyB8fCBkJywgJyFhICYmICFjICYmICFkIHx8ICFiICYmICFjICYmICFkJyk7XG5cdFx0dGVzdE5lZ2F0ZSgnIWEgJiYgIWIgfHwgIWMgJiYgIWQnLCAnYSAmJiBjIHx8IGEgJiYgZCB8fCBiICYmIGMgfHwgYiAmJiBkJyk7XG5cdFx0dGVzdE5lZ2F0ZSgnIWEgJiYgIWIgfHwgIWMgJiYgIWQgfHwgIWUgJiYgIWYnLCAnYSAmJiBjICYmIGUgfHwgYSAmJiBjICYmIGYgfHwgYSAmJiBkICYmIGUgfHwgYSAmJiBkICYmIGYgfHwgYiAmJiBjICYmIGUgfHwgYiAmJiBjICYmIGYgfHwgYiAmJiBkICYmIGUgfHwgYiAmJiBkICYmIGYnKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsc2UsIHRydWUnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gdGVzdE5vcm1hbGl6ZShleHByOiBzdHJpbmcsIGV4cGVjdGVkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGV4cHIpIS5zZXJpYWxpemUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0XHR9XG5cdFx0dGVzdE5vcm1hbGl6ZSgndHJ1ZScsICd0cnVlJyk7XG5cdFx0dGVzdE5vcm1hbGl6ZSgnIXRydWUnLCAnZmFsc2UnKTtcblx0XHR0ZXN0Tm9ybWFsaXplKCdmYWxzZScsICdmYWxzZScpO1xuXHRcdHRlc3ROb3JtYWxpemUoJyFmYWxzZScsICd0cnVlJyk7XG5cdFx0dGVzdE5vcm1hbGl6ZSgnYSAmJiB0cnVlJywgJ2EnKTtcblx0XHR0ZXN0Tm9ybWFsaXplKCdhICYmIGZhbHNlJywgJ2ZhbHNlJyk7XG5cdFx0dGVzdE5vcm1hbGl6ZSgnYSB8fCB0cnVlJywgJ3RydWUnKTtcblx0XHR0ZXN0Tm9ybWFsaXplKCdhIHx8IGZhbHNlJywgJ2EnKTtcblx0XHR0ZXN0Tm9ybWFsaXplKCdpc01hYycsIGlzTWFjaW50b3NoID8gJ3RydWUnIDogJ2ZhbHNlJyk7XG5cdFx0dGVzdE5vcm1hbGl6ZSgnaXNMaW51eCcsIGlzTGludXggPyAndHJ1ZScgOiAnZmFsc2UnKTtcblx0XHR0ZXN0Tm9ybWFsaXplKCdpc1dpbmRvd3MnLCBpc1dpbmRvd3MgPyAndHJ1ZScgOiAnZmFsc2UnKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEwMTAxNTogZGlzdHJpYnV0ZSBPUicsICgpID0+IHtcblx0XHRmdW5jdGlvbiB0KGV4cHIxOiBzdHJpbmcsIGV4cHIyOiBzdHJpbmcsIGV4cGVjdGVkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRcdGNvbnN0IGUxID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoZXhwcjEpO1xuXHRcdFx0Y29uc3QgZTIgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShleHByMik7XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBDb250ZXh0S2V5RXhwci5hbmQoZTEsIGUyKT8uc2VyaWFsaXplKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdFx0fVxuXHRcdHQoJ2EnLCAnYicsICdhICYmIGInKTtcblx0XHR0KCdhIHx8IGInLCAnYycsICdhICYmIGMgfHwgYiAmJiBjJyk7XG5cdFx0dCgnYSB8fCBiJywgJ2MgfHwgZCcsICdhICYmIGMgfHwgYSAmJiBkIHx8IGIgJiYgYyB8fCBiICYmIGQnKTtcblx0XHR0KCdhIHx8IGInLCAnYyAmJiBkJywgJ2EgJiYgYyAmJiBkIHx8IGIgJiYgYyAmJiBkJyk7XG5cdFx0dCgnYSB8fCBiJywgJ2MgJiYgZCB8fCBlJywgJ2EgJiYgZSB8fCBiICYmIGUgfHwgYSAmJiBjICYmIGQgfHwgYiAmJiBjICYmIGQnKTtcblx0fSk7XG5cblx0dGVzdCgnQ29udGV4dEtleUluRXhwcicsICgpID0+IHtcblx0XHRjb25zdCBhaW5iID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoJ2EgaW4gYicpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWluYi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAzLCAnYic6IFszLCAyLCAxXSB9KSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhaW5iLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6IDMsICdiJzogWzEsIDIsIDNdIH0pKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFpbmIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogMywgJ2InOiBbMSwgMl0gfSkpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFpbmIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogMyB9KSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWluYi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAzLCAnYic6IG51bGwgfSkpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFpbmIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogJ3gnLCAnYic6IFsneCddIH0pKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFpbmIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogJ3gnLCAnYic6IFsneSddIH0pKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhaW5iLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6ICd4JywgJ2InOiB7fSB9KSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWluYi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAneCcsICdiJzogeyAneCc6IGZhbHNlIH0gfSkpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWluYi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAneCcsICdiJzogeyAneCc6IHRydWUgfSB9KSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhaW5iLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6ICdwcm90b3R5cGUnLCAnYic6IHt9IH0pKSwgZmFsc2UpO1xuXG5cdFx0Ly8gZmlsZSBVUkkgY2FzZS1pbnNlbnNpdGl2ZSBjb21wYXJpc29uIG9uIFdpbmRvd3Ncblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHQvLyBBcnJheSBzb3VyY2U6IGZpbGUgVVJJcyB3aXRoIGRpZmZlcmVudCBjYXNpbmcgc2hvdWxkIG1hdGNoIG9uIFdpbmRvd3Ncblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhaW5iLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6ICdmaWxlOi8vL2MlM0EvVXNlcnMvcGF0aC9maWxlLnRzJywgJ2InOiBbJ2ZpbGU6Ly8vYyUzQS91c2Vycy9wYXRoL2ZpbGUudHMnXSB9KSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFpbmIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogJ2ZpbGU6Ly8vYyUzQS91c2Vycy9wYXRoL2ZpbGUudHMnLCAnYic6IFsnZmlsZTovLy9jJTNBL1VzZXJzL3BhdGgvZmlsZS50cyddIH0pKSwgdHJ1ZSk7XG5cdFx0XHQvLyBPYmplY3Qgc291cmNlOiBmaWxlIFVSSXMgd2l0aCBkaWZmZXJlbnQgY2FzaW5nIHNob3VsZCBtYXRjaCBvbiBXaW5kb3dzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWluYi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAnZmlsZTovLy9jJTNBL1VzZXJzL3BhdGgvZmlsZS50cycsICdiJzogeyAnZmlsZTovLy9jJTNBL3VzZXJzL3BhdGgvZmlsZS50cyc6IHRydWUgfSB9KSksIHRydWUpO1xuXHRcdFx0Ly8gTm9uLWZpbGUgVVJJcyBzaG91bGQgc3RpbGwgYmUgY2FzZS1zZW5zaXRpdmVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhaW5iLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6ICdnaXQ6L3BhdGgvRmlsZS50cycsICdiJzogWydnaXQ6L3BhdGgvZmlsZS50cyddIH0pKSwgZmFsc2UpO1xuXHRcdFx0Ly8gRXhhY3QgbWF0Y2ggc3RpbGwgd29ya3Ncblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhaW5iLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6ICdmaWxlOi8vL2MlM0EvVXNlcnMvcGF0aC9maWxlLnRzJywgJ2InOiBbJ2ZpbGU6Ly8vYyUzQS9Vc2Vycy9wYXRoL2ZpbGUudHMnXSB9KSksIHRydWUpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnQ29udGV4dEtleU5vdEluRXhwcicsICgpID0+IHtcblx0XHRjb25zdCBhTm90SW5CID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoJ2Egbm90IGluIGInKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFOb3RJbkIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogMywgJ2InOiBbMywgMiwgMV0gfSkpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFOb3RJbkIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogMywgJ2InOiBbMSwgMiwgM10gfSkpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFOb3RJbkIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogMywgJ2InOiBbMSwgMl0gfSkpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYU5vdEluQi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAzIH0pKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFOb3RJbkIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogMywgJ2InOiBudWxsIH0pKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFOb3RJbkIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7ICdhJzogJ3gnLCAnYic6IFsneCddIH0pKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhTm90SW5CLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6ICd4JywgJ2InOiBbJ3knXSB9KSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhTm90SW5CLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6ICd4JywgJ2InOiB7fSB9KSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhTm90SW5CLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyAnYSc6ICd4JywgJ2InOiB7ICd4JzogZmFsc2UgfSB9KSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYU5vdEluQi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAneCcsICdiJzogeyAneCc6IHRydWUgfSB9KSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYU5vdEluQi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAncHJvdG90eXBlJywgJ2InOiB7fSB9KSksIHRydWUpO1xuXG5cdFx0Ly8gZmlsZSBVUkkgY2FzZS1pbnNlbnNpdGl2ZSBjb21wYXJpc29uIG9uIFdpbmRvd3Ncblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYU5vdEluQi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAnZmlsZTovLy9jJTNBL1VzZXJzL3BhdGgvZmlsZS50cycsICdiJzogWydmaWxlOi8vL2MlM0EvdXNlcnMvcGF0aC9maWxlLnRzJ10gfSkpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYU5vdEluQi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAnZmlsZTovLy9jJTNBL3VzZXJzL3BhdGgvZmlsZS50cycsICdiJzogWydmaWxlOi8vL2MlM0EvVXNlcnMvcGF0aC9maWxlLnRzJ10gfSkpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYU5vdEluQi5ldmFsdWF0ZShjcmVhdGVDb250ZXh0KHsgJ2EnOiAnZ2l0Oi9wYXRoL0ZpbGUudHMnLCAnYic6IFsnZ2l0Oi9wYXRoL2ZpbGUudHMnXSB9KSksIHRydWUpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEwNjUyNDogZGlzdHJpYnV0aW5nIEFORCBzaG91bGQgbm9ybWFsaXplJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ2EnKSxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdiJylcblx0XHRcdCksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ2MnKVxuXHRcdCk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdhJyksXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnYycpXG5cdFx0XHQpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ2InKSxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdjJylcblx0XHRcdClcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwhLmVxdWFscyhleHBlY3RlZCEpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEyOTYyNTogUmVtb3ZlcyBkdXBsaWNhdGVkIHRlcm1zIGluIE9SIGV4cHJlc3Npb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4cHIgPSBDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnQScpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdCJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ0EnKVxuXHRcdCkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHByLnNlcmlhbGl6ZSgpLCAnQSB8fCBCJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Jlc29sdmVzIHRydWUgY29uc3RhbnQgT1IgZXhwcmVzc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXhwciA9IENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdBJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5ub3QoJ0EnKVxuXHRcdCkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHByLnNlcmlhbGl6ZSgpLCAndHJ1ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdSZXNvbHZlcyBmYWxzZSBjb25zdGFudCBBTkQgZXhwcmVzc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXhwciA9IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnQScpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIubm90KCdBJylcblx0XHQpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhwci5zZXJpYWxpemUoKSwgJ2ZhbHNlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMjk2MjU6IFJlbW92ZXMgZHVwbGljYXRlZCB0ZXJtcyBpbiBBTkQgZXhwcmVzc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXhwciA9IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnQScpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdCJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ0EnKVxuXHRcdCkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHByLnNlcmlhbGl6ZSgpLCAnQSAmJiBCJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMjk2MjU6IFJlbW92ZSBkdXBsaWNhdGVkIHRlcm1zIHdoZW4gbmVnYXRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXhwciA9IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnQScpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnQjEnKSxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdCMicpLFxuXHRcdFx0KVxuXHRcdCkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHByLnNlcmlhbGl6ZSgpLCAnQSAmJiBCMSB8fCBBICYmIEIyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cHIubmVnYXRlKCkhLnNlcmlhbGl6ZSgpLCAnIUEgfHwgIUEgJiYgIUIxIHx8ICFBICYmICFCMiB8fCAhQjEgJiYgIUIyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cHIubmVnYXRlKCkhLm5lZ2F0ZSgpIS5zZXJpYWxpemUoKSwgJ0EgJiYgQjEgfHwgQSAmJiBCMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHByLm5lZ2F0ZSgpIS5uZWdhdGUoKSEubmVnYXRlKCkhLnNlcmlhbGl6ZSgpLCAnIUEgfHwgIUEgJiYgIUIxIHx8ICFBICYmICFCMiB8fCAhQjEgJiYgIUIyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMjk2MjU6IHJlbW92ZSByZWR1bmRhbnQgdGVybXMgaW4gT1IgZXhwcmVzc2lvbnMnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gc3RySW1wbGllcyhwMDogc3RyaW5nLCBxMDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0XHRjb25zdCBwID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUocDApITtcblx0XHRcdGNvbnN0IHEgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShxMCkhO1xuXHRcdFx0cmV0dXJuIGltcGxpZXMocCwgcSk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJJbXBsaWVzKCdhICYmIGInLCAnYScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RySW1wbGllcygnYScsICdhICYmIGInKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbXBsaWVzJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIHN0ckltcGxpZXMocDA6IHN0cmluZywgcTA6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdFx0Y29uc3QgcCA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKHAwKSE7XG5cdFx0XHRjb25zdCBxID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUocTApITtcblx0XHRcdHJldHVybiBpbXBsaWVzKHAsIHEpO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RySW1wbGllcygnYScsICdhJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJJbXBsaWVzKCdhJywgJ2EgfHwgYicpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RySW1wbGllcygnYScsICdhICYmIGInKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJJbXBsaWVzKCdhJywgJ2EgJiYgYiB8fCBhICYmIGMnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJJbXBsaWVzKCdhICYmIGInLCAnYScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RySW1wbGllcygnYSAmJiBiJywgJ2InKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0ckltcGxpZXMoJ2EgJiYgYicsICdhICYmIGIgfHwgYycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RySW1wbGllcygnYSB8fCBiJywgJ2EgfHwgYycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0ckltcGxpZXMoJ2EgfHwgYicsICdhIHx8IGInKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0ckltcGxpZXMoJ2EgJiYgYicsICdhICYmIGInKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0ckltcGxpZXMoJ2EgfHwgYicsICdhIHx8IGIgfHwgYycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RySW1wbGllcygnYyAmJiBhICYmIGInLCAnYyAmJiBhJyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdHcmVhdGVyLCBHcmVhdGVyRXF1YWxzLCBTbWFsbGVyLCBTbWFsbGVyRXF1YWxzIGV2YWx1YXRlJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIGNoZWNrRXZhbHVhdGUoZXhwcjogc3RyaW5nLCBjdHg6IGFueSwgZXhwZWN0ZWQ6IGFueSk6IHZvaWQge1xuXHRcdFx0Y29uc3QgX2V4cHIgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShleHByKSE7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoX2V4cHIuZXZhbHVhdGUoY3JlYXRlQ29udGV4dChjdHgpKSwgZXhwZWN0ZWQpO1xuXHRcdH1cblxuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPiAxJywge30sIGZhbHNlKTtcblx0XHRjaGVja0V2YWx1YXRlKCdhID4gMScsIHsgYTogMCB9LCBmYWxzZSk7XG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA+IDEnLCB7IGE6IDEgfSwgZmFsc2UpO1xuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPiAxJywgeyBhOiAyIH0sIHRydWUpO1xuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPiAxJywgeyBhOiAnMCcgfSwgZmFsc2UpO1xuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPiAxJywgeyBhOiAnMScgfSwgZmFsc2UpO1xuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPiAxJywgeyBhOiAnMicgfSwgdHJ1ZSk7XG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA+IDEnLCB7IGE6ICdhJyB9LCBmYWxzZSk7XG5cblx0XHRjaGVja0V2YWx1YXRlKCdhID4gMTAnLCB7IGE6IDIgfSwgZmFsc2UpO1xuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPiAxMCcsIHsgYTogMTEgfSwgdHJ1ZSk7XG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA+IDEwJywgeyBhOiAnMTEnIH0sIHRydWUpO1xuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPiAxMCcsIHsgYTogJzInIH0sIGZhbHNlKTtcblx0XHRjaGVja0V2YWx1YXRlKCdhID4gMTAnLCB7IGE6ICcxMScgfSwgdHJ1ZSk7XG5cblx0XHRjaGVja0V2YWx1YXRlKCdhID4gMS4xJywgeyBhOiAxIH0sIGZhbHNlKTtcblx0XHRjaGVja0V2YWx1YXRlKCdhID4gMS4xJywgeyBhOiAyIH0sIHRydWUpO1xuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPiAxLjEnLCB7IGE6IDExIH0sIHRydWUpO1xuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPiAxLjEnLCB7IGE6ICcxLjEnIH0sIGZhbHNlKTtcblx0XHRjaGVja0V2YWx1YXRlKCdhID4gMS4xJywgeyBhOiAnMicgfSwgdHJ1ZSk7XG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA+IDEuMScsIHsgYTogJzExJyB9LCB0cnVlKTtcblxuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPiBiJywgeyBhOiAnYicgfSwgZmFsc2UpO1xuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPiBiJywgeyBhOiAnYycgfSwgZmFsc2UpO1xuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPiBiJywgeyBhOiAxMDAwIH0sIGZhbHNlKTtcblxuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPj0gMicsIHsgYTogJzEnIH0sIGZhbHNlKTtcblx0XHRjaGVja0V2YWx1YXRlKCdhID49IDInLCB7IGE6ICcyJyB9LCB0cnVlKTtcblx0XHRjaGVja0V2YWx1YXRlKCdhID49IDInLCB7IGE6ICczJyB9LCB0cnVlKTtcblxuXHRcdGNoZWNrRXZhbHVhdGUoJ2EgPCAyJywgeyBhOiAnMScgfSwgdHJ1ZSk7XG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA8IDInLCB7IGE6ICcyJyB9LCBmYWxzZSk7XG5cdFx0Y2hlY2tFdmFsdWF0ZSgnYSA8IDInLCB7IGE6ICczJyB9LCBmYWxzZSk7XG5cblx0XHRjaGVja0V2YWx1YXRlKCdhIDw9IDInLCB7IGE6ICcxJyB9LCB0cnVlKTtcblx0XHRjaGVja0V2YWx1YXRlKCdhIDw9IDInLCB7IGE6ICcyJyB9LCB0cnVlKTtcblx0XHRjaGVja0V2YWx1YXRlKCdhIDw9IDInLCB7IGE6ICczJyB9LCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0dyZWF0ZXIsIEdyZWF0ZXJFcXVhbHMsIFNtYWxsZXIsIFNtYWxsZXJFcXVhbHMgbmVnYXRlJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIGNoZWNrTmVnYXRlKGV4cHI6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0Y29uc3QgYSA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGV4cHIpITtcblx0XHRcdGNvbnN0IGIgPSBhLm5lZ2F0ZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIuc2VyaWFsaXplKCksIGV4cGVjdGVkKTtcblx0XHR9XG5cblx0XHRjaGVja05lZ2F0ZSgnYSA+IDEnLCAnYSA8PSAxJyk7XG5cdFx0Y2hlY2tOZWdhdGUoJ2EgPiAxLjEnLCAnYSA8PSAxLjEnKTtcblx0XHRjaGVja05lZ2F0ZSgnYSA+IGInLCAnYSA8PSBiJyk7XG5cblx0XHRjaGVja05lZ2F0ZSgnYSA+PSAxJywgJ2EgPCAxJyk7XG5cdFx0Y2hlY2tOZWdhdGUoJ2EgPj0gMS4xJywgJ2EgPCAxLjEnKTtcblx0XHRjaGVja05lZ2F0ZSgnYSA+PSBiJywgJ2EgPCBiJyk7XG5cblx0XHRjaGVja05lZ2F0ZSgnYSA8IDEnLCAnYSA+PSAxJyk7XG5cdFx0Y2hlY2tOZWdhdGUoJ2EgPCAxLjEnLCAnYSA+PSAxLjEnKTtcblx0XHRjaGVja05lZ2F0ZSgnYSA8IGInLCAnYSA+PSBiJyk7XG5cblx0XHRjaGVja05lZ2F0ZSgnYSA8PSAxJywgJ2EgPiAxJyk7XG5cdFx0Y2hlY2tOZWdhdGUoJ2EgPD0gMS4xJywgJ2EgPiAxLjEnKTtcblx0XHRjaGVja05lZ2F0ZSgnYSA8PSBiJywgJ2EgPiBiJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTE4OTk6IGNvbnRleHQga2V5cyBjYW4gdXNlIGA8YCBvciBgPmAgJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKCdlZGl0b3JUZXh0Rm9jdXMgJiYgdmltLmFjdGl2ZSAmJiB2aW0udXNlPEMtcj4nKSE7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5lcXVhbHMoXG5cdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnZWRpdG9yVGV4dEZvY3VzJyksXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcygndmltLmFjdGl2ZScpLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ3ZpbS51c2U8Qy1yPicpLFxuXHRcdFx0KSFcblx0XHQpKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFNBQVMsYUFBYSxpQkFBaUI7QUFDaEQsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQkFBc0MsZUFBZTtBQUU5RCxTQUFTLGNBQWMsS0FBVTtBQUNoQyxTQUFPO0FBQUEsSUFDTixVQUFVLENBQUMsUUFBZ0I7QUFDMUIsYUFBTyxJQUFJLEdBQUc7QUFBQSxJQUNmO0FBQUEsRUFDRDtBQUNEO0FBRUEsTUFBTSxrQkFBa0IsTUFBTTtBQUU3QiwwQ0FBd0M7QUFFeEMsT0FBSyx5QkFBeUIsTUFBTTtBQUNuQyxVQUFNLElBQUksZUFBZTtBQUFBLE1BQ3hCLGVBQWUsSUFBSSxJQUFJO0FBQUEsTUFDdkIsZUFBZSxJQUFJLGVBQWUsSUFBSSxPQUFPLENBQUM7QUFBQSxNQUM5QyxlQUFlLElBQUksSUFBSTtBQUFBLE1BQ3ZCLGVBQWUsTUFB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RSxHQUFHLElBQUksR0FBRyxJQUFJO0FBQ3ZDLGtCQUFjLFNBQVMsRUFBRSxHQUFHLElBQUksR0FBRyxLQUFLO0FBRXhDLGtCQUFjLFVBQVUsRUFBRSxHQUFHLEVBQUUsR0FBRyxLQUFLO0FBQ3ZDLGtCQUFjLFVBQVUsRUFBRSxHQUFHLEdBQUcsR0FBRyxJQUFJO0FBQ3ZDLGtCQUFjLFVBQVUsRUFBRSxHQUFHLEtBQUssR0FBRyxJQUFJO0FBQ3pDLGtCQUFjLFVBQVUsRUFBRSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQ3pDLGtCQUFjLFVBQVUsRUFBRSxHQUFHLEtBQUssR0FBRyxJQUFJO0FBRXpDLGtCQUFjLFdBQVcsRUFBRSxHQUFHLEVBQUUsR0FBRyxLQUFLO0FBQ3hDLGtCQUFjLFdBQVcsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJO0FBQ3ZDLGtCQUFjLFdBQVcsRUFBRSxHQUFHLEdBQUcsR0FBRyxJQUFJO0FBQ3hDLGtCQUFjLFdBQVcsRUFBRSxHQUFHLE1BQU0sR0FBRyxLQUFLO0FBQzVDLGtCQUFjLFdBQVcsRUFBRSxHQUFHLElBQUksR0FBRyxJQUFJO0FBQ3pDLGtCQUFjLFdBQVcsRUFBRSxHQUFHLEtBQUssR0FBRyxJQUFJO0FBRTFDLGtCQUFjLFNBQVMsRUFBRSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQ3hDLGtCQUFjLFNBQVMsRUFBRSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQ3hDLGtCQUFjLFNBQVMsRUFBRSxHQUFHLElBQUssR0FBRyxLQUFLO0FBRXpDLGtCQUFjLFVBQVUsRUFBRSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQ3pDLGtCQUFjLFVBQVUsRUFBRSxHQUFHLElBQUksR0FBRyxJQUFJO0FBQ3hDLGtCQUFjLFVBQVUsRUFBRSxHQUFHLElBQUksR0FBRyxJQUFJO0FBRXhDLGtCQUFjLFNBQVMsRUFBRSxHQUFHLElBQUksR0FBRyxJQUFJO0FBQ3ZDLGtCQUFjLFNBQVMsRUFBRSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQ3hDLGtCQUFjLFNBQVMsRUFBRSxHQUFHLElBQUksR0FBRyxLQUFLO0FBRXhDLGtCQUFjLFVBQVUsRUFBRSxHQUFHLElBQUksR0FBRyxJQUFJO0FBQ3hDLGtCQUFjLFVBQVUsRUFBRSxHQUFHLElBQUksR0FBRyxJQUFJO0FBQ3hDLGtCQUFjLFVBQVUsRUFBRSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQUEsRUFDMUMsQ0FBQztBQUVELE9BQUsseURBQXlELE1BQU07QUFDbkUsYUFBUyxZQUFZLE1BQWMsVUFBd0I7QUFDMUQsWUFBTSxJQUFJLGVBQWUsWUFBWSxJQUFJO0FBQ3pDLFlBQU0sSUFBSSxFQUFFLE9BQU87QUFDbkIsYUFBTyxZQUFZLEVBQUUsVUFBVSxHQUFHLFFBQVE7QUFBQSxJQUMzQztBQUVBLGdCQUFZLFNBQVMsUUFBUTtBQUM3QixnQkFBWSxXQUFXLFVBQVU7QUFDakMsZ0JBQVksU0FBUyxRQUFRO0FBRTdCLGdCQUFZLFVBQVUsT0FBTztBQUM3QixnQkFBWSxZQUFZLFNBQVM7QUFDakMsZ0JBQVksVUFBVSxPQUFPO0FBRTdCLGdCQUFZLFNBQVMsUUFBUTtBQUM3QixnQkFBWSxXQUFXLFVBQVU7QUFDakMsZ0JBQVksU0FBUyxRQUFRO0FBRTdCLGdCQUFZLFVBQVUsT0FBTztBQUM3QixnQkFBWSxZQUFZLFNBQVM7QUFDakMsZ0JBQVksVUFBVSxPQUFPO0FBQUEsRUFDOUIsQ0FBQztBQUVELE9BQUssbURBQW1ELE1BQU07QUFDN0QsVUFBTSxTQUFTLGVBQWUsWUFBWSwrQ0FBK0M7QUFDekYsV0FBTyxHQUFHLE9BQU87QUFBQSxNQUNoQixlQUFlO0FBQUEsUUFDZCxlQUFlLElBQUksaUJBQWlCO0FBQUEsUUFDcEMsZUFBZSxJQUFJLFlBQVk7QUFBQSxRQUMvQixlQUFlLElBQUksY0FBYztBQUFBLE1BQ2xDO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
