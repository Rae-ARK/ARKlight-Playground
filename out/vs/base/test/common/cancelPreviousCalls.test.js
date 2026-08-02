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
import { Disposable } from "../../common/lifecycle.js";
import { CancellationToken } from "../../common/cancellation.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
import { cancelPreviousCalls } from "../../common/decorators/cancelPreviousCalls.js";
suite("cancelPreviousCalls decorator", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  class MockDisposable extends Disposable {
    constructor() {
      super(...arguments);
      /**
       * Arguments that the {@linkcode doSomethingAsync} method was called with.
       */
      this.callArgs1 = [];
      /**
       * Arguments that the {@linkcode doSomethingElseAsync} method was called with.
       */
      this.callArgs2 = [];
    }
    /**
     * Returns the arguments that the {@linkcode doSomethingAsync} method was called with.
     */
    get callArguments1() {
      return this.callArgs1;
    }
    /**
     * Returns the arguments that the {@linkcode doSomethingElseAsync} method was called with.
     */
    get callArguments2() {
      return this.callArgs2;
    }
    async doSomethingAsync(arg1, arg2, cancellationToken) {
      this.callArgs1.push([arg1, arg2, cancellationToken]);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    async doSomethingElseAsync(arg1, arg2, cancellationToken) {
      this.callArgs2.push([arg1, arg2, cancellationToken]);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  __decorateClass([
    cancelPreviousCalls
  ], MockDisposable.prototype, "doSomethingAsync", 1);
  __decorateClass([
    cancelPreviousCalls
  ], MockDisposable.prototype, "doSomethingElseAsync", 1);
  test("should call method with CancellationToken", async () => {
    const instance = disposables.add(new MockDisposable());
    await instance.doSomethingAsync(1, "foo");
    const callArguments = instance.callArguments1;
    assert.strictEqual(
      callArguments.length,
      1,
      `The 'doSomethingAsync' method must be called just once.`
    );
    const args = callArguments[0];
    assert(
      args.length === 3,
      `The 'doSomethingAsync' method must be called with '3' arguments, got '${args.length}'.`
    );
    const arg1 = args[0];
    const arg2 = args[1];
    const arg3 = args[2];
    assert.strictEqual(
      arg1,
      1,
      `The 'doSomethingAsync' method call must have the correct 1st argument.`
    );
    assert.strictEqual(
      arg2,
      "foo",
      `The 'doSomethingAsync' method call must have the correct 2nd argument.`
    );
    assert(
      CancellationToken.isCancellationToken(arg3),
      `The last argument of the 'doSomethingAsync' method must be a 'CancellationToken', got '${arg3}'.`
    );
    assert(
      arg3.isCancellationRequested === false,
      `The 'CancellationToken' argument must not yet be cancelled.`
    );
    assert(
      instance.callArguments2.length === 0,
      `The 'doSomethingElseAsync' method must not be called.`
    );
  });
  test("cancel token of the previous call when method is called again", async () => {
    const instance = disposables.add(new MockDisposable());
    instance.doSomethingAsync(1, "foo");
    await new Promise((resolve) => setTimeout(resolve, 10));
    instance.doSomethingAsync(2, "bar");
    const callArguments = instance.callArguments1;
    assert.strictEqual(
      callArguments.length,
      2,
      `The 'doSomethingAsync' method must be called twice.`
    );
    const call1Args = callArguments[0];
    assert(
      call1Args.length === 3,
      `The first call of the 'doSomethingAsync' method must have '3' arguments, got '${call1Args.length}'.`
    );
    assert.strictEqual(
      call1Args[0],
      1,
      `The first call of the 'doSomethingAsync' method must have the correct 1st argument.`
    );
    assert.strictEqual(
      call1Args[1],
      "foo",
      `The first call of the 'doSomethingAsync' method must have the correct 2nd argument.`
    );
    assert(
      CancellationToken.isCancellationToken(call1Args[2]),
      `The first call of the 'doSomethingAsync' method must have the 'CancellationToken' as the 3rd argument.`
    );
    assert(
      call1Args[2].isCancellationRequested === true,
      `The 'CancellationToken' of the first call must be cancelled.`
    );
    const call2Args = callArguments[1];
    assert(
      call2Args.length === 3,
      `The second call of the 'doSomethingAsync' method must have '3' arguments, got '${call1Args.length}'.`
    );
    assert.strictEqual(
      call2Args[0],
      2,
      `The second call of the 'doSomethingAsync' method must have the correct 1st argument.`
    );
    assert.strictEqual(
      call2Args[1],
      "bar",
      `The second call of the 'doSomethingAsync' method must have the correct 2nd argument.`
    );
    assert(
      CancellationToken.isCancellationToken(call2Args[2]),
      `The second call of the 'doSomethingAsync' method must have the 'CancellationToken' as the 3rd argument.`
    );
    assert(
      call2Args[2].isCancellationRequested === false,
      `The 'CancellationToken' of the second call must be cancelled.`
    );
    assert(
      instance.callArguments2.length === 0,
      `The 'doSomethingElseAsync' method must not be called.`
    );
  });
  test("different method calls must not interfere with each other", async () => {
    const instance = disposables.add(new MockDisposable());
    instance.doSomethingAsync(10, "baz");
    await new Promise((resolve) => setTimeout(resolve, 10));
    instance.doSomethingElseAsync(25, "qux");
    assert.strictEqual(
      instance.callArguments1.length,
      1,
      `The 'doSomethingAsync' method must be called once.`
    );
    const call1Args = instance.callArguments1[0];
    assert(
      call1Args.length === 3,
      `The first call of the 'doSomethingAsync' method must have '3' arguments, got '${call1Args.length}'.`
    );
    assert.strictEqual(
      call1Args[0],
      10,
      `The first call of the 'doSomethingAsync' method must have the correct 1st argument.`
    );
    assert.strictEqual(
      call1Args[1],
      "baz",
      `The first call of the 'doSomethingAsync' method must have the correct 2nd argument.`
    );
    assert(
      CancellationToken.isCancellationToken(call1Args[2]),
      `The first call of the 'doSomethingAsync' method must have the 'CancellationToken' as the 3rd argument.`
    );
    assert(
      call1Args[2].isCancellationRequested === false,
      `The 'CancellationToken' of the first call must not be cancelled.`
    );
    assert.strictEqual(
      instance.callArguments2.length,
      1,
      `The 'doSomethingElseAsync' method must be called once.`
    );
    const call2Args = instance.callArguments2[0];
    assert(
      call2Args.length === 3,
      `The first call of the 'doSomethingElseAsync' method must have '3' arguments, got '${call1Args.length}'.`
    );
    assert.strictEqual(
      call2Args[0],
      25,
      `The first call of the 'doSomethingElseAsync' method must have the correct 1st argument.`
    );
    assert.strictEqual(
      call2Args[1],
      "qux",
      `The first call of the 'doSomethingElseAsync' method must have the correct 2nd argument.`
    );
    assert(
      CancellationToken.isCancellationToken(call2Args[2]),
      `The first call of the 'doSomethingElseAsync' method must have the 'CancellationToken' as the 3rd argument.`
    );
    assert(
      call2Args[2].isCancellationRequested === false,
      `The 'CancellationToken' of the second call must be cancelled.`
    );
    instance.doSomethingElseAsync(105, "uxi");
    assert.strictEqual(
      instance.callArguments1.length,
      1,
      `The 'doSomethingAsync' method must be called once.`
    );
    assert.strictEqual(
      instance.callArguments2.length,
      2,
      `The 'doSomethingElseAsync' method must be called twice.`
    );
    assert(
      call1Args[2].isCancellationRequested === false,
      `The 'CancellationToken' of the first call must not be cancelled.`
    );
    const call3Args = instance.callArguments2[1];
    assert(
      CancellationToken.isCancellationToken(call3Args[2]),
      `The last argument of the second call of the 'doSomethingElseAsync' method must be a 'CancellationToken'.`
    );
    assert(
      call2Args[2].isCancellationRequested,
      `The 'CancellationToken' of the first call must be cancelled.`
    );
    assert(
      call3Args[2].isCancellationRequested === false,
      `The 'CancellationToken' of the second call must not be cancelled.`
    );
    assert.strictEqual(
      call3Args[0],
      105,
      `The second call of the 'doSomethingElseAsync' method must have the correct 1st argument.`
    );
    assert.strictEqual(
      call3Args[1],
      "uxi",
      `The second call of the 'doSomethingElseAsync' method must have the correct 2nd argument.`
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vY2FuY2VsUHJldmlvdXNDYWxscy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuaW1wb3J0IHsgY2FuY2VsUHJldmlvdXNDYWxscyB9IGZyb20gJy4uLy4uL2NvbW1vbi9kZWNvcmF0b3JzL2NhbmNlbFByZXZpb3VzQ2FsbHMuanMnO1xuXG5zdWl0ZSgnY2FuY2VsUHJldmlvdXNDYWxscyBkZWNvcmF0b3InLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y2xhc3MgTW9ja0Rpc3Bvc2FibGUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0XHQvKipcblx0XHQgKiBBcmd1bWVudHMgdGhhdCB0aGUge0BsaW5rY29kZSBkb1NvbWV0aGluZ0FzeW5jfSBtZXRob2Qgd2FzIGNhbGxlZCB3aXRoLlxuXHRcdCAqL1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgY2FsbEFyZ3MxOiAoW251bWJlciwgc3RyaW5nLCBDYW5jZWxsYXRpb25Ub2tlbiB8IHVuZGVmaW5lZF0pW10gPSBbXTtcblxuXHRcdC8qKlxuXHRcdCAqIEFyZ3VtZW50cyB0aGF0IHRoZSB7QGxpbmtjb2RlIGRvU29tZXRoaW5nRWxzZUFzeW5jfSBtZXRob2Qgd2FzIGNhbGxlZCB3aXRoLlxuXHRcdCAqL1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgY2FsbEFyZ3MyOiAoW251bWJlciwgc3RyaW5nLCBDYW5jZWxsYXRpb25Ub2tlbiB8IHVuZGVmaW5lZF0pW10gPSBbXTtcblxuXHRcdC8qKlxuXHRcdCAqIFJldHVybnMgdGhlIGFyZ3VtZW50cyB0aGF0IHRoZSB7QGxpbmtjb2RlIGRvU29tZXRoaW5nQXN5bmN9IG1ldGhvZCB3YXMgY2FsbGVkIHdpdGguXG5cdFx0ICovXG5cdFx0cHVibGljIGdldCBjYWxsQXJndW1lbnRzMSgpIHtcblx0XHRcdHJldHVybiB0aGlzLmNhbGxBcmdzMTtcblx0XHR9XG5cblx0XHQvKipcblx0XHQgKiBSZXR1cm5zIHRoZSBhcmd1bWVudHMgdGhhdCB0aGUge0BsaW5rY29kZSBkb1NvbWV0aGluZ0Vsc2VBc3luY30gbWV0aG9kIHdhcyBjYWxsZWQgd2l0aC5cblx0XHQgKi9cblx0XHRwdWJsaWMgZ2V0IGNhbGxBcmd1bWVudHMyKCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY2FsbEFyZ3MyO1xuXHRcdH1cblxuXHRcdEBjYW5jZWxQcmV2aW91c0NhbGxzXG5cdFx0YXN5bmMgZG9Tb21ldGhpbmdBc3luYyhhcmcxOiBudW1iZXIsIGFyZzI6IHN0cmluZywgY2FuY2VsbGF0aW9uVG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0dGhpcy5jYWxsQXJnczEucHVzaChbYXJnMSwgYXJnMiwgY2FuY2VsbGF0aW9uVG9rZW5dKTtcblxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDI1KSk7XG5cdFx0fVxuXG5cdFx0QGNhbmNlbFByZXZpb3VzQ2FsbHNcblx0XHRhc3luYyBkb1NvbWV0aGluZ0Vsc2VBc3luYyhhcmcxOiBudW1iZXIsIGFyZzI6IHN0cmluZywgY2FuY2VsbGF0aW9uVG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0dGhpcy5jYWxsQXJnczIucHVzaChbYXJnMSwgYXJnMiwgY2FuY2VsbGF0aW9uVG9rZW5dKTtcblxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDI1KSk7XG5cdFx0fVxuXHR9XG5cblx0dGVzdCgnc2hvdWxkIGNhbGwgbWV0aG9kIHdpdGggQ2FuY2VsbGF0aW9uVG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tEaXNwb3NhYmxlKCkpO1xuXG5cdFx0YXdhaXQgaW5zdGFuY2UuZG9Tb21ldGhpbmdBc3luYygxLCAnZm9vJyk7XG5cblx0XHRjb25zdCBjYWxsQXJndW1lbnRzID0gaW5zdGFuY2UuY2FsbEFyZ3VtZW50czE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y2FsbEFyZ3VtZW50cy5sZW5ndGgsXG5cdFx0XHQxLFxuXHRcdFx0YFRoZSAnZG9Tb21ldGhpbmdBc3luYycgbWV0aG9kIG11c3QgYmUgY2FsbGVkIGp1c3Qgb25jZS5gLFxuXHRcdCk7XG5cblx0XHRjb25zdCBhcmdzID0gY2FsbEFyZ3VtZW50c1swXTtcblx0XHRhc3NlcnQoXG5cdFx0XHRhcmdzLmxlbmd0aCA9PT0gMyxcblx0XHRcdGBUaGUgJ2RvU29tZXRoaW5nQXN5bmMnIG1ldGhvZCBtdXN0IGJlIGNhbGxlZCB3aXRoICczJyBhcmd1bWVudHMsIGdvdCAnJHthcmdzLmxlbmd0aH0nLmAsXG5cdFx0KTtcblxuXHRcdGNvbnN0IGFyZzEgPSBhcmdzWzBdO1xuXHRcdGNvbnN0IGFyZzIgPSBhcmdzWzFdO1xuXHRcdGNvbnN0IGFyZzMgPSBhcmdzWzJdO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0YXJnMSxcblx0XHRcdDEsXG5cdFx0XHRgVGhlICdkb1NvbWV0aGluZ0FzeW5jJyBtZXRob2QgY2FsbCBtdXN0IGhhdmUgdGhlIGNvcnJlY3QgMXN0IGFyZ3VtZW50LmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGFyZzIsXG5cdFx0XHQnZm9vJyxcblx0XHRcdGBUaGUgJ2RvU29tZXRoaW5nQXN5bmMnIG1ldGhvZCBjYWxsIG11c3QgaGF2ZSB0aGUgY29ycmVjdCAybmQgYXJndW1lbnQuYCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0KFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25Ub2tlbihhcmczKSxcblx0XHRcdGBUaGUgbGFzdCBhcmd1bWVudCBvZiB0aGUgJ2RvU29tZXRoaW5nQXN5bmMnIG1ldGhvZCBtdXN0IGJlIGEgJ0NhbmNlbGxhdGlvblRva2VuJywgZ290ICcke2FyZzN9Jy5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQoXG5cdFx0XHRhcmczLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkID09PSBmYWxzZSxcblx0XHRcdGBUaGUgJ0NhbmNlbGxhdGlvblRva2VuJyBhcmd1bWVudCBtdXN0IG5vdCB5ZXQgYmUgY2FuY2VsbGVkLmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydChcblx0XHRcdGluc3RhbmNlLmNhbGxBcmd1bWVudHMyLmxlbmd0aCA9PT0gMCxcblx0XHRcdGBUaGUgJ2RvU29tZXRoaW5nRWxzZUFzeW5jJyBtZXRob2QgbXVzdCBub3QgYmUgY2FsbGVkLmAsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY2FuY2VsIHRva2VuIG9mIHRoZSBwcmV2aW91cyBjYWxsIHdoZW4gbWV0aG9kIGlzIGNhbGxlZCBhZ2FpbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW5jZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0Rpc3Bvc2FibGUoKSk7XG5cblx0XHRpbnN0YW5jZS5kb1NvbWV0aGluZ0FzeW5jKDEsICdmb28nKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcblx0XHRpbnN0YW5jZS5kb1NvbWV0aGluZ0FzeW5jKDIsICdiYXInKTtcblxuXHRcdGNvbnN0IGNhbGxBcmd1bWVudHMgPSBpbnN0YW5jZS5jYWxsQXJndW1lbnRzMTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjYWxsQXJndW1lbnRzLmxlbmd0aCxcblx0XHRcdDIsXG5cdFx0XHRgVGhlICdkb1NvbWV0aGluZ0FzeW5jJyBtZXRob2QgbXVzdCBiZSBjYWxsZWQgdHdpY2UuYCxcblx0XHQpO1xuXG5cdFx0Y29uc3QgY2FsbDFBcmdzID0gY2FsbEFyZ3VtZW50c1swXTtcblx0XHRhc3NlcnQoXG5cdFx0XHRjYWxsMUFyZ3MubGVuZ3RoID09PSAzLFxuXHRcdFx0YFRoZSBmaXJzdCBjYWxsIG9mIHRoZSAnZG9Tb21ldGhpbmdBc3luYycgbWV0aG9kIG11c3QgaGF2ZSAnMycgYXJndW1lbnRzLCBnb3QgJyR7Y2FsbDFBcmdzLmxlbmd0aH0nLmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNhbGwxQXJnc1swXSxcblx0XHRcdDEsXG5cdFx0XHRgVGhlIGZpcnN0IGNhbGwgb2YgdGhlICdkb1NvbWV0aGluZ0FzeW5jJyBtZXRob2QgbXVzdCBoYXZlIHRoZSBjb3JyZWN0IDFzdCBhcmd1bWVudC5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjYWxsMUFyZ3NbMV0sXG5cdFx0XHQnZm9vJyxcblx0XHRcdGBUaGUgZmlyc3QgY2FsbCBvZiB0aGUgJ2RvU29tZXRoaW5nQXN5bmMnIG1ldGhvZCBtdXN0IGhhdmUgdGhlIGNvcnJlY3QgMm5kIGFyZ3VtZW50LmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydChcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uVG9rZW4oY2FsbDFBcmdzWzJdKSxcblx0XHRcdGBUaGUgZmlyc3QgY2FsbCBvZiB0aGUgJ2RvU29tZXRoaW5nQXN5bmMnIG1ldGhvZCBtdXN0IGhhdmUgdGhlICdDYW5jZWxsYXRpb25Ub2tlbicgYXMgdGhlIDNyZCBhcmd1bWVudC5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQoXG5cdFx0XHRjYWxsMUFyZ3NbMl0uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgPT09IHRydWUsXG5cdFx0XHRgVGhlICdDYW5jZWxsYXRpb25Ub2tlbicgb2YgdGhlIGZpcnN0IGNhbGwgbXVzdCBiZSBjYW5jZWxsZWQuYCxcblx0XHQpO1xuXG5cdFx0Y29uc3QgY2FsbDJBcmdzID0gY2FsbEFyZ3VtZW50c1sxXTtcblx0XHRhc3NlcnQoXG5cdFx0XHRjYWxsMkFyZ3MubGVuZ3RoID09PSAzLFxuXHRcdFx0YFRoZSBzZWNvbmQgY2FsbCBvZiB0aGUgJ2RvU29tZXRoaW5nQXN5bmMnIG1ldGhvZCBtdXN0IGhhdmUgJzMnIGFyZ3VtZW50cywgZ290ICcke2NhbGwxQXJncy5sZW5ndGh9Jy5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjYWxsMkFyZ3NbMF0sXG5cdFx0XHQyLFxuXHRcdFx0YFRoZSBzZWNvbmQgY2FsbCBvZiB0aGUgJ2RvU29tZXRoaW5nQXN5bmMnIG1ldGhvZCBtdXN0IGhhdmUgdGhlIGNvcnJlY3QgMXN0IGFyZ3VtZW50LmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNhbGwyQXJnc1sxXSxcblx0XHRcdCdiYXInLFxuXHRcdFx0YFRoZSBzZWNvbmQgY2FsbCBvZiB0aGUgJ2RvU29tZXRoaW5nQXN5bmMnIG1ldGhvZCBtdXN0IGhhdmUgdGhlIGNvcnJlY3QgMm5kIGFyZ3VtZW50LmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydChcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uVG9rZW4oY2FsbDJBcmdzWzJdKSxcblx0XHRcdGBUaGUgc2Vjb25kIGNhbGwgb2YgdGhlICdkb1NvbWV0aGluZ0FzeW5jJyBtZXRob2QgbXVzdCBoYXZlIHRoZSAnQ2FuY2VsbGF0aW9uVG9rZW4nIGFzIHRoZSAzcmQgYXJndW1lbnQuYCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0KFxuXHRcdFx0Y2FsbDJBcmdzWzJdLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkID09PSBmYWxzZSxcblx0XHRcdGBUaGUgJ0NhbmNlbGxhdGlvblRva2VuJyBvZiB0aGUgc2Vjb25kIGNhbGwgbXVzdCBiZSBjYW5jZWxsZWQuYCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0KFxuXHRcdFx0aW5zdGFuY2UuY2FsbEFyZ3VtZW50czIubGVuZ3RoID09PSAwLFxuXHRcdFx0YFRoZSAnZG9Tb21ldGhpbmdFbHNlQXN5bmMnIG1ldGhvZCBtdXN0IG5vdCBiZSBjYWxsZWQuYCxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaWZmZXJlbnQgbWV0aG9kIGNhbGxzIG11c3Qgbm90IGludGVyZmVyZSB3aXRoIGVhY2ggb3RoZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tEaXNwb3NhYmxlKCkpO1xuXG5cdFx0aW5zdGFuY2UuZG9Tb21ldGhpbmdBc3luYygxMCwgJ2JheicpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMCkpO1xuXHRcdGluc3RhbmNlLmRvU29tZXRoaW5nRWxzZUFzeW5jKDI1LCAncXV4Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRpbnN0YW5jZS5jYWxsQXJndW1lbnRzMS5sZW5ndGgsXG5cdFx0XHQxLFxuXHRcdFx0YFRoZSAnZG9Tb21ldGhpbmdBc3luYycgbWV0aG9kIG11c3QgYmUgY2FsbGVkIG9uY2UuYCxcblx0XHQpO1xuXG5cdFx0Y29uc3QgY2FsbDFBcmdzID0gaW5zdGFuY2UuY2FsbEFyZ3VtZW50czFbMF07XG5cdFx0YXNzZXJ0KFxuXHRcdFx0Y2FsbDFBcmdzLmxlbmd0aCA9PT0gMyxcblx0XHRcdGBUaGUgZmlyc3QgY2FsbCBvZiB0aGUgJ2RvU29tZXRoaW5nQXN5bmMnIG1ldGhvZCBtdXN0IGhhdmUgJzMnIGFyZ3VtZW50cywgZ290ICcke2NhbGwxQXJncy5sZW5ndGh9Jy5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjYWxsMUFyZ3NbMF0sXG5cdFx0XHQxMCxcblx0XHRcdGBUaGUgZmlyc3QgY2FsbCBvZiB0aGUgJ2RvU29tZXRoaW5nQXN5bmMnIG1ldGhvZCBtdXN0IGhhdmUgdGhlIGNvcnJlY3QgMXN0IGFyZ3VtZW50LmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNhbGwxQXJnc1sxXSxcblx0XHRcdCdiYXonLFxuXHRcdFx0YFRoZSBmaXJzdCBjYWxsIG9mIHRoZSAnZG9Tb21ldGhpbmdBc3luYycgbWV0aG9kIG11c3QgaGF2ZSB0aGUgY29ycmVjdCAybmQgYXJndW1lbnQuYCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0KFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25Ub2tlbihjYWxsMUFyZ3NbMl0pLFxuXHRcdFx0YFRoZSBmaXJzdCBjYWxsIG9mIHRoZSAnZG9Tb21ldGhpbmdBc3luYycgbWV0aG9kIG11c3QgaGF2ZSB0aGUgJ0NhbmNlbGxhdGlvblRva2VuJyBhcyB0aGUgM3JkIGFyZ3VtZW50LmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydChcblx0XHRcdGNhbGwxQXJnc1syXS5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCA9PT0gZmFsc2UsXG5cdFx0XHRgVGhlICdDYW5jZWxsYXRpb25Ub2tlbicgb2YgdGhlIGZpcnN0IGNhbGwgbXVzdCBub3QgYmUgY2FuY2VsbGVkLmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGluc3RhbmNlLmNhbGxBcmd1bWVudHMyLmxlbmd0aCxcblx0XHRcdDEsXG5cdFx0XHRgVGhlICdkb1NvbWV0aGluZ0Vsc2VBc3luYycgbWV0aG9kIG11c3QgYmUgY2FsbGVkIG9uY2UuYCxcblx0XHQpO1xuXG5cdFx0Y29uc3QgY2FsbDJBcmdzID0gaW5zdGFuY2UuY2FsbEFyZ3VtZW50czJbMF07XG5cdFx0YXNzZXJ0KFxuXHRcdFx0Y2FsbDJBcmdzLmxlbmd0aCA9PT0gMyxcblx0XHRcdGBUaGUgZmlyc3QgY2FsbCBvZiB0aGUgJ2RvU29tZXRoaW5nRWxzZUFzeW5jJyBtZXRob2QgbXVzdCBoYXZlICczJyBhcmd1bWVudHMsIGdvdCAnJHtjYWxsMUFyZ3MubGVuZ3RofScuYCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y2FsbDJBcmdzWzBdLFxuXHRcdFx0MjUsXG5cdFx0XHRgVGhlIGZpcnN0IGNhbGwgb2YgdGhlICdkb1NvbWV0aGluZ0Vsc2VBc3luYycgbWV0aG9kIG11c3QgaGF2ZSB0aGUgY29ycmVjdCAxc3QgYXJndW1lbnQuYCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y2FsbDJBcmdzWzFdLFxuXHRcdFx0J3F1eCcsXG5cdFx0XHRgVGhlIGZpcnN0IGNhbGwgb2YgdGhlICdkb1NvbWV0aGluZ0Vsc2VBc3luYycgbWV0aG9kIG11c3QgaGF2ZSB0aGUgY29ycmVjdCAybmQgYXJndW1lbnQuYCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0KFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25Ub2tlbihjYWxsMkFyZ3NbMl0pLFxuXHRcdFx0YFRoZSBmaXJzdCBjYWxsIG9mIHRoZSAnZG9Tb21ldGhpbmdFbHNlQXN5bmMnIG1ldGhvZCBtdXN0IGhhdmUgdGhlICdDYW5jZWxsYXRpb25Ub2tlbicgYXMgdGhlIDNyZCBhcmd1bWVudC5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQoXG5cdFx0XHRjYWxsMkFyZ3NbMl0uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgPT09IGZhbHNlLFxuXHRcdFx0YFRoZSAnQ2FuY2VsbGF0aW9uVG9rZW4nIG9mIHRoZSBzZWNvbmQgY2FsbCBtdXN0IGJlIGNhbmNlbGxlZC5gLFxuXHRcdCk7XG5cblx0XHRpbnN0YW5jZS5kb1NvbWV0aGluZ0Vsc2VBc3luYygxMDUsICd1eGknKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGluc3RhbmNlLmNhbGxBcmd1bWVudHMxLmxlbmd0aCxcblx0XHRcdDEsXG5cdFx0XHRgVGhlICdkb1NvbWV0aGluZ0FzeW5jJyBtZXRob2QgbXVzdCBiZSBjYWxsZWQgb25jZS5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRpbnN0YW5jZS5jYWxsQXJndW1lbnRzMi5sZW5ndGgsXG5cdFx0XHQyLFxuXHRcdFx0YFRoZSAnZG9Tb21ldGhpbmdFbHNlQXN5bmMnIG1ldGhvZCBtdXN0IGJlIGNhbGxlZCB0d2ljZS5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQoXG5cdFx0XHRjYWxsMUFyZ3NbMl0uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgPT09IGZhbHNlLFxuXHRcdFx0YFRoZSAnQ2FuY2VsbGF0aW9uVG9rZW4nIG9mIHRoZSBmaXJzdCBjYWxsIG11c3Qgbm90IGJlIGNhbmNlbGxlZC5gLFxuXHRcdCk7XG5cblx0XHRjb25zdCBjYWxsM0FyZ3MgPSBpbnN0YW5jZS5jYWxsQXJndW1lbnRzMlsxXTtcblx0XHRhc3NlcnQoXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblRva2VuKGNhbGwzQXJnc1syXSksXG5cdFx0XHRgVGhlIGxhc3QgYXJndW1lbnQgb2YgdGhlIHNlY29uZCBjYWxsIG9mIHRoZSAnZG9Tb21ldGhpbmdFbHNlQXN5bmMnIG1ldGhvZCBtdXN0IGJlIGEgJ0NhbmNlbGxhdGlvblRva2VuJy5gLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQoXG5cdFx0XHRjYWxsMkFyZ3NbMl0uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQsXG5cdFx0XHRgVGhlICdDYW5jZWxsYXRpb25Ub2tlbicgb2YgdGhlIGZpcnN0IGNhbGwgbXVzdCBiZSBjYW5jZWxsZWQuYCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0KFxuXHRcdFx0Y2FsbDNBcmdzWzJdLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkID09PSBmYWxzZSxcblx0XHRcdGBUaGUgJ0NhbmNlbGxhdGlvblRva2VuJyBvZiB0aGUgc2Vjb25kIGNhbGwgbXVzdCBub3QgYmUgY2FuY2VsbGVkLmAsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNhbGwzQXJnc1swXSxcblx0XHRcdDEwNSxcblx0XHRcdGBUaGUgc2Vjb25kIGNhbGwgb2YgdGhlICdkb1NvbWV0aGluZ0Vsc2VBc3luYycgbWV0aG9kIG11c3QgaGF2ZSB0aGUgY29ycmVjdCAxc3QgYXJndW1lbnQuYCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y2FsbDNBcmdzWzFdLFxuXHRcdFx0J3V4aScsXG5cdFx0XHRgVGhlIHNlY29uZCBjYWxsIG9mIHRoZSAnZG9Tb21ldGhpbmdFbHNlQXN5bmMnIG1ldGhvZCBtdXN0IGhhdmUgdGhlIGNvcnJlY3QgMm5kIGFyZ3VtZW50LmAsXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7QUFLQSxPQUFP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
