import assert from "assert";
import { mainWindow } from "../../../../../base/browser/window.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Event } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CommandsRegistry, ICommandService } from "../../../../../platform/commands/common/commands.js";
import { createDecorator } from "../../../../../platform/instantiation/common/instantiation.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IWorkbenchAssignmentService } from "../../../../../workbench/services/assignment/common/assignmentService.js";
import { IChatService } from "../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { IVoicePlaybackService } from "../../../../../workbench/contrib/chat/common/voicePlaybackService.js";
import { workbenchInstantiationService } from "../../../../../workbench/test/browser/workbenchTestServices.js";
import { RENAME_SESSION_COMMAND_ID } from "../../../../common/sessionCommands.js";
import { IAgentHostFilterService } from "../../../../services/agentHostFilter/common/agentHostFilter.js";
import { ISessionsListModelService } from "../../../../services/sessions/browser/sessionsListModelService.js";
import { ISessionGroupsService } from "../../../../services/sessions/browser/sessionGroupsService.js";
import { ISessionSectionOrderService } from "../../../../services/sessions/browser/sessionSectionOrderService.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { ISessionsPartService } from "../../../../services/sessions/browser/sessionsPartService.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { SessionsChatAccessibilityHelp } from "../../../chat/browser/sessionsChatAccessibilityHelp.js";
import { SessionsFlatList, SessionsGrouping, SessionsList, SessionsSorting } from "../../browser/views/sessionsList.js";
import "../../browser/views/sessionsViewActions.js";
const ITestAgentSessionsService = createDecorator("agentSessions");
class TestCommandService extends mock() {
  constructor() {
    super(...arguments);
    this.calls = [];
  }
  async executeCommand(commandId, ...args) {
    this.calls.push({ commandId, args });
    return void 0;
  }
}
class TestSessionsManagementService extends mock() {
  constructor(sessions) {
    super();
    this.onDidChangeSessions = Event.None;
    this.readSessions = [];
    this.renamed = [];
    this.sessions = sessions;
  }
  getSessions() {
    return this.sessions;
  }
  async markRead(session) {
    this.readSessions.push(session);
  }
  async renameSession(session, title) {
    this.renamed.push({ session, title });
    if (this.renameError) {
      throw this.renameError;
    }
  }
}
class TestQuickInputService extends mock() {
  constructor() {
    super(...arguments);
    this.calls = 0;
  }
  async input(options) {
    this.calls++;
    this.options = options;
    return this.result;
  }
}
function createSession(title, resourceId = title) {
  const now = /* @__PURE__ */ new Date();
  const resource = URI.parse(`test-session://${resourceId}`);
  const capabilities = observableValue(`capabilities-${resourceId}`, { supportsMultipleChats: false, supportsRename: true });
  const session = {
    sessionId: resourceId,
    resource,
    providerId: "test",
    sessionType: "test",
    icon: Codicon.account,
    createdAt: now,
    workspace: constObservable({
      uri: URI.parse(`test-workspace://${resourceId}`),
      label: "Workspace",
      icon: Codicon.folder,
      folders: [],
      requiresWorkspaceTrust: false,
      isVirtualWorkspace: false
    }),
    isQuickChat: constObservable(false),
    title: constObservable(title),
    updatedAt: constObservable(now),
    status: constObservable(SessionStatus.Completed),
    changesets: constObservable([]),
    changes: constObservable([]),
    modelId: constObservable(void 0),
    mode: constObservable(void 0),
    loading: constObservable(false),
    isArchived: constObservable(false),
    isRead: constObservable(true),
    description: constObservable(void 0),
    lastTurnEnd: constObservable(void 0),
    chats: constObservable([]),
    mainChat: constObservable(new class extends mock() {
    }()),
    capabilities
  };
  return { session, capabilities };
}
function createListHarness(disposables, sessions) {
  const store = disposables.add(new DisposableStore());
  const instantiationService = workbenchInstantiationService(void 0, store);
  const managementService = new TestSessionsManagementService(sessions);
  const commandService = new TestCommandService();
  instantiationService.stub(ISessionsManagementService, managementService);
  instantiationService.stub(ICommandService, commandService);
  instantiationService.stub(ISessionsService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.visibleSessions = constObservable([]);
      this.activeSession = constObservable(void 0);
    }
  }());
  instantiationService.stub(ISessionsListModelService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChange = Event.None;
    }
    isSessionPinned() {
      return false;
    }
    migrateLegacyReadState() {
    }
    getSortKey(session, mode) {
      return mode === "created" ? session.createdAt.getTime() : session.updatedAt.get().getTime();
    }
    getStatusIcon() {
      return Codicon.circleSmallFilled;
    }
  }());
  instantiationService.stub(ISessionGroupsService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChange = Event.None;
    }
    getGroups() {
      return [];
    }
    getGroupOfSession() {
      return void 0;
    }
    getSessionIdsInGroup() {
      return [];
    }
  }());
  instantiationService.stub(ISessionSectionOrderService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChange = Event.None;
    }
    resolveOrder(ids) {
      return [...ids];
    }
    isPromoted() {
      return false;
    }
    retain() {
    }
  }());
  instantiationService.stub(IAgentHostFilterService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChange = Event.None;
      this.selectedProviderId = void 0;
    }
  }());
  instantiationService.stub(IWorkbenchAssignmentService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidRefetchAssignments = Event.None;
    }
    async getTreatment() {
      return void 0;
    }
  }());
  instantiationService.stub(ISessionsProvidersService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeProviders = Event.None;
    }
    getProviders() {
      return [];
    }
  }());
  instantiationService.stub(IVoicePlaybackService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.pendingResponseVersion = constObservable(0);
    }
    hasPendingResponse() {
      return false;
    }
  }());
  instantiationService.stub(ITestAgentSessionsService, {
    model: {
      observeSession: () => constObservable(void 0)
    }
  });
  instantiationService.stub(IChatService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.chatModels = constObservable([]);
    }
  }());
  const createContainer = () => {
    const container = mainWindow.document.createElement("div");
    container.style.width = "400px";
    container.style.height = "300px";
    mainWindow.document.body.appendChild(container);
    store.add({ dispose: () => container.remove() });
    return container;
  };
  return { store, instantiationService, managementService, commandService, createContainer };
}
function dispatchDoubleClick(target, options = {}) {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1, ...options }));
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 2, ...options }));
  const doubleClick = new MouseEvent("dblclick", { bubbles: true, cancelable: true, button: 0, detail: 2, ...options });
  target.dispatchEvent(doubleClick);
  return doubleClick;
}
suite("Sessions rename", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  suite("list interaction", () => {
    test("title double-click opens once and requests rename once", () => {
      const { session } = createSession("First");
      const harness = createListHarness(disposables, [session]);
      const openCalls = [];
      const container = harness.createContainer();
      const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
        grouping: () => SessionsGrouping.Date,
        sorting: () => SessionsSorting.Created,
        onSessionOpen: (resource) => openCalls.push(resource)
      }));
      list.layout(300, 400);
      const title = container.querySelector(".session-item .monaco-highlighted-label");
      assert.ok(title);
      let bubbled = 0;
      container.addEventListener("dblclick", () => bubbled++);
      const doubleClick = dispatchDoubleClick(title);
      assert.deepStrictEqual({
        openCalls: openCalls.map((resource) => resource.toString()),
        renameCalls: harness.commandService.calls.filter((call) => call.commandId === RENAME_SESSION_COMMAND_ID),
        defaultPrevented: doubleClick.defaultPrevented,
        bubbled
      }, {
        openCalls: [session.resource.toString()],
        renameCalls: [{ commandId: RENAME_SESSION_COMMAND_ID, args: [session] }],
        defaultPrevented: true,
        bubbled: 0
      });
    });
    test("rename is title-only, unmodified, capability-gated, and rebound safely", () => {
      const first = createSession("First", "shared");
      const harness = createListHarness(disposables, [first.session]);
      const container = harness.createContainer();
      const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
        grouping: () => SessionsGrouping.Date,
        sorting: () => SessionsSorting.Created,
        onSessionOpen: () => {
        }
      }));
      list.layout(300, 400);
      for (const selector of [".session-icon", ".session-title", ".session-details-row", ".session-title-toolbar"]) {
        const target = container.querySelector(`.session-item ${selector}`);
        assert.ok(target);
        dispatchDoubleClick(target);
      }
      const title = container.querySelector(".session-item .monaco-highlighted-label");
      assert.ok(title);
      dispatchDoubleClick(title, { altKey: true });
      assert.strictEqual(harness.commandService.calls.filter((call) => call.commandId === RENAME_SESSION_COMMAND_ID).length, 0);
      first.capabilities.set({ supportsMultipleChats: false, supportsRename: false }, void 0);
      const unsupported = dispatchDoubleClick(title);
      assert.strictEqual(unsupported.defaultPrevented, false);
      assert.strictEqual(harness.commandService.calls.filter((call) => call.commandId === RENAME_SESSION_COMMAND_ID).length, 0);
      const replacement = createSession("Replacement", "shared");
      harness.managementService.sessions = [replacement.session];
      list.refresh();
      list.layout(300, 400);
      const replacementTitle = container.querySelector(".session-item .monaco-highlighted-label");
      assert.ok(replacementTitle);
      assert.strictEqual(replacementTitle.textContent, "Replacement");
      dispatchDoubleClick(replacementTitle);
      assert.deepStrictEqual(
        harness.commandService.calls.filter((call) => call.commandId === RENAME_SESSION_COMMAND_ID),
        [{ commandId: RENAME_SESSION_COMMAND_ID, args: [replacement.session] }]
      );
    });
    test("flat session lists do not request rename", () => {
      const { session } = createSession("Flat");
      const harness = createListHarness(disposables, [session]);
      const container = harness.createContainer();
      const list = harness.store.add(harness.instantiationService.createInstance(SessionsFlatList, container, {
        showSessionHover: false,
        onSessionOpen: () => {
        }
      }));
      list.setSessions([session]);
      list.layout(100, 400);
      const title = container.querySelector(".session-item .monaco-highlighted-label");
      assert.ok(title);
      dispatchDoubleClick(title);
      assert.strictEqual(harness.commandService.calls.filter((call) => call.commandId === RENAME_SESSION_COMMAND_ID).length, 0);
    });
  });
  suite("action", () => {
    function createActionHarness(title = "Existing", supportsRename = true) {
      const instantiationService = disposables.add(new TestInstantiationService());
      const quickInputService = new TestQuickInputService();
      const managementService = new TestSessionsManagementService([]);
      const sessionData = createSession(title);
      sessionData.capabilities.set({ supportsMultipleChats: false, supportsRename }, void 0);
      instantiationService.stub(IQuickInputService, quickInputService);
      instantiationService.stub(ISessionsManagementService, managementService);
      const handler = CommandsRegistry.getCommand(RENAME_SESSION_COMMAND_ID)?.handler;
      assert.ok(handler);
      return { handler, instantiationService, quickInputService, managementService, session: sessionData.session };
    }
    test("direct invocation is capability-gated", async () => {
      const harness = createActionHarness("Existing", false);
      await harness.handler(harness.instantiationService, harness.session);
      assert.deepStrictEqual({ inputCalls: harness.quickInputService.calls, renamed: harness.managementService.renamed }, { inputCalls: 0, renamed: [] });
    });
    test("validates input and ignores cancellation, whitespace, and unchanged titles", async () => {
      const cancelled = createActionHarness();
      cancelled.quickInputService.result = void 0;
      await cancelled.handler(cancelled.instantiationService, cancelled.session);
      const whitespace = createActionHarness();
      whitespace.quickInputService.result = "   ";
      await whitespace.handler(whitespace.instantiationService, whitespace.session);
      const validationMessage = await whitespace.quickInputService.options?.validateInput?.("   ");
      const unchanged = createActionHarness();
      unchanged.quickInputService.result = " Existing ";
      await unchanged.handler(unchanged.instantiationService, unchanged.session);
      assert.deepStrictEqual({
        cancelled: cancelled.managementService.renamed,
        whitespace: whitespace.managementService.renamed,
        validationMessage,
        unchanged: unchanged.managementService.renamed
      }, {
        cancelled: [],
        whitespace: [],
        validationMessage: "Title cannot be empty",
        unchanged: []
      });
    });
    test("trims changed titles and propagates provider errors", async () => {
      const success = createActionHarness();
      success.quickInputService.result = " New title ";
      await success.handler(success.instantiationService, success.session);
      const failure = createActionHarness();
      failure.quickInputService.result = "Fails";
      failure.managementService.renameError = new Error("rename failed");
      await assert.rejects(async () => {
        await failure.handler(failure.instantiationService, failure.session);
      }, failure.managementService.renameError);
      assert.deepStrictEqual({
        success: success.managementService.renamed,
        failure: failure.managementService.renamed
      }, {
        success: [{ session: success.session, title: "New title" }],
        failure: [{ session: failure.session, title: "Fails" }]
      });
    });
  });
  suite("accessibility help", () => {
    function createHelpProvider(origin, removeOrigin = false) {
      const instantiationService = disposables.add(new TestInstantiationService());
      let fallbackFocusCount = 0;
      const fallbackView = new class extends mock() {
        focus() {
          fallbackFocusCount++;
        }
      }();
      const activeSession = new class extends mock() {
        constructor() {
          super(...arguments);
          this.sessionId = "active";
        }
      }();
      instantiationService.stub(ISessionsPartService, new class extends mock() {
        getSessionView() {
          return fallbackView;
        }
      }());
      instantiationService.stub(ISessionsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeSession = constObservable(activeSession);
        }
      }());
      mainWindow.document.body.appendChild(origin);
      disposables.add({ dispose: () => origin.remove() });
      origin.focus();
      const provider = disposables.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));
      if (removeOrigin) {
        origin.remove();
      }
      return { provider, fallbackFocusCount: () => fallbackFocusCount };
    }
    test("documents pointer and keyboard rename paths and restores originating focus", () => {
      const origin = mainWindow.document.createElement("button");
      const { provider, fallbackFocusCount } = createHelpProvider(origin);
      const content = provider.provideContent();
      provider.onClose();
      assert.deepStrictEqual({
        hasDoubleClick: content.includes("double-click its title"),
        hasContextMenu: content.includes("open its context menu"),
        activeElement: mainWindow.document.activeElement,
        fallbackFocusCount: fallbackFocusCount()
      }, {
        hasDoubleClick: true,
        hasContextMenu: true,
        activeElement: origin,
        fallbackFocusCount: 0
      });
    });
    test("falls back to the active session when the originating element is gone", () => {
      const origin = mainWindow.document.createElement("button");
      const { provider, fallbackFocusCount } = createHelpProvider(origin, true);
      provider.onClose();
      assert.strictEqual(fallbackFocusCount(), 1);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvdGVzdC9icm93c2VyL3Nlc3Npb25zUmVuYW1lLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUlucHV0T3B0aW9ucywgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvYXNzaWdubWVudC9jb21tb24vYXNzaWdubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZvaWNlUGxheWJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vdm9pY2VQbGF5YmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBSRU5BTUVfU0VTU0lPTl9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Nlc3Npb25Db21tYW5kcy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uVmlldyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvc2Vzc2lvblZpZXcuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEZpbHRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9hZ2VudEhvc3RGaWx0ZXIvY29tbW9uL2FnZW50SG9zdEZpbHRlci5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlLCBTZXNzaW9uU29ydE1vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zTGlzdE1vZGVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25Hcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uU2VjdGlvbk9yZGVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvblNlY3Rpb25PcmRlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1BhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1BhcnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiwgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElDaGF0LCBJU2Vzc2lvbiwgSVNlc3Npb25DYXBhYmlsaXRpZXMsIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uc0NoYXRBY2Nlc3NpYmlsaXR5SGVscCB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9zZXNzaW9uc0NoYXRBY2Nlc3NpYmlsaXR5SGVscC5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uc0ZsYXRMaXN0LCBTZXNzaW9uc0dyb3VwaW5nLCBTZXNzaW9uc0xpc3QsIFNlc3Npb25zU29ydGluZyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdmlld3Mvc2Vzc2lvbnNMaXN0LmpzJztcbmltcG9ydCAnLi4vLi4vYnJvd3Nlci92aWV3cy9zZXNzaW9uc1ZpZXdBY3Rpb25zLmpzJztcblxuY29uc3QgSVRlc3RBZ2VudFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxvYmplY3Q+KCdhZ2VudFNlc3Npb25zJyk7XG5cbmNsYXNzIFRlc3RDb21tYW5kU2VydmljZSBleHRlbmRzIG1vY2s8SUNvbW1hbmRTZXJ2aWNlPigpIHtcblx0cmVhZG9ubHkgY2FsbHM6IHsgcmVhZG9ubHkgY29tbWFuZElkOiBzdHJpbmc7IHJlYWRvbmx5IGFyZ3M6IHJlYWRvbmx5IHVua25vd25bXSB9W10gPSBbXTtcblxuXHRvdmVycmlkZSBhc3luYyBleGVjdXRlQ29tbWFuZDxUID0gdW5rbm93bj4oY29tbWFuZElkOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8VCB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuY2FsbHMucHVzaCh7IGNvbW1hbmRJZCwgYXJncyB9KTtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbnMgPSBFdmVudC5Ob25lO1xuXHRzZXNzaW9uczogSVNlc3Npb25bXTtcblx0cmVhZG9ubHkgcmVhZFNlc3Npb25zOiBJU2Vzc2lvbltdID0gW107XG5cdHJlYWRvbmx5IHJlbmFtZWQ6IHsgcmVhZG9ubHkgc2Vzc2lvbjogSVNlc3Npb247IHJlYWRvbmx5IHRpdGxlOiBzdHJpbmcgfVtdID0gW107XG5cdHJlbmFtZUVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihzZXNzaW9uczogSVNlc3Npb25bXSkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5zZXNzaW9ucyA9IHNlc3Npb25zO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbnM7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBtYXJrUmVhZChzZXNzaW9uOiBJU2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMucmVhZFNlc3Npb25zLnB1c2goc2Vzc2lvbik7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyByZW5hbWVTZXNzaW9uKHNlc3Npb246IElTZXNzaW9uLCB0aXRsZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5yZW5hbWVkLnB1c2goeyBzZXNzaW9uLCB0aXRsZSB9KTtcblx0XHRpZiAodGhpcy5yZW5hbWVFcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy5yZW5hbWVFcnJvcjtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgVGVzdFF1aWNrSW5wdXRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJUXVpY2tJbnB1dFNlcnZpY2U+KCkge1xuXHRyZXN1bHQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0b3B0aW9uczogSUlucHV0T3B0aW9ucyB8IHVuZGVmaW5lZDtcblx0Y2FsbHMgPSAwO1xuXG5cdG92ZXJyaWRlIGFzeW5jIGlucHV0KG9wdGlvbnM/OiBJSW5wdXRPcHRpb25zKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLmNhbGxzKys7XG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucztcblx0XHRyZXR1cm4gdGhpcy5yZXN1bHQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbih0aXRsZTogc3RyaW5nLCByZXNvdXJjZUlkOiBzdHJpbmcgPSB0aXRsZSk6IHsgcmVhZG9ubHkgc2Vzc2lvbjogSVNlc3Npb247IHJlYWRvbmx5IGNhcGFiaWxpdGllczogSVNldHRhYmxlT2JzZXJ2YWJsZTxJU2Vzc2lvbkNhcGFiaWxpdGllcywgdm9pZD4gfSB7XG5cdGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG5cdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKGB0ZXN0LXNlc3Npb246Ly8ke3Jlc291cmNlSWR9YCk7XG5cdGNvbnN0IGNhcGFiaWxpdGllcyA9IG9ic2VydmFibGVWYWx1ZTxJU2Vzc2lvbkNhcGFiaWxpdGllcz4oYGNhcGFiaWxpdGllcy0ke3Jlc291cmNlSWR9YCwgeyBzdXBwb3J0c011bHRpcGxlQ2hhdHM6IGZhbHNlLCBzdXBwb3J0c1JlbmFtZTogdHJ1ZSB9KTtcblx0Y29uc3Qgc2Vzc2lvbjogSVNlc3Npb24gPSB7XG5cdFx0c2Vzc2lvbklkOiByZXNvdXJjZUlkLFxuXHRcdHJlc291cmNlLFxuXHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRzZXNzaW9uVHlwZTogJ3Rlc3QnLFxuXHRcdGljb246IENvZGljb24uYWNjb3VudCxcblx0XHRjcmVhdGVkQXQ6IG5vdyxcblx0XHR3b3Jrc3BhY2U6IGNvbnN0T2JzZXJ2YWJsZSh7XG5cdFx0XHR1cmk6IFVSSS5wYXJzZShgdGVzdC13b3Jrc3BhY2U6Ly8ke3Jlc291cmNlSWR9YCksXG5cdFx0XHRsYWJlbDogJ1dvcmtzcGFjZScsXG5cdFx0XHRpY29uOiBDb2RpY29uLmZvbGRlcixcblx0XHRcdGZvbGRlcnM6IFtdLFxuXHRcdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdH0pLFxuXHRcdGlzUXVpY2tDaGF0OiBjb25zdE9ic2VydmFibGUoZmFsc2UpLFxuXHRcdHRpdGxlOiBjb25zdE9ic2VydmFibGUodGl0bGUpLFxuXHRcdHVwZGF0ZWRBdDogY29uc3RPYnNlcnZhYmxlKG5vdyksXG5cdFx0c3RhdHVzOiBjb25zdE9ic2VydmFibGUoU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpLFxuXHRcdGNoYW5nZXNldHM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0Y2hhbmdlczogY29uc3RPYnNlcnZhYmxlKFtdKSxcblx0XHRtb2RlbElkOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0XHRtb2RlOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0XHRsb2FkaW5nOiBjb25zdE9ic2VydmFibGUoZmFsc2UpLFxuXHRcdGlzQXJjaGl2ZWQ6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSksXG5cdFx0aXNSZWFkOiBjb25zdE9ic2VydmFibGUodHJ1ZSksXG5cdFx0ZGVzY3JpcHRpb246IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdGxhc3RUdXJuRW5kOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlPHJlYWRvbmx5IElDaGF0W10+KFtdKSxcblx0XHRtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXQ+KCkgeyB9KSxcblx0XHRjYXBhYmlsaXRpZXMsXG5cdH07XG5cdHJldHVybiB7IHNlc3Npb24sIGNhcGFiaWxpdGllcyB9O1xufVxuXG5pbnRlcmZhY2UgSUxpc3RIYXJuZXNzIHtcblx0cmVhZG9ubHkgc3RvcmU6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0cmVhZG9ubHkgbWFuYWdlbWVudFNlcnZpY2U6IFRlc3RTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlO1xuXHRyZWFkb25seSBjb21tYW5kU2VydmljZTogVGVzdENvbW1hbmRTZXJ2aWNlO1xuXHRjcmVhdGVDb250YWluZXIoKTogSFRNTEVsZW1lbnQ7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxpc3RIYXJuZXNzKGRpc3Bvc2FibGVzOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+LCBzZXNzaW9uczogSVNlc3Npb25bXSk6IElMaXN0SGFybmVzcyB7XG5cdGNvbnN0IHN0b3JlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSk7XG5cdGNvbnN0IG1hbmFnZW1lbnRTZXJ2aWNlID0gbmV3IFRlc3RTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb25zKTtcblx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBuZXcgVGVzdENvbW1hbmRTZXJ2aWNlKCk7XG5cblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgbWFuYWdlbWVudFNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwgY29tbWFuZFNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdmlzaWJsZVNlc3Npb25zID0gY29uc3RPYnNlcnZhYmxlPHJlYWRvbmx5IChJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZClbXT4oW10pO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBjb25zdE9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KHVuZGVmaW5lZCk7XG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zTGlzdE1vZGVsU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGlzU2Vzc2lvblBpbm5lZCgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0b3ZlcnJpZGUgbWlncmF0ZUxlZ2FjeVJlYWRTdGF0ZSgpOiB2b2lkIHsgfVxuXHRcdG92ZXJyaWRlIGdldFNvcnRLZXkoc2Vzc2lvbjogSVNlc3Npb24sIG1vZGU6IFNlc3Npb25Tb3J0TW9kZSk6IG51bWJlciB7XG5cdFx0XHRyZXR1cm4gbW9kZSA9PT0gJ2NyZWF0ZWQnID8gc2Vzc2lvbi5jcmVhdGVkQXQuZ2V0VGltZSgpIDogc2Vzc2lvbi51cGRhdGVkQXQuZ2V0KCkuZ2V0VGltZSgpO1xuXHRcdH1cblx0XHRvdmVycmlkZSBnZXRTdGF0dXNJY29uKCkgeyByZXR1cm4gQ29kaWNvbi5jaXJjbGVTbWFsbEZpbGxlZDsgfVxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbkdyb3Vwc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25Hcm91cHNTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgZ2V0R3JvdXBzKCkgeyByZXR1cm4gW107IH1cblx0XHRvdmVycmlkZSBnZXRHcm91cE9mU2Vzc2lvbigpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdG92ZXJyaWRlIGdldFNlc3Npb25JZHNJbkdyb3VwKCkgeyByZXR1cm4gW107IH1cblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25TZWN0aW9uT3JkZXJTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uU2VjdGlvbk9yZGVyU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlc29sdmVPcmRlcihpZHM6IHJlYWRvbmx5IHN0cmluZ1tdKSB7IHJldHVybiBbLi4uaWRzXTsgfVxuXHRcdG92ZXJyaWRlIGlzUHJvbW90ZWQoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdG92ZXJyaWRlIHJldGFpbigpOiB2b2lkIHsgfVxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0RmlsdGVyU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRIb3N0RmlsdGVyU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlbGVjdGVkUHJvdmlkZXJJZCA9IHVuZGVmaW5lZDtcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRSZWZldGNoQXNzaWdubWVudHMgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGFzeW5jIGdldFRyZWF0bWVudDxUIGV4dGVuZHMgc3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbj4oKTogUHJvbWlzZTxUIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVByb3ZpZGVycyA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgZ2V0UHJvdmlkZXJzKCkgeyByZXR1cm4gW107IH1cblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVZvaWNlUGxheWJhY2tTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElWb2ljZVBsYXliYWNrU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcGVuZGluZ1Jlc3BvbnNlVmVyc2lvbiA9IGNvbnN0T2JzZXJ2YWJsZSgwKTtcblx0XHRvdmVycmlkZSBoYXNQZW5kaW5nUmVzcG9uc2UoKSB7IHJldHVybiBmYWxzZTsgfVxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVzdEFnZW50U2Vzc2lvbnNTZXJ2aWNlLCB7XG5cdFx0bW9kZWw6IHtcblx0XHRcdG9ic2VydmVTZXNzaW9uOiAoKSA9PiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0XHR9LFxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBjaGF0TW9kZWxzID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0fSk7XG5cblx0Y29uc3QgY3JlYXRlQ29udGFpbmVyID0gKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gJzQwMHB4Jztcblx0XHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzMwMHB4Jztcblx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRzdG9yZS5hZGQoeyBkaXNwb3NlOiAoKSA9PiBjb250YWluZXIucmVtb3ZlKCkgfSk7XG5cdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0fTtcblxuXHRyZXR1cm4geyBzdG9yZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG1hbmFnZW1lbnRTZXJ2aWNlLCBjb21tYW5kU2VydmljZSwgY3JlYXRlQ29udGFpbmVyIH07XG59XG5cbmZ1bmN0aW9uIGRpc3BhdGNoRG91YmxlQ2xpY2sodGFyZ2V0OiBIVE1MRWxlbWVudCwgb3B0aW9uczogTW91c2VFdmVudEluaXQgPSB7fSk6IE1vdXNlRXZlbnQge1xuXHR0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUsIGNhbmNlbGFibGU6IHRydWUsIGJ1dHRvbjogMCwgZGV0YWlsOiAxLCAuLi5vcHRpb25zIH0pKTtcblx0dGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2NsaWNrJywgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlLCBidXR0b246IDAsIGRldGFpbDogMiwgLi4ub3B0aW9ucyB9KSk7XG5cdGNvbnN0IGRvdWJsZUNsaWNrID0gbmV3IE1vdXNlRXZlbnQoJ2RibGNsaWNrJywgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlLCBidXR0b246IDAsIGRldGFpbDogMiwgLi4ub3B0aW9ucyB9KTtcblx0dGFyZ2V0LmRpc3BhdGNoRXZlbnQoZG91YmxlQ2xpY2spO1xuXHRyZXR1cm4gZG91YmxlQ2xpY2s7XG59XG5cbnN1aXRlKCdTZXNzaW9ucyByZW5hbWUnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2xpc3QgaW50ZXJhY3Rpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgndGl0bGUgZG91YmxlLWNsaWNrIG9wZW5zIG9uY2UgYW5kIHJlcXVlc3RzIHJlbmFtZSBvbmNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBjcmVhdGVTZXNzaW9uKCdGaXJzdCcpO1xuXHRcdFx0Y29uc3QgaGFybmVzcyA9IGNyZWF0ZUxpc3RIYXJuZXNzKGRpc3Bvc2FibGVzLCBbc2Vzc2lvbl0pO1xuXHRcdFx0Y29uc3Qgb3BlbkNhbGxzOiBVUklbXSA9IFtdO1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gaGFybmVzcy5jcmVhdGVDb250YWluZXIoKTtcblx0XHRcdGNvbnN0IGxpc3QgPSBoYXJuZXNzLnN0b3JlLmFkZChoYXJuZXNzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zTGlzdCwgY29udGFpbmVyLCB7XG5cdFx0XHRcdGdyb3VwaW5nOiAoKSA9PiBTZXNzaW9uc0dyb3VwaW5nLkRhdGUsXG5cdFx0XHRcdHNvcnRpbmc6ICgpID0+IFNlc3Npb25zU29ydGluZy5DcmVhdGVkLFxuXHRcdFx0XHRvblNlc3Npb25PcGVuOiByZXNvdXJjZSA9PiBvcGVuQ2FsbHMucHVzaChyZXNvdXJjZSksXG5cdFx0XHR9KSk7XG5cdFx0XHRsaXN0LmxheW91dCgzMDAsIDQwMCk7XG5cdFx0XHRjb25zdCB0aXRsZSA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnNlc3Npb24taXRlbSAubW9uYWNvLWhpZ2hsaWdodGVkLWxhYmVsJyk7XG5cdFx0XHRhc3NlcnQub2sodGl0bGUpO1xuXG5cdFx0XHRsZXQgYnViYmxlZCA9IDA7XG5cdFx0XHRjb250YWluZXIuYWRkRXZlbnRMaXN0ZW5lcignZGJsY2xpY2snLCAoKSA9PiBidWJibGVkKyspO1xuXHRcdFx0Y29uc3QgZG91YmxlQ2xpY2sgPSBkaXNwYXRjaERvdWJsZUNsaWNrKHRpdGxlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdG9wZW5DYWxsczogb3BlbkNhbGxzLm1hcChyZXNvdXJjZSA9PiByZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHRcdFx0cmVuYW1lQ2FsbHM6IGhhcm5lc3MuY29tbWFuZFNlcnZpY2UuY2FsbHMuZmlsdGVyKGNhbGwgPT4gY2FsbC5jb21tYW5kSWQgPT09IFJFTkFNRV9TRVNTSU9OX0NPTU1BTkRfSUQpLFxuXHRcdFx0XHRkZWZhdWx0UHJldmVudGVkOiBkb3VibGVDbGljay5kZWZhdWx0UHJldmVudGVkLFxuXHRcdFx0XHRidWJibGVkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRvcGVuQ2FsbHM6IFtzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCldLFxuXHRcdFx0XHRyZW5hbWVDYWxsczogW3sgY29tbWFuZElkOiBSRU5BTUVfU0VTU0lPTl9DT01NQU5EX0lELCBhcmdzOiBbc2Vzc2lvbl0gfV0sXG5cdFx0XHRcdGRlZmF1bHRQcmV2ZW50ZWQ6IHRydWUsXG5cdFx0XHRcdGJ1YmJsZWQ6IDAsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmFtZSBpcyB0aXRsZS1vbmx5LCB1bm1vZGlmaWVkLCBjYXBhYmlsaXR5LWdhdGVkLCBhbmQgcmVib3VuZCBzYWZlbHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaXJzdCA9IGNyZWF0ZVNlc3Npb24oJ0ZpcnN0JywgJ3NoYXJlZCcpO1xuXHRcdFx0Y29uc3QgaGFybmVzcyA9IGNyZWF0ZUxpc3RIYXJuZXNzKGRpc3Bvc2FibGVzLCBbZmlyc3Quc2Vzc2lvbl0pO1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gaGFybmVzcy5jcmVhdGVDb250YWluZXIoKTtcblx0XHRcdGNvbnN0IGxpc3QgPSBoYXJuZXNzLnN0b3JlLmFkZChoYXJuZXNzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zTGlzdCwgY29udGFpbmVyLCB7XG5cdFx0XHRcdGdyb3VwaW5nOiAoKSA9PiBTZXNzaW9uc0dyb3VwaW5nLkRhdGUsXG5cdFx0XHRcdHNvcnRpbmc6ICgpID0+IFNlc3Npb25zU29ydGluZy5DcmVhdGVkLFxuXHRcdFx0XHRvblNlc3Npb25PcGVuOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRsaXN0LmxheW91dCgzMDAsIDQwMCk7XG5cblx0XHRcdGZvciAoY29uc3Qgc2VsZWN0b3Igb2YgWycuc2Vzc2lvbi1pY29uJywgJy5zZXNzaW9uLXRpdGxlJywgJy5zZXNzaW9uLWRldGFpbHMtcm93JywgJy5zZXNzaW9uLXRpdGxlLXRvb2xiYXInXSkge1xuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oYC5zZXNzaW9uLWl0ZW0gJHtzZWxlY3Rvcn1gKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHRhcmdldCk7XG5cdFx0XHRcdGRpc3BhdGNoRG91YmxlQ2xpY2sodGFyZ2V0KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRpdGxlID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuc2Vzc2lvbi1pdGVtIC5tb25hY28taGlnaGxpZ2h0ZWQtbGFiZWwnKTtcblx0XHRcdGFzc2VydC5vayh0aXRsZSk7XG5cdFx0XHRkaXNwYXRjaERvdWJsZUNsaWNrKHRpdGxlLCB7IGFsdEtleTogdHJ1ZSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXJuZXNzLmNvbW1hbmRTZXJ2aWNlLmNhbGxzLmZpbHRlcihjYWxsID0+IGNhbGwuY29tbWFuZElkID09PSBSRU5BTUVfU0VTU0lPTl9DT01NQU5EX0lEKS5sZW5ndGgsIDApO1xuXG5cdFx0XHRmaXJzdC5jYXBhYmlsaXRpZXMuc2V0KHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBmYWxzZSwgc3VwcG9ydHNSZW5hbWU6IGZhbHNlIH0sIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCB1bnN1cHBvcnRlZCA9IGRpc3BhdGNoRG91YmxlQ2xpY2sodGl0bGUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3VwcG9ydGVkLmRlZmF1bHRQcmV2ZW50ZWQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXJuZXNzLmNvbW1hbmRTZXJ2aWNlLmNhbGxzLmZpbHRlcihjYWxsID0+IGNhbGwuY29tbWFuZElkID09PSBSRU5BTUVfU0VTU0lPTl9DT01NQU5EX0lEKS5sZW5ndGgsIDApO1xuXG5cdFx0XHRjb25zdCByZXBsYWNlbWVudCA9IGNyZWF0ZVNlc3Npb24oJ1JlcGxhY2VtZW50JywgJ3NoYXJlZCcpO1xuXHRcdFx0aGFybmVzcy5tYW5hZ2VtZW50U2VydmljZS5zZXNzaW9ucyA9IFtyZXBsYWNlbWVudC5zZXNzaW9uXTtcblx0XHRcdGxpc3QucmVmcmVzaCgpO1xuXHRcdFx0bGlzdC5sYXlvdXQoMzAwLCA0MDApO1xuXHRcdFx0Y29uc3QgcmVwbGFjZW1lbnRUaXRsZSA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnNlc3Npb24taXRlbSAubW9uYWNvLWhpZ2hsaWdodGVkLWxhYmVsJyk7XG5cdFx0XHRhc3NlcnQub2socmVwbGFjZW1lbnRUaXRsZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVwbGFjZW1lbnRUaXRsZS50ZXh0Q29udGVudCwgJ1JlcGxhY2VtZW50Jyk7XG5cdFx0XHRkaXNwYXRjaERvdWJsZUNsaWNrKHJlcGxhY2VtZW50VGl0bGUpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRoYXJuZXNzLmNvbW1hbmRTZXJ2aWNlLmNhbGxzLmZpbHRlcihjYWxsID0+IGNhbGwuY29tbWFuZElkID09PSBSRU5BTUVfU0VTU0lPTl9DT01NQU5EX0lEKSxcblx0XHRcdFx0W3sgY29tbWFuZElkOiBSRU5BTUVfU0VTU0lPTl9DT01NQU5EX0lELCBhcmdzOiBbcmVwbGFjZW1lbnQuc2Vzc2lvbl0gfV0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmxhdCBzZXNzaW9uIGxpc3RzIGRvIG5vdCByZXF1ZXN0IHJlbmFtZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gY3JlYXRlU2Vzc2lvbignRmxhdCcpO1xuXHRcdFx0Y29uc3QgaGFybmVzcyA9IGNyZWF0ZUxpc3RIYXJuZXNzKGRpc3Bvc2FibGVzLCBbc2Vzc2lvbl0pO1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gaGFybmVzcy5jcmVhdGVDb250YWluZXIoKTtcblx0XHRcdGNvbnN0IGxpc3QgPSBoYXJuZXNzLnN0b3JlLmFkZChoYXJuZXNzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zRmxhdExpc3QsIGNvbnRhaW5lciwge1xuXHRcdFx0XHRzaG93U2Vzc2lvbkhvdmVyOiBmYWxzZSxcblx0XHRcdFx0b25TZXNzaW9uT3BlbjogKCkgPT4geyB9LFxuXHRcdFx0fSkpO1xuXHRcdFx0bGlzdC5zZXRTZXNzaW9ucyhbc2Vzc2lvbl0pO1xuXHRcdFx0bGlzdC5sYXlvdXQoMTAwLCA0MDApO1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5zZXNzaW9uLWl0ZW0gLm1vbmFjby1oaWdobGlnaHRlZC1sYWJlbCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRpdGxlKTtcblxuXHRcdFx0ZGlzcGF0Y2hEb3VibGVDbGljayh0aXRsZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXJuZXNzLmNvbW1hbmRTZXJ2aWNlLmNhbGxzLmZpbHRlcihjYWxsID0+IGNhbGwuY29tbWFuZElkID09PSBSRU5BTUVfU0VTU0lPTl9DT01NQU5EX0lEKS5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYWN0aW9uJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIGNyZWF0ZUFjdGlvbkhhcm5lc3ModGl0bGUgPSAnRXhpc3RpbmcnLCBzdXBwb3J0c1JlbmFtZSA9IHRydWUpIHtcblx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IG5ldyBUZXN0UXVpY2tJbnB1dFNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IG1hbmFnZW1lbnRTZXJ2aWNlID0gbmV3IFRlc3RTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKFtdKTtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhID0gY3JlYXRlU2Vzc2lvbih0aXRsZSk7XG5cdFx0XHRzZXNzaW9uRGF0YS5jYXBhYmlsaXRpZXMuc2V0KHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBmYWxzZSwgc3VwcG9ydHNSZW5hbWUgfSwgdW5kZWZpbmVkKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVF1aWNrSW5wdXRTZXJ2aWNlLCBxdWlja0lucHV0U2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBtYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0XHRjb25zdCBoYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKFJFTkFNRV9TRVNTSU9OX0NPTU1BTkRfSUQpPy5oYW5kbGVyO1xuXHRcdFx0YXNzZXJ0Lm9rKGhhbmRsZXIpO1xuXHRcdFx0cmV0dXJuIHsgaGFuZGxlciwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHF1aWNrSW5wdXRTZXJ2aWNlLCBtYW5hZ2VtZW50U2VydmljZSwgc2Vzc2lvbjogc2Vzc2lvbkRhdGEuc2Vzc2lvbiB9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ2RpcmVjdCBpbnZvY2F0aW9uIGlzIGNhcGFiaWxpdHktZ2F0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBoYXJuZXNzID0gY3JlYXRlQWN0aW9uSGFybmVzcygnRXhpc3RpbmcnLCBmYWxzZSk7XG5cblx0XHRcdGF3YWl0IGhhcm5lc3MuaGFuZGxlcihoYXJuZXNzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBoYXJuZXNzLnNlc3Npb24pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgaW5wdXRDYWxsczogaGFybmVzcy5xdWlja0lucHV0U2VydmljZS5jYWxscywgcmVuYW1lZDogaGFybmVzcy5tYW5hZ2VtZW50U2VydmljZS5yZW5hbWVkIH0sIHsgaW5wdXRDYWxsczogMCwgcmVuYW1lZDogW10gfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2YWxpZGF0ZXMgaW5wdXQgYW5kIGlnbm9yZXMgY2FuY2VsbGF0aW9uLCB3aGl0ZXNwYWNlLCBhbmQgdW5jaGFuZ2VkIHRpdGxlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNhbmNlbGxlZCA9IGNyZWF0ZUFjdGlvbkhhcm5lc3MoKTtcblx0XHRcdGNhbmNlbGxlZC5xdWlja0lucHV0U2VydmljZS5yZXN1bHQgPSB1bmRlZmluZWQ7XG5cdFx0XHRhd2FpdCBjYW5jZWxsZWQuaGFuZGxlcihjYW5jZWxsZWQuaW5zdGFudGlhdGlvblNlcnZpY2UsIGNhbmNlbGxlZC5zZXNzaW9uKTtcblxuXHRcdFx0Y29uc3Qgd2hpdGVzcGFjZSA9IGNyZWF0ZUFjdGlvbkhhcm5lc3MoKTtcblx0XHRcdHdoaXRlc3BhY2UucXVpY2tJbnB1dFNlcnZpY2UucmVzdWx0ID0gJyAgICc7XG5cdFx0XHRhd2FpdCB3aGl0ZXNwYWNlLmhhbmRsZXIod2hpdGVzcGFjZS5pbnN0YW50aWF0aW9uU2VydmljZSwgd2hpdGVzcGFjZS5zZXNzaW9uKTtcblx0XHRcdGNvbnN0IHZhbGlkYXRpb25NZXNzYWdlID0gYXdhaXQgd2hpdGVzcGFjZS5xdWlja0lucHV0U2VydmljZS5vcHRpb25zPy52YWxpZGF0ZUlucHV0Py4oJyAgICcpO1xuXG5cdFx0XHRjb25zdCB1bmNoYW5nZWQgPSBjcmVhdGVBY3Rpb25IYXJuZXNzKCk7XG5cdFx0XHR1bmNoYW5nZWQucXVpY2tJbnB1dFNlcnZpY2UucmVzdWx0ID0gJyBFeGlzdGluZyAnO1xuXHRcdFx0YXdhaXQgdW5jaGFuZ2VkLmhhbmRsZXIodW5jaGFuZ2VkLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB1bmNoYW5nZWQuc2Vzc2lvbik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjYW5jZWxsZWQ6IGNhbmNlbGxlZC5tYW5hZ2VtZW50U2VydmljZS5yZW5hbWVkLFxuXHRcdFx0XHR3aGl0ZXNwYWNlOiB3aGl0ZXNwYWNlLm1hbmFnZW1lbnRTZXJ2aWNlLnJlbmFtZWQsXG5cdFx0XHRcdHZhbGlkYXRpb25NZXNzYWdlLFxuXHRcdFx0XHR1bmNoYW5nZWQ6IHVuY2hhbmdlZC5tYW5hZ2VtZW50U2VydmljZS5yZW5hbWVkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjYW5jZWxsZWQ6IFtdLFxuXHRcdFx0XHR3aGl0ZXNwYWNlOiBbXSxcblx0XHRcdFx0dmFsaWRhdGlvbk1lc3NhZ2U6ICdUaXRsZSBjYW5ub3QgYmUgZW1wdHknLFxuXHRcdFx0XHR1bmNoYW5nZWQ6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cmltcyBjaGFuZ2VkIHRpdGxlcyBhbmQgcHJvcGFnYXRlcyBwcm92aWRlciBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdWNjZXNzID0gY3JlYXRlQWN0aW9uSGFybmVzcygpO1xuXHRcdFx0c3VjY2Vzcy5xdWlja0lucHV0U2VydmljZS5yZXN1bHQgPSAnIE5ldyB0aXRsZSAnO1xuXHRcdFx0YXdhaXQgc3VjY2Vzcy5oYW5kbGVyKHN1Y2Nlc3MuaW5zdGFudGlhdGlvblNlcnZpY2UsIHN1Y2Nlc3Muc2Vzc2lvbik7XG5cblx0XHRcdGNvbnN0IGZhaWx1cmUgPSBjcmVhdGVBY3Rpb25IYXJuZXNzKCk7XG5cdFx0XHRmYWlsdXJlLnF1aWNrSW5wdXRTZXJ2aWNlLnJlc3VsdCA9ICdGYWlscyc7XG5cdFx0XHRmYWlsdXJlLm1hbmFnZW1lbnRTZXJ2aWNlLnJlbmFtZUVycm9yID0gbmV3IEVycm9yKCdyZW5hbWUgZmFpbGVkJyk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgZmFpbHVyZS5oYW5kbGVyKGZhaWx1cmUuaW5zdGFudGlhdGlvblNlcnZpY2UsIGZhaWx1cmUuc2Vzc2lvbik7XG5cdFx0XHR9LCBmYWlsdXJlLm1hbmFnZW1lbnRTZXJ2aWNlLnJlbmFtZUVycm9yKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdWNjZXNzOiBzdWNjZXNzLm1hbmFnZW1lbnRTZXJ2aWNlLnJlbmFtZWQsXG5cdFx0XHRcdGZhaWx1cmU6IGZhaWx1cmUubWFuYWdlbWVudFNlcnZpY2UucmVuYW1lZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0c3VjY2VzczogW3sgc2Vzc2lvbjogc3VjY2Vzcy5zZXNzaW9uLCB0aXRsZTogJ05ldyB0aXRsZScgfV0sXG5cdFx0XHRcdGZhaWx1cmU6IFt7IHNlc3Npb246IGZhaWx1cmUuc2Vzc2lvbiwgdGl0bGU6ICdGYWlscycgfV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2FjY2Vzc2liaWxpdHkgaGVscCcsICgpID0+IHtcblx0XHRmdW5jdGlvbiBjcmVhdGVIZWxwUHJvdmlkZXIob3JpZ2luOiBIVE1MRWxlbWVudCwgcmVtb3ZlT3JpZ2luID0gZmFsc2UpIHtcblx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRsZXQgZmFsbGJhY2tGb2N1c0NvdW50ID0gMDtcblx0XHRcdGNvbnN0IGZhbGxiYWNrVmlldyA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8U2Vzc2lvblZpZXc+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHsgZmFsbGJhY2tGb2N1c0NvdW50Kys7IH1cblx0XHRcdH07XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWN0aXZlU2Vzc2lvbj4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlc3Npb25JZCA9ICdhY3RpdmUnO1xuXHRcdFx0fTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUGFydFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zUGFydFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9uVmlldygpIHsgcmV0dXJuIGZhbGxiYWNrVmlldzsgfVxuXHRcdFx0fSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBjb25zdE9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KGFjdGl2ZVNlc3Npb24pO1xuXHRcdFx0fSk7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvcmlnaW4pO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gb3JpZ2luLnJlbW92ZSgpIH0pO1xuXHRcdFx0b3JpZ2luLmZvY3VzKCk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbnNDaGF0QWNjZXNzaWJpbGl0eUhlbHAoKS5nZXRQcm92aWRlcihpbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdFx0aWYgKHJlbW92ZU9yaWdpbikge1xuXHRcdFx0XHRvcmlnaW4ucmVtb3ZlKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBwcm92aWRlciwgZmFsbGJhY2tGb2N1c0NvdW50OiAoKSA9PiBmYWxsYmFja0ZvY3VzQ291bnQgfTtcblx0XHR9XG5cblx0XHR0ZXN0KCdkb2N1bWVudHMgcG9pbnRlciBhbmQga2V5Ym9hcmQgcmVuYW1lIHBhdGhzIGFuZCByZXN0b3JlcyBvcmlnaW5hdGluZyBmb2N1cycsICgpID0+IHtcblx0XHRcdGNvbnN0IG9yaWdpbiA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG5cdFx0XHRjb25zdCB7IHByb3ZpZGVyLCBmYWxsYmFja0ZvY3VzQ291bnQgfSA9IGNyZWF0ZUhlbHBQcm92aWRlcihvcmlnaW4pO1xuXG5cdFx0XHRjb25zdCBjb250ZW50ID0gcHJvdmlkZXIucHJvdmlkZUNvbnRlbnQoKTtcblx0XHRcdHByb3ZpZGVyLm9uQ2xvc2UoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGhhc0RvdWJsZUNsaWNrOiBjb250ZW50LmluY2x1ZGVzKCdkb3VibGUtY2xpY2sgaXRzIHRpdGxlJyksXG5cdFx0XHRcdGhhc0NvbnRleHRNZW51OiBjb250ZW50LmluY2x1ZGVzKCdvcGVuIGl0cyBjb250ZXh0IG1lbnUnKSxcblx0XHRcdFx0YWN0aXZlRWxlbWVudDogbWFpbldpbmRvdy5kb2N1bWVudC5hY3RpdmVFbGVtZW50LFxuXHRcdFx0XHRmYWxsYmFja0ZvY3VzQ291bnQ6IGZhbGxiYWNrRm9jdXNDb3VudCgpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRoYXNEb3VibGVDbGljazogdHJ1ZSxcblx0XHRcdFx0aGFzQ29udGV4dE1lbnU6IHRydWUsXG5cdFx0XHRcdGFjdGl2ZUVsZW1lbnQ6IG9yaWdpbixcblx0XHRcdFx0ZmFsbGJhY2tGb2N1c0NvdW50OiAwLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIHRoZSBhY3RpdmUgc2Vzc2lvbiB3aGVuIHRoZSBvcmlnaW5hdGluZyBlbGVtZW50IGlzIGdvbmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvcmlnaW4gPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpO1xuXHRcdFx0Y29uc3QgeyBwcm92aWRlciwgZmFsbGJhY2tGb2N1c0NvdW50IH0gPSBjcmVhdGVIZWxwUHJvdmlkZXIob3JpZ2luLCB0cnVlKTtcblxuXHRcdFx0cHJvdmlkZXIub25DbG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFsbGJhY2tGb2N1c0NvdW50KCksIDEpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQkFBc0MsdUJBQXVCO0FBQ3RFLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxrQkFBa0IsdUJBQXVCO0FBQ2xELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQXdCLDBCQUEwQjtBQUNsRCxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFT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
