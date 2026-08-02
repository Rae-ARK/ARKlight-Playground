import { deepStrictEqual, ok, strictEqual } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { classifyCommand, compact } from "../../browser/tools/consoleCompactor/consoleCompactor.js";
suite("Console Compactor", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("classifyCommand", () => {
    test("tags npm commands", () => {
      deepStrictEqual(classifyCommand("npm install").commandKinds, ["npm"]);
    });
    test("tags cargo commands", () => {
      deepStrictEqual(classifyCommand("cargo build").commandKinds, ["cargo"]);
    });
    test("detects go test", () => {
      const classification = classifyCommand("go test ./...");
      deepStrictEqual(classification.commandKinds, ["go"]);
      strictEqual(classification.runsGoTest, true);
    });
    test("detects source read commands", () => {
      strictEqual(classifyCommand("cat src/main.ts").isSourceReadCommand, true);
    });
    test("leaves unknown commands untagged", () => {
      deepStrictEqual(classifyCommand("echo hello"), {
        commandKinds: [],
        isSourceReadCommand: false,
        runsGoTest: false,
        mentionsSavedToolOutput: false
      });
    });
  });
  suite("compact", () => {
    test("does not change small, unremarkable output", () => {
      const output = "hello world\n";
      const report = compact("echo hello", output);
      strictEqual(report.applied, false);
      strictEqual(report.compactedOutput, output);
      deepStrictEqual(report.saved, { chars: 0, bytes: 0, lines: 0 });
    });
    test("compacts noisy npm output", () => {
      const output = Array.from(
        { length: 400 },
        (_, i) => `npm http fetch GET 200 https://registry.npmjs.org/pkg${i} ${i}ms (cache miss)`
      ).join("\n") + "\nadded 400 packages in 3s\n";
      const report = compact("npm install", output);
      strictEqual(report.applied, true);
      deepStrictEqual(report.commandKinds, ["npm"]);
      ok(report.compacted.chars < report.original.chars);
      ok(report.reduction.charsPct > 0);
    });
    test("compacts noisy cargo output", () => {
      const output = Array.from(
        { length: 300 },
        (_, i) => `   Compiling crate${i} v0.1.${i}`
      ).join("\n") + "\n    Finished dev [unoptimized + debuginfo] target(s) in 12.34s\n";
      const report = compact("cargo build", output);
      strictEqual(report.applied, true);
      deepStrictEqual(report.commandKinds, ["cargo"]);
      ok(report.compacted.chars < report.original.chars);
      ok(report.reduction.charsPct > 0);
    });
    test("compacts noisy pip output", () => {
      const output = Array.from(
        { length: 200 },
        (_, i) => `Collecting package${i}
  Downloading package${i}-1.0.0-py3-none-any.whl (${i} kB)`
      ).join("\n") + "\nSuccessfully installed pkgs\n";
      const report = compact("pip install -r requirements.txt", output);
      strictEqual(report.applied, true);
      deepStrictEqual(report.commandKinds, ["pip"]);
      ok(report.compacted.chars < report.original.chars);
      ok(report.reduction.charsPct > 0);
    });
    test("saved counts equal the difference between original and compacted", () => {
      const output = Array.from(
        { length: 400 },
        (_, i) => `npm http fetch GET 200 https://registry.npmjs.org/pkg${i} ${i}ms (cache miss)`
      ).join("\n") + "\nadded 400 packages in 3s\n";
      const report = compact("npm install", output);
      strictEqual(report.saved.chars, report.original.chars - report.compacted.chars);
      strictEqual(report.saved.bytes, report.original.bytes - report.compacted.bytes);
      strictEqual(report.saved.lines, report.original.lines - report.compacted.lines);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvY29uc29sZUNvbXBhY3Rvci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsLCBvaywgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBjbGFzc2lmeUNvbW1hbmQsIGNvbXBhY3QgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL2NvbnNvbGVDb21wYWN0b3IvY29uc29sZUNvbXBhY3Rvci5qcyc7XG5cbnN1aXRlKCdDb25zb2xlIENvbXBhY3RvcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2NsYXNzaWZ5Q29tbWFuZCcsICgpID0+IHtcblx0XHR0ZXN0KCd0YWdzIG5wbSBjb21tYW5kcycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChjbGFzc2lmeUNvbW1hbmQoJ25wbSBpbnN0YWxsJykuY29tbWFuZEtpbmRzLCBbJ25wbSddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RhZ3MgY2FyZ28gY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoY2xhc3NpZnlDb21tYW5kKCdjYXJnbyBidWlsZCcpLmNvbW1hbmRLaW5kcywgWydjYXJnbyddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RldGVjdHMgZ28gdGVzdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNsYXNzaWZpY2F0aW9uID0gY2xhc3NpZnlDb21tYW5kKCdnbyB0ZXN0IC4vLi4uJyk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoY2xhc3NpZmljYXRpb24uY29tbWFuZEtpbmRzLCBbJ2dvJ10pO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2xhc3NpZmljYXRpb24ucnVuc0dvVGVzdCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZXRlY3RzIHNvdXJjZSByZWFkIGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoY2xhc3NpZnlDb21tYW5kKCdjYXQgc3JjL21haW4udHMnKS5pc1NvdXJjZVJlYWRDb21tYW5kLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xlYXZlcyB1bmtub3duIGNvbW1hbmRzIHVudGFnZ2VkJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGNsYXNzaWZ5Q29tbWFuZCgnZWNobyBoZWxsbycpLCB7XG5cdFx0XHRcdGNvbW1hbmRLaW5kczogW10sXG5cdFx0XHRcdGlzU291cmNlUmVhZENvbW1hbmQ6IGZhbHNlLFxuXHRcdFx0XHRydW5zR29UZXN0OiBmYWxzZSxcblx0XHRcdFx0bWVudGlvbnNTYXZlZFRvb2xPdXRwdXQ6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjb21wYWN0JywgKCkgPT4ge1xuXHRcdHRlc3QoJ2RvZXMgbm90IGNoYW5nZSBzbWFsbCwgdW5yZW1hcmthYmxlIG91dHB1dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG91dHB1dCA9ICdoZWxsbyB3b3JsZFxcbic7XG5cdFx0XHRjb25zdCByZXBvcnQgPSBjb21wYWN0KCdlY2hvIGhlbGxvJywgb3V0cHV0KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlcG9ydC5hcHBsaWVkLCBmYWxzZSk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXBvcnQuY29tcGFjdGVkT3V0cHV0LCBvdXRwdXQpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJlcG9ydC5zYXZlZCwgeyBjaGFyczogMCwgYnl0ZXM6IDAsIGxpbmVzOiAwIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGFjdHMgbm9pc3kgbnBtIG91dHB1dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG91dHB1dCA9IEFycmF5LmZyb20oXG5cdFx0XHRcdHsgbGVuZ3RoOiA0MDAgfSxcblx0XHRcdFx0KF8sIGkpID0+IGBucG0gaHR0cCBmZXRjaCBHRVQgMjAwIGh0dHBzOi8vcmVnaXN0cnkubnBtanMub3JnL3BrZyR7aX0gJHtpfW1zIChjYWNoZSBtaXNzKWBcblx0XHRcdCkuam9pbignXFxuJykgKyAnXFxuYWRkZWQgNDAwIHBhY2thZ2VzIGluIDNzXFxuJztcblxuXHRcdFx0Y29uc3QgcmVwb3J0ID0gY29tcGFjdCgnbnBtIGluc3RhbGwnLCBvdXRwdXQpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVwb3J0LmFwcGxpZWQsIHRydWUpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJlcG9ydC5jb21tYW5kS2luZHMsIFsnbnBtJ10pO1xuXHRcdFx0b2socmVwb3J0LmNvbXBhY3RlZC5jaGFycyA8IHJlcG9ydC5vcmlnaW5hbC5jaGFycyk7XG5cdFx0XHRvayhyZXBvcnQucmVkdWN0aW9uLmNoYXJzUGN0ID4gMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wYWN0cyBub2lzeSBjYXJnbyBvdXRwdXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBBcnJheS5mcm9tKFxuXHRcdFx0XHR7IGxlbmd0aDogMzAwIH0sXG5cdFx0XHRcdChfLCBpKSA9PiBgICAgQ29tcGlsaW5nIGNyYXRlJHtpfSB2MC4xLiR7aX1gXG5cdFx0XHQpLmpvaW4oJ1xcbicpICsgJ1xcbiAgICBGaW5pc2hlZCBkZXYgW3Vub3B0aW1pemVkICsgZGVidWdpbmZvXSB0YXJnZXQocykgaW4gMTIuMzRzXFxuJztcblxuXHRcdFx0Y29uc3QgcmVwb3J0ID0gY29tcGFjdCgnY2FyZ28gYnVpbGQnLCBvdXRwdXQpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVwb3J0LmFwcGxpZWQsIHRydWUpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJlcG9ydC5jb21tYW5kS2luZHMsIFsnY2FyZ28nXSk7XG5cdFx0XHRvayhyZXBvcnQuY29tcGFjdGVkLmNoYXJzIDwgcmVwb3J0Lm9yaWdpbmFsLmNoYXJzKTtcblx0XHRcdG9rKHJlcG9ydC5yZWR1Y3Rpb24uY2hhcnNQY3QgPiAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBhY3RzIG5vaXN5IHBpcCBvdXRwdXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBBcnJheS5mcm9tKFxuXHRcdFx0XHR7IGxlbmd0aDogMjAwIH0sXG5cdFx0XHRcdChfLCBpKSA9PiBgQ29sbGVjdGluZyBwYWNrYWdlJHtpfVxcbiAgRG93bmxvYWRpbmcgcGFja2FnZSR7aX0tMS4wLjAtcHkzLW5vbmUtYW55LndobCAoJHtpfSBrQilgXG5cdFx0XHQpLmpvaW4oJ1xcbicpICsgJ1xcblN1Y2Nlc3NmdWxseSBpbnN0YWxsZWQgcGtnc1xcbic7XG5cblx0XHRcdGNvbnN0IHJlcG9ydCA9IGNvbXBhY3QoJ3BpcCBpbnN0YWxsIC1yIHJlcXVpcmVtZW50cy50eHQnLCBvdXRwdXQpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVwb3J0LmFwcGxpZWQsIHRydWUpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJlcG9ydC5jb21tYW5kS2luZHMsIFsncGlwJ10pO1xuXHRcdFx0b2socmVwb3J0LmNvbXBhY3RlZC5jaGFycyA8IHJlcG9ydC5vcmlnaW5hbC5jaGFycyk7XG5cdFx0XHRvayhyZXBvcnQucmVkdWN0aW9uLmNoYXJzUGN0ID4gMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzYXZlZCBjb3VudHMgZXF1YWwgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiBvcmlnaW5hbCBhbmQgY29tcGFjdGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gQXJyYXkuZnJvbShcblx0XHRcdFx0eyBsZW5ndGg6IDQwMCB9LFxuXHRcdFx0XHQoXywgaSkgPT4gYG5wbSBodHRwIGZldGNoIEdFVCAyMDAgaHR0cHM6Ly9yZWdpc3RyeS5ucG1qcy5vcmcvcGtnJHtpfSAke2l9bXMgKGNhY2hlIG1pc3MpYFxuXHRcdFx0KS5qb2luKCdcXG4nKSArICdcXG5hZGRlZCA0MDAgcGFja2FnZXMgaW4gM3NcXG4nO1xuXG5cdFx0XHRjb25zdCByZXBvcnQgPSBjb21wYWN0KCducG0gaW5zdGFsbCcsIG91dHB1dCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXBvcnQuc2F2ZWQuY2hhcnMsIHJlcG9ydC5vcmlnaW5hbC5jaGFycyAtIHJlcG9ydC5jb21wYWN0ZWQuY2hhcnMpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVwb3J0LnNhdmVkLmJ5dGVzLCByZXBvcnQub3JpZ2luYWwuYnl0ZXMgLSByZXBvcnQuY29tcGFjdGVkLmJ5dGVzKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlcG9ydC5zYXZlZC5saW5lcywgcmVwb3J0Lm9yaWdpbmFsLmxpbmVzIC0gcmVwb3J0LmNvbXBhY3RlZC5saW5lcyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwK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
