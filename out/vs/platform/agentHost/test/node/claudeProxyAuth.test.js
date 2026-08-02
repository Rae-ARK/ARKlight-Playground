import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { parseProxyBearer } from "../../node/claude/claudeProxyAuth.js";
const NONCE = "test-nonce-deadbeef";
suite("parseProxyBearer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("accepts Bearer <nonce>.<sessionId> with non-empty sessionId", () => {
    assert.deepStrictEqual(
      parseProxyBearer({ "authorization": `Bearer ${NONCE}.session-abc` }, NONCE),
      { valid: true, sessionId: "session-abc" }
    );
  });
  test("preserves dots inside the sessionId portion", () => {
    assert.deepStrictEqual(
      parseProxyBearer({ "authorization": `Bearer ${NONCE}.session.with.dots` }, NONCE),
      { valid: true, sessionId: "session.with.dots" }
    );
  });
  test("rejects missing Authorization header", () => {
    assert.deepStrictEqual(
      parseProxyBearer({}, NONCE),
      { valid: false, sessionId: void 0 }
    );
  });
  test("rejects non-Bearer Authorization scheme", () => {
    assert.deepStrictEqual(
      parseProxyBearer({ "authorization": `Basic ${NONCE}.s` }, NONCE),
      { valid: false, sessionId: void 0 }
    );
  });
  test("rejects Bearer with wrong nonce", () => {
    assert.deepStrictEqual(
      parseProxyBearer({ "authorization": "Bearer wrong-nonce.session-abc" }, NONCE),
      { valid: false, sessionId: void 0 }
    );
  });
  test("rejects Bearer <nonce> with no dot (legacy format not supported)", () => {
    assert.deepStrictEqual(
      parseProxyBearer({ "authorization": `Bearer ${NONCE}` }, NONCE),
      { valid: false, sessionId: void 0 }
    );
  });
  test("rejects Bearer <nonce>. with empty sessionId", () => {
    assert.deepStrictEqual(
      parseProxyBearer({ "authorization": `Bearer ${NONCE}.` }, NONCE),
      { valid: false, sessionId: void 0 }
    );
  });
  test("ignores x-api-key when only x-api-key is present", () => {
    assert.deepStrictEqual(
      parseProxyBearer({ "x-api-key": NONCE }, NONCE),
      { valid: false, sessionId: void 0 }
    );
  });
  test("uses Authorization header when both x-api-key and Authorization are present", () => {
    assert.deepStrictEqual(
      parseProxyBearer({
        "x-api-key": "sk-ant-real-api-key",
        "authorization": `Bearer ${NONCE}.s`
      }, NONCE),
      { valid: true, sessionId: "s" }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY2xhdWRlUHJveHlBdXRoLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHBhcnNlUHJveHlCZWFyZXIgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVQcm94eUF1dGguanMnO1xuXG5jb25zdCBOT05DRSA9ICd0ZXN0LW5vbmNlLWRlYWRiZWVmJztcblxuc3VpdGUoJ3BhcnNlUHJveHlCZWFyZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYWNjZXB0cyBCZWFyZXIgPG5vbmNlPi48c2Vzc2lvbklkPiB3aXRoIG5vbi1lbXB0eSBzZXNzaW9uSWQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBhcnNlUHJveHlCZWFyZXIoeyAnYXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtOT05DRX0uc2Vzc2lvbi1hYmNgIH0sIE5PTkNFKSxcblx0XHRcdHsgdmFsaWQ6IHRydWUsIHNlc3Npb25JZDogJ3Nlc3Npb24tYWJjJyB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBkb3RzIGluc2lkZSB0aGUgc2Vzc2lvbklkIHBvcnRpb24nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBhcnNlUHJveHlCZWFyZXIoeyAnYXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtOT05DRX0uc2Vzc2lvbi53aXRoLmRvdHNgIH0sIE5PTkNFKSxcblx0XHRcdHsgdmFsaWQ6IHRydWUsIHNlc3Npb25JZDogJ3Nlc3Npb24ud2l0aC5kb3RzJyB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgbWlzc2luZyBBdXRob3JpemF0aW9uIGhlYWRlcicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cGFyc2VQcm94eUJlYXJlcih7fSwgTk9OQ0UpLFxuXHRcdFx0eyB2YWxpZDogZmFsc2UsIHNlc3Npb25JZDogdW5kZWZpbmVkIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBub24tQmVhcmVyIEF1dGhvcml6YXRpb24gc2NoZW1lJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwYXJzZVByb3h5QmVhcmVyKHsgJ2F1dGhvcml6YXRpb24nOiBgQmFzaWMgJHtOT05DRX0uc2AgfSwgTk9OQ0UpLFxuXHRcdFx0eyB2YWxpZDogZmFsc2UsIHNlc3Npb25JZDogdW5kZWZpbmVkIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBCZWFyZXIgd2l0aCB3cm9uZyBub25jZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cGFyc2VQcm94eUJlYXJlcih7ICdhdXRob3JpemF0aW9uJzogJ0JlYXJlciB3cm9uZy1ub25jZS5zZXNzaW9uLWFiYycgfSwgTk9OQ0UpLFxuXHRcdFx0eyB2YWxpZDogZmFsc2UsIHNlc3Npb25JZDogdW5kZWZpbmVkIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBCZWFyZXIgPG5vbmNlPiB3aXRoIG5vIGRvdCAobGVnYWN5IGZvcm1hdCBub3Qgc3VwcG9ydGVkKScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cGFyc2VQcm94eUJlYXJlcih7ICdhdXRob3JpemF0aW9uJzogYEJlYXJlciAke05PTkNFfWAgfSwgTk9OQ0UpLFxuXHRcdFx0eyB2YWxpZDogZmFsc2UsIHNlc3Npb25JZDogdW5kZWZpbmVkIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBCZWFyZXIgPG5vbmNlPi4gd2l0aCBlbXB0eSBzZXNzaW9uSWQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBhcnNlUHJveHlCZWFyZXIoeyAnYXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtOT05DRX0uYCB9LCBOT05DRSksXG5cdFx0XHR7IHZhbGlkOiBmYWxzZSwgc2Vzc2lvbklkOiB1bmRlZmluZWQgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIHgtYXBpLWtleSB3aGVuIG9ubHkgeC1hcGkta2V5IGlzIHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBhcnNlUHJveHlCZWFyZXIoeyAneC1hcGkta2V5JzogTk9OQ0UgfSwgTk9OQ0UpLFxuXHRcdFx0eyB2YWxpZDogZmFsc2UsIHNlc3Npb25JZDogdW5kZWZpbmVkIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBBdXRob3JpemF0aW9uIGhlYWRlciB3aGVuIGJvdGggeC1hcGkta2V5IGFuZCBBdXRob3JpemF0aW9uIGFyZSBwcmVzZW50JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwYXJzZVByb3h5QmVhcmVyKHtcblx0XHRcdFx0J3gtYXBpLWtleSc6ICdzay1hbnQtcmVhbC1hcGkta2V5Jyxcblx0XHRcdFx0J2F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7Tk9OQ0V9LnNgLFxuXHRcdFx0fSwgTk9OQ0UpLFxuXHRcdFx0eyB2YWxpZDogdHJ1ZSwgc2Vzc2lvbklkOiAncycgfSxcblx0XHQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsd0JBQXdCO0FBRWpDLE1BQU0sUUFBUTtBQUVkLE1BQU0sb0JBQW9CLE1BQU07QUFFL0IsMENBQXdDO0FBRXhDLE9BQUssK0RBQStELE1BQU07QUFDekUsV0FBTztBQUFBLE1BQ04saUJBQWlCLEVBQUUsaUJBQWlCLFVBQVUsS0FBSyxlQUFlLEdBQUcsS0FBSztBQUFBLE1BQzFFLEVBQUUsT0FBTyxNQUFNLFdBQVcsY0FBYztBQUFBLElBQ3pDO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywrQ0FBK0MsTUFBTTtBQUN6RCxXQUFPO0FBQUEsTUFDTixpQkFBaUIsRUFBRSxpQkFBaUIsVUFBVSxLQUFLLHFCQUFxQixHQUFHLEtBQUs7QUFBQSxNQUNoRixFQUFFLE9BQU8sTUFBTSxXQUFXLG9CQUFvQjtBQUFBLElBQy9DO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyx3Q0FBd0MsTUFBTTtBQUNsRCxXQUFPO0FBQUEsTUFDTixpQkFBaUIsQ0FBQyxHQUFHLEtBQUs7QUFBQSxNQUMxQixFQUFFLE9BQU8sT0FBTyxXQUFXLE9BQVU7QUFBQSxJQUN0QztBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssMkNBQTJDLE1BQU07QUFDckQsV0FBTztBQUFBLE1BQ04saUJBQWlCLEVBQUUsaUJBQWlCLFNBQVMsS0FBSyxLQUFLLEdBQUcsS0FBSztBQUFBLE1BQy9ELEVBQUUsT0FBTyxPQUFPLFdBQVcsT0FBVTtBQUFBLElBQ3RDO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxtQ0FBbUMsTUFBTTtBQUM3QyxXQUFPO0FBQUEsTUFDTixpQkFBaUIsRUFBRSxpQkFBaUIsaUNBQWlDLEdBQUcsS0FBSztBQUFBLE1BQzdFLEVBQUUsT0FBTyxPQUFPLFdBQVcsT0FBVTtBQUFBLElBQ3RDO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxvRUFBb0UsTUFBTTtBQUM5RSxXQUFPO0FBQUEsTUFDTixpQkFBaUIsRUFBRSxpQkFBaUIsVUFBVSxLQUFLLEdBQUcsR0FBRyxLQUFLO0FBQUEsTUFDOUQsRUFBRSxPQUFPLE9BQU8sV0FBVyxPQUFVO0FBQUEsSUFDdEM7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGdEQUFnRCxNQUFNO0FBQzFELFdBQU87QUFBQSxNQUNOLGlCQUFpQixFQUFFLGlCQUFpQixVQUFVLEtBQUssSUFBSSxHQUFHLEtBQUs7QUFBQSxNQUMvRCxFQUFFLE9BQU8sT0FBTyxXQUFXLE9BQVU7QUFBQSxJQUN0QztBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssb0RBQW9ELE1BQU07QUFDOUQsV0FBTztBQUFBLE1BQ04saUJBQWlCLEVBQUUsYUFBYSxNQUFNLEdBQUcsS0FBSztBQUFBLE1BQzlDLEVBQUUsT0FBTyxPQUFPLFdBQVcsT0FBVTtBQUFBLElBQ3RDO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywrRUFBK0UsTUFBTTtBQUN6RixXQUFPO0FBQUEsTUFDTixpQkFBaUI7QUFBQSxRQUNoQixhQUFhO0FBQUEsUUFDYixpQkFBaUIsVUFBVSxLQUFLO0FBQUEsTUFDakMsR0FBRyxLQUFLO0FBQUEsTUFDUixFQUFFLE9BQU8sTUFBTSxXQUFXLElBQUk7QUFBQSxJQUMvQjtBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
