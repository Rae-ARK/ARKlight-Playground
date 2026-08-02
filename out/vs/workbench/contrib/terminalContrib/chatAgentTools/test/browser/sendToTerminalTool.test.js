import * as assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { SendToTerminalTool, SendToTerminalToolData } from "../../browser/tools/sendToTerminalTool.js";
import { RunInTerminalTool } from "../../browser/tools/runInTerminalTool.js";
import { ITerminalChatService, ITerminalService } from "../../../../terminal/browser/terminal.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { IChatService } from "../../../../chat/common/chatService/chatService.js";
import { URI } from "../../../../../../base/common/uri.js";
import { IChatWidgetService } from "../../../../chat/browser/chat.js";
import { ChatPermissionLevel } from "../../../../chat/common/constants.js";
suite("SendToTerminalTool", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const UNKNOWN_TERMINAL_ID = "123e4567-e89b-12d3-a456-426614174000";
  const KNOWN_TERMINAL_ID = "123e4567-e89b-12d3-a456-426614174001";
  let tool;
  let originalGetExecution;
  let instantiationService;
  setup(() => {
    instantiationService = workbenchInstantiationService({}, store);
    instantiationService.stub(IChatService, {
      onDidDisposeSession: Event.None,
      getSession: () => void 0
    });
    instantiationService.stub(ITerminalChatService, {
      hasChatSessionAutoApproval: () => false
    });
    tool = store.add(instantiationService.createInstance(SendToTerminalTool));
    originalGetExecution = RunInTerminalTool.getExecution;
  });
  teardown(() => {
    RunInTerminalTool.getExecution = originalGetExecution;
  });
  function createInvocation(id, command, waitForOutput) {
    return {
      parameters: { id, command, ...waitForOutput !== void 0 ? { waitForOutput } : {} },
      callId: "test-call",
      context: { sessionId: "test-session" },
      toolId: "send_to_terminal",
      tokenBudget: 1e3,
      isComplete: () => false,
      isCancellationRequested: false
    };
  }
  function createMockExecution(output) {
    const sentTexts = [];
    const dataEmitter = store.add(new Emitter());
    return {
      completionPromise: Promise.resolve({ output }),
      instance: {
        sendText: async (text, shouldExecute, forceBracketedPasteMode) => {
          sentTexts.push({ text, shouldExecute, forceBracketedPasteMode });
        },
        registerMarker: () => void 0,
        onData: dataEmitter.event
      },
      getOutput: () => output,
      sentTexts,
      dataEmitter
    };
  }
  test("tool schema requires a UUID id", () => {
    const idProperty = SendToTerminalToolData.inputSchema?.properties?.id;
    assert.ok(idProperty?.pattern?.includes("[0-9a-fA-F]{8}"));
  });
  test("returns error for unknown terminal id", () => {
    return runWithFakedTimers({}, async () => {
      RunInTerminalTool.getExecution = () => void 0;
      const result = await tool.invoke(
        createInvocation(UNKNOWN_TERMINAL_ID, "ls"),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(result.content.length, 1);
      assert.strictEqual(result.content[0].kind, "text");
      const value = result.content[0].value;
      assert.ok(value.includes("No active terminal execution found"));
      assert.ok(value.includes(UNKNOWN_TERMINAL_ID));
    });
  });
  test("sends command to terminal and returns acknowledgment", () => {
    return runWithFakedTimers({}, async () => {
      const mockExecution = createMockExecution("$ ls\nfile1.txt\nfile2.txt");
      RunInTerminalTool.getExecution = () => mockExecution;
      const result = await tool.invoke(
        createInvocation(KNOWN_TERMINAL_ID, "ls"),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(result.content.length, 1);
      assert.strictEqual(result.content[0].kind, "text");
      const value = result.content[0].value;
      assert.ok(value.includes("Successfully sent command"));
      assert.ok(value.includes(KNOWN_TERMINAL_ID));
      assert.strictEqual(mockExecution.sentTexts.length, 1);
      assert.strictEqual(mockExecution.sentTexts[0].text, "ls");
      assert.strictEqual(mockExecution.sentTexts[0].shouldExecute, true);
    });
  });
  test("sends multi-word command correctly", () => {
    return runWithFakedTimers({}, async () => {
      const mockExecution = createMockExecution("output");
      RunInTerminalTool.getExecution = () => mockExecution;
      await tool.invoke(
        createInvocation(KNOWN_TERMINAL_ID, "echo hello world"),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(mockExecution.sentTexts.length, 1);
      assert.strictEqual(mockExecution.sentTexts[0].text, "echo hello world");
      assert.strictEqual(mockExecution.sentTexts[0].shouldExecute, true);
    });
  });
  test("appends cancel-signal steering when input is Ctrl-C", () => {
    return runWithFakedTimers({}, async () => {
      const mockExecution = createMockExecution("npm error canceled\n$ ");
      RunInTerminalTool.getExecution = () => mockExecution;
      const result = await tool.invoke(
        createInvocation(KNOWN_TERMINAL_ID, ""),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      const value = result.content[0].value;
      assert.ok(value.includes("cancel signal"), "should mention cancel signal");
      assert.ok(value.includes("not a signal to end the turn"), "should remind the model the turn is not done");
    });
  });
  test("does not append cancel-signal steering for ordinary input", () => {
    return runWithFakedTimers({}, async () => {
      const mockExecution = createMockExecution("hello");
      RunInTerminalTool.getExecution = () => mockExecution;
      const result = await tool.invoke(
        createInvocation(KNOWN_TERMINAL_ID, "y"),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      const value = result.content[0].value;
      assert.ok(!value.includes("cancel signal"), "should not mention cancel signal for ordinary input");
    });
  });
  function createPreparationContext(id, command, chatSessionResource) {
    return {
      parameters: { id, command },
      toolCallId: "test-call",
      chatSessionResource
    };
  }
  test("prepareToolInvocation shows command in messages", async () => {
    const prepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "ls -la"),
      CancellationToken.None
    );
    assert.ok(prepared);
    assert.ok(prepared.invocationMessage);
    assert.ok(prepared.pastTenseMessage);
    assert.ok(prepared.confirmationMessages);
    assert.ok(prepared.confirmationMessages.title);
    assert.ok(prepared.confirmationMessages.message);
  });
  test("prepareToolInvocation truncates long commands", async () => {
    const longCommand = "a".repeat(100);
    const prepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, longCommand),
      CancellationToken.None
    );
    assert.ok(prepared);
    const message = prepared.invocationMessage;
    assert.ok(message.value.includes("..."));
  });
  test("prepareToolInvocation normalizes newlines in command", async () => {
    const prepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "echo hello\necho world"),
      CancellationToken.None
    );
    assert.ok(prepared);
    const message = prepared.invocationMessage;
    assert.ok(!message.value.includes("\n"), "newlines should be collapsed to spaces");
  });
  test("prepareToolInvocation skips confirmation when answering a question carousel", async () => {
    const sessionResource = URI.parse("chat-session://test-session");
    const mockSession = {
      getRequests: () => [{
        response: {
          response: {
            value: [{
              kind: "questionCarousel",
              terminalId: KNOWN_TERMINAL_ID,
              questions: [{ id: "q1", title: "package name?", message: "package name?" }],
              data: { q1: "my-package" }
            }]
          }
        }
      }]
    };
    instantiationService.stub(IChatService, "getSession", () => mockSession);
    tool = store.add(instantiationService.createInstance(SendToTerminalTool));
    const prepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "my-package", sessionResource),
      CancellationToken.None
    );
    assert.ok(prepared);
    assert.strictEqual(prepared.confirmationMessages, void 0, "should skip confirmation when the command matches a carousel answer");
  });
  test("prepareToolInvocation does not skip confirmation when the command does not match a carousel answer", async () => {
    const sessionResource = URI.parse("chat-session://test-session");
    const mockSession = {
      getRequests: () => [{
        response: {
          response: {
            value: [{
              kind: "questionCarousel",
              terminalId: KNOWN_TERMINAL_ID,
              questions: [{ id: "q1", title: "package name?", message: "package name?" }],
              data: { q1: "my-package" }
            }]
          }
        }
      }]
    };
    instantiationService.stub(IChatService, "getSession", () => mockSession);
    tool = store.add(instantiationService.createInstance(SendToTerminalTool));
    const prepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "different-package", sessionResource),
      CancellationToken.None
    );
    assert.ok(prepared);
    assert.ok(prepared.confirmationMessages, "should require confirmation when the command does not match a carousel answer");
  });
  test("prepareToolInvocation skips confirmation only for exact matches in multi-question carousels", async () => {
    const sessionResource = URI.parse("chat-session://test-session");
    const carousel = {
      kind: "questionCarousel",
      terminalId: KNOWN_TERMINAL_ID,
      questions: [
        { id: "q1", title: "package name?", message: "package name?" },
        { id: "q2", title: "entry point?", message: "entry point?" }
      ],
      data: { q1: "my-package", q2: "src/index.ts" }
    };
    const priorSendInvocation = {
      kind: "toolInvocation",
      toolId: "send_to_terminal"
    };
    const mockSession = {
      getRequests: () => [{
        response: {
          response: {
            value: [carousel, priorSendInvocation]
          }
        }
      }]
    };
    instantiationService.stub(IChatService, "getSession", () => mockSession);
    tool = store.add(instantiationService.createInstance(SendToTerminalTool));
    const exactMatchPrepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "src/index.ts", sessionResource),
      CancellationToken.None
    );
    assert.ok(exactMatchPrepared);
    assert.strictEqual(exactMatchPrepared.confirmationMessages, void 0, "should skip confirmation when the command exactly matches a carousel answer");
    const mismatchedPrepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "src/index.js", sessionResource),
      CancellationToken.None
    );
    assert.ok(mismatchedPrepared);
    assert.ok(mismatchedPrepared.confirmationMessages, "should require confirmation when the command does not exactly match any carousel answer");
  });
  test("prepareToolInvocation uses positional matching for identical answers (all defaults)", async () => {
    const sessionResource = URI.parse("chat-session://test-session");
    const carousel = {
      kind: "questionCarousel",
      terminalId: KNOWN_TERMINAL_ID,
      questions: [
        { id: "q1", title: "package name?", message: "package name?" },
        { id: "q2", title: "version?", message: "version?" },
        { id: "q3", title: "description?", message: "description?" }
      ],
      data: { q1: "", q2: "", q3: "" }
    };
    const mockSession0 = {
      getRequests: () => [{
        response: { response: { value: [carousel] } }
      }]
    };
    instantiationService.stub(IChatService, "getSession", () => mockSession0);
    tool = store.add(instantiationService.createInstance(SendToTerminalTool));
    const first = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "", sessionResource),
      CancellationToken.None
    );
    assert.ok(first);
    assert.strictEqual(first.confirmationMessages, void 0);
    const firstMsg = first.pastTenseMessage;
    assert.ok(firstMsg.value.includes("package"), "first call should show package name question");
    const priorSend1 = { kind: "toolInvocation", toolId: "send_to_terminal" };
    const mockSession1 = {
      getRequests: () => [{
        response: { response: { value: [carousel, priorSend1] } }
      }]
    };
    instantiationService.stub(IChatService, "getSession", () => mockSession1);
    tool = store.add(instantiationService.createInstance(SendToTerminalTool));
    const second = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "", sessionResource),
      CancellationToken.None
    );
    assert.ok(second);
    assert.strictEqual(second.confirmationMessages, void 0);
    const secondMsg = second.pastTenseMessage;
    assert.ok(secondMsg.value.includes("version"), "second call should show version question");
    const priorSend2 = { kind: "toolInvocation", toolId: "send_to_terminal" };
    const mockSession2 = {
      getRequests: () => [{
        response: { response: { value: [carousel, priorSend1, priorSend2] } }
      }]
    };
    instantiationService.stub(IChatService, "getSession", () => mockSession2);
    tool = store.add(instantiationService.createInstance(SendToTerminalTool));
    const third = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "", sessionResource),
      CancellationToken.None
    );
    assert.ok(third);
    assert.strictEqual(third.confirmationMessages, void 0);
    const thirdMsg = third.pastTenseMessage;
    assert.ok(thirdMsg.value.includes("description"), "third call should show description question");
  });
  test("prepareToolInvocation shows confirmation in default permission mode", async () => {
    const prepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "hello"),
      CancellationToken.None
    );
    assert.ok(prepared);
    assert.ok(prepared.confirmationMessages, "should show confirmation in default mode");
    assert.strictEqual(prepared.confirmationMessages.title, "Send to Terminal");
  });
  test("prepareToolInvocation skips confirmation in auto-approve mode", async () => {
    const sessionResource = URI.parse("chat-session://test-session");
    instantiationService.stub(IChatWidgetService, {
      getWidgetBySessionResource: () => ({
        input: {
          currentModeInfo: {
            permissionLevel: ChatPermissionLevel.AutoApprove
          }
        }
      }),
      lastFocusedWidget: void 0
    });
    tool = store.add(instantiationService.createInstance(SendToTerminalTool));
    const prepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "hello", sessionResource),
      CancellationToken.None
    );
    assert.ok(prepared);
    assert.strictEqual(prepared.confirmationMessages, void 0, "should skip confirmation in auto-approve mode");
  });
  test("prepareToolInvocation Focus Terminal link does not contain $(terminal)", async () => {
    const mockExecution = createMockExecution("output");
    mockExecution.instance.instanceId = 42;
    mockExecution.instance.title = "node";
    RunInTerminalTool.getExecution = () => mockExecution;
    instantiationService.stub(ITerminalService, {
      getInstanceFromId: () => void 0
    });
    tool = store.add(instantiationService.createInstance(SendToTerminalTool));
    const prepared = await tool.prepareToolInvocation(
      createPreparationContext(KNOWN_TERMINAL_ID, "hello"),
      CancellationToken.None
    );
    assert.ok(prepared);
    assert.ok(prepared.confirmationMessages);
    const message = prepared.confirmationMessages.message;
    assert.ok(!message.value.includes("$(terminal)"), "Focus Terminal link should not contain literal $(terminal)");
    assert.ok(message.value.includes("Focus Terminal"), "should contain Focus Terminal link text");
  });
  test("tool schema includes waitForOutput parameter", () => {
    const waitForOutputProperty = SendToTerminalToolData.inputSchema?.properties?.waitForOutput;
    assert.ok(waitForOutputProperty, "waitForOutput should be in the schema");
    assert.strictEqual(waitForOutputProperty.type, "boolean");
    assert.ok(waitForOutputProperty.description?.includes("idle"));
  });
  test("waitForOutput=true waits for idle before returning", async () => {
    return runWithFakedTimers({}, async () => {
      const mockExecution = createMockExecution("output");
      RunInTerminalTool.getExecution = () => mockExecution;
      const dataDelay = setTimeout(() => {
        mockExecution.dataEmitter.fire("some response data");
      }, 100);
      const result = await tool.invoke(
        createInvocation(KNOWN_TERMINAL_ID, "look", true),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      clearTimeout(dataDelay);
      const value = result.content[0].value;
      assert.ok(value.includes("Successfully sent command"));
    });
  });
  test("preserves newlines for heredoc commands and uses bracketed paste mode", () => {
    return runWithFakedTimers({}, async () => {
      const mockExecution = createMockExecution("output");
      RunInTerminalTool.getExecution = () => mockExecution;
      const heredocCommand = "cat > file.txt << 'EOF'\nhello world\nEOF";
      await tool.invoke(
        createInvocation(KNOWN_TERMINAL_ID, heredocCommand),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(mockExecution.sentTexts.length, 1);
      assert.strictEqual(mockExecution.sentTexts[0].text, heredocCommand, "heredoc command should preserve newlines");
      assert.strictEqual(mockExecution.sentTexts[0].forceBracketedPasteMode, true, "multiline commands should use bracketed paste mode");
    });
  });
  test("preserves newlines for multiline commands with \\r\\n", () => {
    return runWithFakedTimers({}, async () => {
      const mockExecution = createMockExecution("output");
      RunInTerminalTool.getExecution = () => mockExecution;
      const multilineCommand = "cat > file.txt << EOF\r\ncontent\r\nEOF";
      await tool.invoke(
        createInvocation(KNOWN_TERMINAL_ID, multilineCommand),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(mockExecution.sentTexts.length, 1);
      assert.strictEqual(mockExecution.sentTexts[0].text, multilineCommand, "multiline command with \\r\\n should preserve newlines");
      assert.strictEqual(mockExecution.sentTexts[0].forceBracketedPasteMode, true, "multiline commands should use bracketed paste mode");
    });
  });
  test("single-line commands still get normalized", () => {
    return runWithFakedTimers({}, async () => {
      const mockExecution = createMockExecution("output");
      RunInTerminalTool.getExecution = () => mockExecution;
      await tool.invoke(
        createInvocation(KNOWN_TERMINAL_ID, "  echo hello  "),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(mockExecution.sentTexts.length, 1);
      assert.strictEqual(mockExecution.sentTexts[0].text, "echo hello", "single-line command should be trimmed");
    });
  });
  test("line continuation commands are normalized, not treated as multiline", () => {
    return runWithFakedTimers({}, async () => {
      const mockExecution = createMockExecution("output");
      RunInTerminalTool.getExecution = () => mockExecution;
      const continuationCommand = "echo hello \\\n  world";
      await tool.invoke(
        createInvocation(KNOWN_TERMINAL_ID, continuationCommand),
        async () => 0,
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(mockExecution.sentTexts.length, 1);
      assert.strictEqual(mockExecution.sentTexts[0].text, "echo hello \\   world", "line continuation should be normalized to single line");
      assert.strictEqual(mockExecution.sentTexts[0].forceBracketedPasteMode, void 0, "line continuation should not force bracketed paste mode");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvc2VuZFRvVGVybWluYWxUb29sLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHR5cGUgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBTZW5kVG9UZXJtaW5hbFRvb2wsIFNlbmRUb1Rlcm1pbmFsVG9vbERhdGEgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL3NlbmRUb1Rlcm1pbmFsVG9vbC5qcyc7XG5pbXBvcnQgeyBSdW5JblRlcm1pbmFsVG9vbCwgdHlwZSBJQWN0aXZlVGVybWluYWxFeGVjdXRpb24gfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL3J1bkluVGVybWluYWxUb29sLmpzJztcbmltcG9ydCB0eXBlIHsgSVRvb2xJbnZvY2F0aW9uLCBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSVRlcm1pbmFsRXhlY3V0ZVN0cmF0ZWd5UmVzdWx0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9leGVjdXRlU3RyYXRlZ3kvZXhlY3V0ZVN0cmF0ZWd5LmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENoYXRTZXJ2aWNlLCBJVGVybWluYWxTZXJ2aWNlLCB0eXBlIElUZXJtaW5hbEluc3RhbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHR5cGUgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRQZXJtaXNzaW9uTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuXG5zdWl0ZSgnU2VuZFRvVGVybWluYWxUb29sJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRjb25zdCBVTktOT1dOX1RFUk1JTkFMX0lEID0gJzEyM2U0NTY3LWU4OWItMTJkMy1hNDU2LTQyNjYxNDE3NDAwMCc7XG5cdGNvbnN0IEtOT1dOX1RFUk1JTkFMX0lEID0gJzEyM2U0NTY3LWU4OWItMTJkMy1hNDU2LTQyNjYxNDE3NDAwMSc7XG5cdGxldCB0b29sOiBTZW5kVG9UZXJtaW5hbFRvb2w7XG5cdGxldCBvcmlnaW5hbEdldEV4ZWN1dGlvbjogdHlwZW9mIFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbjtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe30sIHN0b3JlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwge1xuXHRcdFx0b25EaWREaXNwb3NlU2Vzc2lvbjogRXZlbnQuTm9uZSxcblx0XHRcdGdldFNlc3Npb246ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbENoYXRTZXJ2aWNlLCB7XG5cdFx0XHRoYXNDaGF0U2Vzc2lvbkF1dG9BcHByb3ZhbDogKCkgPT4gZmFsc2UsXG5cdFx0fSk7XG5cdFx0dG9vbCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZW5kVG9UZXJtaW5hbFRvb2wpKTtcblx0XHRvcmlnaW5hbEdldEV4ZWN1dGlvbiA9IFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbjtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9IG9yaWdpbmFsR2V0RXhlY3V0aW9uO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVJbnZvY2F0aW9uKGlkOiBzdHJpbmcsIGNvbW1hbmQ6IHN0cmluZywgd2FpdEZvck91dHB1dD86IGJvb2xlYW4pOiBJVG9vbEludm9jYXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwYXJhbWV0ZXJzOiB7IGlkLCBjb21tYW5kLCAuLi4od2FpdEZvck91dHB1dCAhPT0gdW5kZWZpbmVkID8geyB3YWl0Rm9yT3V0cHV0IH0gOiB7fSkgfSxcblx0XHRcdGNhbGxJZDogJ3Rlc3QtY2FsbCcsXG5cdFx0XHRjb250ZXh0OiB7IHNlc3Npb25JZDogJ3Rlc3Qtc2Vzc2lvbicgfSxcblx0XHRcdHRvb2xJZDogJ3NlbmRfdG9fdGVybWluYWwnLFxuXHRcdFx0dG9rZW5CdWRnZXQ6IDEwMDAsXG5cdFx0XHRpc0NvbXBsZXRlOiAoKSA9PiBmYWxzZSxcblx0XHRcdGlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkOiBmYWxzZSxcblx0XHR9IGFzIHVua25vd24gYXMgSVRvb2xJbnZvY2F0aW9uO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja0V4ZWN1dGlvbihvdXRwdXQ6IHN0cmluZyk6IElBY3RpdmVUZXJtaW5hbEV4ZWN1dGlvbiAmIHsgc2VudFRleHRzOiB7IHRleHQ6IHN0cmluZzsgc2hvdWxkRXhlY3V0ZTogYm9vbGVhbjsgZm9yY2VCcmFja2V0ZWRQYXN0ZU1vZGU/OiBib29sZWFuIH1bXTsgZGF0YUVtaXR0ZXI6IEVtaXR0ZXI8c3RyaW5nPiB9IHtcblx0XHRjb25zdCBzZW50VGV4dHM6IHsgdGV4dDogc3RyaW5nOyBzaG91bGRFeGVjdXRlOiBib29sZWFuOyBmb3JjZUJyYWNrZXRlZFBhc3RlTW9kZT86IGJvb2xlYW4gfVtdID0gW107XG5cdFx0Y29uc3QgZGF0YUVtaXR0ZXIgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29tcGxldGlvblByb21pc2U6IFByb21pc2UucmVzb2x2ZSh7IG91dHB1dCB9IGFzIElUZXJtaW5hbEV4ZWN1dGVTdHJhdGVneVJlc3VsdCksXG5cdFx0XHRpbnN0YW5jZToge1xuXHRcdFx0XHRzZW5kVGV4dDogYXN5bmMgKHRleHQ6IHN0cmluZywgc2hvdWxkRXhlY3V0ZTogYm9vbGVhbiwgZm9yY2VCcmFja2V0ZWRQYXN0ZU1vZGU/OiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdFx0c2VudFRleHRzLnB1c2goeyB0ZXh0LCBzaG91bGRFeGVjdXRlLCBmb3JjZUJyYWNrZXRlZFBhc3RlTW9kZSB9KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVnaXN0ZXJNYXJrZXI6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0b25EYXRhOiBkYXRhRW1pdHRlci5ldmVudCxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZSxcblx0XHRcdGdldE91dHB1dDogKCkgPT4gb3V0cHV0LFxuXHRcdFx0c2VudFRleHRzLFxuXHRcdFx0ZGF0YUVtaXR0ZXIsXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ3Rvb2wgc2NoZW1hIHJlcXVpcmVzIGEgVVVJRCBpZCcsICgpID0+IHtcblx0XHRjb25zdCBpZFByb3BlcnR5ID0gU2VuZFRvVGVybWluYWxUb29sRGF0YS5pbnB1dFNjaGVtYT8ucHJvcGVydGllcz8uaWQgYXMgeyBkZXNjcmlwdGlvbj86IHN0cmluZzsgcGF0dGVybj86IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRcdGFzc2VydC5vayhpZFByb3BlcnR5Py5wYXR0ZXJuPy5pbmNsdWRlcygnWzAtOWEtZkEtRl17OH0nKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgZXJyb3IgZm9yIHVua25vd24gdGVybWluYWwgaWQnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0UnVuSW5UZXJtaW5hbFRvb2wuZ2V0RXhlY3V0aW9uID0gKCkgPT4gdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0Y3JlYXRlSW52b2NhdGlvbihVTktOT1dOX1RFUk1JTkFMX0lELCAnbHMnKSxcblx0XHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0ua2luZCwgJ3RleHQnKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gKHJlc3VsdC5jb250ZW50WzBdIGFzIHsgdmFsdWU6IHN0cmluZyB9KS52YWx1ZTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnTm8gYWN0aXZlIHRlcm1pbmFsIGV4ZWN1dGlvbiBmb3VuZCcpKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcyhVTktOT1dOX1RFUk1JTkFMX0lEKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbmRzIGNvbW1hbmQgdG8gdGVybWluYWwgYW5kIHJldHVybnMgYWNrbm93bGVkZ21lbnQnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja0V4ZWN1dGlvbiA9IGNyZWF0ZU1vY2tFeGVjdXRpb24oJyQgbHNcXG5maWxlMS50eHRcXG5maWxlMi50eHQnKTtcblx0XHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9ICgpID0+IG1vY2tFeGVjdXRpb247XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKEtOT1dOX1RFUk1JTkFMX0lELCAnbHMnKSxcblx0XHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0ua2luZCwgJ3RleHQnKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gKHJlc3VsdC5jb250ZW50WzBdIGFzIHsgdmFsdWU6IHN0cmluZyB9KS52YWx1ZTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnU3VjY2Vzc2Z1bGx5IHNlbnQgY29tbWFuZCcpKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcyhLTk9XTl9URVJNSU5BTF9JRCkpO1xuXG5cdFx0XHQvLyBWZXJpZnkgc2VuZFRleHQgd2FzIGNhbGxlZCB3aXRoIHNob3VsZEV4ZWN1dGU9dHJ1ZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vY2tFeGVjdXRpb24uc2VudFRleHRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ja0V4ZWN1dGlvbi5zZW50VGV4dHNbMF0udGV4dCwgJ2xzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ja0V4ZWN1dGlvbi5zZW50VGV4dHNbMF0uc2hvdWxkRXhlY3V0ZSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbmRzIG11bHRpLXdvcmQgY29tbWFuZCBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja0V4ZWN1dGlvbiA9IGNyZWF0ZU1vY2tFeGVjdXRpb24oJ291dHB1dCcpO1xuXHRcdFx0UnVuSW5UZXJtaW5hbFRvb2wuZ2V0RXhlY3V0aW9uID0gKCkgPT4gbW9ja0V4ZWN1dGlvbjtcblxuXHRcdFx0YXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdGNyZWF0ZUludm9jYXRpb24oS05PV05fVEVSTUlOQUxfSUQsICdlY2hvIGhlbGxvIHdvcmxkJyksXG5cdFx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2NrRXhlY3V0aW9uLnNlbnRUZXh0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vY2tFeGVjdXRpb24uc2VudFRleHRzWzBdLnRleHQsICdlY2hvIGhlbGxvIHdvcmxkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ja0V4ZWN1dGlvbi5zZW50VGV4dHNbMF0uc2hvdWxkRXhlY3V0ZSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGVuZHMgY2FuY2VsLXNpZ25hbCBzdGVlcmluZyB3aGVuIGlucHV0IGlzIEN0cmwtQycsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrRXhlY3V0aW9uID0gY3JlYXRlTW9ja0V4ZWN1dGlvbignbnBtIGVycm9yIGNhbmNlbGVkXFxuJCAnKTtcblx0XHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9ICgpID0+IG1vY2tFeGVjdXRpb247XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKEtOT1dOX1RFUk1JTkFMX0lELCAnXFx1MDAwMycpLFxuXHRcdFx0XHRhc3luYyAoKSA9PiAwLFxuXHRcdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCB2YWx1ZSA9IChyZXN1bHQuY29udGVudFswXSBhcyB7IHZhbHVlOiBzdHJpbmcgfSkudmFsdWU7XG5cdFx0XHRhc3NlcnQub2sodmFsdWUuaW5jbHVkZXMoJ2NhbmNlbCBzaWduYWwnKSwgJ3Nob3VsZCBtZW50aW9uIGNhbmNlbCBzaWduYWwnKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnbm90IGEgc2lnbmFsIHRvIGVuZCB0aGUgdHVybicpLCAnc2hvdWxkIHJlbWluZCB0aGUgbW9kZWwgdGhlIHR1cm4gaXMgbm90IGRvbmUnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgYXBwZW5kIGNhbmNlbC1zaWduYWwgc3RlZXJpbmcgZm9yIG9yZGluYXJ5IGlucHV0JywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2tFeGVjdXRpb24gPSBjcmVhdGVNb2NrRXhlY3V0aW9uKCdoZWxsbycpO1xuXHRcdFx0UnVuSW5UZXJtaW5hbFRvb2wuZ2V0RXhlY3V0aW9uID0gKCkgPT4gbW9ja0V4ZWN1dGlvbjtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdGNyZWF0ZUludm9jYXRpb24oS05PV05fVEVSTUlOQUxfSUQsICd5JyksXG5cdFx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHZhbHVlID0gKHJlc3VsdC5jb250ZW50WzBdIGFzIHsgdmFsdWU6IHN0cmluZyB9KS52YWx1ZTtcblx0XHRcdGFzc2VydC5vayghdmFsdWUuaW5jbHVkZXMoJ2NhbmNlbCBzaWduYWwnKSwgJ3Nob3VsZCBub3QgbWVudGlvbiBjYW5jZWwgc2lnbmFsIGZvciBvcmRpbmFyeSBpbnB1dCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVQcmVwYXJhdGlvbkNvbnRleHQoaWQ6IHN0cmluZywgY29tbWFuZDogc3RyaW5nLCBjaGF0U2Vzc2lvblJlc291cmNlPzogVVJJKTogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cGFyYW1ldGVyczogeyBpZCwgY29tbWFuZCB9LFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rlc3QtY2FsbCcsXG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQ7XG5cdH1cblxuXHR0ZXN0KCdwcmVwYXJlVG9vbEludm9jYXRpb24gc2hvd3MgY29tbWFuZCBpbiBtZXNzYWdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0Y3JlYXRlUHJlcGFyYXRpb25Db250ZXh0KEtOT1dOX1RFUk1JTkFMX0lELCAnbHMgLWxhJyksXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQub2socHJlcGFyZWQpO1xuXHRcdGFzc2VydC5vayhwcmVwYXJlZC5pbnZvY2F0aW9uTWVzc2FnZSk7XG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmVkLnBhc3RUZW5zZU1lc3NhZ2UpO1xuXHRcdGFzc2VydC5vayhwcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcyk7XG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLnRpdGxlKTtcblx0XHRhc3NlcnQub2socHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXMubWVzc2FnZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXBhcmVUb29sSW52b2NhdGlvbiB0cnVuY2F0ZXMgbG9uZyBjb21tYW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb25nQ29tbWFuZCA9ICdhJy5yZXBlYXQoMTAwKTtcblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0Y3JlYXRlUHJlcGFyYXRpb25Db250ZXh0KEtOT1dOX1RFUk1JTkFMX0lELCBsb25nQ29tbWFuZCksXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQub2socHJlcGFyZWQpO1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSBwcmVwYXJlZC5pbnZvY2F0aW9uTWVzc2FnZSBhcyBJTWFya2Rvd25TdHJpbmc7XG5cdFx0YXNzZXJ0Lm9rKG1lc3NhZ2UudmFsdWUuaW5jbHVkZXMoJy4uLicpKTtcblx0fSk7XG5cblx0dGVzdCgncHJlcGFyZVRvb2xJbnZvY2F0aW9uIG5vcm1hbGl6ZXMgbmV3bGluZXMgaW4gY29tbWFuZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0Y3JlYXRlUHJlcGFyYXRpb25Db250ZXh0KEtOT1dOX1RFUk1JTkFMX0lELCAnZWNobyBoZWxsb1xcbmVjaG8gd29ybGQnKSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5vayhwcmVwYXJlZCk7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IHByZXBhcmVkLmludm9jYXRpb25NZXNzYWdlIGFzIElNYXJrZG93blN0cmluZztcblx0XHRhc3NlcnQub2soIW1lc3NhZ2UudmFsdWUuaW5jbHVkZXMoJ1xcbicpLCAnbmV3bGluZXMgc2hvdWxkIGJlIGNvbGxhcHNlZCB0byBzcGFjZXMnKTtcblx0fSk7XG5cblx0dGVzdCgncHJlcGFyZVRvb2xJbnZvY2F0aW9uIHNraXBzIGNvbmZpcm1hdGlvbiB3aGVuIGFuc3dlcmluZyBhIHF1ZXN0aW9uIGNhcm91c2VsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi8vdGVzdC1zZXNzaW9uJyk7XG5cdFx0Y29uc3QgbW9ja1Nlc3Npb24gPSB7XG5cdFx0XHRnZXRSZXF1ZXN0czogKCkgPT4gW3tcblx0XHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0XHRyZXNwb25zZToge1xuXHRcdFx0XHRcdFx0dmFsdWU6IFt7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6ICdxdWVzdGlvbkNhcm91c2VsJyBhcyBjb25zdCxcblx0XHRcdFx0XHRcdFx0dGVybWluYWxJZDogS05PV05fVEVSTUlOQUxfSUQsXG5cdFx0XHRcdFx0XHRcdHF1ZXN0aW9uczogW3sgaWQ6ICdxMScsIHRpdGxlOiAncGFja2FnZSBuYW1lPycsIG1lc3NhZ2U6ICdwYWNrYWdlIG5hbWU/JyB9XSxcblx0XHRcdFx0XHRcdFx0ZGF0YTogeyBxMTogJ215LXBhY2thZ2UnIH0sXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fV0sXG5cdFx0fTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgJ2dldFNlc3Npb24nLCAoKSA9PiBtb2NrU2Vzc2lvbik7XG5cdFx0dG9vbCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZW5kVG9UZXJtaW5hbFRvb2wpKTtcblxuXHRcdGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oXG5cdFx0XHRjcmVhdGVQcmVwYXJhdGlvbkNvbnRleHQoS05PV05fVEVSTUlOQUxfSUQsICdteS1wYWNrYWdlJywgc2Vzc2lvblJlc291cmNlKSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5vayhwcmVwYXJlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLCB1bmRlZmluZWQsICdzaG91bGQgc2tpcCBjb25maXJtYXRpb24gd2hlbiB0aGUgY29tbWFuZCBtYXRjaGVzIGEgY2Fyb3VzZWwgYW5zd2VyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXBhcmVUb29sSW52b2NhdGlvbiBkb2VzIG5vdCBza2lwIGNvbmZpcm1hdGlvbiB3aGVuIHRoZSBjb21tYW5kIGRvZXMgbm90IG1hdGNoIGEgY2Fyb3VzZWwgYW5zd2VyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi8vdGVzdC1zZXNzaW9uJyk7XG5cdFx0Y29uc3QgbW9ja1Nlc3Npb24gPSB7XG5cdFx0XHRnZXRSZXF1ZXN0czogKCkgPT4gW3tcblx0XHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0XHRyZXNwb25zZToge1xuXHRcdFx0XHRcdFx0dmFsdWU6IFt7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6ICdxdWVzdGlvbkNhcm91c2VsJyBhcyBjb25zdCxcblx0XHRcdFx0XHRcdFx0dGVybWluYWxJZDogS05PV05fVEVSTUlOQUxfSUQsXG5cdFx0XHRcdFx0XHRcdHF1ZXN0aW9uczogW3sgaWQ6ICdxMScsIHRpdGxlOiAncGFja2FnZSBuYW1lPycsIG1lc3NhZ2U6ICdwYWNrYWdlIG5hbWU/JyB9XSxcblx0XHRcdFx0XHRcdFx0ZGF0YTogeyBxMTogJ215LXBhY2thZ2UnIH0sXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fV0sXG5cdFx0fTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgJ2dldFNlc3Npb24nLCAoKSA9PiBtb2NrU2Vzc2lvbik7XG5cdFx0dG9vbCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZW5kVG9UZXJtaW5hbFRvb2wpKTtcblxuXHRcdGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oXG5cdFx0XHRjcmVhdGVQcmVwYXJhdGlvbkNvbnRleHQoS05PV05fVEVSTUlOQUxfSUQsICdkaWZmZXJlbnQtcGFja2FnZScsIHNlc3Npb25SZXNvdXJjZSksXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQub2socHJlcGFyZWQpO1xuXHRcdGFzc2VydC5vayhwcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcywgJ3Nob3VsZCByZXF1aXJlIGNvbmZpcm1hdGlvbiB3aGVuIHRoZSBjb21tYW5kIGRvZXMgbm90IG1hdGNoIGEgY2Fyb3VzZWwgYW5zd2VyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXBhcmVUb29sSW52b2NhdGlvbiBza2lwcyBjb25maXJtYXRpb24gb25seSBmb3IgZXhhY3QgbWF0Y2hlcyBpbiBtdWx0aS1xdWVzdGlvbiBjYXJvdXNlbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdjaGF0LXNlc3Npb246Ly90ZXN0LXNlc3Npb24nKTtcblx0XHRjb25zdCBjYXJvdXNlbCA9IHtcblx0XHRcdGtpbmQ6ICdxdWVzdGlvbkNhcm91c2VsJyBhcyBjb25zdCxcblx0XHRcdHRlcm1pbmFsSWQ6IEtOT1dOX1RFUk1JTkFMX0lELFxuXHRcdFx0cXVlc3Rpb25zOiBbXG5cdFx0XHRcdHsgaWQ6ICdxMScsIHRpdGxlOiAncGFja2FnZSBuYW1lPycsIG1lc3NhZ2U6ICdwYWNrYWdlIG5hbWU/JyB9LFxuXHRcdFx0XHR7IGlkOiAncTInLCB0aXRsZTogJ2VudHJ5IHBvaW50PycsIG1lc3NhZ2U6ICdlbnRyeSBwb2ludD8nIH1cblx0XHRcdF0sXG5cdFx0XHRkYXRhOiB7IHExOiAnbXktcGFja2FnZScsIHEyOiAnc3JjL2luZGV4LnRzJyB9LFxuXHRcdH07XG5cdFx0Ly8gU2ltdWxhdGUgb25lIHByaW9yIHNlbmRfdG9fdGVybWluYWwgaW52b2NhdGlvbiBhZnRlciB0aGUgY2Fyb3VzZWxcblx0XHQvLyBzbyB0aGF0IHBvc2l0aW9uYWwgbWF0Y2hpbmcgdGFyZ2V0cyBxdWVzdGlvblsxXSAoZW50cnkgcG9pbnQpXG5cdFx0Y29uc3QgcHJpb3JTZW5kSW52b2NhdGlvbiA9IHtcblx0XHRcdGtpbmQ6ICd0b29sSW52b2NhdGlvbicgYXMgY29uc3QsXG5cdFx0XHR0b29sSWQ6ICdzZW5kX3RvX3Rlcm1pbmFsJyxcblx0XHR9O1xuXHRcdGNvbnN0IG1vY2tTZXNzaW9uID0ge1xuXHRcdFx0Z2V0UmVxdWVzdHM6ICgpID0+IFt7XG5cdFx0XHRcdHJlc3BvbnNlOiB7XG5cdFx0XHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0XHRcdHZhbHVlOiBbY2Fyb3VzZWwsIHByaW9yU2VuZEludm9jYXRpb25dXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XSxcblx0XHR9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCAnZ2V0U2Vzc2lvbicsICgpID0+IG1vY2tTZXNzaW9uKTtcblx0XHR0b29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlbmRUb1Rlcm1pbmFsVG9vbCkpO1xuXG5cdFx0Y29uc3QgZXhhY3RNYXRjaFByZXBhcmVkID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oXG5cdFx0XHRjcmVhdGVQcmVwYXJhdGlvbkNvbnRleHQoS05PV05fVEVSTUlOQUxfSUQsICdzcmMvaW5kZXgudHMnLCBzZXNzaW9uUmVzb3VyY2UpLFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0Lm9rKGV4YWN0TWF0Y2hQcmVwYXJlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4YWN0TWF0Y2hQcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcywgdW5kZWZpbmVkLCAnc2hvdWxkIHNraXAgY29uZmlybWF0aW9uIHdoZW4gdGhlIGNvbW1hbmQgZXhhY3RseSBtYXRjaGVzIGEgY2Fyb3VzZWwgYW5zd2VyJyk7XG5cblx0XHRjb25zdCBtaXNtYXRjaGVkUHJlcGFyZWQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdGNyZWF0ZVByZXBhcmF0aW9uQ29udGV4dChLTk9XTl9URVJNSU5BTF9JRCwgJ3NyYy9pbmRleC5qcycsIHNlc3Npb25SZXNvdXJjZSksXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQub2sobWlzbWF0Y2hlZFByZXBhcmVkKTtcblx0XHRhc3NlcnQub2sobWlzbWF0Y2hlZFByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLCAnc2hvdWxkIHJlcXVpcmUgY29uZmlybWF0aW9uIHdoZW4gdGhlIGNvbW1hbmQgZG9lcyBub3QgZXhhY3RseSBtYXRjaCBhbnkgY2Fyb3VzZWwgYW5zd2VyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXBhcmVUb29sSW52b2NhdGlvbiB1c2VzIHBvc2l0aW9uYWwgbWF0Y2hpbmcgZm9yIGlkZW50aWNhbCBhbnN3ZXJzIChhbGwgZGVmYXVsdHMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi8vdGVzdC1zZXNzaW9uJyk7XG5cdFx0Y29uc3QgY2Fyb3VzZWwgPSB7XG5cdFx0XHRraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcgYXMgY29uc3QsXG5cdFx0XHR0ZXJtaW5hbElkOiBLTk9XTl9URVJNSU5BTF9JRCxcblx0XHRcdHF1ZXN0aW9uczogW1xuXHRcdFx0XHR7IGlkOiAncTEnLCB0aXRsZTogJ3BhY2thZ2UgbmFtZT8nLCBtZXNzYWdlOiAncGFja2FnZSBuYW1lPycgfSxcblx0XHRcdFx0eyBpZDogJ3EyJywgdGl0bGU6ICd2ZXJzaW9uPycsIG1lc3NhZ2U6ICd2ZXJzaW9uPycgfSxcblx0XHRcdFx0eyBpZDogJ3EzJywgdGl0bGU6ICdkZXNjcmlwdGlvbj8nLCBtZXNzYWdlOiAnZGVzY3JpcHRpb24/JyB9LFxuXHRcdFx0XSxcblx0XHRcdGRhdGE6IHsgcTE6ICcnLCBxMjogJycsIHEzOiAnJyB9LFxuXHRcdH07XG5cblx0XHQvLyBGaXJzdCBjYWxsOiBubyBwcmlvciBzZW5kX3RvX3Rlcm1pbmFsIFx1MjE5MiBwb3NpdGlvbmFsIGluZGV4IDAgXHUyMTkyIFwicGFja2FnZSBuYW1lP1wiXG5cdFx0Y29uc3QgbW9ja1Nlc3Npb24wID0ge1xuXHRcdFx0Z2V0UmVxdWVzdHM6ICgpID0+IFt7XG5cdFx0XHRcdHJlc3BvbnNlOiB7IHJlc3BvbnNlOiB7IHZhbHVlOiBbY2Fyb3VzZWxdIH0gfVxuXHRcdFx0fV0sXG5cdFx0fTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgJ2dldFNlc3Npb24nLCAoKSA9PiBtb2NrU2Vzc2lvbjApO1xuXHRcdHRvb2wgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VuZFRvVGVybWluYWxUb29sKSk7XG5cblx0XHRjb25zdCBmaXJzdCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0Y3JlYXRlUHJlcGFyYXRpb25Db250ZXh0KEtOT1dOX1RFUk1JTkFMX0lELCAnJywgc2Vzc2lvblJlc291cmNlKSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblx0XHRhc3NlcnQub2soZmlyc3QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5jb25maXJtYXRpb25NZXNzYWdlcywgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBmaXJzdE1zZyA9IGZpcnN0LnBhc3RUZW5zZU1lc3NhZ2UgYXMgSU1hcmtkb3duU3RyaW5nO1xuXHRcdGFzc2VydC5vayhmaXJzdE1zZy52YWx1ZS5pbmNsdWRlcygncGFja2FnZScpLCAnZmlyc3QgY2FsbCBzaG91bGQgc2hvdyBwYWNrYWdlIG5hbWUgcXVlc3Rpb24nKTtcblxuXHRcdC8vIFNlY29uZCBjYWxsOiBvbmUgcHJpb3Igc2VuZF90b190ZXJtaW5hbCBcdTIxOTIgcG9zaXRpb25hbCBpbmRleCAxIFx1MjE5MiBcInZlcnNpb24/XCJcblx0XHRjb25zdCBwcmlvclNlbmQxID0geyBraW5kOiAndG9vbEludm9jYXRpb24nIGFzIGNvbnN0LCB0b29sSWQ6ICdzZW5kX3RvX3Rlcm1pbmFsJyB9O1xuXHRcdGNvbnN0IG1vY2tTZXNzaW9uMSA9IHtcblx0XHRcdGdldFJlcXVlc3RzOiAoKSA9PiBbe1xuXHRcdFx0XHRyZXNwb25zZTogeyByZXNwb25zZTogeyB2YWx1ZTogW2Nhcm91c2VsLCBwcmlvclNlbmQxXSB9IH1cblx0XHRcdH1dLFxuXHRcdH07XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsICdnZXRTZXNzaW9uJywgKCkgPT4gbW9ja1Nlc3Npb24xKTtcblx0XHR0b29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlbmRUb1Rlcm1pbmFsVG9vbCkpO1xuXG5cdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oXG5cdFx0XHRjcmVhdGVQcmVwYXJhdGlvbkNvbnRleHQoS05PV05fVEVSTUlOQUxfSUQsICcnLCBzZXNzaW9uUmVzb3VyY2UpLFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXHRcdGFzc2VydC5vayhzZWNvbmQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQuY29uZmlybWF0aW9uTWVzc2FnZXMsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3Qgc2Vjb25kTXNnID0gc2Vjb25kLnBhc3RUZW5zZU1lc3NhZ2UgYXMgSU1hcmtkb3duU3RyaW5nO1xuXHRcdGFzc2VydC5vayhzZWNvbmRNc2cudmFsdWUuaW5jbHVkZXMoJ3ZlcnNpb24nKSwgJ3NlY29uZCBjYWxsIHNob3VsZCBzaG93IHZlcnNpb24gcXVlc3Rpb24nKTtcblxuXHRcdC8vIFRoaXJkIGNhbGw6IHR3byBwcmlvciBzZW5kX3RvX3Rlcm1pbmFsIFx1MjE5MiBwb3NpdGlvbmFsIGluZGV4IDIgXHUyMTkyIFwiZGVzY3JpcHRpb24/XCJcblx0XHRjb25zdCBwcmlvclNlbmQyID0geyBraW5kOiAndG9vbEludm9jYXRpb24nIGFzIGNvbnN0LCB0b29sSWQ6ICdzZW5kX3RvX3Rlcm1pbmFsJyB9O1xuXHRcdGNvbnN0IG1vY2tTZXNzaW9uMiA9IHtcblx0XHRcdGdldFJlcXVlc3RzOiAoKSA9PiBbe1xuXHRcdFx0XHRyZXNwb25zZTogeyByZXNwb25zZTogeyB2YWx1ZTogW2Nhcm91c2VsLCBwcmlvclNlbmQxLCBwcmlvclNlbmQyXSB9IH1cblx0XHRcdH1dLFxuXHRcdH07XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsICdnZXRTZXNzaW9uJywgKCkgPT4gbW9ja1Nlc3Npb24yKTtcblx0XHR0b29sID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlbmRUb1Rlcm1pbmFsVG9vbCkpO1xuXG5cdFx0Y29uc3QgdGhpcmQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdGNyZWF0ZVByZXBhcmF0aW9uQ29udGV4dChLTk9XTl9URVJNSU5BTF9JRCwgJycsIHNlc3Npb25SZXNvdXJjZSksXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cdFx0YXNzZXJ0Lm9rKHRoaXJkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpcmQuY29uZmlybWF0aW9uTWVzc2FnZXMsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgdGhpcmRNc2cgPSB0aGlyZC5wYXN0VGVuc2VNZXNzYWdlIGFzIElNYXJrZG93blN0cmluZztcblx0XHRhc3NlcnQub2sodGhpcmRNc2cudmFsdWUuaW5jbHVkZXMoJ2Rlc2NyaXB0aW9uJyksICd0aGlyZCBjYWxsIHNob3VsZCBzaG93IGRlc2NyaXB0aW9uIHF1ZXN0aW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXBhcmVUb29sSW52b2NhdGlvbiBzaG93cyBjb25maXJtYXRpb24gaW4gZGVmYXVsdCBwZXJtaXNzaW9uIG1vZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdGNyZWF0ZVByZXBhcmF0aW9uQ29udGV4dChLTk9XTl9URVJNSU5BTF9JRCwgJ2hlbGxvJyksXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQub2socHJlcGFyZWQpO1xuXHRcdGFzc2VydC5vayhwcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcywgJ3Nob3VsZCBzaG93IGNvbmZpcm1hdGlvbiBpbiBkZWZhdWx0IG1vZGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXMudGl0bGUsICdTZW5kIHRvIFRlcm1pbmFsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXBhcmVUb29sSW52b2NhdGlvbiBza2lwcyBjb25maXJtYXRpb24gaW4gYXV0by1hcHByb3ZlIG1vZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdjaGF0LXNlc3Npb246Ly90ZXN0LXNlc3Npb24nKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwge1xuXHRcdFx0Z2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2U6ICgpID0+ICh7XG5cdFx0XHRcdGlucHV0OiB7XG5cdFx0XHRcdFx0Y3VycmVudE1vZGVJbmZvOiB7XG5cdFx0XHRcdFx0XHRwZXJtaXNzaW9uTGV2ZWw6IENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pIGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXQsXG5cdFx0XHRsYXN0Rm9jdXNlZFdpZGdldDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdHRvb2wgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VuZFRvVGVybWluYWxUb29sKSk7XG5cblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0Y3JlYXRlUHJlcGFyYXRpb25Db250ZXh0KEtOT1dOX1RFUk1JTkFMX0lELCAnaGVsbG8nLCBzZXNzaW9uUmVzb3VyY2UpLFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXMsIHVuZGVmaW5lZCwgJ3Nob3VsZCBza2lwIGNvbmZpcm1hdGlvbiBpbiBhdXRvLWFwcHJvdmUgbW9kZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVwYXJlVG9vbEludm9jYXRpb24gRm9jdXMgVGVybWluYWwgbGluayBkb2VzIG5vdCBjb250YWluICQodGVybWluYWwpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vY2tFeGVjdXRpb24gPSBjcmVhdGVNb2NrRXhlY3V0aW9uKCdvdXRwdXQnKTtcblx0XHQobW9ja0V4ZWN1dGlvbi5pbnN0YW5jZSBhcyB7IGluc3RhbmNlSWQ6IG51bWJlciB9KS5pbnN0YW5jZUlkID0gNDI7XG5cdFx0KG1vY2tFeGVjdXRpb24uaW5zdGFuY2UgYXMgeyB0aXRsZTogc3RyaW5nIH0pLnRpdGxlID0gJ25vZGUnO1xuXHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9ICgpID0+IG1vY2tFeGVjdXRpb247XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxTZXJ2aWNlLCB7XG5cdFx0XHRnZXRJbnN0YW5jZUZyb21JZDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdHRvb2wgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VuZFRvVGVybWluYWxUb29sKSk7XG5cblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0Y3JlYXRlUHJlcGFyYXRpb25Db250ZXh0KEtOT1dOX1RFUk1JTkFMX0lELCAnaGVsbG8nKSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5vayhwcmVwYXJlZCk7XG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzKTtcblx0XHRjb25zdCBtZXNzYWdlID0gcHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXMubWVzc2FnZSBhcyBJTWFya2Rvd25TdHJpbmc7XG5cdFx0YXNzZXJ0Lm9rKCFtZXNzYWdlLnZhbHVlLmluY2x1ZGVzKCckKHRlcm1pbmFsKScpLCAnRm9jdXMgVGVybWluYWwgbGluayBzaG91bGQgbm90IGNvbnRhaW4gbGl0ZXJhbCAkKHRlcm1pbmFsKScpO1xuXHRcdGFzc2VydC5vayhtZXNzYWdlLnZhbHVlLmluY2x1ZGVzKCdGb2N1cyBUZXJtaW5hbCcpLCAnc2hvdWxkIGNvbnRhaW4gRm9jdXMgVGVybWluYWwgbGluayB0ZXh0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rvb2wgc2NoZW1hIGluY2x1ZGVzIHdhaXRGb3JPdXRwdXQgcGFyYW1ldGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdhaXRGb3JPdXRwdXRQcm9wZXJ0eSA9IFNlbmRUb1Rlcm1pbmFsVG9vbERhdGEuaW5wdXRTY2hlbWE/LnByb3BlcnRpZXM/LndhaXRGb3JPdXRwdXQgYXMgeyB0eXBlPzogc3RyaW5nOyBkZXNjcmlwdGlvbj86IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRcdGFzc2VydC5vayh3YWl0Rm9yT3V0cHV0UHJvcGVydHksICd3YWl0Rm9yT3V0cHV0IHNob3VsZCBiZSBpbiB0aGUgc2NoZW1hJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhaXRGb3JPdXRwdXRQcm9wZXJ0eS50eXBlLCAnYm9vbGVhbicpO1xuXHRcdGFzc2VydC5vayh3YWl0Rm9yT3V0cHV0UHJvcGVydHkuZGVzY3JpcHRpb24/LmluY2x1ZGVzKCdpZGxlJykpO1xuXHR9KTtcblxuXHR0ZXN0KCd3YWl0Rm9yT3V0cHV0PXRydWUgd2FpdHMgZm9yIGlkbGUgYmVmb3JlIHJldHVybmluZycsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrRXhlY3V0aW9uID0gY3JlYXRlTW9ja0V4ZWN1dGlvbignb3V0cHV0Jyk7XG5cdFx0XHRSdW5JblRlcm1pbmFsVG9vbC5nZXRFeGVjdXRpb24gPSAoKSA9PiBtb2NrRXhlY3V0aW9uO1xuXG5cdFx0XHQvLyBFbWl0IHNvbWUgZGF0YSBzaG9ydGx5IGFmdGVyIGludm9jYXRpb24gc3RhcnRzLCB0aGVuIHN0b3Bcblx0XHRcdGNvbnN0IGRhdGFEZWxheSA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRtb2NrRXhlY3V0aW9uLmRhdGFFbWl0dGVyLmZpcmUoJ3NvbWUgcmVzcG9uc2UgZGF0YScpO1xuXHRcdFx0fSwgMTAwKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdGNyZWF0ZUludm9jYXRpb24oS05PV05fVEVSTUlOQUxfSUQsICdsb29rJywgdHJ1ZSksXG5cdFx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cblx0XHRcdGNsZWFyVGltZW91dChkYXRhRGVsYXkpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSAocmVzdWx0LmNvbnRlbnRbMF0gYXMgeyB2YWx1ZTogc3RyaW5nIH0pLnZhbHVlO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKCdTdWNjZXNzZnVsbHkgc2VudCBjb21tYW5kJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgbmV3bGluZXMgZm9yIGhlcmVkb2MgY29tbWFuZHMgYW5kIHVzZXMgYnJhY2tldGVkIHBhc3RlIG1vZGUnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja0V4ZWN1dGlvbiA9IGNyZWF0ZU1vY2tFeGVjdXRpb24oJ291dHB1dCcpO1xuXHRcdFx0UnVuSW5UZXJtaW5hbFRvb2wuZ2V0RXhlY3V0aW9uID0gKCkgPT4gbW9ja0V4ZWN1dGlvbjtcblxuXHRcdFx0Y29uc3QgaGVyZWRvY0NvbW1hbmQgPSAnY2F0ID4gZmlsZS50eHQgPDwgXFwnRU9GXFwnXFxuaGVsbG8gd29ybGRcXG5FT0YnO1xuXHRcdFx0YXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdGNyZWF0ZUludm9jYXRpb24oS05PV05fVEVSTUlOQUxfSUQsIGhlcmVkb2NDb21tYW5kKSxcblx0XHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vY2tFeGVjdXRpb24uc2VudFRleHRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ja0V4ZWN1dGlvbi5zZW50VGV4dHNbMF0udGV4dCwgaGVyZWRvY0NvbW1hbmQsICdoZXJlZG9jIGNvbW1hbmQgc2hvdWxkIHByZXNlcnZlIG5ld2xpbmVzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ja0V4ZWN1dGlvbi5zZW50VGV4dHNbMF0uZm9yY2VCcmFja2V0ZWRQYXN0ZU1vZGUsIHRydWUsICdtdWx0aWxpbmUgY29tbWFuZHMgc2hvdWxkIHVzZSBicmFja2V0ZWQgcGFzdGUgbW9kZScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgbmV3bGluZXMgZm9yIG11bHRpbGluZSBjb21tYW5kcyB3aXRoIFxcXFxyXFxcXG4nLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja0V4ZWN1dGlvbiA9IGNyZWF0ZU1vY2tFeGVjdXRpb24oJ291dHB1dCcpO1xuXHRcdFx0UnVuSW5UZXJtaW5hbFRvb2wuZ2V0RXhlY3V0aW9uID0gKCkgPT4gbW9ja0V4ZWN1dGlvbjtcblxuXHRcdFx0Y29uc3QgbXVsdGlsaW5lQ29tbWFuZCA9ICdjYXQgPiBmaWxlLnR4dCA8PCBFT0ZcXHJcXG5jb250ZW50XFxyXFxuRU9GJztcblx0XHRcdGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKEtOT1dOX1RFUk1JTkFMX0lELCBtdWx0aWxpbmVDb21tYW5kKSxcblx0XHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vY2tFeGVjdXRpb24uc2VudFRleHRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ja0V4ZWN1dGlvbi5zZW50VGV4dHNbMF0udGV4dCwgbXVsdGlsaW5lQ29tbWFuZCwgJ211bHRpbGluZSBjb21tYW5kIHdpdGggXFxcXHJcXFxcbiBzaG91bGQgcHJlc2VydmUgbmV3bGluZXMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2NrRXhlY3V0aW9uLnNlbnRUZXh0c1swXS5mb3JjZUJyYWNrZXRlZFBhc3RlTW9kZSwgdHJ1ZSwgJ211bHRpbGluZSBjb21tYW5kcyBzaG91bGQgdXNlIGJyYWNrZXRlZCBwYXN0ZSBtb2RlJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZS1saW5lIGNvbW1hbmRzIHN0aWxsIGdldCBub3JtYWxpemVkJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2tFeGVjdXRpb24gPSBjcmVhdGVNb2NrRXhlY3V0aW9uKCdvdXRwdXQnKTtcblx0XHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9ICgpID0+IG1vY2tFeGVjdXRpb247XG5cblx0XHRcdGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKEtOT1dOX1RFUk1JTkFMX0lELCAnICBlY2hvIGhlbGxvICAnKSxcblx0XHRcdFx0YXN5bmMgKCkgPT4gMCxcblx0XHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vY2tFeGVjdXRpb24uc2VudFRleHRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ja0V4ZWN1dGlvbi5zZW50VGV4dHNbMF0udGV4dCwgJ2VjaG8gaGVsbG8nLCAnc2luZ2xlLWxpbmUgY29tbWFuZCBzaG91bGQgYmUgdHJpbW1lZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaW5lIGNvbnRpbnVhdGlvbiBjb21tYW5kcyBhcmUgbm9ybWFsaXplZCwgbm90IHRyZWF0ZWQgYXMgbXVsdGlsaW5lJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2tFeGVjdXRpb24gPSBjcmVhdGVNb2NrRXhlY3V0aW9uKCdvdXRwdXQnKTtcblx0XHRcdFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbiA9ICgpID0+IG1vY2tFeGVjdXRpb247XG5cblx0XHRcdGNvbnN0IGNvbnRpbnVhdGlvbkNvbW1hbmQgPSAnZWNobyBoZWxsbyBcXFxcXFxuICB3b3JsZCc7XG5cdFx0XHRhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0Y3JlYXRlSW52b2NhdGlvbihLTk9XTl9URVJNSU5BTF9JRCwgY29udGludWF0aW9uQ29tbWFuZCksXG5cdFx0XHRcdGFzeW5jICgpID0+IDAsXG5cdFx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2NrRXhlY3V0aW9uLnNlbnRUZXh0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vY2tFeGVjdXRpb24uc2VudFRleHRzWzBdLnRleHQsICdlY2hvIGhlbGxvIFxcXFwgICB3b3JsZCcsICdsaW5lIGNvbnRpbnVhdGlvbiBzaG91bGQgYmUgbm9ybWFsaXplZCB0byBzaW5nbGUgbGluZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vY2tFeGVjdXRpb24uc2VudFRleHRzWzBdLmZvcmNlQnJhY2tldGVkUGFzdGVNb2RlLCB1bmRlZmluZWQsICdsaW5lIGNvbnRpbnVhdGlvbiBzaG91bGQgbm90IGZvcmNlIGJyYWNrZXRlZCBwYXN0ZSBtb2RlJyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWE7QUFFL0IsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQkFBb0IsOEJBQThCO0FBQzNELFNBQVMseUJBQXdEO0FBR2pFLFNBQVMsc0JBQXNCLHdCQUFnRDtBQUMvRSxTQUFTLHFDQUFxQztBQUU5QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFdBQVc7QUFDcEIsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsMkJBQTJCO0FBRXBDLE1BQU0sc0JBQXNCLE1BQU07QUFDakMsUUFBTSxRQUFRLHdDQUF3QztBQUN0RCxRQUFNLHNCQUFzQjtBQUM1QixRQUFNLG9CQUFvQjtBQUMxQixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCwyQkFBdUIsOEJBQThCLENBQUMsR0FBRyxLQUFLO0FBQzlELHlCQUFxQixLQUFLLGNBQWM7QUFBQSxNQUN2QyxxQkFBcUIsTUFBTTtBQUFBLE1BQzNCLFlBQVksTUFBTTtBQUFBLElBQ25CLENBQUM7QUFDRCx5QkFBcUIsS0FBSyxzQkFBc0I7QUFBQSxNQUMvQyw0QkFBNEIsTUFBTTtBQUFBLElBQ25DLENBQUM7QUFDRCxXQUFPLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSxrQkFBa0IsQ0FBQztBQUN4RSwyQkFBdUIsa0JBQWtCO0FBQUEsRUFDMUMsQ0FBQztBQUVELFdBQVMsTUFBTTtBQUNkLHNCQUFrQixlQUFlO0FB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
