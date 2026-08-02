import assert from "assert";
import { isAllInterfacesAuthority, isLocalhostAuthority, isURLDomainTrusted, normalizeURL } from "../../common/trustedDomains.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("trustedDomains", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("isURLDomainTrusted", () => {
    test("localhost is always trusted", () => {
      assert.strictEqual(isURLDomainTrusted(URI.parse("http://localhost:3000"), []), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("http://127.0.0.1:3000"), []), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("http://subdomain.localhost"), []), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://[::1]"), []), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("http://[::1]:3000"), []), true);
    });
    test("wildcard (*) matches everything", () => {
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://example.com"), ["*"]), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("http://anything.org"), ["*"]), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://github.com/microsoft"), ["*"]), true);
    });
    test("exact domain match", () => {
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://example.com"), ["https://example.com"]), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://example.com/path"), ["https://example.com"]), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("http://example.com"), ["https://example.com"]), false);
    });
    test("subdomain wildcard matching", () => {
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://api.github.com"), ["https://*.github.com"]), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://github.com"), ["https://*.github.com"]), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://sub.api.github.com"), ["https://*.github.com"]), true);
    });
    test("path matching", () => {
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://example.com/api/v1"), ["https://example.com/api/*"]), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://example.com/api"), ["https://example.com/api/*"]), false);
    });
    test("scheme must match", () => {
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://example.com"), ["http://example.com"]), false);
      assert.strictEqual(isURLDomainTrusted(URI.parse("http://example.com"), ["https://example.com"]), false);
    });
    test("not trusted when no match", () => {
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://example.com"), ["https://other.com"]), false);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://example.com"), []), false);
    });
    test("multiple trusted domains", () => {
      const trusted = ["https://github.com", "https://microsoft.com"];
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://github.com"), trusted), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://microsoft.com"), trusted), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://google.com"), trusted), false);
    });
    test("case normalization for github", () => {
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://github.com/Microsoft/VSCode"), ["https://github.com/microsoft/vscode"]), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://github.com/microsoft/vscode"), ["https://github.com/Microsoft/VSCode"]), true);
    });
  });
  suite("normalizeURL", () => {
    test("normalizes github.com URLs to lowercase path", () => {
      assert.strictEqual(normalizeURL("https://github.com/Microsoft/VSCode"), "https://github.com/microsoft/vscode");
      assert.strictEqual(normalizeURL("https://github.com/OWNER/REPO"), "https://github.com/owner/repo");
    });
    test("does not normalize non-github URLs", () => {
      assert.strictEqual(normalizeURL("https://example.com/Path/To/Resource"), "https://example.com/Path/To/Resource");
      assert.strictEqual(normalizeURL("https://microsoft.com/Products"), "https://microsoft.com/Products");
    });
    test("handles URI objects", () => {
      const uri = URI.parse("https://github.com/Microsoft/VSCode");
      assert.strictEqual(normalizeURL(uri), "https://github.com/microsoft/vscode");
    });
    test("handles invalid URIs gracefully", () => {
      const result = normalizeURL("not-a-valid-uri");
      assert.strictEqual(typeof result, "string");
    });
  });
  suite("isLocalhostAuthority", () => {
    test("recognizes localhost", () => {
      assert.strictEqual(isLocalhostAuthority("localhost"), true);
      assert.strictEqual(isLocalhostAuthority("localhost:3000"), true);
      assert.strictEqual(isLocalhostAuthority("localhost:8080"), true);
    });
    test("recognizes subdomains of localhost", () => {
      assert.strictEqual(isLocalhostAuthority("subdomain.localhost"), true);
      assert.strictEqual(isLocalhostAuthority("api.localhost:3000"), true);
      assert.strictEqual(isLocalhostAuthority("a.b.c.localhost"), true);
    });
    test("recognizes 127.0.0.1", () => {
      assert.strictEqual(isLocalhostAuthority("127.0.0.1"), true);
      assert.strictEqual(isLocalhostAuthority("127.0.0.1:3000"), true);
      assert.strictEqual(isLocalhostAuthority("127.0.0.1:8080"), true);
    });
    test("case insensitive for localhost", () => {
      assert.strictEqual(isLocalhostAuthority("LOCALHOST"), true);
      assert.strictEqual(isLocalhostAuthority("LocalHost:3000"), true);
      assert.strictEqual(isLocalhostAuthority("SUB.LOCALHOST"), true);
    });
    test("recognizes IPv6 localhost [::1] and [0:0:0:0:0:0:0:1]", () => {
      assert.strictEqual(isLocalhostAuthority("[::1]"), true);
      assert.strictEqual(isLocalhostAuthority("[::1]:3000"), true);
      assert.strictEqual(isLocalhostAuthority("[::1]:8080"), true);
      assert.strictEqual(isLocalhostAuthority("[0:0:0:0:0:0:0:1]"), true);
      assert.strictEqual(isLocalhostAuthority("[0:0:0:0:0:0:0:1]:3000"), true);
      assert.strictEqual(isLocalhostAuthority("[0:0:0:0:0:0:0:1]:8080"), true);
    });
    test("does not match non-localhost authorities", () => {
      assert.strictEqual(isLocalhostAuthority("example.com"), false);
      assert.strictEqual(isLocalhostAuthority("notlocalhost.com"), false);
      assert.strictEqual(isLocalhostAuthority("127.0.0.2"), false);
      assert.strictEqual(isLocalhostAuthority("192.168.1.1"), false);
      assert.strictEqual(isLocalhostAuthority("[::]"), false);
      assert.strictEqual(isLocalhostAuthority("[::2]"), false);
      assert.strictEqual(isLocalhostAuthority("[::1"), false);
    });
  });
  suite("isAllInterfacesAuthority", () => {
    test("recognizes 0.0.0.0", () => {
      assert.strictEqual(isAllInterfacesAuthority("0.0.0.0"), true);
      assert.strictEqual(isAllInterfacesAuthority("0.0.0.0:3000"), true);
      assert.strictEqual(isAllInterfacesAuthority("0.0.0.0:8080"), true);
    });
    test("recognizes IPv6 all-interfaces [::]", () => {
      assert.strictEqual(isAllInterfacesAuthority("[::]"), true);
      assert.strictEqual(isAllInterfacesAuthority("[::]:3000"), true);
      assert.strictEqual(isAllInterfacesAuthority("[::]:8080"), true);
    });
    test("recognizes full-form IPv6 all-interfaces [0:0:0:0:0:0:0:0]", () => {
      assert.strictEqual(isAllInterfacesAuthority("[0:0:0:0:0:0:0:0]"), true);
      assert.strictEqual(isAllInterfacesAuthority("[0:0:0:0:0:0:0:0]:3000"), true);
    });
    test("does not match localhost or other non-all-interfaces authorities", () => {
      assert.strictEqual(isAllInterfacesAuthority("localhost"), false);
      assert.strictEqual(isAllInterfacesAuthority("127.0.0.1"), false);
      assert.strictEqual(isAllInterfacesAuthority("[::1]"), false);
      assert.strictEqual(isAllInterfacesAuthority("example.com"), false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VybC90ZXN0L2NvbW1vbi90cnVzdGVkRG9tYWlucy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgaXNBbGxJbnRlcmZhY2VzQXV0aG9yaXR5LCBpc0xvY2FsaG9zdEF1dGhvcml0eSwgaXNVUkxEb21haW5UcnVzdGVkLCBub3JtYWxpemVVUkwgfSBmcm9tICcuLi8uLi9jb21tb24vdHJ1c3RlZERvbWFpbnMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5zdWl0ZSgndHJ1c3RlZERvbWFpbnMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2lzVVJMRG9tYWluVHJ1c3RlZCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2xvY2FsaG9zdCBpcyBhbHdheXMgdHJ1c3RlZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VSTERvbWFpblRydXN0ZWQoVVJJLnBhcnNlKCdodHRwOi8vbG9jYWxob3N0OjMwMDAnKSwgW10pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VSTERvbWFpblRydXN0ZWQoVVJJLnBhcnNlKCdodHRwOi8vMTI3LjAuMC4xOjMwMDAnKSwgW10pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VSTERvbWFpblRydXN0ZWQoVVJJLnBhcnNlKCdodHRwOi8vc3ViZG9tYWluLmxvY2FsaG9zdCcpLCBbXSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHBzOi8vWzo6MV0nKSwgW10pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VSTERvbWFpblRydXN0ZWQoVVJJLnBhcnNlKCdodHRwOi8vWzo6MV06MzAwMCcpLCBbXSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2lsZGNhcmQgKCopIG1hdGNoZXMgZXZlcnl0aGluZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VSTERvbWFpblRydXN0ZWQoVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tJyksIFsnKiddKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVUkxEb21haW5UcnVzdGVkKFVSSS5wYXJzZSgnaHR0cDovL2FueXRoaW5nLm9yZycpLCBbJyonXSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQnKSwgWycqJ10pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4YWN0IGRvbWFpbiBtYXRjaCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VSTERvbWFpblRydXN0ZWQoVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tJyksIFsnaHR0cHM6Ly9leGFtcGxlLmNvbSddKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVUkxEb21haW5UcnVzdGVkKFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYXRoJyksIFsnaHR0cHM6Ly9leGFtcGxlLmNvbSddKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVUkxEb21haW5UcnVzdGVkKFVSSS5wYXJzZSgnaHR0cDovL2V4YW1wbGUuY29tJyksIFsnaHR0cHM6Ly9leGFtcGxlLmNvbSddKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3ViZG9tYWluIHdpbGRjYXJkIG1hdGNoaW5nJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nKSwgWydodHRwczovLyouZ2l0aHViLmNvbSddKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVUkxEb21haW5UcnVzdGVkKFVSSS5wYXJzZSgnaHR0cHM6Ly9naXRodWIuY29tJyksIFsnaHR0cHM6Ly8qLmdpdGh1Yi5jb20nXSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHBzOi8vc3ViLmFwaS5naXRodWIuY29tJyksIFsnaHR0cHM6Ly8qLmdpdGh1Yi5jb20nXSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGF0aCBtYXRjaGluZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VSTERvbWFpblRydXN0ZWQoVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL2FwaS92MScpLCBbJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpLyonXSksIHRydWUpO1xuXHRcdFx0Ly8gUGF0aCB3aXRob3V0IHRyYWlsaW5nIGNvbnRlbnQgZG9lc24ndCBtYXRjaCBhIHdpbGRjYXJkIHBhdHRlcm4gcmVxdWlyaW5nIG1vcmUgcGF0aCBzZWdtZW50c1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJyksIFsnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvKiddKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2NoZW1lIG11c3QgbWF0Y2gnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVUkxEb21haW5UcnVzdGVkKFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbScpLCBbJ2h0dHA6Ly9leGFtcGxlLmNvbSddKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHA6Ly9leGFtcGxlLmNvbScpLCBbJ2h0dHBzOi8vZXhhbXBsZS5jb20nXSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vdCB0cnVzdGVkIHdoZW4gbm8gbWF0Y2gnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVUkxEb21haW5UcnVzdGVkKFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbScpLCBbJ2h0dHBzOi8vb3RoZXIuY29tJ10pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVUkxEb21haW5UcnVzdGVkKFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbScpLCBbXSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpcGxlIHRydXN0ZWQgZG9tYWlucycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRydXN0ZWQgPSBbJ2h0dHBzOi8vZ2l0aHViLmNvbScsICdodHRwczovL21pY3Jvc29mdC5jb20nXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VSTERvbWFpblRydXN0ZWQoVVJJLnBhcnNlKCdodHRwczovL2dpdGh1Yi5jb20nKSwgdHJ1c3RlZCksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHBzOi8vbWljcm9zb2Z0LmNvbScpLCB0cnVzdGVkKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVUkxEb21haW5UcnVzdGVkKFVSSS5wYXJzZSgnaHR0cHM6Ly9nb29nbGUuY29tJyksIHRydXN0ZWQpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYXNlIG5vcm1hbGl6YXRpb24gZm9yIGdpdGh1YicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VSTERvbWFpblRydXN0ZWQoVVJJLnBhcnNlKCdodHRwczovL2dpdGh1Yi5jb20vTWljcm9zb2Z0L1ZTQ29kZScpLCBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlJ10pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VSTERvbWFpblRydXN0ZWQoVVJJLnBhcnNlKCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZScpLCBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9NaWNyb3NvZnQvVlNDb2RlJ10pLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ25vcm1hbGl6ZVVSTCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ25vcm1hbGl6ZXMgZ2l0aHViLmNvbSBVUkxzIHRvIGxvd2VyY2FzZSBwYXRoJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZVVSTCgnaHR0cHM6Ly9naXRodWIuY29tL01pY3Jvc29mdC9WU0NvZGUnKSwgJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9ybWFsaXplVVJMKCdodHRwczovL2dpdGh1Yi5jb20vT1dORVIvUkVQTycpLCAnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IG5vcm1hbGl6ZSBub24tZ2l0aHViIFVSTHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9ybWFsaXplVVJMKCdodHRwczovL2V4YW1wbGUuY29tL1BhdGgvVG8vUmVzb3VyY2UnKSwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vUGF0aC9Uby9SZXNvdXJjZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZVVSTCgnaHR0cHM6Ly9taWNyb3NvZnQuY29tL1Byb2R1Y3RzJyksICdodHRwczovL21pY3Jvc29mdC5jb20vUHJvZHVjdHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgVVJJIG9iamVjdHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZ2l0aHViLmNvbS9NaWNyb3NvZnQvVlNDb2RlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9ybWFsaXplVVJMKHVyaSksICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBpbnZhbGlkIFVSSXMgZ3JhY2VmdWxseScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG5vcm1hbGl6ZVVSTCgnbm90LWEtdmFsaWQtdXJpJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdCwgJ3N0cmluZycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaXNMb2NhbGhvc3RBdXRob3JpdHknLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZWNvZ25pemVzIGxvY2FsaG9zdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsaG9zdEF1dGhvcml0eSgnbG9jYWxob3N0JyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTG9jYWxob3N0QXV0aG9yaXR5KCdsb2NhbGhvc3Q6MzAwMCcpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsaG9zdEF1dGhvcml0eSgnbG9jYWxob3N0OjgwODAnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWNvZ25pemVzIHN1YmRvbWFpbnMgb2YgbG9jYWxob3N0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTG9jYWxob3N0QXV0aG9yaXR5KCdzdWJkb21haW4ubG9jYWxob3N0JyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTG9jYWxob3N0QXV0aG9yaXR5KCdhcGkubG9jYWxob3N0OjMwMDAnKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNMb2NhbGhvc3RBdXRob3JpdHkoJ2EuYi5jLmxvY2FsaG9zdCcpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlY29nbml6ZXMgMTI3LjAuMC4xJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTG9jYWxob3N0QXV0aG9yaXR5KCcxMjcuMC4wLjEnKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNMb2NhbGhvc3RBdXRob3JpdHkoJzEyNy4wLjAuMTozMDAwJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTG9jYWxob3N0QXV0aG9yaXR5KCcxMjcuMC4wLjE6ODA4MCcpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Nhc2UgaW5zZW5zaXRpdmUgZm9yIGxvY2FsaG9zdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsaG9zdEF1dGhvcml0eSgnTE9DQUxIT1NUJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTG9jYWxob3N0QXV0aG9yaXR5KCdMb2NhbEhvc3Q6MzAwMCcpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsaG9zdEF1dGhvcml0eSgnU1VCLkxPQ0FMSE9TVCcpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlY29nbml6ZXMgSVB2NiBsb2NhbGhvc3QgWzo6MV0gYW5kIFswOjA6MDowOjA6MDowOjFdJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTG9jYWxob3N0QXV0aG9yaXR5KCdbOjoxXScpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsaG9zdEF1dGhvcml0eSgnWzo6MV06MzAwMCcpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsaG9zdEF1dGhvcml0eSgnWzo6MV06ODA4MCcpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsaG9zdEF1dGhvcml0eSgnWzA6MDowOjA6MDowOjA6MV0nKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNMb2NhbGhvc3RBdXRob3JpdHkoJ1swOjA6MDowOjA6MDowOjFdOjMwMDAnKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNMb2NhbGhvc3RBdXRob3JpdHkoJ1swOjA6MDowOjA6MDowOjFdOjgwODAnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBtYXRjaCBub24tbG9jYWxob3N0IGF1dGhvcml0aWVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTG9jYWxob3N0QXV0aG9yaXR5KCdleGFtcGxlLmNvbScpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNMb2NhbGhvc3RBdXRob3JpdHkoJ25vdGxvY2FsaG9zdC5jb20nKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTG9jYWxob3N0QXV0aG9yaXR5KCcxMjcuMC4wLjInKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTG9jYWxob3N0QXV0aG9yaXR5KCcxOTIuMTY4LjEuMScpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNMb2NhbGhvc3RBdXRob3JpdHkoJ1s6Ol0nKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTG9jYWxob3N0QXV0aG9yaXR5KCdbOjoyXScpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNMb2NhbGhvc3RBdXRob3JpdHkoJ1s6OjEnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaXNBbGxJbnRlcmZhY2VzQXV0aG9yaXR5JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmVjb2duaXplcyAwLjAuMC4wJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQWxsSW50ZXJmYWNlc0F1dGhvcml0eSgnMC4wLjAuMCcpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0FsbEludGVyZmFjZXNBdXRob3JpdHkoJzAuMC4wLjA6MzAwMCcpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0FsbEludGVyZmFjZXNBdXRob3JpdHkoJzAuMC4wLjA6ODA4MCcpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlY29nbml6ZXMgSVB2NiBhbGwtaW50ZXJmYWNlcyBbOjpdJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQWxsSW50ZXJmYWNlc0F1dGhvcml0eSgnWzo6XScpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0FsbEludGVyZmFjZXNBdXRob3JpdHkoJ1s6Ol06MzAwMCcpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0FsbEludGVyZmFjZXNBdXRob3JpdHkoJ1s6Ol06ODA4MCcpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlY29nbml6ZXMgZnVsbC1mb3JtIElQdjYgYWxsLWludGVyZmFjZXMgWzA6MDowOjA6MDowOjA6MF0nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBbGxJbnRlcmZhY2VzQXV0aG9yaXR5KCdbMDowOjA6MDowOjA6MDowXScpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0FsbEludGVyZmFjZXNBdXRob3JpdHkoJ1swOjA6MDowOjA6MDowOjBdOjMwMDAnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBtYXRjaCBsb2NhbGhvc3Qgb3Igb3RoZXIgbm9uLWFsbC1pbnRlcmZhY2VzIGF1dGhvcml0aWVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQWxsSW50ZXJmYWNlc0F1dGhvcml0eSgnbG9jYWxob3N0JyksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0FsbEludGVyZmFjZXNBdXRob3JpdHkoJzEyNy4wLjAuMScpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBbGxJbnRlcmZhY2VzQXV0aG9yaXR5KCdbOjoxXScpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBbGxJbnRlcmZhY2VzQXV0aG9yaXR5KCdleGFtcGxlLmNvbScpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywwQkFBMEIsc0JBQXNCLG9CQUFvQixvQkFBb0I7QUFDakcsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sa0JB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
