import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { LocalGitService } from "../../node/localGitService.js";
function createExecFile(expectations) {
  return ((command, args, _options, callback) => {
    assert.strictEqual(command, "git");
    const expectation = expectations.shift();
    assert.ok(expectation, `Unexpected git call: ${args.join(" ")}`);
    assert.deepStrictEqual(args, expectation.args);
    queueMicrotask(() => callback(expectation.error ?? null, expectation.stdout ?? "", expectation.stderr ?? ""));
    return {};
  });
}
function createDivergedPullError() {
  const error = new Error("fatal: Not possible to fast-forward, aborting.");
  error.code = 128;
  error.stderr = "fatal: Not possible to fast-forward, aborting.";
  return error;
}
function createPullError(message, stderr, code = 128) {
  const error = new Error(message);
  error.code = code;
  error.stderr = stderr;
  return error;
}
suite("LocalGitService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  void store;
  test("pull runs ff-only for normal updates", async () => {
    const expectations = [
      { args: ["rev-parse", "HEAD"], stdout: "aaaa\n" },
      { args: ["pull", "--ff-only"] },
      { args: ["rev-parse", "HEAD"], stdout: "bbbb\n" }
    ];
    const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
    const changed = await service.pull("test-op", "C:\\repo");
    assert.strictEqual(changed, true);
    assert.strictEqual(expectations.length, 0);
  });
  test("pull recovers from diverged history by resetting to upstream", async () => {
    const expectations = [
      { args: ["rev-parse", "HEAD"], stdout: "aaaa\n" },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() },
      { args: ["fetch", "--prune"] },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() },
      { args: ["status", "--porcelain"], stdout: "" },
      { args: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], stdout: "origin/main\n" },
      { args: ["rev-list", "--count", "HEAD..@{u}"], stdout: "2\n" },
      { args: ["rev-list", "--count", "@{u}..HEAD"], stdout: "1\n" },
      { args: ["reset", "--hard", "origin/main"] },
      { args: ["rev-parse", "HEAD"], stdout: "bbbb\n" }
    ];
    const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
    const changed = await service.pull("test-op", "C:\\repo", { allowHardResetOnDivergence: true });
    assert.strictEqual(changed, true);
    assert.strictEqual(expectations.length, 0);
  });
  test("pull rejects hard reset recovery when working tree is dirty", async () => {
    const expectations = [
      { args: ["rev-parse", "HEAD"], stdout: "aaaa\n" },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() },
      { args: ["fetch", "--prune"] },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() },
      { args: ["status", "--porcelain"], stdout: " M package.json\n" }
    ];
    const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
    await assert.rejects(
      () => service.pull("test-op", "C:\\repo", { allowHardResetOnDivergence: true }),
      /Not possible to fast-forward/
    );
    assert.strictEqual(expectations.length, 0);
  });
  test("pull rethrows non-fast-forward errors without retrying", async () => {
    const pullError = createPullError("fatal: Failed to pull", "fatal: Authentication failed");
    const expectations = [
      { args: ["rev-parse", "HEAD"], stdout: "aaaa\n" },
      { args: ["pull", "--ff-only"], error: pullError, stderr: "fatal: Authentication failed" }
    ];
    const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
    await assert.rejects(
      () => service.pull("test-op", "C:\\repo", { allowHardResetOnDivergence: true }),
      /Failed to pull/
    );
    assert.strictEqual(expectations.length, 0);
  });
  test("pull rethrows retry failures that are not fast-forward related", async () => {
    const retryError = createPullError("fatal: Failed to pull", "fatal: Authentication failed");
    const expectations = [
      { args: ["rev-parse", "HEAD"], stdout: "aaaa\n" },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() },
      { args: ["fetch", "--prune"] },
      { args: ["pull", "--ff-only"], error: retryError, stderr: "fatal: Authentication failed" }
    ];
    const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
    await assert.rejects(
      () => service.pull("test-op", "C:\\repo", { allowHardResetOnDivergence: true }),
      /Failed to pull/
    );
    assert.strictEqual(expectations.length, 0);
  });
  test("pull succeeds on second ff-only attempt after fetch", async () => {
    const expectations = [
      { args: ["rev-parse", "HEAD"], stdout: "aaaa\n" },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() },
      { args: ["fetch", "--prune"] },
      { args: ["pull", "--ff-only"] },
      { args: ["rev-parse", "HEAD"], stdout: "bbbb\n" }
    ];
    const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
    const changed = await service.pull("test-op", "C:\\repo");
    assert.strictEqual(changed, true);
    assert.strictEqual(expectations.length, 0);
  });
  test("pull without hard-reset option does not attempt destructive recovery", async () => {
    const expectations = [
      { args: ["rev-parse", "HEAD"], stdout: "aaaa\n" },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() },
      { args: ["fetch", "--prune"] },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() }
    ];
    const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
    await assert.rejects(
      () => service.pull("test-op", "C:\\repo"),
      /Not possible to fast-forward/
    );
    assert.strictEqual(expectations.length, 0);
  });
  test("pull rethrows when upstream cannot be resolved during recovery", async () => {
    const expectations = [
      { args: ["rev-parse", "HEAD"], stdout: "aaaa\n" },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() },
      { args: ["fetch", "--prune"] },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() },
      { args: ["status", "--porcelain"], stdout: "" },
      { args: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], error: new Error("no upstream configured") }
    ];
    const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
    await assert.rejects(
      () => service.pull("test-op", "C:\\repo", { allowHardResetOnDivergence: true }),
      /Not possible to fast-forward/
    );
    assert.strictEqual(expectations.length, 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2dpdC90ZXN0L25vZGUvbG9jYWxHaXRTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBjcCBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBMb2NhbEdpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2xvY2FsR2l0U2VydmljZS5qcyc7XG5cbmludGVyZmFjZSBJRXhlY0ZpbGVFeHBlY3RhdGlvbiB7XG5cdGFyZ3M6IHN0cmluZ1tdO1xuXHRzdGRvdXQ/OiBzdHJpbmc7XG5cdHN0ZGVycj86IHN0cmluZztcblx0ZXJyb3I/OiBjcC5FeGVjRmlsZUV4Y2VwdGlvbjtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRXhlY0ZpbGUoZXhwZWN0YXRpb25zOiBJRXhlY0ZpbGVFeHBlY3RhdGlvbltdKTogdHlwZW9mIGNwLmV4ZWNGaWxlIHtcblx0cmV0dXJuICgoY29tbWFuZDogc3RyaW5nLCBhcmdzOiByZWFkb25seSBzdHJpbmdbXSwgX29wdGlvbnM6IGNwLkV4ZWNGaWxlT3B0aW9ucywgY2FsbGJhY2s6IChlcnJvcjogY3AuRXhlY0ZpbGVFeGNlcHRpb24gfCBudWxsLCBzdGRvdXQ6IHN0cmluZywgc3RkZXJyOiBzdHJpbmcpID0+IHZvaWQpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tbWFuZCwgJ2dpdCcpO1xuXG5cdFx0Y29uc3QgZXhwZWN0YXRpb24gPSBleHBlY3RhdGlvbnMuc2hpZnQoKTtcblx0XHRhc3NlcnQub2soZXhwZWN0YXRpb24sIGBVbmV4cGVjdGVkIGdpdCBjYWxsOiAkeyhhcmdzIGFzIHN0cmluZ1tdKS5qb2luKCcgJyl9YCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcmdzLCBleHBlY3RhdGlvbi5hcmdzKTtcblxuXHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IGNhbGxiYWNrKGV4cGVjdGF0aW9uLmVycm9yID8/IG51bGwsIGV4cGVjdGF0aW9uLnN0ZG91dCA/PyAnJywgZXhwZWN0YXRpb24uc3RkZXJyID8/ICcnKSk7XG5cblx0XHRyZXR1cm4ge30gYXMgY3AuQ2hpbGRQcm9jZXNzO1xuXHR9KSBhcyB0eXBlb2YgY3AuZXhlY0ZpbGU7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZURpdmVyZ2VkUHVsbEVycm9yKCk6IGNwLkV4ZWNGaWxlRXhjZXB0aW9uIHtcblx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoJ2ZhdGFsOiBOb3QgcG9zc2libGUgdG8gZmFzdC1mb3J3YXJkLCBhYm9ydGluZy4nKSBhcyBjcC5FeGVjRmlsZUV4Y2VwdGlvbiAmIHsgc3RkZXJyOiBzdHJpbmcgfTtcblx0ZXJyb3IuY29kZSA9IDEyODtcblx0ZXJyb3Iuc3RkZXJyID0gJ2ZhdGFsOiBOb3QgcG9zc2libGUgdG8gZmFzdC1mb3J3YXJkLCBhYm9ydGluZy4nO1xuXHRyZXR1cm4gZXJyb3I7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVB1bGxFcnJvcihtZXNzYWdlOiBzdHJpbmcsIHN0ZGVycjogc3RyaW5nLCBjb2RlID0gMTI4KTogY3AuRXhlY0ZpbGVFeGNlcHRpb24ge1xuXHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcihtZXNzYWdlKSBhcyBjcC5FeGVjRmlsZUV4Y2VwdGlvbiAmIHsgc3RkZXJyOiBzdHJpbmcgfTtcblx0ZXJyb3IuY29kZSA9IGNvZGU7XG5cdGVycm9yLnN0ZGVyciA9IHN0ZGVycjtcblx0cmV0dXJuIGVycm9yO1xufVxuXG5zdWl0ZSgnTG9jYWxHaXRTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHR2b2lkIHN0b3JlO1xuXG5cdHRlc3QoJ3B1bGwgcnVucyBmZi1vbmx5IGZvciBub3JtYWwgdXBkYXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleHBlY3RhdGlvbnM6IElFeGVjRmlsZUV4cGVjdGF0aW9uW10gPSBbXG5cdFx0XHR7IGFyZ3M6IFsncmV2LXBhcnNlJywgJ0hFQUQnXSwgc3Rkb3V0OiAnYWFhYVxcbicgfSxcblx0XHRcdHsgYXJnczogWydwdWxsJywgJy0tZmYtb25seSddIH0sXG5cdFx0XHR7IGFyZ3M6IFsncmV2LXBhcnNlJywgJ0hFQUQnXSwgc3Rkb3V0OiAnYmJiYlxcbicgfSxcblx0XHRdO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgTG9jYWxHaXRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBjcmVhdGVFeGVjRmlsZShleHBlY3RhdGlvbnMpKTtcblxuXHRcdGNvbnN0IGNoYW5nZWQgPSBhd2FpdCBzZXJ2aWNlLnB1bGwoJ3Rlc3Qtb3AnLCAnQzpcXFxccmVwbycpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHBlY3RhdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgncHVsbCByZWNvdmVycyBmcm9tIGRpdmVyZ2VkIGhpc3RvcnkgYnkgcmVzZXR0aW5nIHRvIHVwc3RyZWFtJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV4cGVjdGF0aW9uczogSUV4ZWNGaWxlRXhwZWN0YXRpb25bXSA9IFtcblx0XHRcdHsgYXJnczogWydyZXYtcGFyc2UnLCAnSEVBRCddLCBzdGRvdXQ6ICdhYWFhXFxuJyB9LFxuXHRcdFx0eyBhcmdzOiBbJ3B1bGwnLCAnLS1mZi1vbmx5J10sIGVycm9yOiBjcmVhdGVEaXZlcmdlZFB1bGxFcnJvcigpIH0sXG5cdFx0XHR7IGFyZ3M6IFsnZmV0Y2gnLCAnLS1wcnVuZSddIH0sXG5cdFx0XHR7IGFyZ3M6IFsncHVsbCcsICctLWZmLW9ubHknXSwgZXJyb3I6IGNyZWF0ZURpdmVyZ2VkUHVsbEVycm9yKCkgfSxcblx0XHRcdHsgYXJnczogWydzdGF0dXMnLCAnLS1wb3JjZWxhaW4nXSwgc3Rkb3V0OiAnJyB9LFxuXHRcdFx0eyBhcmdzOiBbJ3Jldi1wYXJzZScsICctLWFiYnJldi1yZWYnLCAnLS1zeW1ib2xpYy1mdWxsLW5hbWUnLCAnQHt1fSddLCBzdGRvdXQ6ICdvcmlnaW4vbWFpblxcbicgfSxcblx0XHRcdHsgYXJnczogWydyZXYtbGlzdCcsICctLWNvdW50JywgJ0hFQUQuLkB7dX0nXSwgc3Rkb3V0OiAnMlxcbicgfSxcblx0XHRcdHsgYXJnczogWydyZXYtbGlzdCcsICctLWNvdW50JywgJ0B7dX0uLkhFQUQnXSwgc3Rkb3V0OiAnMVxcbicgfSxcblx0XHRcdHsgYXJnczogWydyZXNldCcsICctLWhhcmQnLCAnb3JpZ2luL21haW4nXSB9LFxuXHRcdFx0eyBhcmdzOiBbJ3Jldi1wYXJzZScsICdIRUFEJ10sIHN0ZG91dDogJ2JiYmJcXG4nIH0sXG5cdFx0XTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IExvY2FsR2l0U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgY3JlYXRlRXhlY0ZpbGUoZXhwZWN0YXRpb25zKSk7XG5cblx0XHRjb25zdCBjaGFuZ2VkID0gYXdhaXQgc2VydmljZS5wdWxsKCd0ZXN0LW9wJywgJ0M6XFxcXHJlcG8nLCB7IGFsbG93SGFyZFJlc2V0T25EaXZlcmdlbmNlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHBlY3RhdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgncHVsbCByZWplY3RzIGhhcmQgcmVzZXQgcmVjb3Zlcnkgd2hlbiB3b3JraW5nIHRyZWUgaXMgZGlydHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXhwZWN0YXRpb25zOiBJRXhlY0ZpbGVFeHBlY3RhdGlvbltdID0gW1xuXHRcdFx0eyBhcmdzOiBbJ3Jldi1wYXJzZScsICdIRUFEJ10sIHN0ZG91dDogJ2FhYWFcXG4nIH0sXG5cdFx0XHR7IGFyZ3M6IFsncHVsbCcsICctLWZmLW9ubHknXSwgZXJyb3I6IGNyZWF0ZURpdmVyZ2VkUHVsbEVycm9yKCkgfSxcblx0XHRcdHsgYXJnczogWydmZXRjaCcsICctLXBydW5lJ10gfSxcblx0XHRcdHsgYXJnczogWydwdWxsJywgJy0tZmYtb25seSddLCBlcnJvcjogY3JlYXRlRGl2ZXJnZWRQdWxsRXJyb3IoKSB9LFxuXHRcdFx0eyBhcmdzOiBbJ3N0YXR1cycsICctLXBvcmNlbGFpbiddLCBzdGRvdXQ6ICcgTSBwYWNrYWdlLmpzb25cXG4nIH0sXG5cdFx0XTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IExvY2FsR2l0U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgY3JlYXRlRXhlY0ZpbGUoZXhwZWN0YXRpb25zKSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHNlcnZpY2UucHVsbCgndGVzdC1vcCcsICdDOlxcXFxyZXBvJywgeyBhbGxvd0hhcmRSZXNldE9uRGl2ZXJnZW5jZTogdHJ1ZSB9KSxcblx0XHRcdC9Ob3QgcG9zc2libGUgdG8gZmFzdC1mb3J3YXJkL1xuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cGVjdGF0aW9ucy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdwdWxsIHJldGhyb3dzIG5vbi1mYXN0LWZvcndhcmQgZXJyb3JzIHdpdGhvdXQgcmV0cnlpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHVsbEVycm9yID0gY3JlYXRlUHVsbEVycm9yKCdmYXRhbDogRmFpbGVkIHRvIHB1bGwnLCAnZmF0YWw6IEF1dGhlbnRpY2F0aW9uIGZhaWxlZCcpO1xuXHRcdGNvbnN0IGV4cGVjdGF0aW9uczogSUV4ZWNGaWxlRXhwZWN0YXRpb25bXSA9IFtcblx0XHRcdHsgYXJnczogWydyZXYtcGFyc2UnLCAnSEVBRCddLCBzdGRvdXQ6ICdhYWFhXFxuJyB9LFxuXHRcdFx0eyBhcmdzOiBbJ3B1bGwnLCAnLS1mZi1vbmx5J10sIGVycm9yOiBwdWxsRXJyb3IsIHN0ZGVycjogJ2ZhdGFsOiBBdXRoZW50aWNhdGlvbiBmYWlsZWQnIH0sXG5cdFx0XTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IExvY2FsR2l0U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgY3JlYXRlRXhlY0ZpbGUoZXhwZWN0YXRpb25zKSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHNlcnZpY2UucHVsbCgndGVzdC1vcCcsICdDOlxcXFxyZXBvJywgeyBhbGxvd0hhcmRSZXNldE9uRGl2ZXJnZW5jZTogdHJ1ZSB9KSxcblx0XHRcdC9GYWlsZWQgdG8gcHVsbC9cblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHBlY3RhdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgncHVsbCByZXRocm93cyByZXRyeSBmYWlsdXJlcyB0aGF0IGFyZSBub3QgZmFzdC1mb3J3YXJkIHJlbGF0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmV0cnlFcnJvciA9IGNyZWF0ZVB1bGxFcnJvcignZmF0YWw6IEZhaWxlZCB0byBwdWxsJywgJ2ZhdGFsOiBBdXRoZW50aWNhdGlvbiBmYWlsZWQnKTtcblx0XHRjb25zdCBleHBlY3RhdGlvbnM6IElFeGVjRmlsZUV4cGVjdGF0aW9uW10gPSBbXG5cdFx0XHR7IGFyZ3M6IFsncmV2LXBhcnNlJywgJ0hFQUQnXSwgc3Rkb3V0OiAnYWFhYVxcbicgfSxcblx0XHRcdHsgYXJnczogWydwdWxsJywgJy0tZmYtb25seSddLCBlcnJvcjogY3JlYXRlRGl2ZXJnZWRQdWxsRXJyb3IoKSB9LFxuXHRcdFx0eyBhcmdzOiBbJ2ZldGNoJywgJy0tcHJ1bmUnXSB9LFxuXHRcdFx0eyBhcmdzOiBbJ3B1bGwnLCAnLS1mZi1vbmx5J10sIGVycm9yOiByZXRyeUVycm9yLCBzdGRlcnI6ICdmYXRhbDogQXV0aGVudGljYXRpb24gZmFpbGVkJyB9LFxuXHRcdF07XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBMb2NhbEdpdFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGNyZWF0ZUV4ZWNGaWxlKGV4cGVjdGF0aW9ucykpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBzZXJ2aWNlLnB1bGwoJ3Rlc3Qtb3AnLCAnQzpcXFxccmVwbycsIHsgYWxsb3dIYXJkUmVzZXRPbkRpdmVyZ2VuY2U6IHRydWUgfSksXG5cdFx0XHQvRmFpbGVkIHRvIHB1bGwvXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhwZWN0YXRpb25zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3B1bGwgc3VjY2VlZHMgb24gc2Vjb25kIGZmLW9ubHkgYXR0ZW1wdCBhZnRlciBmZXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleHBlY3RhdGlvbnM6IElFeGVjRmlsZUV4cGVjdGF0aW9uW10gPSBbXG5cdFx0XHR7IGFyZ3M6IFsncmV2LXBhcnNlJywgJ0hFQUQnXSwgc3Rkb3V0OiAnYWFhYVxcbicgfSxcblx0XHRcdHsgYXJnczogWydwdWxsJywgJy0tZmYtb25seSddLCBlcnJvcjogY3JlYXRlRGl2ZXJnZWRQdWxsRXJyb3IoKSB9LFxuXHRcdFx0eyBhcmdzOiBbJ2ZldGNoJywgJy0tcHJ1bmUnXSB9LFxuXHRcdFx0eyBhcmdzOiBbJ3B1bGwnLCAnLS1mZi1vbmx5J10gfSxcblx0XHRcdHsgYXJnczogWydyZXYtcGFyc2UnLCAnSEVBRCddLCBzdGRvdXQ6ICdiYmJiXFxuJyB9LFxuXHRcdF07XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBMb2NhbEdpdFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGNyZWF0ZUV4ZWNGaWxlKGV4cGVjdGF0aW9ucykpO1xuXG5cdFx0Y29uc3QgY2hhbmdlZCA9IGF3YWl0IHNlcnZpY2UucHVsbCgndGVzdC1vcCcsICdDOlxcXFxyZXBvJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cGVjdGF0aW9ucy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdwdWxsIHdpdGhvdXQgaGFyZC1yZXNldCBvcHRpb24gZG9lcyBub3QgYXR0ZW1wdCBkZXN0cnVjdGl2ZSByZWNvdmVyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleHBlY3RhdGlvbnM6IElFeGVjRmlsZUV4cGVjdGF0aW9uW10gPSBbXG5cdFx0XHR7IGFyZ3M6IFsncmV2LXBhcnNlJywgJ0hFQUQnXSwgc3Rkb3V0OiAnYWFhYVxcbicgfSxcblx0XHRcdHsgYXJnczogWydwdWxsJywgJy0tZmYtb25seSddLCBlcnJvcjogY3JlYXRlRGl2ZXJnZWRQdWxsRXJyb3IoKSB9LFxuXHRcdFx0eyBhcmdzOiBbJ2ZldGNoJywgJy0tcHJ1bmUnXSB9LFxuXHRcdFx0eyBhcmdzOiBbJ3B1bGwnLCAnLS1mZi1vbmx5J10sIGVycm9yOiBjcmVhdGVEaXZlcmdlZFB1bGxFcnJvcigpIH0sXG5cdFx0XTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IExvY2FsR2l0U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgY3JlYXRlRXhlY0ZpbGUoZXhwZWN0YXRpb25zKSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHNlcnZpY2UucHVsbCgndGVzdC1vcCcsICdDOlxcXFxyZXBvJyksXG5cdFx0XHQvTm90IHBvc3NpYmxlIHRvIGZhc3QtZm9yd2FyZC9cblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHBlY3RhdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgncHVsbCByZXRocm93cyB3aGVuIHVwc3RyZWFtIGNhbm5vdCBiZSByZXNvbHZlZCBkdXJpbmcgcmVjb3ZlcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXhwZWN0YXRpb25zOiBJRXhlY0ZpbGVFeHBlY3RhdGlvbltdID0gW1xuXHRcdFx0eyBhcmdzOiBbJ3Jldi1wYXJzZScsICdIRUFEJ10sIHN0ZG91dDogJ2FhYWFcXG4nIH0sXG5cdFx0XHR7IGFyZ3M6IFsncHVsbCcsICctLWZmLW9ubHknXSwgZXJyb3I6IGNyZWF0ZURpdmVyZ2VkUHVsbEVycm9yKCkgfSxcblx0XHRcdHsgYXJnczogWydmZXRjaCcsICctLXBydW5lJ10gfSxcblx0XHRcdHsgYXJnczogWydwdWxsJywgJy0tZmYtb25seSddLCBlcnJvcjogY3JlYXRlRGl2ZXJnZWRQdWxsRXJyb3IoKSB9LFxuXHRcdFx0eyBhcmdzOiBbJ3N0YXR1cycsICctLXBvcmNlbGFpbiddLCBzdGRvdXQ6ICcnIH0sXG5cdFx0XHR7IGFyZ3M6IFsncmV2LXBhcnNlJywgJy0tYWJicmV2LXJlZicsICctLXN5bWJvbGljLWZ1bGwtbmFtZScsICdAe3V9J10sIGVycm9yOiBuZXcgRXJyb3IoJ25vIHVwc3RyZWFtIGNvbmZpZ3VyZWQnKSBhcyBjcC5FeGVjRmlsZUV4Y2VwdGlvbiB9LFxuXHRcdF07XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBMb2NhbEdpdFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGNyZWF0ZUV4ZWNGaWxlKGV4cGVjdGF0aW9ucykpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBzZXJ2aWNlLnB1bGwoJ3Rlc3Qtb3AnLCAnQzpcXFxccmVwbycsIHsgYWxsb3dIYXJkUmVzZXRPbkRpdmVyZ2VuY2U6IHRydWUgfSksXG5cdFx0XHQvTm90IHBvc3NpYmxlIHRvIGZhc3QtZm9yd2FyZC9cblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHBlY3RhdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQVNoQyxTQUFTLGVBQWUsY0FBMEQ7QUFDakYsVUFBUSxDQUFDLFNBQWlCLE1BQXlCLFVBQThCLGFBQTJGO0FBQzNLLFdBQU8sWUFBWSxTQUFTLEtBQUs7QUFFakMsVUFBTSxjQUFjLGFBQWEsTUFBTTtBQUN2QyxXQUFPLEdBQUcsYUFBYSx3QkFBeUIsS0FBa0IsS0FBSyxHQUFHLENBQUMsRUFBRTtBQUM3RSxXQUFPLGdCQUFnQixNQUFNLFlBQVksSUFBSTtBQUU3QyxtQkFBZSxNQUFNLFNBQVMsWUFBWSxTQUFTLE1BQU0sWUFBWSxVQUFVLElBQUksWUFBWSxVQUFVLEVBQUUsQ0FBQztBQUU1RyxXQUFPLENBQUM7QUFBQSxFQUNUO0FBQ0Q7QUFFQSxTQUFTLDBCQUFnRDtBQUN4RCxRQUFNLFFBQVEsSUFBSSxNQUFNLGdEQUFnRDtBQUN4RSxRQUFNLE9BQU87QUFDYixRQUFNLFNB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
