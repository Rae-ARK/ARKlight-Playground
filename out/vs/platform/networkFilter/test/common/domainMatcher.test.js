import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { normalizeDomain, extractDomainPattern, matchesDomainPattern, extractDomainFromUri, isDomainAllowed } from "../../common/domainMatcher.js";
suite("domainMatcher", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("normalizeDomain", () => {
    test("returns undefined for empty/falsy input", () => {
      assert.deepStrictEqual(
        [normalizeDomain(void 0), normalizeDomain(""), normalizeDomain("  ")],
        [void 0, void 0, void 0]
      );
    });
    test("lowercases and trims", () => {
      assert.strictEqual(normalizeDomain("  Example.COM  "), "example.com");
    });
    test("strips user info", () => {
      assert.strictEqual(normalizeDomain("user@example.com"), "example.com");
    });
    test("strips port", () => {
      assert.strictEqual(normalizeDomain("example.com:8080"), "example.com");
    });
    test("strips trailing dots", () => {
      assert.strictEqual(normalizeDomain("example.com.."), "example.com");
    });
    test("rejects paths", () => {
      assert.strictEqual(normalizeDomain("example.com/path"), void 0);
    });
    test("rejects . and ..", () => {
      assert.deepStrictEqual(
        [normalizeDomain("."), normalizeDomain("..")],
        [void 0, void 0]
      );
    });
    test("accepts bare wildcard", () => {
      assert.strictEqual(normalizeDomain("*"), "*");
    });
    test("accepts wildcard prefix", () => {
      assert.strictEqual(normalizeDomain("*.example.com"), "*.example.com");
    });
    test("strips trailing punctuation", () => {
      assert.strictEqual(normalizeDomain("example.com,"), "example.com");
      assert.strictEqual(normalizeDomain("example.com;"), "example.com");
      assert.strictEqual(normalizeDomain("example.com)"), "example.com");
    });
    test("rejects file-extension-like TLDs when not from URL", () => {
      assert.strictEqual(normalizeDomain("foo.js"), void 0);
      assert.strictEqual(normalizeDomain("foo.json"), void 0);
      assert.strictEqual(normalizeDomain("foo.ts"), void 0);
    });
    test("allows file-extension-like TLDs when fromUrl is true", () => {
      assert.strictEqual(normalizeDomain("foo.js", true), "foo.js");
    });
    test("rejects invalid characters", () => {
      assert.strictEqual(normalizeDomain("exam ple.com"), void 0);
      assert.strictEqual(normalizeDomain("example!.com"), void 0);
    });
    test("handles complex valid domains", () => {
      assert.strictEqual(normalizeDomain("sub.domain.example.com"), "sub.domain.example.com");
    });
  });
  suite("extractDomainPattern", () => {
    test("returns trimmed input when no scheme", () => {
      assert.strictEqual(extractDomainPattern("  example.com  "), "example.com");
    });
    test("returns bare wildcard as-is", () => {
      assert.strictEqual(extractDomainPattern("*"), "*");
    });
    test("extracts authority from URL", () => {
      assert.strictEqual(extractDomainPattern("https://example.com/path"), "example.com");
    });
    test("extracts authority with port from URL", () => {
      assert.strictEqual(extractDomainPattern("http://example.com:8080/path"), "example.com:8080");
    });
  });
  suite("matchesDomainPattern", () => {
    test("exact match", () => {
      assert.strictEqual(matchesDomainPattern("example.com", "example.com"), true);
      assert.strictEqual(matchesDomainPattern("example.com", "other.com"), false);
    });
    test("case insensitive", () => {
      assert.strictEqual(matchesDomainPattern("example.com", "Example.COM"), true);
    });
    test("bare wildcard matches anything", () => {
      assert.strictEqual(matchesDomainPattern("example.com", "*"), true);
      assert.strictEqual(matchesDomainPattern("anything.test", "*"), true);
    });
    test("wildcard prefix matches subdomains", () => {
      assert.strictEqual(matchesDomainPattern("sub.example.com", "*.example.com"), true);
      assert.strictEqual(matchesDomainPattern("deep.sub.example.com", "*.example.com"), true);
      assert.strictEqual(matchesDomainPattern("example.com", "*.example.com"), true);
    });
    test("wildcard prefix does not match unrelated domains", () => {
      assert.strictEqual(matchesDomainPattern("notexample.com", "*.example.com"), false);
    });
    test("matches domain from URL pattern", () => {
      assert.strictEqual(matchesDomainPattern("example.com", "https://example.com/page"), true);
    });
    test("returns false for invalid pattern", () => {
      assert.strictEqual(matchesDomainPattern("example.com", ""), false);
    });
  });
  suite("extractDomainFromUri", () => {
    test("extracts domain from https URI", () => {
      assert.strictEqual(extractDomainFromUri(URI.parse("https://example.com/path")), "example.com");
    });
    test("strips port", () => {
      assert.strictEqual(extractDomainFromUri(URI.parse("https://example.com:443/path")), "example.com");
    });
    test("returns undefined for empty authority", () => {
      assert.strictEqual(extractDomainFromUri(URI.from({ scheme: "file", path: "/tmp/test" })), void 0);
    });
  });
  suite("isDomainAllowed", () => {
    test("denies everything when both lists empty", () => {
      assert.strictEqual(isDomainAllowed("example.com", [], []), false);
    });
    test("denied takes precedence over allowed", () => {
      assert.strictEqual(isDomainAllowed("evil.com", ["*.com"], ["evil.com"]), false);
    });
    test("allowed list restricts to matching domains", () => {
      assert.strictEqual(isDomainAllowed("example.com", ["example.com"], []), true);
      assert.strictEqual(isDomainAllowed("other.com", ["example.com"], []), false);
    });
    test("deny-only config allows non-denied domains", () => {
      assert.strictEqual(isDomainAllowed("good.com", [], ["evil.com"]), true);
      assert.strictEqual(isDomainAllowed("evil.com", [], ["evil.com"]), false);
    });
    test("wildcard allowed with specific deny", () => {
      assert.strictEqual(isDomainAllowed("safe.com", ["*"], ["evil.com"]), true);
      assert.strictEqual(isDomainAllowed("evil.com", ["*"], ["evil.com"]), false);
    });
    test("wildcard deny blocks everything", () => {
      assert.strictEqual(isDomainAllowed("example.com", ["example.com"], ["*"]), false);
    });
    test("subdomain matching in allow/deny", () => {
      assert.strictEqual(isDomainAllowed("api.example.com", ["*.example.com"], []), true);
      assert.strictEqual(isDomainAllowed("api.example.com", [], ["*.example.com"]), false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL25ldHdvcmtGaWx0ZXIvdGVzdC9jb21tb24vZG9tYWluTWF0Y2hlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgbm9ybWFsaXplRG9tYWluLCBleHRyYWN0RG9tYWluUGF0dGVybiwgbWF0Y2hlc0RvbWFpblBhdHRlcm4sIGV4dHJhY3REb21haW5Gcm9tVXJpLCBpc0RvbWFpbkFsbG93ZWQgfSBmcm9tICcuLi8uLi9jb21tb24vZG9tYWluTWF0Y2hlci5qcyc7XG5cbnN1aXRlKCdkb21haW5NYXRjaGVyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdub3JtYWxpemVEb21haW4nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgZW1wdHkvZmFsc3kgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRbbm9ybWFsaXplRG9tYWluKHVuZGVmaW5lZCksIG5vcm1hbGl6ZURvbWFpbignJyksIG5vcm1hbGl6ZURvbWFpbignICAnKV0sXG5cdFx0XHRcdFt1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkXVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xvd2VyY2FzZXMgYW5kIHRyaW1zJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZURvbWFpbignICBFeGFtcGxlLkNPTSAgJyksICdleGFtcGxlLmNvbScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyaXBzIHVzZXIgaW5mbycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3JtYWxpemVEb21haW4oJ3VzZXJAZXhhbXBsZS5jb20nKSwgJ2V4YW1wbGUuY29tJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdHJpcHMgcG9ydCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3JtYWxpemVEb21haW4oJ2V4YW1wbGUuY29tOjgwODAnKSwgJ2V4YW1wbGUuY29tJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdHJpcHMgdHJhaWxpbmcgZG90cycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3JtYWxpemVEb21haW4oJ2V4YW1wbGUuY29tLi4nKSwgJ2V4YW1wbGUuY29tJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHBhdGhzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZURvbWFpbignZXhhbXBsZS5jb20vcGF0aCcpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyAuIGFuZCAuLicsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFtub3JtYWxpemVEb21haW4oJy4nKSwgbm9ybWFsaXplRG9tYWluKCcuLicpXSxcblx0XHRcdFx0W3VuZGVmaW5lZCwgdW5kZWZpbmVkXVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FjY2VwdHMgYmFyZSB3aWxkY2FyZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3JtYWxpemVEb21haW4oJyonKSwgJyonKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FjY2VwdHMgd2lsZGNhcmQgcHJlZml4JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZURvbWFpbignKi5leGFtcGxlLmNvbScpLCAnKi5leGFtcGxlLmNvbScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyaXBzIHRyYWlsaW5nIHB1bmN0dWF0aW9uJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZURvbWFpbignZXhhbXBsZS5jb20sJyksICdleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZURvbWFpbignZXhhbXBsZS5jb207JyksICdleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZURvbWFpbignZXhhbXBsZS5jb20pJyksICdleGFtcGxlLmNvbScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBmaWxlLWV4dGVuc2lvbi1saWtlIFRMRHMgd2hlbiBub3QgZnJvbSBVUkwnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9ybWFsaXplRG9tYWluKCdmb28uanMnKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3JtYWxpemVEb21haW4oJ2Zvby5qc29uJyksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9ybWFsaXplRG9tYWluKCdmb28udHMnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FsbG93cyBmaWxlLWV4dGVuc2lvbi1saWtlIFRMRHMgd2hlbiBmcm9tVXJsIGlzIHRydWUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9ybWFsaXplRG9tYWluKCdmb28uanMnLCB0cnVlKSwgJ2Zvby5qcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBpbnZhbGlkIGNoYXJhY3RlcnMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9ybWFsaXplRG9tYWluKCdleGFtIHBsZS5jb20nKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3JtYWxpemVEb21haW4oJ2V4YW1wbGUhLmNvbScpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBjb21wbGV4IHZhbGlkIGRvbWFpbnMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9ybWFsaXplRG9tYWluKCdzdWIuZG9tYWluLmV4YW1wbGUuY29tJyksICdzdWIuZG9tYWluLmV4YW1wbGUuY29tJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdleHRyYWN0RG9tYWluUGF0dGVybicsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgdHJpbW1lZCBpbnB1dCB3aGVuIG5vIHNjaGVtZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRyYWN0RG9tYWluUGF0dGVybignICBleGFtcGxlLmNvbSAgJyksICdleGFtcGxlLmNvbScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBiYXJlIHdpbGRjYXJkIGFzLWlzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHJhY3REb21haW5QYXR0ZXJuKCcqJyksICcqJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRyYWN0cyBhdXRob3JpdHkgZnJvbSBVUkwnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cmFjdERvbWFpblBhdHRlcm4oJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGF0aCcpLCAnZXhhbXBsZS5jb20nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4dHJhY3RzIGF1dGhvcml0eSB3aXRoIHBvcnQgZnJvbSBVUkwnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cmFjdERvbWFpblBhdHRlcm4oJ2h0dHA6Ly9leGFtcGxlLmNvbTo4MDgwL3BhdGgnKSwgJ2V4YW1wbGUuY29tOjgwODAnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ21hdGNoZXNEb21haW5QYXR0ZXJuJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZXhhY3QgbWF0Y2gnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2hlc0RvbWFpblBhdHRlcm4oJ2V4YW1wbGUuY29tJywgJ2V4YW1wbGUuY29tJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hdGNoZXNEb21haW5QYXR0ZXJuKCdleGFtcGxlLmNvbScsICdvdGhlci5jb20nKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FzZSBpbnNlbnNpdGl2ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXRjaGVzRG9tYWluUGF0dGVybignZXhhbXBsZS5jb20nLCAnRXhhbXBsZS5DT00nKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdiYXJlIHdpbGRjYXJkIG1hdGNoZXMgYW55dGhpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2hlc0RvbWFpblBhdHRlcm4oJ2V4YW1wbGUuY29tJywgJyonKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2hlc0RvbWFpblBhdHRlcm4oJ2FueXRoaW5nLnRlc3QnLCAnKicpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dpbGRjYXJkIHByZWZpeCBtYXRjaGVzIHN1YmRvbWFpbnMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2hlc0RvbWFpblBhdHRlcm4oJ3N1Yi5leGFtcGxlLmNvbScsICcqLmV4YW1wbGUuY29tJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hdGNoZXNEb21haW5QYXR0ZXJuKCdkZWVwLnN1Yi5leGFtcGxlLmNvbScsICcqLmV4YW1wbGUuY29tJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hdGNoZXNEb21haW5QYXR0ZXJuKCdleGFtcGxlLmNvbScsICcqLmV4YW1wbGUuY29tJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2lsZGNhcmQgcHJlZml4IGRvZXMgbm90IG1hdGNoIHVucmVsYXRlZCBkb21haW5zJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hdGNoZXNEb21haW5QYXR0ZXJuKCdub3RleGFtcGxlLmNvbScsICcqLmV4YW1wbGUuY29tJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgZG9tYWluIGZyb20gVVJMIHBhdHRlcm4nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2hlc0RvbWFpblBhdHRlcm4oJ2V4YW1wbGUuY29tJywgJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZScpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIGludmFsaWQgcGF0dGVybicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXRjaGVzRG9tYWluUGF0dGVybignZXhhbXBsZS5jb20nLCAnJyksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2V4dHJhY3REb21haW5Gcm9tVXJpJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgZG9tYWluIGZyb20gaHR0cHMgVVJJJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHJhY3REb21haW5Gcm9tVXJpKFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYXRoJykpLCAnZXhhbXBsZS5jb20nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmlwcyBwb3J0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHJhY3REb21haW5Gcm9tVXJpKFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbTo0NDMvcGF0aCcpKSwgJ2V4YW1wbGUuY29tJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgZW1wdHkgYXV0aG9yaXR5JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHJhY3REb21haW5Gcm9tVXJpKFVSSS5mcm9tKHsgc2NoZW1lOiAnZmlsZScsIHBhdGg6ICcvdG1wL3Rlc3QnIH0pKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2lzRG9tYWluQWxsb3dlZCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2RlbmllcyBldmVyeXRoaW5nIHdoZW4gYm90aCBsaXN0cyBlbXB0eScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0RvbWFpbkFsbG93ZWQoJ2V4YW1wbGUuY29tJywgW10sIFtdKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVuaWVkIHRha2VzIHByZWNlZGVuY2Ugb3ZlciBhbGxvd2VkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRG9tYWluQWxsb3dlZCgnZXZpbC5jb20nLCBbJyouY29tJ10sIFsnZXZpbC5jb20nXSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FsbG93ZWQgbGlzdCByZXN0cmljdHMgdG8gbWF0Y2hpbmcgZG9tYWlucycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0RvbWFpbkFsbG93ZWQoJ2V4YW1wbGUuY29tJywgWydleGFtcGxlLmNvbSddLCBbXSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRG9tYWluQWxsb3dlZCgnb3RoZXIuY29tJywgWydleGFtcGxlLmNvbSddLCBbXSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rlbnktb25seSBjb25maWcgYWxsb3dzIG5vbi1kZW5pZWQgZG9tYWlucycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0RvbWFpbkFsbG93ZWQoJ2dvb2QuY29tJywgW10sIFsnZXZpbC5jb20nXSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRG9tYWluQWxsb3dlZCgnZXZpbC5jb20nLCBbXSwgWydldmlsLmNvbSddKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2lsZGNhcmQgYWxsb3dlZCB3aXRoIHNwZWNpZmljIGRlbnknLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNEb21haW5BbGxvd2VkKCdzYWZlLmNvbScsIFsnKiddLCBbJ2V2aWwuY29tJ10pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0RvbWFpbkFsbG93ZWQoJ2V2aWwuY29tJywgWycqJ10sIFsnZXZpbC5jb20nXSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dpbGRjYXJkIGRlbnkgYmxvY2tzIGV2ZXJ5dGhpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNEb21haW5BbGxvd2VkKCdleGFtcGxlLmNvbScsIFsnZXhhbXBsZS5jb20nXSwgWycqJ10pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdWJkb21haW4gbWF0Y2hpbmcgaW4gYWxsb3cvZGVueScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0RvbWFpbkFsbG93ZWQoJ2FwaS5leGFtcGxlLmNvbScsIFsnKi5leGFtcGxlLmNvbSddLCBbXSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRG9tYWluQWxsb3dlZCgnYXBpLmV4YW1wbGUuY29tJywgW10sIFsnKi5leGFtcGxlLmNvbSddKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGlCQUFpQixzQkFBc0Isc0JBQXNCLHNCQUFzQix1QkFBdUI7QUFFbkgsTUFBTSxpQkFBaUIsTUFBTTtBQUU1QiwwQ0FBd0M7QUFFeEMsUUFBTSxtQkFBbUIsTUFBTTtBQUU5QixTQUFLLDJDQUEyQyxNQUFNO0FBQ3JELGFBQU87QUFBQSxRQUNOLENBQUMsZ0JBQWdCLE1BQVMsR0FBRyxnQkFBZ0IsRUFBRSxHQUFHLGdCQUFnQixJQUFJLENBQUM7QUFBQSxRQUN2RSxDQUFDLFFBQVcsUUFBVyxNQUFTO0FBQUEsTUFDakM7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHdCQUF3QixNQUFNO0FBQ2xDLGFBQU8sWUFBWSxnQkFBZ0IsaUJBQWlCLEdBQUcsYUFBYTtBQUFBLElBQ3JFLENBQUM7QUFFRCxTQUFLLG9CQUFvQixNQUFNO0FBQzlCLGFBQU8sWUFBWSxnQkFBZ0Isa0JBQWtCLEdBQUcsYUFBYTtBQUFBLElBQ3RFLENBQUM7QUFFRCxTQUFLLGVBQWUsTUFBTTtBQUN6QixhQUFPLFlBQVksZ0JBQWdCLGtCQUFrQixHQUFHLGFBQWE7QUFBQSxJQUN0RSxDQUFDO0FBRUQsU0FBSyx3QkFBd0IsTUFBTTtBQUNsQyxhQUFPLFlBQVksZ0JBQWdCLGVBQWUsR0FB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
