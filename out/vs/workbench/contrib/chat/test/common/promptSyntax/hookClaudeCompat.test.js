import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { HookType } from "../../../common/promptSyntax/hookTypes.js";
import { parseClaudeHooks, resolveClaudeHookType, getClaudeHookTypeName, extractHookCommandsFromItem } from "../../../common/promptSyntax/hookClaudeCompat.js";
import { getHookSourceFormat, HookSourceFormat, buildNewHookEntry } from "../../../common/promptSyntax/hookCompatibility.js";
import { URI } from "../../../../../../base/common/uri.js";
suite("HookClaudeCompat", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("extractHookCommandsFromItem", () => {
    const workspaceRoot = URI.file("/workspace");
    const userHome = "/home/user";
    test("extracts direct command object", () => {
      const item = { type: "command", command: 'echo "test"' };
      const result = extractHookCommandsFromItem(item, workspaceRoot, userHome);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].command, 'echo "test"');
    });
    test("extracts from nested matcher structure", () => {
      const item = {
        matcher: "Bash",
        hooks: [
          { type: "command", command: 'echo "nested"' }
        ]
      };
      const result = extractHookCommandsFromItem(item, workspaceRoot, userHome);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].command, 'echo "nested"');
    });
    test("extracts multiple hooks from matcher structure", () => {
      const item = {
        matcher: "Write",
        hooks: [
          { type: "command", command: 'echo "first"' },
          { type: "command", command: 'echo "second"' }
        ]
      };
      const result = extractHookCommandsFromItem(item, workspaceRoot, userHome);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].command, 'echo "first"');
      assert.strictEqual(result[1].command, 'echo "second"');
    });
    test("handles command without type field (Claude format)", () => {
      const item = { command: 'echo "no type"' };
      const result = extractHookCommandsFromItem(item, workspaceRoot, userHome);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].command, 'echo "no type"');
    });
    test("handles nested command without type field", () => {
      const item = {
        matcher: "Bash",
        hooks: [
          { command: 'echo "no type nested"' }
        ]
      };
      const result = extractHookCommandsFromItem(item, workspaceRoot, userHome);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].command, 'echo "no type nested"');
    });
    test("returns empty array for null item", () => {
      const result = extractHookCommandsFromItem(null, workspaceRoot, userHome);
      assert.strictEqual(result.length, 0);
    });
    test("returns empty array for undefined item", () => {
      const result = extractHookCommandsFromItem(void 0, workspaceRoot, userHome);
      assert.strictEqual(result.length, 0);
    });
    test("returns empty array for invalid type", () => {
      const item = { type: "script", command: 'echo "wrong type"' };
      const result = extractHookCommandsFromItem(item, workspaceRoot, userHome);
      assert.strictEqual(result.length, 0);
    });
  });
  suite("resolveClaudeHookType", () => {
    test("resolves PreToolUse", () => {
      assert.strictEqual(resolveClaudeHookType("PreToolUse"), HookType.PreToolUse);
    });
    test("resolves UserPromptSubmit", () => {
      assert.strictEqual(resolveClaudeHookType("UserPromptSubmit"), HookType.UserPromptSubmit);
    });
    test("returns undefined for unknown type", () => {
      assert.strictEqual(resolveClaudeHookType("UnknownHook"), void 0);
    });
    test("returns undefined for camelCase (not Claude format)", () => {
      assert.strictEqual(resolveClaudeHookType("preToolUse"), void 0);
    });
  });
  suite("getClaudeHookTypeName", () => {
    test("gets PreToolUse for HookType.PreToolUse", () => {
      assert.strictEqual(getClaudeHookTypeName(HookType.PreToolUse), "PreToolUse");
    });
    test("gets UserPromptSubmit for HookType.UserPromptSubmit", () => {
      assert.strictEqual(getClaudeHookTypeName(HookType.UserPromptSubmit), "UserPromptSubmit");
    });
  });
  suite("parseClaudeHooks", () => {
    const workspaceRoot = URI.file("/workspace");
    const userHome = "/home/user";
    suite("basic parsing", () => {
      test("parses simple hook with command", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "pre-tool"' }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        assert.strictEqual(result.disabledAllHooks, false);
        assert.strictEqual(result.hooks.size, 1);
        assert.ok(result.hooks.has(HookType.PreToolUse));
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.originalId, "PreToolUse");
        assert.strictEqual(entry.hooks.length, 1);
        assert.strictEqual(entry.hooks[0].command, 'echo "pre-tool"');
      });
      test("parses multiple hook types", () => {
        const json = {
          hooks: {
            SessionStart: [{ type: "command", command: 'echo "start"' }],
            Stop: [{ type: "command", command: 'echo "stop"' }]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        assert.strictEqual(result.hooks.size, 2);
        assert.ok(result.hooks.has(HookType.SessionStart));
        assert.ok(result.hooks.has(HookType.Stop));
      });
      test("parses multiple commands for same hook type", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "first"' },
              { type: "command", command: 'echo "second"' }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 2);
        assert.strictEqual(entry.hooks[0].command, 'echo "first"');
        assert.strictEqual(entry.hooks[1].command, 'echo "second"');
      });
    });
    suite("disableAllHooks", () => {
      test("returns empty hooks and disabledAllHooks=true when disableAllHooks is true", () => {
        const json = {
          disableAllHooks: true,
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "should be ignored"' }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        assert.strictEqual(result.disabledAllHooks, true);
        assert.strictEqual(result.hooks.size, 0);
      });
      test("parses hooks normally when disableAllHooks is false", () => {
        const json = {
          disableAllHooks: false,
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "should be parsed"' }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        assert.strictEqual(result.disabledAllHooks, false);
        assert.strictEqual(result.hooks.size, 1);
      });
      test("parses hooks normally when disableAllHooks is not present", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "should be parsed"' }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        assert.strictEqual(result.disabledAllHooks, false);
        assert.strictEqual(result.hooks.size, 1);
      });
    });
    suite("nested hooks with matchers", () => {
      test("parses nested hooks with matcher", () => {
        const json = {
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [
                  { type: "command", command: 'echo "bash hook"' }
                ]
              }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 1);
        assert.strictEqual(entry.hooks[0].command, 'echo "bash hook"');
      });
      test("parses multiple nested hooks within one matcher", () => {
        const json = {
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [
                  { type: "command", command: 'echo "first"' },
                  { type: "command", command: 'echo "second"' }
                ]
              }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 2);
      });
      test("parses multiple matchers for same hook type", () => {
        const json = {
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [{ type: "command", command: 'echo "bash"' }]
              },
              {
                matcher: "Write",
                hooks: [{ type: "command", command: 'echo "write"' }]
              }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 2);
        assert.strictEqual(entry.hooks[0].command, 'echo "bash"');
        assert.strictEqual(entry.hooks[1].command, 'echo "write"');
      });
      test("parses mix of direct and nested hooks", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "direct"' },
              {
                matcher: "Bash",
                hooks: [{ type: "command", command: 'echo "nested"' }]
              }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 2);
        assert.strictEqual(entry.hooks[0].command, 'echo "direct"');
        assert.strictEqual(entry.hooks[1].command, 'echo "nested"');
      });
    });
    suite("invalid inputs", () => {
      test("returns empty map for null json", () => {
        const result = parseClaudeHooks(null, workspaceRoot, userHome);
        assert.strictEqual(result.hooks.size, 0);
        assert.strictEqual(result.disabledAllHooks, false);
      });
      test("returns empty map for undefined json", () => {
        const result = parseClaudeHooks(void 0, workspaceRoot, userHome);
        assert.strictEqual(result.hooks.size, 0);
        assert.strictEqual(result.disabledAllHooks, false);
      });
      test("returns empty map for non-object json", () => {
        const result = parseClaudeHooks("string", workspaceRoot, userHome);
        assert.strictEqual(result.hooks.size, 0);
        assert.strictEqual(result.disabledAllHooks, false);
      });
      test("returns empty map for missing hooks property", () => {
        const result = parseClaudeHooks({}, workspaceRoot, userHome);
        assert.strictEqual(result.hooks.size, 0);
        assert.strictEqual(result.disabledAllHooks, false);
      });
      test("returns empty map for non-object hooks property", () => {
        const result = parseClaudeHooks({ hooks: "invalid" }, workspaceRoot, userHome);
        assert.strictEqual(result.hooks.size, 0);
        assert.strictEqual(result.disabledAllHooks, false);
      });
      test("skips unknown hook types", () => {
        const json = {
          hooks: {
            UnknownType: [{ type: "command", command: 'echo "test"' }],
            PreToolUse: [{ type: "command", command: 'echo "known"' }]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        assert.strictEqual(result.hooks.size, 1);
        assert.ok(result.hooks.has(HookType.PreToolUse));
      });
      test("skips non-array hook entries", () => {
        const json = {
          hooks: {
            PreToolUse: { type: "command", command: 'echo "not array"' }
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        assert.strictEqual(result.hooks.size, 0);
      });
      test("skips invalid command entries", () => {
        const json = {
          hooks: {
            PreToolUse: [
              "invalid string",
              null,
              { type: "command", command: "valid" }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 1);
        assert.strictEqual(entry.hooks[0].command, "valid");
      });
      test("skips commands with wrong type", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "script", command: "invalid type" },
              { type: "command", command: "valid" }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 1);
        assert.strictEqual(entry.hooks[0].command, "valid");
      });
    });
    suite("cwd and env resolution", () => {
      test("resolves cwd relative to workspace", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "test"', cwd: "src" }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.deepStrictEqual(entry.hooks[0].cwd, URI.file("/workspace/src"));
      });
      test("preserves env variables", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "test"', env: { NODE_ENV: "production" } }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.deepStrictEqual(entry.hooks[0].env, { NODE_ENV: "production" });
      });
      test("preserves timeout", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "test"', timeout: 60 }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks[0].timeout, 60);
      });
      test("supports Claude timeout alias", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "test"', timeout: 1 }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks[0].timeout, 1);
      });
    });
  });
});
suite("HookSourceFormat", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getHookSourceFormat", () => {
    test("detects Claude format for .claude/settings.json", () => {
      assert.strictEqual(getHookSourceFormat(URI.file("/workspace/.claude/settings.json")), HookSourceFormat.Claude);
    });
    test("detects Claude format for .claude/settings.local.json", () => {
      assert.strictEqual(getHookSourceFormat(URI.file("/workspace/.claude/settings.local.json")), HookSourceFormat.Claude);
    });
    test("detects Claude format for ~/.claude/settings.json", () => {
      assert.strictEqual(getHookSourceFormat(URI.file("/home/user/.claude/settings.json")), HookSourceFormat.Claude);
    });
    test("returns Copilot format for .github/hooks/hooks.json", () => {
      assert.strictEqual(getHookSourceFormat(URI.file("/workspace/.github/hooks/hooks.json")), HookSourceFormat.Copilot);
    });
    test("returns Copilot format for arbitrary .json file", () => {
      assert.strictEqual(getHookSourceFormat(URI.file("/workspace/.github/hooks/my-hooks.json")), HookSourceFormat.Copilot);
    });
    test("returns Copilot format for settings.json not inside .claude", () => {
      assert.strictEqual(getHookSourceFormat(URI.file("/workspace/.vscode/settings.json")), HookSourceFormat.Copilot);
    });
  });
  suite("buildNewHookEntry", () => {
    test("builds Copilot format entry", () => {
      assert.deepStrictEqual(buildNewHookEntry(HookSourceFormat.Copilot), {
        type: "command",
        command: ""
      });
    });
    test("builds Claude format entry with matcher wrapper", () => {
      assert.deepStrictEqual(buildNewHookEntry(HookSourceFormat.Claude), {
        matcher: "",
        hooks: [{
          type: "command",
          command: ""
        }]
      });
    });
    test("Claude format entry serializes correctly in JSON", () => {
      const entry = buildNewHookEntry(HookSourceFormat.Claude);
      const hooksContent = {
        hooks: {
          SubagentStart: [entry]
        }
      };
      const json = JSON.stringify(hooksContent, null, "	");
      const parsed = JSON.parse(json);
      assert.deepStrictEqual(parsed.hooks.SubagentStart[0], {
        matcher: "",
        hooks: [{
          type: "command",
          command: ""
        }]
      });
    });
    test("Copilot format entry serializes correctly in JSON", () => {
      const entry = buildNewHookEntry(HookSourceFormat.Copilot);
      const hooksContent = {
        hooks: {
          SubagentStart: [entry]
        }
      };
      const json = JSON.stringify(hooksContent, null, "	");
      const parsed = JSON.parse(json);
      assert.deepStrictEqual(parsed.hooks.SubagentStart[0], {
        type: "command",
        command: ""
      });
    });
    test("Claude format round-trips through parseClaudeHooks", () => {
      const entry = buildNewHookEntry(HookSourceFormat.Claude);
      const hooksContent = {
        hooks: {
          PreToolUse: [entry]
        }
      };
      const result = parseClaudeHooks(hooksContent, URI.file("/workspace"), "/home/user");
      assert.strictEqual(result.hooks.size, 1);
      assert.ok(result.hooks.has(HookType.PreToolUse));
      const hooks = result.hooks.get(HookType.PreToolUse);
      assert.strictEqual(hooks.hooks.length, 1);
      assert.strictEqual(hooks.hooks[0].command, void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tDbGF1ZGVDb21wYXQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSG9va1R5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tUeXBlcy5qcyc7XG5pbXBvcnQgeyBwYXJzZUNsYXVkZUhvb2tzLCByZXNvbHZlQ2xhdWRlSG9va1R5cGUsIGdldENsYXVkZUhvb2tUeXBlTmFtZSwgZXh0cmFjdEhvb2tDb21tYW5kc0Zyb21JdGVtIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9ob29rQ2xhdWRlQ29tcGF0LmpzJztcbmltcG9ydCB7IGdldEhvb2tTb3VyY2VGb3JtYXQsIEhvb2tTb3VyY2VGb3JtYXQsIGJ1aWxkTmV3SG9va0VudHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9ob29rQ29tcGF0aWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuXG5zdWl0ZSgnSG9va0NsYXVkZUNvbXBhdCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2V4dHJhY3RIb29rQ29tbWFuZHNGcm9tSXRlbScsICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VSb290ID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UnKTtcblx0XHRjb25zdCB1c2VySG9tZSA9ICcvaG9tZS91c2VyJztcblxuXHRcdHRlc3QoJ2V4dHJhY3RzIGRpcmVjdCBjb21tYW5kIG9iamVjdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW0gPSB7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJ0ZXN0XCInIH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RIb29rQ29tbWFuZHNGcm9tSXRlbShpdGVtLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uY29tbWFuZCwgJ2VjaG8gXCJ0ZXN0XCInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4dHJhY3RzIGZyb20gbmVzdGVkIG1hdGNoZXIgc3RydWN0dXJlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbSA9IHtcblx0XHRcdFx0bWF0Y2hlcjogJ0Jhc2gnLFxuXHRcdFx0XHRob29rczogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcIm5lc3RlZFwiJyB9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RIb29rQ29tbWFuZHNGcm9tSXRlbShpdGVtLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uY29tbWFuZCwgJ2VjaG8gXCJuZXN0ZWRcIicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgbXVsdGlwbGUgaG9va3MgZnJvbSBtYXRjaGVyIHN0cnVjdHVyZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW0gPSB7XG5cdFx0XHRcdG1hdGNoZXI6ICdXcml0ZScsXG5cdFx0XHRcdGhvb2tzOiBbXG5cdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwiZmlyc3RcIicgfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJzZWNvbmRcIicgfVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0SG9va0NvbW1hbmRzRnJvbUl0ZW0oaXRlbSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmNvbW1hbmQsICdlY2hvIFwiZmlyc3RcIicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFsxXS5jb21tYW5kLCAnZWNobyBcInNlY29uZFwiJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGNvbW1hbmQgd2l0aG91dCB0eXBlIGZpZWxkIChDbGF1ZGUgZm9ybWF0KScsICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW0gPSB7IGNvbW1hbmQ6ICdlY2hvIFwibm8gdHlwZVwiJyB9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0SG9va0NvbW1hbmRzRnJvbUl0ZW0oaXRlbSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmNvbW1hbmQsICdlY2hvIFwibm8gdHlwZVwiJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIG5lc3RlZCBjb21tYW5kIHdpdGhvdXQgdHlwZSBmaWVsZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW0gPSB7XG5cdFx0XHRcdG1hdGNoZXI6ICdCYXNoJyxcblx0XHRcdFx0aG9va3M6IFtcblx0XHRcdFx0XHR7IGNvbW1hbmQ6ICdlY2hvIFwibm8gdHlwZSBuZXN0ZWRcIicgfVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0SG9va0NvbW1hbmRzRnJvbUl0ZW0oaXRlbSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmNvbW1hbmQsICdlY2hvIFwibm8gdHlwZSBuZXN0ZWRcIicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSBhcnJheSBmb3IgbnVsbCBpdGVtJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdEhvb2tDb21tYW5kc0Zyb21JdGVtKG51bGwsIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgYXJyYXkgZm9yIHVuZGVmaW5lZCBpdGVtJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdEhvb2tDb21tYW5kc0Zyb21JdGVtKHVuZGVmaW5lZCwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSBhcnJheSBmb3IgaW52YWxpZCB0eXBlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbSA9IHsgdHlwZTogJ3NjcmlwdCcsIGNvbW1hbmQ6ICdlY2hvIFwid3JvbmcgdHlwZVwiJyB9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0SG9va0NvbW1hbmRzRnJvbUl0ZW0oaXRlbSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXNvbHZlQ2xhdWRlSG9va1R5cGUnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmVzb2x2ZXMgUHJlVG9vbFVzZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlQ2xhdWRlSG9va1R5cGUoJ1ByZVRvb2xVc2UnKSwgSG9va1R5cGUuUHJlVG9vbFVzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNvbHZlcyBVc2VyUHJvbXB0U3VibWl0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVDbGF1ZGVIb29rVHlwZSgnVXNlclByb21wdFN1Ym1pdCcpLCBIb29rVHlwZS5Vc2VyUHJvbXB0U3VibWl0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciB1bmtub3duIHR5cGUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZUNsYXVkZUhvb2tUeXBlKCdVbmtub3duSG9vaycpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGNhbWVsQ2FzZSAobm90IENsYXVkZSBmb3JtYXQpJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVDbGF1ZGVIb29rVHlwZSgncHJlVG9vbFVzZScpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0Q2xhdWRlSG9va1R5cGVOYW1lJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2dldHMgUHJlVG9vbFVzZSBmb3IgSG9va1R5cGUuUHJlVG9vbFVzZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDbGF1ZGVIb29rVHlwZU5hbWUoSG9va1R5cGUuUHJlVG9vbFVzZSksICdQcmVUb29sVXNlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRzIFVzZXJQcm9tcHRTdWJtaXQgZm9yIEhvb2tUeXBlLlVzZXJQcm9tcHRTdWJtaXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2xhdWRlSG9va1R5cGVOYW1lKEhvb2tUeXBlLlVzZXJQcm9tcHRTdWJtaXQpLCAnVXNlclByb21wdFN1Ym1pdCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncGFyc2VDbGF1ZGVIb29rcycsICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VSb290ID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UnKTtcblx0XHRjb25zdCB1c2VySG9tZSA9ICcvaG9tZS91c2VyJztcblxuXHRcdHN1aXRlKCdiYXNpYyBwYXJzaW5nJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgncGFyc2VzIHNpbXBsZSBob29rIHdpdGggY29tbWFuZCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QganNvbiA9IHtcblx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0UHJlVG9vbFVzZTogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJwcmUtdG9vbFwiJyB9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlSG9va3MoanNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzYWJsZWRBbGxIb29rcywgZmFsc2UpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmhvb2tzLnNpemUsIDEpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0Lmhvb2tzLmhhcyhIb29rVHlwZS5QcmVUb29sVXNlKSk7XG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gcmVzdWx0Lmhvb2tzLmdldChIb29rVHlwZS5QcmVUb29sVXNlKSE7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5vcmlnaW5hbElkLCAnUHJlVG9vbFVzZScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaG9va3MubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzWzBdLmNvbW1hbmQsICdlY2hvIFwicHJlLXRvb2xcIicpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3BhcnNlcyBtdWx0aXBsZSBob29rIHR5cGVzJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0XHRTZXNzaW9uU3RhcnQ6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJzdGFydFwiJyB9XSxcblx0XHRcdFx0XHRcdFN0b3A6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJzdG9wXCInIH1dXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlSG9va3MoanNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaG9va3Muc2l6ZSwgMik7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQuaG9va3MuaGFzKEhvb2tUeXBlLlNlc3Npb25TdGFydCkpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0Lmhvb2tzLmhhcyhIb29rVHlwZS5TdG9wKSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncGFyc2VzIG11bHRpcGxlIGNvbW1hbmRzIGZvciBzYW1lIGhvb2sgdHlwZScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QganNvbiA9IHtcblx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0UHJlVG9vbFVzZTogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJmaXJzdFwiJyB9LFxuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJzZWNvbmRcIicgfVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZUhvb2tzKGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHJlc3VsdC5ob29rcy5nZXQoSG9va1R5cGUuUHJlVG9vbFVzZSkhO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaG9va3MubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzWzBdLmNvbW1hbmQsICdlY2hvIFwiZmlyc3RcIicpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaG9va3NbMV0uY29tbWFuZCwgJ2VjaG8gXCJzZWNvbmRcIicpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnZGlzYWJsZUFsbEhvb2tzJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgncmV0dXJucyBlbXB0eSBob29rcyBhbmQgZGlzYWJsZWRBbGxIb29rcz10cnVlIHdoZW4gZGlzYWJsZUFsbEhvb2tzIGlzIHRydWUnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGpzb24gPSB7XG5cdFx0XHRcdFx0ZGlzYWJsZUFsbEhvb2tzOiB0cnVlLFxuXHRcdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0XHRQcmVUb29sVXNlOiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcInNob3VsZCBiZSBpZ25vcmVkXCInIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVIb29rcyhqc29uLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNhYmxlZEFsbEhvb2tzLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ob29rcy5zaXplLCAwKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdwYXJzZXMgaG9va3Mgbm9ybWFsbHkgd2hlbiBkaXNhYmxlQWxsSG9va3MgaXMgZmFsc2UnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGpzb24gPSB7XG5cdFx0XHRcdFx0ZGlzYWJsZUFsbEhvb2tzOiBmYWxzZSxcblx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0UHJlVG9vbFVzZTogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJzaG91bGQgYmUgcGFyc2VkXCInIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVIb29rcyhqc29uLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNhYmxlZEFsbEhvb2tzLCBmYWxzZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaG9va3Muc2l6ZSwgMSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncGFyc2VzIGhvb2tzIG5vcm1hbGx5IHdoZW4gZGlzYWJsZUFsbEhvb2tzIGlzIG5vdCBwcmVzZW50JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0XHRQcmVUb29sVXNlOiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcInNob3VsZCBiZSBwYXJzZWRcIicgfVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZUhvb2tzKGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2FibGVkQWxsSG9va3MsIGZhbHNlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ob29rcy5zaXplLCAxKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ25lc3RlZCBob29rcyB3aXRoIG1hdGNoZXJzJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgncGFyc2VzIG5lc3RlZCBob29rcyB3aXRoIG1hdGNoZXInLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGpzb24gPSB7XG5cdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFByZVRvb2xVc2U6IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG1hdGNoZXI6ICdCYXNoJyxcblx0XHRcdFx0XHRcdFx0XHRob29rczogW1xuXHRcdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwiYmFzaCBob29rXCInIH1cblx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVIb29rcyhqc29uLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdFx0Y29uc3QgZW50cnkgPSByZXN1bHQuaG9va3MuZ2V0KEhvb2tUeXBlLlByZVRvb2xVc2UpITtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rc1swXS5jb21tYW5kLCAnZWNobyBcImJhc2ggaG9va1wiJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncGFyc2VzIG11bHRpcGxlIG5lc3RlZCBob29rcyB3aXRoaW4gb25lIG1hdGNoZXInLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGpzb24gPSB7XG5cdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFByZVRvb2xVc2U6IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG1hdGNoZXI6ICdCYXNoJyxcblx0XHRcdFx0XHRcdFx0XHRob29rczogW1xuXHRcdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwiZmlyc3RcIicgfSxcblx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcInNlY29uZFwiJyB9XG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlSG9va3MoanNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gcmVzdWx0Lmhvb2tzLmdldChIb29rVHlwZS5QcmVUb29sVXNlKSE7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rcy5sZW5ndGgsIDIpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3BhcnNlcyBtdWx0aXBsZSBtYXRjaGVycyBmb3Igc2FtZSBob29rIHR5cGUnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGpzb24gPSB7XG5cdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFByZVRvb2xVc2U6IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG1hdGNoZXI6ICdCYXNoJyxcblx0XHRcdFx0XHRcdFx0XHRob29rczogW3sgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcImJhc2hcIicgfV1cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG1hdGNoZXI6ICdXcml0ZScsXG5cdFx0XHRcdFx0XHRcdFx0aG9va3M6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJ3cml0ZVwiJyB9XVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlSG9va3MoanNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gcmVzdWx0Lmhvb2tzLmdldChIb29rVHlwZS5QcmVUb29sVXNlKSE7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rcy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaG9va3NbMF0uY29tbWFuZCwgJ2VjaG8gXCJiYXNoXCInKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzWzFdLmNvbW1hbmQsICdlY2hvIFwid3JpdGVcIicpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3BhcnNlcyBtaXggb2YgZGlyZWN0IGFuZCBuZXN0ZWQgaG9va3MnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGpzb24gPSB7XG5cdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFByZVRvb2xVc2U6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwiZGlyZWN0XCInIH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRtYXRjaGVyOiAnQmFzaCcsXG5cdFx0XHRcdFx0XHRcdFx0aG9va3M6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJuZXN0ZWRcIicgfV1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZUhvb2tzKGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHJlc3VsdC5ob29rcy5nZXQoSG9va1R5cGUuUHJlVG9vbFVzZSkhO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaG9va3MubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzWzBdLmNvbW1hbmQsICdlY2hvIFwiZGlyZWN0XCInKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzWzFdLmNvbW1hbmQsICdlY2hvIFwibmVzdGVkXCInKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2ludmFsaWQgaW5wdXRzJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgncmV0dXJucyBlbXB0eSBtYXAgZm9yIG51bGwganNvbicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVIb29rcyhudWxsLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaG9va3Muc2l6ZSwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzYWJsZWRBbGxIb29rcywgZmFsc2UpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgbWFwIGZvciB1bmRlZmluZWQganNvbicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVIb29rcyh1bmRlZmluZWQsIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ob29rcy5zaXplLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNhYmxlZEFsbEhvb2tzLCBmYWxzZSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmV0dXJucyBlbXB0eSBtYXAgZm9yIG5vbi1vYmplY3QganNvbicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVIb29rcygnc3RyaW5nJywgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmhvb2tzLnNpemUsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2FibGVkQWxsSG9va3MsIGZhbHNlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IG1hcCBmb3IgbWlzc2luZyBob29rcyBwcm9wZXJ0eScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVIb29rcyh7fSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmhvb2tzLnNpemUsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2FibGVkQWxsSG9va3MsIGZhbHNlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IG1hcCBmb3Igbm9uLW9iamVjdCBob29rcyBwcm9wZXJ0eScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVIb29rcyh7IGhvb2tzOiAnaW52YWxpZCcgfSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmhvb2tzLnNpemUsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2FibGVkQWxsSG9va3MsIGZhbHNlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdza2lwcyB1bmtub3duIGhvb2sgdHlwZXMnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGpzb24gPSB7XG5cdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFVua25vd25UeXBlOiBbeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwidGVzdFwiJyB9XSxcblx0XHRcdFx0XHRcdFByZVRvb2xVc2U6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJrbm93blwiJyB9XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZUhvb2tzKGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmhvb2tzLnNpemUsIDEpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0Lmhvb2tzLmhhcyhIb29rVHlwZS5QcmVUb29sVXNlKSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2tpcHMgbm9uLWFycmF5IGhvb2sgZW50cmllcycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QganNvbiA9IHtcblx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0UHJlVG9vbFVzZTogeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwibm90IGFycmF5XCInIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVIb29rcyhqc29uLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ob29rcy5zaXplLCAwKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdza2lwcyBpbnZhbGlkIGNvbW1hbmQgZW50cmllcycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QganNvbiA9IHtcblx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0UHJlVG9vbFVzZTogW1xuXHRcdFx0XHRcdFx0XHQnaW52YWxpZCBzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRudWxsLFxuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ3ZhbGlkJyB9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlSG9va3MoanNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gcmVzdWx0Lmhvb2tzLmdldChIb29rVHlwZS5QcmVUb29sVXNlKSE7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rcy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaG9va3NbMF0uY29tbWFuZCwgJ3ZhbGlkJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2tpcHMgY29tbWFuZHMgd2l0aCB3cm9uZyB0eXBlJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0XHRQcmVUb29sVXNlOiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ3NjcmlwdCcsIGNvbW1hbmQ6ICdpbnZhbGlkIHR5cGUnIH0sXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAndmFsaWQnIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVIb29rcyhqc29uLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdFx0Y29uc3QgZW50cnkgPSByZXN1bHQuaG9va3MuZ2V0KEhvb2tUeXBlLlByZVRvb2xVc2UpITtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rc1swXS5jb21tYW5kLCAndmFsaWQnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2N3ZCBhbmQgZW52IHJlc29sdXRpb24nLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdyZXNvbHZlcyBjd2QgcmVsYXRpdmUgdG8gd29ya3NwYWNlJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0XHRQcmVUb29sVXNlOiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcInRlc3RcIicsIGN3ZDogJ3NyYycgfVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZUhvb2tzKGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHJlc3VsdC5ob29rcy5nZXQoSG9va1R5cGUuUHJlVG9vbFVzZSkhO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzWzBdLmN3ZCwgVVJJLmZpbGUoJy93b3Jrc3BhY2Uvc3JjJykpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3ByZXNlcnZlcyBlbnYgdmFyaWFibGVzJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0XHRQcmVUb29sVXNlOiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcInRlc3RcIicsIGVudjogeyBOT0RFX0VOVjogJ3Byb2R1Y3Rpb24nIH0gfVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZUhvb2tzKGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHJlc3VsdC5ob29rcy5nZXQoSG9va1R5cGUuUHJlVG9vbFVzZSkhO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzWzBdLmVudiwgeyBOT0RFX0VOVjogJ3Byb2R1Y3Rpb24nIH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3ByZXNlcnZlcyB0aW1lb3V0JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0XHRQcmVUb29sVXNlOiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcInRlc3RcIicsIHRpbWVvdXQ6IDYwIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVIb29rcyhqc29uLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdFx0Y29uc3QgZW50cnkgPSByZXN1bHQuaG9va3MuZ2V0KEhvb2tUeXBlLlByZVRvb2xVc2UpITtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzWzBdLnRpbWVvdXQsIDYwKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzdXBwb3J0cyBDbGF1ZGUgdGltZW91dCBhbGlhcycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QganNvbiA9IHtcblx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0UHJlVG9vbFVzZTogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJ0ZXN0XCInLCB0aW1lb3V0OiAxIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVIb29rcyhqc29uLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdFx0Y29uc3QgZW50cnkgPSByZXN1bHQuaG9va3MuZ2V0KEhvb2tUeXBlLlByZVRvb2xVc2UpITtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzWzBdLnRpbWVvdXQsIDEpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdIb29rU291cmNlRm9ybWF0JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnZ2V0SG9va1NvdXJjZUZvcm1hdCcsICgpID0+IHtcblx0XHR0ZXN0KCdkZXRlY3RzIENsYXVkZSBmb3JtYXQgZm9yIC5jbGF1ZGUvc2V0dGluZ3MuanNvbicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRIb29rU291cmNlRm9ybWF0KFVSSS5maWxlKCcvd29ya3NwYWNlLy5jbGF1ZGUvc2V0dGluZ3MuanNvbicpKSwgSG9va1NvdXJjZUZvcm1hdC5DbGF1ZGUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGV0ZWN0cyBDbGF1ZGUgZm9ybWF0IGZvciAuY2xhdWRlL3NldHRpbmdzLmxvY2FsLmpzb24nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0SG9va1NvdXJjZUZvcm1hdChVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY2xhdWRlL3NldHRpbmdzLmxvY2FsLmpzb24nKSksIEhvb2tTb3VyY2VGb3JtYXQuQ2xhdWRlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RldGVjdHMgQ2xhdWRlIGZvcm1hdCBmb3Igfi8uY2xhdWRlL3NldHRpbmdzLmpzb24nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0SG9va1NvdXJjZUZvcm1hdChVUkkuZmlsZSgnL2hvbWUvdXNlci8uY2xhdWRlL3NldHRpbmdzLmpzb24nKSksIEhvb2tTb3VyY2VGb3JtYXQuQ2xhdWRlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgQ29waWxvdCBmb3JtYXQgZm9yIC5naXRodWIvaG9va3MvaG9va3MuanNvbicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRIb29rU291cmNlRm9ybWF0KFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3MvaG9va3MuanNvbicpKSwgSG9va1NvdXJjZUZvcm1hdC5Db3BpbG90KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgQ29waWxvdCBmb3JtYXQgZm9yIGFyYml0cmFyeSAuanNvbiBmaWxlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEhvb2tTb3VyY2VGb3JtYXQoVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcy9teS1ob29rcy5qc29uJykpLCBIb29rU291cmNlRm9ybWF0LkNvcGlsb3QpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBDb3BpbG90IGZvcm1hdCBmb3Igc2V0dGluZ3MuanNvbiBub3QgaW5zaWRlIC5jbGF1ZGUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0SG9va1NvdXJjZUZvcm1hdChVUkkuZmlsZSgnL3dvcmtzcGFjZS8udnNjb2RlL3NldHRpbmdzLmpzb24nKSksIEhvb2tTb3VyY2VGb3JtYXQuQ29waWxvdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdidWlsZE5ld0hvb2tFbnRyeScsICgpID0+IHtcblx0XHR0ZXN0KCdidWlsZHMgQ29waWxvdCBmb3JtYXQgZW50cnknLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ1aWxkTmV3SG9va0VudHJ5KEhvb2tTb3VyY2VGb3JtYXQuQ29waWxvdCksIHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRjb21tYW5kOiAnJ1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdidWlsZHMgQ2xhdWRlIGZvcm1hdCBlbnRyeSB3aXRoIG1hdGNoZXIgd3JhcHBlcicsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVpbGROZXdIb29rRW50cnkoSG9va1NvdXJjZUZvcm1hdC5DbGF1ZGUpLCB7XG5cdFx0XHRcdG1hdGNoZXI6ICcnLFxuXHRcdFx0XHRob29rczogW3tcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJydcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xhdWRlIGZvcm1hdCBlbnRyeSBzZXJpYWxpemVzIGNvcnJlY3RseSBpbiBKU09OJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW50cnkgPSBidWlsZE5ld0hvb2tFbnRyeShIb29rU291cmNlRm9ybWF0LkNsYXVkZSk7XG5cdFx0XHRjb25zdCBob29rc0NvbnRlbnQgPSB7XG5cdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0U3ViYWdlbnRTdGFydDogW2VudHJ5XVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KGhvb2tzQ29udGVudCwgbnVsbCwgJ1xcdCcpO1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShqc29uKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VkLmhvb2tzLlN1YmFnZW50U3RhcnRbMF0sIHtcblx0XHRcdFx0bWF0Y2hlcjogJycsXG5cdFx0XHRcdGhvb2tzOiBbe1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDb3BpbG90IGZvcm1hdCBlbnRyeSBzZXJpYWxpemVzIGNvcnJlY3RseSBpbiBKU09OJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW50cnkgPSBidWlsZE5ld0hvb2tFbnRyeShIb29rU291cmNlRm9ybWF0LkNvcGlsb3QpO1xuXHRcdFx0Y29uc3QgaG9va3NDb250ZW50ID0ge1xuXHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFN1YmFnZW50U3RhcnQ6IFtlbnRyeV1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeShob29rc0NvbnRlbnQsIG51bGwsICdcXHQnKTtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoanNvbik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZC5ob29rcy5TdWJhZ2VudFN0YXJ0WzBdLCB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0Y29tbWFuZDogJydcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xhdWRlIGZvcm1hdCByb3VuZC10cmlwcyB0aHJvdWdoIHBhcnNlQ2xhdWRlSG9va3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IGJ1aWxkTmV3SG9va0VudHJ5KEhvb2tTb3VyY2VGb3JtYXQuQ2xhdWRlKTtcblx0XHRcdGNvbnN0IGhvb2tzQ29udGVudCA9IHtcblx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRQcmVUb29sVXNlOiBbZW50cnldXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlSG9va3MoaG9va3NDb250ZW50LCBVUkkuZmlsZSgnL3dvcmtzcGFjZScpLCAnL2hvbWUvdXNlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ob29rcy5zaXplLCAxKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaG9va3MuaGFzKEhvb2tUeXBlLlByZVRvb2xVc2UpKTtcblx0XHRcdGNvbnN0IGhvb2tzID0gcmVzdWx0Lmhvb2tzLmdldChIb29rVHlwZS5QcmVUb29sVXNlKSE7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9va3MuaG9va3MubGVuZ3RoLCAxKTtcblx0XHRcdC8vIEVtcHR5IGNvbW1hbmQgc3RyaW5nIGlzIGZhbHN5IGFuZCBnZXRzIG9taXR0ZWQgYnkgcmVzb2x2ZUhvb2tDb21tYW5kXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9va3MuaG9va3NbMF0uY29tbWFuZCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQix1QkFBdUIsdUJBQXVCLG1DQUFtQztBQUM1RyxTQUFTLHFCQUFxQixrQkFBa0IseUJBQXlCO0FBQ3pFLFNBQVMsV0FBVztBQUVwQixNQUFNLG9CQUFvQixNQUFNO0FBQy9CLDBDQUF3QztBQUV4QyxRQUFNLCtCQUErQixNQUFNO0FBQzFDLFVBQU0sZ0JBQWdCLElBQUksS0FBSyxZQUFZO0FBQzNDLFVBQU0sV0FBVztBQUVqQixTQUFLLGtDQUFrQyxNQUFNO0FBQzVDLFlBQU0sT0FBTyxFQUFFLE1BQU0sV0FBVyxTQUFTLGNBQWM7QUFFdkQsWUFBTSxTQUFTLDRCQUE0QixNQUFNLGVBQWUsUUFBUTtBQUV4RSxhQUFPLFlBQVksT0FB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
