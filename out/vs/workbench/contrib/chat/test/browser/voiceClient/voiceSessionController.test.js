import assert from "assert";
import sinon from "sinon";
import { mainWindow } from "../../../../../../base/browser/window.js";
import { DeferredPromise } from "../../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { TestAccessibilityService } from "../../../../../../platform/accessibility/test/common/testAccessibilityService.js";
import { IAccessibilitySignalService } from "../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { NoOpNotification } from "../../../../../../platform/notification/common/notification.js";
import { TestNotificationService } from "../../../../../../platform/notification/test/common/testNotificationService.js";
import { NullTelemetryService, NullTelemetryServiceShape } from "../../../../../../platform/telemetry/common/telemetryUtils.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { IVoiceTranscriptStore } from "../../../../agentsVoice/common/voiceTranscriptStore.js";
import { AgentSessionStatus } from "../../../browser/agentSessions/agentSessionsModel.js";
import { IAgentSessionsService } from "../../../browser/agentSessions/agentSessionsService.js";
import { IChatWidgetService } from "../../../browser/chat.js";
import { IMicCaptureService } from "../../../browser/voiceClient/micCaptureService.js";
import { ITtsPlaybackService } from "../../../browser/voiceClient/ttsPlaybackService.js";
import { VoiceSessionController } from "../../../browser/voiceClient/voiceSessionController.js";
import { IVoiceToolDispatchService } from "../../../browser/voiceClient/voiceToolDispatchService.js";
import { ElicitationState, IChatService, IChatToolInvocation, ToolConfirmKind } from "../../../common/chatService/chatService.js";
import { derivePendingId, IVoiceClientService, peekPendingId, VOICE_AGENT_PROGRESS_SETTING } from "../../../common/voiceClient/voiceClientService.js";
import { ChatElicitationRequestPart } from "../../../common/model/chatProgressTypes/chatElicitationRequestPart.js";
import { ChatPlanReviewData } from "../../../common/model/chatProgressTypes/chatPlanReviewData.js";
import { ChatQuestionCarouselData } from "../../../common/model/chatProgressTypes/chatQuestionCarouselData.js";
import { IVoicePlaybackService } from "../../../common/voicePlaybackService.js";
import { AskQuestionsToolId } from "../../../common/tools/builtinTools/askQuestionsTool.js";
import { MockChatService } from "../../common/chatService/mockChatService.js";
class TestVoiceClientService extends mock() {
  constructor() {
    super(...arguments);
    this.narrationCounter = 0;
    this.requests = [];
    this.sessionCommands = [];
    this.sessionCommandSent = new DeferredPromise();
    this.audioResponseEmitter = new Emitter();
    this.onAudioResponse = this.audioResponseEmitter.event;
    this.bargeInEmitter = new Emitter();
    this.onBargeIn = this.bargeInEmitter.event;
    this.transcriptionEmitter = new Emitter();
    this.onTranscription = this.transcriptionEmitter.event;
    this.toolCallEmitter = new Emitter();
    this.onToolCall = this.toolCallEmitter.event;
    this.speechStartedEmitter = new Emitter();
    this.onSpeechStarted = this.speechStartedEmitter.event;
    this.narrationAckEmitter = new Emitter();
    this.onNarrationAck = this.narrationAckEmitter.event;
    this.narrationUnblockedEmitter = new Emitter();
    this.onNarrationUnblocked = this.narrationUnblockedEmitter.event;
    this.narrationInterruptedEmitter = new Emitter();
    this.onNarrationInterrupted = this.narrationInterruptedEmitter.event;
    this.sessionInitEmitter = new Emitter();
    this.onSessionInit = this.sessionInitEmitter.event;
    this.onError = Event.None;
    this.connectionStateEmitter = new Emitter();
    this.onDidChangeConnectionState = this.connectionStateEmitter.event;
    this.onFatalDisconnect = Event.None;
    this.onTurnAutoEnded = Event.None;
    this.connected = false;
    this.resuming = false;
    this.reconnecting = false;
    this.wireEvents = [];
    this.playbackCompletions = [];
    this.toolResults = [];
    this.toolResultReceived = new Promise((resolve) => this.toolResultResolver = resolve);
  }
  get isConnected() {
    return this.connected;
  }
  get isResuming() {
    return this.resuming;
  }
  get willReconnect() {
    return this.reconnecting;
  }
  disconnect() {
    this.connected = false;
  }
  async connect() {
  }
  sendSessionContext(context) {
    this.pendingContext = context;
  }
  flushSessionContext() {
    if (this.pendingContext) {
      this.wireEvents.push({ type: "session_context", context: this.pendingContext });
      this.pendingContext = void 0;
    }
  }
  invalidateSessionCache() {
  }
  sendStartSession() {
    this.sessionCommands.push("start");
    this.sessionCommandSent.complete();
  }
  sendResumeSession() {
    this.sessionCommands.push("resume");
    this.sessionCommandSent.complete();
  }
  sendNarrationPlaybackComplete(codingSessionId, narrationId, playbackId) {
    this.playbackCompletions.push({ sessionId: codingSessionId, narrationId, playbackId });
  }
  sendToolResult(callId, result) {
    this.toolResults.push({ callId, result });
    this.toolResultResolver?.();
  }
  requestNarration(codingSessionId, kind, text, narrationId, checkpoint, confirmationType, pending) {
    const id = narrationId ?? `narration-${++this.narrationCounter}`;
    this.requests.push({ sessionId: codingSessionId, kind, text, narrationId: id, ...pending ? { pendingId: pending.pendingId } : {}, ...checkpoint ? { checkpoint } : {}, ...confirmationType ? { confirmationType } : {} });
    this.wireEvents.push({ type: "request_narration", kind, text, ...confirmationType ? { confirmationType } : {} });
    return id;
  }
  fireAudioResponse(event) {
    this.audioResponseEmitter.fire(event);
  }
  fireBargeIn(event) {
    this.bargeInEmitter.fire(event);
  }
  fireTranscription(event) {
    this.transcriptionEmitter.fire(event);
  }
  fireToolCall(event) {
    this.toolCallEmitter.fire(event);
  }
  fireSpeechStarted(turnId) {
    this.speechStartedEmitter.fire({ turnId });
  }
  fireNarrationInterrupted(event) {
    this.narrationInterruptedEmitter.fire(event);
  }
  fireNarrationAck(event) {
    this.narrationAckEmitter.fire(event);
  }
  fireNarrationUnblocked(event) {
    this.narrationUnblockedEmitter.fire(event);
  }
  fireConnectionState(connected, willReconnect = false) {
    this.connected = connected;
    this.reconnecting = !connected && willReconnect;
    this.connectionStateEmitter.fire(connected);
  }
  setResuming(resuming) {
    this.resuming = resuming;
  }
  fireSessionInit() {
    this.sessionInitEmitter.fire({ sessionId: "voice-session" });
  }
  dispose() {
    this.audioResponseEmitter.dispose();
    this.bargeInEmitter.dispose();
    this.transcriptionEmitter.dispose();
    this.toolCallEmitter.dispose();
    this.speechStartedEmitter.dispose();
    this.narrationAckEmitter.dispose();
    this.narrationUnblockedEmitter.dispose();
    this.narrationInterruptedEmitter.dispose();
    this.connectionStateEmitter.dispose();
    this.sessionInitEmitter.dispose();
  }
}
class RecordingMicCaptureService extends mock() {
  constructor(captureBarrier) {
    super();
    this.captureBarrier = captureBarrier;
    this.pttDownCalls = [];
    this.abortCalls = 0;
    this.prepareCalls = 0;
    this.startCaptureCalls = 0;
    this.stopCaptureCalls = 0;
    this.captureStarted = new DeferredPromise();
    this.onPttStart = Event.None;
    this.onPttAudioChunk = Event.None;
    this.onPttEnd = Event.None;
    this.onPttDiagnostic = Event.None;
    this.analyserNode = void 0;
    this.isMuted = false;
  }
  prepare() {
    this.prepareCalls++;
  }
  async startCapture() {
    this.startCaptureCalls++;
    if (this.startCaptureCalls === 1) {
      this.captureStarted.complete();
    }
    await this.captureBarrier;
  }
  stopCapture() {
    this.stopCaptureCalls++;
  }
  abortPtt() {
    this.abortCalls++;
  }
  pttUp() {
  }
  suppressUntil() {
  }
  async pttDown(turnId, passive) {
    this.pttDownCalls.push({ turnId, passive });
  }
}
class VoiceTestNotificationService extends TestNotificationService {
  constructor() {
    super(...arguments);
    this.notifications = [];
  }
  notify(notification) {
    this.notifications.push(notification);
    return new NoOpNotification();
  }
}
class TestTtsPlaybackService extends mock() {
  constructor() {
    super(...arguments);
    this.playedAudio = [];
    this.stopCount = 0;
    this.playing = false;
    this.playbackStoppedEmitter = new Emitter();
    this.onPlaybackStarted = Event.None;
    this.onPlaybackStopped = this.playbackStoppedEmitter.event;
    this.analyserNode = void 0;
  }
  get isPlaying() {
    return this.playing;
  }
  ensureContext() {
    return new class extends mock() {
      resume() {
        return Promise.resolve();
      }
    }();
  }
  playAudioChunk(audio) {
    if (audio) {
      this.playedAudio.push(audio);
      this.playing = true;
    }
  }
  stopPlayback() {
    this.stopCount++;
    const wasPlaying = this.playing;
    this.playing = false;
    if (wasPlaying) {
      this.playbackStoppedEmitter.fire();
    }
  }
  getLastPlayedSamples() {
    return null;
  }
  closeContext() {
  }
  dispose() {
    this.playbackStoppedEmitter.dispose();
  }
}
class DeferredFirstTtsPlaybackService extends TestTtsPlaybackService {
  constructor() {
    super(...arguments);
    this.deferNextStart = true;
  }
  playAudioChunk(audio) {
    if (audio && this.deferNextStart) {
      this.deferNextStart = false;
      this.playedAudio.push(audio);
      return;
    }
    super.playAudioChunk(audio);
  }
}
class TestMicCaptureService extends mock() {
  constructor() {
    super(...arguments);
    this.onPttStart = Event.None;
    this.onPttAudioChunk = Event.None;
    this.onPttEnd = Event.None;
    this.onPttDiagnostic = Event.None;
    this.analyserNode = void 0;
    this.isMuted = false;
    this.pttTurns = [];
  }
  prepare() {
  }
  async startCapture() {
  }
  stopCapture() {
  }
  suppressUntil() {
  }
  async pttDown(turnId) {
    this.pttTurns.push(turnId);
  }
  pttUp() {
  }
  abortPtt() {
  }
}
class TestAgentSessionsService extends mock() {
  constructor(sessions = []) {
    super();
    this.onDidChangeSessionArchivedState = Event.None;
    this.model = {
      onWillResolve: Event.None,
      onDidResolve: Event.None,
      sessions,
      onDidChangeSessions: Event.None,
      onDidChangeSessionArchivedState: Event.None,
      resolved: true,
      getSession: () => void 0,
      observeSession: () => observableValue("session", void 0),
      resolve: async () => {
      }
    };
  }
}
function agentSessionEntry(id, label, status) {
  return {
    resource: URI.parse(id),
    label,
    status,
    isArchived: () => false,
    timing: { created: Date.now(), lastRequestEnded: Date.now() }
  };
}
class TestChatService extends mock() {
  constructor() {
    super(...arguments);
    this.chatModels = observableValue("chatModels", []);
    this.sendRequestOptions = [];
  }
  getSession() {
    return void 0;
  }
  async sendRequest(_sessionResource, _message, options) {
    this.sendRequestOptions.push(options);
    return { kind: "rejected", reason: "test" };
  }
  /** A session that never loads: the controller eagerly loads models for waiting sessions. */
  async acquireOrLoadSession() {
    return void 0;
  }
}
class ControllableChatService extends mock() {
  constructor() {
    super(...arguments);
    this.chatModels = observableValue("chatModels", []);
    this._sessions = /* @__PURE__ */ new Map();
  }
  getSession(resource) {
    return this._sessions.get(resource.toString());
  }
  setModels(models) {
    this._sessions.clear();
    for (const model of models) {
      this._sessions.set(model.sessionResource.toString(), model);
    }
    this.chatModels.set(models, void 0);
  }
}
function pendingPartsModel(parts, requestId = "req-1", pendingDetail) {
  const value = Array.isArray(parts) ? parts : [parts];
  const lastRequest = {
    id: requestId,
    response: {
      response: { value },
      isPendingConfirmation: observableValue(
        "pending",
        pendingDetail === void 0 ? void 0 : { detail: pendingDetail }
      )
    }
  };
  return {
    getRequests: () => [lastRequest]
  };
}
function pendingConfirmationModel(resource) {
  const response = {
    isPendingConfirmation: observableValue("pending", { detail: "Needs approval" }),
    response: { value: [] }
  };
  const lastRequest = { response };
  return {
    sessionResource: resource,
    title: "Chat",
    getRequests: () => [lastRequest],
    lastRequestObs: observableValue("lastRequest", lastRequest)
  };
}
function pendingResponsePartModel(resource, part, detail = "Needs approval", reportPending = true) {
  const response = {
    isPendingConfirmation: observableValue("pending", reportPending ? { detail } : void 0),
    isIncomplete: observableValue("incomplete", false),
    response: { value: [part], getMarkdown: () => "" }
  };
  const lastRequest = { response };
  return {
    sessionResource: resource,
    title: "Chat",
    getRequests: () => [lastRequest],
    lastRequestObs: observableValue("lastRequest", lastRequest)
  };
}
function completedResponseModel(markdown, errorMessage, isCanceled = false) {
  const response = {
    isPendingConfirmation: observableValue("pending", void 0),
    isIncomplete: observableValue("incomplete", false),
    isCanceled,
    response: {
      value: [],
      getMarkdown: () => markdown
    },
    result: errorMessage ? { errorDetails: { message: errorMessage } } : void 0
  };
  return {
    getRequests: () => [{ response }]
  };
}
class TestChatWidgetService extends mock() {
  constructor() {
    super(...arguments);
    this.onDidChangeFocusedSession = Event.None;
    this.onDidAddWidget = Event.None;
  }
  getAllWidgets() {
    return [];
  }
}
class TestCommandService extends mock() {
  constructor() {
    super(...arguments);
    this.acceptedInputs = [];
  }
  async executeCommand(commandId, ...args) {
    let result;
    if (commandId === "_chat.voice.getCurrentSession") {
      result = "chat-session";
    } else if (commandId === "_chat.voice.acceptInput" && typeof args[0] === "string") {
      this.acceptedInputs.push(args[0]);
    }
    return result;
  }
}
class TestTelemetryService extends NullTelemetryServiceShape {
  constructor() {
    super(...arguments);
    this.events = [];
  }
  publicLog2(eventName, data) {
    if (eventName) {
      this.events.push({ name: eventName, data });
    }
  }
}
suite("VoiceSessionController", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let clock;
  setup(() => {
    clock = sinon.useFakeTimers();
  });
  teardown(() => {
    clock.restore();
    sinon.restore();
  });
  function createController(voiceClientService, ttsPlaybackService = new TestTtsPlaybackService(), commandService = new TestCommandService(), telemetryService = NullTelemetryService, micCaptureService = new TestMicCaptureService(), configurationService = new TestConfigurationService({ "agents.voice.handsFree": false, [VOICE_AGENT_PROGRESS_SETTING]: true }), chatService = new TestChatService(), promptsService = new class extends mock() {
    async getVoiceInstructions() {
      return void 0;
    }
  }(), agentSessionsService = new TestAgentSessionsService(), notificationService = new VoiceTestNotificationService()) {
    store.add({ dispose: () => voiceClientService.dispose() });
    store.add(ttsPlaybackService);
    return store.add(new VoiceSessionController(
      voiceClientService,
      micCaptureService,
      ttsPlaybackService,
      new class extends mock() {
        setDelegate() {
        }
        async respondToSession() {
          return { ok: true };
        }
      }(),
      new class extends mock() {
        notifyPlaybackStart() {
        }
        notifyPlaybackEnd() {
        }
      }(),
      agentSessionsService,
      chatService,
      commandService,
      new class extends mock() {
        async getSessions() {
          return [];
        }
      }(),
      new class extends mock() {
        async loadTurns() {
          return [];
        }
      }(),
      new NullLogService(),
      new class extends mock() {
      }(),
      telemetryService,
      configurationService,
      new class extends mock() {
        async playSignal() {
        }
      }(),
      new TestAccessibilityService(),
      new TestChatWidgetService(),
      notificationService,
      promptsService
    ));
  }
  function createVoiceProgressResponse(id, requestId = `request-${id}`) {
    const changeEmitter = store.add(new Emitter());
    const parts = [];
    const state = {
      id,
      requestId,
      isComplete: false,
      isCanceled: false,
      onDidChange: changeEmitter.event,
      response: { value: parts }
    };
    return { changeEmitter, parts, response: state, state };
  }
  test("includes response errors in the summary sent to the voice backend", () => {
    const controller = createController(new TestVoiceClientService());
    const getAgentStateInfo = Reflect.get(controller, "_getAgentStateInfo");
    assert.deepStrictEqual([
      getAgentStateInfo.call(controller, completedResponseModel("", "The branch main was not found.")),
      getAgentStateInfo.call(controller, completedResponseModel("I could not rebase the branch.", "The branch main was not found.")),
      getAgentStateInfo.call(controller, completedResponseModel("The rebase completed."))
    ], [
      { state: "idle", last_response_summary: "The branch main was not found." },
      { state: "idle", last_response_summary: "I could not rebase the branch.\n\nThe branch main was not found." },
      { state: "idle", last_response_summary: "The rebase completed." }
    ]);
  });
  test("does not narrate a summary for a cancelled turn", () => {
    const controller = createController(new TestVoiceClientService());
    const getAgentStateInfo = Reflect.get(controller, "_getAgentStateInfo");
    assert.deepStrictEqual(
      getAgentStateInfo.call(controller, completedResponseModel("Some partial work the user interrupted.", void 0, true)),
      { state: "idle" }
    );
  });
  test("does not finish connecting after voice instructions resolve for a stale attempt", async () => {
    const voiceClientService = new TestVoiceClientService();
    const micCaptureService = new RecordingMicCaptureService();
    const voiceInstructionsStarted = new DeferredPromise();
    const voiceInstructions = new DeferredPromise();
    const promptsService = new class extends mock() {
      getVoiceInstructions() {
        voiceInstructionsStarted.complete();
        return voiceInstructions.p;
      }
    }();
    const controller = createController(
      voiceClientService,
      void 0,
      void 0,
      void 0,
      micCaptureService,
      void 0,
      void 0,
      promptsService
    );
    await controller.connect(mainWindow);
    voiceClientService.fireConnectionState(true);
    await voiceInstructionsStarted.p;
    controller.disconnect();
    voiceInstructions.complete("Use Contoso DB.");
    await Promise.resolve();
    assert.deepStrictEqual({
      connected: controller.isConnected.get(),
      prepareCalls: micCaptureService.prepareCalls
    }, {
      connected: false,
      prepareCalls: 0
    });
  });
  test("warms hands-free capture before starting or resuming the backend session", async () => {
    const results = [];
    for (const command of ["start", "resume"]) {
      const voiceClientService = new TestVoiceClientService();
      voiceClientService.setResuming(command === "resume");
      const captureBarrier = new DeferredPromise();
      const micCaptureService = new RecordingMicCaptureService(captureBarrier.p);
      const controller = createController(
        voiceClientService,
        void 0,
        void 0,
        void 0,
        micCaptureService,
        new TestConfigurationService({ "agents.voice.handsFree": true })
      );
      await controller.connect(mainWindow);
      voiceClientService.fireConnectionState(true);
      await micCaptureService.captureStarted.p;
      const beforeWarmup = {
        prepareCalls: micCaptureService.prepareCalls,
        startCaptureCalls: micCaptureService.startCaptureCalls,
        stopCaptureCalls: micCaptureService.stopCaptureCalls,
        sessionCommands: [...voiceClientService.sessionCommands],
        socketConnected: voiceClientService.isConnected
      };
      captureBarrier.complete();
      await voiceClientService.sessionCommandSent.p;
      results.push({ command, beforeWarmup, afterWarmup: voiceClientService.sessionCommands });
    }
    assert.deepStrictEqual(results, [{
      command: "start",
      beforeWarmup: {
        prepareCalls: 1,
        startCaptureCalls: 1,
        stopCaptureCalls: 0,
        sessionCommands: [],
        socketConnected: true
      },
      afterWarmup: ["start"]
    }, {
      command: "resume",
      beforeWarmup: {
        prepareCalls: 1,
        startCaptureCalls: 1,
        stopCaptureCalls: 1,
        sessionCommands: [],
        socketConnected: true
      },
      afterWarmup: ["resume"]
    }]);
  });
  test("keeps microphone acquisition lazy when hands-free mode is disabled", async () => {
    const voiceClientService = new TestVoiceClientService();
    const micCaptureService = new RecordingMicCaptureService();
    const controller = createController(
      voiceClientService,
      void 0,
      void 0,
      void 0,
      micCaptureService,
      new TestConfigurationService({ "agents.voice.handsFree": false })
    );
    await controller.connect(mainWindow);
    voiceClientService.fireConnectionState(true);
    await voiceClientService.sessionCommandSent.p;
    assert.deepStrictEqual({
      prepareCalls: micCaptureService.prepareCalls,
      startCaptureCalls: micCaptureService.startCaptureCalls,
      sessionCommands: voiceClientService.sessionCommands
    }, {
      prepareCalls: 1,
      startCaptureCalls: 0,
      sessionCommands: ["start"]
    });
  });
  test("hands-free warm-up failure returns to idle and allows retry", async () => {
    const voiceClientService = new TestVoiceClientService();
    const resetObserved = new DeferredPromise();
    const micCaptureService = new class extends RecordingMicCaptureService {
      async startCapture() {
        this.startCaptureCalls++;
        if (this.startCaptureCalls === 1) {
          throw new Error("microphone unavailable");
        }
      }
    }();
    const controller = createController(
      voiceClientService,
      void 0,
      void 0,
      void 0,
      micCaptureService,
      new TestConfigurationService({ "agents.voice.handsFree": true }),
      void 0,
      void 0,
      void 0,
      new class extends VoiceTestNotificationService {
        notify(notification) {
          resetObserved.complete();
          return super.notify(notification);
        }
      }()
    );
    await controller.connect(mainWindow);
    voiceClientService.fireConnectionState(true);
    await resetObserved.p;
    await Promise.resolve();
    const afterFailure = {
      startCaptureCalls: micCaptureService.startCaptureCalls,
      stopCaptureCalls: micCaptureService.stopCaptureCalls,
      sessionCommands: [...voiceClientService.sessionCommands],
      connecting: controller.isConnecting.get(),
      connected: controller.isConnected.get(),
      status: controller.statusText.get()
    };
    await controller.connect(mainWindow);
    voiceClientService.fireConnectionState(true);
    await Promise.resolve();
    await Promise.resolve();
    assert.deepStrictEqual({
      afterFailure,
      startCaptureCalls: micCaptureService.startCaptureCalls,
      sessionCommands: voiceClientService.sessionCommands
    }, {
      afterFailure: {
        startCaptureCalls: 1,
        stopCaptureCalls: 1,
        sessionCommands: [],
        connecting: false,
        connected: false,
        status: "Tap to start"
      },
      startCaptureCalls: 2,
      sessionCommands: ["start"]
    });
  });
  test("hands-free permission denial does not add a generic connection notification", async () => {
    const voiceClientService = new TestVoiceClientService();
    const notificationService = new VoiceTestNotificationService();
    const permissionError = new Error("Permission denied");
    permissionError.name = "NotAllowedError";
    const micCaptureService = new class extends RecordingMicCaptureService {
      async startCapture() {
        this.startCaptureCalls++;
        throw permissionError;
      }
    }();
    const controller = createController(
      voiceClientService,
      void 0,
      void 0,
      void 0,
      micCaptureService,
      new TestConfigurationService({ "agents.voice.handsFree": true }),
      void 0,
      void 0,
      void 0,
      notificationService
    );
    await controller.connect(mainWindow);
    voiceClientService.fireConnectionState(true);
    await clock.tickAsync(0);
    assert.deepStrictEqual({
      startCaptureCalls: micCaptureService.startCaptureCalls,
      notifications: notificationService.notifications.map((notification) => notification.message),
      sessionCommands: voiceClientService.sessionCommands,
      connecting: controller.isConnecting.get(),
      connected: controller.isConnected.get(),
      status: controller.statusText.get()
    }, {
      startCaptureCalls: 1,
      notifications: [],
      sessionCommands: [],
      connecting: false,
      connected: false,
      status: "Tap to start"
    });
  });
  test("connect watchdog covers a stalled hands-free warm-up", async () => {
    const voiceClientService = new TestVoiceClientService();
    const captureBarrier = new DeferredPromise();
    const micCaptureService = new RecordingMicCaptureService(captureBarrier.p);
    const controller = createController(
      voiceClientService,
      void 0,
      void 0,
      void 0,
      micCaptureService,
      new TestConfigurationService({ "agents.voice.handsFree": true })
    );
    await controller.connect(mainWindow);
    voiceClientService.fireConnectionState(true);
    await micCaptureService.captureStarted.p;
    clock.tick(1e4);
    captureBarrier.complete();
    await Promise.resolve();
    assert.deepStrictEqual({
      stopCaptureCalls: micCaptureService.stopCaptureCalls,
      sessionCommands: voiceClientService.sessionCommands,
      connecting: controller.isConnecting.get(),
      connected: controller.isConnected.get(),
      status: controller.statusText.get()
    }, {
      stopCaptureCalls: 1,
      sessionCommands: [],
      connecting: false,
      connected: false,
      status: "Tap to start"
    });
  });
  test("clean socket close during acquisition aborts initialization and allows explicit retry", async () => {
    const voiceClientService = new TestVoiceClientService();
    const firstCaptureBarrier = new DeferredPromise();
    const micCaptureService = new RecordingMicCaptureService(firstCaptureBarrier.p);
    const controller = createController(
      voiceClientService,
      void 0,
      void 0,
      void 0,
      micCaptureService,
      new TestConfigurationService({ "agents.voice.handsFree": true })
    );
    await controller.connect(mainWindow);
    voiceClientService.fireConnectionState(true);
    await micCaptureService.captureStarted.p;
    voiceClientService.fireConnectionState(false);
    firstCaptureBarrier.complete();
    await Promise.resolve();
    const afterDrop = {
      startCaptureCalls: micCaptureService.startCaptureCalls,
      stopCaptureCalls: micCaptureService.stopCaptureCalls,
      sessionCommands: [...voiceClientService.sessionCommands],
      connected: controller.isConnected.get(),
      status: controller.statusText.get()
    };
    await controller.connect(mainWindow);
    voiceClientService.fireConnectionState(true);
    await voiceClientService.sessionCommandSent.p;
    assert.deepStrictEqual({
      afterDrop,
      afterRetry: {
        startCaptureCalls: micCaptureService.startCaptureCalls,
        stopCaptureCalls: micCaptureService.stopCaptureCalls,
        sessionCommands: voiceClientService.sessionCommands,
        connected: controller.isConnected.get()
      }
    }, {
      afterDrop: {
        startCaptureCalls: 1,
        stopCaptureCalls: 1,
        sessionCommands: [],
        connected: false,
        status: "Tap to start"
      },
      afterRetry: {
        startCaptureCalls: 2,
        stopCaptureCalls: 1,
        sessionCommands: ["start"],
        connected: true
      }
    });
  });
  test("transient socket drop during acquisition retries warm-up before starting the session", async () => {
    const voiceClientService = new TestVoiceClientService();
    const firstCaptureBarrier = new DeferredPromise();
    const micCaptureService = new RecordingMicCaptureService(firstCaptureBarrier.p);
    const controller = createController(
      voiceClientService,
      void 0,
      void 0,
      void 0,
      micCaptureService,
      new TestConfigurationService({ "agents.voice.handsFree": true })
    );
    await controller.connect(mainWindow);
    voiceClientService.fireConnectionState(true);
    await micCaptureService.captureStarted.p;
    voiceClientService.fireConnectionState(false, true);
    firstCaptureBarrier.complete();
    await Promise.resolve();
    const afterDrop = {
      connecting: controller.isConnecting.get(),
      reconnecting: controller.isReconnecting.get(),
      stopCaptureCalls: micCaptureService.stopCaptureCalls,
      sessionCommands: [...voiceClientService.sessionCommands],
      status: controller.statusText.get()
    };
    voiceClientService.fireConnectionState(true);
    await voiceClientService.sessionCommandSent.p;
    assert.deepStrictEqual({
      afterDrop,
      afterRetry: {
        startCaptureCalls: micCaptureService.startCaptureCalls,
        sessionCommands: voiceClientService.sessionCommands,
        connected: controller.isConnected.get()
      }
    }, {
      afterDrop: {
        connecting: false,
        reconnecting: true,
        stopCaptureCalls: 1,
        sessionCommands: [],
        status: "Reconnecting..."
      },
      afterRetry: {
        startCaptureCalls: 2,
        sessionCommands: ["start"],
        connected: true
      }
    });
  });
  test("narrates visible questionnaire prompts and choices immediately without internal ids", () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    const sessionResource = URI.parse("chat-session:/mars-questionnaire");
    const carousel = new ChatQuestionCarouselData([
      {
        id: "mars_feature_scope",
        type: "singleSelect",
        title: "mars_feature_scope",
        message: new MarkdownString("Which Mars features should the experience include?"),
        description: "Choose the main exploration scope.",
        options: [
          { id: "surface_only", label: "Surface explorer - Drive between landmarks", value: "surface_only" },
          { id: "science_missions", label: "Science missions - Collect samples and run experiments", value: "science_missions" }
        ]
      },
      {
        id: "mars_navigation_mode",
        type: "singleSelect",
        title: "mars_navigation_mode",
        message: "How should people navigate Mars?",
        options: [
          { id: "guided", label: "Guided route", value: "guided" },
          { id: "free_roam", label: "Free roam", value: "free_roam" }
        ]
      },
      {
        id: "mars_data_approach",
        type: "multiSelect",
        title: "mars_data_approach",
        message: "Which Mars data should be available?",
        options: [
          { id: "terrain", label: "Terrain maps", value: "terrain" },
          { id: "weather", label: "Weather readings", value: "weather" }
        ]
      },
      {
        id: "mars_rendering_style",
        type: "singleSelect",
        title: "mars_rendering_style",
        message: "What visual style should Mars use?",
        options: [
          { id: "realistic", label: "Photorealistic", value: "realistic" },
          { id: "illustrated", label: "Illustrated", value: "illustrated" }
        ],
        allowFreeformInput: true
      }
    ], true, "mars_internal_resolve_id", void 0, false, new MarkdownString("Help shape the Mars experience."));
    const model = pendingResponsePartModel(sessionResource, carousel, "questions: mars_feature_scope, mars_navigation_mode, mars_data_approach, mars_rendering_style");
    const getAgentStateInfo = Reflect.get(controller, "_getAgentStateInfo");
    const handleStateChange = Reflect.get(controller, "_handleNarratableStateChange");
    const isConnected = Reflect.get(controller, "_isConnected");
    const watchVoiceProgress = Reflect.get(controller, "_watchVoiceProgress");
    const progress = createVoiceProgressResponse("mars-progress");
    isConnected.set(true, void 0);
    controller.setActiveSessionShown(sessionResource);
    watchVoiceProgress.call(controller, sessionResource, progress.response);
    progress.parts.push({ kind: "voiceProgress", id: "editing", value: "Updating the Mars experience." });
    progress.changeEmitter.fire({ reason: "other" });
    const stateInfo = getAgentStateInfo.call(controller, model);
    handleStateChange.call(controller, sessionResource.toString(), stateInfo.state, stateInfo.detail, void 0, sessionResource.toString(), stateInfo.confirmation_type);
    const immediateRequestCount = voiceClientService.requests.length;
    clock.tick(5e3);
    assert.deepStrictEqual({
      stateInfo,
      immediateRequestCount,
      request: voiceClientService.requests.map((request) => ({ kind: request.kind, text: request.text, confirmationType: request.confirmationType })),
      containsInternalIds: ["mars_feature_scope", "mars_navigation_mode", "mars_data_approach", "mars_rendering_style", "surface_only", "free_roam"].some((id) => stateInfo.detail?.includes(id))
    }, {
      stateInfo: {
        state: "waiting_for_confirmation",
        confirmation_type: "questionnaire",
        detail: [
          "questionnaire: 4 questions",
          "context: Help shape the Mars experience.",
          "1. Which Mars features should the experience include?",
          "details: Choose the main exploration scope.",
          "options: Surface explorer - Drive between landmarks; Science missions - Collect samples and run experiments; a custom response is also available",
          "2. How should people navigate Mars?",
          "options: Guided route; Free roam; a custom response is also available",
          "3. Which Mars data should be available?",
          "options: Terrain maps; Weather readings; a custom response is also available",
          "4. What visual style should Mars use?",
          "options: Photorealistic; Illustrated; a custom response is also available",
          "The questionnaire is open in GitHub Copilot."
        ].join("\n")
      },
      immediateRequestCount: 1,
      request: [{
        kind: "confirmation",
        confirmationType: "questionnaire",
        text: [
          "questionnaire: 4 questions",
          "context: Help shape the Mars experience.",
          "1. Which Mars features should the experience include?",
          "details: Choose the main exploration scope.",
          "options: Surface explorer - Drive between landmarks; Science missions - Collect samples and run experiments; a custom response is also available",
          "2. How should people navigate Mars?",
          "options: Guided route; Free roam; a custom response is also available",
          "3. Which Mars data should be available?",
          "options: Terrain maps; Weather readings; a custom response is also available",
          "4. What visual style should Mars use?",
          "options: Photorealistic; Illustrated; a custom response is also available",
          "The questionnaire is open in GitHub Copilot."
        ].join("\n")
      }],
      containsInternalIds: false
    });
  });
  test("extracts visible runtime askQuestions data before carousel persistence", () => {
    const voiceClientService = new TestVoiceClientService();
    const chatService = new ControllableChatService();
    const controller = createController(voiceClientService, void 0, void 0, void 0, void 0, void 0, chatService);
    const sessionResource = URI.parse("chat-session:/runtime-mars-questionnaire");
    const rawQuestions = [
      {
        header: "mars_scope",
        question: "What's the scope for Mars integration?",
        message: "This optional detail appears only after the carousel is appended.",
        options: [
          { label: "Full parallel system", description: "Mars as a complete alternative view with its own layers, data, and panels (like a separate mode)" },
          { label: "Comparison view", description: "Earth and Mars side-by-side for comparison purposes" },
          { label: "Solar system integration", description: "Mars as part of an expandable planetary system (Earth, Mars, potentially others)" },
          { label: "Just 3D Mars visualization", description: "Focus on rendering Mars with minimal data layers for now" }
        ]
      },
      {
        header: "mars_data",
        question: "What data should Mars display?",
        options: [
          { label: "Rovers & missions", description: "Show NASA/international rovers, landing sites, and active missions" },
          { label: "Geological features", description: "Volcanoes, canyons, polar caps, water ice deposits" },
          { label: "Real-time data", description: "Current rover telemetry, atmospheric data, dust storms" },
          { label: "Habitability layers", description: "Radiation, temperature, water availability zones" },
          { label: "All of the above", description: "Full comprehensive Mars visualization" }
        ],
        multiSelect: true
      },
      {
        header: "mars_textures",
        question: "How should Mars be textured?",
        options: [
          { label: "Procedurally generated (like Earth)", description: "Canvas-based procedural generation matching current Earth approach" },
          { label: "Real NASA imagery", description: "Use actual Mars satellite imagery (requires downloading/hosting image files)" },
          { label: "Simplified stylized", description: "Simple color palette (red/orange) like a simplified Earth" }
        ]
      },
      {
        header: "mars_timeline",
        question: "Should Mars have historical/future data?",
        options: [
          { label: "Current only", description: "Show current rovers and active missions" },
          { label: "Historical missions", description: "Include past rovers (Spirit, Opportunity, etc.) and historical landing sites" },
          { label: "Future missions", description: "Include planned future missions and colonization zones" },
          { label: "All timeframes", description: "Full timeline from first landing to future missions" }
        ]
      }
    ];
    const backingTool = new class extends mock() {
      constructor() {
        super(...arguments);
        this.kind = "toolInvocation";
        this.toolId = AskQuestionsToolId;
        this.toolCallId = "toolu_runtime";
        this.invocationMessage = "Asked 4 questions (mars_scope, mars_data, mars_textures, mars_timeline)";
        this.state = observableValue("toolState", {
          type: IChatToolInvocation.StateKind.WaitingForConfirmation,
          parameters: { questions: rawQuestions },
          confirmationMessages: void 0,
          confirm: () => {
          }
        });
      }
    }();
    const parts = [backingTool];
    const pendingConfirmation = observableValue("pending", { detail: "Asked 4 questions" });
    const response = {
      isPendingConfirmation: pendingConfirmation,
      isIncomplete: observableValue("incomplete", false),
      response: { value: parts, getMarkdown: () => "" }
    };
    const lastRequest = { id: "request-runtime-questionnaire", response };
    const model = {
      sessionResource,
      title: "Chat",
      lastMessageDate: Date.now(),
      getRequests: () => [lastRequest],
      lastRequestObs: observableValue("lastRequest", lastRequest)
    };
    const getAgentStateInfo = Reflect.get(controller, "_getAgentStateInfo");
    const checkSessionStateChanges = Reflect.get(controller, "_checkSessionStateChanges");
    const previousStates = Reflect.get(controller, "_prevSessionStates");
    controller.setActiveSessionShown(sessionResource);
    chatService.setModels([model]);
    previousStates.set(sessionResource.toString(), { state: "thinking", detail: "", lastResponseSummary: "" });
    const pendingInfo = getAgentStateInfo.call(controller, model);
    checkSessionStateChanges.call(controller);
    const requestsBeforeCarousel = voiceClientService.requests.length;
    const narrationBeforeCarousel = voiceClientService.requests.at(-1);
    const runtimeCarousel = new ChatQuestionCarouselData(rawQuestions.map((question, index) => ({
      id: `toolu_runtime:${index}`,
      type: question.multiSelect ? "multiSelect" : "singleSelect",
      title: question.header,
      message: question.question,
      detailedMessage: question.message,
      options: question.options.map((option) => ({
        id: option.label,
        label: `${option.label} - ${option.description}`,
        value: option.label
      })),
      allowFreeformInput: true
    })), true, "toolu_runtime");
    parts.push(runtimeCarousel);
    checkSessionStateChanges.call(controller);
    const requestsAfterCarousel = voiceClientService.requests.length;
    const narrationAfterCarousel = voiceClientService.requests.at(-1);
    assert.deepStrictEqual({
      pendingState: pendingInfo.state,
      pendingType: pendingInfo.confirmation_type,
      pendingHasVisibleDetail: pendingInfo.detail?.startsWith("questionnaire: 4 questions"),
      requestsBeforeCarousel,
      requestsAfterCarousel,
      initialNarrationKind: narrationBeforeCarousel?.kind,
      initialNarrationType: narrationBeforeCarousel?.confirmationType,
      initialHasQuestionCount: narrationBeforeCarousel?.text.startsWith("questionnaire: 4 questions"),
      initialHasFirstPrompt: narrationBeforeCarousel?.text.includes("1. What's the scope for Mars integration?"),
      initialHasLastPrompt: narrationBeforeCarousel?.text.includes("4. Should Mars have historical/future data?"),
      followupNarrationKind: narrationAfterCarousel?.kind,
      followupHasVisibleOptionDescription: narrationAfterCarousel?.text.includes("Full parallel system - Mars as a complete alternative view"),
      includesLateDetails: narrationAfterCarousel?.text.includes("This optional detail appears only after the carousel is appended."),
      usedFallback: narrationBeforeCarousel?.text === "I need your input in the open questionnaire.",
      containsHiddenIds: ["mars_scope", "mars_data", "mars_textures", "mars_timeline", "toolu_runtime"].some((value) => narrationBeforeCarousel?.text.includes(value) || narrationAfterCarousel?.text.includes(value))
    }, {
      pendingState: "waiting_for_confirmation",
      pendingType: "questionnaire",
      pendingHasVisibleDetail: true,
      requestsBeforeCarousel: 1,
      requestsAfterCarousel: 2,
      initialNarrationKind: "confirmation",
      initialNarrationType: "questionnaire",
      initialHasQuestionCount: true,
      initialHasFirstPrompt: true,
      initialHasLastPrompt: true,
      followupNarrationKind: "question",
      followupHasVisibleOptionDescription: true,
      includesLateDetails: false,
      usedFallback: false,
      containsHiddenIds: false
    });
  });
  test("defers runtime askQuestions narration until visible parameters populate", () => {
    const voiceClientService = new TestVoiceClientService();
    const chatService = new ControllableChatService();
    const controller = createController(voiceClientService, void 0, void 0, void 0, void 0, void 0, chatService);
    const sessionResource = URI.parse("chat-session:/late-runtime-questionnaire");
    const toolState = observableValue("toolState", {
      type: IChatToolInvocation.StateKind.WaitingForConfirmation,
      parameters: { questions: [] },
      confirmationMessages: void 0,
      confirm: () => {
      }
    });
    const backingTool = new class extends mock() {
      constructor() {
        super(...arguments);
        this.kind = "toolInvocation";
        this.toolId = AskQuestionsToolId;
        this.invocationMessage = "Asking a clarifying question";
        this.state = toolState;
      }
    }();
    const pendingConfirmation = observableValue("pending", { detail: "Asking a clarifying question" });
    const response = {
      isPendingConfirmation: pendingConfirmation,
      isIncomplete: observableValue("incomplete", false),
      response: { value: [backingTool], getMarkdown: () => "" }
    };
    const lastRequest = { id: "request-late-questionnaire", response };
    const model = {
      sessionResource,
      title: "Chat",
      lastMessageDate: Date.now(),
      getRequests: () => [lastRequest],
      lastRequestObs: observableValue("lastRequest", lastRequest)
    };
    const getAgentStateInfo = Reflect.get(controller, "_getAgentStateInfo");
    const checkSessionStateChanges = Reflect.get(controller, "_checkSessionStateChanges");
    const previousStates = Reflect.get(controller, "_prevSessionStates");
    controller.setActiveSessionShown(sessionResource);
    chatService.setModels([model]);
    previousStates.set(sessionResource.toString(), { state: "thinking", detail: "", lastResponseSummary: "" });
    const pendingInfo = getAgentStateInfo.call(controller, model);
    checkSessionStateChanges.call(controller);
    const requestsBeforePopulation = voiceClientService.requests.length;
    toolState.set({
      type: IChatToolInvocation.StateKind.WaitingForConfirmation,
      parameters: {
        questions: [{
          header: "internal_scope",
          question: "Which Mars scope should GitHub Copilot use?",
          options: [{
            label: "Comparison view",
            description: "Show Earth and Mars side-by-side",
            value: "hidden-value"
          }],
          recommended: true
        }]
      },
      confirmationMessages: void 0,
      confirm: () => {
      }
    }, void 0);
    checkSessionStateChanges.call(controller);
    const narration = voiceClientService.requests.at(-1);
    assert.deepStrictEqual({
      pendingInfo,
      requestsBeforePopulation,
      narration: narration ? {
        kind: narration.kind,
        confirmationType: narration.confirmationType,
        text: narration.text
      } : void 0,
      containsHiddenMetadata: ["internal_scope", "hidden-value", "recommended"].some((value) => narration?.text.includes(value))
    }, {
      pendingInfo: {
        state: "waiting_for_confirmation",
        confirmation_type: "questionnaire"
      },
      requestsBeforePopulation: 0,
      narration: {
        kind: "confirmation",
        confirmationType: "questionnaire",
        text: [
          "questionnaire: 1 question",
          "1. Which Mars scope should GitHub Copilot use?",
          "options: Comparison view - Show Earth and Mars side-by-side; a custom response is also available",
          "The questionnaire is open in GitHub Copilot."
        ].join("\n")
      },
      containsHiddenMetadata: false
    });
  });
  test("carries questionnaire type in session context and clears it when resolved", () => {
    const chatService = new ControllableChatService();
    const controller = createController(new TestVoiceClientService(), void 0, void 0, void 0, void 0, void 0, chatService);
    const sessionResource = URI.parse("chat-session:/durable-questionnaire");
    const carousel = new ChatQuestionCarouselData([{
      id: "hidden-question-id",
      type: "singleSelect",
      title: "Hidden title key",
      message: "Which deployment should GitHub Copilot use?",
      options: [{ id: "hidden-option-id", label: "Preview deployment", value: "hidden-option-value" }]
    }], true);
    const pendingConfirmation = observableValue("pending", { detail: "Needs approval" });
    const response = {
      isPendingConfirmation: pendingConfirmation,
      isIncomplete: observableValue("incomplete", false),
      response: { value: [carousel], getMarkdown: () => "" }
    };
    const lastRequest = { id: "request-questionnaire", response };
    const model = {
      sessionResource,
      title: "Chat",
      lastMessageDate: Date.now(),
      getRequests: () => [lastRequest],
      lastRequestObs: observableValue("lastRequest", lastRequest)
    };
    const buildSessionContext = Reflect.get(controller, "_buildSessionContext");
    controller.setActiveSessionShown(sessionResource);
    chatService.setModels([model]);
    const pendingContext = buildSessionContext.call(controller).sessions[0];
    carousel.isUsed = true;
    carousel.isUsed = true;
    pendingConfirmation.set(void 0, void 0);
    const resolvedContext = buildSessionContext.call(controller).sessions[0];
    const pending = pendingContext?.["pending"];
    assert.deepStrictEqual({
      pendingContext: pendingContext ? {
        id: pendingContext["id"],
        is_active: pendingContext["is_active"],
        agent_state: pendingContext["agent_state"],
        agent_state_detail: pendingContext["agent_state_detail"],
        confirmation_type: pendingContext["confirmation_type"],
        pending: pending ? {
          type: pending["type"],
          request_id: pending["request_id"],
          pendingIdMatchesRequest: typeof pending["pending_id"] === "string" && pending["pending_id"].startsWith("request-questionnaire#"),
          allow_skip: pending["allow_skip"],
          questions: pending["questions"]
        } : void 0
      } : void 0,
      resolvedContext
    }, {
      pendingContext: {
        id: sessionResource.toString(),
        is_active: true,
        agent_state: "waiting_for_confirmation",
        agent_state_detail: [
          "questionnaire: 1 question",
          "1. Which deployment should GitHub Copilot use?",
          "options: Preview deployment; a custom response is also available",
          "The questionnaire is open in GitHub Copilot."
        ].join("\n"),
        confirmation_type: "questionnaire",
        pending: {
          type: "questions",
          request_id: "request-questionnaire",
          pendingIdMatchesRequest: true,
          allow_skip: true,
          questions: [{
            id: "hidden-question-id",
            type: "singleSelect",
            title: "Which deployment should GitHub Copilot use?",
            allow_freeform: true,
            options: [{ label: "Preview deployment", value: "hidden-option-value" }]
          }]
        }
      },
      resolvedContext: {
        id: sessionResource.toString(),
        label: "Chat",
        is_active: true,
        agent_state: "idle"
      }
    });
  });
  test("routes structured pending responses to the same action that is narrated", () => {
    const chatService = new ControllableChatService();
    const controller = createController(new TestVoiceClientService(), void 0, void 0, void 0, void 0, void 0, chatService);
    const buildSessionContext = Reflect.get(controller, "_buildSessionContext");
    const waitingTool = (id, postApproval = false) => new class extends mock() {
      constructor() {
        super(...arguments);
        this.kind = "toolInvocation";
        this.toolId = id;
        this.invocationMessage = `Run ${id}`;
        this.state = observableValue(`${id}State`, postApproval ? {
          type: IChatToolInvocation.StateKind.WaitingForPostApproval,
          parameters: {},
          confirmationMessages: { title: `Approve ${id}?`, message: `Review ${id}.` },
          confirmed: { type: ToolConfirmKind.UserAction },
          resultDetails: void 0,
          confirm: () => {
          },
          contentForModel: []
        } : {
          type: IChatToolInvocation.StateKind.WaitingForConfirmation,
          parameters: {},
          confirmationMessages: { title: `Approve ${id}?`, message: `Review ${id}.` },
          confirm: () => {
          }
        });
      }
    }();
    const pendingFor = (resource, requestId, parts) => {
      const response = {
        isPendingConfirmation: observableValue(`${requestId}Pending`, { detail: "Needs input" }),
        isIncomplete: observableValue(`${requestId}Incomplete`, false),
        response: { value: parts, getMarkdown: () => "" }
      };
      const lastRequest = { id: requestId, response };
      const model = {
        sessionResource: resource,
        title: "Chat",
        lastMessageDate: Date.now(),
        getRequests: () => [lastRequest],
        lastRequestObs: observableValue(`${requestId}LastRequest`, lastRequest)
      };
      controller.setActiveSessionShown(resource);
      chatService.setModels([model]);
      return buildSessionContext.call(controller).sessions[0]?.pending;
    };
    const questionnaire = new ChatQuestionCarouselData([{
      id: "region",
      type: "singleSelect",
      title: "Region",
      message: "Which region?",
      options: [{ id: "west", label: "West US", value: "westus" }]
    }], true);
    const unrelatedTool = waitingTool("unrelated");
    const questionnairePending = pendingFor(URI.parse("chat-session:/questionnaire-route"), "request-questionnaire-route", [questionnaire, unrelatedTool]);
    const plan = new ChatPlanReviewData("Review plan", "Plan body", [{ id: "implement", label: "Implement Plan" }], true);
    const olderTool = waitingTool("older");
    const planPending = pendingFor(URI.parse("chat-session:/plan-route"), "request-plan-route", [olderTool, plan]);
    const postApprovalTool = waitingTool("post-approval", true);
    const postApprovalPending = pendingFor(URI.parse("chat-session:/post-route"), "request-post-route", [postApprovalTool]);
    const askQuestionsTool = waitingTool(AskQuestionsToolId);
    const olderQuestionnaire = new ChatQuestionCarouselData([{
      id: "older-region",
      type: "singleSelect",
      title: "Older region",
      message: "Which older region?",
      options: [{ id: "east", label: "East US", value: "eastus" }]
    }], true);
    const askQuestionsPending = pendingFor(URI.parse("chat-session:/ask-route"), "request-ask-route", [olderQuestionnaire, askQuestionsTool]);
    assert.deepStrictEqual({
      questionnaire: {
        type: questionnairePending?.type,
        idMatches: questionnairePending?.pending_id === peekPendingId("request-questionnaire-route", questionnaire)
      },
      plan: {
        type: planPending?.type,
        idMatches: planPending?.pending_id === peekPendingId("request-plan-route", olderTool)
      },
      postApproval: {
        type: postApprovalPending?.type,
        idMatches: postApprovalPending?.pending_id === peekPendingId("request-post-route", postApprovalTool)
      },
      askQuestionsBeforeCarousel: {
        type: askQuestionsPending?.type,
        idMatches: askQuestionsPending?.pending_id === peekPendingId("request-ask-route", olderQuestionnaire)
      }
    }, {
      questionnaire: { type: "questions", idMatches: true },
      plan: { type: "approval", idMatches: true },
      postApproval: { type: "approval", idMatches: true },
      askQuestionsBeforeCarousel: { type: "questions", idMatches: true }
    });
  });
  test("flushes exact typed context before fresh and changed confirmation narration", () => {
    const scenarios = [
      {
        name: "fresh-generic",
        part: {
          kind: "confirmation",
          title: "Install extensions?",
          message: "Review the visible extension approval.",
          data: {}
        },
        fromState: "thinking",
        fromDetail: "",
        expectedType: "generic",
        expectedDetail: [
          "confirmation: Install extensions?",
          "Review the visible extension approval."
        ].join("\n")
      },
      {
        name: "plan-to-generic",
        part: {
          kind: "confirmation",
          title: "Confirm the revised plan?",
          message: "Review the revised plan confirmation.",
          data: {}
        },
        fromState: "waiting_for_confirmation",
        fromDetail: [
          "plan approval: Review the implementation plan",
          "choices: Implement Plan",
          "The plan is open in GitHub Copilot."
        ].join("\n"),
        fromType: "plan",
        expectedType: "generic",
        expectedDetail: [
          "confirmation: Confirm the revised plan?",
          "Review the revised plan confirmation."
        ].join("\n")
      },
      {
        name: "detail-change",
        part: {
          kind: "confirmation",
          title: "Approve the updated extension set?",
          message: "Review the updated visible extension approval.",
          data: {}
        },
        fromState: "waiting_for_confirmation",
        fromDetail: "confirmation: Approve the old extension set?",
        fromType: "generic",
        expectedType: "generic",
        expectedDetail: [
          "confirmation: Approve the updated extension set?",
          "Review the updated visible extension approval."
        ].join("\n")
      }
    ];
    const results = [];
    for (const scenario of scenarios) {
      const voiceClientService = new TestVoiceClientService();
      const chatService = new ControllableChatService();
      const controller = createController(voiceClientService, void 0, void 0, void 0, void 0, void 0, chatService);
      const sessionResource = URI.parse(`chat-session:/${scenario.name}`);
      const model = pendingResponsePartModel(sessionResource, scenario.part);
      const getAgentStateInfo = Reflect.get(controller, "_getAgentStateInfo");
      const pendingChanges = Reflect.get(controller, "_pendingStateChanges");
      const emitPendingStateChanges = Reflect.get(controller, "_emitPendingStateChanges");
      const pendingIdFor = Reflect.get(controller, "_pendingIdFor");
      controller.setActiveSessionShown(sessionResource);
      chatService.setModels([model]);
      voiceClientService.wireEvents.length = 0;
      const stateInfo = getAgentStateInfo.call(controller, model);
      pendingChanges.set(sessionResource.toString(), {
        sessionId: sessionResource.toString(),
        currentState: stateInfo.state,
        label: "Chat",
        detail: stateInfo.detail,
        confirmationType: stateInfo.confirmation_type,
        fromState: scenario.fromState,
        fromDetail: scenario.fromDetail,
        fromConfirmationType: scenario.fromType,
        fromResponseSummary: "",
        pendingId: pendingIdFor.call(controller, sessionResource.toString()),
        fromPendingId: ""
      });
      emitPendingStateChanges.call(controller);
      const requestIndex = voiceClientService.wireEvents.findIndex((event) => event.type === "request_narration");
      const contextEvents = voiceClientService.wireEvents.slice(0, requestIndex).filter((event) => event.type === "session_context");
      const contextSession = contextEvents.at(-1)?.context.sessions.find((session) => session.id === sessionResource.toString());
      const request = voiceClientService.wireEvents[requestIndex];
      results.push({
        name: scenario.name,
        contextBeforeRequest: requestIndex > 0 && contextEvents.length > 0,
        contextSession,
        request: request?.type === "request_narration" ? request : void 0
      });
    }
    assert.deepStrictEqual(results.map((result) => ({
      name: result.name,
      contextBeforeRequest: result.contextBeforeRequest,
      contextState: result.contextSession?.["agent_state"],
      contextDetail: result.contextSession?.["agent_state_detail"],
      contextType: result.contextSession?.["confirmation_type"],
      request: result.request
    })), scenarios.map((scenario) => ({
      name: scenario.name,
      contextBeforeRequest: true,
      contextState: "waiting_for_confirmation",
      contextDetail: scenario.expectedDetail,
      contextType: scenario.expectedType,
      request: {
        type: "request_narration",
        kind: "confirmation",
        text: scenario.expectedDetail,
        confirmationType: scenario.expectedType
      }
    })));
  });
  test("same confirmation text with a new type is not deduplicated", async () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    const sessionId = "chat-session:/typed-confirmation-dedup";
    const narrate = Reflect.get(controller, "_narrate");
    await controller.connect(mainWindow);
    const questionnaireSent = narrate.call(controller, sessionId, "confirmation", "I need your input.", void 0, void 0, "questionnaire");
    const duplicateQuestionnaireSent = narrate.call(controller, sessionId, "confirmation", "I need your input.", void 0, void 0, "questionnaire");
    const planSent = narrate.call(controller, sessionId, "confirmation", "I need your input.", void 0, void 0, "plan");
    assert.deepStrictEqual({
      questionnaireSent,
      duplicateQuestionnaireSent,
      planSent,
      types: voiceClientService.requests.map((request) => request.confirmationType)
    }, {
      questionnaireSent: true,
      duplicateQuestionnaireSent: false,
      planSent: true,
      types: ["questionnaire", "plan"]
    });
  });
  test("reconnect replays only confirmations matching current text and type", async () => {
    const cases = [
      {
        name: "generic-to-plan",
        pending: { kind: "confirmation", text: "Review this item.", confirmationType: "generic" },
        current: { kind: "confirmation", text: "Review this item.", confirmationType: "plan" }
      },
      {
        name: "generic-to-idle",
        pending: { kind: "confirmation", text: "Review this item.", confirmationType: "generic" },
        current: { kind: "response", text: "Done." }
      },
      {
        name: "legacy-to-generic",
        pending: { kind: "confirmation", text: "Review this item." },
        current: { kind: "confirmation", text: "Review this item.", confirmationType: "generic" }
      },
      {
        name: "matching-generic",
        pending: { kind: "confirmation", text: "Review this item.", confirmationType: "generic" },
        current: { kind: "confirmation", text: "Review this item.", confirmationType: "generic" }
      },
      {
        name: "matching-legacy",
        pending: { kind: "confirmation", text: "Legacy confirmation." },
        current: { kind: "confirmation", text: "Legacy confirmation." }
      },
      {
        name: "response-conflicts-with-generic",
        pending: { kind: "response", text: "Old final response." },
        current: { kind: "confirmation", text: "Current confirmation.", confirmationType: "generic" }
      },
      {
        name: "response-summary-changed",
        pending: { kind: "response", text: "Old final response." },
        current: { kind: "response", text: "New final response." }
      },
      {
        name: "matching-response",
        pending: { kind: "response", text: "Final response." },
        current: { kind: "response", text: "Final response." }
      }
    ];
    const results = [];
    for (const testCase of cases) {
      const voiceClientService = new TestVoiceClientService();
      const controller = createController(voiceClientService);
      const sessionId = `chat-session:/${testCase.name}`;
      await controller.connect(mainWindow);
      const retries = Reflect.get(controller, "_pendingNarrationRetries");
      retries.set(sessionId, testCase.pending);
      Reflect.set(controller, "_currentNarratable", () => testCase.current);
      controller.setActiveSessionShown(URI.parse(sessionId));
      voiceClientService.fireSessionInit();
      results.push({
        name: testCase.name,
        requests: voiceClientService.requests.map((request) => ({
          kind: request.kind,
          text: request.text,
          ...request.confirmationType ? { confirmationType: request.confirmationType } : {}
        }))
      });
    }
    assert.deepStrictEqual(results, [
      { name: "generic-to-plan", requests: [] },
      { name: "generic-to-idle", requests: [] },
      { name: "legacy-to-generic", requests: [] },
      { name: "matching-generic", requests: [{ kind: "confirmation", text: "Review this item.", confirmationType: "generic" }] },
      { name: "matching-legacy", requests: [{ kind: "confirmation", text: "Legacy confirmation." }] },
      { name: "response-conflicts-with-generic", requests: [] },
      { name: "response-summary-changed", requests: [] },
      { name: "matching-response", requests: [{ kind: "response", text: "Final response." }] }
    ]);
  });
  test("busy confirmation retries only when current text and type still match", () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    const sessionId = "chat-session:/deferred-confirmation";
    const sessionKey = Reflect.get(controller, "_sessionKey").call(controller, sessionId);
    const deferred = Reflect.get(controller, "_deferredNarrations");
    const retry = Reflect.get(controller, "_retryDeferredNarration");
    controller.setActiveSessionShown(URI.parse(sessionId));
    deferred.set(sessionKey, {
      narrationId: "stale-type",
      kind: "confirmation",
      text: "Review this item.",
      reuseNarrationId: true,
      confirmationType: "generic"
    });
    Reflect.set(controller, "_currentNarratable", () => ({ kind: "confirmation", text: "Review this item.", confirmationType: "plan" }));
    const staleTypeRetried = retry.call(controller, sessionKey);
    deferred.set(sessionKey, {
      narrationId: "stale-text",
      kind: "confirmation",
      text: "Old detail.",
      reuseNarrationId: true,
      confirmationType: "generic"
    });
    Reflect.set(controller, "_currentNarratable", () => ({ kind: "confirmation", text: "New detail.", confirmationType: "generic" }));
    const staleTextRetried = retry.call(controller, sessionKey);
    deferred.set(sessionKey, {
      narrationId: "matching",
      kind: "confirmation",
      text: "Current detail.",
      reuseNarrationId: true,
      confirmationType: "generic"
    });
    Reflect.set(controller, "_currentNarratable", () => ({ kind: "confirmation", text: "Current detail.", confirmationType: "generic" }));
    const matchingRetried = retry.call(controller, sessionKey);
    assert.deepStrictEqual({
      staleTypeRetried,
      staleTextRetried,
      matchingRetried,
      requests: voiceClientService.requests.map((request) => ({
        narrationId: request.narrationId,
        text: request.text,
        confirmationType: request.confirmationType
      })),
      deferredCount: deferred.size
    }, {
      staleTypeRetried: false,
      staleTextRetried: false,
      matchingRetried: true,
      requests: [{
        narrationId: "matching",
        text: "Current detail.",
        confirmationType: "generic"
      }],
      deferredCount: 0
    });
  });
  test("auto-approve ignores questionnaire backing tools", () => {
    const controller = createController(new TestVoiceClientService());
    const confirmed = [];
    const toolInvocation = new class extends mock() {
      constructor() {
        super(...arguments);
        this.kind = "toolInvocation";
        this.state = observableValue("toolState", {
          type: IChatToolInvocation.StateKind.WaitingForConfirmation,
          parameters: {},
          confirmationMessages: {
            title: "Submit questionnaire?",
            message: "Submits the questionnaire answers."
          },
          confirm: (reason) => confirmed.push(reason.type)
        });
        this.invocationMessage = "Submit questionnaire";
      }
    }();
    const questionnaire = new ChatQuestionCarouselData([{
      id: "hidden-question-id",
      type: "singleSelect",
      title: "Choose an option",
      options: [{ id: "hidden-option-id", label: "Visible option", value: "hidden-value" }]
    }], true);
    const pendingConfirmation = observableValue("pending", { detail: "Needs input" });
    const modelWithQuestionnaire = {
      getRequests: () => [{
        response: {
          isPendingConfirmation: pendingConfirmation,
          response: { value: [toolInvocation, questionnaire] }
        }
      }]
    };
    const modelWithTool = {
      getRequests: () => [{
        response: {
          isPendingConfirmation: pendingConfirmation,
          response: { value: [toolInvocation] }
        }
      }]
    };
    const autoApprovePendingTools = Reflect.get(controller, "_autoApprovePendingTools");
    autoApprovePendingTools.call(controller, modelWithQuestionnaire);
    autoApprovePendingTools.call(controller, modelWithTool);
    assert.deepStrictEqual(confirmed, [ToolConfirmKind.UserAction]);
  });
  test("handles freeform and defers empty questionnaire data", () => {
    const controller = createController(new TestVoiceClientService());
    const getAgentStateInfo = Reflect.get(controller, "_getAgentStateInfo");
    const freeform = new ChatQuestionCarouselData([{
      id: "internal_name_key",
      type: "text",
      title: "internal_name_key",
      message: "What should we call the Mars explorer?"
    }], false);
    const missing = new ChatQuestionCarouselData([], true, "hidden_resolve_id");
    const internalTitleOnly = new ChatQuestionCarouselData([{
      id: "internal_prompt_key",
      type: "text",
      title: "internal_prompt_key"
    }], true);
    const noCustomOption = new ChatQuestionCarouselData([{
      id: "navigation",
      type: "singleSelect",
      title: "Navigation",
      message: "Choose a navigation mode.",
      options: [{ id: "guided", label: "Guided route", value: "guided" }],
      allowFreeformInput: false
    }], true);
    assert.deepStrictEqual([
      getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse("chat-session:/freeform"), freeform, void 0, false)),
      getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse("chat-session:/missing"), missing, void 0, false)),
      getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse("chat-session:/internal-title"), internalTitleOnly, void 0, false)),
      getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse("chat-session:/no-custom"), noCustomOption, void 0, false))
    ], [
      {
        state: "waiting_for_confirmation",
        confirmation_type: "questionnaire",
        detail: [
          "questionnaire: 1 question",
          "1. What should we call the Mars explorer?",
          "response: enter a free-form answer in GitHub Copilot",
          "The questionnaire is open in GitHub Copilot."
        ].join("\n")
      },
      {
        state: "waiting_for_confirmation",
        confirmation_type: "questionnaire"
      },
      {
        state: "waiting_for_confirmation",
        confirmation_type: "questionnaire",
        detail: [
          "questionnaire: 1 question",
          "1. I need your input in the open questionnaire.",
          "response: enter a free-form answer in GitHub Copilot",
          "The questionnaire is open in GitHub Copilot."
        ].join("\n")
      },
      {
        state: "waiting_for_confirmation",
        confirmation_type: "questionnaire",
        detail: [
          "questionnaire: 1 question",
          "1. Choose a navigation mode.",
          "options: Guided route",
          "The questionnaire is open in GitHub Copilot."
        ].join("\n")
      }
    ]);
  });
  test("bounds questionnaire questions and options with omission counts", () => {
    const controller = createController(new TestVoiceClientService());
    const getAgentStateInfo = Reflect.get(controller, "_getAgentStateInfo");
    const carousel = new ChatQuestionCarouselData(Array.from({ length: 8 }, (_, questionIndex) => ({
      id: `internal_question_${questionIndex}`,
      type: "singleSelect",
      title: `Internal question ${questionIndex}`,
      message: `Visible question ${questionIndex + 1}?`,
      options: Array.from({ length: 8 }, (_2, optionIndex) => ({
        id: `internal_option_${questionIndex}_${optionIndex}`,
        label: `Visible option ${optionIndex + 1}`,
        value: `hidden_value_${optionIndex}`
      }))
    })), true);
    const detail = getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse("chat-session:/bounded"), carousel)).detail ?? "";
    assert.deepStrictEqual({
      withinLimit: detail.length <= 2400,
      includesOptionOmission: detail.includes("3 more options"),
      includesQuestionOmission: detail.includes("2 more questions are open in GitHub Copilot."),
      containsInternalIds: detail.includes("internal_question_") || detail.includes("internal_option_") || detail.includes("hidden_value_")
    }, {
      withinLimit: true,
      includesOptionOmission: true,
      includesQuestionOmission: true,
      containsInternalIds: false
    });
  });
  test("distinguishes plan, elicitation, and tool approval using visible text", () => {
    const controller = createController(new TestVoiceClientService());
    const getAgentStateInfo = Reflect.get(controller, "_getAgentStateInfo");
    const plan = new ChatPlanReviewData("Review the Mars implementation plan", "# Hidden plan body", [
      { id: "internal_implement", label: "Implement Plan", description: "Start making the changes" },
      { id: "internal_autopilot", label: "Continue in Autopilot", description: "Proceed automatically" }
    ], true, void 0, "internal_plan_resolve_id");
    const elicitation = new ChatElicitationRequestPart(
      new MarkdownString("Choose a deployment target"),
      "Select where GitHub Copilot should deploy the preview.",
      "Your choice is required before continuing.",
      "Continue",
      "Cancel",
      async () => ElicitationState.Accepted
    );
    const confirmation = {
      kind: "confirmation",
      title: "Install recommended extensions?",
      message: new MarkdownString("This installs the extensions shown in the open approval."),
      buttons: ["Install", "Cancel"],
      data: { hiddenInternalId: "extension_install" }
    };
    assert.deepStrictEqual([
      getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse("chat-session:/plan"), plan)),
      getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse("chat-session:/elicitation"), elicitation)),
      getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse("chat-session:/confirmation"), confirmation))
    ], [
      {
        state: "waiting_for_confirmation",
        confirmation_type: "plan",
        detail: [
          "plan approval: Review the Mars implementation plan",
          "choices: Implement Plan - Start making the changes; Continue in Autopilot - Proceed automatically",
          "The plan is open in GitHub Copilot."
        ].join("\n")
      },
      {
        state: "waiting_for_confirmation",
        confirmation_type: "elicitation",
        detail: [
          "input request: Choose a deployment target",
          "Your choice is required before continuing.",
          "Select where GitHub Copilot should deploy the preview.",
          "choices: Continue; Cancel"
        ].join("\n")
      },
      {
        state: "waiting_for_confirmation",
        confirmation_type: "generic",
        detail: [
          "confirmation: Install recommended extensions?",
          "This installs the extensions shown in the open approval.",
          "choices: Install; Cancel"
        ].join("\n")
      }
    ]);
  });
  test("uses visible tool confirmation messages instead of hidden parameters", () => {
    const controller = createController(new TestVoiceClientService());
    const getAgentStateInfo = Reflect.get(controller, "_getAgentStateInfo");
    const toolState = observableValue("toolState", {
      type: IChatToolInvocation.StateKind.WaitingForConfirmation,
      parameters: {
        command: "hidden-internal-command",
        explanation: "hidden-internal-explanation"
      },
      confirmationMessages: {
        title: new MarkdownString("Run the workspace build?"),
        message: "This runs the build task shown in the approval."
      },
      confirm: () => {
      }
    });
    const toolInvocation = new class extends mock() {
      constructor() {
        super(...arguments);
        this.kind = "toolInvocation";
        this.state = toolState;
        this.invocationMessage = "Run the workspace build";
      }
    }();
    const stateInfo = getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse("chat-session:/tool"), toolInvocation));
    assert.deepStrictEqual({
      stateInfo,
      containsHiddenParameters: stateInfo.detail?.includes("hidden-internal")
    }, {
      stateInfo: {
        state: "waiting_for_confirmation",
        confirmation_type: "tool",
        detail: [
          "tool approval: Run the workspace build?",
          "This runs the build task shown in the approval."
        ].join("\n")
      },
      containsHiddenParameters: false
    });
  });
  test("narrates authentication using the visible server name without hidden server metadata", () => {
    const controller = createController(new TestVoiceClientService());
    const getAgentStateInfo = Reflect.get(controller, "_getAgentStateInfo");
    const authenticationState = observableValue("authenticationState", {
      type: IChatToolInvocation.StateKind.WaitingForAuthentication,
      parameters: { hiddenParameter: "secret-internal-value" },
      confirmationMessages: void 0,
      confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
      server: {
        id: "hidden-server-id",
        name: "Mars Data MCP",
        resource: "hidden-server-resource"
      },
      cancel: () => {
      }
    });
    const toolInvocation = new class extends mock() {
      constructor() {
        super(...arguments);
        this.kind = "toolInvocation";
        this.state = authenticationState;
        this.invocationMessage = "Authenticate the Mars data server";
      }
    }();
    const stateInfo = getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse("chat-session:/authentication"), toolInvocation, "Authenticate Mars Data MCP to continue..."));
    assert.deepStrictEqual({
      stateInfo,
      containsHiddenMetadata: ["hidden-server-id", "hidden-server-resource", "secret-internal-value"].some((value) => stateInfo.detail?.includes(value))
    }, {
      stateInfo: {
        state: "waiting_for_confirmation",
        confirmation_type: "generic",
        detail: [
          "authentication request: MCP authentication required",
          "The MCP server Mars Data MCP requires authentication to continue this tool call.",
          "choices: Authenticate; Cancel"
        ].join("\n")
      },
      containsHiddenMetadata: false
    });
  });
  test("does not watch progress when agent progress is not enabled", () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(
      voiceClientService,
      void 0,
      void 0,
      void 0,
      void 0,
      new TestConfigurationService({ "agents.voice.handsFree": false })
    );
    const sessionResource = URI.parse("chat-session:/disabled-progress");
    const { changeEmitter, parts, response } = createVoiceProgressResponse("response-disabled");
    const isConnected = Reflect.get(controller, "_isConnected");
    const watchVoiceProgress = Reflect.get(controller, "_watchVoiceProgress");
    isConnected.set(true, void 0);
    controller.setActiveSessionShown(sessionResource);
    watchVoiceProgress.call(controller, sessionResource, response);
    parts.push({ kind: "voiceProgress", id: "investigating", value: "Investigating the relevant code." });
    changeEmitter.fire({ reason: "other" });
    clock.tick(1e4);
    assert.deepStrictEqual(voiceClientService.requests, []);
  });
  test("marks voice requests only when agent progress is enabled", async () => {
    const disabledChatService = new TestChatService();
    const disabledController = createController(
      new TestVoiceClientService(),
      void 0,
      void 0,
      void 0,
      void 0,
      new TestConfigurationService({ "agents.voice.handsFree": false }),
      disabledChatService
    );
    const enabledChatService = new TestChatService();
    const enabledController = createController(
      new TestVoiceClientService(),
      void 0,
      void 0,
      void 0,
      void 0,
      new TestConfigurationService({ "agents.voice.handsFree": false, [VOICE_AGENT_PROGRESS_SETTING]: true }),
      enabledChatService
    );
    const sendVoiceRequest = Reflect.get(disabledController, "_sendVoiceRequest");
    await sendVoiceRequest.call(disabledController, URI.parse("chat-session:/disabled"), "Check the code.");
    await sendVoiceRequest.call(enabledController, URI.parse("chat-session:/enabled"), "Check the code.");
    assert.deepStrictEqual({
      disabled: disabledChatService.sendRequestOptions[0]?.isVoiceModeInput,
      enabled: enabledChatService.sendRequestOptions[0]?.isVoiceModeInput
    }, {
      disabled: false,
      enabled: true
    });
  });
  test("delays, coalesces, and preserves throttled voice progress for the shown request", () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const sessionResource = URI.parse("chat-session:/voice-progress");
    const { changeEmitter, parts, response } = createVoiceProgressResponse("response-1");
    const isConnected = Reflect.get(controller, "_isConnected");
    const watchVoiceProgress = Reflect.get(controller, "_watchVoiceProgress");
    const sessionKey = Reflect.get(controller, "_sessionKey").call(controller, sessionResource.toString());
    const lastSpokenAt = Reflect.get(controller, "_lastSpokenAtBySession");
    isConnected.set(true, void 0);
    controller.setActiveSessionShown(sessionResource);
    watchVoiceProgress.call(controller, sessionResource, response);
    ttsPlaybackService.playAudioChunk("ack");
    Reflect.set(controller, "_currentPlaybackSessionId", sessionResource.toString());
    Reflect.set(controller, "_currentPlaybackResponseId", "ack-response");
    parts.push({ kind: "voiceProgress", id: "investigating", value: "Investigating the relevant code." });
    parts.push({ kind: "voiceProgress", id: "editing", value: "Updating the code." });
    changeEmitter.fire({ reason: "other" });
    clock.tick(4e3);
    parts.push({ kind: "voiceProgress", id: "validating", value: "Validating the changes." });
    changeEmitter.fire({ reason: "other" });
    clock.tick(1e3);
    assert.strictEqual(voiceClientService.requests.length, 0);
    lastSpokenAt.set(sessionKey, Date.now());
    ttsPlaybackService.stopPlayback();
    clock.tick(4999);
    assert.strictEqual(voiceClientService.requests.length, 0);
    clock.tick(1);
    parts.push({ kind: "voiceProgress", id: "recovering", value: "Trying a different approach." });
    changeEmitter.fire({ reason: "other" });
    clock.tick(9999);
    assert.strictEqual(voiceClientService.requests.length, 1);
    clock.tick(1);
    assert.deepStrictEqual(voiceClientService.requests.map((request) => ({
      kind: request.kind,
      text: request.text,
      checkpoint: request.checkpoint
    })), [
      {
        kind: "checkpoint",
        text: "Validating the changes.",
        checkpoint: { requestId: "request-response-1", checkpointId: "validating", sequence: 1 }
      },
      {
        kind: "checkpoint",
        text: "Trying a different approach.",
        checkpoint: { requestId: "request-response-1", checkpointId: "recovering", sequence: 2 }
      }
    ]);
  });
  test("sends the first semantic checkpoint after five seconds without prior speech", () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    const sessionResource = URI.parse("chat-session:/initial-progress-delay");
    const { changeEmitter, parts, response } = createVoiceProgressResponse("response-initial-delay");
    const isConnected = Reflect.get(controller, "_isConnected");
    const watchVoiceProgress = Reflect.get(controller, "_watchVoiceProgress");
    isConnected.set(true, void 0);
    controller.setActiveSessionShown(sessionResource);
    watchVoiceProgress.call(controller, sessionResource, response);
    parts.push({ kind: "voiceProgress", id: "editing", value: "Updating the code." });
    changeEmitter.fire({ reason: "other" });
    clock.tick(4999);
    assert.strictEqual(voiceClientService.requests.length, 0);
    clock.tick(1);
    assert.deepStrictEqual(voiceClientService.requests.map((request) => request.checkpoint), [{
      requestId: "request-response-initial-delay",
      checkpointId: "editing",
      sequence: 1
    }]);
  });
  test("schedules all five semantic stages once at the existing cadence", () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    const sessionResource = URI.parse("chat-session:/five-progress-stages");
    const { changeEmitter, parts, response } = createVoiceProgressResponse("response-five-stages");
    const isConnected = Reflect.get(controller, "_isConnected");
    const watchVoiceProgress = Reflect.get(controller, "_watchVoiceProgress");
    const stages = ["investigating", "planning", "editing", "validating", "recovering"];
    isConnected.set(true, void 0);
    controller.setActiveSessionShown(sessionResource);
    watchVoiceProgress.call(controller, sessionResource, response);
    for (const [index, stage] of stages.entries()) {
      parts.push({ kind: "voiceProgress", id: stage, value: `${stage} update` });
      changeEmitter.fire({ reason: "other" });
      clock.tick(index === 0 ? 5e3 : 1e4);
    }
    parts.push({ kind: "voiceProgress", id: "recovering", value: "duplicate recovery" });
    changeEmitter.fire({ reason: "other" });
    clock.tick(1e4);
    assert.deepStrictEqual(voiceClientService.requests.map((request) => ({
      text: request.text,
      checkpoint: request.checkpoint
    })), stages.map((stage, index) => ({
      text: `${stage} update`,
      checkpoint: {
        requestId: "request-response-five-stages",
        checkpointId: stage,
        sequence: index + 1
      }
    })));
  });
  test("final response cancels pending voice progress", () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    const sessionResource = URI.parse("chat-session:/final-cancels-progress");
    const { changeEmitter, parts, response } = createVoiceProgressResponse("response-final");
    const isConnected = Reflect.get(controller, "_isConnected");
    const watchVoiceProgress = Reflect.get(controller, "_watchVoiceProgress");
    const handleStateChange = Reflect.get(controller, "_handleNarratableStateChange");
    isConnected.set(true, void 0);
    controller.setActiveSessionShown(sessionResource);
    watchVoiceProgress.call(controller, sessionResource, response);
    parts.push({ kind: "voiceProgress", id: "editing", value: "Updating the code." });
    changeEmitter.fire({ reason: "other" });
    handleStateChange.call(controller, sessionResource.toString(), "idle", void 0, "Finished successfully.", sessionResource.toString());
    clock.tick(5e3);
    assert.deepStrictEqual(voiceClientService.requests.map((request) => request.kind), ["response"]);
  });
  test("confirmation cancels pending voice progress", () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    const sessionResource = URI.parse("chat-session:/confirmation-cancels-progress");
    const { changeEmitter, parts, response } = createVoiceProgressResponse("response-confirmation");
    const isConnected = Reflect.get(controller, "_isConnected");
    const watchVoiceProgress = Reflect.get(controller, "_watchVoiceProgress");
    const handleStateChange = Reflect.get(controller, "_handleNarratableStateChange");
    isConnected.set(true, void 0);
    controller.setActiveSessionShown(sessionResource);
    watchVoiceProgress.call(controller, sessionResource, response);
    parts.push({ kind: "voiceProgress", id: "validating", value: "Validating the changes." });
    changeEmitter.fire({ reason: "other" });
    handleStateChange.call(controller, sessionResource.toString(), "waiting_for_confirmation", "Approve the command.", void 0, sessionResource.toString());
    clock.tick(5e3);
    assert.deepStrictEqual(voiceClientService.requests.map((request) => request.kind), ["confirmation"]);
  });
  test("request cancellation and disconnect cancel pending voice progress", () => {
    const firstVoiceClient = new TestVoiceClientService();
    const firstController = createController(firstVoiceClient);
    const firstSession = URI.parse("chat-session:/cancelled-progress");
    const firstResponse = createVoiceProgressResponse("response-cancelled");
    const firstConnected = Reflect.get(firstController, "_isConnected");
    const firstWatch = Reflect.get(firstController, "_watchVoiceProgress");
    firstConnected.set(true, void 0);
    firstController.setActiveSessionShown(firstSession);
    firstWatch.call(firstController, firstSession, firstResponse.response);
    firstResponse.parts.push({ kind: "voiceProgress", id: "editing", value: "Updating the code." });
    firstResponse.changeEmitter.fire({ reason: "other" });
    firstController.markUserCancelled(firstSession.toString());
    const secondVoiceClient = new TestVoiceClientService();
    const secondController = createController(secondVoiceClient);
    const secondSession = URI.parse("chat-session:/disconnected-progress");
    const secondResponse = createVoiceProgressResponse("response-disconnected");
    const secondConnected = Reflect.get(secondController, "_isConnected");
    const secondWatch = Reflect.get(secondController, "_watchVoiceProgress");
    secondConnected.set(true, void 0);
    secondController.setActiveSessionShown(secondSession);
    secondWatch.call(secondController, secondSession, secondResponse.response);
    secondResponse.parts.push({ kind: "voiceProgress", id: "recovering", value: "Trying another approach." });
    secondResponse.changeEmitter.fire({ reason: "other" });
    secondController.disconnect("explicit");
    clock.tick(5e3);
    assert.deepStrictEqual({
      cancelledRequests: firstVoiceClient.requests,
      disconnectedRequests: secondVoiceClient.requests
    }, {
      cancelledRequests: [],
      disconnectedRequests: []
    });
  });
  test("transient disconnect retains the latest pending checkpoint until reconnect", () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    const sessionResource = URI.parse("chat-session:/reconnect-progress");
    const { changeEmitter, parts, response } = createVoiceProgressResponse("response-reconnect");
    const isConnected = Reflect.get(controller, "_isConnected");
    const watchVoiceProgress = Reflect.get(controller, "_watchVoiceProgress");
    isConnected.set(true, void 0);
    controller.setActiveSessionShown(sessionResource);
    watchVoiceProgress.call(controller, sessionResource, response);
    parts.push({ kind: "voiceProgress", id: "editing", value: "Updating the code." });
    changeEmitter.fire({ reason: "other" });
    clock.tick(4e3);
    isConnected.set(false, void 0);
    clock.tick(1e3);
    assert.strictEqual(voiceClientService.requests.length, 0);
    isConnected.set(true, void 0);
    assert.deepStrictEqual(voiceClientService.requests.map((request) => request.checkpoint), [{
      requestId: "request-response-reconnect",
      checkpointId: "editing",
      sequence: 1
    }]);
  });
  test("a new voice request cancels only the shown session checkpoint", () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    const shownSession = URI.parse("chat-session:/shown-progress");
    const backgroundSession = URI.parse("chat-session:/background-progress");
    const shownResponse = createVoiceProgressResponse("response-shown");
    const backgroundResponse = createVoiceProgressResponse("response-background");
    const isConnected = Reflect.get(controller, "_isConnected");
    const watchVoiceProgress = Reflect.get(controller, "_watchVoiceProgress");
    isConnected.set(true, void 0);
    controller.setActiveSessionShown(shownSession);
    watchVoiceProgress.call(controller, shownSession, shownResponse.response);
    watchVoiceProgress.call(controller, backgroundSession, backgroundResponse.response);
    shownResponse.parts.push({ kind: "voiceProgress", id: "editing", value: "Updating shown code." });
    backgroundResponse.parts.push({ kind: "voiceProgress", id: "validating", value: "Validating background code." });
    shownResponse.changeEmitter.fire({ reason: "other" });
    backgroundResponse.changeEmitter.fire({ reason: "other" });
    controller.pttDown("explicit");
    controller.setActiveSessionShown(backgroundSession);
    clock.tick(5e3);
    assert.deepStrictEqual(voiceClientService.requests.map((request) => request.checkpoint?.requestId), ["request-response-background"]);
  });
  test("barge-in and a new explicit voice request cancel pending voice progress", () => {
    const bargeVoiceClient = new TestVoiceClientService();
    const bargeController = createController(bargeVoiceClient);
    const bargeSession = URI.parse("chat-session:/barge-progress");
    const bargeResponse = createVoiceProgressResponse("response-barge");
    const bargeConnected = Reflect.get(bargeController, "_isConnected");
    const bargeWatch = Reflect.get(bargeController, "_watchVoiceProgress");
    const handleBargeIn = Reflect.get(bargeController, "_handleBargeIn");
    bargeConnected.set(true, void 0);
    bargeController.setActiveSessionShown(bargeSession);
    bargeWatch.call(bargeController, bargeSession, bargeResponse.response);
    bargeResponse.parts.push({ kind: "voiceProgress", id: "editing", value: "Updating the code." });
    bargeResponse.changeEmitter.fire({ reason: "other" });
    handleBargeIn.call(bargeController, { turnId: "new-turn", interruptedTurnId: "old-turn" });
    const pttVoiceClient = new TestVoiceClientService();
    const pttController = createController(pttVoiceClient);
    const pttSession = URI.parse("chat-session:/ptt-progress");
    const pttResponse = createVoiceProgressResponse("response-ptt");
    const pttConnected = Reflect.get(pttController, "_isConnected");
    const pttWatch = Reflect.get(pttController, "_watchVoiceProgress");
    pttConnected.set(true, void 0);
    pttController.setActiveSessionShown(pttSession);
    pttWatch.call(pttController, pttSession, pttResponse.response);
    pttResponse.parts.push({ kind: "voiceProgress", id: "validating", value: "Validating the changes." });
    pttResponse.changeEmitter.fire({ reason: "other" });
    pttController.pttDown("explicit");
    clock.tick(5e3);
    assert.deepStrictEqual({
      bargeRequests: bargeVoiceClient.requests,
      pttRequests: pttVoiceClient.requests
    }, {
      bargeRequests: [],
      pttRequests: []
    });
  });
  test("busy, invalid, and legacy suppressed checkpoints are never retried", () => {
    const dispositions = ["busy", "invalid", "suppressed"];
    const results = [];
    for (const disposition of dispositions) {
      const voiceClientService = new TestVoiceClientService();
      const controller = createController(voiceClientService);
      const sessionId = `chat-session:/${disposition}`;
      const narrate = Reflect.get(controller, "_narrate");
      const handleAck = Reflect.get(controller, "_handleNarrationAck");
      const retryDeferred = Reflect.get(controller, "_retryDeferredNarration");
      const sessionKey = Reflect.get(controller, "_sessionKey").call(controller, sessionId);
      narrate.call(controller, sessionId, "checkpoint", "Updating the code.", void 0, {
        requestId: `request-${disposition}`,
        checkpointId: "editing",
        sequence: 1
      });
      const request = voiceClientService.requests[0];
      handleAck.call(controller, {
        narrationId: request.narrationId,
        codingSessionId: sessionId,
        disposition
      });
      results.push(retryDeferred.call(controller, sessionKey, request.narrationId));
    }
    assert.deepStrictEqual(results, [false, false, false]);
  });
  test("active checkpoint playback is preempted when final response audio starts", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const sessionId = "chat-session:/checkpoint-final";
    const narrate = Reflect.get(controller, "_narrate");
    await controller.connect(mainWindow);
    controller.setActiveSessionShown(URI.parse(sessionId));
    narrate.call(controller, sessionId, "checkpoint", "Updating the code.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1
    });
    const checkpointId = voiceClientService.requests[0].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "checkpoint",
      isFirstChunk: true,
      isFinal: false,
      codingSessionId: sessionId,
      responseId: checkpointId
    });
    narrate.call(controller, sessionId, "response", "Everything is complete.");
    assert.strictEqual(ttsPlaybackService.stopCount, 0);
    const finalId = voiceClientService.requests[1].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "final",
      isFirstChunk: true,
      isFinal: true,
      codingSessionId: sessionId,
      responseId: finalId
    });
    voiceClientService.fireAudioResponse({
      audio: "stale-checkpoint",
      isFirstChunk: false,
      isFinal: true,
      codingSessionId: sessionId,
      responseId: checkpointId
    });
    assert.deepStrictEqual({
      stopCount: ttsPlaybackService.stopCount,
      playedAudio: ttsPlaybackService.playedAudio,
      playbackCompletions: voiceClientService.playbackCompletions
    }, {
      stopCount: 1,
      playedAudio: ["checkpoint", "final"],
      playbackCompletions: []
    });
  });
  test("empty final response does not preempt active checkpoint playback", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const sessionId = "chat-session:/checkpoint-empty-response";
    const narrate = Reflect.get(controller, "_narrate");
    await controller.connect(mainWindow);
    controller.setActiveSessionShown(URI.parse(sessionId));
    narrate.call(controller, sessionId, "checkpoint", "Updating the code.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1
    });
    const checkpointId = voiceClientService.requests[0].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "checkpoint",
      isFirstChunk: true,
      isFinal: false,
      codingSessionId: sessionId,
      responseId: checkpointId
    });
    narrate.call(controller, sessionId, "response", "Progress-only final summary.");
    const responseId = voiceClientService.requests[1].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "",
      isFirstChunk: true,
      isFinal: true,
      codingSessionId: sessionId,
      responseId
    });
    assert.deepStrictEqual({
      stopCount: ttsPlaybackService.stopCount,
      playedAudio: ttsPlaybackService.playedAudio,
      isPlaying: ttsPlaybackService.isPlaying
    }, {
      stopCount: 0,
      playedAudio: ["checkpoint"],
      isPlaying: true
    });
  });
  test("completed checkpoint playback acknowledges the correlated playback id", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const sessionId = "chat-session:/checkpoint-complete";
    const narrate = Reflect.get(controller, "_narrate");
    await controller.connect(mainWindow);
    controller.setActiveSessionShown(URI.parse(sessionId));
    narrate.call(controller, sessionId, "checkpoint", "Updating the code.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1
    });
    const narrationId = voiceClientService.requests[0].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "checkpoint",
      isFirstChunk: true,
      isFinal: true,
      codingSessionId: sessionId,
      responseId: narrationId,
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1,
      narrationKind: "checkpoint",
      playbackId: "playback-1"
    });
    ttsPlaybackService.stopPlayback();
    assert.deepStrictEqual(voiceClientService.playbackCompletions, [{
      sessionId,
      narrationId,
      playbackId: "playback-1"
    }]);
  });
  test("dropped re-narration does not preempt active checkpoint playback", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const sessionId = "chat-session:/checkpoint-reread";
    const narrate = Reflect.get(controller, "_narrate");
    const recentlyRead = Reflect.get(controller, "_recentlyReadResponse");
    await controller.connect(mainWindow);
    controller.setActiveSessionShown(URI.parse(sessionId));
    narrate.call(controller, sessionId, "checkpoint", "Updating the code.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1
    });
    const checkpointId = voiceClientService.requests[0].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "checkpoint",
      isFirstChunk: true,
      isFinal: false,
      codingSessionId: sessionId,
      responseId: checkpointId
    });
    recentlyRead.set(sessionId, { transcript: "already heard", at: Date.now() });
    voiceClientService.fireAudioResponse({
      audio: "duplicate",
      isFirstChunk: true,
      isFinal: true,
      codingSessionId: sessionId,
      responseId: "duplicate-response",
      transcript: "Already heard."
    });
    assert.deepStrictEqual({
      stopCount: ttsPlaybackService.stopCount,
      playedAudio: ttsPlaybackService.playedAudio
    }, {
      stopCount: 0,
      playedAudio: ["checkpoint"]
    });
  });
  test("active checkpoint playback is preempted by confirmation", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const sessionId = "chat-session:/checkpoint-confirmation";
    const narrate = Reflect.get(controller, "_narrate");
    await controller.connect(mainWindow);
    controller.setActiveSessionShown(URI.parse(sessionId));
    narrate.call(controller, sessionId, "checkpoint", "Validating the changes.", void 0, {
      requestId: "request-1",
      checkpointId: "validating",
      sequence: 1
    });
    const checkpointId = voiceClientService.requests[0].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "checkpoint",
      isFirstChunk: true,
      isFinal: false,
      codingSessionId: sessionId,
      responseId: checkpointId
    });
    narrate.call(controller, sessionId, "confirmation", "Approve the command.");
    const confirmationId = voiceClientService.requests[1].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "confirmation",
      isFirstChunk: true,
      isFinal: true,
      codingSessionId: sessionId,
      responseId: confirmationId
    });
    assert.deepStrictEqual({
      stopCount: ttsPlaybackService.stopCount,
      playedAudio: ttsPlaybackService.playedAudio
    }, {
      stopCount: 1,
      playedAudio: ["checkpoint", "confirmation"]
    });
  });
  test("direct substantive audio preempts active checkpoint playback", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const sessionId = "chat-session:/checkpoint-direct-reply";
    const narrate = Reflect.get(controller, "_narrate");
    await controller.connect(mainWindow);
    controller.setActiveSessionShown(URI.parse(sessionId));
    narrate.call(controller, sessionId, "checkpoint", "Updating the code.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1
    });
    const checkpointId = voiceClientService.requests[0].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "checkpoint",
      isFirstChunk: true,
      isFinal: false,
      codingSessionId: sessionId,
      responseId: checkpointId
    });
    voiceClientService.fireAudioResponse({
      audio: "direct-reply",
      isFirstChunk: true,
      isFinal: true,
      codingSessionId: sessionId,
      responseId: "direct-response",
      transcript: "Here is the substantive result."
    });
    assert.deepStrictEqual({
      stopCount: ttsPlaybackService.stopCount,
      playedAudio: ttsPlaybackService.playedAudio
    }, {
      stopCount: 1,
      playedAudio: ["checkpoint", "direct-reply"]
    });
  });
  test("cross-session substantive audio preempts active checkpoint playback", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const checkpointSessionId = "chat-session:/checkpoint-background";
    const responseSessionId = "chat-session:/response-foreground";
    const narrate = Reflect.get(controller, "_narrate");
    await controller.connect(mainWindow);
    controller.setActiveSessionShown(URI.parse(checkpointSessionId));
    narrate.call(controller, checkpointSessionId, "checkpoint", "Updating the code.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1
    });
    const checkpointId = voiceClientService.requests[0].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "checkpoint",
      isFirstChunk: true,
      isFinal: false,
      codingSessionId: checkpointSessionId,
      responseId: checkpointId
    });
    controller.setActiveSessionShown(URI.parse(responseSessionId));
    voiceClientService.fireAudioResponse({
      audio: "substantive-response",
      isFirstChunk: true,
      isFinal: true,
      codingSessionId: responseSessionId,
      responseId: "direct-response",
      transcript: "The foreground task is complete."
    });
    assert.deepStrictEqual({
      stopCount: ttsPlaybackService.stopCount,
      playedAudio: ttsPlaybackService.playedAudio
    }, {
      stopCount: 1,
      playedAudio: ["checkpoint", "substantive-response"]
    });
  });
  test("newer checkpoint preempts active older checkpoint and discards stale chunks", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const sessionId = "chat-session:/checkpoint-replacement";
    const narrate = Reflect.get(controller, "_narrate");
    await controller.connect(mainWindow);
    controller.setActiveSessionShown(URI.parse(sessionId));
    narrate.call(controller, sessionId, "checkpoint", "Updating the code.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1
    });
    const firstId = voiceClientService.requests[0].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "editing",
      isFirstChunk: true,
      isFinal: false,
      codingSessionId: sessionId,
      responseId: firstId
    });
    narrate.call(controller, sessionId, "checkpoint", "Validating the result.", void 0, {
      requestId: "request-1",
      checkpointId: "validating",
      sequence: 2
    });
    const secondId = voiceClientService.requests[1].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "stale-editing",
      isFirstChunk: false,
      isFinal: true,
      codingSessionId: sessionId,
      responseId: firstId
    });
    voiceClientService.fireAudioResponse({
      audio: "validating",
      isFirstChunk: true,
      isFinal: true,
      codingSessionId: sessionId,
      responseId: secondId
    });
    assert.deepStrictEqual(ttsPlaybackService.playedAudio, ["editing", "validating"]);
  });
  test("cross-session checkpoint replaces active checkpoint", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const firstSessionId = "chat-session:/checkpoint-first-session";
    const secondSessionId = "chat-session:/checkpoint-second-session";
    const narrate = Reflect.get(controller, "_narrate");
    await controller.connect(mainWindow);
    controller.setActiveSessionShown(URI.parse(firstSessionId));
    narrate.call(controller, firstSessionId, "checkpoint", "Updating the first task.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1
    });
    const firstId = voiceClientService.requests[0].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "first-checkpoint",
      isFirstChunk: true,
      isFinal: false,
      codingSessionId: firstSessionId,
      responseId: firstId
    });
    narrate.call(controller, secondSessionId, "checkpoint", "Validating the second task.", void 0, {
      requestId: "request-2",
      checkpointId: "validating",
      sequence: 1
    });
    const secondId = voiceClientService.requests[1].narrationId;
    controller.setActiveSessionShown(URI.parse(secondSessionId));
    voiceClientService.fireAudioResponse({
      audio: "second-checkpoint",
      isFirstChunk: true,
      isFinal: true,
      codingSessionId: secondSessionId,
      responseId: secondId
    });
    assert.deepStrictEqual({
      stopCount: ttsPlaybackService.stopCount,
      playedAudio: ttsPlaybackService.playedAudio
    }, {
      stopCount: 1,
      playedAudio: ["first-checkpoint", "second-checkpoint"]
    });
  });
  test("pre-decode checkpoint preemption does not poison replacement completion", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new DeferredFirstTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const sessionId = "chat-session:/checkpoint-predecode";
    const narrate = Reflect.get(controller, "_narrate");
    await controller.connect(mainWindow);
    controller.setActiveSessionShown(URI.parse(sessionId));
    narrate.call(controller, sessionId, "checkpoint", "Updating the code.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1
    });
    const firstId = voiceClientService.requests[0].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "decoding-checkpoint",
      isFirstChunk: true,
      isFinal: true,
      codingSessionId: sessionId,
      responseId: firstId,
      narrationKind: "checkpoint",
      playbackId: "playback-1"
    });
    narrate.call(controller, sessionId, "checkpoint", "Validating the result.", void 0, {
      requestId: "request-1",
      checkpointId: "validating",
      sequence: 2
    });
    const secondId = voiceClientService.requests[1].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "replacement-checkpoint",
      isFirstChunk: true,
      isFinal: true,
      codingSessionId: sessionId,
      responseId: secondId,
      narrationKind: "checkpoint",
      playbackId: "playback-2"
    });
    ttsPlaybackService.stopPlayback();
    assert.deepStrictEqual({
      stopCount: ttsPlaybackService.stopCount,
      playbackCompletions: voiceClientService.playbackCompletions
    }, {
      stopCount: 2,
      playbackCompletions: [{ sessionId, narrationId: secondId, playbackId: "playback-2" }]
    });
  });
  test("scheduled newer checkpoint replaces active checkpoint at the cadence boundary", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const sessionResource = URI.parse("chat-session:/scheduled-checkpoint-replacement");
    const { changeEmitter, parts, response } = createVoiceProgressResponse("response-scheduled-replacement");
    const isConnected = Reflect.get(controller, "_isConnected");
    const watchVoiceProgress = Reflect.get(controller, "_watchVoiceProgress");
    await controller.connect(mainWindow);
    isConnected.set(true, void 0);
    controller.setActiveSessionShown(sessionResource);
    watchVoiceProgress.call(controller, sessionResource, response);
    parts.push({ kind: "voiceProgress", id: "editing", value: "Updating the code." });
    changeEmitter.fire({ reason: "other" });
    clock.tick(5e3);
    const firstId = voiceClientService.requests[0].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "editing",
      isFirstChunk: true,
      isFinal: false,
      codingSessionId: sessionResource.toString(),
      responseId: firstId
    });
    parts.push({ kind: "voiceProgress", id: "validating", value: "Validating the result." });
    changeEmitter.fire({ reason: "other" });
    clock.tick(1e4);
    const secondId = voiceClientService.requests[1].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "stale-editing",
      isFirstChunk: false,
      isFinal: true,
      codingSessionId: sessionResource.toString(),
      responseId: firstId
    });
    voiceClientService.fireAudioResponse({
      audio: "validating",
      isFirstChunk: true,
      isFinal: true,
      codingSessionId: sessionResource.toString(),
      responseId: secondId
    });
    assert.deepStrictEqual({
      checkpoints: voiceClientService.requests.map((request) => request.checkpoint),
      stopCount: ttsPlaybackService.stopCount,
      playedAudio: ttsPlaybackService.playedAudio
    }, {
      checkpoints: [
        { requestId: "request-response-scheduled-replacement", checkpointId: "editing", sequence: 1 },
        { requestId: "request-response-scheduled-replacement", checkpointId: "validating", sequence: 2 }
      ],
      stopCount: 1,
      playedAudio: ["editing", "validating"]
    });
  });
  test("request cancellation preempts active checkpoint playback and discards trailing chunks", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const sessionId = "chat-session:/active-checkpoint-cancellation";
    const narrate = Reflect.get(controller, "_narrate");
    await controller.connect(mainWindow);
    controller.setActiveSessionShown(URI.parse(sessionId));
    narrate.call(controller, sessionId, "checkpoint", "Updating the code.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1
    });
    const narrationId = voiceClientService.requests[0].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "checkpoint",
      isFirstChunk: true,
      isFinal: false,
      codingSessionId: sessionId,
      responseId: narrationId
    });
    controller.markUserCancelled(sessionId);
    voiceClientService.fireAudioResponse({
      audio: "stale-checkpoint",
      isFirstChunk: false,
      isFinal: true,
      codingSessionId: sessionId,
      responseId: narrationId
    });
    assert.deepStrictEqual({
      stopCount: ttsPlaybackService.stopCount,
      playedAudio: ttsPlaybackService.playedAudio
    }, {
      stopCount: 1,
      playedAudio: ["checkpoint"]
    });
  });
  test("explicit PTT retires checkpoint tracking before clearing playback correlation", async () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    const sessionId = "chat-session:/checkpoint-ptt-tracking";
    const isConnected = Reflect.get(controller, "_isConnected");
    const narrate = Reflect.get(controller, "_narrate");
    await controller.connect(mainWindow);
    isConnected.set(true, void 0);
    controller.setActiveSessionShown(URI.parse(sessionId));
    narrate.call(controller, sessionId, "checkpoint", "Updating the code.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1
    });
    const firstId = voiceClientService.requests[0].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "checkpoint",
      isFirstChunk: true,
      isFinal: false,
      codingSessionId: sessionId,
      responseId: firstId
    });
    controller.pttDown("explicit");
    const sentNextCheckpoint = narrate.call(controller, sessionId, "checkpoint", "Updating the code.", void 0, {
      requestId: "request-2",
      checkpointId: "editing",
      sequence: 1
    });
    assert.deepStrictEqual({
      sentNextCheckpoint,
      requestIds: voiceClientService.requests.map((request) => request.checkpoint?.requestId)
    }, {
      sentNextCheckpoint: true,
      requestIds: ["request-1", "request-2"]
    });
  });
  test("barge-in stops active checkpoint playback and discards trailing chunks", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const sessionId = "chat-session:/checkpoint-barge";
    const narrate = Reflect.get(controller, "_narrate");
    const handleBargeIn = Reflect.get(controller, "_handleBargeIn");
    await controller.connect(mainWindow);
    controller.setActiveSessionShown(URI.parse(sessionId));
    narrate.call(controller, sessionId, "checkpoint", "Updating the code.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1
    });
    const checkpointId = voiceClientService.requests[0].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "checkpoint",
      isFirstChunk: true,
      isFinal: false,
      codingSessionId: sessionId,
      responseId: checkpointId,
      turnId: "checkpoint-turn"
    });
    handleBargeIn.call(controller, { turnId: "user-turn", interruptedTurnId: checkpointId });
    voiceClientService.fireAudioResponse({
      audio: "stale-checkpoint",
      isFirstChunk: false,
      isFinal: true,
      codingSessionId: sessionId,
      responseId: checkpointId,
      turnId: "checkpoint-turn"
    });
    assert.deepStrictEqual({
      stopCount: ttsPlaybackService.stopCount,
      playedAudio: ttsPlaybackService.playedAudio
    }, {
      stopCount: 1,
      playedAudio: ["checkpoint"]
    });
  });
  test("backend interruption stops only the matching active checkpoint", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const sessionId = "chat-session:/checkpoint-server-interruption";
    const narrate = Reflect.get(controller, "_narrate");
    await controller.connect(mainWindow);
    controller.setActiveSessionShown(URI.parse(sessionId));
    narrate.call(controller, sessionId, "checkpoint", "Updating the code.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1
    });
    const narrationId = voiceClientService.requests[0].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "checkpoint",
      isFirstChunk: true,
      isFinal: false,
      codingSessionId: sessionId,
      responseId: narrationId
    });
    voiceClientService.fireNarrationInterrupted({
      narrationId,
      codingSessionId: sessionId,
      retryable: false,
      reason: "superseded_by_response"
    });
    voiceClientService.fireAudioResponse({
      audio: "stale-checkpoint",
      isFirstChunk: false,
      isFinal: true,
      codingSessionId: sessionId,
      responseId: narrationId
    });
    assert.deepStrictEqual({
      stopCount: ttsPlaybackService.stopCount,
      playedAudio: ttsPlaybackService.playedAudio,
      playbackCompletions: voiceClientService.playbackCompletions
    }, {
      stopCount: 1,
      playedAudio: ["checkpoint"],
      playbackCompletions: []
    });
  });
  test("late backend interruption does not stop a replacement checkpoint", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const sessionId = "chat-session:/checkpoint-late-server-interruption";
    const narrate = Reflect.get(controller, "_narrate");
    await controller.connect(mainWindow);
    controller.setActiveSessionShown(URI.parse(sessionId));
    narrate.call(controller, sessionId, "checkpoint", "Updating the code.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1
    });
    const firstId = voiceClientService.requests[0].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "first-checkpoint",
      isFirstChunk: true,
      isFinal: false,
      codingSessionId: sessionId,
      responseId: firstId
    });
    narrate.call(controller, sessionId, "checkpoint", "Validating the result.", void 0, {
      requestId: "request-1",
      checkpointId: "validating",
      sequence: 2
    });
    const secondId = voiceClientService.requests[1].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "second-checkpoint",
      isFirstChunk: true,
      isFinal: true,
      codingSessionId: sessionId,
      responseId: secondId,
      narrationKind: "checkpoint",
      playbackId: "playback-2"
    });
    voiceClientService.fireNarrationInterrupted({
      narrationId: firstId,
      codingSessionId: sessionId,
      retryable: false,
      reason: "superseded_by_checkpoint"
    });
    ttsPlaybackService.stopPlayback();
    assert.deepStrictEqual({
      stopCount: ttsPlaybackService.stopCount,
      playbackCompletions: voiceClientService.playbackCompletions
    }, {
      stopCount: 2,
      playbackCompletions: [{ sessionId, narrationId: secondId, playbackId: "playback-2" }]
    });
  });
  test("checkpoint sequence restarts for the next chat request", () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    const sessionResource = URI.parse("chat-session:/sequence-reset");
    const first = createVoiceProgressResponse("response-sequence-1", "request-1");
    const second = createVoiceProgressResponse("response-sequence-2", "request-2");
    const isConnected = Reflect.get(controller, "_isConnected");
    const watchVoiceProgress = Reflect.get(controller, "_watchVoiceProgress");
    const handleAck = Reflect.get(controller, "_handleNarrationAck");
    isConnected.set(true, void 0);
    controller.setActiveSessionShown(sessionResource);
    watchVoiceProgress.call(controller, sessionResource, first.response);
    first.parts.push({ kind: "voiceProgress", id: "editing", value: "Updating the first request." });
    first.changeEmitter.fire({ reason: "other" });
    clock.tick(5e3);
    handleAck.call(controller, {
      narrationId: voiceClientService.requests[0].narrationId,
      codingSessionId: sessionResource.toString(),
      disposition: "suppressed"
    });
    first.state.isComplete = true;
    first.changeEmitter.fire({ reason: "other" });
    watchVoiceProgress.call(controller, sessionResource, second.response);
    second.parts.push({ kind: "voiceProgress", id: "validating", value: "Validating the second request." });
    second.changeEmitter.fire({ reason: "other" });
    clock.tick(5e3);
    assert.deepStrictEqual(voiceClientService.requests.map((request) => request.checkpoint), [
      { requestId: "request-1", checkpointId: "editing", sequence: 1 },
      { requestId: "request-2", checkpointId: "validating", sequence: 1 }
    ]);
  });
  test("first-and-final empty checkpoint clears without acknowledging playback", async () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    const sessionId = "chat-session:/checkpoint-empty-final";
    const narrate = Reflect.get(controller, "_narrate");
    await controller.connect(mainWindow);
    controller.setActiveSessionShown(URI.parse(sessionId));
    narrate.call(controller, sessionId, "checkpoint", "Updating the code.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1
    });
    const narrationId = voiceClientService.requests[0].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "",
      isFirstChunk: true,
      isFinal: true,
      codingSessionId: sessionId,
      responseId: narrationId,
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1,
      narrationKind: "checkpoint",
      playbackId: "playback-empty"
    });
    assert.deepStrictEqual({
      pending: [...Reflect.get(controller, "_pendingSolicitedNarrations").keys()],
      deferred: [...Reflect.get(controller, "_deferredNarrations").keys()],
      playbackCompletions: voiceClientService.playbackCompletions
    }, {
      pending: [],
      deferred: [],
      playbackCompletions: []
    });
  });
  test("empty checkpoint terminal without playback id clears without acknowledgement", async () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    const sessionId = "chat-session:/checkpoint-empty-final-no-playback";
    const narrate = Reflect.get(controller, "_narrate");
    await controller.connect(mainWindow);
    controller.setActiveSessionShown(URI.parse(sessionId));
    narrate.call(controller, sessionId, "checkpoint", "Updating the code.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1
    });
    const narrationId = voiceClientService.requests[0].narrationId;
    voiceClientService.fireAudioResponse({
      audio: "",
      isFirstChunk: true,
      isFinal: true,
      codingSessionId: sessionId,
      responseId: narrationId,
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1,
      narrationKind: "checkpoint"
    });
    assert.deepStrictEqual({
      pending: [...Reflect.get(controller, "_pendingSolicitedNarrations").keys()],
      playbackCompletions: voiceClientService.playbackCompletions
    }, {
      pending: [],
      playbackCompletions: []
    });
  });
  test("checkpoint audio prefix followed by empty failure final acknowledges after playback drains", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const sessionId = "chat-session:/checkpoint-partial-failure";
    const narrate = Reflect.get(controller, "_narrate");
    await controller.connect(mainWindow);
    controller.setActiveSessionShown(URI.parse(sessionId));
    narrate.call(controller, sessionId, "checkpoint", "Updating the code.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1
    });
    const narrationId = voiceClientService.requests[0].narrationId;
    const correlation = {
      codingSessionId: sessionId,
      responseId: narrationId,
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 1,
      narrationKind: "checkpoint",
      playbackId: "playback-partial"
    };
    voiceClientService.fireAudioResponse({
      ...correlation,
      audio: "checkpoint-prefix",
      isFirstChunk: true,
      isFinal: false
    });
    voiceClientService.fireAudioResponse({
      ...correlation,
      audio: "",
      isFirstChunk: false,
      isFinal: true
    });
    assert.deepStrictEqual(voiceClientService.playbackCompletions, []);
    ttsPlaybackService.stopPlayback();
    assert.deepStrictEqual(voiceClientService.playbackCompletions, [{
      sessionId,
      narrationId,
      playbackId: "playback-partial"
    }]);
  });
  test("explicit disconnect clears routing target and pending confirmations and the tracker cannot repopulate them before reconnect", () => {
    const voiceClientService = new TestVoiceClientService();
    const chatService = new ControllableChatService();
    const controller = createController(voiceClientService, void 0, void 0, void 0, void 0, void 0, chatService);
    const target = URI.parse("agent-host-copilot:/session-1");
    controller.setTargetSession(target);
    chatService.setModels([pendingConfirmationModel(URI.parse("agent-host-copilot:/session-1"))]);
    assert.strictEqual(controller.pendingToolConfirmations.get().length, 1);
    assert.strictEqual(controller.targetSession.get()?.toString(), target.toString());
    controller.disconnect("explicit");
    assert.strictEqual(controller.targetSession.get(), void 0);
    assert.strictEqual(controller.pendingToolConfirmations.get().length, 0);
    chatService.setModels([pendingConfirmationModel(URI.parse("agent-host-copilot:/session-1"))]);
    assert.strictEqual(controller.pendingToolConfirmations.get().length, 0);
  });
  test("reports only genuine approvals as approvals", async () => {
    const voiceClientService = new TestVoiceClientService();
    const telemetryService = new TestTelemetryService();
    const controller = createController(voiceClientService, void 0, void 0, telemetryService);
    await controller.connect(mainWindow);
    for (const type of ["approve", "reject", "answer", "skip"]) {
      voiceClientService.fireToolCall({
        callId: `call-${type}`,
        name: "respond_to_session",
        args: { coding_session_id: "session-1", response: { type } }
      });
      await voiceClientService.toolResultReceived;
    }
    assert.deepStrictEqual(
      telemetryService.events.filter((event) => event.name === "voiceToolApproval").map((event) => event.data.approved),
      [true, false]
    );
  });
  test("publishes a question form as a structured pending payload", () => {
    const controller = createController(new TestVoiceClientService());
    const buildPendingPayload = Reflect.get(controller, "_buildPendingPayload");
    const part = {
      kind: "questionCarousel",
      allowSkip: true,
      questions: [{
        id: "region",
        type: "singleSelect",
        title: "Deploy settings",
        message: "Which region should this deploy to?",
        defaultValue: "east",
        options: [
          { id: "west", label: "West US", value: "westus" },
          { id: "east", label: "East US", value: "eastus" }
        ]
      }]
    };
    const payload = buildPendingPayload.call(controller, pendingPartsModel(part));
    assert.deepStrictEqual(payload, {
      type: "questions",
      pending_id: derivePendingId("req-1", part),
      request_id: "req-1",
      allow_skip: true,
      questions: [{
        id: "region",
        type: "singleSelect",
        // The question the widget shows, not its header.
        title: "Which region should this deploy to?",
        allow_freeform: true,
        // Default first, matching what the widget renders and the user hears.
        options: [
          { label: "East US", value: "eastus" },
          { label: "West US", value: "westus" }
        ]
      }]
    });
  });
  test("does not publish a question form that has already been answered", () => {
    const controller = createController(new TestVoiceClientService());
    const buildPendingPayload = Reflect.get(controller, "_buildPendingPayload");
    const questions = [{ id: "region", type: "singleSelect", title: "Which region?", options: [{ id: "west", label: "West US", value: "westus" }] }];
    assert.strictEqual(buildPendingPayload.call(controller, pendingPartsModel({ kind: "questionCarousel", isUsed: true, questions })), void 0);
    assert.strictEqual(buildPendingPayload.call(controller, pendingPartsModel({ kind: "questionCarousel", answeredExternally: true, questions })), void 0);
    assert.strictEqual(buildPendingPayload.call(controller, pendingPartsModel({ kind: "questionCarousel", questions: [] })), void 0);
  });
  test("selects the oldest still-open pending part, not the newest", () => {
    const controller = createController(new TestVoiceClientService());
    const selectPendingPart = Reflect.get(controller, "_selectPendingPart");
    const older = { kind: "questionCarousel", questions: [{ id: "a", type: "singleSelect", title: "A?", options: [] }] };
    const newer = { kind: "questionCarousel", questions: [{ id: "b", type: "singleSelect", title: "B?", options: [] }] };
    const selected = selectPendingPart.call(controller, pendingPartsModel([older, newer]));
    assert.strictEqual(selected?.part, older);
    assert.strictEqual(selected?.requestId, "req-1");
  });
  test("moves on once the oldest pending part is resolved", () => {
    const controller = createController(new TestVoiceClientService());
    const selectPendingPart = Reflect.get(controller, "_selectPendingPart");
    const answered = { kind: "questionCarousel", isUsed: true, questions: [{ id: "a", type: "singleSelect", title: "A?", options: [] }] };
    const newer = { kind: "questionCarousel", questions: [{ id: "b", type: "singleSelect", title: "B?", options: [] }] };
    assert.strictEqual(selectPendingPart.call(controller, pendingPartsModel([answered, newer]))?.part, newer);
    assert.strictEqual(selectPendingPart.call(controller, pendingPartsModel([answered]))?.part, void 0);
  });
  test("an executing tool does not shadow the form it opened", () => {
    const controller = createController(new TestVoiceClientService());
    const selectPendingPart = Reflect.get(controller, "_selectPendingPart");
    const executingTool = {
      kind: "toolInvocation",
      state: observableValue("state", { type: IChatToolInvocation.StateKind.Executing })
    };
    const carousel = { kind: "questionCarousel", questions: [{ id: "a", type: "singleSelect", title: "A?", options: [] }] };
    assert.strictEqual(selectPendingPart.call(controller, pendingPartsModel([executingTool, carousel]))?.part, carousel);
  });
  test("keeps publishing the older form when a second one arrives", () => {
    const controller = createController(new TestVoiceClientService());
    const buildPendingPayload = Reflect.get(controller, "_buildPendingPayload");
    const older = { kind: "questionCarousel", questions: [{ id: "region", type: "singleSelect", title: "Which region?", options: [{ id: "w", label: "West US", value: "westus" }] }] };
    const newer = { kind: "questionCarousel", questions: [{ id: "tier", type: "singleSelect", title: "Which tier?", options: [{ id: "p", label: "Premium", value: "premium" }] }] };
    const payload = buildPendingPayload.call(controller, pendingPartsModel([older, newer]));
    assert.deepStrictEqual(payload?.questions?.map((question) => question.id), ["region"]);
    assert.strictEqual(payload?.pending_id, derivePendingId("req-1", older));
  });
  test("payload and spoken detail name the same form when two are open", () => {
    const controller = createController(new TestVoiceClientService());
    const buildPendingPayload = Reflect.get(controller, "_buildPendingPayload");
    const getAgentStateInfo = Reflect.get(controller, "_getAgentStateInfo");
    const older = { kind: "questionCarousel", questions: [{ id: "region", type: "singleSelect", title: "Which region?", options: [] }] };
    const newer = { kind: "questionCarousel", questions: [{ id: "tier", type: "singleSelect", title: "Which tier?", options: [] }] };
    const model = pendingPartsModel([older, newer], "req-1", "Answer questions to continue...");
    const info = getAgentStateInfo.call(controller, model);
    assert.strictEqual(info.state, "waiting_for_confirmation");
    assert.ok(info.detail?.includes("Which region?"));
    assert.ok(!info.detail?.includes("Which tier?"));
    assert.deepStrictEqual(buildPendingPayload.call(controller, model)?.questions?.map((question) => question.title), ["Which region?"]);
  });
  test("sends each agent session label so two waiting sessions can be told apart", () => {
    const controller = createController(
      new TestVoiceClientService(),
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      new TestAgentSessionsService([
        agentSessionEntry("vscode-chat://a", "Auth fix", AgentSessionStatus.NeedsInput),
        agentSessionEntry("vscode-chat://b", "Billing refactor", AgentSessionStatus.InProgress)
      ])
    );
    const buildSessionContext = Reflect.get(controller, "_buildSessionContext");
    const labels = buildSessionContext.call(controller).sessions.map((session) => session.label);
    assert.deepStrictEqual(labels, ["Auth fix", "Billing refactor"]);
  });
  test("omits the label for an unlabelled agent session rather than sending an empty one", () => {
    const controller = createController(
      new TestVoiceClientService(),
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      new TestAgentSessionsService([agentSessionEntry("vscode-chat://a", void 0, AgentSessionStatus.NeedsInput)])
    );
    const buildSessionContext = Reflect.get(controller, "_buildSessionContext");
    const [session] = buildSessionContext.call(controller).sessions;
    assert.strictEqual(session.id, "vscode-chat://a");
    assert.ok(!Object.hasOwn(session, "label"));
  });
  test("sends the agent session label once its model is resident too", () => {
    const chatService = new ControllableChatService();
    const resource = URI.parse("vscode-chat://a");
    chatService.setModels([pendingConfirmationModel(resource)]);
    const controller = createController(
      new TestVoiceClientService(),
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      chatService,
      void 0,
      new TestAgentSessionsService([agentSessionEntry(resource.toString(), "Auth fix", AgentSessionStatus.NeedsInput)])
    );
    const buildSessionContext = Reflect.get(controller, "_buildSessionContext");
    controller.setTargetSession(resource);
    const [session] = buildSessionContext.call(controller).sessions;
    assert.strictEqual(session.agent_state, "waiting_for_confirmation");
    assert.strictEqual(session.label, "Auth fix");
  });
  test("an older tool confirmation holds the turn ahead of a newer form", () => {
    const controller = createController(new TestVoiceClientService());
    const buildPendingPayload = Reflect.get(controller, "_buildPendingPayload");
    const getAgentStateInfo = Reflect.get(controller, "_getAgentStateInfo");
    const approval = {
      kind: "toolInvocation",
      invocationMessage: "Run a command",
      state: observableValue("state", {
        type: IChatToolInvocation.StateKind.WaitingForConfirmation,
        parameters: { command: "docker push myapp:latest" }
      })
    };
    const form = { kind: "questionCarousel", questions: [{ id: "tier", type: "singleSelect", title: "Which tier?", options: [] }] };
    const model = pendingPartsModel([approval, form], "req-1", "Run command?");
    assert.strictEqual(buildPendingPayload.call(controller, model)?.type, "approval");
    assert.ok(getAgentStateInfo.call(controller, model).detail?.includes("Run a command"));
  });
  test("an older confirmation suppresses a newer form payload but still speaks", () => {
    const controller = createController(new TestVoiceClientService());
    const buildPendingPayload = Reflect.get(controller, "_buildPendingPayload");
    const getAgentStateInfo = Reflect.get(controller, "_getAgentStateInfo");
    const confirmation = { kind: "confirmation", title: "Delete the branch?" };
    const form = { kind: "questionCarousel", questions: [{ id: "tier", type: "singleSelect", title: "Which tier?", options: [] }] };
    const model = pendingPartsModel([confirmation, form], "req-1", "Delete the branch?");
    assert.strictEqual(buildPendingPayload.call(controller, model), void 0);
    assert.ok(getAgentStateInfo.call(controller, model).detail?.includes("Delete the branch?"));
  });
  test("a newer form answered by mouse leaves the focused form untouched", () => {
    const controller = createController(new TestVoiceClientService());
    const buildPendingPayload = Reflect.get(controller, "_buildPendingPayload");
    const getAgentStateInfo = Reflect.get(controller, "_getAgentStateInfo");
    const older = { kind: "questionCarousel", questions: [{ id: "region", type: "singleSelect", title: "Which region?", options: [] }] };
    const newerAnswered = { kind: "questionCarousel", isUsed: true, questions: [{ id: "tier", type: "singleSelect", title: "Which tier?", options: [] }] };
    const model = pendingPartsModel([older, newerAnswered], "req-1", "Answer questions to continue...");
    assert.deepStrictEqual(buildPendingPayload.call(controller, model)?.questions?.map((question) => question.id), ["region"]);
    const detail = getAgentStateInfo.call(controller, model).detail;
    assert.ok(detail?.includes("Which region?"));
    assert.ok(!detail?.includes("Which tier?"));
  });
  test("fatal disconnect clears routing target and pending confirmations and the tracker cannot repopulate them before reconnect", () => {
    const voiceClientService = new TestVoiceClientService();
    const chatService = new ControllableChatService();
    const controller = createController(voiceClientService, void 0, void 0, void 0, void 0, void 0, chatService);
    const handleFatalDisconnect = Reflect.get(controller, "_handleFatalDisconnect");
    controller.setTargetSession(URI.parse("agent-host-copilot:/session-1"));
    chatService.setModels([pendingConfirmationModel(URI.parse("agent-host-copilot:/session-1"))]);
    assert.strictEqual(controller.pendingToolConfirmations.get().length, 1);
    handleFatalDisconnect.call(controller, 4008, "taken over");
    assert.strictEqual(controller.targetSession.get(), void 0);
    assert.strictEqual(controller.pendingToolConfirmations.get().length, 0);
    chatService.setModels([pendingConfirmationModel(URI.parse("agent-host-copilot:/session-1"))]);
    assert.strictEqual(controller.pendingToolConfirmations.get().length, 0);
  });
  test("barge-in drops delayed audio from the interrupted turn before playing the follow-up", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const commandService = new TestCommandService();
    const controller = createController(
      voiceClientService,
      ttsPlaybackService,
      commandService,
      NullTelemetryService,
      void 0,
      new TestConfigurationService({ "agents.voice.handsFree": true })
    );
    await controller.connect(mainWindow);
    voiceClientService.fireAudioResponse({
      audio: "story-start",
      isFirstChunk: true,
      isFinal: false,
      turnId: "story-turn",
      responseId: "story-response-1"
    });
    voiceClientService.fireAudioResponse({
      audio: "queued-story-segment",
      isFirstChunk: true,
      isFinal: false,
      turnId: "story-turn",
      responseId: "story-response-2"
    });
    voiceClientService.fireSpeechStarted();
    voiceClientService.fireBargeIn({
      turnId: "follow-up-turn",
      interruptedTurnId: "story-turn"
    });
    voiceClientService.fireTranscription({
      text: "actually scratch that and check the code in the repository",
      status: "final",
      turnId: "follow-up-turn",
      revision: 1
    });
    voiceClientService.fireToolCall({
      callId: "send-follow-up",
      name: "send_to_chat",
      args: { text: "actually scratch that and check the code in the repository" }
    });
    await voiceClientService.toolResultReceived;
    voiceClientService.fireAudioResponse({
      audio: "stale-story-continuation",
      isFirstChunk: true,
      isFinal: false,
      turnId: "story-turn",
      responseId: "story-response-2"
    });
    voiceClientService.fireAudioResponse({
      audio: "follow-up-acknowledgement",
      isFirstChunk: true,
      isFinal: false,
      turnId: "follow-up-turn",
      responseId: "follow-up-response"
    });
    assert.deepStrictEqual({
      playedAudio: ttsPlaybackService.playedAudio,
      stopCount: ttsPlaybackService.stopCount,
      transcript: controller.transcriptTurns.get().at(-1),
      acceptedInputs: commandService.acceptedInputs,
      toolResults: voiceClientService.toolResults
    }, {
      playedAudio: ["story-start", "follow-up-acknowledgement"],
      stopCount: 2,
      transcript: {
        speaker: "user",
        text: "actually scratch that and check the code in the repository",
        committed: "",
        isPartial: false
      },
      acceptedInputs: ["actually scratch that and check the code in the repository"],
      toolResults: [{ callId: "send-follow-up", result: "ok" }]
    });
  });
  test("speech-started alone interrupts playback and accepts the scoped passive turn", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    await controller.connect(mainWindow);
    voiceClientService.fireAudioResponse({
      audio: "story-start",
      isFirstChunk: true,
      isFinal: false,
      turnId: "story-turn",
      responseId: "story-response"
    });
    voiceClientService.fireSpeechStarted("follow-up-turn");
    voiceClientService.fireTranscription({
      text: "check the repository instead",
      status: "final",
      turnId: "follow-up-turn",
      revision: 1
    });
    voiceClientService.fireAudioResponse({
      audio: "stale-story",
      isFirstChunk: false,
      isFinal: true,
      turnId: "story-turn",
      responseId: "story-response"
    });
    voiceClientService.fireAudioResponse({
      audio: "follow-up",
      isFirstChunk: true,
      isFinal: false,
      turnId: "follow-up-turn",
      responseId: "follow-up-response"
    });
    assert.deepStrictEqual({
      playedAudio: ttsPlaybackService.playedAudio,
      stopCount: ttsPlaybackService.stopCount,
      transcript: controller.transcriptTurns.get().at(-1)
    }, {
      playedAudio: ["story-start", "follow-up"],
      stopCount: 1,
      transcript: {
        speaker: "user",
        text: "check the repository instead",
        committed: "",
        isPartial: false
      }
    });
  });
  test("stale interrupted audio does not consume follow-up latency telemetry", async () => {
    const voiceClientService = new TestVoiceClientService();
    const telemetryService = new TestTelemetryService();
    const controller = createController(voiceClientService, new TestTtsPlaybackService(), new TestCommandService(), telemetryService);
    await controller.connect(mainWindow);
    voiceClientService.fireSpeechStarted();
    voiceClientService.fireBargeIn({
      turnId: "follow-up-turn",
      interruptedTurnId: "story-turn"
    });
    clock.setSystemTime(5e3);
    Reflect.set(controller, "_telemetryPttDownMs", 500);
    Reflect.set(controller, "_telemetryFirstTranscriptionMs", 750);
    Reflect.set(controller, "_telemetryPttUpMs", 1e3);
    voiceClientService.fireAudioResponse({
      audio: "stale-story",
      isFirstChunk: true,
      isFinal: false,
      turnId: "story-turn",
      responseId: "story-response"
    });
    clock.tick(1e3);
    voiceClientService.fireAudioResponse({
      audio: "follow-up",
      isFirstChunk: true,
      isFinal: false,
      turnId: "follow-up-turn",
      responseId: "follow-up-response"
    });
    assert.deepStrictEqual({
      latencyEvents: telemetryService.events.filter((event) => event.name === "voiceLatency"),
      pendingLatencyStart: Reflect.get(controller, "_telemetryPttUpMs")
    }, {
      latencyEvents: [{
        name: "voiceLatency",
        data: {
          timeToFirstTranscriptionMs: 250,
          endToEndTurnMs: 5e3
        }
      }],
      pendingLatencyStart: void 0
    });
  });
  test("barge-in purges deferred audio before the interrupted session is focused", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const backgroundSession = URI.parse("agent-host-copilot:/background-session");
    await controller.connect(mainWindow);
    voiceClientService.fireAudioResponse({
      audio: "buffered-story",
      isFirstChunk: true,
      isFinal: true,
      codingSessionId: backgroundSession.toString(),
      turnId: "story-turn",
      responseId: "story-response"
    });
    voiceClientService.fireSpeechStarted();
    voiceClientService.fireBargeIn({
      turnId: "follow-up-turn",
      interruptedTurnId: "story-turn"
    });
    controller.setActiveSessionShown(backgroundSession);
    voiceClientService.fireAudioResponse({
      audio: "follow-up",
      isFirstChunk: true,
      isFinal: false,
      codingSessionId: backgroundSession.toString(),
      turnId: "follow-up-turn",
      responseId: "follow-up-response"
    });
    assert.deepStrictEqual(ttsPlaybackService.playedAudio, ["follow-up"]);
  });
  test("speech-started keeps an interrupted solicited narration retryable", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const controller = createController(voiceClientService, ttsPlaybackService);
    const sessionId = "agent-host-copilot:/session-1";
    const narrate = Reflect.get(controller, "_narrate");
    await controller.connect(mainWindow);
    assert.strictEqual(narrate.call(controller, sessionId, "response", "Done"), true);
    voiceClientService.fireAudioResponse({
      audio: "narration",
      isFirstChunk: true,
      isFinal: false,
      responseId: "narration-1"
    });
    voiceClientService.fireSpeechStarted();
    voiceClientService.fireNarrationInterrupted({
      narrationId: "narration-1",
      codingSessionId: sessionId
    });
    Reflect.set(controller, "_currentNarratable", () => ({ kind: "response", text: "Done" }));
    controller.setActiveSessionShown(URI.parse(sessionId));
    voiceClientService.fireNarrationUnblocked({
      narrationId: "narration-1",
      codingSessionId: sessionId
    });
    const retryRequest = voiceClientService.requests.at(-1);
    if (!retryRequest) {
      throw new Error("Retry narration was not requested");
    }
    voiceClientService.fireAudioResponse({
      audio: "retry",
      isFirstChunk: true,
      isFinal: false,
      turnId: "retry-turn",
      responseId: retryRequest.narrationId
    });
    const pendingSolicitedNarrations = Reflect.get(controller, "_pendingSolicitedNarrations");
    const deferredNarrations = Reflect.get(controller, "_deferredNarrations");
    assert.deepStrictEqual({
      requests: voiceClientService.requests,
      playedAudio: ttsPlaybackService.playedAudio,
      pendingSolicitedNarrations: [...pendingSolicitedNarrations.keys()],
      deferredNarrations: deferredNarrations.size
    }, {
      requests: [{
        sessionId,
        kind: "response",
        text: "Done",
        narrationId: "narration-1"
      }, {
        sessionId,
        kind: "response",
        text: "Done",
        narrationId: "narration-2"
      }],
      playedAudio: ["narration", "retry"],
      pendingSolicitedNarrations: ["narration-2"],
      deferredNarrations: 0
    });
  });
  test("explicit PTT drops stale first chunks before the backend barge-in arrives", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const micCaptureService = new TestMicCaptureService();
    const controller = createController(
      voiceClientService,
      ttsPlaybackService,
      new TestCommandService(),
      NullTelemetryService,
      micCaptureService
    );
    await controller.connect(mainWindow);
    Reflect.get(controller, "_isConnected").set(true, void 0);
    voiceClientService.fireAudioResponse({
      audio: "story-start",
      isFirstChunk: true,
      isFinal: false,
      turnId: "story-turn",
      responseId: "story-response"
    });
    controller.pttDown();
    voiceClientService.fireAudioResponse({
      audio: "stale-story",
      isFirstChunk: true,
      isFinal: false,
      turnId: "story-turn",
      responseId: "story-response"
    });
    assert.deepStrictEqual({
      playedAudio: ttsPlaybackService.playedAudio,
      pttTurns: micCaptureService.pttTurns.length
    }, {
      playedAudio: ["story-start"],
      pttTurns: 1
    });
  });
  test("manual PTT promotes passive hands-free capture without replaying stale audio", async () => {
    const voiceClientService = new TestVoiceClientService();
    const ttsPlaybackService = new TestTtsPlaybackService();
    const micCaptureService = new TestMicCaptureService();
    const controller = createController(
      voiceClientService,
      ttsPlaybackService,
      new TestCommandService(),
      NullTelemetryService,
      micCaptureService,
      new TestConfigurationService({ "agents.voice.handsFree": true })
    );
    await controller.connect(mainWindow);
    Reflect.get(controller, "_isConnected").set(true, void 0);
    Reflect.set(controller, "_window", { document: { hasFocus: () => true } });
    voiceClientService.fireAudioResponse({
      audio: "story-start",
      isFirstChunk: true,
      isFinal: false,
      turnId: "story-turn",
      responseId: "story-response"
    });
    const passiveTurnId = micCaptureService.pttTurns[0];
    controller.pttDown();
    voiceClientService.fireAudioResponse({
      audio: "stale-story",
      isFirstChunk: true,
      isFinal: false,
      turnId: "story-turn",
      responseId: "story-response"
    });
    assert.deepStrictEqual({
      playedAudio: ttsPlaybackService.playedAudio,
      pttTurns: micCaptureService.pttTurns,
      passiveTurnPromoted: Reflect.get(controller, "_pttHeld") && !Reflect.get(controller, "_bargeInListenActive")
    }, {
      playedAudio: ["story-start"],
      pttTurns: [passiveTurnId],
      passiveTurnPromoted: true
    });
  });
  test("forced pttDown cancels pending toggle mode and keeps the turn recording instead of finishing it", async () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    await controller.connect(mainWindow);
    Reflect.get(controller, "_isConnected").set(true, void 0);
    clock.setSystemTime(5e3);
    controller.pttDown();
    controller.pttUp();
    assert.deepStrictEqual({
      toggle: Reflect.get(controller, "_pttToggleMode"),
      held: Reflect.get(controller, "_pttHeld")
    }, { toggle: true, held: true }, "short tap enters toggle mode while still recording");
    controller.pttDown("explicit", true);
    assert.deepStrictEqual({
      toggle: Reflect.get(controller, "_pttToggleMode"),
      held: Reflect.get(controller, "_pttHeld")
    }, { toggle: false, held: true }, "forced pttDown bypasses toggle mode and stays recording");
  });
  test("forced pttUp finishes a sub-threshold turn instead of entering toggle mode", async () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    await controller.connect(mainWindow);
    Reflect.get(controller, "_isConnected").set(true, void 0);
    controller.pttDown();
    assert.strictEqual(Reflect.get(controller, "_pttHeld"), true, "pttDown starts recording");
    controller.pttUp("explicit", true);
    assert.deepStrictEqual({
      toggle: Reflect.get(controller, "_pttToggleMode"),
      held: Reflect.get(controller, "_pttHeld")
    }, { toggle: false, held: false }, "forced pttUp finishes the turn rather than entering toggle mode");
  });
  test("restores idle state when solicited narration never starts returning audio", () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    const narrate = Reflect.get(controller, "_narrate");
    const pendingSolicitedNarrations = Reflect.get(controller, "_pendingSolicitedNarrations");
    assert.strictEqual(narrate.call(controller, "agent-host-copilot:/session-1", "response", "Done"), true);
    assert.deepStrictEqual(voiceClientService.requests, [{
      sessionId: "agent-host-copilot:/session-1",
      kind: "response",
      text: "Done",
      narrationId: "narration-1"
    }]);
    clock.tick(3e4);
    assert.strictEqual(controller.voiceState.get(), "idle");
    assert.strictEqual(controller.statusText.get(), "Hold to speak...");
    assert.strictEqual(pendingSolicitedNarrations.size, 0);
  });
  test("stops the audio-start watchdog once audio arrives and does not time out the stream", () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    const narrate = Reflect.get(controller, "_narrate");
    const markAudioStarted = Reflect.get(controller, "_markSolicitedNarrationAudioStarted");
    const pendingSolicitedNarrations = Reflect.get(controller, "_pendingSolicitedNarrations");
    assert.strictEqual(narrate.call(controller, URI.parse("agent-host-copilot:/session-2").toString(), "response", "Ready"), true);
    clock.tick(1e4);
    markAudioStarted.call(controller, "narration-1");
    clock.tick(12e4);
    assert.strictEqual(pendingSolicitedNarrations.size, 1);
    assert.strictEqual(controller.statusText.get(), "Tap to start");
  });
  test("does not restore state while another solicited narration is still awaiting audio", () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    const narrate = Reflect.get(controller, "_narrate");
    const pendingSolicitedNarrations = Reflect.get(controller, "_pendingSolicitedNarrations");
    assert.strictEqual(narrate.call(controller, "agent-host-copilot:/session-a", "response", "First"), true);
    clock.tick(15e3);
    assert.strictEqual(narrate.call(controller, "agent-host-copilot:/session-b", "response", "Second"), true);
    assert.strictEqual(pendingSolicitedNarrations.size, 2);
    clock.tick(15e3);
    assert.strictEqual(pendingSolicitedNarrations.size, 1);
    assert.strictEqual(controller.statusText.get(), "Tap to start");
    clock.tick(15e3);
    assert.strictEqual(pendingSolicitedNarrations.size, 0);
    assert.strictEqual(controller.voiceState.get(), "idle");
    assert.strictEqual(controller.statusText.get(), "Hold to speak...");
  });
  test("does not restore state while a direct reply is still awaited", () => {
    const voiceClientService = new TestVoiceClientService();
    const controller = createController(voiceClientService);
    const narrate = Reflect.get(controller, "_narrate");
    const setAwaitingReply = Reflect.get(controller, "_setAwaitingReply");
    const pendingSolicitedNarrations = Reflect.get(controller, "_pendingSolicitedNarrations");
    assert.strictEqual(narrate.call(controller, "agent-host-copilot:/session-c", "response", "Done"), true);
    clock.tick(1e3);
    setAwaitingReply.call(controller);
    clock.tick(29e3);
    assert.strictEqual(pendingSolicitedNarrations.size, 0);
    assert.strictEqual(controller.statusText.get(), "Tap to start");
  });
  test("auto-listen opens a passive mic turn so the backend does not latch user_is_speaking", () => {
    const voiceClientService = new TestVoiceClientService();
    const mic = new RecordingMicCaptureService();
    const controller = createController(voiceClientService, void 0, void 0, void 0, mic);
    Reflect.get(controller, "_isConnected").set(true, void 0);
    Reflect.set(controller, "_window", { document: { hasFocus: () => true } });
    const enterAutoListen = Reflect.get(controller, "_enterAutoListen");
    enterAutoListen.call(controller);
    assert.strictEqual(mic.pttDownCalls.length, 1);
    assert.strictEqual(mic.pttDownCalls[0].passive, true);
  });
  test("connect only arms listening automatically in hands-free mode", () => {
    const manualVoiceClientService = new TestVoiceClientService();
    const manualController = createController(
      manualVoiceClientService,
      void 0,
      void 0,
      void 0,
      void 0,
      new TestConfigurationService({ "agents.voice.handsFree": false })
    );
    const handsFreeVoiceClientService = new TestVoiceClientService();
    const handsFreeController = createController(
      handsFreeVoiceClientService,
      void 0,
      void 0,
      void 0,
      void 0,
      new TestConfigurationService({ "agents.voice.handsFree": true })
    );
    const manualShouldArm = Reflect.get(manualController, "_shouldEnterListenOnSessionInit");
    const handsFreeShouldArm = Reflect.get(handsFreeController, "_shouldEnterListenOnSessionInit");
    assert.deepStrictEqual({
      manualFreshConnect: manualShouldArm.call(manualController, false),
      handsFreeFreshConnect: handsFreeShouldArm.call(handsFreeController, false),
      handsFreeResume: handsFreeShouldArm.call(handsFreeController, true)
    }, {
      manualFreshConnect: false,
      handsFreeFreshConnect: true,
      handsFreeResume: false
    });
  });
  test("stopping listening in manual mode submits the transcript", async () => {
    const voiceClientService = new TestVoiceClientService();
    const commandService = new TestCommandService();
    const controller = createController(voiceClientService, void 0, commandService);
    await controller.connect(mainWindow);
    Reflect.get(controller, "_isConnected").set(true, void 0);
    controller.pttDown();
    controller.stopListening();
    voiceClientService.fireToolCall({
      callId: "manual-transcription",
      name: "send_to_chat",
      args: { text: "send this when listening stops" }
    });
    await voiceClientService.toolResultReceived;
    assert.deepStrictEqual(commandService.acceptedInputs, ["send this when listening stops"]);
  });
  test("auto-listen is skipped when window does not have focus (multi-window hands-free)", () => {
    const voiceClientService = new TestVoiceClientService();
    const mic = new RecordingMicCaptureService();
    const controller = createController(voiceClientService, void 0, void 0, void 0, mic);
    Reflect.get(controller, "_isConnected").set(true, void 0);
    Reflect.set(controller, "_window", { document: { hasFocus: () => false } });
    const enterAutoListen = Reflect.get(controller, "_enterAutoListen");
    enterAutoListen.call(controller);
    assert.strictEqual(mic.pttDownCalls.length, 0);
  });
  test("window blur aborts an open passive turn so the background window stops recording", () => {
    const voiceClientService = new TestVoiceClientService();
    const mic = new RecordingMicCaptureService();
    const controller = createController(voiceClientService, void 0, void 0, void 0, mic);
    Reflect.get(controller, "_isConnected").set(true, void 0);
    Reflect.set(controller, "_pttCurrentTurnId", "passive-turn");
    Reflect.set(controller, "_pttCurrentTurnPassive", true);
    Reflect.set(controller, "_pttHeld", true);
    Reflect.get(controller, "_onWindowBlur").call(controller);
    assert.strictEqual(mic.abortCalls, 1);
    assert.strictEqual(Reflect.get(controller, "_pttHeld"), false);
  });
  test("window blur does not abort a deliberate (non-passive) turn", () => {
    const voiceClientService = new TestVoiceClientService();
    const mic = new RecordingMicCaptureService();
    const controller = createController(voiceClientService, void 0, void 0, void 0, mic);
    Reflect.get(controller, "_isConnected").set(true, void 0);
    Reflect.set(controller, "_pttCurrentTurnId", "deliberate-turn");
    Reflect.set(controller, "_pttCurrentTurnPassive", false);
    Reflect.set(controller, "_pttHeld", true);
    Reflect.get(controller, "_onWindowBlur").call(controller);
    assert.strictEqual(mic.abortCalls, 0);
    assert.strictEqual(Reflect.get(controller, "_pttHeld"), true);
  });
  test("window focus re-arms hands-free auto-listen in the focused window", () => {
    const voiceClientService = new TestVoiceClientService();
    const mic = new RecordingMicCaptureService();
    const controller = createController(
      voiceClientService,
      void 0,
      void 0,
      void 0,
      mic,
      new TestConfigurationService({ "agents.voice.handsFree": true })
    );
    Reflect.get(controller, "_isConnected").set(true, void 0);
    Reflect.set(controller, "_window", { document: { hasFocus: () => true } });
    Reflect.get(controller, "_onWindowFocus").call(controller);
    assert.strictEqual(mic.pttDownCalls.length, 1);
    assert.strictEqual(mic.pttDownCalls[0].passive, true);
  });
  test("window focus does not re-arm auto-listen when hands-free is disabled", () => {
    const voiceClientService = new TestVoiceClientService();
    const mic = new RecordingMicCaptureService();
    const controller = createController(
      voiceClientService,
      void 0,
      void 0,
      void 0,
      mic,
      new TestConfigurationService({ "agents.voice.handsFree": false })
    );
    Reflect.get(controller, "_isConnected").set(true, void 0);
    Reflect.set(controller, "_window", { document: { hasFocus: () => true } });
    Reflect.get(controller, "_onWindowFocus").call(controller);
    assert.strictEqual(mic.pttDownCalls.length, 0);
  });
  test("a deliberate user press opens a non-passive mic turn", () => {
    const voiceClientService = new TestVoiceClientService();
    const mic = new RecordingMicCaptureService();
    const controller = createController(voiceClientService, void 0, void 0, void 0, mic);
    Reflect.get(controller, "_isConnected").set(true, void 0);
    controller.pttDown();
    assert.strictEqual(mic.pttDownCalls.length, 1);
    assert.strictEqual(mic.pttDownCalls[0].passive, false);
  });
  test("a deliberate press awaiting narration is preserved so its ptt_end clears the backend latch", () => {
    const voiceClientService = new TestVoiceClientService();
    const mic = new RecordingMicCaptureService();
    const controller = createController(voiceClientService, void 0, void 0, void 0, mic);
    Reflect.get(controller, "_isConnected").set(true, void 0);
    controller.pttDown();
    assert.strictEqual(Reflect.get(controller, "_pttHeld"), true);
    Reflect.get(controller, "_prepareForPlayback").call(controller);
    assert.strictEqual(mic.abortCalls, 0);
    assert.strictEqual(Reflect.get(controller, "_pttHeld"), true);
  });
  test("a passive open-mic turn is torn down for playback since it never latched", () => {
    const voiceClientService = new TestVoiceClientService();
    const mic = new RecordingMicCaptureService();
    const controller = createController(voiceClientService, void 0, void 0, void 0, mic);
    Reflect.get(controller, "_isConnected").set(true, void 0);
    Reflect.set(controller, "_pttCurrentTurnId", "passive-turn");
    Reflect.set(controller, "_pttCurrentTurnPassive", true);
    Reflect.set(controller, "_pttHeld", true);
    Reflect.get(controller, "_prepareForPlayback").call(controller);
    assert.strictEqual(mic.abortCalls, 1);
    assert.strictEqual(Reflect.get(controller, "_pttHeld"), false);
  });
  test("a held deliberate press keeps buffered narration deferred instead of playing over the press", () => {
    const voiceClientService = new TestVoiceClientService();
    const mic = new RecordingMicCaptureService();
    const controller = createController(voiceClientService, void 0, void 0, void 0, mic);
    Reflect.get(controller, "_isConnected").set(true, void 0);
    Reflect.set(controller, "_pttCurrentTurnId", "deliberate-turn");
    Reflect.set(controller, "_pttCurrentTurnPassive", false);
    Reflect.set(controller, "_pttHeld", true);
    const deferred = Reflect.get(controller, "_deferredResponses");
    deferred.set("session-1", [{
      responseId: "r1",
      finalized: true,
      chunks: [{ audio: "AAAA", isFirstChunk: true, isFinal: true, transcript: "hello there" }]
    }]);
    const flush = Reflect.get(controller, "_flushDeferredResponse");
    const result = flush.call(controller, "session-1");
    assert.strictEqual(result.flushed, false);
    assert.strictEqual(result.retained, true);
    assert.strictEqual(Reflect.get(controller, "_currentPlaybackSessionId"), null);
    assert.strictEqual(Reflect.get(controller, "_audioQueue").length, 0);
    const remaining = deferred.get("session-1");
    assert.ok(remaining && remaining.length === 1, "buffered response should remain deferred");
    assert.strictEqual(Reflect.get(controller, "_pttHeld"), true);
  });
  test("a buffered reply retained under a held press is not re-narrated (no duplicate on release)", () => {
    const voiceClientService = new TestVoiceClientService();
    const mic = new RecordingMicCaptureService();
    const controller = createController(voiceClientService, void 0, void 0, void 0, mic);
    Reflect.get(controller, "_isConnected").set(true, void 0);
    const key = URI.parse("agent-host-copilot:/session-1").toString();
    Reflect.set(controller, "_pttCurrentTurnId", "deliberate-turn");
    Reflect.set(controller, "_pttCurrentTurnPassive", false);
    Reflect.set(controller, "_pttHeld", true);
    const deferred = Reflect.get(controller, "_deferredResponses");
    deferred.set(key, [{
      responseId: "r1",
      finalized: true,
      chunks: [{ audio: "AAAA", isFirstChunk: true, isFinal: true, transcript: "all done" }]
    }]);
    Reflect.get(controller, "_pendingResponseSummaries").set(key, "all done");
    Reflect.get(controller, "_activateShownSession").call(controller, URI.parse(key));
    assert.strictEqual(voiceClientService.requests.length, 0, "no narration should be requested while the press retains the buffer");
    const remaining = deferred.get(key);
    assert.ok(remaining && remaining.length === 1, "buffered reply stays deferred for release");
  });
  test("a different pending reply is still narrated when an unrelated buffer is retained under a held press", () => {
    const voiceClientService = new TestVoiceClientService();
    const mic = new RecordingMicCaptureService();
    const controller = createController(voiceClientService, void 0, void 0, void 0, mic);
    Reflect.get(controller, "_isConnected").set(true, void 0);
    const key = URI.parse("agent-host-copilot:/session-1").toString();
    Reflect.set(controller, "_pttCurrentTurnId", "deliberate-turn");
    Reflect.set(controller, "_pttCurrentTurnPassive", false);
    Reflect.set(controller, "_pttHeld", true);
    const deferred = Reflect.get(controller, "_deferredResponses");
    deferred.set(key, [{
      responseId: "r1",
      finalized: true,
      chunks: [{ audio: "AAAA", isFirstChunk: true, isFinal: true, transcript: "old reply" }]
    }]);
    Reflect.get(controller, "_pendingResponseSummaries").set(key, "a different newer reply");
    Reflect.get(controller, "_activateShownSession").call(controller, URI.parse(key));
    assert.strictEqual(voiceClientService.requests.length, 1, "the different reply must still be narrated");
    assert.strictEqual(voiceClientService.requests[0].text, "a different newer reply");
    const remaining = deferred.get(key);
    assert.ok(remaining && remaining.length === 1, "the unrelated buffered reply stays deferred");
  });
  test("promoting a passive barge-in listen clears the passive flag so playback preserves the press", () => {
    const voiceClientService = new TestVoiceClientService();
    const mic = new RecordingMicCaptureService();
    const controller = createController(voiceClientService, void 0, void 0, void 0, mic);
    Reflect.get(controller, "_isConnected").set(true, void 0);
    Reflect.set(controller, "_bargeInListenActive", true);
    Reflect.set(controller, "_pttHeld", true);
    Reflect.set(controller, "_pttCurrentTurnPassive", true);
    controller.pttDown();
    assert.strictEqual(Reflect.get(controller, "_pttCurrentTurnPassive"), false);
    const prepared = Reflect.get(controller, "_prepareForPlayback").call(controller);
    assert.strictEqual(prepared, false);
    assert.strictEqual(mic.abortCalls, 0);
    assert.strictEqual(Reflect.get(controller, "_pttHeld"), true);
  });
});
suite("VoiceSessionController live transcription", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createController(options = {}) {
    const liveTranscript = options.liveTranscript ?? true;
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    const persisted = [];
    instantiationService.stub(IVoiceClientService, {
      disconnect: () => {
      }
    });
    instantiationService.stub(IMicCaptureService, {
      isMuted: false,
      pttDown: async () => {
      },
      pttUp: () => {
      },
      abortPtt: () => {
      },
      stopCapture: () => {
      },
      suppressUntil: () => {
      }
    });
    instantiationService.stub(ITtsPlaybackService, {
      isPlaying: false,
      stopPlayback: () => {
      },
      closeContext: () => {
      }
    });
    instantiationService.stub(IVoiceToolDispatchService, {
      setDelegate: () => {
      }
    });
    instantiationService.stub(IVoicePlaybackService, {
      notifyPlaybackEnd: () => {
      }
    });
    const agentSessionsModel = {
      onWillResolve: Event.None,
      onDidResolve: Event.None,
      onDidChangeSessions: Event.None,
      onDidChangeSessionArchivedState: Event.None,
      resolved: true,
      sessions: [],
      getSession: () => void 0,
      observeSession: () => observableValue("testSession", void 0),
      resolve: async () => {
      }
    };
    instantiationService.stub(IAgentSessionsService, { model: agentSessionsModel });
    instantiationService.stub(IChatService, new MockChatService());
    instantiationService.stub(IVoiceTranscriptStore, {
      appendTurn: async (_userId, turn) => {
        persisted.push(turn);
      }
    });
    instantiationService.stub(IConfigurationService, new TestConfigurationService({
      "agents.voice.liveTranscript": liveTranscript
    }));
    instantiationService.stub(IAccessibilitySignalService, {
      playSignal: async () => {
      }
    });
    instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
    instantiationService.stub(IChatWidgetService, {
      lastFocusedWidget: void 0,
      onDidAddWidget: Event.None,
      onDidChangeFocusedSession: Event.None,
      getAllWidgets: () => []
    });
    const controller = store.add(instantiationService.createInstance(VoiceSessionController));
    controller["_isConnected"].set(true, void 0);
    controller["_userLogin"] = "test-user";
    return { controller, persisted };
  }
  function beginTurn(controller) {
    controller.pttDown();
    return controller["_pttCurrentTurnId"];
  }
  function finishTurn(controller) {
    controller["_finishPtt"]("local");
  }
  function transcribe(controller, event) {
    controller["_handleTranscription"](event);
  }
  test("replaces cumulative partials and final exactly once", () => {
    const { controller, persisted } = createController();
    const turnId = beginTurn(controller);
    transcribe(controller, { text: "open", committed: "op", status: "partial", turnId, revision: 1 });
    transcribe(controller, { text: "open the file", committed: "open ", status: "partial", turnId, revision: 2 });
    transcribe(controller, { text: "stale lower", committed: "", status: "partial", turnId, revision: 1 });
    transcribe(controller, { text: "stale same", committed: "", status: "partial", turnId, revision: 2 });
    finishTurn(controller);
    transcribe(controller, { text: "delete the file instead", status: "final", turnId, revision: 3 });
    transcribe(controller, { text: "late partial", status: "partial", turnId, revision: 4 });
    transcribe(controller, { text: "duplicate final", status: "final", turnId, revision: 5 });
    assert.deepStrictEqual({
      turns: controller.transcriptTurns.get(),
      persisted: persisted.map((turn) => turn.text)
    }, {
      turns: [{
        speaker: "user",
        text: "delete the file instead",
        committed: "",
        isPartial: false
      }],
      persisted: ["delete the file instead"]
    });
  });
  test("ignores a scoped event for another turn", () => {
    const { controller, persisted } = createController();
    const turnId = beginTurn(controller);
    transcribe(controller, { text: "wrong turn", status: "final", turnId: `${turnId}-other`, revision: 1 });
    finishTurn(controller);
    assert.deepStrictEqual({
      turns: controller.transcriptTurns.get(),
      persisted
    }, {
      turns: [{ speaker: "user", text: "", committed: "", isPartial: true }],
      persisted: []
    });
  });
  test("accepts the final after auto-end", () => {
    const { controller, persisted } = createController();
    const turnId = beginTurn(controller);
    transcribe(controller, { text: "run the tests", committed: "run ", status: "partial", turnId, revision: 1 });
    controller["_handleTurnAutoEnded"]({ reason: "vad_silence", turnId });
    transcribe(controller, { text: "run the focused tests", status: "final", turnId, revision: 2 });
    assert.deepStrictEqual({
      turns: controller.transcriptTurns.get(),
      persisted: persisted.map((turn) => turn.text)
    }, {
      turns: [{ speaker: "user", text: "run the focused tests", committed: "", isPartial: false }],
      persisted: ["run the focused tests"]
    });
  });
  test("a new turn resets revision tracking", () => {
    const { controller } = createController();
    const firstTurnId = beginTurn(controller);
    transcribe(controller, { text: "first turn", status: "partial", turnId: firstTurnId, revision: 10 });
    finishTurn(controller);
    const secondTurnId = beginTurn(controller);
    transcribe(controller, { text: "second turn", committed: "second ", status: "partial", turnId: secondTurnId, revision: 1 });
    finishTurn(controller);
    assert.deepStrictEqual(controller.transcriptTurns.get(), [
      { speaker: "user", text: "first turn", committed: "", isPartial: true },
      { speaker: "user", text: "second turn", committed: "second ", isPartial: true }
    ]);
  });
  test("unscoped legacy events retain replacement and persistence behavior", () => {
    const { controller, persisted } = createController();
    transcribe(controller, { text: "legacy partial", committed: "legacy ", status: "partial" });
    transcribe(controller, { text: "legacy final corrected", status: "final" });
    assert.deepStrictEqual({
      turns: controller.transcriptTurns.get(),
      persisted: persisted.map((turn) => turn.text)
    }, {
      turns: [{ speaker: "user", text: "legacy final corrected", committed: "", isPartial: false }],
      persisted: ["legacy final corrected"]
    });
  });
  test("barge-in and reconnect clear scoped turn tracking", () => {
    const { controller, persisted } = createController();
    const bargeInTurnId = beginTurn(controller);
    finishTurn(controller);
    controller["_handleBargeIn"]({ turnId: "new-turn", interruptedTurnId: bargeInTurnId });
    transcribe(controller, { text: "after barge-in", status: "final", turnId: bargeInTurnId, revision: 1 });
    controller["_isConnected"].set(true, void 0);
    const reconnectTurnId = beginTurn(controller);
    finishTurn(controller);
    controller["_onConnectionLost"]();
    transcribe(controller, { text: "after reconnect", status: "final", turnId: reconnectTurnId, revision: 1 });
    assert.deepStrictEqual(persisted, []);
  });
  test("skips live partials when live transcript is disabled but keeps the final", () => {
    const { controller, persisted } = createController({ liveTranscript: false });
    const turnId = beginTurn(controller);
    transcribe(controller, { text: "open", committed: "op", status: "partial", turnId, revision: 1 });
    transcribe(controller, { text: "open the file", committed: "open ", status: "partial", turnId, revision: 2 });
    finishTurn(controller);
    transcribe(controller, { text: "open the file", status: "final", turnId, revision: 3 });
    assert.deepStrictEqual({
      turns: controller.transcriptTurns.get(),
      persisted: persisted.map((turn) => turn.text)
    }, {
      turns: [{ speaker: "user", text: "open the file", committed: "", isPartial: false }],
      persisted: ["open the file"]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCBzaW5vbiBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgVGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS90ZXN0L2NvbW1vbi90ZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eVNpZ25hbC9icm93c2VyL2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvbiwgSU5vdGlmaWNhdGlvbkhhbmRsZSwgSU5vdGlmaWNhdGlvblNlcnZpY2UsIE5vT3BOb3RpZmljYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Tm90aWZpY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSVZvaWNlVHJhbnNjcmlwdFN0b3JlLCBJVm9pY2VUcmFuc2NyaXB0VHVybiB9IGZyb20gJy4uLy4uLy4uLy4uL2FnZW50c1ZvaWNlL2NvbW1vbi92b2ljZVRyYW5zY3JpcHRTdG9yZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25TdGF0dXMsIElBZ2VudFNlc3Npb25zTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc01vZGVsLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSU1pY0NhcHR1cmVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci92b2ljZUNsaWVudC9taWNDYXB0dXJlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVHRzUGxheWJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci92b2ljZUNsaWVudC90dHNQbGF5YmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIsIFZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSVZvaWNlVG9vbERpc3BhdGNoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvdm9pY2VDbGllbnQvdm9pY2VUb29sRGlzcGF0Y2hTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRTZW5kUmVzdWx0LCBFbGljaXRhdGlvblN0YXRlLCBJQ2hhdENvbmZpcm1hdGlvbiwgSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMsIElDaGF0U2VydmljZSwgSUNoYXRUb29sSW52b2NhdGlvbiwgVG9vbENvbmZpcm1LaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm9tcHRzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBkZXJpdmVQZW5kaW5nSWQsIElWb2ljZUF1ZGlvUmVzcG9uc2UsIElWb2ljZUJhcmdlSW4sIElWb2ljZUNoZWNrcG9pbnROYXJyYXRpb25NZXRhZGF0YSwgSVZvaWNlQ2xpZW50U2VydmljZSwgSVZvaWNlRGlzcGF0Y2hSZXN1bHQsIElWb2ljZU5hcnJhdGlvbkFjaywgSVZvaWNlTmFycmF0aW9uU2lnbmFsLCBJVm9pY2VTZXNzaW9uQ29udGV4dCwgSVZvaWNlU3BlZWNoU3RhcnRlZCwgSVZvaWNlVG9vbENhbGwsIElWb2ljZVRyYW5zY3JpcHRpb24sIHBlZWtQZW5kaW5nSWQsIFZvaWNlQ29uZmlybWF0aW9uVHlwZSwgVm9pY2VOYXJyYXRpb25LaW5kLCBWT0lDRV9BR0VOVF9QUk9HUkVTU19TRVRUSU5HIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZvaWNlQ2xpZW50L3ZvaWNlQ2xpZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsLCBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50LCBJQ2hhdFJlc3BvbnNlTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IENoYXRFbGljaXRhdGlvblJlcXVlc3RQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRFbGljaXRhdGlvblJlcXVlc3RQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRQbGFuUmV2aWV3RGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0UGxhblJldmlld0RhdGEuanMnO1xuaW1wb3J0IHsgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRRdWVzdGlvbkNhcm91c2VsRGF0YS5qcyc7XG5pbXBvcnQgeyBJVm9pY2VQbGF5YmFja1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdm9pY2VQbGF5YmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXNrUXVlc3Rpb25zVG9vbElkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9hc2tRdWVzdGlvbnNUb29sLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9tb2NrQ2hhdFNlcnZpY2UuanMnO1xuXG5jbGFzcyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJVm9pY2VDbGllbnRTZXJ2aWNlPigpIHtcblx0cHJpdmF0ZSBuYXJyYXRpb25Db3VudGVyID0gMDtcblx0cmVhZG9ubHkgcmVxdWVzdHM6IHsgc2Vzc2lvbklkOiBzdHJpbmc7IGtpbmQ6IFZvaWNlTmFycmF0aW9uS2luZDsgdGV4dDogc3RyaW5nOyBuYXJyYXRpb25JZDogc3RyaW5nOyBwZW5kaW5nSWQ/OiBzdHJpbmc7IGNoZWNrcG9pbnQ/OiBJVm9pY2VDaGVja3BvaW50TmFycmF0aW9uTWV0YWRhdGE7IGNvbmZpcm1hdGlvblR5cGU/OiBWb2ljZUNvbmZpcm1hdGlvblR5cGUgfVtdID0gW107XG5cdHJlYWRvbmx5IHNlc3Npb25Db21tYW5kczogKCdzdGFydCcgfCAncmVzdW1lJylbXSA9IFtdO1xuXHRyZWFkb25seSBzZXNzaW9uQ29tbWFuZFNlbnQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYXVkaW9SZXNwb25zZUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxJVm9pY2VBdWRpb1Jlc3BvbnNlPigpO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkF1ZGlvUmVzcG9uc2UgPSB0aGlzLmF1ZGlvUmVzcG9uc2VFbWl0dGVyLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGJhcmdlSW5FbWl0dGVyID0gbmV3IEVtaXR0ZXI8SVZvaWNlQmFyZ2VJbj4oKTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25CYXJnZUluID0gdGhpcy5iYXJnZUluRW1pdHRlci5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSB0cmFuc2NyaXB0aW9uRW1pdHRlciA9IG5ldyBFbWl0dGVyPElWb2ljZVRyYW5zY3JpcHRpb24+KCk7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uVHJhbnNjcmlwdGlvbiA9IHRoaXMudHJhbnNjcmlwdGlvbkVtaXR0ZXIuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgdG9vbENhbGxFbWl0dGVyID0gbmV3IEVtaXR0ZXI8SVZvaWNlVG9vbENhbGw+KCk7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uVG9vbENhbGwgPSB0aGlzLnRvb2xDYWxsRW1pdHRlci5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBzcGVlY2hTdGFydGVkRW1pdHRlciA9IG5ldyBFbWl0dGVyPElWb2ljZVNwZWVjaFN0YXJ0ZWQ+KCk7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uU3BlZWNoU3RhcnRlZCA9IHRoaXMuc3BlZWNoU3RhcnRlZEVtaXR0ZXIuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbmFycmF0aW9uQWNrRW1pdHRlciA9IG5ldyBFbWl0dGVyPElWb2ljZU5hcnJhdGlvbkFjaz4oKTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25OYXJyYXRpb25BY2sgPSB0aGlzLm5hcnJhdGlvbkFja0VtaXR0ZXIuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbmFycmF0aW9uVW5ibG9ja2VkRW1pdHRlciA9IG5ldyBFbWl0dGVyPElWb2ljZU5hcnJhdGlvblNpZ25hbD4oKTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25OYXJyYXRpb25VbmJsb2NrZWQgPSB0aGlzLm5hcnJhdGlvblVuYmxvY2tlZEVtaXR0ZXIuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbmFycmF0aW9uSW50ZXJydXB0ZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8SVZvaWNlTmFycmF0aW9uU2lnbmFsPigpO1xuXHRvdmVycmlkZSByZWFkb25seSBvbk5hcnJhdGlvbkludGVycnVwdGVkID0gdGhpcy5uYXJyYXRpb25JbnRlcnJ1cHRlZEVtaXR0ZXIuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbkluaXRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8eyBzZXNzaW9uSWQ6IHN0cmluZyB9PigpO1xuXHRvdmVycmlkZSByZWFkb25seSBvblNlc3Npb25Jbml0ID0gdGhpcy5zZXNzaW9uSW5pdEVtaXR0ZXIuZXZlbnQ7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRXJyb3IgPSBFdmVudC5Ob25lO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbm5lY3Rpb25TdGF0ZUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxib29sZWFuPigpO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZSA9IHRoaXMuY29ubmVjdGlvblN0YXRlRW1pdHRlci5ldmVudDtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25GYXRhbERpc2Nvbm5lY3QgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvblR1cm5BdXRvRW5kZWQgPSBFdmVudC5Ob25lO1xuXHRwcml2YXRlIGNvbm5lY3RlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlc3VtaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgcmVjb25uZWN0aW5nID0gZmFsc2U7XG5cblx0b3ZlcnJpZGUgZ2V0IGlzQ29ubmVjdGVkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5jb25uZWN0ZWQ7IH1cblx0b3ZlcnJpZGUgZ2V0IGlzUmVzdW1pbmcoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLnJlc3VtaW5nOyB9XG5cdG92ZXJyaWRlIGdldCB3aWxsUmVjb25uZWN0KCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5yZWNvbm5lY3Rpbmc7IH1cblx0b3ZlcnJpZGUgZGlzY29ubmVjdCgpOiB2b2lkIHsgdGhpcy5jb25uZWN0ZWQgPSBmYWxzZTsgfVxuXHRvdmVycmlkZSBhc3luYyBjb25uZWN0KCk6IFByb21pc2U8dm9pZD4geyB9XG5cdHJlYWRvbmx5IHdpcmVFdmVudHM6ICh7IHR5cGU6ICdzZXNzaW9uX2NvbnRleHQnOyBjb250ZXh0OiBJVm9pY2VTZXNzaW9uQ29udGV4dCB9IHwgeyB0eXBlOiAncmVxdWVzdF9uYXJyYXRpb24nOyBraW5kOiBWb2ljZU5hcnJhdGlvbktpbmQ7IHRleHQ6IHN0cmluZzsgY29uZmlybWF0aW9uVHlwZT86IFZvaWNlQ29uZmlybWF0aW9uVHlwZSB9KVtdID0gW107XG5cdHByaXZhdGUgcGVuZGluZ0NvbnRleHQ6IElWb2ljZVNlc3Npb25Db250ZXh0IHwgdW5kZWZpbmVkO1xuXHRvdmVycmlkZSBzZW5kU2Vzc2lvbkNvbnRleHQoY29udGV4dDogSVZvaWNlU2Vzc2lvbkNvbnRleHQpOiB2b2lkIHtcblx0XHR0aGlzLnBlbmRpbmdDb250ZXh0ID0gY29udGV4dDtcblx0fVxuXHRvdmVycmlkZSBmbHVzaFNlc3Npb25Db250ZXh0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnBlbmRpbmdDb250ZXh0KSB7XG5cdFx0XHR0aGlzLndpcmVFdmVudHMucHVzaCh7IHR5cGU6ICdzZXNzaW9uX2NvbnRleHQnLCBjb250ZXh0OiB0aGlzLnBlbmRpbmdDb250ZXh0IH0pO1xuXHRcdFx0dGhpcy5wZW5kaW5nQ29udGV4dCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblx0b3ZlcnJpZGUgaW52YWxpZGF0ZVNlc3Npb25DYWNoZSgpOiB2b2lkIHsgfVxuXHRvdmVycmlkZSBzZW5kU3RhcnRTZXNzaW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuc2Vzc2lvbkNvbW1hbmRzLnB1c2goJ3N0YXJ0Jyk7XG5cdFx0dGhpcy5zZXNzaW9uQ29tbWFuZFNlbnQuY29tcGxldGUoKTtcblx0fVxuXHRvdmVycmlkZSBzZW5kUmVzdW1lU2Vzc2lvbigpOiB2b2lkIHtcblx0XHR0aGlzLnNlc3Npb25Db21tYW5kcy5wdXNoKCdyZXN1bWUnKTtcblx0XHR0aGlzLnNlc3Npb25Db21tYW5kU2VudC5jb21wbGV0ZSgpO1xuXHR9XG5cdHJlYWRvbmx5IHBsYXliYWNrQ29tcGxldGlvbnM6IHsgc2Vzc2lvbklkOiBzdHJpbmc7IG5hcnJhdGlvbklkOiBzdHJpbmc7IHBsYXliYWNrSWQ6IHN0cmluZyB9W10gPSBbXTtcblx0b3ZlcnJpZGUgc2VuZE5hcnJhdGlvblBsYXliYWNrQ29tcGxldGUoY29kaW5nU2Vzc2lvbklkOiBzdHJpbmcsIG5hcnJhdGlvbklkOiBzdHJpbmcsIHBsYXliYWNrSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMucGxheWJhY2tDb21wbGV0aW9ucy5wdXNoKHsgc2Vzc2lvbklkOiBjb2RpbmdTZXNzaW9uSWQsIG5hcnJhdGlvbklkLCBwbGF5YmFja0lkIH0pO1xuXHR9XG5cdHJlYWRvbmx5IHRvb2xSZXN1bHRzOiB7IGNhbGxJZDogc3RyaW5nOyByZXN1bHQ6IHN0cmluZyB8IElWb2ljZURpc3BhdGNoUmVzdWx0IH1bXSA9IFtdO1xuXHRwcml2YXRlIHRvb2xSZXN1bHRSZXNvbHZlcjogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSB0b29sUmVzdWx0UmVjZWl2ZWQgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHRoaXMudG9vbFJlc3VsdFJlc29sdmVyID0gcmVzb2x2ZSk7XG5cdG92ZXJyaWRlIHNlbmRUb29sUmVzdWx0KGNhbGxJZDogc3RyaW5nLCByZXN1bHQ6IHN0cmluZyB8IElWb2ljZURpc3BhdGNoUmVzdWx0KTogdm9pZCB7XG5cdFx0dGhpcy50b29sUmVzdWx0cy5wdXNoKHsgY2FsbElkLCByZXN1bHQgfSk7XG5cdFx0dGhpcy50b29sUmVzdWx0UmVzb2x2ZXI/LigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVxdWVzdE5hcnJhdGlvbihjb2RpbmdTZXNzaW9uSWQ6IHN0cmluZywga2luZDogVm9pY2VOYXJyYXRpb25LaW5kLCB0ZXh0OiBzdHJpbmcsIG5hcnJhdGlvbklkPzogc3RyaW5nLCBjaGVja3BvaW50PzogSVZvaWNlQ2hlY2twb2ludE5hcnJhdGlvbk1ldGFkYXRhLCBjb25maXJtYXRpb25UeXBlPzogVm9pY2VDb25maXJtYXRpb25UeXBlLCBwZW5kaW5nPzogeyBwZW5kaW5nSWQ6IHN0cmluZyB9KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpZCA9IG5hcnJhdGlvbklkID8/IGBuYXJyYXRpb24tJHsrK3RoaXMubmFycmF0aW9uQ291bnRlcn1gO1xuXHRcdHRoaXMucmVxdWVzdHMucHVzaCh7IHNlc3Npb25JZDogY29kaW5nU2Vzc2lvbklkLCBraW5kLCB0ZXh0LCBuYXJyYXRpb25JZDogaWQsIC4uLihwZW5kaW5nID8geyBwZW5kaW5nSWQ6IHBlbmRpbmcucGVuZGluZ0lkIH0gOiB7fSksIC4uLihjaGVja3BvaW50ID8geyBjaGVja3BvaW50IH0gOiB7fSksIC4uLihjb25maXJtYXRpb25UeXBlID8geyBjb25maXJtYXRpb25UeXBlIH0gOiB7fSkgfSk7XG5cdFx0dGhpcy53aXJlRXZlbnRzLnB1c2goeyB0eXBlOiAncmVxdWVzdF9uYXJyYXRpb24nLCBraW5kLCB0ZXh0LCAuLi4oY29uZmlybWF0aW9uVHlwZSA/IHsgY29uZmlybWF0aW9uVHlwZSB9IDoge30pIH0pO1xuXHRcdHJldHVybiBpZDtcblx0fVxuXG5cdGZpcmVBdWRpb1Jlc3BvbnNlKGV2ZW50OiBJVm9pY2VBdWRpb1Jlc3BvbnNlKTogdm9pZCB7XG5cdFx0dGhpcy5hdWRpb1Jlc3BvbnNlRW1pdHRlci5maXJlKGV2ZW50KTtcblx0fVxuXG5cdGZpcmVCYXJnZUluKGV2ZW50OiBJVm9pY2VCYXJnZUluKTogdm9pZCB7XG5cdFx0dGhpcy5iYXJnZUluRW1pdHRlci5maXJlKGV2ZW50KTtcblx0fVxuXG5cdGZpcmVUcmFuc2NyaXB0aW9uKGV2ZW50OiBJVm9pY2VUcmFuc2NyaXB0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy50cmFuc2NyaXB0aW9uRW1pdHRlci5maXJlKGV2ZW50KTtcblx0fVxuXG5cdGZpcmVUb29sQ2FsbChldmVudDogSVZvaWNlVG9vbENhbGwpOiB2b2lkIHtcblx0XHR0aGlzLnRvb2xDYWxsRW1pdHRlci5maXJlKGV2ZW50KTtcblx0fVxuXG5cdGZpcmVTcGVlY2hTdGFydGVkKHR1cm5JZD86IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuc3BlZWNoU3RhcnRlZEVtaXR0ZXIuZmlyZSh7IHR1cm5JZCB9KTtcblx0fVxuXG5cdGZpcmVOYXJyYXRpb25JbnRlcnJ1cHRlZChldmVudDogSVZvaWNlTmFycmF0aW9uU2lnbmFsKTogdm9pZCB7XG5cdFx0dGhpcy5uYXJyYXRpb25JbnRlcnJ1cHRlZEVtaXR0ZXIuZmlyZShldmVudCk7XG5cdH1cblxuXHRmaXJlTmFycmF0aW9uQWNrKGV2ZW50OiBJVm9pY2VOYXJyYXRpb25BY2spOiB2b2lkIHtcblx0XHR0aGlzLm5hcnJhdGlvbkFja0VtaXR0ZXIuZmlyZShldmVudCk7XG5cdH1cblxuXHRmaXJlTmFycmF0aW9uVW5ibG9ja2VkKGV2ZW50OiBJVm9pY2VOYXJyYXRpb25TaWduYWwpOiB2b2lkIHtcblx0XHR0aGlzLm5hcnJhdGlvblVuYmxvY2tlZEVtaXR0ZXIuZmlyZShldmVudCk7XG5cdH1cblxuXHRmaXJlQ29ubmVjdGlvblN0YXRlKGNvbm5lY3RlZDogYm9vbGVhbiwgd2lsbFJlY29ubmVjdCA9IGZhbHNlKTogdm9pZCB7XG5cdFx0dGhpcy5jb25uZWN0ZWQgPSBjb25uZWN0ZWQ7XG5cdFx0dGhpcy5yZWNvbm5lY3RpbmcgPSAhY29ubmVjdGVkICYmIHdpbGxSZWNvbm5lY3Q7XG5cdFx0dGhpcy5jb25uZWN0aW9uU3RhdGVFbWl0dGVyLmZpcmUoY29ubmVjdGVkKTtcblx0fVxuXG5cdHNldFJlc3VtaW5nKHJlc3VtaW5nOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5yZXN1bWluZyA9IHJlc3VtaW5nO1xuXHR9XG5cblx0ZmlyZVNlc3Npb25Jbml0KCk6IHZvaWQge1xuXHRcdHRoaXMuc2Vzc2lvbkluaXRFbWl0dGVyLmZpcmUoeyBzZXNzaW9uSWQ6ICd2b2ljZS1zZXNzaW9uJyB9KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5hdWRpb1Jlc3BvbnNlRW1pdHRlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5iYXJnZUluRW1pdHRlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy50cmFuc2NyaXB0aW9uRW1pdHRlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy50b29sQ2FsbEVtaXR0ZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuc3BlZWNoU3RhcnRlZEVtaXR0ZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMubmFycmF0aW9uQWNrRW1pdHRlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5uYXJyYXRpb25VbmJsb2NrZWRFbWl0dGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLm5hcnJhdGlvbkludGVycnVwdGVkRW1pdHRlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5jb25uZWN0aW9uU3RhdGVFbWl0dGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLnNlc3Npb25Jbml0RW1pdHRlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgUmVjb3JkaW5nTWljQ2FwdHVyZVNlcnZpY2UgZXh0ZW5kcyBtb2NrPElNaWNDYXB0dXJlU2VydmljZT4oKSB7XG5cdHJlYWRvbmx5IHB0dERvd25DYWxsczogeyB0dXJuSWQ6IHN0cmluZzsgcGFzc2l2ZTogYm9vbGVhbiB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0YWJvcnRDYWxscyA9IDA7XG5cdHByZXBhcmVDYWxscyA9IDA7XG5cdHN0YXJ0Q2FwdHVyZUNhbGxzID0gMDtcblx0c3RvcENhcHR1cmVDYWxscyA9IDA7XG5cdHJlYWRvbmx5IGNhcHR1cmVTdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGNhcHR1cmVCYXJyaWVyPzogUHJvbWlzZTx2b2lkPikge1xuXHRcdHN1cGVyKCk7XG5cdH1cblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25QdHRTdGFydCA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uUHR0QXVkaW9DaHVuayA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uUHR0RW5kID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25QdHREaWFnbm9zdGljID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgYW5hbHlzZXJOb2RlID0gdW5kZWZpbmVkO1xuXHRvdmVycmlkZSBpc011dGVkID0gZmFsc2U7XG5cdG92ZXJyaWRlIHByZXBhcmUoKTogdm9pZCB7IHRoaXMucHJlcGFyZUNhbGxzKys7IH1cblx0b3ZlcnJpZGUgYXN5bmMgc3RhcnRDYXB0dXJlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuc3RhcnRDYXB0dXJlQ2FsbHMrKztcblx0XHRpZiAodGhpcy5zdGFydENhcHR1cmVDYWxscyA9PT0gMSkge1xuXHRcdFx0dGhpcy5jYXB0dXJlU3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLmNhcHR1cmVCYXJyaWVyO1xuXHR9XG5cdG92ZXJyaWRlIHN0b3BDYXB0dXJlKCk6IHZvaWQgeyB0aGlzLnN0b3BDYXB0dXJlQ2FsbHMrKzsgfVxuXHRvdmVycmlkZSBhYm9ydFB0dCgpOiB2b2lkIHsgdGhpcy5hYm9ydENhbGxzKys7IH1cblx0b3ZlcnJpZGUgcHR0VXAoKTogdm9pZCB7IH1cblx0b3ZlcnJpZGUgc3VwcHJlc3NVbnRpbCgpOiB2b2lkIHsgfVxuXHRvdmVycmlkZSBhc3luYyBwdHREb3duKHR1cm5JZDogc3RyaW5nLCBwYXNzaXZlPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMucHR0RG93bkNhbGxzLnB1c2goeyB0dXJuSWQsIHBhc3NpdmUgfSk7XG5cdH1cbn1cblxuY2xhc3MgVm9pY2VUZXN0Tm90aWZpY2F0aW9uU2VydmljZSBleHRlbmRzIFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlIHtcblx0cmVhZG9ubHkgbm90aWZpY2F0aW9uczogSU5vdGlmaWNhdGlvbltdID0gW107XG5cblx0b3ZlcnJpZGUgbm90aWZ5KG5vdGlmaWNhdGlvbjogSU5vdGlmaWNhdGlvbik6IElOb3RpZmljYXRpb25IYW5kbGUge1xuXHRcdHRoaXMubm90aWZpY2F0aW9ucy5wdXNoKG5vdGlmaWNhdGlvbik7XG5cdFx0cmV0dXJuIG5ldyBOb09wTm90aWZpY2F0aW9uKCk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdFR0c1BsYXliYWNrU2VydmljZSBleHRlbmRzIG1vY2s8SVR0c1BsYXliYWNrU2VydmljZT4oKSB7XG5cdHJlYWRvbmx5IHBsYXllZEF1ZGlvOiBzdHJpbmdbXSA9IFtdO1xuXHRzdG9wQ291bnQgPSAwO1xuXHRwcml2YXRlIHBsYXlpbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBwbGF5YmFja1N0b3BwZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblxuXHRvdmVycmlkZSBnZXQgaXNQbGF5aW5nKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5wbGF5aW5nOyB9XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uUGxheWJhY2tTdGFydGVkID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25QbGF5YmFja1N0b3BwZWQgPSB0aGlzLnBsYXliYWNrU3RvcHBlZEVtaXR0ZXIuZXZlbnQ7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGFuYWx5c2VyTm9kZSA9IHVuZGVmaW5lZDtcblx0b3ZlcnJpZGUgZW5zdXJlQ29udGV4dCgpOiBBdWRpb0NvbnRleHQge1xuXHRcdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPEF1ZGlvQ29udGV4dD4oKSB7XG5cdFx0XHRvdmVycmlkZSByZXN1bWUoKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoKTsgfVxuXHRcdH0oKTtcblx0fVxuXHRvdmVycmlkZSBwbGF5QXVkaW9DaHVuayhhdWRpbzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKGF1ZGlvKSB7XG5cdFx0XHR0aGlzLnBsYXllZEF1ZGlvLnB1c2goYXVkaW8pO1xuXHRcdFx0dGhpcy5wbGF5aW5nID0gdHJ1ZTtcblx0XHR9XG5cdH1cblx0b3ZlcnJpZGUgc3RvcFBsYXliYWNrKCk6IHZvaWQge1xuXHRcdHRoaXMuc3RvcENvdW50Kys7XG5cdFx0Y29uc3Qgd2FzUGxheWluZyA9IHRoaXMucGxheWluZztcblx0XHR0aGlzLnBsYXlpbmcgPSBmYWxzZTtcblx0XHRpZiAod2FzUGxheWluZykge1xuXHRcdFx0dGhpcy5wbGF5YmFja1N0b3BwZWRFbWl0dGVyLmZpcmUoKTtcblx0XHR9XG5cdH1cblx0b3ZlcnJpZGUgZ2V0TGFzdFBsYXllZFNhbXBsZXMoKTogRmxvYXQzMkFycmF5IHwgbnVsbCB7IHJldHVybiBudWxsOyB9XG5cdG92ZXJyaWRlIGNsb3NlQ29udGV4dCgpOiB2b2lkIHsgfVxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMucGxheWJhY2tTdG9wcGVkRW1pdHRlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgRGVmZXJyZWRGaXJzdFR0c1BsYXliYWNrU2VydmljZSBleHRlbmRzIFRlc3RUdHNQbGF5YmFja1NlcnZpY2Uge1xuXHRwcml2YXRlIGRlZmVyTmV4dFN0YXJ0ID0gdHJ1ZTtcblxuXHRvdmVycmlkZSBwbGF5QXVkaW9DaHVuayhhdWRpbzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKGF1ZGlvICYmIHRoaXMuZGVmZXJOZXh0U3RhcnQpIHtcblx0XHRcdHRoaXMuZGVmZXJOZXh0U3RhcnQgPSBmYWxzZTtcblx0XHRcdHRoaXMucGxheWVkQXVkaW8ucHVzaChhdWRpbyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHN1cGVyLnBsYXlBdWRpb0NodW5rKGF1ZGlvKTtcblx0fVxufVxuXG5jbGFzcyBUZXN0TWljQ2FwdHVyZVNlcnZpY2UgZXh0ZW5kcyBtb2NrPElNaWNDYXB0dXJlU2VydmljZT4oKSB7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uUHR0U3RhcnQgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvblB0dEF1ZGlvQ2h1bmsgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvblB0dEVuZCA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uUHR0RGlhZ25vc3RpYyA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGFuYWx5c2VyTm9kZSA9IHVuZGVmaW5lZDtcblx0b3ZlcnJpZGUgaXNNdXRlZCA9IGZhbHNlO1xuXHRyZWFkb25seSBwdHRUdXJuczogc3RyaW5nW10gPSBbXTtcblxuXHRvdmVycmlkZSBwcmVwYXJlKCk6IHZvaWQgeyB9XG5cdG92ZXJyaWRlIGFzeW5jIHN0YXJ0Q2FwdHVyZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRvdmVycmlkZSBzdG9wQ2FwdHVyZSgpOiB2b2lkIHsgfVxuXHRvdmVycmlkZSBzdXBwcmVzc1VudGlsKCk6IHZvaWQgeyB9XG5cdG92ZXJyaWRlIGFzeW5jIHB0dERvd24odHVybklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnB0dFR1cm5zLnB1c2godHVybklkKTtcblx0fVxuXHRvdmVycmlkZSBwdHRVcCgpOiB2b2lkIHsgfVxuXHRvdmVycmlkZSBhYm9ydFB0dCgpOiB2b2lkIHsgfVxufVxuXG5jbGFzcyBUZXN0QWdlbnRTZXNzaW9uc1NlcnZpY2UgZXh0ZW5kcyBtb2NrPElBZ2VudFNlc3Npb25zU2VydmljZT4oKSB7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbkFyY2hpdmVkU3RhdGUgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBtb2RlbDogSUFnZW50U2Vzc2lvbnNNb2RlbDtcblxuXHRjb25zdHJ1Y3RvcihzZXNzaW9uczogcmVhZG9ubHkgdW5rbm93bltdID0gW10pIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMubW9kZWwgPSB7XG5cdFx0XHRvbldpbGxSZXNvbHZlOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRSZXNvbHZlOiBFdmVudC5Ob25lLFxuXHRcdFx0c2Vzc2lvbnM6IHNlc3Npb25zIGFzIElBZ2VudFNlc3Npb25zTW9kZWxbJ3Nlc3Npb25zJ10sXG5cdFx0XHRvbkRpZENoYW5nZVNlc3Npb25zOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uQXJjaGl2ZWRTdGF0ZTogRXZlbnQuTm9uZSxcblx0XHRcdHJlc29sdmVkOiB0cnVlLFxuXHRcdFx0Z2V0U2Vzc2lvbjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0b2JzZXJ2ZVNlc3Npb246ICgpID0+IG9ic2VydmFibGVWYWx1ZSgnc2Vzc2lvbicsIHVuZGVmaW5lZCksXG5cdFx0XHRyZXNvbHZlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0fTtcblx0fVxufVxuXG4vKiogQW4gYWdlbnQgc2Vzc2lvbiBlbnRyeSBhcyBgX2J1aWxkU2Vzc2lvbkNvbnRleHRgIHJlYWRzIGl0LiAqL1xuZnVuY3Rpb24gYWdlbnRTZXNzaW9uRW50cnkoaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgc3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXMpIHtcblx0cmV0dXJuIHtcblx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKGlkKSxcblx0XHRsYWJlbCxcblx0XHRzdGF0dXMsXG5cdFx0aXNBcmNoaXZlZDogKCkgPT4gZmFsc2UsXG5cdFx0dGltaW5nOiB7IGNyZWF0ZWQ6IERhdGUubm93KCksIGxhc3RSZXF1ZXN0RW5kZWQ6IERhdGUubm93KCkgfSxcblx0fTtcbn1cblxuY2xhc3MgVGVzdENoYXRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJQ2hhdFNlcnZpY2U+KCkge1xuXHRvdmVycmlkZSByZWFkb25seSBjaGF0TW9kZWxzID0gb2JzZXJ2YWJsZVZhbHVlKCdjaGF0TW9kZWxzJywgW10pO1xuXHRyZWFkb25seSBzZW5kUmVxdWVzdE9wdGlvbnM6IChJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucyB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRvdmVycmlkZSBnZXRTZXNzaW9uKCk6IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0b3ZlcnJpZGUgYXN5bmMgc2VuZFJlcXVlc3QoX3Nlc3Npb25SZXNvdXJjZTogVVJJLCBfbWVzc2FnZTogc3RyaW5nLCBvcHRpb25zPzogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPENoYXRTZW5kUmVzdWx0PiB7XG5cdFx0dGhpcy5zZW5kUmVxdWVzdE9wdGlvbnMucHVzaChvcHRpb25zKTtcblx0XHRyZXR1cm4geyBraW5kOiAncmVqZWN0ZWQnLCByZWFzb246ICd0ZXN0JyB9O1xuXHR9XG5cblx0LyoqIEEgc2Vzc2lvbiB0aGF0IG5ldmVyIGxvYWRzOiB0aGUgY29udHJvbGxlciBlYWdlcmx5IGxvYWRzIG1vZGVscyBmb3Igd2FpdGluZyBzZXNzaW9ucy4gKi9cblx0b3ZlcnJpZGUgYXN5bmMgYWNxdWlyZU9yTG9hZFNlc3Npb24oKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxufVxuXG4vKipcbiAqIENoYXQgc2VydmljZSB3aG9zZSB0cmFja2VkIG1vZGVscyBjYW4gYmUgZHJpdmVuIGZyb20gYSB0ZXN0LCBzbyB0aGVcbiAqIGNvbnRyb2xsZXIncyBhbHdheXMtb24gcGVuZGluZy1jb25maXJtYXRpb24gdHJhY2tlciBjYW4gYmUgZXhlcmNpc2VkLlxuICovXG5jbGFzcyBDb250cm9sbGFibGVDaGF0U2VydmljZSBleHRlbmRzIG1vY2s8SUNoYXRTZXJ2aWNlPigpIHtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgY2hhdE1vZGVscyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQ2hhdE1vZGVsW10+KCdjaGF0TW9kZWxzJywgW10pO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJQ2hhdE1vZGVsPigpO1xuXHRvdmVycmlkZSBnZXRTZXNzaW9uKHJlc291cmNlOiBVUkkpOiBJQ2hhdE1vZGVsIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb25zLmdldChyZXNvdXJjZS50b1N0cmluZygpKTsgfVxuXHRzZXRNb2RlbHMobW9kZWxzOiByZWFkb25seSBJQ2hhdE1vZGVsW10pOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9ucy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgbW9kZWwgb2YgbW9kZWxzKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9ucy5zZXQobW9kZWwuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIG1vZGVsKTtcblx0XHR9XG5cdFx0dGhpcy5jaGF0TW9kZWxzLnNldChtb2RlbHMsIHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuLyoqIE1pbmltYWwgY2hhdCBtb2RlbCB3aG9zZSBsYXN0IHJlcXVlc3QgY2FycmllcyBvbmUgdW5hbnN3ZXJlZCBxdWVzdGlvbiBmb3JtLiAqL1xuZnVuY3Rpb24gcGVuZGluZ1BhcnRzTW9kZWwocGFydHM6IG9iamVjdCB8IG9iamVjdFtdLCByZXF1ZXN0SWQgPSAncmVxLTEnLCBwZW5kaW5nRGV0YWlsPzogc3RyaW5nKTogSUNoYXRNb2RlbCB7XG5cdGNvbnN0IHZhbHVlID0gQXJyYXkuaXNBcnJheShwYXJ0cykgPyBwYXJ0cyA6IFtwYXJ0c107XG5cdGNvbnN0IGxhc3RSZXF1ZXN0ID0ge1xuXHRcdGlkOiByZXF1ZXN0SWQsXG5cdFx0cmVzcG9uc2U6IHtcblx0XHRcdHJlc3BvbnNlOiB7IHZhbHVlIH0sXG5cdFx0XHRpc1BlbmRpbmdDb25maXJtYXRpb246IG9ic2VydmFibGVWYWx1ZTx7IGRldGFpbD86IHN0cmluZyB9IHwgdW5kZWZpbmVkPihcblx0XHRcdFx0J3BlbmRpbmcnLFxuXHRcdFx0XHRwZW5kaW5nRGV0YWlsID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiB7IGRldGFpbDogcGVuZGluZ0RldGFpbCB9LFxuXHRcdFx0KSxcblx0XHR9LFxuXHR9O1xuXHRyZXR1cm4ge1xuXHRcdGdldFJlcXVlc3RzOiAoKSA9PiBbbGFzdFJlcXVlc3RdLFxuXHR9IGFzIHVua25vd24gYXMgSUNoYXRNb2RlbDtcbn1cblxuLyoqXG4gKiBNaW5pbWFsIGNoYXQgbW9kZWwgdGhhdCB0aGUgdHJhY2tlciByZWFkcyBhcyBoYXZpbmcgb25lIHBlbmRpbmcgdG9vbFxuICogY29uZmlybWF0aW9uIG9uIGl0cyBsYXN0IHJlcXVlc3QuXG4gKi9cbmZ1bmN0aW9uIHBlbmRpbmdDb25maXJtYXRpb25Nb2RlbChyZXNvdXJjZTogVVJJKTogSUNoYXRNb2RlbCB7XG5cdGNvbnN0IHJlc3BvbnNlID0ge1xuXHRcdGlzUGVuZGluZ0NvbmZpcm1hdGlvbjogb2JzZXJ2YWJsZVZhbHVlPHsgZGV0YWlsPzogc3RyaW5nIH0gfCB1bmRlZmluZWQ+KCdwZW5kaW5nJywgeyBkZXRhaWw6ICdOZWVkcyBhcHByb3ZhbCcgfSksXG5cdFx0cmVzcG9uc2U6IHsgdmFsdWU6IFtdIGFzIHJlYWRvbmx5IHsga2luZDogc3RyaW5nIH1bXSB9LFxuXHR9O1xuXHRjb25zdCBsYXN0UmVxdWVzdCA9IHsgcmVzcG9uc2UgfTtcblx0cmV0dXJuIHtcblx0XHRzZXNzaW9uUmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdHRpdGxlOiAnQ2hhdCcsXG5cdFx0Z2V0UmVxdWVzdHM6ICgpID0+IFtsYXN0UmVxdWVzdF0sXG5cdFx0bGFzdFJlcXVlc3RPYnM6IG9ic2VydmFibGVWYWx1ZSgnbGFzdFJlcXVlc3QnLCBsYXN0UmVxdWVzdCksXG5cdH0gYXMgdW5rbm93biBhcyBJQ2hhdE1vZGVsO1xufVxuXG5mdW5jdGlvbiBwZW5kaW5nUmVzcG9uc2VQYXJ0TW9kZWwocmVzb3VyY2U6IFVSSSwgcGFydDogSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudCwgZGV0YWlsID0gJ05lZWRzIGFwcHJvdmFsJywgcmVwb3J0UGVuZGluZyA9IHRydWUpOiBJQ2hhdE1vZGVsIHtcblx0Y29uc3QgcmVzcG9uc2UgPSB7XG5cdFx0aXNQZW5kaW5nQ29uZmlybWF0aW9uOiBvYnNlcnZhYmxlVmFsdWU8eyBkZXRhaWw/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4oJ3BlbmRpbmcnLCByZXBvcnRQZW5kaW5nID8geyBkZXRhaWwgfSA6IHVuZGVmaW5lZCksXG5cdFx0aXNJbmNvbXBsZXRlOiBvYnNlcnZhYmxlVmFsdWUoJ2luY29tcGxldGUnLCBmYWxzZSksXG5cdFx0cmVzcG9uc2U6IHsgdmFsdWU6IFtwYXJ0XSwgZ2V0TWFya2Rvd246ICgpID0+ICcnIH0sXG5cdH07XG5cdGNvbnN0IGxhc3RSZXF1ZXN0ID0geyByZXNwb25zZSB9O1xuXHRyZXR1cm4ge1xuXHRcdHNlc3Npb25SZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0dGl0bGU6ICdDaGF0Jyxcblx0XHRnZXRSZXF1ZXN0czogKCkgPT4gW2xhc3RSZXF1ZXN0XSxcblx0XHRsYXN0UmVxdWVzdE9iczogb2JzZXJ2YWJsZVZhbHVlKCdsYXN0UmVxdWVzdCcsIGxhc3RSZXF1ZXN0KSxcblx0fSBhcyB1bmtub3duIGFzIElDaGF0TW9kZWw7XG59XG5cbmZ1bmN0aW9uIGNvbXBsZXRlZFJlc3BvbnNlTW9kZWwobWFya2Rvd246IHN0cmluZywgZXJyb3JNZXNzYWdlPzogc3RyaW5nLCBpc0NhbmNlbGVkID0gZmFsc2UpOiBJQ2hhdE1vZGVsIHtcblx0Y29uc3QgcmVzcG9uc2UgPSB7XG5cdFx0aXNQZW5kaW5nQ29uZmlybWF0aW9uOiBvYnNlcnZhYmxlVmFsdWUoJ3BlbmRpbmcnLCB1bmRlZmluZWQpLFxuXHRcdGlzSW5jb21wbGV0ZTogb2JzZXJ2YWJsZVZhbHVlKCdpbmNvbXBsZXRlJywgZmFsc2UpLFxuXHRcdGlzQ2FuY2VsZWQsXG5cdFx0cmVzcG9uc2U6IHtcblx0XHRcdHZhbHVlOiBbXSxcblx0XHRcdGdldE1hcmtkb3duOiAoKSA9PiBtYXJrZG93bixcblx0XHR9LFxuXHRcdHJlc3VsdDogZXJyb3JNZXNzYWdlID8geyBlcnJvckRldGFpbHM6IHsgbWVzc2FnZTogZXJyb3JNZXNzYWdlIH0gfSA6IHVuZGVmaW5lZCxcblx0fTtcblx0cmV0dXJuIHtcblx0XHRnZXRSZXF1ZXN0czogKCkgPT4gW3sgcmVzcG9uc2UgfV0sXG5cdH0gYXMgdW5rbm93biBhcyBJQ2hhdE1vZGVsO1xufVxuXG5jbGFzcyBUZXN0Q2hhdFdpZGdldFNlcnZpY2UgZXh0ZW5kcyBtb2NrPElDaGF0V2lkZ2V0U2VydmljZT4oKSB7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRm9jdXNlZFNlc3Npb24gPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZEFkZFdpZGdldCA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIGdldEFsbFdpZGdldHMoKSB7IHJldHVybiBbXTsgfVxufVxuXG5jbGFzcyBUZXN0Q29tbWFuZFNlcnZpY2UgZXh0ZW5kcyBtb2NrPElDb21tYW5kU2VydmljZT4oKSB7XG5cdHJlYWRvbmx5IGFjY2VwdGVkSW5wdXRzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdG92ZXJyaWRlIGFzeW5jIGV4ZWN1dGVDb21tYW5kPFQ+KGNvbW1hbmRJZDogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPFQ+IHtcblx0XHRsZXQgcmVzdWx0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGNvbW1hbmRJZCA9PT0gJ19jaGF0LnZvaWNlLmdldEN1cnJlbnRTZXNzaW9uJykge1xuXHRcdFx0cmVzdWx0ID0gJ2NoYXQtc2Vzc2lvbic7XG5cdFx0fSBlbHNlIGlmIChjb21tYW5kSWQgPT09ICdfY2hhdC52b2ljZS5hY2NlcHRJbnB1dCcgJiYgdHlwZW9mIGFyZ3NbMF0gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLmFjY2VwdGVkSW5wdXRzLnB1c2goYXJnc1swXSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQgYXMgVDtcblx0fVxufVxuXG5jbGFzcyBUZXN0VGVsZW1ldHJ5U2VydmljZSBleHRlbmRzIE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUge1xuXHRyZWFkb25seSBldmVudHM6IHsgbmFtZTogc3RyaW5nOyBkYXRhOiB1bmtub3duIH1bXSA9IFtdO1xuXG5cdG92ZXJyaWRlIHB1YmxpY0xvZzIoZXZlbnROYW1lPzogc3RyaW5nLCBkYXRhPzogdW5rbm93bik6IHZvaWQge1xuXHRcdGlmIChldmVudE5hbWUpIHtcblx0XHRcdHRoaXMuZXZlbnRzLnB1c2goeyBuYW1lOiBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0fVxuXHR9XG59XG5cbnN1aXRlKCdWb2ljZVNlc3Npb25Db250cm9sbGVyJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRsZXQgY2xvY2s6IHNpbm9uLlNpbm9uRmFrZVRpbWVycztcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y2xvY2sgPSBzaW5vbi51c2VGYWtlVGltZXJzKCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRjbG9jay5yZXN0b3JlKCk7XG5cdFx0c2lub24ucmVzdG9yZSgpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVDb250cm9sbGVyKFxuXHRcdHZvaWNlQ2xpZW50U2VydmljZTogVGVzdFZvaWNlQ2xpZW50U2VydmljZSxcblx0XHR0dHNQbGF5YmFja1NlcnZpY2UgPSBuZXcgVGVzdFR0c1BsYXliYWNrU2VydmljZSgpLFxuXHRcdGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UgPSBuZXcgVGVzdENvbW1hbmRTZXJ2aWNlKCksXG5cdFx0dGVsZW1ldHJ5U2VydmljZTogTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSA9IE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdG1pY0NhcHR1cmVTZXJ2aWNlOiBJTWljQ2FwdHVyZVNlcnZpY2UgPSBuZXcgVGVzdE1pY0NhcHR1cmVTZXJ2aWNlKCksXG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyAnYWdlbnRzLnZvaWNlLmhhbmRzRnJlZSc6IGZhbHNlLCBbVk9JQ0VfQUdFTlRfUFJPR1JFU1NfU0VUVElOR106IHRydWUgfSksXG5cdFx0Y2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSA9IG5ldyBUZXN0Q2hhdFNlcnZpY2UoKSxcblx0XHRwcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUHJvbXB0c1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0Vm9pY2VJbnN0cnVjdGlvbnMoKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdH0oKSxcblx0XHRhZ2VudFNlc3Npb25zU2VydmljZTogSUFnZW50U2Vzc2lvbnNTZXJ2aWNlID0gbmV3IFRlc3RBZ2VudFNlc3Npb25zU2VydmljZSgpLFxuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlID0gbmV3IFZvaWNlVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UoKSxcblx0KTogSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIge1xuXHRcdHN0b3JlLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHZvaWNlQ2xpZW50U2VydmljZS5kaXNwb3NlKCkgfSk7XG5cdFx0c3RvcmUuYWRkKHR0c1BsYXliYWNrU2VydmljZSk7XG5cdFx0cmV0dXJuIHN0b3JlLmFkZChuZXcgVm9pY2VTZXNzaW9uQ29udHJvbGxlcihcblx0XHRcdHZvaWNlQ2xpZW50U2VydmljZSxcblx0XHRcdG1pY0NhcHR1cmVTZXJ2aWNlLFxuXHRcdFx0dHRzUGxheWJhY2tTZXJ2aWNlLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVm9pY2VUb29sRGlzcGF0Y2hTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgc2V0RGVsZWdhdGUoKTogdm9pZCB7IH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVzcG9uZFRvU2Vzc2lvbigpOiBQcm9taXNlPElWb2ljZURpc3BhdGNoUmVzdWx0PiB7IHJldHVybiB7IG9rOiB0cnVlIH07IH1cblx0XHRcdH0oKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZvaWNlUGxheWJhY2tTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgbm90aWZ5UGxheWJhY2tTdGFydCgpOiB2b2lkIHsgfVxuXHRcdFx0XHRvdmVycmlkZSBub3RpZnlQbGF5YmFja0VuZCgpOiB2b2lkIHsgfVxuXHRcdFx0fSgpLFxuXHRcdFx0YWdlbnRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0XHRjaGF0U2VydmljZSxcblx0XHRcdGNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQXV0aGVudGljYXRpb25TZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0U2Vzc2lvbnMoKTogUHJvbWlzZTxbXT4geyByZXR1cm4gW107IH1cblx0XHRcdH0oKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZvaWNlVHJhbnNjcmlwdFN0b3JlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgbG9hZFR1cm5zKCk6IFByb21pc2U8W10+IHsgcmV0dXJuIFtdOyB9XG5cdFx0XHR9KCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZT4oKSB7IH0oKSxcblx0XHRcdHRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgcGxheVNpZ25hbCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRcdFx0fSgpLFxuXHRcdFx0bmV3IFRlc3RBY2Nlc3NpYmlsaXR5U2VydmljZSgpLFxuXHRcdFx0bmV3IFRlc3RDaGF0V2lkZ2V0U2VydmljZSgpLFxuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRcdHByb21wdHNTZXJ2aWNlLFxuXHRcdCkpO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlVm9pY2VQcm9ncmVzc1Jlc3BvbnNlKGlkOiBzdHJpbmcsIHJlcXVlc3RJZCA9IGByZXF1ZXN0LSR7aWR9YCkge1xuXHRcdGNvbnN0IGNoYW5nZUVtaXR0ZXIgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8eyByZWFzb246ICdvdGhlcicgfT4oKSk7XG5cdFx0Y29uc3QgcGFydHM6IHsga2luZDogJ3ZvaWNlUHJvZ3Jlc3MnOyBpZDogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdGNvbnN0IHN0YXRlID0ge1xuXHRcdFx0aWQsXG5cdFx0XHRyZXF1ZXN0SWQsXG5cdFx0XHRpc0NvbXBsZXRlOiBmYWxzZSxcblx0XHRcdGlzQ2FuY2VsZWQ6IGZhbHNlLFxuXHRcdFx0b25EaWRDaGFuZ2U6IGNoYW5nZUVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRyZXNwb25zZTogeyB2YWx1ZTogcGFydHMgfSxcblx0XHR9O1xuXHRcdHJldHVybiB7IGNoYW5nZUVtaXR0ZXIsIHBhcnRzLCByZXNwb25zZTogc3RhdGUgYXMgdW5rbm93biBhcyBJQ2hhdFJlc3BvbnNlTW9kZWwsIHN0YXRlIH07XG5cdH1cblxuXHR0ZXN0KCdpbmNsdWRlcyByZXNwb25zZSBlcnJvcnMgaW4gdGhlIHN1bW1hcnkgc2VudCB0byB0aGUgdm9pY2UgYmFja2VuZCcsICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpKTtcblx0XHRjb25zdCBnZXRBZ2VudFN0YXRlSW5mbyA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfZ2V0QWdlbnRTdGF0ZUluZm8nKSBhcyAobW9kZWw6IElDaGF0TW9kZWwpID0+IHsgc3RhdGU6IHN0cmluZzsgbGFzdF9yZXNwb25zZV9zdW1tYXJ5Pzogc3RyaW5nIH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGdldEFnZW50U3RhdGVJbmZvLmNhbGwoY29udHJvbGxlciwgY29tcGxldGVkUmVzcG9uc2VNb2RlbCgnJywgJ1RoZSBicmFuY2ggbWFpbiB3YXMgbm90IGZvdW5kLicpKSxcblx0XHRcdGdldEFnZW50U3RhdGVJbmZvLmNhbGwoY29udHJvbGxlciwgY29tcGxldGVkUmVzcG9uc2VNb2RlbCgnSSBjb3VsZCBub3QgcmViYXNlIHRoZSBicmFuY2guJywgJ1RoZSBicmFuY2ggbWFpbiB3YXMgbm90IGZvdW5kLicpKSxcblx0XHRcdGdldEFnZW50U3RhdGVJbmZvLmNhbGwoY29udHJvbGxlciwgY29tcGxldGVkUmVzcG9uc2VNb2RlbCgnVGhlIHJlYmFzZSBjb21wbGV0ZWQuJykpLFxuXHRcdF0sIFtcblx0XHRcdHsgc3RhdGU6ICdpZGxlJywgbGFzdF9yZXNwb25zZV9zdW1tYXJ5OiAnVGhlIGJyYW5jaCBtYWluIHdhcyBub3QgZm91bmQuJyB9LFxuXHRcdFx0eyBzdGF0ZTogJ2lkbGUnLCBsYXN0X3Jlc3BvbnNlX3N1bW1hcnk6ICdJIGNvdWxkIG5vdCByZWJhc2UgdGhlIGJyYW5jaC5cXG5cXG5UaGUgYnJhbmNoIG1haW4gd2FzIG5vdCBmb3VuZC4nIH0sXG5cdFx0XHR7IHN0YXRlOiAnaWRsZScsIGxhc3RfcmVzcG9uc2Vfc3VtbWFyeTogJ1RoZSByZWJhc2UgY29tcGxldGVkLicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgbmFycmF0ZSBhIHN1bW1hcnkgZm9yIGEgY2FuY2VsbGVkIHR1cm4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIobmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZ2V0QWdlbnRTdGF0ZUluZm8gPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2dldEFnZW50U3RhdGVJbmZvJykgYXMgKG1vZGVsOiBJQ2hhdE1vZGVsKSA9PiB7IHN0YXRlOiBzdHJpbmc7IGxhc3RfcmVzcG9uc2Vfc3VtbWFyeT86IHN0cmluZyB9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGdldEFnZW50U3RhdGVJbmZvLmNhbGwoY29udHJvbGxlciwgY29tcGxldGVkUmVzcG9uc2VNb2RlbCgnU29tZSBwYXJ0aWFsIHdvcmsgdGhlIHVzZXIgaW50ZXJydXB0ZWQuJywgdW5kZWZpbmVkLCB0cnVlKSksXG5cdFx0XHR7IHN0YXRlOiAnaWRsZScgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBmaW5pc2ggY29ubmVjdGluZyBhZnRlciB2b2ljZSBpbnN0cnVjdGlvbnMgcmVzb2x2ZSBmb3IgYSBzdGFsZSBhdHRlbXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbWljQ2FwdHVyZVNlcnZpY2UgPSBuZXcgUmVjb3JkaW5nTWljQ2FwdHVyZVNlcnZpY2UoKTtcblx0XHRjb25zdCB2b2ljZUluc3RydWN0aW9uc1N0YXJ0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3Qgdm9pY2VJbnN0cnVjdGlvbnMgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4oKTtcblx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVByb21wdHNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGdldFZvaWNlSW5zdHJ1Y3Rpb25zKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0XHRcdHZvaWNlSW5zdHJ1Y3Rpb25zU3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRyZXR1cm4gdm9pY2VJbnN0cnVjdGlvbnMucDtcblx0XHRcdH1cblx0XHR9KCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoXG5cdFx0XHR2b2ljZUNsaWVudFNlcnZpY2UsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRtaWNDYXB0dXJlU2VydmljZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHByb21wdHNTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0YXdhaXQgY29udHJvbGxlci5jb25uZWN0KG1haW5XaW5kb3cpO1xuXG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVDb25uZWN0aW9uU3RhdGUodHJ1ZSk7XG5cdFx0YXdhaXQgdm9pY2VJbnN0cnVjdGlvbnNTdGFydGVkLnA7XG5cdFx0Y29udHJvbGxlci5kaXNjb25uZWN0KCk7XG5cdFx0dm9pY2VJbnN0cnVjdGlvbnMuY29tcGxldGUoJ1VzZSBDb250b3NvIERCLicpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb25uZWN0ZWQ6IGNvbnRyb2xsZXIuaXNDb25uZWN0ZWQuZ2V0KCksXG5cdFx0XHRwcmVwYXJlQ2FsbHM6IG1pY0NhcHR1cmVTZXJ2aWNlLnByZXBhcmVDYWxscyxcblx0XHR9LCB7XG5cdFx0XHRjb25uZWN0ZWQ6IGZhbHNlLFxuXHRcdFx0cHJlcGFyZUNhbGxzOiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3YXJtcyBoYW5kcy1mcmVlIGNhcHR1cmUgYmVmb3JlIHN0YXJ0aW5nIG9yIHJlc3VtaW5nIHRoZSBiYWNrZW5kIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0czoge1xuXHRcdFx0Y29tbWFuZDogJ3N0YXJ0JyB8ICdyZXN1bWUnO1xuXHRcdFx0YmVmb3JlV2FybXVwOiB7XG5cdFx0XHRcdHByZXBhcmVDYWxsczogbnVtYmVyO1xuXHRcdFx0XHRzdGFydENhcHR1cmVDYWxsczogbnVtYmVyO1xuXHRcdFx0XHRzdG9wQ2FwdHVyZUNhbGxzOiBudW1iZXI7XG5cdFx0XHRcdHNlc3Npb25Db21tYW5kczogcmVhZG9ubHkgKCdzdGFydCcgfCAncmVzdW1lJylbXTtcblx0XHRcdFx0c29ja2V0Q29ubmVjdGVkOiBib29sZWFuO1xuXHRcdFx0fTtcblx0XHRcdGFmdGVyV2FybXVwOiByZWFkb25seSAoJ3N0YXJ0JyB8ICdyZXN1bWUnKVtdO1xuXHRcdH1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY29tbWFuZCBvZiBbJ3N0YXJ0JywgJ3Jlc3VtZSddIGFzIGNvbnN0KSB7XG5cdFx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdFx0dm9pY2VDbGllbnRTZXJ2aWNlLnNldFJlc3VtaW5nKGNvbW1hbmQgPT09ICdyZXN1bWUnKTtcblx0XHRcdGNvbnN0IGNhcHR1cmVCYXJyaWVyID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0Y29uc3QgbWljQ2FwdHVyZVNlcnZpY2UgPSBuZXcgUmVjb3JkaW5nTWljQ2FwdHVyZVNlcnZpY2UoY2FwdHVyZUJhcnJpZXIucCk7XG5cdFx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihcblx0XHRcdFx0dm9pY2VDbGllbnRTZXJ2aWNlLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRtaWNDYXB0dXJlU2VydmljZSxcblx0XHRcdFx0bmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7ICdhZ2VudHMudm9pY2UuaGFuZHNGcmVlJzogdHJ1ZSB9KSxcblx0XHRcdCk7XG5cdFx0XHRhd2FpdCBjb250cm9sbGVyLmNvbm5lY3QobWFpbldpbmRvdyk7XG5cblx0XHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQ29ubmVjdGlvblN0YXRlKHRydWUpO1xuXHRcdFx0YXdhaXQgbWljQ2FwdHVyZVNlcnZpY2UuY2FwdHVyZVN0YXJ0ZWQucDtcblx0XHRcdGNvbnN0IGJlZm9yZVdhcm11cCA9IHtcblx0XHRcdFx0cHJlcGFyZUNhbGxzOiBtaWNDYXB0dXJlU2VydmljZS5wcmVwYXJlQ2FsbHMsXG5cdFx0XHRcdHN0YXJ0Q2FwdHVyZUNhbGxzOiBtaWNDYXB0dXJlU2VydmljZS5zdGFydENhcHR1cmVDYWxscyxcblx0XHRcdFx0c3RvcENhcHR1cmVDYWxsczogbWljQ2FwdHVyZVNlcnZpY2Uuc3RvcENhcHR1cmVDYWxscyxcblx0XHRcdFx0c2Vzc2lvbkNvbW1hbmRzOiBbLi4udm9pY2VDbGllbnRTZXJ2aWNlLnNlc3Npb25Db21tYW5kc10sXG5cdFx0XHRcdHNvY2tldENvbm5lY3RlZDogdm9pY2VDbGllbnRTZXJ2aWNlLmlzQ29ubmVjdGVkLFxuXHRcdFx0fTtcblxuXHRcdFx0Y2FwdHVyZUJhcnJpZXIuY29tcGxldGUoKTtcblx0XHRcdGF3YWl0IHZvaWNlQ2xpZW50U2VydmljZS5zZXNzaW9uQ29tbWFuZFNlbnQucDtcblx0XHRcdHJlc3VsdHMucHVzaCh7IGNvbW1hbmQsIGJlZm9yZVdhcm11cCwgYWZ0ZXJXYXJtdXA6IHZvaWNlQ2xpZW50U2VydmljZS5zZXNzaW9uQ29tbWFuZHMgfSk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRzLCBbe1xuXHRcdFx0Y29tbWFuZDogJ3N0YXJ0Jyxcblx0XHRcdGJlZm9yZVdhcm11cDoge1xuXHRcdFx0XHRwcmVwYXJlQ2FsbHM6IDEsXG5cdFx0XHRcdHN0YXJ0Q2FwdHVyZUNhbGxzOiAxLFxuXHRcdFx0XHRzdG9wQ2FwdHVyZUNhbGxzOiAwLFxuXHRcdFx0XHRzZXNzaW9uQ29tbWFuZHM6IFtdLFxuXHRcdFx0XHRzb2NrZXRDb25uZWN0ZWQ6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0YWZ0ZXJXYXJtdXA6IFsnc3RhcnQnXSxcblx0XHR9LCB7XG5cdFx0XHRjb21tYW5kOiAncmVzdW1lJyxcblx0XHRcdGJlZm9yZVdhcm11cDoge1xuXHRcdFx0XHRwcmVwYXJlQ2FsbHM6IDEsXG5cdFx0XHRcdHN0YXJ0Q2FwdHVyZUNhbGxzOiAxLFxuXHRcdFx0XHRzdG9wQ2FwdHVyZUNhbGxzOiAxLFxuXHRcdFx0XHRzZXNzaW9uQ29tbWFuZHM6IFtdLFxuXHRcdFx0XHRzb2NrZXRDb25uZWN0ZWQ6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0YWZ0ZXJXYXJtdXA6IFsncmVzdW1lJ10sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBtaWNyb3Bob25lIGFjcXVpc2l0aW9uIGxhenkgd2hlbiBoYW5kcy1mcmVlIG1vZGUgaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBtaWNDYXB0dXJlU2VydmljZSA9IG5ldyBSZWNvcmRpbmdNaWNDYXB0dXJlU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKFxuXHRcdFx0dm9pY2VDbGllbnRTZXJ2aWNlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0bWljQ2FwdHVyZVNlcnZpY2UsXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgJ2FnZW50cy52b2ljZS5oYW5kc0ZyZWUnOiBmYWxzZSB9KSxcblx0XHQpO1xuXHRcdGF3YWl0IGNvbnRyb2xsZXIuY29ubmVjdChtYWluV2luZG93KTtcblxuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQ29ubmVjdGlvblN0YXRlKHRydWUpO1xuXHRcdGF3YWl0IHZvaWNlQ2xpZW50U2VydmljZS5zZXNzaW9uQ29tbWFuZFNlbnQucDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJlcGFyZUNhbGxzOiBtaWNDYXB0dXJlU2VydmljZS5wcmVwYXJlQ2FsbHMsXG5cdFx0XHRzdGFydENhcHR1cmVDYWxsczogbWljQ2FwdHVyZVNlcnZpY2Uuc3RhcnRDYXB0dXJlQ2FsbHMsXG5cdFx0XHRzZXNzaW9uQ29tbWFuZHM6IHZvaWNlQ2xpZW50U2VydmljZS5zZXNzaW9uQ29tbWFuZHMsXG5cdFx0fSwge1xuXHRcdFx0cHJlcGFyZUNhbGxzOiAxLFxuXHRcdFx0c3RhcnRDYXB0dXJlQ2FsbHM6IDAsXG5cdFx0XHRzZXNzaW9uQ29tbWFuZHM6IFsnc3RhcnQnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZHMtZnJlZSB3YXJtLXVwIGZhaWx1cmUgcmV0dXJucyB0byBpZGxlIGFuZCBhbGxvd3MgcmV0cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCByZXNldE9ic2VydmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IG1pY0NhcHR1cmVTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgUmVjb3JkaW5nTWljQ2FwdHVyZVNlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgc3RhcnRDYXB0dXJlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHR0aGlzLnN0YXJ0Q2FwdHVyZUNhbGxzKys7XG5cdFx0XHRcdGlmICh0aGlzLnN0YXJ0Q2FwdHVyZUNhbGxzID09PSAxKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdtaWNyb3Bob25lIHVuYXZhaWxhYmxlJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoXG5cdFx0XHR2b2ljZUNsaWVudFNlcnZpY2UsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRtaWNDYXB0dXJlU2VydmljZSxcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyAnYWdlbnRzLnZvaWNlLmhhbmRzRnJlZSc6IHRydWUgfSksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBWb2ljZVRlc3ROb3RpZmljYXRpb25TZXJ2aWNlIHtcblx0XHRcdFx0b3ZlcnJpZGUgbm90aWZ5KG5vdGlmaWNhdGlvbjogSU5vdGlmaWNhdGlvbik6IElOb3RpZmljYXRpb25IYW5kbGUge1xuXHRcdFx0XHRcdHJlc2V0T2JzZXJ2ZWQuY29tcGxldGUoKTtcblx0XHRcdFx0XHRyZXR1cm4gc3VwZXIubm90aWZ5KG5vdGlmaWNhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH0oKSxcblx0XHQpO1xuXHRcdGF3YWl0IGNvbnRyb2xsZXIuY29ubmVjdChtYWluV2luZG93KTtcblxuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQ29ubmVjdGlvblN0YXRlKHRydWUpO1xuXHRcdGF3YWl0IHJlc2V0T2JzZXJ2ZWQucDtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRjb25zdCBhZnRlckZhaWx1cmUgPSB7XG5cdFx0XHRzdGFydENhcHR1cmVDYWxsczogbWljQ2FwdHVyZVNlcnZpY2Uuc3RhcnRDYXB0dXJlQ2FsbHMsXG5cdFx0XHRzdG9wQ2FwdHVyZUNhbGxzOiBtaWNDYXB0dXJlU2VydmljZS5zdG9wQ2FwdHVyZUNhbGxzLFxuXHRcdFx0c2Vzc2lvbkNvbW1hbmRzOiBbLi4udm9pY2VDbGllbnRTZXJ2aWNlLnNlc3Npb25Db21tYW5kc10sXG5cdFx0XHRjb25uZWN0aW5nOiBjb250cm9sbGVyLmlzQ29ubmVjdGluZy5nZXQoKSxcblx0XHRcdGNvbm5lY3RlZDogY29udHJvbGxlci5pc0Nvbm5lY3RlZC5nZXQoKSxcblx0XHRcdHN0YXR1czogY29udHJvbGxlci5zdGF0dXNUZXh0LmdldCgpLFxuXHRcdH07XG5cblx0XHRhd2FpdCBjb250cm9sbGVyLmNvbm5lY3QobWFpbldpbmRvdyk7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVDb25uZWN0aW9uU3RhdGUodHJ1ZSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhZnRlckZhaWx1cmUsXG5cdFx0XHRzdGFydENhcHR1cmVDYWxsczogbWljQ2FwdHVyZVNlcnZpY2Uuc3RhcnRDYXB0dXJlQ2FsbHMsXG5cdFx0XHRzZXNzaW9uQ29tbWFuZHM6IHZvaWNlQ2xpZW50U2VydmljZS5zZXNzaW9uQ29tbWFuZHMsXG5cdFx0fSwge1xuXHRcdFx0YWZ0ZXJGYWlsdXJlOiB7XG5cdFx0XHRcdHN0YXJ0Q2FwdHVyZUNhbGxzOiAxLFxuXHRcdFx0XHRzdG9wQ2FwdHVyZUNhbGxzOiAxLFxuXHRcdFx0XHRzZXNzaW9uQ29tbWFuZHM6IFtdLFxuXHRcdFx0XHRjb25uZWN0aW5nOiBmYWxzZSxcblx0XHRcdFx0Y29ubmVjdGVkOiBmYWxzZSxcblx0XHRcdFx0c3RhdHVzOiAnVGFwIHRvIHN0YXJ0Jyxcblx0XHRcdH0sXG5cdFx0XHRzdGFydENhcHR1cmVDYWxsczogMixcblx0XHRcdHNlc3Npb25Db21tYW5kczogWydzdGFydCddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kcy1mcmVlIHBlcm1pc3Npb24gZGVuaWFsIGRvZXMgbm90IGFkZCBhIGdlbmVyaWMgY29ubmVjdGlvbiBub3RpZmljYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gbmV3IFZvaWNlVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBwZXJtaXNzaW9uRXJyb3IgPSBuZXcgRXJyb3IoJ1Blcm1pc3Npb24gZGVuaWVkJyk7XG5cdFx0cGVybWlzc2lvbkVycm9yLm5hbWUgPSAnTm90QWxsb3dlZEVycm9yJztcblx0XHRjb25zdCBtaWNDYXB0dXJlU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIFJlY29yZGluZ01pY0NhcHR1cmVTZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIHN0YXJ0Q2FwdHVyZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0dGhpcy5zdGFydENhcHR1cmVDYWxscysrO1xuXHRcdFx0XHR0aHJvdyBwZXJtaXNzaW9uRXJyb3I7XG5cdFx0XHR9XG5cdFx0fSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKFxuXHRcdFx0dm9pY2VDbGllbnRTZXJ2aWNlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0bWljQ2FwdHVyZVNlcnZpY2UsXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgJ2FnZW50cy52b2ljZS5oYW5kc0ZyZWUnOiB0cnVlIH0pLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZSxcblx0XHQpO1xuXHRcdGF3YWl0IGNvbnRyb2xsZXIuY29ubmVjdChtYWluV2luZG93KTtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUNvbm5lY3Rpb25TdGF0ZSh0cnVlKTtcblx0XHRhd2FpdCBjbG9jay50aWNrQXN5bmMoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXJ0Q2FwdHVyZUNhbGxzOiBtaWNDYXB0dXJlU2VydmljZS5zdGFydENhcHR1cmVDYWxscyxcblx0XHRcdG5vdGlmaWNhdGlvbnM6IG5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZpY2F0aW9ucy5tYXAobm90aWZpY2F0aW9uID0+IG5vdGlmaWNhdGlvbi5tZXNzYWdlKSxcblx0XHRcdHNlc3Npb25Db21tYW5kczogdm9pY2VDbGllbnRTZXJ2aWNlLnNlc3Npb25Db21tYW5kcyxcblx0XHRcdGNvbm5lY3Rpbmc6IGNvbnRyb2xsZXIuaXNDb25uZWN0aW5nLmdldCgpLFxuXHRcdFx0Y29ubmVjdGVkOiBjb250cm9sbGVyLmlzQ29ubmVjdGVkLmdldCgpLFxuXHRcdFx0c3RhdHVzOiBjb250cm9sbGVyLnN0YXR1c1RleHQuZ2V0KCksXG5cdFx0fSwge1xuXHRcdFx0c3RhcnRDYXB0dXJlQ2FsbHM6IDEsXG5cdFx0XHRub3RpZmljYXRpb25zOiBbXSxcblx0XHRcdHNlc3Npb25Db21tYW5kczogW10sXG5cdFx0XHRjb25uZWN0aW5nOiBmYWxzZSxcblx0XHRcdGNvbm5lY3RlZDogZmFsc2UsXG5cdFx0XHRzdGF0dXM6ICdUYXAgdG8gc3RhcnQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25uZWN0IHdhdGNoZG9nIGNvdmVycyBhIHN0YWxsZWQgaGFuZHMtZnJlZSB3YXJtLXVwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY2FwdHVyZUJhcnJpZXIgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgbWljQ2FwdHVyZVNlcnZpY2UgPSBuZXcgUmVjb3JkaW5nTWljQ2FwdHVyZVNlcnZpY2UoY2FwdHVyZUJhcnJpZXIucCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoXG5cdFx0XHR2b2ljZUNsaWVudFNlcnZpY2UsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRtaWNDYXB0dXJlU2VydmljZSxcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyAnYWdlbnRzLnZvaWNlLmhhbmRzRnJlZSc6IHRydWUgfSksXG5cdFx0KTtcblx0XHRhd2FpdCBjb250cm9sbGVyLmNvbm5lY3QobWFpbldpbmRvdyk7XG5cblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUNvbm5lY3Rpb25TdGF0ZSh0cnVlKTtcblx0XHRhd2FpdCBtaWNDYXB0dXJlU2VydmljZS5jYXB0dXJlU3RhcnRlZC5wO1xuXHRcdGNsb2NrLnRpY2soMTBfMDAwKTtcblx0XHRjYXB0dXJlQmFycmllci5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdG9wQ2FwdHVyZUNhbGxzOiBtaWNDYXB0dXJlU2VydmljZS5zdG9wQ2FwdHVyZUNhbGxzLFxuXHRcdFx0c2Vzc2lvbkNvbW1hbmRzOiB2b2ljZUNsaWVudFNlcnZpY2Uuc2Vzc2lvbkNvbW1hbmRzLFxuXHRcdFx0Y29ubmVjdGluZzogY29udHJvbGxlci5pc0Nvbm5lY3RpbmcuZ2V0KCksXG5cdFx0XHRjb25uZWN0ZWQ6IGNvbnRyb2xsZXIuaXNDb25uZWN0ZWQuZ2V0KCksXG5cdFx0XHRzdGF0dXM6IGNvbnRyb2xsZXIuc3RhdHVzVGV4dC5nZXQoKSxcblx0XHR9LCB7XG5cdFx0XHRzdG9wQ2FwdHVyZUNhbGxzOiAxLFxuXHRcdFx0c2Vzc2lvbkNvbW1hbmRzOiBbXSxcblx0XHRcdGNvbm5lY3Rpbmc6IGZhbHNlLFxuXHRcdFx0Y29ubmVjdGVkOiBmYWxzZSxcblx0XHRcdHN0YXR1czogJ1RhcCB0byBzdGFydCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFuIHNvY2tldCBjbG9zZSBkdXJpbmcgYWNxdWlzaXRpb24gYWJvcnRzIGluaXRpYWxpemF0aW9uIGFuZCBhbGxvd3MgZXhwbGljaXQgcmV0cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBmaXJzdENhcHR1cmVCYXJyaWVyID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IG1pY0NhcHR1cmVTZXJ2aWNlID0gbmV3IFJlY29yZGluZ01pY0NhcHR1cmVTZXJ2aWNlKGZpcnN0Q2FwdHVyZUJhcnJpZXIucCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoXG5cdFx0XHR2b2ljZUNsaWVudFNlcnZpY2UsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRtaWNDYXB0dXJlU2VydmljZSxcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyAnYWdlbnRzLnZvaWNlLmhhbmRzRnJlZSc6IHRydWUgfSksXG5cdFx0KTtcblx0XHRhd2FpdCBjb250cm9sbGVyLmNvbm5lY3QobWFpbldpbmRvdyk7XG5cblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUNvbm5lY3Rpb25TdGF0ZSh0cnVlKTtcblx0XHRhd2FpdCBtaWNDYXB0dXJlU2VydmljZS5jYXB0dXJlU3RhcnRlZC5wO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQ29ubmVjdGlvblN0YXRlKGZhbHNlKTtcblx0XHRmaXJzdENhcHR1cmVCYXJyaWVyLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRjb25zdCBhZnRlckRyb3AgPSB7XG5cdFx0XHRzdGFydENhcHR1cmVDYWxsczogbWljQ2FwdHVyZVNlcnZpY2Uuc3RhcnRDYXB0dXJlQ2FsbHMsXG5cdFx0XHRzdG9wQ2FwdHVyZUNhbGxzOiBtaWNDYXB0dXJlU2VydmljZS5zdG9wQ2FwdHVyZUNhbGxzLFxuXHRcdFx0c2Vzc2lvbkNvbW1hbmRzOiBbLi4udm9pY2VDbGllbnRTZXJ2aWNlLnNlc3Npb25Db21tYW5kc10sXG5cdFx0XHRjb25uZWN0ZWQ6IGNvbnRyb2xsZXIuaXNDb25uZWN0ZWQuZ2V0KCksXG5cdFx0XHRzdGF0dXM6IGNvbnRyb2xsZXIuc3RhdHVzVGV4dC5nZXQoKSxcblx0XHR9O1xuXG5cdFx0YXdhaXQgY29udHJvbGxlci5jb25uZWN0KG1haW5XaW5kb3cpO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQ29ubmVjdGlvblN0YXRlKHRydWUpO1xuXHRcdGF3YWl0IHZvaWNlQ2xpZW50U2VydmljZS5zZXNzaW9uQ29tbWFuZFNlbnQucDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWZ0ZXJEcm9wLFxuXHRcdFx0YWZ0ZXJSZXRyeToge1xuXHRcdFx0XHRzdGFydENhcHR1cmVDYWxsczogbWljQ2FwdHVyZVNlcnZpY2Uuc3RhcnRDYXB0dXJlQ2FsbHMsXG5cdFx0XHRcdHN0b3BDYXB0dXJlQ2FsbHM6IG1pY0NhcHR1cmVTZXJ2aWNlLnN0b3BDYXB0dXJlQ2FsbHMsXG5cdFx0XHRcdHNlc3Npb25Db21tYW5kczogdm9pY2VDbGllbnRTZXJ2aWNlLnNlc3Npb25Db21tYW5kcyxcblx0XHRcdFx0Y29ubmVjdGVkOiBjb250cm9sbGVyLmlzQ29ubmVjdGVkLmdldCgpLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRhZnRlckRyb3A6IHtcblx0XHRcdFx0c3RhcnRDYXB0dXJlQ2FsbHM6IDEsXG5cdFx0XHRcdHN0b3BDYXB0dXJlQ2FsbHM6IDEsXG5cdFx0XHRcdHNlc3Npb25Db21tYW5kczogW10sXG5cdFx0XHRcdGNvbm5lY3RlZDogZmFsc2UsXG5cdFx0XHRcdHN0YXR1czogJ1RhcCB0byBzdGFydCcsXG5cdFx0XHR9LFxuXHRcdFx0YWZ0ZXJSZXRyeToge1xuXHRcdFx0XHRzdGFydENhcHR1cmVDYWxsczogMixcblx0XHRcdFx0c3RvcENhcHR1cmVDYWxsczogMSxcblx0XHRcdFx0c2Vzc2lvbkNvbW1hbmRzOiBbJ3N0YXJ0J10sXG5cdFx0XHRcdGNvbm5lY3RlZDogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYW5zaWVudCBzb2NrZXQgZHJvcCBkdXJpbmcgYWNxdWlzaXRpb24gcmV0cmllcyB3YXJtLXVwIGJlZm9yZSBzdGFydGluZyB0aGUgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IGZpcnN0Q2FwdHVyZUJhcnJpZXIgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgbWljQ2FwdHVyZVNlcnZpY2UgPSBuZXcgUmVjb3JkaW5nTWljQ2FwdHVyZVNlcnZpY2UoZmlyc3RDYXB0dXJlQmFycmllci5wKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihcblx0XHRcdHZvaWNlQ2xpZW50U2VydmljZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdG1pY0NhcHR1cmVTZXJ2aWNlLFxuXHRcdFx0bmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7ICdhZ2VudHMudm9pY2UuaGFuZHNGcmVlJzogdHJ1ZSB9KSxcblx0XHQpO1xuXHRcdGF3YWl0IGNvbnRyb2xsZXIuY29ubmVjdChtYWluV2luZG93KTtcblxuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQ29ubmVjdGlvblN0YXRlKHRydWUpO1xuXHRcdGF3YWl0IG1pY0NhcHR1cmVTZXJ2aWNlLmNhcHR1cmVTdGFydGVkLnA7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVDb25uZWN0aW9uU3RhdGUoZmFsc2UsIHRydWUpO1xuXHRcdGZpcnN0Q2FwdHVyZUJhcnJpZXIuY29tcGxldGUoKTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRjb25zdCBhZnRlckRyb3AgPSB7XG5cdFx0XHRjb25uZWN0aW5nOiBjb250cm9sbGVyLmlzQ29ubmVjdGluZy5nZXQoKSxcblx0XHRcdHJlY29ubmVjdGluZzogY29udHJvbGxlci5pc1JlY29ubmVjdGluZy5nZXQoKSxcblx0XHRcdHN0b3BDYXB0dXJlQ2FsbHM6IG1pY0NhcHR1cmVTZXJ2aWNlLnN0b3BDYXB0dXJlQ2FsbHMsXG5cdFx0XHRzZXNzaW9uQ29tbWFuZHM6IFsuLi52b2ljZUNsaWVudFNlcnZpY2Uuc2Vzc2lvbkNvbW1hbmRzXSxcblx0XHRcdHN0YXR1czogY29udHJvbGxlci5zdGF0dXNUZXh0LmdldCgpLFxuXHRcdH07XG5cblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUNvbm5lY3Rpb25TdGF0ZSh0cnVlKTtcblx0XHRhd2FpdCB2b2ljZUNsaWVudFNlcnZpY2Uuc2Vzc2lvbkNvbW1hbmRTZW50LnA7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFmdGVyRHJvcCxcblx0XHRcdGFmdGVyUmV0cnk6IHtcblx0XHRcdFx0c3RhcnRDYXB0dXJlQ2FsbHM6IG1pY0NhcHR1cmVTZXJ2aWNlLnN0YXJ0Q2FwdHVyZUNhbGxzLFxuXHRcdFx0XHRzZXNzaW9uQ29tbWFuZHM6IHZvaWNlQ2xpZW50U2VydmljZS5zZXNzaW9uQ29tbWFuZHMsXG5cdFx0XHRcdGNvbm5lY3RlZDogY29udHJvbGxlci5pc0Nvbm5lY3RlZC5nZXQoKSxcblx0XHRcdH0sXG5cdFx0fSwge1xuXHRcdFx0YWZ0ZXJEcm9wOiB7XG5cdFx0XHRcdGNvbm5lY3Rpbmc6IGZhbHNlLFxuXHRcdFx0XHRyZWNvbm5lY3Rpbmc6IHRydWUsXG5cdFx0XHRcdHN0b3BDYXB0dXJlQ2FsbHM6IDEsXG5cdFx0XHRcdHNlc3Npb25Db21tYW5kczogW10sXG5cdFx0XHRcdHN0YXR1czogJ1JlY29ubmVjdGluZy4uLicsXG5cdFx0XHR9LFxuXHRcdFx0YWZ0ZXJSZXRyeToge1xuXHRcdFx0XHRzdGFydENhcHR1cmVDYWxsczogMixcblx0XHRcdFx0c2Vzc2lvbkNvbW1hbmRzOiBbJ3N0YXJ0J10sXG5cdFx0XHRcdGNvbm5lY3RlZDogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25hcnJhdGVzIHZpc2libGUgcXVlc3Rpb25uYWlyZSBwcm9tcHRzIGFuZCBjaG9pY2VzIGltbWVkaWF0ZWx5IHdpdGhvdXQgaW50ZXJuYWwgaWRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovbWFycy1xdWVzdGlvbm5haXJlJyk7XG5cdFx0Y29uc3QgY2Fyb3VzZWwgPSBuZXcgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhKFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdtYXJzX2ZlYXR1cmVfc2NvcGUnLFxuXHRcdFx0XHR0eXBlOiAnc2luZ2xlU2VsZWN0Jyxcblx0XHRcdFx0dGl0bGU6ICdtYXJzX2ZlYXR1cmVfc2NvcGUnLFxuXHRcdFx0XHRtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoJ1doaWNoIE1hcnMgZmVhdHVyZXMgc2hvdWxkIHRoZSBleHBlcmllbmNlIGluY2x1ZGU/JyksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnQ2hvb3NlIHRoZSBtYWluIGV4cGxvcmF0aW9uIHNjb3BlLicsXG5cdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHR7IGlkOiAnc3VyZmFjZV9vbmx5JywgbGFiZWw6ICdTdXJmYWNlIGV4cGxvcmVyIC0gRHJpdmUgYmV0d2VlbiBsYW5kbWFya3MnLCB2YWx1ZTogJ3N1cmZhY2Vfb25seScgfSxcblx0XHRcdFx0XHR7IGlkOiAnc2NpZW5jZV9taXNzaW9ucycsIGxhYmVsOiAnU2NpZW5jZSBtaXNzaW9ucyAtIENvbGxlY3Qgc2FtcGxlcyBhbmQgcnVuIGV4cGVyaW1lbnRzJywgdmFsdWU6ICdzY2llbmNlX21pc3Npb25zJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdtYXJzX25hdmlnYXRpb25fbW9kZScsXG5cdFx0XHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnLFxuXHRcdFx0XHR0aXRsZTogJ21hcnNfbmF2aWdhdGlvbl9tb2RlJyxcblx0XHRcdFx0bWVzc2FnZTogJ0hvdyBzaG91bGQgcGVvcGxlIG5hdmlnYXRlIE1hcnM/Jyxcblx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdHsgaWQ6ICdndWlkZWQnLCBsYWJlbDogJ0d1aWRlZCByb3V0ZScsIHZhbHVlOiAnZ3VpZGVkJyB9LFxuXHRcdFx0XHRcdHsgaWQ6ICdmcmVlX3JvYW0nLCBsYWJlbDogJ0ZyZWUgcm9hbScsIHZhbHVlOiAnZnJlZV9yb2FtJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdtYXJzX2RhdGFfYXBwcm9hY2gnLFxuXHRcdFx0XHR0eXBlOiAnbXVsdGlTZWxlY3QnLFxuXHRcdFx0XHR0aXRsZTogJ21hcnNfZGF0YV9hcHByb2FjaCcsXG5cdFx0XHRcdG1lc3NhZ2U6ICdXaGljaCBNYXJzIGRhdGEgc2hvdWxkIGJlIGF2YWlsYWJsZT8nLFxuXHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0eyBpZDogJ3RlcnJhaW4nLCBsYWJlbDogJ1RlcnJhaW4gbWFwcycsIHZhbHVlOiAndGVycmFpbicgfSxcblx0XHRcdFx0XHR7IGlkOiAnd2VhdGhlcicsIGxhYmVsOiAnV2VhdGhlciByZWFkaW5ncycsIHZhbHVlOiAnd2VhdGhlcicgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnbWFyc19yZW5kZXJpbmdfc3R5bGUnLFxuXHRcdFx0XHR0eXBlOiAnc2luZ2xlU2VsZWN0Jyxcblx0XHRcdFx0dGl0bGU6ICdtYXJzX3JlbmRlcmluZ19zdHlsZScsXG5cdFx0XHRcdG1lc3NhZ2U6ICdXaGF0IHZpc3VhbCBzdHlsZSBzaG91bGQgTWFycyB1c2U/Jyxcblx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdHsgaWQ6ICdyZWFsaXN0aWMnLCBsYWJlbDogJ1Bob3RvcmVhbGlzdGljJywgdmFsdWU6ICdyZWFsaXN0aWMnIH0sXG5cdFx0XHRcdFx0eyBpZDogJ2lsbHVzdHJhdGVkJywgbGFiZWw6ICdJbGx1c3RyYXRlZCcsIHZhbHVlOiAnaWxsdXN0cmF0ZWQnIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGFsbG93RnJlZWZvcm1JbnB1dDogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XSwgdHJ1ZSwgJ21hcnNfaW50ZXJuYWxfcmVzb2x2ZV9pZCcsIHVuZGVmaW5lZCwgZmFsc2UsIG5ldyBNYXJrZG93blN0cmluZygnSGVscCBzaGFwZSB0aGUgTWFycyBleHBlcmllbmNlLicpKTtcblx0XHRjb25zdCBtb2RlbCA9IHBlbmRpbmdSZXNwb25zZVBhcnRNb2RlbChzZXNzaW9uUmVzb3VyY2UsIGNhcm91c2VsLCAncXVlc3Rpb25zOiBtYXJzX2ZlYXR1cmVfc2NvcGUsIG1hcnNfbmF2aWdhdGlvbl9tb2RlLCBtYXJzX2RhdGFfYXBwcm9hY2gsIG1hcnNfcmVuZGVyaW5nX3N0eWxlJyk7XG5cdFx0Y29uc3QgZ2V0QWdlbnRTdGF0ZUluZm8gPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2dldEFnZW50U3RhdGVJbmZvJykgYXMgKG1vZGVsOiBJQ2hhdE1vZGVsKSA9PiB7IHN0YXRlOiBzdHJpbmc7IGRldGFpbD86IHN0cmluZzsgY29uZmlybWF0aW9uX3R5cGU/OiBWb2ljZUNvbmZpcm1hdGlvblR5cGUgfTtcblx0XHRjb25zdCBoYW5kbGVTdGF0ZUNoYW5nZSA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfaGFuZGxlTmFycmF0YWJsZVN0YXRlQ2hhbmdlJykgYXMgKHNlc3Npb25JZDogc3RyaW5nLCBzdGF0ZTogc3RyaW5nLCBkZXRhaWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgc3VtbWFyeTogc3RyaW5nIHwgdW5kZWZpbmVkLCBzaG93bjogc3RyaW5nLCBjb25maXJtYXRpb25UeXBlPzogVm9pY2VDb25maXJtYXRpb25UeXBlKSA9PiB2b2lkO1xuXHRcdGNvbnN0IGlzQ29ubmVjdGVkID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19pc0Nvbm5lY3RlZCcpIGFzIHsgc2V0KHZhbHVlOiBib29sZWFuLCB0eDogdW5kZWZpbmVkKTogdm9pZCB9O1xuXHRcdGNvbnN0IHdhdGNoVm9pY2VQcm9ncmVzcyA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfd2F0Y2hWb2ljZVByb2dyZXNzJykgYXMgKHJlc291cmNlOiBVUkksIHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlTW9kZWwpID0+IHZvaWQ7XG5cdFx0Y29uc3QgcHJvZ3Jlc3MgPSBjcmVhdGVWb2ljZVByb2dyZXNzUmVzcG9uc2UoJ21hcnMtcHJvZ3Jlc3MnKTtcblxuXHRcdGlzQ29ubmVjdGVkLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0d2F0Y2hWb2ljZVByb2dyZXNzLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvblJlc291cmNlLCBwcm9ncmVzcy5yZXNwb25zZSk7XG5cdFx0cHJvZ3Jlc3MucGFydHMucHVzaCh7IGtpbmQ6ICd2b2ljZVByb2dyZXNzJywgaWQ6ICdlZGl0aW5nJywgdmFsdWU6ICdVcGRhdGluZyB0aGUgTWFycyBleHBlcmllbmNlLicgfSk7XG5cdFx0cHJvZ3Jlc3MuY2hhbmdlRW1pdHRlci5maXJlKHsgcmVhc29uOiAnb3RoZXInIH0pO1xuXHRcdGNvbnN0IHN0YXRlSW5mbyA9IGdldEFnZW50U3RhdGVJbmZvLmNhbGwoY29udHJvbGxlciwgbW9kZWwpO1xuXHRcdGhhbmRsZVN0YXRlQ2hhbmdlLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIHN0YXRlSW5mby5zdGF0ZSwgc3RhdGVJbmZvLmRldGFpbCwgdW5kZWZpbmVkLCBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwgc3RhdGVJbmZvLmNvbmZpcm1hdGlvbl90eXBlKTtcblx0XHRjb25zdCBpbW1lZGlhdGVSZXF1ZXN0Q291bnQgPSB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHMubGVuZ3RoO1xuXHRcdGNsb2NrLnRpY2soNV8wMDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGF0ZUluZm8sXG5cdFx0XHRpbW1lZGlhdGVSZXF1ZXN0Q291bnQsXG5cdFx0XHRyZXF1ZXN0OiB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHMubWFwKHJlcXVlc3QgPT4gKHsga2luZDogcmVxdWVzdC5raW5kLCB0ZXh0OiByZXF1ZXN0LnRleHQsIGNvbmZpcm1hdGlvblR5cGU6IHJlcXVlc3QuY29uZmlybWF0aW9uVHlwZSB9KSksXG5cdFx0XHRjb250YWluc0ludGVybmFsSWRzOiBbJ21hcnNfZmVhdHVyZV9zY29wZScsICdtYXJzX25hdmlnYXRpb25fbW9kZScsICdtYXJzX2RhdGFfYXBwcm9hY2gnLCAnbWFyc19yZW5kZXJpbmdfc3R5bGUnLCAnc3VyZmFjZV9vbmx5JywgJ2ZyZWVfcm9hbSddXG5cdFx0XHRcdC5zb21lKGlkID0+IHN0YXRlSW5mby5kZXRhaWw/LmluY2x1ZGVzKGlkKSksXG5cdFx0fSwge1xuXHRcdFx0c3RhdGVJbmZvOiB7XG5cdFx0XHRcdHN0YXRlOiAnd2FpdGluZ19mb3JfY29uZmlybWF0aW9uJyxcblx0XHRcdFx0Y29uZmlybWF0aW9uX3R5cGU6ICdxdWVzdGlvbm5haXJlJyxcblx0XHRcdFx0ZGV0YWlsOiBbXG5cdFx0XHRcdFx0J3F1ZXN0aW9ubmFpcmU6IDQgcXVlc3Rpb25zJyxcblx0XHRcdFx0XHQnY29udGV4dDogSGVscCBzaGFwZSB0aGUgTWFycyBleHBlcmllbmNlLicsXG5cdFx0XHRcdFx0JzEuIFdoaWNoIE1hcnMgZmVhdHVyZXMgc2hvdWxkIHRoZSBleHBlcmllbmNlIGluY2x1ZGU/Jyxcblx0XHRcdFx0XHQnZGV0YWlsczogQ2hvb3NlIHRoZSBtYWluIGV4cGxvcmF0aW9uIHNjb3BlLicsXG5cdFx0XHRcdFx0J29wdGlvbnM6IFN1cmZhY2UgZXhwbG9yZXIgLSBEcml2ZSBiZXR3ZWVuIGxhbmRtYXJrczsgU2NpZW5jZSBtaXNzaW9ucyAtIENvbGxlY3Qgc2FtcGxlcyBhbmQgcnVuIGV4cGVyaW1lbnRzOyBhIGN1c3RvbSByZXNwb25zZSBpcyBhbHNvIGF2YWlsYWJsZScsXG5cdFx0XHRcdFx0JzIuIEhvdyBzaG91bGQgcGVvcGxlIG5hdmlnYXRlIE1hcnM/Jyxcblx0XHRcdFx0XHQnb3B0aW9uczogR3VpZGVkIHJvdXRlOyBGcmVlIHJvYW07IGEgY3VzdG9tIHJlc3BvbnNlIGlzIGFsc28gYXZhaWxhYmxlJyxcblx0XHRcdFx0XHQnMy4gV2hpY2ggTWFycyBkYXRhIHNob3VsZCBiZSBhdmFpbGFibGU/Jyxcblx0XHRcdFx0XHQnb3B0aW9uczogVGVycmFpbiBtYXBzOyBXZWF0aGVyIHJlYWRpbmdzOyBhIGN1c3RvbSByZXNwb25zZSBpcyBhbHNvIGF2YWlsYWJsZScsXG5cdFx0XHRcdFx0JzQuIFdoYXQgdmlzdWFsIHN0eWxlIHNob3VsZCBNYXJzIHVzZT8nLFxuXHRcdFx0XHRcdCdvcHRpb25zOiBQaG90b3JlYWxpc3RpYzsgSWxsdXN0cmF0ZWQ7IGEgY3VzdG9tIHJlc3BvbnNlIGlzIGFsc28gYXZhaWxhYmxlJyxcblx0XHRcdFx0XHQnVGhlIHF1ZXN0aW9ubmFpcmUgaXMgb3BlbiBpbiBHaXRIdWIgQ29waWxvdC4nLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0fSxcblx0XHRcdGltbWVkaWF0ZVJlcXVlc3RDb3VudDogMSxcblx0XHRcdHJlcXVlc3Q6IFt7XG5cdFx0XHRcdGtpbmQ6ICdjb25maXJtYXRpb24nLFxuXHRcdFx0XHRjb25maXJtYXRpb25UeXBlOiAncXVlc3Rpb25uYWlyZScsXG5cdFx0XHRcdHRleHQ6IFtcblx0XHRcdFx0XHQncXVlc3Rpb25uYWlyZTogNCBxdWVzdGlvbnMnLFxuXHRcdFx0XHRcdCdjb250ZXh0OiBIZWxwIHNoYXBlIHRoZSBNYXJzIGV4cGVyaWVuY2UuJyxcblx0XHRcdFx0XHQnMS4gV2hpY2ggTWFycyBmZWF0dXJlcyBzaG91bGQgdGhlIGV4cGVyaWVuY2UgaW5jbHVkZT8nLFxuXHRcdFx0XHRcdCdkZXRhaWxzOiBDaG9vc2UgdGhlIG1haW4gZXhwbG9yYXRpb24gc2NvcGUuJyxcblx0XHRcdFx0XHQnb3B0aW9uczogU3VyZmFjZSBleHBsb3JlciAtIERyaXZlIGJldHdlZW4gbGFuZG1hcmtzOyBTY2llbmNlIG1pc3Npb25zIC0gQ29sbGVjdCBzYW1wbGVzIGFuZCBydW4gZXhwZXJpbWVudHM7IGEgY3VzdG9tIHJlc3BvbnNlIGlzIGFsc28gYXZhaWxhYmxlJyxcblx0XHRcdFx0XHQnMi4gSG93IHNob3VsZCBwZW9wbGUgbmF2aWdhdGUgTWFycz8nLFxuXHRcdFx0XHRcdCdvcHRpb25zOiBHdWlkZWQgcm91dGU7IEZyZWUgcm9hbTsgYSBjdXN0b20gcmVzcG9uc2UgaXMgYWxzbyBhdmFpbGFibGUnLFxuXHRcdFx0XHRcdCczLiBXaGljaCBNYXJzIGRhdGEgc2hvdWxkIGJlIGF2YWlsYWJsZT8nLFxuXHRcdFx0XHRcdCdvcHRpb25zOiBUZXJyYWluIG1hcHM7IFdlYXRoZXIgcmVhZGluZ3M7IGEgY3VzdG9tIHJlc3BvbnNlIGlzIGFsc28gYXZhaWxhYmxlJyxcblx0XHRcdFx0XHQnNC4gV2hhdCB2aXN1YWwgc3R5bGUgc2hvdWxkIE1hcnMgdXNlPycsXG5cdFx0XHRcdFx0J29wdGlvbnM6IFBob3RvcmVhbGlzdGljOyBJbGx1c3RyYXRlZDsgYSBjdXN0b20gcmVzcG9uc2UgaXMgYWxzbyBhdmFpbGFibGUnLFxuXHRcdFx0XHRcdCdUaGUgcXVlc3Rpb25uYWlyZSBpcyBvcGVuIGluIEdpdEh1YiBDb3BpbG90LicsXG5cdFx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHR9XSxcblx0XHRcdGNvbnRhaW5zSW50ZXJuYWxJZHM6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRyYWN0cyB2aXNpYmxlIHJ1bnRpbWUgYXNrUXVlc3Rpb25zIGRhdGEgYmVmb3JlIGNhcm91c2VsIHBlcnNpc3RlbmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSBuZXcgQ29udHJvbGxhYmxlQ2hhdFNlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjaGF0U2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdjaGF0LXNlc3Npb246L3J1bnRpbWUtbWFycy1xdWVzdGlvbm5haXJlJyk7XG5cdFx0Y29uc3QgcmF3UXVlc3Rpb25zOiB7XG5cdFx0XHRoZWFkZXI6IHN0cmluZztcblx0XHRcdHF1ZXN0aW9uOiBzdHJpbmc7XG5cdFx0XHRtZXNzYWdlPzogc3RyaW5nO1xuXHRcdFx0b3B0aW9uczogeyBsYWJlbDogc3RyaW5nOyBkZXNjcmlwdGlvbjogc3RyaW5nIH1bXTtcblx0XHRcdG11bHRpU2VsZWN0PzogYm9vbGVhbjtcblx0XHR9W10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRoZWFkZXI6ICdtYXJzX3Njb3BlJyxcblx0XHRcdFx0XHRxdWVzdGlvbjogJ1doYXRcXCdzIHRoZSBzY29wZSBmb3IgTWFycyBpbnRlZ3JhdGlvbj8nLFxuXHRcdFx0XHRcdG1lc3NhZ2U6ICdUaGlzIG9wdGlvbmFsIGRldGFpbCBhcHBlYXJzIG9ubHkgYWZ0ZXIgdGhlIGNhcm91c2VsIGlzIGFwcGVuZGVkLicsXG5cdFx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdFx0eyBsYWJlbDogJ0Z1bGwgcGFyYWxsZWwgc3lzdGVtJywgZGVzY3JpcHRpb246ICdNYXJzIGFzIGEgY29tcGxldGUgYWx0ZXJuYXRpdmUgdmlldyB3aXRoIGl0cyBvd24gbGF5ZXJzLCBkYXRhLCBhbmQgcGFuZWxzIChsaWtlIGEgc2VwYXJhdGUgbW9kZSknIH0sXG5cdFx0XHRcdFx0XHR7IGxhYmVsOiAnQ29tcGFyaXNvbiB2aWV3JywgZGVzY3JpcHRpb246ICdFYXJ0aCBhbmQgTWFycyBzaWRlLWJ5LXNpZGUgZm9yIGNvbXBhcmlzb24gcHVycG9zZXMnIH0sXG5cdFx0XHRcdFx0XHR7IGxhYmVsOiAnU29sYXIgc3lzdGVtIGludGVncmF0aW9uJywgZGVzY3JpcHRpb246ICdNYXJzIGFzIHBhcnQgb2YgYW4gZXhwYW5kYWJsZSBwbGFuZXRhcnkgc3lzdGVtIChFYXJ0aCwgTWFycywgcG90ZW50aWFsbHkgb3RoZXJzKScgfSxcblx0XHRcdFx0XHRcdHsgbGFiZWw6ICdKdXN0IDNEIE1hcnMgdmlzdWFsaXphdGlvbicsIGRlc2NyaXB0aW9uOiAnRm9jdXMgb24gcmVuZGVyaW5nIE1hcnMgd2l0aCBtaW5pbWFsIGRhdGEgbGF5ZXJzIGZvciBub3cnIH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGhlYWRlcjogJ21hcnNfZGF0YScsXG5cdFx0XHRcdFx0cXVlc3Rpb246ICdXaGF0IGRhdGEgc2hvdWxkIE1hcnMgZGlzcGxheT8nLFxuXHRcdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgbGFiZWw6ICdSb3ZlcnMgJiBtaXNzaW9ucycsIGRlc2NyaXB0aW9uOiAnU2hvdyBOQVNBL2ludGVybmF0aW9uYWwgcm92ZXJzLCBsYW5kaW5nIHNpdGVzLCBhbmQgYWN0aXZlIG1pc3Npb25zJyB9LFxuXHRcdFx0XHRcdFx0eyBsYWJlbDogJ0dlb2xvZ2ljYWwgZmVhdHVyZXMnLCBkZXNjcmlwdGlvbjogJ1ZvbGNhbm9lcywgY2FueW9ucywgcG9sYXIgY2Fwcywgd2F0ZXIgaWNlIGRlcG9zaXRzJyB9LFxuXHRcdFx0XHRcdFx0eyBsYWJlbDogJ1JlYWwtdGltZSBkYXRhJywgZGVzY3JpcHRpb246ICdDdXJyZW50IHJvdmVyIHRlbGVtZXRyeSwgYXRtb3NwaGVyaWMgZGF0YSwgZHVzdCBzdG9ybXMnIH0sXG5cdFx0XHRcdFx0XHR7IGxhYmVsOiAnSGFiaXRhYmlsaXR5IGxheWVycycsIGRlc2NyaXB0aW9uOiAnUmFkaWF0aW9uLCB0ZW1wZXJhdHVyZSwgd2F0ZXIgYXZhaWxhYmlsaXR5IHpvbmVzJyB9LFxuXHRcdFx0XHRcdFx0eyBsYWJlbDogJ0FsbCBvZiB0aGUgYWJvdmUnLCBkZXNjcmlwdGlvbjogJ0Z1bGwgY29tcHJlaGVuc2l2ZSBNYXJzIHZpc3VhbGl6YXRpb24nIH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRtdWx0aVNlbGVjdDogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGhlYWRlcjogJ21hcnNfdGV4dHVyZXMnLFxuXHRcdFx0XHRcdHF1ZXN0aW9uOiAnSG93IHNob3VsZCBNYXJzIGJlIHRleHR1cmVkPycsXG5cdFx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdFx0eyBsYWJlbDogJ1Byb2NlZHVyYWxseSBnZW5lcmF0ZWQgKGxpa2UgRWFydGgpJywgZGVzY3JpcHRpb246ICdDYW52YXMtYmFzZWQgcHJvY2VkdXJhbCBnZW5lcmF0aW9uIG1hdGNoaW5nIGN1cnJlbnQgRWFydGggYXBwcm9hY2gnIH0sXG5cdFx0XHRcdFx0XHR7IGxhYmVsOiAnUmVhbCBOQVNBIGltYWdlcnknLCBkZXNjcmlwdGlvbjogJ1VzZSBhY3R1YWwgTWFycyBzYXRlbGxpdGUgaW1hZ2VyeSAocmVxdWlyZXMgZG93bmxvYWRpbmcvaG9zdGluZyBpbWFnZSBmaWxlcyknIH0sXG5cdFx0XHRcdFx0XHR7IGxhYmVsOiAnU2ltcGxpZmllZCBzdHlsaXplZCcsIGRlc2NyaXB0aW9uOiAnU2ltcGxlIGNvbG9yIHBhbGV0dGUgKHJlZC9vcmFuZ2UpIGxpa2UgYSBzaW1wbGlmaWVkIEVhcnRoJyB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRoZWFkZXI6ICdtYXJzX3RpbWVsaW5lJyxcblx0XHRcdFx0XHRxdWVzdGlvbjogJ1Nob3VsZCBNYXJzIGhhdmUgaGlzdG9yaWNhbC9mdXR1cmUgZGF0YT8nLFxuXHRcdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgbGFiZWw6ICdDdXJyZW50IG9ubHknLCBkZXNjcmlwdGlvbjogJ1Nob3cgY3VycmVudCByb3ZlcnMgYW5kIGFjdGl2ZSBtaXNzaW9ucycgfSxcblx0XHRcdFx0XHRcdHsgbGFiZWw6ICdIaXN0b3JpY2FsIG1pc3Npb25zJywgZGVzY3JpcHRpb246ICdJbmNsdWRlIHBhc3Qgcm92ZXJzIChTcGlyaXQsIE9wcG9ydHVuaXR5LCBldGMuKSBhbmQgaGlzdG9yaWNhbCBsYW5kaW5nIHNpdGVzJyB9LFxuXHRcdFx0XHRcdFx0eyBsYWJlbDogJ0Z1dHVyZSBtaXNzaW9ucycsIGRlc2NyaXB0aW9uOiAnSW5jbHVkZSBwbGFubmVkIGZ1dHVyZSBtaXNzaW9ucyBhbmQgY29sb25pemF0aW9uIHpvbmVzJyB9LFxuXHRcdFx0XHRcdFx0eyBsYWJlbDogJ0FsbCB0aW1lZnJhbWVzJywgZGVzY3JpcHRpb246ICdGdWxsIHRpbWVsaW5lIGZyb20gZmlyc3QgbGFuZGluZyB0byBmdXR1cmUgbWlzc2lvbnMnIH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cdFx0Y29uc3QgYmFja2luZ1Rvb2wgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0VG9vbEludm9jYXRpb24+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkga2luZCA9ICd0b29sSW52b2NhdGlvbicgYXMgY29uc3Q7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSB0b29sSWQgPSBBc2tRdWVzdGlvbnNUb29sSWQ7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSB0b29sQ2FsbElkID0gJ3Rvb2x1X3J1bnRpbWUnO1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaW52b2NhdGlvbk1lc3NhZ2UgPSAnQXNrZWQgNCBxdWVzdGlvbnMgKG1hcnNfc2NvcGUsIG1hcnNfZGF0YSwgbWFyc190ZXh0dXJlcywgbWFyc190aW1lbGluZSknO1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT4oJ3Rvb2xTdGF0ZScsIHtcblx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbixcblx0XHRcdFx0cGFyYW1ldGVyczogeyBxdWVzdGlvbnM6IHJhd1F1ZXN0aW9ucyB9LFxuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb25maXJtOiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblx0XHR9KCk7XG5cdFx0Y29uc3QgcGFydHM6IElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnRbXSA9IFtiYWNraW5nVG9vbF07XG5cdFx0Y29uc3QgcGVuZGluZ0NvbmZpcm1hdGlvbiA9IG9ic2VydmFibGVWYWx1ZTx7IGRldGFpbD86IHN0cmluZyB9IHwgdW5kZWZpbmVkPigncGVuZGluZycsIHsgZGV0YWlsOiAnQXNrZWQgNCBxdWVzdGlvbnMnIH0pO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0ge1xuXHRcdFx0aXNQZW5kaW5nQ29uZmlybWF0aW9uOiBwZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0aXNJbmNvbXBsZXRlOiBvYnNlcnZhYmxlVmFsdWUoJ2luY29tcGxldGUnLCBmYWxzZSksXG5cdFx0XHRyZXNwb25zZTogeyB2YWx1ZTogcGFydHMsIGdldE1hcmtkb3duOiAoKSA9PiAnJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgbGFzdFJlcXVlc3QgPSB7IGlkOiAncmVxdWVzdC1ydW50aW1lLXF1ZXN0aW9ubmFpcmUnLCByZXNwb25zZSB9O1xuXHRcdGNvbnN0IG1vZGVsID0ge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0dGl0bGU6ICdDaGF0Jyxcblx0XHRcdGxhc3RNZXNzYWdlRGF0ZTogRGF0ZS5ub3coKSxcblx0XHRcdGdldFJlcXVlc3RzOiAoKSA9PiBbbGFzdFJlcXVlc3RdLFxuXHRcdFx0bGFzdFJlcXVlc3RPYnM6IG9ic2VydmFibGVWYWx1ZSgnbGFzdFJlcXVlc3QnLCBsYXN0UmVxdWVzdCksXG5cdFx0fSBhcyB1bmtub3duIGFzIElDaGF0TW9kZWw7XG5cdFx0Y29uc3QgZ2V0QWdlbnRTdGF0ZUluZm8gPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2dldEFnZW50U3RhdGVJbmZvJykgYXMgKG1vZGVsOiBJQ2hhdE1vZGVsKSA9PiB7XG5cdFx0XHRzdGF0ZTogc3RyaW5nO1xuXHRcdFx0ZGV0YWlsPzogc3RyaW5nO1xuXHRcdFx0Y29uZmlybWF0aW9uX3R5cGU/OiBWb2ljZUNvbmZpcm1hdGlvblR5cGU7XG5cdFx0fTtcblx0XHRjb25zdCBjaGVja1Nlc3Npb25TdGF0ZUNoYW5nZXMgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2NoZWNrU2Vzc2lvblN0YXRlQ2hhbmdlcycpIGFzICgpID0+IHZvaWQ7XG5cdFx0Y29uc3QgcHJldmlvdXNTdGF0ZXMgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3ByZXZTZXNzaW9uU3RhdGVzJykgYXMgTWFwPHN0cmluZywge1xuXHRcdFx0c3RhdGU6IHN0cmluZztcblx0XHRcdGRldGFpbDogc3RyaW5nO1xuXHRcdFx0Y29uZmlybWF0aW9uVHlwZT86IFZvaWNlQ29uZmlybWF0aW9uVHlwZTtcblx0XHRcdGxhc3RSZXNwb25zZVN1bW1hcnk6IHN0cmluZztcblx0XHR9PjtcblxuXHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y2hhdFNlcnZpY2Uuc2V0TW9kZWxzKFttb2RlbF0pO1xuXHRcdHByZXZpb3VzU3RhdGVzLnNldChzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwgeyBzdGF0ZTogJ3RoaW5raW5nJywgZGV0YWlsOiAnJywgbGFzdFJlc3BvbnNlU3VtbWFyeTogJycgfSk7XG5cdFx0Y29uc3QgcGVuZGluZ0luZm8gPSBnZXRBZ2VudFN0YXRlSW5mby5jYWxsKGNvbnRyb2xsZXIsIG1vZGVsKTtcblx0XHRjaGVja1Nlc3Npb25TdGF0ZUNoYW5nZXMuY2FsbChjb250cm9sbGVyKTtcblx0XHRjb25zdCByZXF1ZXN0c0JlZm9yZUNhcm91c2VsID0gdm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzLmxlbmd0aDtcblx0XHRjb25zdCBuYXJyYXRpb25CZWZvcmVDYXJvdXNlbCA9IHZvaWNlQ2xpZW50U2VydmljZS5yZXF1ZXN0cy5hdCgtMSk7XG5cblx0XHRjb25zdCBydW50aW1lQ2Fyb3VzZWwgPSBuZXcgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhKHJhd1F1ZXN0aW9ucy5tYXAoKHF1ZXN0aW9uLCBpbmRleCkgPT4gKHtcblx0XHRcdGlkOiBgdG9vbHVfcnVudGltZToke2luZGV4fWAsXG5cdFx0XHR0eXBlOiBxdWVzdGlvbi5tdWx0aVNlbGVjdCA/ICdtdWx0aVNlbGVjdCcgOiAnc2luZ2xlU2VsZWN0Jyxcblx0XHRcdHRpdGxlOiBxdWVzdGlvbi5oZWFkZXIsXG5cdFx0XHRtZXNzYWdlOiBxdWVzdGlvbi5xdWVzdGlvbixcblx0XHRcdGRldGFpbGVkTWVzc2FnZTogcXVlc3Rpb24ubWVzc2FnZSxcblx0XHRcdG9wdGlvbnM6IHF1ZXN0aW9uLm9wdGlvbnMubWFwKG9wdGlvbiA9PiAoe1xuXHRcdFx0XHRpZDogb3B0aW9uLmxhYmVsLFxuXHRcdFx0XHRsYWJlbDogYCR7b3B0aW9uLmxhYmVsfSAtICR7b3B0aW9uLmRlc2NyaXB0aW9ufWAsXG5cdFx0XHRcdHZhbHVlOiBvcHRpb24ubGFiZWwsXG5cdFx0XHR9KSksXG5cdFx0XHRhbGxvd0ZyZWVmb3JtSW5wdXQ6IHRydWUsXG5cdFx0fSkpLCB0cnVlLCAndG9vbHVfcnVudGltZScpO1xuXHRcdHBhcnRzLnB1c2gocnVudGltZUNhcm91c2VsKTtcblx0XHRjaGVja1Nlc3Npb25TdGF0ZUNoYW5nZXMuY2FsbChjb250cm9sbGVyKTtcblx0XHRjb25zdCByZXF1ZXN0c0FmdGVyQ2Fyb3VzZWwgPSB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHMubGVuZ3RoO1xuXHRcdGNvbnN0IG5hcnJhdGlvbkFmdGVyQ2Fyb3VzZWwgPSB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHMuYXQoLTEpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwZW5kaW5nU3RhdGU6IHBlbmRpbmdJbmZvLnN0YXRlLFxuXHRcdFx0cGVuZGluZ1R5cGU6IHBlbmRpbmdJbmZvLmNvbmZpcm1hdGlvbl90eXBlLFxuXHRcdFx0cGVuZGluZ0hhc1Zpc2libGVEZXRhaWw6IHBlbmRpbmdJbmZvLmRldGFpbD8uc3RhcnRzV2l0aCgncXVlc3Rpb25uYWlyZTogNCBxdWVzdGlvbnMnKSxcblx0XHRcdHJlcXVlc3RzQmVmb3JlQ2Fyb3VzZWwsXG5cdFx0XHRyZXF1ZXN0c0FmdGVyQ2Fyb3VzZWwsXG5cdFx0XHRpbml0aWFsTmFycmF0aW9uS2luZDogbmFycmF0aW9uQmVmb3JlQ2Fyb3VzZWw/LmtpbmQsXG5cdFx0XHRpbml0aWFsTmFycmF0aW9uVHlwZTogbmFycmF0aW9uQmVmb3JlQ2Fyb3VzZWw/LmNvbmZpcm1hdGlvblR5cGUsXG5cdFx0XHRpbml0aWFsSGFzUXVlc3Rpb25Db3VudDogbmFycmF0aW9uQmVmb3JlQ2Fyb3VzZWw/LnRleHQuc3RhcnRzV2l0aCgncXVlc3Rpb25uYWlyZTogNCBxdWVzdGlvbnMnKSxcblx0XHRcdGluaXRpYWxIYXNGaXJzdFByb21wdDogbmFycmF0aW9uQmVmb3JlQ2Fyb3VzZWw/LnRleHQuaW5jbHVkZXMoJzEuIFdoYXRcXCdzIHRoZSBzY29wZSBmb3IgTWFycyBpbnRlZ3JhdGlvbj8nKSxcblx0XHRcdGluaXRpYWxIYXNMYXN0UHJvbXB0OiBuYXJyYXRpb25CZWZvcmVDYXJvdXNlbD8udGV4dC5pbmNsdWRlcygnNC4gU2hvdWxkIE1hcnMgaGF2ZSBoaXN0b3JpY2FsL2Z1dHVyZSBkYXRhPycpLFxuXHRcdFx0Zm9sbG93dXBOYXJyYXRpb25LaW5kOiBuYXJyYXRpb25BZnRlckNhcm91c2VsPy5raW5kLFxuXHRcdFx0Zm9sbG93dXBIYXNWaXNpYmxlT3B0aW9uRGVzY3JpcHRpb246IG5hcnJhdGlvbkFmdGVyQ2Fyb3VzZWw/LnRleHQuaW5jbHVkZXMoJ0Z1bGwgcGFyYWxsZWwgc3lzdGVtIC0gTWFycyBhcyBhIGNvbXBsZXRlIGFsdGVybmF0aXZlIHZpZXcnKSxcblx0XHRcdGluY2x1ZGVzTGF0ZURldGFpbHM6IG5hcnJhdGlvbkFmdGVyQ2Fyb3VzZWw/LnRleHQuaW5jbHVkZXMoJ1RoaXMgb3B0aW9uYWwgZGV0YWlsIGFwcGVhcnMgb25seSBhZnRlciB0aGUgY2Fyb3VzZWwgaXMgYXBwZW5kZWQuJyksXG5cdFx0XHR1c2VkRmFsbGJhY2s6IG5hcnJhdGlvbkJlZm9yZUNhcm91c2VsPy50ZXh0ID09PSAnSSBuZWVkIHlvdXIgaW5wdXQgaW4gdGhlIG9wZW4gcXVlc3Rpb25uYWlyZS4nLFxuXHRcdFx0Y29udGFpbnNIaWRkZW5JZHM6IFsnbWFyc19zY29wZScsICdtYXJzX2RhdGEnLCAnbWFyc190ZXh0dXJlcycsICdtYXJzX3RpbWVsaW5lJywgJ3Rvb2x1X3J1bnRpbWUnXVxuXHRcdFx0XHQuc29tZSh2YWx1ZSA9PiBuYXJyYXRpb25CZWZvcmVDYXJvdXNlbD8udGV4dC5pbmNsdWRlcyh2YWx1ZSkgfHwgbmFycmF0aW9uQWZ0ZXJDYXJvdXNlbD8udGV4dC5pbmNsdWRlcyh2YWx1ZSkpLFxuXHRcdH0sIHtcblx0XHRcdHBlbmRpbmdTdGF0ZTogJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicsXG5cdFx0XHRwZW5kaW5nVHlwZTogJ3F1ZXN0aW9ubmFpcmUnLFxuXHRcdFx0cGVuZGluZ0hhc1Zpc2libGVEZXRhaWw6IHRydWUsXG5cdFx0XHRyZXF1ZXN0c0JlZm9yZUNhcm91c2VsOiAxLFxuXHRcdFx0cmVxdWVzdHNBZnRlckNhcm91c2VsOiAyLFxuXHRcdFx0aW5pdGlhbE5hcnJhdGlvbktpbmQ6ICdjb25maXJtYXRpb24nLFxuXHRcdFx0aW5pdGlhbE5hcnJhdGlvblR5cGU6ICdxdWVzdGlvbm5haXJlJyxcblx0XHRcdGluaXRpYWxIYXNRdWVzdGlvbkNvdW50OiB0cnVlLFxuXHRcdFx0aW5pdGlhbEhhc0ZpcnN0UHJvbXB0OiB0cnVlLFxuXHRcdFx0aW5pdGlhbEhhc0xhc3RQcm9tcHQ6IHRydWUsXG5cdFx0XHRmb2xsb3d1cE5hcnJhdGlvbktpbmQ6ICdxdWVzdGlvbicsXG5cdFx0XHRmb2xsb3d1cEhhc1Zpc2libGVPcHRpb25EZXNjcmlwdGlvbjogdHJ1ZSxcblx0XHRcdGluY2x1ZGVzTGF0ZURldGFpbHM6IGZhbHNlLFxuXHRcdFx0dXNlZEZhbGxiYWNrOiBmYWxzZSxcblx0XHRcdGNvbnRhaW5zSGlkZGVuSWRzOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVmZXJzIHJ1bnRpbWUgYXNrUXVlc3Rpb25zIG5hcnJhdGlvbiB1bnRpbCB2aXNpYmxlIHBhcmFtZXRlcnMgcG9wdWxhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBjaGF0U2VydmljZSA9IG5ldyBDb250cm9sbGFibGVDaGF0U2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHZvaWNlQ2xpZW50U2VydmljZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGNoYXRTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovbGF0ZS1ydW50aW1lLXF1ZXN0aW9ubmFpcmUnKTtcblx0XHRjb25zdCB0b29sU3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT4oJ3Rvb2xTdGF0ZScsIHtcblx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRwYXJhbWV0ZXJzOiB7IHF1ZXN0aW9uczogW10gfSxcblx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB1bmRlZmluZWQsXG5cdFx0XHRjb25maXJtOiAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgYmFja2luZ1Rvb2wgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0VG9vbEludm9jYXRpb24+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkga2luZCA9ICd0b29sSW52b2NhdGlvbicgYXMgY29uc3Q7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSB0b29sSWQgPSBBc2tRdWVzdGlvbnNUb29sSWQ7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBpbnZvY2F0aW9uTWVzc2FnZSA9ICdBc2tpbmcgYSBjbGFyaWZ5aW5nIHF1ZXN0aW9uJztcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXRlID0gdG9vbFN0YXRlO1xuXHRcdH0oKTtcblx0XHRjb25zdCBwZW5kaW5nQ29uZmlybWF0aW9uID0gb2JzZXJ2YWJsZVZhbHVlPHsgZGV0YWlsPzogc3RyaW5nIH0gfCB1bmRlZmluZWQ+KCdwZW5kaW5nJywgeyBkZXRhaWw6ICdBc2tpbmcgYSBjbGFyaWZ5aW5nIHF1ZXN0aW9uJyB9KTtcblx0XHRjb25zdCByZXNwb25zZSA9IHtcblx0XHRcdGlzUGVuZGluZ0NvbmZpcm1hdGlvbjogcGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdGlzSW5jb21wbGV0ZTogb2JzZXJ2YWJsZVZhbHVlKCdpbmNvbXBsZXRlJywgZmFsc2UpLFxuXHRcdFx0cmVzcG9uc2U6IHsgdmFsdWU6IFtiYWNraW5nVG9vbF0sIGdldE1hcmtkb3duOiAoKSA9PiAnJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgbGFzdFJlcXVlc3QgPSB7IGlkOiAncmVxdWVzdC1sYXRlLXF1ZXN0aW9ubmFpcmUnLCByZXNwb25zZSB9O1xuXHRcdGNvbnN0IG1vZGVsID0ge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0dGl0bGU6ICdDaGF0Jyxcblx0XHRcdGxhc3RNZXNzYWdlRGF0ZTogRGF0ZS5ub3coKSxcblx0XHRcdGdldFJlcXVlc3RzOiAoKSA9PiBbbGFzdFJlcXVlc3RdLFxuXHRcdFx0bGFzdFJlcXVlc3RPYnM6IG9ic2VydmFibGVWYWx1ZSgnbGFzdFJlcXVlc3QnLCBsYXN0UmVxdWVzdCksXG5cdFx0fSBhcyB1bmtub3duIGFzIElDaGF0TW9kZWw7XG5cdFx0Y29uc3QgZ2V0QWdlbnRTdGF0ZUluZm8gPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2dldEFnZW50U3RhdGVJbmZvJykgYXMgKG1vZGVsOiBJQ2hhdE1vZGVsKSA9PiB7XG5cdFx0XHRzdGF0ZTogc3RyaW5nO1xuXHRcdFx0ZGV0YWlsPzogc3RyaW5nO1xuXHRcdFx0Y29uZmlybWF0aW9uX3R5cGU/OiBWb2ljZUNvbmZpcm1hdGlvblR5cGU7XG5cdFx0fTtcblx0XHRjb25zdCBjaGVja1Nlc3Npb25TdGF0ZUNoYW5nZXMgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2NoZWNrU2Vzc2lvblN0YXRlQ2hhbmdlcycpIGFzICgpID0+IHZvaWQ7XG5cdFx0Y29uc3QgcHJldmlvdXNTdGF0ZXMgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3ByZXZTZXNzaW9uU3RhdGVzJykgYXMgTWFwPHN0cmluZywge1xuXHRcdFx0c3RhdGU6IHN0cmluZztcblx0XHRcdGRldGFpbDogc3RyaW5nO1xuXHRcdFx0Y29uZmlybWF0aW9uVHlwZT86IFZvaWNlQ29uZmlybWF0aW9uVHlwZTtcblx0XHRcdGxhc3RSZXNwb25zZVN1bW1hcnk6IHN0cmluZztcblx0XHR9PjtcblxuXHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y2hhdFNlcnZpY2Uuc2V0TW9kZWxzKFttb2RlbF0pO1xuXHRcdHByZXZpb3VzU3RhdGVzLnNldChzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwgeyBzdGF0ZTogJ3RoaW5raW5nJywgZGV0YWlsOiAnJywgbGFzdFJlc3BvbnNlU3VtbWFyeTogJycgfSk7XG5cdFx0Y29uc3QgcGVuZGluZ0luZm8gPSBnZXRBZ2VudFN0YXRlSW5mby5jYWxsKGNvbnRyb2xsZXIsIG1vZGVsKTtcblx0XHRjaGVja1Nlc3Npb25TdGF0ZUNoYW5nZXMuY2FsbChjb250cm9sbGVyKTtcblx0XHRjb25zdCByZXF1ZXN0c0JlZm9yZVBvcHVsYXRpb24gPSB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHMubGVuZ3RoO1xuXG5cdFx0dG9vbFN0YXRlLnNldCh7XG5cdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uLFxuXHRcdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0XHRxdWVzdGlvbnM6IFt7XG5cdFx0XHRcdFx0aGVhZGVyOiAnaW50ZXJuYWxfc2NvcGUnLFxuXHRcdFx0XHRcdHF1ZXN0aW9uOiAnV2hpY2ggTWFycyBzY29wZSBzaG91bGQgR2l0SHViIENvcGlsb3QgdXNlPycsXG5cdFx0XHRcdFx0b3B0aW9uczogW3tcblx0XHRcdFx0XHRcdGxhYmVsOiAnQ29tcGFyaXNvbiB2aWV3Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnU2hvdyBFYXJ0aCBhbmQgTWFycyBzaWRlLWJ5LXNpZGUnLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICdoaWRkZW4tdmFsdWUnLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdHJlY29tbWVuZGVkOiB0cnVlLFxuXHRcdFx0XHR9XSxcblx0XHRcdH0sXG5cdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogdW5kZWZpbmVkLFxuXHRcdFx0Y29uZmlybTogKCkgPT4geyB9LFxuXHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0Y2hlY2tTZXNzaW9uU3RhdGVDaGFuZ2VzLmNhbGwoY29udHJvbGxlcik7XG5cdFx0Y29uc3QgbmFycmF0aW9uID0gdm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzLmF0KC0xKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGVuZGluZ0luZm8sXG5cdFx0XHRyZXF1ZXN0c0JlZm9yZVBvcHVsYXRpb24sXG5cdFx0XHRuYXJyYXRpb246IG5hcnJhdGlvbiA/IHtcblx0XHRcdFx0a2luZDogbmFycmF0aW9uLmtpbmQsXG5cdFx0XHRcdGNvbmZpcm1hdGlvblR5cGU6IG5hcnJhdGlvbi5jb25maXJtYXRpb25UeXBlLFxuXHRcdFx0XHR0ZXh0OiBuYXJyYXRpb24udGV4dCxcblx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRjb250YWluc0hpZGRlbk1ldGFkYXRhOiBbJ2ludGVybmFsX3Njb3BlJywgJ2hpZGRlbi12YWx1ZScsICdyZWNvbW1lbmRlZCddXG5cdFx0XHRcdC5zb21lKHZhbHVlID0+IG5hcnJhdGlvbj8udGV4dC5pbmNsdWRlcyh2YWx1ZSkpLFxuXHRcdH0sIHtcblx0XHRcdHBlbmRpbmdJbmZvOiB7XG5cdFx0XHRcdHN0YXRlOiAnd2FpdGluZ19mb3JfY29uZmlybWF0aW9uJyxcblx0XHRcdFx0Y29uZmlybWF0aW9uX3R5cGU6ICdxdWVzdGlvbm5haXJlJyxcblx0XHRcdH0sXG5cdFx0XHRyZXF1ZXN0c0JlZm9yZVBvcHVsYXRpb246IDAsXG5cdFx0XHRuYXJyYXRpb246IHtcblx0XHRcdFx0a2luZDogJ2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdGNvbmZpcm1hdGlvblR5cGU6ICdxdWVzdGlvbm5haXJlJyxcblx0XHRcdFx0dGV4dDogW1xuXHRcdFx0XHRcdCdxdWVzdGlvbm5haXJlOiAxIHF1ZXN0aW9uJyxcblx0XHRcdFx0XHQnMS4gV2hpY2ggTWFycyBzY29wZSBzaG91bGQgR2l0SHViIENvcGlsb3QgdXNlPycsXG5cdFx0XHRcdFx0J29wdGlvbnM6IENvbXBhcmlzb24gdmlldyAtIFNob3cgRWFydGggYW5kIE1hcnMgc2lkZS1ieS1zaWRlOyBhIGN1c3RvbSByZXNwb25zZSBpcyBhbHNvIGF2YWlsYWJsZScsXG5cdFx0XHRcdFx0J1RoZSBxdWVzdGlvbm5haXJlIGlzIG9wZW4gaW4gR2l0SHViIENvcGlsb3QuJyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdH0sXG5cdFx0XHRjb250YWluc0hpZGRlbk1ldGFkYXRhOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2FycmllcyBxdWVzdGlvbm5haXJlIHR5cGUgaW4gc2Vzc2lvbiBjb250ZXh0IGFuZCBjbGVhcnMgaXQgd2hlbiByZXNvbHZlZCcsICgpID0+IHtcblx0XHRjb25zdCBjaGF0U2VydmljZSA9IG5ldyBDb250cm9sbGFibGVDaGF0U2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjaGF0U2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdjaGF0LXNlc3Npb246L2R1cmFibGUtcXVlc3Rpb25uYWlyZScpO1xuXHRcdGNvbnN0IGNhcm91c2VsID0gbmV3IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YShbe1xuXHRcdFx0aWQ6ICdoaWRkZW4tcXVlc3Rpb24taWQnLFxuXHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHR0aXRsZTogJ0hpZGRlbiB0aXRsZSBrZXknLFxuXHRcdFx0bWVzc2FnZTogJ1doaWNoIGRlcGxveW1lbnQgc2hvdWxkIEdpdEh1YiBDb3BpbG90IHVzZT8nLFxuXHRcdFx0b3B0aW9uczogW3sgaWQ6ICdoaWRkZW4tb3B0aW9uLWlkJywgbGFiZWw6ICdQcmV2aWV3IGRlcGxveW1lbnQnLCB2YWx1ZTogJ2hpZGRlbi1vcHRpb24tdmFsdWUnIH1dLFxuXHRcdH1dLCB0cnVlKTtcblx0XHRjb25zdCBwZW5kaW5nQ29uZmlybWF0aW9uID0gb2JzZXJ2YWJsZVZhbHVlPHsgZGV0YWlsPzogc3RyaW5nIH0gfCB1bmRlZmluZWQ+KCdwZW5kaW5nJywgeyBkZXRhaWw6ICdOZWVkcyBhcHByb3ZhbCcgfSk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSB7XG5cdFx0XHRpc1BlbmRpbmdDb25maXJtYXRpb246IHBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRpc0luY29tcGxldGU6IG9ic2VydmFibGVWYWx1ZSgnaW5jb21wbGV0ZScsIGZhbHNlKSxcblx0XHRcdHJlc3BvbnNlOiB7IHZhbHVlOiBbY2Fyb3VzZWxdLCBnZXRNYXJrZG93bjogKCkgPT4gJycgfSxcblx0XHR9O1xuXHRcdGNvbnN0IGxhc3RSZXF1ZXN0ID0geyBpZDogJ3JlcXVlc3QtcXVlc3Rpb25uYWlyZScsIHJlc3BvbnNlIH07XG5cdFx0Y29uc3QgbW9kZWwgPSB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHR0aXRsZTogJ0NoYXQnLFxuXHRcdFx0bGFzdE1lc3NhZ2VEYXRlOiBEYXRlLm5vdygpLFxuXHRcdFx0Z2V0UmVxdWVzdHM6ICgpID0+IFtsYXN0UmVxdWVzdF0sXG5cdFx0XHRsYXN0UmVxdWVzdE9iczogb2JzZXJ2YWJsZVZhbHVlKCdsYXN0UmVxdWVzdCcsIGxhc3RSZXF1ZXN0KSxcblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRNb2RlbDtcblx0XHRjb25zdCBidWlsZFNlc3Npb25Db250ZXh0ID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19idWlsZFNlc3Npb25Db250ZXh0JykgYXMgKCkgPT4geyBzZXNzaW9uczogcmVhZG9ubHkgUmVjb3JkPHN0cmluZywgdW5rbm93bj5bXSB9O1xuXG5cdFx0Y29udHJvbGxlci5zZXRBY3RpdmVTZXNzaW9uU2hvd24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRjaGF0U2VydmljZS5zZXRNb2RlbHMoW21vZGVsXSk7XG5cdFx0Y29uc3QgcGVuZGluZ0NvbnRleHQgPSBidWlsZFNlc3Npb25Db250ZXh0LmNhbGwoY29udHJvbGxlcikuc2Vzc2lvbnNbMF07XG5cdFx0Y2Fyb3VzZWwuaXNVc2VkID0gdHJ1ZTtcblx0XHRjYXJvdXNlbC5pc1VzZWQgPSB0cnVlO1xuXHRcdHBlbmRpbmdDb25maXJtYXRpb24uc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCByZXNvbHZlZENvbnRleHQgPSBidWlsZFNlc3Npb25Db250ZXh0LmNhbGwoY29udHJvbGxlcikuc2Vzc2lvbnNbMF07XG5cblx0XHRjb25zdCBwZW5kaW5nID0gcGVuZGluZ0NvbnRleHQ/LlsncGVuZGluZyddIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGVuZGluZ0NvbnRleHQ6IHBlbmRpbmdDb250ZXh0ID8ge1xuXHRcdFx0XHRpZDogcGVuZGluZ0NvbnRleHRbJ2lkJ10sXG5cdFx0XHRcdGlzX2FjdGl2ZTogcGVuZGluZ0NvbnRleHRbJ2lzX2FjdGl2ZSddLFxuXHRcdFx0XHRhZ2VudF9zdGF0ZTogcGVuZGluZ0NvbnRleHRbJ2FnZW50X3N0YXRlJ10sXG5cdFx0XHRcdGFnZW50X3N0YXRlX2RldGFpbDogcGVuZGluZ0NvbnRleHRbJ2FnZW50X3N0YXRlX2RldGFpbCddLFxuXHRcdFx0XHRjb25maXJtYXRpb25fdHlwZTogcGVuZGluZ0NvbnRleHRbJ2NvbmZpcm1hdGlvbl90eXBlJ10sXG5cdFx0XHRcdHBlbmRpbmc6IHBlbmRpbmcgPyB7XG5cdFx0XHRcdFx0dHlwZTogcGVuZGluZ1sndHlwZSddLFxuXHRcdFx0XHRcdHJlcXVlc3RfaWQ6IHBlbmRpbmdbJ3JlcXVlc3RfaWQnXSxcblx0XHRcdFx0XHRwZW5kaW5nSWRNYXRjaGVzUmVxdWVzdDogdHlwZW9mIHBlbmRpbmdbJ3BlbmRpbmdfaWQnXSA9PT0gJ3N0cmluZycgJiYgcGVuZGluZ1sncGVuZGluZ19pZCddLnN0YXJ0c1dpdGgoJ3JlcXVlc3QtcXVlc3Rpb25uYWlyZSMnKSxcblx0XHRcdFx0XHRhbGxvd19za2lwOiBwZW5kaW5nWydhbGxvd19za2lwJ10sXG5cdFx0XHRcdFx0cXVlc3Rpb25zOiBwZW5kaW5nWydxdWVzdGlvbnMnXSxcblx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRyZXNvbHZlZENvbnRleHQsXG5cdFx0fSwge1xuXHRcdFx0cGVuZGluZ0NvbnRleHQ6IHtcblx0XHRcdFx0aWQ6IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRpc19hY3RpdmU6IHRydWUsXG5cdFx0XHRcdGFnZW50X3N0YXRlOiAnd2FpdGluZ19mb3JfY29uZmlybWF0aW9uJyxcblx0XHRcdFx0YWdlbnRfc3RhdGVfZGV0YWlsOiBbXG5cdFx0XHRcdFx0J3F1ZXN0aW9ubmFpcmU6IDEgcXVlc3Rpb24nLFxuXHRcdFx0XHRcdCcxLiBXaGljaCBkZXBsb3ltZW50IHNob3VsZCBHaXRIdWIgQ29waWxvdCB1c2U/Jyxcblx0XHRcdFx0XHQnb3B0aW9uczogUHJldmlldyBkZXBsb3ltZW50OyBhIGN1c3RvbSByZXNwb25zZSBpcyBhbHNvIGF2YWlsYWJsZScsXG5cdFx0XHRcdFx0J1RoZSBxdWVzdGlvbm5haXJlIGlzIG9wZW4gaW4gR2l0SHViIENvcGlsb3QuJyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdFx0Y29uZmlybWF0aW9uX3R5cGU6ICdxdWVzdGlvbm5haXJlJyxcblx0XHRcdFx0cGVuZGluZzoge1xuXHRcdFx0XHRcdHR5cGU6ICdxdWVzdGlvbnMnLFxuXHRcdFx0XHRcdHJlcXVlc3RfaWQ6ICdyZXF1ZXN0LXF1ZXN0aW9ubmFpcmUnLFxuXHRcdFx0XHRcdHBlbmRpbmdJZE1hdGNoZXNSZXF1ZXN0OiB0cnVlLFxuXHRcdFx0XHRcdGFsbG93X3NraXA6IHRydWUsXG5cdFx0XHRcdFx0cXVlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdFx0aWQ6ICdoaWRkZW4tcXVlc3Rpb24taWQnLFxuXHRcdFx0XHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHRcdFx0XHR0aXRsZTogJ1doaWNoIGRlcGxveW1lbnQgc2hvdWxkIEdpdEh1YiBDb3BpbG90IHVzZT8nLFxuXHRcdFx0XHRcdFx0YWxsb3dfZnJlZWZvcm06IHRydWUsXG5cdFx0XHRcdFx0XHRvcHRpb25zOiBbeyBsYWJlbDogJ1ByZXZpZXcgZGVwbG95bWVudCcsIHZhbHVlOiAnaGlkZGVuLW9wdGlvbi12YWx1ZScgfV0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0cmVzb2x2ZWRDb250ZXh0OiB7XG5cdFx0XHRcdGlkOiBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0bGFiZWw6ICdDaGF0Jyxcblx0XHRcdFx0aXNfYWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRhZ2VudF9zdGF0ZTogJ2lkbGUnLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncm91dGVzIHN0cnVjdHVyZWQgcGVuZGluZyByZXNwb25zZXMgdG8gdGhlIHNhbWUgYWN0aW9uIHRoYXQgaXMgbmFycmF0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSBuZXcgQ29udHJvbGxhYmxlQ2hhdFNlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgY2hhdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGJ1aWxkU2Vzc2lvbkNvbnRleHQgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2J1aWxkU2Vzc2lvbkNvbnRleHQnKSBhcyAoKSA9PiB7IHNlc3Npb25zOiByZWFkb25seSB7IHBlbmRpbmc/OiB7IHR5cGU6IHN0cmluZzsgcGVuZGluZ19pZDogc3RyaW5nOyBtZXNzYWdlPzogc3RyaW5nIH0gfVtdIH07XG5cdFx0Y29uc3Qgd2FpdGluZ1Rvb2wgPSAoaWQ6IHN0cmluZywgcG9zdEFwcHJvdmFsID0gZmFsc2UpID0+IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRUb29sSW52b2NhdGlvbj4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBraW5kID0gJ3Rvb2xJbnZvY2F0aW9uJyBhcyBjb25zdDtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHRvb2xJZCA9IGlkO1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaW52b2NhdGlvbk1lc3NhZ2UgPSBgUnVuICR7aWR9YDtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0VG9vbEludm9jYXRpb24uU3RhdGU+KGAke2lkfVN0YXRlYCwgcG9zdEFwcHJvdmFsID8ge1xuXHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yUG9zdEFwcHJvdmFsLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7fSxcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHsgdGl0bGU6IGBBcHByb3ZlICR7aWR9P2AsIG1lc3NhZ2U6IGBSZXZpZXcgJHtpZH0uYCB9LFxuXHRcdFx0XHRjb25maXJtZWQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSxcblx0XHRcdFx0cmVzdWx0RGV0YWlsczogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb25maXJtOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGNvbnRlbnRGb3JNb2RlbDogW10sXG5cdFx0XHR9IDoge1xuXHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7fSxcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHsgdGl0bGU6IGBBcHByb3ZlICR7aWR9P2AsIG1lc3NhZ2U6IGBSZXZpZXcgJHtpZH0uYCB9LFxuXHRcdFx0XHRjb25maXJtOiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblx0XHR9KCk7XG5cdFx0Y29uc3QgcGVuZGluZ0ZvciA9IChyZXNvdXJjZTogVVJJLCByZXF1ZXN0SWQ6IHN0cmluZywgcGFydHM6IElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnRbXSkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSB7XG5cdFx0XHRcdGlzUGVuZGluZ0NvbmZpcm1hdGlvbjogb2JzZXJ2YWJsZVZhbHVlPHsgZGV0YWlsPzogc3RyaW5nIH0gfCB1bmRlZmluZWQ+KGAke3JlcXVlc3RJZH1QZW5kaW5nYCwgeyBkZXRhaWw6ICdOZWVkcyBpbnB1dCcgfSksXG5cdFx0XHRcdGlzSW5jb21wbGV0ZTogb2JzZXJ2YWJsZVZhbHVlKGAke3JlcXVlc3RJZH1JbmNvbXBsZXRlYCwgZmFsc2UpLFxuXHRcdFx0XHRyZXNwb25zZTogeyB2YWx1ZTogcGFydHMsIGdldE1hcmtkb3duOiAoKSA9PiAnJyB9LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGxhc3RSZXF1ZXN0ID0geyBpZDogcmVxdWVzdElkLCByZXNwb25zZSB9O1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHRcdHRpdGxlOiAnQ2hhdCcsXG5cdFx0XHRcdGxhc3RNZXNzYWdlRGF0ZTogRGF0ZS5ub3coKSxcblx0XHRcdFx0Z2V0UmVxdWVzdHM6ICgpID0+IFtsYXN0UmVxdWVzdF0sXG5cdFx0XHRcdGxhc3RSZXF1ZXN0T2JzOiBvYnNlcnZhYmxlVmFsdWUoYCR7cmVxdWVzdElkfUxhc3RSZXF1ZXN0YCwgbGFzdFJlcXVlc3QpLFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElDaGF0TW9kZWw7XG5cdFx0XHRjb250cm9sbGVyLnNldEFjdGl2ZVNlc3Npb25TaG93bihyZXNvdXJjZSk7XG5cdFx0XHRjaGF0U2VydmljZS5zZXRNb2RlbHMoW21vZGVsXSk7XG5cdFx0XHRyZXR1cm4gYnVpbGRTZXNzaW9uQ29udGV4dC5jYWxsKGNvbnRyb2xsZXIpLnNlc3Npb25zWzBdPy5wZW5kaW5nO1xuXHRcdH07XG5cblx0XHRjb25zdCBxdWVzdGlvbm5haXJlID0gbmV3IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YShbe1xuXHRcdFx0aWQ6ICdyZWdpb24nLFxuXHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHR0aXRsZTogJ1JlZ2lvbicsXG5cdFx0XHRtZXNzYWdlOiAnV2hpY2ggcmVnaW9uPycsXG5cdFx0XHRvcHRpb25zOiBbeyBpZDogJ3dlc3QnLCBsYWJlbDogJ1dlc3QgVVMnLCB2YWx1ZTogJ3dlc3R1cycgfV0sXG5cdFx0fV0sIHRydWUpO1xuXHRcdGNvbnN0IHVucmVsYXRlZFRvb2wgPSB3YWl0aW5nVG9vbCgndW5yZWxhdGVkJyk7XG5cdFx0Y29uc3QgcXVlc3Rpb25uYWlyZVBlbmRpbmcgPSBwZW5kaW5nRm9yKFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi9xdWVzdGlvbm5haXJlLXJvdXRlJyksICdyZXF1ZXN0LXF1ZXN0aW9ubmFpcmUtcm91dGUnLCBbcXVlc3Rpb25uYWlyZSwgdW5yZWxhdGVkVG9vbF0pO1xuXG5cdFx0Y29uc3QgcGxhbiA9IG5ldyBDaGF0UGxhblJldmlld0RhdGEoJ1JldmlldyBwbGFuJywgJ1BsYW4gYm9keScsIFt7IGlkOiAnaW1wbGVtZW50JywgbGFiZWw6ICdJbXBsZW1lbnQgUGxhbicgfV0sIHRydWUpO1xuXHRcdGNvbnN0IG9sZGVyVG9vbCA9IHdhaXRpbmdUb29sKCdvbGRlcicpO1xuXHRcdGNvbnN0IHBsYW5QZW5kaW5nID0gcGVuZGluZ0ZvcihVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovcGxhbi1yb3V0ZScpLCAncmVxdWVzdC1wbGFuLXJvdXRlJywgW29sZGVyVG9vbCwgcGxhbl0pO1xuXG5cdFx0Y29uc3QgcG9zdEFwcHJvdmFsVG9vbCA9IHdhaXRpbmdUb29sKCdwb3N0LWFwcHJvdmFsJywgdHJ1ZSk7XG5cdFx0Y29uc3QgcG9zdEFwcHJvdmFsUGVuZGluZyA9IHBlbmRpbmdGb3IoVVJJLnBhcnNlKCdjaGF0LXNlc3Npb246L3Bvc3Qtcm91dGUnKSwgJ3JlcXVlc3QtcG9zdC1yb3V0ZScsIFtwb3N0QXBwcm92YWxUb29sXSk7XG5cblx0XHRjb25zdCBhc2tRdWVzdGlvbnNUb29sID0gd2FpdGluZ1Rvb2woQXNrUXVlc3Rpb25zVG9vbElkKTtcblx0XHRjb25zdCBvbGRlclF1ZXN0aW9ubmFpcmUgPSBuZXcgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhKFt7XG5cdFx0XHRpZDogJ29sZGVyLXJlZ2lvbicsXG5cdFx0XHR0eXBlOiAnc2luZ2xlU2VsZWN0Jyxcblx0XHRcdHRpdGxlOiAnT2xkZXIgcmVnaW9uJyxcblx0XHRcdG1lc3NhZ2U6ICdXaGljaCBvbGRlciByZWdpb24/Jyxcblx0XHRcdG9wdGlvbnM6IFt7IGlkOiAnZWFzdCcsIGxhYmVsOiAnRWFzdCBVUycsIHZhbHVlOiAnZWFzdHVzJyB9XSxcblx0XHR9XSwgdHJ1ZSk7XG5cdFx0Y29uc3QgYXNrUXVlc3Rpb25zUGVuZGluZyA9IHBlbmRpbmdGb3IoVVJJLnBhcnNlKCdjaGF0LXNlc3Npb246L2Fzay1yb3V0ZScpLCAncmVxdWVzdC1hc2stcm91dGUnLCBbb2xkZXJRdWVzdGlvbm5haXJlLCBhc2tRdWVzdGlvbnNUb29sXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHF1ZXN0aW9ubmFpcmU6IHtcblx0XHRcdFx0dHlwZTogcXVlc3Rpb25uYWlyZVBlbmRpbmc/LnR5cGUsXG5cdFx0XHRcdGlkTWF0Y2hlczogcXVlc3Rpb25uYWlyZVBlbmRpbmc/LnBlbmRpbmdfaWQgPT09IHBlZWtQZW5kaW5nSWQoJ3JlcXVlc3QtcXVlc3Rpb25uYWlyZS1yb3V0ZScsIHF1ZXN0aW9ubmFpcmUpLFxuXHRcdFx0fSxcblx0XHRcdHBsYW46IHtcblx0XHRcdFx0dHlwZTogcGxhblBlbmRpbmc/LnR5cGUsXG5cdFx0XHRcdGlkTWF0Y2hlczogcGxhblBlbmRpbmc/LnBlbmRpbmdfaWQgPT09IHBlZWtQZW5kaW5nSWQoJ3JlcXVlc3QtcGxhbi1yb3V0ZScsIG9sZGVyVG9vbCksXG5cdFx0XHR9LFxuXHRcdFx0cG9zdEFwcHJvdmFsOiB7XG5cdFx0XHRcdHR5cGU6IHBvc3RBcHByb3ZhbFBlbmRpbmc/LnR5cGUsXG5cdFx0XHRcdGlkTWF0Y2hlczogcG9zdEFwcHJvdmFsUGVuZGluZz8ucGVuZGluZ19pZCA9PT0gcGVla1BlbmRpbmdJZCgncmVxdWVzdC1wb3N0LXJvdXRlJywgcG9zdEFwcHJvdmFsVG9vbCksXG5cdFx0XHR9LFxuXHRcdFx0YXNrUXVlc3Rpb25zQmVmb3JlQ2Fyb3VzZWw6IHtcblx0XHRcdFx0dHlwZTogYXNrUXVlc3Rpb25zUGVuZGluZz8udHlwZSxcblx0XHRcdFx0aWRNYXRjaGVzOiBhc2tRdWVzdGlvbnNQZW5kaW5nPy5wZW5kaW5nX2lkID09PSBwZWVrUGVuZGluZ0lkKCdyZXF1ZXN0LWFzay1yb3V0ZScsIG9sZGVyUXVlc3Rpb25uYWlyZSksXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdHF1ZXN0aW9ubmFpcmU6IHsgdHlwZTogJ3F1ZXN0aW9ucycsIGlkTWF0Y2hlczogdHJ1ZSB9LFxuXHRcdFx0cGxhbjogeyB0eXBlOiAnYXBwcm92YWwnLCBpZE1hdGNoZXM6IHRydWUgfSxcblx0XHRcdHBvc3RBcHByb3ZhbDogeyB0eXBlOiAnYXBwcm92YWwnLCBpZE1hdGNoZXM6IHRydWUgfSxcblx0XHRcdGFza1F1ZXN0aW9uc0JlZm9yZUNhcm91c2VsOiB7IHR5cGU6ICdxdWVzdGlvbnMnLCBpZE1hdGNoZXM6IHRydWUgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmx1c2hlcyBleGFjdCB0eXBlZCBjb250ZXh0IGJlZm9yZSBmcmVzaCBhbmQgY2hhbmdlZCBjb25maXJtYXRpb24gbmFycmF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNjZW5hcmlvczoge1xuXHRcdFx0bmFtZTogc3RyaW5nO1xuXHRcdFx0cGFydDogSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudDtcblx0XHRcdGZyb21TdGF0ZTogc3RyaW5nO1xuXHRcdFx0ZnJvbURldGFpbDogc3RyaW5nO1xuXHRcdFx0ZnJvbVR5cGU/OiBWb2ljZUNvbmZpcm1hdGlvblR5cGU7XG5cdFx0XHRleHBlY3RlZFR5cGU6IFZvaWNlQ29uZmlybWF0aW9uVHlwZTtcblx0XHRcdGV4cGVjdGVkRGV0YWlsOiBzdHJpbmc7XG5cdFx0fVtdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogJ2ZyZXNoLWdlbmVyaWMnLFxuXHRcdFx0XHRcdHBhcnQ6IHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdjb25maXJtYXRpb24nLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICdJbnN0YWxsIGV4dGVuc2lvbnM/Jyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6ICdSZXZpZXcgdGhlIHZpc2libGUgZXh0ZW5zaW9uIGFwcHJvdmFsLicsXG5cdFx0XHRcdFx0XHRkYXRhOiB7fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGZyb21TdGF0ZTogJ3RoaW5raW5nJyxcblx0XHRcdFx0XHRmcm9tRGV0YWlsOiAnJyxcblx0XHRcdFx0XHRleHBlY3RlZFR5cGU6ICdnZW5lcmljJyxcblx0XHRcdFx0XHRleHBlY3RlZERldGFpbDogW1xuXHRcdFx0XHRcdFx0J2NvbmZpcm1hdGlvbjogSW5zdGFsbCBleHRlbnNpb25zPycsXG5cdFx0XHRcdFx0XHQnUmV2aWV3IHRoZSB2aXNpYmxlIGV4dGVuc2lvbiBhcHByb3ZhbC4nLFxuXHRcdFx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRuYW1lOiAncGxhbi10by1nZW5lcmljJyxcblx0XHRcdFx0XHRwYXJ0OiB7XG5cdFx0XHRcdFx0XHRraW5kOiAnY29uZmlybWF0aW9uJyxcblx0XHRcdFx0XHRcdHRpdGxlOiAnQ29uZmlybSB0aGUgcmV2aXNlZCBwbGFuPycsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiAnUmV2aWV3IHRoZSByZXZpc2VkIHBsYW4gY29uZmlybWF0aW9uLicsXG5cdFx0XHRcdFx0XHRkYXRhOiB7fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGZyb21TdGF0ZTogJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdFx0ZnJvbURldGFpbDogW1xuXHRcdFx0XHRcdFx0J3BsYW4gYXBwcm92YWw6IFJldmlldyB0aGUgaW1wbGVtZW50YXRpb24gcGxhbicsXG5cdFx0XHRcdFx0XHQnY2hvaWNlczogSW1wbGVtZW50IFBsYW4nLFxuXHRcdFx0XHRcdFx0J1RoZSBwbGFuIGlzIG9wZW4gaW4gR2l0SHViIENvcGlsb3QuJyxcblx0XHRcdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0XHRcdGZyb21UeXBlOiAncGxhbicsXG5cdFx0XHRcdFx0ZXhwZWN0ZWRUeXBlOiAnZ2VuZXJpYycsXG5cdFx0XHRcdFx0ZXhwZWN0ZWREZXRhaWw6IFtcblx0XHRcdFx0XHRcdCdjb25maXJtYXRpb246IENvbmZpcm0gdGhlIHJldmlzZWQgcGxhbj8nLFxuXHRcdFx0XHRcdFx0J1JldmlldyB0aGUgcmV2aXNlZCBwbGFuIGNvbmZpcm1hdGlvbi4nLFxuXHRcdFx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRuYW1lOiAnZGV0YWlsLWNoYW5nZScsXG5cdFx0XHRcdFx0cGFydDoge1xuXHRcdFx0XHRcdFx0a2luZDogJ2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdFx0XHR0aXRsZTogJ0FwcHJvdmUgdGhlIHVwZGF0ZWQgZXh0ZW5zaW9uIHNldD8nLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogJ1JldmlldyB0aGUgdXBkYXRlZCB2aXNpYmxlIGV4dGVuc2lvbiBhcHByb3ZhbC4nLFxuXHRcdFx0XHRcdFx0ZGF0YToge30sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRmcm9tU3RhdGU6ICd3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24nLFxuXHRcdFx0XHRcdGZyb21EZXRhaWw6ICdjb25maXJtYXRpb246IEFwcHJvdmUgdGhlIG9sZCBleHRlbnNpb24gc2V0PycsXG5cdFx0XHRcdFx0ZnJvbVR5cGU6ICdnZW5lcmljJyxcblx0XHRcdFx0XHRleHBlY3RlZFR5cGU6ICdnZW5lcmljJyxcblx0XHRcdFx0XHRleHBlY3RlZERldGFpbDogW1xuXHRcdFx0XHRcdFx0J2NvbmZpcm1hdGlvbjogQXBwcm92ZSB0aGUgdXBkYXRlZCBleHRlbnNpb24gc2V0PycsXG5cdFx0XHRcdFx0XHQnUmV2aWV3IHRoZSB1cGRhdGVkIHZpc2libGUgZXh0ZW5zaW9uIGFwcHJvdmFsLicsXG5cdFx0XHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cdFx0Y29uc3QgcmVzdWx0czoge1xuXHRcdFx0bmFtZTogc3RyaW5nO1xuXHRcdFx0Y29udGV4dEJlZm9yZVJlcXVlc3Q6IGJvb2xlYW47XG5cdFx0XHRjb250ZXh0U2Vzc2lvbjogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ7XG5cdFx0XHRyZXF1ZXN0OiB7IGtpbmQ6IFZvaWNlTmFycmF0aW9uS2luZDsgdGV4dDogc3RyaW5nOyBjb25maXJtYXRpb25UeXBlPzogVm9pY2VDb25maXJtYXRpb25UeXBlIH0gfCB1bmRlZmluZWQ7XG5cdFx0fVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHNjZW5hcmlvIG9mIHNjZW5hcmlvcykge1xuXHRcdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGNoYXRTZXJ2aWNlID0gbmV3IENvbnRyb2xsYWJsZUNoYXRTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjaGF0U2VydmljZSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoYGNoYXQtc2Vzc2lvbjovJHtzY2VuYXJpby5uYW1lfWApO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBwZW5kaW5nUmVzcG9uc2VQYXJ0TW9kZWwoc2Vzc2lvblJlc291cmNlLCBzY2VuYXJpby5wYXJ0KTtcblx0XHRcdGNvbnN0IGdldEFnZW50U3RhdGVJbmZvID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19nZXRBZ2VudFN0YXRlSW5mbycpIGFzIChtb2RlbDogSUNoYXRNb2RlbCkgPT4ge1xuXHRcdFx0XHRzdGF0ZTogc3RyaW5nO1xuXHRcdFx0XHRkZXRhaWw/OiBzdHJpbmc7XG5cdFx0XHRcdGNvbmZpcm1hdGlvbl90eXBlPzogVm9pY2VDb25maXJtYXRpb25UeXBlO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHBlbmRpbmdDaGFuZ2VzID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19wZW5kaW5nU3RhdGVDaGFuZ2VzJykgYXMgTWFwPHN0cmluZywge1xuXHRcdFx0XHRzZXNzaW9uSWQ6IHN0cmluZztcblx0XHRcdFx0Y3VycmVudFN0YXRlOiBzdHJpbmc7XG5cdFx0XHRcdGxhYmVsOiBzdHJpbmc7XG5cdFx0XHRcdGRldGFpbD86IHN0cmluZztcblx0XHRcdFx0Y29uZmlybWF0aW9uVHlwZT86IFZvaWNlQ29uZmlybWF0aW9uVHlwZTtcblx0XHRcdFx0ZnJvbVN0YXRlOiBzdHJpbmc7XG5cdFx0XHRcdGZyb21EZXRhaWw6IHN0cmluZztcblx0XHRcdFx0ZnJvbUNvbmZpcm1hdGlvblR5cGU/OiBWb2ljZUNvbmZpcm1hdGlvblR5cGU7XG5cdFx0XHRcdGZyb21SZXNwb25zZVN1bW1hcnk6IHN0cmluZztcblx0XHRcdFx0cGVuZGluZ0lkOiBzdHJpbmc7XG5cdFx0XHRcdGZyb21QZW5kaW5nSWQ6IHN0cmluZztcblx0XHRcdH0+O1xuXHRcdFx0Y29uc3QgZW1pdFBlbmRpbmdTdGF0ZUNoYW5nZXMgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2VtaXRQZW5kaW5nU3RhdGVDaGFuZ2VzJykgYXMgKCkgPT4gdm9pZDtcblx0XHRcdGNvbnN0IHBlbmRpbmdJZEZvciA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfcGVuZGluZ0lkRm9yJykgYXMgKHNlc3Npb25JZDogc3RyaW5nKSA9PiBzdHJpbmc7XG5cblx0XHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRjaGF0U2VydmljZS5zZXRNb2RlbHMoW21vZGVsXSk7XG5cdFx0XHR2b2ljZUNsaWVudFNlcnZpY2Uud2lyZUV2ZW50cy5sZW5ndGggPSAwO1xuXHRcdFx0Y29uc3Qgc3RhdGVJbmZvID0gZ2V0QWdlbnRTdGF0ZUluZm8uY2FsbChjb250cm9sbGVyLCBtb2RlbCk7XG5cdFx0XHRwZW5kaW5nQ2hhbmdlcy5zZXQoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0c2Vzc2lvbklkOiBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0Y3VycmVudFN0YXRlOiBzdGF0ZUluZm8uc3RhdGUsXG5cdFx0XHRcdGxhYmVsOiAnQ2hhdCcsXG5cdFx0XHRcdGRldGFpbDogc3RhdGVJbmZvLmRldGFpbCxcblx0XHRcdFx0Y29uZmlybWF0aW9uVHlwZTogc3RhdGVJbmZvLmNvbmZpcm1hdGlvbl90eXBlLFxuXHRcdFx0XHRmcm9tU3RhdGU6IHNjZW5hcmlvLmZyb21TdGF0ZSxcblx0XHRcdFx0ZnJvbURldGFpbDogc2NlbmFyaW8uZnJvbURldGFpbCxcblx0XHRcdFx0ZnJvbUNvbmZpcm1hdGlvblR5cGU6IHNjZW5hcmlvLmZyb21UeXBlLFxuXHRcdFx0XHRmcm9tUmVzcG9uc2VTdW1tYXJ5OiAnJyxcblx0XHRcdFx0cGVuZGluZ0lkOiBwZW5kaW5nSWRGb3IuY2FsbChjb250cm9sbGVyLCBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0XHRcdGZyb21QZW5kaW5nSWQ6ICcnLFxuXHRcdFx0fSk7XG5cdFx0XHRlbWl0UGVuZGluZ1N0YXRlQ2hhbmdlcy5jYWxsKGNvbnRyb2xsZXIpO1xuXG5cdFx0XHRjb25zdCByZXF1ZXN0SW5kZXggPSB2b2ljZUNsaWVudFNlcnZpY2Uud2lyZUV2ZW50cy5maW5kSW5kZXgoZXZlbnQgPT4gZXZlbnQudHlwZSA9PT0gJ3JlcXVlc3RfbmFycmF0aW9uJyk7XG5cdFx0XHRjb25zdCBjb250ZXh0RXZlbnRzID0gdm9pY2VDbGllbnRTZXJ2aWNlLndpcmVFdmVudHMuc2xpY2UoMCwgcmVxdWVzdEluZGV4KS5maWx0ZXIoZXZlbnQgPT4gZXZlbnQudHlwZSA9PT0gJ3Nlc3Npb25fY29udGV4dCcpO1xuXHRcdFx0Y29uc3QgY29udGV4dFNlc3Npb24gPSBjb250ZXh0RXZlbnRzLmF0KC0xKT8uY29udGV4dC5zZXNzaW9ucy5maW5kKHNlc3Npb24gPT4gc2Vzc2lvbi5pZCA9PT0gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IHZvaWNlQ2xpZW50U2VydmljZS53aXJlRXZlbnRzW3JlcXVlc3RJbmRleF07XG5cdFx0XHRyZXN1bHRzLnB1c2goe1xuXHRcdFx0XHRuYW1lOiBzY2VuYXJpby5uYW1lLFxuXHRcdFx0XHRjb250ZXh0QmVmb3JlUmVxdWVzdDogcmVxdWVzdEluZGV4ID4gMCAmJiBjb250ZXh0RXZlbnRzLmxlbmd0aCA+IDAsXG5cdFx0XHRcdGNvbnRleHRTZXNzaW9uLFxuXHRcdFx0XHRyZXF1ZXN0OiByZXF1ZXN0Py50eXBlID09PSAncmVxdWVzdF9uYXJyYXRpb24nID8gcmVxdWVzdCA6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0cy5tYXAocmVzdWx0ID0+ICh7XG5cdFx0XHRuYW1lOiByZXN1bHQubmFtZSxcblx0XHRcdGNvbnRleHRCZWZvcmVSZXF1ZXN0OiByZXN1bHQuY29udGV4dEJlZm9yZVJlcXVlc3QsXG5cdFx0XHRjb250ZXh0U3RhdGU6IHJlc3VsdC5jb250ZXh0U2Vzc2lvbj8uWydhZ2VudF9zdGF0ZSddLFxuXHRcdFx0Y29udGV4dERldGFpbDogcmVzdWx0LmNvbnRleHRTZXNzaW9uPy5bJ2FnZW50X3N0YXRlX2RldGFpbCddLFxuXHRcdFx0Y29udGV4dFR5cGU6IHJlc3VsdC5jb250ZXh0U2Vzc2lvbj8uWydjb25maXJtYXRpb25fdHlwZSddLFxuXHRcdFx0cmVxdWVzdDogcmVzdWx0LnJlcXVlc3QsXG5cdFx0fSkpLCBzY2VuYXJpb3MubWFwKHNjZW5hcmlvID0+ICh7XG5cdFx0XHRuYW1lOiBzY2VuYXJpby5uYW1lLFxuXHRcdFx0Y29udGV4dEJlZm9yZVJlcXVlc3Q6IHRydWUsXG5cdFx0XHRjb250ZXh0U3RhdGU6ICd3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24nLFxuXHRcdFx0Y29udGV4dERldGFpbDogc2NlbmFyaW8uZXhwZWN0ZWREZXRhaWwsXG5cdFx0XHRjb250ZXh0VHlwZTogc2NlbmFyaW8uZXhwZWN0ZWRUeXBlLFxuXHRcdFx0cmVxdWVzdDoge1xuXHRcdFx0XHR0eXBlOiAncmVxdWVzdF9uYXJyYXRpb24nLFxuXHRcdFx0XHRraW5kOiAnY29uZmlybWF0aW9uJyxcblx0XHRcdFx0dGV4dDogc2NlbmFyaW8uZXhwZWN0ZWREZXRhaWwsXG5cdFx0XHRcdGNvbmZpcm1hdGlvblR5cGU6IHNjZW5hcmlvLmV4cGVjdGVkVHlwZSxcblx0XHRcdH0sXG5cdFx0fSkpKTtcblx0fSk7XG5cblx0dGVzdCgnc2FtZSBjb25maXJtYXRpb24gdGV4dCB3aXRoIGEgbmV3IHR5cGUgaXMgbm90IGRlZHVwbGljYXRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHZvaWNlQ2xpZW50U2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ2NoYXQtc2Vzc2lvbjovdHlwZWQtY29uZmlybWF0aW9uLWRlZHVwJztcblx0XHRjb25zdCBuYXJyYXRlID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19uYXJyYXRlJykgYXMgKFxuXHRcdFx0c2Vzc2lvbklkOiBzdHJpbmcsXG5cdFx0XHRraW5kOiBWb2ljZU5hcnJhdGlvbktpbmQsXG5cdFx0XHR0ZXh0OiBzdHJpbmcsXG5cdFx0XHRyZXVzZUlkPzogc3RyaW5nLFxuXHRcdFx0Y2hlY2twb2ludD86IElWb2ljZUNoZWNrcG9pbnROYXJyYXRpb25NZXRhZGF0YSxcblx0XHRcdGNvbmZpcm1hdGlvblR5cGU/OiBWb2ljZUNvbmZpcm1hdGlvblR5cGUsXG5cdFx0KSA9PiBib29sZWFuO1xuXHRcdGF3YWl0IGNvbnRyb2xsZXIuY29ubmVjdChtYWluV2luZG93KTtcblxuXHRcdGNvbnN0IHF1ZXN0aW9ubmFpcmVTZW50ID0gbmFycmF0ZS5jYWxsKGNvbnRyb2xsZXIsIHNlc3Npb25JZCwgJ2NvbmZpcm1hdGlvbicsICdJIG5lZWQgeW91ciBpbnB1dC4nLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ3F1ZXN0aW9ubmFpcmUnKTtcblx0XHRjb25zdCBkdXBsaWNhdGVRdWVzdGlvbm5haXJlU2VudCA9IG5hcnJhdGUuY2FsbChjb250cm9sbGVyLCBzZXNzaW9uSWQsICdjb25maXJtYXRpb24nLCAnSSBuZWVkIHlvdXIgaW5wdXQuJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsICdxdWVzdGlvbm5haXJlJyk7XG5cdFx0Y29uc3QgcGxhblNlbnQgPSBuYXJyYXRlLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvbklkLCAnY29uZmlybWF0aW9uJywgJ0kgbmVlZCB5b3VyIGlucHV0LicsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAncGxhbicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRxdWVzdGlvbm5haXJlU2VudCxcblx0XHRcdGR1cGxpY2F0ZVF1ZXN0aW9ubmFpcmVTZW50LFxuXHRcdFx0cGxhblNlbnQsXG5cdFx0XHR0eXBlczogdm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzLm1hcChyZXF1ZXN0ID0+IHJlcXVlc3QuY29uZmlybWF0aW9uVHlwZSksXG5cdFx0fSwge1xuXHRcdFx0cXVlc3Rpb25uYWlyZVNlbnQ6IHRydWUsXG5cdFx0XHRkdXBsaWNhdGVRdWVzdGlvbm5haXJlU2VudDogZmFsc2UsXG5cdFx0XHRwbGFuU2VudDogdHJ1ZSxcblx0XHRcdHR5cGVzOiBbJ3F1ZXN0aW9ubmFpcmUnLCAncGxhbiddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvbm5lY3QgcmVwbGF5cyBvbmx5IGNvbmZpcm1hdGlvbnMgbWF0Y2hpbmcgY3VycmVudCB0ZXh0IGFuZCB0eXBlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhc2VzOiB7XG5cdFx0XHRuYW1lOiBzdHJpbmc7XG5cdFx0XHRwZW5kaW5nOiB7IGtpbmQ6ICdyZXNwb25zZScgfCAnY29uZmlybWF0aW9uJzsgdGV4dDogc3RyaW5nOyBjb25maXJtYXRpb25UeXBlPzogVm9pY2VDb25maXJtYXRpb25UeXBlIH07XG5cdFx0XHRjdXJyZW50OiB7IGtpbmQ6ICdyZXNwb25zZScgfCAnY29uZmlybWF0aW9uJzsgdGV4dDogc3RyaW5nOyBjb25maXJtYXRpb25UeXBlPzogVm9pY2VDb25maXJtYXRpb25UeXBlIH0gfCB1bmRlZmluZWQ7XG5cdFx0fVtdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogJ2dlbmVyaWMtdG8tcGxhbicsXG5cdFx0XHRcdFx0cGVuZGluZzogeyBraW5kOiAnY29uZmlybWF0aW9uJywgdGV4dDogJ1JldmlldyB0aGlzIGl0ZW0uJywgY29uZmlybWF0aW9uVHlwZTogJ2dlbmVyaWMnIH0sXG5cdFx0XHRcdFx0Y3VycmVudDogeyBraW5kOiAnY29uZmlybWF0aW9uJywgdGV4dDogJ1JldmlldyB0aGlzIGl0ZW0uJywgY29uZmlybWF0aW9uVHlwZTogJ3BsYW4nIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRuYW1lOiAnZ2VuZXJpYy10by1pZGxlJyxcblx0XHRcdFx0XHRwZW5kaW5nOiB7IGtpbmQ6ICdjb25maXJtYXRpb24nLCB0ZXh0OiAnUmV2aWV3IHRoaXMgaXRlbS4nLCBjb25maXJtYXRpb25UeXBlOiAnZ2VuZXJpYycgfSxcblx0XHRcdFx0XHRjdXJyZW50OiB7IGtpbmQ6ICdyZXNwb25zZScsIHRleHQ6ICdEb25lLicgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG5hbWU6ICdsZWdhY3ktdG8tZ2VuZXJpYycsXG5cdFx0XHRcdFx0cGVuZGluZzogeyBraW5kOiAnY29uZmlybWF0aW9uJywgdGV4dDogJ1JldmlldyB0aGlzIGl0ZW0uJyB9LFxuXHRcdFx0XHRcdGN1cnJlbnQ6IHsga2luZDogJ2NvbmZpcm1hdGlvbicsIHRleHQ6ICdSZXZpZXcgdGhpcyBpdGVtLicsIGNvbmZpcm1hdGlvblR5cGU6ICdnZW5lcmljJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogJ21hdGNoaW5nLWdlbmVyaWMnLFxuXHRcdFx0XHRcdHBlbmRpbmc6IHsga2luZDogJ2NvbmZpcm1hdGlvbicsIHRleHQ6ICdSZXZpZXcgdGhpcyBpdGVtLicsIGNvbmZpcm1hdGlvblR5cGU6ICdnZW5lcmljJyB9LFxuXHRcdFx0XHRcdGN1cnJlbnQ6IHsga2luZDogJ2NvbmZpcm1hdGlvbicsIHRleHQ6ICdSZXZpZXcgdGhpcyBpdGVtLicsIGNvbmZpcm1hdGlvblR5cGU6ICdnZW5lcmljJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogJ21hdGNoaW5nLWxlZ2FjeScsXG5cdFx0XHRcdFx0cGVuZGluZzogeyBraW5kOiAnY29uZmlybWF0aW9uJywgdGV4dDogJ0xlZ2FjeSBjb25maXJtYXRpb24uJyB9LFxuXHRcdFx0XHRcdGN1cnJlbnQ6IHsga2luZDogJ2NvbmZpcm1hdGlvbicsIHRleHQ6ICdMZWdhY3kgY29uZmlybWF0aW9uLicgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG5hbWU6ICdyZXNwb25zZS1jb25mbGljdHMtd2l0aC1nZW5lcmljJyxcblx0XHRcdFx0XHRwZW5kaW5nOiB7IGtpbmQ6ICdyZXNwb25zZScsIHRleHQ6ICdPbGQgZmluYWwgcmVzcG9uc2UuJyB9LFxuXHRcdFx0XHRcdGN1cnJlbnQ6IHsga2luZDogJ2NvbmZpcm1hdGlvbicsIHRleHQ6ICdDdXJyZW50IGNvbmZpcm1hdGlvbi4nLCBjb25maXJtYXRpb25UeXBlOiAnZ2VuZXJpYycgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG5hbWU6ICdyZXNwb25zZS1zdW1tYXJ5LWNoYW5nZWQnLFxuXHRcdFx0XHRcdHBlbmRpbmc6IHsga2luZDogJ3Jlc3BvbnNlJywgdGV4dDogJ09sZCBmaW5hbCByZXNwb25zZS4nIH0sXG5cdFx0XHRcdFx0Y3VycmVudDogeyBraW5kOiAncmVzcG9uc2UnLCB0ZXh0OiAnTmV3IGZpbmFsIHJlc3BvbnNlLicgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG5hbWU6ICdtYXRjaGluZy1yZXNwb25zZScsXG5cdFx0XHRcdFx0cGVuZGluZzogeyBraW5kOiAncmVzcG9uc2UnLCB0ZXh0OiAnRmluYWwgcmVzcG9uc2UuJyB9LFxuXHRcdFx0XHRcdGN1cnJlbnQ6IHsga2luZDogJ3Jlc3BvbnNlJywgdGV4dDogJ0ZpbmFsIHJlc3BvbnNlLicgfSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cdFx0Y29uc3QgcmVzdWx0czogeyBuYW1lOiBzdHJpbmc7IHJlcXVlc3RzOiB7IGtpbmQ6IFZvaWNlTmFycmF0aW9uS2luZDsgdGV4dDogc3RyaW5nOyBjb25maXJtYXRpb25UeXBlPzogVm9pY2VDb25maXJtYXRpb25UeXBlIH1bXSB9W10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgdGVzdENhc2Ugb2YgY2FzZXMpIHtcblx0XHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gYGNoYXQtc2Vzc2lvbjovJHt0ZXN0Q2FzZS5uYW1lfWA7XG5cdFx0XHRhd2FpdCBjb250cm9sbGVyLmNvbm5lY3QobWFpbldpbmRvdyk7XG5cdFx0XHRjb25zdCByZXRyaWVzID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19wZW5kaW5nTmFycmF0aW9uUmV0cmllcycpIGFzIE1hcDxzdHJpbmcsIHR5cGVvZiB0ZXN0Q2FzZS5wZW5kaW5nPjtcblx0XHRcdHJldHJpZXMuc2V0KHNlc3Npb25JZCwgdGVzdENhc2UucGVuZGluZyk7XG5cdFx0XHRSZWZsZWN0LnNldChjb250cm9sbGVyLCAnX2N1cnJlbnROYXJyYXRhYmxlJywgKCkgPT4gdGVzdENhc2UuY3VycmVudCk7XG5cdFx0XHRjb250cm9sbGVyLnNldEFjdGl2ZVNlc3Npb25TaG93bihVUkkucGFyc2Uoc2Vzc2lvbklkKSk7XG5cblx0XHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlU2Vzc2lvbkluaXQoKTtcblx0XHRcdHJlc3VsdHMucHVzaCh7XG5cdFx0XHRcdG5hbWU6IHRlc3RDYXNlLm5hbWUsXG5cdFx0XHRcdHJlcXVlc3RzOiB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHMubWFwKHJlcXVlc3QgPT4gKHtcblx0XHRcdFx0XHRraW5kOiByZXF1ZXN0LmtpbmQsXG5cdFx0XHRcdFx0dGV4dDogcmVxdWVzdC50ZXh0LFxuXHRcdFx0XHRcdC4uLihyZXF1ZXN0LmNvbmZpcm1hdGlvblR5cGUgPyB7IGNvbmZpcm1hdGlvblR5cGU6IHJlcXVlc3QuY29uZmlybWF0aW9uVHlwZSB9IDoge30pLFxuXHRcdFx0XHR9KSksXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdHMsIFtcblx0XHRcdHsgbmFtZTogJ2dlbmVyaWMtdG8tcGxhbicsIHJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0eyBuYW1lOiAnZ2VuZXJpYy10by1pZGxlJywgcmVxdWVzdHM6IFtdIH0sXG5cdFx0XHR7IG5hbWU6ICdsZWdhY3ktdG8tZ2VuZXJpYycsIHJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0eyBuYW1lOiAnbWF0Y2hpbmctZ2VuZXJpYycsIHJlcXVlc3RzOiBbeyBraW5kOiAnY29uZmlybWF0aW9uJywgdGV4dDogJ1JldmlldyB0aGlzIGl0ZW0uJywgY29uZmlybWF0aW9uVHlwZTogJ2dlbmVyaWMnIH1dIH0sXG5cdFx0XHR7IG5hbWU6ICdtYXRjaGluZy1sZWdhY3knLCByZXF1ZXN0czogW3sga2luZDogJ2NvbmZpcm1hdGlvbicsIHRleHQ6ICdMZWdhY3kgY29uZmlybWF0aW9uLicgfV0gfSxcblx0XHRcdHsgbmFtZTogJ3Jlc3BvbnNlLWNvbmZsaWN0cy13aXRoLWdlbmVyaWMnLCByZXF1ZXN0czogW10gfSxcblx0XHRcdHsgbmFtZTogJ3Jlc3BvbnNlLXN1bW1hcnktY2hhbmdlZCcsIHJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0eyBuYW1lOiAnbWF0Y2hpbmctcmVzcG9uc2UnLCByZXF1ZXN0czogW3sga2luZDogJ3Jlc3BvbnNlJywgdGV4dDogJ0ZpbmFsIHJlc3BvbnNlLicgfV0gfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYnVzeSBjb25maXJtYXRpb24gcmV0cmllcyBvbmx5IHdoZW4gY3VycmVudCB0ZXh0IGFuZCB0eXBlIHN0aWxsIG1hdGNoJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSAnY2hhdC1zZXNzaW9uOi9kZWZlcnJlZC1jb25maXJtYXRpb24nO1xuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSAoUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19zZXNzaW9uS2V5JykgYXMgKHNlc3Npb25JZDogc3RyaW5nKSA9PiBzdHJpbmcpLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvbklkKTtcblx0XHRjb25zdCBkZWZlcnJlZCA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfZGVmZXJyZWROYXJyYXRpb25zJykgYXMgTWFwPHN0cmluZywge1xuXHRcdFx0bmFycmF0aW9uSWQ6IHN0cmluZztcblx0XHRcdGtpbmQ6ICdjb25maXJtYXRpb24nO1xuXHRcdFx0dGV4dDogc3RyaW5nO1xuXHRcdFx0cmV1c2VOYXJyYXRpb25JZDogYm9vbGVhbjtcblx0XHRcdGNvbmZpcm1hdGlvblR5cGU/OiBWb2ljZUNvbmZpcm1hdGlvblR5cGU7XG5cdFx0fT47XG5cdFx0Y29uc3QgcmV0cnkgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3JldHJ5RGVmZXJyZWROYXJyYXRpb24nKSBhcyAoc2Vzc2lvbktleTogc3RyaW5nKSA9PiBib29sZWFuO1xuXHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKFVSSS5wYXJzZShzZXNzaW9uSWQpKTtcblxuXHRcdGRlZmVycmVkLnNldChzZXNzaW9uS2V5LCB7XG5cdFx0XHRuYXJyYXRpb25JZDogJ3N0YWxlLXR5cGUnLFxuXHRcdFx0a2luZDogJ2NvbmZpcm1hdGlvbicsXG5cdFx0XHR0ZXh0OiAnUmV2aWV3IHRoaXMgaXRlbS4nLFxuXHRcdFx0cmV1c2VOYXJyYXRpb25JZDogdHJ1ZSxcblx0XHRcdGNvbmZpcm1hdGlvblR5cGU6ICdnZW5lcmljJyxcblx0XHR9KTtcblx0XHRSZWZsZWN0LnNldChjb250cm9sbGVyLCAnX2N1cnJlbnROYXJyYXRhYmxlJywgKCkgPT4gKHsga2luZDogJ2NvbmZpcm1hdGlvbicsIHRleHQ6ICdSZXZpZXcgdGhpcyBpdGVtLicsIGNvbmZpcm1hdGlvblR5cGU6ICdwbGFuJyB9KSk7XG5cdFx0Y29uc3Qgc3RhbGVUeXBlUmV0cmllZCA9IHJldHJ5LmNhbGwoY29udHJvbGxlciwgc2Vzc2lvbktleSk7XG5cblx0XHRkZWZlcnJlZC5zZXQoc2Vzc2lvbktleSwge1xuXHRcdFx0bmFycmF0aW9uSWQ6ICdzdGFsZS10ZXh0Jyxcblx0XHRcdGtpbmQ6ICdjb25maXJtYXRpb24nLFxuXHRcdFx0dGV4dDogJ09sZCBkZXRhaWwuJyxcblx0XHRcdHJldXNlTmFycmF0aW9uSWQ6IHRydWUsXG5cdFx0XHRjb25maXJtYXRpb25UeXBlOiAnZ2VuZXJpYycsXG5cdFx0fSk7XG5cdFx0UmVmbGVjdC5zZXQoY29udHJvbGxlciwgJ19jdXJyZW50TmFycmF0YWJsZScsICgpID0+ICh7IGtpbmQ6ICdjb25maXJtYXRpb24nLCB0ZXh0OiAnTmV3IGRldGFpbC4nLCBjb25maXJtYXRpb25UeXBlOiAnZ2VuZXJpYycgfSkpO1xuXHRcdGNvbnN0IHN0YWxlVGV4dFJldHJpZWQgPSByZXRyeS5jYWxsKGNvbnRyb2xsZXIsIHNlc3Npb25LZXkpO1xuXG5cdFx0ZGVmZXJyZWQuc2V0KHNlc3Npb25LZXksIHtcblx0XHRcdG5hcnJhdGlvbklkOiAnbWF0Y2hpbmcnLFxuXHRcdFx0a2luZDogJ2NvbmZpcm1hdGlvbicsXG5cdFx0XHR0ZXh0OiAnQ3VycmVudCBkZXRhaWwuJyxcblx0XHRcdHJldXNlTmFycmF0aW9uSWQ6IHRydWUsXG5cdFx0XHRjb25maXJtYXRpb25UeXBlOiAnZ2VuZXJpYycsXG5cdFx0fSk7XG5cdFx0UmVmbGVjdC5zZXQoY29udHJvbGxlciwgJ19jdXJyZW50TmFycmF0YWJsZScsICgpID0+ICh7IGtpbmQ6ICdjb25maXJtYXRpb24nLCB0ZXh0OiAnQ3VycmVudCBkZXRhaWwuJywgY29uZmlybWF0aW9uVHlwZTogJ2dlbmVyaWMnIH0pKTtcblx0XHRjb25zdCBtYXRjaGluZ1JldHJpZWQgPSByZXRyeS5jYWxsKGNvbnRyb2xsZXIsIHNlc3Npb25LZXkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGFsZVR5cGVSZXRyaWVkLFxuXHRcdFx0c3RhbGVUZXh0UmV0cmllZCxcblx0XHRcdG1hdGNoaW5nUmV0cmllZCxcblx0XHRcdHJlcXVlc3RzOiB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHMubWFwKHJlcXVlc3QgPT4gKHtcblx0XHRcdFx0bmFycmF0aW9uSWQ6IHJlcXVlc3QubmFycmF0aW9uSWQsXG5cdFx0XHRcdHRleHQ6IHJlcXVlc3QudGV4dCxcblx0XHRcdFx0Y29uZmlybWF0aW9uVHlwZTogcmVxdWVzdC5jb25maXJtYXRpb25UeXBlLFxuXHRcdFx0fSkpLFxuXHRcdFx0ZGVmZXJyZWRDb3VudDogZGVmZXJyZWQuc2l6ZSxcblx0XHR9LCB7XG5cdFx0XHRzdGFsZVR5cGVSZXRyaWVkOiBmYWxzZSxcblx0XHRcdHN0YWxlVGV4dFJldHJpZWQ6IGZhbHNlLFxuXHRcdFx0bWF0Y2hpbmdSZXRyaWVkOiB0cnVlLFxuXHRcdFx0cmVxdWVzdHM6IFt7XG5cdFx0XHRcdG5hcnJhdGlvbklkOiAnbWF0Y2hpbmcnLFxuXHRcdFx0XHR0ZXh0OiAnQ3VycmVudCBkZXRhaWwuJyxcblx0XHRcdFx0Y29uZmlybWF0aW9uVHlwZTogJ2dlbmVyaWMnLFxuXHRcdFx0fV0sXG5cdFx0XHRkZWZlcnJlZENvdW50OiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvLWFwcHJvdmUgaWdub3JlcyBxdWVzdGlvbm5haXJlIGJhY2tpbmcgdG9vbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIobmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY29uZmlybWVkOiBUb29sQ29uZmlybUtpbmRbXSA9IFtdO1xuXHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFRvb2xJbnZvY2F0aW9uPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGtpbmQgPSAndG9vbEludm9jYXRpb24nIGFzIGNvbnN0O1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT4oJ3Rvb2xTdGF0ZScsIHtcblx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbixcblx0XHRcdFx0cGFyYW1ldGVyczoge30sXG5cdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB7XG5cdFx0XHRcdFx0dGl0bGU6ICdTdWJtaXQgcXVlc3Rpb25uYWlyZT8nLFxuXHRcdFx0XHRcdG1lc3NhZ2U6ICdTdWJtaXRzIHRoZSBxdWVzdGlvbm5haXJlIGFuc3dlcnMuJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29uZmlybTogcmVhc29uID0+IGNvbmZpcm1lZC5wdXNoKHJlYXNvbi50eXBlKSxcblx0XHRcdH0pO1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaW52b2NhdGlvbk1lc3NhZ2UgPSAnU3VibWl0IHF1ZXN0aW9ubmFpcmUnO1xuXHRcdH0oKTtcblx0XHRjb25zdCBxdWVzdGlvbm5haXJlID0gbmV3IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YShbe1xuXHRcdFx0aWQ6ICdoaWRkZW4tcXVlc3Rpb24taWQnLFxuXHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHR0aXRsZTogJ0Nob29zZSBhbiBvcHRpb24nLFxuXHRcdFx0b3B0aW9uczogW3sgaWQ6ICdoaWRkZW4tb3B0aW9uLWlkJywgbGFiZWw6ICdWaXNpYmxlIG9wdGlvbicsIHZhbHVlOiAnaGlkZGVuLXZhbHVlJyB9XSxcblx0XHR9XSwgdHJ1ZSk7XG5cdFx0Y29uc3QgcGVuZGluZ0NvbmZpcm1hdGlvbiA9IG9ic2VydmFibGVWYWx1ZTx7IGRldGFpbD86IHN0cmluZyB9IHwgdW5kZWZpbmVkPigncGVuZGluZycsIHsgZGV0YWlsOiAnTmVlZHMgaW5wdXQnIH0pO1xuXHRcdGNvbnN0IG1vZGVsV2l0aFF1ZXN0aW9ubmFpcmUgPSB7XG5cdFx0XHRnZXRSZXF1ZXN0czogKCkgPT4gW3tcblx0XHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0XHRpc1BlbmRpbmdDb25maXJtYXRpb246IHBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0cmVzcG9uc2U6IHsgdmFsdWU6IFt0b29sSW52b2NhdGlvbiwgcXVlc3Rpb25uYWlyZV0gfSxcblx0XHRcdFx0fSxcblx0XHRcdH1dLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdE1vZGVsO1xuXHRcdGNvbnN0IG1vZGVsV2l0aFRvb2wgPSB7XG5cdFx0XHRnZXRSZXF1ZXN0czogKCkgPT4gW3tcblx0XHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0XHRpc1BlbmRpbmdDb25maXJtYXRpb246IHBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0cmVzcG9uc2U6IHsgdmFsdWU6IFt0b29sSW52b2NhdGlvbl0gfSxcblx0XHRcdFx0fSxcblx0XHRcdH1dLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdE1vZGVsO1xuXHRcdGNvbnN0IGF1dG9BcHByb3ZlUGVuZGluZ1Rvb2xzID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19hdXRvQXBwcm92ZVBlbmRpbmdUb29scycpIGFzIChtb2RlbDogSUNoYXRNb2RlbCkgPT4gdm9pZDtcblxuXHRcdGF1dG9BcHByb3ZlUGVuZGluZ1Rvb2xzLmNhbGwoY29udHJvbGxlciwgbW9kZWxXaXRoUXVlc3Rpb25uYWlyZSk7XG5cdFx0YXV0b0FwcHJvdmVQZW5kaW5nVG9vbHMuY2FsbChjb250cm9sbGVyLCBtb2RlbFdpdGhUb29sKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlybWVkLCBbVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb25dKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBmcmVlZm9ybSBhbmQgZGVmZXJzIGVtcHR5IHF1ZXN0aW9ubmFpcmUgZGF0YScsICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpKTtcblx0XHRjb25zdCBnZXRBZ2VudFN0YXRlSW5mbyA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfZ2V0QWdlbnRTdGF0ZUluZm8nKSBhcyAobW9kZWw6IElDaGF0TW9kZWwpID0+IHsgc3RhdGU6IHN0cmluZzsgZGV0YWlsPzogc3RyaW5nIH07XG5cdFx0Y29uc3QgZnJlZWZvcm0gPSBuZXcgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhKFt7XG5cdFx0XHRpZDogJ2ludGVybmFsX25hbWVfa2V5Jyxcblx0XHRcdHR5cGU6ICd0ZXh0Jyxcblx0XHRcdHRpdGxlOiAnaW50ZXJuYWxfbmFtZV9rZXknLFxuXHRcdFx0bWVzc2FnZTogJ1doYXQgc2hvdWxkIHdlIGNhbGwgdGhlIE1hcnMgZXhwbG9yZXI/Jyxcblx0XHR9XSwgZmFsc2UpO1xuXHRcdGNvbnN0IG1pc3NpbmcgPSBuZXcgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhKFtdLCB0cnVlLCAnaGlkZGVuX3Jlc29sdmVfaWQnKTtcblx0XHRjb25zdCBpbnRlcm5hbFRpdGxlT25seSA9IG5ldyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEoW3tcblx0XHRcdGlkOiAnaW50ZXJuYWxfcHJvbXB0X2tleScsXG5cdFx0XHR0eXBlOiAndGV4dCcsXG5cdFx0XHR0aXRsZTogJ2ludGVybmFsX3Byb21wdF9rZXknLFxuXHRcdH1dLCB0cnVlKTtcblx0XHRjb25zdCBub0N1c3RvbU9wdGlvbiA9IG5ldyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEoW3tcblx0XHRcdGlkOiAnbmF2aWdhdGlvbicsXG5cdFx0XHR0eXBlOiAnc2luZ2xlU2VsZWN0Jyxcblx0XHRcdHRpdGxlOiAnTmF2aWdhdGlvbicsXG5cdFx0XHRtZXNzYWdlOiAnQ2hvb3NlIGEgbmF2aWdhdGlvbiBtb2RlLicsXG5cdFx0XHRvcHRpb25zOiBbeyBpZDogJ2d1aWRlZCcsIGxhYmVsOiAnR3VpZGVkIHJvdXRlJywgdmFsdWU6ICdndWlkZWQnIH1dLFxuXHRcdFx0YWxsb3dGcmVlZm9ybUlucHV0OiBmYWxzZSxcblx0XHR9XSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGdldEFnZW50U3RhdGVJbmZvLmNhbGwoY29udHJvbGxlciwgcGVuZGluZ1Jlc3BvbnNlUGFydE1vZGVsKFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi9mcmVlZm9ybScpLCBmcmVlZm9ybSwgdW5kZWZpbmVkLCBmYWxzZSkpLFxuXHRcdFx0Z2V0QWdlbnRTdGF0ZUluZm8uY2FsbChjb250cm9sbGVyLCBwZW5kaW5nUmVzcG9uc2VQYXJ0TW9kZWwoVVJJLnBhcnNlKCdjaGF0LXNlc3Npb246L21pc3NpbmcnKSwgbWlzc2luZywgdW5kZWZpbmVkLCBmYWxzZSkpLFxuXHRcdFx0Z2V0QWdlbnRTdGF0ZUluZm8uY2FsbChjb250cm9sbGVyLCBwZW5kaW5nUmVzcG9uc2VQYXJ0TW9kZWwoVVJJLnBhcnNlKCdjaGF0LXNlc3Npb246L2ludGVybmFsLXRpdGxlJyksIGludGVybmFsVGl0bGVPbmx5LCB1bmRlZmluZWQsIGZhbHNlKSksXG5cdFx0XHRnZXRBZ2VudFN0YXRlSW5mby5jYWxsKGNvbnRyb2xsZXIsIHBlbmRpbmdSZXNwb25zZVBhcnRNb2RlbChVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovbm8tY3VzdG9tJyksIG5vQ3VzdG9tT3B0aW9uLCB1bmRlZmluZWQsIGZhbHNlKSksXG5cdFx0XSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRzdGF0ZTogJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbl90eXBlOiAncXVlc3Rpb25uYWlyZScsXG5cdFx0XHRcdGRldGFpbDogW1xuXHRcdFx0XHRcdCdxdWVzdGlvbm5haXJlOiAxIHF1ZXN0aW9uJyxcblx0XHRcdFx0XHQnMS4gV2hhdCBzaG91bGQgd2UgY2FsbCB0aGUgTWFycyBleHBsb3Jlcj8nLFxuXHRcdFx0XHRcdCdyZXNwb25zZTogZW50ZXIgYSBmcmVlLWZvcm0gYW5zd2VyIGluIEdpdEh1YiBDb3BpbG90Jyxcblx0XHRcdFx0XHQnVGhlIHF1ZXN0aW9ubmFpcmUgaXMgb3BlbiBpbiBHaXRIdWIgQ29waWxvdC4nLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0c3RhdGU6ICd3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24nLFxuXHRcdFx0XHRjb25maXJtYXRpb25fdHlwZTogJ3F1ZXN0aW9ubmFpcmUnXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRzdGF0ZTogJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbl90eXBlOiAncXVlc3Rpb25uYWlyZScsXG5cdFx0XHRcdGRldGFpbDogW1xuXHRcdFx0XHRcdCdxdWVzdGlvbm5haXJlOiAxIHF1ZXN0aW9uJyxcblx0XHRcdFx0XHQnMS4gSSBuZWVkIHlvdXIgaW5wdXQgaW4gdGhlIG9wZW4gcXVlc3Rpb25uYWlyZS4nLFxuXHRcdFx0XHRcdCdyZXNwb25zZTogZW50ZXIgYSBmcmVlLWZvcm0gYW5zd2VyIGluIEdpdEh1YiBDb3BpbG90Jyxcblx0XHRcdFx0XHQnVGhlIHF1ZXN0aW9ubmFpcmUgaXMgb3BlbiBpbiBHaXRIdWIgQ29waWxvdC4nLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0c3RhdGU6ICd3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24nLFxuXHRcdFx0XHRjb25maXJtYXRpb25fdHlwZTogJ3F1ZXN0aW9ubmFpcmUnLFxuXHRcdFx0XHRkZXRhaWw6IFtcblx0XHRcdFx0XHQncXVlc3Rpb25uYWlyZTogMSBxdWVzdGlvbicsXG5cdFx0XHRcdFx0JzEuIENob29zZSBhIG5hdmlnYXRpb24gbW9kZS4nLFxuXHRcdFx0XHRcdCdvcHRpb25zOiBHdWlkZWQgcm91dGUnLFxuXHRcdFx0XHRcdCdUaGUgcXVlc3Rpb25uYWlyZSBpcyBvcGVuIGluIEdpdEh1YiBDb3BpbG90LicsXG5cdFx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdib3VuZHMgcXVlc3Rpb25uYWlyZSBxdWVzdGlvbnMgYW5kIG9wdGlvbnMgd2l0aCBvbWlzc2lvbiBjb3VudHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIobmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZ2V0QWdlbnRTdGF0ZUluZm8gPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2dldEFnZW50U3RhdGVJbmZvJykgYXMgKG1vZGVsOiBJQ2hhdE1vZGVsKSA9PiB7IGRldGFpbD86IHN0cmluZyB9O1xuXHRcdGNvbnN0IGNhcm91c2VsID0gbmV3IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YShBcnJheS5mcm9tKHsgbGVuZ3RoOiA4IH0sIChfLCBxdWVzdGlvbkluZGV4KSA9PiAoe1xuXHRcdFx0aWQ6IGBpbnRlcm5hbF9xdWVzdGlvbl8ke3F1ZXN0aW9uSW5kZXh9YCxcblx0XHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnIGFzIGNvbnN0LFxuXHRcdFx0dGl0bGU6IGBJbnRlcm5hbCBxdWVzdGlvbiAke3F1ZXN0aW9uSW5kZXh9YCxcblx0XHRcdG1lc3NhZ2U6IGBWaXNpYmxlIHF1ZXN0aW9uICR7cXVlc3Rpb25JbmRleCArIDF9P2AsXG5cdFx0XHRvcHRpb25zOiBBcnJheS5mcm9tKHsgbGVuZ3RoOiA4IH0sIChfLCBvcHRpb25JbmRleCkgPT4gKHtcblx0XHRcdFx0aWQ6IGBpbnRlcm5hbF9vcHRpb25fJHtxdWVzdGlvbkluZGV4fV8ke29wdGlvbkluZGV4fWAsXG5cdFx0XHRcdGxhYmVsOiBgVmlzaWJsZSBvcHRpb24gJHtvcHRpb25JbmRleCArIDF9YCxcblx0XHRcdFx0dmFsdWU6IGBoaWRkZW5fdmFsdWVfJHtvcHRpb25JbmRleH1gLFxuXHRcdFx0fSkpLFxuXHRcdH0pKSwgdHJ1ZSk7XG5cdFx0Y29uc3QgZGV0YWlsID0gZ2V0QWdlbnRTdGF0ZUluZm8uY2FsbChjb250cm9sbGVyLCBwZW5kaW5nUmVzcG9uc2VQYXJ0TW9kZWwoVVJJLnBhcnNlKCdjaGF0LXNlc3Npb246L2JvdW5kZWQnKSwgY2Fyb3VzZWwpKS5kZXRhaWwgPz8gJyc7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdpdGhpbkxpbWl0OiBkZXRhaWwubGVuZ3RoIDw9IDJfNDAwLFxuXHRcdFx0aW5jbHVkZXNPcHRpb25PbWlzc2lvbjogZGV0YWlsLmluY2x1ZGVzKCczIG1vcmUgb3B0aW9ucycpLFxuXHRcdFx0aW5jbHVkZXNRdWVzdGlvbk9taXNzaW9uOiBkZXRhaWwuaW5jbHVkZXMoJzIgbW9yZSBxdWVzdGlvbnMgYXJlIG9wZW4gaW4gR2l0SHViIENvcGlsb3QuJyksXG5cdFx0XHRjb250YWluc0ludGVybmFsSWRzOiBkZXRhaWwuaW5jbHVkZXMoJ2ludGVybmFsX3F1ZXN0aW9uXycpIHx8IGRldGFpbC5pbmNsdWRlcygnaW50ZXJuYWxfb3B0aW9uXycpIHx8IGRldGFpbC5pbmNsdWRlcygnaGlkZGVuX3ZhbHVlXycpLFxuXHRcdH0sIHtcblx0XHRcdHdpdGhpbkxpbWl0OiB0cnVlLFxuXHRcdFx0aW5jbHVkZXNPcHRpb25PbWlzc2lvbjogdHJ1ZSxcblx0XHRcdGluY2x1ZGVzUXVlc3Rpb25PbWlzc2lvbjogdHJ1ZSxcblx0XHRcdGNvbnRhaW5zSW50ZXJuYWxJZHM6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXN0aW5ndWlzaGVzIHBsYW4sIGVsaWNpdGF0aW9uLCBhbmQgdG9vbCBhcHByb3ZhbCB1c2luZyB2aXNpYmxlIHRleHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIobmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZ2V0QWdlbnRTdGF0ZUluZm8gPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2dldEFnZW50U3RhdGVJbmZvJykgYXMgKG1vZGVsOiBJQ2hhdE1vZGVsKSA9PiB7IHN0YXRlOiBzdHJpbmc7IGRldGFpbD86IHN0cmluZyB9O1xuXHRcdGNvbnN0IHBsYW4gPSBuZXcgQ2hhdFBsYW5SZXZpZXdEYXRhKCdSZXZpZXcgdGhlIE1hcnMgaW1wbGVtZW50YXRpb24gcGxhbicsICcjIEhpZGRlbiBwbGFuIGJvZHknLCBbXG5cdFx0XHR7IGlkOiAnaW50ZXJuYWxfaW1wbGVtZW50JywgbGFiZWw6ICdJbXBsZW1lbnQgUGxhbicsIGRlc2NyaXB0aW9uOiAnU3RhcnQgbWFraW5nIHRoZSBjaGFuZ2VzJyB9LFxuXHRcdFx0eyBpZDogJ2ludGVybmFsX2F1dG9waWxvdCcsIGxhYmVsOiAnQ29udGludWUgaW4gQXV0b3BpbG90JywgZGVzY3JpcHRpb246ICdQcm9jZWVkIGF1dG9tYXRpY2FsbHknIH0sXG5cdFx0XSwgdHJ1ZSwgdW5kZWZpbmVkLCAnaW50ZXJuYWxfcGxhbl9yZXNvbHZlX2lkJyk7XG5cdFx0Y29uc3QgZWxpY2l0YXRpb24gPSBuZXcgQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdFBhcnQoXG5cdFx0XHRuZXcgTWFya2Rvd25TdHJpbmcoJ0Nob29zZSBhIGRlcGxveW1lbnQgdGFyZ2V0JyksXG5cdFx0XHQnU2VsZWN0IHdoZXJlIEdpdEh1YiBDb3BpbG90IHNob3VsZCBkZXBsb3kgdGhlIHByZXZpZXcuJyxcblx0XHRcdCdZb3VyIGNob2ljZSBpcyByZXF1aXJlZCBiZWZvcmUgY29udGludWluZy4nLFxuXHRcdFx0J0NvbnRpbnVlJyxcblx0XHRcdCdDYW5jZWwnLFxuXHRcdFx0YXN5bmMgKCkgPT4gRWxpY2l0YXRpb25TdGF0ZS5BY2NlcHRlZCxcblx0XHQpO1xuXHRcdGNvbnN0IGNvbmZpcm1hdGlvbjogSUNoYXRDb25maXJtYXRpb24gPSB7XG5cdFx0XHRraW5kOiAnY29uZmlybWF0aW9uJyxcblx0XHRcdHRpdGxlOiAnSW5zdGFsbCByZWNvbW1lbmRlZCBleHRlbnNpb25zPycsXG5cdFx0XHRtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoJ1RoaXMgaW5zdGFsbHMgdGhlIGV4dGVuc2lvbnMgc2hvd24gaW4gdGhlIG9wZW4gYXBwcm92YWwuJyksXG5cdFx0XHRidXR0b25zOiBbJ0luc3RhbGwnLCAnQ2FuY2VsJ10sXG5cdFx0XHRkYXRhOiB7IGhpZGRlbkludGVybmFsSWQ6ICdleHRlbnNpb25faW5zdGFsbCcgfSxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRnZXRBZ2VudFN0YXRlSW5mby5jYWxsKGNvbnRyb2xsZXIsIHBlbmRpbmdSZXNwb25zZVBhcnRNb2RlbChVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovcGxhbicpLCBwbGFuKSksXG5cdFx0XHRnZXRBZ2VudFN0YXRlSW5mby5jYWxsKGNvbnRyb2xsZXIsIHBlbmRpbmdSZXNwb25zZVBhcnRNb2RlbChVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovZWxpY2l0YXRpb24nKSwgZWxpY2l0YXRpb24pKSxcblx0XHRcdGdldEFnZW50U3RhdGVJbmZvLmNhbGwoY29udHJvbGxlciwgcGVuZGluZ1Jlc3BvbnNlUGFydE1vZGVsKFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi9jb25maXJtYXRpb24nKSwgY29uZmlybWF0aW9uKSksXG5cdFx0XSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRzdGF0ZTogJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbl90eXBlOiAncGxhbicsXG5cdFx0XHRcdGRldGFpbDogW1xuXHRcdFx0XHRcdCdwbGFuIGFwcHJvdmFsOiBSZXZpZXcgdGhlIE1hcnMgaW1wbGVtZW50YXRpb24gcGxhbicsXG5cdFx0XHRcdFx0J2Nob2ljZXM6IEltcGxlbWVudCBQbGFuIC0gU3RhcnQgbWFraW5nIHRoZSBjaGFuZ2VzOyBDb250aW51ZSBpbiBBdXRvcGlsb3QgLSBQcm9jZWVkIGF1dG9tYXRpY2FsbHknLFxuXHRcdFx0XHRcdCdUaGUgcGxhbiBpcyBvcGVuIGluIEdpdEh1YiBDb3BpbG90LicsXG5cdFx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRzdGF0ZTogJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbl90eXBlOiAnZWxpY2l0YXRpb24nLFxuXHRcdFx0XHRkZXRhaWw6IFtcblx0XHRcdFx0XHQnaW5wdXQgcmVxdWVzdDogQ2hvb3NlIGEgZGVwbG95bWVudCB0YXJnZXQnLFxuXHRcdFx0XHRcdCdZb3VyIGNob2ljZSBpcyByZXF1aXJlZCBiZWZvcmUgY29udGludWluZy4nLFxuXHRcdFx0XHRcdCdTZWxlY3Qgd2hlcmUgR2l0SHViIENvcGlsb3Qgc2hvdWxkIGRlcGxveSB0aGUgcHJldmlldy4nLFxuXHRcdFx0XHRcdCdjaG9pY2VzOiBDb250aW51ZTsgQ2FuY2VsJyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHN0YXRlOiAnd2FpdGluZ19mb3JfY29uZmlybWF0aW9uJyxcblx0XHRcdFx0Y29uZmlybWF0aW9uX3R5cGU6ICdnZW5lcmljJyxcblx0XHRcdFx0ZGV0YWlsOiBbXG5cdFx0XHRcdFx0J2NvbmZpcm1hdGlvbjogSW5zdGFsbCByZWNvbW1lbmRlZCBleHRlbnNpb25zPycsXG5cdFx0XHRcdFx0J1RoaXMgaW5zdGFsbHMgdGhlIGV4dGVuc2lvbnMgc2hvd24gaW4gdGhlIG9wZW4gYXBwcm92YWwuJyxcblx0XHRcdFx0XHQnY2hvaWNlczogSW5zdGFsbDsgQ2FuY2VsJyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgdmlzaWJsZSB0b29sIGNvbmZpcm1hdGlvbiBtZXNzYWdlcyBpbnN0ZWFkIG9mIGhpZGRlbiBwYXJhbWV0ZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGdldEFnZW50U3RhdGVJbmZvID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19nZXRBZ2VudFN0YXRlSW5mbycpIGFzIChtb2RlbDogSUNoYXRNb2RlbCkgPT4geyBzdGF0ZTogc3RyaW5nOyBkZXRhaWw/OiBzdHJpbmcgfTtcblx0XHRjb25zdCB0b29sU3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT4oJ3Rvb2xTdGF0ZScsIHtcblx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHRcdGNvbW1hbmQ6ICdoaWRkZW4taW50ZXJuYWwtY29tbWFuZCcsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnaGlkZGVuLWludGVybmFsLWV4cGxhbmF0aW9uJyxcblx0XHRcdH0sXG5cdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczoge1xuXHRcdFx0XHR0aXRsZTogbmV3IE1hcmtkb3duU3RyaW5nKCdSdW4gdGhlIHdvcmtzcGFjZSBidWlsZD8nKSxcblx0XHRcdFx0bWVzc2FnZTogJ1RoaXMgcnVucyB0aGUgYnVpbGQgdGFzayBzaG93biBpbiB0aGUgYXBwcm92YWwuJyxcblx0XHRcdH0sXG5cdFx0XHRjb25maXJtOiAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0VG9vbEludm9jYXRpb24+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkga2luZCA9ICd0b29sSW52b2NhdGlvbicgYXMgY29uc3Q7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBzdGF0ZSA9IHRvb2xTdGF0ZTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGludm9jYXRpb25NZXNzYWdlID0gJ1J1biB0aGUgd29ya3NwYWNlIGJ1aWxkJztcblx0XHR9KCk7XG5cdFx0Y29uc3Qgc3RhdGVJbmZvID0gZ2V0QWdlbnRTdGF0ZUluZm8uY2FsbChjb250cm9sbGVyLCBwZW5kaW5nUmVzcG9uc2VQYXJ0TW9kZWwoVVJJLnBhcnNlKCdjaGF0LXNlc3Npb246L3Rvb2wnKSwgdG9vbEludm9jYXRpb24pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhdGVJbmZvLFxuXHRcdFx0Y29udGFpbnNIaWRkZW5QYXJhbWV0ZXJzOiBzdGF0ZUluZm8uZGV0YWlsPy5pbmNsdWRlcygnaGlkZGVuLWludGVybmFsJyksXG5cdFx0fSwge1xuXHRcdFx0c3RhdGVJbmZvOiB7XG5cdFx0XHRcdHN0YXRlOiAnd2FpdGluZ19mb3JfY29uZmlybWF0aW9uJyxcblx0XHRcdFx0Y29uZmlybWF0aW9uX3R5cGU6ICd0b29sJyxcblx0XHRcdFx0ZGV0YWlsOiBbXG5cdFx0XHRcdFx0J3Rvb2wgYXBwcm92YWw6IFJ1biB0aGUgd29ya3NwYWNlIGJ1aWxkPycsXG5cdFx0XHRcdFx0J1RoaXMgcnVucyB0aGUgYnVpbGQgdGFzayBzaG93biBpbiB0aGUgYXBwcm92YWwuJyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdH0sXG5cdFx0XHRjb250YWluc0hpZGRlblBhcmFtZXRlcnM6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCduYXJyYXRlcyBhdXRoZW50aWNhdGlvbiB1c2luZyB0aGUgdmlzaWJsZSBzZXJ2ZXIgbmFtZSB3aXRob3V0IGhpZGRlbiBzZXJ2ZXIgbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIobmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZ2V0QWdlbnRTdGF0ZUluZm8gPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2dldEFnZW50U3RhdGVJbmZvJykgYXMgKG1vZGVsOiBJQ2hhdE1vZGVsKSA9PiB7IHN0YXRlOiBzdHJpbmc7IGRldGFpbD86IHN0cmluZyB9O1xuXHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uU3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZT4oJ2F1dGhlbnRpY2F0aW9uU3RhdGUnLCB7XG5cdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQXV0aGVudGljYXRpb24sXG5cdFx0XHRwYXJhbWV0ZXJzOiB7IGhpZGRlblBhcmFtZXRlcjogJ3NlY3JldC1pbnRlcm5hbC12YWx1ZScgfSxcblx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB1bmRlZmluZWQsXG5cdFx0XHRjb25maXJtZWQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCB9LFxuXHRcdFx0c2VydmVyOiB7XG5cdFx0XHRcdGlkOiAnaGlkZGVuLXNlcnZlci1pZCcsXG5cdFx0XHRcdG5hbWU6ICdNYXJzIERhdGEgTUNQJyxcblx0XHRcdFx0cmVzb3VyY2U6ICdoaWRkZW4tc2VydmVyLXJlc291cmNlJyxcblx0XHRcdH0sXG5cdFx0XHRjYW5jZWw6ICgpID0+IHsgfSxcblx0XHR9KTtcblx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRUb29sSW52b2NhdGlvbj4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBraW5kID0gJ3Rvb2xJbnZvY2F0aW9uJyBhcyBjb25zdDtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXRlID0gYXV0aGVudGljYXRpb25TdGF0ZTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGludm9jYXRpb25NZXNzYWdlID0gJ0F1dGhlbnRpY2F0ZSB0aGUgTWFycyBkYXRhIHNlcnZlcic7XG5cdFx0fSgpO1xuXHRcdGNvbnN0IHN0YXRlSW5mbyA9IGdldEFnZW50U3RhdGVJbmZvLmNhbGwoY29udHJvbGxlciwgcGVuZGluZ1Jlc3BvbnNlUGFydE1vZGVsKFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi9hdXRoZW50aWNhdGlvbicpLCB0b29sSW52b2NhdGlvbiwgJ0F1dGhlbnRpY2F0ZSBNYXJzIERhdGEgTUNQIHRvIGNvbnRpbnVlLi4uJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGF0ZUluZm8sXG5cdFx0XHRjb250YWluc0hpZGRlbk1ldGFkYXRhOiBbJ2hpZGRlbi1zZXJ2ZXItaWQnLCAnaGlkZGVuLXNlcnZlci1yZXNvdXJjZScsICdzZWNyZXQtaW50ZXJuYWwtdmFsdWUnXVxuXHRcdFx0XHQuc29tZSh2YWx1ZSA9PiBzdGF0ZUluZm8uZGV0YWlsPy5pbmNsdWRlcyh2YWx1ZSkpLFxuXHRcdH0sIHtcblx0XHRcdHN0YXRlSW5mbzoge1xuXHRcdFx0XHRzdGF0ZTogJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbl90eXBlOiAnZ2VuZXJpYycsXG5cdFx0XHRcdGRldGFpbDogW1xuXHRcdFx0XHRcdCdhdXRoZW50aWNhdGlvbiByZXF1ZXN0OiBNQ1AgYXV0aGVudGljYXRpb24gcmVxdWlyZWQnLFxuXHRcdFx0XHRcdCdUaGUgTUNQIHNlcnZlciBNYXJzIERhdGEgTUNQIHJlcXVpcmVzIGF1dGhlbnRpY2F0aW9uIHRvIGNvbnRpbnVlIHRoaXMgdG9vbCBjYWxsLicsXG5cdFx0XHRcdFx0J2Nob2ljZXM6IEF1dGhlbnRpY2F0ZTsgQ2FuY2VsJyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdH0sXG5cdFx0XHRjb250YWluc0hpZGRlbk1ldGFkYXRhOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgd2F0Y2ggcHJvZ3Jlc3Mgd2hlbiBhZ2VudCBwcm9ncmVzcyBpcyBub3QgZW5hYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKFxuXHRcdFx0dm9pY2VDbGllbnRTZXJ2aWNlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0bmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7ICdhZ2VudHMudm9pY2UuaGFuZHNGcmVlJzogZmFsc2UgfSksXG5cdFx0KTtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovZGlzYWJsZWQtcHJvZ3Jlc3MnKTtcblx0XHRjb25zdCB7IGNoYW5nZUVtaXR0ZXIsIHBhcnRzLCByZXNwb25zZSB9ID0gY3JlYXRlVm9pY2VQcm9ncmVzc1Jlc3BvbnNlKCdyZXNwb25zZS1kaXNhYmxlZCcpO1xuXHRcdGNvbnN0IGlzQ29ubmVjdGVkID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19pc0Nvbm5lY3RlZCcpIGFzIHsgc2V0KHZhbHVlOiBib29sZWFuLCB0eDogdW5kZWZpbmVkKTogdm9pZCB9O1xuXHRcdGNvbnN0IHdhdGNoVm9pY2VQcm9ncmVzcyA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfd2F0Y2hWb2ljZVByb2dyZXNzJykgYXMgKHJlc291cmNlOiBVUkksIHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlTW9kZWwpID0+IHZvaWQ7XG5cblx0XHRpc0Nvbm5lY3RlZC5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRjb250cm9sbGVyLnNldEFjdGl2ZVNlc3Npb25TaG93bihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHdhdGNoVm9pY2VQcm9ncmVzcy5jYWxsKGNvbnRyb2xsZXIsIHNlc3Npb25SZXNvdXJjZSwgcmVzcG9uc2UpO1xuXHRcdHBhcnRzLnB1c2goeyBraW5kOiAndm9pY2VQcm9ncmVzcycsIGlkOiAnaW52ZXN0aWdhdGluZycsIHZhbHVlOiAnSW52ZXN0aWdhdGluZyB0aGUgcmVsZXZhbnQgY29kZS4nIH0pO1xuXHRcdGNoYW5nZUVtaXR0ZXIuZmlyZSh7IHJlYXNvbjogJ290aGVyJyB9KTtcblx0XHRjbG9jay50aWNrKDEwXzAwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZvaWNlQ2xpZW50U2VydmljZS5yZXF1ZXN0cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXJrcyB2b2ljZSByZXF1ZXN0cyBvbmx5IHdoZW4gYWdlbnQgcHJvZ3Jlc3MgaXMgZW5hYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXNhYmxlZENoYXRTZXJ2aWNlID0gbmV3IFRlc3RDaGF0U2VydmljZSgpO1xuXHRcdGNvbnN0IGRpc2FibGVkQ29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoXG5cdFx0XHRuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0bmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7ICdhZ2VudHMudm9pY2UuaGFuZHNGcmVlJzogZmFsc2UgfSksXG5cdFx0XHRkaXNhYmxlZENoYXRTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0Y29uc3QgZW5hYmxlZENoYXRTZXJ2aWNlID0gbmV3IFRlc3RDaGF0U2VydmljZSgpO1xuXHRcdGNvbnN0IGVuYWJsZWRDb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihcblx0XHRcdG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgJ2FnZW50cy52b2ljZS5oYW5kc0ZyZWUnOiBmYWxzZSwgW1ZPSUNFX0FHRU5UX1BST0dSRVNTX1NFVFRJTkddOiB0cnVlIH0pLFxuXHRcdFx0ZW5hYmxlZENoYXRTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0Y29uc3Qgc2VuZFZvaWNlUmVxdWVzdCA9IFJlZmxlY3QuZ2V0KGRpc2FibGVkQ29udHJvbGxlciwgJ19zZW5kVm9pY2VSZXF1ZXN0JykgYXMgKHJlc291cmNlOiBVUkksIHRleHQ6IHN0cmluZykgPT4gUHJvbWlzZTxDaGF0U2VuZFJlc3VsdCB8IHVuZGVmaW5lZD47XG5cblx0XHRhd2FpdCBzZW5kVm9pY2VSZXF1ZXN0LmNhbGwoZGlzYWJsZWRDb250cm9sbGVyLCBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovZGlzYWJsZWQnKSwgJ0NoZWNrIHRoZSBjb2RlLicpO1xuXHRcdGF3YWl0IHNlbmRWb2ljZVJlcXVlc3QuY2FsbChlbmFibGVkQ29udHJvbGxlciwgVVJJLnBhcnNlKCdjaGF0LXNlc3Npb246L2VuYWJsZWQnKSwgJ0NoZWNrIHRoZSBjb2RlLicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaXNhYmxlZDogZGlzYWJsZWRDaGF0U2VydmljZS5zZW5kUmVxdWVzdE9wdGlvbnNbMF0/LmlzVm9pY2VNb2RlSW5wdXQsXG5cdFx0XHRlbmFibGVkOiBlbmFibGVkQ2hhdFNlcnZpY2Uuc2VuZFJlcXVlc3RPcHRpb25zWzBdPy5pc1ZvaWNlTW9kZUlucHV0LFxuXHRcdH0sIHtcblx0XHRcdGRpc2FibGVkOiBmYWxzZSxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGF5cywgY29hbGVzY2VzLCBhbmQgcHJlc2VydmVzIHRocm90dGxlZCB2b2ljZSBwcm9ncmVzcyBmb3IgdGhlIHNob3duIHJlcXVlc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCB0dHNQbGF5YmFja1NlcnZpY2UgPSBuZXcgVGVzdFR0c1BsYXliYWNrU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHZvaWNlQ2xpZW50U2VydmljZSwgdHRzUGxheWJhY2tTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovdm9pY2UtcHJvZ3Jlc3MnKTtcblx0XHRjb25zdCB7IGNoYW5nZUVtaXR0ZXIsIHBhcnRzLCByZXNwb25zZSB9ID0gY3JlYXRlVm9pY2VQcm9ncmVzc1Jlc3BvbnNlKCdyZXNwb25zZS0xJyk7XG5cdFx0Y29uc3QgaXNDb25uZWN0ZWQgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2lzQ29ubmVjdGVkJykgYXMgeyBzZXQodmFsdWU6IGJvb2xlYW4sIHR4OiB1bmRlZmluZWQpOiB2b2lkIH07XG5cdFx0Y29uc3Qgd2F0Y2hWb2ljZVByb2dyZXNzID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ193YXRjaFZvaWNlUHJvZ3Jlc3MnKSBhcyAocmVzb3VyY2U6IFVSSSwgcmVzcG9uc2U6IElDaGF0UmVzcG9uc2VNb2RlbCkgPT4gdm9pZDtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gKFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfc2Vzc2lvbktleScpIGFzIChzZXNzaW9uSWQ6IHN0cmluZykgPT4gc3RyaW5nKS5jYWxsKGNvbnRyb2xsZXIsIHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRjb25zdCBsYXN0U3Bva2VuQXQgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2xhc3RTcG9rZW5BdEJ5U2Vzc2lvbicpIGFzIE1hcDxzdHJpbmcsIG51bWJlcj47XG5cblx0XHRpc0Nvbm5lY3RlZC5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRjb250cm9sbGVyLnNldEFjdGl2ZVNlc3Npb25TaG93bihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHdhdGNoVm9pY2VQcm9ncmVzcy5jYWxsKGNvbnRyb2xsZXIsIHNlc3Npb25SZXNvdXJjZSwgcmVzcG9uc2UpO1xuXHRcdHR0c1BsYXliYWNrU2VydmljZS5wbGF5QXVkaW9DaHVuaygnYWNrJyk7XG5cdFx0UmVmbGVjdC5zZXQoY29udHJvbGxlciwgJ19jdXJyZW50UGxheWJhY2tTZXNzaW9uSWQnLCBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0UmVmbGVjdC5zZXQoY29udHJvbGxlciwgJ19jdXJyZW50UGxheWJhY2tSZXNwb25zZUlkJywgJ2Fjay1yZXNwb25zZScpO1xuXHRcdHBhcnRzLnB1c2goeyBraW5kOiAndm9pY2VQcm9ncmVzcycsIGlkOiAnaW52ZXN0aWdhdGluZycsIHZhbHVlOiAnSW52ZXN0aWdhdGluZyB0aGUgcmVsZXZhbnQgY29kZS4nIH0pO1xuXHRcdHBhcnRzLnB1c2goeyBraW5kOiAndm9pY2VQcm9ncmVzcycsIGlkOiAnZWRpdGluZycsIHZhbHVlOiAnVXBkYXRpbmcgdGhlIGNvZGUuJyB9KTtcblx0XHRjaGFuZ2VFbWl0dGVyLmZpcmUoeyByZWFzb246ICdvdGhlcicgfSk7XG5cdFx0Y2xvY2sudGljayg0XzAwMCk7XG5cdFx0cGFydHMucHVzaCh7IGtpbmQ6ICd2b2ljZVByb2dyZXNzJywgaWQ6ICd2YWxpZGF0aW5nJywgdmFsdWU6ICdWYWxpZGF0aW5nIHRoZSBjaGFuZ2VzLicgfSk7XG5cdFx0Y2hhbmdlRW1pdHRlci5maXJlKHsgcmVhc29uOiAnb3RoZXInIH0pO1xuXHRcdGNsb2NrLnRpY2soMV8wMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHMubGVuZ3RoLCAwKTtcblx0XHRsYXN0U3Bva2VuQXQuc2V0KHNlc3Npb25LZXksIERhdGUubm93KCkpO1xuXHRcdHR0c1BsYXliYWNrU2VydmljZS5zdG9wUGxheWJhY2soKTtcblx0XHRjbG9jay50aWNrKDRfOTk5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzLmxlbmd0aCwgMCk7XG5cdFx0Y2xvY2sudGljaygxKTtcblxuXHRcdHBhcnRzLnB1c2goeyBraW5kOiAndm9pY2VQcm9ncmVzcycsIGlkOiAncmVjb3ZlcmluZycsIHZhbHVlOiAnVHJ5aW5nIGEgZGlmZmVyZW50IGFwcHJvYWNoLicgfSk7XG5cdFx0Y2hhbmdlRW1pdHRlci5maXJlKHsgcmVhc29uOiAnb3RoZXInIH0pO1xuXHRcdGNsb2NrLnRpY2soOV85OTkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHMubGVuZ3RoLCAxKTtcblx0XHRjbG9jay50aWNrKDEpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHMubWFwKHJlcXVlc3QgPT4gKHtcblx0XHRcdGtpbmQ6IHJlcXVlc3Qua2luZCxcblx0XHRcdHRleHQ6IHJlcXVlc3QudGV4dCxcblx0XHRcdGNoZWNrcG9pbnQ6IHJlcXVlc3QuY2hlY2twb2ludCxcblx0XHR9KSksIFtcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2NoZWNrcG9pbnQnLFxuXHRcdFx0XHR0ZXh0OiAnVmFsaWRhdGluZyB0aGUgY2hhbmdlcy4nLFxuXHRcdFx0XHRjaGVja3BvaW50OiB7IHJlcXVlc3RJZDogJ3JlcXVlc3QtcmVzcG9uc2UtMScsIGNoZWNrcG9pbnRJZDogJ3ZhbGlkYXRpbmcnLCBzZXF1ZW5jZTogMSB9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2NoZWNrcG9pbnQnLFxuXHRcdFx0XHR0ZXh0OiAnVHJ5aW5nIGEgZGlmZmVyZW50IGFwcHJvYWNoLicsXG5cdFx0XHRcdGNoZWNrcG9pbnQ6IHsgcmVxdWVzdElkOiAncmVxdWVzdC1yZXNwb25zZS0xJywgY2hlY2twb2ludElkOiAncmVjb3ZlcmluZycsIHNlcXVlbmNlOiAyIH0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kcyB0aGUgZmlyc3Qgc2VtYW50aWMgY2hlY2twb2ludCBhZnRlciBmaXZlIHNlY29uZHMgd2l0aG91dCBwcmlvciBzcGVlY2gnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi9pbml0aWFsLXByb2dyZXNzLWRlbGF5Jyk7XG5cdFx0Y29uc3QgeyBjaGFuZ2VFbWl0dGVyLCBwYXJ0cywgcmVzcG9uc2UgfSA9IGNyZWF0ZVZvaWNlUHJvZ3Jlc3NSZXNwb25zZSgncmVzcG9uc2UtaW5pdGlhbC1kZWxheScpO1xuXHRcdGNvbnN0IGlzQ29ubmVjdGVkID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19pc0Nvbm5lY3RlZCcpIGFzIHsgc2V0KHZhbHVlOiBib29sZWFuLCB0eDogdW5kZWZpbmVkKTogdm9pZCB9O1xuXHRcdGNvbnN0IHdhdGNoVm9pY2VQcm9ncmVzcyA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfd2F0Y2hWb2ljZVByb2dyZXNzJykgYXMgKHJlc291cmNlOiBVUkksIHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlTW9kZWwpID0+IHZvaWQ7XG5cblx0XHRpc0Nvbm5lY3RlZC5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRjb250cm9sbGVyLnNldEFjdGl2ZVNlc3Npb25TaG93bihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHdhdGNoVm9pY2VQcm9ncmVzcy5jYWxsKGNvbnRyb2xsZXIsIHNlc3Npb25SZXNvdXJjZSwgcmVzcG9uc2UpO1xuXHRcdHBhcnRzLnB1c2goeyBraW5kOiAndm9pY2VQcm9ncmVzcycsIGlkOiAnZWRpdGluZycsIHZhbHVlOiAnVXBkYXRpbmcgdGhlIGNvZGUuJyB9KTtcblx0XHRjaGFuZ2VFbWl0dGVyLmZpcmUoeyByZWFzb246ICdvdGhlcicgfSk7XG5cdFx0Y2xvY2sudGljayg0Xzk5OSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZvaWNlQ2xpZW50U2VydmljZS5yZXF1ZXN0cy5sZW5ndGgsIDApO1xuXHRcdGNsb2NrLnRpY2soMSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZvaWNlQ2xpZW50U2VydmljZS5yZXF1ZXN0cy5tYXAocmVxdWVzdCA9PiByZXF1ZXN0LmNoZWNrcG9pbnQpLCBbe1xuXHRcdFx0cmVxdWVzdElkOiAncmVxdWVzdC1yZXNwb25zZS1pbml0aWFsLWRlbGF5Jyxcblx0XHRcdGNoZWNrcG9pbnRJZDogJ2VkaXRpbmcnLFxuXHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzY2hlZHVsZXMgYWxsIGZpdmUgc2VtYW50aWMgc3RhZ2VzIG9uY2UgYXQgdGhlIGV4aXN0aW5nIGNhZGVuY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi9maXZlLXByb2dyZXNzLXN0YWdlcycpO1xuXHRcdGNvbnN0IHsgY2hhbmdlRW1pdHRlciwgcGFydHMsIHJlc3BvbnNlIH0gPSBjcmVhdGVWb2ljZVByb2dyZXNzUmVzcG9uc2UoJ3Jlc3BvbnNlLWZpdmUtc3RhZ2VzJyk7XG5cdFx0Y29uc3QgaXNDb25uZWN0ZWQgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2lzQ29ubmVjdGVkJykgYXMgeyBzZXQodmFsdWU6IGJvb2xlYW4sIHR4OiB1bmRlZmluZWQpOiB2b2lkIH07XG5cdFx0Y29uc3Qgd2F0Y2hWb2ljZVByb2dyZXNzID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ193YXRjaFZvaWNlUHJvZ3Jlc3MnKSBhcyAocmVzb3VyY2U6IFVSSSwgcmVzcG9uc2U6IElDaGF0UmVzcG9uc2VNb2RlbCkgPT4gdm9pZDtcblx0XHRjb25zdCBzdGFnZXMgPSBbJ2ludmVzdGlnYXRpbmcnLCAncGxhbm5pbmcnLCAnZWRpdGluZycsICd2YWxpZGF0aW5nJywgJ3JlY292ZXJpbmcnXSBhcyBjb25zdDtcblxuXHRcdGlzQ29ubmVjdGVkLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0d2F0Y2hWb2ljZVByb2dyZXNzLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvblJlc291cmNlLCByZXNwb25zZSk7XG5cdFx0Zm9yIChjb25zdCBbaW5kZXgsIHN0YWdlXSBvZiBzdGFnZXMuZW50cmllcygpKSB7XG5cdFx0XHRwYXJ0cy5wdXNoKHsga2luZDogJ3ZvaWNlUHJvZ3Jlc3MnLCBpZDogc3RhZ2UsIHZhbHVlOiBgJHtzdGFnZX0gdXBkYXRlYCB9KTtcblx0XHRcdGNoYW5nZUVtaXR0ZXIuZmlyZSh7IHJlYXNvbjogJ290aGVyJyB9KTtcblx0XHRcdGNsb2NrLnRpY2soaW5kZXggPT09IDAgPyA1XzAwMCA6IDEwXzAwMCk7XG5cdFx0fVxuXHRcdHBhcnRzLnB1c2goeyBraW5kOiAndm9pY2VQcm9ncmVzcycsIGlkOiAncmVjb3ZlcmluZycsIHZhbHVlOiAnZHVwbGljYXRlIHJlY292ZXJ5JyB9KTtcblx0XHRjaGFuZ2VFbWl0dGVyLmZpcmUoeyByZWFzb246ICdvdGhlcicgfSk7XG5cdFx0Y2xvY2sudGljaygxMF8wMDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHMubWFwKHJlcXVlc3QgPT4gKHtcblx0XHRcdHRleHQ6IHJlcXVlc3QudGV4dCxcblx0XHRcdGNoZWNrcG9pbnQ6IHJlcXVlc3QuY2hlY2twb2ludCxcblx0XHR9KSksIHN0YWdlcy5tYXAoKHN0YWdlLCBpbmRleCkgPT4gKHtcblx0XHRcdHRleHQ6IGAke3N0YWdlfSB1cGRhdGVgLFxuXHRcdFx0Y2hlY2twb2ludDoge1xuXHRcdFx0XHRyZXF1ZXN0SWQ6ICdyZXF1ZXN0LXJlc3BvbnNlLWZpdmUtc3RhZ2VzJyxcblx0XHRcdFx0Y2hlY2twb2ludElkOiBzdGFnZSxcblx0XHRcdFx0c2VxdWVuY2U6IGluZGV4ICsgMSxcblx0XHRcdH0sXG5cdFx0fSkpKTtcblx0fSk7XG5cblx0dGVzdCgnZmluYWwgcmVzcG9uc2UgY2FuY2VscyBwZW5kaW5nIHZvaWNlIHByb2dyZXNzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovZmluYWwtY2FuY2Vscy1wcm9ncmVzcycpO1xuXHRcdGNvbnN0IHsgY2hhbmdlRW1pdHRlciwgcGFydHMsIHJlc3BvbnNlIH0gPSBjcmVhdGVWb2ljZVByb2dyZXNzUmVzcG9uc2UoJ3Jlc3BvbnNlLWZpbmFsJyk7XG5cdFx0Y29uc3QgaXNDb25uZWN0ZWQgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2lzQ29ubmVjdGVkJykgYXMgeyBzZXQodmFsdWU6IGJvb2xlYW4sIHR4OiB1bmRlZmluZWQpOiB2b2lkIH07XG5cdFx0Y29uc3Qgd2F0Y2hWb2ljZVByb2dyZXNzID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ193YXRjaFZvaWNlUHJvZ3Jlc3MnKSBhcyAocmVzb3VyY2U6IFVSSSwgcmVzcG9uc2U6IElDaGF0UmVzcG9uc2VNb2RlbCkgPT4gdm9pZDtcblx0XHRjb25zdCBoYW5kbGVTdGF0ZUNoYW5nZSA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfaGFuZGxlTmFycmF0YWJsZVN0YXRlQ2hhbmdlJykgYXMgKHNlc3Npb25JZDogc3RyaW5nLCBzdGF0ZTogc3RyaW5nLCBkZXRhaWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgc3VtbWFyeTogc3RyaW5nIHwgdW5kZWZpbmVkLCBzaG93bjogc3RyaW5nKSA9PiB2b2lkO1xuXG5cdFx0aXNDb25uZWN0ZWQuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0Y29udHJvbGxlci5zZXRBY3RpdmVTZXNzaW9uU2hvd24oc2Vzc2lvblJlc291cmNlKTtcblx0XHR3YXRjaFZvaWNlUHJvZ3Jlc3MuY2FsbChjb250cm9sbGVyLCBzZXNzaW9uUmVzb3VyY2UsIHJlc3BvbnNlKTtcblx0XHRwYXJ0cy5wdXNoKHsga2luZDogJ3ZvaWNlUHJvZ3Jlc3MnLCBpZDogJ2VkaXRpbmcnLCB2YWx1ZTogJ1VwZGF0aW5nIHRoZSBjb2RlLicgfSk7XG5cdFx0Y2hhbmdlRW1pdHRlci5maXJlKHsgcmVhc29uOiAnb3RoZXInIH0pO1xuXHRcdGhhbmRsZVN0YXRlQ2hhbmdlLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksICdpZGxlJywgdW5kZWZpbmVkLCAnRmluaXNoZWQgc3VjY2Vzc2Z1bGx5LicsIHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRjbG9jay50aWNrKDVfMDAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzLm1hcChyZXF1ZXN0ID0+IHJlcXVlc3Qua2luZCksIFsncmVzcG9uc2UnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpcm1hdGlvbiBjYW5jZWxzIHBlbmRpbmcgdm9pY2UgcHJvZ3Jlc3MnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi9jb25maXJtYXRpb24tY2FuY2Vscy1wcm9ncmVzcycpO1xuXHRcdGNvbnN0IHsgY2hhbmdlRW1pdHRlciwgcGFydHMsIHJlc3BvbnNlIH0gPSBjcmVhdGVWb2ljZVByb2dyZXNzUmVzcG9uc2UoJ3Jlc3BvbnNlLWNvbmZpcm1hdGlvbicpO1xuXHRcdGNvbnN0IGlzQ29ubmVjdGVkID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19pc0Nvbm5lY3RlZCcpIGFzIHsgc2V0KHZhbHVlOiBib29sZWFuLCB0eDogdW5kZWZpbmVkKTogdm9pZCB9O1xuXHRcdGNvbnN0IHdhdGNoVm9pY2VQcm9ncmVzcyA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfd2F0Y2hWb2ljZVByb2dyZXNzJykgYXMgKHJlc291cmNlOiBVUkksIHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlTW9kZWwpID0+IHZvaWQ7XG5cdFx0Y29uc3QgaGFuZGxlU3RhdGVDaGFuZ2UgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2hhbmRsZU5hcnJhdGFibGVTdGF0ZUNoYW5nZScpIGFzIChzZXNzaW9uSWQ6IHN0cmluZywgc3RhdGU6IHN0cmluZywgZGV0YWlsOiBzdHJpbmcgfCB1bmRlZmluZWQsIHN1bW1hcnk6IHN0cmluZyB8IHVuZGVmaW5lZCwgc2hvd246IHN0cmluZykgPT4gdm9pZDtcblxuXHRcdGlzQ29ubmVjdGVkLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0d2F0Y2hWb2ljZVByb2dyZXNzLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvblJlc291cmNlLCByZXNwb25zZSk7XG5cdFx0cGFydHMucHVzaCh7IGtpbmQ6ICd2b2ljZVByb2dyZXNzJywgaWQ6ICd2YWxpZGF0aW5nJywgdmFsdWU6ICdWYWxpZGF0aW5nIHRoZSBjaGFuZ2VzLicgfSk7XG5cdFx0Y2hhbmdlRW1pdHRlci5maXJlKHsgcmVhc29uOiAnb3RoZXInIH0pO1xuXHRcdGhhbmRsZVN0YXRlQ2hhbmdlLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksICd3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24nLCAnQXBwcm92ZSB0aGUgY29tbWFuZC4nLCB1bmRlZmluZWQsIHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRjbG9jay50aWNrKDVfMDAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzLm1hcChyZXF1ZXN0ID0+IHJlcXVlc3Qua2luZCksIFsnY29uZmlybWF0aW9uJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXF1ZXN0IGNhbmNlbGxhdGlvbiBhbmQgZGlzY29ubmVjdCBjYW5jZWwgcGVuZGluZyB2b2ljZSBwcm9ncmVzcycsICgpID0+IHtcblx0XHRjb25zdCBmaXJzdFZvaWNlQ2xpZW50ID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBmaXJzdENvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKGZpcnN0Vm9pY2VDbGllbnQpO1xuXHRcdGNvbnN0IGZpcnN0U2Vzc2lvbiA9IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi9jYW5jZWxsZWQtcHJvZ3Jlc3MnKTtcblx0XHRjb25zdCBmaXJzdFJlc3BvbnNlID0gY3JlYXRlVm9pY2VQcm9ncmVzc1Jlc3BvbnNlKCdyZXNwb25zZS1jYW5jZWxsZWQnKTtcblx0XHRjb25zdCBmaXJzdENvbm5lY3RlZCA9IFJlZmxlY3QuZ2V0KGZpcnN0Q29udHJvbGxlciwgJ19pc0Nvbm5lY3RlZCcpIGFzIHsgc2V0KHZhbHVlOiBib29sZWFuLCB0eDogdW5kZWZpbmVkKTogdm9pZCB9O1xuXHRcdGNvbnN0IGZpcnN0V2F0Y2ggPSBSZWZsZWN0LmdldChmaXJzdENvbnRyb2xsZXIsICdfd2F0Y2hWb2ljZVByb2dyZXNzJykgYXMgKHJlc291cmNlOiBVUkksIHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlTW9kZWwpID0+IHZvaWQ7XG5cblx0XHRmaXJzdENvbm5lY3RlZC5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRmaXJzdENvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKGZpcnN0U2Vzc2lvbik7XG5cdFx0Zmlyc3RXYXRjaC5jYWxsKGZpcnN0Q29udHJvbGxlciwgZmlyc3RTZXNzaW9uLCBmaXJzdFJlc3BvbnNlLnJlc3BvbnNlKTtcblx0XHRmaXJzdFJlc3BvbnNlLnBhcnRzLnB1c2goeyBraW5kOiAndm9pY2VQcm9ncmVzcycsIGlkOiAnZWRpdGluZycsIHZhbHVlOiAnVXBkYXRpbmcgdGhlIGNvZGUuJyB9KTtcblx0XHRmaXJzdFJlc3BvbnNlLmNoYW5nZUVtaXR0ZXIuZmlyZSh7IHJlYXNvbjogJ290aGVyJyB9KTtcblx0XHRmaXJzdENvbnRyb2xsZXIubWFya1VzZXJDYW5jZWxsZWQoZmlyc3RTZXNzaW9uLnRvU3RyaW5nKCkpO1xuXG5cdFx0Y29uc3Qgc2Vjb25kVm9pY2VDbGllbnQgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IHNlY29uZENvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHNlY29uZFZvaWNlQ2xpZW50KTtcblx0XHRjb25zdCBzZWNvbmRTZXNzaW9uID0gVVJJLnBhcnNlKCdjaGF0LXNlc3Npb246L2Rpc2Nvbm5lY3RlZC1wcm9ncmVzcycpO1xuXHRcdGNvbnN0IHNlY29uZFJlc3BvbnNlID0gY3JlYXRlVm9pY2VQcm9ncmVzc1Jlc3BvbnNlKCdyZXNwb25zZS1kaXNjb25uZWN0ZWQnKTtcblx0XHRjb25zdCBzZWNvbmRDb25uZWN0ZWQgPSBSZWZsZWN0LmdldChzZWNvbmRDb250cm9sbGVyLCAnX2lzQ29ubmVjdGVkJykgYXMgeyBzZXQodmFsdWU6IGJvb2xlYW4sIHR4OiB1bmRlZmluZWQpOiB2b2lkIH07XG5cdFx0Y29uc3Qgc2Vjb25kV2F0Y2ggPSBSZWZsZWN0LmdldChzZWNvbmRDb250cm9sbGVyLCAnX3dhdGNoVm9pY2VQcm9ncmVzcycpIGFzIChyZXNvdXJjZTogVVJJLCByZXNwb25zZTogSUNoYXRSZXNwb25zZU1vZGVsKSA9PiB2b2lkO1xuXG5cdFx0c2Vjb25kQ29ubmVjdGVkLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdHNlY29uZENvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKHNlY29uZFNlc3Npb24pO1xuXHRcdHNlY29uZFdhdGNoLmNhbGwoc2Vjb25kQ29udHJvbGxlciwgc2Vjb25kU2Vzc2lvbiwgc2Vjb25kUmVzcG9uc2UucmVzcG9uc2UpO1xuXHRcdHNlY29uZFJlc3BvbnNlLnBhcnRzLnB1c2goeyBraW5kOiAndm9pY2VQcm9ncmVzcycsIGlkOiAncmVjb3ZlcmluZycsIHZhbHVlOiAnVHJ5aW5nIGFub3RoZXIgYXBwcm9hY2guJyB9KTtcblx0XHRzZWNvbmRSZXNwb25zZS5jaGFuZ2VFbWl0dGVyLmZpcmUoeyByZWFzb246ICdvdGhlcicgfSk7XG5cdFx0c2Vjb25kQ29udHJvbGxlci5kaXNjb25uZWN0KCdleHBsaWNpdCcpO1xuXHRcdGNsb2NrLnRpY2soNV8wMDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjYW5jZWxsZWRSZXF1ZXN0czogZmlyc3RWb2ljZUNsaWVudC5yZXF1ZXN0cyxcblx0XHRcdGRpc2Nvbm5lY3RlZFJlcXVlc3RzOiBzZWNvbmRWb2ljZUNsaWVudC5yZXF1ZXN0cyxcblx0XHR9LCB7XG5cdFx0XHRjYW5jZWxsZWRSZXF1ZXN0czogW10sXG5cdFx0XHRkaXNjb25uZWN0ZWRSZXF1ZXN0czogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYW5zaWVudCBkaXNjb25uZWN0IHJldGFpbnMgdGhlIGxhdGVzdCBwZW5kaW5nIGNoZWNrcG9pbnQgdW50aWwgcmVjb25uZWN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovcmVjb25uZWN0LXByb2dyZXNzJyk7XG5cdFx0Y29uc3QgeyBjaGFuZ2VFbWl0dGVyLCBwYXJ0cywgcmVzcG9uc2UgfSA9IGNyZWF0ZVZvaWNlUHJvZ3Jlc3NSZXNwb25zZSgncmVzcG9uc2UtcmVjb25uZWN0Jyk7XG5cdFx0Y29uc3QgaXNDb25uZWN0ZWQgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2lzQ29ubmVjdGVkJykgYXMgeyBzZXQodmFsdWU6IGJvb2xlYW4sIHR4OiB1bmRlZmluZWQpOiB2b2lkIH07XG5cdFx0Y29uc3Qgd2F0Y2hWb2ljZVByb2dyZXNzID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ193YXRjaFZvaWNlUHJvZ3Jlc3MnKSBhcyAocmVzb3VyY2U6IFVSSSwgcmVzcG9uc2U6IElDaGF0UmVzcG9uc2VNb2RlbCkgPT4gdm9pZDtcblxuXHRcdGlzQ29ubmVjdGVkLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0d2F0Y2hWb2ljZVByb2dyZXNzLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvblJlc291cmNlLCByZXNwb25zZSk7XG5cdFx0cGFydHMucHVzaCh7IGtpbmQ6ICd2b2ljZVByb2dyZXNzJywgaWQ6ICdlZGl0aW5nJywgdmFsdWU6ICdVcGRhdGluZyB0aGUgY29kZS4nIH0pO1xuXHRcdGNoYW5nZUVtaXR0ZXIuZmlyZSh7IHJlYXNvbjogJ290aGVyJyB9KTtcblx0XHRjbG9jay50aWNrKDRfMDAwKTtcblx0XHRpc0Nvbm5lY3RlZC5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0Y2xvY2sudGljaygxXzAwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZvaWNlQ2xpZW50U2VydmljZS5yZXF1ZXN0cy5sZW5ndGgsIDApO1xuXHRcdGlzQ29ubmVjdGVkLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHMubWFwKHJlcXVlc3QgPT4gcmVxdWVzdC5jaGVja3BvaW50KSwgW3tcblx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QtcmVzcG9uc2UtcmVjb25uZWN0Jyxcblx0XHRcdGNoZWNrcG9pbnRJZDogJ2VkaXRpbmcnLFxuXHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIG5ldyB2b2ljZSByZXF1ZXN0IGNhbmNlbHMgb25seSB0aGUgc2hvd24gc2Vzc2lvbiBjaGVja3BvaW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBzaG93blNlc3Npb24gPSBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovc2hvd24tcHJvZ3Jlc3MnKTtcblx0XHRjb25zdCBiYWNrZ3JvdW5kU2Vzc2lvbiA9IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi9iYWNrZ3JvdW5kLXByb2dyZXNzJyk7XG5cdFx0Y29uc3Qgc2hvd25SZXNwb25zZSA9IGNyZWF0ZVZvaWNlUHJvZ3Jlc3NSZXNwb25zZSgncmVzcG9uc2Utc2hvd24nKTtcblx0XHRjb25zdCBiYWNrZ3JvdW5kUmVzcG9uc2UgPSBjcmVhdGVWb2ljZVByb2dyZXNzUmVzcG9uc2UoJ3Jlc3BvbnNlLWJhY2tncm91bmQnKTtcblx0XHRjb25zdCBpc0Nvbm5lY3RlZCA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfaXNDb25uZWN0ZWQnKSBhcyB7IHNldCh2YWx1ZTogYm9vbGVhbiwgdHg6IHVuZGVmaW5lZCk6IHZvaWQgfTtcblx0XHRjb25zdCB3YXRjaFZvaWNlUHJvZ3Jlc3MgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3dhdGNoVm9pY2VQcm9ncmVzcycpIGFzIChyZXNvdXJjZTogVVJJLCByZXNwb25zZTogSUNoYXRSZXNwb25zZU1vZGVsKSA9PiB2b2lkO1xuXG5cdFx0aXNDb25uZWN0ZWQuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0Y29udHJvbGxlci5zZXRBY3RpdmVTZXNzaW9uU2hvd24oc2hvd25TZXNzaW9uKTtcblx0XHR3YXRjaFZvaWNlUHJvZ3Jlc3MuY2FsbChjb250cm9sbGVyLCBzaG93blNlc3Npb24sIHNob3duUmVzcG9uc2UucmVzcG9uc2UpO1xuXHRcdHdhdGNoVm9pY2VQcm9ncmVzcy5jYWxsKGNvbnRyb2xsZXIsIGJhY2tncm91bmRTZXNzaW9uLCBiYWNrZ3JvdW5kUmVzcG9uc2UucmVzcG9uc2UpO1xuXHRcdHNob3duUmVzcG9uc2UucGFydHMucHVzaCh7IGtpbmQ6ICd2b2ljZVByb2dyZXNzJywgaWQ6ICdlZGl0aW5nJywgdmFsdWU6ICdVcGRhdGluZyBzaG93biBjb2RlLicgfSk7XG5cdFx0YmFja2dyb3VuZFJlc3BvbnNlLnBhcnRzLnB1c2goeyBraW5kOiAndm9pY2VQcm9ncmVzcycsIGlkOiAndmFsaWRhdGluZycsIHZhbHVlOiAnVmFsaWRhdGluZyBiYWNrZ3JvdW5kIGNvZGUuJyB9KTtcblx0XHRzaG93blJlc3BvbnNlLmNoYW5nZUVtaXR0ZXIuZmlyZSh7IHJlYXNvbjogJ290aGVyJyB9KTtcblx0XHRiYWNrZ3JvdW5kUmVzcG9uc2UuY2hhbmdlRW1pdHRlci5maXJlKHsgcmVhc29uOiAnb3RoZXInIH0pO1xuXHRcdGNvbnRyb2xsZXIucHR0RG93bignZXhwbGljaXQnKTtcblx0XHRjb250cm9sbGVyLnNldEFjdGl2ZVNlc3Npb25TaG93bihiYWNrZ3JvdW5kU2Vzc2lvbik7XG5cdFx0Y2xvY2sudGljayg1XzAwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZvaWNlQ2xpZW50U2VydmljZS5yZXF1ZXN0cy5tYXAocmVxdWVzdCA9PiByZXF1ZXN0LmNoZWNrcG9pbnQ/LnJlcXVlc3RJZCksIFsncmVxdWVzdC1yZXNwb25zZS1iYWNrZ3JvdW5kJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdiYXJnZS1pbiBhbmQgYSBuZXcgZXhwbGljaXQgdm9pY2UgcmVxdWVzdCBjYW5jZWwgcGVuZGluZyB2b2ljZSBwcm9ncmVzcycsICgpID0+IHtcblx0XHRjb25zdCBiYXJnZVZvaWNlQ2xpZW50ID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBiYXJnZUNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKGJhcmdlVm9pY2VDbGllbnQpO1xuXHRcdGNvbnN0IGJhcmdlU2Vzc2lvbiA9IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi9iYXJnZS1wcm9ncmVzcycpO1xuXHRcdGNvbnN0IGJhcmdlUmVzcG9uc2UgPSBjcmVhdGVWb2ljZVByb2dyZXNzUmVzcG9uc2UoJ3Jlc3BvbnNlLWJhcmdlJyk7XG5cdFx0Y29uc3QgYmFyZ2VDb25uZWN0ZWQgPSBSZWZsZWN0LmdldChiYXJnZUNvbnRyb2xsZXIsICdfaXNDb25uZWN0ZWQnKSBhcyB7IHNldCh2YWx1ZTogYm9vbGVhbiwgdHg6IHVuZGVmaW5lZCk6IHZvaWQgfTtcblx0XHRjb25zdCBiYXJnZVdhdGNoID0gUmVmbGVjdC5nZXQoYmFyZ2VDb250cm9sbGVyLCAnX3dhdGNoVm9pY2VQcm9ncmVzcycpIGFzIChyZXNvdXJjZTogVVJJLCByZXNwb25zZTogSUNoYXRSZXNwb25zZU1vZGVsKSA9PiB2b2lkO1xuXHRcdGNvbnN0IGhhbmRsZUJhcmdlSW4gPSBSZWZsZWN0LmdldChiYXJnZUNvbnRyb2xsZXIsICdfaGFuZGxlQmFyZ2VJbicpIGFzIChldmVudDogSVZvaWNlQmFyZ2VJbikgPT4gdm9pZDtcblxuXHRcdGJhcmdlQ29ubmVjdGVkLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdGJhcmdlQ29udHJvbGxlci5zZXRBY3RpdmVTZXNzaW9uU2hvd24oYmFyZ2VTZXNzaW9uKTtcblx0XHRiYXJnZVdhdGNoLmNhbGwoYmFyZ2VDb250cm9sbGVyLCBiYXJnZVNlc3Npb24sIGJhcmdlUmVzcG9uc2UucmVzcG9uc2UpO1xuXHRcdGJhcmdlUmVzcG9uc2UucGFydHMucHVzaCh7IGtpbmQ6ICd2b2ljZVByb2dyZXNzJywgaWQ6ICdlZGl0aW5nJywgdmFsdWU6ICdVcGRhdGluZyB0aGUgY29kZS4nIH0pO1xuXHRcdGJhcmdlUmVzcG9uc2UuY2hhbmdlRW1pdHRlci5maXJlKHsgcmVhc29uOiAnb3RoZXInIH0pO1xuXHRcdGhhbmRsZUJhcmdlSW4uY2FsbChiYXJnZUNvbnRyb2xsZXIsIHsgdHVybklkOiAnbmV3LXR1cm4nLCBpbnRlcnJ1cHRlZFR1cm5JZDogJ29sZC10dXJuJyB9KTtcblxuXHRcdGNvbnN0IHB0dFZvaWNlQ2xpZW50ID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBwdHRDb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihwdHRWb2ljZUNsaWVudCk7XG5cdFx0Y29uc3QgcHR0U2Vzc2lvbiA9IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi9wdHQtcHJvZ3Jlc3MnKTtcblx0XHRjb25zdCBwdHRSZXNwb25zZSA9IGNyZWF0ZVZvaWNlUHJvZ3Jlc3NSZXNwb25zZSgncmVzcG9uc2UtcHR0Jyk7XG5cdFx0Y29uc3QgcHR0Q29ubmVjdGVkID0gUmVmbGVjdC5nZXQocHR0Q29udHJvbGxlciwgJ19pc0Nvbm5lY3RlZCcpIGFzIHsgc2V0KHZhbHVlOiBib29sZWFuLCB0eDogdW5kZWZpbmVkKTogdm9pZCB9O1xuXHRcdGNvbnN0IHB0dFdhdGNoID0gUmVmbGVjdC5nZXQocHR0Q29udHJvbGxlciwgJ193YXRjaFZvaWNlUHJvZ3Jlc3MnKSBhcyAocmVzb3VyY2U6IFVSSSwgcmVzcG9uc2U6IElDaGF0UmVzcG9uc2VNb2RlbCkgPT4gdm9pZDtcblxuXHRcdHB0dENvbm5lY3RlZC5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRwdHRDb250cm9sbGVyLnNldEFjdGl2ZVNlc3Npb25TaG93bihwdHRTZXNzaW9uKTtcblx0XHRwdHRXYXRjaC5jYWxsKHB0dENvbnRyb2xsZXIsIHB0dFNlc3Npb24sIHB0dFJlc3BvbnNlLnJlc3BvbnNlKTtcblx0XHRwdHRSZXNwb25zZS5wYXJ0cy5wdXNoKHsga2luZDogJ3ZvaWNlUHJvZ3Jlc3MnLCBpZDogJ3ZhbGlkYXRpbmcnLCB2YWx1ZTogJ1ZhbGlkYXRpbmcgdGhlIGNoYW5nZXMuJyB9KTtcblx0XHRwdHRSZXNwb25zZS5jaGFuZ2VFbWl0dGVyLmZpcmUoeyByZWFzb246ICdvdGhlcicgfSk7XG5cdFx0cHR0Q29udHJvbGxlci5wdHREb3duKCdleHBsaWNpdCcpO1xuXHRcdGNsb2NrLnRpY2soNV8wMDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiYXJnZVJlcXVlc3RzOiBiYXJnZVZvaWNlQ2xpZW50LnJlcXVlc3RzLFxuXHRcdFx0cHR0UmVxdWVzdHM6IHB0dFZvaWNlQ2xpZW50LnJlcXVlc3RzLFxuXHRcdH0sIHtcblx0XHRcdGJhcmdlUmVxdWVzdHM6IFtdLFxuXHRcdFx0cHR0UmVxdWVzdHM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidXN5LCBpbnZhbGlkLCBhbmQgbGVnYWN5IHN1cHByZXNzZWQgY2hlY2twb2ludHMgYXJlIG5ldmVyIHJldHJpZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zaXRpb25zID0gWydidXN5JywgJ2ludmFsaWQnLCAnc3VwcHJlc3NlZCddIGFzIGNvbnN0O1xuXHRcdGNvbnN0IHJlc3VsdHM6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZGlzcG9zaXRpb24gb2YgZGlzcG9zaXRpb25zKSB7XG5cdFx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHNlc3Npb25JZCA9IGBjaGF0LXNlc3Npb246LyR7ZGlzcG9zaXRpb259YDtcblx0XHRcdGNvbnN0IG5hcnJhdGUgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX25hcnJhdGUnKSBhcyAoc2Vzc2lvbklkOiBzdHJpbmcsIGtpbmQ6IFZvaWNlTmFycmF0aW9uS2luZCwgdGV4dDogc3RyaW5nLCByZXVzZUlkPzogc3RyaW5nLCBjaGVja3BvaW50PzogSVZvaWNlQ2hlY2twb2ludE5hcnJhdGlvbk1ldGFkYXRhKSA9PiBib29sZWFuO1xuXHRcdFx0Y29uc3QgaGFuZGxlQWNrID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19oYW5kbGVOYXJyYXRpb25BY2snKSBhcyAoZXZlbnQ6IElWb2ljZU5hcnJhdGlvbkFjaykgPT4gdm9pZDtcblx0XHRcdGNvbnN0IHJldHJ5RGVmZXJyZWQgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3JldHJ5RGVmZXJyZWROYXJyYXRpb24nKSBhcyAoc2Vzc2lvbktleTogc3RyaW5nLCBuYXJyYXRpb25JZD86IHN0cmluZykgPT4gYm9vbGVhbjtcblx0XHRcdGNvbnN0IHNlc3Npb25LZXkgPSAoUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19zZXNzaW9uS2V5JykgYXMgKHNlc3Npb25JZDogc3RyaW5nKSA9PiBzdHJpbmcpLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvbklkKTtcblxuXHRcdFx0bmFycmF0ZS5jYWxsKGNvbnRyb2xsZXIsIHNlc3Npb25JZCwgJ2NoZWNrcG9pbnQnLCAnVXBkYXRpbmcgdGhlIGNvZGUuJywgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdHJlcXVlc3RJZDogYHJlcXVlc3QtJHtkaXNwb3NpdGlvbn1gLFxuXHRcdFx0XHRjaGVja3BvaW50SWQ6ICdlZGl0aW5nJyxcblx0XHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHNbMF07XG5cdFx0XHRoYW5kbGVBY2suY2FsbChjb250cm9sbGVyLCB7XG5cdFx0XHRcdG5hcnJhdGlvbklkOiByZXF1ZXN0Lm5hcnJhdGlvbklkLFxuXHRcdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdFx0ZGlzcG9zaXRpb24sXG5cdFx0XHR9KTtcblx0XHRcdHJlc3VsdHMucHVzaChyZXRyeURlZmVycmVkLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvbktleSwgcmVxdWVzdC5uYXJyYXRpb25JZCkpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0cywgW2ZhbHNlLCBmYWxzZSwgZmFsc2VdKTtcblx0fSk7XG5cblx0dGVzdCgnYWN0aXZlIGNoZWNrcG9pbnQgcGxheWJhY2sgaXMgcHJlZW1wdGVkIHdoZW4gZmluYWwgcmVzcG9uc2UgYXVkaW8gc3RhcnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdHRzUGxheWJhY2tTZXJ2aWNlID0gbmV3IFRlc3RUdHNQbGF5YmFja1NlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHR0c1BsYXliYWNrU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ2NoYXQtc2Vzc2lvbjovY2hlY2twb2ludC1maW5hbCc7XG5cdFx0Y29uc3QgbmFycmF0ZSA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfbmFycmF0ZScpIGFzIChzZXNzaW9uSWQ6IHN0cmluZywga2luZDogVm9pY2VOYXJyYXRpb25LaW5kLCB0ZXh0OiBzdHJpbmcsIHJldXNlSWQ/OiBzdHJpbmcsIGNoZWNrcG9pbnQ/OiBJVm9pY2VDaGVja3BvaW50TmFycmF0aW9uTWV0YWRhdGEpID0+IGJvb2xlYW47XG5cdFx0YXdhaXQgY29udHJvbGxlci5jb25uZWN0KG1haW5XaW5kb3cpO1xuXHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKFVSSS5wYXJzZShzZXNzaW9uSWQpKTtcblxuXHRcdG5hcnJhdGUuY2FsbChjb250cm9sbGVyLCBzZXNzaW9uSWQsICdjaGVja3BvaW50JywgJ1VwZGF0aW5nIHRoZSBjb2RlLicsIHVuZGVmaW5lZCwge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxdWVzdC0xJyxcblx0XHRcdGNoZWNrcG9pbnRJZDogJ2VkaXRpbmcnLFxuXHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hlY2twb2ludElkID0gdm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzWzBdLm5hcnJhdGlvbklkO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJ2NoZWNrcG9pbnQnLFxuXHRcdFx0aXNGaXJzdENodW5rOiB0cnVlLFxuXHRcdFx0aXNGaW5hbDogZmFsc2UsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdHJlc3BvbnNlSWQ6IGNoZWNrcG9pbnRJZCxcblx0XHR9KTtcblx0XHRuYXJyYXRlLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvbklkLCAncmVzcG9uc2UnLCAnRXZlcnl0aGluZyBpcyBjb21wbGV0ZS4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHRzUGxheWJhY2tTZXJ2aWNlLnN0b3BDb3VudCwgMCk7XG5cdFx0Y29uc3QgZmluYWxJZCA9IHZvaWNlQ2xpZW50U2VydmljZS5yZXF1ZXN0c1sxXS5uYXJyYXRpb25JZDtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICdmaW5hbCcsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiB0cnVlLFxuXHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBzZXNzaW9uSWQsXG5cdFx0XHRyZXNwb25zZUlkOiBmaW5hbElkLFxuXHRcdH0pO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJ3N0YWxlLWNoZWNrcG9pbnQnLFxuXHRcdFx0aXNGaXJzdENodW5rOiBmYWxzZSxcblx0XHRcdGlzRmluYWw6IHRydWUsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdHJlc3BvbnNlSWQ6IGNoZWNrcG9pbnRJZCxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RvcENvdW50OiB0dHNQbGF5YmFja1NlcnZpY2Uuc3RvcENvdW50LFxuXHRcdFx0cGxheWVkQXVkaW86IHR0c1BsYXliYWNrU2VydmljZS5wbGF5ZWRBdWRpbyxcblx0XHRcdHBsYXliYWNrQ29tcGxldGlvbnM6IHZvaWNlQ2xpZW50U2VydmljZS5wbGF5YmFja0NvbXBsZXRpb25zLFxuXHRcdH0sIHtcblx0XHRcdHN0b3BDb3VudDogMSxcblx0XHRcdHBsYXllZEF1ZGlvOiBbJ2NoZWNrcG9pbnQnLCAnZmluYWwnXSxcblx0XHRcdHBsYXliYWNrQ29tcGxldGlvbnM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbXB0eSBmaW5hbCByZXNwb25zZSBkb2VzIG5vdCBwcmVlbXB0IGFjdGl2ZSBjaGVja3BvaW50IHBsYXliYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdHRzUGxheWJhY2tTZXJ2aWNlID0gbmV3IFRlc3RUdHNQbGF5YmFja1NlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHR0c1BsYXliYWNrU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ2NoYXQtc2Vzc2lvbjovY2hlY2twb2ludC1lbXB0eS1yZXNwb25zZSc7XG5cdFx0Y29uc3QgbmFycmF0ZSA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfbmFycmF0ZScpIGFzIChzZXNzaW9uSWQ6IHN0cmluZywga2luZDogVm9pY2VOYXJyYXRpb25LaW5kLCB0ZXh0OiBzdHJpbmcsIHJldXNlSWQ/OiBzdHJpbmcsIGNoZWNrcG9pbnQ/OiBJVm9pY2VDaGVja3BvaW50TmFycmF0aW9uTWV0YWRhdGEpID0+IGJvb2xlYW47XG5cdFx0YXdhaXQgY29udHJvbGxlci5jb25uZWN0KG1haW5XaW5kb3cpO1xuXHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKFVSSS5wYXJzZShzZXNzaW9uSWQpKTtcblxuXHRcdG5hcnJhdGUuY2FsbChjb250cm9sbGVyLCBzZXNzaW9uSWQsICdjaGVja3BvaW50JywgJ1VwZGF0aW5nIHRoZSBjb2RlLicsIHVuZGVmaW5lZCwge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxdWVzdC0xJyxcblx0XHRcdGNoZWNrcG9pbnRJZDogJ2VkaXRpbmcnLFxuXHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hlY2twb2ludElkID0gdm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzWzBdLm5hcnJhdGlvbklkO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJ2NoZWNrcG9pbnQnLFxuXHRcdFx0aXNGaXJzdENodW5rOiB0cnVlLFxuXHRcdFx0aXNGaW5hbDogZmFsc2UsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdHJlc3BvbnNlSWQ6IGNoZWNrcG9pbnRJZCxcblx0XHR9KTtcblx0XHRuYXJyYXRlLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvbklkLCAncmVzcG9uc2UnLCAnUHJvZ3Jlc3Mtb25seSBmaW5hbCBzdW1tYXJ5LicpO1xuXHRcdGNvbnN0IHJlc3BvbnNlSWQgPSB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHNbMV0ubmFycmF0aW9uSWQ7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVBdWRpb1Jlc3BvbnNlKHtcblx0XHRcdGF1ZGlvOiAnJyxcblx0XHRcdGlzRmlyc3RDaHVuazogdHJ1ZSxcblx0XHRcdGlzRmluYWw6IHRydWUsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdHJlc3BvbnNlSWQsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0b3BDb3VudDogdHRzUGxheWJhY2tTZXJ2aWNlLnN0b3BDb3VudCxcblx0XHRcdHBsYXllZEF1ZGlvOiB0dHNQbGF5YmFja1NlcnZpY2UucGxheWVkQXVkaW8sXG5cdFx0XHRpc1BsYXlpbmc6IHR0c1BsYXliYWNrU2VydmljZS5pc1BsYXlpbmcsXG5cdFx0fSwge1xuXHRcdFx0c3RvcENvdW50OiAwLFxuXHRcdFx0cGxheWVkQXVkaW86IFsnY2hlY2twb2ludCddLFxuXHRcdFx0aXNQbGF5aW5nOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wbGV0ZWQgY2hlY2twb2ludCBwbGF5YmFjayBhY2tub3dsZWRnZXMgdGhlIGNvcnJlbGF0ZWQgcGxheWJhY2sgaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCB0dHNQbGF5YmFja1NlcnZpY2UgPSBuZXcgVGVzdFR0c1BsYXliYWNrU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHZvaWNlQ2xpZW50U2VydmljZSwgdHRzUGxheWJhY2tTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSAnY2hhdC1zZXNzaW9uOi9jaGVja3BvaW50LWNvbXBsZXRlJztcblx0XHRjb25zdCBuYXJyYXRlID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19uYXJyYXRlJykgYXMgKHNlc3Npb25JZDogc3RyaW5nLCBraW5kOiBWb2ljZU5hcnJhdGlvbktpbmQsIHRleHQ6IHN0cmluZywgcmV1c2VJZD86IHN0cmluZywgY2hlY2twb2ludD86IElWb2ljZUNoZWNrcG9pbnROYXJyYXRpb25NZXRhZGF0YSkgPT4gYm9vbGVhbjtcblx0XHRhd2FpdCBjb250cm9sbGVyLmNvbm5lY3QobWFpbldpbmRvdyk7XG5cdFx0Y29udHJvbGxlci5zZXRBY3RpdmVTZXNzaW9uU2hvd24oVVJJLnBhcnNlKHNlc3Npb25JZCkpO1xuXG5cdFx0bmFycmF0ZS5jYWxsKGNvbnRyb2xsZXIsIHNlc3Npb25JZCwgJ2NoZWNrcG9pbnQnLCAnVXBkYXRpbmcgdGhlIGNvZGUuJywgdW5kZWZpbmVkLCB7XG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXF1ZXN0LTEnLFxuXHRcdFx0Y2hlY2twb2ludElkOiAnZWRpdGluZycsXG5cdFx0XHRzZXF1ZW5jZTogMSxcblx0XHR9KTtcblx0XHRjb25zdCBuYXJyYXRpb25JZCA9IHZvaWNlQ2xpZW50U2VydmljZS5yZXF1ZXN0c1swXS5uYXJyYXRpb25JZDtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICdjaGVja3BvaW50Jyxcblx0XHRcdGlzRmlyc3RDaHVuazogdHJ1ZSxcblx0XHRcdGlzRmluYWw6IHRydWUsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdHJlc3BvbnNlSWQ6IG5hcnJhdGlvbklkLFxuXHRcdFx0cmVxdWVzdElkOiAncmVxdWVzdC0xJyxcblx0XHRcdGNoZWNrcG9pbnRJZDogJ2VkaXRpbmcnLFxuXHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0XHRuYXJyYXRpb25LaW5kOiAnY2hlY2twb2ludCcsXG5cdFx0XHRwbGF5YmFja0lkOiAncGxheWJhY2stMScsXG5cdFx0fSk7XG5cdFx0dHRzUGxheWJhY2tTZXJ2aWNlLnN0b3BQbGF5YmFjaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2b2ljZUNsaWVudFNlcnZpY2UucGxheWJhY2tDb21wbGV0aW9ucywgW3tcblx0XHRcdHNlc3Npb25JZCxcblx0XHRcdG5hcnJhdGlvbklkLFxuXHRcdFx0cGxheWJhY2tJZDogJ3BsYXliYWNrLTEnLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZHJvcHBlZCByZS1uYXJyYXRpb24gZG9lcyBub3QgcHJlZW1wdCBhY3RpdmUgY2hlY2twb2ludCBwbGF5YmFjaycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IHR0c1BsYXliYWNrU2VydmljZSA9IG5ldyBUZXN0VHRzUGxheWJhY2tTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlLCB0dHNQbGF5YmFja1NlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICdjaGF0LXNlc3Npb246L2NoZWNrcG9pbnQtcmVyZWFkJztcblx0XHRjb25zdCBuYXJyYXRlID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19uYXJyYXRlJykgYXMgKHNlc3Npb25JZDogc3RyaW5nLCBraW5kOiBWb2ljZU5hcnJhdGlvbktpbmQsIHRleHQ6IHN0cmluZywgcmV1c2VJZD86IHN0cmluZywgY2hlY2twb2ludD86IElWb2ljZUNoZWNrcG9pbnROYXJyYXRpb25NZXRhZGF0YSkgPT4gYm9vbGVhbjtcblx0XHRjb25zdCByZWNlbnRseVJlYWQgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3JlY2VudGx5UmVhZFJlc3BvbnNlJykgYXMgTWFwPHN0cmluZywgeyB0cmFuc2NyaXB0OiBzdHJpbmc7IGF0OiBudW1iZXIgfT47XG5cdFx0YXdhaXQgY29udHJvbGxlci5jb25uZWN0KG1haW5XaW5kb3cpO1xuXHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKFVSSS5wYXJzZShzZXNzaW9uSWQpKTtcblxuXHRcdG5hcnJhdGUuY2FsbChjb250cm9sbGVyLCBzZXNzaW9uSWQsICdjaGVja3BvaW50JywgJ1VwZGF0aW5nIHRoZSBjb2RlLicsIHVuZGVmaW5lZCwge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxdWVzdC0xJyxcblx0XHRcdGNoZWNrcG9pbnRJZDogJ2VkaXRpbmcnLFxuXHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hlY2twb2ludElkID0gdm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzWzBdLm5hcnJhdGlvbklkO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJ2NoZWNrcG9pbnQnLFxuXHRcdFx0aXNGaXJzdENodW5rOiB0cnVlLFxuXHRcdFx0aXNGaW5hbDogZmFsc2UsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdHJlc3BvbnNlSWQ6IGNoZWNrcG9pbnRJZCxcblx0XHR9KTtcblx0XHRyZWNlbnRseVJlYWQuc2V0KHNlc3Npb25JZCwgeyB0cmFuc2NyaXB0OiAnYWxyZWFkeSBoZWFyZCcsIGF0OiBEYXRlLm5vdygpIH0pO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJ2R1cGxpY2F0ZScsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiB0cnVlLFxuXHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBzZXNzaW9uSWQsXG5cdFx0XHRyZXNwb25zZUlkOiAnZHVwbGljYXRlLXJlc3BvbnNlJyxcblx0XHRcdHRyYW5zY3JpcHQ6ICdBbHJlYWR5IGhlYXJkLicsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0b3BDb3VudDogdHRzUGxheWJhY2tTZXJ2aWNlLnN0b3BDb3VudCxcblx0XHRcdHBsYXllZEF1ZGlvOiB0dHNQbGF5YmFja1NlcnZpY2UucGxheWVkQXVkaW8sXG5cdFx0fSwge1xuXHRcdFx0c3RvcENvdW50OiAwLFxuXHRcdFx0cGxheWVkQXVkaW86IFsnY2hlY2twb2ludCddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhY3RpdmUgY2hlY2twb2ludCBwbGF5YmFjayBpcyBwcmVlbXB0ZWQgYnkgY29uZmlybWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdHRzUGxheWJhY2tTZXJ2aWNlID0gbmV3IFRlc3RUdHNQbGF5YmFja1NlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHR0c1BsYXliYWNrU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ2NoYXQtc2Vzc2lvbjovY2hlY2twb2ludC1jb25maXJtYXRpb24nO1xuXHRcdGNvbnN0IG5hcnJhdGUgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX25hcnJhdGUnKSBhcyAoc2Vzc2lvbklkOiBzdHJpbmcsIGtpbmQ6IFZvaWNlTmFycmF0aW9uS2luZCwgdGV4dDogc3RyaW5nLCByZXVzZUlkPzogc3RyaW5nLCBjaGVja3BvaW50PzogSVZvaWNlQ2hlY2twb2ludE5hcnJhdGlvbk1ldGFkYXRhKSA9PiBib29sZWFuO1xuXHRcdGF3YWl0IGNvbnRyb2xsZXIuY29ubmVjdChtYWluV2luZG93KTtcblx0XHRjb250cm9sbGVyLnNldEFjdGl2ZVNlc3Npb25TaG93bihVUkkucGFyc2Uoc2Vzc2lvbklkKSk7XG5cblx0XHRuYXJyYXRlLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvbklkLCAnY2hlY2twb2ludCcsICdWYWxpZGF0aW5nIHRoZSBjaGFuZ2VzLicsIHVuZGVmaW5lZCwge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxdWVzdC0xJyxcblx0XHRcdGNoZWNrcG9pbnRJZDogJ3ZhbGlkYXRpbmcnLFxuXHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hlY2twb2ludElkID0gdm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzWzBdLm5hcnJhdGlvbklkO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJ2NoZWNrcG9pbnQnLFxuXHRcdFx0aXNGaXJzdENodW5rOiB0cnVlLFxuXHRcdFx0aXNGaW5hbDogZmFsc2UsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdHJlc3BvbnNlSWQ6IGNoZWNrcG9pbnRJZCxcblx0XHR9KTtcblx0XHRuYXJyYXRlLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvbklkLCAnY29uZmlybWF0aW9uJywgJ0FwcHJvdmUgdGhlIGNvbW1hbmQuJyk7XG5cdFx0Y29uc3QgY29uZmlybWF0aW9uSWQgPSB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHNbMV0ubmFycmF0aW9uSWQ7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVBdWRpb1Jlc3BvbnNlKHtcblx0XHRcdGF1ZGlvOiAnY29uZmlybWF0aW9uJyxcblx0XHRcdGlzRmlyc3RDaHVuazogdHJ1ZSxcblx0XHRcdGlzRmluYWw6IHRydWUsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdHJlc3BvbnNlSWQ6IGNvbmZpcm1hdGlvbklkLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdG9wQ291bnQ6IHR0c1BsYXliYWNrU2VydmljZS5zdG9wQ291bnQsXG5cdFx0XHRwbGF5ZWRBdWRpbzogdHRzUGxheWJhY2tTZXJ2aWNlLnBsYXllZEF1ZGlvLFxuXHRcdH0sIHtcblx0XHRcdHN0b3BDb3VudDogMSxcblx0XHRcdHBsYXllZEF1ZGlvOiBbJ2NoZWNrcG9pbnQnLCAnY29uZmlybWF0aW9uJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RpcmVjdCBzdWJzdGFudGl2ZSBhdWRpbyBwcmVlbXB0cyBhY3RpdmUgY2hlY2twb2ludCBwbGF5YmFjaycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IHR0c1BsYXliYWNrU2VydmljZSA9IG5ldyBUZXN0VHRzUGxheWJhY2tTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlLCB0dHNQbGF5YmFja1NlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICdjaGF0LXNlc3Npb246L2NoZWNrcG9pbnQtZGlyZWN0LXJlcGx5Jztcblx0XHRjb25zdCBuYXJyYXRlID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19uYXJyYXRlJykgYXMgKHNlc3Npb25JZDogc3RyaW5nLCBraW5kOiBWb2ljZU5hcnJhdGlvbktpbmQsIHRleHQ6IHN0cmluZywgcmV1c2VJZD86IHN0cmluZywgY2hlY2twb2ludD86IElWb2ljZUNoZWNrcG9pbnROYXJyYXRpb25NZXRhZGF0YSkgPT4gYm9vbGVhbjtcblx0XHRhd2FpdCBjb250cm9sbGVyLmNvbm5lY3QobWFpbldpbmRvdyk7XG5cdFx0Y29udHJvbGxlci5zZXRBY3RpdmVTZXNzaW9uU2hvd24oVVJJLnBhcnNlKHNlc3Npb25JZCkpO1xuXG5cdFx0bmFycmF0ZS5jYWxsKGNvbnRyb2xsZXIsIHNlc3Npb25JZCwgJ2NoZWNrcG9pbnQnLCAnVXBkYXRpbmcgdGhlIGNvZGUuJywgdW5kZWZpbmVkLCB7XG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXF1ZXN0LTEnLFxuXHRcdFx0Y2hlY2twb2ludElkOiAnZWRpdGluZycsXG5cdFx0XHRzZXF1ZW5jZTogMSxcblx0XHR9KTtcblx0XHRjb25zdCBjaGVja3BvaW50SWQgPSB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHNbMF0ubmFycmF0aW9uSWQ7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVBdWRpb1Jlc3BvbnNlKHtcblx0XHRcdGF1ZGlvOiAnY2hlY2twb2ludCcsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiBmYWxzZSxcblx0XHRcdGNvZGluZ1Nlc3Npb25JZDogc2Vzc2lvbklkLFxuXHRcdFx0cmVzcG9uc2VJZDogY2hlY2twb2ludElkLFxuXHRcdH0pO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJ2RpcmVjdC1yZXBseScsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiB0cnVlLFxuXHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBzZXNzaW9uSWQsXG5cdFx0XHRyZXNwb25zZUlkOiAnZGlyZWN0LXJlc3BvbnNlJyxcblx0XHRcdHRyYW5zY3JpcHQ6ICdIZXJlIGlzIHRoZSBzdWJzdGFudGl2ZSByZXN1bHQuJyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RvcENvdW50OiB0dHNQbGF5YmFja1NlcnZpY2Uuc3RvcENvdW50LFxuXHRcdFx0cGxheWVkQXVkaW86IHR0c1BsYXliYWNrU2VydmljZS5wbGF5ZWRBdWRpbyxcblx0XHR9LCB7XG5cdFx0XHRzdG9wQ291bnQ6IDEsXG5cdFx0XHRwbGF5ZWRBdWRpbzogWydjaGVja3BvaW50JywgJ2RpcmVjdC1yZXBseSddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcm9zcy1zZXNzaW9uIHN1YnN0YW50aXZlIGF1ZGlvIHByZWVtcHRzIGFjdGl2ZSBjaGVja3BvaW50IHBsYXliYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdHRzUGxheWJhY2tTZXJ2aWNlID0gbmV3IFRlc3RUdHNQbGF5YmFja1NlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHR0c1BsYXliYWNrU2VydmljZSk7XG5cdFx0Y29uc3QgY2hlY2twb2ludFNlc3Npb25JZCA9ICdjaGF0LXNlc3Npb246L2NoZWNrcG9pbnQtYmFja2dyb3VuZCc7XG5cdFx0Y29uc3QgcmVzcG9uc2VTZXNzaW9uSWQgPSAnY2hhdC1zZXNzaW9uOi9yZXNwb25zZS1mb3JlZ3JvdW5kJztcblx0XHRjb25zdCBuYXJyYXRlID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19uYXJyYXRlJykgYXMgKHNlc3Npb25JZDogc3RyaW5nLCBraW5kOiBWb2ljZU5hcnJhdGlvbktpbmQsIHRleHQ6IHN0cmluZywgcmV1c2VJZD86IHN0cmluZywgY2hlY2twb2ludD86IElWb2ljZUNoZWNrcG9pbnROYXJyYXRpb25NZXRhZGF0YSkgPT4gYm9vbGVhbjtcblx0XHRhd2FpdCBjb250cm9sbGVyLmNvbm5lY3QobWFpbldpbmRvdyk7XG5cdFx0Y29udHJvbGxlci5zZXRBY3RpdmVTZXNzaW9uU2hvd24oVVJJLnBhcnNlKGNoZWNrcG9pbnRTZXNzaW9uSWQpKTtcblxuXHRcdG5hcnJhdGUuY2FsbChjb250cm9sbGVyLCBjaGVja3BvaW50U2Vzc2lvbklkLCAnY2hlY2twb2ludCcsICdVcGRhdGluZyB0aGUgY29kZS4nLCB1bmRlZmluZWQsIHtcblx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QtMScsXG5cdFx0XHRjaGVja3BvaW50SWQ6ICdlZGl0aW5nJyxcblx0XHRcdHNlcXVlbmNlOiAxLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNoZWNrcG9pbnRJZCA9IHZvaWNlQ2xpZW50U2VydmljZS5yZXF1ZXN0c1swXS5uYXJyYXRpb25JZDtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICdjaGVja3BvaW50Jyxcblx0XHRcdGlzRmlyc3RDaHVuazogdHJ1ZSxcblx0XHRcdGlzRmluYWw6IGZhbHNlLFxuXHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBjaGVja3BvaW50U2Vzc2lvbklkLFxuXHRcdFx0cmVzcG9uc2VJZDogY2hlY2twb2ludElkLFxuXHRcdH0pO1xuXHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKFVSSS5wYXJzZShyZXNwb25zZVNlc3Npb25JZCkpO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJ3N1YnN0YW50aXZlLXJlc3BvbnNlJyxcblx0XHRcdGlzRmlyc3RDaHVuazogdHJ1ZSxcblx0XHRcdGlzRmluYWw6IHRydWUsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHJlc3BvbnNlU2Vzc2lvbklkLFxuXHRcdFx0cmVzcG9uc2VJZDogJ2RpcmVjdC1yZXNwb25zZScsXG5cdFx0XHR0cmFuc2NyaXB0OiAnVGhlIGZvcmVncm91bmQgdGFzayBpcyBjb21wbGV0ZS4nLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdG9wQ291bnQ6IHR0c1BsYXliYWNrU2VydmljZS5zdG9wQ291bnQsXG5cdFx0XHRwbGF5ZWRBdWRpbzogdHRzUGxheWJhY2tTZXJ2aWNlLnBsYXllZEF1ZGlvLFxuXHRcdH0sIHtcblx0XHRcdHN0b3BDb3VudDogMSxcblx0XHRcdHBsYXllZEF1ZGlvOiBbJ2NoZWNrcG9pbnQnLCAnc3Vic3RhbnRpdmUtcmVzcG9uc2UnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbmV3ZXIgY2hlY2twb2ludCBwcmVlbXB0cyBhY3RpdmUgb2xkZXIgY2hlY2twb2ludCBhbmQgZGlzY2FyZHMgc3RhbGUgY2h1bmtzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdHRzUGxheWJhY2tTZXJ2aWNlID0gbmV3IFRlc3RUdHNQbGF5YmFja1NlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHR0c1BsYXliYWNrU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ2NoYXQtc2Vzc2lvbjovY2hlY2twb2ludC1yZXBsYWNlbWVudCc7XG5cdFx0Y29uc3QgbmFycmF0ZSA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfbmFycmF0ZScpIGFzIChzZXNzaW9uSWQ6IHN0cmluZywga2luZDogVm9pY2VOYXJyYXRpb25LaW5kLCB0ZXh0OiBzdHJpbmcsIHJldXNlSWQ/OiBzdHJpbmcsIGNoZWNrcG9pbnQ/OiBJVm9pY2VDaGVja3BvaW50TmFycmF0aW9uTWV0YWRhdGEpID0+IGJvb2xlYW47XG5cdFx0YXdhaXQgY29udHJvbGxlci5jb25uZWN0KG1haW5XaW5kb3cpO1xuXHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKFVSSS5wYXJzZShzZXNzaW9uSWQpKTtcblxuXHRcdG5hcnJhdGUuY2FsbChjb250cm9sbGVyLCBzZXNzaW9uSWQsICdjaGVja3BvaW50JywgJ1VwZGF0aW5nIHRoZSBjb2RlLicsIHVuZGVmaW5lZCwge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxdWVzdC0xJyxcblx0XHRcdGNoZWNrcG9pbnRJZDogJ2VkaXRpbmcnLFxuXHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZmlyc3RJZCA9IHZvaWNlQ2xpZW50U2VydmljZS5yZXF1ZXN0c1swXS5uYXJyYXRpb25JZDtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICdlZGl0aW5nJyxcblx0XHRcdGlzRmlyc3RDaHVuazogdHJ1ZSxcblx0XHRcdGlzRmluYWw6IGZhbHNlLFxuXHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBzZXNzaW9uSWQsXG5cdFx0XHRyZXNwb25zZUlkOiBmaXJzdElkLFxuXHRcdH0pO1xuXHRcdG5hcnJhdGUuY2FsbChjb250cm9sbGVyLCBzZXNzaW9uSWQsICdjaGVja3BvaW50JywgJ1ZhbGlkYXRpbmcgdGhlIHJlc3VsdC4nLCB1bmRlZmluZWQsIHtcblx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QtMScsXG5cdFx0XHRjaGVja3BvaW50SWQ6ICd2YWxpZGF0aW5nJyxcblx0XHRcdHNlcXVlbmNlOiAyLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlY29uZElkID0gdm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzWzFdLm5hcnJhdGlvbklkO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJ3N0YWxlLWVkaXRpbmcnLFxuXHRcdFx0aXNGaXJzdENodW5rOiBmYWxzZSxcblx0XHRcdGlzRmluYWw6IHRydWUsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdHJlc3BvbnNlSWQ6IGZpcnN0SWQsXG5cdFx0fSk7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVBdWRpb1Jlc3BvbnNlKHtcblx0XHRcdGF1ZGlvOiAndmFsaWRhdGluZycsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiB0cnVlLFxuXHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBzZXNzaW9uSWQsXG5cdFx0XHRyZXNwb25zZUlkOiBzZWNvbmRJZCxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHRzUGxheWJhY2tTZXJ2aWNlLnBsYXllZEF1ZGlvLCBbJ2VkaXRpbmcnLCAndmFsaWRhdGluZyddKTtcblx0fSk7XG5cblx0dGVzdCgnY3Jvc3Mtc2Vzc2lvbiBjaGVja3BvaW50IHJlcGxhY2VzIGFjdGl2ZSBjaGVja3BvaW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdHRzUGxheWJhY2tTZXJ2aWNlID0gbmV3IFRlc3RUdHNQbGF5YmFja1NlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHR0c1BsYXliYWNrU2VydmljZSk7XG5cdFx0Y29uc3QgZmlyc3RTZXNzaW9uSWQgPSAnY2hhdC1zZXNzaW9uOi9jaGVja3BvaW50LWZpcnN0LXNlc3Npb24nO1xuXHRcdGNvbnN0IHNlY29uZFNlc3Npb25JZCA9ICdjaGF0LXNlc3Npb246L2NoZWNrcG9pbnQtc2Vjb25kLXNlc3Npb24nO1xuXHRcdGNvbnN0IG5hcnJhdGUgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX25hcnJhdGUnKSBhcyAoc2Vzc2lvbklkOiBzdHJpbmcsIGtpbmQ6IFZvaWNlTmFycmF0aW9uS2luZCwgdGV4dDogc3RyaW5nLCByZXVzZUlkPzogc3RyaW5nLCBjaGVja3BvaW50PzogSVZvaWNlQ2hlY2twb2ludE5hcnJhdGlvbk1ldGFkYXRhKSA9PiBib29sZWFuO1xuXHRcdGF3YWl0IGNvbnRyb2xsZXIuY29ubmVjdChtYWluV2luZG93KTtcblx0XHRjb250cm9sbGVyLnNldEFjdGl2ZVNlc3Npb25TaG93bihVUkkucGFyc2UoZmlyc3RTZXNzaW9uSWQpKTtcblxuXHRcdG5hcnJhdGUuY2FsbChjb250cm9sbGVyLCBmaXJzdFNlc3Npb25JZCwgJ2NoZWNrcG9pbnQnLCAnVXBkYXRpbmcgdGhlIGZpcnN0IHRhc2suJywgdW5kZWZpbmVkLCB7XG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXF1ZXN0LTEnLFxuXHRcdFx0Y2hlY2twb2ludElkOiAnZWRpdGluZycsXG5cdFx0XHRzZXF1ZW5jZTogMSxcblx0XHR9KTtcblx0XHRjb25zdCBmaXJzdElkID0gdm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzWzBdLm5hcnJhdGlvbklkO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJ2ZpcnN0LWNoZWNrcG9pbnQnLFxuXHRcdFx0aXNGaXJzdENodW5rOiB0cnVlLFxuXHRcdFx0aXNGaW5hbDogZmFsc2UsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IGZpcnN0U2Vzc2lvbklkLFxuXHRcdFx0cmVzcG9uc2VJZDogZmlyc3RJZCxcblx0XHR9KTtcblx0XHRuYXJyYXRlLmNhbGwoY29udHJvbGxlciwgc2Vjb25kU2Vzc2lvbklkLCAnY2hlY2twb2ludCcsICdWYWxpZGF0aW5nIHRoZSBzZWNvbmQgdGFzay4nLCB1bmRlZmluZWQsIHtcblx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QtMicsXG5cdFx0XHRjaGVja3BvaW50SWQ6ICd2YWxpZGF0aW5nJyxcblx0XHRcdHNlcXVlbmNlOiAxLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlY29uZElkID0gdm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzWzFdLm5hcnJhdGlvbklkO1xuXHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKFVSSS5wYXJzZShzZWNvbmRTZXNzaW9uSWQpKTtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICdzZWNvbmQtY2hlY2twb2ludCcsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiB0cnVlLFxuXHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBzZWNvbmRTZXNzaW9uSWQsXG5cdFx0XHRyZXNwb25zZUlkOiBzZWNvbmRJZCxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RvcENvdW50OiB0dHNQbGF5YmFja1NlcnZpY2Uuc3RvcENvdW50LFxuXHRcdFx0cGxheWVkQXVkaW86IHR0c1BsYXliYWNrU2VydmljZS5wbGF5ZWRBdWRpbyxcblx0XHR9LCB7XG5cdFx0XHRzdG9wQ291bnQ6IDEsXG5cdFx0XHRwbGF5ZWRBdWRpbzogWydmaXJzdC1jaGVja3BvaW50JywgJ3NlY29uZC1jaGVja3BvaW50J10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZS1kZWNvZGUgY2hlY2twb2ludCBwcmVlbXB0aW9uIGRvZXMgbm90IHBvaXNvbiByZXBsYWNlbWVudCBjb21wbGV0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdHRzUGxheWJhY2tTZXJ2aWNlID0gbmV3IERlZmVycmVkRmlyc3RUdHNQbGF5YmFja1NlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHR0c1BsYXliYWNrU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ2NoYXQtc2Vzc2lvbjovY2hlY2twb2ludC1wcmVkZWNvZGUnO1xuXHRcdGNvbnN0IG5hcnJhdGUgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX25hcnJhdGUnKSBhcyAoc2Vzc2lvbklkOiBzdHJpbmcsIGtpbmQ6IFZvaWNlTmFycmF0aW9uS2luZCwgdGV4dDogc3RyaW5nLCByZXVzZUlkPzogc3RyaW5nLCBjaGVja3BvaW50PzogSVZvaWNlQ2hlY2twb2ludE5hcnJhdGlvbk1ldGFkYXRhKSA9PiBib29sZWFuO1xuXHRcdGF3YWl0IGNvbnRyb2xsZXIuY29ubmVjdChtYWluV2luZG93KTtcblx0XHRjb250cm9sbGVyLnNldEFjdGl2ZVNlc3Npb25TaG93bihVUkkucGFyc2Uoc2Vzc2lvbklkKSk7XG5cblx0XHRuYXJyYXRlLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvbklkLCAnY2hlY2twb2ludCcsICdVcGRhdGluZyB0aGUgY29kZS4nLCB1bmRlZmluZWQsIHtcblx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QtMScsXG5cdFx0XHRjaGVja3BvaW50SWQ6ICdlZGl0aW5nJyxcblx0XHRcdHNlcXVlbmNlOiAxLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGZpcnN0SWQgPSB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHNbMF0ubmFycmF0aW9uSWQ7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVBdWRpb1Jlc3BvbnNlKHtcblx0XHRcdGF1ZGlvOiAnZGVjb2RpbmctY2hlY2twb2ludCcsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiB0cnVlLFxuXHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBzZXNzaW9uSWQsXG5cdFx0XHRyZXNwb25zZUlkOiBmaXJzdElkLFxuXHRcdFx0bmFycmF0aW9uS2luZDogJ2NoZWNrcG9pbnQnLFxuXHRcdFx0cGxheWJhY2tJZDogJ3BsYXliYWNrLTEnLFxuXHRcdH0pO1xuXHRcdG5hcnJhdGUuY2FsbChjb250cm9sbGVyLCBzZXNzaW9uSWQsICdjaGVja3BvaW50JywgJ1ZhbGlkYXRpbmcgdGhlIHJlc3VsdC4nLCB1bmRlZmluZWQsIHtcblx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QtMScsXG5cdFx0XHRjaGVja3BvaW50SWQ6ICd2YWxpZGF0aW5nJyxcblx0XHRcdHNlcXVlbmNlOiAyLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlY29uZElkID0gdm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzWzFdLm5hcnJhdGlvbklkO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJ3JlcGxhY2VtZW50LWNoZWNrcG9pbnQnLFxuXHRcdFx0aXNGaXJzdENodW5rOiB0cnVlLFxuXHRcdFx0aXNGaW5hbDogdHJ1ZSxcblx0XHRcdGNvZGluZ1Nlc3Npb25JZDogc2Vzc2lvbklkLFxuXHRcdFx0cmVzcG9uc2VJZDogc2Vjb25kSWQsXG5cdFx0XHRuYXJyYXRpb25LaW5kOiAnY2hlY2twb2ludCcsXG5cdFx0XHRwbGF5YmFja0lkOiAncGxheWJhY2stMicsXG5cdFx0fSk7XG5cdFx0dHRzUGxheWJhY2tTZXJ2aWNlLnN0b3BQbGF5YmFjaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdG9wQ291bnQ6IHR0c1BsYXliYWNrU2VydmljZS5zdG9wQ291bnQsXG5cdFx0XHRwbGF5YmFja0NvbXBsZXRpb25zOiB2b2ljZUNsaWVudFNlcnZpY2UucGxheWJhY2tDb21wbGV0aW9ucyxcblx0XHR9LCB7XG5cdFx0XHRzdG9wQ291bnQ6IDIsXG5cdFx0XHRwbGF5YmFja0NvbXBsZXRpb25zOiBbeyBzZXNzaW9uSWQsIG5hcnJhdGlvbklkOiBzZWNvbmRJZCwgcGxheWJhY2tJZDogJ3BsYXliYWNrLTInIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzY2hlZHVsZWQgbmV3ZXIgY2hlY2twb2ludCByZXBsYWNlcyBhY3RpdmUgY2hlY2twb2ludCBhdCB0aGUgY2FkZW5jZSBib3VuZGFyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IHR0c1BsYXliYWNrU2VydmljZSA9IG5ldyBUZXN0VHRzUGxheWJhY2tTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlLCB0dHNQbGF5YmFja1NlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi9zY2hlZHVsZWQtY2hlY2twb2ludC1yZXBsYWNlbWVudCcpO1xuXHRcdGNvbnN0IHsgY2hhbmdlRW1pdHRlciwgcGFydHMsIHJlc3BvbnNlIH0gPSBjcmVhdGVWb2ljZVByb2dyZXNzUmVzcG9uc2UoJ3Jlc3BvbnNlLXNjaGVkdWxlZC1yZXBsYWNlbWVudCcpO1xuXHRcdGNvbnN0IGlzQ29ubmVjdGVkID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19pc0Nvbm5lY3RlZCcpIGFzIHsgc2V0KHZhbHVlOiBib29sZWFuLCB0eDogdW5kZWZpbmVkKTogdm9pZCB9O1xuXHRcdGNvbnN0IHdhdGNoVm9pY2VQcm9ncmVzcyA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfd2F0Y2hWb2ljZVByb2dyZXNzJykgYXMgKHJlc291cmNlOiBVUkksIHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlTW9kZWwpID0+IHZvaWQ7XG5cblx0XHRhd2FpdCBjb250cm9sbGVyLmNvbm5lY3QobWFpbldpbmRvdyk7XG5cdFx0aXNDb25uZWN0ZWQuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0Y29udHJvbGxlci5zZXRBY3RpdmVTZXNzaW9uU2hvd24oc2Vzc2lvblJlc291cmNlKTtcblx0XHR3YXRjaFZvaWNlUHJvZ3Jlc3MuY2FsbChjb250cm9sbGVyLCBzZXNzaW9uUmVzb3VyY2UsIHJlc3BvbnNlKTtcblx0XHRwYXJ0cy5wdXNoKHsga2luZDogJ3ZvaWNlUHJvZ3Jlc3MnLCBpZDogJ2VkaXRpbmcnLCB2YWx1ZTogJ1VwZGF0aW5nIHRoZSBjb2RlLicgfSk7XG5cdFx0Y2hhbmdlRW1pdHRlci5maXJlKHsgcmVhc29uOiAnb3RoZXInIH0pO1xuXHRcdGNsb2NrLnRpY2soNV8wMDApO1xuXHRcdGNvbnN0IGZpcnN0SWQgPSB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHNbMF0ubmFycmF0aW9uSWQ7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVBdWRpb1Jlc3BvbnNlKHtcblx0XHRcdGF1ZGlvOiAnZWRpdGluZycsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiBmYWxzZSxcblx0XHRcdGNvZGluZ1Nlc3Npb25JZDogc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRyZXNwb25zZUlkOiBmaXJzdElkLFxuXHRcdH0pO1xuXG5cdFx0cGFydHMucHVzaCh7IGtpbmQ6ICd2b2ljZVByb2dyZXNzJywgaWQ6ICd2YWxpZGF0aW5nJywgdmFsdWU6ICdWYWxpZGF0aW5nIHRoZSByZXN1bHQuJyB9KTtcblx0XHRjaGFuZ2VFbWl0dGVyLmZpcmUoeyByZWFzb246ICdvdGhlcicgfSk7XG5cdFx0Y2xvY2sudGljaygxMF8wMDApO1xuXHRcdGNvbnN0IHNlY29uZElkID0gdm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzWzFdLm5hcnJhdGlvbklkO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJ3N0YWxlLWVkaXRpbmcnLFxuXHRcdFx0aXNGaXJzdENodW5rOiBmYWxzZSxcblx0XHRcdGlzRmluYWw6IHRydWUsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0cmVzcG9uc2VJZDogZmlyc3RJZCxcblx0XHR9KTtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICd2YWxpZGF0aW5nJyxcblx0XHRcdGlzRmlyc3RDaHVuazogdHJ1ZSxcblx0XHRcdGlzRmluYWw6IHRydWUsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0cmVzcG9uc2VJZDogc2Vjb25kSWQsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNoZWNrcG9pbnRzOiB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHMubWFwKHJlcXVlc3QgPT4gcmVxdWVzdC5jaGVja3BvaW50KSxcblx0XHRcdHN0b3BDb3VudDogdHRzUGxheWJhY2tTZXJ2aWNlLnN0b3BDb3VudCxcblx0XHRcdHBsYXllZEF1ZGlvOiB0dHNQbGF5YmFja1NlcnZpY2UucGxheWVkQXVkaW8sXG5cdFx0fSwge1xuXHRcdFx0Y2hlY2twb2ludHM6IFtcblx0XHRcdFx0eyByZXF1ZXN0SWQ6ICdyZXF1ZXN0LXJlc3BvbnNlLXNjaGVkdWxlZC1yZXBsYWNlbWVudCcsIGNoZWNrcG9pbnRJZDogJ2VkaXRpbmcnLCBzZXF1ZW5jZTogMSB9LFxuXHRcdFx0XHR7IHJlcXVlc3RJZDogJ3JlcXVlc3QtcmVzcG9uc2Utc2NoZWR1bGVkLXJlcGxhY2VtZW50JywgY2hlY2twb2ludElkOiAndmFsaWRhdGluZycsIHNlcXVlbmNlOiAyIH0sXG5cdFx0XHRdLFxuXHRcdFx0c3RvcENvdW50OiAxLFxuXHRcdFx0cGxheWVkQXVkaW86IFsnZWRpdGluZycsICd2YWxpZGF0aW5nJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVlc3QgY2FuY2VsbGF0aW9uIHByZWVtcHRzIGFjdGl2ZSBjaGVja3BvaW50IHBsYXliYWNrIGFuZCBkaXNjYXJkcyB0cmFpbGluZyBjaHVua3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCB0dHNQbGF5YmFja1NlcnZpY2UgPSBuZXcgVGVzdFR0c1BsYXliYWNrU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHZvaWNlQ2xpZW50U2VydmljZSwgdHRzUGxheWJhY2tTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSAnY2hhdC1zZXNzaW9uOi9hY3RpdmUtY2hlY2twb2ludC1jYW5jZWxsYXRpb24nO1xuXHRcdGNvbnN0IG5hcnJhdGUgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX25hcnJhdGUnKSBhcyAoc2Vzc2lvbklkOiBzdHJpbmcsIGtpbmQ6IFZvaWNlTmFycmF0aW9uS2luZCwgdGV4dDogc3RyaW5nLCByZXVzZUlkPzogc3RyaW5nLCBjaGVja3BvaW50PzogSVZvaWNlQ2hlY2twb2ludE5hcnJhdGlvbk1ldGFkYXRhKSA9PiBib29sZWFuO1xuXG5cdFx0YXdhaXQgY29udHJvbGxlci5jb25uZWN0KG1haW5XaW5kb3cpO1xuXHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKFVSSS5wYXJzZShzZXNzaW9uSWQpKTtcblx0XHRuYXJyYXRlLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvbklkLCAnY2hlY2twb2ludCcsICdVcGRhdGluZyB0aGUgY29kZS4nLCB1bmRlZmluZWQsIHtcblx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QtMScsXG5cdFx0XHRjaGVja3BvaW50SWQ6ICdlZGl0aW5nJyxcblx0XHRcdHNlcXVlbmNlOiAxLFxuXHRcdH0pO1xuXHRcdGNvbnN0IG5hcnJhdGlvbklkID0gdm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzWzBdLm5hcnJhdGlvbklkO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJ2NoZWNrcG9pbnQnLFxuXHRcdFx0aXNGaXJzdENodW5rOiB0cnVlLFxuXHRcdFx0aXNGaW5hbDogZmFsc2UsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdHJlc3BvbnNlSWQ6IG5hcnJhdGlvbklkLFxuXHRcdH0pO1xuXHRcdGNvbnRyb2xsZXIubWFya1VzZXJDYW5jZWxsZWQoc2Vzc2lvbklkKTtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICdzdGFsZS1jaGVja3BvaW50Jyxcblx0XHRcdGlzRmlyc3RDaHVuazogZmFsc2UsXG5cdFx0XHRpc0ZpbmFsOiB0cnVlLFxuXHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBzZXNzaW9uSWQsXG5cdFx0XHRyZXNwb25zZUlkOiBuYXJyYXRpb25JZCxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RvcENvdW50OiB0dHNQbGF5YmFja1NlcnZpY2Uuc3RvcENvdW50LFxuXHRcdFx0cGxheWVkQXVkaW86IHR0c1BsYXliYWNrU2VydmljZS5wbGF5ZWRBdWRpbyxcblx0XHR9LCB7XG5cdFx0XHRzdG9wQ291bnQ6IDEsXG5cdFx0XHRwbGF5ZWRBdWRpbzogWydjaGVja3BvaW50J10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cGxpY2l0IFBUVCByZXRpcmVzIGNoZWNrcG9pbnQgdHJhY2tpbmcgYmVmb3JlIGNsZWFyaW5nIHBsYXliYWNrIGNvcnJlbGF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSAnY2hhdC1zZXNzaW9uOi9jaGVja3BvaW50LXB0dC10cmFja2luZyc7XG5cdFx0Y29uc3QgaXNDb25uZWN0ZWQgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2lzQ29ubmVjdGVkJykgYXMgeyBzZXQodmFsdWU6IGJvb2xlYW4sIHR4OiB1bmRlZmluZWQpOiB2b2lkIH07XG5cdFx0Y29uc3QgbmFycmF0ZSA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfbmFycmF0ZScpIGFzIChzZXNzaW9uSWQ6IHN0cmluZywga2luZDogVm9pY2VOYXJyYXRpb25LaW5kLCB0ZXh0OiBzdHJpbmcsIHJldXNlSWQ/OiBzdHJpbmcsIGNoZWNrcG9pbnQ/OiBJVm9pY2VDaGVja3BvaW50TmFycmF0aW9uTWV0YWRhdGEpID0+IGJvb2xlYW47XG5cdFx0YXdhaXQgY29udHJvbGxlci5jb25uZWN0KG1haW5XaW5kb3cpO1xuXHRcdGlzQ29ubmVjdGVkLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKFVSSS5wYXJzZShzZXNzaW9uSWQpKTtcblxuXHRcdG5hcnJhdGUuY2FsbChjb250cm9sbGVyLCBzZXNzaW9uSWQsICdjaGVja3BvaW50JywgJ1VwZGF0aW5nIHRoZSBjb2RlLicsIHVuZGVmaW5lZCwge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxdWVzdC0xJyxcblx0XHRcdGNoZWNrcG9pbnRJZDogJ2VkaXRpbmcnLFxuXHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZmlyc3RJZCA9IHZvaWNlQ2xpZW50U2VydmljZS5yZXF1ZXN0c1swXS5uYXJyYXRpb25JZDtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICdjaGVja3BvaW50Jyxcblx0XHRcdGlzRmlyc3RDaHVuazogdHJ1ZSxcblx0XHRcdGlzRmluYWw6IGZhbHNlLFxuXHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBzZXNzaW9uSWQsXG5cdFx0XHRyZXNwb25zZUlkOiBmaXJzdElkLFxuXHRcdH0pO1xuXHRcdGNvbnRyb2xsZXIucHR0RG93bignZXhwbGljaXQnKTtcblx0XHRjb25zdCBzZW50TmV4dENoZWNrcG9pbnQgPSBuYXJyYXRlLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvbklkLCAnY2hlY2twb2ludCcsICdVcGRhdGluZyB0aGUgY29kZS4nLCB1bmRlZmluZWQsIHtcblx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QtMicsXG5cdFx0XHRjaGVja3BvaW50SWQ6ICdlZGl0aW5nJyxcblx0XHRcdHNlcXVlbmNlOiAxLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZW50TmV4dENoZWNrcG9pbnQsXG5cdFx0XHRyZXF1ZXN0SWRzOiB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHMubWFwKHJlcXVlc3QgPT4gcmVxdWVzdC5jaGVja3BvaW50Py5yZXF1ZXN0SWQpLFxuXHRcdH0sIHtcblx0XHRcdHNlbnROZXh0Q2hlY2twb2ludDogdHJ1ZSxcblx0XHRcdHJlcXVlc3RJZHM6IFsncmVxdWVzdC0xJywgJ3JlcXVlc3QtMiddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdiYXJnZS1pbiBzdG9wcyBhY3RpdmUgY2hlY2twb2ludCBwbGF5YmFjayBhbmQgZGlzY2FyZHMgdHJhaWxpbmcgY2h1bmtzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdHRzUGxheWJhY2tTZXJ2aWNlID0gbmV3IFRlc3RUdHNQbGF5YmFja1NlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHR0c1BsYXliYWNrU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ2NoYXQtc2Vzc2lvbjovY2hlY2twb2ludC1iYXJnZSc7XG5cdFx0Y29uc3QgbmFycmF0ZSA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfbmFycmF0ZScpIGFzIChzZXNzaW9uSWQ6IHN0cmluZywga2luZDogVm9pY2VOYXJyYXRpb25LaW5kLCB0ZXh0OiBzdHJpbmcsIHJldXNlSWQ/OiBzdHJpbmcsIGNoZWNrcG9pbnQ/OiBJVm9pY2VDaGVja3BvaW50TmFycmF0aW9uTWV0YWRhdGEpID0+IGJvb2xlYW47XG5cdFx0Y29uc3QgaGFuZGxlQmFyZ2VJbiA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfaGFuZGxlQmFyZ2VJbicpIGFzIChldmVudDogSVZvaWNlQmFyZ2VJbikgPT4gdm9pZDtcblx0XHRhd2FpdCBjb250cm9sbGVyLmNvbm5lY3QobWFpbldpbmRvdyk7XG5cdFx0Y29udHJvbGxlci5zZXRBY3RpdmVTZXNzaW9uU2hvd24oVVJJLnBhcnNlKHNlc3Npb25JZCkpO1xuXG5cdFx0bmFycmF0ZS5jYWxsKGNvbnRyb2xsZXIsIHNlc3Npb25JZCwgJ2NoZWNrcG9pbnQnLCAnVXBkYXRpbmcgdGhlIGNvZGUuJywgdW5kZWZpbmVkLCB7XG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXF1ZXN0LTEnLFxuXHRcdFx0Y2hlY2twb2ludElkOiAnZWRpdGluZycsXG5cdFx0XHRzZXF1ZW5jZTogMSxcblx0XHR9KTtcblx0XHRjb25zdCBjaGVja3BvaW50SWQgPSB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHNbMF0ubmFycmF0aW9uSWQ7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVBdWRpb1Jlc3BvbnNlKHtcblx0XHRcdGF1ZGlvOiAnY2hlY2twb2ludCcsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiBmYWxzZSxcblx0XHRcdGNvZGluZ1Nlc3Npb25JZDogc2Vzc2lvbklkLFxuXHRcdFx0cmVzcG9uc2VJZDogY2hlY2twb2ludElkLFxuXHRcdFx0dHVybklkOiAnY2hlY2twb2ludC10dXJuJyxcblx0XHR9KTtcblx0XHRoYW5kbGVCYXJnZUluLmNhbGwoY29udHJvbGxlciwgeyB0dXJuSWQ6ICd1c2VyLXR1cm4nLCBpbnRlcnJ1cHRlZFR1cm5JZDogY2hlY2twb2ludElkIH0pO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJ3N0YWxlLWNoZWNrcG9pbnQnLFxuXHRcdFx0aXNGaXJzdENodW5rOiBmYWxzZSxcblx0XHRcdGlzRmluYWw6IHRydWUsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdHJlc3BvbnNlSWQ6IGNoZWNrcG9pbnRJZCxcblx0XHRcdHR1cm5JZDogJ2NoZWNrcG9pbnQtdHVybicsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0b3BDb3VudDogdHRzUGxheWJhY2tTZXJ2aWNlLnN0b3BDb3VudCxcblx0XHRcdHBsYXllZEF1ZGlvOiB0dHNQbGF5YmFja1NlcnZpY2UucGxheWVkQXVkaW8sXG5cdFx0fSwge1xuXHRcdFx0c3RvcENvdW50OiAxLFxuXHRcdFx0cGxheWVkQXVkaW86IFsnY2hlY2twb2ludCddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdiYWNrZW5kIGludGVycnVwdGlvbiBzdG9wcyBvbmx5IHRoZSBtYXRjaGluZyBhY3RpdmUgY2hlY2twb2ludCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IHR0c1BsYXliYWNrU2VydmljZSA9IG5ldyBUZXN0VHRzUGxheWJhY2tTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlLCB0dHNQbGF5YmFja1NlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICdjaGF0LXNlc3Npb246L2NoZWNrcG9pbnQtc2VydmVyLWludGVycnVwdGlvbic7XG5cdFx0Y29uc3QgbmFycmF0ZSA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfbmFycmF0ZScpIGFzIChzZXNzaW9uSWQ6IHN0cmluZywga2luZDogVm9pY2VOYXJyYXRpb25LaW5kLCB0ZXh0OiBzdHJpbmcsIHJldXNlSWQ/OiBzdHJpbmcsIGNoZWNrcG9pbnQ/OiBJVm9pY2VDaGVja3BvaW50TmFycmF0aW9uTWV0YWRhdGEpID0+IGJvb2xlYW47XG5cdFx0YXdhaXQgY29udHJvbGxlci5jb25uZWN0KG1haW5XaW5kb3cpO1xuXHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKFVSSS5wYXJzZShzZXNzaW9uSWQpKTtcblxuXHRcdG5hcnJhdGUuY2FsbChjb250cm9sbGVyLCBzZXNzaW9uSWQsICdjaGVja3BvaW50JywgJ1VwZGF0aW5nIHRoZSBjb2RlLicsIHVuZGVmaW5lZCwge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxdWVzdC0xJyxcblx0XHRcdGNoZWNrcG9pbnRJZDogJ2VkaXRpbmcnLFxuXHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0fSk7XG5cdFx0Y29uc3QgbmFycmF0aW9uSWQgPSB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHNbMF0ubmFycmF0aW9uSWQ7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVBdWRpb1Jlc3BvbnNlKHtcblx0XHRcdGF1ZGlvOiAnY2hlY2twb2ludCcsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiBmYWxzZSxcblx0XHRcdGNvZGluZ1Nlc3Npb25JZDogc2Vzc2lvbklkLFxuXHRcdFx0cmVzcG9uc2VJZDogbmFycmF0aW9uSWQsXG5cdFx0fSk7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVOYXJyYXRpb25JbnRlcnJ1cHRlZCh7XG5cdFx0XHRuYXJyYXRpb25JZCxcblx0XHRcdGNvZGluZ1Nlc3Npb25JZDogc2Vzc2lvbklkLFxuXHRcdFx0cmV0cnlhYmxlOiBmYWxzZSxcblx0XHRcdHJlYXNvbjogJ3N1cGVyc2VkZWRfYnlfcmVzcG9uc2UnLFxuXHRcdH0pO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJ3N0YWxlLWNoZWNrcG9pbnQnLFxuXHRcdFx0aXNGaXJzdENodW5rOiBmYWxzZSxcblx0XHRcdGlzRmluYWw6IHRydWUsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdHJlc3BvbnNlSWQ6IG5hcnJhdGlvbklkLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdG9wQ291bnQ6IHR0c1BsYXliYWNrU2VydmljZS5zdG9wQ291bnQsXG5cdFx0XHRwbGF5ZWRBdWRpbzogdHRzUGxheWJhY2tTZXJ2aWNlLnBsYXllZEF1ZGlvLFxuXHRcdFx0cGxheWJhY2tDb21wbGV0aW9uczogdm9pY2VDbGllbnRTZXJ2aWNlLnBsYXliYWNrQ29tcGxldGlvbnMsXG5cdFx0fSwge1xuXHRcdFx0c3RvcENvdW50OiAxLFxuXHRcdFx0cGxheWVkQXVkaW86IFsnY2hlY2twb2ludCddLFxuXHRcdFx0cGxheWJhY2tDb21wbGV0aW9uczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xhdGUgYmFja2VuZCBpbnRlcnJ1cHRpb24gZG9lcyBub3Qgc3RvcCBhIHJlcGxhY2VtZW50IGNoZWNrcG9pbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCB0dHNQbGF5YmFja1NlcnZpY2UgPSBuZXcgVGVzdFR0c1BsYXliYWNrU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHZvaWNlQ2xpZW50U2VydmljZSwgdHRzUGxheWJhY2tTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSAnY2hhdC1zZXNzaW9uOi9jaGVja3BvaW50LWxhdGUtc2VydmVyLWludGVycnVwdGlvbic7XG5cdFx0Y29uc3QgbmFycmF0ZSA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfbmFycmF0ZScpIGFzIChzZXNzaW9uSWQ6IHN0cmluZywga2luZDogVm9pY2VOYXJyYXRpb25LaW5kLCB0ZXh0OiBzdHJpbmcsIHJldXNlSWQ/OiBzdHJpbmcsIGNoZWNrcG9pbnQ/OiBJVm9pY2VDaGVja3BvaW50TmFycmF0aW9uTWV0YWRhdGEpID0+IGJvb2xlYW47XG5cdFx0YXdhaXQgY29udHJvbGxlci5jb25uZWN0KG1haW5XaW5kb3cpO1xuXHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKFVSSS5wYXJzZShzZXNzaW9uSWQpKTtcblxuXHRcdG5hcnJhdGUuY2FsbChjb250cm9sbGVyLCBzZXNzaW9uSWQsICdjaGVja3BvaW50JywgJ1VwZGF0aW5nIHRoZSBjb2RlLicsIHVuZGVmaW5lZCwge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxdWVzdC0xJyxcblx0XHRcdGNoZWNrcG9pbnRJZDogJ2VkaXRpbmcnLFxuXHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZmlyc3RJZCA9IHZvaWNlQ2xpZW50U2VydmljZS5yZXF1ZXN0c1swXS5uYXJyYXRpb25JZDtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICdmaXJzdC1jaGVja3BvaW50Jyxcblx0XHRcdGlzRmlyc3RDaHVuazogdHJ1ZSxcblx0XHRcdGlzRmluYWw6IGZhbHNlLFxuXHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBzZXNzaW9uSWQsXG5cdFx0XHRyZXNwb25zZUlkOiBmaXJzdElkLFxuXHRcdH0pO1xuXHRcdG5hcnJhdGUuY2FsbChjb250cm9sbGVyLCBzZXNzaW9uSWQsICdjaGVja3BvaW50JywgJ1ZhbGlkYXRpbmcgdGhlIHJlc3VsdC4nLCB1bmRlZmluZWQsIHtcblx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QtMScsXG5cdFx0XHRjaGVja3BvaW50SWQ6ICd2YWxpZGF0aW5nJyxcblx0XHRcdHNlcXVlbmNlOiAyLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlY29uZElkID0gdm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzWzFdLm5hcnJhdGlvbklkO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJ3NlY29uZC1jaGVja3BvaW50Jyxcblx0XHRcdGlzRmlyc3RDaHVuazogdHJ1ZSxcblx0XHRcdGlzRmluYWw6IHRydWUsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdHJlc3BvbnNlSWQ6IHNlY29uZElkLFxuXHRcdFx0bmFycmF0aW9uS2luZDogJ2NoZWNrcG9pbnQnLFxuXHRcdFx0cGxheWJhY2tJZDogJ3BsYXliYWNrLTInLFxuXHRcdH0pO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlTmFycmF0aW9uSW50ZXJydXB0ZWQoe1xuXHRcdFx0bmFycmF0aW9uSWQ6IGZpcnN0SWQsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdHJldHJ5YWJsZTogZmFsc2UsXG5cdFx0XHRyZWFzb246ICdzdXBlcnNlZGVkX2J5X2NoZWNrcG9pbnQnLFxuXHRcdH0pO1xuXHRcdHR0c1BsYXliYWNrU2VydmljZS5zdG9wUGxheWJhY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RvcENvdW50OiB0dHNQbGF5YmFja1NlcnZpY2Uuc3RvcENvdW50LFxuXHRcdFx0cGxheWJhY2tDb21wbGV0aW9uczogdm9pY2VDbGllbnRTZXJ2aWNlLnBsYXliYWNrQ29tcGxldGlvbnMsXG5cdFx0fSwge1xuXHRcdFx0c3RvcENvdW50OiAyLFxuXHRcdFx0cGxheWJhY2tDb21wbGV0aW9uczogW3sgc2Vzc2lvbklkLCBuYXJyYXRpb25JZDogc2Vjb25kSWQsIHBsYXliYWNrSWQ6ICdwbGF5YmFjay0yJyB9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2hlY2twb2ludCBzZXF1ZW5jZSByZXN0YXJ0cyBmb3IgdGhlIG5leHQgY2hhdCByZXF1ZXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovc2VxdWVuY2UtcmVzZXQnKTtcblx0XHRjb25zdCBmaXJzdCA9IGNyZWF0ZVZvaWNlUHJvZ3Jlc3NSZXNwb25zZSgncmVzcG9uc2Utc2VxdWVuY2UtMScsICdyZXF1ZXN0LTEnKTtcblx0XHRjb25zdCBzZWNvbmQgPSBjcmVhdGVWb2ljZVByb2dyZXNzUmVzcG9uc2UoJ3Jlc3BvbnNlLXNlcXVlbmNlLTInLCAncmVxdWVzdC0yJyk7XG5cdFx0Y29uc3QgaXNDb25uZWN0ZWQgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2lzQ29ubmVjdGVkJykgYXMgeyBzZXQodmFsdWU6IGJvb2xlYW4sIHR4OiB1bmRlZmluZWQpOiB2b2lkIH07XG5cdFx0Y29uc3Qgd2F0Y2hWb2ljZVByb2dyZXNzID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ193YXRjaFZvaWNlUHJvZ3Jlc3MnKSBhcyAocmVzb3VyY2U6IFVSSSwgcmVzcG9uc2U6IElDaGF0UmVzcG9uc2VNb2RlbCkgPT4gdm9pZDtcblx0XHRjb25zdCBoYW5kbGVBY2sgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2hhbmRsZU5hcnJhdGlvbkFjaycpIGFzIChldmVudDogSVZvaWNlTmFycmF0aW9uQWNrKSA9PiB2b2lkO1xuXG5cdFx0aXNDb25uZWN0ZWQuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0Y29udHJvbGxlci5zZXRBY3RpdmVTZXNzaW9uU2hvd24oc2Vzc2lvblJlc291cmNlKTtcblx0XHR3YXRjaFZvaWNlUHJvZ3Jlc3MuY2FsbChjb250cm9sbGVyLCBzZXNzaW9uUmVzb3VyY2UsIGZpcnN0LnJlc3BvbnNlKTtcblx0XHRmaXJzdC5wYXJ0cy5wdXNoKHsga2luZDogJ3ZvaWNlUHJvZ3Jlc3MnLCBpZDogJ2VkaXRpbmcnLCB2YWx1ZTogJ1VwZGF0aW5nIHRoZSBmaXJzdCByZXF1ZXN0LicgfSk7XG5cdFx0Zmlyc3QuY2hhbmdlRW1pdHRlci5maXJlKHsgcmVhc29uOiAnb3RoZXInIH0pO1xuXHRcdGNsb2NrLnRpY2soNV8wMDApO1xuXHRcdGhhbmRsZUFjay5jYWxsKGNvbnRyb2xsZXIsIHtcblx0XHRcdG5hcnJhdGlvbklkOiB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHNbMF0ubmFycmF0aW9uSWQsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0ZGlzcG9zaXRpb246ICdzdXBwcmVzc2VkJyxcblx0XHR9KTtcblx0XHRmaXJzdC5zdGF0ZS5pc0NvbXBsZXRlID0gdHJ1ZTtcblx0XHRmaXJzdC5jaGFuZ2VFbWl0dGVyLmZpcmUoeyByZWFzb246ICdvdGhlcicgfSk7XG5cblx0XHR3YXRjaFZvaWNlUHJvZ3Jlc3MuY2FsbChjb250cm9sbGVyLCBzZXNzaW9uUmVzb3VyY2UsIHNlY29uZC5yZXNwb25zZSk7XG5cdFx0c2Vjb25kLnBhcnRzLnB1c2goeyBraW5kOiAndm9pY2VQcm9ncmVzcycsIGlkOiAndmFsaWRhdGluZycsIHZhbHVlOiAnVmFsaWRhdGluZyB0aGUgc2Vjb25kIHJlcXVlc3QuJyB9KTtcblx0XHRzZWNvbmQuY2hhbmdlRW1pdHRlci5maXJlKHsgcmVhc29uOiAnb3RoZXInIH0pO1xuXHRcdGNsb2NrLnRpY2soNV8wMDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHMubWFwKHJlcXVlc3QgPT4gcmVxdWVzdC5jaGVja3BvaW50KSwgW1xuXHRcdFx0eyByZXF1ZXN0SWQ6ICdyZXF1ZXN0LTEnLCBjaGVja3BvaW50SWQ6ICdlZGl0aW5nJywgc2VxdWVuY2U6IDEgfSxcblx0XHRcdHsgcmVxdWVzdElkOiAncmVxdWVzdC0yJywgY2hlY2twb2ludElkOiAndmFsaWRhdGluZycsIHNlcXVlbmNlOiAxIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcnN0LWFuZC1maW5hbCBlbXB0eSBjaGVja3BvaW50IGNsZWFycyB3aXRob3V0IGFja25vd2xlZGdpbmcgcGxheWJhY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICdjaGF0LXNlc3Npb246L2NoZWNrcG9pbnQtZW1wdHktZmluYWwnO1xuXHRcdGNvbnN0IG5hcnJhdGUgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX25hcnJhdGUnKSBhcyAoc2Vzc2lvbklkOiBzdHJpbmcsIGtpbmQ6IFZvaWNlTmFycmF0aW9uS2luZCwgdGV4dDogc3RyaW5nLCByZXVzZUlkPzogc3RyaW5nLCBjaGVja3BvaW50PzogSVZvaWNlQ2hlY2twb2ludE5hcnJhdGlvbk1ldGFkYXRhKSA9PiBib29sZWFuO1xuXHRcdGF3YWl0IGNvbnRyb2xsZXIuY29ubmVjdChtYWluV2luZG93KTtcblx0XHRjb250cm9sbGVyLnNldEFjdGl2ZVNlc3Npb25TaG93bihVUkkucGFyc2Uoc2Vzc2lvbklkKSk7XG5cblx0XHRuYXJyYXRlLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvbklkLCAnY2hlY2twb2ludCcsICdVcGRhdGluZyB0aGUgY29kZS4nLCB1bmRlZmluZWQsIHtcblx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QtMScsXG5cdFx0XHRjaGVja3BvaW50SWQ6ICdlZGl0aW5nJyxcblx0XHRcdHNlcXVlbmNlOiAxLFxuXHRcdH0pO1xuXHRcdGNvbnN0IG5hcnJhdGlvbklkID0gdm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzWzBdLm5hcnJhdGlvbklkO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJycsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiB0cnVlLFxuXHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBzZXNzaW9uSWQsXG5cdFx0XHRyZXNwb25zZUlkOiBuYXJyYXRpb25JZCxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QtMScsXG5cdFx0XHRjaGVja3BvaW50SWQ6ICdlZGl0aW5nJyxcblx0XHRcdHNlcXVlbmNlOiAxLFxuXHRcdFx0bmFycmF0aW9uS2luZDogJ2NoZWNrcG9pbnQnLFxuXHRcdFx0cGxheWJhY2tJZDogJ3BsYXliYWNrLWVtcHR5Jyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGVuZGluZzogWy4uLihSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3BlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb25zJykgYXMgTWFwPHN0cmluZywgdW5rbm93bj4pLmtleXMoKV0sXG5cdFx0XHRkZWZlcnJlZDogWy4uLihSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2RlZmVycmVkTmFycmF0aW9ucycpIGFzIE1hcDxzdHJpbmcsIHVua25vd24+KS5rZXlzKCldLFxuXHRcdFx0cGxheWJhY2tDb21wbGV0aW9uczogdm9pY2VDbGllbnRTZXJ2aWNlLnBsYXliYWNrQ29tcGxldGlvbnMsXG5cdFx0fSwge1xuXHRcdFx0cGVuZGluZzogW10sXG5cdFx0XHRkZWZlcnJlZDogW10sXG5cdFx0XHRwbGF5YmFja0NvbXBsZXRpb25zOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZW1wdHkgY2hlY2twb2ludCB0ZXJtaW5hbCB3aXRob3V0IHBsYXliYWNrIGlkIGNsZWFycyB3aXRob3V0IGFja25vd2xlZGdlbWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHZvaWNlQ2xpZW50U2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ2NoYXQtc2Vzc2lvbjovY2hlY2twb2ludC1lbXB0eS1maW5hbC1uby1wbGF5YmFjayc7XG5cdFx0Y29uc3QgbmFycmF0ZSA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfbmFycmF0ZScpIGFzIChzZXNzaW9uSWQ6IHN0cmluZywga2luZDogVm9pY2VOYXJyYXRpb25LaW5kLCB0ZXh0OiBzdHJpbmcsIHJldXNlSWQ/OiBzdHJpbmcsIGNoZWNrcG9pbnQ/OiBJVm9pY2VDaGVja3BvaW50TmFycmF0aW9uTWV0YWRhdGEpID0+IGJvb2xlYW47XG5cdFx0YXdhaXQgY29udHJvbGxlci5jb25uZWN0KG1haW5XaW5kb3cpO1xuXHRcdGNvbnRyb2xsZXIuc2V0QWN0aXZlU2Vzc2lvblNob3duKFVSSS5wYXJzZShzZXNzaW9uSWQpKTtcblxuXHRcdG5hcnJhdGUuY2FsbChjb250cm9sbGVyLCBzZXNzaW9uSWQsICdjaGVja3BvaW50JywgJ1VwZGF0aW5nIHRoZSBjb2RlLicsIHVuZGVmaW5lZCwge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxdWVzdC0xJyxcblx0XHRcdGNoZWNrcG9pbnRJZDogJ2VkaXRpbmcnLFxuXHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0fSk7XG5cdFx0Y29uc3QgbmFycmF0aW9uSWQgPSB2b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdHNbMF0ubmFycmF0aW9uSWQ7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVBdWRpb1Jlc3BvbnNlKHtcblx0XHRcdGF1ZGlvOiAnJyxcblx0XHRcdGlzRmlyc3RDaHVuazogdHJ1ZSxcblx0XHRcdGlzRmluYWw6IHRydWUsXG5cdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IHNlc3Npb25JZCxcblx0XHRcdHJlc3BvbnNlSWQ6IG5hcnJhdGlvbklkLFxuXHRcdFx0cmVxdWVzdElkOiAncmVxdWVzdC0xJyxcblx0XHRcdGNoZWNrcG9pbnRJZDogJ2VkaXRpbmcnLFxuXHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0XHRuYXJyYXRpb25LaW5kOiAnY2hlY2twb2ludCcsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBlbmRpbmc6IFsuLi4oUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19wZW5kaW5nU29saWNpdGVkTmFycmF0aW9ucycpIGFzIE1hcDxzdHJpbmcsIHVua25vd24+KS5rZXlzKCldLFxuXHRcdFx0cGxheWJhY2tDb21wbGV0aW9uczogdm9pY2VDbGllbnRTZXJ2aWNlLnBsYXliYWNrQ29tcGxldGlvbnMsXG5cdFx0fSwge1xuXHRcdFx0cGVuZGluZzogW10sXG5cdFx0XHRwbGF5YmFja0NvbXBsZXRpb25zOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2hlY2twb2ludCBhdWRpbyBwcmVmaXggZm9sbG93ZWQgYnkgZW1wdHkgZmFpbHVyZSBmaW5hbCBhY2tub3dsZWRnZXMgYWZ0ZXIgcGxheWJhY2sgZHJhaW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdHRzUGxheWJhY2tTZXJ2aWNlID0gbmV3IFRlc3RUdHNQbGF5YmFja1NlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHR0c1BsYXliYWNrU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ2NoYXQtc2Vzc2lvbjovY2hlY2twb2ludC1wYXJ0aWFsLWZhaWx1cmUnO1xuXHRcdGNvbnN0IG5hcnJhdGUgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX25hcnJhdGUnKSBhcyAoc2Vzc2lvbklkOiBzdHJpbmcsIGtpbmQ6IFZvaWNlTmFycmF0aW9uS2luZCwgdGV4dDogc3RyaW5nLCByZXVzZUlkPzogc3RyaW5nLCBjaGVja3BvaW50PzogSVZvaWNlQ2hlY2twb2ludE5hcnJhdGlvbk1ldGFkYXRhKSA9PiBib29sZWFuO1xuXHRcdGF3YWl0IGNvbnRyb2xsZXIuY29ubmVjdChtYWluV2luZG93KTtcblx0XHRjb250cm9sbGVyLnNldEFjdGl2ZVNlc3Npb25TaG93bihVUkkucGFyc2Uoc2Vzc2lvbklkKSk7XG5cblx0XHRuYXJyYXRlLmNhbGwoY29udHJvbGxlciwgc2Vzc2lvbklkLCAnY2hlY2twb2ludCcsICdVcGRhdGluZyB0aGUgY29kZS4nLCB1bmRlZmluZWQsIHtcblx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QtMScsXG5cdFx0XHRjaGVja3BvaW50SWQ6ICdlZGl0aW5nJyxcblx0XHRcdHNlcXVlbmNlOiAxLFxuXHRcdH0pO1xuXHRcdGNvbnN0IG5hcnJhdGlvbklkID0gdm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzWzBdLm5hcnJhdGlvbklkO1xuXHRcdGNvbnN0IGNvcnJlbGF0aW9uID0ge1xuXHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBzZXNzaW9uSWQsXG5cdFx0XHRyZXNwb25zZUlkOiBuYXJyYXRpb25JZCxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QtMScsXG5cdFx0XHRjaGVja3BvaW50SWQ6ICdlZGl0aW5nJyBhcyBjb25zdCxcblx0XHRcdHNlcXVlbmNlOiAxLFxuXHRcdFx0bmFycmF0aW9uS2luZDogJ2NoZWNrcG9pbnQnIGFzIGNvbnN0LFxuXHRcdFx0cGxheWJhY2tJZDogJ3BsYXliYWNrLXBhcnRpYWwnLFxuXHRcdH07XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVBdWRpb1Jlc3BvbnNlKHtcblx0XHRcdC4uLmNvcnJlbGF0aW9uLFxuXHRcdFx0YXVkaW86ICdjaGVja3BvaW50LXByZWZpeCcsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiBmYWxzZSxcblx0XHR9KTtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0Li4uY29ycmVsYXRpb24sXG5cdFx0XHRhdWRpbzogJycsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IGZhbHNlLFxuXHRcdFx0aXNGaW5hbDogdHJ1ZSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodm9pY2VDbGllbnRTZXJ2aWNlLnBsYXliYWNrQ29tcGxldGlvbnMsIFtdKTtcblx0XHR0dHNQbGF5YmFja1NlcnZpY2Uuc3RvcFBsYXliYWNrKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2b2ljZUNsaWVudFNlcnZpY2UucGxheWJhY2tDb21wbGV0aW9ucywgW3tcblx0XHRcdHNlc3Npb25JZCxcblx0XHRcdG5hcnJhdGlvbklkLFxuXHRcdFx0cGxheWJhY2tJZDogJ3BsYXliYWNrLXBhcnRpYWwnLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwbGljaXQgZGlzY29ubmVjdCBjbGVhcnMgcm91dGluZyB0YXJnZXQgYW5kIHBlbmRpbmcgY29uZmlybWF0aW9ucyBhbmQgdGhlIHRyYWNrZXIgY2Fubm90IHJlcG9wdWxhdGUgdGhlbSBiZWZvcmUgcmVjb25uZWN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSBuZXcgQ29udHJvbGxhYmxlQ2hhdFNlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjaGF0U2VydmljZSk7XG5cblx0XHRjb25zdCB0YXJnZXQgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cdFx0Y29udHJvbGxlci5zZXRUYXJnZXRTZXNzaW9uKHRhcmdldCk7XG5cdFx0Y2hhdFNlcnZpY2Uuc2V0TW9kZWxzKFtwZW5kaW5nQ29uZmlybWF0aW9uTW9kZWwoVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3Q6L3Nlc3Npb24tMScpKV0pO1xuXG5cdFx0Ly8gUHJlY29uZGl0aW9uOiB0aGUgdHJhY2tlciBzZWVzIHRoZSBwZW5kaW5nIGNvbmZpcm1hdGlvbiBhbmQgdGhlIHRhcmdldFxuXHRcdC8vIGlzIHBpbm5lZC5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5wZW5kaW5nVG9vbENvbmZpcm1hdGlvbnMuZ2V0KCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci50YXJnZXRTZXNzaW9uLmdldCgpPy50b1N0cmluZygpLCB0YXJnZXQudG9TdHJpbmcoKSk7XG5cblx0XHRjb250cm9sbGVyLmRpc2Nvbm5lY3QoJ2V4cGxpY2l0Jyk7XG5cblx0XHQvLyBDbGVhcmVkIGJ5IHRoZSB0ZWFyZG93bi4uLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLnRhcmdldFNlc3Npb24uZ2V0KCksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIucGVuZGluZ1Rvb2xDb25maXJtYXRpb25zLmdldCgpLmxlbmd0aCwgMCk7XG5cblx0XHQvLyAuLi5hbmQgYSBsYXRlciBtb2RlbCB1cGRhdGUgY2Fubm90IG1ha2UgdGhlIGFsd2F5cy1vbiB0cmFja2VyXG5cdFx0Ly8gcmVwb3B1bGF0ZSB0aGUgc25hcHNob3QgZnJvbSB0aGUgc3RpbGwtcGVuZGluZyBvbGQgc2Vzc2lvbi5cblx0XHRjaGF0U2VydmljZS5zZXRNb2RlbHMoW3BlbmRpbmdDb25maXJtYXRpb25Nb2RlbChVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJykpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIucGVuZGluZ1Rvb2xDb25maXJtYXRpb25zLmdldCgpLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgb25seSBnZW51aW5lIGFwcHJvdmFscyBhcyBhcHByb3ZhbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gT25lIHRvb2wgbm93IGNhcnJpZXMgYXBwcm92ZSwgcmVqZWN0LCBhbnN3ZXIgYW5kIHNraXAuIFdpZGVuaW5nIHRoZVxuXHRcdC8vIGFwcHJvdmFsIGV2ZW50IHRvIG1hdGNoIHdvdWxkIHNpbGVudGx5IGNoYW5nZSB3aGF0IGl0IGNvdW50cy5cblx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBuZXcgVGVzdFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0ZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRhd2FpdCBjb250cm9sbGVyLmNvbm5lY3QobWFpbldpbmRvdyk7XG5cblx0XHRmb3IgKGNvbnN0IHR5cGUgb2YgWydhcHByb3ZlJywgJ3JlamVjdCcsICdhbnN3ZXInLCAnc2tpcCddKSB7XG5cdFx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZVRvb2xDYWxsKHtcblx0XHRcdFx0Y2FsbElkOiBgY2FsbC0ke3R5cGV9YCxcblx0XHRcdFx0bmFtZTogJ3Jlc3BvbmRfdG9fc2Vzc2lvbicsXG5cdFx0XHRcdGFyZ3M6IHsgY29kaW5nX3Nlc3Npb25faWQ6ICdzZXNzaW9uLTEnLCByZXNwb25zZTogeyB0eXBlIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdm9pY2VDbGllbnRTZXJ2aWNlLnRvb2xSZXN1bHRSZWNlaXZlZDtcblx0XHR9XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0dGVsZW1ldHJ5U2VydmljZS5ldmVudHMuZmlsdGVyKGV2ZW50ID0+IGV2ZW50Lm5hbWUgPT09ICd2b2ljZVRvb2xBcHByb3ZhbCcpLm1hcChldmVudCA9PiAoZXZlbnQuZGF0YSBhcyB7IGFwcHJvdmVkOiBib29sZWFuIH0pLmFwcHJvdmVkKSxcblx0XHRcdFt0cnVlLCBmYWxzZV0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncHVibGlzaGVzIGEgcXVlc3Rpb24gZm9ybSBhcyBhIHN0cnVjdHVyZWQgcGVuZGluZyBwYXlsb2FkJywgKCkgPT4ge1xuXHRcdC8vIFRoZSB3aG9sZSBwb2ludCBvZiB0aGUgdHlwZWQgcGF5bG9hZDogYGFnZW50X3N0YXRlX2RldGFpbGAgY2FuIHNheSBhIGZvcm1cblx0XHQvLyBpcyB1cCwgYnV0IG9ubHkgdGhpcyBjYXJyaWVzIHRoZSBpZHMsIHZhbHVlcyBhbmQgZGlzcGxheWVkIG9yZGVyIGFcblx0XHQvLyBzcG9rZW4gYW5zd2VyIG5lZWRzIHRvIGxhbmQgb24uXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIobmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgYnVpbGRQZW5kaW5nUGF5bG9hZCA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfYnVpbGRQZW5kaW5nUGF5bG9hZCcpIGFzIChtb2RlbDogSUNoYXRNb2RlbCkgPT4gdW5rbm93bjtcblx0XHRjb25zdCBwYXJ0ID0ge1xuXHRcdFx0a2luZDogJ3F1ZXN0aW9uQ2Fyb3VzZWwnLFxuXHRcdFx0YWxsb3dTa2lwOiB0cnVlLFxuXHRcdFx0cXVlc3Rpb25zOiBbe1xuXHRcdFx0XHRpZDogJ3JlZ2lvbicsXG5cdFx0XHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnLFxuXHRcdFx0XHR0aXRsZTogJ0RlcGxveSBzZXR0aW5ncycsXG5cdFx0XHRcdG1lc3NhZ2U6ICdXaGljaCByZWdpb24gc2hvdWxkIHRoaXMgZGVwbG95IHRvPycsXG5cdFx0XHRcdGRlZmF1bHRWYWx1ZTogJ2Vhc3QnLFxuXHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0eyBpZDogJ3dlc3QnLCBsYWJlbDogJ1dlc3QgVVMnLCB2YWx1ZTogJ3dlc3R1cycgfSxcblx0XHRcdFx0XHR7IGlkOiAnZWFzdCcsIGxhYmVsOiAnRWFzdCBVUycsIHZhbHVlOiAnZWFzdHVzJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fV0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHBheWxvYWQgPSBidWlsZFBlbmRpbmdQYXlsb2FkLmNhbGwoY29udHJvbGxlciwgcGVuZGluZ1BhcnRzTW9kZWwocGFydCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXlsb2FkLCB7XG5cdFx0XHR0eXBlOiAncXVlc3Rpb25zJyxcblx0XHRcdHBlbmRpbmdfaWQ6IGRlcml2ZVBlbmRpbmdJZCgncmVxLTEnLCBwYXJ0KSxcblx0XHRcdHJlcXVlc3RfaWQ6ICdyZXEtMScsXG5cdFx0XHRhbGxvd19za2lwOiB0cnVlLFxuXHRcdFx0cXVlc3Rpb25zOiBbe1xuXHRcdFx0XHRpZDogJ3JlZ2lvbicsXG5cdFx0XHRcdHR5cGU6ICdzaW5nbGVTZWxlY3QnLFxuXHRcdFx0XHQvLyBUaGUgcXVlc3Rpb24gdGhlIHdpZGdldCBzaG93cywgbm90IGl0cyBoZWFkZXIuXG5cdFx0XHRcdHRpdGxlOiAnV2hpY2ggcmVnaW9uIHNob3VsZCB0aGlzIGRlcGxveSB0bz8nLFxuXHRcdFx0XHRhbGxvd19mcmVlZm9ybTogdHJ1ZSxcblx0XHRcdFx0Ly8gRGVmYXVsdCBmaXJzdCwgbWF0Y2hpbmcgd2hhdCB0aGUgd2lkZ2V0IHJlbmRlcnMgYW5kIHRoZSB1c2VyIGhlYXJzLlxuXHRcdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdFx0eyBsYWJlbDogJ0Vhc3QgVVMnLCB2YWx1ZTogJ2Vhc3R1cycgfSxcblx0XHRcdFx0XHR7IGxhYmVsOiAnV2VzdCBVUycsIHZhbHVlOiAnd2VzdHVzJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHB1Ymxpc2ggYSBxdWVzdGlvbiBmb3JtIHRoYXQgaGFzIGFscmVhZHkgYmVlbiBhbnN3ZXJlZCcsICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpKTtcblx0XHRjb25zdCBidWlsZFBlbmRpbmdQYXlsb2FkID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19idWlsZFBlbmRpbmdQYXlsb2FkJykgYXMgKG1vZGVsOiBJQ2hhdE1vZGVsKSA9PiB1bmtub3duO1xuXHRcdGNvbnN0IHF1ZXN0aW9ucyA9IFt7IGlkOiAncmVnaW9uJywgdHlwZTogJ3NpbmdsZVNlbGVjdCcsIHRpdGxlOiAnV2hpY2ggcmVnaW9uPycsIG9wdGlvbnM6IFt7IGlkOiAnd2VzdCcsIGxhYmVsOiAnV2VzdCBVUycsIHZhbHVlOiAnd2VzdHVzJyB9XSB9XTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWlsZFBlbmRpbmdQYXlsb2FkLmNhbGwoY29udHJvbGxlciwgcGVuZGluZ1BhcnRzTW9kZWwoeyBraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcsIGlzVXNlZDogdHJ1ZSwgcXVlc3Rpb25zIH0pKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVpbGRQZW5kaW5nUGF5bG9hZC5jYWxsKGNvbnRyb2xsZXIsIHBlbmRpbmdQYXJ0c01vZGVsKHsga2luZDogJ3F1ZXN0aW9uQ2Fyb3VzZWwnLCBhbnN3ZXJlZEV4dGVybmFsbHk6IHRydWUsIHF1ZXN0aW9ucyB9KSksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1aWxkUGVuZGluZ1BheWxvYWQuY2FsbChjb250cm9sbGVyLCBwZW5kaW5nUGFydHNNb2RlbCh7IGtpbmQ6ICdxdWVzdGlvbkNhcm91c2VsJywgcXVlc3Rpb25zOiBbXSB9KSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGVjdHMgdGhlIG9sZGVzdCBzdGlsbC1vcGVuIHBlbmRpbmcgcGFydCwgbm90IHRoZSBuZXdlc3QnLCAoKSA9PiB7XG5cdFx0Ly8gVm9pY2UgaXMgYSBzZXJpYWwgY2hhbm5lbDogYSBzZWNvbmQgZm9ybSBhcnJpdmluZyBtdXN0IG5vdCB0YWtlIHRoZSB0dXJuXG5cdFx0Ly8gZnJvbSB0aGUgb25lIHRoZSB1c2VyIHdhcyBqdXN0IHJlYWQgb3V0IGFuZCBpcyBwYXJ0LXdheSB0aHJvdWdoXG5cdFx0Ly8gYW5zd2VyaW5nLiBPbGRlc3QtZmlyc3QgaXMgYWxzbyB3aGF0IHRoZSBjaGF0IG1vZGVsIGl0c2VsZiBkb2VzIHdoZW4gaXRcblx0XHQvLyBkZWNpZGVzIHdoYXQgYSByZXNwb25zZSBpcyB3YWl0aW5nIG9uLlxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHNlbGVjdFBlbmRpbmdQYXJ0ID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19zZWxlY3RQZW5kaW5nUGFydCcpIGFzIChtb2RlbDogSUNoYXRNb2RlbCkgPT4geyByZXF1ZXN0SWQ6IHN0cmluZzsgcGFydDogeyBraW5kOiBzdHJpbmcgfSB9IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG9sZGVyID0geyBraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcsIHF1ZXN0aW9uczogW3sgaWQ6ICdhJywgdHlwZTogJ3NpbmdsZVNlbGVjdCcsIHRpdGxlOiAnQT8nLCBvcHRpb25zOiBbXSB9XSB9O1xuXHRcdGNvbnN0IG5ld2VyID0geyBraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcsIHF1ZXN0aW9uczogW3sgaWQ6ICdiJywgdHlwZTogJ3NpbmdsZVNlbGVjdCcsIHRpdGxlOiAnQj8nLCBvcHRpb25zOiBbXSB9XSB9O1xuXG5cdFx0Y29uc3Qgc2VsZWN0ZWQgPSBzZWxlY3RQZW5kaW5nUGFydC5jYWxsKGNvbnRyb2xsZXIsIHBlbmRpbmdQYXJ0c01vZGVsKFtvbGRlciwgbmV3ZXJdKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VsZWN0ZWQ/LnBhcnQsIG9sZGVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VsZWN0ZWQ/LnJlcXVlc3RJZCwgJ3JlcS0xJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmVzIG9uIG9uY2UgdGhlIG9sZGVzdCBwZW5kaW5nIHBhcnQgaXMgcmVzb2x2ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIobmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc2VsZWN0UGVuZGluZ1BhcnQgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3NlbGVjdFBlbmRpbmdQYXJ0JykgYXMgKG1vZGVsOiBJQ2hhdE1vZGVsKSA9PiB7IHBhcnQ6IHsga2luZDogc3RyaW5nIH0gfSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhbnN3ZXJlZCA9IHsga2luZDogJ3F1ZXN0aW9uQ2Fyb3VzZWwnLCBpc1VzZWQ6IHRydWUsIHF1ZXN0aW9uczogW3sgaWQ6ICdhJywgdHlwZTogJ3NpbmdsZVNlbGVjdCcsIHRpdGxlOiAnQT8nLCBvcHRpb25zOiBbXSB9XSB9O1xuXHRcdGNvbnN0IG5ld2VyID0geyBraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcsIHF1ZXN0aW9uczogW3sgaWQ6ICdiJywgdHlwZTogJ3NpbmdsZVNlbGVjdCcsIHRpdGxlOiAnQj8nLCBvcHRpb25zOiBbXSB9XSB9O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlbGVjdFBlbmRpbmdQYXJ0LmNhbGwoY29udHJvbGxlciwgcGVuZGluZ1BhcnRzTW9kZWwoW2Fuc3dlcmVkLCBuZXdlcl0pKT8ucGFydCwgbmV3ZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWxlY3RQZW5kaW5nUGFydC5jYWxsKGNvbnRyb2xsZXIsIHBlbmRpbmdQYXJ0c01vZGVsKFthbnN3ZXJlZF0pKT8ucGFydCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnYW4gZXhlY3V0aW5nIHRvb2wgZG9lcyBub3Qgc2hhZG93IHRoZSBmb3JtIGl0IG9wZW5lZCcsICgpID0+IHtcblx0XHQvLyBhc2tRdWVzdGlvbnMgYXBwZW5kcyBpdHMgY2Fyb3VzZWwgZnJvbSBpbnNpZGUgaW52b2tlKCksIHNvIGl0cyBvd24gdG9vbFxuXHRcdC8vIHBhcnQgaXMgYWx3YXlzIGVhcmxpZXIgaW4gdGhlIGxpc3QuIEl0IGRlY2xhcmVzIG5vIGNvbmZpcm1hdGlvbk1lc3NhZ2VzXG5cdFx0Ly8gYW5kIHRoZXJlZm9yZSBzaXRzIGluIEV4ZWN1dGluZywgbm90IFdhaXRpbmdGb3JDb25maXJtYXRpb24gLSBpZiB0aGF0XG5cdFx0Ly8gZXZlciBjaGFuZ2VkLCBvbGRlc3QtZmlyc3Qgd291bGQgcHVibGlzaCBhbiBhcHByb3ZhbCBmb3IgYSBxdWVzdGlvbiBmb3JtXG5cdFx0Ly8gYW5kIHRoZSBmb3JtIHdvdWxkIG5ldmVyIHJlYWNoIHZvaWNlLlxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHNlbGVjdFBlbmRpbmdQYXJ0ID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19zZWxlY3RQZW5kaW5nUGFydCcpIGFzIChtb2RlbDogSUNoYXRNb2RlbCkgPT4geyBwYXJ0OiB7IGtpbmQ6IHN0cmluZyB9IH0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZXhlY3V0aW5nVG9vbCA9IHtcblx0XHRcdGtpbmQ6ICd0b29sSW52b2NhdGlvbicsXG5cdFx0XHRzdGF0ZTogb2JzZXJ2YWJsZVZhbHVlKCdzdGF0ZScsIHsgdHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nIH0pLFxuXHRcdH07XG5cdFx0Y29uc3QgY2Fyb3VzZWwgPSB7IGtpbmQ6ICdxdWVzdGlvbkNhcm91c2VsJywgcXVlc3Rpb25zOiBbeyBpZDogJ2EnLCB0eXBlOiAnc2luZ2xlU2VsZWN0JywgdGl0bGU6ICdBPycsIG9wdGlvbnM6IFtdIH1dIH07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VsZWN0UGVuZGluZ1BhcnQuY2FsbChjb250cm9sbGVyLCBwZW5kaW5nUGFydHNNb2RlbChbZXhlY3V0aW5nVG9vbCwgY2Fyb3VzZWxdKSk/LnBhcnQsIGNhcm91c2VsKTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgcHVibGlzaGluZyB0aGUgb2xkZXIgZm9ybSB3aGVuIGEgc2Vjb25kIG9uZSBhcnJpdmVzJywgKCkgPT4ge1xuXHRcdC8vIFdpdGhvdXQgdGhpcyB0aGUgcGF5bG9hZCBmbGlwcyB0byB0aGUgbmV3ZXN0IGZvcm0gd2l0aCBubyBuYXJyYXRpb24sIHNvXG5cdFx0Ly8gYW4gYW5zd2VyIG1lYW50IGZvciB0aGUgZmlyc3QgZm9ybSBpcyBhcHBsaWVkIHRvIHRoZSBzZWNvbmQuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIobmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgYnVpbGRQZW5kaW5nUGF5bG9hZCA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfYnVpbGRQZW5kaW5nUGF5bG9hZCcpIGFzIChtb2RlbDogSUNoYXRNb2RlbCkgPT4geyBwZW5kaW5nX2lkPzogc3RyaW5nOyBxdWVzdGlvbnM/OiB7IGlkOiBzdHJpbmcgfVtdIH0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgb2xkZXIgPSB7IGtpbmQ6ICdxdWVzdGlvbkNhcm91c2VsJywgcXVlc3Rpb25zOiBbeyBpZDogJ3JlZ2lvbicsIHR5cGU6ICdzaW5nbGVTZWxlY3QnLCB0aXRsZTogJ1doaWNoIHJlZ2lvbj8nLCBvcHRpb25zOiBbeyBpZDogJ3cnLCBsYWJlbDogJ1dlc3QgVVMnLCB2YWx1ZTogJ3dlc3R1cycgfV0gfV0gfTtcblx0XHRjb25zdCBuZXdlciA9IHsga2luZDogJ3F1ZXN0aW9uQ2Fyb3VzZWwnLCBxdWVzdGlvbnM6IFt7IGlkOiAndGllcicsIHR5cGU6ICdzaW5nbGVTZWxlY3QnLCB0aXRsZTogJ1doaWNoIHRpZXI/Jywgb3B0aW9uczogW3sgaWQ6ICdwJywgbGFiZWw6ICdQcmVtaXVtJywgdmFsdWU6ICdwcmVtaXVtJyB9XSB9XSB9O1xuXG5cdFx0Y29uc3QgcGF5bG9hZCA9IGJ1aWxkUGVuZGluZ1BheWxvYWQuY2FsbChjb250cm9sbGVyLCBwZW5kaW5nUGFydHNNb2RlbChbb2xkZXIsIG5ld2VyXSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXlsb2FkPy5xdWVzdGlvbnM/Lm1hcChxdWVzdGlvbiA9PiBxdWVzdGlvbi5pZCksIFsncmVnaW9uJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXlsb2FkPy5wZW5kaW5nX2lkLCBkZXJpdmVQZW5kaW5nSWQoJ3JlcS0xJywgb2xkZXIpKTtcblx0fSk7XG5cblx0dGVzdCgncGF5bG9hZCBhbmQgc3Bva2VuIGRldGFpbCBuYW1lIHRoZSBzYW1lIGZvcm0gd2hlbiB0d28gYXJlIG9wZW4nLCAoKSA9PiB7XG5cdFx0Ly8gSWYgdGhlc2UgdHdvIGRpc2FncmVlLCB0aGUgbmV3ZXIgZm9ybSBmbGlwcyB0aGUgZGV0YWlsLCB0aGF0IGNvdW50cyBhcyBhXG5cdFx0Ly8gdHJhbnNpdGlvbiwgYW5kIHRoZSBuYXJyYXRpb24gcGF0aCB0aGVuIHJlYWRzIHRoZSBPTERFUiBmb3JtIGFsb3VkIGFnYWluLlxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGJ1aWxkUGVuZGluZ1BheWxvYWQgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2J1aWxkUGVuZGluZ1BheWxvYWQnKSBhcyAobW9kZWw6IElDaGF0TW9kZWwpID0+IHsgcXVlc3Rpb25zPzogeyB0aXRsZTogc3RyaW5nIH1bXSB9IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGdldEFnZW50U3RhdGVJbmZvID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19nZXRBZ2VudFN0YXRlSW5mbycpIGFzIChtb2RlbDogSUNoYXRNb2RlbCkgPT4geyBzdGF0ZTogc3RyaW5nOyBkZXRhaWw/OiBzdHJpbmcgfTtcblx0XHRjb25zdCBvbGRlciA9IHsga2luZDogJ3F1ZXN0aW9uQ2Fyb3VzZWwnLCBxdWVzdGlvbnM6IFt7IGlkOiAncmVnaW9uJywgdHlwZTogJ3NpbmdsZVNlbGVjdCcsIHRpdGxlOiAnV2hpY2ggcmVnaW9uPycsIG9wdGlvbnM6IFtdIH1dIH07XG5cdFx0Y29uc3QgbmV3ZXIgPSB7IGtpbmQ6ICdxdWVzdGlvbkNhcm91c2VsJywgcXVlc3Rpb25zOiBbeyBpZDogJ3RpZXInLCB0eXBlOiAnc2luZ2xlU2VsZWN0JywgdGl0bGU6ICdXaGljaCB0aWVyPycsIG9wdGlvbnM6IFtdIH1dIH07XG5cdFx0Y29uc3QgbW9kZWwgPSBwZW5kaW5nUGFydHNNb2RlbChbb2xkZXIsIG5ld2VyXSwgJ3JlcS0xJywgJ0Fuc3dlciBxdWVzdGlvbnMgdG8gY29udGludWUuLi4nKTtcblxuXHRcdGNvbnN0IGluZm8gPSBnZXRBZ2VudFN0YXRlSW5mby5jYWxsKGNvbnRyb2xsZXIsIG1vZGVsKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmZvLnN0YXRlLCAnd2FpdGluZ19mb3JfY29uZmlybWF0aW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKGluZm8uZGV0YWlsPy5pbmNsdWRlcygnV2hpY2ggcmVnaW9uPycpKTtcblx0XHRhc3NlcnQub2soIWluZm8uZGV0YWlsPy5pbmNsdWRlcygnV2hpY2ggdGllcj8nKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidWlsZFBlbmRpbmdQYXlsb2FkLmNhbGwoY29udHJvbGxlciwgbW9kZWwpPy5xdWVzdGlvbnM/Lm1hcChxdWVzdGlvbiA9PiBxdWVzdGlvbi50aXRsZSksIFsnV2hpY2ggcmVnaW9uPyddKTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZHMgZWFjaCBhZ2VudCBzZXNzaW9uIGxhYmVsIHNvIHR3byB3YWl0aW5nIHNlc3Npb25zIGNhbiBiZSB0b2xkIGFwYXJ0JywgKCkgPT4ge1xuXHRcdC8vIFRoZSBsYWJlbCBpcyB0aGUgb25seSBodW1hbi1yZWFkYWJsZSBoYW5kbGUgdGhlIGJhY2tlbmQgaGFzLiBXaXRob3V0IGl0XG5cdFx0Ly8gZXZlcnkgc2Vzc2lvbiBpcyBcIlVudGl0bGVkXCIgYW5kIG5hbWluZyBvbmUgb3V0IGxvdWQgY2Fubm90IGRpc2FtYmlndWF0ZVxuXHRcdC8vIHdoaWNoIG9mIHR3byBvcGVuIGZvcm1zIGFuIGFuc3dlciBpcyBmb3IuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoXG5cdFx0XHRuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsXG5cdFx0XHRuZXcgVGVzdEFnZW50U2Vzc2lvbnNTZXJ2aWNlKFtcblx0XHRcdFx0YWdlbnRTZXNzaW9uRW50cnkoJ3ZzY29kZS1jaGF0Oi8vYScsICdBdXRoIGZpeCcsIEFnZW50U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0KSxcblx0XHRcdFx0YWdlbnRTZXNzaW9uRW50cnkoJ3ZzY29kZS1jaGF0Oi8vYicsICdCaWxsaW5nIHJlZmFjdG9yJywgQWdlbnRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpLFxuXHRcdFx0XSksXG5cdFx0KTtcblx0XHRjb25zdCBidWlsZFNlc3Npb25Db250ZXh0ID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19idWlsZFNlc3Npb25Db250ZXh0JykgYXMgKCkgPT4geyBzZXNzaW9uczogeyBpZDogc3RyaW5nOyBsYWJlbD86IHN0cmluZyB9W10gfTtcblxuXHRcdGNvbnN0IGxhYmVscyA9IGJ1aWxkU2Vzc2lvbkNvbnRleHQuY2FsbChjb250cm9sbGVyKS5zZXNzaW9ucy5tYXAoc2Vzc2lvbiA9PiBzZXNzaW9uLmxhYmVsKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFiZWxzLCBbJ0F1dGggZml4JywgJ0JpbGxpbmcgcmVmYWN0b3InXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29taXRzIHRoZSBsYWJlbCBmb3IgYW4gdW5sYWJlbGxlZCBhZ2VudCBzZXNzaW9uIHJhdGhlciB0aGFuIHNlbmRpbmcgYW4gZW1wdHkgb25lJywgKCkgPT4ge1xuXHRcdC8vIEFuIGVtcHR5IHN0cmluZyB3b3VsZCByZW5kZXIgYXMgYSBuYW1lbGVzcyBsYWJlbCB0aGUgbW9kZWwgbWlnaHQgdHJ5IHRvXG5cdFx0Ly8gcXVvdGUgYmFjayBhdCB0aGUgdXNlcjsgYWJzZW50IGxldHMgdGhlIGJhY2tlbmQgZmFsbCBiYWNrIHRvIFwiVW50aXRsZWRcIi5cblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihcblx0XHRcdG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCxcblx0XHRcdG5ldyBUZXN0QWdlbnRTZXNzaW9uc1NlcnZpY2UoW2FnZW50U2Vzc2lvbkVudHJ5KCd2c2NvZGUtY2hhdDovL2EnLCB1bmRlZmluZWQsIEFnZW50U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0KV0pLFxuXHRcdCk7XG5cdFx0Y29uc3QgYnVpbGRTZXNzaW9uQ29udGV4dCA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfYnVpbGRTZXNzaW9uQ29udGV4dCcpIGFzICgpID0+IHsgc2Vzc2lvbnM6IHsgaWQ6IHN0cmluZzsgbGFiZWw/OiBzdHJpbmcgfVtdIH07XG5cblx0XHRjb25zdCBbc2Vzc2lvbl0gPSBidWlsZFNlc3Npb25Db250ZXh0LmNhbGwoY29udHJvbGxlcikuc2Vzc2lvbnM7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5pZCwgJ3ZzY29kZS1jaGF0Oi8vYScpO1xuXHRcdGFzc2VydC5vayghT2JqZWN0Lmhhc093bihzZXNzaW9uLCAnbGFiZWwnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbmRzIHRoZSBhZ2VudCBzZXNzaW9uIGxhYmVsIG9uY2UgaXRzIG1vZGVsIGlzIHJlc2lkZW50IHRvbycsICgpID0+IHtcblx0XHQvLyBUaGUgbGFiZWwgaXMgZW1pdHRlZCBmcm9tIHR3byBicmFuY2hlcyAtIG1vZGVsIHJlc2lkZW50IG9yIG5vdCAtIGFuZCBhXG5cdFx0Ly8gc2Vzc2lvbiBmbGlwcyBiZXR3ZWVuIHRoZW0gYXMgVlMgQ29kZSBsb2FkcyBhbmQgZGlzcG9zZXMgbW9kZWxzLiBPbmx5XG5cdFx0Ly8gY292ZXJpbmcgdGhlIHVubG9hZGVkIGJyYW5jaCB3b3VsZCBsZXQgdGhlIGxvYWRlZCBvbmUgbG9zZSB0aGUgbGFiZWxcblx0XHQvLyBzaWxlbnRseSwgd2hpY2ggaXMgZXhhY3RseSB3aGVuIGEgZm9ybSBpcyBvbiBzY3JlZW4gdG8gZGlzYW1iaWd1YXRlLlxuXHRcdGNvbnN0IGNoYXRTZXJ2aWNlID0gbmV3IENvbnRyb2xsYWJsZUNoYXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0Oi8vYScpO1xuXHRcdGNoYXRTZXJ2aWNlLnNldE1vZGVscyhbcGVuZGluZ0NvbmZpcm1hdGlvbk1vZGVsKHJlc291cmNlKV0pO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKFxuXHRcdFx0bmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGNoYXRTZXJ2aWNlLCB1bmRlZmluZWQsXG5cdFx0XHRuZXcgVGVzdEFnZW50U2Vzc2lvbnNTZXJ2aWNlKFthZ2VudFNlc3Npb25FbnRyeShyZXNvdXJjZS50b1N0cmluZygpLCAnQXV0aCBmaXgnLCBBZ2VudFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCldKSxcblx0XHQpO1xuXHRcdGNvbnN0IGJ1aWxkU2Vzc2lvbkNvbnRleHQgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2J1aWxkU2Vzc2lvbkNvbnRleHQnKSBhcyAoKSA9PiB7IHNlc3Npb25zOiB7IGlkOiBzdHJpbmc7IGxhYmVsPzogc3RyaW5nOyBhZ2VudF9zdGF0ZTogc3RyaW5nIH1bXSB9O1xuXHRcdC8vIE1ha2UgaXQgdGhlIGFjdGl2ZSBzZXNzaW9uOiBhIGJhY2tncm91bmQgY29uZmlybWF0aW9uIGlzIGRlbGliZXJhdGVseVxuXHRcdC8vIGRvd25ncmFkZWQgdG8gYHRoaW5raW5nYCwgd2hpY2ggd291bGQgaGlkZSB3aGV0aGVyIHRoZSByZXNpZGVudCBicmFuY2hcblx0XHQvLyByYW4gYXQgYWxsLlxuXHRcdGNvbnRyb2xsZXIuc2V0VGFyZ2V0U2Vzc2lvbihyZXNvdXJjZSk7XG5cblx0XHRjb25zdCBbc2Vzc2lvbl0gPSBidWlsZFNlc3Npb25Db250ZXh0LmNhbGwoY29udHJvbGxlcikuc2Vzc2lvbnM7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi5hZ2VudF9zdGF0ZSwgJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmxhYmVsLCAnQXV0aCBmaXgnKTtcblx0fSk7XG5cblx0dGVzdCgnYW4gb2xkZXIgdG9vbCBjb25maXJtYXRpb24gaG9sZHMgdGhlIHR1cm4gYWhlYWQgb2YgYSBuZXdlciBmb3JtJywgKCkgPT4ge1xuXHRcdC8vIFF1ZXVlIHNlbWFudGljcyBhcHBsaWVkIHVuaWZvcm1seTogYXBwcm92ZSB0aGUgY29tbWFuZCB5b3Ugd2VyZSBhc2tlZFxuXHRcdC8vIGFib3V0LCB0aGVuIGFuc3dlciB0aGUgcXVlc3Rpb25zLlxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGJ1aWxkUGVuZGluZ1BheWxvYWQgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2J1aWxkUGVuZGluZ1BheWxvYWQnKSBhcyAobW9kZWw6IElDaGF0TW9kZWwpID0+IHsgdHlwZT86IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGdldEFnZW50U3RhdGVJbmZvID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19nZXRBZ2VudFN0YXRlSW5mbycpIGFzIChtb2RlbDogSUNoYXRNb2RlbCkgPT4geyBkZXRhaWw/OiBzdHJpbmcgfTtcblx0XHRjb25zdCBhcHByb3ZhbCA9IHtcblx0XHRcdGtpbmQ6ICd0b29sSW52b2NhdGlvbicsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBhIGNvbW1hbmQnLFxuXHRcdFx0c3RhdGU6IG9ic2VydmFibGVWYWx1ZSgnc3RhdGUnLCB7XG5cdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgY29tbWFuZDogJ2RvY2tlciBwdXNoIG15YXBwOmxhdGVzdCcgfSxcblx0XHRcdH0pLFxuXHRcdH07XG5cdFx0Y29uc3QgZm9ybSA9IHsga2luZDogJ3F1ZXN0aW9uQ2Fyb3VzZWwnLCBxdWVzdGlvbnM6IFt7IGlkOiAndGllcicsIHR5cGU6ICdzaW5nbGVTZWxlY3QnLCB0aXRsZTogJ1doaWNoIHRpZXI/Jywgb3B0aW9uczogW10gfV0gfTtcblx0XHRjb25zdCBtb2RlbCA9IHBlbmRpbmdQYXJ0c01vZGVsKFthcHByb3ZhbCwgZm9ybV0sICdyZXEtMScsICdSdW4gY29tbWFuZD8nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWlsZFBlbmRpbmdQYXlsb2FkLmNhbGwoY29udHJvbGxlciwgbW9kZWwpPy50eXBlLCAnYXBwcm92YWwnKTtcblx0XHRhc3NlcnQub2soZ2V0QWdlbnRTdGF0ZUluZm8uY2FsbChjb250cm9sbGVyLCBtb2RlbCkuZGV0YWlsPy5pbmNsdWRlcygnUnVuIGEgY29tbWFuZCcpKTtcblx0fSk7XG5cblx0dGVzdCgnYW4gb2xkZXIgY29uZmlybWF0aW9uIHN1cHByZXNzZXMgYSBuZXdlciBmb3JtIHBheWxvYWQgYnV0IHN0aWxsIHNwZWFrcycsICgpID0+IHtcblx0XHQvLyBgY29uZmlybWF0aW9uYCBoYXMgbm8gdHlwZWQgd2lyZSBzaGFwZSwgc28gdGhlIHF1ZXVlIGNvc3RzIHRoZSBuZXdlciBmb3JtXG5cdFx0Ly8gaXRzIHN0cnVjdHVyZWQgcGF5bG9hZCB1bnRpbCB0aGUgY29uZmlybWF0aW9uIGlzIHJlc29sdmVkLiBEZWxpYmVyYXRlLlxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGJ1aWxkUGVuZGluZ1BheWxvYWQgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2J1aWxkUGVuZGluZ1BheWxvYWQnKSBhcyAobW9kZWw6IElDaGF0TW9kZWwpID0+IHVua25vd247XG5cdFx0Y29uc3QgZ2V0QWdlbnRTdGF0ZUluZm8gPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2dldEFnZW50U3RhdGVJbmZvJykgYXMgKG1vZGVsOiBJQ2hhdE1vZGVsKSA9PiB7IGRldGFpbD86IHN0cmluZyB9O1xuXHRcdGNvbnN0IGNvbmZpcm1hdGlvbiA9IHsga2luZDogJ2NvbmZpcm1hdGlvbicsIHRpdGxlOiAnRGVsZXRlIHRoZSBicmFuY2g/JyB9O1xuXHRcdGNvbnN0IGZvcm0gPSB7IGtpbmQ6ICdxdWVzdGlvbkNhcm91c2VsJywgcXVlc3Rpb25zOiBbeyBpZDogJ3RpZXInLCB0eXBlOiAnc2luZ2xlU2VsZWN0JywgdGl0bGU6ICdXaGljaCB0aWVyPycsIG9wdGlvbnM6IFtdIH1dIH07XG5cdFx0Y29uc3QgbW9kZWwgPSBwZW5kaW5nUGFydHNNb2RlbChbY29uZmlybWF0aW9uLCBmb3JtXSwgJ3JlcS0xJywgJ0RlbGV0ZSB0aGUgYnJhbmNoPycpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1aWxkUGVuZGluZ1BheWxvYWQuY2FsbChjb250cm9sbGVyLCBtb2RlbCksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKGdldEFnZW50U3RhdGVJbmZvLmNhbGwoY29udHJvbGxlciwgbW9kZWwpLmRldGFpbD8uaW5jbHVkZXMoJ0RlbGV0ZSB0aGUgYnJhbmNoPycpKTtcblx0fSk7XG5cblx0dGVzdCgnYSBuZXdlciBmb3JtIGFuc3dlcmVkIGJ5IG1vdXNlIGxlYXZlcyB0aGUgZm9jdXNlZCBmb3JtIHVudG91Y2hlZCcsICgpID0+IHtcblx0XHQvLyBSZXNvbHZpbmcgQiBvdXQgb2Ygb3JkZXIgbXVzdCBub3QgbW92ZSB0aGUgdHVybiwgYW5kIG11c3Qgbm90IGNoYW5nZSB0aGVcblx0XHQvLyBkZXRhaWwgZWl0aGVyIC0gYSBkZXRhaWwgY2hhbmdlIGFsb25lIGNvdW50cyBhcyBhIHRyYW5zaXRpb24gYW5kIHdvdWxkXG5cdFx0Ly8gcmVhZCBBIGFsb3VkIGEgc2Vjb25kIHRpbWUuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIobmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgYnVpbGRQZW5kaW5nUGF5bG9hZCA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfYnVpbGRQZW5kaW5nUGF5bG9hZCcpIGFzIChtb2RlbDogSUNoYXRNb2RlbCkgPT4geyBxdWVzdGlvbnM/OiB7IGlkOiBzdHJpbmcgfVtdIH0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZ2V0QWdlbnRTdGF0ZUluZm8gPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2dldEFnZW50U3RhdGVJbmZvJykgYXMgKG1vZGVsOiBJQ2hhdE1vZGVsKSA9PiB7IGRldGFpbD86IHN0cmluZyB9O1xuXHRcdGNvbnN0IG9sZGVyID0geyBraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcsIHF1ZXN0aW9uczogW3sgaWQ6ICdyZWdpb24nLCB0eXBlOiAnc2luZ2xlU2VsZWN0JywgdGl0bGU6ICdXaGljaCByZWdpb24/Jywgb3B0aW9uczogW10gfV0gfTtcblx0XHRjb25zdCBuZXdlckFuc3dlcmVkID0geyBraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcsIGlzVXNlZDogdHJ1ZSwgcXVlc3Rpb25zOiBbeyBpZDogJ3RpZXInLCB0eXBlOiAnc2luZ2xlU2VsZWN0JywgdGl0bGU6ICdXaGljaCB0aWVyPycsIG9wdGlvbnM6IFtdIH1dIH07XG5cdFx0Y29uc3QgbW9kZWwgPSBwZW5kaW5nUGFydHNNb2RlbChbb2xkZXIsIG5ld2VyQW5zd2VyZWRdLCAncmVxLTEnLCAnQW5zd2VyIHF1ZXN0aW9ucyB0byBjb250aW51ZS4uLicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidWlsZFBlbmRpbmdQYXlsb2FkLmNhbGwoY29udHJvbGxlciwgbW9kZWwpPy5xdWVzdGlvbnM/Lm1hcChxdWVzdGlvbiA9PiBxdWVzdGlvbi5pZCksIFsncmVnaW9uJ10pO1xuXHRcdGNvbnN0IGRldGFpbCA9IGdldEFnZW50U3RhdGVJbmZvLmNhbGwoY29udHJvbGxlciwgbW9kZWwpLmRldGFpbDtcblx0XHRhc3NlcnQub2soZGV0YWlsPy5pbmNsdWRlcygnV2hpY2ggcmVnaW9uPycpKTtcblx0XHRhc3NlcnQub2soIWRldGFpbD8uaW5jbHVkZXMoJ1doaWNoIHRpZXI/JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYXRhbCBkaXNjb25uZWN0IGNsZWFycyByb3V0aW5nIHRhcmdldCBhbmQgcGVuZGluZyBjb25maXJtYXRpb25zIGFuZCB0aGUgdHJhY2tlciBjYW5ub3QgcmVwb3B1bGF0ZSB0aGVtIGJlZm9yZSByZWNvbm5lY3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBjaGF0U2VydmljZSA9IG5ldyBDb250cm9sbGFibGVDaGF0U2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHZvaWNlQ2xpZW50U2VydmljZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGNoYXRTZXJ2aWNlKTtcblx0XHRjb25zdCBoYW5kbGVGYXRhbERpc2Nvbm5lY3QgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2hhbmRsZUZhdGFsRGlzY29ubmVjdCcpIGFzIChjb2RlOiBudW1iZXIsIHJlYXNvbjogc3RyaW5nKSA9PiB2b2lkO1xuXG5cdFx0Y29udHJvbGxlci5zZXRUYXJnZXRTZXNzaW9uKFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKSk7XG5cdFx0Y2hhdFNlcnZpY2Uuc2V0TW9kZWxzKFtwZW5kaW5nQ29uZmlybWF0aW9uTW9kZWwoVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3Q6L3Nlc3Npb24tMScpKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLnBlbmRpbmdUb29sQ29uZmlybWF0aW9ucy5nZXQoKS5sZW5ndGgsIDEpO1xuXG5cdFx0Ly8gNDAwOCA9IGFub3RoZXIgd2luZG93IHRvb2sgb3ZlciB0aGUgc2luZ2xlIHZvaWNlIHNlc3Npb24gKHRlcm1pbmFsKS5cblx0XHRoYW5kbGVGYXRhbERpc2Nvbm5lY3QuY2FsbChjb250cm9sbGVyLCA0MDA4LCAndGFrZW4gb3ZlcicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIudGFyZ2V0U2Vzc2lvbi5nZXQoKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5wZW5kaW5nVG9vbENvbmZpcm1hdGlvbnMuZ2V0KCkubGVuZ3RoLCAwKTtcblxuXHRcdGNoYXRTZXJ2aWNlLnNldE1vZGVscyhbcGVuZGluZ0NvbmZpcm1hdGlvbk1vZGVsKFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnKSldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5wZW5kaW5nVG9vbENvbmZpcm1hdGlvbnMuZ2V0KCkubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnYmFyZ2UtaW4gZHJvcHMgZGVsYXllZCBhdWRpbyBmcm9tIHRoZSBpbnRlcnJ1cHRlZCB0dXJuIGJlZm9yZSBwbGF5aW5nIHRoZSBmb2xsb3ctdXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCB0dHNQbGF5YmFja1NlcnZpY2UgPSBuZXcgVGVzdFR0c1BsYXliYWNrU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gbmV3IFRlc3RDb21tYW5kU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKFxuXHRcdFx0dm9pY2VDbGllbnRTZXJ2aWNlLFxuXHRcdFx0dHRzUGxheWJhY2tTZXJ2aWNlLFxuXHRcdFx0Y29tbWFuZFNlcnZpY2UsXG5cdFx0XHROdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyAnYWdlbnRzLnZvaWNlLmhhbmRzRnJlZSc6IHRydWUgfSksXG5cdFx0KTtcblx0XHRhd2FpdCBjb250cm9sbGVyLmNvbm5lY3QobWFpbldpbmRvdyk7XG5cblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICdzdG9yeS1zdGFydCcsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiBmYWxzZSxcblx0XHRcdHR1cm5JZDogJ3N0b3J5LXR1cm4nLFxuXHRcdFx0cmVzcG9uc2VJZDogJ3N0b3J5LXJlc3BvbnNlLTEnLFxuXHRcdH0pO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJ3F1ZXVlZC1zdG9yeS1zZWdtZW50Jyxcblx0XHRcdGlzRmlyc3RDaHVuazogdHJ1ZSxcblx0XHRcdGlzRmluYWw6IGZhbHNlLFxuXHRcdFx0dHVybklkOiAnc3RvcnktdHVybicsXG5cdFx0XHRyZXNwb25zZUlkOiAnc3RvcnktcmVzcG9uc2UtMicsXG5cdFx0fSk7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVTcGVlY2hTdGFydGVkKCk7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVCYXJnZUluKHtcblx0XHRcdHR1cm5JZDogJ2ZvbGxvdy11cC10dXJuJyxcblx0XHRcdGludGVycnVwdGVkVHVybklkOiAnc3RvcnktdHVybicsXG5cdFx0fSk7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVUcmFuc2NyaXB0aW9uKHtcblx0XHRcdHRleHQ6ICdhY3R1YWxseSBzY3JhdGNoIHRoYXQgYW5kIGNoZWNrIHRoZSBjb2RlIGluIHRoZSByZXBvc2l0b3J5Jyxcblx0XHRcdHN0YXR1czogJ2ZpbmFsJyxcblx0XHRcdHR1cm5JZDogJ2ZvbGxvdy11cC10dXJuJyxcblx0XHRcdHJldmlzaW9uOiAxLFxuXHRcdH0pO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlVG9vbENhbGwoe1xuXHRcdFx0Y2FsbElkOiAnc2VuZC1mb2xsb3ctdXAnLFxuXHRcdFx0bmFtZTogJ3NlbmRfdG9fY2hhdCcsXG5cdFx0XHRhcmdzOiB7IHRleHQ6ICdhY3R1YWxseSBzY3JhdGNoIHRoYXQgYW5kIGNoZWNrIHRoZSBjb2RlIGluIHRoZSByZXBvc2l0b3J5JyB9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IHZvaWNlQ2xpZW50U2VydmljZS50b29sUmVzdWx0UmVjZWl2ZWQ7XG5cblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICdzdGFsZS1zdG9yeS1jb250aW51YXRpb24nLFxuXHRcdFx0aXNGaXJzdENodW5rOiB0cnVlLFxuXHRcdFx0aXNGaW5hbDogZmFsc2UsXG5cdFx0XHR0dXJuSWQ6ICdzdG9yeS10dXJuJyxcblx0XHRcdHJlc3BvbnNlSWQ6ICdzdG9yeS1yZXNwb25zZS0yJyxcblx0XHR9KTtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICdmb2xsb3ctdXAtYWNrbm93bGVkZ2VtZW50Jyxcblx0XHRcdGlzRmlyc3RDaHVuazogdHJ1ZSxcblx0XHRcdGlzRmluYWw6IGZhbHNlLFxuXHRcdFx0dHVybklkOiAnZm9sbG93LXVwLXR1cm4nLFxuXHRcdFx0cmVzcG9uc2VJZDogJ2ZvbGxvdy11cC1yZXNwb25zZScsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBsYXllZEF1ZGlvOiB0dHNQbGF5YmFja1NlcnZpY2UucGxheWVkQXVkaW8sXG5cdFx0XHRzdG9wQ291bnQ6IHR0c1BsYXliYWNrU2VydmljZS5zdG9wQ291bnQsXG5cdFx0XHR0cmFuc2NyaXB0OiBjb250cm9sbGVyLnRyYW5zY3JpcHRUdXJucy5nZXQoKS5hdCgtMSksXG5cdFx0XHRhY2NlcHRlZElucHV0czogY29tbWFuZFNlcnZpY2UuYWNjZXB0ZWRJbnB1dHMsXG5cdFx0XHR0b29sUmVzdWx0czogdm9pY2VDbGllbnRTZXJ2aWNlLnRvb2xSZXN1bHRzLFxuXHRcdH0sIHtcblx0XHRcdHBsYXllZEF1ZGlvOiBbJ3N0b3J5LXN0YXJ0JywgJ2ZvbGxvdy11cC1hY2tub3dsZWRnZW1lbnQnXSxcblx0XHRcdHN0b3BDb3VudDogMixcblx0XHRcdHRyYW5zY3JpcHQ6IHtcblx0XHRcdFx0c3BlYWtlcjogJ3VzZXInLFxuXHRcdFx0XHR0ZXh0OiAnYWN0dWFsbHkgc2NyYXRjaCB0aGF0IGFuZCBjaGVjayB0aGUgY29kZSBpbiB0aGUgcmVwb3NpdG9yeScsXG5cdFx0XHRcdGNvbW1pdHRlZDogJycsXG5cdFx0XHRcdGlzUGFydGlhbDogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0YWNjZXB0ZWRJbnB1dHM6IFsnYWN0dWFsbHkgc2NyYXRjaCB0aGF0IGFuZCBjaGVjayB0aGUgY29kZSBpbiB0aGUgcmVwb3NpdG9yeSddLFxuXHRcdFx0dG9vbFJlc3VsdHM6IFt7IGNhbGxJZDogJ3NlbmQtZm9sbG93LXVwJywgcmVzdWx0OiAnb2snIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzcGVlY2gtc3RhcnRlZCBhbG9uZSBpbnRlcnJ1cHRzIHBsYXliYWNrIGFuZCBhY2NlcHRzIHRoZSBzY29wZWQgcGFzc2l2ZSB0dXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdHRzUGxheWJhY2tTZXJ2aWNlID0gbmV3IFRlc3RUdHNQbGF5YmFja1NlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHR0c1BsYXliYWNrU2VydmljZSk7XG5cdFx0YXdhaXQgY29udHJvbGxlci5jb25uZWN0KG1haW5XaW5kb3cpO1xuXG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVBdWRpb1Jlc3BvbnNlKHtcblx0XHRcdGF1ZGlvOiAnc3Rvcnktc3RhcnQnLFxuXHRcdFx0aXNGaXJzdENodW5rOiB0cnVlLFxuXHRcdFx0aXNGaW5hbDogZmFsc2UsXG5cdFx0XHR0dXJuSWQ6ICdzdG9yeS10dXJuJyxcblx0XHRcdHJlc3BvbnNlSWQ6ICdzdG9yeS1yZXNwb25zZScsXG5cdFx0fSk7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVTcGVlY2hTdGFydGVkKCdmb2xsb3ctdXAtdHVybicpO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlVHJhbnNjcmlwdGlvbih7XG5cdFx0XHR0ZXh0OiAnY2hlY2sgdGhlIHJlcG9zaXRvcnkgaW5zdGVhZCcsXG5cdFx0XHRzdGF0dXM6ICdmaW5hbCcsXG5cdFx0XHR0dXJuSWQ6ICdmb2xsb3ctdXAtdHVybicsXG5cdFx0XHRyZXZpc2lvbjogMSxcblx0XHR9KTtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICdzdGFsZS1zdG9yeScsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IGZhbHNlLFxuXHRcdFx0aXNGaW5hbDogdHJ1ZSxcblx0XHRcdHR1cm5JZDogJ3N0b3J5LXR1cm4nLFxuXHRcdFx0cmVzcG9uc2VJZDogJ3N0b3J5LXJlc3BvbnNlJyxcblx0XHR9KTtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICdmb2xsb3ctdXAnLFxuXHRcdFx0aXNGaXJzdENodW5rOiB0cnVlLFxuXHRcdFx0aXNGaW5hbDogZmFsc2UsXG5cdFx0XHR0dXJuSWQ6ICdmb2xsb3ctdXAtdHVybicsXG5cdFx0XHRyZXNwb25zZUlkOiAnZm9sbG93LXVwLXJlc3BvbnNlJyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGxheWVkQXVkaW86IHR0c1BsYXliYWNrU2VydmljZS5wbGF5ZWRBdWRpbyxcblx0XHRcdHN0b3BDb3VudDogdHRzUGxheWJhY2tTZXJ2aWNlLnN0b3BDb3VudCxcblx0XHRcdHRyYW5zY3JpcHQ6IGNvbnRyb2xsZXIudHJhbnNjcmlwdFR1cm5zLmdldCgpLmF0KC0xKSxcblx0XHR9LCB7XG5cdFx0XHRwbGF5ZWRBdWRpbzogWydzdG9yeS1zdGFydCcsICdmb2xsb3ctdXAnXSxcblx0XHRcdHN0b3BDb3VudDogMSxcblx0XHRcdHRyYW5zY3JpcHQ6IHtcblx0XHRcdFx0c3BlYWtlcjogJ3VzZXInLFxuXHRcdFx0XHR0ZXh0OiAnY2hlY2sgdGhlIHJlcG9zaXRvcnkgaW5zdGVhZCcsXG5cdFx0XHRcdGNvbW1pdHRlZDogJycsXG5cdFx0XHRcdGlzUGFydGlhbDogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFsZSBpbnRlcnJ1cHRlZCBhdWRpbyBkb2VzIG5vdCBjb25zdW1lIGZvbGxvdy11cCBsYXRlbmN5IHRlbGVtZXRyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBuZXcgVGVzdFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIG5ldyBUZXN0VHRzUGxheWJhY2tTZXJ2aWNlKCksIG5ldyBUZXN0Q29tbWFuZFNlcnZpY2UoKSwgdGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0YXdhaXQgY29udHJvbGxlci5jb25uZWN0KG1haW5XaW5kb3cpO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlU3BlZWNoU3RhcnRlZCgpO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQmFyZ2VJbih7XG5cdFx0XHR0dXJuSWQ6ICdmb2xsb3ctdXAtdHVybicsXG5cdFx0XHRpbnRlcnJ1cHRlZFR1cm5JZDogJ3N0b3J5LXR1cm4nLFxuXHRcdH0pO1xuXHRcdGNsb2NrLnNldFN5c3RlbVRpbWUoNV8wMDApO1xuXHRcdFJlZmxlY3Quc2V0KGNvbnRyb2xsZXIsICdfdGVsZW1ldHJ5UHR0RG93bk1zJywgNTAwKTtcblx0XHRSZWZsZWN0LnNldChjb250cm9sbGVyLCAnX3RlbGVtZXRyeUZpcnN0VHJhbnNjcmlwdGlvbk1zJywgNzUwKTtcblx0XHRSZWZsZWN0LnNldChjb250cm9sbGVyLCAnX3RlbGVtZXRyeVB0dFVwTXMnLCAxXzAwMCk7XG5cblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICdzdGFsZS1zdG9yeScsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiBmYWxzZSxcblx0XHRcdHR1cm5JZDogJ3N0b3J5LXR1cm4nLFxuXHRcdFx0cmVzcG9uc2VJZDogJ3N0b3J5LXJlc3BvbnNlJyxcblx0XHR9KTtcblx0XHRjbG9jay50aWNrKDFfMDAwKTtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICdmb2xsb3ctdXAnLFxuXHRcdFx0aXNGaXJzdENodW5rOiB0cnVlLFxuXHRcdFx0aXNGaW5hbDogZmFsc2UsXG5cdFx0XHR0dXJuSWQ6ICdmb2xsb3ctdXAtdHVybicsXG5cdFx0XHRyZXNwb25zZUlkOiAnZm9sbG93LXVwLXJlc3BvbnNlJyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bGF0ZW5jeUV2ZW50czogdGVsZW1ldHJ5U2VydmljZS5ldmVudHMuZmlsdGVyKGV2ZW50ID0+IGV2ZW50Lm5hbWUgPT09ICd2b2ljZUxhdGVuY3knKSxcblx0XHRcdHBlbmRpbmdMYXRlbmN5U3RhcnQ6IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfdGVsZW1ldHJ5UHR0VXBNcycpLFxuXHRcdH0sIHtcblx0XHRcdGxhdGVuY3lFdmVudHM6IFt7XG5cdFx0XHRcdG5hbWU6ICd2b2ljZUxhdGVuY3knLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0dGltZVRvRmlyc3RUcmFuc2NyaXB0aW9uTXM6IDI1MCxcblx0XHRcdFx0XHRlbmRUb0VuZFR1cm5NczogNV8wMDAsXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSxcblx0XHRcdHBlbmRpbmdMYXRlbmN5U3RhcnQ6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYmFyZ2UtaW4gcHVyZ2VzIGRlZmVycmVkIGF1ZGlvIGJlZm9yZSB0aGUgaW50ZXJydXB0ZWQgc2Vzc2lvbiBpcyBmb2N1c2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdHRzUGxheWJhY2tTZXJ2aWNlID0gbmV3IFRlc3RUdHNQbGF5YmFja1NlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHR0c1BsYXliYWNrU2VydmljZSk7XG5cdFx0Y29uc3QgYmFja2dyb3VuZFNlc3Npb24gPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovYmFja2dyb3VuZC1zZXNzaW9uJyk7XG5cdFx0YXdhaXQgY29udHJvbGxlci5jb25uZWN0KG1haW5XaW5kb3cpO1xuXG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVBdWRpb1Jlc3BvbnNlKHtcblx0XHRcdGF1ZGlvOiAnYnVmZmVyZWQtc3RvcnknLFxuXHRcdFx0aXNGaXJzdENodW5rOiB0cnVlLFxuXHRcdFx0aXNGaW5hbDogdHJ1ZSxcblx0XHRcdGNvZGluZ1Nlc3Npb25JZDogYmFja2dyb3VuZFNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdHR1cm5JZDogJ3N0b3J5LXR1cm4nLFxuXHRcdFx0cmVzcG9uc2VJZDogJ3N0b3J5LXJlc3BvbnNlJyxcblx0XHR9KTtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZVNwZWVjaFN0YXJ0ZWQoKTtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUJhcmdlSW4oe1xuXHRcdFx0dHVybklkOiAnZm9sbG93LXVwLXR1cm4nLFxuXHRcdFx0aW50ZXJydXB0ZWRUdXJuSWQ6ICdzdG9yeS10dXJuJyxcblx0XHR9KTtcblx0XHRjb250cm9sbGVyLnNldEFjdGl2ZVNlc3Npb25TaG93bihiYWNrZ3JvdW5kU2Vzc2lvbik7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVBdWRpb1Jlc3BvbnNlKHtcblx0XHRcdGF1ZGlvOiAnZm9sbG93LXVwJyxcblx0XHRcdGlzRmlyc3RDaHVuazogdHJ1ZSxcblx0XHRcdGlzRmluYWw6IGZhbHNlLFxuXHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBiYWNrZ3JvdW5kU2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0dHVybklkOiAnZm9sbG93LXVwLXR1cm4nLFxuXHRcdFx0cmVzcG9uc2VJZDogJ2ZvbGxvdy11cC1yZXNwb25zZScsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHR0c1BsYXliYWNrU2VydmljZS5wbGF5ZWRBdWRpbywgWydmb2xsb3ctdXAnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NwZWVjaC1zdGFydGVkIGtlZXBzIGFuIGludGVycnVwdGVkIHNvbGljaXRlZCBuYXJyYXRpb24gcmV0cnlhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdHRzUGxheWJhY2tTZXJ2aWNlID0gbmV3IFRlc3RUdHNQbGF5YmFja1NlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHR0c1BsYXliYWNrU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJztcblx0XHRjb25zdCBuYXJyYXRlID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19uYXJyYXRlJykgYXMgKHNlc3Npb25JZDogc3RyaW5nLCBraW5kOiAncmVzcG9uc2UnIHwgJ2NvbmZpcm1hdGlvbicsIHRleHQ6IHN0cmluZykgPT4gYm9vbGVhbjtcblx0XHRhd2FpdCBjb250cm9sbGVyLmNvbm5lY3QobWFpbldpbmRvdyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmFycmF0ZS5jYWxsKGNvbnRyb2xsZXIsIHNlc3Npb25JZCwgJ3Jlc3BvbnNlJywgJ0RvbmUnKSwgdHJ1ZSk7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVBdWRpb1Jlc3BvbnNlKHtcblx0XHRcdGF1ZGlvOiAnbmFycmF0aW9uJyxcblx0XHRcdGlzRmlyc3RDaHVuazogdHJ1ZSxcblx0XHRcdGlzRmluYWw6IGZhbHNlLFxuXHRcdFx0cmVzcG9uc2VJZDogJ25hcnJhdGlvbi0xJyxcblx0XHR9KTtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZVNwZWVjaFN0YXJ0ZWQoKTtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZU5hcnJhdGlvbkludGVycnVwdGVkKHtcblx0XHRcdG5hcnJhdGlvbklkOiAnbmFycmF0aW9uLTEnLFxuXHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBzZXNzaW9uSWQsXG5cdFx0fSk7XG5cdFx0UmVmbGVjdC5zZXQoY29udHJvbGxlciwgJ19jdXJyZW50TmFycmF0YWJsZScsICgpID0+ICh7IGtpbmQ6ICdyZXNwb25zZScsIHRleHQ6ICdEb25lJyB9KSk7XG5cdFx0Y29udHJvbGxlci5zZXRBY3RpdmVTZXNzaW9uU2hvd24oVVJJLnBhcnNlKHNlc3Npb25JZCkpO1xuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlTmFycmF0aW9uVW5ibG9ja2VkKHtcblx0XHRcdG5hcnJhdGlvbklkOiAnbmFycmF0aW9uLTEnLFxuXHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBzZXNzaW9uSWQsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmV0cnlSZXF1ZXN0ID0gdm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzLmF0KC0xKTtcblx0XHRpZiAoIXJldHJ5UmVxdWVzdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdSZXRyeSBuYXJyYXRpb24gd2FzIG5vdCByZXF1ZXN0ZWQnKTtcblx0XHR9XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVBdWRpb1Jlc3BvbnNlKHtcblx0XHRcdGF1ZGlvOiAncmV0cnknLFxuXHRcdFx0aXNGaXJzdENodW5rOiB0cnVlLFxuXHRcdFx0aXNGaW5hbDogZmFsc2UsXG5cdFx0XHR0dXJuSWQ6ICdyZXRyeS10dXJuJyxcblx0XHRcdHJlc3BvbnNlSWQ6IHJldHJ5UmVxdWVzdC5uYXJyYXRpb25JZCxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHBlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb25zID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19wZW5kaW5nU29saWNpdGVkTmFycmF0aW9ucycpIGFzIE1hcDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGNvbnN0IGRlZmVycmVkTmFycmF0aW9ucyA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfZGVmZXJyZWROYXJyYXRpb25zJykgYXMgTWFwPHN0cmluZywgdW5rbm93bj47XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXF1ZXN0czogdm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzLFxuXHRcdFx0cGxheWVkQXVkaW86IHR0c1BsYXliYWNrU2VydmljZS5wbGF5ZWRBdWRpbyxcblx0XHRcdHBlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb25zOiBbLi4ucGVuZGluZ1NvbGljaXRlZE5hcnJhdGlvbnMua2V5cygpXSxcblx0XHRcdGRlZmVycmVkTmFycmF0aW9uczogZGVmZXJyZWROYXJyYXRpb25zLnNpemUsXG5cdFx0fSwge1xuXHRcdFx0cmVxdWVzdHM6IFt7XG5cdFx0XHRcdHNlc3Npb25JZCxcblx0XHRcdFx0a2luZDogJ3Jlc3BvbnNlJyxcblx0XHRcdFx0dGV4dDogJ0RvbmUnLFxuXHRcdFx0XHRuYXJyYXRpb25JZDogJ25hcnJhdGlvbi0xJyxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0XHRraW5kOiAncmVzcG9uc2UnLFxuXHRcdFx0XHR0ZXh0OiAnRG9uZScsXG5cdFx0XHRcdG5hcnJhdGlvbklkOiAnbmFycmF0aW9uLTInLFxuXHRcdFx0fV0sXG5cdFx0XHRwbGF5ZWRBdWRpbzogWyduYXJyYXRpb24nLCAncmV0cnknXSxcblx0XHRcdHBlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb25zOiBbJ25hcnJhdGlvbi0yJ10sXG5cdFx0XHRkZWZlcnJlZE5hcnJhdGlvbnM6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cGxpY2l0IFBUVCBkcm9wcyBzdGFsZSBmaXJzdCBjaHVua3MgYmVmb3JlIHRoZSBiYWNrZW5kIGJhcmdlLWluIGFycml2ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCB0dHNQbGF5YmFja1NlcnZpY2UgPSBuZXcgVGVzdFR0c1BsYXliYWNrU2VydmljZSgpO1xuXHRcdGNvbnN0IG1pY0NhcHR1cmVTZXJ2aWNlID0gbmV3IFRlc3RNaWNDYXB0dXJlU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKFxuXHRcdFx0dm9pY2VDbGllbnRTZXJ2aWNlLFxuXHRcdFx0dHRzUGxheWJhY2tTZXJ2aWNlLFxuXHRcdFx0bmV3IFRlc3RDb21tYW5kU2VydmljZSgpLFxuXHRcdFx0TnVsbFRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRtaWNDYXB0dXJlU2VydmljZSxcblx0XHQpO1xuXHRcdGF3YWl0IGNvbnRyb2xsZXIuY29ubmVjdChtYWluV2luZG93KTtcblx0XHRSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2lzQ29ubmVjdGVkJykuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICdzdG9yeS1zdGFydCcsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiBmYWxzZSxcblx0XHRcdHR1cm5JZDogJ3N0b3J5LXR1cm4nLFxuXHRcdFx0cmVzcG9uc2VJZDogJ3N0b3J5LXJlc3BvbnNlJyxcblx0XHR9KTtcblx0XHRjb250cm9sbGVyLnB0dERvd24oKTtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICdzdGFsZS1zdG9yeScsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiBmYWxzZSxcblx0XHRcdHR1cm5JZDogJ3N0b3J5LXR1cm4nLFxuXHRcdFx0cmVzcG9uc2VJZDogJ3N0b3J5LXJlc3BvbnNlJyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGxheWVkQXVkaW86IHR0c1BsYXliYWNrU2VydmljZS5wbGF5ZWRBdWRpbyxcblx0XHRcdHB0dFR1cm5zOiBtaWNDYXB0dXJlU2VydmljZS5wdHRUdXJucy5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0cGxheWVkQXVkaW86IFsnc3Rvcnktc3RhcnQnXSxcblx0XHRcdHB0dFR1cm5zOiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYW51YWwgUFRUIHByb21vdGVzIHBhc3NpdmUgaGFuZHMtZnJlZSBjYXB0dXJlIHdpdGhvdXQgcmVwbGF5aW5nIHN0YWxlIGF1ZGlvJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdHRzUGxheWJhY2tTZXJ2aWNlID0gbmV3IFRlc3RUdHNQbGF5YmFja1NlcnZpY2UoKTtcblx0XHRjb25zdCBtaWNDYXB0dXJlU2VydmljZSA9IG5ldyBUZXN0TWljQ2FwdHVyZVNlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihcblx0XHRcdHZvaWNlQ2xpZW50U2VydmljZSxcblx0XHRcdHR0c1BsYXliYWNrU2VydmljZSxcblx0XHRcdG5ldyBUZXN0Q29tbWFuZFNlcnZpY2UoKSxcblx0XHRcdE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0bWljQ2FwdHVyZVNlcnZpY2UsXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgJ2FnZW50cy52b2ljZS5oYW5kc0ZyZWUnOiB0cnVlIH0pLFxuXHRcdCk7XG5cdFx0YXdhaXQgY29udHJvbGxlci5jb25uZWN0KG1haW5XaW5kb3cpO1xuXHRcdFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfaXNDb25uZWN0ZWQnKS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHQvLyBJbnN0YWxsIGEgZm9jdXNlZCB3aW5kb3cgc28gdGhlIG11bHRpLXdpbmRvdyBoYW5kcy1mcmVlIGZvY3VzIGdhdGVcblx0XHQvLyAoIzg1MDcpIGxldHMgdGhlIHBhc3NpdmUgYmFyZ2UtaW4gdHVybiBvcGVuOyB0aGUgaGVhZGxlc3MgdGVzdCB3aW5kb3dcblx0XHQvLyByZXBvcnRzIGBkb2N1bWVudC5oYXNGb2N1cygpYCBhcyBmYWxzZS5cblx0XHRSZWZsZWN0LnNldChjb250cm9sbGVyLCAnX3dpbmRvdycsIHsgZG9jdW1lbnQ6IHsgaGFzRm9jdXM6ICgpID0+IHRydWUgfSB9KTtcblxuXHRcdHZvaWNlQ2xpZW50U2VydmljZS5maXJlQXVkaW9SZXNwb25zZSh7XG5cdFx0XHRhdWRpbzogJ3N0b3J5LXN0YXJ0Jyxcblx0XHRcdGlzRmlyc3RDaHVuazogdHJ1ZSxcblx0XHRcdGlzRmluYWw6IGZhbHNlLFxuXHRcdFx0dHVybklkOiAnc3RvcnktdHVybicsXG5cdFx0XHRyZXNwb25zZUlkOiAnc3RvcnktcmVzcG9uc2UnLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBhc3NpdmVUdXJuSWQgPSBtaWNDYXB0dXJlU2VydmljZS5wdHRUdXJuc1swXTtcblx0XHRjb250cm9sbGVyLnB0dERvd24oKTtcblx0XHR2b2ljZUNsaWVudFNlcnZpY2UuZmlyZUF1ZGlvUmVzcG9uc2Uoe1xuXHRcdFx0YXVkaW86ICdzdGFsZS1zdG9yeScsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiBmYWxzZSxcblx0XHRcdHR1cm5JZDogJ3N0b3J5LXR1cm4nLFxuXHRcdFx0cmVzcG9uc2VJZDogJ3N0b3J5LXJlc3BvbnNlJyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGxheWVkQXVkaW86IHR0c1BsYXliYWNrU2VydmljZS5wbGF5ZWRBdWRpbyxcblx0XHRcdHB0dFR1cm5zOiBtaWNDYXB0dXJlU2VydmljZS5wdHRUdXJucyxcblx0XHRcdHBhc3NpdmVUdXJuUHJvbW90ZWQ6IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfcHR0SGVsZCcpICYmICFSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2JhcmdlSW5MaXN0ZW5BY3RpdmUnKSxcblx0XHR9LCB7XG5cdFx0XHRwbGF5ZWRBdWRpbzogWydzdG9yeS1zdGFydCddLFxuXHRcdFx0cHR0VHVybnM6IFtwYXNzaXZlVHVybklkXSxcblx0XHRcdHBhc3NpdmVUdXJuUHJvbW90ZWQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcmNlZCBwdHREb3duIGNhbmNlbHMgcGVuZGluZyB0b2dnbGUgbW9kZSBhbmQga2VlcHMgdGhlIHR1cm4gcmVjb3JkaW5nIGluc3RlYWQgb2YgZmluaXNoaW5nIGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlKTtcblx0XHRhd2FpdCBjb250cm9sbGVyLmNvbm5lY3QobWFpbldpbmRvdyk7XG5cdFx0UmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19pc0Nvbm5lY3RlZCcpLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gQWR2YW5jZSBvZmYgdGhlIGZha2UtY2xvY2sgZXBvY2ggKDApIHNvIHB0dERvd24gcmVjb3JkcyBhIHRydXRoeVxuXHRcdC8vIGBfdGVsZW1ldHJ5UHR0RG93bk1zYDsgYXQgdGltZSAwIHRoZSB0YXAvaG9sZCBzcGxpdCByZWFkcyB0aGUgcHJlc3MgYXNcblx0XHQvLyBcIm5vIHByZXNzIHJlY29yZGVkXCIgKEluZmluaXR5IGhvbGQpIGFuZCBuZXZlciBlbnRlcnMgdG9nZ2xlIG1vZGUuXG5cdFx0Y2xvY2suc2V0U3lzdGVtVGltZSg1XzAwMCk7XG5cblx0XHQvLyBQcmVzcyArIHF1aWNrIHJlbGVhc2U6IGEgc3ViLXRocmVzaG9sZCB0YXAgZW50ZXJzIHRvZ2dsZSBtb2RlLCB3aGljaCBrZWVwc1xuXHRcdC8vIHRoZSBtaWMgcmVjb3JkaW5nIHVudGlsIHRoZSBuZXh0IHRhcC5cblx0XHRjb250cm9sbGVyLnB0dERvd24oKTtcblx0XHRjb250cm9sbGVyLnB0dFVwKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0b2dnbGU6IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfcHR0VG9nZ2xlTW9kZScpLFxuXHRcdFx0aGVsZDogUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19wdHRIZWxkJyksXG5cdFx0fSwgeyB0b2dnbGU6IHRydWUsIGhlbGQ6IHRydWUgfSwgJ3Nob3J0IHRhcCBlbnRlcnMgdG9nZ2xlIG1vZGUgd2hpbGUgc3RpbGwgcmVjb3JkaW5nJyk7XG5cblx0XHQvLyBBIGZvcmNlZCBwcmVzcyAodGhlIGhvbGQtdG8tdGFsayBnZXN0dXJlKSBjYW5jZWxzIHRoZSBwZW5kaW5nIHRvZ2dsZSBtb2RlXG5cdFx0Ly8gYW5kIGtlZXBzIHJlY29yZGluZyB0aGUgc2FtZSB0dXJuLCByYXRoZXIgdGhhbiBmaW5pc2hpbmcgaXQgYXMgYSBub3JtYWxcblx0XHQvLyBzZWNvbmQgdGFwIHdvdWxkLlxuXHRcdGNvbnRyb2xsZXIucHR0RG93bignZXhwbGljaXQnLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRvZ2dsZTogUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19wdHRUb2dnbGVNb2RlJyksXG5cdFx0XHRoZWxkOiBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3B0dEhlbGQnKSxcblx0XHR9LCB7IHRvZ2dsZTogZmFsc2UsIGhlbGQ6IHRydWUgfSwgJ2ZvcmNlZCBwdHREb3duIGJ5cGFzc2VzIHRvZ2dsZSBtb2RlIGFuZCBzdGF5cyByZWNvcmRpbmcnKTtcblx0fSk7XG5cblx0dGVzdCgnZm9yY2VkIHB0dFVwIGZpbmlzaGVzIGEgc3ViLXRocmVzaG9sZCB0dXJuIGluc3RlYWQgb2YgZW50ZXJpbmcgdG9nZ2xlIG1vZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UpO1xuXHRcdGF3YWl0IGNvbnRyb2xsZXIuY29ubmVjdChtYWluV2luZG93KTtcblx0XHRSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2lzQ29ubmVjdGVkJykuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cblx0XHRjb250cm9sbGVyLnB0dERvd24oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19wdHRIZWxkJyksIHRydWUsICdwdHREb3duIHN0YXJ0cyByZWNvcmRpbmcnKTtcblxuXHRcdC8vIEEgZm9yY2VkIHJlbGVhc2UgKGhvbGQtdG8tdGFsayByZWxlYXNlKSBmaW5pc2hlcyBhbmQgc2VuZHMgaW1tZWRpYXRlbHkgZXZlblxuXHRcdC8vIGZvciBhIHNob3J0IGhvbGQsIGluc3RlYWQgb2YgZHJvcHBpbmcgaW50byB0b2dnbGUgbW9kZSBhbmQgbGVhdmluZyBgX3B0dEhlbGRgXG5cdFx0Ly8gYWN0aXZlIHdpdGggdGhlIG1pYyBzdGlsbCBvcGVuLlxuXHRcdGNvbnRyb2xsZXIucHR0VXAoJ2V4cGxpY2l0JywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0b2dnbGU6IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfcHR0VG9nZ2xlTW9kZScpLFxuXHRcdFx0aGVsZDogUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19wdHRIZWxkJyksXG5cdFx0fSwgeyB0b2dnbGU6IGZhbHNlLCBoZWxkOiBmYWxzZSB9LCAnZm9yY2VkIHB0dFVwIGZpbmlzaGVzIHRoZSB0dXJuIHJhdGhlciB0aGFuIGVudGVyaW5nIHRvZ2dsZSBtb2RlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIGlkbGUgc3RhdGUgd2hlbiBzb2xpY2l0ZWQgbmFycmF0aW9uIG5ldmVyIHN0YXJ0cyByZXR1cm5pbmcgYXVkaW8nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IG5hcnJhdGUgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX25hcnJhdGUnKSBhcyAoc2Vzc2lvbklkOiBzdHJpbmcsIGtpbmQ6ICdyZXNwb25zZScgfCAnY29uZmlybWF0aW9uJywgdGV4dDogc3RyaW5nKSA9PiBib29sZWFuO1xuXHRcdGNvbnN0IHBlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb25zID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19wZW5kaW5nU29saWNpdGVkTmFycmF0aW9ucycpIGFzIE1hcDxzdHJpbmcsIHVua25vd24+O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hcnJhdGUuY2FsbChjb250cm9sbGVyLCAnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTEnLCAncmVzcG9uc2UnLCAnRG9uZScpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZvaWNlQ2xpZW50U2VydmljZS5yZXF1ZXN0cywgW3tcblx0XHRcdHNlc3Npb25JZDogJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdGtpbmQ6ICdyZXNwb25zZScsXG5cdFx0XHR0ZXh0OiAnRG9uZScsXG5cdFx0XHRuYXJyYXRpb25JZDogJ25hcnJhdGlvbi0xJyxcblx0XHR9XSk7XG5cblx0XHRjbG9jay50aWNrKDMwXzAwMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci52b2ljZVN0YXRlLmdldCgpLCAnaWRsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLnN0YXR1c1RleHQuZ2V0KCksICdIb2xkIHRvIHNwZWFrLi4uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb25zLnNpemUsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzdG9wcyB0aGUgYXVkaW8tc3RhcnQgd2F0Y2hkb2cgb25jZSBhdWRpbyBhcnJpdmVzIGFuZCBkb2VzIG5vdCB0aW1lIG91dCB0aGUgc3RyZWFtJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBuYXJyYXRlID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19uYXJyYXRlJykgYXMgKHNlc3Npb25JZDogc3RyaW5nLCBraW5kOiAncmVzcG9uc2UnIHwgJ2NvbmZpcm1hdGlvbicsIHRleHQ6IHN0cmluZykgPT4gYm9vbGVhbjtcblx0XHRjb25zdCBtYXJrQXVkaW9TdGFydGVkID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19tYXJrU29saWNpdGVkTmFycmF0aW9uQXVkaW9TdGFydGVkJykgYXMgKG5hcnJhdGlvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQpID0+IHZvaWQ7XG5cdFx0Y29uc3QgcGVuZGluZ1NvbGljaXRlZE5hcnJhdGlvbnMgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3BlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb25zJykgYXMgTWFwPHN0cmluZywgdW5rbm93bj47XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmFycmF0ZS5jYWxsKGNvbnRyb2xsZXIsIFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLTInKS50b1N0cmluZygpLCAncmVzcG9uc2UnLCAnUmVhZHknKSwgdHJ1ZSk7XG5cblx0XHQvLyBBdWRpbyBzdGFydHMgYmVmb3JlIHRoZSBhdWRpby1zdGFydCB3YXRjaGRvZyBmaXJlcywgc28gaXQgaXMgY2FuY2VsbGVkLlxuXHRcdGNsb2NrLnRpY2soMTBfMDAwKTtcblx0XHRtYXJrQXVkaW9TdGFydGVkLmNhbGwoY29udHJvbGxlciwgJ25hcnJhdGlvbi0xJyk7XG5cblx0XHQvLyBXZWxsIHBhc3QgYW55IHRpbWVvdXQ6IHRoZSBzdHJlYW0gaXMgbGVmdCB0byBmaW5hbGl6ZSBub3JtYWxseSwgc28gdGhlXG5cdFx0Ly8gbmFycmF0aW9uIHN0YXlzIHRyYWNrZWQgYW5kIHN0YXRlIGlzIHVudG91Y2hlZCAobm8gZmluYWxpemUgdGltZW91dCkuXG5cdFx0Y2xvY2sudGljaygxMjBfMDAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nU29saWNpdGVkTmFycmF0aW9ucy5zaXplLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5zdGF0dXNUZXh0LmdldCgpLCAnVGFwIHRvIHN0YXJ0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlc3RvcmUgc3RhdGUgd2hpbGUgYW5vdGhlciBzb2xpY2l0ZWQgbmFycmF0aW9uIGlzIHN0aWxsIGF3YWl0aW5nIGF1ZGlvJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBuYXJyYXRlID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19uYXJyYXRlJykgYXMgKHNlc3Npb25JZDogc3RyaW5nLCBraW5kOiAncmVzcG9uc2UnIHwgJ2NvbmZpcm1hdGlvbicsIHRleHQ6IHN0cmluZykgPT4gYm9vbGVhbjtcblx0XHRjb25zdCBwZW5kaW5nU29saWNpdGVkTmFycmF0aW9ucyA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfcGVuZGluZ1NvbGljaXRlZE5hcnJhdGlvbnMnKSBhcyBNYXA8c3RyaW5nLCB1bmtub3duPjtcblxuXHRcdC8vIEZpcnN0IG5hcnJhdGlvbiBhcm1lZCBhdCB0PTAgKGF1ZGlvLXN0YXJ0IHdhdGNoZG9nIGZpcmVzIGF0IHQ9MzBzKS5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmFycmF0ZS5jYWxsKGNvbnRyb2xsZXIsICdhZ2VudC1ob3N0LWNvcGlsb3Q6L3Nlc3Npb24tYScsICdyZXNwb25zZScsICdGaXJzdCcpLCB0cnVlKTtcblx0XHQvLyBTZWNvbmQgbmFycmF0aW9uIGFybWVkIGF0IHQ9MTVzIChpdHMgd2F0Y2hkb2cgZmlyZXMgYXQgdD00NXMpLlxuXHRcdGNsb2NrLnRpY2soMTVfMDAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmFycmF0ZS5jYWxsKGNvbnRyb2xsZXIsICdhZ2VudC1ob3N0LWNvcGlsb3Q6L3Nlc3Npb24tYicsICdyZXNwb25zZScsICdTZWNvbmQnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb25zLnNpemUsIDIpO1xuXG5cdFx0Ly8gRmlyc3Qgd2F0Y2hkb2cgZmlyZXM6IHRoZSBzZWNvbmQgbmFycmF0aW9uIGlzIHN0aWxsIGF3YWl0aW5nIGF1ZGlvLCBzb1xuXHRcdC8vIHN0YXRlIG11c3QgTk9UIGJlIHJlc3RvcmVkIHlldCBcdTIwMTQgaXRzIG93biB3YXRjaGRvZyBvd25zIHRoYXQuXG5cdFx0Y2xvY2sudGljaygxNV8wMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nU29saWNpdGVkTmFycmF0aW9ucy5zaXplLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5zdGF0dXNUZXh0LmdldCgpLCAnVGFwIHRvIHN0YXJ0Jyk7XG5cblx0XHQvLyBTZWNvbmQgKGxhc3Qgb3V0c3RhbmRpbmcpIHdhdGNoZG9nIGZpcmVzOiBub3cgc3RhdGUgaXMgcmVzdG9yZWQuXG5cdFx0Y2xvY2sudGljaygxNV8wMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZW5kaW5nU29saWNpdGVkTmFycmF0aW9ucy5zaXplLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci52b2ljZVN0YXRlLmdldCgpLCAnaWRsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLnN0YXR1c1RleHQuZ2V0KCksICdIb2xkIHRvIHNwZWFrLi4uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlc3RvcmUgc3RhdGUgd2hpbGUgYSBkaXJlY3QgcmVwbHkgaXMgc3RpbGwgYXdhaXRlZCcsICgpID0+IHtcblx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHZvaWNlQ2xpZW50U2VydmljZSk7XG5cdFx0Y29uc3QgbmFycmF0ZSA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfbmFycmF0ZScpIGFzIChzZXNzaW9uSWQ6IHN0cmluZywga2luZDogJ3Jlc3BvbnNlJyB8ICdjb25maXJtYXRpb24nLCB0ZXh0OiBzdHJpbmcpID0+IGJvb2xlYW47XG5cdFx0Y29uc3Qgc2V0QXdhaXRpbmdSZXBseSA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfc2V0QXdhaXRpbmdSZXBseScpIGFzICgpID0+IHZvaWQ7XG5cdFx0Y29uc3QgcGVuZGluZ1NvbGljaXRlZE5hcnJhdGlvbnMgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3BlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb25zJykgYXMgTWFwPHN0cmluZywgdW5rbm93bj47XG5cblx0XHQvLyBOYXJyYXRpb24gYXJtZWQgYXQgdD0wIChhdWRpby1zdGFydCB3YXRjaGRvZyBmaXJlcyBhdCB0PTMwcykuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hcnJhdGUuY2FsbChjb250cm9sbGVyLCAnYWdlbnQtaG9zdC1jb3BpbG90Oi9zZXNzaW9uLWMnLCAncmVzcG9uc2UnLCAnRG9uZScpLCB0cnVlKTtcblx0XHQvLyBBIGRpcmVjdCByZXBseSBiZWNvbWVzIGF3YWl0ZWQgYXQgdD0xcyAoaXRzIG93biB3YXRjaGRvZyBmaXJlcyBhdCB0PTMxcyxcblx0XHQvLyBhZnRlciB0aGUgbmFycmF0aW9uJ3MpLCBzbyBgX2F3YWl0aW5nUmVwbHlBdWRpb2AgaXMgc3RpbGwgc2V0IHdoZW4gdGhlXG5cdFx0Ly8gbmFycmF0aW9uIHRpbWVzIG91dC5cblx0XHRjbG9jay50aWNrKDFfMDAwKTtcblx0XHRzZXRBd2FpdGluZ1JlcGx5LmNhbGwoY29udHJvbGxlcik7XG5cblx0XHRjbG9jay50aWNrKDI5XzAwMCk7XG5cblx0XHQvLyBUaGUgbmFycmF0aW9uJ3MgYXVkaW8tc3RhcnQgd2F0Y2hkb2cgZmlyZWQsIGJ1dCBhIGRpcmVjdCByZXBseSBpcyBzdGlsbFxuXHRcdC8vIGV4cGVjdGVkLCBzbyBpdCBtdXN0IG5vdCBjbG9iYmVyIHRoYXQgcmVwbHkncyBzdGF0ZS5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVuZGluZ1NvbGljaXRlZE5hcnJhdGlvbnMuc2l6ZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuc3RhdHVzVGV4dC5nZXQoKSwgJ1RhcCB0byBzdGFydCcpO1xuXHR9KTtcblx0dGVzdCgnYXV0by1saXN0ZW4gb3BlbnMgYSBwYXNzaXZlIG1pYyB0dXJuIHNvIHRoZSBiYWNrZW5kIGRvZXMgbm90IGxhdGNoIHVzZXJfaXNfc3BlYWtpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBtaWMgPSBuZXcgUmVjb3JkaW5nTWljQ2FwdHVyZVNlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIG1pYyk7XG5cdFx0KFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfaXNDb25uZWN0ZWQnKSBhcyB7IHNldCh2YWx1ZTogYm9vbGVhbiwgdHg6IHVuZGVmaW5lZCk6IHZvaWQgfSkuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0UmVmbGVjdC5zZXQoY29udHJvbGxlciwgJ193aW5kb3cnLCB7IGRvY3VtZW50OiB7IGhhc0ZvY3VzOiAoKSA9PiB0cnVlIH0gfSk7XG5cblx0XHRjb25zdCBlbnRlckF1dG9MaXN0ZW4gPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2VudGVyQXV0b0xpc3RlbicpIGFzICgpID0+IHZvaWQ7XG5cdFx0ZW50ZXJBdXRvTGlzdGVuLmNhbGwoY29udHJvbGxlcik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWljLnB0dERvd25DYWxscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaWMucHR0RG93bkNhbGxzWzBdLnBhc3NpdmUsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25uZWN0IG9ubHkgYXJtcyBsaXN0ZW5pbmcgYXV0b21hdGljYWxseSBpbiBoYW5kcy1mcmVlIG1vZGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFudWFsVm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBtYW51YWxDb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihtYW51YWxWb2ljZUNsaWVudFNlcnZpY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCxcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyAnYWdlbnRzLnZvaWNlLmhhbmRzRnJlZSc6IGZhbHNlIH0pKTtcblxuXHRcdGNvbnN0IGhhbmRzRnJlZVZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgaGFuZHNGcmVlQ29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoaGFuZHNGcmVlVm9pY2VDbGllbnRTZXJ2aWNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgJ2FnZW50cy52b2ljZS5oYW5kc0ZyZWUnOiB0cnVlIH0pKTtcblx0XHRjb25zdCBtYW51YWxTaG91bGRBcm0gPSBSZWZsZWN0LmdldChtYW51YWxDb250cm9sbGVyLCAnX3Nob3VsZEVudGVyTGlzdGVuT25TZXNzaW9uSW5pdCcpIGFzIChpc1Jlc3VtaW5nOiBib29sZWFuKSA9PiBib29sZWFuO1xuXHRcdGNvbnN0IGhhbmRzRnJlZVNob3VsZEFybSA9IFJlZmxlY3QuZ2V0KGhhbmRzRnJlZUNvbnRyb2xsZXIsICdfc2hvdWxkRW50ZXJMaXN0ZW5PblNlc3Npb25Jbml0JykgYXMgKGlzUmVzdW1pbmc6IGJvb2xlYW4pID0+IGJvb2xlYW47XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1hbnVhbEZyZXNoQ29ubmVjdDogbWFudWFsU2hvdWxkQXJtLmNhbGwobWFudWFsQ29udHJvbGxlciwgZmFsc2UpLFxuXHRcdFx0aGFuZHNGcmVlRnJlc2hDb25uZWN0OiBoYW5kc0ZyZWVTaG91bGRBcm0uY2FsbChoYW5kc0ZyZWVDb250cm9sbGVyLCBmYWxzZSksXG5cdFx0XHRoYW5kc0ZyZWVSZXN1bWU6IGhhbmRzRnJlZVNob3VsZEFybS5jYWxsKGhhbmRzRnJlZUNvbnRyb2xsZXIsIHRydWUpLFxuXHRcdH0sIHtcblx0XHRcdG1hbnVhbEZyZXNoQ29ubmVjdDogZmFsc2UsXG5cdFx0XHRoYW5kc0ZyZWVGcmVzaENvbm5lY3Q6IHRydWUsXG5cdFx0XHRoYW5kc0ZyZWVSZXN1bWU6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdG9wcGluZyBsaXN0ZW5pbmcgaW4gbWFudWFsIG1vZGUgc3VibWl0cyB0aGUgdHJhbnNjcmlwdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gbmV3IFRlc3RDb21tYW5kU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHZvaWNlQ2xpZW50U2VydmljZSwgdW5kZWZpbmVkLCBjb21tYW5kU2VydmljZSk7XG5cdFx0YXdhaXQgY29udHJvbGxlci5jb25uZWN0KG1haW5XaW5kb3cpO1xuXHRcdChSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2lzQ29ubmVjdGVkJykgYXMgeyBzZXQodmFsdWU6IGJvb2xlYW4sIHR4OiB1bmRlZmluZWQpOiB2b2lkIH0pLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29udHJvbGxlci5wdHREb3duKCk7XG5cdFx0Y29udHJvbGxlci5zdG9wTGlzdGVuaW5nKCk7XG5cdFx0dm9pY2VDbGllbnRTZXJ2aWNlLmZpcmVUb29sQ2FsbCh7XG5cdFx0XHRjYWxsSWQ6ICdtYW51YWwtdHJhbnNjcmlwdGlvbicsXG5cdFx0XHRuYW1lOiAnc2VuZF90b19jaGF0Jyxcblx0XHRcdGFyZ3M6IHsgdGV4dDogJ3NlbmQgdGhpcyB3aGVuIGxpc3RlbmluZyBzdG9wcycgfSxcblx0XHR9KTtcblx0XHRhd2FpdCB2b2ljZUNsaWVudFNlcnZpY2UudG9vbFJlc3VsdFJlY2VpdmVkO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21tYW5kU2VydmljZS5hY2NlcHRlZElucHV0cywgWydzZW5kIHRoaXMgd2hlbiBsaXN0ZW5pbmcgc3RvcHMnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG8tbGlzdGVuIGlzIHNraXBwZWQgd2hlbiB3aW5kb3cgZG9lcyBub3QgaGF2ZSBmb2N1cyAobXVsdGktd2luZG93IGhhbmRzLWZyZWUpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbWljID0gbmV3IFJlY29yZGluZ01pY0NhcHR1cmVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBtaWMpO1xuXHRcdChSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2lzQ29ubmVjdGVkJykgYXMgeyBzZXQodmFsdWU6IGJvb2xlYW4sIHR4OiB1bmRlZmluZWQpOiB2b2lkIH0pLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdFJlZmxlY3Quc2V0KGNvbnRyb2xsZXIsICdfd2luZG93JywgeyBkb2N1bWVudDogeyBoYXNGb2N1czogKCkgPT4gZmFsc2UgfSB9KTtcblxuXHRcdGNvbnN0IGVudGVyQXV0b0xpc3RlbiA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfZW50ZXJBdXRvTGlzdGVuJykgYXMgKCkgPT4gdm9pZDtcblx0XHRlbnRlckF1dG9MaXN0ZW4uY2FsbChjb250cm9sbGVyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaWMucHR0RG93bkNhbGxzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dpbmRvdyBibHVyIGFib3J0cyBhbiBvcGVuIHBhc3NpdmUgdHVybiBzbyB0aGUgYmFja2dyb3VuZCB3aW5kb3cgc3RvcHMgcmVjb3JkaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbWljID0gbmV3IFJlY29yZGluZ01pY0NhcHR1cmVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBtaWMpO1xuXHRcdChSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2lzQ29ubmVjdGVkJykgYXMgeyBzZXQodmFsdWU6IGJvb2xlYW4sIHR4OiB1bmRlZmluZWQpOiB2b2lkIH0pLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXG5cdFx0UmVmbGVjdC5zZXQoY29udHJvbGxlciwgJ19wdHRDdXJyZW50VHVybklkJywgJ3Bhc3NpdmUtdHVybicpO1xuXHRcdFJlZmxlY3Quc2V0KGNvbnRyb2xsZXIsICdfcHR0Q3VycmVudFR1cm5QYXNzaXZlJywgdHJ1ZSk7XG5cdFx0UmVmbGVjdC5zZXQoY29udHJvbGxlciwgJ19wdHRIZWxkJywgdHJ1ZSk7XG5cblx0XHQoUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19vbldpbmRvd0JsdXInKSBhcyAoKSA9PiB2b2lkKS5jYWxsKGNvbnRyb2xsZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pYy5hYm9ydENhbGxzLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19wdHRIZWxkJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnd2luZG93IGJsdXIgZG9lcyBub3QgYWJvcnQgYSBkZWxpYmVyYXRlIChub24tcGFzc2l2ZSkgdHVybicsICgpID0+IHtcblx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IG1pYyA9IG5ldyBSZWNvcmRpbmdNaWNDYXB0dXJlU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHZvaWNlQ2xpZW50U2VydmljZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbWljKTtcblx0XHQoUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19pc0Nvbm5lY3RlZCcpIGFzIHsgc2V0KHZhbHVlOiBib29sZWFuLCB0eDogdW5kZWZpbmVkKTogdm9pZCB9KS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblxuXHRcdFJlZmxlY3Quc2V0KGNvbnRyb2xsZXIsICdfcHR0Q3VycmVudFR1cm5JZCcsICdkZWxpYmVyYXRlLXR1cm4nKTtcblx0XHRSZWZsZWN0LnNldChjb250cm9sbGVyLCAnX3B0dEN1cnJlbnRUdXJuUGFzc2l2ZScsIGZhbHNlKTtcblx0XHRSZWZsZWN0LnNldChjb250cm9sbGVyLCAnX3B0dEhlbGQnLCB0cnVlKTtcblxuXHRcdChSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX29uV2luZG93Qmx1cicpIGFzICgpID0+IHZvaWQpLmNhbGwoY29udHJvbGxlcik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWljLmFib3J0Q2FsbHMsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3B0dEhlbGQnKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dpbmRvdyBmb2N1cyByZS1hcm1zIGhhbmRzLWZyZWUgYXV0by1saXN0ZW4gaW4gdGhlIGZvY3VzZWQgd2luZG93JywgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbWljID0gbmV3IFJlY29yZGluZ01pY0NhcHR1cmVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBtaWMsXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgJ2FnZW50cy52b2ljZS5oYW5kc0ZyZWUnOiB0cnVlIH0pKTtcblx0XHQoUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19pc0Nvbm5lY3RlZCcpIGFzIHsgc2V0KHZhbHVlOiBib29sZWFuLCB0eDogdW5kZWZpbmVkKTogdm9pZCB9KS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRSZWZsZWN0LnNldChjb250cm9sbGVyLCAnX3dpbmRvdycsIHsgZG9jdW1lbnQ6IHsgaGFzRm9jdXM6ICgpID0+IHRydWUgfSB9KTtcblxuXHRcdChSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX29uV2luZG93Rm9jdXMnKSBhcyAoKSA9PiB2b2lkKS5jYWxsKGNvbnRyb2xsZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pYy5wdHREb3duQ2FsbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWljLnB0dERvd25DYWxsc1swXS5wYXNzaXZlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnd2luZG93IGZvY3VzIGRvZXMgbm90IHJlLWFybSBhdXRvLWxpc3RlbiB3aGVuIGhhbmRzLWZyZWUgaXMgZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBtaWMgPSBuZXcgUmVjb3JkaW5nTWljQ2FwdHVyZVNlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIG1pYyxcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyAnYWdlbnRzLnZvaWNlLmhhbmRzRnJlZSc6IGZhbHNlIH0pKTtcblx0XHQoUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19pc0Nvbm5lY3RlZCcpIGFzIHsgc2V0KHZhbHVlOiBib29sZWFuLCB0eDogdW5kZWZpbmVkKTogdm9pZCB9KS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRSZWZsZWN0LnNldChjb250cm9sbGVyLCAnX3dpbmRvdycsIHsgZG9jdW1lbnQ6IHsgaGFzRm9jdXM6ICgpID0+IHRydWUgfSB9KTtcblxuXHRcdChSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX29uV2luZG93Rm9jdXMnKSBhcyAoKSA9PiB2b2lkKS5jYWxsKGNvbnRyb2xsZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pYy5wdHREb3duQ2FsbHMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnYSBkZWxpYmVyYXRlIHVzZXIgcHJlc3Mgb3BlbnMgYSBub24tcGFzc2l2ZSBtaWMgdHVybicsICgpID0+IHtcblx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IG1pYyA9IG5ldyBSZWNvcmRpbmdNaWNDYXB0dXJlU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHZvaWNlQ2xpZW50U2VydmljZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbWljKTtcblx0XHQoUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19pc0Nvbm5lY3RlZCcpIGFzIHsgc2V0KHZhbHVlOiBib29sZWFuLCB0eDogdW5kZWZpbmVkKTogdm9pZCB9KS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnRyb2xsZXIucHR0RG93bigpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pYy5wdHREb3duQ2FsbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWljLnB0dERvd25DYWxsc1swXS5wYXNzaXZlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgZGVsaWJlcmF0ZSBwcmVzcyBhd2FpdGluZyBuYXJyYXRpb24gaXMgcHJlc2VydmVkIHNvIGl0cyBwdHRfZW5kIGNsZWFycyB0aGUgYmFja2VuZCBsYXRjaCcsICgpID0+IHtcblx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IG1pYyA9IG5ldyBSZWNvcmRpbmdNaWNDYXB0dXJlU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHZvaWNlQ2xpZW50U2VydmljZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbWljKTtcblx0XHQoUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19pc0Nvbm5lY3RlZCcpIGFzIHsgc2V0KHZhbHVlOiBib29sZWFuLCB0eDogdW5kZWZpbmVkKTogdm9pZCB9KS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnRyb2xsZXIucHR0RG93bigpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3B0dEhlbGQnKSwgdHJ1ZSk7XG5cblx0XHQoUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19wcmVwYXJlRm9yUGxheWJhY2snKSBhcyAoKSA9PiB2b2lkKS5jYWxsKGNvbnRyb2xsZXIpO1xuXG5cdFx0Ly8gVGhlIG5vbi1wYXNzaXZlIHByZXNzIGxhdGNoZWQgYHVzZXJfaXNfc3BlYWtpbmdgIG9uIHRoZSBiYWNrZW5kOyBhYm9ydGluZ1xuXHRcdC8vIGl0IGhlcmUgd291bGQgc2VuZCBubyBwdHRfZW5kIGFuZCBzdHJhbmQgdGhlIGxhdGNoLCBzbyBpdCBzdGF5cyBvcGVuLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaWMuYWJvcnRDYWxscywgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfcHR0SGVsZCcpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnYSBwYXNzaXZlIG9wZW4tbWljIHR1cm4gaXMgdG9ybiBkb3duIGZvciBwbGF5YmFjayBzaW5jZSBpdCBuZXZlciBsYXRjaGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbWljID0gbmV3IFJlY29yZGluZ01pY0NhcHR1cmVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBtaWMpO1xuXHRcdChSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2lzQ29ubmVjdGVkJykgYXMgeyBzZXQodmFsdWU6IGJvb2xlYW4sIHR4OiB1bmRlZmluZWQpOiB2b2lkIH0pLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXG5cdFx0UmVmbGVjdC5zZXQoY29udHJvbGxlciwgJ19wdHRDdXJyZW50VHVybklkJywgJ3Bhc3NpdmUtdHVybicpO1xuXHRcdFJlZmxlY3Quc2V0KGNvbnRyb2xsZXIsICdfcHR0Q3VycmVudFR1cm5QYXNzaXZlJywgdHJ1ZSk7XG5cdFx0UmVmbGVjdC5zZXQoY29udHJvbGxlciwgJ19wdHRIZWxkJywgdHJ1ZSk7XG5cblx0XHQoUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19wcmVwYXJlRm9yUGxheWJhY2snKSBhcyAoKSA9PiB2b2lkKS5jYWxsKGNvbnRyb2xsZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pYy5hYm9ydENhbGxzLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19wdHRIZWxkJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnYSBoZWxkIGRlbGliZXJhdGUgcHJlc3Mga2VlcHMgYnVmZmVyZWQgbmFycmF0aW9uIGRlZmVycmVkIGluc3RlYWQgb2YgcGxheWluZyBvdmVyIHRoZSBwcmVzcycsICgpID0+IHtcblx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IG1pYyA9IG5ldyBSZWNvcmRpbmdNaWNDYXB0dXJlU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHZvaWNlQ2xpZW50U2VydmljZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbWljKTtcblx0XHQoUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19pc0Nvbm5lY3RlZCcpIGFzIHsgc2V0KHZhbHVlOiBib29sZWFuLCB0eDogdW5kZWZpbmVkKTogdm9pZCB9KS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIEEgZGVsaWJlcmF0ZSAobm9uLXBhc3NpdmUpIHByZXNzIGlzIGJlaW5nIGhlbGQ7IGl0IGxhdGNoZWQgdGhlIGJhY2tlbmQuXG5cdFx0UmVmbGVjdC5zZXQoY29udHJvbGxlciwgJ19wdHRDdXJyZW50VHVybklkJywgJ2RlbGliZXJhdGUtdHVybicpO1xuXHRcdFJlZmxlY3Quc2V0KGNvbnRyb2xsZXIsICdfcHR0Q3VycmVudFR1cm5QYXNzaXZlJywgZmFsc2UpO1xuXHRcdFJlZmxlY3Quc2V0KGNvbnRyb2xsZXIsICdfcHR0SGVsZCcsIHRydWUpO1xuXG5cdFx0Ly8gQnVmZmVyIGEgZmluaXNoZWQgcmVzcG9uc2UgZm9yIGEgc2Vzc2lvbiB0aGF0IGlzIG5vdyBmb2N1c2VkLlxuXHRcdGNvbnN0IGRlZmVycmVkID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19kZWZlcnJlZFJlc3BvbnNlcycpIGFzIE1hcDxzdHJpbmcsIHsgcmVzcG9uc2VJZD86IHN0cmluZzsgZmluYWxpemVkOiBib29sZWFuOyBjaHVua3M6IHsgYXVkaW86IHN0cmluZzsgaXNGaXJzdENodW5rOiBib29sZWFuOyBpc0ZpbmFsOiBib29sZWFuOyB0cmFuc2NyaXB0OiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdIH1bXT47XG5cdFx0ZGVmZXJyZWQuc2V0KCdzZXNzaW9uLTEnLCBbe1xuXHRcdFx0cmVzcG9uc2VJZDogJ3IxJyxcblx0XHRcdGZpbmFsaXplZDogdHJ1ZSxcblx0XHRcdGNodW5rczogW3sgYXVkaW86ICdBQUFBJywgaXNGaXJzdENodW5rOiB0cnVlLCBpc0ZpbmFsOiB0cnVlLCB0cmFuc2NyaXB0OiAnaGVsbG8gdGhlcmUnIH1dLFxuXHRcdH1dKTtcblxuXHRcdGNvbnN0IGZsdXNoID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19mbHVzaERlZmVycmVkUmVzcG9uc2UnKSBhcyAoc2Vzc2lvbklkOiBzdHJpbmcpID0+IHsgZmx1c2hlZDogYm9vbGVhbjsgcmV0YWluZWQ/OiBib29sZWFuOyBmaW5hbFRyYW5zY3JpcHRzOiByZWFkb25seSBzdHJpbmdbXSB9O1xuXHRcdGNvbnN0IHJlc3VsdCA9IGZsdXNoLmNhbGwoY29udHJvbGxlciwgJ3Nlc3Npb24tMScpO1xuXG5cdFx0Ly8gVGhlIHByZXNzIGlzIHByZXNlcnZlZCwgc28gbm90aGluZyBwbGF5cyBhbmQgdGhlIHJlc3BvbnNlIHN0YXlzIGJ1ZmZlcmVkXG5cdFx0Ly8gZm9yIGEgbGF0ZXIgZmx1c2ggKHRoZSBwZXJpb2RpYyBzYWZldHktbmV0IHJlLWZsdXNoIG9uY2UgdGhlIHByZXNzXG5cdFx0Ly8gcmVsZWFzZXMsIG9yIGEgbGF0ZXIgZm9jdXMpLiBgcmV0YWluZWRgIHRlbGxzIHRoZSBmb2N1cyBwYXRoIHRvIHNraXBcblx0XHQvLyBpc3N1aW5nIGEgZnJlc2ggbmFycmF0aW9uIGZvciB0aGlzIHNhbWUgcmVwbHkuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5mbHVzaGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZXRhaW5lZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfY3VycmVudFBsYXliYWNrU2Vzc2lvbklkJyksIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19hdWRpb1F1ZXVlJykgYXMgdW5rbm93bltdKS5sZW5ndGgsIDApO1xuXHRcdGNvbnN0IHJlbWFpbmluZyA9IGRlZmVycmVkLmdldCgnc2Vzc2lvbi0xJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlbWFpbmluZyAmJiByZW1haW5pbmcubGVuZ3RoID09PSAxLCAnYnVmZmVyZWQgcmVzcG9uc2Ugc2hvdWxkIHJlbWFpbiBkZWZlcnJlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3B0dEhlbGQnKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgYnVmZmVyZWQgcmVwbHkgcmV0YWluZWQgdW5kZXIgYSBoZWxkIHByZXNzIGlzIG5vdCByZS1uYXJyYXRlZCAobm8gZHVwbGljYXRlIG9uIHJlbGVhc2UpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZvaWNlQ2xpZW50U2VydmljZSA9IG5ldyBUZXN0Vm9pY2VDbGllbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbWljID0gbmV3IFJlY29yZGluZ01pY0NhcHR1cmVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIodm9pY2VDbGllbnRTZXJ2aWNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBtaWMpO1xuXHRcdChSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2lzQ29ubmVjdGVkJykgYXMgeyBzZXQodmFsdWU6IGJvb2xlYW4sIHR4OiB1bmRlZmluZWQpOiB2b2lkIH0pLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3Qga2V5ID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3Q6L3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cblx0XHQvLyBBIGRlbGliZXJhdGUgKG5vbi1wYXNzaXZlKSBwcmVzcyBpcyBoZWxkOyBpdCBsYXRjaGVkIHRoZSBiYWNrZW5kLlxuXHRcdFJlZmxlY3Quc2V0KGNvbnRyb2xsZXIsICdfcHR0Q3VycmVudFR1cm5JZCcsICdkZWxpYmVyYXRlLXR1cm4nKTtcblx0XHRSZWZsZWN0LnNldChjb250cm9sbGVyLCAnX3B0dEN1cnJlbnRUdXJuUGFzc2l2ZScsIGZhbHNlKTtcblx0XHRSZWZsZWN0LnNldChjb250cm9sbGVyLCAnX3B0dEhlbGQnLCB0cnVlKTtcblxuXHRcdC8vIFRoZSBzZXNzaW9uIGhhcyBhIGNvbXBsZXRlZCByZXBseSBwcmVzZW50IEJPVEggYXMgYnVmZmVyZWQgYXVkaW8gYW5kIGFzXG5cdFx0Ly8gYSBwZW5kaW5nIHN1bW1hcnkgLSB0aGUgc2FtZSByZXBseSB0aGUgZm9jdXMgcGF0aCB3b3VsZCBvdGhlcndpc2Ugc3BlYWsuXG5cdFx0Y29uc3QgZGVmZXJyZWQgPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2RlZmVycmVkUmVzcG9uc2VzJykgYXMgTWFwPHN0cmluZywgeyByZXNwb25zZUlkPzogc3RyaW5nOyBmaW5hbGl6ZWQ6IGJvb2xlYW47IGNodW5rczogeyBhdWRpbzogc3RyaW5nOyBpc0ZpcnN0Q2h1bms6IGJvb2xlYW47IGlzRmluYWw6IGJvb2xlYW47IHRyYW5zY3JpcHQ6IHN0cmluZyB8IHVuZGVmaW5lZCB9W10gfVtdPjtcblx0XHRkZWZlcnJlZC5zZXQoa2V5LCBbe1xuXHRcdFx0cmVzcG9uc2VJZDogJ3IxJyxcblx0XHRcdGZpbmFsaXplZDogdHJ1ZSxcblx0XHRcdGNodW5rczogW3sgYXVkaW86ICdBQUFBJywgaXNGaXJzdENodW5rOiB0cnVlLCBpc0ZpbmFsOiB0cnVlLCB0cmFuc2NyaXB0OiAnYWxsIGRvbmUnIH1dLFxuXHRcdH1dKTtcblx0XHQoUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19wZW5kaW5nUmVzcG9uc2VTdW1tYXJpZXMnKSBhcyBNYXA8c3RyaW5nLCBzdHJpbmc+KS5zZXQoa2V5LCAnYWxsIGRvbmUnKTtcblxuXHRcdC8vIEZvY3VzIHRoZSBzZXNzaW9uIHdoaWxlIHRoZSBwcmVzcyBpcyBzdGlsbCBoZWxkLlxuXHRcdChSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX2FjdGl2YXRlU2hvd25TZXNzaW9uJykgYXMgKHJlc291cmNlOiBVUkkpID0+IHZvaWQpLmNhbGwoY29udHJvbGxlciwgVVJJLnBhcnNlKGtleSkpO1xuXG5cdFx0Ly8gTm8gZnJlc2ggbmFycmF0aW9uIGlzIHJlcXVlc3RlZDogdGhlIGJ1ZmZlcmVkIGF1ZGlvIHBsYXlzIG9uIHJlbGVhc2UsIHNvXG5cdFx0Ly8gaXNzdWluZyBvbmUgbm93IChOQUNLJ2QgYnVzeSwgZGVmZXJyZWQsIHJldHJpZWQgb24gcmVsZWFzZSkgd291bGQgZG91YmxlXG5cdFx0Ly8gdXAgd2l0aCB0aGF0IGJ1ZmZlci4gVGhlIHJlcGx5IHN0YXlzIGJ1ZmZlcmVkIHVudGlsIHRoZSBwcmVzcyByZWxlYXNlcy5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzLmxlbmd0aCwgMCwgJ25vIG5hcnJhdGlvbiBzaG91bGQgYmUgcmVxdWVzdGVkIHdoaWxlIHRoZSBwcmVzcyByZXRhaW5zIHRoZSBidWZmZXInKTtcblx0XHRjb25zdCByZW1haW5pbmcgPSBkZWZlcnJlZC5nZXQoa2V5KTtcblx0XHRhc3NlcnQub2socmVtYWluaW5nICYmIHJlbWFpbmluZy5sZW5ndGggPT09IDEsICdidWZmZXJlZCByZXBseSBzdGF5cyBkZWZlcnJlZCBmb3IgcmVsZWFzZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGRpZmZlcmVudCBwZW5kaW5nIHJlcGx5IGlzIHN0aWxsIG5hcnJhdGVkIHdoZW4gYW4gdW5yZWxhdGVkIGJ1ZmZlciBpcyByZXRhaW5lZCB1bmRlciBhIGhlbGQgcHJlc3MnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VDbGllbnRTZXJ2aWNlID0gbmV3IFRlc3RWb2ljZUNsaWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBtaWMgPSBuZXcgUmVjb3JkaW5nTWljQ2FwdHVyZVNlcnZpY2UoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih2b2ljZUNsaWVudFNlcnZpY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIG1pYyk7XG5cdFx0KFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfaXNDb25uZWN0ZWQnKSBhcyB7IHNldCh2YWx1ZTogYm9vbGVhbiwgdHg6IHVuZGVmaW5lZCk6IHZvaWQgfSkuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBrZXkgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblxuXHRcdC8vIEEgZGVsaWJlcmF0ZSAobm9uLXBhc3NpdmUpIHByZXNzIGlzIGhlbGQ7IGl0IGxhdGNoZWQgdGhlIGJhY2tlbmQuXG5cdFx0UmVmbGVjdC5zZXQoY29udHJvbGxlciwgJ19wdHRDdXJyZW50VHVybklkJywgJ2RlbGliZXJhdGUtdHVybicpO1xuXHRcdFJlZmxlY3Quc2V0KGNvbnRyb2xsZXIsICdfcHR0Q3VycmVudFR1cm5QYXNzaXZlJywgZmFsc2UpO1xuXHRcdFJlZmxlY3Quc2V0KGNvbnRyb2xsZXIsICdfcHR0SGVsZCcsIHRydWUpO1xuXG5cdFx0Ly8gVGhlIGJ1ZmZlciBob2xkcyBhbiBPTERFUiByZXBseSwgYnV0IHRoZSBzZXNzaW9uJ3MgY3VycmVudCBwZW5kaW5nXG5cdFx0Ly8gc3VtbWFyeSBpcyBhIERJRkZFUkVOVCwgbmV3ZXIgcmVwbHkgKHRoZSBidWZmZXIgc3Vydml2ZWQgYSBuZXcgdHVybiAtXG5cdFx0Ly8gYSBgdGhpbmtpbmdgIHRyYW5zaXRpb24gY2xlYXJzIF9kZWZlcnJlZE5hcnJhdGlvbnMsIG5vdCBfZGVmZXJyZWRSZXNwb25zZXMpLlxuXHRcdGNvbnN0IGRlZmVycmVkID0gUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19kZWZlcnJlZFJlc3BvbnNlcycpIGFzIE1hcDxzdHJpbmcsIHsgcmVzcG9uc2VJZD86IHN0cmluZzsgZmluYWxpemVkOiBib29sZWFuOyBjaHVua3M6IHsgYXVkaW86IHN0cmluZzsgaXNGaXJzdENodW5rOiBib29sZWFuOyBpc0ZpbmFsOiBib29sZWFuOyB0cmFuc2NyaXB0OiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdIH1bXT47XG5cdFx0ZGVmZXJyZWQuc2V0KGtleSwgW3tcblx0XHRcdHJlc3BvbnNlSWQ6ICdyMScsXG5cdFx0XHRmaW5hbGl6ZWQ6IHRydWUsXG5cdFx0XHRjaHVua3M6IFt7IGF1ZGlvOiAnQUFBQScsIGlzRmlyc3RDaHVuazogdHJ1ZSwgaXNGaW5hbDogdHJ1ZSwgdHJhbnNjcmlwdDogJ29sZCByZXBseScgfV0sXG5cdFx0fV0pO1xuXHRcdChSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3BlbmRpbmdSZXNwb25zZVN1bW1hcmllcycpIGFzIE1hcDxzdHJpbmcsIHN0cmluZz4pLnNldChrZXksICdhIGRpZmZlcmVudCBuZXdlciByZXBseScpO1xuXG5cdFx0KFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfYWN0aXZhdGVTaG93blNlc3Npb24nKSBhcyAocmVzb3VyY2U6IFVSSSkgPT4gdm9pZCkuY2FsbChjb250cm9sbGVyLCBVUkkucGFyc2Uoa2V5KSk7XG5cblx0XHQvLyBSZXRlbnRpb24gbXVzdCBzdXBwcmVzcyBPTkxZIGEgZHVwbGljYXRlIG9mIHRoZSBidWZmZXJlZCByZXBseSwgc28gdGhlXG5cdFx0Ly8gZGlmZmVyZW50IHBlbmRpbmcgcmVwbHkgc3RpbGwgbmFycmF0ZXMgKGRlZmVycmVkL3JldHJpZWQgd2hpbGUgaGVsZCkuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZvaWNlQ2xpZW50U2VydmljZS5yZXF1ZXN0cy5sZW5ndGgsIDEsICd0aGUgZGlmZmVyZW50IHJlcGx5IG11c3Qgc3RpbGwgYmUgbmFycmF0ZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodm9pY2VDbGllbnRTZXJ2aWNlLnJlcXVlc3RzWzBdLnRleHQsICdhIGRpZmZlcmVudCBuZXdlciByZXBseScpO1xuXHRcdGNvbnN0IHJlbWFpbmluZyA9IGRlZmVycmVkLmdldChrZXkpO1xuXHRcdGFzc2VydC5vayhyZW1haW5pbmcgJiYgcmVtYWluaW5nLmxlbmd0aCA9PT0gMSwgJ3RoZSB1bnJlbGF0ZWQgYnVmZmVyZWQgcmVwbHkgc3RheXMgZGVmZXJyZWQnKTtcblx0fSk7XG5cblx0dGVzdCgncHJvbW90aW5nIGEgcGFzc2l2ZSBiYXJnZS1pbiBsaXN0ZW4gY2xlYXJzIHRoZSBwYXNzaXZlIGZsYWcgc28gcGxheWJhY2sgcHJlc2VydmVzIHRoZSBwcmVzcycsICgpID0+IHtcblx0XHRjb25zdCB2b2ljZUNsaWVudFNlcnZpY2UgPSBuZXcgVGVzdFZvaWNlQ2xpZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IG1pYyA9IG5ldyBSZWNvcmRpbmdNaWNDYXB0dXJlU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHZvaWNlQ2xpZW50U2VydmljZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbWljKTtcblx0XHQoUmVmbGVjdC5nZXQoY29udHJvbGxlciwgJ19pc0Nvbm5lY3RlZCcpIGFzIHsgc2V0KHZhbHVlOiBib29sZWFuLCB0eDogdW5kZWZpbmVkKTogdm9pZCB9KS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIEEgcGFzc2l2ZSBiYXJnZS1pbiBsaXN0ZW4gaXMgc3RyZWFtaW5nIGR1cmluZyBhc3Npc3RhbnQgcGxheWJhY2suXG5cdFx0UmVmbGVjdC5zZXQoY29udHJvbGxlciwgJ19iYXJnZUluTGlzdGVuQWN0aXZlJywgdHJ1ZSk7XG5cdFx0UmVmbGVjdC5zZXQoY29udHJvbGxlciwgJ19wdHRIZWxkJywgdHJ1ZSk7XG5cdFx0UmVmbGVjdC5zZXQoY29udHJvbGxlciwgJ19wdHRDdXJyZW50VHVyblBhc3NpdmUnLCB0cnVlKTtcblxuXHRcdC8vIEEgZGVsaWJlcmF0ZSBwcmVzcyBwcm9tb3RlcyBpdCBpbnRvIGEgdXNlci1kcml2ZW4gaW50ZXJydXB0LlxuXHRcdGNvbnRyb2xsZXIucHR0RG93bigpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfcHR0Q3VycmVudFR1cm5QYXNzaXZlJyksIGZhbHNlKTtcblxuXHRcdC8vIEEgcHJvbW90ZWQgZGVsaWJlcmF0ZSBwcmVzcyBtdXN0IGJlIHByZXNlcnZlZCAobm90IHRvcm4gZG93bikgYnlcblx0XHQvLyBwbGF5YmFjayBwcmVwLCBzaW5jZSBpdCBsYXRjaGVkIHRoZSBiYWNrZW5kIGp1c3QgbGlrZSBhIGZyZXNoIHByZXNzLlxuXHRcdGNvbnN0IHByZXBhcmVkID0gKFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfcHJlcGFyZUZvclBsYXliYWNrJykgYXMgKCkgPT4gYm9vbGVhbikuY2FsbChjb250cm9sbGVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWljLmFib3J0Q2FsbHMsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3B0dEhlbGQnKSwgdHJ1ZSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdWb2ljZVNlc3Npb25Db250cm9sbGVyIGxpdmUgdHJhbnNjcmlwdGlvbicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVDb250cm9sbGVyKG9wdGlvbnM6IHsgbGl2ZVRyYW5zY3JpcHQ/OiBib29sZWFuIH0gPSB7fSk6IHsgY29udHJvbGxlcjogVm9pY2VTZXNzaW9uQ29udHJvbGxlcjsgcGVyc2lzdGVkOiBJVm9pY2VUcmFuc2NyaXB0VHVybltdIH0ge1xuXHRcdGNvbnN0IGxpdmVUcmFuc2NyaXB0ID0gb3B0aW9ucy5saXZlVHJhbnNjcmlwdCA/PyB0cnVlO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpKTtcblx0XHRjb25zdCBwZXJzaXN0ZWQ6IElWb2ljZVRyYW5zY3JpcHRUdXJuW10gPSBbXTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVZvaWNlQ2xpZW50U2VydmljZSwge1xuXHRcdFx0ZGlzY29ubmVjdDogKCkgPT4geyB9LFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU1pY0NhcHR1cmVTZXJ2aWNlLCB7XG5cdFx0XHRpc011dGVkOiBmYWxzZSxcblx0XHRcdHB0dERvd246IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdHB0dFVwOiAoKSA9PiB7IH0sXG5cdFx0XHRhYm9ydFB0dDogKCkgPT4geyB9LFxuXHRcdFx0c3RvcENhcHR1cmU6ICgpID0+IHsgfSxcblx0XHRcdHN1cHByZXNzVW50aWw6ICgpID0+IHsgfSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUdHNQbGF5YmFja1NlcnZpY2UsIHtcblx0XHRcdGlzUGxheWluZzogZmFsc2UsXG5cdFx0XHRzdG9wUGxheWJhY2s6ICgpID0+IHsgfSxcblx0XHRcdGNsb3NlQ29udGV4dDogKCkgPT4geyB9LFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVZvaWNlVG9vbERpc3BhdGNoU2VydmljZSwge1xuXHRcdFx0c2V0RGVsZWdhdGU6ICgpID0+IHsgfSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElWb2ljZVBsYXliYWNrU2VydmljZSwge1xuXHRcdFx0bm90aWZ5UGxheWJhY2tFbmQ6ICgpID0+IHsgfSxcblx0XHR9KTtcblx0XHRjb25zdCBhZ2VudFNlc3Npb25zTW9kZWw6IElBZ2VudFNlc3Npb25zTW9kZWwgPSB7XG5cdFx0XHRvbldpbGxSZXNvbHZlOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRSZXNvbHZlOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uczogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbkFyY2hpdmVkU3RhdGU6IEV2ZW50Lk5vbmUsXG5cdFx0XHRyZXNvbHZlZDogdHJ1ZSxcblx0XHRcdHNlc3Npb25zOiBbXSxcblx0XHRcdGdldFNlc3Npb246ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdG9ic2VydmVTZXNzaW9uOiAoKSA9PiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3RTZXNzaW9uJywgdW5kZWZpbmVkKSxcblx0XHRcdHJlc29sdmU6IGFzeW5jICgpID0+IHsgfSxcblx0XHR9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLCB7IG1vZGVsOiBhZ2VudFNlc3Npb25zTW9kZWwgfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVm9pY2VUcmFuc2NyaXB0U3RvcmUsIHtcblx0XHRcdGFwcGVuZFR1cm46IGFzeW5jIChfdXNlcklkLCB0dXJuKSA9PiB7XG5cdFx0XHRcdHBlcnNpc3RlZC5wdXNoKHR1cm4pO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHQnYWdlbnRzLnZvaWNlLmxpdmVUcmFuc2NyaXB0JzogbGl2ZVRyYW5zY3JpcHQsXG5cdFx0fSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLCB7XG5cdFx0XHRwbGF5U2lnbmFsOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWNjZXNzaWJpbGl0eVNlcnZpY2UsIG5ldyBUZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIHtcblx0XHRcdGxhc3RGb2N1c2VkV2lkZ2V0OiB1bmRlZmluZWQsXG5cdFx0XHRvbkRpZEFkZFdpZGdldDogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkQ2hhbmdlRm9jdXNlZFNlc3Npb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRnZXRBbGxXaWRnZXRzOiAoKSA9PiBbXSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVm9pY2VTZXNzaW9uQ29udHJvbGxlcikpO1xuXHRcdGNvbnRyb2xsZXJbJ19pc0Nvbm5lY3RlZCddLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdGNvbnRyb2xsZXJbJ191c2VyTG9naW4nXSA9ICd0ZXN0LXVzZXInO1xuXHRcdHJldHVybiB7IGNvbnRyb2xsZXIsIHBlcnNpc3RlZCB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gYmVnaW5UdXJuKGNvbnRyb2xsZXI6IFZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIpOiBzdHJpbmcge1xuXHRcdGNvbnRyb2xsZXIucHR0RG93bigpO1xuXHRcdHJldHVybiBjb250cm9sbGVyWydfcHR0Q3VycmVudFR1cm5JZCddO1xuXHR9XG5cblx0ZnVuY3Rpb24gZmluaXNoVHVybihjb250cm9sbGVyOiBWb2ljZVNlc3Npb25Db250cm9sbGVyKTogdm9pZCB7XG5cdFx0Y29udHJvbGxlclsnX2ZpbmlzaFB0dCddKCdsb2NhbCcpO1xuXHR9XG5cblx0ZnVuY3Rpb24gdHJhbnNjcmliZShjb250cm9sbGVyOiBWb2ljZVNlc3Npb25Db250cm9sbGVyLCBldmVudDogSVZvaWNlVHJhbnNjcmlwdGlvbik6IHZvaWQge1xuXHRcdGNvbnRyb2xsZXJbJ19oYW5kbGVUcmFuc2NyaXB0aW9uJ10oZXZlbnQpO1xuXHR9XG5cblx0dGVzdCgncmVwbGFjZXMgY3VtdWxhdGl2ZSBwYXJ0aWFscyBhbmQgZmluYWwgZXhhY3RseSBvbmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgcGVyc2lzdGVkIH0gPSBjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3QgdHVybklkID0gYmVnaW5UdXJuKGNvbnRyb2xsZXIpO1xuXG5cdFx0dHJhbnNjcmliZShjb250cm9sbGVyLCB7IHRleHQ6ICdvcGVuJywgY29tbWl0dGVkOiAnb3AnLCBzdGF0dXM6ICdwYXJ0aWFsJywgdHVybklkLCByZXZpc2lvbjogMSB9KTtcblx0XHR0cmFuc2NyaWJlKGNvbnRyb2xsZXIsIHsgdGV4dDogJ29wZW4gdGhlIGZpbGUnLCBjb21taXR0ZWQ6ICdvcGVuICcsIHN0YXR1czogJ3BhcnRpYWwnLCB0dXJuSWQsIHJldmlzaW9uOiAyIH0pO1xuXHRcdHRyYW5zY3JpYmUoY29udHJvbGxlciwgeyB0ZXh0OiAnc3RhbGUgbG93ZXInLCBjb21taXR0ZWQ6ICcnLCBzdGF0dXM6ICdwYXJ0aWFsJywgdHVybklkLCByZXZpc2lvbjogMSB9KTtcblx0XHR0cmFuc2NyaWJlKGNvbnRyb2xsZXIsIHsgdGV4dDogJ3N0YWxlIHNhbWUnLCBjb21taXR0ZWQ6ICcnLCBzdGF0dXM6ICdwYXJ0aWFsJywgdHVybklkLCByZXZpc2lvbjogMiB9KTtcblx0XHRmaW5pc2hUdXJuKGNvbnRyb2xsZXIpO1xuXHRcdHRyYW5zY3JpYmUoY29udHJvbGxlciwgeyB0ZXh0OiAnZGVsZXRlIHRoZSBmaWxlIGluc3RlYWQnLCBzdGF0dXM6ICdmaW5hbCcsIHR1cm5JZCwgcmV2aXNpb246IDMgfSk7XG5cdFx0dHJhbnNjcmliZShjb250cm9sbGVyLCB7IHRleHQ6ICdsYXRlIHBhcnRpYWwnLCBzdGF0dXM6ICdwYXJ0aWFsJywgdHVybklkLCByZXZpc2lvbjogNCB9KTtcblx0XHR0cmFuc2NyaWJlKGNvbnRyb2xsZXIsIHsgdGV4dDogJ2R1cGxpY2F0ZSBmaW5hbCcsIHN0YXR1czogJ2ZpbmFsJywgdHVybklkLCByZXZpc2lvbjogNSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dHVybnM6IGNvbnRyb2xsZXIudHJhbnNjcmlwdFR1cm5zLmdldCgpLFxuXHRcdFx0cGVyc2lzdGVkOiBwZXJzaXN0ZWQubWFwKHR1cm4gPT4gdHVybi50ZXh0KSxcblx0XHR9LCB7XG5cdFx0XHR0dXJuczogW3tcblx0XHRcdFx0c3BlYWtlcjogJ3VzZXInLFxuXHRcdFx0XHR0ZXh0OiAnZGVsZXRlIHRoZSBmaWxlIGluc3RlYWQnLFxuXHRcdFx0XHRjb21taXR0ZWQ6ICcnLFxuXHRcdFx0XHRpc1BhcnRpYWw6IGZhbHNlLFxuXHRcdFx0fV0sXG5cdFx0XHRwZXJzaXN0ZWQ6IFsnZGVsZXRlIHRoZSBmaWxlIGluc3RlYWQnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBhIHNjb3BlZCBldmVudCBmb3IgYW5vdGhlciB0dXJuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgcGVyc2lzdGVkIH0gPSBjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3QgdHVybklkID0gYmVnaW5UdXJuKGNvbnRyb2xsZXIpO1xuXG5cdFx0dHJhbnNjcmliZShjb250cm9sbGVyLCB7IHRleHQ6ICd3cm9uZyB0dXJuJywgc3RhdHVzOiAnZmluYWwnLCB0dXJuSWQ6IGAke3R1cm5JZH0tb3RoZXJgLCByZXZpc2lvbjogMSB9KTtcblx0XHRmaW5pc2hUdXJuKGNvbnRyb2xsZXIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0dXJuczogY29udHJvbGxlci50cmFuc2NyaXB0VHVybnMuZ2V0KCksXG5cdFx0XHRwZXJzaXN0ZWQsXG5cdFx0fSwge1xuXHRcdFx0dHVybnM6IFt7IHNwZWFrZXI6ICd1c2VyJywgdGV4dDogJycsIGNvbW1pdHRlZDogJycsIGlzUGFydGlhbDogdHJ1ZSB9XSxcblx0XHRcdHBlcnNpc3RlZDogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjY2VwdHMgdGhlIGZpbmFsIGFmdGVyIGF1dG8tZW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgcGVyc2lzdGVkIH0gPSBjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3QgdHVybklkID0gYmVnaW5UdXJuKGNvbnRyb2xsZXIpO1xuXG5cdFx0dHJhbnNjcmliZShjb250cm9sbGVyLCB7IHRleHQ6ICdydW4gdGhlIHRlc3RzJywgY29tbWl0dGVkOiAncnVuICcsIHN0YXR1czogJ3BhcnRpYWwnLCB0dXJuSWQsIHJldmlzaW9uOiAxIH0pO1xuXHRcdGNvbnRyb2xsZXJbJ19oYW5kbGVUdXJuQXV0b0VuZGVkJ10oeyByZWFzb246ICd2YWRfc2lsZW5jZScsIHR1cm5JZCB9KTtcblx0XHR0cmFuc2NyaWJlKGNvbnRyb2xsZXIsIHsgdGV4dDogJ3J1biB0aGUgZm9jdXNlZCB0ZXN0cycsIHN0YXR1czogJ2ZpbmFsJywgdHVybklkLCByZXZpc2lvbjogMiB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dHVybnM6IGNvbnRyb2xsZXIudHJhbnNjcmlwdFR1cm5zLmdldCgpLFxuXHRcdFx0cGVyc2lzdGVkOiBwZXJzaXN0ZWQubWFwKHR1cm4gPT4gdHVybi50ZXh0KSxcblx0XHR9LCB7XG5cdFx0XHR0dXJuczogW3sgc3BlYWtlcjogJ3VzZXInLCB0ZXh0OiAncnVuIHRoZSBmb2N1c2VkIHRlc3RzJywgY29tbWl0dGVkOiAnJywgaXNQYXJ0aWFsOiBmYWxzZSB9XSxcblx0XHRcdHBlcnNpc3RlZDogWydydW4gdGhlIGZvY3VzZWQgdGVzdHMnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBuZXcgdHVybiByZXNldHMgcmV2aXNpb24gdHJhY2tpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyIH0gPSBjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3QgZmlyc3RUdXJuSWQgPSBiZWdpblR1cm4oY29udHJvbGxlcik7XG5cdFx0dHJhbnNjcmliZShjb250cm9sbGVyLCB7IHRleHQ6ICdmaXJzdCB0dXJuJywgc3RhdHVzOiAncGFydGlhbCcsIHR1cm5JZDogZmlyc3RUdXJuSWQsIHJldmlzaW9uOiAxMCB9KTtcblx0XHRmaW5pc2hUdXJuKGNvbnRyb2xsZXIpO1xuXG5cdFx0Y29uc3Qgc2Vjb25kVHVybklkID0gYmVnaW5UdXJuKGNvbnRyb2xsZXIpO1xuXHRcdHRyYW5zY3JpYmUoY29udHJvbGxlciwgeyB0ZXh0OiAnc2Vjb25kIHR1cm4nLCBjb21taXR0ZWQ6ICdzZWNvbmQgJywgc3RhdHVzOiAncGFydGlhbCcsIHR1cm5JZDogc2Vjb25kVHVybklkLCByZXZpc2lvbjogMSB9KTtcblx0XHRmaW5pc2hUdXJuKGNvbnRyb2xsZXIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250cm9sbGVyLnRyYW5zY3JpcHRUdXJucy5nZXQoKSwgW1xuXHRcdFx0eyBzcGVha2VyOiAndXNlcicsIHRleHQ6ICdmaXJzdCB0dXJuJywgY29tbWl0dGVkOiAnJywgaXNQYXJ0aWFsOiB0cnVlIH0sXG5cdFx0XHR7IHNwZWFrZXI6ICd1c2VyJywgdGV4dDogJ3NlY29uZCB0dXJuJywgY29tbWl0dGVkOiAnc2Vjb25kICcsIGlzUGFydGlhbDogdHJ1ZSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnNjb3BlZCBsZWdhY3kgZXZlbnRzIHJldGFpbiByZXBsYWNlbWVudCBhbmQgcGVyc2lzdGVuY2UgYmVoYXZpb3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBwZXJzaXN0ZWQgfSA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblxuXHRcdHRyYW5zY3JpYmUoY29udHJvbGxlciwgeyB0ZXh0OiAnbGVnYWN5IHBhcnRpYWwnLCBjb21taXR0ZWQ6ICdsZWdhY3kgJywgc3RhdHVzOiAncGFydGlhbCcgfSk7XG5cdFx0dHJhbnNjcmliZShjb250cm9sbGVyLCB7IHRleHQ6ICdsZWdhY3kgZmluYWwgY29ycmVjdGVkJywgc3RhdHVzOiAnZmluYWwnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0dXJuczogY29udHJvbGxlci50cmFuc2NyaXB0VHVybnMuZ2V0KCksXG5cdFx0XHRwZXJzaXN0ZWQ6IHBlcnNpc3RlZC5tYXAodHVybiA9PiB0dXJuLnRleHQpLFxuXHRcdH0sIHtcblx0XHRcdHR1cm5zOiBbeyBzcGVha2VyOiAndXNlcicsIHRleHQ6ICdsZWdhY3kgZmluYWwgY29ycmVjdGVkJywgY29tbWl0dGVkOiAnJywgaXNQYXJ0aWFsOiBmYWxzZSB9XSxcblx0XHRcdHBlcnNpc3RlZDogWydsZWdhY3kgZmluYWwgY29ycmVjdGVkJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JhcmdlLWluIGFuZCByZWNvbm5lY3QgY2xlYXIgc2NvcGVkIHR1cm4gdHJhY2tpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBwZXJzaXN0ZWQgfSA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBiYXJnZUluVHVybklkID0gYmVnaW5UdXJuKGNvbnRyb2xsZXIpO1xuXHRcdGZpbmlzaFR1cm4oY29udHJvbGxlcik7XG5cdFx0Y29udHJvbGxlclsnX2hhbmRsZUJhcmdlSW4nXSh7IHR1cm5JZDogJ25ldy10dXJuJywgaW50ZXJydXB0ZWRUdXJuSWQ6IGJhcmdlSW5UdXJuSWQgfSk7XG5cdFx0dHJhbnNjcmliZShjb250cm9sbGVyLCB7IHRleHQ6ICdhZnRlciBiYXJnZS1pbicsIHN0YXR1czogJ2ZpbmFsJywgdHVybklkOiBiYXJnZUluVHVybklkLCByZXZpc2lvbjogMSB9KTtcblxuXHRcdGNvbnRyb2xsZXJbJ19pc0Nvbm5lY3RlZCddLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHJlY29ubmVjdFR1cm5JZCA9IGJlZ2luVHVybihjb250cm9sbGVyKTtcblx0XHRmaW5pc2hUdXJuKGNvbnRyb2xsZXIpO1xuXHRcdGNvbnRyb2xsZXJbJ19vbkNvbm5lY3Rpb25Mb3N0J10oKTtcblx0XHR0cmFuc2NyaWJlKGNvbnRyb2xsZXIsIHsgdGV4dDogJ2FmdGVyIHJlY29ubmVjdCcsIHN0YXR1czogJ2ZpbmFsJywgdHVybklkOiByZWNvbm5lY3RUdXJuSWQsIHJldmlzaW9uOiAxIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwZXJzaXN0ZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgbGl2ZSBwYXJ0aWFscyB3aGVuIGxpdmUgdHJhbnNjcmlwdCBpcyBkaXNhYmxlZCBidXQga2VlcHMgdGhlIGZpbmFsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgcGVyc2lzdGVkIH0gPSBjcmVhdGVDb250cm9sbGVyKHsgbGl2ZVRyYW5zY3JpcHQ6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IHR1cm5JZCA9IGJlZ2luVHVybihjb250cm9sbGVyKTtcblxuXHRcdHRyYW5zY3JpYmUoY29udHJvbGxlciwgeyB0ZXh0OiAnb3BlbicsIGNvbW1pdHRlZDogJ29wJywgc3RhdHVzOiAncGFydGlhbCcsIHR1cm5JZCwgcmV2aXNpb246IDEgfSk7XG5cdFx0dHJhbnNjcmliZShjb250cm9sbGVyLCB7IHRleHQ6ICdvcGVuIHRoZSBmaWxlJywgY29tbWl0dGVkOiAnb3BlbiAnLCBzdGF0dXM6ICdwYXJ0aWFsJywgdHVybklkLCByZXZpc2lvbjogMiB9KTtcblx0XHRmaW5pc2hUdXJuKGNvbnRyb2xsZXIpO1xuXHRcdHRyYW5zY3JpYmUoY29udHJvbGxlciwgeyB0ZXh0OiAnb3BlbiB0aGUgZmlsZScsIHN0YXR1czogJ2ZpbmFsJywgdHVybklkLCByZXZpc2lvbjogMyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dHVybnM6IGNvbnRyb2xsZXIudHJhbnNjcmlwdFR1cm5zLmdldCgpLFxuXHRcdFx0cGVyc2lzdGVkOiBwZXJzaXN0ZWQubWFwKHR1cm4gPT4gdHVybi50ZXh0KSxcblx0XHR9LCB7XG5cdFx0XHR0dXJuczogW3sgc3BlYWtlcjogJ3VzZXInLCB0ZXh0OiAnb3BlbiB0aGUgZmlsZScsIGNvbW1pdHRlZDogJycsIGlzUGFydGlhbDogZmFsc2UgfV0sXG5cdFx0XHRwZXJzaXN0ZWQ6IFsnb3BlbiB0aGUgZmlsZSddLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLE9BQU8sV0FBVztBQUNsQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsbUNBQW1DO0FBRTVDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQW1FLHdCQUF3QjtBQUMzRixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHNCQUFzQixpQ0FBaUM7QUFHaEUsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyw2QkFBbUQ7QUFDNUQsU0FBUywwQkFBK0M7QUFDeEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBa0MsOEJBQThCO0FBQ2hFLFNBQVMsaUNBQWlDO0FBQzFDLFNBQXlCLGtCQUE4RCxjQUFjLHFCQUFxQix1QkFBdUI7QUFFakosU0FBUyxpQkFBd0YscUJBQXNLLGVBQTBELG9DQUFvQztBQUVyVyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVCQUF1QjtBQUVoQyxNQUFNLCtCQUErQixLQUEwQixFQUFFO0FBQUEsRUFBakU7QUFBQTtBQUNDLFNBQVEsbUJBQW1CO0FBQzNCLFNBQVMsV0FBK00sQ0FBQztBQUN6TixTQUFTLGtCQUEwQyxDQUFDO0FBQ3BELFNB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QVcsSUFBSSxXQUFXLE1BQU0sQ0FBQztBQUFBLE1BQzVGLFdBQVcsQ0FBQyx3QkFBd0I7QUFBQSxJQUNyQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxREFBcUQsTUFBTTtBQUMvRCxVQUFNLEVBQUUsWUFBWSxVQUFVLElBQUksaUJBQWlCO0FBQ25ELFVBQU0sZ0JBQWdCLFVBQVUsVUFBVTtBQUMxQyxlQUFXLFVBQVU7QUFDckIsZUFBVyxnQkFBZ0IsRUFBRSxFQUFFLFFBQVEsWUFBWSxtQkFBbUIsY0FBYyxDQUFDO0FBQ3JGLGVBQVcsWUFBWSxFQUFFLE1BQU0sa0JBQWtCLFFBQVEsU0FBUyxRQUFRLGVBQWUsVUFBVSxFQUFFLENBQUM7QUFFdEcsZUFBVyxjQUFjLEVBQUUsSUFBSSxNQUFNLE1BQVM7QUFDOUMsVUFBTSxrQkFBa0IsVUFBVSxVQUFVO0FBQzVDLGVBQVcsVUFBVTtBQUNyQixlQUFXLG1CQUFtQixFQUFFO0FBQ2hDLGVBQVcsWUFBWSxFQUFFLE1BQU0sbUJBQW1CLFFBQVEsU0FBUyxRQUFRLGlCQUFpQixVQUFVLEVBQUUsQ0FBQztBQUV6RyxXQUFPLGdCQUFnQixXQUFXLENBQUMsQ0FBQztBQUFBLEVBQ3JDLENBQUM7QUFFRCxPQUFLLDRFQUE0RSxNQUFNO0FBQ3RGLFVBQU0sRUFBRSxZQUFZLFVBQVUsSUFBSSxpQkFBaUIsRUFBRSxnQkFBZ0IsTUFBTSxDQUFDO0FBQzVFLFVBQU0sU0FBUyxVQUFVLFVBQVU7QUFFbkMsZUFBVyxZQUFZLEVBQUUsTUFBTSxRQUFRLFdBQVcsTUFBTSxRQUFRLFdBQVcsUUFBUSxVQUFVLEVBQUUsQ0FBQztBQUNoRyxlQUFXLFlBQVksRUFBRSxNQUFNLGlCQUFpQixXQUFXLFNBQVMsUUFBUSxXQUFXLFFBQVEsVUFBVSxFQUFFLENBQUM7QUFDNUcsZUFBVyxVQUFVO0FBQ3JCLGVBQVcsWUFBWSxFQUFFLE1BQU0saUJBQWlCLFFBQVEsU0FBUyxRQUFRLFVBQVUsRUFBRSxDQUFDO0FBRXRGLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsT0FBTyxXQUFXLGdCQUFnQixJQUFJO0FBQUEsTUFDdEMsV0FBVyxVQUFVLElBQUksVUFBUSxLQUFLLElBQUk7QUFBQSxJQUMzQyxHQUFHO0FBQUEsTUFDRixPQUFPLENBQUMsRUFBRSxTQUFTLFFBQVEsTUFBTSxpQkFBaUIsV0FBVyxJQUFJLFdBQVcsTUFBTSxDQUFDO0FBQUEsTUFDbkYsV0FBVyxDQUFDLGVBQWU7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsiXyJdCn0K
