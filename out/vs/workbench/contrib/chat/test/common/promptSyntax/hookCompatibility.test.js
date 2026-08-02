import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { HookType } from "../../../common/promptSyntax/hookTypes.js";
import { parseCopilotHooks, parseHooksFromFile, HookSourceFormat } from "../../../common/promptSyntax/hookCompatibility.js";
import { URI } from "../../../../../../base/common/uri.js";
suite("HookCompatibility", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("parseCopilotHooks", () => {
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
        const result = parseCopilotHooks(json, workspaceRoot, userHome);
        assert.strictEqual(result.size, 1);
        assert.ok(result.has(HookType.PreToolUse));
        const entry = result.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 1);
        assert.strictEqual(entry.hooks[0].command, 'echo "pre-tool"');
      });
    });
    suite("invalid inputs", () => {
      test("returns empty result for null json", () => {
        const result = parseCopilotHooks(null, workspaceRoot, userHome);
        assert.strictEqual(result.size, 0);
      });
      test("returns empty result for undefined json", () => {
        const result = parseCopilotHooks(void 0, workspaceRoot, userHome);
        assert.strictEqual(result.size, 0);
      });
      test("returns empty result for missing hooks property", () => {
        const result = parseCopilotHooks({}, workspaceRoot, userHome);
        assert.strictEqual(result.size, 0);
      });
    });
    suite("Claude-style matcher compatibility", () => {
      test("parses Claude-style nested matcher structure", () => {
        const json = {
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [
                  { type: "command", command: 'echo "from matcher"' }
                ]
              }
            ]
          }
        };
        const result = parseCopilotHooks(json, workspaceRoot, userHome);
        assert.strictEqual(result.size, 1);
        const entry = result.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 1);
        assert.strictEqual(entry.hooks[0].command, 'echo "from matcher"');
      });
      test("parses Claude-style nested matcher with multiple hooks", () => {
        const json = {
          hooks: {
            PostToolUse: [
              {
                matcher: "Write",
                hooks: [
                  { type: "command", command: 'echo "first"' },
                  { type: "command", command: 'echo "second"' }
                ]
              }
            ]
          }
        };
        const result = parseCopilotHooks(json, workspaceRoot, userHome);
        const entry = result.get(HookType.PostToolUse);
        assert.strictEqual(entry.hooks.length, 2);
        assert.strictEqual(entry.hooks[0].command, 'echo "first"');
        assert.strictEqual(entry.hooks[1].command, 'echo "second"');
      });
      test("handles mixed direct and nested matcher entries", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "direct"' },
              {
                matcher: "Bash",
                hooks: [
                  { type: "command", command: 'echo "nested"' }
                ]
              }
            ]
          }
        };
        const result = parseCopilotHooks(json, workspaceRoot, userHome);
        const entry = result.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 2);
        assert.strictEqual(entry.hooks[0].command, 'echo "direct"');
        assert.strictEqual(entry.hooks[1].command, 'echo "nested"');
      });
      test("handles Claude-style hook without type field", () => {
        const json = {
          hooks: {
            SessionStart: [
              { command: 'echo "no type"' }
            ]
          }
        };
        const result = parseCopilotHooks(json, workspaceRoot, userHome);
        const entry = result.get(HookType.SessionStart);
        assert.strictEqual(entry.hooks.length, 1);
        assert.strictEqual(entry.hooks[0].command, 'echo "no type"');
      });
    });
  });
  suite("parseHooksFromFile", () => {
    const workspaceRoot = URI.file("/workspace");
    const userHome = "/home/user";
    test("uses Copilot format for .github/hooks/*.json files", () => {
      const fileUri = URI.file("/workspace/.github/hooks/my-hooks.json");
      const json = {
        hooks: {
          PreToolUse: [
            { type: "command", command: 'echo "test"' }
          ]
        }
      };
      const result = parseHooksFromFile(fileUri, json, workspaceRoot, userHome);
      assert.strictEqual(result.format, HookSourceFormat.Copilot);
      assert.strictEqual(result.disabledAllHooks, false);
      assert.strictEqual(result.hooks.size, 1);
    });
    test("uses Claude format for .claude/settings.json files", () => {
      const fileUri = URI.file("/workspace/.claude/settings.json");
      const json = {
        disableAllHooks: true,
        hooks: {
          PreToolUse: [
            { type: "command", command: 'echo "test"' }
          ]
        }
      };
      const result = parseHooksFromFile(fileUri, json, workspaceRoot, userHome);
      assert.strictEqual(result.format, HookSourceFormat.Claude);
      assert.strictEqual(result.disabledAllHooks, true);
      assert.strictEqual(result.hooks.size, 0);
    });
    test("disableAllHooks is ignored for Copilot format", () => {
      const fileUri = URI.file("/workspace/.github/hooks/hooks.json");
      const json = {
        disableAllHooks: true,
        hooks: {
          SessionStart: [
            { type: "command", command: 'echo "start"' }
          ]
        }
      };
      const result = parseHooksFromFile(fileUri, json, workspaceRoot, userHome);
      assert.strictEqual(result.disabledAllHooks, false);
      assert.strictEqual(result.hooks.size, 1);
    });
    test("disabledAllHooks works for Claude format", () => {
      const fileUri = URI.file("/workspace/.claude/settings.local.json");
      const json = {
        disableAllHooks: true,
        hooks: {
          SessionStart: [
            { type: "command", command: 'echo "start"' }
          ]
        }
      };
      const result = parseHooksFromFile(fileUri, json, workspaceRoot, userHome);
      assert.strictEqual(result.disabledAllHooks, true);
      assert.strictEqual(result.hooks.size, 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tDb21wYXRpYmlsaXR5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEhvb2tUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9ob29rVHlwZXMuanMnO1xuaW1wb3J0IHsgcGFyc2VDb3BpbG90SG9va3MsIHBhcnNlSG9va3NGcm9tRmlsZSwgSG9va1NvdXJjZUZvcm1hdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va0NvbXBhdGliaWxpdHkuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuc3VpdGUoJ0hvb2tDb21wYXRpYmlsaXR5JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgncGFyc2VDb3BpbG90SG9va3MnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlUm9vdCA9IFVSSS5maWxlKCcvd29ya3NwYWNlJyk7XG5cdFx0Y29uc3QgdXNlckhvbWUgPSAnL2hvbWUvdXNlcic7XG5cblx0XHRzdWl0ZSgnYmFzaWMgcGFyc2luZycsICgpID0+IHtcblx0XHRcdHRlc3QoJ3BhcnNlcyBzaW1wbGUgaG9vayB3aXRoIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGpzb24gPSB7XG5cdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFByZVRvb2xVc2U6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwicHJlLXRvb2xcIicgfVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNvcGlsb3RIb29rcyhqc29uLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zaXplLCAxKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5oYXMoSG9va1R5cGUuUHJlVG9vbFVzZSkpO1xuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHJlc3VsdC5nZXQoSG9va1R5cGUuUHJlVG9vbFVzZSkhO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaG9va3MubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzWzBdLmNvbW1hbmQsICdlY2hvIFwicHJlLXRvb2xcIicpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnaW52YWxpZCBpbnB1dHMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IHJlc3VsdCBmb3IgbnVsbCBqc29uJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNvcGlsb3RIb29rcyhudWxsLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc2l6ZSwgMCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmV0dXJucyBlbXB0eSByZXN1bHQgZm9yIHVuZGVmaW5lZCBqc29uJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNvcGlsb3RIb29rcyh1bmRlZmluZWQsIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zaXplLCAwKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IHJlc3VsdCBmb3IgbWlzc2luZyBob29rcyBwcm9wZXJ0eScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDb3BpbG90SG9va3Moe30sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zaXplLCAwKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ0NsYXVkZS1zdHlsZSBtYXRjaGVyIGNvbXBhdGliaWxpdHknLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdwYXJzZXMgQ2xhdWRlLXN0eWxlIG5lc3RlZCBtYXRjaGVyIHN0cnVjdHVyZScsICgpID0+IHtcblx0XHRcdFx0Ly8gV2hlbiBDbGF1ZGUgZm9ybWF0IGlzIHBhc3RlZCBpbnRvIENvcGlsb3QgaG9va3MgZmlsZVxuXHRcdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0XHRQcmVUb29sVXNlOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRtYXRjaGVyOiAnQmFzaCcsXG5cdFx0XHRcdFx0XHRcdFx0aG9va3M6IFtcblx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcImZyb20gbWF0Y2hlclwiJyB9XG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ29waWxvdEhvb2tzKGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNpemUsIDEpO1xuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHJlc3VsdC5nZXQoSG9va1R5cGUuUHJlVG9vbFVzZSkhO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaG9va3MubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzWzBdLmNvbW1hbmQsICdlY2hvIFwiZnJvbSBtYXRjaGVyXCInKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdwYXJzZXMgQ2xhdWRlLXN0eWxlIG5lc3RlZCBtYXRjaGVyIHdpdGggbXVsdGlwbGUgaG9va3MnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGpzb24gPSB7XG5cdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFBvc3RUb29sVXNlOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRtYXRjaGVyOiAnV3JpdGUnLFxuXHRcdFx0XHRcdFx0XHRcdGhvb2tzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJmaXJzdFwiJyB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwic2Vjb25kXCInIH1cblx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDb3BpbG90SG9va3MoanNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gcmVzdWx0LmdldChIb29rVHlwZS5Qb3N0VG9vbFVzZSkhO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaG9va3MubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzWzBdLmNvbW1hbmQsICdlY2hvIFwiZmlyc3RcIicpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaG9va3NbMV0uY29tbWFuZCwgJ2VjaG8gXCJzZWNvbmRcIicpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2hhbmRsZXMgbWl4ZWQgZGlyZWN0IGFuZCBuZXN0ZWQgbWF0Y2hlciBlbnRyaWVzJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0XHRQcmVUb29sVXNlOiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcImRpcmVjdFwiJyB9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bWF0Y2hlcjogJ0Jhc2gnLFxuXHRcdFx0XHRcdFx0XHRcdGhvb2tzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJuZXN0ZWRcIicgfVxuXHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNvcGlsb3RIb29rcyhqc29uLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdFx0Y29uc3QgZW50cnkgPSByZXN1bHQuZ2V0KEhvb2tUeXBlLlByZVRvb2xVc2UpITtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rc1swXS5jb21tYW5kLCAnZWNobyBcImRpcmVjdFwiJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rc1sxXS5jb21tYW5kLCAnZWNobyBcIm5lc3RlZFwiJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnaGFuZGxlcyBDbGF1ZGUtc3R5bGUgaG9vayB3aXRob3V0IHR5cGUgZmllbGQnLCAoKSA9PiB7XG5cdFx0XHRcdC8vIENsYXVkZSBhbGxvd3Mgb21pdHRpbmcgdGhlIHR5cGUgZmllbGRcblx0XHRcdFx0Y29uc3QganNvbiA9IHtcblx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0U2Vzc2lvblN0YXJ0OiBbXG5cdFx0XHRcdFx0XHRcdHsgY29tbWFuZDogJ2VjaG8gXCJubyB0eXBlXCInIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDb3BpbG90SG9va3MoanNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gcmVzdWx0LmdldChIb29rVHlwZS5TZXNzaW9uU3RhcnQpITtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rc1swXS5jb21tYW5kLCAnZWNobyBcIm5vIHR5cGVcIicpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwYXJzZUhvb2tzRnJvbUZpbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlUm9vdCA9IFVSSS5maWxlKCcvd29ya3NwYWNlJyk7XG5cdFx0Y29uc3QgdXNlckhvbWUgPSAnL2hvbWUvdXNlcic7XG5cblx0XHR0ZXN0KCd1c2VzIENvcGlsb3QgZm9ybWF0IGZvciAuZ2l0aHViL2hvb2tzLyouanNvbiBmaWxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL215LWhvb2tzLmpzb24nKTtcblx0XHRcdGNvbnN0IGpzb24gPSB7XG5cdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0UHJlVG9vbFVzZTogW1xuXHRcdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwidGVzdFwiJyB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUhvb2tzRnJvbUZpbGUoZmlsZVVyaSwganNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmZvcm1hdCwgSG9va1NvdXJjZUZvcm1hdC5Db3BpbG90KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzYWJsZWRBbGxIb29rcywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ob29rcy5zaXplLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgQ2xhdWRlIGZvcm1hdCBmb3IgLmNsYXVkZS9zZXR0aW5ncy5qc29uIGZpbGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5jbGF1ZGUvc2V0dGluZ3MuanNvbicpO1xuXHRcdFx0Y29uc3QganNvbiA9IHtcblx0XHRcdFx0ZGlzYWJsZUFsbEhvb2tzOiB0cnVlLFxuXHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFByZVRvb2xVc2U6IFtcblx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcInRlc3RcIicgfVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VIb29rc0Zyb21GaWxlKGZpbGVVcmksIGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5mb3JtYXQsIEhvb2tTb3VyY2VGb3JtYXQuQ2xhdWRlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzYWJsZWRBbGxIb29rcywgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmhvb2tzLnNpemUsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzYWJsZUFsbEhvb2tzIGlzIGlnbm9yZWQgZm9yIENvcGlsb3QgZm9ybWF0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3MvaG9va3MuanNvbicpO1xuXHRcdFx0Y29uc3QganNvbiA9IHtcblx0XHRcdFx0ZGlzYWJsZUFsbEhvb2tzOiB0cnVlLFxuXHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFNlc3Npb25TdGFydDogW1xuXHRcdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwic3RhcnRcIicgfVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VIb29rc0Zyb21GaWxlKGZpbGVVcmksIGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0Ly8gQ29waWxvdCBmb3JtYXQgZG9lcyBub3Qgc3VwcG9ydCBkaXNhYmxlQWxsSG9va3Ncblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzYWJsZWRBbGxIb29rcywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ob29rcy5zaXplLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc2FibGVkQWxsSG9va3Mgd29ya3MgZm9yIENsYXVkZSBmb3JtYXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlVXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmNsYXVkZS9zZXR0aW5ncy5sb2NhbC5qc29uJyk7XG5cdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRkaXNhYmxlQWxsSG9va3M6IHRydWUsXG5cdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0U2Vzc2lvblN0YXJ0OiBbXG5cdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJzdGFydFwiJyB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUhvb2tzRnJvbUZpbGUoZmlsZVVyaSwganNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2FibGVkQWxsSG9va3MsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ob29rcy5zaXplLCAwKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQixvQkFBb0Isd0JBQXdCO0FBQ3hFLFNBQVMsV0FBVztBQUVwQixNQUFNLHFCQUFxQixNQUFNO0FBQ2hDLDBDQUF3QztBQUV4QyxRQUFNLHFCQUFxQixNQUFNO0FBQ2hDLFVBQU0sZ0JBQWdCLElBQUksS0FBSyxZQUFZO0FBQzNDLFVBQU0sV0FBVztBQUVqQixVQUFNLGlCQUFpQixNQUFNO0FB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UUFBUTtBQUV4RSxhQUFPLFlBQVksT0FBTyxRQUFRLGlCQUFpQixPQUFPO0FBQzFELGFBQU8sWUFBWSxPQUFPLGtCQUFrQixLQUFLO0FBQ2pELGFBQU8sWUFBWSxPQUFPLE1BQU0sTUFBTSxDQUFDO0FBQUEsSUFDeEMsQ0FBQztBQUVELFNBQUssc0RBQXNELE1BQU07QUFDaEUsWUFBTSxVQUFVLElBQUksS0FBSyxrQ0FBa0M7QUFDM0QsWUFBTSxPQUFPO0FBQUEsUUFDWixpQkFBaUI7QUFBQSxRQUNqQixPQUFPO0FBQUEsVUFDTixZQUFZO0FBQUEsWUFDWCxFQUFFLE1BQU0sV0FBVyxTQUFTLGNBQWM7QUFBQSxVQUMzQztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsWUFBTSxTQUFTLG1CQUFtQixTQUFTLE1BQU0sZUFBZSxRQUFRO0FBRXhFLGFBQU8sWUFBWSxPQUFPLFFBQVEsaUJBQWlCLE1BQU07QUFDekQsYUFBTyxZQUFZLE9BQU8sa0JBQWtCLElBQUk7QUFDaEQsYUFBTyxZQUFZLE9BQU8sTUFBTSxNQUFNLENBQUM7QUFBQSxJQUN4QyxDQUFDO0FBRUQsU0FBSyxpREFBaUQsTUFBTTtBQUMzRCxZQUFNLFVBQVUsSUFBSSxLQUFLLHFDQUFxQztBQUM5RCxZQUFNLE9BQU87QUFBQSxRQUNaLGlCQUFpQjtBQUFBLFFBQ2pCLE9BQU87QUFBQSxVQUNOLGNBQWM7QUFBQSxZQUNiLEVBQUUsTUFBTSxXQUFXLFNBQVMsZUFBZTtBQUFBLFVBQzVDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFNBQVMsbUJBQW1CLFNBQVMsTUFBTSxlQUFlLFFBQVE7QUFHeEUsYUFBTyxZQUFZLE9BQU8sa0JBQWtCLEtBQUs7QUFDakQsYUFBTyxZQUFZLE9BQU8sTUFBTSxNQUFNLENBQUM7QUFBQSxJQUN4QyxDQUFDO0FBRUQsU0FBSyw0Q0FBNEMsTUFBTTtBQUN0RCxZQUFNLFVBQVUsSUFBSSxLQUFLLHdDQUF3QztBQUNqRSxZQUFNLE9BQU87QUFBQSxRQUNaLGlCQUFpQjtBQUFBLFFBQ2pCLE9BQU87QUFBQSxVQUNOLGNBQWM7QUFBQSxZQUNiLEVBQUUsTUFBTSxXQUFXLFNBQVMsZUFBZTtBQUFBLFVBQzVDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFNBQVMsbUJBQW1CLFNBQVMsTUFBTSxlQUFlLFFBQVE7QUFFeEUsYUFBTyxZQUFZLE9BQU8sa0JBQWtCLElBQUk7QUFDaEQsYUFBTyxZQUFZLE9BQU8sTUFBTSxNQUFNLENBQUM7QUFBQSxJQUN4QyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
