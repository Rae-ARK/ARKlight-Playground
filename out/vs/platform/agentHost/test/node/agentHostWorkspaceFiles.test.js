import assert from "assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { join } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentHostWorkspaceFiles } from "../../node/agentHostWorkspaceFiles.js";
suite("AgentHostWorkspaceFiles", () => {
  const disposables = new DisposableStore();
  const tempDirs = [];
  function createTempDir() {
    const dir = mkdtempSync(`${tmpdir()}/ahp-files-`);
    tempDirs.push(dir);
    return dir;
  }
  teardown(async () => {
    disposables.clear();
    for (const dir of tempDirs) {
      let lastErr;
      for (let i = 0; i < 10; i++) {
        try {
          rmSync(dir, { recursive: true, force: true });
          lastErr = void 0;
          break;
        } catch (err) {
          lastErr = err;
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      if (lastErr) {
        throw lastErr;
      }
    }
    tempDirs.length = 0;
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("enumerates files in the working directory", async () => {
    const dir = createTempDir();
    writeFileSync(join(dir, "a.txt"), "a");
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", "b.txt"), "b");
    const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
    const result = await files.getFiles(URI.file(dir), CancellationToken.None);
    const names = result.map((uri) => uri.path).sort();
    assert.ok(names.some((p) => p.endsWith("/a.txt")), `expected a.txt in ${names.join(",")}`);
    assert.ok(names.some((p) => p.endsWith("/sub/b.txt")), `expected sub/b.txt in ${names.join(",")}`);
  });
  test("respects .gitignore", async () => {
    const dir = createTempDir();
    writeFileSync(join(dir, ".gitignore"), "ignored.txt\n");
    writeFileSync(join(dir, "kept.txt"), "k");
    writeFileSync(join(dir, "ignored.txt"), "i");
    const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
    const result = await files.getFiles(URI.file(dir), CancellationToken.None);
    const names = result.map((uri) => uri.path);
    assert.ok(names.some((p) => p.endsWith("/kept.txt")));
    assert.ok(!names.some((p) => p.endsWith("/ignored.txt")), `ignored.txt should not be listed: ${names.join(",")}`);
  });
  test("excludes the .git directory", async () => {
    const dir = createTempDir();
    writeFileSync(join(dir, "a.txt"), "a");
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/main");
    const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
    const result = await files.getFiles(URI.file(dir), CancellationToken.None);
    const names = result.map((uri) => uri.path);
    assert.ok(names.some((p) => p.endsWith("/a.txt")));
    assert.ok(!names.some((p) => p.includes("/.git/")), `.git contents should be excluded: ${names.join(",")}`);
  });
  test("returns [] for non-file URIs", async () => {
    const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
    const result = await files.getFiles(URI.parse("vscode-vfs://github/foo/bar"), CancellationToken.None);
    assert.deepStrictEqual(result, []);
  });
  test("caches concurrent calls for the same working directory", async () => {
    const dir = createTempDir();
    writeFileSync(join(dir, "a.txt"), "a");
    const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
    const wd = URI.file(dir);
    const [r1, r2] = await Promise.all([
      files.getFiles(wd, CancellationToken.None),
      files.getFiles(wd, CancellationToken.None)
    ]);
    assert.strictEqual(r1, r2, "concurrent calls should share the same promise / result array");
  });
  test("rejects with CancellationError on cancellation", async () => {
    const dir = createTempDir();
    writeFileSync(join(dir, "a.txt"), "a");
    const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
    const cts = new CancellationTokenSource();
    const promise = files.getFiles(URI.file(dir), cts.token);
    cts.cancel();
    await assert.rejects(promise, (err) => err instanceof CancellationError);
    cts.dispose();
  });
  test("cancelling one caller does not poison concurrent callers sharing the cache", async () => {
    const dir = createTempDir();
    writeFileSync(join(dir, "a.txt"), "a");
    const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
    const wd = URI.file(dir);
    const cts = new CancellationTokenSource();
    const cancelled = files.getFiles(wd, cts.token);
    const survivor = files.getFiles(wd, CancellationToken.None);
    cts.cancel();
    cts.dispose();
    await assert.rejects(cancelled, (err) => err instanceof CancellationError);
    const result = await survivor;
    assert.ok(result.some((uri) => uri.path.endsWith("/a.txt")), `survivor should resolve with files even when first caller cancelled: ${result.map((u) => u.path).join(",")}`);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0V29ya3NwYWNlRmlsZXMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1rZGlyU3luYywgbWtkdGVtcFN5bmMsIHJtU3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RXb3Jrc3BhY2VGaWxlcyB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0V29ya3NwYWNlRmlsZXMuanMnO1xuXG5zdWl0ZSgnQWdlbnRIb3N0V29ya3NwYWNlRmlsZXMnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IHRlbXBEaXJzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVRlbXBEaXIoKTogc3RyaW5nIHtcblx0XHRjb25zdCBkaXIgPSBta2R0ZW1wU3luYyhgJHt0bXBkaXIoKX0vYWhwLWZpbGVzLWApO1xuXHRcdHRlbXBEaXJzLnB1c2goZGlyKTtcblx0XHRyZXR1cm4gZGlyO1xuXHR9XG5cblx0dGVhcmRvd24oYXN5bmMgKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0Ly8gT24gV2luZG93cywgcmlwZ3JlcCBoYW5kbGVzIG1heSB0YWtlIGEgdGljayB0byByZWxlYXNlIGFmdGVyXG5cdFx0Ly8gZGlzcG9zZSgpIGtpbGxzIHRoZSBjaGlsZCBwcm9jZXNzLiBSZXRyeSBybVN5bmMgcmF0aGVyIHRoYW5cblx0XHQvLyBmYWlsaW5nIG9uIHRyYW5zaWVudCBFQlVTWS5cblx0XHRmb3IgKGNvbnN0IGRpciBvZiB0ZW1wRGlycykge1xuXHRcdFx0bGV0IGxhc3RFcnI6IHVua25vd247XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwOyBpKyspIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRybVN5bmMoZGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdFx0XHRcdFx0bGFzdEVyciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0bGFzdEVyciA9IGVycjtcblx0XHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgNTApKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGxhc3RFcnIpIHtcblx0XHRcdFx0dGhyb3cgbGFzdEVycjtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGVtcERpcnMubGVuZ3RoID0gMDtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZW51bWVyYXRlcyBmaWxlcyBpbiB0aGUgd29ya2luZyBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyID0gY3JlYXRlVGVtcERpcigpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihkaXIsICdhLnR4dCcpLCAnYScpO1xuXHRcdG1rZGlyU3luYyhqb2luKGRpciwgJ3N1YicpKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4oZGlyLCAnc3ViJywgJ2IudHh0JyksICdiJyk7XG5cblx0XHRjb25zdCBmaWxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0V29ya3NwYWNlRmlsZXMobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmaWxlcy5nZXRGaWxlcyhVUkkuZmlsZShkaXIpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBuYW1lcyA9IHJlc3VsdC5tYXAodXJpID0+IHVyaS5wYXRoKS5zb3J0KCk7XG5cblx0XHRhc3NlcnQub2sobmFtZXMuc29tZShwID0+IHAuZW5kc1dpdGgoJy9hLnR4dCcpKSwgYGV4cGVjdGVkIGEudHh0IGluICR7bmFtZXMuam9pbignLCcpfWApO1xuXHRcdGFzc2VydC5vayhuYW1lcy5zb21lKHAgPT4gcC5lbmRzV2l0aCgnL3N1Yi9iLnR4dCcpKSwgYGV4cGVjdGVkIHN1Yi9iLnR4dCBpbiAke25hbWVzLmpvaW4oJywnKX1gKTtcblx0fSk7XG5cblx0dGVzdCgncmVzcGVjdHMgLmdpdGlnbm9yZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBjcmVhdGVUZW1wRGlyKCk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKGRpciwgJy5naXRpZ25vcmUnKSwgJ2lnbm9yZWQudHh0XFxuJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKGRpciwgJ2tlcHQudHh0JyksICdrJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKGRpciwgJ2lnbm9yZWQudHh0JyksICdpJyk7XG5cblx0XHRjb25zdCBmaWxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0V29ya3NwYWNlRmlsZXMobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmaWxlcy5nZXRGaWxlcyhVUkkuZmlsZShkaXIpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBuYW1lcyA9IHJlc3VsdC5tYXAodXJpID0+IHVyaS5wYXRoKTtcblxuXHRcdGFzc2VydC5vayhuYW1lcy5zb21lKHAgPT4gcC5lbmRzV2l0aCgnL2tlcHQudHh0JykpKTtcblx0XHRhc3NlcnQub2soIW5hbWVzLnNvbWUocCA9PiBwLmVuZHNXaXRoKCcvaWdub3JlZC50eHQnKSksIGBpZ25vcmVkLnR4dCBzaG91bGQgbm90IGJlIGxpc3RlZDogJHtuYW1lcy5qb2luKCcsJyl9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIHRoZSAuZ2l0IGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBjcmVhdGVUZW1wRGlyKCk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKGRpciwgJ2EudHh0JyksICdhJyk7XG5cdFx0bWtkaXJTeW5jKGpvaW4oZGlyLCAnLmdpdCcpKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4oZGlyLCAnLmdpdCcsICdIRUFEJyksICdyZWY6IHJlZnMvaGVhZHMvbWFpbicpO1xuXG5cdFx0Y29uc3QgZmlsZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFdvcmtzcGFjZUZpbGVzKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmlsZXMuZ2V0RmlsZXMoVVJJLmZpbGUoZGlyKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgbmFtZXMgPSByZXN1bHQubWFwKHVyaSA9PiB1cmkucGF0aCk7XG5cblx0XHRhc3NlcnQub2sobmFtZXMuc29tZShwID0+IHAuZW5kc1dpdGgoJy9hLnR4dCcpKSk7XG5cdFx0YXNzZXJ0Lm9rKCFuYW1lcy5zb21lKHAgPT4gcC5pbmNsdWRlcygnLy5naXQvJykpLCBgLmdpdCBjb250ZW50cyBzaG91bGQgYmUgZXhjbHVkZWQ6ICR7bmFtZXMuam9pbignLCcpfWApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIFtdIGZvciBub24tZmlsZSBVUklzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RXb3Jrc3BhY2VGaWxlcyhuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZpbGVzLmdldEZpbGVzKFVSSS5wYXJzZSgndnNjb2RlLXZmczovL2dpdGh1Yi9mb28vYmFyJyksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhY2hlcyBjb25jdXJyZW50IGNhbGxzIGZvciB0aGUgc2FtZSB3b3JraW5nIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBjcmVhdGVUZW1wRGlyKCk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKGRpciwgJ2EudHh0JyksICdhJyk7XG5cblx0XHRjb25zdCBmaWxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0V29ya3NwYWNlRmlsZXMobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCB3ZCA9IFVSSS5maWxlKGRpcik7XG5cdFx0Y29uc3QgW3IxLCByMl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRmaWxlcy5nZXRGaWxlcyh3ZCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRmaWxlcy5nZXRGaWxlcyh3ZCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIxLCByMiwgJ2NvbmN1cnJlbnQgY2FsbHMgc2hvdWxkIHNoYXJlIHRoZSBzYW1lIHByb21pc2UgLyByZXN1bHQgYXJyYXknKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyB3aXRoIENhbmNlbGxhdGlvbkVycm9yIG9uIGNhbmNlbGxhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBjcmVhdGVUZW1wRGlyKCk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKGRpciwgJ2EudHh0JyksICdhJyk7XG5cblx0XHRjb25zdCBmaWxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0V29ya3NwYWNlRmlsZXMobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjb25zdCBwcm9taXNlID0gZmlsZXMuZ2V0RmlsZXMoVVJJLmZpbGUoZGlyKSwgY3RzLnRva2VuKTtcblx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocHJvbWlzZSwgKGVycjogdW5rbm93bikgPT4gZXJyIGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IpO1xuXHRcdGN0cy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbGxpbmcgb25lIGNhbGxlciBkb2VzIG5vdCBwb2lzb24gY29uY3VycmVudCBjYWxsZXJzIHNoYXJpbmcgdGhlIGNhY2hlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpciA9IGNyZWF0ZVRlbXBEaXIoKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4oZGlyLCAnYS50eHQnKSwgJ2EnKTtcblxuXHRcdGNvbnN0IGZpbGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RXb3Jrc3BhY2VGaWxlcyhuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHdkID0gVVJJLmZpbGUoZGlyKTtcblxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IGNhbmNlbGxlZCA9IGZpbGVzLmdldEZpbGVzKHdkLCBjdHMudG9rZW4pO1xuXHRcdGNvbnN0IHN1cnZpdm9yID0gZmlsZXMuZ2V0RmlsZXMod2QsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGN0cy5jYW5jZWwoKTtcblx0XHRjdHMuZGlzcG9zZSgpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY2FuY2VsbGVkLCAoZXJyOiB1bmtub3duKSA9PiBlcnIgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3Vydml2b3I7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5zb21lKHVyaSA9PiB1cmkucGF0aC5lbmRzV2l0aCgnL2EudHh0JykpLCBgc3Vydml2b3Igc2hvdWxkIHJlc29sdmUgd2l0aCBmaWxlcyBldmVuIHdoZW4gZmlyc3QgY2FsbGVyIGNhbmNlbGxlZDogJHtyZXN1bHQubWFwKHUgPT4gdS5wYXRoKS5qb2luKCcsJyl9YCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXLGFBQWEsUUFBUSxxQkFBcUI7QUFDOUQsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0JBQStCO0FBRXhDLE1BQU0sMkJBQTJCLE1BQU07QUFFdEMsUUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFFBQU0sV0FBcUIsQ0FBQztBQUU1QixXQUFTLGdCQUF3QjtBQUNoQyxVQUFNLE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxhQUFhO0FBQ2hELGFBQVMsS0FBSyxHQUFHO0FBQ2pCLFdBQU87QUFBQSxFQUNSO0FBRUEsV0FBUyxZQUFZO0FBQ3BCLGdCQUFZLE1BQU07QUFJbEIsZUFBVyxPQUFPLFVBQVU7QUFDM0IsVUFBSTtBQUNKLGVBQVMsSUFBSSxHQUFHLElBQUksSUFBSSxLQUFLO0FBQzVCLFlBQUk7QUFDSCxpQkFBTyxLQUFLLEVBQUUsV0FBVyxNQUFNLE9BQU8sS0FBSyxDQUFDO0FBQzVDLG9CQUFVO0FBQ1Y7QUFBQSxRQUNELFNBQVMsS0FBSztBQUNiLG9CQUFVO0FBQ1YsZ0JBQU0sSUFBSSxRQUFRLE9BQUssV0FBVyxHQUFHLEVBQUUsQ0FBQztBQUFBLFFBQ3pDO0FBQUEsTUFDRDtBQUNBLFVBQUksU0FBUztBQUNaLGNBQU07QUFBQSxNQUNQO0FBQUEsSUFDRDtBQUNBLGFBQVMsU0FBUztBQUFBLEVBQ25CLENBQUM7QUFFRCwwQ0FBd0M7QUFFeEMsT0FBSyw2Q0FBNkMsWUFBWTtBQUM3RCxVQUFNLE1BQU0sY0FBYztBQUMxQixrQkFBYyxLQUFLLEtBQUssT0FBTyxHQUFHLEdBQUc7QUFDckMsY0FBVSxLQUFLLEtBQUssS0FBSyxDQUFDO0FBQzFCLGtCQUFjLEtBQUssS0FBSyxPQUFPLE9BQU8sR0FBRyxHQUFHO0FBRTVDLFVBQU0sUUFBUSxZQUFZLElBQUksSUFBSSx3QkFBd0IsSUFBSSxlQUFlLENBQUMsQ0FBQztBQUMvRSxVQUFNLFNBQVMsTUFBTSxNQUFNLFNBQVMsSUFBSSxLQUFLLEdBQUcsR0FBRyxrQkFBa0IsSUFBSTtBQUN6RSxVQUFNLFFBQVEsT0FBTyxJQUFJLFNBQU8sSUFBSSxJQUFJLEVBQUUsS0FBSztBQUUvQyxXQUFPLEdBQUcsTUFBTSxLQUFLLE9BQUssRUFBRSxTQUFTLFFBQVEsQ0FBQyxHQUFHLHFCQUFxQixNQUFNLEtBQUssR0FBRyxDQUFDLEVBQUU7QUFDdkYsV0FBTyxHQUFHLE1BQU0sS0FBSyxPQUFLLEVBQUUsU0FBUyxZQUFZLENBQUMsR0FBRyx5QkFBeUIsTUFBTSxLQUFLLEdBQUcsQ0FBQyxFQUFFO0FBQUEsRUFDaEcsQ0FBQztBQUVELE9BQUssdUJBQXVCLFlBQVk7QUFDdkMsVUFBTSxNQUFNLGNBQWM7QUFDMUIsa0JBQWMsS0FBSyxLQUFLLFlBQVksR0FBRyxlQUFlO0FBQ3RELGtCQUFjLEtBQUssS0FBSyxVQUFVLEdBQUcsR0FBRztBQUN4QyxrQkFBYyxLQUFLLEtBQUssYUFBYSxHQUFHLEdBQUc7QUFFM0MsVUFBTSxRQUFRLFlBQVksSUFBSSxJQUFJLHdCQUF3QixJQUFJLGVBQWUsQ0FBQyxDQUFDO0FBQy9FLFVBQU0sU0FBUyxNQUFNLE1BQU0sU0FBUyxJQUFJLEtBQUssR0FBRyxHQUFHLGtCQUFrQixJQUFJO0FBQ3pFLFVBQU0sUUFBUSxPQUFPLElBQUksU0FBTyxJQUFJLElBQUk7QUFFeEMsV0FBTyxHQUFHLE1BQU0sS0FBSyxPQUFLLEVBQUUsU0FBUyxXQUFXLENBQUMsQ0FBQztBQUNsRCxXQUFPLEdBQUcsQ0FBQyxNQUFNLEtBQUssT0FBSyxFQUFFLFNBQVMsY0FBYyxDQUFDLEdBQUcscUNBQXFDLE1BQU0sS0FBSyxHQUFHLENBQUMsRUFBRTtBQUFBLEVBQy9HLENBQUM7QUFFRCxPQUFLLCtCQUErQixZQUFZO0FBQy9DLFVBQU0sTUFBTSxjQUFjO0FBQzFCLGtCQUFjLEtBQUssS0FBSyxPQUFPLEdBQUcsR0FBRztBQUNyQyxjQUFVLEtBQUssS0FBSyxNQUFNLENBQUM7QUFDM0Isa0JBQWMsS0FBSyxLQUFLLFFBQVEsTUFBTSxHQUFHLHNCQUFzQjtBQUUvRCxVQUFNLFFBQVEsWUFBWSxJQUFJLElBQUksd0JBQXdCLElBQUksZUFBZSxDQUFDLENBQUM7QUFDL0UsVUFBTSxTQUFTLE1BQU0sTUFBTSxTQUFTLElBQUksS0FBSyxHQUFHLEdBQUcsa0JBQWtCLElBQUk7QUFDekUsVUFBTSxRQUFRLE9BQU8sSUFBSSxTQUFPLElBQUksSUFBSTtBQUV4QyxXQUFPLEdBQUcsTUFBTSxLQUFLLE9BQUssRUFBRSxTQUFTLFFBQVEsQ0FBQyxDQUFDO0FBQy9DLFdBQU8sR0FBRyxDQUFDLE1BQU0sS0FBSyxPQUFLLEVBQUUsU0FBUyxRQUFRLENBQUMsR0FBRyxxQ0FBcUMsTUFBTSxLQUFLLEdBQUcsQ0FBQyxFQUFFO0FBQUEsRUFDekcsQ0FBQztBQUVELE9BQUssZ0NBQWdDLFlBQVk7QUFDaEQsVUFBTSxRQUFRLFlBQVksSUFBSSxJQUFJLHdCQUF3QixJQUFJLGVBQWUsQ0FBQyxDQUFDO0FBQy9FLFVBQU0sU0FBUyxNQUFNLE1BQU0sU0FBUyxJQUFJLE1BQU0sNkJBQTZCLEdBQUcsa0JBQWtCLElBQUk7QUFDcEcsV0FBTyxnQkFBZ0IsUUFBUSxDQUFDLENBQUM7QUFBQSxFQUNsQyxDQUFDO0FBRUQsT0FBSywwREFBMEQsWUFBWTtBQUMxRSxVQUFNLE1BQU0sY0FBYztBQUMxQixrQkFBYyxLQUFLLEtBQUssT0FBTyxHQUFHLEdBQUc7QUFFckMsVUFBTSxRQUFRLFlBQVksSUFBSSxJQUFJLHdCQUF3QixJQUFJLGVBQWUsQ0FBQyxDQUFDO0FBQy9FLFVBQU0sS0FBSyxJQUFJLEtBQUssR0FBRztBQUN2QixVQUFNLENBQUMsSUFBSSxFQUFFLElBQUksTUFBTSxRQUFRLElBQUk7QUFBQSxNQUNsQyxNQUFNLFNBQVMsSUFBSSxrQkFBa0IsSUFBSTtBQUFBLE1BQ3pDLE1BQU0sU0FBUyxJQUFJLGtCQUFrQixJQUFJO0FBQUEsSUFDMUMsQ0FBQztBQUNELFdBQU8sWUFBWSxJQUFJLElBQUksK0RBQStEO0FBQUEsRUFDM0YsQ0FBQztBQUVELE9BQUssa0RBQWtELFlBQVk7QUFDbEUsVUFBTSxNQUFNLGNBQWM7QUFDMUIsa0JBQWMsS0FBSyxLQUFLLE9BQU8sR0FBRyxHQUFHO0FBRXJDLFVBQU0sUUFBUSxZQUFZLElBQUksSUFBSSx3QkFBd0IsSUFBSSxlQUFlLENBQUMsQ0FBQztBQUMvRSxVQUFNLE1BQU0sSUFBSSx3QkFBd0I7QUFDeEMsVUFBTSxVQUFVLE1BQU0sU0FBUyxJQUFJLEtBQUssR0FBRyxHQUFHLElBQUksS0FBSztBQUN2RCxRQUFJLE9BQU87QUFDWCxVQUFNLE9BQU8sUUFBUSxTQUFTLENBQUMsUUFBaUIsZUFBZSxpQkFBaUI7QUFDaEYsUUFBSSxRQUFRO0FBQUEsRUFDYixDQUFDO0FBRUQsT0FBSyw4RUFBOEUsWUFBWTtBQUM5RixVQUFNLE1BQU0sY0FBYztBQUMxQixrQkFBYyxLQUFLLEtBQUssT0FBTyxHQUFHLEdBQUc7QUFFckMsVUFBTSxRQUFRLFlBQVksSUFBSSxJQUFJLHdCQUF3QixJQUFJLGVBQWUsQ0FBQyxDQUFDO0FBQy9FLFVBQU0sS0FBSyxJQUFJLEtBQUssR0FBRztBQUV2QixVQUFNLE1BQU0sSUFBSSx3QkFBd0I7QUFDeEMsVUFBTSxZQUFZLE1BQU0sU0FBUyxJQUFJLElBQUksS0FBSztBQUM5QyxVQUFNLFdBQVcsTUFBTSxTQUFTLElBQUksa0JBQWtCLElBQUk7QUFDMUQsUUFBSSxPQUFPO0FBQ1gsUUFBSSxRQUFRO0FBRVosVUFBTSxPQUFPLFFBQVEsV0FBVyxDQUFDLFFBQWlCLGVBQWUsaUJBQWlCO0FBQ2xGLFVBQU0sU0FBUyxNQUFNO0FBQ3JCLFdBQU8sR0FBRyxPQUFPLEtBQUssU0FBTyxJQUFJLEtBQUssU0FBUyxRQUFRLENBQUMsR0FBRyx3RUFBd0UsT0FBTyxJQUFJLE9BQUssRUFBRSxJQUFJLEVBQUUsS0FBSyxHQUFHLENBQUMsRUFBRTtBQUFBLEVBQ3ZLLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
