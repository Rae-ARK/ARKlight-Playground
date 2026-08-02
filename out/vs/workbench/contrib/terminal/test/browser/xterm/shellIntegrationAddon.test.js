import { deepEqual, deepStrictEqual, strictEqual } from "assert";
import * as sinon from "sinon";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { TerminalCapability } from "../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { deserializeVSCodeOscMessage, serializeVSCodeOscMessage, parseKeyValueAssignment, parseMarkSequence, ShellIntegrationAddon } from "../../../../../../platform/terminal/common/xterm/shellIntegrationAddon.js";
import { writeP } from "../../../browser/terminalTestHelpers.js";
import { TestXtermLogger } from "../../../../../../platform/terminal/test/common/terminalTestHelpers.js";
class TestShellIntegrationAddon extends ShellIntegrationAddon {
  getCommandDetectionMock(terminal) {
    const capability = super._createOrGetCommandDetection(terminal);
    this.capabilities.add(TerminalCapability.CommandDetection, capability);
    return sinon.mock(capability);
  }
  getCwdDectionMock() {
    const capability = super._createOrGetCwdDetection();
    this.capabilities.add(TerminalCapability.CwdDetection, capability);
    return sinon.mock(capability);
  }
}
suite("ShellIntegrationAddon", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let xterm;
  let shellIntegrationAddon;
  let capabilities;
  setup(async () => {
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    xterm = store.add(new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 30, logger: TestXtermLogger }));
    shellIntegrationAddon = store.add(new TestShellIntegrationAddon("", true, void 0, void 0, new NullLogService()));
    xterm.loadAddon(shellIntegrationAddon);
    capabilities = shellIntegrationAddon.capabilities;
  });
  suite("cwd detection", () => {
    test("should activate capability on the cwd sequence (OSC 633 ; P ; Cwd=<cwd> ST)", async () => {
      strictEqual(capabilities.has(TerminalCapability.CwdDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.CwdDetection), false);
      await writeP(xterm, "\x1B]633;P;Cwd=/foo\x07");
      strictEqual(capabilities.has(TerminalCapability.CwdDetection), true);
    });
    test("should pass cwd sequence to the capability as trusted when nonce matches", async () => {
      const mock = shellIntegrationAddon.getCwdDectionMock();
      mock.expects("updateCwd").once().withExactArgs("/foo", true);
      await writeP(xterm, "\x1B]633;P;Cwd=/foo;\x07");
      mock.verify();
    });
    test("should treat cwd sequence as untrusted when nonce is missing", async () => {
      const mock = shellIntegrationAddon.getCwdDectionMock();
      mock.expects("updateCwd").once().withExactArgs("/foo", false);
      await writeP(xterm, "\x1B]633;P;Cwd=/foo\x07");
      mock.verify();
    });
    test("should treat cwd sequence as untrusted when nonce does not match", async () => {
      const mock = shellIntegrationAddon.getCwdDectionMock();
      mock.expects("updateCwd").once().withExactArgs("/foo", false);
      await writeP(xterm, "\x1B]633;P;Cwd=/foo;invalid-nonce\x07");
      mock.verify();
    });
    test("detect ITerm sequence: `OSC 1337 ; CurrentDir=<Cwd> ST`", async () => {
      const cases = [
        ["root", "/", "/"],
        ["non-root", "/some/path", "/some/path"]
      ];
      for (const x of cases) {
        const [title, input, expected] = x;
        const mock = shellIntegrationAddon.getCwdDectionMock();
        mock.expects("updateCwd").once().withExactArgs(expected, false).named(title);
        await writeP(xterm, `\x1B]1337;CurrentDir=${input}\x07`);
        mock.verify();
      }
    });
    suite("detect `SetCwd` sequence: `OSC 7; scheme://cwd ST`", () => {
      test("should accept well-formatted URLs", async () => {
        const cases = [
          // Different hostname values:
          ["empty hostname, pointing root", "file:///", "/"],
          ["empty hostname", "file:///test-root/local", "/test-root/local"],
          ["non-empty hostname", "file://some-hostname/test-root/local", "/test-root/local"],
          // URL-encoded chars:
          ["URL-encoded value (1)", "file:///test-root/%6c%6f%63%61%6c", "/test-root/local"],
          ["URL-encoded value (2)", "file:///test-root/local%22", '/test-root/local"'],
          ["URL-encoded value (3)", 'file:///test-root/local"', '/test-root/local"']
        ];
        for (const x of cases) {
          const [title, input, expected] = x;
          const mock = shellIntegrationAddon.getCwdDectionMock();
          mock.expects("updateCwd").once().withExactArgs(expected, false).named(title);
          await writeP(xterm, `\x1B]7;${input}\x07`);
          mock.verify();
        }
      });
      test("should ignore ill-formatted URLs", async () => {
        const cases = [
          // Different hostname values:
          ["no hostname, pointing root", "file://"],
          // Non-`file` scheme values:
          ["no scheme (1)", "/test-root"],
          ["no scheme (2)", "//test-root"],
          ["no scheme (3)", "///test-root"],
          ["no scheme (4)", ":///test-root"],
          ["http", "http:///test-root"],
          ["ftp", "ftp:///test-root"],
          ["ssh", "ssh:///test-root"]
        ];
        for (const x of cases) {
          const [title, input] = x;
          const mock = shellIntegrationAddon.getCwdDectionMock();
          mock.expects("updateCwd").never().named(title);
          await writeP(xterm, `\x1B]7;${input}\x07`);
          mock.verify();
        }
      });
    });
    test("detect `SetWindowsFrindlyCwd` sequence: `OSC 9 ; 9 ; <cwd> ST`", async () => {
      const cases = [
        ["root", "/", "/"],
        ["non-root", "/some/path", "/some/path"]
      ];
      for (const x of cases) {
        const [title, input, expected] = x;
        const mock = shellIntegrationAddon.getCwdDectionMock();
        mock.expects("updateCwd").once().withExactArgs(expected, false).named(title);
        await writeP(xterm, `\x1B]9;9;${input}\x07`);
        mock.verify();
      }
    });
  });
  suite("command tracking", () => {
    test("should activate capability on the prompt start sequence (OSC 633 ; A ST)", async () => {
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "\x1B]633;A\x07");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), true);
    });
    test("should pass prompt start sequence to the capability", async () => {
      const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
      mock.expects("handlePromptStart").once().withExactArgs();
      await writeP(xterm, "\x1B]633;A\x07");
      mock.verify();
    });
    test("should activate capability on the command start sequence (OSC 633 ; B ST)", async () => {
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "\x1B]633;B\x07");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), true);
    });
    test("should pass command start sequence to the capability", async () => {
      const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
      mock.expects("handleCommandStart").once().withExactArgs();
      await writeP(xterm, "\x1B]633;B\x07");
      mock.verify();
    });
    test("should activate capability on the command executed sequence (OSC 633 ; C ST)", async () => {
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "\x1B]633;C\x07");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), true);
    });
    test("should pass command executed sequence to the capability", async () => {
      const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
      mock.expects("handleCommandExecuted").once().withExactArgs();
      await writeP(xterm, "\x1B]633;C\x07");
      mock.verify();
    });
    test("should activate capability on the command finished sequence (OSC 633 ; D ; <ExitCode> ST)", async () => {
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "\x1B]633;D;7\x07");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), true);
    });
    test("should pass command finished sequence to the capability", async () => {
      const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
      mock.expects("handleCommandFinished").once().withExactArgs(7);
      await writeP(xterm, "\x1B]633;D;7\x07");
      mock.verify();
    });
    test("should pass command line sequence to the capability", async () => {
      const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
      mock.expects("setCommandLine").once().withExactArgs("", false);
      await writeP(xterm, "\x1B]633;E\x07");
      mock.verify();
      const mock2 = shellIntegrationAddon.getCommandDetectionMock(xterm);
      mock2.expects("setCommandLine").twice().withExactArgs("cmd", false);
      await writeP(xterm, "\x1B]633;E;cmd\x07");
      await writeP(xterm, "\x1B]633;E;cmd;invalid-nonce\x07");
      mock2.verify();
    });
    test("should not activate capability on the cwd sequence (OSC 633 ; P=Cwd=<cwd> ST)", async () => {
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "\x1B]633;P;Cwd=/foo\x07");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
    });
    test("should pass cwd sequence to the capability if it's initialized", async () => {
      const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
      mock.expects("setCwd").once().withExactArgs("/foo");
      await writeP(xterm, "\x1B]633;P;Cwd=/foo\x07");
      mock.verify();
    });
  });
  suite("BufferMarkCapability", () => {
    test("SetMark", async () => {
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
      await writeP(xterm, "\x1B]633;SetMark;\x07");
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), true);
    });
    test("SetMark - ID", async () => {
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
      await writeP(xterm, "\x1B]633;SetMark;1;\x07");
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), true);
    });
    test("SetMark - hidden", async () => {
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
      await writeP(xterm, "\x1B]633;SetMark;;Hidden\x07");
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), true);
    });
    test("SetMark - hidden & ID", async () => {
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
      await writeP(xterm, "\x1B]633;SetMark;1;Hidden\x07");
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), true);
    });
    suite("parseMarkSequence", () => {
      test("basic", async () => {
        deepEqual(parseMarkSequence(["", ""]), { id: void 0, hidden: false });
      });
      test("ID", async () => {
        deepEqual(parseMarkSequence(["Id=3", ""]), { id: "3", hidden: false });
      });
      test("hidden", async () => {
        deepEqual(parseMarkSequence(["", "Hidden"]), { id: void 0, hidden: true });
      });
      test("ID + hidden", async () => {
        deepEqual(parseMarkSequence(["Id=4555", "Hidden"]), { id: "4555", hidden: true });
      });
    });
  });
  suite("deserializeMessage", () => {
    const Backslash = "\\";
    const Newline = "\n";
    const Semicolon = ";";
    const cases = [
      ["empty", "", ""],
      ["basic", "value", "value"],
      ["space", "some thing", "some thing"],
      ["escaped backslash", `${Backslash}${Backslash}`, Backslash],
      ["non-initial escaped backslash", `foo${Backslash}${Backslash}`, `foo${Backslash}`],
      ["two escaped backslashes", `${Backslash}${Backslash}${Backslash}${Backslash}`, `${Backslash}${Backslash}`],
      ["escaped backslash amidst text", `Hello${Backslash}${Backslash}there`, `Hello${Backslash}there`],
      ["backslash escaped literally and as hex", `${Backslash}${Backslash} is same as ${Backslash}x5c`, `${Backslash} is same as ${Backslash}`],
      ["escaped semicolon", `${Backslash}x3b`, Semicolon],
      ["non-initial escaped semicolon", `foo${Backslash}x3b`, `foo${Semicolon}`],
      ["escaped semicolon (upper hex)", `${Backslash}x3B`, Semicolon],
      ['escaped backslash followed by literal "x3b" is not a semicolon', `${Backslash}${Backslash}x3b`, `${Backslash}x3b`],
      ['non-initial escaped backslash followed by literal "x3b" is not a semicolon', `foo${Backslash}${Backslash}x3b`, `foo${Backslash}x3b`],
      ["escaped backslash followed by escaped semicolon", `${Backslash}${Backslash}${Backslash}x3b`, `${Backslash}${Semicolon}`],
      ["escaped semicolon amidst text", `some${Backslash}x3bthing`, `some${Semicolon}thing`],
      ["escaped newline", `${Backslash}x0a`, Newline],
      ["non-initial escaped newline", `foo${Backslash}x0a`, `foo${Newline}`],
      ["escaped newline (upper hex)", `${Backslash}x0A`, Newline],
      ['escaped backslash followed by literal "x0a" is not a newline', `${Backslash}${Backslash}x0a`, `${Backslash}x0a`],
      ['non-initial escaped backslash followed by literal "x0a" is not a newline', `foo${Backslash}${Backslash}x0a`, `foo${Backslash}x0a`],
      ["PS1 simple", "[\\u@\\h \\W]\\$", "[\\u@\\h \\W]\\$"],
      ["PS1 VSC SI", `${Backslash}x1b]633;A${Backslash}x07\\[${Backslash}x1b]0;\\u@\\h:\\w\\a\\]${Backslash}x1b]633;B${Backslash}x07`, "\x1B]633;A\x07\\[\x1B]0;\\u@\\h:\\w\\a\\]\x1B]633;B\x07"]
    ];
    cases.forEach(([title, input, expected]) => {
      test(title, () => strictEqual(deserializeVSCodeOscMessage(input), expected));
    });
  });
  suite("serializeVSCodeOscMessage", () => {
    const Backslash = "\\";
    const Newline = "\n";
    const Semicolon = ";";
    const cases = [
      ["empty", "", ""],
      ["basic", "value", "value"],
      ["space", "some thing", `some${Backslash}x20thing`],
      ["backslash", Backslash, `${Backslash}${Backslash}`],
      ["non-initial backslash", `foo${Backslash}`, `foo${Backslash}${Backslash}`],
      ["two backslashes", `${Backslash}${Backslash}`, `${Backslash}${Backslash}${Backslash}${Backslash}`],
      ["backslash amidst text", `Hello${Backslash}there`, `Hello${Backslash}${Backslash}there`],
      ["semicolon", Semicolon, `${Backslash}x3b`],
      ["non-initial semicolon", `foo${Semicolon}`, `foo${Backslash}x3b`],
      ["semicolon amidst text", `some${Semicolon}thing`, `some${Backslash}x3bthing`],
      ["newline", Newline, `${Backslash}x0a`],
      ["non-initial newline", `foo${Newline}`, `foo${Backslash}x0a`],
      ["newline amidst text", `some${Newline}thing`, `some${Backslash}x0athing`],
      ["tab character", "	", `${Backslash}x09`],
      ["carriage return", "\r", `${Backslash}x0d`],
      ["null character", "\0", `${Backslash}x00`],
      ["space character (0x20)", " ", `${Backslash}x20`],
      ["character above 0x20", "!", "!"],
      ["multiple special chars", `hello${Newline}world${Semicolon}test${Backslash}end`, `hello${Backslash}x0aworld${Backslash}x3btest${Backslash}${Backslash}end`],
      ["PS1 with escape sequences", `\x1B]633;A\x07\\[\x1B]0;\\u@\\h:\\w\\a\\]\x1B]633;B\x07`, `${Backslash}x1b]633${Backslash}x3bA${Backslash}x07${Backslash}${Backslash}[${Backslash}x1b]0${Backslash}x3b${Backslash}${Backslash}u@${Backslash}${Backslash}h:${Backslash}${Backslash}w${Backslash}${Backslash}a${Backslash}${Backslash}]${Backslash}x1b]633${Backslash}x3bB${Backslash}x07`]
    ];
    cases.forEach(([title, input, expected]) => {
      test(title, () => strictEqual(serializeVSCodeOscMessage(input), expected));
    });
  });
  test("parseKeyValueAssignment", () => {
    const cases = [
      ["empty", "", ["", void 0]],
      ['no "=" sign', "some-text", ["some-text", void 0]],
      ["empty value", "key=", ["key", ""]],
      ["empty key", "=value", ["", "value"]],
      ["normal", "key=value", ["key", "value"]],
      ['multiple "=" signs (1)', "key==value", ["key", "=value"]],
      ['multiple "=" signs (2)', "key=value===true", ["key", "value===true"]],
      ['just a "="', "=", ["", ""]],
      ['just a "=="', "==", ["", "="]]
    ];
    cases.forEach((x) => {
      const [title, input, [key, value]] = x;
      deepStrictEqual(parseKeyValueAssignment(input), { key, value }, title);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL3Rlc3QvYnJvd3Nlci94dGVybS9zaGVsbEludGVncmF0aW9uQWRkb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgVGVybWluYWwgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuaW1wb3J0IHsgZGVlcEVxdWFsLCBkZWVwU3RyaWN0RXF1YWwsIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIHNpbm9uIGZyb20gJ3Npbm9uJztcbmltcG9ydCB7IGltcG9ydEFNRE5vZGVNb2R1bGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9hbWRYLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDYXBhYmlsaXR5U3RvcmUsIFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IGRlc2VyaWFsaXplVlNDb2RlT3NjTWVzc2FnZSwgc2VyaWFsaXplVlNDb2RlT3NjTWVzc2FnZSwgcGFyc2VLZXlWYWx1ZUFzc2lnbm1lbnQsIHBhcnNlTWFya1NlcXVlbmNlLCBTaGVsbEludGVncmF0aW9uQWRkb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24veHRlcm0vc2hlbGxJbnRlZ3JhdGlvbkFkZG9uLmpzJztcbmltcG9ydCB7IHdyaXRlUCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvdGVybWluYWxUZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBUZXN0WHRlcm1Mb2dnZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC90ZXN0L2NvbW1vbi90ZXJtaW5hbFRlc3RIZWxwZXJzLmpzJztcblxuY2xhc3MgVGVzdFNoZWxsSW50ZWdyYXRpb25BZGRvbiBleHRlbmRzIFNoZWxsSW50ZWdyYXRpb25BZGRvbiB7XG5cdGdldENvbW1hbmREZXRlY3Rpb25Nb2NrKHRlcm1pbmFsOiBUZXJtaW5hbCk6IHNpbm9uLlNpbm9uTW9jayB7XG5cdFx0Y29uc3QgY2FwYWJpbGl0eSA9IHN1cGVyLl9jcmVhdGVPckdldENvbW1hbmREZXRlY3Rpb24odGVybWluYWwpO1xuXHRcdHRoaXMuY2FwYWJpbGl0aWVzLmFkZChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiwgY2FwYWJpbGl0eSk7XG5cdFx0cmV0dXJuIHNpbm9uLm1vY2soY2FwYWJpbGl0eSk7XG5cdH1cblx0Z2V0Q3dkRGVjdGlvbk1vY2soKTogc2lub24uU2lub25Nb2NrIHtcblx0XHRjb25zdCBjYXBhYmlsaXR5ID0gc3VwZXIuX2NyZWF0ZU9yR2V0Q3dkRGV0ZWN0aW9uKCk7XG5cdFx0dGhpcy5jYXBhYmlsaXRpZXMuYWRkKFRlcm1pbmFsQ2FwYWJpbGl0eS5Dd2REZXRlY3Rpb24sIGNhcGFiaWxpdHkpO1xuXHRcdHJldHVybiBzaW5vbi5tb2NrKGNhcGFiaWxpdHkpO1xuXHR9XG59XG5cbnN1aXRlKCdTaGVsbEludGVncmF0aW9uQWRkb24nLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IHh0ZXJtOiBUZXJtaW5hbDtcblx0bGV0IHNoZWxsSW50ZWdyYXRpb25BZGRvbjogVGVzdFNoZWxsSW50ZWdyYXRpb25BZGRvbjtcblx0bGV0IGNhcGFiaWxpdGllczogSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBUZXJtaW5hbEN0b3IgPSAoYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdAeHRlcm0veHRlcm0nKT4oJ0B4dGVybS94dGVybScsICdsaWIveHRlcm0uanMnKSkuVGVybWluYWw7XG5cdFx0eHRlcm0gPSBzdG9yZS5hZGQobmV3IFRlcm1pbmFsQ3Rvcih7IGFsbG93UHJvcG9zZWRBcGk6IHRydWUsIGNvbHM6IDgwLCByb3dzOiAzMCwgbG9nZ2VyOiBUZXN0WHRlcm1Mb2dnZXIgfSkpO1xuXHRcdHNoZWxsSW50ZWdyYXRpb25BZGRvbiA9IHN0b3JlLmFkZChuZXcgVGVzdFNoZWxsSW50ZWdyYXRpb25BZGRvbignJywgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0eHRlcm0ubG9hZEFkZG9uKHNoZWxsSW50ZWdyYXRpb25BZGRvbik7XG5cdFx0Y2FwYWJpbGl0aWVzID0gc2hlbGxJbnRlZ3JhdGlvbkFkZG9uLmNhcGFiaWxpdGllcztcblx0fSk7XG5cblx0c3VpdGUoJ2N3ZCBkZXRlY3Rpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGFjdGl2YXRlIGNhcGFiaWxpdHkgb24gdGhlIGN3ZCBzZXF1ZW5jZSAoT1NDIDYzMyA7IFAgOyBDd2Q9PGN3ZD4gU1QpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQ3dkRGV0ZWN0aW9uKSwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnZm9vJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Dd2REZXRlY3Rpb24pLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdcXHgxYl02MzM7UDtDd2Q9L2Zvb1xceDA3Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Dd2REZXRlY3Rpb24pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBwYXNzIGN3ZCBzZXF1ZW5jZSB0byB0aGUgY2FwYWJpbGl0eSBhcyB0cnVzdGVkIHdoZW4gbm9uY2UgbWF0Y2hlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2sgPSBzaGVsbEludGVncmF0aW9uQWRkb24uZ2V0Q3dkRGVjdGlvbk1vY2soKTtcblx0XHRcdC8vIFRoZSBhZGRvbiBpcyBjb25zdHJ1Y3RlZCB3aXRoIG5vbmNlICcnIHNvIGEgdHJhaWxpbmcgJzsnIHByb2R1Y2VzIGFyZ3NbMV09PT0nJyB3aGljaCBtYXRjaGVzXG5cdFx0XHRtb2NrLmV4cGVjdHMoJ3VwZGF0ZUN3ZCcpLm9uY2UoKS53aXRoRXhhY3RBcmdzKCcvZm9vJywgdHJ1ZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdcXHgxYl02MzM7UDtDd2Q9L2ZvbztcXHgwNycpO1xuXHRcdFx0bW9jay52ZXJpZnkoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0cmVhdCBjd2Qgc2VxdWVuY2UgYXMgdW50cnVzdGVkIHdoZW4gbm9uY2UgaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2sgPSBzaGVsbEludGVncmF0aW9uQWRkb24uZ2V0Q3dkRGVjdGlvbk1vY2soKTtcblx0XHRcdG1vY2suZXhwZWN0cygndXBkYXRlQ3dkJykub25jZSgpLndpdGhFeGFjdEFyZ3MoJy9mb28nLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdcXHgxYl02MzM7UDtDd2Q9L2Zvb1xceDA3Jyk7XG5cdFx0XHRtb2NrLnZlcmlmeSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHRyZWF0IGN3ZCBzZXF1ZW5jZSBhcyB1bnRydXN0ZWQgd2hlbiBub25jZSBkb2VzIG5vdCBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2sgPSBzaGVsbEludGVncmF0aW9uQWRkb24uZ2V0Q3dkRGVjdGlvbk1vY2soKTtcblx0XHRcdG1vY2suZXhwZWN0cygndXBkYXRlQ3dkJykub25jZSgpLndpdGhFeGFjdEFyZ3MoJy9mb28nLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdcXHgxYl02MzM7UDtDd2Q9L2ZvbztpbnZhbGlkLW5vbmNlXFx4MDcnKTtcblx0XHRcdG1vY2sudmVyaWZ5KCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZXRlY3QgSVRlcm0gc2VxdWVuY2U6IGBPU0MgMTMzNyA7IEN1cnJlbnREaXI9PEN3ZD4gU1RgJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHlwZSBUZXN0Q2FzZSA9IFt0aXRsZTogc3RyaW5nLCBpbnB1dDogc3RyaW5nLCBleHBlY3RlZDogc3RyaW5nXTtcblx0XHRcdGNvbnN0IGNhc2VzOiBUZXN0Q2FzZVtdID0gW1xuXHRcdFx0XHRbJ3Jvb3QnLCAnLycsICcvJ10sXG5cdFx0XHRcdFsnbm9uLXJvb3QnLCAnL3NvbWUvcGF0aCcsICcvc29tZS9wYXRoJ10sXG5cdFx0XHRdO1xuXHRcdFx0Zm9yIChjb25zdCB4IG9mIGNhc2VzKSB7XG5cdFx0XHRcdGNvbnN0IFt0aXRsZSwgaW5wdXQsIGV4cGVjdGVkXSA9IHg7XG5cdFx0XHRcdGNvbnN0IG1vY2sgPSBzaGVsbEludGVncmF0aW9uQWRkb24uZ2V0Q3dkRGVjdGlvbk1vY2soKTtcblx0XHRcdFx0bW9jay5leHBlY3RzKCd1cGRhdGVDd2QnKS5vbmNlKCkud2l0aEV4YWN0QXJncyhleHBlY3RlZCwgZmFsc2UpLm5hbWVkKHRpdGxlKTtcblx0XHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCBgXFx4MWJdMTMzNztDdXJyZW50RGlyPSR7aW5wdXR9XFx4MDdgKTtcblx0XHRcdFx0bW9jay52ZXJpZnkoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHN1aXRlKCdkZXRlY3QgYFNldEN3ZGAgc2VxdWVuY2U6IGBPU0MgNzsgc2NoZW1lOi8vY3dkIFNUYCcsICgpID0+IHtcblx0XHRcdHRlc3QoJ3Nob3VsZCBhY2NlcHQgd2VsbC1mb3JtYXR0ZWQgVVJMcycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHlwZSBUZXN0Q2FzZSA9IFt0aXRsZTogc3RyaW5nLCBpbnB1dDogc3RyaW5nLCBleHBlY3RlZDogc3RyaW5nXTtcblx0XHRcdFx0Y29uc3QgY2FzZXM6IFRlc3RDYXNlW10gPSBbXG5cdFx0XHRcdFx0Ly8gRGlmZmVyZW50IGhvc3RuYW1lIHZhbHVlczpcblx0XHRcdFx0XHRbJ2VtcHR5IGhvc3RuYW1lLCBwb2ludGluZyByb290JywgJ2ZpbGU6Ly8vJywgJy8nXSxcblx0XHRcdFx0XHRbJ2VtcHR5IGhvc3RuYW1lJywgJ2ZpbGU6Ly8vdGVzdC1yb290L2xvY2FsJywgJy90ZXN0LXJvb3QvbG9jYWwnXSxcblx0XHRcdFx0XHRbJ25vbi1lbXB0eSBob3N0bmFtZScsICdmaWxlOi8vc29tZS1ob3N0bmFtZS90ZXN0LXJvb3QvbG9jYWwnLCAnL3Rlc3Qtcm9vdC9sb2NhbCddLFxuXHRcdFx0XHRcdC8vIFVSTC1lbmNvZGVkIGNoYXJzOlxuXHRcdFx0XHRcdFsnVVJMLWVuY29kZWQgdmFsdWUgKDEpJywgJ2ZpbGU6Ly8vdGVzdC1yb290LyU2YyU2ZiU2MyU2MSU2YycsICcvdGVzdC1yb290L2xvY2FsJ10sXG5cdFx0XHRcdFx0WydVUkwtZW5jb2RlZCB2YWx1ZSAoMiknLCAnZmlsZTovLy90ZXN0LXJvb3QvbG9jYWwlMjInLCAnL3Rlc3Qtcm9vdC9sb2NhbFwiJ10sXG5cdFx0XHRcdFx0WydVUkwtZW5jb2RlZCB2YWx1ZSAoMyknLCAnZmlsZTovLy90ZXN0LXJvb3QvbG9jYWxcIicsICcvdGVzdC1yb290L2xvY2FsXCInXSxcblx0XHRcdFx0XTtcblx0XHRcdFx0Zm9yIChjb25zdCB4IG9mIGNhc2VzKSB7XG5cdFx0XHRcdFx0Y29uc3QgW3RpdGxlLCBpbnB1dCwgZXhwZWN0ZWRdID0geDtcblx0XHRcdFx0XHRjb25zdCBtb2NrID0gc2hlbGxJbnRlZ3JhdGlvbkFkZG9uLmdldEN3ZERlY3Rpb25Nb2NrKCk7XG5cdFx0XHRcdFx0bW9jay5leHBlY3RzKCd1cGRhdGVDd2QnKS5vbmNlKCkud2l0aEV4YWN0QXJncyhleHBlY3RlZCwgZmFsc2UpLm5hbWVkKHRpdGxlKTtcblx0XHRcdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sIGBcXHgxYl03OyR7aW5wdXR9XFx4MDdgKTtcblx0XHRcdFx0XHRtb2NrLnZlcmlmeSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2hvdWxkIGlnbm9yZSBpbGwtZm9ybWF0dGVkIFVSTHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHR5cGUgVGVzdENhc2UgPSBbdGl0bGU6IHN0cmluZywgaW5wdXQ6IHN0cmluZ107XG5cdFx0XHRcdGNvbnN0IGNhc2VzOiBUZXN0Q2FzZVtdID0gW1xuXHRcdFx0XHRcdC8vIERpZmZlcmVudCBob3N0bmFtZSB2YWx1ZXM6XG5cdFx0XHRcdFx0WydubyBob3N0bmFtZSwgcG9pbnRpbmcgcm9vdCcsICdmaWxlOi8vJ10sXG5cdFx0XHRcdFx0Ly8gTm9uLWBmaWxlYCBzY2hlbWUgdmFsdWVzOlxuXHRcdFx0XHRcdFsnbm8gc2NoZW1lICgxKScsICcvdGVzdC1yb290J10sXG5cdFx0XHRcdFx0WydubyBzY2hlbWUgKDIpJywgJy8vdGVzdC1yb290J10sXG5cdFx0XHRcdFx0WydubyBzY2hlbWUgKDMpJywgJy8vL3Rlc3Qtcm9vdCddLFxuXHRcdFx0XHRcdFsnbm8gc2NoZW1lICg0KScsICc6Ly8vdGVzdC1yb290J10sXG5cdFx0XHRcdFx0WydodHRwJywgJ2h0dHA6Ly8vdGVzdC1yb290J10sXG5cdFx0XHRcdFx0WydmdHAnLCAnZnRwOi8vL3Rlc3Qtcm9vdCddLFxuXHRcdFx0XHRcdFsnc3NoJywgJ3NzaDovLy90ZXN0LXJvb3QnXSxcblx0XHRcdFx0XTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IHggb2YgY2FzZXMpIHtcblx0XHRcdFx0XHRjb25zdCBbdGl0bGUsIGlucHV0XSA9IHg7XG5cdFx0XHRcdFx0Y29uc3QgbW9jayA9IHNoZWxsSW50ZWdyYXRpb25BZGRvbi5nZXRDd2REZWN0aW9uTW9jaygpO1xuXHRcdFx0XHRcdG1vY2suZXhwZWN0cygndXBkYXRlQ3dkJykubmV2ZXIoKS5uYW1lZCh0aXRsZSk7XG5cdFx0XHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCBgXFx4MWJdNzske2lucHV0fVxceDA3YCk7XG5cdFx0XHRcdFx0bW9jay52ZXJpZnkoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZXRlY3QgYFNldFdpbmRvd3NGcmluZGx5Q3dkYCBzZXF1ZW5jZTogYE9TQyA5IDsgOSA7IDxjd2Q+IFNUYCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHR5cGUgVGVzdENhc2UgPSBbdGl0bGU6IHN0cmluZywgaW5wdXQ6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZ107XG5cdFx0XHRjb25zdCBjYXNlczogVGVzdENhc2VbXSA9IFtcblx0XHRcdFx0Wydyb290JywgJy8nLCAnLyddLFxuXHRcdFx0XHRbJ25vbi1yb290JywgJy9zb21lL3BhdGgnLCAnL3NvbWUvcGF0aCddLFxuXHRcdFx0XTtcblx0XHRcdGZvciAoY29uc3QgeCBvZiBjYXNlcykge1xuXHRcdFx0XHRjb25zdCBbdGl0bGUsIGlucHV0LCBleHBlY3RlZF0gPSB4O1xuXHRcdFx0XHRjb25zdCBtb2NrID0gc2hlbGxJbnRlZ3JhdGlvbkFkZG9uLmdldEN3ZERlY3Rpb25Nb2NrKCk7XG5cdFx0XHRcdG1vY2suZXhwZWN0cygndXBkYXRlQ3dkJykub25jZSgpLndpdGhFeGFjdEFyZ3MoZXhwZWN0ZWQsIGZhbHNlKS5uYW1lZCh0aXRsZSk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgYFxceDFiXTk7OTske2lucHV0fVxceDA3YCk7XG5cdFx0XHRcdG1vY2sudmVyaWZ5KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjb21tYW5kIHRyYWNraW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBhY3RpdmF0ZSBjYXBhYmlsaXR5IG9uIHRoZSBwcm9tcHQgc3RhcnQgc2VxdWVuY2UgKE9TQyA2MzMgOyBBIFNUKScsIGFzeW5jICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKGNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdmb28nKTtcblx0XHRcdHN0cmljdEVxdWFsKGNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdcXHgxYl02MzM7QVxceDA3Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHBhc3MgcHJvbXB0IHN0YXJ0IHNlcXVlbmNlIHRvIHRoZSBjYXBhYmlsaXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9jayA9IHNoZWxsSW50ZWdyYXRpb25BZGRvbi5nZXRDb21tYW5kRGV0ZWN0aW9uTW9jayh4dGVybSk7XG5cdFx0XHRtb2NrLmV4cGVjdHMoJ2hhbmRsZVByb21wdFN0YXJ0Jykub25jZSgpLndpdGhFeGFjdEFyZ3MoKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ1xceDFiXTYzMztBXFx4MDcnKTtcblx0XHRcdG1vY2sudmVyaWZ5KCk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIGFjdGl2YXRlIGNhcGFiaWxpdHkgb24gdGhlIGNvbW1hbmQgc3RhcnQgc2VxdWVuY2UgKE9TQyA2MzMgOyBCIFNUKScsIGFzeW5jICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKGNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdmb28nKTtcblx0XHRcdHN0cmljdEVxdWFsKGNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdcXHgxYl02MzM7QlxceDA3Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHBhc3MgY29tbWFuZCBzdGFydCBzZXF1ZW5jZSB0byB0aGUgY2FwYWJpbGl0eScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2sgPSBzaGVsbEludGVncmF0aW9uQWRkb24uZ2V0Q29tbWFuZERldGVjdGlvbk1vY2soeHRlcm0pO1xuXHRcdFx0bW9jay5leHBlY3RzKCdoYW5kbGVDb21tYW5kU3RhcnQnKS5vbmNlKCkud2l0aEV4YWN0QXJncygpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnXFx4MWJdNjMzO0JcXHgwNycpO1xuXHRcdFx0bW9jay52ZXJpZnkoKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgYWN0aXZhdGUgY2FwYWJpbGl0eSBvbiB0aGUgY29tbWFuZCBleGVjdXRlZCBzZXF1ZW5jZSAoT1NDIDYzMyA7IEMgU1QpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiksIGZhbHNlKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ2ZvbycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiksIGZhbHNlKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ1xceDFiXTYzMztDXFx4MDcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pLCB0cnVlKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcGFzcyBjb21tYW5kIGV4ZWN1dGVkIHNlcXVlbmNlIHRvIHRoZSBjYXBhYmlsaXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9jayA9IHNoZWxsSW50ZWdyYXRpb25BZGRvbi5nZXRDb21tYW5kRGV0ZWN0aW9uTW9jayh4dGVybSk7XG5cdFx0XHRtb2NrLmV4cGVjdHMoJ2hhbmRsZUNvbW1hbmRFeGVjdXRlZCcpLm9uY2UoKS53aXRoRXhhY3RBcmdzKCk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdcXHgxYl02MzM7Q1xceDA3Jyk7XG5cdFx0XHRtb2NrLnZlcmlmeSgpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBhY3RpdmF0ZSBjYXBhYmlsaXR5IG9uIHRoZSBjb21tYW5kIGZpbmlzaGVkIHNlcXVlbmNlIChPU0MgNjMzIDsgRCA7IDxFeGl0Q29kZT4gU1QpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiksIGZhbHNlKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ2ZvbycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiksIGZhbHNlKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ1xceDFiXTYzMztEOzdcXHgwNycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiksIHRydWUpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBwYXNzIGNvbW1hbmQgZmluaXNoZWQgc2VxdWVuY2UgdG8gdGhlIGNhcGFiaWxpdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrID0gc2hlbGxJbnRlZ3JhdGlvbkFkZG9uLmdldENvbW1hbmREZXRlY3Rpb25Nb2NrKHh0ZXJtKTtcblx0XHRcdG1vY2suZXhwZWN0cygnaGFuZGxlQ29tbWFuZEZpbmlzaGVkJykub25jZSgpLndpdGhFeGFjdEFyZ3MoNyk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdcXHgxYl02MzM7RDs3XFx4MDcnKTtcblx0XHRcdG1vY2sudmVyaWZ5KCk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHBhc3MgY29tbWFuZCBsaW5lIHNlcXVlbmNlIHRvIHRoZSBjYXBhYmlsaXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9jayA9IHNoZWxsSW50ZWdyYXRpb25BZGRvbi5nZXRDb21tYW5kRGV0ZWN0aW9uTW9jayh4dGVybSk7XG5cdFx0XHRtb2NrLmV4cGVjdHMoJ3NldENvbW1hbmRMaW5lJykub25jZSgpLndpdGhFeGFjdEFyZ3MoJycsIGZhbHNlKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ1xceDFiXTYzMztFXFx4MDcnKTtcblx0XHRcdG1vY2sudmVyaWZ5KCk7XG5cblx0XHRcdGNvbnN0IG1vY2syID0gc2hlbGxJbnRlZ3JhdGlvbkFkZG9uLmdldENvbW1hbmREZXRlY3Rpb25Nb2NrKHh0ZXJtKTtcblx0XHRcdG1vY2syLmV4cGVjdHMoJ3NldENvbW1hbmRMaW5lJykudHdpY2UoKS53aXRoRXhhY3RBcmdzKCdjbWQnLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdcXHgxYl02MzM7RTtjbWRcXHgwNycpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnXFx4MWJdNjMzO0U7Y21kO2ludmFsaWQtbm9uY2VcXHgwNycpO1xuXHRcdFx0bW9jazIudmVyaWZ5KCk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBhY3RpdmF0ZSBjYXBhYmlsaXR5IG9uIHRoZSBjd2Qgc2VxdWVuY2UgKE9TQyA2MzMgOyBQPUN3ZD08Y3dkPiBTVCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnZm9vJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnXFx4MWJdNjMzO1A7Q3dkPS9mb29cXHgwNycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiksIGZhbHNlKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcGFzcyBjd2Qgc2VxdWVuY2UgdG8gdGhlIGNhcGFiaWxpdHkgaWYgaXRcXCdzIGluaXRpYWxpemVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9jayA9IHNoZWxsSW50ZWdyYXRpb25BZGRvbi5nZXRDb21tYW5kRGV0ZWN0aW9uTW9jayh4dGVybSk7XG5cdFx0XHRtb2NrLmV4cGVjdHMoJ3NldEN3ZCcpLm9uY2UoKS53aXRoRXhhY3RBcmdzKCcvZm9vJyk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdcXHgxYl02MzM7UDtDd2Q9L2Zvb1xceDA3Jyk7XG5cdFx0XHRtb2NrLnZlcmlmeSgpO1xuXHRcdH0pO1xuXHR9KTtcblx0c3VpdGUoJ0J1ZmZlck1hcmtDYXBhYmlsaXR5JywgKCkgPT4ge1xuXHRcdHRlc3QoJ1NldE1hcmsnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5CdWZmZXJNYXJrRGV0ZWN0aW9uKSwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnZm9vJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5CdWZmZXJNYXJrRGV0ZWN0aW9uKSwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnXFx4MWJdNjMzO1NldE1hcms7XFx4MDcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkJ1ZmZlck1hcmtEZXRlY3Rpb24pLCB0cnVlKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdTZXRNYXJrIC0gSUQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5CdWZmZXJNYXJrRGV0ZWN0aW9uKSwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnZm9vJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5CdWZmZXJNYXJrRGV0ZWN0aW9uKSwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnXFx4MWJdNjMzO1NldE1hcms7MTtcXHgwNycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQnVmZmVyTWFya0RldGVjdGlvbiksIHRydWUpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ1NldE1hcmsgLSBoaWRkZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5CdWZmZXJNYXJrRGV0ZWN0aW9uKSwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnZm9vJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5CdWZmZXJNYXJrRGV0ZWN0aW9uKSwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnXFx4MWJdNjMzO1NldE1hcms7O0hpZGRlblxceDA3Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5CdWZmZXJNYXJrRGV0ZWN0aW9uKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnU2V0TWFyayAtIGhpZGRlbiAmIElEJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQnVmZmVyTWFya0RldGVjdGlvbiksIGZhbHNlKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ2ZvbycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQnVmZmVyTWFya0RldGVjdGlvbiksIGZhbHNlKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ1xceDFiXTYzMztTZXRNYXJrOzE7SGlkZGVuXFx4MDcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkJ1ZmZlck1hcmtEZXRlY3Rpb24pLCB0cnVlKTtcblx0XHR9KTtcblx0XHRzdWl0ZSgncGFyc2VNYXJrU2VxdWVuY2UnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdiYXNpYycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0ZGVlcEVxdWFsKHBhcnNlTWFya1NlcXVlbmNlKFsnJywgJyddKSwgeyBpZDogdW5kZWZpbmVkLCBoaWRkZW46IGZhbHNlIH0pO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdJRCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0ZGVlcEVxdWFsKHBhcnNlTWFya1NlcXVlbmNlKFsnSWQ9MycsICcnXSksIHsgaWQ6ICczJywgaGlkZGVuOiBmYWxzZSB9KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnaGlkZGVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRkZWVwRXF1YWwocGFyc2VNYXJrU2VxdWVuY2UoWycnLCAnSGlkZGVuJ10pLCB7IGlkOiB1bmRlZmluZWQsIGhpZGRlbjogdHJ1ZSB9KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnSUQgKyBoaWRkZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGRlZXBFcXVhbChwYXJzZU1hcmtTZXF1ZW5jZShbJ0lkPTQ1NTUnLCAnSGlkZGVuJ10pLCB7IGlkOiAnNDU1NScsIGhpZGRlbjogdHJ1ZSB9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZGVzZXJpYWxpemVNZXNzYWdlJywgKCkgPT4ge1xuXHRcdC8vIEEgc2luZ2xlIGxpdGVyYWwgYmFja3NsYXNoLCBpbiBvcmRlciB0byBhdm9pZCBjb25mdXNpb24gYWJvdXQgd2hldGhlciB3ZSBhcmUgZXNjYXBpbmcgdGVzdCBkYXRhIG9yIHRlc3RpbmcgZXNjYXBlcy5cblx0XHRjb25zdCBCYWNrc2xhc2ggPSAnXFxcXCcgYXMgY29uc3Q7XG5cdFx0Y29uc3QgTmV3bGluZSA9ICdcXG4nIGFzIGNvbnN0O1xuXHRcdGNvbnN0IFNlbWljb2xvbiA9ICc7JyBhcyBjb25zdDtcblxuXHRcdHR5cGUgVGVzdENhc2UgPSBbdGl0bGU6IHN0cmluZywgaW5wdXQ6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZ107XG5cdFx0Y29uc3QgY2FzZXM6IFRlc3RDYXNlW10gPSBbXG5cdFx0XHRbJ2VtcHR5JywgJycsICcnXSxcblx0XHRcdFsnYmFzaWMnLCAndmFsdWUnLCAndmFsdWUnXSxcblx0XHRcdFsnc3BhY2UnLCAnc29tZSB0aGluZycsICdzb21lIHRoaW5nJ10sXG5cdFx0XHRbJ2VzY2FwZWQgYmFja3NsYXNoJywgYCR7QmFja3NsYXNofSR7QmFja3NsYXNofWAsIEJhY2tzbGFzaF0sXG5cdFx0XHRbJ25vbi1pbml0aWFsIGVzY2FwZWQgYmFja3NsYXNoJywgYGZvbyR7QmFja3NsYXNofSR7QmFja3NsYXNofWAsIGBmb28ke0JhY2tzbGFzaH1gXSxcblx0XHRcdFsndHdvIGVzY2FwZWQgYmFja3NsYXNoZXMnLCBgJHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9YCwgYCR7QmFja3NsYXNofSR7QmFja3NsYXNofWBdLFxuXHRcdFx0Wydlc2NhcGVkIGJhY2tzbGFzaCBhbWlkc3QgdGV4dCcsIGBIZWxsbyR7QmFja3NsYXNofSR7QmFja3NsYXNofXRoZXJlYCwgYEhlbGxvJHtCYWNrc2xhc2h9dGhlcmVgXSxcblx0XHRcdFsnYmFja3NsYXNoIGVzY2FwZWQgbGl0ZXJhbGx5IGFuZCBhcyBoZXgnLCBgJHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9IGlzIHNhbWUgYXMgJHtCYWNrc2xhc2h9eDVjYCwgYCR7QmFja3NsYXNofSBpcyBzYW1lIGFzICR7QmFja3NsYXNofWBdLFxuXHRcdFx0Wydlc2NhcGVkIHNlbWljb2xvbicsIGAke0JhY2tzbGFzaH14M2JgLCBTZW1pY29sb25dLFxuXHRcdFx0Wydub24taW5pdGlhbCBlc2NhcGVkIHNlbWljb2xvbicsIGBmb28ke0JhY2tzbGFzaH14M2JgLCBgZm9vJHtTZW1pY29sb259YF0sXG5cdFx0XHRbJ2VzY2FwZWQgc2VtaWNvbG9uICh1cHBlciBoZXgpJywgYCR7QmFja3NsYXNofXgzQmAsIFNlbWljb2xvbl0sXG5cdFx0XHRbJ2VzY2FwZWQgYmFja3NsYXNoIGZvbGxvd2VkIGJ5IGxpdGVyYWwgXCJ4M2JcIiBpcyBub3QgYSBzZW1pY29sb24nLCBgJHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9eDNiYCwgYCR7QmFja3NsYXNofXgzYmBdLFxuXHRcdFx0Wydub24taW5pdGlhbCBlc2NhcGVkIGJhY2tzbGFzaCBmb2xsb3dlZCBieSBsaXRlcmFsIFwieDNiXCIgaXMgbm90IGEgc2VtaWNvbG9uJywgYGZvbyR7QmFja3NsYXNofSR7QmFja3NsYXNofXgzYmAsIGBmb28ke0JhY2tzbGFzaH14M2JgXSxcblx0XHRcdFsnZXNjYXBlZCBiYWNrc2xhc2ggZm9sbG93ZWQgYnkgZXNjYXBlZCBzZW1pY29sb24nLCBgJHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9eDNiYCwgYCR7QmFja3NsYXNofSR7U2VtaWNvbG9ufWBdLFxuXHRcdFx0Wydlc2NhcGVkIHNlbWljb2xvbiBhbWlkc3QgdGV4dCcsIGBzb21lJHtCYWNrc2xhc2h9eDNidGhpbmdgLCBgc29tZSR7U2VtaWNvbG9ufXRoaW5nYF0sXG5cdFx0XHRbJ2VzY2FwZWQgbmV3bGluZScsIGAke0JhY2tzbGFzaH14MGFgLCBOZXdsaW5lXSxcblx0XHRcdFsnbm9uLWluaXRpYWwgZXNjYXBlZCBuZXdsaW5lJywgYGZvbyR7QmFja3NsYXNofXgwYWAsIGBmb28ke05ld2xpbmV9YF0sXG5cdFx0XHRbJ2VzY2FwZWQgbmV3bGluZSAodXBwZXIgaGV4KScsIGAke0JhY2tzbGFzaH14MEFgLCBOZXdsaW5lXSxcblx0XHRcdFsnZXNjYXBlZCBiYWNrc2xhc2ggZm9sbG93ZWQgYnkgbGl0ZXJhbCBcIngwYVwiIGlzIG5vdCBhIG5ld2xpbmUnLCBgJHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9eDBhYCwgYCR7QmFja3NsYXNofXgwYWBdLFxuXHRcdFx0Wydub24taW5pdGlhbCBlc2NhcGVkIGJhY2tzbGFzaCBmb2xsb3dlZCBieSBsaXRlcmFsIFwieDBhXCIgaXMgbm90IGEgbmV3bGluZScsIGBmb28ke0JhY2tzbGFzaH0ke0JhY2tzbGFzaH14MGFgLCBgZm9vJHtCYWNrc2xhc2h9eDBhYF0sXG5cdFx0XHRbJ1BTMSBzaW1wbGUnLCAnW1xcXFx1QFxcXFxoIFxcXFxXXVxcXFwkJywgJ1tcXFxcdUBcXFxcaCBcXFxcV11cXFxcJCddLFxuXHRcdFx0WydQUzEgVlNDIFNJJywgYCR7QmFja3NsYXNofXgxYl02MzM7QSR7QmFja3NsYXNofXgwN1xcXFxbJHtCYWNrc2xhc2h9eDFiXTA7XFxcXHVAXFxcXGg6XFxcXHdcXFxcYVxcXFxdJHtCYWNrc2xhc2h9eDFiXTYzMztCJHtCYWNrc2xhc2h9eDA3YCwgJ1xceDFiXTYzMztBXFx4MDdcXFxcW1xceDFiXTA7XFxcXHVAXFxcXGg6XFxcXHdcXFxcYVxcXFxdXFx4MWJdNjMzO0JcXHgwNyddXG5cdFx0XTtcblxuXHRcdGNhc2VzLmZvckVhY2goKFt0aXRsZSwgaW5wdXQsIGV4cGVjdGVkXSkgPT4ge1xuXHRcdFx0dGVzdCh0aXRsZSwgKCkgPT4gc3RyaWN0RXF1YWwoZGVzZXJpYWxpemVWU0NvZGVPc2NNZXNzYWdlKGlucHV0KSwgZXhwZWN0ZWQpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3NlcmlhbGl6ZVZTQ29kZU9zY01lc3NhZ2UnLCAoKSA9PiB7XG5cdFx0Ly8gQSBzaW5nbGUgbGl0ZXJhbCBiYWNrc2xhc2gsIGluIG9yZGVyIHRvIGF2b2lkIGNvbmZ1c2lvbiBhYm91dCB3aGV0aGVyIHdlIGFyZSBlc2NhcGluZyB0ZXN0IGRhdGEgb3IgdGVzdGluZyBlc2NhcGVzLlxuXHRcdGNvbnN0IEJhY2tzbGFzaCA9ICdcXFxcJyBhcyBjb25zdDtcblx0XHRjb25zdCBOZXdsaW5lID0gJ1xcbicgYXMgY29uc3Q7XG5cdFx0Y29uc3QgU2VtaWNvbG9uID0gJzsnIGFzIGNvbnN0O1xuXG5cdFx0dHlwZSBUZXN0Q2FzZSA9IFt0aXRsZTogc3RyaW5nLCBpbnB1dDogc3RyaW5nLCBleHBlY3RlZDogc3RyaW5nXTtcblx0XHRjb25zdCBjYXNlczogVGVzdENhc2VbXSA9IFtcblx0XHRcdFsnZW1wdHknLCAnJywgJyddLFxuXHRcdFx0WydiYXNpYycsICd2YWx1ZScsICd2YWx1ZSddLFxuXHRcdFx0WydzcGFjZScsICdzb21lIHRoaW5nJywgYHNvbWUke0JhY2tzbGFzaH14MjB0aGluZ2BdLFxuXHRcdFx0WydiYWNrc2xhc2gnLCBCYWNrc2xhc2gsIGAke0JhY2tzbGFzaH0ke0JhY2tzbGFzaH1gXSxcblx0XHRcdFsnbm9uLWluaXRpYWwgYmFja3NsYXNoJywgYGZvbyR7QmFja3NsYXNofWAsIGBmb28ke0JhY2tzbGFzaH0ke0JhY2tzbGFzaH1gXSxcblx0XHRcdFsndHdvIGJhY2tzbGFzaGVzJywgYCR7QmFja3NsYXNofSR7QmFja3NsYXNofWAsIGAke0JhY2tzbGFzaH0ke0JhY2tzbGFzaH0ke0JhY2tzbGFzaH0ke0JhY2tzbGFzaH1gXSxcblx0XHRcdFsnYmFja3NsYXNoIGFtaWRzdCB0ZXh0JywgYEhlbGxvJHtCYWNrc2xhc2h9dGhlcmVgLCBgSGVsbG8ke0JhY2tzbGFzaH0ke0JhY2tzbGFzaH10aGVyZWBdLFxuXHRcdFx0WydzZW1pY29sb24nLCBTZW1pY29sb24sIGAke0JhY2tzbGFzaH14M2JgXSxcblx0XHRcdFsnbm9uLWluaXRpYWwgc2VtaWNvbG9uJywgYGZvbyR7U2VtaWNvbG9ufWAsIGBmb28ke0JhY2tzbGFzaH14M2JgXSxcblx0XHRcdFsnc2VtaWNvbG9uIGFtaWRzdCB0ZXh0JywgYHNvbWUke1NlbWljb2xvbn10aGluZ2AsIGBzb21lJHtCYWNrc2xhc2h9eDNidGhpbmdgXSxcblx0XHRcdFsnbmV3bGluZScsIE5ld2xpbmUsIGAke0JhY2tzbGFzaH14MGFgXSxcblx0XHRcdFsnbm9uLWluaXRpYWwgbmV3bGluZScsIGBmb28ke05ld2xpbmV9YCwgYGZvbyR7QmFja3NsYXNofXgwYWBdLFxuXHRcdFx0WyduZXdsaW5lIGFtaWRzdCB0ZXh0JywgYHNvbWUke05ld2xpbmV9dGhpbmdgLCBgc29tZSR7QmFja3NsYXNofXgwYXRoaW5nYF0sXG5cdFx0XHRbJ3RhYiBjaGFyYWN0ZXInLCAnXFx0JywgYCR7QmFja3NsYXNofXgwOWBdLFxuXHRcdFx0WydjYXJyaWFnZSByZXR1cm4nLCAnXFxyJywgYCR7QmFja3NsYXNofXgwZGBdLFxuXHRcdFx0WydudWxsIGNoYXJhY3RlcicsICdcXHgwMCcsIGAke0JhY2tzbGFzaH14MDBgXSxcblx0XHRcdFsnc3BhY2UgY2hhcmFjdGVyICgweDIwKScsICcgJywgYCR7QmFja3NsYXNofXgyMGBdLFxuXHRcdFx0WydjaGFyYWN0ZXIgYWJvdmUgMHgyMCcsICchJywgJyEnXSxcblx0XHRcdFsnbXVsdGlwbGUgc3BlY2lhbCBjaGFycycsIGBoZWxsbyR7TmV3bGluZX13b3JsZCR7U2VtaWNvbG9ufXRlc3Qke0JhY2tzbGFzaH1lbmRgLCBgaGVsbG8ke0JhY2tzbGFzaH14MGF3b3JsZCR7QmFja3NsYXNofXgzYnRlc3Qke0JhY2tzbGFzaH0ke0JhY2tzbGFzaH1lbmRgXSxcblx0XHRcdFsnUFMxIHdpdGggZXNjYXBlIHNlcXVlbmNlcycsIGBcXHgxYl02MzM7QVxceDA3XFxcXFtcXHgxYl0wO1xcXFx1QFxcXFxoOlxcXFx3XFxcXGFcXFxcXVxceDFiXTYzMztCXFx4MDdgLCBgJHtCYWNrc2xhc2h9eDFiXTYzMyR7QmFja3NsYXNofXgzYkEke0JhY2tzbGFzaH14MDcke0JhY2tzbGFzaH0ke0JhY2tzbGFzaH1bJHtCYWNrc2xhc2h9eDFiXTAke0JhY2tzbGFzaH14M2Ike0JhY2tzbGFzaH0ke0JhY2tzbGFzaH11QCR7QmFja3NsYXNofSR7QmFja3NsYXNofWg6JHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9dyR7QmFja3NsYXNofSR7QmFja3NsYXNofWEke0JhY2tzbGFzaH0ke0JhY2tzbGFzaH1dJHtCYWNrc2xhc2h9eDFiXTYzMyR7QmFja3NsYXNofXgzYkIke0JhY2tzbGFzaH14MDdgXVxuXHRcdF07XG5cblx0XHRjYXNlcy5mb3JFYWNoKChbdGl0bGUsIGlucHV0LCBleHBlY3RlZF0pID0+IHtcblx0XHRcdHRlc3QodGl0bGUsICgpID0+IHN0cmljdEVxdWFsKHNlcmlhbGl6ZVZTQ29kZU9zY01lc3NhZ2UoaW5wdXQpLCBleHBlY3RlZCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZUtleVZhbHVlQXNzaWdubWVudCcsICgpID0+IHtcblx0XHR0eXBlIFRlc3RDYXNlID0gW3RpdGxlOiBzdHJpbmcsIGlucHV0OiBzdHJpbmcsIGV4cGVjdGVkOiBba2V5OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWRdXTtcblx0XHRjb25zdCBjYXNlczogVGVzdENhc2VbXSA9IFtcblx0XHRcdFsnZW1wdHknLCAnJywgWycnLCB1bmRlZmluZWRdXSxcblx0XHRcdFsnbm8gXCI9XCIgc2lnbicsICdzb21lLXRleHQnLCBbJ3NvbWUtdGV4dCcsIHVuZGVmaW5lZF1dLFxuXHRcdFx0WydlbXB0eSB2YWx1ZScsICdrZXk9JywgWydrZXknLCAnJ11dLFxuXHRcdFx0WydlbXB0eSBrZXknLCAnPXZhbHVlJywgWycnLCAndmFsdWUnXV0sXG5cdFx0XHRbJ25vcm1hbCcsICdrZXk9dmFsdWUnLCBbJ2tleScsICd2YWx1ZSddXSxcblx0XHRcdFsnbXVsdGlwbGUgXCI9XCIgc2lnbnMgKDEpJywgJ2tleT09dmFsdWUnLCBbJ2tleScsICc9dmFsdWUnXV0sXG5cdFx0XHRbJ211bHRpcGxlIFwiPVwiIHNpZ25zICgyKScsICdrZXk9dmFsdWU9PT10cnVlJywgWydrZXknLCAndmFsdWU9PT10cnVlJ11dLFxuXHRcdFx0WydqdXN0IGEgXCI9XCInLCAnPScsIFsnJywgJyddXSxcblx0XHRcdFsnanVzdCBhIFwiPT1cIicsICc9PScsIFsnJywgJz0nXV0sXG5cdFx0XTtcblxuXHRcdGNhc2VzLmZvckVhY2goeCA9PiB7XG5cdFx0XHRjb25zdCBbdGl0bGUsIGlucHV0LCBba2V5LCB2YWx1ZV1dID0geDtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChwYXJzZUtleVZhbHVlQXNzaWdubWVudChpbnB1dCksIHsga2V5LCB2YWx1ZSB9LCB0aXRsZSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLFdBQVcsaUJBQWlCLG1CQUFtQjtBQUN4RCxZQUFZLFdBQVc7QUFDdkIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBbUMsMEJBQTBCO0FBQzdELFNBQVMsNkJBQTZCLDJCQUEyQix5QkFBeUIsbUJBQW1CLDZCQUE2QjtBQUMxSSxTQUFTLGNBQWM7QUFDdkIsU0FBUyx1QkFBdUI7QUFFaEMsTUFBTSxrQ0FBa0Msc0JBQXNCO0FBQUEsRUFDN0Qsd0JBQXdCLFVBQXFDO0FBQzVELFVBQU0sYUFBYSxNQUFNLDZCQUE2QixRQUFRO0FBQzlELFNBQUssYUFBYSxJQUFJLG1CQUFtQixrQkFBa0IsVUFBVTtBQUNyRSxXQUFPLE1BQU0sS0FBSyxVQUFVO0FBQUEsRUFDN0I7QUFBQSxFQUNBLG9CQUFxQztBQUNwQyxVQUFNLGFBQWEsTUFBTSx5QkFBeUI7QUFDbEQsU0FBSyxhQUFhLElBQUksbUJBQW1CLGNBQWMsVUFBVTtBQUNqRSxXQUFPLE1BQU0sS0FBSyxVQUFVO0FBQUEsRUFDN0I7QUFDRDtBQUVBLE1BQU0seUJBQXlCLE1BQU07QUFDcEMsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLFlBQVk7QUFDakIsVUFBTSxnQkFBZ0IsTUFBTSxvQkFBbUQs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
