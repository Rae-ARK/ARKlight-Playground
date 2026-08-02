import { deepStrictEqual, ok, strictEqual } from "assert";
import { Separator } from "../../../../../../base/common/actions.js";
import * as marked from "../../../../../../base/common/marked/marked.js";
import { appendEscapedMarkdownInlineCode } from "../../../../../../base/common/htmlContent.js";
import { generateAutoApproveActions, TRUNCATION_MESSAGE, dedupeRules, isPowerShell, truncateOutputKeepingTail, extractCdPrefix, normalizeTerminalCommandForDisplay, normalizeCommandForExecution, isMultilineCommand, buildCommandDisplayText } from "../../browser/runInTerminalHelpers.js";
import { buildCompletionNotificationCommand } from "../../browser/tools/runInTerminalTool.js";
import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ConfigurationTarget } from "../../../../../../platform/configuration/common/configuration.js";
import { isAutoApproveRule } from "../../browser/tools/commandLineAnalyzer/commandLineAnalyzer.js";
suite("isPowerShell", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("PowerShell executables", () => {
    test("should detect powershell.exe", () => {
      ok(isPowerShell("powershell.exe", OperatingSystem.Windows));
      ok(isPowerShell("powershell", OperatingSystem.Linux));
    });
    test("should detect pwsh.exe", () => {
      ok(isPowerShell("pwsh.exe", OperatingSystem.Windows));
      ok(isPowerShell("pwsh", OperatingSystem.Linux));
    });
    test("should detect powershell-preview", () => {
      ok(isPowerShell("powershell-preview.exe", OperatingSystem.Windows));
      ok(isPowerShell("powershell-preview", OperatingSystem.Linux));
    });
    test("should detect pwsh-preview", () => {
      ok(isPowerShell("pwsh-preview.exe", OperatingSystem.Windows));
      ok(isPowerShell("pwsh-preview", OperatingSystem.Linux));
    });
  });
  suite("PowerShell with full paths", () => {
    test("should detect Windows PowerShell with full path", () => {
      ok(isPowerShell("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", OperatingSystem.Windows));
    });
    test("should detect PowerShell Core with full path", () => {
      ok(isPowerShell("C:\\Program Files\\PowerShell\\7\\pwsh.exe", OperatingSystem.Windows));
    });
    test("should detect PowerShell on Linux/macOS with full path", () => {
      ok(isPowerShell("/usr/bin/pwsh", OperatingSystem.Linux));
    });
    test("should detect PowerShell preview with full path", () => {
      ok(isPowerShell("/opt/microsoft/powershell/7-preview/pwsh-preview", OperatingSystem.Linux));
    });
    test("should detect nested path with powershell", () => {
      ok(isPowerShell("/some/deep/path/to/powershell.exe", OperatingSystem.Windows));
    });
  });
  suite("Case sensitivity", () => {
    test("should detect PowerShell regardless of case", () => {
      ok(isPowerShell("PowerShell.exe", OperatingSystem.Windows));
      ok(isPowerShell("POWERSHELL.EXE", OperatingSystem.Windows));
      ok(isPowerShell("Pwsh.exe", OperatingSystem.Windows));
    });
  });
  suite("Non-PowerShell shells", () => {
    test("should not detect bash", () => {
      ok(!isPowerShell("bash", OperatingSystem.Linux));
    });
    test("should not detect zsh", () => {
      ok(!isPowerShell("zsh", OperatingSystem.Linux));
    });
    test("should not detect sh", () => {
      ok(!isPowerShell("sh", OperatingSystem.Linux));
    });
    test("should not detect fish", () => {
      ok(!isPowerShell("fish", OperatingSystem.Linux));
    });
    test("should not detect cmd.exe", () => {
      ok(!isPowerShell("cmd.exe", OperatingSystem.Windows));
    });
    test("should not detect command.com", () => {
      ok(!isPowerShell("command.com", OperatingSystem.Windows));
    });
    test("should not detect dash", () => {
      ok(!isPowerShell("dash", OperatingSystem.Linux));
    });
    test("should not detect tcsh", () => {
      ok(!isPowerShell("tcsh", OperatingSystem.Linux));
    });
    test("should not detect csh", () => {
      ok(!isPowerShell("csh", OperatingSystem.Linux));
    });
  });
  suite("Non-PowerShell shells with full paths", () => {
    test("should not detect bash with full path", () => {
      ok(!isPowerShell("/bin/bash", OperatingSystem.Linux));
    });
    test("should not detect zsh with full path", () => {
      ok(!isPowerShell("/usr/bin/zsh", OperatingSystem.Linux));
    });
    test("should not detect cmd.exe with full path", () => {
      ok(!isPowerShell("C:\\Windows\\System32\\cmd.exe", OperatingSystem.Windows));
    });
    test("should not detect git bash", () => {
      ok(!isPowerShell("C:\\Program Files\\Git\\bin\\bash.exe", OperatingSystem.Windows));
    });
  });
  suite("Edge cases", () => {
    test("should handle empty string", () => {
      ok(!isPowerShell("", OperatingSystem.Windows));
    });
    test("should handle paths with spaces", () => {
      ok(isPowerShell("C:\\Program Files\\PowerShell\\7\\pwsh.exe", OperatingSystem.Windows));
      ok(!isPowerShell("C:\\Program Files\\Git\\bin\\bash.exe", OperatingSystem.Windows));
    });
    test("should not match partial strings", () => {
      ok(!isPowerShell("notpowershell", OperatingSystem.Linux));
      ok(!isPowerShell("powershellish", OperatingSystem.Linux));
      ok(!isPowerShell("mypwsh", OperatingSystem.Linux));
      ok(!isPowerShell("pwshell", OperatingSystem.Linux));
    });
    test("should handle strings containing powershell but not as basename", () => {
      ok(!isPowerShell("/powershell/bin/bash", OperatingSystem.Linux));
      ok(!isPowerShell("/usr/pwsh/bin/zsh", OperatingSystem.Linux));
      ok(!isPowerShell("C:\\powershell\\cmd.exe", OperatingSystem.Windows));
    });
    test("should handle special characters in path", () => {
      ok(isPowerShell("/path/with-dashes/pwsh.exe", OperatingSystem.Windows));
      ok(isPowerShell("/path/with_underscores/powershell", OperatingSystem.Linux));
      ok(isPowerShell("C:\\path\\with spaces\\pwsh.exe", OperatingSystem.Windows));
    });
    test("should handle relative paths", () => {
      ok(isPowerShell("./powershell.exe", OperatingSystem.Windows));
      ok(isPowerShell("../bin/pwsh", OperatingSystem.Linux));
      ok(isPowerShell("bin/powershell", OperatingSystem.Linux));
    });
    test("should not match similar named tools", () => {
      ok(!isPowerShell("powertool", OperatingSystem.Linux));
      ok(!isPowerShell("shell", OperatingSystem.Linux));
      ok(!isPowerShell("power", OperatingSystem.Linux));
      ok(!isPowerShell("pwshconfig", OperatingSystem.Linux));
    });
  });
});
suite("dedupeRules", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createMockRule(sourceText) {
    return {
      regex: new RegExp(sourceText),
      regexCaseInsensitive: new RegExp(sourceText, "i"),
      sourceText,
      sourceTarget: ConfigurationTarget.USER,
      isDefaultRule: false
    };
  }
  function createMockResult(result, reason, rule) {
    return {
      result,
      reason,
      rule
    };
  }
  function getSourceText(result) {
    return isAutoApproveRule(result.rule) ? result.rule.sourceText : void 0;
  }
  test("should return empty array for empty input", () => {
    const result = dedupeRules([]);
    strictEqual(result.length, 0);
  });
  test("should return same array when no duplicates exist", () => {
    const result = dedupeRules([
      createMockResult("approved", "approved by echo rule", createMockRule("echo")),
      createMockResult("approved", "approved by ls rule", createMockRule("ls"))
    ]);
    strictEqual(result.length, 2);
    strictEqual(getSourceText(result[0]), "echo");
    strictEqual(getSourceText(result[1]), "ls");
  });
  test("should deduplicate rules with same sourceText", () => {
    const result = dedupeRules([
      createMockResult("approved", "approved by echo rule", createMockRule("echo")),
      createMockResult("approved", "approved by echo rule again", createMockRule("echo")),
      createMockResult("approved", "approved by ls rule", createMockRule("ls"))
    ]);
    strictEqual(result.length, 2);
    strictEqual(getSourceText(result[0]), "echo");
    strictEqual(getSourceText(result[1]), "ls");
  });
  test("should preserve first occurrence when deduplicating", () => {
    const result = dedupeRules([
      createMockResult("approved", "first echo rule", createMockRule("echo")),
      createMockResult("approved", "second echo rule", createMockRule("echo"))
    ]);
    strictEqual(result.length, 1);
    strictEqual(result[0].reason, "first echo rule");
  });
  test("should filter out results without rules", () => {
    const result = dedupeRules([
      createMockResult("noMatch", "no rule applied"),
      createMockResult("approved", "approved by echo rule", createMockRule("echo")),
      createMockResult("denied", "denied without rule")
    ]);
    strictEqual(result.length, 1);
    strictEqual(getSourceText(result[0]), "echo");
  });
  test("should handle mix of rules and no-rule results with duplicates", () => {
    const result = dedupeRules([
      createMockResult("approved", "approved by echo rule", createMockRule("echo")),
      createMockResult("noMatch", "no rule applied"),
      createMockResult("approved", "approved by echo rule again", createMockRule("echo")),
      createMockResult("approved", "approved by ls rule", createMockRule("ls")),
      createMockResult("denied", "denied without rule")
    ]);
    strictEqual(result.length, 2);
    strictEqual(getSourceText(result[0]), "echo");
    strictEqual(getSourceText(result[1]), "ls");
  });
  test("should handle multiple duplicates of same rule", () => {
    const result = dedupeRules([
      createMockResult("approved", "npm rule 1", createMockRule("npm")),
      createMockResult("approved", "npm rule 2", createMockRule("npm")),
      createMockResult("approved", "npm rule 3", createMockRule("npm")),
      createMockResult("approved", "git rule", createMockRule("git"))
    ]);
    strictEqual(result.length, 2);
    strictEqual(getSourceText(result[0]), "npm");
    strictEqual(result[0].reason, "npm rule 1");
    strictEqual(getSourceText(result[1]), "git");
  });
});
suite("truncateOutputKeepingTail", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns original when below limit", () => {
    const output = "short output";
    strictEqual(truncateOutputKeepingTail(output, 100), output);
  });
  test("keeps tail and adds message when above limit", () => {
    const output = "a".repeat(200);
    const result = truncateOutputKeepingTail(output, 120);
    ok(result.startsWith(TRUNCATION_MESSAGE));
    strictEqual(result.length, 120);
  });
  test("gracefully handles tiny limits", () => {
    const result = truncateOutputKeepingTail("example", 5);
    strictEqual(result.length, 5);
  });
});
suite("normalizeTerminalCommandForDisplay", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("removes escaped single and double quotes", () => {
    const input = `git rev-parse \\'stash@{0}\\' && echo \\"done\\"`;
    strictEqual(normalizeTerminalCommandForDisplay(input), `git rev-parse 'stash@{0}' && echo "done"`);
  });
  test("normalizes escaped forward slashes", () => {
    const input = "echo \\/Users\\/me\\/project";
    strictEqual(normalizeTerminalCommandForDisplay(input), "echo /Users/me/project");
  });
  test("preserves non-quote escapes", () => {
    const input = "echo path\\ with\\ spaces";
    strictEqual(normalizeTerminalCommandForDisplay(input), input);
  });
});
suite("generateAutoApproveActions", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createMockRule(sourceText) {
    const escapedText = sourceText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return {
      regex: new RegExp(escapedText),
      regexCaseInsensitive: new RegExp(escapedText, "i"),
      sourceText,
      sourceTarget: ConfigurationTarget.USER,
      isDefaultRule: false
    };
  }
  function createMockResult(result, reason, rule) {
    return {
      result,
      reason,
      rule
    };
  }
  test("should suggest mvn test when command is mvn test", () => {
    const commandLine = "mvn test";
    const subCommands = ["mvn test"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("noMatch", "not approved")],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find((action) => action.label.includes("mvn test"));
    ok(subCommandAction, "Should suggest mvn test approval");
  });
  test("should suggest mvn -DskipIT test when flags appear before subcommand", () => {
    const commandLine = "mvn -DskipIT test";
    const subCommands = ["mvn -DskipIT test"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("noMatch", "not approved")],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find((action) => action.label.includes("mvn -DskipIT test"));
    ok(subCommandAction, "Should suggest mvn -DskipIT test approval (including flags)");
  });
  test("should suggest mvn -X -DskipIT test when multiple flags appear before subcommand", () => {
    const commandLine = "mvn -X -DskipIT test";
    const subCommands = ["mvn -X -DskipIT test"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("noMatch", "not approved")],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find((action) => action.label.includes("mvn -X -DskipIT test"));
    ok(subCommandAction, "Should suggest mvn -X -DskipIT test approval with multiple flags");
  });
  test("should suggest gradle --info build when flags appear before subcommand", () => {
    const commandLine = "gradle --info build";
    const subCommands = ["gradle --info build"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("noMatch", "not approved")],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find((action) => action.label.includes("gradle --info build"));
    ok(subCommandAction, "Should suggest gradle --info build approval");
  });
  test("should suggest npm --silent run test when flags appear before subcommand", () => {
    const commandLine = "npm --silent run test";
    const subCommands = ["npm --silent run test"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("noMatch", "not approved")],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find((action) => action.label.includes("npm --silent run test"));
    ok(subCommandAction, "Should suggest npm --silent run test approval (sub-sub-command with flags)");
  });
  test("should suggest npm --silent run --verbose test when flags appear between subcommands", () => {
    const commandLine = "npm --silent run --verbose test";
    const subCommands = ["npm --silent run --verbose test"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("noMatch", "not approved")],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find((action) => action.label.includes("npm --silent run --verbose test"));
    ok(subCommandAction, "Should suggest npm --silent run --verbose test with flags between subcommands");
  });
  test("should not suggest approval when only flags and no subcommand", () => {
    const commandLine = "mvn -X -DskipIT";
    const subCommands = ["mvn -X -DskipIT"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("noMatch", "not approved")],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find((action) => action.label.includes("Always Allow Command:") && action.label.includes("mvn"));
    strictEqual(subCommandAction, void 0, "Should not suggest mvn approval when no subcommand found");
  });
  test("should suggest exact command line when subcommand cannot be extracted", () => {
    const commandLine = "mvn -X -DskipIT";
    const subCommands = ["mvn -X -DskipIT"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("noMatch", "not approved")],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const exactCommandAction = actions.find((action) => action.label.includes("Always Allow Exact Command Line"));
    ok(exactCommandAction, "Should suggest exact command line approval");
  });
  test("should handle multiple subcommands with flags", () => {
    const commandLine = "mvn -DskipIT test && gradle --info build";
    const subCommands = ["mvn -DskipIT test", "gradle --info build"];
    const autoApproveResult = {
      subCommandResults: [
        createMockResult("noMatch", "not approved"),
        createMockResult("noMatch", "not approved")
      ],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find(
      (action) => action.label.includes("mvn -DskipIT test") && action.label.includes("gradle --info build")
    );
    ok(subCommandAction, "Should suggest both mvn -DskipIT test and gradle --info build");
  });
  test("should not suggest when commands are denied", () => {
    const commandLine = "mvn -DskipIT test";
    const subCommands = ["mvn -DskipIT test"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("denied", "denied by rule", createMockRule("mvn test"))],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find((action) => action.label.includes("Always Allow Command:"));
    strictEqual(subCommandAction, void 0, "Should not suggest approval for denied commands");
  });
  test("should not suggest when commands are already approved", () => {
    const commandLine = "mvn -DskipIT test";
    const subCommands = ["mvn -DskipIT test"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("approved", "approved by rule", createMockRule("mvn test"))],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find((action) => action.label.includes("mvn -DskipIT test") && action.label.includes("Always Allow Command:"));
    strictEqual(subCommandAction, void 0, "Should not suggest approval for already approved commands");
  });
  test("should not include session-scoped actions when skipSessionScoped is set", () => {
    const commandLine = "mvn test";
    const subCommands = ["mvn test"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("noMatch", "not approved")],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult, { skipSessionScoped: true });
    deepStrictEqual(actions.map((action) => action instanceof Separator ? "---" : action.label), [
      "Allow `mvn test \u2026` in this Workspace",
      "Always Allow `mvn test \u2026`",
      "---",
      "Allow Exact Command Line in this Workspace",
      "Always Allow Exact Command Line",
      "---",
      "Configure Auto Approve..."
    ]);
  });
});
suite("extractCdPrefix", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("Posix", () => {
    function t(commandLine, expectedDir, expectedCommand) {
      const result = extractCdPrefix(commandLine, "bash", OperatingSystem.Linux);
      strictEqual(result?.directory, expectedDir);
      strictEqual(result?.command, expectedCommand);
    }
    test("should return undefined when no cd prefix", () => t("echo hello", void 0, void 0));
    test("should return undefined when cd has no suffix", () => t("cd /some/path", void 0, void 0));
    test("should extract cd prefix with && separator", () => t("cd /some/path && npm install", "/some/path", "npm install"));
    test("should extract quoted path", () => t('cd "/some/path" && npm install', "/some/path", "npm install"));
    test("should extract complex suffix", () => t("cd /path && npm install && npm test", "/path", "npm install && npm test"));
    suite("unsupported patterns", () => {
      test("should return undefined for path with escaped space", () => t("cd /some/path with spaces && npm install", void 0, void 0));
    });
  });
  suite("PowerShell", () => {
    function t(commandLine, expectedDir, expectedCommand) {
      const result = extractCdPrefix(commandLine, "pwsh", OperatingSystem.Windows);
      strictEqual(result?.directory, expectedDir);
      strictEqual(result?.command, expectedCommand);
    }
    test("should extract cd with ; separator", () => t("cd C:\\path; npm test", "C:\\path", "npm test"));
    test("should extract cd /d with && separator", () => t("cd /d C:\\path && echo hello", "C:\\path", "echo hello"));
    test("should extract Set-Location", () => t("Set-Location C:\\path; npm test", "C:\\path", "npm test"));
    test("should extract Set-Location -Path", () => t("Set-Location -Path C:\\path; npm test", "C:\\path", "npm test"));
    suite("unsupported patterns", () => {
      test("should return undefined for quoted path with spaces", () => t('cd "C:\\path with spaces"; npm test', void 0, void 0));
    });
  });
});
suite("normalizeCommandForExecution", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("should collapse newlines to spaces for simple commands", () => {
    strictEqual(normalizeCommandForExecution("echo hello\necho world"), "echo hello echo world");
  });
  test("should collapse \\r\\n to spaces", () => {
    strictEqual(normalizeCommandForExecution("echo a\r\necho b"), "echo a echo b");
  });
  test("should collapse \\r to spaces", () => {
    strictEqual(normalizeCommandForExecution("echo a\recho b"), "echo a echo b");
  });
  test("should trim whitespace", () => {
    strictEqual(normalizeCommandForExecution("  echo hello  "), "echo hello");
  });
  test("should handle single-line command", () => {
    strictEqual(normalizeCommandForExecution("ls -la"), "ls -la");
  });
});
suite("isMultilineCommand", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("should return true for heredoc", () => {
    strictEqual(isMultilineCommand("cat > file.txt << 'EOF'\nhello world\nEOF"), true);
  });
  test("should return true for multi-statement with \\n", () => {
    strictEqual(isMultilineCommand("echo hello\necho world"), true);
  });
  test("should return true for multi-statement with \\r\\n", () => {
    strictEqual(isMultilineCommand("echo hello\r\necho world"), true);
  });
  test("should return false for single-line command", () => {
    strictEqual(isMultilineCommand("ls -la"), false);
  });
  test("should return false for line continuation with backslash-newline", () => {
    strictEqual(isMultilineCommand("echo hello \\\n  world"), false);
  });
  test("should return false for line continuation with backslash-crlf", () => {
    strictEqual(isMultilineCommand("echo hello \\\r\n  world"), false);
  });
  test("should return true when continuation and bare newline are mixed", () => {
    strictEqual(isMultilineCommand("echo hello \\\n  world\necho done"), true);
  });
});
suite("buildCommandDisplayText", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("should collapse newlines (including blank lines) to spaces", () => {
    strictEqual(buildCommandDisplayText("echo a\n\necho b"), "echo a  echo b");
    strictEqual(buildCommandDisplayText("echo a\r\necho b"), "echo a echo b");
  });
  test("should truncate long commands to 80 characters", () => {
    const long = "a".repeat(200);
    const result = buildCommandDisplayText(long);
    strictEqual(result.length, 80);
    ok(result.endsWith("..."));
  });
  test("multi-line command renders as inline code (not a literal backtick)", () => {
    const opts = { gfm: true, breaks: true };
    const render = (value) => marked.parser(marked.lexer(value, opts), opts);
    const multilineCommand = "rm -rf .playwright-cli/\n\nmore text";
    const label = appendEscapedMarkdownInlineCode(buildCommandDisplayText(multilineCommand)) + " completed";
    const html = render(label);
    ok(html.includes("<code>"), `expected a code span, got: ${html}`);
    ok(!/<p>`/.test(html), `expected no literal leading backtick, got: ${html}`);
  });
});
suite("buildCompletionNotificationCommand", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("leaves single-line commands unchanged", () => {
    strictEqual(buildCompletionNotificationCommand("echo hello"), "echo hello");
  });
  test("keeps only the first line and appends a horizontal ellipsis for multi-line commands", () => {
    strictEqual(buildCompletionNotificationCommand("echo a\necho b"), "echo a\u2026");
    strictEqual(buildCompletionNotificationCommand("echo a\n\necho b"), "echo a\u2026");
    strictEqual(buildCompletionNotificationCommand("echo a\r\necho b"), "echo a\u2026");
    strictEqual(buildCompletionNotificationCommand("echo a\recho b"), "echo a\u2026");
  });
  test("truncates a long first line to 80 characters using a single horizontal ellipsis", () => {
    const longFirstLine = "a".repeat(200);
    const multiLine = longFirstLine + "\nignored";
    const result = buildCompletionNotificationCommand(multiLine);
    strictEqual(result.length, 80);
    ok(result.endsWith("\u2026"), `expected ellipsis suffix, got: ${result}`);
    ok(!result.endsWith("\u2026\u2026"), `expected single ellipsis suffix, got: ${result}`);
  });
  test("strips escape artifacts from the first line", () => {
    strictEqual(buildCompletionNotificationCommand('echo \\"hi\\"\necho ignored'), 'echo "hi"\u2026');
  });
  test("result renders as inline code when wrapped with appendEscapedMarkdownInlineCode", () => {
    const opts = { gfm: true, breaks: true };
    const render = (value) => marked.parser(marked.lexer(value, opts), opts);
    const multilineCommand = "rm -rf .playwright-cli/\n\nmore text";
    const label = appendEscapedMarkdownInlineCode(buildCompletionNotificationCommand(multilineCommand)) + " completed";
    const html = render(label);
    ok(html.includes("<code>"), `expected a code span, got: ${html}`);
    ok(!/<p>`/.test(html), `expected no literal leading backtick, got: ${html}`);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvcnVuSW5UZXJtaW5hbEhlbHBlcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgb2ssIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0ICogYXMgbWFya2VkIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcmtlZC9tYXJrZWQuanMnO1xuaW1wb3J0IHsgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGdlbmVyYXRlQXV0b0FwcHJvdmVBY3Rpb25zLCBUUlVOQ0FUSU9OX01FU1NBR0UsIGRlZHVwZVJ1bGVzLCBpc1Bvd2VyU2hlbGwsIHRydW5jYXRlT3V0cHV0S2VlcGluZ1RhaWwsIGV4dHJhY3RDZFByZWZpeCwgbm9ybWFsaXplVGVybWluYWxDb21tYW5kRm9yRGlzcGxheSwgbm9ybWFsaXplQ29tbWFuZEZvckV4ZWN1dGlvbiwgaXNNdWx0aWxpbmVDb21tYW5kLCBidWlsZENvbW1hbmREaXNwbGF5VGV4dCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcnVuSW5UZXJtaW5hbEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgYnVpbGRDb21wbGV0aW9uTm90aWZpY2F0aW9uQ29tbWFuZCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdG9vbHMvcnVuSW5UZXJtaW5hbFRvb2wuanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IElDb21tYW5kQXBwcm92YWxSZXN1bHRXaXRoUmVhc29uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b29scy9jb21tYW5kTGluZUFuYWx5emVyL2F1dG9BcHByb3ZlL2NvbW1hbmRMaW5lQXV0b0FwcHJvdmVyLmpzJztcbmltcG9ydCB7IGlzQXV0b0FwcHJvdmVSdWxlLCB0eXBlIElBdXRvQXBwcm92ZVJ1bGUgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL2NvbW1hbmRMaW5lQW5hbHl6ZXIvY29tbWFuZExpbmVBbmFseXplci5qcyc7XG5cbnN1aXRlKCdpc1Bvd2VyU2hlbGwnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdQb3dlclNoZWxsIGV4ZWN1dGFibGVzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBkZXRlY3QgcG93ZXJzaGVsbC5leGUnLCAoKSA9PiB7XG5cdFx0XHRvayhpc1Bvd2VyU2hlbGwoJ3Bvd2Vyc2hlbGwuZXhlJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpKTtcblx0XHRcdG9rKGlzUG93ZXJTaGVsbCgncG93ZXJzaGVsbCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRldGVjdCBwd3NoLmV4ZScsICgpID0+IHtcblx0XHRcdG9rKGlzUG93ZXJTaGVsbCgncHdzaC5leGUnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykpO1xuXHRcdFx0b2soaXNQb3dlclNoZWxsKCdwd3NoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZGV0ZWN0IHBvd2Vyc2hlbGwtcHJldmlldycsICgpID0+IHtcblx0XHRcdG9rKGlzUG93ZXJTaGVsbCgncG93ZXJzaGVsbC1wcmV2aWV3LmV4ZScsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSk7XG5cdFx0XHRvayhpc1Bvd2VyU2hlbGwoJ3Bvd2Vyc2hlbGwtcHJldmlldycsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRldGVjdCBwd3NoLXByZXZpZXcnLCAoKSA9PiB7XG5cdFx0XHRvayhpc1Bvd2VyU2hlbGwoJ3B3c2gtcHJldmlldy5leGUnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykpO1xuXHRcdFx0b2soaXNQb3dlclNoZWxsKCdwd3NoLXByZXZpZXcnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1Bvd2VyU2hlbGwgd2l0aCBmdWxsIHBhdGhzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBkZXRlY3QgV2luZG93cyBQb3dlclNoZWxsIHdpdGggZnVsbCBwYXRoJywgKCkgPT4ge1xuXHRcdFx0b2soaXNQb3dlclNoZWxsKCdDOlxcXFxXaW5kb3dzXFxcXFN5c3RlbTMyXFxcXFdpbmRvd3NQb3dlclNoZWxsXFxcXHYxLjBcXFxccG93ZXJzaGVsbC5leGUnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRldGVjdCBQb3dlclNoZWxsIENvcmUgd2l0aCBmdWxsIHBhdGgnLCAoKSA9PiB7XG5cdFx0XHRvayhpc1Bvd2VyU2hlbGwoJ0M6XFxcXFByb2dyYW0gRmlsZXNcXFxcUG93ZXJTaGVsbFxcXFw3XFxcXHB3c2guZXhlJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBkZXRlY3QgUG93ZXJTaGVsbCBvbiBMaW51eC9tYWNPUyB3aXRoIGZ1bGwgcGF0aCcsICgpID0+IHtcblx0XHRcdG9rKGlzUG93ZXJTaGVsbCgnL3Vzci9iaW4vcHdzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRldGVjdCBQb3dlclNoZWxsIHByZXZpZXcgd2l0aCBmdWxsIHBhdGgnLCAoKSA9PiB7XG5cdFx0XHRvayhpc1Bvd2VyU2hlbGwoJy9vcHQvbWljcm9zb2Z0L3Bvd2Vyc2hlbGwvNy1wcmV2aWV3L3B3c2gtcHJldmlldycsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRldGVjdCBuZXN0ZWQgcGF0aCB3aXRoIHBvd2Vyc2hlbGwnLCAoKSA9PiB7XG5cdFx0XHRvayhpc1Bvd2VyU2hlbGwoJy9zb21lL2RlZXAvcGF0aC90by9wb3dlcnNoZWxsLmV4ZScsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdDYXNlIHNlbnNpdGl2aXR5JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBkZXRlY3QgUG93ZXJTaGVsbCByZWdhcmRsZXNzIG9mIGNhc2UnLCAoKSA9PiB7XG5cdFx0XHRvayhpc1Bvd2VyU2hlbGwoJ1Bvd2VyU2hlbGwuZXhlJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpKTtcblx0XHRcdG9rKGlzUG93ZXJTaGVsbCgnUE9XRVJTSEVMTC5FWEUnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykpO1xuXHRcdFx0b2soaXNQb3dlclNoZWxsKCdQd3NoLmV4ZScsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdOb24tUG93ZXJTaGVsbCBzaGVsbHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBkZXRlY3QgYmFzaCcsICgpID0+IHtcblx0XHRcdG9rKCFpc1Bvd2VyU2hlbGwoJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZGV0ZWN0IHpzaCcsICgpID0+IHtcblx0XHRcdG9rKCFpc1Bvd2VyU2hlbGwoJ3pzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBkZXRlY3Qgc2gnLCAoKSA9PiB7XG5cdFx0XHRvayghaXNQb3dlclNoZWxsKCdzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBkZXRlY3QgZmlzaCcsICgpID0+IHtcblx0XHRcdG9rKCFpc1Bvd2VyU2hlbGwoJ2Zpc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZGV0ZWN0IGNtZC5leGUnLCAoKSA9PiB7XG5cdFx0XHRvayghaXNQb3dlclNoZWxsKCdjbWQuZXhlJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZGV0ZWN0IGNvbW1hbmQuY29tJywgKCkgPT4ge1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgnY29tbWFuZC5jb20nLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBkZXRlY3QgZGFzaCcsICgpID0+IHtcblx0XHRcdG9rKCFpc1Bvd2VyU2hlbGwoJ2Rhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZGV0ZWN0IHRjc2gnLCAoKSA9PiB7XG5cdFx0XHRvayghaXNQb3dlclNoZWxsKCd0Y3NoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGRldGVjdCBjc2gnLCAoKSA9PiB7XG5cdFx0XHRvayghaXNQb3dlclNoZWxsKCdjc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ05vbi1Qb3dlclNoZWxsIHNoZWxscyB3aXRoIGZ1bGwgcGF0aHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBkZXRlY3QgYmFzaCB3aXRoIGZ1bGwgcGF0aCcsICgpID0+IHtcblx0XHRcdG9rKCFpc1Bvd2VyU2hlbGwoJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBkZXRlY3QgenNoIHdpdGggZnVsbCBwYXRoJywgKCkgPT4ge1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgnL3Vzci9iaW4venNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGRldGVjdCBjbWQuZXhlIHdpdGggZnVsbCBwYXRoJywgKCkgPT4ge1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgnQzpcXFxcV2luZG93c1xcXFxTeXN0ZW0zMlxcXFxjbWQuZXhlJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZGV0ZWN0IGdpdCBiYXNoJywgKCkgPT4ge1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgnQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxHaXRcXFxcYmluXFxcXGJhc2guZXhlJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0VkZ2UgY2FzZXMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBlbXB0eSBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRvayghaXNQb3dlclNoZWxsKCcnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBwYXRocyB3aXRoIHNwYWNlcycsICgpID0+IHtcblx0XHRcdG9rKGlzUG93ZXJTaGVsbCgnQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxQb3dlclNoZWxsXFxcXDdcXFxccHdzaC5leGUnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykpO1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgnQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxHaXRcXFxcYmluXFxcXGJhc2guZXhlJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgbWF0Y2ggcGFydGlhbCBzdHJpbmdzJywgKCkgPT4ge1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgnbm90cG93ZXJzaGVsbCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgncG93ZXJzaGVsbGlzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgnbXlwd3NoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSk7XG5cdFx0XHRvayghaXNQb3dlclNoZWxsKCdwd3NoZWxsJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHN0cmluZ3MgY29udGFpbmluZyBwb3dlcnNoZWxsIGJ1dCBub3QgYXMgYmFzZW5hbWUnLCAoKSA9PiB7XG5cdFx0XHRvayghaXNQb3dlclNoZWxsKCcvcG93ZXJzaGVsbC9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgnL3Vzci9wd3NoL2Jpbi96c2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHRcdG9rKCFpc1Bvd2VyU2hlbGwoJ0M6XFxcXHBvd2Vyc2hlbGxcXFxcY21kLmV4ZScsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHNwZWNpYWwgY2hhcmFjdGVycyBpbiBwYXRoJywgKCkgPT4ge1xuXHRcdFx0b2soaXNQb3dlclNoZWxsKCcvcGF0aC93aXRoLWRhc2hlcy9wd3NoLmV4ZScsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSk7XG5cdFx0XHRvayhpc1Bvd2VyU2hlbGwoJy9wYXRoL3dpdGhfdW5kZXJzY29yZXMvcG93ZXJzaGVsbCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdFx0b2soaXNQb3dlclNoZWxsKCdDOlxcXFxwYXRoXFxcXHdpdGggc3BhY2VzXFxcXHB3c2guZXhlJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgcmVsYXRpdmUgcGF0aHMnLCAoKSA9PiB7XG5cdFx0XHRvayhpc1Bvd2VyU2hlbGwoJy4vcG93ZXJzaGVsbC5leGUnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykpO1xuXHRcdFx0b2soaXNQb3dlclNoZWxsKCcuLi9iaW4vcHdzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdFx0b2soaXNQb3dlclNoZWxsKCdiaW4vcG93ZXJzaGVsbCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBtYXRjaCBzaW1pbGFyIG5hbWVkIHRvb2xzJywgKCkgPT4ge1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgncG93ZXJ0b29sJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSk7XG5cdFx0XHRvayghaXNQb3dlclNoZWxsKCdzaGVsbCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgncG93ZXInLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHRcdG9rKCFpc1Bvd2VyU2hlbGwoJ3B3c2hjb25maWcnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2RlZHVwZVJ1bGVzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVNb2NrUnVsZShzb3VyY2VUZXh0OiBzdHJpbmcpOiBJQXV0b0FwcHJvdmVSdWxlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVnZXg6IG5ldyBSZWdFeHAoc291cmNlVGV4dCksXG5cdFx0XHRyZWdleENhc2VJbnNlbnNpdGl2ZTogbmV3IFJlZ0V4cChzb3VyY2VUZXh0LCAnaScpLFxuXHRcdFx0c291cmNlVGV4dCxcblx0XHRcdHNvdXJjZVRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0aXNEZWZhdWx0UnVsZTogZmFsc2Vcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja1Jlc3VsdChyZXN1bHQ6ICdhcHByb3ZlZCcgfCAnZGVuaWVkJyB8ICdub01hdGNoJywgcmVhc29uOiBzdHJpbmcsIHJ1bGU/OiBJQXV0b0FwcHJvdmVSdWxlKTogSUNvbW1hbmRBcHByb3ZhbFJlc3VsdFdpdGhSZWFzb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXN1bHQsXG5cdFx0XHRyZWFzb24sXG5cdFx0XHRydWxlXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldFNvdXJjZVRleHQocmVzdWx0OiBJQ29tbWFuZEFwcHJvdmFsUmVzdWx0V2l0aFJlYXNvbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGlzQXV0b0FwcHJvdmVSdWxlKHJlc3VsdC5ydWxlKSA/IHJlc3VsdC5ydWxlLnNvdXJjZVRleHQgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIGVtcHR5IGFycmF5IGZvciBlbXB0eSBpbnB1dCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBkZWR1cGVSdWxlcyhbXSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gc2FtZSBhcnJheSB3aGVuIG5vIGR1cGxpY2F0ZXMgZXhpc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZGVkdXBlUnVsZXMoW1xuXHRcdFx0Y3JlYXRlTW9ja1Jlc3VsdCgnYXBwcm92ZWQnLCAnYXBwcm92ZWQgYnkgZWNobyBydWxlJywgY3JlYXRlTW9ja1J1bGUoJ2VjaG8nKSksXG5cdFx0XHRjcmVhdGVNb2NrUmVzdWx0KCdhcHByb3ZlZCcsICdhcHByb3ZlZCBieSBscyBydWxlJywgY3JlYXRlTW9ja1J1bGUoJ2xzJykpXG5cdFx0XSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cdFx0c3RyaWN0RXF1YWwoZ2V0U291cmNlVGV4dChyZXN1bHRbMF0pLCAnZWNobycpO1xuXHRcdHN0cmljdEVxdWFsKGdldFNvdXJjZVRleHQocmVzdWx0WzFdKSwgJ2xzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBkZWR1cGxpY2F0ZSBydWxlcyB3aXRoIHNhbWUgc291cmNlVGV4dCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBkZWR1cGVSdWxlcyhbXG5cdFx0XHRjcmVhdGVNb2NrUmVzdWx0KCdhcHByb3ZlZCcsICdhcHByb3ZlZCBieSBlY2hvIHJ1bGUnLCBjcmVhdGVNb2NrUnVsZSgnZWNobycpKSxcblx0XHRcdGNyZWF0ZU1vY2tSZXN1bHQoJ2FwcHJvdmVkJywgJ2FwcHJvdmVkIGJ5IGVjaG8gcnVsZSBhZ2FpbicsIGNyZWF0ZU1vY2tSdWxlKCdlY2hvJykpLFxuXHRcdFx0Y3JlYXRlTW9ja1Jlc3VsdCgnYXBwcm92ZWQnLCAnYXBwcm92ZWQgYnkgbHMgcnVsZScsIGNyZWF0ZU1vY2tSdWxlKCdscycpKVxuXHRcdF0pO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdHN0cmljdEVxdWFsKGdldFNvdXJjZVRleHQocmVzdWx0WzBdKSwgJ2VjaG8nKTtcblx0XHRzdHJpY3RFcXVhbChnZXRTb3VyY2VUZXh0KHJlc3VsdFsxXSksICdscycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcHJlc2VydmUgZmlyc3Qgb2NjdXJyZW5jZSB3aGVuIGRlZHVwbGljYXRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZGVkdXBlUnVsZXMoW1xuXHRcdFx0Y3JlYXRlTW9ja1Jlc3VsdCgnYXBwcm92ZWQnLCAnZmlyc3QgZWNobyBydWxlJywgY3JlYXRlTW9ja1J1bGUoJ2VjaG8nKSksXG5cdFx0XHRjcmVhdGVNb2NrUmVzdWx0KCdhcHByb3ZlZCcsICdzZWNvbmQgZWNobyBydWxlJywgY3JlYXRlTW9ja1J1bGUoJ2VjaG8nKSlcblx0XHRdKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHRbMF0ucmVhc29uLCAnZmlyc3QgZWNobyBydWxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBmaWx0ZXIgb3V0IHJlc3VsdHMgd2l0aG91dCBydWxlcycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBkZWR1cGVSdWxlcyhbXG5cdFx0XHRjcmVhdGVNb2NrUmVzdWx0KCdub01hdGNoJywgJ25vIHJ1bGUgYXBwbGllZCcpLFxuXHRcdFx0Y3JlYXRlTW9ja1Jlc3VsdCgnYXBwcm92ZWQnLCAnYXBwcm92ZWQgYnkgZWNobyBydWxlJywgY3JlYXRlTW9ja1J1bGUoJ2VjaG8nKSksXG5cdFx0XHRjcmVhdGVNb2NrUmVzdWx0KCdkZW5pZWQnLCAnZGVuaWVkIHdpdGhvdXQgcnVsZScpXG5cdFx0XSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0c3RyaWN0RXF1YWwoZ2V0U291cmNlVGV4dChyZXN1bHRbMF0pLCAnZWNobycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIG1peCBvZiBydWxlcyBhbmQgbm8tcnVsZSByZXN1bHRzIHdpdGggZHVwbGljYXRlcycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBkZWR1cGVSdWxlcyhbXG5cdFx0XHRjcmVhdGVNb2NrUmVzdWx0KCdhcHByb3ZlZCcsICdhcHByb3ZlZCBieSBlY2hvIHJ1bGUnLCBjcmVhdGVNb2NrUnVsZSgnZWNobycpKSxcblx0XHRcdGNyZWF0ZU1vY2tSZXN1bHQoJ25vTWF0Y2gnLCAnbm8gcnVsZSBhcHBsaWVkJyksXG5cdFx0XHRjcmVhdGVNb2NrUmVzdWx0KCdhcHByb3ZlZCcsICdhcHByb3ZlZCBieSBlY2hvIHJ1bGUgYWdhaW4nLCBjcmVhdGVNb2NrUnVsZSgnZWNobycpKSxcblx0XHRcdGNyZWF0ZU1vY2tSZXN1bHQoJ2FwcHJvdmVkJywgJ2FwcHJvdmVkIGJ5IGxzIHJ1bGUnLCBjcmVhdGVNb2NrUnVsZSgnbHMnKSksXG5cdFx0XHRjcmVhdGVNb2NrUmVzdWx0KCdkZW5pZWQnLCAnZGVuaWVkIHdpdGhvdXQgcnVsZScpXG5cdFx0XSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cdFx0c3RyaWN0RXF1YWwoZ2V0U291cmNlVGV4dChyZXN1bHRbMF0pLCAnZWNobycpO1xuXHRcdHN0cmljdEVxdWFsKGdldFNvdXJjZVRleHQocmVzdWx0WzFdKSwgJ2xzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbXVsdGlwbGUgZHVwbGljYXRlcyBvZiBzYW1lIHJ1bGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZGVkdXBlUnVsZXMoW1xuXHRcdFx0Y3JlYXRlTW9ja1Jlc3VsdCgnYXBwcm92ZWQnLCAnbnBtIHJ1bGUgMScsIGNyZWF0ZU1vY2tSdWxlKCducG0nKSksXG5cdFx0XHRjcmVhdGVNb2NrUmVzdWx0KCdhcHByb3ZlZCcsICducG0gcnVsZSAyJywgY3JlYXRlTW9ja1J1bGUoJ25wbScpKSxcblx0XHRcdGNyZWF0ZU1vY2tSZXN1bHQoJ2FwcHJvdmVkJywgJ25wbSBydWxlIDMnLCBjcmVhdGVNb2NrUnVsZSgnbnBtJykpLFxuXHRcdFx0Y3JlYXRlTW9ja1Jlc3VsdCgnYXBwcm92ZWQnLCAnZ2l0IHJ1bGUnLCBjcmVhdGVNb2NrUnVsZSgnZ2l0JykpXG5cdFx0XSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cdFx0c3RyaWN0RXF1YWwoZ2V0U291cmNlVGV4dChyZXN1bHRbMF0pLCAnbnBtJyk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0WzBdLnJlYXNvbiwgJ25wbSBydWxlIDEnKTtcblx0XHRzdHJpY3RFcXVhbChnZXRTb3VyY2VUZXh0KHJlc3VsdFsxXSksICdnaXQnKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3RydW5jYXRlT3V0cHV0S2VlcGluZ1RhaWwnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHR0ZXN0KCdyZXR1cm5zIG9yaWdpbmFsIHdoZW4gYmVsb3cgbGltaXQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gJ3Nob3J0IG91dHB1dCc7XG5cdFx0c3RyaWN0RXF1YWwodHJ1bmNhdGVPdXRwdXRLZWVwaW5nVGFpbChvdXRwdXQsIDEwMCksIG91dHB1dCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIHRhaWwgYW5kIGFkZHMgbWVzc2FnZSB3aGVuIGFib3ZlIGxpbWl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9ICdhJy5yZXBlYXQoMjAwKTtcblx0XHRjb25zdCByZXN1bHQgPSB0cnVuY2F0ZU91dHB1dEtlZXBpbmdUYWlsKG91dHB1dCwgMTIwKTtcblx0XHRvayhyZXN1bHQuc3RhcnRzV2l0aChUUlVOQ0FUSU9OX01FU1NBR0UpKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxMjApO1xuXHR9KTtcblxuXHR0ZXN0KCdncmFjZWZ1bGx5IGhhbmRsZXMgdGlueSBsaW1pdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdHJ1bmNhdGVPdXRwdXRLZWVwaW5nVGFpbCgnZXhhbXBsZScsIDUpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDUpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnbm9ybWFsaXplVGVybWluYWxDb21tYW5kRm9yRGlzcGxheScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVtb3ZlcyBlc2NhcGVkIHNpbmdsZSBhbmQgZG91YmxlIHF1b3RlcycsICgpID0+IHtcblx0XHRjb25zdCBpbnB1dCA9ICdnaXQgcmV2LXBhcnNlIFxcXFxcXCdzdGFzaEB7MH1cXFxcXFwnICYmIGVjaG8gXFxcXFxcXCJkb25lXFxcXFxcXCInO1xuXHRcdHN0cmljdEVxdWFsKG5vcm1hbGl6ZVRlcm1pbmFsQ29tbWFuZEZvckRpc3BsYXkoaW5wdXQpLCAnZ2l0IHJldi1wYXJzZSBcXCdzdGFzaEB7MH1cXCcgJiYgZWNobyBcImRvbmVcIicpO1xuXHR9KTtcblxuXHR0ZXN0KCdub3JtYWxpemVzIGVzY2FwZWQgZm9yd2FyZCBzbGFzaGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGlucHV0ID0gJ2VjaG8gXFxcXC9Vc2Vyc1xcXFwvbWVcXFxcL3Byb2plY3QnO1xuXHRcdHN0cmljdEVxdWFsKG5vcm1hbGl6ZVRlcm1pbmFsQ29tbWFuZEZvckRpc3BsYXkoaW5wdXQpLCAnZWNobyAvVXNlcnMvbWUvcHJvamVjdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgbm9uLXF1b3RlIGVzY2FwZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5wdXQgPSAnZWNobyBwYXRoXFxcXCB3aXRoXFxcXCBzcGFjZXMnO1xuXHRcdHN0cmljdEVxdWFsKG5vcm1hbGl6ZVRlcm1pbmFsQ29tbWFuZEZvckRpc3BsYXkoaW5wdXQpLCBpbnB1dCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdnZW5lcmF0ZUF1dG9BcHByb3ZlQWN0aW9ucycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja1J1bGUoc291cmNlVGV4dDogc3RyaW5nKTogSUF1dG9BcHByb3ZlUnVsZSB7XG5cdFx0Ly8gRXNjYXBlIHNwZWNpYWwgcmVnZXggY2hhcmFjdGVycyBmb3IgdGVzdCBwdXJwb3NlcyB0byBwcmV2ZW50IHJlZ2V4IGVycm9yc1xuXHRcdGNvbnN0IGVzY2FwZWRUZXh0ID0gc291cmNlVGV4dC5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgJ1xcXFwkJicpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZWdleDogbmV3IFJlZ0V4cChlc2NhcGVkVGV4dCksXG5cdFx0XHRyZWdleENhc2VJbnNlbnNpdGl2ZTogbmV3IFJlZ0V4cChlc2NhcGVkVGV4dCwgJ2knKSxcblx0XHRcdHNvdXJjZVRleHQsXG5cdFx0XHRzb3VyY2VUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdGlzRGVmYXVsdFJ1bGU6IGZhbHNlXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tSZXN1bHQocmVzdWx0OiAnYXBwcm92ZWQnIHwgJ2RlbmllZCcgfCAnbm9NYXRjaCcsIHJlYXNvbjogc3RyaW5nLCBydWxlPzogSUF1dG9BcHByb3ZlUnVsZSk6IElDb21tYW5kQXBwcm92YWxSZXN1bHRXaXRoUmVhc29uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzdWx0LFxuXHRcdFx0cmVhc29uLFxuXHRcdFx0cnVsZVxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdzaG91bGQgc3VnZ2VzdCBtdm4gdGVzdCB3aGVuIGNvbW1hbmQgaXMgbXZuIHRlc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWFuZExpbmUgPSAnbXZuIHRlc3QnO1xuXHRcdGNvbnN0IHN1YkNvbW1hbmRzID0gWydtdm4gdGVzdCddO1xuXHRcdGNvbnN0IGF1dG9BcHByb3ZlUmVzdWx0ID0ge1xuXHRcdFx0c3ViQ29tbWFuZFJlc3VsdHM6IFtjcmVhdGVNb2NrUmVzdWx0KCdub01hdGNoJywgJ25vdCBhcHByb3ZlZCcpXSxcblx0XHRcdGNvbW1hbmRMaW5lUmVzdWx0OiBjcmVhdGVNb2NrUmVzdWx0KCdub01hdGNoJywgJ25vdCBhcHByb3ZlZCcpXG5cdFx0fTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZW5lcmF0ZUF1dG9BcHByb3ZlQWN0aW9ucyhjb21tYW5kTGluZSwgc3ViQ29tbWFuZHMsIGF1dG9BcHByb3ZlUmVzdWx0KTtcblx0XHRjb25zdCBzdWJDb21tYW5kQWN0aW9uID0gYWN0aW9ucy5maW5kKGFjdGlvbiA9PiBhY3Rpb24ubGFiZWwuaW5jbHVkZXMoJ212biB0ZXN0JykpO1xuXHRcdG9rKHN1YkNvbW1hbmRBY3Rpb24sICdTaG91bGQgc3VnZ2VzdCBtdm4gdGVzdCBhcHByb3ZhbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgc3VnZ2VzdCBtdm4gLURza2lwSVQgdGVzdCB3aGVuIGZsYWdzIGFwcGVhciBiZWZvcmUgc3ViY29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCBjb21tYW5kTGluZSA9ICdtdm4gLURza2lwSVQgdGVzdCc7XG5cdFx0Y29uc3Qgc3ViQ29tbWFuZHMgPSBbJ212biAtRHNraXBJVCB0ZXN0J107XG5cdFx0Y29uc3QgYXV0b0FwcHJvdmVSZXN1bHQgPSB7XG5cdFx0XHRzdWJDb21tYW5kUmVzdWx0czogW2NyZWF0ZU1vY2tSZXN1bHQoJ25vTWF0Y2gnLCAnbm90IGFwcHJvdmVkJyldLFxuXHRcdFx0Y29tbWFuZExpbmVSZXN1bHQ6IGNyZWF0ZU1vY2tSZXN1bHQoJ25vTWF0Y2gnLCAnbm90IGFwcHJvdmVkJylcblx0XHR9O1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdlbmVyYXRlQXV0b0FwcHJvdmVBY3Rpb25zKGNvbW1hbmRMaW5lLCBzdWJDb21tYW5kcywgYXV0b0FwcHJvdmVSZXN1bHQpO1xuXHRcdGNvbnN0IHN1YkNvbW1hbmRBY3Rpb24gPSBhY3Rpb25zLmZpbmQoYWN0aW9uID0+IGFjdGlvbi5sYWJlbC5pbmNsdWRlcygnbXZuIC1Ec2tpcElUIHRlc3QnKSk7XG5cdFx0b2soc3ViQ29tbWFuZEFjdGlvbiwgJ1Nob3VsZCBzdWdnZXN0IG12biAtRHNraXBJVCB0ZXN0IGFwcHJvdmFsIChpbmNsdWRpbmcgZmxhZ3MpJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBzdWdnZXN0IG12biAtWCAtRHNraXBJVCB0ZXN0IHdoZW4gbXVsdGlwbGUgZmxhZ3MgYXBwZWFyIGJlZm9yZSBzdWJjb21tYW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gJ212biAtWCAtRHNraXBJVCB0ZXN0Jztcblx0XHRjb25zdCBzdWJDb21tYW5kcyA9IFsnbXZuIC1YIC1Ec2tpcElUIHRlc3QnXTtcblx0XHRjb25zdCBhdXRvQXBwcm92ZVJlc3VsdCA9IHtcblx0XHRcdHN1YkNvbW1hbmRSZXN1bHRzOiBbY3JlYXRlTW9ja1Jlc3VsdCgnbm9NYXRjaCcsICdub3QgYXBwcm92ZWQnKV0sXG5cdFx0XHRjb21tYW5kTGluZVJlc3VsdDogY3JlYXRlTW9ja1Jlc3VsdCgnbm9NYXRjaCcsICdub3QgYXBwcm92ZWQnKVxuXHRcdH07XG5cblx0XHRjb25zdCBhY3Rpb25zID0gZ2VuZXJhdGVBdXRvQXBwcm92ZUFjdGlvbnMoY29tbWFuZExpbmUsIHN1YkNvbW1hbmRzLCBhdXRvQXBwcm92ZVJlc3VsdCk7XG5cdFx0Y29uc3Qgc3ViQ29tbWFuZEFjdGlvbiA9IGFjdGlvbnMuZmluZChhY3Rpb24gPT4gYWN0aW9uLmxhYmVsLmluY2x1ZGVzKCdtdm4gLVggLURza2lwSVQgdGVzdCcpKTtcblx0XHRvayhzdWJDb21tYW5kQWN0aW9uLCAnU2hvdWxkIHN1Z2dlc3QgbXZuIC1YIC1Ec2tpcElUIHRlc3QgYXBwcm92YWwgd2l0aCBtdWx0aXBsZSBmbGFncycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgc3VnZ2VzdCBncmFkbGUgLS1pbmZvIGJ1aWxkIHdoZW4gZmxhZ3MgYXBwZWFyIGJlZm9yZSBzdWJjb21tYW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gJ2dyYWRsZSAtLWluZm8gYnVpbGQnO1xuXHRcdGNvbnN0IHN1YkNvbW1hbmRzID0gWydncmFkbGUgLS1pbmZvIGJ1aWxkJ107XG5cdFx0Y29uc3QgYXV0b0FwcHJvdmVSZXN1bHQgPSB7XG5cdFx0XHRzdWJDb21tYW5kUmVzdWx0czogW2NyZWF0ZU1vY2tSZXN1bHQoJ25vTWF0Y2gnLCAnbm90IGFwcHJvdmVkJyldLFxuXHRcdFx0Y29tbWFuZExpbmVSZXN1bHQ6IGNyZWF0ZU1vY2tSZXN1bHQoJ25vTWF0Y2gnLCAnbm90IGFwcHJvdmVkJylcblx0XHR9O1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdlbmVyYXRlQXV0b0FwcHJvdmVBY3Rpb25zKGNvbW1hbmRMaW5lLCBzdWJDb21tYW5kcywgYXV0b0FwcHJvdmVSZXN1bHQpO1xuXHRcdGNvbnN0IHN1YkNvbW1hbmRBY3Rpb24gPSBhY3Rpb25zLmZpbmQoYWN0aW9uID0+IGFjdGlvbi5sYWJlbC5pbmNsdWRlcygnZ3JhZGxlIC0taW5mbyBidWlsZCcpKTtcblx0XHRvayhzdWJDb21tYW5kQWN0aW9uLCAnU2hvdWxkIHN1Z2dlc3QgZ3JhZGxlIC0taW5mbyBidWlsZCBhcHByb3ZhbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgc3VnZ2VzdCBucG0gLS1zaWxlbnQgcnVuIHRlc3Qgd2hlbiBmbGFncyBhcHBlYXIgYmVmb3JlIHN1YmNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWFuZExpbmUgPSAnbnBtIC0tc2lsZW50IHJ1biB0ZXN0Jztcblx0XHRjb25zdCBzdWJDb21tYW5kcyA9IFsnbnBtIC0tc2lsZW50IHJ1biB0ZXN0J107XG5cdFx0Y29uc3QgYXV0b0FwcHJvdmVSZXN1bHQgPSB7XG5cdFx0XHRzdWJDb21tYW5kUmVzdWx0czogW2NyZWF0ZU1vY2tSZXN1bHQoJ25vTWF0Y2gnLCAnbm90IGFwcHJvdmVkJyldLFxuXHRcdFx0Y29tbWFuZExpbmVSZXN1bHQ6IGNyZWF0ZU1vY2tSZXN1bHQoJ25vTWF0Y2gnLCAnbm90IGFwcHJvdmVkJylcblx0XHR9O1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdlbmVyYXRlQXV0b0FwcHJvdmVBY3Rpb25zKGNvbW1hbmRMaW5lLCBzdWJDb21tYW5kcywgYXV0b0FwcHJvdmVSZXN1bHQpO1xuXHRcdGNvbnN0IHN1YkNvbW1hbmRBY3Rpb24gPSBhY3Rpb25zLmZpbmQoYWN0aW9uID0+IGFjdGlvbi5sYWJlbC5pbmNsdWRlcygnbnBtIC0tc2lsZW50IHJ1biB0ZXN0JykpO1xuXHRcdG9rKHN1YkNvbW1hbmRBY3Rpb24sICdTaG91bGQgc3VnZ2VzdCBucG0gLS1zaWxlbnQgcnVuIHRlc3QgYXBwcm92YWwgKHN1Yi1zdWItY29tbWFuZCB3aXRoIGZsYWdzKScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgc3VnZ2VzdCBucG0gLS1zaWxlbnQgcnVuIC0tdmVyYm9zZSB0ZXN0IHdoZW4gZmxhZ3MgYXBwZWFyIGJldHdlZW4gc3ViY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWFuZExpbmUgPSAnbnBtIC0tc2lsZW50IHJ1biAtLXZlcmJvc2UgdGVzdCc7XG5cdFx0Y29uc3Qgc3ViQ29tbWFuZHMgPSBbJ25wbSAtLXNpbGVudCBydW4gLS12ZXJib3NlIHRlc3QnXTtcblx0XHRjb25zdCBhdXRvQXBwcm92ZVJlc3VsdCA9IHtcblx0XHRcdHN1YkNvbW1hbmRSZXN1bHRzOiBbY3JlYXRlTW9ja1Jlc3VsdCgnbm9NYXRjaCcsICdub3QgYXBwcm92ZWQnKV0sXG5cdFx0XHRjb21tYW5kTGluZVJlc3VsdDogY3JlYXRlTW9ja1Jlc3VsdCgnbm9NYXRjaCcsICdub3QgYXBwcm92ZWQnKVxuXHRcdH07XG5cblx0XHRjb25zdCBhY3Rpb25zID0gZ2VuZXJhdGVBdXRvQXBwcm92ZUFjdGlvbnMoY29tbWFuZExpbmUsIHN1YkNvbW1hbmRzLCBhdXRvQXBwcm92ZVJlc3VsdCk7XG5cdFx0Y29uc3Qgc3ViQ29tbWFuZEFjdGlvbiA9IGFjdGlvbnMuZmluZChhY3Rpb24gPT4gYWN0aW9uLmxhYmVsLmluY2x1ZGVzKCducG0gLS1zaWxlbnQgcnVuIC0tdmVyYm9zZSB0ZXN0JykpO1xuXHRcdG9rKHN1YkNvbW1hbmRBY3Rpb24sICdTaG91bGQgc3VnZ2VzdCBucG0gLS1zaWxlbnQgcnVuIC0tdmVyYm9zZSB0ZXN0IHdpdGggZmxhZ3MgYmV0d2VlbiBzdWJjb21tYW5kcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbm90IHN1Z2dlc3QgYXBwcm92YWwgd2hlbiBvbmx5IGZsYWdzIGFuZCBubyBzdWJjb21tYW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gJ212biAtWCAtRHNraXBJVCc7XG5cdFx0Y29uc3Qgc3ViQ29tbWFuZHMgPSBbJ212biAtWCAtRHNraXBJVCddO1xuXHRcdGNvbnN0IGF1dG9BcHByb3ZlUmVzdWx0ID0ge1xuXHRcdFx0c3ViQ29tbWFuZFJlc3VsdHM6IFtjcmVhdGVNb2NrUmVzdWx0KCdub01hdGNoJywgJ25vdCBhcHByb3ZlZCcpXSxcblx0XHRcdGNvbW1hbmRMaW5lUmVzdWx0OiBjcmVhdGVNb2NrUmVzdWx0KCdub01hdGNoJywgJ25vdCBhcHByb3ZlZCcpXG5cdFx0fTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZW5lcmF0ZUF1dG9BcHByb3ZlQWN0aW9ucyhjb21tYW5kTGluZSwgc3ViQ29tbWFuZHMsIGF1dG9BcHByb3ZlUmVzdWx0KTtcblx0XHRjb25zdCBzdWJDb21tYW5kQWN0aW9uID0gYWN0aW9ucy5maW5kKGFjdGlvbiA9PiBhY3Rpb24ubGFiZWwuaW5jbHVkZXMoJ0Fsd2F5cyBBbGxvdyBDb21tYW5kOicpICYmIGFjdGlvbi5sYWJlbC5pbmNsdWRlcygnbXZuJykpO1xuXHRcdHN0cmljdEVxdWFsKHN1YkNvbW1hbmRBY3Rpb24sIHVuZGVmaW5lZCwgJ1Nob3VsZCBub3Qgc3VnZ2VzdCBtdm4gYXBwcm92YWwgd2hlbiBubyBzdWJjb21tYW5kIGZvdW5kJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBzdWdnZXN0IGV4YWN0IGNvbW1hbmQgbGluZSB3aGVuIHN1YmNvbW1hbmQgY2Fubm90IGJlIGV4dHJhY3RlZCcsICgpID0+IHtcblx0XHRjb25zdCBjb21tYW5kTGluZSA9ICdtdm4gLVggLURza2lwSVQnO1xuXHRcdGNvbnN0IHN1YkNvbW1hbmRzID0gWydtdm4gLVggLURza2lwSVQnXTtcblx0XHRjb25zdCBhdXRvQXBwcm92ZVJlc3VsdCA9IHtcblx0XHRcdHN1YkNvbW1hbmRSZXN1bHRzOiBbY3JlYXRlTW9ja1Jlc3VsdCgnbm9NYXRjaCcsICdub3QgYXBwcm92ZWQnKV0sXG5cdFx0XHRjb21tYW5kTGluZVJlc3VsdDogY3JlYXRlTW9ja1Jlc3VsdCgnbm9NYXRjaCcsICdub3QgYXBwcm92ZWQnKVxuXHRcdH07XG5cblx0XHRjb25zdCBhY3Rpb25zID0gZ2VuZXJhdGVBdXRvQXBwcm92ZUFjdGlvbnMoY29tbWFuZExpbmUsIHN1YkNvbW1hbmRzLCBhdXRvQXBwcm92ZVJlc3VsdCk7XG5cdFx0Y29uc3QgZXhhY3RDb21tYW5kQWN0aW9uID0gYWN0aW9ucy5maW5kKGFjdGlvbiA9PiBhY3Rpb24ubGFiZWwuaW5jbHVkZXMoJ0Fsd2F5cyBBbGxvdyBFeGFjdCBDb21tYW5kIExpbmUnKSk7XG5cdFx0b2soZXhhY3RDb21tYW5kQWN0aW9uLCAnU2hvdWxkIHN1Z2dlc3QgZXhhY3QgY29tbWFuZCBsaW5lIGFwcHJvdmFsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbXVsdGlwbGUgc3ViY29tbWFuZHMgd2l0aCBmbGFncycsICgpID0+IHtcblx0XHRjb25zdCBjb21tYW5kTGluZSA9ICdtdm4gLURza2lwSVQgdGVzdCAmJiBncmFkbGUgLS1pbmZvIGJ1aWxkJztcblx0XHRjb25zdCBzdWJDb21tYW5kcyA9IFsnbXZuIC1Ec2tpcElUIHRlc3QnLCAnZ3JhZGxlIC0taW5mbyBidWlsZCddO1xuXHRcdGNvbnN0IGF1dG9BcHByb3ZlUmVzdWx0ID0ge1xuXHRcdFx0c3ViQ29tbWFuZFJlc3VsdHM6IFtcblx0XHRcdFx0Y3JlYXRlTW9ja1Jlc3VsdCgnbm9NYXRjaCcsICdub3QgYXBwcm92ZWQnKSxcblx0XHRcdFx0Y3JlYXRlTW9ja1Jlc3VsdCgnbm9NYXRjaCcsICdub3QgYXBwcm92ZWQnKVxuXHRcdFx0XSxcblx0XHRcdGNvbW1hbmRMaW5lUmVzdWx0OiBjcmVhdGVNb2NrUmVzdWx0KCdub01hdGNoJywgJ25vdCBhcHByb3ZlZCcpXG5cdFx0fTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZW5lcmF0ZUF1dG9BcHByb3ZlQWN0aW9ucyhjb21tYW5kTGluZSwgc3ViQ29tbWFuZHMsIGF1dG9BcHByb3ZlUmVzdWx0KTtcblx0XHRjb25zdCBzdWJDb21tYW5kQWN0aW9uID0gYWN0aW9ucy5maW5kKGFjdGlvbiA9PlxuXHRcdFx0YWN0aW9uLmxhYmVsLmluY2x1ZGVzKCdtdm4gLURza2lwSVQgdGVzdCcpICYmIGFjdGlvbi5sYWJlbC5pbmNsdWRlcygnZ3JhZGxlIC0taW5mbyBidWlsZCcpXG5cdFx0KTtcblx0XHRvayhzdWJDb21tYW5kQWN0aW9uLCAnU2hvdWxkIHN1Z2dlc3QgYm90aCBtdm4gLURza2lwSVQgdGVzdCBhbmQgZ3JhZGxlIC0taW5mbyBidWlsZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbm90IHN1Z2dlc3Qgd2hlbiBjb21tYW5kcyBhcmUgZGVuaWVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gJ212biAtRHNraXBJVCB0ZXN0Jztcblx0XHRjb25zdCBzdWJDb21tYW5kcyA9IFsnbXZuIC1Ec2tpcElUIHRlc3QnXTtcblx0XHRjb25zdCBhdXRvQXBwcm92ZVJlc3VsdCA9IHtcblx0XHRcdHN1YkNvbW1hbmRSZXN1bHRzOiBbY3JlYXRlTW9ja1Jlc3VsdCgnZGVuaWVkJywgJ2RlbmllZCBieSBydWxlJywgY3JlYXRlTW9ja1J1bGUoJ212biB0ZXN0JykpXSxcblx0XHRcdGNvbW1hbmRMaW5lUmVzdWx0OiBjcmVhdGVNb2NrUmVzdWx0KCdub01hdGNoJywgJ25vdCBhcHByb3ZlZCcpXG5cdFx0fTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZW5lcmF0ZUF1dG9BcHByb3ZlQWN0aW9ucyhjb21tYW5kTGluZSwgc3ViQ29tbWFuZHMsIGF1dG9BcHByb3ZlUmVzdWx0KTtcblx0XHRjb25zdCBzdWJDb21tYW5kQWN0aW9uID0gYWN0aW9ucy5maW5kKGFjdGlvbiA9PiBhY3Rpb24ubGFiZWwuaW5jbHVkZXMoJ0Fsd2F5cyBBbGxvdyBDb21tYW5kOicpKTtcblx0XHRzdHJpY3RFcXVhbChzdWJDb21tYW5kQWN0aW9uLCB1bmRlZmluZWQsICdTaG91bGQgbm90IHN1Z2dlc3QgYXBwcm92YWwgZm9yIGRlbmllZCBjb21tYW5kcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbm90IHN1Z2dlc3Qgd2hlbiBjb21tYW5kcyBhcmUgYWxyZWFkeSBhcHByb3ZlZCcsICgpID0+IHtcblx0XHRjb25zdCBjb21tYW5kTGluZSA9ICdtdm4gLURza2lwSVQgdGVzdCc7XG5cdFx0Y29uc3Qgc3ViQ29tbWFuZHMgPSBbJ212biAtRHNraXBJVCB0ZXN0J107XG5cdFx0Y29uc3QgYXV0b0FwcHJvdmVSZXN1bHQgPSB7XG5cdFx0XHRzdWJDb21tYW5kUmVzdWx0czogW2NyZWF0ZU1vY2tSZXN1bHQoJ2FwcHJvdmVkJywgJ2FwcHJvdmVkIGJ5IHJ1bGUnLCBjcmVhdGVNb2NrUnVsZSgnbXZuIHRlc3QnKSldLFxuXHRcdFx0Y29tbWFuZExpbmVSZXN1bHQ6IGNyZWF0ZU1vY2tSZXN1bHQoJ25vTWF0Y2gnLCAnbm90IGFwcHJvdmVkJylcblx0XHR9O1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdlbmVyYXRlQXV0b0FwcHJvdmVBY3Rpb25zKGNvbW1hbmRMaW5lLCBzdWJDb21tYW5kcywgYXV0b0FwcHJvdmVSZXN1bHQpO1xuXHRcdGNvbnN0IHN1YkNvbW1hbmRBY3Rpb24gPSBhY3Rpb25zLmZpbmQoYWN0aW9uID0+IGFjdGlvbi5sYWJlbC5pbmNsdWRlcygnbXZuIC1Ec2tpcElUIHRlc3QnKSAmJiBhY3Rpb24ubGFiZWwuaW5jbHVkZXMoJ0Fsd2F5cyBBbGxvdyBDb21tYW5kOicpKTtcblx0XHRzdHJpY3RFcXVhbChzdWJDb21tYW5kQWN0aW9uLCB1bmRlZmluZWQsICdTaG91bGQgbm90IHN1Z2dlc3QgYXBwcm92YWwgZm9yIGFscmVhZHkgYXBwcm92ZWQgY29tbWFuZHMnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIG5vdCBpbmNsdWRlIHNlc3Npb24tc2NvcGVkIGFjdGlvbnMgd2hlbiBza2lwU2Vzc2lvblNjb3BlZCBpcyBzZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWFuZExpbmUgPSAnbXZuIHRlc3QnO1xuXHRcdGNvbnN0IHN1YkNvbW1hbmRzID0gWydtdm4gdGVzdCddO1xuXHRcdGNvbnN0IGF1dG9BcHByb3ZlUmVzdWx0ID0ge1xuXHRcdFx0c3ViQ29tbWFuZFJlc3VsdHM6IFtjcmVhdGVNb2NrUmVzdWx0KCdub01hdGNoJywgJ25vdCBhcHByb3ZlZCcpXSxcblx0XHRcdGNvbW1hbmRMaW5lUmVzdWx0OiBjcmVhdGVNb2NrUmVzdWx0KCdub01hdGNoJywgJ25vdCBhcHByb3ZlZCcpXG5cdFx0fTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZW5lcmF0ZUF1dG9BcHByb3ZlQWN0aW9ucyhjb21tYW5kTGluZSwgc3ViQ29tbWFuZHMsIGF1dG9BcHByb3ZlUmVzdWx0LCB7IHNraXBTZXNzaW9uU2NvcGVkOiB0cnVlIH0pO1xuXHRcdGRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLm1hcChhY3Rpb24gPT4gYWN0aW9uIGluc3RhbmNlb2YgU2VwYXJhdG9yID8gJy0tLScgOiBhY3Rpb24ubGFiZWwpLCBbXG5cdFx0XHQnQWxsb3cgYG12biB0ZXN0IFx1MjAyNmAgaW4gdGhpcyBXb3Jrc3BhY2UnLFxuXHRcdFx0J0Fsd2F5cyBBbGxvdyBgbXZuIHRlc3QgXHUyMDI2YCcsXG5cdFx0XHQnLS0tJyxcblx0XHRcdCdBbGxvdyBFeGFjdCBDb21tYW5kIExpbmUgaW4gdGhpcyBXb3Jrc3BhY2UnLFxuXHRcdFx0J0Fsd2F5cyBBbGxvdyBFeGFjdCBDb21tYW5kIExpbmUnLFxuXHRcdFx0Jy0tLScsXG5cdFx0XHQnQ29uZmlndXJlIEF1dG8gQXBwcm92ZS4uLicsXG5cdFx0XSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdleHRyYWN0Q2RQcmVmaXgnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdQb3NpeCcsICgpID0+IHtcblx0XHRmdW5jdGlvbiB0KGNvbW1hbmRMaW5lOiBzdHJpbmcsIGV4cGVjdGVkRGlyOiBzdHJpbmcgfCB1bmRlZmluZWQsIGV4cGVjdGVkQ29tbWFuZDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0Q2RQcmVmaXgoY29tbWFuZExpbmUsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdD8uZGlyZWN0b3J5LCBleHBlY3RlZERpcik7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LmNvbW1hbmQsIGV4cGVjdGVkQ29tbWFuZCk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgd2hlbiBubyBjZCBwcmVmaXgnLCAoKSA9PiB0KCdlY2hvIGhlbGxvJywgdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCB3aGVuIGNkIGhhcyBubyBzdWZmaXgnLCAoKSA9PiB0KCdjZCAvc29tZS9wYXRoJywgdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBjZCBwcmVmaXggd2l0aCAmJiBzZXBhcmF0b3InLCAoKSA9PiB0KCdjZCAvc29tZS9wYXRoICYmIG5wbSBpbnN0YWxsJywgJy9zb21lL3BhdGgnLCAnbnBtIGluc3RhbGwnKSk7XG5cdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgcXVvdGVkIHBhdGgnLCAoKSA9PiB0KCdjZCBcIi9zb21lL3BhdGhcIiAmJiBucG0gaW5zdGFsbCcsICcvc29tZS9wYXRoJywgJ25wbSBpbnN0YWxsJykpO1xuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IGNvbXBsZXggc3VmZml4JywgKCkgPT4gdCgnY2QgL3BhdGggJiYgbnBtIGluc3RhbGwgJiYgbnBtIHRlc3QnLCAnL3BhdGgnLCAnbnBtIGluc3RhbGwgJiYgbnBtIHRlc3QnKSk7XG5cblx0XHRzdWl0ZSgndW5zdXBwb3J0ZWQgcGF0dGVybnMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBmb3IgcGF0aCB3aXRoIGVzY2FwZWQgc3BhY2UnLCAoKSA9PiB0KCdjZCAvc29tZS9wYXRoXFwgd2l0aFxcIHNwYWNlcyAmJiBucG0gaW5zdGFsbCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdQb3dlclNoZWxsJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIHQoY29tbWFuZExpbmU6IHN0cmluZywgZXhwZWN0ZWREaXI6IHN0cmluZyB8IHVuZGVmaW5lZCwgZXhwZWN0ZWRDb21tYW5kOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RDZFByZWZpeChjb21tYW5kTGluZSwgJ3B3c2gnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LmRpcmVjdG9yeSwgZXhwZWN0ZWREaXIpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0Py5jb21tYW5kLCBleHBlY3RlZENvbW1hbmQpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IGNkIHdpdGggOyBzZXBhcmF0b3InLCAoKSA9PiB0KCdjZCBDOlxcXFxwYXRoOyBucG0gdGVzdCcsICdDOlxcXFxwYXRoJywgJ25wbSB0ZXN0JykpO1xuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IGNkIC9kIHdpdGggJiYgc2VwYXJhdG9yJywgKCkgPT4gdCgnY2QgL2QgQzpcXFxccGF0aCAmJiBlY2hvIGhlbGxvJywgJ0M6XFxcXHBhdGgnLCAnZWNobyBoZWxsbycpKTtcblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBTZXQtTG9jYXRpb24nLCAoKSA9PiB0KCdTZXQtTG9jYXRpb24gQzpcXFxccGF0aDsgbnBtIHRlc3QnLCAnQzpcXFxccGF0aCcsICducG0gdGVzdCcpKTtcblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBTZXQtTG9jYXRpb24gLVBhdGgnLCAoKSA9PiB0KCdTZXQtTG9jYXRpb24gLVBhdGggQzpcXFxccGF0aDsgbnBtIHRlc3QnLCAnQzpcXFxccGF0aCcsICducG0gdGVzdCcpKTtcblxuXHRcdHN1aXRlKCd1bnN1cHBvcnRlZCBwYXR0ZXJucycsICgpID0+IHtcblx0XHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIGZvciBxdW90ZWQgcGF0aCB3aXRoIHNwYWNlcycsICgpID0+IHQoJ2NkIFwiQzpcXFxccGF0aCB3aXRoIHNwYWNlc1wiOyBucG0gdGVzdCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdub3JtYWxpemVDb21tYW5kRm9yRXhlY3V0aW9uJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzaG91bGQgY29sbGFwc2UgbmV3bGluZXMgdG8gc3BhY2VzIGZvciBzaW1wbGUgY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0c3RyaWN0RXF1YWwobm9ybWFsaXplQ29tbWFuZEZvckV4ZWN1dGlvbignZWNobyBoZWxsb1xcbmVjaG8gd29ybGQnKSwgJ2VjaG8gaGVsbG8gZWNobyB3b3JsZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgY29sbGFwc2UgXFxcXHJcXFxcbiB0byBzcGFjZXMnLCAoKSA9PiB7XG5cdFx0c3RyaWN0RXF1YWwobm9ybWFsaXplQ29tbWFuZEZvckV4ZWN1dGlvbignZWNobyBhXFxyXFxuZWNobyBiJyksICdlY2hvIGEgZWNobyBiJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBjb2xsYXBzZSBcXFxcciB0byBzcGFjZXMnLCAoKSA9PiB7XG5cdFx0c3RyaWN0RXF1YWwobm9ybWFsaXplQ29tbWFuZEZvckV4ZWN1dGlvbignZWNobyBhXFxyZWNobyBiJyksICdlY2hvIGEgZWNobyBiJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCB0cmltIHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0c3RyaWN0RXF1YWwobm9ybWFsaXplQ29tbWFuZEZvckV4ZWN1dGlvbignICBlY2hvIGhlbGxvICAnKSwgJ2VjaG8gaGVsbG8nKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGhhbmRsZSBzaW5nbGUtbGluZSBjb21tYW5kJywgKCkgPT4ge1xuXHRcdHN0cmljdEVxdWFsKG5vcm1hbGl6ZUNvbW1hbmRGb3JFeGVjdXRpb24oJ2xzIC1sYScpLCAnbHMgLWxhJyk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdpc011bHRpbGluZUNvbW1hbmQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gdHJ1ZSBmb3IgaGVyZWRvYycsICgpID0+IHtcblx0XHRzdHJpY3RFcXVhbChpc011bHRpbGluZUNvbW1hbmQoJ2NhdCA+IGZpbGUudHh0IDw8IFxcJ0VPRlxcJ1xcbmhlbGxvIHdvcmxkXFxuRU9GJyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIHRydWUgZm9yIG11bHRpLXN0YXRlbWVudCB3aXRoIFxcXFxuJywgKCkgPT4ge1xuXHRcdHN0cmljdEVxdWFsKGlzTXVsdGlsaW5lQ29tbWFuZCgnZWNobyBoZWxsb1xcbmVjaG8gd29ybGQnKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gdHJ1ZSBmb3IgbXVsdGktc3RhdGVtZW50IHdpdGggXFxcXHJcXFxcbicsICgpID0+IHtcblx0XHRzdHJpY3RFcXVhbChpc011bHRpbGluZUNvbW1hbmQoJ2VjaG8gaGVsbG9cXHJcXG5lY2hvIHdvcmxkJyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIGZhbHNlIGZvciBzaW5nbGUtbGluZSBjb21tYW5kJywgKCkgPT4ge1xuXHRcdHN0cmljdEVxdWFsKGlzTXVsdGlsaW5lQ29tbWFuZCgnbHMgLWxhJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHVybiBmYWxzZSBmb3IgbGluZSBjb250aW51YXRpb24gd2l0aCBiYWNrc2xhc2gtbmV3bGluZScsICgpID0+IHtcblx0XHRzdHJpY3RFcXVhbChpc011bHRpbGluZUNvbW1hbmQoJ2VjaG8gaGVsbG8gXFxcXFxcbiAgd29ybGQnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIGZhbHNlIGZvciBsaW5lIGNvbnRpbnVhdGlvbiB3aXRoIGJhY2tzbGFzaC1jcmxmJywgKCkgPT4ge1xuXHRcdHN0cmljdEVxdWFsKGlzTXVsdGlsaW5lQ29tbWFuZCgnZWNobyBoZWxsbyBcXFxcXFxyXFxuICB3b3JsZCcpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gdHJ1ZSB3aGVuIGNvbnRpbnVhdGlvbiBhbmQgYmFyZSBuZXdsaW5lIGFyZSBtaXhlZCcsICgpID0+IHtcblx0XHRzdHJpY3RFcXVhbChpc011bHRpbGluZUNvbW1hbmQoJ2VjaG8gaGVsbG8gXFxcXFxcbiAgd29ybGRcXG5lY2hvIGRvbmUnKSwgdHJ1ZSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdidWlsZENvbW1hbmREaXNwbGF5VGV4dCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc2hvdWxkIGNvbGxhcHNlIG5ld2xpbmVzIChpbmNsdWRpbmcgYmxhbmsgbGluZXMpIHRvIHNwYWNlcycsICgpID0+IHtcblx0XHRzdHJpY3RFcXVhbChidWlsZENvbW1hbmREaXNwbGF5VGV4dCgnZWNobyBhXFxuXFxuZWNobyBiJyksICdlY2hvIGEgIGVjaG8gYicpO1xuXHRcdHN0cmljdEVxdWFsKGJ1aWxkQ29tbWFuZERpc3BsYXlUZXh0KCdlY2hvIGFcXHJcXG5lY2hvIGInKSwgJ2VjaG8gYSBlY2hvIGInKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHRydW5jYXRlIGxvbmcgY29tbWFuZHMgdG8gODAgY2hhcmFjdGVycycsICgpID0+IHtcblx0XHRjb25zdCBsb25nID0gJ2EnLnJlcGVhdCgyMDApO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGJ1aWxkQ29tbWFuZERpc3BsYXlUZXh0KGxvbmcpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDgwKTtcblx0XHRvayhyZXN1bHQuZW5kc1dpdGgoJy4uLicpKTtcblx0fSk7XG5cblx0Ly8gUmVncmVzc2lvbiB0ZXN0IGZvciAjMzE4NjAxOiBzeXN0ZW0gbm90aWZpY2F0aW9uIGxhYmVscyB1c2VkIHRvIHdyYXAgdGhlXG5cdC8vIHJhdyBjb21tYW5kIGluIGEgc2luZ2xlLWJhY2t0aWNrIGlubGluZSBjb2RlIHNwYW4uIE11bHRpLWxpbmUgY29tbWFuZHNcblx0Ly8gKHdoaWNoIGNvbnRhaW4gYmxhbmsgbGluZXMpIGJyb2tlIHRoZSBjb2RlIHNwYW4gYW5kIHJlbmRlcmVkIHRoZSBsZWFkaW5nXG5cdC8vIGJhY2t0aWNrIGxpdGVyYWxseS4gVGhlIGNvbW1hbmQgbXVzdCBiZSBjb2xsYXBzZWQgdG8gYSBzaW5nbGUgbGluZSBhbmRcblx0Ly8gc2FmZWx5IGZlbmNlZCBzbyBpdCBhbHdheXMgcmVuZGVycyBhcyBpbmxpbmUgY29kZS5cblx0dGVzdCgnbXVsdGktbGluZSBjb21tYW5kIHJlbmRlcnMgYXMgaW5saW5lIGNvZGUgKG5vdCBhIGxpdGVyYWwgYmFja3RpY2spJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9wdHM6IG1hcmtlZC5NYXJrZWRPcHRpb25zID0geyBnZm06IHRydWUsIGJyZWFrczogdHJ1ZSB9O1xuXHRcdGNvbnN0IHJlbmRlciA9ICh2YWx1ZTogc3RyaW5nKSA9PiBtYXJrZWQucGFyc2VyKG1hcmtlZC5sZXhlcih2YWx1ZSwgb3B0cyksIG9wdHMpO1xuXG5cdFx0Y29uc3QgbXVsdGlsaW5lQ29tbWFuZCA9ICdybSAtcmYgLnBsYXl3cmlnaHQtY2xpL1xcblxcbm1vcmUgdGV4dCc7XG5cdFx0Y29uc3QgbGFiZWwgPSBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKGJ1aWxkQ29tbWFuZERpc3BsYXlUZXh0KG11bHRpbGluZUNvbW1hbmQpKSArICcgY29tcGxldGVkJztcblx0XHRjb25zdCBodG1sID0gcmVuZGVyKGxhYmVsKTtcblxuXHRcdG9rKGh0bWwuaW5jbHVkZXMoJzxjb2RlPicpLCBgZXhwZWN0ZWQgYSBjb2RlIHNwYW4sIGdvdDogJHtodG1sfWApO1xuXHRcdG9rKCEvPHA+YC8udGVzdChodG1sKSwgYGV4cGVjdGVkIG5vIGxpdGVyYWwgbGVhZGluZyBiYWNrdGljaywgZ290OiAke2h0bWx9YCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdidWlsZENvbXBsZXRpb25Ob3RpZmljYXRpb25Db21tYW5kJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdsZWF2ZXMgc2luZ2xlLWxpbmUgY29tbWFuZHMgdW5jaGFuZ2VkJywgKCkgPT4ge1xuXHRcdHN0cmljdEVxdWFsKGJ1aWxkQ29tcGxldGlvbk5vdGlmaWNhdGlvbkNvbW1hbmQoJ2VjaG8gaGVsbG8nKSwgJ2VjaG8gaGVsbG8nKTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgb25seSB0aGUgZmlyc3QgbGluZSBhbmQgYXBwZW5kcyBhIGhvcml6b250YWwgZWxsaXBzaXMgZm9yIG11bHRpLWxpbmUgY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0c3RyaWN0RXF1YWwoYnVpbGRDb21wbGV0aW9uTm90aWZpY2F0aW9uQ29tbWFuZCgnZWNobyBhXFxuZWNobyBiJyksICdlY2hvIGFcdTIwMjYnKTtcblx0XHRzdHJpY3RFcXVhbChidWlsZENvbXBsZXRpb25Ob3RpZmljYXRpb25Db21tYW5kKCdlY2hvIGFcXG5cXG5lY2hvIGInKSwgJ2VjaG8gYVx1MjAyNicpO1xuXHRcdHN0cmljdEVxdWFsKGJ1aWxkQ29tcGxldGlvbk5vdGlmaWNhdGlvbkNvbW1hbmQoJ2VjaG8gYVxcclxcbmVjaG8gYicpLCAnZWNobyBhXHUyMDI2Jyk7XG5cdFx0c3RyaWN0RXF1YWwoYnVpbGRDb21wbGV0aW9uTm90aWZpY2F0aW9uQ29tbWFuZCgnZWNobyBhXFxyZWNobyBiJyksICdlY2hvIGFcdTIwMjYnKTtcblx0fSk7XG5cblx0dGVzdCgndHJ1bmNhdGVzIGEgbG9uZyBmaXJzdCBsaW5lIHRvIDgwIGNoYXJhY3RlcnMgdXNpbmcgYSBzaW5nbGUgaG9yaXpvbnRhbCBlbGxpcHNpcycsICgpID0+IHtcblx0XHRjb25zdCBsb25nRmlyc3RMaW5lID0gJ2EnLnJlcGVhdCgyMDApO1xuXHRcdGNvbnN0IG11bHRpTGluZSA9IGxvbmdGaXJzdExpbmUgKyAnXFxuaWdub3JlZCc7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYnVpbGRDb21wbGV0aW9uTm90aWZpY2F0aW9uQ29tbWFuZChtdWx0aUxpbmUpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDgwKTtcblx0XHRvayhyZXN1bHQuZW5kc1dpdGgoJ1x1MjAyNicpLCBgZXhwZWN0ZWQgZWxsaXBzaXMgc3VmZml4LCBnb3Q6ICR7cmVzdWx0fWApO1xuXHRcdG9rKCFyZXN1bHQuZW5kc1dpdGgoJ1x1MjAyNlx1MjAyNicpLCBgZXhwZWN0ZWQgc2luZ2xlIGVsbGlwc2lzIHN1ZmZpeCwgZ290OiAke3Jlc3VsdH1gKTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIGVzY2FwZSBhcnRpZmFjdHMgZnJvbSB0aGUgZmlyc3QgbGluZScsICgpID0+IHtcblx0XHRzdHJpY3RFcXVhbChidWlsZENvbXBsZXRpb25Ob3RpZmljYXRpb25Db21tYW5kKCdlY2hvIFxcXFxcImhpXFxcXFwiXFxuZWNobyBpZ25vcmVkJyksICdlY2hvIFwiaGlcIlx1MjAyNicpO1xuXHR9KTtcblxuXHQvLyBSZWdyZXNzaW9uIHRlc3QgZm9yICMzMTg2MDE6IHRoZSBmaW5hbCBsYWJlbCBtdXN0IHJlbmRlciBhcyBpbmxpbmUgY29kZVxuXHQvLyAobm8gbGl0ZXJhbCBiYWNrdGlja3MpIHdoZW4gZmVkIHRvIHRoZSBtYXJrZG93biByZW5kZXJlciB3cmFwcGVkIHdpdGhcblx0Ly8gYGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGVgLlxuXHR0ZXN0KCdyZXN1bHQgcmVuZGVycyBhcyBpbmxpbmUgY29kZSB3aGVuIHdyYXBwZWQgd2l0aCBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9wdHM6IG1hcmtlZC5NYXJrZWRPcHRpb25zID0geyBnZm06IHRydWUsIGJyZWFrczogdHJ1ZSB9O1xuXHRcdGNvbnN0IHJlbmRlciA9ICh2YWx1ZTogc3RyaW5nKSA9PiBtYXJrZWQucGFyc2VyKG1hcmtlZC5sZXhlcih2YWx1ZSwgb3B0cyksIG9wdHMpO1xuXG5cdFx0Y29uc3QgbXVsdGlsaW5lQ29tbWFuZCA9ICdybSAtcmYgLnBsYXl3cmlnaHQtY2xpL1xcblxcbm1vcmUgdGV4dCc7XG5cdFx0Y29uc3QgbGFiZWwgPSBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKGJ1aWxkQ29tcGxldGlvbk5vdGlmaWNhdGlvbkNvbW1hbmQobXVsdGlsaW5lQ29tbWFuZCkpICsgJyBjb21wbGV0ZWQnO1xuXHRcdGNvbnN0IGh0bWwgPSByZW5kZXIobGFiZWwpO1xuXG5cdFx0b2soaHRtbC5pbmNsdWRlcygnPGNvZGU+JyksIGBleHBlY3RlZCBhIGNvZGUgc3BhbiwgZ290OiAke2h0bWx9YCk7XG5cdFx0b2soIS88cD5gLy50ZXN0KGh0bWwpLCBgZXhwZWN0ZWQgbm8gbGl0ZXJhbCBsZWFkaW5nIGJhY2t0aWNrLCBnb3Q6ICR7aHRtbH1gKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCLElBQUksbUJBQW1CO0FBQ2pELFNBQVMsaUJBQWlCO0FBQzFCLFlBQVksWUFBWTtBQUN4QixTQUFTLHVDQUF1QztBQUNoRCxTQUFTLDRCQUE0QixvQkFBb0IsYUFBYSxjQUFjLDJCQUEyQixpQkFBaUIsb0NBQW9DLDhCQUE4QixvQkFBb0IsK0JBQStCO0FBQ3JQLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMseUJBQWdEO0FBRXpELE1BQU0sZ0JBQWdCLE1BQU07QUFDM0IsMENBQXdDO0FBRXhDLFFBQU0sMEJBQTBCLE1BQU07QUFDckMsU0FBSyxnQ0FBZ0MsTUFBTTtBQUMxQyxT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
