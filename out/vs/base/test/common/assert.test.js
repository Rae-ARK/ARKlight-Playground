import assert from "assert";
import { ok, assert as commonAssert } from "../../common/assert.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
import { CancellationError, ReadonlyError } from "../../common/errors.js";
suite("Assert", () => {
  test("ok", () => {
    assert.throws(function() {
      ok(false);
    });
    assert.throws(function() {
      ok(null);
    });
    assert.throws(function() {
      ok();
    });
    assert.throws(function() {
      ok(null, "Foo Bar");
    }, function(e) {
      return e.message.indexOf("Foo Bar") >= 0;
    });
    ok(true);
    ok("foo");
    ok({});
    ok(5);
  });
  suite("throws a provided error object", () => {
    test("generic error", () => {
      const originalError = new Error("Oh no!");
      try {
        commonAssert(
          false,
          originalError
        );
      } catch (thrownError) {
        assert.strictEqual(
          thrownError,
          originalError,
          "Must throw the provided error instance."
        );
        assert.strictEqual(
          thrownError.message,
          "Oh no!",
          "Must throw the provided error instance."
        );
      }
    });
    test("cancellation error", () => {
      const originalError = new CancellationError();
      try {
        commonAssert(
          false,
          originalError
        );
      } catch (thrownError) {
        assert.strictEqual(
          thrownError,
          originalError,
          "Must throw the provided error instance."
        );
      }
    });
    test("readonly error", () => {
      const originalError = new ReadonlyError("World");
      try {
        commonAssert(
          false,
          originalError
        );
      } catch (thrownError) {
        assert.strictEqual(
          thrownError,
          originalError,
          "Must throw the provided error instance."
        );
        assert.strictEqual(
          thrownError.message,
          "World is read-only and cannot be changed",
          "Must throw the provided error instance."
        );
      }
    });
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vYXNzZXJ0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBvaywgYXNzZXJ0IGFzIGNvbW1vbkFzc2VydCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hc3NlcnQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciwgUmVhZG9ubHlFcnJvciB9IGZyb20gJy4uLy4uL2NvbW1vbi9lcnJvcnMuanMnO1xuXG5zdWl0ZSgnQXNzZXJ0JywgKCkgPT4ge1xuXHR0ZXN0KCdvaycsICgpID0+IHtcblx0XHRhc3NlcnQudGhyb3dzKGZ1bmN0aW9uICgpIHtcblx0XHRcdG9rKGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC50aHJvd3MoZnVuY3Rpb24gKCkge1xuXHRcdFx0b2sobnVsbCk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQudGhyb3dzKGZ1bmN0aW9uICgpIHtcblx0XHRcdG9rKCk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQudGhyb3dzKGZ1bmN0aW9uICgpIHtcblx0XHRcdG9rKG51bGwsICdGb28gQmFyJyk7XG5cdFx0fSwgZnVuY3Rpb24gKGU6IEVycm9yKSB7XG5cdFx0XHRyZXR1cm4gZS5tZXNzYWdlLmluZGV4T2YoJ0ZvbyBCYXInKSA+PSAwO1xuXHRcdH0pO1xuXG5cdFx0b2sodHJ1ZSk7XG5cdFx0b2soJ2ZvbycpO1xuXHRcdG9rKHt9KTtcblx0XHRvayg1KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Rocm93cyBhIHByb3ZpZGVkIGVycm9yIG9iamVjdCcsICgpID0+IHtcblx0XHR0ZXN0KCdnZW5lcmljIGVycm9yJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxFcnJvciA9IG5ldyBFcnJvcignT2ggbm8hJyk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbW1vbkFzc2VydChcblx0XHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0XHRvcmlnaW5hbEVycm9yLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBjYXRjaCAodGhyb3duRXJyb3IpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdHRocm93bkVycm9yLFxuXHRcdFx0XHRcdG9yaWdpbmFsRXJyb3IsXG5cdFx0XHRcdFx0J011c3QgdGhyb3cgdGhlIHByb3ZpZGVkIGVycm9yIGluc3RhbmNlLicsXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdHRocm93bkVycm9yLm1lc3NhZ2UsXG5cdFx0XHRcdFx0J09oIG5vIScsXG5cdFx0XHRcdFx0J011c3QgdGhyb3cgdGhlIHByb3ZpZGVkIGVycm9yIGluc3RhbmNlLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYW5jZWxsYXRpb24gZXJyb3InLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvcmlnaW5hbEVycm9yID0gbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbW1vbkFzc2VydChcblx0XHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0XHRvcmlnaW5hbEVycm9yLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBjYXRjaCAodGhyb3duRXJyb3IpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdHRocm93bkVycm9yLFxuXHRcdFx0XHRcdG9yaWdpbmFsRXJyb3IsXG5cdFx0XHRcdFx0J011c3QgdGhyb3cgdGhlIHByb3ZpZGVkIGVycm9yIGluc3RhbmNlLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkb25seSBlcnJvcicsICgpID0+IHtcblx0XHRcdGNvbnN0IG9yaWdpbmFsRXJyb3IgPSBuZXcgUmVhZG9ubHlFcnJvcignV29ybGQnKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29tbW9uQXNzZXJ0KFxuXHRcdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRcdG9yaWdpbmFsRXJyb3IsXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGNhdGNoICh0aHJvd25FcnJvcikge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0dGhyb3duRXJyb3IsXG5cdFx0XHRcdFx0b3JpZ2luYWxFcnJvcixcblx0XHRcdFx0XHQnTXVzdCB0aHJvdyB0aGUgcHJvdmlkZWQgZXJyb3IgaW5zdGFuY2UuJyxcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0dGhyb3duRXJyb3IubWVzc2FnZSxcblx0XHRcdFx0XHQnV29ybGQgaXMgcmVhZC1vbmx5IGFuZCBjYW5ub3QgYmUgY2hhbmdlZCcsXG5cdFx0XHRcdFx0J011c3QgdGhyb3cgdGhlIHByb3ZpZGVkIGVycm9yIGluc3RhbmNlLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxJQUFJLFVBQVUsb0JBQW9CO0FBQzNDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsbUJBQW1CLHFCQUFxQjtBQUVqRCxNQUFNLFVBQVUsTUFBTTtBQUNyQixPQUFLLE1BQU0sTUFBTTtBQUNoQixXQUFPLE9BQU8sV0FBWTtBQUN6QixTQUFHLEtBQUs7QUFBQSxJQUNULENBQUM7QUFFRCxXQUFPLE9BQU8sV0FBWTtBQUN6QixTQUFHLElBQUk7QUFBQSxJQUNSLENBQUM7QUFFRCxXQUFPLE9BQU8sV0FBWTtBQUN6QixTQUFHO0FBQUEsSUFDSixDQUFDO0FBRUQsV0FBTyxPQUFPLFdBQVk7QUFDekIsU0FBRyxNQUFNLFNBQVM7QUFBQSxJQUNuQixHQUFHLFNBQVUsR0FBVTtBQUN0QixhQUFPLEVBQUUsUUFBUSxRQUFRLFNBQVMsS0FBSztBQUFBLElBQ3hDLENBQUM7QUFFRCxPQUFHLElBQUk7QUFDUCxPQUFHLEtBQUs7QUFDUixPQUFHLENBQUMsQ0FBQztBQUNMLE9BQUcsQ0FBQztBQUFBLEVBQ0wsQ0FBQztBQUVELFFBQU0sa0NBQWtDLE1BQU07QUFDN0MsU0FBSyxpQkFBaUIsTUFBTTtBQUMzQixZQUFNLGdCQUFnQixJQUFJLE1BQU0sUUFBUTtBQUV4QyxVQUFJO0FBQ0g7QUFBQSxVQUNDO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELFNBQVMsYUFBYTtBQUNyQixlQUFPO0FBQUEsVUFDTjtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUVBLGVBQU87QUFBQSxVQUNOLFlBQVk7QUFBQSxVQUNaO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxzQkFBc0IsTUFBTTtBQUNoQyxZQUFNLGdCQUFnQixJQUFJLGtCQUFrQjtBQUU1QyxVQUFJO0FBQ0g7QUFBQSxVQUNDO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELFNBQVMsYUFBYTtBQUNyQixlQUFPO0FBQUEsVUFDTjtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLGtCQUFrQixNQUFNO0FBQzVCLFlBQU0sZ0JBQWdCLElBQUksY0FBYyxPQUFPO0FBRS9DLFVBQUk7QUFDSDtBQUFBLFVBQ0M7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0QsU0FBUyxhQUFhO0FBQ3JCLGVBQU87QUFBQSxVQUNOO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBRUEsZUFBTztBQUFBLFVBQ04sWUFBWTtBQUFBLFVBQ1o7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCwwQ0FBd0M7QUFDekMsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
