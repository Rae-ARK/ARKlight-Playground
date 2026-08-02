import * as assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { GetTerminalOutputTool, GetTerminalOutputToolData } from "../../browser/tools/getTerminalOutputTool.js";
import { RunInTerminalTool } from "../../browser/tools/runInTerminalTool.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ITerminalService } from "../../../../terminal/browser/terminal.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { TerminalChatAgentToolsSettingId } from "../../common/terminalChatAgentToolsConfiguration.js";
suite("GetTerminalOutputTool", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const UNKNOWN_TERMINAL_ID = "123e4567-e89b-12d3-a456-426614174000";
  const KNOWN_TERMINAL_ID = "123e4567-e89b-12d3-a456-426614174001";
  const KNOWN_TERMINAL_INSTANCE_ID = 1;
  let tool;
  let originalGetExecution;
  let instantiationService;
  let configurationService;
  let terminalServiceDisposeEmitter;
  setup(() => {
    instantiationService = store.add(new TestInstantiationService());
    configurationService = new TestConfigurationService();
    terminalServiceDisposeEmitter = store.add(new Emitter());
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(ITerminalService, {
      onDidDisposeInstance: terminalServiceDisposeEmitter.event
    });
    tool = store.add(instantiationService.createInstance(GetTerminalOutputTool));
    originalGetExecution = RunInTerminalTool.getExecution;
  });
  teardown(() => {
    RunInTerminalTool.getExecution = originalGetExecution;
  });
  function createInvocation(id) {
    return {
      parameters: { id },
      callId: "test-call",
      context: { sessionId: "test-session" },
      toolId: "get_terminal_output",
      tokenBudget: 1e3,
      isComplete: () => false,
      isCancellationRequested: false
    };
  }
  function createMockExecution(output, instanceId = KNOWN_TERMINAL_INSTANCE_ID) {
    return {
      completionPromise: Promise.resolve({ output }),
      instance: { instanceId },
      getOutput: () => output
    };
  }
  function createMutableMockExecution(output, instanceId = KNOWN_TERMINAL_INSTANCE_ID) {
    let currentOutput = output;
    return {
      completionPromise: Promise.resolve({ output }),
      instance: { instanceId },
      getOutput: () => currentOutput,
      setOutput: (value) => currentOutput = value
    };
  }
  test("tool schema requires a UUID id", () => {
    const idProperty = GetTerminalOutputToolData.inputSchema?.properties?.id;
    assert.ok(idProperty?.pattern?.includes("[0-9a-fA-F]{8}"));
  });
  test("returns error when id is not provided", async () => {
    const result = await tool.invoke(
      { parameters: {}, callId: "test-call", context: { sessionId: "test-session" }, toolId: "get_terminal_output", tokenBudget: 1e3, isComplete: () => false, isCancellationRequested: false },
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    const value = result.content[0].value;
    assert.ok(value.includes("must be provided"));
  });
  test("returns explicit error for unknown terminal id", async () => {
    RunInTerminalTool.getExecution = () => void 0;
    const result = await tool.invoke(
      createInvocation(UNKNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content.length, 1);
    assert.strictEqual(result.content[0].kind, "text");
    const value = result.content[0].value;
    assert.ok(value.includes("No active terminal execution found"));
    assert.ok(value.includes("exact value returned by run_in_terminal"));
  });
  test("returns output for active terminal id", async () => {
    RunInTerminalTool.getExecution = () => createMockExecution("line1\nline2");
    const result = await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content.length, 1);
    assert.strictEqual(result.content[0].kind, "text");
    const value = result.content[0].value;
    assert.ok(value.includes(`Output of terminal ${KNOWN_TERMINAL_ID}:`));
    assert.ok(value.includes("line1\nline2"));
  });
  test("returns unchanged marker for repeated output when output deltas experiment is enabled", async () => {
    configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.OutputDeltas, true);
    RunInTerminalTool.getExecution = () => createMockExecution("line1\nline2");
    await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    const result = await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content.length, 1);
    assert.strictEqual(result.content[0].kind, "text");
    const value = result.content[0].value;
    assert.strictEqual(value, `Output of terminal ${KNOWN_TERMINAL_ID} unchanged since previous poll (11 total characters in buffer). No new output.`);
  });
  test("returns only new output when output deltas experiment is enabled", async () => {
    configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.OutputDeltas, true);
    const execution = createMutableMockExecution("line1");
    RunInTerminalTool.getExecution = () => execution;
    await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    execution.setOutput("line1\nline2");
    const result = await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    const value = result.content[0].value;
    assert.ok(value.includes(`Output of terminal ${KNOWN_TERMINAL_ID} since previous poll`));
    assert.ok(value.includes("6 new characters"));
    assert.ok(value.endsWith("\nline2"));
    assert.ok(!value.endsWith("line1\nline2"));
  });
  test("clears output snapshot when terminal instance is disposed", async () => {
    configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.OutputDeltas, true);
    const execution = createMutableMockExecution("line1");
    RunInTerminalTool.getExecution = () => execution;
    await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    terminalServiceDisposeEmitter.fire(execution.instance);
    execution.setOutput("line1\nline2");
    const result = await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    const value = result.content[0].value;
    assert.strictEqual(value, `Output of terminal ${KNOWN_TERMINAL_ID}:
line1
line2`);
  });
  test("clears output snapshot when tool is disposed", async () => {
    configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.OutputDeltas, true);
    const execution = createMutableMockExecution("line1");
    RunInTerminalTool.getExecution = () => execution;
    await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    tool.dispose();
    execution.setOutput("line1\nline2");
    const result = await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    const value = result.content[0].value;
    assert.strictEqual(value, `Output of terminal ${KNOWN_TERMINAL_ID}:
line1
line2`);
  });
  test("returns current output when output delta base no longer matches", async () => {
    configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.OutputDeltas, true);
    const execution = createMutableMockExecution("line1\nline2");
    RunInTerminalTool.getExecution = () => execution;
    await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    execution.setOutput("new screen");
    const result = await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    const value = result.content[0].value;
    assert.ok(value.includes("changed since previous poll"));
    assert.ok(value.endsWith("\nnew screen"));
  });
  test("returns only the tail on first poll when output exceeds the tail budget", async () => {
    configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.OutputDeltas, true);
    const bigLine = "x".repeat(200);
    const lines = [];
    for (let i = 0; i < 100; i++) {
      lines.push(`${i}-${bigLine}`);
    }
    const output = lines.join("\n");
    RunInTerminalTool.getExecution = () => createMockExecution(output);
    const result = await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    const value = result.content[0].value;
    assert.ok(value.includes(`showing last `));
    assert.ok(value.includes(`of ${output.length} characters`));
    assert.ok(value.includes("earlier characters omitted"));
    assert.ok(value.endsWith(`
${lines[lines.length - 1]}`));
    assert.ok(value.length < output.length);
  });
  test("returns only the tail on non-prefix fallback when output exceeds the tail budget", async () => {
    configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.OutputDeltas, true);
    const execution = createMutableMockExecution("seed");
    RunInTerminalTool.getExecution = () => execution;
    await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    const bigLine = "y".repeat(200);
    const lines = [];
    for (let i = 0; i < 100; i++) {
      lines.push(`${i}-${bigLine}`);
    }
    const replaced = lines.join("\n");
    execution.setOutput(replaced);
    const result = await tool.invoke(
      createInvocation(KNOWN_TERMINAL_ID),
      async () => 0,
      { report: () => {
      } },
      CancellationToken.None
    );
    const value = result.content[0].value;
    assert.ok(value.includes("changed since previous poll"));
    assert.ok(value.includes(`of ${replaced.length} characters`));
    assert.ok(value.endsWith(`
${lines[lines.length - 1]}`));
    assert.ok(value.length < replaced.length);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvZ2V0VGVybWluYWxPdXRwdXRUb29sLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEdldFRlcm1pbmFsT3V0cHV0VG9vbCwgR2V0VGVybWluYWxPdXRwdXRUb29sRGF0YSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdG9vbHMvZ2V0VGVybWluYWxPdXRwdXRUb29sLmpzJztcbmltcG9ydCB7IFJ1bkluVGVybWluYWxUb29sLCB0eXBlIElBY3RpdmVUZXJtaW5hbEV4ZWN1dGlvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdG9vbHMvcnVuSW5UZXJtaW5hbFRvb2wuanMnO1xuaW1wb3J0IHR5cGUgeyBJVG9vbEludm9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSVRlcm1pbmFsRXhlY3V0ZVN0cmF0ZWd5UmVzdWx0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9leGVjdXRlU3RyYXRlZ3kvZXhlY3V0ZVN0cmF0ZWd5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsU2VydmljZSwgdHlwZSBJVGVybWluYWxJbnN0YW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZCB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXJtaW5hbENoYXRBZ2VudFRvb2xzQ29uZmlndXJhdGlvbi5qcyc7XG5cbnN1aXRlKCdHZXRUZXJtaW5hbE91dHB1dFRvb2wnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGNvbnN0IFVOS05PV05fVEVSTUlOQUxfSUQgPSAnMTIzZTQ1NjctZTg5Yi0xMmQzLWE0NTYtNDI2NjE0MTc0MDAwJztcblx0Y29uc3QgS05PV05fVEVSTUlOQUxfSUQgPSAnMTIzZTQ1NjctZTg5Yi0xMmQzLWE0NTYtNDI2NjE0MTc0MDAxJztcblx0Y29uc3QgS05PV05fVEVSTUlOQUxfSU5TVEFOQ0VfSUQgPSAxO1xuXHRsZXQgdG9vbDogR2V0VGVybWluYWxPdXRwdXRUb29sO1xuXHRsZXQgb3JpZ2luYWxHZXRFeGVjdXRpb246IHR5cGVvZiBSdW5JblRlcm1pbmFsVG9vbC5nZXRFeGVjdXRpb247XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgY29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0bGV0IHRlcm1pbmFsU2VydmljZURpc3Bvc2VFbWl0dGVyOiBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHR0ZXJtaW5hbFNlcnZpY2VEaXNwb3NlRW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT4oKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbFNlcnZpY2UsIHtcblx0XHRcdG9uRGlkRGlzcG9zZUluc3RhbmNlOiB0ZXJtaW5hbFNlcnZpY2VEaXNwb3NlRW1pdHRlci5ldmVudCxcblx0XHR9KTtcblx0XHR0b29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEdldFRlcm1pbmFsT3V0cHV0VG9vbCkpO1xuXHRcdG9yaWdpbmFsR2V0RXhlY3V0aW9uID0gUnVuSW5UZXJtaW5hbFRvb2wuZ2V0RXhlY3V0aW9uO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0UnVuSW5UZXJtaW5hbFRvb2wuZ2V0RXhlY3V0aW9uID0gb3JpZ2luYWxHZXRFeGVjdXRpb247XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUludm9jYXRpb24oaWQ6IHN0cmluZyk6IElUb29sSW52b2NhdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHBhcmFtZXRlcnM6IHsgaWQgfSxcblx0XHRcdGNhbGxJZDogJ3Rlc3QtY2FsbCcsXG5cdFx0XHRjb250ZXh0OiB7IHNlc3Npb25JZDogJ3Rlc3Qtc2Vzc2lvbicgfSxcblx0XHRcdHRvb2xJZDogJ2dldF90ZXJtaW5hbF9vdXRwdXQnLFxuXHRcdFx0dG9rZW5CdWRnZXQ6IDEwMDAsXG5cdFx0XHRpc0NvbXBsZXRlOiAoKSA9PiBmYWxzZSxcblx0XHRcdGlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkOiBmYWxzZSxcblx0XHR9IGFzIHVua25vd24gYXMgSVRvb2xJbnZvY2F0aW9uO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja0V4ZWN1dGlvbihvdXRwdXQ6IHN0cmluZywgaW5zdGFuY2VJZCA9IEtOT1dOX1RFUk1JTkFMX0lOU1RBTkNFX0lEKTogSUFjdGl2ZVRlcm1pbmFsRXhlY3V0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29tcGxldGlvblByb21pc2U6IFByb21pc2UucmVzb2x2ZSh7IG91dHB1dCB9IGFzIElUZXJtaW5hbEV4ZWN1dGVTdHJhdGVneVJlc3VsdCksXG5cdFx0XHRpbnN0YW5jZTogeyBpbnN0YW5jZUlkIH0gYXMgSVRlcm1pbmFsSW5zdGFuY2UsXG5cdFx0XHRnZXRPdXRwdXQ6ICgpID0+IG91dHB1dCxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlTXV0YWJsZU1vY2tFeGVjdXRpb24ob3V0cHV0OiBzdHJpbmcsIGluc3RhbmNlSWQgPSBLTk9XTl9URVJNSU5BTF9JTlNUQU5DRV9JRCk6IElBY3RpdmVUZXJtaW5hbEV4ZWN1dGlvbiAmIHsgc2V0T3V0cHV0KHZhbHVlOiBzdHJpbmcpOiB2b2lkIH0ge1xuXHRcdGxldCBjdXJyZW50T3V0cHV0ID0gb3V0cHV0O1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb21wbGV0aW9uUHJvbWlzZTogUHJvbWlzZS5yZXNvbHZlKHsgb3V0cHV0IH0gYXMgSVRlcm1pbmFsRXhlY3V0ZVN0cmF0ZWd5UmVzdWx0KSxcblx0XHRcdGluc3RhbmNlOiB7IGluc3RhbmNlSWQgfSBhcyBJVGVybWluYWxJbnN0YW5jZSxcblx0XHRcdGdldE91dHB1dDogKCkgPT4gY3VycmVudE91dHB1dCxcblx0XHRcdHNldE91dHB1dDogdmFsdWUgPT4gY3VycmVudE91dHB1dCA9IHZhbHVlLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCd0b29sIHNjaGVtYSByZXF1aXJlcyBhIFVVSUQgaWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaWRQcm9wZXJ0eSA9IEdldFRlcm1pbmFsT3V0cHV0VG9vbERhdGEuaW5wdXRTY2hlbWE/LnByb3BlcnRpZXM/LmlkIGFzIHsgZGVzY3JpcHRpb24/OiBzdHJpbmc7IHBhdHRlcm4/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQub2soaWRQcm9wZXJ0eT8ucGF0dGVybj8uaW5jbHVkZXMoJ1swLTlhLWZBLUZdezh9JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGVycm9yIHdoZW4gaWQgaXMgbm90IHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0eyBwYXJhbWV0ZXJzOiB7fSwgY2FsbElkOiAndGVzdC1jYWxsJywgY29udGV4dDogeyBzZXNzaW9uSWQ6ICd0ZXN0LXNlc3Npb24nIH0sIHRvb2xJZDogJ2dldF90ZXJtaW5hbF9vdXRwdXQnLCB0b2tlbkJ1ZGdldDogMTAwMCwgaXNDb21wbGV0ZTogKCkgPT4gZmFsc2UsIGlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkOiBmYWxzZSB9IGFzIHVua25vd24gYXMgSVRvb2xJbnZvY2F0aW9uLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblxuXHRcdGNvbnN0IHZhbHVlID0gKHJlc3VsdC5jb250ZW50WzBdIGFzIHsgdmFsdWU6IHN0cmluZyB9KS52YWx1ZTtcblx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJ211c3QgYmUgcHJvdmlkZWQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgZXhwbGljaXQgZXJyb3IgZm9yIHVua25vd24gdGVybWluYWwgaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0UnVuSW5UZXJtaW5hbFRvb2wuZ2V0RXhlY3V0aW9uID0gKCkgPT4gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRjcmVhdGVJbnZvY2F0aW9uKFVOS05PV05fVEVSTUlOQUxfSUQpLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS5raW5kLCAndGV4dCcpO1xuXHRcdGNvbnN0IHZhbHVlID0gKHJlc3VsdC5jb250ZW50WzBdIGFzIHsgdmFsdWU6IHN0cmluZyB9KS52YWx1ZTtcblx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJ05vIGFjdGl2ZSB0ZXJtaW5hbCBleGVjdXRpb24gZm91bmQnKSk7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKCdleGFjdCB2YWx1ZSByZXR1cm5lZCBieSBydW5faW5fdGVybWluYWwnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgb3V0cHV0IGZvciBhY3RpdmUgdGVybWluYWwgaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0UnVuSW5UZXJtaW5hbFRvb2wuZ2V0RXhlY3V0aW9uID0gKCkgPT4gY3JlYXRlTW9ja0V4ZWN1dGlvbignbGluZTFcXG5saW5lMicpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRjcmVhdGVJbnZvY2F0aW9uKEtOT1dOX1RFUk1JTkFMX0lEKSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0ua2luZCwgJ3RleHQnKTtcblx0XHRjb25zdCB2YWx1ZSA9IChyZXN1bHQuY29udGVudFswXSBhcyB7IHZhbHVlOiBzdHJpbmcgfSkudmFsdWU7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKGBPdXRwdXQgb2YgdGVybWluYWwgJHtLTk9XTl9URVJNSU5BTF9JRH06YCkpO1xuXHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnbGluZTFcXG5saW5lMicpKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmNoYW5nZWQgbWFya2VyIGZvciByZXBlYXRlZCBvdXRwdXQgd2hlbiBvdXRwdXQgZGVsdGFzIGV4cGVyaW1lbnQgaXMgZW5hYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLk91dHB1dERlbHRhcywgdHJ1ZSk7XG5cdFx0UnVuSW5UZXJtaW5hbFRvb2wuZ2V0RXhlY3V0aW9uID0gKCkgPT4gY3JlYXRlTW9ja0V4ZWN1dGlvbignbGluZTFcXG5saW5lMicpO1xuXG5cdFx0YXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRjcmVhdGVJbnZvY2F0aW9uKEtOT1dOX1RFUk1JTkFMX0lEKSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRjcmVhdGVJbnZvY2F0aW9uKEtOT1dOX1RFUk1JTkFMX0lEKSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0ua2luZCwgJ3RleHQnKTtcblx0XHRjb25zdCB2YWx1ZSA9IChyZXN1bHQuY29udGVudFswXSBhcyB7IHZhbHVlOiBzdHJpbmcgfSkudmFsdWU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLCBgT3V0cHV0IG9mIHRlcm1pbmFsICR7S05PV05fVEVSTUlOQUxfSUR9IHVuY2hhbmdlZCBzaW5jZSBwcmV2aW91cyBwb2xsICgxMSB0b3RhbCBjaGFyYWN0ZXJzIGluIGJ1ZmZlcikuIE5vIG5ldyBvdXRwdXQuYCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgb25seSBuZXcgb3V0cHV0IHdoZW4gb3V0cHV0IGRlbHRhcyBleHBlcmltZW50IGlzIGVuYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5PdXRwdXREZWx0YXMsIHRydWUpO1xuXHRcdGNvbnN0IGV4ZWN1dGlvbiA9IGNyZWF0ZU11dGFibGVNb2NrRXhlY3V0aW9uKCdsaW5lMScpO1xuXHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9ICgpID0+IGV4ZWN1dGlvbjtcblxuXHRcdGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0Y3JlYXRlSW52b2NhdGlvbihLTk9XTl9URVJNSU5BTF9JRCksXG5cdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXHRcdGV4ZWN1dGlvbi5zZXRPdXRwdXQoJ2xpbmUxXFxubGluZTInKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdGNyZWF0ZUludm9jYXRpb24oS05PV05fVEVSTUlOQUxfSUQpLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblxuXHRcdGNvbnN0IHZhbHVlID0gKHJlc3VsdC5jb250ZW50WzBdIGFzIHsgdmFsdWU6IHN0cmluZyB9KS52YWx1ZTtcblx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoYE91dHB1dCBvZiB0ZXJtaW5hbCAke0tOT1dOX1RFUk1JTkFMX0lEfSBzaW5jZSBwcmV2aW91cyBwb2xsYCkpO1xuXHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnNiBuZXcgY2hhcmFjdGVycycpKTtcblx0XHRhc3NlcnQub2sodmFsdWUuZW5kc1dpdGgoJ1xcbmxpbmUyJykpO1xuXHRcdGFzc2VydC5vayghdmFsdWUuZW5kc1dpdGgoJ2xpbmUxXFxubGluZTInKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFycyBvdXRwdXQgc25hcHNob3Qgd2hlbiB0ZXJtaW5hbCBpbnN0YW5jZSBpcyBkaXNwb3NlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLk91dHB1dERlbHRhcywgdHJ1ZSk7XG5cdFx0Y29uc3QgZXhlY3V0aW9uID0gY3JlYXRlTXV0YWJsZU1vY2tFeGVjdXRpb24oJ2xpbmUxJyk7XG5cdFx0UnVuSW5UZXJtaW5hbFRvb2wuZ2V0RXhlY3V0aW9uID0gKCkgPT4gZXhlY3V0aW9uO1xuXG5cdFx0YXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRjcmVhdGVJbnZvY2F0aW9uKEtOT1dOX1RFUk1JTkFMX0lEKSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cdFx0dGVybWluYWxTZXJ2aWNlRGlzcG9zZUVtaXR0ZXIuZmlyZShleGVjdXRpb24uaW5zdGFuY2UpO1xuXHRcdGV4ZWN1dGlvbi5zZXRPdXRwdXQoJ2xpbmUxXFxubGluZTInKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdGNyZWF0ZUludm9jYXRpb24oS05PV05fVEVSTUlOQUxfSUQpLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblxuXHRcdGNvbnN0IHZhbHVlID0gKHJlc3VsdC5jb250ZW50WzBdIGFzIHsgdmFsdWU6IHN0cmluZyB9KS52YWx1ZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUsIGBPdXRwdXQgb2YgdGVybWluYWwgJHtLTk9XTl9URVJNSU5BTF9JRH06XFxubGluZTFcXG5saW5lMmApO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhcnMgb3V0cHV0IHNuYXBzaG90IHdoZW4gdG9vbCBpcyBkaXNwb3NlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLk91dHB1dERlbHRhcywgdHJ1ZSk7XG5cdFx0Y29uc3QgZXhlY3V0aW9uID0gY3JlYXRlTXV0YWJsZU1vY2tFeGVjdXRpb24oJ2xpbmUxJyk7XG5cdFx0UnVuSW5UZXJtaW5hbFRvb2wuZ2V0RXhlY3V0aW9uID0gKCkgPT4gZXhlY3V0aW9uO1xuXG5cdFx0YXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRjcmVhdGVJbnZvY2F0aW9uKEtOT1dOX1RFUk1JTkFMX0lEKSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cdFx0dG9vbC5kaXNwb3NlKCk7XG5cdFx0ZXhlY3V0aW9uLnNldE91dHB1dCgnbGluZTFcXG5saW5lMicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0Y3JlYXRlSW52b2NhdGlvbihLTk9XTl9URVJNSU5BTF9JRCksXG5cdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSAocmVzdWx0LmNvbnRlbnRbMF0gYXMgeyB2YWx1ZTogc3RyaW5nIH0pLnZhbHVlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZSwgYE91dHB1dCBvZiB0ZXJtaW5hbCAke0tOT1dOX1RFUk1JTkFMX0lEfTpcXG5saW5lMVxcbmxpbmUyYCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgY3VycmVudCBvdXRwdXQgd2hlbiBvdXRwdXQgZGVsdGEgYmFzZSBubyBsb25nZXIgbWF0Y2hlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLk91dHB1dERlbHRhcywgdHJ1ZSk7XG5cdFx0Y29uc3QgZXhlY3V0aW9uID0gY3JlYXRlTXV0YWJsZU1vY2tFeGVjdXRpb24oJ2xpbmUxXFxubGluZTInKTtcblx0XHRSdW5JblRlcm1pbmFsVG9vbC5nZXRFeGVjdXRpb24gPSAoKSA9PiBleGVjdXRpb247XG5cblx0XHRhd2FpdCB0b29sLmludm9rZShcblx0XHRcdGNyZWF0ZUludm9jYXRpb24oS05PV05fVEVSTUlOQUxfSUQpLFxuXHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblx0XHRleGVjdXRpb24uc2V0T3V0cHV0KCduZXcgc2NyZWVuJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRjcmVhdGVJbnZvY2F0aW9uKEtOT1dOX1RFUk1JTkFMX0lEKSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRjb25zdCB2YWx1ZSA9IChyZXN1bHQuY29udGVudFswXSBhcyB7IHZhbHVlOiBzdHJpbmcgfSkudmFsdWU7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKCdjaGFuZ2VkIHNpbmNlIHByZXZpb3VzIHBvbGwnKSk7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlLmVuZHNXaXRoKCdcXG5uZXcgc2NyZWVuJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIG9ubHkgdGhlIHRhaWwgb24gZmlyc3QgcG9sbCB3aGVuIG91dHB1dCBleGNlZWRzIHRoZSB0YWlsIGJ1ZGdldCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLk91dHB1dERlbHRhcywgdHJ1ZSk7XG5cdFx0Y29uc3QgYmlnTGluZSA9ICd4Jy5yZXBlYXQoMjAwKTtcblx0XHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDsgaSsrKSB7XG5cdFx0XHRsaW5lcy5wdXNoKGAke2l9LSR7YmlnTGluZX1gKTtcblx0XHR9XG5cdFx0Y29uc3Qgb3V0cHV0ID0gbGluZXMuam9pbignXFxuJyk7XG5cdFx0UnVuSW5UZXJtaW5hbFRvb2wuZ2V0RXhlY3V0aW9uID0gKCkgPT4gY3JlYXRlTW9ja0V4ZWN1dGlvbihvdXRwdXQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRjcmVhdGVJbnZvY2F0aW9uKEtOT1dOX1RFUk1JTkFMX0lEKSxcblx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRjb25zdCB2YWx1ZSA9IChyZXN1bHQuY29udGVudFswXSBhcyB7IHZhbHVlOiBzdHJpbmcgfSkudmFsdWU7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKGBzaG93aW5nIGxhc3QgYCkpO1xuXHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcyhgb2YgJHtvdXRwdXQubGVuZ3RofSBjaGFyYWN0ZXJzYCkpO1xuXHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnZWFybGllciBjaGFyYWN0ZXJzIG9taXR0ZWQnKSk7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlLmVuZHNXaXRoKGBcXG4ke2xpbmVzW2xpbmVzLmxlbmd0aCAtIDFdfWApKTtcblx0XHRhc3NlcnQub2sodmFsdWUubGVuZ3RoIDwgb3V0cHV0Lmxlbmd0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgb25seSB0aGUgdGFpbCBvbiBub24tcHJlZml4IGZhbGxiYWNrIHdoZW4gb3V0cHV0IGV4Y2VlZHMgdGhlIHRhaWwgYnVkZ2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuT3V0cHV0RGVsdGFzLCB0cnVlKTtcblx0XHRjb25zdCBleGVjdXRpb24gPSBjcmVhdGVNdXRhYmxlTW9ja0V4ZWN1dGlvbignc2VlZCcpO1xuXHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9ICgpID0+IGV4ZWN1dGlvbjtcblxuXHRcdGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0Y3JlYXRlSW52b2NhdGlvbihLTk9XTl9URVJNSU5BTF9JRCksXG5cdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgYmlnTGluZSA9ICd5Jy5yZXBlYXQoMjAwKTtcblx0XHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDsgaSsrKSB7XG5cdFx0XHRsaW5lcy5wdXNoKGAke2l9LSR7YmlnTGluZX1gKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVwbGFjZWQgPSBsaW5lcy5qb2luKCdcXG4nKTtcblx0XHRleGVjdXRpb24uc2V0T3V0cHV0KHJlcGxhY2VkKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0Y3JlYXRlSW52b2NhdGlvbihLTk9XTl9URVJNSU5BTF9JRCksXG5cdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSAocmVzdWx0LmNvbnRlbnRbMF0gYXMgeyB2YWx1ZTogc3RyaW5nIH0pLnZhbHVlO1xuXHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnY2hhbmdlZCBzaW5jZSBwcmV2aW91cyBwb2xsJykpO1xuXHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcyhgb2YgJHtyZXBsYWNlZC5sZW5ndGh9IGNoYXJhY3RlcnNgKSk7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlLmVuZHNXaXRoKGBcXG4ke2xpbmVzW2xpbmVzLmxlbmd0aCAtIDFdfWApKTtcblx0XHRhc3NlcnQub2sodmFsdWUubGVuZ3RoIDwgcmVwbGFjZWQubGVuZ3RoKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx1QkFBdUIsaUNBQWlDO0FBQ2pFLFNBQVMseUJBQXdEO0FBR2pFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsd0JBQWdEO0FBQ3pELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsdUNBQXVDO0FBRWhELE1BQU0seUJBQXlCLE1BQU07QUFDcEMsUUFBTSxRQUFRLHdDQUF3QztBQUN0RCxRQUFNLHNCQUFzQjtBQUM1QixRQUFNLG9CQUFvQjtBQUMxQixRQUFNLDZCQUE2QjtBQUNuQyxNQUFJO0FBQ0osTUFBSTtBQUNK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
