import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { TerminalChatAgentToolsSettingId } from "../../common/terminalChatAgentToolsConfiguration.js";
import { ConfigurationTarget } from "../../../../../../platform/configuration/common/configuration.js";
import { ok, strictEqual } from "assert";
import { CommandLineAutoApprover } from "../../browser/tools/commandLineAnalyzer/autoApprove/commandLineAutoApprover.js";
import { isAutoApproveRule } from "../../browser/tools/commandLineAnalyzer/commandLineAnalyzer.js";
suite("CommandLineAutoApprover", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationService;
  let commandLineAutoApprover;
  let shell;
  let os;
  setup(() => {
    configurationService = new TestConfigurationService();
    instantiationService = workbenchInstantiationService({
      configurationService: () => configurationService
    }, store);
    shell = "bash";
    os = OperatingSystem.Linux;
    commandLineAutoApprover = store.add(instantiationService.createInstance(CommandLineAutoApprover));
  });
  function setAutoApprove(value) {
    setConfig(TerminalChatAgentToolsSettingId.AutoApprove, value);
  }
  function setAutoApproveWithCommandLine(value) {
    setConfig(TerminalChatAgentToolsSettingId.AutoApprove, value);
  }
  function setConfig(key, value) {
    configurationService.setUserConfiguration(key, value);
    configurationService.onDidChangeConfigurationEmitter.fire({
      affectsConfiguration: () => true,
      affectedKeys: /* @__PURE__ */ new Set([key]),
      source: ConfigurationTarget.USER,
      change: null
    });
  }
  async function isAutoApproved(commandLine) {
    return (await commandLineAutoApprover.isCommandAutoApproved(commandLine, shell, os, void 0)).result === "approved";
  }
  function isCommandLineAutoApproved(commandLine) {
    return commandLineAutoApprover.isCommandLineAutoApproved(commandLine).result === "approved";
  }
  suite("autoApprove with allow patterns only", () => {
    test("should auto-approve exact command match", async () => {
      setAutoApprove({
        "echo": true
      });
      ok(await isAutoApproved("echo"));
    });
    test("should auto-approve command with arguments", async () => {
      setAutoApprove({
        "echo": true
      });
      ok(await isAutoApproved("echo hello world"));
    });
    test("should not auto-approve when there is no match", async () => {
      setAutoApprove({
        "echo": true
      });
      ok(!await isAutoApproved("ls"));
    });
    test("should not auto-approve partial command matches", async () => {
      setAutoApprove({
        "echo": true
      });
      ok(!await isAutoApproved("echotest"));
    });
    test("should handle multiple commands in autoApprove", async () => {
      setAutoApprove({
        "echo": true,
        "ls": true,
        "pwd": true
      });
      ok(await isAutoApproved("echo"));
      ok(await isAutoApproved("ls -la"));
      ok(await isAutoApproved("pwd"));
      ok(!await isAutoApproved("rm"));
    });
  });
  suite("autoApprove with deny patterns only", () => {
    test("should deny commands in autoApprove", async () => {
      setAutoApprove({
        "rm": false,
        "del": false
      });
      ok(!await isAutoApproved("rm file.txt"));
      ok(!await isAutoApproved("del file.txt"));
    });
    test("should not auto-approve safe commands when no allow patterns are present", async () => {
      setAutoApprove({
        "rm": false
      });
      ok(!await isAutoApproved("echo hello"));
      ok(!await isAutoApproved("ls"));
    });
  });
  suite("autoApprove with mixed allow and deny patterns", () => {
    test("should deny commands set to false even if other commands are set to true", async () => {
      setAutoApprove({
        "echo": true,
        "rm": false
      });
      ok(await isAutoApproved("echo hello"));
      ok(!await isAutoApproved("rm file.txt"));
    });
    test("should auto-approve allow patterns not set to false", async () => {
      setAutoApprove({
        "echo": true,
        "ls": true,
        "pwd": true,
        "rm": false,
        "del": false
      });
      ok(await isAutoApproved("echo"));
      ok(await isAutoApproved("ls"));
      ok(await isAutoApproved("pwd"));
      ok(!await isAutoApproved("rm"));
      ok(!await isAutoApproved("del"));
    });
  });
  suite("regex patterns", () => {
    test("should handle /.*/", async () => {
      setAutoApprove({
        "/.*/": true
      });
      ok(await isAutoApproved("echo hello"));
    });
    test("should handle regex patterns in autoApprove", async () => {
      setAutoApprove({
        "/^echo/": true,
        "/^ls/": true,
        "pwd": true
      });
      ok(await isAutoApproved("echo hello"));
      ok(await isAutoApproved("ls -la"));
      ok(await isAutoApproved("pwd"));
      ok(!await isAutoApproved("rm file"));
    });
    test("should handle regex patterns for deny", async () => {
      setAutoApprove({
        "echo": true,
        "rm": true,
        "/^rm\\s+/": false,
        "/^del\\s+/": false
      });
      ok(await isAutoApproved("echo hello"));
      ok(await isAutoApproved("rm"));
      ok(!await isAutoApproved("rm file.txt"));
      ok(!await isAutoApproved("del file.txt"));
    });
    test("should handle complex regex patterns", async () => {
      setAutoApprove({
        "/^(echo|ls|pwd)\\b/": true,
        "/^git (status|show\\b.*)$/": true,
        "/rm|del|kill/": false
      });
      ok(await isAutoApproved("echo test"));
      ok(await isAutoApproved("ls -la"));
      ok(await isAutoApproved("pwd"));
      ok(await isAutoApproved("git status"));
      ok(await isAutoApproved("git show"));
      ok(await isAutoApproved("git show HEAD"));
      ok(!await isAutoApproved("rm file"));
      ok(!await isAutoApproved("del file"));
      ok(!await isAutoApproved("kill process"));
    });
    test("should handle git patterns with -C and --no-pager", async () => {
      setAutoApprove({
        "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+status\\b/": true,
        "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+log\\b/": true,
        "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+show\\b/": true,
        "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+diff\\b/": true,
        "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+ls-files\\b/": true,
        "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+grep\\b/": true,
        "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+branch\\b/": true,
        "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+branch\\b.*-(d|D|m|M|-delete|-force)\\b/": false
      });
      ok(await isAutoApproved("git status"));
      ok(await isAutoApproved("git log"));
      ok(await isAutoApproved("git show HEAD"));
      ok(await isAutoApproved("git diff"));
      ok(await isAutoApproved("git ls-files"));
      ok(await isAutoApproved("git grep pattern"));
      ok(await isAutoApproved("git branch"));
      ok(await isAutoApproved("git ls-files --cached"));
      ok(await isAutoApproved("git -C /path ls-files"));
      ok(await isAutoApproved("git --no-pager ls-files"));
      ok(await isAutoApproved("git -C /some/path status"));
      ok(await isAutoApproved("git -C ../relative log"));
      ok(await isAutoApproved("git -C . diff"));
      ok(await isAutoApproved("git --no-pager status"));
      ok(await isAutoApproved("git --no-pager log"));
      ok(await isAutoApproved("git --no-pager diff HEAD~1"));
      ok(await isAutoApproved("git -C /path --no-pager status"));
      ok(await isAutoApproved("git --no-pager -C /path log"));
      ok(await isAutoApproved("git -C /path1 -C /path2 status"));
      ok(await isAutoApproved("git --no-pager --no-pager log"));
      ok(!await isAutoApproved("git branch -d feature"));
      ok(!await isAutoApproved("git branch -D feature"));
      ok(!await isAutoApproved("git branch --delete feature"));
      ok(!await isAutoApproved("git -C /path branch -d feature"));
      ok(!await isAutoApproved("git --no-pager branch -D feature"));
      ok(!await isAutoApproved("git -C /path --no-pager branch --force"));
      ok(!await isAutoApproved("git branch -m old new"));
      ok(!await isAutoApproved("git branch -M old new"));
      ok(!await isAutoApproved("git -C /path branch -m old new"));
    });
    suite("flags", () => {
      test("should handle case-insensitive regex patterns with i flag", async () => {
        setAutoApprove({
          "/^echo/i": true,
          "/^ls/i": true,
          "/rm|del/i": false
        });
        ok(await isAutoApproved("echo hello"));
        ok(await isAutoApproved("ECHO hello"));
        ok(await isAutoApproved("Echo hello"));
        ok(await isAutoApproved("ls -la"));
        ok(await isAutoApproved("LS -la"));
        ok(await isAutoApproved("Ls -la"));
        ok(!await isAutoApproved("rm file"));
        ok(!await isAutoApproved("RM file"));
        ok(!await isAutoApproved("del file"));
        ok(!await isAutoApproved("DEL file"));
      });
      test("should handle multiple regex flags", async () => {
        setAutoApprove({
          "/^git\\s+/gim": true,
          "/dangerous/gim": false
        });
        ok(await isAutoApproved("git status"));
        ok(await isAutoApproved("GIT status"));
        ok(await isAutoApproved("Git status"));
        ok(!await isAutoApproved("dangerous command"));
        ok(!await isAutoApproved("DANGEROUS command"));
      });
      test("should handle various regex flags", async () => {
        setAutoApprove({
          "/^echo.*/s": true,
          // dotall flag
          "/^git\\s+/i": true,
          // case-insensitive flag
          "/rm|del/g": false
          // global flag
        });
        ok(await isAutoApproved("echo hello\nworld"));
        ok(await isAutoApproved("git status"));
        ok(await isAutoApproved("GIT status"));
        ok(!await isAutoApproved("rm file"));
        ok(!await isAutoApproved("del file"));
      });
      test("should handle regex patterns without flags", async () => {
        setAutoApprove({
          "/^echo/": true,
          "/rm|del/": false
        });
        ok(await isAutoApproved("echo hello"));
        ok(!await isAutoApproved("ECHO hello"), "Should be case-sensitive without i flag");
        ok(!await isAutoApproved("rm file"));
        ok(!await isAutoApproved("RM file"), "Should be case-sensitive without i flag");
      });
    });
  });
  suite("edge cases", () => {
    test("should handle empty autoApprove", async () => {
      setAutoApprove({});
      ok(!await isAutoApproved("echo hello"));
      ok(!await isAutoApproved("ls"));
      ok(!await isAutoApproved("rm file"));
    });
    test("should handle empty command strings", async () => {
      setAutoApprove({
        "echo": true
      });
      ok(!await isAutoApproved(""));
      ok(!await isAutoApproved("   "));
    });
    test("should handle whitespace in commands", async () => {
      setAutoApprove({
        "echo": true
      });
      ok(await isAutoApproved("echo   hello   world"));
    });
    test("should be case-sensitive by default", async () => {
      setAutoApprove({
        "echo": true
      });
      ok(await isAutoApproved("echo hello"));
      ok(!await isAutoApproved("ECHO hello"));
      ok(!await isAutoApproved("Echo hello"));
    });
    test("should handle string-based values with special regex characters", async () => {
      setAutoApprove({
        "pwsh.exe -File D:\\foo.bar\\a-script.ps1": true
      });
      ok(await isAutoApproved("pwsh.exe -File D:\\foo.bar\\a-script.ps1"));
      ok(await isAutoApproved("pwsh.exe -File D:\\foo.bar\\a-script.ps1 -AnotherArg"));
    });
    test("should ignore the empty string key", async () => {
      setAutoApprove({
        "": true
      });
      ok(!await isAutoApproved("echo hello"));
    });
    test("should handle empty regex patterns that could cause endless loops", async () => {
      setAutoApprove({
        "//": true,
        "/(?:)/": true,
        "/*/": true,
        // Invalid regex pattern
        "/.**/": true
        // Invalid regex pattern
      });
      ok(!await isAutoApproved("echo hello"));
      ok(!await isAutoApproved("ls"));
      ok(!await isAutoApproved(""));
    });
    test("should handle regex patterns that would cause endless loops", async () => {
      setAutoApprove({
        "/a*/": true,
        "/b?/": true,
        "/(x|)*/": true,
        "/(?:)*/": true
      });
      ok(!await isAutoApproved("echo hello"));
      ok(!await isAutoApproved("ls"));
      ok(!await isAutoApproved("a"));
      ok(!await isAutoApproved("b"));
    });
    test("should handle mixed valid and problematic regex patterns", async () => {
      setAutoApprove({
        "/^echo/": true,
        // Valid pattern
        "//": true,
        // Empty pattern
        "/^ls/": true,
        // Valid pattern
        "/a*/": true,
        // Potential endless loop
        "pwd": true
        // Valid string pattern
      });
      ok(await isAutoApproved("echo hello"));
      ok(await isAutoApproved("ls -la"));
      ok(await isAutoApproved("pwd"));
      ok(!await isAutoApproved("rm file"));
    });
    test("should handle invalid regex patterns gracefully", async () => {
      setAutoApprove({
        "/*/": true,
        // Invalid regex - nothing to repeat
        "/(?:+/": true,
        // Invalid regex - incomplete quantifier
        "/[/": true,
        // Invalid regex - unclosed character class
        "/^echo/": true,
        // Valid pattern
        "ls": true
        // Valid string pattern
      });
      ok(await isAutoApproved("echo hello"));
      ok(await isAutoApproved("ls -la"));
      ok(!await isAutoApproved("random command"));
    });
  });
  suite("path-aware auto approval", () => {
    test("should handle path variations with forward slashes", async () => {
      setAutoApprove({
        "bin/foo": true
      });
      ok(await isAutoApproved("bin/foo"));
      ok(await isAutoApproved("bin/foo --arg"));
      ok(await isAutoApproved("bin\\foo"));
      ok(await isAutoApproved("bin\\foo --arg"));
      ok(await isAutoApproved("./bin/foo"));
      ok(await isAutoApproved(".\\bin/foo"));
      ok(await isAutoApproved("./bin\\foo"));
      ok(await isAutoApproved(".\\bin\\foo"));
      ok(!await isAutoApproved("bin/foobar"));
      ok(!await isAutoApproved("notbin/foo"));
    });
    test("should handle path variations with backslashes", async () => {
      setAutoApprove({
        "bin\\script.bat": true
      });
      ok(await isAutoApproved("bin\\script.bat"));
      ok(await isAutoApproved("bin\\script.bat --help"));
      ok(await isAutoApproved("bin/script.bat"));
      ok(await isAutoApproved("bin/script.bat --help"));
      ok(await isAutoApproved("./bin\\script.bat"));
      ok(await isAutoApproved(".\\bin\\script.bat"));
      ok(await isAutoApproved("./bin/script.bat"));
      ok(await isAutoApproved(".\\bin/script.bat"));
    });
    test("should handle deep paths", async () => {
      setAutoApprove({
        "src/utils/helper.js": true
      });
      ok(await isAutoApproved("src/utils/helper.js"));
      ok(await isAutoApproved("src\\utils\\helper.js"));
      ok(await isAutoApproved("src/utils\\helper.js"));
      ok(await isAutoApproved("src\\utils/helper.js"));
      ok(await isAutoApproved("./src/utils/helper.js"));
      ok(await isAutoApproved(".\\src\\utils\\helper.js"));
    });
    test("should not treat non-paths as paths", async () => {
      setAutoApprove({
        "echo": true,
        // Not a path
        "ls": true,
        // Not a path
        "git": true
        // Not a path
      });
      ok(await isAutoApproved("echo"));
      ok(await isAutoApproved("ls"));
      ok(await isAutoApproved("git"));
      ok(!await isAutoApproved("./echo"));
      ok(!await isAutoApproved(".\\ls"));
    });
    test("should handle paths with mixed separators in config", async () => {
      setAutoApprove({
        "bin/foo\\bar": true
        // Mixed separators in config
      });
      ok(await isAutoApproved("bin/foo\\bar"));
      ok(await isAutoApproved("bin\\foo/bar"));
      ok(await isAutoApproved("bin/foo/bar"));
      ok(await isAutoApproved("bin\\foo\\bar"));
      ok(await isAutoApproved("./bin/foo\\bar"));
      ok(await isAutoApproved(".\\bin\\foo\\bar"));
    });
    test("should work with command line auto approval for paths", async () => {
      setAutoApproveWithCommandLine({
        "bin/deploy": { approve: true, matchCommandLine: true }
      });
      ok(isCommandLineAutoApproved("bin/deploy --prod"));
      ok(isCommandLineAutoApproved("bin\\deploy --prod"));
      ok(isCommandLineAutoApproved("./bin/deploy --prod"));
      ok(isCommandLineAutoApproved(".\\bin\\deploy --prod"));
    });
    test("should handle special characters in paths", async () => {
      setAutoApprove({
        "bin/my-script.sh": true,
        "scripts/build_all.py": true,
        "tools/run (debug).exe": true
      });
      ok(await isAutoApproved("bin/my-script.sh"));
      ok(await isAutoApproved("bin\\my-script.sh"));
      ok(await isAutoApproved("./bin/my-script.sh"));
      ok(await isAutoApproved("scripts/build_all.py"));
      ok(await isAutoApproved("scripts\\build_all.py"));
      ok(await isAutoApproved("tools/run (debug).exe"));
      ok(await isAutoApproved("tools\\run (debug).exe"));
    });
  });
  suite("PowerShell-specific commands", () => {
    setup(() => {
      shell = "pwsh";
    });
    test("should handle Windows PowerShell commands", async () => {
      setAutoApprove({
        "Get-ChildItem": true,
        "Get-Content": true,
        "Get-Location": true,
        "Remove-Item": false,
        "del": false
      });
      ok(await isAutoApproved("Get-ChildItem"));
      ok(await isAutoApproved("Get-Content file.txt"));
      ok(await isAutoApproved("Get-Location"));
      ok(!await isAutoApproved("Remove-Item file.txt"));
    });
    test("should handle ( prefixes", async () => {
      setAutoApprove({
        "Get-Content": true
      });
      ok(await isAutoApproved("Get-Content file.txt"));
      ok(await isAutoApproved("(Get-Content file.txt"));
      ok(!await isAutoApproved("[Get-Content"));
      ok(!await isAutoApproved("foo"));
    });
    test("should be case-insensitive for PowerShell commands", async () => {
      setAutoApprove({
        "Get-ChildItem": true,
        "Get-Content": true,
        "Remove-Item": false
      });
      ok(await isAutoApproved("Get-ChildItem"));
      ok(await isAutoApproved("get-childitem"));
      ok(await isAutoApproved("GET-CHILDITEM"));
      ok(await isAutoApproved("Get-childitem"));
      ok(await isAutoApproved("get-ChildItem"));
      ok(await isAutoApproved("Get-Content file.txt"));
      ok(await isAutoApproved("get-content file.txt"));
      ok(await isAutoApproved("GET-CONTENT file.txt"));
      ok(await isAutoApproved("Get-content file.txt"));
      ok(!await isAutoApproved("Remove-Item file.txt"));
      ok(!await isAutoApproved("remove-item file.txt"));
      ok(!await isAutoApproved("REMOVE-ITEM file.txt"));
      ok(!await isAutoApproved("Remove-item file.txt"));
    });
    test("should be case-insensitive for PowerShell aliases", async () => {
      setAutoApprove({
        "ls": true,
        "dir": true,
        "rm": false,
        "del": false
      });
      ok(await isAutoApproved("ls"));
      ok(await isAutoApproved("LS"));
      ok(await isAutoApproved("Ls"));
      ok(await isAutoApproved("dir"));
      ok(await isAutoApproved("DIR"));
      ok(await isAutoApproved("Dir"));
      ok(!await isAutoApproved("rm file.txt"));
      ok(!await isAutoApproved("RM file.txt"));
      ok(!await isAutoApproved("Rm file.txt"));
      ok(!await isAutoApproved("del file.txt"));
      ok(!await isAutoApproved("DEL file.txt"));
      ok(!await isAutoApproved("Del file.txt"));
    });
    test("should be case-insensitive with regex patterns", async () => {
      setAutoApprove({
        "/^Get-/": true,
        "/Remove-Item|rm/": false
      });
      ok(await isAutoApproved("Get-ChildItem"));
      ok(await isAutoApproved("get-childitem"));
      ok(await isAutoApproved("GET-PROCESS"));
      ok(await isAutoApproved("Get-Location"));
      ok(!await isAutoApproved("Remove-Item file.txt"));
      ok(!await isAutoApproved("remove-item file.txt"));
      ok(!await isAutoApproved("rm file.txt"));
      ok(!await isAutoApproved("RM file.txt"));
    });
    test("should handle case-insensitive PowerShell commands on different OS", async () => {
      setAutoApprove({
        "Get-Process": true,
        "Stop-Process": false
      });
      for (const currnetOS of [OperatingSystem.Windows, OperatingSystem.Linux, OperatingSystem.Macintosh]) {
        os = currnetOS;
        ok(await isAutoApproved("Get-Process"), `os=${os}`);
        ok(await isAutoApproved("get-process"), `os=${os}`);
        ok(await isAutoApproved("GET-PROCESS"), `os=${os}`);
        ok(!await isAutoApproved("Stop-Process"), `os=${os}`);
        ok(!await isAutoApproved("stop-process"), `os=${os}`);
      }
    });
  });
  suite("isCommandLineAutoApproved - matchCommandLine functionality", () => {
    test("should auto-approve command line patterns with matchCommandLine: true", async () => {
      setAutoApproveWithCommandLine({
        "echo": { approve: true, matchCommandLine: true }
      });
      ok(isCommandLineAutoApproved("echo hello"));
      ok(isCommandLineAutoApproved("echo test && ls"));
    });
    test("should not auto-approve regular patterns with isCommandLineAutoApproved", async () => {
      setAutoApprove({
        "echo": true
      });
      ok(!isCommandLineAutoApproved("echo hello"));
    });
    test("should handle regex patterns with matchCommandLine: true", async () => {
      setAutoApproveWithCommandLine({
        "/echo.*world/": { approve: true, matchCommandLine: true }
      });
      ok(isCommandLineAutoApproved("echo hello world"));
      ok(!isCommandLineAutoApproved("echo hello"));
    });
    test("should handle case-insensitive regex with matchCommandLine: true", async () => {
      setAutoApproveWithCommandLine({
        "/echo/i": { approve: true, matchCommandLine: true }
      });
      ok(isCommandLineAutoApproved("echo hello"));
      ok(isCommandLineAutoApproved("ECHO hello"));
      ok(isCommandLineAutoApproved("Echo hello"));
    });
    test("should handle complex command line patterns", async () => {
      setAutoApproveWithCommandLine({
        "/^npm run build/": { approve: true, matchCommandLine: true },
        "/.ps1/i": { approve: true, matchCommandLine: true }
      });
      ok(isCommandLineAutoApproved("npm run build --production"));
      ok(isCommandLineAutoApproved("powershell -File script.ps1"));
      ok(isCommandLineAutoApproved("pwsh -File SCRIPT.PS1"));
      ok(!isCommandLineAutoApproved("npm install"));
    });
    test("should return false for empty command line", async () => {
      setAutoApproveWithCommandLine({
        "echo": { approve: true, matchCommandLine: true }
      });
      ok(!isCommandLineAutoApproved(""));
      ok(!isCommandLineAutoApproved("   "));
    });
    test("should handle mixed configuration with matchCommandLine entries", async () => {
      setAutoApproveWithCommandLine({
        "echo": true,
        // Regular pattern
        "ls": { approve: true, matchCommandLine: true },
        // Command line pattern
        "rm": { approve: true, matchCommandLine: false }
        // Explicit regular pattern
      });
      ok(isCommandLineAutoApproved("ls -la"));
      ok(!isCommandLineAutoApproved("echo hello"));
      ok(!isCommandLineAutoApproved("rm file.txt"));
    });
    test("should handle deny patterns with matchCommandLine: true", async () => {
      setAutoApproveWithCommandLine({
        "echo": { approve: true, matchCommandLine: true },
        "/dangerous/": { approve: false, matchCommandLine: true }
      });
      ok(isCommandLineAutoApproved("echo hello"));
      ok(!isCommandLineAutoApproved("echo dangerous command"));
      ok(!isCommandLineAutoApproved("dangerous operation"));
    });
    test("should prioritize deny list over allow list for command line patterns", async () => {
      setAutoApproveWithCommandLine({
        "/echo/": { approve: true, matchCommandLine: true },
        "/echo.*dangerous/": { approve: false, matchCommandLine: true }
      });
      ok(isCommandLineAutoApproved("echo hello"));
      ok(!isCommandLineAutoApproved("echo dangerous command"));
    });
    test("should handle complex deny patterns with matchCommandLine", async () => {
      setAutoApproveWithCommandLine({
        "npm": { approve: true, matchCommandLine: true },
        "/npm.*--force/": { approve: false, matchCommandLine: true },
        "/.ps1.*-ExecutionPolicy/i": { approve: false, matchCommandLine: true }
      });
      ok(isCommandLineAutoApproved("npm install"));
      ok(isCommandLineAutoApproved("npm run build"));
      ok(!isCommandLineAutoApproved("npm install --force"));
      ok(!isCommandLineAutoApproved("powershell -File script.ps1 -ExecutionPolicy Bypass"));
    });
    test("should handle empty regex patterns with matchCommandLine that could cause endless loops", async () => {
      setAutoApproveWithCommandLine({
        "//": { approve: true, matchCommandLine: true },
        "/(?:)/": { approve: true, matchCommandLine: true },
        "/*/": { approve: true, matchCommandLine: true },
        // Invalid regex pattern
        "/.**/": { approve: true, matchCommandLine: true }
        // Invalid regex pattern
      });
      ok(!isCommandLineAutoApproved("echo hello"));
      ok(!isCommandLineAutoApproved("ls"));
      ok(!isCommandLineAutoApproved(""));
    });
    test("should handle regex patterns with matchCommandLine that would cause endless loops", async () => {
      setAutoApproveWithCommandLine({
        "/a*/": { approve: true, matchCommandLine: true },
        "/b?/": { approve: true, matchCommandLine: true },
        "/(x|)*/": { approve: true, matchCommandLine: true },
        "/(?:)*/": { approve: true, matchCommandLine: true }
      });
      ok(!isCommandLineAutoApproved("echo hello"));
      ok(!isCommandLineAutoApproved("ls"));
      ok(!isCommandLineAutoApproved("a"));
      ok(!isCommandLineAutoApproved("b"));
    });
    test("should handle mixed valid and problematic regex patterns with matchCommandLine", async () => {
      setAutoApproveWithCommandLine({
        "/^echo/": { approve: true, matchCommandLine: true },
        // Valid pattern
        "//": { approve: true, matchCommandLine: true },
        // Empty pattern
        "/^ls/": { approve: true, matchCommandLine: true },
        // Valid pattern
        "/a*/": { approve: true, matchCommandLine: true },
        // Potential endless loop
        "pwd": { approve: true, matchCommandLine: true }
        // Valid string pattern
      });
      ok(isCommandLineAutoApproved("echo hello"));
      ok(isCommandLineAutoApproved("ls -la"));
      ok(isCommandLineAutoApproved("pwd"));
      ok(!isCommandLineAutoApproved("rm file"));
    });
    test("should handle invalid regex patterns with matchCommandLine gracefully", async () => {
      setAutoApproveWithCommandLine({
        "/*/": { approve: true, matchCommandLine: true },
        // Invalid regex - nothing to repeat
        "/(?:+/": { approve: true, matchCommandLine: true },
        // Invalid regex - incomplete quantifier
        "/[/": { approve: true, matchCommandLine: true },
        // Invalid regex - unclosed character class
        "/^echo/": { approve: true, matchCommandLine: true },
        // Valid pattern
        "ls": { approve: true, matchCommandLine: true }
        // Valid string pattern
      });
      ok(isCommandLineAutoApproved("echo hello"));
      ok(isCommandLineAutoApproved("ls -la"));
      ok(!isCommandLineAutoApproved("random command"));
    });
  });
  suite("reasons", () => {
    async function getCommandReason(command) {
      return (await commandLineAutoApprover.isCommandAutoApproved(command, shell, os, void 0)).reason;
    }
    function getCommandLineReason(commandLine) {
      return commandLineAutoApprover.isCommandLineAutoApproved(commandLine).reason;
    }
    suite("command", () => {
      test("approved", async () => {
        setAutoApprove({ echo: true });
        strictEqual(await getCommandReason("echo hello"), `Command 'echo hello' is approved by allow list rule: echo`);
      });
      test("not approved", async () => {
        setAutoApprove({ echo: false });
        strictEqual(await getCommandReason("echo hello"), `Command 'echo hello' is denied by deny list rule: echo`);
      });
      test("no match", async () => {
        setAutoApprove({});
        strictEqual(await getCommandReason("echo hello"), `Command 'echo hello' has no matching auto approve entries`);
      });
    });
    suite("command line", () => {
      test("approved", async () => {
        setAutoApproveWithCommandLine({ echo: { approve: true, matchCommandLine: true } });
        strictEqual(getCommandLineReason("echo hello"), `Command line 'echo hello' is approved by allow list rule: echo`);
      });
      test("not approved", async () => {
        setAutoApproveWithCommandLine({ echo: { approve: false, matchCommandLine: true } });
        strictEqual(getCommandLineReason("echo hello"), `Command line 'echo hello' is denied by deny list rule: echo`);
      });
      test("no match", async () => {
        setAutoApproveWithCommandLine({});
        strictEqual(getCommandLineReason("echo hello"), `Command line 'echo hello' has no matching auto approve entries`);
      });
    });
  });
  suite("isDefaultRule logic", () => {
    async function getIsDefaultRule(command) {
      const rule = (await commandLineAutoApprover.isCommandAutoApproved(command, shell, os, void 0)).rule;
      return isAutoApproveRule(rule) ? rule.isDefaultRule : void 0;
    }
    function getCommandLineIsDefaultRule(commandLine) {
      const rule = commandLineAutoApprover.isCommandLineAutoApproved(commandLine).rule;
      return isAutoApproveRule(rule) ? rule.isDefaultRule : void 0;
    }
    function setAutoApproveWithDefaults(userConfig, defaultConfig) {
      configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AutoApprove, userConfig);
      const originalInspect = configurationService.inspect;
      const originalGetValue = configurationService.getValue;
      configurationService.inspect = (key) => {
        if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
          return {
            default: { value: defaultConfig },
            user: { value: userConfig },
            workspace: void 0,
            workspaceFolder: void 0,
            application: void 0,
            policy: void 0,
            memory: void 0,
            value: { ...defaultConfig, ...userConfig }
          };
        }
        return originalInspect.call(configurationService, key);
      };
      configurationService.getValue = (key) => {
        if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
          return { ...defaultConfig, ...userConfig };
        }
        return originalGetValue.call(configurationService, key);
      };
      configurationService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: () => true,
        affectedKeys: /* @__PURE__ */ new Set([TerminalChatAgentToolsSettingId.AutoApprove]),
        source: ConfigurationTarget.USER,
        change: null
      });
    }
    function setAutoApproveWithDefaultsCommandLine(userConfig, defaultConfig) {
      configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AutoApprove, userConfig);
      const originalInspect = configurationService.inspect;
      const originalGetValue = configurationService.getValue;
      configurationService.inspect = (key) => {
        if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
          return {
            default: { value: defaultConfig },
            user: { value: userConfig },
            workspace: void 0,
            workspaceFolder: void 0,
            application: void 0,
            policy: void 0,
            memory: void 0,
            value: { ...defaultConfig, ...userConfig }
          };
        }
        return originalInspect.call(configurationService, key);
      };
      configurationService.getValue = (key) => {
        if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
          return { ...defaultConfig, ...userConfig };
        }
        return originalGetValue.call(configurationService, key);
      };
      configurationService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: () => true,
        affectedKeys: /* @__PURE__ */ new Set([TerminalChatAgentToolsSettingId.AutoApprove]),
        source: ConfigurationTarget.USER,
        change: null
      });
    }
    test("should correctly identify default rules vs user-defined rules", async () => {
      setAutoApproveWithDefaults(
        { "echo": true, "ls": true, "pwd": false },
        { "echo": true, "cat": true }
      );
      strictEqual(await getIsDefaultRule("echo hello"), true, "echo is in both default and user config with same value - should be marked as default");
      strictEqual(await getIsDefaultRule("ls -la"), false, "ls is only in user config - should be marked as user-defined");
      strictEqual(await getIsDefaultRule("pwd"), false, "pwd is only in user config - should be marked as user-defined");
      strictEqual(await getIsDefaultRule("cat file.txt"), true, "cat is in both default and user config with same value - should be marked as default");
    });
    test("should mark as default when command is only in default config but not in user config", async () => {
      setAutoApproveWithDefaults(
        { "echo": true, "ls": true },
        // User config (cat is NOT here)
        { "echo": true, "cat": true }
        // Default config (cat IS here)
      );
      strictEqual((await commandLineAutoApprover.isCommandAutoApproved("echo", shell, os, void 0)).result, "approved", "echo should be approved");
      strictEqual((await commandLineAutoApprover.isCommandAutoApproved("ls", shell, os, void 0)).result, "approved", "ls should be approved");
      const catResult = await commandLineAutoApprover.isCommandAutoApproved("cat", shell, os, void 0);
      strictEqual(catResult.result, "approved", "cat should be approved from default config");
      strictEqual(isAutoApproveRule(catResult.rule) ? catResult.rule.isDefaultRule : void 0, true, "cat is only in default config, not in user config - should be marked as default");
    });
    test("should handle default rules with different values", async () => {
      setAutoApproveWithDefaults(
        { "echo": true, "rm": true },
        { "echo": false, "rm": true }
      );
      strictEqual(await getIsDefaultRule("echo hello"), false, "echo has different values in default vs user - should be marked as user-defined");
      strictEqual(await getIsDefaultRule("rm file.txt"), true, "rm has same value in both - should be marked as default");
    });
    test("should handle regex patterns as default rules", async () => {
      setAutoApproveWithDefaults(
        { "/^git/": true, "/^npm/": false },
        { "/^git/": true, "/^docker/": true }
      );
      strictEqual(await getIsDefaultRule("git status"), true, "git pattern matches default - should be marked as default");
      strictEqual(await getIsDefaultRule("npm install"), false, "npm pattern is user-only - should be marked as user-defined");
    });
    test("should handle mixed string and regex patterns", async () => {
      setAutoApproveWithDefaults(
        { "echo": true, "/^ls/": false },
        { "echo": true, "cat": true }
      );
      strictEqual(await getIsDefaultRule("echo hello"), true, "String pattern matching default");
      strictEqual(await getIsDefaultRule("ls -la"), false, "Regex pattern user-defined");
    });
    test("should handle command line rules with isDefaultRule", async () => {
      setAutoApproveWithDefaultsCommandLine(
        {
          "echo": { approve: true, matchCommandLine: true },
          "ls": { approve: false, matchCommandLine: true }
        },
        {
          "echo": { approve: true, matchCommandLine: true },
          "cat": { approve: true, matchCommandLine: true }
        }
      );
      strictEqual(getCommandLineIsDefaultRule("echo hello world"), true, "echo matches default config exactly using structural equality - should be marked as default");
      strictEqual(getCommandLineIsDefaultRule("ls -la"), false, "ls is user-defined only - should be marked as user-defined");
    });
    test("should handle command line rules with different matchCommandLine values", async () => {
      setAutoApproveWithDefaultsCommandLine(
        {
          "echo": { approve: true, matchCommandLine: true },
          "ls": { approve: true, matchCommandLine: false }
        },
        {
          "echo": { approve: true, matchCommandLine: false },
          "ls": { approve: true, matchCommandLine: false }
        }
      );
      strictEqual(getCommandLineIsDefaultRule("echo hello"), false, "echo has different matchCommandLine value - should be user-defined");
      strictEqual(getCommandLineIsDefaultRule("ls -la"), void 0, "ls matches exactly - should be default (but won't match command line check since matchCommandLine is false)");
    });
    test("should handle boolean vs object format consistency", async () => {
      setAutoApproveWithDefaultsCommandLine(
        {
          "echo": true,
          "ls": { approve: true, matchCommandLine: true }
        },
        {
          "echo": true,
          "ls": { approve: true, matchCommandLine: true }
        }
      );
      strictEqual(await getIsDefaultRule("echo hello"), true, "Boolean format matching - should be default");
      strictEqual(getCommandLineIsDefaultRule("ls -la"), true, "Object format matching using structural equality - should be default");
    });
    test("should return undefined for noMatch cases", async () => {
      setAutoApproveWithDefaults(
        { "echo": true },
        { "cat": true }
      );
      strictEqual(await getIsDefaultRule("unknown-command"), void 0, "Command that matches neither user nor default config");
      strictEqual(getCommandLineIsDefaultRule("unknown-command"), void 0, "Command that matches neither user nor default config");
    });
    test("should handle empty configurations", async () => {
      setAutoApproveWithDefaults(
        {},
        {}
      );
      strictEqual(await getIsDefaultRule("echo hello"), void 0);
      strictEqual(getCommandLineIsDefaultRule("echo hello"), void 0);
    });
    test("should handle only default config with no user overrides", async () => {
      setAutoApproveWithDefaults(
        {},
        { "echo": true, "ls": false }
      );
      strictEqual(await getIsDefaultRule("echo hello"), true, "Commands in default config should be marked as default rules even with empty user config");
      strictEqual(await getIsDefaultRule("ls -la"), true, "Commands in default config should be marked as default rules even with empty user config");
    });
    test("should handle complex nested object rules", async () => {
      setAutoApproveWithDefaultsCommandLine(
        {
          "npm": { approve: true, matchCommandLine: true },
          "git": { approve: false, matchCommandLine: false }
        },
        {
          "npm": { approve: true, matchCommandLine: true },
          "docker": { approve: true, matchCommandLine: true }
        }
      );
      strictEqual(getCommandLineIsDefaultRule("npm install"), true, "npm matches default exactly using structural equality - should be default");
      strictEqual(getCommandLineIsDefaultRule("git status"), void 0, "git is user-defined - should be user-defined (but won't match command line since matchCommandLine is false)");
    });
    test("should handle PowerShell case-insensitive matching with defaults", async () => {
      shell = "pwsh";
      os = OperatingSystem.Windows;
      setAutoApproveWithDefaults(
        { "Get-Process": true },
        { "Get-Process": true }
      );
      strictEqual(await getIsDefaultRule("Get-Process"), true, "Case-insensitive PowerShell command matching default");
      strictEqual(await getIsDefaultRule("get-process"), true, "Case-insensitive PowerShell command matching default");
      strictEqual(await getIsDefaultRule("GET-PROCESS"), true, "Case-insensitive PowerShell command matching default");
    });
    test("should use structural equality for object comparison", async () => {
      const userConfig = { "test": { approve: true, matchCommandLine: true } };
      const defaultConfig = { "test": { approve: true, matchCommandLine: true } };
      setAutoApproveWithDefaultsCommandLine(userConfig, defaultConfig);
      strictEqual(getCommandLineIsDefaultRule("test command"), true, "Even though userConfig and defaultConfig are different object instances, they have the same structure and values, so should be considered default");
    });
    test("should detect structural differences in objects", async () => {
      const userConfig = { "test": { approve: true, matchCommandLine: true } };
      const defaultConfig = { "test": { approve: true, matchCommandLine: false } };
      setAutoApproveWithDefaultsCommandLine(userConfig, defaultConfig);
      strictEqual(getCommandLineIsDefaultRule("test command"), false, "Objects have different matchCommandLine values, so should be user-defined");
    });
    test("should handle mixed types correctly", async () => {
      const userConfig = {
        "cmd1": true,
        "cmd2": { approve: false, matchCommandLine: true }
      };
      const defaultConfig = {
        "cmd1": true,
        "cmd2": { approve: false, matchCommandLine: true }
      };
      setAutoApproveWithDefaultsCommandLine(userConfig, defaultConfig);
      strictEqual(await getIsDefaultRule("cmd1 arg"), true, "Boolean type should match default");
      strictEqual(getCommandLineIsDefaultRule("cmd2 arg"), true, "Object type should match default using structural equality (even though it's a deny rule)");
    });
  });
  suite("ignoreDefaultAutoApproveRules", () => {
    function setAutoApproveWithDefaults(userConfig, defaultConfig) {
      configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AutoApprove, userConfig);
      const originalInspect = configurationService.inspect;
      const originalGetValue = configurationService.getValue;
      configurationService.inspect = (key) => {
        if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
          return {
            default: { value: defaultConfig },
            user: { value: userConfig },
            workspace: void 0,
            workspaceFolder: void 0,
            application: void 0,
            policy: void 0,
            memory: void 0,
            value: { ...defaultConfig, ...userConfig }
          };
        }
        return originalInspect.call(configurationService, key);
      };
      configurationService.getValue = (key) => {
        if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
          return { ...defaultConfig, ...userConfig };
        }
        return originalGetValue.call(configurationService, key);
      };
      configurationService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: () => true,
        affectedKeys: /* @__PURE__ */ new Set([TerminalChatAgentToolsSettingId.AutoApprove]),
        source: ConfigurationTarget.USER,
        change: null
      });
    }
    function setIgnoreDefaultAutoApproveRules(value) {
      setConfig(TerminalChatAgentToolsSettingId.IgnoreDefaultAutoApproveRules, value);
    }
    test("should include default rules when ignoreDefaultAutoApproveRules is false (default behavior)", async () => {
      setAutoApproveWithDefaults(
        { "ls": true },
        { "echo": true, "cat": true }
      );
      setIgnoreDefaultAutoApproveRules(false);
      ok(await isAutoApproved("ls -la"), "User-defined rule should work");
      ok(await isAutoApproved("echo hello"), "Default rule should work when not ignored");
      ok(await isAutoApproved("cat file.txt"), "Default rule should work when not ignored");
    });
    test("should exclude default rules when ignoreDefaultAutoApproveRules is true", async () => {
      setAutoApproveWithDefaults(
        { "ls": true },
        { "echo": true, "cat": true }
      );
      setIgnoreDefaultAutoApproveRules(true);
      ok(await isAutoApproved("ls -la"), "User-defined rule should still work");
      ok(!await isAutoApproved("echo hello"), "Default rule should be ignored");
      ok(!await isAutoApproved("cat file.txt"), "Default rule should be ignored");
    });
    test("should attribute workspace-folder-scoped rules to WORKSPACE_FOLDER target", async () => {
      const workspaceFolderConfig = { "git": true };
      configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AutoApprove, workspaceFolderConfig);
      const originalInspect = configurationService.inspect;
      const originalGetValue = configurationService.getValue;
      configurationService.inspect = (key) => {
        if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
          return {
            default: void 0,
            user: void 0,
            workspace: void 0,
            workspaceFolder: void 0,
            workspaceFolderValue: workspaceFolderConfig,
            application: void 0,
            policy: void 0,
            memory: void 0,
            value: workspaceFolderConfig
          };
        }
        return originalInspect.call(configurationService, key);
      };
      configurationService.getValue = (key) => {
        if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
          return workspaceFolderConfig;
        }
        return originalGetValue.call(configurationService, key);
      };
      configurationService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: () => true,
        affectedKeys: /* @__PURE__ */ new Set([TerminalChatAgentToolsSettingId.AutoApprove]),
        source: ConfigurationTarget.WORKSPACE_FOLDER,
        change: null
      });
      const result = await commandLineAutoApprover.isCommandAutoApproved("git status", shell, os, void 0);
      strictEqual(result.result, "approved", "git command should be approved");
      ok(isAutoApproveRule(result.rule), "result should have an auto-approve rule");
      strictEqual(result.rule.sourceTarget, ConfigurationTarget.WORKSPACE_FOLDER, "workspace-folder-scoped rule should have WORKSPACE_FOLDER source target");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvY29tbWFuZExpbmVBdXRvQXBwcm92ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IG9rLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDb21tYW5kTGluZUF1dG9BcHByb3ZlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdG9vbHMvY29tbWFuZExpbmVBbmFseXplci9hdXRvQXBwcm92ZS9jb21tYW5kTGluZUF1dG9BcHByb3Zlci5qcyc7XG5pbXBvcnQgeyBpc0F1dG9BcHByb3ZlUnVsZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdG9vbHMvY29tbWFuZExpbmVBbmFseXplci9jb21tYW5kTGluZUFuYWx5emVyLmpzJztcblxuc3VpdGUoJ0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVyJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgY29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblxuXHRsZXQgY29tbWFuZExpbmVBdXRvQXBwcm92ZXI6IENvbW1hbmRMaW5lQXV0b0FwcHJvdmVyO1xuXHRsZXQgc2hlbGw6IHN0cmluZztcblx0bGV0IG9zOiBPcGVyYXRpbmdTeXN0ZW07XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IGNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0fSwgc3RvcmUpO1xuXG5cdFx0c2hlbGwgPSAnYmFzaCc7XG5cdFx0b3MgPSBPcGVyYXRpbmdTeXN0ZW0uTGludXg7XG5cdFx0Y29tbWFuZExpbmVBdXRvQXBwcm92ZXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tbWFuZExpbmVBdXRvQXBwcm92ZXIpKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gc2V0QXV0b0FwcHJvdmUodmFsdWU6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9KSB7XG5cdFx0c2V0Q29uZmlnKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmUsIHZhbHVlKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNldEF1dG9BcHByb3ZlV2l0aENvbW1hbmRMaW5lKHZhbHVlOiB7IFtrZXk6IHN0cmluZ106IHsgYXBwcm92ZTogYm9vbGVhbjsgbWF0Y2hDb21tYW5kTGluZT86IGJvb2xlYW4gfSB8IGJvb2xlYW4gfSkge1xuXHRcdHNldENvbmZpZyhUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlLCB2YWx1ZSk7XG5cdH1cblxuXHRmdW5jdGlvbiBzZXRDb25maWcoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKSB7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oa2V5LCB2YWx1ZSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiAoKSA9PiB0cnVlLFxuXHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFtrZXldKSxcblx0XHRcdHNvdXJjZTogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0Y2hhbmdlOiBudWxsISxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGlzQXV0b0FwcHJvdmVkKGNvbW1hbmRMaW5lOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gKGF3YWl0IGNvbW1hbmRMaW5lQXV0b0FwcHJvdmVyLmlzQ29tbWFuZEF1dG9BcHByb3ZlZChjb21tYW5kTGluZSwgc2hlbGwsIG9zLCB1bmRlZmluZWQpKS5yZXN1bHQgPT09ICdhcHByb3ZlZCc7XG5cdH1cblxuXHRmdW5jdGlvbiBpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKGNvbW1hbmRMaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gY29tbWFuZExpbmVBdXRvQXBwcm92ZXIuaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZChjb21tYW5kTGluZSkucmVzdWx0ID09PSAnYXBwcm92ZWQnO1xuXHR9XG5cblx0c3VpdGUoJ2F1dG9BcHByb3ZlIHdpdGggYWxsb3cgcGF0dGVybnMgb25seScsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgYXV0by1hcHByb3ZlIGV4YWN0IGNvbW1hbmQgbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCdlY2hvJzogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZWNobycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhdXRvLWFwcHJvdmUgY29tbWFuZCB3aXRoIGFyZ3VtZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J2VjaG8nOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvIHdvcmxkJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBhdXRvLWFwcHJvdmUgd2hlbiB0aGVyZSBpcyBubyBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J2VjaG8nOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnbHMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGF1dG8tYXBwcm92ZSBwYXJ0aWFsIGNvbW1hbmQgbWF0Y2hlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J2VjaG8nOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZWNob3Rlc3QnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIG11bHRpcGxlIGNvbW1hbmRzIGluIGF1dG9BcHByb3ZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnZWNobyc6IHRydWUsXG5cdFx0XHRcdCdscyc6IHRydWUsXG5cdFx0XHRcdCdwd2QnOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdlY2hvJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2xzIC1sYScpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdwd2QnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3JtJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYXV0b0FwcHJvdmUgd2l0aCBkZW55IHBhdHRlcm5zIG9ubHknLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGRlbnkgY29tbWFuZHMgaW4gYXV0b0FwcHJvdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCdybSc6IGZhbHNlLFxuXHRcdFx0XHQnZGVsJzogZmFsc2Vcblx0XHRcdH0pO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdybSBmaWxlLnR4dCcpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZGVsIGZpbGUudHh0JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBhdXRvLWFwcHJvdmUgc2FmZSBjb21tYW5kcyB3aGVuIG5vIGFsbG93IHBhdHRlcm5zIGFyZSBwcmVzZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQncm0nOiBmYWxzZVxuXHRcdFx0fSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8nKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2xzJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYXV0b0FwcHJvdmUgd2l0aCBtaXhlZCBhbGxvdyBhbmQgZGVueSBwYXR0ZXJucycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZGVueSBjb21tYW5kcyBzZXQgdG8gZmFsc2UgZXZlbiBpZiBvdGhlciBjb21tYW5kcyBhcmUgc2V0IHRvIHRydWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCdlY2hvJzogdHJ1ZSxcblx0XHRcdFx0J3JtJzogZmFsc2Vcblx0XHRcdH0pO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8nKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3JtIGZpbGUudHh0JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGF1dG8tYXBwcm92ZSBhbGxvdyBwYXR0ZXJucyBub3Qgc2V0IHRvIGZhbHNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnZWNobyc6IHRydWUsXG5cdFx0XHRcdCdscyc6IHRydWUsXG5cdFx0XHRcdCdwd2QnOiB0cnVlLFxuXHRcdFx0XHQncm0nOiBmYWxzZSxcblx0XHRcdFx0J2RlbCc6IGZhbHNlXG5cdFx0XHR9KTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdlY2hvJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2xzJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3B3ZCcpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgncm0nKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2RlbCcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlZ2V4IHBhdHRlcm5zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgLy4qLycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0Jy8uKi8nOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSByZWdleCBwYXR0ZXJucyBpbiBhdXRvQXBwcm92ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0Jy9eZWNoby8nOiB0cnVlLFxuXHRcdFx0XHQnL15scy8nOiB0cnVlLFxuXHRcdFx0XHQncHdkJzogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2xzIC1sYScpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdwd2QnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3JtIGZpbGUnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHJlZ2V4IHBhdHRlcm5zIGZvciBkZW55JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnZWNobyc6IHRydWUsXG5cdFx0XHRcdCdybSc6IHRydWUsXG5cdFx0XHRcdCcvXnJtXFxcXHMrLyc6IGZhbHNlLFxuXHRcdFx0XHQnL15kZWxcXFxccysvJzogZmFsc2Vcblx0XHRcdH0pO1xuXG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZWNobyBoZWxsbycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdybScpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgncm0gZmlsZS50eHQnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2RlbCBmaWxlLnR4dCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgY29tcGxleCByZWdleCBwYXR0ZXJucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0Jy9eKGVjaG98bHN8cHdkKVxcXFxiLyc6IHRydWUsXG5cdFx0XHRcdCcvXmdpdCAoc3RhdHVzfHNob3dcXFxcYi4qKSQvJzogdHJ1ZSxcblx0XHRcdFx0Jy9ybXxkZWx8a2lsbC8nOiBmYWxzZVxuXHRcdFx0fSk7XG5cblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdlY2hvIHRlc3QnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnbHMgLWxhJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3B3ZCcpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgc3RhdHVzJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCBzaG93JykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCBzaG93IEhFQUQnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3JtIGZpbGUnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2RlbCBmaWxlJykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdraWxsIHByb2Nlc3MnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGdpdCBwYXR0ZXJucyB3aXRoIC1DIGFuZCAtLW5vLXBhZ2VyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnL15naXQoXFxcXHMrKC1DXFxcXHMrXFxcXFMrfC0tbm8tcGFnZXIpKSpcXFxccytzdGF0dXNcXFxcYi8nOiB0cnVlLFxuXHRcdFx0XHQnL15naXQoXFxcXHMrKC1DXFxcXHMrXFxcXFMrfC0tbm8tcGFnZXIpKSpcXFxccytsb2dcXFxcYi8nOiB0cnVlLFxuXHRcdFx0XHQnL15naXQoXFxcXHMrKC1DXFxcXHMrXFxcXFMrfC0tbm8tcGFnZXIpKSpcXFxccytzaG93XFxcXGIvJzogdHJ1ZSxcblx0XHRcdFx0Jy9eZ2l0KFxcXFxzKygtQ1xcXFxzK1xcXFxTK3wtLW5vLXBhZ2VyKSkqXFxcXHMrZGlmZlxcXFxiLyc6IHRydWUsXG5cdFx0XHRcdCcvXmdpdChcXFxccysoLUNcXFxccytcXFxcUyt8LS1uby1wYWdlcikpKlxcXFxzK2xzLWZpbGVzXFxcXGIvJzogdHJ1ZSxcblx0XHRcdFx0Jy9eZ2l0KFxcXFxzKygtQ1xcXFxzK1xcXFxTK3wtLW5vLXBhZ2VyKSkqXFxcXHMrZ3JlcFxcXFxiLyc6IHRydWUsXG5cdFx0XHRcdCcvXmdpdChcXFxccysoLUNcXFxccytcXFxcUyt8LS1uby1wYWdlcikpKlxcXFxzK2JyYW5jaFxcXFxiLyc6IHRydWUsXG5cdFx0XHRcdCcvXmdpdChcXFxccysoLUNcXFxccytcXFxcUyt8LS1uby1wYWdlcikpKlxcXFxzK2JyYW5jaFxcXFxiLiotKGR8RHxtfE18LWRlbGV0ZXwtZm9yY2UpXFxcXGIvJzogZmFsc2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQmFzaWMgY29tbWFuZHNcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgc3RhdHVzJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCBsb2cnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0IHNob3cgSEVBRCcpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgZGlmZicpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgbHMtZmlsZXMnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0IGdyZXAgcGF0dGVybicpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgYnJhbmNoJykpO1xuXG5cdFx0XHQvLyBscy1maWxlcyB3aXRoIG9wdGlvbnNcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgbHMtZmlsZXMgLS1jYWNoZWQnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0IC1DIC9wYXRoIGxzLWZpbGVzJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCAtLW5vLXBhZ2VyIGxzLWZpbGVzJykpO1xuXG5cdFx0XHQvLyBXaXRoIC1DIHBhdGhcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgLUMgL3NvbWUvcGF0aCBzdGF0dXMnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0IC1DIC4uL3JlbGF0aXZlIGxvZycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgLUMgLiBkaWZmJykpO1xuXG5cdFx0XHQvLyBXaXRoIC0tbm8tcGFnZXJcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgLS1uby1wYWdlciBzdGF0dXMnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0IC0tbm8tcGFnZXIgbG9nJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCAtLW5vLXBhZ2VyIGRpZmYgSEVBRH4xJykpO1xuXG5cdFx0XHQvLyBXaXRoIGJvdGggLUMgYW5kIC0tbm8tcGFnZXJcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgLUMgL3BhdGggLS1uby1wYWdlciBzdGF0dXMnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0IC0tbm8tcGFnZXIgLUMgL3BhdGggbG9nJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCAtQyAvcGF0aDEgLUMgL3BhdGgyIHN0YXR1cycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgLS1uby1wYWdlciAtLW5vLXBhZ2VyIGxvZycpKTtcblxuXHRcdFx0Ly8gQnJhbmNoIGRlbGV0aW9uIHNob3VsZCBiZSBkZW5pZWRcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0IGJyYW5jaCAtZCBmZWF0dXJlJykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgYnJhbmNoIC1EIGZlYXR1cmUnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCBicmFuY2ggLS1kZWxldGUgZmVhdHVyZScpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0IC1DIC9wYXRoIGJyYW5jaCAtZCBmZWF0dXJlJykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgLS1uby1wYWdlciBicmFuY2ggLUQgZmVhdHVyZScpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0IC1DIC9wYXRoIC0tbm8tcGFnZXIgYnJhbmNoIC0tZm9yY2UnKSk7XG5cblx0XHRcdC8vIEJyYW5jaCByZW5hbWUgc2hvdWxkIGJlIGRlbmllZFxuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgYnJhbmNoIC1tIG9sZCBuZXcnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCBicmFuY2ggLU0gb2xkIG5ldycpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0IC1DIC9wYXRoIGJyYW5jaCAtbSBvbGQgbmV3JykpO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2ZsYWdzJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBjYXNlLWluc2Vuc2l0aXZlIHJlZ2V4IHBhdHRlcm5zIHdpdGggaSBmbGFnJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdFx0Jy9eZWNoby9pJzogdHJ1ZSxcblx0XHRcdFx0XHQnL15scy9pJzogdHJ1ZSxcblx0XHRcdFx0XHQnL3JtfGRlbC9pJzogZmFsc2Vcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8nKSk7XG5cdFx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdFQ0hPIGhlbGxvJykpO1xuXHRcdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnRWNobyBoZWxsbycpKTtcblx0XHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2xzIC1sYScpKTtcblx0XHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0xTIC1sYScpKTtcblx0XHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0xzIC1sYScpKTtcblx0XHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdybSBmaWxlJykpO1xuXHRcdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ1JNIGZpbGUnKSk7XG5cdFx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZGVsIGZpbGUnKSk7XG5cdFx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnREVMIGZpbGUnKSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtdWx0aXBsZSByZWdleCBmbGFncycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRcdCcvXmdpdFxcXFxzKy9naW0nOiB0cnVlLFxuXHRcdFx0XHRcdCcvZGFuZ2Vyb3VzL2dpbSc6IGZhbHNlXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgc3RhdHVzJykpO1xuXHRcdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnR0lUIHN0YXR1cycpKTtcblx0XHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0dpdCBzdGF0dXMnKSk7XG5cdFx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZGFuZ2Vyb3VzIGNvbW1hbmQnKSk7XG5cdFx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnREFOR0VST1VTIGNvbW1hbmQnKSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSB2YXJpb3VzIHJlZ2V4IGZsYWdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdFx0Jy9eZWNoby4qL3MnOiB0cnVlLCAgLy8gZG90YWxsIGZsYWdcblx0XHRcdFx0XHQnL15naXRcXFxccysvaSc6IHRydWUsIC8vIGNhc2UtaW5zZW5zaXRpdmUgZmxhZ1xuXHRcdFx0XHRcdCcvcm18ZGVsL2cnOiBmYWxzZSAgIC8vIGdsb2JhbCBmbGFnXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvXFxud29ybGQnKSk7XG5cdFx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgc3RhdHVzJykpO1xuXHRcdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnR0lUIHN0YXR1cycpKTtcblx0XHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdybSBmaWxlJykpO1xuXHRcdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2RlbCBmaWxlJykpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgcmVnZXggcGF0dGVybnMgd2l0aG91dCBmbGFncycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHRcdCcvXmVjaG8vJzogdHJ1ZSxcblx0XHRcdFx0XHQnL3JtfGRlbC8nOiBmYWxzZVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZWNobyBoZWxsbycpKTtcblx0XHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdFQ0hPIGhlbGxvJyksICdTaG91bGQgYmUgY2FzZS1zZW5zaXRpdmUgd2l0aG91dCBpIGZsYWcnKTtcblx0XHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdybSBmaWxlJykpO1xuXHRcdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ1JNIGZpbGUnKSwgJ1Nob3VsZCBiZSBjYXNlLXNlbnNpdGl2ZSB3aXRob3V0IGkgZmxhZycpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdlZGdlIGNhc2VzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgYXV0b0FwcHJvdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7fSk7XG5cblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZWNobyBoZWxsbycpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnbHMnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3JtIGZpbGUnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGVtcHR5IGNvbW1hbmQgc3RyaW5ncycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J2VjaG8nOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCcnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJyAgICcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgd2hpdGVzcGFjZSBpbiBjb21tYW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J2VjaG8nOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8gICBoZWxsbyAgIHdvcmxkJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGJlIGNhc2Utc2Vuc2l0aXZlIGJ5IGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCdlY2hvJzogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvJykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdFQ0hPIGhlbGxvJykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdFY2hvIGhlbGxvJykpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI1MjQxMVxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgc3RyaW5nLWJhc2VkIHZhbHVlcyB3aXRoIHNwZWNpYWwgcmVnZXggY2hhcmFjdGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J3B3c2guZXhlIC1GaWxlIEQ6XFxcXGZvby5iYXJcXFxcYS1zY3JpcHQucHMxJzogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdwd3NoLmV4ZSAtRmlsZSBEOlxcXFxmb28uYmFyXFxcXGEtc2NyaXB0LnBzMScpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdwd3NoLmV4ZSAtRmlsZSBEOlxcXFxmb28uYmFyXFxcXGEtc2NyaXB0LnBzMSAtQW5vdGhlckFyZycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpZ25vcmUgdGhlIGVtcHR5IHN0cmluZyBrZXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCcnOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBlbXB0eSByZWdleCBwYXR0ZXJucyB0aGF0IGNvdWxkIGNhdXNlIGVuZGxlc3MgbG9vcHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCcvLyc6IHRydWUsXG5cdFx0XHRcdCcvKD86KS8nOiB0cnVlLFxuXHRcdFx0XHQnLyovJzogdHJ1ZSwgICAgICAgICAgICAvLyBJbnZhbGlkIHJlZ2V4IHBhdHRlcm5cblx0XHRcdFx0Jy8uKiovJzogdHJ1ZSAgICAgICAgICAgLy8gSW52YWxpZCByZWdleCBwYXR0ZXJuXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVGhlc2UgcGF0dGVybnMgc2hvdWxkIG5vdCBjYXVzZSBlbmRsZXNzIGxvb3BzIGFuZCBzaG91bGQgbm90IG1hdGNoIGFueSBjb21tYW5kc1xuXHRcdFx0Ly8gSW52YWxpZCBwYXR0ZXJucyBzaG91bGQgYmUgaGFuZGxlZCBncmFjZWZ1bGx5IGFuZCBub3QgbWF0Y2ggYW55dGhpbmdcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZWNobyBoZWxsbycpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnbHMnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgcmVnZXggcGF0dGVybnMgdGhhdCB3b3VsZCBjYXVzZSBlbmRsZXNzIGxvb3BzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnL2EqLyc6IHRydWUsXG5cdFx0XHRcdCcvYj8vJzogdHJ1ZSxcblx0XHRcdFx0Jy8oeHwpKi8nOiB0cnVlLFxuXHRcdFx0XHQnLyg/OikqLyc6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBDb21tYW5kcyBzaG91bGQgc3RpbGwgd29yayBub3JtYWxseSwgZW5kbGVzcyBsb29wIHBhdHRlcm5zIHNob3VsZCBiZSBzYWZlbHkgaGFuZGxlZFxuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvJykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdscycpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnYScpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnYicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbWl4ZWQgdmFsaWQgYW5kIHByb2JsZW1hdGljIHJlZ2V4IHBhdHRlcm5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnL15lY2hvLyc6IHRydWUsICAgICAgICAvLyBWYWxpZCBwYXR0ZXJuXG5cdFx0XHRcdCcvLyc6IHRydWUsICAgICAgICAgICAgIC8vIEVtcHR5IHBhdHRlcm5cblx0XHRcdFx0Jy9ebHMvJzogdHJ1ZSwgICAgICAgICAgLy8gVmFsaWQgcGF0dGVyblxuXHRcdFx0XHQnL2EqLyc6IHRydWUsICAgICAgICAgICAvLyBQb3RlbnRpYWwgZW5kbGVzcyBsb29wXG5cdFx0XHRcdCdwd2QnOiB0cnVlICAgICAgICAgICAgIC8vIFZhbGlkIHN0cmluZyBwYXR0ZXJuXG5cdFx0XHR9KTtcblxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8nKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnbHMgLWxhJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3B3ZCcpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgncm0gZmlsZScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgaW52YWxpZCByZWdleCBwYXR0ZXJucyBncmFjZWZ1bGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnLyovJzogdHJ1ZSwgICAgICAgICAgICAgICAgICAgIC8vIEludmFsaWQgcmVnZXggLSBub3RoaW5nIHRvIHJlcGVhdFxuXHRcdFx0XHQnLyg/OisvJzogdHJ1ZSwgICAgICAgICAgICAgICAgIC8vIEludmFsaWQgcmVnZXggLSBpbmNvbXBsZXRlIHF1YW50aWZpZXJcblx0XHRcdFx0Jy9bLyc6IHRydWUsICAgICAgICAgICAgICAgICAgICAvLyBJbnZhbGlkIHJlZ2V4IC0gdW5jbG9zZWQgY2hhcmFjdGVyIGNsYXNzXG5cdFx0XHRcdCcvXmVjaG8vJzogdHJ1ZSwgICAgICAgICAgICAgICAgLy8gVmFsaWQgcGF0dGVyblxuXHRcdFx0XHQnbHMnOiB0cnVlICAgICAgICAgICAgICAgICAgICAgIC8vIFZhbGlkIHN0cmluZyBwYXR0ZXJuXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVmFsaWQgcGF0dGVybnMgc2hvdWxkIHN0aWxsIHdvcmtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2xzIC1sYScpKTtcblx0XHRcdC8vIEludmFsaWQgcGF0dGVybnMgc2hvdWxkIG5vdCBtYXRjaCBhbnl0aGluZyBhbmQgbm90IGNhdXNlIGNyYXNoZXNcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgncmFuZG9tIGNvbW1hbmQnKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwYXRoLWF3YXJlIGF1dG8gYXBwcm92YWwnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBwYXRoIHZhcmlhdGlvbnMgd2l0aCBmb3J3YXJkIHNsYXNoZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCdiaW4vZm9vJzogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFNob3VsZCBhcHByb3ZlIHRoZSBleGFjdCBtYXRjaFxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2Jpbi9mb28nKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnYmluL2ZvbyAtLWFyZycpKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGFwcHJvdmUgd2l0aCBXaW5kb3dzIGJhY2tzbGFzaGVzXG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnYmluXFxcXGZvbycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdiaW5cXFxcZm9vIC0tYXJnJykpO1xuXG5cdFx0XHQvLyBTaG91bGQgYXBwcm92ZSB3aXRoIGN1cnJlbnQgZGlyZWN0b3J5IHByZWZpeGVzXG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnLi9iaW4vZm9vJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJy5cXFxcYmluL2ZvbycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCcuL2JpblxcXFxmb28nKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnLlxcXFxiaW5cXFxcZm9vJykpO1xuXG5cdFx0XHQvLyBTaG91bGQgbm90IGFwcHJvdmUgcGFydGlhbCBtYXRjaGVzXG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2Jpbi9mb29iYXInKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ25vdGJpbi9mb28nKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHBhdGggdmFyaWF0aW9ucyB3aXRoIGJhY2tzbGFzaGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnYmluXFxcXHNjcmlwdC5iYXQnOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gU2hvdWxkIGFwcHJvdmUgdGhlIGV4YWN0IG1hdGNoXG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnYmluXFxcXHNjcmlwdC5iYXQnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnYmluXFxcXHNjcmlwdC5iYXQgLS1oZWxwJykpO1xuXG5cdFx0XHQvLyBTaG91bGQgYXBwcm92ZSB3aXRoIGZvcndhcmQgc2xhc2hlc1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2Jpbi9zY3JpcHQuYmF0JykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2Jpbi9zY3JpcHQuYmF0IC0taGVscCcpKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGFwcHJvdmUgd2l0aCBjdXJyZW50IGRpcmVjdG9yeSBwcmVmaXhlc1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJy4vYmluXFxcXHNjcmlwdC5iYXQnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnLlxcXFxiaW5cXFxcc2NyaXB0LmJhdCcpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCcuL2Jpbi9zY3JpcHQuYmF0JykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJy5cXFxcYmluL3NjcmlwdC5iYXQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGRlZXAgcGF0aHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCdzcmMvdXRpbHMvaGVscGVyLmpzJzogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdzcmMvdXRpbHMvaGVscGVyLmpzJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3NyY1xcXFx1dGlsc1xcXFxoZWxwZXIuanMnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnc3JjL3V0aWxzXFxcXGhlbHBlci5qcycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdzcmNcXFxcdXRpbHMvaGVscGVyLmpzJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJy4vc3JjL3V0aWxzL2hlbHBlci5qcycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCcuXFxcXHNyY1xcXFx1dGlsc1xcXFxoZWxwZXIuanMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHRyZWF0IG5vbi1wYXRocyBhcyBwYXRocycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J2VjaG8nOiB0cnVlLCAgLy8gTm90IGEgcGF0aFxuXHRcdFx0XHQnbHMnOiB0cnVlLCAgICAvLyBOb3QgYSBwYXRoXG5cdFx0XHRcdCdnaXQnOiB0cnVlICAgIC8vIE5vdCBhIHBhdGhcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUaGVzZSBzaG91bGQgd29yayBhcyBub3JtYWwgY29tbWFuZCBtYXRjaGluZywgbm90IHBhdGggbWF0Y2hpbmdcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdlY2hvJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2xzJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCcpKTtcblxuXHRcdFx0Ly8gU2hvdWxkIG5vdCBiZSB0cmVhdGVkIGFzIHBhdGhzLCBzbyB0aGVzZSBwcmVmaXhlcyBzaG91bGRuJ3Qgd29ya1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCcuL2VjaG8nKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJy5cXFxcbHMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHBhdGhzIHdpdGggbWl4ZWQgc2VwYXJhdG9ycyBpbiBjb25maWcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCdiaW4vZm9vXFxcXGJhcic6IHRydWUgIC8vIE1peGVkIHNlcGFyYXRvcnMgaW4gY29uZmlnXG5cdFx0XHR9KTtcblxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2Jpbi9mb29cXFxcYmFyJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2JpblxcXFxmb28vYmFyJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2Jpbi9mb28vYmFyJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2JpblxcXFxmb29cXFxcYmFyJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJy4vYmluL2Zvb1xcXFxiYXInKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnLlxcXFxiaW5cXFxcZm9vXFxcXGJhcicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB3b3JrIHdpdGggY29tbWFuZCBsaW5lIGF1dG8gYXBwcm92YWwgZm9yIHBhdGhzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoQ29tbWFuZExpbmUoe1xuXHRcdFx0XHQnYmluL2RlcGxveSc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0b2soaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnYmluL2RlcGxveSAtLXByb2QnKSk7XG5cdFx0XHRvayhpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdiaW5cXFxcZGVwbG95IC0tcHJvZCcpKTtcblx0XHRcdG9rKGlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJy4vYmluL2RlcGxveSAtLXByb2QnKSk7XG5cdFx0XHRvayhpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCcuXFxcXGJpblxcXFxkZXBsb3kgLS1wcm9kJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBzcGVjaWFsIGNoYXJhY3RlcnMgaW4gcGF0aHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCdiaW4vbXktc2NyaXB0LnNoJzogdHJ1ZSxcblx0XHRcdFx0J3NjcmlwdHMvYnVpbGRfYWxsLnB5JzogdHJ1ZSxcblx0XHRcdFx0J3Rvb2xzL3J1biAoZGVidWcpLmV4ZSc6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnYmluL215LXNjcmlwdC5zaCcpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdiaW5cXFxcbXktc2NyaXB0LnNoJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJy4vYmluL215LXNjcmlwdC5zaCcpKTtcblxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3NjcmlwdHMvYnVpbGRfYWxsLnB5JykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3NjcmlwdHNcXFxcYnVpbGRfYWxsLnB5JykpO1xuXG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgndG9vbHMvcnVuIChkZWJ1ZykuZXhlJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3Rvb2xzXFxcXHJ1biAoZGVidWcpLmV4ZScpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1Bvd2VyU2hlbGwtc3BlY2lmaWMgY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0c2hlbGwgPSAncHdzaCc7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIFdpbmRvd3MgUG93ZXJTaGVsbCBjb21tYW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J0dldC1DaGlsZEl0ZW0nOiB0cnVlLFxuXHRcdFx0XHQnR2V0LUNvbnRlbnQnOiB0cnVlLFxuXHRcdFx0XHQnR2V0LUxvY2F0aW9uJzogdHJ1ZSxcblx0XHRcdFx0J1JlbW92ZS1JdGVtJzogZmFsc2UsXG5cdFx0XHRcdCdkZWwnOiBmYWxzZVxuXHRcdFx0fSk7XG5cblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdHZXQtQ2hpbGRJdGVtJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0dldC1Db250ZW50IGZpbGUudHh0JykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0dldC1Mb2NhdGlvbicpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnUmVtb3ZlLUl0ZW0gZmlsZS50eHQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlICggcHJlZml4ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCdHZXQtQ29udGVudCc6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnR2V0LUNvbnRlbnQgZmlsZS50eHQnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnKEdldC1Db250ZW50IGZpbGUudHh0JykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdbR2V0LUNvbnRlbnQnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2ZvbycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBiZSBjYXNlLWluc2Vuc2l0aXZlIGZvciBQb3dlclNoZWxsIGNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnR2V0LUNoaWxkSXRlbSc6IHRydWUsXG5cdFx0XHRcdCdHZXQtQ29udGVudCc6IHRydWUsXG5cdFx0XHRcdCdSZW1vdmUtSXRlbSc6IGZhbHNlXG5cdFx0XHR9KTtcblxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0dldC1DaGlsZEl0ZW0nKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2V0LWNoaWxkaXRlbScpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdHRVQtQ0hJTERJVEVNJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0dldC1jaGlsZGl0ZW0nKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2V0LUNoaWxkSXRlbScpKTtcblxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0dldC1Db250ZW50IGZpbGUudHh0JykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dldC1jb250ZW50IGZpbGUudHh0JykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0dFVC1DT05URU5UIGZpbGUudHh0JykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0dldC1jb250ZW50IGZpbGUudHh0JykpO1xuXG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ1JlbW92ZS1JdGVtIGZpbGUudHh0JykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdyZW1vdmUtaXRlbSBmaWxlLnR4dCcpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnUkVNT1ZFLUlURU0gZmlsZS50eHQnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ1JlbW92ZS1pdGVtIGZpbGUudHh0JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGJlIGNhc2UtaW5zZW5zaXRpdmUgZm9yIFBvd2VyU2hlbGwgYWxpYXNlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J2xzJzogdHJ1ZSxcblx0XHRcdFx0J2Rpcic6IHRydWUsXG5cdFx0XHRcdCdybSc6IGZhbHNlLFxuXHRcdFx0XHQnZGVsJzogZmFsc2Vcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUZXN0IGNhc2UtaW5zZW5zaXRpdmUgbWF0Y2hpbmcgZm9yIGFsaWFzZXNcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdscycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdMUycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdMcycpKTtcblxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2RpcicpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdESVInKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnRGlyJykpO1xuXG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3JtIGZpbGUudHh0JykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdSTSBmaWxlLnR4dCcpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnUm0gZmlsZS50eHQnKSk7XG5cblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZGVsIGZpbGUudHh0JykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdERUwgZmlsZS50eHQnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0RlbCBmaWxlLnR4dCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBiZSBjYXNlLWluc2Vuc2l0aXZlIHdpdGggcmVnZXggcGF0dGVybnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCcvXkdldC0vJzogdHJ1ZSxcblx0XHRcdFx0Jy9SZW1vdmUtSXRlbXxybS8nOiBmYWxzZVxuXHRcdFx0fSk7XG5cblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdHZXQtQ2hpbGRJdGVtJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dldC1jaGlsZGl0ZW0nKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnR0VULVBST0NFU1MnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnR2V0LUxvY2F0aW9uJykpO1xuXG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ1JlbW92ZS1JdGVtIGZpbGUudHh0JykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdyZW1vdmUtaXRlbSBmaWxlLnR4dCcpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgncm0gZmlsZS50eHQnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ1JNIGZpbGUudHh0JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBjYXNlLWluc2Vuc2l0aXZlIFBvd2VyU2hlbGwgY29tbWFuZHMgb24gZGlmZmVyZW50IE9TJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnR2V0LVByb2Nlc3MnOiB0cnVlLFxuXHRcdFx0XHQnU3RvcC1Qcm9jZXNzJzogZmFsc2Vcblx0XHRcdH0pO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGN1cnJuZXRPUyBvZiBbT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaF0pIHtcblx0XHRcdFx0b3MgPSBjdXJybmV0T1M7XG5cdFx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdHZXQtUHJvY2VzcycpLCBgb3M9JHtvc31gKTtcblx0XHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dldC1wcm9jZXNzJyksIGBvcz0ke29zfWApO1xuXHRcdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnR0VULVBST0NFU1MnKSwgYG9zPSR7b3N9YCk7XG5cdFx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnU3RvcC1Qcm9jZXNzJyksIGBvcz0ke29zfWApO1xuXHRcdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3N0b3AtcHJvY2VzcycpLCBgb3M9JHtvc31gKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2lzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQgLSBtYXRjaENvbW1hbmRMaW5lIGZ1bmN0aW9uYWxpdHknLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGF1dG8tYXBwcm92ZSBjb21tYW5kIGxpbmUgcGF0dGVybnMgd2l0aCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoQ29tbWFuZExpbmUoe1xuXHRcdFx0XHQnZWNobyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0b2soaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnZWNobyBoZWxsbycpKTtcblx0XHRcdG9rKGlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ2VjaG8gdGVzdCAmJiBscycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgYXV0by1hcHByb3ZlIHJlZ3VsYXIgcGF0dGVybnMgd2l0aCBpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnZWNobyc6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBSZWd1bGFyIHBhdHRlcm5zIHNob3VsZCBub3QgYmUgbWF0Y2hlZCBieSBpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkXG5cdFx0XHRvayghaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnZWNobyBoZWxsbycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgcmVnZXggcGF0dGVybnMgd2l0aCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoQ29tbWFuZExpbmUoe1xuXHRcdFx0XHQnL2VjaG8uKndvcmxkLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0b2soaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnZWNobyBoZWxsbyB3b3JsZCcpKTtcblx0XHRcdG9rKCFpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBjYXNlLWluc2Vuc2l0aXZlIHJlZ2V4IHdpdGggbWF0Y2hDb21tYW5kTGluZTogdHJ1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aENvbW1hbmRMaW5lKHtcblx0XHRcdFx0Jy9lY2hvL2knOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfVxuXHRcdFx0fSk7XG5cblx0XHRcdG9rKGlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8nKSk7XG5cdFx0XHRvayhpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdFQ0hPIGhlbGxvJykpO1xuXHRcdFx0b2soaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnRWNobyBoZWxsbycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgY29tcGxleCBjb21tYW5kIGxpbmUgcGF0dGVybnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhDb21tYW5kTGluZSh7XG5cdFx0XHRcdCcvXm5wbSBydW4gYnVpbGQvJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sXG5cdFx0XHRcdCcvXFwucHMxL2knOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfVxuXHRcdFx0fSk7XG5cblx0XHRcdG9rKGlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ25wbSBydW4gYnVpbGQgLS1wcm9kdWN0aW9uJykpO1xuXHRcdFx0b2soaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgncG93ZXJzaGVsbCAtRmlsZSBzY3JpcHQucHMxJykpO1xuXHRcdFx0b2soaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgncHdzaCAtRmlsZSBTQ1JJUFQuUFMxJykpO1xuXHRcdFx0b2soIWlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ25wbSBpbnN0YWxsJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBmYWxzZSBmb3IgZW1wdHkgY29tbWFuZCBsaW5lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoQ29tbWFuZExpbmUoe1xuXHRcdFx0XHQnZWNobyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0b2soIWlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJycpKTtcblx0XHRcdG9rKCFpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCcgICAnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIG1peGVkIGNvbmZpZ3VyYXRpb24gd2l0aCBtYXRjaENvbW1hbmRMaW5lIGVudHJpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhDb21tYW5kTGluZSh7XG5cdFx0XHRcdCdlY2hvJzogdHJ1ZSwgIC8vIFJlZ3VsYXIgcGF0dGVyblxuXHRcdFx0XHQnbHMnOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSwgIC8vIENvbW1hbmQgbGluZSBwYXR0ZXJuXG5cdFx0XHRcdCdybSc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogZmFsc2UgfSAgLy8gRXhwbGljaXQgcmVndWxhciBwYXR0ZXJuXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gT25seSB0aGUgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSBlbnRyeSBzaG91bGQgd29yayB3aXRoIGlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWRcblx0XHRcdG9rKGlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ2xzIC1sYScpKTtcblx0XHRcdG9rKCFpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvJykpO1xuXHRcdFx0b2soIWlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ3JtIGZpbGUudHh0JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBkZW55IHBhdHRlcm5zIHdpdGggbWF0Y2hDb21tYW5kTGluZTogdHJ1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aENvbW1hbmRMaW5lKHtcblx0XHRcdFx0J2VjaG8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdFx0Jy9kYW5nZXJvdXMvJzogeyBhcHByb3ZlOiBmYWxzZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0b2soaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnZWNobyBoZWxsbycpKTtcblx0XHRcdG9rKCFpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdlY2hvIGRhbmdlcm91cyBjb21tYW5kJykpO1xuXHRcdFx0b2soIWlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ2Rhbmdlcm91cyBvcGVyYXRpb24nKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcHJpb3JpdGl6ZSBkZW55IGxpc3Qgb3ZlciBhbGxvdyBsaXN0IGZvciBjb21tYW5kIGxpbmUgcGF0dGVybnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhDb21tYW5kTGluZSh7XG5cdFx0XHRcdCcvZWNoby8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdFx0Jy9lY2hvLipkYW5nZXJvdXMvJzogeyBhcHByb3ZlOiBmYWxzZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0b2soaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnZWNobyBoZWxsbycpKTtcblx0XHRcdG9rKCFpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdlY2hvIGRhbmdlcm91cyBjb21tYW5kJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBjb21wbGV4IGRlbnkgcGF0dGVybnMgd2l0aCBtYXRjaENvbW1hbmRMaW5lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoQ29tbWFuZExpbmUoe1xuXHRcdFx0XHQnbnBtJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sXG5cdFx0XHRcdCcvbnBtLiotLWZvcmNlLyc6IHsgYXBwcm92ZTogZmFsc2UsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdFx0Jy9cXC5wczEuKi1FeGVjdXRpb25Qb2xpY3kvaSc6IHsgYXBwcm92ZTogZmFsc2UsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfVxuXHRcdFx0fSk7XG5cblx0XHRcdG9rKGlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ25wbSBpbnN0YWxsJykpO1xuXHRcdFx0b2soaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnbnBtIHJ1biBidWlsZCcpKTtcblx0XHRcdG9rKCFpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCducG0gaW5zdGFsbCAtLWZvcmNlJykpO1xuXHRcdFx0b2soIWlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ3Bvd2Vyc2hlbGwgLUZpbGUgc2NyaXB0LnBzMSAtRXhlY3V0aW9uUG9saWN5IEJ5cGFzcycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgcmVnZXggcGF0dGVybnMgd2l0aCBtYXRjaENvbW1hbmRMaW5lIHRoYXQgY291bGQgY2F1c2UgZW5kbGVzcyBsb29wcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aENvbW1hbmRMaW5lKHtcblx0XHRcdFx0Jy8vJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sXG5cdFx0XHRcdCcvKD86KS8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdFx0Jy8qLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LCAgICAgICAgICAgIC8vIEludmFsaWQgcmVnZXggcGF0dGVyblxuXHRcdFx0XHQnLy4qKi8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSAgICAgICAgICAgLy8gSW52YWxpZCByZWdleCBwYXR0ZXJuXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVGhlc2UgcGF0dGVybnMgc2hvdWxkIG5vdCBjYXVzZSBlbmRsZXNzIGxvb3BzIGFuZCBzaG91bGQgbm90IG1hdGNoIGFueSBjb21tYW5kc1xuXHRcdFx0Ly8gSW52YWxpZCBwYXR0ZXJucyBzaG91bGQgYmUgaGFuZGxlZCBncmFjZWZ1bGx5IGFuZCBub3QgbWF0Y2ggYW55dGhpbmdcblx0XHRcdG9rKCFpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvJykpO1xuXHRcdFx0b2soIWlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ2xzJykpO1xuXHRcdFx0b2soIWlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgcmVnZXggcGF0dGVybnMgd2l0aCBtYXRjaENvbW1hbmRMaW5lIHRoYXQgd291bGQgY2F1c2UgZW5kbGVzcyBsb29wcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aENvbW1hbmRMaW5lKHtcblx0XHRcdFx0Jy9hKi8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdFx0Jy9iPy8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdFx0Jy8oeHwpKi8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdFx0Jy8oPzopKi8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIENvbW1hbmRzIHNob3VsZCBzdGlsbCB3b3JrIG5vcm1hbGx5LCBlbmRsZXNzIGxvb3AgcGF0dGVybnMgc2hvdWxkIGJlIHNhZmVseSBoYW5kbGVkXG5cdFx0XHRvayghaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnZWNobyBoZWxsbycpKTtcblx0XHRcdG9rKCFpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdscycpKTtcblx0XHRcdG9rKCFpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdhJykpO1xuXHRcdFx0b2soIWlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ2InKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIG1peGVkIHZhbGlkIGFuZCBwcm9ibGVtYXRpYyByZWdleCBwYXR0ZXJucyB3aXRoIG1hdGNoQ29tbWFuZExpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhDb21tYW5kTGluZSh7XG5cdFx0XHRcdCcvXmVjaG8vJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sICAgICAgICAvLyBWYWxpZCBwYXR0ZXJuXG5cdFx0XHRcdCcvLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LCAgICAgICAgICAgICAvLyBFbXB0eSBwYXR0ZXJuXG5cdFx0XHRcdCcvXmxzLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LCAgICAgICAgICAvLyBWYWxpZCBwYXR0ZXJuXG5cdFx0XHRcdCcvYSovJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sICAgICAgICAgICAvLyBQb3RlbnRpYWwgZW5kbGVzcyBsb29wXG5cdFx0XHRcdCdwd2QnOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSAgICAgICAgICAgICAvLyBWYWxpZCBzdHJpbmcgcGF0dGVyblxuXHRcdFx0fSk7XG5cblx0XHRcdG9rKGlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8nKSk7XG5cdFx0XHRvayhpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdscyAtbGEnKSk7XG5cdFx0XHRvayhpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdwd2QnKSk7XG5cdFx0XHRvayghaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgncm0gZmlsZScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgaW52YWxpZCByZWdleCBwYXR0ZXJucyB3aXRoIG1hdGNoQ29tbWFuZExpbmUgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aENvbW1hbmRMaW5lKHtcblx0XHRcdFx0Jy8qLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LCAgICAgICAgICAgICAgICAgICAgLy8gSW52YWxpZCByZWdleCAtIG5vdGhpbmcgdG8gcmVwZWF0XG5cdFx0XHRcdCcvKD86Ky8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSwgICAgICAgICAgICAgICAgIC8vIEludmFsaWQgcmVnZXggLSBpbmNvbXBsZXRlIHF1YW50aWZpZXJcblx0XHRcdFx0Jy9bLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LCAgICAgICAgICAgICAgICAgICAgLy8gSW52YWxpZCByZWdleCAtIHVuY2xvc2VkIGNoYXJhY3RlciBjbGFzc1xuXHRcdFx0XHQnL15lY2hvLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LCAgICAgICAgICAgICAgICAvLyBWYWxpZCBwYXR0ZXJuXG5cdFx0XHRcdCdscyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9ICAgICAgICAgICAgICAgICAgICAgIC8vIFZhbGlkIHN0cmluZyBwYXR0ZXJuXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVmFsaWQgcGF0dGVybnMgc2hvdWxkIHN0aWxsIHdvcmtcblx0XHRcdG9rKGlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8nKSk7XG5cdFx0XHRvayhpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdscyAtbGEnKSk7XG5cdFx0XHQvLyBJbnZhbGlkIHBhdHRlcm5zIHNob3VsZCBub3QgbWF0Y2ggYW55dGhpbmcgYW5kIG5vdCBjYXVzZSBjcmFzaGVzXG5cdFx0XHRvayghaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgncmFuZG9tIGNvbW1hbmQnKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZWFzb25zJywgKCkgPT4ge1xuXHRcdGFzeW5jIGZ1bmN0aW9uIGdldENvbW1hbmRSZWFzb24oY29tbWFuZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRcdHJldHVybiAoYXdhaXQgY29tbWFuZExpbmVBdXRvQXBwcm92ZXIuaXNDb21tYW5kQXV0b0FwcHJvdmVkKGNvbW1hbmQsIHNoZWxsLCBvcywgdW5kZWZpbmVkKSkucmVhc29uO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGdldENvbW1hbmRMaW5lUmVhc29uKGNvbW1hbmRMaW5lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRMaW5lQXV0b0FwcHJvdmVyLmlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoY29tbWFuZExpbmUpLnJlYXNvbjtcblx0XHR9XG5cblx0XHRzdWl0ZSgnY29tbWFuZCcsICgpID0+IHtcblx0XHRcdHRlc3QoJ2FwcHJvdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRBdXRvQXBwcm92ZSh7IGVjaG86IHRydWUgfSk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGdldENvbW1hbmRSZWFzb24oJ2VjaG8gaGVsbG8nKSwgYENvbW1hbmQgJ2VjaG8gaGVsbG8nIGlzIGFwcHJvdmVkIGJ5IGFsbG93IGxpc3QgcnVsZTogZWNob2ApO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdub3QgYXBwcm92ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldEF1dG9BcHByb3ZlKHsgZWNobzogZmFsc2UgfSk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGdldENvbW1hbmRSZWFzb24oJ2VjaG8gaGVsbG8nKSwgYENvbW1hbmQgJ2VjaG8gaGVsbG8nIGlzIGRlbmllZCBieSBkZW55IGxpc3QgcnVsZTogZWNob2ApO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdubyBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0QXV0b0FwcHJvdmUoe30pO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBnZXRDb21tYW5kUmVhc29uKCdlY2hvIGhlbGxvJyksIGBDb21tYW5kICdlY2hvIGhlbGxvJyBoYXMgbm8gbWF0Y2hpbmcgYXV0byBhcHByb3ZlIGVudHJpZXNgKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2NvbW1hbmQgbGluZScsICgpID0+IHtcblx0XHRcdHRlc3QoJ2FwcHJvdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhDb21tYW5kTGluZSh7IGVjaG86IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9IH0pO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChnZXRDb21tYW5kTGluZVJlYXNvbignZWNobyBoZWxsbycpLCBgQ29tbWFuZCBsaW5lICdlY2hvIGhlbGxvJyBpcyBhcHByb3ZlZCBieSBhbGxvdyBsaXN0IHJ1bGU6IGVjaG9gKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnbm90IGFwcHJvdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhDb21tYW5kTGluZSh7IGVjaG86IHsgYXBwcm92ZTogZmFsc2UsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSB9KTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoZ2V0Q29tbWFuZExpbmVSZWFzb24oJ2VjaG8gaGVsbG8nKSwgYENvbW1hbmQgbGluZSAnZWNobyBoZWxsbycgaXMgZGVuaWVkIGJ5IGRlbnkgbGlzdCBydWxlOiBlY2hvYCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ25vIG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhDb21tYW5kTGluZSh7fSk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGdldENvbW1hbmRMaW5lUmVhc29uKCdlY2hvIGhlbGxvJyksIGBDb21tYW5kIGxpbmUgJ2VjaG8gaGVsbG8nIGhhcyBubyBtYXRjaGluZyBhdXRvIGFwcHJvdmUgZW50cmllc2ApO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpc0RlZmF1bHRSdWxlIGxvZ2ljJywgKCkgPT4ge1xuXHRcdGFzeW5jIGZ1bmN0aW9uIGdldElzRGVmYXVsdFJ1bGUoY29tbWFuZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuIHwgdW5kZWZpbmVkPiB7XG5cdFx0XHRjb25zdCBydWxlID0gKGF3YWl0IGNvbW1hbmRMaW5lQXV0b0FwcHJvdmVyLmlzQ29tbWFuZEF1dG9BcHByb3ZlZChjb21tYW5kLCBzaGVsbCwgb3MsIHVuZGVmaW5lZCkpLnJ1bGU7XG5cdFx0XHRyZXR1cm4gaXNBdXRvQXBwcm92ZVJ1bGUocnVsZSkgPyBydWxlLmlzRGVmYXVsdFJ1bGUgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZ2V0Q29tbWFuZExpbmVJc0RlZmF1bHRSdWxlKGNvbW1hbmRMaW5lOiBzdHJpbmcpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRcdGNvbnN0IHJ1bGUgPSBjb21tYW5kTGluZUF1dG9BcHByb3Zlci5pc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKGNvbW1hbmRMaW5lKS5ydWxlO1xuXHRcdFx0cmV0dXJuIGlzQXV0b0FwcHJvdmVSdWxlKHJ1bGUpID8gcnVsZS5pc0RlZmF1bHRSdWxlIDogdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHNldEF1dG9BcHByb3ZlV2l0aERlZmF1bHRzKHVzZXJDb25maWc6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9LCBkZWZhdWx0Q29uZmlnOiB7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfSkge1xuXHRcdFx0Ly8gU2V0IHVwIG1vY2sgY29uZmlndXJhdGlvbiB3aXRoIGRlZmF1bHQgdmFsdWVzXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlLCB1c2VyQ29uZmlnKTtcblxuXHRcdFx0Ly8gTW9jayB0aGUgaW5zcGVjdCBtZXRob2QgdG8gcmV0dXJuIGRlZmF1bHQgdmFsdWVzXG5cdFx0XHRjb25zdCBvcmlnaW5hbEluc3BlY3QgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0O1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxHZXRWYWx1ZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlO1xuXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0ID0gKGtleTogc3RyaW5nKTogYW55ID0+IHtcblx0XHRcdFx0aWYgKGtleSA9PT0gVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZSkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiBkZWZhdWx0Q29uZmlnIH0sXG5cdFx0XHRcdFx0XHR1c2VyOiB7IHZhbHVlOiB1c2VyQ29uZmlnIH0sXG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHdvcmtzcGFjZUZvbGRlcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0YXBwbGljYXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHBvbGljeTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bWVtb3J5OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR2YWx1ZTogeyAuLi5kZWZhdWx0Q29uZmlnLCAuLi51c2VyQ29uZmlnIH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBvcmlnaW5hbEluc3BlY3QuY2FsbChjb25maWd1cmF0aW9uU2VydmljZSwga2V5KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlID0gKGtleTogc3RyaW5nKTogYW55ID0+IHtcblx0XHRcdFx0aWYgKGtleSA9PT0gVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZSkge1xuXHRcdFx0XHRcdHJldHVybiB7IC4uLmRlZmF1bHRDb25maWcsIC4uLnVzZXJDb25maWcgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxHZXRWYWx1ZS5jYWxsKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBrZXkpO1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gVHJpZ2dlciBjb25maWd1cmF0aW9uIHVwZGF0ZVxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246ICgpID0+IHRydWUsXG5cdFx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZV0pLFxuXHRcdFx0XHRzb3VyY2U6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdFx0Y2hhbmdlOiBudWxsISxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHNldEF1dG9BcHByb3ZlV2l0aERlZmF1bHRzQ29tbWFuZExpbmUoXG5cdFx0XHR1c2VyQ29uZmlnOiB7IFtrZXk6IHN0cmluZ106IHsgYXBwcm92ZTogYm9vbGVhbjsgbWF0Y2hDb21tYW5kTGluZT86IGJvb2xlYW4gfSB8IGJvb2xlYW4gfSxcblx0XHRcdGRlZmF1bHRDb25maWc6IHsgW2tleTogc3RyaW5nXTogeyBhcHByb3ZlOiBib29sZWFuOyBtYXRjaENvbW1hbmRMaW5lPzogYm9vbGVhbiB9IHwgYm9vbGVhbiB9XG5cdFx0KSB7XG5cdFx0XHQvLyBTZXQgdXAgbW9jayBjb25maWd1cmF0aW9uIHdpdGggZGVmYXVsdCB2YWx1ZXMgZm9yIGNvbW1hbmQgbGluZSBydWxlc1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZSwgdXNlckNvbmZpZyk7XG5cblx0XHRcdC8vIE1vY2sgdGhlIGluc3BlY3QgbWV0aG9kIHRvIHJldHVybiBkZWZhdWx0IHZhbHVlc1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxJbnNwZWN0ID0gY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDtcblx0XHRcdGNvbnN0IG9yaWdpbmFsR2V0VmFsdWUgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTtcblxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdCA9IDxUPihrZXk6IHN0cmluZyk6IGFueSA9PiB7XG5cdFx0XHRcdGlmIChrZXkgPT09IFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmUpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZGVmYXVsdDogeyB2YWx1ZTogZGVmYXVsdENvbmZpZyB9LFxuXHRcdFx0XHRcdFx0dXNlcjogeyB2YWx1ZTogdXNlckNvbmZpZyB9LFxuXHRcdFx0XHRcdFx0d29ya3NwYWNlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXI6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGFwcGxpY2F0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRwb2xpY3k6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdG1lbW9yeTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHsgLi4uZGVmYXVsdENvbmZpZywgLi4udXNlckNvbmZpZyB9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxJbnNwZWN0LmNhbGwoY29uZmlndXJhdGlvblNlcnZpY2UsIGtleSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSA9IChrZXk6IHN0cmluZyk6IGFueSA9PiB7XG5cdFx0XHRcdGlmIChrZXkgPT09IFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmUpIHtcblx0XHRcdFx0XHRyZXR1cm4geyAuLi5kZWZhdWx0Q29uZmlnLCAuLi51c2VyQ29uZmlnIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsR2V0VmFsdWUuY2FsbChjb25maWd1cmF0aW9uU2VydmljZSwga2V5KTtcblx0XHRcdH07XG5cblx0XHRcdC8vIFRyaWdnZXIgY29uZmlndXJhdGlvbiB1cGRhdGVcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRhZmZlY3RlZEtleXM6IG5ldyBTZXQoW1Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmVdKSxcblx0XHRcdFx0c291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsXG5cdFx0XHRcdGNoYW5nZTogbnVsbCEsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0ZXN0KCdzaG91bGQgY29ycmVjdGx5IGlkZW50aWZ5IGRlZmF1bHQgcnVsZXMgdnMgdXNlci1kZWZpbmVkIHJ1bGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoRGVmYXVsdHMoXG5cdFx0XHRcdHsgJ2VjaG8nOiB0cnVlLCAnbHMnOiB0cnVlLCAncHdkJzogZmFsc2UgfSxcblx0XHRcdFx0eyAnZWNobyc6IHRydWUsICdjYXQnOiB0cnVlIH1cblx0XHRcdCk7XG5cblx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGdldElzRGVmYXVsdFJ1bGUoJ2VjaG8gaGVsbG8nKSwgdHJ1ZSwgJ2VjaG8gaXMgaW4gYm90aCBkZWZhdWx0IGFuZCB1c2VyIGNvbmZpZyB3aXRoIHNhbWUgdmFsdWUgLSBzaG91bGQgYmUgbWFya2VkIGFzIGRlZmF1bHQnKTtcblx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGdldElzRGVmYXVsdFJ1bGUoJ2xzIC1sYScpLCBmYWxzZSwgJ2xzIGlzIG9ubHkgaW4gdXNlciBjb25maWcgLSBzaG91bGQgYmUgbWFya2VkIGFzIHVzZXItZGVmaW5lZCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0SXNEZWZhdWx0UnVsZSgncHdkJyksIGZhbHNlLCAncHdkIGlzIG9ubHkgaW4gdXNlciBjb25maWcgLSBzaG91bGQgYmUgbWFya2VkIGFzIHVzZXItZGVmaW5lZCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0SXNEZWZhdWx0UnVsZSgnY2F0IGZpbGUudHh0JyksIHRydWUsICdjYXQgaXMgaW4gYm90aCBkZWZhdWx0IGFuZCB1c2VyIGNvbmZpZyB3aXRoIHNhbWUgdmFsdWUgLSBzaG91bGQgYmUgbWFya2VkIGFzIGRlZmF1bHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBtYXJrIGFzIGRlZmF1bHQgd2hlbiBjb21tYW5kIGlzIG9ubHkgaW4gZGVmYXVsdCBjb25maWcgYnV0IG5vdCBpbiB1c2VyIGNvbmZpZycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aERlZmF1bHRzKFxuXHRcdFx0XHR7ICdlY2hvJzogdHJ1ZSwgJ2xzJzogdHJ1ZSB9LCAgLy8gVXNlciBjb25maWcgKGNhdCBpcyBOT1QgaGVyZSlcblx0XHRcdFx0eyAnZWNobyc6IHRydWUsICdjYXQnOiB0cnVlIH0gIC8vIERlZmF1bHQgY29uZmlnIChjYXQgSVMgaGVyZSlcblx0XHRcdCk7XG5cblx0XHRcdC8vIFRlc3QgdGhhdCBtZXJnZWQgY29uZmlnIGluY2x1ZGVzIGFsbCBjb21tYW5kc1xuXHRcdFx0c3RyaWN0RXF1YWwoKGF3YWl0IGNvbW1hbmRMaW5lQXV0b0FwcHJvdmVyLmlzQ29tbWFuZEF1dG9BcHByb3ZlZCgnZWNobycsIHNoZWxsLCBvcywgdW5kZWZpbmVkKSkucmVzdWx0LCAnYXBwcm92ZWQnLCAnZWNobyBzaG91bGQgYmUgYXBwcm92ZWQnKTtcblx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBjb21tYW5kTGluZUF1dG9BcHByb3Zlci5pc0NvbW1hbmRBdXRvQXBwcm92ZWQoJ2xzJywgc2hlbGwsIG9zLCB1bmRlZmluZWQpKS5yZXN1bHQsICdhcHByb3ZlZCcsICdscyBzaG91bGQgYmUgYXBwcm92ZWQnKTtcblxuXHRcdFx0Ly8gY2F0IHNob3VsZCBiZSBhcHByb3ZlZCBiZWNhdXNlIGl0J3MgaW4gdGhlIG1lcmdlZCBjb25maWdcblx0XHRcdGNvbnN0IGNhdFJlc3VsdCA9IGF3YWl0IGNvbW1hbmRMaW5lQXV0b0FwcHJvdmVyLmlzQ29tbWFuZEF1dG9BcHByb3ZlZCgnY2F0Jywgc2hlbGwsIG9zLCB1bmRlZmluZWQpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2F0UmVzdWx0LnJlc3VsdCwgJ2FwcHJvdmVkJywgJ2NhdCBzaG91bGQgYmUgYXBwcm92ZWQgZnJvbSBkZWZhdWx0IGNvbmZpZycpO1xuXG5cdFx0XHQvLyBjYXQgc2hvdWxkIGJlIG1hcmtlZCBhcyBkZWZhdWx0IHJ1bGUgc2luY2UgaXQgY29tZXMgZnJvbSBkZWZhdWx0IGNvbmZpZyBvbmx5XG5cdFx0XHRzdHJpY3RFcXVhbChpc0F1dG9BcHByb3ZlUnVsZShjYXRSZXN1bHQucnVsZSkgPyBjYXRSZXN1bHQucnVsZS5pc0RlZmF1bHRSdWxlIDogdW5kZWZpbmVkLCB0cnVlLCAnY2F0IGlzIG9ubHkgaW4gZGVmYXVsdCBjb25maWcsIG5vdCBpbiB1c2VyIGNvbmZpZyAtIHNob3VsZCBiZSBtYXJrZWQgYXMgZGVmYXVsdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBkZWZhdWx0IHJ1bGVzIHdpdGggZGlmZmVyZW50IHZhbHVlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aERlZmF1bHRzKFxuXHRcdFx0XHR7ICdlY2hvJzogdHJ1ZSwgJ3JtJzogdHJ1ZSB9LFxuXHRcdFx0XHR7ICdlY2hvJzogZmFsc2UsICdybSc6IHRydWUgfVxuXHRcdFx0KTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0SXNEZWZhdWx0UnVsZSgnZWNobyBoZWxsbycpLCBmYWxzZSwgJ2VjaG8gaGFzIGRpZmZlcmVudCB2YWx1ZXMgaW4gZGVmYXVsdCB2cyB1c2VyIC0gc2hvdWxkIGJlIG1hcmtlZCBhcyB1c2VyLWRlZmluZWQnKTtcblx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGdldElzRGVmYXVsdFJ1bGUoJ3JtIGZpbGUudHh0JyksIHRydWUsICdybSBoYXMgc2FtZSB2YWx1ZSBpbiBib3RoIC0gc2hvdWxkIGJlIG1hcmtlZCBhcyBkZWZhdWx0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHJlZ2V4IHBhdHRlcm5zIGFzIGRlZmF1bHQgcnVsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhEZWZhdWx0cyhcblx0XHRcdFx0eyAnL15naXQvJzogdHJ1ZSwgJy9ebnBtLyc6IGZhbHNlIH0sXG5cdFx0XHRcdHsgJy9eZ2l0Lyc6IHRydWUsICcvXmRvY2tlci8nOiB0cnVlIH1cblx0XHRcdCk7XG5cblx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGdldElzRGVmYXVsdFJ1bGUoJ2dpdCBzdGF0dXMnKSwgdHJ1ZSwgJ2dpdCBwYXR0ZXJuIG1hdGNoZXMgZGVmYXVsdCAtIHNob3VsZCBiZSBtYXJrZWQgYXMgZGVmYXVsdCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0SXNEZWZhdWx0UnVsZSgnbnBtIGluc3RhbGwnKSwgZmFsc2UsICducG0gcGF0dGVybiBpcyB1c2VyLW9ubHkgLSBzaG91bGQgYmUgbWFya2VkIGFzIHVzZXItZGVmaW5lZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtaXhlZCBzdHJpbmcgYW5kIHJlZ2V4IHBhdHRlcm5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoRGVmYXVsdHMoXG5cdFx0XHRcdHsgJ2VjaG8nOiB0cnVlLCAnL15scy8nOiBmYWxzZSB9LFxuXHRcdFx0XHR7ICdlY2hvJzogdHJ1ZSwgJ2NhdCc6IHRydWUgfVxuXHRcdFx0KTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0SXNEZWZhdWx0UnVsZSgnZWNobyBoZWxsbycpLCB0cnVlLCAnU3RyaW5nIHBhdHRlcm4gbWF0Y2hpbmcgZGVmYXVsdCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0SXNEZWZhdWx0UnVsZSgnbHMgLWxhJyksIGZhbHNlLCAnUmVnZXggcGF0dGVybiB1c2VyLWRlZmluZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgY29tbWFuZCBsaW5lIHJ1bGVzIHdpdGggaXNEZWZhdWx0UnVsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aERlZmF1bHRzQ29tbWFuZExpbmUoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQnZWNobyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdCdscyc6IHsgYXBwcm92ZTogZmFsc2UsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0J2VjaG8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdFx0XHQnY2F0JzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH1cblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0Q29tbWFuZExpbmVJc0RlZmF1bHRSdWxlKCdlY2hvIGhlbGxvIHdvcmxkJyksIHRydWUsICdlY2hvIG1hdGNoZXMgZGVmYXVsdCBjb25maWcgZXhhY3RseSB1c2luZyBzdHJ1Y3R1cmFsIGVxdWFsaXR5IC0gc2hvdWxkIGJlIG1hcmtlZCBhcyBkZWZhdWx0Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRDb21tYW5kTGluZUlzRGVmYXVsdFJ1bGUoJ2xzIC1sYScpLCBmYWxzZSwgJ2xzIGlzIHVzZXItZGVmaW5lZCBvbmx5IC0gc2hvdWxkIGJlIG1hcmtlZCBhcyB1c2VyLWRlZmluZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgY29tbWFuZCBsaW5lIHJ1bGVzIHdpdGggZGlmZmVyZW50IG1hdGNoQ29tbWFuZExpbmUgdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoRGVmYXVsdHNDb21tYW5kTGluZShcblx0XHRcdFx0e1xuXHRcdFx0XHRcdCdlY2hvJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sXG5cdFx0XHRcdFx0J2xzJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiBmYWxzZSB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQnZWNobyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogZmFsc2UgfSxcblx0XHRcdFx0XHQnbHMnOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IGZhbHNlIH1cblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0Q29tbWFuZExpbmVJc0RlZmF1bHRSdWxlKCdlY2hvIGhlbGxvJyksIGZhbHNlLCAnZWNobyBoYXMgZGlmZmVyZW50IG1hdGNoQ29tbWFuZExpbmUgdmFsdWUgLSBzaG91bGQgYmUgdXNlci1kZWZpbmVkJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRDb21tYW5kTGluZUlzRGVmYXVsdFJ1bGUoJ2xzIC1sYScpLCB1bmRlZmluZWQsICdscyBtYXRjaGVzIGV4YWN0bHkgLSBzaG91bGQgYmUgZGVmYXVsdCAoYnV0IHdvblxcJ3QgbWF0Y2ggY29tbWFuZCBsaW5lIGNoZWNrIHNpbmNlIG1hdGNoQ29tbWFuZExpbmUgaXMgZmFsc2UpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGJvb2xlYW4gdnMgb2JqZWN0IGZvcm1hdCBjb25zaXN0ZW5jeScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aERlZmF1bHRzQ29tbWFuZExpbmUoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQnZWNobyc6IHRydWUsXG5cdFx0XHRcdFx0J2xzJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdCdlY2hvJzogdHJ1ZSxcblx0XHRcdFx0XHQnbHMnOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfVxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBnZXRJc0RlZmF1bHRSdWxlKCdlY2hvIGhlbGxvJyksIHRydWUsICdCb29sZWFuIGZvcm1hdCBtYXRjaGluZyAtIHNob3VsZCBiZSBkZWZhdWx0Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRDb21tYW5kTGluZUlzRGVmYXVsdFJ1bGUoJ2xzIC1sYScpLCB0cnVlLCAnT2JqZWN0IGZvcm1hdCBtYXRjaGluZyB1c2luZyBzdHJ1Y3R1cmFsIGVxdWFsaXR5IC0gc2hvdWxkIGJlIGRlZmF1bHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIGZvciBub01hdGNoIGNhc2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoRGVmYXVsdHMoXG5cdFx0XHRcdHsgJ2VjaG8nOiB0cnVlIH0sXG5cdFx0XHRcdHsgJ2NhdCc6IHRydWUgfVxuXHRcdFx0KTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0SXNEZWZhdWx0UnVsZSgndW5rbm93bi1jb21tYW5kJyksIHVuZGVmaW5lZCwgJ0NvbW1hbmQgdGhhdCBtYXRjaGVzIG5laXRoZXIgdXNlciBub3IgZGVmYXVsdCBjb25maWcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldENvbW1hbmRMaW5lSXNEZWZhdWx0UnVsZSgndW5rbm93bi1jb21tYW5kJyksIHVuZGVmaW5lZCwgJ0NvbW1hbmQgdGhhdCBtYXRjaGVzIG5laXRoZXIgdXNlciBub3IgZGVmYXVsdCBjb25maWcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgY29uZmlndXJhdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhEZWZhdWx0cyhcblx0XHRcdFx0e30sXG5cdFx0XHRcdHt9XG5cdFx0XHQpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBnZXRJc0RlZmF1bHRSdWxlKCdlY2hvIGhlbGxvJyksIHVuZGVmaW5lZCk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRDb21tYW5kTGluZUlzRGVmYXVsdFJ1bGUoJ2VjaG8gaGVsbG8nKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgb25seSBkZWZhdWx0IGNvbmZpZyB3aXRoIG5vIHVzZXIgb3ZlcnJpZGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoRGVmYXVsdHMoXG5cdFx0XHRcdHt9LFxuXHRcdFx0XHR7ICdlY2hvJzogdHJ1ZSwgJ2xzJzogZmFsc2UgfVxuXHRcdFx0KTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0SXNEZWZhdWx0UnVsZSgnZWNobyBoZWxsbycpLCB0cnVlLCAnQ29tbWFuZHMgaW4gZGVmYXVsdCBjb25maWcgc2hvdWxkIGJlIG1hcmtlZCBhcyBkZWZhdWx0IHJ1bGVzIGV2ZW4gd2l0aCBlbXB0eSB1c2VyIGNvbmZpZycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0SXNEZWZhdWx0UnVsZSgnbHMgLWxhJyksIHRydWUsICdDb21tYW5kcyBpbiBkZWZhdWx0IGNvbmZpZyBzaG91bGQgYmUgbWFya2VkIGFzIGRlZmF1bHQgcnVsZXMgZXZlbiB3aXRoIGVtcHR5IHVzZXIgY29uZmlnJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGNvbXBsZXggbmVzdGVkIG9iamVjdCBydWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aERlZmF1bHRzQ29tbWFuZExpbmUoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQnbnBtJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sXG5cdFx0XHRcdFx0J2dpdCc6IHsgYXBwcm92ZTogZmFsc2UsIG1hdGNoQ29tbWFuZExpbmU6IGZhbHNlIH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdCducG0nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdFx0XHQnZG9ja2VyJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH1cblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0Q29tbWFuZExpbmVJc0RlZmF1bHRSdWxlKCducG0gaW5zdGFsbCcpLCB0cnVlLCAnbnBtIG1hdGNoZXMgZGVmYXVsdCBleGFjdGx5IHVzaW5nIHN0cnVjdHVyYWwgZXF1YWxpdHkgLSBzaG91bGQgYmUgZGVmYXVsdCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0Q29tbWFuZExpbmVJc0RlZmF1bHRSdWxlKCdnaXQgc3RhdHVzJyksIHVuZGVmaW5lZCwgJ2dpdCBpcyB1c2VyLWRlZmluZWQgLSBzaG91bGQgYmUgdXNlci1kZWZpbmVkIChidXQgd29uXFwndCBtYXRjaCBjb21tYW5kIGxpbmUgc2luY2UgbWF0Y2hDb21tYW5kTGluZSBpcyBmYWxzZSknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgUG93ZXJTaGVsbCBjYXNlLWluc2Vuc2l0aXZlIG1hdGNoaW5nIHdpdGggZGVmYXVsdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzaGVsbCA9ICdwd3NoJztcblx0XHRcdG9zID0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3M7XG5cblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aERlZmF1bHRzKFxuXHRcdFx0XHR7ICdHZXQtUHJvY2Vzcyc6IHRydWUgfSxcblx0XHRcdFx0eyAnR2V0LVByb2Nlc3MnOiB0cnVlIH1cblx0XHRcdCk7XG5cblx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGdldElzRGVmYXVsdFJ1bGUoJ0dldC1Qcm9jZXNzJyksIHRydWUsICdDYXNlLWluc2Vuc2l0aXZlIFBvd2VyU2hlbGwgY29tbWFuZCBtYXRjaGluZyBkZWZhdWx0Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBnZXRJc0RlZmF1bHRSdWxlKCdnZXQtcHJvY2VzcycpLCB0cnVlLCAnQ2FzZS1pbnNlbnNpdGl2ZSBQb3dlclNoZWxsIGNvbW1hbmQgbWF0Y2hpbmcgZGVmYXVsdCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0SXNEZWZhdWx0UnVsZSgnR0VULVBST0NFU1MnKSwgdHJ1ZSwgJ0Nhc2UtaW5zZW5zaXRpdmUgUG93ZXJTaGVsbCBjb21tYW5kIG1hdGNoaW5nIGRlZmF1bHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2Ugc3RydWN0dXJhbCBlcXVhbGl0eSBmb3Igb2JqZWN0IGNvbXBhcmlzb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUZXN0IHRoYXQgb2JqZWN0cyB3aXRoIHNhbWUgY29udGVudCBidXQgZGlmZmVyZW50IGluc3RhbmNlcyBhcmUgdHJlYXRlZCBhcyBlcXVhbFxuXHRcdFx0Y29uc3QgdXNlckNvbmZpZyA9IHsgJ3Rlc3QnOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSB9O1xuXHRcdFx0Y29uc3QgZGVmYXVsdENvbmZpZyA9IHsgJ3Rlc3QnOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSB9O1xuXG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhEZWZhdWx0c0NvbW1hbmRMaW5lKHVzZXJDb25maWcsIGRlZmF1bHRDb25maWcpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChnZXRDb21tYW5kTGluZUlzRGVmYXVsdFJ1bGUoJ3Rlc3QgY29tbWFuZCcpLCB0cnVlLCAnRXZlbiB0aG91Z2ggdXNlckNvbmZpZyBhbmQgZGVmYXVsdENvbmZpZyBhcmUgZGlmZmVyZW50IG9iamVjdCBpbnN0YW5jZXMsIHRoZXkgaGF2ZSB0aGUgc2FtZSBzdHJ1Y3R1cmUgYW5kIHZhbHVlcywgc28gc2hvdWxkIGJlIGNvbnNpZGVyZWQgZGVmYXVsdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRldGVjdCBzdHJ1Y3R1cmFsIGRpZmZlcmVuY2VzIGluIG9iamVjdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1c2VyQ29uZmlnID0geyAndGVzdCc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9IH07XG5cdFx0XHRjb25zdCBkZWZhdWx0Q29uZmlnID0geyAndGVzdCc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogZmFsc2UgfSB9O1xuXG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhEZWZhdWx0c0NvbW1hbmRMaW5lKHVzZXJDb25maWcsIGRlZmF1bHRDb25maWcpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChnZXRDb21tYW5kTGluZUlzRGVmYXVsdFJ1bGUoJ3Rlc3QgY29tbWFuZCcpLCBmYWxzZSwgJ09iamVjdHMgaGF2ZSBkaWZmZXJlbnQgbWF0Y2hDb21tYW5kTGluZSB2YWx1ZXMsIHNvIHNob3VsZCBiZSB1c2VyLWRlZmluZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbWl4ZWQgdHlwZXMgY29ycmVjdGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXNlckNvbmZpZyA9IHtcblx0XHRcdFx0J2NtZDEnOiB0cnVlLFxuXHRcdFx0XHQnY21kMic6IHsgYXBwcm92ZTogZmFsc2UsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDb25maWcgPSB7XG5cdFx0XHRcdCdjbWQxJzogdHJ1ZSxcblx0XHRcdFx0J2NtZDInOiB7IGFwcHJvdmU6IGZhbHNlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH1cblx0XHRcdH07XG5cblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aERlZmF1bHRzQ29tbWFuZExpbmUodXNlckNvbmZpZywgZGVmYXVsdENvbmZpZyk7XG5cblx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGdldElzRGVmYXVsdFJ1bGUoJ2NtZDEgYXJnJyksIHRydWUsICdCb29sZWFuIHR5cGUgc2hvdWxkIG1hdGNoIGRlZmF1bHQnKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldENvbW1hbmRMaW5lSXNEZWZhdWx0UnVsZSgnY21kMiBhcmcnKSwgdHJ1ZSwgJ09iamVjdCB0eXBlIHNob3VsZCBtYXRjaCBkZWZhdWx0IHVzaW5nIHN0cnVjdHVyYWwgZXF1YWxpdHkgKGV2ZW4gdGhvdWdoIGl0XFwncyBhIGRlbnkgcnVsZSknKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2lnbm9yZURlZmF1bHRBdXRvQXBwcm92ZVJ1bGVzJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIHNldEF1dG9BcHByb3ZlV2l0aERlZmF1bHRzKHVzZXJDb25maWc6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9LCBkZWZhdWx0Q29uZmlnOiB7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfSkge1xuXHRcdFx0Ly8gU2V0IHVwIG1vY2sgY29uZmlndXJhdGlvbiB3aXRoIGRlZmF1bHQgdmFsdWVzXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlLCB1c2VyQ29uZmlnKTtcblxuXHRcdFx0Ly8gTW9jayB0aGUgaW5zcGVjdCBtZXRob2QgdG8gcmV0dXJuIGRlZmF1bHQgdmFsdWVzXG5cdFx0XHRjb25zdCBvcmlnaW5hbEluc3BlY3QgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0O1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxHZXRWYWx1ZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlO1xuXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0ID0gKGtleTogc3RyaW5nKTogYW55ID0+IHtcblx0XHRcdFx0aWYgKGtleSA9PT0gVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZSkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiBkZWZhdWx0Q29uZmlnIH0sXG5cdFx0XHRcdFx0XHR1c2VyOiB7IHZhbHVlOiB1c2VyQ29uZmlnIH0sXG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHdvcmtzcGFjZUZvbGRlcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0YXBwbGljYXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHBvbGljeTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bWVtb3J5OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR2YWx1ZTogeyAuLi5kZWZhdWx0Q29uZmlnLCAuLi51c2VyQ29uZmlnIH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBvcmlnaW5hbEluc3BlY3QuY2FsbChjb25maWd1cmF0aW9uU2VydmljZSwga2V5KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlID0gKGtleTogc3RyaW5nKTogYW55ID0+IHtcblx0XHRcdFx0aWYgKGtleSA9PT0gVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZSkge1xuXHRcdFx0XHRcdHJldHVybiB7IC4uLmRlZmF1bHRDb25maWcsIC4uLnVzZXJDb25maWcgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxHZXRWYWx1ZS5jYWxsKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBrZXkpO1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gVHJpZ2dlciBjb25maWd1cmF0aW9uIHVwZGF0ZVxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246ICgpID0+IHRydWUsXG5cdFx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZV0pLFxuXHRcdFx0XHRzb3VyY2U6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdFx0Y2hhbmdlOiBudWxsISxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHNldElnbm9yZURlZmF1bHRBdXRvQXBwcm92ZVJ1bGVzKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0XHRzZXRDb25maWcoVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5JZ25vcmVEZWZhdWx0QXV0b0FwcHJvdmVSdWxlcywgdmFsdWUpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIGRlZmF1bHQgcnVsZXMgd2hlbiBpZ25vcmVEZWZhdWx0QXV0b0FwcHJvdmVSdWxlcyBpcyBmYWxzZSAoZGVmYXVsdCBiZWhhdmlvciknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhEZWZhdWx0cyhcblx0XHRcdFx0eyAnbHMnOiB0cnVlIH0sXG5cdFx0XHRcdHsgJ2VjaG8nOiB0cnVlLCAnY2F0JzogdHJ1ZSB9XG5cdFx0XHQpO1xuXHRcdFx0c2V0SWdub3JlRGVmYXVsdEF1dG9BcHByb3ZlUnVsZXMoZmFsc2UpO1xuXG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnbHMgLWxhJyksICdVc2VyLWRlZmluZWQgcnVsZSBzaG91bGQgd29yaycpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8nKSwgJ0RlZmF1bHQgcnVsZSBzaG91bGQgd29yayB3aGVuIG5vdCBpZ25vcmVkJyk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnY2F0IGZpbGUudHh0JyksICdEZWZhdWx0IHJ1bGUgc2hvdWxkIHdvcmsgd2hlbiBub3QgaWdub3JlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGV4Y2x1ZGUgZGVmYXVsdCBydWxlcyB3aGVuIGlnbm9yZURlZmF1bHRBdXRvQXBwcm92ZVJ1bGVzIGlzIHRydWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhEZWZhdWx0cyhcblx0XHRcdFx0eyAnbHMnOiB0cnVlIH0sXG5cdFx0XHRcdHsgJ2VjaG8nOiB0cnVlLCAnY2F0JzogdHJ1ZSB9XG5cdFx0XHQpO1xuXHRcdFx0c2V0SWdub3JlRGVmYXVsdEF1dG9BcHByb3ZlUnVsZXModHJ1ZSk7XG5cblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdscyAtbGEnKSwgJ1VzZXItZGVmaW5lZCBydWxlIHNob3VsZCBzdGlsbCB3b3JrJyk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8nKSwgJ0RlZmF1bHQgcnVsZSBzaG91bGQgYmUgaWdub3JlZCcpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdjYXQgZmlsZS50eHQnKSwgJ0RlZmF1bHQgcnVsZSBzaG91bGQgYmUgaWdub3JlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGF0dHJpYnV0ZSB3b3Jrc3BhY2UtZm9sZGVyLXNjb3BlZCBydWxlcyB0byBXT1JLU1BBQ0VfRk9MREVSIHRhcmdldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlckNvbmZpZyA9IHsgJ2dpdCc6IHRydWUgfTtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmUsIHdvcmtzcGFjZUZvbGRlckNvbmZpZyk7XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsSW5zcGVjdCA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q7XG5cdFx0XHRjb25zdCBvcmlnaW5hbEdldFZhbHVlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU7XG5cblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3QgPSAoa2V5OiBzdHJpbmcpOiBhbnkgPT4ge1xuXHRcdFx0XHRpZiAoa2V5ID09PSBUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGRlZmF1bHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHVzZXI6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHdvcmtzcGFjZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0d29ya3NwYWNlRm9sZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXJWYWx1ZTogd29ya3NwYWNlRm9sZGVyQ29uZmlnLFxuXHRcdFx0XHRcdFx0YXBwbGljYXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHBvbGljeTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bWVtb3J5OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR2YWx1ZTogd29ya3NwYWNlRm9sZGVyQ29uZmlnXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxJbnNwZWN0LmNhbGwoY29uZmlndXJhdGlvblNlcnZpY2UsIGtleSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSA9IChrZXk6IHN0cmluZyk6IGFueSA9PiB7XG5cdFx0XHRcdGlmIChrZXkgPT09IFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmUpIHtcblx0XHRcdFx0XHRyZXR1cm4gd29ya3NwYWNlRm9sZGVyQ29uZmlnO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBvcmlnaW5hbEdldFZhbHVlLmNhbGwoY29uZmlndXJhdGlvblNlcnZpY2UsIGtleSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlXSksXG5cdFx0XHRcdHNvdXJjZTogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSLFxuXHRcdFx0XHRjaGFuZ2U6IG51bGwhLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbW1hbmRMaW5lQXV0b0FwcHJvdmVyLmlzQ29tbWFuZEF1dG9BcHByb3ZlZCgnZ2l0IHN0YXR1cycsIHNoZWxsLCBvcywgdW5kZWZpbmVkKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdC5yZXN1bHQsICdhcHByb3ZlZCcsICdnaXQgY29tbWFuZCBzaG91bGQgYmUgYXBwcm92ZWQnKTtcblx0XHRcdG9rKGlzQXV0b0FwcHJvdmVSdWxlKHJlc3VsdC5ydWxlKSwgJ3Jlc3VsdCBzaG91bGQgaGF2ZSBhbiBhdXRvLWFwcHJvdmUgcnVsZScpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LnJ1bGUuc291cmNlVGFyZ2V0LCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIsICd3b3Jrc3BhY2UtZm9sZGVyLXNjb3BlZCBydWxlIHNob3VsZCBoYXZlIFdPUktTUEFDRV9GT0xERVIgc291cmNlIHRhcmdldCcpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxJQUFJLG1CQUFtQjtBQUNoQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHlCQUF5QjtBQUVs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
