import assert from "assert";
import { mainWindow } from "../../../../../../base/browser/window.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ConfigurationTarget } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import product from "../../../../../../platform/product/common/product.js";
import { VoiceClientService } from "../../../browser/voiceClient/voiceClientService.js";
class TestWebSocket {
  constructor() {
    this.readyState = WebSocket.OPEN;
    this.sent = [];
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    TestWebSocket.instance = this;
  }
  close() {
    this.readyState = WebSocket.CLOSED;
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
}
function createTestWindow(language = "en-US") {
  return new Proxy(mainWindow, {
    get(target, property, receiver) {
      if (property === "WebSocket") {
        return TestWebSocket;
      }
      if (property === "setInterval" || property === "clearInterval") {
        return target[property].bind(target);
      }
      if (property === "navigator") {
        return new Proxy(target.navigator, {
          get(navigatorTarget, navigatorProperty, navigatorReceiver) {
            if (navigatorProperty === "language") {
              return language;
            }
            return Reflect.get(navigatorTarget, navigatorProperty, navigatorReceiver);
          }
        });
      }
      return Reflect.get(target, property, receiver);
    }
  });
}
suite("VoiceClientService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const productService = {
    _serviceBrand: void 0,
    ...product,
    voiceWsUrl: "ws://voice.test/realtime/voice"
  };
  setup(() => {
    TestWebSocket.instance = void 0;
  });
  function createService(configuration = {}) {
    const configurationService = new TestConfigurationService(configuration);
    const service = store.add(new VoiceClientService(
      configurationService,
      new NullLogService(),
      productService
    ));
    return { service, configurationService };
  }
  function socket() {
    if (!TestWebSocket.instance) {
      throw new Error("Voice WebSocket was not created");
    }
    return TestWebSocket.instance;
  }
  function fireConfigurationChange(configurationService, key) {
    configurationService.onDidChangeConfigurationEmitter.fire({
      source: ConfigurationTarget.USER,
      affectedKeys: /* @__PURE__ */ new Set([key]),
      change: { keys: [key], overrides: [] },
      affectsConfiguration: (candidate) => candidate === key
    });
  }
  test("emits barge-in events from the backend", async () => {
    const { service } = createService();
    const events = [];
    store.add(service.onBargeIn((event) => events.push(event)));
    await service.connect(createTestWindow());
    const webSocket = socket();
    if (!webSocket.onmessage) {
      throw new Error("Voice WebSocket was not created");
    }
    webSocket.onmessage(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({
        type: "barge_in",
        turn_id: "interrupting-turn",
        interrupted_turn_id: "cancelled-turn"
      })
    }));
    assert.deepStrictEqual(events, [{
      turnId: "interrupting-turn",
      interruptedTurnId: "cancelled-turn"
    }]);
  });
  test("preserves the turn ID on speech-started events", async () => {
    const { service } = createService();
    const events = [];
    store.add(service.onSpeechStarted((event) => events.push(event)));
    await service.connect(createTestWindow());
    socket().onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({
        type: "speech_started",
        turn_id: "passive-turn"
      })
    }));
    assert.deepStrictEqual(events, [{ turnId: "passive-turn" }]);
  });
  test("preserves checkpoint interruption metadata from the backend", async () => {
    const { service } = createService();
    const events = [];
    store.add(service.onNarrationInterrupted((event) => events.push(event)));
    await service.connect(createTestWindow());
    socket().onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({
        type: "narration_interrupted",
        narration_id: "checkpoint-narration",
        coding_session_id: "chat-session:/one",
        retryable: false,
        reason: "superseded_by_response"
      })
    }));
    assert.deepStrictEqual(events, [{
      narrationId: "checkpoint-narration",
      codingSessionId: "chat-session:/one",
      retryable: false,
      reason: "superseded_by_response"
    }]);
  });
  test("preserves the backend turn ID when audio has a narration ID", async () => {
    const { service } = createService();
    const events = [];
    store.add(service.onAudioResponse((event) => events.push(event)));
    await service.connect(createTestWindow());
    const webSocket = socket();
    if (!webSocket.onmessage) {
      throw new Error("Voice WebSocket was not created");
    }
    webSocket.onmessage(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({
        type: "audio_response",
        audio: "audio",
        is_first_chunk: true,
        is_final: false,
        turn_id: "backend-turn",
        narration_id: "client-narration",
        request_id: "request-1",
        checkpoint_id: "planning",
        sequence: 1,
        narration_kind: "checkpoint",
        playback_id: "playback-1"
      })
    }));
    assert.deepStrictEqual(events, [{
      audio: "audio",
      isFirstChunk: true,
      isFinal: false,
      codingSessionId: void 0,
      transcript: void 0,
      turnId: "backend-turn",
      responseId: "client-narration",
      requestId: "request-1",
      checkpointId: "planning",
      sequence: 1,
      narrationKind: "checkpoint",
      playbackId: "playback-1"
    }]);
  });
  test("validates and translates scoped transcription metadata", async () => {
    const productService2 = {
      _serviceBrand: void 0,
      ...product,
      voiceWsUrl: "ws://voice.test/realtime/voice"
    };
    const service = store.add(new VoiceClientService(
      new TestConfigurationService(),
      new NullLogService(),
      productService2
    ));
    const events = [];
    store.add(service.onTranscription((event) => events.push(event)));
    await service.connect(createTestWindow());
    const socket2 = TestWebSocket.instance;
    if (!socket2?.onmessage) {
      throw new Error("Voice WebSocket was not created");
    }
    socket2.onmessage(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({
        type: "transcription",
        text: "create a file",
        status: "partial",
        committed: "create ",
        turn_id: "turn-1",
        revision: 3
      })
    }));
    assert.deepStrictEqual(events, [{
      text: "create a file",
      status: "partial",
      committed: "create ",
      turnId: "turn-1",
      revision: 3
    }]);
  });
  test("rejects invalid transcription status and revision", async () => {
    const productService2 = {
      _serviceBrand: void 0,
      ...product,
      voiceWsUrl: "ws://voice.test/realtime/voice"
    };
    const service = store.add(new VoiceClientService(
      new TestConfigurationService(),
      new NullLogService(),
      productService2
    ));
    const events = [];
    store.add(service.onTranscription((event) => events.push(event)));
    await service.connect(createTestWindow());
    const socket2 = TestWebSocket.instance;
    if (!socket2?.onmessage) {
      throw new Error("Voice WebSocket was not created");
    }
    for (const message of [
      { type: "transcription", text: "invalid status", status: "pending" },
      { type: "transcription", text: "unscoped revision", status: "partial", revision: 1 },
      { type: "transcription", text: "invalid revision", status: "partial", turn_id: "turn-1", revision: 1.5 },
      { type: "transcription", text: "negative revision", status: "partial", turn_id: "turn-1", revision: -1 },
      { type: "transcription", text: "legacy final" }
    ]) {
      socket2.onmessage(new mainWindow.MessageEvent("message", { data: JSON.stringify(message) }));
    }
    assert.deepStrictEqual(events, [{
      text: "legacy final",
      status: "final",
      committed: "",
      turnId: void 0,
      revision: void 0
    }]);
  });
  test("sends microphone audio using the PTT protocol", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    service.sendPttStart("turn-1");
    service.sendPttAudioChunk("cGNt");
    service.sendPttEnd();
    assert.deepStrictEqual(socket().sent, [
      { type: "ptt_start", turn_id: "turn-1" },
      { type: "ptt_audio_chunk", audio: "cGNt" },
      { type: "ptt_end" }
    ]);
  });
  test("sends first-class checkpoint narration metadata", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    const narrationId = service.requestNarration("chat-session:/one", "checkpoint", "Updating the code.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 2
    });
    service.sendNarrationPlaybackComplete("chat-session:/one", narrationId, "playback-1");
    assert.deepStrictEqual(socket().sent.slice(1), [
      {
        type: "request_narration",
        coding_session_id: "chat-session:/one",
        kind: "checkpoint",
        text: "Updating the code.",
        narration_id: narrationId,
        request_id: "request-1",
        checkpoint_id: "editing",
        sequence: 2
      },
      {
        type: "narration_playback_complete",
        coding_session_id: "chat-session:/one",
        narration_id: narrationId,
        playback_id: "playback-1"
      }
    ]);
  });
  test("sends typed confirmation narration metadata", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    const narrationId = service.requestNarration(
      "chat-session:/one",
      "confirmation",
      "questionnaire: 1 question",
      void 0,
      void 0,
      "questionnaire"
    );
    assert.deepStrictEqual(socket().sent[1], {
      type: "request_narration",
      coding_session_id: "chat-session:/one",
      kind: "confirmation",
      text: "questionnaire: 1 question",
      narration_id: narrationId,
      confirmation_type: "questionnaire"
    });
  });
  test("persists and clears typed confirmation session state", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    socket().onopen?.();
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    service.sendSessionContext({
      sessions: [{
        id: "chat-session:/one",
        is_active: true,
        agent_state: "waiting_for_confirmation",
        agent_state_detail: "questionnaire: 1 question",
        confirmation_type: "questionnaire"
      }],
      display_locale: "en-US"
    });
    service.flushSessionContext();
    service.sendSessionContext({
      sessions: [{
        id: "chat-session:/one",
        is_active: true,
        agent_state: "idle"
      }],
      display_locale: "en-US"
    });
    service.flushSessionContext();
    assert.deepStrictEqual(socket().sent.slice(1), [
      {
        type: "session_context",
        mode: "delta",
        upserts: [{
          id: "chat-session:/one",
          is_active: true,
          agent_state: "waiting_for_confirmation",
          agent_state_detail: "questionnaire: 1 question",
          confirmation_type: "questionnaire"
        }],
        removes: []
      },
      {
        type: "session_context",
        mode: "delta",
        upserts: [{
          id: "chat-session:/one",
          agent_state: "idle",
          agent_state_detail: null,
          confirmation_type: null
        }],
        removes: []
      }
    ]);
  });
  test("invalidated context preserves pending deletion tombstones", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    socket().onopen?.();
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    const sessionId = "chat-session:/one";
    service.sendSessionContext({
      sessions: [{
        id: sessionId,
        is_active: true,
        agent_state: "waiting_for_confirmation",
        agent_state_detail: "Which region?",
        confirmation_type: "questionnaire",
        pending: {
          type: "questions",
          pending_id: "request-1#p1",
          request_id: "request-1",
          questions: []
        }
      }],
      display_locale: "en-US"
    });
    service.flushSessionContext();
    service.invalidateSessionCache(sessionId);
    service.sendSessionContext({
      sessions: [{
        id: sessionId,
        is_active: true,
        agent_state: "waiting_for_confirmation",
        agent_state_detail: "Which region?",
        confirmation_type: "questionnaire"
      }],
      display_locale: "en-US"
    });
    service.flushSessionContext();
    assert.deepStrictEqual(socket().sent.at(-1), {
      type: "session_context",
      mode: "delta",
      upserts: [{
        id: sessionId,
        is_active: true,
        agent_state: "waiting_for_confirmation",
        agent_state_detail: "Which region?",
        confirmation_type: "questionnaire",
        pending: null
      }],
      removes: []
    });
  });
  test("normalizes legacy suppressed narration acknowledgements", async () => {
    const { service } = createService();
    const events = [];
    store.add(service.onNarrationAck((event) => events.push(event)));
    await service.connect(createTestWindow());
    socket().onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({
        type: "narration_ack",
        narration_id: "narration-1",
        coding_session_id: "chat-session:/one",
        disposition: "suppressed",
        reason: "stale"
      })
    }));
    assert.deepStrictEqual(events, [{
      narrationId: "narration-1",
      codingSessionId: "chat-session:/one",
      disposition: "suppressed",
      reason: "stale"
    }]);
  });
  test("flags a passive ptt_start for hands-free barge-in listens", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    service.sendPttStart("turn-passive", true);
    service.sendPttStart("turn-real", false);
    service.sendPttStart("turn-default");
    assert.deepStrictEqual(socket().sent, [
      { type: "ptt_start", turn_id: "turn-passive", passive: true },
      { type: "ptt_start", turn_id: "turn-real" },
      { type: "ptt_start", turn_id: "turn-default" }
    ]);
  });
  test("serializes the pending id on a question narration", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    const questionId = service.requestNarration("cs1", "question", "Which region?", void 0, void 0, void 0, { pendingId: "p1" });
    const replyId = service.requestNarration("cs1", "response", "Done.");
    assert.deepStrictEqual(socket().sent.filter((message) => message.type === "request_narration"), [
      { type: "request_narration", coding_session_id: "cs1", kind: "question", text: "Which region?", narration_id: questionId, pending_id: "p1" },
      { type: "request_narration", coding_session_id: "cs1", kind: "response", text: "Done.", narration_id: replyId }
    ]);
  });
  test("drops a narration requested before the session starts", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    const narrationId = service.requestNarration("cs1", "question", "Which region?", void 0, void 0, void 0, { pendingId: "p1" });
    assert.strictEqual(narrationId, void 0);
    assert.deepStrictEqual(socket().sent.filter((message) => message.type === "request_narration"), []);
  });
  test("serializes configured language in start_session context", async () => {
    const { service } = createService({
      "agents.voice.language": "fr-fr",
      "agents.voice.voice": "kevin_neutral"
    });
    await service.connect(createTestWindow("de-DE"));
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    assert.deepStrictEqual(socket().sent.map((message) => ({
      type: message.type,
      session_context: message.session_context,
      voice: message.voice,
      auto_narrate: message.auto_narrate
    })), [{
      type: "start_session",
      session_context: { sessions: [], display_locale: "fr-FR" },
      voice: "kevin_neutral",
      auto_narrate: false
    }]);
  });
  test("sends voice instructions when starting a session", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine", void 0, void 0, 'Pronounce "Contoso DB" as written.');
    assert.deepStrictEqual(socket().sent.map((message) => ({
      type: message.type,
      voice_instructions: message.voice_instructions
    })), [{
      type: "start_session",
      voice_instructions: 'Pronounce "Contoso DB" as written.'
    }]);
  });
  test("uses browser locale for auto and falls back when unavailable", async () => {
    const first = createService({ "agents.voice.language": "auto" });
    await first.service.connect(createTestWindow("pt-BR"));
    first.service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    const browserLocale = socket().sent[0].session_context;
    const second = createService({ "agents.voice.language": "auto" });
    await second.service.connect(createTestWindow(""));
    second.service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    const fallbackLocale = socket().sent[0].session_context;
    assert.deepStrictEqual({ browserLocale, fallbackLocale }, {
      browserLocale: { sessions: [], display_locale: "pt-BR" },
      fallbackLocale: { sessions: [], display_locale: "en-US" }
    });
  });
  test("falls back for an unsupported configured BCP-47 locale", async () => {
    const { service } = createService({ "agents.voice.language": "uk-UA" });
    await service.connect(createTestWindow("fr-FR"));
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    assert.deepStrictEqual(socket().sent[0].session_context, {
      sessions: [],
      display_locale: "en-US"
    });
  });
  test("falls back for a configured ASR-only language", async () => {
    const { service } = createService({ "agents.voice.language": "ar" });
    await service.connect(createTestWindow("ar-SA"));
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    assert.deepStrictEqual(socket().sent[0].session_context, {
      sessions: [],
      display_locale: "en-US"
    });
  });
  test("preserves an automatic ASR-only browser locale", async () => {
    const { service } = createService({ "agents.voice.language": "auto" });
    await service.connect(createTestWindow("ar-SA"));
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    assert.deepStrictEqual(socket().sent[0].session_context, {
      sessions: [],
      display_locale: "ar-SA"
    });
  });
  test("falls back for an unsupported automatic browser locale", async () => {
    const { service } = createService({ "agents.voice.language": "auto" });
    await service.connect(createTestWindow("he-IL"));
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    assert.deepStrictEqual(socket().sent[0].session_context, {
      sessions: [],
      display_locale: "en-US"
    });
  });
  test("sends one live language update without changing voice", async () => {
    const { service, configurationService } = createService({
      "agents.voice.language": "auto",
      "agents.voice.voice": "victoria_neutral"
    });
    await service.connect(createTestWindow("en-GB"));
    service.sendStartSession({ sessions: [], display_locale: "en-GB" }, "machine");
    await configurationService.setUserConfiguration("agents.voice.language", "fr-FR");
    fireConfigurationChange(configurationService, "agents.voice.language");
    assert.deepStrictEqual(socket().sent.map((message) => message.type === "start_session" ? {
      type: message.type,
      session_context: message.session_context,
      voice: message.voice
    } : message), [
      {
        type: "start_session",
        session_context: { sessions: [], display_locale: "en-GB" },
        voice: "victoria_neutral"
      },
      { type: "set_language", language: "fr-FR" }
    ]);
  });
  test("defers a language update until the session starts", async () => {
    const { service, configurationService } = createService({ "agents.voice.language": "auto" });
    await service.connect(createTestWindow("en-US"));
    await configurationService.setUserConfiguration("agents.voice.language", "fr");
    fireConfigurationChange(configurationService, "agents.voice.language");
    service.sendStartSession({ sessions: [], display_locale: "en-US" }, "machine");
    assert.deepStrictEqual(socket().sent.map((message) => ({
      type: message.type,
      session_context: message.session_context
    })), [{
      type: "start_session",
      session_context: { sessions: [], display_locale: "fr" }
    }]);
  });
  test("does not update while disconnected and retains language on resume", async () => {
    const { service, configurationService } = createService({
      "agents.voice.language": "auto",
      "agents.voice.voice": "daniel_neutral"
    });
    await service.connect(createTestWindow("en-US"));
    const firstSocket = socket();
    firstSocket.onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({ type: "session_init", session_id: "session-1" })
    }));
    firstSocket.readyState = WebSocket.CLOSED;
    await configurationService.setUserConfiguration("agents.voice.language", "de-DE");
    fireConfigurationChange(configurationService, "agents.voice.language");
    await service.connect(createTestWindow("en-US"));
    service.sendResumeSession({ sessions: [], display_locale: "en-US" }, "machine", "Keep replies concise.");
    assert.deepStrictEqual({
      disconnectedMessages: firstSocket.sent,
      resumeMessages: socket().sent.map((message) => ({
        type: message.type,
        session_id: message.session_id,
        session_context: message.session_context,
        voice: message.voice,
        voice_instructions: message.voice_instructions,
        auto_narrate: message.auto_narrate
      }))
    }, {
      disconnectedMessages: [],
      resumeMessages: [{
        type: "resume_session",
        session_id: "session-1",
        session_context: { sessions: [], display_locale: "de-DE" },
        voice: "daniel_neutral",
        voice_instructions: "Keep replies concise.",
        auto_narrate: false
      }]
    });
  });
  test("adopts the server session id and clears isResuming on session_init, even after a failed resume", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    socket().onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({ type: "session_init", session_id: "session-1" })
    }));
    assert.strictEqual(service.currentSessionId, "session-1");
    assert.strictEqual(service.isResuming, false);
    socket().onopen?.();
    assert.strictEqual(service.isResuming, true);
    socket().onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({ type: "session_init", session_id: "session-2" })
    }));
    assert.strictEqual(service.currentSessionId, "session-2");
    assert.strictEqual(service.isResuming, false);
  });
  test("adopts the server session id and clears isResuming on session_resumed", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    socket().onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({ type: "session_init", session_id: "session-1" })
    }));
    socket().onopen?.();
    assert.strictEqual(service.isResuming, true);
    socket().onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({ type: "session_resumed", session_id: "session-1" })
    }));
    assert.strictEqual(service.currentSessionId, "session-1");
    assert.strictEqual(service.isResuming, false);
  });
  test("resets isResuming on cleanup (terminal disconnect)", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    socket().onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({ type: "session_init", session_id: "session-1" })
    }));
    socket().onopen?.();
    assert.strictEqual(service.isResuming, true);
    socket().onclose?.(new mainWindow.CloseEvent("close", { code: 1e3, wasClean: true }));
    assert.strictEqual(service.isResuming, false);
    assert.strictEqual(service.currentSessionId, void 0);
  });
  test("reports when an abnormal close has scheduled a reconnect", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    socket().onopen?.();
    socket().onclose?.(new mainWindow.CloseEvent("close", { code: 4e3 }));
    assert.strictEqual(service.willReconnect, true);
    service.disconnect();
    assert.strictEqual(service.willReconnect, false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlQ2xpZW50U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVm9pY2VDbGllbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZUNsaWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZvaWNlQXVkaW9SZXNwb25zZSwgSVZvaWNlQmFyZ2VJbiwgSVZvaWNlTmFycmF0aW9uQWNrLCBJVm9pY2VOYXJyYXRpb25TaWduYWwsIElWb2ljZVNwZWVjaFN0YXJ0ZWQsIElWb2ljZVRyYW5zY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdm9pY2VDbGllbnQvdm9pY2VDbGllbnRTZXJ2aWNlLmpzJztcblxuY2xhc3MgVGVzdFdlYlNvY2tldCB7XG5cdHN0YXRpYyBpbnN0YW5jZTogVGVzdFdlYlNvY2tldCB8IHVuZGVmaW5lZDtcblxuXHRyZWFkeVN0YXRlOiBudW1iZXIgPSBXZWJTb2NrZXQuT1BFTjtcblx0cmVhZG9ubHkgc2VudDogUmVjb3JkPHN0cmluZywgdW5rbm93bj5bXSA9IFtdO1xuXHRvbm9wZW46ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuXHRvbm1lc3NhZ2U6ICgoZXZlbnQ6IE1lc3NhZ2VFdmVudCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcblx0b25lcnJvcjogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cdG9uY2xvc2U6ICgoZXZlbnQ6IENsb3NlRXZlbnQpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0VGVzdFdlYlNvY2tldC5pbnN0YW5jZSA9IHRoaXM7XG5cdH1cblxuXHRjbG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnJlYWR5U3RhdGUgPSBXZWJTb2NrZXQuQ0xPU0VEO1xuXHR9XG5cblx0c2VuZChkYXRhOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnNlbnQucHVzaChKU09OLnBhcnNlKGRhdGEpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KTtcblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVUZXN0V2luZG93KGxhbmd1YWdlID0gJ2VuLVVTJyk6IFdpbmRvdyAmIHR5cGVvZiBnbG9iYWxUaGlzIHtcblx0cmV0dXJuIG5ldyBQcm94eShtYWluV2luZG93LCB7XG5cdFx0Z2V0KHRhcmdldCwgcHJvcGVydHksIHJlY2VpdmVyKSB7XG5cdFx0XHRpZiAocHJvcGVydHkgPT09ICdXZWJTb2NrZXQnKSB7XG5cdFx0XHRcdHJldHVybiBUZXN0V2ViU29ja2V0O1xuXHRcdFx0fVxuXHRcdFx0Ly8gTmF0aXZlIHRpbWVyIG1ldGhvZHMgYXJlIGJyYW5kZWQgdG8gdGhlaXIgb3duaW5nIGB3aW5kb3dgIGFuZCB0aHJvd1xuXHRcdFx0Ly8gXCJJbGxlZ2FsIGludm9jYXRpb25cIiB3aGVuIGNhbGxlZCB3aXRoIGEgUHJveHkgYXMgYHRoaXNgOyBiaW5kIHRvIHRoZSByZWFsIHRhcmdldC5cblx0XHRcdGlmIChwcm9wZXJ0eSA9PT0gJ3NldEludGVydmFsJyB8fCBwcm9wZXJ0eSA9PT0gJ2NsZWFySW50ZXJ2YWwnKSB7XG5cdFx0XHRcdHJldHVybiB0YXJnZXRbcHJvcGVydHldLmJpbmQodGFyZ2V0KTtcblx0XHRcdH1cblx0XHRcdGlmIChwcm9wZXJ0eSA9PT0gJ25hdmlnYXRvcicpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBQcm94eSh0YXJnZXQubmF2aWdhdG9yLCB7XG5cdFx0XHRcdFx0Z2V0KG5hdmlnYXRvclRhcmdldCwgbmF2aWdhdG9yUHJvcGVydHksIG5hdmlnYXRvclJlY2VpdmVyKSB7XG5cdFx0XHRcdFx0XHRpZiAobmF2aWdhdG9yUHJvcGVydHkgPT09ICdsYW5ndWFnZScpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGxhbmd1YWdlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIFJlZmxlY3QuZ2V0KG5hdmlnYXRvclRhcmdldCwgbmF2aWdhdG9yUHJvcGVydHksIG5hdmlnYXRvclJlY2VpdmVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFJlZmxlY3QuZ2V0KHRhcmdldCwgcHJvcGVydHksIHJlY2VpdmVyKTtcblx0XHR9XG5cdH0pO1xufVxuXG5zdWl0ZSgnVm9pY2VDbGllbnRTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRjb25zdCBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlID0ge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHQuLi5wcm9kdWN0LFxuXHRcdHZvaWNlV3NVcmw6ICd3czovL3ZvaWNlLnRlc3QvcmVhbHRpbWUvdm9pY2UnLFxuXHR9O1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRUZXN0V2ViU29ja2V0Lmluc3RhbmNlID0gdW5kZWZpbmVkO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKGNvbmZpZ3VyYXRpb246IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge30pOiB7IHNlcnZpY2U6IFZvaWNlQ2xpZW50U2VydmljZTsgY29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoY29uZmlndXJhdGlvbik7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHN0b3JlLmFkZChuZXcgVm9pY2VDbGllbnRTZXJ2aWNlKFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdHByb2R1Y3RTZXJ2aWNlLFxuXHRcdCkpO1xuXHRcdHJldHVybiB7IHNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH07XG5cdH1cblxuXHRmdW5jdGlvbiBzb2NrZXQoKTogVGVzdFdlYlNvY2tldCB7XG5cdFx0aWYgKCFUZXN0V2ViU29ja2V0Lmluc3RhbmNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1ZvaWNlIFdlYlNvY2tldCB3YXMgbm90IGNyZWF0ZWQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIFRlc3RXZWJTb2NrZXQuaW5zdGFuY2U7XG5cdH1cblxuXHRmdW5jdGlvbiBmaXJlQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBrZXk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRzb3VyY2U6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChba2V5XSksXG5cdFx0XHRjaGFuZ2U6IHsga2V5czogW2tleV0sIG92ZXJyaWRlczogW10gfSxcblx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiBjYW5kaWRhdGUgPT4gY2FuZGlkYXRlID09PSBrZXksXG5cdFx0fSk7XG5cdH1cblxuXHR0ZXN0KCdlbWl0cyBiYXJnZS1pbiBldmVudHMgZnJvbSB0aGUgYmFja2VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBldmVudHM6IElWb2ljZUJhcmdlSW5bXSA9IFtdO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLm9uQmFyZ2VJbihldmVudCA9PiBldmVudHMucHVzaChldmVudCkpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXHRcdGNvbnN0IHdlYlNvY2tldCA9IHNvY2tldCgpO1xuXHRcdGlmICghd2ViU29ja2V0Lm9ubWVzc2FnZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdWb2ljZSBXZWJTb2NrZXQgd2FzIG5vdCBjcmVhdGVkJyk7XG5cdFx0fVxuXHRcdHdlYlNvY2tldC5vbm1lc3NhZ2UobmV3IG1haW5XaW5kb3cuTWVzc2FnZUV2ZW50KCdtZXNzYWdlJywge1xuXHRcdFx0ZGF0YTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHR0eXBlOiAnYmFyZ2VfaW4nLFxuXHRcdFx0XHR0dXJuX2lkOiAnaW50ZXJydXB0aW5nLXR1cm4nLFxuXHRcdFx0XHRpbnRlcnJ1cHRlZF90dXJuX2lkOiAnY2FuY2VsbGVkLXR1cm4nLFxuXHRcdFx0fSksXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFt7XG5cdFx0XHR0dXJuSWQ6ICdpbnRlcnJ1cHRpbmctdHVybicsXG5cdFx0XHRpbnRlcnJ1cHRlZFR1cm5JZDogJ2NhbmNlbGxlZC10dXJuJyxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyB0aGUgdHVybiBJRCBvbiBzcGVlY2gtc3RhcnRlZCBldmVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZXZlbnRzOiBJVm9pY2VTcGVlY2hTdGFydGVkW10gPSBbXTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5vblNwZWVjaFN0YXJ0ZWQoZXZlbnQgPT4gZXZlbnRzLnB1c2goZXZlbnQpKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygpKTtcblx0XHRzb2NrZXQoKS5vbm1lc3NhZ2U/LihuZXcgbWFpbldpbmRvdy5NZXNzYWdlRXZlbnQoJ21lc3NhZ2UnLCB7XG5cdFx0XHRkYXRhOiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdHR5cGU6ICdzcGVlY2hfc3RhcnRlZCcsXG5cdFx0XHRcdHR1cm5faWQ6ICdwYXNzaXZlLXR1cm4nLFxuXHRcdFx0fSksXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFt7IHR1cm5JZDogJ3Bhc3NpdmUtdHVybicgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgY2hlY2twb2ludCBpbnRlcnJ1cHRpb24gbWV0YWRhdGEgZnJvbSB0aGUgYmFja2VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBldmVudHM6IElWb2ljZU5hcnJhdGlvblNpZ25hbFtdID0gW107XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25OYXJyYXRpb25JbnRlcnJ1cHRlZChldmVudCA9PiBldmVudHMucHVzaChldmVudCkpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXHRcdHNvY2tldCgpLm9ubWVzc2FnZT8uKG5ldyBtYWluV2luZG93Lk1lc3NhZ2VFdmVudCgnbWVzc2FnZScsIHtcblx0XHRcdGRhdGE6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0dHlwZTogJ25hcnJhdGlvbl9pbnRlcnJ1cHRlZCcsXG5cdFx0XHRcdG5hcnJhdGlvbl9pZDogJ2NoZWNrcG9pbnQtbmFycmF0aW9uJyxcblx0XHRcdFx0Y29kaW5nX3Nlc3Npb25faWQ6ICdjaGF0LXNlc3Npb246L29uZScsXG5cdFx0XHRcdHJldHJ5YWJsZTogZmFsc2UsXG5cdFx0XHRcdHJlYXNvbjogJ3N1cGVyc2VkZWRfYnlfcmVzcG9uc2UnLFxuXHRcdFx0fSksXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFt7XG5cdFx0XHRuYXJyYXRpb25JZDogJ2NoZWNrcG9pbnQtbmFycmF0aW9uJyxcblx0XHRcdGNvZGluZ1Nlc3Npb25JZDogJ2NoYXQtc2Vzc2lvbjovb25lJyxcblx0XHRcdHJldHJ5YWJsZTogZmFsc2UsXG5cdFx0XHRyZWFzb246ICdzdXBlcnNlZGVkX2J5X3Jlc3BvbnNlJyxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyB0aGUgYmFja2VuZCB0dXJuIElEIHdoZW4gYXVkaW8gaGFzIGEgbmFycmF0aW9uIElEJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IGV2ZW50czogSVZvaWNlQXVkaW9SZXNwb25zZVtdID0gW107XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25BdWRpb1Jlc3BvbnNlKGV2ZW50ID0+IGV2ZW50cy5wdXNoKGV2ZW50KSkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coKSk7XG5cdFx0Y29uc3Qgd2ViU29ja2V0ID0gc29ja2V0KCk7XG5cdFx0aWYgKCF3ZWJTb2NrZXQub25tZXNzYWdlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1ZvaWNlIFdlYlNvY2tldCB3YXMgbm90IGNyZWF0ZWQnKTtcblx0XHR9XG5cdFx0d2ViU29ja2V0Lm9ubWVzc2FnZShuZXcgbWFpbldpbmRvdy5NZXNzYWdlRXZlbnQoJ21lc3NhZ2UnLCB7XG5cdFx0XHRkYXRhOiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdHR5cGU6ICdhdWRpb19yZXNwb25zZScsXG5cdFx0XHRcdGF1ZGlvOiAnYXVkaW8nLFxuXHRcdFx0XHRpc19maXJzdF9jaHVuazogdHJ1ZSxcblx0XHRcdFx0aXNfZmluYWw6IGZhbHNlLFxuXHRcdFx0XHR0dXJuX2lkOiAnYmFja2VuZC10dXJuJyxcblx0XHRcdFx0bmFycmF0aW9uX2lkOiAnY2xpZW50LW5hcnJhdGlvbicsXG5cdFx0XHRcdHJlcXVlc3RfaWQ6ICdyZXF1ZXN0LTEnLFxuXHRcdFx0XHRjaGVja3BvaW50X2lkOiAncGxhbm5pbmcnLFxuXHRcdFx0XHRzZXF1ZW5jZTogMSxcblx0XHRcdFx0bmFycmF0aW9uX2tpbmQ6ICdjaGVja3BvaW50Jyxcblx0XHRcdFx0cGxheWJhY2tfaWQ6ICdwbGF5YmFjay0xJyxcblx0XHRcdH0pLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLCBbe1xuXHRcdFx0YXVkaW86ICdhdWRpbycsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiBmYWxzZSxcblx0XHRcdGNvZGluZ1Nlc3Npb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0dHJhbnNjcmlwdDogdW5kZWZpbmVkLFxuXHRcdFx0dHVybklkOiAnYmFja2VuZC10dXJuJyxcblx0XHRcdHJlc3BvbnNlSWQ6ICdjbGllbnQtbmFycmF0aW9uJyxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QtMScsXG5cdFx0XHRjaGVja3BvaW50SWQ6ICdwbGFubmluZycsXG5cdFx0XHRzZXF1ZW5jZTogMSxcblx0XHRcdG5hcnJhdGlvbktpbmQ6ICdjaGVja3BvaW50Jyxcblx0XHRcdHBsYXliYWNrSWQ6ICdwbGF5YmFjay0xJyxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ZhbGlkYXRlcyBhbmQgdHJhbnNsYXRlcyBzY29wZWQgdHJhbnNjcmlwdGlvbiBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlID0ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0Li4ucHJvZHVjdCxcblx0XHRcdHZvaWNlV3NVcmw6ICd3czovL3ZvaWNlLnRlc3QvcmVhbHRpbWUvdm9pY2UnLFxuXHRcdH07XG5cdFx0Y29uc3Qgc2VydmljZSA9IHN0b3JlLmFkZChuZXcgVm9pY2VDbGllbnRTZXJ2aWNlKFxuXHRcdFx0bmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRwcm9kdWN0U2VydmljZSxcblx0XHQpKTtcblx0XHRjb25zdCBldmVudHM6IElWb2ljZVRyYW5zY3JpcHRpb25bXSA9IFtdO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLm9uVHJhbnNjcmlwdGlvbihldmVudCA9PiBldmVudHMucHVzaChldmVudCkpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXHRcdGNvbnN0IHNvY2tldCA9IFRlc3RXZWJTb2NrZXQuaW5zdGFuY2U7XG5cdFx0aWYgKCFzb2NrZXQ/Lm9ubWVzc2FnZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdWb2ljZSBXZWJTb2NrZXQgd2FzIG5vdCBjcmVhdGVkJyk7XG5cdFx0fVxuXHRcdHNvY2tldC5vbm1lc3NhZ2UobmV3IG1haW5XaW5kb3cuTWVzc2FnZUV2ZW50KCdtZXNzYWdlJywge1xuXHRcdFx0ZGF0YTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHR0eXBlOiAndHJhbnNjcmlwdGlvbicsXG5cdFx0XHRcdHRleHQ6ICdjcmVhdGUgYSBmaWxlJyxcblx0XHRcdFx0c3RhdHVzOiAncGFydGlhbCcsXG5cdFx0XHRcdGNvbW1pdHRlZDogJ2NyZWF0ZSAnLFxuXHRcdFx0XHR0dXJuX2lkOiAndHVybi0xJyxcblx0XHRcdFx0cmV2aXNpb246IDMsXG5cdFx0XHR9KSxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW3tcblx0XHRcdHRleHQ6ICdjcmVhdGUgYSBmaWxlJyxcblx0XHRcdHN0YXR1czogJ3BhcnRpYWwnLFxuXHRcdFx0Y29tbWl0dGVkOiAnY3JlYXRlICcsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0cmV2aXNpb246IDMsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIGludmFsaWQgdHJhbnNjcmlwdGlvbiBzdGF0dXMgYW5kIHJldmlzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UgPSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHQuLi5wcm9kdWN0LFxuXHRcdFx0dm9pY2VXc1VybDogJ3dzOi8vdm9pY2UudGVzdC9yZWFsdGltZS92b2ljZScsXG5cdFx0fTtcblx0XHRjb25zdCBzZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBWb2ljZUNsaWVudFNlcnZpY2UoXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdHByb2R1Y3RTZXJ2aWNlLFxuXHRcdCkpO1xuXHRcdGNvbnN0IGV2ZW50czogSVZvaWNlVHJhbnNjcmlwdGlvbltdID0gW107XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25UcmFuc2NyaXB0aW9uKGV2ZW50ID0+IGV2ZW50cy5wdXNoKGV2ZW50KSkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coKSk7XG5cdFx0Y29uc3Qgc29ja2V0ID0gVGVzdFdlYlNvY2tldC5pbnN0YW5jZTtcblx0XHRpZiAoIXNvY2tldD8ub25tZXNzYWdlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1ZvaWNlIFdlYlNvY2tldCB3YXMgbm90IGNyZWF0ZWQnKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBtZXNzYWdlIG9mIFtcblx0XHRcdHsgdHlwZTogJ3RyYW5zY3JpcHRpb24nLCB0ZXh0OiAnaW52YWxpZCBzdGF0dXMnLCBzdGF0dXM6ICdwZW5kaW5nJyB9LFxuXHRcdFx0eyB0eXBlOiAndHJhbnNjcmlwdGlvbicsIHRleHQ6ICd1bnNjb3BlZCByZXZpc2lvbicsIHN0YXR1czogJ3BhcnRpYWwnLCByZXZpc2lvbjogMSB9LFxuXHRcdFx0eyB0eXBlOiAndHJhbnNjcmlwdGlvbicsIHRleHQ6ICdpbnZhbGlkIHJldmlzaW9uJywgc3RhdHVzOiAncGFydGlhbCcsIHR1cm5faWQ6ICd0dXJuLTEnLCByZXZpc2lvbjogMS41IH0sXG5cdFx0XHR7IHR5cGU6ICd0cmFuc2NyaXB0aW9uJywgdGV4dDogJ25lZ2F0aXZlIHJldmlzaW9uJywgc3RhdHVzOiAncGFydGlhbCcsIHR1cm5faWQ6ICd0dXJuLTEnLCByZXZpc2lvbjogLTEgfSxcblx0XHRcdHsgdHlwZTogJ3RyYW5zY3JpcHRpb24nLCB0ZXh0OiAnbGVnYWN5IGZpbmFsJyB9LFxuXHRcdF0pIHtcblx0XHRcdHNvY2tldC5vbm1lc3NhZ2UobmV3IG1haW5XaW5kb3cuTWVzc2FnZUV2ZW50KCdtZXNzYWdlJywgeyBkYXRhOiBKU09OLnN0cmluZ2lmeShtZXNzYWdlKSB9KSk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFt7XG5cdFx0XHR0ZXh0OiAnbGVnYWN5IGZpbmFsJyxcblx0XHRcdHN0YXR1czogJ2ZpbmFsJyxcblx0XHRcdGNvbW1pdHRlZDogJycsXG5cdFx0XHR0dXJuSWQ6IHVuZGVmaW5lZCxcblx0XHRcdHJldmlzaW9uOiB1bmRlZmluZWQsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kcyBtaWNyb3Bob25lIGF1ZGlvIHVzaW5nIHRoZSBQVFQgcHJvdG9jb2wnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygpKTtcblx0XHRzZXJ2aWNlLnNlbmRQdHRTdGFydCgndHVybi0xJyk7XG5cdFx0c2VydmljZS5zZW5kUHR0QXVkaW9DaHVuaygnY0dOdCcpO1xuXHRcdHNlcnZpY2Uuc2VuZFB0dEVuZCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb2NrZXQoKS5zZW50LCBbXG5cdFx0XHR7IHR5cGU6ICdwdHRfc3RhcnQnLCB0dXJuX2lkOiAndHVybi0xJyB9LFxuXHRcdFx0eyB0eXBlOiAncHR0X2F1ZGlvX2NodW5rJywgYXVkaW86ICdjR050JyB9LFxuXHRcdFx0eyB0eXBlOiAncHR0X2VuZCcgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZHMgZmlyc3QtY2xhc3MgY2hlY2twb2ludCBuYXJyYXRpb24gbWV0YWRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coKSk7XG5cdFx0c2VydmljZS5zZW5kU3RhcnRTZXNzaW9uKHsgc2Vzc2lvbnM6IFtdLCBkaXNwbGF5X2xvY2FsZTogJycgfSwgJ21hY2hpbmUnKTtcblxuXHRcdGNvbnN0IG5hcnJhdGlvbklkID0gc2VydmljZS5yZXF1ZXN0TmFycmF0aW9uKCdjaGF0LXNlc3Npb246L29uZScsICdjaGVja3BvaW50JywgJ1VwZGF0aW5nIHRoZSBjb2RlLicsIHVuZGVmaW5lZCwge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxdWVzdC0xJyxcblx0XHRcdGNoZWNrcG9pbnRJZDogJ2VkaXRpbmcnLFxuXHRcdFx0c2VxdWVuY2U6IDIsXG5cdFx0fSk7XG5cdFx0c2VydmljZS5zZW5kTmFycmF0aW9uUGxheWJhY2tDb21wbGV0ZSgnY2hhdC1zZXNzaW9uOi9vbmUnLCBuYXJyYXRpb25JZCEsICdwbGF5YmFjay0xJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvY2tldCgpLnNlbnQuc2xpY2UoMSksIFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3JlcXVlc3RfbmFycmF0aW9uJyxcblx0XHRcdFx0Y29kaW5nX3Nlc3Npb25faWQ6ICdjaGF0LXNlc3Npb246L29uZScsXG5cdFx0XHRcdGtpbmQ6ICdjaGVja3BvaW50Jyxcblx0XHRcdFx0dGV4dDogJ1VwZGF0aW5nIHRoZSBjb2RlLicsXG5cdFx0XHRcdG5hcnJhdGlvbl9pZDogbmFycmF0aW9uSWQsXG5cdFx0XHRcdHJlcXVlc3RfaWQ6ICdyZXF1ZXN0LTEnLFxuXHRcdFx0XHRjaGVja3BvaW50X2lkOiAnZWRpdGluZycsXG5cdFx0XHRcdHNlcXVlbmNlOiAyLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ25hcnJhdGlvbl9wbGF5YmFja19jb21wbGV0ZScsXG5cdFx0XHRcdGNvZGluZ19zZXNzaW9uX2lkOiAnY2hhdC1zZXNzaW9uOi9vbmUnLFxuXHRcdFx0XHRuYXJyYXRpb25faWQ6IG5hcnJhdGlvbklkLFxuXHRcdFx0XHRwbGF5YmFja19pZDogJ3BsYXliYWNrLTEnLFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZHMgdHlwZWQgY29uZmlybWF0aW9uIG5hcnJhdGlvbiBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygpKTtcblx0XHRzZXJ2aWNlLnNlbmRTdGFydFNlc3Npb24oeyBzZXNzaW9uczogW10sIGRpc3BsYXlfbG9jYWxlOiAnJyB9LCAnbWFjaGluZScpO1xuXG5cdFx0Y29uc3QgbmFycmF0aW9uSWQgPSBzZXJ2aWNlLnJlcXVlc3ROYXJyYXRpb24oXG5cdFx0XHQnY2hhdC1zZXNzaW9uOi9vbmUnLFxuXHRcdFx0J2NvbmZpcm1hdGlvbicsXG5cdFx0XHQncXVlc3Rpb25uYWlyZTogMSBxdWVzdGlvbicsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQncXVlc3Rpb25uYWlyZScsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ja2V0KCkuc2VudFsxXSwge1xuXHRcdFx0dHlwZTogJ3JlcXVlc3RfbmFycmF0aW9uJyxcblx0XHRcdGNvZGluZ19zZXNzaW9uX2lkOiAnY2hhdC1zZXNzaW9uOi9vbmUnLFxuXHRcdFx0a2luZDogJ2NvbmZpcm1hdGlvbicsXG5cdFx0XHR0ZXh0OiAncXVlc3Rpb25uYWlyZTogMSBxdWVzdGlvbicsXG5cdFx0XHRuYXJyYXRpb25faWQ6IG5hcnJhdGlvbklkLFxuXHRcdFx0Y29uZmlybWF0aW9uX3R5cGU6ICdxdWVzdGlvbm5haXJlJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncGVyc2lzdHMgYW5kIGNsZWFycyB0eXBlZCBjb25maXJtYXRpb24gc2Vzc2lvbiBzdGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygpKTtcblx0XHRzb2NrZXQoKS5vbm9wZW4/LigpO1xuXHRcdHNlcnZpY2Uuc2VuZFN0YXJ0U2Vzc2lvbih7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICcnIH0sICdtYWNoaW5lJyk7XG5cblx0XHRzZXJ2aWNlLnNlbmRTZXNzaW9uQ29udGV4dCh7XG5cdFx0XHRzZXNzaW9uczogW3tcblx0XHRcdFx0aWQ6ICdjaGF0LXNlc3Npb246L29uZScsXG5cdFx0XHRcdGlzX2FjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0YWdlbnRfc3RhdGU6ICd3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24nLFxuXHRcdFx0XHRhZ2VudF9zdGF0ZV9kZXRhaWw6ICdxdWVzdGlvbm5haXJlOiAxIHF1ZXN0aW9uJyxcblx0XHRcdFx0Y29uZmlybWF0aW9uX3R5cGU6ICdxdWVzdGlvbm5haXJlJyxcblx0XHRcdH1dLFxuXHRcdFx0ZGlzcGxheV9sb2NhbGU6ICdlbi1VUycsXG5cdFx0fSk7XG5cdFx0c2VydmljZS5mbHVzaFNlc3Npb25Db250ZXh0KCk7XG5cdFx0c2VydmljZS5zZW5kU2Vzc2lvbkNvbnRleHQoe1xuXHRcdFx0c2Vzc2lvbnM6IFt7XG5cdFx0XHRcdGlkOiAnY2hhdC1zZXNzaW9uOi9vbmUnLFxuXHRcdFx0XHRpc19hY3RpdmU6IHRydWUsXG5cdFx0XHRcdGFnZW50X3N0YXRlOiAnaWRsZScsXG5cdFx0XHR9XSxcblx0XHRcdGRpc3BsYXlfbG9jYWxlOiAnZW4tVVMnLFxuXHRcdH0pO1xuXHRcdHNlcnZpY2UuZmx1c2hTZXNzaW9uQ29udGV4dCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb2NrZXQoKS5zZW50LnNsaWNlKDEpLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdzZXNzaW9uX2NvbnRleHQnLFxuXHRcdFx0XHRtb2RlOiAnZGVsdGEnLFxuXHRcdFx0XHR1cHNlcnRzOiBbe1xuXHRcdFx0XHRcdGlkOiAnY2hhdC1zZXNzaW9uOi9vbmUnLFxuXHRcdFx0XHRcdGlzX2FjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0XHRhZ2VudF9zdGF0ZTogJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdFx0YWdlbnRfc3RhdGVfZGV0YWlsOiAncXVlc3Rpb25uYWlyZTogMSBxdWVzdGlvbicsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uX3R5cGU6ICdxdWVzdGlvbm5haXJlJyxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdHJlbW92ZXM6IFtdLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3Nlc3Npb25fY29udGV4dCcsXG5cdFx0XHRcdG1vZGU6ICdkZWx0YScsXG5cdFx0XHRcdHVwc2VydHM6IFt7XG5cdFx0XHRcdFx0aWQ6ICdjaGF0LXNlc3Npb246L29uZScsXG5cdFx0XHRcdFx0YWdlbnRfc3RhdGU6ICdpZGxlJyxcblx0XHRcdFx0XHRhZ2VudF9zdGF0ZV9kZXRhaWw6IG51bGwsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uX3R5cGU6IG51bGwsXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRyZW1vdmVzOiBbXSxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ludmFsaWRhdGVkIGNvbnRleHQgcHJlc2VydmVzIHBlbmRpbmcgZGVsZXRpb24gdG9tYnN0b25lcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygpKTtcblx0XHRzb2NrZXQoKS5vbm9wZW4/LigpO1xuXHRcdHNlcnZpY2Uuc2VuZFN0YXJ0U2Vzc2lvbih7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICcnIH0sICdtYWNoaW5lJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ2NoYXQtc2Vzc2lvbjovb25lJztcblxuXHRcdHNlcnZpY2Uuc2VuZFNlc3Npb25Db250ZXh0KHtcblx0XHRcdHNlc3Npb25zOiBbe1xuXHRcdFx0XHRpZDogc2Vzc2lvbklkLFxuXHRcdFx0XHRpc19hY3RpdmU6IHRydWUsXG5cdFx0XHRcdGFnZW50X3N0YXRlOiAnd2FpdGluZ19mb3JfY29uZmlybWF0aW9uJyxcblx0XHRcdFx0YWdlbnRfc3RhdGVfZGV0YWlsOiAnV2hpY2ggcmVnaW9uPycsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbl90eXBlOiAncXVlc3Rpb25uYWlyZScsXG5cdFx0XHRcdHBlbmRpbmc6IHtcblx0XHRcdFx0XHR0eXBlOiAncXVlc3Rpb25zJyxcblx0XHRcdFx0XHRwZW5kaW5nX2lkOiAncmVxdWVzdC0xI3AxJyxcblx0XHRcdFx0XHRyZXF1ZXN0X2lkOiAncmVxdWVzdC0xJyxcblx0XHRcdFx0XHRxdWVzdGlvbnM6IFtdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0sXG5cdFx0XHRkaXNwbGF5X2xvY2FsZTogJ2VuLVVTJyxcblx0XHR9KTtcblx0XHRzZXJ2aWNlLmZsdXNoU2Vzc2lvbkNvbnRleHQoKTtcblx0XHRzZXJ2aWNlLmludmFsaWRhdGVTZXNzaW9uQ2FjaGUoc2Vzc2lvbklkKTtcblx0XHRzZXJ2aWNlLnNlbmRTZXNzaW9uQ29udGV4dCh7XG5cdFx0XHRzZXNzaW9uczogW3tcblx0XHRcdFx0aWQ6IHNlc3Npb25JZCxcblx0XHRcdFx0aXNfYWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRhZ2VudF9zdGF0ZTogJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdGFnZW50X3N0YXRlX2RldGFpbDogJ1doaWNoIHJlZ2lvbj8nLFxuXHRcdFx0XHRjb25maXJtYXRpb25fdHlwZTogJ3F1ZXN0aW9ubmFpcmUnLFxuXHRcdFx0fV0sXG5cdFx0XHRkaXNwbGF5X2xvY2FsZTogJ2VuLVVTJyxcblx0XHR9KTtcblx0XHRzZXJ2aWNlLmZsdXNoU2Vzc2lvbkNvbnRleHQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ja2V0KCkuc2VudC5hdCgtMSksIHtcblx0XHRcdHR5cGU6ICdzZXNzaW9uX2NvbnRleHQnLFxuXHRcdFx0bW9kZTogJ2RlbHRhJyxcblx0XHRcdHVwc2VydHM6IFt7XG5cdFx0XHRcdGlkOiBzZXNzaW9uSWQsXG5cdFx0XHRcdGlzX2FjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0YWdlbnRfc3RhdGU6ICd3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24nLFxuXHRcdFx0XHRhZ2VudF9zdGF0ZV9kZXRhaWw6ICdXaGljaCByZWdpb24/Jyxcblx0XHRcdFx0Y29uZmlybWF0aW9uX3R5cGU6ICdxdWVzdGlvbm5haXJlJyxcblx0XHRcdFx0cGVuZGluZzogbnVsbCxcblx0XHRcdH1dLFxuXHRcdFx0cmVtb3ZlczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vcm1hbGl6ZXMgbGVnYWN5IHN1cHByZXNzZWQgbmFycmF0aW9uIGFja25vd2xlZGdlbWVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZXZlbnRzOiBJVm9pY2VOYXJyYXRpb25BY2tbXSA9IFtdO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLm9uTmFycmF0aW9uQWNrKGV2ZW50ID0+IGV2ZW50cy5wdXNoKGV2ZW50KSkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXG5cdFx0c29ja2V0KCkub25tZXNzYWdlPy4obmV3IG1haW5XaW5kb3cuTWVzc2FnZUV2ZW50KCdtZXNzYWdlJywge1xuXHRcdFx0ZGF0YTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHR0eXBlOiAnbmFycmF0aW9uX2FjaycsXG5cdFx0XHRcdG5hcnJhdGlvbl9pZDogJ25hcnJhdGlvbi0xJyxcblx0XHRcdFx0Y29kaW5nX3Nlc3Npb25faWQ6ICdjaGF0LXNlc3Npb246L29uZScsXG5cdFx0XHRcdGRpc3Bvc2l0aW9uOiAnc3VwcHJlc3NlZCcsXG5cdFx0XHRcdHJlYXNvbjogJ3N0YWxlJyxcblx0XHRcdH0pLFxuXHRcdH0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW3tcblx0XHRcdG5hcnJhdGlvbklkOiAnbmFycmF0aW9uLTEnLFxuXHRcdFx0Y29kaW5nU2Vzc2lvbklkOiAnY2hhdC1zZXNzaW9uOi9vbmUnLFxuXHRcdFx0ZGlzcG9zaXRpb246ICdzdXBwcmVzc2VkJyxcblx0XHRcdHJlYXNvbjogJ3N0YWxlJyxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZsYWdzIGEgcGFzc2l2ZSBwdHRfc3RhcnQgZm9yIGhhbmRzLWZyZWUgYmFyZ2UtaW4gbGlzdGVucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXHRcdHNlcnZpY2Uuc2VuZFB0dFN0YXJ0KCd0dXJuLXBhc3NpdmUnLCB0cnVlKTtcblx0XHRzZXJ2aWNlLnNlbmRQdHRTdGFydCgndHVybi1yZWFsJywgZmFsc2UpO1xuXHRcdHNlcnZpY2Uuc2VuZFB0dFN0YXJ0KCd0dXJuLWRlZmF1bHQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ja2V0KCkuc2VudCwgW1xuXHRcdFx0eyB0eXBlOiAncHR0X3N0YXJ0JywgdHVybl9pZDogJ3R1cm4tcGFzc2l2ZScsIHBhc3NpdmU6IHRydWUgfSxcblx0XHRcdHsgdHlwZTogJ3B0dF9zdGFydCcsIHR1cm5faWQ6ICd0dXJuLXJlYWwnIH0sXG5cdFx0XHR7IHR5cGU6ICdwdHRfc3RhcnQnLCB0dXJuX2lkOiAndHVybi1kZWZhdWx0JyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJpYWxpemVzIHRoZSBwZW5kaW5nIGlkIG9uIGEgcXVlc3Rpb24gbmFycmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coKSk7XG5cdFx0c2VydmljZS5zZW5kU3RhcnRTZXNzaW9uKHsgc2Vzc2lvbnM6IFtdLCBkaXNwbGF5X2xvY2FsZTogJycgfSwgJ21hY2hpbmUnKTtcblx0XHRjb25zdCBxdWVzdGlvbklkID0gc2VydmljZS5yZXF1ZXN0TmFycmF0aW9uKCdjczEnLCAncXVlc3Rpb24nLCAnV2hpY2ggcmVnaW9uPycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHsgcGVuZGluZ0lkOiAncDEnIH0pO1xuXHRcdGNvbnN0IHJlcGx5SWQgPSBzZXJ2aWNlLnJlcXVlc3ROYXJyYXRpb24oJ2NzMScsICdyZXNwb25zZScsICdEb25lLicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb2NrZXQoKS5zZW50LmZpbHRlcihtZXNzYWdlID0+IG1lc3NhZ2UudHlwZSA9PT0gJ3JlcXVlc3RfbmFycmF0aW9uJyksIFtcblx0XHRcdHsgdHlwZTogJ3JlcXVlc3RfbmFycmF0aW9uJywgY29kaW5nX3Nlc3Npb25faWQ6ICdjczEnLCBraW5kOiAncXVlc3Rpb24nLCB0ZXh0OiAnV2hpY2ggcmVnaW9uPycsIG5hcnJhdGlvbl9pZDogcXVlc3Rpb25JZCwgcGVuZGluZ19pZDogJ3AxJyB9LFxuXHRcdFx0eyB0eXBlOiAncmVxdWVzdF9uYXJyYXRpb24nLCBjb2Rpbmdfc2Vzc2lvbl9pZDogJ2NzMScsIGtpbmQ6ICdyZXNwb25zZScsIHRleHQ6ICdEb25lLicsIG5hcnJhdGlvbl9pZDogcmVwbHlJZCB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkcm9wcyBhIG5hcnJhdGlvbiByZXF1ZXN0ZWQgYmVmb3JlIHRoZSBzZXNzaW9uIHN0YXJ0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXHRcdGNvbnN0IG5hcnJhdGlvbklkID0gc2VydmljZS5yZXF1ZXN0TmFycmF0aW9uKCdjczEnLCAncXVlc3Rpb24nLCAnV2hpY2ggcmVnaW9uPycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHsgcGVuZGluZ0lkOiAncDEnIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hcnJhdGlvbklkLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ja2V0KCkuc2VudC5maWx0ZXIobWVzc2FnZSA9PiBtZXNzYWdlLnR5cGUgPT09ICdyZXF1ZXN0X25hcnJhdGlvbicpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcmlhbGl6ZXMgY29uZmlndXJlZCBsYW5ndWFnZSBpbiBzdGFydF9zZXNzaW9uIGNvbnRleHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdCdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnOiAnZnItZnInLFxuXHRcdFx0J2FnZW50cy52b2ljZS52b2ljZSc6ICdrZXZpbl9uZXV0cmFsJyxcblx0XHR9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCdkZS1ERScpKTtcblx0XHRzZXJ2aWNlLnNlbmRTdGFydFNlc3Npb24oeyBzZXNzaW9uczogW10sIGRpc3BsYXlfbG9jYWxlOiAnJyB9LCAnbWFjaGluZScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb2NrZXQoKS5zZW50Lm1hcChtZXNzYWdlID0+ICh7XG5cdFx0XHR0eXBlOiBtZXNzYWdlLnR5cGUsXG5cdFx0XHRzZXNzaW9uX2NvbnRleHQ6IG1lc3NhZ2Uuc2Vzc2lvbl9jb250ZXh0LFxuXHRcdFx0dm9pY2U6IG1lc3NhZ2Uudm9pY2UsXG5cdFx0XHRhdXRvX25hcnJhdGU6IG1lc3NhZ2UuYXV0b19uYXJyYXRlLFxuXHRcdH0pKSwgW3tcblx0XHRcdHR5cGU6ICdzdGFydF9zZXNzaW9uJyxcblx0XHRcdHNlc3Npb25fY29udGV4dDogeyBzZXNzaW9uczogW10sIGRpc3BsYXlfbG9jYWxlOiAnZnItRlInIH0sXG5cdFx0XHR2b2ljZTogJ2tldmluX25ldXRyYWwnLFxuXHRcdFx0YXV0b19uYXJyYXRlOiBmYWxzZSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbmRzIHZvaWNlIGluc3RydWN0aW9ucyB3aGVuIHN0YXJ0aW5nIGEgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXHRcdHNlcnZpY2Uuc2VuZFN0YXJ0U2Vzc2lvbih7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICcnIH0sICdtYWNoaW5lJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsICdQcm9ub3VuY2UgXCJDb250b3NvIERCXCIgYXMgd3JpdHRlbi4nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ja2V0KCkuc2VudC5tYXAobWVzc2FnZSA9PiAoe1xuXHRcdFx0dHlwZTogbWVzc2FnZS50eXBlLFxuXHRcdFx0dm9pY2VfaW5zdHJ1Y3Rpb25zOiBtZXNzYWdlLnZvaWNlX2luc3RydWN0aW9ucyxcblx0XHR9KSksIFt7XG5cdFx0XHR0eXBlOiAnc3RhcnRfc2Vzc2lvbicsXG5cdFx0XHR2b2ljZV9pbnN0cnVjdGlvbnM6ICdQcm9ub3VuY2UgXCJDb250b3NvIERCXCIgYXMgd3JpdHRlbi4nLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBicm93c2VyIGxvY2FsZSBmb3IgYXV0byBhbmQgZmFsbHMgYmFjayB3aGVuIHVuYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpcnN0ID0gY3JlYXRlU2VydmljZSh7ICdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnOiAnYXV0bycgfSk7XG5cdFx0YXdhaXQgZmlyc3Quc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coJ3B0LUJSJykpO1xuXHRcdGZpcnN0LnNlcnZpY2Uuc2VuZFN0YXJ0U2Vzc2lvbih7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICcnIH0sICdtYWNoaW5lJyk7XG5cdFx0Y29uc3QgYnJvd3NlckxvY2FsZSA9IHNvY2tldCgpLnNlbnRbMF0uc2Vzc2lvbl9jb250ZXh0O1xuXG5cdFx0Y29uc3Qgc2Vjb25kID0gY3JlYXRlU2VydmljZSh7ICdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnOiAnYXV0bycgfSk7XG5cdFx0YXdhaXQgc2Vjb25kLnNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCcnKSk7XG5cdFx0c2Vjb25kLnNlcnZpY2Uuc2VuZFN0YXJ0U2Vzc2lvbih7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICcnIH0sICdtYWNoaW5lJyk7XG5cdFx0Y29uc3QgZmFsbGJhY2tMb2NhbGUgPSBzb2NrZXQoKS5zZW50WzBdLnNlc3Npb25fY29udGV4dDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBicm93c2VyTG9jYWxlLCBmYWxsYmFja0xvY2FsZSB9LCB7XG5cdFx0XHRicm93c2VyTG9jYWxlOiB7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICdwdC1CUicgfSxcblx0XHRcdGZhbGxiYWNrTG9jYWxlOiB7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICdlbi1VUycgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayBmb3IgYW4gdW5zdXBwb3J0ZWQgY29uZmlndXJlZCBCQ1AtNDcgbG9jYWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSh7ICdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnOiAndWstVUEnIH0pO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coJ2ZyLUZSJykpO1xuXHRcdHNlcnZpY2Uuc2VuZFN0YXJ0U2Vzc2lvbih7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICcnIH0sICdtYWNoaW5lJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvY2tldCgpLnNlbnRbMF0uc2Vzc2lvbl9jb250ZXh0LCB7XG5cdFx0XHRzZXNzaW9uczogW10sXG5cdFx0XHRkaXNwbGF5X2xvY2FsZTogJ2VuLVVTJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayBmb3IgYSBjb25maWd1cmVkIEFTUi1vbmx5IGxhbmd1YWdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSh7ICdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnOiAnYXInIH0pO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coJ2FyLVNBJykpO1xuXHRcdHNlcnZpY2Uuc2VuZFN0YXJ0U2Vzc2lvbih7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICcnIH0sICdtYWNoaW5lJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvY2tldCgpLnNlbnRbMF0uc2Vzc2lvbl9jb250ZXh0LCB7XG5cdFx0XHRzZXNzaW9uczogW10sXG5cdFx0XHRkaXNwbGF5X2xvY2FsZTogJ2VuLVVTJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIGFuIGF1dG9tYXRpYyBBU1Itb25seSBicm93c2VyIGxvY2FsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoeyAnYWdlbnRzLnZvaWNlLmxhbmd1YWdlJzogJ2F1dG8nIH0pO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coJ2FyLVNBJykpO1xuXHRcdHNlcnZpY2Uuc2VuZFN0YXJ0U2Vzc2lvbih7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICcnIH0sICdtYWNoaW5lJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvY2tldCgpLnNlbnRbMF0uc2Vzc2lvbl9jb250ZXh0LCB7XG5cdFx0XHRzZXNzaW9uczogW10sXG5cdFx0XHRkaXNwbGF5X2xvY2FsZTogJ2FyLVNBJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayBmb3IgYW4gdW5zdXBwb3J0ZWQgYXV0b21hdGljIGJyb3dzZXIgbG9jYWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSh7ICdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnOiAnYXV0bycgfSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygnaGUtSUwnKSk7XG5cdFx0c2VydmljZS5zZW5kU3RhcnRTZXNzaW9uKHsgc2Vzc2lvbnM6IFtdLCBkaXNwbGF5X2xvY2FsZTogJycgfSwgJ21hY2hpbmUnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ja2V0KCkuc2VudFswXS5zZXNzaW9uX2NvbnRleHQsIHtcblx0XHRcdHNlc3Npb25zOiBbXSxcblx0XHRcdGRpc3BsYXlfbG9jYWxlOiAnZW4tVVMnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kcyBvbmUgbGl2ZSBsYW5ndWFnZSB1cGRhdGUgd2l0aG91dCBjaGFuZ2luZyB2b2ljZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdCdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnOiAnYXV0bycsXG5cdFx0XHQnYWdlbnRzLnZvaWNlLnZvaWNlJzogJ3ZpY3RvcmlhX25ldXRyYWwnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCdlbi1HQicpKTtcblx0XHRzZXJ2aWNlLnNlbmRTdGFydFNlc3Npb24oeyBzZXNzaW9uczogW10sIGRpc3BsYXlfbG9jYWxlOiAnZW4tR0InIH0sICdtYWNoaW5lJyk7XG5cblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignYWdlbnRzLnZvaWNlLmxhbmd1YWdlJywgJ2ZyLUZSJyk7XG5cdFx0ZmlyZUNvbmZpZ3VyYXRpb25DaGFuZ2UoY29uZmlndXJhdGlvblNlcnZpY2UsICdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ja2V0KCkuc2VudC5tYXAobWVzc2FnZSA9PiBtZXNzYWdlLnR5cGUgPT09ICdzdGFydF9zZXNzaW9uJyA/IHtcblx0XHRcdHR5cGU6IG1lc3NhZ2UudHlwZSxcblx0XHRcdHNlc3Npb25fY29udGV4dDogbWVzc2FnZS5zZXNzaW9uX2NvbnRleHQsXG5cdFx0XHR2b2ljZTogbWVzc2FnZS52b2ljZSxcblx0XHR9IDogbWVzc2FnZSksIFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3N0YXJ0X3Nlc3Npb24nLFxuXHRcdFx0XHRzZXNzaW9uX2NvbnRleHQ6IHsgc2Vzc2lvbnM6IFtdLCBkaXNwbGF5X2xvY2FsZTogJ2VuLUdCJyB9LFxuXHRcdFx0XHR2b2ljZTogJ3ZpY3RvcmlhX25ldXRyYWwnLFxuXHRcdFx0fSxcblx0XHRcdHsgdHlwZTogJ3NldF9sYW5ndWFnZScsIGxhbmd1YWdlOiAnZnItRlInIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlZmVycyBhIGxhbmd1YWdlIHVwZGF0ZSB1bnRpbCB0aGUgc2Vzc2lvbiBzdGFydHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSB9ID0gY3JlYXRlU2VydmljZSh7ICdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnOiAnYXV0bycgfSk7XG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coJ2VuLVVTJykpO1xuXG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2FnZW50cy52b2ljZS5sYW5ndWFnZScsICdmcicpO1xuXHRcdGZpcmVDb25maWd1cmF0aW9uQ2hhbmdlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCAnYWdlbnRzLnZvaWNlLmxhbmd1YWdlJyk7XG5cdFx0c2VydmljZS5zZW5kU3RhcnRTZXNzaW9uKHsgc2Vzc2lvbnM6IFtdLCBkaXNwbGF5X2xvY2FsZTogJ2VuLVVTJyB9LCAnbWFjaGluZScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb2NrZXQoKS5zZW50Lm1hcChtZXNzYWdlID0+ICh7XG5cdFx0XHR0eXBlOiBtZXNzYWdlLnR5cGUsXG5cdFx0XHRzZXNzaW9uX2NvbnRleHQ6IG1lc3NhZ2Uuc2Vzc2lvbl9jb250ZXh0LFxuXHRcdH0pKSwgW3tcblx0XHRcdHR5cGU6ICdzdGFydF9zZXNzaW9uJyxcblx0XHRcdHNlc3Npb25fY29udGV4dDogeyBzZXNzaW9uczogW10sIGRpc3BsYXlfbG9jYWxlOiAnZnInIH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCB1cGRhdGUgd2hpbGUgZGlzY29ubmVjdGVkIGFuZCByZXRhaW5zIGxhbmd1YWdlIG9uIHJlc3VtZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdCdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnOiAnYXV0bycsXG5cdFx0XHQnYWdlbnRzLnZvaWNlLnZvaWNlJzogJ2RhbmllbF9uZXV0cmFsJyxcblx0XHR9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygnZW4tVVMnKSk7XG5cdFx0Y29uc3QgZmlyc3RTb2NrZXQgPSBzb2NrZXQoKTtcblx0XHRmaXJzdFNvY2tldC5vbm1lc3NhZ2U/LihuZXcgbWFpbldpbmRvdy5NZXNzYWdlRXZlbnQoJ21lc3NhZ2UnLCB7XG5cdFx0XHRkYXRhOiBKU09OLnN0cmluZ2lmeSh7IHR5cGU6ICdzZXNzaW9uX2luaXQnLCBzZXNzaW9uX2lkOiAnc2Vzc2lvbi0xJyB9KSxcblx0XHR9KSk7XG5cdFx0Zmlyc3RTb2NrZXQucmVhZHlTdGF0ZSA9IFdlYlNvY2tldC5DTE9TRUQ7XG5cblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignYWdlbnRzLnZvaWNlLmxhbmd1YWdlJywgJ2RlLURFJyk7XG5cdFx0ZmlyZUNvbmZpZ3VyYXRpb25DaGFuZ2UoY29uZmlndXJhdGlvblNlcnZpY2UsICdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygnZW4tVVMnKSk7XG5cdFx0c2VydmljZS5zZW5kUmVzdW1lU2Vzc2lvbih7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICdlbi1VUycgfSwgJ21hY2hpbmUnLCAnS2VlcCByZXBsaWVzIGNvbmNpc2UuJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRpc2Nvbm5lY3RlZE1lc3NhZ2VzOiBmaXJzdFNvY2tldC5zZW50LFxuXHRcdFx0cmVzdW1lTWVzc2FnZXM6IHNvY2tldCgpLnNlbnQubWFwKG1lc3NhZ2UgPT4gKHtcblx0XHRcdFx0dHlwZTogbWVzc2FnZS50eXBlLFxuXHRcdFx0XHRzZXNzaW9uX2lkOiBtZXNzYWdlLnNlc3Npb25faWQsXG5cdFx0XHRcdHNlc3Npb25fY29udGV4dDogbWVzc2FnZS5zZXNzaW9uX2NvbnRleHQsXG5cdFx0XHRcdHZvaWNlOiBtZXNzYWdlLnZvaWNlLFxuXHRcdFx0XHR2b2ljZV9pbnN0cnVjdGlvbnM6IG1lc3NhZ2Uudm9pY2VfaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRhdXRvX25hcnJhdGU6IG1lc3NhZ2UuYXV0b19uYXJyYXRlLFxuXHRcdFx0fSkpLFxuXHRcdH0sIHtcblx0XHRcdGRpc2Nvbm5lY3RlZE1lc3NhZ2VzOiBbXSxcblx0XHRcdHJlc3VtZU1lc3NhZ2VzOiBbe1xuXHRcdFx0XHR0eXBlOiAncmVzdW1lX3Nlc3Npb24nLFxuXHRcdFx0XHRzZXNzaW9uX2lkOiAnc2Vzc2lvbi0xJyxcblx0XHRcdFx0c2Vzc2lvbl9jb250ZXh0OiB7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICdkZS1ERScgfSxcblx0XHRcdFx0dm9pY2U6ICdkYW5pZWxfbmV1dHJhbCcsXG5cdFx0XHRcdHZvaWNlX2luc3RydWN0aW9uczogJ0tlZXAgcmVwbGllcyBjb25jaXNlLicsXG5cdFx0XHRcdGF1dG9fbmFycmF0ZTogZmFsc2UsXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWRvcHRzIHRoZSBzZXJ2ZXIgc2Vzc2lvbiBpZCBhbmQgY2xlYXJzIGlzUmVzdW1pbmcgb24gc2Vzc2lvbl9pbml0LCBldmVuIGFmdGVyIGEgZmFpbGVkIHJlc3VtZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygpKTtcblx0XHRzb2NrZXQoKS5vbm1lc3NhZ2U/LihuZXcgbWFpbldpbmRvdy5NZXNzYWdlRXZlbnQoJ21lc3NhZ2UnLCB7XG5cdFx0XHRkYXRhOiBKU09OLnN0cmluZ2lmeSh7IHR5cGU6ICdzZXNzaW9uX2luaXQnLCBzZXNzaW9uX2lkOiAnc2Vzc2lvbi0xJyB9KSxcblx0XHR9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY3VycmVudFNlc3Npb25JZCwgJ3Nlc3Npb24tMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmlzUmVzdW1pbmcsIGZhbHNlKTtcblxuXHRcdC8vIFNpbXVsYXRlIGEgcmVjb25uZWN0IGF0dGVtcHQ6IHRoZSBzb2NrZXQgb3BlbnMgKG1hcmtpbmcgdXMgYXNcblx0XHQvLyByZXN1bWluZyB0aGUgcHJpb3Igc2Vzc2lvbiBpZCkgYnV0IHRoZSBzZXJ2ZXIgY2FuJ3QgcmVzdW1lIGFuZFxuXHRcdC8vIHN0YXJ0cyBhIGJyYW5kIG5ldyBzZXNzaW9uIGluc3RlYWQuXG5cdFx0c29ja2V0KCkub25vcGVuPy4oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc1Jlc3VtaW5nLCB0cnVlKTtcblxuXHRcdHNvY2tldCgpLm9ubWVzc2FnZT8uKG5ldyBtYWluV2luZG93Lk1lc3NhZ2VFdmVudCgnbWVzc2FnZScsIHtcblx0XHRcdGRhdGE6IEpTT04uc3RyaW5naWZ5KHsgdHlwZTogJ3Nlc3Npb25faW5pdCcsIHNlc3Npb25faWQ6ICdzZXNzaW9uLTInIH0pLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmN1cnJlbnRTZXNzaW9uSWQsICdzZXNzaW9uLTInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc1Jlc3VtaW5nLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Fkb3B0cyB0aGUgc2VydmVyIHNlc3Npb24gaWQgYW5kIGNsZWFycyBpc1Jlc3VtaW5nIG9uIHNlc3Npb25fcmVzdW1lZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygpKTtcblx0XHRzb2NrZXQoKS5vbm1lc3NhZ2U/LihuZXcgbWFpbldpbmRvdy5NZXNzYWdlRXZlbnQoJ21lc3NhZ2UnLCB7XG5cdFx0XHRkYXRhOiBKU09OLnN0cmluZ2lmeSh7IHR5cGU6ICdzZXNzaW9uX2luaXQnLCBzZXNzaW9uX2lkOiAnc2Vzc2lvbi0xJyB9KSxcblx0XHR9KSk7XG5cdFx0c29ja2V0KCkub25vcGVuPy4oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc1Jlc3VtaW5nLCB0cnVlKTtcblxuXHRcdHNvY2tldCgpLm9ubWVzc2FnZT8uKG5ldyBtYWluV2luZG93Lk1lc3NhZ2VFdmVudCgnbWVzc2FnZScsIHtcblx0XHRcdGRhdGE6IEpTT04uc3RyaW5naWZ5KHsgdHlwZTogJ3Nlc3Npb25fcmVzdW1lZCcsIHNlc3Npb25faWQ6ICdzZXNzaW9uLTEnIH0pLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmN1cnJlbnRTZXNzaW9uSWQsICdzZXNzaW9uLTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc1Jlc3VtaW5nLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc2V0cyBpc1Jlc3VtaW5nIG9uIGNsZWFudXAgKHRlcm1pbmFsIGRpc2Nvbm5lY3QpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXHRcdHNvY2tldCgpLm9ubWVzc2FnZT8uKG5ldyBtYWluV2luZG93Lk1lc3NhZ2VFdmVudCgnbWVzc2FnZScsIHtcblx0XHRcdGRhdGE6IEpTT04uc3RyaW5naWZ5KHsgdHlwZTogJ3Nlc3Npb25faW5pdCcsIHNlc3Npb25faWQ6ICdzZXNzaW9uLTEnIH0pLFxuXHRcdH0pKTtcblx0XHRzb2NrZXQoKS5vbm9wZW4/LigpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmlzUmVzdW1pbmcsIHRydWUpO1xuXG5cdFx0c29ja2V0KCkub25jbG9zZT8uKG5ldyBtYWluV2luZG93LkNsb3NlRXZlbnQoJ2Nsb3NlJywgeyBjb2RlOiAxMDAwLCB3YXNDbGVhbjogdHJ1ZSB9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc1Jlc3VtaW5nLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY3VycmVudFNlc3Npb25JZCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyB3aGVuIGFuIGFibm9ybWFsIGNsb3NlIGhhcyBzY2hlZHVsZWQgYSByZWNvbm5lY3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coKSk7XG5cdFx0c29ja2V0KCkub25vcGVuPy4oKTtcblxuXHRcdHNvY2tldCgpLm9uY2xvc2U/LihuZXcgbWFpbldpbmRvdy5DbG9zZUV2ZW50KCdjbG9zZScsIHsgY29kZTogNDAwMCB9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS53aWxsUmVjb25uZWN0LCB0cnVlKTtcblx0XHRzZXJ2aWNlLmRpc2Nvbm5lY3QoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS53aWxsUmVjb25uZWN0LCBmYWxzZSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFP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QVEsUUFBUSxpQkFBaUIsQ0FBQztBQUN4QyxXQUFPLEVBQUUsWUFBWSxJQUFJLFdBQVcsYUFBYSxXQUFXO0FBQUEsTUFDM0QsTUFBTSxLQUFLLFVBQVUsRUFBRSxNQUFNLGdCQUFnQixZQUFZLFlBQVksQ0FBQztBQUFBLElBQ3ZFLENBQUMsQ0FBQztBQUNGLFdBQU8sRUFBRSxTQUFTO0FBQ2xCLFdBQU8sWUFBWSxRQUFRLFlBQVksSUFBSTtBQUUzQyxXQUFPLEVBQUUsWUFBWSxJQUFJLFdBQVcsYUFBYSxXQUFXO0FBQUEsTUFDM0QsTUFBTSxLQUFLLFVBQVUsRUFBRSxNQUFNLG1CQUFtQixZQUFZLFlBQVksQ0FBQztBQUFBLElBQzFFLENBQUMsQ0FBQztBQUVGLFdBQU8sWUFBWSxRQUFRLGtCQUFrQixXQUFXO0FBQ3hELFdBQU8sWUFBWSxRQUFRLFlBQVksS0FBSztBQUFBLEVBQzdDLENBQUM7QUFFRCxPQUFLLHNEQUFzRCxZQUFZO0FBQ3RFLFVBQU0sRUFBRSxRQUFRLElBQUksY0FBYztBQUNsQyxVQUFNLFFBQVEsUUFBUSxpQkFBaUIsQ0FBQztBQUN4QyxXQUFPLEVBQUUsWUFBWSxJQUFJLFdBQVcsYUFBYSxXQUFXO0FBQUEsTUFDM0QsTUFBTSxLQUFLLFVBQVUsRUFBRSxNQUFNLGdCQUFnQixZQUFZLFlBQVksQ0FBQztBQUFBLElBQ3ZFLENBQUMsQ0FBQztBQUNGLFdBQU8sRUFBRSxTQUFTO0FBQ2xCLFdBQU8sWUFBWSxRQUFRLFlBQVksSUFBSTtBQUUzQyxXQUFPLEVBQUUsVUFBVSxJQUFJLFdBQVcsV0FBVyxTQUFTLEVBQUUsTUFBTSxLQUFNLFVBQVUsS0FBSyxDQUFDLENBQUM7QUFFckYsV0FBTyxZQUFZLFFBQVEsWUFBWSxLQUFLO0FBQzVDLFdBQU8sWUFBWSxRQUFRLGtCQUFrQixNQUFTO0FBQUEsRUFDdkQsQ0FBQztBQUVELE9BQUssNERBQTRELFlBQVk7QUFDNUUsVUFBTSxFQUFFLFFBQVEsSUFBSSxjQUFjO0FBQ2xDLFVBQU0sUUFBUSxRQUFRLGlCQUFpQixDQUFDO0FBQ3hDLFdBQU8sRUFBRSxTQUFTO0FBRWxCLFdBQU8sRUFBRSxVQUFVLElBQUksV0FBVyxXQUFXLFNBQVMsRUFBRSxNQUFNLElBQUssQ0FBQyxDQUFDO0FBRXJFLFdBQU8sWUFBWSxRQUFRLGVBQWUsSUFBSTtBQUM5QyxZQUFRLFdBQVc7QUFDbkIsV0FBTyxZQUFZLFFBQVEsZUFBZSxLQUFLO0FBQUEsRUFDaEQsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbInByb2R1Y3RTZXJ2aWNlIiwgInNvY2tldCJdCn0K
