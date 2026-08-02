import assert from "assert";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { IChatWidgetService } from "../../../browser/chat.js";
import { AgentSessionsModel, isAgentSession, isAgentSessionsModel, isLocalAgentSessionItem } from "../../../browser/agentSessions/agentSessionsModel.js";
import { AgentSessionsFilter } from "../../../browser/agentSessions/agentSessionsFilter.js";
import { ChatSessionStatus, IChatSessionsService, localChatSessionType } from "../../../common/chatSessionsService.js";
import { LocalChatSessionUri } from "../../../common/model/chatUri.js";
import { MockChatSessionsService } from "../../common/mockChatSessionsService.js";
import { TestChatWidgetService, TestLifecycleService, workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { ILifecycleService } from "../../../../../services/lifecycle/common/lifecycle.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { AgentSessionProviders, getAgentCanContinueIn, getAgentSessionProvider, getAgentSessionProviderIcon, getAgentSessionProviderName } from "../../../browser/agentSessions/agentSessions.js";
class StaticChatSessionItemController {
  constructor(sessionItems) {
    this.sessionItems = sessionItems;
    this.onDidChangeChatSessionItems = Event.None;
  }
  get items() {
    return this.sessionItems;
  }
  async refresh() {
  }
}
suite("AgentSessions", () => {
  suite("AgentSessionsViewModel", () => {
    const disposables = new DisposableStore();
    let mockChatSessionsService;
    let mockLifecycleService;
    let viewModel;
    let instantiationService;
    function createViewModel() {
      return disposables.add(instantiationService.createInstance(
        AgentSessionsModel
      ));
    }
    function registerContribution(type) {
      disposables.add(mockChatSessionsService.registerChatSessionContribution({ type, name: type, displayName: type, description: type }));
    }
    setup(() => {
      mockChatSessionsService = new MockChatSessionsService();
      mockLifecycleService = disposables.add(new TestLifecycleService());
      instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
      instantiationService.stub(IChatSessionsService, mockChatSessionsService);
      instantiationService.stub(ILifecycleService, mockLifecycleService);
    });
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("should initialize with empty sessions", () => {
      viewModel = createViewModel();
      assert.strictEqual(viewModel.sessions.length, 0);
    });
    test("should resolve sessions from controllers", async () => {
      return runWithFakedTimers({}, async () => {
        const chatSessionType = chatSessionTestType;
        const controller = new StaticChatSessionItemController([
          makeSimpleSessionItem("session-1", {
            label: "Test Session 1"
          }),
          makeSimpleSessionItem("session-2", {
            label: "Test Session 2"
          })
        ]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionType, controller);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 2);
        assert.strictEqual(viewModel.sessions[0].resource.toString(), `${chatSessionTestType}://session-1`);
        assert.strictEqual(viewModel.sessions[0].label, "Test Session 1");
        assert.strictEqual(viewModel.sessions[1].resource.toString(), `${chatSessionTestType}://session-2`);
        assert.strictEqual(viewModel.sessions[1].label, "Test Session 2");
      });
    });
    test("should resolve sessions from multiple controllers", async () => {
      return runWithFakedTimers({}, async () => {
        const controller1 = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        const controller2 = new StaticChatSessionItemController([makeSimpleSessionItem("session-2")]);
        registerContribution("type-1");
        registerContribution("type-2");
        mockChatSessionsService.registerChatSessionItemController("type-1", controller1);
        mockChatSessionsService.registerChatSessionItemController("type-2", controller2);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 2);
        const uris = viewModel.sessions.map((s) => s.resource.toString()).sort();
        assert.deepStrictEqual(uris, [
          `${chatSessionTestType}://session-1`,
          `${chatSessionTestType}://session-2`
        ]);
      });
    });
    test("should fire onWillResolve and onDidResolve events", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        let willResolveFired = false;
        let didResolveFired = false;
        disposables.add(viewModel.onWillResolve((provider) => {
          willResolveFired = true;
          assert.strictEqual(typeof provider, "string", "onWillResolve should carry the provider");
          assert.strictEqual(didResolveFired, false, "onDidResolve should not fire before onWillResolve completes");
        }));
        disposables.add(viewModel.onDidResolve((provider) => {
          didResolveFired = true;
          assert.strictEqual(typeof provider, "string", "onDidResolve should carry the provider");
          assert.strictEqual(willResolveFired, true, "onWillResolve should fire before onDidResolve");
        }));
        await viewModel.resolve(void 0);
        assert.strictEqual(willResolveFired, true, "onWillResolve should have fired");
        assert.strictEqual(didResolveFired, true, "onDidResolve should have fired");
      });
    });
    test("should fire onDidChangeSessions event after resolving", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        let sessionsChangedFired = false;
        disposables.add(viewModel.onDidChangeSessions(() => {
          sessionsChangedFired = true;
        }));
        await viewModel.resolve(void 0);
        assert.strictEqual(sessionsChangedFired, true, "onDidChangeSessions should have fired");
      });
    });
    test("should handle session with all properties", async () => {
      return runWithFakedTimers({}, async () => {
        const created = Date.now();
        const lastRequestEnded = created + 1e3;
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://session-1"),
          label: "Test Session",
          description: new MarkdownString("**Bold** description"),
          status: ChatSessionStatus.Completed,
          tooltip: "Session tooltip",
          iconPath: ThemeIcon.fromId("check"),
          timing: { created, lastRequestStarted: created, lastRequestEnded },
          changes: { files: 1, insertions: 10, deletions: 5 }
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 1);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.resource.toString(), "test://session-1");
        assert.strictEqual(session.label, "Test Session");
        assert.ok(session.description instanceof MarkdownString);
        if (session.description instanceof MarkdownString) {
          assert.strictEqual(session.description.value, "**Bold** description");
        }
        assert.strictEqual(session.status, ChatSessionStatus.Completed);
        assert.strictEqual(session.timing.created, created);
        assert.strictEqual(session.timing.lastRequestEnded, lastRequestEnded);
        assert.deepStrictEqual(session.changes, { files: 1, insertions: 10, deletions: 5 });
      });
    });
    test("should handle resolve with specific provider", async () => {
      return runWithFakedTimers({}, async () => {
        const controller1 = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        const controller2 = new StaticChatSessionItemController([makeSimpleSessionItem("session-2")]);
        registerContribution("type-1");
        registerContribution("type-2");
        disposables.add(mockChatSessionsService.registerChatSessionItemController("type-1", controller1));
        disposables.add(mockChatSessionsService.registerChatSessionItemController("type-2", controller2));
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 2);
        await viewModel.resolve("type-1");
        assert.strictEqual(viewModel.sessions.length, 2);
      });
    });
    test("should handle resolve with multiple specific controllers", async () => {
      return runWithFakedTimers({}, async () => {
        const controller1 = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        const controller2 = new StaticChatSessionItemController([makeSimpleSessionItem("session-2")]);
        registerContribution("type-1");
        registerContribution("type-2");
        mockChatSessionsService.registerChatSessionItemController("type-1", controller1);
        mockChatSessionsService.registerChatSessionItemController("type-2", controller2);
        viewModel = createViewModel();
        await viewModel.resolve(["type-1", "type-2"]);
        assert.strictEqual(viewModel.sessions.length, 2);
      });
    });
    test("should respond to onDidChangeItemsProviders event", async () => {
      return runWithFakedTimers({}, async () => {
        const chatSessionType = chatSessionTestType;
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionType, controller);
        viewModel = createViewModel();
        const sessionsChangedPromise = Event.toPromise(viewModel.onDidChangeSessions);
        mockChatSessionsService.fireDidChangeItemsProviders({ chatSessionType });
        await sessionsChangedPromise;
        assert.strictEqual(viewModel.sessions.length, 1);
      });
    });
    test("should respond to onDidChangeAvailability event", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        const sessionsChangedPromise = Event.toPromise(viewModel.onDidChangeSessions);
        mockChatSessionsService.fireDidChangeAvailability();
        await sessionsChangedPromise;
        assert.strictEqual(viewModel.sessions.length, 1);
      });
    });
    test("should respond to onDidChangeSessionItems event", async () => {
      return runWithFakedTimers({}, async () => {
        const testSession = makeSimpleSessionItem("session-1");
        const controller = new StaticChatSessionItemController([testSession]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        const sessionsChangedPromise = Event.toPromise(viewModel.onDidChangeSessions);
        mockChatSessionsService.fireDidChangeSessionItems({ addedOrUpdated: [testSession] });
        await sessionsChangedPromise;
        assert.strictEqual(viewModel.sessions.length, 1);
      });
    });
    test("should maintain provider reference in session view model", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 1);
        assert.strictEqual(viewModel.sessions[0].providerType, chatSessionTestType);
      });
    });
    test("should handle empty provider results", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 0);
      });
    });
    test("should handle sessions with different statuses", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([
          {
            resource: URI.parse("test://session-failed"),
            label: "Failed Session",
            status: ChatSessionStatus.Failed,
            timing: makeNewSessionTiming()
          },
          {
            resource: URI.parse("test://session-completed"),
            label: "Completed Session",
            status: ChatSessionStatus.Completed,
            timing: makeNewSessionTiming()
          },
          {
            resource: URI.parse("test://session-inprogress"),
            label: "In Progress Session",
            status: ChatSessionStatus.InProgress,
            timing: makeNewSessionTiming()
          }
        ]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 3);
        assert.strictEqual(viewModel.sessions[0].status, ChatSessionStatus.Failed);
        assert.strictEqual(viewModel.sessions[1].status, ChatSessionStatus.Completed);
        assert.strictEqual(viewModel.sessions[2].status, ChatSessionStatus.InProgress);
      });
    });
    test("should replace sessions on re-resolve", async () => {
      return runWithFakedTimers({}, async () => {
        let sessionCount = 1;
        let _items = [];
        const controller = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            _items = [];
            for (let i = 0; i < sessionCount; i++) {
              _items.push(makeSimpleSessionItem(`session-${i + 1}`));
            }
          },
          get items() {
            return _items;
          }
        };
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 1);
        sessionCount = 3;
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 3);
      });
    });
    test("should handle local agent session type specially", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([{
          resource: LocalChatSessionUri.forSession("local-session"),
          label: "Local Session",
          timing: makeNewSessionTiming()
        }]);
        mockChatSessionsService.registerChatSessionItemController(localChatSessionType, controller);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 1);
        assert.strictEqual(viewModel.sessions[0].providerType, localChatSessionType);
      });
    });
    test("should correctly construct resource URIs for sessions", async () => {
      return runWithFakedTimers({}, async () => {
        const resource = URI.parse("custom://my-session/path");
        const controller = new StaticChatSessionItemController([{
          resource,
          label: "Test Session",
          timing: makeNewSessionTiming()
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 1);
        assert.strictEqual(viewModel.sessions[0].resource.toString(), resource.toString());
      });
    });
    test("should throttle multiple rapid resolve calls", async () => {
      return runWithFakedTimers({}, async () => {
        let controllerCallCount = 0;
        const controller = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            controllerCallCount++;
          },
          get items() {
            return [makeSimpleSessionItem("session-1")];
          }
        };
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        assert.strictEqual(controllerCallCount, 1);
        viewModel = createViewModel();
        const resolvePromises = [
          viewModel.resolve(void 0),
          viewModel.resolve(void 0),
          viewModel.resolve(void 0)
        ];
        await Promise.all(resolvePromises);
        assert.strictEqual(controllerCallCount, 2);
        assert.strictEqual(viewModel.sessions.length, 1);
      });
    });
    test("should preserve sessions from non-resolved controllers", async () => {
      return runWithFakedTimers({}, async () => {
        let controller1CallCount = 0;
        let controller2CallCount = 0;
        let _items1 = [];
        let _items2 = [];
        const controller1 = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            controller1CallCount++;
            _items1 = [{
              resource: URI.parse("test://session-1"),
              label: `Session 1 (call ${controller1CallCount})`,
              timing: makeNewSessionTiming()
            }];
          },
          get items() {
            return _items1;
          }
        };
        const controller2 = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            controller2CallCount++;
            _items2 = [{
              resource: URI.parse("test://session-2"),
              label: `Session 2 (call ${controller2CallCount})`,
              timing: makeNewSessionTiming()
            }];
          },
          get items() {
            return _items2;
          }
        };
        registerContribution("type-1");
        registerContribution("type-2");
        mockChatSessionsService.registerChatSessionItemController("type-1", controller1);
        mockChatSessionsService.registerChatSessionItemController("type-2", controller2);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 2);
        assert.strictEqual(controller1CallCount, 2);
        assert.strictEqual(controller2CallCount, 2);
        await viewModel.resolve("type-2");
        assert.strictEqual(viewModel.sessions.length, 2);
        assert.strictEqual(controller1CallCount, 2);
        assert.strictEqual(controller2CallCount, 3);
      });
    });
    test("should resolve providers independently (per-provider delayers)", async () => {
      return runWithFakedTimers({}, async () => {
        let controller1RefreshCount = 0;
        let controller2RefreshCount = 0;
        let _items1 = [];
        let _items2 = [];
        const controller1 = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            controller1RefreshCount++;
            _items1 = [makeSimpleSessionItem("session-1", { label: `Session 1 v${controller1RefreshCount}` })];
          },
          get items() {
            return _items1;
          }
        };
        const controller2 = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            controller2RefreshCount++;
            _items2 = [makeSimpleSessionItem("session-2", { label: `Session 2 v${controller2RefreshCount}` })];
          },
          get items() {
            return _items2;
          }
        };
        registerContribution("type-1");
        registerContribution("type-2");
        mockChatSessionsService.registerChatSessionItemController("type-1", controller1);
        mockChatSessionsService.registerChatSessionItemController("type-2", controller2);
        viewModel = createViewModel();
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 2);
        const type1RefreshBefore = controller1RefreshCount;
        const type2RefreshBefore = controller2RefreshCount;
        await viewModel.resolve("type-1");
        assert.strictEqual(controller1RefreshCount, type1RefreshBefore + 1);
        assert.strictEqual(controller2RefreshCount, type2RefreshBefore);
        assert.strictEqual(viewModel.sessions.length, 2);
        await viewModel.resolve("type-2");
        assert.strictEqual(controller2RefreshCount, type2RefreshBefore + 1);
        assert.strictEqual(viewModel.sessions.length, 2);
      });
    });
    test("should accumulate providers when resolve is called with different provider types", async () => {
      return runWithFakedTimers({}, async () => {
        let resolveCount = 0;
        const resolvedProviders = [];
        let _items1 = [];
        let _items2 = [];
        const controller1 = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            resolveCount++;
            resolvedProviders.push("type-1");
            _items1 = [makeSimpleSessionItem("session-1")];
          },
          get items() {
            return _items1;
          }
        };
        const controller2 = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            resolveCount++;
            resolvedProviders.push("type-2");
            _items2 = [{
              resource: URI.parse("test://session-2"),
              label: "Session 2",
              timing: makeNewSessionTiming()
            }];
          },
          get items() {
            return _items2;
          }
        };
        registerContribution("type-1");
        registerContribution("type-2");
        mockChatSessionsService.registerChatSessionItemController("type-1", controller1);
        mockChatSessionsService.registerChatSessionItemController("type-2", controller2);
        viewModel = createViewModel();
        const promise1 = viewModel.resolve("type-1");
        const promise2 = viewModel.resolve(["type-2"]);
        await Promise.all([promise1, promise2]);
        assert.strictEqual(viewModel.sessions.length, 2);
      });
    });
  });
  suite("AgentSessionsViewModel - Helper Functions", () => {
    const disposables = new DisposableStore();
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("isLocalAgentSessionItem should identify local sessions", () => {
      const localSession = {
        providerType: localChatSessionType,
        providerLabel: "Local",
        icon: Codicon.chatSparkle,
        resource: URI.parse("test://local-1"),
        label: "Local",
        description: "test",
        timing: makeNewSessionTiming(),
        status: ChatSessionStatus.Completed,
        isArchived: () => false,
        setArchived: (archived) => {
        },
        isPinned: () => false,
        setPinned: (pinned) => {
        },
        isRead: () => false,
        isMarkedUnread: () => false,
        setRead: (read) => {
        }
      };
      const remoteSession = {
        providerType: "remote",
        providerLabel: "Remote",
        icon: Codicon.chatSparkle,
        resource: URI.parse("test://remote-1"),
        label: "Remote",
        description: "test",
        timing: makeNewSessionTiming(),
        status: ChatSessionStatus.Completed,
        isArchived: () => false,
        setArchived: (archived) => {
        },
        isPinned: () => false,
        setPinned: (pinned) => {
        },
        isRead: () => false,
        isMarkedUnread: () => false,
        setRead: (read) => {
        }
      };
      assert.strictEqual(isLocalAgentSessionItem(localSession), true);
      assert.strictEqual(isLocalAgentSessionItem(remoteSession), false);
    });
    test("isAgentSession should identify session view models", () => {
      const session = {
        providerType: "test",
        providerLabel: "Local",
        icon: Codicon.chatSparkle,
        resource: URI.parse("test://test-1"),
        label: "Test",
        description: "test",
        timing: makeNewSessionTiming(),
        status: ChatSessionStatus.Completed,
        isArchived: () => false,
        setArchived: (archived) => {
        },
        isPinned: () => false,
        setPinned: (pinned) => {
        },
        isRead: () => false,
        isMarkedUnread: () => false,
        setRead: (read) => {
        }
      };
      assert.strictEqual(isAgentSession(session), true);
      const sessionOrContainer = session;
      assert.strictEqual(isAgentSession(sessionOrContainer), true);
    });
    test("isAgentSessionsViewModel should identify sessions view models", () => {
      const session = {
        providerType: "test",
        providerLabel: "Local",
        icon: Codicon.chatSparkle,
        resource: URI.parse("test://test-1"),
        label: "Test",
        description: "test",
        timing: makeNewSessionTiming(),
        status: ChatSessionStatus.Completed,
        isArchived: () => false,
        setArchived: (archived) => {
        },
        isPinned: () => false,
        setPinned: (pinned) => {
        },
        isRead: () => false,
        isMarkedUnread: () => false,
        setRead: (read) => {
        }
      };
      const instantiationService = workbenchInstantiationService(void 0, disposables);
      const lifecycleService = disposables.add(new TestLifecycleService());
      instantiationService.stub(IChatSessionsService, new MockChatSessionsService());
      instantiationService.stub(ILifecycleService, lifecycleService);
      const actualViewModel = disposables.add(instantiationService.createInstance(
        AgentSessionsModel
      ));
      assert.strictEqual(isAgentSessionsModel(actualViewModel), true);
      assert.strictEqual(isAgentSessionsModel(session), false);
    });
  });
  suite("AgentSessionsFilter", () => {
    const disposables = new DisposableStore();
    const storageKey = "agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu";
    let mockChatSessionsService;
    let instantiationService;
    function createSession(overrides = {}) {
      return {
        providerType: chatSessionTestType,
        providerLabel: "Test Provider",
        icon: Codicon.chatSparkle,
        resource: URI.parse("test://session"),
        label: "Test Session",
        timing: makeNewSessionTiming(),
        status: ChatSessionStatus.Completed,
        isArchived: () => false,
        setArchived: () => {
        },
        isPinned: () => false,
        setPinned: () => {
        },
        isRead: () => false,
        isMarkedUnread: () => false,
        setRead: (read) => {
        },
        ...overrides
      };
    }
    setup(() => {
      mockChatSessionsService = new MockChatSessionsService();
      instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
      instantiationService.stub(IChatSessionsService, mockChatSessionsService);
    });
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("should initialize with default excludes", () => {
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const archivedSession = createSession({
        isArchived: () => true
      });
      const activeSession = createSession({
        isArchived: () => false
      });
      assert.strictEqual(filter.exclude(archivedSession), false);
      assert.strictEqual(filter.exclude(activeSession), false);
    });
    test("should filter out sessions from excluded provider", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const session1 = createSession({
        providerType: "type-1",
        resource: URI.parse("test://session-1")
      });
      const session2 = createSession({
        providerType: "type-2",
        resource: URI.parse("test://session-2")
      });
      assert.strictEqual(filter.exclude(session1), false);
      assert.strictEqual(filter.exclude(session2), false);
      const excludes = {
        providers: ["type-1"],
        states: [],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(session1), true);
      assert.strictEqual(filter.exclude(session2), false);
    });
    test("should filter out multiple excluded controllers", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const session1 = createSession({ providerType: "type-1" });
      const session2 = createSession({ providerType: "type-2" });
      const session3 = createSession({ providerType: "type-3" });
      const excludes = {
        providers: ["type-1", "type-2"],
        states: [],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(session1), true);
      assert.strictEqual(filter.exclude(session2), true);
      assert.strictEqual(filter.exclude(session3), false);
    });
    test("should not exclude archived sessions when not capped", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const archivedSession = createSession({
        resource: URI.parse("test://archived-session"),
        isArchived: () => true
      });
      const activeSession = createSession({
        resource: URI.parse("test://active-session"),
        isArchived: () => false
      });
      assert.strictEqual(filter.exclude(archivedSession), false);
      assert.strictEqual(filter.exclude(activeSession), false);
      const excludes = {
        providers: [],
        states: [],
        archived: true
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(archivedSession), false);
      assert.strictEqual(filter.exclude(activeSession), false);
    });
    test("should filter out sessions with excluded status", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const failedSession = createSession({
        resource: URI.parse("test://failed-session"),
        status: ChatSessionStatus.Failed
      });
      const completedSession = createSession({
        resource: URI.parse("test://completed-session"),
        status: ChatSessionStatus.Completed
      });
      const inProgressSession = createSession({
        resource: URI.parse("test://inprogress-session"),
        status: ChatSessionStatus.InProgress
      });
      assert.strictEqual(filter.exclude(failedSession), false);
      assert.strictEqual(filter.exclude(completedSession), false);
      assert.strictEqual(filter.exclude(inProgressSession), false);
      const excludes = {
        providers: [],
        states: [ChatSessionStatus.Failed],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(failedSession), true);
      assert.strictEqual(filter.exclude(completedSession), false);
      assert.strictEqual(filter.exclude(inProgressSession), false);
    });
    test("should filter out multiple excluded statuses", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const failedSession = createSession({ status: ChatSessionStatus.Failed });
      const completedSession = createSession({ status: ChatSessionStatus.Completed });
      const inProgressSession = createSession({ status: ChatSessionStatus.InProgress });
      const excludes = {
        providers: [],
        states: [ChatSessionStatus.Failed, ChatSessionStatus.InProgress],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(failedSession), true);
      assert.strictEqual(filter.exclude(completedSession), false);
      assert.strictEqual(filter.exclude(inProgressSession), true);
    });
    test("should combine multiple filter conditions", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const session1 = createSession({
        providerType: "type-1",
        status: ChatSessionStatus.Failed,
        isArchived: () => true
      });
      const session2 = createSession({
        providerType: "type-2",
        status: ChatSessionStatus.Completed,
        isArchived: () => false
      });
      const excludes = {
        providers: ["type-1"],
        states: [ChatSessionStatus.Failed],
        archived: true
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(session1), true);
      assert.strictEqual(filter.exclude(session2), false);
    });
    test("should emit onDidChange when excludes are updated", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      let changeEventFired = false;
      disposables.add(filter.onDidChange(() => {
        changeEventFired = true;
      }));
      const excludes = {
        providers: ["type-1"],
        states: [],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(changeEventFired, true);
    });
    test("should handle storage updates from other windows", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const session = createSession({ providerType: "type-1" });
      assert.strictEqual(filter.exclude(session), false);
      const excludes = {
        providers: ["type-1"],
        states: [],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(session), true);
    });
    test("should register provider filter actions", () => {
      const controller = new StaticChatSessionItemController([]);
      mockChatSessionsService.registerChatSessionItemController("custom-type-1", controller);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const session = createSession({ providerType: "custom-type-1" });
      assert.strictEqual(filter.exclude(session), false);
    });
    test("should handle providers registered after filter creation", () => {
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const chatSessionType = "new-type";
      const controller = new StaticChatSessionItemController([]);
      mockChatSessionsService.registerChatSessionItemController(chatSessionType, controller);
      mockChatSessionsService.fireDidChangeItemsProviders({ chatSessionType });
      const session = createSession({ providerType: "new-type" });
      assert.strictEqual(filter.exclude(session), false);
    });
    test("should not exclude when all filters are disabled", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const session = createSession({
        providerType: "type-1",
        status: ChatSessionStatus.Failed,
        isArchived: () => true
      });
      const excludes = {
        providers: [],
        states: [],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(session), false);
    });
    test("should handle empty provider list in storage", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const session = createSession({ providerType: "type-1" });
      const excludes = {
        providers: [],
        states: [],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(session), false);
    });
    test("should handle different MenuId contexts", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter1 = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const filter2 = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewItemContext }
      ));
      const session = createSession({ providerType: "type-1" });
      const excludes = {
        providers: ["type-1"],
        states: [],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter1.exclude(session), true);
      assert.strictEqual(filter2.exclude(session), true);
    });
    test("should handle malformed storage data gracefully", () => {
      const storageService = instantiationService.get(IStorageService);
      storageService.store(storageKey, "invalid json", StorageScope.PROFILE, StorageTarget.USER);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const archivedSession = createSession({ isArchived: () => true });
      assert.strictEqual(filter.exclude(archivedSession), false);
    });
    test("should prioritize archived check first", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const session = createSession({
        providerType: "type-1",
        status: ChatSessionStatus.Completed,
        isArchived: () => true
      });
      const excludes = {
        providers: ["type-1"],
        states: [ChatSessionStatus.Completed],
        archived: true
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(session), true);
    });
    test("should handle all three status types correctly", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const completedSession = createSession({ status: ChatSessionStatus.Completed });
      const inProgressSession = createSession({ status: ChatSessionStatus.InProgress });
      const failedSession = createSession({ status: ChatSessionStatus.Failed });
      const excludes = {
        providers: [],
        states: [ChatSessionStatus.Completed, ChatSessionStatus.InProgress, ChatSessionStatus.Failed],
        archived: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      assert.strictEqual(filter.exclude(completedSession), true);
      assert.strictEqual(filter.exclude(inProgressSession), true);
      assert.strictEqual(filter.exclude(failedSession), true);
    });
    test("should exclude sessions from non-allowed providers when allowedProviders is set", () => {
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        {
          filterMenuId: MenuId.ViewTitle,
          allowedProviders: [AgentSessionProviders.Background, AgentSessionProviders.Cloud]
        }
      ));
      const backgroundSession = createSession({ providerType: AgentSessionProviders.Background });
      const cloudSession = createSession({ providerType: AgentSessionProviders.Cloud });
      const claudeSession = createSession({ providerType: AgentSessionProviders.Claude });
      const codexSession = createSession({ providerType: AgentSessionProviders.Codex });
      const localSession = createSession({ providerType: AgentSessionProviders.Local });
      assert.strictEqual(filter.exclude(backgroundSession), false, "Background should be allowed");
      assert.strictEqual(filter.exclude(cloudSession), false, "Cloud should be allowed");
      assert.strictEqual(filter.exclude(claudeSession), true, "Claude should be excluded");
      assert.strictEqual(filter.exclude(codexSession), true, "Codex should be excluded");
      assert.strictEqual(filter.exclude(localSession), true, "Local should be excluded");
    });
    test("should not exclude any provider when allowedProviders is not set", () => {
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      const claudeSession = createSession({ providerType: AgentSessionProviders.Claude });
      const codexSession = createSession({ providerType: AgentSessionProviders.Codex });
      const unknownSession = createSession({ providerType: "some-unknown-type" });
      assert.strictEqual(filter.exclude(claudeSession), false);
      assert.strictEqual(filter.exclude(codexSession), false);
      assert.strictEqual(filter.exclude(unknownSession), false);
    });
    test("should still apply user excludes on top of allowedProviders", () => {
      const storageService = instantiationService.get(IStorageService);
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        {
          filterMenuId: MenuId.ViewTitle,
          allowedProviders: [AgentSessionProviders.Background, AgentSessionProviders.Cloud]
        }
      ));
      const excludes = {
        providers: [AgentSessionProviders.Cloud],
        states: [],
        archived: false,
        read: false
      };
      storageService.store(storageKey, JSON.stringify(excludes), StorageScope.PROFILE, StorageTarget.USER);
      const backgroundSession = createSession({ providerType: AgentSessionProviders.Background });
      const cloudSession = createSession({ providerType: AgentSessionProviders.Cloud });
      const claudeSession = createSession({ providerType: AgentSessionProviders.Claude });
      assert.strictEqual(filter.exclude(backgroundSession), false, "Background is allowed and not user-excluded");
      assert.strictEqual(filter.exclude(cloudSession), true, "Cloud is allowed but user-excluded");
      assert.strictEqual(filter.exclude(claudeSession), true, "Claude is not in allowedProviders");
    });
  });
  suite("AgentSessionsViewModel - Session Archiving", () => {
    const disposables = new DisposableStore();
    let mockChatSessionsService;
    let instantiationService;
    let viewModel;
    class MutableArchiveChatSessionItemController {
      constructor(sessionItem) {
        this.sessionItem = sessionItem;
        this.onDidChangeChatSessionItems = Event.None;
        this.archiveUpdates = [];
      }
      get items() {
        return [this.sessionItem];
      }
      async refresh() {
      }
      setChatSessionItemArchived(_resource, archived) {
        this.archiveUpdates.push(archived);
      }
      setProviderArchived(archived) {
        return this.sessionItem = { ...this.sessionItem, archived };
      }
    }
    setup(() => {
      mockChatSessionsService = new MockChatSessionsService();
      instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
      instantiationService.stub(IChatSessionsService, mockChatSessionsService);
      instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
    });
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("should archive and unarchive sessions", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isArchived(), false);
        session.setArchived(true);
        assert.strictEqual(session.isArchived(), true);
        session.setArchived(false);
        assert.strictEqual(session.isArchived(), false);
      });
    });
    test("should fire onDidChangeSessions when archiving", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        let changeEventFired = false;
        disposables.add(viewModel.onDidChangeSessions(() => {
          changeEventFired = true;
        }));
        session.setArchived(true);
        assert.strictEqual(changeEventFired, true);
      });
    });
    test("should not fire onDidChangeSessions when archiving with same value", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        session.setArchived(true);
        let changeEventFired = false;
        disposables.add(viewModel.onDidChangeSessions(() => {
          changeEventFired = true;
        }));
        session.setArchived(true);
        assert.strictEqual(changeEventFired, false);
      });
    });
    test("should ignore stale local state for controller-owned archived state", async () => {
      return runWithFakedTimers({}, async () => {
        const item = makeSimpleSessionItem("session-1", { archived: true });
        instantiationService.get(IStorageService).store(
          "agentSessions.state.cache",
          JSON.stringify([{ resource: item.resource.toString(), archived: false }]),
          StorageScope.WORKSPACE,
          StorageTarget.MACHINE
        );
        const controller = new MutableArchiveChatSessionItemController(item);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        session.setArchived(false);
        assert.deepStrictEqual({
          beforeProviderUpdate: session.isArchived(),
          archiveUpdates: controller.archiveUpdates
        }, {
          beforeProviderUpdate: true,
          archiveUpdates: [false]
        });
      });
    });
    test("should not create a local overlay for controller-owned archive writes", async () => {
      return runWithFakedTimers({}, async () => {
        const item = makeSimpleSessionItem("session-1", { archived: false });
        const controller = new MutableArchiveChatSessionItemController(item);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setArchived(true);
        await viewModel.resolve(void 0);
        assert.deepStrictEqual({
          archived: viewModel.sessions[0].isArchived(),
          archiveUpdates: controller.archiveUpdates
        }, {
          archived: false,
          archiveUpdates: [true]
        });
      });
    });
    test("should fire archive state changes only for effective provider transitions", async () => {
      return runWithFakedTimers({}, async () => {
        const item = makeSimpleSessionItem("session-1", { archived: false });
        const controller = new MutableArchiveChatSessionItemController(item);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const archivedEvents = [];
        disposables.add(viewModel.onDidChangeSessionArchivedState((session) => archivedEvents.push(session.isArchived())));
        const archivedItem = controller.setProviderArchived(true);
        let sessionsChanged = Event.toPromise(viewModel.onDidChangeSessions);
        mockChatSessionsService.fireDidChangeSessionItems({ addedOrUpdated: [archivedItem] });
        await sessionsChanged;
        const unchangedItem = controller.setProviderArchived(true);
        sessionsChanged = Event.toPromise(viewModel.onDidChangeSessions);
        mockChatSessionsService.fireDidChangeSessionItems({ addedOrUpdated: [unchangedItem] });
        await sessionsChanged;
        assert.deepStrictEqual({
          archived: viewModel.sessions[0].isArchived(),
          archivedEvents
        }, {
          archived: true,
          archivedEvents: [true]
        });
      });
    });
    test("should preserve archived state from provider", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://session-1"),
          label: "Test Session",
          archived: true,
          timing: makeNewSessionTiming()
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isArchived(), true);
      });
    });
    test("should override provider archived state with user preference", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://session-1"),
          label: "Test Session",
          archived: true,
          timing: makeNewSessionTiming()
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isArchived(), true);
        session.setArchived(false);
        assert.strictEqual(session.isArchived(), false);
        await viewModel.resolve(void 0);
        const sessionAfterResolve = viewModel.sessions[0];
        assert.strictEqual(sessionAfterResolve.isArchived(), false);
      });
    });
  });
  suite("AgentSessionsViewModel - legacyResource migration", () => {
    const disposables = new DisposableStore();
    let mockChatSessionsService;
    let instantiationService;
    let viewModel;
    setup(() => {
      mockChatSessionsService = new MockChatSessionsService();
      instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
      instantiationService.stub(IChatSessionsService, mockChatSessionsService);
      instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
    });
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function uris() {
      return {
        oldUri: URI.parse(`${chatSessionTestType}://legacy-1`),
        newUri: URI.parse(`${chatSessionTestType}://current-1`)
      };
    }
    function makeItem(resource, overrides) {
      return {
        resource,
        label: `Session ${resource.path}`,
        timing: makeNewSessionTiming(),
        ...overrides
      };
    }
    test("migrates archived state forward from legacyResource to current resource", async () => {
      return runWithFakedTimers({}, async () => {
        const { oldUri, newUri } = uris();
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(oldUri)])
        );
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setArchived(true);
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(newUri, { legacyResource: oldUri })])
        );
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.deepStrictEqual(
          { resource: session.resource.toString(), archived: session.isArchived() },
          { resource: newUri.toString(), archived: true }
        );
      });
    });
    test("migrates pinned state forward (not just archived)", async () => {
      return runWithFakedTimers({}, async () => {
        const { oldUri, newUri } = uris();
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(oldUri)])
        );
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setPinned(true);
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(newUri, { legacyResource: oldUri })])
        );
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.deepStrictEqual(
          { pinned: session.isPinned(), archived: session.isArchived() },
          { pinned: true, archived: false }
        );
      });
    });
    test("migrates unread marker forward (read state, not just archived/pinned)", async () => {
      return runWithFakedTimers({}, async () => {
        const { oldUri, newUri } = uris();
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(oldUri)])
        );
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setRead(false);
        assert.strictEqual(viewModel.sessions[0].isMarkedUnread(), true, "pre-condition: legacy URI marked unread");
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(newUri, { legacyResource: oldUri })])
        );
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions[0].isMarkedUnread(), true);
      });
    });
    test("does nothing when no host state exists under legacyResource", async () => {
      return runWithFakedTimers({}, async () => {
        const { oldUri, newUri } = uris();
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(newUri, { legacyResource: oldUri, archived: true })])
        );
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions[0].isArchived(), true);
      });
    });
    test("own state wins when both legacy and current URI have host state", async () => {
      return runWithFakedTimers({}, async () => {
        const { oldUri, newUri } = uris();
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(oldUri)])
        );
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setArchived(true);
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(newUri)])
        );
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setArchived(true);
        viewModel.sessions[0].setArchived(false);
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(newUri, { legacyResource: oldUri })])
        );
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions[0].isArchived(), false);
      });
    });
    test("ignores legacyResource equal to the current resource", async () => {
      return runWithFakedTimers({}, async () => {
        const { newUri } = uris();
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(newUri, { legacyResource: newUri, archived: false })])
        );
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions[0].isArchived(), false);
      });
    });
    test("ignores legacyResource with a different scheme", async () => {
      return runWithFakedTimers({}, async () => {
        const { newUri } = uris();
        const otherScheme = URI.parse("other-scheme://legacy-1");
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(otherScheme)])
        );
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setArchived(true);
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(newUri, { legacyResource: otherScheme })])
        );
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions[0].isArchived(), false);
      });
    });
    test("post-migration setArchived writes under current resource and frees the legacy slot", async () => {
      return runWithFakedTimers({}, async () => {
        const { oldUri, newUri } = uris();
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(oldUri)])
        );
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setArchived(true);
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(newUri, { legacyResource: oldUri })])
        );
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setArchived(false);
        mockChatSessionsService.registerChatSessionItemController(
          chatSessionTestType,
          new StaticChatSessionItemController([makeItem(oldUri)])
        );
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions[0].isArchived(), false);
      });
    });
  });
  suite("AgentSessionsViewModel - Session Read State", () => {
    const disposables = new DisposableStore();
    let mockChatSessionsService;
    let instantiationService;
    let viewModel;
    setup(() => {
      mockChatSessionsService = new MockChatSessionsService();
      instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
      instantiationService.stub(IChatSessionsService, mockChatSessionsService);
      instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
      const storageService = instantiationService.get(IStorageService);
      storageService.store("agentSessions.readDateBaseline2", 1, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    });
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("should mark session as read and unread", async () => {
      return runWithFakedTimers({}, async () => {
        const futureSessionTiming = {
          created: Date.UTC(2026, 1, 1),
          lastRequestStarted: Date.UTC(2026, 1, 1),
          lastRequestEnded: Date.UTC(2026, 1, 2)
        };
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://session-1"),
          label: "Session 1",
          timing: futureSessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        session.setRead(true);
        assert.strictEqual(session.isRead(), true);
        session.setRead(false);
        assert.strictEqual(session.isRead(), false);
        assert.strictEqual(session.isMarkedUnread(), true);
      });
    });
    test("should report isMarkedUnread only when explicitly marked unread", async () => {
      return runWithFakedTimers({}, async () => {
        const futureSessionTiming = {
          created: Date.UTC(2026, 1, 1),
          lastRequestStarted: Date.UTC(2026, 1, 1),
          lastRequestEnded: Date.UTC(2026, 1, 2)
        };
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://session-1"),
          label: "Session 1",
          timing: futureSessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isRead(), false);
        assert.strictEqual(session.isMarkedUnread(), false);
        session.setRead(true);
        assert.strictEqual(session.isMarkedUnread(), false);
        session.setRead(false);
        assert.strictEqual(session.isMarkedUnread(), true);
      });
    });
    test("should fire onDidChangeSessions when marking as read", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        session.setRead(false);
        let changeEventFired = false;
        disposables.add(viewModel.onDidChangeSessions(() => {
          changeEventFired = true;
        }));
        session.setRead(true);
        assert.strictEqual(changeEventFired, true);
      });
    });
    test("should not fire onDidChangeSessions when marking as read with same value", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        session.setRead(true);
        let changeEventFired = false;
        disposables.add(viewModel.onDidChangeSessions(() => {
          changeEventFired = true;
        }));
        session.setRead(true);
        assert.strictEqual(changeEventFired, false);
      });
    });
    test("should preserve read state after re-resolve", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        session.setRead(true);
        assert.strictEqual(session.isRead(), true);
        await viewModel.resolve(void 0);
        const sessionAfterResolve = viewModel.sessions[0];
        assert.strictEqual(sessionAfterResolve.isRead(), true);
      });
    });
    test("should consider sessions before initial date as read by default", async () => {
      return runWithFakedTimers({}, async () => {
        const oldSessionTiming = {
          created: Date.UTC(2025, 10, 1),
          lastRequestStarted: Date.UTC(2025, 10, 1),
          lastRequestEnded: Date.UTC(2025, 10, 2)
        };
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://old-session"),
          label: "Old Session",
          timing: oldSessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isRead(), false);
      });
    });
    test("should consider sessions after initial date as unread by default", async () => {
      return runWithFakedTimers({}, async () => {
        const newSessionTiming = {
          created: Date.UTC(2026, 1, 1),
          lastRequestStarted: Date.UTC(2026, 1, 1),
          lastRequestEnded: Date.UTC(2026, 1, 2)
        };
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://new-session"),
          label: "New Session",
          timing: newSessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isRead(), false);
      });
    });
    test("should use endTime for read state comparison when available", async () => {
      return runWithFakedTimers({}, async () => {
        const sessionTiming = {
          created: Date.UTC(2025, 10, 1),
          lastRequestStarted: Date.UTC(2025, 10, 1),
          lastRequestEnded: Date.UTC(2026, 1, 1)
        };
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://session-with-endtime"),
          label: "Session With EndTime",
          timing: sessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isRead(), false);
      });
    });
    test("should use startTime for read state comparison when endTime is not available", async () => {
      return runWithFakedTimers({}, async () => {
        const sessionTiming = {
          created: Date.UTC(2025, 10, 1),
          lastRequestStarted: Date.UTC(2025, 10, 1),
          lastRequestEnded: void 0
        };
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://session-no-endtime"),
          label: "Session Without EndTime",
          timing: sessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isRead(), false);
      });
    });
    test("should treat archived sessions as read", async () => {
      return runWithFakedTimers({}, async () => {
        const newSessionTiming = {
          created: Date.UTC(2026, 1, 1),
          lastRequestStarted: Date.UTC(2026, 1, 1),
          lastRequestEnded: Date.UTC(2026, 1, 2)
        };
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://new-session"),
          label: "New Session",
          timing: newSessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isRead(), false);
        assert.strictEqual(session.isArchived(), false);
        session.setArchived(true);
        assert.strictEqual(session.isArchived(), true);
        assert.strictEqual(session.isRead(), true);
      });
    });
    test("should mark session as read when archiving", async () => {
      return runWithFakedTimers({}, async () => {
        const newSessionTiming = {
          created: Date.UTC(2026, 1, 1),
          lastRequestStarted: Date.UTC(2026, 1, 1),
          lastRequestEnded: Date.UTC(2026, 1, 2)
        };
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://new-session"),
          label: "New Session",
          timing: newSessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isRead(), false);
        session.setArchived(true);
        assert.strictEqual(session.isRead(), true);
        session.setArchived(false);
        assert.strictEqual(session.isArchived(), false);
      });
    });
    test("should fire onDidChangeSessions when archiving an unread session", async () => {
      return runWithFakedTimers({}, async () => {
        const newSessionTiming = {
          created: Date.UTC(2026, 1, 1),
          lastRequestStarted: Date.UTC(2026, 1, 1),
          lastRequestEnded: Date.UTC(2026, 1, 2)
        };
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://new-session"),
          label: "New Session",
          timing: newSessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.isRead(), false);
        let changeEventCount = 0;
        disposables.add(viewModel.onDidChangeSessions(() => {
          changeEventCount++;
        }));
        session.setArchived(true);
        assert.strictEqual(changeEventCount, 2);
      });
    });
    test("should not fire onDidChangeSessions when archiving an already read session", async () => {
      return runWithFakedTimers({}, async () => {
        const oldSessionTiming = {
          created: Date.UTC(2025, 10, 1),
          lastRequestStarted: Date.UTC(2025, 10, 1),
          lastRequestEnded: Date.UTC(2025, 10, 2)
        };
        const chatSessionType = chatSessionTestType;
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://old-session"),
          label: "Old Session",
          timing: oldSessionTiming
        }]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        session.setRead(true);
        assert.strictEqual(session.isRead(), true);
        let changeEventCount = 0;
        disposables.add(viewModel.onDidChangeSessions(() => {
          changeEventCount++;
        }));
        session.setArchived(true);
        assert.strictEqual(changeEventCount, 1);
      });
    });
  });
  suite("AgentSessionsViewModel - Provider-owned Read State", () => {
    const disposables = new DisposableStore();
    let mockChatSessionsService;
    let instantiationService;
    let viewModel;
    class OpenChatWidgetService extends TestChatWidgetService {
      constructor(openSessionResource) {
        super();
        this.openSessionResource = openSessionResource;
        this.widget = new class extends mock() {
        }();
      }
      getWidgetBySessionResource(resource) {
        return isEqual(resource, this.openSessionResource) ? this.widget : void 0;
      }
    }
    class ReadOwningController {
      constructor(_items) {
        this._items = _items;
        this._onDidChangeChatSessionItems = disposables.add(new Emitter());
        this.onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;
        this.mutations = [];
      }
      get items() {
        return this._items;
      }
      async refresh() {
      }
      setItems(items) {
        this._items = items;
        this._onDidChangeChatSessionItems.fire({ addedOrUpdated: this._items });
      }
      setChatSessionItemRead(resource, isRead) {
        this.mutations.push({ resource: resource.toString(), isRead });
        this._items = this._items.map((item) => isEqual(item.resource, resource) ? { ...item, isRead } : item);
        this._onDidChangeChatSessionItems.fire({ addedOrUpdated: this._items });
      }
    }
    const sessionTiming = {
      created: Date.UTC(2026, 1, 1),
      lastRequestStarted: Date.UTC(2026, 1, 1),
      lastRequestEnded: Date.UTC(2026, 1, 2)
    };
    setup(() => {
      mockChatSessionsService = new MockChatSessionsService();
      instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
      instantiationService.stub(IChatSessionsService, mockChatSessionsService);
      instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
      const storageService = instantiationService.get(IStorageService);
      storageService.store("agentSessions.readDateBaseline2", 1, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    });
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("keeps an open session read when a later provider unread update arrives", async () => {
      return runWithFakedTimers({}, async () => {
        const resource = URI.parse("test-type://owned-session");
        const controller = new ReadOwningController([{
          resource,
          label: "Owned Session",
          timing: sessionTiming,
          isRead: true
        }]);
        instantiationService.stub(IChatWidgetService, new OpenChatWidgetService(resource));
        disposables.add(mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller));
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        controller.setItems([{
          resource,
          label: "Owned Session",
          timing: sessionTiming,
          isRead: false
        }]);
        await viewModel.resolve(void 0);
        assert.deepStrictEqual({
          mutations: controller.mutations,
          isRead: viewModel.sessions[0].isRead(),
          isMarkedUnread: viewModel.sessions[0].isMarkedUnread()
        }, {
          mutations: [{ resource: "test-type://owned-session", isRead: true }],
          isRead: true,
          isMarkedUnread: false
        });
      });
    });
    test("preserves an explicit unread update for an open session", async () => {
      return runWithFakedTimers({}, async () => {
        const resource = URI.parse("test-type://owned-session");
        const controller = new ReadOwningController([{
          resource,
          label: "Owned Session",
          timing: sessionTiming,
          isRead: true
        }]);
        instantiationService.stub(IChatWidgetService, new OpenChatWidgetService(resource));
        disposables.add(mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller));
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setRead(false);
        await viewModel.resolve(void 0);
        assert.deepStrictEqual({
          mutations: controller.mutations,
          isRead: viewModel.sessions[0].isRead(),
          isMarkedUnread: viewModel.sessions[0].isMarkedUnread()
        }, {
          mutations: [{ resource: "test-type://owned-session", isRead: false }],
          isRead: false,
          isMarkedUnread: true
        });
      });
    });
    test("reads the provider value and routes mutations back to it", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new ReadOwningController([{
          resource: URI.parse("test-type://owned-session"),
          label: "Owned Session",
          timing: sessionTiming,
          isRead: false
        }]);
        disposables.add(mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller));
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const initial = {
          isRead: viewModel.sessions[0].isRead(),
          isMarkedUnread: viewModel.sessions[0].isMarkedUnread()
        };
        viewModel.sessions[0].setRead(true);
        await viewModel.resolve(void 0);
        assert.deepStrictEqual({
          initial,
          mutations: controller.mutations,
          afterMarkRead: {
            isRead: viewModel.sessions[0].isRead(),
            isMarkedUnread: viewModel.sessions[0].isMarkedUnread()
          }
        }, {
          initial: { isRead: false, isMarkedUnread: true },
          mutations: [{ resource: "test-type://owned-session", isRead: true }],
          afterMarkRead: { isRead: true, isMarkedUnread: false }
        });
      });
    });
    test("provider unread wins over the local heuristics", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new ReadOwningController([{
          resource: URI.parse("test-type://owned-session"),
          label: "Owned Session",
          // Old enough that the local baseline heuristic would call it read.
          timing: { created: 1, lastRequestStarted: 1, lastRequestEnded: 1 },
          isRead: false
        }]);
        disposables.add(mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller));
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        await viewModel.resolve(void 0);
        assert.deepStrictEqual({
          mutations: controller.mutations,
          isRead: viewModel.sessions[0].isRead()
        }, {
          mutations: [{ resource: "test-type://owned-session", isRead: true }],
          isRead: true
        });
      });
    });
    test("does not migrate a session the provider already reports as read", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new ReadOwningController([{
          resource: URI.parse("test-type://owned-session"),
          label: "Owned Session",
          timing: sessionTiming,
          isRead: true
        }]);
        disposables.add(mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller));
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        await viewModel.resolve(void 0);
        assert.deepStrictEqual(controller.mutations, []);
      });
    });
    test("defers migration until the provider has reported a value", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new ReadOwningController([{
          resource: URI.parse("test-type://owned-session"),
          label: "Owned Session",
          timing: { created: 1, lastRequestStarted: 1, lastRequestEnded: 1 },
          isRead: void 0
        }]);
        disposables.add(mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller));
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const beforeReport = controller.mutations.length;
        controller.setItems([{
          resource: URI.parse("test-type://owned-session"),
          label: "Owned Session",
          timing: { created: 1, lastRequestStarted: 1, lastRequestEnded: 1 },
          isRead: false
        }]);
        await viewModel.resolve(void 0);
        assert.deepStrictEqual({
          beforeReport,
          mutations: controller.mutations
        }, {
          beforeReport: 0,
          mutations: [{ resource: "test-type://owned-session", isRead: true }]
        });
      });
    });
    test("does not resurrect read state on a later refresh after marking unread", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new ReadOwningController([{
          resource: URI.parse("test-type://owned-session"),
          label: "Owned Session",
          timing: { created: 1, lastRequestStarted: 1, lastRequestEnded: 1 },
          isRead: false
        }]);
        disposables.add(mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller));
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        await viewModel.resolve(void 0);
        viewModel.sessions[0].setRead(false);
        await viewModel.resolve(void 0);
        assert.deepStrictEqual({
          mutations: controller.mutations,
          isRead: viewModel.sessions[0].isRead()
        }, {
          mutations: [
            { resource: "test-type://owned-session", isRead: true },
            { resource: "test-type://owned-session", isRead: false }
          ],
          isRead: false
        });
      });
    });
  });
  suite("AgentSessionsViewModel - State Tracking", () => {
    const disposables = new DisposableStore();
    let mockChatSessionsService;
    let instantiationService;
    let viewModel;
    setup(() => {
      mockChatSessionsService = new MockChatSessionsService();
      instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
      instantiationService.stub(IChatSessionsService, mockChatSessionsService);
      instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
    });
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("should track status transitions", async () => {
      return runWithFakedTimers({}, async () => {
        let sessionStatus = ChatSessionStatus.InProgress;
        let _items = [];
        const controller = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            _items = [{
              resource: URI.parse("test://session-1"),
              label: "Test Session",
              status: sessionStatus,
              timing: makeNewSessionTiming()
            }];
          },
          get items() {
            return _items;
          }
        };
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions[0].status, ChatSessionStatus.InProgress);
        sessionStatus = ChatSessionStatus.Completed;
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions[0].status, ChatSessionStatus.Completed);
      });
    });
    test("should clean up state tracking for removed sessions", async () => {
      return runWithFakedTimers({}, async () => {
        let includeSessions = true;
        let _items = [];
        const controller = {
          onDidChangeChatSessionItems: Event.None,
          refresh: async () => {
            if (includeSessions) {
              _items = [makeSimpleSessionItem("session-1")];
            } else {
              _items = [];
            }
          },
          get items() {
            return _items;
          }
        };
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 1);
        includeSessions = false;
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 0);
      });
    });
  });
  suite("AgentSessionsViewModel - Provider Icons and Names", () => {
    const disposables = new DisposableStore();
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("should return correct name for Local provider", () => {
      const name = getAgentSessionProviderName(AgentSessionProviders.Local);
      assert.ok(name.length > 0);
    });
    test("should return correct name for Background provider", () => {
      const name = getAgentSessionProviderName(AgentSessionProviders.Background);
      assert.ok(name.length > 0);
    });
    test("should return correct name for Cloud provider", () => {
      const name = getAgentSessionProviderName(AgentSessionProviders.Cloud);
      assert.ok(name.length > 0);
    });
    test("should return correct icon for Local provider", () => {
      const icon = getAgentSessionProviderIcon(AgentSessionProviders.Local);
      assert.strictEqual(icon.id, Codicon.vm.id);
    });
    test("should return correct icon for Background provider", () => {
      const icon = getAgentSessionProviderIcon(AgentSessionProviders.Background);
      assert.strictEqual(icon.id, Codicon.copilot.id);
    });
    test("should return correct icon for Cloud provider", () => {
      const icon = getAgentSessionProviderIcon(AgentSessionProviders.Cloud);
      assert.strictEqual(icon.id, Codicon.cloud.id);
    });
    test("should return correct icon for AgentHostCopilot provider", () => {
      const icon = getAgentSessionProviderIcon(AgentSessionProviders.AgentHostCopilot);
      assert.strictEqual(icon.id, Codicon.vm.id);
    });
    test("should return simplified AgentHostCopilot name", () => {
      const name = getAgentSessionProviderName(AgentSessionProviders.AgentHostCopilot);
      assert.strictEqual(name, "Copilot");
    });
    test("should return correct name for Growth provider", () => {
      const name = getAgentSessionProviderName(AgentSessionProviders.Growth);
      assert.strictEqual(name, "Growth");
    });
    test("should return correct icon for Growth provider", () => {
      const icon = getAgentSessionProviderIcon(AgentSessionProviders.Growth);
      assert.strictEqual(icon.id, Codicon.lightbulb.id);
    });
    test("should return correct name for AgentHostClaude provider", () => {
      const name = getAgentSessionProviderName(AgentSessionProviders.AgentHostClaude);
      assert.strictEqual(name, "Claude");
    });
    test("should return correct icon for AgentHostClaude provider", () => {
      const icon = getAgentSessionProviderIcon(AgentSessionProviders.AgentHostClaude);
      assert.strictEqual(icon.id, Codicon.claude.id);
    });
    test("should return correct name for AgentHostCodex provider", () => {
      const name = getAgentSessionProviderName(AgentSessionProviders.AgentHostCodex);
      assert.strictEqual(name, "Codex");
    });
    test("should return correct icon for AgentHostCodex provider", () => {
      const icon = getAgentSessionProviderIcon(AgentSessionProviders.AgentHostCodex);
      assert.strictEqual(icon.id, Codicon.openai.id);
    });
    test("should resolve AgentHostClaude provider from session type", () => {
      const provider = getAgentSessionProvider(AgentSessionProviders.AgentHostClaude);
      assert.strictEqual(provider, AgentSessionProviders.AgentHostClaude);
    });
    test("should resolve AgentHostCodex provider from session type", () => {
      const provider = getAgentSessionProvider(AgentSessionProviders.AgentHostCodex);
      assert.strictEqual(provider, AgentSessionProviders.AgentHostCodex);
    });
    test("should handle Local provider type in model", async () => {
      return runWithFakedTimers({}, async () => {
        const instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
        const mockChatSessionsService = new MockChatSessionsService();
        instantiationService.stub(IChatSessionsService, mockChatSessionsService);
        instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(AgentSessionProviders.Local, controller);
        const viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.providerType, AgentSessionProviders.Local);
        assert.strictEqual(session.icon.id, Codicon.vm.id);
        assert.strictEqual(session.providerLabel, getAgentSessionProviderName(AgentSessionProviders.Local));
      });
    });
    test("should handle Background provider type in model", async () => {
      return runWithFakedTimers({}, async () => {
        const instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
        const mockChatSessionsService = new MockChatSessionsService();
        instantiationService.stub(IChatSessionsService, mockChatSessionsService);
        instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(AgentSessionProviders.Background, controller);
        const viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.providerType, AgentSessionProviders.Background);
        assert.strictEqual(session.icon.id, Codicon.copilot.id);
        assert.strictEqual(session.providerLabel, getAgentSessionProviderName(AgentSessionProviders.Background));
      });
    });
    test("should handle Cloud provider type in model", async () => {
      return runWithFakedTimers({}, async () => {
        const instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
        const mockChatSessionsService = new MockChatSessionsService();
        instantiationService.stub(IChatSessionsService, mockChatSessionsService);
        instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(AgentSessionProviders.Cloud, controller);
        const viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.providerType, AgentSessionProviders.Cloud);
        assert.strictEqual(session.icon.id, Codicon.cloud.id);
        assert.strictEqual(session.providerLabel, getAgentSessionProviderName(AgentSessionProviders.Cloud));
      });
    });
    test("should use custom icon from session item", async () => {
      return runWithFakedTimers({}, async () => {
        const instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
        const mockChatSessionsService = new MockChatSessionsService();
        instantiationService.stub(IChatSessionsService, mockChatSessionsService);
        instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
        const customIcon = ThemeIcon.fromId("beaker");
        const controller = new StaticChatSessionItemController([{
          resource: URI.parse("test://session-1"),
          label: "Test Session",
          iconPath: customIcon,
          timing: makeNewSessionTiming()
        }]);
        mockChatSessionsService.registerChatSessionItemController("custom-type", controller);
        const viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.icon.id, customIcon.id);
      });
    });
    test("should use default icon for custom provider without iconPath", async () => {
      return runWithFakedTimers({}, async () => {
        const instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
        const mockChatSessionsService = new MockChatSessionsService();
        instantiationService.stub(IChatSessionsService, mockChatSessionsService);
        instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController("custom-type", controller);
        const viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        await viewModel.resolve(void 0);
        const session = viewModel.sessions[0];
        assert.strictEqual(session.icon.id, Codicon.terminal.id);
      });
    });
  });
  suite("AgentSessionsViewModel - getAgentCanContinueIn", () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test("should return true for Cloud provider", () => {
      const result = getAgentCanContinueIn(AgentSessionProviders.Cloud);
      assert.strictEqual(result, true);
    });
    test("should return false for Growth provider", () => {
      const result = getAgentCanContinueIn(AgentSessionProviders.Growth);
      assert.strictEqual(result, false);
    });
    test("should return true for the Copilot agent host provider", () => {
      const result = getAgentCanContinueIn(AgentSessionProviders.AgentHostCopilot);
      assert.strictEqual(result, true);
    });
    test("should return true for dynamically registered agent host session types", () => {
      assert.strictEqual(getAgentCanContinueIn("agent-host-codex"), true);
      assert.strictEqual(getAgentCanContinueIn("agent-host-claude"), true);
      assert.strictEqual(getAgentCanContinueIn("remote-myauthority-copilot"), true);
    });
    test("should return false for unknown extension-host session types", () => {
      assert.strictEqual(getAgentCanContinueIn("some-extension-session"), false);
    });
  });
  suite("AgentSessionsViewModel - Cancellation and Lifecycle", () => {
    const disposables = new DisposableStore();
    let mockChatSessionsService;
    let mockLifecycleService;
    let instantiationService;
    let viewModel;
    setup(() => {
      mockChatSessionsService = new MockChatSessionsService();
      mockLifecycleService = disposables.add(new TestLifecycleService());
      instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
      instantiationService.stub(IChatSessionsService, mockChatSessionsService);
      instantiationService.stub(ILifecycleService, mockLifecycleService);
    });
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("should not resolve if lifecycle will shutdown", async () => {
      return runWithFakedTimers({}, async () => {
        const controller = new StaticChatSessionItemController([makeSimpleSessionItem("session-1")]);
        mockChatSessionsService.registerChatSessionItemController(chatSessionTestType, controller);
        viewModel = disposables.add(instantiationService.createInstance(AgentSessionsModel));
        mockLifecycleService.willShutdown = true;
        await viewModel.resolve(void 0);
        assert.strictEqual(viewModel.sessions.length, 0);
      });
    });
  });
  suite("AgentSessionsFilter - Dynamic Provider Registration", () => {
    const disposables = new DisposableStore();
    let mockChatSessionsService;
    let instantiationService;
    setup(() => {
      mockChatSessionsService = new MockChatSessionsService();
      instantiationService = disposables.add(workbenchInstantiationService(void 0, disposables));
      instantiationService.stub(IChatSessionsService, mockChatSessionsService);
    });
    teardown(() => {
      disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test("should respond to onDidChangeAvailability", () => {
      const filter = disposables.add(instantiationService.createInstance(
        AgentSessionsFilter,
        { filterMenuId: MenuId.ViewTitle }
      ));
      disposables.add(filter.onDidChange(() => {
      }));
      mockChatSessionsService.fireDidChangeAvailability();
    });
  });
});
const chatSessionTestType = "test-type";
function makeSimpleSessionItem(id, overrides) {
  return {
    resource: URI.parse(`${chatSessionTestType}://${id}`),
    label: `Session ${id}`,
    timing: makeNewSessionTiming(),
    ...overrides
  };
}
function makeNewSessionTiming(options) {
  const now = Date.now();
  return {
    created: options?.created ?? now,
    lastRequestStarted: options?.lastRequestStarted,
    lastRequestEnded: options?.lastRequestEnded
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uVmlld01vZGVsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25zTW9kZWwsIElBZ2VudFNlc3Npb24sIGlzQWdlbnRTZXNzaW9uLCBpc0FnZW50U2Vzc2lvbnNNb2RlbCwgaXNMb2NhbEFnZW50U2Vzc2lvbkl0ZW0gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc01vZGVsLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbnNGaWx0ZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc0ZpbHRlci5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvblN0YXR1cywgSUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIsIElDaGF0U2Vzc2lvbkl0ZW0sIElDaGF0U2Vzc2lvbkl0ZW1zRGVsdGEsIElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2NrQ2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q2hhdFdpZGdldFNlcnZpY2UsIFRlc3RMaWZlY3ljbGVTZXJ2aWNlLCB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvblByb3ZpZGVycywgZ2V0QWdlbnRDYW5Db250aW51ZUluLCBnZXRBZ2VudFNlc3Npb25Qcm92aWRlciwgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJJY29uLCBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9ucy5qcyc7XG5cbmNsYXNzIFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIgaW1wbGVtZW50cyBJQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlciB7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcyA9IEV2ZW50Lk5vbmU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uSXRlbXM6IHJlYWRvbmx5IElDaGF0U2Vzc2lvbkl0ZW1bXSxcblx0KSB7IH1cblxuXHRnZXQgaXRlbXMoKTogcmVhZG9ubHkgSUNoYXRTZXNzaW9uSXRlbVtdIHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uSXRlbXM7XG5cdH1cblxuXHRhc3luYyByZWZyZXNoKCk6IFByb21pc2U8dm9pZD4geyB9XG59XG5cblxuc3VpdGUoJ0FnZW50U2Vzc2lvbnMnLCAoKSA9PiB7XG5cblx0c3VpdGUoJ0FnZW50U2Vzc2lvbnNWaWV3TW9kZWwnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRsZXQgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2U6IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlO1xuXHRcdGxldCBtb2NrTGlmZWN5Y2xlU2VydmljZTogVGVzdExpZmVjeWNsZVNlcnZpY2U7XG5cdFx0bGV0IHZpZXdNb2RlbDogQWdlbnRTZXNzaW9uc01vZGVsO1xuXHRcdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlVmlld01vZGVsKCk6IEFnZW50U2Vzc2lvbnNNb2RlbCB7XG5cdFx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBZ2VudFNlc3Npb25zTW9kZWwsXG5cdFx0XHQpKTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiByZWdpc3RlckNvbnRyaWJ1dGlvbih0eXBlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uQ29udHJpYnV0aW9uKHsgdHlwZSwgbmFtZTogdHlwZSwgZGlzcGxheU5hbWU6IHR5cGUsIGRlc2NyaXB0aW9uOiB0eXBlIH0pKTtcblx0XHR9XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZSA9IG5ldyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSgpO1xuXHRcdFx0bW9ja0xpZmVjeWNsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcykpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGlmZWN5Y2xlU2VydmljZSwgbW9ja0xpZmVjeWNsZVNlcnZpY2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9KTtcblxuXHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGluaXRpYWxpemUgd2l0aCBlbXB0eSBzZXNzaW9ucycsICgpID0+IHtcblx0XHRcdHZpZXdNb2RlbCA9IGNyZWF0ZVZpZXdNb2RlbCgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzb2x2ZSBzZXNzaW9ucyBmcm9tIGNvbnRyb2xsZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjaGF0U2Vzc2lvblR5cGUgPSBjaGF0U2Vzc2lvblRlc3RUeXBlO1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW1xuXHRcdFx0XHRcdG1ha2VTaW1wbGVTZXNzaW9uSXRlbSgnc2Vzc2lvbi0xJywge1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdUZXN0IFNlc3Npb24gMSdcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRtYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMicsIHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnVGVzdCBTZXNzaW9uIDInXG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVHlwZSwgY29udHJvbGxlcik7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGNyZWF0ZVZpZXdNb2RlbCgpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zWzBdLnJlc291cmNlLnRvU3RyaW5nKCksIGAke2NoYXRTZXNzaW9uVGVzdFR5cGV9Oi8vc2Vzc2lvbi0xYCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnNbMF0ubGFiZWwsICdUZXN0IFNlc3Npb24gMScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zWzFdLnJlc291cmNlLnRvU3RyaW5nKCksIGAke2NoYXRTZXNzaW9uVGVzdFR5cGV9Oi8vc2Vzc2lvbi0yYCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnNbMV0ubGFiZWwsICdUZXN0IFNlc3Npb24gMicpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzb2x2ZSBzZXNzaW9ucyBmcm9tIG11bHRpcGxlIGNvbnRyb2xsZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyMSA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScpXSk7XG5cblx0XHRcdFx0Y29uc3QgY29udHJvbGxlcjIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTInKV0pO1xuXG5cdFx0XHRcdHJlZ2lzdGVyQ29udHJpYnV0aW9uKCd0eXBlLTEnKTtcblx0XHRcdFx0cmVnaXN0ZXJDb250cmlidXRpb24oJ3R5cGUtMicpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoJ3R5cGUtMScsIGNvbnRyb2xsZXIxKTtcblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKCd0eXBlLTInLCBjb250cm9sbGVyMik7XG5cblx0XHRcdFx0dmlld01vZGVsID0gY3JlYXRlVmlld01vZGVsKCk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zLmxlbmd0aCwgMik7XG5cdFx0XHRcdGNvbnN0IHVyaXMgPSB2aWV3TW9kZWwuc2Vzc2lvbnMubWFwKHMgPT4gcy5yZXNvdXJjZS50b1N0cmluZygpKS5zb3J0KCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXJpcywgW1xuXHRcdFx0XHRcdGAke2NoYXRTZXNzaW9uVGVzdFR5cGV9Oi8vc2Vzc2lvbi0xYCxcblx0XHRcdFx0XHRgJHtjaGF0U2Vzc2lvblRlc3RUeXBlfTovL3Nlc3Npb24tMmAsXG5cdFx0XHRcdF0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmlyZSBvbldpbGxSZXNvbHZlIGFuZCBvbkRpZFJlc29sdmUgZXZlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW10pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gY3JlYXRlVmlld01vZGVsKCk7XG5cblx0XHRcdFx0bGV0IHdpbGxSZXNvbHZlRmlyZWQgPSBmYWxzZTtcblx0XHRcdFx0bGV0IGRpZFJlc29sdmVGaXJlZCA9IGZhbHNlO1xuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh2aWV3TW9kZWwub25XaWxsUmVzb2x2ZShwcm92aWRlciA9PiB7XG5cdFx0XHRcdFx0d2lsbFJlc29sdmVGaXJlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBwcm92aWRlciwgJ3N0cmluZycsICdvbldpbGxSZXNvbHZlIHNob3VsZCBjYXJyeSB0aGUgcHJvdmlkZXInKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkUmVzb2x2ZUZpcmVkLCBmYWxzZSwgJ29uRGlkUmVzb2x2ZSBzaG91bGQgbm90IGZpcmUgYmVmb3JlIG9uV2lsbFJlc29sdmUgY29tcGxldGVzJyk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodmlld01vZGVsLm9uRGlkUmVzb2x2ZShwcm92aWRlciA9PiB7XG5cdFx0XHRcdFx0ZGlkUmVzb2x2ZUZpcmVkID0gdHJ1ZTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIHByb3ZpZGVyLCAnc3RyaW5nJywgJ29uRGlkUmVzb2x2ZSBzaG91bGQgY2FycnkgdGhlIHByb3ZpZGVyJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpbGxSZXNvbHZlRmlyZWQsIHRydWUsICdvbldpbGxSZXNvbHZlIHNob3VsZCBmaXJlIGJlZm9yZSBvbkRpZFJlc29sdmUnKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpbGxSZXNvbHZlRmlyZWQsIHRydWUsICdvbldpbGxSZXNvbHZlIHNob3VsZCBoYXZlIGZpcmVkJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWRSZXNvbHZlRmlyZWQsIHRydWUsICdvbkRpZFJlc29sdmUgc2hvdWxkIGhhdmUgZmlyZWQnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZpcmUgb25EaWRDaGFuZ2VTZXNzaW9ucyBldmVudCBhZnRlciByZXNvbHZpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnKV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gY3JlYXRlVmlld01vZGVsKCk7XG5cblx0XHRcdFx0bGV0IHNlc3Npb25zQ2hhbmdlZEZpcmVkID0gZmFsc2U7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh2aWV3TW9kZWwub25EaWRDaGFuZ2VTZXNzaW9ucygoKSA9PiB7XG5cdFx0XHRcdFx0c2Vzc2lvbnNDaGFuZ2VkRmlyZWQgPSB0cnVlO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNDaGFuZ2VkRmlyZWQsIHRydWUsICdvbkRpZENoYW5nZVNlc3Npb25zIHNob3VsZCBoYXZlIGZpcmVkJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgc2Vzc2lvbiB3aXRoIGFsbCBwcm9wZXJ0aWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjcmVhdGVkID0gRGF0ZS5ub3coKTtcblx0XHRcdFx0Y29uc3QgbGFzdFJlcXVlc3RFbmRlZCA9IGNyZWF0ZWQgKyAxMDAwO1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbe1xuXHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLTEnKSxcblx0XHRcdFx0XHRsYWJlbDogJ1Rlc3QgU2Vzc2lvbicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5ldyBNYXJrZG93blN0cmluZygnKipCb2xkKiogZGVzY3JpcHRpb24nKSxcblx0XHRcdFx0XHRzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0XHR0b29sdGlwOiAnU2Vzc2lvbiB0b29sdGlwJyxcblx0XHRcdFx0XHRpY29uUGF0aDogVGhlbWVJY29uLmZyb21JZCgnY2hlY2snKSxcblx0XHRcdFx0XHR0aW1pbmc6IHsgY3JlYXRlZCwgbGFzdFJlcXVlc3RTdGFydGVkOiBjcmVhdGVkLCBsYXN0UmVxdWVzdEVuZGVkIH0sXG5cdFx0XHRcdFx0Y2hhbmdlczogeyBmaWxlczogMSwgaW5zZXJ0aW9uczogMTAsIGRlbGV0aW9uczogNSB9XG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcik7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGNyZWF0ZVZpZXdNb2RlbCgpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpLCAndGVzdDovL3Nlc3Npb24tMScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5sYWJlbCwgJ1Rlc3QgU2Vzc2lvbicpO1xuXHRcdFx0XHRhc3NlcnQub2soc2Vzc2lvbi5kZXNjcmlwdGlvbiBpbnN0YW5jZW9mIE1hcmtkb3duU3RyaW5nKTtcblx0XHRcdFx0aWYgKHNlc3Npb24uZGVzY3JpcHRpb24gaW5zdGFuY2VvZiBNYXJrZG93blN0cmluZykge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmRlc2NyaXB0aW9uLnZhbHVlLCAnKipCb2xkKiogZGVzY3JpcHRpb24nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5zdGF0dXMsIENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLnRpbWluZy5jcmVhdGVkLCBjcmVhdGVkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQsIGxhc3RSZXF1ZXN0RW5kZWQpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb24uY2hhbmdlcywgeyBmaWxlczogMSwgaW5zZXJ0aW9uczogMTAsIGRlbGV0aW9uczogNSB9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSByZXNvbHZlIHdpdGggc3BlY2lmaWMgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIxID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VTaW1wbGVTZXNzaW9uSXRlbSgnc2Vzc2lvbi0xJyldKTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyMiA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMicpXSk7XG5cblx0XHRcdFx0cmVnaXN0ZXJDb250cmlidXRpb24oJ3R5cGUtMScpO1xuXHRcdFx0XHRyZWdpc3RlckNvbnRyaWJ1dGlvbigndHlwZS0yJyk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoJ3R5cGUtMScsIGNvbnRyb2xsZXIxKSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoJ3R5cGUtMicsIGNvbnRyb2xsZXIyKSk7XG5cblx0XHRcdFx0dmlld01vZGVsID0gY3JlYXRlVmlld01vZGVsKCk7XG5cblx0XHRcdFx0Ly8gRmlyc3QgcmVzb2x2ZSBhbGxcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDIpO1xuXG5cdFx0XHRcdC8vIE5vdyByZXNvbHZlIG9ubHkgdHlwZS0xXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKCd0eXBlLTEnKTtcblx0XHRcdFx0Ly8gUGVyLXByb3ZpZGVyIHJlc29sdXRpb24gcHJlc2VydmVzIHNlc3Npb25zIGZyb20gb3RoZXIgcHJvdmlkZXJzXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAyKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSByZXNvbHZlIHdpdGggbXVsdGlwbGUgc3BlY2lmaWMgY29udHJvbGxlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIxID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VTaW1wbGVTZXNzaW9uSXRlbSgnc2Vzc2lvbi0xJyldKTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyMiA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMicpXSk7XG5cblx0XHRcdFx0cmVnaXN0ZXJDb250cmlidXRpb24oJ3R5cGUtMScpO1xuXHRcdFx0XHRyZWdpc3RlckNvbnRyaWJ1dGlvbigndHlwZS0yJyk7XG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcigndHlwZS0xJywgY29udHJvbGxlcjEpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoJ3R5cGUtMicsIGNvbnRyb2xsZXIyKTtcblxuXHRcdFx0XHR2aWV3TW9kZWwgPSBjcmVhdGVWaWV3TW9kZWwoKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZShbJ3R5cGUtMScsICd0eXBlLTInXSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDIpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzcG9uZCB0byBvbkRpZENoYW5nZUl0ZW1zUHJvdmlkZXJzIGV2ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjaGF0U2Vzc2lvblR5cGUgPSBjaGF0U2Vzc2lvblRlc3RUeXBlO1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VTaW1wbGVTZXNzaW9uSXRlbSgnc2Vzc2lvbi0xJyldKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gY3JlYXRlVmlld01vZGVsKCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbnNDaGFuZ2VkUHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZSh2aWV3TW9kZWwub25EaWRDaGFuZ2VTZXNzaW9ucyk7XG5cblx0XHRcdFx0Ly8gVHJpZ2dlciBldmVudCAtIHRoaXMgc2hvdWxkIGF1dG9tYXRpY2FsbHkgY2FsbCByZXNvbHZlXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLmZpcmVEaWRDaGFuZ2VJdGVtc1Byb3ZpZGVycyh7IGNoYXRTZXNzaW9uVHlwZSB9KTtcblxuXHRcdFx0XHQvLyBXYWl0IGZvciB0aGUgc2Vzc2lvbnMgdG8gYmUgcmVzb2x2ZWRcblx0XHRcdFx0YXdhaXQgc2Vzc2lvbnNDaGFuZ2VkUHJvbWlzZTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXNwb25kIHRvIG9uRGlkQ2hhbmdlQXZhaWxhYmlsaXR5IGV2ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VTaW1wbGVTZXNzaW9uSXRlbSgnc2Vzc2lvbi0xJyldKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcik7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGNyZWF0ZVZpZXdNb2RlbCgpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25zQ2hhbmdlZFByb21pc2UgPSBFdmVudC50b1Byb21pc2Uodmlld01vZGVsLm9uRGlkQ2hhbmdlU2Vzc2lvbnMpO1xuXG5cdFx0XHRcdC8vIFRyaWdnZXIgZXZlbnQgLSB0aGlzIHNob3VsZCBhdXRvbWF0aWNhbGx5IGNhbGwgcmVzb2x2ZVxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5maXJlRGlkQ2hhbmdlQXZhaWxhYmlsaXR5KCk7XG5cblx0XHRcdFx0Ly8gV2FpdCBmb3IgdGhlIHNlc3Npb25zIHRvIGJlIHJlc29sdmVkXG5cdFx0XHRcdGF3YWl0IHNlc3Npb25zQ2hhbmdlZFByb21pc2U7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzcG9uZCB0byBvbkRpZENoYW5nZVNlc3Npb25JdGVtcyBldmVudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgdGVzdFNlc3Npb24gPSBtYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScpO1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW3Rlc3RTZXNzaW9uXSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBjcmVhdGVWaWV3TW9kZWwoKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uc0NoYW5nZWRQcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHZpZXdNb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKTtcblxuXHRcdFx0XHQvLyBUcmlnZ2VyIGV2ZW50IC0gdGhpcyBzaG91bGQgYXV0b21hdGljYWxseSBjYWxsIHJlc29sdmVcblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UuZmlyZURpZENoYW5nZVNlc3Npb25JdGVtcyh7IGFkZGVkT3JVcGRhdGVkOiBbdGVzdFNlc3Npb25dIH0pO1xuXG5cdFx0XHRcdC8vIFdhaXQgZm9yIHRoZSBzZXNzaW9ucyB0byBiZSByZXNvbHZlZFxuXHRcdFx0XHRhd2FpdCBzZXNzaW9uc0NoYW5nZWRQcm9taXNlO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG1haW50YWluIHByb3ZpZGVyIHJlZmVyZW5jZSBpbiBzZXNzaW9uIHZpZXcgbW9kZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnKV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gY3JlYXRlVmlld01vZGVsKCk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnNbMF0ucHJvdmlkZXJUeXBlLCBjaGF0U2Vzc2lvblRlc3RUeXBlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBlbXB0eSBwcm92aWRlciByZXN1bHRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW10pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gY3JlYXRlVmlld01vZGVsKCk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zLmxlbmd0aCwgMCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgc2Vzc2lvbnMgd2l0aCBkaWZmZXJlbnQgc3RhdHVzZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24tZmFpbGVkJyksXG5cdFx0XHRcdFx0XHRsYWJlbDogJ0ZhaWxlZCBTZXNzaW9uJyxcblx0XHRcdFx0XHRcdHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuRmFpbGVkLFxuXHRcdFx0XHRcdFx0dGltaW5nOiBtYWtlTmV3U2Vzc2lvblRpbWluZygpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi1jb21wbGV0ZWQnKSxcblx0XHRcdFx0XHRcdGxhYmVsOiAnQ29tcGxldGVkIFNlc3Npb24nLFxuXHRcdFx0XHRcdFx0c3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdFx0XHR0aW1pbmc6IG1ha2VOZXdTZXNzaW9uVGltaW5nKClcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLWlucHJvZ3Jlc3MnKSxcblx0XHRcdFx0XHRcdGxhYmVsOiAnSW4gUHJvZ3Jlc3MgU2Vzc2lvbicsXG5cdFx0XHRcdFx0XHRzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsXG5cdFx0XHRcdFx0XHR0aW1pbmc6IG1ha2VOZXdTZXNzaW9uVGltaW5nKClcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gY3JlYXRlVmlld01vZGVsKCk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zLmxlbmd0aCwgMyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uc3RhdHVzLCBDaGF0U2Vzc2lvblN0YXR1cy5GYWlsZWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zWzFdLnN0YXR1cywgQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9uc1syXS5zdGF0dXMsIENoYXRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVwbGFjZSBzZXNzaW9ucyBvbiByZS1yZXNvbHZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsZXQgc2Vzc2lvbkNvdW50ID0gMTtcblx0XHRcdFx0bGV0IF9pdGVtczogSUNoYXRTZXNzaW9uSXRlbVtdID0gW107XG5cblx0XHRcdFx0Y29uc3QgY29udHJvbGxlcjogSUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIgPSB7XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdHJlZnJlc2g6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdF9pdGVtcyA9IFtdO1xuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzZXNzaW9uQ291bnQ7IGkrKykge1xuXHRcdFx0XHRcdFx0XHRfaXRlbXMucHVzaChtYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oYHNlc3Npb24tJHtpICsgMX1gKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXQgaXRlbXMoKSB7IHJldHVybiBfaXRlbXM7IH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcik7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGNyZWF0ZVZpZXdNb2RlbCgpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblxuXHRcdFx0XHRzZXNzaW9uQ291bnQgPSAzO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zLmxlbmd0aCwgMyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbG9jYWwgYWdlbnQgc2Vzc2lvbiB0eXBlIHNwZWNpYWxseScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFt7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignbG9jYWwtc2Vzc2lvbicpLFxuXHRcdFx0XHRcdGxhYmVsOiAnTG9jYWwgU2Vzc2lvbicsXG5cdFx0XHRcdFx0dGltaW5nOiBtYWtlTmV3U2Vzc2lvblRpbWluZygpXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIobG9jYWxDaGF0U2Vzc2lvblR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBjcmVhdGVWaWV3TW9kZWwoKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9uc1swXS5wcm92aWRlclR5cGUsIGxvY2FsQ2hhdFNlc3Npb25UeXBlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGNvcnJlY3RseSBjb25zdHJ1Y3QgcmVzb3VyY2UgVVJJcyBmb3Igc2Vzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCdjdXN0b206Ly9teS1zZXNzaW9uL3BhdGgnKTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW3tcblx0XHRcdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHRcdFx0bGFiZWw6ICdUZXN0IFNlc3Npb24nLFxuXHRcdFx0XHRcdHRpbWluZzogbWFrZU5ld1Nlc3Npb25UaW1pbmcoKVxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBjcmVhdGVWaWV3TW9kZWwoKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9uc1swXS5yZXNvdXJjZS50b1N0cmluZygpLCByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHRocm90dGxlIG11bHRpcGxlIHJhcGlkIHJlc29sdmUgY2FsbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxldCBjb250cm9sbGVyQ2FsbENvdW50ID0gMDtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyOiBJQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlciA9IHtcblx0XHRcdFx0XHRvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdFx0cmVmcmVzaDogYXN5bmMgKCkgPT4geyBjb250cm9sbGVyQ2FsbENvdW50Kys7IH0sXG5cdFx0XHRcdFx0Z2V0IGl0ZW1zKCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScpXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHQvLyBSZWdpc3RlcmluZyBjYWxscyBhIHJlZnJlc2ggaW5pdGlhbGx5XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyQ2FsbENvdW50LCAxKTtcblxuXHRcdFx0XHR2aWV3TW9kZWwgPSBjcmVhdGVWaWV3TW9kZWwoKTtcblxuXHRcdFx0XHQvLyBNYWtlIG11bHRpcGxlIHJhcGlkIHJlc29sdmUgY2FsbHNcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZVByb21pc2VzID0gW1xuXHRcdFx0XHRcdHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCksXG5cdFx0XHRcdFx0dmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKSxcblx0XHRcdFx0XHR2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpXG5cdFx0XHRcdF07XG5cblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwocmVzb2x2ZVByb21pc2VzKTtcblxuXHRcdFx0XHQvLyBTaG91bGQgb25seSBjYWxsIGNvbnRyb2xsZXIgb25jZSBtb3JlIGR1ZSB0byB0aHJvdHRsaW5nXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyQ2FsbENvdW50LCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcHJlc2VydmUgc2Vzc2lvbnMgZnJvbSBub24tcmVzb2x2ZWQgY29udHJvbGxlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxldCBjb250cm9sbGVyMUNhbGxDb3VudCA9IDA7XG5cdFx0XHRcdGxldCBjb250cm9sbGVyMkNhbGxDb3VudCA9IDA7XG5cdFx0XHRcdGxldCBfaXRlbXMxOiBJQ2hhdFNlc3Npb25JdGVtW10gPSBbXTtcblx0XHRcdFx0bGV0IF9pdGVtczI6IElDaGF0U2Vzc2lvbkl0ZW1bXSA9IFtdO1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIxOiBJQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlciA9IHtcblx0XHRcdFx0XHRvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdFx0cmVmcmVzaDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29udHJvbGxlcjFDYWxsQ291bnQrKztcblx0XHRcdFx0XHRcdF9pdGVtczEgPSBbe1xuXHRcdFx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi0xJyksXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBgU2Vzc2lvbiAxIChjYWxsICR7Y29udHJvbGxlcjFDYWxsQ291bnR9KWAsXG5cdFx0XHRcdFx0XHRcdHRpbWluZzogbWFrZU5ld1Nlc3Npb25UaW1pbmcoKVxuXHRcdFx0XHRcdFx0fV07XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXQgaXRlbXMoKSB7IHJldHVybiBfaXRlbXMxOyB9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgY29udHJvbGxlcjI6IElDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyID0ge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtczogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHRyZWZyZXNoOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb250cm9sbGVyMkNhbGxDb3VudCsrO1xuXHRcdFx0XHRcdFx0X2l0ZW1zMiA9IFt7XG5cdFx0XHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLTInKSxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGBTZXNzaW9uIDIgKGNhbGwgJHtjb250cm9sbGVyMkNhbGxDb3VudH0pYCxcblx0XHRcdFx0XHRcdFx0dGltaW5nOiBtYWtlTmV3U2Vzc2lvblRpbWluZygpXG5cdFx0XHRcdFx0XHR9XTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldCBpdGVtcygpIHsgcmV0dXJuIF9pdGVtczI7IH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRyZWdpc3RlckNvbnRyaWJ1dGlvbigndHlwZS0xJyk7XG5cdFx0XHRcdHJlZ2lzdGVyQ29udHJpYnV0aW9uKCd0eXBlLTInKTtcblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKCd0eXBlLTEnLCBjb250cm9sbGVyMSk7XG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcigndHlwZS0yJywgY29udHJvbGxlcjIpO1xuXG5cdFx0XHRcdHZpZXdNb2RlbCA9IGNyZWF0ZVZpZXdNb2RlbCgpO1xuXG5cdFx0XHRcdC8vIEZpcnN0IHJlc29sdmUgYWxsXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIxQ2FsbENvdW50LCAyKTsgLy8gT25lIGZyb20gcmVnaXN0cmF0aW9uIGFuZCBvbmUgZnJvbSByZXNvbHZlXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyMkNhbGxDb3VudCwgMik7IC8vIE9uZSBmcm9tIHJlZ2lzdHJhdGlvbiBhbmQgb25lIGZyb20gcmVzb2x2ZVxuXG5cdFx0XHRcdC8vIE5vdyByZXNvbHZlIG9ubHkgdHlwZS0yXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKCd0eXBlLTInKTtcblxuXHRcdFx0XHQvLyBQZXItcHJvdmlkZXIgcmVzb2x1dGlvbjogdHlwZS0xIHNlc3Npb25zIGFyZSBwcmVzZXJ2ZWRcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDIpO1xuXHRcdFx0XHQvLyBDb250cm9sbGVyIDEgc2hvdWxkIG5vdCBiZSBjYWxsZWQgYWdhaW5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIxQ2FsbENvdW50LCAyKTtcblx0XHRcdFx0Ly8gQ29udHJvbGxlciAyIHNob3VsZCBiZSBjYWxsZWQgYWdhaW5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIyQ2FsbENvdW50LCAzKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc29sdmUgcHJvdmlkZXJzIGluZGVwZW5kZW50bHkgKHBlci1wcm92aWRlciBkZWxheWVycyknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxldCBjb250cm9sbGVyMVJlZnJlc2hDb3VudCA9IDA7XG5cdFx0XHRcdGxldCBjb250cm9sbGVyMlJlZnJlc2hDb3VudCA9IDA7XG5cdFx0XHRcdGxldCBfaXRlbXMxOiBJQ2hhdFNlc3Npb25JdGVtW10gPSBbXTtcblx0XHRcdFx0bGV0IF9pdGVtczI6IElDaGF0U2Vzc2lvbkl0ZW1bXSA9IFtdO1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIxOiBJQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlciA9IHtcblx0XHRcdFx0XHRvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdFx0cmVmcmVzaDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29udHJvbGxlcjFSZWZyZXNoQ291bnQrKztcblx0XHRcdFx0XHRcdF9pdGVtczEgPSBbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnLCB7IGxhYmVsOiBgU2Vzc2lvbiAxIHYke2NvbnRyb2xsZXIxUmVmcmVzaENvdW50fWAgfSldO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0IGl0ZW1zKCkgeyByZXR1cm4gX2l0ZW1zMTsgfVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIyOiBJQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlciA9IHtcblx0XHRcdFx0XHRvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdFx0cmVmcmVzaDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29udHJvbGxlcjJSZWZyZXNoQ291bnQrKztcblx0XHRcdFx0XHRcdF9pdGVtczIgPSBbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTInLCB7IGxhYmVsOiBgU2Vzc2lvbiAyIHYke2NvbnRyb2xsZXIyUmVmcmVzaENvdW50fWAgfSldO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0IGl0ZW1zKCkgeyByZXR1cm4gX2l0ZW1zMjsgfVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHJlZ2lzdGVyQ29udHJpYnV0aW9uKCd0eXBlLTEnKTtcblx0XHRcdFx0cmVnaXN0ZXJDb250cmlidXRpb24oJ3R5cGUtMicpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoJ3R5cGUtMScsIGNvbnRyb2xsZXIxKTtcblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKCd0eXBlLTInLCBjb250cm9sbGVyMik7XG5cblx0XHRcdFx0dmlld01vZGVsID0gY3JlYXRlVmlld01vZGVsKCk7XG5cblx0XHRcdFx0Ly8gUmVzb2x2ZSBhbGwgdG8gcG9wdWxhdGUgYm90aCBwcm92aWRlcnNcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9ucy5sZW5ndGgsIDIpO1xuXG5cdFx0XHRcdC8vIFJlc29sdmUgb25seSB0eXBlLTE6IHNob3VsZCByZWZyZXNoIG9ubHkgdHlwZS0xLCBwcmVzZXJ2ZSB0eXBlLTJcblx0XHRcdFx0Y29uc3QgdHlwZTFSZWZyZXNoQmVmb3JlID0gY29udHJvbGxlcjFSZWZyZXNoQ291bnQ7XG5cdFx0XHRcdGNvbnN0IHR5cGUyUmVmcmVzaEJlZm9yZSA9IGNvbnRyb2xsZXIyUmVmcmVzaENvdW50O1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSgndHlwZS0xJyk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIxUmVmcmVzaENvdW50LCB0eXBlMVJlZnJlc2hCZWZvcmUgKyAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIyUmVmcmVzaENvdW50LCB0eXBlMlJlZnJlc2hCZWZvcmUpOyAvLyBub3QgcmVmcmVzaGVkXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAyKTsgLy8gdHlwZS0yIHNlc3Npb24gcHJlc2VydmVkXG5cblx0XHRcdFx0Ly8gUmVzb2x2ZSBvbmx5IHR5cGUtMjogc2hvdWxkIHJlZnJlc2ggb25seSB0eXBlLTIsIHByZXNlcnZlIHR5cGUtMVxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSgndHlwZS0yJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyMlJlZnJlc2hDb3VudCwgdHlwZTJSZWZyZXNoQmVmb3JlICsgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAyKTsgLy8gdHlwZS0xIHNlc3Npb24gcHJlc2VydmVkXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhY2N1bXVsYXRlIHByb3ZpZGVycyB3aGVuIHJlc29sdmUgaXMgY2FsbGVkIHdpdGggZGlmZmVyZW50IHByb3ZpZGVyIHR5cGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsZXQgcmVzb2x2ZUNvdW50ID0gMDtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRQcm92aWRlcnM6IChzdHJpbmcgfCB1bmRlZmluZWQpW10gPSBbXTtcblx0XHRcdFx0bGV0IF9pdGVtczE6IElDaGF0U2Vzc2lvbkl0ZW1bXSA9IFtdO1xuXHRcdFx0XHRsZXQgX2l0ZW1zMjogSUNoYXRTZXNzaW9uSXRlbVtdID0gW107XG5cblx0XHRcdFx0Y29uc3QgY29udHJvbGxlcjE6IElDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyID0ge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtczogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHRyZWZyZXNoOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlQ291bnQrKztcblx0XHRcdFx0XHRcdHJlc29sdmVkUHJvdmlkZXJzLnB1c2goJ3R5cGUtMScpO1xuXHRcdFx0XHRcdFx0X2l0ZW1zMSA9IFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScpXTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldCBpdGVtcygpIHsgcmV0dXJuIF9pdGVtczE7IH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyMjogSUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIgPSB7XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdHJlZnJlc2g6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHJlc29sdmVDb3VudCsrO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZWRQcm92aWRlcnMucHVzaCgndHlwZS0yJyk7XG5cdFx0XHRcdFx0XHRfaXRlbXMyID0gW3tcblx0XHRcdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24tMicpLFxuXHRcdFx0XHRcdFx0XHRsYWJlbDogJ1Nlc3Npb24gMicsXG5cdFx0XHRcdFx0XHRcdHRpbWluZzogbWFrZU5ld1Nlc3Npb25UaW1pbmcoKVxuXHRcdFx0XHRcdFx0fV07XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXQgaXRlbXMoKSB7IHJldHVybiBfaXRlbXMyOyB9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0cmVnaXN0ZXJDb250cmlidXRpb24oJ3R5cGUtMScpO1xuXHRcdFx0XHRyZWdpc3RlckNvbnRyaWJ1dGlvbigndHlwZS0yJyk7XG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcigndHlwZS0xJywgY29udHJvbGxlcjEpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoJ3R5cGUtMicsIGNvbnRyb2xsZXIyKTtcblxuXHRcdFx0XHR2aWV3TW9kZWwgPSBjcmVhdGVWaWV3TW9kZWwoKTtcblxuXHRcdFx0XHQvLyBDYWxsIHJlc29sdmUgd2l0aCBkaWZmZXJlbnQgdHlwZXMgcmFwaWRseSAtIHRoZXkgc2hvdWxkIGFjY3VtdWxhdGVcblx0XHRcdFx0Y29uc3QgcHJvbWlzZTEgPSB2aWV3TW9kZWwucmVzb2x2ZSgndHlwZS0xJyk7XG5cdFx0XHRcdGNvbnN0IHByb21pc2UyID0gdmlld01vZGVsLnJlc29sdmUoWyd0eXBlLTInXSk7XG5cblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW3Byb21pc2UxLCBwcm9taXNlMl0pO1xuXG5cdFx0XHRcdC8vIEJvdGggcHJvdmlkZXJzIHNob3VsZCBiZSByZXNvbHZlZFxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zLmxlbmd0aCwgMik7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0FnZW50U2Vzc2lvbnNWaWV3TW9kZWwgLSBIZWxwZXIgRnVuY3Rpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9KTtcblxuXHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdFx0dGVzdCgnaXNMb2NhbEFnZW50U2Vzc2lvbkl0ZW0gc2hvdWxkIGlkZW50aWZ5IGxvY2FsIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9jYWxTZXNzaW9uOiBJQWdlbnRTZXNzaW9uID0ge1xuXHRcdFx0XHRwcm92aWRlclR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLFxuXHRcdFx0XHRwcm92aWRlckxhYmVsOiAnTG9jYWwnLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmNoYXRTcGFya2xlLFxuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vbG9jYWwtMScpLFxuXHRcdFx0XHRsYWJlbDogJ0xvY2FsJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0Jyxcblx0XHRcdFx0dGltaW5nOiBtYWtlTmV3U2Vzc2lvblRpbWluZygpLFxuXHRcdFx0XHRzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0aXNBcmNoaXZlZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdHNldEFyY2hpdmVkOiBhcmNoaXZlZCA9PiB7IH0sXG5cdFx0XHRcdGlzUGlubmVkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0c2V0UGlubmVkOiBwaW5uZWQgPT4geyB9LFxuXHRcdFx0XHRpc1JlYWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRpc01hcmtlZFVucmVhZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdHNldFJlYWQ6IHJlYWQgPT4geyB9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZW1vdGVTZXNzaW9uOiBJQWdlbnRTZXNzaW9uID0ge1xuXHRcdFx0XHRwcm92aWRlclR5cGU6ICdyZW1vdGUnLFxuXHRcdFx0XHRwcm92aWRlckxhYmVsOiAnUmVtb3RlJyxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5jaGF0U3BhcmtsZSxcblx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3JlbW90ZS0xJyksXG5cdFx0XHRcdGxhYmVsOiAnUmVtb3RlJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0Jyxcblx0XHRcdFx0dGltaW5nOiBtYWtlTmV3U2Vzc2lvblRpbWluZygpLFxuXHRcdFx0XHRzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0aXNBcmNoaXZlZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdHNldEFyY2hpdmVkOiBhcmNoaXZlZCA9PiB7IH0sXG5cdFx0XHRcdGlzUGlubmVkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0c2V0UGlubmVkOiBwaW5uZWQgPT4geyB9LFxuXHRcdFx0XHRpc1JlYWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRpc01hcmtlZFVucmVhZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdHNldFJlYWQ6IHJlYWQgPT4geyB9XG5cdFx0XHR9O1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNMb2NhbEFnZW50U2Vzc2lvbkl0ZW0obG9jYWxTZXNzaW9uKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNMb2NhbEFnZW50U2Vzc2lvbkl0ZW0ocmVtb3RlU2Vzc2lvbiksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzQWdlbnRTZXNzaW9uIHNob3VsZCBpZGVudGlmeSBzZXNzaW9uIHZpZXcgbW9kZWxzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbjogSUFnZW50U2Vzc2lvbiA9IHtcblx0XHRcdFx0cHJvdmlkZXJUeXBlOiAndGVzdCcsXG5cdFx0XHRcdHByb3ZpZGVyTGFiZWw6ICdMb2NhbCcsXG5cdFx0XHRcdGljb246IENvZGljb24uY2hhdFNwYXJrbGUsXG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly90ZXN0LTEnKSxcblx0XHRcdFx0bGFiZWw6ICdUZXN0Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0Jyxcblx0XHRcdFx0dGltaW5nOiBtYWtlTmV3U2Vzc2lvblRpbWluZygpLFxuXHRcdFx0XHRzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0aXNBcmNoaXZlZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdHNldEFyY2hpdmVkOiBhcmNoaXZlZCA9PiB7IH0sXG5cdFx0XHRcdGlzUGlubmVkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0c2V0UGlubmVkOiBwaW5uZWQgPT4geyB9LFxuXHRcdFx0XHRpc1JlYWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRpc01hcmtlZFVucmVhZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdHNldFJlYWQ6IHJlYWQgPT4geyB9XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBUZXN0IHdpdGggYSBzZXNzaW9uIG9iamVjdFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQWdlbnRTZXNzaW9uKHNlc3Npb24pLCB0cnVlKTtcblxuXHRcdFx0Ly8gVGVzdCB3aXRoIGEgc2Vzc2lvbnMgY29udGFpbmVyIC0gcGFzcyBhcyBzZXNzaW9uIHRvIHNlZSBpdCByZXR1cm5zIGZhbHNlXG5cdFx0XHRjb25zdCBzZXNzaW9uT3JDb250YWluZXI6IElBZ2VudFNlc3Npb24gPSBzZXNzaW9uO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQWdlbnRTZXNzaW9uKHNlc3Npb25PckNvbnRhaW5lciksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXNBZ2VudFNlc3Npb25zVmlld01vZGVsIHNob3VsZCBpZGVudGlmeSBzZXNzaW9ucyB2aWV3IG1vZGVscycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb246IElBZ2VudFNlc3Npb24gPSB7XG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogJ3Rlc3QnLFxuXHRcdFx0XHRwcm92aWRlckxhYmVsOiAnTG9jYWwnLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmNoYXRTcGFya2xlLFxuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vdGVzdC0xJyksXG5cdFx0XHRcdGxhYmVsOiAnVGVzdCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCcsXG5cdFx0XHRcdHRpbWluZzogbWFrZU5ld1Nlc3Npb25UaW1pbmcoKSxcblx0XHRcdFx0c3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdGlzQXJjaGl2ZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRzZXRBcmNoaXZlZDogYXJjaGl2ZWQgPT4geyB9LFxuXHRcdFx0XHRpc1Bpbm5lZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdHNldFBpbm5lZDogcGlubmVkID0+IHsgfSxcblx0XHRcdFx0aXNSZWFkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0aXNNYXJrZWRVbnJlYWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRzZXRSZWFkOiByZWFkID0+IHsgfVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gVGVzdCB3aXRoIGFjdHVhbCB2aWV3IG1vZGVsXG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0Y29uc3QgbGlmZWN5Y2xlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMaWZlY3ljbGVTZXJ2aWNlLCBsaWZlY3ljbGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGFjdHVhbFZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0QWdlbnRTZXNzaW9uc01vZGVsLFxuXHRcdFx0KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBZ2VudFNlc3Npb25zTW9kZWwoYWN0dWFsVmlld01vZGVsKSwgdHJ1ZSk7XG5cblx0XHRcdC8vIFRlc3Qgd2l0aCBzZXNzaW9uIG9iamVjdFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQWdlbnRTZXNzaW9uc01vZGVsKHNlc3Npb24pLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBZ2VudFNlc3Npb25zRmlsdGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHN0b3JhZ2VLZXkgPSAnYWdlbnRTZXNzaW9ucy5maWx0ZXJFeGNsdWRlcy5hZ2VudHNlc3Npb25zdmlld2VyZmlsdGVyc3VibWVudSc7XG5cdFx0bGV0IG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlOiBNb2NrQ2hhdFNlc3Npb25zU2VydmljZTtcblx0XHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZVNlc3Npb24ob3ZlcnJpZGVzOiBQYXJ0aWFsPElBZ2VudFNlc3Npb24+ID0ge30pOiBJQWdlbnRTZXNzaW9uIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogY2hhdFNlc3Npb25UZXN0VHlwZSxcblx0XHRcdFx0cHJvdmlkZXJMYWJlbDogJ1Rlc3QgUHJvdmlkZXInLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmNoYXRTcGFya2xlLFxuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgU2Vzc2lvbicsXG5cdFx0XHRcdHRpbWluZzogbWFrZU5ld1Nlc3Npb25UaW1pbmcoKSxcblx0XHRcdFx0c3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdGlzQXJjaGl2ZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRzZXRBcmNoaXZlZDogKCkgPT4geyB9LFxuXHRcdFx0XHRpc1Bpbm5lZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdHNldFBpbm5lZDogKCkgPT4geyB9LFxuXHRcdFx0XHRpc1JlYWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRpc01hcmtlZFVucmVhZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdHNldFJlYWQ6IHJlYWQgPT4geyB9LFxuXHRcdFx0XHQuLi5vdmVycmlkZXNcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0fSk7XG5cblx0XHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpbml0aWFsaXplIHdpdGggZGVmYXVsdCBleGNsdWRlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbHRlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0QWdlbnRTZXNzaW9uc0ZpbHRlcixcblx0XHRcdFx0eyBmaWx0ZXJNZW51SWQ6IE1lbnVJZC5WaWV3VGl0bGUgfVxuXHRcdFx0KSk7XG5cblx0XHRcdC8vIERlZmF1bHQ6IGFyY2hpdmVkIHNlc3Npb25zIHNob3VsZCBOT1QgYmUgZXhjbHVkZWQgdW5sZXNzIGdyb3VwZWQgYnkgY2FwcGVkXG5cdFx0XHRjb25zdCBhcmNoaXZlZFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0aXNBcmNoaXZlZDogKCkgPT4gdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdGlzQXJjaGl2ZWQ6ICgpID0+IGZhbHNlXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGFyY2hpdmVkU2Vzc2lvbiksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShhY3RpdmVTZXNzaW9uKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZpbHRlciBvdXQgc2Vzc2lvbnMgZnJvbSBleGNsdWRlZCBwcm92aWRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50U2Vzc2lvbnNGaWx0ZXIsXG5cdFx0XHRcdHsgZmlsdGVyTWVudUlkOiBNZW51SWQuVmlld1RpdGxlIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uMSA9IGNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRwcm92aWRlclR5cGU6ICd0eXBlLTEnLFxuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi0xJylcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uMiA9IGNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRwcm92aWRlclR5cGU6ICd0eXBlLTInLFxuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi0yJylcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBJbml0aWFsbHksIG5vIHNlc3Npb25zIHNob3VsZCBiZSBmaWx0ZXJlZCBieSBwcm92aWRlclxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKHNlc3Npb24xKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKHNlc3Npb24yKSwgZmFsc2UpO1xuXG5cdFx0XHQvLyBFeGNsdWRlIHR5cGUtMSBieSBzZXR0aW5nIGl0IGluIHN0b3JhZ2Vcblx0XHRcdGNvbnN0IGV4Y2x1ZGVzID0ge1xuXHRcdFx0XHRwcm92aWRlcnM6IFsndHlwZS0xJ10sXG5cdFx0XHRcdHN0YXRlczogW10sXG5cdFx0XHRcdGFyY2hpdmVkOiBmYWxzZVxuXHRcdFx0fTtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHN0b3JhZ2VLZXksIEpTT04uc3RyaW5naWZ5KGV4Y2x1ZGVzKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRcdC8vIEFmdGVyIGV4Y2x1ZGluZyB0eXBlLTEsIHNlc3Npb24xIHNob3VsZCBiZSBmaWx0ZXJlZCBidXQgbm90IHNlc3Npb24yXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoc2Vzc2lvbjEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShzZXNzaW9uMiksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmaWx0ZXIgb3V0IG11bHRpcGxlIGV4Y2x1ZGVkIGNvbnRyb2xsZXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGZpbHRlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0QWdlbnRTZXNzaW9uc0ZpbHRlcixcblx0XHRcdFx0eyBmaWx0ZXJNZW51SWQ6IE1lbnVJZC5WaWV3VGl0bGUgfVxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24xID0gY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyVHlwZTogJ3R5cGUtMScgfSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uMiA9IGNyZWF0ZVNlc3Npb24oeyBwcm92aWRlclR5cGU6ICd0eXBlLTInIH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbjMgPSBjcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXJUeXBlOiAndHlwZS0zJyB9KTtcblxuXHRcdFx0Ly8gRXhjbHVkZSB0eXBlLTEgYW5kIHR5cGUtMlxuXHRcdFx0Y29uc3QgZXhjbHVkZXMgPSB7XG5cdFx0XHRcdHByb3ZpZGVyczogWyd0eXBlLTEnLCAndHlwZS0yJ10sXG5cdFx0XHRcdHN0YXRlczogW10sXG5cdFx0XHRcdGFyY2hpdmVkOiBmYWxzZVxuXHRcdFx0fTtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHN0b3JhZ2VLZXksIEpTT04uc3RyaW5naWZ5KGV4Y2x1ZGVzKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShzZXNzaW9uMSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKHNlc3Npb24yKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoc2Vzc2lvbjMpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGV4Y2x1ZGUgYXJjaGl2ZWQgc2Vzc2lvbnMgd2hlbiBub3QgY2FwcGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGZpbHRlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0QWdlbnRTZXNzaW9uc0ZpbHRlcixcblx0XHRcdFx0eyBmaWx0ZXJNZW51SWQ6IE1lbnVJZC5WaWV3VGl0bGUgfVxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IGFyY2hpdmVkU2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vYXJjaGl2ZWQtc2Vzc2lvbicpLFxuXHRcdFx0XHRpc0FyY2hpdmVkOiAoKSA9PiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vYWN0aXZlLXNlc3Npb24nKSxcblx0XHRcdFx0aXNBcmNoaXZlZDogKCkgPT4gZmFsc2Vcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBCeSBkZWZhdWx0LCBhcmNoaXZlZCBzZXNzaW9ucyBzaG91bGQgTk9UIGJlIGZpbHRlcmVkIHdoZW4gbm90IGNhcHBlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGFyY2hpdmVkU2Vzc2lvbiksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShhY3RpdmVTZXNzaW9uKSwgZmFsc2UpO1xuXG5cdFx0XHQvLyBFeGNsdWRlIGFyY2hpdmVkIGJ5IHNldHRpbmcgYXJjaGl2ZWQgdG8gdHJ1ZSBpbiBzdG9yYWdlXG5cdFx0XHRjb25zdCBleGNsdWRlcyA9IHtcblx0XHRcdFx0cHJvdmlkZXJzOiBbXSxcblx0XHRcdFx0c3RhdGVzOiBbXSxcblx0XHRcdFx0YXJjaGl2ZWQ6IHRydWVcblx0XHRcdH07XG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShzdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShleGNsdWRlcyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0XHQvLyBBcmNoaXZlZCBleGNsdXNpb24gb25seSBhcHBsaWVzIHdoZW4gZ3JvdXBlZCBieSBjYXBwZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShhcmNoaXZlZFNlc3Npb24pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoYWN0aXZlU2Vzc2lvbiksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmaWx0ZXIgb3V0IHNlc3Npb25zIHdpdGggZXhjbHVkZWQgc3RhdHVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGZpbHRlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0QWdlbnRTZXNzaW9uc0ZpbHRlcixcblx0XHRcdFx0eyBmaWx0ZXJNZW51SWQ6IE1lbnVJZC5WaWV3VGl0bGUgfVxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IGZhaWxlZFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL2ZhaWxlZC1zZXNzaW9uJyksXG5cdFx0XHRcdHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuRmFpbGVkXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgY29tcGxldGVkU2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vY29tcGxldGVkLXNlc3Npb24nKSxcblx0XHRcdFx0c3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWRcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBpblByb2dyZXNzU2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vaW5wcm9ncmVzcy1zZXNzaW9uJyksXG5cdFx0XHRcdHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzc1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEluaXRpYWxseSwgbm8gc2Vzc2lvbnMgc2hvdWxkIGJlIGZpbHRlcmVkIGJ5IHN0YXR1cyAoYXJjaGl2ZWQgaXMgZGVmYXVsdCBleGNsdWRlKVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGZhaWxlZFNlc3Npb24pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoY29tcGxldGVkU2Vzc2lvbiksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShpblByb2dyZXNzU2Vzc2lvbiksIGZhbHNlKTtcblxuXHRcdFx0Ly8gRXhjbHVkZSBmYWlsZWQgc3RhdHVzIGJ5IHNldHRpbmcgaXQgaW4gc3RvcmFnZVxuXHRcdFx0Y29uc3QgZXhjbHVkZXMgPSB7XG5cdFx0XHRcdHByb3ZpZGVyczogW10sXG5cdFx0XHRcdHN0YXRlczogW0NoYXRTZXNzaW9uU3RhdHVzLkZhaWxlZF0sXG5cdFx0XHRcdGFyY2hpdmVkOiBmYWxzZVxuXHRcdFx0fTtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHN0b3JhZ2VLZXksIEpTT04uc3RyaW5naWZ5KGV4Y2x1ZGVzKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRcdC8vIEFmdGVyIGV4Y2x1ZGluZyBmYWlsZWQgc3RhdHVzLCBvbmx5IGZhaWxlZFNlc3Npb24gc2hvdWxkIGJlIGZpbHRlcmVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoZmFpbGVkU2Vzc2lvbiksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGNvbXBsZXRlZFNlc3Npb24pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoaW5Qcm9ncmVzc1Nlc3Npb24pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmlsdGVyIG91dCBtdWx0aXBsZSBleGNsdWRlZCBzdGF0dXNlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50U2Vzc2lvbnNGaWx0ZXIsXG5cdFx0XHRcdHsgZmlsdGVyTWVudUlkOiBNZW51SWQuVmlld1RpdGxlIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCBmYWlsZWRTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7IHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuRmFpbGVkIH0pO1xuXHRcdFx0Y29uc3QgY29tcGxldGVkU2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oeyBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCB9KTtcblx0XHRcdGNvbnN0IGluUHJvZ3Jlc3NTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7IHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyB9KTtcblxuXHRcdFx0Ly8gRXhjbHVkZSBmYWlsZWQgYW5kIGluLXByb2dyZXNzXG5cdFx0XHRjb25zdCBleGNsdWRlcyA9IHtcblx0XHRcdFx0cHJvdmlkZXJzOiBbXSxcblx0XHRcdFx0c3RhdGVzOiBbQ2hhdFNlc3Npb25TdGF0dXMuRmFpbGVkLCBDaGF0U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzXSxcblx0XHRcdFx0YXJjaGl2ZWQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkoZXhjbHVkZXMpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGZhaWxlZFNlc3Npb24pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShjb21wbGV0ZWRTZXNzaW9uKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGluUHJvZ3Jlc3NTZXNzaW9uKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgY29tYmluZSBtdWx0aXBsZSBmaWx0ZXIgY29uZGl0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50U2Vzc2lvbnNGaWx0ZXIsXG5cdFx0XHRcdHsgZmlsdGVyTWVudUlkOiBNZW51SWQuVmlld1RpdGxlIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uMSA9IGNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRwcm92aWRlclR5cGU6ICd0eXBlLTEnLFxuXHRcdFx0XHRzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkZhaWxlZCxcblx0XHRcdFx0aXNBcmNoaXZlZDogKCkgPT4gdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24yID0gY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogJ3R5cGUtMicsXG5cdFx0XHRcdHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRpc0FyY2hpdmVkOiAoKSA9PiBmYWxzZVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEV4Y2x1ZGUgdHlwZS0xLCBmYWlsZWQgc3RhdHVzLCBhbmQgYXJjaGl2ZWRcblx0XHRcdGNvbnN0IGV4Y2x1ZGVzID0ge1xuXHRcdFx0XHRwcm92aWRlcnM6IFsndHlwZS0xJ10sXG5cdFx0XHRcdHN0YXRlczogW0NoYXRTZXNzaW9uU3RhdHVzLkZhaWxlZF0sXG5cdFx0XHRcdGFyY2hpdmVkOiB0cnVlXG5cdFx0XHR9O1xuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkoZXhjbHVkZXMpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdFx0Ly8gc2Vzc2lvbjEgc2hvdWxkIGJlIGV4Y2x1ZGVkIGZvciBtdWx0aXBsZSByZWFzb25zXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoc2Vzc2lvbjEpLCB0cnVlKTtcblx0XHRcdC8vIHNlc3Npb24yIHNob3VsZCBub3QgYmUgZXhjbHVkZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShzZXNzaW9uMiksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBlbWl0IG9uRGlkQ2hhbmdlIHdoZW4gZXhjbHVkZXMgYXJlIHVwZGF0ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZmlsdGVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBZ2VudFNlc3Npb25zRmlsdGVyLFxuXHRcdFx0XHR7IGZpbHRlck1lbnVJZDogTWVudUlkLlZpZXdUaXRsZSB9XG5cdFx0XHQpKTtcblxuXHRcdFx0bGV0IGNoYW5nZUV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChmaWx0ZXIub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRjaGFuZ2VFdmVudEZpcmVkID0gdHJ1ZTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gVXBkYXRlIGV4Y2x1ZGVzXG5cdFx0XHRjb25zdCBleGNsdWRlcyA9IHtcblx0XHRcdFx0cHJvdmlkZXJzOiBbJ3R5cGUtMSddLFxuXHRcdFx0XHRzdGF0ZXM6IFtdLFxuXHRcdFx0XHRhcmNoaXZlZDogZmFsc2Vcblx0XHRcdH07XG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShzdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShleGNsdWRlcyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlRXZlbnRGaXJlZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHN0b3JhZ2UgdXBkYXRlcyBmcm9tIG90aGVyIHdpbmRvd3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZmlsdGVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBZ2VudFNlc3Npb25zRmlsdGVyLFxuXHRcdFx0XHR7IGZpbHRlck1lbnVJZDogTWVudUlkLlZpZXdUaXRsZSB9XG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oeyBwcm92aWRlclR5cGU6ICd0eXBlLTEnIH0pO1xuXG5cdFx0XHQvLyBJbml0aWFsbHkgbm90IGV4Y2x1ZGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoc2Vzc2lvbiksIGZhbHNlKTtcblxuXHRcdFx0Ly8gU2ltdWxhdGUgc3RvcmFnZSB1cGRhdGUgZnJvbSBhbm90aGVyIHdpbmRvd1xuXHRcdFx0Y29uc3QgZXhjbHVkZXMgPSB7XG5cdFx0XHRcdHByb3ZpZGVyczogWyd0eXBlLTEnXSxcblx0XHRcdFx0c3RhdGVzOiBbXSxcblx0XHRcdFx0YXJjaGl2ZWQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkoZXhjbHVkZXMpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdFx0Ly8gU2hvdWxkIG5vdyBiZSBleGNsdWRlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKHNlc3Npb24pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZWdpc3RlciBwcm92aWRlciBmaWx0ZXIgYWN0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbXSk7XG5cblx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcignY3VzdG9tLXR5cGUtMScsIGNvbnRyb2xsZXIpO1xuXG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50U2Vzc2lvbnNGaWx0ZXIsXG5cdFx0XHRcdHsgZmlsdGVyTWVudUlkOiBNZW51SWQuVmlld1RpdGxlIH1cblx0XHRcdCkpO1xuXG5cdFx0XHQvLyBGaWx0ZXIgc2hvdWxkIHdvcmsgd2l0aCBjdXN0b20gcHJvdmlkZXJcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXJUeXBlOiAnY3VzdG9tLXR5cGUtMScgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoc2Vzc2lvbiksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgcHJvdmlkZXJzIHJlZ2lzdGVyZWQgYWZ0ZXIgZmlsdGVyIGNyZWF0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsdGVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBZ2VudFNlc3Npb25zRmlsdGVyLFxuXHRcdFx0XHR7IGZpbHRlck1lbnVJZDogTWVudUlkLlZpZXdUaXRsZSB9XG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgY2hhdFNlc3Npb25UeXBlID0gJ25ldy10eXBlJztcblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbXSk7XG5cblx0XHRcdC8vIFJlZ2lzdGVyIHByb3ZpZGVyIGFmdGVyIGZpbHRlciBjcmVhdGlvblxuXHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVHlwZSwgY29udHJvbGxlcik7XG5cdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5maXJlRGlkQ2hhbmdlSXRlbXNQcm92aWRlcnMoeyBjaGF0U2Vzc2lvblR5cGUgfSk7XG5cblx0XHRcdC8vIEZpbHRlciBzaG91bGQgd29yayB3aXRoIG5ldyBwcm92aWRlclxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oeyBwcm92aWRlclR5cGU6ICduZXctdHlwZScgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoc2Vzc2lvbiksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZXhjbHVkZSB3aGVuIGFsbCBmaWx0ZXJzIGFyZSBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50U2Vzc2lvbnNGaWx0ZXIsXG5cdFx0XHRcdHsgZmlsdGVyTWVudUlkOiBNZW51SWQuVmlld1RpdGxlIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogJ3R5cGUtMScsXG5cdFx0XHRcdHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuRmFpbGVkLFxuXHRcdFx0XHRpc0FyY2hpdmVkOiAoKSA9PiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gRGlzYWJsZSBhbGwgZmlsdGVyc1xuXHRcdFx0Y29uc3QgZXhjbHVkZXMgPSB7XG5cdFx0XHRcdHByb3ZpZGVyczogW10sXG5cdFx0XHRcdHN0YXRlczogW10sXG5cdFx0XHRcdGFyY2hpdmVkOiBmYWxzZVxuXHRcdFx0fTtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHN0b3JhZ2VLZXksIEpTT04uc3RyaW5naWZ5KGV4Y2x1ZGVzKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRcdC8vIE5vdGhpbmcgc2hvdWxkIGJlIGV4Y2x1ZGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoc2Vzc2lvbiksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgcHJvdmlkZXIgbGlzdCBpbiBzdG9yYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGZpbHRlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0QWdlbnRTZXNzaW9uc0ZpbHRlcixcblx0XHRcdFx0eyBmaWx0ZXJNZW51SWQ6IE1lbnVJZC5WaWV3VGl0bGUgfVxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXJUeXBlOiAndHlwZS0xJyB9KTtcblxuXHRcdFx0Ly8gU2V0IGVtcHR5IHByb3ZpZGVyIGxpc3Rcblx0XHRcdGNvbnN0IGV4Y2x1ZGVzID0ge1xuXHRcdFx0XHRwcm92aWRlcnM6IFtdLFxuXHRcdFx0XHRzdGF0ZXM6IFtdLFxuXHRcdFx0XHRhcmNoaXZlZDogZmFsc2Vcblx0XHRcdH07XG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShzdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShleGNsdWRlcyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoc2Vzc2lvbiksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZGlmZmVyZW50IE1lbnVJZCBjb250ZXh0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cblx0XHRcdC8vIENyZWF0ZSB0d28gZmlsdGVycyB3aXRoIGRpZmZlcmVudCBtZW51IElEc1xuXHRcdFx0Y29uc3QgZmlsdGVyMSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0QWdlbnRTZXNzaW9uc0ZpbHRlcixcblx0XHRcdFx0eyBmaWx0ZXJNZW51SWQ6IE1lbnVJZC5WaWV3VGl0bGUgfVxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IGZpbHRlcjIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50U2Vzc2lvbnNGaWx0ZXIsXG5cdFx0XHRcdHsgZmlsdGVyTWVudUlkOiBNZW51SWQuVmlld0l0ZW1Db250ZXh0IH1cblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyVHlwZTogJ3R5cGUtMScgfSk7XG5cblx0XHRcdC8vIFNldCBleGNsdWRlcyBvbmx5IGZvciBWaWV3VGl0bGVcblx0XHRcdGNvbnN0IGV4Y2x1ZGVzID0ge1xuXHRcdFx0XHRwcm92aWRlcnM6IFsndHlwZS0xJ10sXG5cdFx0XHRcdHN0YXRlczogW10sXG5cdFx0XHRcdGFyY2hpdmVkOiBmYWxzZVxuXHRcdFx0fTtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHN0b3JhZ2VLZXksIEpTT04uc3RyaW5naWZ5KGV4Y2x1ZGVzKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRcdC8vIGZpbHRlcjEgc2hvdWxkIGV4Y2x1ZGUgdGhlIHNlc3Npb25cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIxLmV4Y2x1ZGUoc2Vzc2lvbiksIHRydWUpO1xuXHRcdFx0Ly8gZmlsdGVyMiBzaG91bGQgYWxzbyBleGNsdWRlIHRoZSBzZXNzaW9uIChzaGFyZWQgc3RvcmFnZSBrZXkpXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyMi5leGNsdWRlKHNlc3Npb24pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbWFsZm9ybWVkIHN0b3JhZ2UgZGF0YSBncmFjZWZ1bGx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdFx0Ly8gU3RvcmUgbWFsZm9ybWVkIEpTT05cblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHN0b3JhZ2VLZXksICdpbnZhbGlkIGpzb24nLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdFx0Ly8gRmlsdGVyIHNob3VsZCBzdGlsbCBiZSBjcmVhdGVkIHdpdGggZGVmYXVsdCBleGNsdWRlc1xuXHRcdFx0Y29uc3QgZmlsdGVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBZ2VudFNlc3Npb25zRmlsdGVyLFxuXHRcdFx0XHR7IGZpbHRlck1lbnVJZDogTWVudUlkLlZpZXdUaXRsZSB9XG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgYXJjaGl2ZWRTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7IGlzQXJjaGl2ZWQ6ICgpID0+IHRydWUgfSk7XG5cdFx0XHQvLyBEZWZhdWx0IGJlaGF2aW9yOiBhcmNoaXZlZCBzaG91bGQgTk9UIGJlIGV4Y2x1ZGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoYXJjaGl2ZWRTZXNzaW9uKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHByaW9yaXRpemUgYXJjaGl2ZWQgY2hlY2sgZmlyc3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZmlsdGVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBZ2VudFNlc3Npb25zRmlsdGVyLFxuXHRcdFx0XHR7IGZpbHRlck1lbnVJZDogTWVudUlkLlZpZXdUaXRsZSB9XG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRwcm92aWRlclR5cGU6ICd0eXBlLTEnLFxuXHRcdFx0XHRzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0aXNBcmNoaXZlZDogKCkgPT4gdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFNldCBleGNsdWRlcyBmb3IgcHJvdmlkZXIgYW5kIHN0YXR1cywgYnV0IGluY2x1ZGUgYXJjaGl2ZWRcblx0XHRcdGNvbnN0IGV4Y2x1ZGVzID0ge1xuXHRcdFx0XHRwcm92aWRlcnM6IFsndHlwZS0xJ10sXG5cdFx0XHRcdHN0YXRlczogW0NoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZF0sXG5cdFx0XHRcdGFyY2hpdmVkOiB0cnVlXG5cdFx0XHR9O1xuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkoZXhjbHVkZXMpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGJlIGV4Y2x1ZGVkIGR1ZSB0byBhcmNoaXZlZCAoY2hlY2tlZCBmaXJzdClcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShzZXNzaW9uKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGFsbCB0aHJlZSBzdGF0dXMgdHlwZXMgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGZpbHRlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0QWdlbnRTZXNzaW9uc0ZpbHRlcixcblx0XHRcdFx0eyBmaWx0ZXJNZW51SWQ6IE1lbnVJZC5WaWV3VGl0bGUgfVxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IGNvbXBsZXRlZFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHsgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQgfSk7XG5cdFx0XHRjb25zdCBpblByb2dyZXNzU2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oeyBzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MgfSk7XG5cdFx0XHRjb25zdCBmYWlsZWRTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7IHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuRmFpbGVkIH0pO1xuXG5cdFx0XHQvLyBFeGNsdWRlIGFsbCBzdGF0dXNlc1xuXHRcdFx0Y29uc3QgZXhjbHVkZXMgPSB7XG5cdFx0XHRcdHByb3ZpZGVyczogW10sXG5cdFx0XHRcdHN0YXRlczogW0NoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcywgQ2hhdFNlc3Npb25TdGF0dXMuRmFpbGVkXSxcblx0XHRcdFx0YXJjaGl2ZWQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkoZXhjbHVkZXMpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGNvbXBsZXRlZFNlc3Npb24pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShpblByb2dyZXNzU2Vzc2lvbiksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGZhaWxlZFNlc3Npb24pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBleGNsdWRlIHNlc3Npb25zIGZyb20gbm9uLWFsbG93ZWQgcHJvdmlkZXJzIHdoZW4gYWxsb3dlZFByb3ZpZGVycyBpcyBzZXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50U2Vzc2lvbnNGaWx0ZXIsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRmaWx0ZXJNZW51SWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdFx0YWxsb3dlZFByb3ZpZGVyczogW0FnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWRdLFxuXHRcdFx0XHR9XG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgYmFja2dyb3VuZFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCB9KTtcblx0XHRcdGNvbnN0IGNsb3VkU2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oeyBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCB9KTtcblx0XHRcdGNvbnN0IGNsYXVkZVNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xhdWRlIH0pO1xuXHRcdFx0Y29uc3QgY29kZXhTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNvZGV4IH0pO1xuXHRcdFx0Y29uc3QgbG9jYWxTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsIH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoYmFja2dyb3VuZFNlc3Npb24pLCBmYWxzZSwgJ0JhY2tncm91bmQgc2hvdWxkIGJlIGFsbG93ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShjbG91ZFNlc3Npb24pLCBmYWxzZSwgJ0Nsb3VkIHNob3VsZCBiZSBhbGxvd2VkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoY2xhdWRlU2Vzc2lvbiksIHRydWUsICdDbGF1ZGUgc2hvdWxkIGJlIGV4Y2x1ZGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoY29kZXhTZXNzaW9uKSwgdHJ1ZSwgJ0NvZGV4IHNob3VsZCBiZSBleGNsdWRlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGxvY2FsU2Vzc2lvbiksIHRydWUsICdMb2NhbCBzaG91bGQgYmUgZXhjbHVkZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZXhjbHVkZSBhbnkgcHJvdmlkZXIgd2hlbiBhbGxvd2VkUHJvdmlkZXJzIGlzIG5vdCBzZXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50U2Vzc2lvbnNGaWx0ZXIsXG5cdFx0XHRcdHsgZmlsdGVyTWVudUlkOiBNZW51SWQuVmlld1RpdGxlIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCBjbGF1ZGVTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsYXVkZSB9KTtcblx0XHRcdGNvbnN0IGNvZGV4U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oeyBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Db2RleCB9KTtcblx0XHRcdGNvbnN0IHVua25vd25TZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyVHlwZTogJ3NvbWUtdW5rbm93bi10eXBlJyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGNsYXVkZVNlc3Npb24pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoY29kZXhTZXNzaW9uKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKHVua25vd25TZXNzaW9uKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN0aWxsIGFwcGx5IHVzZXIgZXhjbHVkZXMgb24gdG9wIG9mIGFsbG93ZWRQcm92aWRlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZmlsdGVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBZ2VudFNlc3Npb25zRmlsdGVyLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZmlsdGVyTWVudUlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRcdGFsbG93ZWRQcm92aWRlcnM6IFtBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkXSxcblx0XHRcdFx0fVxuXHRcdFx0KSk7XG5cblx0XHRcdC8vIFVzZXIgZXhjbHVkZXMgQ2xvdWQgdmlhIHN0b3JhZ2Vcblx0XHRcdGNvbnN0IGV4Y2x1ZGVzID0ge1xuXHRcdFx0XHRwcm92aWRlcnM6IFtBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWRdLFxuXHRcdFx0XHRzdGF0ZXM6IFtdLFxuXHRcdFx0XHRhcmNoaXZlZDogZmFsc2UsXG5cdFx0XHRcdHJlYWQ6IGZhbHNlLFxuXHRcdFx0fTtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHN0b3JhZ2VLZXksIEpTT04uc3RyaW5naWZ5KGV4Y2x1ZGVzKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRcdGNvbnN0IGJhY2tncm91bmRTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQgfSk7XG5cdFx0XHRjb25zdCBjbG91ZFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKHsgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQgfSk7XG5cdFx0XHRjb25zdCBjbGF1ZGVTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbih7IHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsYXVkZSB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlci5leGNsdWRlKGJhY2tncm91bmRTZXNzaW9uKSwgZmFsc2UsICdCYWNrZ3JvdW5kIGlzIGFsbG93ZWQgYW5kIG5vdCB1c2VyLWV4Y2x1ZGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyLmV4Y2x1ZGUoY2xvdWRTZXNzaW9uKSwgdHJ1ZSwgJ0Nsb3VkIGlzIGFsbG93ZWQgYnV0IHVzZXItZXhjbHVkZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIuZXhjbHVkZShjbGF1ZGVTZXNzaW9uKSwgdHJ1ZSwgJ0NsYXVkZSBpcyBub3QgaW4gYWxsb3dlZFByb3ZpZGVycycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQWdlbnRTZXNzaW9uc1ZpZXdNb2RlbCAtIFNlc3Npb24gQXJjaGl2aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGxldCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZTogTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2U7XG5cdFx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0bGV0IHZpZXdNb2RlbDogQWdlbnRTZXNzaW9uc01vZGVsO1xuXG5cdFx0Y2xhc3MgTXV0YWJsZUFyY2hpdmVDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyIGltcGxlbWVudHMgSUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIge1xuXHRcdFx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zID0gRXZlbnQuTm9uZTtcblx0XHRcdHJlYWRvbmx5IGFyY2hpdmVVcGRhdGVzOiBib29sZWFuW10gPSBbXTtcblxuXHRcdFx0Y29uc3RydWN0b3IocHJpdmF0ZSBzZXNzaW9uSXRlbTogSUNoYXRTZXNzaW9uSXRlbSkgeyB9XG5cblx0XHRcdGdldCBpdGVtcygpOiByZWFkb25seSBJQ2hhdFNlc3Npb25JdGVtW10ge1xuXHRcdFx0XHRyZXR1cm4gW3RoaXMuc2Vzc2lvbkl0ZW1dO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyByZWZyZXNoKCk6IFByb21pc2U8dm9pZD4geyB9XG5cblx0XHRcdHNldENoYXRTZXNzaW9uSXRlbUFyY2hpdmVkKF9yZXNvdXJjZTogVVJJLCBhcmNoaXZlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdFx0XHR0aGlzLmFyY2hpdmVVcGRhdGVzLnB1c2goYXJjaGl2ZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRzZXRQcm92aWRlckFyY2hpdmVkKGFyY2hpdmVkOiBib29sZWFuKTogSUNoYXRTZXNzaW9uSXRlbSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNlc3Npb25JdGVtID0geyAuLi50aGlzLnNlc3Npb25JdGVtLCBhcmNoaXZlZCB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlID0gbmV3IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMaWZlY3ljbGVTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpKTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0fSk7XG5cblx0XHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhcmNoaXZlIGFuZCB1bmFyY2hpdmUgc2Vzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnKV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNBcmNoaXZlZCgpLCBmYWxzZSk7XG5cblx0XHRcdFx0Ly8gQXJjaGl2ZSB0aGUgc2Vzc2lvblxuXHRcdFx0XHRzZXNzaW9uLnNldEFyY2hpdmVkKHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0FyY2hpdmVkKCksIHRydWUpO1xuXG5cdFx0XHRcdC8vIFVuYXJjaGl2ZSB0aGUgc2Vzc2lvblxuXHRcdFx0XHRzZXNzaW9uLnNldEFyY2hpdmVkKGZhbHNlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNBcmNoaXZlZCgpLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmaXJlIG9uRGlkQ2hhbmdlU2Vzc2lvbnMgd2hlbiBhcmNoaXZpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnKV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblx0XHRcdFx0bGV0IGNoYW5nZUV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHZpZXdNb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHtcblx0XHRcdFx0XHRjaGFuZ2VFdmVudEZpcmVkID0gdHJ1ZTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHNlc3Npb24uc2V0QXJjaGl2ZWQodHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VFdmVudEZpcmVkLCB0cnVlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBmaXJlIG9uRGlkQ2hhbmdlU2Vzc2lvbnMgd2hlbiBhcmNoaXZpbmcgd2l0aCBzYW1lIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VTaW1wbGVTZXNzaW9uSXRlbSgnc2Vzc2lvbi0xJyldKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcik7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aWV3TW9kZWwuc2Vzc2lvbnNbMF07XG5cdFx0XHRcdHNlc3Npb24uc2V0QXJjaGl2ZWQodHJ1ZSk7XG5cblx0XHRcdFx0bGV0IGNoYW5nZUV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHZpZXdNb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHtcblx0XHRcdFx0XHRjaGFuZ2VFdmVudEZpcmVkID0gdHJ1ZTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIFRyeSB0byBhcmNoaXZlIGFnYWluIHdpdGggc2FtZSB2YWx1ZVxuXHRcdFx0XHRzZXNzaW9uLnNldEFyY2hpdmVkKHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlRXZlbnRGaXJlZCwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaWdub3JlIHN0YWxlIGxvY2FsIHN0YXRlIGZvciBjb250cm9sbGVyLW93bmVkIGFyY2hpdmVkIHN0YXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnLCB7IGFyY2hpdmVkOiB0cnVlIH0pO1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKS5zdG9yZShcblx0XHRcdFx0XHQnYWdlbnRTZXNzaW9ucy5zdGF0ZS5jYWNoZScsXG5cdFx0XHRcdFx0SlNPTi5zdHJpbmdpZnkoW3sgcmVzb3VyY2U6IGl0ZW0ucmVzb3VyY2UudG9TdHJpbmcoKSwgYXJjaGl2ZWQ6IGZhbHNlIH1dKSxcblx0XHRcdFx0XHRTdG9yYWdlU2NvcGUuV09SS1NQQUNFLFxuXHRcdFx0XHRcdFN0b3JhZ2VUYXJnZXQuTUFDSElORSxcblx0XHRcdFx0KTtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBNdXRhYmxlQXJjaGl2ZUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoaXRlbSk7XG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aWV3TW9kZWwuc2Vzc2lvbnNbMF07XG5cdFx0XHRcdHNlc3Npb24uc2V0QXJjaGl2ZWQoZmFsc2UpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdGJlZm9yZVByb3ZpZGVyVXBkYXRlOiBzZXNzaW9uLmlzQXJjaGl2ZWQoKSxcblx0XHRcdFx0XHRhcmNoaXZlVXBkYXRlczogY29udHJvbGxlci5hcmNoaXZlVXBkYXRlcyxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGJlZm9yZVByb3ZpZGVyVXBkYXRlOiB0cnVlLFxuXHRcdFx0XHRcdGFyY2hpdmVVcGRhdGVzOiBbZmFsc2VdLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBjcmVhdGUgYSBsb2NhbCBvdmVybGF5IGZvciBjb250cm9sbGVyLW93bmVkIGFyY2hpdmUgd3JpdGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnLCB7IGFyY2hpdmVkOiBmYWxzZSB9KTtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBNdXRhYmxlQXJjaGl2ZUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoaXRlbSk7XG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHZpZXdNb2RlbC5zZXNzaW9uc1swXS5zZXRBcmNoaXZlZCh0cnVlKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRhcmNoaXZlZDogdmlld01vZGVsLnNlc3Npb25zWzBdLmlzQXJjaGl2ZWQoKSxcblx0XHRcdFx0XHRhcmNoaXZlVXBkYXRlczogY29udHJvbGxlci5hcmNoaXZlVXBkYXRlcyxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGFyY2hpdmVkOiBmYWxzZSxcblx0XHRcdFx0XHRhcmNoaXZlVXBkYXRlczogW3RydWVdLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZpcmUgYXJjaGl2ZSBzdGF0ZSBjaGFuZ2VzIG9ubHkgZm9yIGVmZmVjdGl2ZSBwcm92aWRlciB0cmFuc2l0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IG1ha2VTaW1wbGVTZXNzaW9uSXRlbSgnc2Vzc2lvbi0xJywgeyBhcmNoaXZlZDogZmFsc2UgfSk7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgTXV0YWJsZUFyY2hpdmVDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGl0ZW0pO1xuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcik7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBhcmNoaXZlZEV2ZW50czogYm9vbGVhbltdID0gW107XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh2aWV3TW9kZWwub25EaWRDaGFuZ2VTZXNzaW9uQXJjaGl2ZWRTdGF0ZShzZXNzaW9uID0+IGFyY2hpdmVkRXZlbnRzLnB1c2goc2Vzc2lvbi5pc0FyY2hpdmVkKCkpKSk7XG5cblx0XHRcdFx0Y29uc3QgYXJjaGl2ZWRJdGVtID0gY29udHJvbGxlci5zZXRQcm92aWRlckFyY2hpdmVkKHRydWUpO1xuXHRcdFx0XHRsZXQgc2Vzc2lvbnNDaGFuZ2VkID0gRXZlbnQudG9Qcm9taXNlKHZpZXdNb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKTtcblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UuZmlyZURpZENoYW5nZVNlc3Npb25JdGVtcyh7IGFkZGVkT3JVcGRhdGVkOiBbYXJjaGl2ZWRJdGVtXSB9KTtcblx0XHRcdFx0YXdhaXQgc2Vzc2lvbnNDaGFuZ2VkO1xuXG5cdFx0XHRcdGNvbnN0IHVuY2hhbmdlZEl0ZW0gPSBjb250cm9sbGVyLnNldFByb3ZpZGVyQXJjaGl2ZWQodHJ1ZSk7XG5cdFx0XHRcdHNlc3Npb25zQ2hhbmdlZCA9IEV2ZW50LnRvUHJvbWlzZSh2aWV3TW9kZWwub25EaWRDaGFuZ2VTZXNzaW9ucyk7XG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLmZpcmVEaWRDaGFuZ2VTZXNzaW9uSXRlbXMoeyBhZGRlZE9yVXBkYXRlZDogW3VuY2hhbmdlZEl0ZW1dIH0pO1xuXHRcdFx0XHRhd2FpdCBzZXNzaW9uc0NoYW5nZWQ7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0YXJjaGl2ZWQ6IHZpZXdNb2RlbC5zZXNzaW9uc1swXS5pc0FyY2hpdmVkKCksXG5cdFx0XHRcdFx0YXJjaGl2ZWRFdmVudHMsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRhcmNoaXZlZDogdHJ1ZSxcblx0XHRcdFx0XHRhcmNoaXZlZEV2ZW50czogW3RydWVdLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHByZXNlcnZlIGFyY2hpdmVkIHN0YXRlIGZyb20gcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbe1xuXHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uLTEnKSxcblx0XHRcdFx0XHRsYWJlbDogJ1Rlc3QgU2Vzc2lvbicsXG5cdFx0XHRcdFx0YXJjaGl2ZWQ6IHRydWUsXG5cdFx0XHRcdFx0dGltaW5nOiBtYWtlTmV3U2Vzc2lvblRpbWluZygpXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcik7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aWV3TW9kZWwuc2Vzc2lvbnNbMF07XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQXJjaGl2ZWQoKSwgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBvdmVycmlkZSBwcm92aWRlciBhcmNoaXZlZCBzdGF0ZSB3aXRoIHVzZXIgcHJlZmVyZW5jZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFt7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24tMScpLFxuXHRcdFx0XHRcdGxhYmVsOiAnVGVzdCBTZXNzaW9uJyxcblx0XHRcdFx0XHRhcmNoaXZlZDogdHJ1ZSxcblx0XHRcdFx0XHR0aW1pbmc6IG1ha2VOZXdTZXNzaW9uVGltaW5nKClcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNBcmNoaXZlZCgpLCB0cnVlKTtcblxuXHRcdFx0XHQvLyBVc2VyIHVuYXJjaGl2ZXNcblx0XHRcdFx0c2Vzc2lvbi5zZXRBcmNoaXZlZChmYWxzZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQXJjaGl2ZWQoKSwgZmFsc2UpO1xuXG5cdFx0XHRcdC8vIFJlLXJlc29sdmUgc2hvdWxkIHByZXNlcnZlIHVzZXIgcHJlZmVyZW5jZVxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uQWZ0ZXJSZXNvbHZlID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbkFmdGVyUmVzb2x2ZS5pc0FyY2hpdmVkKCksIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQWdlbnRTZXNzaW9uc1ZpZXdNb2RlbCAtIGxlZ2FjeVJlc291cmNlIG1pZ3JhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRsZXQgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2U6IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlO1xuXHRcdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRcdGxldCB2aWV3TW9kZWw6IEFnZW50U2Vzc2lvbnNNb2RlbDtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlID0gbmV3IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMaWZlY3ljbGVTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpKTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0fSk7XG5cblx0XHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRcdGZ1bmN0aW9uIHVyaXMoKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRvbGRVcmk6IFVSSS5wYXJzZShgJHtjaGF0U2Vzc2lvblRlc3RUeXBlfTovL2xlZ2FjeS0xYCksXG5cdFx0XHRcdG5ld1VyaTogVVJJLnBhcnNlKGAke2NoYXRTZXNzaW9uVGVzdFR5cGV9Oi8vY3VycmVudC0xYCksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIG1ha2VJdGVtKHJlc291cmNlOiBVUkksIG92ZXJyaWRlcz86IFBhcnRpYWw8SUNoYXRTZXNzaW9uSXRlbT4pOiBJQ2hhdFNlc3Npb25JdGVtIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRsYWJlbDogYFNlc3Npb24gJHtyZXNvdXJjZS5wYXRofWAsXG5cdFx0XHRcdHRpbWluZzogbWFrZU5ld1Nlc3Npb25UaW1pbmcoKSxcblx0XHRcdFx0Li4ub3ZlcnJpZGVzLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0ZXN0KCdtaWdyYXRlcyBhcmNoaXZlZCBzdGF0ZSBmb3J3YXJkIGZyb20gbGVnYWN5UmVzb3VyY2UgdG8gY3VycmVudCByZXNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBvbGRVcmksIG5ld1VyaSB9ID0gdXJpcygpO1xuXHRcdFx0XHQvLyAxLiBQcm92aWRlciBpbml0aWFsbHkgZW1pdHMgaXRlbSB1bmRlciB0aGUgbGVnYWN5IFVSSTsgdXNlciBhcmNoaXZlcyBpdC5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFxuXHRcdFx0XHRcdGNoYXRTZXNzaW9uVGVzdFR5cGUsXG5cdFx0XHRcdFx0bmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VJdGVtKG9sZFVyaSldKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uc2V0QXJjaGl2ZWQodHJ1ZSk7XG5cblx0XHRcdFx0Ly8gMi4gUHJvdmlkZXIgVVJJIHNoYXBlIGNoYW5nZXM7IG5ldyBlbWlzc2lvbiBjYXJyaWVzIGxlZ2FjeVJlc291cmNlIHBvaW50aW5nXG5cdFx0XHRcdC8vICAgIGF0IHRoZSBvbGQgVVJJLiBIb3N0IHNob3VsZCBhZG9wdCB0aGUgYXJjaGl2ZWQgc3RhdGUgZm9yd2FyZC5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFxuXHRcdFx0XHRcdGNoYXRTZXNzaW9uVGVzdFR5cGUsXG5cdFx0XHRcdFx0bmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VJdGVtKG5ld1VyaSwgeyBsZWdhY3lSZXNvdXJjZTogb2xkVXJpIH0pXSksXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHR7IHJlc291cmNlOiBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksIGFyY2hpdmVkOiBzZXNzaW9uLmlzQXJjaGl2ZWQoKSB9LFxuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IG5ld1VyaS50b1N0cmluZygpLCBhcmNoaXZlZDogdHJ1ZSB9LFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtaWdyYXRlcyBwaW5uZWQgc3RhdGUgZm9yd2FyZCAobm90IGp1c3QgYXJjaGl2ZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IG9sZFVyaSwgbmV3VXJpIH0gPSB1cmlzKCk7XG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblRlc3RUeXBlLFxuXHRcdFx0XHRcdG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlSXRlbShvbGRVcmkpXSksXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0dmlld01vZGVsLnNlc3Npb25zWzBdLnNldFBpbm5lZCh0cnVlKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25UZXN0VHlwZSxcblx0XHRcdFx0XHRuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZUl0ZW0obmV3VXJpLCB7IGxlZ2FjeVJlc291cmNlOiBvbGRVcmkgfSldKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdHsgcGlubmVkOiBzZXNzaW9uLmlzUGlubmVkKCksIGFyY2hpdmVkOiBzZXNzaW9uLmlzQXJjaGl2ZWQoKSB9LFxuXHRcdFx0XHRcdHsgcGlubmVkOiB0cnVlLCBhcmNoaXZlZDogZmFsc2UgfSxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWlncmF0ZXMgdW5yZWFkIG1hcmtlciBmb3J3YXJkIChyZWFkIHN0YXRlLCBub3QganVzdCBhcmNoaXZlZC9waW5uZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IG9sZFVyaSwgbmV3VXJpIH0gPSB1cmlzKCk7XG5cdFx0XHRcdC8vIFN0YWdlIDE6IG1hcmsgdGhlIG9sZCBVUkkgZXhwbGljaXRseSBhcyB1bnJlYWQuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblRlc3RUeXBlLFxuXHRcdFx0XHRcdG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlSXRlbShvbGRVcmkpXSksXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0dmlld01vZGVsLnNlc3Npb25zWzBdLnNldFJlYWQoZmFsc2UpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zWzBdLmlzTWFya2VkVW5yZWFkKCksIHRydWUsICdwcmUtY29uZGl0aW9uOiBsZWdhY3kgVVJJIG1hcmtlZCB1bnJlYWQnKTtcblxuXHRcdFx0XHQvLyBTdGFnZSAyOiBwcm92aWRlciBVUkkgc2hhcGUgY2hhbmdlczsgZXhwZWN0IHRoZSB1bnJlYWQgbWFya2VyIHRvIG1pZ3JhdGVcblx0XHRcdFx0Ly8gZm9yd2FyZC4gVGhpcyBwcm92ZXMgcmVzb2x2ZVN0YXRlRW50cnkgcm91dGluZyBjb3ZlcnMgQUxMIHBlci1yZXNvdXJjZVxuXHRcdFx0XHQvLyBzdGF0ZSAoYXJjaGl2ZSwgcGluLCByZWFkKSwgbm90IGp1c3QgYXJjaGl2ZWQvcGlubmVkLlxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25UZXN0VHlwZSxcblx0XHRcdFx0XHRuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZUl0ZW0obmV3VXJpLCB7IGxlZ2FjeVJlc291cmNlOiBvbGRVcmkgfSldKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zWzBdLmlzTWFya2VkVW5yZWFkKCksIHRydWUpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdGhpbmcgd2hlbiBubyBob3N0IHN0YXRlIGV4aXN0cyB1bmRlciBsZWdhY3lSZXNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBvbGRVcmksIG5ld1VyaSB9ID0gdXJpcygpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25UZXN0VHlwZSxcblx0XHRcdFx0XHRuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZUl0ZW0obmV3VXJpLCB7IGxlZ2FjeVJlc291cmNlOiBvbGRVcmksIGFyY2hpdmVkOiB0cnVlIH0pXSksXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHQvLyBGYWxscyBiYWNrIHRvIHByb3ZpZGVyLXN1cHBsaWVkIGFyY2hpdmVkIGJpdDsgbm8gbWlncmF0aW9uIG5lZWRlZC5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9uc1swXS5pc0FyY2hpdmVkKCksIHRydWUpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvd24gc3RhdGUgd2lucyB3aGVuIGJvdGggbGVnYWN5IGFuZCBjdXJyZW50IFVSSSBoYXZlIGhvc3Qgc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgb2xkVXJpLCBuZXdVcmkgfSA9IHVyaXMoKTtcblx0XHRcdFx0Ly8gU3RhZ2UgMTogYXJjaGl2ZSB1bmRlciBvbGQgVVJJLlxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25UZXN0VHlwZSxcblx0XHRcdFx0XHRuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZUl0ZW0ob2xkVXJpKV0pLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHZpZXdNb2RlbC5zZXNzaW9uc1swXS5zZXRBcmNoaXZlZCh0cnVlKTtcblxuXHRcdFx0XHQvLyBTdGFnZSAyOiBlbWl0IG5ldyBVUkkgKG5vIGxlZ2FjeVJlc291cmNlIHlldCkgYW5kIGV4cGxpY2l0bHkgdG9nZ2xlIGFyY2hpdmVcblx0XHRcdFx0Ly8gc28gdGhhdCBob3N0IHN0YXRlIGlzIGVzdGFibGlzaGVkIHVuZGVyIHRoZSBuZXcgVVJJIChzZXRBcmNoaXZlZCBuby1vcHMgb25cblx0XHRcdFx0Ly8gdmFsdWVzIG1hdGNoaW5nIHRoZSBjdXJyZW50IGVmZmVjdGl2ZSBzdGF0ZSwgc28gd2UgdG9nZ2xlIHRocm91Z2ggdHJ1ZSkuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblRlc3RUeXBlLFxuXHRcdFx0XHRcdG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlSXRlbShuZXdVcmkpXSksXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHZpZXdNb2RlbC5zZXNzaW9uc1swXS5zZXRBcmNoaXZlZCh0cnVlKTtcblx0XHRcdFx0dmlld01vZGVsLnNlc3Npb25zWzBdLnNldEFyY2hpdmVkKGZhbHNlKTtcblxuXHRcdFx0XHQvLyBTdGFnZSAzOiByZS1lbWl0IHdpdGggbGVnYWN5UmVzb3VyY2UgcG9pbnRpbmcgYXQgdGhlIChzdGlsbC1hcmNoaXZlZCkgb2xkIFVSSS5cblx0XHRcdFx0Ly8gT3duIChuZXcpIGVudHJ5IG11c3Qgd2luLlxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25UZXN0VHlwZSxcblx0XHRcdFx0XHRuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZUl0ZW0obmV3VXJpLCB7IGxlZ2FjeVJlc291cmNlOiBvbGRVcmkgfSldKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zWzBdLmlzQXJjaGl2ZWQoKSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpZ25vcmVzIGxlZ2FjeVJlc291cmNlIGVxdWFsIHRvIHRoZSBjdXJyZW50IHJlc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IG5ld1VyaSB9ID0gdXJpcygpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25UZXN0VHlwZSxcblx0XHRcdFx0XHRuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZUl0ZW0obmV3VXJpLCB7IGxlZ2FjeVJlc291cmNlOiBuZXdVcmksIGFyY2hpdmVkOiBmYWxzZSB9KV0pLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Ly8gU2FuaXR5OiBubyBpbmZpbml0ZSBsb29wLCBmYWxscyBiYWNrIHRvIHByb3ZpZGVyIHZhbHVlLlxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zWzBdLmlzQXJjaGl2ZWQoKSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpZ25vcmVzIGxlZ2FjeVJlc291cmNlIHdpdGggYSBkaWZmZXJlbnQgc2NoZW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IG5ld1VyaSB9ID0gdXJpcygpO1xuXHRcdFx0XHQvLyBQcmUtYXJjaGl2ZSBhbiBpdGVtIHVuZGVyIGEgZGlmZmVyZW50IHNjaGVtZSB0byBzZWVkIGhvc3Qgc3RhdGUgdGhlcmUuXG5cdFx0XHRcdGNvbnN0IG90aGVyU2NoZW1lID0gVVJJLnBhcnNlKCdvdGhlci1zY2hlbWU6Ly9sZWdhY3ktMScpO1xuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25UZXN0VHlwZSxcblx0XHRcdFx0XHRuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZUl0ZW0ob3RoZXJTY2hlbWUpXSksXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0dmlld01vZGVsLnNlc3Npb25zWzBdLnNldEFyY2hpdmVkKHRydWUpO1xuXG5cdFx0XHRcdC8vIE5ldyBlbWlzc2lvbiByZWZlcmVuY2VzIHRoZSBvdGhlci1zY2hlbWUgbGVnYWN5IFVSSTsgbWlncmF0aW9uIG11c3QgYmUgcmVmdXNlZC5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFxuXHRcdFx0XHRcdGNoYXRTZXNzaW9uVGVzdFR5cGUsXG5cdFx0XHRcdFx0bmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VJdGVtKG5ld1VyaSwgeyBsZWdhY3lSZXNvdXJjZTogb3RoZXJTY2hlbWUgfSldKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnNlc3Npb25zWzBdLmlzQXJjaGl2ZWQoKSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwb3N0LW1pZ3JhdGlvbiBzZXRBcmNoaXZlZCB3cml0ZXMgdW5kZXIgY3VycmVudCByZXNvdXJjZSBhbmQgZnJlZXMgdGhlIGxlZ2FjeSBzbG90JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IG9sZFVyaSwgbmV3VXJpIH0gPSB1cmlzKCk7XG5cdFx0XHRcdC8vIFN0YWdlIDE6IGFyY2hpdmUgdW5kZXIgb2xkIFVSSS5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFxuXHRcdFx0XHRcdGNoYXRTZXNzaW9uVGVzdFR5cGUsXG5cdFx0XHRcdFx0bmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VJdGVtKG9sZFVyaSldKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uc2V0QXJjaGl2ZWQodHJ1ZSk7XG5cblx0XHRcdFx0Ly8gU3RhZ2UgMjogbWlncmF0ZSB0byBuZXcgVVJJLlxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25UZXN0VHlwZSxcblx0XHRcdFx0XHRuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZUl0ZW0obmV3VXJpLCB7IGxlZ2FjeVJlc291cmNlOiBvbGRVcmkgfSldKSxcblx0XHRcdFx0KTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0dmlld01vZGVsLnNlc3Npb25zWzBdLnNldEFyY2hpdmVkKGZhbHNlKTtcblxuXHRcdFx0XHQvLyBTdGFnZSAzOiBwcm92aWRlciByZS1lbWl0cyB0aGUgb2xkIFVSSSAoZS5nLiBiYWNrZW5kIHJvbGxiYWNrKS4gSXRzIGhvc3Rcblx0XHRcdFx0Ly8gc3RhdGUgc2hvdWxkIGJlIGVtcHR5IFx1MjAxNCB0aGUgbGVnYWN5IGVudHJ5IHdhcyBjb25zdW1lZCBieSB0aGUgbWlncmF0aW9uLFxuXHRcdFx0XHQvLyBhbmQgc2V0QXJjaGl2ZWQoZmFsc2UpIHdyb3RlIHRvIHRoZSBuZXcgVVJJLCBub3QgdGhlIGxlZ2FjeSBvbmUuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblRlc3RUeXBlLFxuXHRcdFx0XHRcdG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlSXRlbShvbGRVcmkpXSksXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5zZXNzaW9uc1swXS5pc0FyY2hpdmVkKCksIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQWdlbnRTZXNzaW9uc1ZpZXdNb2RlbCAtIFNlc3Npb24gUmVhZCBTdGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRsZXQgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2U6IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlO1xuXHRcdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRcdGxldCB2aWV3TW9kZWw6IEFnZW50U2Vzc2lvbnNNb2RlbDtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlID0gbmV3IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMaWZlY3ljbGVTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnYWdlbnRTZXNzaW9ucy5yZWFkRGF0ZUJhc2VsaW5lMicsIDEsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdH0pO1xuXG5cdFx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbWFyayBzZXNzaW9uIGFzIHJlYWQgYW5kIHVucmVhZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZnV0dXJlU2Vzc2lvblRpbWluZzogSUNoYXRTZXNzaW9uSXRlbVsndGltaW5nJ10gPSB7XG5cdFx0XHRcdFx0Y3JlYXRlZDogRGF0ZS5VVEMoMjAyNiwgMSAvKiBGZWJydWFyeSAqLywgMSksXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBEYXRlLlVUQygyMDI2LCAxIC8qIEZlYnJ1YXJ5ICovLCAxKSxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBEYXRlLlVUQygyMDI2LCAxIC8qIEZlYnJ1YXJ5ICovLCAyKSxcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW3tcblx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi0xJyksXG5cdFx0XHRcdFx0bGFiZWw6ICdTZXNzaW9uIDEnLFxuXHRcdFx0XHRcdHRpbWluZzogZnV0dXJlU2Vzc2lvblRpbWluZyxcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblxuXHRcdFx0XHQvLyBNYXJrIGFzIHJlYWRcblx0XHRcdFx0c2Vzc2lvbi5zZXRSZWFkKHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc1JlYWQoKSwgdHJ1ZSk7XG5cblx0XHRcdFx0Ly8gTWFyayBhcyB1bnJlYWRcblx0XHRcdFx0c2Vzc2lvbi5zZXRSZWFkKGZhbHNlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNSZWFkKCksIGZhbHNlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNNYXJrZWRVbnJlYWQoKSwgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXBvcnQgaXNNYXJrZWRVbnJlYWQgb25seSB3aGVuIGV4cGxpY2l0bHkgbWFya2VkIHVucmVhZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZnV0dXJlU2Vzc2lvblRpbWluZzogSUNoYXRTZXNzaW9uSXRlbVsndGltaW5nJ10gPSB7XG5cdFx0XHRcdFx0Y3JlYXRlZDogRGF0ZS5VVEMoMjAyNiwgMSAvKiBGZWJydWFyeSAqLywgMSksXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBEYXRlLlVUQygyMDI2LCAxIC8qIEZlYnJ1YXJ5ICovLCAxKSxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBEYXRlLlVUQygyMDI2LCAxIC8qIEZlYnJ1YXJ5ICovLCAyKSxcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW3tcblx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi0xJyksXG5cdFx0XHRcdFx0bGFiZWw6ICdTZXNzaW9uIDEnLFxuXHRcdFx0XHRcdHRpbWluZzogZnV0dXJlU2Vzc2lvblRpbWluZyxcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblxuXHRcdFx0XHQvLyBOYXR1cmFsbHkgdW5yZWFkIHNlc3Npb24gaXMgTk9UIG1hcmtlZCB1bnJlYWQgKG5vIGV4cGxpY2l0IHVzZXIgYWN0aW9uKVxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc1JlYWQoKSwgZmFsc2UpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc01hcmtlZFVucmVhZCgpLCBmYWxzZSk7XG5cblx0XHRcdFx0Ly8gTWFyayBhcyByZWFkLCB0aGVuIGV4cGxpY2l0bHkgbWFyayBhcyB1bnJlYWRcblx0XHRcdFx0c2Vzc2lvbi5zZXRSZWFkKHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc01hcmtlZFVucmVhZCgpLCBmYWxzZSk7XG5cblx0XHRcdFx0c2Vzc2lvbi5zZXRSZWFkKGZhbHNlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNNYXJrZWRVbnJlYWQoKSwgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmaXJlIG9uRGlkQ2hhbmdlU2Vzc2lvbnMgd2hlbiBtYXJraW5nIGFzIHJlYWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnKV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblx0XHRcdFx0c2Vzc2lvbi5zZXRSZWFkKGZhbHNlKTsgLy8gZW5zdXJlIGl0J3MgdW5yZWFkIGZpcnN0XG5cblx0XHRcdFx0bGV0IGNoYW5nZUV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHZpZXdNb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHtcblx0XHRcdFx0XHRjaGFuZ2VFdmVudEZpcmVkID0gdHJ1ZTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHNlc3Npb24uc2V0UmVhZCh0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUV2ZW50RmlyZWQsIHRydWUpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGZpcmUgb25EaWRDaGFuZ2VTZXNzaW9ucyB3aGVuIG1hcmtpbmcgYXMgcmVhZCB3aXRoIHNhbWUgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnKV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblx0XHRcdFx0c2Vzc2lvbi5zZXRSZWFkKHRydWUpO1xuXG5cdFx0XHRcdGxldCBjaGFuZ2VFdmVudEZpcmVkID0gZmFsc2U7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh2aWV3TW9kZWwub25EaWRDaGFuZ2VTZXNzaW9ucygoKSA9PiB7XG5cdFx0XHRcdFx0Y2hhbmdlRXZlbnRGaXJlZCA9IHRydWU7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBUcnkgdG8gbWFyayBhcyByZWFkIGFnYWluIHdpdGggc2FtZSB2YWx1ZVxuXHRcdFx0XHRzZXNzaW9uLnNldFJlYWQodHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VFdmVudEZpcmVkLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBwcmVzZXJ2ZSByZWFkIHN0YXRlIGFmdGVyIHJlLXJlc29sdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnKV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblx0XHRcdFx0c2Vzc2lvbi5zZXRSZWFkKHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc1JlYWQoKSwgdHJ1ZSk7XG5cblx0XHRcdFx0Ly8gUmUtcmVzb2x2ZSBzaG91bGQgcHJlc2VydmUgcmVhZCBzdGF0ZVxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uQWZ0ZXJSZXNvbHZlID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbkFmdGVyUmVzb2x2ZS5pc1JlYWQoKSwgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBjb25zaWRlciBzZXNzaW9ucyBiZWZvcmUgaW5pdGlhbCBkYXRlIGFzIHJlYWQgYnkgZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Ly8gV2l0aG91dCBtaWdyYXRpb24sIGFsbCBzZXNzaW9ucyBhcmUgdW5yZWFkIGJ5IGRlZmF1bHRcblx0XHRcdFx0Y29uc3Qgb2xkU2Vzc2lvblRpbWluZzogSUNoYXRTZXNzaW9uSXRlbVsndGltaW5nJ10gPSB7XG5cdFx0XHRcdFx0Y3JlYXRlZDogRGF0ZS5VVEMoMjAyNSwgMTAgLyogTm92ZW1iZXIgKi8sIDEpLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogRGF0ZS5VVEMoMjAyNSwgMTAgLyogTm92ZW1iZXIgKi8sIDEpLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IERhdGUuVVRDKDIwMjUsIDEwIC8qIE5vdmVtYmVyICovLCAyKSxcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW3tcblx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vb2xkLXNlc3Npb24nKSxcblx0XHRcdFx0XHRsYWJlbDogJ09sZCBTZXNzaW9uJyxcblx0XHRcdFx0XHR0aW1pbmc6IG9sZFNlc3Npb25UaW1pbmcsXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcik7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aWV3TW9kZWwuc2Vzc2lvbnNbMF07XG5cdFx0XHRcdC8vIFNlc3Npb25zIGFyZSB1bnJlYWQgYnkgZGVmYXVsdCAobWlncmF0aW9uIGFscmVhZHkgaGFwcGVuZWQgaW4gc2V0dXApXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzUmVhZCgpLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBjb25zaWRlciBzZXNzaW9ucyBhZnRlciBpbml0aWFsIGRhdGUgYXMgdW5yZWFkIGJ5IGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG5ld1Nlc3Npb25UaW1pbmc6IElDaGF0U2Vzc2lvbkl0ZW1bJ3RpbWluZyddID0ge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IERhdGUuVVRDKDIwMjYsIDEgLyogRmVicnVhcnkgKi8sIDEpLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogRGF0ZS5VVEMoMjAyNiwgMSAvKiBGZWJydWFyeSAqLywgMSksXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RFbmRlZDogRGF0ZS5VVEMoMjAyNiwgMSAvKiBGZWJydWFyeSAqLywgMiksXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFt7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL25ldy1zZXNzaW9uJyksXG5cdFx0XHRcdFx0bGFiZWw6ICdOZXcgU2Vzc2lvbicsXG5cdFx0XHRcdFx0dGltaW5nOiBuZXdTZXNzaW9uVGltaW5nLFxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHQvLyBTZXNzaW9ucyBhZnRlciB0aGUgaW5pdGlhbCBkYXRlIHNob3VsZCBiZSBjb25zaWRlcmVkIHVucmVhZFxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc1JlYWQoKSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIGVuZFRpbWUgZm9yIHJlYWQgc3RhdGUgY29tcGFyaXNvbiB3aGVuIGF2YWlsYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Ly8gU2Vzc2lvbiB3aXRoIHN0YXJ0VGltZSBiZWZvcmUgaW5pdGlhbCBkYXRlIGJ1dCBlbmRUaW1lIGFmdGVyXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25UaW1pbmc6IElDaGF0U2Vzc2lvbkl0ZW1bJ3RpbWluZyddID0ge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IERhdGUuVVRDKDIwMjUsIDEwIC8qIE5vdmVtYmVyICovLCAxKSxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IERhdGUuVVRDKDIwMjUsIDEwIC8qIE5vdmVtYmVyICovLCAxKSxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBEYXRlLlVUQygyMDI2LCAxIC8qIEZlYnJ1YXJ5ICovLCAxKSxcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW3tcblx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi13aXRoLWVuZHRpbWUnKSxcblx0XHRcdFx0XHRsYWJlbDogJ1Nlc3Npb24gV2l0aCBFbmRUaW1lJyxcblx0XHRcdFx0XHR0aW1pbmc6IHNlc3Npb25UaW1pbmcsXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcik7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aWV3TW9kZWwuc2Vzc2lvbnNbMF07XG5cdFx0XHRcdC8vIFNob3VsZCB1c2UgbGFzdFJlcXVlc3RFbmRlZCAoRGVjZW1iZXIgMTApIHdoaWNoIGlzIGFmdGVyIHRoZSBpbml0aWFsIGRhdGVcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNSZWFkKCksIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBzdGFydFRpbWUgZm9yIHJlYWQgc3RhdGUgY29tcGFyaXNvbiB3aGVuIGVuZFRpbWUgaXMgbm90IGF2YWlsYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Ly8gU2Vzc2lvbiB3aXRoIG9ubHkgc3RhcnRUaW1lXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25UaW1pbmc6IElDaGF0U2Vzc2lvbkl0ZW1bJ3RpbWluZyddID0ge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IERhdGUuVVRDKDIwMjUsIDEwIC8qIE5vdmVtYmVyICovLCAxKSxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IERhdGUuVVRDKDIwMjUsIDEwIC8qIE5vdmVtYmVyICovLCAxKSxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFt7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24tbm8tZW5kdGltZScpLFxuXHRcdFx0XHRcdGxhYmVsOiAnU2Vzc2lvbiBXaXRob3V0IEVuZFRpbWUnLFxuXHRcdFx0XHRcdHRpbWluZzogc2Vzc2lvblRpbWluZyxcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblx0XHRcdFx0Ly8gU2Vzc2lvbnMgYXJlIHVucmVhZCBieSBkZWZhdWx0XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzUmVhZCgpLCBmYWxzZSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0cmVhdCBhcmNoaXZlZCBzZXNzaW9ucyBhcyByZWFkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBuZXdTZXNzaW9uVGltaW5nOiBJQ2hhdFNlc3Npb25JdGVtWyd0aW1pbmcnXSA9IHtcblx0XHRcdFx0XHRjcmVhdGVkOiBEYXRlLlVUQygyMDI2LCAxIC8qIEZlYnJ1YXJ5ICovLCAxKSxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IERhdGUuVVRDKDIwMjYsIDEgLyogRmVicnVhcnkgKi8sIDEpLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IERhdGUuVVRDKDIwMjYsIDEgLyogRmVicnVhcnkgKi8sIDIpLFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbe1xuXHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9uZXctc2Vzc2lvbicpLFxuXHRcdFx0XHRcdGxhYmVsOiAnTmV3IFNlc3Npb24nLFxuXHRcdFx0XHRcdHRpbWluZzogbmV3U2Vzc2lvblRpbWluZyxcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblx0XHRcdFx0Ly8gU2Vzc2lvbiBhZnRlciB0aGUgaW5pdGlhbCBkYXRlIHNob3VsZCBiZSB1bnJlYWQgYnkgZGVmYXVsdFxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc1JlYWQoKSwgZmFsc2UpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0FyY2hpdmVkKCksIGZhbHNlKTtcblxuXHRcdFx0XHQvLyBBcmNoaXZlIHRoZSBzZXNzaW9uXG5cdFx0XHRcdHNlc3Npb24uc2V0QXJjaGl2ZWQodHJ1ZSk7XG5cblx0XHRcdFx0Ly8gQXJjaGl2ZWQgc2Vzc2lvbnMgc2hvdWxkIGFsd2F5cyBiZSBjb25zaWRlcmVkIHJlYWRcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNBcmNoaXZlZCgpLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNSZWFkKCksIHRydWUpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbWFyayBzZXNzaW9uIGFzIHJlYWQgd2hlbiBhcmNoaXZpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG5ld1Nlc3Npb25UaW1pbmc6IElDaGF0U2Vzc2lvbkl0ZW1bJ3RpbWluZyddID0ge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IERhdGUuVVRDKDIwMjYsIDEgLyogRmVicnVhcnkgKi8sIDEpLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogRGF0ZS5VVEMoMjAyNiwgMSAvKiBGZWJydWFyeSAqLywgMSksXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RFbmRlZDogRGF0ZS5VVEMoMjAyNiwgMSAvKiBGZWJydWFyeSAqLywgMiksXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFt7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL25ldy1zZXNzaW9uJyksXG5cdFx0XHRcdFx0bGFiZWw6ICdOZXcgU2Vzc2lvbicsXG5cdFx0XHRcdFx0dGltaW5nOiBuZXdTZXNzaW9uVGltaW5nLFxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc1JlYWQoKSwgZmFsc2UpO1xuXG5cdFx0XHRcdC8vIEFyY2hpdmUgdGhlIHNlc3Npb25cblx0XHRcdFx0c2Vzc2lvbi5zZXRBcmNoaXZlZCh0cnVlKTtcblxuXHRcdFx0XHQvLyBTaG91bGQgYmUgcmVhZCBhZnRlciBhcmNoaXZpbmcgKGFyY2hpdmVkIHNlc3Npb25zIGFyZSBhbHdheXMgcmVhZClcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNSZWFkKCksIHRydWUpO1xuXG5cdFx0XHRcdC8vIFVuYXJjaGl2ZSB0aGUgc2Vzc2lvblxuXHRcdFx0XHRzZXNzaW9uLnNldEFyY2hpdmVkKGZhbHNlKTtcblxuXHRcdFx0XHQvLyBBZnRlciB1bmFyY2hpdmluZywgdGhlIHJlYWQgc3RhdGUgZGVwZW5kcyBvbiB0aGUgc3RvcmVkIHJlYWQgZGF0ZSB2cyBzZXNzaW9uIHRpbWluZy5cblx0XHRcdFx0Ly8gV2hlbiBhcmNoaXZpbmcgbWFya2VkIHRoZSBzZXNzaW9uIGFzIHJlYWQsIHRoZSByZWFkIGRhdGUgd2FzIHNldCB0byB0aGUgdGVzdCdzXG5cdFx0XHRcdC8vIGZha2VkIERhdGUubm93KCkgd2hpY2ggbWF5IGJlIGVhcmxpZXIgdGhhbiB0aGUgc2Vzc2lvbidzIGxhc3RSZXF1ZXN0RW5kZWQsXG5cdFx0XHRcdC8vIHNvIHRoZSBzZXNzaW9uIG1heSBhcHBlYXIgdW5yZWFkIGFnYWluIGJhc2VkIG9uIHRoZSB0aW1lIGNvbXBhcmlzb24uXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQXJjaGl2ZWQoKSwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmlyZSBvbkRpZENoYW5nZVNlc3Npb25zIHdoZW4gYXJjaGl2aW5nIGFuIHVucmVhZCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBuZXdTZXNzaW9uVGltaW5nOiBJQ2hhdFNlc3Npb25JdGVtWyd0aW1pbmcnXSA9IHtcblx0XHRcdFx0XHRjcmVhdGVkOiBEYXRlLlVUQygyMDI2LCAxIC8qIEZlYnJ1YXJ5ICovLCAxKSxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IERhdGUuVVRDKDIwMjYsIDEgLyogRmVicnVhcnkgKi8sIDEpLFxuXHRcdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IERhdGUuVVRDKDIwMjYsIDEgLyogRmVicnVhcnkgKi8sIDIpLFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbe1xuXHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9uZXctc2Vzc2lvbicpLFxuXHRcdFx0XHRcdGxhYmVsOiAnTmV3IFNlc3Npb24nLFxuXHRcdFx0XHRcdHRpbWluZzogbmV3U2Vzc2lvblRpbWluZyxcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNSZWFkKCksIGZhbHNlKTtcblxuXHRcdFx0XHRsZXQgY2hhbmdlRXZlbnRDb3VudCA9IDA7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh2aWV3TW9kZWwub25EaWRDaGFuZ2VTZXNzaW9ucygoKSA9PiB7XG5cdFx0XHRcdFx0Y2hhbmdlRXZlbnRDb3VudCsrO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Ly8gQXJjaGl2ZSB0aGUgc2Vzc2lvbiAod2hpY2ggYWxzbyBtYXJrcyBhcyByZWFkKVxuXHRcdFx0XHRzZXNzaW9uLnNldEFyY2hpdmVkKHRydWUpO1xuXG5cdFx0XHRcdC8vIEZpcmVzIHR3aWNlOiBvbmNlIGZvciBzZXR0aW5nIHJlYWQgc3RhdGUsIG9uY2UgZm9yIHNldHRpbmcgYXJjaGl2ZWQgc3RhdGVcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUV2ZW50Q291bnQsIDIpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGZpcmUgb25EaWRDaGFuZ2VTZXNzaW9ucyB3aGVuIGFyY2hpdmluZyBhbiBhbHJlYWR5IHJlYWQgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Ly8gU2Vzc2lvbiB3aXRoIHRpbWluZ1xuXHRcdFx0XHRjb25zdCBvbGRTZXNzaW9uVGltaW5nOiBJQ2hhdFNlc3Npb25JdGVtWyd0aW1pbmcnXSA9IHtcblx0XHRcdFx0XHRjcmVhdGVkOiBEYXRlLlVUQygyMDI1LCAxMCAvKiBOb3ZlbWJlciAqLywgMSksXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBEYXRlLlVUQygyMDI1LCAxMCAvKiBOb3ZlbWJlciAqLywgMSksXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RFbmRlZDogRGF0ZS5VVEMoMjAyNSwgMTAgLyogTm92ZW1iZXIgKi8sIDIpLFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IGNoYXRTZXNzaW9uVHlwZSA9IGNoYXRTZXNzaW9uVGVzdFR5cGU7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbe1xuXHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9vbGQtc2Vzc2lvbicpLFxuXHRcdFx0XHRcdGxhYmVsOiAnT2xkIFNlc3Npb24nLFxuXHRcdFx0XHRcdHRpbWluZzogb2xkU2Vzc2lvblRpbWluZyxcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblR5cGUsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHQvLyBNYXJrIHNlc3Npb24gYXMgcmVhZCBmaXJzdFxuXHRcdFx0XHRzZXNzaW9uLnNldFJlYWQodHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzUmVhZCgpLCB0cnVlKTtcblxuXHRcdFx0XHRsZXQgY2hhbmdlRXZlbnRDb3VudCA9IDA7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh2aWV3TW9kZWwub25EaWRDaGFuZ2VTZXNzaW9ucygoKSA9PiB7XG5cdFx0XHRcdFx0Y2hhbmdlRXZlbnRDb3VudCsrO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Ly8gQXJjaGl2ZSB0aGUgc2Vzc2lvblxuXHRcdFx0XHRzZXNzaW9uLnNldEFyY2hpdmVkKHRydWUpO1xuXG5cdFx0XHRcdC8vIFNob3VsZCBmaXJlIG9ubHkgb25jZSBmb3IgYXJjaGl2ZWQgc3RhdGUgY2hhbmdlIHNpbmNlIHNlc3Npb24gaXMgYWxyZWFkeSByZWFkXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VFdmVudENvdW50LCAxKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQWdlbnRTZXNzaW9uc1ZpZXdNb2RlbCAtIFByb3ZpZGVyLW93bmVkIFJlYWQgU3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bGV0IG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlOiBNb2NrQ2hhdFNlc3Npb25zU2VydmljZTtcblx0XHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHRsZXQgdmlld01vZGVsOiBBZ2VudFNlc3Npb25zTW9kZWw7XG5cblx0XHRjbGFzcyBPcGVuQ2hhdFdpZGdldFNlcnZpY2UgZXh0ZW5kcyBUZXN0Q2hhdFdpZGdldFNlcnZpY2Uge1xuXHRcdFx0cHJpdmF0ZSByZWFkb25seSB3aWRnZXQgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0V2lkZ2V0PigpIHsgfTtcblxuXHRcdFx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBvcGVuU2Vzc2lvblJlc291cmNlOiBVUkkpIHtcblx0XHRcdFx0c3VwZXIoKTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UocmVzb3VyY2U6IFVSSSk6IElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0cmV0dXJuIGlzRXF1YWwocmVzb3VyY2UsIHRoaXMub3BlblNlc3Npb25SZXNvdXJjZSkgPyB0aGlzLndpZGdldCA6IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvKiogTWlycm9ycyB0aGUgQWdlbnQgSG9zdCBjb250cm9sbGVyOiByZWNvcmRzIHRoZSBtdXRhdGlvbiwgdGhlbiBlY2hvZXMgaXQgYmFjay4gKi9cblx0XHRjbGFzcyBSZWFkT3duaW5nQ29udHJvbGxlciBpbXBsZW1lbnRzIElDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyIHtcblx0XHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJQ2hhdFNlc3Npb25JdGVtc0RlbHRhPigpKTtcblx0XHRcdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcyA9IHRoaXMuX29uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcy5ldmVudDtcblxuXHRcdFx0cmVhZG9ubHkgbXV0YXRpb25zOiB7IHJlc291cmNlOiBzdHJpbmc7IGlzUmVhZDogYm9vbGVhbiB9W10gPSBbXTtcblxuXHRcdFx0Y29uc3RydWN0b3IocHJpdmF0ZSBfaXRlbXM6IElDaGF0U2Vzc2lvbkl0ZW1bXSkgeyB9XG5cblx0XHRcdGdldCBpdGVtcygpOiByZWFkb25seSBJQ2hhdFNlc3Npb25JdGVtW10ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5faXRlbXM7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJlZnJlc2goKTogUHJvbWlzZTx2b2lkPiB7IH1cblxuXHRcdFx0c2V0SXRlbXMoaXRlbXM6IElDaGF0U2Vzc2lvbkl0ZW1bXSk6IHZvaWQge1xuXHRcdFx0XHR0aGlzLl9pdGVtcyA9IGl0ZW1zO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMuZmlyZSh7IGFkZGVkT3JVcGRhdGVkOiB0aGlzLl9pdGVtcyB9KTtcblx0XHRcdH1cblxuXHRcdFx0c2V0Q2hhdFNlc3Npb25JdGVtUmVhZChyZXNvdXJjZTogVVJJLCBpc1JlYWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdFx0dGhpcy5tdXRhdGlvbnMucHVzaCh7IHJlc291cmNlOiByZXNvdXJjZS50b1N0cmluZygpLCBpc1JlYWQgfSk7XG5cdFx0XHRcdHRoaXMuX2l0ZW1zID0gdGhpcy5faXRlbXMubWFwKGl0ZW0gPT4gaXNFcXVhbChpdGVtLnJlc291cmNlLCByZXNvdXJjZSkgPyB7IC4uLml0ZW0sIGlzUmVhZCB9IDogaXRlbSk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcy5maXJlKHsgYWRkZWRPclVwZGF0ZWQ6IHRoaXMuX2l0ZW1zIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25UaW1pbmc6IElDaGF0U2Vzc2lvbkl0ZW1bJ3RpbWluZyddID0ge1xuXHRcdFx0Y3JlYXRlZDogRGF0ZS5VVEMoMjAyNiwgMSAvKiBGZWJydWFyeSAqLywgMSksXG5cdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IERhdGUuVVRDKDIwMjYsIDEgLyogRmVicnVhcnkgKi8sIDEpLFxuXHRcdFx0bGFzdFJlcXVlc3RFbmRlZDogRGF0ZS5VVEMoMjAyNiwgMSAvKiBGZWJydWFyeSAqLywgMiksXG5cdFx0fTtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlID0gbmV3IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMaWZlY3ljbGVTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnYWdlbnRTZXNzaW9ucy5yZWFkRGF0ZUJhc2VsaW5lMicsIDEsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdH0pO1xuXG5cdFx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0XHR0ZXN0KCdrZWVwcyBhbiBvcGVuIHNlc3Npb24gcmVhZCB3aGVuIGEgbGF0ZXIgcHJvdmlkZXIgdW5yZWFkIHVwZGF0ZSBhcnJpdmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgndGVzdC10eXBlOi8vb3duZWQtc2Vzc2lvbicpO1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFJlYWRPd25pbmdDb250cm9sbGVyKFt7XG5cdFx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdFx0bGFiZWw6ICdPd25lZCBTZXNzaW9uJyxcblx0XHRcdFx0XHR0aW1pbmc6IHNlc3Npb25UaW1pbmcsXG5cdFx0XHRcdFx0aXNSZWFkOiB0cnVlLFxuXHRcdFx0XHR9XSk7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCBuZXcgT3BlbkNoYXRXaWRnZXRTZXJ2aWNlKHJlc291cmNlKSk7XG5cblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKSk7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb250cm9sbGVyLnNldEl0ZW1zKFt7XG5cdFx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdFx0bGFiZWw6ICdPd25lZCBTZXNzaW9uJyxcblx0XHRcdFx0XHR0aW1pbmc6IHNlc3Npb25UaW1pbmcsXG5cdFx0XHRcdFx0aXNSZWFkOiBmYWxzZSxcblx0XHRcdFx0fV0pO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdG11dGF0aW9uczogY29udHJvbGxlci5tdXRhdGlvbnMsXG5cdFx0XHRcdFx0aXNSZWFkOiB2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uaXNSZWFkKCksXG5cdFx0XHRcdFx0aXNNYXJrZWRVbnJlYWQ6IHZpZXdNb2RlbC5zZXNzaW9uc1swXS5pc01hcmtlZFVucmVhZCgpLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0bXV0YXRpb25zOiBbeyByZXNvdXJjZTogJ3Rlc3QtdHlwZTovL293bmVkLXNlc3Npb24nLCBpc1JlYWQ6IHRydWUgfV0sXG5cdFx0XHRcdFx0aXNSZWFkOiB0cnVlLFxuXHRcdFx0XHRcdGlzTWFya2VkVW5yZWFkOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBhbiBleHBsaWNpdCB1bnJlYWQgdXBkYXRlIGZvciBhbiBvcGVuIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCd0ZXN0LXR5cGU6Ly9vd25lZC1zZXNzaW9uJyk7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgUmVhZE93bmluZ0NvbnRyb2xsZXIoW3tcblx0XHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0XHRsYWJlbDogJ093bmVkIFNlc3Npb24nLFxuXHRcdFx0XHRcdHRpbWluZzogc2Vzc2lvblRpbWluZyxcblx0XHRcdFx0XHRpc1JlYWQ6IHRydWUsXG5cdFx0XHRcdH1dKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIG5ldyBPcGVuQ2hhdFdpZGdldFNlcnZpY2UocmVzb3VyY2UpKTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdHZpZXdNb2RlbC5zZXNzaW9uc1swXS5zZXRSZWFkKGZhbHNlKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRtdXRhdGlvbnM6IGNvbnRyb2xsZXIubXV0YXRpb25zLFxuXHRcdFx0XHRcdGlzUmVhZDogdmlld01vZGVsLnNlc3Npb25zWzBdLmlzUmVhZCgpLFxuXHRcdFx0XHRcdGlzTWFya2VkVW5yZWFkOiB2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uaXNNYXJrZWRVbnJlYWQoKSxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdG11dGF0aW9uczogW3sgcmVzb3VyY2U6ICd0ZXN0LXR5cGU6Ly9vd25lZC1zZXNzaW9uJywgaXNSZWFkOiBmYWxzZSB9XSxcblx0XHRcdFx0XHRpc1JlYWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGlzTWFya2VkVW5yZWFkOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZHMgdGhlIHByb3ZpZGVyIHZhbHVlIGFuZCByb3V0ZXMgbXV0YXRpb25zIGJhY2sgdG8gaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgUmVhZE93bmluZ0NvbnRyb2xsZXIoW3tcblx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0LXR5cGU6Ly9vd25lZC1zZXNzaW9uJyksXG5cdFx0XHRcdFx0bGFiZWw6ICdPd25lZCBTZXNzaW9uJyxcblx0XHRcdFx0XHR0aW1pbmc6IHNlc3Npb25UaW1pbmcsXG5cdFx0XHRcdFx0aXNSZWFkOiBmYWxzZSxcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcikpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3QgaW5pdGlhbCA9IHtcblx0XHRcdFx0XHRpc1JlYWQ6IHZpZXdNb2RlbC5zZXNzaW9uc1swXS5pc1JlYWQoKSxcblx0XHRcdFx0XHRpc01hcmtlZFVucmVhZDogdmlld01vZGVsLnNlc3Npb25zWzBdLmlzTWFya2VkVW5yZWFkKCksXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0dmlld01vZGVsLnNlc3Npb25zWzBdLnNldFJlYWQodHJ1ZSk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0aW5pdGlhbCxcblx0XHRcdFx0XHRtdXRhdGlvbnM6IGNvbnRyb2xsZXIubXV0YXRpb25zLFxuXHRcdFx0XHRcdGFmdGVyTWFya1JlYWQ6IHtcblx0XHRcdFx0XHRcdGlzUmVhZDogdmlld01vZGVsLnNlc3Npb25zWzBdLmlzUmVhZCgpLFxuXHRcdFx0XHRcdFx0aXNNYXJrZWRVbnJlYWQ6IHZpZXdNb2RlbC5zZXNzaW9uc1swXS5pc01hcmtlZFVucmVhZCgpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRpbml0aWFsOiB7IGlzUmVhZDogZmFsc2UsIGlzTWFya2VkVW5yZWFkOiB0cnVlIH0sXG5cdFx0XHRcdFx0bXV0YXRpb25zOiBbeyByZXNvdXJjZTogJ3Rlc3QtdHlwZTovL293bmVkLXNlc3Npb24nLCBpc1JlYWQ6IHRydWUgfV0sXG5cdFx0XHRcdFx0YWZ0ZXJNYXJrUmVhZDogeyBpc1JlYWQ6IHRydWUsIGlzTWFya2VkVW5yZWFkOiBmYWxzZSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvdmlkZXIgdW5yZWFkIHdpbnMgb3ZlciB0aGUgbG9jYWwgaGV1cmlzdGljcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBSZWFkT3duaW5nQ29udHJvbGxlcihbe1xuXHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3QtdHlwZTovL293bmVkLXNlc3Npb24nKSxcblx0XHRcdFx0XHRsYWJlbDogJ093bmVkIFNlc3Npb24nLFxuXHRcdFx0XHRcdC8vIE9sZCBlbm91Z2ggdGhhdCB0aGUgbG9jYWwgYmFzZWxpbmUgaGV1cmlzdGljIHdvdWxkIGNhbGwgaXQgcmVhZC5cblx0XHRcdFx0XHR0aW1pbmc6IHsgY3JlYXRlZDogMSwgbGFzdFJlcXVlc3RTdGFydGVkOiAxLCBsYXN0UmVxdWVzdEVuZGVkOiAxIH0sXG5cdFx0XHRcdFx0aXNSZWFkOiBmYWxzZSxcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UZXN0VHlwZSwgY29udHJvbGxlcikpO1xuXHRcdFx0XHR2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7IC8vIHBpY2sgdXAgdGhlIHByb3ZpZGVyIGVjaG9cblxuXHRcdFx0XHQvLyBUaGUgbWlncmF0aW9uIGhhbmRzIHRoZSBsb2NhbGx5LXJlYWQgc3RhdGUgdG8gdGhlIHByb3ZpZGVyIHJhdGhlclxuXHRcdFx0XHQvLyB0aGFuIG92ZXJyaWRpbmcgaXQgbG9jYWxseSwga2VlcGluZyB0aGUgcHJvdmlkZXIgYXV0aG9yaXRhdGl2ZS5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0bXV0YXRpb25zOiBjb250cm9sbGVyLm11dGF0aW9ucyxcblx0XHRcdFx0XHRpc1JlYWQ6IHZpZXdNb2RlbC5zZXNzaW9uc1swXS5pc1JlYWQoKSxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdG11dGF0aW9uczogW3sgcmVzb3VyY2U6ICd0ZXN0LXR5cGU6Ly9vd25lZC1zZXNzaW9uJywgaXNSZWFkOiB0cnVlIH1dLFxuXHRcdFx0XHRcdGlzUmVhZDogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IG1pZ3JhdGUgYSBzZXNzaW9uIHRoZSBwcm92aWRlciBhbHJlYWR5IHJlcG9ydHMgYXMgcmVhZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBSZWFkT3duaW5nQ29udHJvbGxlcihbe1xuXHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3QtdHlwZTovL293bmVkLXNlc3Npb24nKSxcblx0XHRcdFx0XHRsYWJlbDogJ093bmVkIFNlc3Npb24nLFxuXHRcdFx0XHRcdHRpbWluZzogc2Vzc2lvblRpbWluZyxcblx0XHRcdFx0XHRpc1JlYWQ6IHRydWUsXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udHJvbGxlci5tdXRhdGlvbnMsIFtdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVmZXJzIG1pZ3JhdGlvbiB1bnRpbCB0aGUgcHJvdmlkZXIgaGFzIHJlcG9ydGVkIGEgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdC8vIEEgc2Vzc2lvbiBjYXJyaWVkIG92ZXIgZnJvbSBhIGNhY2hlIHByZWRhdGluZyB0aGUgZmllbGQgcmVwb3J0c1xuXHRcdFx0XHQvLyBgdW5kZWZpbmVkYDsgY29uc3VtaW5nIHRoZSBvbmUtc2hvdCBmbGFnIGhlcmUgd291bGQgbG9zZSB0aGVcblx0XHRcdFx0Ly8gaGFuZC1vZmYgZm9yIGdvb2QuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgUmVhZE93bmluZ0NvbnRyb2xsZXIoW3tcblx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0LXR5cGU6Ly9vd25lZC1zZXNzaW9uJyksXG5cdFx0XHRcdFx0bGFiZWw6ICdPd25lZCBTZXNzaW9uJyxcblx0XHRcdFx0XHR0aW1pbmc6IHsgY3JlYXRlZDogMSwgbGFzdFJlcXVlc3RTdGFydGVkOiAxLCBsYXN0UmVxdWVzdEVuZGVkOiAxIH0sXG5cdFx0XHRcdFx0aXNSZWFkOiB1bmRlZmluZWQsXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVGVzdFR5cGUsIGNvbnRyb2xsZXIpKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGNvbnN0IGJlZm9yZVJlcG9ydCA9IGNvbnRyb2xsZXIubXV0YXRpb25zLmxlbmd0aDtcblxuXHRcdFx0XHRjb250cm9sbGVyLnNldEl0ZW1zKFt7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdC10eXBlOi8vb3duZWQtc2Vzc2lvbicpLFxuXHRcdFx0XHRcdGxhYmVsOiAnT3duZWQgU2Vzc2lvbicsXG5cdFx0XHRcdFx0dGltaW5nOiB7IGNyZWF0ZWQ6IDEsIGxhc3RSZXF1ZXN0U3RhcnRlZDogMSwgbGFzdFJlcXVlc3RFbmRlZDogMSB9LFxuXHRcdFx0XHRcdGlzUmVhZDogZmFsc2UsXG5cdFx0XHRcdH1dKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRiZWZvcmVSZXBvcnQsXG5cdFx0XHRcdFx0bXV0YXRpb25zOiBjb250cm9sbGVyLm11dGF0aW9ucyxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGJlZm9yZVJlcG9ydDogMCxcblx0XHRcdFx0XHRtdXRhdGlvbnM6IFt7IHJlc291cmNlOiAndGVzdC10eXBlOi8vb3duZWQtc2Vzc2lvbicsIGlzUmVhZDogdHJ1ZSB9XSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHJlc3VycmVjdCByZWFkIHN0YXRlIG9uIGEgbGF0ZXIgcmVmcmVzaCBhZnRlciBtYXJraW5nIHVucmVhZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBSZWFkT3duaW5nQ29udHJvbGxlcihbe1xuXHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3QtdHlwZTovL293bmVkLXNlc3Npb24nKSxcblx0XHRcdFx0XHRsYWJlbDogJ093bmVkIFNlc3Npb24nLFxuXHRcdFx0XHRcdHRpbWluZzogeyBjcmVhdGVkOiAxLCBsYXN0UmVxdWVzdFN0YXJ0ZWQ6IDEsIGxhc3RSZXF1ZXN0RW5kZWQ6IDEgfSxcblx0XHRcdFx0XHRpc1JlYWQ6IGZhbHNlLFxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKSk7XG5cdFx0XHRcdHZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25zTW9kZWwpKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTsgLy8gbWlncmF0aW9uIHByb21vdGVzIHRvIHJlYWRcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTsgLy8gcGljayB1cCB0aGUgcHJvdmlkZXIgZWNob1xuXG5cdFx0XHRcdHZpZXdNb2RlbC5zZXNzaW9uc1swXS5zZXRSZWFkKGZhbHNlKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRtdXRhdGlvbnM6IGNvbnRyb2xsZXIubXV0YXRpb25zLFxuXHRcdFx0XHRcdGlzUmVhZDogdmlld01vZGVsLnNlc3Npb25zWzBdLmlzUmVhZCgpLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0bXV0YXRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IHJlc291cmNlOiAndGVzdC10eXBlOi8vb3duZWQtc2Vzc2lvbicsIGlzUmVhZDogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0eyByZXNvdXJjZTogJ3Rlc3QtdHlwZTovL293bmVkLXNlc3Npb24nLCBpc1JlYWQ6IGZhbHNlIH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRpc1JlYWQ6IGZhbHNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQWdlbnRTZXNzaW9uc1ZpZXdNb2RlbCAtIFN0YXRlIFRyYWNraW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGxldCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZTogTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2U7XG5cdFx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0bGV0IHZpZXdNb2RlbDogQWdlbnRTZXNzaW9uc01vZGVsO1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxpZmVjeWNsZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9KTtcblxuXHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHRyYWNrIHN0YXR1cyB0cmFuc2l0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0bGV0IHNlc3Npb25TdGF0dXMgPSBDaGF0U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzO1xuXHRcdFx0XHRsZXQgX2l0ZW1zOiBJQ2hhdFNlc3Npb25JdGVtW10gPSBbXTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyOiBJQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlciA9IHtcblx0XHRcdFx0XHRvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdFx0cmVmcmVzaDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0X2l0ZW1zID0gW3tcblx0XHRcdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24tMScpLFxuXHRcdFx0XHRcdFx0XHRsYWJlbDogJ1Rlc3QgU2Vzc2lvbicsXG5cdFx0XHRcdFx0XHRcdHN0YXR1czogc2Vzc2lvblN0YXR1cyxcblx0XHRcdFx0XHRcdFx0dGltaW5nOiBtYWtlTmV3U2Vzc2lvblRpbWluZygpXG5cdFx0XHRcdFx0XHR9XTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldCBpdGVtcygpIHsgcmV0dXJuIF9pdGVtczsgfVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uc3RhdHVzLCBDaGF0U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKTtcblxuXHRcdFx0XHQvLyBDaGFuZ2Ugc3RhdHVzXG5cdFx0XHRcdHNlc3Npb25TdGF0dXMgPSBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQ7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnNbMF0uc3RhdHVzLCBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgY2xlYW4gdXAgc3RhdGUgdHJhY2tpbmcgZm9yIHJlbW92ZWQgc2Vzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxldCBpbmNsdWRlU2Vzc2lvbnMgPSB0cnVlO1xuXHRcdFx0XHRsZXQgX2l0ZW1zOiBJQ2hhdFNlc3Npb25JdGVtW10gPSBbXTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyOiBJQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlciA9IHtcblx0XHRcdFx0XHRvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdFx0cmVmcmVzaDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGluY2x1ZGVTZXNzaW9ucykge1xuXHRcdFx0XHRcdFx0XHRfaXRlbXMgPSBbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnKV07XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRfaXRlbXMgPSBbXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldCBpdGVtcygpIHsgcmV0dXJuIF9pdGVtczsgfVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblxuXHRcdFx0XHQvLyBSZW1vdmUgc2Vzc2lvbnNcblx0XHRcdFx0aW5jbHVkZVNlc3Npb25zID0gZmFsc2U7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAwKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQWdlbnRTZXNzaW9uc1ZpZXdNb2RlbCAtIFByb3ZpZGVyIEljb25zIGFuZCBOYW1lcycsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0fSk7XG5cblx0XHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gY29ycmVjdCBuYW1lIGZvciBMb2NhbCBwcm92aWRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IG5hbWUgPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUoQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsKTtcblx0XHRcdGFzc2VydC5vayhuYW1lLmxlbmd0aCA+IDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBjb3JyZWN0IG5hbWUgZm9yIEJhY2tncm91bmQgcHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBuYW1lID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lKEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kKTtcblx0XHRcdGFzc2VydC5vayhuYW1lLmxlbmd0aCA+IDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBjb3JyZWN0IG5hbWUgZm9yIENsb3VkIHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmFtZSA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyTmFtZShBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQpO1xuXHRcdFx0YXNzZXJ0Lm9rKG5hbWUubGVuZ3RoID4gMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGNvcnJlY3QgaWNvbiBmb3IgTG9jYWwgcHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpY29uID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJJY29uKEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaWNvbi5pZCwgQ29kaWNvbi52bS5pZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGNvcnJlY3QgaWNvbiBmb3IgQmFja2dyb3VuZCBwcm92aWRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGljb24gPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckljb24oQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGljb24uaWQsIENvZGljb24uY29waWxvdC5pZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGNvcnJlY3QgaWNvbiBmb3IgQ2xvdWQgcHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpY29uID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJJY29uKEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaWNvbi5pZCwgQ29kaWNvbi5jbG91ZC5pZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGNvcnJlY3QgaWNvbiBmb3IgQWdlbnRIb3N0Q29waWxvdCBwcm92aWRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGljb24gPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckljb24oQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkFnZW50SG9zdENvcGlsb3QpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGljb24uaWQsIENvZGljb24udm0uaWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBzaW1wbGlmaWVkIEFnZW50SG9zdENvcGlsb3QgbmFtZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG5hbWUgPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUoQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkFnZW50SG9zdENvcGlsb3QpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hbWUsICdDb3BpbG90Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGNvcnJlY3QgbmFtZSBmb3IgR3Jvd3RoIHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmFtZSA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyTmFtZShBZ2VudFNlc3Npb25Qcm92aWRlcnMuR3Jvd3RoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYW1lLCAnR3Jvd3RoJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGNvcnJlY3QgaWNvbiBmb3IgR3Jvd3RoIHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaWNvbiA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVySWNvbihBZ2VudFNlc3Npb25Qcm92aWRlcnMuR3Jvd3RoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpY29uLmlkLCBDb2RpY29uLmxpZ2h0YnVsYi5pZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGNvcnJlY3QgbmFtZSBmb3IgQWdlbnRIb3N0Q2xhdWRlIHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmFtZSA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyTmFtZShBZ2VudFNlc3Npb25Qcm92aWRlcnMuQWdlbnRIb3N0Q2xhdWRlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYW1lLCAnQ2xhdWRlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGNvcnJlY3QgaWNvbiBmb3IgQWdlbnRIb3N0Q2xhdWRlIHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaWNvbiA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVySWNvbihBZ2VudFNlc3Npb25Qcm92aWRlcnMuQWdlbnRIb3N0Q2xhdWRlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpY29uLmlkLCBDb2RpY29uLmNsYXVkZS5pZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGNvcnJlY3QgbmFtZSBmb3IgQWdlbnRIb3N0Q29kZXggcHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBuYW1lID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lKEFnZW50U2Vzc2lvblByb3ZpZGVycy5BZ2VudEhvc3RDb2RleCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmFtZSwgJ0NvZGV4Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGNvcnJlY3QgaWNvbiBmb3IgQWdlbnRIb3N0Q29kZXggcHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpY29uID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJJY29uKEFnZW50U2Vzc2lvblByb3ZpZGVycy5BZ2VudEhvc3RDb2RleCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaWNvbi5pZCwgQ29kaWNvbi5vcGVuYWkuaWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc29sdmUgQWdlbnRIb3N0Q2xhdWRlIHByb3ZpZGVyIGZyb20gc2Vzc2lvbiB0eXBlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlcihBZ2VudFNlc3Npb25Qcm92aWRlcnMuQWdlbnRIb3N0Q2xhdWRlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlciwgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkFnZW50SG9zdENsYXVkZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzb2x2ZSBBZ2VudEhvc3RDb2RleCBwcm92aWRlciBmcm9tIHNlc3Npb24gdHlwZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXIoQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkFnZW50SG9zdENvZGV4KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlciwgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkFnZW50SG9zdENvZGV4KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgTG9jYWwgcHJvdmlkZXIgdHlwZSBpbiBtb2RlbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcykpO1xuXHRcdFx0XHRjb25zdCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZSA9IG5ldyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSgpO1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZSk7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxpZmVjeWNsZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSkpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnKV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHRjb25zdCB2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5wcm92aWRlclR5cGUsIEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmljb24uaWQsIENvZGljb24udm0uaWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5wcm92aWRlckxhYmVsLCBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUoQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsKSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgQmFja2dyb3VuZCBwcm92aWRlciB0eXBlIGluIG1vZGVsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKSk7XG5cdFx0XHRcdGNvbnN0IG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlID0gbmV3IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGlmZWN5Y2xlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGlmZWN5Y2xlU2VydmljZSgpKSk7XG5cblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScpXSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBjb250cm9sbGVyKTtcblx0XHRcdFx0Y29uc3Qgdmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24ucHJvdmlkZXJUeXBlLCBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmljb24uaWQsIENvZGljb24uY29waWxvdC5pZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLnByb3ZpZGVyTGFiZWwsIGdldEFnZW50U2Vzc2lvblByb3ZpZGVyTmFtZShBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCkpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIENsb3VkIHByb3ZpZGVyIHR5cGUgaW4gbW9kZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpKTtcblx0XHRcdFx0Y29uc3QgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMaWZlY3ljbGVTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpKTtcblxuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW21ha2VTaW1wbGVTZXNzaW9uSXRlbSgnc2Vzc2lvbi0xJyldKTtcblxuXHRcdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLCBjb250cm9sbGVyKTtcblx0XHRcdFx0Y29uc3Qgdmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpZXdNb2RlbC5zZXNzaW9uc1swXTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24ucHJvdmlkZXJUeXBlLCBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pY29uLmlkLCBDb2RpY29uLmNsb3VkLmlkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24ucHJvdmlkZXJMYWJlbCwgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lKEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCkpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIGN1c3RvbSBpY29uIGZyb20gc2Vzc2lvbiBpdGVtJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKSk7XG5cdFx0XHRcdGNvbnN0IG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlID0gbmV3IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGlmZWN5Y2xlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGlmZWN5Y2xlU2VydmljZSgpKSk7XG5cblx0XHRcdFx0Y29uc3QgY3VzdG9tSWNvbiA9IFRoZW1lSWNvbi5mcm9tSWQoJ2JlYWtlcicpO1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IFN0YXRpY0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoW3tcblx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi0xJyksXG5cdFx0XHRcdFx0bGFiZWw6ICdUZXN0IFNlc3Npb24nLFxuXHRcdFx0XHRcdGljb25QYXRoOiBjdXN0b21JY29uLFxuXHRcdFx0XHRcdHRpbWluZzogbWFrZU5ld1Nlc3Npb25UaW1pbmcoKVxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKCdjdXN0b20tdHlwZScsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHRjb25zdCB2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pY29uLmlkLCBjdXN0b21JY29uLmlkKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBkZWZhdWx0IGljb24gZm9yIGN1c3RvbSBwcm92aWRlciB3aXRob3V0IGljb25QYXRoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKSk7XG5cdFx0XHRcdGNvbnN0IG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlID0gbmV3IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGlmZWN5Y2xlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGlmZWN5Y2xlU2VydmljZSgpKSk7XG5cblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBTdGF0aWNDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKFttYWtlU2ltcGxlU2Vzc2lvbkl0ZW0oJ3Nlc3Npb24tMScpXSk7XG5cblx0XHRcdFx0bW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKCdjdXN0b20tdHlwZScsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHRjb25zdCB2aWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc01vZGVsKSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdmlld01vZGVsLnNlc3Npb25zWzBdO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pY29uLmlkLCBDb2RpY29uLnRlcm1pbmFsLmlkKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQWdlbnRTZXNzaW9uc1ZpZXdNb2RlbCAtIGdldEFnZW50Q2FuQ29udGludWVJbicsICgpID0+IHtcblx0XHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdHJ1ZSBmb3IgQ2xvdWQgcHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRBZ2VudENhbkNvbnRpbnVlSW4oQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBmYWxzZSBmb3IgR3Jvd3RoIHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0QWdlbnRDYW5Db250aW51ZUluKEFnZW50U2Vzc2lvblByb3ZpZGVycy5Hcm93dGgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB0cnVlIGZvciB0aGUgQ29waWxvdCBhZ2VudCBob3N0IHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0QWdlbnRDYW5Db250aW51ZUluKEFnZW50U2Vzc2lvblByb3ZpZGVycy5BZ2VudEhvc3RDb3BpbG90KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB0cnVlIGZvciBkeW5hbWljYWxseSByZWdpc3RlcmVkIGFnZW50IGhvc3Qgc2Vzc2lvbiB0eXBlcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBZ2VudENhbkNvbnRpbnVlSW4oJ2FnZW50LWhvc3QtY29kZXgnKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0QWdlbnRDYW5Db250aW51ZUluKCdhZ2VudC1ob3N0LWNsYXVkZScpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBZ2VudENhbkNvbnRpbnVlSW4oJ3JlbW90ZS1teWF1dGhvcml0eS1jb3BpbG90JyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBmYWxzZSBmb3IgdW5rbm93biBleHRlbnNpb24taG9zdCBzZXNzaW9uIHR5cGVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEFnZW50Q2FuQ29udGludWVJbignc29tZS1leHRlbnNpb24tc2Vzc2lvbicpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBZ2VudFNlc3Npb25zVmlld01vZGVsIC0gQ2FuY2VsbGF0aW9uIGFuZCBMaWZlY3ljbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bGV0IG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlOiBNb2NrQ2hhdFNlc3Npb25zU2VydmljZTtcblx0XHRsZXQgbW9ja0xpZmVjeWNsZVNlcnZpY2U6IFRlc3RMaWZlY3ljbGVTZXJ2aWNlO1xuXHRcdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRcdGxldCB2aWV3TW9kZWw6IEFnZW50U2Vzc2lvbnNNb2RlbDtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlID0gbmV3IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cdFx0XHRtb2NrTGlmZWN5Y2xlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMaWZlY3ljbGVTZXJ2aWNlLCBtb2NrTGlmZWN5Y2xlU2VydmljZSk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdH0pO1xuXG5cdFx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHJlc29sdmUgaWYgbGlmZWN5Y2xlIHdpbGwgc2h1dGRvd24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgU3RhdGljQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihbbWFrZVNpbXBsZVNlc3Npb25JdGVtKCdzZXNzaW9uLTEnKV0pO1xuXG5cdFx0XHRcdG1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblRlc3RUeXBlLCBjb250cm9sbGVyKTtcblx0XHRcdFx0dmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNNb2RlbCkpO1xuXG5cdFx0XHRcdC8vIFNldCB3aWxsU2h1dGRvd24gdG8gdHJ1ZVxuXHRcdFx0XHRtb2NrTGlmZWN5Y2xlU2VydmljZS53aWxsU2h1dGRvd24gPSB0cnVlO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Ly8gU2hvdWxkIG5vdCByZXNvbHZlIHNlc3Npb25zXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuc2Vzc2lvbnMubGVuZ3RoLCAwKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQWdlbnRTZXNzaW9uc0ZpbHRlciAtIER5bmFtaWMgUHJvdmlkZXIgUmVnaXN0cmF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGxldCBtb2NrQ2hhdFNlc3Npb25zU2VydmljZTogTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2U7XG5cdFx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZSA9IG5ldyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSgpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBkaXNwb3NhYmxlcykpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwgbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9KTtcblxuXHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc3BvbmQgdG8gb25EaWRDaGFuZ2VBdmFpbGFiaWxpdHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWx0ZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50U2Vzc2lvbnNGaWx0ZXIsXG5cdFx0XHRcdHsgZmlsdGVyTWVudUlkOiBNZW51SWQuVmlld1RpdGxlIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsdGVyLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0Ly8gRXZlbnQgaGFuZGxlciByZWdpc3RlcmVkIHRvIHZlcmlmeSBmaWx0ZXIgcmVzcG9uZHMgdG8gYXZhaWxhYmlsaXR5IGNoYW5nZXNcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gVHJpZ2dlciBhdmFpbGFiaWxpdHkgY2hhbmdlXG5cdFx0XHRtb2NrQ2hhdFNlc3Npb25zU2VydmljZS5maXJlRGlkQ2hhbmdlQXZhaWxhYmlsaXR5KCk7XG5cblx0XHRcdC8vIEZpbHRlciBzaG91bGQgdXBkYXRlIGl0cyBhY3Rpb25zIChpbnRlcm5hbGx5KVxuXHRcdFx0Ly8gV2UgY2FuJ3QgZGlyZWN0bHkgdGVzdCBhY3Rpb24gcmVnaXN0cmF0aW9uIGJ1dCB3ZSB2ZXJpZmllZCBldmVudCBoYW5kbGluZ1xuXHRcdH0pO1xuXHR9KTtcblxufSk7IC8vIEVuZCBvZiBBZ2VudCBTZXNzaW9ucyBzdWl0ZVxuXG5jb25zdCBjaGF0U2Vzc2lvblRlc3RUeXBlID0gJ3Rlc3QtdHlwZSc7XG5cbmZ1bmN0aW9uIG1ha2VTaW1wbGVTZXNzaW9uSXRlbShpZDogc3RyaW5nLCBvdmVycmlkZXM/OiBQYXJ0aWFsPElDaGF0U2Vzc2lvbkl0ZW0+KTogSUNoYXRTZXNzaW9uSXRlbSB7XG5cdHJldHVybiB7XG5cdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShgJHtjaGF0U2Vzc2lvblRlc3RUeXBlfTovLyR7aWR9YCksXG5cdFx0bGFiZWw6IGBTZXNzaW9uICR7aWR9YCxcblx0XHR0aW1pbmc6IG1ha2VOZXdTZXNzaW9uVGltaW5nKCksXG5cdFx0Li4ub3ZlcnJpZGVzXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VOZXdTZXNzaW9uVGltaW5nKG9wdGlvbnM/OiB7XG5cdGNyZWF0ZWQ/OiBudW1iZXI7XG5cdGxhc3RSZXF1ZXN0U3RhcnRlZD86IG51bWJlciB8IHVuZGVmaW5lZDtcblx0bGFzdFJlcXVlc3RFbmRlZD86IG51bWJlciB8IHVuZGVmaW5lZDtcbn0pOiBJQ2hhdFNlc3Npb25JdGVtWyd0aW1pbmcnXSB7XG5cdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdHJldHVybiB7XG5cdFx0Y3JlYXRlZDogb3B0aW9ucz8uY3JlYXRlZCA/PyBub3csXG5cdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBvcHRpb25zPy5sYXN0UmVxdWVzdFN0YXJ0ZWQsXG5cdFx0bGFzdFJlcXVlc3RFbmRlZDogb3B0aW9ucz8ubGFzdFJlcXVlc3RFbmRlZCxcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyxvQkFBbUMsZ0JBQWdCLHNCQUFzQiwrQkFBK0I7QUFDakgsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQkFBeUYsc0JBQXNC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VyxDQUFDLENBQUM7QUFFM0YsZ0NBQXdCLGtDQUFrQyxxQkFBcUIsVUFBVTtBQUN6RixvQkFBWSxZQUFZLElBQUkscUJBQXFCLGVBQWUsa0JBQWtCLENBQUM7QUFHbkYsNkJBQXFCLGVBQWU7QUFFcEMsY0FBTSxVQUFVLFFBQVEsTUFBUztBQUdqQyxlQUFPLFlBQVksVUFBVSxTQUFTLFFBQVEsQ0FBQztBQUFBLE1BQ2hELENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHVEQUF1RCxNQUFNO0FBQ2xFLFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxRQUFJO0FBQ0osUUFBSTtBQUVKLFVBQU0sTUFBTTtBQUNYLGdDQUEwQixJQUFJLHdCQUF3QjtBQUN0RCw2QkFBdUIsWUFBWSxJQUFJLDhCQUE4QixRQUFXLFdBQVcsQ0FBQztBQUM1RiwyQkFBcUIsS0FBSyxzQkFBc0IsdUJBQXVCO0FBQUEsSUFDeEUsQ0FBQztBQUVELGFBQVMsTUFBTTtBQUNkLGtCQUFZLE1BQU07QUFBQSxJQUNuQixDQUFDO0FBRUQsNENBQXdDO0FBRXhDLFNBQUssNkNBQTZDLE1BQU07QUFDdkQsWUFBTSxTQUFTLFlBQVksSUFBSSxxQkFBcUI7QUFBQSxRQUNuRDtBQUFBLFFBQ0EsRUFBRSxjQUFjLE9BQU8sVUFBVTtBQUFBLE1BQ2xDLENBQUM7QUFFRCxrQkFBWSxJQUFJLE9BQU8sWUFBWSxNQUFNO0FBQUEsTUFFekMsQ0FBQyxDQUFDO0FBR0YsOEJBQXdCLDBCQUEwQjtBQUFBLElBSW5ELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRixDQUFDO0FBRUQsTUFBTSxzQkFBc0I7QUFFNUIsU0FBUyxzQkFBc0IsSUFBWSxXQUF5RDtBQUNuRyxTQUFPO0FBQUEsSUFDTixVQUFVLElBQUksTUFBTSxHQUFHLG1CQUFtQixNQUFNLEVBQUUsRUFBRTtBQUFBLElBQ3BELE9BQU8sV0FBVyxFQUFFO0FBQUEsSUFDcEIsUUFBUSxxQkFBcUI7QUFBQSxJQUM3QixHQUFHO0FBQUEsRUFDSjtBQUNEO0FBRUEsU0FBUyxxQkFBcUIsU0FJQztBQUM5QixRQUFNLE1BQU0sS0FBSyxJQUFJO0FBQ3JCLFNBQU87QUFBQSxJQUNOLFNBQVMsU0FBUyxXQUFXO0FBQUEsSUFDN0Isb0JBQW9CLFNBQVM7QUFBQSxJQUM3QixrQkFBa0IsU0FBUztBQUFBLEVBQzVCO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
