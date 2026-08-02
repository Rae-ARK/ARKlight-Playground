import assert from "assert";
import { mockObject, mockService } from "./mock.js";
import { typeCheck } from "../../../../../../../base/common/types.js";
import { randomBoolean } from "../../../../../../../base/test/common/testUtils.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
suite("mockService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("mockObject", () => {
    test("overrides properties and functions", () => {
      const mock = mockObject({
        bar: "oh hi!",
        baz: 42,
        anotherMethod(arg) {
          return isNaN(arg);
        }
      });
      typeCheck(mock);
      assert.strictEqual(
        mock.bar,
        "oh hi!",
        "bar should be overriden"
      );
      assert.strictEqual(
        mock.baz,
        42,
        "baz should be overriden"
      );
      assert(
        !mock.anotherMethod(490274),
        "Must execute overriden method correctly 1."
      );
      assert(
        mock.anotherMethod(NaN),
        "Must execute overriden method correctly 2."
      );
      assert.throws(() => {
        mock.foo;
      });
      assert.throws(() => {
        mock.someMethod(randomBoolean());
      });
    });
    test("immutability of the overrides object", () => {
      const overrides = {
        baz: 4
      };
      const mock = mockObject(overrides);
      typeCheck(mock);
      assert.strictEqual(
        mock.baz,
        4,
        "baz should be overridden"
      );
      assert.throws(() => {
        overrides.foo = "test";
      });
      assert.throws(() => {
        overrides.someMethod = (arg) => {
          return `${arg}__${arg}`;
        };
      });
    });
  });
  suite("mockService", () => {
    test("overrides properties and functions", () => {
      const mock = mockService({
        id: "ciao!",
        counter: 74,
        testMethod2(arg) {
          return !isNaN(arg);
        }
      });
      typeCheck(mock);
      assert.strictEqual(
        mock.id,
        "ciao!",
        "id should be overridden"
      );
      assert.strictEqual(
        mock.counter,
        74,
        "counter should be overridden"
      );
      assert(
        mock.testMethod2(74368),
        "Must execute overridden method correctly 1."
      );
      assert(
        !mock.testMethod2(NaN),
        "Must execute overridden method correctly 2."
      );
      assert.throws(() => {
        mock.prop1;
      });
      assert.throws(() => {
        mock.method1(randomBoolean());
      });
    });
    test("immutability of the overrides object", () => {
      const overrides = {
        baz: false
      };
      const mock = mockService(overrides);
      typeCheck(mock);
      assert.strictEqual(
        mock.baz,
        false,
        "baz should be overridden"
      );
      assert.throws(() => {
        overrides.foo = "test";
      });
      assert.throws(() => {
        overrides.someMethod = (arg) => {
          return `${arg}__${arg}`;
        };
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcHJvbXB0U3ludGF4L3V0aWxzL21vY2sudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1vY2tPYmplY3QsIG1vY2tTZXJ2aWNlIH0gZnJvbSAnLi9tb2NrLmpzJztcbmltcG9ydCB7IHR5cGVDaGVjayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IHJhbmRvbUJvb2xlYW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3Rlc3RVdGlscy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ21vY2tTZXJ2aWNlJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnbW9ja09iamVjdCcsICgpID0+IHtcblx0XHR0ZXN0KCdvdmVycmlkZXMgcHJvcGVydGllcyBhbmQgZnVuY3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0aW50ZXJmYWNlIElUZXN0T2JqZWN0IHtcblx0XHRcdFx0Zm9vOiBzdHJpbmc7XG5cdFx0XHRcdGJhcjogc3RyaW5nO1xuXHRcdFx0XHRyZWFkb25seSBiYXo6IG51bWJlcjtcblx0XHRcdFx0c29tZU1ldGhvZChhcmc6IGJvb2xlYW4pOiBzdHJpbmc7XG5cdFx0XHRcdGFub3RoZXJNZXRob2QoYXJnOiBudW1iZXIpOiBib29sZWFuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtb2NrID0gbW9ja09iamVjdDxJVGVzdE9iamVjdD4oe1xuXHRcdFx0XHRiYXI6ICdvaCBoaSEnLFxuXHRcdFx0XHRiYXo6IDQyLFxuXHRcdFx0XHRhbm90aGVyTWV0aG9kKGFyZzogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0XHRcdFx0cmV0dXJuIGlzTmFOKGFyZyk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0dHlwZUNoZWNrPElUZXN0T2JqZWN0Pihtb2NrKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRtb2NrLmJhcixcblx0XHRcdFx0J29oIGhpIScsXG5cdFx0XHRcdCdiYXIgc2hvdWxkIGJlIG92ZXJyaWRlbicsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1vY2suYmF6LFxuXHRcdFx0XHQ0Mixcblx0XHRcdFx0J2JheiBzaG91bGQgYmUgb3ZlcnJpZGVuJyxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydChcblx0XHRcdFx0IShtb2NrLmFub3RoZXJNZXRob2QoNDkwMjc0KSksXG5cdFx0XHRcdCdNdXN0IGV4ZWN1dGUgb3ZlcnJpZGVuIG1ldGhvZCBjb3JyZWN0bHkgMS4nLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRtb2NrLmFub3RoZXJNZXRob2QoTmFOKSxcblx0XHRcdFx0J011c3QgZXhlY3V0ZSBvdmVycmlkZW4gbWV0aG9kIGNvcnJlY3RseSAyLicsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0Ly8gcHJvcGVydHkgaXMgbm90IG92ZXJyaWRlbiBzbyBtdXN0IHRocm93XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLXVudXNlZC1leHByZXNzaW9uc1xuXHRcdFx0XHRtb2NrLmZvbztcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0Ly8gZnVuY3Rpb24gaXMgbm90IG92ZXJyaWRlbiBzbyBtdXN0IHRocm93XG5cdFx0XHRcdG1vY2suc29tZU1ldGhvZChyYW5kb21Cb29sZWFuKCkpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbW11dGFiaWxpdHkgb2YgdGhlIG92ZXJyaWRlcyBvYmplY3QnLCAoKSA9PiB7XG5cdFx0XHRpbnRlcmZhY2UgSVRlc3RPYmplY3Qge1xuXHRcdFx0XHRmb286IHN0cmluZztcblx0XHRcdFx0YmFyOiBzdHJpbmc7XG5cdFx0XHRcdHJlYWRvbmx5IGJhejogbnVtYmVyO1xuXHRcdFx0XHRzb21lTWV0aG9kKGFyZzogYm9vbGVhbik6IHN0cmluZztcblx0XHRcdFx0YW5vdGhlck1ldGhvZChhcmc6IG51bWJlcik6IGJvb2xlYW47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG92ZXJyaWRlczogUGFydGlhbDxJVGVzdE9iamVjdD4gPSB7XG5cdFx0XHRcdGJhejogNCxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBtb2NrID0gbW9ja09iamVjdDxJVGVzdE9iamVjdD4ob3ZlcnJpZGVzKTtcblx0XHRcdHR5cGVDaGVjazxJVGVzdE9iamVjdD4obW9jayk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0bW9jay5iYXosXG5cdFx0XHRcdDQsXG5cdFx0XHRcdCdiYXogc2hvdWxkIGJlIG92ZXJyaWRkZW4nLFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gb3ZlcnJpZGVzIG9iamVjdCBtdXN0IGJlIGltbXV0YWJsZVxuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdG92ZXJyaWRlcy5mb28gPSAndGVzdCc7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdG92ZXJyaWRlcy5zb21lTWV0aG9kID0gKGFyZzogYm9vbGVhbik6IHN0cmluZyA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIGAke2FyZ31fXyR7YXJnfWA7XG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ21vY2tTZXJ2aWNlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ292ZXJyaWRlcyBwcm9wZXJ0aWVzIGFuZCBmdW5jdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRpbnRlcmZhY2UgSVRlc3RTZXJ2aWNlIHtcblx0XHRcdFx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdFx0XHRwcm9wMTogc3RyaW5nO1xuXHRcdFx0XHRpZDogc3RyaW5nO1xuXHRcdFx0XHRyZWFkb25seSBjb3VudGVyOiBudW1iZXI7XG5cdFx0XHRcdG1ldGhvZDEoYXJnOiBib29sZWFuKTogc3RyaW5nO1xuXHRcdFx0XHR0ZXN0TWV0aG9kMihhcmc6IG51bWJlcik6IGJvb2xlYW47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vY2sgPSBtb2NrU2VydmljZTxJVGVzdFNlcnZpY2U+KHtcblx0XHRcdFx0aWQ6ICdjaWFvIScsXG5cdFx0XHRcdGNvdW50ZXI6IDc0LFxuXHRcdFx0XHR0ZXN0TWV0aG9kMihhcmc6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdFx0XHRcdHJldHVybiAhaXNOYU4oYXJnKTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHR0eXBlQ2hlY2s8SVRlc3RTZXJ2aWNlPihtb2NrKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRtb2NrLmlkLFxuXHRcdFx0XHQnY2lhbyEnLFxuXHRcdFx0XHQnaWQgc2hvdWxkIGJlIG92ZXJyaWRkZW4nLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRtb2NrLmNvdW50ZXIsXG5cdFx0XHRcdDc0LFxuXHRcdFx0XHQnY291bnRlciBzaG91bGQgYmUgb3ZlcnJpZGRlbicsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQoXG5cdFx0XHRcdG1vY2sudGVzdE1ldGhvZDIoNzQzNjgpLFxuXHRcdFx0XHQnTXVzdCBleGVjdXRlIG92ZXJyaWRkZW4gbWV0aG9kIGNvcnJlY3RseSAxLicsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQoXG5cdFx0XHRcdCEobW9jay50ZXN0TWV0aG9kMihOYU4pKSxcblx0XHRcdFx0J011c3QgZXhlY3V0ZSBvdmVycmlkZGVuIG1ldGhvZCBjb3JyZWN0bHkgMi4nLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdC8vIHByb3BlcnR5IGlzIG5vdCBvdmVycmlkZGVuIHNvIG11c3QgdGhyb3dcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tdW51c2VkLWV4cHJlc3Npb25zXG5cdFx0XHRcdG1vY2sucHJvcDE7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdC8vIGZ1bmN0aW9uIGlzIG5vdCBvdmVycmlkZGVuIHNvIG11c3QgdGhyb3dcblx0XHRcdFx0bW9jay5tZXRob2QxKHJhbmRvbUJvb2xlYW4oKSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ltbXV0YWJpbGl0eSBvZiB0aGUgb3ZlcnJpZGVzIG9iamVjdCcsICgpID0+IHtcblx0XHRcdGludGVyZmFjZSBJVGVzdFNlcnZpY2Uge1xuXHRcdFx0XHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGZvbzogc3RyaW5nO1xuXHRcdFx0XHRiYXI6IHN0cmluZztcblx0XHRcdFx0cmVhZG9ubHkgYmF6OiBib29sZWFuO1xuXHRcdFx0XHRzb21lTWV0aG9kKGFyZzogYm9vbGVhbik6IHN0cmluZztcblx0XHRcdFx0YW5vdGhlck1ldGhvZChhcmc6IG51bWJlcik6IGJvb2xlYW47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG92ZXJyaWRlczogUGFydGlhbDxJVGVzdFNlcnZpY2U+ID0ge1xuXHRcdFx0XHRiYXo6IGZhbHNlLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG1vY2sgPSBtb2NrU2VydmljZTxJVGVzdFNlcnZpY2U+KG92ZXJyaWRlcyk7XG5cdFx0XHR0eXBlQ2hlY2s8SVRlc3RTZXJ2aWNlPihtb2NrKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRtb2NrLmJheixcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdCdiYXogc2hvdWxkIGJlIG92ZXJyaWRkZW4nLFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gb3ZlcnJpZGVzIG9iamVjdCBtdXN0IGJlIGltbXV0YWJsZVxuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdG92ZXJyaWRlcy5mb28gPSAndGVzdCc7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdG92ZXJyaWRlcy5zb21lTWV0aG9kID0gKGFyZzogYm9vbGVhbik6IHN0cmluZyA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIGAke2FyZ31fXyR7YXJnfWA7XG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJt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
