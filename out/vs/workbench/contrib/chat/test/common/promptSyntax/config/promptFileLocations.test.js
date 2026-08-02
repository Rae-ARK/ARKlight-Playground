import assert from "assert";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { getPromptFileType, getCleanPromptName, isPromptOrInstructionsFile, isSkillFilename } from "../../../../common/promptSyntax/config/promptFileLocations.js";
import { PromptsType } from "../../../../common/promptSyntax/promptTypes.js";
suite("promptFileLocations", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getPromptFileType", () => {
    test(".prompt.md files", () => {
      const uri = URI.file("/workspace/test.prompt.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.prompt);
    });
    test(".instructions.md files", () => {
      const uri = URI.file("/workspace/test.instructions.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.instructions);
    });
    test(".agent.md files", () => {
      const uri = URI.file("/workspace/test.agent.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.agent);
    });
    test(".chatmode.md files (legacy)", () => {
      const uri = URI.file("/workspace/test.chatmode.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.agent);
    });
    test(".md files in .github/agents/ folder should be recognized as agent files", () => {
      const uri = URI.file("/workspace/.github/agents/demonstrate.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.agent);
    });
    test("README.md in .github/agents/ should NOT be recognized as agent file", () => {
      const uri = URI.file("/workspace/.github/agents/README.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
    test(".md files in .github/agents/ subfolder should NOT be recognized as agent files", () => {
      const uri = URI.file("/workspace/.github/agents/subfolder/test.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
    test(".md files in .claude/agents/ subfolder should NOT be recognized as agent files", () => {
      const uri = URI.file("/workspace/.claude/agents/subfolder/test.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
    test(".md files in ~/.copilot/agents/ subfolder should NOT be recognized as agent files", () => {
      const uri = URI.file("/home/user/.copilot/agents/subfolder/test.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
    test(".md files in .claude/agents/ folder should be recognized as agent files", () => {
      const uri = URI.file("/workspace/.claude/agents/demonstrate.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.agent);
    });
    test("README.md in .claude/agents/ should NOT be recognized as agent file", () => {
      const uri = URI.file("/workspace/.claude/agents/README.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
    test(".md files in ~/.copilot/agents/ folder should be recognized as agent files", () => {
      const uri = URI.file("/home/user/.copilot/agents/my-agent.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.agent);
    });
    test("README.md in ~/.copilot/agents/ should NOT be recognized as agent file", () => {
      const uri = URI.file("/home/user/.copilot/agents/README.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
    test(".md files outside .github/agents/ should not be recognized as agent files", () => {
      const uri = URI.file("/workspace/test/foo.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
    test(".md files in other .github/ subfolders should not be recognized as agent files", () => {
      const uri = URI.file("/workspace/.github/prompts/test.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
    test("copilot-instructions.md should be recognized as instructions", () => {
      const uri = URI.file("/workspace/.github/copilot-instructions.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.instructions);
    });
    test("regular .md files should return undefined", () => {
      const uri = URI.file("/workspace/README.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
    test("SKILL.md (uppercase) should be recognized as skill", () => {
      const uri = URI.file("/workspace/.github/skills/test/SKILL.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.skill);
    });
    test("skill.md (lowercase) should be recognized as skill", () => {
      const uri = URI.file("/workspace/.github/skills/test/skill.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.skill);
    });
    test("Skill.md (mixed case) should be recognized as skill", () => {
      const uri = URI.file("/workspace/.github/skills/test/Skill.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.skill);
    });
    test("any .json file should be recognized as hook", () => {
      assert.strictEqual(getPromptFileType(URI.file("/workspace/.github/hooks/hooks.json")), PromptsType.hook);
      assert.strictEqual(getPromptFileType(URI.file("/workspace/.github/hooks/custom-hooks.json")), PromptsType.hook);
      assert.strictEqual(getPromptFileType(URI.file("/workspace/.claude/settings.json")), PromptsType.hook);
      assert.strictEqual(getPromptFileType(URI.file("/workspace/.claude/settings.local.json")), PromptsType.hook);
      assert.strictEqual(getPromptFileType(URI.file("/workspace/any/path/config.json")), PromptsType.hook);
    });
    test(".json files are case insensitive", () => {
      assert.strictEqual(getPromptFileType(URI.file("/workspace/.github/hooks/HOOKS.JSON")), PromptsType.hook);
      assert.strictEqual(getPromptFileType(URI.file("/workspace/.claude/SETTINGS.JSON")), PromptsType.hook);
    });
    test("non-json file in .github/hooks folder should NOT be recognized as hook", () => {
      const uri = URI.file("/workspace/.github/hooks/readme.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
  });
  suite("getCleanPromptName", () => {
    test("removes .prompt.md extension", () => {
      const uri = URI.file("/workspace/test.prompt.md");
      assert.strictEqual(getCleanPromptName(uri), "test");
    });
    test("removes .instructions.md extension", () => {
      const uri = URI.file("/workspace/test.instructions.md");
      assert.strictEqual(getCleanPromptName(uri), "test");
    });
    test("removes .agent.md extension", () => {
      const uri = URI.file("/workspace/test.agent.md");
      assert.strictEqual(getCleanPromptName(uri), "test");
    });
    test("removes .chatmode.md extension (legacy)", () => {
      const uri = URI.file("/workspace/test.chatmode.md");
      assert.strictEqual(getCleanPromptName(uri), "test");
    });
    test("removes .md extension for files in .github/agents/", () => {
      const uri = URI.file("/workspace/.github/agents/demonstrate.md");
      assert.strictEqual(getCleanPromptName(uri), "demonstrate");
    });
    test("removes .md extension for files in .claude/agents/", () => {
      const uri = URI.file("/workspace/.claude/agents/claude-agent.md");
      assert.strictEqual(getCleanPromptName(uri), "claude-agent");
    });
    test("removes .md extension for files in ~/.copilot/agents/", () => {
      const uri = URI.file("/home/user/.copilot/agents/my-agent.md");
      assert.strictEqual(getCleanPromptName(uri), "my-agent");
    });
    test("README.md in .github/agents/ should keep .md extension", () => {
      const uri = URI.file("/workspace/.github/agents/README.md");
      assert.strictEqual(getCleanPromptName(uri), "README.md");
    });
    test("removes .md extension for copilot-instructions.md", () => {
      const uri = URI.file("/workspace/.github/copilot-instructions.md");
      assert.strictEqual(getCleanPromptName(uri), "copilot-instructions");
    });
    test("keeps .md extension for regular files", () => {
      const uri = URI.file("/workspace/README.md");
      assert.strictEqual(getCleanPromptName(uri), "README.md");
    });
    test("keeps full filename for files without known extensions", () => {
      const uri = URI.file("/workspace/test.txt");
      assert.strictEqual(getCleanPromptName(uri), "test.txt");
    });
    test("returns folder name for SKILL.md (uppercase)", () => {
      const uri = URI.file("/workspace/.github/skills/test/SKILL.md");
      assert.strictEqual(getCleanPromptName(uri), "test");
    });
    test("returns folder name for skill.md (lowercase)", () => {
      const uri = URI.file("/workspace/.github/skills/my-skill/skill.md");
      assert.strictEqual(getCleanPromptName(uri), "my-skill");
    });
    test("returns folder name for Skill.md (mixed case)", () => {
      const uri = URI.file("/workspace/.github/skills/another-skill/Skill.md");
      assert.strictEqual(getCleanPromptName(uri), "another-skill");
    });
  });
  suite("isPromptOrInstructionsFile", () => {
    test("SKILL.md files should return true", () => {
      assert.strictEqual(isPromptOrInstructionsFile(URI.file("/workspace/.github/skills/test/SKILL.md")), true);
    });
    test("skill.md (lowercase) should return true", () => {
      assert.strictEqual(isPromptOrInstructionsFile(URI.file("/workspace/.claude/skills/myskill/skill.md")), true);
    });
    test("Skill.md (mixed case) should return true", () => {
      assert.strictEqual(isPromptOrInstructionsFile(URI.file("/workspace/skills/Skill.md")), true);
    });
    test("regular .md files should return false", () => {
      assert.strictEqual(isPromptOrInstructionsFile(URI.file("/workspace/SKILL2.md")), false);
    });
    test("any .json file should return true", () => {
      assert.strictEqual(isPromptOrInstructionsFile(URI.file("/workspace/.github/hooks/custom-hooks.json")), true);
      assert.strictEqual(isPromptOrInstructionsFile(URI.file("/workspace/.claude/settings.json")), true);
      assert.strictEqual(isPromptOrInstructionsFile(URI.file("/workspace/.claude/settings.local.json")), true);
      assert.strictEqual(isPromptOrInstructionsFile(URI.file("/workspace/settings.json")), true);
    });
  });
  suite("isSkillFilename", () => {
    test("SKILL.md (uppercase) should return true", () => {
      assert.strictEqual(isSkillFilename("SKILL.md"), true);
    });
    test("skill.md (lowercase) should return true", () => {
      assert.strictEqual(isSkillFilename("skill.md"), true);
    });
    test("Skill.md (mixed case) should return true", () => {
      assert.strictEqual(isSkillFilename("Skill.md"), true);
    });
    test("other filenames should return false", () => {
      assert.strictEqual(isSkillFilename("README.md"), false);
      assert.strictEqual(isSkillFilename("SKILL.txt"), false);
      assert.strictEqual(isSkillFilename("my-skill.md"), false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBnZXRQcm9tcHRGaWxlVHlwZSwgZ2V0Q2xlYW5Qcm9tcHROYW1lLCBpc1Byb21wdE9ySW5zdHJ1Y3Rpb25zRmlsZSwgaXNTa2lsbEZpbGVuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9jb25maWcvcHJvbXB0RmlsZUxvY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuXG5zdWl0ZSgncHJvbXB0RmlsZUxvY2F0aW9ucycsIGZ1bmN0aW9uICgpIHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2dldFByb21wdEZpbGVUeXBlJywgKCkgPT4ge1xuXHRcdHRlc3QoJy5wcm9tcHQubWQgZmlsZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS90ZXN0LnByb21wdC5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKHVyaSksIFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcuaW5zdHJ1Y3Rpb25zLm1kIGZpbGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvdGVzdC5pbnN0cnVjdGlvbnMubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcm9tcHRGaWxlVHlwZSh1cmkpLCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnLmFnZW50Lm1kIGZpbGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvdGVzdC5hZ2VudC5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKHVyaSksIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJy5jaGF0bW9kZS5tZCBmaWxlcyAobGVnYWN5KScsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3Rlc3QuY2hhdG1vZGUubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcm9tcHRGaWxlVHlwZSh1cmkpLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcubWQgZmlsZXMgaW4gLmdpdGh1Yi9hZ2VudHMvIGZvbGRlciBzaG91bGQgYmUgcmVjb2duaXplZCBhcyBhZ2VudCBmaWxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2RlbW9uc3RyYXRlLm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJvbXB0RmlsZVR5cGUodXJpKSwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnUkVBRE1FLm1kIGluIC5naXRodWIvYWdlbnRzLyBzaG91bGQgTk9UIGJlIHJlY29nbml6ZWQgYXMgYWdlbnQgZmlsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL1JFQURNRS5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKHVyaSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcubWQgZmlsZXMgaW4gLmdpdGh1Yi9hZ2VudHMvIHN1YmZvbGRlciBzaG91bGQgTk9UIGJlIHJlY29nbml6ZWQgYXMgYWdlbnQgZmlsZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9zdWJmb2xkZXIvdGVzdC5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKHVyaSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcubWQgZmlsZXMgaW4gLmNsYXVkZS9hZ2VudHMvIHN1YmZvbGRlciBzaG91bGQgTk9UIGJlIHJlY29nbml6ZWQgYXMgYWdlbnQgZmlsZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY2xhdWRlL2FnZW50cy9zdWJmb2xkZXIvdGVzdC5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKHVyaSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcubWQgZmlsZXMgaW4gfi8uY29waWxvdC9hZ2VudHMvIHN1YmZvbGRlciBzaG91bGQgTk9UIGJlIHJlY29nbml6ZWQgYXMgYWdlbnQgZmlsZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci8uY29waWxvdC9hZ2VudHMvc3ViZm9sZGVyL3Rlc3QubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcm9tcHRGaWxlVHlwZSh1cmkpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnLm1kIGZpbGVzIGluIC5jbGF1ZGUvYWdlbnRzLyBmb2xkZXIgc2hvdWxkIGJlIHJlY29nbml6ZWQgYXMgYWdlbnQgZmlsZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY2xhdWRlL2FnZW50cy9kZW1vbnN0cmF0ZS5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKHVyaSksIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1JFQURNRS5tZCBpbiAuY2xhdWRlL2FnZW50cy8gc2hvdWxkIE5PVCBiZSByZWNvZ25pemVkIGFzIGFnZW50IGZpbGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY2xhdWRlL2FnZW50cy9SRUFETUUubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcm9tcHRGaWxlVHlwZSh1cmkpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnLm1kIGZpbGVzIGluIH4vLmNvcGlsb3QvYWdlbnRzLyBmb2xkZXIgc2hvdWxkIGJlIHJlY29nbml6ZWQgYXMgYWdlbnQgZmlsZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci8uY29waWxvdC9hZ2VudHMvbXktYWdlbnQubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcm9tcHRGaWxlVHlwZSh1cmkpLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdSRUFETUUubWQgaW4gfi8uY29waWxvdC9hZ2VudHMvIHNob3VsZCBOT1QgYmUgcmVjb2duaXplZCBhcyBhZ2VudCBmaWxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvLmNvcGlsb3QvYWdlbnRzL1JFQURNRS5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKHVyaSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcubWQgZmlsZXMgb3V0c2lkZSAuZ2l0aHViL2FnZW50cy8gc2hvdWxkIG5vdCBiZSByZWNvZ25pemVkIGFzIGFnZW50IGZpbGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvdGVzdC9mb28ubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcm9tcHRGaWxlVHlwZSh1cmkpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnLm1kIGZpbGVzIGluIG90aGVyIC5naXRodWIvIHN1YmZvbGRlcnMgc2hvdWxkIG5vdCBiZSByZWNvZ25pemVkIGFzIGFnZW50IGZpbGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9wcm9tcHRzL3Rlc3QubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcm9tcHRGaWxlVHlwZSh1cmkpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29waWxvdC1pbnN0cnVjdGlvbnMubWQgc2hvdWxkIGJlIHJlY29nbml6ZWQgYXMgaW5zdHJ1Y3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKHVyaSksIFByb21wdHNUeXBlLmluc3RydWN0aW9ucyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWd1bGFyIC5tZCBmaWxlcyBzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL1JFQURNRS5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKHVyaSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdTS0lMTC5tZCAodXBwZXJjYXNlKSBzaG91bGQgYmUgcmVjb2duaXplZCBhcyBza2lsbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL3Rlc3QvU0tJTEwubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcm9tcHRGaWxlVHlwZSh1cmkpLCBQcm9tcHRzVHlwZS5za2lsbCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lsbC5tZCAobG93ZXJjYXNlKSBzaG91bGQgYmUgcmVjb2duaXplZCBhcyBza2lsbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL3Rlc3Qvc2tpbGwubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcm9tcHRGaWxlVHlwZSh1cmkpLCBQcm9tcHRzVHlwZS5za2lsbCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdTa2lsbC5tZCAobWl4ZWQgY2FzZSkgc2hvdWxkIGJlIHJlY29nbml6ZWQgYXMgc2tpbGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy90ZXN0L1NraWxsLm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJvbXB0RmlsZVR5cGUodXJpKSwgUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gTm90ZTogZ2V0UHJvbXB0RmlsZVR5cGUgYXNzdW1lcyB0aGUgVVJJIGlzIGZyb20gYSB2YWxpZCBwcm9tcHQgc291cmNlIGZvbGRlci5cblx0XHQvLyBBbnkgLmpzb24gZmlsZSByZXR1cm5zIFByb21wdHNUeXBlLmhvb2sgLSB0aGUgY2FsbGVyIGZpbHRlcnMgYnkgZm9sZGVyLlxuXHRcdHRlc3QoJ2FueSAuanNvbiBmaWxlIHNob3VsZCBiZSByZWNvZ25pemVkIGFzIGhvb2snLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJvbXB0RmlsZVR5cGUoVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcy9ob29rcy5qc29uJykpLCBQcm9tcHRzVHlwZS5ob29rKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcm9tcHRGaWxlVHlwZShVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL2N1c3RvbS1ob29rcy5qc29uJykpLCBQcm9tcHRzVHlwZS5ob29rKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcm9tcHRGaWxlVHlwZShVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY2xhdWRlL3NldHRpbmdzLmpzb24nKSksIFByb21wdHNUeXBlLmhvb2spO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKFVSSS5maWxlKCcvd29ya3NwYWNlLy5jbGF1ZGUvc2V0dGluZ3MubG9jYWwuanNvbicpKSwgUHJvbXB0c1R5cGUuaG9vayk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJvbXB0RmlsZVR5cGUoVVJJLmZpbGUoJy93b3Jrc3BhY2UvYW55L3BhdGgvY29uZmlnLmpzb24nKSksIFByb21wdHNUeXBlLmhvb2spO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnLmpzb24gZmlsZXMgYXJlIGNhc2UgaW5zZW5zaXRpdmUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJvbXB0RmlsZVR5cGUoVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcy9IT09LUy5KU09OJykpLCBQcm9tcHRzVHlwZS5ob29rKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcm9tcHRGaWxlVHlwZShVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY2xhdWRlL1NFVFRJTkdTLkpTT04nKSksIFByb21wdHNUeXBlLmhvb2spO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9uLWpzb24gZmlsZSBpbiAuZ2l0aHViL2hvb2tzIGZvbGRlciBzaG91bGQgTk9UIGJlIHJlY29nbml6ZWQgYXMgaG9vaycsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3MvcmVhZG1lLm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJvbXB0RmlsZVR5cGUodXJpKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldENsZWFuUHJvbXB0TmFtZScsICgpID0+IHtcblx0XHR0ZXN0KCdyZW1vdmVzIC5wcm9tcHQubWQgZXh0ZW5zaW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvdGVzdC5wcm9tcHQubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDbGVhblByb21wdE5hbWUodXJpKSwgJ3Rlc3QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92ZXMgLmluc3RydWN0aW9ucy5tZCBleHRlbnNpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS90ZXN0Lmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENsZWFuUHJvbXB0TmFtZSh1cmkpLCAndGVzdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlcyAuYWdlbnQubWQgZXh0ZW5zaW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvdGVzdC5hZ2VudC5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENsZWFuUHJvbXB0TmFtZSh1cmkpLCAndGVzdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlcyAuY2hhdG1vZGUubWQgZXh0ZW5zaW9uIChsZWdhY3kpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvdGVzdC5jaGF0bW9kZS5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENsZWFuUHJvbXB0TmFtZSh1cmkpLCAndGVzdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlcyAubWQgZXh0ZW5zaW9uIGZvciBmaWxlcyBpbiAuZ2l0aHViL2FnZW50cy8nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9kZW1vbnN0cmF0ZS5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENsZWFuUHJvbXB0TmFtZSh1cmkpLCAnZGVtb25zdHJhdGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92ZXMgLm1kIGV4dGVuc2lvbiBmb3IgZmlsZXMgaW4gLmNsYXVkZS9hZ2VudHMvJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmNsYXVkZS9hZ2VudHMvY2xhdWRlLWFnZW50Lm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2xlYW5Qcm9tcHROYW1lKHVyaSksICdjbGF1ZGUtYWdlbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92ZXMgLm1kIGV4dGVuc2lvbiBmb3IgZmlsZXMgaW4gfi8uY29waWxvdC9hZ2VudHMvJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvLmNvcGlsb3QvYWdlbnRzL215LWFnZW50Lm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2xlYW5Qcm9tcHROYW1lKHVyaSksICdteS1hZ2VudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnUkVBRE1FLm1kIGluIC5naXRodWIvYWdlbnRzLyBzaG91bGQga2VlcCAubWQgZXh0ZW5zaW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvUkVBRE1FLm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2xlYW5Qcm9tcHROYW1lKHVyaSksICdSRUFETUUubWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92ZXMgLm1kIGV4dGVuc2lvbiBmb3IgY29waWxvdC1pbnN0cnVjdGlvbnMubWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2xlYW5Qcm9tcHROYW1lKHVyaSksICdjb3BpbG90LWluc3RydWN0aW9ucycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2VlcHMgLm1kIGV4dGVuc2lvbiBmb3IgcmVndWxhciBmaWxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL1JFQURNRS5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENsZWFuUHJvbXB0TmFtZSh1cmkpLCAnUkVBRE1FLm1kJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdrZWVwcyBmdWxsIGZpbGVuYW1lIGZvciBmaWxlcyB3aXRob3V0IGtub3duIGV4dGVuc2lvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS90ZXN0LnR4dCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENsZWFuUHJvbXB0TmFtZSh1cmkpLCAndGVzdC50eHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZm9sZGVyIG5hbWUgZm9yIFNLSUxMLm1kICh1cHBlcmNhc2UpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvdGVzdC9TS0lMTC5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENsZWFuUHJvbXB0TmFtZSh1cmkpLCAndGVzdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmb2xkZXIgbmFtZSBmb3Igc2tpbGwubWQgKGxvd2VyY2FzZSknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy9teS1za2lsbC9za2lsbC5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENsZWFuUHJvbXB0TmFtZSh1cmkpLCAnbXktc2tpbGwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZm9sZGVyIG5hbWUgZm9yIFNraWxsLm1kIChtaXhlZCBjYXNlKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL2Fub3RoZXItc2tpbGwvU2tpbGwubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDbGVhblByb21wdE5hbWUodXJpKSwgJ2Fub3RoZXItc2tpbGwnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2lzUHJvbXB0T3JJbnN0cnVjdGlvbnNGaWxlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ1NLSUxMLm1kIGZpbGVzIHNob3VsZCByZXR1cm4gdHJ1ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1Byb21wdE9ySW5zdHJ1Y3Rpb25zRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy90ZXN0L1NLSUxMLm1kJykpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsLm1kIChsb3dlcmNhc2UpIHNob3VsZCByZXR1cm4gdHJ1ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1Byb21wdE9ySW5zdHJ1Y3Rpb25zRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY2xhdWRlL3NraWxscy9teXNraWxsL3NraWxsLm1kJykpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1NraWxsLm1kIChtaXhlZCBjYXNlKSBzaG91bGQgcmV0dXJuIHRydWUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNQcm9tcHRPckluc3RydWN0aW9uc0ZpbGUoVVJJLmZpbGUoJy93b3Jrc3BhY2Uvc2tpbGxzL1NraWxsLm1kJykpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlZ3VsYXIgLm1kIGZpbGVzIHNob3VsZCByZXR1cm4gZmFsc2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNQcm9tcHRPckluc3RydWN0aW9uc0ZpbGUoVVJJLmZpbGUoJy93b3Jrc3BhY2UvU0tJTEwyLm1kJykpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHQvLyBOb3RlOiBBbnkgLmpzb24gZmlsZSByZXR1cm5zIHRydWUgYmVjYXVzZSBnZXRQcm9tcHRGaWxlVHlwZSByZXR1cm5zIGhvb2sgZm9yIGFsbCBKU09OLlxuXHRcdC8vIFRoZSBjYWxsZXIgaXMgcmVzcG9uc2libGUgZm9yIG9ubHkgcGFzc2luZyBVUklzIGZyb20gdmFsaWQgcHJvbXB0IHNvdXJjZSBmb2xkZXJzLlxuXHRcdHRlc3QoJ2FueSAuanNvbiBmaWxlIHNob3VsZCByZXR1cm4gdHJ1ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1Byb21wdE9ySW5zdHJ1Y3Rpb25zRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL2N1c3RvbS1ob29rcy5qc29uJykpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1Byb21wdE9ySW5zdHJ1Y3Rpb25zRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY2xhdWRlL3NldHRpbmdzLmpzb24nKSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzUHJvbXB0T3JJbnN0cnVjdGlvbnNGaWxlKFVSSS5maWxlKCcvd29ya3NwYWNlLy5jbGF1ZGUvc2V0dGluZ3MubG9jYWwuanNvbicpKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNQcm9tcHRPckluc3RydWN0aW9uc0ZpbGUoVVJJLmZpbGUoJy93b3Jrc3BhY2Uvc2V0dGluZ3MuanNvbicpKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpc1NraWxsRmlsZW5hbWUnLCAoKSA9PiB7XG5cdFx0dGVzdCgnU0tJTEwubWQgKHVwcGVyY2FzZSkgc2hvdWxkIHJldHVybiB0cnVlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzU2tpbGxGaWxlbmFtZSgnU0tJTEwubWQnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lsbC5tZCAobG93ZXJjYXNlKSBzaG91bGQgcmV0dXJuIHRydWUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNTa2lsbEZpbGVuYW1lKCdza2lsbC5tZCcpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1NraWxsLm1kIChtaXhlZCBjYXNlKSBzaG91bGQgcmV0dXJuIHRydWUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNTa2lsbEZpbGVuYW1lKCdTa2lsbC5tZCcpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ290aGVyIGZpbGVuYW1lcyBzaG91bGQgcmV0dXJuIGZhbHNlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzU2tpbGxGaWxlbmFtZSgnUkVBRE1FLm1kJyksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1NraWxsRmlsZW5hbWUoJ1NLSUxMLnR4dCcpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNTa2lsbEZpbGVuYW1lKCdteS1za2lsbC5tZCcpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsbUJBQW1CLG9CQUFvQiw0QkFBNEIsdUJBQXVCO0FBQ25HLFNBQVMsbUJBQW1CO0FBRTVCLE1BQU0sdUJBQXVCLFdBQVk7QUFDeEMsMENBQXdDO0FBRXhDLFFBQU0scUJBQXFCLE1BQU07QUFDaEMsU0FBSyxvQkFBb0IsTUFBTTtBQUM5QixZQUFNLE1BQU0sSUFBSSxLQUFLLDJCQUEyQjtBQUNoRCxhQUFPLFlBQVksa0JBQWtCLEdBQUcsR0FBRyxZQUFZLE1BQU07QUFBQSxJQUM5RCxDQUFDO0FBRUQsU0FBSywwQkFBMEIsTUFBTTtBQUNwQyxZQUFNLE1BQU0sSUFBSSxLQUFLLGlDQUFpQztBQUN0RCxhQUFPLFlBQVksa0JBQWtCLEdBQUcsR0FBRyxZQUFZLFlBQVk7QUFBQSxJQUNwRSxDQUFDO0FBRUQsU0FBSyxtQkFBbUIsTUFBTTtBQUM3QixZQUFNLE1BQU0sSUFBSSxLQUFLLDBCQUEwQjtBQUMvQyxhQUFPLFlBQVks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
