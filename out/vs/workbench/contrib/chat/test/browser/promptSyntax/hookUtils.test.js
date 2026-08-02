import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { findHookCommandInYaml, findHookCommandSelection } from "../../../browser/promptSyntax/hookUtils.js";
import { buildNewHookEntry, HookSourceFormat } from "../../../common/promptSyntax/hookCompatibility.js";
function getSelectedText(content, selection) {
  const lines = content.split("\n");
  if (selection.startLineNumber === selection.endLineNumber) {
    return lines[selection.startLineNumber - 1].substring(selection.startColumn - 1, selection.endColumn - 1);
  }
  const result = [];
  result.push(lines[selection.startLineNumber - 1].substring(selection.startColumn - 1));
  for (let i = selection.startLineNumber; i < selection.endLineNumber - 1; i++) {
    result.push(lines[i]);
  }
  result.push(lines[selection.endLineNumber - 1].substring(0, selection.endColumn - 1));
  return result.join("\n");
}
suite("hookUtils", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("findHookCommandSelection", () => {
    suite("simple format", () => {
      const simpleFormat = `{
	"hooks": {
		"SessionStart": [
			{
				"type": "command",
				"command": "echo first"
			},
			{
				"type": "command",
				"command": "echo second"
			}
		],
		"UserPromptSubmit": [
			{
				"type": "command",
				"command": "echo foo > test.derp"
			}
		]
	}
}`;
      test("finds first command in SessionStart", () => {
        const result = findHookCommandSelection(simpleFormat, "SessionStart", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(simpleFormat, result), "echo first");
        assert.deepStrictEqual(result, {
          startLineNumber: 6,
          startColumn: 17,
          endLineNumber: 6,
          endColumn: 27
        });
      });
      test("finds second command in SessionStart", () => {
        const result = findHookCommandSelection(simpleFormat, "SessionStart", 1, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(simpleFormat, result), "echo second");
        assert.deepStrictEqual(result, {
          startLineNumber: 10,
          startColumn: 17,
          endLineNumber: 10,
          endColumn: 28
        });
      });
      test("finds command in UserPromptSubmit", () => {
        const result = findHookCommandSelection(simpleFormat, "UserPromptSubmit", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(simpleFormat, result), "echo foo > test.derp");
        assert.deepStrictEqual(result, {
          startLineNumber: 16,
          startColumn: 17,
          endLineNumber: 16,
          endColumn: 37
        });
      });
      test("returns undefined for out of bounds index", () => {
        const result = findHookCommandSelection(simpleFormat, "SessionStart", 5, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined for non-existent hook type", () => {
        const result = findHookCommandSelection(simpleFormat, "nonExistent", 0, "command");
        assert.strictEqual(result, void 0);
      });
    });
    suite("nested matcher format", () => {
      const nestedFormat = `{
	"forceLoginMethod": "console",
	"hooks": {
		"UserPromptSubmit": [
			{
				"matcher": "",
				"hooks": [
					{
						"type": "command",
						"command": "echo 'foobarbaz5' > ~/foobarbaz.txt"
					}
				]
			}
		]
	}
}`;
      test("finds command inside nested hooks", () => {
        const result = findHookCommandSelection(nestedFormat, "UserPromptSubmit", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(nestedFormat, result), "echo 'foobarbaz5' > ~/foobarbaz.txt");
        assert.deepStrictEqual(result, {
          startLineNumber: 10,
          startColumn: 19,
          endLineNumber: 10,
          endColumn: 54
        });
      });
      test("returns undefined for non-existent field name", () => {
        const result = findHookCommandSelection(nestedFormat, "UserPromptSubmit", 0, "bash");
        assert.strictEqual(result, void 0);
      });
    });
    suite("mixed format with multiple nested hooks", () => {
      const mixedFormat = `{
	"hooks": {
		"PreToolUse": [
			{
				"matcher": "edit_file",
				"hooks": [
					{
						"type": "command",
						"command": "first nested"
					},
					{
						"type": "command",
						"command": "second nested"
					}
				]
			},
			{
				"type": "command",
				"command": "simple after nested"
			}
		]
	}
}`;
      test("finds first command in first nested hooks array", () => {
        const result = findHookCommandSelection(mixedFormat, "PreToolUse", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(mixedFormat, result), "first nested");
        assert.deepStrictEqual(result, {
          startLineNumber: 9,
          startColumn: 19,
          endLineNumber: 9,
          endColumn: 31
        });
      });
      test("finds second command in first nested hooks array", () => {
        const result = findHookCommandSelection(mixedFormat, "PreToolUse", 1, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(mixedFormat, result), "second nested");
        assert.deepStrictEqual(result, {
          startLineNumber: 13,
          startColumn: 19,
          endLineNumber: 13,
          endColumn: 32
        });
      });
      test("finds simple command after nested structure", () => {
        const result = findHookCommandSelection(mixedFormat, "PreToolUse", 2, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(mixedFormat, result), "simple after nested");
        assert.deepStrictEqual(result, {
          startLineNumber: 19,
          startColumn: 17,
          endLineNumber: 19,
          endColumn: 36
        });
      });
    });
    suite("bash and powershell fields", () => {
      const platformSpecificFormat = `{
	"hooks": {
		"SessionStart": [
			{
				"type": "command",
				"bash": "echo hello from bash",
				"powershell": "Write-Host hello"
			}
		]
	}
}`;
      test("finds bash field", () => {
        const result = findHookCommandSelection(platformSpecificFormat, "SessionStart", 0, "bash");
        assert.ok(result);
        assert.strictEqual(getSelectedText(platformSpecificFormat, result), "echo hello from bash");
        assert.deepStrictEqual(result, {
          startLineNumber: 6,
          startColumn: 14,
          endLineNumber: 6,
          endColumn: 34
        });
      });
      test("finds powershell field", () => {
        const result = findHookCommandSelection(platformSpecificFormat, "SessionStart", 0, "powershell");
        assert.ok(result);
        assert.strictEqual(getSelectedText(platformSpecificFormat, result), "Write-Host hello");
        assert.deepStrictEqual(result, {
          startLineNumber: 7,
          startColumn: 20,
          endLineNumber: 7,
          endColumn: 36
        });
      });
    });
    suite("edge cases", () => {
      test("returns undefined for empty content", () => {
        const result = findHookCommandSelection("", "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined for invalid JSON", () => {
        const result = findHookCommandSelection("{ invalid json }", "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined when hooks key is missing", () => {
        const content = '{ "other": 1 }';
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined when hook type array is empty", () => {
        const content = '{ "hooks": { "sessionStart": [] } }';
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined when hook item is not an object", () => {
        const content = '{ "hooks": { "sessionStart": ["not an object"] } }';
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("handles empty command string", () => {
        const content = `{
	"hooks": {
		"sessionStart": [
			{
				"type": "command",
				"command": ""
			}
		]
	}
}`;
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(content, result), "");
        assert.deepStrictEqual(result, {
          startLineNumber: 6,
          startColumn: 17,
          endLineNumber: 6,
          endColumn: 17
        });
      });
      test("handles multiline command value", () => {
        const content = `{
	"hooks": {
		"sessionStart": [
			{
				"type": "command",
				"command": "line1\\nline2"
			}
		]
	}
}`;
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(content, result), "line1\\nline2");
        assert.deepStrictEqual(result, {
          startLineNumber: 6,
          startColumn: 17,
          endLineNumber: 6,
          endColumn: 29
        });
      });
    });
    suite("nested matcher with empty hooks array", () => {
      const emptyNestedHooks = `{
	"hooks": {
		"UserPromptSubmit": [
			{
				"matcher": "some-pattern",
				"hooks": []
			},
			{
				"type": "command",
				"command": "after empty nested"
			}
		]
	}
}`;
      test("skips empty nested hooks and finds subsequent command", () => {
        const result = findHookCommandSelection(emptyNestedHooks, "UserPromptSubmit", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(emptyNestedHooks, result), "after empty nested");
        assert.deepStrictEqual(result, {
          startLineNumber: 10,
          startColumn: 17,
          endLineNumber: 10,
          endColumn: 35
        });
      });
    });
  });
  suite("findHookCommandSelection - copilotCLICompat", () => {
    suite("simple format", () => {
      const simpleFormat = `{
	"hooks": {
		"sessionStart": [
			{
				"type": "command",
				"command": "echo first"
			},
			{
				"type": "command",
				"command": "echo second"
			}
		],
		"userPromptSubmitted": [
			{
				"type": "command",
				"command": "echo foo > test.derp"
			}
		]
	}
}`;
      test("finds first command in sessionStart", () => {
        const result = findHookCommandSelection(simpleFormat, "sessionStart", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(simpleFormat, result), "echo first");
        assert.deepStrictEqual(result, {
          startLineNumber: 6,
          startColumn: 17,
          endLineNumber: 6,
          endColumn: 27
        });
      });
      test("finds second command in sessionStart", () => {
        const result = findHookCommandSelection(simpleFormat, "sessionStart", 1, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(simpleFormat, result), "echo second");
        assert.deepStrictEqual(result, {
          startLineNumber: 10,
          startColumn: 17,
          endLineNumber: 10,
          endColumn: 28
        });
      });
      test("finds command in userPromptSubmitted", () => {
        const result = findHookCommandSelection(simpleFormat, "userPromptSubmitted", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(simpleFormat, result), "echo foo > test.derp");
        assert.deepStrictEqual(result, {
          startLineNumber: 16,
          startColumn: 17,
          endLineNumber: 16,
          endColumn: 37
        });
      });
      test("returns undefined for out of bounds index", () => {
        const result = findHookCommandSelection(simpleFormat, "sessionStart", 5, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined for non-existent hook type", () => {
        const result = findHookCommandSelection(simpleFormat, "nonExistent", 0, "command");
        assert.strictEqual(result, void 0);
      });
    });
    suite("nested matcher format", () => {
      const nestedFormat = `{
	"forceLoginMethod": "console",
	"hooks": {
		"userPromptSubmitted": [
			{
				"matcher": "",
				"hooks": [
					{
						"type": "command",
						"command": "echo 'foobarbaz5' > ~/foobarbaz.txt"
					}
				]
			}
		]
	}
}`;
      test("finds command inside nested hooks", () => {
        const result = findHookCommandSelection(nestedFormat, "userPromptSubmitted", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(nestedFormat, result), "echo 'foobarbaz5' > ~/foobarbaz.txt");
        assert.deepStrictEqual(result, {
          startLineNumber: 10,
          startColumn: 19,
          endLineNumber: 10,
          endColumn: 54
        });
      });
      test("returns undefined for non-existent field name", () => {
        const result = findHookCommandSelection(nestedFormat, "userPromptSubmitted", 0, "bash");
        assert.strictEqual(result, void 0);
      });
    });
    suite("mixed format with multiple nested hooks", () => {
      const mixedFormat = `{
	"hooks": {
		"preToolUse": [
			{
				"matcher": "edit_file",
				"hooks": [
					{
						"type": "command",
						"command": "first nested"
					},
					{
						"type": "command",
						"command": "second nested"
					}
				]
			},
			{
				"type": "command",
				"command": "simple after nested"
			}
		]
	}
}`;
      test("finds first command in first nested hooks array", () => {
        const result = findHookCommandSelection(mixedFormat, "preToolUse", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(mixedFormat, result), "first nested");
        assert.deepStrictEqual(result, {
          startLineNumber: 9,
          startColumn: 19,
          endLineNumber: 9,
          endColumn: 31
        });
      });
      test("finds second command in first nested hooks array", () => {
        const result = findHookCommandSelection(mixedFormat, "preToolUse", 1, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(mixedFormat, result), "second nested");
        assert.deepStrictEqual(result, {
          startLineNumber: 13,
          startColumn: 19,
          endLineNumber: 13,
          endColumn: 32
        });
      });
      test("finds simple command after nested structure", () => {
        const result = findHookCommandSelection(mixedFormat, "preToolUse", 2, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(mixedFormat, result), "simple after nested");
        assert.deepStrictEqual(result, {
          startLineNumber: 19,
          startColumn: 17,
          endLineNumber: 19,
          endColumn: 36
        });
      });
    });
    suite("bash and powershell fields", () => {
      const platformSpecificFormat = `{
	"hooks": {
		"sessionStart": [
			{
				"type": "command",
				"bash": "echo hello from bash",
				"powershell": "Write-Host hello"
			}
		]
	}
}`;
      test("finds bash field", () => {
        const result = findHookCommandSelection(platformSpecificFormat, "sessionStart", 0, "bash");
        assert.ok(result);
        assert.strictEqual(getSelectedText(platformSpecificFormat, result), "echo hello from bash");
        assert.deepStrictEqual(result, {
          startLineNumber: 6,
          startColumn: 14,
          endLineNumber: 6,
          endColumn: 34
        });
      });
      test("finds powershell field", () => {
        const result = findHookCommandSelection(platformSpecificFormat, "sessionStart", 0, "powershell");
        assert.ok(result);
        assert.strictEqual(getSelectedText(platformSpecificFormat, result), "Write-Host hello");
        assert.deepStrictEqual(result, {
          startLineNumber: 7,
          startColumn: 20,
          endLineNumber: 7,
          endColumn: 36
        });
      });
    });
    suite("edge cases", () => {
      test("returns undefined for empty content", () => {
        const result = findHookCommandSelection("", "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined for invalid JSON", () => {
        const result = findHookCommandSelection("{ invalid json }", "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined when hooks key is missing", () => {
        const content = '{ "other": 1 }';
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined when hook type array is empty", () => {
        const content = '{ "hooks": { "sessionStart": [] } }';
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined when hook item is not an object", () => {
        const content = '{ "hooks": { "sessionStart": ["not an object"] } }';
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("handles empty command string", () => {
        const content = `{
	"hooks": {
		"sessionStart": [
			{
				"type": "command",
				"command": ""
			}
		]
	}
}`;
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(content, result), "");
        assert.deepStrictEqual(result, {
          startLineNumber: 6,
          startColumn: 17,
          endLineNumber: 6,
          endColumn: 17
        });
      });
      test("handles multiline command value", () => {
        const content = `{
	"hooks": {
		"sessionStart": [
			{
				"type": "command",
				"command": "line1\\nline2"
			}
		]
	}
}`;
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(content, result), "line1\\nline2");
        assert.deepStrictEqual(result, {
          startLineNumber: 6,
          startColumn: 17,
          endLineNumber: 6,
          endColumn: 29
        });
      });
    });
    suite("nested matcher with empty hooks array", () => {
      const emptyNestedHooks = `{
	"hooks": {
		"userPromptSubmitted": [
			{
				"matcher": "some-pattern",
				"hooks": []
			},
			{
				"type": "command",
				"command": "after empty nested"
			}
		]
	}
}`;
      test("skips empty nested hooks and finds subsequent command", () => {
        const result = findHookCommandSelection(emptyNestedHooks, "userPromptSubmitted", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(emptyNestedHooks, result), "after empty nested");
        assert.deepStrictEqual(result, {
          startLineNumber: 10,
          startColumn: 17,
          endLineNumber: 10,
          endColumn: 35
        });
      });
    });
  });
  suite("findHookCommandSelection with buildNewHookEntry", () => {
    test("finds command in Copilot-format generated JSON", () => {
      const entry = buildNewHookEntry(HookSourceFormat.Copilot);
      const content = JSON.stringify({ hooks: { SessionStart: [entry] } }, null, "	");
      const result = findHookCommandSelection(content, "SessionStart", 0, "command");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "");
    });
    test("finds command in Claude-format generated JSON", () => {
      const entry = buildNewHookEntry(HookSourceFormat.Claude);
      const content = JSON.stringify({ hooks: { PreToolUse: [entry] } }, null, "	");
      const result = findHookCommandSelection(content, "PreToolUse", 0, "command");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "");
    });
    test("finds command when appending Claude entry to existing hooks", () => {
      const entry1 = buildNewHookEntry(HookSourceFormat.Claude);
      const entry2 = buildNewHookEntry(HookSourceFormat.Claude);
      const content = JSON.stringify({ hooks: { PreToolUse: [entry1, entry2] } }, null, "	");
      const result0 = findHookCommandSelection(content, "PreToolUse", 0, "command");
      const result1 = findHookCommandSelection(content, "PreToolUse", 1, "command");
      assert.ok(result0);
      assert.ok(result1);
      assert.strictEqual(getSelectedText(content, result0), "");
      assert.strictEqual(getSelectedText(content, result1), "");
      assert.ok(result1.startLineNumber > result0.startLineNumber);
    });
    test("Claude format JSON has correct structure", () => {
      const entry = buildNewHookEntry(HookSourceFormat.Claude);
      const content = JSON.stringify({ hooks: { SubagentStart: [entry] } }, null, "	");
      const parsed = JSON.parse(content);
      assert.deepStrictEqual(parsed, {
        hooks: {
          SubagentStart: [
            {
              matcher: "",
              hooks: [{
                type: "command",
                command: ""
              }]
            }
          ]
        }
      });
    });
    test("Copilot format JSON has correct structure", () => {
      const entry = buildNewHookEntry(HookSourceFormat.Copilot);
      const content = JSON.stringify({ hooks: { SubagentStart: [entry] } }, null, "	");
      const parsed = JSON.parse(content);
      assert.deepStrictEqual(parsed, {
        hooks: {
          SubagentStart: [
            {
              type: "command",
              command: ""
            }
          ]
        }
      });
    });
  });
  suite("findHookCommandInYaml", () => {
    test("finds unquoted command value", () => {
      const content = [
        "---",
        "hooks:",
        "  sessionStart:",
        "    - command: echo hello",
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo hello");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "echo hello");
      assert.deepStrictEqual(result, {
        startLineNumber: 4,
        startColumn: 16,
        endLineNumber: 4,
        endColumn: 26
      });
    });
    test("finds double-quoted command value", () => {
      const content = [
        "---",
        "hooks:",
        "  sessionStart:",
        '    - command: "echo hello"',
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo hello");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "echo hello");
    });
    test("finds single-quoted command value", () => {
      const content = [
        "---",
        "hooks:",
        "  sessionStart:",
        `    - command: 'echo hello'`,
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo hello");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "echo hello");
    });
    test("finds command without list prefix", () => {
      const content = [
        "---",
        "hooks:",
        "  sessionStart:",
        "    command: run-lint",
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "run-lint");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "run-lint");
    });
    test("does not match substring of a longer command", () => {
      const content = [
        "---",
        "hooks:",
        "  sessionStart:",
        "    - command: echo hello-world",
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo hello");
      assert.strictEqual(result, void 0);
    });
    test("returns undefined when command is not found", () => {
      const content = [
        "---",
        "hooks:",
        "  sessionStart:",
        "    - command: echo hello",
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo goodbye");
      assert.strictEqual(result, void 0);
    });
    test("returns undefined when no command lines exist", () => {
      const content = [
        "---",
        "name: my-agent",
        "description: An agent",
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo hello");
      assert.strictEqual(result, void 0);
    });
    test("returns undefined for empty content", () => {
      const result = findHookCommandInYaml("", "echo hello");
      assert.strictEqual(result, void 0);
    });
    test("finds first matching command when multiple exist", () => {
      const content = [
        "---",
        "hooks:",
        "  sessionStart:",
        "    - command: echo hello",
        "  userPromptSubmit:",
        "    - command: echo hello",
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo hello");
      assert.ok(result);
      assert.strictEqual(result.startLineNumber, 4);
    });
    test("ignores lines that are not command fields", () => {
      const content = [
        "---",
        "description: run command echo hello",
        "hooks:",
        "  sessionStart:",
        "    - command: echo hello",
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo hello");
      assert.ok(result);
      assert.strictEqual(result.startLineNumber, 5);
    });
    test("handles command with special characters", () => {
      const content = [
        "---",
        "hooks:",
        "  preToolUse:",
        '    - command: echo "foo" > /tmp/out.txt',
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, 'echo "foo" > /tmp/out.txt');
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), 'echo "foo" > /tmp/out.txt');
    });
    test("matches command followed by trailing whitespace", () => {
      const content = [
        "---",
        "hooks:",
        "  sessionStart:",
        "    - command: echo hello   ",
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo hello");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "echo hello");
    });
    test("finds short command that is a substring of the key name", () => {
      const content = [
        "hooks:",
        "  Stop:",
        "    - timeout: 10",
        '      command: "a"',
        "      type: command"
      ].join("\n");
      const result = findHookCommandInYaml(content, "a");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "a");
      assert.strictEqual(result.startLineNumber, 4);
    });
    test("finds short command in bash field that is a substring of the key name", () => {
      const content = [
        "hooks:",
        "  sessionStart:",
        '    - bash: "a"',
        "      type: command"
      ].join("\n");
      const result = findHookCommandInYaml(content, "a");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "a");
      assert.strictEqual(result.startLineNumber, 3);
    });
    test("finds command in powershell field", () => {
      const content = [
        "hooks:",
        "  sessionStart:",
        '    - powershell: "echo hello"',
        "      type: command"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo hello");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "echo hello");
      assert.strictEqual(result.startLineNumber, 3);
    });
    test("finds command in windows field", () => {
      const content = [
        "hooks:",
        "  sessionStart:",
        '    - windows: "dir"',
        "      type: command"
      ].join("\n");
      const result = findHookCommandInYaml(content, "dir");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "dir");
      assert.strictEqual(result.startLineNumber, 3);
    });
    test("finds command in linux and osx fields", () => {
      const content = [
        "hooks:",
        "  sessionStart:",
        '    - linux: "ls"',
        '      osx: "ls -G"',
        "      type: command"
      ].join("\n");
      const linuxResult = findHookCommandInYaml(content, "ls");
      assert.ok(linuxResult);
      assert.strictEqual(getSelectedText(content, linuxResult), "ls");
      assert.strictEqual(linuxResult.startLineNumber, 3);
      const osxResult = findHookCommandInYaml(content, "ls -G");
      assert.ok(osxResult);
      assert.strictEqual(getSelectedText(content, osxResult), "ls -G");
      assert.strictEqual(osxResult.startLineNumber, 4);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3Byb21wdFN5bnRheC9ob29rVXRpbHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgZmluZEhvb2tDb21tYW5kSW5ZYW1sLCBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3Byb21wdFN5bnRheC9ob29rVXRpbHMuanMnO1xuaW1wb3J0IHsgSVRleHRFZGl0b3JTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBidWlsZE5ld0hvb2tFbnRyeSwgSG9va1NvdXJjZUZvcm1hdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va0NvbXBhdGliaWxpdHkuanMnO1xuXG4vKipcbiAqIEhlbHBlciB0byBleHRyYWN0IHRoZSBzZWxlY3RlZCB0ZXh0IGZyb20gY29udGVudCB1c2luZyBhIHNlbGVjdGlvbiByYW5nZS5cbiAqL1xuZnVuY3Rpb24gZ2V0U2VsZWN0ZWRUZXh0KGNvbnRlbnQ6IHN0cmluZywgc2VsZWN0aW9uOiBJVGV4dEVkaXRvclNlbGVjdGlvbik6IHN0cmluZyB7XG5cdGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJyk7XG5cdGlmIChzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyID09PSBzZWxlY3Rpb24uZW5kTGluZU51bWJlcikge1xuXHRcdHJldHVybiBsaW5lc1tzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyIC0gMV0uc3Vic3RyaW5nKHNlbGVjdGlvbi5zdGFydENvbHVtbiAtIDEsIHNlbGVjdGlvbi5lbmRDb2x1bW4hIC0gMSk7XG5cdH1cblx0Ly8gTXVsdGktbGluZSBzZWxlY3Rpb25cblx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRyZXN1bHQucHVzaChsaW5lc1tzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyIC0gMV0uc3Vic3RyaW5nKHNlbGVjdGlvbi5zdGFydENvbHVtbiAtIDEpKTtcblx0Zm9yIChsZXQgaSA9IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXI7IGkgPCBzZWxlY3Rpb24uZW5kTGluZU51bWJlciEgLSAxOyBpKyspIHtcblx0XHRyZXN1bHQucHVzaChsaW5lc1tpXSk7XG5cdH1cblx0cmVzdWx0LnB1c2gobGluZXNbc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIhIC0gMV0uc3Vic3RyaW5nKDAsIHNlbGVjdGlvbi5lbmRDb2x1bW4hIC0gMSkpO1xuXHRyZXR1cm4gcmVzdWx0LmpvaW4oJ1xcbicpO1xufVxuXG5zdWl0ZSgnaG9va1V0aWxzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uJywgKCkgPT4ge1xuXG5cdFx0c3VpdGUoJ3NpbXBsZSBmb3JtYXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzaW1wbGVGb3JtYXQgPSBge1xuXHRcImhvb2tzXCI6IHtcblx0XHRcIlNlc3Npb25TdGFydFwiOiBbXG5cdFx0XHR7XG5cdFx0XHRcdFwidHlwZVwiOiBcImNvbW1hbmRcIixcblx0XHRcdFx0XCJjb21tYW5kXCI6IFwiZWNobyBmaXJzdFwiXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFwiY29tbWFuZFwiOiBcImVjaG8gc2Vjb25kXCJcblx0XHRcdH1cblx0XHRdLFxuXHRcdFwiVXNlclByb21wdFN1Ym1pdFwiOiBbXG5cdFx0XHR7XG5cdFx0XHRcdFwidHlwZVwiOiBcImNvbW1hbmRcIixcblx0XHRcdFx0XCJjb21tYW5kXCI6IFwiZWNobyBmb28gPiB0ZXN0LmRlcnBcIlxuXHRcdFx0fVxuXHRcdF1cblx0fVxufWA7XG5cblx0XHRcdHRlc3QoJ2ZpbmRzIGZpcnN0IGNvbW1hbmQgaW4gU2Vzc2lvblN0YXJ0JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oc2ltcGxlRm9ybWF0LCAnU2Vzc2lvblN0YXJ0JywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQoc2ltcGxlRm9ybWF0LCByZXN1bHQpLCAnZWNobyBmaXJzdCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMTcsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogNixcblx0XHRcdFx0XHRlbmRDb2x1bW46IDI3XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2ZpbmRzIHNlY29uZCBjb21tYW5kIGluIFNlc3Npb25TdGFydCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKHNpbXBsZUZvcm1hdCwgJ1Nlc3Npb25TdGFydCcsIDEsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KHNpbXBsZUZvcm1hdCwgcmVzdWx0KSwgJ2VjaG8gc2Vjb25kJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMTcsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAyOFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmaW5kcyBjb21tYW5kIGluIFVzZXJQcm9tcHRTdWJtaXQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihzaW1wbGVGb3JtYXQsICdVc2VyUHJvbXB0U3VibWl0JywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQoc2ltcGxlRm9ybWF0LCByZXN1bHQpLCAnZWNobyBmb28gPiB0ZXN0LmRlcnAnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDE2LFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxNyxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiAxNixcblx0XHRcdFx0XHRlbmRDb2x1bW46IDM3XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBvdXQgb2YgYm91bmRzIGluZGV4JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oc2ltcGxlRm9ybWF0LCAnU2Vzc2lvblN0YXJ0JywgNSwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3Igbm9uLWV4aXN0ZW50IGhvb2sgdHlwZScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKHNpbXBsZUZvcm1hdCwgJ25vbkV4aXN0ZW50JywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ25lc3RlZCBtYXRjaGVyIGZvcm1hdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG5lc3RlZEZvcm1hdCA9IGB7XG5cdFwiZm9yY2VMb2dpbk1ldGhvZFwiOiBcImNvbnNvbGVcIixcblx0XCJob29rc1wiOiB7XG5cdFx0XCJVc2VyUHJvbXB0U3VibWl0XCI6IFtcblx0XHRcdHtcblx0XHRcdFx0XCJtYXRjaGVyXCI6IFwiXCIsXG5cdFx0XHRcdFwiaG9va3NcIjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFwidHlwZVwiOiBcImNvbW1hbmRcIixcblx0XHRcdFx0XHRcdFwiY29tbWFuZFwiOiBcImVjaG8gJ2Zvb2JhcmJhejUnID4gfi9mb29iYXJiYXoudHh0XCJcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHRdXG5cdH1cbn1gO1xuXG5cdFx0XHR0ZXN0KCdmaW5kcyBjb21tYW5kIGluc2lkZSBuZXN0ZWQgaG9va3MnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihuZXN0ZWRGb3JtYXQsICdVc2VyUHJvbXB0U3VibWl0JywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQobmVzdGVkRm9ybWF0LCByZXN1bHQpLCAnZWNobyBcXCdmb29iYXJiYXo1XFwnID4gfi9mb29iYXJiYXoudHh0Jyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMTksXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiA1NFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3Igbm9uLWV4aXN0ZW50IGZpZWxkIG5hbWUnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihuZXN0ZWRGb3JtYXQsICdVc2VyUHJvbXB0U3VibWl0JywgMCwgJ2Jhc2gnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ21peGVkIGZvcm1hdCB3aXRoIG11bHRpcGxlIG5lc3RlZCBob29rcycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1peGVkRm9ybWF0ID0gYHtcblx0XCJob29rc1wiOiB7XG5cdFx0XCJQcmVUb29sVXNlXCI6IFtcblx0XHRcdHtcblx0XHRcdFx0XCJtYXRjaGVyXCI6IFwiZWRpdF9maWxlXCIsXG5cdFx0XHRcdFwiaG9va3NcIjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFwidHlwZVwiOiBcImNvbW1hbmRcIixcblx0XHRcdFx0XHRcdFwiY29tbWFuZFwiOiBcImZpcnN0IG5lc3RlZFwiXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFx0XHRcImNvbW1hbmRcIjogXCJzZWNvbmQgbmVzdGVkXCJcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdFwidHlwZVwiOiBcImNvbW1hbmRcIixcblx0XHRcdFx0XCJjb21tYW5kXCI6IFwic2ltcGxlIGFmdGVyIG5lc3RlZFwiXG5cdFx0XHR9XG5cdFx0XVxuXHR9XG59YDtcblxuXHRcdFx0dGVzdCgnZmluZHMgZmlyc3QgY29tbWFuZCBpbiBmaXJzdCBuZXN0ZWQgaG9va3MgYXJyYXknLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihtaXhlZEZvcm1hdCwgJ1ByZVRvb2xVc2UnLCAwLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChtaXhlZEZvcm1hdCwgcmVzdWx0KSwgJ2ZpcnN0IG5lc3RlZCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogOSxcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMTksXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogOSxcblx0XHRcdFx0XHRlbmRDb2x1bW46IDMxXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2ZpbmRzIHNlY29uZCBjb21tYW5kIGluIGZpcnN0IG5lc3RlZCBob29rcyBhcnJheScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKG1peGVkRm9ybWF0LCAnUHJlVG9vbFVzZScsIDEsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KG1peGVkRm9ybWF0LCByZXN1bHQpLCAnc2Vjb25kIG5lc3RlZCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTMsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDE5LFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDEzLFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMzJcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZmluZHMgc2ltcGxlIGNvbW1hbmQgYWZ0ZXIgbmVzdGVkIHN0cnVjdHVyZScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKG1peGVkRm9ybWF0LCAnUHJlVG9vbFVzZScsIDIsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KG1peGVkRm9ybWF0LCByZXN1bHQpLCAnc2ltcGxlIGFmdGVyIG5lc3RlZCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTksXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDE3LFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDE5LFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMzZcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdiYXNoIGFuZCBwb3dlcnNoZWxsIGZpZWxkcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHBsYXRmb3JtU3BlY2lmaWNGb3JtYXQgPSBge1xuXHRcImhvb2tzXCI6IHtcblx0XHRcIlNlc3Npb25TdGFydFwiOiBbXG5cdFx0XHR7XG5cdFx0XHRcdFwidHlwZVwiOiBcImNvbW1hbmRcIixcblx0XHRcdFx0XCJiYXNoXCI6IFwiZWNobyBoZWxsbyBmcm9tIGJhc2hcIixcblx0XHRcdFx0XCJwb3dlcnNoZWxsXCI6IFwiV3JpdGUtSG9zdCBoZWxsb1wiXG5cdFx0XHR9XG5cdFx0XVxuXHR9XG59YDtcblxuXHRcdFx0dGVzdCgnZmluZHMgYmFzaCBmaWVsZCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKHBsYXRmb3JtU3BlY2lmaWNGb3JtYXQsICdTZXNzaW9uU3RhcnQnLCAwLCAnYmFzaCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChwbGF0Zm9ybVNwZWNpZmljRm9ybWF0LCByZXN1bHQpLCAnZWNobyBoZWxsbyBmcm9tIGJhc2gnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDE0LFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDYsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAzNFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmaW5kcyBwb3dlcnNoZWxsIGZpZWxkJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24ocGxhdGZvcm1TcGVjaWZpY0Zvcm1hdCwgJ1Nlc3Npb25TdGFydCcsIDAsICdwb3dlcnNoZWxsJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KHBsYXRmb3JtU3BlY2lmaWNGb3JtYXQsIHJlc3VsdCksICdXcml0ZS1Ib3N0IGhlbGxvJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA3LFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAyMCxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiA3LFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMzZcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdlZGdlIGNhc2VzJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGVtcHR5IGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbignJywgJ3Nlc3Npb25TdGFydCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGludmFsaWQgSlNPTicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKCd7IGludmFsaWQganNvbiB9JywgJ3Nlc3Npb25TdGFydCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBob29rcyBrZXkgaXMgbWlzc2luZycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9ICd7IFwib3RoZXJcIjogMSB9Jztcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKGNvbnRlbnQsICdzZXNzaW9uU3RhcnQnLCAwLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gaG9vayB0eXBlIGFycmF5IGlzIGVtcHR5JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gJ3sgXCJob29rc1wiOiB7IFwic2Vzc2lvblN0YXJ0XCI6IFtdIH0gfSc7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihjb250ZW50LCAnc2Vzc2lvblN0YXJ0JywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIGhvb2sgaXRlbSBpcyBub3QgYW4gb2JqZWN0JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gJ3sgXCJob29rc1wiOiB7IFwic2Vzc2lvblN0YXJ0XCI6IFtcIm5vdCBhbiBvYmplY3RcIl0gfSB9Jztcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKGNvbnRlbnQsICdzZXNzaW9uU3RhcnQnLCAwLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2hhbmRsZXMgZW1wdHkgY29tbWFuZCBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBge1xuXHRcImhvb2tzXCI6IHtcblx0XHRcInNlc3Npb25TdGFydFwiOiBbXG5cdFx0XHR7XG5cdFx0XHRcdFwidHlwZVwiOiBcImNvbW1hbmRcIixcblx0XHRcdFx0XCJjb21tYW5kXCI6IFwiXCJcblx0XHRcdH1cblx0XHRdXG5cdH1cbn1gO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oY29udGVudCwgJ3Nlc3Npb25TdGFydCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KGNvbnRlbnQsIHJlc3VsdCksICcnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDE3LFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDYsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAxN1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdoYW5kbGVzIG11bHRpbGluZSBjb21tYW5kIHZhbHVlJywgKCkgPT4ge1xuXHRcdFx0XHQvLyBKU09OIHN0cmluZ3MgY2FuIGNvbnRhaW4gZXNjYXBlZCBuZXdsaW5lc1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYHtcblx0XCJob29rc1wiOiB7XG5cdFx0XCJzZXNzaW9uU3RhcnRcIjogW1xuXHRcdFx0e1xuXHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFwiY29tbWFuZFwiOiBcImxpbmUxXFxcXG5saW5lMlwiXG5cdFx0XHR9XG5cdFx0XVxuXHR9XG59YDtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKGNvbnRlbnQsICdzZXNzaW9uU3RhcnQnLCAwLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChjb250ZW50LCByZXN1bHQpLCAnbGluZTFcXFxcbmxpbmUyJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxNyxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMjlcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCduZXN0ZWQgbWF0Y2hlciB3aXRoIGVtcHR5IGhvb2tzIGFycmF5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW1wdHlOZXN0ZWRIb29rcyA9IGB7XG5cdFwiaG9va3NcIjoge1xuXHRcdFwiVXNlclByb21wdFN1Ym1pdFwiOiBbXG5cdFx0XHR7XG5cdFx0XHRcdFwibWF0Y2hlclwiOiBcInNvbWUtcGF0dGVyblwiLFxuXHRcdFx0XHRcImhvb2tzXCI6IFtdXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFwiY29tbWFuZFwiOiBcImFmdGVyIGVtcHR5IG5lc3RlZFwiXG5cdFx0XHR9XG5cdFx0XVxuXHR9XG59YDtcblxuXHRcdFx0dGVzdCgnc2tpcHMgZW1wdHkgbmVzdGVkIGhvb2tzIGFuZCBmaW5kcyBzdWJzZXF1ZW50IGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihlbXB0eU5lc3RlZEhvb2tzLCAnVXNlclByb21wdFN1Ym1pdCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KGVtcHR5TmVzdGVkSG9va3MsIHJlc3VsdCksICdhZnRlciBlbXB0eSBuZXN0ZWQnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxNyxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRlbmRDb2x1bW46IDM1XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24gLSBjb3BpbG90Q0xJQ29tcGF0JywgKCkgPT4ge1xuXG5cdFx0c3VpdGUoJ3NpbXBsZSBmb3JtYXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzaW1wbGVGb3JtYXQgPSBge1xuXHRcImhvb2tzXCI6IHtcblx0XHRcInNlc3Npb25TdGFydFwiOiBbXG5cdFx0XHR7XG5cdFx0XHRcdFwidHlwZVwiOiBcImNvbW1hbmRcIixcblx0XHRcdFx0XCJjb21tYW5kXCI6IFwiZWNobyBmaXJzdFwiXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFwiY29tbWFuZFwiOiBcImVjaG8gc2Vjb25kXCJcblx0XHRcdH1cblx0XHRdLFxuXHRcdFwidXNlclByb21wdFN1Ym1pdHRlZFwiOiBbXG5cdFx0XHR7XG5cdFx0XHRcdFwidHlwZVwiOiBcImNvbW1hbmRcIixcblx0XHRcdFx0XCJjb21tYW5kXCI6IFwiZWNobyBmb28gPiB0ZXN0LmRlcnBcIlxuXHRcdFx0fVxuXHRcdF1cblx0fVxufWA7XG5cblx0XHRcdHRlc3QoJ2ZpbmRzIGZpcnN0IGNvbW1hbmQgaW4gc2Vzc2lvblN0YXJ0JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oc2ltcGxlRm9ybWF0LCAnc2Vzc2lvblN0YXJ0JywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQoc2ltcGxlRm9ybWF0LCByZXN1bHQpLCAnZWNobyBmaXJzdCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMTcsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogNixcblx0XHRcdFx0XHRlbmRDb2x1bW46IDI3XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2ZpbmRzIHNlY29uZCBjb21tYW5kIGluIHNlc3Npb25TdGFydCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKHNpbXBsZUZvcm1hdCwgJ3Nlc3Npb25TdGFydCcsIDEsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KHNpbXBsZUZvcm1hdCwgcmVzdWx0KSwgJ2VjaG8gc2Vjb25kJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMTcsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAyOFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmaW5kcyBjb21tYW5kIGluIHVzZXJQcm9tcHRTdWJtaXR0ZWQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihzaW1wbGVGb3JtYXQsICd1c2VyUHJvbXB0U3VibWl0dGVkJywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQoc2ltcGxlRm9ybWF0LCByZXN1bHQpLCAnZWNobyBmb28gPiB0ZXN0LmRlcnAnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDE2LFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxNyxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiAxNixcblx0XHRcdFx0XHRlbmRDb2x1bW46IDM3XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBvdXQgb2YgYm91bmRzIGluZGV4JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oc2ltcGxlRm9ybWF0LCAnc2Vzc2lvblN0YXJ0JywgNSwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3Igbm9uLWV4aXN0ZW50IGhvb2sgdHlwZScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKHNpbXBsZUZvcm1hdCwgJ25vbkV4aXN0ZW50JywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ25lc3RlZCBtYXRjaGVyIGZvcm1hdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG5lc3RlZEZvcm1hdCA9IGB7XG5cdFwiZm9yY2VMb2dpbk1ldGhvZFwiOiBcImNvbnNvbGVcIixcblx0XCJob29rc1wiOiB7XG5cdFx0XCJ1c2VyUHJvbXB0U3VibWl0dGVkXCI6IFtcblx0XHRcdHtcblx0XHRcdFx0XCJtYXRjaGVyXCI6IFwiXCIsXG5cdFx0XHRcdFwiaG9va3NcIjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFwidHlwZVwiOiBcImNvbW1hbmRcIixcblx0XHRcdFx0XHRcdFwiY29tbWFuZFwiOiBcImVjaG8gJ2Zvb2JhcmJhejUnID4gfi9mb29iYXJiYXoudHh0XCJcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHRdXG5cdH1cbn1gO1xuXG5cdFx0XHR0ZXN0KCdmaW5kcyBjb21tYW5kIGluc2lkZSBuZXN0ZWQgaG9va3MnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihuZXN0ZWRGb3JtYXQsICd1c2VyUHJvbXB0U3VibWl0dGVkJywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQobmVzdGVkRm9ybWF0LCByZXN1bHQpLCAnZWNobyBcXCdmb29iYXJiYXo1XFwnID4gfi9mb29iYXJiYXoudHh0Jyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMTksXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiA1NFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3Igbm9uLWV4aXN0ZW50IGZpZWxkIG5hbWUnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihuZXN0ZWRGb3JtYXQsICd1c2VyUHJvbXB0U3VibWl0dGVkJywgMCwgJ2Jhc2gnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ21peGVkIGZvcm1hdCB3aXRoIG11bHRpcGxlIG5lc3RlZCBob29rcycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1peGVkRm9ybWF0ID0gYHtcblx0XCJob29rc1wiOiB7XG5cdFx0XCJwcmVUb29sVXNlXCI6IFtcblx0XHRcdHtcblx0XHRcdFx0XCJtYXRjaGVyXCI6IFwiZWRpdF9maWxlXCIsXG5cdFx0XHRcdFwiaG9va3NcIjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFwidHlwZVwiOiBcImNvbW1hbmRcIixcblx0XHRcdFx0XHRcdFwiY29tbWFuZFwiOiBcImZpcnN0IG5lc3RlZFwiXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFx0XHRcImNvbW1hbmRcIjogXCJzZWNvbmQgbmVzdGVkXCJcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdFwidHlwZVwiOiBcImNvbW1hbmRcIixcblx0XHRcdFx0XCJjb21tYW5kXCI6IFwic2ltcGxlIGFmdGVyIG5lc3RlZFwiXG5cdFx0XHR9XG5cdFx0XVxuXHR9XG59YDtcblxuXHRcdFx0dGVzdCgnZmluZHMgZmlyc3QgY29tbWFuZCBpbiBmaXJzdCBuZXN0ZWQgaG9va3MgYXJyYXknLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihtaXhlZEZvcm1hdCwgJ3ByZVRvb2xVc2UnLCAwLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChtaXhlZEZvcm1hdCwgcmVzdWx0KSwgJ2ZpcnN0IG5lc3RlZCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogOSxcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMTksXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogOSxcblx0XHRcdFx0XHRlbmRDb2x1bW46IDMxXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2ZpbmRzIHNlY29uZCBjb21tYW5kIGluIGZpcnN0IG5lc3RlZCBob29rcyBhcnJheScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKG1peGVkRm9ybWF0LCAncHJlVG9vbFVzZScsIDEsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KG1peGVkRm9ybWF0LCByZXN1bHQpLCAnc2Vjb25kIG5lc3RlZCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTMsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDE5LFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDEzLFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMzJcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZmluZHMgc2ltcGxlIGNvbW1hbmQgYWZ0ZXIgbmVzdGVkIHN0cnVjdHVyZScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKG1peGVkRm9ybWF0LCAncHJlVG9vbFVzZScsIDIsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KG1peGVkRm9ybWF0LCByZXN1bHQpLCAnc2ltcGxlIGFmdGVyIG5lc3RlZCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTksXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDE3LFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDE5LFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMzZcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdiYXNoIGFuZCBwb3dlcnNoZWxsIGZpZWxkcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHBsYXRmb3JtU3BlY2lmaWNGb3JtYXQgPSBge1xuXHRcImhvb2tzXCI6IHtcblx0XHRcInNlc3Npb25TdGFydFwiOiBbXG5cdFx0XHR7XG5cdFx0XHRcdFwidHlwZVwiOiBcImNvbW1hbmRcIixcblx0XHRcdFx0XCJiYXNoXCI6IFwiZWNobyBoZWxsbyBmcm9tIGJhc2hcIixcblx0XHRcdFx0XCJwb3dlcnNoZWxsXCI6IFwiV3JpdGUtSG9zdCBoZWxsb1wiXG5cdFx0XHR9XG5cdFx0XVxuXHR9XG59YDtcblxuXHRcdFx0dGVzdCgnZmluZHMgYmFzaCBmaWVsZCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKHBsYXRmb3JtU3BlY2lmaWNGb3JtYXQsICdzZXNzaW9uU3RhcnQnLCAwLCAnYmFzaCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChwbGF0Zm9ybVNwZWNpZmljRm9ybWF0LCByZXN1bHQpLCAnZWNobyBoZWxsbyBmcm9tIGJhc2gnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDE0LFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDYsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAzNFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmaW5kcyBwb3dlcnNoZWxsIGZpZWxkJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24ocGxhdGZvcm1TcGVjaWZpY0Zvcm1hdCwgJ3Nlc3Npb25TdGFydCcsIDAsICdwb3dlcnNoZWxsJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KHBsYXRmb3JtU3BlY2lmaWNGb3JtYXQsIHJlc3VsdCksICdXcml0ZS1Ib3N0IGhlbGxvJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA3LFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAyMCxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiA3LFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMzZcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdlZGdlIGNhc2VzJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGVtcHR5IGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbignJywgJ3Nlc3Npb25TdGFydCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGludmFsaWQgSlNPTicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKCd7IGludmFsaWQganNvbiB9JywgJ3Nlc3Npb25TdGFydCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBob29rcyBrZXkgaXMgbWlzc2luZycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9ICd7IFwib3RoZXJcIjogMSB9Jztcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKGNvbnRlbnQsICdzZXNzaW9uU3RhcnQnLCAwLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gaG9vayB0eXBlIGFycmF5IGlzIGVtcHR5JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gJ3sgXCJob29rc1wiOiB7IFwic2Vzc2lvblN0YXJ0XCI6IFtdIH0gfSc7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihjb250ZW50LCAnc2Vzc2lvblN0YXJ0JywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIGhvb2sgaXRlbSBpcyBub3QgYW4gb2JqZWN0JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gJ3sgXCJob29rc1wiOiB7IFwic2Vzc2lvblN0YXJ0XCI6IFtcIm5vdCBhbiBvYmplY3RcIl0gfSB9Jztcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKGNvbnRlbnQsICdzZXNzaW9uU3RhcnQnLCAwLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2hhbmRsZXMgZW1wdHkgY29tbWFuZCBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBge1xuXHRcImhvb2tzXCI6IHtcblx0XHRcInNlc3Npb25TdGFydFwiOiBbXG5cdFx0XHR7XG5cdFx0XHRcdFwidHlwZVwiOiBcImNvbW1hbmRcIixcblx0XHRcdFx0XCJjb21tYW5kXCI6IFwiXCJcblx0XHRcdH1cblx0XHRdXG5cdH1cbn1gO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oY29udGVudCwgJ3Nlc3Npb25TdGFydCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KGNvbnRlbnQsIHJlc3VsdCksICcnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDE3LFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDYsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAxN1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdoYW5kbGVzIG11bHRpbGluZSBjb21tYW5kIHZhbHVlJywgKCkgPT4ge1xuXHRcdFx0XHQvLyBKU09OIHN0cmluZ3MgY2FuIGNvbnRhaW4gZXNjYXBlZCBuZXdsaW5lc1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYHtcblx0XCJob29rc1wiOiB7XG5cdFx0XCJzZXNzaW9uU3RhcnRcIjogW1xuXHRcdFx0e1xuXHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFwiY29tbWFuZFwiOiBcImxpbmUxXFxcXG5saW5lMlwiXG5cdFx0XHR9XG5cdFx0XVxuXHR9XG59YDtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKGNvbnRlbnQsICdzZXNzaW9uU3RhcnQnLCAwLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChjb250ZW50LCByZXN1bHQpLCAnbGluZTFcXFxcbmxpbmUyJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxNyxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMjlcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCduZXN0ZWQgbWF0Y2hlciB3aXRoIGVtcHR5IGhvb2tzIGFycmF5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW1wdHlOZXN0ZWRIb29rcyA9IGB7XG5cdFwiaG9va3NcIjoge1xuXHRcdFwidXNlclByb21wdFN1Ym1pdHRlZFwiOiBbXG5cdFx0XHR7XG5cdFx0XHRcdFwibWF0Y2hlclwiOiBcInNvbWUtcGF0dGVyblwiLFxuXHRcdFx0XHRcImhvb2tzXCI6IFtdXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFwiY29tbWFuZFwiOiBcImFmdGVyIGVtcHR5IG5lc3RlZFwiXG5cdFx0XHR9XG5cdFx0XVxuXHR9XG59YDtcblxuXHRcdFx0dGVzdCgnc2tpcHMgZW1wdHkgbmVzdGVkIGhvb2tzIGFuZCBmaW5kcyBzdWJzZXF1ZW50IGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihlbXB0eU5lc3RlZEhvb2tzLCAndXNlclByb21wdFN1Ym1pdHRlZCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KGVtcHR5TmVzdGVkSG9va3MsIHJlc3VsdCksICdhZnRlciBlbXB0eSBuZXN0ZWQnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxNyxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRlbmRDb2x1bW46IDM1XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24gd2l0aCBidWlsZE5ld0hvb2tFbnRyeScsICgpID0+IHtcblxuXHRcdHRlc3QoJ2ZpbmRzIGNvbW1hbmQgaW4gQ29waWxvdC1mb3JtYXQgZ2VuZXJhdGVkIEpTT04nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IGJ1aWxkTmV3SG9va0VudHJ5KEhvb2tTb3VyY2VGb3JtYXQuQ29waWxvdCk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoeyBob29rczogeyBTZXNzaW9uU3RhcnQ6IFtlbnRyeV0gfSB9LCBudWxsLCAnXFx0Jyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oY29udGVudCwgJ1Nlc3Npb25TdGFydCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQoY29udGVudCwgcmVzdWx0KSwgJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmluZHMgY29tbWFuZCBpbiBDbGF1ZGUtZm9ybWF0IGdlbmVyYXRlZCBKU09OJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW50cnkgPSBidWlsZE5ld0hvb2tFbnRyeShIb29rU291cmNlRm9ybWF0LkNsYXVkZSk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoeyBob29rczogeyBQcmVUb29sVXNlOiBbZW50cnldIH0gfSwgbnVsbCwgJ1xcdCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKGNvbnRlbnQsICdQcmVUb29sVXNlJywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChjb250ZW50LCByZXN1bHQpLCAnJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaW5kcyBjb21tYW5kIHdoZW4gYXBwZW5kaW5nIENsYXVkZSBlbnRyeSB0byBleGlzdGluZyBob29rcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGVudHJ5MSA9IGJ1aWxkTmV3SG9va0VudHJ5KEhvb2tTb3VyY2VGb3JtYXQuQ2xhdWRlKTtcblx0XHRcdGNvbnN0IGVudHJ5MiA9IGJ1aWxkTmV3SG9va0VudHJ5KEhvb2tTb3VyY2VGb3JtYXQuQ2xhdWRlKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7IGhvb2tzOiB7IFByZVRvb2xVc2U6IFtlbnRyeTEsIGVudHJ5Ml0gfSB9LCBudWxsLCAnXFx0Jyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDAgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oY29udGVudCwgJ1ByZVRvb2xVc2UnLCAwLCAnY29tbWFuZCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0MSA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihjb250ZW50LCAnUHJlVG9vbFVzZScsIDEsICdjb21tYW5kJyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0MCk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0MSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KGNvbnRlbnQsIHJlc3VsdDApLCAnJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KGNvbnRlbnQsIHJlc3VsdDEpLCAnJyk7XG5cdFx0XHQvLyBTZWNvbmQgZW50cnkgc2hvdWxkIGJlIG9uIGEgbGF0ZXIgbGluZVxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdDEuc3RhcnRMaW5lTnVtYmVyID4gcmVzdWx0MC5zdGFydExpbmVOdW1iZXIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xhdWRlIGZvcm1hdCBKU09OIGhhcyBjb3JyZWN0IHN0cnVjdHVyZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gYnVpbGROZXdIb29rRW50cnkoSG9va1NvdXJjZUZvcm1hdC5DbGF1ZGUpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHsgaG9va3M6IHsgU3ViYWdlbnRTdGFydDogW2VudHJ5XSB9IH0sIG51bGwsICdcXHQnKTtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoY29udGVudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZCwge1xuXHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFN1YmFnZW50U3RhcnQ6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0bWF0Y2hlcjogJycsXG5cdFx0XHRcdFx0XHRcdGhvb2tzOiBbe1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRcdFx0XHRjb21tYW5kOiAnJ1xuXHRcdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDb3BpbG90IGZvcm1hdCBKU09OIGhhcyBjb3JyZWN0IHN0cnVjdHVyZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gYnVpbGROZXdIb29rRW50cnkoSG9va1NvdXJjZUZvcm1hdC5Db3BpbG90KTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7IGhvb2tzOiB7IFN1YmFnZW50U3RhcnQ6IFtlbnRyeV0gfSB9LCBudWxsLCAnXFx0Jyk7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQsIHtcblx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRTdWJhZ2VudFN0YXJ0OiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRcdFx0Y29tbWFuZDogJydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmluZEhvb2tDb21tYW5kSW5ZYW1sJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZmluZHMgdW5xdW90ZWQgY29tbWFuZCB2YWx1ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgc2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSBjb21tYW5kOiBlY2hvIGhlbGxvJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kSW5ZYW1sKGNvbnRlbnQsICdlY2hvIGhlbGxvJyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQoY29udGVudCwgcmVzdWx0KSwgJ2VjaG8gaGVsbG8nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogNCxcblx0XHRcdFx0c3RhcnRDb2x1bW46IDE2LFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyOiA0LFxuXHRcdFx0XHRlbmRDb2x1bW46IDI2XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmRzIGRvdWJsZS1xdW90ZWQgY29tbWFuZCB2YWx1ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgc2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSBjb21tYW5kOiBcImVjaG8gaGVsbG9cIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZEluWWFtbChjb250ZW50LCAnZWNobyBoZWxsbycpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KGNvbnRlbnQsIHJlc3VsdCksICdlY2hvIGhlbGxvJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaW5kcyBzaW5nbGUtcXVvdGVkIGNvbW1hbmQgdmFsdWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIHNlc3Npb25TdGFydDonLFxuXHRcdFx0XHRgICAgIC0gY29tbWFuZDogJ2VjaG8gaGVsbG8nYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kSW5ZYW1sKGNvbnRlbnQsICdlY2hvIGhlbGxvJyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQoY29udGVudCwgcmVzdWx0KSwgJ2VjaG8gaGVsbG8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmRzIGNvbW1hbmQgd2l0aG91dCBsaXN0IHByZWZpeCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgc2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgY29tbWFuZDogcnVuLWxpbnQnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRJbllhbWwoY29udGVudCwgJ3J1bi1saW50Jyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQoY29udGVudCwgcmVzdWx0KSwgJ3J1bi1saW50Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBtYXRjaCBzdWJzdHJpbmcgb2YgYSBsb25nZXIgY29tbWFuZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgc2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSBjb21tYW5kOiBlY2hvIGhlbGxvLXdvcmxkJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kSW5ZYW1sKGNvbnRlbnQsICdlY2hvIGhlbGxvJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBjb21tYW5kIGlzIG5vdCBmb3VuZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgc2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSBjb21tYW5kOiBlY2hvIGhlbGxvJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kSW5ZYW1sKGNvbnRlbnQsICdlY2hvIGdvb2RieWUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vIGNvbW1hbmQgbGluZXMgZXhpc3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IG15LWFnZW50Jyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBBbiBhZ2VudCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZEluWWFtbChjb250ZW50LCAnZWNobyBoZWxsbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBlbXB0eSBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kSW5ZYW1sKCcnLCAnZWNobyBoZWxsbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmRzIGZpcnN0IG1hdGNoaW5nIGNvbW1hbmQgd2hlbiBtdWx0aXBsZSBleGlzdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgc2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSBjb21tYW5kOiBlY2hvIGhlbGxvJyxcblx0XHRcdFx0JyAgdXNlclByb21wdFN1Ym1pdDonLFxuXHRcdFx0XHQnICAgIC0gY29tbWFuZDogZWNobyBoZWxsbycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZEluWWFtbChjb250ZW50LCAnZWNobyBoZWxsbycpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXJ0TGluZU51bWJlciwgNCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpZ25vcmVzIGxpbmVzIHRoYXQgYXJlIG5vdCBjb21tYW5kIGZpZWxkcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IHJ1biBjb21tYW5kIGVjaG8gaGVsbG8nLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgc2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSBjb21tYW5kOiBlY2hvIGhlbGxvJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kSW5ZYW1sKGNvbnRlbnQsICdlY2hvIGhlbGxvJyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhcnRMaW5lTnVtYmVyLCA1KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgY29tbWFuZCB3aXRoIHNwZWNpYWwgY2hhcmFjdGVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgcHJlVG9vbFVzZTonLFxuXHRcdFx0XHQnICAgIC0gY29tbWFuZDogZWNobyBcImZvb1wiID4gL3RtcC9vdXQudHh0Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kSW5ZYW1sKGNvbnRlbnQsICdlY2hvIFwiZm9vXCIgPiAvdG1wL291dC50eHQnKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChjb250ZW50LCByZXN1bHQpLCAnZWNobyBcImZvb1wiID4gL3RtcC9vdXQudHh0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaGVzIGNvbW1hbmQgZm9sbG93ZWQgYnkgdHJhaWxpbmcgd2hpdGVzcGFjZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgc2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSBjb21tYW5kOiBlY2hvIGhlbGxvICAgJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kSW5ZYW1sKGNvbnRlbnQsICdlY2hvIGhlbGxvJyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQoY29udGVudCwgcmVzdWx0KSwgJ2VjaG8gaGVsbG8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmRzIHNob3J0IGNvbW1hbmQgdGhhdCBpcyBhIHN1YnN0cmluZyBvZiB0aGUga2V5IG5hbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU3RvcDonLFxuXHRcdFx0XHQnICAgIC0gdGltZW91dDogMTAnLFxuXHRcdFx0XHQnICAgICAgY29tbWFuZDogXCJhXCInLFxuXHRcdFx0XHQnICAgICAgdHlwZTogY29tbWFuZCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kSW5ZYW1sKGNvbnRlbnQsICdhJyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQoY29udGVudCwgcmVzdWx0KSwgJ2EnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhcnRMaW5lTnVtYmVyLCA0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmRzIHNob3J0IGNvbW1hbmQgaW4gYmFzaCBmaWVsZCB0aGF0IGlzIGEgc3Vic3RyaW5nIG9mIHRoZSBrZXkgbmFtZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCdob29rczonLFxuXHRcdFx0XHQnICBzZXNzaW9uU3RhcnQ6Jyxcblx0XHRcdFx0JyAgICAtIGJhc2g6IFwiYVwiJyxcblx0XHRcdFx0JyAgICAgIHR5cGU6IGNvbW1hbmQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZEluWWFtbChjb250ZW50LCAnYScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KGNvbnRlbnQsIHJlc3VsdCksICdhJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXJ0TGluZU51bWJlciwgMyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaW5kcyBjb21tYW5kIGluIHBvd2Vyc2hlbGwgZmllbGQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgc2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSBwb3dlcnNoZWxsOiBcImVjaG8gaGVsbG9cIicsXG5cdFx0XHRcdCcgICAgICB0eXBlOiBjb21tYW5kJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRJbllhbWwoY29udGVudCwgJ2VjaG8gaGVsbG8nKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChjb250ZW50LCByZXN1bHQpLCAnZWNobyBoZWxsbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGFydExpbmVOdW1iZXIsIDMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmluZHMgY29tbWFuZCBpbiB3aW5kb3dzIGZpZWxkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIHNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gd2luZG93czogXCJkaXJcIicsXG5cdFx0XHRcdCcgICAgICB0eXBlOiBjb21tYW5kJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRJbllhbWwoY29udGVudCwgJ2RpcicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KGNvbnRlbnQsIHJlc3VsdCksICdkaXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhcnRMaW5lTnVtYmVyLCAzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmRzIGNvbW1hbmQgaW4gbGludXggYW5kIG9zeCBmaWVsZHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgc2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSBsaW51eDogXCJsc1wiJyxcblx0XHRcdFx0JyAgICAgIG9zeDogXCJscyAtR1wiJyxcblx0XHRcdFx0JyAgICAgIHR5cGU6IGNvbW1hbmQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGxpbnV4UmVzdWx0ID0gZmluZEhvb2tDb21tYW5kSW5ZYW1sKGNvbnRlbnQsICdscycpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxpbnV4UmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQoY29udGVudCwgbGludXhSZXN1bHQpLCAnbHMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW51eFJlc3VsdC5zdGFydExpbmVOdW1iZXIsIDMpO1xuXG5cdFx0XHRjb25zdCBvc3hSZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRJbllhbWwoY29udGVudCwgJ2xzIC1HJyk7XG5cdFx0XHRhc3NlcnQub2sob3N4UmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQoY29udGVudCwgb3N4UmVzdWx0KSwgJ2xzIC1HJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3N4UmVzdWx0LnN0YXJ0TGluZU51bWJlciwgNCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx1QkFBdUIsZ0NBQWdDO0FBRWhFLFNBQVMsbUJBQW1CLHdCQUF3QjtBQUtwRCxTQUFTLGdCQUFnQixTQUFpQixXQUF5QztBQUNsRixRQUFNLFFBQVEsUUFBUSxNQUFNLElBQUk7QUFDaEMsTUFBSSxVQUFVLG9CQUFvQixVQUFVLGVBQWU7QUFDMUQsV0FBTyxNQUFNLFVBQVUsa0JBQWtCLENBQUMsRUFBRSxVQUFVLFVBQVUsY0FBYyxHQUFHLFVBQVUsWUFBYSxDQUFDO0FBQUEsRUFDMUc7QUFFQSxRQUFNLFNBQW1CLENBQUM7QUFDMUIsU0FBTyxLQUFLLE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxFQUFFLFVBQVUsVUFBVSxjQUFjLENBQUMsQ0FBQztBQUNyRixXQUFTLElBQUksVUFBVSxpQkFBaUIsSUFBSSxVQUFVLGdCQUFpQixHQUFHLEtBQUs7QUFDOUUsV0FBTyxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQUEsRUFDckI7QUFDQSxTQUFPLEtBQUssTUFBTSxVQUFVLGdCQUFpQixDQUFDLEVBQUUsVUFBVSxHQUFHLFVBQVUsWUFBYSxDQUFDLENBQUM7QUFDdEYsU0FB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
