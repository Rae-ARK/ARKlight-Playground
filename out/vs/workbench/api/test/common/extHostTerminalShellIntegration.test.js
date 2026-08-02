import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { InternalTerminalShellIntegration } from "../../common/extHostTerminalShellIntegration.js";
import { Emitter } from "../../../../base/common/event.js";
import { TerminalShellExecutionCommandLineConfidence } from "../../common/extHostTypes.js";
import { deepStrictEqual, notStrictEqual, strictEqual } from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
function cmdLine(value) {
  return Object.freeze({
    confidence: TerminalShellExecutionCommandLineConfidence.High,
    value,
    isTrusted: true
  });
}
function asCmdLine(value) {
  if (typeof value === "string") {
    return cmdLine(value);
  }
  return value;
}
function vsc(data) {
  return `\x1B]633;${data}\x07`;
}
const testCommandLine = "echo hello world";
const testCommandLine2 = "echo goodbye world";
suite("InternalTerminalShellIntegration", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let si;
  let terminal;
  let onDidStartTerminalShellExecution;
  let trackedEvents;
  let readIteratorsFlushed;
  async function startExecutionAwaitObject(commandLine, cwd) {
    return await new Promise((r) => {
      store.add(onDidStartTerminalShellExecution.event((e) => {
        r(e.execution);
      }));
      si.startShellExecution(asCmdLine(commandLine), cwd);
    });
  }
  async function endExecutionAwaitObject(commandLine) {
    return await new Promise((r) => {
      store.add(si.onDidRequestEndExecution((e) => r(e.execution)));
      si.endShellExecution(asCmdLine(commandLine), 0);
    });
  }
  async function emitData(data) {
    await new Promise((r) => queueMicrotask(r));
    si.emitData(data);
  }
  function assertTrackedEvents(expected) {
    deepStrictEqual(trackedEvents, expected);
  }
  function assertNonDataTrackedEvents(expected) {
    deepStrictEqual(trackedEvents.filter((e) => e.type !== "data"), expected);
  }
  function assertDataTrackedEvents(expected) {
    deepStrictEqual(trackedEvents.filter((e) => e.type === "data"), expected);
  }
  setup(() => {
    terminal = /* @__PURE__ */ Symbol("testTerminal");
    onDidStartTerminalShellExecution = store.add(new Emitter());
    si = store.add(new InternalTerminalShellIntegration(terminal, true, onDidStartTerminalShellExecution));
    trackedEvents = [];
    readIteratorsFlushed = [];
    store.add(onDidStartTerminalShellExecution.event(async (e) => {
      trackedEvents.push({
        type: "start",
        commandLine: e.execution.commandLine.value
      });
      const stream = e.execution.read();
      const readIteratorsFlushedDeferred = new DeferredPromise();
      readIteratorsFlushed.push(readIteratorsFlushedDeferred.p);
      for await (const data of stream) {
        trackedEvents.push({
          type: "data",
          commandLine: e.execution.commandLine.value,
          data
        });
      }
      readIteratorsFlushedDeferred.complete();
    }));
    store.add(si.onDidRequestEndExecution((e) => trackedEvents.push({
      type: "end",
      commandLine: e.execution.commandLine.value
    })));
  });
  test("simple execution", async () => {
    const execution = await startExecutionAwaitObject(testCommandLine);
    deepStrictEqual(execution.commandLine.value, testCommandLine);
    const execution2 = await endExecutionAwaitObject(testCommandLine);
    strictEqual(execution2, execution);
    assertTrackedEvents([
      { commandLine: testCommandLine, type: "start" },
      { commandLine: testCommandLine, type: "end" }
    ]);
  });
  test("different execution unexpectedly ended", async () => {
    const execution1 = await startExecutionAwaitObject(testCommandLine);
    const execution2 = await endExecutionAwaitObject(testCommandLine2);
    strictEqual(execution1, execution2, "when a different execution is ended, the one that started first should end");
    assertTrackedEvents([
      { commandLine: testCommandLine, type: "start" },
      // This looks weird, but it's the same execution behind the scenes, just the command
      // line was updated
      { commandLine: testCommandLine2, type: "end" }
    ]);
  });
  test("no end event", async () => {
    const execution1 = await startExecutionAwaitObject(testCommandLine);
    const endedExecution = await new Promise((r) => {
      store.add(si.onDidRequestEndExecution((e) => r(e.execution)));
      startExecutionAwaitObject(testCommandLine2);
    });
    strictEqual(execution1, endedExecution, "when no end event is fired, the current execution should end");
    await endExecutionAwaitObject(testCommandLine2);
    await Promise.all(readIteratorsFlushed);
    assertTrackedEvents([
      { commandLine: testCommandLine, type: "start" },
      { commandLine: testCommandLine, type: "end" },
      { commandLine: testCommandLine2, type: "start" },
      { commandLine: testCommandLine2, type: "end" }
    ]);
  });
  suite("executeCommand", () => {
    test("^C to clear previous command", async () => {
      const commandLine = "foo";
      const apiRequestedExecution = si.requestNewShellExecution(cmdLine(commandLine), void 0);
      const firstExecution = await startExecutionAwaitObject("^C");
      notStrictEqual(firstExecution, apiRequestedExecution.value);
      si.emitData("SIGINT");
      si.endShellExecution(cmdLine("^C"), 0);
      si.startShellExecution(cmdLine(commandLine), void 0);
      await emitData("1");
      await endExecutionAwaitObject(commandLine);
      await Promise.all(readIteratorsFlushed);
      assertNonDataTrackedEvents([
        { commandLine: "^C", type: "start" },
        { commandLine: "^C", type: "end" },
        { commandLine, type: "start" },
        { commandLine, type: "end" }
      ]);
      assertDataTrackedEvents([
        { commandLine: "^C", type: "data", data: "SIGINT" },
        { commandLine, type: "data", data: "1" }
      ]);
    });
    test("multi-line command line", async () => {
      const commandLine = "foo\nbar";
      const apiRequestedExecution = si.requestNewShellExecution(cmdLine(commandLine), void 0);
      const startedExecution = await startExecutionAwaitObject("foo");
      strictEqual(startedExecution, apiRequestedExecution.value);
      si.emitData("1");
      si.emitData("2");
      si.endShellExecution(cmdLine("foo"), 0);
      si.startShellExecution(cmdLine("bar"), void 0);
      si.emitData("3");
      si.emitData("4");
      const endedExecution = await endExecutionAwaitObject("bar");
      strictEqual(startedExecution, endedExecution);
      assertTrackedEvents([
        { commandLine, type: "start" },
        { commandLine, type: "data", data: "1" },
        { commandLine, type: "data", data: "2" },
        { commandLine, type: "data", data: "3" },
        { commandLine, type: "data", data: "4" },
        { commandLine, type: "end" }
      ]);
    });
    test("multi-line command with long second command", async () => {
      const commandLine = "echo foo\ncat << EOT\nline1\nline2\nline3\nEOT";
      const subCommandLine1 = "echo foo";
      const subCommandLine2 = "cat << EOT\nline1\nline2\nline3\nEOT";
      const apiRequestedExecution = si.requestNewShellExecution(cmdLine(commandLine), void 0);
      const startedExecution = await startExecutionAwaitObject(subCommandLine1);
      strictEqual(startedExecution, apiRequestedExecution.value);
      si.emitData(`${vsc("C")}foo`);
      si.endShellExecution(cmdLine(subCommandLine1), 0);
      si.startShellExecution(cmdLine(subCommandLine2), void 0);
      si.emitData(`${vsc("C")}line1`);
      si.emitData("line2");
      si.emitData("line3");
      const endedExecution = await endExecutionAwaitObject(subCommandLine2);
      strictEqual(startedExecution, endedExecution);
      assertTrackedEvents([
        { commandLine, type: "start" },
        { commandLine, type: "data", data: `${vsc("C")}foo` },
        { commandLine, type: "data", data: `${vsc("C")}line1` },
        { commandLine, type: "data", data: "line2" },
        { commandLine, type: "data", data: "line3" },
        { commandLine, type: "end" }
      ]);
    });
    test("multi-line command comment followed by long second command", async () => {
      const commandLine = "# comment: foo\ncat << EOT\nline1\nline2\nline3\nEOT";
      const subCommandLine1 = "# comment: foo";
      const subCommandLine2 = "cat << EOT\nline1\nline2\nline3\nEOT";
      const apiRequestedExecution = si.requestNewShellExecution(cmdLine(commandLine), void 0);
      const startedExecution = await startExecutionAwaitObject(subCommandLine1);
      strictEqual(startedExecution, apiRequestedExecution.value);
      si.emitData(`${vsc("C")}`);
      si.endShellExecution(cmdLine(subCommandLine1), 0);
      si.startShellExecution(cmdLine(subCommandLine2), void 0);
      si.emitData(`${vsc("C")}line1`);
      si.emitData("line2");
      si.emitData("line3");
      const endedExecution = await endExecutionAwaitObject(subCommandLine2);
      strictEqual(startedExecution, endedExecution);
      assertTrackedEvents([
        { commandLine, type: "start" },
        { commandLine, type: "data", data: `${vsc("C")}` },
        { commandLine, type: "data", data: `${vsc("C")}line1` },
        { commandLine, type: "data", data: "line2" },
        { commandLine, type: "data", data: "line3" },
        { commandLine, type: "end" }
      ]);
    });
    test("4 multi-line commands with output", async () => {
      const commandLine = 'echo "\nfoo"\ngit commit -m "hello\n\nworld"\ncat << EOT\nline1\nline2\nline3\nEOT\n{\necho "foo"\n}';
      const subCommandLine1 = 'echo "\nfoo"';
      const subCommandLine2 = 'git commit -m "hello\n\nworld"';
      const subCommandLine3 = "cat << EOT\nline1\nline2\nline3\nEOT";
      const subCommandLine4 = '{\necho "foo"\n}';
      const apiRequestedExecution = si.requestNewShellExecution(cmdLine(commandLine), void 0);
      const startedExecution = await startExecutionAwaitObject(subCommandLine1);
      strictEqual(startedExecution, apiRequestedExecution.value);
      si.emitData(`${vsc("C")}foo`);
      si.endShellExecution(cmdLine(subCommandLine1), 0);
      si.startShellExecution(cmdLine(subCommandLine2), void 0);
      si.emitData(`${vsc("C")} 2 files changed, 61 insertions(+), 2 deletions(-)`);
      si.endShellExecution(cmdLine(subCommandLine2), 0);
      si.startShellExecution(cmdLine(subCommandLine3), void 0);
      si.emitData(`${vsc("C")}line1`);
      si.emitData("line2");
      si.emitData("line3");
      si.endShellExecution(cmdLine(subCommandLine3), 0);
      si.emitData(`${vsc("C")}foo`);
      si.startShellExecution(cmdLine(subCommandLine4), void 0);
      const endedExecution = await endExecutionAwaitObject(subCommandLine4);
      strictEqual(startedExecution, endedExecution);
      assertTrackedEvents([
        { commandLine, type: "start" },
        { commandLine, type: "data", data: `${vsc("C")}foo` },
        { commandLine, type: "data", data: `${vsc("C")} 2 files changed, 61 insertions(+), 2 deletions(-)` },
        { commandLine, type: "data", data: `${vsc("C")}line1` },
        { commandLine, type: "data", data: "line2" },
        { commandLine, type: "data", data: "line3" },
        { commandLine, type: "data", data: `${vsc("C")}foo` },
        { commandLine, type: "end" }
      ]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9jb21tb24vZXh0SG9zdFRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgdHlwZSBUZXJtaW5hbCwgdHlwZSBUZXJtaW5hbFNoZWxsRXhlY3V0aW9uLCB0eXBlIFRlcm1pbmFsU2hlbGxFeGVjdXRpb25Db21tYW5kTGluZSwgdHlwZSBUZXJtaW5hbFNoZWxsRXhlY3V0aW9uU3RhcnRFdmVudCB9IGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEludGVybmFsVGVybWluYWxTaGVsbEludGVncmF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsU2hlbGxFeGVjdXRpb25Db21tYW5kTGluZUNvbmZpZGVuY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgbm90U3RyaWN0RXF1YWwsIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB0eXBlIHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcblxuZnVuY3Rpb24gY21kTGluZSh2YWx1ZTogc3RyaW5nKTogVGVybWluYWxTaGVsbEV4ZWN1dGlvbkNvbW1hbmRMaW5lIHtcblx0cmV0dXJuIE9iamVjdC5mcmVlemUoe1xuXHRcdGNvbmZpZGVuY2U6IFRlcm1pbmFsU2hlbGxFeGVjdXRpb25Db21tYW5kTGluZUNvbmZpZGVuY2UuSGlnaCxcblx0XHR2YWx1ZSxcblx0XHRpc1RydXN0ZWQ6IHRydWUsXG5cdH0pO1xufVxuZnVuY3Rpb24gYXNDbWRMaW5lKHZhbHVlOiBzdHJpbmcgfCBUZXJtaW5hbFNoZWxsRXhlY3V0aW9uQ29tbWFuZExpbmUpOiBUZXJtaW5hbFNoZWxsRXhlY3V0aW9uQ29tbWFuZExpbmUge1xuXHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiBjbWRMaW5lKHZhbHVlKTtcblx0fVxuXHRyZXR1cm4gdmFsdWU7XG59XG5mdW5jdGlvbiB2c2MoZGF0YTogc3RyaW5nKSB7XG5cdHJldHVybiBgXFx4MWJdNjMzOyR7ZGF0YX1cXHgwN2A7XG59XG5cbmNvbnN0IHRlc3RDb21tYW5kTGluZSA9ICdlY2hvIGhlbGxvIHdvcmxkJztcbmNvbnN0IHRlc3RDb21tYW5kTGluZTIgPSAnZWNobyBnb29kYnllIHdvcmxkJztcblxuaW50ZXJmYWNlIElUcmFja2VkRXZlbnQge1xuXHR0eXBlOiAnc3RhcnQnIHwgJ2RhdGEnIHwgJ2VuZCc7XG5cdGNvbW1hbmRMaW5lOiBzdHJpbmc7XG5cdGRhdGE/OiBzdHJpbmc7XG59XG5cbnN1aXRlKCdJbnRlcm5hbFRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgc2k6IEludGVybmFsVGVybWluYWxTaGVsbEludGVncmF0aW9uO1xuXHRsZXQgdGVybWluYWw6IFRlcm1pbmFsO1xuXHRsZXQgb25EaWRTdGFydFRlcm1pbmFsU2hlbGxFeGVjdXRpb246IEVtaXR0ZXI8VGVybWluYWxTaGVsbEV4ZWN1dGlvblN0YXJ0RXZlbnQ+O1xuXHRsZXQgdHJhY2tlZEV2ZW50czogSVRyYWNrZWRFdmVudFtdO1xuXHRsZXQgcmVhZEl0ZXJhdG9yc0ZsdXNoZWQ6IFByb21pc2U8dm9pZD5bXTtcblxuXHRhc3luYyBmdW5jdGlvbiBzdGFydEV4ZWN1dGlvbkF3YWl0T2JqZWN0KGNvbW1hbmRMaW5lOiBzdHJpbmcgfCBUZXJtaW5hbFNoZWxsRXhlY3V0aW9uQ29tbWFuZExpbmUsIGN3ZD86IFVSSSk6IFByb21pc2U8VGVybWluYWxTaGVsbEV4ZWN1dGlvbj4ge1xuXHRcdHJldHVybiBhd2FpdCBuZXcgUHJvbWlzZTxUZXJtaW5hbFNoZWxsRXhlY3V0aW9uPihyID0+IHtcblx0XHRcdHN0b3JlLmFkZChvbkRpZFN0YXJ0VGVybWluYWxTaGVsbEV4ZWN1dGlvbi5ldmVudChlID0+IHtcblx0XHRcdFx0cihlLmV4ZWN1dGlvbik7XG5cdFx0XHR9KSk7XG5cdFx0XHRzaS5zdGFydFNoZWxsRXhlY3V0aW9uKGFzQ21kTGluZShjb21tYW5kTGluZSksIGN3ZCk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBlbmRFeGVjdXRpb25Bd2FpdE9iamVjdChjb21tYW5kTGluZTogc3RyaW5nIHwgVGVybWluYWxTaGVsbEV4ZWN1dGlvbkNvbW1hbmRMaW5lKTogUHJvbWlzZTxUZXJtaW5hbFNoZWxsRXhlY3V0aW9uPiB7XG5cdFx0cmV0dXJuIGF3YWl0IG5ldyBQcm9taXNlPFRlcm1pbmFsU2hlbGxFeGVjdXRpb24+KHIgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKHNpLm9uRGlkUmVxdWVzdEVuZEV4ZWN1dGlvbihlID0+IHIoZS5leGVjdXRpb24pKSk7XG5cdFx0XHRzaS5lbmRTaGVsbEV4ZWN1dGlvbihhc0NtZExpbmUoY29tbWFuZExpbmUpLCAwKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGVtaXREYXRhKGRhdGE6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIEFzeW5jSXRlcmFibGVPYmplY3RzIGFyZSBpbml0aWFsaXplZCBpbiBhIG1pY3JvdGFzaywgdGhpcyBkb2Vzbid0IG1hdHRlciBpbiBwcmFjdGljZVxuXHRcdC8vIHNpbmNlIHRoZSBldmVudHMgd2lsbCBhbHdheXMgY29tZSB0aHJvdWdoIGluIGRpZmZlcmVudCBldmVudHMuXG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ociA9PiBxdWV1ZU1pY3JvdGFzayhyKSk7XG5cdFx0c2kuZW1pdERhdGEoZGF0YSk7XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRUcmFja2VkRXZlbnRzKGV4cGVjdGVkOiBJVHJhY2tlZEV2ZW50W10pIHtcblx0XHRkZWVwU3RyaWN0RXF1YWwodHJhY2tlZEV2ZW50cywgZXhwZWN0ZWQpO1xuXHR9XG5cblx0ZnVuY3Rpb24gYXNzZXJ0Tm9uRGF0YVRyYWNrZWRFdmVudHMoZXhwZWN0ZWQ6IElUcmFja2VkRXZlbnRbXSkge1xuXHRcdGRlZXBTdHJpY3RFcXVhbCh0cmFja2VkRXZlbnRzLmZpbHRlcihlID0+IGUudHlwZSAhPT0gJ2RhdGEnKSwgZXhwZWN0ZWQpO1xuXHR9XG5cblx0ZnVuY3Rpb24gYXNzZXJ0RGF0YVRyYWNrZWRFdmVudHMoZXhwZWN0ZWQ6IElUcmFja2VkRXZlbnRbXSkge1xuXHRcdGRlZXBTdHJpY3RFcXVhbCh0cmFja2VkRXZlbnRzLmZpbHRlcihlID0+IGUudHlwZSA9PT0gJ2RhdGEnKSwgZXhwZWN0ZWQpO1xuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHRlcm1pbmFsID0gU3ltYm9sKCd0ZXN0VGVybWluYWwnKSBhcyBhbnk7XG5cdFx0b25EaWRTdGFydFRlcm1pbmFsU2hlbGxFeGVjdXRpb24gPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXIoKSk7XG5cdFx0c2kgPSBzdG9yZS5hZGQobmV3IEludGVybmFsVGVybWluYWxTaGVsbEludGVncmF0aW9uKHRlcm1pbmFsLCB0cnVlLCBvbkRpZFN0YXJ0VGVybWluYWxTaGVsbEV4ZWN1dGlvbikpO1xuXG5cdFx0dHJhY2tlZEV2ZW50cyA9IFtdO1xuXHRcdHJlYWRJdGVyYXRvcnNGbHVzaGVkID0gW107XG5cdFx0c3RvcmUuYWRkKG9uRGlkU3RhcnRUZXJtaW5hbFNoZWxsRXhlY3V0aW9uLmV2ZW50KGFzeW5jIGUgPT4ge1xuXHRcdFx0dHJhY2tlZEV2ZW50cy5wdXNoKHtcblx0XHRcdFx0dHlwZTogJ3N0YXJ0Jyxcblx0XHRcdFx0Y29tbWFuZExpbmU6IGUuZXhlY3V0aW9uLmNvbW1hbmRMaW5lLnZhbHVlLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzdHJlYW0gPSBlLmV4ZWN1dGlvbi5yZWFkKCk7XG5cdFx0XHRjb25zdCByZWFkSXRlcmF0b3JzRmx1c2hlZERlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0cmVhZEl0ZXJhdG9yc0ZsdXNoZWQucHVzaChyZWFkSXRlcmF0b3JzRmx1c2hlZERlZmVycmVkLnApO1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBkYXRhIG9mIHN0cmVhbSkge1xuXHRcdFx0XHR0cmFja2VkRXZlbnRzLnB1c2goe1xuXHRcdFx0XHRcdHR5cGU6ICdkYXRhJyxcblx0XHRcdFx0XHRjb21tYW5kTGluZTogZS5leGVjdXRpb24uY29tbWFuZExpbmUudmFsdWUsXG5cdFx0XHRcdFx0ZGF0YSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRyZWFkSXRlcmF0b3JzRmx1c2hlZERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZChzaS5vbkRpZFJlcXVlc3RFbmRFeGVjdXRpb24oZSA9PiB0cmFja2VkRXZlbnRzLnB1c2goe1xuXHRcdFx0dHlwZTogJ2VuZCcsXG5cdFx0XHRjb21tYW5kTGluZTogZS5leGVjdXRpb24uY29tbWFuZExpbmUudmFsdWUsXG5cdFx0fSkpKTtcblx0fSk7XG5cblx0dGVzdCgnc2ltcGxlIGV4ZWN1dGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleGVjdXRpb24gPSBhd2FpdCBzdGFydEV4ZWN1dGlvbkF3YWl0T2JqZWN0KHRlc3RDb21tYW5kTGluZSk7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKGV4ZWN1dGlvbi5jb21tYW5kTGluZS52YWx1ZSwgdGVzdENvbW1hbmRMaW5lKTtcblx0XHRjb25zdCBleGVjdXRpb24yID0gYXdhaXQgZW5kRXhlY3V0aW9uQXdhaXRPYmplY3QodGVzdENvbW1hbmRMaW5lKTtcblx0XHRzdHJpY3RFcXVhbChleGVjdXRpb24yLCBleGVjdXRpb24pO1xuXG5cdFx0YXNzZXJ0VHJhY2tlZEV2ZW50cyhbXG5cdFx0XHR7IGNvbW1hbmRMaW5lOiB0ZXN0Q29tbWFuZExpbmUsIHR5cGU6ICdzdGFydCcgfSxcblx0XHRcdHsgY29tbWFuZExpbmU6IHRlc3RDb21tYW5kTGluZSwgdHlwZTogJ2VuZCcgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZmVyZW50IGV4ZWN1dGlvbiB1bmV4cGVjdGVkbHkgZW5kZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXhlY3V0aW9uMSA9IGF3YWl0IHN0YXJ0RXhlY3V0aW9uQXdhaXRPYmplY3QodGVzdENvbW1hbmRMaW5lKTtcblx0XHRjb25zdCBleGVjdXRpb24yID0gYXdhaXQgZW5kRXhlY3V0aW9uQXdhaXRPYmplY3QodGVzdENvbW1hbmRMaW5lMik7XG5cdFx0c3RyaWN0RXF1YWwoZXhlY3V0aW9uMSwgZXhlY3V0aW9uMiwgJ3doZW4gYSBkaWZmZXJlbnQgZXhlY3V0aW9uIGlzIGVuZGVkLCB0aGUgb25lIHRoYXQgc3RhcnRlZCBmaXJzdCBzaG91bGQgZW5kJyk7XG5cblx0XHRhc3NlcnRUcmFja2VkRXZlbnRzKFtcblx0XHRcdHsgY29tbWFuZExpbmU6IHRlc3RDb21tYW5kTGluZSwgdHlwZTogJ3N0YXJ0JyB9LFxuXHRcdFx0Ly8gVGhpcyBsb29rcyB3ZWlyZCwgYnV0IGl0J3MgdGhlIHNhbWUgZXhlY3V0aW9uIGJlaGluZCB0aGUgc2NlbmVzLCBqdXN0IHRoZSBjb21tYW5kXG5cdFx0XHQvLyBsaW5lIHdhcyB1cGRhdGVkXG5cdFx0XHR7IGNvbW1hbmRMaW5lOiB0ZXN0Q29tbWFuZExpbmUyLCB0eXBlOiAnZW5kJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdubyBlbmQgZXZlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXhlY3V0aW9uMSA9IGF3YWl0IHN0YXJ0RXhlY3V0aW9uQXdhaXRPYmplY3QodGVzdENvbW1hbmRMaW5lKTtcblx0XHRjb25zdCBlbmRlZEV4ZWN1dGlvbiA9IGF3YWl0IG5ldyBQcm9taXNlPFRlcm1pbmFsU2hlbGxFeGVjdXRpb24+KHIgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKHNpLm9uRGlkUmVxdWVzdEVuZEV4ZWN1dGlvbihlID0+IHIoZS5leGVjdXRpb24pKSk7XG5cdFx0XHRzdGFydEV4ZWN1dGlvbkF3YWl0T2JqZWN0KHRlc3RDb21tYW5kTGluZTIpO1xuXHRcdH0pO1xuXHRcdHN0cmljdEVxdWFsKGV4ZWN1dGlvbjEsIGVuZGVkRXhlY3V0aW9uLCAnd2hlbiBubyBlbmQgZXZlbnQgaXMgZmlyZWQsIHRoZSBjdXJyZW50IGV4ZWN1dGlvbiBzaG91bGQgZW5kJyk7XG5cblx0XHQvLyBDbGVhbiB1cCBkaXNwb3NhYmxlc1xuXHRcdGF3YWl0IGVuZEV4ZWN1dGlvbkF3YWl0T2JqZWN0KHRlc3RDb21tYW5kTGluZTIpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKHJlYWRJdGVyYXRvcnNGbHVzaGVkKTtcblxuXHRcdGFzc2VydFRyYWNrZWRFdmVudHMoW1xuXHRcdFx0eyBjb21tYW5kTGluZTogdGVzdENvbW1hbmRMaW5lLCB0eXBlOiAnc3RhcnQnIH0sXG5cdFx0XHR7IGNvbW1hbmRMaW5lOiB0ZXN0Q29tbWFuZExpbmUsIHR5cGU6ICdlbmQnIH0sXG5cdFx0XHR7IGNvbW1hbmRMaW5lOiB0ZXN0Q29tbWFuZExpbmUyLCB0eXBlOiAnc3RhcnQnIH0sXG5cdFx0XHR7IGNvbW1hbmRMaW5lOiB0ZXN0Q29tbWFuZExpbmUyLCB0eXBlOiAnZW5kJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZXhlY3V0ZUNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnXkMgdG8gY2xlYXIgcHJldmlvdXMgY29tbWFuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gJ2Zvbyc7XG5cdFx0XHRjb25zdCBhcGlSZXF1ZXN0ZWRFeGVjdXRpb24gPSBzaS5yZXF1ZXN0TmV3U2hlbGxFeGVjdXRpb24oY21kTGluZShjb21tYW5kTGluZSksIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBmaXJzdEV4ZWN1dGlvbiA9IGF3YWl0IHN0YXJ0RXhlY3V0aW9uQXdhaXRPYmplY3QoJ15DJyk7XG5cdFx0XHRub3RTdHJpY3RFcXVhbChmaXJzdEV4ZWN1dGlvbiwgYXBpUmVxdWVzdGVkRXhlY3V0aW9uLnZhbHVlKTtcblx0XHRcdHNpLmVtaXREYXRhKCdTSUdJTlQnKTtcblx0XHRcdHNpLmVuZFNoZWxsRXhlY3V0aW9uKGNtZExpbmUoJ15DJyksIDApO1xuXHRcdFx0c2kuc3RhcnRTaGVsbEV4ZWN1dGlvbihjbWRMaW5lKGNvbW1hbmRMaW5lKSwgdW5kZWZpbmVkKTtcblx0XHRcdGF3YWl0IGVtaXREYXRhKCcxJyk7XG5cdFx0XHRhd2FpdCBlbmRFeGVjdXRpb25Bd2FpdE9iamVjdChjb21tYW5kTGluZSk7XG5cdFx0XHQvLyBJTVBPUlRBTlQ6IFdlIGNhbm5vdCByZWxpYWJseSBhc3NlcnQgdGhlIG9yZGVyIG9mIGRhdGEgZXZlbnRzIGhlcmUgYmVjYXVzZSBmbHVzaGluZ1xuXHRcdFx0Ly8gb2YgdGhlIGFzeW5jIGl0ZXJhdG9yIGlzIGFzeW5jaHJvbm91cyBhbmQgY291bGQgaGFwcGVuIGFmdGVyIHRoZSBleGVjdXRpb24ncyBlbmRcblx0XHRcdC8vIGV2ZW50IGZpcmVzIGlmIGFuIGV4ZWN1dGlvbiBpcyBzdGFydGVkIGltbWVkaWF0ZWx5IGFmdGVyd2FyZHMuXG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChyZWFkSXRlcmF0b3JzRmx1c2hlZCk7XG5cblx0XHRcdGFzc2VydE5vbkRhdGFUcmFja2VkRXZlbnRzKFtcblx0XHRcdFx0eyBjb21tYW5kTGluZTogJ15DJywgdHlwZTogJ3N0YXJ0JyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiAnXkMnLCB0eXBlOiAnZW5kJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnc3RhcnQnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdlbmQnIH0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydERhdGFUcmFja2VkRXZlbnRzKFtcblx0XHRcdFx0eyBjb21tYW5kTGluZTogJ15DJywgdHlwZTogJ2RhdGEnLCBkYXRhOiAnU0lHSU5UJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZGF0YScsIGRhdGE6ICcxJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aS1saW5lIGNvbW1hbmQgbGluZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gJ2Zvb1xcbmJhcic7XG5cdFx0XHRjb25zdCBhcGlSZXF1ZXN0ZWRFeGVjdXRpb24gPSBzaS5yZXF1ZXN0TmV3U2hlbGxFeGVjdXRpb24oY21kTGluZShjb21tYW5kTGluZSksIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBzdGFydGVkRXhlY3V0aW9uID0gYXdhaXQgc3RhcnRFeGVjdXRpb25Bd2FpdE9iamVjdCgnZm9vJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChzdGFydGVkRXhlY3V0aW9uLCBhcGlSZXF1ZXN0ZWRFeGVjdXRpb24udmFsdWUpO1xuXG5cdFx0XHRzaS5lbWl0RGF0YSgnMScpO1xuXHRcdFx0c2kuZW1pdERhdGEoJzInKTtcblx0XHRcdHNpLmVuZFNoZWxsRXhlY3V0aW9uKGNtZExpbmUoJ2ZvbycpLCAwKTtcblx0XHRcdHNpLnN0YXJ0U2hlbGxFeGVjdXRpb24oY21kTGluZSgnYmFyJyksIHVuZGVmaW5lZCk7XG5cdFx0XHRzaS5lbWl0RGF0YSgnMycpO1xuXHRcdFx0c2kuZW1pdERhdGEoJzQnKTtcblx0XHRcdGNvbnN0IGVuZGVkRXhlY3V0aW9uID0gYXdhaXQgZW5kRXhlY3V0aW9uQXdhaXRPYmplY3QoJ2JhcicpO1xuXHRcdFx0c3RyaWN0RXF1YWwoc3RhcnRlZEV4ZWN1dGlvbiwgZW5kZWRFeGVjdXRpb24pO1xuXG5cdFx0XHRhc3NlcnRUcmFja2VkRXZlbnRzKFtcblx0XHRcdFx0eyBjb21tYW5kTGluZSwgdHlwZTogJ3N0YXJ0JyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZGF0YScsIGRhdGE6ICcxJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZGF0YScsIGRhdGE6ICcyJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZGF0YScsIGRhdGE6ICczJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZGF0YScsIGRhdGE6ICc0JyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZW5kJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aS1saW5lIGNvbW1hbmQgd2l0aCBsb25nIHNlY29uZCBjb21tYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZExpbmUgPSAnZWNobyBmb29cXG5jYXQgPDwgRU9UXFxubGluZTFcXG5saW5lMlxcbmxpbmUzXFxuRU9UJztcblx0XHRcdGNvbnN0IHN1YkNvbW1hbmRMaW5lMSA9ICdlY2hvIGZvbyc7XG5cdFx0XHRjb25zdCBzdWJDb21tYW5kTGluZTIgPSAnY2F0IDw8IEVPVFxcbmxpbmUxXFxubGluZTJcXG5saW5lM1xcbkVPVCc7XG5cblx0XHRcdGNvbnN0IGFwaVJlcXVlc3RlZEV4ZWN1dGlvbiA9IHNpLnJlcXVlc3ROZXdTaGVsbEV4ZWN1dGlvbihjbWRMaW5lKGNvbW1hbmRMaW5lKSwgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHN0YXJ0ZWRFeGVjdXRpb24gPSBhd2FpdCBzdGFydEV4ZWN1dGlvbkF3YWl0T2JqZWN0KHN1YkNvbW1hbmRMaW5lMSk7XG5cdFx0XHRzdHJpY3RFcXVhbChzdGFydGVkRXhlY3V0aW9uLCBhcGlSZXF1ZXN0ZWRFeGVjdXRpb24udmFsdWUpO1xuXG5cdFx0XHRzaS5lbWl0RGF0YShgJHt2c2MoJ0MnKX1mb29gKTtcblx0XHRcdHNpLmVuZFNoZWxsRXhlY3V0aW9uKGNtZExpbmUoc3ViQ29tbWFuZExpbmUxKSwgMCk7XG5cdFx0XHRzaS5zdGFydFNoZWxsRXhlY3V0aW9uKGNtZExpbmUoc3ViQ29tbWFuZExpbmUyKSwgdW5kZWZpbmVkKTtcblx0XHRcdHNpLmVtaXREYXRhKGAke3ZzYygnQycpfWxpbmUxYCk7XG5cdFx0XHRzaS5lbWl0RGF0YSgnbGluZTInKTtcblx0XHRcdHNpLmVtaXREYXRhKCdsaW5lMycpO1xuXHRcdFx0Y29uc3QgZW5kZWRFeGVjdXRpb24gPSBhd2FpdCBlbmRFeGVjdXRpb25Bd2FpdE9iamVjdChzdWJDb21tYW5kTGluZTIpO1xuXHRcdFx0c3RyaWN0RXF1YWwoc3RhcnRlZEV4ZWN1dGlvbiwgZW5kZWRFeGVjdXRpb24pO1xuXG5cdFx0XHRhc3NlcnRUcmFja2VkRXZlbnRzKFtcblx0XHRcdFx0eyBjb21tYW5kTGluZSwgdHlwZTogJ3N0YXJ0JyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZGF0YScsIGRhdGE6IGAke3ZzYygnQycpfWZvb2AgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZSwgdHlwZTogJ2RhdGEnLCBkYXRhOiBgJHt2c2MoJ0MnKX1saW5lMWAgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZSwgdHlwZTogJ2RhdGEnLCBkYXRhOiAnbGluZTInIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdkYXRhJywgZGF0YTogJ2xpbmUzJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZW5kJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aS1saW5lIGNvbW1hbmQgY29tbWVudCBmb2xsb3dlZCBieSBsb25nIHNlY29uZCBjb21tYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZExpbmUgPSAnIyBjb21tZW50OiBmb29cXG5jYXQgPDwgRU9UXFxubGluZTFcXG5saW5lMlxcbmxpbmUzXFxuRU9UJztcblx0XHRcdGNvbnN0IHN1YkNvbW1hbmRMaW5lMSA9ICcjIGNvbW1lbnQ6IGZvbyc7XG5cdFx0XHRjb25zdCBzdWJDb21tYW5kTGluZTIgPSAnY2F0IDw8IEVPVFxcbmxpbmUxXFxubGluZTJcXG5saW5lM1xcbkVPVCc7XG5cblx0XHRcdGNvbnN0IGFwaVJlcXVlc3RlZEV4ZWN1dGlvbiA9IHNpLnJlcXVlc3ROZXdTaGVsbEV4ZWN1dGlvbihjbWRMaW5lKGNvbW1hbmRMaW5lKSwgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHN0YXJ0ZWRFeGVjdXRpb24gPSBhd2FpdCBzdGFydEV4ZWN1dGlvbkF3YWl0T2JqZWN0KHN1YkNvbW1hbmRMaW5lMSk7XG5cdFx0XHRzdHJpY3RFcXVhbChzdGFydGVkRXhlY3V0aW9uLCBhcGlSZXF1ZXN0ZWRFeGVjdXRpb24udmFsdWUpO1xuXG5cdFx0XHRzaS5lbWl0RGF0YShgJHt2c2MoJ0MnKX1gKTtcblx0XHRcdHNpLmVuZFNoZWxsRXhlY3V0aW9uKGNtZExpbmUoc3ViQ29tbWFuZExpbmUxKSwgMCk7XG5cdFx0XHRzaS5zdGFydFNoZWxsRXhlY3V0aW9uKGNtZExpbmUoc3ViQ29tbWFuZExpbmUyKSwgdW5kZWZpbmVkKTtcblx0XHRcdHNpLmVtaXREYXRhKGAke3ZzYygnQycpfWxpbmUxYCk7XG5cdFx0XHRzaS5lbWl0RGF0YSgnbGluZTInKTtcblx0XHRcdHNpLmVtaXREYXRhKCdsaW5lMycpO1xuXHRcdFx0Y29uc3QgZW5kZWRFeGVjdXRpb24gPSBhd2FpdCBlbmRFeGVjdXRpb25Bd2FpdE9iamVjdChzdWJDb21tYW5kTGluZTIpO1xuXHRcdFx0c3RyaWN0RXF1YWwoc3RhcnRlZEV4ZWN1dGlvbiwgZW5kZWRFeGVjdXRpb24pO1xuXG5cdFx0XHRhc3NlcnRUcmFja2VkRXZlbnRzKFtcblx0XHRcdFx0eyBjb21tYW5kTGluZSwgdHlwZTogJ3N0YXJ0JyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZGF0YScsIGRhdGE6IGAke3ZzYygnQycpfWAgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZSwgdHlwZTogJ2RhdGEnLCBkYXRhOiBgJHt2c2MoJ0MnKX1saW5lMWAgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZSwgdHlwZTogJ2RhdGEnLCBkYXRhOiAnbGluZTInIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdkYXRhJywgZGF0YTogJ2xpbmUzJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZW5kJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCc0IG11bHRpLWxpbmUgY29tbWFuZHMgd2l0aCBvdXRwdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb21tYW5kTGluZSA9ICdlY2hvIFwiXFxuZm9vXCJcXG5naXQgY29tbWl0IC1tIFwiaGVsbG9cXG5cXG53b3JsZFwiXFxuY2F0IDw8IEVPVFxcbmxpbmUxXFxubGluZTJcXG5saW5lM1xcbkVPVFxcbntcXG5lY2hvIFwiZm9vXCJcXG59Jztcblx0XHRcdGNvbnN0IHN1YkNvbW1hbmRMaW5lMSA9ICdlY2hvIFwiXFxuZm9vXCInO1xuXHRcdFx0Y29uc3Qgc3ViQ29tbWFuZExpbmUyID0gJ2dpdCBjb21taXQgLW0gXCJoZWxsb1xcblxcbndvcmxkXCInO1xuXHRcdFx0Y29uc3Qgc3ViQ29tbWFuZExpbmUzID0gJ2NhdCA8PCBFT1RcXG5saW5lMVxcbmxpbmUyXFxubGluZTNcXG5FT1QnO1xuXHRcdFx0Y29uc3Qgc3ViQ29tbWFuZExpbmU0ID0gJ3tcXG5lY2hvIFwiZm9vXCJcXG59JztcblxuXHRcdFx0Y29uc3QgYXBpUmVxdWVzdGVkRXhlY3V0aW9uID0gc2kucmVxdWVzdE5ld1NoZWxsRXhlY3V0aW9uKGNtZExpbmUoY29tbWFuZExpbmUpLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3Qgc3RhcnRlZEV4ZWN1dGlvbiA9IGF3YWl0IHN0YXJ0RXhlY3V0aW9uQXdhaXRPYmplY3Qoc3ViQ29tbWFuZExpbmUxKTtcblx0XHRcdHN0cmljdEVxdWFsKHN0YXJ0ZWRFeGVjdXRpb24sIGFwaVJlcXVlc3RlZEV4ZWN1dGlvbi52YWx1ZSk7XG5cblx0XHRcdHNpLmVtaXREYXRhKGAke3ZzYygnQycpfWZvb2ApO1xuXHRcdFx0c2kuZW5kU2hlbGxFeGVjdXRpb24oY21kTGluZShzdWJDb21tYW5kTGluZTEpLCAwKTtcblx0XHRcdHNpLnN0YXJ0U2hlbGxFeGVjdXRpb24oY21kTGluZShzdWJDb21tYW5kTGluZTIpLCB1bmRlZmluZWQpO1xuXHRcdFx0c2kuZW1pdERhdGEoYCR7dnNjKCdDJyl9IDIgZmlsZXMgY2hhbmdlZCwgNjEgaW5zZXJ0aW9ucygrKSwgMiBkZWxldGlvbnMoLSlgKTtcblx0XHRcdHNpLmVuZFNoZWxsRXhlY3V0aW9uKGNtZExpbmUoc3ViQ29tbWFuZExpbmUyKSwgMCk7XG5cdFx0XHRzaS5zdGFydFNoZWxsRXhlY3V0aW9uKGNtZExpbmUoc3ViQ29tbWFuZExpbmUzKSwgdW5kZWZpbmVkKTtcblx0XHRcdHNpLmVtaXREYXRhKGAke3ZzYygnQycpfWxpbmUxYCk7XG5cdFx0XHRzaS5lbWl0RGF0YSgnbGluZTInKTtcblx0XHRcdHNpLmVtaXREYXRhKCdsaW5lMycpO1xuXHRcdFx0c2kuZW5kU2hlbGxFeGVjdXRpb24oY21kTGluZShzdWJDb21tYW5kTGluZTMpLCAwKTtcblx0XHRcdHNpLmVtaXREYXRhKGAke3ZzYygnQycpfWZvb2ApO1xuXHRcdFx0c2kuc3RhcnRTaGVsbEV4ZWN1dGlvbihjbWRMaW5lKHN1YkNvbW1hbmRMaW5lNCksIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBlbmRlZEV4ZWN1dGlvbiA9IGF3YWl0IGVuZEV4ZWN1dGlvbkF3YWl0T2JqZWN0KHN1YkNvbW1hbmRMaW5lNCk7XG5cdFx0XHRzdHJpY3RFcXVhbChzdGFydGVkRXhlY3V0aW9uLCBlbmRlZEV4ZWN1dGlvbik7XG5cblx0XHRcdGFzc2VydFRyYWNrZWRFdmVudHMoW1xuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnc3RhcnQnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdkYXRhJywgZGF0YTogYCR7dnNjKCdDJyl9Zm9vYCB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZGF0YScsIGRhdGE6IGAke3ZzYygnQycpfSAyIGZpbGVzIGNoYW5nZWQsIDYxIGluc2VydGlvbnMoKyksIDIgZGVsZXRpb25zKC0pYCB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZGF0YScsIGRhdGE6IGAke3ZzYygnQycpfWxpbmUxYCB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZGF0YScsIGRhdGE6ICdsaW5lMicgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZSwgdHlwZTogJ2RhdGEnLCBkYXRhOiAnbGluZTMnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdkYXRhJywgZGF0YTogYCR7dnNjKCdDJyl9Zm9vYCB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZW5kJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxtREFBbUQ7QUFDNUQsU0FBUyxpQkFBaUIsZ0JBQWdCLG1CQUFtQjtBQUU3RCxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLFFBQVEsT0FBa0Q7QUFDbEUsU0FBTyxPQUFPLE9BQU87QUFBQSxJQUNwQixZQUFZLDRDQUE0QztBQUFBLElBQ3hEO0FBQUEsSUFDQSxXQUFXO0FBQUEsRUFDWixDQUFDO0FBQ0Y7QUFDQSxTQUFTLFVBQVUsT0FBc0Y7QUFDeEcsTUFBSSxPQUFPLFVBQVUsVUFBVTtBQUM5QixXQUFPLFFBQVEsS0FBSztBQUFBLEVBQ3JCO0FBQ0EsU0FBTztBQUNSO0FBQ0EsU0FBUyxJQUFJLE1BQWM7QUFDMUIsU0FBTyxZQUFZLElBQUk7QUFDeEI7QUFFQSxNQUFNLGtCQUFrQjtBQUN4QixNQUFNLG1CQUFtQjtBQVF6QixNQUFNLG9DQUFvQyxNQUFNO0FBQy9DLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixpQkFBZSwwQkFBMEIsYUFBeUQsS0FBNEM7QUFDN0ksV0FBTyxNQUFNLElBQUksUUFBZ0MsT0FBSztBQUNyRCxZQUFNLElBQUksaUNBQWlDLE1BQU0sT0FBSztBQUNyRCxVQUFFLEVBQUUsU0FBUztBQUFBLE1BQ2QsQ0FBQyxDQUFDO0FBQ0YsU0FBRyxvQkFBb0IsVUFBVSxXQUFXLEdBQUcsR0FBRztBQUFBLElBQ25ELENBQUM7QUFB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
