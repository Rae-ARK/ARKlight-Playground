import { deepStrictEqual, strictEqual } from "assert";
import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { CommandLineBackgroundDetachRewriter } from "../../browser/tools/commandLineRewriter/commandLineBackgroundDetachRewriter.js";
import { TerminalChatAgentToolsSettingId } from "../../common/terminalChatAgentToolsConfiguration.js";
suite("CommandLineBackgroundDetachRewriter", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationService;
  let rewriter;
  function createOptions(command, shell, os, isBackground) {
    return {
      commandLine: command,
      cwd: void 0,
      shell,
      os,
      isBackground
    };
  }
  setup(() => {
    configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.DetachBackgroundProcesses, true);
    instantiationService = workbenchInstantiationService({
      configurationService: () => configurationService
    }, store);
    rewriter = store.add(instantiationService.createInstance(CommandLineBackgroundDetachRewriter));
  });
  test("should return undefined for foreground commands", () => {
    strictEqual(rewriter.rewrite(createOptions("echo hello", "/bin/bash", OperatingSystem.Linux, false)), void 0);
  });
  test("should return undefined when isBackground is not set", () => {
    strictEqual(rewriter.rewrite(createOptions("echo hello", "/bin/bash", OperatingSystem.Linux)), void 0);
  });
  test("should return undefined when setting is disabled", () => {
    configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.DetachBackgroundProcesses, false);
    strictEqual(rewriter.rewrite(createOptions("python3 app.py", "/bin/bash", OperatingSystem.Linux, true)), void 0);
  });
  suite("POSIX (bash)", () => {
    test("should wrap with nohup on Linux", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("python3 app.py", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: "nohup python3 app.py & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "python3 app.py"
      });
    });
    test("should wrap with nohup on macOS", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("flask run", "/bin/bash", OperatingSystem.Macintosh, true)), {
        rewritten: "nohup flask run & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "flask run"
      });
    });
    test("should not duplicate trailing & when command already backgrounds itself", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("pypi-server ... &", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: "nohup pypi-server ... & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "pypi-server ... &"
      });
    });
    test("should wrap chained commands in shell -c to preserve shell semantics", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("cd /app && python3 service.py &", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'cd /app && python3 service.py' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "cd /app && python3 service.py &"
      });
    });
    test("should trim trailing whitespace before detecting existing &", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("node server.js &   ", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: "nohup node server.js & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "node server.js &   "
      });
    });
  });
  suite("POSIX shell -c wrapping for compound commands and builtins", () => {
    test("for loop should be wrapped using bash shell path", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("for i in $(seq 1 90); do echo $i; sleep 1; done", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'for i in $(seq 1 90); do echo $i; sleep 1; done' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "for i in $(seq 1 90); do echo $i; sleep 1; done"
      });
    });
    test("while loop should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("while true; do sleep 1; done", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'while true; do sleep 1; done' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "while true; do sleep 1; done"
      });
    });
    test("if statement should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("if [ -f file ]; then cat file; fi", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'if [ -f file ]; then cat file; fi' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "if [ -f file ]; then cat file; fi"
      });
    });
    test("eval builtin should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("eval $SETUP_ENV && opam install coq --yes", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'eval $SETUP_ENV && opam install coq --yes' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "eval $SETUP_ENV && opam install coq --yes"
      });
    });
    test("set builtin should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("set -e; cmd1; cmd2", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'set -e; cmd1; cmd2' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "set -e; cmd1; cmd2"
      });
    });
    test("export builtin should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions('export PATH="/usr/local/bin:$PATH"; myapp', "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'export PATH="/usr/local/bin:$PATH"; myapp' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: 'export PATH="/usr/local/bin:$PATH"; myapp'
      });
    });
    test("dot-source builtin should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions(". /etc/profile; myapp", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c '. /etc/profile; myapp' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: ". /etc/profile; myapp"
      });
    });
    test("relative path ./script should NOT be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("./start.sh", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: "nohup ./start.sh & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "./start.sh"
      });
    });
    test("brace group should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("{ cmd1; cmd2; }", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c '{ cmd1; cmd2; }' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "{ cmd1; cmd2; }"
      });
    });
    test("single quotes in command should be properly escaped", () => {
      deepStrictEqual(rewriter.rewrite(createOptions(`for f in *.txt; do echo 'file:' $f; done`, "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'for f in *.txt; do echo '\\''file:'\\'' $f; done' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: `for f in *.txt; do echo 'file:' $f; done`
      });
    });
    test("simple external command should NOT be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("python3 app.py", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: "nohup python3 app.py & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "python3 app.py"
      });
    });
  });
  suite("POSIX inline env var assignments", () => {
    test("single env var assignment before command should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("OPAMROOT=/root/.opam opam install menhir", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'OPAMROOT=/root/.opam opam install menhir' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "OPAMROOT=/root/.opam opam install menhir"
      });
    });
    test("multiple env var assignments before command should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("OPAMROOT=/root/.opam OPAMYES=1 opam install menhir", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'OPAMROOT=/root/.opam OPAMYES=1 opam install menhir' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "OPAMROOT=/root/.opam OPAMYES=1 opam install menhir"
      });
    });
    test("env var with quoted value should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions('FOO="a b" cmd', "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'FOO="a b" cmd' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: 'FOO="a b" cmd'
      });
    });
    test("env command should NOT trigger env var detection", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("env FOO=1 cmd", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: "nohup env FOO=1 cmd & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "env FOO=1 cmd"
      });
    });
  });
  suite("POSIX shell operator wrapping", () => {
    test("pipe should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("cat log.txt | grep error", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'cat log.txt | grep error' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "cat log.txt | grep error"
      });
    });
    test("semicolon chain should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("cmd1; cmd2", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'cmd1; cmd2' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "cmd1; cmd2"
      });
    });
    test("&& chain should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("mkdir -p /tmp/build && make", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'mkdir -p /tmp/build && make' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "mkdir -p /tmp/build && make"
      });
    });
    test("|| chain should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("cmd1 || cmd2", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'cmd1 || cmd2' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "cmd1 || cmd2"
      });
    });
    test("cd builtin should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("cd /app", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'cd /app' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "cd /app"
      });
    });
    test("mid-command & (background operator) should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("server start & client connect", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'server start & client connect' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "server start & client connect"
      });
    });
  });
  suite("POSIX (zsh)", () => {
    test("should wrap with nohup", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("node server.js", "/bin/zsh", OperatingSystem.Linux, true)), {
        rewritten: "nohup node server.js & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "node server.js"
      });
    });
    test("for loop should be wrapped using zsh shell path", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("for i in $(seq 1 10); do echo $i; done", "/bin/zsh", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/zsh -c 'for i in $(seq 1 10); do echo $i; done' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "for i in $(seq 1 10); do echo $i; done"
      });
    });
  });
  suite("POSIX (fish)", () => {
    test("should wrap with nohup", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("ruby app.rb", "/usr/bin/fish", OperatingSystem.Linux, true)), {
        rewritten: "nohup ruby app.rb &",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "ruby app.rb"
      });
    });
    test("for loop should be wrapped using fish shell path with double-quote escaping", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("for i in (seq 1 10); echo $i; end", "/usr/bin/fish", OperatingSystem.Linux, true)), {
        rewritten: `nohup /usr/bin/fish -c "for i in (seq 1 10); echo $i; end" &`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "for i in (seq 1 10); echo $i; end"
      });
    });
    test("compound command with double quotes should be escaped for fish", () => {
      deepStrictEqual(rewriter.rewrite(createOptions('for f in *.txt; echo "file: $f"; end', "/usr/bin/fish", OperatingSystem.Linux, true)), {
        rewritten: `nohup /usr/bin/fish -c "for f in *.txt; echo \\"file: $f\\"; end" &`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: 'for f in *.txt; echo "file: $f"; end'
      });
    });
  });
  suite("Windows (PowerShell)", () => {
    test("should wrap with Start-Process for pwsh", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("python app.py", "C:\\Program Files\\PowerShell\\7\\pwsh.exe", OperatingSystem.Windows, true)), {
        rewritten: 'Start-Process -WindowStyle Hidden -FilePath "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -ArgumentList "-NoProfile", "-Command", "python app.py"',
        reasoning: "Wrapped background command with Start-Process to survive terminal shutdown",
        forDisplay: "python app.py"
      });
    });
    test("should wrap with Start-Process for Windows PowerShell", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("node server.js", "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", OperatingSystem.Windows, true)), {
        rewritten: 'Start-Process -WindowStyle Hidden -FilePath "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -ArgumentList "-NoProfile", "-Command", "node server.js"',
        reasoning: "Wrapped background command with Start-Process to survive terminal shutdown",
        forDisplay: "node server.js"
      });
    });
    test("should escape double quotes in PowerShell commands", () => {
      deepStrictEqual(rewriter.rewrite(createOptions('echo "hello world"', "C:\\Program Files\\PowerShell\\7\\pwsh.exe", OperatingSystem.Windows, true)), {
        rewritten: 'Start-Process -WindowStyle Hidden -FilePath "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -ArgumentList "-NoProfile", "-Command", "echo \\"hello world\\""',
        reasoning: "Wrapped background command with Start-Process to survive terminal shutdown",
        forDisplay: 'echo "hello world"'
      });
    });
    test("should return undefined for non-PowerShell Windows shell", () => {
      strictEqual(rewriter.rewrite(createOptions("echo hello", "cmd.exe", OperatingSystem.Windows, true)), void 0);
    });
  });
  suite("Interactive front-end skip", () => {
    const interactives = [
      "expect setup_vm.exp",
      "gdb ./a.out",
      "lldb ./a.out",
      "passwd",
      "vim file.txt",
      "nano notes.md",
      "less /var/log/syslog",
      "sftp user@host",
      "telnet host 23",
      "psql",
      "psql mydb",
      "mysql -u root",
      "ssh user@host",
      "sudo apt-get install -y foo"
    ];
    for (const cmd of interactives) {
      test(`should skip detach-wrap for interactive: ${cmd}`, () => {
        strictEqual(rewriter.rewrite(createOptions(cmd, "/bin/bash", OperatingSystem.Linux, true)), void 0);
      });
    }
    test("should still wrap psql when -c is passed (non-interactive)", () => {
      deepStrictEqual(rewriter.rewrite(createOptions('psql -c "select 1"', "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: 'nohup psql -c "select 1" & disown',
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: 'psql -c "select 1"'
      });
    });
    test("should still wrap mysql when -e is passed (non-interactive)", () => {
      deepStrictEqual(rewriter.rewrite(createOptions('mysql -e "show databases"', "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: 'nohup mysql -e "show databases" & disown',
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: 'mysql -e "show databases"'
      });
    });
    test("should still wrap ssh when running a remote command (non-interactive)", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("ssh -T user@host", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: "nohup ssh -T user@host & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "ssh -T user@host"
      });
    });
    test("should still wrap sudo when -n is passed (non-interactive)", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("sudo -n systemctl restart nginx", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: "nohup sudo -n systemctl restart nginx & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "sudo -n systemctl restart nginx"
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvY29tbWFuZExpbmVCYWNrZ3JvdW5kRGV0YWNoUmV3cml0ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgdHlwZSB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kTGluZUJhY2tncm91bmREZXRhY2hSZXdyaXRlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdG9vbHMvY29tbWFuZExpbmVSZXdyaXRlci9jb21tYW5kTGluZUJhY2tncm91bmREZXRhY2hSZXdyaXRlci5qcyc7XG5pbXBvcnQgdHlwZSB7IElDb21tYW5kTGluZVJld3JpdGVyT3B0aW9ucyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdG9vbHMvY29tbWFuZExpbmVSZXdyaXRlci9jb21tYW5kTGluZVJld3JpdGVyLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi9jb21tb24vdGVybWluYWxDaGF0QWdlbnRUb29sc0NvbmZpZ3VyYXRpb24uanMnO1xuXG5zdWl0ZSgnQ29tbWFuZExpbmVCYWNrZ3JvdW5kRGV0YWNoUmV3cml0ZXInLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBjb25maWd1cmF0aW9uU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRsZXQgcmV3cml0ZXI6IENvbW1hbmRMaW5lQmFja2dyb3VuZERldGFjaFJld3JpdGVyO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU9wdGlvbnMoY29tbWFuZDogc3RyaW5nLCBzaGVsbDogc3RyaW5nLCBvczogT3BlcmF0aW5nU3lzdGVtLCBpc0JhY2tncm91bmQ/OiBib29sZWFuKTogSUNvbW1hbmRMaW5lUmV3cml0ZXJPcHRpb25zIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29tbWFuZExpbmU6IGNvbW1hbmQsXG5cdFx0XHRjd2Q6IHVuZGVmaW5lZCxcblx0XHRcdHNoZWxsLFxuXHRcdFx0b3MsXG5cdFx0XHRpc0JhY2tncm91bmQsXG5cdFx0fTtcblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkRldGFjaEJhY2tncm91bmRQcm9jZXNzZXMsIHRydWUpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IGNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0fSwgc3RvcmUpO1xuXHRcdHJld3JpdGVyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbW1hbmRMaW5lQmFja2dyb3VuZERldGFjaFJld3JpdGVyKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIGZvciBmb3JlZ3JvdW5kIGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdHN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnZWNobyBoZWxsbycsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIGZhbHNlKSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIHdoZW4gaXNCYWNrZ3JvdW5kIGlzIG5vdCBzZXQnLCAoKSA9PiB7XG5cdFx0c3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdlY2hvIGhlbGxvJywgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCB3aGVuIHNldHRpbmcgaXMgZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5EZXRhY2hCYWNrZ3JvdW5kUHJvY2Vzc2VzLCBmYWxzZSk7XG5cdFx0c3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdweXRob24zIGFwcC5weScsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0c3VpdGUoJ1BPU0lYIChiYXNoKScsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgd3JhcCB3aXRoIG5vaHVwIG9uIExpbnV4JywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygncHl0aG9uMyBhcHAucHknLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiAnbm9odXAgcHl0aG9uMyBhcHAucHkgJiBkaXNvd24nLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAncHl0aG9uMyBhcHAucHknLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgd3JhcCB3aXRoIG5vaHVwIG9uIG1hY09TJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnZmxhc2sgcnVuJywgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2gsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46ICdub2h1cCBmbGFzayBydW4gJiBkaXNvd24nLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnZmxhc2sgcnVuJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBkdXBsaWNhdGUgdHJhaWxpbmcgJiB3aGVuIGNvbW1hbmQgYWxyZWFkeSBiYWNrZ3JvdW5kcyBpdHNlbGYnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdweXBpLXNlcnZlciAuLi4gJicsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46ICdub2h1cCBweXBpLXNlcnZlciAuLi4gJiBkaXNvd24nLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAncHlwaS1zZXJ2ZXIgLi4uICYnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgd3JhcCBjaGFpbmVkIGNvbW1hbmRzIGluIHNoZWxsIC1jIHRvIHByZXNlcnZlIHNoZWxsIHNlbWFudGljcycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ2NkIC9hcHAgJiYgcHl0aG9uMyBzZXJ2aWNlLnB5ICYnLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiBgbm9odXAgL2Jpbi9iYXNoIC1jICdjZCAvYXBwICYmIHB5dGhvbjMgc2VydmljZS5weScgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnY2QgL2FwcCAmJiBweXRob24zIHNlcnZpY2UucHkgJicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0cmltIHRyYWlsaW5nIHdoaXRlc3BhY2UgYmVmb3JlIGRldGVjdGluZyBleGlzdGluZyAmJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnbm9kZSBzZXJ2ZXIuanMgJiAgICcsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46ICdub2h1cCBub2RlIHNlcnZlci5qcyAmIGRpc293bicsXG5cdFx0XHRcdHJlYXNvbmluZzogJ1dyYXBwZWQgYmFja2dyb3VuZCBjb21tYW5kIHdpdGggbm9odXAgdG8gc3Vydml2ZSB0ZXJtaW5hbCBzaHV0ZG93bicsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICdub2RlIHNlcnZlci5qcyAmICAgJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnUE9TSVggc2hlbGwgLWMgd3JhcHBpbmcgZm9yIGNvbXBvdW5kIGNvbW1hbmRzIGFuZCBidWlsdGlucycsICgpID0+IHtcblx0XHR0ZXN0KCdmb3IgbG9vcCBzaG91bGQgYmUgd3JhcHBlZCB1c2luZyBiYXNoIHNoZWxsIHBhdGgnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdmb3IgaSBpbiAkKHNlcSAxIDkwKTsgZG8gZWNobyAkaTsgc2xlZXAgMTsgZG9uZScsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46IGBub2h1cCAvYmluL2Jhc2ggLWMgJ2ZvciBpIGluICQoc2VxIDEgOTApOyBkbyBlY2hvICRpOyBzbGVlcCAxOyBkb25lJyAmIGRpc293bmAsXG5cdFx0XHRcdHJlYXNvbmluZzogJ1dyYXBwZWQgYmFja2dyb3VuZCBjb21tYW5kIHdpdGggbm9odXAgdG8gc3Vydml2ZSB0ZXJtaW5hbCBzaHV0ZG93bicsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICdmb3IgaSBpbiAkKHNlcSAxIDkwKTsgZG8gZWNobyAkaTsgc2xlZXAgMTsgZG9uZScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3doaWxlIGxvb3Agc2hvdWxkIGJlIHdyYXBwZWQgaW4gc2hlbGwgLWMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCd3aGlsZSB0cnVlOyBkbyBzbGVlcCAxOyBkb25lJywgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogYG5vaHVwIC9iaW4vYmFzaCAtYyAnd2hpbGUgdHJ1ZTsgZG8gc2xlZXAgMTsgZG9uZScgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnd2hpbGUgdHJ1ZTsgZG8gc2xlZXAgMTsgZG9uZScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lmIHN0YXRlbWVudCBzaG91bGQgYmUgd3JhcHBlZCBpbiBzaGVsbCAtYycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ2lmIFsgLWYgZmlsZSBdOyB0aGVuIGNhdCBmaWxlOyBmaScsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46IGBub2h1cCAvYmluL2Jhc2ggLWMgJ2lmIFsgLWYgZmlsZSBdOyB0aGVuIGNhdCBmaWxlOyBmaScgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnaWYgWyAtZiBmaWxlIF07IHRoZW4gY2F0IGZpbGU7IGZpJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXZhbCBidWlsdGluIHNob3VsZCBiZSB3cmFwcGVkIGluIHNoZWxsIC1jJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnZXZhbCAkU0VUVVBfRU5WICYmIG9wYW0gaW5zdGFsbCBjb3EgLS15ZXMnLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiBgbm9odXAgL2Jpbi9iYXNoIC1jICdldmFsICRTRVRVUF9FTlYgJiYgb3BhbSBpbnN0YWxsIGNvcSAtLXllcycgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnZXZhbCAkU0VUVVBfRU5WICYmIG9wYW0gaW5zdGFsbCBjb3EgLS15ZXMnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXQgYnVpbHRpbiBzaG91bGQgYmUgd3JhcHBlZCBpbiBzaGVsbCAtYycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ3NldCAtZTsgY21kMTsgY21kMicsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46IGBub2h1cCAvYmluL2Jhc2ggLWMgJ3NldCAtZTsgY21kMTsgY21kMicgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnc2V0IC1lOyBjbWQxOyBjbWQyJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhwb3J0IGJ1aWx0aW4gc2hvdWxkIGJlIHdyYXBwZWQgaW4gc2hlbGwgLWMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdleHBvcnQgUEFUSD1cIi91c3IvbG9jYWwvYmluOiRQQVRIXCI7IG15YXBwJywgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogYG5vaHVwIC9iaW4vYmFzaCAtYyAnZXhwb3J0IFBBVEg9XCIvdXNyL2xvY2FsL2JpbjokUEFUSFwiOyBteWFwcCcgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnZXhwb3J0IFBBVEg9XCIvdXNyL2xvY2FsL2JpbjokUEFUSFwiOyBteWFwcCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvdC1zb3VyY2UgYnVpbHRpbiBzaG91bGQgYmUgd3JhcHBlZCBpbiBzaGVsbCAtYycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJy4gL2V0Yy9wcm9maWxlOyBteWFwcCcsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46IGBub2h1cCAvYmluL2Jhc2ggLWMgJy4gL2V0Yy9wcm9maWxlOyBteWFwcCcgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnLiAvZXRjL3Byb2ZpbGU7IG15YXBwJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVsYXRpdmUgcGF0aCAuL3NjcmlwdCBzaG91bGQgTk9UIGJlIHdyYXBwZWQgaW4gc2hlbGwgLWMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCcuL3N0YXJ0LnNoJywgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogJ25vaHVwIC4vc3RhcnQuc2ggJiBkaXNvd24nLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnLi9zdGFydC5zaCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2JyYWNlIGdyb3VwIHNob3VsZCBiZSB3cmFwcGVkIGluIHNoZWxsIC1jJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygneyBjbWQxOyBjbWQyOyB9JywgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogYG5vaHVwIC9iaW4vYmFzaCAtYyAneyBjbWQxOyBjbWQyOyB9JyAmIGRpc293bmAsXG5cdFx0XHRcdHJlYXNvbmluZzogJ1dyYXBwZWQgYmFja2dyb3VuZCBjb21tYW5kIHdpdGggbm9odXAgdG8gc3Vydml2ZSB0ZXJtaW5hbCBzaHV0ZG93bicsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICd7IGNtZDE7IGNtZDI7IH0nLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW5nbGUgcXVvdGVzIGluIGNvbW1hbmQgc2hvdWxkIGJlIHByb3Blcmx5IGVzY2FwZWQnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKGBmb3IgZiBpbiAqLnR4dDsgZG8gZWNobyAnZmlsZTonICRmOyBkb25lYCwgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogYG5vaHVwIC9iaW4vYmFzaCAtYyAnZm9yIGYgaW4gKi50eHQ7IGRvIGVjaG8gJ1xcXFwnJ2ZpbGU6J1xcXFwnJyAkZjsgZG9uZScgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiBgZm9yIGYgaW4gKi50eHQ7IGRvIGVjaG8gJ2ZpbGU6JyAkZjsgZG9uZWAsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NpbXBsZSBleHRlcm5hbCBjb21tYW5kIHNob3VsZCBOT1QgYmUgd3JhcHBlZCBpbiBzaGVsbCAtYycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ3B5dGhvbjMgYXBwLnB5JywgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogJ25vaHVwIHB5dGhvbjMgYXBwLnB5ICYgZGlzb3duJyxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ3B5dGhvbjMgYXBwLnB5Jyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnUE9TSVggaW5saW5lIGVudiB2YXIgYXNzaWdubWVudHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2luZ2xlIGVudiB2YXIgYXNzaWdubWVudCBiZWZvcmUgY29tbWFuZCBzaG91bGQgYmUgd3JhcHBlZCBpbiBzaGVsbCAtYycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ09QQU1ST09UPS9yb290Ly5vcGFtIG9wYW0gaW5zdGFsbCBtZW5oaXInLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiBgbm9odXAgL2Jpbi9iYXNoIC1jICdPUEFNUk9PVD0vcm9vdC8ub3BhbSBvcGFtIGluc3RhbGwgbWVuaGlyJyAmIGRpc293bmAsXG5cdFx0XHRcdHJlYXNvbmluZzogJ1dyYXBwZWQgYmFja2dyb3VuZCBjb21tYW5kIHdpdGggbm9odXAgdG8gc3Vydml2ZSB0ZXJtaW5hbCBzaHV0ZG93bicsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICdPUEFNUk9PVD0vcm9vdC8ub3BhbSBvcGFtIGluc3RhbGwgbWVuaGlyJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlwbGUgZW52IHZhciBhc3NpZ25tZW50cyBiZWZvcmUgY29tbWFuZCBzaG91bGQgYmUgd3JhcHBlZCBpbiBzaGVsbCAtYycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ09QQU1ST09UPS9yb290Ly5vcGFtIE9QQU1ZRVM9MSBvcGFtIGluc3RhbGwgbWVuaGlyJywgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogYG5vaHVwIC9iaW4vYmFzaCAtYyAnT1BBTVJPT1Q9L3Jvb3QvLm9wYW0gT1BBTVlFUz0xIG9wYW0gaW5zdGFsbCBtZW5oaXInICYgZGlzb3duYCxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ09QQU1ST09UPS9yb290Ly5vcGFtIE9QQU1ZRVM9MSBvcGFtIGluc3RhbGwgbWVuaGlyJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW52IHZhciB3aXRoIHF1b3RlZCB2YWx1ZSBzaG91bGQgYmUgd3JhcHBlZCBpbiBzaGVsbCAtYycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ0ZPTz1cImEgYlwiIGNtZCcsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46IGBub2h1cCAvYmluL2Jhc2ggLWMgJ0ZPTz1cImEgYlwiIGNtZCcgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnRk9PPVwiYSBiXCIgY21kJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW52IGNvbW1hbmQgc2hvdWxkIE5PVCB0cmlnZ2VyIGVudiB2YXIgZGV0ZWN0aW9uJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnZW52IEZPTz0xIGNtZCcsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46ICdub2h1cCBlbnYgRk9PPTEgY21kICYgZGlzb3duJyxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ2VudiBGT089MSBjbWQnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdQT1NJWCBzaGVsbCBvcGVyYXRvciB3cmFwcGluZycsICgpID0+IHtcblx0XHR0ZXN0KCdwaXBlIHNob3VsZCBiZSB3cmFwcGVkIGluIHNoZWxsIC1jJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnY2F0IGxvZy50eHQgfCBncmVwIGVycm9yJywgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogYG5vaHVwIC9iaW4vYmFzaCAtYyAnY2F0IGxvZy50eHQgfCBncmVwIGVycm9yJyAmIGRpc293bmAsXG5cdFx0XHRcdHJlYXNvbmluZzogJ1dyYXBwZWQgYmFja2dyb3VuZCBjb21tYW5kIHdpdGggbm9odXAgdG8gc3Vydml2ZSB0ZXJtaW5hbCBzaHV0ZG93bicsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICdjYXQgbG9nLnR4dCB8IGdyZXAgZXJyb3InLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZW1pY29sb24gY2hhaW4gc2hvdWxkIGJlIHdyYXBwZWQgaW4gc2hlbGwgLWMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdjbWQxOyBjbWQyJywgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogYG5vaHVwIC9iaW4vYmFzaCAtYyAnY21kMTsgY21kMicgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnY21kMTsgY21kMicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJyYmIGNoYWluIHNob3VsZCBiZSB3cmFwcGVkIGluIHNoZWxsIC1jJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnbWtkaXIgLXAgL3RtcC9idWlsZCAmJiBtYWtlJywgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogYG5vaHVwIC9iaW4vYmFzaCAtYyAnbWtkaXIgLXAgL3RtcC9idWlsZCAmJiBtYWtlJyAmIGRpc293bmAsXG5cdFx0XHRcdHJlYXNvbmluZzogJ1dyYXBwZWQgYmFja2dyb3VuZCBjb21tYW5kIHdpdGggbm9odXAgdG8gc3Vydml2ZSB0ZXJtaW5hbCBzaHV0ZG93bicsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICdta2RpciAtcCAvdG1wL2J1aWxkICYmIG1ha2UnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd8fCBjaGFpbiBzaG91bGQgYmUgd3JhcHBlZCBpbiBzaGVsbCAtYycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ2NtZDEgfHwgY21kMicsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46IGBub2h1cCAvYmluL2Jhc2ggLWMgJ2NtZDEgfHwgY21kMicgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnY21kMSB8fCBjbWQyJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2QgYnVpbHRpbiBzaG91bGQgYmUgd3JhcHBlZCBpbiBzaGVsbCAtYycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ2NkIC9hcHAnLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiBgbm9odXAgL2Jpbi9iYXNoIC1jICdjZCAvYXBwJyAmIGRpc293bmAsXG5cdFx0XHRcdHJlYXNvbmluZzogJ1dyYXBwZWQgYmFja2dyb3VuZCBjb21tYW5kIHdpdGggbm9odXAgdG8gc3Vydml2ZSB0ZXJtaW5hbCBzaHV0ZG93bicsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICdjZCAvYXBwJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWlkLWNvbW1hbmQgJiAoYmFja2dyb3VuZCBvcGVyYXRvcikgc2hvdWxkIGJlIHdyYXBwZWQgaW4gc2hlbGwgLWMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdzZXJ2ZXIgc3RhcnQgJiBjbGllbnQgY29ubmVjdCcsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46IGBub2h1cCAvYmluL2Jhc2ggLWMgJ3NlcnZlciBzdGFydCAmIGNsaWVudCBjb25uZWN0JyAmIGRpc293bmAsXG5cdFx0XHRcdHJlYXNvbmluZzogJ1dyYXBwZWQgYmFja2dyb3VuZCBjb21tYW5kIHdpdGggbm9odXAgdG8gc3Vydml2ZSB0ZXJtaW5hbCBzaHV0ZG93bicsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICdzZXJ2ZXIgc3RhcnQgJiBjbGllbnQgY29ubmVjdCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1BPU0lYICh6c2gpJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCB3cmFwIHdpdGggbm9odXAnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdub2RlIHNlcnZlci5qcycsICcvYmluL3pzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogJ25vaHVwIG5vZGUgc2VydmVyLmpzICYgZGlzb3duJyxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ25vZGUgc2VydmVyLmpzJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9yIGxvb3Agc2hvdWxkIGJlIHdyYXBwZWQgdXNpbmcgenNoIHNoZWxsIHBhdGgnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdmb3IgaSBpbiAkKHNlcSAxIDEwKTsgZG8gZWNobyAkaTsgZG9uZScsICcvYmluL3pzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogYG5vaHVwIC9iaW4venNoIC1jICdmb3IgaSBpbiAkKHNlcSAxIDEwKTsgZG8gZWNobyAkaTsgZG9uZScgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnZm9yIGkgaW4gJChzZXEgMSAxMCk7IGRvIGVjaG8gJGk7IGRvbmUnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdQT1NJWCAoZmlzaCknLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHdyYXAgd2l0aCBub2h1cCcsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ3J1YnkgYXBwLnJiJywgJy91c3IvYmluL2Zpc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46ICdub2h1cCBydWJ5IGFwcC5yYiAmJyxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ3J1YnkgYXBwLnJiJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9yIGxvb3Agc2hvdWxkIGJlIHdyYXBwZWQgdXNpbmcgZmlzaCBzaGVsbCBwYXRoIHdpdGggZG91YmxlLXF1b3RlIGVzY2FwaW5nJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnZm9yIGkgaW4gKHNlcSAxIDEwKTsgZWNobyAkaTsgZW5kJywgJy91c3IvYmluL2Zpc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46IGBub2h1cCAvdXNyL2Jpbi9maXNoIC1jIFwiZm9yIGkgaW4gKHNlcSAxIDEwKTsgZWNobyAkaTsgZW5kXCIgJmAsXG5cdFx0XHRcdHJlYXNvbmluZzogJ1dyYXBwZWQgYmFja2dyb3VuZCBjb21tYW5kIHdpdGggbm9odXAgdG8gc3Vydml2ZSB0ZXJtaW5hbCBzaHV0ZG93bicsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICdmb3IgaSBpbiAoc2VxIDEgMTApOyBlY2hvICRpOyBlbmQnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wb3VuZCBjb21tYW5kIHdpdGggZG91YmxlIHF1b3RlcyBzaG91bGQgYmUgZXNjYXBlZCBmb3IgZmlzaCcsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ2ZvciBmIGluICoudHh0OyBlY2hvIFwiZmlsZTogJGZcIjsgZW5kJywgJy91c3IvYmluL2Zpc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46IGBub2h1cCAvdXNyL2Jpbi9maXNoIC1jIFwiZm9yIGYgaW4gKi50eHQ7IGVjaG8gXFxcXFwiZmlsZTogJGZcXFxcXCI7IGVuZFwiICZgLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnZm9yIGYgaW4gKi50eHQ7IGVjaG8gXCJmaWxlOiAkZlwiOyBlbmQnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdXaW5kb3dzIChQb3dlclNoZWxsKScsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgd3JhcCB3aXRoIFN0YXJ0LVByb2Nlc3MgZm9yIHB3c2gnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdweXRob24gYXBwLnB5JywgJ0M6XFxcXFByb2dyYW0gRmlsZXNcXFxcUG93ZXJTaGVsbFxcXFw3XFxcXHB3c2guZXhlJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46ICdTdGFydC1Qcm9jZXNzIC1XaW5kb3dTdHlsZSBIaWRkZW4gLUZpbGVQYXRoIFwiQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxQb3dlclNoZWxsXFxcXDdcXFxccHdzaC5leGVcIiAtQXJndW1lbnRMaXN0IFwiLU5vUHJvZmlsZVwiLCBcIi1Db21tYW5kXCIsIFwicHl0aG9uIGFwcC5weVwiJyxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBTdGFydC1Qcm9jZXNzIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAncHl0aG9uIGFwcC5weScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB3cmFwIHdpdGggU3RhcnQtUHJvY2VzcyBmb3IgV2luZG93cyBQb3dlclNoZWxsJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnbm9kZSBzZXJ2ZXIuanMnLCAnQzpcXFxcV0lORE9XU1xcXFxTeXN0ZW0zMlxcXFxXaW5kb3dzUG93ZXJTaGVsbFxcXFx2MS4wXFxcXHBvd2Vyc2hlbGwuZXhlJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46ICdTdGFydC1Qcm9jZXNzIC1XaW5kb3dTdHlsZSBIaWRkZW4gLUZpbGVQYXRoIFwiQzpcXFxcV0lORE9XU1xcXFxTeXN0ZW0zMlxcXFxXaW5kb3dzUG93ZXJTaGVsbFxcXFx2MS4wXFxcXHBvd2Vyc2hlbGwuZXhlXCIgLUFyZ3VtZW50TGlzdCBcIi1Ob1Byb2ZpbGVcIiwgXCItQ29tbWFuZFwiLCBcIm5vZGUgc2VydmVyLmpzXCInLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIFN0YXJ0LVByb2Nlc3MgdG8gc3Vydml2ZSB0ZXJtaW5hbCBzaHV0ZG93bicsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICdub2RlIHNlcnZlci5qcycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBlc2NhcGUgZG91YmxlIHF1b3RlcyBpbiBQb3dlclNoZWxsIGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnZWNobyBcImhlbGxvIHdvcmxkXCInLCAnQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxQb3dlclNoZWxsXFxcXDdcXFxccHdzaC5leGUnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cywgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogJ1N0YXJ0LVByb2Nlc3MgLVdpbmRvd1N0eWxlIEhpZGRlbiAtRmlsZVBhdGggXCJDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXFBvd2VyU2hlbGxcXFxcN1xcXFxwd3NoLmV4ZVwiIC1Bcmd1bWVudExpc3QgXCItTm9Qcm9maWxlXCIsIFwiLUNvbW1hbmRcIiwgXCJlY2hvIFxcXFxcImhlbGxvIHdvcmxkXFxcXFwiXCInLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIFN0YXJ0LVByb2Nlc3MgdG8gc3Vydml2ZSB0ZXJtaW5hbCBzaHV0ZG93bicsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICdlY2hvIFwiaGVsbG8gd29ybGRcIicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIGZvciBub24tUG93ZXJTaGVsbCBXaW5kb3dzIHNoZWxsJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdlY2hvIGhlbGxvJywgJ2NtZC5leGUnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cywgdHJ1ZSkpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnSW50ZXJhY3RpdmUgZnJvbnQtZW5kIHNraXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW50ZXJhY3RpdmVzID0gW1xuXHRcdFx0J2V4cGVjdCBzZXR1cF92bS5leHAnLFxuXHRcdFx0J2dkYiAuL2Eub3V0Jyxcblx0XHRcdCdsbGRiIC4vYS5vdXQnLFxuXHRcdFx0J3Bhc3N3ZCcsXG5cdFx0XHQndmltIGZpbGUudHh0Jyxcblx0XHRcdCduYW5vIG5vdGVzLm1kJyxcblx0XHRcdCdsZXNzIC92YXIvbG9nL3N5c2xvZycsXG5cdFx0XHQnc2Z0cCB1c2VyQGhvc3QnLFxuXHRcdFx0J3RlbG5ldCBob3N0IDIzJyxcblx0XHRcdCdwc3FsJyxcblx0XHRcdCdwc3FsIG15ZGInLFxuXHRcdFx0J215c3FsIC11IHJvb3QnLFxuXHRcdFx0J3NzaCB1c2VyQGhvc3QnLFxuXHRcdFx0J3N1ZG8gYXB0LWdldCBpbnN0YWxsIC15IGZvbycsXG5cdFx0XTtcblx0XHRmb3IgKGNvbnN0IGNtZCBvZiBpbnRlcmFjdGl2ZXMpIHtcblx0XHRcdHRlc3QoYHNob3VsZCBza2lwIGRldGFjaC13cmFwIGZvciBpbnRlcmFjdGl2ZTogJHtjbWR9YCwgKCkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoY21kLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0ZXN0KCdzaG91bGQgc3RpbGwgd3JhcCBwc3FsIHdoZW4gLWMgaXMgcGFzc2VkIChub24taW50ZXJhY3RpdmUpJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygncHNxbCAtYyBcInNlbGVjdCAxXCInLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiAnbm9odXAgcHNxbCAtYyBcInNlbGVjdCAxXCIgJiBkaXNvd24nLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAncHNxbCAtYyBcInNlbGVjdCAxXCInLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3RpbGwgd3JhcCBteXNxbCB3aGVuIC1lIGlzIHBhc3NlZCAobm9uLWludGVyYWN0aXZlKScsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ215c3FsIC1lIFwic2hvdyBkYXRhYmFzZXNcIicsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46ICdub2h1cCBteXNxbCAtZSBcInNob3cgZGF0YWJhc2VzXCIgJiBkaXNvd24nLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnbXlzcWwgLWUgXCJzaG93IGRhdGFiYXNlc1wiJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN0aWxsIHdyYXAgc3NoIHdoZW4gcnVubmluZyBhIHJlbW90ZSBjb21tYW5kIChub24taW50ZXJhY3RpdmUpJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnc3NoIC1UIHVzZXJAaG9zdCcsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46ICdub2h1cCBzc2ggLVQgdXNlckBob3N0ICYgZGlzb3duJyxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ3NzaCAtVCB1c2VyQGhvc3QnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3RpbGwgd3JhcCBzdWRvIHdoZW4gLW4gaXMgcGFzc2VkIChub24taW50ZXJhY3RpdmUpJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnc3VkbyAtbiBzeXN0ZW1jdGwgcmVzdGFydCBuZ2lueCcsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46ICdub2h1cCBzdWRvIC1uIHN5c3RlbWN0bCByZXN0YXJ0IG5naW54ICYgZGlzb3duJyxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ3N1ZG8gLW4gc3lzdGVtY3RsIHJlc3RhcnQgbmdpbngnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGlCQUFpQixtQkFBbUI7QUFDN0MsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUywyQ0FBMkM7QUFFcEQsU0FBUyx1Q0FBdUM7QUFFaEQsTUFBTSx1Q0FBdUMsTUFBTTtBQUNsRCxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUVKLFdBQVMsY0FBYyxTQUFpQixPQUFlLElBQXFCLGNBQXFEO0FBQ2hJLFdBQU87QUFBQSxNQUNOLGFBQWE7QUFBQSxNQUNiLEtBQUs7QUFBQSxNQUNMO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLFFBQU0sTUFBTTtBQUNYLDJCQUF1QixJQUFJLHlCQUF5QjtBQUNwRCx5QkFBcUIscUJBQXFCLGdDQUFnQywyQkFBMkIsSUFBSTtBQUN6RywyQkFBdUIsOEJBQThCO0FBQUEsTUFDcEQsc0JBQXNCLE1BQU07QUFBQSxJQUM3QixHQUFHLEtBQUs7QUFDUixlQUFXLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSxtQ0FBbUMsQ0FBQztBQUFBLEVBQzlGLENBQUM7QUFFRCxPQUFLLG1EQUFtRCxNQUFNO0FBQzdELGdCQUFZLFNBQVMsUUFBUSxjQUFjLGNBQWMsYUFBYSxnQkFBZ0IsT0FBTyxLQUFLLENBQUMsR0FBRyxNQUFTO0FBQUEsRUFDaEgsQ0FBQztBQUVELE9BQUssd0RBQXdELE1BQU07QUFDbEUsZ0JBQVksU0FBUyxRQUFRLGNBQWMsY0FBYyxhQUFhLGdCQUFnQixLQUFLLENBQUMsR0FBRyxNQUFTO0FBQUEsRUFDekcsQ0FBQztBQUVELE9BQUssb0RBQW9ELE1BQU07QUFDOUQseUJBQXFCLHFCQUFxQixnQ0FBZ0MsMkJBQTJCLEtBQUs7QUFDMUcsZ0JBQVksU0FBUyxRQUFRLGNBQWMsa0JBQWtCLGFBQWEsZ0JBQWdCLE9BQU8sSUFBSSxDQUFDLEdBQUcsTUFBUztBQUFBLEVBQ25ILENBQUM7QUFFRCxRQUFNLGdCQUFnQixNQUFNO0FBQzNCLFNBQUssbUNBQW1DLE1BQU07QUFDN0Msc0JBQWdCLFNBQVMsUUFBUSxjQUFjLGtCQUFrQixhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDNUcsV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssbUNBQW1DLE1BQU07QUFDN0Msc0JBQWdCLFNBQVMsUUFBUSxjQUFjLGFBQWEsYUFBYSxnQkFBZ0IsV0FBVyxJQUFJLENBQUMsR0FBRztBQUFBLFFBQzNHLFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxRQUNYLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDJFQUEyRSxNQUFNO0FBQ3JGLHNCQUFnQixTQUFTLFFBQVEsY0FBYyxxQkFBcUIsYUFBYSxnQkFBZ0IsT0FBTyxJQUFJLENBQUMsR0FBRztBQUFBLFFBQy9HLFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxRQUNYLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHdFQUF3RSxNQUFNO0FBQ2xGLHNCQUFnQixTQUFTLFFBQVEsY0FBYyxtQ0FBbUMsYUFBYSxnQkFBZ0IsT0FBTyxJQUFJLENBQUMsR0FBRztBQUFBLFFBQzdILFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxRQUNYLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLCtEQUErRCxNQUFNO0FBQ3pFLHNCQUFnQixTQUFTLFFBQVEsY0FBYyx1QkFBdUIsYUFBYSxnQkFBZ0IsT0FBTyxJQUFJLENBQUMsR0FBRztBQUFBLFFBQ2pILFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxRQUNYLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLDhEQUE4RCxNQUFNO0FBQ3pFLFNBQUssb0RBQW9ELE1BQU07QUFDOUQsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLG1EQUFtRCxhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDN0ksV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssNENBQTRDLE1BQU07QUFDdEQsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLGdDQUFnQyxhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDMUgsV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssOENBQThDLE1BQU07QUFDeEQsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLHFDQUFxQyxhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDL0gsV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssOENBQThDLE1BQU07QUFDeEQsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLDZDQUE2QyxhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDdkksV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssNkNBQTZDLE1BQU07QUFDdkQsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLHNCQUFzQixhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDaEgsV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssZ0RBQWdELE1BQU07QUFDMUQsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLDZDQUE2QyxhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDdkksV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssb0RBQW9ELE1BQU07QUFDOUQsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLHlCQUF5QixhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDbkgsV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssNERBQTRELE1BQU07QUFDdEUsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLGNBQWMsYUFBYSxnQkFBZ0IsT0FBTyxJQUFJLENBQUMsR0FBRztBQUFBLFFBQ3hHLFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxRQUNYLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDZDQUE2QyxNQUFNO0FBQ3ZELHNCQUFnQixTQUFTLFFBQVEsY0FBYyxtQkFBbUIsYUFBYSxnQkFBZ0IsT0FBTyxJQUFJLENBQUMsR0FBRztBQUFBLFFBQzdHLFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxRQUNYLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLHNCQUFnQixTQUFTLFFBQVEsY0FBYyw0Q0FBNEMsYUFBYSxnQkFBZ0IsT0FBTyxJQUFJLENBQUMsR0FBRztBQUFBLFFBQ3RJLFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxRQUNYLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDZEQUE2RCxNQUFNO0FBQ3ZFLHNCQUFnQixTQUFTLFFBQVEsY0FBYyxrQkFBa0IsYUFBYSxnQkFBZ0IsT0FBTyxJQUFJLENBQUMsR0FBRztBQUFBLFFBQzVHLFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxRQUNYLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLG9DQUFvQyxNQUFNO0FBQy9DLFNBQUssMEVBQTBFLE1BQU07QUFDcEYsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLDRDQUE0QyxhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDdEksV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssNkVBQTZFLE1BQU07QUFDdkYsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLHNEQUFzRCxhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDaEosV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssMkRBQTJELE1BQU07QUFDckUsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLGlCQUFpQixhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDM0csV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssb0RBQW9ELE1BQU07QUFDOUQsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLGlCQUFpQixhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDM0csV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0saUNBQWlDLE1BQU07QUFDNUMsU0FBSyxzQ0FBc0MsTUFBTTtBQUNoRCxzQkFBZ0IsU0FBUyxRQUFRLGNBQWMsNEJBQTRCLGFBQWEsZ0JBQWdCLE9BQU8sSUFBSSxDQUFDLEdBQUc7QUFBQSxRQUN0SCxXQUFXO0FBQUEsUUFDWCxXQUFXO0FBQUEsUUFDWCxZQUFZO0FBQUEsTUFDYixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxpREFBaUQsTUFBTTtBQUMzRCxzQkFBZ0IsU0FBUyxRQUFRLGNBQWMsY0FBYyxhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDeEcsV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssMENBQTBDLE1BQU07QUFDcEQsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLCtCQUErQixhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDekgsV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssMENBQTBDLE1BQU07QUFDcEQsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLGdCQUFnQixhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDMUcsV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssNENBQTRDLE1BQU07QUFDdEQsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLFdBQVcsYUFBYSxnQkFBZ0IsT0FBTyxJQUFJLENBQUMsR0FBRztBQUFBLFFBQ3JHLFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxRQUNYLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHFFQUFxRSxNQUFNO0FBQy9FLHNCQUFnQixTQUFTLFFBQVEsY0FBYyxpQ0FBaUMsYUFBYSxnQkFBZ0IsT0FBTyxJQUFJLENBQUMsR0FBRztBQUFBLFFBQzNILFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxRQUNYLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLGVBQWUsTUFBTTtBQUMxQixTQUFLLDBCQUEwQixNQUFNO0FBQ3BDLHNCQUFnQixTQUFTLFFBQVEsY0FBYyxrQkFBa0IsWUFBWSxnQkFBZ0IsT0FBTyxJQUFJLENBQUMsR0FBRztBQUFBLFFBQzNHLFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxRQUNYLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLG1EQUFtRCxNQUFNO0FBQzdELHNCQUFnQixTQUFTLFFBQVEsY0FBYywwQ0FBMEMsWUFBWSxnQkFBZ0IsT0FBTyxJQUFJLENBQUMsR0FBRztBQUFBLFFBQ25JLFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxRQUNYLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLGdCQUFnQixNQUFNO0FBQzNCLFNBQUssMEJBQTBCLE1BQU07QUFDcEMsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLGVBQWUsaUJBQWlCLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDN0csV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssK0VBQStFLE1BQU07QUFDekYsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLHFDQUFxQyxpQkFBaUIsZ0JBQWdCLE9BQU8sSUFBSSxDQUFDLEdBQUc7QUFBQSxRQUNuSSxXQUFXO0FBQUEsUUFDWCxXQUFXO0FBQUEsUUFDWCxZQUFZO0FBQUEsTUFDYixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxrRUFBa0UsTUFBTTtBQUM1RSxzQkFBZ0IsU0FBUyxRQUFRLGNBQWMsd0NBQXdDLGlCQUFpQixnQkFBZ0IsT0FBTyxJQUFJLENBQUMsR0FBRztBQUFBLFFBQ3RJLFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxRQUNYLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHdCQUF3QixNQUFNO0FBQ25DLFNBQUssMkNBQTJDLE1BQU07QUFDckQsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLGlCQUFpQiw4Q0FBOEMsZ0JBQWdCLFNBQVMsSUFBSSxDQUFDLEdBQUc7QUFBQSxRQUM5SSxXQUFXO0FBQUEsUUFDWCxXQUFXO0FBQUEsUUFDWCxZQUFZO0FBQUEsTUFDYixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyx5REFBeUQsTUFBTTtBQUNuRSxzQkFBZ0IsU0FBUyxRQUFRLGNBQWMsa0JBQWtCLGtFQUFrRSxnQkFBZ0IsU0FBUyxJQUFJLENBQUMsR0FBRztBQUFBLFFBQ25LLFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxRQUNYLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHNEQUFzRCxNQUFNO0FBQ2hFLHNCQUFnQixTQUFTLFFBQVEsY0FBYyxzQkFBc0IsOENBQThDLGdCQUFnQixTQUFTLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDbkosV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssNERBQTRELE1BQU07QUFDdEUsa0JBQVksU0FBUyxRQUFRLGNBQWMsY0FBYyxXQUFXLGdCQUFnQixTQUFTLElBQUksQ0FBQyxHQUFHLE1BQVM7QUFBQSxJQUMvRyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSw4QkFBOEIsTUFBTTtBQUN6QyxVQUFNLGVBQWU7QUFBQSxNQUNwQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0EsZUFBVyxPQUFPLGNBQWM7QUFDL0IsV0FBSyw0Q0FBNEMsR0FBRyxJQUFJLE1BQU07QUFDN0Qsb0JBQVksU0FBUyxRQUFRLGNBQWMsS0FBSyxhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHLE1BQVM7QUFBQSxNQUN0RyxDQUFDO0FBQUEsSUFDRjtBQUVBLFNBQUssOERBQThELE1BQU07QUFDeEUsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLHNCQUFzQixhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDaEgsV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssK0RBQStELE1BQU07QUFDekUsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLDZCQUE2QixhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDdkgsV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUsseUVBQXlFLE1BQU07QUFDbkYsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLG9CQUFvQixhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDOUcsV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssOERBQThELE1BQU07QUFDeEUsc0JBQWdCLFNBQVMsUUFBUSxjQUFjLG1DQUFtQyxhQUFhLGdCQUFnQixPQUFPLElBQUksQ0FBQyxHQUFHO0FBQUEsUUFDN0gsV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
