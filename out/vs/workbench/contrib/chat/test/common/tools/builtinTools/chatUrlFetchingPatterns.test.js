import assert from "assert";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { extractUrlPatterns, getPatternLabel, isUrlApproved, getMatchingPattern } from "../../../../common/tools/builtinTools/chatUrlFetchingPatterns.js";
suite("ChatUrlFetchingPatterns", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("extractUrlPatterns", () => {
    test("simple domain", () => {
      const url = URI.parse("https://example.com");
      const patterns = extractUrlPatterns(url);
      assert.deepStrictEqual(patterns, [
        "https://example.com"
      ]);
    });
    test("subdomain", () => {
      const url = URI.parse("https://api.example.com");
      const patterns = extractUrlPatterns(url);
      assert.deepStrictEqual(patterns, [
        "https://api.example.com",
        "https://*.example.com"
      ]);
    });
    test("multiple subdomains", () => {
      const url = URI.parse("https://foo.bar.example.com/path");
      const patterns = extractUrlPatterns(url);
      assert.deepStrictEqual(patterns, [
        "https://foo.bar.example.com/path",
        "https://foo.bar.example.com",
        "https://*.bar.example.com",
        "https://*.example.com"
      ]);
    });
    test("with path", () => {
      const url = URI.parse("https://example.com/api/v1/users");
      const patterns = extractUrlPatterns(url);
      assert.deepStrictEqual(patterns, [
        "https://example.com/api/v1/users",
        "https://example.com",
        "https://example.com/api/v1",
        "https://example.com/api"
      ]);
    });
    test("IP address - no wildcard subdomain", () => {
      const url = URI.parse("https://192.168.1.1");
      const patterns = extractUrlPatterns(url);
      assert.strictEqual(patterns.filter((p) => p.includes("*")).length, 0);
    });
    test("with query and fragment", () => {
      const url = URI.parse("https://example.com/path?query=1#fragment");
      const patterns = extractUrlPatterns(url);
      assert.deepStrictEqual(patterns, [
        "https://example.com/path?query=1#fragment",
        "https://example.com"
      ]);
    });
  });
  suite("getPatternLabel", () => {
    test("removes https protocol", () => {
      const url = URI.parse("https://example.com");
      const label = getPatternLabel(url, "https://example.com");
      assert.strictEqual(label, "example.com");
    });
    test("removes http protocol", () => {
      const url = URI.parse("http://example.com");
      const label = getPatternLabel(url, "http://example.com");
      assert.strictEqual(label, "example.com");
    });
    test("removes trailing slashes", () => {
      const url = URI.parse("https://example.com/");
      const label = getPatternLabel(url, "https://example.com/");
      assert.strictEqual(label, "example.com");
    });
    test("preserves path", () => {
      const url = URI.parse("https://example.com/api/v1");
      const label = getPatternLabel(url, "https://example.com/api/v1");
      assert.strictEqual(label, "example.com/api/v1");
    });
  });
  suite("isUrlApproved", () => {
    test("exact match with boolean", () => {
      const url = URI.parse("https://example.com");
      const approved = { "https://example.com": true };
      assert.strictEqual(isUrlApproved(url, approved, true), true);
      assert.strictEqual(isUrlApproved(url, approved, false), true);
    });
    test("no match returns false", () => {
      const url = URI.parse("https://example.com");
      const approved = { "https://other.com": true };
      assert.strictEqual(isUrlApproved(url, approved, true), false);
    });
    test("wildcard subdomain match", () => {
      const url = URI.parse("https://api.example.com");
      const approved = { "https://*.example.com": true };
      assert.strictEqual(isUrlApproved(url, approved, true), true);
    });
    test("path wildcard match", () => {
      const url = URI.parse("https://example.com/api/users");
      const approved = { "https://example.com/api/*": true };
      assert.strictEqual(isUrlApproved(url, approved, true), true);
    });
    test("granular settings - request approved", () => {
      const url = URI.parse("https://example.com");
      const approved = {
        "https://example.com": { approveRequest: true, approveResponse: false }
      };
      assert.strictEqual(isUrlApproved(url, approved, true), true);
      assert.strictEqual(isUrlApproved(url, approved, false), false);
    });
    test("granular settings - response approved", () => {
      const url = URI.parse("https://example.com");
      const approved = {
        "https://example.com": { approveRequest: false, approveResponse: true }
      };
      assert.strictEqual(isUrlApproved(url, approved, true), false);
      assert.strictEqual(isUrlApproved(url, approved, false), true);
    });
    test("granular settings - both approved", () => {
      const url = URI.parse("https://example.com");
      const approved = {
        "https://example.com": { approveRequest: true, approveResponse: true }
      };
      assert.strictEqual(isUrlApproved(url, approved, true), true);
      assert.strictEqual(isUrlApproved(url, approved, false), true);
    });
    test("granular settings - missing property defaults to false", () => {
      const url = URI.parse("https://example.com");
      const approved = {
        "https://example.com": { approveRequest: true }
      };
      assert.strictEqual(isUrlApproved(url, approved, false), false);
    });
  });
  suite("getMatchingPattern", () => {
    test("exact match", () => {
      const url = URI.parse("https://example.com/path");
      const approved = { "https://example.com/path": true };
      const pattern = getMatchingPattern(url, approved);
      assert.strictEqual(pattern, "https://example.com/path");
    });
    test("wildcard match", () => {
      const url = URI.parse("https://api.example.com");
      const approved = { "https://*.example.com": true };
      const pattern = getMatchingPattern(url, approved);
      assert.strictEqual(pattern, "https://*.example.com");
    });
    test("no match returns undefined", () => {
      const url = URI.parse("https://example.com");
      const approved = { "https://other.com": true };
      const pattern = getMatchingPattern(url, approved);
      assert.strictEqual(pattern, void 0);
    });
    test("most specific match", () => {
      const url = URI.parse("https://api.example.com/v1/users");
      const approved = {
        "https://*.example.com": true,
        "https://api.example.com": true,
        "https://api.example.com/v1/*": true
      };
      const pattern = getMatchingPattern(url, approved);
      assert.ok(pattern !== void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vdG9vbHMvYnVpbHRpblRvb2xzL2NoYXRVcmxGZXRjaGluZ1BhdHRlcm5zLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBleHRyYWN0VXJsUGF0dGVybnMsIGdldFBhdHRlcm5MYWJlbCwgaXNVcmxBcHByb3ZlZCwgZ2V0TWF0Y2hpbmdQYXR0ZXJuLCBJVXJsQXBwcm92YWxTZXR0aW5ncyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9idWlsdGluVG9vbHMvY2hhdFVybEZldGNoaW5nUGF0dGVybnMuanMnO1xuXG5zdWl0ZSgnQ2hhdFVybEZldGNoaW5nUGF0dGVybnMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdleHRyYWN0VXJsUGF0dGVybnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2ltcGxlIGRvbWFpbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHVybCA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbScpO1xuXHRcdFx0Y29uc3QgcGF0dGVybnMgPSBleHRyYWN0VXJsUGF0dGVybnModXJsKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGF0dGVybnMsIFtcblx0XHRcdFx0J2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdWJkb21haW4nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmwgPSBVUkkucGFyc2UoJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tJyk7XG5cdFx0XHRjb25zdCBwYXR0ZXJucyA9IGV4dHJhY3RVcmxQYXR0ZXJucyh1cmwpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXR0ZXJucywgW1xuXHRcdFx0XHQnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLFxuXHRcdFx0XHQnaHR0cHM6Ly8qLmV4YW1wbGUuY29tJ1xuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aXBsZSBzdWJkb21haW5zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJsID0gVVJJLnBhcnNlKCdodHRwczovL2Zvby5iYXIuZXhhbXBsZS5jb20vcGF0aCcpO1xuXHRcdFx0Y29uc3QgcGF0dGVybnMgPSBleHRyYWN0VXJsUGF0dGVybnModXJsKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGF0dGVybnMsIFtcblx0XHRcdFx0J2h0dHBzOi8vZm9vLmJhci5leGFtcGxlLmNvbS9wYXRoJyxcblx0XHRcdFx0J2h0dHBzOi8vZm9vLmJhci5leGFtcGxlLmNvbScsXG5cdFx0XHRcdCdodHRwczovLyouYmFyLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0J2h0dHBzOi8vKi5leGFtcGxlLmNvbScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dpdGggcGF0aCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVybCA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEvdXNlcnMnKTtcblx0XHRcdGNvbnN0IHBhdHRlcm5zID0gZXh0cmFjdFVybFBhdHRlcm5zKHVybCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhdHRlcm5zLCBbXG5cdFx0XHRcdCdodHRwczovL2V4YW1wbGUuY29tL2FwaS92MS91c2VycycsXG5cdFx0XHRcdCdodHRwczovL2V4YW1wbGUuY29tJyxcblx0XHRcdFx0J2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpL3YxJyxcblx0XHRcdFx0J2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnSVAgYWRkcmVzcyAtIG5vIHdpbGRjYXJkIHN1YmRvbWFpbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHVybCA9IFVSSS5wYXJzZSgnaHR0cHM6Ly8xOTIuMTY4LjEuMScpO1xuXHRcdFx0Y29uc3QgcGF0dGVybnMgPSBleHRyYWN0VXJsUGF0dGVybnModXJsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXR0ZXJucy5maWx0ZXIocCA9PiBwLmluY2x1ZGVzKCcqJykpLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aXRoIHF1ZXJ5IGFuZCBmcmFnbWVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVybCA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYXRoP3F1ZXJ5PTEjZnJhZ21lbnQnKTtcblx0XHRcdGNvbnN0IHBhdHRlcm5zID0gZXh0cmFjdFVybFBhdHRlcm5zKHVybCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhdHRlcm5zLCBbXG5cdFx0XHRcdCdodHRwczovL2V4YW1wbGUuY29tL3BhdGg/cXVlcnk9MSNmcmFnbWVudCcsXG5cdFx0XHRcdCdodHRwczovL2V4YW1wbGUuY29tJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0UGF0dGVybkxhYmVsJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JlbW92ZXMgaHR0cHMgcHJvdG9jb2wnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmwgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20nKTtcblx0XHRcdGNvbnN0IGxhYmVsID0gZ2V0UGF0dGVybkxhYmVsKHVybCwgJ2h0dHBzOi8vZXhhbXBsZS5jb20nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbCwgJ2V4YW1wbGUuY29tJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmVzIGh0dHAgcHJvdG9jb2wnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmwgPSBVUkkucGFyc2UoJ2h0dHA6Ly9leGFtcGxlLmNvbScpO1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBnZXRQYXR0ZXJuTGFiZWwodXJsLCAnaHR0cDovL2V4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFiZWwsICdleGFtcGxlLmNvbScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlcyB0cmFpbGluZyBzbGFzaGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJsID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tLycpO1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBnZXRQYXR0ZXJuTGFiZWwodXJsLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbCwgJ2V4YW1wbGUuY29tJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgcGF0aCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVybCA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEnKTtcblx0XHRcdGNvbnN0IGxhYmVsID0gZ2V0UGF0dGVybkxhYmVsKHVybCwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpL3YxJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFiZWwsICdleGFtcGxlLmNvbS9hcGkvdjEnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2lzVXJsQXBwcm92ZWQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZXhhY3QgbWF0Y2ggd2l0aCBib29sZWFuJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJsID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tJyk7XG5cdFx0XHRjb25zdCBhcHByb3ZlZCA9IHsgJ2h0dHBzOi8vZXhhbXBsZS5jb20nOiB0cnVlIH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVcmxBcHByb3ZlZCh1cmwsIGFwcHJvdmVkLCB0cnVlKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVcmxBcHByb3ZlZCh1cmwsIGFwcHJvdmVkLCBmYWxzZSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm8gbWF0Y2ggcmV0dXJucyBmYWxzZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHVybCA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbScpO1xuXHRcdFx0Y29uc3QgYXBwcm92ZWQgPSB7ICdodHRwczovL290aGVyLmNvbSc6IHRydWUgfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VybEFwcHJvdmVkKHVybCwgYXBwcm92ZWQsIHRydWUpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aWxkY2FyZCBzdWJkb21haW4gbWF0Y2gnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmwgPSBVUkkucGFyc2UoJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tJyk7XG5cdFx0XHRjb25zdCBhcHByb3ZlZCA9IHsgJ2h0dHBzOi8vKi5leGFtcGxlLmNvbSc6IHRydWUgfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VybEFwcHJvdmVkKHVybCwgYXBwcm92ZWQsIHRydWUpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhdGggd2lsZGNhcmQgbWF0Y2gnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmwgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpL3VzZXJzJyk7XG5cdFx0XHRjb25zdCBhcHByb3ZlZCA9IHsgJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpLyonOiB0cnVlIH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVcmxBcHByb3ZlZCh1cmwsIGFwcHJvdmVkLCB0cnVlKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdncmFudWxhciBzZXR0aW5ncyAtIHJlcXVlc3QgYXBwcm92ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmwgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20nKTtcblx0XHRcdGNvbnN0IGFwcHJvdmVkOiBSZWNvcmQ8c3RyaW5nLCBJVXJsQXBwcm92YWxTZXR0aW5ncz4gPSB7XG5cdFx0XHRcdCdodHRwczovL2V4YW1wbGUuY29tJzogeyBhcHByb3ZlUmVxdWVzdDogdHJ1ZSwgYXBwcm92ZVJlc3BvbnNlOiBmYWxzZSB9XG5cdFx0XHR9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVXJsQXBwcm92ZWQodXJsLCBhcHByb3ZlZCwgdHJ1ZSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVXJsQXBwcm92ZWQodXJsLCBhcHByb3ZlZCwgZmFsc2UpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdncmFudWxhciBzZXR0aW5ncyAtIHJlc3BvbnNlIGFwcHJvdmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJsID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tJyk7XG5cdFx0XHRjb25zdCBhcHByb3ZlZDogUmVjb3JkPHN0cmluZywgSVVybEFwcHJvdmFsU2V0dGluZ3M+ID0ge1xuXHRcdFx0XHQnaHR0cHM6Ly9leGFtcGxlLmNvbSc6IHsgYXBwcm92ZVJlcXVlc3Q6IGZhbHNlLCBhcHByb3ZlUmVzcG9uc2U6IHRydWUgfVxuXHRcdFx0fTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VybEFwcHJvdmVkKHVybCwgYXBwcm92ZWQsIHRydWUpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVcmxBcHByb3ZlZCh1cmwsIGFwcHJvdmVkLCBmYWxzZSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ3JhbnVsYXIgc2V0dGluZ3MgLSBib3RoIGFwcHJvdmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJsID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tJyk7XG5cdFx0XHRjb25zdCBhcHByb3ZlZDogUmVjb3JkPHN0cmluZywgSVVybEFwcHJvdmFsU2V0dGluZ3M+ID0ge1xuXHRcdFx0XHQnaHR0cHM6Ly9leGFtcGxlLmNvbSc6IHsgYXBwcm92ZVJlcXVlc3Q6IHRydWUsIGFwcHJvdmVSZXNwb25zZTogdHJ1ZSB9XG5cdFx0XHR9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVXJsQXBwcm92ZWQodXJsLCBhcHByb3ZlZCwgdHJ1ZSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVXJsQXBwcm92ZWQodXJsLCBhcHByb3ZlZCwgZmFsc2UpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dyYW51bGFyIHNldHRpbmdzIC0gbWlzc2luZyBwcm9wZXJ0eSBkZWZhdWx0cyB0byBmYWxzZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHVybCA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbScpO1xuXHRcdFx0Y29uc3QgYXBwcm92ZWQ6IFJlY29yZDxzdHJpbmcsIElVcmxBcHByb3ZhbFNldHRpbmdzPiA9IHtcblx0XHRcdFx0J2h0dHBzOi8vZXhhbXBsZS5jb20nOiB7IGFwcHJvdmVSZXF1ZXN0OiB0cnVlIH1cblx0XHRcdH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVcmxBcHByb3ZlZCh1cmwsIGFwcHJvdmVkLCBmYWxzZSksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldE1hdGNoaW5nUGF0dGVybicsICgpID0+IHtcblx0XHR0ZXN0KCdleGFjdCBtYXRjaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVybCA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYXRoJyk7XG5cdFx0XHRjb25zdCBhcHByb3ZlZCA9IHsgJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGF0aCc6IHRydWUgfTtcblx0XHRcdGNvbnN0IHBhdHRlcm4gPSBnZXRNYXRjaGluZ1BhdHRlcm4odXJsLCBhcHByb3ZlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0dGVybiwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGF0aCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2lsZGNhcmQgbWF0Y2gnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmwgPSBVUkkucGFyc2UoJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tJyk7XG5cdFx0XHRjb25zdCBhcHByb3ZlZCA9IHsgJ2h0dHBzOi8vKi5leGFtcGxlLmNvbSc6IHRydWUgfTtcblx0XHRcdGNvbnN0IHBhdHRlcm4gPSBnZXRNYXRjaGluZ1BhdHRlcm4odXJsLCBhcHByb3ZlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0dGVybiwgJ2h0dHBzOi8vKi5leGFtcGxlLmNvbScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm8gbWF0Y2ggcmV0dXJucyB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmwgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20nKTtcblx0XHRcdGNvbnN0IGFwcHJvdmVkID0geyAnaHR0cHM6Ly9vdGhlci5jb20nOiB0cnVlIH07XG5cdFx0XHRjb25zdCBwYXR0ZXJuID0gZ2V0TWF0Y2hpbmdQYXR0ZXJuKHVybCwgYXBwcm92ZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdHRlcm4sIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb3N0IHNwZWNpZmljIG1hdGNoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJsID0gVVJJLnBhcnNlKCdodHRwczovL2FwaS5leGFtcGxlLmNvbS92MS91c2VycycpO1xuXHRcdFx0Y29uc3QgYXBwcm92ZWQgPSB7XG5cdFx0XHRcdCdodHRwczovLyouZXhhbXBsZS5jb20nOiB0cnVlLFxuXHRcdFx0XHQnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nOiB0cnVlLFxuXHRcdFx0XHQnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20vdjEvKic6IHRydWVcblx0XHRcdH07XG5cdFx0XHRjb25zdCBwYXR0ZXJuID0gZ2V0TWF0Y2hpbmdQYXR0ZXJuKHVybCwgYXBwcm92ZWQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBhdHRlcm4gIT09IHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsb0JBQW9CLGlCQUFpQixlQUFlLDBCQUFnRDtBQUU3RyxNQUFNLDJCQUEyQixNQUFNO0FBQ3RDLDBDQUF3QztBQUV4QyxRQUFNLHNCQUFzQixNQUFNO0FBQ2pDLFNBQUssaUJBQWlCLE1BQU07QUFDM0IsWUFBTSxNQUFNLElBQUksTUFBTSxxQkFBcUI7QUFDM0MsWUFBTSxXQUFXLG1CQUFtQixHQUFHO0FBQ3ZDLGFBQU8sZ0JBQWdCLFVBQVU7QUFBQSxRQUNoQztBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Ys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WUFBWSxjQUFjLEtBQUssVUFBVSxJQUFJLEdBQUcsSUFBSTtBQUMzRCxhQUFPLFlBQVksY0FBYyxLQUFLLFVBQVUsS0FBSyxHQUFHLElBQUk7QUFBQSxJQUM3RCxDQUFDO0FBRUQsU0FBSywwREFBMEQsTUFBTTtBQUNwRSxZQUFNLE1BQU0sSUFBSSxNQUFNLHFCQUFxQjtBQUMzQyxZQUFNLFdBQWlEO0FBQUEsUUFDdEQsdUJBQXVCLEVBQUUsZ0JBQWdCLEtBQUs7QUFBQSxNQUMvQztBQUNBLGFBQU8sWUFBWSxjQUFjLEtBQUssVUFBVSxLQUFLLEdBQUcsS0FBSztBQUFBLElBQzlELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHNCQUFzQixNQUFNO0FBQ2pDLFNBQUssZUFBZSxNQUFNO0FBQ3pCLFlBQU0sTUFBTSxJQUFJLE1BQU0sMEJBQTBCO0FBQ2hELFlBQU0sV0FBVyxFQUFFLDRCQUE0QixLQUFLO0FBQ3BELFlBQU0sVUFBVSxtQkFBbUIsS0FBSyxRQUFRO0FBQ2hELGFBQU8sWUFBWSxTQUFTLDBCQUEwQjtBQUFBLElBQ3ZELENBQUM7QUFFRCxTQUFLLGtCQUFrQixNQUFNO0FBQzVCLFlBQU0sTUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQy9DLFlBQU0sV0FBVyxFQUFFLHlCQUF5QixLQUFLO0FBQ2pELFlBQU0sVUFBVSxtQkFBbUIsS0FBSyxRQUFRO0FBQ2hELGFBQU8sWUFBWSxTQUFTLHVCQUF1QjtBQUFBLElBQ3BELENBQUM7QUFFRCxTQUFLLDhCQUE4QixNQUFNO0FBQ3hDLFlBQU0sTUFBTSxJQUFJLE1BQU0scUJBQXFCO0FBQzNDLFlBQU0sV0FBVyxFQUFFLHFCQUFxQixLQUFLO0FBQzdDLFlBQU0sVUFBVSxtQkFBbUIsS0FBSyxRQUFRO0FBQ2hELGFBQU8sWUFBWSxTQUFTLE1BQVM7QUFBQSxJQUN0QyxDQUFDO0FBRUQsU0FBSyx1QkFBdUIsTUFBTTtBQUNqQyxZQUFNLE1BQU0sSUFBSSxNQUFNLGtDQUFrQztBQUN4RCxZQUFNLFdBQVc7QUFBQSxRQUNoQix5QkFBeUI7QUFBQSxRQUN6QiwyQkFBMkI7QUFBQSxRQUMzQixnQ0FBZ0M7QUFBQSxNQUNqQztBQUNBLFlBQU0sVUFBVSxtQkFBbUIsS0FBSyxRQUFRO0FBQ2hELGFBQU8sR0FBRyxZQUFZLE1BQVM7QUFBQSxJQUNoQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
