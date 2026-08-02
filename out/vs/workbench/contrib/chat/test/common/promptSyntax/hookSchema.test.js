import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { resolveHookCommand, resolveEffectiveCommand, formatHookCommandLabel, parseSubagentHooksFromYaml, ChatRequestHooks } from "../../../common/promptSyntax/hookSchema.js";
import { URI } from "../../../../../../base/common/uri.js";
import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { HookType } from "../../../common/promptSyntax/hookTypes.js";
import { Range } from "../../../../../../editor/common/core/range.js";
suite("HookSchema", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("resolveHookCommand", () => {
    const workspaceRoot = URI.file("/workspace");
    const userHome = "/home/user";
    suite("command property", () => {
      test("resolves basic command", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "echo hello"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "echo hello",
          cwd: workspaceRoot
        });
      });
      test("resolves command with all optional properties", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "./scripts/validate.sh",
          cwd: "src",
          env: { NODE_ENV: "test" },
          timeout: 60
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "./scripts/validate.sh",
          cwd: URI.file("/workspace/src"),
          env: { NODE_ENV: "test" },
          timeout: 60
        });
      });
      test("empty command returns object without command", () => {
        const result = resolveHookCommand({
          type: "command",
          command: ""
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          cwd: workspaceRoot
        });
      });
    });
    suite("bash legacy mapping", () => {
      test("bash maps to linux and osx", () => {
        const result = resolveHookCommand({
          type: "command",
          bash: 'echo "hello world"'
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          linux: 'echo "hello world"',
          osx: 'echo "hello world"',
          linuxSource: "bash",
          osxSource: "bash",
          cwd: workspaceRoot
        });
      });
      test("bash with cwd and env", () => {
        const result = resolveHookCommand({
          type: "command",
          bash: "./test.sh",
          cwd: "scripts",
          env: { DEBUG: "1" }
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          linux: "./test.sh",
          osx: "./test.sh",
          linuxSource: "bash",
          osxSource: "bash",
          cwd: URI.file("/workspace/scripts"),
          env: { DEBUG: "1" }
        });
      });
      test("empty bash returns object without platform overrides", () => {
        const result = resolveHookCommand({
          type: "command",
          bash: ""
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          cwd: workspaceRoot
        });
      });
    });
    suite("powershell legacy mapping", () => {
      test("powershell maps to windows", () => {
        const result = resolveHookCommand({
          type: "command",
          powershell: 'Write-Host "hello"'
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          windows: 'Write-Host "hello"',
          windowsSource: "powershell",
          cwd: workspaceRoot
        });
      });
      test("powershell with timeout", () => {
        const result = resolveHookCommand({
          type: "command",
          powershell: "Get-Process",
          timeout: 30
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          windows: "Get-Process",
          windowsSource: "powershell",
          cwd: workspaceRoot,
          timeout: 30
        });
      });
      test("empty powershell returns object without windows", () => {
        const result = resolveHookCommand({
          type: "command",
          powershell: ""
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          cwd: workspaceRoot
        });
      });
    });
    suite("multiple properties specified", () => {
      test("preserves command with bash mapped to linux/osx", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "direct-command",
          bash: "bash-script.sh"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "direct-command",
          linux: "bash-script.sh",
          osx: "bash-script.sh",
          linuxSource: "bash",
          osxSource: "bash",
          cwd: workspaceRoot
        });
      });
      test("preserves command with powershell mapped to windows", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "direct-command",
          powershell: "ps-script.ps1"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "direct-command",
          windows: "ps-script.ps1",
          windowsSource: "powershell",
          cwd: workspaceRoot
        });
      });
      test("bash and powershell map to all platforms", () => {
        const result = resolveHookCommand({
          type: "command",
          bash: "bash-script.sh",
          powershell: "ps-script.ps1"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          windows: "ps-script.ps1",
          linux: "bash-script.sh",
          osx: "bash-script.sh",
          windowsSource: "powershell",
          linuxSource: "bash",
          osxSource: "bash",
          cwd: workspaceRoot
        });
      });
    });
    suite("cwd resolution", () => {
      test("cwd is not resolved when no workspace root", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "echo hello",
          cwd: "src"
        }, void 0, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "echo hello"
        });
      });
      test("cwd is resolved relative to workspace root", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "echo hello",
          cwd: "nested/path"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "echo hello",
          cwd: URI.file("/workspace/nested/path")
        });
      });
    });
    suite("invalid inputs", () => {
      test("wrong type returns undefined", () => {
        const result = resolveHookCommand({
          type: "script",
          command: "echo hello"
        }, workspaceRoot, userHome);
        assert.strictEqual(result, void 0);
      });
      test("missing type returns undefined", () => {
        const result = resolveHookCommand({
          command: "echo hello"
        }, workspaceRoot, userHome);
        assert.strictEqual(result, void 0);
      });
      test("no command returns object with just type and cwd", () => {
        const result = resolveHookCommand({
          type: "command",
          cwd: "/workspace"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          cwd: URI.file("/workspace")
        });
      });
      test("ignores non-string cwd", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "echo hello",
          cwd: 123
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "echo hello",
          cwd: workspaceRoot
        });
      });
      test("ignores non-object env", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "echo hello",
          env: "invalid"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "echo hello",
          cwd: workspaceRoot
        });
      });
      test("ignores non-number timeout", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "echo hello",
          timeout: "30"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "echo hello",
          cwd: workspaceRoot
        });
      });
    });
    suite("platform-specific overrides", () => {
      test("preserves windows override as string", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "default-command",
          windows: "win-command"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "default-command",
          windows: "win-command",
          windowsSource: "windows",
          cwd: workspaceRoot
        });
      });
      test("preserves linux override as string", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "default-command",
          linux: "linux-command"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "default-command",
          linux: "linux-command",
          linuxSource: "linux",
          cwd: workspaceRoot
        });
      });
      test("preserves osx override as string", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "default-command",
          osx: "osx-command"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "default-command",
          osx: "osx-command",
          osxSource: "osx",
          cwd: workspaceRoot
        });
      });
      test("preserves all platform overrides", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "default-command",
          windows: "win-command",
          linux: "linux-command",
          osx: "osx-command"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "default-command",
          windows: "win-command",
          linux: "linux-command",
          osx: "osx-command",
          windowsSource: "windows",
          linuxSource: "linux",
          osxSource: "osx",
          cwd: workspaceRoot
        });
      });
      test("explicit platform override takes precedence over bash/powershell mapping", () => {
        const result = resolveHookCommand({
          type: "command",
          bash: "default.sh",
          linux: "explicit-linux.sh"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          linux: "explicit-linux.sh",
          osx: "default.sh",
          linuxSource: "linux",
          osxSource: "bash",
          cwd: workspaceRoot
        });
      });
      test("ignores empty platform override", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "default-command",
          windows: ""
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "default-command",
          cwd: workspaceRoot
        });
      });
      test("ignores non-string platform override", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "default-command",
          windows: { command: "invalid" }
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "default-command",
          cwd: workspaceRoot
        });
      });
    });
  });
  suite("resolveEffectiveCommand", () => {
    test("returns base command when no platform override", () => {
      const hook = {
        type: "command",
        command: "default-command"
      };
      assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Windows), "default-command");
      assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Macintosh), "default-command");
      assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Linux), "default-command");
    });
    test("applies platform override for each platform", () => {
      const hook = {
        type: "command",
        command: "default-command",
        windows: "win-command",
        linux: "linux-command",
        osx: "osx-command"
      };
      assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Windows), "win-command");
      assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Macintosh), "osx-command");
      assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Linux), "linux-command");
    });
    test("falls back to command when no platform-specific override", () => {
      const hook = {
        type: "command",
        command: "default-command"
      };
      assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Windows), "default-command");
    });
    test("returns undefined when no command at all", () => {
      const hook = {
        type: "command"
      };
      assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Windows), void 0);
    });
  });
  suite("formatHookCommandLabel", () => {
    test("formats command when present (no platform override)", () => {
      const hook = {
        type: "command",
        command: "echo hello"
      };
      assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Windows), "echo hello");
      assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Macintosh), "echo hello");
      assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Linux), "echo hello");
    });
    test("returns empty string when no command", () => {
      const hook = {
        type: "command"
      };
      assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Windows), "");
    });
    test("applies platform override for display", () => {
      const hook = {
        type: "command",
        command: "default-command",
        windows: "win-command",
        linux: "linux-command",
        osx: "osx-command"
      };
      assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Windows), "win-command");
      assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Macintosh), "osx-command");
      assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Linux), "linux-command");
    });
    test("no platform badge when falling back to default command", () => {
      const hook = {
        type: "command",
        command: "default-command"
        // No platform-specific overrides
      };
      assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Windows), "default-command");
    });
  });
  suite("parseSubagentHooksFromYaml", () => {
    const workspaceRoot = URI.file("/workspace");
    const userHome = "/home/user";
    const dummyRange = new Range(1, 1, 1, 1);
    function makeScalar(value) {
      return { type: "scalar", value, range: dummyRange, format: "none" };
    }
    function makeMap(entries) {
      const properties = Object.entries(entries).map(([key, value]) => ({
        key: makeScalar(key),
        value
      }));
      return { type: "map", properties, range: dummyRange };
    }
    function makeSequence(items) {
      return { type: "sequence", items, range: dummyRange };
    }
    test("parses direct command format (without matcher)", () => {
      const hooksMap = makeMap({
        "PreToolUse": makeSequence([
          makeMap({
            "type": makeScalar("command"),
            "command": makeScalar("./scripts/validate.sh")
          })
        ])
      });
      const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
      assert.strictEqual(result[HookType.PreToolUse]?.length, 1);
      assert.strictEqual(result[HookType.PreToolUse][0].command, "./scripts/validate.sh");
    });
    test("parses Claude format (with matcher)", () => {
      const hooksMap = makeMap({
        "PreToolUse": makeSequence([
          makeMap({
            "matcher": makeScalar("Bash"),
            "hooks": makeSequence([
              makeMap({
                "type": makeScalar("command"),
                "command": makeScalar("./scripts/validate-readonly.sh")
              })
            ])
          })
        ])
      });
      const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
      assert.strictEqual(result[HookType.PreToolUse]?.length, 1);
      assert.strictEqual(result[HookType.PreToolUse][0].command, "./scripts/validate-readonly.sh");
    });
    test("parses multiple hook types", () => {
      const hooksMap = makeMap({
        "PreToolUse": makeSequence([
          makeMap({
            "type": makeScalar("command"),
            "command": makeScalar("./scripts/pre.sh")
          })
        ]),
        "PostToolUse": makeSequence([
          makeMap({
            "matcher": makeScalar("Edit|Write"),
            "hooks": makeSequence([
              makeMap({
                "type": makeScalar("command"),
                "command": makeScalar("./scripts/lint.sh")
              })
            ])
          })
        ])
      });
      const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
      assert.strictEqual(result[HookType.PreToolUse]?.length, 1);
      assert.strictEqual(result[HookType.PreToolUse][0].command, "./scripts/pre.sh");
      assert.strictEqual(result[HookType.PostToolUse]?.length, 1);
      assert.strictEqual(result[HookType.PostToolUse][0].command, "./scripts/lint.sh");
    });
    test("skips unknown hook types", () => {
      const hooksMap = makeMap({
        "UnknownHook": makeSequence([
          makeMap({
            "type": makeScalar("command"),
            "command": makeScalar('echo "ignored"')
          })
        ])
      });
      const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
      assert.strictEqual(result[HookType.PreToolUse], void 0);
      assert.strictEqual(result[HookType.PostToolUse], void 0);
    });
    test("handles command without type field", () => {
      const hooksMap = makeMap({
        "PreToolUse": makeSequence([
          makeMap({
            "command": makeScalar("./scripts/validate.sh")
          })
        ])
      });
      const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
      assert.strictEqual(result[HookType.PreToolUse]?.length, 1);
      assert.strictEqual(result[HookType.PreToolUse][0].command, "./scripts/validate.sh");
    });
    test("resolves cwd relative to workspace", () => {
      const hooksMap = makeMap({
        "SessionStart": makeSequence([
          makeMap({
            "type": makeScalar("command"),
            "command": makeScalar('echo "start"'),
            "cwd": makeScalar("src")
          })
        ])
      });
      const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
      assert.strictEqual(result[HookType.SessionStart]?.length, 1);
      assert.deepStrictEqual(result[HookType.SessionStart][0].cwd, URI.file("/workspace/src"));
    });
    test("skips non-sequence hook values", () => {
      const hooksMap = makeMap({
        "PreToolUse": makeScalar("not-a-sequence")
      });
      const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
      assert.strictEqual(result[HookType.PreToolUse], void 0);
    });
  });
  suite("ChatRequestHooks.isEquals", () => {
    test("returns true for equivalent hook arrays", () => {
      const left = {
        [HookType.PreToolUse]: [{ command: "./scripts/pre.sh", cwd: URI.file("/workspace") }]
      };
      const right = {
        [HookType.PreToolUse]: [{ command: "./scripts/pre.sh", cwd: URI.file("/workspace") }]
      };
      assert.strictEqual(ChatRequestHooks.isEquals(left, right), true);
    });
    test("returns false for different hook commands", () => {
      const left = {
        [HookType.PreToolUse]: [{ command: "./scripts/pre.sh" }]
      };
      const right = {
        [HookType.PreToolUse]: [{ command: "./scripts/other.sh" }]
      };
      assert.strictEqual(ChatRequestHooks.isEquals(left, right), false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tTY2hlbWEudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZUhvb2tDb21tYW5kLCByZXNvbHZlRWZmZWN0aXZlQ29tbWFuZCwgZm9ybWF0SG9va0NvbW1hbmRMYWJlbCwgSUhvb2tDb21tYW5kLCBwYXJzZVN1YmFnZW50SG9va3NGcm9tWWFtbCwgQ2hhdFJlcXVlc3RIb29rcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va1NjaGVtYS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSG9va1R5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tUeXBlcy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5cbnN1aXRlKCdIb29rU2NoZW1hJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgncmVzb2x2ZUhvb2tDb21tYW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZVJvb3QgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZScpO1xuXHRcdGNvbnN0IHVzZXJIb21lID0gJy9ob21lL3VzZXInO1xuXG5cdFx0c3VpdGUoJ2NvbW1hbmQgcHJvcGVydHknLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdyZXNvbHZlcyBiYXNpYyBjb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlSG9va0NvbW1hbmQoe1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZWNobyBoZWxsbydcblx0XHRcdFx0fSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZWNobyBoZWxsbycsXG5cdFx0XHRcdFx0Y3dkOiB3b3Jrc3BhY2VSb290XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Jlc29sdmVzIGNvbW1hbmQgd2l0aCBhbGwgb3B0aW9uYWwgcHJvcGVydGllcycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJy4vc2NyaXB0cy92YWxpZGF0ZS5zaCcsXG5cdFx0XHRcdFx0Y3dkOiAnc3JjJyxcblx0XHRcdFx0XHRlbnY6IHsgTk9ERV9FTlY6ICd0ZXN0JyB9LFxuXHRcdFx0XHRcdHRpbWVvdXQ6IDYwXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJy4vc2NyaXB0cy92YWxpZGF0ZS5zaCcsXG5cdFx0XHRcdFx0Y3dkOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS9zcmMnKSxcblx0XHRcdFx0XHRlbnY6IHsgTk9ERV9FTlY6ICd0ZXN0JyB9LFxuXHRcdFx0XHRcdHRpbWVvdXQ6IDYwXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2VtcHR5IGNvbW1hbmQgcmV0dXJucyBvYmplY3Qgd2l0aG91dCBjb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlSG9va0NvbW1hbmQoe1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnJ1xuXHRcdFx0XHR9LCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGN3ZDogd29ya3NwYWNlUm9vdFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2Jhc2ggbGVnYWN5IG1hcHBpbmcnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdiYXNoIG1hcHMgdG8gbGludXggYW5kIG9zeCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0YmFzaDogJ2VjaG8gXCJoZWxsbyB3b3JsZFwiJ1xuXHRcdFx0XHR9LCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGxpbnV4OiAnZWNobyBcImhlbGxvIHdvcmxkXCInLFxuXHRcdFx0XHRcdG9zeDogJ2VjaG8gXCJoZWxsbyB3b3JsZFwiJyxcblx0XHRcdFx0XHRsaW51eFNvdXJjZTogJ2Jhc2gnLFxuXHRcdFx0XHRcdG9zeFNvdXJjZTogJ2Jhc2gnLFxuXHRcdFx0XHRcdGN3ZDogd29ya3NwYWNlUm9vdFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdiYXNoIHdpdGggY3dkIGFuZCBlbnYnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGJhc2g6ICcuL3Rlc3Quc2gnLFxuXHRcdFx0XHRcdGN3ZDogJ3NjcmlwdHMnLFxuXHRcdFx0XHRcdGVudjogeyBERUJVRzogJzEnIH1cblx0XHRcdFx0fSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRsaW51eDogJy4vdGVzdC5zaCcsXG5cdFx0XHRcdFx0b3N4OiAnLi90ZXN0LnNoJyxcblx0XHRcdFx0XHRsaW51eFNvdXJjZTogJ2Jhc2gnLFxuXHRcdFx0XHRcdG9zeFNvdXJjZTogJ2Jhc2gnLFxuXHRcdFx0XHRcdGN3ZDogVVJJLmZpbGUoJy93b3Jrc3BhY2Uvc2NyaXB0cycpLFxuXHRcdFx0XHRcdGVudjogeyBERUJVRzogJzEnIH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZW1wdHkgYmFzaCByZXR1cm5zIG9iamVjdCB3aXRob3V0IHBsYXRmb3JtIG92ZXJyaWRlcycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0YmFzaDogJydcblx0XHRcdFx0fSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjd2Q6IHdvcmtzcGFjZVJvb3Rcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdwb3dlcnNoZWxsIGxlZ2FjeSBtYXBwaW5nJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgncG93ZXJzaGVsbCBtYXBzIHRvIHdpbmRvd3MnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdHBvd2Vyc2hlbGw6ICdXcml0ZS1Ib3N0IFwiaGVsbG9cIidcblx0XHRcdFx0fSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHR3aW5kb3dzOiAnV3JpdGUtSG9zdCBcImhlbGxvXCInLFxuXHRcdFx0XHRcdHdpbmRvd3NTb3VyY2U6ICdwb3dlcnNoZWxsJyxcblx0XHRcdFx0XHRjd2Q6IHdvcmtzcGFjZVJvb3Rcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncG93ZXJzaGVsbCB3aXRoIHRpbWVvdXQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdHBvd2Vyc2hlbGw6ICdHZXQtUHJvY2VzcycsXG5cdFx0XHRcdFx0dGltZW91dDogMzBcblx0XHRcdFx0fSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHR3aW5kb3dzOiAnR2V0LVByb2Nlc3MnLFxuXHRcdFx0XHRcdHdpbmRvd3NTb3VyY2U6ICdwb3dlcnNoZWxsJyxcblx0XHRcdFx0XHRjd2Q6IHdvcmtzcGFjZVJvb3QsXG5cdFx0XHRcdFx0dGltZW91dDogMzBcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZW1wdHkgcG93ZXJzaGVsbCByZXR1cm5zIG9iamVjdCB3aXRob3V0IHdpbmRvd3MnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdHBvd2Vyc2hlbGw6ICcnXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y3dkOiB3b3Jrc3BhY2VSb290XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnbXVsdGlwbGUgcHJvcGVydGllcyBzcGVjaWZpZWQnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdwcmVzZXJ2ZXMgY29tbWFuZCB3aXRoIGJhc2ggbWFwcGVkIHRvIGxpbnV4L29zeCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2RpcmVjdC1jb21tYW5kJyxcblx0XHRcdFx0XHRiYXNoOiAnYmFzaC1zY3JpcHQuc2gnXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2RpcmVjdC1jb21tYW5kJyxcblx0XHRcdFx0XHRsaW51eDogJ2Jhc2gtc2NyaXB0LnNoJyxcblx0XHRcdFx0XHRvc3g6ICdiYXNoLXNjcmlwdC5zaCcsXG5cdFx0XHRcdFx0bGludXhTb3VyY2U6ICdiYXNoJyxcblx0XHRcdFx0XHRvc3hTb3VyY2U6ICdiYXNoJyxcblx0XHRcdFx0XHRjd2Q6IHdvcmtzcGFjZVJvb3Rcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncHJlc2VydmVzIGNvbW1hbmQgd2l0aCBwb3dlcnNoZWxsIG1hcHBlZCB0byB3aW5kb3dzJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlSG9va0NvbW1hbmQoe1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZGlyZWN0LWNvbW1hbmQnLFxuXHRcdFx0XHRcdHBvd2Vyc2hlbGw6ICdwcy1zY3JpcHQucHMxJ1xuXHRcdFx0XHR9LCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdkaXJlY3QtY29tbWFuZCcsXG5cdFx0XHRcdFx0d2luZG93czogJ3BzLXNjcmlwdC5wczEnLFxuXHRcdFx0XHRcdHdpbmRvd3NTb3VyY2U6ICdwb3dlcnNoZWxsJyxcblx0XHRcdFx0XHRjd2Q6IHdvcmtzcGFjZVJvb3Rcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnYmFzaCBhbmQgcG93ZXJzaGVsbCBtYXAgdG8gYWxsIHBsYXRmb3JtcycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0YmFzaDogJ2Jhc2gtc2NyaXB0LnNoJyxcblx0XHRcdFx0XHRwb3dlcnNoZWxsOiAncHMtc2NyaXB0LnBzMSdcblx0XHRcdFx0fSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHR3aW5kb3dzOiAncHMtc2NyaXB0LnBzMScsXG5cdFx0XHRcdFx0bGludXg6ICdiYXNoLXNjcmlwdC5zaCcsXG5cdFx0XHRcdFx0b3N4OiAnYmFzaC1zY3JpcHQuc2gnLFxuXHRcdFx0XHRcdHdpbmRvd3NTb3VyY2U6ICdwb3dlcnNoZWxsJyxcblx0XHRcdFx0XHRsaW51eFNvdXJjZTogJ2Jhc2gnLFxuXHRcdFx0XHRcdG9zeFNvdXJjZTogJ2Jhc2gnLFxuXHRcdFx0XHRcdGN3ZDogd29ya3NwYWNlUm9vdFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2N3ZCByZXNvbHV0aW9uJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnY3dkIGlzIG5vdCByZXNvbHZlZCB3aGVuIG5vIHdvcmtzcGFjZSByb290JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlSG9va0NvbW1hbmQoe1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZWNobyBoZWxsbycsXG5cdFx0XHRcdFx0Y3dkOiAnc3JjJ1xuXHRcdFx0XHR9LCB1bmRlZmluZWQsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2N3ZCBpcyByZXNvbHZlZCByZWxhdGl2ZSB0byB3b3Jrc3BhY2Ugcm9vdCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0XHRcdGN3ZDogJ25lc3RlZC9wYXRoJ1xuXHRcdFx0XHR9LCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyxcblx0XHRcdFx0XHRjd2Q6IFVSSS5maWxlKCcvd29ya3NwYWNlL25lc3RlZC9wYXRoJylcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdpbnZhbGlkIGlucHV0cycsICgpID0+IHtcblx0XHRcdHRlc3QoJ3dyb25nIHR5cGUgcmV0dXJucyB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ3NjcmlwdCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdtaXNzaW5nIHR5cGUgcmV0dXJucyB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdubyBjb21tYW5kIHJldHVybnMgb2JqZWN0IHdpdGgganVzdCB0eXBlIGFuZCBjd2QnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGN3ZDogJy93b3Jrc3BhY2UnXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y3dkOiBVUkkuZmlsZSgnL3dvcmtzcGFjZScpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2lnbm9yZXMgbm9uLXN0cmluZyBjd2QnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyxcblx0XHRcdFx0XHRjd2Q6IDEyM1xuXHRcdFx0XHR9LCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyxcblx0XHRcdFx0XHRjd2Q6IHdvcmtzcGFjZVJvb3Rcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnaWdub3JlcyBub24tb2JqZWN0IGVudicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0XHRcdGVudjogJ2ludmFsaWQnXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0XHRcdGN3ZDogd29ya3NwYWNlUm9vdFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdpZ25vcmVzIG5vbi1udW1iZXIgdGltZW91dCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0XHRcdHRpbWVvdXQ6ICczMCdcblx0XHRcdFx0fSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZWNobyBoZWxsbycsXG5cdFx0XHRcdFx0Y3dkOiB3b3Jrc3BhY2VSb290XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgncGxhdGZvcm0tc3BlY2lmaWMgb3ZlcnJpZGVzJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgncHJlc2VydmVzIHdpbmRvd3Mgb3ZlcnJpZGUgYXMgc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlSG9va0NvbW1hbmQoe1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZGVmYXVsdC1jb21tYW5kJyxcblx0XHRcdFx0XHR3aW5kb3dzOiAnd2luLWNvbW1hbmQnXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2RlZmF1bHQtY29tbWFuZCcsXG5cdFx0XHRcdFx0d2luZG93czogJ3dpbi1jb21tYW5kJyxcblx0XHRcdFx0XHR3aW5kb3dzU291cmNlOiAnd2luZG93cycsXG5cdFx0XHRcdFx0Y3dkOiB3b3Jrc3BhY2VSb290XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3ByZXNlcnZlcyBsaW51eCBvdmVycmlkZSBhcyBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdkZWZhdWx0LWNvbW1hbmQnLFxuXHRcdFx0XHRcdGxpbnV4OiAnbGludXgtY29tbWFuZCdcblx0XHRcdFx0fSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZGVmYXVsdC1jb21tYW5kJyxcblx0XHRcdFx0XHRsaW51eDogJ2xpbnV4LWNvbW1hbmQnLFxuXHRcdFx0XHRcdGxpbnV4U291cmNlOiAnbGludXgnLFxuXHRcdFx0XHRcdGN3ZDogd29ya3NwYWNlUm9vdFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdwcmVzZXJ2ZXMgb3N4IG92ZXJyaWRlIGFzIHN0cmluZycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2RlZmF1bHQtY29tbWFuZCcsXG5cdFx0XHRcdFx0b3N4OiAnb3N4LWNvbW1hbmQnXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2RlZmF1bHQtY29tbWFuZCcsXG5cdFx0XHRcdFx0b3N4OiAnb3N4LWNvbW1hbmQnLFxuXHRcdFx0XHRcdG9zeFNvdXJjZTogJ29zeCcsXG5cdFx0XHRcdFx0Y3dkOiB3b3Jrc3BhY2VSb290XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3ByZXNlcnZlcyBhbGwgcGxhdGZvcm0gb3ZlcnJpZGVzJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlSG9va0NvbW1hbmQoe1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZGVmYXVsdC1jb21tYW5kJyxcblx0XHRcdFx0XHR3aW5kb3dzOiAnd2luLWNvbW1hbmQnLFxuXHRcdFx0XHRcdGxpbnV4OiAnbGludXgtY29tbWFuZCcsXG5cdFx0XHRcdFx0b3N4OiAnb3N4LWNvbW1hbmQnXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2RlZmF1bHQtY29tbWFuZCcsXG5cdFx0XHRcdFx0d2luZG93czogJ3dpbi1jb21tYW5kJyxcblx0XHRcdFx0XHRsaW51eDogJ2xpbnV4LWNvbW1hbmQnLFxuXHRcdFx0XHRcdG9zeDogJ29zeC1jb21tYW5kJyxcblx0XHRcdFx0XHR3aW5kb3dzU291cmNlOiAnd2luZG93cycsXG5cdFx0XHRcdFx0bGludXhTb3VyY2U6ICdsaW51eCcsXG5cdFx0XHRcdFx0b3N4U291cmNlOiAnb3N4Jyxcblx0XHRcdFx0XHRjd2Q6IHdvcmtzcGFjZVJvb3Rcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZXhwbGljaXQgcGxhdGZvcm0gb3ZlcnJpZGUgdGFrZXMgcHJlY2VkZW5jZSBvdmVyIGJhc2gvcG93ZXJzaGVsbCBtYXBwaW5nJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlSG9va0NvbW1hbmQoe1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRiYXNoOiAnZGVmYXVsdC5zaCcsXG5cdFx0XHRcdFx0bGludXg6ICdleHBsaWNpdC1saW51eC5zaCdcblx0XHRcdFx0fSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRsaW51eDogJ2V4cGxpY2l0LWxpbnV4LnNoJyxcblx0XHRcdFx0XHRvc3g6ICdkZWZhdWx0LnNoJyxcblx0XHRcdFx0XHRsaW51eFNvdXJjZTogJ2xpbnV4Jyxcblx0XHRcdFx0XHRvc3hTb3VyY2U6ICdiYXNoJyxcblx0XHRcdFx0XHRjd2Q6IHdvcmtzcGFjZVJvb3Rcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnaWdub3JlcyBlbXB0eSBwbGF0Zm9ybSBvdmVycmlkZScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2RlZmF1bHQtY29tbWFuZCcsXG5cdFx0XHRcdFx0d2luZG93czogJydcblx0XHRcdFx0fSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZGVmYXVsdC1jb21tYW5kJyxcblx0XHRcdFx0XHRjd2Q6IHdvcmtzcGFjZVJvb3Rcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnaWdub3JlcyBub24tc3RyaW5nIHBsYXRmb3JtIG92ZXJyaWRlJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlSG9va0NvbW1hbmQoe1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZGVmYXVsdC1jb21tYW5kJyxcblx0XHRcdFx0XHR3aW5kb3dzOiB7IGNvbW1hbmQ6ICdpbnZhbGlkJyB9XG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2RlZmF1bHQtY29tbWFuZCcsXG5cdFx0XHRcdFx0Y3dkOiB3b3Jrc3BhY2VSb290XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXNvbHZlRWZmZWN0aXZlQ29tbWFuZCcsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIGJhc2UgY29tbWFuZCB3aGVuIG5vIHBsYXRmb3JtIG92ZXJyaWRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaG9vazogSUhvb2tDb21tYW5kID0ge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICdkZWZhdWx0LWNvbW1hbmQnXG5cdFx0XHR9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVFZmZlY3RpdmVDb21tYW5kKGhvb2ssIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSwgJ2RlZmF1bHQtY29tbWFuZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVFZmZlY3RpdmVDb21tYW5kKGhvb2ssIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2gpLCAnZGVmYXVsdC1jb21tYW5kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZUVmZmVjdGl2ZUNvbW1hbmQoaG9vaywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSwgJ2RlZmF1bHQtY29tbWFuZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXBwbGllcyBwbGF0Zm9ybSBvdmVycmlkZSBmb3IgZWFjaCBwbGF0Zm9ybScsICgpID0+IHtcblx0XHRcdGNvbnN0IGhvb2s6IElIb29rQ29tbWFuZCA9IHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRjb21tYW5kOiAnZGVmYXVsdC1jb21tYW5kJyxcblx0XHRcdFx0d2luZG93czogJ3dpbi1jb21tYW5kJyxcblx0XHRcdFx0bGludXg6ICdsaW51eC1jb21tYW5kJyxcblx0XHRcdFx0b3N4OiAnb3N4LWNvbW1hbmQnXG5cdFx0XHR9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVFZmZlY3RpdmVDb21tYW5kKGhvb2ssIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSwgJ3dpbi1jb21tYW5kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZUVmZmVjdGl2ZUNvbW1hbmQoaG9vaywgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCksICdvc3gtY29tbWFuZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVFZmZlY3RpdmVDb21tYW5kKGhvb2ssIE9wZXJhdGluZ1N5c3RlbS5MaW51eCksICdsaW51eC1jb21tYW5kJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIGNvbW1hbmQgd2hlbiBubyBwbGF0Zm9ybS1zcGVjaWZpYyBvdmVycmlkZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGhvb2s6IElIb29rQ29tbWFuZCA9IHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRjb21tYW5kOiAnZGVmYXVsdC1jb21tYW5kJ1xuXHRcdFx0fTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlRWZmZWN0aXZlQ29tbWFuZChob29rLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyksICdkZWZhdWx0LWNvbW1hbmQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbm8gY29tbWFuZCBhdCBhbGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBob29rOiBJSG9va0NvbW1hbmQgPSB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kJ1xuXHRcdFx0fTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlRWZmZWN0aXZlQ29tbWFuZChob29rLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmb3JtYXRIb29rQ29tbWFuZExhYmVsJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2Zvcm1hdHMgY29tbWFuZCB3aGVuIHByZXNlbnQgKG5vIHBsYXRmb3JtIG92ZXJyaWRlKScsICgpID0+IHtcblx0XHRcdGNvbnN0IGhvb2s6IElIb29rQ29tbWFuZCA9IHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRjb21tYW5kOiAnZWNobyBoZWxsbydcblx0XHRcdH07XG5cdFx0XHQvLyBObyBwbGF0Zm9ybSBiYWRnZSB3aGVuIHVzaW5nIGRlZmF1bHQgY29tbWFuZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdEhvb2tDb21tYW5kTGFiZWwoaG9vaywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpLCAnZWNobyBoZWxsbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdEhvb2tDb21tYW5kTGFiZWwoaG9vaywgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCksICdlY2hvIGhlbGxvJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0SG9va0NvbW1hbmRMYWJlbChob29rLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpLCAnZWNobyBoZWxsbycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSBzdHJpbmcgd2hlbiBubyBjb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaG9vazogSUhvb2tDb21tYW5kID0ge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZCdcblx0XHRcdH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0SG9va0NvbW1hbmRMYWJlbChob29rLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyksICcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGxpZXMgcGxhdGZvcm0gb3ZlcnJpZGUgZm9yIGRpc3BsYXknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBob29rOiBJSG9va0NvbW1hbmQgPSB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0Y29tbWFuZDogJ2RlZmF1bHQtY29tbWFuZCcsXG5cdFx0XHRcdHdpbmRvd3M6ICd3aW4tY29tbWFuZCcsXG5cdFx0XHRcdGxpbnV4OiAnbGludXgtY29tbWFuZCcsXG5cdFx0XHRcdG9zeDogJ29zeC1jb21tYW5kJ1xuXHRcdFx0fTtcblx0XHRcdC8vIFNob3VsZCByZXNvbHZlIHRvIHBsYXRmb3JtLXNwZWNpZmljIGNvbW1hbmRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRIb29rQ29tbWFuZExhYmVsKGhvb2ssIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSwgJ3dpbi1jb21tYW5kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0SG9va0NvbW1hbmRMYWJlbChob29rLCBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoKSwgJ29zeC1jb21tYW5kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0SG9va0NvbW1hbmRMYWJlbChob29rLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpLCAnbGludXgtY29tbWFuZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm8gcGxhdGZvcm0gYmFkZ2Ugd2hlbiBmYWxsaW5nIGJhY2sgdG8gZGVmYXVsdCBjb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaG9vazogSUhvb2tDb21tYW5kID0ge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICdkZWZhdWx0LWNvbW1hbmQnXG5cdFx0XHRcdC8vIE5vIHBsYXRmb3JtLXNwZWNpZmljIG92ZXJyaWRlc1xuXHRcdFx0fTtcblx0XHRcdC8vIFNob3VsZCBub3QgaW5jbHVkZSBiYWRnZSB3aGVuIHVzaW5nIGRlZmF1bHQgY29tbWFuZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdEhvb2tDb21tYW5kTGFiZWwoaG9vaywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpLCAnZGVmYXVsdC1jb21tYW5kJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwYXJzZVN1YmFnZW50SG9va3NGcm9tWWFtbCcsICgpID0+IHtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZVJvb3QgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZScpO1xuXHRcdGNvbnN0IHVzZXJIb21lID0gJy9ob21lL3VzZXInO1xuXG5cdFx0Y29uc3QgZHVtbXlSYW5nZSA9IG5ldyBSYW5nZSgxLCAxLCAxLCAxKTtcblxuXHRcdGZ1bmN0aW9uIG1ha2VTY2FsYXIodmFsdWU6IHN0cmluZyk6IGltcG9ydCgnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRGaWxlUGFyc2VyLmpzJykuSVNjYWxhclZhbHVlIHtcblx0XHRcdHJldHVybiB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZSwgcmFuZ2U6IGR1bW15UmFuZ2UsIGZvcm1hdDogJ25vbmUnIH07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gbWFrZU1hcChlbnRyaWVzOiBSZWNvcmQ8c3RyaW5nLCBpbXBvcnQoJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0RmlsZVBhcnNlci5qcycpLklWYWx1ZT4pOiBpbXBvcnQoJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0RmlsZVBhcnNlci5qcycpLklNYXBWYWx1ZSB7XG5cdFx0XHRjb25zdCBwcm9wZXJ0aWVzID0gT2JqZWN0LmVudHJpZXMoZW50cmllcykubWFwKChba2V5LCB2YWx1ZV0pID0+ICh7XG5cdFx0XHRcdGtleTogbWFrZVNjYWxhcihrZXkpLFxuXHRcdFx0XHR2YWx1ZSxcblx0XHRcdH0pKTtcblx0XHRcdHJldHVybiB7IHR5cGU6ICdtYXAnLCBwcm9wZXJ0aWVzLCByYW5nZTogZHVtbXlSYW5nZSB9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIG1ha2VTZXF1ZW5jZShpdGVtczogaW1wb3J0KCcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdEZpbGVQYXJzZXIuanMnKS5JVmFsdWVbXSk6IGltcG9ydCgnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRGaWxlUGFyc2VyLmpzJykuSVNlcXVlbmNlVmFsdWUge1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogJ3NlcXVlbmNlJywgaXRlbXMsIHJhbmdlOiBkdW1teVJhbmdlIH07XG5cdFx0fVxuXG5cdFx0dGVzdCgncGFyc2VzIGRpcmVjdCBjb21tYW5kIGZvcm1hdCAod2l0aG91dCBtYXRjaGVyKScsICgpID0+IHtcblx0XHRcdC8vIGhvb2tzOlxuXHRcdFx0Ly8gICBQcmVUb29sVXNlOlxuXHRcdFx0Ly8gICAgIC0gdHlwZTogY29tbWFuZFxuXHRcdFx0Ly8gICAgICAgY29tbWFuZDogXCIuL3NjcmlwdHMvdmFsaWRhdGUuc2hcIlxuXHRcdFx0Y29uc3QgaG9va3NNYXAgPSBtYWtlTWFwKHtcblx0XHRcdFx0J1ByZVRvb2xVc2UnOiBtYWtlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdG1ha2VNYXAoe1xuXHRcdFx0XHRcdFx0J3R5cGUnOiBtYWtlU2NhbGFyKCdjb21tYW5kJyksXG5cdFx0XHRcdFx0XHQnY29tbWFuZCc6IG1ha2VTY2FsYXIoJy4vc2NyaXB0cy92YWxpZGF0ZS5zaCcpLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRdKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVN1YmFnZW50SG9va3NGcm9tWWFtbChob29rc01hcCwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0W0hvb2tUeXBlLlByZVRvb2xVc2VdPy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFtIb29rVHlwZS5QcmVUb29sVXNlXSFbMF0uY29tbWFuZCwgJy4vc2NyaXB0cy92YWxpZGF0ZS5zaCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIENsYXVkZSBmb3JtYXQgKHdpdGggbWF0Y2hlciknLCAoKSA9PiB7XG5cdFx0XHQvLyBob29rczpcblx0XHRcdC8vICAgUHJlVG9vbFVzZTpcblx0XHRcdC8vICAgICAtIG1hdGNoZXI6IFwiQmFzaFwiXG5cdFx0XHQvLyAgICAgICBob29rczpcblx0XHRcdC8vICAgICAgICAgLSB0eXBlOiBjb21tYW5kXG5cdFx0XHQvLyAgICAgICAgICAgY29tbWFuZDogXCIuL3NjcmlwdHMvdmFsaWRhdGUtcmVhZG9ubHkuc2hcIlxuXHRcdFx0Y29uc3QgaG9va3NNYXAgPSBtYWtlTWFwKHtcblx0XHRcdFx0J1ByZVRvb2xVc2UnOiBtYWtlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdG1ha2VNYXAoe1xuXHRcdFx0XHRcdFx0J21hdGNoZXInOiBtYWtlU2NhbGFyKCdCYXNoJyksXG5cdFx0XHRcdFx0XHQnaG9va3MnOiBtYWtlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdFx0XHRtYWtlTWFwKHtcblx0XHRcdFx0XHRcdFx0XHQndHlwZSc6IG1ha2VTY2FsYXIoJ2NvbW1hbmQnKSxcblx0XHRcdFx0XHRcdFx0XHQnY29tbWFuZCc6IG1ha2VTY2FsYXIoJy4vc2NyaXB0cy92YWxpZGF0ZS1yZWFkb25seS5zaCcpLFxuXHRcdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRdKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVN1YmFnZW50SG9va3NGcm9tWWFtbChob29rc01hcCwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0W0hvb2tUeXBlLlByZVRvb2xVc2VdPy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFtIb29rVHlwZS5QcmVUb29sVXNlXSFbMF0uY29tbWFuZCwgJy4vc2NyaXB0cy92YWxpZGF0ZS1yZWFkb25seS5zaCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIG11bHRpcGxlIGhvb2sgdHlwZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBob29rc01hcCA9IG1ha2VNYXAoe1xuXHRcdFx0XHQnUHJlVG9vbFVzZSc6IG1ha2VTZXF1ZW5jZShbXG5cdFx0XHRcdFx0bWFrZU1hcCh7XG5cdFx0XHRcdFx0XHQndHlwZSc6IG1ha2VTY2FsYXIoJ2NvbW1hbmQnKSxcblx0XHRcdFx0XHRcdCdjb21tYW5kJzogbWFrZVNjYWxhcignLi9zY3JpcHRzL3ByZS5zaCcpLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRdKSxcblx0XHRcdFx0J1Bvc3RUb29sVXNlJzogbWFrZVNlcXVlbmNlKFtcblx0XHRcdFx0XHRtYWtlTWFwKHtcblx0XHRcdFx0XHRcdCdtYXRjaGVyJzogbWFrZVNjYWxhcignRWRpdHxXcml0ZScpLFxuXHRcdFx0XHRcdFx0J2hvb2tzJzogbWFrZVNlcXVlbmNlKFtcblx0XHRcdFx0XHRcdFx0bWFrZU1hcCh7XG5cdFx0XHRcdFx0XHRcdFx0J3R5cGUnOiBtYWtlU2NhbGFyKCdjb21tYW5kJyksXG5cdFx0XHRcdFx0XHRcdFx0J2NvbW1hbmQnOiBtYWtlU2NhbGFyKCcuL3NjcmlwdHMvbGludC5zaCcpLFxuXHRcdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRdKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVN1YmFnZW50SG9va3NGcm9tWWFtbChob29rc01hcCwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0W0hvb2tUeXBlLlByZVRvb2xVc2VdPy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFtIb29rVHlwZS5QcmVUb29sVXNlXSFbMF0uY29tbWFuZCwgJy4vc2NyaXB0cy9wcmUuc2gnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbSG9va1R5cGUuUG9zdFRvb2xVc2VdPy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFtIb29rVHlwZS5Qb3N0VG9vbFVzZV0hWzBdLmNvbW1hbmQsICcuL3NjcmlwdHMvbGludC5zaCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpcHMgdW5rbm93biBob29rIHR5cGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaG9va3NNYXAgPSBtYWtlTWFwKHtcblx0XHRcdFx0J1Vua25vd25Ib29rJzogbWFrZVNlcXVlbmNlKFtcblx0XHRcdFx0XHRtYWtlTWFwKHtcblx0XHRcdFx0XHRcdCd0eXBlJzogbWFrZVNjYWxhcignY29tbWFuZCcpLFxuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiBtYWtlU2NhbGFyKCdlY2hvIFwiaWdub3JlZFwiJyksXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdF0pLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlU3ViYWdlbnRIb29rc0Zyb21ZYW1sKGhvb2tzTWFwLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbSG9va1R5cGUuUHJlVG9vbFVzZV0sIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0W0hvb2tUeXBlLlBvc3RUb29sVXNlXSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgY29tbWFuZCB3aXRob3V0IHR5cGUgZmllbGQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBob29rc01hcCA9IG1ha2VNYXAoe1xuXHRcdFx0XHQnUHJlVG9vbFVzZSc6IG1ha2VTZXF1ZW5jZShbXG5cdFx0XHRcdFx0bWFrZU1hcCh7XG5cdFx0XHRcdFx0XHQnY29tbWFuZCc6IG1ha2VTY2FsYXIoJy4vc2NyaXB0cy92YWxpZGF0ZS5zaCcpLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRdKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVN1YmFnZW50SG9va3NGcm9tWWFtbChob29rc01hcCwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0W0hvb2tUeXBlLlByZVRvb2xVc2VdPy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFtIb29rVHlwZS5QcmVUb29sVXNlXSFbMF0uY29tbWFuZCwgJy4vc2NyaXB0cy92YWxpZGF0ZS5zaCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZXMgY3dkIHJlbGF0aXZlIHRvIHdvcmtzcGFjZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGhvb2tzTWFwID0gbWFrZU1hcCh7XG5cdFx0XHRcdCdTZXNzaW9uU3RhcnQnOiBtYWtlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdG1ha2VNYXAoe1xuXHRcdFx0XHRcdFx0J3R5cGUnOiBtYWtlU2NhbGFyKCdjb21tYW5kJyksXG5cdFx0XHRcdFx0XHQnY29tbWFuZCc6IG1ha2VTY2FsYXIoJ2VjaG8gXCJzdGFydFwiJyksXG5cdFx0XHRcdFx0XHQnY3dkJzogbWFrZVNjYWxhcignc3JjJyksXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdF0pLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlU3ViYWdlbnRIb29rc0Zyb21ZYW1sKGhvb2tzTWFwLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbSG9va1R5cGUuU2Vzc2lvblN0YXJ0XT8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0W0hvb2tUeXBlLlNlc3Npb25TdGFydF0hWzBdLmN3ZCwgVVJJLmZpbGUoJy93b3Jrc3BhY2Uvc3JjJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpcHMgbm9uLXNlcXVlbmNlIGhvb2sgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaG9va3NNYXAgPSBtYWtlTWFwKHtcblx0XHRcdFx0J1ByZVRvb2xVc2UnOiBtYWtlU2NhbGFyKCdub3QtYS1zZXF1ZW5jZScpLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlU3ViYWdlbnRIb29rc0Zyb21ZYW1sKGhvb2tzTWFwLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbSG9va1R5cGUuUHJlVG9vbFVzZV0sIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdDaGF0UmVxdWVzdEhvb2tzLmlzRXF1YWxzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSBmb3IgZXF1aXZhbGVudCBob29rIGFycmF5cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGxlZnQ6IENoYXRSZXF1ZXN0SG9va3MgPSB7XG5cdFx0XHRcdFtIb29rVHlwZS5QcmVUb29sVXNlXTogW3sgY29tbWFuZDogJy4vc2NyaXB0cy9wcmUuc2gnLCBjd2Q6IFVSSS5maWxlKCcvd29ya3NwYWNlJykgfV0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmlnaHQ6IENoYXRSZXF1ZXN0SG9va3MgPSB7XG5cdFx0XHRcdFtIb29rVHlwZS5QcmVUb29sVXNlXTogW3sgY29tbWFuZDogJy4vc2NyaXB0cy9wcmUuc2gnLCBjd2Q6IFVSSS5maWxlKCcvd29ya3NwYWNlJykgfV0sXG5cdFx0XHR9O1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQ2hhdFJlcXVlc3RIb29rcy5pc0VxdWFscyhsZWZ0LCByaWdodCksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSBmb3IgZGlmZmVyZW50IGhvb2sgY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsZWZ0OiBDaGF0UmVxdWVzdEhvb2tzID0ge1xuXHRcdFx0XHRbSG9va1R5cGUuUHJlVG9vbFVzZV06IFt7IGNvbW1hbmQ6ICcuL3NjcmlwdHMvcHJlLnNoJyB9XSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCByaWdodDogQ2hhdFJlcXVlc3RIb29rcyA9IHtcblx0XHRcdFx0W0hvb2tUeXBlLlByZVRvb2xVc2VdOiBbeyBjb21tYW5kOiAnLi9zY3JpcHRzL290aGVyLnNoJyB9XSxcblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChDaGF0UmVxdWVzdEhvb2tzLmlzRXF1YWxzKGxlZnQsIHJpZ2h0KSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsb0JBQW9CLHlC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
