import { deepStrictEqual, ok, strictEqual } from "assert";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { CommandDetectionCapability } from "../../../../../../platform/terminal/common/capabilities/commandDetectionCapability.js";
import { writeP } from "../../../browser/terminalTestHelpers.js";
import { TestXtermLogger } from "../../../../../../platform/terminal/test/common/terminalTestHelpers.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
class TestCommandDetectionCapability extends CommandDetectionCapability {
  clearCommands() {
    this._commands.length = 0;
  }
}
suite("CommandDetectionCapability", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let xterm;
  let capability;
  let addEvents;
  function assertCommands(expectedCommands) {
    deepStrictEqual(capability.commands.map((e) => e.command), expectedCommands.map((e) => e.command));
    deepStrictEqual(capability.commands.map((e) => e.cwd), expectedCommands.map((e) => e.cwd));
    deepStrictEqual(capability.commands.map((e) => e.exitCode), expectedCommands.map((e) => e.exitCode));
    deepStrictEqual(capability.commands.map((e) => e.marker?.line), expectedCommands.map((e) => e.marker?.line));
    for (const command of capability.commands) {
      ok(Math.abs(Date.now() - command.timestamp) < 2e3);
      ok(command.id, "Expected command to have an assigned id");
    }
    deepStrictEqual(addEvents, capability.commands);
    addEvents.length = 0;
    capability.clearCommands();
  }
  async function printStandardCommand(prompt, command, output, cwd, exitCode) {
    if (cwd !== void 0) {
      capability.setCwd(cwd);
    }
    capability.handlePromptStart();
    await writeP(xterm, `\r${prompt}`);
    capability.handleCommandStart();
    await writeP(xterm, command);
    capability.handleCommandExecuted();
    await writeP(xterm, `\r
${output}\r
`);
    capability.handleCommandFinished(exitCode);
  }
  async function printCommandStart(prompt) {
    capability.handlePromptStart();
    await writeP(xterm, `\r${prompt}`);
    capability.handleCommandStart();
  }
  setup(async () => {
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    xterm = store.add(new TerminalCtor({ allowProposedApi: true, cols: 80, logger: TestXtermLogger }));
    const instantiationService = workbenchInstantiationService(void 0, store);
    capability = store.add(instantiationService.createInstance(TestCommandDetectionCapability, xterm));
    addEvents = [];
    store.add(capability.onCommandFinished((e) => addEvents.push(e)));
    assertCommands([]);
  });
  test("should not add commands when no capability methods are triggered", async () => {
    await writeP(xterm, "foo\r\nbar\r\n");
    assertCommands([]);
    await writeP(xterm, "baz\r\n");
    assertCommands([]);
  });
  test("should add commands for expected capability method calls", async () => {
    await printStandardCommand("$ ", "echo foo", "foo", void 0, 0);
    await printCommandStart("$ ");
    assertCommands([{
      command: "echo foo",
      exitCode: 0,
      cwd: void 0,
      marker: { line: 0 }
    }]);
  });
  test("should trim the command when command executed appears on the following line", async () => {
    await printStandardCommand("$ ", "echo foo\r\n", "foo", void 0, 0);
    await printCommandStart("$ ");
    assertCommands([{
      command: "echo foo",
      exitCode: 0,
      cwd: void 0,
      marker: { line: 0 }
    }]);
  });
  suite("cwd", () => {
    test("should add cwd to commands when it's set", async () => {
      await printStandardCommand("$ ", "echo foo", "foo", "/home", 0);
      await printStandardCommand("$ ", "echo bar", "bar", "/home/second", 0);
      await printCommandStart("$ ");
      assertCommands([
        { command: "echo foo", exitCode: 0, cwd: "/home", marker: { line: 0 } },
        { command: "echo bar", exitCode: 0, cwd: "/home/second", marker: { line: 2 } }
      ]);
    });
    test("should add old cwd to commands if no cwd sequence is output", async () => {
      await printStandardCommand("$ ", "echo foo", "foo", "/home", 0);
      await printStandardCommand("$ ", "echo bar", "bar", void 0, 0);
      await printCommandStart("$ ");
      assertCommands([
        { command: "echo foo", exitCode: 0, cwd: "/home", marker: { line: 0 } },
        { command: "echo bar", exitCode: 0, cwd: "/home", marker: { line: 2 } }
      ]);
    });
    test("should use an undefined cwd if it's not set initially", async () => {
      await printStandardCommand("$ ", "echo foo", "foo", void 0, 0);
      await printStandardCommand("$ ", "echo bar", "bar", "/home", 0);
      await printCommandStart("$ ");
      assertCommands([
        { command: "echo foo", exitCode: 0, cwd: void 0, marker: { line: 0 } },
        { command: "echo bar", exitCode: 0, cwd: "/home", marker: { line: 2 } }
      ]);
    });
  });
  test("should not inherit the previous exit code when a duplicate command is interrupted", async () => {
    await printStandardCommand("$ ", "echo test", "test", void 0, 0);
    capability.handlePromptStart();
    await writeP(xterm, `\r$ `);
    capability.handleCommandStart();
    await writeP(xterm, "echo test");
    xterm.input("");
    await writeP(xterm, "^C");
    capability.setCommandLine("echo test", true);
    capability.handleCommandExecuted();
    await writeP(xterm, `\r
`);
    capability.handleCommandFinished(void 0);
    await printCommandStart("$ ");
    assertCommands([
      { command: "echo test", exitCode: 0, cwd: void 0, marker: { line: 0 } },
      { command: "echo test", exitCode: void 0, cwd: void 0, marker: { line: 2 } }
    ]);
  });
  test("should inherit the previous exit code for duplicate commands without interruption", async () => {
    await printStandardCommand("$ ", "echo ^C", "test", void 0, 0);
    capability.handlePromptStart();
    await writeP(xterm, `\r$ `);
    capability.handleCommandStart();
    await writeP(xterm, "echo ^C");
    capability.setCommandLine("echo ^C", true);
    capability.handleCommandExecuted();
    await writeP(xterm, `\r
test\r
`);
    capability.handleCommandFinished(void 0);
    await printCommandStart("$ ");
    assertCommands([
      { command: "echo ^C", exitCode: 0, cwd: void 0, marker: { line: 0 } },
      { command: "echo ^C", exitCode: 0, cwd: void 0, marker: { line: 2 } }
    ]);
  });
  test("should preserve explicit newlines at 80-column wrap boundaries in command output", async () => {
    const boundaryWidthLine = "A".repeat(80);
    await printStandardCommand("$ ", "cat content.txt", `${boundaryWidthLine}\r
after`, void 0, 0);
    await printCommandStart("$ ");
    strictEqual(capability.commands.length, 1);
    const output = capability.commands[0].getOutput();
    ok(!!output);
    ok(output.includes(`${boundaryWidthLine}
after
`));
    ok(!output.includes(`${boundaryWidthLine}after`));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL3Rlc3QvYnJvd3Nlci9jYXBhYmlsaXRpZXMvY29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgVGVybWluYWwgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsLCBvaywgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgaW1wb3J0QU1ETm9kZU1vZHVsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2FtZFguanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5LmpzJztcbmltcG9ydCB7IHdyaXRlUCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvdGVybWluYWxUZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBUZXN0WHRlcm1Mb2dnZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC90ZXN0L2NvbW1vbi90ZXJtaW5hbFRlc3RIZWxwZXJzLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5cbnR5cGUgVGVzdFRlcm1pbmFsQ29tbWFuZE1hdGNoID0gUGljazxJVGVybWluYWxDb21tYW5kLCAnY29tbWFuZCcgfCAnY3dkJyB8ICdleGl0Q29kZSc+ICYgeyBtYXJrZXI6IHsgbGluZTogbnVtYmVyIH0gfTtcblxuY2xhc3MgVGVzdENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5IGV4dGVuZHMgQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkge1xuXHRjbGVhckNvbW1hbmRzKCkge1xuXHRcdHRoaXMuX2NvbW1hbmRzLmxlbmd0aCA9IDA7XG5cdH1cbn1cblxuc3VpdGUoJ0NvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5JywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCB4dGVybTogVGVybWluYWw7XG5cdGxldCBjYXBhYmlsaXR5OiBUZXN0Q29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHk7XG5cdGxldCBhZGRFdmVudHM6IElUZXJtaW5hbENvbW1hbmRbXTtcblxuXHRmdW5jdGlvbiBhc3NlcnRDb21tYW5kcyhleHBlY3RlZENvbW1hbmRzOiBUZXN0VGVybWluYWxDb21tYW5kTWF0Y2hbXSkge1xuXHRcdGRlZXBTdHJpY3RFcXVhbChjYXBhYmlsaXR5LmNvbW1hbmRzLm1hcChlID0+IGUuY29tbWFuZCksIGV4cGVjdGVkQ29tbWFuZHMubWFwKGUgPT4gZS5jb21tYW5kKSk7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKGNhcGFiaWxpdHkuY29tbWFuZHMubWFwKGUgPT4gZS5jd2QpLCBleHBlY3RlZENvbW1hbmRzLm1hcChlID0+IGUuY3dkKSk7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKGNhcGFiaWxpdHkuY29tbWFuZHMubWFwKGUgPT4gZS5leGl0Q29kZSksIGV4cGVjdGVkQ29tbWFuZHMubWFwKGUgPT4gZS5leGl0Q29kZSkpO1xuXHRcdGRlZXBTdHJpY3RFcXVhbChjYXBhYmlsaXR5LmNvbW1hbmRzLm1hcChlID0+IGUubWFya2VyPy5saW5lKSwgZXhwZWN0ZWRDb21tYW5kcy5tYXAoZSA9PiBlLm1hcmtlcj8ubGluZSkpO1xuXHRcdC8vIEVuc3VyZSB0aW1lc3RhbXBzIGFyZSBzZXQgYW5kIHdlcmUgY2FwdHVyZWQgcmVjZW50bHlcblx0XHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgY2FwYWJpbGl0eS5jb21tYW5kcykge1xuXHRcdFx0b2soTWF0aC5hYnMoRGF0ZS5ub3coKSAtIGNvbW1hbmQudGltZXN0YW1wKSA8IDIwMDApO1xuXHRcdFx0b2soY29tbWFuZC5pZCwgJ0V4cGVjdGVkIGNvbW1hbmQgdG8gaGF2ZSBhbiBhc3NpZ25lZCBpZCcpO1xuXHRcdH1cblx0XHRkZWVwU3RyaWN0RXF1YWwoYWRkRXZlbnRzLCBjYXBhYmlsaXR5LmNvbW1hbmRzKTtcblx0XHQvLyBDbGVhciB0aGUgY29tbWFuZHMgdG8gYXZvaWQgcmUtYXNzZXJ0aW5nIHBhc3QgY29tbWFuZHNcblx0XHRhZGRFdmVudHMubGVuZ3RoID0gMDtcblx0XHRjYXBhYmlsaXR5LmNsZWFyQ29tbWFuZHMoKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHByaW50U3RhbmRhcmRDb21tYW5kKHByb21wdDogc3RyaW5nLCBjb21tYW5kOiBzdHJpbmcsIG91dHB1dDogc3RyaW5nLCBjd2Q6IHN0cmluZyB8IHVuZGVmaW5lZCwgZXhpdENvZGU6IG51bWJlcikge1xuXHRcdGlmIChjd2QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y2FwYWJpbGl0eS5zZXRDd2QoY3dkKTtcblx0XHR9XG5cdFx0Y2FwYWJpbGl0eS5oYW5kbGVQcm9tcHRTdGFydCgpO1xuXHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgYFxcciR7cHJvbXB0fWApO1xuXHRcdGNhcGFiaWxpdHkuaGFuZGxlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCBjb21tYW5kKTtcblx0XHRjYXBhYmlsaXR5LmhhbmRsZUNvbW1hbmRFeGVjdXRlZCgpO1xuXHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgYFxcclxcbiR7b3V0cHV0fVxcclxcbmApO1xuXHRcdGNhcGFiaWxpdHkuaGFuZGxlQ29tbWFuZEZpbmlzaGVkKGV4aXRDb2RlKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHByaW50Q29tbWFuZFN0YXJ0KHByb21wdDogc3RyaW5nKSB7XG5cdFx0Y2FwYWJpbGl0eS5oYW5kbGVQcm9tcHRTdGFydCgpO1xuXHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgYFxcciR7cHJvbXB0fWApO1xuXHRcdGNhcGFiaWxpdHkuaGFuZGxlQ29tbWFuZFN0YXJ0KCk7XG5cdH1cblxuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBUZXJtaW5hbEN0b3IgPSAoYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdAeHRlcm0veHRlcm0nKT4oJ0B4dGVybS94dGVybScsICdsaWIveHRlcm0uanMnKSkuVGVybWluYWw7XG5cblx0XHR4dGVybSA9IHN0b3JlLmFkZChuZXcgVGVybWluYWxDdG9yKHsgYWxsb3dQcm9wb3NlZEFwaTogdHJ1ZSwgY29sczogODAsIGxvZ2dlcjogVGVzdFh0ZXJtTG9nZ2VyIH0pKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXHRcdGNhcGFiaWxpdHkgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5LCB4dGVybSkpO1xuXHRcdGFkZEV2ZW50cyA9IFtdO1xuXHRcdHN0b3JlLmFkZChjYXBhYmlsaXR5Lm9uQ29tbWFuZEZpbmlzaGVkKGUgPT4gYWRkRXZlbnRzLnB1c2goZSkpKTtcblx0XHRhc3NlcnRDb21tYW5kcyhbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBub3QgYWRkIGNvbW1hbmRzIHdoZW4gbm8gY2FwYWJpbGl0eSBtZXRob2RzIGFyZSB0cmlnZ2VyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnZm9vXFxyXFxuYmFyXFxyXFxuJyk7XG5cdFx0YXNzZXJ0Q29tbWFuZHMoW10pO1xuXHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ2JhelxcclxcbicpO1xuXHRcdGFzc2VydENvbW1hbmRzKFtdKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGFkZCBjb21tYW5kcyBmb3IgZXhwZWN0ZWQgY2FwYWJpbGl0eSBtZXRob2QgY2FsbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcHJpbnRTdGFuZGFyZENvbW1hbmQoJyQgJywgJ2VjaG8gZm9vJywgJ2ZvbycsIHVuZGVmaW5lZCwgMCk7XG5cdFx0YXdhaXQgcHJpbnRDb21tYW5kU3RhcnQoJyQgJyk7XG5cdFx0YXNzZXJ0Q29tbWFuZHMoW3tcblx0XHRcdGNvbW1hbmQ6ICdlY2hvIGZvbycsXG5cdFx0XHRleGl0Q29kZTogMCxcblx0XHRcdGN3ZDogdW5kZWZpbmVkLFxuXHRcdFx0bWFya2VyOiB7IGxpbmU6IDAgfVxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHRyaW0gdGhlIGNvbW1hbmQgd2hlbiBjb21tYW5kIGV4ZWN1dGVkIGFwcGVhcnMgb24gdGhlIGZvbGxvd2luZyBsaW5lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHByaW50U3RhbmRhcmRDb21tYW5kKCckICcsICdlY2hvIGZvb1xcclxcbicsICdmb28nLCB1bmRlZmluZWQsIDApO1xuXHRcdGF3YWl0IHByaW50Q29tbWFuZFN0YXJ0KCckICcpO1xuXHRcdGFzc2VydENvbW1hbmRzKFt7XG5cdFx0XHRjb21tYW5kOiAnZWNobyBmb28nLFxuXHRcdFx0ZXhpdENvZGU6IDAsXG5cdFx0XHRjd2Q6IHVuZGVmaW5lZCxcblx0XHRcdG1hcmtlcjogeyBsaW5lOiAwIH1cblx0XHR9XSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjd2QnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGFkZCBjd2QgdG8gY29tbWFuZHMgd2hlbiBpdFxcJ3Mgc2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgcHJpbnRTdGFuZGFyZENvbW1hbmQoJyQgJywgJ2VjaG8gZm9vJywgJ2ZvbycsICcvaG9tZScsIDApO1xuXHRcdFx0YXdhaXQgcHJpbnRTdGFuZGFyZENvbW1hbmQoJyQgJywgJ2VjaG8gYmFyJywgJ2JhcicsICcvaG9tZS9zZWNvbmQnLCAwKTtcblx0XHRcdGF3YWl0IHByaW50Q29tbWFuZFN0YXJ0KCckICcpO1xuXHRcdFx0YXNzZXJ0Q29tbWFuZHMoW1xuXHRcdFx0XHR7IGNvbW1hbmQ6ICdlY2hvIGZvbycsIGV4aXRDb2RlOiAwLCBjd2Q6ICcvaG9tZScsIG1hcmtlcjogeyBsaW5lOiAwIH0gfSxcblx0XHRcdFx0eyBjb21tYW5kOiAnZWNobyBiYXInLCBleGl0Q29kZTogMCwgY3dkOiAnL2hvbWUvc2Vjb25kJywgbWFya2VyOiB7IGxpbmU6IDIgfSB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgYWRkIG9sZCBjd2QgdG8gY29tbWFuZHMgaWYgbm8gY3dkIHNlcXVlbmNlIGlzIG91dHB1dCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHByaW50U3RhbmRhcmRDb21tYW5kKCckICcsICdlY2hvIGZvbycsICdmb28nLCAnL2hvbWUnLCAwKTtcblx0XHRcdGF3YWl0IHByaW50U3RhbmRhcmRDb21tYW5kKCckICcsICdlY2hvIGJhcicsICdiYXInLCB1bmRlZmluZWQsIDApO1xuXHRcdFx0YXdhaXQgcHJpbnRDb21tYW5kU3RhcnQoJyQgJyk7XG5cdFx0XHRhc3NlcnRDb21tYW5kcyhbXG5cdFx0XHRcdHsgY29tbWFuZDogJ2VjaG8gZm9vJywgZXhpdENvZGU6IDAsIGN3ZDogJy9ob21lJywgbWFya2VyOiB7IGxpbmU6IDAgfSB9LFxuXHRcdFx0XHR7IGNvbW1hbmQ6ICdlY2hvIGJhcicsIGV4aXRDb2RlOiAwLCBjd2Q6ICcvaG9tZScsIG1hcmtlcjogeyBsaW5lOiAyIH0gfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBhbiB1bmRlZmluZWQgY3dkIGlmIGl0XFwncyBub3Qgc2V0IGluaXRpYWxseScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHByaW50U3RhbmRhcmRDb21tYW5kKCckICcsICdlY2hvIGZvbycsICdmb28nLCB1bmRlZmluZWQsIDApO1xuXHRcdFx0YXdhaXQgcHJpbnRTdGFuZGFyZENvbW1hbmQoJyQgJywgJ2VjaG8gYmFyJywgJ2JhcicsICcvaG9tZScsIDApO1xuXHRcdFx0YXdhaXQgcHJpbnRDb21tYW5kU3RhcnQoJyQgJyk7XG5cdFx0XHRhc3NlcnRDb21tYW5kcyhbXG5cdFx0XHRcdHsgY29tbWFuZDogJ2VjaG8gZm9vJywgZXhpdENvZGU6IDAsIGN3ZDogdW5kZWZpbmVkLCBtYXJrZXI6IHsgbGluZTogMCB9IH0sXG5cdFx0XHRcdHsgY29tbWFuZDogJ2VjaG8gYmFyJywgZXhpdENvZGU6IDAsIGN3ZDogJy9ob21lJywgbWFya2VyOiB7IGxpbmU6IDIgfSB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIG5vdCBpbmhlcml0IHRoZSBwcmV2aW91cyBleGl0IGNvZGUgd2hlbiBhIGR1cGxpY2F0ZSBjb21tYW5kIGlzIGludGVycnVwdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHByaW50U3RhbmRhcmRDb21tYW5kKCckICcsICdlY2hvIHRlc3QnLCAndGVzdCcsIHVuZGVmaW5lZCwgMCk7XG5cblx0XHRjYXBhYmlsaXR5LmhhbmRsZVByb21wdFN0YXJ0KCk7XG5cdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCBgXFxyJCBgKTtcblx0XHRjYXBhYmlsaXR5LmhhbmRsZUNvbW1hbmRTdGFydCgpO1xuXHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ2VjaG8gdGVzdCcpO1xuXHRcdHh0ZXJtLmlucHV0KCdcXHgwMycpO1xuXHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ15DJyk7XG5cdFx0Y2FwYWJpbGl0eS5zZXRDb21tYW5kTGluZSgnZWNobyB0ZXN0JywgdHJ1ZSk7XG5cdFx0Y2FwYWJpbGl0eS5oYW5kbGVDb21tYW5kRXhlY3V0ZWQoKTtcblx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sIGBcXHJcXG5gKTtcblx0XHRjYXBhYmlsaXR5LmhhbmRsZUNvbW1hbmRGaW5pc2hlZCh1bmRlZmluZWQpO1xuXG5cdFx0YXdhaXQgcHJpbnRDb21tYW5kU3RhcnQoJyQgJyk7XG5cblx0XHRhc3NlcnRDb21tYW5kcyhbXG5cdFx0XHR7IGNvbW1hbmQ6ICdlY2hvIHRlc3QnLCBleGl0Q29kZTogMCwgY3dkOiB1bmRlZmluZWQsIG1hcmtlcjogeyBsaW5lOiAwIH0gfSxcblx0XHRcdHsgY29tbWFuZDogJ2VjaG8gdGVzdCcsIGV4aXRDb2RlOiB1bmRlZmluZWQsIGN3ZDogdW5kZWZpbmVkLCBtYXJrZXI6IHsgbGluZTogMiB9IH1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGluaGVyaXQgdGhlIHByZXZpb3VzIGV4aXQgY29kZSBmb3IgZHVwbGljYXRlIGNvbW1hbmRzIHdpdGhvdXQgaW50ZXJydXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHByaW50U3RhbmRhcmRDb21tYW5kKCckICcsICdlY2hvIF5DJywgJ3Rlc3QnLCB1bmRlZmluZWQsIDApO1xuXG5cdFx0Y2FwYWJpbGl0eS5oYW5kbGVQcm9tcHRTdGFydCgpO1xuXHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgYFxcciQgYCk7XG5cdFx0Y2FwYWJpbGl0eS5oYW5kbGVDb21tYW5kU3RhcnQoKTtcblx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdlY2hvIF5DJyk7XG5cdFx0Y2FwYWJpbGl0eS5zZXRDb21tYW5kTGluZSgnZWNobyBeQycsIHRydWUpO1xuXHRcdGNhcGFiaWxpdHkuaGFuZGxlQ29tbWFuZEV4ZWN1dGVkKCk7XG5cdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCBgXFxyXFxudGVzdFxcclxcbmApO1xuXHRcdGNhcGFiaWxpdHkuaGFuZGxlQ29tbWFuZEZpbmlzaGVkKHVuZGVmaW5lZCk7XG5cblx0XHRhd2FpdCBwcmludENvbW1hbmRTdGFydCgnJCAnKTtcblxuXHRcdGFzc2VydENvbW1hbmRzKFtcblx0XHRcdHsgY29tbWFuZDogJ2VjaG8gXkMnLCBleGl0Q29kZTogMCwgY3dkOiB1bmRlZmluZWQsIG1hcmtlcjogeyBsaW5lOiAwIH0gfSxcblx0XHRcdHsgY29tbWFuZDogJ2VjaG8gXkMnLCBleGl0Q29kZTogMCwgY3dkOiB1bmRlZmluZWQsIG1hcmtlcjogeyBsaW5lOiAyIH0gfVxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcHJlc2VydmUgZXhwbGljaXQgbmV3bGluZXMgYXQgODAtY29sdW1uIHdyYXAgYm91bmRhcmllcyBpbiBjb21tYW5kIG91dHB1dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBib3VuZGFyeVdpZHRoTGluZSA9ICdBJy5yZXBlYXQoODApO1xuXHRcdGF3YWl0IHByaW50U3RhbmRhcmRDb21tYW5kKCckICcsICdjYXQgY29udGVudC50eHQnLCBgJHtib3VuZGFyeVdpZHRoTGluZX1cXHJcXG5hZnRlcmAsIHVuZGVmaW5lZCwgMCk7XG5cdFx0YXdhaXQgcHJpbnRDb21tYW5kU3RhcnQoJyQgJyk7XG5cblx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXR5LmNvbW1hbmRzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gY2FwYWJpbGl0eS5jb21tYW5kc1swXS5nZXRPdXRwdXQoKTtcblx0XHRvayghIW91dHB1dCk7XG5cdFx0b2sob3V0cHV0LmluY2x1ZGVzKGAke2JvdW5kYXJ5V2lkdGhMaW5lfVxcbmFmdGVyXFxuYCkpO1xuXHRcdG9rKCFvdXRwdXQuaW5jbHVkZXMoYCR7Ym91bmRhcnlXaWR0aExpbmV9YWZ0ZXJgKSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLGlCQUFpQixJQUFJLG1CQUFtQjtBQUNqRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLCtDQUErQztBQUV4RCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQ0FBcUM7QUFJOUMsTUFBTSx1Q0FBdUMsMkJBQTJCO0FBQUEsRUFDdkUsZ0JBQWdCO0FBQ2YsU0FBSyxVQUFVLFNBQVM7QUFBQSxFQUN6QjtBQUNEO0FBRUEsTUFBTSw4QkFBOEIsTUFBTTtBQUN6QyxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUVKLFdBQVMsZUFBZSxrQkFBOEM7QUFDckUsb0JBQWdCLFdBQVcsU0FBUyxJQUFJLE9BQUssRUFBRSxPQUFPLEdBQUcsaUJBQWlCLElBQUksT0FBSyxFQUFFLE9BQU8sQ0FBQztBQUM3RixvQkFBZ0IsV0FBVyxTQUFTLElBQUksT0FBSyxFQUFFLEdBQUcs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
