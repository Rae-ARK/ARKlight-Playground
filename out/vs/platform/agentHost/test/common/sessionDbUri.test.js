import assert from "assert";
import { encodeHex, VSBuffer } from "../../../../base/common/buffer.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { buildSessionDbUri, canonicalizeSessionDbUri, parseSessionDbUri } from "../../common/sessionDbUri.js";
const hex = (value) => encodeHex(VSBuffer.fromString(value)).toString();
function legacyUri(sessionUri, toolCallId, filePath, part, name) {
  return URI.from({
    scheme: "session-db",
    authority: hex(sessionUri),
    path: `/${toolCallId}/${hex(filePath)}/${part}/${name}`
  });
}
suite("buildSessionDbUri / parseSessionDbUri", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("round-trips a simple URI", () => {
    const uri = buildSessionDbUri("copilot:/abc-123", "tc-1", "/workspace/file.ts", "before");
    const parsed = parseSessionDbUri(uri);
    assert.ok(parsed);
    assert.deepStrictEqual(parsed, {
      sessionUri: "copilot:/abc-123",
      toolCallId: "tc-1",
      filePath: "/workspace/file.ts",
      part: "before"
    });
  });
  test("round-trips with special characters in filePath", () => {
    const uri = buildSessionDbUri("copilot:/s1", "tc-2", "/work space/file (1).ts", "after");
    const parsed = parseSessionDbUri(uri);
    assert.ok(parsed);
    assert.strictEqual(parsed.filePath, "/work space/file (1).ts");
    assert.strictEqual(parsed.part, "after");
  });
  test("round-trips with special characters in toolCallId", () => {
    const uri = buildSessionDbUri("copilot:/s1", "call_abc=123&x", "/file.ts", "before");
    const parsed = parseSessionDbUri(uri);
    assert.ok(parsed);
    assert.strictEqual(parsed.toolCallId, "call_abc=123&x");
  });
  test("round-trips a backslashed Windows filePath, which the database lookup needs verbatim", () => {
    const filePath = "C:\\Code\\vscode\\src\\vs\\file.ts";
    const parsed = parseSessionDbUri(buildSessionDbUri("copilot:/s1", "tc-1", filePath, "before"));
    assert.ok(parsed);
    assert.strictEqual(parsed.filePath, filePath);
  });
  test("parseSessionDbUri returns undefined for non-session-db URIs", () => {
    assert.strictEqual(parseSessionDbUri("file:///foo/bar"), void 0);
    assert.strictEqual(parseSessionDbUri("https://example.com"), void 0);
  });
  test("parseSessionDbUri returns undefined for malformed session-db URIs", () => {
    assert.strictEqual(parseSessionDbUri("session-db:copilot:/s1"), void 0);
    assert.strictEqual(parseSessionDbUri("session-db:copilot:/s1?toolCallId=tc-1"), void 0);
    assert.strictEqual(parseSessionDbUri("session-db:copilot:/s1?toolCallId=tc-1&filePath=/f&part=middle"), void 0);
  });
  test("parseSessionDbUri returns undefined for JSON queries that are not objects", () => {
    const queries = ["null", "123", '"a string"', "true", "[]"];
    assert.deepStrictEqual(
      queries.map((query) => parseSessionDbUri(`session-db:/f.ts?${encodeURIComponent(query)}`)),
      queries.map(() => void 0)
    );
  });
  test("parseSessionDbUri rejects empty lookup keys, which would hit the database", () => {
    const withField = (field) => `session-db:/f.ts?${encodeURIComponent(JSON.stringify({ sessionUri: "s", toolCallId: "t", filePath: "/f.ts", part: "before", ...field }))}`;
    assert.deepStrictEqual([
      parseSessionDbUri(withField({ sessionUri: "" })),
      parseSessionDbUri(withField({ toolCallId: "" })),
      parseSessionDbUri(withField({ filePath: "" }))
    ], [void 0, void 0, void 0]);
  });
  test("URI path is the file path, so labels show a real path", () => {
    const uri = buildSessionDbUri("copilot:/s1", "tc-1", "/workspace/src/index.ts", "before");
    assert.strictEqual(URI.parse(uri).path, "/workspace/src/index.ts");
  });
  test("URI path is the file path for files with spaces and special chars", () => {
    const uri = buildSessionDbUri("copilot:/s1", "tc-1", "/work space/file (1).ts", "after");
    assert.strictEqual(URI.parse(uri).path, "/work space/file (1).ts");
  });
  test("parses the legacy hex-encoded layout", () => {
    const legacy = legacyUri("copilot:/abc-123", "tc-1", "/workspace/file.ts", "before", "file.ts").toString();
    assert.deepStrictEqual(parseSessionDbUri(legacy), {
      sessionUri: "copilot:/abc-123",
      toolCallId: "tc-1",
      filePath: "/workspace/file.ts",
      part: "before"
    });
  });
});
suite("canonicalizeSessionDbUri", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("rewrites a legacy URI into the current layout", () => {
    const legacy = legacyUri("copilot:/abc-123", "call_1", "/workspace/file.ts", "before", "file.ts");
    const canonical = canonicalizeSessionDbUri(legacy, URI.file("/workspace/file.ts"));
    assert.deepStrictEqual(
      [canonical.path, parseSessionDbUri(canonical.toString())],
      ["/workspace/file.ts", { sessionUri: "copilot:/abc-123", toolCallId: "call_1", filePath: "/workspace/file.ts", part: "before" }]
    );
  });
  test("takes the path from the file URI, so a Windows session canonicalizes the same way on any client", () => {
    const legacy = legacyUri("copilot:/abc-123", "call_1", "C:\\Code\\repo\\file.ts", "before", "file.ts");
    const canonical = canonicalizeSessionDbUri(legacy, URI.parse("file:///c%3A/Code/repo/file.ts"));
    assert.deepStrictEqual(
      [canonical.path, parseSessionDbUri(canonical.toString())?.filePath],
      ["/c:/Code/repo/file.ts", "C:\\Code\\repo\\file.ts"]
    );
  });
  test("leaves canonical, unparseable and foreign URIs untouched", () => {
    const canonical = URI.parse(buildSessionDbUri("copilot:/s1", "tc-1", "/workspace/file.ts", "before"));
    const unparseable = URI.from({ scheme: "session-db", path: "/nonsense" });
    const foreign = URI.file("/workspace/file.ts");
    const fileUri = URI.file("/workspace/file.ts");
    assert.deepStrictEqual(
      [canonical, unparseable, foreign].map((uri) => canonicalizeSessionDbUri(uri, fileUri).toString()),
      [canonical.toString(), unparseable.toString(), foreign.toString()]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L2NvbW1vbi9zZXNzaW9uRGJVcmkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuY29kZUhleCwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgYnVpbGRTZXNzaW9uRGJVcmksIGNhbm9uaWNhbGl6ZVNlc3Npb25EYlVyaSwgcGFyc2VTZXNzaW9uRGJVcmkgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRiVXJpLmpzJztcblxuY29uc3QgaGV4ID0gKHZhbHVlOiBzdHJpbmcpID0+IGVuY29kZUhleChWU0J1ZmZlci5mcm9tU3RyaW5nKHZhbHVlKSkudG9TdHJpbmcoKTtcblxuZnVuY3Rpb24gbGVnYWN5VXJpKHNlc3Npb25Vcmk6IHN0cmluZywgdG9vbENhbGxJZDogc3RyaW5nLCBmaWxlUGF0aDogc3RyaW5nLCBwYXJ0OiBzdHJpbmcsIG5hbWU6IHN0cmluZyk6IFVSSSB7XG5cdHJldHVybiBVUkkuZnJvbSh7XG5cdFx0c2NoZW1lOiAnc2Vzc2lvbi1kYicsXG5cdFx0YXV0aG9yaXR5OiBoZXgoc2Vzc2lvblVyaSksXG5cdFx0cGF0aDogYC8ke3Rvb2xDYWxsSWR9LyR7aGV4KGZpbGVQYXRoKX0vJHtwYXJ0fS8ke25hbWV9YCxcblx0fSk7XG59XG5cbnN1aXRlKCdidWlsZFNlc3Npb25EYlVyaSAvIHBhcnNlU2Vzc2lvbkRiVXJpJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JvdW5kLXRyaXBzIGEgc2ltcGxlIFVSSScsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBidWlsZFNlc3Npb25EYlVyaSgnY29waWxvdDovYWJjLTEyMycsICd0Yy0xJywgJy93b3Jrc3BhY2UvZmlsZS50cycsICdiZWZvcmUnKTtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZVNlc3Npb25EYlVyaSh1cmkpO1xuXHRcdGFzc2VydC5vayhwYXJzZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VkLCB7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovYWJjLTEyMycsXG5cdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvZmlsZS50cycsXG5cdFx0XHRwYXJ0OiAnYmVmb3JlJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncm91bmQtdHJpcHMgd2l0aCBzcGVjaWFsIGNoYXJhY3RlcnMgaW4gZmlsZVBhdGgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gYnVpbGRTZXNzaW9uRGJVcmkoJ2NvcGlsb3Q6L3MxJywgJ3RjLTInLCAnL3dvcmsgc3BhY2UvZmlsZSAoMSkudHMnLCAnYWZ0ZXInKTtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZVNlc3Npb25EYlVyaSh1cmkpO1xuXHRcdGFzc2VydC5vayhwYXJzZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQuZmlsZVBhdGgsICcvd29yayBzcGFjZS9maWxlICgxKS50cycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQucGFydCwgJ2FmdGVyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JvdW5kLXRyaXBzIHdpdGggc3BlY2lhbCBjaGFyYWN0ZXJzIGluIHRvb2xDYWxsSWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gYnVpbGRTZXNzaW9uRGJVcmkoJ2NvcGlsb3Q6L3MxJywgJ2NhbGxfYWJjPTEyMyZ4JywgJy9maWxlLnRzJywgJ2JlZm9yZScpO1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlU2Vzc2lvbkRiVXJpKHVyaSk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnNlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC50b29sQ2FsbElkLCAnY2FsbF9hYmM9MTIzJngnKTtcblx0fSk7XG5cblx0dGVzdCgncm91bmQtdHJpcHMgYSBiYWNrc2xhc2hlZCBXaW5kb3dzIGZpbGVQYXRoLCB3aGljaCB0aGUgZGF0YWJhc2UgbG9va3VwIG5lZWRzIHZlcmJhdGltJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVQYXRoID0gJ0M6XFxcXENvZGVcXFxcdnNjb2RlXFxcXHNyY1xcXFx2c1xcXFxmaWxlLnRzJztcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZVNlc3Npb25EYlVyaShidWlsZFNlc3Npb25EYlVyaSgnY29waWxvdDovczEnLCAndGMtMScsIGZpbGVQYXRoLCAnYmVmb3JlJykpO1xuXHRcdGFzc2VydC5vayhwYXJzZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQuZmlsZVBhdGgsIGZpbGVQYXRoKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VTZXNzaW9uRGJVcmkgcmV0dXJucyB1bmRlZmluZWQgZm9yIG5vbi1zZXNzaW9uLWRiIFVSSXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlU2Vzc2lvbkRiVXJpKCdmaWxlOi8vL2Zvby9iYXInKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VTZXNzaW9uRGJVcmkoJ2h0dHBzOi8vZXhhbXBsZS5jb20nKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VTZXNzaW9uRGJVcmkgcmV0dXJucyB1bmRlZmluZWQgZm9yIG1hbGZvcm1lZCBzZXNzaW9uLWRiIFVSSXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlU2Vzc2lvbkRiVXJpKCdzZXNzaW9uLWRiOmNvcGlsb3Q6L3MxJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlU2Vzc2lvbkRiVXJpKCdzZXNzaW9uLWRiOmNvcGlsb3Q6L3MxP3Rvb2xDYWxsSWQ9dGMtMScpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVNlc3Npb25EYlVyaSgnc2Vzc2lvbi1kYjpjb3BpbG90Oi9zMT90b29sQ2FsbElkPXRjLTEmZmlsZVBhdGg9L2YmcGFydD1taWRkbGUnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VTZXNzaW9uRGJVcmkgcmV0dXJucyB1bmRlZmluZWQgZm9yIEpTT04gcXVlcmllcyB0aGF0IGFyZSBub3Qgb2JqZWN0cycsICgpID0+IHtcblx0XHRjb25zdCBxdWVyaWVzID0gWydudWxsJywgJzEyMycsICdcImEgc3RyaW5nXCInLCAndHJ1ZScsICdbXSddO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRxdWVyaWVzLm1hcChxdWVyeSA9PiBwYXJzZVNlc3Npb25EYlVyaShgc2Vzc2lvbi1kYjovZi50cz8ke2VuY29kZVVSSUNvbXBvbmVudChxdWVyeSl9YCkpLFxuXHRcdFx0cXVlcmllcy5tYXAoKCkgPT4gdW5kZWZpbmVkKSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZVNlc3Npb25EYlVyaSByZWplY3RzIGVtcHR5IGxvb2t1cCBrZXlzLCB3aGljaCB3b3VsZCBoaXQgdGhlIGRhdGFiYXNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdpdGhGaWVsZCA9IChmaWVsZDogUGFydGlhbDxSZWNvcmQ8J3Nlc3Npb25VcmknIHwgJ3Rvb2xDYWxsSWQnIHwgJ2ZpbGVQYXRoJywgc3RyaW5nPj4pID0+XG5cdFx0XHRgc2Vzc2lvbi1kYjovZi50cz8ke2VuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeSh7IHNlc3Npb25Vcmk6ICdzJywgdG9vbENhbGxJZDogJ3QnLCBmaWxlUGF0aDogJy9mLnRzJywgcGFydDogJ2JlZm9yZScsIC4uLmZpZWxkIH0pKX1gO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRwYXJzZVNlc3Npb25EYlVyaSh3aXRoRmllbGQoeyBzZXNzaW9uVXJpOiAnJyB9KSksXG5cdFx0XHRwYXJzZVNlc3Npb25EYlVyaSh3aXRoRmllbGQoeyB0b29sQ2FsbElkOiAnJyB9KSksXG5cdFx0XHRwYXJzZVNlc3Npb25EYlVyaSh3aXRoRmllbGQoeyBmaWxlUGF0aDogJycgfSkpLFxuXHRcdF0sIFt1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VSSSBwYXRoIGlzIHRoZSBmaWxlIHBhdGgsIHNvIGxhYmVscyBzaG93IGEgcmVhbCBwYXRoJywgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IGJ1aWxkU2Vzc2lvbkRiVXJpKCdjb3BpbG90Oi9zMScsICd0Yy0xJywgJy93b3Jrc3BhY2Uvc3JjL2luZGV4LnRzJywgJ2JlZm9yZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkucGFyc2UodXJpKS5wYXRoLCAnL3dvcmtzcGFjZS9zcmMvaW5kZXgudHMnKTtcblx0fSk7XG5cblx0dGVzdCgnVVJJIHBhdGggaXMgdGhlIGZpbGUgcGF0aCBmb3IgZmlsZXMgd2l0aCBzcGFjZXMgYW5kIHNwZWNpYWwgY2hhcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gYnVpbGRTZXNzaW9uRGJVcmkoJ2NvcGlsb3Q6L3MxJywgJ3RjLTEnLCAnL3dvcmsgc3BhY2UvZmlsZSAoMSkudHMnLCAnYWZ0ZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLnBhcnNlKHVyaSkucGF0aCwgJy93b3JrIHNwYWNlL2ZpbGUgKDEpLnRzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyB0aGUgbGVnYWN5IGhleC1lbmNvZGVkIGxheW91dCcsICgpID0+IHtcblx0XHRjb25zdCBsZWdhY3kgPSBsZWdhY3lVcmkoJ2NvcGlsb3Q6L2FiYy0xMjMnLCAndGMtMScsICcvd29ya3NwYWNlL2ZpbGUudHMnLCAnYmVmb3JlJywgJ2ZpbGUudHMnKS50b1N0cmluZygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVNlc3Npb25EYlVyaShsZWdhY3kpLCB7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovYWJjLTEyMycsXG5cdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvZmlsZS50cycsXG5cdFx0XHRwYXJ0OiAnYmVmb3JlJyxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2Nhbm9uaWNhbGl6ZVNlc3Npb25EYlVyaScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZXdyaXRlcyBhIGxlZ2FjeSBVUkkgaW50byB0aGUgY3VycmVudCBsYXlvdXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGVnYWN5ID0gbGVnYWN5VXJpKCdjb3BpbG90Oi9hYmMtMTIzJywgJ2NhbGxfMScsICcvd29ya3NwYWNlL2ZpbGUudHMnLCAnYmVmb3JlJywgJ2ZpbGUudHMnKTtcblx0XHRjb25zdCBjYW5vbmljYWwgPSBjYW5vbmljYWxpemVTZXNzaW9uRGJVcmkobGVnYWN5LCBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFtjYW5vbmljYWwucGF0aCwgcGFyc2VTZXNzaW9uRGJVcmkoY2Fub25pY2FsLnRvU3RyaW5nKCkpXSxcblx0XHRcdFsnL3dvcmtzcGFjZS9maWxlLnRzJywgeyBzZXNzaW9uVXJpOiAnY29waWxvdDovYWJjLTEyMycsIHRvb2xDYWxsSWQ6ICdjYWxsXzEnLCBmaWxlUGF0aDogJy93b3Jrc3BhY2UvZmlsZS50cycsIHBhcnQ6ICdiZWZvcmUnIH1dLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rha2VzIHRoZSBwYXRoIGZyb20gdGhlIGZpbGUgVVJJLCBzbyBhIFdpbmRvd3Mgc2Vzc2lvbiBjYW5vbmljYWxpemVzIHRoZSBzYW1lIHdheSBvbiBhbnkgY2xpZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxlZ2FjeSA9IGxlZ2FjeVVyaSgnY29waWxvdDovYWJjLTEyMycsICdjYWxsXzEnLCAnQzpcXFxcQ29kZVxcXFxyZXBvXFxcXGZpbGUudHMnLCAnYmVmb3JlJywgJ2ZpbGUudHMnKTtcblx0XHRjb25zdCBjYW5vbmljYWwgPSBjYW5vbmljYWxpemVTZXNzaW9uRGJVcmkobGVnYWN5LCBVUkkucGFyc2UoJ2ZpbGU6Ly8vYyUzQS9Db2RlL3JlcG8vZmlsZS50cycpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbY2Fub25pY2FsLnBhdGgsIHBhcnNlU2Vzc2lvbkRiVXJpKGNhbm9uaWNhbC50b1N0cmluZygpKT8uZmlsZVBhdGhdLFxuXHRcdFx0WycvYzovQ29kZS9yZXBvL2ZpbGUudHMnLCAnQzpcXFxcQ29kZVxcXFxyZXBvXFxcXGZpbGUudHMnXSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdsZWF2ZXMgY2Fub25pY2FsLCB1bnBhcnNlYWJsZSBhbmQgZm9yZWlnbiBVUklzIHVudG91Y2hlZCcsICgpID0+IHtcblx0XHRjb25zdCBjYW5vbmljYWwgPSBVUkkucGFyc2UoYnVpbGRTZXNzaW9uRGJVcmkoJ2NvcGlsb3Q6L3MxJywgJ3RjLTEnLCAnL3dvcmtzcGFjZS9maWxlLnRzJywgJ2JlZm9yZScpKTtcblx0XHRjb25zdCB1bnBhcnNlYWJsZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnc2Vzc2lvbi1kYicsIHBhdGg6ICcvbm9uc2Vuc2UnIH0pO1xuXHRcdGNvbnN0IGZvcmVpZ24gPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2ZpbGUudHMnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbY2Fub25pY2FsLCB1bnBhcnNlYWJsZSwgZm9yZWlnbl0ubWFwKHVyaSA9PiBjYW5vbmljYWxpemVTZXNzaW9uRGJVcmkodXJpLCBmaWxlVXJpKS50b1N0cmluZygpKSxcblx0XHRcdFtjYW5vbmljYWwudG9TdHJpbmcoKSwgdW5wYXJzZWFibGUudG9TdHJpbmcoKSwgZm9yZWlnbi50b1N0cmluZygpXSxcblx0XHQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVyxnQkFBZ0I7QUFDcEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsbUJBQW1CLDBCQUEwQix5QkFBeUI7QUFFL0UsTUFBTSxNQUFNLENBQUMsVUFBa0IsVUFBVSxTQUFTLFdBQVcsS0FBSyxDQUFDLEVBQUUsU0FBUztBQUU5RSxTQUFTLFVBQVUsWUFBb0IsWUFBb0IsVUFBa0Is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
