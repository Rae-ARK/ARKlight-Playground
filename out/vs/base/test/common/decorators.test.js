var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
import assert from "assert";
import * as sinon from "sinon";
import { memoize, throttle } from "../../common/decorators.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("Decorators", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("memoize should memoize methods", () => {
    class Foo {
      constructor(_answer) {
        this._answer = _answer;
        this.count = 0;
      }
      answer() {
        this.count++;
        return this._answer;
      }
    }
    __decorateClass([
      memoize
    ], Foo.prototype, "answer", 1);
    const foo = new Foo(42);
    assert.strictEqual(foo.count, 0);
    assert.strictEqual(foo.answer(), 42);
    assert.strictEqual(foo.count, 1);
    assert.strictEqual(foo.answer(), 42);
    assert.strictEqual(foo.count, 1);
    const foo2 = new Foo(1337);
    assert.strictEqual(foo2.count, 0);
    assert.strictEqual(foo2.answer(), 1337);
    assert.strictEqual(foo2.count, 1);
    assert.strictEqual(foo2.answer(), 1337);
    assert.strictEqual(foo2.count, 1);
    assert.strictEqual(foo.answer(), 42);
    assert.strictEqual(foo.count, 1);
    const foo3 = new Foo(null);
    assert.strictEqual(foo3.count, 0);
    assert.strictEqual(foo3.answer(), null);
    assert.strictEqual(foo3.count, 1);
    assert.strictEqual(foo3.answer(), null);
    assert.strictEqual(foo3.count, 1);
    const foo4 = new Foo(void 0);
    assert.strictEqual(foo4.count, 0);
    assert.strictEqual(foo4.answer(), void 0);
    assert.strictEqual(foo4.count, 1);
    assert.strictEqual(foo4.answer(), void 0);
    assert.strictEqual(foo4.count, 1);
  });
  test("memoize should memoize getters", () => {
    class Foo {
      constructor(_answer) {
        this._answer = _answer;
        this.count = 0;
      }
      get answer() {
        this.count++;
        return this._answer;
      }
    }
    __decorateClass([
      memoize
    ], Foo.prototype, "answer", 1);
    const foo = new Foo(42);
    assert.strictEqual(foo.count, 0);
    assert.strictEqual(foo.answer, 42);
    assert.strictEqual(foo.count, 1);
    assert.strictEqual(foo.answer, 42);
    assert.strictEqual(foo.count, 1);
    const foo2 = new Foo(1337);
    assert.strictEqual(foo2.count, 0);
    assert.strictEqual(foo2.answer, 1337);
    assert.strictEqual(foo2.count, 1);
    assert.strictEqual(foo2.answer, 1337);
    assert.strictEqual(foo2.count, 1);
    assert.strictEqual(foo.answer, 42);
    assert.strictEqual(foo.count, 1);
    const foo3 = new Foo(null);
    assert.strictEqual(foo3.count, 0);
    assert.strictEqual(foo3.answer, null);
    assert.strictEqual(foo3.count, 1);
    assert.strictEqual(foo3.answer, null);
    assert.strictEqual(foo3.count, 1);
    const foo4 = new Foo(void 0);
    assert.strictEqual(foo4.count, 0);
    assert.strictEqual(foo4.answer, void 0);
    assert.strictEqual(foo4.count, 1);
    assert.strictEqual(foo4.answer, void 0);
    assert.strictEqual(foo4.count, 1);
  });
  test("memoized property should not be enumerable", () => {
    class Foo {
      get answer() {
        return 42;
      }
    }
    __decorateClass([
      memoize
    ], Foo.prototype, "answer", 1);
    const foo = new Foo();
    assert.strictEqual(foo.answer, 42);
    assert(!Object.keys(foo).some((k) => /\$memoize\$/.test(k)));
  });
  test("memoized property should not be writable", () => {
    class Foo {
      get answer() {
        return 42;
      }
    }
    __decorateClass([
      memoize
    ], Foo.prototype, "answer", 1);
    const foo = new Foo();
    assert.strictEqual(foo.answer, 42);
    try {
      foo["$memoize$answer"] = 1337;
      assert(false);
    } catch (e) {
      assert.strictEqual(foo.answer, 42);
    }
  });
  test("throttle", () => {
    const spy = sinon.spy();
    const clock = sinon.useFakeTimers();
    try {
      class ThrottleTest {
        constructor(fn) {
          this._handle = fn;
        }
        report(p) {
          this._handle(p);
        }
      }
      __decorateClass([
        throttle(
          100,
          (a, b) => a + b,
          () => 0
        )
      ], ThrottleTest.prototype, "report", 1);
      const t = new ThrottleTest(spy);
      t.report(1);
      t.report(2);
      t.report(3);
      assert.deepStrictEqual(spy.args, [[1]]);
      clock.tick(200);
      assert.deepStrictEqual(spy.args, [[1], [5]]);
      spy.resetHistory();
      t.report(4);
      t.report(5);
      clock.tick(50);
      t.report(6);
      assert.deepStrictEqual(spy.args, [[4]]);
      clock.tick(60);
      assert.deepStrictEqual(spy.args, [[4], [11]]);
    } finally {
      clock.restore();
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vZGVjb3JhdG9ycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgc2lub24gZnJvbSAnc2lub24nO1xuaW1wb3J0IHsgbWVtb2l6ZSwgdGhyb3R0bGUgfSBmcm9tICcuLi8uLi9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuc3VpdGUoJ0RlY29yYXRvcnMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ21lbW9pemUgc2hvdWxkIG1lbW9pemUgbWV0aG9kcycsICgpID0+IHtcblx0XHRjbGFzcyBGb28ge1xuXHRcdFx0Y291bnQgPSAwO1xuXG5cdFx0XHRjb25zdHJ1Y3Rvcihwcml2YXRlIF9hbnN3ZXI6IG51bWJlciB8IG51bGwgfCB1bmRlZmluZWQpIHsgfVxuXG5cdFx0XHRAbWVtb2l6ZVxuXHRcdFx0YW5zd2VyKCkge1xuXHRcdFx0XHR0aGlzLmNvdW50Kys7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9hbnN3ZXI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9vID0gbmV3IEZvbyg0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvby5jb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvby5hbnN3ZXIoKSwgNDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28uY291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28uYW5zd2VyKCksIDQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vLmNvdW50LCAxKTtcblxuXHRcdGNvbnN0IGZvbzIgPSBuZXcgRm9vKDEzMzcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28yLmNvdW50LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vMi5hbnN3ZXIoKSwgMTMzNyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbzIuY291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28yLmFuc3dlcigpLCAxMzM3KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vMi5jb3VudCwgMSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vLmFuc3dlcigpLCA0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvby5jb3VudCwgMSk7XG5cblx0XHRjb25zdCBmb28zID0gbmV3IEZvbyhudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vMy5jb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbzMuYW5zd2VyKCksIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28zLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vMy5hbnN3ZXIoKSwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbzMuY291bnQsIDEpO1xuXG5cdFx0Y29uc3QgZm9vNCA9IG5ldyBGb28odW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vNC5jb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbzQuYW5zd2VyKCksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbzQuY291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb280LmFuc3dlcigpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb280LmNvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnbWVtb2l6ZSBzaG91bGQgbWVtb2l6ZSBnZXR0ZXJzJywgKCkgPT4ge1xuXHRcdGNsYXNzIEZvbyB7XG5cdFx0XHRjb3VudCA9IDA7XG5cblx0XHRcdGNvbnN0cnVjdG9yKHByaXZhdGUgX2Fuc3dlcjogbnVtYmVyIHwgbnVsbCB8IHVuZGVmaW5lZCkgeyB9XG5cblx0XHRcdEBtZW1vaXplXG5cdFx0XHRnZXQgYW5zd2VyKCkge1xuXHRcdFx0XHR0aGlzLmNvdW50Kys7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9hbnN3ZXI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9vID0gbmV3IEZvbyg0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvby5jb3VudCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvby5hbnN3ZXIsIDQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vLmFuc3dlciwgNDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28uY291bnQsIDEpO1xuXG5cdFx0Y29uc3QgZm9vMiA9IG5ldyBGb28oMTMzNyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbzIuY291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28yLmFuc3dlciwgMTMzNyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbzIuY291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28yLmFuc3dlciwgMTMzNyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbzIuY291bnQsIDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvby5hbnN3ZXIsIDQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vLmNvdW50LCAxKTtcblxuXHRcdGNvbnN0IGZvbzMgPSBuZXcgRm9vKG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28zLmNvdW50LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vMy5hbnN3ZXIsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28zLmNvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vMy5hbnN3ZXIsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28zLmNvdW50LCAxKTtcblxuXHRcdGNvbnN0IGZvbzQgPSBuZXcgRm9vKHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbzQuY291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb280LmFuc3dlciwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vNC5jb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbzQuYW5zd2VyLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb280LmNvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnbWVtb2l6ZWQgcHJvcGVydHkgc2hvdWxkIG5vdCBiZSBlbnVtZXJhYmxlJywgKCkgPT4ge1xuXHRcdGNsYXNzIEZvbyB7XG5cdFx0XHRAbWVtb2l6ZVxuXHRcdFx0Z2V0IGFuc3dlcigpIHtcblx0XHRcdFx0cmV0dXJuIDQyO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGZvbyA9IG5ldyBGb28oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vLmFuc3dlciwgNDIpO1xuXG5cdFx0YXNzZXJ0KCFPYmplY3Qua2V5cyhmb28pLnNvbWUoayA9PiAvXFwkbWVtb2l6ZVxcJC8udGVzdChrKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZW1vaXplZCBwcm9wZXJ0eSBzaG91bGQgbm90IGJlIHdyaXRhYmxlJywgKCkgPT4ge1xuXHRcdGNsYXNzIEZvbyB7XG5cdFx0XHRAbWVtb2l6ZVxuXHRcdFx0Z2V0IGFuc3dlcigpIHtcblx0XHRcdFx0cmV0dXJuIDQyO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGZvbyA9IG5ldyBGb28oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vLmFuc3dlciwgNDIpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0KGZvbyBhcyBhbnkpWyckbWVtb2l6ZSRhbnN3ZXInXSA9IDEzMzc7XG5cdFx0XHRhc3NlcnQoZmFsc2UpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb28uYW5zd2VyLCA0Mik7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCd0aHJvdHRsZScsICgpID0+IHtcblx0XHRjb25zdCBzcHkgPSBzaW5vbi5zcHkoKTtcblx0XHRjb25zdCBjbG9jayA9IHNpbm9uLnVzZUZha2VUaW1lcnMoKTtcblx0XHR0cnkge1xuXHRcdFx0Y2xhc3MgVGhyb3R0bGVUZXN0IHtcblx0XHRcdFx0cHJpdmF0ZSBfaGFuZGxlOiBGdW5jdGlvbjtcblxuXHRcdFx0XHRjb25zdHJ1Y3RvcihmbjogRnVuY3Rpb24pIHtcblx0XHRcdFx0XHR0aGlzLl9oYW5kbGUgPSBmbjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdEB0aHJvdHRsZShcblx0XHRcdFx0XHQxMDAsXG5cdFx0XHRcdFx0KGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiBhICsgYixcblx0XHRcdFx0XHQoKSA9PiAwXG5cdFx0XHRcdClcblx0XHRcdFx0cmVwb3J0KHA6IG51bWJlcik6IHZvaWQge1xuXHRcdFx0XHRcdHRoaXMuX2hhbmRsZShwKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0ID0gbmV3IFRocm90dGxlVGVzdChzcHkpO1xuXG5cdFx0XHR0LnJlcG9ydCgxKTtcblx0XHRcdHQucmVwb3J0KDIpO1xuXHRcdFx0dC5yZXBvcnQoMyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNweS5hcmdzLCBbWzFdXSk7XG5cblx0XHRcdGNsb2NrLnRpY2soMjAwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3B5LmFyZ3MsIFtbMV0sIFs1XV0pO1xuXHRcdFx0c3B5LnJlc2V0SGlzdG9yeSgpO1xuXG5cdFx0XHR0LnJlcG9ydCg0KTtcblx0XHRcdHQucmVwb3J0KDUpO1xuXHRcdFx0Y2xvY2sudGljayg1MCk7XG5cdFx0XHR0LnJlcG9ydCg2KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzcHkuYXJncywgW1s0XV0pO1xuXHRcdFx0Y2xvY2sudGljayg2MCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNweS5hcmdzLCBbWzRdLCBbMTFdXSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsb2NrLnJlc3RvcmUoKTtcblx0XHR9XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7O0FBS0EsT0FBTyxZQUFZO0FBQ25CLFlBQVksV0FBVztBQUN2QixTQUFTLFNBQVMsZ0JBQWdCO0FBQ2xDLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sY0FBYyxNQUFNO0FBQ3pCLDBDQUF3QztBQUV4QyxPQUFLLGtDQUFrQyxNQUFNO0FBQUEsSUFDNUMsTUFBTSxJQUFJO0FBQUEs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
