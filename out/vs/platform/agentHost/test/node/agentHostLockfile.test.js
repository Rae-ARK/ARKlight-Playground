import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import { join } from "../../../../base/common/path.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { createRemoteAgentHostState } from "../../common/remoteAgentHostMetadata.js";
import { PROTOCOL_VERSION } from "../../common/state/protocol/version/registry.js";
import {
  getLocalAgentHostLockfilePath,
  isPidAlive,
  readActiveAgentHostFromLockfile,
  readLocalAgentHostLockfile
} from "../../node/agentHostLockfile.js";
suite("Agent Host Lockfile (local)", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const logService = new NullLogService();
  const serverDataFolderName = ".vscode-server-insiders";
  const quality = "insider";
  let tempDir;
  let lockfilePath;
  setup(async () => {
    tempDir = await fs.promises.mkdtemp(join(os.tmpdir(), "agent-host-lockfile-test-"));
    lockfilePath = join(tempDir, "agent-host.lock");
  });
  teardown(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });
  function writeState(pid, port, connectionToken, overrides) {
    const state = {
      ...createRemoteAgentHostState({ pid, port, connectionToken: connectionToken ?? void 0, quality }),
      ...overrides
    };
    fs.writeFileSync(lockfilePath, JSON.stringify(state));
  }
  suite("getLocalAgentHostLockfilePath", () => {
    test("returns absolute path under home directory", () => {
      const result = getLocalAgentHostLockfilePath(serverDataFolderName, quality);
      assert.strictEqual(result, join(os.homedir(), ".vscode-server-insiders", "cli", "agent-host-insider.lock"));
    });
    test("keys lockfile name on quality", () => {
      const result = getLocalAgentHostLockfilePath(".vscode-server-oss", "stable");
      assert.strictEqual(result, join(os.homedir(), ".vscode-server-oss", "cli", "agent-host-stable.lock"));
    });
    test("rejects unsafe server data folder names", () => {
      assert.throws(() => getLocalAgentHostLockfilePath("foo bar", "stable"), /Unsafe server data folder name/);
      assert.throws(() => getLocalAgentHostLockfilePath("foo/bar", "stable"), /Unsafe server data folder name/);
      assert.throws(() => getLocalAgentHostLockfilePath("$(whoami)", "stable"), /Unsafe server data folder name/);
    });
    test("rejects unsafe quality strings", () => {
      assert.throws(() => getLocalAgentHostLockfilePath(".vscode-server-oss", "foo bar"), /Unsafe quality/);
      assert.throws(() => getLocalAgentHostLockfilePath(".vscode-server-oss", "/abs"), /Unsafe quality/);
    });
  });
  suite("isPidAlive", () => {
    test("returns true for the current process", () => {
      assert.strictEqual(isPidAlive(process.pid), true);
    });
    test("returns false for invalid PIDs", () => {
      assert.strictEqual(isPidAlive(0), false);
      assert.strictEqual(isPidAlive(-1), false);
      assert.strictEqual(isPidAlive(Number.NaN), false);
    });
    test("returns false for a clearly nonexistent PID", () => {
      assert.strictEqual(isPidAlive(2147483646), false);
    });
  });
  suite("readLocalAgentHostLockfile", () => {
    test("returns undefined when file does not exist", async () => {
      const result = await readLocalAgentHostLockfile(lockfilePath, logService);
      assert.strictEqual(result, void 0);
    });
    test("returns undefined for invalid JSON", async () => {
      fs.writeFileSync(lockfilePath, "not json at all");
      const result = await readLocalAgentHostLockfile(lockfilePath, logService);
      assert.strictEqual(result, void 0);
    });
    test("returns undefined when schema is invalid", async () => {
      fs.writeFileSync(lockfilePath, JSON.stringify({ pid: 1234, port: 8080 }));
      const result = await readLocalAgentHostLockfile(lockfilePath, logService);
      assert.strictEqual(result, void 0);
    });
    test("parses a valid state file", async () => {
      writeState(1234, 8080, "mytoken");
      const result = await readLocalAgentHostLockfile(lockfilePath, logService);
      assert.ok(result);
      assert.strictEqual(result.pid, 1234);
      assert.strictEqual(result.port, 8080);
      assert.strictEqual(result.connectionToken, "mytoken");
      assert.strictEqual(result.protocolVersion, PROTOCOL_VERSION);
    });
  });
  suite("readActiveAgentHostFromLockfile", () => {
    test("returns notFound when file is missing", async () => {
      const result = await readActiveAgentHostFromLockfile(lockfilePath, logService);
      assert.deepStrictEqual(result, { kind: "notFound" });
    });
    test("returns notFound when file is corrupt", async () => {
      fs.writeFileSync(lockfilePath, "garbage");
      const result = await readActiveAgentHostFromLockfile(lockfilePath, logService);
      assert.deepStrictEqual(result, { kind: "notFound" });
    });
    test("returns stale when PID is not running", async () => {
      writeState(2147483646, 8080, "tok");
      const result = await readActiveAgentHostFromLockfile(lockfilePath, logService);
      assert.deepStrictEqual(result, { kind: "stale", pid: 2147483646 });
    });
    test("returns compatible for a live PID with matching protocol", async () => {
      writeState(process.pid, 8080, "mytoken");
      const result = await readActiveAgentHostFromLockfile(lockfilePath, logService);
      assert.deepStrictEqual(result, {
        kind: "compatible",
        pid: process.pid,
        host: "127.0.0.1",
        port: 8080,
        connectionToken: "mytoken"
      });
    });
    test("returns compatible with undefined token when state has null token", async () => {
      writeState(process.pid, 8080, null);
      const result = await readActiveAgentHostFromLockfile(lockfilePath, logService);
      assert.deepStrictEqual(result, {
        kind: "compatible",
        pid: process.pid,
        host: "127.0.0.1",
        port: 8080,
        connectionToken: void 0
      });
    });
    test("treats newer protocol version as compatible", async () => {
      writeState(process.pid, 8080, "tok", { protocolVersion: "99.0.0" });
      const result = await readActiveAgentHostFromLockfile(lockfilePath, logService);
      assert.deepStrictEqual(result, {
        kind: "compatible",
        pid: process.pid,
        host: "127.0.0.1",
        port: 8080,
        connectionToken: "tok"
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0TG9ja2ZpbGUudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVSZW1vdGVBZ2VudEhvc3RTdGF0ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RNZXRhZGF0YS5qcyc7XG5pbXBvcnQgeyBQUk9UT0NPTF9WRVJTSU9OIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3ZlcnNpb24vcmVnaXN0cnkuanMnO1xuaW1wb3J0IHtcblx0Z2V0TG9jYWxBZ2VudEhvc3RMb2NrZmlsZVBhdGgsXG5cdGlzUGlkQWxpdmUsXG5cdHJlYWRBY3RpdmVBZ2VudEhvc3RGcm9tTG9ja2ZpbGUsXG5cdHJlYWRMb2NhbEFnZW50SG9zdExvY2tmaWxlLFxufSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdExvY2tmaWxlLmpzJztcblxuc3VpdGUoJ0FnZW50IEhvc3QgTG9ja2ZpbGUgKGxvY2FsKScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdGNvbnN0IHNlcnZlckRhdGFGb2xkZXJOYW1lID0gJy52c2NvZGUtc2VydmVyLWluc2lkZXJzJztcblx0Y29uc3QgcXVhbGl0eSA9ICdpbnNpZGVyJztcblxuXHRsZXQgdGVtcERpcjogc3RyaW5nO1xuXHRsZXQgbG9ja2ZpbGVQYXRoOiBzdHJpbmc7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdHRlbXBEaXIgPSBhd2FpdCBmcy5wcm9taXNlcy5ta2R0ZW1wKGpvaW4ob3MudG1wZGlyKCksICdhZ2VudC1ob3N0LWxvY2tmaWxlLXRlc3QtJykpO1xuXHRcdGxvY2tmaWxlUGF0aCA9IGpvaW4odGVtcERpciwgJ2FnZW50LWhvc3QubG9jaycpO1xuXHR9KTtcblxuXHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZnMucHJvbWlzZXMucm0odGVtcERpciwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuXHR9KTtcblxuXHRmdW5jdGlvbiB3cml0ZVN0YXRlKHBpZDogbnVtYmVyLCBwb3J0OiBudW1iZXIsIGNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkIHwgbnVsbCwgb3ZlcnJpZGVzPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB2b2lkIHtcblx0XHRjb25zdCBzdGF0ZSA9IHtcblx0XHRcdC4uLmNyZWF0ZVJlbW90ZUFnZW50SG9zdFN0YXRlKHsgcGlkLCBwb3J0LCBjb25uZWN0aW9uVG9rZW46IGNvbm5lY3Rpb25Ub2tlbiA/PyB1bmRlZmluZWQsIHF1YWxpdHkgfSksXG5cdFx0XHQuLi5vdmVycmlkZXMsXG5cdFx0fTtcblx0XHRmcy53cml0ZUZpbGVTeW5jKGxvY2tmaWxlUGF0aCwgSlNPTi5zdHJpbmdpZnkoc3RhdGUpKTtcblx0fVxuXG5cdHN1aXRlKCdnZXRMb2NhbEFnZW50SG9zdExvY2tmaWxlUGF0aCcsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIGFic29sdXRlIHBhdGggdW5kZXIgaG9tZSBkaXJlY3RvcnknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRMb2NhbEFnZW50SG9zdExvY2tmaWxlUGF0aChzZXJ2ZXJEYXRhRm9sZGVyTmFtZSwgcXVhbGl0eSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBqb2luKG9zLmhvbWVkaXIoKSwgJy52c2NvZGUtc2VydmVyLWluc2lkZXJzJywgJ2NsaScsICdhZ2VudC1ob3N0LWluc2lkZXIubG9jaycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tleXMgbG9ja2ZpbGUgbmFtZSBvbiBxdWFsaXR5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0TG9jYWxBZ2VudEhvc3RMb2NrZmlsZVBhdGgoJy52c2NvZGUtc2VydmVyLW9zcycsICdzdGFibGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGpvaW4ob3MuaG9tZWRpcigpLCAnLnZzY29kZS1zZXJ2ZXItb3NzJywgJ2NsaScsICdhZ2VudC1ob3N0LXN0YWJsZS5sb2NrJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyB1bnNhZmUgc2VydmVyIGRhdGEgZm9sZGVyIG5hbWVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRMb2NhbEFnZW50SG9zdExvY2tmaWxlUGF0aCgnZm9vIGJhcicsICdzdGFibGUnKSwgL1Vuc2FmZSBzZXJ2ZXIgZGF0YSBmb2xkZXIgbmFtZS8pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRMb2NhbEFnZW50SG9zdExvY2tmaWxlUGF0aCgnZm9vL2JhcicsICdzdGFibGUnKSwgL1Vuc2FmZSBzZXJ2ZXIgZGF0YSBmb2xkZXIgbmFtZS8pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRMb2NhbEFnZW50SG9zdExvY2tmaWxlUGF0aCgnJCh3aG9hbWkpJywgJ3N0YWJsZScpLCAvVW5zYWZlIHNlcnZlciBkYXRhIGZvbGRlciBuYW1lLyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHVuc2FmZSBxdWFsaXR5IHN0cmluZ3MnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldExvY2FsQWdlbnRIb3N0TG9ja2ZpbGVQYXRoKCcudnNjb2RlLXNlcnZlci1vc3MnLCAnZm9vIGJhcicpLCAvVW5zYWZlIHF1YWxpdHkvKTtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZ2V0TG9jYWxBZ2VudEhvc3RMb2NrZmlsZVBhdGgoJy52c2NvZGUtc2VydmVyLW9zcycsICcvYWJzJyksIC9VbnNhZmUgcXVhbGl0eS8pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaXNQaWRBbGl2ZScsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgZm9yIHRoZSBjdXJyZW50IHByb2Nlc3MnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNQaWRBbGl2ZShwcm9jZXNzLnBpZCksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSBmb3IgaW52YWxpZCBQSURzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzUGlkQWxpdmUoMCksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1BpZEFsaXZlKC0xKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzUGlkQWxpdmUoTnVtYmVyLk5hTiksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIGEgY2xlYXJseSBub25leGlzdGVudCBQSUQnLCAoKSA9PiB7XG5cdFx0XHQvLyAyXjMxIC0gMSBpcyBhIHZhbGlkIHNpZ25lZCAzMi1iaXQgaW50IGJ1dCB2YW5pc2hpbmdseSB1bmxpa2VseVxuXHRcdFx0Ly8gdG8gYmUgYSBsaXZlIFBJRCBvbiBhbnkgcmVhbCBtYWNoaW5lLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzUGlkQWxpdmUoMjE0NzQ4MzY0NiksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlYWRMb2NhbEFnZW50SG9zdExvY2tmaWxlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gZmlsZSBkb2VzIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlYWRMb2NhbEFnZW50SG9zdExvY2tmaWxlKGxvY2tmaWxlUGF0aCwgbG9nU2VydmljZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGludmFsaWQgSlNPTicsIGFzeW5jICgpID0+IHtcblx0XHRcdGZzLndyaXRlRmlsZVN5bmMobG9ja2ZpbGVQYXRoLCAnbm90IGpzb24gYXQgYWxsJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZWFkTG9jYWxBZ2VudEhvc3RMb2NrZmlsZShsb2NrZmlsZVBhdGgsIGxvZ1NlcnZpY2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gc2NoZW1hIGlzIGludmFsaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRmcy53cml0ZUZpbGVTeW5jKGxvY2tmaWxlUGF0aCwgSlNPTi5zdHJpbmdpZnkoeyBwaWQ6IDEyMzQsIHBvcnQ6IDgwODAgfSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVhZExvY2FsQWdlbnRIb3N0TG9ja2ZpbGUobG9ja2ZpbGVQYXRoLCBsb2dTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgYSB2YWxpZCBzdGF0ZSBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0d3JpdGVTdGF0ZSgxMjM0LCA4MDgwLCAnbXl0b2tlbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVhZExvY2FsQWdlbnRIb3N0TG9ja2ZpbGUobG9ja2ZpbGVQYXRoLCBsb2dTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5waWQsIDEyMzQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5wb3J0LCA4MDgwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29ubmVjdGlvblRva2VuLCAnbXl0b2tlbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5wcm90b2NvbFZlcnNpb24sIFBST1RPQ09MX1ZFUlNJT04pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVhZEFjdGl2ZUFnZW50SG9zdEZyb21Mb2NrZmlsZScsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIG5vdEZvdW5kIHdoZW4gZmlsZSBpcyBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVhZEFjdGl2ZUFnZW50SG9zdEZyb21Mb2NrZmlsZShsb2NrZmlsZVBhdGgsIGxvZ1NlcnZpY2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogJ25vdEZvdW5kJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgbm90Rm91bmQgd2hlbiBmaWxlIGlzIGNvcnJ1cHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRmcy53cml0ZUZpbGVTeW5jKGxvY2tmaWxlUGF0aCwgJ2dhcmJhZ2UnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlYWRBY3RpdmVBZ2VudEhvc3RGcm9tTG9ja2ZpbGUobG9ja2ZpbGVQYXRoLCBsb2dTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGtpbmQ6ICdub3RGb3VuZCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHN0YWxlIHdoZW4gUElEIGlzIG5vdCBydW5uaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0d3JpdGVTdGF0ZSgyMTQ3NDgzNjQ2LCA4MDgwLCAndG9rJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZWFkQWN0aXZlQWdlbnRIb3N0RnJvbUxvY2tmaWxlKGxvY2tmaWxlUGF0aCwgbG9nU2VydmljZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiAnc3RhbGUnLCBwaWQ6IDIxNDc0ODM2NDYgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGNvbXBhdGlibGUgZm9yIGEgbGl2ZSBQSUQgd2l0aCBtYXRjaGluZyBwcm90b2NvbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHdyaXRlU3RhdGUocHJvY2Vzcy5waWQsIDgwODAsICdteXRva2VuJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZWFkQWN0aXZlQWdlbnRIb3N0RnJvbUxvY2tmaWxlKGxvY2tmaWxlUGF0aCwgbG9nU2VydmljZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRraW5kOiAnY29tcGF0aWJsZScsXG5cdFx0XHRcdHBpZDogcHJvY2Vzcy5waWQsXG5cdFx0XHRcdGhvc3Q6ICcxMjcuMC4wLjEnLFxuXHRcdFx0XHRwb3J0OiA4MDgwLFxuXHRcdFx0XHRjb25uZWN0aW9uVG9rZW46ICdteXRva2VuJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBjb21wYXRpYmxlIHdpdGggdW5kZWZpbmVkIHRva2VuIHdoZW4gc3RhdGUgaGFzIG51bGwgdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR3cml0ZVN0YXRlKHByb2Nlc3MucGlkLCA4MDgwLCBudWxsKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlYWRBY3RpdmVBZ2VudEhvc3RGcm9tTG9ja2ZpbGUobG9ja2ZpbGVQYXRoLCBsb2dTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdGtpbmQ6ICdjb21wYXRpYmxlJyxcblx0XHRcdFx0cGlkOiBwcm9jZXNzLnBpZCxcblx0XHRcdFx0aG9zdDogJzEyNy4wLjAuMScsXG5cdFx0XHRcdHBvcnQ6IDgwODAsXG5cdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cmVhdHMgbmV3ZXIgcHJvdG9jb2wgdmVyc2lvbiBhcyBjb21wYXRpYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVGhlIGFnZW50IGhvc3Qgc2VydmVyIGlzIGRvd25sb2FkZWQgb24gZGVtYW5kIGFuZCBtYXkgc3BlYWsgYVxuXHRcdFx0Ly8gbmV3ZXIgcHJvdG9jb2wgdGhhbiB0aGlzIGNvbnN1bWVyIHdhcyBidWlsdCB3aXRoLiBSZXVzZSBpc1xuXHRcdFx0Ly8gdGhlIHJpZ2h0IGRlZmF1bHQ7IHRoZSByZW5kZXJlclx1MjE5NEFIIGhhbmRzaGFrZSBzdXJmYWNlcyBhbnlcblx0XHRcdC8vIGdlbnVpbmUgaW5jb21wYXRpYmlsaXR5LlxuXHRcdFx0d3JpdGVTdGF0ZShwcm9jZXNzLnBpZCwgODA4MCwgJ3RvaycsIHsgcHJvdG9jb2xWZXJzaW9uOiAnOTkuMC4wJyB9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlYWRBY3RpdmVBZ2VudEhvc3RGcm9tTG9ja2ZpbGUobG9ja2ZpbGVQYXRoLCBsb2dTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdGtpbmQ6ICdjb21wYXRpYmxlJyxcblx0XHRcdFx0cGlkOiBwcm9jZXNzLnBpZCxcblx0XHRcdFx0aG9zdDogJzEyNy4wLjAuMScsXG5cdFx0XHRcdHBvcnQ6IDgwODAsXG5cdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogJ3RvaycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFFBQVE7QUFDcEIsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHdCQUF3QjtBQUNqQztBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUNNO0FBRVAsTUFBTSwrQkFBK0IsTUFBTTtBQUUxQywwQ0FBd0M7QUFFeEMsUUFBTSxhQUFhLElBQUksZUFBZTtBQUN0QyxRQUFNLHVCQUF1QjtBQUM3QixRQUFNLFVBQVU7QUFFaEIsTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLFlBQVk7QUFDakIsY0FBVSxNQUFNLEdBQUcsU0FBUyxRQUFRLEtBQUssR0FBRyxPQUFPLEdBQUcsMkJBQTJCLENBQUM7QUFDbEYsbUJB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
