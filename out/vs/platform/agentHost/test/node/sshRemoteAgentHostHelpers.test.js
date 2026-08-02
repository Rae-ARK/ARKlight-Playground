import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { createRemoteAgentHostState } from "../../common/remoteAgentHostMetadata.js";
import { PROTOCOL_VERSION } from "../../common/state/protocol/version/registry.js";
import {
  buildAgentHostBaseCommand,
  buildCLIDownloadUrl,
  buildCleanupOldCLIsCommand,
  buildFindFallbackCLICommand,
  cleanupRemoteAgentHost,
  findRunningAgentHost,
  getAgentHostLockfile,
  getRemoteCLIArchiveName,
  getRemoteCLIBin,
  getRemoteCLIDataDir,
  getRemoteCLIInstallRoot,
  isValidFallbackCLIPath,
  redactToken,
  resolveRemotePlatform,
  shellEscape,
  validateCommit,
  validateShellToken,
  writeAgentHostState
} from "../../node/sshRemoteAgentHostHelpers.js";
suite("SSH Remote Agent Host Helpers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const logService = new NullLogService();
  const serverDataFolderName = ".vscode-server-insiders";
  const quality = "insider";
  const lockfilePath = "~/.vscode-server-insiders/cli/agent-host-insider.lock";
  function stateJson(pid, port, connectionToken) {
    return JSON.stringify(createRemoteAgentHostState({
      pid,
      port,
      connectionToken: connectionToken ?? void 0,
      quality
    }));
  }
  suite("validateShellToken", () => {
    test("accepts alphanumeric strings", () => {
      assert.strictEqual(validateShellToken("insider", "quality"), "insider");
      assert.strictEqual(validateShellToken("stable", "quality"), "stable");
      assert.strictEqual(validateShellToken("exploration", "quality"), "exploration");
    });
    test("accepts dots, dashes, and underscores", () => {
      assert.strictEqual(validateShellToken("my-build_1.0", "quality"), "my-build_1.0");
    });
    test("rejects strings with spaces", () => {
      assert.throws(() => validateShellToken("foo bar", "quality"), /Unsafe quality/);
    });
    test("rejects strings with shell metacharacters", () => {
      assert.throws(() => validateShellToken("foo;rm -rf /", "quality"), /Unsafe quality/);
      assert.throws(() => validateShellToken("$(whoami)", "quality"), /Unsafe quality/);
      assert.throws(() => validateShellToken("foo'bar", "quality"), /Unsafe quality/);
    });
    test("rejects empty string", () => {
      assert.throws(() => validateShellToken("", "quality"), /Unsafe quality/);
    });
  });
  suite("validateCommit", () => {
    test("accepts a 40-char lowercase hex SHA", () => {
      const c = "abcdef0123456789abcdef0123456789abcdef01";
      assert.strictEqual(validateCommit(c), c);
    });
    test("normalizes uppercase hex to lowercase", () => {
      assert.strictEqual(
        validateCommit("ABCDEF0123456789ABCDEF0123456789ABCDEF01"),
        "abcdef0123456789abcdef0123456789abcdef01"
      );
    });
    test("rejects non-hex characters", () => {
      assert.throws(() => validateCommit("g".repeat(40)), /Unsafe commit/);
      assert.throws(() => validateCommit("abcdef0123456789abcdef0123456789abcdef0z"), /Unsafe commit/);
    });
    test("rejects wrong-length values", () => {
      assert.throws(() => validateCommit("abc"), /Unsafe commit/);
      assert.throws(() => validateCommit("a".repeat(41)), /Unsafe commit/);
      assert.throws(() => validateCommit(""), /Unsafe commit/);
    });
    test("rejects shell metacharacters", () => {
      assert.throws(() => validateCommit("foo;rm"), /Unsafe commit/);
      assert.throws(() => validateCommit("a".repeat(39) + "$"), /Unsafe commit/);
    });
  });
  suite("getRemoteCLIArchiveName", () => {
    test("returns code for stable", () => {
      assert.strictEqual(getRemoteCLIArchiveName("stable"), "code");
    });
    test("returns code-insiders for insider", () => {
      assert.strictEqual(getRemoteCLIArchiveName("insider"), "code-insiders");
    });
    test("returns code-exploration for exploration", () => {
      assert.strictEqual(getRemoteCLIArchiveName("exploration"), "code-exploration");
    });
    test("falls back to code-insiders for unknown qualities", () => {
      assert.strictEqual(getRemoteCLIArchiveName("weirdbuild"), "code-insiders");
    });
    test("rejects unsafe quality strings", () => {
      assert.throws(() => getRemoteCLIArchiveName("foo bar"), /Unsafe quality/);
    });
  });
  suite("getRemoteCLIInstallRoot", () => {
    test("returns user-home anchored path under the server data folder", () => {
      assert.strictEqual(getRemoteCLIInstallRoot(".vscode-server-insiders"), "~/.vscode-server-insiders");
    });
    test("rejects unsafe server data folder names", () => {
      assert.throws(() => getRemoteCLIInstallRoot("foo bar"), /Unsafe server data folder name/);
      assert.throws(() => getRemoteCLIInstallRoot("foo/bar"), /Unsafe server data folder name/);
      assert.throws(() => getRemoteCLIInstallRoot("$(whoami)"), /Unsafe server data folder name/);
    });
  });
  suite("getRemoteCLIDataDir", () => {
    test("returns the `cli` subdir under the install root", () => {
      assert.strictEqual(getRemoteCLIDataDir(".vscode-server"), "~/.vscode-server/cli");
      assert.strictEqual(getRemoteCLIDataDir(".vscode-server-insiders"), "~/.vscode-server-insiders/cli");
    });
    test("rejects unsafe server data folder names", () => {
      assert.throws(() => getRemoteCLIDataDir("foo;rm"), /Unsafe server data folder name/);
    });
  });
  suite("buildAgentHostBaseCommand", () => {
    test("includes --cli-data-dir before the agent host subcommand", () => {
      const cmd = buildAgentHostBaseCommand("~/.vscode-server/code-insiders-abc", "~/.vscode-server/cli");
      assert.strictEqual(cmd, "~/.vscode-server/code-insiders-abc --cli-data-dir ~/.vscode-server/cli agent host --port 0");
    });
  });
  suite("getRemoteCLIBin", () => {
    const commit = "abcdef0123456789abcdef0123456789abcdef01";
    test("returns commit-keyed path under shared install root for stable", () => {
      assert.strictEqual(
        getRemoteCLIBin(".vscode-server", "stable", commit),
        `~/.vscode-server/code-${commit}`
      );
    });
    test("returns commit-keyed path for insider", () => {
      assert.strictEqual(
        getRemoteCLIBin(".vscode-server-insiders", "insider", commit),
        `~/.vscode-server-insiders/code-insiders-${commit}`
      );
    });
    test("returns commit-keyed path for exploration", () => {
      assert.strictEqual(
        getRemoteCLIBin(".vscode-server-exploration", "exploration", commit),
        `~/.vscode-server-exploration/code-exploration-${commit}`
      );
    });
    test("returns non-keyed path when commit is undefined (dev build)", () => {
      assert.strictEqual(
        getRemoteCLIBin(".vscode-server-oss", "insider"),
        "~/.vscode-server-oss/code-insiders"
      );
      assert.strictEqual(
        getRemoteCLIBin(".vscode-server", "stable"),
        "~/.vscode-server/code"
      );
    });
    test("rejects unsafe commit values", () => {
      assert.throws(() => getRemoteCLIBin(".vscode-server", "stable", "foo;rm"), /Unsafe commit/);
    });
    test("normalizes uppercase hex commits to lowercase", () => {
      const upper = "ABCDEF0123456789ABCDEF0123456789ABCDEF01";
      assert.strictEqual(
        getRemoteCLIBin(".vscode-server", "stable", upper),
        "~/.vscode-server/code-abcdef0123456789abcdef0123456789abcdef01"
      );
    });
    test("rejects unsafe server data folder names", () => {
      assert.throws(() => getRemoteCLIBin("foo bar", "stable", commit), /Unsafe server data folder name/);
    });
  });
  suite("shellEscape", () => {
    test("wraps simple string in single quotes", () => {
      assert.strictEqual(shellEscape("hello"), "'hello'");
    });
    test("escapes embedded single quotes", () => {
      assert.strictEqual(shellEscape("it's"), "'it'\\''s'");
    });
    test("handles empty string", () => {
      assert.strictEqual(shellEscape(""), "''");
    });
    test("passes through special chars safely wrapped", () => {
      assert.strictEqual(shellEscape("$(rm -rf /)"), "'$(rm -rf /)'");
    });
  });
  suite("resolveRemotePlatform", () => {
    test("detects Linux x64", () => {
      assert.deepStrictEqual(resolveRemotePlatform("Linux", "x86_64"), { os: "linux", arch: "x64" });
    });
    test("detects Linux amd64", () => {
      assert.deepStrictEqual(resolveRemotePlatform("Linux", "amd64"), { os: "linux", arch: "x64" });
    });
    test("detects Linux arm64 (aarch64)", () => {
      assert.deepStrictEqual(resolveRemotePlatform("Linux", "aarch64"), { os: "linux", arch: "arm64" });
    });
    test("detects Linux arm64", () => {
      assert.deepStrictEqual(resolveRemotePlatform("Linux", "arm64"), { os: "linux", arch: "arm64" });
    });
    test("detects Linux armhf", () => {
      assert.deepStrictEqual(resolveRemotePlatform("Linux", "armv7l"), { os: "linux", arch: "armhf" });
    });
    test("detects Darwin x64", () => {
      assert.deepStrictEqual(resolveRemotePlatform("Darwin", "x86_64"), { os: "darwin", arch: "x64" });
    });
    test("detects Darwin arm64", () => {
      assert.deepStrictEqual(resolveRemotePlatform("Darwin", "arm64"), { os: "darwin", arch: "arm64" });
    });
    test("handles whitespace in uname output", () => {
      assert.deepStrictEqual(resolveRemotePlatform("  Linux\n", "  x86_64\n"), { os: "linux", arch: "x64" });
    });
    test("returns undefined for Windows", () => {
      assert.strictEqual(resolveRemotePlatform("MINGW64_NT-10.0-19041", "x86_64"), void 0);
    });
    test("returns undefined for unknown OS", () => {
      assert.strictEqual(resolveRemotePlatform("FreeBSD", "amd64"), void 0);
    });
    test("returns undefined for unknown arch", () => {
      assert.strictEqual(resolveRemotePlatform("Linux", "ppc64le"), void 0);
    });
  });
  suite("buildCLIDownloadUrl", () => {
    const commit = "abcdef0123456789abcdef0123456789abcdef01";
    test("uses `latest` URL when commit is omitted", () => {
      assert.strictEqual(
        buildCLIDownloadUrl("linux", "x64", "insider"),
        "https://update.code.visualstudio.com/latest/cli-linux-x64/insider"
      );
    });
    test("works for darwin arm64 stable (no commit)", () => {
      assert.strictEqual(
        buildCLIDownloadUrl("darwin", "arm64", "stable"),
        "https://update.code.visualstudio.com/latest/cli-darwin-arm64/stable"
      );
    });
    test("pins to commit when provided", () => {
      assert.strictEqual(
        buildCLIDownloadUrl("linux", "x64", "insider", commit),
        `https://update.code.visualstudio.com/commit:${commit}/cli-linux-x64/insider`
      );
    });
    test("pins to commit for darwin arm64 stable", () => {
      assert.strictEqual(
        buildCLIDownloadUrl("darwin", "arm64", "stable", commit),
        `https://update.code.visualstudio.com/commit:${commit}/cli-darwin-arm64/stable`
      );
    });
    test("rejects unsafe commit values", () => {
      assert.throws(() => buildCLIDownloadUrl("linux", "x64", "insider", "foo;rm"), /Unsafe commit/);
    });
    test("normalizes uppercase hex commits to lowercase", () => {
      const upper = "ABCDEF0123456789ABCDEF0123456789ABCDEF01";
      assert.strictEqual(
        buildCLIDownloadUrl("linux", "x64", "insider", upper),
        `https://update.code.visualstudio.com/commit:abcdef0123456789abcdef0123456789abcdef01/cli-linux-x64/insider`
      );
    });
  });
  suite("buildCleanupOldCLIsCommand", () => {
    test("produces a snippet that keeps the 5 most recent commit-keyed CLIs for insider", () => {
      const cmd = buildCleanupOldCLIsCommand(".vscode-server-insiders", "insider");
      assert.ok(cmd.includes("~/.vscode-server-insiders/code-insiders-"), `cmd missing install path: ${cmd}`);
      assert.ok(/(\[0-9a-f\]){40}/.test(cmd), "cmd should match exactly 40 hex chars");
      assert.ok(/ls -1t/.test(cmd), `cmd should sort by mtime: ${cmd}`);
      assert.ok(/awk\s+'NR>5'/.test(cmd), `cmd should keep 5: ${cmd}`);
      assert.ok(/xargs\s+-I\{\}\s+rm\s+-f\s+--/.test(cmd), `cmd should rm safely: ${cmd}`);
    });
    test("uses `code-` archive name for stable", () => {
      const cmd = buildCleanupOldCLIsCommand(".vscode-server", "stable");
      assert.ok(cmd.includes("~/.vscode-server/code-[0-9a-f]"), `cmd should target stable archive: ${cmd}`);
      assert.ok(!cmd.includes("code-insiders-"), "stable cmd should not mention insiders archive");
    });
    test("rejects unsafe inputs", () => {
      assert.throws(() => buildCleanupOldCLIsCommand("foo bar", "stable"), /Unsafe server data folder name/);
      assert.throws(() => buildCleanupOldCLIsCommand(".vscode-server", "foo bar"), /Unsafe quality/);
    });
  });
  suite("buildFindFallbackCLICommand", () => {
    test("lists commit-keyed candidates then legacy paths for insider", () => {
      const cmd = buildFindFallbackCLICommand(".vscode-server-insiders", "insider");
      assert.ok(cmd.includes("~/.vscode-server-insiders/code-insiders-"), `cmd missing new path: ${cmd}`);
      assert.ok(/ls -1t/.test(cmd), "should sort commit-keyed candidates by mtime");
      assert.ok(cmd.includes("~/.vscode-cli-insider/code-insiders"), `cmd missing legacy path: ${cmd}`);
    });
    test("uses no-suffix legacy dir for stable", () => {
      const cmd = buildFindFallbackCLICommand(".vscode-server", "stable");
      assert.ok(cmd.includes("~/.vscode-cli/code"), `cmd missing stable legacy path: ${cmd}`);
      assert.ok(!cmd.includes(".vscode-cli-stable"), "stable should not get the -<quality> suffix");
    });
    test("rejects unsafe inputs", () => {
      assert.throws(() => buildFindFallbackCLICommand("foo bar", "stable"), /Unsafe server data folder name/);
      assert.throws(() => buildFindFallbackCLICommand(".vscode-server", "foo bar"), /Unsafe quality/);
    });
  });
  suite("isValidFallbackCLIPath", () => {
    const sdf = ".vscode-server-insiders";
    const q = "insider";
    const hex = "0123456789abcdef0123456789abcdef01234567";
    test("accepts commit-keyed path under the shared install root", () => {
      assert.strictEqual(isValidFallbackCLIPath(`~/${sdf}/code-insiders-${hex}`, sdf, q), true);
    });
    test("accepts legacy ~/.vscode-cli-<quality>/<archive> path for insider", () => {
      assert.strictEqual(isValidFallbackCLIPath("~/.vscode-cli-insider/code-insiders", sdf, q), true);
    });
    test("accepts legacy ~/.vscode-cli/code path for stable", () => {
      assert.strictEqual(isValidFallbackCLIPath("~/.vscode-cli/code", ".vscode-server", "stable"), true);
    });
    test("rejects commit suffix with non-hex characters", () => {
      const notHex = "g".repeat(40);
      assert.strictEqual(isValidFallbackCLIPath(`~/${sdf}/code-insiders-${notHex}`, sdf, q), false);
    });
    test("rejects commit suffix with wrong length", () => {
      assert.strictEqual(isValidFallbackCLIPath(`~/${sdf}/code-insiders-${hex.slice(0, 39)}`, sdf, q), false);
      assert.strictEqual(isValidFallbackCLIPath(`~/${sdf}/code-insiders-${hex}a`, sdf, q), false);
    });
    test("rejects paths under an unexpected root", () => {
      assert.strictEqual(isValidFallbackCLIPath(`~/.something-else/code-insiders-${hex}`, sdf, q), false);
    });
    test("rejects empty input", () => {
      assert.strictEqual(isValidFallbackCLIPath("", sdf, q), false);
    });
    test("rejects shell metacharacters", () => {
      assert.strictEqual(isValidFallbackCLIPath(`~/${sdf}/code-insiders-${hex}; rm -rf /`, sdf, q), false);
      assert.strictEqual(isValidFallbackCLIPath(`~/${sdf}/code-insiders-${hex} && evil`, sdf, q), false);
    });
  });
  suite("redactToken", () => {
    test("redacts token in WebSocket URL", () => {
      assert.strictEqual(
        redactToken("ws://127.0.0.1:12345?tkn=secret123"),
        "ws://127.0.0.1:12345?tkn=***"
      );
    });
    test("redacts token with following whitespace", () => {
      assert.strictEqual(
        redactToken("ws://127.0.0.1:12345?tkn=abc123 done"),
        "ws://127.0.0.1:12345?tkn=*** done"
      );
    });
    test("preserves text without tokens", () => {
      assert.strictEqual(redactToken("no token here"), "no token here");
    });
    test("redacts multiple tokens", () => {
      assert.strictEqual(
        redactToken("?tkn=one and ?tkn=two"),
        "?tkn=*** and ?tkn=***"
      );
    });
  });
  suite("getAgentHostLockfile", () => {
    test("returns path under the launcher data dir", () => {
      assert.strictEqual(
        getAgentHostLockfile(".vscode-server-insiders", "insider"),
        "~/.vscode-server-insiders/cli/agent-host-insider.lock"
      );
    });
    test("keys lockfile name on quality", () => {
      assert.strictEqual(
        getAgentHostLockfile(".vscode-server-oss", "stable"),
        "~/.vscode-server-oss/cli/agent-host-stable.lock"
      );
    });
    test("rejects unsafe server data folder names", () => {
      assert.throws(() => getAgentHostLockfile("foo bar", "stable"), /Unsafe server data folder name/);
      assert.throws(() => getAgentHostLockfile("foo/bar", "stable"), /Unsafe server data folder name/);
      assert.throws(() => getAgentHostLockfile("$(whoami)", "stable"), /Unsafe server data folder name/);
    });
    test("rejects unsafe quality strings", () => {
      assert.throws(() => getAgentHostLockfile(".vscode-server-oss", "foo bar"), /Unsafe quality/);
    });
  });
  suite("findRunningAgentHost", () => {
    function createMockExec(responses) {
      return async (command, _opts) => {
        for (const [pattern, response] of responses) {
          if (command.includes(pattern)) {
            return response;
          }
        }
        return { stdout: "", stderr: "", code: 1 };
      };
    }
    test("returns notFound when no state file exists", async () => {
      const exec = createMockExec(/* @__PURE__ */ new Map([
        ["cat", { stdout: "", stderr: "", code: 1 }]
      ]));
      const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
      assert.deepStrictEqual(result, { kind: "notFound" });
    });
    test("returns notFound when state file is empty", async () => {
      const exec = createMockExec(/* @__PURE__ */ new Map([
        ["cat", { stdout: "   \n", stderr: "", code: 0 }]
      ]));
      const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
      assert.deepStrictEqual(result, { kind: "notFound" });
    });
    test("cleans up corrupt state file", async () => {
      const commands = [];
      const exec = async (command) => {
        commands.push(command);
        if (command.includes("cat")) {
          return { stdout: "not json at all", stderr: "", code: 0 };
        }
        return { stdout: "", stderr: "", code: 0 };
      };
      const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
      assert.deepStrictEqual(result, { kind: "notFound" });
      assert.ok(commands.some((c) => c.includes("rm -f")));
    });
    test("cleans up state file with missing schemaVersion", async () => {
      const commands = [];
      const exec = async (command) => {
        commands.push(command);
        if (command.includes("cat")) {
          return { stdout: JSON.stringify({ pid: 1234, port: 8080, connectionToken: null }), stderr: "", code: 0 };
        }
        return { stdout: "", stderr: "", code: 0 };
      };
      const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
      assert.deepStrictEqual(result, { kind: "notFound" });
      assert.ok(commands.some((c) => c.includes("rm -f")));
    });
    test("rejects state file with invalid pid", async () => {
      const exec = createMockExec(/* @__PURE__ */ new Map([
        ["cat", { stdout: JSON.stringify({ schemaVersion: 1, pid: "1234", port: 8080, protocolVersion: PROTOCOL_VERSION }), stderr: "", code: 0 }]
      ]));
      const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
      assert.deepStrictEqual(result, { kind: "notFound" });
    });
    test("rejects state file with port above 65535", async () => {
      const exec = createMockExec(/* @__PURE__ */ new Map([
        ["cat", { stdout: JSON.stringify({ schemaVersion: 1, pid: 1234, port: 7e4, protocolVersion: PROTOCOL_VERSION }), stderr: "", code: 0 }]
      ]));
      const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
      assert.deepStrictEqual(result, { kind: "notFound" });
    });
    test("cleans up stale state when PID is not running", async () => {
      const state = stateJson(9999, 8080, "tok123");
      const commands = [];
      const exec = async (command) => {
        commands.push(command);
        if (command.includes("cat")) {
          return { stdout: state, stderr: "", code: 0 };
        }
        if (command.includes("kill -0")) {
          return { stdout: "", stderr: "", code: 1 };
        }
        return { stdout: "", stderr: "", code: 0 };
      };
      const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
      assert.deepStrictEqual(result, { kind: "notFound" });
      assert.ok(commands.some((c) => c.includes("rm -f")));
    });
    test("returns port and token when PID is alive", async () => {
      const state = stateJson(1234, 8080, "mytoken");
      const exec = createMockExec(/* @__PURE__ */ new Map([
        ["cat", { stdout: state, stderr: "", code: 0 }],
        ["kill -0", { stdout: "", stderr: "", code: 0 }]
      ]));
      const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
      assert.deepStrictEqual(result, { kind: "compatible", host: "127.0.0.1", port: 8080, connectionToken: "mytoken" });
    });
    test("returns undefined connectionToken when state has null token", async () => {
      const state = stateJson(1234, 8080, null);
      const exec = createMockExec(/* @__PURE__ */ new Map([
        ["cat", { stdout: state, stderr: "", code: 0 }],
        ["kill -0", { stdout: "", stderr: "", code: 0 }]
      ]));
      const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
      assert.deepStrictEqual(result, { kind: "compatible", host: "127.0.0.1", port: 8080, connectionToken: void 0 });
    });
    test("treats newer protocol version as compatible (the AH may speak a newer version than this build)", async () => {
      const state = JSON.parse(stateJson(1234, 8080, null));
      state.protocolVersion = "99.0.0";
      const exec = createMockExec(/* @__PURE__ */ new Map([
        ["cat", { stdout: JSON.stringify(state), stderr: "", code: 0 }],
        ["kill -0", { stdout: "", stderr: "", code: 0 }]
      ]));
      const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
      assert.deepStrictEqual(result, { kind: "compatible", host: "127.0.0.1", port: 8080, connectionToken: void 0 });
    });
    test("maps recorded `0.0.0.0` bind to loopback when dialing", async () => {
      const state = JSON.parse(stateJson(1234, 8080, null));
      state.host = "0.0.0.0";
      const exec = createMockExec(/* @__PURE__ */ new Map([
        ["cat", { stdout: JSON.stringify(state), stderr: "", code: 0 }],
        ["kill -0", { stdout: "", stderr: "", code: 0 }]
      ]));
      const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
      assert.deepStrictEqual(result, { kind: "compatible", host: "127.0.0.1", port: 8080, connectionToken: void 0 });
    });
    test("preserves specific recorded host (e.g. IPv6 loopback)", async () => {
      const state = JSON.parse(stateJson(1234, 8080, null));
      state.host = "::1";
      const exec = createMockExec(/* @__PURE__ */ new Map([
        ["cat", { stdout: JSON.stringify(state), stderr: "", code: 0 }],
        ["kill -0", { stdout: "", stderr: "", code: 0 }]
      ]));
      const result = await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
      assert.deepStrictEqual(result, { kind: "compatible", host: "::1", port: 8080, connectionToken: void 0 });
    });
    test("reads from the per-quality launcher lockfile path", async () => {
      const commands = [];
      const exec = async (command) => {
        commands.push(command);
        return { stdout: "", stderr: "", code: 1 };
      };
      await findRunningAgentHost(exec, logService, serverDataFolderName, quality);
      assert.ok(commands.some((c) => c.includes(lockfilePath)));
    });
  });
  suite("writeAgentHostState", () => {
    test("does not write when pid is undefined", async () => {
      const commands = [];
      const exec = async (command) => {
        commands.push(command);
        return { stdout: "", stderr: "", code: 0 };
      };
      await writeAgentHostState(exec, logService, serverDataFolderName, quality, void 0, 8080, "token");
      assert.strictEqual(commands.length, 0);
    });
    test("does not write when pid is 0", async () => {
      const commands = [];
      const exec = async (command) => {
        commands.push(command);
        return { stdout: "", stderr: "", code: 0 };
      };
      await writeAgentHostState(exec, logService, serverDataFolderName, quality, 0, 8080, "token");
      assert.strictEqual(commands.length, 0);
    });
    test("writes lockfile with canonical metadata JSON", async () => {
      const commands = [];
      const exec = async (command) => {
        commands.push(command);
        return { stdout: "", stderr: "", code: 0 };
      };
      await writeAgentHostState(exec, logService, serverDataFolderName, quality, 1234, 8080, "mytoken");
      assert.strictEqual(commands.length, 1);
      assert.ok(commands[0].includes(lockfilePath));
      assert.ok(commands[0].includes('"schemaVersion":1'));
      assert.ok(commands[0].includes('"pid":1234'));
      assert.ok(commands[0].includes('"port":8080'));
      assert.ok(commands[0].includes('"connectionToken":"mytoken"'));
      assert.ok(commands[0].includes(`"protocolVersion":"${PROTOCOL_VERSION}"`));
      assert.ok(commands[0].includes('"quality":"insider"'));
      assert.ok(commands[0].includes("mkdir -p"));
      assert.ok(commands[0].includes("rm -f"));
      assert.ok(commands[0].includes("(umask 077"));
    });
    test("writes null connectionToken when undefined", async () => {
      const commands = [];
      const exec = async (command) => {
        commands.push(command);
        return { stdout: "", stderr: "", code: 0 };
      };
      await writeAgentHostState(exec, logService, serverDataFolderName, quality, 1234, 8080, void 0);
      assert.strictEqual(commands.length, 1);
      assert.ok(commands[0].includes('"connectionToken":null'));
    });
    test("logs warning when write command fails", async () => {
      const exec = async () => {
        return { stdout: "", stderr: "Permission denied", code: 1 };
      };
      const warnings = [];
      const capturingLog = new NullLogService();
      capturingLog.warn = (...args) => {
        warnings.push(args.map(String).join(" "));
      };
      await writeAgentHostState(exec, capturingLog, serverDataFolderName, quality, 1234, 8080, "tok");
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].includes("Failed to write"));
      assert.ok(warnings[0].includes("exit code 1"));
      assert.ok(warnings[0].includes("Permission denied"));
    });
  });
  suite("cleanupRemoteAgentHost", () => {
    test("removes lockfile even when no state exists", async () => {
      const commands = [];
      const exec = async (command) => {
        commands.push(command);
        if (command.includes("cat")) {
          return { stdout: "", stderr: "", code: 1 };
        }
        return { stdout: "", stderr: "", code: 0 };
      };
      await cleanupRemoteAgentHost(exec, logService, serverDataFolderName, quality);
      assert.ok(commands.some((c) => c.includes(`rm -f ${lockfilePath}`)));
    });
    test("kills process and removes lockfile", async () => {
      const state = stateJson(5678, 9090, null);
      const commands = [];
      const exec = async (command) => {
        commands.push(command);
        if (command.includes("cat")) {
          return { stdout: state, stderr: "", code: 0 };
        }
        return { stdout: "", stderr: "", code: 0 };
      };
      await cleanupRemoteAgentHost(exec, logService, serverDataFolderName, quality);
      assert.ok(commands.some((c) => c.includes("kill 5678")));
      assert.ok(commands.some((c) => c.includes(`rm -f ${lockfilePath}`)));
    });
    test("handles corrupt state file gracefully", async () => {
      const commands = [];
      const exec = async (command) => {
        commands.push(command);
        if (command.includes("cat")) {
          return { stdout: "{invalid json", stderr: "", code: 0 };
        }
        return { stdout: "", stderr: "", code: 0 };
      };
      await cleanupRemoteAgentHost(exec, logService, serverDataFolderName, quality);
      assert.ok(commands.some((c) => c.includes("rm -f")));
      assert.ok(!commands.some((c) => c.startsWith("kill")));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvc3NoUmVtb3RlQWdlbnRIb3N0SGVscGVycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlbW90ZUFnZW50SG9zdFN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3JlbW90ZUFnZW50SG9zdE1ldGFkYXRhLmpzJztcbmltcG9ydCB7IFBST1RPQ09MX1ZFUlNJT04gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvdmVyc2lvbi9yZWdpc3RyeS5qcyc7XG5pbXBvcnQge1xuXHRidWlsZEFnZW50SG9zdEJhc2VDb21tYW5kLFxuXHRidWlsZENMSURvd25sb2FkVXJsLFxuXHRidWlsZENsZWFudXBPbGRDTElzQ29tbWFuZCxcblx0YnVpbGRGaW5kRmFsbGJhY2tDTElDb21tYW5kLFxuXHRjbGVhbnVwUmVtb3RlQWdlbnRIb3N0LFxuXHRmaW5kUnVubmluZ0FnZW50SG9zdCxcblx0Z2V0QWdlbnRIb3N0TG9ja2ZpbGUsXG5cdGdldFJlbW90ZUNMSUFyY2hpdmVOYW1lLFxuXHRnZXRSZW1vdGVDTElCaW4sXG5cdGdldFJlbW90ZUNMSURhdGFEaXIsXG5cdGdldFJlbW90ZUNMSUluc3RhbGxSb290LFxuXHRpc1ZhbGlkRmFsbGJhY2tDTElQYXRoLFxuXHRyZWRhY3RUb2tlbixcblx0cmVzb2x2ZVJlbW90ZVBsYXRmb3JtLFxuXHRzaGVsbEVzY2FwZSxcblx0dmFsaWRhdGVDb21taXQsXG5cdHZhbGlkYXRlU2hlbGxUb2tlbixcblx0d3JpdGVBZ2VudEhvc3RTdGF0ZSxcblx0dHlwZSBJU3NoRXhlYyxcbn0gZnJvbSAnLi4vLi4vbm9kZS9zc2hSZW1vdGVBZ2VudEhvc3RIZWxwZXJzLmpzJztcblxuc3VpdGUoJ1NTSCBSZW1vdGUgQWdlbnQgSG9zdCBIZWxwZXJzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0Y29uc3Qgc2VydmVyRGF0YUZvbGRlck5hbWUgPSAnLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMnO1xuXHRjb25zdCBxdWFsaXR5ID0gJ2luc2lkZXInO1xuXHRjb25zdCBsb2NrZmlsZVBhdGggPSAnfi8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9jbGkvYWdlbnQtaG9zdC1pbnNpZGVyLmxvY2snO1xuXG5cdGZ1bmN0aW9uIHN0YXRlSnNvbihwaWQ6IG51bWJlciwgcG9ydDogbnVtYmVyLCBjb25uZWN0aW9uVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZCB8IG51bGwpOiBzdHJpbmcge1xuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShjcmVhdGVSZW1vdGVBZ2VudEhvc3RTdGF0ZSh7XG5cdFx0XHRwaWQsXG5cdFx0XHRwb3J0LFxuXHRcdFx0Y29ubmVjdGlvblRva2VuOiBjb25uZWN0aW9uVG9rZW4gPz8gdW5kZWZpbmVkLFxuXHRcdFx0cXVhbGl0eSxcblx0XHR9KSk7XG5cdH1cblxuXHRzdWl0ZSgndmFsaWRhdGVTaGVsbFRva2VuJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2FjY2VwdHMgYWxwaGFudW1lcmljIHN0cmluZ3MnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsaWRhdGVTaGVsbFRva2VuKCdpbnNpZGVyJywgJ3F1YWxpdHknKSwgJ2luc2lkZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWxpZGF0ZVNoZWxsVG9rZW4oJ3N0YWJsZScsICdxdWFsaXR5JyksICdzdGFibGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWxpZGF0ZVNoZWxsVG9rZW4oJ2V4cGxvcmF0aW9uJywgJ3F1YWxpdHknKSwgJ2V4cGxvcmF0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhY2NlcHRzIGRvdHMsIGRhc2hlcywgYW5kIHVuZGVyc2NvcmVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbGlkYXRlU2hlbGxUb2tlbignbXktYnVpbGRfMS4wJywgJ3F1YWxpdHknKSwgJ215LWJ1aWxkXzEuMCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBzdHJpbmdzIHdpdGggc3BhY2VzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB2YWxpZGF0ZVNoZWxsVG9rZW4oJ2ZvbyBiYXInLCAncXVhbGl0eScpLCAvVW5zYWZlIHF1YWxpdHkvKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgc3RyaW5ncyB3aXRoIHNoZWxsIG1ldGFjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB2YWxpZGF0ZVNoZWxsVG9rZW4oJ2ZvbztybSAtcmYgLycsICdxdWFsaXR5JyksIC9VbnNhZmUgcXVhbGl0eS8pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB2YWxpZGF0ZVNoZWxsVG9rZW4oJyQod2hvYW1pKScsICdxdWFsaXR5JyksIC9VbnNhZmUgcXVhbGl0eS8pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB2YWxpZGF0ZVNoZWxsVG9rZW4oJ2Zvb1xcJ2JhcicsICdxdWFsaXR5JyksIC9VbnNhZmUgcXVhbGl0eS8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBlbXB0eSBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHZhbGlkYXRlU2hlbGxUb2tlbignJywgJ3F1YWxpdHknKSwgL1Vuc2FmZSBxdWFsaXR5Lyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd2YWxpZGF0ZUNvbW1pdCcsICgpID0+IHtcblx0XHR0ZXN0KCdhY2NlcHRzIGEgNDAtY2hhciBsb3dlcmNhc2UgaGV4IFNIQScsICgpID0+IHtcblx0XHRcdGNvbnN0IGMgPSAnYWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWYwMSc7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsaWRhdGVDb21taXQoYyksIGMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9ybWFsaXplcyB1cHBlcmNhc2UgaGV4IHRvIGxvd2VyY2FzZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0dmFsaWRhdGVDb21taXQoJ0FCQ0RFRjAxMjM0NTY3ODlBQkNERUYwMTIzNDU2Nzg5QUJDREVGMDEnKSxcblx0XHRcdFx0J2FiY2RlZjAxMjM0NTY3ODlhYmNkZWYwMTIzNDU2Nzg5YWJjZGVmMDEnLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgbm9uLWhleCBjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB2YWxpZGF0ZUNvbW1pdCgnZycucmVwZWF0KDQwKSksIC9VbnNhZmUgY29tbWl0Lyk7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHZhbGlkYXRlQ29tbWl0KCdhYmNkZWYwMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjB6JyksIC9VbnNhZmUgY29tbWl0Lyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHdyb25nLWxlbmd0aCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHZhbGlkYXRlQ29tbWl0KCdhYmMnKSwgL1Vuc2FmZSBjb21taXQvKTtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gdmFsaWRhdGVDb21taXQoJ2EnLnJlcGVhdCg0MSkpLCAvVW5zYWZlIGNvbW1pdC8pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB2YWxpZGF0ZUNvbW1pdCgnJyksIC9VbnNhZmUgY29tbWl0Lyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHNoZWxsIG1ldGFjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB2YWxpZGF0ZUNvbW1pdCgnZm9vO3JtJyksIC9VbnNhZmUgY29tbWl0Lyk7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHZhbGlkYXRlQ29tbWl0KCdhJy5yZXBlYXQoMzkpICsgJyQnKSwgL1Vuc2FmZSBjb21taXQvKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldFJlbW90ZUNMSUFyY2hpdmVOYW1lJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgY29kZSBmb3Igc3RhYmxlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFJlbW90ZUNMSUFyY2hpdmVOYW1lKCdzdGFibGUnKSwgJ2NvZGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgY29kZS1pbnNpZGVycyBmb3IgaW5zaWRlcicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZW1vdGVDTElBcmNoaXZlTmFtZSgnaW5zaWRlcicpLCAnY29kZS1pbnNpZGVycycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBjb2RlLWV4cGxvcmF0aW9uIGZvciBleHBsb3JhdGlvbicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZW1vdGVDTElBcmNoaXZlTmFtZSgnZXhwbG9yYXRpb24nKSwgJ2NvZGUtZXhwbG9yYXRpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gY29kZS1pbnNpZGVycyBmb3IgdW5rbm93biBxdWFsaXRpZXMnLCAoKSA9PiB7XG5cdFx0XHQvLyBEZXYgYnVpbGRzIHdpdGggbm8gYHF1YWxpdHlgIGVuZCB1cCBoZXJlIHZpYSB0aGVcblx0XHRcdC8vIGBfcXVhbGl0eWAgZ2V0dGVyJ3MgYCdpbnNpZGVyJ2AgZGVmYXVsdCwgc28gdGhlIGZhbGxiYWNrXG5cdFx0XHQvLyBzaG91bGRuJ3QgZGlmZmVyIGZyb20gaW5zaWRlci5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZW1vdGVDTElBcmNoaXZlTmFtZSgnd2VpcmRidWlsZCcpLCAnY29kZS1pbnNpZGVycycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyB1bnNhZmUgcXVhbGl0eSBzdHJpbmdzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRSZW1vdGVDTElBcmNoaXZlTmFtZSgnZm9vIGJhcicpLCAvVW5zYWZlIHF1YWxpdHkvKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldFJlbW90ZUNMSUluc3RhbGxSb290JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgdXNlci1ob21lIGFuY2hvcmVkIHBhdGggdW5kZXIgdGhlIHNlcnZlciBkYXRhIGZvbGRlcicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZW1vdGVDTElJbnN0YWxsUm9vdCgnLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMnKSwgJ34vLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgdW5zYWZlIHNlcnZlciBkYXRhIGZvbGRlciBuYW1lcycsICgpID0+IHtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZ2V0UmVtb3RlQ0xJSW5zdGFsbFJvb3QoJ2ZvbyBiYXInKSwgL1Vuc2FmZSBzZXJ2ZXIgZGF0YSBmb2xkZXIgbmFtZS8pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRSZW1vdGVDTElJbnN0YWxsUm9vdCgnZm9vL2JhcicpLCAvVW5zYWZlIHNlcnZlciBkYXRhIGZvbGRlciBuYW1lLyk7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldFJlbW90ZUNMSUluc3RhbGxSb290KCckKHdob2FtaSknKSwgL1Vuc2FmZSBzZXJ2ZXIgZGF0YSBmb2xkZXIgbmFtZS8pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0UmVtb3RlQ0xJRGF0YURpcicsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIHRoZSBgY2xpYCBzdWJkaXIgdW5kZXIgdGhlIGluc3RhbGwgcm9vdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZW1vdGVDTElEYXRhRGlyKCcudnNjb2RlLXNlcnZlcicpLCAnfi8udnNjb2RlLXNlcnZlci9jbGknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZW1vdGVDTElEYXRhRGlyKCcudnNjb2RlLXNlcnZlci1pbnNpZGVycycpLCAnfi8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9jbGknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgdW5zYWZlIHNlcnZlciBkYXRhIGZvbGRlciBuYW1lcycsICgpID0+IHtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZ2V0UmVtb3RlQ0xJRGF0YURpcignZm9vO3JtJyksIC9VbnNhZmUgc2VydmVyIGRhdGEgZm9sZGVyIG5hbWUvKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2J1aWxkQWdlbnRIb3N0QmFzZUNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnaW5jbHVkZXMgLS1jbGktZGF0YS1kaXIgYmVmb3JlIHRoZSBhZ2VudCBob3N0IHN1YmNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbWQgPSBidWlsZEFnZW50SG9zdEJhc2VDb21tYW5kKCd+Ly52c2NvZGUtc2VydmVyL2NvZGUtaW5zaWRlcnMtYWJjJywgJ34vLnZzY29kZS1zZXJ2ZXIvY2xpJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY21kLCAnfi8udnNjb2RlLXNlcnZlci9jb2RlLWluc2lkZXJzLWFiYyAtLWNsaS1kYXRhLWRpciB+Ly52c2NvZGUtc2VydmVyL2NsaSBhZ2VudCBob3N0IC0tcG9ydCAwJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRSZW1vdGVDTElCaW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWl0ID0gJ2FiY2RlZjAxMjM0NTY3ODlhYmNkZWYwMTIzNDU2Nzg5YWJjZGVmMDEnO1xuXG5cdFx0dGVzdCgncmV0dXJucyBjb21taXQta2V5ZWQgcGF0aCB1bmRlciBzaGFyZWQgaW5zdGFsbCByb290IGZvciBzdGFibGUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldFJlbW90ZUNMSUJpbignLnZzY29kZS1zZXJ2ZXInLCAnc3RhYmxlJywgY29tbWl0KSxcblx0XHRcdFx0YH4vLnZzY29kZS1zZXJ2ZXIvY29kZS0ke2NvbW1pdH1gLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgY29tbWl0LWtleWVkIHBhdGggZm9yIGluc2lkZXInLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldFJlbW90ZUNMSUJpbignLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMnLCAnaW5zaWRlcicsIGNvbW1pdCksXG5cdFx0XHRcdGB+Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2NvZGUtaW5zaWRlcnMtJHtjb21taXR9YCxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGNvbW1pdC1rZXllZCBwYXRoIGZvciBleHBsb3JhdGlvbicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0UmVtb3RlQ0xJQmluKCcudnNjb2RlLXNlcnZlci1leHBsb3JhdGlvbicsICdleHBsb3JhdGlvbicsIGNvbW1pdCksXG5cdFx0XHRcdGB+Ly52c2NvZGUtc2VydmVyLWV4cGxvcmF0aW9uL2NvZGUtZXhwbG9yYXRpb24tJHtjb21taXR9YCxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG5vbi1rZXllZCBwYXRoIHdoZW4gY29tbWl0IGlzIHVuZGVmaW5lZCAoZGV2IGJ1aWxkKScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0UmVtb3RlQ0xJQmluKCcudnNjb2RlLXNlcnZlci1vc3MnLCAnaW5zaWRlcicpLFxuXHRcdFx0XHQnfi8udnNjb2RlLXNlcnZlci1vc3MvY29kZS1pbnNpZGVycycsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRSZW1vdGVDTElCaW4oJy52c2NvZGUtc2VydmVyJywgJ3N0YWJsZScpLFxuXHRcdFx0XHQnfi8udnNjb2RlLXNlcnZlci9jb2RlJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHVuc2FmZSBjb21taXQgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRSZW1vdGVDTElCaW4oJy52c2NvZGUtc2VydmVyJywgJ3N0YWJsZScsICdmb287cm0nKSwgL1Vuc2FmZSBjb21taXQvKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vcm1hbGl6ZXMgdXBwZXJjYXNlIGhleCBjb21taXRzIHRvIGxvd2VyY2FzZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHVwcGVyID0gJ0FCQ0RFRjAxMjM0NTY3ODlBQkNERUYwMTIzNDU2Nzg5QUJDREVGMDEnO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRSZW1vdGVDTElCaW4oJy52c2NvZGUtc2VydmVyJywgJ3N0YWJsZScsIHVwcGVyKSxcblx0XHRcdFx0J34vLnZzY29kZS1zZXJ2ZXIvY29kZS1hYmNkZWYwMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHVuc2FmZSBzZXJ2ZXIgZGF0YSBmb2xkZXIgbmFtZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldFJlbW90ZUNMSUJpbignZm9vIGJhcicsICdzdGFibGUnLCBjb21taXQpLCAvVW5zYWZlIHNlcnZlciBkYXRhIGZvbGRlciBuYW1lLyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzaGVsbEVzY2FwZScsICgpID0+IHtcblx0XHR0ZXN0KCd3cmFwcyBzaW1wbGUgc3RyaW5nIGluIHNpbmdsZSBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hlbGxFc2NhcGUoJ2hlbGxvJyksICdcXCdoZWxsb1xcJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXNjYXBlcyBlbWJlZGRlZCBzaW5nbGUgcXVvdGVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNoZWxsRXNjYXBlKCdpdFxcJ3MnKSwgJ1xcJ2l0XFwnXFxcXFxcJ1xcJ3NcXCcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgZW1wdHkgc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNoZWxsRXNjYXBlKCcnKSwgJ1xcJ1xcJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFzc2VzIHRocm91Z2ggc3BlY2lhbCBjaGFycyBzYWZlbHkgd3JhcHBlZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaGVsbEVzY2FwZSgnJChybSAtcmYgLyknKSwgJ1xcJyQocm0gLXJmIC8pXFwnJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXNvbHZlUmVtb3RlUGxhdGZvcm0nLCAoKSA9PiB7XG5cdFx0dGVzdCgnZGV0ZWN0cyBMaW51eCB4NjQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmVSZW1vdGVQbGF0Zm9ybSgnTGludXgnLCAneDg2XzY0JyksIHsgb3M6ICdsaW51eCcsIGFyY2g6ICd4NjQnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGV0ZWN0cyBMaW51eCBhbWQ2NCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZVJlbW90ZVBsYXRmb3JtKCdMaW51eCcsICdhbWQ2NCcpLCB7IG9zOiAnbGludXgnLCBhcmNoOiAneDY0JyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RldGVjdHMgTGludXggYXJtNjQgKGFhcmNoNjQpJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlUmVtb3RlUGxhdGZvcm0oJ0xpbnV4JywgJ2FhcmNoNjQnKSwgeyBvczogJ2xpbnV4JywgYXJjaDogJ2FybTY0JyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RldGVjdHMgTGludXggYXJtNjQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmVSZW1vdGVQbGF0Zm9ybSgnTGludXgnLCAnYXJtNjQnKSwgeyBvczogJ2xpbnV4JywgYXJjaDogJ2FybTY0JyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RldGVjdHMgTGludXggYXJtaGYnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmVSZW1vdGVQbGF0Zm9ybSgnTGludXgnLCAnYXJtdjdsJyksIHsgb3M6ICdsaW51eCcsIGFyY2g6ICdhcm1oZicgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZXRlY3RzIERhcndpbiB4NjQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmVSZW1vdGVQbGF0Zm9ybSgnRGFyd2luJywgJ3g4Nl82NCcpLCB7IG9zOiAnZGFyd2luJywgYXJjaDogJ3g2NCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZXRlY3RzIERhcndpbiBhcm02NCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZVJlbW90ZVBsYXRmb3JtKCdEYXJ3aW4nLCAnYXJtNjQnKSwgeyBvczogJ2RhcndpbicsIGFyY2g6ICdhcm02NCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIHdoaXRlc3BhY2UgaW4gdW5hbWUgb3V0cHV0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlUmVtb3RlUGxhdGZvcm0oJyAgTGludXhcXG4nLCAnICB4ODZfNjRcXG4nKSwgeyBvczogJ2xpbnV4JywgYXJjaDogJ3g2NCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgV2luZG93cycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlUmVtb3RlUGxhdGZvcm0oJ01JTkdXNjRfTlQtMTAuMC0xOTA0MScsICd4ODZfNjQnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciB1bmtub3duIE9TJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVSZW1vdGVQbGF0Zm9ybSgnRnJlZUJTRCcsICdhbWQ2NCcpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIHVua25vd24gYXJjaCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlUmVtb3RlUGxhdGZvcm0oJ0xpbnV4JywgJ3BwYzY0bGUnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2J1aWxkQ0xJRG93bmxvYWRVcmwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWl0ID0gJ2FiY2RlZjAxMjM0NTY3ODlhYmNkZWYwMTIzNDU2Nzg5YWJjZGVmMDEnO1xuXG5cdFx0dGVzdCgndXNlcyBgbGF0ZXN0YCBVUkwgd2hlbiBjb21taXQgaXMgb21pdHRlZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0YnVpbGRDTElEb3dubG9hZFVybCgnbGludXgnLCAneDY0JywgJ2luc2lkZXInKSxcblx0XHRcdFx0J2h0dHBzOi8vdXBkYXRlLmNvZGUudmlzdWFsc3R1ZGlvLmNvbS9sYXRlc3QvY2xpLWxpbnV4LXg2NC9pbnNpZGVyJ1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dvcmtzIGZvciBkYXJ3aW4gYXJtNjQgc3RhYmxlIChubyBjb21taXQpJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRidWlsZENMSURvd25sb2FkVXJsKCdkYXJ3aW4nLCAnYXJtNjQnLCAnc3RhYmxlJyksXG5cdFx0XHRcdCdodHRwczovL3VwZGF0ZS5jb2RlLnZpc3VhbHN0dWRpby5jb20vbGF0ZXN0L2NsaS1kYXJ3aW4tYXJtNjQvc3RhYmxlJ1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BpbnMgdG8gY29tbWl0IHdoZW4gcHJvdmlkZWQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGJ1aWxkQ0xJRG93bmxvYWRVcmwoJ2xpbnV4JywgJ3g2NCcsICdpbnNpZGVyJywgY29tbWl0KSxcblx0XHRcdFx0YGh0dHBzOi8vdXBkYXRlLmNvZGUudmlzdWFsc3R1ZGlvLmNvbS9jb21taXQ6JHtjb21taXR9L2NsaS1saW51eC14NjQvaW5zaWRlcmAsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGlucyB0byBjb21taXQgZm9yIGRhcndpbiBhcm02NCBzdGFibGUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGJ1aWxkQ0xJRG93bmxvYWRVcmwoJ2RhcndpbicsICdhcm02NCcsICdzdGFibGUnLCBjb21taXQpLFxuXHRcdFx0XHRgaHR0cHM6Ly91cGRhdGUuY29kZS52aXN1YWxzdHVkaW8uY29tL2NvbW1pdDoke2NvbW1pdH0vY2xpLWRhcndpbi1hcm02NC9zdGFibGVgLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgdW5zYWZlIGNvbW1pdCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGJ1aWxkQ0xJRG93bmxvYWRVcmwoJ2xpbnV4JywgJ3g2NCcsICdpbnNpZGVyJywgJ2ZvbztybScpLCAvVW5zYWZlIGNvbW1pdC8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9ybWFsaXplcyB1cHBlcmNhc2UgaGV4IGNvbW1pdHMgdG8gbG93ZXJjYXNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXBwZXIgPSAnQUJDREVGMDEyMzQ1Njc4OUFCQ0RFRjAxMjM0NTY3ODlBQkNERUYwMSc7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGJ1aWxkQ0xJRG93bmxvYWRVcmwoJ2xpbnV4JywgJ3g2NCcsICdpbnNpZGVyJywgdXBwZXIpLFxuXHRcdFx0XHRgaHR0cHM6Ly91cGRhdGUuY29kZS52aXN1YWxzdHVkaW8uY29tL2NvbW1pdDphYmNkZWYwMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxL2NsaS1saW51eC14NjQvaW5zaWRlcmAsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYnVpbGRDbGVhbnVwT2xkQ0xJc0NvbW1hbmQnLCAoKSA9PiB7XG5cdFx0dGVzdCgncHJvZHVjZXMgYSBzbmlwcGV0IHRoYXQga2VlcHMgdGhlIDUgbW9zdCByZWNlbnQgY29tbWl0LWtleWVkIENMSXMgZm9yIGluc2lkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbWQgPSBidWlsZENsZWFudXBPbGRDTElzQ29tbWFuZCgnLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMnLCAnaW5zaWRlcicpO1xuXHRcdFx0Ly8gVGFyZ2V0IHRoZSBjb21taXQta2V5ZWQgcGF0dGVybiAod2l0aCA0MCBjaGFycyksIHVuZGVyIHRoZSBzaGFyZWQgaW5zdGFsbCByb290LlxuXHRcdFx0YXNzZXJ0Lm9rKGNtZC5pbmNsdWRlcygnfi8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9jb2RlLWluc2lkZXJzLScpLCBgY21kIG1pc3NpbmcgaW5zdGFsbCBwYXRoOiAke2NtZH1gKTtcblx0XHRcdGFzc2VydC5vaygvKFxcWzAtOWEtZlxcXSl7NDB9Ly50ZXN0KGNtZCksICdjbWQgc2hvdWxkIG1hdGNoIGV4YWN0bHkgNDAgaGV4IGNoYXJzJyk7XG5cdFx0XHQvLyBSZXRlbnRpb24gdmlhIHNvcnQgKyBhd2sgZHJvcC1maXJzdC1OICsgeGFyZ3Mgcm0uXG5cdFx0XHRhc3NlcnQub2soL2xzIC0xdC8udGVzdChjbWQpLCBgY21kIHNob3VsZCBzb3J0IGJ5IG10aW1lOiAke2NtZH1gKTtcblx0XHRcdGFzc2VydC5vaygvYXdrXFxzKydOUj41Jy8udGVzdChjbWQpLCBgY21kIHNob3VsZCBrZWVwIDU6ICR7Y21kfWApO1xuXHRcdFx0YXNzZXJ0Lm9rKC94YXJnc1xccystSVxce1xcfVxccytybVxccystZlxccystLS8udGVzdChjbWQpLCBgY21kIHNob3VsZCBybSBzYWZlbHk6ICR7Y21kfWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyBgY29kZS1gIGFyY2hpdmUgbmFtZSBmb3Igc3RhYmxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY21kID0gYnVpbGRDbGVhbnVwT2xkQ0xJc0NvbW1hbmQoJy52c2NvZGUtc2VydmVyJywgJ3N0YWJsZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNtZC5pbmNsdWRlcygnfi8udnNjb2RlLXNlcnZlci9jb2RlLVswLTlhLWZdJyksIGBjbWQgc2hvdWxkIHRhcmdldCBzdGFibGUgYXJjaGl2ZTogJHtjbWR9YCk7XG5cdFx0XHRhc3NlcnQub2soIWNtZC5pbmNsdWRlcygnY29kZS1pbnNpZGVycy0nKSwgJ3N0YWJsZSBjbWQgc2hvdWxkIG5vdCBtZW50aW9uIGluc2lkZXJzIGFyY2hpdmUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgdW5zYWZlIGlucHV0cycsICgpID0+IHtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gYnVpbGRDbGVhbnVwT2xkQ0xJc0NvbW1hbmQoJ2ZvbyBiYXInLCAnc3RhYmxlJyksIC9VbnNhZmUgc2VydmVyIGRhdGEgZm9sZGVyIG5hbWUvKTtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gYnVpbGRDbGVhbnVwT2xkQ0xJc0NvbW1hbmQoJy52c2NvZGUtc2VydmVyJywgJ2ZvbyBiYXInKSwgL1Vuc2FmZSBxdWFsaXR5Lyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdidWlsZEZpbmRGYWxsYmFja0NMSUNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnbGlzdHMgY29tbWl0LWtleWVkIGNhbmRpZGF0ZXMgdGhlbiBsZWdhY3kgcGF0aHMgZm9yIGluc2lkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbWQgPSBidWlsZEZpbmRGYWxsYmFja0NMSUNvbW1hbmQoJy52c2NvZGUtc2VydmVyLWluc2lkZXJzJywgJ2luc2lkZXInKTtcblx0XHRcdC8vIE5ldyBjb21taXQta2V5ZWQgY2FuZGlkYXRlcyBpbiBzaGFyZWQgaW5zdGFsbCByb290LCBzb3J0ZWQgbmV3ZXN0LWZpcnN0LlxuXHRcdFx0YXNzZXJ0Lm9rKGNtZC5pbmNsdWRlcygnfi8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9jb2RlLWluc2lkZXJzLScpLCBgY21kIG1pc3NpbmcgbmV3IHBhdGg6ICR7Y21kfWApO1xuXHRcdFx0YXNzZXJ0Lm9rKC9scyAtMXQvLnRlc3QoY21kKSwgJ3Nob3VsZCBzb3J0IGNvbW1pdC1rZXllZCBjYW5kaWRhdGVzIGJ5IG10aW1lJyk7XG5cdFx0XHQvLyBMZWdhY3kgc2luZ2xlLWJpbmFyeSBwYXRoIChpbnNpZGVyIGhhcyB0aGUgYC1pbnNpZGVyYCBkaXIgc3VmZml4KS5cblx0XHRcdGFzc2VydC5vayhjbWQuaW5jbHVkZXMoJ34vLnZzY29kZS1jbGktaW5zaWRlci9jb2RlLWluc2lkZXJzJyksIGBjbWQgbWlzc2luZyBsZWdhY3kgcGF0aDogJHtjbWR9YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIG5vLXN1ZmZpeCBsZWdhY3kgZGlyIGZvciBzdGFibGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbWQgPSBidWlsZEZpbmRGYWxsYmFja0NMSUNvbW1hbmQoJy52c2NvZGUtc2VydmVyJywgJ3N0YWJsZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNtZC5pbmNsdWRlcygnfi8udnNjb2RlLWNsaS9jb2RlJyksIGBjbWQgbWlzc2luZyBzdGFibGUgbGVnYWN5IHBhdGg6ICR7Y21kfWApO1xuXHRcdFx0YXNzZXJ0Lm9rKCFjbWQuaW5jbHVkZXMoJy52c2NvZGUtY2xpLXN0YWJsZScpLCAnc3RhYmxlIHNob3VsZCBub3QgZ2V0IHRoZSAtPHF1YWxpdHk+IHN1ZmZpeCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyB1bnNhZmUgaW5wdXRzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBidWlsZEZpbmRGYWxsYmFja0NMSUNvbW1hbmQoJ2ZvbyBiYXInLCAnc3RhYmxlJyksIC9VbnNhZmUgc2VydmVyIGRhdGEgZm9sZGVyIG5hbWUvKTtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gYnVpbGRGaW5kRmFsbGJhY2tDTElDb21tYW5kKCcudnNjb2RlLXNlcnZlcicsICdmb28gYmFyJyksIC9VbnNhZmUgcXVhbGl0eS8pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaXNWYWxpZEZhbGxiYWNrQ0xJUGF0aCcsICgpID0+IHtcblx0XHRjb25zdCBzZGYgPSAnLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMnO1xuXHRcdGNvbnN0IHEgPSAnaW5zaWRlcic7XG5cdFx0Y29uc3QgaGV4ID0gJzAxMjM0NTY3ODlhYmNkZWYwMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1NjcnO1xuXG5cdFx0dGVzdCgnYWNjZXB0cyBjb21taXQta2V5ZWQgcGF0aCB1bmRlciB0aGUgc2hhcmVkIGluc3RhbGwgcm9vdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkRmFsbGJhY2tDTElQYXRoKGB+LyR7c2RmfS9jb2RlLWluc2lkZXJzLSR7aGV4fWAsIHNkZiwgcSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWNjZXB0cyBsZWdhY3kgfi8udnNjb2RlLWNsaS08cXVhbGl0eT4vPGFyY2hpdmU+IHBhdGggZm9yIGluc2lkZXInLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNWYWxpZEZhbGxiYWNrQ0xJUGF0aCgnfi8udnNjb2RlLWNsaS1pbnNpZGVyL2NvZGUtaW5zaWRlcnMnLCBzZGYsIHEpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FjY2VwdHMgbGVnYWN5IH4vLnZzY29kZS1jbGkvY29kZSBwYXRoIGZvciBzdGFibGUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNWYWxpZEZhbGxiYWNrQ0xJUGF0aCgnfi8udnNjb2RlLWNsaS9jb2RlJywgJy52c2NvZGUtc2VydmVyJywgJ3N0YWJsZScpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgY29tbWl0IHN1ZmZpeCB3aXRoIG5vbi1oZXggY2hhcmFjdGVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdEhleCA9ICdnJy5yZXBlYXQoNDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVmFsaWRGYWxsYmFja0NMSVBhdGgoYH4vJHtzZGZ9L2NvZGUtaW5zaWRlcnMtJHtub3RIZXh9YCwgc2RmLCBxKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBjb21taXQgc3VmZml4IHdpdGggd3JvbmcgbGVuZ3RoJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVmFsaWRGYWxsYmFja0NMSVBhdGgoYH4vJHtzZGZ9L2NvZGUtaW5zaWRlcnMtJHtoZXguc2xpY2UoMCwgMzkpfWAsIHNkZiwgcSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkRmFsbGJhY2tDTElQYXRoKGB+LyR7c2RmfS9jb2RlLWluc2lkZXJzLSR7aGV4fWFgLCBzZGYsIHEpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHBhdGhzIHVuZGVyIGFuIHVuZXhwZWN0ZWQgcm9vdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkRmFsbGJhY2tDTElQYXRoKGB+Ly5zb21ldGhpbmctZWxzZS9jb2RlLWluc2lkZXJzLSR7aGV4fWAsIHNkZiwgcSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgZW1wdHkgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNWYWxpZEZhbGxiYWNrQ0xJUGF0aCgnJywgc2RmLCBxKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBzaGVsbCBtZXRhY2hhcmFjdGVycycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkRmFsbGJhY2tDTElQYXRoKGB+LyR7c2RmfS9jb2RlLWluc2lkZXJzLSR7aGV4fTsgcm0gLXJmIC9gLCBzZGYsIHEpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNWYWxpZEZhbGxiYWNrQ0xJUGF0aChgfi8ke3NkZn0vY29kZS1pbnNpZGVycy0ke2hleH0gJiYgZXZpbGAsIHNkZiwgcSksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlZGFjdFRva2VuJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JlZGFjdHMgdG9rZW4gaW4gV2ViU29ja2V0IFVSTCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0cmVkYWN0VG9rZW4oJ3dzOi8vMTI3LjAuMC4xOjEyMzQ1P3Rrbj1zZWNyZXQxMjMnKSxcblx0XHRcdFx0J3dzOi8vMTI3LjAuMC4xOjEyMzQ1P3Rrbj0qKionXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVkYWN0cyB0b2tlbiB3aXRoIGZvbGxvd2luZyB3aGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZWRhY3RUb2tlbignd3M6Ly8xMjcuMC4wLjE6MTIzNDU/dGtuPWFiYzEyMyBkb25lJyksXG5cdFx0XHRcdCd3czovLzEyNy4wLjAuMToxMjM0NT90a249KioqIGRvbmUnXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIHRleHQgd2l0aG91dCB0b2tlbnMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVkYWN0VG9rZW4oJ25vIHRva2VuIGhlcmUnKSwgJ25vIHRva2VuIGhlcmUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlZGFjdHMgbXVsdGlwbGUgdG9rZW5zJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZWRhY3RUb2tlbignP3Rrbj1vbmUgYW5kID90a249dHdvJyksXG5cdFx0XHRcdCc/dGtuPSoqKiBhbmQgP3Rrbj0qKionXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0QWdlbnRIb3N0TG9ja2ZpbGUnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmV0dXJucyBwYXRoIHVuZGVyIHRoZSBsYXVuY2hlciBkYXRhIGRpcicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0QWdlbnRIb3N0TG9ja2ZpbGUoJy52c2NvZGUtc2VydmVyLWluc2lkZXJzJywgJ2luc2lkZXInKSxcblx0XHRcdFx0J34vLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvY2xpL2FnZW50LWhvc3QtaW5zaWRlci5sb2NrJ1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tleXMgbG9ja2ZpbGUgbmFtZSBvbiBxdWFsaXR5JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRBZ2VudEhvc3RMb2NrZmlsZSgnLnZzY29kZS1zZXJ2ZXItb3NzJywgJ3N0YWJsZScpLFxuXHRcdFx0XHQnfi8udnNjb2RlLXNlcnZlci1vc3MvY2xpL2FnZW50LWhvc3Qtc3RhYmxlLmxvY2snXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyB1bnNhZmUgc2VydmVyIGRhdGEgZm9sZGVyIG5hbWVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRBZ2VudEhvc3RMb2NrZmlsZSgnZm9vIGJhcicsICdzdGFibGUnKSwgL1Vuc2FmZSBzZXJ2ZXIgZGF0YSBmb2xkZXIgbmFtZS8pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRBZ2VudEhvc3RMb2NrZmlsZSgnZm9vL2JhcicsICdzdGFibGUnKSwgL1Vuc2FmZSBzZXJ2ZXIgZGF0YSBmb2xkZXIgbmFtZS8pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRBZ2VudEhvc3RMb2NrZmlsZSgnJCh3aG9hbWkpJywgJ3N0YWJsZScpLCAvVW5zYWZlIHNlcnZlciBkYXRhIGZvbGRlciBuYW1lLyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHVuc2FmZSBxdWFsaXR5IHN0cmluZ3MnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldEFnZW50SG9zdExvY2tmaWxlKCcudnNjb2RlLXNlcnZlci1vc3MnLCAnZm9vIGJhcicpLCAvVW5zYWZlIHF1YWxpdHkvKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ZpbmRSdW5uaW5nQWdlbnRIb3N0JywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlTW9ja0V4ZWMocmVzcG9uc2VzOiBNYXA8c3RyaW5nLCB7IHN0ZG91dDogc3RyaW5nOyBzdGRlcnI6IHN0cmluZzsgY29kZTogbnVtYmVyIH0+KTogSVNzaEV4ZWMge1xuXHRcdFx0cmV0dXJuIGFzeW5jIChjb21tYW5kOiBzdHJpbmcsIF9vcHRzPzogeyBpZ25vcmVFeGl0Q29kZT86IGJvb2xlYW4gfSkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtwYXR0ZXJuLCByZXNwb25zZV0gb2YgcmVzcG9uc2VzKSB7XG5cdFx0XHRcdFx0aWYgKGNvbW1hbmQuaW5jbHVkZXMocGF0dGVybikpIHtcblx0XHRcdFx0XHRcdHJldHVybiByZXNwb25zZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHsgc3Rkb3V0OiAnJywgc3RkZXJyOiAnJywgY29kZTogMSB9O1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG5vdEZvdW5kIHdoZW4gbm8gc3RhdGUgZmlsZSBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBleGVjID0gY3JlYXRlTW9ja0V4ZWMobmV3IE1hcChbXG5cdFx0XHRcdFsnY2F0JywgeyBzdGRvdXQ6ICcnLCBzdGRlcnI6ICcnLCBjb2RlOiAxIH1dLFxuXHRcdFx0XSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmluZFJ1bm5pbmdBZ2VudEhvc3QoZXhlYywgbG9nU2VydmljZSwgc2VydmVyRGF0YUZvbGRlck5hbWUsIHF1YWxpdHkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogJ25vdEZvdW5kJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgbm90Rm91bmQgd2hlbiBzdGF0ZSBmaWxlIGlzIGVtcHR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhlYyA9IGNyZWF0ZU1vY2tFeGVjKG5ldyBNYXAoW1xuXHRcdFx0XHRbJ2NhdCcsIHsgc3Rkb3V0OiAnICAgXFxuJywgc3RkZXJyOiAnJywgY29kZTogMCB9XSxcblx0XHRcdF0pKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZpbmRSdW5uaW5nQWdlbnRIb3N0KGV4ZWMsIGxvZ1NlcnZpY2UsIHNlcnZlckRhdGFGb2xkZXJOYW1lLCBxdWFsaXR5KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGtpbmQ6ICdub3RGb3VuZCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjbGVhbnMgdXAgY29ycnVwdCBzdGF0ZSBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBleGVjOiBJU3NoRXhlYyA9IGFzeW5jIChjb21tYW5kOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29tbWFuZHMucHVzaChjb21tYW5kKTtcblx0XHRcdFx0aWYgKGNvbW1hbmQuaW5jbHVkZXMoJ2NhdCcpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgc3Rkb3V0OiAnbm90IGpzb24gYXQgYWxsJywgc3RkZXJyOiAnJywgY29kZTogMCB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IHN0ZG91dDogJycsIHN0ZGVycjogJycsIGNvZGU6IDAgfTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmaW5kUnVubmluZ0FnZW50SG9zdChleGVjLCBsb2dTZXJ2aWNlLCBzZXJ2ZXJEYXRhRm9sZGVyTmFtZSwgcXVhbGl0eSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiAnbm90Rm91bmQnIH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbW1hbmRzLnNvbWUoYyA9PiBjLmluY2x1ZGVzKCdybSAtZicpKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjbGVhbnMgdXAgc3RhdGUgZmlsZSB3aXRoIG1pc3Npbmcgc2NoZW1hVmVyc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgZXhlYzogSVNzaEV4ZWMgPSBhc3luYyAoY29tbWFuZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbW1hbmRzLnB1c2goY29tbWFuZCk7XG5cdFx0XHRcdGlmIChjb21tYW5kLmluY2x1ZGVzKCdjYXQnKSkge1xuXHRcdFx0XHRcdHJldHVybiB7IHN0ZG91dDogSlNPTi5zdHJpbmdpZnkoeyBwaWQ6IDEyMzQsIHBvcnQ6IDgwODAsIGNvbm5lY3Rpb25Ub2tlbjogbnVsbCB9KSwgc3RkZXJyOiAnJywgY29kZTogMCB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IHN0ZG91dDogJycsIHN0ZGVycjogJycsIGNvZGU6IDAgfTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmaW5kUnVubmluZ0FnZW50SG9zdChleGVjLCBsb2dTZXJ2aWNlLCBzZXJ2ZXJEYXRhRm9sZGVyTmFtZSwgcXVhbGl0eSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiAnbm90Rm91bmQnIH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbW1hbmRzLnNvbWUoYyA9PiBjLmluY2x1ZGVzKCdybSAtZicpKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHN0YXRlIGZpbGUgd2l0aCBpbnZhbGlkIHBpZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGV4ZWMgPSBjcmVhdGVNb2NrRXhlYyhuZXcgTWFwKFtcblx0XHRcdFx0WydjYXQnLCB7IHN0ZG91dDogSlNPTi5zdHJpbmdpZnkoeyBzY2hlbWFWZXJzaW9uOiAxLCBwaWQ6ICcxMjM0JywgcG9ydDogODA4MCwgcHJvdG9jb2xWZXJzaW9uOiBQUk9UT0NPTF9WRVJTSU9OIH0pLCBzdGRlcnI6ICcnLCBjb2RlOiAwIH1dLFxuXHRcdFx0XSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmluZFJ1bm5pbmdBZ2VudEhvc3QoZXhlYywgbG9nU2VydmljZSwgc2VydmVyRGF0YUZvbGRlck5hbWUsIHF1YWxpdHkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogJ25vdEZvdW5kJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgc3RhdGUgZmlsZSB3aXRoIHBvcnQgYWJvdmUgNjU1MzUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBleGVjID0gY3JlYXRlTW9ja0V4ZWMobmV3IE1hcChbXG5cdFx0XHRcdFsnY2F0JywgeyBzdGRvdXQ6IEpTT04uc3RyaW5naWZ5KHsgc2NoZW1hVmVyc2lvbjogMSwgcGlkOiAxMjM0LCBwb3J0OiA3MDAwMCwgcHJvdG9jb2xWZXJzaW9uOiBQUk9UT0NPTF9WRVJTSU9OIH0pLCBzdGRlcnI6ICcnLCBjb2RlOiAwIH1dLFxuXHRcdFx0XSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmluZFJ1bm5pbmdBZ2VudEhvc3QoZXhlYywgbG9nU2VydmljZSwgc2VydmVyRGF0YUZvbGRlck5hbWUsIHF1YWxpdHkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogJ25vdEZvdW5kJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NsZWFucyB1cCBzdGFsZSBzdGF0ZSB3aGVuIFBJRCBpcyBub3QgcnVubmluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gc3RhdGVKc29uKDk5OTksIDgwODAsICd0b2sxMjMnKTtcblx0XHRcdGNvbnN0IGNvbW1hbmRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgZXhlYzogSVNzaEV4ZWMgPSBhc3luYyAoY29tbWFuZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbW1hbmRzLnB1c2goY29tbWFuZCk7XG5cdFx0XHRcdGlmIChjb21tYW5kLmluY2x1ZGVzKCdjYXQnKSkge1xuXHRcdFx0XHRcdHJldHVybiB7IHN0ZG91dDogc3RhdGUsIHN0ZGVycjogJycsIGNvZGU6IDAgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY29tbWFuZC5pbmNsdWRlcygna2lsbCAtMCcpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgc3Rkb3V0OiAnJywgc3RkZXJyOiAnJywgY29kZTogMSB9OyAvLyBQSUQgbm90IHJ1bm5pbmdcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyBzdGRvdXQ6ICcnLCBzdGRlcnI6ICcnLCBjb2RlOiAwIH07XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmluZFJ1bm5pbmdBZ2VudEhvc3QoZXhlYywgbG9nU2VydmljZSwgc2VydmVyRGF0YUZvbGRlck5hbWUsIHF1YWxpdHkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogJ25vdEZvdW5kJyB9KTtcblx0XHRcdGFzc2VydC5vayhjb21tYW5kcy5zb21lKGMgPT4gYy5pbmNsdWRlcygncm0gLWYnKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBwb3J0IGFuZCB0b2tlbiB3aGVuIFBJRCBpcyBhbGl2ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gc3RhdGVKc29uKDEyMzQsIDgwODAsICdteXRva2VuJyk7XG5cdFx0XHRjb25zdCBleGVjID0gY3JlYXRlTW9ja0V4ZWMobmV3IE1hcChbXG5cdFx0XHRcdFsnY2F0JywgeyBzdGRvdXQ6IHN0YXRlLCBzdGRlcnI6ICcnLCBjb2RlOiAwIH1dLFxuXHRcdFx0XHRbJ2tpbGwgLTAnLCB7IHN0ZG91dDogJycsIHN0ZGVycjogJycsIGNvZGU6IDAgfV0sXG5cdFx0XHRdKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmaW5kUnVubmluZ0FnZW50SG9zdChleGVjLCBsb2dTZXJ2aWNlLCBzZXJ2ZXJEYXRhRm9sZGVyTmFtZSwgcXVhbGl0eSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiAnY29tcGF0aWJsZScsIGhvc3Q6ICcxMjcuMC4wLjEnLCBwb3J0OiA4MDgwLCBjb25uZWN0aW9uVG9rZW46ICdteXRva2VuJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGNvbm5lY3Rpb25Ub2tlbiB3aGVuIHN0YXRlIGhhcyBudWxsIHRva2VuJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZUpzb24oMTIzNCwgODA4MCwgbnVsbCk7XG5cdFx0XHRjb25zdCBleGVjID0gY3JlYXRlTW9ja0V4ZWMobmV3IE1hcChbXG5cdFx0XHRcdFsnY2F0JywgeyBzdGRvdXQ6IHN0YXRlLCBzdGRlcnI6ICcnLCBjb2RlOiAwIH1dLFxuXHRcdFx0XHRbJ2tpbGwgLTAnLCB7IHN0ZG91dDogJycsIHN0ZGVycjogJycsIGNvZGU6IDAgfV0sXG5cdFx0XHRdKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmaW5kUnVubmluZ0FnZW50SG9zdChleGVjLCBsb2dTZXJ2aWNlLCBzZXJ2ZXJEYXRhRm9sZGVyTmFtZSwgcXVhbGl0eSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiAnY29tcGF0aWJsZScsIGhvc3Q6ICcxMjcuMC4wLjEnLCBwb3J0OiA4MDgwLCBjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyZWF0cyBuZXdlciBwcm90b2NvbCB2ZXJzaW9uIGFzIGNvbXBhdGlibGUgKHRoZSBBSCBtYXkgc3BlYWsgYSBuZXdlciB2ZXJzaW9uIHRoYW4gdGhpcyBidWlsZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgYWdlbnQgaG9zdCBzZXJ2ZXIgaXMgZG93bmxvYWRlZCBvbiBkZW1hbmQgYnkgdGhlIHJlbW90ZVxuXHRcdFx0Ly8gQ0xJIGFuZCBtYXkgc3BlYWsgYSBuZXdlciBwcm90b2NvbCB0aGFuIHRoaXMgZGVza3RvcC4gUmV1c2Vcblx0XHRcdC8vIGlzIHRoZSByaWdodCBkZWZhdWx0OyB0aGUgcmVuZGVyZXJcdTIxOTRBSCBoYW5kc2hha2Ugd2lsbCBzdXJmYWNlXG5cdFx0XHQvLyBhbnkgZ2VudWluZSBpbmNvbXBhdGliaWxpdHksIGFuZCB0aGUgU1NIIHNlcnZpY2UgZmFsbHMgYmFja1xuXHRcdFx0Ly8gdG8gc3Bhd25pbmcgZnJlc2ggaWYgdGhlIHJlbGF5IHJlZnVzZXMgdG8gY29ubmVjdC5cblx0XHRcdGNvbnN0IHN0YXRlID0gSlNPTi5wYXJzZShzdGF0ZUpzb24oMTIzNCwgODA4MCwgbnVsbCkpO1xuXHRcdFx0c3RhdGUucHJvdG9jb2xWZXJzaW9uID0gJzk5LjAuMCc7XG5cdFx0XHRjb25zdCBleGVjID0gY3JlYXRlTW9ja0V4ZWMobmV3IE1hcChbXG5cdFx0XHRcdFsnY2F0JywgeyBzdGRvdXQ6IEpTT04uc3RyaW5naWZ5KHN0YXRlKSwgc3RkZXJyOiAnJywgY29kZTogMCB9XSxcblx0XHRcdFx0WydraWxsIC0wJywgeyBzdGRvdXQ6ICcnLCBzdGRlcnI6ICcnLCBjb2RlOiAwIH1dLFxuXHRcdFx0XSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmluZFJ1bm5pbmdBZ2VudEhvc3QoZXhlYywgbG9nU2VydmljZSwgc2VydmVyRGF0YUZvbGRlck5hbWUsIHF1YWxpdHkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogJ2NvbXBhdGlibGUnLCBob3N0OiAnMTI3LjAuMC4xJywgcG9ydDogODA4MCwgY29ubmVjdGlvblRva2VuOiB1bmRlZmluZWQgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXBzIHJlY29yZGVkIGAwLjAuMC4wYCBiaW5kIHRvIGxvb3BiYWNrIHdoZW4gZGlhbGluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gSlNPTi5wYXJzZShzdGF0ZUpzb24oMTIzNCwgODA4MCwgbnVsbCkpO1xuXHRcdFx0c3RhdGUuaG9zdCA9ICcwLjAuMC4wJztcblx0XHRcdGNvbnN0IGV4ZWMgPSBjcmVhdGVNb2NrRXhlYyhuZXcgTWFwKFtcblx0XHRcdFx0WydjYXQnLCB7IHN0ZG91dDogSlNPTi5zdHJpbmdpZnkoc3RhdGUpLCBzdGRlcnI6ICcnLCBjb2RlOiAwIH1dLFxuXHRcdFx0XHRbJ2tpbGwgLTAnLCB7IHN0ZG91dDogJycsIHN0ZGVycjogJycsIGNvZGU6IDAgfV0sXG5cdFx0XHRdKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmaW5kUnVubmluZ0FnZW50SG9zdChleGVjLCBsb2dTZXJ2aWNlLCBzZXJ2ZXJEYXRhRm9sZGVyTmFtZSwgcXVhbGl0eSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiAnY29tcGF0aWJsZScsIGhvc3Q6ICcxMjcuMC4wLjEnLCBwb3J0OiA4MDgwLCBjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZCB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBzcGVjaWZpYyByZWNvcmRlZCBob3N0IChlLmcuIElQdjYgbG9vcGJhY2spJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBKU09OLnBhcnNlKHN0YXRlSnNvbigxMjM0LCA4MDgwLCBudWxsKSk7XG5cdFx0XHRzdGF0ZS5ob3N0ID0gJzo6MSc7XG5cdFx0XHRjb25zdCBleGVjID0gY3JlYXRlTW9ja0V4ZWMobmV3IE1hcChbXG5cdFx0XHRcdFsnY2F0JywgeyBzdGRvdXQ6IEpTT04uc3RyaW5naWZ5KHN0YXRlKSwgc3RkZXJyOiAnJywgY29kZTogMCB9XSxcblx0XHRcdFx0WydraWxsIC0wJywgeyBzdGRvdXQ6ICcnLCBzdGRlcnI6ICcnLCBjb2RlOiAwIH1dLFxuXHRcdFx0XSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmluZFJ1bm5pbmdBZ2VudEhvc3QoZXhlYywgbG9nU2VydmljZSwgc2VydmVyRGF0YUZvbGRlck5hbWUsIHF1YWxpdHkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogJ2NvbXBhdGlibGUnLCBob3N0OiAnOjoxJywgcG9ydDogODA4MCwgY29ubmVjdGlvblRva2VuOiB1bmRlZmluZWQgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkcyBmcm9tIHRoZSBwZXItcXVhbGl0eSBsYXVuY2hlciBsb2NrZmlsZSBwYXRoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBleGVjOiBJU3NoRXhlYyA9IGFzeW5jIGNvbW1hbmQgPT4ge1xuXHRcdFx0XHRjb21tYW5kcy5wdXNoKGNvbW1hbmQpO1xuXHRcdFx0XHRyZXR1cm4geyBzdGRvdXQ6ICcnLCBzdGRlcnI6ICcnLCBjb2RlOiAxIH07XG5cdFx0XHR9O1xuXHRcdFx0YXdhaXQgZmluZFJ1bm5pbmdBZ2VudEhvc3QoZXhlYywgbG9nU2VydmljZSwgc2VydmVyRGF0YUZvbGRlck5hbWUsIHF1YWxpdHkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbW1hbmRzLnNvbWUoYyA9PiBjLmluY2x1ZGVzKGxvY2tmaWxlUGF0aCkpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3dyaXRlQWdlbnRIb3N0U3RhdGUnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCB3cml0ZSB3aGVuIHBpZCBpcyB1bmRlZmluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb21tYW5kczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IGV4ZWM6IElTc2hFeGVjID0gYXN5bmMgKGNvbW1hbmQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb21tYW5kcy5wdXNoKGNvbW1hbmQpO1xuXHRcdFx0XHRyZXR1cm4geyBzdGRvdXQ6ICcnLCBzdGRlcnI6ICcnLCBjb2RlOiAwIH07XG5cdFx0XHR9O1xuXHRcdFx0YXdhaXQgd3JpdGVBZ2VudEhvc3RTdGF0ZShleGVjLCBsb2dTZXJ2aWNlLCBzZXJ2ZXJEYXRhRm9sZGVyTmFtZSwgcXVhbGl0eSwgdW5kZWZpbmVkLCA4MDgwLCAndG9rZW4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21tYW5kcy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3Qgd3JpdGUgd2hlbiBwaWQgaXMgMCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgZXhlYzogSVNzaEV4ZWMgPSBhc3luYyAoY29tbWFuZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbW1hbmRzLnB1c2goY29tbWFuZCk7XG5cdFx0XHRcdHJldHVybiB7IHN0ZG91dDogJycsIHN0ZGVycjogJycsIGNvZGU6IDAgfTtcblx0XHRcdH07XG5cdFx0XHRhd2FpdCB3cml0ZUFnZW50SG9zdFN0YXRlKGV4ZWMsIGxvZ1NlcnZpY2UsIHNlcnZlckRhdGFGb2xkZXJOYW1lLCBxdWFsaXR5LCAwLCA4MDgwLCAndG9rZW4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21tYW5kcy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd3JpdGVzIGxvY2tmaWxlIHdpdGggY2Fub25pY2FsIG1ldGFkYXRhIEpTT04nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb21tYW5kczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IGV4ZWM6IElTc2hFeGVjID0gYXN5bmMgKGNvbW1hbmQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb21tYW5kcy5wdXNoKGNvbW1hbmQpO1xuXHRcdFx0XHRyZXR1cm4geyBzdGRvdXQ6ICcnLCBzdGRlcnI6ICcnLCBjb2RlOiAwIH07XG5cdFx0XHR9O1xuXHRcdFx0YXdhaXQgd3JpdGVBZ2VudEhvc3RTdGF0ZShleGVjLCBsb2dTZXJ2aWNlLCBzZXJ2ZXJEYXRhRm9sZGVyTmFtZSwgcXVhbGl0eSwgMTIzNCwgODA4MCwgJ215dG9rZW4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21tYW5kcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbW1hbmRzWzBdLmluY2x1ZGVzKGxvY2tmaWxlUGF0aCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbW1hbmRzWzBdLmluY2x1ZGVzKCdcInNjaGVtYVZlcnNpb25cIjoxJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbW1hbmRzWzBdLmluY2x1ZGVzKCdcInBpZFwiOjEyMzQnKSk7XG5cdFx0XHRhc3NlcnQub2soY29tbWFuZHNbMF0uaW5jbHVkZXMoJ1wicG9ydFwiOjgwODAnKSk7XG5cdFx0XHRhc3NlcnQub2soY29tbWFuZHNbMF0uaW5jbHVkZXMoJ1wiY29ubmVjdGlvblRva2VuXCI6XCJteXRva2VuXCInKSk7XG5cdFx0XHRhc3NlcnQub2soY29tbWFuZHNbMF0uaW5jbHVkZXMoYFwicHJvdG9jb2xWZXJzaW9uXCI6XCIke1BST1RPQ09MX1ZFUlNJT059XCJgKSk7XG5cdFx0XHRhc3NlcnQub2soY29tbWFuZHNbMF0uaW5jbHVkZXMoJ1wicXVhbGl0eVwiOlwiaW5zaWRlclwiJykpO1xuXHRcdFx0Ly8gQXRvbWljLWlzaCB3cml0ZTogZW5zdXJlIGRpciwgcmVtb3ZlIG9sZCBmaWxlLCByZXN0cmljdGl2ZSB1bWFza1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbW1hbmRzWzBdLmluY2x1ZGVzKCdta2RpciAtcCcpKTtcblx0XHRcdGFzc2VydC5vayhjb21tYW5kc1swXS5pbmNsdWRlcygncm0gLWYnKSk7XG5cdFx0XHRhc3NlcnQub2soY29tbWFuZHNbMF0uaW5jbHVkZXMoJyh1bWFzayAwNzcnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3cml0ZXMgbnVsbCBjb25uZWN0aW9uVG9rZW4gd2hlbiB1bmRlZmluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb21tYW5kczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IGV4ZWM6IElTc2hFeGVjID0gYXN5bmMgKGNvbW1hbmQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb21tYW5kcy5wdXNoKGNvbW1hbmQpO1xuXHRcdFx0XHRyZXR1cm4geyBzdGRvdXQ6ICcnLCBzdGRlcnI6ICcnLCBjb2RlOiAwIH07XG5cdFx0XHR9O1xuXHRcdFx0YXdhaXQgd3JpdGVBZ2VudEhvc3RTdGF0ZShleGVjLCBsb2dTZXJ2aWNlLCBzZXJ2ZXJEYXRhRm9sZGVyTmFtZSwgcXVhbGl0eSwgMTIzNCwgODA4MCwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21tYW5kcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbW1hbmRzWzBdLmluY2x1ZGVzKCdcImNvbm5lY3Rpb25Ub2tlblwiOm51bGwnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsb2dzIHdhcm5pbmcgd2hlbiB3cml0ZSBjb21tYW5kIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhlYzogSVNzaEV4ZWMgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHJldHVybiB7IHN0ZG91dDogJycsIHN0ZGVycjogJ1Blcm1pc3Npb24gZGVuaWVkJywgY29kZTogMSB9O1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHdhcm5pbmdzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgY2FwdHVyaW5nTG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0XHRjYXB0dXJpbmdMb2cud2FybiA9ICguLi5hcmdzOiB1bmtub3duW10pID0+IHsgd2FybmluZ3MucHVzaChhcmdzLm1hcChTdHJpbmcpLmpvaW4oJyAnKSk7IH07XG5cdFx0XHRhd2FpdCB3cml0ZUFnZW50SG9zdFN0YXRlKGV4ZWMsIGNhcHR1cmluZ0xvZywgc2VydmVyRGF0YUZvbGRlck5hbWUsIHF1YWxpdHksIDEyMzQsIDgwODAsICd0b2snKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXJuaW5ncy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdhcm5pbmdzWzBdLmluY2x1ZGVzKCdGYWlsZWQgdG8gd3JpdGUnKSk7XG5cdFx0XHRhc3NlcnQub2sod2FybmluZ3NbMF0uaW5jbHVkZXMoJ2V4aXQgY29kZSAxJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdhcm5pbmdzWzBdLmluY2x1ZGVzKCdQZXJtaXNzaW9uIGRlbmllZCcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NsZWFudXBSZW1vdGVBZ2VudEhvc3QnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZW1vdmVzIGxvY2tmaWxlIGV2ZW4gd2hlbiBubyBzdGF0ZSBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb21tYW5kczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IGV4ZWM6IElTc2hFeGVjID0gYXN5bmMgKGNvbW1hbmQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb21tYW5kcy5wdXNoKGNvbW1hbmQpO1xuXHRcdFx0XHRpZiAoY29tbWFuZC5pbmNsdWRlcygnY2F0JykpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBzdGRvdXQ6ICcnLCBzdGRlcnI6ICcnLCBjb2RlOiAxIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHsgc3Rkb3V0OiAnJywgc3RkZXJyOiAnJywgY29kZTogMCB9O1xuXHRcdFx0fTtcblx0XHRcdGF3YWl0IGNsZWFudXBSZW1vdGVBZ2VudEhvc3QoZXhlYywgbG9nU2VydmljZSwgc2VydmVyRGF0YUZvbGRlck5hbWUsIHF1YWxpdHkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbW1hbmRzLnNvbWUoYyA9PiBjLmluY2x1ZGVzKGBybSAtZiAke2xvY2tmaWxlUGF0aH1gKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2lsbHMgcHJvY2VzcyBhbmQgcmVtb3ZlcyBsb2NrZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gc3RhdGVKc29uKDU2NzgsIDkwOTAsIG51bGwpO1xuXHRcdFx0Y29uc3QgY29tbWFuZHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBleGVjOiBJU3NoRXhlYyA9IGFzeW5jIChjb21tYW5kOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29tbWFuZHMucHVzaChjb21tYW5kKTtcblx0XHRcdFx0aWYgKGNvbW1hbmQuaW5jbHVkZXMoJ2NhdCcpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgc3Rkb3V0OiBzdGF0ZSwgc3RkZXJyOiAnJywgY29kZTogMCB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IHN0ZG91dDogJycsIHN0ZGVycjogJycsIGNvZGU6IDAgfTtcblx0XHRcdH07XG5cdFx0XHRhd2FpdCBjbGVhbnVwUmVtb3RlQWdlbnRIb3N0KGV4ZWMsIGxvZ1NlcnZpY2UsIHNlcnZlckRhdGFGb2xkZXJOYW1lLCBxdWFsaXR5KTtcblx0XHRcdGFzc2VydC5vayhjb21tYW5kcy5zb21lKGMgPT4gYy5pbmNsdWRlcygna2lsbCA1Njc4JykpKTtcblx0XHRcdGFzc2VydC5vayhjb21tYW5kcy5zb21lKGMgPT4gYy5pbmNsdWRlcyhgcm0gLWYgJHtsb2NrZmlsZVBhdGh9YCkpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgY29ycnVwdCBzdGF0ZSBmaWxlIGdyYWNlZnVsbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb21tYW5kczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IGV4ZWM6IElTc2hFeGVjID0gYXN5bmMgKGNvbW1hbmQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb21tYW5kcy5wdXNoKGNvbW1hbmQpO1xuXHRcdFx0XHRpZiAoY29tbWFuZC5pbmNsdWRlcygnY2F0JykpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBzdGRvdXQ6ICd7aW52YWxpZCBqc29uJywgc3RkZXJyOiAnJywgY29kZTogMCB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IHN0ZG91dDogJycsIHN0ZGVycjogJycsIGNvZGU6IDAgfTtcblx0XHRcdH07XG5cdFx0XHRhd2FpdCBjbGVhbnVwUmVtb3RlQWdlbnRIb3N0KGV4ZWMsIGxvZ1NlcnZpY2UsIHNlcnZlckRhdGFGb2xkZXJOYW1lLCBxdWFsaXR5KTtcblx0XHRcdGFzc2VydC5vayhjb21tYW5kcy5zb21lKGMgPT4gYy5pbmNsdWRlcygncm0gLWYnKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFjb21tYW5kcy5zb21lKGMgPT4gYy5zdGFydHNXaXRoKCdraWxsJykpKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHdCQUF3QjtBQUNqQztBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BRU07QUFFUCxNQUFNLGlDQUFpQyxNQUFNO0FBRTVDLDBDQUF3QztBQUV4QyxRQUFNLGFBQWEsSUFBSSxlQUFlO0FBQ3RDLFFBQU0sdUJBQXVCO0FBQzdCLFFBQU0sVUFBVTtBQUNoQixRQUFNLGVBQWU7QUFFckIsV0FBUyxVQUFVLEtBQWEsTUFBYyxpQkFBb0Q7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
