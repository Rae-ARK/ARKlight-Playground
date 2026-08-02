import { deepStrictEqual, ok, strictEqual } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { gitDiffFilter, gitLogFilter, gitStatusFilter, lsFilter, npmInstallFilter, parseCommandHead, testRunnerFilter, buildToolFilter, linterFilter, envFilter, findFilter, grepFilter, treeFilter } from "../../browser/tools/terminalOutputCompressor.js";
import { isProtectedFromCompression } from "../../../../chat/common/tools/toolResultCompressor.js";
suite("parseCommandHead", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns undefined for empty input", () => {
    strictEqual(parseCommandHead(void 0), void 0);
    strictEqual(parseCommandHead(""), void 0);
    strictEqual(parseCommandHead("   "), void 0);
  });
  test("parses simple commands", () => {
    deepStrictEqual(parseCommandHead("git diff HEAD~5"), { head: "git", sub: "diff" });
    deepStrictEqual(parseCommandHead("ls -la"), { head: "ls", sub: "-la" });
  });
  test("skips env-var prefixes", () => {
    deepStrictEqual(parseCommandHead("CI=1 NODE_ENV=test npm install"), { head: "npm", sub: "install" });
  });
  test("uses only first pipeline segment", () => {
    deepStrictEqual(parseCommandHead("git diff | cat"), { head: "git", sub: "diff" });
  });
  test("skips leading long flags before the subcommand", () => {
    deepStrictEqual(parseCommandHead("git --no-pager diff src/foo.ts"), { head: "git", sub: "diff" });
  });
  test("does not skip short-flag values before the subcommand", () => {
    deepStrictEqual(parseCommandHead("git -C /tmp/repo diff"), { head: "git", sub: "-C" });
  });
});
suite("gitDiffFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const input = { command: "git diff HEAD~1" };
  test("matches git diff", () => {
    ok(gitDiffFilter.matches("run_in_terminal", input));
  });
  test("matches git --no-pager diff", () => {
    ok(gitDiffFilter.matches("run_in_terminal", { command: "git --no-pager diff src/foo.ts" }));
  });
  test("does not match git status", () => {
    ok(!gitDiffFilter.matches("run_in_terminal", { command: "git status" }));
  });
  test("preserves +/- and hunk headers verbatim", () => {
    const text = [
      "diff --git a/foo.ts b/foo.ts",
      "index abc..def 100644",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,3 +1,3 @@",
      " unchanged",
      "-old",
      "+new",
      " unchanged"
    ].join("\n");
    const out = gitDiffFilter.apply(text, input);
    ok(out.text.includes("-old"));
    ok(out.text.includes("+new"));
    ok(out.text.includes("@@ -1,3 +1,3 @@"));
    ok(!out.text.includes("index abc..def"));
  });
  test("collapses long unchanged-context runs into a single marker", () => {
    const ctxLines = Array.from({ length: 20 }, (_, i) => ` this is context line number ${i}`);
    const text = [
      "diff --git a/foo.ts b/foo.ts",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,22 +1,22 @@",
      ...ctxLines,
      "-old",
      "+new"
    ].join("\n");
    const out = gitDiffFilter.apply(text, input);
    ok(out.text.includes(" this is context line number 0"));
    ok(!out.text.includes(" this is context line number 5"));
    ok(!out.text.includes(" this is context line number 19"));
    ok(out.text.includes("19 unchanged context lines omitted"));
    ok(out.text.includes("-old"));
    ok(out.text.includes("+new"));
    strictEqual(out.compressed, true);
  });
  test("omits lockfile diffs", () => {
    const text = [
      "diff --git a/package-lock.json b/package-lock.json",
      "index 1..2 100644",
      "--- a/package-lock.json",
      "+++ b/package-lock.json",
      "@@ -1,3 +1,3 @@",
      "-old",
      "+new"
    ].join("\n");
    const out = gitDiffFilter.apply(text, input);
    ok(out.text.includes("lockfile/snapshot diff omitted"));
    ok(!out.text.includes("-old"));
    strictEqual(out.compressed, true);
  });
  test("does not omit arbitrary .lock file diffs", () => {
    const text = [
      "diff --git a/custom.lock b/custom.lock",
      "--- a/custom.lock",
      "+++ b/custom.lock",
      "@@ -1,2 +1,2 @@",
      " unchanged",
      "-old",
      "+new"
    ].join("\n");
    const out = gitDiffFilter.apply(text, input);
    ok(!out.text.includes("lockfile/snapshot diff omitted"));
    ok(out.text.includes("-old"));
    ok(out.text.includes("+new"));
  });
  test("preserves non-context metadata lines", () => {
    const text = [
      "diff --git a/foo.ts b/foo.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/foo.ts",
      "@@ -0,0 +2,2 @@",
      "+line 1",
      "+line 2"
    ].join("\n");
    const out = gitDiffFilter.apply(text, input);
    ok(out.text.includes("new file mode 100644"));
  });
  test("rewrites hunk header counts to match emitted body", () => {
    const ctxLines = Array.from({ length: 20 }, (_, i) => ` ctx line ${i}`);
    const text = [
      "diff --git a/foo.ts b/foo.ts",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -10,22 +10,22 @@",
      ...ctxLines,
      "-old",
      "+new"
    ].join("\n");
    const out = gitDiffFilter.apply(text, input);
    ok(out.text.includes("@@ -10,2 +10,2 @@"));
    ok(!out.text.includes("@@ -10,22 +10,22 @@"));
  });
});
suite("lsFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches only when -l flag present", () => {
    ok(!lsFilter.matches("run_in_terminal", { command: "ls" }));
    ok(lsFilter.matches("run_in_terminal", { command: "ls -la" }));
    ok(lsFilter.matches("run_in_terminal", { command: "ls -al src/" }));
  });
  test("strips long-form columns and keeps file names", () => {
    const text = [
      "total 24",
      "-rw-r--r--   1 user  staff   123 Jan 01 12:34 README.md",
      "drwxr-xr-x   5 user  staff   160 Jan 01 12:34 src"
    ].join("\n");
    const out = lsFilter.apply(text, { command: "ls -la" });
    ok(out.text.includes("README.md"));
    ok(out.text.includes("src/"));
    ok(!out.text.includes("user  staff"));
    ok(!out.text.includes("total 24"));
    strictEqual(out.compressed, true);
  });
});
suite("npmInstallFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches npm install", () => {
    ok(npmInstallFilter.matches("run_in_terminal", { command: "npm install" }));
    ok(npmInstallFilter.matches("run_in_terminal", { command: "npm ci" }));
    ok(!npmInstallFilter.matches("run_in_terminal", { command: "npm test" }));
  });
  test("drops audit and funding noise", () => {
    const text = [
      "added 250 packages in 12s",
      "npm warn deprecated foo@1.0.0: please update",
      "42 packages are looking for funding",
      "  run `npm fund` for details",
      "",
      "3 vulnerabilities (1 low, 2 moderate)",
      "Run `npm audit` for details."
    ].join("\n");
    const out = npmInstallFilter.apply(text, { command: "npm install" });
    ok(out.text.includes("added 250 packages"));
    ok(!out.text.includes("deprecated foo"));
    ok(!out.text.includes("looking for funding"));
    ok(!out.text.includes("npm audit"));
    strictEqual(out.compressed, true);
  });
});
suite("gitDiffFilter - regression", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("does not match `git difftool` (only diff/show)", () => {
    ok(!gitDiffFilter.matches("run_in_terminal", { command: "git difftool HEAD~1" }));
    ok(!gitDiffFilter.matches("run_in_terminal", { command: "git difftool --tool=vscode" }));
  });
  test("does not match `git diff-tree` or `git diff-files`", () => {
    ok(!gitDiffFilter.matches("run_in_terminal", { command: "git diff-tree HEAD" }));
    ok(!gitDiffFilter.matches("run_in_terminal", { command: "git diff-files" }));
  });
  test("matches git show", () => {
    ok(gitDiffFilter.matches("run_in_terminal", { command: "git show HEAD" }));
  });
  test("matches inside a pipeline", () => {
    ok(gitDiffFilter.matches("run_in_terminal", { command: "git diff | cat" }));
  });
  test("matches when wrapped in sudo / time", () => {
    ok(gitDiffFilter.matches("run_in_terminal", { command: "sudo time git diff" }));
  });
});
suite("gitLogFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches git log", () => {
    ok(gitLogFilter.matches("run_in_terminal", { command: "git log" }));
    ok(gitLogFilter.matches("run_in_terminal", { command: "git --no-pager log --oneline -n 20" }));
  });
  test("does not match git logout / unrelated", () => {
    ok(!gitLogFilter.matches("run_in_terminal", { command: "git status" }));
  });
});
suite("gitStatusFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches git status", () => {
    ok(gitStatusFilter.matches("run_in_terminal", { command: "git status" }));
    ok(gitStatusFilter.matches("run_in_terminal", { command: "git status -s" }));
  });
  test("does not match git stash", () => {
    ok(!gitStatusFilter.matches("run_in_terminal", { command: "git stash list" }));
  });
});
suite("find / grep / tree filters", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("findFilter caps output and adds summary", () => {
    const lines = Array.from({ length: 500 }, (_, i) => `./file${i}.ts`).join("\n");
    const out = findFilter.apply(lines, { command: 'find . -name "*.ts"' });
    strictEqual(out.compressed, true);
    ok(out.text.includes("omitted"));
    ok(out.text.includes("./file0.ts"));
  });
  test("grepFilter caps output", () => {
    const lines = Array.from({ length: 500 }, (_, i) => `file${i}.ts:1:match`).join("\n");
    const out = grepFilter.apply(lines, { command: "grep -rn match ." });
    strictEqual(out.compressed, true);
    ok(out.text.includes("omitted"));
  });
  test("treeFilter caps output", () => {
    const lines = Array.from({ length: 500 }, (_, i) => `\u251C\u2500\u2500 file${i}.ts`).join("\n");
    const out = treeFilter.apply(lines, { command: "tree" });
    strictEqual(out.compressed, true);
  });
});
suite("testRunnerFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches common test runners", () => {
    ok(testRunnerFilter.matches("run_in_terminal", { command: "npm test" }));
    ok(testRunnerFilter.matches("run_in_terminal", { command: "pytest" }));
    ok(testRunnerFilter.matches("run_in_terminal", { command: "cargo test" }));
    ok(testRunnerFilter.matches("run_in_terminal", { command: "go test ./..." }));
    ok(testRunnerFilter.matches("run_in_terminal", { command: "npx vitest run" }));
  });
});
suite("buildToolFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches build commands", () => {
    ok(buildToolFilter.matches("run_in_terminal", { command: "cargo build" }));
    ok(buildToolFilter.matches("run_in_terminal", { command: "cargo check" }));
    ok(buildToolFilter.matches("run_in_terminal", { command: "go build ./..." }));
    ok(buildToolFilter.matches("run_in_terminal", { command: "make" }));
    ok(buildToolFilter.matches("run_in_terminal", { command: "tsc -p ." }));
  });
});
suite("linterFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches linters", () => {
    ok(linterFilter.matches("run_in_terminal", { command: "eslint src" }));
    ok(linterFilter.matches("run_in_terminal", { command: "ruff check ." }));
    ok(linterFilter.matches("run_in_terminal", { command: "cargo clippy" }));
  });
});
suite("envFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches env / printenv with no args", () => {
    ok(envFilter.matches("run_in_terminal", { command: "env" }));
    ok(envFilter.matches("run_in_terminal", { command: "printenv" }));
  });
  test("sorts and dedupes lines", () => {
    const text = ["ZSH=/bin/zsh", "PATH=/usr/bin", "PATH=/usr/bin", "HOME=/home/u"].join("\n");
    const out = envFilter.apply(text, { command: "env" });
    strictEqual(out.compressed, true);
    const lines = out.text.split("\n");
    ok(lines.indexOf("HOME=/home/u") < lines.indexOf("PATH=/usr/bin"));
    ok(lines.indexOf("PATH=/usr/bin") < lines.indexOf("ZSH=/bin/zsh"));
    strictEqual(lines.filter((l) => l === "PATH=/usr/bin").length, 1);
  });
});
suite("isProtectedFromCompression", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("protects JSON object output", () => {
    ok(isProtectedFromCompression('{"a":1,"b":[1,2,3]}'));
  });
  test("protects JSON array output", () => {
    ok(isProtectedFromCompression('[1, 2, 3, {"k":"v"}]'));
  });
  test("protects YAML headers", () => {
    ok(isProtectedFromCompression("---\nfoo: bar\nbaz: 1\n"));
  });
  test("protects TOML headers", () => {
    ok(isProtectedFromCompression('[package]\nname = "x"\n'));
  });
  test("does not protect plain text", () => {
    ok(!isProtectedFromCompression("hello world\nsome output\n"));
  });
  test("does not protect malformed JSON", () => {
    ok(!isProtectedFromCompression("{ this is { not json }"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvdGVybWluYWxPdXRwdXRDb21wcmVzc29yLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWVwU3RyaWN0RXF1YWwsIG9rLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGdpdERpZmZGaWx0ZXIsIGdpdExvZ0ZpbHRlciwgZ2l0U3RhdHVzRmlsdGVyLCBsc0ZpbHRlciwgbnBtSW5zdGFsbEZpbHRlciwgcGFyc2VDb21tYW5kSGVhZCwgdGVzdFJ1bm5lckZpbHRlciwgYnVpbGRUb29sRmlsdGVyLCBsaW50ZXJGaWx0ZXIsIGVudkZpbHRlciwgZmluZEZpbHRlciwgZ3JlcEZpbHRlciwgdHJlZUZpbHRlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdG9vbHMvdGVybWluYWxPdXRwdXRDb21wcmVzc29yLmpzJztcbmltcG9ydCB7IGlzUHJvdGVjdGVkRnJvbUNvbXByZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvdG9vbFJlc3VsdENvbXByZXNzb3IuanMnO1xuXG5zdWl0ZSgncGFyc2VDb21tYW5kSGVhZCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGVtcHR5IGlucHV0JywgKCkgPT4ge1xuXHRcdHN0cmljdEVxdWFsKHBhcnNlQ29tbWFuZEhlYWQodW5kZWZpbmVkKSwgdW5kZWZpbmVkKTtcblx0XHRzdHJpY3RFcXVhbChwYXJzZUNvbW1hbmRIZWFkKCcnKSwgdW5kZWZpbmVkKTtcblx0XHRzdHJpY3RFcXVhbChwYXJzZUNvbW1hbmRIZWFkKCcgICAnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIHNpbXBsZSBjb21tYW5kcycsICgpID0+IHtcblx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VDb21tYW5kSGVhZCgnZ2l0IGRpZmYgSEVBRH41JyksIHsgaGVhZDogJ2dpdCcsIHN1YjogJ2RpZmYnIH0pO1xuXHRcdGRlZXBTdHJpY3RFcXVhbChwYXJzZUNvbW1hbmRIZWFkKCdscyAtbGEnKSwgeyBoZWFkOiAnbHMnLCBzdWI6ICctbGEnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lwcyBlbnYtdmFyIHByZWZpeGVzJywgKCkgPT4ge1xuXHRcdGRlZXBTdHJpY3RFcXVhbChwYXJzZUNvbW1hbmRIZWFkKCdDST0xIE5PREVfRU5WPXRlc3QgbnBtIGluc3RhbGwnKSwgeyBoZWFkOiAnbnBtJywgc3ViOiAnaW5zdGFsbCcgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgb25seSBmaXJzdCBwaXBlbGluZSBzZWdtZW50JywgKCkgPT4ge1xuXHRcdGRlZXBTdHJpY3RFcXVhbChwYXJzZUNvbW1hbmRIZWFkKCdnaXQgZGlmZiB8IGNhdCcpLCB7IGhlYWQ6ICdnaXQnLCBzdWI6ICdkaWZmJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgbGVhZGluZyBsb25nIGZsYWdzIGJlZm9yZSB0aGUgc3ViY29tbWFuZCcsICgpID0+IHtcblx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VDb21tYW5kSGVhZCgnZ2l0IC0tbm8tcGFnZXIgZGlmZiBzcmMvZm9vLnRzJyksIHsgaGVhZDogJ2dpdCcsIHN1YjogJ2RpZmYnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBza2lwIHNob3J0LWZsYWcgdmFsdWVzIGJlZm9yZSB0aGUgc3ViY29tbWFuZCcsICgpID0+IHtcblx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VDb21tYW5kSGVhZCgnZ2l0IC1DIC90bXAvcmVwbyBkaWZmJyksIHsgaGVhZDogJ2dpdCcsIHN1YjogJy1DJyB9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2dpdERpZmZGaWx0ZXInLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGlucHV0ID0geyBjb21tYW5kOiAnZ2l0IGRpZmYgSEVBRH4xJyB9O1xuXG5cdHRlc3QoJ21hdGNoZXMgZ2l0IGRpZmYnLCAoKSA9PiB7XG5cdFx0b2soZ2l0RGlmZkZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCBpbnB1dCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXRjaGVzIGdpdCAtLW5vLXBhZ2VyIGRpZmYnLCAoKSA9PiB7XG5cdFx0b2soZ2l0RGlmZkZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICdnaXQgLS1uby1wYWdlciBkaWZmIHNyYy9mb28udHMnIH0pKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgbWF0Y2ggZ2l0IHN0YXR1cycsICgpID0+IHtcblx0XHRvayghZ2l0RGlmZkZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICdnaXQgc3RhdHVzJyB9KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyArLy0gYW5kIGh1bmsgaGVhZGVycyB2ZXJiYXRpbScsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gW1xuXHRcdFx0J2RpZmYgLS1naXQgYS9mb28udHMgYi9mb28udHMnLFxuXHRcdFx0J2luZGV4IGFiYy4uZGVmIDEwMDY0NCcsXG5cdFx0XHQnLS0tIGEvZm9vLnRzJyxcblx0XHRcdCcrKysgYi9mb28udHMnLFxuXHRcdFx0J0BAIC0xLDMgKzEsMyBAQCcsXG5cdFx0XHQnIHVuY2hhbmdlZCcsXG5cdFx0XHQnLW9sZCcsXG5cdFx0XHQnK25ldycsXG5cdFx0XHQnIHVuY2hhbmdlZCcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBvdXQgPSBnaXREaWZmRmlsdGVyLmFwcGx5KHRleHQsIGlucHV0KTtcblx0XHRvayhvdXQudGV4dC5pbmNsdWRlcygnLW9sZCcpKTtcblx0XHRvayhvdXQudGV4dC5pbmNsdWRlcygnK25ldycpKTtcblx0XHRvayhvdXQudGV4dC5pbmNsdWRlcygnQEAgLTEsMyArMSwzIEBAJykpO1xuXHRcdG9rKCFvdXQudGV4dC5pbmNsdWRlcygnaW5kZXggYWJjLi5kZWYnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbGxhcHNlcyBsb25nIHVuY2hhbmdlZC1jb250ZXh0IHJ1bnMgaW50byBhIHNpbmdsZSBtYXJrZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgY3R4TGluZXMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAyMCB9LCAoXywgaSkgPT4gYCB0aGlzIGlzIGNvbnRleHQgbGluZSBudW1iZXIgJHtpfWApO1xuXHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHQnZGlmZiAtLWdpdCBhL2Zvby50cyBiL2Zvby50cycsXG5cdFx0XHQnLS0tIGEvZm9vLnRzJyxcblx0XHRcdCcrKysgYi9mb28udHMnLFxuXHRcdFx0J0BAIC0xLDIyICsxLDIyIEBAJyxcblx0XHRcdC4uLmN0eExpbmVzLFxuXHRcdFx0Jy1vbGQnLFxuXHRcdFx0JytuZXcnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3Qgb3V0ID0gZ2l0RGlmZkZpbHRlci5hcHBseSh0ZXh0LCBpbnB1dCk7XG5cdFx0b2sob3V0LnRleHQuaW5jbHVkZXMoJyB0aGlzIGlzIGNvbnRleHQgbGluZSBudW1iZXIgMCcpKTtcblx0XHRvayghb3V0LnRleHQuaW5jbHVkZXMoJyB0aGlzIGlzIGNvbnRleHQgbGluZSBudW1iZXIgNScpKTtcblx0XHRvayghb3V0LnRleHQuaW5jbHVkZXMoJyB0aGlzIGlzIGNvbnRleHQgbGluZSBudW1iZXIgMTknKSk7XG5cdFx0b2sob3V0LnRleHQuaW5jbHVkZXMoJzE5IHVuY2hhbmdlZCBjb250ZXh0IGxpbmVzIG9taXR0ZWQnKSk7XG5cdFx0b2sob3V0LnRleHQuaW5jbHVkZXMoJy1vbGQnKSk7XG5cdFx0b2sob3V0LnRleHQuaW5jbHVkZXMoJytuZXcnKSk7XG5cdFx0c3RyaWN0RXF1YWwob3V0LmNvbXByZXNzZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbWl0cyBsb2NrZmlsZSBkaWZmcycsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gW1xuXHRcdFx0J2RpZmYgLS1naXQgYS9wYWNrYWdlLWxvY2suanNvbiBiL3BhY2thZ2UtbG9jay5qc29uJyxcblx0XHRcdCdpbmRleCAxLi4yIDEwMDY0NCcsXG5cdFx0XHQnLS0tIGEvcGFja2FnZS1sb2NrLmpzb24nLFxuXHRcdFx0JysrKyBiL3BhY2thZ2UtbG9jay5qc29uJyxcblx0XHRcdCdAQCAtMSwzICsxLDMgQEAnLFxuXHRcdFx0Jy1vbGQnLFxuXHRcdFx0JytuZXcnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3Qgb3V0ID0gZ2l0RGlmZkZpbHRlci5hcHBseSh0ZXh0LCBpbnB1dCk7XG5cdFx0b2sob3V0LnRleHQuaW5jbHVkZXMoJ2xvY2tmaWxlL3NuYXBzaG90IGRpZmYgb21pdHRlZCcpKTtcblx0XHRvayghb3V0LnRleHQuaW5jbHVkZXMoJy1vbGQnKSk7XG5cdFx0c3RyaWN0RXF1YWwob3V0LmNvbXByZXNzZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBvbWl0IGFyYml0cmFyeSAubG9jayBmaWxlIGRpZmZzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHQnZGlmZiAtLWdpdCBhL2N1c3RvbS5sb2NrIGIvY3VzdG9tLmxvY2snLFxuXHRcdFx0Jy0tLSBhL2N1c3RvbS5sb2NrJyxcblx0XHRcdCcrKysgYi9jdXN0b20ubG9jaycsXG5cdFx0XHQnQEAgLTEsMiArMSwyIEBAJyxcblx0XHRcdCcgdW5jaGFuZ2VkJyxcblx0XHRcdCctb2xkJyxcblx0XHRcdCcrbmV3Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IG91dCA9IGdpdERpZmZGaWx0ZXIuYXBwbHkodGV4dCwgaW5wdXQpO1xuXHRcdG9rKCFvdXQudGV4dC5pbmNsdWRlcygnbG9ja2ZpbGUvc25hcHNob3QgZGlmZiBvbWl0dGVkJykpO1xuXHRcdG9rKG91dC50ZXh0LmluY2x1ZGVzKCctb2xkJykpO1xuXHRcdG9rKG91dC50ZXh0LmluY2x1ZGVzKCcrbmV3JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgbm9uLWNvbnRleHQgbWV0YWRhdGEgbGluZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdCdkaWZmIC0tZ2l0IGEvZm9vLnRzIGIvZm9vLnRzJyxcblx0XHRcdCduZXcgZmlsZSBtb2RlIDEwMDY0NCcsXG5cdFx0XHQnLS0tIC9kZXYvbnVsbCcsXG5cdFx0XHQnKysrIGIvZm9vLnRzJyxcblx0XHRcdCdAQCAtMCwwICsyLDIgQEAnLFxuXHRcdFx0JytsaW5lIDEnLFxuXHRcdFx0JytsaW5lIDInLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3Qgb3V0ID0gZ2l0RGlmZkZpbHRlci5hcHBseSh0ZXh0LCBpbnB1dCk7XG5cdFx0b2sob3V0LnRleHQuaW5jbHVkZXMoJ25ldyBmaWxlIG1vZGUgMTAwNjQ0JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXdyaXRlcyBodW5rIGhlYWRlciBjb3VudHMgdG8gbWF0Y2ggZW1pdHRlZCBib2R5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGN0eExpbmVzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMjAgfSwgKF8sIGkpID0+IGAgY3R4IGxpbmUgJHtpfWApO1xuXHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHQnZGlmZiAtLWdpdCBhL2Zvby50cyBiL2Zvby50cycsXG5cdFx0XHQnLS0tIGEvZm9vLnRzJyxcblx0XHRcdCcrKysgYi9mb28udHMnLFxuXHRcdFx0J0BAIC0xMCwyMiArMTAsMjIgQEAnLFxuXHRcdFx0Li4uY3R4TGluZXMsXG5cdFx0XHQnLW9sZCcsXG5cdFx0XHQnK25ldycsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBvdXQgPSBnaXREaWZmRmlsdGVyLmFwcGx5KHRleHQsIGlucHV0KTtcblx0XHRvayhvdXQudGV4dC5pbmNsdWRlcygnQEAgLTEwLDIgKzEwLDIgQEAnKSk7XG5cdFx0b2soIW91dC50ZXh0LmluY2x1ZGVzKCdAQCAtMTAsMjIgKzEwLDIyIEBAJykpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnbHNGaWx0ZXInLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ21hdGNoZXMgb25seSB3aGVuIC1sIGZsYWcgcHJlc2VudCcsICgpID0+IHtcblx0XHRvayghbHNGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnbHMnIH0pKTtcblx0XHRvayhsc0ZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICdscyAtbGEnIH0pKTtcblx0XHRvayhsc0ZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICdscyAtYWwgc3JjLycgfSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgbG9uZy1mb3JtIGNvbHVtbnMgYW5kIGtlZXBzIGZpbGUgbmFtZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdCd0b3RhbCAyNCcsXG5cdFx0XHQnLXJ3LXItLXItLSAgIDEgdXNlciAgc3RhZmYgICAxMjMgSmFuIDAxIDEyOjM0IFJFQURNRS5tZCcsXG5cdFx0XHQnZHJ3eHIteHIteCAgIDUgdXNlciAgc3RhZmYgICAxNjAgSmFuIDAxIDEyOjM0IHNyYycsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBvdXQgPSBsc0ZpbHRlci5hcHBseSh0ZXh0LCB7IGNvbW1hbmQ6ICdscyAtbGEnIH0pO1xuXHRcdG9rKG91dC50ZXh0LmluY2x1ZGVzKCdSRUFETUUubWQnKSk7XG5cdFx0b2sob3V0LnRleHQuaW5jbHVkZXMoJ3NyYy8nKSk7XG5cdFx0b2soIW91dC50ZXh0LmluY2x1ZGVzKCd1c2VyICBzdGFmZicpKTtcblx0XHRvayghb3V0LnRleHQuaW5jbHVkZXMoJ3RvdGFsIDI0JykpO1xuXHRcdHN0cmljdEVxdWFsKG91dC5jb21wcmVzc2VkLCB0cnVlKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ25wbUluc3RhbGxGaWx0ZXInLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ21hdGNoZXMgbnBtIGluc3RhbGwnLCAoKSA9PiB7XG5cdFx0b2sobnBtSW5zdGFsbEZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICducG0gaW5zdGFsbCcgfSkpO1xuXHRcdG9rKG5wbUluc3RhbGxGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnbnBtIGNpJyB9KSk7XG5cdFx0b2soIW5wbUluc3RhbGxGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnbnBtIHRlc3QnIH0pKTtcblx0fSk7XG5cblx0dGVzdCgnZHJvcHMgYXVkaXQgYW5kIGZ1bmRpbmcgbm9pc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdCdhZGRlZCAyNTAgcGFja2FnZXMgaW4gMTJzJyxcblx0XHRcdCducG0gd2FybiBkZXByZWNhdGVkIGZvb0AxLjAuMDogcGxlYXNlIHVwZGF0ZScsXG5cdFx0XHQnNDIgcGFja2FnZXMgYXJlIGxvb2tpbmcgZm9yIGZ1bmRpbmcnLFxuXHRcdFx0JyAgcnVuIGBucG0gZnVuZGAgZm9yIGRldGFpbHMnLFxuXHRcdFx0JycsXG5cdFx0XHQnMyB2dWxuZXJhYmlsaXRpZXMgKDEgbG93LCAyIG1vZGVyYXRlKScsXG5cdFx0XHQnUnVuIGBucG0gYXVkaXRgIGZvciBkZXRhaWxzLicsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBvdXQgPSBucG1JbnN0YWxsRmlsdGVyLmFwcGx5KHRleHQsIHsgY29tbWFuZDogJ25wbSBpbnN0YWxsJyB9KTtcblx0XHRvayhvdXQudGV4dC5pbmNsdWRlcygnYWRkZWQgMjUwIHBhY2thZ2VzJykpO1xuXHRcdG9rKCFvdXQudGV4dC5pbmNsdWRlcygnZGVwcmVjYXRlZCBmb28nKSk7XG5cdFx0b2soIW91dC50ZXh0LmluY2x1ZGVzKCdsb29raW5nIGZvciBmdW5kaW5nJykpO1xuXHRcdG9rKCFvdXQudGV4dC5pbmNsdWRlcygnbnBtIGF1ZGl0JykpO1xuXHRcdHN0cmljdEVxdWFsKG91dC5jb21wcmVzc2VkLCB0cnVlKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2dpdERpZmZGaWx0ZXIgLSByZWdyZXNzaW9uJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBtYXRjaCBgZ2l0IGRpZmZ0b29sYCAob25seSBkaWZmL3Nob3cpJywgKCkgPT4ge1xuXHRcdG9rKCFnaXREaWZmRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ2dpdCBkaWZmdG9vbCBIRUFEfjEnIH0pKTtcblx0XHRvayghZ2l0RGlmZkZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICdnaXQgZGlmZnRvb2wgLS10b29sPXZzY29kZScgfSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBtYXRjaCBgZ2l0IGRpZmYtdHJlZWAgb3IgYGdpdCBkaWZmLWZpbGVzYCcsICgpID0+IHtcblx0XHRvayghZ2l0RGlmZkZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICdnaXQgZGlmZi10cmVlIEhFQUQnIH0pKTtcblx0XHRvayghZ2l0RGlmZkZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICdnaXQgZGlmZi1maWxlcycgfSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXRjaGVzIGdpdCBzaG93JywgKCkgPT4ge1xuXHRcdG9rKGdpdERpZmZGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnZ2l0IHNob3cgSEVBRCcgfSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXRjaGVzIGluc2lkZSBhIHBpcGVsaW5lJywgKCkgPT4ge1xuXHRcdG9rKGdpdERpZmZGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnZ2l0IGRpZmYgfCBjYXQnIH0pKTtcblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hlcyB3aGVuIHdyYXBwZWQgaW4gc3VkbyAvIHRpbWUnLCAoKSA9PiB7XG5cdFx0b2soZ2l0RGlmZkZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICdzdWRvIHRpbWUgZ2l0IGRpZmYnIH0pKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2dpdExvZ0ZpbHRlcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbWF0Y2hlcyBnaXQgbG9nJywgKCkgPT4ge1xuXHRcdG9rKGdpdExvZ0ZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICdnaXQgbG9nJyB9KSk7XG5cdFx0b2soZ2l0TG9nRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ2dpdCAtLW5vLXBhZ2VyIGxvZyAtLW9uZWxpbmUgLW4gMjAnIH0pKTtcblx0fSk7XG5cdHRlc3QoJ2RvZXMgbm90IG1hdGNoIGdpdCBsb2dvdXQgLyB1bnJlbGF0ZWQnLCAoKSA9PiB7XG5cdFx0b2soIWdpdExvZ0ZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICdnaXQgc3RhdHVzJyB9KSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdnaXRTdGF0dXNGaWx0ZXInLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ21hdGNoZXMgZ2l0IHN0YXR1cycsICgpID0+IHtcblx0XHRvayhnaXRTdGF0dXNGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnZ2l0IHN0YXR1cycgfSkpO1xuXHRcdG9rKGdpdFN0YXR1c0ZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICdnaXQgc3RhdHVzIC1zJyB9KSk7XG5cdH0pO1xuXHR0ZXN0KCdkb2VzIG5vdCBtYXRjaCBnaXQgc3Rhc2gnLCAoKSA9PiB7XG5cdFx0b2soIWdpdFN0YXR1c0ZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICdnaXQgc3Rhc2ggbGlzdCcgfSkpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnZmluZCAvIGdyZXAgLyB0cmVlIGZpbHRlcnMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2ZpbmRGaWx0ZXIgY2FwcyBvdXRwdXQgYW5kIGFkZHMgc3VtbWFyeScsICgpID0+IHtcblx0XHRjb25zdCBsaW5lcyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDUwMCB9LCAoXywgaSkgPT4gYC4vZmlsZSR7aX0udHNgKS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBvdXQgPSBmaW5kRmlsdGVyLmFwcGx5KGxpbmVzLCB7IGNvbW1hbmQ6ICdmaW5kIC4gLW5hbWUgXCIqLnRzXCInIH0pO1xuXHRcdHN0cmljdEVxdWFsKG91dC5jb21wcmVzc2VkLCB0cnVlKTtcblx0XHRvayhvdXQudGV4dC5pbmNsdWRlcygnb21pdHRlZCcpKTtcblx0XHQvLyBGaXJzdCBmaWxlIHNob3VsZCBzdGlsbCBhcHBlYXIuXG5cdFx0b2sob3V0LnRleHQuaW5jbHVkZXMoJy4vZmlsZTAudHMnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dyZXBGaWx0ZXIgY2FwcyBvdXRwdXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZXMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiA1MDAgfSwgKF8sIGkpID0+IGBmaWxlJHtpfS50czoxOm1hdGNoYCkuam9pbignXFxuJyk7XG5cdFx0Y29uc3Qgb3V0ID0gZ3JlcEZpbHRlci5hcHBseShsaW5lcywgeyBjb21tYW5kOiAnZ3JlcCAtcm4gbWF0Y2ggLicgfSk7XG5cdFx0c3RyaWN0RXF1YWwob3V0LmNvbXByZXNzZWQsIHRydWUpO1xuXHRcdG9rKG91dC50ZXh0LmluY2x1ZGVzKCdvbWl0dGVkJykpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmVlRmlsdGVyIGNhcHMgb3V0cHV0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogNTAwIH0sIChfLCBpKSA9PiBgXHUyNTFDXHUyNTAwXHUyNTAwIGZpbGUke2l9LnRzYCkuam9pbignXFxuJyk7XG5cdFx0Y29uc3Qgb3V0ID0gdHJlZUZpbHRlci5hcHBseShsaW5lcywgeyBjb21tYW5kOiAndHJlZScgfSk7XG5cdFx0c3RyaWN0RXF1YWwob3V0LmNvbXByZXNzZWQsIHRydWUpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgndGVzdFJ1bm5lckZpbHRlcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbWF0Y2hlcyBjb21tb24gdGVzdCBydW5uZXJzJywgKCkgPT4ge1xuXHRcdG9rKHRlc3RSdW5uZXJGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnbnBtIHRlc3QnIH0pKTtcblx0XHRvayh0ZXN0UnVubmVyRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ3B5dGVzdCcgfSkpO1xuXHRcdG9rKHRlc3RSdW5uZXJGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnY2FyZ28gdGVzdCcgfSkpO1xuXHRcdG9rKHRlc3RSdW5uZXJGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnZ28gdGVzdCAuLy4uLicgfSkpO1xuXHRcdG9rKHRlc3RSdW5uZXJGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnbnB4IHZpdGVzdCBydW4nIH0pKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2J1aWxkVG9vbEZpbHRlcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbWF0Y2hlcyBidWlsZCBjb21tYW5kcycsICgpID0+IHtcblx0XHRvayhidWlsZFRvb2xGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnY2FyZ28gYnVpbGQnIH0pKTtcblx0XHRvayhidWlsZFRvb2xGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnY2FyZ28gY2hlY2snIH0pKTtcblx0XHRvayhidWlsZFRvb2xGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnZ28gYnVpbGQgLi8uLi4nIH0pKTtcblx0XHRvayhidWlsZFRvb2xGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnbWFrZScgfSkpO1xuXHRcdG9rKGJ1aWxkVG9vbEZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICd0c2MgLXAgLicgfSkpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnbGludGVyRmlsdGVyJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtYXRjaGVzIGxpbnRlcnMnLCAoKSA9PiB7XG5cdFx0b2sobGludGVyRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ2VzbGludCBzcmMnIH0pKTtcblx0XHRvayhsaW50ZXJGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAncnVmZiBjaGVjayAuJyB9KSk7XG5cdFx0b2sobGludGVyRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ2NhcmdvIGNsaXBweScgfSkpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnZW52RmlsdGVyJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtYXRjaGVzIGVudiAvIHByaW50ZW52IHdpdGggbm8gYXJncycsICgpID0+IHtcblx0XHRvayhlbnZGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnZW52JyB9KSk7XG5cdFx0b2soZW52RmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ3ByaW50ZW52JyB9KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NvcnRzIGFuZCBkZWR1cGVzIGxpbmVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSBbJ1pTSD0vYmluL3pzaCcsICdQQVRIPS91c3IvYmluJywgJ1BBVEg9L3Vzci9iaW4nLCAnSE9NRT0vaG9tZS91J10uam9pbignXFxuJyk7XG5cdFx0Y29uc3Qgb3V0ID0gZW52RmlsdGVyLmFwcGx5KHRleHQsIHsgY29tbWFuZDogJ2VudicgfSk7XG5cdFx0c3RyaWN0RXF1YWwob3V0LmNvbXByZXNzZWQsIHRydWUpO1xuXHRcdC8vIFNvcnRlZCBhbHBoYWJldGljYWxseS5cblx0XHRjb25zdCBsaW5lcyA9IG91dC50ZXh0LnNwbGl0KCdcXG4nKTtcblx0XHRvayhsaW5lcy5pbmRleE9mKCdIT01FPS9ob21lL3UnKSA8IGxpbmVzLmluZGV4T2YoJ1BBVEg9L3Vzci9iaW4nKSk7XG5cdFx0b2sobGluZXMuaW5kZXhPZignUEFUSD0vdXNyL2JpbicpIDwgbGluZXMuaW5kZXhPZignWlNIPS9iaW4venNoJykpO1xuXHRcdC8vIERlZHVwZWQuXG5cdFx0c3RyaWN0RXF1YWwobGluZXMuZmlsdGVyKGwgPT4gbCA9PT0gJ1BBVEg9L3Vzci9iaW4nKS5sZW5ndGgsIDEpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnaXNQcm90ZWN0ZWRGcm9tQ29tcHJlc3Npb24nLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Byb3RlY3RzIEpTT04gb2JqZWN0IG91dHB1dCcsICgpID0+IHtcblx0XHRvayhpc1Byb3RlY3RlZEZyb21Db21wcmVzc2lvbigne1wiYVwiOjEsXCJiXCI6WzEsMiwzXX0nKSk7XG5cdH0pO1xuXHR0ZXN0KCdwcm90ZWN0cyBKU09OIGFycmF5IG91dHB1dCcsICgpID0+IHtcblx0XHRvayhpc1Byb3RlY3RlZEZyb21Db21wcmVzc2lvbignWzEsIDIsIDMsIHtcImtcIjpcInZcIn1dJykpO1xuXHR9KTtcblx0dGVzdCgncHJvdGVjdHMgWUFNTCBoZWFkZXJzJywgKCkgPT4ge1xuXHRcdG9rKGlzUHJvdGVjdGVkRnJvbUNvbXByZXNzaW9uKCctLS1cXG5mb286IGJhclxcbmJhejogMVxcbicpKTtcblx0fSk7XG5cdHRlc3QoJ3Byb3RlY3RzIFRPTUwgaGVhZGVycycsICgpID0+IHtcblx0XHRvayhpc1Byb3RlY3RlZEZyb21Db21wcmVzc2lvbignW3BhY2thZ2VdXFxubmFtZSA9IFwieFwiXFxuJykpO1xuXHR9KTtcblx0dGVzdCgnZG9lcyBub3QgcHJvdGVjdCBwbGFpbiB0ZXh0JywgKCkgPT4ge1xuXHRcdG9rKCFpc1Byb3RlY3RlZEZyb21Db21wcmVzc2lvbignaGVsbG8gd29ybGRcXG5zb21lIG91dHB1dFxcbicpKTtcblx0fSk7XG5cdHRlc3QoJ2RvZXMgbm90IHByb3RlY3QgbWFsZm9ybWVkIEpTT04nLCAoKSA9PiB7XG5cdFx0b2soIWlzUHJvdGVjdGVkRnJvbUNvbXByZXNzaW9uKCd7IHRoaXMgaXMgeyBub3QganNvbiB9JykpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUIsSUFBSSxtQkFBbUI7QUFDakQsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxlQUFlLGNBQWMsaUJBQWlCLFVBQVUsa0JBQWtCLGtCQUFrQixrQkFBa0IsaUJBQWlCLGNBQWMsV0FBVyxZQUFZLFlBQVksa0JBQWtCO0FBQzNNLFNBQVMsa0NBQWtDO0FBRTNDLE1BQU0sb0JBQW9CLE1BQU07QUFDL0IsMENBQXdDO0FBRXhDLE9BQUsscUNBQXFDLE1BQU07QUFDL0MsZ0JBQVksaUJBQWlCLE1BQVMsR0FBRyxNQUFTO0FBQ2xELGdCQUFZLGlCQUFpQixFQUFFLEdBQUcsTUFBUztBQUMzQyxnQkFBWSxpQkFBaUIsS0FBSyxHQUFHLE1BQVM7QUFBQSxFQUMvQyxDQUFDO0FBRUQsT0FBSywwQkFBMEIsTUFBTTtB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
