import assert from "assert";
import * as types from "../../common/types.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
import { assertDefined, isOneOf, typeCheck } from "../../common/types.js";
suite("Types", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("isFunction", () => {
    assert(!types.isFunction(void 0));
    assert(!types.isFunction(null));
    assert(!types.isFunction("foo"));
    assert(!types.isFunction(5));
    assert(!types.isFunction(true));
    assert(!types.isFunction([]));
    assert(!types.isFunction([1, 2, "3"]));
    assert(!types.isFunction({}));
    assert(!types.isFunction({ foo: "bar" }));
    assert(!types.isFunction(/test/));
    assert(!types.isFunction(new RegExp("")));
    assert(!types.isFunction(/* @__PURE__ */ new Date()));
    assert(types.isFunction(assert));
    assert(types.isFunction(function foo() {
    }));
  });
  test("areFunctions", () => {
    assert(!types.areFunctions());
    assert(!types.areFunctions(null));
    assert(!types.areFunctions("foo"));
    assert(!types.areFunctions(5));
    assert(!types.areFunctions(true));
    assert(!types.areFunctions([]));
    assert(!types.areFunctions([1, 2, "3"]));
    assert(!types.areFunctions({}));
    assert(!types.areFunctions({ foo: "bar" }));
    assert(!types.areFunctions(/test/));
    assert(!types.areFunctions(new RegExp("")));
    assert(!types.areFunctions(/* @__PURE__ */ new Date()));
    assert(!types.areFunctions(assert, ""));
    assert(types.areFunctions(assert));
    assert(types.areFunctions(assert, assert));
    assert(types.areFunctions(function foo() {
    }));
  });
  test("isObject", () => {
    assert(!types.isObject(void 0));
    assert(!types.isObject(null));
    assert(!types.isObject("foo"));
    assert(!types.isObject(5));
    assert(!types.isObject(true));
    assert(!types.isObject([]));
    assert(!types.isObject([1, 2, "3"]));
    assert(!types.isObject(/test/));
    assert(!types.isObject(new RegExp("")));
    assert(!types.isFunction(/* @__PURE__ */ new Date()));
    assert.strictEqual(types.isObject(assert), false);
    assert(!types.isObject(function foo() {
    }));
    assert(types.isObject({}));
    assert(types.isObject({ foo: "bar" }));
  });
  test("isEmptyObject", () => {
    assert(!types.isEmptyObject(void 0));
    assert(!types.isEmptyObject(null));
    assert(!types.isEmptyObject("foo"));
    assert(!types.isEmptyObject(5));
    assert(!types.isEmptyObject(true));
    assert(!types.isEmptyObject([]));
    assert(!types.isEmptyObject([1, 2, "3"]));
    assert(!types.isEmptyObject(/test/));
    assert(!types.isEmptyObject(new RegExp("")));
    assert(!types.isEmptyObject(/* @__PURE__ */ new Date()));
    assert.strictEqual(types.isEmptyObject(assert), false);
    assert(!types.isEmptyObject(function foo() {
    }));
    assert(!types.isEmptyObject({ foo: "bar" }));
    assert(types.isEmptyObject({}));
  });
  test("isString", () => {
    assert(!types.isString(void 0));
    assert(!types.isString(null));
    assert(!types.isString(5));
    assert(!types.isString([]));
    assert(!types.isString([1, 2, "3"]));
    assert(!types.isString(true));
    assert(!types.isString({}));
    assert(!types.isString(/test/));
    assert(!types.isString(new RegExp("")));
    assert(!types.isString(/* @__PURE__ */ new Date()));
    assert(!types.isString(assert));
    assert(!types.isString(function foo() {
    }));
    assert(!types.isString({ foo: "bar" }));
    assert(types.isString("foo"));
  });
  test("isStringArray", () => {
    assert(!types.isStringArray(void 0));
    assert(!types.isStringArray(null));
    assert(!types.isStringArray(5));
    assert(!types.isStringArray("foo"));
    assert(!types.isStringArray(true));
    assert(!types.isStringArray({}));
    assert(!types.isStringArray(/test/));
    assert(!types.isStringArray(new RegExp("")));
    assert(!types.isStringArray(/* @__PURE__ */ new Date()));
    assert(!types.isStringArray(assert));
    assert(!types.isStringArray(function foo() {
    }));
    assert(!types.isStringArray({ foo: "bar" }));
    assert(!types.isStringArray([1, 2, 3]));
    assert(!types.isStringArray([1, 2, "3"]));
    assert(!types.isStringArray(["foo", "bar", 5]));
    assert(!types.isStringArray(["foo", null, "bar"]));
    assert(!types.isStringArray(["foo", void 0, "bar"]));
    assert(types.isStringArray([]));
    assert(types.isStringArray(["foo"]));
    assert(types.isStringArray(["foo", "bar"]));
    assert(types.isStringArray(["foo", "bar", "baz"]));
  });
  test("isArrayOf", () => {
    assert(!types.isArrayOf(void 0, types.isString));
    assert(!types.isArrayOf(null, types.isString));
    assert(!types.isArrayOf(5, types.isString));
    assert(!types.isArrayOf("foo", types.isString));
    assert(!types.isArrayOf(true, types.isString));
    assert(!types.isArrayOf({}, types.isString));
    assert(!types.isArrayOf(/test/, types.isString));
    assert(!types.isArrayOf(new RegExp(""), types.isString));
    assert(!types.isArrayOf(/* @__PURE__ */ new Date(), types.isString));
    assert(!types.isArrayOf(assert, types.isString));
    assert(!types.isArrayOf(function foo() {
    }, types.isString));
    assert(!types.isArrayOf({ foo: "bar" }, types.isString));
    assert(!types.isArrayOf([1, 2, 3], types.isString));
    assert(!types.isArrayOf([1, 2, "3"], types.isString));
    assert(!types.isArrayOf(["foo", "bar", 5], types.isString));
    assert(!types.isArrayOf(["foo", null, "bar"], types.isString));
    assert(!types.isArrayOf(["foo", void 0, "bar"], types.isString));
    assert(types.isArrayOf([], types.isString));
    assert(types.isArrayOf(["foo"], types.isString));
    assert(types.isArrayOf(["foo", "bar"], types.isString));
    assert(types.isArrayOf(["foo", "bar", "baz"], types.isString));
    assert(types.isArrayOf([], types.isNumber));
    assert(types.isArrayOf([1], types.isNumber));
    assert(types.isArrayOf([1, 2, 3], types.isNumber));
    assert(!types.isArrayOf([1, 2, "3"], types.isNumber));
    assert(types.isArrayOf([], types.isBoolean));
    assert(types.isArrayOf([true], types.isBoolean));
    assert(types.isArrayOf([true, false, true], types.isBoolean));
    assert(!types.isArrayOf([true, 1, false], types.isBoolean));
    assert(types.isArrayOf([], types.isFunction));
    assert(types.isArrayOf([assert], types.isFunction));
    assert(types.isArrayOf([assert, function foo() {
    }], types.isFunction));
    assert(!types.isArrayOf([assert, "foo"], types.isFunction));
    const isEven = (n) => types.isNumber(n) && n % 2 === 0;
    assert(types.isArrayOf([], isEven));
    assert(types.isArrayOf([2, 4, 6], isEven));
    assert(!types.isArrayOf([2, 3, 4], isEven));
    assert(!types.isArrayOf([1, 3, 5], isEven));
  });
  test("isNumber", () => {
    assert(!types.isNumber(void 0));
    assert(!types.isNumber(null));
    assert(!types.isNumber("foo"));
    assert(!types.isNumber([]));
    assert(!types.isNumber([1, 2, "3"]));
    assert(!types.isNumber(true));
    assert(!types.isNumber({}));
    assert(!types.isNumber(/test/));
    assert(!types.isNumber(new RegExp("")));
    assert(!types.isNumber(/* @__PURE__ */ new Date()));
    assert(!types.isNumber(assert));
    assert(!types.isNumber(function foo() {
    }));
    assert(!types.isNumber({ foo: "bar" }));
    assert(!types.isNumber(parseInt("A", 10)));
    assert(types.isNumber(5));
  });
  test("isUndefined", () => {
    assert(!types.isUndefined(null));
    assert(!types.isUndefined("foo"));
    assert(!types.isUndefined([]));
    assert(!types.isUndefined([1, 2, "3"]));
    assert(!types.isUndefined(true));
    assert(!types.isUndefined({}));
    assert(!types.isUndefined(/test/));
    assert(!types.isUndefined(new RegExp("")));
    assert(!types.isUndefined(/* @__PURE__ */ new Date()));
    assert(!types.isUndefined(assert));
    assert(!types.isUndefined(function foo() {
    }));
    assert(!types.isUndefined({ foo: "bar" }));
    assert(types.isUndefined(void 0));
  });
  test("isUndefinedOrNull", () => {
    assert(!types.isUndefinedOrNull("foo"));
    assert(!types.isUndefinedOrNull([]));
    assert(!types.isUndefinedOrNull([1, 2, "3"]));
    assert(!types.isUndefinedOrNull(true));
    assert(!types.isUndefinedOrNull({}));
    assert(!types.isUndefinedOrNull(/test/));
    assert(!types.isUndefinedOrNull(new RegExp("")));
    assert(!types.isUndefinedOrNull(/* @__PURE__ */ new Date()));
    assert(!types.isUndefinedOrNull(assert));
    assert(!types.isUndefinedOrNull(function foo() {
    }));
    assert(!types.isUndefinedOrNull({ foo: "bar" }));
    assert(types.isUndefinedOrNull(void 0));
    assert(types.isUndefinedOrNull(null));
  });
  test("assertIsDefined / assertAreDefined", () => {
    assert.throws(() => types.assertReturnsDefined(void 0));
    assert.throws(() => types.assertReturnsDefined(null));
    assert.throws(() => types.assertReturnsAllDefined(null, void 0));
    assert.throws(() => types.assertReturnsAllDefined(true, void 0));
    assert.throws(() => types.assertReturnsAllDefined(void 0, false));
    assert.strictEqual(types.assertReturnsDefined(true), true);
    assert.strictEqual(types.assertReturnsDefined(false), false);
    assert.strictEqual(types.assertReturnsDefined("Hello"), "Hello");
    assert.strictEqual(types.assertReturnsDefined(""), "");
    const res = types.assertReturnsAllDefined(1, true, "Hello");
    assert.strictEqual(res[0], 1);
    assert.strictEqual(res[1], true);
    assert.strictEqual(res[2], "Hello");
  });
  suite("assertDefined", () => {
    test("should not throw if `value` is defined (bool)", async () => {
      assert.doesNotThrow(function() {
        assertDefined(true, "Oops something happened.");
      });
    });
    test("should not throw if `value` is defined (number)", async () => {
      assert.doesNotThrow(function() {
        assertDefined(5, "Oops something happened.");
      });
    });
    test("should not throw if `value` is defined (zero)", async () => {
      assert.doesNotThrow(function() {
        assertDefined(0, "Oops something happened.");
      });
    });
    test("should not throw if `value` is defined (string)", async () => {
      assert.doesNotThrow(function() {
        assertDefined("some string", "Oops something happened.");
      });
    });
    test("should not throw if `value` is defined (empty string)", async () => {
      assert.doesNotThrow(function() {
        assertDefined("", "Oops something happened.");
      });
    });
    const assertThrows = (testFunction, errorMessage) => {
      let thrownError;
      try {
        testFunction();
      } catch (e) {
        thrownError = e;
      }
      assertDefined(thrownError, "Must throw an error.");
      assert(
        thrownError instanceof Error,
        "Error must be an instance of `Error`."
      );
      assert.strictEqual(
        thrownError.message,
        errorMessage,
        "Error must have correct message."
      );
    };
    test("should throw if `value` is `null`", async () => {
      const errorMessage = "Uggh ohh!";
      assertThrows(() => {
        assertDefined(null, errorMessage);
      }, errorMessage);
    });
    test("should throw if `value` is `undefined`", async () => {
      const errorMessage = "Oh no!";
      assertThrows(() => {
        assertDefined(void 0, new Error(errorMessage));
      }, errorMessage);
    });
    test("should throw assertion error by default", async () => {
      const errorMessage = "Uggh ohh!";
      let thrownError;
      try {
        assertDefined(null, errorMessage);
      } catch (e) {
        thrownError = e;
      }
      assertDefined(thrownError, "Must throw an error.");
      assert(
        thrownError instanceof Error,
        "Error must be an instance of `Error`."
      );
      assert.strictEqual(
        thrownError.message,
        errorMessage,
        "Error must have correct message."
      );
    });
    test("should throw provided error instance", async () => {
      class TestError extends Error {
        constructor(...args) {
          super(...args);
          this.name = "TestError";
        }
      }
      const errorMessage = "Oops something hapenned.";
      const error = new TestError(errorMessage);
      let thrownError;
      try {
        assertDefined(null, error);
      } catch (e) {
        thrownError = e;
      }
      assert(
        thrownError instanceof TestError,
        "Error must be an instance of `TestError`."
      );
      assert.strictEqual(
        thrownError.message,
        errorMessage,
        "Error must have correct message."
      );
    });
  });
  suite("isOneOf", () => {
    suite("success", () => {
      suite("string", () => {
        test("type", () => {
          assert.doesNotThrow(() => {
            assert(
              isOneOf("foo", ["foo", "bar"]),
              "Foo must be one of: foo, bar"
            );
          });
        });
        test("subtype", () => {
          assert.doesNotThrow(() => {
            const item = "hi";
            const list = ["hi", "ciao"];
            assert(
              isOneOf(item, list),
              "Hi must be one of: hi, ciao"
            );
            typeCheck(item);
          });
        });
      });
      suite("number", () => {
        test("type", () => {
          assert.doesNotThrow(() => {
            assert(
              isOneOf(10, [10, 100]),
              "10 must be one of: 10, 100"
            );
          });
        });
        test("subtype", () => {
          assert.doesNotThrow(() => {
            const item = 20;
            const list = [20, 2e3];
            assert(
              isOneOf(item, list),
              "20 must be one of: 20, 2000"
            );
            typeCheck(item);
          });
        });
      });
      suite("boolean", () => {
        test("type", () => {
          assert.doesNotThrow(() => {
            assert(
              isOneOf(true, [true, false]),
              "true must be one of: true, false"
            );
          });
          assert.doesNotThrow(() => {
            assert(
              isOneOf(false, [true, false]),
              "false must be one of: true, false"
            );
          });
        });
        test("subtype (true)", () => {
          assert.doesNotThrow(() => {
            const item = true;
            const list = [true, true];
            assert(
              isOneOf(item, list),
              "true must be one of: true, true"
            );
            typeCheck(item);
          });
        });
        test("subtype (false)", () => {
          assert.doesNotThrow(() => {
            const item = false;
            const list = [false, true];
            assert(
              isOneOf(item, list),
              "false must be one of: false, true"
            );
            typeCheck(item);
          });
        });
      });
      suite("undefined", () => {
        test("type", () => {
          assert.doesNotThrow(() => {
            assert(
              isOneOf(void 0, [void 0]),
              "undefined must be one of: undefined"
            );
          });
          assert.doesNotThrow(() => {
            assert(
              isOneOf(void 0, [void 0]),
              "undefined must be one of: void 0"
            );
          });
        });
        test("subtype", () => {
          assert.doesNotThrow(() => {
            let item;
            const list = [void 0];
            assert(
              isOneOf(item, list),
              "undefined | null must be one of: undefined"
            );
            typeCheck(item);
          });
        });
      });
      suite("null", () => {
        test("type", () => {
          assert.doesNotThrow(() => {
            assert(
              isOneOf(null, [null]),
              "null must be one of: null"
            );
          });
        });
        test("subtype", () => {
          assert.doesNotThrow(() => {
            const item = null;
            const list = [null];
            assert(
              isOneOf(item, list),
              "null must be one of: null"
            );
            typeCheck(item);
          });
        });
      });
      suite("any", () => {
        test("item", () => {
          assert.doesNotThrow(() => {
            const item = "1";
            const list = ["2", "1"];
            assert(
              isOneOf(item, list),
              "1 must be one of: 2, 1"
            );
            typeCheck(item);
          });
        });
        test("list", () => {
          assert.doesNotThrow(() => {
            const item = "5";
            const list = ["3", "5", "2.5"];
            assert(
              isOneOf(item, list),
              "5 must be one of: 3, 5, 2.5"
            );
            typeCheck(item);
          });
        });
        test("both", () => {
          assert.doesNotThrow(() => {
            const item = "12";
            const list = ["14.25", "7", "12"];
            assert(
              isOneOf(item, list),
              "12 must be one of: 14.25, 7, 12"
            );
            typeCheck(item);
          });
        });
      });
      suite("unknown", () => {
        test("item", () => {
          assert.doesNotThrow(() => {
            const item = "1";
            const list = ["2", "1"];
            assert(
              isOneOf(item, list),
              "1 must be one of: 2, 1"
            );
            typeCheck(item);
          });
        });
        test("both", () => {
          assert.doesNotThrow(() => {
            const item = "12";
            const list = ["14.25", "7", "12"];
            assert(
              isOneOf(item, list),
              "12 must be one of: 14.25, 7, 12"
            );
            typeCheck(item);
          });
        });
      });
    });
    suite("failure", () => {
      suite("string", () => {
        test("type", () => {
          assert.throws(() => {
            const item = "baz";
            assert(
              isOneOf(item, ["foo", "bar"]),
              "Baz must not be one of: foo, bar"
            );
          });
        });
        test("subtype", () => {
          assert.throws(() => {
            const item = "vitannia";
            const list = ["hi", "ciao"];
            assert(
              isOneOf(item, list),
              "vitannia must be one of: hi, ciao"
            );
          });
        });
        test("empty", () => {
          assert.throws(() => {
            const item = "vitannia";
            const list = [];
            assert(
              isOneOf(item, list),
              "vitannia must be one of: empty"
            );
          });
        });
      });
      suite("number", () => {
        test("type", () => {
          assert.throws(() => {
            assert(
              isOneOf(19, [10, 100]),
              "19 must not be one of: 10, 100"
            );
          });
        });
        test("subtype", () => {
          assert.throws(() => {
            const item = 24;
            const list = [20, 2e3];
            assert(
              isOneOf(item, list),
              "24 must not be one of: 20, 2000"
            );
          });
        });
        test("empty", () => {
          assert.throws(() => {
            const item = 20;
            const list = [];
            assert(
              isOneOf(item, list),
              "20 must not be one of: empty"
            );
          });
        });
      });
      suite("boolean", () => {
        test("type", () => {
          assert.throws(() => {
            assert(
              isOneOf(true, [false]),
              "true must not be one of: false"
            );
          });
          assert.throws(() => {
            assert(
              isOneOf(false, [true]),
              "false must not be one of: true"
            );
          });
        });
        test("subtype (true)", () => {
          assert.throws(() => {
            const item = true;
            const list = [false];
            assert(
              isOneOf(item, list),
              "true must not be one of: false"
            );
          });
        });
        test("subtype (false)", () => {
          assert.throws(() => {
            const item = false;
            const list = [true, true, true];
            assert(
              isOneOf(item, list),
              "false must be one of: true, true, true"
            );
          });
        });
        test("empty", () => {
          assert.throws(() => {
            const item = true;
            const list = [];
            assert(
              isOneOf(item, list),
              "true must be one of: empty"
            );
          });
        });
      });
      suite("undefined", () => {
        test("type", () => {
          assert.throws(() => {
            assert(
              isOneOf(void 0, []),
              "undefined must not be one of: empty"
            );
          });
          assert.throws(() => {
            assert(
              isOneOf(void 0, []),
              "void 0 must not be one of: empty"
            );
          });
        });
        test("subtype", () => {
          assert.throws(() => {
            let item;
            const list = [null];
            assert(
              isOneOf(item, list),
              "undefined must be one of: null"
            );
          });
        });
        test("empty", () => {
          assert.throws(() => {
            let item;
            const list = [];
            assert(
              isOneOf(item, list),
              "undefined must be one of: empty"
            );
          });
        });
      });
      suite("null", () => {
        test("type", () => {
          assert.throws(() => {
            assert(
              isOneOf(null, []),
              "null must be one of: empty"
            );
          });
        });
        test("subtype", () => {
          assert.throws(() => {
            const item = null;
            const list = [];
            assert(
              isOneOf(item, list),
              "null must be one of: empty"
            );
          });
        });
      });
      suite("any", () => {
        test("item", () => {
          assert.throws(() => {
            const item = "1";
            const list = ["3", "4"];
            assert(
              isOneOf(item, list),
              "1 must not be one of: 3, 4"
            );
          });
        });
        test("list", () => {
          assert.throws(() => {
            const item = "5";
            const list = ["3", "6", "2.5"];
            assert(
              isOneOf(item, list),
              "5 must not be one of: 3, 6, 2.5"
            );
          });
        });
        test("both", () => {
          assert.throws(() => {
            const item = "12";
            const list = ["14.25", "7", "15"];
            assert(
              isOneOf(item, list),
              "12 must not be one of: 14.25, 7, 15"
            );
          });
        });
        test("empty", () => {
          assert.throws(() => {
            const item = "25";
            const list = [];
            assert(
              isOneOf(item, list),
              "25 must not be one of: empty"
            );
          });
        });
      });
      suite("unknown", () => {
        test("item", () => {
          assert.throws(() => {
            const item = "100";
            const list = ["12", "11"];
            assert(
              isOneOf(item, list),
              "100 must not be one of: 12, 11"
            );
          });
          test("both", () => {
            assert.throws(() => {
              const item = "21";
              const list = ["14.25", "7", "12"];
              assert(
                isOneOf(item, list),
                "21 must not be one of: 14.25, 7, 12"
              );
            });
          });
        });
      });
    });
  });
  test("validateConstraints", () => {
    types.validateConstraints([1, "test", true], [Number, String, Boolean]);
    types.validateConstraints([1, "test", true], ["number", "string", "boolean"]);
    types.validateConstraints([console.log], [Function]);
    types.validateConstraints([void 0], [types.isUndefined]);
    types.validateConstraints([1], [types.isNumber]);
    class Foo {
    }
    types.validateConstraints([new Foo()], [Foo]);
    function isFoo(f) {
    }
    assert.throws(() => types.validateConstraints([new Foo()], [isFoo]));
    function isFoo2(f) {
      return true;
    }
    types.validateConstraints([new Foo()], [isFoo2]);
    assert.throws(() => types.validateConstraints([1, true], [types.isNumber, types.isString]));
    assert.throws(() => types.validateConstraints(["2"], [types.isNumber]));
    assert.throws(() => types.validateConstraints([1, "test", true], [Number, String, Number]));
  });
  suite("hasKey", () => {
    test("should return true when object has specified key", () => {
      const obj = { a: "test" };
      assert(types.hasKey(obj, { a: true }));
      assert.strictEqual(obj.a, "test");
    });
    test("should return false when object does not have specified key", () => {
      const obj = { b: 42 };
      assert(!types.hasKey(obj, { a: true }));
    });
    test("should work with multiple keys", () => {
      const obj = { a: "test", b: 42 };
      assert(types.hasKey(obj, { a: true, b: true }));
      assert.strictEqual(obj.a, "test");
      assert.strictEqual(obj.b, 42);
    });
    test("should return false if any key is missing", () => {
      const obj = { a: "test" };
      assert(!types.hasKey(obj, { a: true, b: true }));
    });
    test("should work with empty key object", () => {
      const obj = { a: "test" };
      assert(types.hasKey(obj, {}));
    });
    test("should work with complex union types", () => {
      const objA = { kind: "a", value: "hello" };
      const objB = { kind: "b", count: 5 };
      assert(types.hasKey(objA, { value: true }));
      assert(!types.hasKey(objA, { count: true }));
      assert(!types.hasKey(objA, { items: true }));
      assert(!types.hasKey(objB, { value: true }));
      assert(types.hasKey(objB, { count: true }));
      assert(!types.hasKey(objB, { items: true }));
    });
    test("should handle objects with optional properties", () => {
      const obj1 = { a: "test", b: 42 };
      const obj2 = { a: "test" };
      assert(types.hasKey(obj1, { a: true }));
      assert(types.hasKey(obj1, { b: true }));
      assert(types.hasKey(obj2, { a: true }));
      assert(!types.hasKey(obj2, { b: true }));
    });
    test("should work with nested objects", () => {
      const obj = { data: { nested: "test" } };
      assert(types.hasKey(obj, { data: true }));
      assert(!types.hasKey(obj, { value: true }));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vdHlwZXMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIHR5cGVzIGZyb20gJy4uLy4uL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcbmltcG9ydCB7IGFzc2VydERlZmluZWQsIGlzT25lT2YsIHR5cGVDaGVjayB9IGZyb20gJy4uLy4uL2NvbW1vbi90eXBlcy5qcyc7XG5cbnN1aXRlKCdUeXBlcycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdpc0Z1bmN0aW9uJywgKCkgPT4ge1xuXHRcdGFzc2VydCghdHlwZXMuaXNGdW5jdGlvbih1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRnVuY3Rpb24obnVsbCkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNGdW5jdGlvbignZm9vJykpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNGdW5jdGlvbig1KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0Z1bmN0aW9uKHRydWUpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRnVuY3Rpb24oW10pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRnVuY3Rpb24oWzEsIDIsICczJ10pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRnVuY3Rpb24oe30pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRnVuY3Rpb24oeyBmb286ICdiYXInIH0pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRnVuY3Rpb24oL3Rlc3QvKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0Z1bmN0aW9uKG5ldyBSZWdFeHAoJycpKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0Z1bmN0aW9uKG5ldyBEYXRlKCkpKTtcblxuXHRcdGFzc2VydCh0eXBlcy5pc0Z1bmN0aW9uKGFzc2VydCkpO1xuXHRcdGFzc2VydCh0eXBlcy5pc0Z1bmN0aW9uKGZ1bmN0aW9uIGZvbygpIHsgLyoqLyB9KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FyZUZ1bmN0aW9ucycsICgpID0+IHtcblx0XHRhc3NlcnQoIXR5cGVzLmFyZUZ1bmN0aW9ucygpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmFyZUZ1bmN0aW9ucyhudWxsKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5hcmVGdW5jdGlvbnMoJ2ZvbycpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmFyZUZ1bmN0aW9ucyg1KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5hcmVGdW5jdGlvbnModHJ1ZSkpO1xuXHRcdGFzc2VydCghdHlwZXMuYXJlRnVuY3Rpb25zKFtdKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5hcmVGdW5jdGlvbnMoWzEsIDIsICczJ10pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmFyZUZ1bmN0aW9ucyh7fSkpO1xuXHRcdGFzc2VydCghdHlwZXMuYXJlRnVuY3Rpb25zKHsgZm9vOiAnYmFyJyB9KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5hcmVGdW5jdGlvbnMoL3Rlc3QvKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5hcmVGdW5jdGlvbnMobmV3IFJlZ0V4cCgnJykpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmFyZUZ1bmN0aW9ucyhuZXcgRGF0ZSgpKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5hcmVGdW5jdGlvbnMoYXNzZXJ0LCAnJykpO1xuXG5cdFx0YXNzZXJ0KHR5cGVzLmFyZUZ1bmN0aW9ucyhhc3NlcnQpKTtcblx0XHRhc3NlcnQodHlwZXMuYXJlRnVuY3Rpb25zKGFzc2VydCwgYXNzZXJ0KSk7XG5cdFx0YXNzZXJ0KHR5cGVzLmFyZUZ1bmN0aW9ucyhmdW5jdGlvbiBmb28oKSB7IC8qKi8gfSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc09iamVjdCcsICgpID0+IHtcblx0XHRhc3NlcnQoIXR5cGVzLmlzT2JqZWN0KHVuZGVmaW5lZCkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNPYmplY3QobnVsbCkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNPYmplY3QoJ2ZvbycpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzT2JqZWN0KDUpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzT2JqZWN0KHRydWUpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzT2JqZWN0KFtdKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc09iamVjdChbMSwgMiwgJzMnXSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNPYmplY3QoL3Rlc3QvKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc09iamVjdChuZXcgUmVnRXhwKCcnKSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNGdW5jdGlvbihuZXcgRGF0ZSgpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVzLmlzT2JqZWN0KGFzc2VydCksIGZhbHNlKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzT2JqZWN0KGZ1bmN0aW9uIGZvbygpIHsgfSkpO1xuXG5cdFx0YXNzZXJ0KHR5cGVzLmlzT2JqZWN0KHt9KSk7XG5cdFx0YXNzZXJ0KHR5cGVzLmlzT2JqZWN0KHsgZm9vOiAnYmFyJyB9KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzRW1wdHlPYmplY3QnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0VtcHR5T2JqZWN0KHVuZGVmaW5lZCkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNFbXB0eU9iamVjdChudWxsKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0VtcHR5T2JqZWN0KCdmb28nKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0VtcHR5T2JqZWN0KDUpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRW1wdHlPYmplY3QodHJ1ZSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNFbXB0eU9iamVjdChbXSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNFbXB0eU9iamVjdChbMSwgMiwgJzMnXSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNFbXB0eU9iamVjdCgvdGVzdC8pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRW1wdHlPYmplY3QobmV3IFJlZ0V4cCgnJykpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRW1wdHlPYmplY3QobmV3IERhdGUoKSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlcy5pc0VtcHR5T2JqZWN0KGFzc2VydCksIGZhbHNlKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRW1wdHlPYmplY3QoZnVuY3Rpb24gZm9vKCkgeyAvKiovIH0pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzRW1wdHlPYmplY3QoeyBmb286ICdiYXInIH0pKTtcblxuXHRcdGFzc2VydCh0eXBlcy5pc0VtcHR5T2JqZWN0KHt9KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzU3RyaW5nJywgKCkgPT4ge1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmcodW5kZWZpbmVkKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZyhudWxsKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZyg1KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZyhbXSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmcoWzEsIDIsICczJ10pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzU3RyaW5nKHRydWUpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzU3RyaW5nKHt9KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZygvdGVzdC8pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzU3RyaW5nKG5ldyBSZWdFeHAoJycpKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZyhuZXcgRGF0ZSgpKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZyhhc3NlcnQpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzU3RyaW5nKGZ1bmN0aW9uIGZvbygpIHsgLyoqLyB9KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZyh7IGZvbzogJ2JhcicgfSkpO1xuXG5cdFx0YXNzZXJ0KHR5cGVzLmlzU3RyaW5nKCdmb28nKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzU3RyaW5nQXJyYXknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZ0FycmF5KHVuZGVmaW5lZCkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmdBcnJheShudWxsKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZ0FycmF5KDUpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzU3RyaW5nQXJyYXkoJ2ZvbycpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzU3RyaW5nQXJyYXkodHJ1ZSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmdBcnJheSh7fSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmdBcnJheSgvdGVzdC8pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzU3RyaW5nQXJyYXkobmV3IFJlZ0V4cCgnJykpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzU3RyaW5nQXJyYXkobmV3IERhdGUoKSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNTdHJpbmdBcnJheShhc3NlcnQpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzU3RyaW5nQXJyYXkoZnVuY3Rpb24gZm9vKCkgeyAvKiovIH0pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzU3RyaW5nQXJyYXkoeyBmb286ICdiYXInIH0pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzU3RyaW5nQXJyYXkoWzEsIDIsIDNdKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZ0FycmF5KFsxLCAyLCAnMyddKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZ0FycmF5KFsnZm9vJywgJ2JhcicsIDVdKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZ0FycmF5KFsnZm9vJywgbnVsbCwgJ2JhciddKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1N0cmluZ0FycmF5KFsnZm9vJywgdW5kZWZpbmVkLCAnYmFyJ10pKTtcblxuXHRcdGFzc2VydCh0eXBlcy5pc1N0cmluZ0FycmF5KFtdKSk7XG5cdFx0YXNzZXJ0KHR5cGVzLmlzU3RyaW5nQXJyYXkoWydmb28nXSkpO1xuXHRcdGFzc2VydCh0eXBlcy5pc1N0cmluZ0FycmF5KFsnZm9vJywgJ2JhciddKSk7XG5cdFx0YXNzZXJ0KHR5cGVzLmlzU3RyaW5nQXJyYXkoWydmb28nLCAnYmFyJywgJ2JheiddKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzQXJyYXlPZicsICgpID0+IHtcblx0XHQvLyBCYXNpYyBub24tYXJyYXkgdmFsdWVzXG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0FycmF5T2YodW5kZWZpbmVkLCB0eXBlcy5pc1N0cmluZykpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNBcnJheU9mKG51bGwsIHR5cGVzLmlzU3RyaW5nKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0FycmF5T2YoNSwgdHlwZXMuaXNTdHJpbmcpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzQXJyYXlPZignZm9vJywgdHlwZXMuaXNTdHJpbmcpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzQXJyYXlPZih0cnVlLCB0eXBlcy5pc1N0cmluZykpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNBcnJheU9mKHt9LCB0eXBlcy5pc1N0cmluZykpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNBcnJheU9mKC90ZXN0LywgdHlwZXMuaXNTdHJpbmcpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzQXJyYXlPZihuZXcgUmVnRXhwKCcnKSwgdHlwZXMuaXNTdHJpbmcpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzQXJyYXlPZihuZXcgRGF0ZSgpLCB0eXBlcy5pc1N0cmluZykpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNBcnJheU9mKGFzc2VydCwgdHlwZXMuaXNTdHJpbmcpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzQXJyYXlPZihmdW5jdGlvbiBmb28oKSB7IC8qKi8gfSwgdHlwZXMuaXNTdHJpbmcpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzQXJyYXlPZih7IGZvbzogJ2JhcicgfSwgdHlwZXMuaXNTdHJpbmcpKTtcblxuXHRcdC8vIEFycmF5cyB3aXRoIHdyb25nIHR5cGVzXG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0FycmF5T2YoWzEsIDIsIDNdLCB0eXBlcy5pc1N0cmluZykpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNBcnJheU9mKFsxLCAyLCAnMyddLCB0eXBlcy5pc1N0cmluZykpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNBcnJheU9mKFsnZm9vJywgJ2JhcicsIDVdLCB0eXBlcy5pc1N0cmluZykpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNBcnJheU9mKFsnZm9vJywgbnVsbCwgJ2JhciddLCB0eXBlcy5pc1N0cmluZykpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNBcnJheU9mKFsnZm9vJywgdW5kZWZpbmVkLCAnYmFyJ10sIHR5cGVzLmlzU3RyaW5nKSk7XG5cblx0XHQvLyBWYWxpZCBzdHJpbmcgYXJyYXlzXG5cdFx0YXNzZXJ0KHR5cGVzLmlzQXJyYXlPZihbXSwgdHlwZXMuaXNTdHJpbmcpKTtcblx0XHRhc3NlcnQodHlwZXMuaXNBcnJheU9mKFsnZm9vJ10sIHR5cGVzLmlzU3RyaW5nKSk7XG5cdFx0YXNzZXJ0KHR5cGVzLmlzQXJyYXlPZihbJ2ZvbycsICdiYXInXSwgdHlwZXMuaXNTdHJpbmcpKTtcblx0XHRhc3NlcnQodHlwZXMuaXNBcnJheU9mKFsnZm9vJywgJ2JhcicsICdiYXonXSwgdHlwZXMuaXNTdHJpbmcpKTtcblxuXHRcdC8vIFZhbGlkIG51bWJlciBhcnJheXNcblx0XHRhc3NlcnQodHlwZXMuaXNBcnJheU9mKFtdLCB0eXBlcy5pc051bWJlcikpO1xuXHRcdGFzc2VydCh0eXBlcy5pc0FycmF5T2YoWzFdLCB0eXBlcy5pc051bWJlcikpO1xuXHRcdGFzc2VydCh0eXBlcy5pc0FycmF5T2YoWzEsIDIsIDNdLCB0eXBlcy5pc051bWJlcikpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNBcnJheU9mKFsxLCAyLCAnMyddLCB0eXBlcy5pc051bWJlcikpO1xuXG5cdFx0Ly8gVmFsaWQgYm9vbGVhbiBhcnJheXNcblx0XHRhc3NlcnQodHlwZXMuaXNBcnJheU9mKFtdLCB0eXBlcy5pc0Jvb2xlYW4pKTtcblx0XHRhc3NlcnQodHlwZXMuaXNBcnJheU9mKFt0cnVlXSwgdHlwZXMuaXNCb29sZWFuKSk7XG5cdFx0YXNzZXJ0KHR5cGVzLmlzQXJyYXlPZihbdHJ1ZSwgZmFsc2UsIHRydWVdLCB0eXBlcy5pc0Jvb2xlYW4pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzQXJyYXlPZihbdHJ1ZSwgMSwgZmFsc2VdLCB0eXBlcy5pc0Jvb2xlYW4pKTtcblxuXHRcdC8vIFZhbGlkIGZ1bmN0aW9uIGFycmF5c1xuXHRcdGFzc2VydCh0eXBlcy5pc0FycmF5T2YoW10sIHR5cGVzLmlzRnVuY3Rpb24pKTtcblx0XHRhc3NlcnQodHlwZXMuaXNBcnJheU9mKFthc3NlcnRdLCB0eXBlcy5pc0Z1bmN0aW9uKSk7XG5cdFx0YXNzZXJ0KHR5cGVzLmlzQXJyYXlPZihbYXNzZXJ0LCBmdW5jdGlvbiBmb28oKSB7IC8qKi8gfV0sIHR5cGVzLmlzRnVuY3Rpb24pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzQXJyYXlPZihbYXNzZXJ0LCAnZm9vJ10sIHR5cGVzLmlzRnVuY3Rpb24pKTtcblxuXHRcdC8vIEN1c3RvbSB0eXBlIGd1YXJkXG5cdFx0Y29uc3QgaXNFdmVuID0gKG46IHVua25vd24pOiBuIGlzIG51bWJlciA9PiB0eXBlcy5pc051bWJlcihuKSAmJiBuICUgMiA9PT0gMDtcblx0XHRhc3NlcnQodHlwZXMuaXNBcnJheU9mKFtdLCBpc0V2ZW4pKTtcblx0XHRhc3NlcnQodHlwZXMuaXNBcnJheU9mKFsyLCA0LCA2XSwgaXNFdmVuKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc0FycmF5T2YoWzIsIDMsIDRdLCBpc0V2ZW4pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzQXJyYXlPZihbMSwgMywgNV0sIGlzRXZlbikpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc051bWJlcicsICgpID0+IHtcblx0XHRhc3NlcnQoIXR5cGVzLmlzTnVtYmVyKHVuZGVmaW5lZCkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNOdW1iZXIobnVsbCkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNOdW1iZXIoJ2ZvbycpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzTnVtYmVyKFtdKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc051bWJlcihbMSwgMiwgJzMnXSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNOdW1iZXIodHJ1ZSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNOdW1iZXIoe30pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzTnVtYmVyKC90ZXN0LykpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNOdW1iZXIobmV3IFJlZ0V4cCgnJykpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzTnVtYmVyKG5ldyBEYXRlKCkpKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzTnVtYmVyKGFzc2VydCkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNOdW1iZXIoZnVuY3Rpb24gZm9vKCkgeyAvKiovIH0pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzTnVtYmVyKHsgZm9vOiAnYmFyJyB9KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc051bWJlcihwYXJzZUludCgnQScsIDEwKSkpO1xuXG5cdFx0YXNzZXJ0KHR5cGVzLmlzTnVtYmVyKDUpKTtcblx0fSk7XG5cblx0dGVzdCgnaXNVbmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1VuZGVmaW5lZChudWxsKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1VuZGVmaW5lZCgnZm9vJykpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWQoW10pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzVW5kZWZpbmVkKFsxLCAyLCAnMyddKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1VuZGVmaW5lZCh0cnVlKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1VuZGVmaW5lZCh7fSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWQoL3Rlc3QvKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1VuZGVmaW5lZChuZXcgUmVnRXhwKCcnKSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWQobmV3IERhdGUoKSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWQoYXNzZXJ0KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1VuZGVmaW5lZChmdW5jdGlvbiBmb28oKSB7IC8qKi8gfSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWQoeyBmb286ICdiYXInIH0pKTtcblxuXHRcdGFzc2VydCh0eXBlcy5pc1VuZGVmaW5lZCh1bmRlZmluZWQpKTtcblx0fSk7XG5cblx0dGVzdCgnaXNVbmRlZmluZWRPck51bGwnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1VuZGVmaW5lZE9yTnVsbCgnZm9vJykpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWRPck51bGwoW10pKTtcblx0XHRhc3NlcnQoIXR5cGVzLmlzVW5kZWZpbmVkT3JOdWxsKFsxLCAyLCAnMyddKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1VuZGVmaW5lZE9yTnVsbCh0cnVlKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1VuZGVmaW5lZE9yTnVsbCh7fSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWRPck51bGwoL3Rlc3QvKSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1VuZGVmaW5lZE9yTnVsbChuZXcgUmVnRXhwKCcnKSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWRPck51bGwobmV3IERhdGUoKSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWRPck51bGwoYXNzZXJ0KSk7XG5cdFx0YXNzZXJ0KCF0eXBlcy5pc1VuZGVmaW5lZE9yTnVsbChmdW5jdGlvbiBmb28oKSB7IC8qKi8gfSkpO1xuXHRcdGFzc2VydCghdHlwZXMuaXNVbmRlZmluZWRPck51bGwoeyBmb286ICdiYXInIH0pKTtcblxuXHRcdGFzc2VydCh0eXBlcy5pc1VuZGVmaW5lZE9yTnVsbCh1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQodHlwZXMuaXNVbmRlZmluZWRPck51bGwobnVsbCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdhc3NlcnRJc0RlZmluZWQgLyBhc3NlcnRBcmVEZWZpbmVkJywgKCkgPT4ge1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gdHlwZXMuYXNzZXJ0UmV0dXJuc0RlZmluZWQodW5kZWZpbmVkKSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB0eXBlcy5hc3NlcnRSZXR1cm5zRGVmaW5lZChudWxsKSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB0eXBlcy5hc3NlcnRSZXR1cm5zQWxsRGVmaW5lZChudWxsLCB1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHR5cGVzLmFzc2VydFJldHVybnNBbGxEZWZpbmVkKHRydWUsIHVuZGVmaW5lZCkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gdHlwZXMuYXNzZXJ0UmV0dXJuc0FsbERlZmluZWQodW5kZWZpbmVkLCBmYWxzZSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVzLmFzc2VydFJldHVybnNEZWZpbmVkKHRydWUpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZXMuYXNzZXJ0UmV0dXJuc0RlZmluZWQoZmFsc2UpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVzLmFzc2VydFJldHVybnNEZWZpbmVkKCdIZWxsbycpLCAnSGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZXMuYXNzZXJ0UmV0dXJuc0RlZmluZWQoJycpLCAnJyk7XG5cblx0XHRjb25zdCByZXMgPSB0eXBlcy5hc3NlcnRSZXR1cm5zQWxsRGVmaW5lZCgxLCB0cnVlLCAnSGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCAnSGVsbG8nKTtcblx0fSk7XG5cblx0c3VpdGUoJ2Fzc2VydERlZmluZWQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIG5vdCB0aHJvdyBpZiBgdmFsdWVgIGlzIGRlZmluZWQgKGJvb2wpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdyhmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGFzc2VydERlZmluZWQodHJ1ZSwgJ09vcHMgc29tZXRoaW5nIGhhcHBlbmVkLicpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHRocm93IGlmIGB2YWx1ZWAgaXMgZGVmaW5lZCAobnVtYmVyKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGFzc2VydC5kb2VzTm90VGhyb3coZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRhc3NlcnREZWZpbmVkKDUsICdPb3BzIHNvbWV0aGluZyBoYXBwZW5lZC4nKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCB0aHJvdyBpZiBgdmFsdWVgIGlzIGRlZmluZWQgKHplcm8pJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdyhmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGFzc2VydERlZmluZWQoMCwgJ09vcHMgc29tZXRoaW5nIGhhcHBlbmVkLicpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHRocm93IGlmIGB2YWx1ZWAgaXMgZGVmaW5lZCAoc3RyaW5nKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGFzc2VydC5kb2VzTm90VGhyb3coZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRhc3NlcnREZWZpbmVkKCdzb21lIHN0cmluZycsICdPb3BzIHNvbWV0aGluZyBoYXBwZW5lZC4nKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCB0aHJvdyBpZiBgdmFsdWVgIGlzIGRlZmluZWQgKGVtcHR5IHN0cmluZyknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0YXNzZXJ0RGVmaW5lZCgnJywgJ09vcHMgc29tZXRoaW5nIGhhcHBlbmVkLicpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHQvKipcblx0XHQgKiBOb3RlISBBUEkgb2YgYGFzc2VydC50aHJvd3MoKWAgaXMgZGlmZmVyZW50IGluIHRoZSBicm93c2VyXG5cdFx0ICogYW5kIGluIE5vZGUuanMsIGFuZCBpdCBpcyBub3QgcG9zc2libGUgdG8gdXNlIHRoZSBzYW1lIGNvZGVcblx0XHQgKiBoZXJlLiBUaGVyZWZvcmUgd2UgaGFkIHRvIHJlc29ydCB0byB0aGUgbWFudWFsIHRyeS9jYXRjaC5cblx0XHQgKi9cblx0XHRjb25zdCBhc3NlcnRUaHJvd3MgPSAoXG5cdFx0XHR0ZXN0RnVuY3Rpb246ICgpID0+IHZvaWQsXG5cdFx0XHRlcnJvck1lc3NhZ2U6IHN0cmluZyxcblx0XHQpID0+IHtcblx0XHRcdGxldCB0aHJvd25FcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRlc3RGdW5jdGlvbigpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aHJvd25FcnJvciA9IGUgYXMgRXJyb3I7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydERlZmluZWQodGhyb3duRXJyb3IsICdNdXN0IHRocm93IGFuIGVycm9yLicpO1xuXHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHR0aHJvd25FcnJvciBpbnN0YW5jZW9mIEVycm9yLFxuXHRcdFx0XHQnRXJyb3IgbXVzdCBiZSBhbiBpbnN0YW5jZSBvZiBgRXJyb3JgLicsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHRocm93bkVycm9yLm1lc3NhZ2UsXG5cdFx0XHRcdGVycm9yTWVzc2FnZSxcblx0XHRcdFx0J0Vycm9yIG11c3QgaGF2ZSBjb3JyZWN0IG1lc3NhZ2UuJyxcblx0XHRcdCk7XG5cdFx0fTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0aHJvdyBpZiBgdmFsdWVgIGlzIGBudWxsYCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGVycm9yTWVzc2FnZSA9ICdVZ2doIG9oaCEnO1xuXHRcdFx0YXNzZXJ0VGhyb3dzKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0RGVmaW5lZChudWxsLCBlcnJvck1lc3NhZ2UpO1xuXHRcdFx0fSwgZXJyb3JNZXNzYWdlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0aHJvdyBpZiBgdmFsdWVgIGlzIGB1bmRlZmluZWRgJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gJ09oIG5vISc7XG5cdFx0XHRhc3NlcnRUaHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnREZWZpbmVkKHVuZGVmaW5lZCwgbmV3IEVycm9yKGVycm9yTWVzc2FnZSkpO1xuXHRcdFx0fSwgZXJyb3JNZXNzYWdlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0aHJvdyBhc3NlcnRpb24gZXJyb3IgYnkgZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGVycm9yTWVzc2FnZSA9ICdVZ2doIG9oaCEnO1xuXHRcdFx0bGV0IHRocm93bkVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFzc2VydERlZmluZWQobnVsbCwgZXJyb3JNZXNzYWdlKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhyb3duRXJyb3IgPSBlIGFzIEVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnREZWZpbmVkKHRocm93bkVycm9yLCAnTXVzdCB0aHJvdyBhbiBlcnJvci4nKTtcblxuXHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHR0aHJvd25FcnJvciBpbnN0YW5jZW9mIEVycm9yLFxuXHRcdFx0XHQnRXJyb3IgbXVzdCBiZSBhbiBpbnN0YW5jZSBvZiBgRXJyb3JgLicsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHRocm93bkVycm9yLm1lc3NhZ2UsXG5cdFx0XHRcdGVycm9yTWVzc2FnZSxcblx0XHRcdFx0J0Vycm9yIG11c3QgaGF2ZSBjb3JyZWN0IG1lc3NhZ2UuJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdGhyb3cgcHJvdmlkZWQgZXJyb3IgaW5zdGFuY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjbGFzcyBUZXN0RXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKC4uLmFyZ3M6IENvbnN0cnVjdG9yUGFyYW1ldGVyczx0eXBlb2YgRXJyb3I+KSB7XG5cdFx0XHRcdFx0c3VwZXIoLi4uYXJncyk7XG5cblx0XHRcdFx0XHR0aGlzLm5hbWUgPSAnVGVzdEVycm9yJztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSAnT29wcyBzb21ldGhpbmcgaGFwZW5uZWQuJztcblx0XHRcdGNvbnN0IGVycm9yID0gbmV3IFRlc3RFcnJvcihlcnJvck1lc3NhZ2UpO1xuXG5cdFx0XHRsZXQgdGhyb3duRXJyb3I7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhc3NlcnREZWZpbmVkKG51bGwsIGVycm9yKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhyb3duRXJyb3IgPSBlO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQoXG5cdFx0XHRcdHRocm93bkVycm9yIGluc3RhbmNlb2YgVGVzdEVycm9yLFxuXHRcdFx0XHQnRXJyb3IgbXVzdCBiZSBhbiBpbnN0YW5jZSBvZiBgVGVzdEVycm9yYC4nLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0dGhyb3duRXJyb3IubWVzc2FnZSxcblx0XHRcdFx0ZXJyb3JNZXNzYWdlLFxuXHRcdFx0XHQnRXJyb3IgbXVzdCBoYXZlIGNvcnJlY3QgbWVzc2FnZS4nLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2lzT25lT2YnLCAoKSA9PiB7XG5cdFx0c3VpdGUoJ3N1Y2Nlc3MnLCAoKSA9PiB7XG5cdFx0XHRzdWl0ZSgnc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0KCd0eXBlJywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKCdmb28nLCBbJ2ZvbycsICdiYXInXSksXG5cdFx0XHRcdFx0XHRcdCdGb28gbXVzdCBiZSBvbmUgb2Y6IGZvbywgYmFyJyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ3N1YnR5cGUnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiBzdHJpbmcgPSAnaGknO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogKCdoaScgfCAnY2lhbycgfCAnaG9sYScpW10gPSBbJ2hpJywgJ2NpYW8nXTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHQnSGkgbXVzdCBiZSBvbmUgb2Y6IGhpLCBjaWFvJyxcblx0XHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHRcdHR5cGVDaGVjazwnaGknIHwgJ2NpYW8nIHwgJ2hvbGEnPihpdGVtKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0c3VpdGUoJ251bWJlcicsICgpID0+IHtcblx0XHRcdFx0dGVzdCgndHlwZScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHtcblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZigxMCwgWzEwLCAxMDBdKSxcblx0XHRcdFx0XHRcdFx0JzEwIG11c3QgYmUgb25lIG9mOiAxMCwgMTAwJ1xuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnc3VidHlwZScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06IG51bWJlciA9IDIwO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogKDIwIHwgMjAwMClbXSA9IFsyMCwgMjAwMF07XG5cblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihpdGVtLCBsaXN0KSxcblx0XHRcdFx0XHRcdFx0JzIwIG11c3QgYmUgb25lIG9mOiAyMCwgMjAwMCcsXG5cdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0XHR0eXBlQ2hlY2s8MjAgfCAyMDAwPihpdGVtKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdH0pO1xuXG5cdFx0XHRzdWl0ZSgnYm9vbGVhbicsICgpID0+IHtcblx0XHRcdFx0dGVzdCgndHlwZScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHtcblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZih0cnVlLCBbdHJ1ZSwgZmFsc2VdKSxcblx0XHRcdFx0XHRcdFx0J3RydWUgbXVzdCBiZSBvbmUgb2Y6IHRydWUsIGZhbHNlJ1xuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGZhbHNlLCBbdHJ1ZSwgZmFsc2VdKSxcblx0XHRcdFx0XHRcdFx0J2ZhbHNlIG11c3QgYmUgb25lIG9mOiB0cnVlLCBmYWxzZSdcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ3N1YnR5cGUgKHRydWUpJywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXRlbTogYm9vbGVhbiA9IHRydWU7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0OiAodHJ1ZSlbXSA9IFt0cnVlLCB0cnVlXTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHQndHJ1ZSBtdXN0IGJlIG9uZSBvZjogdHJ1ZSwgdHJ1ZScsXG5cdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0XHR0eXBlQ2hlY2s8dHJ1ZT4oaXRlbSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ3N1YnR5cGUgKGZhbHNlKScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3Q6IChmYWxzZSB8IHRydWUpW10gPSBbZmFsc2UsIHRydWVdO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoaXRlbSwgbGlzdCksXG5cdFx0XHRcdFx0XHRcdCdmYWxzZSBtdXN0IGJlIG9uZSBvZjogZmFsc2UsIHRydWUnLFxuXHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdFx0dHlwZUNoZWNrPGZhbHNlPihpdGVtKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0c3VpdGUoJ3VuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdFx0dGVzdCgndHlwZScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHtcblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZih1bmRlZmluZWQsIFt1bmRlZmluZWRdKSxcblx0XHRcdFx0XHRcdFx0J3VuZGVmaW5lZCBtdXN0IGJlIG9uZSBvZjogdW5kZWZpbmVkJ1xuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKHVuZGVmaW5lZCwgW3ZvaWQgMF0pLFxuXHRcdFx0XHRcdFx0XHQndW5kZWZpbmVkIG11c3QgYmUgb25lIG9mOiB2b2lkIDAnXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0ZXN0KCdzdWJ0eXBlJywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4ge1xuXHRcdFx0XHRcdFx0bGV0IGl0ZW06IHVuZGVmaW5lZCB8IG51bGw7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0OiAodW5kZWZpbmVkKVtdID0gW3VuZGVmaW5lZF07XG5cblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihpdGVtLCBsaXN0KSxcblx0XHRcdFx0XHRcdFx0J3VuZGVmaW5lZCB8IG51bGwgbXVzdCBiZSBvbmUgb2Y6IHVuZGVmaW5lZCcsXG5cdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0XHR0eXBlQ2hlY2s8dW5kZWZpbmVkPihpdGVtKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0c3VpdGUoJ251bGwnLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ3R5cGUnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiB7XG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YobnVsbCwgW251bGxdKSxcblx0XHRcdFx0XHRcdFx0J251bGwgbXVzdCBiZSBvbmUgb2Y6IG51bGwnXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0ZXN0KCdzdWJ0eXBlJywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXRlbTogdW5kZWZpbmVkIHwgbnVsbCB8IHN0cmluZyA9IG51bGw7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0OiAobnVsbClbXSA9IFtudWxsXTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHQnbnVsbCBtdXN0IGJlIG9uZSBvZjogbnVsbCcsXG5cdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0XHR0eXBlQ2hlY2s8bnVsbD4oaXRlbSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHN1aXRlKCdhbnknLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ2l0ZW0nLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiBhbnkgPSAnMSc7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0OiAoJzEnIHwgJzInKVtdID0gWycyJywgJzEnXTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHQnMSBtdXN0IGJlIG9uZSBvZjogMiwgMScsXG5cdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0XHR0eXBlQ2hlY2s8JzEnIHwgJzInPihpdGVtKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnbGlzdCcsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06ICc1JyA9ICc1Jztcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3Q6IGFueVtdID0gWyczJywgJzUnLCAnMi41J107XG5cblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihpdGVtLCBsaXN0KSxcblx0XHRcdFx0XHRcdFx0JzUgbXVzdCBiZSBvbmUgb2Y6IDMsIDUsIDIuNScsXG5cdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0XHR0eXBlQ2hlY2s8JzUnPihpdGVtKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnYm90aCcsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06IGFueSA9ICcxMic7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0OiBhbnlbXSA9IFsnMTQuMjUnLCAnNycsICcxMiddO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoaXRlbSwgbGlzdCksXG5cdFx0XHRcdFx0XHRcdCcxMiBtdXN0IGJlIG9uZSBvZjogMTQuMjUsIDcsIDEyJyxcblx0XHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHRcdHR5cGVDaGVjazxhbnk+KGl0ZW0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRzdWl0ZSgndW5rbm93bicsICgpID0+IHtcblx0XHRcdFx0dGVzdCgnaXRlbScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06IHVua25vd24gPSAnMSc7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0OiAoJzEnIHwgJzInKVtdID0gWycyJywgJzEnXTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHQnMSBtdXN0IGJlIG9uZSBvZjogMiwgMScsXG5cdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0XHR0eXBlQ2hlY2s8JzEnIHwgJzInPihpdGVtKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnYm90aCcsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06IHVua25vd24gPSAnMTInO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogdW5rbm93bltdID0gWycxNC4yNScsICc3JywgJzEyJ107XG5cblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihpdGVtLCBsaXN0KSxcblx0XHRcdFx0XHRcdFx0JzEyIG11c3QgYmUgb25lIG9mOiAxNC4yNSwgNywgMTInLFxuXHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdFx0dHlwZUNoZWNrPHVua25vd24+KGl0ZW0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2ZhaWx1cmUnLCAoKSA9PiB7XG5cdFx0XHRzdWl0ZSgnc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0KCd0eXBlJywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXRlbTogc3RyaW5nID0gJ2Jheic7XG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoaXRlbSwgWydmb28nLCAnYmFyJ10pLFxuXHRcdFx0XHRcdFx0XHQnQmF6IG11c3Qgbm90IGJlIG9uZSBvZjogZm9vLCBiYXInLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnc3VidHlwZScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06IHN0cmluZyA9ICd2aXRhbm5pYSc7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0OiAoJ2hpJyB8ICdjaWFvJyB8ICdob2xhJylbXSA9IFsnaGknLCAnY2lhbyddO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoaXRlbSwgbGlzdCksXG5cdFx0XHRcdFx0XHRcdCd2aXRhbm5pYSBtdXN0IGJlIG9uZSBvZjogaGksIGNpYW8nLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnZW1wdHknLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiBzdHJpbmcgPSAndml0YW5uaWEnO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogKCdoaScgfCAnY2lhbycgfCAnaG9sYScpW10gPSBbXTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHQndml0YW5uaWEgbXVzdCBiZSBvbmUgb2Y6IGVtcHR5Jyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHN1aXRlKCdudW1iZXInLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ3R5cGUnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoMTksIFsxMCwgMTAwXSksXG5cdFx0XHRcdFx0XHRcdCcxOSBtdXN0IG5vdCBiZSBvbmUgb2Y6IDEwLCAxMDAnLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnc3VidHlwZScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06IG51bWJlciA9IDI0O1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogKDIwIHwgMjAwMClbXSA9IFsyMCwgMjAwMF07XG5cblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihpdGVtLCBsaXN0KSxcblx0XHRcdFx0XHRcdFx0JzI0IG11c3Qgbm90IGJlIG9uZSBvZjogMjAsIDIwMDAnLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnZW1wdHknLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiBudW1iZXIgPSAyMDtcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3Q6ICgyMCB8IDIwMDApW10gPSBbXTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHQnMjAgbXVzdCBub3QgYmUgb25lIG9mOiBlbXB0eScsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRzdWl0ZSgnYm9vbGVhbicsICgpID0+IHtcblx0XHRcdFx0dGVzdCgndHlwZScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZih0cnVlLCBbZmFsc2VdKSxcblx0XHRcdFx0XHRcdFx0J3RydWUgbXVzdCBub3QgYmUgb25lIG9mOiBmYWxzZScsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoZmFsc2UsIFt0cnVlXSksXG5cdFx0XHRcdFx0XHRcdCdmYWxzZSBtdXN0IG5vdCBiZSBvbmUgb2Y6IHRydWUnLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnc3VidHlwZSAodHJ1ZSknLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiBib29sZWFuID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3Q6ICh0cnVlIHwgZmFsc2UpW10gPSBbZmFsc2VdO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoaXRlbSwgbGlzdCksXG5cdFx0XHRcdFx0XHRcdCd0cnVlIG11c3Qgbm90IGJlIG9uZSBvZjogZmFsc2UnLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnc3VidHlwZSAoZmFsc2UpJywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXRlbTogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogKGZhbHNlIHwgdHJ1ZSlbXSA9IFt0cnVlLCB0cnVlLCB0cnVlXTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHQnZmFsc2UgbXVzdCBiZSBvbmUgb2Y6IHRydWUsIHRydWUsIHRydWUnLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnZW1wdHknLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiBib29sZWFuID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3Q6IChmYWxzZSB8IHRydWUpW10gPSBbXTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHQndHJ1ZSBtdXN0IGJlIG9uZSBvZjogZW1wdHknLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0c3VpdGUoJ3VuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdFx0dGVzdCgndHlwZScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZih1bmRlZmluZWQsIFtdKSxcblx0XHRcdFx0XHRcdFx0J3VuZGVmaW5lZCBtdXN0IG5vdCBiZSBvbmUgb2Y6IGVtcHR5Jyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZih2b2lkIDAsIFtdKSxcblx0XHRcdFx0XHRcdFx0J3ZvaWQgMCBtdXN0IG5vdCBiZSBvbmUgb2Y6IGVtcHR5Jyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ3N1YnR5cGUnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRsZXQgaXRlbTogdW5kZWZpbmVkIHwgbnVsbDtcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3Q6ICh1bmRlZmluZWQgfCBudWxsKVtdID0gW251bGxdO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoaXRlbSwgbGlzdCksXG5cdFx0XHRcdFx0XHRcdCd1bmRlZmluZWQgbXVzdCBiZSBvbmUgb2Y6IG51bGwnLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnZW1wdHknLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRsZXQgaXRlbTogdW5kZWZpbmVkIHwgbnVsbDtcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3Q6ICh1bmRlZmluZWQgfCBudWxsKVtdID0gW107XG5cblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihpdGVtLCBsaXN0KSxcblx0XHRcdFx0XHRcdFx0J3VuZGVmaW5lZCBtdXN0IGJlIG9uZSBvZjogZW1wdHknLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0c3VpdGUoJ251bGwnLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ3R5cGUnLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YobnVsbCwgW10pLFxuXHRcdFx0XHRcdFx0XHQnbnVsbCBtdXN0IGJlIG9uZSBvZjogZW1wdHknLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnc3VidHlwZScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06IHVuZGVmaW5lZCB8IG51bGwgfCBzdHJpbmcgPSBudWxsO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogbnVsbFtdID0gW107XG5cblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihpdGVtLCBsaXN0KSxcblx0XHRcdFx0XHRcdFx0J251bGwgbXVzdCBiZSBvbmUgb2Y6IGVtcHR5Jyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHN1aXRlKCdhbnknLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ2l0ZW0nLCAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiBhbnkgPSAnMSc7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0OiAoJzEnIHwgJzInIHwgJzMnIHwgJzQnKVtdID0gWyczJywgJzQnXTtcblxuXHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRpc09uZU9mKGl0ZW0sIGxpc3QpLFxuXHRcdFx0XHRcdFx0XHQnMSBtdXN0IG5vdCBiZSBvbmUgb2Y6IDMsIDQnLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnbGlzdCcsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06ICc1JyA9ICc1Jztcblx0XHRcdFx0XHRcdGNvbnN0IGxpc3Q6IGFueVtdID0gWyczJywgJzYnLCAnMi41J107XG5cblx0XHRcdFx0XHRcdGFzc2VydChcblx0XHRcdFx0XHRcdFx0aXNPbmVPZihpdGVtLCBsaXN0KSxcblx0XHRcdFx0XHRcdFx0JzUgbXVzdCBub3QgYmUgb25lIG9mOiAzLCA2LCAyLjUnLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnYm90aCcsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06IGFueSA9ICcxMic7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0OiBhbnlbXSA9IFsnMTQuMjUnLCAnNycsICcxNSddO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoaXRlbSwgbGlzdCksXG5cdFx0XHRcdFx0XHRcdCcxMiBtdXN0IG5vdCBiZSBvbmUgb2Y6IDE0LjI1LCA3LCAxNScsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0ZXN0KCdlbXB0eScsICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06IGFueSA9ICcyNSc7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0OiBhbnlbXSA9IFtdO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoaXRlbSwgbGlzdCksXG5cdFx0XHRcdFx0XHRcdCcyNSBtdXN0IG5vdCBiZSBvbmUgb2Y6IGVtcHR5Jyxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHN1aXRlKCd1bmtub3duJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0KCdpdGVtJywgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXRlbTogdW5rbm93biA9ICcxMDAnO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogKCcxMScgfCAnMTInKVtdID0gWycxMicsICcxMSddO1xuXG5cdFx0XHRcdFx0XHRhc3NlcnQoXG5cdFx0XHRcdFx0XHRcdGlzT25lT2YoaXRlbSwgbGlzdCksXG5cdFx0XHRcdFx0XHRcdCcxMDAgbXVzdCBub3QgYmUgb25lIG9mOiAxMiwgMTEnLFxuXHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0dGVzdCgnYm90aCcsICgpID0+IHtcblx0XHRcdFx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBpdGVtOiB1bmtub3duID0gJzIxJztcblx0XHRcdFx0XHRcdFx0Y29uc3QgbGlzdDogdW5rbm93bltdID0gWycxNC4yNScsICc3JywgJzEyJ107XG5cblx0XHRcdFx0XHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRcdFx0XHRcdGlzT25lT2YoaXRlbSwgbGlzdCksXG5cdFx0XHRcdFx0XHRcdFx0JzIxIG11c3Qgbm90IGJlIG9uZSBvZjogMTQuMjUsIDcsIDEyJyxcblx0XHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ZhbGlkYXRlQ29uc3RyYWludHMnLCAoKSA9PiB7XG5cdFx0dHlwZXMudmFsaWRhdGVDb25zdHJhaW50cyhbMSwgJ3Rlc3QnLCB0cnVlXSwgW051bWJlciwgU3RyaW5nLCBCb29sZWFuXSk7XG5cdFx0dHlwZXMudmFsaWRhdGVDb25zdHJhaW50cyhbMSwgJ3Rlc3QnLCB0cnVlXSwgWydudW1iZXInLCAnc3RyaW5nJywgJ2Jvb2xlYW4nXSk7XG5cdFx0dHlwZXMudmFsaWRhdGVDb25zdHJhaW50cyhbY29uc29sZS5sb2ddLCBbRnVuY3Rpb25dKTtcblx0XHR0eXBlcy52YWxpZGF0ZUNvbnN0cmFpbnRzKFt1bmRlZmluZWRdLCBbdHlwZXMuaXNVbmRlZmluZWRdKTtcblx0XHR0eXBlcy52YWxpZGF0ZUNvbnN0cmFpbnRzKFsxXSwgW3R5cGVzLmlzTnVtYmVyXSk7XG5cblx0XHRjbGFzcyBGb28geyB9XG5cdFx0dHlwZXMudmFsaWRhdGVDb25zdHJhaW50cyhbbmV3IEZvbygpXSwgW0Zvb10pO1xuXG5cdFx0ZnVuY3Rpb24gaXNGb28oZjogYW55KSB7IH1cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHR5cGVzLnZhbGlkYXRlQ29uc3RyYWludHMoW25ldyBGb28oKV0sIFtpc0Zvb10pKTtcblxuXHRcdGZ1bmN0aW9uIGlzRm9vMihmOiBhbnkpIHsgcmV0dXJuIHRydWU7IH1cblx0XHR0eXBlcy52YWxpZGF0ZUNvbnN0cmFpbnRzKFtuZXcgRm9vKCldLCBbaXNGb28yXSk7XG5cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHR5cGVzLnZhbGlkYXRlQ29uc3RyYWludHMoWzEsIHRydWVdLCBbdHlwZXMuaXNOdW1iZXIsIHR5cGVzLmlzU3RyaW5nXSkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gdHlwZXMudmFsaWRhdGVDb25zdHJhaW50cyhbJzInXSwgW3R5cGVzLmlzTnVtYmVyXSkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gdHlwZXMudmFsaWRhdGVDb25zdHJhaW50cyhbMSwgJ3Rlc3QnLCB0cnVlXSwgW051bWJlciwgU3RyaW5nLCBOdW1iZXJdKSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdoYXNLZXknLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB0cnVlIHdoZW4gb2JqZWN0IGhhcyBzcGVjaWZpZWQga2V5JywgKCkgPT4ge1xuXHRcdFx0dHlwZSBBID0geyBhOiBzdHJpbmcgfTtcblx0XHRcdHR5cGUgQiA9IHsgYjogbnVtYmVyIH07XG5cdFx0XHRjb25zdCBvYmo6IEEgfCBCID0geyBhOiAndGVzdCcgfTtcblxuXHRcdFx0YXNzZXJ0KHR5cGVzLmhhc0tleShvYmosIHsgYTogdHJ1ZSB9KSk7XG5cdFx0XHQvLyBBZnRlciB0aGlzIGNoZWNrLCBUeXBlU2NyaXB0IGtub3dzIG9iaiBpcyB0eXBlIEFcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvYmouYSwgJ3Rlc3QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gZmFsc2Ugd2hlbiBvYmplY3QgZG9lcyBub3QgaGF2ZSBzcGVjaWZpZWQga2V5JywgKCkgPT4ge1xuXHRcdFx0dHlwZSBBID0geyBhOiBzdHJpbmcgfTtcblx0XHRcdHR5cGUgQiA9IHsgYjogbnVtYmVyIH07XG5cdFx0XHRjb25zdCBvYmo6IEEgfCBCID0geyBiOiA0MiB9O1xuXG5cdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0XHRhc3NlcnQoIXR5cGVzLmhhc0tleShvYmosIHsgYTogdHJ1ZSB9KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgd29yayB3aXRoIG11bHRpcGxlIGtleXMnLCAoKSA9PiB7XG5cdFx0XHR0eXBlIEEgPSB7IGE6IHN0cmluZzsgYjogbnVtYmVyIH07XG5cdFx0XHR0eXBlIEIgPSB7IGM6IGJvb2xlYW4gfTtcblx0XHRcdGNvbnN0IG9iajogQSB8IEIgPSB7IGE6ICd0ZXN0JywgYjogNDIgfTtcblxuXHRcdFx0YXNzZXJ0KHR5cGVzLmhhc0tleShvYmosIHsgYTogdHJ1ZSwgYjogdHJ1ZSB9KSk7XG5cdFx0XHQvLyBBZnRlciB0aGlzIGNoZWNrLCBUeXBlU2NyaXB0IGtub3dzIG9iaiBpcyB0eXBlIEFcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvYmouYSwgJ3Rlc3QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvYmouYiwgNDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBmYWxzZSBpZiBhbnkga2V5IGlzIG1pc3NpbmcnLCAoKSA9PiB7XG5cdFx0XHR0eXBlIEEgPSB7IGE6IHN0cmluZzsgYjogbnVtYmVyIH07XG5cdFx0XHR0eXBlIEIgPSB7IGE6IHN0cmluZyB9O1xuXHRcdFx0Y29uc3Qgb2JqOiBBIHwgQiA9IHsgYTogJ3Rlc3QnIH07XG5cblx0XHRcdGFzc2VydCghdHlwZXMuaGFzS2V5KG9iaiwgeyBhOiB0cnVlLCBiOiB0cnVlIH0pKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB3b3JrIHdpdGggZW1wdHkga2V5IG9iamVjdCcsICgpID0+IHtcblx0XHRcdHR5cGUgQSA9IHsgYTogc3RyaW5nIH07XG5cdFx0XHR0eXBlIEIgPSB7IGI6IG51bWJlciB9O1xuXHRcdFx0Y29uc3Qgb2JqOiBBIHwgQiA9IHsgYTogJ3Rlc3QnIH07XG5cblx0XHRcdC8vIEVtcHR5IGtleSBvYmplY3Qgc2hvdWxkIHJldHVybiB0cnVlIChhbGwgemVybyBrZXlzIGV4aXN0KVxuXHRcdFx0YXNzZXJ0KHR5cGVzLmhhc0tleShvYmosIHt9KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgd29yayB3aXRoIGNvbXBsZXggdW5pb24gdHlwZXMnLCAoKSA9PiB7XG5cdFx0XHR0eXBlIFR5cGVBID0geyBraW5kOiAnYSc7IHZhbHVlOiBzdHJpbmcgfTtcblx0XHRcdHR5cGUgVHlwZUIgPSB7IGtpbmQ6ICdiJzsgY291bnQ6IG51bWJlciB9O1xuXHRcdFx0dHlwZSBUeXBlQyA9IHsga2luZDogJ2MnOyBpdGVtczogc3RyaW5nW10gfTtcblxuXHRcdFx0Y29uc3Qgb2JqQTogVHlwZUEgfCBUeXBlQiB8IFR5cGVDID0geyBraW5kOiAnYScsIHZhbHVlOiAnaGVsbG8nIH07XG5cdFx0XHRjb25zdCBvYmpCOiBUeXBlQSB8IFR5cGVCIHwgVHlwZUMgPSB7IGtpbmQ6ICdiJywgY291bnQ6IDUgfTtcblxuXHRcdFx0YXNzZXJ0KHR5cGVzLmhhc0tleShvYmpBLCB7IHZhbHVlOiB0cnVlIH0pKTtcblx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0XHRcdGFzc2VydCghdHlwZXMuaGFzS2V5KG9iakEsIHsgY291bnQ6IHRydWUgfSkpO1xuXHRcdFx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRcdFx0YXNzZXJ0KCF0eXBlcy5oYXNLZXkob2JqQSwgeyBpdGVtczogdHJ1ZSB9KSk7XG5cblx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0XHRcdGFzc2VydCghdHlwZXMuaGFzS2V5KG9iakIsIHsgdmFsdWU6IHRydWUgfSkpO1xuXHRcdFx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRcdFx0YXNzZXJ0KHR5cGVzLmhhc0tleShvYmpCLCB7IGNvdW50OiB0cnVlIH0pKTtcblx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0XHRcdGFzc2VydCghdHlwZXMuaGFzS2V5KG9iakIsIHsgaXRlbXM6IHRydWUgfSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBvYmplY3RzIHdpdGggb3B0aW9uYWwgcHJvcGVydGllcycsICgpID0+IHtcblx0XHRcdHR5cGUgQSA9IHsgYTogc3RyaW5nOyBiPzogbnVtYmVyIH07XG5cdFx0XHR0eXBlIEIgPSB7IGM6IGJvb2xlYW4gfTtcblx0XHRcdGNvbnN0IG9iajE6IEEgfCBCID0geyBhOiAndGVzdCcsIGI6IDQyIH07XG5cdFx0XHRjb25zdCBvYmoyOiBBIHwgQiA9IHsgYTogJ3Rlc3QnIH07XG5cblx0XHRcdGFzc2VydCh0eXBlcy5oYXNLZXkob2JqMSwgeyBhOiB0cnVlIH0pKTtcblx0XHRcdGFzc2VydCh0eXBlcy5oYXNLZXkob2JqMSwgeyBiOiB0cnVlIH0pKTtcblxuXHRcdFx0YXNzZXJ0KHR5cGVzLmhhc0tleShvYmoyLCB7IGE6IHRydWUgfSkpO1xuXHRcdFx0YXNzZXJ0KCF0eXBlcy5oYXNLZXkob2JqMiwgeyBiOiB0cnVlIH0pKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB3b3JrIHdpdGggbmVzdGVkIG9iamVjdHMnLCAoKSA9PiB7XG5cdFx0XHR0eXBlIEEgPSB7IGRhdGE6IHsgbmVzdGVkOiBzdHJpbmcgfSB9O1xuXHRcdFx0dHlwZSBCID0geyB2YWx1ZTogbnVtYmVyIH07XG5cdFx0XHRjb25zdCBvYmo6IEEgfCBCID0geyBkYXRhOiB7IG5lc3RlZDogJ3Rlc3QnIH0gfTtcblxuXHRcdFx0YXNzZXJ0KHR5cGVzLmhhc0tleShvYmosIHsgZGF0YTogdHJ1ZSB9KSk7XG5cdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXG5cdFx0XHRhc3NlcnQoIXR5cGVzLmhhc0tleShvYmosIHsgdmFsdWU6IHRydWUgfSkpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFlBQVksV0FBVztBQUN2QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGVBQWUsU0FBUyxpQkFBaUI7QUFFbEQsTUFBTSxTQUFTLE1BQU07QUFFcEIsMENBQXdDO0FBRXhDLE9BQUssY0FBYyxNQUFNO0FBQ3hCLFdBQU8sQ0FBQyxNQUFNLFdBQVcsTUFBUyxDQUFDO0FBQ25DLFdBQU8sQ0FBQyxNQUFNLFdBQVcsSUFBSSxDQUFDO0FBQzlCLFdBQU8sQ0FBQyxNQUFNLFdBQVcsS0FBSyxDQUFDO0FBQy9CLFdBQU8sQ0FBQyxNQUFNLFdBQVcsQ0FBQyxDQUFDO0FBQzNCLFdBQU8sQ0FBQyxNQUFNLFdBQVcsSUFBSSxDQUFDO0FBQzlCLFdBQU8sQ0FBQyxNQUFNLFdBQVcsQ0FBQyxDQUFDLENBQUM7QUFDNUIsV0FBTyxDQUFDLE1BQU0sV0FBVyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUNyQyxXQUFPLENBQUMsTUFBTSxXQUFXLENBQUMsQ0FBQyxDQUFDO0FBQzVCLFdBQU8sQ0FBQyxNQUFNLFdBQVcsRUFBRSxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQ3hDLFdBQU8sQ0FBQyxNQUFNLFdBQVcsTUFBTSxDQUFDO0FBQ2hDLFdBQU8sQ0FBQyxNQUFNLFdBQVcsSUFBSSxPQUFPLEVBQUUs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LFdBQU8sQ0FBQyxNQUFNLFVBQVUsQ0FBQyxPQUFPLE9BQU8sQ0FBQyxHQUFHLE1BQU0sUUFBUSxDQUFDO0FBQzFELFdBQU8sQ0FBQyxNQUFNLFVBQVUsQ0FBQyxPQUFPLE1BQU0sS0FBSyxHQUFHLE1BQU0sUUFBUSxDQUFDO0FBQzdELFdBQU8sQ0FBQyxNQUFNLFVBQVUsQ0FBQyxPQUFPLFFBQVcsS0FBSyxHQUFHLE1BQU0sUUFBUSxDQUFDO0FBR2xFLFdBQU8sTUFBTSxVQUFVLENBQUMsR0FBRyxNQUFNLFFBQVEsQ0FBQztBQUMxQyxXQUFPLE1BQU0sVUFBVSxDQUFDLEtBQUssR0FBRyxNQUFNLFFBQVEsQ0FBQztBQUMvQyxXQUFPLE1BQU0sVUFBVSxDQUFDLE9BQU8sS0FBSyxHQUFHLE1BQU0sUUFBUSxDQUFDO0FBQ3RELFdBQU8sTUFBTSxVQUFVLENBQUMsT0FBTyxPQUFPLEtBQUssR0FBRyxNQUFNLFFBQVEsQ0FBQztBQUc3RCxXQUFPLE1BQU0sVUFBVSxDQUFDLEdBQUcsTUFBTSxRQUFRLENBQUM7QUFDMUMsV0FBTyxNQUFNLFVBQVUsQ0FBQyxDQUFDLEdBQUcsTUFBTSxRQUFRLENBQUM7QUFDM0MsV0FBTyxNQUFNLFVBQVUsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxHQUFHLE1BQU0sUUFBUSxDQUFDO0FBQ2pELFdBQU8sQ0FBQyxNQUFNLFVBQVUsQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLE1BQU0sUUFBUSxDQUFDO0FBR3BELFdBQU8sTUFBTSxVQUFVLENBQUMsR0FBRyxNQUFNLFNBQVMsQ0FBQztBQUMzQyxXQUFPLE1BQU0sVUFBVSxDQUFDLElBQUksR0FBRyxNQUFNLFNBQVMsQ0FBQztBQUMvQyxXQUFPLE1BQU0sVUFBVSxDQUFDLE1BQU0sT0FBTyxJQUFJLEdBQUcsTUFBTSxTQUFTLENBQUM7QUFDNUQsV0FBTyxDQUFDLE1BQU0sVUFBVSxDQUFDLE1BQU0sR0FBRyxLQUFLLEdBQUcsTUFBTSxTQUFTLENBQUM7QUFHMUQsV0FBTyxNQUFNLFVBQVUsQ0FBQyxHQUFHLE1BQU0sVUFBVSxDQUFD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
