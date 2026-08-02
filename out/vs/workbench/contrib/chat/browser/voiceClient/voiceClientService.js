var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../base/common/event.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import {
  IVoiceClientService,
  isVoiceCheckpointId
} from "../../common/voiceClient/voiceClientService.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
const PING_INTERVAL_MS = 25e3;
const PONG_TIMEOUT_MS = 1e4;
const FAST_RETRY_COUNT = 3;
const FAST_RETRY_DELAY_MS = 2e3;
const SLOW_RETRY_DELAY_MS = 3e4;
const MAX_RECONNECT_DURATION_MS = 30 * 60 * 1e3;
const TTS_SUPPORTED_LANGUAGE_BASES = /* @__PURE__ */ new Set([
  "en",
  "de",
  "es",
  "fr",
  "it",
  "pt",
  "ja",
  "ko",
  "zh"
]);
const ASR_SUPPORTED_LANGUAGE_BASES = /* @__PURE__ */ new Set([
  "ar",
  "cs",
  "da",
  "de",
  "en",
  "es",
  "fi",
  "fr",
  "hi",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "nb",
  "nl",
  "pl",
  "pt",
  "ro",
  "ru",
  "sv",
  "th",
  "tr",
  "vi",
  "zh"
]);
const DEFAULT_LANGUAGE = "en-US";
function asOptionalString(value) {
  return typeof value === "string" ? value : void 0;
}
function asOptionalNonEmptyString(value) {
  const result = asOptionalString(value);
  return result && result.length > 0 ? result : void 0;
}
function asTranscriptionStatus(value) {
  return value === "partial" || value === "final" ? value : void 0;
}
function asTranscriptionRevision(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : void 0;
}
let VoiceClientService = class extends Disposable {
  constructor(_configurationService, _logService, _productService) {
    super();
    this._configurationService = _configurationService;
    this._logService = _logService;
    this._productService = _productService;
    this._reconnectAttempts = 0;
    this._isConnected = false;
    this._isResuming = false;
    // Set once start_session/resume_session (which carries session_context) has
    // been sent on the current connection; reset per connection. Gates
    // `_sendSetLanguage` and `requestNarration` so the backend has the session
    // before those follow-up messages are sent.
    this._sessionStartedOnSocket = false;
    this._lastSentById = /* @__PURE__ */ new Map();
    // session id → last-sent field values
    this._invalidatedSessionIds = /* @__PURE__ */ new Set();
    // --- Events ---
    this._onTranscription = this._register(new Emitter());
    this.onTranscription = this._onTranscription.event;
    this._onAudioResponse = this._register(new Emitter());
    this.onAudioResponse = this._onAudioResponse.event;
    this._onBargeIn = this._register(new Emitter());
    this.onBargeIn = this._onBargeIn.event;
    this._onNarrationAck = this._register(new Emitter());
    this.onNarrationAck = this._onNarrationAck.event;
    this._onNarrationUnblocked = this._register(new Emitter());
    this.onNarrationUnblocked = this._onNarrationUnblocked.event;
    this._onNarrationInterrupted = this._register(new Emitter());
    this.onNarrationInterrupted = this._onNarrationInterrupted.event;
    this._onToolCall = this._register(new Emitter());
    this.onToolCall = this._onToolCall.event;
    this._onSpeechStarted = this._register(new Emitter());
    this.onSpeechStarted = this._onSpeechStarted.event;
    this._onSessionInit = this._register(new Emitter());
    this.onSessionInit = this._onSessionInit.event;
    this._onError = this._register(new Emitter());
    this.onError = this._onError.event;
    this._onDidChangeConnectionState = this._register(new Emitter());
    this.onDidChangeConnectionState = this._onDidChangeConnectionState.event;
    this._onFatalDisconnect = this._register(new Emitter());
    this.onFatalDisconnect = this._onFatalDisconnect.event;
    this._onTurnAutoEnded = this._register(new Emitter());
    this.onTurnAutoEnded = this._onTurnAutoEnded.event;
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("agents.voice.turn.silenceMs") || e.affectsConfiguration("agents.voice.turn.stopPhrases") || e.affectsConfiguration("agents.voice.handsFree")) {
        this._sendSetTurnConfig();
      }
      if (e.affectsConfiguration("agents.voice.voice")) {
        this._sendSetVoice();
      }
      if (e.affectsConfiguration("agents.voice.language")) {
        this._sendSetLanguage();
      }
    }));
  }
  get isConnected() {
    return this._isConnected;
  }
  get isResuming() {
    return this._isResuming;
  }
  get willReconnect() {
    return this._reconnectTimer !== void 0;
  }
  get currentSessionId() {
    return this._lastSessionId;
  }
  /**
   * Resolve the configured voice key (e.g. ``maya_neutral``) sent to the
   * backend on ``start_session`` and via ``set_voice`` when changed live.
   */
  _getVoice() {
    const raw = this._configurationService.getValue("agents.voice.voice");
    return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "maya_neutral";
  }
  _sendSetVoice() {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: "set_voice", voice: this._getVoice() }));
    }
  }
  _getLanguage() {
    const configured = this._configurationService.getValue("agents.voice.language");
    if (typeof configured === "string" && configured.trim().toLowerCase() !== "auto") {
      const language = this._canonicalizeSupportedLanguage(configured, TTS_SUPPORTED_LANGUAGE_BASES);
      if (language) {
        return language;
      }
      this._logService.warn(`[voice] Unsupported agents.voice.language value '${configured}', falling back to ${DEFAULT_LANGUAGE}`);
      return DEFAULT_LANGUAGE;
    }
    return this._canonicalizeSupportedLanguage(this._window?.navigator.language, ASR_SUPPORTED_LANGUAGE_BASES) ?? DEFAULT_LANGUAGE;
  }
  _canonicalizeSupportedLanguage(value, supportedBases) {
    const candidate = value?.trim();
    if (!candidate || typeof Intl.getCanonicalLocales !== "function") {
      return void 0;
    }
    try {
      const canonical = Intl.getCanonicalLocales(candidate)[0];
      return supportedBases.has(canonical.split("-")[0]) ? canonical : void 0;
    } catch {
      return void 0;
    }
  }
  _sendSetLanguage() {
    if (this._ws?.readyState === WebSocket.OPEN && this._sessionStartedOnSocket) {
      this._ws.send(JSON.stringify({ type: "set_language", language: this._getLanguage() }));
    }
  }
  /**
   * Whether a configuration setting has an explicit user/workspace/application
   * value, as opposed to falling back to its registered default.
   */
  _isExplicitlyConfigured(key) {
    const inspected = this._configurationService.inspect(key);
    return inspected.userValue !== void 0 || inspected.userLocalValue !== void 0 || inspected.userRemoteValue !== void 0 || inspected.workspaceValue !== void 0 || inspected.workspaceFolderValue !== void 0 || inspected.applicationValue !== void 0;
  }
  /**
   * Assemble the ``turn_config`` wire object from the ``agents.voice.turn.*``
   * settings, normalizing each into the shape the backend expects. The
   * ``auto_end_mode`` is derived from the other two settings: trailing-silence
   * ending is enabled unless ``silenceMs`` is ``-1`` (or otherwise non-positive),
   * and stop-phrase ending is enabled when at least one phrase is configured.
   *
   * When hands-free mode (``agents.voice.handsFree``) is disabled, the turn is
   * not sent automatically by default: trailing-silence and stop-phrase ending
   * are each suppressed unless the corresponding setting has been explicitly
   * configured, so a user who opts out of the hands-free loop keeps manual
   * control over when a turn is sent.
   */
  _getTurnConfig() {
    const cfg = this._configurationService;
    const handsFree = cfg.getValue("agents.voice.handsFree") === true;
    const silenceRaw = cfg.getValue("agents.voice.turn.silenceMs");
    let silenceEnabled = typeof silenceRaw === "number" && silenceRaw > 0;
    if (!handsFree && !this._isExplicitlyConfigured("agents.voice.turn.silenceMs")) {
      silenceEnabled = false;
    }
    const silence_ms = silenceEnabled ? Math.round(silenceRaw) : 800;
    const phrasesRaw = cfg.getValue("agents.voice.turn.stopPhrases");
    const stop_phrases = Array.isArray(phrasesRaw) ? phrasesRaw.map((p) => String(p).trim()).filter((p) => p.length > 0) : [];
    let phrasesEnabled = stop_phrases.length > 0;
    if (!handsFree && !this._isExplicitlyConfigured("agents.voice.turn.stopPhrases")) {
      phrasesEnabled = false;
    }
    const auto_end_mode = silenceEnabled && phrasesEnabled ? "both" : silenceEnabled ? "vad" : phrasesEnabled ? "phrase" : "off";
    return { auto_end_mode, silence_ms, stop_phrases: phrasesEnabled ? stop_phrases : [], vad_gate_asr: true };
  }
  _sendSetTurnConfig() {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: "set_turn_config", turn_config: this._getTurnConfig() }));
    }
  }
  _getWsUrl() {
    const configured = this._configurationService.getValue("agents.voice.backendUrl");
    const url = typeof configured === "string" ? configured.trim() : "";
    return url || this._productService.voiceWsUrl || "";
  }
  async connect(window, authToken) {
    this._window = window;
    this._authToken = authToken;
    this._reconnectAttempts = 0;
    this._connectWebSocket();
  }
  _connectWebSocket() {
    const win = this._window;
    if (!win) {
      return;
    }
    const baseUrl = this._getWsUrl();
    if (!baseUrl) {
      this._logService.error("[voice] No voice WebSocket URL configured (set voiceWsUrl in product.json or agents.voice.backendUrl in settings)");
      return;
    }
    const url = this._authToken ? `${baseUrl}?token=${encodeURIComponent(this._authToken)}` : baseUrl;
    const ws = new win.WebSocket(url);
    this._ws = ws;
    this._sessionStartedOnSocket = false;
    ws.onopen = () => {
      this._reconnectAttempts = 0;
      this._reconnectStartedAt = void 0;
      this._isResuming = !!this._lastSessionId;
      this._sessionStartedOnSocket = false;
      this._setConnected(true);
      this._startPing();
      if (this._lastSessionId) {
      }
    };
    ws.onmessage = (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case "pong":
          this._clearPongTimeout();
          break;
        case "session_init":
          this._lastSessionId = msg.session_id;
          this._isResuming = false;
          this._onSessionInit.fire({ sessionId: msg.session_id ?? "" });
          break;
        case "session_resumed":
          this._lastSessionId = msg.session_id;
          this._isResuming = false;
          this._onSessionInit.fire({ sessionId: msg.session_id ?? "" });
          break;
        case "speech_started":
          this._onSpeechStarted.fire({ turnId: asOptionalString(msg.turn_id) });
          break;
        case "barge_in":
          this._onBargeIn.fire({
            turnId: asOptionalString(msg.turn_id) ?? "",
            interruptedTurnId: msg.interrupted_turn_id ?? ""
          });
          break;
        case "narration_ack": {
          const disposition = msg.disposition === "busy" || msg.disposition === "invalid" || msg.disposition === "suppressed" ? msg.disposition : "accepted";
          this._onNarrationAck.fire({
            narrationId: msg.narration_id ?? "",
            codingSessionId: msg.coding_session_id ?? "",
            disposition,
            reason: msg.reason
          });
          break;
        }
        case "narration_unblocked":
          this._onNarrationUnblocked.fire({
            narrationId: msg.narration_id ?? "",
            codingSessionId: msg.coding_session_id ?? ""
          });
          break;
        case "narration_interrupted":
          this._onNarrationInterrupted.fire({
            narrationId: msg.narration_id ?? "",
            codingSessionId: msg.coding_session_id ?? "",
            ...typeof msg.retryable === "boolean" ? { retryable: msg.retryable } : {},
            ...msg.reason ? { reason: msg.reason } : {}
          });
          break;
        case "transcription": {
          const status = msg.status === void 0 ? "final" : asTranscriptionStatus(msg.status);
          const turnId = msg.turn_id === void 0 ? void 0 : asOptionalNonEmptyString(msg.turn_id);
          const revision = msg.revision === void 0 ? void 0 : asTranscriptionRevision(msg.revision);
          if (!status || msg.turn_id !== void 0 && !turnId || msg.revision !== void 0 && (!turnId || revision === void 0)) {
            break;
          }
          this._onTranscription.fire({
            text: asOptionalString(msg.text) ?? "",
            status,
            committed: asOptionalString(msg.committed) ?? "",
            turnId,
            revision
          });
          break;
        }
        case "audio_response": {
          const requestId = asOptionalString(msg.request_id);
          const checkpointId = isVoiceCheckpointId(msg.checkpoint_id) ? msg.checkpoint_id : void 0;
          const sequence = typeof msg.sequence === "number" && Number.isSafeInteger(msg.sequence) && msg.sequence > 0 ? msg.sequence : void 0;
          const narrationKind = msg.narration_kind === "response" || msg.narration_kind === "confirmation" || msg.narration_kind === "checkpoint" ? msg.narration_kind : void 0;
          const playbackId = asOptionalString(msg.playback_id);
          if (narrationKind === "checkpoint") {
            this._logService.info(`[voice] checkpoint audio request=${requestId ?? "none"} stage=${checkpointId ?? "none"} sequence=${sequence ?? "none"} first=${msg.is_first_chunk === void 0 ? true : Boolean(msg.is_first_chunk)} final=${Boolean(msg.is_final)}`);
          }
          this._onAudioResponse.fire({
            audio: msg.audio ?? "",
            isFirstChunk: msg.is_first_chunk === void 0 ? true : Boolean(msg.is_first_chunk),
            isFinal: msg.is_final ?? false,
            codingSessionId: msg.coding_session_id,
            transcript: msg.transcript,
            turnId: asOptionalString(msg.turn_id),
            responseId: msg.narration_id ?? asOptionalString(msg.turn_id),
            ...requestId ? { requestId } : {},
            ...checkpointId ? { checkpointId } : {},
            ...sequence !== void 0 ? { sequence } : {},
            ...narrationKind ? { narrationKind } : {},
            ...playbackId ? { playbackId } : {}
          });
          break;
        }
        case "tool_call":
          this._onToolCall.fire({
            callId: msg.call_id ?? "",
            name: msg.name ?? "",
            args: msg.args ?? {}
          });
          break;
        case "turn_auto_ended": {
          const reason = msg.reason === "stop_phrase" ? "stop_phrase" : "vad_silence";
          this._onTurnAutoEnded.fire({ reason, turnId: asOptionalString(msg.turn_id) ?? "" });
          break;
        }
        case "error":
          this._onError.fire(msg.detail ?? "Unknown error");
          break;
      }
    };
    ws.onerror = () => {
      this._onError.fire("WebSocket error");
    };
    ws.onclose = (evt) => {
      this._logService.trace(`[voice] ws.onclose code=${evt.code} reason=${evt.reason ?? ""} wasClean=${evt.wasClean}`);
      if (this._ws === ws) {
        if (evt.code === 1e3 || evt.code === 1001) {
          this._cleanup();
          return;
        }
        if (evt.code === 4001 || evt.code === 4008 || evt.code === 4029) {
          this._logService.warn(`[voice] fatal close code ${evt.code}: ${evt.reason}, not reconnecting`);
          this._onFatalDisconnect.fire({ code: evt.code, reason: evt.reason ?? "" });
          this._cleanup();
          return;
        }
        if (!this._reconnectStartedAt) {
          this._reconnectStartedAt = Date.now();
        }
        const elapsed = Date.now() - this._reconnectStartedAt;
        if (elapsed >= MAX_RECONNECT_DURATION_MS) {
          this._logService.warn("[voice] reconnect timeout after 30 minutes, giving up");
          this._cleanup();
          return;
        }
        this._reconnectAttempts++;
        this._stopPing();
        this._ws = void 0;
        const delay = this._reconnectAttempts <= FAST_RETRY_COUNT ? FAST_RETRY_DELAY_MS : SLOW_RETRY_DELAY_MS;
        this._logService.warn(`[voice] ws closed abnormally (code=${evt.code} reason=${evt.reason || "none"} wasClean=${evt.wasClean}); reconnecting in ${delay}ms (attempt ${this._reconnectAttempts})`);
        this._reconnectTimer = setTimeout(() => {
          this._reconnectTimer = void 0;
          this._connectWebSocket();
        }, delay);
        this._setConnected(false);
      }
    };
  }
  disconnect() {
    this._logService.trace("[voice] disconnect() called");
    if (this._ws && this._ws.readyState < WebSocket.CLOSING) {
      this._ws.close();
    }
    this._cleanup();
  }
  _cleanup() {
    this._stopPing();
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = void 0;
    }
    if (this._contextSendTimer) {
      clearTimeout(this._contextSendTimer);
      this._contextSendTimer = void 0;
    }
    this._pendingContext = void 0;
    this._ws = void 0;
    this._sessionStartedOnSocket = false;
    this._window = void 0;
    this._lastSessionId = void 0;
    this._isResuming = false;
    this._lastSentById.clear();
    this._invalidatedSessionIds.clear();
    this._setConnected(false);
  }
  _startPing() {
    this._stopPing();
    const win = this._window ?? mainWindow;
    this._pingTimer = win.setInterval(() => {
      if (this._ws?.readyState === WebSocket.OPEN) {
        this._ws.send(JSON.stringify({ type: "ping" }));
        this._pongTimer = setTimeout(() => {
          this._logService.warn("[voice] pong timeout \u2014 server unreachable, reconnecting");
          this._ws?.close(4e3, "pong timeout");
        }, PONG_TIMEOUT_MS);
      }
    }, PING_INTERVAL_MS);
  }
  _stopPing() {
    if (this._pingTimer) {
      (this._window ?? mainWindow).clearInterval(this._pingTimer);
      this._pingTimer = void 0;
    }
    this._clearPongTimeout();
  }
  _clearPongTimeout() {
    if (this._pongTimer) {
      clearTimeout(this._pongTimer);
      this._pongTimer = void 0;
    }
  }
  _setConnected(connected) {
    if (this._isConnected !== connected) {
      this._isConnected = connected;
      this._onDidChangeConnectionState.fire(connected);
    }
  }
  sendPttStart(turnId, passive = false) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: "ptt_start", turn_id: turnId, ...passive ? { passive: true } : {} }));
    }
  }
  sendPttAudioChunk(audio) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: "ptt_audio_chunk", audio }));
    }
  }
  sendPttEnd() {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: "ptt_end" }));
    }
  }
  sendPttDiagnostic(turnId, metrics) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: "ptt_diagnostic", turn_id: turnId, metrics }));
    }
  }
  sendSessionContext(context) {
    if (!this._isConnected) {
      return;
    }
    this._pendingContext = context;
    if (this._contextSendTimer) {
      clearTimeout(this._contextSendTimer);
    }
    this._contextSendTimer = setTimeout(() => {
      this._contextSendTimer = void 0;
      const pending = this._pendingContext;
      this._pendingContext = void 0;
      if (pending && this._ws?.readyState === WebSocket.OPEN) {
        this._sendDelta(pending);
      }
    }, 500);
  }
  flushSessionContext() {
    if (!this._contextSendTimer) {
      return;
    }
    clearTimeout(this._contextSendTimer);
    this._contextSendTimer = void 0;
    const pending = this._pendingContext;
    this._pendingContext = void 0;
    if (pending && this._ws?.readyState === WebSocket.OPEN) {
      this._sendDelta(pending);
    }
  }
  invalidateSessionCache(sessionId) {
    this._invalidatedSessionIds.add(sessionId);
  }
  _sendDelta(context) {
    const currentIds = new Set(context.sessions.map((s) => s.id));
    const removes = [...this._lastSentById.keys()].filter((id) => !currentIds.has(id));
    const upserts = [];
    for (const session of context.sessions) {
      const current = session;
      const prev = this._lastSentById.get(session.id);
      if (!prev) {
        upserts.push(current);
      } else {
        const patch = { id: session.id };
        let hasChanges = false;
        if (this._invalidatedSessionIds.has(session.id)) {
          for (const key of Object.keys(current)) {
            if (key !== "id") {
              patch[key] = current[key] ?? null;
              hasChanges = true;
            }
          }
          for (const key of Object.keys(prev)) {
            if (key !== "id" && (!Object.prototype.hasOwnProperty.call(current, key) || current[key] === void 0)) {
              patch[key] = null;
              hasChanges = true;
            }
          }
        } else {
          for (const key of Object.keys(current)) {
            if (key === "id") {
              continue;
            }
            if (stableStringify(current[key]) !== stableStringify(prev[key])) {
              patch[key] = current[key];
              hasChanges = true;
            }
          }
          for (const key of Object.keys(prev)) {
            if (key === "id") {
              continue;
            }
            if (!Object.prototype.hasOwnProperty.call(current, key) || current[key] === void 0) {
              patch[key] = null;
              hasChanges = true;
            }
          }
        }
        if (!Object.prototype.hasOwnProperty.call(patch, "agent_state")) {
          if (Object.prototype.hasOwnProperty.call(patch, "agent_state_detail")) {
            delete patch.agent_state_detail;
          }
          if (Object.prototype.hasOwnProperty.call(patch, "last_response_summary")) {
            delete patch.last_response_summary;
          }
          hasChanges = Object.keys(patch).some((k) => k !== "id");
        }
        if (hasChanges) {
          upserts.push(patch);
        }
      }
    }
    if (upserts.length === 0 && removes.length === 0) {
      return;
    }
    for (const session of context.sessions) {
      const obj = {};
      for (const [k, v] of Object.entries(session)) {
        if (v !== void 0) {
          obj[k] = v;
        }
      }
      this._lastSentById.set(session.id, obj);
      this._invalidatedSessionIds.delete(session.id);
    }
    for (const id of removes) {
      this._lastSentById.delete(id);
      this._invalidatedSessionIds.delete(id);
    }
    this._ws.send(JSON.stringify({
      type: "session_context",
      mode: "delta",
      upserts,
      removes
    }));
    this._logService.trace(`[voice] _sendDelta upserts=[${upserts.map((u) => `${String(u.id).slice(-8)}:${u.agent_state ?? "(no-state)"}${Object.prototype.hasOwnProperty.call(u, "agent_state_detail") ? "+detail" : ""}${Object.prototype.hasOwnProperty.call(u, "last_response_summary") && u.last_response_summary ? "+summary" : ""}`).join(", ")}] removes=${removes.length}`);
  }
  _seedTracking(context) {
    this._lastSentById.clear();
    this._invalidatedSessionIds.clear();
    for (const session of context.sessions) {
      const obj = {};
      for (const [k, v] of Object.entries(session)) {
        if (v !== void 0) {
          obj[k] = v;
        }
      }
      this._lastSentById.set(session.id, obj);
    }
  }
  sendToolResult(callId, result) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: "tool_result", call_id: callId, result }));
    }
  }
  sendNarrationPlaybackComplete(codingSessionId, narrationId, playbackId) {
    if (this._ws?.readyState === WebSocket.OPEN && this._sessionStartedOnSocket) {
      this._ws.send(JSON.stringify({
        type: "narration_playback_complete",
        coding_session_id: codingSessionId,
        narration_id: narrationId,
        playback_id: playbackId
      }));
    }
  }
  requestNarration(codingSessionId, kind, text, narrationId, checkpoint, confirmationType, pending) {
    if (this._ws?.readyState === WebSocket.OPEN && this._sessionStartedOnSocket) {
      const id = narrationId ?? generateUuid();
      this._ws.send(JSON.stringify({
        type: "request_narration",
        coding_session_id: codingSessionId,
        kind,
        text,
        narration_id: id,
        ...checkpoint ? {
          request_id: checkpoint.requestId,
          checkpoint_id: checkpoint.checkpointId,
          sequence: checkpoint.sequence
        } : {},
        ...kind === "confirmation" && confirmationType ? { confirmation_type: confirmationType } : {},
        ...pending ? { pending_id: pending.pendingId } : {}
      }));
      this._logService.trace(`[voice] request_narration kind=${kind} id=${codingSessionId.slice(-32)} narration_id=${id.slice(0, 8)}${narrationId ? " (retry)" : ""}`);
      if (checkpoint) {
        this._logService.info(`[voice] checkpoint sent request=${checkpoint.requestId} stage=${checkpoint.checkpointId} sequence=${checkpoint.sequence}`);
      }
      return id;
    }
    return void 0;
  }
  sendSessionStateChange(sessionId, newState, _label, detail, lastResponseSummary) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      const payload = { type: "session_state_change", session_id: sessionId, new_state: newState };
      if (detail) {
        payload.detail = detail;
      }
      if (lastResponseSummary) {
        payload.last_response_summary = lastResponseSummary;
      }
      this._ws.send(JSON.stringify(payload));
    }
  }
  stopSpeaking() {
  }
  /**
   * Send the start_session message with the given context.
   * Called by the consumer after connect() resolves and AudioContext is ready.
   *
   * ``priorTimeline`` carries an ordered slice of cross-session entries
   * (voice turns, voice tool calls, coding-session events, and a synthesized
   * coding-agent-reply summary per active session) from the previous voice
   * session. The BE consumes it once on the first command turn so the model
   * can answer recall questions across reconnects without backend
   * persistence. See ``IVoicePriorTimelineEntry``.
   */
  sendStartSession(context, machineId, priorTimeline, turnConfigOverride, voiceInstructions) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      const sessionContext = { ...context, display_locale: this._getLanguage() };
      this._seedTracking(sessionContext);
      const payload = { type: "start_session", session_context: sessionContext, machine_id: machineId, turn_config: turnConfigOverride ?? this._getTurnConfig(), voice: this._getVoice(), auto_narrate: false };
      if (priorTimeline && priorTimeline.length > 0) {
        payload.prior_timeline = priorTimeline;
      }
      if (voiceInstructions) {
        payload.voice_instructions = voiceInstructions;
      }
      this._ws.send(JSON.stringify(payload));
      this._sessionStartedOnSocket = true;
    }
  }
  sendResumeSession(context, machineId, voiceInstructions) {
    if (this._ws?.readyState === WebSocket.OPEN && this._lastSessionId) {
      const sessionContext = { ...context, display_locale: this._getLanguage() };
      this._seedTracking(sessionContext);
      const payload = { type: "resume_session", session_id: this._lastSessionId, session_context: sessionContext, machine_id: machineId, turn_config: this._getTurnConfig(), voice: this._getVoice(), auto_narrate: false };
      if (voiceInstructions) {
        payload.voice_instructions = voiceInstructions;
      }
      this._ws.send(JSON.stringify(payload));
      this._sessionStartedOnSocket = true;
    }
  }
  async submitFeedback(payload) {
    const httpUrl = this._getWsUrl().replace("wss://", "https://").replace("ws://", "http://").replace(/\/realtime\/voice$/, "/feedback");
    const headers = { "Content-Type": "application/json" };
    if (this._authToken) {
      headers["Authorization"] = `Bearer ${this._authToken}`;
    }
    try {
      const response = await fetch(httpUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          feedback_text: payload.feedbackText,
          machine_id: payload.machineId,
          user_id: payload.userId,
          session_id: payload.sessionId,
          submission_id: payload.submissionId,
          transcript_history: payload.transcriptHistory.map((t) => ({
            role: t.role,
            text: t.text,
            timestamp: t.timestamp
          })),
          client_session_state: payload.clientSessionState,
          client_environment: payload.clientEnvironment,
          timestamp: payload.timestamp
        })
      });
      if (!response.ok) {
        const text = await response.text();
        return { ok: false, error: `HTTP ${response.status}: ${text}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
  dispose() {
    this.disconnect();
    super.dispose();
  }
};
VoiceClientService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IProductService)
], VoiceClientService);
function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
}
registerSingleton(IVoiceClientService, VoiceClientService, InstantiationType.Delayed);
export {
  VoiceClientService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZUNsaWVudFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHtcblx0SVZvaWNlQ2xpZW50U2VydmljZSxcblx0SVZvaWNlUHJpb3JUaW1lbGluZUVudHJ5LFxuXHRJVm9pY2VTZXNzaW9uQ29udGV4dCxcblx0SVZvaWNlVHJhbnNjcmlwdGlvbixcblx0SVZvaWNlQXVkaW9SZXNwb25zZSxcblx0SVZvaWNlVG9vbENhbGwsXG5cdElWb2ljZVNwZWVjaFN0YXJ0ZWQsXG5cdElWb2ljZVNlc3Npb25Jbml0LFxuXHRJVm9pY2VGZWVkYmFja1BheWxvYWQsXG5cdElWb2ljZVR1cm5Db25maWcsXG5cdElWb2ljZVR1cm5BdXRvRW5kZWQsXG5cdElWb2ljZVR1cm5BdXRvRW5kUmVhc29uLFxuXHRJVm9pY2VGYXRhbERpc2Nvbm5lY3QsXG5cdElWb2ljZUJhcmdlSW4sXG5cdElWb2ljZU5hcnJhdGlvbkFjayxcblx0SVZvaWNlTmFycmF0aW9uU2lnbmFsLFxuXHRJVm9pY2VEaXNwYXRjaFJlc3VsdCxcblx0SVZvaWNlQ2hlY2twb2ludE5hcnJhdGlvbk1ldGFkYXRhLFxuXHRWb2ljZUNvbmZpcm1hdGlvblR5cGUsXG5cdFZvaWNlTmFycmF0aW9uS2luZCxcblx0aXNWb2ljZUNoZWNrcG9pbnRJZCxcbn0gZnJvbSAnLi4vLi4vY29tbW9uL3ZvaWNlQ2xpZW50L3ZvaWNlQ2xpZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcblxuY29uc3QgUElOR19JTlRFUlZBTF9NUyA9IDI1XzAwMDtcbmNvbnN0IFBPTkdfVElNRU9VVF9NUyA9IDEwXzAwMDtcbmNvbnN0IEZBU1RfUkVUUllfQ09VTlQgPSAzO1xuY29uc3QgRkFTVF9SRVRSWV9ERUxBWV9NUyA9IDJfMDAwO1xuY29uc3QgU0xPV19SRVRSWV9ERUxBWV9NUyA9IDMwXzAwMDtcbmNvbnN0IE1BWF9SRUNPTk5FQ1RfRFVSQVRJT05fTVMgPSAzMCAqIDYwICogMV8wMDA7XG5jb25zdCBUVFNfU1VQUE9SVEVEX0xBTkdVQUdFX0JBU0VTID0gbmV3IFNldChbXG5cdCdlbicsICdkZScsICdlcycsICdmcicsICdpdCcsICdwdCcsICdqYScsICdrbycsICd6aCcsXG5dKTtcbmNvbnN0IEFTUl9TVVBQT1JURURfTEFOR1VBR0VfQkFTRVMgPSBuZXcgU2V0KFtcblx0J2FyJywgJ2NzJywgJ2RhJywgJ2RlJywgJ2VuJywgJ2VzJywgJ2ZpJywgJ2ZyJywgJ2hpJywgJ2h1JywgJ2lkJywgJ2l0Jyxcblx0J2phJywgJ2tvJywgJ25iJywgJ25sJywgJ3BsJywgJ3B0JywgJ3JvJywgJ3J1JywgJ3N2JywgJ3RoJywgJ3RyJywgJ3ZpJywgJ3poJyxcbl0pO1xuY29uc3QgREVGQVVMVF9MQU5HVUFHRSA9ICdlbi1VUyc7XG5cbmZ1bmN0aW9uIGFzT3B0aW9uYWxTdHJpbmcodmFsdWU6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHZhbHVlIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBhc09wdGlvbmFsTm9uRW1wdHlTdHJpbmcodmFsdWU6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCByZXN1bHQgPSBhc09wdGlvbmFsU3RyaW5nKHZhbHVlKTtcblx0cmV0dXJuIHJlc3VsdCAmJiByZXN1bHQubGVuZ3RoID4gMCA/IHJlc3VsdCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gYXNUcmFuc2NyaXB0aW9uU3RhdHVzKHZhbHVlOiB1bmtub3duKTogSVZvaWNlVHJhbnNjcmlwdGlvblsnc3RhdHVzJ10gfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gdmFsdWUgPT09ICdwYXJ0aWFsJyB8fCB2YWx1ZSA9PT0gJ2ZpbmFsJyA/IHZhbHVlIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBhc1RyYW5zY3JpcHRpb25SZXZpc2lvbih2YWx1ZTogdW5rbm93bik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIE51bWJlci5pc0ludGVnZXIodmFsdWUpICYmIHZhbHVlID49IDAgPyB2YWx1ZSA6IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIFZvaWNlQ2xpZW50U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVm9pY2VDbGllbnRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfd3M6IFdlYlNvY2tldCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmVjb25uZWN0QXR0ZW1wdHMgPSAwO1xuXHRwcml2YXRlIF9yZWNvbm5lY3RTdGFydGVkQXQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmVjb25uZWN0VGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pc0Nvbm5lY3RlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9pc1Jlc3VtaW5nID0gZmFsc2U7XG5cdC8vIFNldCBvbmNlIHN0YXJ0X3Nlc3Npb24vcmVzdW1lX3Nlc3Npb24gKHdoaWNoIGNhcnJpZXMgc2Vzc2lvbl9jb250ZXh0KSBoYXNcblx0Ly8gYmVlbiBzZW50IG9uIHRoZSBjdXJyZW50IGNvbm5lY3Rpb247IHJlc2V0IHBlciBjb25uZWN0aW9uLiBHYXRlc1xuXHQvLyBgX3NlbmRTZXRMYW5ndWFnZWAgYW5kIGByZXF1ZXN0TmFycmF0aW9uYCBzbyB0aGUgYmFja2VuZCBoYXMgdGhlIHNlc3Npb25cblx0Ly8gYmVmb3JlIHRob3NlIGZvbGxvdy11cCBtZXNzYWdlcyBhcmUgc2VudC5cblx0cHJpdmF0ZSBfc2Vzc2lvblN0YXJ0ZWRPblNvY2tldCA9IGZhbHNlO1xuXHRwcml2YXRlIF93aW5kb3c6IChXaW5kb3cgJiB0eXBlb2YgZ2xvYmFsVGhpcykgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhc3RTZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvLyAtLS0gS2VlcC1hbGl2ZSBwaW5nL3BvbmcgLS0tXG5cdHByaXZhdGUgX3BpbmdUaW1lcjogUmV0dXJuVHlwZTxXaW5kb3dbJ3NldEludGVydmFsJ10+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wb25nVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXG5cdC8vIC0tLSBEZWJvdW5jZWQgY29udGV4dCBzZW5kaW5nIHdpdGggcGVyLXNlc3Npb24gZGVsdGEgdHJhY2tpbmcgLS0tXG5cdHByaXZhdGUgX2NvbnRleHRTZW5kVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXHQvLyBMYXRlc3QgY29udGV4dCBoYW5kZWQgdG8gYGBzZW5kU2Vzc2lvbkNvbnRleHRgYCB3aGlsZSBhIGRlYm91bmNlIGlzIGluXG5cdC8vIGZsaWdodC4gSGVsZCBzbyBgYGZsdXNoU2Vzc2lvbkNvbnRleHRgYCBjYW4gc2hpcCBpdCBzeW5jaHJvbm91c2x5IGlmIGFcblx0Ly8gc3RhdGUtY2hhbmdlIGV2ZW50IG5lZWRzIHRvIGZpcmUgYmVmb3JlIHRoZSB0aW1lciBleHBpcmVzLlxuXHRwcml2YXRlIF9wZW5kaW5nQ29udGV4dDogSVZvaWNlU2Vzc2lvbkNvbnRleHQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhc3RTZW50QnlJZCA9IG5ldyBNYXA8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4oKTsgLy8gc2Vzc2lvbiBpZCBcdTIxOTIgbGFzdC1zZW50IGZpZWxkIHZhbHVlc1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnZhbGlkYXRlZFNlc3Npb25JZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHQvLyAtLS0gRXZlbnRzIC0tLVxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblRyYW5zY3JpcHRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVm9pY2VUcmFuc2NyaXB0aW9uPigpKTtcblx0cmVhZG9ubHkgb25UcmFuc2NyaXB0aW9uOiBFdmVudDxJVm9pY2VUcmFuc2NyaXB0aW9uPiA9IHRoaXMuX29uVHJhbnNjcmlwdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkF1ZGlvUmVzcG9uc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVm9pY2VBdWRpb1Jlc3BvbnNlPigpKTtcblx0cmVhZG9ubHkgb25BdWRpb1Jlc3BvbnNlOiBFdmVudDxJVm9pY2VBdWRpb1Jlc3BvbnNlPiA9IHRoaXMuX29uQXVkaW9SZXNwb25zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkJhcmdlSW4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVm9pY2VCYXJnZUluPigpKTtcblx0cmVhZG9ubHkgb25CYXJnZUluOiBFdmVudDxJVm9pY2VCYXJnZUluPiA9IHRoaXMuX29uQmFyZ2VJbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk5hcnJhdGlvbkFjayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElWb2ljZU5hcnJhdGlvbkFjaz4oKSk7XG5cdHJlYWRvbmx5IG9uTmFycmF0aW9uQWNrOiBFdmVudDxJVm9pY2VOYXJyYXRpb25BY2s+ID0gdGhpcy5fb25OYXJyYXRpb25BY2suZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25OYXJyYXRpb25VbmJsb2NrZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVm9pY2VOYXJyYXRpb25TaWduYWw+KCkpO1xuXHRyZWFkb25seSBvbk5hcnJhdGlvblVuYmxvY2tlZDogRXZlbnQ8SVZvaWNlTmFycmF0aW9uU2lnbmFsPiA9IHRoaXMuX29uTmFycmF0aW9uVW5ibG9ja2VkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTmFycmF0aW9uSW50ZXJydXB0ZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVm9pY2VOYXJyYXRpb25TaWduYWw+KCkpO1xuXHRyZWFkb25seSBvbk5hcnJhdGlvbkludGVycnVwdGVkOiBFdmVudDxJVm9pY2VOYXJyYXRpb25TaWduYWw+ID0gdGhpcy5fb25OYXJyYXRpb25JbnRlcnJ1cHRlZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblRvb2xDYWxsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVZvaWNlVG9vbENhbGw+KCkpO1xuXHRyZWFkb25seSBvblRvb2xDYWxsOiBFdmVudDxJVm9pY2VUb29sQ2FsbD4gPSB0aGlzLl9vblRvb2xDYWxsLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uU3BlZWNoU3RhcnRlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElWb2ljZVNwZWVjaFN0YXJ0ZWQ+KCkpO1xuXHRyZWFkb25seSBvblNwZWVjaFN0YXJ0ZWQ6IEV2ZW50PElWb2ljZVNwZWVjaFN0YXJ0ZWQ+ID0gdGhpcy5fb25TcGVlY2hTdGFydGVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uU2Vzc2lvbkluaXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVm9pY2VTZXNzaW9uSW5pdD4oKSk7XG5cdHJlYWRvbmx5IG9uU2Vzc2lvbkluaXQ6IEV2ZW50PElWb2ljZVNlc3Npb25Jbml0PiA9IHRoaXMuX29uU2Vzc2lvbkluaXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25FcnJvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRXJyb3I6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkVycm9yLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlOiBFdmVudDxib29sZWFuPiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRmF0YWxEaXNjb25uZWN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVZvaWNlRmF0YWxEaXNjb25uZWN0PigpKTtcblx0cmVhZG9ubHkgb25GYXRhbERpc2Nvbm5lY3Q6IEV2ZW50PElWb2ljZUZhdGFsRGlzY29ubmVjdD4gPSB0aGlzLl9vbkZhdGFsRGlzY29ubmVjdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblR1cm5BdXRvRW5kZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVm9pY2VUdXJuQXV0b0VuZGVkPigpKTtcblx0cmVhZG9ubHkgb25UdXJuQXV0b0VuZGVkOiBFdmVudDxJVm9pY2VUdXJuQXV0b0VuZGVkPiA9IHRoaXMuX29uVHVybkF1dG9FbmRlZC5ldmVudDtcblxuXHRnZXQgaXNDb25uZWN0ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzQ29ubmVjdGVkO1xuXHR9XG5cblx0Z2V0IGlzUmVzdW1pbmcoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzUmVzdW1pbmc7XG5cdH1cblxuXHRnZXQgd2lsbFJlY29ubmVjdCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVjb25uZWN0VGltZXIgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCBjdXJyZW50U2Vzc2lvbklkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhc3RTZXNzaW9uSWQ7XG5cdH1cblxuXHRwcml2YXRlIF9hdXRoVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFB1c2ggdHVybi1lbmRwb2ludGluZyBzZXR0aW5ncyB0byB0aGUgYmFja2VuZCBsaXZlLiBUYWtlcyBlZmZlY3Qgb25cblx0XHQvLyB0aGUgbmV4dCBwdXNoLXRvLXRhbGsgcHJlc3MgKHRoZSBiYWNrZW5kIG5ldmVyIG11dGF0ZXMgYW4gaW4tZmxpZ2h0XG5cdFx0Ly8gcHJlc3MpLiBXaGVuIGRpc2Nvbm5lY3RlZCB0aGlzIG5vLW9wczsgdGhlIGxhdGVzdCBjb25maWcgcmlkZXMgYWxvbmdcblx0XHQvLyBvbiB0aGUgbmV4dCBgYHN0YXJ0X3Nlc3Npb25gYCAvIGBgcmVzdW1lX3Nlc3Npb25gYCBpbnN0ZWFkLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChcblx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbignYWdlbnRzLnZvaWNlLnR1cm4uc2lsZW5jZU1zJykgfHxcblx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbignYWdlbnRzLnZvaWNlLnR1cm4uc3RvcFBocmFzZXMnKSB8fFxuXHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdhZ2VudHMudm9pY2UuaGFuZHNGcmVlJylcblx0XHRcdCkge1xuXHRcdFx0XHR0aGlzLl9zZW5kU2V0VHVybkNvbmZpZygpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2FnZW50cy52b2ljZS52b2ljZScpKSB7XG5cdFx0XHRcdHRoaXMuX3NlbmRTZXRWb2ljZSgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2FnZW50cy52b2ljZS5sYW5ndWFnZScpKSB7XG5cdFx0XHRcdHRoaXMuX3NlbmRTZXRMYW5ndWFnZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSBjb25maWd1cmVkIHZvaWNlIGtleSAoZS5nLiBgYG1heWFfbmV1dHJhbGBgKSBzZW50IHRvIHRoZVxuXHQgKiBiYWNrZW5kIG9uIGBgc3RhcnRfc2Vzc2lvbmBgIGFuZCB2aWEgYGBzZXRfdm9pY2VgYCB3aGVuIGNoYW5nZWQgbGl2ZS5cblx0ICovXG5cdHByaXZhdGUgX2dldFZvaWNlKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignYWdlbnRzLnZvaWNlLnZvaWNlJyk7XG5cdFx0cmV0dXJuIHR5cGVvZiByYXcgPT09ICdzdHJpbmcnICYmIHJhdy50cmltKCkubGVuZ3RoID4gMCA/IHJhdy50cmltKCkgOiAnbWF5YV9uZXV0cmFsJztcblx0fVxuXG5cdHByaXZhdGUgX3NlbmRTZXRWb2ljZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd3M/LnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOKSB7XG5cdFx0XHR0aGlzLl93cy5zZW5kKEpTT04uc3RyaW5naWZ5KHsgdHlwZTogJ3NldF92b2ljZScsIHZvaWNlOiB0aGlzLl9nZXRWb2ljZSgpIH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRMYW5ndWFnZSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnKTtcblx0XHRpZiAodHlwZW9mIGNvbmZpZ3VyZWQgPT09ICdzdHJpbmcnICYmIGNvbmZpZ3VyZWQudHJpbSgpLnRvTG93ZXJDYXNlKCkgIT09ICdhdXRvJykge1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2UgPSB0aGlzLl9jYW5vbmljYWxpemVTdXBwb3J0ZWRMYW5ndWFnZShjb25maWd1cmVkLCBUVFNfU1VQUE9SVEVEX0xBTkdVQUdFX0JBU0VTKTtcblx0XHRcdGlmIChsYW5ndWFnZSkge1xuXHRcdFx0XHRyZXR1cm4gbGFuZ3VhZ2U7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFt2b2ljZV0gVW5zdXBwb3J0ZWQgYWdlbnRzLnZvaWNlLmxhbmd1YWdlIHZhbHVlICcke2NvbmZpZ3VyZWR9JywgZmFsbGluZyBiYWNrIHRvICR7REVGQVVMVF9MQU5HVUFHRX1gKTtcblx0XHRcdHJldHVybiBERUZBVUxUX0xBTkdVQUdFO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9jYW5vbmljYWxpemVTdXBwb3J0ZWRMYW5ndWFnZSh0aGlzLl93aW5kb3c/Lm5hdmlnYXRvci5sYW5ndWFnZSwgQVNSX1NVUFBPUlRFRF9MQU5HVUFHRV9CQVNFUylcblx0XHRcdD8/IERFRkFVTFRfTEFOR1VBR0U7XG5cdH1cblxuXHRwcml2YXRlIF9jYW5vbmljYWxpemVTdXBwb3J0ZWRMYW5ndWFnZSh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBzdXBwb3J0ZWRCYXNlczogUmVhZG9ubHlTZXQ8c3RyaW5nPik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY2FuZGlkYXRlID0gdmFsdWU/LnRyaW0oKTtcblx0XHRpZiAoIWNhbmRpZGF0ZSB8fCB0eXBlb2YgSW50bC5nZXRDYW5vbmljYWxMb2NhbGVzICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjYW5vbmljYWwgPSBJbnRsLmdldENhbm9uaWNhbExvY2FsZXMoY2FuZGlkYXRlKVswXTtcblx0XHRcdHJldHVybiBzdXBwb3J0ZWRCYXNlcy5oYXMoY2Fub25pY2FsLnNwbGl0KCctJylbMF0pID8gY2Fub25pY2FsIDogdW5kZWZpbmVkO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZW5kU2V0TGFuZ3VhZ2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dzPy5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTiAmJiB0aGlzLl9zZXNzaW9uU3RhcnRlZE9uU29ja2V0KSB7XG5cdFx0XHR0aGlzLl93cy5zZW5kKEpTT04uc3RyaW5naWZ5KHsgdHlwZTogJ3NldF9sYW5ndWFnZScsIGxhbmd1YWdlOiB0aGlzLl9nZXRMYW5ndWFnZSgpIH0pKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciBhIGNvbmZpZ3VyYXRpb24gc2V0dGluZyBoYXMgYW4gZXhwbGljaXQgdXNlci93b3Jrc3BhY2UvYXBwbGljYXRpb25cblx0ICogdmFsdWUsIGFzIG9wcG9zZWQgdG8gZmFsbGluZyBiYWNrIHRvIGl0cyByZWdpc3RlcmVkIGRlZmF1bHQuXG5cdCAqL1xuXHRwcml2YXRlIF9pc0V4cGxpY2l0bHlDb25maWd1cmVkKGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaW5zcGVjdGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdChrZXkpO1xuXHRcdHJldHVybiBpbnNwZWN0ZWQudXNlclZhbHVlICE9PSB1bmRlZmluZWRcblx0XHRcdHx8IGluc3BlY3RlZC51c2VyTG9jYWxWYWx1ZSAhPT0gdW5kZWZpbmVkXG5cdFx0XHR8fCBpbnNwZWN0ZWQudXNlclJlbW90ZVZhbHVlICE9PSB1bmRlZmluZWRcblx0XHRcdHx8IGluc3BlY3RlZC53b3Jrc3BhY2VWYWx1ZSAhPT0gdW5kZWZpbmVkXG5cdFx0XHR8fCBpbnNwZWN0ZWQud29ya3NwYWNlRm9sZGVyVmFsdWUgIT09IHVuZGVmaW5lZFxuXHRcdFx0fHwgaW5zcGVjdGVkLmFwcGxpY2F0aW9uVmFsdWUgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBBc3NlbWJsZSB0aGUgYGB0dXJuX2NvbmZpZ2BgIHdpcmUgb2JqZWN0IGZyb20gdGhlIGBgYWdlbnRzLnZvaWNlLnR1cm4uKmBgXG5cdCAqIHNldHRpbmdzLCBub3JtYWxpemluZyBlYWNoIGludG8gdGhlIHNoYXBlIHRoZSBiYWNrZW5kIGV4cGVjdHMuIFRoZVxuXHQgKiBgYGF1dG9fZW5kX21vZGVgYCBpcyBkZXJpdmVkIGZyb20gdGhlIG90aGVyIHR3byBzZXR0aW5nczogdHJhaWxpbmctc2lsZW5jZVxuXHQgKiBlbmRpbmcgaXMgZW5hYmxlZCB1bmxlc3MgYGBzaWxlbmNlTXNgYCBpcyBgYC0xYGAgKG9yIG90aGVyd2lzZSBub24tcG9zaXRpdmUpLFxuXHQgKiBhbmQgc3RvcC1waHJhc2UgZW5kaW5nIGlzIGVuYWJsZWQgd2hlbiBhdCBsZWFzdCBvbmUgcGhyYXNlIGlzIGNvbmZpZ3VyZWQuXG5cdCAqXG5cdCAqIFdoZW4gaGFuZHMtZnJlZSBtb2RlIChgYGFnZW50cy52b2ljZS5oYW5kc0ZyZWVgYCkgaXMgZGlzYWJsZWQsIHRoZSB0dXJuIGlzXG5cdCAqIG5vdCBzZW50IGF1dG9tYXRpY2FsbHkgYnkgZGVmYXVsdDogdHJhaWxpbmctc2lsZW5jZSBhbmQgc3RvcC1waHJhc2UgZW5kaW5nXG5cdCAqIGFyZSBlYWNoIHN1cHByZXNzZWQgdW5sZXNzIHRoZSBjb3JyZXNwb25kaW5nIHNldHRpbmcgaGFzIGJlZW4gZXhwbGljaXRseVxuXHQgKiBjb25maWd1cmVkLCBzbyBhIHVzZXIgd2hvIG9wdHMgb3V0IG9mIHRoZSBoYW5kcy1mcmVlIGxvb3Aga2VlcHMgbWFudWFsXG5cdCAqIGNvbnRyb2wgb3ZlciB3aGVuIGEgdHVybiBpcyBzZW50LlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0VHVybkNvbmZpZygpOiBJVm9pY2VUdXJuQ29uZmlnIHtcblx0XHRjb25zdCBjZmcgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZTtcblx0XHRjb25zdCBoYW5kc0ZyZWUgPSBjZmcuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2FnZW50cy52b2ljZS5oYW5kc0ZyZWUnKSA9PT0gdHJ1ZTtcblxuXHRcdGNvbnN0IHNpbGVuY2VSYXcgPSBjZmcuZ2V0VmFsdWU8bnVtYmVyPignYWdlbnRzLnZvaWNlLnR1cm4uc2lsZW5jZU1zJyk7XG5cdFx0bGV0IHNpbGVuY2VFbmFibGVkID0gdHlwZW9mIHNpbGVuY2VSYXcgPT09ICdudW1iZXInICYmIHNpbGVuY2VSYXcgPiAwO1xuXHRcdGlmICghaGFuZHNGcmVlICYmICF0aGlzLl9pc0V4cGxpY2l0bHlDb25maWd1cmVkKCdhZ2VudHMudm9pY2UudHVybi5zaWxlbmNlTXMnKSkge1xuXHRcdFx0c2lsZW5jZUVuYWJsZWQgPSBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qgc2lsZW5jZV9tcyA9IHNpbGVuY2VFbmFibGVkID8gTWF0aC5yb3VuZChzaWxlbmNlUmF3KSA6IDgwMDtcblxuXHRcdGNvbnN0IHBocmFzZXNSYXcgPSBjZmcuZ2V0VmFsdWU8c3RyaW5nW10+KCdhZ2VudHMudm9pY2UudHVybi5zdG9wUGhyYXNlcycpO1xuXHRcdGNvbnN0IHN0b3BfcGhyYXNlcyA9IEFycmF5LmlzQXJyYXkocGhyYXNlc1Jhdylcblx0XHRcdD8gcGhyYXNlc1Jhdy5tYXAocCA9PiBTdHJpbmcocCkudHJpbSgpKS5maWx0ZXIocCA9PiBwLmxlbmd0aCA+IDApXG5cdFx0XHQ6IFtdO1xuXHRcdGxldCBwaHJhc2VzRW5hYmxlZCA9IHN0b3BfcGhyYXNlcy5sZW5ndGggPiAwO1xuXHRcdGlmICghaGFuZHNGcmVlICYmICF0aGlzLl9pc0V4cGxpY2l0bHlDb25maWd1cmVkKCdhZ2VudHMudm9pY2UudHVybi5zdG9wUGhyYXNlcycpKSB7XG5cdFx0XHRwaHJhc2VzRW5hYmxlZCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGF1dG9fZW5kX21vZGU6IElWb2ljZVR1cm5Db25maWdbJ2F1dG9fZW5kX21vZGUnXSA9XG5cdFx0XHRzaWxlbmNlRW5hYmxlZCAmJiBwaHJhc2VzRW5hYmxlZCA/ICdib3RoJ1xuXHRcdFx0XHQ6IHNpbGVuY2VFbmFibGVkID8gJ3ZhZCdcblx0XHRcdFx0XHQ6IHBocmFzZXNFbmFibGVkID8gJ3BocmFzZSdcblx0XHRcdFx0XHRcdDogJ29mZic7XG5cblx0XHRyZXR1cm4geyBhdXRvX2VuZF9tb2RlLCBzaWxlbmNlX21zLCBzdG9wX3BocmFzZXM6IHBocmFzZXNFbmFibGVkID8gc3RvcF9waHJhc2VzIDogW10sIHZhZF9nYXRlX2FzcjogdHJ1ZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZFNldFR1cm5Db25maWcoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dzPy5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTikge1xuXHRcdFx0dGhpcy5fd3Muc2VuZChKU09OLnN0cmluZ2lmeSh7IHR5cGU6ICdzZXRfdHVybl9jb25maWcnLCB0dXJuX2NvbmZpZzogdGhpcy5fZ2V0VHVybkNvbmZpZygpIH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRXc1VybCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdhZ2VudHMudm9pY2UuYmFja2VuZFVybCcpO1xuXHRcdGNvbnN0IHVybCA9IHR5cGVvZiBjb25maWd1cmVkID09PSAnc3RyaW5nJyA/IGNvbmZpZ3VyZWQudHJpbSgpIDogJyc7XG5cdFx0cmV0dXJuIHVybCB8fCB0aGlzLl9wcm9kdWN0U2VydmljZS52b2ljZVdzVXJsIHx8ICcnO1xuXHR9XG5cblx0YXN5bmMgY29ubmVjdCh3aW5kb3c6IFdpbmRvdyAmIHR5cGVvZiBnbG9iYWxUaGlzLCBhdXRoVG9rZW4/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl93aW5kb3cgPSB3aW5kb3c7XG5cdFx0dGhpcy5fYXV0aFRva2VuID0gYXV0aFRva2VuO1xuXHRcdHRoaXMuX3JlY29ubmVjdEF0dGVtcHRzID0gMDtcblx0XHR0aGlzLl9jb25uZWN0V2ViU29ja2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIF9jb25uZWN0V2ViU29ja2V0KCk6IHZvaWQge1xuXHRcdGNvbnN0IHdpbiA9IHRoaXMuX3dpbmRvdztcblx0XHRpZiAoIXdpbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJhc2VVcmwgPSB0aGlzLl9nZXRXc1VybCgpO1xuXHRcdGlmICghYmFzZVVybCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW3ZvaWNlXSBObyB2b2ljZSBXZWJTb2NrZXQgVVJMIGNvbmZpZ3VyZWQgKHNldCB2b2ljZVdzVXJsIGluIHByb2R1Y3QuanNvbiBvciBhZ2VudHMudm9pY2UuYmFja2VuZFVybCBpbiBzZXR0aW5ncyknKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdXJsID0gdGhpcy5fYXV0aFRva2VuXG5cdFx0XHQ/IGAke2Jhc2VVcmx9P3Rva2VuPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHRoaXMuX2F1dGhUb2tlbil9YFxuXHRcdFx0OiBiYXNlVXJsO1xuXHRcdGNvbnN0IHdzID0gbmV3IHdpbi5XZWJTb2NrZXQodXJsKTtcblx0XHR0aGlzLl93cyA9IHdzO1xuXHRcdHRoaXMuX3Nlc3Npb25TdGFydGVkT25Tb2NrZXQgPSBmYWxzZTtcblxuXHRcdHdzLm9ub3BlbiA9ICgpID0+IHtcblx0XHRcdHRoaXMuX3JlY29ubmVjdEF0dGVtcHRzID0gMDtcblx0XHRcdHRoaXMuX3JlY29ubmVjdFN0YXJ0ZWRBdCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2lzUmVzdW1pbmcgPSAhIXRoaXMuX2xhc3RTZXNzaW9uSWQ7XG5cdFx0XHR0aGlzLl9zZXNzaW9uU3RhcnRlZE9uU29ja2V0ID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9zZXRDb25uZWN0ZWQodHJ1ZSk7XG5cdFx0XHR0aGlzLl9zdGFydFBpbmcoKTtcblxuXHRcdFx0aWYgKHRoaXMuX2xhc3RTZXNzaW9uSWQpIHtcblx0XHRcdFx0Ly8gUmVjb25uZWN0aW5nIFx1MjAxNCByZXN1bWVfc2Vzc2lvbiB3aXRoIGNvbnRleHQgaXMgc2VudCBieSBzZW5kUmVzdW1lU2Vzc2lvbigpXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHdzLm9ubWVzc2FnZSA9IChldnQ6IE1lc3NhZ2VFdmVudCkgPT4ge1xuXHRcdFx0bGV0IG1zZzoge1xuXHRcdFx0XHR0eXBlOiBzdHJpbmc7XG5cdFx0XHRcdHNlc3Npb25faWQ/OiBzdHJpbmc7XG5cdFx0XHRcdHRleHQ/OiB1bmtub3duO1xuXHRcdFx0XHRhdWRpbz86IHN0cmluZztcblx0XHRcdFx0aXNfZmlyc3RfY2h1bms/OiBib29sZWFuO1xuXHRcdFx0XHRpc19maW5hbD86IGJvb2xlYW47XG5cdFx0XHRcdGNvZGluZ19zZXNzaW9uX2lkPzogc3RyaW5nO1xuXHRcdFx0XHR0cmFuc2NyaXB0Pzogc3RyaW5nO1xuXHRcdFx0XHRkZXRhaWw/OiBzdHJpbmc7XG5cdFx0XHRcdG5hbWU/OiBzdHJpbmc7XG5cdFx0XHRcdGNhbGxfaWQ/OiBzdHJpbmc7XG5cdFx0XHRcdGFyZ3M/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXHRcdFx0XHRzdGF0dXM/OiB1bmtub3duO1xuXHRcdFx0XHRjb21taXR0ZWQ/OiB1bmtub3duO1xuXHRcdFx0XHRyZWFzb24/OiBzdHJpbmc7XG5cdFx0XHRcdHR1cm5faWQ/OiB1bmtub3duO1xuXHRcdFx0XHRyZXZpc2lvbj86IHVua25vd247XG5cdFx0XHRcdG5hcnJhdGlvbl9pZD86IHN0cmluZztcblx0XHRcdFx0cmVxdWVzdF9pZD86IHN0cmluZztcblx0XHRcdFx0Y2hlY2twb2ludF9pZD86IHN0cmluZztcblx0XHRcdFx0c2VxdWVuY2U/OiBudW1iZXI7XG5cdFx0XHRcdG5hcnJhdGlvbl9raW5kPzogc3RyaW5nO1xuXHRcdFx0XHRwbGF5YmFja19pZD86IHN0cmluZztcblx0XHRcdFx0aW50ZXJydXB0ZWRfdHVybl9pZD86IHN0cmluZztcblx0XHRcdFx0ZGlzcG9zaXRpb24/OiBzdHJpbmc7XG5cdFx0XHRcdHJldHJ5YWJsZT86IGJvb2xlYW47XG5cdFx0XHR9O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bXNnID0gSlNPTi5wYXJzZShldnQuZGF0YSBhcyBzdHJpbmcpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0c3dpdGNoIChtc2cudHlwZSkge1xuXHRcdFx0XHRjYXNlICdwb25nJzpcblx0XHRcdFx0XHR0aGlzLl9jbGVhclBvbmdUaW1lb3V0KCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3Nlc3Npb25faW5pdCc6XG5cdFx0XHRcdFx0Ly8gQWRvcHQgdGhlIHNlcnZlcidzIHNlc3Npb24gaWQgZXZlbiB3aGVuIGEgcmVzdW1lIGZhaWxlZCBhbmQgaXRcblx0XHRcdFx0XHQvLyBzdGFydGVkIGEgZnJlc2ggc2Vzc2lvbjsga2VlcGluZyB0aGUgb2xkIGlkIHN0YWxsZWQgcmVjb25uZWN0IChgX2lzUmVzdW1pbmdgKS5cblx0XHRcdFx0XHR0aGlzLl9sYXN0U2Vzc2lvbklkID0gbXNnLnNlc3Npb25faWQ7XG5cdFx0XHRcdFx0dGhpcy5faXNSZXN1bWluZyA9IGZhbHNlO1xuXHRcdFx0XHRcdHRoaXMuX29uU2Vzc2lvbkluaXQuZmlyZSh7IHNlc3Npb25JZDogbXNnLnNlc3Npb25faWQgPz8gJycgfSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3Nlc3Npb25fcmVzdW1lZCc6XG5cdFx0XHRcdFx0dGhpcy5fbGFzdFNlc3Npb25JZCA9IG1zZy5zZXNzaW9uX2lkO1xuXHRcdFx0XHRcdHRoaXMuX2lzUmVzdW1pbmcgPSBmYWxzZTtcblx0XHRcdFx0XHR0aGlzLl9vblNlc3Npb25Jbml0LmZpcmUoeyBzZXNzaW9uSWQ6IG1zZy5zZXNzaW9uX2lkID8/ICcnIH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdzcGVlY2hfc3RhcnRlZCc6XG5cdFx0XHRcdFx0dGhpcy5fb25TcGVlY2hTdGFydGVkLmZpcmUoeyB0dXJuSWQ6IGFzT3B0aW9uYWxTdHJpbmcobXNnLnR1cm5faWQpIH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdiYXJnZV9pbic6XG5cdFx0XHRcdFx0dGhpcy5fb25CYXJnZUluLmZpcmUoe1xuXHRcdFx0XHRcdFx0dHVybklkOiBhc09wdGlvbmFsU3RyaW5nKG1zZy50dXJuX2lkKSA/PyAnJyxcblx0XHRcdFx0XHRcdGludGVycnVwdGVkVHVybklkOiBtc2cuaW50ZXJydXB0ZWRfdHVybl9pZCA/PyAnJyxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnbmFycmF0aW9uX2Fjayc6IHtcblx0XHRcdFx0XHRjb25zdCBkaXNwb3NpdGlvbiA9IG1zZy5kaXNwb3NpdGlvbiA9PT0gJ2J1c3knXG5cdFx0XHRcdFx0XHR8fCBtc2cuZGlzcG9zaXRpb24gPT09ICdpbnZhbGlkJ1xuXHRcdFx0XHRcdFx0fHwgbXNnLmRpc3Bvc2l0aW9uID09PSAnc3VwcHJlc3NlZCdcblx0XHRcdFx0XHRcdD8gbXNnLmRpc3Bvc2l0aW9uXG5cdFx0XHRcdFx0XHQ6ICdhY2NlcHRlZCc7XG5cdFx0XHRcdFx0dGhpcy5fb25OYXJyYXRpb25BY2suZmlyZSh7XG5cdFx0XHRcdFx0XHRuYXJyYXRpb25JZDogbXNnLm5hcnJhdGlvbl9pZCA/PyAnJyxcblx0XHRcdFx0XHRcdGNvZGluZ1Nlc3Npb25JZDogbXNnLmNvZGluZ19zZXNzaW9uX2lkID8/ICcnLFxuXHRcdFx0XHRcdFx0ZGlzcG9zaXRpb24sXG5cdFx0XHRcdFx0XHRyZWFzb246IG1zZy5yZWFzb24sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnbmFycmF0aW9uX3VuYmxvY2tlZCc6XG5cdFx0XHRcdFx0dGhpcy5fb25OYXJyYXRpb25VbmJsb2NrZWQuZmlyZSh7XG5cdFx0XHRcdFx0XHRuYXJyYXRpb25JZDogbXNnLm5hcnJhdGlvbl9pZCA/PyAnJyxcblx0XHRcdFx0XHRcdGNvZGluZ1Nlc3Npb25JZDogbXNnLmNvZGluZ19zZXNzaW9uX2lkID8/ICcnLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICduYXJyYXRpb25faW50ZXJydXB0ZWQnOlxuXHRcdFx0XHRcdHRoaXMuX29uTmFycmF0aW9uSW50ZXJydXB0ZWQuZmlyZSh7XG5cdFx0XHRcdFx0XHRuYXJyYXRpb25JZDogbXNnLm5hcnJhdGlvbl9pZCA/PyAnJyxcblx0XHRcdFx0XHRcdGNvZGluZ1Nlc3Npb25JZDogbXNnLmNvZGluZ19zZXNzaW9uX2lkID8/ICcnLFxuXHRcdFx0XHRcdFx0Li4uKHR5cGVvZiBtc2cucmV0cnlhYmxlID09PSAnYm9vbGVhbicgPyB7IHJldHJ5YWJsZTogbXNnLnJldHJ5YWJsZSB9IDoge30pLFxuXHRcdFx0XHRcdFx0Li4uKG1zZy5yZWFzb24gPyB7IHJlYXNvbjogbXNnLnJlYXNvbiB9IDoge30pLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICd0cmFuc2NyaXB0aW9uJzoge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXR1cyA9IG1zZy5zdGF0dXMgPT09IHVuZGVmaW5lZCA/ICdmaW5hbCcgOiBhc1RyYW5zY3JpcHRpb25TdGF0dXMobXNnLnN0YXR1cyk7XG5cdFx0XHRcdFx0Y29uc3QgdHVybklkID0gbXNnLnR1cm5faWQgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IGFzT3B0aW9uYWxOb25FbXB0eVN0cmluZyhtc2cudHVybl9pZCk7XG5cdFx0XHRcdFx0Y29uc3QgcmV2aXNpb24gPSBtc2cucmV2aXNpb24gPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IGFzVHJhbnNjcmlwdGlvblJldmlzaW9uKG1zZy5yZXZpc2lvbik7XG5cdFx0XHRcdFx0aWYgKCFzdGF0dXMgfHwgKG1zZy50dXJuX2lkICE9PSB1bmRlZmluZWQgJiYgIXR1cm5JZCkgfHwgKG1zZy5yZXZpc2lvbiAhPT0gdW5kZWZpbmVkICYmICghdHVybklkIHx8IHJldmlzaW9uID09PSB1bmRlZmluZWQpKSkge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX29uVHJhbnNjcmlwdGlvbi5maXJlKHtcblx0XHRcdFx0XHRcdHRleHQ6IGFzT3B0aW9uYWxTdHJpbmcobXNnLnRleHQpID8/ICcnLFxuXHRcdFx0XHRcdFx0c3RhdHVzLFxuXHRcdFx0XHRcdFx0Y29tbWl0dGVkOiBhc09wdGlvbmFsU3RyaW5nKG1zZy5jb21taXR0ZWQpID8/ICcnLFxuXHRcdFx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRcdFx0cmV2aXNpb24sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnYXVkaW9fcmVzcG9uc2UnOiB7XG5cdFx0XHRcdFx0Ly8gT2xkIHByZS1zdHJlYW1pbmcgc2VydmVyIChwcmUgUFIgIzQ0MDc2KSBkb2Vzbid0IHNlbmRcblx0XHRcdFx0XHQvLyBgaXNfZmlyc3RfY2h1bmtgIGF0IGFsbC4gVHJlYXQgbWlzc2luZyBmaWVsZCBhcyBUUlVFIHNvXG5cdFx0XHRcdFx0Ly8gc3VwcHJlc3Npb24tY2xlYXJpbmcgaW4gX2VucXVldWVBdWRpbyBzdGlsbCB3b3JrczsgbmV3XG5cdFx0XHRcdFx0Ly8gc3RyZWFtaW5nIHNlcnZlciBhbHdheXMgZW1pdHMgdHJ1ZS9mYWxzZSBleHBsaWNpdGx5LlxuXHRcdFx0XHRcdGNvbnN0IHJlcXVlc3RJZCA9IGFzT3B0aW9uYWxTdHJpbmcobXNnLnJlcXVlc3RfaWQpO1xuXHRcdFx0XHRcdGNvbnN0IGNoZWNrcG9pbnRJZCA9IGlzVm9pY2VDaGVja3BvaW50SWQobXNnLmNoZWNrcG9pbnRfaWQpID8gbXNnLmNoZWNrcG9pbnRfaWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y29uc3Qgc2VxdWVuY2UgPSB0eXBlb2YgbXNnLnNlcXVlbmNlID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNTYWZlSW50ZWdlcihtc2cuc2VxdWVuY2UpICYmIG1zZy5zZXF1ZW5jZSA+IDAgPyBtc2cuc2VxdWVuY2UgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y29uc3QgbmFycmF0aW9uS2luZCA9IG1zZy5uYXJyYXRpb25fa2luZCA9PT0gJ3Jlc3BvbnNlJyB8fCBtc2cubmFycmF0aW9uX2tpbmQgPT09ICdjb25maXJtYXRpb24nIHx8IG1zZy5uYXJyYXRpb25fa2luZCA9PT0gJ2NoZWNrcG9pbnQnID8gbXNnLm5hcnJhdGlvbl9raW5kIGFzIFZvaWNlTmFycmF0aW9uS2luZCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBwbGF5YmFja0lkID0gYXNPcHRpb25hbFN0cmluZyhtc2cucGxheWJhY2tfaWQpO1xuXHRcdFx0XHRcdGlmIChuYXJyYXRpb25LaW5kID09PSAnY2hlY2twb2ludCcpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW3ZvaWNlXSBjaGVja3BvaW50IGF1ZGlvIHJlcXVlc3Q9JHtyZXF1ZXN0SWQgPz8gJ25vbmUnfSBzdGFnZT0ke2NoZWNrcG9pbnRJZCA/PyAnbm9uZSd9IHNlcXVlbmNlPSR7c2VxdWVuY2UgPz8gJ25vbmUnfSBmaXJzdD0ke21zZy5pc19maXJzdF9jaHVuayA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6IEJvb2xlYW4obXNnLmlzX2ZpcnN0X2NodW5rKX0gZmluYWw9JHtCb29sZWFuKG1zZy5pc19maW5hbCl9YCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX29uQXVkaW9SZXNwb25zZS5maXJlKHtcblx0XHRcdFx0XHRcdGF1ZGlvOiBtc2cuYXVkaW8gPz8gJycsXG5cdFx0XHRcdFx0XHRpc0ZpcnN0Q2h1bms6IG1zZy5pc19maXJzdF9jaHVuayA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6IEJvb2xlYW4obXNnLmlzX2ZpcnN0X2NodW5rKSxcblx0XHRcdFx0XHRcdGlzRmluYWw6IG1zZy5pc19maW5hbCA/PyBmYWxzZSxcblx0XHRcdFx0XHRcdGNvZGluZ1Nlc3Npb25JZDogbXNnLmNvZGluZ19zZXNzaW9uX2lkLFxuXHRcdFx0XHRcdFx0dHJhbnNjcmlwdDogbXNnLnRyYW5zY3JpcHQsXG5cdFx0XHRcdFx0XHR0dXJuSWQ6IGFzT3B0aW9uYWxTdHJpbmcobXNnLnR1cm5faWQpLFxuXHRcdFx0XHRcdFx0cmVzcG9uc2VJZDogbXNnLm5hcnJhdGlvbl9pZCA/PyBhc09wdGlvbmFsU3RyaW5nKG1zZy50dXJuX2lkKSxcblx0XHRcdFx0XHRcdC4uLihyZXF1ZXN0SWQgPyB7IHJlcXVlc3RJZCB9IDoge30pLFxuXHRcdFx0XHRcdFx0Li4uKGNoZWNrcG9pbnRJZCA/IHsgY2hlY2twb2ludElkIH0gOiB7fSksXG5cdFx0XHRcdFx0XHQuLi4oc2VxdWVuY2UgIT09IHVuZGVmaW5lZCA/IHsgc2VxdWVuY2UgfSA6IHt9KSxcblx0XHRcdFx0XHRcdC4uLihuYXJyYXRpb25LaW5kID8geyBuYXJyYXRpb25LaW5kIH0gOiB7fSksXG5cdFx0XHRcdFx0XHQuLi4ocGxheWJhY2tJZCA/IHsgcGxheWJhY2tJZCB9IDoge30pLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ3Rvb2xfY2FsbCc6XG5cdFx0XHRcdFx0dGhpcy5fb25Ub29sQ2FsbC5maXJlKHtcblx0XHRcdFx0XHRcdGNhbGxJZDogbXNnLmNhbGxfaWQgPz8gJycsXG5cdFx0XHRcdFx0XHRuYW1lOiBtc2cubmFtZSA/PyAnJyxcblx0XHRcdFx0XHRcdGFyZ3M6IG1zZy5hcmdzID8/IHt9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICd0dXJuX2F1dG9fZW5kZWQnOiB7XG5cdFx0XHRcdFx0Ly8gQmFja2VuZCBlbmRlZCB0aGUgaGVsZCB0dXJuIGl0c2VsZiAoc2VydmVyIFZBRCBzaWxlbmNlIG9yIGFcblx0XHRcdFx0XHQvLyBtYXRjaGVkIHN0b3AgcGhyYXNlKS4gTm9ybWFsaXplIHRoZSByZWFzb24gYW5kIGxldCB0aGVcblx0XHRcdFx0XHQvLyBjb25zdW1lciBzdG9wIGNhcHR1cmUgZm9yIHRoYXQgdHVybjsgaXQgbXVzdCBub3Qgc2VuZCBpdHNcblx0XHRcdFx0XHQvLyBvd24gcHR0X2VuZC5cblx0XHRcdFx0XHRjb25zdCByZWFzb246IElWb2ljZVR1cm5BdXRvRW5kUmVhc29uID0gbXNnLnJlYXNvbiA9PT0gJ3N0b3BfcGhyYXNlJyA/ICdzdG9wX3BocmFzZScgOiAndmFkX3NpbGVuY2UnO1xuXHRcdFx0XHRcdHRoaXMuX29uVHVybkF1dG9FbmRlZC5maXJlKHsgcmVhc29uLCB0dXJuSWQ6IGFzT3B0aW9uYWxTdHJpbmcobXNnLnR1cm5faWQpID8/ICcnIH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ2Vycm9yJzpcblx0XHRcdFx0XHR0aGlzLl9vbkVycm9yLmZpcmUobXNnLmRldGFpbCA/PyAnVW5rbm93biBlcnJvcicpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR3cy5vbmVycm9yID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25FcnJvci5maXJlKCdXZWJTb2NrZXQgZXJyb3InKTtcblx0XHR9O1xuXG5cdFx0d3Mub25jbG9zZSA9IChldnQ6IENsb3NlRXZlbnQpID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFt2b2ljZV0gd3Mub25jbG9zZSBjb2RlPSR7ZXZ0LmNvZGV9IHJlYXNvbj0ke2V2dC5yZWFzb24gPz8gJyd9IHdhc0NsZWFuPSR7ZXZ0Lndhc0NsZWFufWApO1xuXHRcdFx0aWYgKHRoaXMuX3dzID09PSB3cykge1xuXHRcdFx0XHRpZiAoZXZ0LmNvZGUgPT09IDEwMDAgfHwgZXZ0LmNvZGUgPT09IDEwMDEpIHtcblx0XHRcdFx0XHR0aGlzLl9jbGVhbnVwKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRmF0YWwgZXJyb3JzIHRoYXQgc2hvdWxkIE5PVCB0cmlnZ2VyIHJlY29ubmVjdGlvbi4gVGhlc2UgYXJlXG5cdFx0XHRcdC8vIHRlcm1pbmFsOiBlbWl0IGEgZGVkaWNhdGVkIGZhdGFsLWRpc2Nvbm5lY3Qgc2lnbmFsIChkaXN0aW5jdFxuXHRcdFx0XHQvLyBmcm9tIGEgdHJhbnNpZW50IGRyb3ApIHNvIHRoZSBjb250cm9sbGVyIHRlYXJzIGRvd24gdG8gYSBjbGVhbixcblx0XHRcdFx0Ly8gcmVjb3ZlcmFibGUgc3RhdGUgaW5zdGVhZCBvZiBzaG93aW5nIFwiUmVjb25uZWN0aW5nLi4uXCIgZm9yZXZlci5cblx0XHRcdFx0Ly8gVGhlIGNvbW1vbiBjYXVzZSBpcyBhbm90aGVyIHdpbmRvdyB0YWtpbmcgb3ZlciB0aGUgc2luZ2xlIHZvaWNlXG5cdFx0XHRcdC8vIHNlc3Npb24gKGJhY2tlbmQgZXZpY3RzIHRoaXMgb25lIHdpdGggNDAwOCkuXG5cdFx0XHRcdGlmIChldnQuY29kZSA9PT0gNDAwMSB8fCBldnQuY29kZSA9PT0gNDAwOCB8fCBldnQuY29kZSA9PT0gNDAyOSkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW3ZvaWNlXSBmYXRhbCBjbG9zZSBjb2RlICR7ZXZ0LmNvZGV9OiAke2V2dC5yZWFzb259LCBub3QgcmVjb25uZWN0aW5nYCk7XG5cdFx0XHRcdFx0dGhpcy5fb25GYXRhbERpc2Nvbm5lY3QuZmlyZSh7IGNvZGU6IGV2dC5jb2RlLCByZWFzb246IGV2dC5yZWFzb24gPz8gJycgfSk7XG5cdFx0XHRcdFx0dGhpcy5fY2xlYW51cCgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghdGhpcy5fcmVjb25uZWN0U3RhcnRlZEF0KSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVjb25uZWN0U3RhcnRlZEF0ID0gRGF0ZS5ub3coKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGVsYXBzZWQgPSBEYXRlLm5vdygpIC0gdGhpcy5fcmVjb25uZWN0U3RhcnRlZEF0O1xuXHRcdFx0XHRpZiAoZWxhcHNlZCA+PSBNQVhfUkVDT05ORUNUX0RVUkFUSU9OX01TKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbdm9pY2VdIHJlY29ubmVjdCB0aW1lb3V0IGFmdGVyIDMwIG1pbnV0ZXMsIGdpdmluZyB1cCcpO1xuXHRcdFx0XHRcdHRoaXMuX2NsZWFudXAoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9yZWNvbm5lY3RBdHRlbXB0cysrO1xuXHRcdFx0XHR0aGlzLl9zdG9wUGluZygpO1xuXHRcdFx0XHR0aGlzLl93cyA9IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRjb25zdCBkZWxheSA9IHRoaXMuX3JlY29ubmVjdEF0dGVtcHRzIDw9IEZBU1RfUkVUUllfQ09VTlRcblx0XHRcdFx0XHQ/IEZBU1RfUkVUUllfREVMQVlfTVNcblx0XHRcdFx0XHQ6IFNMT1dfUkVUUllfREVMQVlfTVM7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW3ZvaWNlXSB3cyBjbG9zZWQgYWJub3JtYWxseSAoY29kZT0ke2V2dC5jb2RlfSByZWFzb249JHtldnQucmVhc29uIHx8ICdub25lJ30gd2FzQ2xlYW49JHtldnQud2FzQ2xlYW59KTsgcmVjb25uZWN0aW5nIGluICR7ZGVsYXl9bXMgKGF0dGVtcHQgJHt0aGlzLl9yZWNvbm5lY3RBdHRlbXB0c30pYCk7XG5cdFx0XHRcdHRoaXMuX3JlY29ubmVjdFRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fcmVjb25uZWN0VGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5fY29ubmVjdFdlYlNvY2tldCgpO1xuXHRcdFx0XHR9LCBkZWxheSk7XG5cdFx0XHRcdHRoaXMuX3NldENvbm5lY3RlZChmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGRpc2Nvbm5lY3QoKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnW3ZvaWNlXSBkaXNjb25uZWN0KCkgY2FsbGVkJyk7XG5cdFx0aWYgKHRoaXMuX3dzICYmIHRoaXMuX3dzLnJlYWR5U3RhdGUgPCBXZWJTb2NrZXQuQ0xPU0lORykge1xuXHRcdFx0dGhpcy5fd3MuY2xvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fY2xlYW51cCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYW51cCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9wUGluZygpO1xuXHRcdGlmICh0aGlzLl9yZWNvbm5lY3RUaW1lcikge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3JlY29ubmVjdFRpbWVyKTtcblx0XHRcdHRoaXMuX3JlY29ubmVjdFRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY29udGV4dFNlbmRUaW1lcikge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX2NvbnRleHRTZW5kVGltZXIpO1xuXHRcdFx0dGhpcy5fY29udGV4dFNlbmRUaW1lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ0NvbnRleHQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fd3MgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc2Vzc2lvblN0YXJ0ZWRPblNvY2tldCA9IGZhbHNlO1xuXHRcdHRoaXMuX3dpbmRvdyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9sYXN0U2Vzc2lvbklkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2lzUmVzdW1pbmcgPSBmYWxzZTtcblx0XHR0aGlzLl9sYXN0U2VudEJ5SWQuY2xlYXIoKTtcblx0XHR0aGlzLl9pbnZhbGlkYXRlZFNlc3Npb25JZHMuY2xlYXIoKTtcblx0XHR0aGlzLl9zZXRDb25uZWN0ZWQoZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RhcnRQaW5nKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0b3BQaW5nKCk7XG5cdFx0Y29uc3Qgd2luID0gdGhpcy5fd2luZG93ID8/IG1haW5XaW5kb3c7XG5cdFx0dGhpcy5fcGluZ1RpbWVyID0gd2luLnNldEludGVydmFsKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl93cz8ucmVhZHlTdGF0ZSA9PT0gV2ViU29ja2V0Lk9QRU4pIHtcblx0XHRcdFx0dGhpcy5fd3Muc2VuZChKU09OLnN0cmluZ2lmeSh7IHR5cGU6ICdwaW5nJyB9KSk7XG5cdFx0XHRcdHRoaXMuX3BvbmdUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignW3ZvaWNlXSBwb25nIHRpbWVvdXQgXHUyMDE0IHNlcnZlciB1bnJlYWNoYWJsZSwgcmVjb25uZWN0aW5nJyk7XG5cdFx0XHRcdFx0dGhpcy5fd3M/LmNsb3NlKDQwMDAsICdwb25nIHRpbWVvdXQnKTtcblx0XHRcdFx0fSwgUE9OR19USU1FT1VUX01TKTtcblx0XHRcdH1cblx0XHR9LCBQSU5HX0lOVEVSVkFMX01TKTtcblx0fVxuXG5cdHByaXZhdGUgX3N0b3BQaW5nKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9waW5nVGltZXIpIHtcblx0XHRcdCh0aGlzLl93aW5kb3cgPz8gbWFpbldpbmRvdykuY2xlYXJJbnRlcnZhbCh0aGlzLl9waW5nVGltZXIpO1xuXHRcdFx0dGhpcy5fcGluZ1RpbWVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9jbGVhclBvbmdUaW1lb3V0KCk7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhclBvbmdUaW1lb3V0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wb25nVGltZXIpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9wb25nVGltZXIpO1xuXHRcdFx0dGhpcy5fcG9uZ1RpbWVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldENvbm5lY3RlZChjb25uZWN0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNDb25uZWN0ZWQgIT09IGNvbm5lY3RlZCkge1xuXHRcdFx0dGhpcy5faXNDb25uZWN0ZWQgPSBjb25uZWN0ZWQ7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZS5maXJlKGNvbm5lY3RlZCk7XG5cdFx0fVxuXHR9XG5cblx0c2VuZFB0dFN0YXJ0KHR1cm5JZDogc3RyaW5nLCBwYXNzaXZlOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd3M/LnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOKSB7XG5cdFx0XHR0aGlzLl93cy5zZW5kKEpTT04uc3RyaW5naWZ5KHsgdHlwZTogJ3B0dF9zdGFydCcsIHR1cm5faWQ6IHR1cm5JZCwgLi4uKHBhc3NpdmUgPyB7IHBhc3NpdmU6IHRydWUgfSA6IHt9KSB9KSk7XG5cdFx0fVxuXHR9XG5cblx0c2VuZFB0dEF1ZGlvQ2h1bmsoYXVkaW86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl93cz8ucmVhZHlTdGF0ZSA9PT0gV2ViU29ja2V0Lk9QRU4pIHtcblx0XHRcdHRoaXMuX3dzLnNlbmQoSlNPTi5zdHJpbmdpZnkoeyB0eXBlOiAncHR0X2F1ZGlvX2NodW5rJywgYXVkaW8gfSkpO1xuXHRcdH1cblx0fVxuXG5cdHNlbmRQdHRFbmQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dzPy5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTikge1xuXHRcdFx0dGhpcy5fd3Muc2VuZChKU09OLnN0cmluZ2lmeSh7IHR5cGU6ICdwdHRfZW5kJyB9KSk7XG5cdFx0fVxuXHR9XG5cblx0c2VuZFB0dERpYWdub3N0aWModHVybklkOiBzdHJpbmcsIG1ldHJpY3M6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dzPy5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTikge1xuXHRcdFx0dGhpcy5fd3Muc2VuZChKU09OLnN0cmluZ2lmeSh7IHR5cGU6ICdwdHRfZGlhZ25vc3RpYycsIHR1cm5faWQ6IHR1cm5JZCwgbWV0cmljcyB9KSk7XG5cdFx0fVxuXHR9XG5cblx0c2VuZFNlc3Npb25Db250ZXh0KGNvbnRleHQ6IElWb2ljZVNlc3Npb25Db250ZXh0KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0Nvbm5lY3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nQ29udGV4dCA9IGNvbnRleHQ7XG5cdFx0aWYgKHRoaXMuX2NvbnRleHRTZW5kVGltZXIpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9jb250ZXh0U2VuZFRpbWVyKTtcblx0XHR9XG5cdFx0dGhpcy5fY29udGV4dFNlbmRUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29udGV4dFNlbmRUaW1lciA9IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nQ29udGV4dDtcblx0XHRcdHRoaXMuX3BlbmRpbmdDb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHBlbmRpbmcgJiYgdGhpcy5fd3M/LnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOKSB7XG5cdFx0XHRcdHRoaXMuX3NlbmREZWx0YShwZW5kaW5nKTtcblx0XHRcdH1cblx0XHR9LCA1MDApO1xuXHR9XG5cblx0Zmx1c2hTZXNzaW9uQ29udGV4dCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbnRleHRTZW5kVGltZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX2NvbnRleHRTZW5kVGltZXIpO1xuXHRcdHRoaXMuX2NvbnRleHRTZW5kVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmdDb250ZXh0O1xuXHRcdHRoaXMuX3BlbmRpbmdDb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdGlmIChwZW5kaW5nICYmIHRoaXMuX3dzPy5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTikge1xuXHRcdFx0dGhpcy5fc2VuZERlbHRhKHBlbmRpbmcpO1xuXHRcdH1cblx0fVxuXG5cdGludmFsaWRhdGVTZXNzaW9uQ2FjaGUoc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9pbnZhbGlkYXRlZFNlc3Npb25JZHMuYWRkKHNlc3Npb25JZCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZW5kRGVsdGEoY29udGV4dDogSVZvaWNlU2Vzc2lvbkNvbnRleHQpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50SWRzID0gbmV3IFNldChjb250ZXh0LnNlc3Npb25zLm1hcChzID0+IHMuaWQpKTtcblx0XHRjb25zdCByZW1vdmVzID0gWy4uLnRoaXMuX2xhc3RTZW50QnlJZC5rZXlzKCldLmZpbHRlcihpZCA9PiAhY3VycmVudElkcy5oYXMoaWQpKTtcblxuXHRcdC8vIENvbXB1dGUgcGVyLXNlc3Npb24gZmllbGQtbGV2ZWwgcGF0Y2hlcyAoSlNPTiBNZXJnZSBQYXRjaCBzdHlsZSlcblx0XHRjb25zdCB1cHNlcnRzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPltdID0gW107XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGNvbnRleHQuc2Vzc2lvbnMpIHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBzZXNzaW9uIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0XHRjb25zdCBwcmV2ID0gdGhpcy5fbGFzdFNlbnRCeUlkLmdldChzZXNzaW9uLmlkKTtcblx0XHRcdGlmICghcHJldikge1xuXHRcdFx0XHQvLyBOZXcgc2Vzc2lvbiBcdTIwMTQgc2VuZCBhbGwgZmllbGRzXG5cdFx0XHRcdHVwc2VydHMucHVzaChjdXJyZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHBhdGNoOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHsgaWQ6IHNlc3Npb24uaWQgfTtcblx0XHRcdFx0bGV0IGhhc0NoYW5nZXMgPSBmYWxzZTtcblx0XHRcdFx0aWYgKHRoaXMuX2ludmFsaWRhdGVkU2Vzc2lvbklkcy5oYXMoc2Vzc2lvbi5pZCkpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhjdXJyZW50KSkge1xuXHRcdFx0XHRcdFx0aWYgKGtleSAhPT0gJ2lkJykge1xuXHRcdFx0XHRcdFx0XHRwYXRjaFtrZXldID0gY3VycmVudFtrZXldID8/IG51bGw7XG5cdFx0XHRcdFx0XHRcdGhhc0NoYW5nZXMgPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhwcmV2KSkge1xuXHRcdFx0XHRcdFx0aWYgKGtleSAhPT0gJ2lkJyAmJiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChjdXJyZW50LCBrZXkpIHx8IGN1cnJlbnRba2V5XSA9PT0gdW5kZWZpbmVkKSkge1xuXHRcdFx0XHRcdFx0XHRwYXRjaFtrZXldID0gbnVsbDtcblx0XHRcdFx0XHRcdFx0aGFzQ2hhbmdlcyA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIEZpZWxkcyB0aGF0IGNoYW5nZWQgb3Igd2VyZSBhZGRlZFxuXHRcdFx0XHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGN1cnJlbnQpKSB7XG5cdFx0XHRcdFx0XHRpZiAoa2V5ID09PSAnaWQnKSB7IGNvbnRpbnVlOyB9XG5cdFx0XHRcdFx0XHRpZiAoc3RhYmxlU3RyaW5naWZ5KGN1cnJlbnRba2V5XSkgIT09IHN0YWJsZVN0cmluZ2lmeShwcmV2W2tleV0pKSB7XG5cdFx0XHRcdFx0XHRcdHBhdGNoW2tleV0gPSBjdXJyZW50W2tleV07XG5cdFx0XHRcdFx0XHRcdGhhc0NoYW5nZXMgPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBGaWVsZHMgdGhhdCB3ZXJlIHJlbW92ZWQgKHByZXNlbnQgaW4gcHJldiwgYWJzZW50IGluIGN1cnJlbnQpIFx1MjE5MiBudWxsIHBlciBSRkMgNzM5NlxuXHRcdFx0XHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHByZXYpKSB7XG5cdFx0XHRcdFx0XHRpZiAoa2V5ID09PSAnaWQnKSB7IGNvbnRpbnVlOyB9XG5cdFx0XHRcdFx0XHRpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChjdXJyZW50LCBrZXkpIHx8IGN1cnJlbnRba2V5XSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdHBhdGNoW2tleV0gPSBudWxsO1xuXHRcdFx0XHRcdFx0XHRoYXNDaGFuZ2VzID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gYGBhZ2VudF9zdGF0ZV9kZXRhaWxgYCAodGhlIGNvbmZpcm1hdGlvbiBwcm9tcHQgdGV4dCkgYW5kXG5cdFx0XHRcdC8vIGBgbGFzdF9yZXNwb25zZV9zdW1tYXJ5YGAgKHRoZSBhZ2VudCdzIGZpbmFsIHJlcGx5KSBzdHJlYW0gaW5cblx0XHRcdFx0Ly8gb2JzZXJ2YWJsZXMgdGhhdCBtYXkgd29iYmxlIG11bHRpcGxlIHRpbWVzIHdpdGhpbiBhIHNpbmdsZVxuXHRcdFx0XHQvLyBzdGFibGUgYGBhZ2VudF9zdGF0ZWBgLiBXaXRob3V0IHRoaXMgZ3VhcmQsIGVhY2ggd29iYmxlIHNoaXBzXG5cdFx0XHRcdC8vIGEgZGVsdGEgYW5kIHRoZSBCRSByZS1uYXJyYXRlcyB0aGUgc2FtZSBhcHByb3ZhbC9pZGxlIGV2ZW50LlxuXHRcdFx0XHQvLyBUaGV5IGFyZSBhbHJlYWR5IGRlbGl2ZXJlZCBpbmxpbmUgb24gYGBzZXNzaW9uX3N0YXRlX2NoYW5nZWBgXG5cdFx0XHRcdC8vIGZvciByZWFsIHRyYW5zaXRpb25zLCBzbyB3ZSBvbmx5IGxldCB0aGVtIHJpZGUgaW4gYSBjb250ZXh0XG5cdFx0XHRcdC8vIGRlbHRhIHdoZW4gYGBhZ2VudF9zdGF0ZWBgIGl0c2VsZiBpcyBpbiB0aGUgc2FtZSBwYXRjaFxuXHRcdFx0XHQvLyAoaS5lLiBvbiBhbiBhY3R1YWwgc3RhdGUgdHJhbnNpdGlvbikuXG5cdFx0XHRcdGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhdGNoLCAnYWdlbnRfc3RhdGUnKSkge1xuXHRcdFx0XHRcdGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGF0Y2gsICdhZ2VudF9zdGF0ZV9kZXRhaWwnKSkge1xuXHRcdFx0XHRcdFx0ZGVsZXRlIHBhdGNoLmFnZW50X3N0YXRlX2RldGFpbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXRjaCwgJ2xhc3RfcmVzcG9uc2Vfc3VtbWFyeScpKSB7XG5cdFx0XHRcdFx0XHRkZWxldGUgcGF0Y2gubGFzdF9yZXNwb25zZV9zdW1tYXJ5O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBSZWNvbXB1dGUgd2hldGhlciBhbnl0aGluZyBvdGhlciB0aGFuIGlkIHJlbWFpbnNcblx0XHRcdFx0XHRoYXNDaGFuZ2VzID0gT2JqZWN0LmtleXMocGF0Y2gpLnNvbWUoayA9PiBrICE9PSAnaWQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaGFzQ2hhbmdlcykge1xuXHRcdFx0XHRcdHVwc2VydHMucHVzaChwYXRjaCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodXBzZXJ0cy5sZW5ndGggPT09IDAgJiYgcmVtb3Zlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgdHJhY2tpbmcgc3RhdGVcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgY29udGV4dC5zZXNzaW9ucykge1xuXHRcdFx0Y29uc3Qgb2JqOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRcdFx0Zm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMoc2Vzc2lvbiBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KSkge1xuXHRcdFx0XHRpZiAodiAhPT0gdW5kZWZpbmVkKSB7IG9ialtrXSA9IHY7IH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX2xhc3RTZW50QnlJZC5zZXQoc2Vzc2lvbi5pZCwgb2JqKTtcblx0XHRcdHRoaXMuX2ludmFsaWRhdGVkU2Vzc2lvbklkcy5kZWxldGUoc2Vzc2lvbi5pZCk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgaWQgb2YgcmVtb3Zlcykge1xuXHRcdFx0dGhpcy5fbGFzdFNlbnRCeUlkLmRlbGV0ZShpZCk7XG5cdFx0XHR0aGlzLl9pbnZhbGlkYXRlZFNlc3Npb25JZHMuZGVsZXRlKGlkKTtcblx0XHR9XG5cblx0XHR0aGlzLl93cyEuc2VuZChKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHR0eXBlOiAnc2Vzc2lvbl9jb250ZXh0Jyxcblx0XHRcdG1vZGU6ICdkZWx0YScsXG5cdFx0XHR1cHNlcnRzLFxuXHRcdFx0cmVtb3Zlcyxcblx0XHR9KSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBfc2VuZERlbHRhIHVwc2VydHM9WyR7dXBzZXJ0cy5tYXAodSA9PiBgJHtTdHJpbmcodS5pZCkuc2xpY2UoLTgpfToke3UuYWdlbnRfc3RhdGUgPz8gJyhuby1zdGF0ZSknfSR7T2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHUsICdhZ2VudF9zdGF0ZV9kZXRhaWwnKSA/ICcrZGV0YWlsJyA6ICcnfSR7T2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHUsICdsYXN0X3Jlc3BvbnNlX3N1bW1hcnknKSAmJiB1Lmxhc3RfcmVzcG9uc2Vfc3VtbWFyeSA/ICcrc3VtbWFyeScgOiAnJ31gKS5qb2luKCcsICcpfV0gcmVtb3Zlcz0ke3JlbW92ZXMubGVuZ3RofWApO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VlZFRyYWNraW5nKGNvbnRleHQ6IElWb2ljZVNlc3Npb25Db250ZXh0KTogdm9pZCB7XG5cdFx0dGhpcy5fbGFzdFNlbnRCeUlkLmNsZWFyKCk7XG5cdFx0dGhpcy5faW52YWxpZGF0ZWRTZXNzaW9uSWRzLmNsZWFyKCk7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGNvbnRleHQuc2Vzc2lvbnMpIHtcblx0XHRcdGNvbnN0IG9iajogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcblx0XHRcdGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKHNlc3Npb24gYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikpIHtcblx0XHRcdFx0aWYgKHYgIT09IHVuZGVmaW5lZCkgeyBvYmpba10gPSB2OyB9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sYXN0U2VudEJ5SWQuc2V0KHNlc3Npb24uaWQsIG9iaik7XG5cdFx0fVxuXHR9XG5cblx0c2VuZFRvb2xSZXN1bHQoY2FsbElkOiBzdHJpbmcsIHJlc3VsdDogc3RyaW5nIHwgSVZvaWNlRGlzcGF0Y2hSZXN1bHQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd3M/LnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOKSB7XG5cdFx0XHR0aGlzLl93cy5zZW5kKEpTT04uc3RyaW5naWZ5KHsgdHlwZTogJ3Rvb2xfcmVzdWx0JywgY2FsbF9pZDogY2FsbElkLCByZXN1bHQgfSkpO1xuXHRcdH1cblx0fVxuXG5cdHNlbmROYXJyYXRpb25QbGF5YmFja0NvbXBsZXRlKGNvZGluZ1Nlc3Npb25JZDogc3RyaW5nLCBuYXJyYXRpb25JZDogc3RyaW5nLCBwbGF5YmFja0lkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd3M/LnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOICYmIHRoaXMuX3Nlc3Npb25TdGFydGVkT25Tb2NrZXQpIHtcblx0XHRcdHRoaXMuX3dzLnNlbmQoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHR0eXBlOiAnbmFycmF0aW9uX3BsYXliYWNrX2NvbXBsZXRlJyxcblx0XHRcdFx0Y29kaW5nX3Nlc3Npb25faWQ6IGNvZGluZ1Nlc3Npb25JZCxcblx0XHRcdFx0bmFycmF0aW9uX2lkOiBuYXJyYXRpb25JZCxcblx0XHRcdFx0cGxheWJhY2tfaWQ6IHBsYXliYWNrSWQsXG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cmVxdWVzdE5hcnJhdGlvbihjb2RpbmdTZXNzaW9uSWQ6IHN0cmluZywga2luZDogVm9pY2VOYXJyYXRpb25LaW5kLCB0ZXh0OiBzdHJpbmcsIG5hcnJhdGlvbklkPzogc3RyaW5nLCBjaGVja3BvaW50PzogSVZvaWNlQ2hlY2twb2ludE5hcnJhdGlvbk1ldGFkYXRhLCBjb25maXJtYXRpb25UeXBlPzogVm9pY2VDb25maXJtYXRpb25UeXBlLCBwZW5kaW5nPzogeyBwZW5kaW5nSWQ6IHN0cmluZyB9KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBHYXRlIG9uIHNlc3Npb25fY29udGV4dCBoYXZpbmcgYmVlbiBzZW50OiB0aGUgV1MgcHJlc2VydmVzIHNlbmQgb3JkZXIsXG5cdFx0Ly8gc28gdGhlIGJhY2tlbmQgcHJvY2Vzc2VzIHN0YXJ0X3Nlc3Npb24vcmVzdW1lX3Nlc3Npb24gYmVmb3JlIGFueVxuXHRcdC8vIHJlcXVlc3RfbmFycmF0aW9uLiBQcmUtc2Vzc2lvbiB0aGlzIHJldHVybnMgdW5kZWZpbmVkLCBzbyBfbmFycmF0ZSBxdWV1ZXNcblx0XHQvLyBhIHJldHJ5IHRoYXQgb25TZXNzaW9uSW5pdCByZXBsYXlzIG9uY2UgdGhlIHNlc3Npb24gZXhpc3RzLlxuXHRcdGlmICh0aGlzLl93cz8ucmVhZHlTdGF0ZSA9PT0gV2ViU29ja2V0Lk9QRU4gJiYgdGhpcy5fc2Vzc2lvblN0YXJ0ZWRPblNvY2tldCkge1xuXHRcdFx0Ly8gUmV1c2UgYSBjYWxsZXItc3VwcGxpZWQgaWQgKGEgYGJ1c3lgIHJldHJ5KSBzbyB0aGUgYmFja2VuZCBkZWR1cHM7IGVsc2UgbWludCBvbmUuXG5cdFx0XHRjb25zdCBpZCA9IG5hcnJhdGlvbklkID8/IGdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0dGhpcy5fd3Muc2VuZChKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdHR5cGU6ICdyZXF1ZXN0X25hcnJhdGlvbicsXG5cdFx0XHRcdGNvZGluZ19zZXNzaW9uX2lkOiBjb2RpbmdTZXNzaW9uSWQsXG5cdFx0XHRcdGtpbmQsXG5cdFx0XHRcdHRleHQsXG5cdFx0XHRcdG5hcnJhdGlvbl9pZDogaWQsXG5cdFx0XHRcdC4uLihjaGVja3BvaW50ID8ge1xuXHRcdFx0XHRcdHJlcXVlc3RfaWQ6IGNoZWNrcG9pbnQucmVxdWVzdElkLFxuXHRcdFx0XHRcdGNoZWNrcG9pbnRfaWQ6IGNoZWNrcG9pbnQuY2hlY2twb2ludElkLFxuXHRcdFx0XHRcdHNlcXVlbmNlOiBjaGVja3BvaW50LnNlcXVlbmNlLFxuXHRcdFx0XHR9IDoge30pLFxuXHRcdFx0XHQuLi4oa2luZCA9PT0gJ2NvbmZpcm1hdGlvbicgJiYgY29uZmlybWF0aW9uVHlwZSA/IHsgY29uZmlybWF0aW9uX3R5cGU6IGNvbmZpcm1hdGlvblR5cGUgfSA6IHt9KSxcblx0XHRcdFx0Li4uKHBlbmRpbmcgPyB7IHBlbmRpbmdfaWQ6IHBlbmRpbmcucGVuZGluZ0lkIH0gOiB7fSksXG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIHJlcXVlc3RfbmFycmF0aW9uIGtpbmQ9JHtraW5kfSBpZD0ke2NvZGluZ1Nlc3Npb25JZC5zbGljZSgtMzIpfSBuYXJyYXRpb25faWQ9JHtpZC5zbGljZSgwLCA4KX0ke25hcnJhdGlvbklkID8gJyAocmV0cnkpJyA6ICcnfWApO1xuXHRcdFx0aWYgKGNoZWNrcG9pbnQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbdm9pY2VdIGNoZWNrcG9pbnQgc2VudCByZXF1ZXN0PSR7Y2hlY2twb2ludC5yZXF1ZXN0SWR9IHN0YWdlPSR7Y2hlY2twb2ludC5jaGVja3BvaW50SWR9IHNlcXVlbmNlPSR7Y2hlY2twb2ludC5zZXF1ZW5jZX1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpZDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHNlbmRTZXNzaW9uU3RhdGVDaGFuZ2Uoc2Vzc2lvbklkOiBzdHJpbmcsIG5ld1N0YXRlOiBzdHJpbmcsIF9sYWJlbDogc3RyaW5nLCBkZXRhaWw/OiBzdHJpbmcsIGxhc3RSZXNwb25zZVN1bW1hcnk/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd3M/LnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOKSB7XG5cdFx0XHRjb25zdCBwYXlsb2FkOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHsgdHlwZTogJ3Nlc3Npb25fc3RhdGVfY2hhbmdlJywgc2Vzc2lvbl9pZDogc2Vzc2lvbklkLCBuZXdfc3RhdGU6IG5ld1N0YXRlIH07XG5cdFx0XHRpZiAoZGV0YWlsKSB7IHBheWxvYWQuZGV0YWlsID0gZGV0YWlsOyB9XG5cdFx0XHRpZiAobGFzdFJlc3BvbnNlU3VtbWFyeSkgeyBwYXlsb2FkLmxhc3RfcmVzcG9uc2Vfc3VtbWFyeSA9IGxhc3RSZXNwb25zZVN1bW1hcnk7IH1cblx0XHRcdHRoaXMuX3dzLnNlbmQoSlNPTi5zdHJpbmdpZnkocGF5bG9hZCkpO1xuXHRcdH1cblx0fVxuXG5cdHN0b3BTcGVha2luZygpOiB2b2lkIHtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZW5kIHRoZSBzdGFydF9zZXNzaW9uIG1lc3NhZ2Ugd2l0aCB0aGUgZ2l2ZW4gY29udGV4dC5cblx0ICogQ2FsbGVkIGJ5IHRoZSBjb25zdW1lciBhZnRlciBjb25uZWN0KCkgcmVzb2x2ZXMgYW5kIEF1ZGlvQ29udGV4dCBpcyByZWFkeS5cblx0ICpcblx0ICogYGBwcmlvclRpbWVsaW5lYGAgY2FycmllcyBhbiBvcmRlcmVkIHNsaWNlIG9mIGNyb3NzLXNlc3Npb24gZW50cmllc1xuXHQgKiAodm9pY2UgdHVybnMsIHZvaWNlIHRvb2wgY2FsbHMsIGNvZGluZy1zZXNzaW9uIGV2ZW50cywgYW5kIGEgc3ludGhlc2l6ZWRcblx0ICogY29kaW5nLWFnZW50LXJlcGx5IHN1bW1hcnkgcGVyIGFjdGl2ZSBzZXNzaW9uKSBmcm9tIHRoZSBwcmV2aW91cyB2b2ljZVxuXHQgKiBzZXNzaW9uLiBUaGUgQkUgY29uc3VtZXMgaXQgb25jZSBvbiB0aGUgZmlyc3QgY29tbWFuZCB0dXJuIHNvIHRoZSBtb2RlbFxuXHQgKiBjYW4gYW5zd2VyIHJlY2FsbCBxdWVzdGlvbnMgYWNyb3NzIHJlY29ubmVjdHMgd2l0aG91dCBiYWNrZW5kXG5cdCAqIHBlcnNpc3RlbmNlLiBTZWUgYGBJVm9pY2VQcmlvclRpbWVsaW5lRW50cnlgYC5cblx0ICovXG5cdHNlbmRTdGFydFNlc3Npb24oY29udGV4dDogSVZvaWNlU2Vzc2lvbkNvbnRleHQsIG1hY2hpbmVJZDogc3RyaW5nLCBwcmlvclRpbWVsaW5lPzogcmVhZG9ubHkgSVZvaWNlUHJpb3JUaW1lbGluZUVudHJ5W10sIHR1cm5Db25maWdPdmVycmlkZT86IElWb2ljZVR1cm5Db25maWcsIHZvaWNlSW5zdHJ1Y3Rpb25zPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dzPy5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTikge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkNvbnRleHQgPSB7IC4uLmNvbnRleHQsIGRpc3BsYXlfbG9jYWxlOiB0aGlzLl9nZXRMYW5ndWFnZSgpIH07XG5cdFx0XHR0aGlzLl9zZWVkVHJhY2tpbmcoc2Vzc2lvbkNvbnRleHQpO1xuXHRcdFx0Ly8gVGhpcyBjbGllbnQgZHJpdmVzIG5hcnJhdGlvbiBpdHNlbGYgdmlhIGByZXF1ZXN0TmFycmF0aW9uYCwgc28gb3B0IG91dFxuXHRcdFx0Ly8gb2YgdGhlIGJhY2tlbmQncyBkZWZhdWx0IGNvbnRleHQtZGVsdGEgYXV0by1uYXJyYXRpb24gdG8gYXZvaWQgZG91YmxlIG5hcnJhdGlvbi5cblx0XHRcdGNvbnN0IHBheWxvYWQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0geyB0eXBlOiAnc3RhcnRfc2Vzc2lvbicsIHNlc3Npb25fY29udGV4dDogc2Vzc2lvbkNvbnRleHQsIG1hY2hpbmVfaWQ6IG1hY2hpbmVJZCwgdHVybl9jb25maWc6IHR1cm5Db25maWdPdmVycmlkZSA/PyB0aGlzLl9nZXRUdXJuQ29uZmlnKCksIHZvaWNlOiB0aGlzLl9nZXRWb2ljZSgpLCBhdXRvX25hcnJhdGU6IGZhbHNlIH07XG5cdFx0XHRpZiAocHJpb3JUaW1lbGluZSAmJiBwcmlvclRpbWVsaW5lLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cGF5bG9hZC5wcmlvcl90aW1lbGluZSA9IHByaW9yVGltZWxpbmU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodm9pY2VJbnN0cnVjdGlvbnMpIHtcblx0XHRcdFx0cGF5bG9hZC52b2ljZV9pbnN0cnVjdGlvbnMgPSB2b2ljZUluc3RydWN0aW9ucztcblx0XHRcdH1cblx0XHRcdHRoaXMuX3dzLnNlbmQoSlNPTi5zdHJpbmdpZnkocGF5bG9hZCkpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvblN0YXJ0ZWRPblNvY2tldCA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0c2VuZFJlc3VtZVNlc3Npb24oY29udGV4dDogSVZvaWNlU2Vzc2lvbkNvbnRleHQsIG1hY2hpbmVJZDogc3RyaW5nLCB2b2ljZUluc3RydWN0aW9ucz86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl93cz8ucmVhZHlTdGF0ZSA9PT0gV2ViU29ja2V0Lk9QRU4gJiYgdGhpcy5fbGFzdFNlc3Npb25JZCkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkNvbnRleHQgPSB7IC4uLmNvbnRleHQsIGRpc3BsYXlfbG9jYWxlOiB0aGlzLl9nZXRMYW5ndWFnZSgpIH07XG5cdFx0XHR0aGlzLl9zZWVkVHJhY2tpbmcoc2Vzc2lvbkNvbnRleHQpO1xuXHRcdFx0Ly8gYGF1dG9fbmFycmF0ZTogZmFsc2VgIGZvciB0aGUgc2FtZSByZWFzb24gYXMgc3RhcnRfc2Vzc2lvbjogdGhpcyBjbGllbnRcblx0XHRcdC8vIGRyaXZlcyBuYXJyYXRpb24sIHNvIHRoZSBiYWNrZW5kIG11c3Qgbm90IGFsc28gYXV0by1uYXJyYXRlLlxuXHRcdFx0Y29uc3QgcGF5bG9hZDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IHR5cGU6ICdyZXN1bWVfc2Vzc2lvbicsIHNlc3Npb25faWQ6IHRoaXMuX2xhc3RTZXNzaW9uSWQsIHNlc3Npb25fY29udGV4dDogc2Vzc2lvbkNvbnRleHQsIG1hY2hpbmVfaWQ6IG1hY2hpbmVJZCwgdHVybl9jb25maWc6IHRoaXMuX2dldFR1cm5Db25maWcoKSwgdm9pY2U6IHRoaXMuX2dldFZvaWNlKCksIGF1dG9fbmFycmF0ZTogZmFsc2UgfTtcblx0XHRcdGlmICh2b2ljZUluc3RydWN0aW9ucykge1xuXHRcdFx0XHRwYXlsb2FkLnZvaWNlX2luc3RydWN0aW9ucyA9IHZvaWNlSW5zdHJ1Y3Rpb25zO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fd3Muc2VuZChKU09OLnN0cmluZ2lmeShwYXlsb2FkKSk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uU3RhcnRlZE9uU29ja2V0ID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzdWJtaXRGZWVkYmFjayhwYXlsb2FkOiBJVm9pY2VGZWVkYmFja1BheWxvYWQpOiBQcm9taXNlPHsgb2s6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+IHtcblx0XHRjb25zdCBodHRwVXJsID0gdGhpcy5fZ2V0V3NVcmwoKVxuXHRcdFx0LnJlcGxhY2UoJ3dzczovLycsICdodHRwczovLycpXG5cdFx0XHQucmVwbGFjZSgnd3M6Ly8nLCAnaHR0cDovLycpXG5cdFx0XHQucmVwbGFjZSgvXFwvcmVhbHRpbWVcXC92b2ljZSQvLCAnL2ZlZWRiYWNrJyk7XG5cdFx0Y29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9O1xuXHRcdGlmICh0aGlzLl9hdXRoVG9rZW4pIHtcblx0XHRcdGhlYWRlcnNbJ0F1dGhvcml6YXRpb24nXSA9IGBCZWFyZXIgJHt0aGlzLl9hdXRoVG9rZW59YDtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goaHR0cFVybCwge1xuXHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdGZlZWRiYWNrX3RleHQ6IHBheWxvYWQuZmVlZGJhY2tUZXh0LFxuXHRcdFx0XHRcdG1hY2hpbmVfaWQ6IHBheWxvYWQubWFjaGluZUlkLFxuXHRcdFx0XHRcdHVzZXJfaWQ6IHBheWxvYWQudXNlcklkLFxuXHRcdFx0XHRcdHNlc3Npb25faWQ6IHBheWxvYWQuc2Vzc2lvbklkLFxuXHRcdFx0XHRcdHN1Ym1pc3Npb25faWQ6IHBheWxvYWQuc3VibWlzc2lvbklkLFxuXHRcdFx0XHRcdHRyYW5zY3JpcHRfaGlzdG9yeTogcGF5bG9hZC50cmFuc2NyaXB0SGlzdG9yeS5tYXAodCA9PiAoe1xuXHRcdFx0XHRcdFx0cm9sZTogdC5yb2xlLFxuXHRcdFx0XHRcdFx0dGV4dDogdC50ZXh0LFxuXHRcdFx0XHRcdFx0dGltZXN0YW1wOiB0LnRpbWVzdGFtcCxcblx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdFx0Y2xpZW50X3Nlc3Npb25fc3RhdGU6IHBheWxvYWQuY2xpZW50U2Vzc2lvblN0YXRlLFxuXHRcdFx0XHRcdGNsaWVudF9lbnZpcm9ubWVudDogcGF5bG9hZC5jbGllbnRFbnZpcm9ubWVudCxcblx0XHRcdFx0XHR0aW1lc3RhbXA6IHBheWxvYWQudGltZXN0YW1wLFxuXHRcdFx0XHR9KSxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKCFyZXNwb25zZS5vaykge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuXHRcdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBgSFRUUCAke3Jlc3BvbnNlLnN0YXR1c306ICR7dGV4dH1gIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBvazogdHJ1ZSB9O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycikgfTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzY29ubmVjdCgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBzdGFibGVTdHJpbmdpZnkodmFsdWU6IHVua25vd24pOiBzdHJpbmcge1xuXHRpZiAodmFsdWUgPT09IG51bGwgfHwgdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0Jykge1xuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7XG5cdH1cblx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0cmV0dXJuICdbJyArIHZhbHVlLm1hcChzdGFibGVTdHJpbmdpZnkpLmpvaW4oJywnKSArICddJztcblx0fVxuXHRjb25zdCBrZXlzID0gT2JqZWN0LmtleXModmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLnNvcnQoKTtcblx0cmV0dXJuICd7JyArIGtleXMubWFwKGsgPT4gSlNPTi5zdHJpbmdpZnkoaykgKyAnOicgKyBzdGFibGVTdHJpbmdpZnkoKHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtrXSkpLmpvaW4oJywnKSArICd9Jztcbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVZvaWNlQ2xpZW50U2VydmljZSwgVm9pY2VDbGllbnRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFzQjtBQUMvQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQUNoQztBQUFBLEVBQ0M7QUFBQSxFQW9CQTtBQUFBLE9BQ007QUFDUCxTQUFTLG1CQUFtQix5QkFBeUI7QUFFckQsTUFBTSxtQkFBbUI7QUFDekIsTUFBTSxrQkFBa0I7QUFDeEIsTUFBTSxtQkFBbUI7QUFDekIsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSw0QkFBNEIsS0FBSyxLQUFLO0FBQzVDLE1BQU0sK0JBQStCLG9CQUFJLElBQUk7QUFBQSxFQUM1QztBQUFBLEVBQU07QUFBQSxFQUFNO0FBQUEsRUFBTTtBQUFBLEVBQU07QUFBQSxFQUFNO0FBQUEsRUFBTTtBQUFBLEVBQU07QUFBQSxFQUFNO0FBQ2pELENBQUM7QUFDRCxNQUFNLCtCQUErQixvQkFBSSxJQUFJO0FBQUEsRUFDNUM7QUFBQSxFQUFNO0FBQUEsRUFBTTtBQUFBLEVBQU07QUFBQSxFQUFNO0FBQUEsRUFBTTtBQUFBLEVBQU07QUFBQSxFQUFNO0FBQUEsRUFBTTtBQUFBLEVBQU07QUFBQSxFQUFNO0FBQUEsRUFBTTtBQUFBLEVBQ2xFO0FBQUEsRUFBTTtBQUFBLEVBQU07QUFBQSxFQUFNO0FBQUEsRUFBTTtBQUFBLEVBQU07QUFBQSxFQUFNO0FBQUEsRUFBTTtBQUFBLEVBQU07QUFBQSxFQUFNO0FBQUEsRUFBTTtBQUFBLEVBQU07QUFBQSxFQUFNO0FBQ3pFLENBQUM7QUFDRCxNQUFNLG1C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
