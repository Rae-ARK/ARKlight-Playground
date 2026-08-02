import assert from "assert";
import { basename, dirname, joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { AhpJsonlLogger, getAhpLogByteLength, stringifyAhpLogEntry } from "../../common/ahpJsonlLogger.js";
suite("AhpJsonlLogger", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("writes canonical JSON-RPC JSONL with metadata at the root", async () => {
    const fileService = store.add(new FileService(new NullLogService()));
    store.add(fileService.registerProvider("file", store.add(new InMemoryFileSystemProvider())));
    const logger = store.add(new AhpJsonlLogger(
      { logsHome: URI.file("/logs"), connectionId: "conn:1", transport: "websocket" },
      fileService,
      new NullLogService()
    ));
    const requestText = '{"jsonrpc":"2.0","id":"request-1","method":"initialize","params":{"protocolVersion":1}}';
    const uri = URI.parse("ahp-session:/session-1");
    logger.log(JSON.parse(requestText), "c2s", getAhpLogByteLength(requestText));
    logger.log({ jsonrpc: "2.0", id: 2, result: { ok: true } }, "s2c");
    logger.log({ jsonrpc: "2.0", id: null, error: { code: -32e3, message: "Nope" } }, "s2c");
    logger.log({ jsonrpc: "2.0", method: "notification", params: { uri } }, "s2c");
    await logger.flush();
    const content = (await fileService.readFile(logger.resource)).value.toString();
    const lines = content.split("\n").filter(Boolean);
    const parsed = lines.map((line) => JSON.parse(line));
    assert.deepStrictEqual(parsed.map((entry) => ({
      jsonrpc: entry.jsonrpc,
      id: entry.id,
      method: entry.method,
      hasResult: Object.hasOwn(entry, "result"),
      hasError: Object.hasOwn(entry, "error"),
      params: entry.params,
      log: entry._ahpLog
    })), [
      {
        jsonrpc: "2.0",
        id: "request-1",
        method: "initialize",
        hasResult: false,
        hasError: false,
        params: { protocolVersion: 1 },
        log: {
          ts: parsed[0]._ahpLog.ts,
          dir: "c2s",
          connectionId: "conn:1",
          transport: "websocket",
          byteLength: getAhpLogByteLength(requestText)
        }
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: void 0,
        hasResult: true,
        hasError: false,
        params: void 0,
        log: {
          ts: parsed[1]._ahpLog.ts,
          dir: "s2c",
          connectionId: "conn:1",
          transport: "websocket"
        }
      },
      {
        jsonrpc: "2.0",
        id: null,
        method: void 0,
        hasResult: false,
        hasError: true,
        params: void 0,
        log: {
          ts: parsed[2]._ahpLog.ts,
          dir: "s2c",
          connectionId: "conn:1",
          transport: "websocket"
        }
      },
      {
        jsonrpc: "2.0",
        id: void 0,
        method: "notification",
        hasResult: false,
        hasError: false,
        params: { uri: uri.toString() },
        log: {
          ts: parsed[3]._ahpLog.ts,
          dir: "s2c",
          connectionId: "conn:1",
          transport: "websocket"
        }
      }
    ]);
    for (const entry of parsed) {
      assert.strictEqual(entry.jsonrpc, "2.0");
      assert.ok(entry.method !== void 0 || entry.id !== void 0 && (Object.hasOwn(entry, "result") || Object.hasOwn(entry, "error")));
    }
  });
  test("rotates JSONL files and keeps bounded history", async () => {
    const fileService = store.add(new FileService(new NullLogService()));
    store.add(fileService.registerProvider("file", store.add(new InMemoryFileSystemProvider())));
    const logger = store.add(new AhpJsonlLogger(
      { logsHome: URI.file("/logs"), connectionId: "rotating", transport: "websocket", maxFileSizeBytes: 1, maxFiles: 2 },
      fileService,
      new NullLogService()
    ));
    const firstResource = logger.resource;
    const currentBaseName = basename(firstResource, ".jsonl");
    const rotated1 = joinPath(dirname(firstResource), `${currentBaseName}.1.jsonl`);
    const rotated2 = joinPath(dirname(firstResource), `${currentBaseName}.2.jsonl`);
    logger.log({ jsonrpc: "2.0", id: 1, result: "one" }, "s2c");
    logger.log({ jsonrpc: "2.0", id: 2, result: "two" }, "s2c");
    logger.log({ jsonrpc: "2.0", id: 3, result: "three" }, "s2c");
    await logger.flush();
    const lines = [
      ...(await fileService.readFile(rotated1)).value.toString().split("\n").filter(Boolean),
      ...(await fileService.readFile(rotated2)).value.toString().split("\n").filter(Boolean)
    ];
    const parsed = lines.map((line) => JSON.parse(line));
    assert.deepStrictEqual({
      firstFileExists: await fileService.exists(firstResource),
      ids: parsed.map((entry) => entry.id),
      rootsAreJsonRpc: parsed.every((entry) => entry.jsonrpc === "2.0" && (entry.method !== void 0 || entry.id !== void 0 && (Object.hasOwn(entry, "result") || Object.hasOwn(entry, "error"))))
    }, {
      firstFileExists: false,
      ids: [2, 3],
      rootsAreJsonRpc: true
    });
  });
  test("coalesces synchronously queued log calls into a single write", async () => {
    const fileService = store.add(new FileService(new NullLogService()));
    const provider = store.add(new RecordingInMemoryFileSystemProvider());
    store.add(fileService.registerProvider("file", provider));
    const logger = store.add(new AhpJsonlLogger(
      { logsHome: URI.file("/logs"), connectionId: "batched", transport: "websocket" },
      fileService,
      new NullLogService()
    ));
    const messageCount = 50;
    for (let i = 0; i < messageCount; i++) {
      logger.log({ jsonrpc: "2.0", id: i, result: { ok: true } }, "s2c");
    }
    await logger.flush();
    const content = (await fileService.readFile(logger.resource)).value.toString();
    const lines = content.split("\n").filter(Boolean);
    const ids = lines.map((line) => JSON.parse(line).id);
    assert.deepStrictEqual({
      lineCount: lines.length,
      idsInOrder: ids,
      writeCount: provider.writeCount
    }, {
      lineCount: messageCount,
      idsInOrder: Array.from({ length: messageCount }, (_, i) => i),
      writeCount: 1
    });
  });
  test("flush waits for batched writes and ordering is preserved across drains", async () => {
    const fileService = store.add(new FileService(new NullLogService()));
    store.add(fileService.registerProvider("file", store.add(new InMemoryFileSystemProvider())));
    const logger = store.add(new AhpJsonlLogger(
      { logsHome: URI.file("/logs"), connectionId: "flush-order", transport: "websocket" },
      fileService,
      new NullLogService()
    ));
    logger.log({ jsonrpc: "2.0", id: 1, result: "a" }, "s2c");
    logger.log({ jsonrpc: "2.0", id: 2, result: "b" }, "s2c");
    const firstFlush = logger.flush();
    logger.log({ jsonrpc: "2.0", id: 3, result: "c" }, "s2c");
    await firstFlush;
    logger.log({ jsonrpc: "2.0", id: 4, result: "d" }, "s2c");
    await logger.flush();
    const content = (await fileService.readFile(logger.resource)).value.toString();
    const ids = content.split("\n").filter(Boolean).map((line) => JSON.parse(line).id);
    assert.deepStrictEqual(ids, [1, 2, 3, 4]);
  });
  test("elides oversized string payloads while keeping the line valid JSONL", async () => {
    const fileService = store.add(new FileService(new NullLogService()));
    store.add(fileService.registerProvider("file", store.add(new InMemoryFileSystemProvider())));
    const logger = store.add(new AhpJsonlLogger(
      { logsHome: URI.file("/logs"), connectionId: "conn:1", transport: "websocket" },
      fileService,
      new NullLogService()
    ));
    logger.log({ jsonrpc: "2.0", id: 1, method: "ping" }, "c2s");
    const huge = "x".repeat(4 * 1024 * 1024);
    logger.log({ jsonrpc: "2.0", id: 2, result: { data: huge } }, "s2c");
    await logger.flush();
    const content = (await fileService.readFile(logger.resource)).value.toString();
    const lines = content.split("\n").filter(Boolean);
    const parsed = lines.map((line) => JSON.parse(line));
    assert.strictEqual(parsed[0]._ahpLog.truncated, void 0);
    assert.strictEqual(parsed[1]._ahpLog.truncated, true);
    assert.ok(parsed[1].result.data.length < huge.length);
    assert.ok(parsed[1].result.data.includes("chars elided"));
    assert.ok(lines[1].length < 1024 * 1024);
  });
  suite("stringifyAhpLogEntry", () => {
    test("serialises a top-level URI as its string form", () => {
      const uri = URI.parse("file:///tmp/example.txt");
      const result = JSON.parse(stringifyAhpLogEntry({ uri }));
      assert.strictEqual(result.uri, uri.toString());
    });
    test("serialises URIs nested in arrays and objects", () => {
      const a = URI.parse("file:///a");
      const b = URI.parse("https://example.com/b?x=1");
      const c = URI.parse("untitled:Untitled-1");
      const payload = {
        items: [a, { nested: b }, [c]]
      };
      const result = JSON.parse(stringifyAhpLogEntry(payload));
      assert.deepStrictEqual(result, {
        items: [a.toString(), { nested: b.toString() }, [c.toString()]]
      });
    });
    test("round-trips raw UriComponents marked with $mid", () => {
      const uri = URI.parse("vscode://example/path");
      const components = uri.toJSON();
      const result = JSON.parse(stringifyAhpLogEntry({ uri: components }));
      assert.strictEqual(result.uri, uri.toString());
    });
    test("leaves URI-shaped objects without $mid as plain objects", () => {
      const payload = {
        scheme: "not-a-uri",
        path: "/something"
      };
      const result = JSON.parse(stringifyAhpLogEntry(payload));
      assert.deepStrictEqual(result, payload);
    });
    test("does not misidentify non-URI objects that carry $mid: 1", () => {
      const payload = { $mid: 1, label: "not a uri" };
      const result = JSON.parse(stringifyAhpLogEntry(payload));
      assert.deepStrictEqual(result, payload);
    });
  });
});
class RecordingInMemoryFileSystemProvider extends InMemoryFileSystemProvider {
  constructor() {
    super(...arguments);
    this.writeCount = 0;
  }
  async writeFile(resource, content, opts) {
    this.writeCount++;
    return super.writeFile(resource, content, opts);
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L2NvbW1vbi9haHBKc29ubExvZ2dlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUsIGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlV3JpdGVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWhwSnNvbmxMb2dnZXIsIGdldEFocExvZ0J5dGVMZW5ndGgsIHN0cmluZ2lmeUFocExvZ0VudHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FocEpzb25sTG9nZ2VyLmpzJztcblxuc3VpdGUoJ0FocEpzb25sTG9nZ2VyJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnd3JpdGVzIGNhbm9uaWNhbCBKU09OLVJQQyBKU09OTCB3aXRoIG1ldGFkYXRhIGF0IHRoZSByb290JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdHN0b3JlLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgc3RvcmUuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXG5cdFx0Y29uc3QgbG9nZ2VyID0gc3RvcmUuYWRkKG5ldyBBaHBKc29ubExvZ2dlcihcblx0XHRcdHsgbG9nc0hvbWU6IFVSSS5maWxlKCcvbG9ncycpLCBjb25uZWN0aW9uSWQ6ICdjb25uOjEnLCB0cmFuc3BvcnQ6ICd3ZWJzb2NrZXQnIH0sXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdFRleHQgPSAne1wianNvbnJwY1wiOlwiMi4wXCIsXCJpZFwiOlwicmVxdWVzdC0xXCIsXCJtZXRob2RcIjpcImluaXRpYWxpemVcIixcInBhcmFtc1wiOntcInByb3RvY29sVmVyc2lvblwiOjF9fSc7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdhaHAtc2Vzc2lvbjovc2Vzc2lvbi0xJyk7XG5cdFx0bG9nZ2VyLmxvZyhKU09OLnBhcnNlKHJlcXVlc3RUZXh0KSwgJ2MycycsIGdldEFocExvZ0J5dGVMZW5ndGgocmVxdWVzdFRleHQpKTtcblx0XHRsb2dnZXIubG9nKHsganNvbnJwYzogJzIuMCcsIGlkOiAyLCByZXN1bHQ6IHsgb2s6IHRydWUgfSB9LCAnczJjJyk7XG5cdFx0bG9nZ2VyLmxvZyh7IGpzb25ycGM6ICcyLjAnLCBpZDogbnVsbCwgZXJyb3I6IHsgY29kZTogLTMyMDAwLCBtZXNzYWdlOiAnTm9wZScgfSB9LCAnczJjJyk7XG5cdFx0bG9nZ2VyLmxvZyh7IGpzb25ycGM6ICcyLjAnLCBtZXRob2Q6ICdub3RpZmljYXRpb24nLCBwYXJhbXM6IHsgdXJpIH0gfSwgJ3MyYycpO1xuXHRcdGF3YWl0IGxvZ2dlci5mbHVzaCgpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShsb2dnZXIucmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJykuZmlsdGVyKEJvb2xlYW4pO1xuXHRcdGNvbnN0IHBhcnNlZCA9IGxpbmVzLm1hcChsaW5lID0+IEpTT04ucGFyc2UobGluZSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQubWFwKGVudHJ5ID0+ICh7XG5cdFx0XHRqc29ucnBjOiBlbnRyeS5qc29ucnBjLFxuXHRcdFx0aWQ6IGVudHJ5LmlkLFxuXHRcdFx0bWV0aG9kOiBlbnRyeS5tZXRob2QsXG5cdFx0XHRoYXNSZXN1bHQ6IE9iamVjdC5oYXNPd24oZW50cnksICdyZXN1bHQnKSxcblx0XHRcdGhhc0Vycm9yOiBPYmplY3QuaGFzT3duKGVudHJ5LCAnZXJyb3InKSxcblx0XHRcdHBhcmFtczogZW50cnkucGFyYW1zLFxuXHRcdFx0bG9nOiBlbnRyeS5fYWhwTG9nLFxuXHRcdH0pKSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0aWQ6ICdyZXF1ZXN0LTEnLFxuXHRcdFx0XHRtZXRob2Q6ICdpbml0aWFsaXplJyxcblx0XHRcdFx0aGFzUmVzdWx0OiBmYWxzZSxcblx0XHRcdFx0aGFzRXJyb3I6IGZhbHNlLFxuXHRcdFx0XHRwYXJhbXM6IHsgcHJvdG9jb2xWZXJzaW9uOiAxIH0sXG5cdFx0XHRcdGxvZzoge1xuXHRcdFx0XHRcdHRzOiBwYXJzZWRbMF0uX2FocExvZy50cyxcblx0XHRcdFx0XHRkaXI6ICdjMnMnLFxuXHRcdFx0XHRcdGNvbm5lY3Rpb25JZDogJ2Nvbm46MScsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiAnd2Vic29ja2V0Jyxcblx0XHRcdFx0XHRieXRlTGVuZ3RoOiBnZXRBaHBMb2dCeXRlTGVuZ3RoKHJlcXVlc3RUZXh0KSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0XHRpZDogMixcblx0XHRcdFx0bWV0aG9kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGhhc1Jlc3VsdDogdHJ1ZSxcblx0XHRcdFx0aGFzRXJyb3I6IGZhbHNlLFxuXHRcdFx0XHRwYXJhbXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0bG9nOiB7XG5cdFx0XHRcdFx0dHM6IHBhcnNlZFsxXS5fYWhwTG9nLnRzLFxuXHRcdFx0XHRcdGRpcjogJ3MyYycsXG5cdFx0XHRcdFx0Y29ubmVjdGlvbklkOiAnY29ubjoxJyxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6ICd3ZWJzb2NrZXQnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdGlkOiBudWxsLFxuXHRcdFx0XHRtZXRob2Q6IHVuZGVmaW5lZCxcblx0XHRcdFx0aGFzUmVzdWx0OiBmYWxzZSxcblx0XHRcdFx0aGFzRXJyb3I6IHRydWUsXG5cdFx0XHRcdHBhcmFtczogdW5kZWZpbmVkLFxuXHRcdFx0XHRsb2c6IHtcblx0XHRcdFx0XHR0czogcGFyc2VkWzJdLl9haHBMb2cudHMsXG5cdFx0XHRcdFx0ZGlyOiAnczJjJyxcblx0XHRcdFx0XHRjb25uZWN0aW9uSWQ6ICdjb25uOjEnLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogJ3dlYnNvY2tldCcsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdFx0aWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0bWV0aG9kOiAnbm90aWZpY2F0aW9uJyxcblx0XHRcdFx0aGFzUmVzdWx0OiBmYWxzZSxcblx0XHRcdFx0aGFzRXJyb3I6IGZhbHNlLFxuXHRcdFx0XHRwYXJhbXM6IHsgdXJpOiB1cmkudG9TdHJpbmcoKSB9LFxuXHRcdFx0XHRsb2c6IHtcblx0XHRcdFx0XHR0czogcGFyc2VkWzNdLl9haHBMb2cudHMsXG5cdFx0XHRcdFx0ZGlyOiAnczJjJyxcblx0XHRcdFx0XHRjb25uZWN0aW9uSWQ6ICdjb25uOjEnLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogJ3dlYnNvY2tldCcsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBwYXJzZWQpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5qc29ucnBjLCAnMi4wJyk7XG5cdFx0XHRhc3NlcnQub2soZW50cnkubWV0aG9kICE9PSB1bmRlZmluZWQgfHwgKGVudHJ5LmlkICE9PSB1bmRlZmluZWQgJiYgKE9iamVjdC5oYXNPd24oZW50cnksICdyZXN1bHQnKSB8fCBPYmplY3QuaGFzT3duKGVudHJ5LCAnZXJyb3InKSkpKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JvdGF0ZXMgSlNPTkwgZmlsZXMgYW5kIGtlZXBzIGJvdW5kZWQgaGlzdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRzdG9yZS5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIHN0b3JlLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblxuXHRcdGNvbnN0IGxvZ2dlciA9IHN0b3JlLmFkZChuZXcgQWhwSnNvbmxMb2dnZXIoXG5cdFx0XHR7IGxvZ3NIb21lOiBVUkkuZmlsZSgnL2xvZ3MnKSwgY29ubmVjdGlvbklkOiAncm90YXRpbmcnLCB0cmFuc3BvcnQ6ICd3ZWJzb2NrZXQnLCBtYXhGaWxlU2l6ZUJ5dGVzOiAxLCBtYXhGaWxlczogMiB9LFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblx0XHRjb25zdCBmaXJzdFJlc291cmNlID0gbG9nZ2VyLnJlc291cmNlO1xuXHRcdGNvbnN0IGN1cnJlbnRCYXNlTmFtZSA9IGJhc2VuYW1lKGZpcnN0UmVzb3VyY2UsICcuanNvbmwnKTtcblx0XHRjb25zdCByb3RhdGVkMSA9IGpvaW5QYXRoKGRpcm5hbWUoZmlyc3RSZXNvdXJjZSksIGAke2N1cnJlbnRCYXNlTmFtZX0uMS5qc29ubGApO1xuXHRcdGNvbnN0IHJvdGF0ZWQyID0gam9pblBhdGgoZGlybmFtZShmaXJzdFJlc291cmNlKSwgYCR7Y3VycmVudEJhc2VOYW1lfS4yLmpzb25sYCk7XG5cblx0XHRsb2dnZXIubG9nKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCByZXN1bHQ6ICdvbmUnIH0sICdzMmMnKTtcblx0XHRsb2dnZXIubG9nKHsganNvbnJwYzogJzIuMCcsIGlkOiAyLCByZXN1bHQ6ICd0d28nIH0sICdzMmMnKTtcblx0XHRsb2dnZXIubG9nKHsganNvbnJwYzogJzIuMCcsIGlkOiAzLCByZXN1bHQ6ICd0aHJlZScgfSwgJ3MyYycpO1xuXHRcdGF3YWl0IGxvZ2dlci5mbHVzaCgpO1xuXG5cdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0XHQuLi4oYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUocm90YXRlZDEpKS52YWx1ZS50b1N0cmluZygpLnNwbGl0KCdcXG4nKS5maWx0ZXIoQm9vbGVhbiksXG5cdFx0XHQuLi4oYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUocm90YXRlZDIpKS52YWx1ZS50b1N0cmluZygpLnNwbGl0KCdcXG4nKS5maWx0ZXIoQm9vbGVhbiksXG5cdFx0XTtcblx0XHRjb25zdCBwYXJzZWQgPSBsaW5lcy5tYXAobGluZSA9PiBKU09OLnBhcnNlKGxpbmUpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Zmlyc3RGaWxlRXhpc3RzOiBhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoZmlyc3RSZXNvdXJjZSksXG5cdFx0XHRpZHM6IHBhcnNlZC5tYXAoZW50cnkgPT4gZW50cnkuaWQpLFxuXHRcdFx0cm9vdHNBcmVKc29uUnBjOiBwYXJzZWQuZXZlcnkoZW50cnkgPT4gZW50cnkuanNvbnJwYyA9PT0gJzIuMCcgJiYgKGVudHJ5Lm1ldGhvZCAhPT0gdW5kZWZpbmVkIHx8IChlbnRyeS5pZCAhPT0gdW5kZWZpbmVkICYmIChPYmplY3QuaGFzT3duKGVudHJ5LCAncmVzdWx0JykgfHwgT2JqZWN0Lmhhc093bihlbnRyeSwgJ2Vycm9yJykpKSkpLFxuXHRcdH0sIHtcblx0XHRcdGZpcnN0RmlsZUV4aXN0czogZmFsc2UsXG5cdFx0XHRpZHM6IFsyLCAzXSxcblx0XHRcdHJvb3RzQXJlSnNvblJwYzogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29hbGVzY2VzIHN5bmNocm9ub3VzbHkgcXVldWVkIGxvZyBjYWxscyBpbnRvIGEgc2luZ2xlIHdyaXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gc3RvcmUuYWRkKG5ldyBSZWNvcmRpbmdJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRzdG9yZS5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIHByb3ZpZGVyKSk7XG5cblx0XHRjb25zdCBsb2dnZXIgPSBzdG9yZS5hZGQobmV3IEFocEpzb25sTG9nZ2VyKFxuXHRcdFx0eyBsb2dzSG9tZTogVVJJLmZpbGUoJy9sb2dzJyksIGNvbm5lY3Rpb25JZDogJ2JhdGNoZWQnLCB0cmFuc3BvcnQ6ICd3ZWJzb2NrZXQnIH0sXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgbWVzc2FnZUNvdW50ID0gNTA7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBtZXNzYWdlQ291bnQ7IGkrKykge1xuXHRcdFx0bG9nZ2VyLmxvZyh7IGpzb25ycGM6ICcyLjAnLCBpZDogaSwgcmVzdWx0OiB7IG9rOiB0cnVlIH0gfSwgJ3MyYycpO1xuXHRcdH1cblx0XHRhd2FpdCBsb2dnZXIuZmx1c2goKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSAoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUobG9nZ2VyLnJlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHRjb25zdCBsaW5lcyA9IGNvbnRlbnQuc3BsaXQoJ1xcbicpLmZpbHRlcihCb29sZWFuKTtcblx0XHRjb25zdCBpZHMgPSBsaW5lcy5tYXAobGluZSA9PiBKU09OLnBhcnNlKGxpbmUpLmlkKTtcblxuXHRcdC8vIEFsbCA1MCBsb2coKSBjYWxscyBhcmUgcXVldWVkIHN5bmNocm9ub3VzbHksIHNvIHRoZXkgYWxsIGxhbmQgaW4gdGhlXG5cdFx0Ly8gZmlyc3QgZHJhaW4gYW5kIG11c3QgYmUgY29hbGVzY2VkIGludG8gZXhhY3RseSBvbmUgd3JpdGVGaWxlLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bGluZUNvdW50OiBsaW5lcy5sZW5ndGgsXG5cdFx0XHRpZHNJbk9yZGVyOiBpZHMsXG5cdFx0XHR3cml0ZUNvdW50OiBwcm92aWRlci53cml0ZUNvdW50LFxuXHRcdH0sIHtcblx0XHRcdGxpbmVDb3VudDogbWVzc2FnZUNvdW50LFxuXHRcdFx0aWRzSW5PcmRlcjogQXJyYXkuZnJvbSh7IGxlbmd0aDogbWVzc2FnZUNvdW50IH0sIChfLCBpKSA9PiBpKSxcblx0XHRcdHdyaXRlQ291bnQ6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZsdXNoIHdhaXRzIGZvciBiYXRjaGVkIHdyaXRlcyBhbmQgb3JkZXJpbmcgaXMgcHJlc2VydmVkIGFjcm9zcyBkcmFpbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0c3RvcmUuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBzdG9yZS5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cblx0XHRjb25zdCBsb2dnZXIgPSBzdG9yZS5hZGQobmV3IEFocEpzb25sTG9nZ2VyKFxuXHRcdFx0eyBsb2dzSG9tZTogVVJJLmZpbGUoJy9sb2dzJyksIGNvbm5lY3Rpb25JZDogJ2ZsdXNoLW9yZGVyJywgdHJhbnNwb3J0OiAnd2Vic29ja2V0JyB9LFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdC8vIFN1Ym1pdCBhIGJhdGNoLCBwYXJ0aWFsbHkgZmx1c2gsIHRoZW4gc3VibWl0IGFub3RoZXIgYmF0Y2ggaW50ZXJsZWF2ZWRcblx0XHQvLyB3aXRoIHRoZSBmbHVzaCBcdTIwMTQgb3JkZXJpbmcgbXVzdCBiZSBwcmVzZXJ2ZWQuXG5cdFx0bG9nZ2VyLmxvZyh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgcmVzdWx0OiAnYScgfSwgJ3MyYycpO1xuXHRcdGxvZ2dlci5sb2coeyBqc29ucnBjOiAnMi4wJywgaWQ6IDIsIHJlc3VsdDogJ2InIH0sICdzMmMnKTtcblx0XHRjb25zdCBmaXJzdEZsdXNoID0gbG9nZ2VyLmZsdXNoKCk7XG5cdFx0bG9nZ2VyLmxvZyh7IGpzb25ycGM6ICcyLjAnLCBpZDogMywgcmVzdWx0OiAnYycgfSwgJ3MyYycpO1xuXHRcdGF3YWl0IGZpcnN0Rmx1c2g7XG5cdFx0bG9nZ2VyLmxvZyh7IGpzb25ycGM6ICcyLjAnLCBpZDogNCwgcmVzdWx0OiAnZCcgfSwgJ3MyYycpO1xuXHRcdGF3YWl0IGxvZ2dlci5mbHVzaCgpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShsb2dnZXIucmVzb3VyY2UpKS52YWx1ZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGlkcyA9IGNvbnRlbnQuc3BsaXQoJ1xcbicpLmZpbHRlcihCb29sZWFuKS5tYXAobGluZSA9PiBKU09OLnBhcnNlKGxpbmUpLmlkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGlkcywgWzEsIDIsIDMsIDRdKTtcblx0fSk7XG5cblx0dGVzdCgnZWxpZGVzIG92ZXJzaXplZCBzdHJpbmcgcGF5bG9hZHMgd2hpbGUga2VlcGluZyB0aGUgbGluZSB2YWxpZCBKU09OTCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRzdG9yZS5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIHN0b3JlLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblxuXHRcdGNvbnN0IGxvZ2dlciA9IHN0b3JlLmFkZChuZXcgQWhwSnNvbmxMb2dnZXIoXG5cdFx0XHR7IGxvZ3NIb21lOiBVUkkuZmlsZSgnL2xvZ3MnKSwgY29ubmVjdGlvbklkOiAnY29ubjoxJywgdHJhbnNwb3J0OiAnd2Vic29ja2V0JyB9LFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdC8vIEEgbm9ybWFsIHNtYWxsIG1lc3NhZ2UgaXMgd3JpdHRlbiB2ZXJiYXRpbSBhbmQgaXMgbm90IG1hcmtlZCB0cnVuY2F0ZWQuXG5cdFx0bG9nZ2VyLmxvZyh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgbWV0aG9kOiAncGluZycgfSwgJ2MycycpO1xuXHRcdC8vIEEgbWVzc2FnZSBjYXJyeWluZyBhIG11bHRpLU1CIHN0cmluZyAoZS5nLiBhIGJhc2U2NCByZXNvdXJjZVJlYWQpIGlzIHRyaW1tZWQuXG5cdFx0Y29uc3QgaHVnZSA9ICd4Jy5yZXBlYXQoNCAqIDEwMjQgKiAxMDI0KTtcblx0XHRsb2dnZXIubG9nKHsganNvbnJwYzogJzIuMCcsIGlkOiAyLCByZXN1bHQ6IHsgZGF0YTogaHVnZSB9IH0sICdzMmMnKTtcblx0XHRhd2FpdCBsb2dnZXIuZmx1c2goKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSAoYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUobG9nZ2VyLnJlc291cmNlKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHRjb25zdCBsaW5lcyA9IGNvbnRlbnQuc3BsaXQoJ1xcbicpLmZpbHRlcihCb29sZWFuKTtcblx0XHQvLyBCb3RoIGxpbmVzIG11c3QgYmUgdmFsaWQgSlNPTiAodGhlIHRyaW1tZWQgbGluZSBzdGF5cyB3ZWxsLWZvcm1lZCBKU09OTCkuXG5cdFx0Y29uc3QgcGFyc2VkID0gbGluZXMubWFwKGxpbmUgPT4gSlNPTi5wYXJzZShsaW5lKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkWzBdLl9haHBMb2cudHJ1bmNhdGVkLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRbMV0uX2FocExvZy50cnVuY2F0ZWQsIHRydWUpO1xuXHRcdC8vIFRoZSBodWdlIHN0cmluZyB3YXMgZWxpZGVkIHJhdGhlciB0aGFuIHdyaXR0ZW4gaW4gZnVsbC5cblx0XHRhc3NlcnQub2socGFyc2VkWzFdLnJlc3VsdC5kYXRhLmxlbmd0aCA8IGh1Z2UubGVuZ3RoKTtcblx0XHRhc3NlcnQub2socGFyc2VkWzFdLnJlc3VsdC5kYXRhLmluY2x1ZGVzKCdjaGFycyBlbGlkZWQnKSk7XG5cdFx0Ly8gVGhlIHdob2xlIHNlcmlhbGl6ZWQgbGluZSBzdGF5cyBtb2Rlc3QgaW4gc2l6ZS5cblx0XHRhc3NlcnQub2sobGluZXNbMV0ubGVuZ3RoIDwgMTAyNCAqIDEwMjQpO1xuXHR9KTtcblxuXHRzdWl0ZSgnc3RyaW5naWZ5QWhwTG9nRW50cnknLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzZXJpYWxpc2VzIGEgdG9wLWxldmVsIFVSSSBhcyBpdHMgc3RyaW5nIGZvcm0nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdG1wL2V4YW1wbGUudHh0Jyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBKU09OLnBhcnNlKHN0cmluZ2lmeUFocExvZ0VudHJ5KHsgdXJpIH0pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudXJpLCB1cmkudG9TdHJpbmcoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXJpYWxpc2VzIFVSSXMgbmVzdGVkIGluIGFycmF5cyBhbmQgb2JqZWN0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGEgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vYScpO1xuXHRcdFx0Y29uc3QgYiA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9iP3g9MScpO1xuXHRcdFx0Y29uc3QgYyA9IFVSSS5wYXJzZSgndW50aXRsZWQ6VW50aXRsZWQtMScpO1xuXHRcdFx0Y29uc3QgcGF5bG9hZCA9IHtcblx0XHRcdFx0aXRlbXM6IFthLCB7IG5lc3RlZDogYiB9LCBbY11dLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IEpTT04ucGFyc2Uoc3RyaW5naWZ5QWhwTG9nRW50cnkocGF5bG9hZCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0aXRlbXM6IFthLnRvU3RyaW5nKCksIHsgbmVzdGVkOiBiLnRvU3RyaW5nKCkgfSwgW2MudG9TdHJpbmcoKV1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyb3VuZC10cmlwcyByYXcgVXJpQ29tcG9uZW50cyBtYXJrZWQgd2l0aCAkbWlkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCd2c2NvZGU6Ly9leGFtcGxlL3BhdGgnKTtcblx0XHRcdGNvbnN0IGNvbXBvbmVudHMgPSB1cmkudG9KU09OKCk7XG5cdFx0XHQvLyBTaW11bGF0ZSBhIHZhbHVlIHRoYXQgY2FtZSBiYWNrIG92ZXIgSVBDIGFuZCB3YXMgbmV2ZXIgcmV2aXZlZFxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gSlNPTi5wYXJzZShzdHJpbmdpZnlBaHBMb2dFbnRyeSh7IHVyaTogY29tcG9uZW50cyB9KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnVyaSwgdXJpLnRvU3RyaW5nKCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGVhdmVzIFVSSS1zaGFwZWQgb2JqZWN0cyB3aXRob3V0ICRtaWQgYXMgcGxhaW4gb2JqZWN0cycsICgpID0+IHtcblx0XHRcdC8vIEEgdXNlciBwYXlsb2FkIHRoYXQgaGFwcGVucyB0byBoYXZlIFVSSS1saWtlIGZpZWxkcyBidXQgaXMgbm90IGFcblx0XHRcdC8vIFVSSSBtdXN0IG5vdCBiZSBzaWxlbnRseSByZXdyaXR0ZW4uXG5cdFx0XHRjb25zdCBwYXlsb2FkID0ge1xuXHRcdFx0XHRzY2hlbWU6ICdub3QtYS11cmknLFxuXHRcdFx0XHRwYXRoOiAnL3NvbWV0aGluZycsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gSlNPTi5wYXJzZShzdHJpbmdpZnlBaHBMb2dFbnRyeShwYXlsb2FkKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgcGF5bG9hZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBtaXNpZGVudGlmeSBub24tVVJJIG9iamVjdHMgdGhhdCBjYXJyeSAkbWlkOiAxJywgKCkgPT4ge1xuXHRcdFx0Ly8gJG1pZCBpcyBvbmx5IHNhZmVseSBhIFVSSSBtYXJrZXIgd2hlbiB0aGUgb2JqZWN0IGFsc28gaGFzIHRoZVxuXHRcdFx0Ly8gVXJpQ29tcG9uZW50cyBzaGFwZSAoc2NoZW1lOiBzdHJpbmcpLiBOb24tY29uZm9ybWluZyBwYXlsb2Fkc1xuXHRcdFx0Ly8gbXVzdCBwYXNzIHRocm91Z2ggdW5jaGFuZ2VkLlxuXHRcdFx0Y29uc3QgcGF5bG9hZCA9IHsgJG1pZDogMSwgbGFiZWw6ICdub3QgYSB1cmknIH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBKU09OLnBhcnNlKHN0cmluZ2lmeUFocExvZ0VudHJ5KHBheWxvYWQpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBwYXlsb2FkKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuY2xhc3MgUmVjb3JkaW5nSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgZXh0ZW5kcyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB7XG5cdHdyaXRlQ291bnQgPSAwO1xuXHRvdmVycmlkZSBhc3luYyB3cml0ZUZpbGUocmVzb3VyY2U6IFVSSSwgY29udGVudDogVWludDhBcnJheSwgb3B0czogSUZpbGVXcml0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLndyaXRlQ291bnQrKztcblx0XHRyZXR1cm4gc3VwZXIud3JpdGVGaWxlKHJlc291cmNl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
