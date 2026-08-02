import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IStorageService, StorageScope } from "../../../../../../platform/storage/common/storage.js";
import { TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { ChatAgentLocation, ChatModeKind } from "../../../common/constants.js";
import { ChatHistoryNavigator, ChatInputHistoryMaxEntries, ChatWidgetHistoryService, IChatWidgetHistoryService } from "../../../common/widget/chatWidgetHistoryService.js";
import { Memento } from "../../../../../common/memento.js";
suite("ChatWidgetHistoryService", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    Memento.clear(StorageScope.APPLICATION);
    Memento.clear(StorageScope.PROFILE);
    Memento.clear(StorageScope.WORKSPACE);
  });
  function createHistoryService() {
    const instantiationService = testDisposables.add(new TestInstantiationService());
    const storageService = testDisposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    return testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
  }
  function createInputState(text, modeKind = ChatModeKind.Ask) {
    return {
      inputText: text,
      attachments: [],
      mode: { id: modeKind, kind: modeKind },
      selectedModel: void 0,
      selections: [],
      contrib: {}
    };
  }
  test("should start with empty history", () => {
    const historyService = createHistoryService();
    const history = historyService.getHistory(ChatAgentLocation.Chat);
    assert.strictEqual(history.length, 0);
  });
  test("should append and retrieve history entries", () => {
    const historyService = createHistoryService();
    const entry = createInputState("test query");
    historyService.append(ChatAgentLocation.Chat, entry);
    const history = historyService.getHistory(ChatAgentLocation.Chat);
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].inputText, "test query");
  });
  test("should maintain separate history per location", () => {
    const historyService = createHistoryService();
    historyService.append(ChatAgentLocation.Chat, createInputState("chat query"));
    historyService.append(ChatAgentLocation.Terminal, createInputState("terminal query"));
    const chatHistory = historyService.getHistory(ChatAgentLocation.Chat);
    const terminalHistory = historyService.getHistory(ChatAgentLocation.Terminal);
    assert.strictEqual(chatHistory.length, 1);
    assert.strictEqual(terminalHistory.length, 1);
    assert.strictEqual(chatHistory[0].inputText, "chat query");
    assert.strictEqual(terminalHistory[0].inputText, "terminal query");
  });
  test("should maintain separate history per history key", () => {
    const historyService = createHistoryService();
    historyService.append(ChatAgentLocation.Chat, createInputState("global query"));
    historyService.append(ChatAgentLocation.Chat, createInputState("session 1 query"), "session-1");
    historyService.append(ChatAgentLocation.Chat, createInputState("session 2 query"), "session-2");
    assert.deepStrictEqual({
      global: historyService.getHistory(ChatAgentLocation.Chat).map((entry) => entry.inputText),
      session1: historyService.getHistory(ChatAgentLocation.Chat, "session-1").map((entry) => entry.inputText),
      session2: historyService.getHistory(ChatAgentLocation.Chat, "session-2").map((entry) => entry.inputText)
    }, {
      global: ["global query"],
      session1: ["session 1 query"],
      session2: ["session 2 query"]
    });
  });
  test("should move history between history keys", () => {
    const historyService = createHistoryService();
    historyService.append(ChatAgentLocation.Chat, createInputState("committed query"), "committed-session");
    historyService.append(ChatAgentLocation.Chat, createInputState("untitled query"), "untitled-session");
    historyService.moveHistory(ChatAgentLocation.Chat, "untitled-session", "committed-session");
    assert.deepStrictEqual({
      untitled: historyService.getHistory(ChatAgentLocation.Chat, "untitled-session").map((entry) => entry.inputText),
      committed: historyService.getHistory(ChatAgentLocation.Chat, "committed-session").map((entry) => entry.inputText)
    }, {
      untitled: [],
      committed: ["committed query", "untitled query"]
    });
  });
  test("should limit history to max entries", () => {
    const historyService = createHistoryService();
    for (let i = 0; i < ChatInputHistoryMaxEntries + 10; i++) {
      historyService.append(ChatAgentLocation.Chat, createInputState(`query ${i}`));
    }
    const history = historyService.getHistory(ChatAgentLocation.Chat);
    assert.strictEqual(history.length, ChatInputHistoryMaxEntries);
    assert.strictEqual(history[0].inputText, "query 10");
    assert.strictEqual(history[history.length - 1].inputText, `query ${ChatInputHistoryMaxEntries + 9}`);
  });
  test("should fire append event when history is added", () => {
    const historyService = createHistoryService();
    let eventFired = false;
    let firedEntry;
    testDisposables.add(historyService.onDidChangeHistory((e) => {
      if (e.kind === "append") {
        eventFired = true;
        firedEntry = e.entry;
      }
    }));
    const entry = createInputState("test");
    historyService.append(ChatAgentLocation.Chat, entry);
    assert.ok(eventFired);
    assert.strictEqual(firedEntry?.inputText, "test");
  });
  test("should clear all history", () => {
    const historyService = createHistoryService();
    historyService.append(ChatAgentLocation.Chat, createInputState("query 1"));
    historyService.append(ChatAgentLocation.Terminal, createInputState("query 2"));
    historyService.clearHistory();
    assert.strictEqual(historyService.getHistory(ChatAgentLocation.Chat).length, 0);
    assert.strictEqual(historyService.getHistory(ChatAgentLocation.Terminal).length, 0);
  });
  test("should fire clear event when history is cleared", () => {
    const historyService = createHistoryService();
    let clearEventFired = false;
    testDisposables.add(historyService.onDidChangeHistory((e) => {
      if (e.kind === "clear") {
        clearEventFired = true;
      }
    }));
    historyService.clearHistory();
    assert.ok(clearEventFired);
  });
});
suite("ChatHistoryNavigator", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    Memento.clear(StorageScope.APPLICATION);
    Memento.clear(StorageScope.PROFILE);
    Memento.clear(StorageScope.WORKSPACE);
  });
  function createNavigator() {
    const instantiationService = testDisposables.add(new TestInstantiationService());
    const storageService = testDisposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
    instantiationService.stub(IChatWidgetHistoryService, historyService);
    return testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
  }
  function createInputState(text) {
    return {
      inputText: text,
      attachments: [],
      mode: { id: ChatModeKind.Ask, kind: ChatModeKind.Ask },
      selectedModel: void 0,
      selections: [],
      contrib: {}
    };
  }
  test("should start at end of empty history", () => {
    const nav = createNavigator();
    assert.ok(nav.isAtEnd());
    assert.ok(nav.isAtStart());
  });
  test("should navigate backwards through history", () => {
    const nav = createNavigator();
    nav.append(createInputState("first"));
    nav.append(createInputState("second"));
    nav.append(createInputState("third"));
    assert.ok(nav.isAtEnd());
    const prev1 = nav.previous();
    assert.strictEqual(prev1?.inputText, "third");
    const prev2 = nav.previous();
    assert.strictEqual(prev2?.inputText, "second");
    const prev3 = nav.previous();
    assert.strictEqual(prev3?.inputText, "first");
    assert.ok(nav.isAtStart());
  });
  test("should navigate forwards through history", () => {
    const nav = createNavigator();
    nav.append(createInputState("first"));
    nav.append(createInputState("second"));
    nav.previous();
    nav.previous();
    assert.ok(nav.isAtStart());
    const next1 = nav.next();
    assert.strictEqual(next1?.inputText, "second");
    const next2 = nav.next();
    assert.strictEqual(next2, void 0);
    assert.ok(nav.isAtEnd());
  });
  test("should reset cursor to end", () => {
    const nav = createNavigator();
    nav.append(createInputState("first"));
    nav.append(createInputState("second"));
    nav.previous();
    assert.ok(!nav.isAtEnd());
    nav.resetCursor();
    assert.ok(nav.isAtEnd());
  });
  test("should overlay edited entries", () => {
    const nav = createNavigator();
    nav.append(createInputState("first"));
    nav.append(createInputState("second"));
    nav.previous();
    const edited = createInputState("second edited");
    nav.overlay(edited);
    const current = nav.current();
    assert.strictEqual(current?.inputText, "second edited");
    assert.strictEqual(nav.values[1].inputText, "second");
  });
  test("should clear overlay on append", () => {
    const nav = createNavigator();
    nav.append(createInputState("first"));
    nav.previous();
    nav.overlay(createInputState("first edited"));
    const currentBefore = nav.current();
    assert.strictEqual(currentBefore?.inputText, "first edited");
    nav.append(createInputState("second"));
    assert.ok(nav.isAtEnd());
    nav.previous();
    assert.strictEqual(nav.current()?.inputText, "second");
  });
  test("should stop at start when navigating backwards", () => {
    const nav = createNavigator();
    nav.append(createInputState("only"));
    nav.previous();
    assert.ok(nav.isAtStart());
    const prev = nav.previous();
    assert.strictEqual(prev?.inputText, "only");
    assert.ok(nav.isAtStart());
  });
  test("should stop at end when navigating forwards", () => {
    const nav = createNavigator();
    nav.append(createInputState("only"));
    const next1 = nav.next();
    assert.strictEqual(next1, void 0);
    assert.ok(nav.isAtEnd());
    const next2 = nav.next();
    assert.strictEqual(next2, void 0);
    assert.ok(nav.isAtEnd());
  });
  test("should update when history service appends entries", () => {
    const instantiationService = testDisposables.add(new TestInstantiationService());
    const storageService = testDisposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
    instantiationService.stub(IChatWidgetHistoryService, historyService);
    const nav = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    historyService.append(ChatAgentLocation.Chat, createInputState("from service"));
    const history = nav.values;
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].inputText, "from service");
  });
  test("should adjust cursor when history is cleared", () => {
    const instantiationService = testDisposables.add(new TestInstantiationService());
    const storageService = testDisposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
    instantiationService.stub(IChatWidgetHistoryService, historyService);
    const nav = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    nav.append(createInputState("first"));
    nav.append(createInputState("second"));
    nav.previous();
    assert.ok(!nav.isAtEnd());
    historyService.clearHistory();
    assert.ok(nav.isAtEnd());
    assert.ok(nav.isAtStart());
    assert.strictEqual(nav.values.length, 0);
  });
  test("should handle cursor adjustment when max entries reached", () => {
    const nav = createNavigator();
    for (let i = 0; i < ChatInputHistoryMaxEntries; i++) {
      nav.append(createInputState(`entry ${i}`));
    }
    for (let i = 0; i < 20; i++) {
      nav.previous();
    }
    nav.append(createInputState("new entry"));
    assert.ok(nav.isAtEnd());
  });
  test("should support concurrent navigators", () => {
    const instantiationService = testDisposables.add(new TestInstantiationService());
    const storageService = testDisposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
    instantiationService.stub(IChatWidgetHistoryService, historyService);
    const nav1 = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    const nav2 = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    nav1.append(createInputState("query 1"));
    assert.strictEqual(nav1.values.length, 1);
    assert.strictEqual(nav2.values.length, 1);
    assert.strictEqual(nav1.values[0].inputText, "query 1");
    assert.strictEqual(nav2.values[0].inputText, "query 1");
    nav1.previous();
    assert.ok(!nav1.isAtEnd());
    assert.ok(nav2.isAtEnd());
    nav2.append(createInputState("query 2"));
    assert.strictEqual(nav1.values.length, 2);
    assert.strictEqual(nav2.values.length, 2);
    assert.strictEqual(nav1.current()?.inputText, "query 1");
    assert.ok(nav2.isAtEnd());
  });
  test("should support concurrent navigators with mixed positions", () => {
    const instantiationService = testDisposables.add(new TestInstantiationService());
    const storageService = testDisposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
    instantiationService.stub(IChatWidgetHistoryService, historyService);
    const nav1 = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    const nav2 = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    nav1.append(createInputState("query 1"));
    nav1.append(createInputState("query 2"));
    nav1.append(createInputState("query 3"));
    assert.ok(nav1.isAtEnd());
    assert.ok(nav2.isAtEnd());
    nav1.previous();
    assert.strictEqual(nav1.current()?.inputText, "query 3");
    nav1.previous();
    assert.strictEqual(nav1.current()?.inputText, "query 2");
    nav2.previous();
    nav2.previous();
    nav2.previous();
    assert.strictEqual(nav2.current()?.inputText, "query 1");
    nav1.append(createInputState("query 4"));
    assert.ok(nav1.isAtEnd());
    assert.strictEqual(nav1.values.length, 4);
    assert.strictEqual(nav2.current()?.inputText, "query 1");
    assert.strictEqual(nav2.values.length, 4);
  });
  test("should keep concurrent navigators separated by history key", () => {
    const instantiationService = testDisposables.add(new TestInstantiationService());
    const storageService = testDisposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
    instantiationService.stub(IChatWidgetHistoryService, historyService);
    const nav1 = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    const nav2 = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    nav1.setHistoryKey("session-1");
    nav2.setHistoryKey("session-2");
    nav1.append(createInputState("session 1 query 1"));
    nav1.append(createInputState("session 1 query 2"));
    nav2.append(createInputState("session 2 query"));
    nav1.previous();
    nav2.append(createInputState("session 2 query 2"));
    assert.deepStrictEqual({
      nav1Current: nav1.current()?.inputText,
      nav1Values: nav1.values.map((entry) => entry.inputText),
      nav2Values: nav2.values.map((entry) => entry.inputText)
    }, {
      nav1Current: "session 1 query 2",
      nav1Values: ["session 1 query 1", "session 1 query 2"],
      nav2Values: ["session 2 query", "session 2 query 2"]
    });
  });
  test("should update navigator when scoped history moves", () => {
    const instantiationService = testDisposables.add(new TestInstantiationService());
    const storageService = testDisposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    const historyService = testDisposables.add(instantiationService.createInstance(ChatWidgetHistoryService));
    instantiationService.stub(IChatWidgetHistoryService, historyService);
    const nav = testDisposables.add(instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    nav.setHistoryKey("committed-session");
    historyService.append(ChatAgentLocation.Chat, createInputState("untitled query"), "untitled-session");
    historyService.moveHistory(ChatAgentLocation.Chat, "untitled-session", "committed-session");
    assert.deepStrictEqual(nav.values.map((entry) => entry.inputText), ["untitled query"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vd2lkZ2V0L2NoYXRXaWRnZXRIaXN0b3J5U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgVGVzdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWxJbnB1dFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0SGlzdG9yeU5hdmlnYXRvciwgQ2hhdElucHV0SGlzdG9yeU1heEVudHJpZXMsIENoYXRXaWRnZXRIaXN0b3J5U2VydmljZSwgSUNoYXRXaWRnZXRIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi93aWRnZXQvY2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1lbWVudG8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vbWVtZW50by5qcyc7XG5cbnN1aXRlKCdDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IHRlc3REaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHQvLyBDbGVhciBtZW1lbnRvIGNhY2hlIGJlZm9yZSBlYWNoIHRlc3QgdG8gcHJldmVudCBzdGF0ZSBsZWFrYWdlXG5cdFx0TWVtZW50by5jbGVhcihTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdE1lbWVudG8uY2xlYXIoU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdE1lbWVudG8uY2xlYXIoU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUhpc3RvcnlTZXJ2aWNlKCk6IENoYXRXaWRnZXRIaXN0b3J5U2VydmljZSB7XG5cdFx0Ly8gQ3JlYXRlIGZyZXNoIGluc3RhbmNlcyBmb3IgZWFjaCB0ZXN0IHRvIGF2b2lkIHN0YXRlIGxlYWthZ2Vcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHJldHVybiB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRXaWRnZXRIaXN0b3J5U2VydmljZSkpO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlSW5wdXRTdGF0ZSh0ZXh0OiBzdHJpbmcsIG1vZGVLaW5kID0gQ2hhdE1vZGVLaW5kLkFzayk6IElDaGF0TW9kZWxJbnB1dFN0YXRlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW5wdXRUZXh0OiB0ZXh0LFxuXHRcdFx0YXR0YWNobWVudHM6IFtdLFxuXHRcdFx0bW9kZTogeyBpZDogbW9kZUtpbmQsIGtpbmQ6IG1vZGVLaW5kIH0sXG5cdFx0XHRzZWxlY3RlZE1vZGVsOiB1bmRlZmluZWQsXG5cdFx0XHRzZWxlY3Rpb25zOiBbXSxcblx0XHRcdGNvbnRyaWI6IHt9XG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ3Nob3VsZCBzdGFydCB3aXRoIGVtcHR5IGhpc3RvcnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBjcmVhdGVIaXN0b3J5U2VydmljZSgpO1xuXHRcdGNvbnN0IGhpc3RvcnkgPSBoaXN0b3J5U2VydmljZS5nZXRIaXN0b3J5KENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5Lmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBhcHBlbmQgYW5kIHJldHJpZXZlIGhpc3RvcnkgZW50cmllcycsICgpID0+IHtcblx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IGNyZWF0ZUhpc3RvcnlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZW50cnkgPSBjcmVhdGVJbnB1dFN0YXRlKCd0ZXN0IHF1ZXJ5Jyk7XG5cdFx0aGlzdG9yeVNlcnZpY2UuYXBwZW5kKENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGVudHJ5KTtcblxuXHRcdGNvbnN0IGhpc3RvcnkgPSBoaXN0b3J5U2VydmljZS5nZXRIaXN0b3J5KENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpc3RvcnlbMF0uaW5wdXRUZXh0LCAndGVzdCBxdWVyeScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbWFpbnRhaW4gc2VwYXJhdGUgaGlzdG9yeSBwZXIgbG9jYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBjcmVhdGVIaXN0b3J5U2VydmljZSgpO1xuXHRcdGhpc3RvcnlTZXJ2aWNlLmFwcGVuZChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjcmVhdGVJbnB1dFN0YXRlKCdjaGF0IHF1ZXJ5JykpO1xuXHRcdGhpc3RvcnlTZXJ2aWNlLmFwcGVuZChDaGF0QWdlbnRMb2NhdGlvbi5UZXJtaW5hbCwgY3JlYXRlSW5wdXRTdGF0ZSgndGVybWluYWwgcXVlcnknKSk7XG5cblx0XHRjb25zdCBjaGF0SGlzdG9yeSA9IGhpc3RvcnlTZXJ2aWNlLmdldEhpc3RvcnkoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0Y29uc3QgdGVybWluYWxIaXN0b3J5ID0gaGlzdG9yeVNlcnZpY2UuZ2V0SGlzdG9yeShDaGF0QWdlbnRMb2NhdGlvbi5UZXJtaW5hbCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhdEhpc3RvcnkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxIaXN0b3J5Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYXRIaXN0b3J5WzBdLmlucHV0VGV4dCwgJ2NoYXQgcXVlcnknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxIaXN0b3J5WzBdLmlucHV0VGV4dCwgJ3Rlcm1pbmFsIHF1ZXJ5Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBtYWludGFpbiBzZXBhcmF0ZSBoaXN0b3J5IHBlciBoaXN0b3J5IGtleScsICgpID0+IHtcblx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IGNyZWF0ZUhpc3RvcnlTZXJ2aWNlKCk7XG5cdFx0aGlzdG9yeVNlcnZpY2UuYXBwZW5kKENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNyZWF0ZUlucHV0U3RhdGUoJ2dsb2JhbCBxdWVyeScpKTtcblx0XHRoaXN0b3J5U2VydmljZS5hcHBlbmQoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY3JlYXRlSW5wdXRTdGF0ZSgnc2Vzc2lvbiAxIHF1ZXJ5JyksICdzZXNzaW9uLTEnKTtcblx0XHRoaXN0b3J5U2VydmljZS5hcHBlbmQoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY3JlYXRlSW5wdXRTdGF0ZSgnc2Vzc2lvbiAyIHF1ZXJ5JyksICdzZXNzaW9uLTInKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Z2xvYmFsOiBoaXN0b3J5U2VydmljZS5nZXRIaXN0b3J5KENoYXRBZ2VudExvY2F0aW9uLkNoYXQpLm1hcChlbnRyeSA9PiBlbnRyeS5pbnB1dFRleHQpLFxuXHRcdFx0c2Vzc2lvbjE6IGhpc3RvcnlTZXJ2aWNlLmdldEhpc3RvcnkoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgJ3Nlc3Npb24tMScpLm1hcChlbnRyeSA9PiBlbnRyeS5pbnB1dFRleHQpLFxuXHRcdFx0c2Vzc2lvbjI6IGhpc3RvcnlTZXJ2aWNlLmdldEhpc3RvcnkoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgJ3Nlc3Npb24tMicpLm1hcChlbnRyeSA9PiBlbnRyeS5pbnB1dFRleHQpLFxuXHRcdH0sIHtcblx0XHRcdGdsb2JhbDogWydnbG9iYWwgcXVlcnknXSxcblx0XHRcdHNlc3Npb24xOiBbJ3Nlc3Npb24gMSBxdWVyeSddLFxuXHRcdFx0c2Vzc2lvbjI6IFsnc2Vzc2lvbiAyIHF1ZXJ5J10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBtb3ZlIGhpc3RvcnkgYmV0d2VlbiBoaXN0b3J5IGtleXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBjcmVhdGVIaXN0b3J5U2VydmljZSgpO1xuXHRcdGhpc3RvcnlTZXJ2aWNlLmFwcGVuZChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjcmVhdGVJbnB1dFN0YXRlKCdjb21taXR0ZWQgcXVlcnknKSwgJ2NvbW1pdHRlZC1zZXNzaW9uJyk7XG5cdFx0aGlzdG9yeVNlcnZpY2UuYXBwZW5kKENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNyZWF0ZUlucHV0U3RhdGUoJ3VudGl0bGVkIHF1ZXJ5JyksICd1bnRpdGxlZC1zZXNzaW9uJyk7XG5cblx0XHRoaXN0b3J5U2VydmljZS5tb3ZlSGlzdG9yeShDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCAndW50aXRsZWQtc2Vzc2lvbicsICdjb21taXR0ZWQtc2Vzc2lvbicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR1bnRpdGxlZDogaGlzdG9yeVNlcnZpY2UuZ2V0SGlzdG9yeShDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCAndW50aXRsZWQtc2Vzc2lvbicpLm1hcChlbnRyeSA9PiBlbnRyeS5pbnB1dFRleHQpLFxuXHRcdFx0Y29tbWl0dGVkOiBoaXN0b3J5U2VydmljZS5nZXRIaXN0b3J5KENoYXRBZ2VudExvY2F0aW9uLkNoYXQsICdjb21taXR0ZWQtc2Vzc2lvbicpLm1hcChlbnRyeSA9PiBlbnRyeS5pbnB1dFRleHQpLFxuXHRcdH0sIHtcblx0XHRcdHVudGl0bGVkOiBbXSxcblx0XHRcdGNvbW1pdHRlZDogWydjb21taXR0ZWQgcXVlcnknLCAndW50aXRsZWQgcXVlcnknXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGxpbWl0IGhpc3RvcnkgdG8gbWF4IGVudHJpZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBjcmVhdGVIaXN0b3J5U2VydmljZSgpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgQ2hhdElucHV0SGlzdG9yeU1heEVudHJpZXMgKyAxMDsgaSsrKSB7XG5cdFx0XHRoaXN0b3J5U2VydmljZS5hcHBlbmQoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgY3JlYXRlSW5wdXRTdGF0ZShgcXVlcnkgJHtpfWApKTtcblx0XHR9XG5cblx0XHRjb25zdCBoaXN0b3J5ID0gaGlzdG9yeVNlcnZpY2UuZ2V0SGlzdG9yeShDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlzdG9yeS5sZW5ndGgsIENoYXRJbnB1dEhpc3RvcnlNYXhFbnRyaWVzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlzdG9yeVswXS5pbnB1dFRleHQsICdxdWVyeSAxMCcpOyAvLyBGaXJzdCAxMCBzaG91bGQgYmUgZHJvcHBlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5W2hpc3RvcnkubGVuZ3RoIC0gMV0uaW5wdXRUZXh0LCBgcXVlcnkgJHtDaGF0SW5wdXRIaXN0b3J5TWF4RW50cmllcyArIDl9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBmaXJlIGFwcGVuZCBldmVudCB3aGVuIGhpc3RvcnkgaXMgYWRkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBjcmVhdGVIaXN0b3J5U2VydmljZSgpO1xuXHRcdGxldCBldmVudEZpcmVkID0gZmFsc2U7XG5cdFx0bGV0IGZpcmVkRW50cnk6IElDaGF0TW9kZWxJbnB1dFN0YXRlIHwgdW5kZWZpbmVkO1xuXG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChoaXN0b3J5U2VydmljZS5vbkRpZENoYW5nZUhpc3RvcnkoZSA9PiB7XG5cdFx0XHRpZiAoZS5raW5kID09PSAnYXBwZW5kJykge1xuXHRcdFx0XHRldmVudEZpcmVkID0gdHJ1ZTtcblx0XHRcdFx0ZmlyZWRFbnRyeSA9IGUuZW50cnk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZW50cnkgPSBjcmVhdGVJbnB1dFN0YXRlKCd0ZXN0Jyk7XG5cdFx0aGlzdG9yeVNlcnZpY2UuYXBwZW5kKENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGVudHJ5KTtcblxuXHRcdGFzc2VydC5vayhldmVudEZpcmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyZWRFbnRyeT8uaW5wdXRUZXh0LCAndGVzdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgY2xlYXIgYWxsIGhpc3RvcnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBjcmVhdGVIaXN0b3J5U2VydmljZSgpO1xuXHRcdGhpc3RvcnlTZXJ2aWNlLmFwcGVuZChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjcmVhdGVJbnB1dFN0YXRlKCdxdWVyeSAxJykpO1xuXHRcdGhpc3RvcnlTZXJ2aWNlLmFwcGVuZChDaGF0QWdlbnRMb2NhdGlvbi5UZXJtaW5hbCwgY3JlYXRlSW5wdXRTdGF0ZSgncXVlcnkgMicpKTtcblxuXHRcdGhpc3RvcnlTZXJ2aWNlLmNsZWFySGlzdG9yeSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpc3RvcnlTZXJ2aWNlLmdldEhpc3RvcnkoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlzdG9yeVNlcnZpY2UuZ2V0SGlzdG9yeShDaGF0QWdlbnRMb2NhdGlvbi5UZXJtaW5hbCkubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZpcmUgY2xlYXIgZXZlbnQgd2hlbiBoaXN0b3J5IGlzIGNsZWFyZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBjcmVhdGVIaXN0b3J5U2VydmljZSgpO1xuXHRcdGxldCBjbGVhckV2ZW50RmlyZWQgPSBmYWxzZTtcblxuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoaGlzdG9yeVNlcnZpY2Uub25EaWRDaGFuZ2VIaXN0b3J5KGUgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gJ2NsZWFyJykge1xuXHRcdFx0XHRjbGVhckV2ZW50RmlyZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGhpc3RvcnlTZXJ2aWNlLmNsZWFySGlzdG9yeSgpO1xuXHRcdGFzc2VydC5vayhjbGVhckV2ZW50RmlyZWQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdEhpc3RvcnlOYXZpZ2F0b3InLCAoKSA9PiB7XG5cdGNvbnN0IHRlc3REaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHQvLyBDbGVhciBtZW1lbnRvIGNhY2hlIGJlZm9yZSBlYWNoIHRlc3QgdG8gcHJldmVudCBzdGF0ZSBsZWFrYWdlXG5cdFx0TWVtZW50by5jbGVhcihTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdE1lbWVudG8uY2xlYXIoU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdE1lbWVudG8uY2xlYXIoU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU5hdmlnYXRvcigpOiBDaGF0SGlzdG9yeU5hdmlnYXRvciB7XG5cdFx0Ly8gQ3JlYXRlIGZyZXNoIGluc3RhbmNlcyBmb3IgZWFjaCB0ZXN0IHRvIGF2b2lkIHN0YXRlIGxlYWthZ2Vcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRXaWRnZXRIaXN0b3J5U2VydmljZSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRIaXN0b3J5U2VydmljZSwgaGlzdG9yeVNlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEhpc3RvcnlOYXZpZ2F0b3IsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUlucHV0U3RhdGUodGV4dDogc3RyaW5nKTogSUNoYXRNb2RlbElucHV0U3RhdGUge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpbnB1dFRleHQ6IHRleHQsXG5cdFx0XHRhdHRhY2htZW50czogW10sXG5cdFx0XHRtb2RlOiB7IGlkOiBDaGF0TW9kZUtpbmQuQXNrLCBraW5kOiBDaGF0TW9kZUtpbmQuQXNrIH0sXG5cdFx0XHRzZWxlY3RlZE1vZGVsOiB1bmRlZmluZWQsXG5cdFx0XHRzZWxlY3Rpb25zOiBbXSxcblx0XHRcdGNvbnRyaWI6IHt9XG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ3Nob3VsZCBzdGFydCBhdCBlbmQgb2YgZW1wdHkgaGlzdG9yeScsICgpID0+IHtcblx0XHRjb25zdCBuYXYgPSBjcmVhdGVOYXZpZ2F0b3IoKTtcblx0XHRhc3NlcnQub2sobmF2LmlzQXRFbmQoKSk7XG5cdFx0YXNzZXJ0Lm9rKG5hdi5pc0F0U3RhcnQoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBuYXZpZ2F0ZSBiYWNrd2FyZHMgdGhyb3VnaCBoaXN0b3J5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG5hdiA9IGNyZWF0ZU5hdmlnYXRvcigpO1xuXHRcdG5hdi5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgnZmlyc3QnKSk7XG5cdFx0bmF2LmFwcGVuZChjcmVhdGVJbnB1dFN0YXRlKCdzZWNvbmQnKSk7XG5cdFx0bmF2LmFwcGVuZChjcmVhdGVJbnB1dFN0YXRlKCd0aGlyZCcpKTtcblxuXHRcdGFzc2VydC5vayhuYXYuaXNBdEVuZCgpKTtcblxuXHRcdGNvbnN0IHByZXYxID0gbmF2LnByZXZpb3VzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXYxPy5pbnB1dFRleHQsICd0aGlyZCcpO1xuXG5cdFx0Y29uc3QgcHJldjIgPSBuYXYucHJldmlvdXMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJldjI/LmlucHV0VGV4dCwgJ3NlY29uZCcpO1xuXG5cdFx0Y29uc3QgcHJldjMgPSBuYXYucHJldmlvdXMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJldjM/LmlucHV0VGV4dCwgJ2ZpcnN0Jyk7XG5cdFx0YXNzZXJ0Lm9rKG5hdi5pc0F0U3RhcnQoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBuYXZpZ2F0ZSBmb3J3YXJkcyB0aHJvdWdoIGhpc3RvcnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbmF2ID0gY3JlYXRlTmF2aWdhdG9yKCk7XG5cdFx0bmF2LmFwcGVuZChjcmVhdGVJbnB1dFN0YXRlKCdmaXJzdCcpKTtcblx0XHRuYXYuYXBwZW5kKGNyZWF0ZUlucHV0U3RhdGUoJ3NlY29uZCcpKTtcblxuXHRcdG5hdi5wcmV2aW91cygpO1xuXHRcdG5hdi5wcmV2aW91cygpO1xuXHRcdGFzc2VydC5vayhuYXYuaXNBdFN0YXJ0KCkpO1xuXG5cdFx0Y29uc3QgbmV4dDEgPSBuYXYubmV4dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXh0MT8uaW5wdXRUZXh0LCAnc2Vjb25kJyk7XG5cblx0XHRjb25zdCBuZXh0MiA9IG5hdi5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5leHQyLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5vayhuYXYuaXNBdEVuZCgpKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJlc2V0IGN1cnNvciB0byBlbmQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbmF2ID0gY3JlYXRlTmF2aWdhdG9yKCk7XG5cdFx0bmF2LmFwcGVuZChjcmVhdGVJbnB1dFN0YXRlKCdmaXJzdCcpKTtcblx0XHRuYXYuYXBwZW5kKGNyZWF0ZUlucHV0U3RhdGUoJ3NlY29uZCcpKTtcblxuXHRcdG5hdi5wcmV2aW91cygpO1xuXHRcdGFzc2VydC5vayghbmF2LmlzQXRFbmQoKSk7XG5cblx0XHRuYXYucmVzZXRDdXJzb3IoKTtcblx0XHRhc3NlcnQub2sobmF2LmlzQXRFbmQoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBvdmVybGF5IGVkaXRlZCBlbnRyaWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5hdiA9IGNyZWF0ZU5hdmlnYXRvcigpO1xuXHRcdG5hdi5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgnZmlyc3QnKSk7XG5cdFx0bmF2LmFwcGVuZChjcmVhdGVJbnB1dFN0YXRlKCdzZWNvbmQnKSk7XG5cblx0XHRuYXYucHJldmlvdXMoKTtcblx0XHRjb25zdCBlZGl0ZWQgPSBjcmVhdGVJbnB1dFN0YXRlKCdzZWNvbmQgZWRpdGVkJyk7XG5cdFx0bmF2Lm92ZXJsYXkoZWRpdGVkKTtcblxuXHRcdGNvbnN0IGN1cnJlbnQgPSBuYXYuY3VycmVudCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjdXJyZW50Py5pbnB1dFRleHQsICdzZWNvbmQgZWRpdGVkJyk7XG5cblx0XHQvLyBPcmlnaW5hbCBoaXN0b3J5IHNob3VsZCBiZSB1bmNoYW5nZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2LnZhbHVlc1sxXS5pbnB1dFRleHQsICdzZWNvbmQnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGNsZWFyIG92ZXJsYXkgb24gYXBwZW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5hdiA9IGNyZWF0ZU5hdmlnYXRvcigpO1xuXHRcdG5hdi5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgnZmlyc3QnKSk7XG5cblx0XHRuYXYucHJldmlvdXMoKTtcblx0XHRuYXYub3ZlcmxheShjcmVhdGVJbnB1dFN0YXRlKCdmaXJzdCBlZGl0ZWQnKSk7XG5cblx0XHRjb25zdCBjdXJyZW50QmVmb3JlID0gbmF2LmN1cnJlbnQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3VycmVudEJlZm9yZT8uaW5wdXRUZXh0LCAnZmlyc3QgZWRpdGVkJyk7XG5cblx0XHRuYXYuYXBwZW5kKGNyZWF0ZUlucHV0U3RhdGUoJ3NlY29uZCcpKTtcblxuXHRcdC8vIEFmdGVyIGFwcGVuZCwgY3Vyc29yIHNob3VsZCBiZSBhdCBlbmQgYW5kIG92ZXJsYXkgY2xlYXJlZFxuXHRcdGFzc2VydC5vayhuYXYuaXNBdEVuZCgpKTtcblx0XHRuYXYucHJldmlvdXMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2LmN1cnJlbnQoKT8uaW5wdXRUZXh0LCAnc2Vjb25kJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBzdG9wIGF0IHN0YXJ0IHdoZW4gbmF2aWdhdGluZyBiYWNrd2FyZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbmF2ID0gY3JlYXRlTmF2aWdhdG9yKCk7XG5cdFx0bmF2LmFwcGVuZChjcmVhdGVJbnB1dFN0YXRlKCdvbmx5JykpO1xuXG5cdFx0bmF2LnByZXZpb3VzKCk7XG5cdFx0YXNzZXJ0Lm9rKG5hdi5pc0F0U3RhcnQoKSk7XG5cblx0XHRjb25zdCBwcmV2ID0gbmF2LnByZXZpb3VzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXY/LmlucHV0VGV4dCwgJ29ubHknKTsgLy8gU2hvdWxkIHN0YXkgYXQgZmlyc3Rcblx0XHRhc3NlcnQub2sobmF2LmlzQXRTdGFydCgpKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHN0b3AgYXQgZW5kIHdoZW4gbmF2aWdhdGluZyBmb3J3YXJkcycsICgpID0+IHtcblx0XHRjb25zdCBuYXYgPSBjcmVhdGVOYXZpZ2F0b3IoKTtcblx0XHRuYXYuYXBwZW5kKGNyZWF0ZUlucHV0U3RhdGUoJ29ubHknKSk7XG5cblx0XHRjb25zdCBuZXh0MSA9IG5hdi5uZXh0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5leHQxLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5vayhuYXYuaXNBdEVuZCgpKTtcblxuXHRcdGNvbnN0IG5leHQyID0gbmF2Lm5leHQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV4dDIsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKG5hdi5pc0F0RW5kKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgdXBkYXRlIHdoZW4gaGlzdG9yeSBzZXJ2aWNlIGFwcGVuZHMgZW50cmllcycsICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRXaWRnZXRIaXN0b3J5U2VydmljZSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRIaXN0b3J5U2VydmljZSwgaGlzdG9yeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbmF2ID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SGlzdG9yeU5hdmlnYXRvciwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkpO1xuXG5cdFx0aGlzdG9yeVNlcnZpY2UuYXBwZW5kKENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNyZWF0ZUlucHV0U3RhdGUoJ2Zyb20gc2VydmljZScpKTtcblxuXHRcdGNvbnN0IGhpc3RvcnkgPSBuYXYudmFsdWVzO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpc3RvcnlbMF0uaW5wdXRUZXh0LCAnZnJvbSBzZXJ2aWNlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBhZGp1c3QgY3Vyc29yIHdoZW4gaGlzdG9yeSBpcyBjbGVhcmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cblx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlLCBoaXN0b3J5U2VydmljZSk7XG5cblx0XHRjb25zdCBuYXYgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRIaXN0b3J5TmF2aWdhdG9yLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSk7XG5cblx0XHRuYXYuYXBwZW5kKGNyZWF0ZUlucHV0U3RhdGUoJ2ZpcnN0JykpO1xuXHRcdG5hdi5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgnc2Vjb25kJykpO1xuXG5cdFx0bmF2LnByZXZpb3VzKCk7XG5cdFx0YXNzZXJ0Lm9rKCFuYXYuaXNBdEVuZCgpKTtcblxuXHRcdGhpc3RvcnlTZXJ2aWNlLmNsZWFySGlzdG9yeSgpO1xuXG5cdFx0YXNzZXJ0Lm9rKG5hdi5pc0F0RW5kKCkpO1xuXHRcdGFzc2VydC5vayhuYXYuaXNBdFN0YXJ0KCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXYudmFsdWVzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgY3Vyc29yIGFkanVzdG1lbnQgd2hlbiBtYXggZW50cmllcyByZWFjaGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5hdiA9IGNyZWF0ZU5hdmlnYXRvcigpO1xuXHRcdC8vIEFkZCBlbnRyaWVzIHVwIHRvIHRoZSBtYXhcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IENoYXRJbnB1dEhpc3RvcnlNYXhFbnRyaWVzOyBpKyspIHtcblx0XHRcdG5hdi5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZShgZW50cnkgJHtpfWApKTtcblx0XHR9XG5cblx0XHQvLyBOYXZpZ2F0ZSB0byBtaWRkbGUgb2YgaGlzdG9yeVxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMjA7IGkrKykge1xuXHRcdFx0bmF2LnByZXZpb3VzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIG9uZSBtb3JlIGVudHJ5IChzaG91bGQgZHJvcCBvbGRlc3QpXG5cdFx0bmF2LmFwcGVuZChjcmVhdGVJbnB1dFN0YXRlKCduZXcgZW50cnknKSk7XG5cblx0XHQvLyBDdXJzb3Igc2hvdWxkIGJlIGF0IGVuZCBhZnRlciBhcHBlbmRcblx0XHRhc3NlcnQub2sobmF2LmlzQXRFbmQoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBzdXBwb3J0IGNvbmN1cnJlbnQgbmF2aWdhdG9ycycsICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRXaWRnZXRIaXN0b3J5U2VydmljZSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRIaXN0b3J5U2VydmljZSwgaGlzdG9yeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbmF2MSA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEhpc3RvcnlOYXZpZ2F0b3IsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKTtcblx0XHRjb25zdCBuYXYyID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SGlzdG9yeU5hdmlnYXRvciwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkpO1xuXG5cdFx0bmF2MS5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgncXVlcnkgMScpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXYxLnZhbHVlcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXYyLnZhbHVlcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXYxLnZhbHVlc1swXS5pbnB1dFRleHQsICdxdWVyeSAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdjIudmFsdWVzWzBdLmlucHV0VGV4dCwgJ3F1ZXJ5IDEnKTtcblxuXHRcdG5hdjEucHJldmlvdXMoKTtcblx0XHRhc3NlcnQub2soIW5hdjEuaXNBdEVuZCgpKTtcblx0XHRhc3NlcnQub2sobmF2Mi5pc0F0RW5kKCkpO1xuXG5cdFx0bmF2Mi5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgncXVlcnkgMicpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXYxLnZhbHVlcy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXYyLnZhbHVlcy5sZW5ndGgsIDIpO1xuXG5cdFx0Ly8gbmF2MSBzaG91bGQgc3RheSBhdCBzYW1lIHBvc2l0aW9uIChwb2ludGluZyB0byBxdWVyeSAxKVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXYxLmN1cnJlbnQoKT8uaW5wdXRUZXh0LCAncXVlcnkgMScpO1xuXG5cdFx0Ly8gbmF2MiBzaG91bGQgYmUgYXQgZW5kXG5cdFx0YXNzZXJ0Lm9rKG5hdjIuaXNBdEVuZCgpKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHN1cHBvcnQgY29uY3VycmVudCBuYXZpZ2F0b3JzIHdpdGggbWl4ZWQgcG9zaXRpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cblx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlLCBoaXN0b3J5U2VydmljZSk7XG5cblx0XHRjb25zdCBuYXYxID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SGlzdG9yeU5hdmlnYXRvciwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkpO1xuXHRcdGNvbnN0IG5hdjIgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRIaXN0b3J5TmF2aWdhdG9yLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSk7XG5cblx0XHRuYXYxLmFwcGVuZChjcmVhdGVJbnB1dFN0YXRlKCdxdWVyeSAxJykpO1xuXHRcdG5hdjEuYXBwZW5kKGNyZWF0ZUlucHV0U3RhdGUoJ3F1ZXJ5IDInKSk7XG5cdFx0bmF2MS5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgncXVlcnkgMycpKTtcblxuXHRcdC8vIEJvdGggYXQgZW5kXG5cdFx0YXNzZXJ0Lm9rKG5hdjEuaXNBdEVuZCgpKTtcblx0XHRhc3NlcnQub2sobmF2Mi5pc0F0RW5kKCkpO1xuXG5cdFx0Ly8gTW92ZSBuYXYxIGJhY2sgdG8gJ3F1ZXJ5IDInXG5cdFx0bmF2MS5wcmV2aW91cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXYxLmN1cnJlbnQoKT8uaW5wdXRUZXh0LCAncXVlcnkgMycpO1xuXHRcdG5hdjEucHJldmlvdXMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2MS5jdXJyZW50KCk/LmlucHV0VGV4dCwgJ3F1ZXJ5IDInKTtcblxuXHRcdC8vIE1vdmUgbmF2MiBiYWNrIHRvICdxdWVyeSAxJ1xuXHRcdG5hdjIucHJldmlvdXMoKTtcblx0XHRuYXYyLnByZXZpb3VzKCk7XG5cdFx0bmF2Mi5wcmV2aW91cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXYyLmN1cnJlbnQoKT8uaW5wdXRUZXh0LCAncXVlcnkgMScpO1xuXG5cdFx0Ly8gQXBwZW5kIG5ldyBxdWVyeVxuXHRcdG5hdjEuYXBwZW5kKGNyZWF0ZUlucHV0U3RhdGUoJ3F1ZXJ5IDQnKSk7XG5cblx0XHQvLyBuYXYxIHNob3VsZCBiZSBhdCBlbmQgKGJlY2F1c2UgaXQgYXBwZW5kZWQpXG5cdFx0YXNzZXJ0Lm9rKG5hdjEuaXNBdEVuZCgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2MS52YWx1ZXMubGVuZ3RoLCA0KTtcblxuXHRcdC8vIG5hdjIgc2hvdWxkIHN0YXkgYXQgJ3F1ZXJ5IDEnXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdjIuY3VycmVudCgpPy5pbnB1dFRleHQsICdxdWVyeSAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdjIudmFsdWVzLmxlbmd0aCwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBrZWVwIGNvbmN1cnJlbnQgbmF2aWdhdG9ycyBzZXBhcmF0ZWQgYnkgaGlzdG9yeSBrZXknLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UsIGhpc3RvcnlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG5hdjEgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRIaXN0b3J5TmF2aWdhdG9yLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSk7XG5cdFx0Y29uc3QgbmF2MiA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEhpc3RvcnlOYXZpZ2F0b3IsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKTtcblx0XHRuYXYxLnNldEhpc3RvcnlLZXkoJ3Nlc3Npb24tMScpO1xuXHRcdG5hdjIuc2V0SGlzdG9yeUtleSgnc2Vzc2lvbi0yJyk7XG5cblx0XHRuYXYxLmFwcGVuZChjcmVhdGVJbnB1dFN0YXRlKCdzZXNzaW9uIDEgcXVlcnkgMScpKTtcblx0XHRuYXYxLmFwcGVuZChjcmVhdGVJbnB1dFN0YXRlKCdzZXNzaW9uIDEgcXVlcnkgMicpKTtcblx0XHRuYXYyLmFwcGVuZChjcmVhdGVJbnB1dFN0YXRlKCdzZXNzaW9uIDIgcXVlcnknKSk7XG5cblx0XHRuYXYxLnByZXZpb3VzKCk7XG5cdFx0bmF2Mi5hcHBlbmQoY3JlYXRlSW5wdXRTdGF0ZSgnc2Vzc2lvbiAyIHF1ZXJ5IDInKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG5hdjFDdXJyZW50OiBuYXYxLmN1cnJlbnQoKT8uaW5wdXRUZXh0LFxuXHRcdFx0bmF2MVZhbHVlczogbmF2MS52YWx1ZXMubWFwKGVudHJ5ID0+IGVudHJ5LmlucHV0VGV4dCksXG5cdFx0XHRuYXYyVmFsdWVzOiBuYXYyLnZhbHVlcy5tYXAoZW50cnkgPT4gZW50cnkuaW5wdXRUZXh0KSxcblx0XHR9LCB7XG5cdFx0XHRuYXYxQ3VycmVudDogJ3Nlc3Npb24gMSBxdWVyeSAyJyxcblx0XHRcdG5hdjFWYWx1ZXM6IFsnc2Vzc2lvbiAxIHF1ZXJ5IDEnLCAnc2Vzc2lvbiAxIHF1ZXJ5IDInXSxcblx0XHRcdG5hdjJWYWx1ZXM6IFsnc2Vzc2lvbiAyIHF1ZXJ5JywgJ3Nlc3Npb24gMiBxdWVyeSAyJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCB1cGRhdGUgbmF2aWdhdG9yIHdoZW4gc2NvcGVkIGhpc3RvcnkgbW92ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UsIGhpc3RvcnlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG5hdiA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEhpc3RvcnlOYXZpZ2F0b3IsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKTtcblx0XHRuYXYuc2V0SGlzdG9yeUtleSgnY29tbWl0dGVkLXNlc3Npb24nKTtcblxuXHRcdGhpc3RvcnlTZXJ2aWNlLmFwcGVuZChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjcmVhdGVJbnB1dFN0YXRlKCd1bnRpdGxlZCBxdWVyeScpLCAndW50aXRsZWQtc2Vzc2lvbicpO1xuXHRcdGhpc3RvcnlTZXJ2aWNlLm1vdmVIaXN0b3J5KENoYXRBZ2VudExvY2F0aW9uLkNoYXQsICd1bnRpdGxlZC1zZXNzaW9uJywgJ2NvbW1pdHRlZC1zZXNzaW9uJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5hdi52YWx1ZXMubWFwKGVudHJ5ID0+IGVudHJ5LmlucHV0VGV4dCksIFsndW50aXRsZWQgcXVlcnknXSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsbUJBQW1CLG9CQUFvQjtBQUNoRCxTQUFTLHNCQUFzQiw0QkFBNEIsMEJBQTBCLGlDQUFpQztBQUN0SCxTQUFTLGVBQWU7QUFFeEIsTUFBTSw0QkFBNEIsTUFBTTtBQUN2QyxRQUFNLGtCQUFrQix3Q0FBd0M7QUFFaEUsUUFBTSxNQUFNO0FBRVgsWUFBUSxNQUFNLGFBQWEsV0FBVztBQUN0QyxZQUFRLE1BQU0sYUFBYSxPQUFPO0FBQ2xDLFlBQVEsTUFBTSxhQUFhLFNBQVM7QUFBQSxFQUNyQyxDQUFDO0FBRUQsV0FBUyx1QkFBaUQ7QUFFekQsVUFBTSx1QkFBdUIsZ0JBQWdCLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUMvRSxVQUFNLGlCQUFpQixnQkFBZ0IsSUFBSSxJQUFJLG1CQUFtQixDQUFDO0FBQ25FLHlCQUFxQixLQUFLLGlCQUFpQixjQUFjO0FBQ3pELFdBQU8sZ0JBQWdCLElBQUkscUJBQXFCLGVBQWUsd0JBQXdCLENBQUM7QUFBQSxFQUN6RjtBQUVBLFdBQVMsaUJBQWlCLE1BQWMsV0FBVyxhQUFhLEtBQTJCO0FBQzFGLFdBQU87QUFBQSxNQUNOLFdBQVc7QUFBQSxNQUNYLGFBQWEs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
