import assert from "assert";
import * as sinon from "sinon";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../base/common/marshallingIds.js";
import { URI } from "../../../../base/common/uri.js";
import { asSinonMethodStub } from "../../../../base/test/common/sinonUtils.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextKeyService } from "../../../../platform/contextkey/browser/contextKeyService.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { TestInstantiationService } from "../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILogService, NullLogService } from "../../../../platform/log/common/log.js";
import { IAgentSessionsService } from "../../../contrib/chat/browser/agentSessions/agentSessionsService.js";
import { ChatSessionsService } from "../../../contrib/chat/browser/chatSessions/chatSessions.contribution.js";
import { IChatService } from "../../../contrib/chat/common/chatService/chatService.js";
import { IChatSessionsService } from "../../../contrib/chat/common/chatSessionsService.js";
import { ChatAgentLocation } from "../../../contrib/chat/common/constants.js";
import { LocalChatSessionUri } from "../../../contrib/chat/common/model/chatUri.js";
import { MockChatService } from "../../../contrib/chat/test/common/chatService/mockChatService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ExtensionHostKind } from "../../../services/extensions/common/extensionHostKind.js";
import { IExtensionService, nullExtensionDescription } from "../../../services/extensions/common/extensions.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { mock, TestExtensionService } from "../../../test/common/workbenchTestServices.js";
import { MainThreadChatSessions, ObservableChatSession } from "../../browser/mainThreadChatSessions.js";
import { ExtHostChatSessions } from "../../common/extHostChatSessions.js";
import { ExtHostCommands } from "../../common/extHostCommands.js";
import { ExtHostLanguageModels } from "../../common/extHostLanguageModels.js";
import * as extHostTypes from "../../common/extHostTypes.js";
import { AnyCallRPCProtocol } from "../common/testRPCProtocol.js";
suite("ObservableChatSession", function() {
  let disposables;
  let logService;
  let dialogService;
  let proxy;
  setup(function() {
    disposables = new DisposableStore();
    logService = new NullLogService();
    dialogService = new class extends mock() {
      async confirm() {
        return { confirmed: true };
      }
    }();
    proxy = {
      $provideChatSessionContent: sinon.stub(),
      $provideChatSessionProviderOptions: sinon.stub().resolves(void 0),
      $provideHandleOptionsChange: sinon.stub(),
      $interruptChatSessionActiveResponse: sinon.stub(),
      $invokeChatSessionRequestHandler: sinon.stub(),
      $disposeChatSessionContent: sinon.stub(),
      $refreshChatSessionItems: sinon.stub(),
      $onDidChangeChatSessionItemState: sinon.stub(),
      $newChatSessionItem: sinon.stub().resolves(void 0),
      $forkChatSession: sinon.stub().resolves(void 0),
      $resolveChatSessionItem: sinon.stub().resolves(void 0),
      $provideChatSessionInputState: sinon.stub().resolves(void 0)
    };
  });
  teardown(function() {
    disposables.dispose();
    sinon.restore();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createSessionContent(options = {}) {
    const id = options.id || "test-id";
    return {
      resource: LocalChatSessionUri.forSession(id),
      title: options.title,
      history: options.history || [],
      hasActiveResponseCallback: options.hasActiveResponseCallback ?? false,
      hasRequestHandler: options.hasRequestHandler ?? false,
      hasForkHandler: options.hasForkHandler ?? false,
      supportsInterruption: false
    };
  }
  async function createInitializedSession(sessionContent, sessionId = "test-id") {
    const resource = LocalChatSessionUri.forSession(sessionId);
    const session = new ObservableChatSession(resource, 1, proxy, logService, dialogService);
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    await session.initialize(CancellationToken.None, { initialSessionOptions: [] });
    return session;
  }
  test("constructor creates session with proper initial state", function() {
    const sessionId = "test-id";
    const resource = LocalChatSessionUri.forSession(sessionId);
    const session = disposables.add(new ObservableChatSession(resource, 1, proxy, logService, dialogService));
    assert.strictEqual(session.providerHandle, 1);
    assert.deepStrictEqual(session.history, []);
    assert.ok(session.progressObs);
    assert.ok(session.isCompleteObs);
    assert.deepStrictEqual(session.progressObs.get(), []);
    assert.strictEqual(session.isCompleteObs.get(), false);
  });
  test("session queues progress before initialization and processes it after", async function() {
    const sessionId = "test-id";
    const resource = LocalChatSessionUri.forSession(sessionId);
    const session = disposables.add(new ObservableChatSession(resource, 1, proxy, logService, dialogService));
    const progress1 = { kind: "progressMessage", content: { value: "Hello", isTrusted: false } };
    const progress2 = { kind: "progressMessage", content: { value: "World", isTrusted: false } };
    session.handleProgressChunk("req1", [progress1]);
    session.handleProgressChunk("req1", [progress2]);
    assert.deepStrictEqual(session.progressObs.get(), []);
    const sessionContent = createSessionContent();
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    await session.initialize(CancellationToken.None, { initialSessionOptions: [] });
    assert.strictEqual(session.progressObs.get().length, 2);
    assert.deepStrictEqual(session.progressObs.get(), [progress1, progress2]);
    assert.strictEqual(session.isCompleteObs.get(), true);
  });
  test("initialization loads session history and sets up capabilities", async function() {
    const sessionHistory = [
      { type: "request", prompt: "Previous question" },
      { type: "response", parts: [{ kind: "progressMessage", content: { value: "Previous answer", isTrusted: false } }] }
    ];
    const sessionContent = createSessionContent({
      history: sessionHistory,
      hasActiveResponseCallback: true,
      hasRequestHandler: true
    });
    const session = disposables.add(await createInitializedSession(sessionContent));
    assert.strictEqual(session.history.length, 2);
    assert.strictEqual(session.history[0].type, "request");
    assert.strictEqual(session.history[0].prompt, "Previous question");
    assert.strictEqual(session.history[1].type, "response");
    assert.ok(session.interruptActiveResponseCallback);
    assert.ok(session.requestHandler);
  });
  test("initialization revives modeInstructions in history", async function() {
    const sessionContent = createSessionContent({
      history: [
        {
          type: "request",
          prompt: "Hello",
          participant: "test",
          modeInstructions: {
            uri: { $mid: MarshalledId.Uri, scheme: "file", path: "/custom-agent" },
            name: "my-agent",
            content: "instructions",
            toolReferences: [],
            isBuiltin: false
          }
        }
      ]
    });
    const session = disposables.add(await createInitializedSession(sessionContent));
    const requestItem = session.history[0];
    assert.strictEqual(requestItem.type, "request");
    if (requestItem.type === "request") {
      assert.ok(requestItem.modeInstructions);
      assert.ok(URI.isUri(requestItem.modeInstructions.uri));
      assert.strictEqual(requestItem.modeInstructions.name, "my-agent");
      assert.strictEqual(requestItem.modeInstructions.isBuiltin, false);
    }
  });
  test("toRequestDto passes modeInstructions through", async function() {
    const session = disposables.add(await createInitializedSession(createSessionContent({ hasForkHandler: true })));
    assert.ok(session.forkSession);
    const modeInstructions = {
      uri: URI.parse("file:///custom-agent"),
      name: "my-agent",
      content: "agent instructions",
      toolReferences: [],
      isBuiltin: false
    };
    const request = {
      type: "request",
      id: "req-1",
      prompt: "Hello with mode",
      participant: "participant",
      modeInstructions
    };
    const forkedItem = {
      resource: URI.file("/tmp/forked.md"),
      label: "Forked",
      changes: [],
      timing: {
        created: 123,
        lastRequestStarted: 234,
        lastRequestEnded: 345
      }
    };
    asSinonMethodStub(proxy.$forkChatSession).resolves(forkedItem);
    await session.forkSession?.(request, CancellationToken.None);
    const call = asSinonMethodStub(proxy.$forkChatSession).firstCall;
    const sentDto = call.args[2];
    assert.deepStrictEqual(sentDto.modeInstructions, modeInstructions);
  });
  test("initialization sets forkSession and revives forked items", async function() {
    const session = disposables.add(await createInitializedSession(createSessionContent({ hasForkHandler: true })));
    assert.ok(session.forkSession);
    const forkedResource = URI.file("/tmp/forked-chat.md");
    const forkedItem = {
      resource: forkedResource,
      label: "Forked Session",
      timing: {
        created: 123,
        lastRequestStarted: 234,
        lastRequestEnded: 345
      },
      changes: [{
        uri: URI.file("/tmp/changed.ts"),
        originalUri: URI.file("/tmp/original.ts"),
        insertions: 4,
        deletions: 2
      }]
    };
    asSinonMethodStub(proxy.$forkChatSession).resolves(forkedItem);
    const request = { type: "request", id: "request-1", prompt: "Previous question", participant: "participant" };
    const expectedRequestDto = {
      type: "request",
      id: "request-1",
      prompt: "Previous question",
      participant: "participant",
      command: void 0,
      variableData: void 0,
      modelId: void 0,
      modeInstructions: void 0
    };
    const result = await session.forkSession?.(request, CancellationToken.None);
    assert.ok(asSinonMethodStub(proxy.$forkChatSession).calledOnceWithExactly(1, session.sessionResource, expectedRequestDto, CancellationToken.None));
    assert.ok(result);
    assert.ok(result.resource instanceof URI);
    assert.ok(Array.isArray(result.changes));
    assert.ok(result.changes[0].uri instanceof URI);
    assert.ok(result.changes[0].originalUri instanceof URI);
    assert.deepStrictEqual(result, forkedItem);
  });
  test("initialization sets title from session content", async function() {
    const sessionContent = createSessionContent({
      title: "My Custom Title"
    });
    const session = disposables.add(await createInitializedSession(sessionContent));
    assert.strictEqual(session.title, "My Custom Title");
  });
  test("title is undefined when not provided in session content", async function() {
    const sessionContent = createSessionContent();
    const session = disposables.add(await createInitializedSession(sessionContent));
    assert.strictEqual(session.title, void 0);
  });
  test("initialization is idempotent and returns same promise", async function() {
    const sessionId = "test-id";
    const resource = LocalChatSessionUri.forSession(sessionId);
    const session = disposables.add(new ObservableChatSession(resource, 1, proxy, logService, dialogService));
    const sessionContent = createSessionContent();
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    const promise1 = session.initialize(CancellationToken.None, { initialSessionOptions: [] });
    const promise2 = session.initialize(CancellationToken.None, { initialSessionOptions: [] });
    assert.strictEqual(promise1, promise2);
    await promise1;
    assert.ok(asSinonMethodStub(proxy.$provideChatSessionContent).calledOnce);
  });
  test("initialization forwards initial session options context", async function() {
    const sessionId = "test-id";
    const resource = LocalChatSessionUri.forSession(sessionId);
    const session = disposables.add(new ObservableChatSession(resource, 1, proxy, logService, dialogService));
    const initialSessionOptions = [{ optionId: "model", value: "gpt-4.1" }];
    const sessionContent = createSessionContent();
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    await session.initialize(CancellationToken.None, { initialSessionOptions });
    assert.ok(asSinonMethodStub(proxy.$provideChatSessionContent).calledOnceWith(
      1,
      resource,
      { initialSessionOptions },
      CancellationToken.None
    ));
  });
  test("progress handling works correctly after initialization", async function() {
    const sessionContent = createSessionContent();
    const session = disposables.add(await createInitializedSession(sessionContent));
    const progress = { kind: "progressMessage", content: { value: "New progress", isTrusted: false } };
    session.handleProgressChunk("req1", [progress]);
    assert.deepStrictEqual(session.progressObs.get(), [progress]);
    assert.strictEqual(session.isCompleteObs.get(), true);
  });
  test("progress completion updates session state correctly", async function() {
    const sessionContent = createSessionContent();
    const session = disposables.add(await createInitializedSession(sessionContent));
    const progress = { kind: "progressMessage", content: { value: "Processing...", isTrusted: false } };
    session.handleProgressChunk("req1", [progress]);
    assert.strictEqual(session.isCompleteObs.get(), true);
    session.handleProgressComplete("req1");
    assert.strictEqual(session.isCompleteObs.get(), true);
  });
  test("session with active response callback becomes active when progress is added", async function() {
    const sessionContent = createSessionContent({ hasActiveResponseCallback: true });
    const session = disposables.add(await createInitializedSession(sessionContent));
    assert.strictEqual(session.isCompleteObs.get(), false);
    const progress = { kind: "progressMessage", content: { value: "Processing...", isTrusted: false } };
    session.handleProgressChunk("req1", [progress]);
    assert.strictEqual(session.isCompleteObs.get(), false);
    session.handleProgressComplete("req1");
    assert.strictEqual(session.isCompleteObs.get(), true);
  });
  test("request handler forwards requests to proxy", async function() {
    const sessionContent = createSessionContent({ hasRequestHandler: true });
    const session = disposables.add(await createInitializedSession(sessionContent));
    assert.ok(session.requestHandler);
    const request = {
      requestId: "req1",
      sessionResource: LocalChatSessionUri.forSession("test-session"),
      agentId: "test-agent",
      message: "Test prompt",
      location: ChatAgentLocation.Chat,
      variables: { variables: [] }
    };
    const progressCallback = sinon.stub();
    await session.requestHandler(request, progressCallback, [], CancellationToken.None);
    assert.ok(asSinonMethodStub(proxy.$invokeChatSessionRequestHandler).calledOnceWith(1, session.sessionResource, request, [], CancellationToken.None));
  });
  test("request handler forwards progress updates to external callback", async function() {
    const sessionContent = createSessionContent({ hasRequestHandler: true });
    const session = disposables.add(await createInitializedSession(sessionContent));
    assert.ok(session.requestHandler);
    const request = {
      requestId: "req1",
      sessionResource: LocalChatSessionUri.forSession("test-session"),
      agentId: "test-agent",
      message: "Test prompt",
      location: ChatAgentLocation.Chat,
      variables: { variables: [] }
    };
    const progressCallback = sinon.stub();
    let resolveRequest;
    const requestPromise = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    asSinonMethodStub(proxy.$invokeChatSessionRequestHandler).returns(requestPromise);
    const requestHandlerPromise = session.requestHandler(request, progressCallback, [], CancellationToken.None);
    const progress1 = { kind: "progressMessage", content: { value: "Progress 1", isTrusted: false } };
    const progress2 = { kind: "progressMessage", content: { value: "Progress 2", isTrusted: false } };
    session.handleProgressChunk("req1", [progress1]);
    session.handleProgressChunk("req1", [progress2]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(progressCallback.calledTwice);
    assert.deepStrictEqual(progressCallback.firstCall.args[0], [progress1]);
    assert.deepStrictEqual(progressCallback.secondCall.args[0], [progress2]);
    resolveRequest({});
    await requestHandlerPromise;
    assert.strictEqual(session.isCompleteObs.get(), true);
  });
  test("dispose properly cleans up resources and notifies listeners", function() {
    const sessionId = "test-id";
    const resource = LocalChatSessionUri.forSession(sessionId);
    const session = disposables.add(new ObservableChatSession(resource, 1, proxy, logService, dialogService));
    let disposeEventFired = false;
    const disposable = session.onWillDispose(() => {
      disposeEventFired = true;
    });
    session.dispose();
    assert.ok(disposeEventFired);
    assert.ok(asSinonMethodStub(proxy.$disposeChatSessionContent).calledOnceWith(1, resource));
    disposable.dispose();
  });
  test("session with multiple request/response pairs in history", async function() {
    const sessionHistory = [
      { type: "request", prompt: "First question" },
      { type: "response", parts: [{ kind: "progressMessage", content: { value: "First answer", isTrusted: false } }] },
      { type: "request", prompt: "Second question" },
      { type: "response", parts: [{ kind: "progressMessage", content: { value: "Second answer", isTrusted: false } }] }
    ];
    const sessionContent = createSessionContent({
      history: sessionHistory,
      hasActiveResponseCallback: false,
      hasRequestHandler: false
    });
    const session = disposables.add(await createInitializedSession(sessionContent));
    assert.strictEqual(session.history.length, 4);
    assert.strictEqual(session.history[0].type, "request");
    assert.strictEqual(session.history[0].prompt, "First question");
    assert.strictEqual(session.history[1].type, "response");
    assert.strictEqual(session.history[1].parts[0].content.value, "First answer");
    assert.strictEqual(session.history[2].type, "request");
    assert.strictEqual(session.history[2].prompt, "Second question");
    assert.strictEqual(session.history[3].type, "response");
    assert.strictEqual(session.history[3].parts[0].content.value, "Second answer");
    assert.strictEqual(session.isCompleteObs.get(), true);
  });
});
suite("MainThreadChatSessions", function() {
  let instantiationService;
  let mainThread;
  let proxy;
  let chatSessionsService;
  let disposables;
  setup(function() {
    disposables = new DisposableStore();
    instantiationService = new TestInstantiationService();
    proxy = {
      $provideChatSessionContent: sinon.stub(),
      $provideChatSessionProviderOptions: sinon.stub().resolves(void 0),
      $provideHandleOptionsChange: sinon.stub(),
      $interruptChatSessionActiveResponse: sinon.stub(),
      $invokeChatSessionRequestHandler: sinon.stub(),
      $disposeChatSessionContent: sinon.stub(),
      $refreshChatSessionItems: sinon.stub(),
      $onDidChangeChatSessionItemState: sinon.stub(),
      $newChatSessionItem: sinon.stub().resolves(void 0),
      $forkChatSession: sinon.stub().resolves(void 0),
      $resolveChatSessionItem: sinon.stub().resolves(void 0),
      $provideChatSessionInputState: sinon.stub().resolves(void 0)
    };
    const extHostContext = new class {
      constructor() {
        this.remoteAuthority = "";
        this.extensionHostKind = ExtensionHostKind.LocalProcess;
      }
      dispose() {
      }
      assertRegistered() {
      }
      set(v) {
        return null;
      }
      getProxy() {
        return proxy;
      }
      drain() {
        return null;
      }
    }();
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    instantiationService.stub(IContextKeyService, disposables.add(instantiationService.createInstance(ContextKeyService)));
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IEditorService, new class extends mock() {
    }());
    instantiationService.stub(IExtensionService, new TestExtensionService());
    instantiationService.stub(IViewsService, new class extends mock() {
      async openView() {
        return null;
      }
    }());
    instantiationService.stub(IDialogService, new class extends mock() {
      async confirm() {
        return { confirmed: true };
      }
    }());
    instantiationService.stub(ILabelService, new class extends mock() {
      registerFormatter() {
        return {
          dispose: () => {
          }
        };
      }
    }());
    instantiationService.stub(IChatService, new MockChatService());
    instantiationService.stub(IAgentSessionsService, new class extends mock() {
      get model() {
        return new class extends mock() {
          constructor() {
            super(...arguments);
            this.onDidChangeSessionArchivedState = Event.None;
          }
        }();
      }
    }());
    chatSessionsService = disposables.add(instantiationService.createInstance(ChatSessionsService));
    instantiationService.stub(IChatSessionsService, chatSessionsService);
    mainThread = disposables.add(instantiationService.createInstance(MainThreadChatSessions, extHostContext));
  });
  teardown(function() {
    disposables.dispose();
    instantiationService.dispose();
    sinon.restore();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("provideChatSessionContent creates and initializes session", async function() {
    const sessionScheme = "test-session-type";
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resource = URI.parse(`${sessionScheme}:/test-session`);
    const sessionContent = {
      resource,
      history: [],
      hasActiveResponseCallback: false,
      hasRequestHandler: false,
      hasForkHandler: false,
      supportsInterruption: false
    };
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    const session1 = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    assert.ok(session1);
    const session2 = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    assert.strictEqual(session1, session2);
    assert.ok(asSinonMethodStub(proxy.$provideChatSessionContent).calledOnce);
    mainThread.$unregisterChatSessionContentProvider(1);
  });
  test("provideChatSessionContent propagates title", async function() {
    const sessionScheme = "test-session-type";
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resource = URI.parse(`${sessionScheme}:/test-session`);
    const sessionContent = {
      resource,
      title: "My Session Title",
      history: [],
      hasActiveResponseCallback: false,
      hasRequestHandler: false,
      hasForkHandler: false,
      supportsInterruption: false
    };
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    const session = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    assert.strictEqual(session.title, "My Session Title");
    mainThread.$unregisterChatSessionContentProvider(1);
  });
  test("$handleProgressChunk routes to correct session", async function() {
    const sessionScheme = "test-session-type";
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resource = URI.parse(`${sessionScheme}:/test-session`);
    const sessionContent = {
      resource,
      history: [],
      hasActiveResponseCallback: false,
      hasRequestHandler: false,
      hasForkHandler: false,
      supportsInterruption: false
    };
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    const session = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    const progressDto = { kind: "progressMessage", content: { value: "Test", isTrusted: false } };
    await mainThread.$handleProgressChunk(1, resource, "req1", [progressDto]);
    assert.strictEqual(session.progressObs.get().length, 1);
    assert.strictEqual(session.progressObs.get()[0].kind, "progressMessage");
    mainThread.$unregisterChatSessionContentProvider(1);
  });
  test("$handleProgressComplete marks session complete", async function() {
    const sessionScheme = "test-session-type";
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resource = URI.parse(`${sessionScheme}:/test-session`);
    const sessionContent = {
      resource,
      history: [],
      hasActiveResponseCallback: false,
      hasRequestHandler: false,
      hasForkHandler: false,
      supportsInterruption: false
    };
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    const session = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    const progressDto = { kind: "progressMessage", content: { value: "Test", isTrusted: false } };
    await mainThread.$handleProgressChunk(1, resource, "req1", [progressDto]);
    mainThread.$handleProgressComplete(1, resource, "req1");
    assert.strictEqual(session.isCompleteObs.get(), true);
    mainThread.$unregisterChatSessionContentProvider(1);
  });
  test("integration with multiple request/response pairs", async function() {
    const sessionScheme = "test-session-type";
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resource = URI.parse(`${sessionScheme}:/multi-turn-session`);
    const sessionContent = {
      resource,
      history: [
        { type: "request", prompt: "First question", participant: "test-participant" },
        { type: "response", parts: [{ kind: "progressMessage", content: { value: "First answer", isTrusted: false } }], participant: "test-participant" },
        { type: "request", prompt: "Second question", participant: "test-participant" },
        { type: "response", parts: [{ kind: "progressMessage", content: { value: "Second answer", isTrusted: false } }], participant: "test-participant" }
      ],
      hasActiveResponseCallback: false,
      hasRequestHandler: false,
      hasForkHandler: false,
      supportsInterruption: false
    };
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    const session = await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    assert.ok(session);
    assert.strictEqual(session.history.length, 4);
    assert.strictEqual(session.history[0].type, "request");
    assert.strictEqual(session.history[0].prompt, "First question");
    assert.strictEqual(session.history[1].type, "response");
    assert.strictEqual(session.history[2].type, "request");
    assert.strictEqual(session.history[2].prompt, "Second question");
    assert.strictEqual(session.history[3].type, "response");
    assert.strictEqual(session.isCompleteObs.get(), true);
    mainThread.$unregisterChatSessionContentProvider(1);
  });
  test("$onDidChangeChatSessionProviderOptions refreshes option groups", async function() {
    const sessionScheme = "test-session-type";
    const handle = 1;
    const optionGroups1 = [{
      id: "models",
      name: "Models",
      items: [{ id: "modelA", name: "Model A" }]
    }];
    const optionGroups2 = [{
      id: "models",
      name: "Models",
      items: [{ id: "modelB", name: "Model B" }]
    }];
    const provideOptionsStub = asSinonMethodStub(proxy.$provideChatSessionProviderOptions);
    provideOptionsStub.onFirstCall().resolves({ optionGroups: optionGroups1 });
    provideOptionsStub.onSecondCall().resolves({ optionGroups: optionGroups2 });
    mainThread.$registerChatSessionContentProvider(handle, sessionScheme);
    await new Promise((resolve) => setTimeout(resolve, 0));
    let storedGroups = chatSessionsService.getOptionGroupsForSessionType(sessionScheme);
    assert.ok(storedGroups);
    assert.strictEqual(storedGroups[0].items[0].id, "modelA");
    mainThread.$onDidChangeChatSessionProviderOptions(handle);
    await new Promise((resolve) => setTimeout(resolve, 0));
    storedGroups = chatSessionsService.getOptionGroupsForSessionType(sessionScheme);
    assert.ok(storedGroups);
    assert.strictEqual(storedGroups[0].items[0].id, "modelB");
    mainThread.$unregisterChatSessionContentProvider(handle);
  });
  test("getSessionOption returns undefined for unset options", async function() {
    const sessionScheme = "test-session-type";
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resource = URI.parse(`${sessionScheme}:/test-session`);
    const sessionContent = {
      resource,
      history: [],
      hasActiveResponseCallback: false,
      hasRequestHandler: false,
      hasForkHandler: false,
      supportsInterruption: false
    };
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    assert.strictEqual(chatSessionsService.getSessionOption(resource, "models"), void 0);
    assert.strictEqual(chatSessionsService.getSessionOption(resource, "anyOption"), void 0);
    mainThread.$unregisterChatSessionContentProvider(1);
  });
  test("getSessionOption returns value for explicitly set options", async function() {
    const sessionScheme = "test-session-type";
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resource = URI.parse(`${sessionScheme}:/test-session`);
    const sessionContent = {
      resource,
      history: [],
      hasActiveResponseCallback: false,
      hasRequestHandler: false,
      hasForkHandler: false,
      supportsInterruption: false,
      options: {
        "models": "gpt-4",
        "region": { id: "us-east", name: "US East" }
      }
    };
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    assert.strictEqual(chatSessionsService.getSessionOption(resource, "models"), "gpt-4");
    assert.deepStrictEqual(chatSessionsService.getSessionOption(resource, "region"), { id: "us-east", name: "US East" });
    assert.strictEqual(chatSessionsService.getSessionOption(resource, "notConfigured"), void 0);
    mainThread.$unregisterChatSessionContentProvider(1);
  });
  test("option change notifications are sent to the extension", async function() {
    const sessionScheme = "test-session-type";
    const handle = 1;
    mainThread.$registerChatSessionContentProvider(handle, sessionScheme);
    const sessionContent = {
      resource: URI.parse(`${sessionScheme}:/test-session`),
      history: [],
      hasActiveResponseCallback: false,
      hasRequestHandler: false,
      hasForkHandler: false,
      supportsInterruption: false,
      options: {
        "models": "gpt-4"
      }
    };
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    const resource = URI.parse(`${sessionScheme}:/test-session`);
    await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    asSinonMethodStub(proxy.$provideHandleOptionsChange).resetHistory();
    chatSessionsService.setSessionOption(resource, "models", "gpt-4-turbo");
    assert.ok(asSinonMethodStub(proxy.$provideHandleOptionsChange).calledOnce);
    const call = asSinonMethodStub(proxy.$provideHandleOptionsChange).firstCall;
    assert.strictEqual(call.args[0], handle);
    assert.deepStrictEqual(call.args[1], resource);
    assert.deepStrictEqual(call.args[2], { models: "gpt-4-turbo" });
    mainThread.$unregisterChatSessionContentProvider(handle);
  });
  test("option change notifications fail silently when provider not registered", async function() {
    const sessionScheme = "unregistered-session-type";
    const resource = URI.parse(`${sessionScheme}:/test-session`);
    asSinonMethodStub(proxy.$provideHandleOptionsChange).resetHistory();
    chatSessionsService.updateSessionOptions(resource, /* @__PURE__ */ new Map([
      ["models", "gpt-4-turbo"]
    ]));
    assert.strictEqual(asSinonMethodStub(proxy.$provideHandleOptionsChange).callCount, 0);
  });
  test("setSessionOption updates option and getSessionOption reflects change", async function() {
    const sessionScheme = "test-session-type";
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resource = URI.parse(`${sessionScheme}:/test-session`);
    const sessionContent = {
      resource,
      history: [],
      hasActiveResponseCallback: false,
      hasRequestHandler: false,
      hasForkHandler: false,
      supportsInterruption: false
    };
    asSinonMethodStub(proxy.$provideChatSessionContent).resolves(sessionContent);
    await chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    assert.strictEqual(chatSessionsService.getSessionOption(resource, "models"), void 0);
    chatSessionsService.setSessionOption(resource, "models", "gpt-4");
    assert.strictEqual(chatSessionsService.getSessionOption(resource, "models"), "gpt-4");
    mainThread.$unregisterChatSessionContentProvider(1);
  });
  test("$updateChatSessionInputState applies selected options only to the targeted session", async function() {
    const sessionScheme = "test-session-type";
    const controllerHandle = 0;
    mainThread.$registerChatSessionItemController(controllerHandle, sessionScheme, false);
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resourceA = URI.parse(`${sessionScheme}:/session-a`);
    const resourceB = URI.parse(`${sessionScheme}:/session-b`);
    asSinonMethodStub(proxy.$provideChatSessionContent).withArgs(sinon.match.any, sinon.match((r) => r.toString() === resourceA.toString()), sinon.match.any, sinon.match.any).resolves({ resource: resourceA, history: [], hasActiveResponseCallback: false, hasRequestHandler: false, hasForkHandler: false, supportsInterruption: false });
    asSinonMethodStub(proxy.$provideChatSessionContent).withArgs(sinon.match.any, sinon.match((r) => r.toString() === resourceB.toString()), sinon.match.any, sinon.match.any).resolves({ resource: resourceB, history: [], hasActiveResponseCallback: false, hasRequestHandler: false, hasForkHandler: false, supportsInterruption: false });
    await chatSessionsService.getOrCreateChatSession(resourceA, CancellationToken.None);
    await chatSessionsService.getOrCreateChatSession(resourceB, CancellationToken.None);
    mainThread.$updateChatSessionInputState(controllerHandle, resourceA, [{
      id: "models",
      name: "Models",
      items: [{ id: "modelA", name: "Model A" }, { id: "modelB", name: "Model B" }],
      selected: { id: "modelB", name: "Model B" }
    }]);
    assert.deepStrictEqual(chatSessionsService.getSessionOption(resourceA, "models"), { id: "modelB", name: "Model B" });
    assert.strictEqual(chatSessionsService.getSessionOption(resourceB, "models"), void 0);
    mainThread.$unregisterChatSessionContentProvider(1);
    mainThread.$unregisterChatSessionItemController(controllerHandle);
  });
  test("$updateChatSessionInputState updates different sessions independently", async function() {
    const sessionScheme = "test-session-type";
    const controllerHandle = 0;
    mainThread.$registerChatSessionItemController(controllerHandle, sessionScheme, false);
    mainThread.$registerChatSessionContentProvider(1, sessionScheme);
    const resourceA = URI.parse(`${sessionScheme}:/session-a`);
    const resourceB = URI.parse(`${sessionScheme}:/session-b`);
    asSinonMethodStub(proxy.$provideChatSessionContent).withArgs(sinon.match.any, sinon.match((r) => r.toString() === resourceA.toString()), sinon.match.any, sinon.match.any).resolves({ resource: resourceA, history: [], hasActiveResponseCallback: false, hasRequestHandler: false, hasForkHandler: false, supportsInterruption: false });
    asSinonMethodStub(proxy.$provideChatSessionContent).withArgs(sinon.match.any, sinon.match((r) => r.toString() === resourceB.toString()), sinon.match.any, sinon.match.any).resolves({ resource: resourceB, history: [], hasActiveResponseCallback: false, hasRequestHandler: false, hasForkHandler: false, supportsInterruption: false });
    await chatSessionsService.getOrCreateChatSession(resourceA, CancellationToken.None);
    await chatSessionsService.getOrCreateChatSession(resourceB, CancellationToken.None);
    mainThread.$updateChatSessionInputState(controllerHandle, resourceA, [{
      id: "models",
      name: "Models",
      items: [{ id: "modelX", name: "Model X" }, { id: "modelY", name: "Model Y" }],
      selected: { id: "modelX", name: "Model X" }
    }]);
    mainThread.$updateChatSessionInputState(controllerHandle, resourceB, [{
      id: "models",
      name: "Models",
      items: [{ id: "modelX", name: "Model X" }, { id: "modelY", name: "Model Y" }],
      selected: { id: "modelY", name: "Model Y" }
    }]);
    assert.deepStrictEqual(chatSessionsService.getSessionOption(resourceA, "models"), { id: "modelX", name: "Model X" });
    assert.deepStrictEqual(chatSessionsService.getSessionOption(resourceB, "models"), { id: "modelY", name: "Model Y" });
    mainThread.$unregisterChatSessionContentProvider(1);
    mainThread.$unregisterChatSessionItemController(controllerHandle);
  });
  test("resolveChatSessionItem invokes proxy and updates item", async function() {
    const sessionScheme = "test-session-type";
    const controllerHandle = 0;
    mainThread.$registerChatSessionItemController(controllerHandle, sessionScheme, true);
    const resource = URI.parse(`${sessionScheme}:/session-a`);
    const initialItem = {
      resource,
      label: "Session A",
      timing: { created: 0, lastRequestStarted: void 0, lastRequestEnded: void 0 }
    };
    await mainThread.$addOrUpdateChatSessionItem(controllerHandle, initialItem);
    const resolvedItem = {
      resource,
      label: "Session A",
      timing: { created: 0, lastRequestStarted: void 0, lastRequestEnded: void 0 },
      badge: "resolved"
    };
    asSinonMethodStub(proxy.$resolveChatSessionItem).resolves(resolvedItem);
    const result = await chatSessionsService.resolveChatSessionItem(sessionScheme, resource, CancellationToken.None);
    assert.ok(asSinonMethodStub(proxy.$resolveChatSessionItem).calledOnce);
    assert.deepStrictEqual(result?.badge, "resolved");
    mainThread.$unregisterChatSessionItemController(controllerHandle);
  });
  test("resolveChatSessionItem returns undefined when supportsResolve is false", async function() {
    const sessionScheme = "test-session-type";
    const controllerHandle = 0;
    mainThread.$registerChatSessionItemController(controllerHandle, sessionScheme, false);
    const resource = URI.parse(`${sessionScheme}:/session-a`);
    const result = await chatSessionsService.resolveChatSessionItem(sessionScheme, resource, CancellationToken.None);
    assert.strictEqual(result, void 0);
    assert.ok(asSinonMethodStub(proxy.$resolveChatSessionItem).notCalled);
    mainThread.$unregisterChatSessionItemController(controllerHandle);
  });
  test("resolveChatSessionItem cache is invalidated on item update", async function() {
    const sessionScheme = "test-session-type";
    const controllerHandle = 0;
    mainThread.$registerChatSessionItemController(controllerHandle, sessionScheme, true);
    const resource = URI.parse(`${sessionScheme}:/session-a`);
    const timing = { created: 0, lastRequestStarted: void 0, lastRequestEnded: void 0 };
    const initialItem = {
      resource,
      label: "Session A",
      timing
    };
    await mainThread.$addOrUpdateChatSessionItem(controllerHandle, initialItem);
    const resolvedItem1 = { resource, label: "Session A", timing, badge: "first" };
    const resolvedItem2 = { resource, label: "Session A", timing, badge: "second" };
    const resolveStub = asSinonMethodStub(proxy.$resolveChatSessionItem);
    resolveStub.onFirstCall().resolves(resolvedItem1);
    resolveStub.onSecondCall().resolves(resolvedItem2);
    const result1 = await chatSessionsService.resolveChatSessionItem(sessionScheme, resource, CancellationToken.None);
    assert.deepStrictEqual(result1?.badge, "first");
    await mainThread.$addOrUpdateChatSessionItem(controllerHandle, { ...initialItem, label: "Session A Updated" });
    const result2 = await chatSessionsService.resolveChatSessionItem(sessionScheme, resource, CancellationToken.None);
    assert.deepStrictEqual(result2?.badge, "second");
    assert.strictEqual(resolveStub.callCount, 2);
    mainThread.$unregisterChatSessionItemController(controllerHandle);
  });
  test("resolveChatSessionItem caches undefined result until item update invalidates it", async function() {
    const sessionScheme = "test-session-type";
    const controllerHandle = 0;
    mainThread.$registerChatSessionItemController(controllerHandle, sessionScheme, true);
    const resource = URI.parse(`${sessionScheme}:/session-a`);
    const timing = { created: 0, lastRequestStarted: void 0, lastRequestEnded: void 0 };
    const initialItem = {
      resource,
      label: "Session A",
      timing
    };
    const resolveStub = asSinonMethodStub(proxy.$resolveChatSessionItem);
    resolveStub.onFirstCall().resolves(void 0);
    resolveStub.onSecondCall().resolves({ resource, label: "Session A", timing, badge: "resolved" });
    const result1 = await chatSessionsService.resolveChatSessionItem(sessionScheme, resource, CancellationToken.None);
    assert.strictEqual(result1, void 0);
    const result2 = await chatSessionsService.resolveChatSessionItem(sessionScheme, resource, CancellationToken.None);
    assert.strictEqual(result2, void 0);
    assert.strictEqual(resolveStub.callCount, 1);
    await mainThread.$addOrUpdateChatSessionItem(controllerHandle, initialItem);
    const result3 = await chatSessionsService.resolveChatSessionItem(sessionScheme, resource, CancellationToken.None);
    assert.deepStrictEqual(result3?.badge, "resolved");
    assert.strictEqual(resolveStub.callCount, 2);
    mainThread.$unregisterChatSessionItemController(controllerHandle);
  });
  test("resolveChatSessionItem ignores stale in-flight resolve result after item update", async function() {
    const sessionScheme = "test-session-type";
    const controllerHandle = 0;
    mainThread.$registerChatSessionItemController(controllerHandle, sessionScheme, true);
    const resource = URI.parse(`${sessionScheme}:/session-a`);
    const timing = { created: 0, lastRequestStarted: void 0, lastRequestEnded: void 0 };
    const initialItem = {
      resource,
      label: "Session A",
      timing
    };
    await mainThread.$addOrUpdateChatSessionItem(controllerHandle, initialItem);
    let resolvePending;
    asSinonMethodStub(proxy.$resolveChatSessionItem).returns(new Promise((resolve) => {
      resolvePending = resolve;
    }));
    const pendingResolve = chatSessionsService.resolveChatSessionItem(sessionScheme, resource, CancellationToken.None);
    await mainThread.$addOrUpdateChatSessionItem(controllerHandle, {
      ...initialItem,
      label: "Session A Updated"
    });
    resolvePending?.({
      resource,
      label: "Session A",
      timing,
      badge: "stale"
    });
    const result = await pendingResolve;
    assert.strictEqual(result?.label, "Session A Updated");
    assert.strictEqual(result?.badge, void 0);
    mainThread.$unregisterChatSessionItemController(controllerHandle);
  });
});
suite("ExtHostChatSessions", function() {
  let disposables;
  let extHostChatSessions;
  let mainThreadChatSessionsProxy;
  setup(function() {
    disposables = new DisposableStore();
    mainThreadChatSessionsProxy = {
      $registerChatSessionItemController: sinon.stub(),
      $updateChatSessionItemControllerCapabilities: sinon.stub(),
      $unregisterChatSessionItemController: sinon.stub(),
      $updateChatSessionItems: sinon.stub().resolves(),
      $addOrUpdateChatSessionItem: sinon.stub().resolves(),
      $onDidCommitChatSessionItem: sinon.stub(),
      $registerChatSessionContentProvider: sinon.stub(),
      $unregisterChatSessionContentProvider: sinon.stub(),
      $onDidChangeChatSessionOptions: sinon.stub(),
      $onDidChangeChatSessionProviderOptions: sinon.stub(),
      $updateChatSessionInputState: sinon.stub()
    };
    const rpcProtocol = AnyCallRPCProtocol(mainThreadChatSessionsProxy);
    const commands = new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock() {
    }());
    const languageModels = new ExtHostLanguageModels(rpcProtocol, new NullLogService(), new class extends mock() {
    }());
    extHostChatSessions = disposables.add(new ExtHostChatSessions(commands, languageModels, rpcProtocol, new NullLogService()));
  });
  teardown(function() {
    disposables.dispose();
    sinon.restore();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createContentProvider(session) {
    return {
      provideChatSessionContent: async () => session
    };
  }
  test("controller only advertises resolve support after resolve handler is assigned", function() {
    const sessionScheme = "test-session-type";
    const controller = disposables.add(extHostChatSessions.createChatSessionItemController(nullExtensionDescription, sessionScheme, async () => {
    }));
    assert.ok(mainThreadChatSessionsProxy.$registerChatSessionItemController.calledOnceWithExactly(0, sessionScheme, false));
    assert.ok(mainThreadChatSessionsProxy.$updateChatSessionItemControllerCapabilities.notCalled);
    controller.resolveChatSessionItem = async () => {
    };
    assert.ok(mainThreadChatSessionsProxy.$updateChatSessionItemControllerCapabilities.calledOnceWithExactly(0, true));
    controller.resolveChatSessionItem = void 0;
    assert.ok(mainThreadChatSessionsProxy.$updateChatSessionItemControllerCapabilities.calledTwice);
    assert.ok(mainThreadChatSessionsProxy.$updateChatSessionItemControllerCapabilities.secondCall.calledWithExactly(0, false));
  });
  test("advertises controller fork support when only the controller registers a fork handler", async function() {
    const sessionScheme = "test-session-type";
    const sessionResource = URI.parse(`${sessionScheme}:/test-session`);
    const controller = disposables.add(extHostChatSessions.createChatSessionItemController(nullExtensionDescription, sessionScheme, async () => {
    }));
    controller.forkHandler = async (resource) => controller.createChatSessionItem(resource.with({ path: "/forked-session" }), "Forked Session");
    disposables.add(extHostChatSessions.registerChatSessionContentProvider(nullExtensionDescription, sessionScheme, void 0, createContentProvider({
      history: [],
      requestHandler: void 0
    })));
    const session = await extHostChatSessions.$provideChatSessionContent(0, sessionResource, { initialSessionOptions: [] }, CancellationToken.None);
    assert.strictEqual(session.hasForkHandler, true);
    await extHostChatSessions.$disposeChatSessionContent(0, sessionResource);
  });
  test("prefers controller fork handler over deprecated session fork handler", async function() {
    const sessionScheme = "test-session-type";
    const sessionResource = URI.parse(`${sessionScheme}:/test-session`);
    const requestTurn = new extHostTypes.ChatRequestTurn("prompt", void 0, [], "participant", [], void 0, "request-1");
    const controller = disposables.add(extHostChatSessions.createChatSessionItemController(nullExtensionDescription, sessionScheme, async () => {
    }));
    const controllerItem = controller.createChatSessionItem(URI.parse(`${sessionScheme}:/forked-by-controller`), "Forked by Controller");
    const sessionItem = {
      resource: URI.parse(`${sessionScheme}:/forked-by-session`),
      label: "Forked by Session"
    };
    const controllerForkHandler = sinon.stub().resolves(controllerItem);
    const deprecatedSessionForkHandler = sinon.stub().resolves(sessionItem);
    controller.forkHandler = controllerForkHandler;
    disposables.add(extHostChatSessions.registerChatSessionContentProvider(nullExtensionDescription, sessionScheme, void 0, createContentProvider({
      history: [requestTurn],
      requestHandler: void 0,
      forkHandler: deprecatedSessionForkHandler
    })));
    await extHostChatSessions.$provideChatSessionContent(0, sessionResource, { initialSessionOptions: [] }, CancellationToken.None);
    const result = await extHostChatSessions.$forkChatSession(0, sessionResource, {
      type: "request",
      id: "request-1",
      prompt: "prompt",
      participant: "participant"
    }, CancellationToken.None);
    assert.ok(controllerForkHandler.calledOnceWithExactly(sessionResource, requestTurn, CancellationToken.None));
    assert.strictEqual(deprecatedSessionForkHandler.callCount, 0);
    assert.strictEqual(result.resource.toString(), controllerItem.resource.toString());
    assert.strictEqual(result.label, controllerItem.label);
    await extHostChatSessions.$disposeChatSessionContent(0, sessionResource);
  });
  test("falls back to deprecated session fork handler when no controller fork handler exists", async function() {
    const sessionScheme = "test-session-type";
    const sessionResource = URI.parse(`${sessionScheme}:/test-session`);
    const requestTurn = new extHostTypes.ChatRequestTurn("prompt", void 0, [], "participant", [], void 0, "request-1");
    const deprecatedSessionForkHandler = sinon.stub().resolves({
      resource: URI.parse(`${sessionScheme}:/forked-by-session`),
      label: "Forked by Session"
    });
    disposables.add(extHostChatSessions.registerChatSessionContentProvider(nullExtensionDescription, sessionScheme, void 0, createContentProvider({
      history: [requestTurn],
      requestHandler: void 0,
      forkHandler: deprecatedSessionForkHandler
    })));
    await extHostChatSessions.$provideChatSessionContent(0, sessionResource, { initialSessionOptions: [] }, CancellationToken.None);
    const result = await extHostChatSessions.$forkChatSession(0, sessionResource, {
      type: "request",
      id: "request-1",
      prompt: "prompt",
      participant: "participant"
    }, CancellationToken.None);
    assert.ok(deprecatedSessionForkHandler.calledOnceWithExactly(sessionResource, requestTurn, CancellationToken.None));
    assert.strictEqual(result.resource.toString(), `${sessionScheme}:/forked-by-session`);
    assert.strictEqual(result.label, "Forked by Session");
    await extHostChatSessions.$disposeChatSessionContent(0, sessionResource);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL21haW5UaHJlYWRDaGF0U2Vzc2lvbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIHNpbm9uIGZyb20gJ3Npbm9uJztcbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgYXNTaW5vbk1ldGhvZFN0dWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3Npbm9uVXRpbHMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9icm93c2VyL2NvbnRleHRLZXlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc01vZGVsLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRTZXNzaW9ucy9jaGF0U2Vzc2lvbnMuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0UHJvZ3Jlc3MsIElDaGF0UHJvZ3Jlc3NNZXNzYWdlLCBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXAsIElDaGF0U2Vzc2lvbkl0ZW0sIElDaGF0U2Vzc2lvblJlcXVlc3RIaXN0b3J5SXRlbSwgSUNoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBMb2NhbENoYXRTZXNzaW9uVXJpIH0gZnJvbSAnLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnRSZXF1ZXN0LCBJQ2hhdEFnZW50UmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb250cmliL2NoYXQvdGVzdC9jb21tb24vY2hhdFNlcnZpY2UvbW9ja0NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSG9zdEtpbmQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25Ib3N0S2luZC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSwgbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEdG8gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9wcm94eUlkZW50aWZpZXIuanMnO1xuaW1wb3J0IHsgbW9jaywgVGVzdEV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZENoYXRTZXNzaW9ucywgT2JzZXJ2YWJsZUNoYXRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tYWluVGhyZWFkQ2hhdFNlc3Npb25zLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDaGF0U2Vzc2lvbnNTaGFwZSwgSUNoYXRQcm9ncmVzc0R0bywgSUNoYXRTZXNzaW9uRHRvLCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbnMsIElDaGF0U2Vzc2lvblJlcXVlc3RIaXN0b3J5SXRlbUR0byB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IElFeHRIb3N0QXV0aGVudGljYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDaGF0U2Vzc2lvbnMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdENoYXRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29tbWFuZHMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdENvbW1hbmRzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RMYW5ndWFnZU1vZGVscyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0TGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RUZWxlbWV0cnkgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgKiBhcyBleHRIb3N0VHlwZXMgZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBBbnlDYWxsUlBDUHJvdG9jb2wgfSBmcm9tICcuLi9jb21tb24vdGVzdFJQQ1Byb3RvY29sLmpzJztcblxuc3VpdGUoJ09ic2VydmFibGVDaGF0U2Vzc2lvbicsIGZ1bmN0aW9uICgpIHtcblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxldCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZTtcblx0bGV0IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlO1xuXHRsZXQgcHJveHk6IEV4dEhvc3RDaGF0U2Vzc2lvbnNTaGFwZTtcblxuXHRzZXR1cChmdW5jdGlvbiAoKSB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXG5cdFx0ZGlhbG9nU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SURpYWxvZ1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY29uZmlybSgpIHtcblx0XHRcdFx0cmV0dXJuIHsgY29uZmlybWVkOiB0cnVlIH07XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHByb3h5ID0ge1xuXHRcdFx0JHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQ6IHNpbm9uLnN0dWIoKSxcblx0XHRcdCRwcm92aWRlQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbnM6IHNpbm9uLnN0dWI8W3Byb3ZpZGVySGFuZGxlOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbl0sIFByb21pc2U8SUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25zIHwgdW5kZWZpbmVkPj4oKS5yZXNvbHZlcyh1bmRlZmluZWQpLFxuXHRcdFx0JHByb3ZpZGVIYW5kbGVPcHRpb25zQ2hhbmdlOiBzaW5vbi5zdHViKCksXG5cdFx0XHQkaW50ZXJydXB0Q2hhdFNlc3Npb25BY3RpdmVSZXNwb25zZTogc2lub24uc3R1YigpLFxuXHRcdFx0JGludm9rZUNoYXRTZXNzaW9uUmVxdWVzdEhhbmRsZXI6IHNpbm9uLnN0dWIoKSxcblx0XHRcdCRkaXNwb3NlQ2hhdFNlc3Npb25Db250ZW50OiBzaW5vbi5zdHViKCksXG5cdFx0XHQkcmVmcmVzaENoYXRTZXNzaW9uSXRlbXM6IHNpbm9uLnN0dWIoKSxcblx0XHRcdCRvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbVN0YXRlOiBzaW5vbi5zdHViKCksXG5cdFx0XHQkbmV3Q2hhdFNlc3Npb25JdGVtOiBzaW5vbi5zdHViKCkucmVzb2x2ZXModW5kZWZpbmVkKSxcblx0XHRcdCRmb3JrQ2hhdFNlc3Npb246IHNpbm9uLnN0dWIoKS5yZXNvbHZlcyh1bmRlZmluZWQpLFxuXHRcdFx0JHJlc29sdmVDaGF0U2Vzc2lvbkl0ZW06IHNpbm9uLnN0dWIoKS5yZXNvbHZlcyh1bmRlZmluZWQpLFxuXHRcdFx0JHByb3ZpZGVDaGF0U2Vzc2lvbklucHV0U3RhdGU6IHNpbm9uLnN0dWIoKS5yZXNvbHZlcyh1bmRlZmluZWQpLFxuXHRcdH07XG5cdH0pO1xuXG5cdHRlYXJkb3duKGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0c2lub24ucmVzdG9yZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTZXNzaW9uQ29udGVudChvcHRpb25zOiB7XG5cdFx0aWQ/OiBzdHJpbmc7XG5cdFx0dGl0bGU/OiBzdHJpbmc7XG5cdFx0aGlzdG9yeT86IGFueVtdO1xuXHRcdGhhc0FjdGl2ZVJlc3BvbnNlQ2FsbGJhY2s/OiBib29sZWFuO1xuXHRcdGhhc1JlcXVlc3RIYW5kbGVyPzogYm9vbGVhbjtcblx0XHRoYXNGb3JrSGFuZGxlcj86IGJvb2xlYW47XG5cdH0gPSB7fSk6IElDaGF0U2Vzc2lvbkR0byB7XG5cdFx0Y29uc3QgaWQgPSBvcHRpb25zLmlkIHx8ICd0ZXN0LWlkJztcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2U6IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbihpZCksXG5cdFx0XHR0aXRsZTogb3B0aW9ucy50aXRsZSxcblx0XHRcdGhpc3Rvcnk6IG9wdGlvbnMuaGlzdG9yeSB8fCBbXSxcblx0XHRcdGhhc0FjdGl2ZVJlc3BvbnNlQ2FsbGJhY2s6IG9wdGlvbnMuaGFzQWN0aXZlUmVzcG9uc2VDYWxsYmFjayA/PyBmYWxzZSxcblx0XHRcdGhhc1JlcXVlc3RIYW5kbGVyOiBvcHRpb25zLmhhc1JlcXVlc3RIYW5kbGVyID8/IGZhbHNlLFxuXHRcdFx0aGFzRm9ya0hhbmRsZXI6IG9wdGlvbnMuaGFzRm9ya0hhbmRsZXIgPz8gZmFsc2UsXG5cdFx0XHRzdXBwb3J0c0ludGVycnVwdGlvbjogZmFsc2UsXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUluaXRpYWxpemVkU2Vzc2lvbihzZXNzaW9uQ29udGVudDogYW55LCBzZXNzaW9uSWQgPSAndGVzdC1pZCcpOiBQcm9taXNlPE9ic2VydmFibGVDaGF0U2Vzc2lvbj4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBPYnNlcnZhYmxlQ2hhdFNlc3Npb24ocmVzb3VyY2UsIDEsIHByb3h5LCBsb2dTZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlKTtcblx0XHRhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudCkucmVzb2x2ZXMoc2Vzc2lvbkNvbnRlbnQpO1xuXHRcdGF3YWl0IHNlc3Npb24uaW5pdGlhbGl6ZShDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCB7IGluaXRpYWxTZXNzaW9uT3B0aW9uczogW10gfSk7XG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHR0ZXN0KCdjb25zdHJ1Y3RvciBjcmVhdGVzIHNlc3Npb24gd2l0aCBwcm9wZXIgaW5pdGlhbCBzdGF0ZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1pZCc7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRjb25zdCBzZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBPYnNlcnZhYmxlQ2hhdFNlc3Npb24ocmVzb3VyY2UsIDEsIHByb3h5LCBsb2dTZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5wcm92aWRlckhhbmRsZSwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uLmhpc3RvcnksIFtdKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbi5wcm9ncmVzc09icyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24uaXNDb21wbGV0ZU9icyk7XG5cblx0XHQvLyBJbml0aWFsIHN0YXRlIHNob3VsZCBiZSBpbmFjdGl2ZSBhbmQgaW5jb21wbGV0ZVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbi5wcm9ncmVzc09icy5nZXQoKSwgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQ29tcGxldGVPYnMuZ2V0KCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvbiBxdWV1ZXMgcHJvZ3Jlc3MgYmVmb3JlIGluaXRpYWxpemF0aW9uIGFuZCBwcm9jZXNzZXMgaXQgYWZ0ZXInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Rlc3QtaWQnO1xuXHRcdGNvbnN0IHJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgT2JzZXJ2YWJsZUNoYXRTZXNzaW9uKHJlc291cmNlLCAxLCBwcm94eSwgbG9nU2VydmljZSwgZGlhbG9nU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgcHJvZ3Jlc3MxOiBJQ2hhdFByb2dyZXNzID0geyBraW5kOiAncHJvZ3Jlc3NNZXNzYWdlJywgY29udGVudDogeyB2YWx1ZTogJ0hlbGxvJywgaXNUcnVzdGVkOiBmYWxzZSB9IH07XG5cdFx0Y29uc3QgcHJvZ3Jlc3MyOiBJQ2hhdFByb2dyZXNzID0geyBraW5kOiAncHJvZ3Jlc3NNZXNzYWdlJywgY29udGVudDogeyB2YWx1ZTogJ1dvcmxkJywgaXNUcnVzdGVkOiBmYWxzZSB9IH07XG5cblx0XHQvLyBBZGQgcHJvZ3Jlc3MgYmVmb3JlIGluaXRpYWxpemF0aW9uIC0gc2hvdWxkIGJlIHF1ZXVlZFxuXHRcdHNlc3Npb24uaGFuZGxlUHJvZ3Jlc3NDaHVuaygncmVxMScsIFtwcm9ncmVzczFdKTtcblx0XHRzZXNzaW9uLmhhbmRsZVByb2dyZXNzQ2h1bmsoJ3JlcTEnLCBbcHJvZ3Jlc3MyXSk7XG5cblx0XHQvLyBQcm9ncmVzcyBzaG91bGQgYmUgcXVldWVkLCBub3QgdmlzaWJsZSB5ZXRcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb24ucHJvZ3Jlc3NPYnMuZ2V0KCksIFtdKTtcblxuXHRcdC8vIEluaXRpYWxpemUgdGhlIHNlc3Npb25cblx0XHRjb25zdCBzZXNzaW9uQ29udGVudCA9IGNyZWF0ZVNlc3Npb25Db250ZW50KCk7XG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQpLnJlc29sdmVzKHNlc3Npb25Db250ZW50KTtcblx0XHRhd2FpdCBzZXNzaW9uLmluaXRpYWxpemUoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgeyBpbml0aWFsU2Vzc2lvbk9wdGlvbnM6IFtdIH0pO1xuXG5cdFx0Ly8gTm93IHByb2dyZXNzIHNob3VsZCBiZSB2aXNpYmxlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24ucHJvZ3Jlc3NPYnMuZ2V0KCkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb24ucHJvZ3Jlc3NPYnMuZ2V0KCksIFtwcm9ncmVzczEsIHByb2dyZXNzMl0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQ29tcGxldGVPYnMuZ2V0KCksIHRydWUpOyAvLyBTaG91bGQgYmUgY29tcGxldGUgZm9yIHNlc3Npb25zIHdpdGhvdXQgYWN0aXZlIHJlc3BvbnNlIGNhbGxiYWNrIG9yIHJlcXVlc3QgaGFuZGxlclxuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXphdGlvbiBsb2FkcyBzZXNzaW9uIGhpc3RvcnkgYW5kIHNldHMgdXAgY2FwYWJpbGl0aWVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25IaXN0b3J5ID0gW1xuXHRcdFx0eyB0eXBlOiAncmVxdWVzdCcsIHByb21wdDogJ1ByZXZpb3VzIHF1ZXN0aW9uJyB9LFxuXHRcdFx0eyB0eXBlOiAncmVzcG9uc2UnLCBwYXJ0czogW3sga2luZDogJ3Byb2dyZXNzTWVzc2FnZScsIGNvbnRlbnQ6IHsgdmFsdWU6ICdQcmV2aW91cyBhbnN3ZXInLCBpc1RydXN0ZWQ6IGZhbHNlIH0gfV0gfVxuXHRcdF07XG5cblx0XHRjb25zdCBzZXNzaW9uQ29udGVudCA9IGNyZWF0ZVNlc3Npb25Db250ZW50KHtcblx0XHRcdGhpc3Rvcnk6IHNlc3Npb25IaXN0b3J5LFxuXHRcdFx0aGFzQWN0aXZlUmVzcG9uc2VDYWxsYmFjazogdHJ1ZSxcblx0XHRcdGhhc1JlcXVlc3RIYW5kbGVyOiB0cnVlXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGNyZWF0ZUluaXRpYWxpemVkU2Vzc2lvbihzZXNzaW9uQ29udGVudCkpO1xuXG5cdFx0Ly8gVmVyaWZ5IGhpc3Rvcnkgd2FzIGxvYWRlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmhpc3RvcnkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5oaXN0b3J5WzBdLnR5cGUsICdyZXF1ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaGlzdG9yeVswXS5wcm9tcHQsICdQcmV2aW91cyBxdWVzdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmhpc3RvcnlbMV0udHlwZSwgJ3Jlc3BvbnNlJyk7XG5cblx0XHQvLyBWZXJpZnkgY2FwYWJpbGl0aWVzIHdlcmUgc2V0IHVwXG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24uaW50ZXJydXB0QWN0aXZlUmVzcG9uc2VDYWxsYmFjayk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24ucmVxdWVzdEhhbmRsZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXphdGlvbiByZXZpdmVzIG1vZGVJbnN0cnVjdGlvbnMgaW4gaGlzdG9yeScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uQ29udGVudCA9IGNyZWF0ZVNlc3Npb25Db250ZW50KHtcblx0XHRcdGhpc3Rvcnk6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdyZXF1ZXN0Jyxcblx0XHRcdFx0XHRwcm9tcHQ6ICdIZWxsbycsXG5cdFx0XHRcdFx0cGFydGljaXBhbnQ6ICd0ZXN0Jyxcblx0XHRcdFx0XHRtb2RlSW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0XHR1cmk6IHsgJG1pZDogTWFyc2hhbGxlZElkLlVyaSwgc2NoZW1lOiAnZmlsZScsIHBhdGg6ICcvY3VzdG9tLWFnZW50JyB9LFxuXHRcdFx0XHRcdFx0bmFtZTogJ215LWFnZW50Jyxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6ICdpbnN0cnVjdGlvbnMnLFxuXHRcdFx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFtdLFxuXHRcdFx0XHRcdFx0aXNCdWlsdGluOiBmYWxzZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgY3JlYXRlSW5pdGlhbGl6ZWRTZXNzaW9uKHNlc3Npb25Db250ZW50KSk7XG5cdFx0Y29uc3QgcmVxdWVzdEl0ZW0gPSBzZXNzaW9uLmhpc3RvcnlbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3RJdGVtLnR5cGUsICdyZXF1ZXN0Jyk7XG5cdFx0aWYgKHJlcXVlc3RJdGVtLnR5cGUgPT09ICdyZXF1ZXN0Jykge1xuXHRcdFx0YXNzZXJ0Lm9rKHJlcXVlc3RJdGVtLm1vZGVJbnN0cnVjdGlvbnMpO1xuXHRcdFx0YXNzZXJ0Lm9rKFVSSS5pc1VyaShyZXF1ZXN0SXRlbS5tb2RlSW5zdHJ1Y3Rpb25zLnVyaSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3RJdGVtLm1vZGVJbnN0cnVjdGlvbnMubmFtZSwgJ215LWFnZW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdEl0ZW0ubW9kZUluc3RydWN0aW9ucy5pc0J1aWx0aW4sIGZhbHNlKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3RvUmVxdWVzdER0byBwYXNzZXMgbW9kZUluc3RydWN0aW9ucyB0aHJvdWdoJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgY3JlYXRlSW5pdGlhbGl6ZWRTZXNzaW9uKGNyZWF0ZVNlc3Npb25Db250ZW50KHsgaGFzRm9ya0hhbmRsZXI6IHRydWUgfSkpKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbi5mb3JrU2Vzc2lvbik7XG5cblx0XHRjb25zdCBtb2RlSW5zdHJ1Y3Rpb25zID0ge1xuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vY3VzdG9tLWFnZW50JyksXG5cdFx0XHRuYW1lOiAnbXktYWdlbnQnLFxuXHRcdFx0Y29udGVudDogJ2FnZW50IGluc3RydWN0aW9ucycsXG5cdFx0XHR0b29sUmVmZXJlbmNlczogW10sXG5cdFx0XHRpc0J1aWx0aW46IGZhbHNlLFxuXHRcdH07XG5cdFx0Y29uc3QgcmVxdWVzdDogSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtID0ge1xuXHRcdFx0dHlwZTogJ3JlcXVlc3QnLFxuXHRcdFx0aWQ6ICdyZXEtMScsXG5cdFx0XHRwcm9tcHQ6ICdIZWxsbyB3aXRoIG1vZGUnLFxuXHRcdFx0cGFydGljaXBhbnQ6ICdwYXJ0aWNpcGFudCcsXG5cdFx0XHRtb2RlSW5zdHJ1Y3Rpb25zLFxuXHRcdH07XG5cblx0XHRjb25zdCBmb3JrZWRJdGVtID0ge1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5maWxlKCcvdG1wL2ZvcmtlZC5tZCcpLFxuXHRcdFx0bGFiZWw6ICdGb3JrZWQnLFxuXHRcdFx0Y2hhbmdlczogW10sXG5cdFx0XHR0aW1pbmc6IHtcblx0XHRcdFx0Y3JlYXRlZDogMTIzLFxuXHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IDIzNCxcblx0XHRcdFx0bGFzdFJlcXVlc3RFbmRlZDogMzQ1LFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGFzU2lub25NZXRob2RTdHViKHByb3h5LiRmb3JrQ2hhdFNlc3Npb24pLnJlc29sdmVzKGZvcmtlZEl0ZW0pO1xuXHRcdGF3YWl0IHNlc3Npb24uZm9ya1Nlc3Npb24/LihyZXF1ZXN0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGNvbnN0IGNhbGwgPSBhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kZm9ya0NoYXRTZXNzaW9uKS5maXJzdENhbGw7XG5cdFx0Y29uc3Qgc2VudER0byA9IGNhbGwuYXJnc1syXSBhcyBJQ2hhdFNlc3Npb25SZXF1ZXN0SGlzdG9yeUl0ZW1EdG87XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZW50RHRvLm1vZGVJbnN0cnVjdGlvbnMsIG1vZGVJbnN0cnVjdGlvbnMpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXphdGlvbiBzZXRzIGZvcmtTZXNzaW9uIGFuZCByZXZpdmVzIGZvcmtlZCBpdGVtcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGNyZWF0ZUluaXRpYWxpemVkU2Vzc2lvbihjcmVhdGVTZXNzaW9uQ29udGVudCh7IGhhc0ZvcmtIYW5kbGVyOiB0cnVlIH0pKSk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24uZm9ya1Nlc3Npb24pO1xuXG5cdFx0Y29uc3QgZm9ya2VkUmVzb3VyY2UgPSBVUkkuZmlsZSgnL3RtcC9mb3JrZWQtY2hhdC5tZCcpO1xuXHRcdGNvbnN0IGZvcmtlZEl0ZW0gPSB7XG5cdFx0XHRyZXNvdXJjZTogZm9ya2VkUmVzb3VyY2UsXG5cdFx0XHRsYWJlbDogJ0ZvcmtlZCBTZXNzaW9uJyxcblx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRjcmVhdGVkOiAxMjMsXG5cdFx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZDogMjM0LFxuXHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiAzNDUsXG5cdFx0XHR9LFxuXHRcdFx0Y2hhbmdlczogW3tcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL3RtcC9jaGFuZ2VkLnRzJyksXG5cdFx0XHRcdG9yaWdpbmFsVXJpOiBVUkkuZmlsZSgnL3RtcC9vcmlnaW5hbC50cycpLFxuXHRcdFx0XHRpbnNlcnRpb25zOiA0LFxuXHRcdFx0XHRkZWxldGlvbnM6IDIsXG5cdFx0XHR9XSxcblx0XHR9O1xuXHRcdGFzU2lub25NZXRob2RTdHViKHByb3h5LiRmb3JrQ2hhdFNlc3Npb24pLnJlc29sdmVzKGZvcmtlZEl0ZW0pO1xuXG5cdFx0Y29uc3QgcmVxdWVzdDogSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtID0geyB0eXBlOiAncmVxdWVzdCcsIGlkOiAncmVxdWVzdC0xJywgcHJvbXB0OiAnUHJldmlvdXMgcXVlc3Rpb24nLCBwYXJ0aWNpcGFudDogJ3BhcnRpY2lwYW50JyB9O1xuXHRcdGNvbnN0IGV4cGVjdGVkUmVxdWVzdER0bzogSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtRHRvID0ge1xuXHRcdFx0dHlwZTogJ3JlcXVlc3QnLFxuXHRcdFx0aWQ6ICdyZXF1ZXN0LTEnLFxuXHRcdFx0cHJvbXB0OiAnUHJldmlvdXMgcXVlc3Rpb24nLFxuXHRcdFx0cGFydGljaXBhbnQ6ICdwYXJ0aWNpcGFudCcsXG5cdFx0XHRjb21tYW5kOiB1bmRlZmluZWQsXG5cdFx0XHR2YXJpYWJsZURhdGE6IHVuZGVmaW5lZCxcblx0XHRcdG1vZGVsSWQ6IHVuZGVmaW5lZCxcblx0XHRcdG1vZGVJbnN0cnVjdGlvbnM6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlc3Npb24uZm9ya1Nlc3Npb24/LihyZXF1ZXN0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5vayhhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kZm9ya0NoYXRTZXNzaW9uKS5jYWxsZWRPbmNlV2l0aEV4YWN0bHkoMSwgc2Vzc2lvbi5zZXNzaW9uUmVzb3VyY2UsIGV4cGVjdGVkUmVxdWVzdER0bywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQucmVzb3VyY2UgaW5zdGFuY2VvZiBVUkkpO1xuXHRcdGFzc2VydC5vayhBcnJheS5pc0FycmF5KHJlc3VsdC5jaGFuZ2VzKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5jaGFuZ2VzWzBdLnVyaSBpbnN0YW5jZW9mIFVSSSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5jaGFuZ2VzWzBdLm9yaWdpbmFsVXJpIGluc3RhbmNlb2YgVVJJKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgZm9ya2VkSXRlbSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemF0aW9uIHNldHMgdGl0bGUgZnJvbSBzZXNzaW9uIGNvbnRlbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNvbnRlbnQgPSBjcmVhdGVTZXNzaW9uQ29udGVudCh7XG5cdFx0XHR0aXRsZTogJ015IEN1c3RvbSBUaXRsZScsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGNyZWF0ZUluaXRpYWxpemVkU2Vzc2lvbihzZXNzaW9uQ29udGVudCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLnRpdGxlLCAnTXkgQ3VzdG9tIFRpdGxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RpdGxlIGlzIHVuZGVmaW5lZCB3aGVuIG5vdCBwcm92aWRlZCBpbiBzZXNzaW9uIGNvbnRlbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNvbnRlbnQgPSBjcmVhdGVTZXNzaW9uQ29udGVudCgpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBjcmVhdGVJbml0aWFsaXplZFNlc3Npb24oc2Vzc2lvbkNvbnRlbnQpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi50aXRsZSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnaW5pdGlhbGl6YXRpb24gaXMgaWRlbXBvdGVudCBhbmQgcmV0dXJucyBzYW1lIHByb21pc2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Rlc3QtaWQnO1xuXHRcdGNvbnN0IHJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgT2JzZXJ2YWJsZUNoYXRTZXNzaW9uKHJlc291cmNlLCAxLCBwcm94eSwgbG9nU2VydmljZSwgZGlhbG9nU2VydmljZSkpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbkNvbnRlbnQgPSBjcmVhdGVTZXNzaW9uQ29udGVudCgpO1xuXHRcdGFzU2lub25NZXRob2RTdHViKHByb3h5LiRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KS5yZXNvbHZlcyhzZXNzaW9uQ29udGVudCk7XG5cblx0XHRjb25zdCBwcm9taXNlMSA9IHNlc3Npb24uaW5pdGlhbGl6ZShDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCB7IGluaXRpYWxTZXNzaW9uT3B0aW9uczogW10gfSk7XG5cdFx0Y29uc3QgcHJvbWlzZTIgPSBzZXNzaW9uLmluaXRpYWxpemUoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgeyBpbml0aWFsU2Vzc2lvbk9wdGlvbnM6IFtdIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb21pc2UxLCBwcm9taXNlMik7XG5cdFx0YXdhaXQgcHJvbWlzZTE7XG5cblx0XHQvLyBTaG91bGQgb25seSBjYWxsIHByb3h5IG9uY2UgZXZlbiB0aG91Z2ggaW5pdGlhbGl6ZSB3YXMgY2FsbGVkIHR3aWNlXG5cdFx0YXNzZXJ0Lm9rKGFzU2lub25NZXRob2RTdHViKHByb3h5LiRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KS5jYWxsZWRPbmNlKTtcblx0fSk7XG5cblx0dGVzdCgnaW5pdGlhbGl6YXRpb24gZm9yd2FyZHMgaW5pdGlhbCBzZXNzaW9uIG9wdGlvbnMgY29udGV4dCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1pZCc7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRjb25zdCBzZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBPYnNlcnZhYmxlQ2hhdFNlc3Npb24ocmVzb3VyY2UsIDEsIHByb3h5LCBsb2dTZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgaW5pdGlhbFNlc3Npb25PcHRpb25zID0gW3sgb3B0aW9uSWQ6ICdtb2RlbCcsIHZhbHVlOiAnZ3B0LTQuMScgfV07XG5cblx0XHRjb25zdCBzZXNzaW9uQ29udGVudCA9IGNyZWF0ZVNlc3Npb25Db250ZW50KCk7XG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQpLnJlc29sdmVzKHNlc3Npb25Db250ZW50KTtcblxuXHRcdGF3YWl0IHNlc3Npb24uaW5pdGlhbGl6ZShDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCB7IGluaXRpYWxTZXNzaW9uT3B0aW9ucyB9KTtcblxuXHRcdGFzc2VydC5vayhhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudCkuY2FsbGVkT25jZVdpdGgoXG5cdFx0XHQxLFxuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHR7IGluaXRpYWxTZXNzaW9uT3B0aW9ucyB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9ncmVzcyBoYW5kbGluZyB3b3JrcyBjb3JyZWN0bHkgYWZ0ZXIgaW5pdGlhbGl6YXRpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNvbnRlbnQgPSBjcmVhdGVTZXNzaW9uQ29udGVudCgpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgY3JlYXRlSW5pdGlhbGl6ZWRTZXNzaW9uKHNlc3Npb25Db250ZW50KSk7XG5cblx0XHRjb25zdCBwcm9ncmVzczogSUNoYXRQcm9ncmVzcyA9IHsga2luZDogJ3Byb2dyZXNzTWVzc2FnZScsIGNvbnRlbnQ6IHsgdmFsdWU6ICdOZXcgcHJvZ3Jlc3MnLCBpc1RydXN0ZWQ6IGZhbHNlIH0gfTtcblxuXHRcdC8vIEFkZCBwcm9ncmVzcyBhZnRlciBpbml0aWFsaXphdGlvblxuXHRcdHNlc3Npb24uaGFuZGxlUHJvZ3Jlc3NDaHVuaygncmVxMScsIFtwcm9ncmVzc10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uLnByb2dyZXNzT2JzLmdldCgpLCBbcHJvZ3Jlc3NdKTtcblx0XHQvLyBTZXNzaW9uIHdpdGggbm8gY2FwYWJpbGl0aWVzIHNob3VsZCByZW1haW4gY29tcGxldGVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0NvbXBsZXRlT2JzLmdldCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncHJvZ3Jlc3MgY29tcGxldGlvbiB1cGRhdGVzIHNlc3Npb24gc3RhdGUgY29ycmVjdGx5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25Db250ZW50ID0gY3JlYXRlU2Vzc2lvbkNvbnRlbnQoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGNyZWF0ZUluaXRpYWxpemVkU2Vzc2lvbihzZXNzaW9uQ29udGVudCkpO1xuXG5cdFx0Ly8gQWRkIHNvbWUgcHJvZ3Jlc3MgZmlyc3Rcblx0XHRjb25zdCBwcm9ncmVzczogSUNoYXRQcm9ncmVzcyA9IHsga2luZDogJ3Byb2dyZXNzTWVzc2FnZScsIGNvbnRlbnQ6IHsgdmFsdWU6ICdQcm9jZXNzaW5nLi4uJywgaXNUcnVzdGVkOiBmYWxzZSB9IH07XG5cdFx0c2Vzc2lvbi5oYW5kbGVQcm9ncmVzc0NodW5rKCdyZXExJywgW3Byb2dyZXNzXSk7XG5cblx0XHQvLyBTZXNzaW9uIHdpdGggbm8gY2FwYWJpbGl0aWVzIHNob3VsZCBhbHJlYWR5IGJlIGNvbXBsZXRlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNDb21wbGV0ZU9icy5nZXQoKSwgdHJ1ZSk7XG5cdFx0c2Vzc2lvbi5oYW5kbGVQcm9ncmVzc0NvbXBsZXRlKCdyZXExJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNDb21wbGV0ZU9icy5nZXQoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb24gd2l0aCBhY3RpdmUgcmVzcG9uc2UgY2FsbGJhY2sgYmVjb21lcyBhY3RpdmUgd2hlbiBwcm9ncmVzcyBpcyBhZGRlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uQ29udGVudCA9IGNyZWF0ZVNlc3Npb25Db250ZW50KHsgaGFzQWN0aXZlUmVzcG9uc2VDYWxsYmFjazogdHJ1ZSB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGNyZWF0ZUluaXRpYWxpemVkU2Vzc2lvbihzZXNzaW9uQ29udGVudCkpO1xuXG5cdFx0Ly8gU2Vzc2lvbiBzaG91bGQgc3RhcnQgaW5hY3RpdmUgYW5kIGluY29tcGxldGUgKGhhcyBjYXBhYmlsaXRpZXMgYnV0IG5vIGFjdGl2ZSBwcm9ncmVzcylcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0NvbXBsZXRlT2JzLmdldCgpLCBmYWxzZSk7XG5cblx0XHRjb25zdCBwcm9ncmVzczogSUNoYXRQcm9ncmVzcyA9IHsga2luZDogJ3Byb2dyZXNzTWVzc2FnZScsIGNvbnRlbnQ6IHsgdmFsdWU6ICdQcm9jZXNzaW5nLi4uJywgaXNUcnVzdGVkOiBmYWxzZSB9IH07XG5cdFx0c2Vzc2lvbi5oYW5kbGVQcm9ncmVzc0NodW5rKCdyZXExJywgW3Byb2dyZXNzXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0NvbXBsZXRlT2JzLmdldCgpLCBmYWxzZSk7XG5cdFx0c2Vzc2lvbi5oYW5kbGVQcm9ncmVzc0NvbXBsZXRlKCdyZXExJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0NvbXBsZXRlT2JzLmdldCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVxdWVzdCBoYW5kbGVyIGZvcndhcmRzIHJlcXVlc3RzIHRvIHByb3h5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25Db250ZW50ID0gY3JlYXRlU2Vzc2lvbkNvbnRlbnQoeyBoYXNSZXF1ZXN0SGFuZGxlcjogdHJ1ZSB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGNyZWF0ZUluaXRpYWxpemVkU2Vzc2lvbihzZXNzaW9uQ29udGVudCkpO1xuXG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24ucmVxdWVzdEhhbmRsZXIpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QgPSB7XG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKCd0ZXN0LXNlc3Npb24nKSxcblx0XHRcdGFnZW50SWQ6ICd0ZXN0LWFnZW50Jyxcblx0XHRcdG1lc3NhZ2U6ICdUZXN0IHByb21wdCcsXG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHZhcmlhYmxlczogeyB2YXJpYWJsZXM6IFtdIH1cblx0XHR9O1xuXHRcdGNvbnN0IHByb2dyZXNzQ2FsbGJhY2sgPSBzaW5vbi5zdHViKCk7XG5cblx0XHRhd2FpdCBzZXNzaW9uLnJlcXVlc3RIYW5kbGVyIShyZXF1ZXN0LCBwcm9ncmVzc0NhbGxiYWNrLCBbXSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQub2soYXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJGludm9rZUNoYXRTZXNzaW9uUmVxdWVzdEhhbmRsZXIpLmNhbGxlZE9uY2VXaXRoKDEsIHNlc3Npb24uc2Vzc2lvblJlc291cmNlLCByZXF1ZXN0LCBbXSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXF1ZXN0IGhhbmRsZXIgZm9yd2FyZHMgcHJvZ3Jlc3MgdXBkYXRlcyB0byBleHRlcm5hbCBjYWxsYmFjaycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uQ29udGVudCA9IGNyZWF0ZVNlc3Npb25Db250ZW50KHsgaGFzUmVxdWVzdEhhbmRsZXI6IHRydWUgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBjcmVhdGVJbml0aWFsaXplZFNlc3Npb24oc2Vzc2lvbkNvbnRlbnQpKTtcblxuXHRcdGFzc2VydC5vayhzZXNzaW9uLnJlcXVlc3RIYW5kbGVyKTtcblxuXHRcdGNvbnN0IHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0ID0ge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxMScsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbigndGVzdC1zZXNzaW9uJyksXG5cdFx0XHRhZ2VudElkOiAndGVzdC1hZ2VudCcsXG5cdFx0XHRtZXNzYWdlOiAnVGVzdCBwcm9tcHQnLFxuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHR2YXJpYWJsZXM6IHsgdmFyaWFibGVzOiBbXSB9XG5cdFx0fTtcblx0XHRjb25zdCBwcm9ncmVzc0NhbGxiYWNrID0gc2lub24uc3R1YigpO1xuXG5cdFx0bGV0IHJlc29sdmVSZXF1ZXN0OiAodmFsdWU6IElDaGF0QWdlbnRSZXN1bHQpID0+IHZvaWQ7XG5cdFx0Y29uc3QgcmVxdWVzdFByb21pc2UgPSBuZXcgUHJvbWlzZTxJQ2hhdEFnZW50UmVzdWx0PihyZXNvbHZlID0+IHtcblx0XHRcdHJlc29sdmVSZXF1ZXN0ID0gcmVzb2x2ZTtcblx0XHR9KTtcblxuXHRcdGFzU2lub25NZXRob2RTdHViKHByb3h5LiRpbnZva2VDaGF0U2Vzc2lvblJlcXVlc3RIYW5kbGVyKS5yZXR1cm5zKHJlcXVlc3RQcm9taXNlKTtcblxuXHRcdGNvbnN0IHJlcXVlc3RIYW5kbGVyUHJvbWlzZSA9IHNlc3Npb24ucmVxdWVzdEhhbmRsZXIhKHJlcXVlc3QsIHByb2dyZXNzQ2FsbGJhY2ssIFtdLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGNvbnN0IHByb2dyZXNzMTogSUNoYXRQcm9ncmVzcyA9IHsga2luZDogJ3Byb2dyZXNzTWVzc2FnZScsIGNvbnRlbnQ6IHsgdmFsdWU6ICdQcm9ncmVzcyAxJywgaXNUcnVzdGVkOiBmYWxzZSB9IH07XG5cdFx0Y29uc3QgcHJvZ3Jlc3MyOiBJQ2hhdFByb2dyZXNzID0geyBraW5kOiAncHJvZ3Jlc3NNZXNzYWdlJywgY29udGVudDogeyB2YWx1ZTogJ1Byb2dyZXNzIDInLCBpc1RydXN0ZWQ6IGZhbHNlIH0gfTtcblxuXHRcdHNlc3Npb24uaGFuZGxlUHJvZ3Jlc3NDaHVuaygncmVxMScsIFtwcm9ncmVzczFdKTtcblx0XHRzZXNzaW9uLmhhbmRsZVByb2dyZXNzQ2h1bmsoJ3JlcTEnLCBbcHJvZ3Jlc3MyXSk7XG5cblx0XHQvLyBXYWl0IGEgYml0IGZvciBhdXRvcnVuIHRvIHRyaWdnZXJcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0YXNzZXJ0Lm9rKHByb2dyZXNzQ2FsbGJhY2suY2FsbGVkVHdpY2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvZ3Jlc3NDYWxsYmFjay5maXJzdENhbGwuYXJnc1swXSwgW3Byb2dyZXNzMV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvZ3Jlc3NDYWxsYmFjay5zZWNvbmRDYWxsLmFyZ3NbMF0sIFtwcm9ncmVzczJdKTtcblxuXHRcdC8vIENvbXBsZXRlIHRoZSByZXF1ZXN0XG5cdFx0cmVzb2x2ZVJlcXVlc3QhKHt9KTtcblx0XHRhd2FpdCByZXF1ZXN0SGFuZGxlclByb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pc0NvbXBsZXRlT2JzLmdldCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZSBwcm9wZXJseSBjbGVhbnMgdXAgcmVzb3VyY2VzIGFuZCBub3RpZmllcyBsaXN0ZW5lcnMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Rlc3QtaWQnO1xuXHRcdGNvbnN0IHJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgT2JzZXJ2YWJsZUNoYXRTZXNzaW9uKHJlc291cmNlLCAxLCBwcm94eSwgbG9nU2VydmljZSwgZGlhbG9nU2VydmljZSkpO1xuXG5cdFx0bGV0IGRpc3Bvc2VFdmVudEZpcmVkID0gZmFsc2U7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHNlc3Npb24ub25XaWxsRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRkaXNwb3NlRXZlbnRGaXJlZCA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHRzZXNzaW9uLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5vayhkaXNwb3NlRXZlbnRGaXJlZCk7XG5cdFx0YXNzZXJ0Lm9rKGFzU2lub25NZXRob2RTdHViKHByb3h5LiRkaXNwb3NlQ2hhdFNlc3Npb25Db250ZW50KS5jYWxsZWRPbmNlV2l0aCgxLCByZXNvdXJjZSkpO1xuXG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb24gd2l0aCBtdWx0aXBsZSByZXF1ZXN0L3Jlc3BvbnNlIHBhaXJzIGluIGhpc3RvcnknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkhpc3RvcnkgPSBbXG5cdFx0XHR7IHR5cGU6ICdyZXF1ZXN0JywgcHJvbXB0OiAnRmlyc3QgcXVlc3Rpb24nIH0sXG5cdFx0XHR7IHR5cGU6ICdyZXNwb25zZScsIHBhcnRzOiBbeyBraW5kOiAncHJvZ3Jlc3NNZXNzYWdlJywgY29udGVudDogeyB2YWx1ZTogJ0ZpcnN0IGFuc3dlcicsIGlzVHJ1c3RlZDogZmFsc2UgfSB9XSB9LFxuXHRcdFx0eyB0eXBlOiAncmVxdWVzdCcsIHByb21wdDogJ1NlY29uZCBxdWVzdGlvbicgfSxcblx0XHRcdHsgdHlwZTogJ3Jlc3BvbnNlJywgcGFydHM6IFt7IGtpbmQ6ICdwcm9ncmVzc01lc3NhZ2UnLCBjb250ZW50OiB7IHZhbHVlOiAnU2Vjb25kIGFuc3dlcicsIGlzVHJ1c3RlZDogZmFsc2UgfSB9XSB9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHNlc3Npb25Db250ZW50ID0gY3JlYXRlU2Vzc2lvbkNvbnRlbnQoe1xuXHRcdFx0aGlzdG9yeTogc2Vzc2lvbkhpc3RvcnksXG5cdFx0XHRoYXNBY3RpdmVSZXNwb25zZUNhbGxiYWNrOiBmYWxzZSxcblx0XHRcdGhhc1JlcXVlc3RIYW5kbGVyOiBmYWxzZVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBjcmVhdGVJbml0aWFsaXplZFNlc3Npb24oc2Vzc2lvbkNvbnRlbnQpKTtcblxuXHRcdC8vIFZlcmlmeSBhbGwgaGlzdG9yeSB3YXMgbG9hZGVkIGNvcnJlY3RseVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmhpc3RvcnkubGVuZ3RoLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5oaXN0b3J5WzBdLnR5cGUsICdyZXF1ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaGlzdG9yeVswXS5wcm9tcHQsICdGaXJzdCBxdWVzdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmhpc3RvcnlbMV0udHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChzZXNzaW9uLmhpc3RvcnlbMV0ucGFydHNbMF0gYXMgSUNoYXRQcm9ncmVzc01lc3NhZ2UpLmNvbnRlbnQudmFsdWUsICdGaXJzdCBhbnN3ZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5oaXN0b3J5WzJdLnR5cGUsICdyZXF1ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaGlzdG9yeVsyXS5wcm9tcHQsICdTZWNvbmQgcXVlc3Rpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5oaXN0b3J5WzNdLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoc2Vzc2lvbi5oaXN0b3J5WzNdLnBhcnRzWzBdIGFzIElDaGF0UHJvZ3Jlc3NNZXNzYWdlKS5jb250ZW50LnZhbHVlLCAnU2Vjb25kIGFuc3dlcicpO1xuXG5cdFx0Ly8gU2Vzc2lvbiBzaG91bGQgYmUgY29tcGxldGUgc2luY2UgaXQgaGFzIG5vIGNhcGFiaWxpdGllc1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQ29tcGxldGVPYnMuZ2V0KCksIHRydWUpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnTWFpblRocmVhZENoYXRTZXNzaW9ucycsIGZ1bmN0aW9uICgpIHtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBtYWluVGhyZWFkOiBNYWluVGhyZWFkQ2hhdFNlc3Npb25zO1xuXHRsZXQgcHJveHk6IEV4dEhvc3RDaGF0U2Vzc2lvbnNTaGFwZTtcblx0bGV0IGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlO1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblxuXHRzZXR1cChmdW5jdGlvbiAoKSB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCk7XG5cblx0XHRwcm94eSA9IHtcblx0XHRcdCRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50OiBzaW5vbi5zdHViKCksXG5cdFx0XHQkcHJvdmlkZUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25zOiBzaW5vbi5zdHViPFtwcm92aWRlckhhbmRsZTogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW5dLCBQcm9taXNlPElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9ucyB8IHVuZGVmaW5lZD4+KCkucmVzb2x2ZXModW5kZWZpbmVkKSxcblx0XHRcdCRwcm92aWRlSGFuZGxlT3B0aW9uc0NoYW5nZTogc2lub24uc3R1YigpLFxuXHRcdFx0JGludGVycnVwdENoYXRTZXNzaW9uQWN0aXZlUmVzcG9uc2U6IHNpbm9uLnN0dWIoKSxcblx0XHRcdCRpbnZva2VDaGF0U2Vzc2lvblJlcXVlc3RIYW5kbGVyOiBzaW5vbi5zdHViKCksXG5cdFx0XHQkZGlzcG9zZUNoYXRTZXNzaW9uQ29udGVudDogc2lub24uc3R1YigpLFxuXHRcdFx0JHJlZnJlc2hDaGF0U2Vzc2lvbkl0ZW1zOiBzaW5vbi5zdHViKCksXG5cdFx0XHQkb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1TdGF0ZTogc2lub24uc3R1YigpLFxuXHRcdFx0JG5ld0NoYXRTZXNzaW9uSXRlbTogc2lub24uc3R1YigpLnJlc29sdmVzKHVuZGVmaW5lZCksXG5cdFx0XHQkZm9ya0NoYXRTZXNzaW9uOiBzaW5vbi5zdHViKCkucmVzb2x2ZXModW5kZWZpbmVkKSxcblx0XHRcdCRyZXNvbHZlQ2hhdFNlc3Npb25JdGVtOiBzaW5vbi5zdHViKCkucmVzb2x2ZXModW5kZWZpbmVkKSxcblx0XHRcdCRwcm92aWRlQ2hhdFNlc3Npb25JbnB1dFN0YXRlOiBzaW5vbi5zdHViKCkucmVzb2x2ZXModW5kZWZpbmVkKSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgZXh0SG9zdENvbnRleHQgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJRXh0SG9zdENvbnRleHQge1xuXHRcdFx0cmVtb3RlQXV0aG9yaXR5ID0gJyc7XG5cdFx0XHRleHRlbnNpb25Ib3N0S2luZCA9IEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsUHJvY2Vzcztcblx0XHRcdGRpc3Bvc2UoKSB7IH1cblx0XHRcdGFzc2VydFJlZ2lzdGVyZWQoKSB7IH1cblx0XHRcdHNldCh2OiBhbnkpOiBhbnkgeyByZXR1cm4gbnVsbDsgfVxuXHRcdFx0Z2V0UHJveHkoKTogYW55IHsgcmV0dXJuIHByb3h5OyB9XG5cdFx0XHRkcmFpbigpOiBhbnkgeyByZXR1cm4gbnVsbDsgfVxuXHRcdH07XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0S2V5U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbnRleHRLZXlTZXJ2aWNlKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JTZXJ2aWNlPigpIHsgfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uU2VydmljZSwgbmV3IFRlc3RFeHRlbnNpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVZpZXdzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVmlld3NTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIG9wZW5WaWV3KCkgeyByZXR1cm4gbnVsbDsgfVxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpYWxvZ1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SURpYWxvZ1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY29uZmlybSgpIHtcblx0XHRcdFx0cmV0dXJuIHsgY29uZmlybWVkOiB0cnVlIH07XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFiZWxTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYWJlbFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVnaXN0ZXJGb3JtYXR0ZXIoKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRTZXNzaW9uc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50U2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGdldCBtb2RlbCgpOiBJQWdlbnRTZXNzaW9uc01vZGVsIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50U2Vzc2lvbnNNb2RlbD4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgb25EaWRDaGFuZ2VTZXNzaW9uQXJjaGl2ZWRTdGF0ZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHR9KTtcblxuXHRcdGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFNlc3Npb25zU2VydmljZSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UpO1xuXHRcdG1haW5UaHJlYWQgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFpblRocmVhZENoYXRTZXNzaW9ucywgZXh0SG9zdENvbnRleHQpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0c2lub24ucmVzdG9yZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50IGNyZWF0ZXMgYW5kIGluaXRpYWxpemVzIHNlc3Npb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0bWFpblRocmVhZC4kcmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcigxLCBzZXNzaW9uU2NoZW1lKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKGAke3Nlc3Npb25TY2hlbWV9Oi90ZXN0LXNlc3Npb25gKTtcblx0XHRjb25zdCBzZXNzaW9uQ29udGVudDogSUNoYXRTZXNzaW9uRHRvID0ge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRoaXN0b3J5OiBbXSxcblx0XHRcdGhhc0FjdGl2ZVJlc3BvbnNlQ2FsbGJhY2s6IGZhbHNlLFxuXHRcdFx0aGFzUmVxdWVzdEhhbmRsZXI6IGZhbHNlLFxuXHRcdFx0aGFzRm9ya0hhbmRsZXI6IGZhbHNlLFxuXHRcdFx0c3VwcG9ydHNJbnRlcnJ1cHRpb246IGZhbHNlLFxuXHRcdH07XG5cblx0XHRhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudCkucmVzb2x2ZXMoc2Vzc2lvbkNvbnRlbnQpO1xuXHRcdGNvbnN0IHNlc3Npb24xID0gYXdhaXQgY2hhdFNlc3Npb25zU2VydmljZS5nZXRPckNyZWF0ZUNoYXRTZXNzaW9uKHJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5vayhzZXNzaW9uMSk7XG5cblx0XHRjb25zdCBzZXNzaW9uMiA9IGF3YWl0IGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0T3JDcmVhdGVDaGF0U2Vzc2lvbihyZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24xLCBzZXNzaW9uMik7XG5cblx0XHRhc3NlcnQub2soYXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQpLmNhbGxlZE9uY2UpO1xuXHRcdG1haW5UaHJlYWQuJHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcigxKTtcblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudCBwcm9wYWdhdGVzIHRpdGxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25TY2hlbWUgPSAndGVzdC1zZXNzaW9uLXR5cGUnO1xuXHRcdG1haW5UaHJlYWQuJHJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoMSwgc2Vzc2lvblNjaGVtZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovdGVzdC1zZXNzaW9uYCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNvbnRlbnQ6IElDaGF0U2Vzc2lvbkR0byA9IHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0dGl0bGU6ICdNeSBTZXNzaW9uIFRpdGxlJyxcblx0XHRcdGhpc3Rvcnk6IFtdLFxuXHRcdFx0aGFzQWN0aXZlUmVzcG9uc2VDYWxsYmFjazogZmFsc2UsXG5cdFx0XHRoYXNSZXF1ZXN0SGFuZGxlcjogZmFsc2UsXG5cdFx0XHRoYXNGb3JrSGFuZGxlcjogZmFsc2UsXG5cdFx0XHRzdXBwb3J0c0ludGVycnVwdGlvbjogZmFsc2UsXG5cdFx0fTtcblxuXHRcdGFzU2lub25NZXRob2RTdHViKHByb3h5LiRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KS5yZXNvbHZlcyhzZXNzaW9uQ29udGVudCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0T3JDcmVhdGVDaGF0U2Vzc2lvbihyZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi50aXRsZSwgJ015IFNlc3Npb24gVGl0bGUnKTtcblxuXHRcdG1haW5UaHJlYWQuJHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcigxKTtcblx0fSk7XG5cblx0dGVzdCgnJGhhbmRsZVByb2dyZXNzQ2h1bmsgcm91dGVzIHRvIGNvcnJlY3Qgc2Vzc2lvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uU2NoZW1lID0gJ3Rlc3Qtc2Vzc2lvbi10eXBlJztcblxuXHRcdG1haW5UaHJlYWQuJHJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoMSwgc2Vzc2lvblNjaGVtZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovdGVzdC1zZXNzaW9uYCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNvbnRlbnQ6IElDaGF0U2Vzc2lvbkR0byA9IHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0aGlzdG9yeTogW10sXG5cdFx0XHRoYXNBY3RpdmVSZXNwb25zZUNhbGxiYWNrOiBmYWxzZSxcblx0XHRcdGhhc1JlcXVlc3RIYW5kbGVyOiBmYWxzZSxcblx0XHRcdGhhc0ZvcmtIYW5kbGVyOiBmYWxzZSxcblx0XHRcdHN1cHBvcnRzSW50ZXJydXB0aW9uOiBmYWxzZSxcblx0XHR9O1xuXG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQpLnJlc29sdmVzKHNlc3Npb25Db250ZW50KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24ocmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpIGFzIE9ic2VydmFibGVDaGF0U2Vzc2lvbjtcblxuXHRcdGNvbnN0IHByb2dyZXNzRHRvOiBJQ2hhdFByb2dyZXNzRHRvID0geyBraW5kOiAncHJvZ3Jlc3NNZXNzYWdlJywgY29udGVudDogeyB2YWx1ZTogJ1Rlc3QnLCBpc1RydXN0ZWQ6IGZhbHNlIH0gfTtcblx0XHRhd2FpdCBtYWluVGhyZWFkLiRoYW5kbGVQcm9ncmVzc0NodW5rKDEsIHJlc291cmNlLCAncmVxMScsIFtwcm9ncmVzc0R0b10pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24ucHJvZ3Jlc3NPYnMuZ2V0KCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5wcm9ncmVzc09icy5nZXQoKVswXS5raW5kLCAncHJvZ3Jlc3NNZXNzYWdlJyk7XG5cblx0XHRtYWluVGhyZWFkLiR1bnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoMSk7XG5cdH0pO1xuXG5cdHRlc3QoJyRoYW5kbGVQcm9ncmVzc0NvbXBsZXRlIG1hcmtzIHNlc3Npb24gY29tcGxldGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0bWFpblRocmVhZC4kcmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcigxLCBzZXNzaW9uU2NoZW1lKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKGAke3Nlc3Npb25TY2hlbWV9Oi90ZXN0LXNlc3Npb25gKTtcblx0XHRjb25zdCBzZXNzaW9uQ29udGVudDogSUNoYXRTZXNzaW9uRHRvID0ge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRoaXN0b3J5OiBbXSxcblx0XHRcdGhhc0FjdGl2ZVJlc3BvbnNlQ2FsbGJhY2s6IGZhbHNlLFxuXHRcdFx0aGFzUmVxdWVzdEhhbmRsZXI6IGZhbHNlLFxuXHRcdFx0aGFzRm9ya0hhbmRsZXI6IGZhbHNlLFxuXHRcdFx0c3VwcG9ydHNJbnRlcnJ1cHRpb246IGZhbHNlLFxuXHRcdH07XG5cblx0XHRhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudCkucmVzb2x2ZXMoc2Vzc2lvbkNvbnRlbnQpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0T3JDcmVhdGVDaGF0U2Vzc2lvbihyZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkgYXMgT2JzZXJ2YWJsZUNoYXRTZXNzaW9uO1xuXG5cdFx0Y29uc3QgcHJvZ3Jlc3NEdG86IElDaGF0UHJvZ3Jlc3NEdG8gPSB7IGtpbmQ6ICdwcm9ncmVzc01lc3NhZ2UnLCBjb250ZW50OiB7IHZhbHVlOiAnVGVzdCcsIGlzVHJ1c3RlZDogZmFsc2UgfSB9O1xuXHRcdGF3YWl0IG1haW5UaHJlYWQuJGhhbmRsZVByb2dyZXNzQ2h1bmsoMSwgcmVzb3VyY2UsICdyZXExJywgW3Byb2dyZXNzRHRvXSk7XG5cdFx0bWFpblRocmVhZC4kaGFuZGxlUHJvZ3Jlc3NDb21wbGV0ZSgxLCByZXNvdXJjZSwgJ3JlcTEnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzQ29tcGxldGVPYnMuZ2V0KCksIHRydWUpO1xuXG5cdFx0bWFpblRocmVhZC4kdW5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnRlZ3JhdGlvbiB3aXRoIG11bHRpcGxlIHJlcXVlc3QvcmVzcG9uc2UgcGFpcnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0bWFpblRocmVhZC4kcmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcigxLCBzZXNzaW9uU2NoZW1lKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKGAke3Nlc3Npb25TY2hlbWV9Oi9tdWx0aS10dXJuLXNlc3Npb25gKTtcblx0XHRjb25zdCBzZXNzaW9uQ29udGVudDogSUNoYXRTZXNzaW9uRHRvID0ge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRoaXN0b3J5OiBbXG5cdFx0XHRcdHsgdHlwZTogJ3JlcXVlc3QnLCBwcm9tcHQ6ICdGaXJzdCBxdWVzdGlvbicsIHBhcnRpY2lwYW50OiAndGVzdC1wYXJ0aWNpcGFudCcgfSxcblx0XHRcdFx0eyB0eXBlOiAncmVzcG9uc2UnLCBwYXJ0czogW3sga2luZDogJ3Byb2dyZXNzTWVzc2FnZScsIGNvbnRlbnQ6IHsgdmFsdWU6ICdGaXJzdCBhbnN3ZXInLCBpc1RydXN0ZWQ6IGZhbHNlIH0gfV0sIHBhcnRpY2lwYW50OiAndGVzdC1wYXJ0aWNpcGFudCcgfSxcblx0XHRcdFx0eyB0eXBlOiAncmVxdWVzdCcsIHByb21wdDogJ1NlY29uZCBxdWVzdGlvbicsIHBhcnRpY2lwYW50OiAndGVzdC1wYXJ0aWNpcGFudCcgfSxcblx0XHRcdFx0eyB0eXBlOiAncmVzcG9uc2UnLCBwYXJ0czogW3sga2luZDogJ3Byb2dyZXNzTWVzc2FnZScsIGNvbnRlbnQ6IHsgdmFsdWU6ICdTZWNvbmQgYW5zd2VyJywgaXNUcnVzdGVkOiBmYWxzZSB9IH1dLCBwYXJ0aWNpcGFudDogJ3Rlc3QtcGFydGljaXBhbnQnIH1cblx0XHRcdF0sXG5cdFx0XHRoYXNBY3RpdmVSZXNwb25zZUNhbGxiYWNrOiBmYWxzZSxcblx0XHRcdGhhc1JlcXVlc3RIYW5kbGVyOiBmYWxzZSxcblx0XHRcdGhhc0ZvcmtIYW5kbGVyOiBmYWxzZSxcblx0XHRcdHN1cHBvcnRzSW50ZXJydXB0aW9uOiBmYWxzZSxcblx0XHR9O1xuXG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQpLnJlc29sdmVzKHNlc3Npb25Db250ZW50KTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY2hhdFNlc3Npb25zU2VydmljZS5nZXRPckNyZWF0ZUNoYXRTZXNzaW9uKHJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSBhcyBPYnNlcnZhYmxlQ2hhdFNlc3Npb247XG5cblx0XHQvLyBWZXJpZnkgdGhlIHNlc3Npb24gbG9hZGVkIGNvcnJlY3RseVxuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5oaXN0b3J5Lmxlbmd0aCwgNCk7XG5cblx0XHQvLyBWZXJpZnkgYWxsIGhpc3RvcnkgaXRlbXMgYXJlIGNvcnJlY3RseSBsb2FkZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5oaXN0b3J5WzBdLnR5cGUsICdyZXF1ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaGlzdG9yeVswXS5wcm9tcHQsICdGaXJzdCBxdWVzdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmhpc3RvcnlbMV0udHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaGlzdG9yeVsyXS50eXBlLCAncmVxdWVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmhpc3RvcnlbMl0ucHJvbXB0LCAnU2Vjb25kIHF1ZXN0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaGlzdG9yeVszXS50eXBlLCAncmVzcG9uc2UnKTtcblxuXHRcdC8vIFNlc3Npb24gc2hvdWxkIGJlIGNvbXBsZXRlIHNpbmNlIGl0IGhhcyBubyBhY3RpdmUgY2FwYWJpbGl0aWVzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNDb21wbGV0ZU9icy5nZXQoKSwgdHJ1ZSk7XG5cblx0XHRtYWluVGhyZWFkLiR1bnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoMSk7XG5cdH0pO1xuXG5cdHRlc3QoJyRvbkRpZENoYW5nZUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25zIHJlZnJlc2hlcyBvcHRpb24gZ3JvdXBzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25TY2hlbWUgPSAndGVzdC1zZXNzaW9uLXR5cGUnO1xuXHRcdGNvbnN0IGhhbmRsZSA9IDE7XG5cblx0XHRjb25zdCBvcHRpb25Hcm91cHMxOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwW10gPSBbe1xuXHRcdFx0aWQ6ICdtb2RlbHMnLFxuXHRcdFx0bmFtZTogJ01vZGVscycsXG5cdFx0XHRpdGVtczogW3sgaWQ6ICdtb2RlbEEnLCBuYW1lOiAnTW9kZWwgQScgfV1cblx0XHR9XTtcblx0XHRjb25zdCBvcHRpb25Hcm91cHMyOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwW10gPSBbe1xuXHRcdFx0aWQ6ICdtb2RlbHMnLFxuXHRcdFx0bmFtZTogJ01vZGVscycsXG5cdFx0XHRpdGVtczogW3sgaWQ6ICdtb2RlbEInLCBuYW1lOiAnTW9kZWwgQicgfV1cblx0XHR9XTtcblxuXHRcdGNvbnN0IHByb3ZpZGVPcHRpb25zU3R1YiA9IGFzU2lub25NZXRob2RTdHViKHByb3h5LiRwcm92aWRlQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbnMpO1xuXHRcdHByb3ZpZGVPcHRpb25zU3R1Yi5vbkZpcnN0Q2FsbCgpLnJlc29sdmVzKHsgb3B0aW9uR3JvdXBzOiBvcHRpb25Hcm91cHMxIH0gYXMgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25zKTtcblx0XHRwcm92aWRlT3B0aW9uc1N0dWIub25TZWNvbmRDYWxsKCkucmVzb2x2ZXMoeyBvcHRpb25Hcm91cHM6IG9wdGlvbkdyb3VwczIgfSBhcyBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbnMpO1xuXG5cdFx0bWFpblRocmVhZC4kcmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihoYW5kbGUsIHNlc3Npb25TY2hlbWUpO1xuXG5cdFx0Ly8gV2FpdCBmb3IgaW5pdGlhbCBvcHRpb25zIGZldGNoIHRyaWdnZXJlZCBvbiByZWdpc3RyYXRpb25cblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0bGV0IHN0b3JlZEdyb3VwcyA9IGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0T3B0aW9uR3JvdXBzRm9yU2Vzc2lvblR5cGUoc2Vzc2lvblNjaGVtZSk7XG5cdFx0YXNzZXJ0Lm9rKHN0b3JlZEdyb3Vwcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlZEdyb3VwcyFbMF0uaXRlbXNbMF0uaWQsICdtb2RlbEEnKTtcblxuXHRcdC8vIFNpbXVsYXRlIGV4dGVuc2lvbiBzaWduYWxpbmcgdGhhdCBwcm92aWRlciBvcHRpb25zIGhhdmUgY2hhbmdlZFxuXHRcdG1haW5UaHJlYWQuJG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbnMoaGFuZGxlKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0c3RvcmVkR3JvdXBzID0gY2hhdFNlc3Npb25zU2VydmljZS5nZXRPcHRpb25Hcm91cHNGb3JTZXNzaW9uVHlwZShzZXNzaW9uU2NoZW1lKTtcblx0XHRhc3NlcnQub2soc3RvcmVkR3JvdXBzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmVkR3JvdXBzIVswXS5pdGVtc1swXS5pZCwgJ21vZGVsQicpO1xuXG5cdFx0bWFpblRocmVhZC4kdW5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKGhhbmRsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFNlc3Npb25PcHRpb24gcmV0dXJucyB1bmRlZmluZWQgZm9yIHVuc2V0IG9wdGlvbnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0bWFpblRocmVhZC4kcmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcigxLCBzZXNzaW9uU2NoZW1lKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKGAke3Nlc3Npb25TY2hlbWV9Oi90ZXN0LXNlc3Npb25gKTtcblx0XHRjb25zdCBzZXNzaW9uQ29udGVudDogSUNoYXRTZXNzaW9uRHRvID0ge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRoaXN0b3J5OiBbXSxcblx0XHRcdGhhc0FjdGl2ZVJlc3BvbnNlQ2FsbGJhY2s6IGZhbHNlLFxuXHRcdFx0aGFzUmVxdWVzdEhhbmRsZXI6IGZhbHNlLFxuXHRcdFx0aGFzRm9ya0hhbmRsZXI6IGZhbHNlLFxuXHRcdFx0c3VwcG9ydHNJbnRlcnJ1cHRpb246IGZhbHNlLFxuXHRcdH07XG5cblx0XHRhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudCkucmVzb2x2ZXMoc2Vzc2lvbkNvbnRlbnQpO1xuXG5cdFx0YXdhaXQgY2hhdFNlc3Npb25zU2VydmljZS5nZXRPckNyZWF0ZUNoYXRTZXNzaW9uKHJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdC8vIGdldFNlc3Npb25PcHRpb24gc2hvdWxkIHJldHVybiB1bmRlZmluZWQgZm9yIHVuc2V0IG9wdGlvbnNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhdFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uT3B0aW9uKHJlc291cmNlLCAnbW9kZWxzJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbihyZXNvdXJjZSwgJ2FueU9wdGlvbicpLCB1bmRlZmluZWQpO1xuXG5cdFx0bWFpblRocmVhZC4kdW5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTZXNzaW9uT3B0aW9uIHJldHVybnMgdmFsdWUgZm9yIGV4cGxpY2l0bHkgc2V0IG9wdGlvbnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0bWFpblRocmVhZC4kcmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcigxLCBzZXNzaW9uU2NoZW1lKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKGAke3Nlc3Npb25TY2hlbWV9Oi90ZXN0LXNlc3Npb25gKTtcblx0XHRjb25zdCBzZXNzaW9uQ29udGVudDogSUNoYXRTZXNzaW9uRHRvID0ge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRoaXN0b3J5OiBbXSxcblx0XHRcdGhhc0FjdGl2ZVJlc3BvbnNlQ2FsbGJhY2s6IGZhbHNlLFxuXHRcdFx0aGFzUmVxdWVzdEhhbmRsZXI6IGZhbHNlLFxuXHRcdFx0aGFzRm9ya0hhbmRsZXI6IGZhbHNlLFxuXHRcdFx0c3VwcG9ydHNJbnRlcnJ1cHRpb246IGZhbHNlLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHQnbW9kZWxzJzogJ2dwdC00Jyxcblx0XHRcdFx0J3JlZ2lvbic6IHsgaWQ6ICd1cy1lYXN0JywgbmFtZTogJ1VTIEVhc3QnIH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQpLnJlc29sdmVzKHNlc3Npb25Db250ZW50KTtcblxuXHRcdGF3YWl0IGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0T3JDcmVhdGVDaGF0U2Vzc2lvbihyZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHQvLyBnZXRTZXNzaW9uT3B0aW9uIHNob3VsZCByZXR1cm4gdGhlIGNvbmZpZ3VyZWQgdmFsdWVzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbihyZXNvdXJjZSwgJ21vZGVscycpLCAnZ3B0LTQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbihyZXNvdXJjZSwgJ3JlZ2lvbicpLCB7IGlkOiAndXMtZWFzdCcsIG5hbWU6ICdVUyBFYXN0JyB9KTtcblxuXHRcdC8vIGdldFNlc3Npb25PcHRpb24gc2hvdWxkIHJldHVybiB1bmRlZmluZWQgZm9yIG9wdGlvbnMgbm90IGluIHRoZSBzZXNzaW9uXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbihyZXNvdXJjZSwgJ25vdENvbmZpZ3VyZWQnKSwgdW5kZWZpbmVkKTtcblxuXHRcdG1haW5UaHJlYWQuJHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcigxKTtcblx0fSk7XG5cblx0dGVzdCgnb3B0aW9uIGNoYW5nZSBub3RpZmljYXRpb25zIGFyZSBzZW50IHRvIHRoZSBleHRlbnNpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0Y29uc3QgaGFuZGxlID0gMTtcblxuXHRcdG1haW5UaHJlYWQuJHJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoaGFuZGxlLCBzZXNzaW9uU2NoZW1lKTtcblxuXHRcdGNvbnN0IHNlc3Npb25Db250ZW50OiBJQ2hhdFNlc3Npb25EdG8gPSB7XG5cdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKGAke3Nlc3Npb25TY2hlbWV9Oi90ZXN0LXNlc3Npb25gKSxcblx0XHRcdGhpc3Rvcnk6IFtdLFxuXHRcdFx0aGFzQWN0aXZlUmVzcG9uc2VDYWxsYmFjazogZmFsc2UsXG5cdFx0XHRoYXNSZXF1ZXN0SGFuZGxlcjogZmFsc2UsXG5cdFx0XHRoYXNGb3JrSGFuZGxlcjogZmFsc2UsXG5cdFx0XHRzdXBwb3J0c0ludGVycnVwdGlvbjogZmFsc2UsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdCdtb2RlbHMnOiAnZ3B0LTQnXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGFzU2lub25NZXRob2RTdHViKHByb3h5LiRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KS5yZXNvbHZlcyhzZXNzaW9uQ29udGVudCk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovdGVzdC1zZXNzaW9uYCk7XG5cdFx0YXdhaXQgY2hhdFNlc3Npb25zU2VydmljZS5nZXRPckNyZWF0ZUNoYXRTZXNzaW9uKHJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdC8vIENsZWFyIHRoZSBzdHViIGNhbGwgaGlzdG9yeVxuXHRcdGFzU2lub25NZXRob2RTdHViKHByb3h5LiRwcm92aWRlSGFuZGxlT3B0aW9uc0NoYW5nZSkucmVzZXRIaXN0b3J5KCk7XG5cblx0XHQvLyBTaW11bGF0ZSBhbiBvcHRpb24gY2hhbmdlXG5cdFx0Y2hhdFNlc3Npb25zU2VydmljZS5zZXRTZXNzaW9uT3B0aW9uKHJlc291cmNlLCAnbW9kZWxzJywgJ2dwdC00LXR1cmJvJyk7XG5cblx0XHQvLyBWZXJpZnkgdGhlIGV4dGVuc2lvbiB3YXMgbm90aWZpZWRcblx0XHRhc3NlcnQub2soYXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVIYW5kbGVPcHRpb25zQ2hhbmdlKS5jYWxsZWRPbmNlKTtcblx0XHRjb25zdCBjYWxsID0gYXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVIYW5kbGVPcHRpb25zQ2hhbmdlKS5maXJzdENhbGw7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGwuYXJnc1swXSwgaGFuZGxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGwuYXJnc1sxXSwgcmVzb3VyY2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbC5hcmdzWzJdLCB7IG1vZGVsczogJ2dwdC00LXR1cmJvJyB9KTtcblxuXHRcdG1haW5UaHJlYWQuJHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihoYW5kbGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdvcHRpb24gY2hhbmdlIG5vdGlmaWNhdGlvbnMgZmFpbCBzaWxlbnRseSB3aGVuIHByb3ZpZGVyIG5vdCByZWdpc3RlcmVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25TY2hlbWUgPSAndW5yZWdpc3RlcmVkLXNlc3Npb24tdHlwZSc7XG5cblx0XHQvLyBEbyBOT1QgcmVnaXN0ZXIgYSBjb250ZW50IHByb3ZpZGVyIGZvciB0aGlzIHNjaGVtZVxuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoYCR7c2Vzc2lvblNjaGVtZX06L3Rlc3Qtc2Vzc2lvbmApO1xuXG5cdFx0Ly8gQ2xlYXIgYW55IHByZXZpb3VzIGNhbGxzXG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVIYW5kbGVPcHRpb25zQ2hhbmdlKS5yZXNldEhpc3RvcnkoKTtcblxuXHRcdC8vIEF0dGVtcHQgdG8gbm90aWZ5IG9wdGlvbiBjaGFuZ2UgZm9yIGFuIHVucmVnaXN0ZXJlZCBzY2hlbWVcblx0XHQvLyBUaGlzIHNob3VsZCBub3QgdGhyb3csIGJ1dCBhbHNvIHNob3VsZCBub3QgY2FsbCB0aGUgcHJveHlcblx0XHRjaGF0U2Vzc2lvbnNTZXJ2aWNlLnVwZGF0ZVNlc3Npb25PcHRpb25zKHJlc291cmNlLCBuZXcgTWFwKFtcblx0XHRcdFsnbW9kZWxzJywgJ2dwdC00LXR1cmJvJ11cblx0XHRdKSk7XG5cblx0XHQvLyBWZXJpZnkgdGhlIGV4dGVuc2lvbiB3YXMgTk9UIG5vdGlmaWVkIChubyBwcm92aWRlciByZWdpc3RlcmVkKVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcHJvdmlkZUhhbmRsZU9wdGlvbnNDaGFuZ2UpLmNhbGxDb3VudCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldFNlc3Npb25PcHRpb24gdXBkYXRlcyBvcHRpb24gYW5kIGdldFNlc3Npb25PcHRpb24gcmVmbGVjdHMgY2hhbmdlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25TY2hlbWUgPSAndGVzdC1zZXNzaW9uLXR5cGUnO1xuXHRcdG1haW5UaHJlYWQuJHJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoMSwgc2Vzc2lvblNjaGVtZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovdGVzdC1zZXNzaW9uYCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNvbnRlbnQ6IElDaGF0U2Vzc2lvbkR0byA9IHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0aGlzdG9yeTogW10sXG5cdFx0XHRoYXNBY3RpdmVSZXNwb25zZUNhbGxiYWNrOiBmYWxzZSxcblx0XHRcdGhhc1JlcXVlc3RIYW5kbGVyOiBmYWxzZSxcblx0XHRcdGhhc0ZvcmtIYW5kbGVyOiBmYWxzZSxcblx0XHRcdHN1cHBvcnRzSW50ZXJydXB0aW9uOiBmYWxzZSxcblx0XHR9O1xuXG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQpLnJlc29sdmVzKHNlc3Npb25Db250ZW50KTtcblxuXHRcdGF3YWl0IGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0T3JDcmVhdGVDaGF0U2Vzc2lvbihyZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHQvLyBJbml0aWFsbHkgbm8gb3B0aW9ucyBzZXRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhdFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uT3B0aW9uKHJlc291cmNlLCAnbW9kZWxzJyksIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBTZXQgYW4gb3B0aW9uXG5cdFx0Y2hhdFNlc3Npb25zU2VydmljZS5zZXRTZXNzaW9uT3B0aW9uKHJlc291cmNlLCAnbW9kZWxzJywgJ2dwdC00Jyk7XG5cblx0XHQvLyBOb3cgZ2V0U2Vzc2lvbk9wdGlvbiBzaG91bGQgcmV0dXJuIHRoZSB2YWx1ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb25PcHRpb24ocmVzb3VyY2UsICdtb2RlbHMnKSwgJ2dwdC00Jyk7XG5cblx0XHRtYWluVGhyZWFkLiR1bnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoMSk7XG5cdH0pO1xuXG5cdHRlc3QoJyR1cGRhdGVDaGF0U2Vzc2lvbklucHV0U3RhdGUgYXBwbGllcyBzZWxlY3RlZCBvcHRpb25zIG9ubHkgdG8gdGhlIHRhcmdldGVkIHNlc3Npb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0Y29uc3QgY29udHJvbGxlckhhbmRsZSA9IDA7XG5cblx0XHRtYWluVGhyZWFkLiRyZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY29udHJvbGxlckhhbmRsZSwgc2Vzc2lvblNjaGVtZSwgZmFsc2UpO1xuXHRcdG1haW5UaHJlYWQuJHJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoMSwgc2Vzc2lvblNjaGVtZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZUEgPSBVUkkucGFyc2UoYCR7c2Vzc2lvblNjaGVtZX06L3Nlc3Npb24tYWApO1xuXHRcdGNvbnN0IHJlc291cmNlQiA9IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovc2Vzc2lvbi1iYCk7XG5cblx0XHRhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudClcblx0XHRcdC53aXRoQXJncyhzaW5vbi5tYXRjaC5hbnksIHNpbm9uLm1hdGNoKChyOiBVUkkpID0+IHIudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2VBLnRvU3RyaW5nKCkpLCBzaW5vbi5tYXRjaC5hbnksIHNpbm9uLm1hdGNoLmFueSlcblx0XHRcdC5yZXNvbHZlcyh7IHJlc291cmNlOiByZXNvdXJjZUEsIGhpc3Rvcnk6IFtdLCBoYXNBY3RpdmVSZXNwb25zZUNhbGxiYWNrOiBmYWxzZSwgaGFzUmVxdWVzdEhhbmRsZXI6IGZhbHNlLCBoYXNGb3JrSGFuZGxlcjogZmFsc2UsIHN1cHBvcnRzSW50ZXJydXB0aW9uOiBmYWxzZSB9IHNhdGlzZmllcyBJQ2hhdFNlc3Npb25EdG8pO1xuXHRcdGFzU2lub25NZXRob2RTdHViKHByb3h5LiRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KVxuXHRcdFx0LndpdGhBcmdzKHNpbm9uLm1hdGNoLmFueSwgc2lub24ubWF0Y2goKHI6IFVSSSkgPT4gci50b1N0cmluZygpID09PSByZXNvdXJjZUIudG9TdHJpbmcoKSksIHNpbm9uLm1hdGNoLmFueSwgc2lub24ubWF0Y2guYW55KVxuXHRcdFx0LnJlc29sdmVzKHsgcmVzb3VyY2U6IHJlc291cmNlQiwgaGlzdG9yeTogW10sIGhhc0FjdGl2ZVJlc3BvbnNlQ2FsbGJhY2s6IGZhbHNlLCBoYXNSZXF1ZXN0SGFuZGxlcjogZmFsc2UsIGhhc0ZvcmtIYW5kbGVyOiBmYWxzZSwgc3VwcG9ydHNJbnRlcnJ1cHRpb246IGZhbHNlIH0gc2F0aXNmaWVzIElDaGF0U2Vzc2lvbkR0byk7XG5cblx0XHRhd2FpdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24ocmVzb3VyY2VBLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhd2FpdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24ocmVzb3VyY2VCLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdC8vIFVwZGF0ZSBpbnB1dCBzdGF0ZSB0YXJnZXRpbmcgb25seSBzZXNzaW9uIEFcblx0XHRtYWluVGhyZWFkLiR1cGRhdGVDaGF0U2Vzc2lvbklucHV0U3RhdGUoY29udHJvbGxlckhhbmRsZSwgcmVzb3VyY2VBLCBbe1xuXHRcdFx0aWQ6ICdtb2RlbHMnLFxuXHRcdFx0bmFtZTogJ01vZGVscycsXG5cdFx0XHRpdGVtczogW3sgaWQ6ICdtb2RlbEEnLCBuYW1lOiAnTW9kZWwgQScgfSwgeyBpZDogJ21vZGVsQicsIG5hbWU6ICdNb2RlbCBCJyB9XSxcblx0XHRcdHNlbGVjdGVkOiB7IGlkOiAnbW9kZWxCJywgbmFtZTogJ01vZGVsIEInIH0sXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb25PcHRpb24ocmVzb3VyY2VBLCAnbW9kZWxzJyksIHsgaWQ6ICdtb2RlbEInLCBuYW1lOiAnTW9kZWwgQicgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbihyZXNvdXJjZUIsICdtb2RlbHMnKSwgdW5kZWZpbmVkKTtcblxuXHRcdG1haW5UaHJlYWQuJHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcigxKTtcblx0XHRtYWluVGhyZWFkLiR1bnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjb250cm9sbGVySGFuZGxlKTtcblx0fSk7XG5cblx0dGVzdCgnJHVwZGF0ZUNoYXRTZXNzaW9uSW5wdXRTdGF0ZSB1cGRhdGVzIGRpZmZlcmVudCBzZXNzaW9ucyBpbmRlcGVuZGVudGx5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25TY2hlbWUgPSAndGVzdC1zZXNzaW9uLXR5cGUnO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXJIYW5kbGUgPSAwO1xuXG5cdFx0bWFpblRocmVhZC4kcmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNvbnRyb2xsZXJIYW5kbGUsIHNlc3Npb25TY2hlbWUsIGZhbHNlKTtcblx0XHRtYWluVGhyZWFkLiRyZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKDEsIHNlc3Npb25TY2hlbWUpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2VBID0gVVJJLnBhcnNlKGAke3Nlc3Npb25TY2hlbWV9Oi9zZXNzaW9uLWFgKTtcblx0XHRjb25zdCByZXNvdXJjZUIgPSBVUkkucGFyc2UoYCR7c2Vzc2lvblNjaGVtZX06L3Nlc3Npb24tYmApO1xuXG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQpXG5cdFx0XHQud2l0aEFyZ3Moc2lub24ubWF0Y2guYW55LCBzaW5vbi5tYXRjaCgocjogVVJJKSA9PiByLnRvU3RyaW5nKCkgPT09IHJlc291cmNlQS50b1N0cmluZygpKSwgc2lub24ubWF0Y2guYW55LCBzaW5vbi5tYXRjaC5hbnkpXG5cdFx0XHQucmVzb2x2ZXMoeyByZXNvdXJjZTogcmVzb3VyY2VBLCBoaXN0b3J5OiBbXSwgaGFzQWN0aXZlUmVzcG9uc2VDYWxsYmFjazogZmFsc2UsIGhhc1JlcXVlc3RIYW5kbGVyOiBmYWxzZSwgaGFzRm9ya0hhbmRsZXI6IGZhbHNlLCBzdXBwb3J0c0ludGVycnVwdGlvbjogZmFsc2UgfSBzYXRpc2ZpZXMgSUNoYXRTZXNzaW9uRHRvKTtcblx0XHRhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudClcblx0XHRcdC53aXRoQXJncyhzaW5vbi5tYXRjaC5hbnksIHNpbm9uLm1hdGNoKChyOiBVUkkpID0+IHIudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2VCLnRvU3RyaW5nKCkpLCBzaW5vbi5tYXRjaC5hbnksIHNpbm9uLm1hdGNoLmFueSlcblx0XHRcdC5yZXNvbHZlcyh7IHJlc291cmNlOiByZXNvdXJjZUIsIGhpc3Rvcnk6IFtdLCBoYXNBY3RpdmVSZXNwb25zZUNhbGxiYWNrOiBmYWxzZSwgaGFzUmVxdWVzdEhhbmRsZXI6IGZhbHNlLCBoYXNGb3JrSGFuZGxlcjogZmFsc2UsIHN1cHBvcnRzSW50ZXJydXB0aW9uOiBmYWxzZSB9IHNhdGlzZmllcyBJQ2hhdFNlc3Npb25EdG8pO1xuXG5cdFx0YXdhaXQgY2hhdFNlc3Npb25zU2VydmljZS5nZXRPckNyZWF0ZUNoYXRTZXNzaW9uKHJlc291cmNlQSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXdhaXQgY2hhdFNlc3Npb25zU2VydmljZS5nZXRPckNyZWF0ZUNoYXRTZXNzaW9uKHJlc291cmNlQiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHQvLyBVcGRhdGUgc2Vzc2lvbiBBIHdpdGggbW9kZWxYXG5cdFx0bWFpblRocmVhZC4kdXBkYXRlQ2hhdFNlc3Npb25JbnB1dFN0YXRlKGNvbnRyb2xsZXJIYW5kbGUsIHJlc291cmNlQSwgW3tcblx0XHRcdGlkOiAnbW9kZWxzJyxcblx0XHRcdG5hbWU6ICdNb2RlbHMnLFxuXHRcdFx0aXRlbXM6IFt7IGlkOiAnbW9kZWxYJywgbmFtZTogJ01vZGVsIFgnIH0sIHsgaWQ6ICdtb2RlbFknLCBuYW1lOiAnTW9kZWwgWScgfV0sXG5cdFx0XHRzZWxlY3RlZDogeyBpZDogJ21vZGVsWCcsIG5hbWU6ICdNb2RlbCBYJyB9LFxuXHRcdH1dKTtcblxuXHRcdC8vIFVwZGF0ZSBzZXNzaW9uIEIgd2l0aCBtb2RlbFlcblx0XHRtYWluVGhyZWFkLiR1cGRhdGVDaGF0U2Vzc2lvbklucHV0U3RhdGUoY29udHJvbGxlckhhbmRsZSwgcmVzb3VyY2VCLCBbe1xuXHRcdFx0aWQ6ICdtb2RlbHMnLFxuXHRcdFx0bmFtZTogJ01vZGVscycsXG5cdFx0XHRpdGVtczogW3sgaWQ6ICdtb2RlbFgnLCBuYW1lOiAnTW9kZWwgWCcgfSwgeyBpZDogJ21vZGVsWScsIG5hbWU6ICdNb2RlbCBZJyB9XSxcblx0XHRcdHNlbGVjdGVkOiB7IGlkOiAnbW9kZWxZJywgbmFtZTogJ01vZGVsIFknIH0sXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb25PcHRpb24ocmVzb3VyY2VBLCAnbW9kZWxzJyksIHsgaWQ6ICdtb2RlbFgnLCBuYW1lOiAnTW9kZWwgWCcgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb25PcHRpb24ocmVzb3VyY2VCLCAnbW9kZWxzJyksIHsgaWQ6ICdtb2RlbFknLCBuYW1lOiAnTW9kZWwgWScgfSk7XG5cblx0XHRtYWluVGhyZWFkLiR1bnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoMSk7XG5cdFx0bWFpblRocmVhZC4kdW5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY29udHJvbGxlckhhbmRsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVDaGF0U2Vzc2lvbkl0ZW0gaW52b2tlcyBwcm94eSBhbmQgdXBkYXRlcyBpdGVtJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25TY2hlbWUgPSAndGVzdC1zZXNzaW9uLXR5cGUnO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXJIYW5kbGUgPSAwO1xuXG5cdFx0bWFpblRocmVhZC4kcmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNvbnRyb2xsZXJIYW5kbGUsIHNlc3Npb25TY2hlbWUsIHRydWUpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoYCR7c2Vzc2lvblNjaGVtZX06L3Nlc3Npb24tYWApO1xuXHRcdGNvbnN0IGluaXRpYWxJdGVtOiBEdG88SUNoYXRTZXNzaW9uSXRlbT4gPSB7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdGxhYmVsOiAnU2Vzc2lvbiBBJyxcblx0XHRcdHRpbWluZzogeyBjcmVhdGVkOiAwLCBsYXN0UmVxdWVzdFN0YXJ0ZWQ6IHVuZGVmaW5lZCwgbGFzdFJlcXVlc3RFbmRlZDogdW5kZWZpbmVkIH0sXG5cdFx0fTtcblxuXHRcdC8vIEFkZCBpbml0aWFsIGl0ZW0gdmlhICRhZGRPclVwZGF0ZUNoYXRTZXNzaW9uSXRlbVxuXHRcdGF3YWl0IG1haW5UaHJlYWQuJGFkZE9yVXBkYXRlQ2hhdFNlc3Npb25JdGVtKGNvbnRyb2xsZXJIYW5kbGUsIGluaXRpYWxJdGVtKTtcblxuXHRcdGNvbnN0IHJlc29sdmVkSXRlbTogRHRvPElDaGF0U2Vzc2lvbkl0ZW0+ID0ge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRsYWJlbDogJ1Nlc3Npb24gQScsXG5cdFx0XHR0aW1pbmc6IHsgY3JlYXRlZDogMCwgbGFzdFJlcXVlc3RTdGFydGVkOiB1bmRlZmluZWQsIGxhc3RSZXF1ZXN0RW5kZWQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0YmFkZ2U6ICdyZXNvbHZlZCcsXG5cdFx0fTtcblxuXHRcdGFzU2lub25NZXRob2RTdHViKHByb3h5LiRyZXNvbHZlQ2hhdFNlc3Npb25JdGVtKS5yZXNvbHZlcyhyZXNvbHZlZEl0ZW0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY2hhdFNlc3Npb25zU2VydmljZS5yZXNvbHZlQ2hhdFNlc3Npb25JdGVtKHNlc3Npb25TY2hlbWUsIHJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5vayhhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcmVzb2x2ZUNoYXRTZXNzaW9uSXRlbSkuY2FsbGVkT25jZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQ/LmJhZGdlLCAncmVzb2x2ZWQnKTtcblxuXHRcdG1haW5UaHJlYWQuJHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNvbnRyb2xsZXJIYW5kbGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlQ2hhdFNlc3Npb25JdGVtIHJldHVybnMgdW5kZWZpbmVkIHdoZW4gc3VwcG9ydHNSZXNvbHZlIGlzIGZhbHNlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25TY2hlbWUgPSAndGVzdC1zZXNzaW9uLXR5cGUnO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXJIYW5kbGUgPSAwO1xuXG5cdFx0bWFpblRocmVhZC4kcmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNvbnRyb2xsZXJIYW5kbGUsIHNlc3Npb25TY2hlbWUsIGZhbHNlKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKGAke3Nlc3Npb25TY2hlbWV9Oi9zZXNzaW9uLWFgKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNoYXRTZXNzaW9uc1NlcnZpY2UucmVzb2x2ZUNoYXRTZXNzaW9uSXRlbShzZXNzaW9uU2NoZW1lLCByZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5vayhhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcmVzb2x2ZUNoYXRTZXNzaW9uSXRlbSkubm90Q2FsbGVkKTtcblxuXHRcdG1haW5UaHJlYWQuJHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNvbnRyb2xsZXJIYW5kbGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlQ2hhdFNlc3Npb25JdGVtIGNhY2hlIGlzIGludmFsaWRhdGVkIG9uIGl0ZW0gdXBkYXRlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25TY2hlbWUgPSAndGVzdC1zZXNzaW9uLXR5cGUnO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXJIYW5kbGUgPSAwO1xuXG5cdFx0bWFpblRocmVhZC4kcmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNvbnRyb2xsZXJIYW5kbGUsIHNlc3Npb25TY2hlbWUsIHRydWUpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoYCR7c2Vzc2lvblNjaGVtZX06L3Nlc3Npb24tYWApO1xuXHRcdGNvbnN0IHRpbWluZyA9IHsgY3JlYXRlZDogMCwgbGFzdFJlcXVlc3RTdGFydGVkOiB1bmRlZmluZWQsIGxhc3RSZXF1ZXN0RW5kZWQ6IHVuZGVmaW5lZCB9O1xuXHRcdGNvbnN0IGluaXRpYWxJdGVtOiBEdG88SUNoYXRTZXNzaW9uSXRlbT4gPSB7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdGxhYmVsOiAnU2Vzc2lvbiBBJyxcblx0XHRcdHRpbWluZyxcblx0XHR9O1xuXG5cdFx0YXdhaXQgbWFpblRocmVhZC4kYWRkT3JVcGRhdGVDaGF0U2Vzc2lvbkl0ZW0oY29udHJvbGxlckhhbmRsZSwgaW5pdGlhbEl0ZW0pO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWRJdGVtMTogRHRvPElDaGF0U2Vzc2lvbkl0ZW0+ID0geyByZXNvdXJjZSwgbGFiZWw6ICdTZXNzaW9uIEEnLCB0aW1pbmcsIGJhZGdlOiAnZmlyc3QnIH07XG5cdFx0Y29uc3QgcmVzb2x2ZWRJdGVtMjogRHRvPElDaGF0U2Vzc2lvbkl0ZW0+ID0geyByZXNvdXJjZSwgbGFiZWw6ICdTZXNzaW9uIEEnLCB0aW1pbmcsIGJhZGdlOiAnc2Vjb25kJyB9O1xuXG5cdFx0Y29uc3QgcmVzb2x2ZVN0dWIgPSBhc1Npbm9uTWV0aG9kU3R1Yihwcm94eS4kcmVzb2x2ZUNoYXRTZXNzaW9uSXRlbSk7XG5cdFx0cmVzb2x2ZVN0dWIub25GaXJzdENhbGwoKS5yZXNvbHZlcyhyZXNvbHZlZEl0ZW0xKTtcblx0XHRyZXNvbHZlU3R1Yi5vblNlY29uZENhbGwoKS5yZXNvbHZlcyhyZXNvbHZlZEl0ZW0yKTtcblxuXHRcdC8vIEZpcnN0IHJlc29sdmVcblx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgY2hhdFNlc3Npb25zU2VydmljZS5yZXNvbHZlQ2hhdFNlc3Npb25JdGVtKHNlc3Npb25TY2hlbWUsIHJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdDE/LmJhZGdlLCAnZmlyc3QnKTtcblxuXHRcdC8vIFNpbXVsYXRlIGl0ZW0gdXBkYXRlIChzaG91bGQgaW52YWxpZGF0ZSBjYWNoZSlcblx0XHRhd2FpdCBtYWluVGhyZWFkLiRhZGRPclVwZGF0ZUNoYXRTZXNzaW9uSXRlbShjb250cm9sbGVySGFuZGxlLCB7IC4uLmluaXRpYWxJdGVtLCBsYWJlbDogJ1Nlc3Npb24gQSBVcGRhdGVkJyB9KTtcblxuXHRcdC8vIFNlY29uZCByZXNvbHZlIGFmdGVyIGNhY2hlIGludmFsaWRhdGlvbiBzaG91bGQgY2FsbCBwcm94eSBhZ2FpblxuXHRcdGNvbnN0IHJlc3VsdDIgPSBhd2FpdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0oc2Vzc2lvblNjaGVtZSwgcmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Mj8uYmFkZ2UsICdzZWNvbmQnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlU3R1Yi5jYWxsQ291bnQsIDIpO1xuXG5cdFx0bWFpblRocmVhZC4kdW5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY29udHJvbGxlckhhbmRsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVDaGF0U2Vzc2lvbkl0ZW0gY2FjaGVzIHVuZGVmaW5lZCByZXN1bHQgdW50aWwgaXRlbSB1cGRhdGUgaW52YWxpZGF0ZXMgaXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0Y29uc3QgY29udHJvbGxlckhhbmRsZSA9IDA7XG5cblx0XHRtYWluVGhyZWFkLiRyZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY29udHJvbGxlckhhbmRsZSwgc2Vzc2lvblNjaGVtZSwgdHJ1ZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovc2Vzc2lvbi1hYCk7XG5cdFx0Y29uc3QgdGltaW5nID0geyBjcmVhdGVkOiAwLCBsYXN0UmVxdWVzdFN0YXJ0ZWQ6IHVuZGVmaW5lZCwgbGFzdFJlcXVlc3RFbmRlZDogdW5kZWZpbmVkIH07XG5cdFx0Y29uc3QgaW5pdGlhbEl0ZW06IER0bzxJQ2hhdFNlc3Npb25JdGVtPiA9IHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0bGFiZWw6ICdTZXNzaW9uIEEnLFxuXHRcdFx0dGltaW5nLFxuXHRcdH07XG5cblx0XHRjb25zdCByZXNvbHZlU3R1YiA9IGFzU2lub25NZXRob2RTdHViKHByb3h5LiRyZXNvbHZlQ2hhdFNlc3Npb25JdGVtKTtcblx0XHRyZXNvbHZlU3R1Yi5vbkZpcnN0Q2FsbCgpLnJlc29sdmVzKHVuZGVmaW5lZCk7XG5cdFx0cmVzb2x2ZVN0dWIub25TZWNvbmRDYWxsKCkucmVzb2x2ZXMoeyByZXNvdXJjZSwgbGFiZWw6ICdTZXNzaW9uIEEnLCB0aW1pbmcsIGJhZGdlOiAncmVzb2x2ZWQnIH0gc2F0aXNmaWVzIER0bzxJQ2hhdFNlc3Npb25JdGVtPik7XG5cblx0XHQvLyBGaXJzdCByZXNvbHZlIHJldHVybnMgdW5kZWZpbmVkIGFuZCBzaG91bGQgYmUgY2FjaGVkLlxuXHRcdGNvbnN0IHJlc3VsdDEgPSBhd2FpdCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0oc2Vzc2lvblNjaGVtZSwgcmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQxLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gU2Vjb25kIHJlc29sdmUgc2hvdWxkIHJldXNlIHRoZSBjYWNoZWQgdW5kZWZpbmVkIHJlc3VsdC5cblx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgY2hhdFNlc3Npb25zU2VydmljZS5yZXNvbHZlQ2hhdFNlc3Npb25JdGVtKHNlc3Npb25TY2hlbWUsIHJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MiwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZVN0dWIuY2FsbENvdW50LCAxKTtcblxuXHRcdC8vIFVwZGF0aW5nIHRoZSBpdGVtIHNob3VsZCBpbnZhbGlkYXRlIHRoZSBjYWNoZWQgdW5kZWZpbmVkIHJlc3VsdC5cblx0XHRhd2FpdCBtYWluVGhyZWFkLiRhZGRPclVwZGF0ZUNoYXRTZXNzaW9uSXRlbShjb250cm9sbGVySGFuZGxlLCBpbml0aWFsSXRlbSk7XG5cblx0XHRjb25zdCByZXN1bHQzID0gYXdhaXQgY2hhdFNlc3Npb25zU2VydmljZS5yZXNvbHZlQ2hhdFNlc3Npb25JdGVtKHNlc3Npb25TY2hlbWUsIHJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdDM/LmJhZGdlLCAncmVzb2x2ZWQnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlU3R1Yi5jYWxsQ291bnQsIDIpO1xuXG5cdFx0bWFpblRocmVhZC4kdW5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY29udHJvbGxlckhhbmRsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVDaGF0U2Vzc2lvbkl0ZW0gaWdub3JlcyBzdGFsZSBpbi1mbGlnaHQgcmVzb2x2ZSByZXN1bHQgYWZ0ZXIgaXRlbSB1cGRhdGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblNjaGVtZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0Y29uc3QgY29udHJvbGxlckhhbmRsZSA9IDA7XG5cblx0XHRtYWluVGhyZWFkLiRyZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY29udHJvbGxlckhhbmRsZSwgc2Vzc2lvblNjaGVtZSwgdHJ1ZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovc2Vzc2lvbi1hYCk7XG5cdFx0Y29uc3QgdGltaW5nID0geyBjcmVhdGVkOiAwLCBsYXN0UmVxdWVzdFN0YXJ0ZWQ6IHVuZGVmaW5lZCwgbGFzdFJlcXVlc3RFbmRlZDogdW5kZWZpbmVkIH07XG5cdFx0Y29uc3QgaW5pdGlhbEl0ZW06IER0bzxJQ2hhdFNlc3Npb25JdGVtPiA9IHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0bGFiZWw6ICdTZXNzaW9uIEEnLFxuXHRcdFx0dGltaW5nLFxuXHRcdH07XG5cblx0XHRhd2FpdCBtYWluVGhyZWFkLiRhZGRPclVwZGF0ZUNoYXRTZXNzaW9uSXRlbShjb250cm9sbGVySGFuZGxlLCBpbml0aWFsSXRlbSk7XG5cblx0XHRsZXQgcmVzb2x2ZVBlbmRpbmc6ICgodmFsdWU6IER0bzxJQ2hhdFNlc3Npb25JdGVtPikgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdFx0YXNTaW5vbk1ldGhvZFN0dWIocHJveHkuJHJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0pLnJldHVybnMobmV3IFByb21pc2U8RHRvPElDaGF0U2Vzc2lvbkl0ZW0+PihyZXNvbHZlID0+IHtcblx0XHRcdHJlc29sdmVQZW5kaW5nID0gcmVzb2x2ZTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBwZW5kaW5nUmVzb2x2ZSA9IGNoYXRTZXNzaW9uc1NlcnZpY2UucmVzb2x2ZUNoYXRTZXNzaW9uSXRlbShzZXNzaW9uU2NoZW1lLCByZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhd2FpdCBtYWluVGhyZWFkLiRhZGRPclVwZGF0ZUNoYXRTZXNzaW9uSXRlbShjb250cm9sbGVySGFuZGxlLCB7XG5cdFx0XHQuLi5pbml0aWFsSXRlbSxcblx0XHRcdGxhYmVsOiAnU2Vzc2lvbiBBIFVwZGF0ZWQnLFxuXHRcdH0pO1xuXG5cdFx0cmVzb2x2ZVBlbmRpbmc/Lih7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdGxhYmVsOiAnU2Vzc2lvbiBBJyxcblx0XHRcdHRpbWluZyxcblx0XHRcdGJhZGdlOiAnc3RhbGUnLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGVuZGluZ1Jlc29sdmU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8ubGFiZWwsICdTZXNzaW9uIEEgVXBkYXRlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/LmJhZGdlLCB1bmRlZmluZWQpO1xuXG5cdFx0bWFpblRocmVhZC4kdW5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY29udHJvbGxlckhhbmRsZSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdFeHRIb3N0Q2hhdFNlc3Npb25zJywgZnVuY3Rpb24gKCkge1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGV4dEhvc3RDaGF0U2Vzc2lvbnM6IEV4dEhvc3RDaGF0U2Vzc2lvbnM7XG5cdGxldCBtYWluVGhyZWFkQ2hhdFNlc3Npb25zUHJveHk6IHtcblx0XHQkcmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyOiBzaW5vbi5TaW5vblN0dWI7XG5cdFx0JHVwZGF0ZUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJDYXBhYmlsaXRpZXM6IHNpbm9uLlNpbm9uU3R1Yjtcblx0XHQkdW5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXI6IHNpbm9uLlNpbm9uU3R1Yjtcblx0XHQkdXBkYXRlQ2hhdFNlc3Npb25JdGVtczogc2lub24uU2lub25TdHViO1xuXHRcdCRhZGRPclVwZGF0ZUNoYXRTZXNzaW9uSXRlbTogc2lub24uU2lub25TdHViO1xuXHRcdCRvbkRpZENvbW1pdENoYXRTZXNzaW9uSXRlbTogc2lub24uU2lub25TdHViO1xuXHRcdCRyZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyOiBzaW5vbi5TaW5vblN0dWI7XG5cdFx0JHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcjogc2lub24uU2lub25TdHViO1xuXHRcdCRvbkRpZENoYW5nZUNoYXRTZXNzaW9uT3B0aW9uczogc2lub24uU2lub25TdHViO1xuXHRcdCRvbkRpZENoYW5nZUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25zOiBzaW5vbi5TaW5vblN0dWI7XG5cdFx0JHVwZGF0ZUNoYXRTZXNzaW9uSW5wdXRTdGF0ZTogc2lub24uU2lub25TdHViO1xuXHR9O1xuXG5cdHNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRtYWluVGhyZWFkQ2hhdFNlc3Npb25zUHJveHkgPSB7XG5cdFx0XHQkcmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyOiBzaW5vbi5zdHViKCksXG5cdFx0XHQkdXBkYXRlQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlckNhcGFiaWxpdGllczogc2lub24uc3R1YigpLFxuXHRcdFx0JHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyOiBzaW5vbi5zdHViKCksXG5cdFx0XHQkdXBkYXRlQ2hhdFNlc3Npb25JdGVtczogc2lub24uc3R1YigpLnJlc29sdmVzKCksXG5cdFx0XHQkYWRkT3JVcGRhdGVDaGF0U2Vzc2lvbkl0ZW06IHNpbm9uLnN0dWIoKS5yZXNvbHZlcygpLFxuXHRcdFx0JG9uRGlkQ29tbWl0Q2hhdFNlc3Npb25JdGVtOiBzaW5vbi5zdHViKCksXG5cdFx0XHQkcmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcjogc2lub24uc3R1YigpLFxuXHRcdFx0JHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcjogc2lub24uc3R1YigpLFxuXHRcdFx0JG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25PcHRpb25zOiBzaW5vbi5zdHViKCksXG5cdFx0XHQkb25EaWRDaGFuZ2VDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uczogc2lub24uc3R1YigpLFxuXHRcdFx0JHVwZGF0ZUNoYXRTZXNzaW9uSW5wdXRTdGF0ZTogc2lub24uc3R1YigpLFxuXHRcdH07XG5cblx0XHRjb25zdCBycGNQcm90b2NvbCA9IEFueUNhbGxSUENQcm90b2NvbChtYWluVGhyZWFkQ2hhdFNlc3Npb25zUHJveHkpO1xuXHRcdGNvbnN0IGNvbW1hbmRzID0gbmV3IEV4dEhvc3RDb21tYW5kcyhycGNQcm90b2NvbCwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dEhvc3RUZWxlbWV0cnk+KCkgeyB9KTtcblx0XHRjb25zdCBsYW5ndWFnZU1vZGVscyA9IG5ldyBFeHRIb3N0TGFuZ3VhZ2VNb2RlbHMocnBjUHJvdG9jb2wsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0QXV0aGVudGljYXRpb24+KCkgeyB9KTtcblxuXHRcdGV4dEhvc3RDaGF0U2Vzc2lvbnMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEV4dEhvc3RDaGF0U2Vzc2lvbnMoY29tbWFuZHMsIGxhbmd1YWdlTW9kZWxzLCBycGNQcm90b2NvbCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUNvbnRlbnRQcm92aWRlcihzZXNzaW9uOiB2c2NvZGUuQ2hhdFNlc3Npb24pOiB2c2NvZGUuQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50OiBhc3luYyAoKSA9PiBzZXNzaW9uLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdjb250cm9sbGVyIG9ubHkgYWR2ZXJ0aXNlcyByZXNvbHZlIHN1cHBvcnQgYWZ0ZXIgcmVzb2x2ZSBoYW5kbGVyIGlzIGFzc2lnbmVkJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25TY2hlbWUgPSAndGVzdC1zZXNzaW9uLXR5cGUnO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdENoYXRTZXNzaW9ucy5jcmVhdGVDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2Vzc2lvblNjaGVtZSwgYXN5bmMgKCkgPT4geyB9KSk7XG5cblx0XHRhc3NlcnQub2sobWFpblRocmVhZENoYXRTZXNzaW9uc1Byb3h5LiRyZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIuY2FsbGVkT25jZVdpdGhFeGFjdGx5KDAsIHNlc3Npb25TY2hlbWUsIGZhbHNlKSk7XG5cdFx0YXNzZXJ0Lm9rKG1haW5UaHJlYWRDaGF0U2Vzc2lvbnNQcm94eS4kdXBkYXRlQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlckNhcGFiaWxpdGllcy5ub3RDYWxsZWQpO1xuXG5cdFx0Y29udHJvbGxlci5yZXNvbHZlQ2hhdFNlc3Npb25JdGVtID0gYXN5bmMgKCkgPT4geyB9O1xuXHRcdGFzc2VydC5vayhtYWluVGhyZWFkQ2hhdFNlc3Npb25zUHJveHkuJHVwZGF0ZUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJDYXBhYmlsaXRpZXMuY2FsbGVkT25jZVdpdGhFeGFjdGx5KDAsIHRydWUpKTtcblxuXHRcdGNvbnRyb2xsZXIucmVzb2x2ZUNoYXRTZXNzaW9uSXRlbSA9IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQub2sobWFpblRocmVhZENoYXRTZXNzaW9uc1Byb3h5LiR1cGRhdGVDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyQ2FwYWJpbGl0aWVzLmNhbGxlZFR3aWNlKTtcblx0XHRhc3NlcnQub2sobWFpblRocmVhZENoYXRTZXNzaW9uc1Byb3h5LiR1cGRhdGVDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyQ2FwYWJpbGl0aWVzLnNlY29uZENhbGwuY2FsbGVkV2l0aEV4YWN0bHkoMCwgZmFsc2UpKTtcblx0fSk7XG5cblx0dGVzdCgnYWR2ZXJ0aXNlcyBjb250cm9sbGVyIGZvcmsgc3VwcG9ydCB3aGVuIG9ubHkgdGhlIGNvbnRyb2xsZXIgcmVnaXN0ZXJzIGEgZm9yayBoYW5kbGVyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25TY2hlbWUgPSAndGVzdC1zZXNzaW9uLXR5cGUnO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovdGVzdC1zZXNzaW9uYCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChleHRIb3N0Q2hhdFNlc3Npb25zLmNyZWF0ZUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZXNzaW9uU2NoZW1lLCBhc3luYyAoKSA9PiB7IH0pKTtcblx0XHRjb250cm9sbGVyLmZvcmtIYW5kbGVyID0gYXN5bmMgcmVzb3VyY2UgPT4gY29udHJvbGxlci5jcmVhdGVDaGF0U2Vzc2lvbkl0ZW0ocmVzb3VyY2Uud2l0aCh7IHBhdGg6ICcvZm9ya2VkLXNlc3Npb24nIH0pLCAnRm9ya2VkIFNlc3Npb24nKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0Q2hhdFNlc3Npb25zLnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZXNzaW9uU2NoZW1lLCB1bmRlZmluZWQhLCBjcmVhdGVDb250ZW50UHJvdmlkZXIoe1xuXHRcdFx0aGlzdG9yeTogW10sXG5cdFx0XHRyZXF1ZXN0SGFuZGxlcjogdW5kZWZpbmVkLFxuXHRcdH0pKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgZXh0SG9zdENoYXRTZXNzaW9ucy4kcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudCgwLCBzZXNzaW9uUmVzb3VyY2UsIHsgaW5pdGlhbFNlc3Npb25PcHRpb25zOiBbXSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmhhc0ZvcmtIYW5kbGVyLCB0cnVlKTtcblx0XHRhd2FpdCBleHRIb3N0Q2hhdFNlc3Npb25zLiRkaXNwb3NlQ2hhdFNlc3Npb25Db250ZW50KDAsIHNlc3Npb25SZXNvdXJjZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZWZlcnMgY29udHJvbGxlciBmb3JrIGhhbmRsZXIgb3ZlciBkZXByZWNhdGVkIHNlc3Npb24gZm9yayBoYW5kbGVyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25TY2hlbWUgPSAndGVzdC1zZXNzaW9uLXR5cGUnO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovdGVzdC1zZXNzaW9uYCk7XG5cdFx0Y29uc3QgcmVxdWVzdFR1cm4gPSBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXF1ZXN0VHVybigncHJvbXB0JywgdW5kZWZpbmVkLCBbXSwgJ3BhcnRpY2lwYW50JywgW10sIHVuZGVmaW5lZCwgJ3JlcXVlc3QtMScpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdENoYXRTZXNzaW9ucy5jcmVhdGVDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2Vzc2lvblNjaGVtZSwgYXN5bmMgKCkgPT4geyB9KSk7XG5cdFx0Y29uc3QgY29udHJvbGxlckl0ZW0gPSBjb250cm9sbGVyLmNyZWF0ZUNoYXRTZXNzaW9uSXRlbShVUkkucGFyc2UoYCR7c2Vzc2lvblNjaGVtZX06L2ZvcmtlZC1ieS1jb250cm9sbGVyYCksICdGb3JrZWQgYnkgQ29udHJvbGxlcicpO1xuXHRcdGNvbnN0IHNlc3Npb25JdGVtID0ge1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShgJHtzZXNzaW9uU2NoZW1lfTovZm9ya2VkLWJ5LXNlc3Npb25gKSxcblx0XHRcdGxhYmVsOiAnRm9ya2VkIGJ5IFNlc3Npb24nXG5cdFx0fTtcblxuXHRcdGNvbnN0IGNvbnRyb2xsZXJGb3JrSGFuZGxlciA9IHNpbm9uLnN0dWIoKS5yZXNvbHZlcyhjb250cm9sbGVySXRlbSk7XG5cdFx0Y29uc3QgZGVwcmVjYXRlZFNlc3Npb25Gb3JrSGFuZGxlciA9IHNpbm9uLnN0dWIoKS5yZXNvbHZlcyhzZXNzaW9uSXRlbSk7XG5cdFx0Y29udHJvbGxlci5mb3JrSGFuZGxlciA9IGNvbnRyb2xsZXJGb3JrSGFuZGxlcjtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0Q2hhdFNlc3Npb25zLnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZXNzaW9uU2NoZW1lLCB1bmRlZmluZWQhLCBjcmVhdGVDb250ZW50UHJvdmlkZXIoe1xuXHRcdFx0aGlzdG9yeTogW3JlcXVlc3RUdXJuXSxcblx0XHRcdHJlcXVlc3RIYW5kbGVyOiB1bmRlZmluZWQsXG5cdFx0XHRmb3JrSGFuZGxlcjogZGVwcmVjYXRlZFNlc3Npb25Gb3JrSGFuZGxlcixcblx0XHR9KSkpO1xuXG5cdFx0YXdhaXQgZXh0SG9zdENoYXRTZXNzaW9ucy4kcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudCgwLCBzZXNzaW9uUmVzb3VyY2UsIHsgaW5pdGlhbFNlc3Npb25PcHRpb25zOiBbXSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBleHRIb3N0Q2hhdFNlc3Npb25zLiRmb3JrQ2hhdFNlc3Npb24oMCwgc2Vzc2lvblJlc291cmNlLCB7XG5cdFx0XHR0eXBlOiAncmVxdWVzdCcsXG5cdFx0XHRpZDogJ3JlcXVlc3QtMScsXG5cdFx0XHRwcm9tcHQ6ICdwcm9tcHQnLFxuXHRcdFx0cGFydGljaXBhbnQ6ICdwYXJ0aWNpcGFudCcsXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQub2soY29udHJvbGxlckZvcmtIYW5kbGVyLmNhbGxlZE9uY2VXaXRoRXhhY3RseShzZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3RUdXJuLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlcHJlY2F0ZWRTZXNzaW9uRm9ya0hhbmRsZXIuY2FsbENvdW50LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnJlc291cmNlLnRvU3RyaW5nKCksIGNvbnRyb2xsZXJJdGVtLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGFiZWwsIGNvbnRyb2xsZXJJdGVtLmxhYmVsKTtcblx0XHRhd2FpdCBleHRIb3N0Q2hhdFNlc3Npb25zLiRkaXNwb3NlQ2hhdFNlc3Npb25Db250ZW50KDAsIHNlc3Npb25SZXNvdXJjZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gZGVwcmVjYXRlZCBzZXNzaW9uIGZvcmsgaGFuZGxlciB3aGVuIG5vIGNvbnRyb2xsZXIgZm9yayBoYW5kbGVyIGV4aXN0cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZXNzaW9uU2NoZW1lID0gJ3Rlc3Qtc2Vzc2lvbi10eXBlJztcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoYCR7c2Vzc2lvblNjaGVtZX06L3Rlc3Qtc2Vzc2lvbmApO1xuXHRcdGNvbnN0IHJlcXVlc3RUdXJuID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVxdWVzdFR1cm4oJ3Byb21wdCcsIHVuZGVmaW5lZCwgW10sICdwYXJ0aWNpcGFudCcsIFtdLCB1bmRlZmluZWQsICdyZXF1ZXN0LTEnKTtcblx0XHRjb25zdCBkZXByZWNhdGVkU2Vzc2lvbkZvcmtIYW5kbGVyID0gc2lub24uc3R1YigpLnJlc29sdmVzKHtcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoYCR7c2Vzc2lvblNjaGVtZX06L2ZvcmtlZC1ieS1zZXNzaW9uYCksXG5cdFx0XHRsYWJlbDogJ0ZvcmtlZCBieSBTZXNzaW9uJ1xuXHRcdH0pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3RDaGF0U2Vzc2lvbnMucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlc3Npb25TY2hlbWUsIHVuZGVmaW5lZCEsIGNyZWF0ZUNvbnRlbnRQcm92aWRlcih7XG5cdFx0XHRoaXN0b3J5OiBbcmVxdWVzdFR1cm5dLFxuXHRcdFx0cmVxdWVzdEhhbmRsZXI6IHVuZGVmaW5lZCxcblx0XHRcdGZvcmtIYW5kbGVyOiBkZXByZWNhdGVkU2Vzc2lvbkZvcmtIYW5kbGVyLFxuXHRcdH0pKSk7XG5cblx0XHRhd2FpdCBleHRIb3N0Q2hhdFNlc3Npb25zLiRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KDAsIHNlc3Npb25SZXNvdXJjZSwgeyBpbml0aWFsU2Vzc2lvbk9wdGlvbnM6IFtdIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4dEhvc3RDaGF0U2Vzc2lvbnMuJGZvcmtDaGF0U2Vzc2lvbigwLCBzZXNzaW9uUmVzb3VyY2UsIHtcblx0XHRcdHR5cGU6ICdyZXF1ZXN0Jyxcblx0XHRcdGlkOiAncmVxdWVzdC0xJyxcblx0XHRcdHByb21wdDogJ3Byb21wdCcsXG5cdFx0XHRwYXJ0aWNpcGFudDogJ3BhcnRpY2lwYW50Jyxcblx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5vayhkZXByZWNhdGVkU2Vzc2lvbkZvcmtIYW5kbGVyLmNhbGxlZE9uY2VXaXRoRXhhY3RseShzZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3RUdXJuLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZXNvdXJjZS50b1N0cmluZygpLCBgJHtzZXNzaW9uU2NoZW1lfTovZm9ya2VkLWJ5LXNlc3Npb25gKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmxhYmVsLCAnRm9ya2VkIGJ5IFNlc3Npb24nKTtcblx0XHRhd2FpdCBleHRIb3N0Q2hhdFNlc3Npb25zLiRkaXNwb3NlQ2hhdFNlc3Npb25Db250ZW50KDAsIHNlc3Npb25SZXNvdXJjZSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxXQUFXO0FBRXZCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsYUFBYTtBQUN0QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFdBQVc7QUFDcEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxhQUFhLHNCQUFzQjtBQUU1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
