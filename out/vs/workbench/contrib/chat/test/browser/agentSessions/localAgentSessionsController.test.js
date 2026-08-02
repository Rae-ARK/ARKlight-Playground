import assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { timeout } from "../../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { LocalAgentsSessionsController } from "../../../browser/agentSessions/localAgentSessionsController.js";
import { IChatService, ResponseModelState } from "../../../common/chatService/chatService.js";
import { chatModelToChatDetail } from "../../../common/chatService/chatServiceImpl.js";
import { ChatSessionStatus, IChatSessionsService, localChatSessionType } from "../../../common/chatSessionsService.js";
import { ChatEditingSessionState, ModifiedFileEntryState } from "../../../common/editing/chatEditingService.js";
import { ChatRequestRemovalReason } from "../../../common/model/chatModel.js";
import { LocalChatSessionUri } from "../../../common/model/chatUri.js";
import { MockChatService } from "../../common/chatService/mockChatService.js";
import { MockChatSessionsService } from "../../common/mockChatSessionsService.js";
function createTestTiming(options) {
  const now = Date.now();
  return {
    created: options?.created ?? now,
    lastRequestStarted: options?.lastRequestStarted,
    lastRequestEnded: options?.lastRequestEnded
  };
}
function createMockChatModel(options) {
  const requests = [];
  const createRequest = () => {
    const mockResponse = {
      isComplete: options.lastResponseComplete ?? true,
      isCanceled: options.lastResponseCanceled ?? false,
      result: options.lastResponseHasError ? { errorDetails: { message: "error" } } : void 0,
      timestamp: options.lastResponseTimestamp ?? Date.now(),
      completedAt: options.lastResponseCompletedAt,
      response: {
        value: [],
        getMarkdown: () => "",
        getFinalResponse: () => "",
        toString: () => options.customTitle ? "" : "Test response content"
      }
    };
    return {
      id: "request-1",
      response: mockResponse
    };
  };
  let hasRequests = options.hasRequests !== false;
  if (hasRequests) {
    requests.push(createRequest());
  }
  const editingSessionEntries = options.editingSession?.entries.map((entry) => ({
    state: observableValue("state", entry.state),
    linesAdded: observableValue("linesAdded", entry.linesAdded),
    linesRemoved: observableValue("linesRemoved", entry.linesRemoved),
    originalURI: entry.modifiedURI,
    modifiedURI: entry.modifiedURI
  }));
  const mockEditingSession = options.editingSession ? {
    entries: observableValue("entries", editingSessionEntries ?? []),
    state: observableValue("state", ChatEditingSessionState.Idle)
  } : void 0;
  const _onDidChange = new Emitter();
  let title = options.customTitle ?? "Test Chat Title";
  const requestInProgress = observableValue("requestInProgress", options.requestInProgress ?? false);
  return {
    get title() {
      return title;
    },
    sessionResource: options.sessionResource,
    get hasRequests() {
      return hasRequests;
    },
    timestamp: options.timestamp ?? Date.now(),
    timing: createTestTiming({ created: options.timestamp }),
    requestInProgress,
    getRequests: () => requests,
    onDidChange: _onDidChange.event,
    editingSession: mockEditingSession,
    lastRequestObs: observableValue("lastRequest", void 0),
    // Mock helpers
    setCustomTitle: (newTitle) => {
      title = newTitle;
      _onDidChange.fire({ kind: "setCustomTitle", title });
    },
    setRequestInProgress: (inProgress) => {
      if (requestInProgress.get() === inProgress) {
        return;
      }
      requestInProgress.set(inProgress, void 0);
      _onDidChange.fire({ kind: "changedRequest" });
    },
    addFirstRequest: () => {
      if (hasRequests) {
        return;
      }
      hasRequests = true;
      const request = createRequest();
      requests.push(request);
      _onDidChange.fire({ kind: "addRequest", request });
    },
    removeRequests: () => {
      if (!hasRequests) {
        return;
      }
      hasRequests = false;
      const [request] = requests.splice(0, requests.length);
      _onDidChange.fire({ kind: "removeRequest", requestId: request.id, reason: ChatRequestRemovalReason.Removal });
    }
  };
}
suite("LocalAgentsSessionsController", () => {
  const disposables = new DisposableStore();
  let mockChatService;
  let mockChatSessionsService;
  let instantiationService;
  setup(() => {
    mockChatService = new MockChatService();
    mockChatSessionsService = new MockChatSessionsService();
    instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
    instantiationService.stub(IChatService, mockChatService);
    instantiationService.stub(IChatSessionsService, mockChatSessionsService);
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createController() {
    return disposables.add(instantiationService.createInstance(LocalAgentsSessionsController));
  }
  test("should have correct session type", () => {
    const controller = createController();
    assert.strictEqual(controller.chatSessionType, localChatSessionType);
  });
  test("should register itself with chat sessions service", async () => {
    const controller = createController();
    const controllerResults = [];
    for await (const result of mockChatSessionsService.getChatSessionItems(void 0, CancellationToken.None)) {
      controllerResults.push(result);
    }
    assert.strictEqual(controllerResults.length, 1);
    assert.strictEqual(controllerResults[0].chatSessionType, controller.chatSessionType);
  });
  test("should provide empty sessions when no live or history sessions", async () => {
    return runWithFakedTimers({}, async () => {
      const controller = createController();
      mockChatService.setLiveSessionItems([]);
      mockChatService.setHistorySessionItems([]);
      await controller.refresh(CancellationToken.None);
      const sessions = controller.items;
      assert.strictEqual(sessions.length, 0);
    });
  });
  test("should provide live session items", async () => {
    return runWithFakedTimers({}, async () => {
      const controller = createController();
      const sessionResource = LocalChatSessionUri.forSession("test-session");
      const mockModel = createMockChatModel({
        sessionResource,
        hasRequests: true,
        timestamp: Date.now()
      });
      mockChatService.addSession(mockModel);
      mockChatService.setLiveSessionItems([{
        sessionResource,
        title: "Test Session",
        lastMessageDate: Date.now(),
        isActive: true,
        timing: createTestTiming(),
        lastResponseState: ResponseModelState.Complete
      }]);
      await controller.refresh(CancellationToken.None);
      const sessions = controller.items;
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0].label, "Test Session");
      assert.strictEqual(sessions[0].resource.toString(), sessionResource.toString());
    });
  });
  test("should provide history session items", async () => {
    return runWithFakedTimers({}, async () => {
      const controller = createController();
      const sessionResource = LocalChatSessionUri.forSession("history-session");
      mockChatService.setLiveSessionItems([]);
      mockChatService.setHistorySessionItems([{
        sessionResource,
        title: "History Session",
        lastMessageDate: Date.now() - 1e4,
        isActive: false,
        lastResponseState: ResponseModelState.Complete,
        timing: createTestTiming()
      }]);
      await controller.refresh(CancellationToken.None);
      const sessions = controller.items;
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0].label, "History Session");
    });
  });
  test("should not duplicate sessions in history and live", async () => {
    return runWithFakedTimers({}, async () => {
      const controller = createController();
      const sessionResource = LocalChatSessionUri.forSession("duplicate-session");
      const mockModel = createMockChatModel({
        sessionResource,
        hasRequests: true
      });
      mockChatService.addSession(mockModel);
      mockChatService.setLiveSessionItems([{
        sessionResource,
        title: "Live Session",
        lastMessageDate: Date.now(),
        isActive: true,
        lastResponseState: ResponseModelState.Complete,
        timing: createTestTiming()
      }]);
      mockChatService.setHistorySessionItems([{
        sessionResource,
        title: "History Session",
        lastMessageDate: Date.now() - 1e4,
        isActive: false,
        lastResponseState: ResponseModelState.Complete,
        timing: createTestTiming()
      }]);
      await controller.refresh(CancellationToken.None);
      const sessions = controller.items;
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0].label, "Live Session");
    });
  });
  suite("Session Status", () => {
    test("should return InProgress status when request in progress", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("in-progress-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          requestInProgress: true
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([{
          sessionResource,
          title: "In Progress Session",
          lastMessageDate: Date.now(),
          isActive: true,
          lastResponseState: ResponseModelState.Complete,
          timing: createTestTiming()
        }]);
        await controller.refresh(CancellationToken.None);
        const sessions = controller.items;
        assert.strictEqual(sessions.length, 1);
        assert.strictEqual(sessions[0].status, ChatSessionStatus.InProgress);
      });
    });
    test("should return Completed status when last response is complete", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("completed-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          requestInProgress: false,
          lastResponseComplete: true,
          lastResponseCanceled: false,
          lastResponseHasError: false
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([{
          sessionResource,
          title: "Completed Session",
          lastMessageDate: Date.now(),
          isActive: true,
          lastResponseState: ResponseModelState.Complete,
          timing: createTestTiming()
        }]);
        await controller.refresh(CancellationToken.None);
        const sessions = controller.items;
        assert.strictEqual(sessions.length, 1);
        assert.strictEqual(sessions[0].status, ChatSessionStatus.Completed);
      });
    });
    test("should return Success status when last response was canceled", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("canceled-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          requestInProgress: false,
          lastResponseComplete: false,
          lastResponseCanceled: true
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([{
          sessionResource,
          title: "Canceled Session",
          lastMessageDate: Date.now(),
          isActive: true,
          lastResponseState: ResponseModelState.Complete,
          timing: createTestTiming()
        }]);
        await controller.refresh(CancellationToken.None);
        const sessions = controller.items;
        assert.strictEqual(sessions.length, 1);
        assert.strictEqual(sessions[0].status, ChatSessionStatus.Completed);
      });
    });
    test("should return Failed status when last response has error", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("error-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          requestInProgress: false,
          lastResponseComplete: true,
          lastResponseHasError: true
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([{
          sessionResource,
          title: "Error Session",
          lastMessageDate: Date.now(),
          isActive: true,
          lastResponseState: ResponseModelState.Complete,
          timing: createTestTiming()
        }]);
        await controller.refresh(CancellationToken.None);
        const sessions = controller.items;
        assert.strictEqual(sessions.length, 1);
        assert.strictEqual(sessions[0].status, ChatSessionStatus.Failed);
      });
    });
  });
  suite("Session Statistics", () => {
    test("should return statistics for sessions with modified entries", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("stats-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          editingSession: {
            entries: [
              {
                state: ModifiedFileEntryState.Modified,
                linesAdded: 10,
                linesRemoved: 5,
                modifiedURI: URI.file("/test/file1.ts")
              },
              {
                state: ModifiedFileEntryState.Modified,
                linesAdded: 20,
                linesRemoved: 3,
                modifiedURI: URI.file("/test/file2.ts")
              }
            ]
          }
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([{
          sessionResource,
          title: "Stats Session",
          lastMessageDate: Date.now(),
          isActive: true,
          lastResponseState: ResponseModelState.Complete,
          timing: createTestTiming(),
          stats: {
            added: 30,
            removed: 8,
            fileCount: 2
          }
        }]);
        await controller.refresh(CancellationToken.None);
        const sessions = controller.items;
        assert.strictEqual(sessions.length, 1);
        assert.ok(sessions[0].changes);
        const changes = sessions[0].changes;
        assert.strictEqual(changes.files, 2);
        assert.strictEqual(changes.insertions, 30);
        assert.strictEqual(changes.deletions, 8);
      });
    });
    test("should not return statistics for sessions without modified entries", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("no-stats-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          editingSession: {
            entries: [
              {
                state: ModifiedFileEntryState.Accepted,
                linesAdded: 10,
                linesRemoved: 5,
                modifiedURI: URI.file("/test/file1.ts")
              }
            ]
          }
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([{
          sessionResource,
          title: "No Stats Session",
          lastMessageDate: Date.now(),
          isActive: true,
          lastResponseState: ResponseModelState.Complete,
          timing: createTestTiming()
        }]);
        await controller.refresh(CancellationToken.None);
        const sessions = controller.items;
        assert.strictEqual(sessions.length, 1);
        assert.strictEqual(sessions[0].changes, void 0);
      });
    });
  });
  suite("Session Timing", () => {
    test("should use model timestamp for created when model exists", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("timing-session");
        const modelTimestamp = Date.now() - 5e3;
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          timestamp: modelTimestamp
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([{
          sessionResource,
          title: "Timing Session",
          lastMessageDate: Date.now(),
          isActive: true,
          lastResponseState: ResponseModelState.Complete,
          timing: createTestTiming({ created: modelTimestamp })
        }]);
        await controller.refresh(CancellationToken.None);
        const sessions = controller.items;
        assert.strictEqual(sessions.length, 1);
        assert.strictEqual(sessions[0].timing.created, modelTimestamp);
      });
    });
    test("should use lastMessageDate for created when model does not exist", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("history-timing");
        const lastMessageDate = Date.now() - 1e4;
        mockChatService.setLiveSessionItems([]);
        mockChatService.setHistorySessionItems([{
          sessionResource,
          title: "History Timing Session",
          lastMessageDate,
          isActive: false,
          lastResponseState: ResponseModelState.Complete,
          timing: createTestTiming({ created: lastMessageDate })
        }]);
        await controller.refresh(CancellationToken.None);
        const sessions = controller.items;
        assert.strictEqual(sessions.length, 1);
        assert.strictEqual(sessions[0].timing.created, lastMessageDate);
      });
    });
    test("should set lastRequestEnded from last response completedAt", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("endtime-session");
        const completedAt = Date.now() - 1e3;
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          lastResponseComplete: true,
          lastResponseCompletedAt: completedAt
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([{
          sessionResource,
          title: "EndTime Session",
          lastMessageDate: Date.now(),
          isActive: true,
          lastResponseState: ResponseModelState.Complete,
          timing: createTestTiming({ lastRequestEnded: completedAt })
        }]);
        await controller.refresh(CancellationToken.None);
        const sessions = controller.items;
        assert.strictEqual(sessions.length, 1);
        assert.strictEqual(sessions[0].timing.lastRequestEnded, completedAt);
      });
    });
  });
  suite("Events", () => {
    test("should fire onDidChangeChatSessionItems when model progress changes", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("progress-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          requestInProgress: false
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([await chatModelToChatDetail(mockModel)]);
        await controller.refresh(CancellationToken.None);
        await timeout(0);
        let changeEventCount = 0;
        disposables.add(controller.onDidChangeChatSessionItems(() => {
          changeEventCount++;
        }));
        const onDidChangeChatSessionItems = Event.toPromise(controller.onDidChangeChatSessionItems);
        mockModel.setRequestInProgress(true);
        await onDidChangeChatSessionItems;
        assert.strictEqual(changeEventCount, 1);
      });
    });
    test("should fire onDidChangeChatSessionItems when model request status changes", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = disposables.add(createController());
        const sessionResource = LocalChatSessionUri.forSession("status-change-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true,
          requestInProgress: false
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([await chatModelToChatDetail(mockModel)]);
        let changeEventCount = 0;
        disposables.add(controller.onDidChangeChatSessionItems(() => {
          changeEventCount++;
        }));
        await controller.refresh(CancellationToken.None);
        assert.strictEqual(changeEventCount, 1);
        const onDidChangeChatSessionItems = Event.toPromise(controller.onDidChangeChatSessionItems);
        mockModel.setRequestInProgress(true);
        await onDidChangeChatSessionItems;
        assert.strictEqual(changeEventCount, 2);
      });
    });
    test("should fire onDidChangeChatSessionItems when refresh discovers new sessions", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource1 = LocalChatSessionUri.forSession("session-1");
        const mockModel1 = createMockChatModel({ sessionResource: sessionResource1, hasRequests: true });
        mockChatService.addSession(mockModel1);
        mockChatService.setLiveSessionItems([await chatModelToChatDetail(mockModel1)]);
        await controller.refresh(CancellationToken.None);
        assert.strictEqual(controller.items.length, 1);
        const sessionResource2 = LocalChatSessionUri.forSession("session-2-forked");
        const mockModel2 = createMockChatModel({ sessionResource: sessionResource2, hasRequests: true, customTitle: "Forked: Test Chat Title" });
        mockChatService.addSession(mockModel2);
        mockChatService.setLiveSessionItems([
          await chatModelToChatDetail(mockModel1),
          await chatModelToChatDetail(mockModel2)
        ]);
        const fired = [];
        disposables.add(controller.onDidChangeChatSessionItems((delta) => fired.push(delta)));
        await controller.refresh(CancellationToken.None);
        assert.strictEqual(controller.items.length, 2);
        const addedResources = fired.flatMap((d) => d.addedOrUpdated ?? []).map((i) => i.resource.toString());
        assert.ok(addedResources.includes(sessionResource2.toString()), "forked session should appear in addedOrUpdated");
        assert.ok(!addedResources.includes(sessionResource1.toString()), "existing session should not appear in addedOrUpdated");
      });
    });
    test("should add a newly started session once it gets its first request", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("new-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: false
        });
        const fired = [];
        disposables.add(controller.onDidChangeChatSessionItems((delta) => fired.push(delta)));
        mockChatService.addSession(mockModel);
        await timeout(0);
        assert.strictEqual(controller.items.length, 0, "session without requests should not be listed yet");
        mockModel.addFirstRequest();
        await timeout(0);
        assert.strictEqual(controller.items.length, 1, "session should appear as soon as it has a request");
        const addedResources = fired.flatMap((d) => d.addedOrUpdated ?? []).map((i) => i.resource.toString());
        assert.ok(addedResources.includes(sessionResource.toString()), "new session should appear in addedOrUpdated without a manual refresh");
      });
    });
    test("should remove a listed session once its requests are removed", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("emptied-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([await chatModelToChatDetail(mockModel)]);
        await controller.refresh(CancellationToken.None);
        assert.strictEqual(controller.items.length, 1);
        const removedResources = [];
        disposables.add(controller.onDidChangeChatSessionItems((delta) => {
          if (delta.removed) {
            removedResources.push(...delta.removed);
          }
        }));
        mockModel.removeRequests();
        await timeout(0);
        assert.strictEqual(controller.items.length, 0, "session should be dropped once it has no requests");
        assert.ok(removedResources.some((r) => r.toString() === sessionResource.toString()), "emptied session should be removed without a manual refresh");
      });
    });
    test("should clean up model listeners when model is removed via chatModels observable", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("cleanup-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true
        });
        mockChatService.addSession(mockModel);
        mockChatService.removeSession(sessionResource);
        let changeEventCount = 0;
        disposables.add(controller.onDidChangeChatSessionItems(() => {
          changeEventCount++;
        }));
        mockModel.setCustomTitle("New Title");
        assert.strictEqual(changeEventCount, 0, "onDidChangeChatSessionItems should NOT fire after model is removed");
      });
    });
    test("should remove session from items and fire removed event on onDidDisposeSession", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("dispose-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([await chatModelToChatDetail(mockModel)]);
        await controller.refresh(CancellationToken.None);
        assert.strictEqual(controller.items.length, 1);
        const removedResources = [];
        disposables.add(controller.onDidChangeChatSessionItems((delta) => {
          if (delta.removed) {
            removedResources.push(...delta.removed);
          }
        }));
        mockChatService.fireDidDisposeSession([sessionResource]);
        assert.strictEqual(controller.items.length, 0, "items should be empty after dispose");
        assert.strictEqual(removedResources.length, 1, "removed event should fire");
        assert.strictEqual(removedResources[0].toString(), sessionResource.toString());
      });
    });
    test("should not re-add disposed session to items on refresh", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = createController();
        const sessionResource = LocalChatSessionUri.forSession("disposed-refresh-session");
        const mockModel = createMockChatModel({
          sessionResource,
          hasRequests: true
        });
        mockChatService.addSession(mockModel);
        mockChatService.setLiveSessionItems([await chatModelToChatDetail(mockModel)]);
        await controller.refresh(CancellationToken.None);
        assert.strictEqual(controller.items.length, 1);
        mockChatService.fireDidDisposeSession([sessionResource]);
        assert.strictEqual(controller.items.length, 0);
        mockChatService.setLiveSessionItems([]);
        await controller.refresh(CancellationToken.None);
        assert.strictEqual(controller.items.length, 0, "disposed session should not reappear after refresh");
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvbG9jYWxBZ2VudFNlc3Npb25zQ29udHJvbGxlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBMb2NhbEFnZW50c1Nlc3Npb25zQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9sb2NhbEFnZW50U2Vzc2lvbnNDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSwgUmVzcG9uc2VNb2RlbFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNoYXRNb2RlbFRvQ2hhdERldGFpbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZUltcGwuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25TdGF0dXMsIElDaGF0U2Vzc2lvbkl0ZW0sIElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nU2Vzc2lvblN0YXRlLCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0UmVtb3ZhbFJlYXNvbiwgSUNoYXRDaGFuZ2VkUmVxdWVzdEV2ZW50LCBJQ2hhdENoYW5nZUV2ZW50LCBJQ2hhdE1vZGVsLCBJQ2hhdFJlcXVlc3RNb2RlbCwgSUNoYXRSZXNwb25zZU1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBMb2NhbENoYXRTZXNzaW9uVXJpIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL21vY2tDaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2NrQ2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZVRlc3RUaW1pbmcob3B0aW9ucz86IHtcblx0Y3JlYXRlZD86IG51bWJlcjtcblx0bGFzdFJlcXVlc3RTdGFydGVkPzogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRsYXN0UmVxdWVzdEVuZGVkPzogbnVtYmVyIHwgdW5kZWZpbmVkO1xufSk6IElDaGF0U2Vzc2lvbkl0ZW1bJ3RpbWluZyddIHtcblx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0cmV0dXJuIHtcblx0XHRjcmVhdGVkOiBvcHRpb25zPy5jcmVhdGVkID8/IG5vdyxcblx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IG9wdGlvbnM/Lmxhc3RSZXF1ZXN0U3RhcnRlZCxcblx0XHRsYXN0UmVxdWVzdEVuZGVkOiBvcHRpb25zPy5sYXN0UmVxdWVzdEVuZGVkLFxuXHR9O1xufVxuXG5pbnRlcmZhY2UgTW9ja0NoYXRNb2RlbCBleHRlbmRzIElDaGF0TW9kZWwge1xuXHRzZXRDdXN0b21UaXRsZSh0aXRsZTogc3RyaW5nKTogdm9pZDtcblx0c2V0UmVxdWVzdEluUHJvZ3Jlc3MoaW5Qcm9ncmVzczogYm9vbGVhbik6IHZvaWQ7XG5cdGFkZEZpcnN0UmVxdWVzdCgpOiB2b2lkO1xuXHRyZW1vdmVSZXF1ZXN0cygpOiB2b2lkO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrQ2hhdE1vZGVsKG9wdGlvbnM6IHtcblx0c2Vzc2lvblJlc291cmNlOiBVUkk7XG5cdGhhc1JlcXVlc3RzPzogYm9vbGVhbjtcblx0cmVxdWVzdEluUHJvZ3Jlc3M/OiBib29sZWFuO1xuXHR0aW1lc3RhbXA/OiBudW1iZXI7XG5cdGxhc3RSZXNwb25zZUNvbXBsZXRlPzogYm9vbGVhbjtcblx0bGFzdFJlc3BvbnNlQ2FuY2VsZWQ/OiBib29sZWFuO1xuXHRsYXN0UmVzcG9uc2VIYXNFcnJvcj86IGJvb2xlYW47XG5cdGxhc3RSZXNwb25zZVRpbWVzdGFtcD86IG51bWJlcjtcblx0bGFzdFJlc3BvbnNlQ29tcGxldGVkQXQ/OiBudW1iZXI7XG5cdGN1c3RvbVRpdGxlPzogc3RyaW5nO1xuXHRlZGl0aW5nU2Vzc2lvbj86IHtcblx0XHRlbnRyaWVzOiBBcnJheTx7XG5cdFx0XHRzdGF0ZTogTW9kaWZpZWRGaWxlRW50cnlTdGF0ZTtcblx0XHRcdGxpbmVzQWRkZWQ6IG51bWJlcjtcblx0XHRcdGxpbmVzUmVtb3ZlZDogbnVtYmVyO1xuXHRcdFx0bW9kaWZpZWRVUkk6IFVSSTtcblx0XHR9Pjtcblx0fTtcbn0pOiBNb2NrQ2hhdE1vZGVsIHtcblx0Y29uc3QgcmVxdWVzdHM6IElDaGF0UmVxdWVzdE1vZGVsW10gPSBbXTtcblxuXHRjb25zdCBjcmVhdGVSZXF1ZXN0ID0gKCk6IElDaGF0UmVxdWVzdE1vZGVsID0+IHtcblx0XHRjb25zdCBtb2NrUmVzcG9uc2U6IFBhcnRpYWw8SUNoYXRSZXNwb25zZU1vZGVsPiA9IHtcblx0XHRcdGlzQ29tcGxldGU6IG9wdGlvbnMubGFzdFJlc3BvbnNlQ29tcGxldGUgPz8gdHJ1ZSxcblx0XHRcdGlzQ2FuY2VsZWQ6IG9wdGlvbnMubGFzdFJlc3BvbnNlQ2FuY2VsZWQgPz8gZmFsc2UsXG5cdFx0XHRyZXN1bHQ6IG9wdGlvbnMubGFzdFJlc3BvbnNlSGFzRXJyb3IgPyB7IGVycm9yRGV0YWlsczogeyBtZXNzYWdlOiAnZXJyb3InIH0gfSA6IHVuZGVmaW5lZCxcblx0XHRcdHRpbWVzdGFtcDogb3B0aW9ucy5sYXN0UmVzcG9uc2VUaW1lc3RhbXAgPz8gRGF0ZS5ub3coKSxcblx0XHRcdGNvbXBsZXRlZEF0OiBvcHRpb25zLmxhc3RSZXNwb25zZUNvbXBsZXRlZEF0LFxuXHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0dmFsdWU6IFtdLFxuXHRcdFx0XHRnZXRNYXJrZG93bjogKCkgPT4gJycsXG5cdFx0XHRcdGdldEZpbmFsUmVzcG9uc2U6ICgpID0+ICcnLFxuXHRcdFx0XHR0b1N0cmluZzogKCkgPT4gb3B0aW9ucy5jdXN0b21UaXRsZSA/ICcnIDogJ1Rlc3QgcmVzcG9uc2UgY29udGVudCdcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiAncmVxdWVzdC0xJyxcblx0XHRcdHJlc3BvbnNlOiBtb2NrUmVzcG9uc2UgYXMgSUNoYXRSZXNwb25zZU1vZGVsXG5cdFx0fSBhcyBJQ2hhdFJlcXVlc3RNb2RlbDtcblx0fTtcblxuXHRsZXQgaGFzUmVxdWVzdHMgPSBvcHRpb25zLmhhc1JlcXVlc3RzICE9PSBmYWxzZTtcblx0aWYgKGhhc1JlcXVlc3RzKSB7XG5cdFx0cmVxdWVzdHMucHVzaChjcmVhdGVSZXF1ZXN0KCkpO1xuXHR9XG5cblx0Y29uc3QgZWRpdGluZ1Nlc3Npb25FbnRyaWVzID0gb3B0aW9ucy5lZGl0aW5nU2Vzc2lvbj8uZW50cmllcy5tYXAoZW50cnkgPT4gKHtcblx0XHRzdGF0ZTogb2JzZXJ2YWJsZVZhbHVlKCdzdGF0ZScsIGVudHJ5LnN0YXRlKSxcblx0XHRsaW5lc0FkZGVkOiBvYnNlcnZhYmxlVmFsdWUoJ2xpbmVzQWRkZWQnLCBlbnRyeS5saW5lc0FkZGVkKSxcblx0XHRsaW5lc1JlbW92ZWQ6IG9ic2VydmFibGVWYWx1ZSgnbGluZXNSZW1vdmVkJywgZW50cnkubGluZXNSZW1vdmVkKSxcblx0XHRvcmlnaW5hbFVSSTogZW50cnkubW9kaWZpZWRVUkksXG5cdFx0bW9kaWZpZWRVUkk6IGVudHJ5Lm1vZGlmaWVkVVJJLFxuXHR9KSk7XG5cblx0Y29uc3QgbW9ja0VkaXRpbmdTZXNzaW9uID0gb3B0aW9ucy5lZGl0aW5nU2Vzc2lvbiA/IHtcblx0XHRlbnRyaWVzOiBvYnNlcnZhYmxlVmFsdWUoJ2VudHJpZXMnLCBlZGl0aW5nU2Vzc2lvbkVudHJpZXMgPz8gW10pLFxuXHRcdHN0YXRlOiBvYnNlcnZhYmxlVmFsdWUoJ3N0YXRlJywgQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUuSWRsZSlcblx0fSA6IHVuZGVmaW5lZDtcblxuXHRjb25zdCBfb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjxJQ2hhdENoYW5nZUV2ZW50PigpO1xuXG5cdGxldCB0aXRsZSA9IG9wdGlvbnMuY3VzdG9tVGl0bGUgPz8gJ1Rlc3QgQ2hhdCBUaXRsZSc7XG5cdGNvbnN0IHJlcXVlc3RJblByb2dyZXNzID0gb2JzZXJ2YWJsZVZhbHVlKCdyZXF1ZXN0SW5Qcm9ncmVzcycsIG9wdGlvbnMucmVxdWVzdEluUHJvZ3Jlc3MgPz8gZmFsc2UpO1xuXHRyZXR1cm4ge1xuXHRcdGdldCB0aXRsZSgpIHtcblx0XHRcdHJldHVybiB0aXRsZTtcblx0XHR9LFxuXHRcdHNlc3Npb25SZXNvdXJjZTogb3B0aW9ucy5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0Z2V0IGhhc1JlcXVlc3RzKCkge1xuXHRcdFx0cmV0dXJuIGhhc1JlcXVlc3RzO1xuXHRcdH0sXG5cdFx0dGltZXN0YW1wOiBvcHRpb25zLnRpbWVzdGFtcCA/PyBEYXRlLm5vdygpLFxuXHRcdHRpbWluZzogY3JlYXRlVGVzdFRpbWluZyh7IGNyZWF0ZWQ6IG9wdGlvbnMudGltZXN0YW1wIH0pLFxuXHRcdHJlcXVlc3RJblByb2dyZXNzLFxuXHRcdGdldFJlcXVlc3RzOiAoKSA9PiByZXF1ZXN0cyxcblx0XHRvbkRpZENoYW5nZTogX29uRGlkQ2hhbmdlLmV2ZW50LFxuXHRcdGVkaXRpbmdTZXNzaW9uOiBtb2NrRWRpdGluZ1Nlc3Npb24gYXMgSUNoYXRNb2RlbFsnZWRpdGluZ1Nlc3Npb24nXSxcblx0XHRsYXN0UmVxdWVzdE9iczogb2JzZXJ2YWJsZVZhbHVlKCdsYXN0UmVxdWVzdCcsIHVuZGVmaW5lZCksXG5cblx0XHQvLyBNb2NrIGhlbHBlcnNcblx0XHRzZXRDdXN0b21UaXRsZTogKG5ld1RpdGxlOiBzdHJpbmcpID0+IHtcblx0XHRcdHRpdGxlID0gbmV3VGl0bGU7XG5cdFx0XHRfb25EaWRDaGFuZ2UuZmlyZSh7IGtpbmQ6ICdzZXRDdXN0b21UaXRsZScsIHRpdGxlIH0pO1xuXHRcdH0sXG5cdFx0c2V0UmVxdWVzdEluUHJvZ3Jlc3M6IChpblByb2dyZXNzOiBib29sZWFuKSA9PiB7XG5cdFx0XHRpZiAocmVxdWVzdEluUHJvZ3Jlc3MuZ2V0KCkgPT09IGluUHJvZ3Jlc3MpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cmVxdWVzdEluUHJvZ3Jlc3Muc2V0KGluUHJvZ3Jlc3MsIHVuZGVmaW5lZCk7XG5cdFx0XHRfb25EaWRDaGFuZ2UuZmlyZSh7IGtpbmQ6ICdjaGFuZ2VkUmVxdWVzdCcgfSBhcyBJQ2hhdENoYW5nZWRSZXF1ZXN0RXZlbnQpO1xuXHRcdH0sXG5cdFx0YWRkRmlyc3RSZXF1ZXN0OiAoKSA9PiB7XG5cdFx0XHRpZiAoaGFzUmVxdWVzdHMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aGFzUmVxdWVzdHMgPSB0cnVlO1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IGNyZWF0ZVJlcXVlc3QoKTtcblx0XHRcdHJlcXVlc3RzLnB1c2gocmVxdWVzdCk7XG5cdFx0XHRfb25EaWRDaGFuZ2UuZmlyZSh7IGtpbmQ6ICdhZGRSZXF1ZXN0JywgcmVxdWVzdCB9KTtcblx0XHR9LFxuXHRcdHJlbW92ZVJlcXVlc3RzOiAoKSA9PiB7XG5cdFx0XHRpZiAoIWhhc1JlcXVlc3RzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGhhc1JlcXVlc3RzID0gZmFsc2U7XG5cdFx0XHRjb25zdCBbcmVxdWVzdF0gPSByZXF1ZXN0cy5zcGxpY2UoMCwgcmVxdWVzdHMubGVuZ3RoKTtcblx0XHRcdF9vbkRpZENoYW5nZS5maXJlKHsga2luZDogJ3JlbW92ZVJlcXVlc3QnLCByZXF1ZXN0SWQ6IHJlcXVlc3QuaWQsIHJlYXNvbjogQ2hhdFJlcXVlc3RSZW1vdmFsUmVhc29uLlJlbW92YWwgfSk7XG5cdFx0fSxcblx0fSBhcyBQYXJ0aWFsPElDaGF0TW9kZWw+IGFzIE1vY2tDaGF0TW9kZWw7XG59XG5cbnN1aXRlKCdMb2NhbEFnZW50c1Nlc3Npb25zQ29udHJvbGxlcicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBtb2NrQ2hhdFNlcnZpY2U6IE1vY2tDaGF0U2VydmljZTtcblx0bGV0IG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlOiBNb2NrQ2hhdFNlc3Npb25zU2VydmljZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdG1vY2tDaGF0U2VydmljZSA9IG5ldyBNb2NrQ2hhdFNlcnZpY2UoKTtcblx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZSA9IG5ldyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgbW9ja0NoYXRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVDb250cm9sbGVyKCk6IExvY2FsQWdlbnRzU2Vzc2lvbnNDb250cm9sbGVyIHtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsQWdlbnRzU2Vzc2lvbnNDb250cm9sbGVyKSk7XG5cdH1cblxuXHR0ZXN0KCdzaG91bGQgaGF2ZSBjb3JyZWN0IHNlc3Npb24gdHlwZScsICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLmNoYXRTZXNzaW9uVHlwZSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmVnaXN0ZXIgaXRzZWxmIHdpdGggY2hhdCBzZXNzaW9ucyBzZXJ2aWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKCk7XG5cblx0XHRjb25zdCBjb250cm9sbGVyUmVzdWx0czogeyByZWFkb25seSBjaGF0U2Vzc2lvblR5cGU6IHN0cmluZzsgcmVhZG9ubHkgaXRlbXM6IHJlYWRvbmx5IElDaGF0U2Vzc2lvbkl0ZW1bXSB9W10gPSBbXTtcblx0XHRmb3IgYXdhaXQgKGNvbnN0IHJlc3VsdCBvZiBtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0U2Vzc2lvbkl0ZW1zKHVuZGVmaW5lZCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpIHtcblx0XHRcdGNvbnRyb2xsZXJSZXN1bHRzLnB1c2gocmVzdWx0KTtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXJSZXN1bHRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXJSZXN1bHRzWzBdLmNoYXRTZXNzaW9uVHlwZSwgY29udHJvbGxlci5jaGF0U2Vzc2lvblR5cGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcHJvdmlkZSBlbXB0eSBzZXNzaW9ucyB3aGVuIG5vIGxpdmUgb3IgaGlzdG9yeSBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXG5cdFx0XHRtb2NrQ2hhdFNlcnZpY2Uuc2V0TGl2ZVNlc3Npb25JdGVtcyhbXSk7XG5cdFx0XHRtb2NrQ2hhdFNlcnZpY2Uuc2V0SGlzdG9yeVNlc3Npb25JdGVtcyhbXSk7XG5cblx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gY29udHJvbGxlci5pdGVtcztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcHJvdmlkZSBsaXZlIHNlc3Npb24gaXRlbXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCd0ZXN0LXNlc3Npb24nKTtcblx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tDaGF0TW9kZWwoe1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdGhhc1JlcXVlc3RzOiB0cnVlLFxuXHRcdFx0XHR0aW1lc3RhbXA6IERhdGUubm93KClcblx0XHRcdH0pO1xuXG5cdFx0XHRtb2NrQ2hhdFNlcnZpY2UuYWRkU2Vzc2lvbihtb2NrTW9kZWwpO1xuXHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW3tcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHR0aXRsZTogJ1Rlc3QgU2Vzc2lvbicsXG5cdFx0XHRcdGxhc3RNZXNzYWdlRGF0ZTogRGF0ZS5ub3coKSxcblx0XHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHRcdHRpbWluZzogY3JlYXRlVGVzdFRpbWluZygpLFxuXHRcdFx0XHRsYXN0UmVzcG9uc2VTdGF0ZTogUmVzcG9uc2VNb2RlbFN0YXRlLkNvbXBsZXRlXG5cdFx0XHR9XSk7XG5cblx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gY29udHJvbGxlci5pdGVtcztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLmxhYmVsLCAnVGVzdCBTZXNzaW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0ucmVzb3VyY2UudG9TdHJpbmcoKSwgc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcHJvdmlkZSBoaXN0b3J5IHNlc3Npb24gaXRlbXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdoaXN0b3J5LXNlc3Npb24nKTtcblxuXHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW10pO1xuXHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldEhpc3RvcnlTZXNzaW9uSXRlbXMoW3tcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHR0aXRsZTogJ0hpc3RvcnkgU2Vzc2lvbicsXG5cdFx0XHRcdGxhc3RNZXNzYWdlRGF0ZTogRGF0ZS5ub3coKSAtIDEwMDAwLFxuXHRcdFx0XHRpc0FjdGl2ZTogZmFsc2UsXG5cdFx0XHRcdGxhc3RSZXNwb25zZVN0YXRlOiBSZXNwb25zZU1vZGVsU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdHRpbWluZzogY3JlYXRlVGVzdFRpbWluZygpXG5cdFx0XHR9XSk7XG5cblx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gY29udHJvbGxlci5pdGVtcztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLmxhYmVsLCAnSGlzdG9yeSBTZXNzaW9uJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBub3QgZHVwbGljYXRlIHNlc3Npb25zIGluIGhpc3RvcnkgYW5kIGxpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdkdXBsaWNhdGUtc2Vzc2lvbicpO1xuXHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja0NoYXRNb2RlbCh7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0aGFzUmVxdWVzdHM6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRtb2NrQ2hhdFNlcnZpY2UuYWRkU2Vzc2lvbihtb2NrTW9kZWwpO1xuXHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW3tcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHR0aXRsZTogJ0xpdmUgU2Vzc2lvbicsXG5cdFx0XHRcdGxhc3RNZXNzYWdlRGF0ZTogRGF0ZS5ub3coKSxcblx0XHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHRcdGxhc3RSZXNwb25zZVN0YXRlOiBSZXNwb25zZU1vZGVsU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdHRpbWluZzogY3JlYXRlVGVzdFRpbWluZygpXG5cdFx0XHR9XSk7XG5cdFx0XHRtb2NrQ2hhdFNlcnZpY2Uuc2V0SGlzdG9yeVNlc3Npb25JdGVtcyhbe1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdHRpdGxlOiAnSGlzdG9yeSBTZXNzaW9uJyxcblx0XHRcdFx0bGFzdE1lc3NhZ2VEYXRlOiBEYXRlLm5vdygpIC0gMTAwMDAsXG5cdFx0XHRcdGlzQWN0aXZlOiBmYWxzZSxcblx0XHRcdFx0bGFzdFJlc3BvbnNlU3RhdGU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0dGltaW5nOiBjcmVhdGVUZXN0VGltaW5nKClcblx0XHRcdH1dKTtcblxuXHRcdFx0YXdhaXQgY29udHJvbGxlci5yZWZyZXNoKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBjb250cm9sbGVyLml0ZW1zO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0ubGFiZWwsICdMaXZlIFNlc3Npb24nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1Nlc3Npb24gU3RhdHVzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gSW5Qcm9ncmVzcyBzdGF0dXMgd2hlbiByZXF1ZXN0IGluIHByb2dyZXNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignaW4tcHJvZ3Jlc3Mtc2Vzc2lvbicpO1xuXHRcdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrQ2hhdE1vZGVsKHtcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0aGFzUmVxdWVzdHM6IHRydWUsXG5cdFx0XHRcdFx0cmVxdWVzdEluUHJvZ3Jlc3M6IHRydWVcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9ja01vZGVsKTtcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW3tcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0dGl0bGU6ICdJbiBQcm9ncmVzcyBTZXNzaW9uJyxcblx0XHRcdFx0XHRsYXN0TWVzc2FnZURhdGU6IERhdGUubm93KCksXG5cdFx0XHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHRcdFx0bGFzdFJlc3BvbnNlU3RhdGU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0XHR0aW1pbmc6IGNyZWF0ZVRlc3RUaW1pbmcoKVxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0YXdhaXQgY29udHJvbGxlci5yZWZyZXNoKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9ucyA9IGNvbnRyb2xsZXIuaXRlbXM7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0uc3RhdHVzLCBDaGF0U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBDb21wbGV0ZWQgc3RhdHVzIHdoZW4gbGFzdCByZXNwb25zZSBpcyBjb21wbGV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ2NvbXBsZXRlZC1zZXNzaW9uJyk7XG5cdFx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tDaGF0TW9kZWwoe1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRoYXNSZXF1ZXN0czogdHJ1ZSxcblx0XHRcdFx0XHRyZXF1ZXN0SW5Qcm9ncmVzczogZmFsc2UsXG5cdFx0XHRcdFx0bGFzdFJlc3BvbnNlQ29tcGxldGU6IHRydWUsXG5cdFx0XHRcdFx0bGFzdFJlc3BvbnNlQ2FuY2VsZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGxhc3RSZXNwb25zZUhhc0Vycm9yOiBmYWxzZVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2UuYWRkU2Vzc2lvbihtb2NrTW9kZWwpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2Uuc2V0TGl2ZVNlc3Npb25JdGVtcyhbe1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHR0aXRsZTogJ0NvbXBsZXRlZCBTZXNzaW9uJyxcblx0XHRcdFx0XHRsYXN0TWVzc2FnZURhdGU6IERhdGUubm93KCksXG5cdFx0XHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHRcdFx0bGFzdFJlc3BvbnNlU3RhdGU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0XHR0aW1pbmc6IGNyZWF0ZVRlc3RUaW1pbmcoKSxcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBjb250cm9sbGVyLml0ZW1zO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLnN0YXR1cywgQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBTdWNjZXNzIHN0YXR1cyB3aGVuIGxhc3QgcmVzcG9uc2Ugd2FzIGNhbmNlbGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignY2FuY2VsZWQtc2Vzc2lvbicpO1xuXHRcdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrQ2hhdE1vZGVsKHtcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0aGFzUmVxdWVzdHM6IHRydWUsXG5cdFx0XHRcdFx0cmVxdWVzdEluUHJvZ3Jlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdGxhc3RSZXNwb25zZUNvbXBsZXRlOiBmYWxzZSxcblx0XHRcdFx0XHRsYXN0UmVzcG9uc2VDYW5jZWxlZDogdHJ1ZVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2UuYWRkU2Vzc2lvbihtb2NrTW9kZWwpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2Uuc2V0TGl2ZVNlc3Npb25JdGVtcyhbe1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHR0aXRsZTogJ0NhbmNlbGVkIFNlc3Npb24nLFxuXHRcdFx0XHRcdGxhc3RNZXNzYWdlRGF0ZTogRGF0ZS5ub3coKSxcblx0XHRcdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0XHRsYXN0UmVzcG9uc2VTdGF0ZTogUmVzcG9uc2VNb2RlbFN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0XHRcdHRpbWluZzogY3JlYXRlVGVzdFRpbWluZygpLFxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0YXdhaXQgY29udHJvbGxlci5yZWZyZXNoKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9ucyA9IGNvbnRyb2xsZXIuaXRlbXM7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0uc3RhdHVzLCBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIEZhaWxlZCBzdGF0dXMgd2hlbiBsYXN0IHJlc3BvbnNlIGhhcyBlcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ2Vycm9yLXNlc3Npb24nKTtcblx0XHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja0NoYXRNb2RlbCh7XG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdGhhc1JlcXVlc3RzOiB0cnVlLFxuXHRcdFx0XHRcdHJlcXVlc3RJblByb2dyZXNzOiBmYWxzZSxcblx0XHRcdFx0XHRsYXN0UmVzcG9uc2VDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdFx0XHRsYXN0UmVzcG9uc2VIYXNFcnJvcjogdHJ1ZVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2UuYWRkU2Vzc2lvbihtb2NrTW9kZWwpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2Uuc2V0TGl2ZVNlc3Npb25JdGVtcyhbe1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHR0aXRsZTogJ0Vycm9yIFNlc3Npb24nLFxuXHRcdFx0XHRcdGxhc3RNZXNzYWdlRGF0ZTogRGF0ZS5ub3coKSxcblx0XHRcdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0XHRsYXN0UmVzcG9uc2VTdGF0ZTogUmVzcG9uc2VNb2RlbFN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0XHRcdHRpbWluZzogY3JlYXRlVGVzdFRpbWluZygpLFxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0YXdhaXQgY29udHJvbGxlci5yZWZyZXNoKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9ucyA9IGNvbnRyb2xsZXIuaXRlbXM7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0uc3RhdHVzLCBDaGF0U2Vzc2lvblN0YXR1cy5GYWlsZWQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdTZXNzaW9uIFN0YXRpc3RpY3MnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBzdGF0aXN0aWNzIGZvciBzZXNzaW9ucyB3aXRoIG1vZGlmaWVkIGVudHJpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdzdGF0cy1zZXNzaW9uJyk7XG5cdFx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tDaGF0TW9kZWwoe1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRoYXNSZXF1ZXN0czogdHJ1ZSxcblx0XHRcdFx0XHRlZGl0aW5nU2Vzc2lvbjoge1xuXHRcdFx0XHRcdFx0ZW50cmllczogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0c3RhdGU6IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQsXG5cdFx0XHRcdFx0XHRcdFx0bGluZXNBZGRlZDogMTAsXG5cdFx0XHRcdFx0XHRcdFx0bGluZXNSZW1vdmVkOiA1LFxuXHRcdFx0XHRcdFx0XHRcdG1vZGlmaWVkVVJJOiBVUkkuZmlsZSgnL3Rlc3QvZmlsZTEudHMnKVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0c3RhdGU6IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQsXG5cdFx0XHRcdFx0XHRcdFx0bGluZXNBZGRlZDogMjAsXG5cdFx0XHRcdFx0XHRcdFx0bGluZXNSZW1vdmVkOiAzLFxuXHRcdFx0XHRcdFx0XHRcdG1vZGlmaWVkVVJJOiBVUkkuZmlsZSgnL3Rlc3QvZmlsZTIudHMnKVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2UuYWRkU2Vzc2lvbihtb2NrTW9kZWwpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2Uuc2V0TGl2ZVNlc3Npb25JdGVtcyhbe1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHR0aXRsZTogJ1N0YXRzIFNlc3Npb24nLFxuXHRcdFx0XHRcdGxhc3RNZXNzYWdlRGF0ZTogRGF0ZS5ub3coKSxcblx0XHRcdFx0XHRpc0FjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0XHRsYXN0UmVzcG9uc2VTdGF0ZTogUmVzcG9uc2VNb2RlbFN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0XHRcdHRpbWluZzogY3JlYXRlVGVzdFRpbWluZygpLFxuXHRcdFx0XHRcdHN0YXRzOiB7XG5cdFx0XHRcdFx0XHRhZGRlZDogMzAsXG5cdFx0XHRcdFx0XHRyZW1vdmVkOiA4LFxuXHRcdFx0XHRcdFx0ZmlsZUNvdW50OiAyXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0YXdhaXQgY29udHJvbGxlci5yZWZyZXNoKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9ucyA9IGNvbnRyb2xsZXIuaXRlbXM7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQub2soc2Vzc2lvbnNbMF0uY2hhbmdlcyk7XG5cdFx0XHRcdGNvbnN0IGNoYW5nZXMgPSBzZXNzaW9uc1swXS5jaGFuZ2VzIGFzIHsgZmlsZXM6IG51bWJlcjsgaW5zZXJ0aW9uczogbnVtYmVyOyBkZWxldGlvbnM6IG51bWJlciB9O1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlcy5maWxlcywgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VzLmluc2VydGlvbnMsIDMwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXMuZGVsZXRpb25zLCA4KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCByZXR1cm4gc3RhdGlzdGljcyBmb3Igc2Vzc2lvbnMgd2l0aG91dCBtb2RpZmllZCBlbnRyaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignbm8tc3RhdHMtc2Vzc2lvbicpO1xuXHRcdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrQ2hhdE1vZGVsKHtcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0aGFzUmVxdWVzdHM6IHRydWUsXG5cdFx0XHRcdFx0ZWRpdGluZ1Nlc3Npb246IHtcblx0XHRcdFx0XHRcdGVudHJpZXM6IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHN0YXRlOiBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLkFjY2VwdGVkLFxuXHRcdFx0XHRcdFx0XHRcdGxpbmVzQWRkZWQ6IDEwLFxuXHRcdFx0XHRcdFx0XHRcdGxpbmVzUmVtb3ZlZDogNSxcblx0XHRcdFx0XHRcdFx0XHRtb2RpZmllZFVSSTogVVJJLmZpbGUoJy90ZXN0L2ZpbGUxLnRzJylcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9ja01vZGVsKTtcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW3tcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0dGl0bGU6ICdObyBTdGF0cyBTZXNzaW9uJyxcblx0XHRcdFx0XHRsYXN0TWVzc2FnZURhdGU6IERhdGUubm93KCksXG5cdFx0XHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHRcdFx0bGFzdFJlc3BvbnNlU3RhdGU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0XHR0aW1pbmc6IGNyZWF0ZVRlc3RUaW1pbmcoKVxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0YXdhaXQgY29udHJvbGxlci5yZWZyZXNoKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9ucyA9IGNvbnRyb2xsZXIuaXRlbXM7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0uY2hhbmdlcywgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnU2Vzc2lvbiBUaW1pbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBtb2RlbCB0aW1lc3RhbXAgZm9yIGNyZWF0ZWQgd2hlbiBtb2RlbCBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCd0aW1pbmctc2Vzc2lvbicpO1xuXHRcdFx0XHRjb25zdCBtb2RlbFRpbWVzdGFtcCA9IERhdGUubm93KCkgLSA1MDAwO1xuXHRcdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrQ2hhdE1vZGVsKHtcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0aGFzUmVxdWVzdHM6IHRydWUsXG5cdFx0XHRcdFx0dGltZXN0YW1wOiBtb2RlbFRpbWVzdGFtcFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2UuYWRkU2Vzc2lvbihtb2NrTW9kZWwpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2Uuc2V0TGl2ZVNlc3Npb25JdGVtcyhbe1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHR0aXRsZTogJ1RpbWluZyBTZXNzaW9uJyxcblx0XHRcdFx0XHRsYXN0TWVzc2FnZURhdGU6IERhdGUubm93KCksXG5cdFx0XHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHRcdFx0bGFzdFJlc3BvbnNlU3RhdGU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0XHR0aW1pbmc6IGNyZWF0ZVRlc3RUaW1pbmcoeyBjcmVhdGVkOiBtb2RlbFRpbWVzdGFtcCB9KVxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0YXdhaXQgY29udHJvbGxlci5yZWZyZXNoKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9ucyA9IGNvbnRyb2xsZXIuaXRlbXM7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0udGltaW5nLmNyZWF0ZWQsIG1vZGVsVGltZXN0YW1wKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBsYXN0TWVzc2FnZURhdGUgZm9yIGNyZWF0ZWQgd2hlbiBtb2RlbCBkb2VzIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ2hpc3RvcnktdGltaW5nJyk7XG5cdFx0XHRcdGNvbnN0IGxhc3RNZXNzYWdlRGF0ZSA9IERhdGUubm93KCkgLSAxMDAwMDtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2Uuc2V0TGl2ZVNlc3Npb25JdGVtcyhbXSk7XG5cdFx0XHRcdG1vY2tDaGF0U2VydmljZS5zZXRIaXN0b3J5U2Vzc2lvbkl0ZW1zKFt7XG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdHRpdGxlOiAnSGlzdG9yeSBUaW1pbmcgU2Vzc2lvbicsXG5cdFx0XHRcdFx0bGFzdE1lc3NhZ2VEYXRlLFxuXHRcdFx0XHRcdGlzQWN0aXZlOiBmYWxzZSxcblx0XHRcdFx0XHRsYXN0UmVzcG9uc2VTdGF0ZTogUmVzcG9uc2VNb2RlbFN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0XHRcdHRpbWluZzogY3JlYXRlVGVzdFRpbWluZyh7IGNyZWF0ZWQ6IGxhc3RNZXNzYWdlRGF0ZSB9KVxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0YXdhaXQgY29udHJvbGxlci5yZWZyZXNoKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9ucyA9IGNvbnRyb2xsZXIuaXRlbXM7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0udGltaW5nLmNyZWF0ZWQsIGxhc3RNZXNzYWdlRGF0ZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzZXQgbGFzdFJlcXVlc3RFbmRlZCBmcm9tIGxhc3QgcmVzcG9uc2UgY29tcGxldGVkQXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdlbmR0aW1lLXNlc3Npb24nKTtcblx0XHRcdFx0Y29uc3QgY29tcGxldGVkQXQgPSBEYXRlLm5vdygpIC0gMTAwMDtcblx0XHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja0NoYXRNb2RlbCh7XG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdGhhc1JlcXVlc3RzOiB0cnVlLFxuXHRcdFx0XHRcdGxhc3RSZXNwb25zZUNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHRcdGxhc3RSZXNwb25zZUNvbXBsZXRlZEF0OiBjb21wbGV0ZWRBdFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2UuYWRkU2Vzc2lvbihtb2NrTW9kZWwpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2Uuc2V0TGl2ZVNlc3Npb25JdGVtcyhbe1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHR0aXRsZTogJ0VuZFRpbWUgU2Vzc2lvbicsXG5cdFx0XHRcdFx0bGFzdE1lc3NhZ2VEYXRlOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRcdGxhc3RSZXNwb25zZVN0YXRlOiBSZXNwb25zZU1vZGVsU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdFx0dGltaW5nOiBjcmVhdGVUZXN0VGltaW5nKHsgbGFzdFJlcXVlc3RFbmRlZDogY29tcGxldGVkQXQgfSlcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBjb250cm9sbGVyLml0ZW1zO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLnRpbWluZy5sYXN0UmVxdWVzdEVuZGVkLCBjb21wbGV0ZWRBdCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0V2ZW50cycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZmlyZSBvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMgd2hlbiBtb2RlbCBwcm9ncmVzcyBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbigncHJvZ3Jlc3Mtc2Vzc2lvbicpO1xuXHRcdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrQ2hhdE1vZGVsKHtcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0aGFzUmVxdWVzdHM6IHRydWUsXG5cdFx0XHRcdFx0cmVxdWVzdEluUHJvZ3Jlc3M6IGZhbHNlXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIEFkZCB0aGUgc2Vzc2lvbiBmaXJzdFxuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2UuYWRkU2Vzc2lvbihtb2NrTW9kZWwpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2Uuc2V0TGl2ZVNlc3Npb25JdGVtcyhbYXdhaXQgY2hhdE1vZGVsVG9DaGF0RGV0YWlsKG1vY2tNb2RlbCldKTtcblxuXHRcdFx0XHQvLyBGbHVzaCB0aGUgaW5pdGlhbCBhZGQvcmVjb25jaWxlIGNodXJuIGZyb20gc2Vzc2lvbiBjcmVhdGlvbi5cblx0XHRcdFx0YXdhaXQgY29udHJvbGxlci5yZWZyZXNoKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRcdGxldCBjaGFuZ2VFdmVudENvdW50ID0gMDtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbnRyb2xsZXIub25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zKCgpID0+IHtcblx0XHRcdFx0XHRjaGFuZ2VFdmVudENvdW50Kys7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRjb25zdCBvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMgPSBFdmVudC50b1Byb21pc2UoY29udHJvbGxlci5vbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMpO1xuXG5cdFx0XHRcdC8vIFNpbXVsYXRlIGEgcmVhbCBwcm9ncmVzcyBjaGFuZ2UgYnkgdG9nZ2xpbmcgdGhlIGluLXByb2dyZXNzIHN0YXRlLlxuXHRcdFx0XHRtb2NrTW9kZWwuc2V0UmVxdWVzdEluUHJvZ3Jlc3ModHJ1ZSk7XG5cdFx0XHRcdGF3YWl0IG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcztcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlRXZlbnRDb3VudCwgMSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmaXJlIG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcyB3aGVuIG1vZGVsIHJlcXVlc3Qgc3RhdHVzIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlQ29udHJvbGxlcigpKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3N0YXR1cy1jaGFuZ2Utc2Vzc2lvbicpO1xuXHRcdFx0XHRjb25zdCBtb2NrTW9kZWwgPSBjcmVhdGVNb2NrQ2hhdE1vZGVsKHtcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0aGFzUmVxdWVzdHM6IHRydWUsXG5cdFx0XHRcdFx0cmVxdWVzdEluUHJvZ3Jlc3M6IGZhbHNlXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIEFkZCB0aGUgc2Vzc2lvbiBmaXJzdFxuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2UuYWRkU2Vzc2lvbihtb2NrTW9kZWwpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2Uuc2V0TGl2ZVNlc3Npb25JdGVtcyhbYXdhaXQgY2hhdE1vZGVsVG9DaGF0RGV0YWlsKG1vY2tNb2RlbCldKTtcblxuXHRcdFx0XHRsZXQgY2hhbmdlRXZlbnRDb3VudCA9IDA7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChjb250cm9sbGVyLm9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcygoKSA9PiB7XG5cdFx0XHRcdFx0Y2hhbmdlRXZlbnRDb3VudCsrO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUV2ZW50Q291bnQsIDEpOyAvLyAxIGZyb20gcmVmcmVzaCBkZXRlY3RpbmcgdGhlIG5ldyBzZXNzaW9uXG5cblx0XHRcdFx0Y29uc3Qgb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zID0gRXZlbnQudG9Qcm9taXNlKGNvbnRyb2xsZXIub25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zKTtcblxuXHRcdFx0XHRtb2NrTW9kZWwuc2V0UmVxdWVzdEluUHJvZ3Jlc3ModHJ1ZSk7XG5cblx0XHRcdFx0YXdhaXQgb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlRXZlbnRDb3VudCwgMik7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmaXJlIG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcyB3aGVuIHJlZnJlc2ggZGlzY292ZXJzIG5ldyBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UxID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdzZXNzaW9uLTEnKTtcblx0XHRcdFx0Y29uc3QgbW9ja01vZGVsMSA9IGNyZWF0ZU1vY2tDaGF0TW9kZWwoeyBzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZTEsIGhhc1JlcXVlc3RzOiB0cnVlIH0pO1xuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2UuYWRkU2Vzc2lvbihtb2NrTW9kZWwxKTtcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW2F3YWl0IGNoYXRNb2RlbFRvQ2hhdERldGFpbChtb2NrTW9kZWwxKV0pO1xuXG5cdFx0XHRcdC8vIEluaXRpYWwgcmVmcmVzaCBwb3B1bGF0ZXMgX2l0ZW1zXG5cdFx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuaXRlbXMubGVuZ3RoLCAxKTtcblxuXHRcdFx0XHQvLyBTaW11bGF0ZSBhIGZvcmtlZCBzZXNzaW9uIGFwcGVhcmluZyAobmV3IG1vZGVsIGFkZGVkLCBsaXZlIGl0ZW1zIHVwZGF0ZWQpXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZTIgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ3Nlc3Npb24tMi1mb3JrZWQnKTtcblx0XHRcdFx0Y29uc3QgbW9ja01vZGVsMiA9IGNyZWF0ZU1vY2tDaGF0TW9kZWwoeyBzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZTIsIGhhc1JlcXVlc3RzOiB0cnVlLCBjdXN0b21UaXRsZTogJ0ZvcmtlZDogVGVzdCBDaGF0IFRpdGxlJyB9KTtcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9ja01vZGVsMik7XG5cdFx0XHRcdG1vY2tDaGF0U2VydmljZS5zZXRMaXZlU2Vzc2lvbkl0ZW1zKFtcblx0XHRcdFx0XHRhd2FpdCBjaGF0TW9kZWxUb0NoYXREZXRhaWwobW9ja01vZGVsMSksXG5cdFx0XHRcdFx0YXdhaXQgY2hhdE1vZGVsVG9DaGF0RGV0YWlsKG1vY2tNb2RlbDIpLFxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHRjb25zdCBmaXJlZDogeyBhZGRlZE9yVXBkYXRlZD86IHJlYWRvbmx5IElDaGF0U2Vzc2lvbkl0ZW1bXTsgcmVtb3ZlZD86IHJlYWRvbmx5IFVSSVtdIH1bXSA9IFtdO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoY29udHJvbGxlci5vbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMoZGVsdGEgPT4gZmlyZWQucHVzaChkZWx0YSkpKTtcblxuXHRcdFx0XHRhd2FpdCBjb250cm9sbGVyLnJlZnJlc2goQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuaXRlbXMubGVuZ3RoLCAyKTtcblx0XHRcdFx0Ly8gVGhlIGV2ZW50IG11c3QgaGF2ZSBmaXJlZCB3aXRoIHRoZSBuZXcgKGZvcmtlZCkgc2Vzc2lvblxuXHRcdFx0XHRjb25zdCBhZGRlZFJlc291cmNlcyA9IGZpcmVkLmZsYXRNYXAoZCA9PiBkLmFkZGVkT3JVcGRhdGVkID8/IFtdKS5tYXAoaSA9PiBpLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRhc3NlcnQub2soYWRkZWRSZXNvdXJjZXMuaW5jbHVkZXMoc2Vzc2lvblJlc291cmNlMi50b1N0cmluZygpKSwgJ2ZvcmtlZCBzZXNzaW9uIHNob3VsZCBhcHBlYXIgaW4gYWRkZWRPclVwZGF0ZWQnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFhZGRlZFJlc291cmNlcy5pbmNsdWRlcyhzZXNzaW9uUmVzb3VyY2UxLnRvU3RyaW5nKCkpLCAnZXhpc3Rpbmcgc2Vzc2lvbiBzaG91bGQgbm90IGFwcGVhciBpbiBhZGRlZE9yVXBkYXRlZCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYWRkIGEgbmV3bHkgc3RhcnRlZCBzZXNzaW9uIG9uY2UgaXQgZ2V0cyBpdHMgZmlyc3QgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ25ldy1zZXNzaW9uJyk7XG5cdFx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tDaGF0TW9kZWwoe1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRoYXNSZXF1ZXN0czogZmFsc2Vcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgZmlyZWQ6IHsgYWRkZWRPclVwZGF0ZWQ/OiByZWFkb25seSBJQ2hhdFNlc3Npb25JdGVtW107IHJlbW92ZWQ/OiByZWFkb25seSBVUklbXSB9W10gPSBbXTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbnRyb2xsZXIub25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zKGRlbHRhID0+IGZpcmVkLnB1c2goZGVsdGEpKSk7XG5cblx0XHRcdFx0Ly8gQSBicmFuZCBuZXcgc2Vzc2lvbiBpcyBjcmVhdGVkIHdpdGhvdXQgYW55IHJlcXVlc3RzIHlldC5cblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9ja01vZGVsKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuaXRlbXMubGVuZ3RoLCAwLCAnc2Vzc2lvbiB3aXRob3V0IHJlcXVlc3RzIHNob3VsZCBub3QgYmUgbGlzdGVkIHlldCcpO1xuXG5cdFx0XHRcdC8vIFRoZSB1c2VyIHNlbmRzIHRoZSBmaXJzdCBtZXNzYWdlLCBzbyB0aGUgc2Vzc2lvbiBub3cgcXVhbGlmaWVzIGFzIGEgbGlzdCBpdGVtLlxuXHRcdFx0XHRtb2NrTW9kZWwuYWRkRmlyc3RSZXF1ZXN0KCk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuaXRlbXMubGVuZ3RoLCAxLCAnc2Vzc2lvbiBzaG91bGQgYXBwZWFyIGFzIHNvb24gYXMgaXQgaGFzIGEgcmVxdWVzdCcpO1xuXHRcdFx0XHRjb25zdCBhZGRlZFJlc291cmNlcyA9IGZpcmVkLmZsYXRNYXAoZCA9PiBkLmFkZGVkT3JVcGRhdGVkID8/IFtdKS5tYXAoaSA9PiBpLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRhc3NlcnQub2soYWRkZWRSZXNvdXJjZXMuaW5jbHVkZXMoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpLCAnbmV3IHNlc3Npb24gc2hvdWxkIGFwcGVhciBpbiBhZGRlZE9yVXBkYXRlZCB3aXRob3V0IGEgbWFudWFsIHJlZnJlc2gnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlbW92ZSBhIGxpc3RlZCBzZXNzaW9uIG9uY2UgaXRzIHJlcXVlc3RzIGFyZSByZW1vdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignZW1wdGllZC1zZXNzaW9uJyk7XG5cdFx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tDaGF0TW9kZWwoe1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRoYXNSZXF1ZXN0czogdHJ1ZVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2UuYWRkU2Vzc2lvbihtb2NrTW9kZWwpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2Uuc2V0TGl2ZVNlc3Npb25JdGVtcyhbYXdhaXQgY2hhdE1vZGVsVG9DaGF0RGV0YWlsKG1vY2tNb2RlbCldKTtcblx0XHRcdFx0YXdhaXQgY29udHJvbGxlci5yZWZyZXNoKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5pdGVtcy5sZW5ndGgsIDEpO1xuXG5cdFx0XHRcdGNvbnN0IHJlbW92ZWRSZXNvdXJjZXM6IFVSSVtdID0gW107XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChjb250cm9sbGVyLm9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcyhkZWx0YSA9PiB7XG5cdFx0XHRcdFx0aWYgKGRlbHRhLnJlbW92ZWQpIHtcblx0XHRcdFx0XHRcdHJlbW92ZWRSZXNvdXJjZXMucHVzaCguLi5kZWx0YS5yZW1vdmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBBbGwgcmVxdWVzdHMgYXJlIHJlbW92ZWQsIHNvIHRoZSBzZXNzaW9uIG5vIGxvbmdlciBxdWFsaWZpZXMgYXMgYSBsaXN0IGl0ZW0uXG5cdFx0XHRcdG1vY2tNb2RlbC5yZW1vdmVSZXF1ZXN0cygpO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLml0ZW1zLmxlbmd0aCwgMCwgJ3Nlc3Npb24gc2hvdWxkIGJlIGRyb3BwZWQgb25jZSBpdCBoYXMgbm8gcmVxdWVzdHMnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlbW92ZWRSZXNvdXJjZXMuc29tZShyID0+IHIudG9TdHJpbmcoKSA9PT0gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpLCAnZW1wdGllZCBzZXNzaW9uIHNob3VsZCBiZSByZW1vdmVkIHdpdGhvdXQgYSBtYW51YWwgcmVmcmVzaCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgY2xlYW4gdXAgbW9kZWwgbGlzdGVuZXJzIHdoZW4gbW9kZWwgaXMgcmVtb3ZlZCB2aWEgY2hhdE1vZGVscyBvYnNlcnZhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignY2xlYW51cC1zZXNzaW9uJyk7XG5cdFx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tDaGF0TW9kZWwoe1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRoYXNSZXF1ZXN0czogdHJ1ZVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBBZGQgdGhlIHNlc3Npb24gZmlyc3Rcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9ja01vZGVsKTtcblxuXHRcdFx0XHQvLyBOb3cgcmVtb3ZlIHRoZSBzZXNzaW9uIC0gdGhlIG9ic2VydmFibGUgc2hvdWxkIHRyaWdnZXIgY2xlYW51cFxuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2UucmVtb3ZlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0XHRcdC8vIFZlcmlmeSB0aGUgbGlzdGVuZXIgd2FzIGNsZWFuZWQgdXAgYnkgdHJpZ2dlcmluZyBhIHRpdGxlIGNoYW5nZVxuXHRcdFx0XHQvLyBUaGUgb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zIGZyb20gcmVnaXN0ZXJNb2RlbExpc3RlbmVycyBjbGVhbnVwIHNob3VsZCBmaXJlIG9uY2Vcblx0XHRcdFx0Ly8gYnV0IGFmdGVyIHRoYXQsIHRpdGxlIGNoYW5nZXMgc2hvdWxkIE5PVCBmaXJlIG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtc1xuXHRcdFx0XHRsZXQgY2hhbmdlRXZlbnRDb3VudCA9IDA7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChjb250cm9sbGVyLm9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcygoKSA9PiB7XG5cdFx0XHRcdFx0Y2hhbmdlRXZlbnRDb3VudCsrO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0bW9ja01vZGVsLnNldEN1c3RvbVRpdGxlKCdOZXcgVGl0bGUnKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlRXZlbnRDb3VudCwgMCwgJ29uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcyBzaG91bGQgTk9UIGZpcmUgYWZ0ZXIgbW9kZWwgaXMgcmVtb3ZlZCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVtb3ZlIHNlc3Npb24gZnJvbSBpdGVtcyBhbmQgZmlyZSByZW1vdmVkIGV2ZW50IG9uIG9uRGlkRGlzcG9zZVNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCdkaXNwb3NlLXNlc3Npb24nKTtcblx0XHRcdFx0Y29uc3QgbW9ja01vZGVsID0gY3JlYXRlTW9ja0NoYXRNb2RlbCh7XG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdGhhc1JlcXVlc3RzOiB0cnVlXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIEFkZCB0aGUgc2Vzc2lvbiBhbmQgcG9wdWxhdGUgaXRlbXNcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLmFkZFNlc3Npb24obW9ja01vZGVsKTtcblx0XHRcdFx0bW9ja0NoYXRTZXJ2aWNlLnNldExpdmVTZXNzaW9uSXRlbXMoW2F3YWl0IGNoYXRNb2RlbFRvQ2hhdERldGFpbChtb2NrTW9kZWwpXSk7XG5cdFx0XHRcdGF3YWl0IGNvbnRyb2xsZXIucmVmcmVzaChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuaXRlbXMubGVuZ3RoLCAxKTtcblxuXHRcdFx0XHQvLyBMaXN0ZW4gZm9yIHRoZSByZW1vdmVkIGV2ZW50XG5cdFx0XHRcdGNvbnN0IHJlbW92ZWRSZXNvdXJjZXM6IFVSSVtdID0gW107XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChjb250cm9sbGVyLm9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcyhkZWx0YSA9PiB7XG5cdFx0XHRcdFx0aWYgKGRlbHRhLnJlbW92ZWQpIHtcblx0XHRcdFx0XHRcdHJlbW92ZWRSZXNvdXJjZXMucHVzaCguLi5kZWx0YS5yZW1vdmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBGaXJlIG9uRGlkRGlzcG9zZVNlc3Npb24gKHNpbXVsYXRlcyByZW1vdmVIaXN0b3J5RW50cnkpXG5cdFx0XHRcdG1vY2tDaGF0U2VydmljZS5maXJlRGlkRGlzcG9zZVNlc3Npb24oW3Nlc3Npb25SZXNvdXJjZV0pO1xuXG5cdFx0XHRcdC8vIFNlc3Npb24gc2hvdWxkIGJlIHJlbW92ZWQgZnJvbSBpdGVtcyBpbW1lZGlhdGVseVxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5pdGVtcy5sZW5ndGgsIDAsICdpdGVtcyBzaG91bGQgYmUgZW1wdHkgYWZ0ZXIgZGlzcG9zZScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3ZlZFJlc291cmNlcy5sZW5ndGgsIDEsICdyZW1vdmVkIGV2ZW50IHNob3VsZCBmaXJlJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdmVkUmVzb3VyY2VzWzBdLnRvU3RyaW5nKCksIHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdFx0XHQvLyBFdmVuIGlmIHJlZnJlc2ggaXMgY2FsbGVkIGFnYWluLCB0aGUgc2Vzc2lvbiBzaG91bGQgbm90IHJlYXBwZWFyXG5cdFx0XHRcdC8vIChiZWNhdXNlIGdldExpdmVTZXNzaW9uSXRlbXMgd291bGQgc3RpbGwgcmV0dXJuIGl0LCBidXQgc2hvdWxkQmVJbkhpc3Rvcnlcblx0XHRcdFx0Ly8gd291bGQgZmlsdGVyIGl0IGluIHRoZSByZWFsIENoYXRTZXJ2aWNlIFx1MjAxNCBoZXJlIHdlIHNpbXVsYXRlIGJ5IGtlZXBpbmdcblx0XHRcdFx0Ly8gbGl2ZVNlc3Npb25JdGVtcyB1bmNoYW5nZWQsIGJ1dCBfaXRlbXMgd2FzIGFscmVhZHkgY2xlYXJlZClcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCByZS1hZGQgZGlzcG9zZWQgc2Vzc2lvbiB0byBpdGVtcyBvbiByZWZyZXNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignZGlzcG9zZWQtcmVmcmVzaC1zZXNzaW9uJyk7XG5cdFx0XHRcdGNvbnN0IG1vY2tNb2RlbCA9IGNyZWF0ZU1vY2tDaGF0TW9kZWwoe1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRoYXNSZXF1ZXN0czogdHJ1ZVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBBZGQgdGhlIHNlc3Npb24gYW5kIHBvcHVsYXRlIGl0ZW1zXG5cdFx0XHRcdG1vY2tDaGF0U2VydmljZS5hZGRTZXNzaW9uKG1vY2tNb2RlbCk7XG5cdFx0XHRcdG1vY2tDaGF0U2VydmljZS5zZXRMaXZlU2Vzc2lvbkl0ZW1zKFthd2FpdCBjaGF0TW9kZWxUb0NoYXREZXRhaWwobW9ja01vZGVsKV0pO1xuXHRcdFx0XHRhd2FpdCBjb250cm9sbGVyLnJlZnJlc2goQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLml0ZW1zLmxlbmd0aCwgMSk7XG5cblx0XHRcdFx0Ly8gRGlzcG9zZSB0aGUgc2Vzc2lvblxuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2UuZmlyZURpZERpc3Bvc2VTZXNzaW9uKFtzZXNzaW9uUmVzb3VyY2VdKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuaXRlbXMubGVuZ3RoLCAwKTtcblxuXHRcdFx0XHQvLyBDbGVhciBsaXZlIGl0ZW1zIChzaW11bGF0ZXMgaXNEZWxldGVkIGZpbHRlcmluZyBpbiByZWFsIENoYXRTZXJ2aWNlKVxuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2Uuc2V0TGl2ZVNlc3Npb25JdGVtcyhbXSk7XG5cblx0XHRcdFx0Ly8gUmVmcmVzaCBzaG91bGQgbm90IGJyaW5nIGl0IGJhY2tcblx0XHRcdFx0YXdhaXQgY29udHJvbGxlci5yZWZyZXNoKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5pdGVtcy5sZW5ndGgsIDAsICdkaXNwb3NlZCBzZXNzaW9uIHNob3VsZCBub3QgcmVhcHBlYXIgYWZ0ZXIgcmVmcmVzaCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtDQUErQztBQUV4RCxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGNBQWMsMEJBQTBCO0FBQ2pELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQXFDLHNCQUFzQiw0QkFBNEI7QUFDaEcsU0FBUyx5QkFBeUIsOEJBQThCO0FBQ2hFLFNBQVMsZ0NBQStIO0FBQ3hJLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsaUJBQWlCLFNBSUs7QUFDOUIsUUFBTSxNQUFNLEtBQUssSUFBSTtBQUNyQixTQUFPO0FBQUEsSUFDTixTQUFTLFNBQVMsV0FBVztBQUFBLElBQzdCLG9CQUFvQixTQUFTO0FBQUEsSUFDN0Isa0JBQWtCLFNBQVM7QUFBQSxFQUM1QjtBQUNEO0FBU0EsU0FBUyxvQkFBb0IsU0FtQlg7QUFDakIsUUFBTSxXQUFnQyxDQUFDO0FBRXZDLFFBQU0sZ0JBQWdCLE1BQXlCO0FBQzlDLFVBQU0sZUFBNEM7QUFBQSxNQUNqRCxZQUFZLFFBQVEsd0JBQXdCO0FBQUEsTUFDNUMsWUFBWSxRQUFRLHdCQUF3QjtBQUFBLE1BQzVDLFFBQVEsUUFBUSx1QkFBdUIsRUFBRSxjQUFjLEVBQUUsU0FBUyxRQUFRLEVBQUUsSUFBSTtBQUFBLE1BQ2hGLFdBQVcsUUFBUSx5QkFBeUIsS0FBSyxJQUFJO0FBQUEsTUFDckQsYUFBYSxRQUFRO0FBQUEsTUFDckIsVUFBVTtBQUFBLFFBQ1QsT0FBTyxDQUFDO0FB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
