import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { stripCommandEchoAndPrompt } from "../../browser/executeStrategy/strategyHelpers.js";
suite("stripCommandEchoAndPrompt", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("strips single-line command echo and trailing prompt", () => {
    const output = [
      "user@host:~/src $ echo hello",
      "hello",
      "user@host:~/src $ "
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo hello"),
      "hello"
    );
  });
  test("strips command echo with zsh-style prompt (] $ )", () => {
    const output = [
      "s/testWorkspace (main**) ] $  true",
      "[ alex@Alexandrus-MacBook-Pro:/Users/alex/src/vscode4/extensions/vscode-api-test",
      "s/testWorkspace (main**) ] $ "
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "true"),
      ""
    );
  });
  test("preserves actual command output between echo and prompt", () => {
    const output = [
      "s/testWorkspace (main**) ] $  echo MARKER_123",
      "MARKER_123",
      "[ alex@host:/some/path",
      "s/testWorkspace (main**) ] $ "
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo MARKER_123"),
      "MARKER_123"
    );
  });
  test("preserves multi-line command output", () => {
    const output = [
      "user@host:~ $ echo line1 && echo line2 && echo line3",
      "line1",
      "line2",
      "line3",
      "user@host:~ $ "
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo line1 && echo line2 && echo line3"),
      "line1\nline2\nline3"
    );
  });
  test("handles empty output (no-output command)", () => {
    const output = [
      "s/testWorkspace (main**) ] $  true",
      "[ alex@host:/Users/alex/src/vscode4/extensions/vscode-api-test",
      "s/testWorkspace (main**) ] $"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "true"),
      ""
    );
  });
  test("strips sandbox-wrapped command echo (long wrapped lines)", () => {
    const sandboxCommand = `ELECTRON_RUN_AS_NODE=1 PATH="$PATH:/app/rg/bin" TMPDIR="/tmp/sandbox" "/app/sandbox-runtime/dist/cli.js" --settings "/tmp/sandbox-settings.json" -c 'curl -s https://example.com'`;
    const output = [
      's/testWorkspace (main**) ] $ ELECTRON_RUN_AS_NODE=1 PATH="$PATH:/app/rg/bin" T',
      'MPDIR="/tmp/sandbox" "/app/sandbox-runtime/dist/cli.js" --settings "/tmp/sand',
      `box-settings.json" -c 'curl -s https://example.com'`,
      "[ alex@host:/Users/alex/src/vscode4/extensions/vscode-api-test",
      "s/testWorkspace (main**) ] $ "
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, sandboxCommand),
      ""
    );
  });
  test("strips trailing prompt with various prompt styles", () => {
    assert.strictEqual(
      stripCommandEchoAndPrompt(
        ["user@host:~ $ echo hello", "hello", "user@host:~ $ "].join("\n"),
        "echo hello"
      ),
      "hello",
      "Failed for bash $ prompt"
    );
    assert.strictEqual(
      stripCommandEchoAndPrompt(
        ["root@server:/var/log# echo hello", "hello", "root@server:/var/log# "].join("\n"),
        "echo hello"
      ),
      "hello",
      "Failed for root # prompt"
    );
    assert.strictEqual(
      stripCommandEchoAndPrompt(
        ["s/workspace ] $ echo hello", "hello", "s/workspace ] $ "].join("\n"),
        "echo hello"
      ),
      "hello",
      "Failed for bracketed ] $ prompt"
    );
    assert.strictEqual(
      stripCommandEchoAndPrompt(
        ["PS C:\\Users\\test> echo hello", "hello", "PS C:\\Users\\test>"].join("\n"),
        "echo hello"
      ),
      "hello",
      "Failed for PowerShell prompt"
    );
  });
  test("does not strip output lines ending with prompt-like characters", () => {
    assert.strictEqual(
      stripCommandEchoAndPrompt(
        ['user@host:~ $ echo "100%"', "100%", "user@host:~ $ "].join("\n"),
        'echo "100%"'
      ),
      "100%",
      "Should not strip line ending with %"
    );
    assert.strictEqual(
      stripCommandEchoAndPrompt(
        ['user@host:~ $ echo "<div>"', "<div>", "user@host:~ $ "].join("\n"),
        'echo "<div>"'
      ),
      "<div>",
      "Should not strip line ending with >"
    );
    assert.strictEqual(
      stripCommandEchoAndPrompt(
        ['user@host:~ $ echo "item #"', "item #", "user@host:~ $ "].join("\n"),
        'echo "item #"'
      ),
      "item #",
      "Should not strip line ending with #"
    );
  });
  test("handles command with leading space (history prevention)", () => {
    const output = [
      "user@host:~ $  echo hello",
      "hello",
      "user@host:~ $ "
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, " echo hello"),
      "hello"
    );
  });
  test("does not strip actual output lines that happen to contain prompt chars", () => {
    const output = [
      'user@host:~ $ echo "price is $5"',
      "price is $5",
      "user@host:~ $ "
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, 'echo "price is $5"'),
      "price is $5"
    );
  });
  test("handles output with no trailing prompt (e.g. command still running)", () => {
    const output = [
      "user@host:~ $ echo hello",
      "hello"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo hello"),
      "hello"
    );
  });
  test("handles output with only the command echo and no prompt", () => {
    const output = "user@host:~ $ true";
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "true"),
      ""
    );
  });
  test("handles empty string input", () => {
    assert.strictEqual(
      stripCommandEchoAndPrompt("", "echo hello"),
      ""
    );
  });
  test("handles bash -c subshell command echo", () => {
    const output = [
      's/testWorkspace (main**) ] $  bash -c "exit 42"',
      "[ alex@host:/Users/alex/src/vscode4/extensions/vscode-api-test",
      "s/testWorkspace (main**) ] $ "
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, 'bash -c "exit 42"'),
      ""
    );
  });
  test("strips wrapped prompt lines with user@hostname pattern", () => {
    const output = [
      "user@host:~ $ echo hi",
      "hi",
      "[ alex@Alexandrus-MacBook-Pro:/very/long/path/that/wraps/across/terminal/col",
      "umns/in/the/test/workspace ] $"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo hi"),
      "hi"
    );
  });
  test("handles PowerShell-style prompt (PS C:\\>)", () => {
    const output = [
      "PS C:\\Users\\test> echo hello",
      "hello",
      "PS C:\\Users\\test>"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo hello"),
      "hello"
    );
  });
  test("strips stale prompt fragments and ^C residue before command echo", () => {
    const output = [
      "ts/testWorkspace$ ^C",
      "cloudtest@5ac6b023c000000:/mnt/vss/_work/vscode/vscode/extensions/vscode-api-tes",
      "ts/testWorkspace$  echo MARKER_123",
      "MARKER_123"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo MARKER_123"),
      "MARKER_123"
    );
  });
  test("strips stale prompt fragments for no-output command", () => {
    const output = [
      "ts/testWorkspace$ ^C",
      "cloudtest@5ac6b023c000000:/mnt/vss/_work/vscode/vscode/extensions/vscode-api-tes",
      "ts/testWorkspace$  true"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "true"),
      ""
    );
  });
  test("strips stale prompt fragments for multi-line output", () => {
    const output = [
      "ts/testWorkspace$ ^C",
      "cloudtest@5ac6b023c000000:/mnt/vss/_work/vscode/vscode/extensions/vscode-api-tes",
      "ts/testWorkspace$  echo M1 && echo M2 && echo M3",
      "M1",
      "M2",
      "M3"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo M1 && echo M2 && echo M3"),
      "M1\nM2\nM3"
    );
  });
  test("strips trailing prompt without @ (hostname:path user$)", () => {
    const output = [
      "dsm12-be220-abc:testWorkspace runner$  echo hello",
      "hello",
      "dsm12-be220-abc:testWorkspace runner$"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo hello"),
      "hello"
    );
  });
  test("strips wrapped trailing prompt without @ (hostname:path + fragment$)", () => {
    const output = [
      "dsm12-be220-abc:testWorkspace runner$  echo hello",
      "hello",
      "dsm12-be220-8627ea7f-2c5a-40cd-8ba1-bf324bb4f59a-DA35C080942E:testWorkspace runn",
      "er$"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo hello"),
      "hello"
    );
  });
  test("strips wrapped trailing prompt with path-like fragment (ts/testWorkspace$)", () => {
    const output = [
      "user@host:~ $ echo hello",
      "hello",
      "cloudtest@d4b0d881c000000:/mnt/vss/_work/vscode/vscode/extensions/vscode-api-tes",
      "ts/testWorkspace$"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo hello"),
      "hello"
    );
  });
  test("strips trailing prompt fragment for no-output command", () => {
    const output = [
      "dsm12-be220-abc:testWorkspace runner$  true",
      "dsm12-be220-8627ea7f-2c5a-40cd-8ba1-bf324bb4f59a-DA35C080942E:testWorkspace runn",
      "er$"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "true"),
      ""
    );
  });
  test("strips mid-word wrapped command continuation (PowerShell/Windows)", () => {
    const output = [
      "PS D:\\a\\_work\\vscode\\testWorkspace> echo MARK",
      "ER_123_ECHO",
      "MARKER_123_ECHO"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo MARKER_123_ECHO"),
      "MARKER_123_ECHO"
    );
  });
  test("strips PowerShell prompt from getOutput() result", () => {
    const output = "PS D:\\a\\_work\\vscode\\testWorkspace> cmd /c exit 42";
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "cmd /c exit 42"),
      ""
    );
  });
  test("strips partial command echo (suffix from wrapped getOutput)", () => {
    const output = [
      "90741 ; echo M2_1774133190741 ; echo M3_1774133190741",
      "M1_1774133190741",
      "M2_1774133190741",
      "M3_1774133190741"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo M1_1774133190741 ; echo M2_1774133190741 ; echo M3_1774133190741"),
      "M1_1774133190741\nM2_1774133190741\nM3_1774133190741"
    );
  });
  test("strips bracketed prompt without @ (hostname:path format)", () => {
    const output = [
      "[W007DV9PF9-1:~/vss/_work/1/s/extensions/vscode-api-tests/testWorkspace] cloudte",
      "st$"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "true"),
      ""
    );
  });
  test("strips bracketed prompt without @ (single line, no trailing $)", () => {
    const output = "[W007DV9PF9-1:~/vss/_work/1/s/extensions/vscode-api-tests/testWorkspace] cloudte";
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "true"),
      ""
    );
  });
  test("strips bracketed prompt without @ with command echo", () => {
    const output = [
      "[W007DV9PF9-1:~/vss/_work] cloudtest$  echo MARKER_123",
      "MARKER_123",
      "[W007DV9PF9-1:~/vss/_work] cloudtest$"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo MARKER_123"),
      "MARKER_123"
    );
  });
  test("strips sandbox-wrapped command echo with error output and trailing prompt", () => {
    const commandLine = `ELECTRON_RUN_AS_NODE=1 PATH="$PATH:/Users/alex/src/vscode4/node_modules/@vscode/ripgrep/bin" TMPDIR="/Users/alex/.vscode-oss-dev/tmp" CLAUDE_TMPDIR="/Users/alex/.vscode-oss-dev/tmp" "/Users/alex/src/vscode4/node_modules/@vscode/sandbox-runtime/dist/cli.js" --settings "/Users/alex/.vscode-oss-dev/tmp/vscode-sandbox-settings-cf5b6232-825b-4f4c-8902-32a8591007fd.json" -c ' echo "SANDBOX_TMP_1774127409076" > /tmp/SANDBOX_TMP_1774127409076.txt'`;
    const output = [
      'ELECTRON_RUN_AS_NODE=1 PATH="$PATH:/Users/alex/src/vscode4/node_modules/@vscode/',
      'ripgrep/bin" TMPDIR="/Users/alex/.vscode-oss-dev/tmp" CLAUDE_TMPDIR="/Users/alex',
      '/.vscode-oss-dev/tmp" "/Users/alex/src/vscode4/node_modules/@vscode/sandbox-',
      'runtime/dist/cli.js" --settings "/Users/alex/.vscode-oss-dev/tmp/vscode-sandbo',
      `x-settings-cf5b6232-825b-4f4c-8902-32a8591007fd.json" -c ' echo "SANDBOX_TMP_177`,
      `4127409076" > /tmp/SANDBOX_TMP_1774127409076.txt'`,
      "[ alex@Alexandrus-MacBook-Pro:/Users/alex/src/vscode4/extensions/vscode-api-test",
      "s/testWorkspace (alexdima/fix-303531-sandbox-no-output-leak**) ] $ ELECTRON_RUN_",
      'AS_NODE=1 PATH="$PATH:/Users/alex/src/vscode4/node_modules/@vscode/ripgrep/bin" ',
      'TMPDIR="/Users/alex/.vscode-oss-dev/tmp" CLAUDE_TMPDIR="/Users/alex/.vscode-oss-',
      'dev/tmp" "/Users/alex/src/vscode4/node_modules/@vscode/sandbox-runtime/dis',
      't/cli.js" --settings "/Users/alex/.vscode-oss-dev/tmp/vscode-sandbox-settings-cf',
      `5b6232-825b-4f4c-8902-32a8591007fd.json" -c ' echo "SANDBOX_TMP_1774127409076" >`,
      " /tmp/SANDBOX_TMP_1774127409076.txt'"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, commandLine),
      ""
    );
  });
  suite("adversarial: output resembling prompts", () => {
    test("output ending with $ is preserved (not confused with wrapped prompt)", () => {
      const output = [
        "user@host:~ $ echo 'test$'",
        "test$",
        "user@host:~ $"
      ].join("\n");
      assert.strictEqual(
        stripCommandEchoAndPrompt(output, "echo 'test$'"),
        "test$"
      );
    });
    test("output ending with # is preserved (not confused with wrapped prompt)", () => {
      const output = [
        "user@host:~ $ echo 'div#'",
        "div#",
        "user@host:~ $"
      ].join("\n");
      assert.strictEqual(
        stripCommandEchoAndPrompt(output, "echo 'div#'"),
        "div#"
      );
    });
    test("bracketed log output [tag:~/path] is preserved", () => {
      const output = [
        "user@host:~ $ node build.js",
        "[build:~/dist] compiled successfully",
        "user@host:~ $"
      ].join("\n");
      assert.strictEqual(
        stripCommandEchoAndPrompt(output, "node build.js"),
        "[build:~/dist] compiled successfully"
      );
    });
    test("output containing user@host:path ending with # is preserved", () => {
      const output = [
        "user@host:~ $ cat /etc/motd",
        "admin@server:~/docs #",
        "user@host:~ $"
      ].join("\n");
      assert.strictEqual(
        stripCommandEchoAndPrompt(output, "cat /etc/motd"),
        "admin@server:~/docs #"
      );
    });
    test("output ending with ] $ is preserved", () => {
      const output = [
        "user@host:~ $ echo 'values: [a, b] $'",
        "values: [a, b] $",
        "user@host:~ $"
      ].join("\n");
      assert.strictEqual(
        stripCommandEchoAndPrompt(output, "echo 'values: [a, b] $'"),
        "values: [a, b] $"
      );
    });
    test("multiple prompt-like output lines are all preserved", () => {
      const output = [
        "user@host:~ $ cat prompts.txt",
        "admin@server:~/docs $",
        "root@box:/var/log #",
        "test@dev:~ $",
        "user@host:~ $"
      ].join("\n");
      assert.strictEqual(
        stripCommandEchoAndPrompt(output, "cat prompts.txt"),
        "admin@server:~/docs $\nroot@box:/var/log #\ntest@dev:~ $"
      );
    });
    test("multi-line output where last line has $ after non-word chars is preserved", () => {
      const output = [
        "user@host:~ $ ./report.sh",
        "Revenue: 1000",
        "Currency: USD$",
        "user@host:~ $"
      ].join("\n");
      assert.strictEqual(
        stripCommandEchoAndPrompt(output, "./report.sh"),
        "Revenue: 1000\nCurrency: USD$"
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvc3RyYXRlZ3lIZWxwZXJzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQgfSBmcm9tICcuLi8uLi9icm93c2VyL2V4ZWN1dGVTdHJhdGVneS9zdHJhdGVneUhlbHBlcnMuanMnO1xuXG5zdWl0ZSgnc3RyaXBDb21tYW5kRWNob0FuZFByb21wdCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc3RyaXBzIHNpbmdsZS1saW5lIGNvbW1hbmQgZWNobyBhbmQgdHJhaWxpbmcgcHJvbXB0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdCd1c2VyQGhvc3Q6fi9zcmMgJCBlY2hvIGhlbGxvJyxcblx0XHRcdCdoZWxsbycsXG5cdFx0XHQndXNlckBob3N0On4vc3JjICQgJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICdlY2hvIGhlbGxvJyksXG5cdFx0XHQnaGVsbG8nXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIGNvbW1hbmQgZWNobyB3aXRoIHpzaC1zdHlsZSBwcm9tcHQgKF0gJCApJywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdCdzL3Rlc3RXb3Jrc3BhY2UgKG1haW4qKikgXSAkICB0cnVlJyxcblx0XHRcdCdbIGFsZXhAQWxleGFuZHJ1cy1NYWNCb29rLVBybzovVXNlcnMvYWxleC9zcmMvdnNjb2RlNC9leHRlbnNpb25zL3ZzY29kZS1hcGktdGVzdCcsXG5cdFx0XHQncy90ZXN0V29ya3NwYWNlIChtYWluKiopIF0gJCAnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJ3RydWUnKSxcblx0XHRcdCcnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIGFjdHVhbCBjb21tYW5kIG91dHB1dCBiZXR3ZWVuIGVjaG8gYW5kIHByb21wdCcsICgpID0+IHtcblx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHQncy90ZXN0V29ya3NwYWNlIChtYWluKiopIF0gJCAgZWNobyBNQVJLRVJfMTIzJyxcblx0XHRcdCdNQVJLRVJfMTIzJyxcblx0XHRcdCdbIGFsZXhAaG9zdDovc29tZS9wYXRoJyxcblx0XHRcdCdzL3Rlc3RXb3Jrc3BhY2UgKG1haW4qKikgXSAkICcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAnZWNobyBNQVJLRVJfMTIzJyksXG5cdFx0XHQnTUFSS0VSXzEyMydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgbXVsdGktbGluZSBjb21tYW5kIG91dHB1dCcsICgpID0+IHtcblx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHQndXNlckBob3N0On4gJCBlY2hvIGxpbmUxICYmIGVjaG8gbGluZTIgJiYgZWNobyBsaW5lMycsXG5cdFx0XHQnbGluZTEnLFxuXHRcdFx0J2xpbmUyJyxcblx0XHRcdCdsaW5lMycsXG5cdFx0XHQndXNlckBob3N0On4gJCAnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJ2VjaG8gbGluZTEgJiYgZWNobyBsaW5lMiAmJiBlY2hvIGxpbmUzJyksXG5cdFx0XHQnbGluZTFcXG5saW5lMlxcbmxpbmUzJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgZW1wdHkgb3V0cHV0IChuby1vdXRwdXQgY29tbWFuZCknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0J3MvdGVzdFdvcmtzcGFjZSAobWFpbioqKSBdICQgIHRydWUnLFxuXHRcdFx0J1sgYWxleEBob3N0Oi9Vc2Vycy9hbGV4L3NyYy92c2NvZGU0L2V4dGVuc2lvbnMvdnNjb2RlLWFwaS10ZXN0Jyxcblx0XHRcdCdzL3Rlc3RXb3Jrc3BhY2UgKG1haW4qKikgXSAkJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICd0cnVlJyksXG5cdFx0XHQnJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwcyBzYW5kYm94LXdyYXBwZWQgY29tbWFuZCBlY2hvIChsb25nIHdyYXBwZWQgbGluZXMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNhbmRib3hDb21tYW5kID0gJ0VMRUNUUk9OX1JVTl9BU19OT0RFPTEgUEFUSD1cIiRQQVRIOi9hcHAvcmcvYmluXCIgVE1QRElSPVwiL3RtcC9zYW5kYm94XCIgXCIvYXBwL3NhbmRib3gtcnVudGltZS9kaXN0L2NsaS5qc1wiIC0tc2V0dGluZ3MgXCIvdG1wL3NhbmRib3gtc2V0dGluZ3MuanNvblwiIC1jIFxcJ2N1cmwgLXMgaHR0cHM6Ly9leGFtcGxlLmNvbVxcJyc7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0J3MvdGVzdFdvcmtzcGFjZSAobWFpbioqKSBdICQgRUxFQ1RST05fUlVOX0FTX05PREU9MSBQQVRIPVwiJFBBVEg6L2FwcC9yZy9iaW5cIiBUJyxcblx0XHRcdCdNUERJUj1cIi90bXAvc2FuZGJveFwiIFwiL2FwcC9zYW5kYm94LXJ1bnRpbWUvZGlzdC9jbGkuanNcIiAtLXNldHRpbmdzIFwiL3RtcC9zYW5kJyxcblx0XHRcdCdib3gtc2V0dGluZ3MuanNvblwiIC1jIFxcJ2N1cmwgLXMgaHR0cHM6Ly9leGFtcGxlLmNvbVxcJycsXG5cdFx0XHQnWyBhbGV4QGhvc3Q6L1VzZXJzL2FsZXgvc3JjL3ZzY29kZTQvZXh0ZW5zaW9ucy92c2NvZGUtYXBpLXRlc3QnLFxuXHRcdFx0J3MvdGVzdFdvcmtzcGFjZSAobWFpbioqKSBdICQgJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsIHNhbmRib3hDb21tYW5kKSxcblx0XHRcdCcnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIHRyYWlsaW5nIHByb21wdCB3aXRoIHZhcmlvdXMgcHJvbXB0IHN0eWxlcycsICgpID0+IHtcblx0XHQvLyBiYXNoIHVzZXJAaG9zdDpwYXRoICRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KFxuXHRcdFx0XHRbJ3VzZXJAaG9zdDp+ICQgZWNobyBoZWxsbycsICdoZWxsbycsICd1c2VyQGhvc3Q6fiAkICddLmpvaW4oJ1xcbicpLFxuXHRcdFx0XHQnZWNobyBoZWxsbydcblx0XHRcdCksXG5cdFx0XHQnaGVsbG8nLFxuXHRcdFx0J0ZhaWxlZCBmb3IgYmFzaCAkIHByb21wdCdcblx0XHQpO1xuXHRcdC8vIHJvb3QgdXNlckBob3N0OnBhdGggI1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQoXG5cdFx0XHRcdFsncm9vdEBzZXJ2ZXI6L3Zhci9sb2cjIGVjaG8gaGVsbG8nLCAnaGVsbG8nLCAncm9vdEBzZXJ2ZXI6L3Zhci9sb2cjICddLmpvaW4oJ1xcbicpLFxuXHRcdFx0XHQnZWNobyBoZWxsbydcblx0XHRcdCksXG5cdFx0XHQnaGVsbG8nLFxuXHRcdFx0J0ZhaWxlZCBmb3Igcm9vdCAjIHByb21wdCdcblx0XHQpO1xuXHRcdC8vIGJyYWNrZXRlZCBwcm9tcHQgZW5kaW5nIHdpdGggXSAkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChcblx0XHRcdFx0WydzL3dvcmtzcGFjZSBdICQgZWNobyBoZWxsbycsICdoZWxsbycsICdzL3dvcmtzcGFjZSBdICQgJ10uam9pbignXFxuJyksXG5cdFx0XHRcdCdlY2hvIGhlbGxvJ1xuXHRcdFx0KSxcblx0XHRcdCdoZWxsbycsXG5cdFx0XHQnRmFpbGVkIGZvciBicmFja2V0ZWQgXSAkIHByb21wdCdcblx0XHQpO1xuXHRcdC8vIFBvd2VyU2hlbGwgUFMgQzpcXD5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KFxuXHRcdFx0XHRbJ1BTIEM6XFxcXFVzZXJzXFxcXHRlc3Q+IGVjaG8gaGVsbG8nLCAnaGVsbG8nLCAnUFMgQzpcXFxcVXNlcnNcXFxcdGVzdD4nXS5qb2luKCdcXG4nKSxcblx0XHRcdFx0J2VjaG8gaGVsbG8nXG5cdFx0XHQpLFxuXHRcdFx0J2hlbGxvJyxcblx0XHRcdCdGYWlsZWQgZm9yIFBvd2VyU2hlbGwgcHJvbXB0J1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHN0cmlwIG91dHB1dCBsaW5lcyBlbmRpbmcgd2l0aCBwcm9tcHQtbGlrZSBjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdC8vIE91dHB1dCBlbmRpbmcgd2l0aCAlIChlLmcuIHBlcmNlbnRhZ2UpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChcblx0XHRcdFx0Wyd1c2VyQGhvc3Q6fiAkIGVjaG8gXCIxMDAlXCInLCAnMTAwJScsICd1c2VyQGhvc3Q6fiAkICddLmpvaW4oJ1xcbicpLFxuXHRcdFx0XHQnZWNobyBcIjEwMCVcIidcblx0XHRcdCksXG5cdFx0XHQnMTAwJScsXG5cdFx0XHQnU2hvdWxkIG5vdCBzdHJpcCBsaW5lIGVuZGluZyB3aXRoICUnXG5cdFx0KTtcblx0XHQvLyBPdXRwdXQgZW5kaW5nIHdpdGggPiAoZS5nLiBIVE1MIG9yIGNvbXBhcmlzb24pXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChcblx0XHRcdFx0Wyd1c2VyQGhvc3Q6fiAkIGVjaG8gXCI8ZGl2PlwiJywgJzxkaXY+JywgJ3VzZXJAaG9zdDp+ICQgJ10uam9pbignXFxuJyksXG5cdFx0XHRcdCdlY2hvIFwiPGRpdj5cIidcblx0XHRcdCksXG5cdFx0XHQnPGRpdj4nLFxuXHRcdFx0J1Nob3VsZCBub3Qgc3RyaXAgbGluZSBlbmRpbmcgd2l0aCA+J1xuXHRcdCk7XG5cdFx0Ly8gT3V0cHV0IGVuZGluZyB3aXRoICMgKGUuZy4gY29tbWVudCBtYXJrZXIpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChcblx0XHRcdFx0Wyd1c2VyQGhvc3Q6fiAkIGVjaG8gXCJpdGVtICNcIicsICdpdGVtICMnLCAndXNlckBob3N0On4gJCAnXS5qb2luKCdcXG4nKSxcblx0XHRcdFx0J2VjaG8gXCJpdGVtICNcIidcblx0XHRcdCksXG5cdFx0XHQnaXRlbSAjJyxcblx0XHRcdCdTaG91bGQgbm90IHN0cmlwIGxpbmUgZW5kaW5nIHdpdGggIydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIGNvbW1hbmQgd2l0aCBsZWFkaW5nIHNwYWNlIChoaXN0b3J5IHByZXZlbnRpb24pJywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdCd1c2VyQGhvc3Q6fiAkICBlY2hvIGhlbGxvJyxcblx0XHRcdCdoZWxsbycsXG5cdFx0XHQndXNlckBob3N0On4gJCAnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHQvLyBUaGUgY29tbWFuZCBoYXMgYSBsZWFkaW5nIHNwYWNlIChmcm9tIENvbW1hbmRMaW5lUHJldmVudEhpc3RvcnlSZXdyaXRlcilcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJyBlY2hvIGhlbGxvJyksXG5cdFx0XHQnaGVsbG8nXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgc3RyaXAgYWN0dWFsIG91dHB1dCBsaW5lcyB0aGF0IGhhcHBlbiB0byBjb250YWluIHByb21wdCBjaGFycycsICgpID0+IHtcblx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHQndXNlckBob3N0On4gJCBlY2hvIFwicHJpY2UgaXMgJDVcIicsXG5cdFx0XHQncHJpY2UgaXMgJDUnLFxuXHRcdFx0J3VzZXJAaG9zdDp+ICQgJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICdlY2hvIFwicHJpY2UgaXMgJDVcIicpLFxuXHRcdFx0J3ByaWNlIGlzICQ1J1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgb3V0cHV0IHdpdGggbm8gdHJhaWxpbmcgcHJvbXB0IChlLmcuIGNvbW1hbmQgc3RpbGwgcnVubmluZyknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0J3VzZXJAaG9zdDp+ICQgZWNobyBoZWxsbycsXG5cdFx0XHQnaGVsbG8nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJ2VjaG8gaGVsbG8nKSxcblx0XHRcdCdoZWxsbydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIG91dHB1dCB3aXRoIG9ubHkgdGhlIGNvbW1hbmQgZWNobyBhbmQgbm8gcHJvbXB0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9ICd1c2VyQGhvc3Q6fiAkIHRydWUnO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICd0cnVlJyksXG5cdFx0XHQnJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgZW1wdHkgc3RyaW5nIGlucHV0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQoJycsICdlY2hvIGhlbGxvJyksXG5cdFx0XHQnJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgYmFzaCAtYyBzdWJzaGVsbCBjb21tYW5kIGVjaG8nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0J3MvdGVzdFdvcmtzcGFjZSAobWFpbioqKSBdICQgIGJhc2ggLWMgXCJleGl0IDQyXCInLFxuXHRcdFx0J1sgYWxleEBob3N0Oi9Vc2Vycy9hbGV4L3NyYy92c2NvZGU0L2V4dGVuc2lvbnMvdnNjb2RlLWFwaS10ZXN0Jyxcblx0XHRcdCdzL3Rlc3RXb3Jrc3BhY2UgKG1haW4qKikgXSAkICcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAnYmFzaCAtYyBcImV4aXQgNDJcIicpLFxuXHRcdFx0Jydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgd3JhcHBlZCBwcm9tcHQgbGluZXMgd2l0aCB1c2VyQGhvc3RuYW1lIHBhdHRlcm4nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0J3VzZXJAaG9zdDp+ICQgZWNobyBoaScsXG5cdFx0XHQnaGknLFxuXHRcdFx0J1sgYWxleEBBbGV4YW5kcnVzLU1hY0Jvb2stUHJvOi92ZXJ5L2xvbmcvcGF0aC90aGF0L3dyYXBzL2Fjcm9zcy90ZXJtaW5hbC9jb2wnLFxuXHRcdFx0J3VtbnMvaW4vdGhlL3Rlc3Qvd29ya3NwYWNlIF0gJCcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAnZWNobyBoaScpLFxuXHRcdFx0J2hpJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgUG93ZXJTaGVsbC1zdHlsZSBwcm9tcHQgKFBTIEM6XFxcXD4pJywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdCdQUyBDOlxcXFxVc2Vyc1xcXFx0ZXN0PiBlY2hvIGhlbGxvJyxcblx0XHRcdCdoZWxsbycsXG5cdFx0XHQnUFMgQzpcXFxcVXNlcnNcXFxcdGVzdD4nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJ2VjaG8gaGVsbG8nKSxcblx0XHRcdCdoZWxsbydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgc3RhbGUgcHJvbXB0IGZyYWdtZW50cyBhbmQgXkMgcmVzaWR1ZSBiZWZvcmUgY29tbWFuZCBlY2hvJywgKCkgPT4ge1xuXHRcdC8vIFNpbXVsYXRlcyBDSSBlbnZpcm9ubWVudCB3aGVyZSBwcmV2aW91cyBeQyBwcm9kdWNlcyBzdGFsZSBwcm9tcHRcblx0XHQvLyBmcmFnbWVudHMgYmVmb3JlIHRoZSBhY3R1YWwgY29tbWFuZCBlY2hvIGxpbmVcblx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHQndHMvdGVzdFdvcmtzcGFjZSQgXkMnLFxuXHRcdFx0J2Nsb3VkdGVzdEA1YWM2YjAyM2MwMDAwMDA6L21udC92c3MvX3dvcmsvdnNjb2RlL3ZzY29kZS9leHRlbnNpb25zL3ZzY29kZS1hcGktdGVzJyxcblx0XHRcdCd0cy90ZXN0V29ya3NwYWNlJCAgZWNobyBNQVJLRVJfMTIzJyxcblx0XHRcdCdNQVJLRVJfMTIzJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICdlY2hvIE1BUktFUl8xMjMnKSxcblx0XHRcdCdNQVJLRVJfMTIzJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwcyBzdGFsZSBwcm9tcHQgZnJhZ21lbnRzIGZvciBuby1vdXRwdXQgY29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHQndHMvdGVzdFdvcmtzcGFjZSQgXkMnLFxuXHRcdFx0J2Nsb3VkdGVzdEA1YWM2YjAyM2MwMDAwMDA6L21udC92c3MvX3dvcmsvdnNjb2RlL3ZzY29kZS9leHRlbnNpb25zL3ZzY29kZS1hcGktdGVzJyxcblx0XHRcdCd0cy90ZXN0V29ya3NwYWNlJCAgdHJ1ZScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAndHJ1ZScpLFxuXHRcdFx0Jydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgc3RhbGUgcHJvbXB0IGZyYWdtZW50cyBmb3IgbXVsdGktbGluZSBvdXRwdXQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0J3RzL3Rlc3RXb3Jrc3BhY2UkIF5DJyxcblx0XHRcdCdjbG91ZHRlc3RANWFjNmIwMjNjMDAwMDAwOi9tbnQvdnNzL193b3JrL3ZzY29kZS92c2NvZGUvZXh0ZW5zaW9ucy92c2NvZGUtYXBpLXRlcycsXG5cdFx0XHQndHMvdGVzdFdvcmtzcGFjZSQgIGVjaG8gTTEgJiYgZWNobyBNMiAmJiBlY2hvIE0zJyxcblx0XHRcdCdNMScsXG5cdFx0XHQnTTInLFxuXHRcdFx0J00zJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICdlY2hvIE0xICYmIGVjaG8gTTIgJiYgZWNobyBNMycpLFxuXHRcdFx0J00xXFxuTTJcXG5NMydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgdHJhaWxpbmcgcHJvbXB0IHdpdGhvdXQgQCAoaG9zdG5hbWU6cGF0aCB1c2VyJCknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0J2RzbTEyLWJlMjIwLWFiYzp0ZXN0V29ya3NwYWNlIHJ1bm5lciQgIGVjaG8gaGVsbG8nLFxuXHRcdFx0J2hlbGxvJyxcblx0XHRcdCdkc20xMi1iZTIyMC1hYmM6dGVzdFdvcmtzcGFjZSBydW5uZXIkJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICdlY2hvIGhlbGxvJyksXG5cdFx0XHQnaGVsbG8nXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIHdyYXBwZWQgdHJhaWxpbmcgcHJvbXB0IHdpdGhvdXQgQCAoaG9zdG5hbWU6cGF0aCArIGZyYWdtZW50JCknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0J2RzbTEyLWJlMjIwLWFiYzp0ZXN0V29ya3NwYWNlIHJ1bm5lciQgIGVjaG8gaGVsbG8nLFxuXHRcdFx0J2hlbGxvJyxcblx0XHRcdCdkc20xMi1iZTIyMC04NjI3ZWE3Zi0yYzVhLTQwY2QtOGJhMS1iZjMyNGJiNGY1OWEtREEzNUMwODA5NDJFOnRlc3RXb3Jrc3BhY2UgcnVubicsXG5cdFx0XHQnZXIkJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICdlY2hvIGhlbGxvJyksXG5cdFx0XHQnaGVsbG8nXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIHdyYXBwZWQgdHJhaWxpbmcgcHJvbXB0IHdpdGggcGF0aC1saWtlIGZyYWdtZW50ICh0cy90ZXN0V29ya3NwYWNlJCknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0J3VzZXJAaG9zdDp+ICQgZWNobyBoZWxsbycsXG5cdFx0XHQnaGVsbG8nLFxuXHRcdFx0J2Nsb3VkdGVzdEBkNGIwZDg4MWMwMDAwMDA6L21udC92c3MvX3dvcmsvdnNjb2RlL3ZzY29kZS9leHRlbnNpb25zL3ZzY29kZS1hcGktdGVzJyxcblx0XHRcdCd0cy90ZXN0V29ya3NwYWNlJCcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAnZWNobyBoZWxsbycpLFxuXHRcdFx0J2hlbGxvJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwcyB0cmFpbGluZyBwcm9tcHQgZnJhZ21lbnQgZm9yIG5vLW91dHB1dCBjb21tYW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdCdkc20xMi1iZTIyMC1hYmM6dGVzdFdvcmtzcGFjZSBydW5uZXIkICB0cnVlJyxcblx0XHRcdCdkc20xMi1iZTIyMC04NjI3ZWE3Zi0yYzVhLTQwY2QtOGJhMS1iZjMyNGJiNGY1OWEtREEzNUMwODA5NDJFOnRlc3RXb3Jrc3BhY2UgcnVubicsXG5cdFx0XHQnZXIkJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICd0cnVlJyksXG5cdFx0XHQnJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwcyBtaWQtd29yZCB3cmFwcGVkIGNvbW1hbmQgY29udGludWF0aW9uIChQb3dlclNoZWxsL1dpbmRvd3MpJywgKCkgPT4ge1xuXHRcdC8vIFBvd2VyU2hlbGwgd3JhcHMgXCJlY2hvIE1BUktFUl8xMjNfRUNIT1wiIGFjcm9zcyBsaW5lcyBhdCBjb2x1bW4gYm91bmRhcnlcblx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHQnUFMgRDpcXFxcYVxcXFxfd29ya1xcXFx2c2NvZGVcXFxcdGVzdFdvcmtzcGFjZT4gZWNobyBNQVJLJyxcblx0XHRcdCdFUl8xMjNfRUNITycsXG5cdFx0XHQnTUFSS0VSXzEyM19FQ0hPJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICdlY2hvIE1BUktFUl8xMjNfRUNITycpLFxuXHRcdFx0J01BUktFUl8xMjNfRUNITydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgUG93ZXJTaGVsbCBwcm9tcHQgZnJvbSBnZXRPdXRwdXQoKSByZXN1bHQnLCAoKSA9PiB7XG5cdFx0Ly8gV2hlbiBzaGVsbCBpbnRlZ3JhdGlvbiBtYXJrZXJzIG1pc2ZpcmUsIGdldE91dHB1dCgpIGluY2x1ZGVzIHRoZSBwcm9tcHQgKyBjb21tYW5kXG5cdFx0Y29uc3Qgb3V0cHV0ID0gJ1BTIEQ6XFxcXGFcXFxcX3dvcmtcXFxcdnNjb2RlXFxcXHRlc3RXb3Jrc3BhY2U+IGNtZCAvYyBleGl0IDQyJztcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAnY21kIC9jIGV4aXQgNDInKSxcblx0XHRcdCcnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIHBhcnRpYWwgY29tbWFuZCBlY2hvIChzdWZmaXggZnJvbSB3cmFwcGVkIGdldE91dHB1dCknLCAoKSA9PiB7XG5cdFx0Ly8gV2hlbiBnZXRPdXRwdXQoKSBkb2Vzbid0IGluY2x1ZGUgdGhlIHByb21wdCBsaW5lLCBvbmx5IHRoZSB3cmFwcGVkXG5cdFx0Ly8gY29udGludWF0aW9uIG9mIHRoZSBjb21tYW5kIGVjaG8gYXBwZWFycyBhdCB0aGUgc3RhcnQgb2YgdGhlIG91dHB1dC5cblx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHQnOTA3NDEgOyBlY2hvIE0yXzE3NzQxMzMxOTA3NDEgOyBlY2hvIE0zXzE3NzQxMzMxOTA3NDEnLFxuXHRcdFx0J00xXzE3NzQxMzMxOTA3NDEnLFxuXHRcdFx0J00yXzE3NzQxMzMxOTA3NDEnLFxuXHRcdFx0J00zXzE3NzQxMzMxOTA3NDEnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJ2VjaG8gTTFfMTc3NDEzMzE5MDc0MSA7IGVjaG8gTTJfMTc3NDEzMzE5MDc0MSA7IGVjaG8gTTNfMTc3NDEzMzE5MDc0MScpLFxuXHRcdFx0J00xXzE3NzQxMzMxOTA3NDFcXG5NMl8xNzc0MTMzMTkwNzQxXFxuTTNfMTc3NDEzMzE5MDc0MSdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgYnJhY2tldGVkIHByb21wdCB3aXRob3V0IEAgKGhvc3RuYW1lOnBhdGggZm9ybWF0KScsICgpID0+IHtcblx0XHQvLyBtYWNPUyBDSSBwcm9tcHQ6IFtob3N0bmFtZTpwYXRoXSB1c2VybmFtZSQgKHdyYXBwZWQgc28gdXNlcm5hbWUgaXMgdHJ1bmNhdGVkKVxuXHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdCdbVzAwN0RWOVBGOS0xOn4vdnNzL193b3JrLzEvcy9leHRlbnNpb25zL3ZzY29kZS1hcGktdGVzdHMvdGVzdFdvcmtzcGFjZV0gY2xvdWR0ZScsXG5cdFx0XHQnc3QkJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICd0cnVlJyksXG5cdFx0XHQnJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwcyBicmFja2V0ZWQgcHJvbXB0IHdpdGhvdXQgQCAoc2luZ2xlIGxpbmUsIG5vIHRyYWlsaW5nICQpJywgKCkgPT4ge1xuXHRcdC8vIFdoZW4gdGhlIHRlcm1pbmFsIGNhcHR1cmVzIGp1c3QgdGhlIHByb21wdCAobm8tb3V0cHV0IGNvbW1hbmQpXG5cdFx0Y29uc3Qgb3V0cHV0ID0gJ1tXMDA3RFY5UEY5LTE6fi92c3MvX3dvcmsvMS9zL2V4dGVuc2lvbnMvdnNjb2RlLWFwaS10ZXN0cy90ZXN0V29ya3NwYWNlXSBjbG91ZHRlJztcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAndHJ1ZScpLFxuXHRcdFx0Jydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgYnJhY2tldGVkIHByb21wdCB3aXRob3V0IEAgd2l0aCBjb21tYW5kIGVjaG8nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0J1tXMDA3RFY5UEY5LTE6fi92c3MvX3dvcmtdIGNsb3VkdGVzdCQgIGVjaG8gTUFSS0VSXzEyMycsXG5cdFx0XHQnTUFSS0VSXzEyMycsXG5cdFx0XHQnW1cwMDdEVjlQRjktMTp+L3Zzcy9fd29ya10gY2xvdWR0ZXN0JCcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAnZWNobyBNQVJLRVJfMTIzJyksXG5cdFx0XHQnTUFSS0VSXzEyMydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgc2FuZGJveC13cmFwcGVkIGNvbW1hbmQgZWNobyB3aXRoIGVycm9yIG91dHB1dCBhbmQgdHJhaWxpbmcgcHJvbXB0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gJ0VMRUNUUk9OX1JVTl9BU19OT0RFPTEgUEFUSD1cIiRQQVRIOi9Vc2Vycy9hbGV4L3NyYy92c2NvZGU0L25vZGVfbW9kdWxlcy9AdnNjb2RlL3JpcGdyZXAvYmluXCIgVE1QRElSPVwiL1VzZXJzL2FsZXgvLnZzY29kZS1vc3MtZGV2L3RtcFwiIENMQVVERV9UTVBESVI9XCIvVXNlcnMvYWxleC8udnNjb2RlLW9zcy1kZXYvdG1wXCIgXCIvVXNlcnMvYWxleC9zcmMvdnNjb2RlNC9ub2RlX21vZHVsZXMvQHZzY29kZS9zYW5kYm94LXJ1bnRpbWUvZGlzdC9jbGkuanNcIiAtLXNldHRpbmdzIFwiL1VzZXJzL2FsZXgvLnZzY29kZS1vc3MtZGV2L3RtcC92c2NvZGUtc2FuZGJveC1zZXR0aW5ncy1jZjViNjIzMi04MjViLTRmNGMtODkwMi0zMmE4NTkxMDA3ZmQuanNvblwiIC1jIFxcJyBlY2hvIFwiU0FOREJPWF9UTVBfMTc3NDEyNzQwOTA3NlwiID4gL3RtcC9TQU5EQk9YX1RNUF8xNzc0MTI3NDA5MDc2LnR4dFxcJyc7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0J0VMRUNUUk9OX1JVTl9BU19OT0RFPTEgUEFUSD1cIiRQQVRIOi9Vc2Vycy9hbGV4L3NyYy92c2NvZGU0L25vZGVfbW9kdWxlcy9AdnNjb2RlLycsXG5cdFx0XHQncmlwZ3JlcC9iaW5cIiBUTVBESVI9XCIvVXNlcnMvYWxleC8udnNjb2RlLW9zcy1kZXYvdG1wXCIgQ0xBVURFX1RNUERJUj1cIi9Vc2Vycy9hbGV4Jyxcblx0XHRcdCcvLnZzY29kZS1vc3MtZGV2L3RtcFwiIFwiL1VzZXJzL2FsZXgvc3JjL3ZzY29kZTQvbm9kZV9tb2R1bGVzL0B2c2NvZGUvc2FuZGJveC0nLFxuXHRcdFx0J3J1bnRpbWUvZGlzdC9jbGkuanNcIiAtLXNldHRpbmdzIFwiL1VzZXJzL2FsZXgvLnZzY29kZS1vc3MtZGV2L3RtcC92c2NvZGUtc2FuZGJvJyxcblx0XHRcdCd4LXNldHRpbmdzLWNmNWI2MjMyLTgyNWItNGY0Yy04OTAyLTMyYTg1OTEwMDdmZC5qc29uXCIgLWMgXFwnIGVjaG8gXCJTQU5EQk9YX1RNUF8xNzcnLFxuXHRcdFx0JzQxMjc0MDkwNzZcIiA+IC90bXAvU0FOREJPWF9UTVBfMTc3NDEyNzQwOTA3Ni50eHRcXCcnLFxuXHRcdFx0J1sgYWxleEBBbGV4YW5kcnVzLU1hY0Jvb2stUHJvOi9Vc2Vycy9hbGV4L3NyYy92c2NvZGU0L2V4dGVuc2lvbnMvdnNjb2RlLWFwaS10ZXN0Jyxcblx0XHRcdCdzL3Rlc3RXb3Jrc3BhY2UgKGFsZXhkaW1hL2ZpeC0zMDM1MzEtc2FuZGJveC1uby1vdXRwdXQtbGVhayoqKSBdICQgRUxFQ1RST05fUlVOXycsXG5cdFx0XHQnQVNfTk9ERT0xIFBBVEg9XCIkUEFUSDovVXNlcnMvYWxleC9zcmMvdnNjb2RlNC9ub2RlX21vZHVsZXMvQHZzY29kZS9yaXBncmVwL2JpblwiICcsXG5cdFx0XHQnVE1QRElSPVwiL1VzZXJzL2FsZXgvLnZzY29kZS1vc3MtZGV2L3RtcFwiIENMQVVERV9UTVBESVI9XCIvVXNlcnMvYWxleC8udnNjb2RlLW9zcy0nLFxuXHRcdFx0J2Rldi90bXBcIiBcIi9Vc2Vycy9hbGV4L3NyYy92c2NvZGU0L25vZGVfbW9kdWxlcy9AdnNjb2RlL3NhbmRib3gtcnVudGltZS9kaXMnLFxuXHRcdFx0J3QvY2xpLmpzXCIgLS1zZXR0aW5ncyBcIi9Vc2Vycy9hbGV4Ly52c2NvZGUtb3NzLWRldi90bXAvdnNjb2RlLXNhbmRib3gtc2V0dGluZ3MtY2YnLFxuXHRcdFx0JzViNjIzMi04MjViLTRmNGMtODkwMi0zMmE4NTkxMDA3ZmQuanNvblwiIC1jIFxcJyBlY2hvIFwiU0FOREJPWF9UTVBfMTc3NDEyNzQwOTA3NlwiID4nLFxuXHRcdFx0JyAvdG1wL1NBTkRCT1hfVE1QXzE3NzQxMjc0MDkwNzYudHh0XFwnJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsIGNvbW1hbmRMaW5lKSxcblx0XHRcdCcnXG5cdFx0KTtcblx0fSk7XG5cblx0Ly8gLS0tIEFkdmVyc2FyaWFsIHRlc3RzOiBvdXRwdXQgdGhhdCBsb29rcyBsaWtlIHByb21wdHMgLS0tXG5cdC8vIFRoZXNlIHZlcmlmeSB0aGF0IHJlYWxpc3RpYyBvdXRwdXQgaXMgTk9UIGZhbHNlbHkgc3RyaXBwZWQuXG5cblx0c3VpdGUoJ2FkdmVyc2FyaWFsOiBvdXRwdXQgcmVzZW1ibGluZyBwcm9tcHRzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnb3V0cHV0IGVuZGluZyB3aXRoICQgaXMgcHJlc2VydmVkIChub3QgY29uZnVzZWQgd2l0aCB3cmFwcGVkIHByb21wdCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHRcdCd1c2VyQGhvc3Q6fiAkIGVjaG8gXFwndGVzdCRcXCcnLFxuXHRcdFx0XHQndGVzdCQnLFxuXHRcdFx0XHQndXNlckBob3N0On4gJCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHQvLyAndXNlckBob3N0On4gJCcgaXMgYSBjb21wbGV0ZSBwcm9tcHQgXHUyMTkyIHN0cmlwcGVkIGFuZCBsb29wIHN0b3BzLlxuXHRcdFx0Ly8gJ3Rlc3QkJyBpcyBwcmVzZXJ2ZWQgYmVjYXVzZSBub3RoaW5nIGFib3ZlIGEgY29tcGxldGUgcHJvbXB0IGlzIHN0cmlwcGVkLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJ2VjaG8gXFwndGVzdCRcXCcnKSxcblx0XHRcdFx0J3Rlc3QkJ1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ291dHB1dCBlbmRpbmcgd2l0aCAjIGlzIHByZXNlcnZlZCAobm90IGNvbmZ1c2VkIHdpdGggd3JhcHBlZCBwcm9tcHQpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0XHQndXNlckBob3N0On4gJCBlY2hvIFxcJ2RpdiNcXCcnLFxuXHRcdFx0XHQnZGl2IycsXG5cdFx0XHRcdCd1c2VyQGhvc3Q6fiAkJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICdlY2hvIFxcJ2RpdiNcXCcnKSxcblx0XHRcdFx0J2RpdiMnXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYnJhY2tldGVkIGxvZyBvdXRwdXQgW3RhZzp+L3BhdGhdIGlzIHByZXNlcnZlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdFx0J3VzZXJAaG9zdDp+ICQgbm9kZSBidWlsZC5qcycsXG5cdFx0XHRcdCdbYnVpbGQ6fi9kaXN0XSBjb21waWxlZCBzdWNjZXNzZnVsbHknLFxuXHRcdFx0XHQndXNlckBob3N0On4gJCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAnbm9kZSBidWlsZC5qcycpLFxuXHRcdFx0XHQnW2J1aWxkOn4vZGlzdF0gY29tcGlsZWQgc3VjY2Vzc2Z1bGx5J1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ291dHB1dCBjb250YWluaW5nIHVzZXJAaG9zdDpwYXRoIGVuZGluZyB3aXRoICMgaXMgcHJlc2VydmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0XHQndXNlckBob3N0On4gJCBjYXQgL2V0Yy9tb3RkJyxcblx0XHRcdFx0J2FkbWluQHNlcnZlcjp+L2RvY3MgIycsXG5cdFx0XHRcdCd1c2VyQGhvc3Q6fiAkJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICdjYXQgL2V0Yy9tb3RkJyksXG5cdFx0XHRcdCdhZG1pbkBzZXJ2ZXI6fi9kb2NzICMnXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb3V0cHV0IGVuZGluZyB3aXRoIF0gJCBpcyBwcmVzZXJ2ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHRcdCd1c2VyQGhvc3Q6fiAkIGVjaG8gXFwndmFsdWVzOiBbYSwgYl0gJFxcJycsXG5cdFx0XHRcdCd2YWx1ZXM6IFthLCBiXSAkJyxcblx0XHRcdFx0J3VzZXJAaG9zdDp+ICQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJ2VjaG8gXFwndmFsdWVzOiBbYSwgYl0gJFxcJycpLFxuXHRcdFx0XHQndmFsdWVzOiBbYSwgYl0gJCdcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aXBsZSBwcm9tcHQtbGlrZSBvdXRwdXQgbGluZXMgYXJlIGFsbCBwcmVzZXJ2ZWQnLCAoKSA9PiB7XG5cdFx0XHQvLyBDb21wbGV0ZSBwcm9tcHQgYXQgdGhlIGJvdHRvbSBzdG9wcyBzdHJpcHBpbmcgaW1tZWRpYXRlbHksXG5cdFx0XHQvLyBzbyBhbGwgcHJvbXB0LWxpa2Ugb3V0cHV0IGxpbmVzIGFib3ZlIGFyZSBwcmVzZXJ2ZWQuXG5cdFx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHRcdCd1c2VyQGhvc3Q6fiAkIGNhdCBwcm9tcHRzLnR4dCcsXG5cdFx0XHRcdCdhZG1pbkBzZXJ2ZXI6fi9kb2NzICQnLFxuXHRcdFx0XHQncm9vdEBib3g6L3Zhci9sb2cgIycsXG5cdFx0XHRcdCd0ZXN0QGRldjp+ICQnLFxuXHRcdFx0XHQndXNlckBob3N0On4gJCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAnY2F0IHByb21wdHMudHh0JyksXG5cdFx0XHRcdCdhZG1pbkBzZXJ2ZXI6fi9kb2NzICRcXG5yb290QGJveDovdmFyL2xvZyAjXFxudGVzdEBkZXY6fiAkJ1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpLWxpbmUgb3V0cHV0IHdoZXJlIGxhc3QgbGluZSBoYXMgJCBhZnRlciBub24td29yZCBjaGFycyBpcyBwcmVzZXJ2ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHRcdCd1c2VyQGhvc3Q6fiAkIC4vcmVwb3J0LnNoJyxcblx0XHRcdFx0J1JldmVudWU6IDEwMDAnLFxuXHRcdFx0XHQnQ3VycmVuY3k6IFVTRCQnLFxuXHRcdFx0XHQndXNlckBob3N0On4gJCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAnLi9yZXBvcnQuc2gnKSxcblx0XHRcdFx0J1JldmVudWU6IDEwMDBcXG5DdXJyZW5jeTogVVNEJCdcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxpQ0FBaUM7QUFFMUMsTUFBTSw2QkFBNkIsTUFBTTtBQUN4QywwQ0FBd0M7QUFFeEMsT0FBSyx1REFBdUQsTUFBTTtBQUNqRSxVQUFNLFNBQVM7QUFBQSxNQUNkO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEVBQUUsS0FBSyxJQUFJO0FBRVgsV0FBTztBQUFBLE1BQ04sMEJBQTBCLFFBQVEsWUFBWTtBQUFBLE1BQzlDO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssb0RBQW9ELE1BQU07QUFDOUQsVUFBTSxTQUFTO0FBQUEsTUFDZDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtBQUssSUFBSTtBQUVYLFdBQU87QUFBQSxNQUNOLDBCQUEwQixRQUFRLE1BQU07QUFBQSxNQUN4QztBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDJEQUEyRCxNQUFNO0FBQ3JFLFVBQU0sU0FBUztBQUFBLE1BQ2Q7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEVBQUUsS0FBSyxJQUFJO0FBRVgsV0FBTztBQUFBLE1BQ04sMEJBQTBCLFFBQVEsaUJBQWlCO0FBQUEsTUFDbkQ7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxVQUFNLFNBQVM7QUFBQSxNQUNkO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsRUFBRSxLQUFLLElBQUk7QUFFWCxXQUFPO0FBQUEsTUFDTiwwQkFBMEIsUUFBUSx3Q0FBd0M7QUFBQSxNQUMxRTtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxP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
