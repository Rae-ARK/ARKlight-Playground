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
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { observableValue, autorun, transaction, observableSignalFromEvent } from "../../../../../base/common/observable.js";
import { addDisposableListener, disposableWindowInterval } from "../../../../../base/browser/dom.js";
import { renderAsPlaintext } from "../../../../../base/browser/markdownRenderer.js";
import { alert as ariaAlert } from "../../../../../base/browser/ui/aria/aria.js";
import { localize } from "../../../../../nls.js";
import { disposableTimeout } from "../../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { URI } from "../../../../../base/common/uri.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { isObject } from "../../../../../base/common/types.js";
import { createDecorator } from "../../../../../platform/instantiation/common/instantiation.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
import { CommandsRegistry, ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IAuthenticationService } from "../../../../services/authentication/common/authentication.js";
import { IVoiceTranscriptStore } from "../../../agentsVoice/common/voiceTranscriptStore.js";
import { IVoiceClientService, isVoiceCheckpointId, derivePendingId, VOICE_AGENT_PROGRESS_SETTING } from "../../common/voiceClient/voiceClientService.js";
import { getVoiceConfirmationType, isPendingVoiceQuestionnaireInvocation, isVoiceQuestionnaireInvocation } from "../../common/voiceClient/voiceConfirmation.js";
import { IMicCaptureService, isMicrophonePermissionDeniedError } from "./micCaptureService.js";
import { ITtsPlaybackService } from "./ttsPlaybackService.js";
import { IVoiceToolDispatchService, VoiceToolDispatchService } from "./voiceToolDispatchService.js";
import { IVoicePlaybackService } from "../../common/voicePlaybackService.js";
import { IAgentSessionsService } from "../agentSessions/agentSessionsService.js";
import { AgentSessionStatus } from "../agentSessions/agentSessionsModel.js";
import { toAgentHostBackendSessionUri } from "../agentSessions/agentHost/agentHostSessionUri.js";
import { ChatSendResult, IChatService, IChatToolInvocation, ToolConfirmKind } from "../../common/chatService/chatService.js";
import { getDisplayedQuestionText, getOptionsWithDefaultsFirst } from "../../common/chatService/chatQuestionCarouselHelpers.js";
import { formatQuestionPrompt } from "../../common/voiceClient/voicePendingNarration.js";
import { IChatWidgetService } from "../chat.js";
import { ChatAgentLocation } from "../../common/constants.js";
import { IWorkbenchEnvironmentService } from "../../../../services/environment/common/environmentService.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { INotificationService, Severity } from "../../../../../platform/notification/common/notification.js";
import { IPromptsService } from "../../common/promptSyntax/service/promptsService.js";
function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}
const IVoiceSessionController = createDecorator("voiceSessionController");
let VoiceSessionController = class extends Disposable {
  constructor(voiceClientService, micCaptureService, ttsPlaybackService, voiceToolDispatchService, voicePlaybackService, agentSessionsService, chatService, commandService, authenticationService, voiceTranscriptStore, logService, environmentService, telemetryService, configurationService, accessibilitySignalService, accessibilityService, chatWidgetService, notificationService, promptsService) {
    super();
    this.voiceClientService = voiceClientService;
    this.micCaptureService = micCaptureService;
    this.ttsPlaybackService = ttsPlaybackService;
    this.voiceToolDispatchService = voiceToolDispatchService;
    this.voicePlaybackService = voicePlaybackService;
    this.agentSessionsService = agentSessionsService;
    this.chatService = chatService;
    this.commandService = commandService;
    this.authenticationService = authenticationService;
    this.voiceTranscriptStore = voiceTranscriptStore;
    this.logService = logService;
    this.environmentService = environmentService;
    this.telemetryService = telemetryService;
    this.configurationService = configurationService;
    this.accessibilitySignalService = accessibilitySignalService;
    this.accessibilityService = accessibilityService;
    this.chatWidgetService = chatWidgetService;
    this.notificationService = notificationService;
    this.promptsService = promptsService;
    // --- Observables ---
    this._voiceState = observableValue(this, "idle");
    this.voiceState = this._voiceState;
    this._statusText = observableValue(this, "Tap to start");
    this.statusText = this._statusText;
    this._transcriptTurns = observableValue(this, []);
    this.transcriptTurns = this._transcriptTurns;
    this._isConnected = observableValue(this, false);
    this.isConnected = this._isConnected;
    this._isConnecting = observableValue(this, false);
    this.isConnecting = this._isConnecting;
    this._isReconnecting = observableValue(this, false);
    this.isReconnecting = this._isReconnecting;
    /** Set when the connection closed terminally (e.g. another window took over
     *  the session). Suppresses the reconnect display path so the controller
     *  settles to a clean, restartable state instead of a stuck "Reconnecting...".
     *  Cleared on the next {@link connect}. */
    this._fatalDisconnect = false;
    this._pendingToolConfirmations = observableValue(this, []);
    this.pendingToolConfirmations = this._pendingToolConfirmations;
    /**
     * Session resources whose pending confirmations were dropped at a terminal
     * teardown (disconnect/fatal). The always-on tracker excludes them so it
     * can't repopulate {@link _pendingToolConfirmations} from the still-pending
     * old session before the next {@link connect}, which clears this set.
     */
    this._suppressedConfirmationSessions = observableValue(this, /* @__PURE__ */ new Set());
    this._targetSession = observableValue(this, void 0);
    this.targetSession = this._targetSession;
    // --- Internal state ---
    this._pttHeld = false;
    /**
     * Whether the current held turn's `ptt_start` was passive (a hands-free
     * open mic: auto-listen or barge-in). A passive turn tells the backend not
     * to latch `user_is_speaking`; a deliberate press (non-passive) does latch.
     * Read by {@link _prepareForPlayback} to decide whether aborting the held
     * turn (which sends no `ptt_end`) is safe. Only meaningful while `_pttHeld`.
     */
    this._pttCurrentTurnPassive = false;
    this._pttToggleMode = false;
    /**
     * True while a passive hands-free barge-in listen is streaming during the
     * assistant's playback (opened by `_startBargeInListen`). It is NOT toggle
     * mode — an explicit `pttDown()` promotes this stream into a user-driven
     * interrupt rather than finishing it. Cleared once the turn ends, is
     * promoted, or transitions to a normal listening turn when playback stops.
     */
    this._bargeInListenActive = false;
    /** When true, the auto-listen loop is suppressed (user pressed Stop
     *  Recording). Cleared on the next explicit `pttDown` or on connect. */
    this._autoListenSuppressed = false;
    /**
     * Auto-listen hold taken by UI that must not be talked over (see
     * {@link setAutoListenHeld}). Deliberately separate from
     * `_autoListenSuppressed`, which pttDown, playback prep and disconnect all
     * clear as part of normal turn-taking - a hold has to outlive all of that.
     */
    this._autoListenHeld = false;
    /** Timestamp (ms) until which an incoming `send_to_chat` is dropped after a
     *  discarded turn, so buffered speech from a focus-change discard can't be
     *  misrouted to the newly focused session. Cleared on the next `pttDown`. */
    this._suppressSendToChatUntil = 0;
    /** Armed on a fresh connect (hands-free); consumed on `session_init` to
     *  enter listening once the backend acks the session. */
    this._enterListenOnSessionInit = false;
    this._pttCurrentTurnId = "";
    this._voiceEventDisposables = this._register(new DisposableStore());
    this._voiceAutorunDisposable = this._register(new MutableDisposable());
    /**
     * Watchdog that resets `isConnecting` (and surfaces feedback) if the connect
     * handshake never completes. Armed up front in {@link connect} so a step that
     * hangs (e.g. resolving the GitHub session while a chat request is in flight)
     * can't leave the toolbar spinner stuck indefinitely.
     */
    this._connectWatchdog = this._register(new MutableDisposable());
    this._connectAttemptGeneration = 0;
    this._sessionInitializationGeneration = 0;
    this._autoApprovedSessions = /* @__PURE__ */ new Set();
    this._pttWaitingForPlayback = false;
    /** Guards auto re-listen: only re-arm after a reply has actually played. */
    this._replyPlayedSinceSend = false;
    /** Set after send_to_chat; blocks auto-listen until the reply TTS starts. */
    this._awaitingReplyAudio = false;
    // --- Audio FIFO queue ---
    this._audioQueue = [];
    this._currentPlaybackSessionId = null;
    // True once the currently-playing response has received its final audio
    // chunk. A same-session frame arriving after this marks a NEW response and
    // must be serialized (queued) rather than fast-pathed, or its audio would be
    // appended into the finalized playback turn and dropped past `node.stop()`.
    this._currentPlaybackFinalized = false;
    this._isProcessingQueue = false;
    // True while we're suppressing in-flight assistant audio from the previous
    // turn (e.g. user interrupted with PTT). Cleared the moment a new assistant
    // response begins — signalled by `is_first_chunk` on the audio_response —
    // so the next response plays cleanly. Earlier this flag keyed on
    // `transcript` presence, but the streaming pipeline sends a running-concat
    // transcript on every chunk, so a late chunk from the old turn would have
    // incorrectly cleared the flag.
    this._suppressIncomingAudio = false;
    /** Turn/response ids whose playback was cancelled by barge-in. */
    this._interruptedAudioIds = /* @__PURE__ */ new Set();
    /**
     * True once an embedder drives the active session via `setActiveSessionShown`.
     * Focus/last-shown heuristics are then disabled.
     */
    this._externalActiveSessionMode = false;
    /**
     * Buffered audio for responses that arrived while their session was not the
     * one shown to the user. Keyed by session, each session holds a FIFO list of
     * whole responses (a background session that produces several updates before
     * the user returns keeps ALL of them, in order). Every response is a group of
     * audio chunks plus a `finalized` flag (set on its final chunk) so
     * continuation chunks attach to the still-open response rather than starting a
     * new one. Flushed - all responses, in order - when the session is shown.
     */
    this._deferredResponses = /* @__PURE__ */ new Map();
    /**
     * Maps a backend chat resource string (bare provider scheme, e.g.
     * `copilotcli:/<id>`) to the UI agent-host session resource string
     * (`agent-host-<provider>:/<id>`) that owns it. The voice backend tags a
     * background (unfocused) session's audio with its bare backend id, while the
     * UI - focus tracking, defer/flush buffer keys, and the sessions-list pending
     * indicator - all work in the agent-host resource space. Canonicalizing an
     * incoming id through this map keeps a deferred response's buffer key aligned
     * with the resource we flush on focus, so it is read exactly once when the
     * session becomes focused rather than stranded forever. Rebuilt from the live
     * session list and cleared on disconnect.
     */
    this._uiResourceByBackendId = /* @__PURE__ */ new Map();
    /** Sessions currently showing a pending-response indicator because they are
     *  awaiting confirmation while unfocused (client-driven, no audio needed). */
    this._confirmationPendingSessions = /* @__PURE__ */ new Set();
    /** Narration ids of confirmation prompts whose confirmation was resolved
     *  (e.g. the user pressed Allow) before the narration finished. Any
     *  `audio_response` chunks echoing one of these ids are dropped so a
     *  just-answered approval is never read aloud. Bounded, and an id is
     *  removed once its final chunk arrives. */
    this._cancelledPendingNarrationIds = /* @__PURE__ */ new Set();
    /** Sessions showing a pending-response indicator because a reply COMPLETED
     *  while they were unfocused (client-driven, mirrors the confirmation
     *  indicator). Maps to the response summary to narrate when the session is
     *  focused - stored so playback is reliable even if the model has since
     *  unloaded. Independent of the audio-defer buffer ({@link _deferredResponses}),
     *  which only exists when the backend proactively sent audio. */
    this._pendingResponseSummaries = /* @__PURE__ */ new Map();
    /**
     * Keys (session resource string, or ``''`` for untagged audio) of responses
     * we are currently playing live rather than deferring. Recorded on the first
     * chunk so the remaining chunks of that response follow the same decision and
     * a response is never split between playback and the deferred buffer.
     *
     * A SET rather than a single key so overlapping responses for DIFFERENT
     * sessions each keep their own routing: a live reply for session B must not
     * clear the live route of an in-flight reply for session A (which would send
     * A's continuation chunks down the focus-based fallback). Two concurrent
     * responses for the SAME session still can't be told apart without a backend
     * response/turn id; that remains a known limitation.
     */
    this._liveReplyKeys = /* @__PURE__ */ new Set();
    /**
     * Per-response routing decision, keyed by the backend-echoed `responseId`
     * (see {@link IVoiceAudioResponse.responseId}). A response's fate (`live` vs
     * `deferred`) is decided ONCE, when its first chunk is seen, and every later
     * chunk of that same response follows it - so interleaved responses for
     * different sessions never steal each other's routing (which a single global
     * key did) and a response is never split between playback and the buffer. A
     * deferred entry is flipped to `live` when its session is focused (the buffer
     * is flushed), so post-flush continuation chunks keep playing. Entries are
     * removed on the final chunk. Used only when the backend echoes a responseId;
     * otherwise the legacy session-keyed {@link _liveReplyKeys} path applies.
     */
    this._responseRoutes = /* @__PURE__ */ new Map();
    /**
     * Per-session record of the reply we most recently read for a session (played
     * live or flushed from the deferred buffer): its transcript and when it was
     * read. The backend re-emits a session's reply when that session becomes
     * active (on focus), which would double-read it. We drop a subsequent reply
     * for the same session ONLY when its transcript matches this one within
     * `RENARRATION_DEDUPE_WINDOW_MS` - so a genuinely new reply (different text)
     * always plays, and so does a later identical reply once the window lapses. */
    this._recentlyReadResponse = /* @__PURE__ */ new Map();
    /** In-flight backend re-narrations we are dropping, so continuation chunks are
     *  dropped too (not just the first). Keyed by responseId when the backend
     *  echoes one (so a different same-session response streaming concurrently is
     *  NOT dropped), else by sessionId as a fallback. */
    this._droppingRenarration = /* @__PURE__ */ new Set();
    /** Narration ids this client explicitly requested via {@link _narrate} (the
     *  `narration_id` we sent on `request_narration`, which the backend echoes as
     *  `responseId` on the audio it produces). Audio whose `responseId` is one of
     *  these was solicited by us and must never be classified as an unsolicited
     *  duplicate re-narration, even when its transcript matches content we recently
     *  read (e.g. narrating a completed reply on focus). Ids are pruned when their
     *  stream ends (final chunk) and cleared on disconnect. */
    this._solicitedNarrationIds = /* @__PURE__ */ new Set();
    /**
     * Last reply transcript heard per session (persistent, unlike the windowed
     * `_recentlyReadResponse`). On activation it arms `_recentlyReadResponse` so a
     * backend re-read of a reply we heard earlier is dropped as a re-narration.
     */
    this._lastHeardTranscriptById = /* @__PURE__ */ new Map();
    // --- Session audio cache for replay ---
    this._sessionAudioCache = /* @__PURE__ */ new Map();
    // --- Session state tracking for explicit change notifications ---
    this._prevSessionStates = /* @__PURE__ */ new Map();
    // Sessions the user explicitly cancelled from VS Code UI. We swallow the
    // NEXT state change for each (typically the chat model going `idle`) so the
    // backend doesn't narrate "the session became idle" right after the user
    // already hit Stop. Stored with a safety expiry in case the cancellation
    // never produces a state change.
    this._userCancelledSessions = /* @__PURE__ */ new Map();
    // Per-session watchdog timers that re-flush session_context shortly after
    // a confirmation transition. This is a paranoid mitigation: if the
    // transition's immediate flush is dropped (timer race, debounce timing,
    // or WS buffer hiccup), a second flush ~1.5s later guarantees the BE
    // observes the ``waiting_for_confirmation`` state. Subsequent re-sends
    // are no-ops on the BE because the merge-patch detects no field changes.
    this._confirmationFlushWatchdogs = /* @__PURE__ */ new Map();
    /**
     * Latest state change per session, buffered and flushed once after a short
     * settle window (see {@link _emitPendingStateChanges}) so a rapid
     * ``thinking <-> idle`` replay storm coalesces into a single net emission
     * instead of spamming the backend with contradictory transitions. Each entry
     * also records the burst's baseline (``fromState``/``fromDetail``) so a wobble
     * that returns to its starting state is recognized as net-zero.
     */
    this._pendingStateChanges = /* @__PURE__ */ new Map();
    /** Model refs eagerly loaded for sessions awaiting input (no UI focus needed). */
    this._eagerModelRefs = /* @__PURE__ */ new Map();
    /** Sessions with an in-flight eager model load, to dedupe concurrent loads. */
    this._eagerModelLoading = /* @__PURE__ */ new Set();
    /**
     * Sessions whose ``idle`` transition is being deferred until their chat
     * model loads, so the narration can include ``last_response_summary``.
     * While a session id is in this set we suppress emitting a premature,
     * summary-less ``idle`` to the backend (see _buildSessionContext).
     */
    this._pendingIdleNarration = /* @__PURE__ */ new Set();
    /**
     * Sessions that entered `thinking` during this controller's lifetime and are
     * therefore genuinely awaiting a completion. A summary-only transition (idle
     * state unchanged, but `last_response_summary` appeared/changed) only counts
     * as a NEW reply when the session is in this set - otherwise an OLD summary
     * surfacing because a dormant model was (re)hydrated would be mistaken for a
     * fresh response and wrongly light the sessions-list pending indicator.
     * Armed on an observed idle/waiting→thinking transition (never during eager
     * loading / replay) and consumed once the resulting idle+summary is accepted.
     */
    this._sessionsAwaitingResponseSummary = /* @__PURE__ */ new Set();
    /**
     * Last response summary captured per session WHILE its chat model was
     * resident. Copilot/remote session models are disposed as soon as the user
     * switches away, so a completion that lands while the session is unfocused
     * would otherwise be reported to the backend as a summary-less ``idle`` and
     * never narrated (the eager reload to recover the summary races the switch's
     * re-disposal). Caching the summary here — independent of the model's
     * lifetime — lets the no-model paths still report ``last_response_summary``.
     * Refreshed whenever a resident model exposes a summary; cleared when the
     * session starts a new turn (``thinking``) so a stale reply is never narrated.
     */
    this._lastResponseSummaryById = /* @__PURE__ */ new Map();
    /**
     * The exact text last narrated per session, used to de-duplicate narration
     * requests. Before asking the backend to speak a session's pending item we
     * check this map: an identical text was already spoken (live or on a prior
     * focus), so we skip it — this single guard replaces the old summary-identity
     * dedup, the recently-read window, and the focus/live double-narrate races.
     * Cleared for a session when it starts a new turn (`thinking`) so a repeated
     * identical reply later still narrates.
     */
    this._lastNarratedText = /* @__PURE__ */ new Map();
    /**
     * Narrations that could not be sent because the socket was closed (see
     * {@link _narrate}). Replayed once on the next `session_init` so a reply or
     * confirmation that landed during a disconnect is still spoken on reconnect.
     */
    this._pendingNarrationRetries = /* @__PURE__ */ new Map();
    /**
     * Narrations we requested (got a `narration_id` back) but whose audio has not
     * yet finished arriving. Keyed by that narration id. A request being accepted
     * by the backend is NOT proof the reply was heard - the audio can still be
     * dropped, deferred, or never returned - so we defer marking the reply as
     * narrated ({@link _lastNarratedText}) and clearing its pending indicator
     * until the final audio chunk for this id arrives (see {@link _markNarrationHeard}).
     * A safety timer releases the in-flight guard if no audio ever comes, so a
     * later focus/state event can retry rather than the reply being lost.
     */
    this._pendingSolicitedNarrations = /* @__PURE__ */ new Map();
    this._voiceProgressListeners = this._register(new DisposableMap());
    this._voiceProgressSessionByResponse = /* @__PURE__ */ new Map();
    this._lastSpokenAtBySession = /* @__PURE__ */ new Map();
    /**
     * Narrations the backend bounced (`narration_ack` `busy`) or cancelled
     * (`narration_interrupted`), awaiting retry. Keyed by canonical session key,
     * latest-wins (at most one pending per session). Retried on the
     * `narration_unblocked` nudge and replayed on `session_init`/`session_resumed`,
     * since a dropped socket loses any in-flight nudge. See
     * `_retryDeferredNarration`. Cleared on a new turn (`thinking`) or teardown.
     */
    this._deferredNarrations = /* @__PURE__ */ new Map();
    /**
     * The confirmation detail text last actually HEARD (final audio arrived) per
     * canonical session key. Confirmations are deliberately excluded from
     * {@link _lastNarratedText} (a tool can legitimately re-raise the identical
     * prompt), so this is the per-occurrence "already spoken" marker that stops a
     * still-pending confirmation from being re-narrated on every refocus (see
     * {@link _activateShownSession}). Recorded only once its audio finalizes (in
     * {@link _markNarrationHeard}), so a confirmation that was deferred/dropped and
     * never heard is still retried on focus. Cleared when the session leaves
     * `waiting_for_confirmation` (in the autorun) so a genuinely new confirmation -
     * even with identical text - narrates again.
     */
    this._narratedPending = /* @__PURE__ */ new Map();
    // --- Telemetry tracking ---
    this._telemetrySessionIndex = 0;
    this._telemetryTurnCount = 0;
    this._telemetryReconnectCount = 0;
    this._telemetryFirstConnect = true;
    this._telemetryTtsInterrupted = false;
    /** Last-N cross-session timeline entries — voice turns, voice tool
     * calls, coding-session events, plus a synthesized first-2-sentences
     * summary of the latest Copilot reply per active session. Sent to the
     * BE on the next start_session and then cleared — single-shot recall. */
    this._pendingPriorTimeline = [];
    this._register(this.chatWidgetService.onDidChangeFocusedSession(() => this._onFocusedSessionChanged()));
    for (const widget of this.chatWidgetService.getAllWidgets()) {
      this._trackWidgetSession(widget);
    }
    this._register(this.chatWidgetService.onDidAddWidget((widget) => this._trackWidgetSession(widget)));
    this.voiceToolDispatchService.setDelegate({
      acceptInput: (text) => {
        this.commandService.executeCommand("_chat.voice.acceptInput", text).catch((err) => {
          this.logService.warn("[voice] acceptInput delegate failed:", err);
        });
        return true;
      },
      getCurrentSessionResource: async () => {
        const resourceStr = await this.commandService.executeCommand("_chat.voice.getCurrentSession").catch(() => void 0);
        return resourceStr ? URI.parse(resourceStr) : void 0;
      },
      switchToSession: (resource) => {
        this.commandService.executeCommand("_chat.voice.switchToSession", resource.toString());
      },
      getAutoApprovedSessions: () => {
        return this._autoApprovedSessions;
      },
      addAllAutoApprovedSessions: () => {
        const sessions = this.agentSessionsService.model.sessions.filter((s) => !s.isArchived());
        for (const s of sessions) {
          this._autoApprovedSessions.add(s.resource.toString());
          const model = this.chatService.getSession(s.resource);
          if (model) {
            this._autoApprovePendingTools(model);
          }
        }
      },
      removeAutoApprovedSession: (resource) => {
        this._autoApprovedSessions.delete(resource);
      },
      triggerAutoApproveCheck: () => {
        this._autoApproveCheck();
      }
    });
    this._register(autorun((reader) => {
      const agentSessions = this.agentSessionsService.model.sessions.filter((s) => !s.isArchived());
      const toolConfirmations = [];
      const processedResources = /* @__PURE__ */ new Set();
      const suppressedSessions = this._suppressedConfirmationSessions.read(reader);
      const modelsToCheck = [];
      for (const s of agentSessions) {
        processedResources.add(s.resource.toString());
        this._recordSessionAlias(s.resource);
        const model = this.chatService.getSession(s.resource);
        if (model) {
          modelsToCheck.push({ model, resource: s.resource, label: s.label || "Untitled session" });
        }
      }
      for (const chatModel of this.chatService.chatModels.read(reader)) {
        const key = chatModel.sessionResource.toString();
        if (processedResources.has(key)) {
          continue;
        }
        if (chatModel.getRequests().length === 0) {
          continue;
        }
        processedResources.add(key);
        modelsToCheck.push({ model: chatModel, resource: chatModel.sessionResource, label: chatModel.title || "Chat" });
      }
      for (const { model, resource, label } of modelsToCheck) {
        if (suppressedSessions.has(resource.toString())) {
          continue;
        }
        const lastReq = model.lastRequestObs.read(reader);
        if (lastReq?.response) {
          const pending = lastReq.response.isPendingConfirmation.read(reader);
          if (pending && !this._autoApprovedSessions.has(resource.toString())) {
            const confirmType = this._classifyPendingType(lastReq.response);
            const desc = this._getConfirmationDescription(lastReq.response);
            toolConfirmations.push({
              type: confirmType,
              sessionLabel: label,
              sessionResource: resource,
              description: desc || pending.detail || (confirmType === "input" ? "Needs your input" : "Needs approval"),
              approve: () => {
                if (lastReq.response) {
                  for (const part of lastReq.response.response.value) {
                    if (part.kind === "toolInvocation") {
                      IChatToolInvocation.confirmWith(part, { type: ToolConfirmKind.UserAction });
                    }
                  }
                }
              },
              deny: () => {
                if (lastReq.response) {
                  for (const part of lastReq.response.response.value) {
                    if (part.kind === "toolInvocation") {
                      IChatToolInvocation.confirmWith(part, { type: ToolConfirmKind.Denied });
                    }
                  }
                }
              }
            });
          }
          if (!pending && !this._autoApprovedSessions.has(resource.toString())) {
            for (const part of lastReq.response.response.value) {
              if (part.kind === "toolInvocation") {
                const toolState = part.state.read(reader);
                if (toolState.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
                  const params = toolState.parameters;
                  const questions = params?.["questions"];
                  let desc = "";
                  if (Array.isArray(questions) && questions.length > 0) {
                    desc = questions.map((q) => {
                      const title = q["header"] || q["question"];
                      if (!title) {
                        return "";
                      }
                      const options = q["options"];
                      if (Array.isArray(options) && options.length > 0) {
                        const labels = options.map((o) => o["label"]).filter(Boolean);
                        if (labels.length > 0) {
                          return `${title}: ${labels.join(", ")}`;
                        }
                      }
                      return title;
                    }).filter(Boolean).join("; ");
                  }
                  toolConfirmations.push({
                    type: "input",
                    sessionLabel: label,
                    sessionResource: resource,
                    description: desc || "Needs your input",
                    approve: () => {
                      IChatToolInvocation.confirmWith(part, { type: ToolConfirmKind.UserAction });
                    },
                    deny: () => {
                      IChatToolInvocation.confirmWith(part, { type: ToolConfirmKind.Denied });
                    }
                  });
                  break;
                }
              }
            }
          }
        }
      }
      this._pendingToolConfirmations.set(toolConfirmations, void 0);
    }));
    this._register(CommandsRegistry.registerCommand("_chat.voicePlayback.replay", (_accessor, payload) => {
      const sessionId = payload?.sessionId;
      if (!sessionId) {
        return;
      }
      this._replaySessionAudio(sessionId);
    }));
    this._register(CommandsRegistry.registerCommand("_chat.voicePlayback.stop", (_accessor, payload) => {
      this._stopReplay();
      if (payload?.sessionId) {
        this.voicePlaybackService.notifyPlaybackEnd(URI.parse(payload.sessionId));
      }
    }));
    this._register({ dispose: () => this.disconnect() });
  }
  async connect(window) {
    if (this._isConnecting.get() || this._isConnected.get()) {
      return;
    }
    const connectAttemptGeneration = ++this._connectAttemptGeneration;
    this._window = window;
    this._onFocusedSessionChanged();
    this._fatalDisconnect = false;
    this._suppressedConfirmationSessions.set(/* @__PURE__ */ new Set(), void 0);
    this._isConnecting.set(true, void 0);
    this._statusText.set("Connecting...", void 0);
    this._voiceState.set("idle", void 0);
    this._telemetryConnectStartMs = Date.now();
    this._armConnectWatchdog();
    let authToken;
    try {
      const sessions = await this.authenticationService.getSessions("github");
      if (connectAttemptGeneration !== this._connectAttemptGeneration) {
        return;
      }
      this._userLogin = sessions[0]?.account.label;
      authToken = sessions[0]?.accessToken;
      if (!this._userLogin) {
        this.logService.warn("[voice] no GitHub session found; transcripts will not be persisted");
      } else {
        const lastTurn = (await this.voiceTranscriptStore.loadTurns(this._userLogin, { limit: 1 }))[0];
        if (connectAttemptGeneration !== this._connectAttemptGeneration) {
          return;
        }
        this._lastPersistedTurnId = lastTurn?.turnId;
        try {
          const recent = await this.voiceTranscriptStore.loadTurns(
            this._userLogin,
            { limit: VoiceSessionController.PRIOR_TIMELINE_ENTRY_LIMIT }
          );
          if (connectAttemptGeneration !== this._connectAttemptGeneration) {
            return;
          }
          this._pendingPriorTimeline = this._buildPriorTimeline(recent);
        } catch (err) {
          this.logService.warn("[voice] failed to load prior timeline entries for context", err);
          this._pendingPriorTimeline = [];
        }
      }
    } catch (err) {
      this.logService.warn("[voice] failed to resolve GitHub session", err);
    }
    if (!this._isConnecting.get() || connectAttemptGeneration !== this._connectAttemptGeneration) {
      return;
    }
    this._voiceEventDisposables.clear();
    this._voiceEventDisposables.add(addDisposableListener(this._window, "blur", () => this._onWindowBlur()));
    this._voiceEventDisposables.add(addDisposableListener(this._window, "focus", () => this._onWindowFocus()));
    this._voiceEventDisposables.add(this.micCaptureService.onPttStart((passive) => {
      this.voiceClientService.sendPttStart(this._pttCurrentTurnId, passive);
    }));
    this._voiceEventDisposables.add(this.micCaptureService.onPttAudioChunk((b64) => {
      this.voiceClientService.sendPttAudioChunk(b64);
    }));
    this._voiceEventDisposables.add(this.micCaptureService.onPttEnd(() => {
      this.voiceClientService.sendPttEnd();
    }));
    this._voiceEventDisposables.add(this.micCaptureService.onPttDiagnostic((diag) => {
      this.logService.trace(
        `[voice] ptt.diagnostic turn_id=${diag.turnId} msHeld=${diag.msHeld} chunksSent=${diag.chunksSent} samplesSent=${diag.samplesSent} drainFired=${diag.drainFired} drainChunks=${diag.drainChunks} drainSamples=${diag.drainSamples} drainWindowMs=${diag.drainWindowMs} drainSkippedByMute=${diag.drainSkippedByMute} drainSkippedBySuppression=${diag.drainSkippedBySuppression} postReleaseCallbacks=${diag.postReleaseCallbacks} postReleaseSamples=${diag.postReleaseSamples} postReleaseSkippedByMute=${diag.postReleaseSkippedByMute} postReleaseSkippedBySuppression=${diag.postReleaseSkippedBySuppression} postReleaseWindowMs=${diag.postReleaseWindowMs} releasedDuringAcquire=${diag.releasedDuringAcquire} pttUpWithoutCapture=${diag.pttUpWithoutCapture}`
      );
      this.voiceClientService.sendPttDiagnostic(diag.turnId, {
        ms_held: diag.msHeld,
        chunks_sent: diag.chunksSent,
        samples_sent: diag.samplesSent,
        drain_fired: diag.drainFired,
        drain_chunks: diag.drainChunks,
        drain_samples: diag.drainSamples,
        drain_window_ms: diag.drainWindowMs,
        drain_skipped_by_mute: diag.drainSkippedByMute,
        drain_skipped_by_suppression: diag.drainSkippedBySuppression,
        post_release_callbacks: diag.postReleaseCallbacks,
        post_release_samples: diag.postReleaseSamples,
        post_release_skipped_by_mute: diag.postReleaseSkippedByMute,
        post_release_skipped_by_suppression: diag.postReleaseSkippedBySuppression,
        post_release_window_ms: diag.postReleaseWindowMs,
        released_during_acquire: diag.releasedDuringAcquire,
        ptt_up_without_capture: diag.pttUpWithoutCapture
      });
    }));
    this._voiceEventDisposables.add(this.ttsPlaybackService.onPlaybackStopped(() => {
      const wasInterrupted = this._telemetryTtsInterrupted;
      const listenedToEnd = !wasInterrupted;
      this.telemetryService.publicLog2("voiceTtsListenThrough", {
        listenedToEnd,
        listenedPct: listenedToEnd ? 100 : 50
        // approximation; exact % requires tracking audio position
      });
      this._telemetryTtsInterrupted = false;
      const finishedSessionId = this._currentPlaybackSessionId;
      const samples = this.ttsPlaybackService.getLastPlayedSamples();
      if (samples && finishedSessionId !== null) {
        const cacheKey = finishedSessionId ?? "__generic__";
        this._sessionAudioCache.set(cacheKey, samples);
      }
      this.voicePlaybackService.notifyPlaybackEnd(void 0);
      this._currentPlaybackSessionId = null;
      this._currentPlaybackFinalized = false;
      const finishedResponseId = this._currentPlaybackResponseId;
      this._currentPlaybackResponseId = void 0;
      const finishedNarration = this._currentPlaybackNarration;
      this._currentPlaybackNarration = void 0;
      if (finishedResponseId && !wasInterrupted) {
        const spokenSessionId = finishedSessionId ?? this._shownSessionId();
        if (spokenSessionId) {
          this._lastSpokenAtBySession.set(this._sessionKey(spokenSessionId), Date.now());
          this._notifyCheckpointPlaybackComplete(spokenSessionId, finishedResponseId, finishedNarration);
        }
        this._markNarrationHeard(finishedResponseId);
      } else if (finishedResponseId && wasInterrupted) {
        const pending = this._pendingSolicitedNarrations.get(finishedResponseId);
        if (pending) {
          this._deferInterruptedNarration(finishedResponseId, pending);
        }
      }
      if (this._audioQueue.length > 0) {
        setTimeout(() => this._processQueue(), 500);
      } else {
        if (this._pttHeld) {
          if (this._bargeInListenActive) {
            this._bargeInListenActive = false;
            this._pttToggleMode = true;
          }
          this._voiceState.set("listening", void 0);
          this._statusText.set("Listening...", void 0);
        } else {
          this._voiceState.set("idle", void 0);
          this._statusText.set("Hold to speak...", void 0);
          if (this._pttWaitingForPlayback) {
            this._scheduleDelayedMicStop();
          }
          if (this._isHandsFreeEnabled() && !this._awaitingReplyAudio && this._replyPlayedSinceSend) {
            this._scheduleAutoListen();
          }
        }
      }
    }));
    this._voiceEventDisposables.add(this.voiceClientService.onDidChangeConnectionState(async (connected) => {
      if (connected) {
        const sessionInitializationGeneration = ++this._sessionInitializationGeneration;
        this._armConnectWatchdog();
        const pbCtx = this.ttsPlaybackService.ensureContext(window);
        pbCtx.resume();
        const isResuming = this.voiceClientService.isResuming;
        const now = Date.now();
        const connectMs = this._telemetryConnectStartMs ? now - this._telemetryConnectStartMs : 0;
        if (this._telemetryFirstConnect) {
          this._telemetryFirstConnect = false;
          this.telemetryService.publicLog2("voiceFirstConnect", { timeToConnectMs: connectMs });
        }
        if (isResuming) {
          this._telemetryReconnectCount++;
          const secSinceLast = this._telemetryLastConnectMs ? Math.round((now - this._telemetryLastConnectMs) / 1e3) : 0;
          this.telemetryService.publicLog2("voiceReconnect", { timeSinceLastConnectSec: secSinceLast });
        } else {
          this._telemetrySessionIndex++;
          this._telemetrySessionStart = now;
          this._telemetryTurnCount = 0;
          this._telemetryReconnectCount = 0;
          this.telemetryService.publicLog2("voiceSessionStarted", { sessionIndex: this._telemetrySessionIndex });
        }
        this._telemetryLastConnectMs = now;
        const voiceInstructions = await this.promptsService.getVoiceInstructions(CancellationToken.None);
        if (connectAttemptGeneration !== this._connectAttemptGeneration || sessionInitializationGeneration !== this._sessionInitializationGeneration || !this.voiceClientService.isConnected || !this._isConnecting.get() && !this._isReconnecting.get()) {
          return;
        }
        if (isResuming) {
          this.micCaptureService.stopCapture();
        }
        this.micCaptureService.prepare(window);
        if (this._isHandsFreeEnabled()) {
          try {
            await this.micCaptureService.startCapture(window);
          } catch (err) {
            if (connectAttemptGeneration !== this._connectAttemptGeneration || sessionInitializationGeneration !== this._sessionInitializationGeneration || !this.voiceClientService.isConnected || !this._isConnecting.get() && !this._isReconnecting.get()) {
              return;
            }
            this.logService.warn("[voice] failed to warm microphone capture for hands-free mode; resetting voice mode", err);
            const permissionDenied = isMicrophonePermissionDeniedError(err);
            this._resetFailedConnection(!permissionDenied);
            return;
          }
          if (connectAttemptGeneration !== this._connectAttemptGeneration || sessionInitializationGeneration !== this._sessionInitializationGeneration || !this.voiceClientService.isConnected || !this._isConnecting.get() && !this._isReconnecting.get()) {
            return;
          }
        }
        if (isResuming) {
          this.voiceClientService.sendResumeSession(this._buildSessionContext(), this._getMachineId(), voiceInstructions);
        } else {
          const priorTimeline = this._pendingPriorTimeline;
          this._pendingPriorTimeline = [];
          this.voiceClientService.sendStartSession(this._buildSessionContext(), this._getMachineId(), priorTimeline, void 0, voiceInstructions);
        }
        transaction((tx) => {
          this._isConnecting.set(false, tx);
          this._isReconnecting.set(false, tx);
          this._isConnected.set(true, tx);
        });
        this._connectWatchdog.clear();
        const seededResources = /* @__PURE__ */ new Set();
        for (const s of this.agentSessionsService.model.sessions.filter((ss) => !ss.isArchived())) {
          seededResources.add(s.resource.toString());
          const model = this.chatService.getSession(s.resource);
          const info = model ? this._getAgentStateInfo(model) : void 0;
          const currentState = info?.state ?? (s.status === AgentSessionStatus.InProgress ? "thinking" : s.status === AgentSessionStatus.NeedsInput ? "waiting_for_confirmation" : s.status === AgentSessionStatus.Completed ? "idle" : "unknown");
          if (currentState !== "unknown") {
            this._prevSessionStates.set(s.resource.toString(), { state: currentState, detail: info?.detail ?? "", pendingId: currentState === "waiting_for_confirmation" ? this._pendingIdFor(s.resource.toString()) : "", confirmationType: info?.confirmation_type, lastResponseSummary: info?.last_response_summary ?? "" });
          }
        }
        for (const chatModel of this.chatService.chatModels.get()) {
          const key = chatModel.sessionResource.toString();
          if (seededResources.has(key)) {
            continue;
          }
          if (chatModel.getRequests().length === 0) {
            continue;
          }
          const info = this._getAgentStateInfo(chatModel);
          if (info.state !== "unknown") {
            this._prevSessionStates.set(key, { state: info.state, detail: info.detail ?? "", pendingId: info.state === "waiting_for_confirmation" ? this._pendingIdFor(key) : "", confirmationType: info.confirmation_type, lastResponseSummary: info.last_response_summary ?? "" });
          }
        }
        const sessionChangeListener = this.agentSessionsService.model.onDidChangeSessions(() => {
          this._checkSessionStateChanges();
          this._sendContext();
        });
        const autorunDisposable = autorun((reader) => {
          const agentSessions = this.agentSessionsService.model.sessions.filter((s) => !s.isArchived());
          let needsRecheck = false;
          const stateChanges = [];
          const waitingForConfirmationSessions = [];
          const processedResources = /* @__PURE__ */ new Set();
          const processModel = (model, resource, label) => {
            const sessionId = resource.toString();
            const lastReq = model.lastRequestObs.read(reader);
            if (lastReq?.response) {
              lastReq.response.isIncomplete.read(reader);
              const pending = lastReq.response.isPendingConfirmation.read(reader);
              const confirmationType2 = getVoiceConfirmationType(lastReq.response.response.value);
              if (pending && confirmationType2 === "tool" && this._autoApprovedSessions.has(sessionId)) {
                for (const part of lastReq.response.response.value) {
                  if (part.kind === "toolInvocation") {
                    if (IChatToolInvocation.confirmWith(part, { type: ToolConfirmKind.UserAction })) {
                      needsRecheck = true;
                    }
                  }
                }
              }
              const responseSignal = observableSignalFromEvent(lastReq.response, lastReq.response.onDidChange);
              responseSignal.read(reader);
            }
            const info = this._getAgentStateInfo(model);
            const currentState = this._effectiveResidentState(sessionId, info);
            if (currentState === info.state) {
              this._pendingIdleNarration.delete(sessionId);
            }
            const detail = info.detail;
            const confirmationType = info.confirmation_type;
            const lastResponseSummary = info.last_response_summary;
            this._cacheResponseSummary(sessionId, info.state, lastResponseSummary);
            const prev = this._prevSessionStates.get(sessionId);
            const normalizedSummary = lastResponseSummary ?? "";
            const isStateTransition = prev !== void 0 && prev.state !== currentState && currentState !== "unknown";
            const pendingId = currentState === "waiting_for_confirmation" ? this._pendingIdFor(sessionId) : "";
            const isDetailTransition = !isStateTransition && prev !== void 0 && currentState === "waiting_for_confirmation" && ((detail ?? "") !== prev.detail || pendingId !== prev.pendingId || confirmationType !== prev.confirmationType);
            const isResponseSummaryTransition = !isStateTransition && prev !== void 0 && currentState === "idle" && !!normalizedSummary && normalizedSummary !== prev.lastResponseSummary && this._sessionsAwaitingResponseSummary.has(sessionId);
            const isTransition = isStateTransition || isDetailTransition || isResponseSummaryTransition;
            if (isTransition) {
              this.logService.trace(`[voice] autorun transition id=${sessionId.slice(-32)} ${prev?.state}\u2192${currentState} detailChanged=${isDetailTransition} summaryChanged=${isResponseSummaryTransition} hasDetail=${!!detail}`);
              if (currentState === "thinking" && !this._eagerModelLoading.has(sessionId)) {
                this._clearLastNarratedText(sessionId);
                this._clearDeferred(this._sessionKey(sessionId));
                this._sessionsAwaitingResponseSummary.add(sessionId);
              }
              if (currentState === "idle" && !!normalizedSummary) {
                this._sessionsAwaitingResponseSummary.delete(sessionId);
              }
              const cancelExpiry = this._userCancelledSessions.get(sessionId);
              if (cancelExpiry) {
                this.logService.trace(`[voice] autorun swallowing transition (user-cancelled) id=${sessionId.slice(-32)}`);
                clearTimeout(cancelExpiry);
                this._userCancelledSessions.delete(sessionId);
              } else {
                stateChanges.push({ sessionId, currentState, label, detail, confirmationType, lastResponseSummary, fromState: prev?.state ?? currentState, fromDetail: prev?.detail ?? "", fromConfirmationType: prev?.confirmationType, fromResponseSummary: prev?.lastResponseSummary ?? "", pendingId, fromPendingId: prev?.pendingId ?? "" });
              }
            }
            if (currentState !== "unknown") {
              const rememberedSummary = normalizedSummary || this._lastResponseSummaryById.get(sessionId) || prev?.lastResponseSummary || "";
              this._prevSessionStates.set(sessionId, { state: currentState, detail: detail ?? "", pendingId, confirmationType, lastResponseSummary: rememberedSummary });
              if (currentState !== "waiting_for_confirmation") {
                this._narratedPending.delete(this._sessionKey(sessionId));
                if (prev?.state === "waiting_for_confirmation") {
                  this._stopPendingNarration(sessionId);
                }
              } else if (prev !== void 0 && pendingId !== prev.pendingId) {
                this._narratedPending.delete(this._sessionKey(sessionId));
                this._stopPendingNarration(sessionId);
              }
            }
            if (currentState === "waiting_for_confirmation") {
              waitingForConfirmationSessions.push({ sessionId, label, detail, transition: isTransition });
            }
          };
          for (const s of agentSessions) {
            processedResources.add(s.resource.toString());
            const model = this.chatService.getSession(s.resource);
            if (model) {
              processModel(model, s.resource, s.label || "Untitled session");
            } else {
              const sessionId = s.resource.toString();
              const currentState = s.status === AgentSessionStatus.InProgress ? "thinking" : s.status === AgentSessionStatus.NeedsInput ? "waiting_for_confirmation" : s.status === AgentSessionStatus.Completed ? "idle" : "unknown";
              this._cacheResponseSummary(sessionId, currentState, void 0);
              if (s.status === AgentSessionStatus.NeedsInput) {
                this._ensureModelLoaded(s.resource);
              }
              const prev = this._prevSessionStates.get(sessionId);
              const isStateTransition = prev !== void 0 && prev.state !== currentState && currentState !== "unknown";
              if (isStateTransition && currentState === "thinking") {
                this._sessionsAwaitingResponseSummary.add(sessionId);
              }
              if (prev?.state === "waiting_for_confirmation" && currentState !== "waiting_for_confirmation" && currentState !== "unknown") {
                this._narratedPending.delete(this._sessionKey(sessionId));
                this._stopPendingNarration(sessionId);
              }
              if (isStateTransition && currentState === "idle") {
                const cachedSummary = this._lastResponseSummaryById.get(sessionId);
                if (!cachedSummary) {
                  this._deferIdleNarrationUntilModelLoaded(s.resource);
                  continue;
                }
                this._sessionsAwaitingResponseSummary.delete(sessionId);
                if (!this._userCancelledSessions.has(sessionId)) {
                  stateChanges.push({ sessionId, currentState, label: s.label || "Untitled session", lastResponseSummary: cachedSummary, fromState: prev?.state ?? currentState, fromDetail: prev?.detail ?? "", fromConfirmationType: prev?.confirmationType, fromResponseSummary: prev?.lastResponseSummary ?? "", pendingId: "", fromPendingId: prev?.pendingId ?? "" });
                }
                this._prevSessionStates.set(sessionId, { state: currentState, detail: "", pendingId: "", lastResponseSummary: cachedSummary ?? "" });
                continue;
              }
              if (isStateTransition) {
                const cancelExpiry = this._userCancelledSessions.get(sessionId);
                if (cancelExpiry) {
                  clearTimeout(cancelExpiry);
                  this._userCancelledSessions.delete(sessionId);
                } else {
                  stateChanges.push({ sessionId, currentState, label: s.label || "Untitled session", fromState: prev?.state ?? currentState, fromDetail: prev?.detail ?? "", fromConfirmationType: prev?.confirmationType, fromResponseSummary: prev?.lastResponseSummary ?? "", pendingId: "", fromPendingId: prev?.pendingId ?? "" });
                }
              }
              if (currentState !== "unknown") {
                const rememberedSummary = this._lastResponseSummaryById.get(sessionId) || prev?.lastResponseSummary || "";
                this._prevSessionStates.set(sessionId, { state: currentState, detail: "", pendingId: "", lastResponseSummary: rememberedSummary });
                if (currentState !== "waiting_for_confirmation") {
                  this._narratedPending.delete(this._sessionKey(sessionId));
                }
              }
              if (currentState === "waiting_for_confirmation") {
                waitingForConfirmationSessions.push({ sessionId, label: s.label || "Untitled session", detail: void 0, transition: isStateTransition });
              }
            }
          }
          for (const chatModel of this.chatService.chatModels.read(reader)) {
            const key = chatModel.sessionResource.toString();
            if (processedResources.has(key)) {
              continue;
            }
            if (chatModel.getRequests().length === 0) {
              continue;
            }
            processedResources.add(key);
            processModel(chatModel, chatModel.sessionResource, chatModel.title || "Chat");
          }
          if (needsRecheck) {
            setTimeout(() => this._autoApproveCheck(), 500);
          }
          this._pruneSessionCaches(processedResources);
          if (stateChanges.length > 0) {
            for (const change of stateChanges) {
              const existing = this._pendingStateChanges.get(change.sessionId);
              this._pendingStateChanges.set(change.sessionId, existing ? { ...change, fromState: existing.fromState, fromDetail: existing.fromDetail, fromConfirmationType: existing.fromConfirmationType, fromResponseSummary: existing.fromResponseSummary, fromPendingId: existing.fromPendingId } : change);
            }
            this._scheduleStateChangeEmit();
          } else {
            this._sendContext();
          }
          for (const w of waitingForConfirmationSessions) {
            this._armConfirmationFlushWatchdog(w.sessionId, w.label, w.transition);
          }
          const stillWaiting = new Set(waitingForConfirmationSessions.map((w) => w.sessionId));
          this._reconcileConfirmationIndicators(stillWaiting);
          for (const id of [...this._confirmationFlushWatchdogs.keys()]) {
            if (!stillWaiting.has(id)) {
              const t = this._confirmationFlushWatchdogs.get(id);
              if (t) {
                clearTimeout(t);
              }
              this._confirmationFlushWatchdogs.delete(id);
            }
          }
          for (const id of [...this._eagerModelRefs.keys()]) {
            if (!stillWaiting.has(id)) {
              this._eagerModelRefs.get(id).dispose();
              this._eagerModelRefs.delete(id);
            }
          }
        });
        const connectionDisposables = new DisposableStore();
        connectionDisposables.add(sessionChangeListener);
        connectionDisposables.add(autorunDisposable);
        connectionDisposables.add(disposableWindowInterval(this._window, () => this._checkSessionStateChanges(), 5e3));
        this._voiceAutorunDisposable.value = connectionDisposables;
        this.micCaptureService.isMuted = false;
        this._statusText.set("Hold to speak...", void 0);
        this._voiceState.set("idle", void 0);
        this._enterListenOnSessionInit = this._shouldEnterListenOnSessionInit(isResuming);
        this.logService.trace(`[voice] connected: isResuming=${isResuming} handsFree=${this._isHandsFreeEnabled()} armListen=${this._enterListenOnSessionInit}`);
        if (this._enterListenOnSessionInit) {
          this._voiceEventDisposables.add(disposableTimeout(() => {
            if (this._enterListenOnSessionInit && this._isConnected.get()) {
              this.logService.trace("[voice] session_init not seen within 750ms; entering listening via fallback");
              this._enterListenOnSessionInit = false;
              this._enterAutoListen("connect");
            }
          }, 750));
        }
      } else {
        this._sessionInitializationGeneration++;
        if (this._fatalDisconnect) {
        } else if (!this.voiceClientService.willReconnect) {
          this.disconnect();
        } else if (this._isConnected.get()) {
          this._onConnectionLost();
        } else {
          this.micCaptureService.stopCapture();
          transaction((tx) => {
            this._isConnecting.set(false, tx);
            this._isReconnecting.set(true, tx);
          });
          this._voiceState.set("idle", void 0);
          this._statusText.set("Reconnecting...", void 0);
        }
      }
    }));
    this._voiceEventDisposables.add(this.voiceClientService.onSessionInit(() => {
      this.logService.trace(`[voice] session_init received; armListen=${this._enterListenOnSessionInit} pendingRetries=${this._pendingNarrationRetries.size} deferredNarrations=${this._deferredNarrations.size}`);
      let narrated = false;
      if (this._pendingNarrationRetries.size > 0) {
        const retries = [...this._pendingNarrationRetries.entries()];
        this._pendingNarrationRetries.clear();
        for (const [sessionId, item] of retries) {
          narrated = this._retryPendingNarration(sessionId, item) || narrated;
        }
      }
      if (this._deferredNarrations.size > 0) {
        const deferredKeys = [...this._deferredNarrations.keys()];
        for (const sessionKey of deferredKeys) {
          narrated = this._retryDeferredNarration(sessionKey) || narrated;
        }
      }
      if (this._enterListenOnSessionInit && !narrated) {
        this._enterListenOnSessionInit = false;
        this._enterAutoListen("connect");
      } else if (narrated) {
        this._enterListenOnSessionInit = false;
      }
    }));
    this._voiceEventDisposables.add(this.voiceClientService.onBargeIn((e) => this._handleBargeIn(e)));
    this._voiceEventDisposables.add(this.voiceClientService.onNarrationAck((e) => {
      this._handleNarrationAck(e);
    }));
    this._voiceEventDisposables.add(this.voiceClientService.onNarrationUnblocked((e) => {
      this._retryDeferredNarration(this._sessionKey(e.codingSessionId), e.narrationId || void 0);
    }));
    this._voiceEventDisposables.add(this.voiceClientService.onNarrationInterrupted((e) => {
      this._handleNarrationInterrupted(e);
    }));
    this._voiceEventDisposables.add(this.voiceClientService.onSpeechStarted((event) => {
      this._clearAutoListenTimer();
      this._interruptAssistantPlayback();
      const turnId = event.turnId || this._pttCurrentTurnId;
      if (turnId && this._transcriptionTurnState?.turnId !== turnId) {
        this._beginTranscriptionTurn(turnId);
      }
      this._startUserTurn();
    }));
    this._voiceEventDisposables.add(this.voiceClientService.onTurnAutoEnded((e) => this._handleTurnAutoEnded(e)));
    this._voiceEventDisposables.add(this.voiceClientService.onTranscription((e) => this._handleTranscription(e)));
    this._voiceEventDisposables.add(this.voiceClientService.onAudioResponse((e) => {
      if (this._isInterruptedAudio(e)) {
        return;
      }
      const solicitedNarration = e.responseId ? this._pendingSolicitedNarrations.get(e.responseId) : void 0;
      const echoedCheckpoint = e.requestId && e.checkpointId && e.sequence !== void 0 ? { requestId: e.requestId, checkpointId: e.checkpointId, sequence: e.sequence } : void 0;
      const narrationKind = e.narrationKind ?? solicitedNarration?.kind;
      const playbackNarration = narrationKind ? {
        kind: narrationKind,
        checkpoint: echoedCheckpoint ?? solicitedNarration?.checkpoint,
        playbackId: e.playbackId
      } : void 0;
      const isCheckpointNarration = playbackNarration?.kind === "checkpoint";
      if (isCheckpointNarration && e.isFinal) {
        this.logService.trace(`[voice][checkpoint] received narration_id=${e.responseId} request_id=${playbackNarration.checkpoint?.requestId ?? "<unknown>"} phase=${playbackNarration.checkpoint?.checkpointId ?? "<unknown>"} sequence=${playbackNarration.checkpoint?.sequence ?? 0} playback_id=${playbackNarration.playbackId ?? "<none>"} spoken=${JSON.stringify(e.transcript ?? "")}`);
      }
      if (e.isFirstChunk && this._telemetryPttUpMs) {
        const ttft = this._telemetryFirstTranscriptionMs && this._telemetryPttDownMs ? this._telemetryFirstTranscriptionMs - this._telemetryPttDownMs : 0;
        const e2e = Date.now() - this._telemetryPttUpMs;
        this.telemetryService.publicLog2("voiceLatency", {
          timeToFirstTranscriptionMs: ttft,
          endToEndTurnMs: e2e
        });
        this._telemetryPttUpMs = void 0;
      }
      const codingSessionId = this._canonicalSessionId(e.codingSessionId);
      if (e.responseId !== void 0 && this._cancelledPendingNarrationIds.has(e.responseId)) {
        if (e.isFinal) {
          this._cancelledPendingNarrationIds.delete(e.responseId);
        }
        return;
      }
      if (e.audio) {
        this._markSolicitedNarrationAudioStarted(e.responseId);
      }
      if (isCheckpointNarration && solicitedNarration && e.isFinal && !e.audio && !solicitedNarration.hasReceivedAudio) {
        if (e.responseId) {
          this._clearPendingSolicitedNarration(e.responseId, solicitedNarration);
          this._solicitedNarrationIds.delete(e.responseId);
          this._responseRoutes.delete(e.responseId);
        }
        return;
      }
      const isRenarration = this._isRenarration(e.responseId, codingSessionId, e.transcript, e.isFirstChunk, e.isFinal);
      const defer = isRenarration ? false : this._shouldDeferResponseStream(e.responseId, codingSessionId, e.isFirstChunk);
      if (e.isFirstChunk || e.isFinal) {
        this.logService.trace(`[voice] audio_response codingSessionId=${codingSessionId ?? "<none>"} responseId=${e.responseId?.slice(0, 8) ?? "<none>"} shown=${this._shownSessionId() ?? "<none>"} focused=${this._getFocusedSessionId() ?? "<none>"} external=${this._activeSessionShown ?? "<none>"} awaiting=${this._awaitingReplyForSession ?? "<none>"} isFirstChunk=${e.isFirstChunk} isFinal=${e.isFinal} suppress=${this._suppressIncomingAudio} renarration=${isRenarration} defer=${defer}`);
      }
      if (isRenarration) {
        this.logService.trace(`[voice] dropping re-narration for session=${codingSessionId} responseId=${e.responseId?.slice(0, 8) ?? "<none>"} isFirstChunk=${e.isFirstChunk} isFinal=${e.isFinal}`);
      } else if (defer && isCheckpointNarration) {
        if (e.responseId && solicitedNarration) {
          this._clearPendingSolicitedNarration(e.responseId, solicitedNarration);
          this._solicitedNarrationIds.delete(e.responseId);
        }
        return;
      } else if (defer) {
        this._deferResponse(codingSessionId, e.audio, e.isFirstChunk, e.isFinal, e.transcript, e.responseId, e.turnId);
      } else {
        if (e.audio && !isCheckpointNarration) {
          this._preemptCheckpointPlayback();
        }
        if (e.isFirstChunk && codingSessionId && this._deferredResponses.has(codingSessionId) && !this._deferredBufferHasResponse(codingSessionId, e.responseId)) {
          this._flushDeferredResponse(codingSessionId);
        }
        this._enqueueAudio(codingSessionId, e.audio, e.isFirstChunk, e.isFinal, e.transcript, e.responseId, playbackNarration);
        if (e.isFinal) {
          this._liveReplyKeys.delete(codingSessionId ?? "");
          const heardSessionId = codingSessionId ?? this._awaitingReplyForSession ?? this._shownSessionId();
          if (!isCheckpointNarration && heardSessionId && e.transcript) {
            const heard = this._normalizeTranscript(e.transcript);
            if (heard) {
              const heardKey = this._sessionKey(heardSessionId);
              this._lastHeardTranscriptById.set(heardKey, heard);
              this._recentlyReadResponse.set(heardKey, { transcript: heard, at: Date.now() });
            }
          }
        }
      }
      if (!isCheckpointNarration && e.isFinal && e.transcript) {
        this._persistTurn("assistant", e.transcript);
      }
      if (e.isFinal && e.responseId) {
        this._responseRoutes.delete(e.responseId);
      }
    }));
    this._voiceEventDisposables.add(this.voiceClientService.onToolCall((e) => {
      this.logService.trace(`[voice] tool_call received name=${e.name} coding_session_id=${typeof e.args?.["coding_session_id"] === "string" ? String(e.args["coding_session_id"]).slice(-32) : "<none>"} activeId=${this._getActiveSessionId()?.slice(-32) ?? "<none>"}`);
      const allowedTools = [
        "send_to_chat",
        "get_session_info",
        "get_session_changes",
        "get_session_thread",
        "respond_to_session",
        "auto_approve_session",
        "revoke_auto_approve",
        "focus_session"
      ];
      if (e.name === "send_to_chat") {
        if (Date.now() < this._suppressSendToChatUntil) {
          this.logService.trace("[voice] dropping send_to_chat: turn discarded on focus change");
          this.voiceClientService.sendToolResult(e.callId, "ok");
          return;
        }
        const rawText = typeof e.args?.["text"] === "string" ? e.args["text"] : "";
        const text = this._stripStopPhrase(rawText);
        if (text !== rawText && e.args) {
          e.args["text"] = text;
        }
        this._statusText.set(VoiceToolDispatchService.getActionLabel(e.name), void 0);
        this._persistEntry("agent_tool_call", this._renderToolCallSummary(e.name, e.args), {
          toolName: e.name,
          toolArgs: e.args
        });
        this._setAwaitingReply();
        const sendPromise = text.trim() ? this._sendTranscriptionToChat(text) : Promise.resolve();
        sendPromise.finally(() => {
          this.voiceClientService.sendToolResult(e.callId, "ok");
          this._voiceState.set("idle", void 0);
          this._statusText.set("Hold to speak...", void 0);
          this._sendContext();
        });
        return;
      }
      if (allowedTools.includes(e.name)) {
        const passiveTools = ["get_session_info", "get_session_changes", "get_session_thread"];
        if (passiveTools.includes(e.name)) {
          this.voiceToolDispatchService.dispatchToolCall(e).then((result) => {
            this.voiceClientService.sendToolResult(e.callId, result);
          }, (err) => {
            this.logService.error(`[voice] passive tool ${e.name} dispatch failed`, err);
            this.voiceClientService.sendToolResult(e.callId, "error");
          });
          return;
        }
        this._statusText.set(VoiceToolDispatchService.getActionLabel(e.name), void 0);
        this._persistEntry("agent_tool_call", this._renderToolCallSummary(e.name, e.args), {
          toolName: e.name,
          toolArgs: e.args
        });
        if (this._pttHeld) {
          this._finishPtt();
        }
        this._suppressIncomingAudio = false;
        this._setAwaitingReply();
        const settle = () => {
          this._voiceState.set("idle", void 0);
          this._statusText.set("Hold to speak...", void 0);
          this._sendContext();
        };
        if (e.name === "respond_to_session") {
          const response = e.args?.["response"];
          const responseType = response && typeof response === "object" && !Array.isArray(response) ? response["type"] : void 0;
          this.voiceToolDispatchService.respondToSession(e).then((result) => {
            this.logService.trace(`[voice] respond_to_session type=${String(responseType)} ok=${result.ok} reason=${result.reason ?? "<none>"} coding_session_id=${typeof e.args?.["coding_session_id"] === "string" ? String(e.args["coding_session_id"]).slice(-32) : "<none>"}`);
            if (responseType === "approve" || responseType === "reject") {
              this.telemetryService.publicLog2("voiceToolApproval", {
                toolName: e.name,
                approved: responseType === "approve"
              });
            }
            this.voiceClientService.sendToolResult(e.callId, result);
            settle();
          }, (err) => {
            this.logService.error(`[voice] respond_to_session dispatch failed`, err);
            this.voiceClientService.sendToolResult(e.callId, { ok: false, reason: "unsupported" });
            settle();
          });
          return;
        }
        this.voiceToolDispatchService.dispatchToolCall(e).then((result) => {
          this.voiceClientService.sendToolResult(e.callId, result);
          settle();
        }, (err) => {
          this.logService.error(`[voice] tool ${e.name} dispatch failed`, err);
          this.voiceClientService.sendToolResult(e.callId, "error");
          settle();
        });
      } else {
        this.voiceClientService.sendToolResult(e.callId, "ok");
      }
    }));
    this._voiceEventDisposables.add(this.voiceClientService.onError((detail) => {
      if (!this._isConnecting.get()) {
        this._voiceState.set("error", void 0);
        this._statusText.set(`Error: ${detail}`, void 0);
      }
    }));
    this._voiceEventDisposables.add(this.voiceClientService.onFatalDisconnect((e) => {
      this._handleFatalDisconnect(e.code, e.reason);
    }));
    await this.voiceClientService.connect(window, authToken);
    if (!this._isConnecting.get() || connectAttemptGeneration !== this._connectAttemptGeneration) {
      return;
    }
    this._armConnectWatchdog();
  }
  /**
   * Arms (or re-arms) the watchdog that resets voice mode if the connect
   * handshake never completes. Without this, a hung connect step leaves the
   * toolbar spinner spinning forever with no way to recover; on timeout we drop
   * back to a disconnected state and tell the user so they can retry.
   */
  _armConnectWatchdog() {
    this._connectWatchdog.value = disposableTimeout(() => {
      if (!this._isConnecting.get() && !this._isReconnecting.get() || this._isConnected.get()) {
        return;
      }
      this.logService.warn("[voice] connect handshake timed out; resetting voice mode");
      this._resetFailedConnection();
    }, VoiceSessionController._CONNECT_TIMEOUT_MS);
  }
  _resetFailedConnection(notifyUser = true) {
    this.disconnect();
    if (notifyUser) {
      this.notificationService.notify({
        severity: Severity.Warning,
        message: localize("voice.connectFailed", "Voice mode could not connect. Please try again.")
      });
    }
  }
  /**
   * Exclude the currently-pending confirmation sessions from the always-on
   * tracker until the next {@link connect}, so a terminal teardown's cleared
   * snapshot can't be repopulated from the still-pending old session.
   */
  _suppressPendingConfirmationsUntilConnect() {
    const suppressed = new Set(this._suppressedConfirmationSessions.get());
    for (const tc of this._pendingToolConfirmations.get()) {
      suppressed.add(tc.sessionResource.toString());
    }
    this._suppressedConfirmationSessions.set(suppressed, void 0);
  }
  disconnect(source = "internal") {
    this._connectAttemptGeneration++;
    const shouldPlayStoppedSignal = source === "explicit" && (this._isConnecting.get() || this._isConnected.get() || this._isReconnecting.get());
    const shouldPlayRecordingStoppedSignal = source === "explicit" && this._pttHeld;
    if (this._telemetrySessionStart) {
      const durationSec = Math.round((Date.now() - this._telemetrySessionStart) / 1e3);
      this.telemetryService.publicLog2("voiceSessionEnded", {
        turnCount: this._telemetryTurnCount,
        durationSec,
        reconnectCount: this._telemetryReconnectCount
      });
      this._telemetrySessionStart = void 0;
    }
    this._isConnecting.set(false, void 0);
    this._isReconnecting.set(false, void 0);
    this._connectWatchdog.clear();
    this._voiceAutorunDisposable.clear();
    this._voiceEventDisposables.clear();
    this.ttsPlaybackService.closeContext();
    this.micCaptureService.stopCapture();
    this.voiceClientService.disconnect();
    this._pttHeld = false;
    this._pttToggleMode = false;
    this._pttCurrentTurnId = "";
    this._resetTranscriptionTurn();
    this._bargeInListenActive = false;
    this._isConnected.set(false, void 0);
    this._voiceState.set("idle", void 0);
    this._statusText.set("Tap to start", void 0);
    this._transcriptTurns.set([], void 0);
    this._clearAutoListenTimer();
    this._clearAwaitingReply();
    this._autoListenSuppressed = false;
    this._enterListenOnSessionInit = false;
    this._replyPlayedSinceSend = false;
    this._audioQueue.length = 0;
    this._currentPlaybackSessionId = null;
    this._currentPlaybackResponseId = void 0;
    this._currentPlaybackNarration = void 0;
    this._isProcessingQueue = false;
    this._suppressIncomingAudio = false;
    this._interruptedAudioIds.clear();
    this._clearDeferredResponses();
    this._uiResourceByBackendId.clear();
    this._liveReplyKeys.clear();
    this._lastShownSessionId = void 0;
    this._targetSession.set(void 0, void 0);
    this._suppressPendingConfirmationsUntilConnect();
    this._pendingToolConfirmations.set([], void 0);
    this._activeSessionShown = void 0;
    this._externalActiveSessionMode = false;
    this._recentlyReadResponse.clear();
    this._droppingRenarration.clear();
    this._solicitedNarrationIds.clear();
    this._cancelledPendingNarrationIds.clear();
    this._lastHeardTranscriptById.clear();
    this._awaitingReplyForSession = void 0;
    this._prevSessionStates.clear();
    for (const t of this._userCancelledSessions.values()) {
      clearTimeout(t);
    }
    this._userCancelledSessions.clear();
    for (const t of this._confirmationFlushWatchdogs.values()) {
      clearTimeout(t);
    }
    this._confirmationFlushWatchdogs.clear();
    if (this._stateChangeEmitTimer) {
      clearTimeout(this._stateChangeEmitTimer);
      this._stateChangeEmitTimer = void 0;
    }
    this._pendingStateChanges.clear();
    for (const ref of this._eagerModelRefs.values()) {
      ref.dispose();
    }
    this._eagerModelRefs.clear();
    this._eagerModelLoading.clear();
    this._pendingIdleNarration.clear();
    this._sessionsAwaitingResponseSummary.clear();
    this._lastResponseSummaryById.clear();
    this._lastNarratedText.clear();
    this._pendingNarrationRetries.clear();
    this._voiceProgressListeners.clearAndDisposeAll();
    this._voiceProgressSessionByResponse.clear();
    this._lastSpokenAtBySession.clear();
    for (const [narrationId, pending] of this._pendingSolicitedNarrations) {
      this._clearPendingSolicitedNarration(narrationId, pending);
    }
    this._pendingSolicitedNarrations.clear();
    this._deferredNarrations.clear();
    this._narratedPending.clear();
    this._userLogin = void 0;
    this._lastPersistedTurnId = void 0;
    this._pendingPriorTimeline = [];
    this._stopReplay();
    this._sessionAudioCache.clear();
    if (shouldPlayRecordingStoppedSignal) {
      this._playRecordingStoppedSignal(true);
    }
    if (shouldPlayStoppedSignal) {
      void this.accessibilitySignalService.playSignal(AccessibilitySignal.voiceModeStopped, {
        source: "voiceMode.disconnect",
        userGesture: true
      });
    }
  }
  /** DEV ONLY: Simulate a connected session with fake transcript for UI testing. */
  simulateConnection() {
    this._isConnected.set(true, void 0);
    this._isConnecting.set(false, void 0);
    this._voiceState.set("idle", void 0);
    this._statusText.set("Hold to speak...", void 0);
    this._voiceEventDisposables.add(disposableTimeout(() => {
      if (!this._isConnected.get()) {
        return;
      }
      this._voiceState.set("listening", void 0);
      this._transcriptTurns.set([{ speaker: "user", text: "Create a", committed: "", isPartial: true }], void 0);
    }, 1e3));
    this._voiceEventDisposables.add(disposableTimeout(() => {
      if (!this._isConnected.get()) {
        return;
      }
      this._transcriptTurns.set([{ speaker: "user", text: "Create a new React component", committed: "Create a ", isPartial: true }], void 0);
    }, 2e3));
    this._voiceEventDisposables.add(disposableTimeout(() => {
      if (!this._isConnected.get()) {
        return;
      }
      this._transcriptTurns.set([{ speaker: "user", text: "Create a new React component for the dashboard", committed: "Create a new React component for the dashboard", isPartial: false }], void 0);
      this._voiceState.set("idle", void 0);
    }, 3e3));
    this._voiceEventDisposables.add(disposableTimeout(() => {
      if (!this._isConnected.get()) {
        return;
      }
      this._transcriptTurns.set([
        { speaker: "user", text: "Create a new React component for the dashboard", committed: "Create a new React component for the dashboard", isPartial: false },
        { speaker: "assistant", text: "I'll create a Dashboard component with some widgets...", committed: "", isPartial: false }
      ], void 0);
    }, 4500));
  }
  /**
   * Handle a terminal, non-recoverable close (e.g. another window took over the
   * single voice session -> backend closes this one with 4008). Unlike a
   * transient drop (see {@link _onConnectionLost}), there is no reconnect, so
   * fully tear down capture/playback and settle to a clean, restartable state
   * instead of leaving the UI stuck on "Reconnecting...". Fires before the
   * connection-state change, so `_fatalDisconnect` short-circuits that path.
   */
  _handleFatalDisconnect(code, reason) {
    this.logService.warn(`[voice] fatal disconnect code=${code} reason=${reason}; tearing down (no reconnect)`);
    this._fatalDisconnect = true;
    this._audioQueue.length = 0;
    this._currentPlaybackSessionId = null;
    this._currentPlaybackResponseId = void 0;
    this._currentPlaybackNarration = void 0;
    this._isProcessingQueue = false;
    this.ttsPlaybackService.closeContext();
    this.micCaptureService.stopCapture();
    this._pttHeld = false;
    this._pttToggleMode = false;
    for (const [narrationId, pending] of this._pendingSolicitedNarrations) {
      this._clearPendingSolicitedNarration(narrationId, pending);
    }
    this._pendingSolicitedNarrations.clear();
    this._solicitedNarrationIds.clear();
    this._cancelledPendingNarrationIds.clear();
    this._pendingNarrationRetries.clear();
    this._voiceProgressListeners.clearAndDisposeAll();
    this._voiceProgressSessionByResponse.clear();
    this._lastSpokenAtBySession.clear();
    this._deferredNarrations.clear();
    this._narratedPending.clear();
    this._targetSession.set(void 0, void 0);
    this._suppressPendingConfirmationsUntilConnect();
    this._pendingToolConfirmations.set([], void 0);
    transaction((tx) => {
      this._isConnecting.set(false, tx);
      this._isReconnecting.set(false, tx);
      this._isConnected.set(false, tx);
    });
    this._voiceState.set("error", void 0);
    const message = code === 4008 ? localize("voice.movedToAnotherWindow", "Voice moved to another window. Tap to start.") : reason || localize("voice.fatalDisconnect", "Voice disconnected. Tap to start.");
    this._statusText.set(message, void 0);
    ariaAlert(message);
  }
  _onConnectionLost() {
    this.logService.warn("[voice] connection lost, preserving state for reconnect");
    this.ttsPlaybackService.closeContext();
    this._pttHeld = false;
    this._pttToggleMode = false;
    this._pttCurrentTurnId = "";
    this._resetTranscriptionTurn();
    this._isConnected.set(false, void 0);
    this._isReconnecting.set(true, void 0);
    this._voiceState.set("idle", void 0);
    this._statusText.set("Reconnecting...", void 0);
  }
  _beginTranscriptionTurn(turnId) {
    this._transcriptionTurnState = {
      turnId,
      highestRevision: void 0,
      phase: "active"
    };
  }
  _markTranscriptionTurnPending() {
    if (this._transcriptionTurnState?.turnId === this._pttCurrentTurnId && this._transcriptionTurnState.phase === "active") {
      this._transcriptionTurnState.phase = "pending";
    }
  }
  _resetTranscriptionTurn() {
    this._transcriptionTurnState = void 0;
  }
  _handleTurnAutoEnded(event) {
    if (!this._pttHeld) {
      return;
    }
    if (event.turnId && event.turnId !== this._pttCurrentTurnId) {
      return;
    }
    this._pttToggleMode = false;
    this._finishPtt("auto");
  }
  _handleBargeIn(event) {
    if (event.turnId) {
      if (this._transcriptionTurnState?.turnId !== event.turnId) {
        this._beginTranscriptionTurn(event.turnId);
      }
    } else {
      this._resetTranscriptionTurn();
    }
    this._startUserTurn();
    this._rememberInterruptedAudioId(event.interruptedTurnId);
    this._dropInterruptedDeferredAudio();
    this._interruptAssistantPlayback();
  }
  _rememberInterruptedPlaybackIds() {
    this._rememberInterruptedAudioId(this._currentPlaybackResponseId);
    for (const queued of this._audioQueue) {
      this._rememberInterruptedAudioId(queued.responseId);
    }
  }
  _rememberInterruptedAudioId(id) {
    if (!id) {
      return;
    }
    this._interruptedAudioIds.delete(id);
    if (this._interruptedAudioIds.size >= 64) {
      const oldest = this._interruptedAudioIds.values().next().value;
      if (oldest !== void 0) {
        this._interruptedAudioIds.delete(oldest);
      }
    }
    this._interruptedAudioIds.add(id);
    this._responseRoutes.delete(id);
  }
  _isInterruptedAudio(event) {
    return event.turnId !== void 0 && this._interruptedAudioIds.has(event.turnId) || event.responseId !== void 0 && this._interruptedAudioIds.has(event.responseId);
  }
  _dropInterruptedDeferredAudio() {
    for (const [key, responses] of this._deferredResponses) {
      const kept = responses.filter((response) => {
        const interrupted = response.turnId !== void 0 && this._interruptedAudioIds.has(response.turnId) || response.responseId !== void 0 && this._interruptedAudioIds.has(response.responseId);
        if (interrupted && response.responseId) {
          this._responseRoutes.delete(response.responseId);
        }
        return !interrupted;
      });
      if (kept.length === responses.length) {
        continue;
      }
      if (kept.length === 0) {
        this._deferredResponses.delete(key);
      } else {
        this._deferredResponses.set(key, kept);
      }
      this._maybeHideIndicator(key);
    }
  }
  _handleTranscription(event) {
    const state = this._transcriptionTurnState;
    if (event.turnId) {
      if (!state || state.turnId !== event.turnId || state.phase === "final") {
        return;
      }
      if (event.revision !== void 0) {
        if (state.highestRevision !== void 0 && event.revision <= state.highestRevision) {
          return;
        }
        state.highestRevision = event.revision;
      }
    }
    if (!this._telemetryFirstTranscriptionMs && this._telemetryPttDownMs) {
      this._telemetryFirstTranscriptionMs = Date.now();
    }
    const isPartial = event.status === "partial";
    if (isPartial && !this._isLiveTranscriptEnabled()) {
      return;
    }
    this._updateUserTurn(event.text, event.committed ?? "", isPartial);
    if (isPartial) {
      return;
    }
    if (!this._pttHeld) {
      this._voiceState.set("processing", void 0);
      this._statusText.set("Processing...", void 0);
    }
    this._persistTurn("user", event.text);
    if (event.turnId && state) {
      state.phase = "final";
    }
  }
  pttDown(source = "explicit", forceNewTurn = false) {
    if (!this._isConnected.get()) {
      this.logService.trace("[voice] pttDown ignored: not connected");
      return;
    }
    const passive = source !== "explicit";
    this._suppressSendToChatUntil = 0;
    this._setPinnedSubmitSession(void 0);
    if (forceNewTurn) {
      this._pttToggleMode = false;
    } else if (this._pttToggleMode) {
      this.logService.trace("[voice] pttDown: toggle-mode second tap -> finishing turn");
      this._pttToggleMode = false;
      this._finishPtt();
      return;
    }
    if (this._bargeInListenActive) {
      this.logService.trace("[voice] pttDown: promoting passive barge-in listen to user interrupt");
      const shownSessionId = this._shownSessionId();
      if (shownSessionId) {
        this._cancelVoiceProgress(shownSessionId);
      }
      this._preemptCheckpointPlayback(void 0, void 0, false);
      this._bargeInListenActive = false;
      this._pttCurrentTurnPassive = false;
      this._autoListenSuppressed = false;
      this._pttWaitingForPlayback = false;
      this._telemetryPttDownMs = Date.now();
      this._telemetryFirstTranscriptionMs = void 0;
      this._telemetryTurnCount++;
      this._rememberInterruptedPlaybackIds();
      this._telemetryTtsInterrupted = this._telemetryTtsInterrupted || this.ttsPlaybackService.isPlaying;
      if (this._delayedMicStopTimer) {
        clearTimeout(this._delayedMicStopTimer);
        this._delayedMicStopTimer = void 0;
      }
      this._cancelTranscriptFade();
      this._startUserTurn();
      this._audioQueue.length = 0;
      this._currentPlaybackSessionId = null;
      this._currentPlaybackResponseId = void 0;
      this._currentPlaybackNarration = void 0;
      this._currentPlaybackFinalized = false;
      this._isProcessingQueue = false;
      this._suppressIncomingAudio = true;
      this.ttsPlaybackService.stopPlayback();
      this._voiceState.set("listening", void 0);
      this._statusText.set("Listening...", void 0);
      if (source !== "auto") {
        this._playListeningStartedSignal(source);
      }
      if (!this._pttMaxDurationTimer) {
        this._pttMaxDurationTimer = setTimeout(() => {
          if (this._pttHeld) {
            this._statusText.set("Max duration reached", void 0);
            this.pttUp("internal");
          }
        }, VoiceSessionController._PTT_MAX_DURATION_MS);
      }
      return;
    }
    if (this._pttHeld) {
      this.logService.trace("[voice] pttDown ignored: already held");
      return;
    }
    if (source === "explicit") {
      const shownSessionId = this._shownSessionId();
      if (shownSessionId) {
        this._cancelVoiceProgress(shownSessionId);
      }
      this._preemptCheckpointPlayback(void 0, void 0, false);
    }
    this._pttHeld = true;
    this._pttCurrentTurnPassive = passive;
    this._autoListenSuppressed = false;
    this._clearAutoListenTimer();
    this._pttCurrentTurnId = generateUuid();
    this._beginTranscriptionTurn(this._pttCurrentTurnId);
    this._pttWaitingForPlayback = false;
    this._telemetryPttDownMs = Date.now();
    this._telemetryFirstTranscriptionMs = void 0;
    this._telemetryTurnCount++;
    this._rememberInterruptedPlaybackIds();
    this._telemetryTtsInterrupted = this._telemetryTtsInterrupted || this.ttsPlaybackService.isPlaying;
    if (this._delayedMicStopTimer) {
      clearTimeout(this._delayedMicStopTimer);
      this._delayedMicStopTimer = void 0;
    }
    this._cancelTranscriptFade();
    this._startUserTurn();
    this._audioQueue.length = 0;
    this._currentPlaybackSessionId = null;
    this._currentPlaybackResponseId = void 0;
    this._currentPlaybackNarration = void 0;
    this._currentPlaybackFinalized = false;
    this._isProcessingQueue = false;
    this._suppressIncomingAudio = true;
    this.micCaptureService.isMuted = false;
    this.micCaptureService.suppressUntil(0);
    this.micCaptureService.pttDown(this._pttCurrentTurnId, passive).catch((err) => {
      this.logService.warn("[voice] mic acquisition failed on pttDown; disconnecting", err);
      this._pttHeld = false;
      this._statusText.set("Microphone denied", void 0);
      this._voiceState.set("error", void 0);
      if (this._pttMaxDurationTimer) {
        clearTimeout(this._pttMaxDurationTimer);
        this._pttMaxDurationTimer = void 0;
      }
      this.disconnect();
    });
    this.ttsPlaybackService.stopPlayback();
    this._voiceState.set("listening", void 0);
    this._statusText.set("Listening...", void 0);
    if (source !== "auto") {
      this._playListeningStartedSignal(source);
    }
    this._pttMaxDurationTimer = setTimeout(() => {
      if (this._pttHeld) {
        this._statusText.set("Max duration reached", void 0);
        this.pttUp("internal");
      }
    }, VoiceSessionController._PTT_MAX_DURATION_MS);
  }
  pttUp(source = "explicit", forceFinish = false) {
    if (!this._pttHeld) {
      return;
    }
    if (!forceFinish) {
      const holdMs = this._telemetryPttDownMs ? Date.now() - this._telemetryPttDownMs : Infinity;
      if (holdMs < VoiceSessionController._PTT_TOGGLE_THRESHOLD_MS) {
        this._pttToggleMode = true;
        return;
      }
    }
    this._finishPtt("local", source);
  }
  setAutoListenHeld(held) {
    if (this._autoListenHeld === held) {
      return;
    }
    this._autoListenHeld = held;
    this.logService.trace(`[voice] setAutoListenHeld: ${held}`);
    if (held) {
      this._clearAutoListenTimer();
      if (this._isConnected.get() && this._pttHeld) {
        this._finishPtt("local", "internal");
      }
      return;
    }
    if (this._isConnected.get() && this._isHandsFreeEnabled()) {
      this._enterAutoListen("connect");
    }
  }
  stopListening(source = "explicit") {
    if (!this._isConnected.get()) {
      return;
    }
    this._autoListenSuppressed = true;
    this._pttToggleMode = false;
    this._clearAutoListenTimer();
    if (this._pttHeld) {
      this._finishPtt("local", source);
    } else {
      this._voiceState.set("idle", void 0);
      this._statusText.set("Tap to start", void 0);
    }
  }
  discardListening() {
    if (!this._isConnected.get()) {
      return;
    }
    this._autoListenSuppressed = true;
    this._pttToggleMode = false;
    this._clearAutoListenTimer();
    this._suppressSendToChatUntil = Date.now() + VoiceSessionController._DISCARD_SEND_SUPPRESS_MS;
    if (this._pttHeld) {
      this._finishPtt("discard");
    } else {
      this._voiceState.set("idle", void 0);
      this._statusText.set("Tap to start", void 0);
    }
  }
  finishListeningAndSubmitTo(session) {
    if (!this._isConnected.get()) {
      return;
    }
    this._autoListenSuppressed = true;
    this._pttToggleMode = false;
    this._clearAutoListenTimer();
    this._setPinnedSubmitSession(session);
    if (this._pttHeld) {
      this._finishPtt("local", "internal");
    } else {
      this._voiceState.set("processing", void 0);
      this._statusText.set("Processing...", void 0);
    }
  }
  _setPinnedSubmitSession(session) {
    if (this._pinnedSubmitTimer) {
      clearTimeout(this._pinnedSubmitTimer);
      this._pinnedSubmitTimer = void 0;
    }
    this._pinnedSubmitSession = session;
    if (session) {
      this._pinnedSubmitTimer = setTimeout(() => {
        this._pinnedSubmitTimer = void 0;
        this._pinnedSubmitSession = void 0;
      }, VoiceSessionController._PINNED_SUBMIT_EXPIRY_MS);
    }
  }
  _consumePinnedSubmitSession() {
    const pinned = this._pinnedSubmitSession;
    if (pinned) {
      this._setPinnedSubmitSession(void 0);
    }
    return pinned;
  }
  /**
   * Finish the current push-to-talk press.
   *
   * ``reason`` is ``'local'`` for a user-driven end (button release / toggle
   * tap / keyword) — the mic drains its tail and the ``onPttEnd`` → ``ptt_end``
   * path fires. It is ``'auto'`` when the backend ended the turn itself
   * (``turn_auto_ended``): the mic is aborted with no drain and NO ``ptt_end``
   * is sent for the turn. ``'discard'``
   * throws the press away on a focus change: like ``'auto'`` the mic is aborted
   * with NO ``ptt_end`` (so the backend never finalizes it into a
   * `send_to_chat`), but the state settles to ``idle`` rather than
   * ``processing`` since nothing is being sent.
   */
  _finishPtt(reason = "local", source = "explicit") {
    this._pttToggleMode = false;
    this._bargeInListenActive = false;
    if (!this._pttHeld) {
      return;
    }
    this._clearAutoListenTimer();
    this._pttHeld = false;
    this._pttToggleMode = false;
    this._telemetryPttUpMs = Date.now();
    const holdMs = this._telemetryPttDownMs ? Date.now() - this._telemetryPttDownMs : 0;
    this.telemetryService.publicLog2("voicePtt", { holdDurationMs: holdMs });
    if (this._pttMaxDurationTimer) {
      clearTimeout(this._pttMaxDurationTimer);
      this._pttMaxDurationTimer = void 0;
    }
    this._voiceState.set("processing", void 0);
    this._statusText.set("Processing...", void 0);
    this._replyPlayedSinceSend = false;
    this._clearAwaitingReply();
    this._suppressIncomingAudio = false;
    this._markTranscriptionTurnPending();
    if (reason === "auto" || reason === "discard") {
      this.micCaptureService.abortPtt();
    } else {
      this.micCaptureService.pttUp();
    }
    if (reason === "discard") {
      this._voiceState.set("idle", void 0);
      this._statusText.set("Tap to start", void 0);
    }
    if (reason === "local" && source === "explicit") {
      this._playRecordingStoppedSignal(true);
    } else if (this.accessibilityService.isScreenReaderOptimized()) {
      this._playRecordingStoppedSignal(false);
    }
  }
  _playRecordingStoppedSignal(userGesture) {
    void this.accessibilitySignalService.playSignal(AccessibilitySignal.voiceRecordingStopped, {
      source: userGesture ? "voiceMode.explicitListeningStopped" : "voiceMode.listeningStopped",
      userGesture
    });
  }
  markUserCancelled(sessionId) {
    this._cancelVoiceProgress(sessionId);
    this._preemptCheckpointPlayback(sessionId);
    const existing = this._userCancelledSessions.get(sessionId);
    if (existing) {
      clearTimeout(existing);
    }
    const expiry = setTimeout(() => {
      this._userCancelledSessions.delete(sessionId);
    }, VoiceSessionController._USER_CANCEL_SUPPRESS_MS);
    this._userCancelledSessions.set(sessionId, expiry);
  }
  setTargetSession(resource) {
    this._targetSession.set(resource, void 0);
  }
  newSessionAsTarget() {
    const ref = this.chatService.startNewLocalSession(ChatAgentLocation.Chat);
    const resource = ref.object.sessionResource;
    ref.dispose();
    this._targetSession.set(resource, void 0);
    this.commandService.executeCommand("_chat.voice.switchToSession", resource.toString()).catch(() => {
    });
  }
  _scheduleDelayedMicStop() {
    if (this._delayedMicStopTimer) {
      clearTimeout(this._delayedMicStopTimer);
    }
    this._delayedMicStopTimer = setTimeout(() => {
      this._delayedMicStopTimer = void 0;
      this._pttWaitingForPlayback = false;
    }, 1e3);
  }
  _isHandsFreeEnabled() {
    return this.configurationService.getValue("agents.voice.handsFree") === true;
  }
  _shouldEnterListenOnSessionInit(isResuming) {
    return !isResuming && this._isHandsFreeEnabled();
  }
  _isLiveTranscriptEnabled() {
    return this.configurationService.getValue("agents.voice.liveTranscript") === true;
  }
  /**
   * Strip a trailing stop phrase (e.g. "send it") from a transcript before it
   * is sent to chat. The backend is supposed to strip the matched phrase from
   * `agents.voice.turn.stopPhrases`, but when it doesn't the raw phrase leaks
   * into the request, so we defensively strip it client-side. Matching is
   * case-insensitive, ignores trailing punctuation, and only strips on a word
   * boundary so phrases aren't removed from the middle of a word.
   */
  _stripStopPhrase(text) {
    const raw = this.configurationService.getValue("agents.voice.turn.stopPhrases");
    const phrases = Array.isArray(raw) ? raw.map((p) => typeof p === "string" ? p.trim() : "").filter((p) => p.length > 0) : [];
    if (phrases.length === 0) {
      return text;
    }
    const trimmed = text.trimEnd().replace(/[.,!?;:]+$/, "").trimEnd();
    const trimmedLower = trimmed.toLowerCase();
    const sorted = [...phrases].sort((a, b) => b.length - a.length);
    for (const phrase of sorted) {
      const phraseLower = phrase.toLowerCase();
      if (!trimmedLower.endsWith(phraseLower)) {
        continue;
      }
      const idx = trimmed.length - phrase.length;
      if (idx === 0 || /\s/.test(trimmed[idx - 1])) {
        return trimmed.slice(0, idx).replace(/[.,!?;:\s]+$/, "");
      }
    }
    return text;
  }
  /**
   * Whether this controller's window currently has OS focus. In multi-window
   * setups (e.g. an editor window + the agents window) each window has its own
   * controller/WebSocket, so without this gate every open window would re-arm
   * hands-free auto-listen and reply simultaneously. Only the focused window
   * should keep listening (#8507).
   */
  _isWindowFocused() {
    try {
      return this._window?.document.hasFocus() ?? false;
    } catch {
      return false;
    }
  }
  /** Called when this controller's window loses OS focus. Aborts any open
   *  passive turn so the background window stops recording while the newly
   *  focused window can take over hands-free listening (#8507). */
  _onWindowBlur() {
    if (this._pttHeld && this._pttCurrentTurnPassive) {
      this.logService.trace("[voice] window blur: aborting passive turn (multi-window hands-free #8507)");
      this._finishPtt("discard", "internal");
    }
  }
  /** Called when this controller's window gains OS focus. Re-arms hands-free
   *  auto-listen so the focused window is always the one that listens (#8507). */
  _onWindowFocus() {
    if (this._isHandsFreeEnabled()) {
      this.logService.trace("[voice] window focus: re-arming hands-free auto-listen (multi-window #8507)");
      this._enterAutoListen();
    }
  }
  /** Re-enter listening via synthetic short tap. */
  _enterAutoListen(source = "auto") {
    this._clearAutoListenTimer();
    if (this._autoListenHeld || this._autoListenSuppressed || !this._isConnected.get() || this._pttHeld) {
      this.logService.trace(`[voice] _enterAutoListen skipped: held=${this._autoListenHeld} suppressed=${this._autoListenSuppressed} connected=${this._isConnected.get()} pttHeld=${this._pttHeld}`);
      return;
    }
    if (source === "auto" && !this._isWindowFocused()) {
      this.logService.trace("[voice] _enterAutoListen skipped: window not focused (multi-window hands-free)");
      return;
    }
    if (this.ttsPlaybackService.isPlaying || this._audioQueue.length > 0 || this._currentPlaybackSessionId !== null) {
      this.logService.trace(`[voice] _enterAutoListen skipped: audio busy (playing=${this.ttsPlaybackService.isPlaying} queue=${this._audioQueue.length} pbSession=${this._currentPlaybackSessionId !== null})`);
      return;
    }
    this.logService.trace("[voice] _enterAutoListen entering listening");
    this.pttDown(source);
    this.pttUp("internal");
  }
  _playListeningStartedSignal(source) {
    if (source === "connect") {
      void this.accessibilitySignalService.playSignal(AccessibilitySignal.voiceModeStarted, {
        source: "voiceMode.connectListeningStarted",
        userGesture: true
      });
      return;
    }
    void this.accessibilitySignalService.playSignal(AccessibilitySignal.voiceRecordingStarted, {
      source: "voiceMode.explicitListeningStarted",
      userGesture: true
    });
  }
  /**
   * Hands-free barge-in listen: open a passive PTT streaming turn WITHOUT
   * interrupting the assistant's playback, so the backend's server-VAD keeps
   * receiving mic audio and can detect the user talking over the assistant.
   *
   * Unlike `pttDown()` (a user-driven interrupt) this does NOT stop playback,
   * clear the audio queue, or suppress incoming audio. The backend decides
   * when a real interruption happened and emits `speech_started` / `barge_in`
   * (already wired to cut off TTS). If the user stays silent the turn simply
   * stays open and becomes the next listening turn once playback ends
   * (`onPlaybackStopped` sees `_pttHeld` and stays in 'listening').
   *
   * Hands-free session initialization keeps capture warm before the backend can
   * send playback. Idempotent: a no-op while a turn is already held.
   */
  _startBargeInListen() {
    if (!this._isHandsFreeEnabled() || !this._isConnected.get() || this._pttHeld || this._autoListenHeld || this._autoListenSuppressed || !this._window) {
      return;
    }
    if (!this._isWindowFocused()) {
      return;
    }
    this._clearAutoListenTimer();
    this._pttCurrentTurnId = generateUuid();
    this._pttHeld = true;
    this._pttCurrentTurnPassive = true;
    this._bargeInListenActive = true;
    this._telemetryPttDownMs = Date.now();
    this.micCaptureService.isMuted = false;
    this.micCaptureService.suppressUntil(0);
    this.micCaptureService.pttDown(
      this._pttCurrentTurnId,
      /* passive */
      true
    ).catch((err) => {
      this.logService.warn("[voice] barge-in listen failed to start", err);
      this._pttHeld = false;
      this._bargeInListenActive = false;
    });
  }
  /** Debounced re-listen after assistant stops speaking. */
  _scheduleAutoListen() {
    this._clearAutoListenTimer();
    this._autoListenTimer = setTimeout(() => {
      this._autoListenTimer = void 0;
      if (this._awaitingReplyAudio) {
        return;
      }
      this._enterAutoListen();
    }, VoiceSessionController._AUTO_LISTEN_QUIET_MS);
  }
  _clearAutoListenTimer() {
    if (this._autoListenTimer) {
      clearTimeout(this._autoListenTimer);
      this._autoListenTimer = void 0;
    }
  }
  /** Block auto-listen until reply audio arrives (with 30s watchdog). */
  _setAwaitingReply() {
    this._awaitingReplyAudio = true;
    this._awaitingReplyForSession = this._getActiveSessionId();
    this._clearAutoListenTimer();
    if (this._awaitingReplyWatchdog) {
      clearTimeout(this._awaitingReplyWatchdog);
    }
    this._awaitingReplyWatchdog = setTimeout(() => {
      this._awaitingReplyWatchdog = void 0;
      this._awaitingReplyAudio = false;
      this._awaitingReplyForSession = void 0;
      if (this._isHandsFreeEnabled() && !this._pttHeld) {
        this._enterAutoListen();
      }
    }, 3e4);
  }
  _clearAwaitingReply() {
    this._awaitingReplyAudio = false;
    this._awaitingReplyForSession = void 0;
    if (this._awaitingReplyWatchdog) {
      clearTimeout(this._awaitingReplyWatchdog);
      this._awaitingReplyWatchdog = void 0;
    }
  }
  _acceptVoiceInput(text, sessionResource) {
    this.commandService.executeCommand("_chat.voice.acceptInput", text).then((response) => {
      this.logService.info(`[voice] acceptInput completed session=${sessionResource.toString()} response=${response?.id ?? "none"} connected=${this._isConnected.get()}`);
      if (response && this._isConnected.get()) {
        this._watchVoiceProgress(sessionResource, response);
      }
    }).catch((err) => this.logService.warn("[voice] acceptInput failed:", err));
  }
  async _sendVoiceRequest(sessionResource, text) {
    const result = await this.chatService.sendRequest(sessionResource, text, { isVoiceModeInput: this._isVoiceProgressEnabled() }).catch((err) => {
      this.logService.warn("[voice] Error sending transcription:", err);
      return void 0;
    });
    if (!result) {
      return void 0;
    }
    const sentResult = ChatSendResult.isQueued(result) ? result.deferred : Promise.resolve(result);
    sentResult.then(async (sent) => {
      if (ChatSendResult.isSent(sent)) {
        const response = await sent.data.responseCreatedPromise;
        if (this._isConnected.get()) {
          this._watchVoiceProgress(sessionResource, response);
        }
      }
    }).catch((err) => this.logService.warn("[voice] Failed to watch voice response:", err));
    return result;
  }
  _watchVoiceProgress(sessionResource, response) {
    if (!this._isVoiceProgressEnabled()) {
      return;
    }
    const disposables = new DisposableStore();
    const timer = disposables.add(new MutableDisposable());
    const seen = /* @__PURE__ */ new Set();
    const sessionId = sessionResource.toString();
    const sessionKey = this._sessionKey(sessionId);
    const requestStartedAt = Date.now();
    let narratedCount = 0;
    let lastCheckpointAt;
    let nextSequence = 1;
    let pending;
    this.logService.info(`[voice] watching progress session=${sessionId} response=${response.id} request=${response.requestId}`);
    const dispose = () => this._voiceProgressListeners.deleteAndDispose(response.id);
    const nextEligibleAt = () => {
      if (lastCheckpointAt !== void 0) {
        return lastCheckpointAt + VoiceSessionController._VOICE_PROGRESS_INTERVAL_MS;
      }
      const lastSpokenAt = this._lastSpokenAtBySession.get(sessionKey);
      return Math.max(
        requestStartedAt + VoiceSessionController._VOICE_PROGRESS_INITIAL_DELAY_MS,
        (lastSpokenAt ?? 0) + VoiceSessionController._VOICE_PROGRESS_INITIAL_DELAY_MS
      );
    };
    const flush = () => {
      timer.clear();
      if (!this._isVoiceProgressEnabled()) {
        dispose();
        return;
      }
      if (response.isComplete || response.isCanceled) {
        dispose();
        return;
      }
      if (!pending || narratedCount >= VoiceSessionController._MAX_VOICE_PROGRESS_PER_REQUEST) {
        return;
      }
      if (!this._isConnected.get()) {
        return;
      }
      const canReplacePlayingCheckpoint = this._currentPlaybackNarration?.kind === "checkpoint";
      if (this.ttsPlaybackService.isPlaying && !canReplacePlayingCheckpoint) {
        return;
      }
      const delay = nextEligibleAt() - Date.now();
      if (delay > 0) {
        timer.value = disposableTimeout(flush, delay);
        return;
      }
      const checkpoint = pending;
      pending = void 0;
      const metadata = {
        requestId: response.requestId,
        checkpointId: checkpoint.id,
        sequence: nextSequence++
      };
      const narrated = this._isConnected.get() && this._isSameSession(sessionId, this._shownSessionId()) && this._narrate(sessionId, "checkpoint", checkpoint.value, void 0, metadata);
      this.logService.info(`[voice] checkpoint dispatch session=${sessionId} response=${response.id} stage=${checkpoint.id} sequence=${metadata.sequence} narrated=${Boolean(narrated)}`);
      if (narrated) {
        narratedCount++;
        lastCheckpointAt = Date.now();
      }
    };
    const schedule = () => {
      timer.clear();
      const delay = nextEligibleAt() - Date.now();
      if (delay <= 0) {
        flush();
      } else {
        timer.value = disposableTimeout(flush, delay);
      }
    };
    const update = () => {
      if (!this._isVoiceProgressEnabled()) {
        dispose();
        return;
      }
      if (response.isComplete || response.isCanceled) {
        this._preemptCheckpointPlayback(sessionId);
        dispose();
        return;
      }
      for (const part of response.response.value) {
        if (part.kind !== "voiceProgress" || !isVoiceCheckpointId(part.id) || seen.has(part.id)) {
          continue;
        }
        seen.add(part.id);
        pending = { id: part.id, value: part.value };
        this.logService.info(`[voice] checkpoint observed session=${sessionId} response=${response.id} stage=${part.id}`);
      }
      if (pending) {
        schedule();
      }
    };
    disposables.add(response.onDidChange(update));
    disposables.add(autorun((reader) => {
      if (this._isConnected.read(reader) && pending) {
        schedule();
      }
    }));
    disposables.add(this.ttsPlaybackService.onPlaybackStopped(() => {
      if (pending) {
        schedule();
      }
    }));
    disposables.add({ dispose: () => this._voiceProgressSessionByResponse.delete(response.id) });
    this._voiceProgressListeners.set(response.id, disposables);
    this._voiceProgressSessionByResponse.set(response.id, sessionKey);
    update();
  }
  _isVoiceProgressEnabled() {
    return this.configurationService.getValue(VOICE_AGENT_PROGRESS_SETTING) === true;
  }
  _cancelVoiceProgress(sessionId) {
    const sessionKey = sessionId ? this._sessionKey(sessionId) : void 0;
    for (const responseId of [...this._voiceProgressListeners.keys()]) {
      if (sessionKey === void 0 || this._voiceProgressSessionByResponse.get(responseId) === sessionKey) {
        this._voiceProgressListeners.deleteAndDispose(responseId);
      }
    }
  }
  /**
   * Send transcription text to the target session or active chat.
   */
  async _sendTranscriptionToChat(text) {
    const target = this._consumePinnedSubmitSession() ?? this._targetSession.get();
    if (target) {
      const currentSession = await this.commandService.executeCommand("_chat.voice.getCurrentSession").catch(() => void 0);
      const isTargetVisible = currentSession === target.toString();
      if (isTargetVisible) {
        this._acceptVoiceInput(text, target);
      } else {
        const cts = new CancellationTokenSource();
        const ref = await this.chatService.acquireOrLoadSession(target, ChatAgentLocation.Chat, cts.token, "voice-send").catch((err) => {
          this.logService.warn("[voice] Failed to load target session:", err);
          return void 0;
        });
        cts.dispose();
        if (!ref) {
          this.logService.warn("[voice] Could not load target session, falling back to switch");
          const switched = await this.commandService.executeCommand("_chat.voice.switchToSession", target.toString()).catch(() => false);
          if (switched) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            this._acceptVoiceInput(text, target);
          }
          return;
        }
        const result = await this._sendVoiceRequest(target, text);
        if (result && result.kind !== "rejected") {
          this._watchResponseForFloatingWindow(target);
          this.commandService.executeCommand("_agentsVoice.openWindow").catch(() => {
          });
          const model = this.chatService.getSession(target);
          if (model) {
            const lastReq = model.getRequests().at(-1);
            if (lastReq?.response && !lastReq.response.isComplete && !lastReq.response.isCanceled) {
              const responseDisposable = lastReq.response.onDidChange(() => {
                if (lastReq.response.isComplete || lastReq.response.isCanceled) {
                  responseDisposable.dispose();
                  ref.dispose();
                }
              });
            } else {
              ref.dispose();
            }
          } else {
            ref.dispose();
          }
        } else {
          ref.dispose();
        }
      }
    } else {
      const currentSession = await this.commandService.executeCommand("_chat.voice.getCurrentSession").catch(() => void 0);
      if (currentSession) {
        this._acceptVoiceInput(text, URI.parse(currentSession));
      } else {
        const models = [...this.chatService.chatModels.get()];
        const existingSession = models.length > 0 ? models[models.length - 1] : void 0;
        const sessionResource = existingSession?.sessionResource;
        if (sessionResource) {
          const switched = await this.commandService.executeCommand("_chat.voice.switchToSession", sessionResource.toString()).catch(() => false);
          if (switched) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            this._acceptVoiceInput(text, sessionResource);
          } else {
            await this._sendVoiceRequest(sessionResource, text);
          }
        } else {
          const ref = this.chatService.startNewLocalSession(ChatAgentLocation.Chat);
          const resource = ref.object.sessionResource;
          ref.dispose();
          this.commandService.executeCommand("_chat.voice.switchToSession", resource.toString()).catch(() => {
          });
          await this._sendVoiceRequest(resource, text);
        }
      }
      this.commandService.executeCommand("workbench.panel.chat.view.copilot.focus").catch(() => {
      });
    }
  }
  /**
   * Watch a session's latest response and surface it in the floating window
   * transcript. Called when voice sends to a non-visible session so the user
   * can see the reply without switching the chat panel.
   */
  _watchResponseForFloatingWindow(sessionResource) {
    const model = this.chatService.getSession(sessionResource);
    if (!model) {
      return;
    }
    this._prevSessionStates.set(sessionResource.toString(), { state: "thinking", detail: "", pendingId: "", lastResponseSummary: "" });
    this._sendContext();
    const disposables = new DisposableStore();
    let lastText = "";
    const updateFromResponse = () => {
      const lastReq = model.lastRequest;
      const response = lastReq?.response;
      if (!response) {
        return;
      }
      const markdown = response.response.getMarkdown();
      const previewText = markdown.length > 200 ? markdown.slice(0, 200) + "\u2026" : markdown;
      if (previewText && previewText !== lastText) {
        const isFirst = lastText === "";
        lastText = previewText;
        this._setAssistantTurn(previewText, { startNewTurn: isFirst });
      }
      if (response.isComplete || response.isCanceled) {
        this._prevSessionStates.set(sessionResource.toString(), { state: "idle", detail: "", pendingId: "", lastResponseSummary: "" });
        this._sendContext();
        this.voiceClientService.flushSessionContext();
        disposables.dispose();
      }
    };
    const checkResponse = () => {
      const lastReq = model.lastRequest;
      if (lastReq?.response) {
        disposables.add(lastReq.response.onDidChange(() => updateFromResponse()));
        updateFromResponse();
      }
    };
    disposables.add(model.onDidChange((e) => {
      if (e.kind === "addResponse") {
        checkResponse();
      }
    }));
    checkResponse();
    const timeout = setTimeout(() => disposables.dispose(), 5 * 60 * 1e3);
    disposables.add({ dispose: () => clearTimeout(timeout) });
  }
  // --- Transcript buffer helpers ---
  _pushTurn(turn) {
    const cur = this._transcriptTurns.get();
    const next = [...cur, turn].slice(-VoiceSessionController._MAX_TURNS);
    this._transcriptTurns.set(next, void 0);
  }
  /**
   * Start a new user turn at the tail of the buffer. If the previous tail is
   * already an empty user turn (rapid PTT toggle before any transcription
   * landed), reuse it instead of pushing a duplicate empty entry.
   */
  _startUserTurn() {
    const cur = this._transcriptTurns.get();
    const last = cur[cur.length - 1];
    if (last && last.speaker === "user" && !last.text) {
      return;
    }
    this._pushTurn({ speaker: "user", text: "", committed: "", isPartial: true });
  }
  _updateUserTurn(text, committed, isPartial) {
    const cur = this._transcriptTurns.get();
    const last = cur[cur.length - 1];
    if (!last || last.speaker !== "user") {
      this._pushTurn({ speaker: "user", text, committed, isPartial });
      return;
    }
    const updated = { speaker: "user", text, committed, isPartial };
    this._transcriptTurns.set([...cur.slice(0, -1), updated], void 0);
  }
  /**
   * Update the assistant turn at the tail of the buffer with `text`.
   *
   * The streaming TTS pipeline pushes a monotonically-growing transcript
   * with each audio chunk of a response. `startNewTurn` distinguishes
   * the first chunk of a NEW response (push a fresh assistant turn)
   * from continuation chunks of the SAME response (replace the tail's
   * text as the transcript grows). This prevents two distinct
   * assistant responses from collapsing into one when they happen
   * back-to-back without an intervening user turn (e.g. proactive
   * narration followed by a command reply).
   */
  _setAssistantTurn(text, opts = { startNewTurn: true }) {
    const cur = this._transcriptTurns.get();
    const last = cur[cur.length - 1];
    if (!opts.startNewTurn && last && last.speaker === "assistant") {
      const updated = { speaker: "assistant", text, committed: "", isPartial: false };
      this._transcriptTurns.set([...cur.slice(0, -1), updated], void 0);
      return;
    }
    this._pushTurn({ speaker: "assistant", text, committed: "", isPartial: false });
  }
  _cancelTranscriptFade() {
    if (this._transcriptFadeTimer) {
      clearTimeout(this._transcriptFadeTimer);
      this._transcriptFadeTimer = void 0;
    }
  }
  // --- Transcript persistence (local-only) ---
  /**
   * Append a final entry to the on-disk transcript store.
   *
   * Entry ids are generated locally — voice_code's backend has no persistent
   * conversation memory today, so there's no server-issued id to defer to.
   * Each new entry chains off the previous one via ``ancestorIds`` so a UI
   * can show the linear conversation order.
   *
   * ``user_voice`` and ``agent_voice`` are user-visible in the transcripts
   * pane. ``agent_tool_call`` and ``coding_event`` are persisted only so we
   * can replay them as cross-session context to the backend on reconnect.
   */
  _persistEntry(kind, text, metadata) {
    const userId = this._userLogin;
    if (!userId || !text) {
      return;
    }
    const entry = {
      turnId: generateUuid(),
      ancestorIds: this._lastPersistedTurnId ? [this._lastPersistedTurnId] : [],
      kind,
      role: kind === "user_voice" ? "user" : "assistant",
      text,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      ...metadata ? { metadata } : {}
    };
    this._lastPersistedTurnId = entry.turnId;
    this.voiceTranscriptStore.appendTurn(userId, entry).catch((err) => {
      this.logService.warn("[voice] failed to persist transcript entry", err);
    });
  }
  /** Back-compat thin shim for the two existing voice call sites. */
  _persistTurn(role, text) {
    this._persistEntry(role === "user" ? "user_voice" : "agent_voice", text);
  }
  /**
   * One-line, human/LLM-readable summary of a voice tool call for the
   * timeline. Backend's prior_timeline renderer expects this format — keep
   * it stable.
   *
   *   send_to_chat(text="Open a new terminal and cd into the current directory.")
   *   new_sessions(sessions=[{"text": "Refactor upload service"}])
   *   respond_to_session(...)
   */
  _renderToolCallSummary(name, args) {
    if (!args || Object.keys(args).length === 0) {
      return `${name}()`;
    }
    const pairs = [];
    for (const [k, v] of Object.entries(args)) {
      let rendered;
      if (typeof v === "string") {
        rendered = v.length > 200 ? `${v.slice(0, 197)}...` : v;
        rendered = JSON.stringify(rendered);
      } else {
        try {
          const json = JSON.stringify(v);
          rendered = json.length > 200 ? `${json.slice(0, 197)}...` : json;
        } catch {
          rendered = String(v);
        }
      }
      pairs.push(`${k}=${rendered}`);
    }
    return `${name}(${pairs.join(", ")})`;
  }
  /**
   * Convert persisted transcript turns into typed timeline entries for
   * the BE, then top up with a synthesized ``coding_agent_reply`` per
   * active coding session (first ~2 sentences of the latest Copilot
   * response). The synthetic entries are *not* persisted — they read
   * live ``IChatModel`` state so the summary stays fresh on every
   * reconnect.
   *
   * Output is chronological (oldest first), matching what the BE
   * renders into its ``[PRIOR_CONTEXT]`` block. Synthetic
   * ``coding_agent_reply`` entries are appended at the end since they
   * represent the *current* state of coding sessions at reconnect.
   */
  _buildPriorTimeline(turns) {
    const out = [];
    for (const t of turns) {
      const kind = t.kind;
      if (!kind) {
        continue;
      }
      const entry = {
        kind,
        text: t.text,
        timestamp: new Date(t.timestamp).toISOString(),
        ...t.metadata?.toolName ? { toolName: t.metadata.toolName } : {},
        ...t.metadata?.codingSessionId ? { codingSessionId: t.metadata.codingSessionId } : {},
        ...t.metadata?.codingStatus ? { codingStatus: t.metadata.codingStatus } : {}
      };
      out.push(entry);
    }
    try {
      const sessions = this.agentSessionsService.model.sessions.filter((s) => !s.isArchived());
      for (const session of sessions) {
        const model = this.chatService.getSession(session.resource);
        const lastReq = model?.getRequests().at(-1);
        const value = lastReq?.response?.response.value;
        if (!value) {
          continue;
        }
        const full = value.filter((p) => p.kind === "markdownContent").map((p) => p.content.value).join(" ").trim();
        if (!full) {
          continue;
        }
        const summary = this._firstSentences(full, VoiceSessionController.CODING_AGENT_REPLY_SENTENCE_LIMIT);
        if (!summary) {
          continue;
        }
        out.push({
          kind: "coding_agent_reply",
          text: summary,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          codingSessionId: session.resource.toString()
        });
      }
    } catch (err) {
      this.logService.warn("[voice] failed to synthesize coding_agent_reply timeline entries", err);
    }
    return out;
  }
  /**
   * Return the first ``n`` sentences of ``text``. Cheap regex split —
   * good enough for a prompt-prefix summary; we don't need perfect NLP
   * boundaries here. Falls back to a hard char cap if no terminator
   * shows up in the first 600 chars.
   */
  _firstSentences(text, n) {
    const collapsed = text.replace(/\s+/g, " ").trim();
    if (!collapsed) {
      return "";
    }
    const sentences = [];
    const re = /[^.!?]+[.!?]+(\s|$)/g;
    let m;
    while ((m = re.exec(collapsed)) !== null && sentences.length < n) {
      sentences.push(m[0].trim());
    }
    if (sentences.length === 0) {
      return collapsed.length > 600 ? `${collapsed.slice(0, 597)}...` : collapsed;
    }
    return sentences.join(" ");
  }
  // --- Deferred responses for non-focused sessions ---
  /**
   * Record the backend→UI resource alias for an agent-host session so a response
   * the voice backend tags with the bare backend id resolves to this UI session
   * resource (the space in which focus, defer/flush buffer keys, and the pending
   * indicator operate). No-op for non-agent-host resources.
   */
  _recordSessionAlias(uiResource) {
    const backend = toAgentHostBackendSessionUri(uiResource);
    if (!backend) {
      return;
    }
    const from = backend.toString();
    const to = uiResource.toString();
    if (this._uiResourceByBackendId.get(from) === to) {
      return;
    }
    this._uiResourceByBackendId.set(from, to);
    this._rekeySession(from, to);
  }
  /** Move every session-scoped entry (and the visible indicator) from a bare
   *  backend id to its canonical UI key once the alias becomes known. */
  _rekeySession(from, to) {
    if (from === to) {
      return;
    }
    const rekeyMap = (m) => {
      if (m.has(from)) {
        if (!m.has(to)) {
          m.set(to, m.get(from));
        }
        m.delete(from);
      }
    };
    const rekeySet = (s) => {
      if (s.has(from)) {
        s.delete(from);
        s.add(to);
      }
    };
    rekeyMap(this._deferredResponses);
    rekeyMap(this._pendingResponseSummaries);
    rekeyMap(this._lastNarratedText);
    rekeyMap(this._lastHeardTranscriptById);
    rekeyMap(this._recentlyReadResponse);
    rekeyMap(this._lastResponseSummaryById);
    rekeyMap(this._pendingNarrationRetries);
    rekeyMap(this._deferredNarrations);
    rekeyMap(this._narratedPending);
    rekeySet(this._confirmationPendingSessions);
    rekeySet(this._liveReplyKeys);
    rekeySet(this._sessionsAwaitingResponseSummary);
    rekeySet(this._pendingIdleNarration);
    this._markPendingResponse(from, false);
    if (this._pendingOwned(to)) {
      this._markPendingResponse(to, true);
    }
  }
  /**
   * The single canonical key for a session: the UI agent-host resource when the
   * backend tagged it with the bare backend id, else the id unchanged. Every
   * session-scoped collection is keyed by this, so the two id spaces never
   * diverge and ownership checks are plain O(1) map/set lookups.
   */
  _sessionKey(id) {
    return this._uiResourceByBackendId.get(id) ?? id;
  }
  /** Whether any of the three indicator owners still holds this canonical key. */
  _pendingOwned(key) {
    return this._confirmationPendingSessions.has(key) || this._deferredResponses.has(key) || this._pendingResponseSummaries.has(key);
  }
  /**
   * Canonicalize a session id to the UI agent-host resource space when the
   * backend tagged it with the bare backend id. Untagged / non-agent-host ids
   * pass through unchanged.
   */
  _canonicalSessionId(id) {
    return id ? this._uiResourceByBackendId.get(id) ?? id : id;
  }
  /**
   * Refresh the cached focused session and flush any response that was held
   * for the session that just became focused.
   */
  /**
   * The session the user is currently looking at, read live from the
   * last-focused chat widget (the same source that fires
   * `onDidChangeFocusedSession`). Reading live - rather than trusting a value
   * cached on the change event - protects the defer/flush decision from a
   * missed or out-of-order focus event, which would otherwise leave a response
   * buffered forever or drop it into the wrong session.
   */
  _getFocusedSessionId() {
    return this.chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource?.toString();
  }
  _onFocusedSessionChanged() {
    if (this._externalActiveSessionMode) {
      return;
    }
    const focused = this._getFocusedSessionId();
    if (focused) {
      this._activateShownSession(URI.parse(focused));
      return;
    }
    this._sendContext();
    this.voiceClientService.flushSessionContext();
  }
  /**
   * Track a chat widget's view-model so we notice when a session is shown in it,
   * even if that widget never takes DOM focus (so `onDidChangeFocusedSession`
   * stays silent). Opening a session from the sessions list reveals it in the
   * chat view pane this way.
   */
  _trackWidgetSession(widget) {
    this._register(widget.onDidChangeViewModel((e) => this._onSessionShown(e.currentSessionResource)));
    this._onSessionShown(widget.viewModel?.sessionResource);
  }
  /** A session became visible (opened/revealed): treat like a focus change — make it active, flush any buffered response, clear its pending indicator, and narrate its pending item. */
  _onSessionShown(resource) {
    if (this._externalActiveSessionMode) {
      return;
    }
    const key = resource?.toString();
    if (!key || key === this._lastShownSessionId) {
      return;
    }
    this.logService.trace(`[voice] session shown=${key}; flushing/re-sending context`);
    this._activateShownSession(resource);
  }
  /** Make a shown/focused session active: flush its buffered response, clear its pending indicator, and narrate its pending confirmation/response (loading the model first if a confirmation's detail isn't resident). */
  _activateShownSession(resource) {
    const key = resource.toString();
    this._lastShownSessionId = key;
    this._recordSessionAlias(resource);
    if (!this._isConnected.get()) {
      this.logService.trace(`[voice] _activateShownSession(${key.slice(-32)}) skipped: controller not connected (external=${this._externalActiveSessionMode})`);
      return;
    }
    const flushResult = this._flushDeferredResponse(key);
    this._clearConfirmationIndicator(key);
    if (this._confirmationDetailPending(resource)) {
      this._ensureModelLoaded(resource);
    }
    if (this._externalActiveSessionMode && !this._recentlyReadResponse.has(key)) {
      const heard = this._lastHeardTranscriptById.get(key);
      if (heard) {
        this._recentlyReadResponse.set(key, { transcript: heard, at: Date.now() });
      }
    }
    let narratable = this._currentNarratable(resource);
    const sessionKey = this._sessionKey(key);
    const pendingSummary = this._pendingResponseSummaries.get(sessionKey);
    const pendingSummaryFlushed = !!pendingSummary && flushResult.finalTranscripts.includes(this._normalizeTranscript(pendingSummary));
    this.logService.trace(`[voice] activate shown=${key.slice(-32)} pendingKey=${this._pendingResponseSummaries.has(sessionKey) ? sessionKey.slice(-32) : "<none>"} narratable=${narratable?.kind ?? "<none>"} flushedFinal=${flushResult.finalTranscripts.length} pendingFlushed=${pendingSummaryFlushed}`);
    if (!narratable && pendingSummary && !pendingSummaryFlushed) {
      narratable = { kind: "response", text: pendingSummary };
    }
    let handledResponse = pendingSummaryFlushed;
    this._sendContext();
    this.voiceClientService.flushSessionContext();
    if (narratable) {
      const wasJustPlayed = narratable.kind === "response" && flushResult.finalTranscripts.includes(this._normalizeTranscript(narratable.text));
      if (wasJustPlayed) {
        this._lastNarratedText.set(sessionKey, narratable.text);
        handledResponse = true;
      } else {
        const alreadyNarrated = narratable.kind === "response" && this._getLastNarratedText(key) === narratable.text;
        const pendingAlreadyHeard = narratable.kind !== "response" && this._narratedPending.get(sessionKey) === this._narratableIdentity(narratable);
        const staleResponse = narratable.kind === "response" && !this._pendingResponseSummaries.has(sessionKey);
        const bufferRetainedUnderPress = flushResult.retained === true && narratable.kind === "response" && !!flushResult.retainedTranscript && this._normalizeTranscript(narratable.text) === flushResult.retainedTranscript;
        if (pendingAlreadyHeard) {
          this.logService.trace(`[voice] activate skip: ${narratable.kind} already heard for ${key.slice(-32)}`);
        } else if (staleResponse) {
          this.logService.trace(`[voice] activate skip: stale response (no pending summary) for ${key.slice(-32)}`);
        } else if (bufferRetainedUnderPress) {
          this.logService.trace(`[voice] activate skip: buffered reply retained under held press for ${key.slice(-32)}`);
        } else {
          this._narrate(key, narratable.kind, narratable.text, void 0, void 0, narratable.confirmationType, narratable.pending);
        }
        if (narratable.kind === "response") {
          handledResponse = handledResponse || alreadyNarrated;
        }
      }
    }
    if (handledResponse) {
      this._clearPendingResponse(sessionKey);
    }
  }
  /** Ask the backend to narrate a session's pending item, de-duped by the exact text last spoken for it ({@link _lastNarratedText}) and by any in-flight request for the same text ({@link _pendingSolicitedNarrations}); the single narration trigger for both live and on-focus paths. Returns `true` when a request was actually SENT - NOT that the reply was heard (the audio may still be dropped/deferred/never arrive). The reply is marked narrated and its pending indicator cleared only once its audio finalizes (see {@link _markNarrationHeard}). */
  _narrate(sessionId, kind, text, reuseId, checkpoint, confirmationType, pending) {
    if (!text) {
      return false;
    }
    if (kind === "response" && this._getLastNarratedText(sessionId) === text) {
      return false;
    }
    const sessionKey = this._sessionKey(sessionId);
    const identity = this._narratableIdentity({ text, pending, confirmationType });
    for (const s of this._pendingSolicitedNarrations.values()) {
      if (s.kind === kind && this._narratableIdentity(s) === identity && this._sessionKey(s.sessionId) === sessionKey) {
        return false;
      }
    }
    if (kind !== "response") {
      this._preemptCheckpointPlayback();
    }
    if (kind === "confirmation") {
      this._sendContext();
      this.voiceClientService.flushSessionContext();
    }
    this.logService.trace(`[voice] narrate kind=${kind} id=${sessionId.slice(-32)}`);
    const narrationId = this.voiceClientService.requestNarration(sessionId, kind, text, reuseId, checkpoint, confirmationType, pending);
    if (!narrationId) {
      if (kind === "checkpoint") {
        return false;
      }
      this._pendingNarrationRetries.set(sessionId, { kind, text, confirmationType, pending });
      return false;
    }
    if (kind === "checkpoint") {
      this.logService.trace(`[voice][checkpoint] requested narration_id=${narrationId} request_id=${checkpoint?.requestId ?? "<unknown>"} phase=${checkpoint?.checkpointId ?? "<unknown>"} sequence=${checkpoint?.sequence ?? 0} seed=${JSON.stringify(text)}`);
    }
    this._prepareForPlayback();
    this._pendingNarrationRetries.delete(sessionId);
    this._clearDeferred(sessionKey);
    if (this._solicitedNarrationIds.size >= 64) {
      const oldest = this._solicitedNarrationIds.values().next().value;
      if (oldest !== void 0) {
        this._solicitedNarrationIds.delete(oldest);
      }
    }
    this._solicitedNarrationIds.add(narrationId);
    const audioStartTimer = setTimeout(() => {
      this._handleSolicitedNarrationAudioStartTimeout(narrationId);
    }, VoiceSessionController._SOLICITED_NARRATION_AUDIO_START_TIMEOUT_MS);
    this._pendingSolicitedNarrations.set(narrationId, {
      sessionId,
      kind,
      text,
      pending,
      checkpoint,
      confirmationType,
      audioStartTimer,
      hasReceivedAudio: false
    });
    return true;
  }
  _markSolicitedNarrationAudioStarted(narrationId) {
    if (!narrationId) {
      return;
    }
    const pending = this._pendingSolicitedNarrations.get(narrationId);
    if (!pending || pending.hasReceivedAudio) {
      return;
    }
    pending.hasReceivedAudio = true;
    clearTimeout(pending.audioStartTimer);
  }
  _handleSolicitedNarrationAudioStartTimeout(narrationId) {
    const pending = this._pendingSolicitedNarrations.get(narrationId);
    if (!pending || pending.hasReceivedAudio) {
      return;
    }
    this._pendingSolicitedNarrations.delete(narrationId);
    this._solicitedNarrationIds.delete(narrationId);
    if (this._awaitingReplyAudio || this._hasNarrationAwaitingAudio()) {
      this.logService.trace(`[voice] solicited narration ${narrationId.slice(0, 8)} timed out waiting for audio start; another response still expected, deferring state restore`);
      return;
    }
    this.logService.trace(`[voice] solicited narration ${narrationId.slice(0, 8)} timed out waiting for audio start; restoring idle state`);
    this._restoreVoiceStateAfterNarrationTimeout();
  }
  /** True while any tracked solicited narration is still waiting for its audio
   *  to start (i.e. a no-audio watchdog is still outstanding). */
  _hasNarrationAwaitingAudio() {
    for (const pending of this._pendingSolicitedNarrations.values()) {
      if (!pending.hasReceivedAudio) {
        return true;
      }
    }
    return false;
  }
  _clearPendingSolicitedNarration(narrationId, pending) {
    clearTimeout(pending.audioStartTimer);
    this._pendingSolicitedNarrations.delete(narrationId);
  }
  _notifyCheckpointPlaybackComplete(sessionId, narrationId, narration) {
    if (narration?.kind === "checkpoint" && narration.playbackId) {
      this.voiceClientService.sendNarrationPlaybackComplete(sessionId, narrationId, narration.playbackId);
    }
  }
  _restoreVoiceStateAfterNarrationTimeout() {
    if (this.ttsPlaybackService.isPlaying || this._audioQueue.length > 0 || this._currentPlaybackSessionId !== null || this._pttHeld) {
      return;
    }
    if (this._isHandsFreeEnabled() && this._window && this._isConnected.get()) {
      this._enterAutoListen();
      return;
    }
    this._voiceState.set("idle", void 0);
    this._statusText.set("Hold to speak...", void 0);
  }
  /** Mark a solicited narration's reply as actually heard once its final audio
   *  chunk arrives (responseId === the narration id we sent). Only now do we set
   *  the exactly-once dedup and clear the session's pending-response indicator,
   *  since a mere request acceptance is not proof the reply played. */
  _markNarrationHeard(narrationId) {
    const solicited = this._pendingSolicitedNarrations.get(narrationId);
    if (!solicited) {
      return;
    }
    this._clearPendingSolicitedNarration(narrationId, solicited);
    const sessionKey = this._sessionKey(solicited.sessionId);
    if (solicited.kind === "response") {
      this._lastNarratedText.set(sessionKey, solicited.text);
      this._clearPendingResponse(sessionKey);
    } else if (solicited.kind === "confirmation") {
      this._narratedPending.set(sessionKey, this._narratableIdentity(solicited));
      this.logService.trace(`[voice] confirmation heard for ${sessionKey.slice(-32)}; marking occurrence spoken`);
    }
  }
  /**
   * Handle a `narration_ack` for a `request_narration` we sent.
   *
   * `accepted` needs nothing: the request is already tracked in
   * {@link _pendingSolicitedNarrations} and its audio will finalize normally.
   * `busy` means the backend could not play right now (user speaking / reply in
   * flight); it will nudge us with `narration_unblocked` when the guard clears,
   * so we stop tracking the id as in-flight and remember it for a revalidated
   * retry. `invalid` and legacy `suppressed` are terminal, so we drop them entirely.
   */
  _handleNarrationAck(e) {
    if (e.disposition === "accepted") {
      return;
    }
    const key = this._sessionKey(e.codingSessionId);
    const solicited = this._pendingSolicitedNarrations.get(e.narrationId);
    if (solicited) {
      this._clearPendingSolicitedNarration(e.narrationId, solicited);
    }
    this._solicitedNarrationIds.delete(e.narrationId);
    if (e.disposition === "invalid" || e.disposition === "suppressed") {
      this.logService.trace(`[voice] narration_ack ${e.disposition} id=${e.narrationId.slice(0, 8)} reason=${e.reason ?? "<none>"}; dropping`);
      this._clearDeferred(key);
      if (solicited) {
        this.telemetryService.publicLog2("voiceNarrationDropped", { kind: solicited.kind, reason: e.disposition });
      }
      return;
    }
    const kind = solicited?.kind;
    const text = solicited?.text;
    if (kind && text) {
      if (kind === "checkpoint") {
        this.logService.trace(`[voice] narration_ack busy id=${e.narrationId.slice(0, 8)}; dropping checkpoint`);
        return;
      }
      this.logService.trace(`[voice] narration_ack busy id=${e.narrationId.slice(0, 8)} reason=${e.reason ?? "<none>"}; deferring`);
      this._deferredNarrations.set(key, { narrationId: e.narrationId, kind, text, reuseNarrationId: true, confirmationType: solicited.confirmationType, pending: solicited.pending });
      this.telemetryService.publicLog2("voiceNarrationDeferred", { kind, reason: "busy" });
    }
  }
  /**
   * Handle a `narration_interrupted`: an accepted, in-flight narration was
   * cancelled by barge-in. The backend evicted the id, so stop tracking it and
   * defer a revalidated retry (driven by the `narration_unblocked` that follows
   * once the barge-in turn ends).
   */
  _handleNarrationInterrupted(e) {
    const solicited = this._pendingSolicitedNarrations.get(e.narrationId);
    if (solicited) {
      if (solicited.kind === "checkpoint") {
        this._preemptCheckpointPlayback(e.codingSessionId, e.narrationId);
        return;
      }
      this._deferInterruptedNarration(e.narrationId, solicited);
      this.logService.trace(`[voice] narration_interrupted id=${e.narrationId.slice(0, 8)}; deferring for revalidation`);
      this.telemetryService.publicLog2("voiceNarrationDeferred", { kind: solicited.kind, reason: "interrupted" });
    } else {
      this._solicitedNarrationIds.delete(e.narrationId);
    }
  }
  _deferInterruptedNarration(narrationId, solicited) {
    this._clearPendingSolicitedNarration(narrationId, solicited);
    this._solicitedNarrationIds.delete(narrationId);
    if (solicited.kind === "checkpoint") {
      return;
    }
    this._deferredNarrations.set(this._sessionKey(solicited.sessionId), {
      narrationId,
      kind: solicited.kind,
      text: solicited.text,
      reuseNarrationId: false,
      pending: solicited.pending,
      confirmationType: solicited.confirmationType
    });
  }
  /**
   * The `narration_unblocked` nudge fired for a deferred narration. Revalidate
   * against the current session state and only re-request if it is still
   * warranted, reusing the same id for a busy retry when the text is unchanged
   * (so the backend dedups a lost ack), but minting a fresh id after an
   * interruption because the old id is tombstoned for late-audio suppression.
   * If it is no longer warranted (resolved, or a different kind), drop it.
   */
  _retryDeferredNarration(sessionKey, unblockedNarrationId) {
    const deferred = this._deferredNarrations.get(sessionKey);
    if (!deferred) {
      this.logService.trace(`[voice] narration_unblocked for ${sessionKey.slice(-32)} but nothing deferred; nothing to retry`);
      return false;
    }
    if (unblockedNarrationId && deferred.narrationId !== unblockedNarrationId) {
      this.logService.trace(`[voice] narration_unblocked id=${unblockedNarrationId.slice(0, 8)} for ${sessionKey.slice(-32)} does not match currently deferred id=${deferred.narrationId.slice(0, 8)}; a newer entry superseded it, skipping`);
      return false;
    }
    let resource;
    try {
      resource = URI.parse(sessionKey);
    } catch {
      resource = void 0;
    }
    const narratable = resource ? this._currentNarratable(resource) : void 0;
    if (!narratable || narratable.kind !== deferred.kind || narratable.text !== deferred.text || deferred.kind === "confirmation" && narratable.confirmationType !== deferred.confirmationType) {
      this.logService.trace(`[voice] deferred narration for ${sessionKey.slice(-32)} no longer warranted; dropping`);
      this._clearDeferred(sessionKey);
      this.telemetryService.publicLog2("voiceNarrationDropped", { kind: deferred.kind, reason: "stale" });
      return false;
    }
    if (this._shouldDeferForSession(sessionKey)) {
      this.logService.trace(`[voice] deferred narration for ${sessionKey.slice(-32)} no longer shown; dropping`);
      this._clearDeferred(sessionKey);
      this.telemetryService.publicLog2("voiceNarrationDropped", { kind: deferred.kind, reason: "session_changed" });
      return false;
    }
    const reuseId = deferred.reuseNarrationId && this._narratableIdentity(narratable) === this._narratableIdentity(deferred) ? deferred.narrationId : void 0;
    this.logService.trace(`[voice] retrying deferred narration for ${sessionKey.slice(-32)} reuse=${!!reuseId}`);
    this._clearDeferred(sessionKey);
    return this._narrate(sessionKey, narratable.kind, narratable.text, reuseId, void 0, narratable.confirmationType, narratable.pending);
  }
  _retryPendingNarration(sessionId, pending) {
    let resource;
    try {
      resource = URI.parse(sessionId);
    } catch {
      this.logService.trace(`[voice] queued confirmation for invalid session id; dropping`);
      return false;
    }
    const current = this._currentNarratable(resource);
    if (!current || current.kind !== pending.kind || this._narratableIdentity(current) !== this._narratableIdentity(pending)) {
      this.logService.trace(`[voice] queued narration for ${sessionId.slice(-32)} no longer matches current state; dropping`);
      return false;
    }
    if (current.kind !== "response" && this._shouldDeferForSession(this._sessionKey(sessionId))) {
      this.logService.trace(`[voice] queued narration for ${sessionId.slice(-32)} is no longer shown; dropping`);
      return false;
    }
    return this._narrate(sessionId, current.kind, current.text, void 0, void 0, current.confirmationType, current.pending);
  }
  /** Drop a deferred narration. */
  _clearDeferred(sessionKey) {
    this._deferredNarrations.delete(sessionKey);
  }
  /** The pending item a session would narrate now (waiting confirmation prompt or completed reply summary), from the resident model or cached summary/status; returns undefined (kicking off a load) if a confirmation's detail isn't ready. */
  _currentNarratable(resource) {
    const model = this.chatService.getSession(resource);
    if (model) {
      const question = this._questionNarratable(model);
      if (question) {
        return question;
      }
      const info = this._getAgentStateInfo(model);
      if (info.state === "waiting_for_confirmation" && info.detail) {
        return { kind: "confirmation", text: info.detail, confirmationType: info.confirmation_type };
      }
      if (info.state === "idle" && info.last_response_summary) {
        return { kind: "response", text: info.last_response_summary };
      }
      return void 0;
    }
    const session = this.agentSessionsService.model.sessions.find((s) => !s.isArchived() && isEqual(s.resource, resource));
    if (session?.status === AgentSessionStatus.NeedsInput) {
      this._ensureModelLoaded(resource);
      return void 0;
    }
    if (session?.status === AgentSessionStatus.Completed) {
      const summary = this._lastResponseSummaryById.get(resource.toString());
      if (summary) {
        return { kind: "response", text: summary };
      }
      this._ensureModelLoaded(resource);
      return void 0;
    }
    return void 0;
  }
  /**
   * The id of the pending item a session is showing right now, or `''`.
   *
   * Used as a per-occurrence fingerprint in state-transition detection: the
   * prose `detail` two forms produce can be identical, so without this,
   * replacing one form with another inside `waiting_for_confirmation` looks
   * like no change at all and is never narrated.
   */
  _pendingIdFor(sessionId) {
    const model = this._modelForSession(sessionId);
    return (model ? this._buildPendingPayload(model)?.pending_id : void 0) ?? "";
  }
  /**
   * The identity of one *occurrence* of a narratable item, for dedup.
   *
   * Two forms can ask the same questions and two tools can raise the same
   * prompt, so keying "already heard" on text alone swallows the second one.
   * Text is only a fallback for narratables with no structured pending.
   */
  _narratableIdentity(narratable) {
    return narratable.pending ? `#${narratable.pending.pendingId}` : `${narratable.confirmationType ?? ""}:${narratable.text}`;
  }
  /**
   * The spoken form of a session's pending question form, if it has one.
   *
   * This asks for *the form*, not a particular question in it: the backend owns
   * the draft of answers so far, so only it knows which question the form is
   * waiting on. Naming one here would leave a partially answered form silent,
   * since the client only ever sees question 1. The text is used during the
   * debounce window before the backend's mirror catches up, which is by
   * definition first sighting.
   */
  _questionNarratable(model) {
    const pending = model ? this._buildPendingPayload(model) : void 0;
    const question = pending?.type === "questions" ? pending.questions?.[0] : void 0;
    if (!pending || !question) {
      return void 0;
    }
    return {
      kind: "question",
      text: formatQuestionPrompt(question, pending.allow_skip === true),
      pending: { pendingId: pending.pending_id }
    };
  }
  /**
   * True when a session is awaiting confirmation but its confirmation detail is
   * not yet available (model not loaded, or the pending-confirmation part hasn't
   * rendered). Used to avoid narrating a detail-less confirmation on the first
   * context send followed by the detailed one moments later.
   */
  _confirmationDetailPending(resource) {
    const session = this.agentSessionsService.model.sessions.find((s) => !s.isArchived() && isEqual(s.resource, resource));
    if (!session || session.status !== AgentSessionStatus.NeedsInput) {
      return false;
    }
    const model = this.chatService.getSession(resource);
    if (!model) {
      return true;
    }
    const info = this._getAgentStateInfo(model);
    return info.state !== "waiting_for_confirmation" || !info.detail;
  }
  /**
   * The session the user is actively working with for the purpose of routing
   * voice audio: the explicitly targeted session if one is set, otherwise the
   * session most recently shown to the user (across all widgets, so an opened
   * session that hasn't taken DOM focus still counts), falling back to the raw
   * focused widget. This mirrors how `_buildSessionContext` computes the
   * backend's `is_active` session, so playback and the backend agree on which
   * session is "active" and everything else is a background narration.
   */
  _getActiveSessionId() {
    if (this._externalActiveSessionMode) {
      return this._targetSession.get()?.toString() ?? this._activeSessionShown;
    }
    return this._targetSession.get()?.toString() ?? this._activeSessionShown ?? this._lastShownSessionId ?? this._getFocusedSessionId();
  }
  /**
   * The session the user is currently looking at, used to route deferral and
   * decide which completions narrate immediately vs. defer + indicate.
   *
   * In focus-based (main-window) mode this is the LIVE focused session, NOT the
   * sticky `_lastShownSessionId`: that field is updated by any tracked chat
   * widget's view-model swap (see `_trackWidgetSession`), so while the backend
   * works a background session it can transiently point there and make that
   * session look "shown" - which suppressed deferral, the pending indicator, and
   * on-focus playback for responses. The confirmation indicator has always used
   * live focus (see `_reconcileConfirmationIndicators`) and worked correctly;
   * this keeps responses consistent with it. Opening a session still flushes its
   * buffer directly via `_onSessionShown`, so the sticky value isn't needed here.
   * Unlike {@link _getActiveSessionId} it ignores the sticky input
   * `_targetSession` (where the next utterance is sent, not what is viewed).
   */
  _shownSessionId() {
    if (this._externalActiveSessionMode) {
      return this._activeSessionShown;
    }
    return this._getFocusedSessionId();
  }
  setActiveSessionShown(resource) {
    const key = resource?.toString();
    if (!resource) {
      if (!this._externalActiveSessionMode && this._activeSessionShown === void 0) {
        return;
      }
      this.logService.trace(`[voice] setActiveSessionShown=<none>; restoring focus-based detection (was ${this._activeSessionShown ?? "<none>"})`);
      this._externalActiveSessionMode = false;
      this._activeSessionShown = void 0;
      this._onFocusedSessionChanged();
      return;
    }
    this._externalActiveSessionMode = true;
    const definedKey = key;
    if (this._isSameSession(definedKey, this._activeSessionShown)) {
      const sessionKey = this._sessionKey(definedKey);
      if (this._pendingOwned(sessionKey)) {
        this.logService.trace(`[voice] re-pinned active session=${definedKey} has pending voice work; re-activating`);
        this._activateShownSession(resource);
      }
      return;
    }
    this.logService.trace(`[voice] setActiveSessionShown=${definedKey} (was ${this._activeSessionShown ?? "<none>"})`);
    this._activeSessionShown = definedKey;
    this._activateShownSession(resource);
  }
  activateSession(resource) {
    const key = resource.toString();
    this.logService.trace(`[voice] activateSession=${key} (explicit UI action)`);
    if (this._externalActiveSessionMode) {
      this._activeSessionShown = key;
    }
    this._activateShownSession(resource);
  }
  /**
   * Routing decision for one audio-response chunk. When the backend echoes a
   * per-response id, decide the whole response's fate once (on its first chunk),
   * store it in {@link _responseRoutes}, and make every later chunk of that id
   * follow it - so interleaved responses for different sessions never steal each
   * other's routing and a response is never split. Without a responseId, defer
   * to the legacy session-keyed {@link _shouldDeferResponse}.
   */
  _shouldDeferResponseStream(responseId, sessionId, isFirstChunk) {
    if (!responseId) {
      return this._shouldDeferResponse(sessionId, isFirstChunk);
    }
    const known = this._responseRoutes.get(responseId);
    if (known !== void 0) {
      return known === "deferred";
    }
    const defer = this._shouldDeferForSession(sessionId);
    this._responseRoutes.set(responseId, defer ? "deferred" : "live");
    return defer;
  }
  /** Whether two session ids refer to the same session, tolerant of the two id
   *  spaces (bare backend id vs UI resource) and trivial serialization
   *  differences. Mirrors the matching used to flush buffered responses so the
   *  defer decision and the flush agree on identity. */
  _isSameSession(a, b) {
    if (!a || !b) {
      return false;
    }
    if (a === b || this._canonicalSessionId(a) === this._canonicalSessionId(b)) {
      return true;
    }
    try {
      return isEqual(URI.parse(a), URI.parse(b));
    } catch {
      return false;
    }
  }
  /** Alias-aware read of the last text narrated for a session, used for
   *  exactly-once dedupe. */
  _getLastNarratedText(sessionId) {
    return this._lastNarratedText.get(this._sessionKey(sessionId));
  }
  /** Clear the last-narrated dedupe for a session. */
  _clearLastNarratedText(sessionId) {
    this._lastNarratedText.delete(this._sessionKey(sessionId));
  }
  /** Whether a response for `sessionId` should defer: true unless it is the
   *  session currently shown to the user (untagged audio → play). A reply the
   *  user is awaiting is NOT exempted: if they switched away before it arrived,
   *  it is deferred like any other background narration and flushed on return. */
  _shouldDeferForSession(sessionId) {
    if (!sessionId) {
      return false;
    }
    return !this._isSameSession(this._shownSessionId(), sessionId);
  }
  /** True when one of the session's buffered responses is the SAME stream as
   *  `responseId` (so a live chunk for it is a promotion, not a new response). */
  _deferredBufferHasResponse(sessionId, responseId) {
    if (!responseId) {
      return false;
    }
    return this._deferredResponses.get(sessionId)?.some((r) => r.responseId === responseId) ?? false;
  }
  /**
   * A response is deferred when it is a background narration for a session the
   * user is NOT looking at. It plays immediately only for the shown session (or
   * when it is untagged audio); a reply the user was awaiting but has since
   * switched away from is deferred like any other background narration.
   *
   * The decision is made on the first chunk and recorded in `_liveReplyKeys`;
   * remaining chunks follow the same decision so a response is never split
   * between playback and the deferred buffer. This session-keyed heuristic is
   * the fallback for backends that don't echo a per-response id; when they do,
   * {@link _shouldDeferResponseStream} routes by that id instead.
   */
  _shouldDeferResponse(sessionId, isFirstChunk) {
    const key = sessionId ? this._sessionKey(sessionId) : "";
    if (isFirstChunk) {
      if (!sessionId) {
        this._liveReplyKeys.add(key);
        return false;
      }
      if (!this._shouldDeferForSession(sessionId)) {
        this._liveReplyKeys.add(key);
        return false;
      }
      this._liveReplyKeys.delete(key);
      return true;
    }
    if (this._deferredResponses.has(key)) {
      return true;
    }
    if (this._liveReplyKeys.has(key)) {
      return false;
    }
    return this._shouldDeferForSession(sessionId);
  }
  _deferResponse(sessionId, audio, isFirstChunk, isFinal, transcript, responseId, turnId) {
    const key = this._sessionKey(sessionId);
    let responses = this._deferredResponses.get(key);
    if (!responses) {
      responses = [];
      this._deferredResponses.set(key, responses);
    }
    let response;
    if (!isFirstChunk) {
      response = responseId ? responses.find((r) => r.responseId === responseId) : [...responses].reverse().find((r) => !r.finalized);
    }
    if (!response) {
      response = { responseId, turnId, finalized: false, chunks: [] };
      responses.push(response);
      this._markPendingResponse(key, true);
      this.logService.trace(`[voice] deferring response for unfocused session=${key} (buffered=${responses.length}); showing pending indicator`);
    }
    response.chunks.push({ audio, isFirstChunk, isFinal, transcript });
    if (isFinal) {
      response.finalized = true;
    }
  }
  /** Find the buffered-response key for a now-shown session. The buffer is keyed
   *  by the canonical session key ({@link _sessionKey}); a structural URI-equality
   *  fallback guards a trivial serialization difference between the backend's
   *  coding_session_id and the focused sessionResource. */
  _matchDeferredKey(sessionId) {
    const key = this._sessionKey(sessionId);
    if (this._deferredResponses.has(key)) {
      return key;
    }
    if (this._deferredResponses.size === 0) {
      return void 0;
    }
    let focusedUri;
    try {
      focusedUri = URI.parse(key);
    } catch {
      focusedUri = void 0;
    }
    if (focusedUri) {
      for (const candidate of this._deferredResponses.keys()) {
        try {
          if (isEqual(URI.parse(candidate), focusedUri)) {
            return candidate;
          }
        } catch {
        }
      }
    }
    return void 0;
  }
  /** Replays all buffered responses for a now-shown session, in arrival order.
   *  Returns whether anything was flushed plus the normalized final transcript
   *  of each response played, so the caller can mark _lastNarratedText only for
   *  text that was actually read (never a newer, unplayed summary). */
  _flushDeferredResponse(sessionId) {
    const key = this._matchDeferredKey(sessionId);
    if (!key) {
      if (this._deferredResponses.size > 0) {
        this.logService.trace(`[voice] no buffered response matches focused=${sessionId}; pending keys=[${[...this._deferredResponses.keys()].join(", ")}]`);
      }
      return { flushed: false, finalTranscripts: [] };
    }
    const responses = this._deferredResponses.get(key);
    if (!responses || responses.length === 0) {
      this._deferredResponses.delete(key);
      this._maybeHideIndicator(key);
      return { flushed: false, finalTranscripts: [] };
    }
    if (!this._prepareForPlayback()) {
      this.logService.trace(`[voice] deferred flush for session=${key} deferred: held deliberate press preserved, keeping ${responses.length} buffered response(s)`);
      const retainedFinals = responses.map((r) => this._normalizeTranscript([...r.chunks].reverse().find((c) => c.transcript)?.transcript ?? "")).filter((t) => !!t);
      return { flushed: false, retained: true, retainedTranscript: retainedFinals[retainedFinals.length - 1], finalTranscripts: [] };
    }
    this._deferredResponses.delete(key);
    this._maybeHideIndicator(key);
    const totalChunks = responses.reduce((n, r) => n + r.chunks.length, 0);
    this.logService.trace(`[voice] flushing ${responses.length} buffered response(s) (${totalChunks} chunk(s)) for now-focused session=${key}`);
    for (const r of responses) {
      if (r.responseId && !r.finalized) {
        this._responseRoutes.set(r.responseId, "live");
      }
    }
    const finalTranscripts = responses.map((r) => this._normalizeTranscript([...r.chunks].reverse().find((c) => c.transcript)?.transcript ?? "")).filter((t) => !!t);
    const flushedTranscript = finalTranscripts[finalTranscripts.length - 1];
    if (flushedTranscript) {
      this._recentlyReadResponse.set(key, { transcript: flushedTranscript, at: Date.now() });
      this._lastHeardTranscriptById.set(key, flushedTranscript);
    }
    for (const r of responses) {
      for (const chunk of r.chunks) {
        this._enqueueAudio(key, chunk.audio, chunk.isFirstChunk, chunk.isFinal, chunk.transcript, r.responseId);
      }
    }
    return { flushed: true, finalTranscripts };
  }
  /**
   * Get the controller out of listening/auto-listen and ready the playback slot
   * so an about-to-arrive (or just-buffered) narration actually plays instead of
   * being suppressed. Used before flushing a deferred response and before
   * narrating a freshly-shown session's pending item (e.g. a confirmation, which
   * carries no buffered audio and so never hits the flush path) - otherwise the
   * controller can sit in listening and the echoed audio is dropped, leaving the
   * user staring at a focused session that never speaks.
   *
   * Returns `true` when the playback slot is ready (no press held, or a passive
   * open-mic turn was torn down), and `false` when it deliberately preserved a
   * held non-passive press. A `false` return tells the flush caller to leave its
   * buffered audio deferred rather than play it over the user's live press.
   */
  _prepareForPlayback() {
    this._clearAutoListenTimer();
    this._autoListenSuppressed = false;
    if (this._pttHeld && !this._pttCurrentTurnPassive) {
      return false;
    }
    if (this._pttHeld) {
      this._finishPtt("auto", "internal");
    }
    this._pttToggleMode = false;
    this._pttHeld = false;
    this._suppressIncomingAudio = false;
    if (!this.ttsPlaybackService.isPlaying && this._currentPlaybackSessionId !== null) {
      this._currentPlaybackSessionId = null;
    }
    return true;
  }
  /**
   * True when an incoming reply is a re-narration of a reply we recently read
   * for this session (played live or flushed from the deferred buffer). The
   * backend re-emits a session's reply when that session becomes active (on
   * focus), which would otherwise be read a second time. We drop it ONLY when
   * its transcript matches what we recently read AND arrives within
   * RENARRATION_DEDUPE_WINDOW_MS - so a genuinely new reply (different text)
   * always plays, and so does a later identical reply once the window lapses.
   * The whole response (including continuation chunks) is dropped until final.
   *
   * This is purely content-based: it never suppresses a reply just because the
   * session was heard before, which is what let the backend's server-side
   * deferral of a NEW reply (delivered as an on-focus narration) be swallowed.
   */
  _isRenarration(responseId, sessionId, transcript, isFirstChunk, isFinal) {
    if (!sessionId) {
      return false;
    }
    const dropKey = responseId ?? sessionId;
    if (responseId && this._solicitedNarrationIds.has(responseId)) {
      if (isFinal) {
        this._solicitedNarrationIds.delete(responseId);
      }
      return false;
    }
    if (!isFirstChunk && this._droppingRenarration.has(dropKey)) {
      if (isFinal) {
        this._droppingRenarration.delete(dropKey);
      }
      return true;
    }
    if (!isFirstChunk) {
      return false;
    }
    if (this._awaitingReplyAudio && this._awaitingReplyForSession === sessionId) {
      return false;
    }
    const recent = this._recentlyReadResponse.get(sessionId);
    if (recent === void 0) {
      return false;
    }
    if (Date.now() - recent.at > VoiceSessionController.RENARRATION_DEDUPE_WINDOW_MS) {
      this._recentlyReadResponse.delete(sessionId);
      return false;
    }
    const incoming = this._normalizeTranscript(transcript ?? "");
    if (!incoming || !(recent.transcript === incoming || recent.transcript.startsWith(incoming))) {
      return false;
    }
    this._liveReplyKeys.delete(sessionId);
    if (!isFinal) {
      this._droppingRenarration.add(dropKey);
    }
    return true;
  }
  /** Lowercase, collapse whitespace and strip surrounding punctuation so two
   *  transcripts of the same reply compare equal despite minor formatting. */
  _normalizeTranscript(text) {
    return text.toLowerCase().replace(/\s+/g, " ").replace(/^[\s.,!?;:'"]+|[\s.,!?;:'"]+$/g, "").trim();
  }
  _markPendingResponse(sessionId, pending) {
    try {
      this.voicePlaybackService.setPendingResponse(URI.parse(sessionId), pending);
    } catch {
    }
  }
  /**
   * Reconcile the sessions-list "pending response" indicator for confirmations.
   * A session that is awaiting user confirmation while NOT focused should show
   * the indicator; once it is focused or the confirmation is resolved the
   * indicator is cleared. This is driven purely from client-observed session
   * state, so it is accurate regardless of whether the backend narrates the
   * confirmation as audio.
   */
  _reconcileConfirmationIndicators(waitingSessionIds) {
    const activeId = this._externalActiveSessionMode ? this._activeSessionShown : this._getFocusedSessionId();
    const activeKey = activeId ? this._sessionKey(activeId) : void 0;
    const waitingKeys = /* @__PURE__ */ new Set();
    for (const sessionId of waitingSessionIds) {
      const key = this._sessionKey(sessionId);
      waitingKeys.add(key);
      if (key === activeKey) {
        this._clearConfirmationIndicator(key);
        continue;
      }
      if (!this._confirmationPendingSessions.has(key)) {
        this._confirmationPendingSessions.add(key);
        this._markPendingResponse(key, true);
      }
    }
    for (const key of [...this._confirmationPendingSessions]) {
      if (waitingKeys.has(key) && key !== activeKey) {
        continue;
      }
      this._clearConfirmationIndicator(key);
    }
  }
  _clearConfirmationIndicator(sessionId) {
    const key = this._sessionKey(sessionId);
    if (this._confirmationPendingSessions.delete(key)) {
      this._maybeHideIndicator(key);
    }
  }
  /** Drop a session's pending-response (completed-reply) indicator/summary. */
  _clearPendingResponse(sessionId) {
    const key = this._sessionKey(sessionId);
    if (this._pendingResponseSummaries.delete(key)) {
      this._maybeHideIndicator(key);
    }
  }
  /** Hide the sessions-list indicator only when no owner still needs it. The
   *  same visible indicator is shared by three independent sources - an
   *  unfocused confirmation, buffered deferred audio, and a completed
   *  background reply - so it must stay visible until all are resolved. */
  _maybeHideIndicator(sessionId) {
    const key = this._sessionKey(sessionId);
    if (this._pendingOwned(key)) {
      return;
    }
    this._markPendingResponse(key, false);
  }
  _clearDeferredResponses() {
    for (const key of this._deferredResponses.keys()) {
      this._markPendingResponse(key, false);
    }
    this._deferredResponses.clear();
    this._responseRoutes.clear();
    for (const key of this._confirmationPendingSessions) {
      this._markPendingResponse(key, false);
    }
    this._confirmationPendingSessions.clear();
    for (const key of this._pendingResponseSummaries.keys()) {
      this._markPendingResponse(key, false);
    }
    this._pendingResponseSummaries.clear();
  }
  // --- Audio FIFO queue ---
  _preemptCheckpointPlayback(sessionId, targetNarrationId, stopActivePlayback = true) {
    const sessionKey = sessionId ? this._sessionKey(sessionId) : void 0;
    const shouldPreempt = (candidateSessionId, candidateNarrationId, narration) => {
      return narration?.kind === "checkpoint" && (targetNarrationId === void 0 || candidateNarrationId === targetNarrationId) && (sessionKey === void 0 || candidateSessionId !== void 0 && this._sessionKey(candidateSessionId) === sessionKey);
    };
    const interruptedIds = /* @__PURE__ */ new Set();
    for (let i = this._audioQueue.length - 1; i >= 0; i--) {
      const queued = this._audioQueue[i];
      if (!shouldPreempt(queued.sessionId, queued.responseId, queued.narration)) {
        continue;
      }
      if (queued.responseId) {
        interruptedIds.add(queued.responseId);
      }
      this._audioQueue.splice(i, 1);
    }
    for (const [candidateNarrationId, pending] of this._pendingSolicitedNarrations) {
      if (pending.kind !== "checkpoint" || targetNarrationId !== void 0 && candidateNarrationId !== targetNarrationId || sessionKey !== void 0 && this._sessionKey(pending.sessionId) !== sessionKey) {
        continue;
      }
      interruptedIds.add(candidateNarrationId);
      this._clearPendingSolicitedNarration(candidateNarrationId, pending);
      this._solicitedNarrationIds.delete(candidateNarrationId);
    }
    for (const narrationId of interruptedIds) {
      this._rememberInterruptedAudioId(narrationId);
    }
    const activeCheckpointMatches = shouldPreempt(this._currentPlaybackSessionId ?? void 0, this._currentPlaybackResponseId, this._currentPlaybackNarration);
    if (activeCheckpointMatches && this._currentPlaybackResponseId) {
      this._rememberInterruptedAudioId(this._currentPlaybackResponseId);
    }
    if (activeCheckpointMatches && stopActivePlayback) {
      this._stopCurrentPlaybackAsInterrupted();
    }
  }
  _interruptAssistantPlayback() {
    const interruptedSessionId = this._currentPlaybackSessionId ?? this._shownSessionId();
    if (interruptedSessionId) {
      this._cancelVoiceProgress(interruptedSessionId);
    }
    this._preemptCheckpointPlayback(void 0, void 0, false);
    this._rememberInterruptedPlaybackIds();
    this._telemetryTtsInterrupted = this._telemetryTtsInterrupted || this.ttsPlaybackService.isPlaying;
    this._audioQueue.length = 0;
    this._currentPlaybackSessionId = null;
    this._currentPlaybackFinalized = false;
    this._isProcessingQueue = false;
    this._suppressIncomingAudio = true;
    this.ttsPlaybackService.stopPlayback();
    this._currentPlaybackResponseId = void 0;
    this._currentPlaybackNarration = void 0;
    this.voicePlaybackService.notifyPlaybackEnd(void 0);
  }
  _stopCurrentPlaybackAsInterrupted() {
    if (this.ttsPlaybackService.isPlaying) {
      this._telemetryTtsInterrupted = true;
      this.ttsPlaybackService.stopPlayback();
      return;
    }
    this.ttsPlaybackService.stopPlayback();
    this._telemetryTtsInterrupted = false;
    this._currentPlaybackSessionId = null;
    this._currentPlaybackResponseId = void 0;
    this._currentPlaybackNarration = void 0;
    this._currentPlaybackFinalized = false;
    this.voicePlaybackService.notifyPlaybackEnd(void 0);
    if (this._audioQueue.length > 0) {
      if (!this._isProcessingQueue) {
        this._processQueue();
      }
    } else {
      this._restoreVoiceStateAfterNarrationTimeout();
    }
  }
  /**
   * Stop reading an actionable pending request aloud once it has been resolved
   * (e.g. the user pressed Allow, or answered the form with the mouse, before
   * the narration finished). Cancels the session's in-flight
   * confirmation/question narration(s): drops their queued audio, remembers
   * their ids so trailing / not-yet arrived chunks are swallowed in the
   * `audio_response` handler, and cuts off playback if one of them is what is
   * currently speaking. The agent's subsequent real reply uses a different
   * narration id and is unaffected.
   *
   * Responses are deliberately exempt: a completed reply stays worth hearing
   * after the thing it describes has been dealt with, whereas a prompt for an
   * action that has already been taken is only confusing.
   */
  _stopPendingNarration(sessionId) {
    const sessionKey = this._sessionKey(sessionId);
    const cancelledIds = /* @__PURE__ */ new Set();
    for (const [narrationId, pending] of this._pendingSolicitedNarrations) {
      if (pending.kind !== "response" && this._sessionKey(pending.sessionId) === sessionKey) {
        cancelledIds.add(narrationId);
        this._clearPendingSolicitedNarration(narrationId, pending);
      }
    }
    if (cancelledIds.size === 0) {
      return;
    }
    for (let i = this._audioQueue.length - 1; i >= 0; i--) {
      const responseId = this._audioQueue[i].responseId;
      if (responseId !== void 0 && cancelledIds.has(responseId)) {
        this._audioQueue.splice(i, 1);
      }
    }
    for (const id of cancelledIds) {
      if (this._cancelledPendingNarrationIds.size >= 64) {
        const oldest = this._cancelledPendingNarrationIds.values().next().value;
        if (oldest !== void 0) {
          this._cancelledPendingNarrationIds.delete(oldest);
        }
      }
      this._cancelledPendingNarrationIds.add(id);
    }
    for (const [key, responses] of this._deferredResponses) {
      const kept = responses.filter((r) => r.responseId === void 0 || !cancelledIds.has(r.responseId));
      if (kept.length === responses.length) {
        continue;
      }
      if (kept.length === 0) {
        this._deferredResponses.delete(key);
      } else {
        this._deferredResponses.set(key, kept);
      }
      this._maybeHideIndicator(key);
    }
    for (const id of cancelledIds) {
      this._responseRoutes.delete(id);
    }
    if (this._currentPlaybackResponseId !== void 0 && cancelledIds.has(this._currentPlaybackResponseId)) {
      this._stopCurrentPlaybackAsInterrupted();
    }
  }
  _enqueueAudio(sessionId, audio, isFirstChunk, isFinal, transcript, responseId, narration) {
    const isCheckpointNarration = narration?.kind === "checkpoint";
    this._clearAutoListenTimer();
    if (this._suppressIncomingAudio) {
      if (isFirstChunk) {
        this._suppressIncomingAudio = false;
      } else {
        return;
      }
    }
    if (isFirstChunk && !isCheckpointNarration) {
      this._clearAwaitingReply();
    }
    const nothingPlaying = this._currentPlaybackSessionId === null;
    const sameSession = !nothingPlaying && this._currentPlaybackSessionId === sessionId;
    const continuationOfCurrent = sameSession && !isFirstChunk && !this._currentPlaybackFinalized;
    if (nothingPlaying && this._audioQueue.length === 0 || continuationOfCurrent) {
      this._playChunk(sessionId, audio, isFirstChunk, isFinal, transcript, responseId, narration);
      return;
    }
    let entry = isFirstChunk ? void 0 : [...this._audioQueue].reverse().find(
      (e) => !e.finalized && (e.sessionId === sessionId || e.sessionId === void 0 && sessionId === void 0)
    );
    if (!entry) {
      entry = { sessionId, responseId, narration, finalized: false, chunks: [] };
      this._audioQueue.push(entry);
    }
    entry.chunks.push({ audio, isFirstChunk, isFinal, transcript });
    if (isFinal) {
      entry.finalized = true;
    }
    if (this._currentPlaybackSessionId === null && !this._isProcessingQueue) {
      this._processQueue();
    }
  }
  _playChunk(sessionId, audio, isFirstChunk, isFinal, transcript, responseId, narration) {
    const isCheckpointNarration = narration?.kind === "checkpoint";
    if (transcript) {
      this._setAssistantTurn(transcript, { startNewTurn: isFirstChunk });
    }
    const sessionResource = sessionId ? URI.parse(sessionId) : void 0;
    if (sessionResource) {
      this.voicePlaybackService.notifyPlaybackStart(sessionResource, transcript);
    }
    const speakResponsesEnabled = this.configurationService.getValue("agents.voice.speakResponses") !== false;
    if (speakResponsesEnabled && audio) {
      this._currentPlaybackSessionId = sessionId;
      this._currentPlaybackResponseId = responseId;
      this._currentPlaybackNarration = narration;
      this._currentPlaybackFinalized = isFinal;
      this._clearAutoListenTimer();
      if (!isCheckpointNarration) {
        this._replyPlayedSinceSend = true;
      }
      this._voiceState.set("speaking", void 0);
      this._statusText.set("Speaking...", void 0);
      this.ttsPlaybackService.playAudioChunk(audio, isFinal, this._window);
      if (this._isHandsFreeEnabled()) {
        this._startBargeInListen();
      } else {
        this.micCaptureService.suppressUntil(Date.now() + 800);
      }
    } else if (!speakResponsesEnabled) {
      if (!isCheckpointNarration) {
        this._replyPlayedSinceSend = true;
      }
      if (isFinal) {
        this._currentPlaybackSessionId = null;
        this._currentPlaybackResponseId = void 0;
        this._currentPlaybackNarration = void 0;
        if (responseId) {
          if (sessionId) {
            this._notifyCheckpointPlaybackComplete(sessionId, responseId, narration);
          }
          this._markNarrationHeard(responseId);
        }
        if (!this._isProcessingQueue) {
          this._processQueue();
        }
        if (this._isHandsFreeEnabled()) {
          this._scheduleAutoListen();
        }
      }
    } else {
      if (isFinal && this._currentPlaybackSessionId === sessionId) {
        this._currentPlaybackFinalized = true;
      }
      this.ttsPlaybackService.playAudioChunk(audio, isFinal, this._window);
    }
  }
  _processQueue() {
    this._isProcessingQueue = true;
    while (this._currentPlaybackSessionId === null && this._audioQueue.length > 0) {
      const next = this._audioQueue.shift();
      for (const chunk of next.chunks) {
        this._playChunk(next.sessionId, chunk.audio, chunk.isFirstChunk, chunk.isFinal, chunk.transcript, next.responseId, next.narration);
      }
    }
    this._isProcessingQueue = false;
  }
  // --- Replay from cache ---
  _replaySessionAudio(sessionId) {
    this._stopReplay();
    const samples = this._sessionAudioCache.get(sessionId);
    if (!samples || !this._window) {
      return;
    }
    const ctx = this.ttsPlaybackService.ensureContext(this._window);
    const buffer = ctx.createBuffer(1, samples.length, 24e3);
    buffer.getChannelData(0).set(samples);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    this._replaySourceNode = source;
    const sessionResource = URI.parse(sessionId);
    this.voicePlaybackService.notifyPlaybackStart(sessionResource, void 0);
    this._voiceState.set("speaking", void 0);
    this._statusText.set("Replaying...", void 0);
    source.onended = () => {
      if (this._replaySourceNode === source) {
        this._replaySourceNode = void 0;
        this.voicePlaybackService.notifyPlaybackEnd(sessionResource);
        this._voiceState.set("idle", void 0);
        this._statusText.set("Hold to speak...", void 0);
      }
    };
    source.start(0);
  }
  _stopReplay() {
    if (this._replaySourceNode) {
      try {
        this._replaySourceNode.stop();
      } catch {
      }
      this._replaySourceNode = void 0;
    }
  }
  // --- Private helpers ---
  _sendContext() {
    this.voiceClientService.sendSessionContext(this._buildSessionContext());
  }
  /**
   * (Re)arm the settle timer that emits buffered session state changes. Each
   * detected transition resets the timer, so a rapid burst (e.g. the history
   * replay ``thinking <-> idle`` storm) is collapsed to one emission once the
   * state stops changing. See {@link _pendingStateChanges}.
   */
  _scheduleStateChangeEmit() {
    if (this._stateChangeEmitTimer) {
      clearTimeout(this._stateChangeEmitTimer);
    }
    this._stateChangeEmitTimer = setTimeout(() => {
      this._stateChangeEmitTimer = void 0;
      this._emitPendingStateChanges();
    }, VoiceSessionController._STATE_CHANGE_SETTLE_MS);
  }
  /** React to a session reaching a narratable state. If it's the shown session, speak it now; a completed reply on a background session instead shows the sessions-list pending indicator and is read when focused. A new turn (`thinking`) clears both the dedup and any stale pending indicator. */
  _handleNarratableStateChange(sessionId, currentState, detail, lastResponseSummary, shownNow, confirmationType) {
    const sessionKey = this._sessionKey(sessionId);
    if (currentState === "idle" || currentState === "waiting_for_confirmation") {
      this._cancelVoiceProgress(sessionId);
    }
    if (currentState === "thinking") {
      this._clearLastNarratedText(sessionKey);
      this._clearPendingResponse(sessionKey);
      this._clearDeferred(sessionKey);
    }
    if (!this._isSameSession(sessionId, shownNow)) {
      if (currentState === "idle" && lastResponseSummary) {
        const alreadyRead = this._lastNarratedText.get(sessionKey) === lastResponseSummary;
        const existingSummary = this._pendingResponseSummaries.get(sessionKey);
        if (!alreadyRead && existingSummary !== lastResponseSummary) {
          this._pendingResponseSummaries.set(sessionKey, lastResponseSummary);
          this._markPendingResponse(sessionKey, true);
          this.logService.trace(`[voice] response completed for unfocused session=${sessionKey.slice(-32)}; showing pending indicator`);
        }
      }
      return;
    }
    if (currentState === "idle" && lastResponseSummary) {
      const alreadyNarrated = this._lastNarratedText.get(sessionKey) === lastResponseSummary;
      this._narrate(sessionId, "response", lastResponseSummary);
      if (alreadyNarrated) {
        this._clearPendingResponse(sessionKey);
      }
    } else if (currentState === "waiting_for_confirmation" && detail) {
      const question = this._questionNarratable(this._modelForSession(sessionId));
      if (question) {
        this._narrate(sessionId, question.kind, question.text, void 0, void 0, void 0, question.pending);
      } else {
        this._narrate(sessionId, "confirmation", detail, void 0, void 0, confirmationType);
      }
    }
  }
  /** The resident chat model for a session id, or `undefined` when it isn't loaded (or the id isn't a URI). */
  _modelForSession(sessionId) {
    let resource;
    try {
      resource = URI.parse(sessionId);
    } catch {
      return void 0;
    }
    return this.chatService.getSession(resource);
  }
  /**
   * Flush the coalesced session state changes to the backend and persist only
   * true net changes to the local timeline. {@link _sendContext} rebuilds the
   * full context from the now-settled model state and `_sendDelta` merge-patches
   * against the last-sent snapshot, so an oscillation that returned to its prior
   * state produces no delta. Each buffered change carries the burst's baseline
   * (`fromState`/`fromDetail`); we compare the settled state against it so a
   * net-zero wobble is neither traced nor persisted as a `coding_event` (which
   * would otherwise replay a phantom transition to the backend on reconnect),
   * and a detail change reached via an intermediate state (e.g.
   * `waiting(old) → thinking → waiting(new)`) is still treated as detail-only.
   */
  _emitPendingStateChanges() {
    const changes = [...this._pendingStateChanges.values()];
    this._pendingStateChanges.clear();
    if (changes.length === 0) {
      return;
    }
    const netChanges = [];
    for (const change of changes) {
      const detail = change.detail ?? "";
      const summary = change.lastResponseSummary ?? "";
      const stateChanged = change.fromState !== change.currentState;
      const detailOnly = !stateChanged && change.currentState === "waiting_for_confirmation" && (change.fromDetail !== detail || change.fromPendingId !== change.pendingId || change.fromConfirmationType !== change.confirmationType);
      const responseSummaryOnly = !stateChanged && change.currentState === "idle" && !!summary && change.fromResponseSummary !== summary;
      if (stateChanged || detailOnly || responseSummaryOnly) {
        netChanges.push({ change, detailOnly });
      }
    }
    if (netChanges.length === 0) {
      this._sendContext();
      return;
    }
    for (const { change, detailOnly } of netChanges) {
      if (detailOnly) {
        this.voiceClientService.invalidateSessionCache(change.sessionId);
      }
    }
    this._sendContext();
    this.voiceClientService.flushSessionContext();
    const shownNow = this._shownSessionId();
    for (const { change } of netChanges) {
      this._handleNarratableStateChange(change.sessionId, change.currentState, change.detail, change.lastResponseSummary, shownNow, change.confirmationType);
    }
    this.logService.trace(`[voice] emitting ${netChanges.length} settled stateChange(s): ${netChanges.map(({ change, detailOnly }) => `${change.label}:${change.currentState}${detailOnly ? " (detail-only)" : ""}`).join(", ")}`);
    for (const { change } of netChanges) {
      this._persistEntry(
        "coding_event",
        `session "${change.label}" \u2192 ${change.currentState}`,
        {
          codingSessionId: change.sessionId,
          codingStatus: change.currentState,
          codingSessionLabel: change.label
        }
      );
    }
  }
  /**
   * Paranoid mitigation for the "confirmation narration not fired while user
   * is on the same session" symptom. Even though the autorun calls
   * `_sendContext + flushSessionContext` at the transition, in practice
   * users observed that the BE-side narration ("I need approval to run X")
   * only fires after they navigate AWAY from the session.
   *
   * As a guarded re-flush we schedule a single delayed `_sendContext + flush`
   * per session that's awaiting confirmation. The merge-patch in
   * `_sendDelta` short-circuits when no fields changed (see lines 393-395),
   * so a no-op re-send is silent on the BE — but if the FIRST send was
   * dropped (race condition, debounce hiccup, WS coalescing), this second
   * send pushes the state through.
   *
   * The watchdog auto-clears once the autorun observes the session has left
   * `waiting_for_confirmation`.
   */
  _armConfirmationFlushWatchdog(sessionId, label, isTransition) {
    if (this._confirmationFlushWatchdogs.has(sessionId)) {
      return;
    }
    if (isTransition) {
      this.logService.trace(`[voice] arming confirmation flush watchdog id=${sessionId.slice(-32)} label="${label}"`);
    }
    const timer = setTimeout(() => {
      this._confirmationFlushWatchdogs.delete(sessionId);
      this.logService.trace(`[voice] confirmation flush watchdog firing id=${sessionId.slice(-32)} label="${label}"`);
      this._sendContext();
      this.voiceClientService.flushSessionContext();
    }, VoiceSessionController._CONFIRMATION_FLUSH_DELAY_MS);
    this._confirmationFlushWatchdogs.set(sessionId, timer);
  }
  /**
   * Check all sessions for state changes and send notifications to backend.
   * This catches state transitions for sessions without a loaded chat model
   * (which the autorun can't track via observables), and also regular chat
   * sessions that are not agent sessions.
   */
  _checkSessionStateChanges() {
    if (this._deferredResponses.size > 0) {
      const shown = this._shownSessionId();
      if (shown) {
        this._flushDeferredResponse(shown);
      }
    }
    const sessions = this.agentSessionsService.model.sessions.filter((s) => !s.isArchived());
    const stateChanges = [];
    const processedResources = /* @__PURE__ */ new Set();
    const waitingSessionIds = /* @__PURE__ */ new Set();
    for (const s of sessions) {
      processedResources.add(s.resource.toString());
      const sessionId = s.resource.toString();
      const model = this.chatService.getSession(s.resource);
      let currentState;
      let detail;
      let confirmationType;
      let lastResponseSummary;
      if (model) {
        const info = this._getAgentStateInfo(model);
        currentState = this._effectiveResidentState(sessionId, info);
        detail = info.detail;
        confirmationType = info.confirmation_type;
        lastResponseSummary = currentState === info.state ? info.last_response_summary : void 0;
        this._cacheResponseSummary(sessionId, info.state, info.last_response_summary);
        if (currentState === info.state) {
          this._pendingIdleNarration.delete(sessionId);
        }
      } else {
        currentState = s.status === AgentSessionStatus.InProgress ? "thinking" : s.status === AgentSessionStatus.NeedsInput ? "waiting_for_confirmation" : s.status === AgentSessionStatus.Completed ? "idle" : "unknown";
        this._cacheResponseSummary(sessionId, currentState, void 0);
        if (s.status === AgentSessionStatus.NeedsInput) {
          this._ensureModelLoaded(s.resource);
        }
      }
      const prev = this._prevSessionStates.get(sessionId);
      const isStateChange = prev !== void 0 && prev.state !== currentState && currentState !== "unknown";
      const pendingId = currentState === "waiting_for_confirmation" ? this._pendingIdFor(sessionId) : "";
      const isDetailChange = !isStateChange && prev !== void 0 && currentState === "waiting_for_confirmation" && ((detail ?? "") !== prev.detail || pendingId !== prev.pendingId || confirmationType !== prev.confirmationType);
      if (isStateChange && currentState === "thinking" && !this._eagerModelLoading.has(sessionId)) {
        this._sessionsAwaitingResponseSummary.add(sessionId);
      }
      if (!model && currentState === "idle" && isStateChange) {
        const cachedSummary = this._lastResponseSummaryById.get(sessionId);
        if (!cachedSummary) {
          this._deferIdleNarrationUntilModelLoaded(s.resource);
          continue;
        }
        lastResponseSummary = cachedSummary;
      }
      const normalizedSummary = lastResponseSummary ?? "";
      const isResponseSummaryChange = !isStateChange && prev !== void 0 && currentState === "idle" && !!normalizedSummary && normalizedSummary !== prev.lastResponseSummary && this._sessionsAwaitingResponseSummary.has(sessionId);
      if (isStateChange && currentState === "idle" && !!normalizedSummary || isResponseSummaryChange) {
        this._sessionsAwaitingResponseSummary.delete(sessionId);
      }
      if (isStateChange || isDetailChange || isResponseSummaryChange) {
        const cancelExpiry = this._userCancelledSessions.get(sessionId);
        if (cancelExpiry) {
          clearTimeout(cancelExpiry);
          this._userCancelledSessions.delete(sessionId);
        } else {
          if (isDetailChange) {
            this.voiceClientService.invalidateSessionCache(sessionId);
          }
          stateChanges.push({ sessionId, currentState, label: s.label || "Untitled session", detail, confirmationType, lastResponseSummary });
        }
      }
      if (currentState !== "unknown") {
        const rememberedSummary = normalizedSummary || this._lastResponseSummaryById.get(sessionId) || prev?.lastResponseSummary || "";
        this._prevSessionStates.set(sessionId, { state: currentState, detail: detail ?? "", pendingId, confirmationType, lastResponseSummary: rememberedSummary });
      }
      if (currentState === "waiting_for_confirmation") {
        waitingSessionIds.add(sessionId);
      }
    }
    for (const chatModel of this.chatService.chatModels.get()) {
      const key = chatModel.sessionResource.toString();
      if (processedResources.has(key)) {
        continue;
      }
      if (chatModel.getRequests().length === 0) {
        continue;
      }
      const info = this._getAgentStateInfo(chatModel);
      const currentState = info.state;
      const detail = info.detail;
      const confirmationType = info.confirmation_type;
      const lastResponseSummary = info.last_response_summary;
      const prev = this._prevSessionStates.get(key);
      const isStateChange = prev !== void 0 && prev.state !== currentState && currentState !== "unknown";
      const pendingId = currentState === "waiting_for_confirmation" ? this._pendingIdFor(key) : "";
      const isDetailChange = !isStateChange && prev !== void 0 && currentState === "waiting_for_confirmation" && ((detail ?? "") !== prev.detail || pendingId !== prev.pendingId || confirmationType !== prev.confirmationType);
      if (isStateChange && currentState === "thinking" && !this._eagerModelLoading.has(key)) {
        this._sessionsAwaitingResponseSummary.add(key);
      }
      const normalizedSummary = lastResponseSummary ?? "";
      const isResponseSummaryChange = !isStateChange && prev !== void 0 && currentState === "idle" && !!normalizedSummary && normalizedSummary !== prev.lastResponseSummary && this._sessionsAwaitingResponseSummary.has(key);
      if (isStateChange && currentState === "idle" && !!normalizedSummary || isResponseSummaryChange) {
        this._sessionsAwaitingResponseSummary.delete(key);
      }
      if (isStateChange || isDetailChange || isResponseSummaryChange) {
        if (isDetailChange) {
          this.voiceClientService.invalidateSessionCache(key);
        }
        stateChanges.push({ sessionId: key, currentState, label: chatModel.title || "Chat", detail, confirmationType, lastResponseSummary });
      }
      if (currentState !== "unknown") {
        const rememberedSummary = normalizedSummary || this._lastResponseSummaryById.get(key) || prev?.lastResponseSummary || "";
        this._prevSessionStates.set(key, { state: currentState, detail: detail ?? "", pendingId, confirmationType, lastResponseSummary: rememberedSummary });
      }
      if (currentState === "waiting_for_confirmation") {
        waitingSessionIds.add(key);
      }
    }
    this._reconcileConfirmationIndicators(waitingSessionIds);
    if (stateChanges.length > 0) {
      this.logService.trace(`[voice] onDidChangeSessions detected ${stateChanges.length} state change(s): ${stateChanges.map((c) => `${c.label}: ${c.currentState}`).join(", ")}`);
      this._sendContext();
      this.voiceClientService.flushSessionContext();
    }
    const shownNow = this._shownSessionId();
    for (const change of stateChanges) {
      this._handleNarratableStateChange(change.sessionId, change.currentState, change.detail, change.lastResponseSummary, shownNow, change.confirmationType);
    }
    if (stateChanges.length > 0) {
      for (const change of stateChanges) {
        this._persistEntry(
          "coding_event",
          `session "${change.label}" \u2192 ${change.currentState}`,
          {
            codingSessionId: change.sessionId,
            codingStatus: change.currentState,
            codingSessionLabel: change.label
          }
        );
      }
    }
  }
  /**
   * Scope confirmations to the active session before reporting to the backend.
   *
   * Only the active (focused/target) session's `waiting_for_confirmation` state
   * is reported as such; any OTHER session awaiting confirmation is downgraded
   * to `thinking` (and its confirmation detail dropped). This does two things:
   *
   *  1. The backend only ever sees a single confirmation, so it never asks the
   *     user "which one do you want me to approve?".
   *  2. When the user focuses a session that was awaiting confirmation while
   *     unfocused, `_buildSessionContext` starts reporting it as
   *     `waiting_for_confirmation`. The backend observes the fresh
   *     `thinking -> waiting_for_confirmation` transition and narrates the
   *     confirmation at that moment (the "read it out on focus" behaviour).
   *
   * The sessions-list pending indicator for the unfocused confirmation is
   * driven separately from client-observed state (_reconcileConfirmationIndicators),
   * so it stays accurate even though the backend isn't told about it.
   */
  _reportedAgentState(realState, isActive) {
    if (realState === "waiting_for_confirmation" && !isActive) {
      return { state: "thinking", hideConfirmationDetail: true };
    }
    return { state: realState, hideConfirmationDetail: false };
  }
  _buildSessionContext() {
    const oneHourAgo = Date.now() - 60 * 60 * 1e3;
    const sessions = this.agentSessionsService.model.sessions.filter((s) => {
      if (s.isArchived()) {
        return false;
      }
      if (s.status === AgentSessionStatus.InProgress || s.status === AgentSessionStatus.NeedsInput) {
        return true;
      }
      if (s.status === AgentSessionStatus.Completed) {
        const endedAt = s.timing.lastRequestEnded ?? s.timing.created;
        return endedAt !== void 0 && endedAt > oneHourAgo;
      }
      return false;
    });
    const targetSessionId = this._getActiveSessionId();
    const sessionList = sessions.map((s) => {
      const model = this.chatService.getSession(s.resource);
      const isActive = s.resource.toString() === targetSessionId;
      if (!model) {
        const sessionIdStr = s.resource.toString();
        let fallbackState = s.status === AgentSessionStatus.InProgress ? "thinking" : s.status === AgentSessionStatus.NeedsInput ? "waiting_for_confirmation" : s.status === AgentSessionStatus.Completed ? "idle" : "unknown";
        if (fallbackState === "idle" && this._pendingIdleNarration.has(sessionIdStr) && !this._lastResponseSummaryById.has(sessionIdStr)) {
          const prev = this._prevSessionStates.get(sessionIdStr);
          if (prev?.state) {
            fallbackState = prev.state;
          }
        }
        if (fallbackState === "waiting_for_confirmation") {
          this._ensureModelLoaded(s.resource);
          fallbackState = "thinking";
        }
        const scoped2 = this._reportedAgentState(fallbackState, isActive);
        const cachedSummary = fallbackState === "idle" ? this._lastResponseSummaryById.get(sessionIdStr) : void 0;
        return {
          id: sessionIdStr,
          ...s.label ? { label: s.label } : {},
          is_active: isActive,
          agent_state: scoped2.state,
          ...cachedSummary ? { last_response_summary: cachedSummary } : {}
        };
      }
      const stateInfo = this._getAgentStateInfo(model);
      this._cacheResponseSummary(s.resource.toString(), stateInfo.state, stateInfo.last_response_summary);
      const detailPending = stateInfo.state === "waiting_for_confirmation" && !stateInfo.detail;
      const heldState = this._effectiveResidentState(s.resource.toString(), stateInfo);
      const scoped = detailPending ? { state: "thinking", hideConfirmationDetail: true } : this._reportedAgentState(heldState, isActive);
      const shipSummary = heldState === stateInfo.state ? stateInfo.last_response_summary : void 0;
      const pending = this._buildPendingPayload(model);
      return {
        id: s.resource.toString(),
        ...s.label ? { label: s.label } : {},
        is_active: isActive,
        agent_state: scoped.state,
        ...!scoped.hideConfirmationDetail && stateInfo.detail ? { agent_state_detail: stateInfo.detail } : {},
        ...!scoped.hideConfirmationDetail && stateInfo.confirmation_type ? { confirmation_type: stateInfo.confirmation_type } : {},
        ...shipSummary ? { last_response_summary: shipSummary } : {},
        ...pending ? { pending } : {}
      };
    });
    const agentResources = new Set(this.agentSessionsService.model.sessions.map((s) => s.resource.toString()));
    for (const chatModel of this.chatService.chatModels.get()) {
      const key = chatModel.sessionResource.toString();
      if (agentResources.has(key)) {
        continue;
      }
      if (chatModel.getRequests().length === 0) {
        continue;
      }
      const stateInfo = this._getAgentStateInfo(chatModel);
      if (stateInfo.state === "idle") {
        const lastActive = chatModel.lastMessageDate;
        if (lastActive < oneHourAgo) {
          continue;
        }
      }
      const isActive = key === targetSessionId;
      const scoped = this._reportedAgentState(stateInfo.state, isActive);
      const pending = this._buildPendingPayload(chatModel);
      sessionList.push({
        id: key,
        ...chatModel.title ? { label: chatModel.title } : {},
        is_active: isActive,
        agent_state: scoped.state,
        ...!scoped.hideConfirmationDetail && stateInfo.detail ? { agent_state_detail: stateInfo.detail } : {},
        ...!scoped.hideConfirmationDetail && stateInfo.confirmation_type ? { confirmation_type: stateInfo.confirmation_type } : {},
        ...stateInfo.last_response_summary ? { last_response_summary: stateInfo.last_response_summary } : {},
        ...pending ? { pending } : {}
      });
    }
    return {
      sessions: sessionList,
      display_locale: this._window?.navigator.language || "en-US"
    };
  }
  /**
   * Eagerly load a chat model for a session that needs input but hasn't been
   * opened in the UI yet. Once loaded, the autorun observables will re-fire
   * with full confirmation detail so the backend can narrate properly.
   */
  _ensureModelLoaded(resource) {
    const key = resource.toString();
    if (this._eagerModelRefs.has(key) || this._eagerModelLoading.has(key) || this.chatService.getSession(resource)) {
      return;
    }
    this.logService.trace(`[voice] eagerly loading model for session ${key.slice(-32)}`);
    this._eagerModelLoading.add(key);
    const cts = new CancellationTokenSource();
    this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, cts.token, "VoiceSessionController#eagerLoad").then((ref) => {
      this._eagerModelLoading.delete(key);
      if (ref) {
        const existing = this._eagerModelRefs.get(key);
        if (!this._isConnected.get() || existing) {
          ref.dispose();
          if (!this._isConnected.get()) {
            this._pendingIdleNarration.delete(key);
          }
        } else {
          this._eagerModelRefs.set(key, ref);
          this._checkSessionStateChanges();
          this._sendContext();
          this.voiceClientService.flushSessionContext();
          if (this._shownSessionId() === key) {
            this._activateShownSession(resource);
          }
        }
      } else {
        this._pendingIdleNarration.delete(key);
      }
      cts.dispose();
    }, () => {
      this._eagerModelLoading.delete(key);
      this._pendingIdleNarration.delete(key);
      cts.dispose();
    });
  }
  /**
   * Defer narrating a session's ``idle`` transition until its chat model is
   * resident, so the narration can include ``last_response_summary``. Remote/
   * Copilot sessions don't keep their model loaded, so without this the
   * backend would only ever see a summary-less completion. Eagerly loads the
   * model; once it resolves the autorun re-fires and narrates with the summary.
   */
  _deferIdleNarrationUntilModelLoaded(resource) {
    this._pendingIdleNarration.add(resource.toString());
    this._ensureModelLoaded(resource);
  }
  /**
   * Cache (or invalidate) a session's response summary based on the current
   * state observed from its resident model. Called wherever a resident model's
   * state is computed so the summary survives the model's disposal.
   * - `idle` with a summary → cache it (the completed reply).
   * - `thinking` → a new turn started; drop the stale summary so a later
   *   completion never narrates the previous reply.
   */
  _cacheResponseSummary(sessionId, state, summary) {
    if (state === "idle" && summary) {
      this._lastResponseSummaryById.set(sessionId, summary);
    } else if (state === "thinking") {
      this._lastResponseSummaryById.delete(sessionId);
    }
  }
  /**
   * Drop per-session caches for sessions no longer in the tracked set, so a
   * long-lived voice connection doesn't retain summaries/state for archived,
   * removed, or disposed sessions that will never be narrated again.
   */
  _pruneSessionCaches(liveSessionIds) {
    for (const id of this._lastResponseSummaryById.keys()) {
      if (!liveSessionIds.has(id)) {
        this._lastResponseSummaryById.delete(id);
      }
    }
    for (const id of this._lastNarratedText.keys()) {
      if (!liveSessionIds.has(id)) {
        this._lastNarratedText.delete(id);
      }
    }
    for (const id of Array.from(this._sessionsAwaitingResponseSummary)) {
      if (!liveSessionIds.has(id)) {
        this._sessionsAwaitingResponseSummary.delete(id);
      }
    }
    for (const id of [...this._pendingResponseSummaries.keys()]) {
      if (!liveSessionIds.has(id)) {
        this._clearPendingResponse(id);
      }
    }
  }
  /**
   * The state to report for a resident model, applying the idle-narration hold.
   *
   * When a completion is detected for an unfocused session we eagerly reload
   * its (disposed) model to recover ``last_response_summary``. That reloaded
   * model is briefly resident with an EMPTY response while its history is still
   * replaying, so reporting its bare ``idle`` now would ship a summary-less
   * completion (which the backend never narrates) AND consume the ``idle``
   * transition before the summary exists. While the eager load is still in
   * flight we therefore hold — report the prior state — so the ``idle`` isn't
   * shipped until it can carry the summary. The load always resolves (its
   * callback clears ``_eagerModelLoading``), so the hold can never last forever.
   */
  _effectiveResidentState(sessionId, stateInfo) {
    if (stateInfo.state === "idle" && !stateInfo.last_response_summary && this._pendingIdleNarration.has(sessionId) && this._eagerModelLoading.has(sessionId)) {
      const prev = this._prevSessionStates.get(sessionId);
      return prev?.state ?? "thinking";
    }
    return stateInfo.state;
  }
  _visibleConfirmationText(value, maxLength = VoiceSessionController._MAX_CONFIRMATION_FIELD_CHARS) {
    if (!value) {
      return "";
    }
    const plainText = renderAsPlaintext(typeof value === "string" ? { value } : value, { useLinkFormatter: true }).replace(/\s+/g, " ").trim();
    if (plainText.length <= maxLength) {
      return plainText;
    }
    const prefix = plainText.slice(0, maxLength - 3);
    const wordBoundary = prefix.lastIndexOf(" ");
    const truncated = wordBoundary > Math.floor(maxLength * 0.6) ? prefix.slice(0, wordBoundary) : prefix;
    return localize("voice.confirmation.truncated", "{0}...", truncated);
  }
  _boundedConfirmationLines(lines, fallback) {
    const result = [];
    for (const line of lines.filter(Boolean)) {
      const candidate = [...result, line].join("\n");
      if (candidate.length > VoiceSessionController._MAX_CONFIRMATION_NARRATION_CHARS) {
        break;
      }
      result.push(line);
    }
    return result.join("\n") || fallback;
  }
  _visibleQuestionnaireFromCarousel(carousel, includeDetails) {
    return {
      context: carousel.message,
      questions: carousel.questions.map((question) => ({
        prompt: question.message ?? (question.title !== question.id ? question.title : void 0),
        details: includeDetails ? question.description ?? question.detailedMessage : void 0,
        options: (question.options ?? []).map((option) => option.label),
        allowFreeformInput: question.allowFreeformInput !== false
      }))
    };
  }
  _visibleQuestionnaireFromToolInvocation(toolInvocation) {
    if (!isPendingVoiceQuestionnaireInvocation(toolInvocation)) {
      return void 0;
    }
    const state = toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation && state.type !== IChatToolInvocation.StateKind.WaitingForPostApproval) {
      return void 0;
    }
    const parameters = state.parameters;
    if (!isObject(parameters) || !hasOwn(parameters, "questions") || !Array.isArray(parameters.questions) || parameters.questions.length === 0) {
      return void 0;
    }
    return {
      questions: parameters.questions.map((rawQuestion) => {
        if (!isObject(rawQuestion)) {
          return { options: [], allowFreeformInput: true };
        }
        const prompt = hasOwn(rawQuestion, "question") && typeof rawQuestion.question === "string" ? rawQuestion.question : void 0;
        const options = [];
        if (hasOwn(rawQuestion, "options") && Array.isArray(rawQuestion.options)) {
          for (const rawOption of rawQuestion.options) {
            if (!isObject(rawOption) || !hasOwn(rawOption, "label") || typeof rawOption.label !== "string") {
              continue;
            }
            const description = hasOwn(rawOption, "description") && typeof rawOption.description === "string" ? rawOption.description : void 0;
            options.push(description ? `${rawOption.label} - ${description}` : rawOption.label);
          }
        }
        const allowFreeformInput = !(hasOwn(rawQuestion, "allowFreeformInput") && rawQuestion.allowFreeformInput === false);
        return { prompt, options, allowFreeformInput };
      })
    };
  }
  _formatQuestionnaireNarration(questionnaire) {
    const fallback = localize("voice.questionnaire.fallback", "I need your input in the open questionnaire.");
    if (questionnaire.questions.length === 0) {
      return void 0;
    }
    const lines = [
      questionnaire.questions.length === 1 ? localize("voice.questionnaire.single", "questionnaire: 1 question") : localize("voice.questionnaire.multiple", "questionnaire: {0} questions", questionnaire.questions.length)
    ];
    const context = this._visibleConfirmationText(questionnaire.context, 220);
    if (context) {
      lines.push(localize("voice.questionnaire.context", "context: {0}", context));
    }
    let includedQuestions = 0;
    const questionLimit = Math.min(questionnaire.questions.length, VoiceSessionController._MAX_QUESTIONNAIRE_QUESTIONS);
    for (let index = 0; index < questionLimit; index++) {
      const question = questionnaire.questions[index];
      const prompt = this._visibleConfirmationText(question.prompt);
      const questionLines = [
        localize("voice.questionnaire.question", "{0}. {1}", index + 1, prompt || fallback)
      ];
      const description = this._visibleConfirmationText(question.details, 180);
      if (description && description !== prompt) {
        questionLines.push(localize("voice.questionnaire.description", "details: {0}", description));
      }
      const visibleOptions = question.options.map((option) => this._visibleConfirmationText(option, 160)).filter(Boolean);
      if (visibleOptions.length > 0) {
        const includedOptions = visibleOptions.slice(0, VoiceSessionController._MAX_QUESTIONNAIRE_OPTIONS);
        const omittedOptions = visibleOptions.length - includedOptions.length;
        let optionsText = includedOptions.join("; ");
        if (omittedOptions > 0) {
          optionsText = localize("voice.questionnaire.moreOptions", "{0}; {1} more options", optionsText, omittedOptions);
        }
        if (question.allowFreeformInput) {
          optionsText = localize("voice.questionnaire.customOption", "{0}; a custom response is also available", optionsText);
        }
        questionLines.push(localize("voice.questionnaire.options", "options: {0}", optionsText));
      } else {
        questionLines.push(localize("voice.questionnaire.freeform", "response: enter a free-form answer in GitHub Copilot"));
      }
      const remainingAfterCandidate = questionnaire.questions.length - (includedQuestions + 1);
      const reservedSuffix = remainingAfterCandidate > 0 ? remainingAfterCandidate === 1 ? localize("voice.questionnaire.oneOmitted", "1 more question is open in GitHub Copilot.") : localize("voice.questionnaire.manyOmitted", "{0} more questions are open in GitHub Copilot.", remainingAfterCandidate) : localize("voice.questionnaire.open", "The questionnaire is open in GitHub Copilot.");
      const candidate = [...lines, ...questionLines, reservedSuffix].join("\n");
      if (candidate.length > VoiceSessionController._MAX_CONFIRMATION_NARRATION_CHARS) {
        break;
      }
      lines.push(...questionLines);
      includedQuestions++;
    }
    const omittedQuestions = questionnaire.questions.length - includedQuestions;
    if (omittedQuestions > 0) {
      lines.push(omittedQuestions === 1 ? localize("voice.questionnaire.oneOmitted", "1 more question is open in GitHub Copilot.") : localize("voice.questionnaire.manyOmitted", "{0} more questions are open in GitHub Copilot.", omittedQuestions));
    } else {
      lines.push(localize("voice.questionnaire.open", "The questionnaire is open in GitHub Copilot."));
    }
    return lines.join("\n") || fallback;
  }
  _formatChoiceLabels(choices) {
    const visibleChoices = choices.map((choice) => {
      const label = this._visibleConfirmationText(choice.label, 160);
      const description = this._visibleConfirmationText(choice.description, 160);
      return description ? localize("voice.confirmation.choiceDescription", "{0} - {1}", label, description) : label;
    }).filter(Boolean);
    if (visibleChoices.length === 0) {
      return void 0;
    }
    const includedChoices = visibleChoices.slice(0, VoiceSessionController._MAX_QUESTIONNAIRE_OPTIONS);
    const omittedChoices = visibleChoices.length - includedChoices.length;
    const text = includedChoices.join("; ");
    return omittedChoices > 0 ? localize("voice.confirmation.moreChoices", "{0}; {1} more choices", text, omittedChoices) : text;
  }
  _formatPlanNarration(plan) {
    const fallback = localize("voice.plan.fallback", "A plan is open in GitHub Copilot and needs your approval.");
    const title = this._visibleConfirmationText(plan.title) || fallback;
    const lines = [localize("voice.plan.title", "plan approval: {0}", title)];
    const choices = this._formatChoiceLabels(plan.actions);
    if (choices) {
      lines.push(localize("voice.plan.choices", "choices: {0}", choices));
    }
    lines.push(localize("voice.plan.open", "The plan is open in GitHub Copilot."));
    return this._boundedConfirmationLines(lines, fallback);
  }
  _formatElicitationNarration(elicitation) {
    const fallback = localize("voice.elicitation.fallback", "GitHub Copilot needs your input in the open request.");
    const title = this._visibleConfirmationText(elicitation.title);
    const message = this._visibleConfirmationText(elicitation.message);
    const subtitle = this._visibleConfirmationText(elicitation.subtitle);
    const lines = [localize("voice.elicitation.title", "input request: {0}", title || message || fallback)];
    if (subtitle && subtitle !== title) {
      lines.push(subtitle);
    }
    if (message && message !== title) {
      lines.push(message);
    }
    const choices = this._formatChoiceLabels([
      { label: elicitation.acceptButtonLabel },
      ...elicitation.rejectButtonLabel ? [{ label: elicitation.rejectButtonLabel }] : [],
      ...(elicitation.moreActions ?? []).map((action) => ({ label: action.label }))
    ]);
    if (choices) {
      lines.push(localize("voice.elicitation.choices", "choices: {0}", choices));
    }
    return this._boundedConfirmationLines(lines, fallback);
  }
  _formatConfirmationNarration(confirmation) {
    const fallback = localize("voice.confirmation.fallback", "GitHub Copilot needs your approval to continue.");
    const title = this._visibleConfirmationText(confirmation.title);
    const message = this._visibleConfirmationText(confirmation.message);
    const lines = [localize("voice.confirmation.title", "confirmation: {0}", title || message || fallback)];
    if (message && message !== title) {
      lines.push(message);
    }
    const choices = this._formatChoiceLabels((confirmation.buttons ?? []).map((label) => ({ label })));
    if (choices) {
      lines.push(localize("voice.confirmation.choices", "choices: {0}", choices));
    }
    return this._boundedConfirmationLines(lines, fallback);
  }
  _formatToolNarration(toolInvocation) {
    const fallback = localize("voice.toolConfirmation.fallback", "GitHub Copilot needs your approval to continue.");
    const state = toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation && state.type !== IChatToolInvocation.StateKind.WaitingForPostApproval) {
      return fallback;
    }
    const messages = state.confirmationMessages;
    const title = this._visibleConfirmationText(messages?.title) || this._visibleConfirmationText(toolInvocation.invocationMessage);
    const message = this._visibleConfirmationText(messages?.message);
    const lines = [localize("voice.toolConfirmation.title", "tool approval: {0}", title || message || fallback)];
    if (message && message !== title) {
      lines.push(message);
    }
    return this._boundedConfirmationLines(lines, fallback);
  }
  _formatToolNarrationFallback() {
    const fallback = localize("voice.toolConfirmation.fallback", "GitHub Copilot needs your approval to continue.");
    return localize("voice.toolConfirmation.title", "tool approval: {0}", fallback);
  }
  _formatToolAuthenticationNarration(toolInvocation) {
    const state = toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForAuthentication) {
      return void 0;
    }
    const serverName = this._visibleConfirmationText(state.server.name);
    const fallback = localize("voice.authentication.fallback", "GitHub Copilot needs authentication to continue.");
    return this._boundedConfirmationLines([
      localize("voice.authentication.title", "authentication request: MCP authentication required"),
      serverName ? localize("voice.authentication.message", "The MCP server {0} requires authentication to continue this tool call.", serverName) : fallback,
      localize("voice.authentication.choices", "choices: Authenticate; Cancel")
    ], fallback);
  }
  _selectPendingPart(model) {
    const lastRequest = model?.getRequests().at(-1);
    const parts = lastRequest?.response?.response.value;
    if (!lastRequest || !parts) {
      return void 0;
    }
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      const type = getVoiceConfirmationType([part]);
      if (type && this._isOpenPendingPart(part)) {
        if (type === "questionnaire" && isVoiceQuestionnaireInvocation(part)) {
          const carousel = parts.slice(index + 1).find((candidate) => candidate.kind === "questionCarousel" && candidate.resolveId === part.toolCallId && this._isOpenPendingPart(candidate));
          if (carousel) {
            return { requestId: lastRequest.id, type, part: carousel };
          }
        }
        return { requestId: lastRequest.id, type, part };
      }
    }
    return void 0;
  }
  _isOpenPendingPart(part) {
    if (part.kind === "questionCarousel") {
      return !part.isUsed && !part.answeredExternally;
    }
    if (part.kind === "elicitation2") {
      return part.state.get() === "pending";
    }
    if (part.kind === "planReview" || part.kind === "confirmation") {
      return !part.isUsed;
    }
    if (part.kind === "toolInvocation") {
      const state = part.state.get();
      return state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval || state.type === IChatToolInvocation.StateKind.WaitingForAuthentication;
    }
    return false;
  }
  _getPendingConfirmationInfo(model) {
    const lastResponse = model.getRequests().at(-1)?.response;
    if (!lastResponse) {
      return void 0;
    }
    const parts = lastResponse.response.value;
    const selected = this._selectPendingPart(model);
    if (!selected) {
      return void 0;
    }
    const { type, part } = selected;
    const askQuestionsCallIds = new Set(parts.filter(isVoiceQuestionnaireInvocation).map((part2) => part2.toolCallId));
    if (type === "questionnaire" && part?.kind === "questionCarousel") {
      const includeDetails = !part.resolveId || !askQuestionsCallIds.has(part.resolveId);
      return { type, detail: this._formatQuestionnaireNarration(this._visibleQuestionnaireFromCarousel(part, includeDetails)) };
    }
    if (type === "questionnaire" && part?.kind === "toolInvocation") {
      const questionnaire = this._visibleQuestionnaireFromToolInvocation(part);
      if (questionnaire) {
        return { type, detail: this._formatQuestionnaireNarration(questionnaire) };
      }
    }
    if (type === "elicitation" && part?.kind === "elicitation2") {
      return { type, detail: this._formatElicitationNarration(part) };
    }
    if (type === "plan" && part?.kind === "planReview") {
      return { type, detail: this._formatPlanNarration(part) };
    }
    if (type === "tool" && part?.kind === "toolInvocation") {
      return { type, detail: this._formatToolNarration(part) };
    }
    if (type === "generic" && part?.kind === "confirmation") {
      return { type, detail: this._formatConfirmationNarration(part) };
    }
    if (type === "generic" && part?.kind === "toolInvocation") {
      return { type, detail: this._formatToolAuthenticationNarration(part) };
    }
    if (type === "questionnaire") {
      return { type };
    }
    return { type, detail: this._formatToolNarrationFallback() };
  }
  _getAgentStateInfo(model) {
    if (!model) {
      return { state: "unknown" };
    }
    const lastRequest = model.getRequests().at(-1);
    if (lastRequest?.response?.isCanceled) {
      return { state: "idle" };
    }
    const pendingConfirmation = lastRequest?.response?.isPendingConfirmation.get();
    const confirmation = this._getPendingConfirmationInfo(model);
    if (pendingConfirmation || confirmation) {
      return {
        state: "waiting_for_confirmation",
        ...confirmation?.detail ? { detail: confirmation.detail } : !confirmation ? { detail: this._formatToolNarrationFallback() } : {},
        confirmation_type: confirmation?.type ?? "generic"
      };
    }
    const incomplete = lastRequest?.response?.isIncomplete.get() ?? false;
    if (incomplete) {
      return { state: "thinking" };
    }
    const responseText = [
      lastRequest?.response?.response.getMarkdown().trim(),
      lastRequest?.response?.result?.errorDetails?.message.trim()
    ].filter((value) => !!value).join("\n\n");
    return { state: "idle", ...responseText ? { last_response_summary: responseText } : {} };
  }
  /**
   * Describe what a session is waiting on, structurally.
   *
   * `_getAgentStateInfo` flattens the same state into `agent_state_detail`,
   * which is fine to *say* but cannot be *acted on*: a form becomes
   * `questions: <titles>`, losing the options, their values and the ids. This
   * returns what the backend needs to route an answer back to the exact part.
   *
   * Uses the same typed pending selection as narration, so the backend never
   * receives an id for a different action than the one the user heard.
   */
  _buildPendingPayload(model) {
    const selected = this._selectPendingPart(model);
    if (!selected || selected.type !== "questionnaire" && selected.type !== "plan" && selected.type !== "tool") {
      return void 0;
    }
    const { requestId, type, part } = selected;
    const routing = () => ({ pending_id: derivePendingId(requestId, part), request_id: requestId });
    if (type === "questionnaire" && part.kind === "questionCarousel") {
      const carousel = part;
      if (carousel.answeredExternally || carousel.questions.length === 0) {
        return void 0;
      }
      return {
        type: "questions",
        ...routing(),
        allow_skip: carousel.allowSkip === true,
        ...carousel.message ? { message: this._plainText(carousel.message) } : {},
        questions: carousel.questions.map((question) => ({
          id: question.id,
          type: question.type,
          title: this._plainText(getDisplayedQuestionText(question)),
          allow_freeform: question.allowFreeformInput !== false,
          options: getOptionsWithDefaultsFirst(question).map(({ option }) => ({
            label: option.label,
            value: option.value
          }))
        }))
      };
    }
    if (type === "plan" && part.kind === "planReview") {
      return { type: "approval", ...routing(), message: this._formatPlanNarration(part) };
    }
    if (type === "tool" && part.kind === "toolInvocation") {
      return { type: "approval", ...routing(), message: this._formatToolNarration(part) };
    }
    return void 0;
  }
  _plainText(value) {
    if (!value) {
      return "";
    }
    return typeof value === "string" ? value : value.value;
  }
  _classifyPendingType(response) {
    let result = "input";
    for (const part of response.response.value) {
      if (part.kind === "toolInvocation") {
        const invocation = part;
        const state = invocation.state.get();
        if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
          result = "approval";
        }
      }
      if (part.kind === "confirmation" && !part.isUsed) {
        result = "approval";
      }
      if (part.kind === "questionCarousel" && !part.isUsed) {
        result = "input";
      }
      if (part.kind === "planReview" && !part.isUsed) {
        result = "input";
      }
      if (part.kind === "elicitation2") {
        result = "input";
      }
    }
    return result;
  }
  _getConfirmationDescription(response) {
    let desc = "";
    for (const part of response.response.value) {
      if (part.kind === "toolInvocation") {
        const invocation = part;
        const state = invocation.state.get();
        if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
          const params = state.parameters;
          const command = params?.["command"] ?? params?.["input"];
          const explanation = params?.["explanation"] ?? params?.["goal"];
          if (typeof command === "string" && command) {
            desc = typeof explanation === "string" ? `${command} \u2014 ${explanation}` : command;
          }
        }
      } else if (part.kind === "questionCarousel" && !part.isUsed) {
        const carousel = part;
        const titles = (carousel.questions ?? []).map((q) => q.title).filter(Boolean);
        if (titles.length > 0) {
          desc = titles.join(", ");
        } else {
          const msg = carousel.message;
          desc = msg ? typeof msg === "string" ? msg : msg.value : "asking clarifying questions";
        }
      } else if (part.kind === "elicitation2") {
        const elicitation = part;
        if (elicitation.state.get() === "pending") {
          const title = elicitation.title;
          desc = title ? typeof title === "string" ? title : title.value : "needs input";
        }
      } else if (part.kind === "planReview" && !part.isUsed) {
        desc = "review the plan to continue";
      } else if (part.kind === "confirmation" && !part.isUsed) {
        desc = part.title ?? "needs approval";
      }
    }
    return desc;
  }
  _autoApproveCheck() {
    if (this._autoApprovedSessions.size === 0) {
      return;
    }
    const sessions = this.agentSessionsService.model.sessions.filter((s) => !s.isArchived());
    for (const s of sessions) {
      if (!this._autoApprovedSessions.has(s.resource.toString())) {
        continue;
      }
      const model = this.chatService.getSession(s.resource);
      if (!model) {
        continue;
      }
      this._autoApprovePendingTools(model);
    }
  }
  _autoApprovePendingTools(model) {
    for (const request of model.getRequests()) {
      const response = request.response;
      if (!response?.isPendingConfirmation.get() || getVoiceConfirmationType(response.response.value) !== "tool") {
        continue;
      }
      for (const part of response.response.value) {
        if (part.kind === "toolInvocation") {
          IChatToolInvocation.confirmWith(part, { type: ToolConfirmKind.UserAction });
        }
      }
    }
  }
  // --- Machine ID ---
  _getMachineId() {
    return this.environmentService.machineId ?? "unknown";
  }
  // --- Feedback ---
  async submitFeedback(feedbackText) {
    let userId = this._userLogin;
    if (!userId) {
      try {
        const sessions2 = await this.authenticationService.getSessions("github");
        userId = sessions2[0]?.account.label ?? "unknown";
      } catch {
        userId = "unknown";
      }
    }
    let transcriptHistory = [];
    try {
      const turns = await this.voiceTranscriptStore.loadTurns(userId);
      transcriptHistory = turns.map((t) => ({
        role: t.role,
        text: t.text,
        timestamp: t.timestamp
      }));
    } catch (err) {
      this.logService.warn("[voice] failed to load transcript history for feedback", err);
    }
    const sessions = this.agentSessionsService.model.sessions.filter((s) => !s.isArchived());
    const clientSessionState = {
      voiceState: this._voiceState.get(),
      isConnected: this._isConnected.get(),
      isConnecting: this._isConnecting.get(),
      isReconnecting: this._isReconnecting.get(),
      pendingToolConfirmations: this._pendingToolConfirmations.get().map((tc) => ({
        type: tc.type,
        sessionLabel: tc.sessionLabel,
        description: tc.description
      })),
      activeSessions: sessions.map((s) => ({
        id: s.resource.toString(),
        label: s.label,
        status: s.status
      }))
    };
    const clientEnvironment = {
      machineId: this._getMachineId()
    };
    const payload = {
      feedbackText,
      machineId: this._getMachineId(),
      userId,
      sessionId: this.voiceClientService.currentSessionId ?? "",
      submissionId: generateUuid(),
      transcriptHistory,
      clientSessionState,
      clientEnvironment,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    return this.voiceClientService.submitFeedback(payload);
  }
};
// Rolling buffer (max 2). Each `pttDown` and each assistant turn pushes a new
// entry; the oldest is evicted. Live user transcription mutates the last
// entry in place while it's still a user turn at the tail.
VoiceSessionController._MAX_TURNS = 2;
VoiceSessionController._CONNECT_TIMEOUT_MS = 1e4;
VoiceSessionController._PTT_MAX_DURATION_MS = 5 * 60 * 1e3;
/** Short-tap threshold: if the key is held for less than this, enter
 *  toggle mode where a second tap finishes the recording. */
VoiceSessionController._PTT_TOGGLE_THRESHOLD_MS = 300;
/** Debounce before re-entering listening after assistant stops speaking. */
VoiceSessionController._AUTO_LISTEN_QUIET_MS = 1200;
VoiceSessionController.RENARRATION_DEDUPE_WINDOW_MS = 6e3;
VoiceSessionController._USER_CANCEL_SUPPRESS_MS = 1e4;
/** After a focus-change discard, drop a stray backend `send_to_chat` for
 *  this long so late-finalized buffered speech isn't misrouted. */
VoiceSessionController._DISCARD_SEND_SUPPRESS_MS = 2e3;
/** How long a focus-change submit stays pinned to the original session
 *  while the backend finalizes the turn and emits `send_to_chat`, before the
 *  pin is cleared so it can't misroute a much later, unrelated turn. */
VoiceSessionController._PINNED_SUBMIT_EXPIRY_MS = 15e3;
VoiceSessionController._CONFIRMATION_FLUSH_DELAY_MS = 1500;
VoiceSessionController._STATE_CHANGE_SETTLE_MS = 120;
VoiceSessionController._SOLICITED_NARRATION_AUDIO_START_TIMEOUT_MS = 3e4;
VoiceSessionController._VOICE_PROGRESS_INITIAL_DELAY_MS = 5e3;
VoiceSessionController._VOICE_PROGRESS_INTERVAL_MS = 1e4;
VoiceSessionController._MAX_VOICE_PROGRESS_PER_REQUEST = 5;
VoiceSessionController._MAX_CONFIRMATION_NARRATION_CHARS = 2400;
VoiceSessionController._MAX_QUESTIONNAIRE_QUESTIONS = 6;
VoiceSessionController._MAX_QUESTIONNAIRE_OPTIONS = 5;
VoiceSessionController._MAX_CONFIRMATION_FIELD_CHARS = 280;
/**
 * How many of the most recent persisted timeline entries we forward
 * to the BE (across all kinds). Coding-agent reply synthesis happens
 * on top of this — we add one entry per active coding session.
 */
VoiceSessionController.PRIOR_TIMELINE_ENTRY_LIMIT = 30;
/**
 * Max sentences of Copilot's last reply we include per active coding
 * session when synthesizing ``coding_agent_reply`` entries. Bounded
 * because the full reply can be arbitrarily long.
 */
VoiceSessionController.CODING_AGENT_REPLY_SENTENCE_LIMIT = 2;
VoiceSessionController = __decorateClass([
  __decorateParam(0, IVoiceClientService),
  __decorateParam(1, IMicCaptureService),
  __decorateParam(2, ITtsPlaybackService),
  __decorateParam(3, IVoiceToolDispatchService),
  __decorateParam(4, IVoicePlaybackService),
  __decorateParam(5, IAgentSessionsService),
  __decorateParam(6, IChatService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, IAuthenticationService),
  __decorateParam(9, IVoiceTranscriptStore),
  __decorateParam(10, ILogService),
  __decorateParam(11, IWorkbenchEnvironmentService),
  __decorateParam(12, ITelemetryService),
  __decorateParam(13, IConfigurationService),
  __decorateParam(14, IAccessibilitySignalService),
  __decorateParam(15, IAccessibilityService),
  __decorateParam(16, IChatWidgetService),
  __decorateParam(17, INotificationService),
  __decorateParam(18, IPromptsService)
], VoiceSessionController);
registerSingleton(IVoiceSessionController, VoiceSessionController, InstantiationType.Delayed);
export {
  IVoiceSessionController,
  VoiceSessionController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZVNlc3Npb25Db250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlLCBhdXRvcnVuLCB0cmFuc2FjdGlvbiwgb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBkaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckFzUGxhaW50ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgYWxlcnQgYXMgYXJpYUFsZXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGlzT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSVZvaWNlVHJhbnNjcmlwdEVudHJ5TWV0YWRhdGEsIElWb2ljZVRyYW5zY3JpcHRTdG9yZSwgSVZvaWNlVHJhbnNjcmlwdFR1cm4sIFZvaWNlVHJhbnNjcmlwdEtpbmQgfSBmcm9tICcuLi8uLi8uLi9hZ2VudHNWb2ljZS9jb21tb24vdm9pY2VUcmFuc2NyaXB0U3RvcmUuanMnO1xuaW1wb3J0IHsgSVZvaWNlQXVkaW9SZXNwb25zZSwgSVZvaWNlQmFyZ2VJbiwgSVZvaWNlQ2hlY2twb2ludE5hcnJhdGlvbk1ldGFkYXRhLCBJVm9pY2VDbGllbnRTZXJ2aWNlLCBJVm9pY2VQcmlvclRpbWVsaW5lRW50cnksIElWb2ljZVNlc3Npb25Db250ZXh0LCBJVm9pY2VGZWVkYmFja1BheWxvYWQsIElWb2ljZUZlZWRiYWNrVHJhbnNjcmlwdFR1cm4sIElWb2ljZVRyYW5zY3JpcHRpb24sIElWb2ljZVR1cm5BdXRvRW5kZWQsIElWb2ljZU5hcnJhdGlvbkFjaywgSVZvaWNlTmFycmF0aW9uU2lnbmFsLCBpc1ZvaWNlQ2hlY2twb2ludElkLCBWb2ljZUNoZWNrcG9pbnRJZCwgVm9pY2VDb25maXJtYXRpb25UeXBlLCBWb2ljZU5hcnJhdGlvbktpbmQsIElWb2ljZVNlc3Npb25QZW5kaW5nLCBJVm9pY2VQZW5kaW5nUXVlc3Rpb24sIGRlcml2ZVBlbmRpbmdJZCwgVk9JQ0VfQUdFTlRfUFJPR1JFU1NfU0VUVElORyB9IGZyb20gJy4uLy4uL2NvbW1vbi92b2ljZUNsaWVudC92b2ljZUNsaWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Vm9pY2VDb25maXJtYXRpb25UeXBlLCBpc1BlbmRpbmdWb2ljZVF1ZXN0aW9ubmFpcmVJbnZvY2F0aW9uLCBpc1ZvaWNlUXVlc3Rpb25uYWlyZUludm9jYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vdm9pY2VDbGllbnQvdm9pY2VDb25maXJtYXRpb24uanMnO1xuaW1wb3J0IHsgSU1pY0NhcHR1cmVTZXJ2aWNlLCBJUHR0RGlhZ25vc3RpYywgaXNNaWNyb3Bob25lUGVybWlzc2lvbkRlbmllZEVycm9yIH0gZnJvbSAnLi9taWNDYXB0dXJlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVHRzUGxheWJhY2tTZXJ2aWNlIH0gZnJvbSAnLi90dHNQbGF5YmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZvaWNlVG9vbERpc3BhdGNoU2VydmljZSwgVm9pY2VUb29sRGlzcGF0Y2hTZXJ2aWNlIH0gZnJvbSAnLi92b2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZvaWNlUGxheWJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3ZvaWNlUGxheWJhY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgdG9BZ2VudEhvc3RCYWNrZW5kU2Vzc2lvblVyaSB9IGZyb20gJy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFNlc3Npb25VcmkuanMnO1xuaW1wb3J0IHsgQ2hhdFNlbmRSZXN1bHQsIElDaGF0Q29uZmlybWF0aW9uLCBJQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdCwgSUNoYXRQbGFuUmV2aWV3LCBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwsIElDaGF0U2VydmljZSwgSUNoYXRUb29sSW52b2NhdGlvbiwgVG9vbENvbmZpcm1LaW5kLCBJQ2hhdE1vZGVsUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldERpc3BsYXllZFF1ZXN0aW9uVGV4dCwgZ2V0T3B0aW9uc1dpdGhEZWZhdWx0c0ZpcnN0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRRdWVzdGlvbkNhcm91c2VsSGVscGVycy5qcyc7XG5pbXBvcnQgeyBmb3JtYXRRdWVzdGlvblByb21wdCB9IGZyb20gJy4uLy4uL2NvbW1vbi92b2ljZUNsaWVudC92b2ljZVBlbmRpbmdOYXJyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbCwgSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudCwgSUNoYXRSZXNwb25zZU1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElQcm9tcHRzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQge1xuXHRWb2ljZUZpcnN0Q29ubmVjdENsYXNzaWZpY2F0aW9uLCBWb2ljZUZpcnN0Q29ubmVjdEV2ZW50LFxuXHRWb2ljZVNlc3Npb25TdGFydGVkQ2xhc3NpZmljYXRpb24sIFZvaWNlU2Vzc2lvblN0YXJ0ZWRFdmVudCxcblx0Vm9pY2VTZXNzaW9uRW5kZWRDbGFzc2lmaWNhdGlvbiwgVm9pY2VTZXNzaW9uRW5kZWRFdmVudCxcblx0Vm9pY2VQdHRDbGFzc2lmaWNhdGlvbiwgVm9pY2VQdHRFdmVudCxcblx0Vm9pY2VUdHNMaXN0ZW5UaHJvdWdoQ2xhc3NpZmljYXRpb24sIFZvaWNlVHRzTGlzdGVuVGhyb3VnaEV2ZW50LFxuXHRWb2ljZVRvb2xBcHByb3ZhbENsYXNzaWZpY2F0aW9uLCBWb2ljZVRvb2xBcHByb3ZhbEV2ZW50LFxuXHRWb2ljZVJlY29ubmVjdENsYXNzaWZpY2F0aW9uLCBWb2ljZVJlY29ubmVjdEV2ZW50LFxuXHRWb2ljZUxhdGVuY3lDbGFzc2lmaWNhdGlvbiwgVm9pY2VMYXRlbmN5RXZlbnQsXG5cdFZvaWNlTmFycmF0aW9uRGVmZXJyZWRDbGFzc2lmaWNhdGlvbiwgVm9pY2VOYXJyYXRpb25EZWZlcnJlZEV2ZW50LFxuXHRWb2ljZU5hcnJhdGlvbkRyb3BwZWRDbGFzc2lmaWNhdGlvbiwgVm9pY2VOYXJyYXRpb25Ecm9wcGVkRXZlbnQsXG59IGZyb20gJy4vdm9pY2VUZWxlbWV0cnkuanMnO1xuXG5leHBvcnQgdHlwZSBWb2ljZVN0YXRlID0gJ2lkbGUnIHwgJ2xpc3RlbmluZycgfCAncHJvY2Vzc2luZycgfCAnc3BlYWtpbmcnIHwgJ2Vycm9yJztcblxuLyoqIE9uZSBidWZmZXJlZCBhdWRpbyBjaHVuayBvZiBhIGRlZmVycmVkIHJlc3BvbnNlLiAqL1xuaW50ZXJmYWNlIElEZWZlcnJlZENodW5rIHtcblx0cmVhZG9ubHkgYXVkaW86IHN0cmluZztcblx0cmVhZG9ubHkgaXNGaXJzdENodW5rOiBib29sZWFuO1xuXHRyZWFkb25seSBpc0ZpbmFsOiBib29sZWFuO1xuXHRyZWFkb25seSB0cmFuc2NyaXB0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbi8qKiBSZXN1bHQgb2YgZmx1c2hpbmcgYSBzZXNzaW9uJ3MgYnVmZmVyZWQgcmVzcG9uc2VzIG9uIGZvY3VzLiAqL1xuaW50ZXJmYWNlIElEZWZlcnJlZEZsdXNoUmVzdWx0IHtcblx0LyoqIFRydWUgd2hlbiBhdCBsZWFzdCBvbmUgYnVmZmVyZWQgcmVzcG9uc2Ugd2FzIHBsYXllZC4gKi9cblx0cmVhZG9ubHkgZmx1c2hlZDogYm9vbGVhbjtcblx0LyoqIFRydWUgd2hlbiBhIGhlbGQgZGVsaWJlcmF0ZSBwcmVzcyBrZXB0IHRoZSBidWZmZXIgaW50YWN0IGluc3RlYWQgb2Zcblx0ICogIHBsYXlpbmcgaXQuIFRoZSBidWZmZXJlZCByZXBseSBpcyBzdGlsbCBwZW5kaW5nIGFuZCBwbGF5cyBvbiByZWxlYXNlLCBzb1xuXHQgKiAgdGhlIGNhbGxlciBtdXN0IG5vdCByZS1pc3N1ZSBhIGZyZXNoIG5hcnJhdGlvbiBmb3IgdGhhdCBTQU1FIHJlcGx5IChzZWVcblx0ICogIGByZXRhaW5lZFRyYW5zY3JpcHRgKS4gQWJzZW50IGZvciB0aGUgb3JkaW5hcnkgbm90aGluZy10by1mbHVzaCBjYXNlcyxcblx0ICogIHdoZXJlIG5hcnJhdGlvbiBzaG91bGQgcHJvY2VlZCBub3JtYWxseS4gKi9cblx0cmVhZG9ubHkgcmV0YWluZWQ/OiBib29sZWFuO1xuXHQvKiogTm9ybWFsaXplZCBmaW5hbCB0cmFuc2NyaXB0IG9mIHRoZSBtb3N0IHJlY2VudCBidWZmZXJlZCByZXBseSBoZWxkIGJhY2tcblx0ICogIGJ5IGEgYHJldGFpbmVkYCBmbHVzaC4gTGV0cyB0aGUgY2FsbGVyIHN1cHByZXNzIG9ubHkgYSBkdXBsaWNhdGVcblx0ICogIHJlLW5hcnJhdGUgb2YgdGhhdCBleGFjdCByZXBseSwgbmV2ZXIgYW4gdW5yZWxhdGVkIGNvbmZpcm1hdGlvbiBvciBhXG5cdCAqICBuZXdlciwgZGlmZmVyZW50IHJlc3BvbnNlLiBVbmRlZmluZWQgd2hlbiB0aGUgYnVmZmVyIGhhZCBubyB0cmFuc2NyaXB0LiAqL1xuXHRyZWFkb25seSByZXRhaW5lZFRyYW5zY3JpcHQ/OiBzdHJpbmc7XG5cdC8qKiBOb3JtYWxpemVkIGZpbmFsIHRyYW5zY3JpcHQgb2YgZXZlcnkgcmVzcG9uc2UgcGxheWVkLCBpbiBvcmRlci4gTGV0cyB0aGVcblx0ICogIGNhbGxlciBtYXJrIF9sYXN0TmFycmF0ZWRUZXh0IE9OTFkgZm9yIHRleHQgdGhhdCB3YXMgYWN0dWFsbHkganVzdCByZWFkLiAqL1xuXHRyZWFkb25seSBmaW5hbFRyYW5zY3JpcHRzOiByZWFkb25seSBzdHJpbmdbXTtcbn1cblxuLyoqIE9uZSB3aG9sZSBkZWZlcnJlZCByZXNwb25zZSAoYWxsIGl0cyBjaHVua3MpLCBidWZmZXJlZCB3aGlsZSBpdHMgc2Vzc2lvbiB3YXNcbiAqICBub3Qgc2hvd24uIGBmaW5hbGl6ZWRgIGlzIHNldCBvbmNlIHRoZSByZXNwb25zZSdzIGZpbmFsIGNodW5rIGhhcyBhcnJpdmVkLiAqL1xuaW50ZXJmYWNlIElEZWZlcnJlZFJlc3BvbnNlIHtcblx0cmVhZG9ubHkgcmVzcG9uc2VJZD86IHN0cmluZztcblx0cmVhZG9ubHkgdHVybklkPzogc3RyaW5nO1xuXHRmaW5hbGl6ZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNodW5rczogSURlZmVycmVkQ2h1bmtbXTtcbn1cblxuaW50ZXJmYWNlIElQZW5kaW5nU29saWNpdGVkTmFycmF0aW9uIHtcblx0cmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGtpbmQ6IFZvaWNlTmFycmF0aW9uS2luZDtcblx0cmVhZG9ubHkgdGV4dDogc3RyaW5nO1xuXHQvKiogVGhlIGZvcm0gdGhpcyBuYXJyYXRpb24gc3BlYWtzLCB3aGVuIGl0IGhhcyBvbmUuIElkZW50aWZpZXMgdGhlIG9jY3VycmVuY2UgZm9yIGRlZHVwOyBzZWUgYF9uYXJyYXRhYmxlSWRlbnRpdHlgLiAqL1xuXHRyZWFkb25seSBwZW5kaW5nPzogeyBwZW5kaW5nSWQ6IHN0cmluZyB9O1xuXHRyZWFkb25seSBjaGVja3BvaW50PzogSVZvaWNlQ2hlY2twb2ludE5hcnJhdGlvbk1ldGFkYXRhO1xuXHRyZWFkb25seSBjb25maXJtYXRpb25UeXBlPzogVm9pY2VDb25maXJtYXRpb25UeXBlO1xuXHRyZWFkb25seSBhdWRpb1N0YXJ0VGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+O1xuXHRoYXNSZWNlaXZlZEF1ZGlvOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSVZvaWNlTmFycmF0YWJsZSB7XG5cdHJlYWRvbmx5IGtpbmQ6IEV4Y2x1ZGU8Vm9pY2VOYXJyYXRpb25LaW5kLCAnY2hlY2twb2ludCc+O1xuXHRyZWFkb25seSB0ZXh0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBlbmRpbmc/OiB7IHBlbmRpbmdJZDogc3RyaW5nIH07XG5cdHJlYWRvbmx5IGNvbmZpcm1hdGlvblR5cGU/OiBWb2ljZUNvbmZpcm1hdGlvblR5cGU7XG59XG5cbmludGVyZmFjZSBJUGxheWJhY2tOYXJyYXRpb24ge1xuXHRyZWFkb25seSBraW5kOiBWb2ljZU5hcnJhdGlvbktpbmQ7XG5cdHJlYWRvbmx5IGNoZWNrcG9pbnQ/OiBJVm9pY2VDaGVja3BvaW50TmFycmF0aW9uTWV0YWRhdGE7XG5cdHJlYWRvbmx5IHBsYXliYWNrSWQ/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJUXVldWVkQXVkaW9SZXNwb25zZSB7XG5cdHJlYWRvbmx5IHNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSByZXNwb25zZUlkPzogc3RyaW5nO1xuXHRyZWFkb25seSBuYXJyYXRpb24/OiBJUGxheWJhY2tOYXJyYXRpb247XG5cdGZpbmFsaXplZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgY2h1bmtzOiB7IGF1ZGlvOiBzdHJpbmc7IGlzRmlyc3RDaHVuazogYm9vbGVhbjsgaXNGaW5hbDogYm9vbGVhbjsgdHJhbnNjcmlwdDogc3RyaW5nIHwgdW5kZWZpbmVkIH1bXTtcbn1cblxuaW50ZXJmYWNlIElWb2ljZUFnZW50U3RhdGVJbmZvIHtcblx0cmVhZG9ubHkgc3RhdGU6IHN0cmluZztcblx0cmVhZG9ubHkgZGV0YWlsPzogc3RyaW5nO1xuXHRyZWFkb25seSBjb25maXJtYXRpb25fdHlwZT86IFZvaWNlQ29uZmlybWF0aW9uVHlwZTtcblx0cmVhZG9ubHkgbGFzdF9yZXNwb25zZV9zdW1tYXJ5Pzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVZpc2libGVWb2ljZVF1ZXN0aW9ubmFpcmUge1xuXHRyZWFkb25seSBjb250ZXh0Pzogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nO1xuXHRyZWFkb25seSBxdWVzdGlvbnM6IHJlYWRvbmx5IHtcblx0XHRyZWFkb25seSBwcm9tcHQ/OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7XG5cdFx0cmVhZG9ubHkgZGV0YWlscz86IHN0cmluZyB8IElNYXJrZG93blN0cmluZztcblx0XHRyZWFkb25seSBvcHRpb25zOiByZWFkb25seSBzdHJpbmdbXTtcblx0XHRyZWFkb25seSBhbGxvd0ZyZWVmb3JtSW5wdXQ6IGJvb2xlYW47XG5cdH1bXTtcbn1cblxuZnVuY3Rpb24gaGFzT3duPEsgZXh0ZW5kcyBzdHJpbmc+KHZhbHVlOiBvYmplY3QsIGtleTogSyk6IHZhbHVlIGlzIFJlY29yZDxLLCB1bmtub3duPiB7XG5cdHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodmFsdWUsIGtleSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVBlbmRpbmdUb29sQ29uZmlybWF0aW9uIHtcblx0cmVhZG9ubHkgdHlwZTogJ2FwcHJvdmFsJyB8ICdpbnB1dCc7XG5cdHJlYWRvbmx5IHNlc3Npb25MYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZztcblx0YXBwcm92ZSgpOiB2b2lkO1xuXHRkZW55KCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRyYW5zY3JpcHRUdXJuIHtcblx0cmVhZG9ubHkgc3BlYWtlcjogJ3VzZXInIHwgJ2Fzc2lzdGFudCc7XG5cdHJlYWRvbmx5IHRleHQ6IHN0cmluZztcblx0LyoqIFN0YWJsZS1yZWNvZ25pdGlvbiBwcmVmaXggb2YgYHRleHRgLiBVc2VyIHR1cm5zIG9ubHk7IGVtcHR5IG90aGVyd2lzZS4gKi9cblx0cmVhZG9ubHkgY29tbWl0dGVkOiBzdHJpbmc7XG5cdC8qKiBUcnVlIHdoaWxlIHRoZSB1c2VyIGlzIHN0aWxsIHNwZWFraW5nIChsaXZlIHJlY29nbml0aW9uKS4gKi9cblx0cmVhZG9ubHkgaXNQYXJ0aWFsOiBib29sZWFuO1xufVxuXG50eXBlIFRyYW5zY3JpcHRpb25UdXJuUGhhc2UgPSAnYWN0aXZlJyB8ICdwZW5kaW5nJyB8ICdmaW5hbCc7XG5cbmludGVyZmFjZSBJVHJhbnNjcmlwdGlvblR1cm5TdGF0ZSB7XG5cdHJlYWRvbmx5IHR1cm5JZDogc3RyaW5nO1xuXHRoaWdoZXN0UmV2aXNpb246IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cGhhc2U6IFRyYW5zY3JpcHRpb25UdXJuUGhhc2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgdm9pY2VTdGF0ZTogSU9ic2VydmFibGU8Vm9pY2VTdGF0ZT47XG5cdHJlYWRvbmx5IHN0YXR1c1RleHQ6IElPYnNlcnZhYmxlPHN0cmluZz47XG5cdC8qKiBSb2xsaW5nIGJ1ZmZlciBvZiB0aGUgbGFzdCAyIHRyYW5zY3JpcHQgdHVybnMgKG9sZGVzdCBmaXJzdCkuICovXG5cdHJlYWRvbmx5IHRyYW5zY3JpcHRUdXJuczogSU9ic2VydmFibGU8cmVhZG9ubHkgSVRyYW5zY3JpcHRUdXJuW10+O1xuXHRyZWFkb25seSBpc0Nvbm5lY3RlZDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IGlzQ29ubmVjdGluZzogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IGlzUmVjb25uZWN0aW5nOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgcGVuZGluZ1Rvb2xDb25maXJtYXRpb25zOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJUGVuZGluZ1Rvb2xDb25maXJtYXRpb25bXT47XG5cdC8qKiBUaGUgc2Vzc2lvbiByZXNvdXJjZSB0aGF0IHRyYW5zY3JpcHRpb25zIHdpbGwgYmUgc2VudCB0by4gdW5kZWZpbmVkID0gYWN0aXZlIHNlc3Npb24uICovXG5cdHJlYWRvbmx5IHRhcmdldFNlc3Npb246IElPYnNlcnZhYmxlPFVSSSB8IHVuZGVmaW5lZD47XG5cblx0Y29ubmVjdCh3aW5kb3c6IFdpbmRvdyAmIHR5cGVvZiBnbG9iYWxUaGlzKTogUHJvbWlzZTx2b2lkPjtcblx0ZGlzY29ubmVjdChzb3VyY2U/OiAnZXhwbGljaXQnIHwgJ2ludGVybmFsJyk6IHZvaWQ7XG5cblx0cHR0RG93bihzb3VyY2U/OiAnZXhwbGljaXQnIHwgJ2F1dG8nIHwgJ2Nvbm5lY3QnLCBmb3JjZU5ld1R1cm4/OiBib29sZWFuKTogdm9pZDtcblx0cHR0VXAoc291cmNlPzogJ2V4cGxpY2l0JyB8ICdpbnRlcm5hbCcsIGZvcmNlRmluaXNoPzogYm9vbGVhbik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFN0b3AgdGhlIGN1cnJlbnQgcmVjb3JkaW5nIC8gYXV0by1saXN0ZW4gbG9vcCB3aXRob3V0IGRpc2Nvbm5lY3RpbmcuXG5cdCAqIEFueSBpbi1mbGlnaHQgcHVzaC10by10YWxrIHByZXNzIGlzIGZpbmlzaGVkIHRocm91Z2ggdGhlIG5vcm1hbFxuXHQgKiBgcHR0X2VuZGAgcGF0aCAodGhlIGJhY2tlbmQgZmluYWxpemVzIHRoZSB0dXJuKSBhbmQgdGhlIGF1dG8tbGlzdGVuXG5cdCAqIHJlLWFybSBsb29wIGlzIHN1cHByZXNzZWQgdW50aWwgdGhlIHVzZXIgdGFsa3MgYWdhaW4uIFRoZSBXZWJTb2NrZXRcblx0ICogc3RheXMgY29ubmVjdGVkIHNvIHRoZSB1c2VyIGNhbiByZXN1bWUgdmlhIHRoZSBWb2ljZSBNb2RlIGJ1dHRvblxuXHQgKiB3aXRob3V0IGEgbmV3IGhhbmRzaGFrZS4gVXNlIGBkaXNjb25uZWN0KClgIHRvIGZ1bGx5IGVuZCB0aGUgc2Vzc2lvbi5cblx0ICovXG5cdHN0b3BMaXN0ZW5pbmcoc291cmNlPzogJ2V4cGxpY2l0JyB8ICdpbnRlcm5hbCcpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBIb2xkIGhhbmRzLWZyZWUgYXV0by1saXN0ZW4gb2ZmIHVudGlsIHJlbGVhc2VkLlxuXHQgKlxuXHQgKiBVbmxpa2Uge0BsaW5rIHN0b3BMaXN0ZW5pbmd9LCB0aGlzIGlzIHNhZmUgdG8gY2FsbCAqYmVmb3JlKiB0aGUgc2Vzc2lvbiBpc1xuXHQgKiBjb25uZWN0ZWQ6IGl0IHN1cnZpdmVzIHRoZSBjb25uZWN0IGhhbmRzaGFrZSwgc28gYSBjYWxsZXIgdGhhdCBuZWVkcyB0aGVcblx0ICogbWljcm9waG9uZSB0byBzdGF5IHNodXQgd2hpbGUgdGhlIHVzZXIgcmVhZHMgb3IgZGVjaWRlcyBzb21ldGhpbmcgY2FuIHRha2Vcblx0ICogdGhlIGhvbGQgYXQgYGNvbm5lY3QoKWAgdGltZSByYXRoZXIgdGhhbiByYWNpbmcgYHNlc3Npb25faW5pdGAuIFJlbGVhc2luZ1xuXHQgKiBlbnRlcnMgbGlzdGVuaW5nIGltbWVkaWF0ZWx5IGlmIGhhbmRzLWZyZWUgd291bGQgaGF2ZSBkb25lIHNvLlxuXHQgKi9cblx0c2V0QXV0b0xpc3RlbkhlbGQoaGVsZDogYm9vbGVhbik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFN0b3AgdGhlIGN1cnJlbnQgcmVjb3JkaW5nIFdJVEhPVVQgZmluYWxpemluZyB0aGUgdHVybjogYW55IGluLWZsaWdodFxuXHQgKiBwdXNoLXRvLXRhbGsgcHJlc3MgaXMgYWJvcnRlZCAobm8gYHB0dF9lbmRgIGlzIHNlbnQpLCBzbyB0aGUgYmFja2VuZFxuXHQgKiBuZXZlciBmaW5hbGl6ZXMgdGhlIGJ1ZmZlcmVkIHNwZWVjaCBpbnRvIGEgYHNlbmRfdG9fY2hhdGAuIFVzZSB0aGlzIG9uXG5cdCAqIGZvY3VzIGNoYW5nZXMgc28gc3BlZWNoIGNhcHR1cmVkIGZvciBvbmUgc2Vzc2lvbiBjYW4ndCBiZSBtaXNyb3V0ZWQgdG8gYVxuXHQgKiBuZXdseSBmb2N1c2VkIHNlc3Npb24uIExpa2Uge0BsaW5rIHN0b3BMaXN0ZW5pbmd9LCB0aGUgV2ViU29ja2V0IHN0YXlzXG5cdCAqIGNvbm5lY3RlZCBhbmQgdGhlIGF1dG8tbGlzdGVuIHJlLWFybSBsb29wIGlzIHN1cHByZXNzZWQgdW50aWwgdGhlIHVzZXJcblx0ICogdGFsa3MgYWdhaW4uXG5cdCAqL1xuXHRkaXNjYXJkTGlzdGVuaW5nKCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFN0b3AgbGlzdGVuaW5nIG9uIGEgZm9jdXMgY2hhbmdlIHdoaWxlIHRoZSB1c2VyIGlzIGFjdGl2ZWx5IGRpY3RhdGluZzpcblx0ICogZmluYWxpemUgdGhlIGluLWZsaWdodCBwcmVzcyAoc2VuZCBgcHR0X2VuZGApIGJ1dCBwaW4gdGhlIHJlc3VsdGluZ1xuXHQgKiBzdWJtaXNzaW9uIHRvIGBzZXNzaW9uYCBcdTIwMTQgdGhlIHNlc3Npb24gdGhlIHVzZXIgd2FzIGRpY3RhdGluZyBpbnRvIFx1MjAxNCBzb1xuXHQgKiB0aGVpciB3b3JkcyBhcmUgbm90IG1pc3JvdXRlZCB0byB0aGUgbmV3bHkgZm9jdXNlZCBzZXNzaW9uLiBUaGUgV2ViU29ja2V0XG5cdCAqIHN0YXlzIGNvbm5lY3RlZCBhbmQgdGhlIGF1dG8tbGlzdGVuIHJlLWFybSBsb29wIGlzIHN1cHByZXNzZWQgdW50aWwgdGhlXG5cdCAqIHVzZXIgdGFsa3MgYWdhaW4uIFVzZSB7QGxpbmsgZGlzY2FyZExpc3RlbmluZ30gaW5zdGVhZCB3aGVuIG5vdGhpbmcgaGFzXG5cdCAqIGJlZW4gZGljdGF0ZWQgeWV0LlxuXHQgKi9cblx0ZmluaXNoTGlzdGVuaW5nQW5kU3VibWl0VG8oc2Vzc2lvbjogVVJJKTogdm9pZDtcblxuXHQvKipcblx0ICogTWFyayBhIHNlc3Npb24gYXMgaGF2aW5nIGJlZW4gY2FuY2VsbGVkIGJ5IHRoZSB1c2VyIGZyb20gVlMgQ29kZSBVSS4gVGhlXG5cdCAqIG5leHQgc3RhdGUtY2hhbmdlIGRldGVjdGVkIGZvciB0aGlzIHNlc3Npb24gKHR5cGljYWxseSB0aGUgY2hhdCBtb2RlbFxuXHQgKiB0cmFuc2l0aW9uaW5nIHRvIGBpZGxlYCkgd2lsbCBiZSBzdXBwcmVzc2VkIHNvIHRoZSBiYWNrZW5kIGRvZXNuJ3Rcblx0ICogbmFycmF0ZSBhIHN0YXR1cyB1cGRhdGUgdGhlIHVzZXIgYWxyZWFkeSBrbm93cyBhYm91dC5cblx0ICovXG5cdG1hcmtVc2VyQ2FuY2VsbGVkKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZDtcblxuXHQvKipcblx0ICogU2V0IHRoZSB0YXJnZXQgc2Vzc2lvbiBmb3IgdHJhbnNjcmlwdGlvbi4gV2hlbiBzZXQsIHRyYW5zY3JpcHRpb25zIGFyZVxuXHQgKiBzZW50IHRvIHRoaXMgc2Vzc2lvbiBpbnN0ZWFkIG9mIHRoZSBjdXJyZW50bHkgYWN0aXZlIG9uZS5cblx0ICovXG5cdHNldFRhcmdldFNlc3Npb24ocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIG5ldyBjaGF0IHNlc3Npb24gYW5kIHNldCBpdCBhcyB0aGUgdGFyZ2V0IGZvciB0cmFuc2NyaXB0aW9uLlxuXHQgKi9cblx0bmV3U2Vzc2lvbkFzVGFyZ2V0KCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIERlY2xhcmVzIHRoZSBVSSdzIGFjdGl2ZSBzZXNzaW9uIGZvciBhdWRpbyByb3V0aW5nIChgaXNfYWN0aXZlYCwgZGVmZXJyYWwsXG5cdCAqIGFuZCBidWZmZXJlZCBmbHVzaGVzKS4gYHVuZGVmaW5lZGAgcmVzdG9yZXMgZm9jdXMtYmFzZWQgZGV0ZWN0aW9uLlxuXHQgKi9cblx0c2V0QWN0aXZlU2Vzc2lvblNob3duKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBEZXRlcm1pbmlzdGljYWxseSByb3V0ZSBhdWRpbyB0byBhbmQgbmFycmF0ZSBhIHNlc3Npb24gaW4gcmVzcG9uc2UgdG8gYW5cblx0ICogZXhwbGljaXQgVUkgYWN0aW9uIChlLmcuIGNsaWNraW5nIGEgc2Vzc2lvbidzIHBlbmRpbmctdm9pY2UgaW5kaWNhdG9yKS5cblx0ICogVW5saWtlIHRoZSBzaG93bi9mb2N1cyBoZXVyaXN0aWNzLCB0aGlzIGFjdGl2YXRlcyBldmVuIHdoZW4gdGhlIHNlc3Npb24gaXNcblx0ICogYWxyZWFkeSB0aGUgYWN0aXZlL3Nob3duIG9uZSAtIHNvIGEgY29tcGxldGVkIGJhY2tncm91bmQgcmVwbHkgdGhlIHVzZXJcblx0ICogY2xpY2tzIHRvIGhlYXIgaXMgcGxheWVkIHJhdGhlciB0aGFuIHNpbGVudGx5IGlnbm9yZWQgYmVjYXVzZSBubyBmb2N1cyBvclxuXHQgKiB2aWV3LW1vZGVsIGNoYW5nZSBldmVudCBmaXJlZC5cblx0ICovXG5cdGFjdGl2YXRlU2Vzc2lvbihyZXNvdXJjZTogVVJJKTogdm9pZDtcblxuXHQvKipcblx0ICogU3VibWl0IHVzZXIgZmVlZGJhY2sgYWxvbmcgd2l0aCBmdWxsIGRpYWdub3N0aWMgZGF0YSAodHJhbnNjcmlwdCBoaXN0b3J5LFxuXHQgKiBjbGllbnQgc3RhdGUsIGVudmlyb25tZW50IGluZm8pLiBSZXR1cm5zIHN1Y2Nlc3MvZmFpbHVyZS5cblx0ICovXG5cdHN1Ym1pdEZlZWRiYWNrKGZlZWRiYWNrVGV4dDogc3RyaW5nKTogUHJvbWlzZTx7IG9rOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PjtcblxuXHQvKiogREVWIE9OTFk6IFNpbXVsYXRlIGEgY29ubmVjdGVkIHNlc3Npb24gd2l0aCBmYWtlIHRyYW5zY3JpcHQgZm9yIFVJIHRlc3RpbmcuICovXG5cdHNpbXVsYXRlQ29ubmVjdGlvbigpOiB2b2lkO1xufVxuXG5leHBvcnQgY29uc3QgSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIgPSBjcmVhdGVEZWNvcmF0b3I8SVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXI+KCd2b2ljZVNlc3Npb25Db250cm9sbGVyJyk7XG5cbmV4cG9ydCBjbGFzcyBWb2ljZVNlc3Npb25Db250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElWb2ljZVNlc3Npb25Db250cm9sbGVyIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvLyAtLS0gT2JzZXJ2YWJsZXMgLS0tXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZvaWNlU3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8Vm9pY2VTdGF0ZT4odGhpcywgJ2lkbGUnKTtcblx0cmVhZG9ubHkgdm9pY2VTdGF0ZTogSU9ic2VydmFibGU8Vm9pY2VTdGF0ZT4gPSB0aGlzLl92b2ljZVN0YXRlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXR1c1RleHQgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nPih0aGlzLCAnVGFwIHRvIHN0YXJ0Jyk7XG5cdHJlYWRvbmx5IHN0YXR1c1RleHQ6IElPYnNlcnZhYmxlPHN0cmluZz4gPSB0aGlzLl9zdGF0dXNUZXh0O1xuXG5cdC8vIFJvbGxpbmcgYnVmZmVyIChtYXggMikuIEVhY2ggYHB0dERvd25gIGFuZCBlYWNoIGFzc2lzdGFudCB0dXJuIHB1c2hlcyBhIG5ld1xuXHQvLyBlbnRyeTsgdGhlIG9sZGVzdCBpcyBldmljdGVkLiBMaXZlIHVzZXIgdHJhbnNjcmlwdGlvbiBtdXRhdGVzIHRoZSBsYXN0XG5cdC8vIGVudHJ5IGluIHBsYWNlIHdoaWxlIGl0J3Mgc3RpbGwgYSB1c2VyIHR1cm4gYXQgdGhlIHRhaWwuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9NQVhfVFVSTlMgPSAyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmFuc2NyaXB0VHVybnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSVRyYW5zY3JpcHRUdXJuW10+KHRoaXMsIFtdKTtcblx0cmVhZG9ubHkgdHJhbnNjcmlwdFR1cm5zOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJVHJhbnNjcmlwdFR1cm5bXT4gPSB0aGlzLl90cmFuc2NyaXB0VHVybnM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaXNDb25uZWN0ZWQgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4odGhpcywgZmFsc2UpO1xuXHRyZWFkb25seSBpc0Nvbm5lY3RlZDogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSB0aGlzLl9pc0Nvbm5lY3RlZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0Nvbm5lY3RpbmcgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4odGhpcywgZmFsc2UpO1xuXHRyZWFkb25seSBpc0Nvbm5lY3Rpbmc6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gdGhpcy5faXNDb25uZWN0aW5nO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzUmVjb25uZWN0aW5nID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KHRoaXMsIGZhbHNlKTtcblx0cmVhZG9ubHkgaXNSZWNvbm5lY3Rpbmc6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gdGhpcy5faXNSZWNvbm5lY3Rpbmc7XG5cblx0LyoqIFNldCB3aGVuIHRoZSBjb25uZWN0aW9uIGNsb3NlZCB0ZXJtaW5hbGx5IChlLmcuIGFub3RoZXIgd2luZG93IHRvb2sgb3ZlclxuXHQgKiAgdGhlIHNlc3Npb24pLiBTdXBwcmVzc2VzIHRoZSByZWNvbm5lY3QgZGlzcGxheSBwYXRoIHNvIHRoZSBjb250cm9sbGVyXG5cdCAqICBzZXR0bGVzIHRvIGEgY2xlYW4sIHJlc3RhcnRhYmxlIHN0YXRlIGluc3RlYWQgb2YgYSBzdHVjayBcIlJlY29ubmVjdGluZy4uLlwiLlxuXHQgKiAgQ2xlYXJlZCBvbiB0aGUgbmV4dCB7QGxpbmsgY29ubmVjdH0uICovXG5cdHByaXZhdGUgX2ZhdGFsRGlzY29ubmVjdCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdUb29sQ29uZmlybWF0aW9ucyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJUGVuZGluZ1Rvb2xDb25maXJtYXRpb25bXT4odGhpcywgW10pO1xuXHRyZWFkb25seSBwZW5kaW5nVG9vbENvbmZpcm1hdGlvbnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElQZW5kaW5nVG9vbENvbmZpcm1hdGlvbltdPiA9IHRoaXMuX3BlbmRpbmdUb29sQ29uZmlybWF0aW9ucztcblxuXHQvKipcblx0ICogU2Vzc2lvbiByZXNvdXJjZXMgd2hvc2UgcGVuZGluZyBjb25maXJtYXRpb25zIHdlcmUgZHJvcHBlZCBhdCBhIHRlcm1pbmFsXG5cdCAqIHRlYXJkb3duIChkaXNjb25uZWN0L2ZhdGFsKS4gVGhlIGFsd2F5cy1vbiB0cmFja2VyIGV4Y2x1ZGVzIHRoZW0gc28gaXRcblx0ICogY2FuJ3QgcmVwb3B1bGF0ZSB7QGxpbmsgX3BlbmRpbmdUb29sQ29uZmlybWF0aW9uc30gZnJvbSB0aGUgc3RpbGwtcGVuZGluZ1xuXHQgKiBvbGQgc2Vzc2lvbiBiZWZvcmUgdGhlIG5leHQge0BsaW5rIGNvbm5lY3R9LCB3aGljaCBjbGVhcnMgdGhpcyBzZXQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdXBwcmVzc2VkQ29uZmlybWF0aW9uU2Vzc2lvbnMgPSBvYnNlcnZhYmxlVmFsdWU8UmVhZG9ubHlTZXQ8c3RyaW5nPj4odGhpcywgbmV3IFNldCgpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90YXJnZXRTZXNzaW9uID0gb2JzZXJ2YWJsZVZhbHVlPFVSSSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgdGFyZ2V0U2Vzc2lvbjogSU9ic2VydmFibGU8VVJJIHwgdW5kZWZpbmVkPiA9IHRoaXMuX3RhcmdldFNlc3Npb247XG5cblx0Ly8gLS0tIEludGVybmFsIHN0YXRlIC0tLVxuXHRwcml2YXRlIF9wdHRIZWxkID0gZmFsc2U7XG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBjdXJyZW50IGhlbGQgdHVybidzIGBwdHRfc3RhcnRgIHdhcyBwYXNzaXZlIChhIGhhbmRzLWZyZWVcblx0ICogb3BlbiBtaWM6IGF1dG8tbGlzdGVuIG9yIGJhcmdlLWluKS4gQSBwYXNzaXZlIHR1cm4gdGVsbHMgdGhlIGJhY2tlbmQgbm90XG5cdCAqIHRvIGxhdGNoIGB1c2VyX2lzX3NwZWFraW5nYDsgYSBkZWxpYmVyYXRlIHByZXNzIChub24tcGFzc2l2ZSkgZG9lcyBsYXRjaC5cblx0ICogUmVhZCBieSB7QGxpbmsgX3ByZXBhcmVGb3JQbGF5YmFja30gdG8gZGVjaWRlIHdoZXRoZXIgYWJvcnRpbmcgdGhlIGhlbGRcblx0ICogdHVybiAod2hpY2ggc2VuZHMgbm8gYHB0dF9lbmRgKSBpcyBzYWZlLiBPbmx5IG1lYW5pbmdmdWwgd2hpbGUgYF9wdHRIZWxkYC5cblx0ICovXG5cdHByaXZhdGUgX3B0dEN1cnJlbnRUdXJuUGFzc2l2ZSA9IGZhbHNlO1xuXHRwcml2YXRlIF9wdHRUb2dnbGVNb2RlID0gZmFsc2U7XG5cdC8qKlxuXHQgKiBUcnVlIHdoaWxlIGEgcGFzc2l2ZSBoYW5kcy1mcmVlIGJhcmdlLWluIGxpc3RlbiBpcyBzdHJlYW1pbmcgZHVyaW5nIHRoZVxuXHQgKiBhc3Npc3RhbnQncyBwbGF5YmFjayAob3BlbmVkIGJ5IGBfc3RhcnRCYXJnZUluTGlzdGVuYCkuIEl0IGlzIE5PVCB0b2dnbGVcblx0ICogbW9kZSBcdTIwMTQgYW4gZXhwbGljaXQgYHB0dERvd24oKWAgcHJvbW90ZXMgdGhpcyBzdHJlYW0gaW50byBhIHVzZXItZHJpdmVuXG5cdCAqIGludGVycnVwdCByYXRoZXIgdGhhbiBmaW5pc2hpbmcgaXQuIENsZWFyZWQgb25jZSB0aGUgdHVybiBlbmRzLCBpc1xuXHQgKiBwcm9tb3RlZCwgb3IgdHJhbnNpdGlvbnMgdG8gYSBub3JtYWwgbGlzdGVuaW5nIHR1cm4gd2hlbiBwbGF5YmFjayBzdG9wcy5cblx0ICovXG5cdHByaXZhdGUgX2JhcmdlSW5MaXN0ZW5BY3RpdmUgPSBmYWxzZTtcblx0LyoqIFdoZW4gdHJ1ZSwgdGhlIGF1dG8tbGlzdGVuIGxvb3AgaXMgc3VwcHJlc3NlZCAodXNlciBwcmVzc2VkIFN0b3Bcblx0ICogIFJlY29yZGluZykuIENsZWFyZWQgb24gdGhlIG5leHQgZXhwbGljaXQgYHB0dERvd25gIG9yIG9uIGNvbm5lY3QuICovXG5cdHByaXZhdGUgX2F1dG9MaXN0ZW5TdXBwcmVzc2VkID0gZmFsc2U7XG5cdC8qKlxuXHQgKiBBdXRvLWxpc3RlbiBob2xkIHRha2VuIGJ5IFVJIHRoYXQgbXVzdCBub3QgYmUgdGFsa2VkIG92ZXIgKHNlZVxuXHQgKiB7QGxpbmsgc2V0QXV0b0xpc3RlbkhlbGR9KS4gRGVsaWJlcmF0ZWx5IHNlcGFyYXRlIGZyb21cblx0ICogYF9hdXRvTGlzdGVuU3VwcHJlc3NlZGAsIHdoaWNoIHB0dERvd24sIHBsYXliYWNrIHByZXAgYW5kIGRpc2Nvbm5lY3QgYWxsXG5cdCAqIGNsZWFyIGFzIHBhcnQgb2Ygbm9ybWFsIHR1cm4tdGFraW5nIC0gYSBob2xkIGhhcyB0byBvdXRsaXZlIGFsbCBvZiB0aGF0LlxuXHQgKi9cblx0cHJpdmF0ZSBfYXV0b0xpc3RlbkhlbGQgPSBmYWxzZTtcblx0LyoqIFRpbWVzdGFtcCAobXMpIHVudGlsIHdoaWNoIGFuIGluY29taW5nIGBzZW5kX3RvX2NoYXRgIGlzIGRyb3BwZWQgYWZ0ZXIgYVxuXHQgKiAgZGlzY2FyZGVkIHR1cm4sIHNvIGJ1ZmZlcmVkIHNwZWVjaCBmcm9tIGEgZm9jdXMtY2hhbmdlIGRpc2NhcmQgY2FuJ3QgYmVcblx0ICogIG1pc3JvdXRlZCB0byB0aGUgbmV3bHkgZm9jdXNlZCBzZXNzaW9uLiBDbGVhcmVkIG9uIHRoZSBuZXh0IGBwdHREb3duYC4gKi9cblx0cHJpdmF0ZSBfc3VwcHJlc3NTZW5kVG9DaGF0VW50aWwgPSAwO1xuXHQvKiogT25lLXNob3Qgc2Vzc2lvbiB0aGF0IHRoZSBuZXh0IGZpbmFsaXplZCB0dXJuIG11c3QgYmUgc3VibWl0dGVkIHRvLFxuXHQgKiAgcmVnYXJkbGVzcyBvZiB3aGljaCBzZXNzaW9uIGlzIGZvY3VzZWQuIFNldCB3aGVuIGxpc3RlbmluZyBpcyBzdG9wcGVkIG9uXG5cdCAqICBhIGZvY3VzIGNoYW5nZSB3aGlsZSB0aGUgdXNlciBpcyBhY3RpdmVseSBkaWN0YXRpbmcsIHNvIHRoZWlyIHdvcmRzIGxhbmRcblx0ICogIGluIHRoZSBzZXNzaW9uIHRoZXkgd2VyZSBkaWN0YXRpbmcgaW50byByYXRoZXIgdGhhbiB0aGUgbmV3bHkgZm9jdXNlZFxuXHQgKiAgb25lLiBDb25zdW1lZCBieSB0aGUgbmV4dCBgc2VuZF90b19jaGF0YDsgYWxzbyBjbGVhcmVkIG9uIGBwdHREb3duYCBhbmRcblx0ICogIGFmdGVyIHtAbGluayBfUElOTkVEX1NVQk1JVF9FWFBJUllfTVN9LiAqL1xuXHRwcml2YXRlIF9waW5uZWRTdWJtaXRTZXNzaW9uOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Bpbm5lZFN1Ym1pdFRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IHVuZGVmaW5lZDtcblx0LyoqIEFybWVkIG9uIGEgZnJlc2ggY29ubmVjdCAoaGFuZHMtZnJlZSk7IGNvbnN1bWVkIG9uIGBzZXNzaW9uX2luaXRgIHRvXG5cdCAqICBlbnRlciBsaXN0ZW5pbmcgb25jZSB0aGUgYmFja2VuZCBhY2tzIHRoZSBzZXNzaW9uLiAqL1xuXHRwcml2YXRlIF9lbnRlckxpc3Rlbk9uU2Vzc2lvbkluaXQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfcHR0Q3VycmVudFR1cm5JZCA9ICcnO1xuXHRwcml2YXRlIF90cmFuc2NyaXB0aW9uVHVyblN0YXRlOiBJVHJhbnNjcmlwdGlvblR1cm5TdGF0ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfd2luZG93OiAoV2luZG93ICYgdHlwZW9mIGdsb2JhbFRoaXMpIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF92b2ljZUV2ZW50RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF92b2ljZUF1dG9ydW5EaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHQvKipcblx0ICogV2F0Y2hkb2cgdGhhdCByZXNldHMgYGlzQ29ubmVjdGluZ2AgKGFuZCBzdXJmYWNlcyBmZWVkYmFjaykgaWYgdGhlIGNvbm5lY3Rcblx0ICogaGFuZHNoYWtlIG5ldmVyIGNvbXBsZXRlcy4gQXJtZWQgdXAgZnJvbnQgaW4ge0BsaW5rIGNvbm5lY3R9IHNvIGEgc3RlcCB0aGF0XG5cdCAqIGhhbmdzIChlLmcuIHJlc29sdmluZyB0aGUgR2l0SHViIHNlc3Npb24gd2hpbGUgYSBjaGF0IHJlcXVlc3QgaXMgaW4gZmxpZ2h0KVxuXHQgKiBjYW4ndCBsZWF2ZSB0aGUgdG9vbGJhciBzcGlubmVyIHN0dWNrIGluZGVmaW5pdGVseS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3RXYXRjaGRvZyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX0NPTk5FQ1RfVElNRU9VVF9NUyA9IDEwMDAwO1xuXHRwcml2YXRlIF9jb25uZWN0QXR0ZW1wdEdlbmVyYXRpb24gPSAwO1xuXHRwcml2YXRlIF9zZXNzaW9uSW5pdGlhbGl6YXRpb25HZW5lcmF0aW9uID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfYXV0b0FwcHJvdmVkU2Vzc2lvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSBfdHJhbnNjcmlwdEZhZGVUaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3B0dE1heER1cmF0aW9uVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfUFRUX01BWF9EVVJBVElPTl9NUyA9IDUgKiA2MCAqIDEwMDA7XG5cdC8qKiBTaG9ydC10YXAgdGhyZXNob2xkOiBpZiB0aGUga2V5IGlzIGhlbGQgZm9yIGxlc3MgdGhhbiB0aGlzLCBlbnRlclxuXHQgKiAgdG9nZ2xlIG1vZGUgd2hlcmUgYSBzZWNvbmQgdGFwIGZpbmlzaGVzIHRoZSByZWNvcmRpbmcuICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9QVFRfVE9HR0xFX1RIUkVTSE9MRF9NUyA9IDMwMDtcblxuXHQvKiogRGVib3VuY2UgYmVmb3JlIHJlLWVudGVyaW5nIGxpc3RlbmluZyBhZnRlciBhc3Npc3RhbnQgc3RvcHMgc3BlYWtpbmcuICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9BVVRPX0xJU1RFTl9RVUlFVF9NUyA9IDEyMDA7XG5cdHByaXZhdGUgX2RlbGF5ZWRNaWNTdG9wVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hdXRvTGlzdGVuVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wdHRXYWl0aW5nRm9yUGxheWJhY2sgPSBmYWxzZTtcblx0LyoqIEd1YXJkcyBhdXRvIHJlLWxpc3Rlbjogb25seSByZS1hcm0gYWZ0ZXIgYSByZXBseSBoYXMgYWN0dWFsbHkgcGxheWVkLiAqL1xuXHRwcml2YXRlIF9yZXBseVBsYXllZFNpbmNlU2VuZCA9IGZhbHNlO1xuXHQvKiogU2V0IGFmdGVyIHNlbmRfdG9fY2hhdDsgYmxvY2tzIGF1dG8tbGlzdGVuIHVudGlsIHRoZSByZXBseSBUVFMgc3RhcnRzLiAqL1xuXHRwcml2YXRlIF9hd2FpdGluZ1JlcGx5QXVkaW8gPSBmYWxzZTtcblx0LyoqXG5cdCAqIFNlc3Npb24gYXdhaXRpbmcgdGhlIHVzZXIncyByZXBseS4gT3RoZXItc2Vzc2lvbiBuYXJyYXRpb24gaXMgdW5zb2xpY2l0ZWRcblx0ICogZXZlbiB3aGlsZSBgX2F3YWl0aW5nUmVwbHlBdWRpb2AgaXMgdHJ1ZSwgc28gc3RhbGUgb24tZm9jdXMgcmUtcmVhZHMgZHJvcC5cblx0ICovXG5cdHByaXZhdGUgX2F3YWl0aW5nUmVwbHlGb3JTZXNzaW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2F3YWl0aW5nUmVwbHlXYXRjaGRvZzogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCB1bmRlZmluZWQ7XG5cblx0Ly8gLS0tIEF1ZGlvIEZJRk8gcXVldWUgLS0tXG5cdHByaXZhdGUgcmVhZG9ubHkgX2F1ZGlvUXVldWU6IElRdWV1ZWRBdWRpb1Jlc3BvbnNlW10gPSBbXTtcblx0cHJpdmF0ZSBfY3VycmVudFBsYXliYWNrU2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsID0gbnVsbDsgLy8gbnVsbCA9IG5vdGhpbmcgcGxheWluZ1xuXHQvLyBUaGUgbmFycmF0aW9uIGlkIG9mIHRoZSByZXNwb25zZSBjdXJyZW50bHkgb2NjdXB5aW5nIHRoZSBwbGF5YmFjayBzbG90LCBpZlxuXHQvLyBpdCB3YXMgYSBzb2xpY2l0ZWQgbmFycmF0aW9uLiBTZXQgd2hlbiBhIGNodW5rIGFjdHVhbGx5IGNsYWltcyB0aGUgc2xvdCBhbmRcblx0Ly8gY29uc3VtZWQgaW4gb25QbGF5YmFja1N0b3BwZWQgdG8gbWFyayB0aGUgcmVwbHkgaGVhcmQgT05MWSBvbmNlIGl0cyBhdWRpb1xuXHQvLyBoYXMgdHJ1bHkgZmluaXNoZWQgcGxheWluZyAobmV2ZXIgbWVyZWx5IHF1ZXVlZCBvciByZWNlaXZlZCAtIHNlZVxuXHQvLyB7QGxpbmsgX21hcmtOYXJyYXRpb25IZWFyZH0pLlxuXHRwcml2YXRlIF9jdXJyZW50UGxheWJhY2tSZXNwb25zZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2N1cnJlbnRQbGF5YmFja05hcnJhdGlvbjogSVBsYXliYWNrTmFycmF0aW9uIHwgdW5kZWZpbmVkO1xuXHQvLyBUcnVlIG9uY2UgdGhlIGN1cnJlbnRseS1wbGF5aW5nIHJlc3BvbnNlIGhhcyByZWNlaXZlZCBpdHMgZmluYWwgYXVkaW9cblx0Ly8gY2h1bmsuIEEgc2FtZS1zZXNzaW9uIGZyYW1lIGFycml2aW5nIGFmdGVyIHRoaXMgbWFya3MgYSBORVcgcmVzcG9uc2UgYW5kXG5cdC8vIG11c3QgYmUgc2VyaWFsaXplZCAocXVldWVkKSByYXRoZXIgdGhhbiBmYXN0LXBhdGhlZCwgb3IgaXRzIGF1ZGlvIHdvdWxkIGJlXG5cdC8vIGFwcGVuZGVkIGludG8gdGhlIGZpbmFsaXplZCBwbGF5YmFjayB0dXJuIGFuZCBkcm9wcGVkIHBhc3QgYG5vZGUuc3RvcCgpYC5cblx0cHJpdmF0ZSBfY3VycmVudFBsYXliYWNrRmluYWxpemVkID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzUHJvY2Vzc2luZ1F1ZXVlID0gZmFsc2U7XG5cblx0Ly8gVHJ1ZSB3aGlsZSB3ZSdyZSBzdXBwcmVzc2luZyBpbi1mbGlnaHQgYXNzaXN0YW50IGF1ZGlvIGZyb20gdGhlIHByZXZpb3VzXG5cdC8vIHR1cm4gKGUuZy4gdXNlciBpbnRlcnJ1cHRlZCB3aXRoIFBUVCkuIENsZWFyZWQgdGhlIG1vbWVudCBhIG5ldyBhc3Npc3RhbnRcblx0Ly8gcmVzcG9uc2UgYmVnaW5zIFx1MjAxNCBzaWduYWxsZWQgYnkgYGlzX2ZpcnN0X2NodW5rYCBvbiB0aGUgYXVkaW9fcmVzcG9uc2UgXHUyMDE0XG5cdC8vIHNvIHRoZSBuZXh0IHJlc3BvbnNlIHBsYXlzIGNsZWFubHkuIEVhcmxpZXIgdGhpcyBmbGFnIGtleWVkIG9uXG5cdC8vIGB0cmFuc2NyaXB0YCBwcmVzZW5jZSwgYnV0IHRoZSBzdHJlYW1pbmcgcGlwZWxpbmUgc2VuZHMgYSBydW5uaW5nLWNvbmNhdFxuXHQvLyB0cmFuc2NyaXB0IG9uIGV2ZXJ5IGNodW5rLCBzbyBhIGxhdGUgY2h1bmsgZnJvbSB0aGUgb2xkIHR1cm4gd291bGQgaGF2ZVxuXHQvLyBpbmNvcnJlY3RseSBjbGVhcmVkIHRoZSBmbGFnLlxuXHRwcml2YXRlIF9zdXBwcmVzc0luY29taW5nQXVkaW8gPSBmYWxzZTtcblx0LyoqIFR1cm4vcmVzcG9uc2UgaWRzIHdob3NlIHBsYXliYWNrIHdhcyBjYW5jZWxsZWQgYnkgYmFyZ2UtaW4uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2ludGVycnVwdGVkQXVkaW9JZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHQvLyAtLS0gRGVmZXJyZWQgcmVzcG9uc2VzIGZvciBub24tZm9jdXNlZCBzZXNzaW9ucyAtLS1cblx0LyoqXG5cdCAqIFNlc3Npb24gcmVzb3VyY2Ugc3RyaW5nIG1vc3QgcmVjZW50bHkgKnNob3duKiB0byB0aGUgdXNlciBpbiBhbnkgY2hhdFxuXHQgKiB3aWRnZXQgLSB1cGRhdGVkIG9uIGZvY3VzIEFORCBvbiBhIHdpZGdldCdzIHZpZXctbW9kZWwgc3dhcC4gYGNoYXRXaWRnZXRTZXJ2aWNlYFxuXHQgKiBvbmx5IHJlcG9ydHMgZm9jdXMgZm9yIHRoZSBET00tZm9jdXNlZCB3aWRnZXQsIHNvIG9wZW5pbmcgYSBzZXNzaW9uIGZyb20gdGhlXG5cdCAqIHNlc3Npb25zIGxpc3QgKHdoaWNoIHJldmVhbHMgaXQgaW4gdGhlIGNoYXQgdmlldyBwYW5lIHdpdGhvdXQgbW92aW5nIERPTVxuXHQgKiBmb2N1cyBvZmYgdGhlIGxpc3QpIGxlYXZlcyBgbGFzdEZvY3VzZWRXaWRnZXRgIHBvaW50aW5nIGF0IHRoZSBwcmV2aW91c2x5XG5cdCAqIHZpZXdlZCBzZXNzaW9uLiBUaGF0IHN0YWxlIGZvY3VzIG1ha2VzIHRoZSBmaXJzdCBjbGljayBmYWlsIHRvIGZsdXNoIGFcblx0ICogYnVmZmVyZWQgcmVzcG9uc2Ugb3IgcmUtbmFycmF0ZSBhIHBlbmRpbmcgY29uZmlybWF0aW9uIChpdCBvbmx5IHdvcmtzIG9uIHRoZVxuXHQgKiBzZWNvbmQgY2xpY2ssIG9uY2UgdGhlIHdpZGdldCBmaW5hbGx5IHRha2VzIGZvY3VzKS4gVHJhY2tpbmcgdGhlIGxhc3Qtc2hvd25cblx0ICogc2Vzc2lvbiBhY3Jvc3MgYWxsIHdpZGdldHMgY2xvc2VzIHRoYXQgZ2FwLiAqL1xuXHRwcml2YXRlIF9sYXN0U2hvd25TZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIEFnZW50cy13aW5kb3cgYWN0aXZlLXNlc3Npb24gb3ZlcnJpZGUuIEJlYXRzIGZvY3VzL2xhc3Qtc2hvd24gaGV1cmlzdGljcyxcblx0ICogd2hpY2ggYXJlIHVucmVsaWFibGUgd2l0aCBtdWx0aXBsZSByZW5kZXJlZCBjaGF0IHdpZGdldHMuXG5cdCAqL1xuXHRwcml2YXRlIF9hY3RpdmVTZXNzaW9uU2hvd246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIFRydWUgb25jZSBhbiBlbWJlZGRlciBkcml2ZXMgdGhlIGFjdGl2ZSBzZXNzaW9uIHZpYSBgc2V0QWN0aXZlU2Vzc2lvblNob3duYC5cblx0ICogRm9jdXMvbGFzdC1zaG93biBoZXVyaXN0aWNzIGFyZSB0aGVuIGRpc2FibGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfZXh0ZXJuYWxBY3RpdmVTZXNzaW9uTW9kZSA9IGZhbHNlO1xuXHQvKipcblx0ICogQnVmZmVyZWQgYXVkaW8gZm9yIHJlc3BvbnNlcyB0aGF0IGFycml2ZWQgd2hpbGUgdGhlaXIgc2Vzc2lvbiB3YXMgbm90IHRoZVxuXHQgKiBvbmUgc2hvd24gdG8gdGhlIHVzZXIuIEtleWVkIGJ5IHNlc3Npb24sIGVhY2ggc2Vzc2lvbiBob2xkcyBhIEZJRk8gbGlzdCBvZlxuXHQgKiB3aG9sZSByZXNwb25zZXMgKGEgYmFja2dyb3VuZCBzZXNzaW9uIHRoYXQgcHJvZHVjZXMgc2V2ZXJhbCB1cGRhdGVzIGJlZm9yZVxuXHQgKiB0aGUgdXNlciByZXR1cm5zIGtlZXBzIEFMTCBvZiB0aGVtLCBpbiBvcmRlcikuIEV2ZXJ5IHJlc3BvbnNlIGlzIGEgZ3JvdXAgb2Zcblx0ICogYXVkaW8gY2h1bmtzIHBsdXMgYSBgZmluYWxpemVkYCBmbGFnIChzZXQgb24gaXRzIGZpbmFsIGNodW5rKSBzb1xuXHQgKiBjb250aW51YXRpb24gY2h1bmtzIGF0dGFjaCB0byB0aGUgc3RpbGwtb3BlbiByZXNwb25zZSByYXRoZXIgdGhhbiBzdGFydGluZyBhXG5cdCAqIG5ldyBvbmUuIEZsdXNoZWQgLSBhbGwgcmVzcG9uc2VzLCBpbiBvcmRlciAtIHdoZW4gdGhlIHNlc3Npb24gaXMgc2hvd24uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWZlcnJlZFJlc3BvbnNlcyA9IG5ldyBNYXA8c3RyaW5nLCBJRGVmZXJyZWRSZXNwb25zZVtdPigpO1xuXHQvKipcblx0ICogTWFwcyBhIGJhY2tlbmQgY2hhdCByZXNvdXJjZSBzdHJpbmcgKGJhcmUgcHJvdmlkZXIgc2NoZW1lLCBlLmcuXG5cdCAqIGBjb3BpbG90Y2xpOi88aWQ+YCkgdG8gdGhlIFVJIGFnZW50LWhvc3Qgc2Vzc2lvbiByZXNvdXJjZSBzdHJpbmdcblx0ICogKGBhZ2VudC1ob3N0LTxwcm92aWRlcj46LzxpZD5gKSB0aGF0IG93bnMgaXQuIFRoZSB2b2ljZSBiYWNrZW5kIHRhZ3MgYVxuXHQgKiBiYWNrZ3JvdW5kICh1bmZvY3VzZWQpIHNlc3Npb24ncyBhdWRpbyB3aXRoIGl0cyBiYXJlIGJhY2tlbmQgaWQsIHdoaWxlIHRoZVxuXHQgKiBVSSAtIGZvY3VzIHRyYWNraW5nLCBkZWZlci9mbHVzaCBidWZmZXIga2V5cywgYW5kIHRoZSBzZXNzaW9ucy1saXN0IHBlbmRpbmdcblx0ICogaW5kaWNhdG9yIC0gYWxsIHdvcmsgaW4gdGhlIGFnZW50LWhvc3QgcmVzb3VyY2Ugc3BhY2UuIENhbm9uaWNhbGl6aW5nIGFuXG5cdCAqIGluY29taW5nIGlkIHRocm91Z2ggdGhpcyBtYXAga2VlcHMgYSBkZWZlcnJlZCByZXNwb25zZSdzIGJ1ZmZlciBrZXkgYWxpZ25lZFxuXHQgKiB3aXRoIHRoZSByZXNvdXJjZSB3ZSBmbHVzaCBvbiBmb2N1cywgc28gaXQgaXMgcmVhZCBleGFjdGx5IG9uY2Ugd2hlbiB0aGVcblx0ICogc2Vzc2lvbiBiZWNvbWVzIGZvY3VzZWQgcmF0aGVyIHRoYW4gc3RyYW5kZWQgZm9yZXZlci4gUmVidWlsdCBmcm9tIHRoZSBsaXZlXG5cdCAqIHNlc3Npb24gbGlzdCBhbmQgY2xlYXJlZCBvbiBkaXNjb25uZWN0LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfdWlSZXNvdXJjZUJ5QmFja2VuZElkID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0LyoqIFNlc3Npb25zIGN1cnJlbnRseSBzaG93aW5nIGEgcGVuZGluZy1yZXNwb25zZSBpbmRpY2F0b3IgYmVjYXVzZSB0aGV5IGFyZVxuXHQgKiAgYXdhaXRpbmcgY29uZmlybWF0aW9uIHdoaWxlIHVuZm9jdXNlZCAoY2xpZW50LWRyaXZlbiwgbm8gYXVkaW8gbmVlZGVkKS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlybWF0aW9uUGVuZGluZ1Nlc3Npb25zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdC8qKiBOYXJyYXRpb24gaWRzIG9mIGNvbmZpcm1hdGlvbiBwcm9tcHRzIHdob3NlIGNvbmZpcm1hdGlvbiB3YXMgcmVzb2x2ZWRcblx0ICogIChlLmcuIHRoZSB1c2VyIHByZXNzZWQgQWxsb3cpIGJlZm9yZSB0aGUgbmFycmF0aW9uIGZpbmlzaGVkLiBBbnlcblx0ICogIGBhdWRpb19yZXNwb25zZWAgY2h1bmtzIGVjaG9pbmcgb25lIG9mIHRoZXNlIGlkcyBhcmUgZHJvcHBlZCBzbyBhXG5cdCAqICBqdXN0LWFuc3dlcmVkIGFwcHJvdmFsIGlzIG5ldmVyIHJlYWQgYWxvdWQuIEJvdW5kZWQsIGFuZCBhbiBpZCBpc1xuXHQgKiAgcmVtb3ZlZCBvbmNlIGl0cyBmaW5hbCBjaHVuayBhcnJpdmVzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYW5jZWxsZWRQZW5kaW5nTmFycmF0aW9uSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdC8qKiBTZXNzaW9ucyBzaG93aW5nIGEgcGVuZGluZy1yZXNwb25zZSBpbmRpY2F0b3IgYmVjYXVzZSBhIHJlcGx5IENPTVBMRVRFRFxuXHQgKiAgd2hpbGUgdGhleSB3ZXJlIHVuZm9jdXNlZCAoY2xpZW50LWRyaXZlbiwgbWlycm9ycyB0aGUgY29uZmlybWF0aW9uXG5cdCAqICBpbmRpY2F0b3IpLiBNYXBzIHRvIHRoZSByZXNwb25zZSBzdW1tYXJ5IHRvIG5hcnJhdGUgd2hlbiB0aGUgc2Vzc2lvbiBpc1xuXHQgKiAgZm9jdXNlZCAtIHN0b3JlZCBzbyBwbGF5YmFjayBpcyByZWxpYWJsZSBldmVuIGlmIHRoZSBtb2RlbCBoYXMgc2luY2Vcblx0ICogIHVubG9hZGVkLiBJbmRlcGVuZGVudCBvZiB0aGUgYXVkaW8tZGVmZXIgYnVmZmVyICh7QGxpbmsgX2RlZmVycmVkUmVzcG9uc2VzfSksXG5cdCAqICB3aGljaCBvbmx5IGV4aXN0cyB3aGVuIHRoZSBiYWNrZW5kIHByb2FjdGl2ZWx5IHNlbnQgYXVkaW8uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdSZXNwb25zZVN1bW1hcmllcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdC8qKlxuXHQgKiBLZXlzIChzZXNzaW9uIHJlc291cmNlIHN0cmluZywgb3IgYGAnJ2BgIGZvciB1bnRhZ2dlZCBhdWRpbykgb2YgcmVzcG9uc2VzXG5cdCAqIHdlIGFyZSBjdXJyZW50bHkgcGxheWluZyBsaXZlIHJhdGhlciB0aGFuIGRlZmVycmluZy4gUmVjb3JkZWQgb24gdGhlIGZpcnN0XG5cdCAqIGNodW5rIHNvIHRoZSByZW1haW5pbmcgY2h1bmtzIG9mIHRoYXQgcmVzcG9uc2UgZm9sbG93IHRoZSBzYW1lIGRlY2lzaW9uIGFuZFxuXHQgKiBhIHJlc3BvbnNlIGlzIG5ldmVyIHNwbGl0IGJldHdlZW4gcGxheWJhY2sgYW5kIHRoZSBkZWZlcnJlZCBidWZmZXIuXG5cdCAqXG5cdCAqIEEgU0VUIHJhdGhlciB0aGFuIGEgc2luZ2xlIGtleSBzbyBvdmVybGFwcGluZyByZXNwb25zZXMgZm9yIERJRkZFUkVOVFxuXHQgKiBzZXNzaW9ucyBlYWNoIGtlZXAgdGhlaXIgb3duIHJvdXRpbmc6IGEgbGl2ZSByZXBseSBmb3Igc2Vzc2lvbiBCIG11c3Qgbm90XG5cdCAqIGNsZWFyIHRoZSBsaXZlIHJvdXRlIG9mIGFuIGluLWZsaWdodCByZXBseSBmb3Igc2Vzc2lvbiBBICh3aGljaCB3b3VsZCBzZW5kXG5cdCAqIEEncyBjb250aW51YXRpb24gY2h1bmtzIGRvd24gdGhlIGZvY3VzLWJhc2VkIGZhbGxiYWNrKS4gVHdvIGNvbmN1cnJlbnRcblx0ICogcmVzcG9uc2VzIGZvciB0aGUgU0FNRSBzZXNzaW9uIHN0aWxsIGNhbid0IGJlIHRvbGQgYXBhcnQgd2l0aG91dCBhIGJhY2tlbmRcblx0ICogcmVzcG9uc2UvdHVybiBpZDsgdGhhdCByZW1haW5zIGEga25vd24gbGltaXRhdGlvbi5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpdmVSZXBseUtleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHQvKipcblx0ICogUGVyLXJlc3BvbnNlIHJvdXRpbmcgZGVjaXNpb24sIGtleWVkIGJ5IHRoZSBiYWNrZW5kLWVjaG9lZCBgcmVzcG9uc2VJZGBcblx0ICogKHNlZSB7QGxpbmsgSVZvaWNlQXVkaW9SZXNwb25zZS5yZXNwb25zZUlkfSkuIEEgcmVzcG9uc2UncyBmYXRlIChgbGl2ZWAgdnNcblx0ICogYGRlZmVycmVkYCkgaXMgZGVjaWRlZCBPTkNFLCB3aGVuIGl0cyBmaXJzdCBjaHVuayBpcyBzZWVuLCBhbmQgZXZlcnkgbGF0ZXJcblx0ICogY2h1bmsgb2YgdGhhdCBzYW1lIHJlc3BvbnNlIGZvbGxvd3MgaXQgLSBzbyBpbnRlcmxlYXZlZCByZXNwb25zZXMgZm9yXG5cdCAqIGRpZmZlcmVudCBzZXNzaW9ucyBuZXZlciBzdGVhbCBlYWNoIG90aGVyJ3Mgcm91dGluZyAod2hpY2ggYSBzaW5nbGUgZ2xvYmFsXG5cdCAqIGtleSBkaWQpIGFuZCBhIHJlc3BvbnNlIGlzIG5ldmVyIHNwbGl0IGJldHdlZW4gcGxheWJhY2sgYW5kIHRoZSBidWZmZXIuIEFcblx0ICogZGVmZXJyZWQgZW50cnkgaXMgZmxpcHBlZCB0byBgbGl2ZWAgd2hlbiBpdHMgc2Vzc2lvbiBpcyBmb2N1c2VkICh0aGUgYnVmZmVyXG5cdCAqIGlzIGZsdXNoZWQpLCBzbyBwb3N0LWZsdXNoIGNvbnRpbnVhdGlvbiBjaHVua3Mga2VlcCBwbGF5aW5nLiBFbnRyaWVzIGFyZVxuXHQgKiByZW1vdmVkIG9uIHRoZSBmaW5hbCBjaHVuay4gVXNlZCBvbmx5IHdoZW4gdGhlIGJhY2tlbmQgZWNob2VzIGEgcmVzcG9uc2VJZDtcblx0ICogb3RoZXJ3aXNlIHRoZSBsZWdhY3kgc2Vzc2lvbi1rZXllZCB7QGxpbmsgX2xpdmVSZXBseUtleXN9IHBhdGggYXBwbGllcy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc3BvbnNlUm91dGVzID0gbmV3IE1hcDxzdHJpbmcsICdsaXZlJyB8ICdkZWZlcnJlZCc+KCk7XG5cblx0LyoqXG5cdCAqIFBlci1zZXNzaW9uIHJlY29yZCBvZiB0aGUgcmVwbHkgd2UgbW9zdCByZWNlbnRseSByZWFkIGZvciBhIHNlc3Npb24gKHBsYXllZFxuXHQgKiBsaXZlIG9yIGZsdXNoZWQgZnJvbSB0aGUgZGVmZXJyZWQgYnVmZmVyKTogaXRzIHRyYW5zY3JpcHQgYW5kIHdoZW4gaXQgd2FzXG5cdCAqIHJlYWQuIFRoZSBiYWNrZW5kIHJlLWVtaXRzIGEgc2Vzc2lvbidzIHJlcGx5IHdoZW4gdGhhdCBzZXNzaW9uIGJlY29tZXNcblx0ICogYWN0aXZlIChvbiBmb2N1cyksIHdoaWNoIHdvdWxkIGRvdWJsZS1yZWFkIGl0LiBXZSBkcm9wIGEgc3Vic2VxdWVudCByZXBseVxuXHQgKiBmb3IgdGhlIHNhbWUgc2Vzc2lvbiBPTkxZIHdoZW4gaXRzIHRyYW5zY3JpcHQgbWF0Y2hlcyB0aGlzIG9uZSB3aXRoaW5cblx0ICogYFJFTkFSUkFUSU9OX0RFRFVQRV9XSU5ET1dfTVNgIC0gc28gYSBnZW51aW5lbHkgbmV3IHJlcGx5IChkaWZmZXJlbnQgdGV4dClcblx0ICogYWx3YXlzIHBsYXlzLCBhbmQgc28gZG9lcyBhIGxhdGVyIGlkZW50aWNhbCByZXBseSBvbmNlIHRoZSB3aW5kb3cgbGFwc2VzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWNlbnRseVJlYWRSZXNwb25zZSA9IG5ldyBNYXA8c3RyaW5nLCB7IHRyYW5zY3JpcHQ6IHN0cmluZzsgYXQ6IG51bWJlciB9PigpO1xuXHQvKiogSW4tZmxpZ2h0IGJhY2tlbmQgcmUtbmFycmF0aW9ucyB3ZSBhcmUgZHJvcHBpbmcsIHNvIGNvbnRpbnVhdGlvbiBjaHVua3MgYXJlXG5cdCAqICBkcm9wcGVkIHRvbyAobm90IGp1c3QgdGhlIGZpcnN0KS4gS2V5ZWQgYnkgcmVzcG9uc2VJZCB3aGVuIHRoZSBiYWNrZW5kXG5cdCAqICBlY2hvZXMgb25lIChzbyBhIGRpZmZlcmVudCBzYW1lLXNlc3Npb24gcmVzcG9uc2Ugc3RyZWFtaW5nIGNvbmN1cnJlbnRseSBpc1xuXHQgKiAgTk9UIGRyb3BwZWQpLCBlbHNlIGJ5IHNlc3Npb25JZCBhcyBhIGZhbGxiYWNrLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kcm9wcGluZ1JlbmFycmF0aW9uID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdC8qKiBOYXJyYXRpb24gaWRzIHRoaXMgY2xpZW50IGV4cGxpY2l0bHkgcmVxdWVzdGVkIHZpYSB7QGxpbmsgX25hcnJhdGV9ICh0aGVcblx0ICogIGBuYXJyYXRpb25faWRgIHdlIHNlbnQgb24gYHJlcXVlc3RfbmFycmF0aW9uYCwgd2hpY2ggdGhlIGJhY2tlbmQgZWNob2VzIGFzXG5cdCAqICBgcmVzcG9uc2VJZGAgb24gdGhlIGF1ZGlvIGl0IHByb2R1Y2VzKS4gQXVkaW8gd2hvc2UgYHJlc3BvbnNlSWRgIGlzIG9uZSBvZlxuXHQgKiAgdGhlc2Ugd2FzIHNvbGljaXRlZCBieSB1cyBhbmQgbXVzdCBuZXZlciBiZSBjbGFzc2lmaWVkIGFzIGFuIHVuc29saWNpdGVkXG5cdCAqICBkdXBsaWNhdGUgcmUtbmFycmF0aW9uLCBldmVuIHdoZW4gaXRzIHRyYW5zY3JpcHQgbWF0Y2hlcyBjb250ZW50IHdlIHJlY2VudGx5XG5cdCAqICByZWFkIChlLmcuIG5hcnJhdGluZyBhIGNvbXBsZXRlZCByZXBseSBvbiBmb2N1cykuIElkcyBhcmUgcHJ1bmVkIHdoZW4gdGhlaXJcblx0ICogIHN0cmVhbSBlbmRzIChmaW5hbCBjaHVuaykgYW5kIGNsZWFyZWQgb24gZGlzY29ubmVjdC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc29saWNpdGVkTmFycmF0aW9uSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFTkFSUkFUSU9OX0RFRFVQRV9XSU5ET1dfTVMgPSA2MDAwO1xuXG5cdC8qKlxuXHQgKiBMYXN0IHJlcGx5IHRyYW5zY3JpcHQgaGVhcmQgcGVyIHNlc3Npb24gKHBlcnNpc3RlbnQsIHVubGlrZSB0aGUgd2luZG93ZWRcblx0ICogYF9yZWNlbnRseVJlYWRSZXNwb25zZWApLiBPbiBhY3RpdmF0aW9uIGl0IGFybXMgYF9yZWNlbnRseVJlYWRSZXNwb25zZWAgc28gYVxuXHQgKiBiYWNrZW5kIHJlLXJlYWQgb2YgYSByZXBseSB3ZSBoZWFyZCBlYXJsaWVyIGlzIGRyb3BwZWQgYXMgYSByZS1uYXJyYXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXN0SGVhcmRUcmFuc2NyaXB0QnlJZCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0Ly8gLS0tIFNlc3Npb24gYXVkaW8gY2FjaGUgZm9yIHJlcGxheSAtLS1cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkF1ZGlvQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgRmxvYXQzMkFycmF5PigpO1xuXHRwcml2YXRlIF9yZXBsYXlTb3VyY2VOb2RlOiBBdWRpb0J1ZmZlclNvdXJjZU5vZGUgfCB1bmRlZmluZWQ7XG5cblx0Ly8gLS0tIFNlc3Npb24gc3RhdGUgdHJhY2tpbmcgZm9yIGV4cGxpY2l0IGNoYW5nZSBub3RpZmljYXRpb25zIC0tLVxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmV2U2Vzc2lvblN0YXRlcyA9IG5ldyBNYXA8c3RyaW5nLCB7IHN0YXRlOiBzdHJpbmc7IGRldGFpbDogc3RyaW5nOyBwZW5kaW5nSWQ6IHN0cmluZzsgY29uZmlybWF0aW9uVHlwZT86IFZvaWNlQ29uZmlybWF0aW9uVHlwZTsgbGFzdFJlc3BvbnNlU3VtbWFyeTogc3RyaW5nIH0+KCk7XG5cblx0Ly8gU2Vzc2lvbnMgdGhlIHVzZXIgZXhwbGljaXRseSBjYW5jZWxsZWQgZnJvbSBWUyBDb2RlIFVJLiBXZSBzd2FsbG93IHRoZVxuXHQvLyBORVhUIHN0YXRlIGNoYW5nZSBmb3IgZWFjaCAodHlwaWNhbGx5IHRoZSBjaGF0IG1vZGVsIGdvaW5nIGBpZGxlYCkgc28gdGhlXG5cdC8vIGJhY2tlbmQgZG9lc24ndCBuYXJyYXRlIFwidGhlIHNlc3Npb24gYmVjYW1lIGlkbGVcIiByaWdodCBhZnRlciB0aGUgdXNlclxuXHQvLyBhbHJlYWR5IGhpdCBTdG9wLiBTdG9yZWQgd2l0aCBhIHNhZmV0eSBleHBpcnkgaW4gY2FzZSB0aGUgY2FuY2VsbGF0aW9uXG5cdC8vIG5ldmVyIHByb2R1Y2VzIGEgc3RhdGUgY2hhbmdlLlxuXHRwcml2YXRlIHJlYWRvbmx5IF91c2VyQ2FuY2VsbGVkU2Vzc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4+KCk7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9VU0VSX0NBTkNFTF9TVVBQUkVTU19NUyA9IDEwXzAwMDtcblx0LyoqIEFmdGVyIGEgZm9jdXMtY2hhbmdlIGRpc2NhcmQsIGRyb3AgYSBzdHJheSBiYWNrZW5kIGBzZW5kX3RvX2NoYXRgIGZvclxuXHQgKiAgdGhpcyBsb25nIHNvIGxhdGUtZmluYWxpemVkIGJ1ZmZlcmVkIHNwZWVjaCBpc24ndCBtaXNyb3V0ZWQuICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9ESVNDQVJEX1NFTkRfU1VQUFJFU1NfTVMgPSAyXzAwMDtcblx0LyoqIEhvdyBsb25nIGEgZm9jdXMtY2hhbmdlIHN1Ym1pdCBzdGF5cyBwaW5uZWQgdG8gdGhlIG9yaWdpbmFsIHNlc3Npb25cblx0ICogIHdoaWxlIHRoZSBiYWNrZW5kIGZpbmFsaXplcyB0aGUgdHVybiBhbmQgZW1pdHMgYHNlbmRfdG9fY2hhdGAsIGJlZm9yZSB0aGVcblx0ICogIHBpbiBpcyBjbGVhcmVkIHNvIGl0IGNhbid0IG1pc3JvdXRlIGEgbXVjaCBsYXRlciwgdW5yZWxhdGVkIHR1cm4uICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9QSU5ORURfU1VCTUlUX0VYUElSWV9NUyA9IDE1XzAwMDtcblxuXHQvLyBQZXItc2Vzc2lvbiB3YXRjaGRvZyB0aW1lcnMgdGhhdCByZS1mbHVzaCBzZXNzaW9uX2NvbnRleHQgc2hvcnRseSBhZnRlclxuXHQvLyBhIGNvbmZpcm1hdGlvbiB0cmFuc2l0aW9uLiBUaGlzIGlzIGEgcGFyYW5vaWQgbWl0aWdhdGlvbjogaWYgdGhlXG5cdC8vIHRyYW5zaXRpb24ncyBpbW1lZGlhdGUgZmx1c2ggaXMgZHJvcHBlZCAodGltZXIgcmFjZSwgZGVib3VuY2UgdGltaW5nLFxuXHQvLyBvciBXUyBidWZmZXIgaGljY3VwKSwgYSBzZWNvbmQgZmx1c2ggfjEuNXMgbGF0ZXIgZ3VhcmFudGVlcyB0aGUgQkVcblx0Ly8gb2JzZXJ2ZXMgdGhlIGBgd2FpdGluZ19mb3JfY29uZmlybWF0aW9uYGAgc3RhdGUuIFN1YnNlcXVlbnQgcmUtc2VuZHNcblx0Ly8gYXJlIG5vLW9wcyBvbiB0aGUgQkUgYmVjYXVzZSB0aGUgbWVyZ2UtcGF0Y2ggZGV0ZWN0cyBubyBmaWVsZCBjaGFuZ2VzLlxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25maXJtYXRpb25GbHVzaFdhdGNoZG9ncyA9IG5ldyBNYXA8c3RyaW5nLCBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0Pj4oKTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX0NPTkZJUk1BVElPTl9GTFVTSF9ERUxBWV9NUyA9IDE1MDA7XG5cblx0LyoqXG5cdCAqIExhdGVzdCBzdGF0ZSBjaGFuZ2UgcGVyIHNlc3Npb24sIGJ1ZmZlcmVkIGFuZCBmbHVzaGVkIG9uY2UgYWZ0ZXIgYSBzaG9ydFxuXHQgKiBzZXR0bGUgd2luZG93IChzZWUge0BsaW5rIF9lbWl0UGVuZGluZ1N0YXRlQ2hhbmdlc30pIHNvIGEgcmFwaWRcblx0ICogYGB0aGlua2luZyA8LT4gaWRsZWBgIHJlcGxheSBzdG9ybSBjb2FsZXNjZXMgaW50byBhIHNpbmdsZSBuZXQgZW1pc3Npb25cblx0ICogaW5zdGVhZCBvZiBzcGFtbWluZyB0aGUgYmFja2VuZCB3aXRoIGNvbnRyYWRpY3RvcnkgdHJhbnNpdGlvbnMuIEVhY2ggZW50cnlcblx0ICogYWxzbyByZWNvcmRzIHRoZSBidXJzdCdzIGJhc2VsaW5lIChgYGZyb21TdGF0ZWBgL2BgZnJvbURldGFpbGBgKSBzbyBhIHdvYmJsZVxuXHQgKiB0aGF0IHJldHVybnMgdG8gaXRzIHN0YXJ0aW5nIHN0YXRlIGlzIHJlY29nbml6ZWQgYXMgbmV0LXplcm8uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nU3RhdGVDaGFuZ2VzID0gbmV3IE1hcDxzdHJpbmcsIHsgc2Vzc2lvbklkOiBzdHJpbmc7IGN1cnJlbnRTdGF0ZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyBkZXRhaWw/OiBzdHJpbmc7IGNvbmZpcm1hdGlvblR5cGU/OiBWb2ljZUNvbmZpcm1hdGlvblR5cGU7IGxhc3RSZXNwb25zZVN1bW1hcnk/OiBzdHJpbmc7IGZyb21TdGF0ZTogc3RyaW5nOyBmcm9tRGV0YWlsOiBzdHJpbmc7IGZyb21Db25maXJtYXRpb25UeXBlPzogVm9pY2VDb25maXJtYXRpb25UeXBlOyBmcm9tUmVzcG9uc2VTdW1tYXJ5OiBzdHJpbmc7IHBlbmRpbmdJZDogc3RyaW5nOyBmcm9tUGVuZGluZ0lkOiBzdHJpbmcgfT4oKTtcblx0cHJpdmF0ZSBfc3RhdGVDaGFuZ2VFbWl0VGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfU1RBVEVfQ0hBTkdFX1NFVFRMRV9NUyA9IDEyMDtcblxuXHQvKiogTW9kZWwgcmVmcyBlYWdlcmx5IGxvYWRlZCBmb3Igc2Vzc2lvbnMgYXdhaXRpbmcgaW5wdXQgKG5vIFVJIGZvY3VzIG5lZWRlZCkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VhZ2VyTW9kZWxSZWZzID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0TW9kZWxSZWZlcmVuY2U+KCk7XG5cblx0LyoqIFNlc3Npb25zIHdpdGggYW4gaW4tZmxpZ2h0IGVhZ2VyIG1vZGVsIGxvYWQsIHRvIGRlZHVwZSBjb25jdXJyZW50IGxvYWRzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lYWdlck1vZGVsTG9hZGluZyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdC8qKlxuXHQgKiBTZXNzaW9ucyB3aG9zZSBgYGlkbGVgYCB0cmFuc2l0aW9uIGlzIGJlaW5nIGRlZmVycmVkIHVudGlsIHRoZWlyIGNoYXRcblx0ICogbW9kZWwgbG9hZHMsIHNvIHRoZSBuYXJyYXRpb24gY2FuIGluY2x1ZGUgYGBsYXN0X3Jlc3BvbnNlX3N1bW1hcnlgYC5cblx0ICogV2hpbGUgYSBzZXNzaW9uIGlkIGlzIGluIHRoaXMgc2V0IHdlIHN1cHByZXNzIGVtaXR0aW5nIGEgcHJlbWF0dXJlLFxuXHQgKiBzdW1tYXJ5LWxlc3MgYGBpZGxlYGAgdG8gdGhlIGJhY2tlbmQgKHNlZSBfYnVpbGRTZXNzaW9uQ29udGV4dCkuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nSWRsZU5hcnJhdGlvbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdC8qKlxuXHQgKiBTZXNzaW9ucyB0aGF0IGVudGVyZWQgYHRoaW5raW5nYCBkdXJpbmcgdGhpcyBjb250cm9sbGVyJ3MgbGlmZXRpbWUgYW5kIGFyZVxuXHQgKiB0aGVyZWZvcmUgZ2VudWluZWx5IGF3YWl0aW5nIGEgY29tcGxldGlvbi4gQSBzdW1tYXJ5LW9ubHkgdHJhbnNpdGlvbiAoaWRsZVxuXHQgKiBzdGF0ZSB1bmNoYW5nZWQsIGJ1dCBgbGFzdF9yZXNwb25zZV9zdW1tYXJ5YCBhcHBlYXJlZC9jaGFuZ2VkKSBvbmx5IGNvdW50c1xuXHQgKiBhcyBhIE5FVyByZXBseSB3aGVuIHRoZSBzZXNzaW9uIGlzIGluIHRoaXMgc2V0IC0gb3RoZXJ3aXNlIGFuIE9MRCBzdW1tYXJ5XG5cdCAqIHN1cmZhY2luZyBiZWNhdXNlIGEgZG9ybWFudCBtb2RlbCB3YXMgKHJlKWh5ZHJhdGVkIHdvdWxkIGJlIG1pc3Rha2VuIGZvciBhXG5cdCAqIGZyZXNoIHJlc3BvbnNlIGFuZCB3cm9uZ2x5IGxpZ2h0IHRoZSBzZXNzaW9ucy1saXN0IHBlbmRpbmcgaW5kaWNhdG9yLlxuXHQgKiBBcm1lZCBvbiBhbiBvYnNlcnZlZCBpZGxlL3dhaXRpbmdcdTIxOTJ0aGlua2luZyB0cmFuc2l0aW9uIChuZXZlciBkdXJpbmcgZWFnZXJcblx0ICogbG9hZGluZyAvIHJlcGxheSkgYW5kIGNvbnN1bWVkIG9uY2UgdGhlIHJlc3VsdGluZyBpZGxlK3N1bW1hcnkgaXMgYWNjZXB0ZWQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc0F3YWl0aW5nUmVzcG9uc2VTdW1tYXJ5ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0LyoqXG5cdCAqIExhc3QgcmVzcG9uc2Ugc3VtbWFyeSBjYXB0dXJlZCBwZXIgc2Vzc2lvbiBXSElMRSBpdHMgY2hhdCBtb2RlbCB3YXNcblx0ICogcmVzaWRlbnQuIENvcGlsb3QvcmVtb3RlIHNlc3Npb24gbW9kZWxzIGFyZSBkaXNwb3NlZCBhcyBzb29uIGFzIHRoZSB1c2VyXG5cdCAqIHN3aXRjaGVzIGF3YXksIHNvIGEgY29tcGxldGlvbiB0aGF0IGxhbmRzIHdoaWxlIHRoZSBzZXNzaW9uIGlzIHVuZm9jdXNlZFxuXHQgKiB3b3VsZCBvdGhlcndpc2UgYmUgcmVwb3J0ZWQgdG8gdGhlIGJhY2tlbmQgYXMgYSBzdW1tYXJ5LWxlc3MgYGBpZGxlYGAgYW5kXG5cdCAqIG5ldmVyIG5hcnJhdGVkICh0aGUgZWFnZXIgcmVsb2FkIHRvIHJlY292ZXIgdGhlIHN1bW1hcnkgcmFjZXMgdGhlIHN3aXRjaCdzXG5cdCAqIHJlLWRpc3Bvc2FsKS4gQ2FjaGluZyB0aGUgc3VtbWFyeSBoZXJlIFx1MjAxNCBpbmRlcGVuZGVudCBvZiB0aGUgbW9kZWwnc1xuXHQgKiBsaWZldGltZSBcdTIwMTQgbGV0cyB0aGUgbm8tbW9kZWwgcGF0aHMgc3RpbGwgcmVwb3J0IGBgbGFzdF9yZXNwb25zZV9zdW1tYXJ5YGAuXG5cdCAqIFJlZnJlc2hlZCB3aGVuZXZlciBhIHJlc2lkZW50IG1vZGVsIGV4cG9zZXMgYSBzdW1tYXJ5OyBjbGVhcmVkIHdoZW4gdGhlXG5cdCAqIHNlc3Npb24gc3RhcnRzIGEgbmV3IHR1cm4gKGBgdGhpbmtpbmdgYCkgc28gYSBzdGFsZSByZXBseSBpcyBuZXZlciBuYXJyYXRlZC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhc3RSZXNwb25zZVN1bW1hcnlCeUlkID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuXHQvKipcblx0ICogVGhlIGV4YWN0IHRleHQgbGFzdCBuYXJyYXRlZCBwZXIgc2Vzc2lvbiwgdXNlZCB0byBkZS1kdXBsaWNhdGUgbmFycmF0aW9uXG5cdCAqIHJlcXVlc3RzLiBCZWZvcmUgYXNraW5nIHRoZSBiYWNrZW5kIHRvIHNwZWFrIGEgc2Vzc2lvbidzIHBlbmRpbmcgaXRlbSB3ZVxuXHQgKiBjaGVjayB0aGlzIG1hcDogYW4gaWRlbnRpY2FsIHRleHQgd2FzIGFscmVhZHkgc3Bva2VuIChsaXZlIG9yIG9uIGEgcHJpb3Jcblx0ICogZm9jdXMpLCBzbyB3ZSBza2lwIGl0IFx1MjAxNCB0aGlzIHNpbmdsZSBndWFyZCByZXBsYWNlcyB0aGUgb2xkIHN1bW1hcnktaWRlbnRpdHlcblx0ICogZGVkdXAsIHRoZSByZWNlbnRseS1yZWFkIHdpbmRvdywgYW5kIHRoZSBmb2N1cy9saXZlIGRvdWJsZS1uYXJyYXRlIHJhY2VzLlxuXHQgKiBDbGVhcmVkIGZvciBhIHNlc3Npb24gd2hlbiBpdCBzdGFydHMgYSBuZXcgdHVybiAoYHRoaW5raW5nYCkgc28gYSByZXBlYXRlZFxuXHQgKiBpZGVudGljYWwgcmVwbHkgbGF0ZXIgc3RpbGwgbmFycmF0ZXMuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXN0TmFycmF0ZWRUZXh0ID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuXHQvKipcblx0ICogTmFycmF0aW9ucyB0aGF0IGNvdWxkIG5vdCBiZSBzZW50IGJlY2F1c2UgdGhlIHNvY2tldCB3YXMgY2xvc2VkIChzZWVcblx0ICoge0BsaW5rIF9uYXJyYXRlfSkuIFJlcGxheWVkIG9uY2Ugb24gdGhlIG5leHQgYHNlc3Npb25faW5pdGAgc28gYSByZXBseSBvclxuXHQgKiBjb25maXJtYXRpb24gdGhhdCBsYW5kZWQgZHVyaW5nIGEgZGlzY29ubmVjdCBpcyBzdGlsbCBzcG9rZW4gb24gcmVjb25uZWN0LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ05hcnJhdGlvblJldHJpZXMgPSBuZXcgTWFwPHN0cmluZywgSVZvaWNlTmFycmF0YWJsZT4oKTtcblxuXHQvKipcblx0ICogTmFycmF0aW9ucyB3ZSByZXF1ZXN0ZWQgKGdvdCBhIGBuYXJyYXRpb25faWRgIGJhY2spIGJ1dCB3aG9zZSBhdWRpbyBoYXMgbm90XG5cdCAqIHlldCBmaW5pc2hlZCBhcnJpdmluZy4gS2V5ZWQgYnkgdGhhdCBuYXJyYXRpb24gaWQuIEEgcmVxdWVzdCBiZWluZyBhY2NlcHRlZFxuXHQgKiBieSB0aGUgYmFja2VuZCBpcyBOT1QgcHJvb2YgdGhlIHJlcGx5IHdhcyBoZWFyZCAtIHRoZSBhdWRpbyBjYW4gc3RpbGwgYmVcblx0ICogZHJvcHBlZCwgZGVmZXJyZWQsIG9yIG5ldmVyIHJldHVybmVkIC0gc28gd2UgZGVmZXIgbWFya2luZyB0aGUgcmVwbHkgYXNcblx0ICogbmFycmF0ZWQgKHtAbGluayBfbGFzdE5hcnJhdGVkVGV4dH0pIGFuZCBjbGVhcmluZyBpdHMgcGVuZGluZyBpbmRpY2F0b3Jcblx0ICogdW50aWwgdGhlIGZpbmFsIGF1ZGlvIGNodW5rIGZvciB0aGlzIGlkIGFycml2ZXMgKHNlZSB7QGxpbmsgX21hcmtOYXJyYXRpb25IZWFyZH0pLlxuXHQgKiBBIHNhZmV0eSB0aW1lciByZWxlYXNlcyB0aGUgaW4tZmxpZ2h0IGd1YXJkIGlmIG5vIGF1ZGlvIGV2ZXIgY29tZXMsIHNvIGFcblx0ICogbGF0ZXIgZm9jdXMvc3RhdGUgZXZlbnQgY2FuIHJldHJ5IHJhdGhlciB0aGFuIHRoZSByZXBseSBiZWluZyBsb3N0LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1NvbGljaXRlZE5hcnJhdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSVBlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb24+KCk7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9TT0xJQ0lURURfTkFSUkFUSU9OX0FVRElPX1NUQVJUX1RJTUVPVVRfTVMgPSAzMF8wMDA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9WT0lDRV9QUk9HUkVTU19JTklUSUFMX0RFTEFZX01TID0gNV8wMDA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9WT0lDRV9QUk9HUkVTU19JTlRFUlZBTF9NUyA9IDEwXzAwMDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX01BWF9WT0lDRV9QUk9HUkVTU19QRVJfUkVRVUVTVCA9IDU7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9NQVhfQ09ORklSTUFUSU9OX05BUlJBVElPTl9DSEFSUyA9IDJfNDAwO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfTUFYX1FVRVNUSU9OTkFJUkVfUVVFU1RJT05TID0gNjtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX01BWF9RVUVTVElPTk5BSVJFX09QVElPTlMgPSA1O1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfTUFYX0NPTkZJUk1BVElPTl9GSUVMRF9DSEFSUyA9IDI4MDtcblx0cHJpdmF0ZSByZWFkb25seSBfdm9pY2VQcm9ncmVzc0xpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgRGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdm9pY2VQcm9ncmVzc1Nlc3Npb25CeVJlc3BvbnNlID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbGFzdFNwb2tlbkF0QnlTZXNzaW9uID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuXHQvKipcblx0ICogTmFycmF0aW9ucyB0aGUgYmFja2VuZCBib3VuY2VkIChgbmFycmF0aW9uX2Fja2AgYGJ1c3lgKSBvciBjYW5jZWxsZWRcblx0ICogKGBuYXJyYXRpb25faW50ZXJydXB0ZWRgKSwgYXdhaXRpbmcgcmV0cnkuIEtleWVkIGJ5IGNhbm9uaWNhbCBzZXNzaW9uIGtleSxcblx0ICogbGF0ZXN0LXdpbnMgKGF0IG1vc3Qgb25lIHBlbmRpbmcgcGVyIHNlc3Npb24pLiBSZXRyaWVkIG9uIHRoZVxuXHQgKiBgbmFycmF0aW9uX3VuYmxvY2tlZGAgbnVkZ2UgYW5kIHJlcGxheWVkIG9uIGBzZXNzaW9uX2luaXRgL2BzZXNzaW9uX3Jlc3VtZWRgLFxuXHQgKiBzaW5jZSBhIGRyb3BwZWQgc29ja2V0IGxvc2VzIGFueSBpbi1mbGlnaHQgbnVkZ2UuIFNlZVxuXHQgKiBgX3JldHJ5RGVmZXJyZWROYXJyYXRpb25gLiBDbGVhcmVkIG9uIGEgbmV3IHR1cm4gKGB0aGlua2luZ2ApIG9yIHRlYXJkb3duLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZGVmZXJyZWROYXJyYXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIElWb2ljZU5hcnJhdGFibGUgJiB7IG5hcnJhdGlvbklkOiBzdHJpbmc7IHJldXNlTmFycmF0aW9uSWQ6IGJvb2xlYW4gfT4oKTtcblxuXHQvKipcblx0ICogVGhlIGNvbmZpcm1hdGlvbiBkZXRhaWwgdGV4dCBsYXN0IGFjdHVhbGx5IEhFQVJEIChmaW5hbCBhdWRpbyBhcnJpdmVkKSBwZXJcblx0ICogY2Fub25pY2FsIHNlc3Npb24ga2V5LiBDb25maXJtYXRpb25zIGFyZSBkZWxpYmVyYXRlbHkgZXhjbHVkZWQgZnJvbVxuXHQgKiB7QGxpbmsgX2xhc3ROYXJyYXRlZFRleHR9IChhIHRvb2wgY2FuIGxlZ2l0aW1hdGVseSByZS1yYWlzZSB0aGUgaWRlbnRpY2FsXG5cdCAqIHByb21wdCksIHNvIHRoaXMgaXMgdGhlIHBlci1vY2N1cnJlbmNlIFwiYWxyZWFkeSBzcG9rZW5cIiBtYXJrZXIgdGhhdCBzdG9wcyBhXG5cdCAqIHN0aWxsLXBlbmRpbmcgY29uZmlybWF0aW9uIGZyb20gYmVpbmcgcmUtbmFycmF0ZWQgb24gZXZlcnkgcmVmb2N1cyAoc2VlXG5cdCAqIHtAbGluayBfYWN0aXZhdGVTaG93blNlc3Npb259KS4gUmVjb3JkZWQgb25seSBvbmNlIGl0cyBhdWRpbyBmaW5hbGl6ZXMgKGluXG5cdCAqIHtAbGluayBfbWFya05hcnJhdGlvbkhlYXJkfSksIHNvIGEgY29uZmlybWF0aW9uIHRoYXQgd2FzIGRlZmVycmVkL2Ryb3BwZWQgYW5kXG5cdCAqIG5ldmVyIGhlYXJkIGlzIHN0aWxsIHJldHJpZWQgb24gZm9jdXMuIENsZWFyZWQgd2hlbiB0aGUgc2Vzc2lvbiBsZWF2ZXNcblx0ICogYHdhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbmAgKGluIHRoZSBhdXRvcnVuKSBzbyBhIGdlbnVpbmVseSBuZXcgY29uZmlybWF0aW9uIC1cblx0ICogZXZlbiB3aXRoIGlkZW50aWNhbCB0ZXh0IC0gbmFycmF0ZXMgYWdhaW4uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9uYXJyYXRlZFBlbmRpbmcgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdC8vIC0tLSBUZWxlbWV0cnkgdHJhY2tpbmcgLS0tXG5cdHByaXZhdGUgX3RlbGVtZXRyeVNlc3Npb25JbmRleCA9IDA7XG5cdHByaXZhdGUgX3RlbGVtZXRyeVNlc3Npb25TdGFydDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90ZWxlbWV0cnlUdXJuQ291bnQgPSAwO1xuXHRwcml2YXRlIF90ZWxlbWV0cnlSZWNvbm5lY3RDb3VudCA9IDA7XG5cdHByaXZhdGUgX3RlbGVtZXRyeUZpcnN0Q29ubmVjdCA9IHRydWU7XG5cdHByaXZhdGUgX3RlbGVtZXRyeUNvbm5lY3RTdGFydE1zOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3RlbGVtZXRyeUxhc3RDb25uZWN0TXM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdGVsZW1ldHJ5UHR0RG93bk1zOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3RlbGVtZXRyeVB0dFVwTXM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdGVsZW1ldHJ5Rmlyc3RUcmFuc2NyaXB0aW9uTXM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdGVsZW1ldHJ5VHRzSW50ZXJydXB0ZWQgPSBmYWxzZTtcblxuXHQvLyAtLS0gVHJhbnNjcmlwdCBwZXJzaXN0ZW5jZSAobG9jYWwtb25seSkgLS0tXG5cdC8qKiBDYWNoZWQgR2l0SHViIGxvZ2luIHJlc29sdmVkIG9uIGNvbm5lY3Q7IHVzZWQgYXMgdHJhbnNjcmlwdCBwYXJ0aXRpb24ga2V5LiAqL1xuXHRwcml2YXRlIF91c2VyTG9naW46IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIExvY2FsbHktcGVyc2lzdGVkIHR1cm4gaWQgb2YgdGhlIGxhc3QgYXNzaXN0YW50IHR1cm4gd2UgYXBwZW5kZWQuXG5cdCAqIFVzZWQgYXMgdGhlIGFuY2VzdG9yIG9mIHRoZSBuZXh0IHVzZXIgdHVybiB3ZSBwZXJzaXN0LiAqL1xuXHRwcml2YXRlIF9sYXN0UGVyc2lzdGVkVHVybklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKiBMYXN0LU4gY3Jvc3Mtc2Vzc2lvbiB0aW1lbGluZSBlbnRyaWVzIFx1MjAxNCB2b2ljZSB0dXJucywgdm9pY2UgdG9vbFxuXHQgKiBjYWxscywgY29kaW5nLXNlc3Npb24gZXZlbnRzLCBwbHVzIGEgc3ludGhlc2l6ZWQgZmlyc3QtMi1zZW50ZW5jZXNcblx0ICogc3VtbWFyeSBvZiB0aGUgbGF0ZXN0IENvcGlsb3QgcmVwbHkgcGVyIGFjdGl2ZSBzZXNzaW9uLiBTZW50IHRvIHRoZVxuXHQgKiBCRSBvbiB0aGUgbmV4dCBzdGFydF9zZXNzaW9uIGFuZCB0aGVuIGNsZWFyZWQgXHUyMDE0IHNpbmdsZS1zaG90IHJlY2FsbC4gKi9cblx0cHJpdmF0ZSBfcGVuZGluZ1ByaW9yVGltZWxpbmU6IElWb2ljZVByaW9yVGltZWxpbmVFbnRyeVtdID0gW107XG5cdC8qKlxuXHQgKiBIb3cgbWFueSBvZiB0aGUgbW9zdCByZWNlbnQgcGVyc2lzdGVkIHRpbWVsaW5lIGVudHJpZXMgd2UgZm9yd2FyZFxuXHQgKiB0byB0aGUgQkUgKGFjcm9zcyBhbGwga2luZHMpLiBDb2RpbmctYWdlbnQgcmVwbHkgc3ludGhlc2lzIGhhcHBlbnNcblx0ICogb24gdG9wIG9mIHRoaXMgXHUyMDE0IHdlIGFkZCBvbmUgZW50cnkgcGVyIGFjdGl2ZSBjb2Rpbmcgc2Vzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFBSSU9SX1RJTUVMSU5FX0VOVFJZX0xJTUlUID0gMzA7XG5cdC8qKlxuXHQgKiBNYXggc2VudGVuY2VzIG9mIENvcGlsb3QncyBsYXN0IHJlcGx5IHdlIGluY2x1ZGUgcGVyIGFjdGl2ZSBjb2Rpbmdcblx0ICogc2Vzc2lvbiB3aGVuIHN5bnRoZXNpemluZyBgYGNvZGluZ19hZ2VudF9yZXBseWBgIGVudHJpZXMuIEJvdW5kZWRcblx0ICogYmVjYXVzZSB0aGUgZnVsbCByZXBseSBjYW4gYmUgYXJiaXRyYXJpbHkgbG9uZy5cblx0ICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IENPRElOR19BR0VOVF9SRVBMWV9TRU5URU5DRV9MSU1JVCA9IDI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElWb2ljZUNsaWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2b2ljZUNsaWVudFNlcnZpY2U6IElWb2ljZUNsaWVudFNlcnZpY2UsXG5cdFx0QElNaWNDYXB0dXJlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1pY0NhcHR1cmVTZXJ2aWNlOiBJTWljQ2FwdHVyZVNlcnZpY2UsXG5cdFx0QElUdHNQbGF5YmFja1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0dHNQbGF5YmFja1NlcnZpY2U6IElUdHNQbGF5YmFja1NlcnZpY2UsXG5cdFx0QElWb2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2b2ljZVRvb2xEaXNwYXRjaFNlcnZpY2U6IElWb2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UsXG5cdFx0QElWb2ljZVBsYXliYWNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZvaWNlUGxheWJhY2tTZXJ2aWNlOiBJVm9pY2VQbGF5YmFja1NlcnZpY2UsXG5cdFx0QElBZ2VudFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50U2Vzc2lvbnNTZXJ2aWNlOiBJQWdlbnRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElWb2ljZVRyYW5zY3JpcHRTdG9yZSBwcml2YXRlIHJlYWRvbmx5IHZvaWNlVHJhbnNjcmlwdFN0b3JlOiBJVm9pY2VUcmFuc2NyaXB0U3RvcmUsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9tcHRzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb21wdHNTZXJ2aWNlOiBJUHJvbXB0c1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBUcmFjayB0aGUgZm9jdXNlZCBjaGF0IHNlc3Npb24gc28gd2UgY2FuIGRlZmVyIHZvaWNlIHJlc3BvbnNlcyB0aGF0XG5cdFx0Ly8gYXJyaXZlIGZvciBhIHNlc3Npb24gdGhlIHVzZXIgaXNuJ3QgY3VycmVudGx5IGxvb2tpbmcgYXQsIGFuZCBmbHVzaFxuXHRcdC8vIHRoZW0gb25jZSB0aGF0IHNlc3Npb24gYmVjb21lcyBmb2N1c2VkLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFdpZGdldFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1c2VkU2Vzc2lvbigoKSA9PiB0aGlzLl9vbkZvY3VzZWRTZXNzaW9uQ2hhbmdlZCgpKSk7XG5cblx0XHQvLyBgb25EaWRDaGFuZ2VGb2N1c2VkU2Vzc2lvbmAgb25seSBmaXJlcyBmb3IgdGhlIERPTS1mb2N1c2VkIHdpZGdldCwgc28gYVxuXHRcdC8vIHNlc3Npb24gb3BlbmVkIGludG8gYSBub24tZm9jdXNlZCB3aWRnZXQgKGUuZy4gcmV2ZWFsZWQgaW4gdGhlIGNoYXQgdmlld1xuXHRcdC8vIHBhbmUgZnJvbSB0aGUgc2Vzc2lvbnMgbGlzdCB3aGlsZSBmb2N1cyBzdGF5cyBvbiB0aGUgbGlzdCkgaXMgbWlzc2VkLlxuXHRcdC8vIFdhdGNoIGV2ZXJ5IHdpZGdldCdzIHZpZXctbW9kZWwgc28gd2UgYWxzbyByZWFjdCB3aGVuIGEgc2Vzc2lvbiBpc1xuXHRcdC8vICpzaG93biogd2l0aG91dCB0YWtpbmcgZm9jdXMgLSB0aGlzIGlzIHdoYXQgbWFrZXMgYSBwZW5kaW5nIGNvbmZpcm1hdGlvblxuXHRcdC8vIG5hcnJhdGUgLyBhIGJ1ZmZlcmVkIHJlc3BvbnNlIGZsdXNoIG9uIHRoZSBmaXJzdCBjbGljayByYXRoZXIgdGhhbiB0aGVcblx0XHQvLyBzZWNvbmQuXG5cdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5nZXRBbGxXaWRnZXRzKCkpIHtcblx0XHRcdHRoaXMuX3RyYWNrV2lkZ2V0U2Vzc2lvbih3aWRnZXQpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLm9uRGlkQWRkV2lkZ2V0KHdpZGdldCA9PiB0aGlzLl90cmFja1dpZGdldFNlc3Npb24od2lkZ2V0KSkpO1xuXG5cdFx0Ly8gU2V0IHVwIHRoZSB0b29sIGRpc3BhdGNoIGRlbGVnYXRlIFx1MjAxNCB1c2VzIGNvbW1hbmQgYnJpZGdlIGZvciB3aWRnZXQgb3BzXG5cdFx0dGhpcy52b2ljZVRvb2xEaXNwYXRjaFNlcnZpY2Uuc2V0RGVsZWdhdGUoe1xuXHRcdFx0YWNjZXB0SW5wdXQ6ICh0ZXh0OiBzdHJpbmcpOiBib29sZWFuID0+IHtcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnX2NoYXQudm9pY2UuYWNjZXB0SW5wdXQnLCB0ZXh0KS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbdm9pY2VdIGFjY2VwdElucHV0IGRlbGVnYXRlIGZhaWxlZDonLCBlcnIpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0Q3VycmVudFNlc3Npb25SZXNvdXJjZTogYXN5bmMgKCk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlU3RyID0gYXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxzdHJpbmcgfCB1bmRlZmluZWQ+KCdfY2hhdC52b2ljZS5nZXRDdXJyZW50U2Vzc2lvbicpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0XHRcdHJldHVybiByZXNvdXJjZVN0ciA/IFVSSS5wYXJzZShyZXNvdXJjZVN0cikgOiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0c3dpdGNoVG9TZXNzaW9uOiAocmVzb3VyY2U6IFVSSSk6IHZvaWQgPT4ge1xuXHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdfY2hhdC52b2ljZS5zd2l0Y2hUb1Nlc3Npb24nLCByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRBdXRvQXBwcm92ZWRTZXNzaW9uczogKCk6IFNldDxzdHJpbmc+ID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2F1dG9BcHByb3ZlZFNlc3Npb25zO1xuXHRcdFx0fSxcblx0XHRcdGFkZEFsbEF1dG9BcHByb3ZlZFNlc3Npb25zOiAoKTogdm9pZCA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25zID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9ucy5maWx0ZXIocyA9PiAhcy5pc0FyY2hpdmVkKCkpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHMgb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdFx0XHR0aGlzLl9hdXRvQXBwcm92ZWRTZXNzaW9ucy5hZGQocy5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihzLnJlc291cmNlKTtcblx0XHRcdFx0XHRpZiAobW9kZWwpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2F1dG9BcHByb3ZlUGVuZGluZ1Rvb2xzKG1vZGVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRyZW1vdmVBdXRvQXBwcm92ZWRTZXNzaW9uOiAocmVzb3VyY2U6IHN0cmluZyk6IHZvaWQgPT4ge1xuXHRcdFx0XHR0aGlzLl9hdXRvQXBwcm92ZWRTZXNzaW9ucy5kZWxldGUocmVzb3VyY2UpO1xuXHRcdFx0fSxcblx0XHRcdHRyaWdnZXJBdXRvQXBwcm92ZUNoZWNrOiAoKTogdm9pZCA9PiB7XG5cdFx0XHRcdHRoaXMuX2F1dG9BcHByb3ZlQ2hlY2soKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHQvLyBBbHdheXMtb24gYXV0b3J1biB0byB0cmFjayBwZW5kaW5nIHRvb2wgY29uZmlybWF0aW9ucyBhY3Jvc3MgYWxsIHNlc3Npb25zXG5cdFx0Ly8gKGJvdGggYWdlbnQgc2Vzc2lvbnMgQU5EIHJlZ3VsYXIgY2hhdCBzZXNzaW9ucykuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnRTZXNzaW9ucyA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwuc2Vzc2lvbnMuZmlsdGVyKHMgPT4gIXMuaXNBcmNoaXZlZCgpKTtcblx0XHRcdGNvbnN0IHRvb2xDb25maXJtYXRpb25zOiBJUGVuZGluZ1Rvb2xDb25maXJtYXRpb25bXSA9IFtdO1xuXHRcdFx0Y29uc3QgcHJvY2Vzc2VkUmVzb3VyY2VzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHQvLyBTZXNzaW9ucyBzdXBwcmVzc2VkIGJ5IGEgdGVybWluYWwgdGVhcmRvd24gdW50aWwgdGhlIG5leHQgY29ubmVjdCgpXG5cdFx0XHQvLyAoc2VlIF9zdXBwcmVzc1BlbmRpbmdDb25maXJtYXRpb25zVW50aWxDb25uZWN0KS4gUmVhZCByZWFjdGl2ZWx5IHNvXG5cdFx0XHQvLyBjbGVhcmluZyB0aGUgc2V0IG9uIHJlY29ubmVjdCByZS1maXJlcyB0aGlzIHRyYWNrZXIuXG5cdFx0XHRjb25zdCBzdXBwcmVzc2VkU2Vzc2lvbnMgPSB0aGlzLl9zdXBwcmVzc2VkQ29uZmlybWF0aW9uU2Vzc2lvbnMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHQvLyBDb2xsZWN0IGNoYXQgbW9kZWxzIGZyb20gYWdlbnQgc2Vzc2lvbnNcblx0XHRcdGNvbnN0IG1vZGVsc1RvQ2hlY2s6IHsgbW9kZWw6IElDaGF0TW9kZWw7IHJlc291cmNlOiBVUkk7IGxhYmVsOiBzdHJpbmcgfVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHMgb2YgYWdlbnRTZXNzaW9ucykge1xuXHRcdFx0XHRwcm9jZXNzZWRSZXNvdXJjZXMuYWRkKHMucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdC8vIEtlZXAgdGhlIGJhY2tlbmRcdTIxOTJVSSByZXNvdXJjZSBhbGlhcyBmcmVzaCBzbyBhIHJlc3BvbnNlIHRoZSB2b2ljZVxuXHRcdFx0XHQvLyBiYWNrZW5kIHRhZ3Mgd2l0aCB0aGUgYmFyZSBiYWNrZW5kIGlkIChmb3IgYW4gdW5mb2N1c2VkIHNlc3Npb24pXG5cdFx0XHRcdC8vIGNhbm9uaWNhbGl6ZXMgdG8gdGhpcyBVSSByZXNvdXJjZSBmb3IgZGVmZXIvZmx1c2gvcGVuZGluZyBrZXlzLlxuXHRcdFx0XHR0aGlzLl9yZWNvcmRTZXNzaW9uQWxpYXMocy5yZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKHMucmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAobW9kZWwpIHtcblx0XHRcdFx0XHRtb2RlbHNUb0NoZWNrLnB1c2goeyBtb2RlbCwgcmVzb3VyY2U6IHMucmVzb3VyY2UsIGxhYmVsOiBzLmxhYmVsIHx8ICdVbnRpdGxlZCBzZXNzaW9uJyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBBbHNvIGNvbGxlY3QgcmVndWxhciAobm9uLWFnZW50KSBjaGF0IHNlc3Npb25zIHJlYWN0aXZlbHlcblx0XHRcdGZvciAoY29uc3QgY2hhdE1vZGVsIG9mIHRoaXMuY2hhdFNlcnZpY2UuY2hhdE1vZGVscy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0Y29uc3Qga2V5ID0gY2hhdE1vZGVsLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0XHRpZiAocHJvY2Vzc2VkUmVzb3VyY2VzLmhhcyhrZXkpKSB7IGNvbnRpbnVlOyB9XG5cdFx0XHRcdGlmIChjaGF0TW9kZWwuZ2V0UmVxdWVzdHMoKS5sZW5ndGggPT09IDApIHsgY29udGludWU7IH1cblx0XHRcdFx0cHJvY2Vzc2VkUmVzb3VyY2VzLmFkZChrZXkpO1xuXHRcdFx0XHRtb2RlbHNUb0NoZWNrLnB1c2goeyBtb2RlbDogY2hhdE1vZGVsLCByZXNvdXJjZTogY2hhdE1vZGVsLnNlc3Npb25SZXNvdXJjZSwgbGFiZWw6IGNoYXRNb2RlbC50aXRsZSB8fCAnQ2hhdCcgfSk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgeyBtb2RlbCwgcmVzb3VyY2UsIGxhYmVsIH0gb2YgbW9kZWxzVG9DaGVjaykge1xuXHRcdFx0XHRpZiAoc3VwcHJlc3NlZFNlc3Npb25zLmhhcyhyZXNvdXJjZS50b1N0cmluZygpKSkgeyBjb250aW51ZTsgfVxuXHRcdFx0XHRjb25zdCBsYXN0UmVxID0gbW9kZWwubGFzdFJlcXVlc3RPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAobGFzdFJlcT8ucmVzcG9uc2UpIHtcblx0XHRcdFx0XHRjb25zdCBwZW5kaW5nID0gbGFzdFJlcS5yZXNwb25zZS5pc1BlbmRpbmdDb25maXJtYXRpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdGlmIChwZW5kaW5nICYmICF0aGlzLl9hdXRvQXBwcm92ZWRTZXNzaW9ucy5oYXMocmVzb3VyY2UudG9TdHJpbmcoKSkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbmZpcm1UeXBlID0gdGhpcy5fY2xhc3NpZnlQZW5kaW5nVHlwZShsYXN0UmVxLnJlc3BvbnNlKTtcblx0XHRcdFx0XHRcdGNvbnN0IGRlc2MgPSB0aGlzLl9nZXRDb25maXJtYXRpb25EZXNjcmlwdGlvbihsYXN0UmVxLnJlc3BvbnNlKTtcblx0XHRcdFx0XHRcdHRvb2xDb25maXJtYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBjb25maXJtVHlwZSxcblx0XHRcdFx0XHRcdFx0c2Vzc2lvbkxhYmVsOiBsYWJlbCxcblx0XHRcdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiByZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGRlc2MgfHwgcGVuZGluZy5kZXRhaWwgfHwgKGNvbmZpcm1UeXBlID09PSAnaW5wdXQnID8gJ05lZWRzIHlvdXIgaW5wdXQnIDogJ05lZWRzIGFwcHJvdmFsJyksXG5cdFx0XHRcdFx0XHRcdGFwcHJvdmU6ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAobGFzdFJlcS5yZXNwb25zZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIGxhc3RSZXEucmVzcG9uc2UucmVzcG9uc2UudmFsdWUpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdElDaGF0VG9vbEludm9jYXRpb24uY29uZmlybVdpdGgocGFydCBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRkZW55OiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGxhc3RSZXEucmVzcG9uc2UpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgcGFydCBvZiBsYXN0UmVxLnJlc3BvbnNlLnJlc3BvbnNlLnZhbHVlKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKHBhcnQgYXMgSUNoYXRUb29sSW52b2NhdGlvbiwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuRGVuaWVkIH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gRmFsbGJhY2s6IGRldGVjdCBXYWl0aW5nRm9yQ29uZmlybWF0aW9uIHdpdGhvdXQgY29uZmlybWF0aW9uTWVzc2FnZXNcblx0XHRcdFx0XHQvLyAoZS5nLiBhc2tRdWVzdGlvbnMpLiBSZWFkIHRvb2wgc3RhdGVzIHJlYWN0aXZlbHkgc28gdGhlIGF1dG9ydW5cblx0XHRcdFx0XHQvLyByZS1maXJlcyB3aGVuIGEgdG9vbCBlbnRlcnMgV2FpdGluZ0ZvckNvbmZpcm1hdGlvbi5cblx0XHRcdFx0XHRpZiAoIXBlbmRpbmcgJiYgIXRoaXMuX2F1dG9BcHByb3ZlZFNlc3Npb25zLmhhcyhyZXNvdXJjZS50b1N0cmluZygpKSkge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIGxhc3RSZXEucmVzcG9uc2UucmVzcG9uc2UudmFsdWUpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHRvb2xTdGF0ZSA9IChwYXJ0IGFzIElDaGF0VG9vbEludm9jYXRpb24pLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAodG9vbFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHBhcmFtcyA9IHRvb2xTdGF0ZS5wYXJhbWV0ZXJzIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgcXVlc3Rpb25zID0gcGFyYW1zPy5bJ3F1ZXN0aW9ucyddO1xuXHRcdFx0XHRcdFx0XHRcdFx0bGV0IGRlc2MgPSAnJztcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KHF1ZXN0aW9ucykgJiYgcXVlc3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzYyA9IHF1ZXN0aW9ucy5tYXAoKHE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgdGl0bGUgPSBxWydoZWFkZXInXSB8fCBxWydxdWVzdGlvbiddO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGlmICghdGl0bGUpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiAnJztcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHFbJ29wdGlvbnMnXTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zKSAmJiBvcHRpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGxhYmVscyA9IG9wdGlvbnNcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Lm1hcCgobzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IG9bJ2xhYmVsJ10pXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdC5maWx0ZXIoQm9vbGVhbik7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAobGFiZWxzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGAke3RpdGxlfTogJHtsYWJlbHMuam9pbignLCAnKX1gO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdGl0bGU7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0pLmZpbHRlcihCb29sZWFuKS5qb2luKCc7ICcpO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0dG9vbENvbmZpcm1hdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdpbnB1dCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHNlc3Npb25MYWJlbDogbGFiZWwsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBkZXNjIHx8ICdOZWVkcyB5b3VyIGlucHV0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0YXBwcm92ZTogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdElDaGF0VG9vbEludm9jYXRpb24uY29uZmlybVdpdGgocGFydCBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZW55OiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0SUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aChwYXJ0IGFzIElDaGF0VG9vbEludm9jYXRpb24sIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkRlbmllZCB9KTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wZW5kaW5nVG9vbENvbmZpcm1hdGlvbnMuc2V0KHRvb2xDb25maXJtYXRpb25zLCB1bmRlZmluZWQpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlZ2lzdGVyIHJlcGxheS9zdG9wIGNvbW1hbmRzIGZvciBWb2ljZVBsYXliYWNrU2VydmljZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfY2hhdC52b2ljZVBsYXliYWNrLnJlcGxheScsIChfYWNjZXNzb3IsIHBheWxvYWQ/OiB7IHNlc3Npb25JZD86IHN0cmluZzsgdHJhbnNjcmlwdD86IHN0cmluZyB9KSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSBwYXlsb2FkPy5zZXNzaW9uSWQ7XG5cdFx0XHRpZiAoIXNlc3Npb25JZCkgeyByZXR1cm47IH1cblx0XHRcdHRoaXMuX3JlcGxheVNlc3Npb25BdWRpbyhzZXNzaW9uSWQpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnX2NoYXQudm9pY2VQbGF5YmFjay5zdG9wJywgKF9hY2Nlc3NvciwgcGF5bG9hZD86IHsgc2Vzc2lvbklkPzogc3RyaW5nIH0pID0+IHtcblx0XHRcdHRoaXMuX3N0b3BSZXBsYXkoKTtcblx0XHRcdGlmIChwYXlsb2FkPy5zZXNzaW9uSWQpIHtcblx0XHRcdFx0dGhpcy52b2ljZVBsYXliYWNrU2VydmljZS5ub3RpZnlQbGF5YmFja0VuZChVUkkucGFyc2UocGF5bG9hZC5zZXNzaW9uSWQpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih7IGRpc3Bvc2U6ICgpID0+IHRoaXMuZGlzY29ubmVjdCgpIH0pO1xuXHR9XG5cblx0YXN5bmMgY29ubmVjdCh3aW5kb3c6IFdpbmRvdyAmIHR5cGVvZiBnbG9iYWxUaGlzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2lzQ29ubmVjdGluZy5nZXQoKSB8fCB0aGlzLl9pc0Nvbm5lY3RlZC5nZXQoKSkgeyByZXR1cm47IH1cblx0XHRjb25zdCBjb25uZWN0QXR0ZW1wdEdlbmVyYXRpb24gPSArK3RoaXMuX2Nvbm5lY3RBdHRlbXB0R2VuZXJhdGlvbjtcblxuXHRcdHRoaXMuX3dpbmRvdyA9IHdpbmRvdztcblx0XHR0aGlzLl9vbkZvY3VzZWRTZXNzaW9uQ2hhbmdlZCgpO1xuXHRcdHRoaXMuX2ZhdGFsRGlzY29ubmVjdCA9IGZhbHNlO1xuXHRcdC8vIEEgZnJlc2ggY29ubmVjdGlvbiByZS1lbmFibGVzIGNvbmZpcm1hdGlvbiB0cmFja2luZyBmb3IgYW55IHNlc3Npb25zXG5cdFx0Ly8gc3VwcHJlc3NlZCBieSB0aGUgcHJldmlvdXMgdGVybWluYWwgdGVhcmRvd24uXG5cdFx0dGhpcy5fc3VwcHJlc3NlZENvbmZpcm1hdGlvblNlc3Npb25zLnNldChuZXcgU2V0KCksIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5faXNDb25uZWN0aW5nLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3N0YXR1c1RleHQuc2V0KCdDb25uZWN0aW5nLi4uJywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl92b2ljZVN0YXRlLnNldCgnaWRsZScsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fdGVsZW1ldHJ5Q29ubmVjdFN0YXJ0TXMgPSBEYXRlLm5vdygpO1xuXG5cdFx0Ly8gQXJtIHRoZSB3YXRjaGRvZyBiZWZvcmUgYW55IGF3YWl0ZWQgd29yayBiZWxvdyAocmVzb2x2aW5nIHRoZSBHaXRIdWJcblx0XHQvLyBzZXNzaW9uLCBsb2FkaW5nIHRyYW5zY3JpcHRzKSBzbyBhIHN0ZXAgdGhhdCBoYW5ncyBjYW4ndCBsZWF2ZSB0aGVcblx0XHQvLyB0b29sYmFyIHNwaW5uZXIgc3R1Y2sgaW5kZWZpbml0ZWx5IFx1MjAxNCBhIHJlYWwgcmVwb3J0IHdoZW4gYSBjaGF0IHJlcXVlc3Rcblx0XHQvLyBpcyBpbiBwcm9ncmVzcy4gQ2xlYXJlZCBvbiBhIHN1Y2Nlc3NmdWwgaGFuZHNoYWtlIG9yIGFuIGV4cGxpY2l0XG5cdFx0Ly8gZGlzY29ubmVjdC5cblx0XHR0aGlzLl9hcm1Db25uZWN0V2F0Y2hkb2coKTtcblxuXHRcdC8vIFJlc29sdmUgdGhlIEdpdEh1YiBsb2dpbiB1c2VkIGFzIHRoZSB0cmFuc2NyaXB0IHBhcnRpdGlvbiBrZXkuXG5cdFx0Ly8gVm9pY2UgQ29kZSBpcyB0aWdodGx5IGNvdXBsZWQgdG8gR2l0SHViIGF1dGggdmlhIENvcGlsb3QgXHUyMDE0IG9uZSBzZXNzaW9uXG5cdFx0Ly8gaXMgZXhwZWN0ZWQgdG8gZXhpc3QuIElmIG5vdCwgd2Ugc2tpcCBwZXJzaXN0ZW5jZSByYXRoZXIgdGhhbiBmYWlsLlxuXHRcdGxldCBhdXRoVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucygnZ2l0aHViJyk7XG5cdFx0XHRpZiAoY29ubmVjdEF0dGVtcHRHZW5lcmF0aW9uICE9PSB0aGlzLl9jb25uZWN0QXR0ZW1wdEdlbmVyYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdXNlckxvZ2luID0gc2Vzc2lvbnNbMF0/LmFjY291bnQubGFiZWw7XG5cdFx0XHRhdXRoVG9rZW4gPSBzZXNzaW9uc1swXT8uYWNjZXNzVG9rZW47XG5cdFx0XHRpZiAoIXRoaXMuX3VzZXJMb2dpbikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW3ZvaWNlXSBubyBHaXRIdWIgc2Vzc2lvbiBmb3VuZDsgdHJhbnNjcmlwdHMgd2lsbCBub3QgYmUgcGVyc2lzdGVkJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBQaWNrIHVwIHRoZSBtb3N0IHJlY2VudCBwcmlvciB0dXJuIGlkIHNvIHRoZSBuZXcgY2hhaW5cblx0XHRcdFx0Ly8gY29udGludWVzIG9mZiB0aGUgZXhpc3Rpbmcgb25lIChjb3NtZXRpYyBcdTIwMTQgd2Ugb25seSBldmVyXG5cdFx0XHRcdC8vIGNoYWluIGxvY2FsbHkpLlxuXHRcdFx0XHRjb25zdCBsYXN0VHVybiA9IChhd2FpdCB0aGlzLnZvaWNlVHJhbnNjcmlwdFN0b3JlLmxvYWRUdXJucyh0aGlzLl91c2VyTG9naW4sIHsgbGltaXQ6IDEgfSkpWzBdO1xuXHRcdFx0XHRpZiAoY29ubmVjdEF0dGVtcHRHZW5lcmF0aW9uICE9PSB0aGlzLl9jb25uZWN0QXR0ZW1wdEdlbmVyYXRpb24pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fbGFzdFBlcnNpc3RlZFR1cm5JZCA9IGxhc3RUdXJuPy50dXJuSWQ7XG5cblx0XHRcdFx0Ly8gUHVsbCB0aGUgbGFzdCBmZXcgcGVyc2lzdGVkIHRpbWVsaW5lIGVudHJpZXMgKHZvaWNlIHR1cm5zLFxuXHRcdFx0XHQvLyB2b2ljZSB0b29sIGNhbGxzLCBjb2RpbmcgZXZlbnRzKSBhbmQgc3ludGhlc2l6ZSBvbmVcblx0XHRcdFx0Ly8gY29kaW5nX2FnZW50X3JlcGx5IHBlciBhY3RpdmUgc2Vzc2lvbi4gVGhlIEJFIGNvbnN1bWVzXG5cdFx0XHRcdC8vIHRoaXMgb25jZSBvbiB0aGUgZmlyc3QgY29tbWFuZCBhZnRlciByZWNvbm5lY3Qgc28gdGhlXG5cdFx0XHRcdC8vIG1vZGVsIGNhbiBhbnN3ZXIgXCJ3aGF0IHdlcmUgd2UgZG9pbmc/XCIgLyBcInJlbWVtYmVyIHh5ej9cIi5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCByZWNlbnQgPSBhd2FpdCB0aGlzLnZvaWNlVHJhbnNjcmlwdFN0b3JlLmxvYWRUdXJucyhcblx0XHRcdFx0XHRcdHRoaXMuX3VzZXJMb2dpbixcblx0XHRcdFx0XHRcdHsgbGltaXQ6IFZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuUFJJT1JfVElNRUxJTkVfRU5UUllfTElNSVQgfVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0aWYgKGNvbm5lY3RBdHRlbXB0R2VuZXJhdGlvbiAhPT0gdGhpcy5fY29ubmVjdEF0dGVtcHRHZW5lcmF0aW9uKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdQcmlvclRpbWVsaW5lID0gdGhpcy5fYnVpbGRQcmlvclRpbWVsaW5lKHJlY2VudCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbdm9pY2VdIGZhaWxlZCB0byBsb2FkIHByaW9yIHRpbWVsaW5lIGVudHJpZXMgZm9yIGNvbnRleHQnLCBlcnIpO1xuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdQcmlvclRpbWVsaW5lID0gW107XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbdm9pY2VdIGZhaWxlZCB0byByZXNvbHZlIEdpdEh1YiBzZXNzaW9uJywgZXJyKTtcblx0XHR9XG5cblx0XHQvLyBUaGUgd2F0Y2hkb2cgKG9yIGFuIGV4cGxpY2l0IGRpc2Nvbm5lY3QpIG1heSBoYXZlIHJlc2V0IHVzIHdoaWxlIHRoZVxuXHRcdC8vIGF3YWl0ZWQgYXV0aC90cmFuc2NyaXB0IGNhbGxzIHdlcmUgaW4gZmxpZ2h0OyBiYWlsIHJhdGhlciB0aGFuIG9wZW5pbmcgYVxuXHRcdC8vIGxhdGUgY29ubmVjdGlvbiB0aGUgdXNlciBpcyBubyBsb25nZXIgZXhwZWN0aW5nLlxuXHRcdGlmICghdGhpcy5faXNDb25uZWN0aW5nLmdldCgpIHx8IGNvbm5lY3RBdHRlbXB0R2VuZXJhdGlvbiAhPT0gdGhpcy5fY29ubmVjdEF0dGVtcHRHZW5lcmF0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fdm9pY2VFdmVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHQvLyBNdWx0aS13aW5kb3cgaGFuZHMtZnJlZTogYWJvcnQgYW55IG9wZW4gcGFzc2l2ZSB0dXJuIHdoZW4gdGhpcyB3aW5kb3dcblx0XHQvLyBsb3NlcyBPUyBmb2N1cyBzbyB0aGUgYmFja2dyb3VuZCB3aW5kb3cgc3RvcHMgcmVjb3JkaW5nLCBhbmQgcmUtYXJtXG5cdFx0Ly8gbGlzdGVuaW5nIHdoZW4gaXQgZ2FpbnMgZm9jdXMgc28gb25seSB0aGUgZm9jdXNlZCB3aW5kb3cgbGlzdGVucyAoIzg1MDcpLlxuXHRcdHRoaXMuX3ZvaWNlRXZlbnREaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3dpbmRvdyEsICdibHVyJywgKCkgPT4gdGhpcy5fb25XaW5kb3dCbHVyKCkpKTtcblx0XHR0aGlzLl92b2ljZUV2ZW50RGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl93aW5kb3chLCAnZm9jdXMnLCAoKSA9PiB0aGlzLl9vbldpbmRvd0ZvY3VzKCkpKTtcblxuXHRcdC8vIFN0cmVhbWluZyBQVFQ6IHNlbmQgc3RhcnQvY2h1bmtzL2VuZCBhcyB0aGV5IGFycml2ZVxuXHRcdHRoaXMuX3ZvaWNlRXZlbnREaXNwb3NhYmxlcy5hZGQodGhpcy5taWNDYXB0dXJlU2VydmljZS5vblB0dFN0YXJ0KChwYXNzaXZlKSA9PiB7XG5cdFx0XHR0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5zZW5kUHR0U3RhcnQodGhpcy5fcHR0Q3VycmVudFR1cm5JZCwgcGFzc2l2ZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3ZvaWNlRXZlbnREaXNwb3NhYmxlcy5hZGQodGhpcy5taWNDYXB0dXJlU2VydmljZS5vblB0dEF1ZGlvQ2h1bmsoYjY0ID0+IHtcblx0XHRcdHRoaXMudm9pY2VDbGllbnRTZXJ2aWNlLnNlbmRQdHRBdWRpb0NodW5rKGI2NCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3ZvaWNlRXZlbnREaXNwb3NhYmxlcy5hZGQodGhpcy5taWNDYXB0dXJlU2VydmljZS5vblB0dEVuZCgoKSA9PiB7XG5cdFx0XHR0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5zZW5kUHR0RW5kKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3ZvaWNlRXZlbnREaXNwb3NhYmxlcy5hZGQodGhpcy5taWNDYXB0dXJlU2VydmljZS5vblB0dERpYWdub3N0aWMoKGRpYWc6IElQdHREaWFnbm9zdGljKSA9PiB7XG5cdFx0XHQvLyBMb2NhbCBsb2cgc28gdGhlIHNhbWUgY29ycmVsYXRpb24ga2V5IHN1cmZhY2VzIGluIHRoZVxuXHRcdFx0Ly8gVlMgQ29kZSBsb2cgZmlsZXMgZXZlbiBpZiB0aGUgV1MgaXMgY2xvc2VkIG1pZC1mbGlnaHQuXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoXG5cdFx0XHRcdGBbdm9pY2VdIHB0dC5kaWFnbm9zdGljIHR1cm5faWQ9JHtkaWFnLnR1cm5JZH0gYCArXG5cdFx0XHRcdGBtc0hlbGQ9JHtkaWFnLm1zSGVsZH0gY2h1bmtzU2VudD0ke2RpYWcuY2h1bmtzU2VudH0gc2FtcGxlc1NlbnQ9JHtkaWFnLnNhbXBsZXNTZW50fSBgICtcblx0XHRcdFx0YGRyYWluRmlyZWQ9JHtkaWFnLmRyYWluRmlyZWR9IGRyYWluQ2h1bmtzPSR7ZGlhZy5kcmFpbkNodW5rc30gZHJhaW5TYW1wbGVzPSR7ZGlhZy5kcmFpblNhbXBsZXN9IGRyYWluV2luZG93TXM9JHtkaWFnLmRyYWluV2luZG93TXN9IGAgK1xuXHRcdFx0XHRgZHJhaW5Ta2lwcGVkQnlNdXRlPSR7ZGlhZy5kcmFpblNraXBwZWRCeU11dGV9IGRyYWluU2tpcHBlZEJ5U3VwcHJlc3Npb249JHtkaWFnLmRyYWluU2tpcHBlZEJ5U3VwcHJlc3Npb259IGAgK1xuXHRcdFx0XHRgcG9zdFJlbGVhc2VDYWxsYmFja3M9JHtkaWFnLnBvc3RSZWxlYXNlQ2FsbGJhY2tzfSBwb3N0UmVsZWFzZVNhbXBsZXM9JHtkaWFnLnBvc3RSZWxlYXNlU2FtcGxlc30gYCArXG5cdFx0XHRcdGBwb3N0UmVsZWFzZVNraXBwZWRCeU11dGU9JHtkaWFnLnBvc3RSZWxlYXNlU2tpcHBlZEJ5TXV0ZX0gcG9zdFJlbGVhc2VTa2lwcGVkQnlTdXBwcmVzc2lvbj0ke2RpYWcucG9zdFJlbGVhc2VTa2lwcGVkQnlTdXBwcmVzc2lvbn0gYCArXG5cdFx0XHRcdGBwb3N0UmVsZWFzZVdpbmRvd01zPSR7ZGlhZy5wb3N0UmVsZWFzZVdpbmRvd01zfSBgICtcblx0XHRcdFx0YHJlbGVhc2VkRHVyaW5nQWNxdWlyZT0ke2RpYWcucmVsZWFzZWREdXJpbmdBY3F1aXJlfSBwdHRVcFdpdGhvdXRDYXB0dXJlPSR7ZGlhZy5wdHRVcFdpdGhvdXRDYXB0dXJlfWBcblx0XHRcdCk7XG5cdFx0XHR0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5zZW5kUHR0RGlhZ25vc3RpYyhkaWFnLnR1cm5JZCwge1xuXHRcdFx0XHRtc19oZWxkOiBkaWFnLm1zSGVsZCxcblx0XHRcdFx0Y2h1bmtzX3NlbnQ6IGRpYWcuY2h1bmtzU2VudCxcblx0XHRcdFx0c2FtcGxlc19zZW50OiBkaWFnLnNhbXBsZXNTZW50LFxuXHRcdFx0XHRkcmFpbl9maXJlZDogZGlhZy5kcmFpbkZpcmVkLFxuXHRcdFx0XHRkcmFpbl9jaHVua3M6IGRpYWcuZHJhaW5DaHVua3MsXG5cdFx0XHRcdGRyYWluX3NhbXBsZXM6IGRpYWcuZHJhaW5TYW1wbGVzLFxuXHRcdFx0XHRkcmFpbl93aW5kb3dfbXM6IGRpYWcuZHJhaW5XaW5kb3dNcyxcblx0XHRcdFx0ZHJhaW5fc2tpcHBlZF9ieV9tdXRlOiBkaWFnLmRyYWluU2tpcHBlZEJ5TXV0ZSxcblx0XHRcdFx0ZHJhaW5fc2tpcHBlZF9ieV9zdXBwcmVzc2lvbjogZGlhZy5kcmFpblNraXBwZWRCeVN1cHByZXNzaW9uLFxuXHRcdFx0XHRwb3N0X3JlbGVhc2VfY2FsbGJhY2tzOiBkaWFnLnBvc3RSZWxlYXNlQ2FsbGJhY2tzLFxuXHRcdFx0XHRwb3N0X3JlbGVhc2Vfc2FtcGxlczogZGlhZy5wb3N0UmVsZWFzZVNhbXBsZXMsXG5cdFx0XHRcdHBvc3RfcmVsZWFzZV9za2lwcGVkX2J5X211dGU6IGRpYWcucG9zdFJlbGVhc2VTa2lwcGVkQnlNdXRlLFxuXHRcdFx0XHRwb3N0X3JlbGVhc2Vfc2tpcHBlZF9ieV9zdXBwcmVzc2lvbjogZGlhZy5wb3N0UmVsZWFzZVNraXBwZWRCeVN1cHByZXNzaW9uLFxuXHRcdFx0XHRwb3N0X3JlbGVhc2Vfd2luZG93X21zOiBkaWFnLnBvc3RSZWxlYXNlV2luZG93TXMsXG5cdFx0XHRcdHJlbGVhc2VkX2R1cmluZ19hY3F1aXJlOiBkaWFnLnJlbGVhc2VkRHVyaW5nQWNxdWlyZSxcblx0XHRcdFx0cHR0X3VwX3dpdGhvdXRfY2FwdHVyZTogZGlhZy5wdHRVcFdpdGhvdXRDYXB0dXJlLFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVFRTIHBsYXliYWNrIHN0b3BwZWQgXHUyMTkyIGNhY2hlIGF1ZGlvLCBwcm9jZXNzIG5leHQgaW4gcXVldWUgb3IgcmVzdG9yZSBzdGF0dXNcblx0XHR0aGlzLl92b2ljZUV2ZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMudHRzUGxheWJhY2tTZXJ2aWNlLm9uUGxheWJhY2tTdG9wcGVkKCgpID0+IHtcblx0XHRcdC8vIENhcHR1cmUgdGhlIGludGVycnVwdGlvbiBmbGFnIEZJUlNUOiBvblBsYXliYWNrU3RvcHBlZCBhbHNvIGZpcmVzIHdoZW5cblx0XHRcdC8vIHBsYXliYWNrIGlzIHN0b3BwZWQgaW50ZW50aW9uYWxseSAoYmFyZ2UtaW4sIFBUVCwgX2ludGVycnVwdEFzc2lzdGFudFBsYXliYWNrLFxuXHRcdFx0Ly8gZGlzY29ubmVjdCksIGFuZCB3ZSBtdXN0IG5vdCB0cmVhdCBhbiBpbnRlcnJ1cHRlZCByZXBseSBhcyBoZWFyZC5cblx0XHRcdGNvbnN0IHdhc0ludGVycnVwdGVkID0gdGhpcy5fdGVsZW1ldHJ5VHRzSW50ZXJydXB0ZWQ7XG5cdFx0XHQvLyBUZWxlbWV0cnk6IFRUUyBsaXN0ZW4tdGhyb3VnaCByYXRlXG5cdFx0XHRjb25zdCBsaXN0ZW5lZFRvRW5kID0gIXdhc0ludGVycnVwdGVkO1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Vm9pY2VUdHNMaXN0ZW5UaHJvdWdoRXZlbnQsIFZvaWNlVHRzTGlzdGVuVGhyb3VnaENsYXNzaWZpY2F0aW9uPigndm9pY2VUdHNMaXN0ZW5UaHJvdWdoJywge1xuXHRcdFx0XHRsaXN0ZW5lZFRvRW5kLFxuXHRcdFx0XHRsaXN0ZW5lZFBjdDogbGlzdGVuZWRUb0VuZCA/IDEwMCA6IDUwLCAvLyBhcHByb3hpbWF0aW9uOyBleGFjdCAlIHJlcXVpcmVzIHRyYWNraW5nIGF1ZGlvIHBvc2l0aW9uXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3RlbGVtZXRyeVR0c0ludGVycnVwdGVkID0gZmFsc2U7XG5cdFx0XHQvLyBDYWNoZSB0aGUgcGxheWVkIGF1ZGlvIGZvciByZXBsYXlcblx0XHRcdGNvbnN0IGZpbmlzaGVkU2Vzc2lvbklkID0gdGhpcy5fY3VycmVudFBsYXliYWNrU2Vzc2lvbklkO1xuXHRcdFx0Y29uc3Qgc2FtcGxlcyA9IHRoaXMudHRzUGxheWJhY2tTZXJ2aWNlLmdldExhc3RQbGF5ZWRTYW1wbGVzKCk7XG5cdFx0XHRpZiAoc2FtcGxlcyAmJiBmaW5pc2hlZFNlc3Npb25JZCAhPT0gbnVsbCkge1xuXHRcdFx0XHRjb25zdCBjYWNoZUtleSA9IGZpbmlzaGVkU2Vzc2lvbklkID8/ICdfX2dlbmVyaWNfXyc7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25BdWRpb0NhY2hlLnNldChjYWNoZUtleSwgc2FtcGxlcyk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudm9pY2VQbGF5YmFja1NlcnZpY2Uubm90aWZ5UGxheWJhY2tFbmQodW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX2N1cnJlbnRQbGF5YmFja1Nlc3Npb25JZCA9IG51bGw7XG5cdFx0XHR0aGlzLl9jdXJyZW50UGxheWJhY2tGaW5hbGl6ZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGZpbmlzaGVkUmVzcG9uc2VJZCA9IHRoaXMuX2N1cnJlbnRQbGF5YmFja1Jlc3BvbnNlSWQ7XG5cdFx0XHR0aGlzLl9jdXJyZW50UGxheWJhY2tSZXNwb25zZUlkID0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgZmluaXNoZWROYXJyYXRpb24gPSB0aGlzLl9jdXJyZW50UGxheWJhY2tOYXJyYXRpb247XG5cdFx0XHR0aGlzLl9jdXJyZW50UGxheWJhY2tOYXJyYXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoZmluaXNoZWRSZXNwb25zZUlkICYmICF3YXNJbnRlcnJ1cHRlZCkge1xuXHRcdFx0XHRjb25zdCBzcG9rZW5TZXNzaW9uSWQgPSBmaW5pc2hlZFNlc3Npb25JZCA/PyB0aGlzLl9zaG93blNlc3Npb25JZCgpO1xuXHRcdFx0XHRpZiAoc3Bva2VuU2Vzc2lvbklkKSB7XG5cdFx0XHRcdFx0dGhpcy5fbGFzdFNwb2tlbkF0QnlTZXNzaW9uLnNldCh0aGlzLl9zZXNzaW9uS2V5KHNwb2tlblNlc3Npb25JZCksIERhdGUubm93KCkpO1xuXHRcdFx0XHRcdHRoaXMuX25vdGlmeUNoZWNrcG9pbnRQbGF5YmFja0NvbXBsZXRlKHNwb2tlblNlc3Npb25JZCwgZmluaXNoZWRSZXNwb25zZUlkLCBmaW5pc2hlZE5hcnJhdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gVGhlIHJlc3BvbnNlIGFjdHVhbGx5IHBsYXllZCB0byB0aGUgZW5kOiBtYXJrIGl0IGhlYXJkIChzZXQgdGhlXG5cdFx0XHRcdC8vIGV4YWN0bHktb25jZSBkZWR1cCBhbmQgY2xlYXIgaXRzIHBlbmRpbmcgaW5kaWNhdG9yKS4gVGhpcyBpcyB0aGVcblx0XHRcdFx0Ly8gb25seSBwb2ludCB0aGF0IG1lYW5zIHRoZSBhdWRpbyB0cnVseSBwbGF5ZWQgdGhyb3VnaCwgbm90IG1lcmVseVxuXHRcdFx0XHQvLyB0aGF0IGl0IHdhcyBxdWV1ZWQgb3IgcmVjZWl2ZWQuXG5cdFx0XHRcdHRoaXMuX21hcmtOYXJyYXRpb25IZWFyZChmaW5pc2hlZFJlc3BvbnNlSWQpO1xuXHRcdFx0fSBlbHNlIGlmIChmaW5pc2hlZFJlc3BvbnNlSWQgJiYgd2FzSW50ZXJydXB0ZWQpIHtcblx0XHRcdFx0Ly8gSW50ZXJydXB0ZWQgYmVmb3JlIGZpbmlzaGluZzogRE9OJ1QgbWFyayBoZWFyZCAtIGxlYXZlIHRoZSBwZW5kaW5nXG5cdFx0XHRcdC8vIHN1bW1hcnkgKyBpbmRpY2F0b3IgaW50YWN0IHNvIHRoZSByZXBseSBzdGF5cyByZXRyeWFibGUuIERyb3AgdGhlXG5cdFx0XHRcdC8vIGluLWZsaWdodCBzb2xpY2l0ZWQtbmFycmF0aW9uIGd1YXJkIG5vdyAocmF0aGVyIHRoYW4gd2FpdGluZyBmb3Jcblx0XHRcdFx0Ly8gaXRzIHRpbWVvdXQpIHNvIGNsaWNraW5nIHRoZSBzZXNzaW9uIGFnYWluIHJlLXJlcXVlc3RzIGltbWVkaWF0ZWx5LlxuXHRcdFx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ1NvbGljaXRlZE5hcnJhdGlvbnMuZ2V0KGZpbmlzaGVkUmVzcG9uc2VJZCk7XG5cdFx0XHRcdGlmIChwZW5kaW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5fZGVmZXJJbnRlcnJ1cHRlZE5hcnJhdGlvbihmaW5pc2hlZFJlc3BvbnNlSWQsIHBlbmRpbmcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGlmIHRoZXJlJ3MgbW9yZSBpbiB0aGUgcXVldWVcblx0XHRcdGlmICh0aGlzLl9hdWRpb1F1ZXVlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB0aGlzLl9wcm9jZXNzUXVldWUoKSwgNTAwKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh0aGlzLl9wdHRIZWxkKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2JhcmdlSW5MaXN0ZW5BY3RpdmUpIHtcblx0XHRcdFx0XHRcdC8vIFRoZSBwYXNzaXZlIGJhcmdlLWluIHR1cm4gb3BlbmVkIGR1cmluZyBwbGF5YmFjayBpcyBub3dcblx0XHRcdFx0XHRcdC8vIGEgbm9ybWFsIGxpc3RlbmluZyB0dXJuICh0aGUgdXNlciBzdGF5ZWQgc2lsZW50IHRocm91Z2hcblx0XHRcdFx0XHRcdC8vIHBsYXliYWNrKS4gQmVoYXZlIGxpa2UgYW4gYXV0by1saXN0ZW4gdHVybjogYSB0YXAgc3RvcHNcblx0XHRcdFx0XHRcdC8vIGl0LCBhbmQgdGhlIGJhY2tlbmQncyBzZXJ2ZXItVkFEIGVuZHMgaXQgdmlhXG5cdFx0XHRcdFx0XHQvLyBgdHVybl9hdXRvX2VuZGVkYC5cblx0XHRcdFx0XHRcdHRoaXMuX2JhcmdlSW5MaXN0ZW5BY3RpdmUgPSBmYWxzZTtcblx0XHRcdFx0XHRcdHRoaXMuX3B0dFRvZ2dsZU1vZGUgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl92b2ljZVN0YXRlLnNldCgnbGlzdGVuaW5nJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR0aGlzLl9zdGF0dXNUZXh0LnNldCgnTGlzdGVuaW5nLi4uJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl92b2ljZVN0YXRlLnNldCgnaWRsZScsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdHVzVGV4dC5zZXQoJ0hvbGQgdG8gc3BlYWsuLi4nLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGlmICh0aGlzLl9wdHRXYWl0aW5nRm9yUGxheWJhY2spIHtcblx0XHRcdFx0XHRcdHRoaXMuX3NjaGVkdWxlRGVsYXllZE1pY1N0b3AoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gSGFuZHMtZnJlZTogcmUtZW50ZXIgbGlzdGVuaW5nIGFmdGVyIHRoZSBhc3Npc3RhbnQncyByZXBseVxuXHRcdFx0XHRcdC8vIGF1ZGlvIGZpbmlzaGVzLlxuXHRcdFx0XHRcdGlmICh0aGlzLl9pc0hhbmRzRnJlZUVuYWJsZWQoKSAmJiAhdGhpcy5fYXdhaXRpbmdSZXBseUF1ZGlvICYmIHRoaXMuX3JlcGx5UGxheWVkU2luY2VTZW5kKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zY2hlZHVsZUF1dG9MaXN0ZW4oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBDb25uZWN0aW9uIHN0YXRlIFx1MjE5MiBzdGFydCBtaWMgKyBzZW5kIHN0YXJ0IHNlc3Npb25cblx0XHR0aGlzLl92b2ljZUV2ZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMudm9pY2VDbGllbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlKGFzeW5jIGNvbm5lY3RlZCA9PiB7XG5cdFx0XHRpZiAoY29ubmVjdGVkKSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25Jbml0aWFsaXphdGlvbkdlbmVyYXRpb24gPSArK3RoaXMuX3Nlc3Npb25Jbml0aWFsaXphdGlvbkdlbmVyYXRpb247XG5cdFx0XHRcdC8vIEV2ZXJ5IHNvY2tldCBvcGVuLCBpbmNsdWRpbmcgcmVjb25uZWN0cywgZ2V0cyBhIGZ1bGwgdGltZW91dCB3aW5kb3dcblx0XHRcdFx0Ly8gY292ZXJpbmcgdm9pY2UgaW5zdHJ1Y3Rpb25zLCBtaWMgd2FybS11cCwgYW5kIHRoZSBzZXNzaW9uIGNvbW1hbmQuXG5cdFx0XHRcdHRoaXMuX2FybUNvbm5lY3RXYXRjaGRvZygpO1xuXHRcdFx0XHRjb25zdCBwYkN0eCA9IHRoaXMudHRzUGxheWJhY2tTZXJ2aWNlLmVuc3VyZUNvbnRleHQod2luZG93KTtcblx0XHRcdFx0cGJDdHgucmVzdW1lKCk7XG5cblx0XHRcdFx0Y29uc3QgaXNSZXN1bWluZyA9IHRoaXMudm9pY2VDbGllbnRTZXJ2aWNlLmlzUmVzdW1pbmc7XG5cblx0XHRcdFx0Ly8gLS0tIFRlbGVtZXRyeTogc2Vzc2lvbi9jb25uZWN0IC0tLVxuXHRcdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0XHRjb25zdCBjb25uZWN0TXMgPSB0aGlzLl90ZWxlbWV0cnlDb25uZWN0U3RhcnRNcyA/IG5vdyAtIHRoaXMuX3RlbGVtZXRyeUNvbm5lY3RTdGFydE1zIDogMDtcblx0XHRcdFx0aWYgKHRoaXMuX3RlbGVtZXRyeUZpcnN0Q29ubmVjdCkge1xuXHRcdFx0XHRcdHRoaXMuX3RlbGVtZXRyeUZpcnN0Q29ubmVjdCA9IGZhbHNlO1xuXHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFZvaWNlRmlyc3RDb25uZWN0RXZlbnQsIFZvaWNlRmlyc3RDb25uZWN0Q2xhc3NpZmljYXRpb24+KCd2b2ljZUZpcnN0Q29ubmVjdCcsIHsgdGltZVRvQ29ubmVjdE1zOiBjb25uZWN0TXMgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGlzUmVzdW1pbmcpIHtcblx0XHRcdFx0XHR0aGlzLl90ZWxlbWV0cnlSZWNvbm5lY3RDb3VudCsrO1xuXHRcdFx0XHRcdGNvbnN0IHNlY1NpbmNlTGFzdCA9IHRoaXMuX3RlbGVtZXRyeUxhc3RDb25uZWN0TXMgPyBNYXRoLnJvdW5kKChub3cgLSB0aGlzLl90ZWxlbWV0cnlMYXN0Q29ubmVjdE1zKSAvIDEwMDApIDogMDtcblx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxWb2ljZVJlY29ubmVjdEV2ZW50LCBWb2ljZVJlY29ubmVjdENsYXNzaWZpY2F0aW9uPigndm9pY2VSZWNvbm5lY3QnLCB7IHRpbWVTaW5jZUxhc3RDb25uZWN0U2VjOiBzZWNTaW5jZUxhc3QgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2Vzc2lvbkluZGV4Kys7XG5cdFx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2Vzc2lvblN0YXJ0ID0gbm93O1xuXHRcdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVR1cm5Db3VudCA9IDA7XG5cdFx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5UmVjb25uZWN0Q291bnQgPSAwO1xuXHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFZvaWNlU2Vzc2lvblN0YXJ0ZWRFdmVudCwgVm9pY2VTZXNzaW9uU3RhcnRlZENsYXNzaWZpY2F0aW9uPigndm9pY2VTZXNzaW9uU3RhcnRlZCcsIHsgc2Vzc2lvbkluZGV4OiB0aGlzLl90ZWxlbWV0cnlTZXNzaW9uSW5kZXggfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5TGFzdENvbm5lY3RNcyA9IG5vdztcblx0XHRcdFx0Y29uc3Qgdm9pY2VJbnN0cnVjdGlvbnMgPSBhd2FpdCB0aGlzLnByb21wdHNTZXJ2aWNlLmdldFZvaWNlSW5zdHJ1Y3Rpb25zKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0Y29ubmVjdEF0dGVtcHRHZW5lcmF0aW9uICE9PSB0aGlzLl9jb25uZWN0QXR0ZW1wdEdlbmVyYXRpb24gfHxcblx0XHRcdFx0XHRzZXNzaW9uSW5pdGlhbGl6YXRpb25HZW5lcmF0aW9uICE9PSB0aGlzLl9zZXNzaW9uSW5pdGlhbGl6YXRpb25HZW5lcmF0aW9uIHx8XG5cdFx0XHRcdFx0IXRoaXMudm9pY2VDbGllbnRTZXJ2aWNlLmlzQ29ubmVjdGVkIHx8XG5cdFx0XHRcdFx0KCF0aGlzLl9pc0Nvbm5lY3RpbmcuZ2V0KCkgJiYgIXRoaXMuX2lzUmVjb25uZWN0aW5nLmdldCgpKVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGlzUmVzdW1pbmcpIHtcblx0XHRcdFx0XHR0aGlzLm1pY0NhcHR1cmVTZXJ2aWNlLnN0b3BDYXB0dXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5taWNDYXB0dXJlU2VydmljZS5wcmVwYXJlKHdpbmRvdyk7XG5cdFx0XHRcdGlmICh0aGlzLl9pc0hhbmRzRnJlZUVuYWJsZWQoKSkge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLm1pY0NhcHR1cmVTZXJ2aWNlLnN0YXJ0Q2FwdHVyZSh3aW5kb3cpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdFx0XHRjb25uZWN0QXR0ZW1wdEdlbmVyYXRpb24gIT09IHRoaXMuX2Nvbm5lY3RBdHRlbXB0R2VuZXJhdGlvbiB8fFxuXHRcdFx0XHRcdFx0XHRzZXNzaW9uSW5pdGlhbGl6YXRpb25HZW5lcmF0aW9uICE9PSB0aGlzLl9zZXNzaW9uSW5pdGlhbGl6YXRpb25HZW5lcmF0aW9uIHx8XG5cdFx0XHRcdFx0XHRcdCF0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5pc0Nvbm5lY3RlZCB8fFxuXHRcdFx0XHRcdFx0XHQoIXRoaXMuX2lzQ29ubmVjdGluZy5nZXQoKSAmJiAhdGhpcy5faXNSZWNvbm5lY3RpbmcuZ2V0KCkpXG5cdFx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1t2b2ljZV0gZmFpbGVkIHRvIHdhcm0gbWljcm9waG9uZSBjYXB0dXJlIGZvciBoYW5kcy1mcmVlIG1vZGU7IHJlc2V0dGluZyB2b2ljZSBtb2RlJywgZXJyKTtcblx0XHRcdFx0XHRcdGNvbnN0IHBlcm1pc3Npb25EZW5pZWQgPSBpc01pY3JvcGhvbmVQZXJtaXNzaW9uRGVuaWVkRXJyb3IoZXJyKTtcblx0XHRcdFx0XHRcdHRoaXMuX3Jlc2V0RmFpbGVkQ29ubmVjdGlvbighcGVybWlzc2lvbkRlbmllZCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChcblx0XHRcdFx0XHRcdGNvbm5lY3RBdHRlbXB0R2VuZXJhdGlvbiAhPT0gdGhpcy5fY29ubmVjdEF0dGVtcHRHZW5lcmF0aW9uIHx8XG5cdFx0XHRcdFx0XHRzZXNzaW9uSW5pdGlhbGl6YXRpb25HZW5lcmF0aW9uICE9PSB0aGlzLl9zZXNzaW9uSW5pdGlhbGl6YXRpb25HZW5lcmF0aW9uIHx8XG5cdFx0XHRcdFx0XHQhdGhpcy52b2ljZUNsaWVudFNlcnZpY2UuaXNDb25uZWN0ZWQgfHxcblx0XHRcdFx0XHRcdCghdGhpcy5faXNDb25uZWN0aW5nLmdldCgpICYmICF0aGlzLl9pc1JlY29ubmVjdGluZy5nZXQoKSlcblx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXNSZXN1bWluZykge1xuXHRcdFx0XHRcdHRoaXMudm9pY2VDbGllbnRTZXJ2aWNlLnNlbmRSZXN1bWVTZXNzaW9uKHRoaXMuX2J1aWxkU2Vzc2lvbkNvbnRleHQoKSwgdGhpcy5fZ2V0TWFjaGluZUlkKCksIHZvaWNlSW5zdHJ1Y3Rpb25zKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBwcmlvclRpbWVsaW5lID0gdGhpcy5fcGVuZGluZ1ByaW9yVGltZWxpbmU7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ1ByaW9yVGltZWxpbmUgPSBbXTtcblx0XHRcdFx0XHR0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5zZW5kU3RhcnRTZXNzaW9uKHRoaXMuX2J1aWxkU2Vzc2lvbkNvbnRleHQoKSwgdGhpcy5fZ2V0TWFjaGluZUlkKCksIHByaW9yVGltZWxpbmUsIHVuZGVmaW5lZCwgdm9pY2VJbnN0cnVjdGlvbnMpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2lzQ29ubmVjdGluZy5zZXQoZmFsc2UsIHR4KTtcblx0XHRcdFx0XHR0aGlzLl9pc1JlY29ubmVjdGluZy5zZXQoZmFsc2UsIHR4KTtcblx0XHRcdFx0XHR0aGlzLl9pc0Nvbm5lY3RlZC5zZXQodHJ1ZSwgdHgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Ly8gSGFuZHNoYWtlIGNvbXBsZXRlZCBcdTIwMTQgdGhlIGNvbm5lY3Qgd2F0Y2hkb2cgaXMgbm8gbG9uZ2VyIG5lZWRlZC5cblx0XHRcdFx0dGhpcy5fY29ubmVjdFdhdGNoZG9nLmNsZWFyKCk7XG5cblx0XHRcdFx0Ly8gU2VlZCBwcmV2aW91cyBzZXNzaW9uIHN0YXRlcyBzbyBleGlzdGluZyBzZXNzaW9ucyBkb24ndCB0cmlnZ2VyIGZhbHNlIHRyYW5zaXRpb25zXG5cdFx0XHRcdGNvbnN0IHNlZWRlZFJlc291cmNlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHMgb2YgdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9ucy5maWx0ZXIoc3MgPT4gIXNzLmlzQXJjaGl2ZWQoKSkpIHtcblx0XHRcdFx0XHRzZWVkZWRSZXNvdXJjZXMuYWRkKHMucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24ocy5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0Y29uc3QgaW5mbyA9IG1vZGVsID8gdGhpcy5fZ2V0QWdlbnRTdGF0ZUluZm8obW9kZWwpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRTdGF0ZSA9IGluZm8/LnN0YXRlXG5cdFx0XHRcdFx0XHQ/PyAocy5zdGF0dXMgPT09IEFnZW50U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzID8gJ3RoaW5raW5nJ1xuXHRcdFx0XHRcdFx0XHQ6IHMuc3RhdHVzID09PSBBZ2VudFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCA/ICd3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24nXG5cdFx0XHRcdFx0XHRcdFx0OiBzLnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCA/ICdpZGxlJ1xuXHRcdFx0XHRcdFx0XHRcdFx0OiAndW5rbm93bicpO1xuXHRcdFx0XHRcdGlmIChjdXJyZW50U3RhdGUgIT09ICd1bmtub3duJykge1xuXHRcdFx0XHRcdFx0dGhpcy5fcHJldlNlc3Npb25TdGF0ZXMuc2V0KHMucmVzb3VyY2UudG9TdHJpbmcoKSwgeyBzdGF0ZTogY3VycmVudFN0YXRlLCBkZXRhaWw6IGluZm8/LmRldGFpbCA/PyAnJywgcGVuZGluZ0lkOiBjdXJyZW50U3RhdGUgPT09ICd3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24nID8gdGhpcy5fcGVuZGluZ0lkRm9yKHMucmVzb3VyY2UudG9TdHJpbmcoKSkgOiAnJywgY29uZmlybWF0aW9uVHlwZTogaW5mbz8uY29uZmlybWF0aW9uX3R5cGUsIGxhc3RSZXNwb25zZVN1bW1hcnk6IGluZm8/Lmxhc3RfcmVzcG9uc2Vfc3VtbWFyeSA/PyAnJyB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQWxzbyBzZWVkIHJlZ3VsYXIgY2hhdCBzZXNzaW9ucyBzbyB0aGUgYXV0b3J1biBkb2Vzbid0IHRyaWdnZXIgZmFsc2UgdHJhbnNpdGlvbnNcblx0XHRcdFx0Zm9yIChjb25zdCBjaGF0TW9kZWwgb2YgdGhpcy5jaGF0U2VydmljZS5jaGF0TW9kZWxzLmdldCgpKSB7XG5cdFx0XHRcdFx0Y29uc3Qga2V5ID0gY2hhdE1vZGVsLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0XHRcdGlmIChzZWVkZWRSZXNvdXJjZXMuaGFzKGtleSkpIHsgY29udGludWU7IH1cblx0XHRcdFx0XHRpZiAoY2hhdE1vZGVsLmdldFJlcXVlc3RzKCkubGVuZ3RoID09PSAwKSB7IGNvbnRpbnVlOyB9XG5cdFx0XHRcdFx0Y29uc3QgaW5mbyA9IHRoaXMuX2dldEFnZW50U3RhdGVJbmZvKGNoYXRNb2RlbCk7XG5cdFx0XHRcdFx0aWYgKGluZm8uc3RhdGUgIT09ICd1bmtub3duJykge1xuXHRcdFx0XHRcdFx0dGhpcy5fcHJldlNlc3Npb25TdGF0ZXMuc2V0KGtleSwgeyBzdGF0ZTogaW5mby5zdGF0ZSwgZGV0YWlsOiBpbmZvLmRldGFpbCA/PyAnJywgcGVuZGluZ0lkOiBpbmZvLnN0YXRlID09PSAnd2FpdGluZ19mb3JfY29uZmlybWF0aW9uJyA/IHRoaXMuX3BlbmRpbmdJZEZvcihrZXkpIDogJycsIGNvbmZpcm1hdGlvblR5cGU6IGluZm8uY29uZmlybWF0aW9uX3R5cGUsIGxhc3RSZXNwb25zZVN1bW1hcnk6IGluZm8ubGFzdF9yZXNwb25zZV9zdW1tYXJ5ID8/ICcnIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlYWN0aXZlIHNlc3Npb24gY29udGV4dCBhdXRvcnVuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25DaGFuZ2VMaXN0ZW5lciA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwub25EaWRDaGFuZ2VTZXNzaW9ucygoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gQ2hlY2sgc3RhdGUgY2hhbmdlcyBmaXJzdCBzbyBhbnkgZGVmZXJyZWQgaWRsZSBuYXJyYXRpb24gaXNcblx0XHRcdFx0XHQvLyByZWdpc3RlcmVkIChhbmQgcHJlbWF0dXJlIGlkbGUgc3VwcHJlc3NlZCkgYmVmb3JlIHdlIGZsdXNoXG5cdFx0XHRcdFx0Ly8gdGhlIHNlc3Npb24gY29udGV4dCB0byB0aGUgYmFja2VuZC5cblx0XHRcdFx0XHR0aGlzLl9jaGVja1Nlc3Npb25TdGF0ZUNoYW5nZXMoKTtcblx0XHRcdFx0XHR0aGlzLl9zZW5kQ29udGV4dCgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgYXV0b3J1bkRpc3Bvc2FibGUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgYWdlbnRTZXNzaW9ucyA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwuc2Vzc2lvbnMuZmlsdGVyKHMgPT4gIXMuaXNBcmNoaXZlZCgpKTtcblx0XHRcdFx0XHRsZXQgbmVlZHNSZWNoZWNrID0gZmFsc2U7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdGVDaGFuZ2VzOiB7IHNlc3Npb25JZDogc3RyaW5nOyBjdXJyZW50U3RhdGU6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgZGV0YWlsPzogc3RyaW5nOyBjb25maXJtYXRpb25UeXBlPzogVm9pY2VDb25maXJtYXRpb25UeXBlOyBsYXN0UmVzcG9uc2VTdW1tYXJ5Pzogc3RyaW5nOyBmcm9tU3RhdGU6IHN0cmluZzsgZnJvbURldGFpbDogc3RyaW5nOyBmcm9tQ29uZmlybWF0aW9uVHlwZT86IFZvaWNlQ29uZmlybWF0aW9uVHlwZTsgZnJvbVJlc3BvbnNlU3VtbWFyeTogc3RyaW5nOyBwZW5kaW5nSWQ6IHN0cmluZzsgZnJvbVBlbmRpbmdJZDogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdFx0XHRcdGNvbnN0IHdhaXRpbmdGb3JDb25maXJtYXRpb25TZXNzaW9uczogeyBzZXNzaW9uSWQ6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgZGV0YWlsPzogc3RyaW5nOyB0cmFuc2l0aW9uOiBib29sZWFuIH1bXSA9IFtdO1xuXHRcdFx0XHRcdGNvbnN0IHByb2Nlc3NlZFJlc291cmNlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0XHRcdFx0Ly8gLS0tIEhlbHBlcjogc3Vic2NyaWJlIHRvIGEgY2hhdCBtb2RlbCdzIG9ic2VydmFibGVzIGFuZCBkZXRlY3Qgc3RhdGUgY2hhbmdlcyAtLS1cblx0XHRcdFx0XHRjb25zdCBwcm9jZXNzTW9kZWwgPSAobW9kZWw6IElDaGF0TW9kZWwsIHJlc291cmNlOiBVUkksIGxhYmVsOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHNlc3Npb25JZCA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0XHRjb25zdCBsYXN0UmVxID0gbW9kZWwubGFzdFJlcXVlc3RPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdFx0aWYgKGxhc3RSZXE/LnJlc3BvbnNlKSB7XG5cdFx0XHRcdFx0XHRcdGxhc3RSZXEucmVzcG9uc2UuaXNJbmNvbXBsZXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcGVuZGluZyA9IGxhc3RSZXEucmVzcG9uc2UuaXNQZW5kaW5nQ29uZmlybWF0aW9uLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0XHRcdFx0XHRjb25zdCBjb25maXJtYXRpb25UeXBlID0gZ2V0Vm9pY2VDb25maXJtYXRpb25UeXBlKGxhc3RSZXEucmVzcG9uc2UucmVzcG9uc2UudmFsdWUpO1xuXHRcdFx0XHRcdFx0XHRpZiAocGVuZGluZyAmJiBjb25maXJtYXRpb25UeXBlID09PSAndG9vbCcgJiYgdGhpcy5fYXV0b0FwcHJvdmVkU2Vzc2lvbnMuaGFzKHNlc3Npb25JZCkpIHtcblx0XHRcdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgbGFzdFJlcS5yZXNwb25zZS5yZXNwb25zZS52YWx1ZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAoSUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aChwYXJ0IGFzIElDaGF0VG9vbEludm9jYXRpb24sIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRuZWVkc1JlY2hlY2sgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0Ly8gQWx3YXlzIHN1YnNjcmliZSB0byByZXNwb25zZSBjaGFuZ2VzIHNvIHRoZSBhdXRvcnVuXG5cdFx0XHRcdFx0XHRcdC8vIHJlLWZpcmVzIHdoZW4gdG9vbCBwYXJ0cyBjaGFuZ2UgKG5ldyBjb25maXJtYXRpb25zLFxuXHRcdFx0XHRcdFx0XHQvLyBxdWVzdGlvbnMgYWRkZWQsIG9yIGV4aXN0aW5nIG9uZXMgcmVzb2x2ZWQpLiBXaXRob3V0XG5cdFx0XHRcdFx0XHRcdC8vIHRoaXMsIGEgcGVuZGluZ1x1MjE5MnBlbmRpbmcgZGV0YWlsIGNoYW5nZSBpcyBpbnZpc2libGUuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlc3BvbnNlU2lnbmFsID0gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudChsYXN0UmVxLnJlc3BvbnNlLCBsYXN0UmVxLnJlc3BvbnNlLm9uRGlkQ2hhbmdlKTtcblx0XHRcdFx0XHRcdFx0cmVzcG9uc2VTaWduYWwucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBEZXRlY3Qgc3RhdGUgY2hhbmdlc1xuXHRcdFx0XHRcdFx0Y29uc3QgaW5mbyA9IHRoaXMuX2dldEFnZW50U3RhdGVJbmZvKG1vZGVsKTtcblx0XHRcdFx0XHRcdC8vIEhvbGQgYSBzdW1tYXJ5LWxlc3MgaWRsZSB3aGlsZSBhbiBlYWdlciByZWxvYWQgaXMgc3RpbGxcblx0XHRcdFx0XHRcdC8vIHJlcGxheWluZyB0aGlzIHNlc3Npb24ncyByZXNwb25zZSAoc2VlIF9lZmZlY3RpdmVSZXNpZGVudFN0YXRlKSxcblx0XHRcdFx0XHRcdC8vIHNvIHRoZSBpZGxlIHRyYW5zaXRpb24gaXNuJ3QgY29uc3VtZWQgYmVmb3JlIHRoZSBzdW1tYXJ5XG5cdFx0XHRcdFx0XHQvLyBleGlzdHMuIE9uY2Ugd2Ugc3RvcCBob2xkaW5nLCB0aGUgbW9kZWwgaXMgcmVzaWRlbnQgd2l0aCBhXG5cdFx0XHRcdFx0XHQvLyBwcm9wZXIgc3VtbWFyeSwgc28gZHJvcCB0aGUgcGVuZGluZyBpZGxlIGRlZmVycmFsLlxuXHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudFN0YXRlID0gdGhpcy5fZWZmZWN0aXZlUmVzaWRlbnRTdGF0ZShzZXNzaW9uSWQsIGluZm8pO1xuXHRcdFx0XHRcdFx0aWYgKGN1cnJlbnRTdGF0ZSA9PT0gaW5mby5zdGF0ZSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nSWRsZU5hcnJhdGlvbi5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IGRldGFpbCA9IGluZm8uZGV0YWlsO1xuXHRcdFx0XHRcdFx0Y29uc3QgY29uZmlybWF0aW9uVHlwZSA9IGluZm8uY29uZmlybWF0aW9uX3R5cGU7XG5cdFx0XHRcdFx0XHRjb25zdCBsYXN0UmVzcG9uc2VTdW1tYXJ5ID0gaW5mby5sYXN0X3Jlc3BvbnNlX3N1bW1hcnk7XG5cdFx0XHRcdFx0XHQvLyBDYXB0dXJlIHRoZSBzdW1tYXJ5IHdoaWxlIHRoZSBtb2RlbCBpcyByZXNpZGVudCBzbyBhIGxhdGVyXG5cdFx0XHRcdFx0XHQvLyBjb21wbGV0aW9uIHJlcG9ydGVkIGFmdGVyIGRpc3Bvc2FsIGNhbiBzdGlsbCBuYXJyYXRlLlxuXHRcdFx0XHRcdFx0dGhpcy5fY2FjaGVSZXNwb25zZVN1bW1hcnkoc2Vzc2lvbklkLCBpbmZvLnN0YXRlLCBsYXN0UmVzcG9uc2VTdW1tYXJ5KTtcblxuXHRcdFx0XHRcdFx0Y29uc3QgcHJldiA9IHRoaXMuX3ByZXZTZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uSWQpO1xuXHRcdFx0XHRcdFx0Y29uc3Qgbm9ybWFsaXplZFN1bW1hcnkgPSBsYXN0UmVzcG9uc2VTdW1tYXJ5ID8/ICcnO1xuXHRcdFx0XHRcdFx0Y29uc3QgaXNTdGF0ZVRyYW5zaXRpb24gPSBwcmV2ICE9PSB1bmRlZmluZWQgJiYgcHJldi5zdGF0ZSAhPT0gY3VycmVudFN0YXRlICYmIGN1cnJlbnRTdGF0ZSAhPT0gJ3Vua25vd24nO1xuXHRcdFx0XHRcdFx0Ly8gYGRldGFpbGAgaXMgcHJvc2UgLSBmb3IgYSBxdWVzdGlvbiBmb3JtIGl0IGlzIGp1c3QgdGhlIHRpdGxlcywgc29cblx0XHRcdFx0XHRcdC8vIGEgc2Vjb25kIGZvcm0gYXNraW5nIHRoZSBzYW1lIHRoaW5ncyBsb29rcyBpZGVudGljYWwuIFRoZSBwZW5kaW5nXG5cdFx0XHRcdFx0XHQvLyBpZCBuYW1lcyB0aGUgb2NjdXJyZW5jZSwgYW5kIGlzIHdoYXQgbWFrZXMgcmVwbGFjaW5nIG9uZSBmb3JtXG5cdFx0XHRcdFx0XHQvLyB3aXRoIGFub3RoZXIgYSB0cmFuc2l0aW9uIHdvcnRoIG5hcnJhdGluZy5cblx0XHRcdFx0XHRcdGNvbnN0IHBlbmRpbmdJZCA9IGN1cnJlbnRTdGF0ZSA9PT0gJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicgPyB0aGlzLl9wZW5kaW5nSWRGb3Ioc2Vzc2lvbklkKSA6ICcnO1xuXHRcdFx0XHRcdFx0Y29uc3QgaXNEZXRhaWxUcmFuc2l0aW9uID0gIWlzU3RhdGVUcmFuc2l0aW9uICYmIHByZXYgIT09IHVuZGVmaW5lZCAmJiBjdXJyZW50U3RhdGUgPT09ICd3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24nXG5cdFx0XHRcdFx0XHRcdCYmICgoZGV0YWlsID8/ICcnKSAhPT0gcHJldi5kZXRhaWwgfHwgcGVuZGluZ0lkICE9PSBwcmV2LnBlbmRpbmdJZCB8fCBjb25maXJtYXRpb25UeXBlICE9PSBwcmV2LmNvbmZpcm1hdGlvblR5cGUpO1xuXHRcdFx0XHRcdFx0Ly8gQSBjb21wbGV0ZWQgcmVwbHkncyBzdW1tYXJ5IG9mdGVuIGxhbmRzIEFGVEVSIHRoZSBpZGxlXG5cdFx0XHRcdFx0XHQvLyB0cmFuc2l0aW9uIChvciB1cGRhdGVzIHdoaWxlIHN0aWxsIGlkbGUpOyB0aGUgbW9kZWwgc3RheXNcblx0XHRcdFx0XHRcdC8vIGlkbGUgc28gbm8gc3RhdGUgdHJhbnNpdGlvbiBmaXJlcy4gRGV0ZWN0IHRoZSBzdW1tYXJ5XG5cdFx0XHRcdFx0XHQvLyBiZWNvbWluZyBhdmFpbGFibGUvY2hhbmdpbmcgYXMgaXRzIG93biBuYXJyYXRhYmxlIHRyYW5zaXRpb24sXG5cdFx0XHRcdFx0XHQvLyBtaXJyb3JpbmcgdGhlIGNvbmZpcm1hdGlvbiBkZXRhaWwgdHJhbnNpdGlvbiBhYm92ZSAtIGJ1dCBPTkxZXG5cdFx0XHRcdFx0XHQvLyBmb3IgYSBzZXNzaW9uIHRoYXQgYWN0dWFsbHkgcmFuIHRoaXMgbGlmZXRpbWUgKHNlZVxuXHRcdFx0XHRcdFx0Ly8gX3Nlc3Npb25zQXdhaXRpbmdSZXNwb25zZVN1bW1hcnkpLCBzbyBhbiBvbGQgc3VtbWFyeSBzdXJmYWNpbmdcblx0XHRcdFx0XHRcdC8vIGZyb20gYSByZWh5ZHJhdGVkIGRvcm1hbnQgbW9kZWwgaXNuJ3QgbWlzdGFrZW4gZm9yIGEgbmV3IHJlcGx5LlxuXHRcdFx0XHRcdFx0Y29uc3QgaXNSZXNwb25zZVN1bW1hcnlUcmFuc2l0aW9uID0gIWlzU3RhdGVUcmFuc2l0aW9uICYmIHByZXYgIT09IHVuZGVmaW5lZCAmJiBjdXJyZW50U3RhdGUgPT09ICdpZGxlJyAmJiAhIW5vcm1hbGl6ZWRTdW1tYXJ5ICYmIG5vcm1hbGl6ZWRTdW1tYXJ5ICE9PSBwcmV2Lmxhc3RSZXNwb25zZVN1bW1hcnkgJiYgdGhpcy5fc2Vzc2lvbnNBd2FpdGluZ1Jlc3BvbnNlU3VtbWFyeS5oYXMoc2Vzc2lvbklkKTtcblx0XHRcdFx0XHRcdGNvbnN0IGlzVHJhbnNpdGlvbiA9IGlzU3RhdGVUcmFuc2l0aW9uIHx8IGlzRGV0YWlsVHJhbnNpdGlvbiB8fCBpc1Jlc3BvbnNlU3VtbWFyeVRyYW5zaXRpb247XG5cdFx0XHRcdFx0XHRpZiAoaXNUcmFuc2l0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBhdXRvcnVuIHRyYW5zaXRpb24gaWQ9JHtzZXNzaW9uSWQuc2xpY2UoLTMyKX0gJHtwcmV2Py5zdGF0ZX1cdTIxOTIke2N1cnJlbnRTdGF0ZX0gZGV0YWlsQ2hhbmdlZD0ke2lzRGV0YWlsVHJhbnNpdGlvbn0gc3VtbWFyeUNoYW5nZWQ9JHtpc1Jlc3BvbnNlU3VtbWFyeVRyYW5zaXRpb259IGhhc0RldGFpbD0keyEhZGV0YWlsfWApO1xuXHRcdFx0XHRcdFx0XHQvLyBBIG5ldyB0dXJuIHN1cGVyc2VkZXMgcHJpb3IgbmFycmF0aW9uOyBjbGVhciBkZWR1cCBoZXJlIChiZWZvcmUgY29hbGVzY2luZyBjb2xsYXBzZXMgYSBmYXN0IGlkbGVcdTIxOTJ0aGlua2luZ1x1MjE5MmlkbGUgdG8gbmV0LXplcm8pLCBza2lwcGluZyBlYWdlci1yZWxvYWQgd29iYmxlLiBBcm0gdGhlIGF3YWl0aW5nLXN1bW1hcnkgbWFya2VyIHNvIHRoaXMgcnVuJ3MgY29tcGxldGlvbiAod2hlbmV2ZXIgaXRzIHN1bW1hcnkgbGFuZHMpIGlzIHJlY29nbml6ZWQgYXMgbmV3LlxuXHRcdFx0XHRcdFx0XHRpZiAoY3VycmVudFN0YXRlID09PSAndGhpbmtpbmcnICYmICF0aGlzLl9lYWdlck1vZGVsTG9hZGluZy5oYXMoc2Vzc2lvbklkKSkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2NsZWFyTGFzdE5hcnJhdGVkVGV4dChzZXNzaW9uSWQpO1xuXHRcdFx0XHRcdFx0XHRcdC8vIEEgbmV3IHR1cm4gYWxzbyBzdXBlcnNlZGVzIGFueSBuYXJyYXRpb24gZGVmZXJyZWQgZnJvbSB0aGVcblx0XHRcdFx0XHRcdFx0XHQvLyBwcmV2aW91cyB0dXJuLiBDbGVhciBpdCBoZXJlIGluIHRoZSBpbW1lZGlhdGUgcGF0aCBiZWNhdXNlXG5cdFx0XHRcdFx0XHRcdFx0Ly8gY29hbGVzY2luZyBjYW4gY29sbGFwc2UgYW4gaWRsZVx1MjE5MnRoaW5raW5nXHUyMTkyaWRsZSBidXJzdCB0b1xuXHRcdFx0XHRcdFx0XHRcdC8vIG5ldC16ZXJvLCBzbyBfaGFuZGxlTmFycmF0YWJsZVN0YXRlQ2hhbmdlIG5ldmVyIHNlZXMgdGhlXG5cdFx0XHRcdFx0XHRcdFx0Ly8gYHRoaW5raW5nYCBhbmQgd291bGQgb3RoZXJ3aXNlIGxlYXZlIHRoZSBzdGFsZSBlbnRyeSBiZWhpbmQuXG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fY2xlYXJEZWZlcnJlZCh0aGlzLl9zZXNzaW9uS2V5KHNlc3Npb25JZCkpO1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25zQXdhaXRpbmdSZXNwb25zZVN1bW1hcnkuYWRkKHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Ly8gVGhlIGNvbXBsZXRpb24gZm9yIHRoaXMgcnVuIGhhcyBiZWVuIGFjY2VwdGVkOyBjb25zdW1lIHRoZSBtYXJrZXIgc28gYSBsYXRlciByZWh5ZHJhdGlvbiBvZiB0aGUgc2FtZSBzdW1tYXJ5IGNhbid0IHJlLWZpcmUuXG5cdFx0XHRcdFx0XHRcdGlmIChjdXJyZW50U3RhdGUgPT09ICdpZGxlJyAmJiAhIW5vcm1hbGl6ZWRTdW1tYXJ5KSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fc2Vzc2lvbnNBd2FpdGluZ1Jlc3BvbnNlU3VtbWFyeS5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRjb25zdCBjYW5jZWxFeHBpcnkgPSB0aGlzLl91c2VyQ2FuY2VsbGVkU2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0XHRcdGlmIChjYW5jZWxFeHBpcnkpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFt2b2ljZV0gYXV0b3J1biBzd2FsbG93aW5nIHRyYW5zaXRpb24gKHVzZXItY2FuY2VsbGVkKSBpZD0ke3Nlc3Npb25JZC5zbGljZSgtMzIpfWApO1xuXHRcdFx0XHRcdFx0XHRcdGNsZWFyVGltZW91dChjYW5jZWxFeHBpcnkpO1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX3VzZXJDYW5jZWxsZWRTZXNzaW9ucy5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRzdGF0ZUNoYW5nZXMucHVzaCh7IHNlc3Npb25JZCwgY3VycmVudFN0YXRlLCBsYWJlbCwgZGV0YWlsLCBjb25maXJtYXRpb25UeXBlLCBsYXN0UmVzcG9uc2VTdW1tYXJ5LCBmcm9tU3RhdGU6IHByZXY/LnN0YXRlID8/IGN1cnJlbnRTdGF0ZSwgZnJvbURldGFpbDogcHJldj8uZGV0YWlsID8/ICcnLCBmcm9tQ29uZmlybWF0aW9uVHlwZTogcHJldj8uY29uZmlybWF0aW9uVHlwZSwgZnJvbVJlc3BvbnNlU3VtbWFyeTogcHJldj8ubGFzdFJlc3BvbnNlU3VtbWFyeSA/PyAnJywgcGVuZGluZ0lkLCBmcm9tUGVuZGluZ0lkOiBwcmV2Py5wZW5kaW5nSWQgPz8gJycgfSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChjdXJyZW50U3RhdGUgIT09ICd1bmtub3duJykge1xuXHRcdFx0XHRcdFx0XHQvLyBQcmVzZXJ2ZSBhIGtub3duIHN1bW1hcnkgcmF0aGVyIHRoYW4gY2xvYmJlcmluZyBpdCB3aXRoICcnXG5cdFx0XHRcdFx0XHRcdC8vIHNvIGEgbW9kZWwgdW5sb2FkXHUyMTkycmVsb2FkIGNhbid0IG1hbnVmYWN0dXJlIGFuICcnXHUyMTkyb2xkLXN1bW1hcnlcblx0XHRcdFx0XHRcdFx0Ly8gXCJ0cmFuc2l0aW9uXCIgdGhhdCBsb29rcyBsaWtlIGEgZnJlc2ggcmVwbHkuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlbWVtYmVyZWRTdW1tYXJ5ID0gbm9ybWFsaXplZFN1bW1hcnkgfHwgdGhpcy5fbGFzdFJlc3BvbnNlU3VtbWFyeUJ5SWQuZ2V0KHNlc3Npb25JZCkgfHwgcHJldj8ubGFzdFJlc3BvbnNlU3VtbWFyeSB8fCAnJztcblx0XHRcdFx0XHRcdFx0dGhpcy5fcHJldlNlc3Npb25TdGF0ZXMuc2V0KHNlc3Npb25JZCwgeyBzdGF0ZTogY3VycmVudFN0YXRlLCBkZXRhaWw6IGRldGFpbCA/PyAnJywgcGVuZGluZ0lkLCBjb25maXJtYXRpb25UeXBlLCBsYXN0UmVzcG9uc2VTdW1tYXJ5OiByZW1lbWJlcmVkU3VtbWFyeSB9KTtcblx0XHRcdFx0XHRcdFx0Ly8gTGVhdmluZyB3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24gcmVsZWFzZXMgdGhlIHBlci1vY2N1cnJlbmNlXG5cdFx0XHRcdFx0XHRcdC8vIG5hcnJhdGlvbiBtYXJrZXIsIHNvIHRoZSBuZXh0IGNvbmZpcm1hdGlvbiAtIGV2ZW4gd2l0aFxuXHRcdFx0XHRcdFx0XHQvLyBpZGVudGljYWwgdGV4dCAtIGlzIG5hcnJhdGVkIGFmcmVzaCBvbiBmb2N1cy5cblx0XHRcdFx0XHRcdFx0aWYgKGN1cnJlbnRTdGF0ZSAhPT0gJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9uYXJyYXRlZFBlbmRpbmcuZGVsZXRlKHRoaXMuX3Nlc3Npb25LZXkoc2Vzc2lvbklkKSk7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gVGhlIGNvbmZpcm1hdGlvbiB3YXMganVzdCBhbnN3ZXJlZCAoQWxsb3cvRGVueS9hdXRvKTpcblx0XHRcdFx0XHRcdFx0XHQvLyBzdG9wIHJlYWRpbmcgdGhlIG5vdy1zdGFsZSBhcHByb3ZhbCByZXF1ZXN0IGFsb3VkLlxuXHRcdFx0XHRcdFx0XHRcdGlmIChwcmV2Py5zdGF0ZSA9PT0gJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuX3N0b3BQZW5kaW5nTmFycmF0aW9uKHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHByZXYgIT09IHVuZGVmaW5lZCAmJiBwZW5kaW5nSWQgIT09IHByZXYucGVuZGluZ0lkKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gT25lIHBlbmRpbmcgaXRlbSByZXBsYWNlZCBhbm90aGVyIHdpdGhvdXQgdGhlIHNlc3Npb24gZXZlclxuXHRcdFx0XHRcdFx0XHRcdC8vIGxlYXZpbmcgd2FpdGluZ19mb3JfY29uZmlybWF0aW9uLiBUaGF0IGlzIGEgbmV3IG9jY3VycmVuY2U6XG5cdFx0XHRcdFx0XHRcdFx0Ly8gcmVsZWFzZSB0aGUgaGVhcmQgbWFya2VyIHNvIGl0IG5hcnJhdGVzLCBhbmQgc3RvcCBzcGVha2luZ1xuXHRcdFx0XHRcdFx0XHRcdC8vIHRoZSBvbmUgaXQgcmVwbGFjZWQuXG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fbmFycmF0ZWRQZW5kaW5nLmRlbGV0ZSh0aGlzLl9zZXNzaW9uS2V5KHNlc3Npb25JZCkpO1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX3N0b3BQZW5kaW5nTmFycmF0aW9uKHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKGN1cnJlbnRTdGF0ZSA9PT0gJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicpIHtcblx0XHRcdFx0XHRcdFx0d2FpdGluZ0ZvckNvbmZpcm1hdGlvblNlc3Npb25zLnB1c2goeyBzZXNzaW9uSWQsIGxhYmVsLCBkZXRhaWwsIHRyYW5zaXRpb246IGlzVHJhbnNpdGlvbiB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0Ly8gLS0tIFByb2Nlc3MgYWdlbnQgc2Vzc2lvbnMgLS0tXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzIG9mIGFnZW50U2Vzc2lvbnMpIHtcblx0XHRcdFx0XHRcdHByb2Nlc3NlZFJlc291cmNlcy5hZGQocy5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKHMucmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdFx0XHRcdHByb2Nlc3NNb2RlbChtb2RlbCwgcy5yZXNvdXJjZSwgcy5sYWJlbCB8fCAnVW50aXRsZWQgc2Vzc2lvbicpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly8gTm8gbW9kZWwgbG9hZGVkIFx1MjAxNCBmYWxsIGJhY2sgdG8gYWdlbnQgc2Vzc2lvbiBzdGF0dXNcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gcy5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjdXJyZW50U3RhdGUgPSBzLnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MgPyAndGhpbmtpbmcnXG5cdFx0XHRcdFx0XHRcdFx0OiBzLnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQgPyAnd2FpdGluZ19mb3JfY29uZmlybWF0aW9uJ1xuXHRcdFx0XHRcdFx0XHRcdFx0OiBzLnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCA/ICdpZGxlJ1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQ6ICd1bmtub3duJztcblx0XHRcdFx0XHRcdFx0Ly8gQSBuZXcgdHVybiAodGhpbmtpbmcpIHN1cGVyc2VkZXMgYW55IGNhY2hlZCBzdW1tYXJ5IGV2ZW5cblx0XHRcdFx0XHRcdFx0Ly8gd2l0aG91dCBhIHJlc2lkZW50IG1vZGVsLCBzbyBhIGxhdGVyIGNvbXBsZXRpb24gbmV2ZXJcblx0XHRcdFx0XHRcdFx0Ly8gbmFycmF0ZXMgdGhlIHByZXZpb3VzIHJlcGx5LlxuXHRcdFx0XHRcdFx0XHR0aGlzLl9jYWNoZVJlc3BvbnNlU3VtbWFyeShzZXNzaW9uSWQsIGN1cnJlbnRTdGF0ZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdFx0aWYgKHMuc3RhdHVzID09PSBBZ2VudFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2Vuc3VyZU1vZGVsTG9hZGVkKHMucmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0Y29uc3QgcHJldiA9IHRoaXMuX3ByZXZTZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uSWQpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBpc1N0YXRlVHJhbnNpdGlvbiA9IHByZXYgIT09IHVuZGVmaW5lZCAmJiBwcmV2LnN0YXRlICE9PSBjdXJyZW50U3RhdGUgJiYgY3VycmVudFN0YXRlICE9PSAndW5rbm93bic7XG5cblx0XHRcdFx0XHRcdFx0Ly8gQXJtIHRoZSBhd2FpdGluZy1zdW1tYXJ5IG1hcmtlciBvbiBhIGdlbnVpbmUgbmV3IHR1cm4gc28gdGhlXG5cdFx0XHRcdFx0XHRcdC8vIGNvbXBsZXRpb24gZGV0ZWN0ZWQgb25jZSB0aGUgbW9kZWwgbG9hZHMgY291bnRzIGFzIG5ldy5cblx0XHRcdFx0XHRcdFx0aWYgKGlzU3RhdGVUcmFuc2l0aW9uICYmIGN1cnJlbnRTdGF0ZSA9PT0gJ3RoaW5raW5nJykge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25zQXdhaXRpbmdSZXNwb25zZVN1bW1hcnkuYWRkKHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHQvLyBMZWF2aW5nIHdhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbiBmb3IgYW4gdW5sb2FkZWQgcmVtb3RlXG5cdFx0XHRcdFx0XHRcdC8vIHNlc3Npb246IHN0b3AgdGhlIG5vdy1zdGFsZSBhcHByb3ZhbCBuYXJyYXRpb24gYW5kIHJlbGVhc2Vcblx0XHRcdFx0XHRcdFx0Ly8gdGhlIHBlci1vY2N1cnJlbmNlIG1hcmtlciBIRVJFLCBiZWZvcmUgdGhlIGlkbGUgYnJhbmNoJ3Ncblx0XHRcdFx0XHRcdFx0Ly8gZWFybHktZXhpdCBgY29udGludWVgcyBiZWxvdywgd2hpY2ggd291bGQgb3RoZXJ3aXNlIHNraXAgaXRcblx0XHRcdFx0XHRcdFx0Ly8gYW5kIGxldCB0aGUgcmVzb2x2ZWQgYXBwcm92YWwga2VlcCBwbGF5aW5nLlxuXHRcdFx0XHRcdFx0XHRpZiAocHJldj8uc3RhdGUgPT09ICd3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24nICYmIGN1cnJlbnRTdGF0ZSAhPT0gJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicgJiYgY3VycmVudFN0YXRlICE9PSAndW5rbm93bicpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9uYXJyYXRlZFBlbmRpbmcuZGVsZXRlKHRoaXMuX3Nlc3Npb25LZXkoc2Vzc2lvbklkKSk7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fc3RvcFBlbmRpbmdOYXJyYXRpb24oc2Vzc2lvbklkKTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdC8vIFJlbW90ZS9Db3BpbG90IHNlc3Npb25zIGRvbid0IGtlZXAgdGhlaXIgbW9kZWwgcmVzaWRlbnQsIHNvIGFcblx0XHRcdFx0XHRcdFx0Ly8gY29hcnNlIGBgaWRsZWBgIHRyYW5zaXRpb24gd291bGQgY2Fycnkgbm8gbGFzdF9yZXNwb25zZV9zdW1tYXJ5XG5cdFx0XHRcdFx0XHRcdC8vIGFuZCB0aGUgYmFja2VuZCB3b3VsZCBuYXJyYXRlIGFuIGVtcHR5IGNvbXBsZXRpb24uIElmIHdlXG5cdFx0XHRcdFx0XHRcdC8vIGNhcHR1cmVkIHRoZSBzdW1tYXJ5IHdoaWxlIHRoZSBtb2RlbCB3YXMgcmVzaWRlbnQsIG5hcnJhdGVcblx0XHRcdFx0XHRcdFx0Ly8gbm93IHVzaW5nIHRoZSBjYWNoZS4gT3RoZXJ3aXNlIGRlZmVyOiBlYWdlcmx5IGxvYWQgdGhlIG1vZGVsXG5cdFx0XHRcdFx0XHRcdC8vIGFuZCBsZXQgdGhlIGF1dG9ydW4gcmUtZmlyZSB3aXRoIHRoZSBzdW1tYXJ5IG9uY2UgaXQgcmVzb2x2ZXNcblx0XHRcdFx0XHRcdFx0Ly8gKGRvIG5vdCByZWNvcmQgdGhlIGlkbGUgc3RhdGUgeWV0IHNvIHRoZSB0cmFuc2l0aW9uIGlzIHN0aWxsXG5cdFx0XHRcdFx0XHRcdC8vIGRldGVjdGVkIGFmdGVyIHRoZSBtb2RlbCBsb2FkcykuXG5cdFx0XHRcdFx0XHRcdGlmIChpc1N0YXRlVHJhbnNpdGlvbiAmJiBjdXJyZW50U3RhdGUgPT09ICdpZGxlJykge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGNhY2hlZFN1bW1hcnkgPSB0aGlzLl9sYXN0UmVzcG9uc2VTdW1tYXJ5QnlJZC5nZXQoc2Vzc2lvbklkKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAoIWNhY2hlZFN1bW1hcnkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuX2RlZmVySWRsZU5hcnJhdGlvblVudGlsTW9kZWxMb2FkZWQocy5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fc2Vzc2lvbnNBd2FpdGluZ1Jlc3BvbnNlU3VtbWFyeS5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAoIXRoaXMuX3VzZXJDYW5jZWxsZWRTZXNzaW9ucy5oYXMoc2Vzc2lvbklkKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0c3RhdGVDaGFuZ2VzLnB1c2goeyBzZXNzaW9uSWQsIGN1cnJlbnRTdGF0ZSwgbGFiZWw6IHMubGFiZWwgfHwgJ1VudGl0bGVkIHNlc3Npb24nLCBsYXN0UmVzcG9uc2VTdW1tYXJ5OiBjYWNoZWRTdW1tYXJ5LCBmcm9tU3RhdGU6IHByZXY/LnN0YXRlID8/IGN1cnJlbnRTdGF0ZSwgZnJvbURldGFpbDogcHJldj8uZGV0YWlsID8/ICcnLCBmcm9tQ29uZmlybWF0aW9uVHlwZTogcHJldj8uY29uZmlybWF0aW9uVHlwZSwgZnJvbVJlc3BvbnNlU3VtbWFyeTogcHJldj8ubGFzdFJlc3BvbnNlU3VtbWFyeSA/PyAnJywgcGVuZGluZ0lkOiAnJywgZnJvbVBlbmRpbmdJZDogcHJldj8ucGVuZGluZ0lkID8/ICcnIH0pO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9wcmV2U2Vzc2lvblN0YXRlcy5zZXQoc2Vzc2lvbklkLCB7IHN0YXRlOiBjdXJyZW50U3RhdGUsIGRldGFpbDogJycsIHBlbmRpbmdJZDogJycsIGxhc3RSZXNwb25zZVN1bW1hcnk6IGNhY2hlZFN1bW1hcnkgPz8gJycgfSk7XG5cdFx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRpZiAoaXNTdGF0ZVRyYW5zaXRpb24pIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBjYW5jZWxFeHBpcnkgPSB0aGlzLl91c2VyQ2FuY2VsbGVkU2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGNhbmNlbEV4cGlyeSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KGNhbmNlbEV4cGlyeSk7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl91c2VyQ2FuY2VsbGVkU2Vzc2lvbnMuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdHN0YXRlQ2hhbmdlcy5wdXNoKHsgc2Vzc2lvbklkLCBjdXJyZW50U3RhdGUsIGxhYmVsOiBzLmxhYmVsIHx8ICdVbnRpdGxlZCBzZXNzaW9uJywgZnJvbVN0YXRlOiBwcmV2Py5zdGF0ZSA/PyBjdXJyZW50U3RhdGUsIGZyb21EZXRhaWw6IHByZXY/LmRldGFpbCA/PyAnJywgZnJvbUNvbmZpcm1hdGlvblR5cGU6IHByZXY/LmNvbmZpcm1hdGlvblR5cGUsIGZyb21SZXNwb25zZVN1bW1hcnk6IHByZXY/Lmxhc3RSZXNwb25zZVN1bW1hcnkgPz8gJycsIHBlbmRpbmdJZDogJycsIGZyb21QZW5kaW5nSWQ6IHByZXY/LnBlbmRpbmdJZCA/PyAnJyB9KTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKGN1cnJlbnRTdGF0ZSAhPT0gJ3Vua25vd24nKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gUHJlc2VydmUgYSBrbm93biBzdW1tYXJ5IHJhdGhlciB0aGFuIGNsb2JiZXJpbmcgd2l0aCAnJ1xuXHRcdFx0XHRcdFx0XHRcdC8vIChhIGxhdGVyIHJlbG9hZCBvZiB0aGUgc2FtZSBzdW1tYXJ5IG11c3Qgbm90IGxvb2sgbmV3KS5cblx0XHRcdFx0XHRcdFx0XHRjb25zdCByZW1lbWJlcmVkU3VtbWFyeSA9IHRoaXMuX2xhc3RSZXNwb25zZVN1bW1hcnlCeUlkLmdldChzZXNzaW9uSWQpIHx8IHByZXY/Lmxhc3RSZXNwb25zZVN1bW1hcnkgfHwgJyc7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fcHJldlNlc3Npb25TdGF0ZXMuc2V0KHNlc3Npb25JZCwgeyBzdGF0ZTogY3VycmVudFN0YXRlLCBkZXRhaWw6ICcnLCBwZW5kaW5nSWQ6ICcnLCBsYXN0UmVzcG9uc2VTdW1tYXJ5OiByZW1lbWJlcmVkU3VtbWFyeSB9KTtcblx0XHRcdFx0XHRcdFx0XHQvLyBNaXJyb3IgdGhlIHJlc2lkZW50IHBhdGg6IGRyb3AgdGhlIGNvbmZpcm1hdGlvbi1vY2N1cnJlbmNlXG5cdFx0XHRcdFx0XHRcdFx0Ly8gbWFya2VyIG9uY2UgdGhpcyBzZXNzaW9uIGlzIG5vIGxvbmdlciBhd2FpdGluZyBjb25maXJtYXRpb24uXG5cdFx0XHRcdFx0XHRcdFx0aWYgKGN1cnJlbnRTdGF0ZSAhPT0gJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuX25hcnJhdGVkUGVuZGluZy5kZWxldGUodGhpcy5fc2Vzc2lvbktleShzZXNzaW9uSWQpKTtcblx0XHRcdFx0XHRcdFx0XHRcdC8vIFRoZSB3YWl0aW5nXHUyMTkybm9uLXdhaXRpbmcgY29uZmlybWF0aW9uIHN0b3AgYWxyZWFkeSByYW5cblx0XHRcdFx0XHRcdFx0XHRcdC8vIGFib3ZlIChiZWZvcmUgdGhlIGlkbGUgZWFybHktZXhpdHMpLCBzbyBpdCBpc24ndFxuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gcmVwZWF0ZWQgaGVyZS5cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKGN1cnJlbnRTdGF0ZSA9PT0gJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicpIHtcblx0XHRcdFx0XHRcdFx0XHR3YWl0aW5nRm9yQ29uZmlybWF0aW9uU2Vzc2lvbnMucHVzaCh7IHNlc3Npb25JZCwgbGFiZWw6IHMubGFiZWwgfHwgJ1VudGl0bGVkIHNlc3Npb24nLCBkZXRhaWw6IHVuZGVmaW5lZCwgdHJhbnNpdGlvbjogaXNTdGF0ZVRyYW5zaXRpb24gfSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyAtLS0gUHJvY2VzcyByZWd1bGFyIChub24tYWdlbnQpIGNoYXQgc2Vzc2lvbnMgcmVhY3RpdmVseSAtLS1cblx0XHRcdFx0XHRmb3IgKGNvbnN0IGNoYXRNb2RlbCBvZiB0aGlzLmNoYXRTZXJ2aWNlLmNoYXRNb2RlbHMucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBrZXkgPSBjaGF0TW9kZWwuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0XHRpZiAocHJvY2Vzc2VkUmVzb3VyY2VzLmhhcyhrZXkpKSB7IGNvbnRpbnVlOyB9XG5cdFx0XHRcdFx0XHRpZiAoY2hhdE1vZGVsLmdldFJlcXVlc3RzKCkubGVuZ3RoID09PSAwKSB7IGNvbnRpbnVlOyB9XG5cdFx0XHRcdFx0XHRwcm9jZXNzZWRSZXNvdXJjZXMuYWRkKGtleSk7XG5cdFx0XHRcdFx0XHRwcm9jZXNzTW9kZWwoY2hhdE1vZGVsLCBjaGF0TW9kZWwuc2Vzc2lvblJlc291cmNlLCBjaGF0TW9kZWwudGl0bGUgfHwgJ0NoYXQnKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAobmVlZHNSZWNoZWNrKSB7XG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMuX2F1dG9BcHByb3ZlQ2hlY2soKSwgNTAwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gRXZpY3QgcGVyLXNlc3Npb24gY2FjaGVzIGZvciBzZXNzaW9ucyB0aGF0IGFyZSBubyBsb25nZXIgdHJhY2tlZFxuXHRcdFx0XHRcdC8vIChhcmNoaXZlZC9yZW1vdmVkL2Rpc3Bvc2VkKSwgc28gbG9uZy1saXZlZCB2b2ljZSBjb25uZWN0aW9ucyBkb24ndFxuXHRcdFx0XHRcdC8vIHJldGFpbiBzdW1tYXJpZXMgb3Igc3RhdGUgZm9yIHNlc3Npb25zIHRoYXQgd2lsbCBuZXZlciBiZSBuYXJyYXRlZC5cblx0XHRcdFx0XHR0aGlzLl9wcnVuZVNlc3Npb25DYWNoZXMocHJvY2Vzc2VkUmVzb3VyY2VzKTtcblx0XHRcdFx0XHQvLyBDb250ZXh0IHRyYWNrcyBwZXItc2Vzc2lvbiBzdGF0ZSBvbmx5OyBpdCBpcyBOTyBMT05HRVIgYSBuYXJyYXRpb24gdHJpZ2dlciAoYmFja2VuZCBzcGVha3Mgc29sZWx5IG9uIGByZXF1ZXN0X25hcnJhdGlvbmApLiBTdGlsbCBjb2FsZXNjZSBzbyBzaGlwcGVkIGNvbnRleHQgcmVmbGVjdHMgdGhlIHNldHRsZWQgc3RhdGUuXG5cdFx0XHRcdFx0aWYgKHN0YXRlQ2hhbmdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHQvLyBDb2FsZXNjZSByYXBpZCB0cmFuc2l0aW9ucyBpbnRvIGEgc2luZ2xlIHNldHRsZWQgZW1pc3Npb25cblx0XHRcdFx0XHRcdC8vIChzZWUgX3BlbmRpbmdTdGF0ZUNoYW5nZXMpLiBCdWZmZXIgdGhlIGxhdGVzdCBjaGFuZ2UgcGVyXG5cdFx0XHRcdFx0XHQvLyBzZXNzaW9uIChwcmVzZXJ2aW5nIHRoZSBidXJzdCdzIGJhc2VsaW5lIHNvIGEgbmV0LXplcm9cblx0XHRcdFx0XHRcdC8vIHdvYmJsZSBpcyByZWNvZ25pemVkKSBhbmQgKHJlKWFybSB0aGUgc2V0dGxlIHRpbWVyOyB0aGVcblx0XHRcdFx0XHRcdC8vIGZsdXNoLCBjYWNoZSBpbnZhbGlkYXRpb24gYW5kIHRpbWVsaW5lIHBlcnNpc3QgYWxsIGhhcHBlblxuXHRcdFx0XHRcdFx0Ly8gb25jZSB0aGUgc3Rvcm0gc2V0dGxlcywgaW4gX2VtaXRQZW5kaW5nU3RhdGVDaGFuZ2VzKCkuXG5cdFx0XHRcdFx0XHQvL1xuXHRcdFx0XHRcdFx0Ly8gRGVsaWJlcmF0ZWx5IGRvIE5PVCBgX3NlbmRDb250ZXh0KClgIGhlcmU6IHN0YWdpbmcgdGhlXG5cdFx0XHRcdFx0XHQvLyBpbnRlcm1lZGlhdGUgKGdsaXRjaGluZykgc3RhdGUgaW50byB0aGUgc2hhcmVkIHBlbmRpbmdcblx0XHRcdFx0XHRcdC8vIGNvbnRleHQgd291bGQgbGV0IGEgYGZsdXNoU2Vzc2lvbkNvbnRleHQoKWAgZHVyaW5nIHRoZVxuXHRcdFx0XHRcdFx0Ly8gc2V0dGxlIHdpbmRvdyAoZS5nLiBfYWN0aXZhdGVTaG93blNlc3Npb24pIHNoaXAgdGhlIHdvYmJsZVxuXHRcdFx0XHRcdFx0Ly8gYW5kIGJ5cGFzcyBjb2FsZXNjaW5nLlxuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2Ygc3RhdGVDaGFuZ2VzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fcGVuZGluZ1N0YXRlQ2hhbmdlcy5nZXQoY2hhbmdlLnNlc3Npb25JZCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdTdGF0ZUNoYW5nZXMuc2V0KGNoYW5nZS5zZXNzaW9uSWQsIGV4aXN0aW5nXG5cdFx0XHRcdFx0XHRcdFx0PyB7IC4uLmNoYW5nZSwgZnJvbVN0YXRlOiBleGlzdGluZy5mcm9tU3RhdGUsIGZyb21EZXRhaWw6IGV4aXN0aW5nLmZyb21EZXRhaWwsIGZyb21Db25maXJtYXRpb25UeXBlOiBleGlzdGluZy5mcm9tQ29uZmlybWF0aW9uVHlwZSwgZnJvbVJlc3BvbnNlU3VtbWFyeTogZXhpc3RpbmcuZnJvbVJlc3BvbnNlU3VtbWFyeSwgZnJvbVBlbmRpbmdJZDogZXhpc3RpbmcuZnJvbVBlbmRpbmdJZCB9XG5cdFx0XHRcdFx0XHRcdFx0OiBjaGFuZ2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dGhpcy5fc2NoZWR1bGVTdGF0ZUNoYW5nZUVtaXQoKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2VuZENvbnRleHQoKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBBcm0gYSBwYXJhbm9pZCByZS1mbHVzaCB3YXRjaGRvZyBmb3IgYW55IHNlc3Npb24gY3VycmVudGx5XG5cdFx0XHRcdFx0Ly8gYXdhaXRpbmcgY29uZmlybWF0aW9uLiBJZiB0aGUgaW1tZWRpYXRlIGZsdXNoIGFib3ZlIGlzXG5cdFx0XHRcdFx0Ly8gc29tZWhvdyBub3QgcGlja2VkIHVwIGJ5IHRoZSBCRSAocmFjZSwgZGVib3VuY2UgaGljY3VwKSxcblx0XHRcdFx0XHQvLyBhIHNlY29uZCBmbHVzaCB+MS41cyBsYXRlciBndWFyYW50ZWVzIHRoZSBzdGF0ZSBzaGlwcy5cblx0XHRcdFx0XHQvLyBUaGUgbWVyZ2UtcGF0Y2ggaW4gX3NlbmREZWx0YSBzaG9ydC1jaXJjdWl0cyB3aGVuIG5vXG5cdFx0XHRcdFx0Ly8gZmllbGRzIGNoYW5nZWQsIHNvIHJlLW5hcnJhdGlvbiBpcyBpbXBvc3NpYmxlLlxuXHRcdFx0XHRcdGZvciAoY29uc3QgdyBvZiB3YWl0aW5nRm9yQ29uZmlybWF0aW9uU2Vzc2lvbnMpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2FybUNvbmZpcm1hdGlvbkZsdXNoV2F0Y2hkb2cody5zZXNzaW9uSWQsIHcubGFiZWwsIHcudHJhbnNpdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIENsZWFyIHdhdGNoZG9ncyBmb3Igc2Vzc2lvbnMgdGhhdCBhcmUgbm8gbG9uZ2VyIGF3YWl0aW5nIGNvbmZpcm1hdGlvblxuXHRcdFx0XHRcdGNvbnN0IHN0aWxsV2FpdGluZyA9IG5ldyBTZXQod2FpdGluZ0ZvckNvbmZpcm1hdGlvblNlc3Npb25zLm1hcCh3ID0+IHcuc2Vzc2lvbklkKSk7XG5cdFx0XHRcdFx0Ly8gS2VlcCB0aGUgc2Vzc2lvbnMtbGlzdCBwZW5kaW5nIGluZGljYXRvciBpbiBzeW5jIHdpdGggdGhlIHNldFxuXHRcdFx0XHRcdC8vIG9mIHNlc3Npb25zIGF3YWl0aW5nIGNvbmZpcm1hdGlvbiB3aGlsZSB1bmZvY3VzZWQuXG5cdFx0XHRcdFx0dGhpcy5fcmVjb25jaWxlQ29uZmlybWF0aW9uSW5kaWNhdG9ycyhzdGlsbFdhaXRpbmcpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgaWQgb2YgWy4uLnRoaXMuX2NvbmZpcm1hdGlvbkZsdXNoV2F0Y2hkb2dzLmtleXMoKV0pIHtcblx0XHRcdFx0XHRcdGlmICghc3RpbGxXYWl0aW5nLmhhcyhpZCkpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgdCA9IHRoaXMuX2NvbmZpcm1hdGlvbkZsdXNoV2F0Y2hkb2dzLmdldChpZCk7XG5cdFx0XHRcdFx0XHRcdGlmICh0KSB7IGNsZWFyVGltZW91dCh0KTsgfVxuXHRcdFx0XHRcdFx0XHR0aGlzLl9jb25maXJtYXRpb25GbHVzaFdhdGNoZG9ncy5kZWxldGUoaWQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBSZWxlYXNlIGVhZ2VybHktbG9hZGVkIG1vZGVsIHJlZnMgZm9yIHNlc3Npb25zIG5vIGxvbmdlciBhd2FpdGluZyBpbnB1dFxuXHRcdFx0XHRcdGZvciAoY29uc3QgaWQgb2YgWy4uLnRoaXMuX2VhZ2VyTW9kZWxSZWZzLmtleXMoKV0pIHtcblx0XHRcdFx0XHRcdGlmICghc3RpbGxXYWl0aW5nLmhhcyhpZCkpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fZWFnZXJNb2RlbFJlZnMuZ2V0KGlkKSEuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9lYWdlck1vZGVsUmVmcy5kZWxldGUoaWQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdC8vIFBlcmlvZGljIGZhbGxiYWNrOiBjaGVjayBzZXNzaW9uIHN0YXRlIGNoYW5nZXMgZXZlcnkgNXNcblx0XHRcdFx0Ly8gdG8gY2F0Y2ggdHJhbnNpdGlvbnMgbWlzc2VkIHdoZW4gdGhlIGNoYXQgbW9kZWwgaXNuJ3QgbG9hZGVkXG5cdFx0XHRcdC8vIChlLmcuIHJlbW90ZSBhZ2VudCBob3N0IHNlc3Npb25zIHRoYXQgaGF2ZW4ndCBiZWVuIG9wZW5lZCkuXG5cdFx0XHRcdGNvbnN0IGNvbm5lY3Rpb25EaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0Y29ubmVjdGlvbkRpc3Bvc2FibGVzLmFkZChzZXNzaW9uQ2hhbmdlTGlzdGVuZXIpO1xuXHRcdFx0XHRjb25uZWN0aW9uRGlzcG9zYWJsZXMuYWRkKGF1dG9ydW5EaXNwb3NhYmxlKTtcblx0XHRcdFx0Y29ubmVjdGlvbkRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwodGhpcy5fd2luZG93ISwgKCkgPT4gdGhpcy5fY2hlY2tTZXNzaW9uU3RhdGVDaGFuZ2VzKCksIDUwMDApKTtcblx0XHRcdFx0dGhpcy5fdm9pY2VBdXRvcnVuRGlzcG9zYWJsZS52YWx1ZSA9IGNvbm5lY3Rpb25EaXNwb3NhYmxlcztcblxuXHRcdFx0XHR0aGlzLm1pY0NhcHR1cmVTZXJ2aWNlLmlzTXV0ZWQgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fc3RhdHVzVGV4dC5zZXQoJ0hvbGQgdG8gc3BlYWsuLi4nLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzLl92b2ljZVN0YXRlLnNldCgnaWRsZScsIHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Ly8gV2FpdCBmb3IgdGhlIGJhY2tlbmQgc2Vzc2lvbiBhY2sgYmVmb3JlIG9wZW5pbmcgdGhlIGhhbmRzLWZyZWUgUFRUIHR1cm4uXG5cdFx0XHRcdHRoaXMuX2VudGVyTGlzdGVuT25TZXNzaW9uSW5pdCA9IHRoaXMuX3Nob3VsZEVudGVyTGlzdGVuT25TZXNzaW9uSW5pdChpc1Jlc3VtaW5nKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIGNvbm5lY3RlZDogaXNSZXN1bWluZz0ke2lzUmVzdW1pbmd9IGhhbmRzRnJlZT0ke3RoaXMuX2lzSGFuZHNGcmVlRW5hYmxlZCgpfSBhcm1MaXN0ZW49JHt0aGlzLl9lbnRlckxpc3Rlbk9uU2Vzc2lvbkluaXR9YCk7XG5cdFx0XHRcdGlmICh0aGlzLl9lbnRlckxpc3Rlbk9uU2Vzc2lvbkluaXQpIHtcblx0XHRcdFx0XHR0aGlzLl92b2ljZUV2ZW50RGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLl9lbnRlckxpc3Rlbk9uU2Vzc2lvbkluaXQgJiYgdGhpcy5faXNDb25uZWN0ZWQuZ2V0KCkpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbdm9pY2VdIHNlc3Npb25faW5pdCBub3Qgc2VlbiB3aXRoaW4gNzUwbXM7IGVudGVyaW5nIGxpc3RlbmluZyB2aWEgZmFsbGJhY2snKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fZW50ZXJMaXN0ZW5PblNlc3Npb25Jbml0ID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2VudGVyQXV0b0xpc3RlbignY29ubmVjdCcpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sIDc1MCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uSW5pdGlhbGl6YXRpb25HZW5lcmF0aW9uKys7XG5cdFx0XHRcdGlmICh0aGlzLl9mYXRhbERpc2Nvbm5lY3QpIHtcblx0XHRcdFx0XHQvLyBUZXJtaW5hbCBjbG9zZSBhbHJlYWR5IGhhbmRsZWQgYnkgX2hhbmRsZUZhdGFsRGlzY29ubmVjdDogc3RheSBpblxuXHRcdFx0XHRcdC8vIHRoZSBjbGVhbiwgcmVzdGFydGFibGUgc3RhdGUgYW5kIGRvIE5PVCBlbnRlciB0aGUgcmVjb25uZWN0IHBhdGhcblx0XHRcdFx0XHQvLyAod2hpY2ggd291bGQgc3RyYW5kIHRoZSBVSSBvbiBcIlJlY29ubmVjdGluZy4uLlwiIHdpdGggbm8gcmVjb25uZWN0KS5cblx0XHRcdFx0fSBlbHNlIGlmICghdGhpcy52b2ljZUNsaWVudFNlcnZpY2Uud2lsbFJlY29ubmVjdCkge1xuXHRcdFx0XHRcdHRoaXMuZGlzY29ubmVjdCgpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2lzQ29ubmVjdGVkLmdldCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25Db25uZWN0aW9uTG9zdCgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIEEgdHJhbnNpZW50IHNvY2tldCBkcm9wIGludmFsaWRhdGVzIHRoZSBpbi1mbGlnaHQgd2FybS11cC4gS2VlcFxuXHRcdFx0XHRcdC8vIHRoZSBjb250cm9sbGVyIGFybWVkIGZvciB0aGUgc2VydmljZSdzIGFscmVhZHktc2NoZWR1bGVkIHJldHJ5LlxuXHRcdFx0XHRcdHRoaXMubWljQ2FwdHVyZVNlcnZpY2Uuc3RvcENhcHR1cmUoKTtcblx0XHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9pc0Nvbm5lY3Rpbmcuc2V0KGZhbHNlLCB0eCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9pc1JlY29ubmVjdGluZy5zZXQodHJ1ZSwgdHgpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRoaXMuX3ZvaWNlU3RhdGUuc2V0KCdpZGxlJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR0aGlzLl9zdGF0dXNUZXh0LnNldCgnUmVjb25uZWN0aW5nLi4uJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFNlc3Npb24gcmVhZHk6IHRoZSBiYWNrZW5kIGhhcyBhY2tlZCBzdGFydF9zZXNzaW9uLiBUaGlzIGlzIHRoZVxuXHRcdC8vIHBvaW50IGF0IHdoaWNoIHRoZSBtaWMvaGFuZHNoYWtlIGlzIHNldHRsZWQgYW5kIGEgdHVybiB3aWxsIHN0aWNrLFxuXHRcdC8vIHNvIGVudGVyIGhhbmRzLWZyZWUgbGlzdGVuaW5nIGhlcmUgKGFybWVkIGluIHRoZSBjb25uZWN0IGhhbmRsZXIpLlxuXHRcdHRoaXMuX3ZvaWNlRXZlbnREaXNwb3NhYmxlcy5hZGQodGhpcy52b2ljZUNsaWVudFNlcnZpY2Uub25TZXNzaW9uSW5pdCgoKSA9PiB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFt2b2ljZV0gc2Vzc2lvbl9pbml0IHJlY2VpdmVkOyBhcm1MaXN0ZW49JHt0aGlzLl9lbnRlckxpc3Rlbk9uU2Vzc2lvbkluaXR9IHBlbmRpbmdSZXRyaWVzPSR7dGhpcy5fcGVuZGluZ05hcnJhdGlvblJldHJpZXMuc2l6ZX0gZGVmZXJyZWROYXJyYXRpb25zPSR7dGhpcy5fZGVmZXJyZWROYXJyYXRpb25zLnNpemV9YCk7XG5cdFx0XHQvLyBSZXBsYXkgYW55IG5hcnJhdGlvbiB0aGF0IHdhcyBkcm9wcGVkIGJlY2F1c2UgdGhlIHNvY2tldCB3YXMgY2xvc2VkXG5cdFx0XHQvLyAoc2VlIF9uYXJyYXRlKS4gRG8gdGhpcyBCRUZPUkUgZW50ZXJpbmcgbGlzdGVuaW5nOiBhIHJlYWwgcGVuZGluZ1xuXHRcdFx0Ly8gbmFycmF0aW9uIHNob3VsZCBwbGF5IG5vdyAoaXRzIHBsYXliYWNrIGRyaXZlcyByZS1saXN0ZW4pIHJhdGhlclxuXHRcdFx0Ly8gdGhhbiBiZWluZyB0b3JuIGRvd24gcmlnaHQgYWZ0ZXIgd2Ugc3RhcnQgbGlzdGVuaW5nLiBPbiBhIG5vcm1hbFxuXHRcdFx0Ly8gZmlyc3QgY29ubmVjdCB0aGVyZSBhcmUgbm8gcGVuZGluZyByZXRyaWVzLCBzbyBsaXN0ZW5pbmcgaXMgZW50ZXJlZFxuXHRcdFx0Ly8gYXMgdXN1YWwuXG5cdFx0XHRsZXQgbmFycmF0ZWQgPSBmYWxzZTtcblx0XHRcdGlmICh0aGlzLl9wZW5kaW5nTmFycmF0aW9uUmV0cmllcy5zaXplID4gMCkge1xuXHRcdFx0XHRjb25zdCByZXRyaWVzID0gWy4uLnRoaXMuX3BlbmRpbmdOYXJyYXRpb25SZXRyaWVzLmVudHJpZXMoKV07XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdOYXJyYXRpb25SZXRyaWVzLmNsZWFyKCk7XG5cdFx0XHRcdGZvciAoY29uc3QgW3Nlc3Npb25JZCwgaXRlbV0gb2YgcmV0cmllcykge1xuXHRcdFx0XHRcdG5hcnJhdGVkID0gdGhpcy5fcmV0cnlQZW5kaW5nTmFycmF0aW9uKHNlc3Npb25JZCwgaXRlbSkgfHwgbmFycmF0ZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIFRoZSBgbmFycmF0aW9uX3VuYmxvY2tlZGAgbnVkZ2Ugd2FzIGxvc3Qgd2l0aCB0aGUgZHJvcHBlZCBzb2NrZXQsIHNvXG5cdFx0XHQvLyBhbHNvIHJlcGxheSBhbnl0aGluZyBzdGlsbCBkZWZlcnJlZDsgYF9yZXRyeURlZmVycmVkTmFycmF0aW9uYFxuXHRcdFx0Ly8gcmV2YWxpZGF0ZXMgYW5kIHJldXNlcyB0aGUgaWQgc28gYWxyZWFkeS1zcG9rZW4gaXRlbXMgYXJlbid0IHJlLXN5bnRoZXNpc2VkLlxuXHRcdFx0aWYgKHRoaXMuX2RlZmVycmVkTmFycmF0aW9ucy5zaXplID4gMCkge1xuXHRcdFx0XHRjb25zdCBkZWZlcnJlZEtleXMgPSBbLi4udGhpcy5fZGVmZXJyZWROYXJyYXRpb25zLmtleXMoKV07XG5cdFx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbktleSBvZiBkZWZlcnJlZEtleXMpIHtcblx0XHRcdFx0XHRuYXJyYXRlZCA9IHRoaXMuX3JldHJ5RGVmZXJyZWROYXJyYXRpb24oc2Vzc2lvbktleSkgfHwgbmFycmF0ZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9lbnRlckxpc3Rlbk9uU2Vzc2lvbkluaXQgJiYgIW5hcnJhdGVkKSB7XG5cdFx0XHRcdHRoaXMuX2VudGVyTGlzdGVuT25TZXNzaW9uSW5pdCA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLl9lbnRlckF1dG9MaXN0ZW4oJ2Nvbm5lY3QnKTtcblx0XHRcdH0gZWxzZSBpZiAobmFycmF0ZWQpIHtcblx0XHRcdFx0dGhpcy5fZW50ZXJMaXN0ZW5PblNlc3Npb25Jbml0ID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fdm9pY2VFdmVudERpc3Bvc2FibGVzLmFkZCh0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5vbkJhcmdlSW4oZSA9PiB0aGlzLl9oYW5kbGVCYXJnZUluKGUpKSk7XG5cblx0XHQvLyBOQUNLICsgY2xpZW50LXJldmFsaWRhdGlvbiBwcm90b2NvbCBmb3IgY2xpZW50LWRyaXZlbiBuYXJyYXRpb24uXG5cdFx0dGhpcy5fdm9pY2VFdmVudERpc3Bvc2FibGVzLmFkZCh0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5vbk5hcnJhdGlvbkFjayhlID0+IHtcblx0XHRcdHRoaXMuX2hhbmRsZU5hcnJhdGlvbkFjayhlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fdm9pY2VFdmVudERpc3Bvc2FibGVzLmFkZCh0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5vbk5hcnJhdGlvblVuYmxvY2tlZChlID0+IHtcblx0XHRcdHRoaXMuX3JldHJ5RGVmZXJyZWROYXJyYXRpb24odGhpcy5fc2Vzc2lvbktleShlLmNvZGluZ1Nlc3Npb25JZCksIGUubmFycmF0aW9uSWQgfHwgdW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fdm9pY2VFdmVudERpc3Bvc2FibGVzLmFkZCh0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5vbk5hcnJhdGlvbkludGVycnVwdGVkKGUgPT4ge1xuXHRcdFx0dGhpcy5faGFuZGxlTmFycmF0aW9uSW50ZXJydXB0ZWQoZSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU3BlZWNoIHN0YXJ0ZWQgXHUyMTkyIHN0b3AgVFRTLCBzdXBwcmVzcyBsYXRlIGNodW5rcyBmcm9tIHRoZSBwcmV2aW91cyB0dXJuXG5cdFx0Ly8gKHNhbWUgZmxvdyBhcyBwdHREb3duLCBidXQgZm9yIHNlcnZlci1WQUQgcGF0aCkuXG5cdFx0dGhpcy5fdm9pY2VFdmVudERpc3Bvc2FibGVzLmFkZCh0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5vblNwZWVjaFN0YXJ0ZWQoZXZlbnQgPT4ge1xuXHRcdFx0dGhpcy5fY2xlYXJBdXRvTGlzdGVuVGltZXIoKTtcblx0XHRcdHRoaXMuX2ludGVycnVwdEFzc2lzdGFudFBsYXliYWNrKCk7XG5cdFx0XHRjb25zdCB0dXJuSWQgPSBldmVudC50dXJuSWQgfHwgdGhpcy5fcHR0Q3VycmVudFR1cm5JZDtcblx0XHRcdGlmICh0dXJuSWQgJiYgdGhpcy5fdHJhbnNjcmlwdGlvblR1cm5TdGF0ZT8udHVybklkICE9PSB0dXJuSWQpIHtcblx0XHRcdFx0dGhpcy5fYmVnaW5UcmFuc2NyaXB0aW9uVHVybih0dXJuSWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc3RhcnRVc2VyVHVybigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEJhY2tlbmQgZW5kZWQgdGhlIGhlbGQgdHVybiBpdHNlbGYgKHNlcnZlciBWQUQgc2lsZW5jZSAvIHN0b3AgcGhyYXNlKS5cblx0XHQvLyBUcmVhdCBpdCBsaWtlIGEgbG9jYWwgcHR0X2VuZCBcdTIwMTQgc3RvcCBjYXB0dXJlLCBtb3ZlIHRvIHByb2Nlc3NpbmcgXHUyMDE0IGJ1dFxuXHRcdC8vIGRvIE5PVCBzZW5kIG91ciBvd24gcHR0X2VuZC4gR3VhcmQgYWdhaW5zdCBkb3VibGUtZW5kaW5nOiBpZ25vcmUgaWYgd2Vcblx0XHQvLyBhbHJlYWR5IHJlbGVhc2VkIGxvY2FsbHksIG9yIGlmIHRoZSBpZCBpcyBmb3IgYSBkaWZmZXJlbnQgdHVybi5cblx0XHR0aGlzLl92b2ljZUV2ZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMudm9pY2VDbGllbnRTZXJ2aWNlLm9uVHVybkF1dG9FbmRlZChlID0+IHRoaXMuX2hhbmRsZVR1cm5BdXRvRW5kZWQoZSkpKTtcblxuXHRcdC8vIFRyYW5zY3JpcHRpb24gXHUyMDE0IG11dGF0ZSB0aGUgY3VycmVudCB1c2VyIHR1cm4gYXQgdGhlIHRhaWwgb2YgdGhlIGJ1ZmZlci5cblx0XHQvLyBXZSBETyBOT1Qgc2VuZCB0aGUgdHJhbnNjcmlwdCB0byBjaGF0IGhlcmUuIFRoZSBiYWNrZW5kIHZvaWNlIExMTVxuXHRcdC8vIGRlY2lkZXMgd2hldGhlciB0aGUgdXR0ZXJhbmNlIGlzIGEgdGFzayBmb3IgdGhlIGNvZGluZyBhZ2VudCAoXHUyMTkyIGVtaXRzXG5cdFx0Ly8gYSBgc2VuZF90b19jaGF0YCB0b29sIGNhbGwsIGRpc3BhdGNoZWQgYmVsb3cpIG9yIGNoaXQtY2hhdCAvIHN0YXR1c1xuXHRcdC8vIChcdTIxOTIgcmVwbGllcyBpbiBzcGVlY2gsIG5vdGhpbmcgc2VudCB0byBjaGF0KS4gU2VuZGluZyBkaXJlY3RseSBvblxuXHRcdC8vIHRyYW5zY3JpcHRpb24gd291bGQgYnlwYXNzIHRoYXQgcm91dGluZyBkZWNpc2lvbiBhbmQgbGVhayBjaGl0LWNoYXRcblx0XHQvLyB1dHRlcmFuY2VzIGludG8gdGhlIGFjdGl2ZSBjaGF0IHNlc3Npb24uXG5cdFx0dGhpcy5fdm9pY2VFdmVudERpc3Bvc2FibGVzLmFkZCh0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5vblRyYW5zY3JpcHRpb24oZSA9PiB0aGlzLl9oYW5kbGVUcmFuc2NyaXB0aW9uKGUpKSk7XG5cblx0XHQvLyBBdWRpbyByZXNwb25zZSBcdTIxOTIgZmFkZSB0cmFuc2NyaXB0LCBxdWV1ZSBmb3Igc2VxdWVudGlhbCBwbGF5YmFja1xuXHRcdHRoaXMuX3ZvaWNlRXZlbnREaXNwb3NhYmxlcy5hZGQodGhpcy52b2ljZUNsaWVudFNlcnZpY2Uub25BdWRpb1Jlc3BvbnNlKGUgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzSW50ZXJydXB0ZWRBdWRpbyhlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzb2xpY2l0ZWROYXJyYXRpb24gPSBlLnJlc3BvbnNlSWQgPyB0aGlzLl9wZW5kaW5nU29saWNpdGVkTmFycmF0aW9ucy5nZXQoZS5yZXNwb25zZUlkKSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGVjaG9lZENoZWNrcG9pbnQ6IElWb2ljZUNoZWNrcG9pbnROYXJyYXRpb25NZXRhZGF0YSB8IHVuZGVmaW5lZCA9IGUucmVxdWVzdElkICYmIGUuY2hlY2twb2ludElkICYmIGUuc2VxdWVuY2UgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IHsgcmVxdWVzdElkOiBlLnJlcXVlc3RJZCwgY2hlY2twb2ludElkOiBlLmNoZWNrcG9pbnRJZCwgc2VxdWVuY2U6IGUuc2VxdWVuY2UgfVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IG5hcnJhdGlvbktpbmQgPSBlLm5hcnJhdGlvbktpbmQgPz8gc29saWNpdGVkTmFycmF0aW9uPy5raW5kO1xuXHRcdFx0Y29uc3QgcGxheWJhY2tOYXJyYXRpb246IElQbGF5YmFja05hcnJhdGlvbiB8IHVuZGVmaW5lZCA9IG5hcnJhdGlvbktpbmRcblx0XHRcdFx0PyB7XG5cdFx0XHRcdFx0a2luZDogbmFycmF0aW9uS2luZCxcblx0XHRcdFx0XHRjaGVja3BvaW50OiBlY2hvZWRDaGVja3BvaW50ID8/IHNvbGljaXRlZE5hcnJhdGlvbj8uY2hlY2twb2ludCxcblx0XHRcdFx0XHRwbGF5YmFja0lkOiBlLnBsYXliYWNrSWQsXG5cdFx0XHRcdH1cblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBpc0NoZWNrcG9pbnROYXJyYXRpb24gPSBwbGF5YmFja05hcnJhdGlvbj8ua2luZCA9PT0gJ2NoZWNrcG9pbnQnO1xuXHRcdFx0aWYgKGlzQ2hlY2twb2ludE5hcnJhdGlvbiAmJiBlLmlzRmluYWwpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdW2NoZWNrcG9pbnRdIHJlY2VpdmVkIG5hcnJhdGlvbl9pZD0ke2UucmVzcG9uc2VJZH0gcmVxdWVzdF9pZD0ke3BsYXliYWNrTmFycmF0aW9uLmNoZWNrcG9pbnQ/LnJlcXVlc3RJZCA/PyAnPHVua25vd24+J30gcGhhc2U9JHtwbGF5YmFja05hcnJhdGlvbi5jaGVja3BvaW50Py5jaGVja3BvaW50SWQgPz8gJzx1bmtub3duPid9IHNlcXVlbmNlPSR7cGxheWJhY2tOYXJyYXRpb24uY2hlY2twb2ludD8uc2VxdWVuY2UgPz8gMH0gcGxheWJhY2tfaWQ9JHtwbGF5YmFja05hcnJhdGlvbi5wbGF5YmFja0lkID8/ICc8bm9uZT4nfSBzcG9rZW49JHtKU09OLnN0cmluZ2lmeShlLnRyYW5zY3JpcHQgPz8gJycpfWApO1xuXHRcdFx0fVxuXHRcdFx0Ly8gTGF0ZW5jeSB0ZWxlbWV0cnk6IGZpcnN0IGF1ZGlvIGNodW5rIG1hcmtzIGVuZCBvZiB0dXJuXG5cdFx0XHRpZiAoZS5pc0ZpcnN0Q2h1bmsgJiYgdGhpcy5fdGVsZW1ldHJ5UHR0VXBNcykge1xuXHRcdFx0XHRjb25zdCB0dGZ0ID0gdGhpcy5fdGVsZW1ldHJ5Rmlyc3RUcmFuc2NyaXB0aW9uTXMgJiYgdGhpcy5fdGVsZW1ldHJ5UHR0RG93bk1zXG5cdFx0XHRcdFx0PyB0aGlzLl90ZWxlbWV0cnlGaXJzdFRyYW5zY3JpcHRpb25NcyAtIHRoaXMuX3RlbGVtZXRyeVB0dERvd25NcyA6IDA7XG5cdFx0XHRcdGNvbnN0IGUyZSA9IERhdGUubm93KCkgLSB0aGlzLl90ZWxlbWV0cnlQdHRVcE1zO1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxWb2ljZUxhdGVuY3lFdmVudCwgVm9pY2VMYXRlbmN5Q2xhc3NpZmljYXRpb24+KCd2b2ljZUxhdGVuY3knLCB7XG5cdFx0XHRcdFx0dGltZVRvRmlyc3RUcmFuc2NyaXB0aW9uTXM6IHR0ZnQsXG5cdFx0XHRcdFx0ZW5kVG9FbmRUdXJuTXM6IGUyZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVB0dFVwTXMgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBUaGUgYmFja2VuZCB0YWdzIGEgYmFja2dyb3VuZCAodW5mb2N1c2VkKSBzZXNzaW9uJ3MgYXVkaW8gd2l0aCBpdHNcblx0XHRcdC8vIGJhcmUgYmFja2VuZCBpZCwgd2hpbGUgZm9jdXMgdHJhY2tpbmcgYW5kIHRoZSBkZWZlcnJlZC1idWZmZXIga2V5c1xuXHRcdFx0Ly8gbGl2ZSBpbiB0aGUgVUkgYWdlbnQtaG9zdCByZXNvdXJjZSBzcGFjZS4gQ2Fub25pY2FsaXplIG9uY2UgaGVyZSBzbyBhXG5cdFx0XHQvLyBkZWZlcnJlZCByZXNwb25zZSdzIGJ1ZmZlciBrZXkgbWF0Y2hlcyB0aGUgcmVzb3VyY2Ugd2UgZmx1c2ggb24gZm9jdXNcblx0XHRcdC8vIChvdGhlcndpc2UgaXQgaXMgc3RyYW5kZWQgYW5kIG5ldmVyIHJlYWQpLiBVbnRhZ2dlZCAvIG5vbi1hZ2VudC1ob3N0XG5cdFx0XHQvLyBpZHMgcGFzcyB0aHJvdWdoIHVuY2hhbmdlZC5cblx0XHRcdGNvbnN0IGNvZGluZ1Nlc3Npb25JZCA9IHRoaXMuX2Nhbm9uaWNhbFNlc3Npb25JZChlLmNvZGluZ1Nlc3Npb25JZCk7XG5cdFx0XHQvLyBBIGNvbmZpcm1hdGlvbiB3YXMgcmVzb2x2ZWQgKGUuZy4gdGhlIHVzZXIgcHJlc3NlZCBBbGxvdykgd2hpbGUgaXRzXG5cdFx0XHQvLyBuYXJyYXRpb24gd2FzIHN0aWxsIGJlaW5nIHJlcXVlc3RlZC9zdHJlYW1lZDogZHJvcCB0aGUgbm93LXN0YWxlXG5cdFx0XHQvLyBhcHByb3ZhbCBuYXJyYXRpb24gc28gaXQgaXNuJ3QgcmVhZCBhbG91ZCBhZnRlciB0aGUgZmFjdC4gTWF0Y2hlZFxuXHRcdFx0Ly8gYnkgbmFycmF0aW9uIGlkLCBzbyB0aGUgYWdlbnQncyByZWFsIHJlcGx5IChhIGRpZmZlcmVudCBpZCkgaXNcblx0XHRcdC8vIHVuYWZmZWN0ZWQuIENsZWFyIHRoZSBpZCBvbmNlIGl0cyBmaW5hbCBjaHVuayBoYXMgcGFzc2VkLlxuXHRcdFx0aWYgKGUucmVzcG9uc2VJZCAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX2NhbmNlbGxlZFBlbmRpbmdOYXJyYXRpb25JZHMuaGFzKGUucmVzcG9uc2VJZCkpIHtcblx0XHRcdFx0aWYgKGUuaXNGaW5hbCkge1xuXHRcdFx0XHRcdHRoaXMuX2NhbmNlbGxlZFBlbmRpbmdOYXJyYXRpb25JZHMuZGVsZXRlKGUucmVzcG9uc2VJZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYXVkaW8pIHtcblx0XHRcdFx0dGhpcy5fbWFya1NvbGljaXRlZE5hcnJhdGlvbkF1ZGlvU3RhcnRlZChlLnJlc3BvbnNlSWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzQ2hlY2twb2ludE5hcnJhdGlvbiAmJiBzb2xpY2l0ZWROYXJyYXRpb24gJiYgZS5pc0ZpbmFsICYmICFlLmF1ZGlvICYmICFzb2xpY2l0ZWROYXJyYXRpb24uaGFzUmVjZWl2ZWRBdWRpbykge1xuXHRcdFx0XHRpZiAoZS5yZXNwb25zZUlkKSB7XG5cdFx0XHRcdFx0dGhpcy5fY2xlYXJQZW5kaW5nU29saWNpdGVkTmFycmF0aW9uKGUucmVzcG9uc2VJZCwgc29saWNpdGVkTmFycmF0aW9uKTtcblx0XHRcdFx0XHR0aGlzLl9zb2xpY2l0ZWROYXJyYXRpb25JZHMuZGVsZXRlKGUucmVzcG9uc2VJZCk7XG5cdFx0XHRcdFx0dGhpcy5fcmVzcG9uc2VSb3V0ZXMuZGVsZXRlKGUucmVzcG9uc2VJZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSWYgdGhpcyByZXNwb25zZSBpcyBmb3IgYSBzZXNzaW9uIHRoZSB1c2VyIGlzbid0IGN1cnJlbnRseSBsb29raW5nXG5cdFx0XHQvLyBhdCwgZG9uJ3QgcGxheSBpdCBub3c6IGJ1ZmZlciBpdCB1bnRpbCB0aGF0IHNlc3Npb24gaXMgZm9jdXNlZCBhbmRcblx0XHRcdC8vIG5vdGlmeSB3aXRoIGEgc2hvcnQgYXVkaW8gY3VlIGluc3RlYWQuIFdoZW4gdGhlIGJhY2tlbmQgZWNob2VzIGFcblx0XHRcdC8vIHBlci1yZXNwb25zZSBpZCwgdGhlIGRlY2lzaW9uIGlzIG1hZGUgb25jZSAob24gdGhlIGZpcnN0IGNodW5rKSBhbmRcblx0XHRcdC8vIGV2ZXJ5IGxhdGVyIGNodW5rIG9mIHRoYXQgcmVzcG9uc2UgZm9sbG93cyBpdDsgb3RoZXJ3aXNlIGZhbGwgYmFjayB0b1xuXHRcdFx0Ly8gdGhlIGxlZ2FjeSBzZXNzaW9uLWtleWVkIGhldXJpc3RpYy5cblx0XHRcdC8vIENsYXNzaWZ5IGEgYmFja2VuZCByZS1uYXJyYXRpb24gQkVGT1JFIGRlY2lkaW5nIHRvIGRlZmVyLCBzbyBhXG5cdFx0XHQvLyBkdXBsaWNhdGUgb2YgYSByZXBseSB3ZSBhbHJlYWR5IHJlYWQgaXMgZHJvcHBlZCBvdXRyaWdodCByYXRoZXIgdGhhblxuXHRcdFx0Ly8gYnVmZmVyZWQgYW5kIHJlcGxheWVkIHdoZW4gaXRzIHNlc3Npb24gaXMgbGF0ZXIgZm9jdXNlZC4gQXdhaXRlZFxuXHRcdFx0Ly8gcmVwbGllcyBieXBhc3MgdGhpcyBpbnNpZGUgX2lzUmVuYXJyYXRpb24uXG5cdFx0XHRjb25zdCBpc1JlbmFycmF0aW9uID0gdGhpcy5faXNSZW5hcnJhdGlvbihlLnJlc3BvbnNlSWQsIGNvZGluZ1Nlc3Npb25JZCwgZS50cmFuc2NyaXB0LCBlLmlzRmlyc3RDaHVuaywgZS5pc0ZpbmFsKTtcblx0XHRcdGNvbnN0IGRlZmVyID0gaXNSZW5hcnJhdGlvbiA/IGZhbHNlIDogdGhpcy5fc2hvdWxkRGVmZXJSZXNwb25zZVN0cmVhbShlLnJlc3BvbnNlSWQsIGNvZGluZ1Nlc3Npb25JZCwgZS5pc0ZpcnN0Q2h1bmspO1xuXHRcdFx0aWYgKGUuaXNGaXJzdENodW5rIHx8IGUuaXNGaW5hbCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFt2b2ljZV0gYXVkaW9fcmVzcG9uc2UgY29kaW5nU2Vzc2lvbklkPSR7Y29kaW5nU2Vzc2lvbklkID8/ICc8bm9uZT4nfSByZXNwb25zZUlkPSR7ZS5yZXNwb25zZUlkPy5zbGljZSgwLCA4KSA/PyAnPG5vbmU+J30gc2hvd249JHt0aGlzLl9zaG93blNlc3Npb25JZCgpID8/ICc8bm9uZT4nfSBmb2N1c2VkPSR7dGhpcy5fZ2V0Rm9jdXNlZFNlc3Npb25JZCgpID8/ICc8bm9uZT4nfSBleHRlcm5hbD0ke3RoaXMuX2FjdGl2ZVNlc3Npb25TaG93biA/PyAnPG5vbmU+J30gYXdhaXRpbmc9JHt0aGlzLl9hd2FpdGluZ1JlcGx5Rm9yU2Vzc2lvbiA/PyAnPG5vbmU+J30gaXNGaXJzdENodW5rPSR7ZS5pc0ZpcnN0Q2h1bmt9IGlzRmluYWw9JHtlLmlzRmluYWx9IHN1cHByZXNzPSR7dGhpcy5fc3VwcHJlc3NJbmNvbWluZ0F1ZGlvfSByZW5hcnJhdGlvbj0ke2lzUmVuYXJyYXRpb259IGRlZmVyPSR7ZGVmZXJ9YCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNSZW5hcnJhdGlvbikge1xuXHRcdFx0XHQvLyBCYWNrZW5kIHJlLW5hcnJhdGVkIGEgcmVwbHkgd2UgYWxyZWFkeSByZWFkIGZvciB0aGlzIHNlc3Npb25cblx0XHRcdFx0Ly8gKG1hdGNoZWQgYnkgY29udGVudCkuIERyb3AgaXQgc28gdGhlIHVzZXIgbmV2ZXIgaGVhcnMgaXQgdHdpY2UuXG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBkcm9wcGluZyByZS1uYXJyYXRpb24gZm9yIHNlc3Npb249JHtjb2RpbmdTZXNzaW9uSWR9IHJlc3BvbnNlSWQ9JHtlLnJlc3BvbnNlSWQ/LnNsaWNlKDAsIDgpID8/ICc8bm9uZT4nfSBpc0ZpcnN0Q2h1bms9JHtlLmlzRmlyc3RDaHVua30gaXNGaW5hbD0ke2UuaXNGaW5hbH1gKTtcblx0XHRcdH0gZWxzZSBpZiAoZGVmZXIgJiYgaXNDaGVja3BvaW50TmFycmF0aW9uKSB7XG5cdFx0XHRcdGlmIChlLnJlc3BvbnNlSWQgJiYgc29saWNpdGVkTmFycmF0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5fY2xlYXJQZW5kaW5nU29saWNpdGVkTmFycmF0aW9uKGUucmVzcG9uc2VJZCwgc29saWNpdGVkTmFycmF0aW9uKTtcblx0XHRcdFx0XHR0aGlzLl9zb2xpY2l0ZWROYXJyYXRpb25JZHMuZGVsZXRlKGUucmVzcG9uc2VJZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBlbHNlIGlmIChkZWZlcikge1xuXHRcdFx0XHR0aGlzLl9kZWZlclJlc3BvbnNlKGNvZGluZ1Nlc3Npb25JZCEsIGUuYXVkaW8sIGUuaXNGaXJzdENodW5rLCBlLmlzRmluYWwsIGUudHJhbnNjcmlwdCwgZS5yZXNwb25zZUlkLCBlLnR1cm5JZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoZS5hdWRpbyAmJiAhaXNDaGVja3BvaW50TmFycmF0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5fcHJlZW1wdENoZWNrcG9pbnRQbGF5YmFjaygpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEEgZnJlc2ggcmVwbHkgaXMgYWJvdXQgdG8gcGxheSBsaXZlIGZvciB0aGlzIHNlc3Npb24uIEFueXRoaW5nXG5cdFx0XHRcdC8vIHN0aWxsIGJ1ZmZlcmVkIGZvciBpdCAoZWFybGllciBiYWNrZ3JvdW5kIHVwZGF0ZXMgdGhlIHVzZXIgbmV2ZXJcblx0XHRcdFx0Ly8gcmV0dXJuZWQgdG8gaGVhcikgbXVzdCBiZSBwbGF5ZWQgRklSU1QsIGluIG9yZGVyLCBzbyBub3RoaW5nIGlzXG5cdFx0XHRcdC8vIGxvc3QgLSB0aGVuIHRoaXMgbmV3ZXIgcmVwbHkgcGxheXMgYWZ0ZXIuIEd1YXJkIG9uIHJlc3BvbnNlSWQgc28gYVxuXHRcdFx0XHQvLyByZXNwb25zZSBiZWluZyBwcm9tb3RlZCBmcm9tIGRlZmVycmVkIHRvIGxpdmUgKHNhbWUgaWQpIGlzbid0XG5cdFx0XHRcdC8vIGZsdXNoZWQtYW5kLXJlcGxheWVkIGFzIGlmIGl0IHdlcmUgYSBkaWZmZXJlbnQsIG9sZGVyIHJlc3BvbnNlLlxuXHRcdFx0XHRpZiAoZS5pc0ZpcnN0Q2h1bmsgJiYgY29kaW5nU2Vzc2lvbklkICYmIHRoaXMuX2RlZmVycmVkUmVzcG9uc2VzLmhhcyhjb2RpbmdTZXNzaW9uSWQpXG5cdFx0XHRcdFx0JiYgIXRoaXMuX2RlZmVycmVkQnVmZmVySGFzUmVzcG9uc2UoY29kaW5nU2Vzc2lvbklkLCBlLnJlc3BvbnNlSWQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fZmx1c2hEZWZlcnJlZFJlc3BvbnNlKGNvZGluZ1Nlc3Npb25JZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fZW5xdWV1ZUF1ZGlvKGNvZGluZ1Nlc3Npb25JZCwgZS5hdWRpbywgZS5pc0ZpcnN0Q2h1bmssIGUuaXNGaW5hbCwgZS50cmFuc2NyaXB0LCBlLnJlc3BvbnNlSWQsIHBsYXliYWNrTmFycmF0aW9uKTtcblx0XHRcdFx0aWYgKGUuaXNGaW5hbCkge1xuXHRcdFx0XHRcdHRoaXMuX2xpdmVSZXBseUtleXMuZGVsZXRlKGNvZGluZ1Nlc3Npb25JZCA/PyAnJyk7XG5cdFx0XHRcdFx0Ly8gUmVjb3JkIHRoaXMgaGVhcmQgcmVwbHkgc28gYW4gaW1tZWRpYXRlIGJhY2tlbmQgcmUtbmFycmF0aW9uXG5cdFx0XHRcdFx0Ly8gb2YgaXQgKG9uIGFjdGl2YXRpb24pIGlzIGRyb3BwZWQgYXMgYSByZS1yZWFkLCBhbmQgc28gbGF0ZXJcblx0XHRcdFx0XHQvLyBvbi1mb2N1cyByZS1yZWFkcyBvZiBpdCBhcmUgZGVkdXBlZCBieSBjb250ZW50LiBVbnRhZ2dlZFxuXHRcdFx0XHRcdC8vIGF1ZGlvIHRoYXQgcGxheXMgbGl2ZSBiZWxvbmdzIHRvIHRoZSBzZXNzaW9uIHRoZSB1c2VyIGlzXG5cdFx0XHRcdFx0Ly8gYXdhaXRpbmcgYSByZXBseSBmb3IsIGVsc2UgdGhlIG9uZSB0aGV5J3JlIHZpZXdpbmcgXHUyMDE0IHRoZSBzYW1lXG5cdFx0XHRcdFx0Ly8gbm90aW9uIHRoZSBkZWZlcnJhbCB1c2VzLiBEbyBOT1QgdXNlIHRoZSBzdGlja3lcblx0XHRcdFx0XHQvLyBgX2dldEFjdGl2ZVNlc3Npb25JZCgpYCAoaW5wdXQtcm91dGluZykgaGVyZTogaXQgY2FuIHBvaW50IGF0IGFcblx0XHRcdFx0XHQvLyBub3QtY3VycmVudGx5LXZpZXdlZCBzZXNzaW9uIGFuZCBwb2lzb24gYW5vdGhlciBzZXNzaW9uJ3MgZGVkdXBcblx0XHRcdFx0XHQvLyAoZHJvcHBpbmcgaXRzIG5leHQgcmVwbHkgLyBtaXNyb3V0aW5nIHRoaXMgb25lKS4gU2VlXG5cdFx0XHRcdFx0Ly8gX3JlY29uY2lsZUNvbmZpcm1hdGlvbkluZGljYXRvcnMgZm9yIHRoZSBzYW1lIGNhdmVhdC5cblx0XHRcdFx0XHRjb25zdCBoZWFyZFNlc3Npb25JZCA9IGNvZGluZ1Nlc3Npb25JZCA/PyB0aGlzLl9hd2FpdGluZ1JlcGx5Rm9yU2Vzc2lvbiA/PyB0aGlzLl9zaG93blNlc3Npb25JZCgpO1xuXHRcdFx0XHRcdGlmICghaXNDaGVja3BvaW50TmFycmF0aW9uICYmIGhlYXJkU2Vzc2lvbklkICYmIGUudHJhbnNjcmlwdCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgaGVhcmQgPSB0aGlzLl9ub3JtYWxpemVUcmFuc2NyaXB0KGUudHJhbnNjcmlwdCk7XG5cdFx0XHRcdFx0XHRpZiAoaGVhcmQpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgaGVhcmRLZXkgPSB0aGlzLl9zZXNzaW9uS2V5KGhlYXJkU2Vzc2lvbklkKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbGFzdEhlYXJkVHJhbnNjcmlwdEJ5SWQuc2V0KGhlYXJkS2V5LCBoZWFyZCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3JlY2VudGx5UmVhZFJlc3BvbnNlLnNldChoZWFyZEtleSwgeyB0cmFuc2NyaXB0OiBoZWFyZCwgYXQ6IERhdGUubm93KCkgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBPbiB0aGUgZmluYWwgY2h1bmsgd2UgaGF2ZSB0aGUgY29tcGxldGUgYXNzaXN0YW50IHRyYW5zY3JpcHQgdG8gcGVyc2lzdC5cblx0XHRcdGlmICghaXNDaGVja3BvaW50TmFycmF0aW9uICYmIGUuaXNGaW5hbCAmJiBlLnRyYW5zY3JpcHQpIHtcblx0XHRcdFx0dGhpcy5fcGVyc2lzdFR1cm4oJ2Fzc2lzdGFudCcsIGUudHJhbnNjcmlwdCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBOT1RFOiBhIHJlcGx5IGlzIG1hcmtlZCBcImhlYXJkXCIgKGRlZHVwIHNldCwgcGVuZGluZyBpbmRpY2F0b3IgY2xlYXJlZClcblx0XHRcdC8vIG9ubHkgd2hlbiBpdHMgYXVkaW8gZmluaXNoZXMgUExBWUlORyAtIHNlZSBvblBsYXliYWNrU3RvcHBlZCBhbmQgdGhlXG5cdFx0XHQvLyBzcGVlY2gtZGlzYWJsZWQgYnJhbmNoIG9mIF9wbGF5Q2h1bmssIGtleWVkIGJ5IHJlc3BvbnNlSWQuIEZpbmFsLWNodW5rXG5cdFx0XHQvLyBSRUNFSVBUIGhlcmUgaXMgbm90IHByb29mIG9mIHBsYXliYWNrICh0aGUgYXVkaW8gbWF5IGJlIHF1ZXVlZCBiZWhpbmRcblx0XHRcdC8vIGFub3RoZXIgc2Vzc2lvbiwgb3IgbGF0ZXIgZHJvcHBlZC9pbnRlcnJ1cHRlZCksIHNvIHdlIGRlbGliZXJhdGVseSBkb1xuXHRcdFx0Ly8gbm90IG1hcmsgaXQgaGVhcmQgYXQgdGhpcyBwb2ludC5cblx0XHRcdC8vIFJldGlyZSB0aGUgcGVyLXJlc3BvbnNlIHJvdXRlIG9uY2UgaXRzIHN0cmVhbSBlbmRzLiBEb25lIGxhc3Qgc28gdGhlXG5cdFx0XHQvLyByb3V0ZSBzdGF5cyBpbnNwZWN0YWJsZSBmb3IgdGhlIHdob2xlIGhhbmRsZXIgKGRlZmVyL2RlZHVwZS9lbnF1ZXVlKS5cblx0XHRcdGlmIChlLmlzRmluYWwgJiYgZS5yZXNwb25zZUlkKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc3BvbnNlUm91dGVzLmRlbGV0ZShlLnJlc3BvbnNlSWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFRvb2wgY2FsbHMgXHUyMTkyIGRpc3BhdGNoIHRoZSBiaW5hcnktcm91dGVyIHRvb2xzIGZyb20gdGhlIHZvaWNlIExMTS5cblx0XHQvLyBzZW5kX3RvX2NoYXQgaXMgdGhlIExMTSdzIHNpZ25hbCB0aGF0IHRoZSB1dHRlcmFuY2UgaXMgYSB0YXNrIGZvciB0aGVcblx0XHQvLyBhY3RpdmUgY29kaW5nIHNlc3Npb247IHRoZSBiYWNrZW5kIGhhcyBhbHJlYWR5IG92ZXJ3cml0dGVuIGFyZ3MudGV4dFxuXHRcdC8vIHdpdGggdGhlIHVzZXIncyB2ZXJiYXRpbSBmaW5hbCB0cmFuc2NyaXB0LCBzbyB3ZSBqdXN0IGZvcndhcmQgaXQuXG5cdFx0Ly8gV2Ugcm91dGUgc2VuZF90b19jaGF0IHRocm91Z2ggdGhlIGNvbnRyb2xsZXIncyBvd24gc2VuZCBwYXRoICh3aGljaFxuXHRcdC8vIGhvbm9ycyB0aGUgdXNlci1waWNrZWQgX3RhcmdldFNlc3Npb24gYW5kIHRoZSB3b3JrYmVuY2ggY2hhdFxuXHRcdC8vIGNvbW1hbmRzKSwgbm90IHRocm91Z2ggdGhlIGdlbmVyaWMgZGlzcGF0Y2ggc2VydmljZS5cblx0XHR0aGlzLl92b2ljZUV2ZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMudm9pY2VDbGllbnRTZXJ2aWNlLm9uVG9vbENhbGwoZSA9PiB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFt2b2ljZV0gdG9vbF9jYWxsIHJlY2VpdmVkIG5hbWU9JHtlLm5hbWV9IGNvZGluZ19zZXNzaW9uX2lkPSR7dHlwZW9mIGUuYXJncz8uWydjb2Rpbmdfc2Vzc2lvbl9pZCddID09PSAnc3RyaW5nJyA/IFN0cmluZyhlLmFyZ3NbJ2NvZGluZ19zZXNzaW9uX2lkJ10pLnNsaWNlKC0zMikgOiAnPG5vbmU+J30gYWN0aXZlSWQ9JHt0aGlzLl9nZXRBY3RpdmVTZXNzaW9uSWQoKT8uc2xpY2UoLTMyKSA/PyAnPG5vbmU+J31gKTtcblx0XHRcdGNvbnN0IGFsbG93ZWRUb29scyA9IFtcblx0XHRcdFx0J3NlbmRfdG9fY2hhdCcsXG5cdFx0XHRcdCdnZXRfc2Vzc2lvbl9pbmZvJywgJ2dldF9zZXNzaW9uX2NoYW5nZXMnLCAnZ2V0X3Nlc3Npb25fdGhyZWFkJyxcblx0XHRcdFx0J3Jlc3BvbmRfdG9fc2Vzc2lvbicsXG5cdFx0XHRcdCdhdXRvX2FwcHJvdmVfc2Vzc2lvbicsICdyZXZva2VfYXV0b19hcHByb3ZlJyxcblx0XHRcdFx0J2ZvY3VzX3Nlc3Npb24nLFxuXHRcdFx0XTtcblx0XHRcdGlmIChlLm5hbWUgPT09ICdzZW5kX3RvX2NoYXQnKSB7XG5cdFx0XHRcdC8vIERyb3AgYSBzdHJheSBmaW5hbGl6YXRpb24gZnJvbSBhIHR1cm4gd2UganVzdCBkaXNjYXJkZWQgb24gYVxuXHRcdFx0XHQvLyBmb2N1cyBjaGFuZ2UsIHNvIGJ1ZmZlcmVkIHNwZWVjaCBpc24ndCBtaXNyb3V0ZWQgdG8gdGhlIG5ld2x5XG5cdFx0XHRcdC8vIGZvY3VzZWQgc2Vzc2lvbi5cblx0XHRcdFx0aWYgKERhdGUubm93KCkgPCB0aGlzLl9zdXBwcmVzc1NlbmRUb0NoYXRVbnRpbCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW3ZvaWNlXSBkcm9wcGluZyBzZW5kX3RvX2NoYXQ6IHR1cm4gZGlzY2FyZGVkIG9uIGZvY3VzIGNoYW5nZScpO1xuXHRcdFx0XHRcdHRoaXMudm9pY2VDbGllbnRTZXJ2aWNlLnNlbmRUb29sUmVzdWx0KGUuY2FsbElkLCAnb2snKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmF3VGV4dCA9IHR5cGVvZiBlLmFyZ3M/LlsndGV4dCddID09PSAnc3RyaW5nJyA/IChlLmFyZ3NbJ3RleHQnXSBhcyBzdHJpbmcpIDogJyc7XG5cdFx0XHRcdC8vIERlZmVuc2l2ZWx5IHN0cmlwIGEgdHJhaWxpbmcgc3RvcCBwaHJhc2UgKGUuZy4gXCJzZW5kIGl0XCIpIHRoYXRcblx0XHRcdFx0Ly8gdGhlIGJhY2tlbmQgc2hvdWxkIGhhdmUgcmVtb3ZlZCBidXQgc29tZXRpbWVzIGxlYXZlcyBpbi5cblx0XHRcdFx0Y29uc3QgdGV4dCA9IHRoaXMuX3N0cmlwU3RvcFBocmFzZShyYXdUZXh0KTtcblx0XHRcdFx0aWYgKHRleHQgIT09IHJhd1RleHQgJiYgZS5hcmdzKSB7XG5cdFx0XHRcdFx0ZS5hcmdzWyd0ZXh0J10gPSB0ZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3N0YXR1c1RleHQuc2V0KFZvaWNlVG9vbERpc3BhdGNoU2VydmljZS5nZXRBY3Rpb25MYWJlbChlLm5hbWUpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzLl9wZXJzaXN0RW50cnkoJ2FnZW50X3Rvb2xfY2FsbCcsIHRoaXMuX3JlbmRlclRvb2xDYWxsU3VtbWFyeShlLm5hbWUsIGUuYXJncyksIHtcblx0XHRcdFx0XHR0b29sTmFtZTogZS5uYW1lLFxuXHRcdFx0XHRcdHRvb2xBcmdzOiBlLmFyZ3MsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLl9zZXRBd2FpdGluZ1JlcGx5KCk7XG5cdFx0XHRcdGNvbnN0IHNlbmRQcm9taXNlID0gdGV4dC50cmltKClcblx0XHRcdFx0XHQ/IHRoaXMuX3NlbmRUcmFuc2NyaXB0aW9uVG9DaGF0KHRleHQpXG5cdFx0XHRcdFx0OiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdFx0c2VuZFByb21pc2UuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy52b2ljZUNsaWVudFNlcnZpY2Uuc2VuZFRvb2xSZXN1bHQoZS5jYWxsSWQsICdvaycpO1xuXHRcdFx0XHRcdHRoaXMuX3ZvaWNlU3RhdGUuc2V0KCdpZGxlJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR0aGlzLl9zdGF0dXNUZXh0LnNldCgnSG9sZCB0byBzcGVhay4uLicsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0dGhpcy5fc2VuZENvbnRleHQoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChhbGxvd2VkVG9vbHMuaW5jbHVkZXMoZS5uYW1lKSkge1xuXHRcdFx0XHQvLyBBbnN3ZXIgcmVhZC1vbmx5IGJhY2tlbmQgcXVlcmllcyB3aXRob3V0IHRvdWNoaW5nIFBUVC9zdGF0ZSwgc28gdGhlIGJhY2tlbmQncyBjb25uZWN0LXRpbWUgcHJvYmUgY2FuJ3QgZW5kIGEganVzdC1zdGFydGVkIGF1dG8tbGlzdGVuLlxuXHRcdFx0XHRjb25zdCBwYXNzaXZlVG9vbHMgPSBbJ2dldF9zZXNzaW9uX2luZm8nLCAnZ2V0X3Nlc3Npb25fY2hhbmdlcycsICdnZXRfc2Vzc2lvbl90aHJlYWQnXTtcblx0XHRcdFx0aWYgKHBhc3NpdmVUb29scy5pbmNsdWRlcyhlLm5hbWUpKSB7XG5cdFx0XHRcdFx0dGhpcy52b2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UuZGlzcGF0Y2hUb29sQ2FsbChlKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5zZW5kVG9vbFJlc3VsdChlLmNhbGxJZCwgcmVzdWx0KTtcblx0XHRcdFx0XHR9LCBlcnIgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gQWx3YXlzIGFuc3dlciwgZXZlbiBvbiBmYWlsdXJlLCBzbyB0aGUgYmFja2VuZCBpc24ndCBsZWZ0IHdhaXRpbmcgb24gdGhpcyBjYWxsSWQuXG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFt2b2ljZV0gcGFzc2l2ZSB0b29sICR7ZS5uYW1lfSBkaXNwYXRjaCBmYWlsZWRgLCBlcnIpO1xuXHRcdFx0XHRcdFx0dGhpcy52b2ljZUNsaWVudFNlcnZpY2Uuc2VuZFRvb2xSZXN1bHQoZS5jYWxsSWQsICdlcnJvcicpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9zdGF0dXNUZXh0LnNldChWb2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UuZ2V0QWN0aW9uTGFiZWwoZS5uYW1lKSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5fcGVyc2lzdEVudHJ5KCdhZ2VudF90b29sX2NhbGwnLCB0aGlzLl9yZW5kZXJUb29sQ2FsbFN1bW1hcnkoZS5uYW1lLCBlLmFyZ3MpLCB7XG5cdFx0XHRcdFx0dG9vbE5hbWU6IGUubmFtZSxcblx0XHRcdFx0XHR0b29sQXJnczogZS5hcmdzLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Ly8gRXhpdCBsaXN0ZW5pbmcgbW9kZSBzbyB0aGUgcmVzcG9uc2UgYXVkaW8gaXNuJ3Qgc3VwcHJlc3NlZC5cblx0XHRcdFx0aWYgKHRoaXMuX3B0dEhlbGQpIHtcblx0XHRcdFx0XHR0aGlzLl9maW5pc2hQdHQoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9zdXBwcmVzc0luY29taW5nQXVkaW8gPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fc2V0QXdhaXRpbmdSZXBseSgpO1xuXHRcdFx0XHRjb25zdCBzZXR0bGUgPSAoKTogdm9pZCA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fdm9pY2VTdGF0ZS5zZXQoJ2lkbGUnLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHRoaXMuX3N0YXR1c1RleHQuc2V0KCdIb2xkIHRvIHNwZWFrLi4uJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR0aGlzLl9zZW5kQ29udGV4dCgpO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRpZiAoZS5uYW1lID09PSAncmVzcG9uZF90b19zZXNzaW9uJykge1xuXHRcdFx0XHRcdC8vIFRoZSBvbmUgdG9vbCB3aG9zZSByZXN1bHQgdGhlIGJhY2tlbmQgYWN0cyBvbjogaXQgc3BlYWtzIGFuXG5cdFx0XHRcdFx0Ly8gYWNrbm93bGVkZ2VtZW50IG9ubHkgZm9yIGFuIG91dGNvbWUgaXQgaGFzIG9ic2VydmVkLCBzbyB0aGlzXG5cdFx0XHRcdFx0Ly8gbXVzdCByZXBvcnQgd2hhdCBhY3R1YWxseSBoYXBwZW5lZCByYXRoZXIgdGhhbiBhIGJsYW5rZXQgJ29rJy5cblx0XHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGUuYXJncz8uWydyZXNwb25zZSddO1xuXHRcdFx0XHRcdGNvbnN0IHJlc3BvbnNlVHlwZSA9IHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkocmVzcG9uc2UpXG5cdFx0XHRcdFx0XHQ/IChyZXNwb25zZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbJ3R5cGUnXVxuXHRcdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy52b2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UucmVzcG9uZFRvU2Vzc2lvbihlKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFt2b2ljZV0gcmVzcG9uZF90b19zZXNzaW9uIHR5cGU9JHtTdHJpbmcocmVzcG9uc2VUeXBlKX0gb2s9JHtyZXN1bHQub2t9IHJlYXNvbj0ke3Jlc3VsdC5yZWFzb24gPz8gJzxub25lPid9IGNvZGluZ19zZXNzaW9uX2lkPSR7dHlwZW9mIGUuYXJncz8uWydjb2Rpbmdfc2Vzc2lvbl9pZCddID09PSAnc3RyaW5nJyA/IFN0cmluZyhlLmFyZ3NbJ2NvZGluZ19zZXNzaW9uX2lkJ10pLnNsaWNlKC0zMikgOiAnPG5vbmU+J31gKTtcblx0XHRcdFx0XHRcdGlmIChyZXNwb25zZVR5cGUgPT09ICdhcHByb3ZlJyB8fCByZXNwb25zZVR5cGUgPT09ICdyZWplY3QnKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFZvaWNlVG9vbEFwcHJvdmFsRXZlbnQsIFZvaWNlVG9vbEFwcHJvdmFsQ2xhc3NpZmljYXRpb24+KCd2b2ljZVRvb2xBcHByb3ZhbCcsIHtcblx0XHRcdFx0XHRcdFx0XHR0b29sTmFtZTogZS5uYW1lLFxuXHRcdFx0XHRcdFx0XHRcdGFwcHJvdmVkOiByZXNwb25zZVR5cGUgPT09ICdhcHByb3ZlJyxcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5zZW5kVG9vbFJlc3VsdChlLmNhbGxJZCwgcmVzdWx0KTtcblx0XHRcdFx0XHRcdHNldHRsZSgpO1xuXHRcdFx0XHRcdH0sIGVyciA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFt2b2ljZV0gcmVzcG9uZF90b19zZXNzaW9uIGRpc3BhdGNoIGZhaWxlZGAsIGVycik7XG5cdFx0XHRcdFx0XHR0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5zZW5kVG9vbFJlc3VsdChlLmNhbGxJZCwgeyBvazogZmFsc2UsIHJlYXNvbjogJ3Vuc3VwcG9ydGVkJyB9KTtcblx0XHRcdFx0XHRcdHNldHRsZSgpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnZvaWNlVG9vbERpc3BhdGNoU2VydmljZS5kaXNwYXRjaFRvb2xDYWxsKGUpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0XHR0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5zZW5kVG9vbFJlc3VsdChlLmNhbGxJZCwgcmVzdWx0KTtcblx0XHRcdFx0XHRzZXR0bGUoKTtcblx0XHRcdFx0fSwgZXJyID0+IHtcblx0XHRcdFx0XHQvLyBBbHdheXMgYW5zd2VyLCBldmVuIG9uIGZhaWx1cmUsIHNvIHRoZSBiYWNrZW5kIGlzbid0IGxlZnQgd2FpdGluZyBvbiB0aGlzIGNhbGxJZC5cblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFt2b2ljZV0gdG9vbCAke2UubmFtZX0gZGlzcGF0Y2ggZmFpbGVkYCwgZXJyKTtcblx0XHRcdFx0XHR0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5zZW5kVG9vbFJlc3VsdChlLmNhbGxJZCwgJ2Vycm9yJyk7XG5cdFx0XHRcdFx0c2V0dGxlKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gVW5rbm93biAvIGRpc2FsbG93ZWQgdG9vbDogYW5zd2VyIHNvIHRoZSBiYWNrZW5kIGlzbid0IGxlZnRcblx0XHRcdFx0Ly8gYmxvY2tlZC4gVGhpcyBpcyBkZWxpYmVyYXRlbHkgbm90IGV2aWRlbmNlIG9mIGFueXRoaW5nOiB0aGVcblx0XHRcdFx0Ly8gYmFja2VuZCBtdXN0IG5vdCByZWFkIGEgYmFyZSAnb2snIGFzIFwidGhlIHRoaW5nIGhhcHBlbmVkXCIuXG5cdFx0XHRcdHRoaXMudm9pY2VDbGllbnRTZXJ2aWNlLnNlbmRUb29sUmVzdWx0KGUuY2FsbElkLCAnb2snKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBFcnJvcnMgKG9ubHkgc3VyZmFjZSBpZiBub3QgaW4gY29ubmVjdGluZy9yZWNvbm5lY3QgcGhhc2UpXG5cdFx0dGhpcy5fdm9pY2VFdmVudERpc3Bvc2FibGVzLmFkZCh0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5vbkVycm9yKGRldGFpbCA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzQ29ubmVjdGluZy5nZXQoKSkge1xuXHRcdFx0XHR0aGlzLl92b2ljZVN0YXRlLnNldCgnZXJyb3InLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzLl9zdGF0dXNUZXh0LnNldChgRXJyb3I6ICR7ZGV0YWlsfWAsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fdm9pY2VFdmVudERpc3Bvc2FibGVzLmFkZCh0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5vbkZhdGFsRGlzY29ubmVjdChlID0+IHtcblx0XHRcdHRoaXMuX2hhbmRsZUZhdGFsRGlzY29ubmVjdChlLmNvZGUsIGUucmVhc29uKTtcblx0XHR9KSk7XG5cblx0XHRhd2FpdCB0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5jb25uZWN0KHdpbmRvdywgYXV0aFRva2VuKTtcblx0XHRpZiAoIXRoaXMuX2lzQ29ubmVjdGluZy5nZXQoKSB8fCBjb25uZWN0QXR0ZW1wdEdlbmVyYXRpb24gIT09IHRoaXMuX2Nvbm5lY3RBdHRlbXB0R2VuZXJhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBSZS1hcm0gc28gdGhlIFdlYlNvY2tldCBoYW5kc2hha2UgZ2V0cyBhIGZyZXNoIHRpbWVvdXQgd2luZG93XG5cdFx0Ly8gaW5kZXBlbmRlbnQgb2YgaG93IGxvbmcgdGhlIGF3YWl0ZWQgYXV0aC90cmFuc2NyaXB0IHdvcmsgdG9vayBhYm92ZS5cblx0XHR0aGlzLl9hcm1Db25uZWN0V2F0Y2hkb2coKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcm1zIChvciByZS1hcm1zKSB0aGUgd2F0Y2hkb2cgdGhhdCByZXNldHMgdm9pY2UgbW9kZSBpZiB0aGUgY29ubmVjdFxuXHQgKiBoYW5kc2hha2UgbmV2ZXIgY29tcGxldGVzLiBXaXRob3V0IHRoaXMsIGEgaHVuZyBjb25uZWN0IHN0ZXAgbGVhdmVzIHRoZVxuXHQgKiB0b29sYmFyIHNwaW5uZXIgc3Bpbm5pbmcgZm9yZXZlciB3aXRoIG5vIHdheSB0byByZWNvdmVyOyBvbiB0aW1lb3V0IHdlIGRyb3Bcblx0ICogYmFjayB0byBhIGRpc2Nvbm5lY3RlZCBzdGF0ZSBhbmQgdGVsbCB0aGUgdXNlciBzbyB0aGV5IGNhbiByZXRyeS5cblx0ICovXG5cdHByaXZhdGUgX2FybUNvbm5lY3RXYXRjaGRvZygpOiB2b2lkIHtcblx0XHR0aGlzLl9jb25uZWN0V2F0Y2hkb2cudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAoKCF0aGlzLl9pc0Nvbm5lY3RpbmcuZ2V0KCkgJiYgIXRoaXMuX2lzUmVjb25uZWN0aW5nLmdldCgpKSB8fCB0aGlzLl9pc0Nvbm5lY3RlZC5nZXQoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW3ZvaWNlXSBjb25uZWN0IGhhbmRzaGFrZSB0aW1lZCBvdXQ7IHJlc2V0dGluZyB2b2ljZSBtb2RlJyk7XG5cdFx0XHR0aGlzLl9yZXNldEZhaWxlZENvbm5lY3Rpb24oKTtcblx0XHR9LCBWb2ljZVNlc3Npb25Db250cm9sbGVyLl9DT05ORUNUX1RJTUVPVVRfTVMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzZXRGYWlsZWRDb25uZWN0aW9uKG5vdGlmeVVzZXIgPSB0cnVlKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNjb25uZWN0KCk7XG5cdFx0aWYgKG5vdGlmeVVzZXIpIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3ZvaWNlLmNvbm5lY3RGYWlsZWQnLCBcIlZvaWNlIG1vZGUgY291bGQgbm90IGNvbm5lY3QuIFBsZWFzZSB0cnkgYWdhaW4uXCIpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEV4Y2x1ZGUgdGhlIGN1cnJlbnRseS1wZW5kaW5nIGNvbmZpcm1hdGlvbiBzZXNzaW9ucyBmcm9tIHRoZSBhbHdheXMtb25cblx0ICogdHJhY2tlciB1bnRpbCB0aGUgbmV4dCB7QGxpbmsgY29ubmVjdH0sIHNvIGEgdGVybWluYWwgdGVhcmRvd24ncyBjbGVhcmVkXG5cdCAqIHNuYXBzaG90IGNhbid0IGJlIHJlcG9wdWxhdGVkIGZyb20gdGhlIHN0aWxsLXBlbmRpbmcgb2xkIHNlc3Npb24uXG5cdCAqL1xuXHRwcml2YXRlIF9zdXBwcmVzc1BlbmRpbmdDb25maXJtYXRpb25zVW50aWxDb25uZWN0KCk6IHZvaWQge1xuXHRcdGNvbnN0IHN1cHByZXNzZWQgPSBuZXcgU2V0KHRoaXMuX3N1cHByZXNzZWRDb25maXJtYXRpb25TZXNzaW9ucy5nZXQoKSk7XG5cdFx0Zm9yIChjb25zdCB0YyBvZiB0aGlzLl9wZW5kaW5nVG9vbENvbmZpcm1hdGlvbnMuZ2V0KCkpIHtcblx0XHRcdHN1cHByZXNzZWQuYWRkKHRjLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHR9XG5cdFx0dGhpcy5fc3VwcHJlc3NlZENvbmZpcm1hdGlvblNlc3Npb25zLnNldChzdXBwcmVzc2VkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0ZGlzY29ubmVjdChzb3VyY2U6ICdleHBsaWNpdCcgfCAnaW50ZXJuYWwnID0gJ2ludGVybmFsJyk6IHZvaWQge1xuXHRcdHRoaXMuX2Nvbm5lY3RBdHRlbXB0R2VuZXJhdGlvbisrO1xuXHRcdGNvbnN0IHNob3VsZFBsYXlTdG9wcGVkU2lnbmFsID0gc291cmNlID09PSAnZXhwbGljaXQnICYmICh0aGlzLl9pc0Nvbm5lY3RpbmcuZ2V0KCkgfHwgdGhpcy5faXNDb25uZWN0ZWQuZ2V0KCkgfHwgdGhpcy5faXNSZWNvbm5lY3RpbmcuZ2V0KCkpO1xuXHRcdGNvbnN0IHNob3VsZFBsYXlSZWNvcmRpbmdTdG9wcGVkU2lnbmFsID0gc291cmNlID09PSAnZXhwbGljaXQnICYmIHRoaXMuX3B0dEhlbGQ7XG5cblx0XHQvLyBUZWxlbWV0cnk6IHNlc3Npb24gZW5kZWRcblx0XHRpZiAodGhpcy5fdGVsZW1ldHJ5U2Vzc2lvblN0YXJ0KSB7XG5cdFx0XHRjb25zdCBkdXJhdGlvblNlYyA9IE1hdGgucm91bmQoKERhdGUubm93KCkgLSB0aGlzLl90ZWxlbWV0cnlTZXNzaW9uU3RhcnQpIC8gMTAwMCk7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxWb2ljZVNlc3Npb25FbmRlZEV2ZW50LCBWb2ljZVNlc3Npb25FbmRlZENsYXNzaWZpY2F0aW9uPigndm9pY2VTZXNzaW9uRW5kZWQnLCB7XG5cdFx0XHRcdHR1cm5Db3VudDogdGhpcy5fdGVsZW1ldHJ5VHVybkNvdW50LFxuXHRcdFx0XHRkdXJhdGlvblNlYyxcblx0XHRcdFx0cmVjb25uZWN0Q291bnQ6IHRoaXMuX3RlbGVtZXRyeVJlY29ubmVjdENvdW50LFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXNzaW9uU3RhcnQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5faXNDb25uZWN0aW5nLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9pc1JlY29ubmVjdGluZy5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fY29ubmVjdFdhdGNoZG9nLmNsZWFyKCk7XG5cdFx0dGhpcy5fdm9pY2VBdXRvcnVuRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdHRoaXMuX3ZvaWNlRXZlbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMudHRzUGxheWJhY2tTZXJ2aWNlLmNsb3NlQ29udGV4dCgpO1xuXHRcdHRoaXMubWljQ2FwdHVyZVNlcnZpY2Uuc3RvcENhcHR1cmUoKTtcblx0XHR0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5kaXNjb25uZWN0KCk7XG5cdFx0dGhpcy5fcHR0SGVsZCA9IGZhbHNlO1xuXHRcdHRoaXMuX3B0dFRvZ2dsZU1vZGUgPSBmYWxzZTtcblx0XHR0aGlzLl9wdHRDdXJyZW50VHVybklkID0gJyc7XG5cdFx0dGhpcy5fcmVzZXRUcmFuc2NyaXB0aW9uVHVybigpO1xuXHRcdHRoaXMuX2JhcmdlSW5MaXN0ZW5BY3RpdmUgPSBmYWxzZTtcblx0XHR0aGlzLl9pc0Nvbm5lY3RlZC5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fdm9pY2VTdGF0ZS5zZXQoJ2lkbGUnLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3N0YXR1c1RleHQuc2V0KCdUYXAgdG8gc3RhcnQnLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3RyYW5zY3JpcHRUdXJucy5zZXQoW10sIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fY2xlYXJBdXRvTGlzdGVuVGltZXIoKTtcblx0XHR0aGlzLl9jbGVhckF3YWl0aW5nUmVwbHkoKTtcblx0XHR0aGlzLl9hdXRvTGlzdGVuU3VwcHJlc3NlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2VudGVyTGlzdGVuT25TZXNzaW9uSW5pdCA9IGZhbHNlO1xuXHRcdHRoaXMuX3JlcGx5UGxheWVkU2luY2VTZW5kID0gZmFsc2U7XG5cdFx0dGhpcy5fYXVkaW9RdWV1ZS5sZW5ndGggPSAwO1xuXHRcdHRoaXMuX2N1cnJlbnRQbGF5YmFja1Nlc3Npb25JZCA9IG51bGw7XG5cdFx0dGhpcy5fY3VycmVudFBsYXliYWNrUmVzcG9uc2VJZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jdXJyZW50UGxheWJhY2tOYXJyYXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5faXNQcm9jZXNzaW5nUXVldWUgPSBmYWxzZTtcblx0XHR0aGlzLl9zdXBwcmVzc0luY29taW5nQXVkaW8gPSBmYWxzZTtcblx0XHR0aGlzLl9pbnRlcnJ1cHRlZEF1ZGlvSWRzLmNsZWFyKCk7XG5cdFx0dGhpcy5fY2xlYXJEZWZlcnJlZFJlc3BvbnNlcygpO1xuXHRcdHRoaXMuX3VpUmVzb3VyY2VCeUJhY2tlbmRJZC5jbGVhcigpO1xuXHRcdHRoaXMuX2xpdmVSZXBseUtleXMuY2xlYXIoKTtcblx0XHR0aGlzLl9sYXN0U2hvd25TZXNzaW9uSWQgPSB1bmRlZmluZWQ7XG5cdFx0Ly8gVGVybWluYWwgZGlzY29ubmVjdDogZHJvcCB0aGUgcm91dGluZyB0YXJnZXQgYW5kIHBlbmRpbmctY29uZmlybWF0aW9uXG5cdFx0Ly8gc25hcHNob3QgKGFuZCBzdXBwcmVzcyB0aGUgdHJhY2tlcikgc28gYSBsYXRlciByZWNvbm5lY3QgY2FuJ3QgcmUtcGluXG5cdFx0Ly8gdm9pY2UgdG8gdGhlIG9sZCBzZXNzaW9uIG9yIHJlcG9wdWxhdGUgaXRzIHN0YWxlIGNvbmZpcm1hdGlvbi5cblx0XHR0aGlzLl90YXJnZXRTZXNzaW9uLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fc3VwcHJlc3NQZW5kaW5nQ29uZmlybWF0aW9uc1VudGlsQ29ubmVjdCgpO1xuXHRcdHRoaXMuX3BlbmRpbmdUb29sQ29uZmlybWF0aW9ucy5zZXQoW10sIHVuZGVmaW5lZCk7XG5cdFx0Ly8gVGVybWluYWwgZGlzY29ubmVjdDogZHJvcCBlbWJlZGRlci1kcml2ZW4gYWN0aXZlLXNlc3Npb24gc3RhdGUgdG9vLCBzbyBhXG5cdFx0Ly8gbGF0ZXIgcmVjb25uZWN0IHN0YXJ0cyBmcm9tIGZvY3VzLWJhc2VkIGRldGVjdGlvbiB1bnRpbCB0aGUgZW1iZWRkZXJcblx0XHQvLyByZS1hc3NlcnRzIHRoZSBhY3RpdmUgc2Vzc2lvbiAocmF0aGVyIHRoYW4gcGlubmluZyBhIHN0YWxlIG9uZSBhbmRcblx0XHQvLyBzaWxlbnRseSBpZ25vcmluZyBmb2N1cyBldmVudHMpLlxuXHRcdHRoaXMuX2FjdGl2ZVNlc3Npb25TaG93biA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9leHRlcm5hbEFjdGl2ZVNlc3Npb25Nb2RlID0gZmFsc2U7XG5cdFx0dGhpcy5fcmVjZW50bHlSZWFkUmVzcG9uc2UuY2xlYXIoKTtcblx0XHR0aGlzLl9kcm9wcGluZ1JlbmFycmF0aW9uLmNsZWFyKCk7XG5cdFx0dGhpcy5fc29saWNpdGVkTmFycmF0aW9uSWRzLmNsZWFyKCk7XG5cdFx0dGhpcy5fY2FuY2VsbGVkUGVuZGluZ05hcnJhdGlvbklkcy5jbGVhcigpO1xuXHRcdHRoaXMuX2xhc3RIZWFyZFRyYW5zY3JpcHRCeUlkLmNsZWFyKCk7XG5cdFx0dGhpcy5fYXdhaXRpbmdSZXBseUZvclNlc3Npb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcHJldlNlc3Npb25TdGF0ZXMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IHQgb2YgdGhpcy5fdXNlckNhbmNlbGxlZFNlc3Npb25zLnZhbHVlcygpKSB7IGNsZWFyVGltZW91dCh0KTsgfVxuXHRcdHRoaXMuX3VzZXJDYW5jZWxsZWRTZXNzaW9ucy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgdCBvZiB0aGlzLl9jb25maXJtYXRpb25GbHVzaFdhdGNoZG9ncy52YWx1ZXMoKSkgeyBjbGVhclRpbWVvdXQodCk7IH1cblx0XHR0aGlzLl9jb25maXJtYXRpb25GbHVzaFdhdGNoZG9ncy5jbGVhcigpO1xuXHRcdGlmICh0aGlzLl9zdGF0ZUNoYW5nZUVtaXRUaW1lcikgeyBjbGVhclRpbWVvdXQodGhpcy5fc3RhdGVDaGFuZ2VFbWl0VGltZXIpOyB0aGlzLl9zdGF0ZUNoYW5nZUVtaXRUaW1lciA9IHVuZGVmaW5lZDsgfVxuXHRcdHRoaXMuX3BlbmRpbmdTdGF0ZUNoYW5nZXMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IHJlZiBvZiB0aGlzLl9lYWdlck1vZGVsUmVmcy52YWx1ZXMoKSkgeyByZWYuZGlzcG9zZSgpOyB9XG5cdFx0dGhpcy5fZWFnZXJNb2RlbFJlZnMuY2xlYXIoKTtcblx0XHR0aGlzLl9lYWdlck1vZGVsTG9hZGluZy5jbGVhcigpO1xuXHRcdHRoaXMuX3BlbmRpbmdJZGxlTmFycmF0aW9uLmNsZWFyKCk7XG5cdFx0dGhpcy5fc2Vzc2lvbnNBd2FpdGluZ1Jlc3BvbnNlU3VtbWFyeS5jbGVhcigpO1xuXHRcdHRoaXMuX2xhc3RSZXNwb25zZVN1bW1hcnlCeUlkLmNsZWFyKCk7XG5cdFx0dGhpcy5fbGFzdE5hcnJhdGVkVGV4dC5jbGVhcigpO1xuXHRcdHRoaXMuX3BlbmRpbmdOYXJyYXRpb25SZXRyaWVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fdm9pY2VQcm9ncmVzc0xpc3RlbmVycy5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblx0XHR0aGlzLl92b2ljZVByb2dyZXNzU2Vzc2lvbkJ5UmVzcG9uc2UuY2xlYXIoKTtcblx0XHR0aGlzLl9sYXN0U3Bva2VuQXRCeVNlc3Npb24uY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IFtuYXJyYXRpb25JZCwgcGVuZGluZ10gb2YgdGhpcy5fcGVuZGluZ1NvbGljaXRlZE5hcnJhdGlvbnMpIHtcblx0XHRcdHRoaXMuX2NsZWFyUGVuZGluZ1NvbGljaXRlZE5hcnJhdGlvbihuYXJyYXRpb25JZCwgcGVuZGluZyk7XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb25zLmNsZWFyKCk7XG5cdFx0dGhpcy5fZGVmZXJyZWROYXJyYXRpb25zLmNsZWFyKCk7XG5cdFx0dGhpcy5fbmFycmF0ZWRQZW5kaW5nLmNsZWFyKCk7XG5cdFx0dGhpcy5fdXNlckxvZ2luID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2xhc3RQZXJzaXN0ZWRUdXJuSWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcGVuZGluZ1ByaW9yVGltZWxpbmUgPSBbXTtcblx0XHR0aGlzLl9zdG9wUmVwbGF5KCk7XG5cdFx0dGhpcy5fc2Vzc2lvbkF1ZGlvQ2FjaGUuY2xlYXIoKTtcblx0XHRpZiAoc2hvdWxkUGxheVJlY29yZGluZ1N0b3BwZWRTaWduYWwpIHtcblx0XHRcdHRoaXMuX3BsYXlSZWNvcmRpbmdTdG9wcGVkU2lnbmFsKHRydWUpO1xuXHRcdH1cblx0XHRpZiAoc2hvdWxkUGxheVN0b3BwZWRTaWduYWwpIHtcblx0XHRcdHZvaWQgdGhpcy5hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwudm9pY2VNb2RlU3RvcHBlZCwge1xuXHRcdFx0XHRzb3VyY2U6ICd2b2ljZU1vZGUuZGlzY29ubmVjdCcsXG5cdFx0XHRcdHVzZXJHZXN0dXJlOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIERFViBPTkxZOiBTaW11bGF0ZSBhIGNvbm5lY3RlZCBzZXNzaW9uIHdpdGggZmFrZSB0cmFuc2NyaXB0IGZvciBVSSB0ZXN0aW5nLiAqL1xuXHRzaW11bGF0ZUNvbm5lY3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5faXNDb25uZWN0ZWQuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5faXNDb25uZWN0aW5nLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl92b2ljZVN0YXRlLnNldCgnaWRsZScsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fc3RhdHVzVGV4dC5zZXQoJ0hvbGQgdG8gc3BlYWsuLi4nLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgYSB1c2VyIHNwZWFraW5nIGFmdGVyIDFzXG5cdFx0dGhpcy5fdm9pY2VFdmVudERpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzQ29ubmVjdGVkLmdldCgpKSB7IHJldHVybjsgfVxuXHRcdFx0dGhpcy5fdm9pY2VTdGF0ZS5zZXQoJ2xpc3RlbmluZycsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl90cmFuc2NyaXB0VHVybnMuc2V0KFt7IHNwZWFrZXI6ICd1c2VyJywgdGV4dDogJ0NyZWF0ZSBhJywgY29tbWl0dGVkOiAnJywgaXNQYXJ0aWFsOiB0cnVlIH1dLCB1bmRlZmluZWQpO1xuXHRcdH0sIDEwMDApKTtcblxuXHRcdC8vIFBhcnRpYWwgZ3Jvd3Ncblx0XHR0aGlzLl92b2ljZUV2ZW50RGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdGlmICghdGhpcy5faXNDb25uZWN0ZWQuZ2V0KCkpIHsgcmV0dXJuOyB9XG5cdFx0XHR0aGlzLl90cmFuc2NyaXB0VHVybnMuc2V0KFt7IHNwZWFrZXI6ICd1c2VyJywgdGV4dDogJ0NyZWF0ZSBhIG5ldyBSZWFjdCBjb21wb25lbnQnLCBjb21taXR0ZWQ6ICdDcmVhdGUgYSAnLCBpc1BhcnRpYWw6IHRydWUgfV0sIHVuZGVmaW5lZCk7XG5cdFx0fSwgMjAwMCkpO1xuXG5cdFx0Ly8gRmluYWwgdXNlciB0dXJuXG5cdFx0dGhpcy5fdm9pY2VFdmVudERpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzQ29ubmVjdGVkLmdldCgpKSB7IHJldHVybjsgfVxuXHRcdFx0dGhpcy5fdHJhbnNjcmlwdFR1cm5zLnNldChbeyBzcGVha2VyOiAndXNlcicsIHRleHQ6ICdDcmVhdGUgYSBuZXcgUmVhY3QgY29tcG9uZW50IGZvciB0aGUgZGFzaGJvYXJkJywgY29tbWl0dGVkOiAnQ3JlYXRlIGEgbmV3IFJlYWN0IGNvbXBvbmVudCBmb3IgdGhlIGRhc2hib2FyZCcsIGlzUGFydGlhbDogZmFsc2UgfV0sIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl92b2ljZVN0YXRlLnNldCgnaWRsZScsIHVuZGVmaW5lZCk7XG5cdFx0fSwgMzAwMCkpO1xuXG5cdFx0Ly8gQXNzaXN0YW50IHJlc3BvbnNlXG5cdFx0dGhpcy5fdm9pY2VFdmVudERpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzQ29ubmVjdGVkLmdldCgpKSB7IHJldHVybjsgfVxuXHRcdFx0dGhpcy5fdHJhbnNjcmlwdFR1cm5zLnNldChbXG5cdFx0XHRcdHsgc3BlYWtlcjogJ3VzZXInLCB0ZXh0OiAnQ3JlYXRlIGEgbmV3IFJlYWN0IGNvbXBvbmVudCBmb3IgdGhlIGRhc2hib2FyZCcsIGNvbW1pdHRlZDogJ0NyZWF0ZSBhIG5ldyBSZWFjdCBjb21wb25lbnQgZm9yIHRoZSBkYXNoYm9hcmQnLCBpc1BhcnRpYWw6IGZhbHNlIH0sXG5cdFx0XHRcdHsgc3BlYWtlcjogJ2Fzc2lzdGFudCcsIHRleHQ6ICdJXFwnbGwgY3JlYXRlIGEgRGFzaGJvYXJkIGNvbXBvbmVudCB3aXRoIHNvbWUgd2lkZ2V0cy4uLicsIGNvbW1pdHRlZDogJycsIGlzUGFydGlhbDogZmFsc2UgfSxcblx0XHRcdF0sIHVuZGVmaW5lZCk7XG5cdFx0fSwgNDUwMCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZSBhIHRlcm1pbmFsLCBub24tcmVjb3ZlcmFibGUgY2xvc2UgKGUuZy4gYW5vdGhlciB3aW5kb3cgdG9vayBvdmVyIHRoZVxuXHQgKiBzaW5nbGUgdm9pY2Ugc2Vzc2lvbiAtPiBiYWNrZW5kIGNsb3NlcyB0aGlzIG9uZSB3aXRoIDQwMDgpLiBVbmxpa2UgYVxuXHQgKiB0cmFuc2llbnQgZHJvcCAoc2VlIHtAbGluayBfb25Db25uZWN0aW9uTG9zdH0pLCB0aGVyZSBpcyBubyByZWNvbm5lY3QsIHNvXG5cdCAqIGZ1bGx5IHRlYXIgZG93biBjYXB0dXJlL3BsYXliYWNrIGFuZCBzZXR0bGUgdG8gYSBjbGVhbiwgcmVzdGFydGFibGUgc3RhdGVcblx0ICogaW5zdGVhZCBvZiBsZWF2aW5nIHRoZSBVSSBzdHVjayBvbiBcIlJlY29ubmVjdGluZy4uLlwiLiBGaXJlcyBiZWZvcmUgdGhlXG5cdCAqIGNvbm5lY3Rpb24tc3RhdGUgY2hhbmdlLCBzbyBgX2ZhdGFsRGlzY29ubmVjdGAgc2hvcnQtY2lyY3VpdHMgdGhhdCBwYXRoLlxuXHQgKi9cblx0cHJpdmF0ZSBfaGFuZGxlRmF0YWxEaXNjb25uZWN0KGNvZGU6IG51bWJlciwgcmVhc29uOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW3ZvaWNlXSBmYXRhbCBkaXNjb25uZWN0IGNvZGU9JHtjb2RlfSByZWFzb249JHtyZWFzb259OyB0ZWFyaW5nIGRvd24gKG5vIHJlY29ubmVjdClgKTtcblx0XHR0aGlzLl9mYXRhbERpc2Nvbm5lY3QgPSB0cnVlO1xuXHRcdC8vIE5vIHJlY29ubmVjdCBpcyBjb21pbmc6IHJlbGVhc2UgdGhlIG1pYyBhbmQgcGxheWJhY2sgc28gdGhlIE9TXG5cdFx0Ly8gbWljLWluLXVzZSBpbmRpY2F0b3IgY2xlYXJzIGFuZCBubyBzdGFsZSBhdWRpbyBsaW5nZXJzLiBEcm9wIGFueVxuXHRcdC8vIHF1ZXVlZC9wZW5kaW5nIGF1ZGlvIEJFRk9SRSBjbG9zaW5nIHRoZSBjb250ZXh0OiBjbG9zZUNvbnRleHQoKVxuXHRcdC8vIHN5bmNocm9ub3VzbHkgZmlyZXMgb25QbGF5YmFja1N0b3BwZWQgd2hpbGUgYXVkaW8gaXMgYWN0aXZlLCBhbmQgdGhhdFxuXHRcdC8vIGhhbmRsZXIgcmUtc2NoZWR1bGVzIF9wcm9jZXNzUXVldWUoKSB+NTAwbXMgbGF0ZXIgd2hlbiB0aGUgcXVldWUgaXNcblx0XHQvLyBub24tZW1wdHkgLSB3aGljaCB3b3VsZCByZWNyZWF0ZSB0aGUgY29udGV4dCBhbmQgcGxheSBzdGFsZSBhdWRpb1xuXHRcdC8vIGFmdGVyIHRoaXMgdGVybWluYWwgZGlzY29ubmVjdC5cblx0XHR0aGlzLl9hdWRpb1F1ZXVlLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5fY3VycmVudFBsYXliYWNrU2Vzc2lvbklkID0gbnVsbDtcblx0XHR0aGlzLl9jdXJyZW50UGxheWJhY2tSZXNwb25zZUlkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2N1cnJlbnRQbGF5YmFja05hcnJhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9pc1Byb2Nlc3NpbmdRdWV1ZSA9IGZhbHNlO1xuXHRcdHRoaXMudHRzUGxheWJhY2tTZXJ2aWNlLmNsb3NlQ29udGV4dCgpO1xuXHRcdHRoaXMubWljQ2FwdHVyZVNlcnZpY2Uuc3RvcENhcHR1cmUoKTtcblx0XHR0aGlzLl9wdHRIZWxkID0gZmFsc2U7XG5cdFx0dGhpcy5fcHR0VG9nZ2xlTW9kZSA9IGZhbHNlO1xuXHRcdC8vIE5vIHJlY29ubmVjdCBpcyBjb21pbmcgYW5kIGEgbGF0ZXIgY29ubmVjdCgpIGRvZXMgbm90IHJlc2V0IG5hcnJhdGlvblxuXHRcdC8vIGJvb2trZWVwaW5nLCBzbyBjbGVhciB0aGUgZGVmZXJyZWQvaW4tZmxpZ2h0IG5hcnJhdGlvbiBzdGF0ZSBhbmQgaXRzXG5cdFx0Ly8gdGltZXJzIGhlcmUgKGFzIGRpc2Nvbm5lY3QoKSBkb2VzKS4gT3RoZXJ3aXNlIGEgbmFycmF0aW9uX3VuYmxvY2tlZCBvbiBhXG5cdFx0Ly8gbmV3IGNvbm5lY3Rpb24gY291bGQgcmV0cnkgbmFycmF0aW9uIGZyb20gdGhpcyBldmljdGVkIHNlc3Npb24sIGFuZCB0aGVcblx0XHQvLyBzb2xpY2l0ZWQtbmFycmF0aW9uIHNhZmV0eSB0aW1lcnMgd291bGQgbGluZ2VyIHBhc3QgdGVhcmRvd24uXG5cdFx0Zm9yIChjb25zdCBbbmFycmF0aW9uSWQsIHBlbmRpbmddIG9mIHRoaXMuX3BlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb25zKSB7XG5cdFx0XHR0aGlzLl9jbGVhclBlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb24obmFycmF0aW9uSWQsIHBlbmRpbmcpO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nU29saWNpdGVkTmFycmF0aW9ucy5jbGVhcigpO1xuXHRcdHRoaXMuX3NvbGljaXRlZE5hcnJhdGlvbklkcy5jbGVhcigpO1xuXHRcdHRoaXMuX2NhbmNlbGxlZFBlbmRpbmdOYXJyYXRpb25JZHMuY2xlYXIoKTtcblx0XHR0aGlzLl9wZW5kaW5nTmFycmF0aW9uUmV0cmllcy5jbGVhcigpO1xuXHRcdHRoaXMuX3ZvaWNlUHJvZ3Jlc3NMaXN0ZW5lcnMuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cdFx0dGhpcy5fdm9pY2VQcm9ncmVzc1Nlc3Npb25CeVJlc3BvbnNlLmNsZWFyKCk7XG5cdFx0dGhpcy5fbGFzdFNwb2tlbkF0QnlTZXNzaW9uLmNsZWFyKCk7XG5cdFx0dGhpcy5fZGVmZXJyZWROYXJyYXRpb25zLmNsZWFyKCk7XG5cdFx0dGhpcy5fbmFycmF0ZWRQZW5kaW5nLmNsZWFyKCk7XG5cdFx0Ly8gVGVybWluYWwgZGlzY29ubmVjdCAobm8gcmVjb25uZWN0KTogZHJvcCB0aGUgcm91dGluZyB0YXJnZXQgYW5kXG5cdFx0Ly8gcGVuZGluZy1jb25maXJtYXRpb24gc25hcHNob3QsIGFuZCBzdXBwcmVzcyB0aGUgdHJhY2tlciBzbyBjb25uZWN0KClcblx0XHQvLyBpc24ndCByZS1waW5uZWQgdG8gdGhpcyBldmljdGVkIHNlc3Npb24gKHNlZSBkaXNjb25uZWN0KCkpLlxuXHRcdHRoaXMuX3RhcmdldFNlc3Npb24uc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9zdXBwcmVzc1BlbmRpbmdDb25maXJtYXRpb25zVW50aWxDb25uZWN0KCk7XG5cdFx0dGhpcy5fcGVuZGluZ1Rvb2xDb25maXJtYXRpb25zLnNldChbXSwgdW5kZWZpbmVkKTtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLl9pc0Nvbm5lY3Rpbmcuc2V0KGZhbHNlLCB0eCk7XG5cdFx0XHR0aGlzLl9pc1JlY29ubmVjdGluZy5zZXQoZmFsc2UsIHR4KTtcblx0XHRcdHRoaXMuX2lzQ29ubmVjdGVkLnNldChmYWxzZSwgdHgpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3ZvaWNlU3RhdGUuc2V0KCdlcnJvcicsIHVuZGVmaW5lZCk7XG5cdFx0Ly8gQ29kZSA0MDA4ID0gdGhlIHNlc3Npb24gd2FzIHRha2VuIG92ZXIgYnkgYW5vdGhlciB3aW5kb3cuIFN1cmZhY2UgYW5cblx0XHQvLyBhY3Rpb25hYmxlIG1lc3NhZ2U7IGFueSBvdGhlciBmYXRhbCBjb2RlIHNob3dzIHRoZSBzZXJ2ZXIgcmVhc29uLlxuXHRcdGNvbnN0IG1lc3NhZ2UgPSBjb2RlID09PSA0MDA4XG5cdFx0XHQ/IGxvY2FsaXplKCd2b2ljZS5tb3ZlZFRvQW5vdGhlcldpbmRvdycsIFwiVm9pY2UgbW92ZWQgdG8gYW5vdGhlciB3aW5kb3cuIFRhcCB0byBzdGFydC5cIilcblx0XHRcdDogKHJlYXNvbiB8fCBsb2NhbGl6ZSgndm9pY2UuZmF0YWxEaXNjb25uZWN0JywgXCJWb2ljZSBkaXNjb25uZWN0ZWQuIFRhcCB0byBzdGFydC5cIikpO1xuXHRcdHRoaXMuX3N0YXR1c1RleHQuc2V0KG1lc3NhZ2UsIHVuZGVmaW5lZCk7XG5cdFx0Ly8gVGhlIHN0YXR1cyB0ZXh0IG9ubHkgcmVuZGVycyBpbnRvIGEgcGxhaW4gZGl2LCBzbyBzY3JlZW4tcmVhZGVyIHVzZXJzXG5cdFx0Ly8gb3RoZXJ3aXNlIGdldCBubyBub3RpZmljYXRpb24gdGhhdCByZWNvcmRpbmcgc3RvcHBlZCBvciB0aGF0IGFub3RoZXJcblx0XHQvLyB3aW5kb3cgdG9vayBvdmVyLiBBbm5vdW5jZSBpdCBhc3NlcnRpdmVseSB2aWEgQVJJQS5cblx0XHRhcmlhQWxlcnQobWVzc2FnZSk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkNvbm5lY3Rpb25Mb3N0KCk6IHZvaWQge1xuXHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbdm9pY2VdIGNvbm5lY3Rpb24gbG9zdCwgcHJlc2VydmluZyBzdGF0ZSBmb3IgcmVjb25uZWN0Jyk7XG5cdFx0Ly8gRG9uJ3Qgc3RvcCB0aGUgbWljIGhlcmUgXHUyMDE0IGtlZXAgdGhlIE1lZGlhU3RyZWFtIGFsaXZlIGFjcm9zcyB0aGVcblx0XHQvLyB0cmFuc2llbnQgZGlzY29ubmVjdCBzbyB0aGUgT1MgbWljLWluLXVzZSBpbmRpY2F0b3IgZG9lc24ndCBibGlua1xuXHRcdC8vIGFuZCBzbyByZWNvbm5lY3Rpb24gZmVlbHMgc2VhbWxlc3MuIFRoZSBtaWMgaXMgY3ljbGVkIChzdG9wK3N0YXJ0KVxuXHRcdC8vIHdoZW4gdGhlIFdTIGNvbWVzIGJhY2ssIG9yIGZ1bGx5IHN0b3BwZWQgb24gdGVybWluYWwgYGRpc2Nvbm5lY3QoKWAuXG5cdFx0dGhpcy50dHNQbGF5YmFja1NlcnZpY2UuY2xvc2VDb250ZXh0KCk7XG5cdFx0dGhpcy5fcHR0SGVsZCA9IGZhbHNlO1xuXHRcdHRoaXMuX3B0dFRvZ2dsZU1vZGUgPSBmYWxzZTtcblx0XHR0aGlzLl9wdHRDdXJyZW50VHVybklkID0gJyc7XG5cdFx0dGhpcy5fcmVzZXRUcmFuc2NyaXB0aW9uVHVybigpO1xuXHRcdHRoaXMuX2lzQ29ubmVjdGVkLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9pc1JlY29ubmVjdGluZy5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl92b2ljZVN0YXRlLnNldCgnaWRsZScsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fc3RhdHVzVGV4dC5zZXQoJ1JlY29ubmVjdGluZy4uLicsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF9iZWdpblRyYW5zY3JpcHRpb25UdXJuKHR1cm5JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJhbnNjcmlwdGlvblR1cm5TdGF0ZSA9IHtcblx0XHRcdHR1cm5JZCxcblx0XHRcdGhpZ2hlc3RSZXZpc2lvbjogdW5kZWZpbmVkLFxuXHRcdFx0cGhhc2U6ICdhY3RpdmUnLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9tYXJrVHJhbnNjcmlwdGlvblR1cm5QZW5kaW5nKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl90cmFuc2NyaXB0aW9uVHVyblN0YXRlPy50dXJuSWQgPT09IHRoaXMuX3B0dEN1cnJlbnRUdXJuSWQgJiYgdGhpcy5fdHJhbnNjcmlwdGlvblR1cm5TdGF0ZS5waGFzZSA9PT0gJ2FjdGl2ZScpIHtcblx0XHRcdHRoaXMuX3RyYW5zY3JpcHRpb25UdXJuU3RhdGUucGhhc2UgPSAncGVuZGluZyc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVzZXRUcmFuc2NyaXB0aW9uVHVybigpOiB2b2lkIHtcblx0XHR0aGlzLl90cmFuc2NyaXB0aW9uVHVyblN0YXRlID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlVHVybkF1dG9FbmRlZChldmVudDogSVZvaWNlVHVybkF1dG9FbmRlZCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fcHR0SGVsZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZXZlbnQudHVybklkICYmIGV2ZW50LnR1cm5JZCAhPT0gdGhpcy5fcHR0Q3VycmVudFR1cm5JZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wdHRUb2dnbGVNb2RlID0gZmFsc2U7XG5cdFx0dGhpcy5fZmluaXNoUHR0KCdhdXRvJyk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVCYXJnZUluKGV2ZW50OiBJVm9pY2VCYXJnZUluKTogdm9pZCB7XG5cdFx0aWYgKGV2ZW50LnR1cm5JZCkge1xuXHRcdFx0aWYgKHRoaXMuX3RyYW5zY3JpcHRpb25UdXJuU3RhdGU/LnR1cm5JZCAhPT0gZXZlbnQudHVybklkKSB7XG5cdFx0XHRcdHRoaXMuX2JlZ2luVHJhbnNjcmlwdGlvblR1cm4oZXZlbnQudHVybklkKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmVzZXRUcmFuc2NyaXB0aW9uVHVybigpO1xuXHRcdH1cblx0XHR0aGlzLl9zdGFydFVzZXJUdXJuKCk7XG5cdFx0dGhpcy5fcmVtZW1iZXJJbnRlcnJ1cHRlZEF1ZGlvSWQoZXZlbnQuaW50ZXJydXB0ZWRUdXJuSWQpO1xuXHRcdHRoaXMuX2Ryb3BJbnRlcnJ1cHRlZERlZmVycmVkQXVkaW8oKTtcblx0XHR0aGlzLl9pbnRlcnJ1cHRBc3Npc3RhbnRQbGF5YmFjaygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtZW1iZXJJbnRlcnJ1cHRlZFBsYXliYWNrSWRzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbWVtYmVySW50ZXJydXB0ZWRBdWRpb0lkKHRoaXMuX2N1cnJlbnRQbGF5YmFja1Jlc3BvbnNlSWQpO1xuXHRcdGZvciAoY29uc3QgcXVldWVkIG9mIHRoaXMuX2F1ZGlvUXVldWUpIHtcblx0XHRcdHRoaXMuX3JlbWVtYmVySW50ZXJydXB0ZWRBdWRpb0lkKHF1ZXVlZC5yZXNwb25zZUlkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZW1lbWJlckludGVycnVwdGVkQXVkaW9JZChpZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCFpZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pbnRlcnJ1cHRlZEF1ZGlvSWRzLmRlbGV0ZShpZCk7XG5cdFx0aWYgKHRoaXMuX2ludGVycnVwdGVkQXVkaW9JZHMuc2l6ZSA+PSA2NCkge1xuXHRcdFx0Y29uc3Qgb2xkZXN0ID0gdGhpcy5faW50ZXJydXB0ZWRBdWRpb0lkcy52YWx1ZXMoKS5uZXh0KCkudmFsdWU7XG5cdFx0XHRpZiAob2xkZXN0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5faW50ZXJydXB0ZWRBdWRpb0lkcy5kZWxldGUob2xkZXN0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5faW50ZXJydXB0ZWRBdWRpb0lkcy5hZGQoaWQpO1xuXHRcdHRoaXMuX3Jlc3BvbnNlUm91dGVzLmRlbGV0ZShpZCk7XG5cdH1cblxuXHRwcml2YXRlIF9pc0ludGVycnVwdGVkQXVkaW8oZXZlbnQ6IElWb2ljZUF1ZGlvUmVzcG9uc2UpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKGV2ZW50LnR1cm5JZCAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX2ludGVycnVwdGVkQXVkaW9JZHMuaGFzKGV2ZW50LnR1cm5JZCkpXG5cdFx0XHR8fCAoZXZlbnQucmVzcG9uc2VJZCAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX2ludGVycnVwdGVkQXVkaW9JZHMuaGFzKGV2ZW50LnJlc3BvbnNlSWQpKTtcblx0fVxuXG5cdHByaXZhdGUgX2Ryb3BJbnRlcnJ1cHRlZERlZmVycmVkQXVkaW8oKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBba2V5LCByZXNwb25zZXNdIG9mIHRoaXMuX2RlZmVycmVkUmVzcG9uc2VzKSB7XG5cdFx0XHRjb25zdCBrZXB0ID0gcmVzcG9uc2VzLmZpbHRlcihyZXNwb25zZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGludGVycnVwdGVkID0gKHJlc3BvbnNlLnR1cm5JZCAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX2ludGVycnVwdGVkQXVkaW9JZHMuaGFzKHJlc3BvbnNlLnR1cm5JZCkpXG5cdFx0XHRcdFx0fHwgKHJlc3BvbnNlLnJlc3BvbnNlSWQgIT09IHVuZGVmaW5lZCAmJiB0aGlzLl9pbnRlcnJ1cHRlZEF1ZGlvSWRzLmhhcyhyZXNwb25zZS5yZXNwb25zZUlkKSk7XG5cdFx0XHRcdGlmIChpbnRlcnJ1cHRlZCAmJiByZXNwb25zZS5yZXNwb25zZUlkKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVzcG9uc2VSb3V0ZXMuZGVsZXRlKHJlc3BvbnNlLnJlc3BvbnNlSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiAhaW50ZXJydXB0ZWQ7XG5cdFx0XHR9KTtcblx0XHRcdGlmIChrZXB0Lmxlbmd0aCA9PT0gcmVzcG9uc2VzLmxlbmd0aCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChrZXB0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9kZWZlcnJlZFJlc3BvbnNlcy5kZWxldGUoa2V5KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2RlZmVycmVkUmVzcG9uc2VzLnNldChrZXksIGtlcHQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbWF5YmVIaWRlSW5kaWNhdG9yKGtleSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlVHJhbnNjcmlwdGlvbihldmVudDogSVZvaWNlVHJhbnNjcmlwdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fdHJhbnNjcmlwdGlvblR1cm5TdGF0ZTtcblx0XHRpZiAoZXZlbnQudHVybklkKSB7XG5cdFx0XHRpZiAoIXN0YXRlIHx8IHN0YXRlLnR1cm5JZCAhPT0gZXZlbnQudHVybklkIHx8IHN0YXRlLnBoYXNlID09PSAnZmluYWwnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChldmVudC5yZXZpc2lvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlmIChzdGF0ZS5oaWdoZXN0UmV2aXNpb24gIT09IHVuZGVmaW5lZCAmJiBldmVudC5yZXZpc2lvbiA8PSBzdGF0ZS5oaWdoZXN0UmV2aXNpb24pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0c3RhdGUuaGlnaGVzdFJldmlzaW9uID0gZXZlbnQucmV2aXNpb247XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl90ZWxlbWV0cnlGaXJzdFRyYW5zY3JpcHRpb25NcyAmJiB0aGlzLl90ZWxlbWV0cnlQdHREb3duTXMpIHtcblx0XHRcdHRoaXMuX3RlbGVtZXRyeUZpcnN0VHJhbnNjcmlwdGlvbk1zID0gRGF0ZS5ub3coKTtcblx0XHR9XG5cblx0XHRjb25zdCBpc1BhcnRpYWwgPSBldmVudC5zdGF0dXMgPT09ICdwYXJ0aWFsJztcblx0XHQvLyBMaXZlICh3b3JkLWJ5LXdvcmQpIHRyYW5zY3JpcHRzIGFyZSBvcHQtaW46IHdoZW4gZGlzYWJsZWQsIHdlIGRvbid0XG5cdFx0Ly8gcmVuZGVyIHRoZSBpbnRlcmltIHN0cmVhbWluZyB0ZXh0IGFzIHRoZSB1c2VyIHNwZWFrcyBhbmQgb25seSBhY3Qgb25cblx0XHQvLyB0aGUgZmluYWwgdHJhbnNjcmlwdCwgc28gdGhlIHVzZXIgc3RpbGwgc2VlcyB3aGF0IHRoZXkgc2FpZCBvbmNlIHRoZVxuXHRcdC8vIHV0dGVyYW5jZSBzZXR0bGVzLlxuXHRcdGlmIChpc1BhcnRpYWwgJiYgIXRoaXMuX2lzTGl2ZVRyYW5zY3JpcHRFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlVXNlclR1cm4oZXZlbnQudGV4dCwgZXZlbnQuY29tbWl0dGVkID8/ICcnLCBpc1BhcnRpYWwpO1xuXHRcdGlmIChpc1BhcnRpYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX3B0dEhlbGQpIHtcblx0XHRcdHRoaXMuX3ZvaWNlU3RhdGUuc2V0KCdwcm9jZXNzaW5nJywgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX3N0YXR1c1RleHQuc2V0KCdQcm9jZXNzaW5nLi4uJywgdW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0dGhpcy5fcGVyc2lzdFR1cm4oJ3VzZXInLCBldmVudC50ZXh0KTtcblx0XHRpZiAoZXZlbnQudHVybklkICYmIHN0YXRlKSB7XG5cdFx0XHRzdGF0ZS5waGFzZSA9ICdmaW5hbCc7XG5cdFx0fVxuXHR9XG5cblx0cHR0RG93bihzb3VyY2U6ICdleHBsaWNpdCcgfCAnYXV0bycgfCAnY29ubmVjdCcgPSAnZXhwbGljaXQnLCBmb3JjZU5ld1R1cm4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNDb25uZWN0ZWQuZ2V0KCkpIHsgdGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbdm9pY2VdIHB0dERvd24gaWdub3JlZDogbm90IGNvbm5lY3RlZCcpOyByZXR1cm47IH1cblxuXHRcdC8vIEEgcHJlc3MgaXMgcGFzc2l2ZSB3aGVuIHRoZSBtaWMgb3BlbmVkIHdpdGhvdXQgYSBkZWxpYmVyYXRlIHVzZXIgZ2VzdHVyZVxuXHRcdC8vIChhdXRvLWxpc3RlbiByZS1hcm0gb3IgY29ubmVjdCkuIFBhc3NpdmUgdHVybnMgdGVsbCB0aGUgYmFja2VuZCBub3QgdG9cblx0XHQvLyBsYXRjaCBgdXNlcl9pc19zcGVha2luZ2AsIHNvIGEgY2xpZW50LWRyaXZlbiBuYXJyYXRpb24gaXNuJ3Qgc3RyYW5kZWQuXG5cdFx0Y29uc3QgcGFzc2l2ZSA9IHNvdXJjZSAhPT0gJ2V4cGxpY2l0JztcblxuXHRcdC8vIEEgZnJlc2ggdXNlciBwcmVzcyBzdGFydHMgYSBuZXcgdHVybiBcdTIwMTQgbm8gbG9uZ2VyIHN1cHByZXNzIHNlbmRfdG9fY2hhdFxuXHRcdC8vIGZyb20gYSBwcmV2aW91c2x5IGRpc2NhcmRlZCB0dXJuLCBub3IgcGluIGl0IHRvIGEgcHJpb3Igc2Vzc2lvbi5cblx0XHR0aGlzLl9zdXBwcmVzc1NlbmRUb0NoYXRVbnRpbCA9IDA7XG5cdFx0dGhpcy5fc2V0UGlubmVkU3VibWl0U2Vzc2lvbih1bmRlZmluZWQpO1xuXG5cdFx0Ly8gVG9nZ2xlIG1vZGU6IHNlY29uZCB0YXAgZmluaXNoZXMgcmVjb3JkaW5nLiBBIGZvcmNlZCBuZXcgdHVybiAoZS5nLlxuXHRcdC8vIGhvbGQtdG8tdGFsayBwcmVzcykgY2FuY2VscyBhbnkgcGVuZGluZyB0b2dnbGUgbW9kZSBhbmQgcmVjb3JkcyBmcmVzaC5cblx0XHRpZiAoZm9yY2VOZXdUdXJuKSB7XG5cdFx0XHR0aGlzLl9wdHRUb2dnbGVNb2RlID0gZmFsc2U7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9wdHRUb2dnbGVNb2RlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1t2b2ljZV0gcHR0RG93bjogdG9nZ2xlLW1vZGUgc2Vjb25kIHRhcCAtPiBmaW5pc2hpbmcgdHVybicpO1xuXHRcdFx0dGhpcy5fcHR0VG9nZ2xlTW9kZSA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fZmluaXNoUHR0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUHJvbW90ZSBhIHBhc3NpdmUgYmFyZ2UtaW4gbGlzdGVuIGludG8gYSB1c2VyLWRyaXZlbiBpbnRlcnJ1cHQuIFRoZVxuXHRcdC8vIG1pYyBpcyBhbHJlYWR5IHN0cmVhbWluZyB0aGlzIHR1cm4gdG8gdGhlIGJhY2tlbmQgKHB0dF9zdGFydCBhbHJlYWR5XG5cdFx0Ly8gc2VudCksIHNvIHdlIGtlZXAgdGhlIHNhbWUgdHVybiAobm8gcmUtYWNxdWlyaW5nIHRoZSBtaWMgYW5kIG5vIHNlY29uZFxuXHRcdC8vIHB0dF9zdGFydCkgYW5kIGFwcGx5IHRoZSBpbnRlcnJ1cHQgc2lkZSBlZmZlY3RzLiBSZWxlYXNpbmcgdGhlIGJ1dHRvblxuXHRcdC8vIGFmdGVyd2FyZHMgZ29lcyB0aHJvdWdoIHRoZSBub3JtYWwgYHB0dFVwKClgIHBhdGguXG5cdFx0aWYgKHRoaXMuX2JhcmdlSW5MaXN0ZW5BY3RpdmUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW3ZvaWNlXSBwdHREb3duOiBwcm9tb3RpbmcgcGFzc2l2ZSBiYXJnZS1pbiBsaXN0ZW4gdG8gdXNlciBpbnRlcnJ1cHQnKTtcblx0XHRcdGNvbnN0IHNob3duU2Vzc2lvbklkID0gdGhpcy5fc2hvd25TZXNzaW9uSWQoKTtcblx0XHRcdGlmIChzaG93blNlc3Npb25JZCkge1xuXHRcdFx0XHR0aGlzLl9jYW5jZWxWb2ljZVByb2dyZXNzKHNob3duU2Vzc2lvbklkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3ByZWVtcHRDaGVja3BvaW50UGxheWJhY2sodW5kZWZpbmVkLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHRcdHRoaXMuX2JhcmdlSW5MaXN0ZW5BY3RpdmUgPSBmYWxzZTtcblx0XHRcdC8vIEEgcHJvbW90ZWQgcHJlc3MgaXMgYSBkZWxpYmVyYXRlIGludGVycnVwdCwgc28gaXQgbGF0Y2hlcyB0aGUgYmFja2VuZFxuXHRcdFx0Ly8gbGlrZSBhIGZyZXNoIHByZXNzOiBjbGVhciB0aGUgcGFzc2l2ZSBmbGFnIChrZXB0IGNvbnNpc3RlbnQgd2l0aCB0aGVcblx0XHRcdC8vIGZyZXNoLXByZXNzIHBhdGggYmVsb3cpIHNvIHBsYXliYWNrIHByZXAgcHJlc2VydmVzIHRoaXMgaGVsZCBwcmVzc1xuXHRcdFx0Ly8gaW5zdGVhZCBvZiB0ZWFyaW5nIGRvd24gdGhlIHVzZXIncyBhY3RpdmUgc3BlZWNoIHR1cm4gZm9yIG5hcnJhdGlvbi5cblx0XHRcdHRoaXMuX3B0dEN1cnJlbnRUdXJuUGFzc2l2ZSA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fYXV0b0xpc3RlblN1cHByZXNzZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3B0dFdhaXRpbmdGb3JQbGF5YmFjayA9IGZhbHNlO1xuXHRcdFx0Ly8gUmUtYW5jaG9yIGhvbGQgdGltaW5nIHRvIHRoZSByZWFsIHByZXNzIHNvIHB0dFVwJ3MgdGFwL2hvbGQgc3BsaXQgd29ya3MuXG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlQdHREb3duTXMgPSBEYXRlLm5vdygpO1xuXHRcdFx0dGhpcy5fdGVsZW1ldHJ5Rmlyc3RUcmFuc2NyaXB0aW9uTXMgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlUdXJuQ291bnQrKztcblx0XHRcdHRoaXMuX3JlbWVtYmVySW50ZXJydXB0ZWRQbGF5YmFja0lkcygpO1xuXHRcdFx0dGhpcy5fdGVsZW1ldHJ5VHRzSW50ZXJydXB0ZWQgPSB0aGlzLl90ZWxlbWV0cnlUdHNJbnRlcnJ1cHRlZCB8fCB0aGlzLnR0c1BsYXliYWNrU2VydmljZS5pc1BsYXlpbmc7XG5cdFx0XHRpZiAodGhpcy5fZGVsYXllZE1pY1N0b3BUaW1lcikge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fZGVsYXllZE1pY1N0b3BUaW1lcik7XG5cdFx0XHRcdHRoaXMuX2RlbGF5ZWRNaWNTdG9wVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jYW5jZWxUcmFuc2NyaXB0RmFkZSgpO1xuXHRcdFx0dGhpcy5fc3RhcnRVc2VyVHVybigpO1xuXHRcdFx0dGhpcy5fYXVkaW9RdWV1ZS5sZW5ndGggPSAwO1xuXHRcdFx0dGhpcy5fY3VycmVudFBsYXliYWNrU2Vzc2lvbklkID0gbnVsbDtcblx0XHRcdHRoaXMuX2N1cnJlbnRQbGF5YmFja1Jlc3BvbnNlSWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9jdXJyZW50UGxheWJhY2tOYXJyYXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9jdXJyZW50UGxheWJhY2tGaW5hbGl6ZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2lzUHJvY2Vzc2luZ1F1ZXVlID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9zdXBwcmVzc0luY29taW5nQXVkaW8gPSB0cnVlO1xuXHRcdFx0dGhpcy50dHNQbGF5YmFja1NlcnZpY2Uuc3RvcFBsYXliYWNrKCk7XG5cdFx0XHR0aGlzLl92b2ljZVN0YXRlLnNldCgnbGlzdGVuaW5nJywgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX3N0YXR1c1RleHQuc2V0KCdMaXN0ZW5pbmcuLi4nLCB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKHNvdXJjZSAhPT0gJ2F1dG8nKSB7XG5cdFx0XHRcdHRoaXMuX3BsYXlMaXN0ZW5pbmdTdGFydGVkU2lnbmFsKHNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuX3B0dE1heER1cmF0aW9uVGltZXIpIHtcblx0XHRcdFx0dGhpcy5fcHR0TWF4RHVyYXRpb25UaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9wdHRIZWxkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zdGF0dXNUZXh0LnNldCgnTWF4IGR1cmF0aW9uIHJlYWNoZWQnLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0dGhpcy5wdHRVcCgnaW50ZXJuYWwnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIFZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuX1BUVF9NQVhfRFVSQVRJT05fTVMpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9wdHRIZWxkKSB7IHRoaXMubG9nU2VydmljZS50cmFjZSgnW3ZvaWNlXSBwdHREb3duIGlnbm9yZWQ6IGFscmVhZHkgaGVsZCcpOyByZXR1cm47IH1cblx0XHRpZiAoc291cmNlID09PSAnZXhwbGljaXQnKSB7XG5cdFx0XHRjb25zdCBzaG93blNlc3Npb25JZCA9IHRoaXMuX3Nob3duU2Vzc2lvbklkKCk7XG5cdFx0XHRpZiAoc2hvd25TZXNzaW9uSWQpIHtcblx0XHRcdFx0dGhpcy5fY2FuY2VsVm9pY2VQcm9ncmVzcyhzaG93blNlc3Npb25JZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wcmVlbXB0Q2hlY2twb2ludFBsYXliYWNrKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0fVxuXHRcdHRoaXMuX3B0dEhlbGQgPSB0cnVlO1xuXHRcdHRoaXMuX3B0dEN1cnJlbnRUdXJuUGFzc2l2ZSA9IHBhc3NpdmU7XG5cdFx0dGhpcy5fYXV0b0xpc3RlblN1cHByZXNzZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9jbGVhckF1dG9MaXN0ZW5UaW1lcigpO1xuXHRcdHRoaXMuX3B0dEN1cnJlbnRUdXJuSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHR0aGlzLl9iZWdpblRyYW5zY3JpcHRpb25UdXJuKHRoaXMuX3B0dEN1cnJlbnRUdXJuSWQpO1xuXHRcdHRoaXMuX3B0dFdhaXRpbmdGb3JQbGF5YmFjayA9IGZhbHNlO1xuXHRcdHRoaXMuX3RlbGVtZXRyeVB0dERvd25NcyA9IERhdGUubm93KCk7XG5cdFx0dGhpcy5fdGVsZW1ldHJ5Rmlyc3RUcmFuc2NyaXB0aW9uTXMgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fdGVsZW1ldHJ5VHVybkNvdW50Kys7XG5cdFx0dGhpcy5fcmVtZW1iZXJJbnRlcnJ1cHRlZFBsYXliYWNrSWRzKCk7XG5cdFx0dGhpcy5fdGVsZW1ldHJ5VHRzSW50ZXJydXB0ZWQgPSB0aGlzLl90ZWxlbWV0cnlUdHNJbnRlcnJ1cHRlZCB8fCB0aGlzLnR0c1BsYXliYWNrU2VydmljZS5pc1BsYXlpbmc7XG5cdFx0aWYgKHRoaXMuX2RlbGF5ZWRNaWNTdG9wVGltZXIpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9kZWxheWVkTWljU3RvcFRpbWVyKTtcblx0XHRcdHRoaXMuX2RlbGF5ZWRNaWNTdG9wVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX2NhbmNlbFRyYW5zY3JpcHRGYWRlKCk7XG5cdFx0Ly8gTmV3IHVzZXIgdHVybiBwdXNoZWQgdG8gdGhlIHJvbGxpbmcgYnVmZmVyIFx1MjAxNCB0aGUgcHJldmlvdXMgYXNzaXN0YW50XG5cdFx0Ly8gdHVybiAoaWYgYW55KSBzdGF5cyB2aXNpYmxlIGFib3ZlIGFzIGNvbnZlcnNhdGlvbiBjb250ZXh0LlxuXHRcdHRoaXMuX3N0YXJ0VXNlclR1cm4oKTtcblxuXHRcdC8vIENhbmNlbCB0aGUgYXNzaXN0YW50IHR1cm4gZnVsbHk6XG5cdFx0Ly8gICAxLiB0dHNQbGF5YmFja1NlcnZpY2Uuc3RvcFBsYXliYWNrKCkgXHUyMDE0IGtpbGxzIFdlYkF1ZGlvIHNvdXJjZSArIGludmFsaWRhdGVzXG5cdFx0Ly8gICAgICBpbi1mbGlnaHQgZGVjb2RlcyB2aWEgaXRzIGdlbmVyYXRpb24gY291bnRlci5cblx0XHQvLyAgIDIuIF9hdWRpb1F1ZXVlIGNsZWFyZWQgXHUyMDE0IGRyb3AgYW55IGNodW5rcyBxdWV1ZWQgZm9yIGNyb3NzLXNlc3Npb24gcGxheWJhY2suXG5cdFx0Ly8gICAzLiBfY3VycmVudFBsYXliYWNrU2Vzc2lvbklkIHJlc2V0IFx1MjAxNCBfZW5xdWV1ZUF1ZGlvJ3MgZmFzdC1wYXRoIHdvbid0IGFwcGVuZC5cblx0XHQvLyAgIDQuIF9zdXBwcmVzc0luY29taW5nQXVkaW8gc2V0IFx1MjAxNCBhbnkgZnVydGhlciBhdWRpb19yZXNwb25zZSBjaHVua3MgdGhlXG5cdFx0Ly8gICAgICBzZXJ2ZXIgaGFzIGFscmVhZHkgZ2VuZXJhdGVkL3F1ZXVlZCBmb3IgdGhlIHByZXZpb3VzIHR1cm4gYXJlIGRyb3BwZWRcblx0XHQvLyAgICAgIGluIF9lbnF1ZXVlQXVkaW8uIFRoZSBmbGFnIGNsZWFycyBvbiB0aGUgZmlyc3QgY2h1bmsgb2YgYSBORVcgdHVyblxuXHRcdC8vICAgICAgKGNhcnJpZXMgYSB0cmFuc2NyaXB0KSBzbyB0aGUgbmV4dCByZXNwb25zZSBwbGF5cyBjbGVhbmx5LlxuXHRcdHRoaXMuX2F1ZGlvUXVldWUubGVuZ3RoID0gMDtcblx0XHR0aGlzLl9jdXJyZW50UGxheWJhY2tTZXNzaW9uSWQgPSBudWxsO1xuXHRcdHRoaXMuX2N1cnJlbnRQbGF5YmFja1Jlc3BvbnNlSWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY3VycmVudFBsYXliYWNrTmFycmF0aW9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2N1cnJlbnRQbGF5YmFja0ZpbmFsaXplZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2lzUHJvY2Vzc2luZ1F1ZXVlID0gZmFsc2U7XG5cdFx0dGhpcy5fc3VwcHJlc3NJbmNvbWluZ0F1ZGlvID0gdHJ1ZTtcblxuXHRcdHRoaXMubWljQ2FwdHVyZVNlcnZpY2UuaXNNdXRlZCA9IGZhbHNlO1xuXHRcdHRoaXMubWljQ2FwdHVyZVNlcnZpY2Uuc3VwcHJlc3NVbnRpbCgwKTtcblx0XHQvLyBMYXppbHkgYWNxdWlyZSB0aGUgbWljIFx1MjAxNCBmaXJlLWFuZC1mb3JnZXQuIFRoZSBtaWMgc2VydmljZSBoYW5kbGVzXG5cdFx0Ly8gdGhlIGNhc2Ugd2hlcmUgdGhlIHVzZXIgcmVsZWFzZXMgYmVmb3JlIGFjcXVpc2l0aW9uIGNvbXBsZXRlcy5cblx0XHR0aGlzLm1pY0NhcHR1cmVTZXJ2aWNlLnB0dERvd24odGhpcy5fcHR0Q3VycmVudFR1cm5JZCwgcGFzc2l2ZSkuY2F0Y2goKGVycikgPT4ge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1t2b2ljZV0gbWljIGFjcXVpc2l0aW9uIGZhaWxlZCBvbiBwdHREb3duOyBkaXNjb25uZWN0aW5nJywgZXJyKTtcblx0XHRcdHRoaXMuX3B0dEhlbGQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3N0YXR1c1RleHQuc2V0KCdNaWNyb3Bob25lIGRlbmllZCcsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl92b2ljZVN0YXRlLnNldCgnZXJyb3InLCB1bmRlZmluZWQpO1xuXHRcdFx0Ly8gRGlzY29ubmVjdCBlbnRpcmVseSBzbyB0aGUgdXNlciBpc24ndCBzdHVjayBpbiBhIGNvbm5lY3RlZCBzdGF0ZVxuXHRcdFx0Ly8gd2l0aCBubyB3YXkgdG8gcmVjb3JkLiBUaGUgbm90aWZpY2F0aW9uIGZyb20gbWljQ2FwdHVyZVNlcnZpY2Vcblx0XHRcdC8vIHRlbGxzIHRoZW0gaG93IHRvIGZpeCBwZXJtaXNzaW9ucy5cblx0XHRcdGlmICh0aGlzLl9wdHRNYXhEdXJhdGlvblRpbWVyKSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9wdHRNYXhEdXJhdGlvblRpbWVyKTtcblx0XHRcdFx0dGhpcy5fcHR0TWF4RHVyYXRpb25UaW1lciA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuZGlzY29ubmVjdCgpO1xuXHRcdH0pO1xuXHRcdHRoaXMudHRzUGxheWJhY2tTZXJ2aWNlLnN0b3BQbGF5YmFjaygpO1xuXHRcdHRoaXMuX3ZvaWNlU3RhdGUuc2V0KCdsaXN0ZW5pbmcnLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3N0YXR1c1RleHQuc2V0KCdMaXN0ZW5pbmcuLi4nLCB1bmRlZmluZWQpO1xuXHRcdGlmIChzb3VyY2UgIT09ICdhdXRvJykge1xuXHRcdFx0dGhpcy5fcGxheUxpc3RlbmluZ1N0YXJ0ZWRTaWduYWwoc291cmNlKTtcblx0XHR9XG5cblx0XHR0aGlzLl9wdHRNYXhEdXJhdGlvblRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fcHR0SGVsZCkge1xuXHRcdFx0XHR0aGlzLl9zdGF0dXNUZXh0LnNldCgnTWF4IGR1cmF0aW9uIHJlYWNoZWQnLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzLnB0dFVwKCdpbnRlcm5hbCcpO1xuXHRcdFx0fVxuXHRcdH0sIFZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuX1BUVF9NQVhfRFVSQVRJT05fTVMpO1xuXHR9XG5cblx0cHR0VXAoc291cmNlOiAnZXhwbGljaXQnIHwgJ2ludGVybmFsJyA9ICdleHBsaWNpdCcsIGZvcmNlRmluaXNoID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3B0dEhlbGQpIHsgcmV0dXJuOyB9XG5cblx0XHQvLyBTaG9ydCB0YXA6IGVudGVyIHRvZ2dsZSBtb2RlIFx1MjAxNCBrZWVwIHJlY29yZGluZyB1bnRpbCBuZXh0IHRhcFxuXHRcdGlmICghZm9yY2VGaW5pc2gpIHtcblx0XHRcdGNvbnN0IGhvbGRNcyA9IHRoaXMuX3RlbGVtZXRyeVB0dERvd25NcyA/IERhdGUubm93KCkgLSB0aGlzLl90ZWxlbWV0cnlQdHREb3duTXMgOiBJbmZpbml0eTtcblx0XHRcdGlmIChob2xkTXMgPCBWb2ljZVNlc3Npb25Db250cm9sbGVyLl9QVFRfVE9HR0xFX1RIUkVTSE9MRF9NUykge1xuXHRcdFx0XHR0aGlzLl9wdHRUb2dnbGVNb2RlID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2ZpbmlzaFB0dCgnbG9jYWwnLCBzb3VyY2UpO1xuXHR9XG5cblx0c2V0QXV0b0xpc3RlbkhlbGQoaGVsZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9hdXRvTGlzdGVuSGVsZCA9PT0gaGVsZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9hdXRvTGlzdGVuSGVsZCA9IGhlbGQ7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIHNldEF1dG9MaXN0ZW5IZWxkOiAke2hlbGR9YCk7XG5cdFx0aWYgKGhlbGQpIHtcblx0XHRcdC8vIFRoZSBzZXNzaW9uIG1heSBhbHJlYWR5IGhhdmUgb3BlbmVkIHRoZSBtaWMgYmVmb3JlIHRoZSBob2xkIHdhc1xuXHRcdFx0Ly8gdGFrZW4sIHNvIGNsb3NlIGl0IHJhdGhlciB0aGFuIG9ubHkgYmxvY2tpbmcgdGhlIG5leHQgdHVybi5cblx0XHRcdHRoaXMuX2NsZWFyQXV0b0xpc3RlblRpbWVyKCk7XG5cdFx0XHRpZiAodGhpcy5faXNDb25uZWN0ZWQuZ2V0KCkgJiYgdGhpcy5fcHR0SGVsZCkge1xuXHRcdFx0XHR0aGlzLl9maW5pc2hQdHQoJ2xvY2FsJywgJ2ludGVybmFsJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFJlbGVhc2VkOiBoYW5kcy1mcmVlIHJlc3VtZXMgd2hlcmUgaXQgbGVmdCBvZmYuIGBfZW50ZXJBdXRvTGlzdGVuYFxuXHRcdC8vIHJlLWNoZWNrcyBjb25uZWN0aW9uLCBwbGF5YmFjayBhbmQgZm9jdXMsIHNvIHRoaXMgaXMgc2FmZSB3aGV0aGVyIG9yXG5cdFx0Ly8gbm90IHRoZSBzZXNzaW9uIGV2ZXIgZmluaXNoZWQgY29ubmVjdGluZyB3aGlsZSB0aGUgaG9sZCB3YXMgaW4gcGxhY2UuXG5cdFx0aWYgKHRoaXMuX2lzQ29ubmVjdGVkLmdldCgpICYmIHRoaXMuX2lzSGFuZHNGcmVlRW5hYmxlZCgpKSB7XG5cdFx0XHR0aGlzLl9lbnRlckF1dG9MaXN0ZW4oJ2Nvbm5lY3QnKTtcblx0XHR9XG5cdH1cblxuXHRzdG9wTGlzdGVuaW5nKHNvdXJjZTogJ2V4cGxpY2l0JyB8ICdpbnRlcm5hbCcgPSAnZXhwbGljaXQnKTogdm9pZCB7XG5cdFx0Ly8gU3RvcCB0aGUgY3VycmVudCByZWNvcmRpbmcgLyBhdXRvLWxpc3RlbiBsb29wIFdJVEhPVVQgdGVhcmluZyBkb3duXG5cdFx0Ly8gdGhlIFdlYlNvY2tldC4gQW55IGluLWZsaWdodCBwcmVzcyBpcyBmaW5pc2hlZCB0aHJvdWdoIHRoZSBub3JtYWxcblx0XHQvLyBgcHR0X2VuZGAgcGF0aCBzbyB0aGUgYmFja2VuZCBmaW5hbGl6ZXMgdGhlIHR1cm47IHRoZSBhdXRvLWxpc3RlblxuXHRcdC8vIHJlLWFybSBsb29wIChhdXRvLXNlbmQgbW9kZSkgaXMgc3VwcHJlc3NlZCB1bnRpbCB0aGUgdXNlciB0YWxrc1xuXHRcdC8vIGFnYWluLiBUaGUgY29ubmVjdGlvbiBzdGF5cyBvcGVuIHNvIHRoZSB1c2VyIGNhbiByZXN1bWUgdmlhIHRoZVxuXHRcdC8vIFZvaWNlIE1vZGUgYnV0dG9uIHdpdGhvdXQgYSBuZXcgaGFuZHNoYWtlLlxuXHRcdGlmICghdGhpcy5faXNDb25uZWN0ZWQuZ2V0KCkpIHsgcmV0dXJuOyB9XG5cdFx0dGhpcy5fYXV0b0xpc3RlblN1cHByZXNzZWQgPSB0cnVlO1xuXHRcdHRoaXMuX3B0dFRvZ2dsZU1vZGUgPSBmYWxzZTtcblx0XHR0aGlzLl9jbGVhckF1dG9MaXN0ZW5UaW1lcigpO1xuXHRcdGlmICh0aGlzLl9wdHRIZWxkKSB7XG5cdFx0XHR0aGlzLl9maW5pc2hQdHQoJ2xvY2FsJywgc291cmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdm9pY2VTdGF0ZS5zZXQoJ2lkbGUnLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fc3RhdHVzVGV4dC5zZXQoJ1RhcCB0byBzdGFydCcsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzY2FyZExpc3RlbmluZygpOiB2b2lkIHtcblx0XHQvLyBTdG9wIHRoZSBjdXJyZW50IHJlY29yZGluZyBXSVRIT1VUIGZpbmFsaXppbmcgdGhlIHR1cm4uIEFueSBpbi1mbGlnaHRcblx0XHQvLyBwcmVzcyBpcyBhYm9ydGVkIChtaWMgZHJvcHMgaXRzIGJ1ZmZlciwgTk8gYHB0dF9lbmRgIGlzIHNlbnQpIHNvIHRoZVxuXHRcdC8vIGJhY2tlbmQgbmV2ZXIgdHVybnMgdGhlIGJ1ZmZlcmVkIHNwZWVjaCBpbnRvIGEgYHNlbmRfdG9fY2hhdGAgXHUyMDE0IHdoaWNoXG5cdFx0Ly8gd291bGQgb3RoZXJ3aXNlIGJlIHJvdXRlZCB0byB0aGUgbm93LWZvY3VzZWQgc2Vzc2lvbi4gQWxzbyBkcm9wIGFcblx0XHQvLyBzdHJheSBgc2VuZF90b19jaGF0YCB0aGUgYmFja2VuZCBtYXkgYWxyZWFkeSBoYXZlIGluIGZsaWdodCAoZS5nLiBpdFxuXHRcdC8vIGF1dG8tZW5kZWQgdGhlIHR1cm4gdmlhIFZBRCBiZWZvcmUgd2UgZGlzY2FyZGVkKS5cblx0XHRpZiAoIXRoaXMuX2lzQ29ubmVjdGVkLmdldCgpKSB7IHJldHVybjsgfVxuXHRcdHRoaXMuX2F1dG9MaXN0ZW5TdXBwcmVzc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9wdHRUb2dnbGVNb2RlID0gZmFsc2U7XG5cdFx0dGhpcy5fY2xlYXJBdXRvTGlzdGVuVGltZXIoKTtcblx0XHR0aGlzLl9zdXBwcmVzc1NlbmRUb0NoYXRVbnRpbCA9IERhdGUubm93KCkgKyBWb2ljZVNlc3Npb25Db250cm9sbGVyLl9ESVNDQVJEX1NFTkRfU1VQUFJFU1NfTVM7XG5cdFx0aWYgKHRoaXMuX3B0dEhlbGQpIHtcblx0XHRcdHRoaXMuX2ZpbmlzaFB0dCgnZGlzY2FyZCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl92b2ljZVN0YXRlLnNldCgnaWRsZScsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9zdGF0dXNUZXh0LnNldCgnVGFwIHRvIHN0YXJ0JywgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRmaW5pc2hMaXN0ZW5pbmdBbmRTdWJtaXRUbyhzZXNzaW9uOiBVUkkpOiB2b2lkIHtcblx0XHQvLyBTdG9wIGxpc3RlbmluZyBvbiBhIGZvY3VzIGNoYW5nZSwgYnV0IHRoZSB1c2VyIGhhcyBhbHJlYWR5IGRpY3RhdGVkIFx1MjAxNFxuXHRcdC8vIHNvIGZpbmFsaXplIHRoZSB0dXJuIChzZW5kIGBwdHRfZW5kYCkgYW5kIHBpbiB0aGUgcmVzdWx0aW5nXG5cdFx0Ly8gYHNlbmRfdG9fY2hhdGAgdG8gYHNlc3Npb25gICh0aGUgc2Vzc2lvbiB0aGV5IHdlcmUgZGljdGF0aW5nIGludG8pIHNvXG5cdFx0Ly8gdGhlaXIgd29yZHMgYXJlbid0IG1pc3JvdXRlZCB0byB0aGUgbmV3bHkgZm9jdXNlZCBzZXNzaW9uLlxuXHRcdGlmICghdGhpcy5faXNDb25uZWN0ZWQuZ2V0KCkpIHsgcmV0dXJuOyB9XG5cdFx0dGhpcy5fYXV0b0xpc3RlblN1cHByZXNzZWQgPSB0cnVlO1xuXHRcdHRoaXMuX3B0dFRvZ2dsZU1vZGUgPSBmYWxzZTtcblx0XHR0aGlzLl9jbGVhckF1dG9MaXN0ZW5UaW1lcigpO1xuXHRcdHRoaXMuX3NldFBpbm5lZFN1Ym1pdFNlc3Npb24oc2Vzc2lvbik7XG5cdFx0aWYgKHRoaXMuX3B0dEhlbGQpIHtcblx0XHRcdHRoaXMuX2ZpbmlzaFB0dCgnbG9jYWwnLCAnaW50ZXJuYWwnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVGhlIGJhY2tlbmQgYWxyZWFkeSBhdXRvLWVuZGVkIHRoZSB0dXJuIChWQUQpIGFuZCBhIGBzZW5kX3RvX2NoYXRgXG5cdFx0XHQvLyBpcyBpbiBmbGlnaHQ7IHRoZSBwaW4gcm91dGVzIGl0LiBSZWZsZWN0IHRoZSBwZW5kaW5nIHN1Ym1pc3Npb24uXG5cdFx0XHR0aGlzLl92b2ljZVN0YXRlLnNldCgncHJvY2Vzc2luZycsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9zdGF0dXNUZXh0LnNldCgnUHJvY2Vzc2luZy4uLicsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0UGlubmVkU3VibWl0U2Vzc2lvbihzZXNzaW9uOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcGlubmVkU3VibWl0VGltZXIpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9waW5uZWRTdWJtaXRUaW1lcik7XG5cdFx0XHR0aGlzLl9waW5uZWRTdWJtaXRUaW1lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fcGlubmVkU3VibWl0U2Vzc2lvbiA9IHNlc3Npb247XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdHRoaXMuX3Bpbm5lZFN1Ym1pdFRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Bpbm5lZFN1Ym1pdFRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9waW5uZWRTdWJtaXRTZXNzaW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0fSwgVm9pY2VTZXNzaW9uQ29udHJvbGxlci5fUElOTkVEX1NVQk1JVF9FWFBJUllfTVMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NvbnN1bWVQaW5uZWRTdWJtaXRTZXNzaW9uKCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcGlubmVkID0gdGhpcy5fcGlubmVkU3VibWl0U2Vzc2lvbjtcblx0XHRpZiAocGlubmVkKSB7XG5cdFx0XHR0aGlzLl9zZXRQaW5uZWRTdWJtaXRTZXNzaW9uKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdHJldHVybiBwaW5uZWQ7XG5cdH1cblxuXHQvKipcblx0ICogRmluaXNoIHRoZSBjdXJyZW50IHB1c2gtdG8tdGFsayBwcmVzcy5cblx0ICpcblx0ICogYGByZWFzb25gYCBpcyBgYCdsb2NhbCdgYCBmb3IgYSB1c2VyLWRyaXZlbiBlbmQgKGJ1dHRvbiByZWxlYXNlIC8gdG9nZ2xlXG5cdCAqIHRhcCAvIGtleXdvcmQpIFx1MjAxNCB0aGUgbWljIGRyYWlucyBpdHMgdGFpbCBhbmQgdGhlIGBgb25QdHRFbmRgYCBcdTIxOTIgYGBwdHRfZW5kYGBcblx0ICogcGF0aCBmaXJlcy4gSXQgaXMgYGAnYXV0bydgYCB3aGVuIHRoZSBiYWNrZW5kIGVuZGVkIHRoZSB0dXJuIGl0c2VsZlxuXHQgKiAoYGB0dXJuX2F1dG9fZW5kZWRgYCk6IHRoZSBtaWMgaXMgYWJvcnRlZCB3aXRoIG5vIGRyYWluIGFuZCBOTyBgYHB0dF9lbmRgYFxuXHQgKiBpcyBzZW50IGZvciB0aGUgdHVybi4gYGAnZGlzY2FyZCdgYFxuXHQgKiB0aHJvd3MgdGhlIHByZXNzIGF3YXkgb24gYSBmb2N1cyBjaGFuZ2U6IGxpa2UgYGAnYXV0bydgYCB0aGUgbWljIGlzIGFib3J0ZWRcblx0ICogd2l0aCBOTyBgYHB0dF9lbmRgYCAoc28gdGhlIGJhY2tlbmQgbmV2ZXIgZmluYWxpemVzIGl0IGludG8gYVxuXHQgKiBgc2VuZF90b19jaGF0YCksIGJ1dCB0aGUgc3RhdGUgc2V0dGxlcyB0byBgYGlkbGVgYCByYXRoZXIgdGhhblxuXHQgKiBgYHByb2Nlc3NpbmdgYCBzaW5jZSBub3RoaW5nIGlzIGJlaW5nIHNlbnQuXG5cdCAqL1xuXHRwcml2YXRlIF9maW5pc2hQdHQocmVhc29uOiAnbG9jYWwnIHwgJ2F1dG8nIHwgJ2Rpc2NhcmQnID0gJ2xvY2FsJywgc291cmNlOiAnZXhwbGljaXQnIHwgJ2ludGVybmFsJyA9ICdleHBsaWNpdCcpOiB2b2lkIHtcblx0XHQvLyBFbmQgdG9nZ2xlIChoYW5kcy1mcmVlKSBtb2RlIG9uIGV2ZXJ5IHR1cm4tZW5kaW5nIHBhdGggXHUyMDE0IGV2ZW4gd2hlbiBub3QgaGVsZCBcdTIwMTQgc28gYW4gb3V0LW9mLWJhbmQgZmluaXNoIGNhbid0IGxlYXZlIGEgc3RhbGUgdG9nZ2xlIHRoYXQgc2VsZi1raWxscyB0aGUgbmV4dCBhdXRvLWxpc3Rlbi5cblx0XHR0aGlzLl9wdHRUb2dnbGVNb2RlID0gZmFsc2U7XG5cdFx0dGhpcy5fYmFyZ2VJbkxpc3RlbkFjdGl2ZSA9IGZhbHNlO1xuXHRcdGlmICghdGhpcy5fcHR0SGVsZCkgeyByZXR1cm47IH1cblx0XHR0aGlzLl9jbGVhckF1dG9MaXN0ZW5UaW1lcigpO1xuXHRcdHRoaXMuX3B0dEhlbGQgPSBmYWxzZTtcblx0XHQvLyBFbmQgdG9nZ2xlIChoYW5kcy1mcmVlKSBtb2RlIG9uIGV2ZXJ5IHR1cm4tZW5kaW5nIHBhdGgsIHNvIGFuIG91dC1vZi1iYW5kIGZpbmlzaCBjYW4ndCBsZWF2ZSBhIHN0YWxlIHRvZ2dsZSB0aGF0IHNlbGYta2lsbHMgdGhlIG5leHQgYXV0by1saXN0ZW4uXG5cdFx0dGhpcy5fcHR0VG9nZ2xlTW9kZSA9IGZhbHNlO1xuXHRcdHRoaXMuX3RlbGVtZXRyeVB0dFVwTXMgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IGhvbGRNcyA9IHRoaXMuX3RlbGVtZXRyeVB0dERvd25NcyA/IERhdGUubm93KCkgLSB0aGlzLl90ZWxlbWV0cnlQdHREb3duTXMgOiAwO1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFZvaWNlUHR0RXZlbnQsIFZvaWNlUHR0Q2xhc3NpZmljYXRpb24+KCd2b2ljZVB0dCcsIHsgaG9sZER1cmF0aW9uTXM6IGhvbGRNcyB9KTtcblx0XHRpZiAodGhpcy5fcHR0TWF4RHVyYXRpb25UaW1lcikge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3B0dE1heER1cmF0aW9uVGltZXIpO1xuXHRcdFx0dGhpcy5fcHR0TWF4RHVyYXRpb25UaW1lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fdm9pY2VTdGF0ZS5zZXQoJ3Byb2Nlc3NpbmcnLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3N0YXR1c1RleHQuc2V0KCdQcm9jZXNzaW5nLi4uJywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9yZXBseVBsYXllZFNpbmNlU2VuZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2NsZWFyQXdhaXRpbmdSZXBseSgpO1xuXHRcdHRoaXMuX3N1cHByZXNzSW5jb21pbmdBdWRpbyA9IGZhbHNlO1xuXHRcdHRoaXMuX21hcmtUcmFuc2NyaXB0aW9uVHVyblBlbmRpbmcoKTtcblx0XHRpZiAocmVhc29uID09PSAnYXV0bycgfHwgcmVhc29uID09PSAnZGlzY2FyZCcpIHtcblx0XHRcdC8vIEJhY2tlbmQgYWxyZWFkeSBlbmRlZCB0aGUgdHVybiwgb3Igd2UncmUgZGlzY2FyZGluZyBpdCBcdTIwMTQgc3RvcFxuXHRcdFx0Ly8gY2FwdHVyaW5nIHdpdGhvdXQgZHJhaW5pbmcgbW9yZSBhdWRpbyBhbmQgd2l0aG91dCBlbWl0dGluZyBvdXJcblx0XHRcdC8vIG93biBwdHRfZW5kLlxuXHRcdFx0dGhpcy5taWNDYXB0dXJlU2VydmljZS5hYm9ydFB0dCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm1pY0NhcHR1cmVTZXJ2aWNlLnB0dFVwKCk7XG5cdFx0fVxuXHRcdGlmIChyZWFzb24gPT09ICdkaXNjYXJkJykge1xuXHRcdFx0Ly8gTm90aGluZyBpcyBiZWluZyBzZW50LCBzbyBkb24ndCBsZWF2ZSB0aGUgVUkgc3R1Y2sgaW4gJ1Byb2Nlc3NpbmcnLlxuXHRcdFx0dGhpcy5fdm9pY2VTdGF0ZS5zZXQoJ2lkbGUnLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fc3RhdHVzVGV4dC5zZXQoJ1RhcCB0byBzdGFydCcsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdGlmIChyZWFzb24gPT09ICdsb2NhbCcgJiYgc291cmNlID09PSAnZXhwbGljaXQnKSB7XG5cdFx0XHR0aGlzLl9wbGF5UmVjb3JkaW5nU3RvcHBlZFNpZ25hbCh0cnVlKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSkge1xuXHRcdFx0dGhpcy5fcGxheVJlY29yZGluZ1N0b3BwZWRTaWduYWwoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3BsYXlSZWNvcmRpbmdTdG9wcGVkU2lnbmFsKHVzZXJHZXN0dXJlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dm9pZCB0aGlzLmFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC52b2ljZVJlY29yZGluZ1N0b3BwZWQsIHtcblx0XHRcdHNvdXJjZTogdXNlckdlc3R1cmUgPyAndm9pY2VNb2RlLmV4cGxpY2l0TGlzdGVuaW5nU3RvcHBlZCcgOiAndm9pY2VNb2RlLmxpc3RlbmluZ1N0b3BwZWQnLFxuXHRcdFx0dXNlckdlc3R1cmUsXG5cdFx0fSk7XG5cdH1cblxuXHRtYXJrVXNlckNhbmNlbGxlZChzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2NhbmNlbFZvaWNlUHJvZ3Jlc3Moc2Vzc2lvbklkKTtcblx0XHR0aGlzLl9wcmVlbXB0Q2hlY2twb2ludFBsYXliYWNrKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl91c2VyQ2FuY2VsbGVkU2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7IGNsZWFyVGltZW91dChleGlzdGluZyk7IH1cblx0XHRjb25zdCBleHBpcnkgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX3VzZXJDYW5jZWxsZWRTZXNzaW9ucy5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHR9LCBWb2ljZVNlc3Npb25Db250cm9sbGVyLl9VU0VSX0NBTkNFTF9TVVBQUkVTU19NUyk7XG5cdFx0dGhpcy5fdXNlckNhbmNlbGxlZFNlc3Npb25zLnNldChzZXNzaW9uSWQsIGV4cGlyeSk7XG5cdH1cblxuXHRzZXRUYXJnZXRTZXNzaW9uKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl90YXJnZXRTZXNzaW9uLnNldChyZXNvdXJjZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdG5ld1Nlc3Npb25Bc1RhcmdldCgpOiB2b2lkIHtcblx0XHRjb25zdCByZWYgPSB0aGlzLmNoYXRTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gcmVmLm9iamVjdC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl90YXJnZXRTZXNzaW9uLnNldChyZXNvdXJjZSwgdW5kZWZpbmVkKTtcblx0XHQvLyBUcnkgdG8gc3dpdGNoIHRoZSB2aWV3IHRvIHRoZSBuZXcgc2Vzc2lvbiAod29ya3MgaWYgY2hhdCBwYW5lIGlzIG9wZW4pXG5cdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnX2NoYXQudm9pY2Uuc3dpdGNoVG9TZXNzaW9uJywgcmVzb3VyY2UudG9TdHJpbmcoKSkuY2F0Y2goKCkgPT4geyAvKiBwYW5lIG1heSBub3QgZXhpc3QgKi8gfSk7XG5cdH1cblxuXHRwcml2YXRlIF9zY2hlZHVsZURlbGF5ZWRNaWNTdG9wKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kZWxheWVkTWljU3RvcFRpbWVyKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fZGVsYXllZE1pY1N0b3BUaW1lcik7XG5cdFx0fVxuXHRcdHRoaXMuX2RlbGF5ZWRNaWNTdG9wVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2RlbGF5ZWRNaWNTdG9wVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9wdHRXYWl0aW5nRm9yUGxheWJhY2sgPSBmYWxzZTtcblx0XHR9LCAxMDAwKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzSGFuZHNGcmVlRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHQvLyBIYW5kcy1mcmVlIGF1dG8tbGlzdGVuIGlzIG9uIGJ5IGRlZmF1bHQ7IGFuIHVucmVzb2x2ZWQvdW5kZWZpbmVkIHZhbHVlXG5cdFx0Ly8gcmVzb2x2ZXMgdG8gdGhlIGBoYW5kc0ZyZWVgIGRlZmF1bHQgKGB0cnVlYCkuIE9ubHkgYW4gZXhwbGljaXQgYGZhbHNlYFxuXHRcdC8vIGRpc2FibGVzIGl0LlxuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdhZ2VudHMudm9pY2UuaGFuZHNGcmVlJykgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9zaG91bGRFbnRlckxpc3Rlbk9uU2Vzc2lvbkluaXQoaXNSZXN1bWluZzogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhaXNSZXN1bWluZyAmJiB0aGlzLl9pc0hhbmRzRnJlZUVuYWJsZWQoKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzTGl2ZVRyYW5zY3JpcHRFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdC8vIERlZmF1bHQtb2ZmOiBsaXZlIHdvcmQtYnktd29yZCB0cmFuc2NyaXB0cyBhcmUgb3B0LWluLCBzbyBvbmx5IGFuXG5cdFx0Ly8gZXhwbGljaXQgYHRydWVgIGVuYWJsZXMgdGhlIGludGVyaW0gcmVuZGVyaW5nLiBBbiB1bnJlc29sdmVkL3VuZGVmaW5lZFxuXHRcdC8vIHZhbHVlIHJlc29sdmVzIHRvIHRoZSBgbGl2ZVRyYW5zY3JpcHRgIGRlZmF1bHQgKGBmYWxzZWApLlxuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdhZ2VudHMudm9pY2UubGl2ZVRyYW5zY3JpcHQnKSA9PT0gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdHJpcCBhIHRyYWlsaW5nIHN0b3AgcGhyYXNlIChlLmcuIFwic2VuZCBpdFwiKSBmcm9tIGEgdHJhbnNjcmlwdCBiZWZvcmUgaXRcblx0ICogaXMgc2VudCB0byBjaGF0LiBUaGUgYmFja2VuZCBpcyBzdXBwb3NlZCB0byBzdHJpcCB0aGUgbWF0Y2hlZCBwaHJhc2UgZnJvbVxuXHQgKiBgYWdlbnRzLnZvaWNlLnR1cm4uc3RvcFBocmFzZXNgLCBidXQgd2hlbiBpdCBkb2Vzbid0IHRoZSByYXcgcGhyYXNlIGxlYWtzXG5cdCAqIGludG8gdGhlIHJlcXVlc3QsIHNvIHdlIGRlZmVuc2l2ZWx5IHN0cmlwIGl0IGNsaWVudC1zaWRlLiBNYXRjaGluZyBpc1xuXHQgKiBjYXNlLWluc2Vuc2l0aXZlLCBpZ25vcmVzIHRyYWlsaW5nIHB1bmN0dWF0aW9uLCBhbmQgb25seSBzdHJpcHMgb24gYSB3b3JkXG5cdCAqIGJvdW5kYXJ5IHNvIHBocmFzZXMgYXJlbid0IHJlbW92ZWQgZnJvbSB0aGUgbWlkZGxlIG9mIGEgd29yZC5cblx0ICovXG5cdHByaXZhdGUgX3N0cmlwU3RvcFBocmFzZSh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nW10+KCdhZ2VudHMudm9pY2UudHVybi5zdG9wUGhyYXNlcycpO1xuXHRcdGNvbnN0IHBocmFzZXMgPSBBcnJheS5pc0FycmF5KHJhdylcblx0XHRcdD8gcmF3Lm1hcChwID0+ICh0eXBlb2YgcCA9PT0gJ3N0cmluZycgPyBwLnRyaW0oKSA6ICcnKSkuZmlsdGVyKHAgPT4gcC5sZW5ndGggPiAwKVxuXHRcdFx0OiBbXTtcblx0XHRpZiAocGhyYXNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB0ZXh0O1xuXHRcdH1cblx0XHQvLyBTdHJpcCB0cmFpbGluZyBwdW5jdHVhdGlvbiB0aGF0IHNwZWVjaCByZWNvZ25pemVycyBvZnRlbiBhcHBlbmQuXG5cdFx0Y29uc3QgdHJpbW1lZCA9IHRleHQudHJpbUVuZCgpLnJlcGxhY2UoL1suLCE/OzpdKyQvLCAnJykudHJpbUVuZCgpO1xuXHRcdGNvbnN0IHRyaW1tZWRMb3dlciA9IHRyaW1tZWQudG9Mb3dlckNhc2UoKTtcblx0XHQvLyBQcmVmZXIgdGhlIGxvbmdlc3QgbWF0Y2hpbmcgcGhyYXNlIHNvIG1vcmUgc3BlY2lmaWMgcGhyYXNlcyB3aW4uXG5cdFx0Y29uc3Qgc29ydGVkID0gWy4uLnBocmFzZXNdLnNvcnQoKGEsIGIpID0+IGIubGVuZ3RoIC0gYS5sZW5ndGgpO1xuXHRcdGZvciAoY29uc3QgcGhyYXNlIG9mIHNvcnRlZCkge1xuXHRcdFx0Y29uc3QgcGhyYXNlTG93ZXIgPSBwaHJhc2UudG9Mb3dlckNhc2UoKTtcblx0XHRcdGlmICghdHJpbW1lZExvd2VyLmVuZHNXaXRoKHBocmFzZUxvd2VyKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlkeCA9IHRyaW1tZWQubGVuZ3RoIC0gcGhyYXNlLmxlbmd0aDtcblx0XHRcdC8vIE9ubHkgc3RyaXAgb24gYSB3b3JkIGJvdW5kYXJ5IChzdGFydCBvZiBzdHJpbmcgb3IgcHJlY2VkZWQgYnlcblx0XHRcdC8vIHdoaXRlc3BhY2UpIHNvIFwib3V0XCIgaXNuJ3QgcmVtb3ZlZCBmcm9tIFwiY2hlY2tvdXRcIi5cblx0XHRcdGlmIChpZHggPT09IDAgfHwgL1xccy8udGVzdCh0cmltbWVkW2lkeCAtIDFdKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJpbW1lZC5zbGljZSgwLCBpZHgpLnJlcGxhY2UoL1suLCE/OzpcXHNdKyQvLCAnJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0ZXh0O1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhpcyBjb250cm9sbGVyJ3Mgd2luZG93IGN1cnJlbnRseSBoYXMgT1MgZm9jdXMuIEluIG11bHRpLXdpbmRvd1xuXHQgKiBzZXR1cHMgKGUuZy4gYW4gZWRpdG9yIHdpbmRvdyArIHRoZSBhZ2VudHMgd2luZG93KSBlYWNoIHdpbmRvdyBoYXMgaXRzIG93blxuXHQgKiBjb250cm9sbGVyL1dlYlNvY2tldCwgc28gd2l0aG91dCB0aGlzIGdhdGUgZXZlcnkgb3BlbiB3aW5kb3cgd291bGQgcmUtYXJtXG5cdCAqIGhhbmRzLWZyZWUgYXV0by1saXN0ZW4gYW5kIHJlcGx5IHNpbXVsdGFuZW91c2x5LiBPbmx5IHRoZSBmb2N1c2VkIHdpbmRvd1xuXHQgKiBzaG91bGQga2VlcCBsaXN0ZW5pbmcgKCM4NTA3KS5cblx0ICovXG5cdHByaXZhdGUgX2lzV2luZG93Rm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3dpbmRvdz8uZG9jdW1lbnQuaGFzRm9jdXMoKSA/PyBmYWxzZTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHQvKiogQ2FsbGVkIHdoZW4gdGhpcyBjb250cm9sbGVyJ3Mgd2luZG93IGxvc2VzIE9TIGZvY3VzLiBBYm9ydHMgYW55IG9wZW5cblx0ICogIHBhc3NpdmUgdHVybiBzbyB0aGUgYmFja2dyb3VuZCB3aW5kb3cgc3RvcHMgcmVjb3JkaW5nIHdoaWxlIHRoZSBuZXdseVxuXHQgKiAgZm9jdXNlZCB3aW5kb3cgY2FuIHRha2Ugb3ZlciBoYW5kcy1mcmVlIGxpc3RlbmluZyAoIzg1MDcpLiAqL1xuXHRwcml2YXRlIF9vbldpbmRvd0JsdXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3B0dEhlbGQgJiYgdGhpcy5fcHR0Q3VycmVudFR1cm5QYXNzaXZlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1t2b2ljZV0gd2luZG93IGJsdXI6IGFib3J0aW5nIHBhc3NpdmUgdHVybiAobXVsdGktd2luZG93IGhhbmRzLWZyZWUgIzg1MDcpJyk7XG5cdFx0XHR0aGlzLl9maW5pc2hQdHQoJ2Rpc2NhcmQnLCAnaW50ZXJuYWwnKTtcblx0XHR9XG5cdH1cblxuXHQvKiogQ2FsbGVkIHdoZW4gdGhpcyBjb250cm9sbGVyJ3Mgd2luZG93IGdhaW5zIE9TIGZvY3VzLiBSZS1hcm1zIGhhbmRzLWZyZWVcblx0ICogIGF1dG8tbGlzdGVuIHNvIHRoZSBmb2N1c2VkIHdpbmRvdyBpcyBhbHdheXMgdGhlIG9uZSB0aGF0IGxpc3RlbnMgKCM4NTA3KS4gKi9cblx0cHJpdmF0ZSBfb25XaW5kb3dGb2N1cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNIYW5kc0ZyZWVFbmFibGVkKCkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW3ZvaWNlXSB3aW5kb3cgZm9jdXM6IHJlLWFybWluZyBoYW5kcy1mcmVlIGF1dG8tbGlzdGVuIChtdWx0aS13aW5kb3cgIzg1MDcpJyk7XG5cdFx0XHR0aGlzLl9lbnRlckF1dG9MaXN0ZW4oKTtcblx0XHR9XG5cdH1cblxuXHQvKiogUmUtZW50ZXIgbGlzdGVuaW5nIHZpYSBzeW50aGV0aWMgc2hvcnQgdGFwLiAqL1xuXHRwcml2YXRlIF9lbnRlckF1dG9MaXN0ZW4oc291cmNlOiAnYXV0bycgfCAnY29ubmVjdCcgPSAnYXV0bycpOiB2b2lkIHtcblx0XHR0aGlzLl9jbGVhckF1dG9MaXN0ZW5UaW1lcigpO1xuXHRcdGlmICh0aGlzLl9hdXRvTGlzdGVuSGVsZCB8fCB0aGlzLl9hdXRvTGlzdGVuU3VwcHJlc3NlZCB8fCAhdGhpcy5faXNDb25uZWN0ZWQuZ2V0KCkgfHwgdGhpcy5fcHR0SGVsZCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIF9lbnRlckF1dG9MaXN0ZW4gc2tpcHBlZDogaGVsZD0ke3RoaXMuX2F1dG9MaXN0ZW5IZWxkfSBzdXBwcmVzc2VkPSR7dGhpcy5fYXV0b0xpc3RlblN1cHByZXNzZWR9IGNvbm5lY3RlZD0ke3RoaXMuX2lzQ29ubmVjdGVkLmdldCgpfSBwdHRIZWxkPSR7dGhpcy5fcHR0SGVsZH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gSW4gbXVsdGktd2luZG93IGhhbmRzLWZyZWUsIG9ubHkgdGhlIGZvY3VzZWQgd2luZG93IGtlZXBzIGF1dG8tbGlzdGVuaW5nXG5cdFx0Ly8gc28gdHdvIHdpbmRvd3MgZG9uJ3QgYm90aCBsaXN0ZW4gYW5kIHJlcGx5IGF0IG9uY2UgKCM4NTA3KS4gVGhlICdjb25uZWN0J1xuXHRcdC8vIHNvdXJjZSBpcyBhIHVzZXIgZ2VzdHVyZSBpbiB0aGUgY29ubmVjdGluZyAoZm9jdXNlZCkgd2luZG93LCBzbyBpdCBpc24ndFxuXHRcdC8vIGdhdGVkIGhlcmUuXG5cdFx0aWYgKHNvdXJjZSA9PT0gJ2F1dG8nICYmICF0aGlzLl9pc1dpbmRvd0ZvY3VzZWQoKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbdm9pY2VdIF9lbnRlckF1dG9MaXN0ZW4gc2tpcHBlZDogd2luZG93IG5vdCBmb2N1c2VkIChtdWx0aS13aW5kb3cgaGFuZHMtZnJlZSknKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gRG9uJ3QgZW50ZXIgbGlzdGVuaW5nIGlmIGF1ZGlvIGlzIHN0aWxsIHBsYXlpbmcgb3IgcXVldWVkLlxuXHRcdGlmICh0aGlzLnR0c1BsYXliYWNrU2VydmljZS5pc1BsYXlpbmcgfHwgdGhpcy5fYXVkaW9RdWV1ZS5sZW5ndGggPiAwIHx8IHRoaXMuX2N1cnJlbnRQbGF5YmFja1Nlc3Npb25JZCAhPT0gbnVsbCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIF9lbnRlckF1dG9MaXN0ZW4gc2tpcHBlZDogYXVkaW8gYnVzeSAocGxheWluZz0ke3RoaXMudHRzUGxheWJhY2tTZXJ2aWNlLmlzUGxheWluZ30gcXVldWU9JHt0aGlzLl9hdWRpb1F1ZXVlLmxlbmd0aH0gcGJTZXNzaW9uPSR7dGhpcy5fY3VycmVudFBsYXliYWNrU2Vzc2lvbklkICE9PSBudWxsfSlgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbdm9pY2VdIF9lbnRlckF1dG9MaXN0ZW4gZW50ZXJpbmcgbGlzdGVuaW5nJyk7XG5cdFx0dGhpcy5wdHREb3duKHNvdXJjZSk7XG5cdFx0dGhpcy5wdHRVcCgnaW50ZXJuYWwnKTtcblx0fVxuXG5cdHByaXZhdGUgX3BsYXlMaXN0ZW5pbmdTdGFydGVkU2lnbmFsKHNvdXJjZTogJ2V4cGxpY2l0JyB8ICdjb25uZWN0Jyk6IHZvaWQge1xuXHRcdGlmIChzb3VyY2UgPT09ICdjb25uZWN0Jykge1xuXHRcdFx0dm9pZCB0aGlzLmFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC52b2ljZU1vZGVTdGFydGVkLCB7XG5cdFx0XHRcdHNvdXJjZTogJ3ZvaWNlTW9kZS5jb25uZWN0TGlzdGVuaW5nU3RhcnRlZCcsXG5cdFx0XHRcdHVzZXJHZXN0dXJlOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dm9pZCB0aGlzLmFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC52b2ljZVJlY29yZGluZ1N0YXJ0ZWQsIHtcblx0XHRcdHNvdXJjZTogJ3ZvaWNlTW9kZS5leHBsaWNpdExpc3RlbmluZ1N0YXJ0ZWQnLFxuXHRcdFx0dXNlckdlc3R1cmU6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogSGFuZHMtZnJlZSBiYXJnZS1pbiBsaXN0ZW46IG9wZW4gYSBwYXNzaXZlIFBUVCBzdHJlYW1pbmcgdHVybiBXSVRIT1VUXG5cdCAqIGludGVycnVwdGluZyB0aGUgYXNzaXN0YW50J3MgcGxheWJhY2ssIHNvIHRoZSBiYWNrZW5kJ3Mgc2VydmVyLVZBRCBrZWVwc1xuXHQgKiByZWNlaXZpbmcgbWljIGF1ZGlvIGFuZCBjYW4gZGV0ZWN0IHRoZSB1c2VyIHRhbGtpbmcgb3ZlciB0aGUgYXNzaXN0YW50LlxuXHQgKlxuXHQgKiBVbmxpa2UgYHB0dERvd24oKWAgKGEgdXNlci1kcml2ZW4gaW50ZXJydXB0KSB0aGlzIGRvZXMgTk9UIHN0b3AgcGxheWJhY2ssXG5cdCAqIGNsZWFyIHRoZSBhdWRpbyBxdWV1ZSwgb3Igc3VwcHJlc3MgaW5jb21pbmcgYXVkaW8uIFRoZSBiYWNrZW5kIGRlY2lkZXNcblx0ICogd2hlbiBhIHJlYWwgaW50ZXJydXB0aW9uIGhhcHBlbmVkIGFuZCBlbWl0cyBgc3BlZWNoX3N0YXJ0ZWRgIC8gYGJhcmdlX2luYFxuXHQgKiAoYWxyZWFkeSB3aXJlZCB0byBjdXQgb2ZmIFRUUykuIElmIHRoZSB1c2VyIHN0YXlzIHNpbGVudCB0aGUgdHVybiBzaW1wbHlcblx0ICogc3RheXMgb3BlbiBhbmQgYmVjb21lcyB0aGUgbmV4dCBsaXN0ZW5pbmcgdHVybiBvbmNlIHBsYXliYWNrIGVuZHNcblx0ICogKGBvblBsYXliYWNrU3RvcHBlZGAgc2VlcyBgX3B0dEhlbGRgIGFuZCBzdGF5cyBpbiAnbGlzdGVuaW5nJykuXG5cdCAqXG5cdCAqIEhhbmRzLWZyZWUgc2Vzc2lvbiBpbml0aWFsaXphdGlvbiBrZWVwcyBjYXB0dXJlIHdhcm0gYmVmb3JlIHRoZSBiYWNrZW5kIGNhblxuXHQgKiBzZW5kIHBsYXliYWNrLiBJZGVtcG90ZW50OiBhIG5vLW9wIHdoaWxlIGEgdHVybiBpcyBhbHJlYWR5IGhlbGQuXG5cdCAqL1xuXHRwcml2YXRlIF9zdGFydEJhcmdlSW5MaXN0ZW4oKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0hhbmRzRnJlZUVuYWJsZWQoKSB8fCAhdGhpcy5faXNDb25uZWN0ZWQuZ2V0KCkgfHwgdGhpcy5fcHR0SGVsZCB8fCB0aGlzLl9hdXRvTGlzdGVuSGVsZCB8fCB0aGlzLl9hdXRvTGlzdGVuU3VwcHJlc3NlZCB8fCAhdGhpcy5fd2luZG93KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIE9ubHkgYmFyZ2UtaW4gbGlzdGVuIGluIHRoZSBmb2N1c2VkIHdpbmRvdyBzbyBiYWNrZ3JvdW5kIHdpbmRvd3MgZG9uJ3Rcblx0XHQvLyBhbHNvIG9wZW4gYSBtaWMgZHVyaW5nIHBsYXliYWNrICgjODUwNykuXG5cdFx0aWYgKCF0aGlzLl9pc1dpbmRvd0ZvY3VzZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jbGVhckF1dG9MaXN0ZW5UaW1lcigpO1xuXHRcdHRoaXMuX3B0dEN1cnJlbnRUdXJuSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHR0aGlzLl9wdHRIZWxkID0gdHJ1ZTtcblx0XHR0aGlzLl9wdHRDdXJyZW50VHVyblBhc3NpdmUgPSB0cnVlO1xuXHRcdC8vIFRyYWNrIHRoaXMgYXMgYSBwYXNzaXZlIGJhcmdlLWluIGxpc3RlbiAoTk9UIHRvZ2dsZSBtb2RlKSBzbyBhblxuXHRcdC8vIGV4cGxpY2l0IGBwdHREb3duKClgIHByb21vdGVzIGl0IGludG8gYSB1c2VyLWRyaXZlbiBpbnRlcnJ1cHQgaW5zdGVhZFxuXHRcdC8vIG9mIHRoZSB0b2dnbGUgYnJhbmNoIGZpbmlzaGluZyBpdC4gVGhlIHR1cm4gc3RheXMgb3BlbiBvbiBpdHMgb3duIFx1MjAxNFxuXHRcdC8vIG5vdGhpbmcgY2FsbHMgYHB0dFVwKClgL2BfZmluaXNoUHR0KClgIFx1MjAxNCB1bnRpbCB0aGUgYmFja2VuZCBlbmRzIGl0XG5cdFx0Ly8gKGB0dXJuX2F1dG9fZW5kZWRgKSwgdGhlIHVzZXIgcHJvbW90ZXMgaXQsIG9yIHBsYXliYWNrIHN0b3BzLlxuXHRcdHRoaXMuX2JhcmdlSW5MaXN0ZW5BY3RpdmUgPSB0cnVlO1xuXHRcdC8vIE5PVEU6IHRoaXMgbWFya3MgdGhlIHR1cm4gc3RhcnQgYXQgcGxheWJhY2sgdGltZSwgbm90IHdoZW4gdGhlIHVzZXJcblx0XHQvLyBhY3R1YWxseSBzdGFydHMgc3BlYWtpbmcsIHNvIHZvaWNlIGxhdGVuY3kvaG9sZCB0ZWxlbWV0cnkgaW5cblx0XHQvLyBoYW5kcy1mcmVlIG1vZGUgaW5jbHVkZXMgcGxheWJhY2sgZHVyYXRpb24uIEFjY2VwdGVkIGtub3duIGxpbWl0YXRpb25cblx0XHQvLyAodGhlIGJhY2tlbmQgbGF0Y2hlcyBgdXNlcl9pc19zcGVha2luZ2Agb24gYHB0dF9zdGFydGApOyBhIHByZWNpc2Vcblx0XHQvLyBtZWFzdXJlIHdvdWxkIGtleSBvZmYgdGhlIGJhY2tlbmQncyBmaXJzdCBzcGVlY2gvdHJhbnNjcmlwdGlvbiBzaWduYWwuXG5cdFx0dGhpcy5fdGVsZW1ldHJ5UHR0RG93bk1zID0gRGF0ZS5ub3coKTtcblx0XHR0aGlzLm1pY0NhcHR1cmVTZXJ2aWNlLmlzTXV0ZWQgPSBmYWxzZTtcblx0XHR0aGlzLm1pY0NhcHR1cmVTZXJ2aWNlLnN1cHByZXNzVW50aWwoMCk7XG5cdFx0dGhpcy5taWNDYXB0dXJlU2VydmljZS5wdHREb3duKHRoaXMuX3B0dEN1cnJlbnRUdXJuSWQsIC8qIHBhc3NpdmUgKi8gdHJ1ZSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbdm9pY2VdIGJhcmdlLWluIGxpc3RlbiBmYWlsZWQgdG8gc3RhcnQnLCBlcnIpO1xuXHRcdFx0dGhpcy5fcHR0SGVsZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fYmFyZ2VJbkxpc3RlbkFjdGl2ZSA9IGZhbHNlO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqIERlYm91bmNlZCByZS1saXN0ZW4gYWZ0ZXIgYXNzaXN0YW50IHN0b3BzIHNwZWFraW5nLiAqL1xuXHRwcml2YXRlIF9zY2hlZHVsZUF1dG9MaXN0ZW4oKTogdm9pZCB7XG5cdFx0dGhpcy5fY2xlYXJBdXRvTGlzdGVuVGltZXIoKTtcblx0XHR0aGlzLl9hdXRvTGlzdGVuVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2F1dG9MaXN0ZW5UaW1lciA9IHVuZGVmaW5lZDtcblx0XHRcdC8vIFJlLWNoZWNrOiBkb24ndCBlbnRlciBsaXN0ZW5pbmcgaWYgd2UncmUgbm93IGF3YWl0aW5nIHJlcGx5IGF1ZGlvLlxuXHRcdFx0aWYgKHRoaXMuX2F3YWl0aW5nUmVwbHlBdWRpbykgeyByZXR1cm47IH1cblx0XHRcdHRoaXMuX2VudGVyQXV0b0xpc3RlbigpO1xuXHRcdH0sIFZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuX0FVVE9fTElTVEVOX1FVSUVUX01TKTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyQXV0b0xpc3RlblRpbWVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9hdXRvTGlzdGVuVGltZXIpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9hdXRvTGlzdGVuVGltZXIpO1xuXHRcdFx0dGhpcy5fYXV0b0xpc3RlblRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBCbG9jayBhdXRvLWxpc3RlbiB1bnRpbCByZXBseSBhdWRpbyBhcnJpdmVzICh3aXRoIDMwcyB3YXRjaGRvZykuICovXG5cdHByaXZhdGUgX3NldEF3YWl0aW5nUmVwbHkoKTogdm9pZCB7XG5cdFx0dGhpcy5fYXdhaXRpbmdSZXBseUF1ZGlvID0gdHJ1ZTtcblx0XHR0aGlzLl9hd2FpdGluZ1JlcGx5Rm9yU2Vzc2lvbiA9IHRoaXMuX2dldEFjdGl2ZVNlc3Npb25JZCgpO1xuXHRcdHRoaXMuX2NsZWFyQXV0b0xpc3RlblRpbWVyKCk7XG5cdFx0aWYgKHRoaXMuX2F3YWl0aW5nUmVwbHlXYXRjaGRvZykge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX2F3YWl0aW5nUmVwbHlXYXRjaGRvZyk7XG5cdFx0fVxuXHRcdHRoaXMuX2F3YWl0aW5nUmVwbHlXYXRjaGRvZyA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fYXdhaXRpbmdSZXBseVdhdGNoZG9nID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fYXdhaXRpbmdSZXBseUF1ZGlvID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9hd2FpdGluZ1JlcGx5Rm9yU2Vzc2lvbiA9IHVuZGVmaW5lZDtcblx0XHRcdC8vIE5vIHJlcGx5IGNhbWUgXHUyMDE0IHJlLWVudGVyIGxpc3RlbmluZyBpZiBlbGlnaWJsZS5cblx0XHRcdGlmICh0aGlzLl9pc0hhbmRzRnJlZUVuYWJsZWQoKSAmJiAhdGhpcy5fcHR0SGVsZCkge1xuXHRcdFx0XHR0aGlzLl9lbnRlckF1dG9MaXN0ZW4oKTtcblx0XHRcdH1cblx0XHR9LCAzMF8wMDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJBd2FpdGluZ1JlcGx5KCk6IHZvaWQge1xuXHRcdHRoaXMuX2F3YWl0aW5nUmVwbHlBdWRpbyA9IGZhbHNlO1xuXHRcdHRoaXMuX2F3YWl0aW5nUmVwbHlGb3JTZXNzaW9uID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLl9hd2FpdGluZ1JlcGx5V2F0Y2hkb2cpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9hd2FpdGluZ1JlcGx5V2F0Y2hkb2cpO1xuXHRcdFx0dGhpcy5fYXdhaXRpbmdSZXBseVdhdGNoZG9nID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FjY2VwdFZvaWNlSW5wdXQodGV4dDogc3RyaW5nLCBzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8SUNoYXRSZXNwb25zZU1vZGVsIHwgdW5kZWZpbmVkPignX2NoYXQudm9pY2UuYWNjZXB0SW5wdXQnLCB0ZXh0KS50aGVuKHJlc3BvbnNlID0+IHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBbdm9pY2VdIGFjY2VwdElucHV0IGNvbXBsZXRlZCBzZXNzaW9uPSR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9IHJlc3BvbnNlPSR7cmVzcG9uc2U/LmlkID8/ICdub25lJ30gY29ubmVjdGVkPSR7dGhpcy5faXNDb25uZWN0ZWQuZ2V0KCl9YCk7XG5cdFx0XHRpZiAocmVzcG9uc2UgJiYgdGhpcy5faXNDb25uZWN0ZWQuZ2V0KCkpIHtcblx0XHRcdFx0dGhpcy5fd2F0Y2hWb2ljZVByb2dyZXNzKHNlc3Npb25SZXNvdXJjZSwgcmVzcG9uc2UpO1xuXHRcdFx0fVxuXHRcdH0pLmNhdGNoKGVyciA9PiB0aGlzLmxvZ1NlcnZpY2Uud2FybignW3ZvaWNlXSBhY2NlcHRJbnB1dCBmYWlsZWQ6JywgZXJyKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZW5kVm9pY2VSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZTogVVJJLCB0ZXh0OiBzdHJpbmcpOiBQcm9taXNlPENoYXRTZW5kUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jaGF0U2VydmljZS5zZW5kUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UsIHRleHQsIHsgaXNWb2ljZU1vZGVJbnB1dDogdGhpcy5faXNWb2ljZVByb2dyZXNzRW5hYmxlZCgpIH0pLmNhdGNoKGVyciA9PiB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW3ZvaWNlXSBFcnJvciBzZW5kaW5nIHRyYW5zY3JpcHRpb246JywgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VudFJlc3VsdCA9IENoYXRTZW5kUmVzdWx0LmlzUXVldWVkKHJlc3VsdCkgPyByZXN1bHQuZGVmZXJyZWQgOiBQcm9taXNlLnJlc29sdmUocmVzdWx0KTtcblx0XHRzZW50UmVzdWx0LnRoZW4oYXN5bmMgc2VudCA9PiB7XG5cdFx0XHRpZiAoQ2hhdFNlbmRSZXN1bHQuaXNTZW50KHNlbnQpKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgc2VudC5kYXRhLnJlc3BvbnNlQ3JlYXRlZFByb21pc2U7XG5cdFx0XHRcdGlmICh0aGlzLl9pc0Nvbm5lY3RlZC5nZXQoKSkge1xuXHRcdFx0XHRcdHRoaXMuX3dhdGNoVm9pY2VQcm9ncmVzcyhzZXNzaW9uUmVzb3VyY2UsIHJlc3BvbnNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pLmNhdGNoKGVyciA9PiB0aGlzLmxvZ1NlcnZpY2Uud2FybignW3ZvaWNlXSBGYWlsZWQgdG8gd2F0Y2ggdm9pY2UgcmVzcG9uc2U6JywgZXJyKSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX3dhdGNoVm9pY2VQcm9ncmVzcyhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmVzcG9uc2U6IElDaGF0UmVzcG9uc2VNb2RlbCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNWb2ljZVByb2dyZXNzRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHRpbWVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9IHRoaXMuX3Nlc3Npb25LZXkoc2Vzc2lvbklkKTtcblx0XHRjb25zdCByZXF1ZXN0U3RhcnRlZEF0ID0gRGF0ZS5ub3coKTtcblx0XHRsZXQgbmFycmF0ZWRDb3VudCA9IDA7XG5cdFx0bGV0IGxhc3RDaGVja3BvaW50QXQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgbmV4dFNlcXVlbmNlID0gMTtcblx0XHRsZXQgcGVuZGluZzogeyBpZDogVm9pY2VDaGVja3BvaW50SWQ7IHZhbHVlOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgW3ZvaWNlXSB3YXRjaGluZyBwcm9ncmVzcyBzZXNzaW9uPSR7c2Vzc2lvbklkfSByZXNwb25zZT0ke3Jlc3BvbnNlLmlkfSByZXF1ZXN0PSR7cmVzcG9uc2UucmVxdWVzdElkfWApO1xuXG5cdFx0Y29uc3QgZGlzcG9zZSA9ICgpID0+IHRoaXMuX3ZvaWNlUHJvZ3Jlc3NMaXN0ZW5lcnMuZGVsZXRlQW5kRGlzcG9zZShyZXNwb25zZS5pZCk7XG5cdFx0Y29uc3QgbmV4dEVsaWdpYmxlQXQgPSAoKSA9PiB7XG5cdFx0XHRpZiAobGFzdENoZWNrcG9pbnRBdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBsYXN0Q2hlY2twb2ludEF0ICsgVm9pY2VTZXNzaW9uQ29udHJvbGxlci5fVk9JQ0VfUFJPR1JFU1NfSU5URVJWQUxfTVM7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsYXN0U3Bva2VuQXQgPSB0aGlzLl9sYXN0U3Bva2VuQXRCeVNlc3Npb24uZ2V0KHNlc3Npb25LZXkpO1xuXHRcdFx0cmV0dXJuIE1hdGgubWF4KFxuXHRcdFx0XHRyZXF1ZXN0U3RhcnRlZEF0ICsgVm9pY2VTZXNzaW9uQ29udHJvbGxlci5fVk9JQ0VfUFJPR1JFU1NfSU5JVElBTF9ERUxBWV9NUyxcblx0XHRcdFx0KGxhc3RTcG9rZW5BdCA/PyAwKSArIFZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuX1ZPSUNFX1BST0dSRVNTX0lOSVRJQUxfREVMQVlfTVMsXG5cdFx0XHQpO1xuXHRcdH07XG5cdFx0Y29uc3QgZmx1c2ggPSAoKSA9PiB7XG5cdFx0XHR0aW1lci5jbGVhcigpO1xuXHRcdFx0aWYgKCF0aGlzLl9pc1ZvaWNlUHJvZ3Jlc3NFbmFibGVkKCkpIHtcblx0XHRcdFx0ZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzcG9uc2UuaXNDb21wbGV0ZSB8fCByZXNwb25zZS5pc0NhbmNlbGVkKSB7XG5cdFx0XHRcdGRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFwZW5kaW5nIHx8IG5hcnJhdGVkQ291bnQgPj0gVm9pY2VTZXNzaW9uQ29udHJvbGxlci5fTUFYX1ZPSUNFX1BST0dSRVNTX1BFUl9SRVFVRVNUKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5faXNDb25uZWN0ZWQuZ2V0KCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2FuUmVwbGFjZVBsYXlpbmdDaGVja3BvaW50ID0gdGhpcy5fY3VycmVudFBsYXliYWNrTmFycmF0aW9uPy5raW5kID09PSAnY2hlY2twb2ludCc7XG5cdFx0XHRpZiAodGhpcy50dHNQbGF5YmFja1NlcnZpY2UuaXNQbGF5aW5nICYmICFjYW5SZXBsYWNlUGxheWluZ0NoZWNrcG9pbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGVsYXkgPSBuZXh0RWxpZ2libGVBdCgpIC0gRGF0ZS5ub3coKTtcblx0XHRcdGlmIChkZWxheSA+IDApIHtcblx0XHRcdFx0dGltZXIudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dChmbHVzaCwgZGVsYXkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNoZWNrcG9pbnQgPSBwZW5kaW5nO1xuXHRcdFx0cGVuZGluZyA9IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IG1ldGFkYXRhOiBJVm9pY2VDaGVja3BvaW50TmFycmF0aW9uTWV0YWRhdGEgPSB7XG5cdFx0XHRcdHJlcXVlc3RJZDogcmVzcG9uc2UucmVxdWVzdElkLFxuXHRcdFx0XHRjaGVja3BvaW50SWQ6IGNoZWNrcG9pbnQuaWQsXG5cdFx0XHRcdHNlcXVlbmNlOiBuZXh0U2VxdWVuY2UrKyxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBuYXJyYXRlZCA9IHRoaXMuX2lzQ29ubmVjdGVkLmdldCgpXG5cdFx0XHRcdCYmIHRoaXMuX2lzU2FtZVNlc3Npb24oc2Vzc2lvbklkLCB0aGlzLl9zaG93blNlc3Npb25JZCgpKVxuXHRcdFx0XHQmJiB0aGlzLl9uYXJyYXRlKHNlc3Npb25JZCwgJ2NoZWNrcG9pbnQnLCBjaGVja3BvaW50LnZhbHVlLCB1bmRlZmluZWQsIG1ldGFkYXRhKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBbdm9pY2VdIGNoZWNrcG9pbnQgZGlzcGF0Y2ggc2Vzc2lvbj0ke3Nlc3Npb25JZH0gcmVzcG9uc2U9JHtyZXNwb25zZS5pZH0gc3RhZ2U9JHtjaGVja3BvaW50LmlkfSBzZXF1ZW5jZT0ke21ldGFkYXRhLnNlcXVlbmNlfSBuYXJyYXRlZD0ke0Jvb2xlYW4obmFycmF0ZWQpfWApO1xuXHRcdFx0aWYgKG5hcnJhdGVkKSB7XG5cdFx0XHRcdG5hcnJhdGVkQ291bnQrKztcblx0XHRcdFx0bGFzdENoZWNrcG9pbnRBdCA9IERhdGUubm93KCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBzY2hlZHVsZSA9ICgpID0+IHtcblx0XHRcdHRpbWVyLmNsZWFyKCk7XG5cdFx0XHRjb25zdCBkZWxheSA9IG5leHRFbGlnaWJsZUF0KCkgLSBEYXRlLm5vdygpO1xuXHRcdFx0aWYgKGRlbGF5IDw9IDApIHtcblx0XHRcdFx0Zmx1c2goKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRpbWVyLnZhbHVlID0gZGlzcG9zYWJsZVRpbWVvdXQoZmx1c2gsIGRlbGF5KTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHVwZGF0ZSA9ICgpID0+IHtcblx0XHRcdGlmICghdGhpcy5faXNWb2ljZVByb2dyZXNzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdGRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3BvbnNlLmlzQ29tcGxldGUgfHwgcmVzcG9uc2UuaXNDYW5jZWxlZCkge1xuXHRcdFx0XHR0aGlzLl9wcmVlbXB0Q2hlY2twb2ludFBsYXliYWNrKHNlc3Npb25JZCk7XG5cdFx0XHRcdGRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHJlc3BvbnNlLnJlc3BvbnNlLnZhbHVlKSB7XG5cdFx0XHRcdGlmIChwYXJ0LmtpbmQgIT09ICd2b2ljZVByb2dyZXNzJyB8fCAhaXNWb2ljZUNoZWNrcG9pbnRJZChwYXJ0LmlkKSB8fCBzZWVuLmhhcyhwYXJ0LmlkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlZW4uYWRkKHBhcnQuaWQpO1xuXHRcdFx0XHRwZW5kaW5nID0geyBpZDogcGFydC5pZCwgdmFsdWU6IHBhcnQudmFsdWUgfTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFt2b2ljZV0gY2hlY2twb2ludCBvYnNlcnZlZCBzZXNzaW9uPSR7c2Vzc2lvbklkfSByZXNwb25zZT0ke3Jlc3BvbnNlLmlkfSBzdGFnZT0ke3BhcnQuaWR9YCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocGVuZGluZykge1xuXHRcdFx0XHRzY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVzcG9uc2Uub25EaWRDaGFuZ2UodXBkYXRlKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc0Nvbm5lY3RlZC5yZWFkKHJlYWRlcikgJiYgcGVuZGluZykge1xuXHRcdFx0XHRzY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy50dHNQbGF5YmFja1NlcnZpY2Uub25QbGF5YmFja1N0b3BwZWQoKCkgPT4ge1xuXHRcdFx0aWYgKHBlbmRpbmcpIHtcblx0XHRcdFx0c2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gdGhpcy5fdm9pY2VQcm9ncmVzc1Nlc3Npb25CeVJlc3BvbnNlLmRlbGV0ZShyZXNwb25zZS5pZCkgfSk7XG5cdFx0dGhpcy5fdm9pY2VQcm9ncmVzc0xpc3RlbmVycy5zZXQocmVzcG9uc2UuaWQsIGRpc3Bvc2FibGVzKTtcblx0XHR0aGlzLl92b2ljZVByb2dyZXNzU2Vzc2lvbkJ5UmVzcG9uc2Uuc2V0KHJlc3BvbnNlLmlkLCBzZXNzaW9uS2V5KTtcblx0XHR1cGRhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzVm9pY2VQcm9ncmVzc0VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oVk9JQ0VfQUdFTlRfUFJPR1JFU1NfU0VUVElORykgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxWb2ljZVByb2dyZXNzKHNlc3Npb25JZD86IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSBzZXNzaW9uSWQgPyB0aGlzLl9zZXNzaW9uS2V5KHNlc3Npb25JZCkgOiB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCByZXNwb25zZUlkIG9mIFsuLi50aGlzLl92b2ljZVByb2dyZXNzTGlzdGVuZXJzLmtleXMoKV0pIHtcblx0XHRcdGlmIChzZXNzaW9uS2V5ID09PSB1bmRlZmluZWQgfHwgdGhpcy5fdm9pY2VQcm9ncmVzc1Nlc3Npb25CeVJlc3BvbnNlLmdldChyZXNwb25zZUlkKSA9PT0gc2Vzc2lvbktleSkge1xuXHRcdFx0XHR0aGlzLl92b2ljZVByb2dyZXNzTGlzdGVuZXJzLmRlbGV0ZUFuZERpc3Bvc2UocmVzcG9uc2VJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNlbmQgdHJhbnNjcmlwdGlvbiB0ZXh0IHRvIHRoZSB0YXJnZXQgc2Vzc2lvbiBvciBhY3RpdmUgY2hhdC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3NlbmRUcmFuc2NyaXB0aW9uVG9DaGF0KHRleHQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIEEgZm9jdXMtY2hhbmdlIHN1Ym1pdCBwaW5zIHJvdXRpbmcgdG8gdGhlIHNlc3Npb24gdGhlIHVzZXIgd2FzXG5cdFx0Ly8gZGljdGF0aW5nIGludG87IGl0IHRha2VzIHByaW9yaXR5IG92ZXIgdGhlIHVzZXItcGlja2VkIHRhcmdldCBhbmQgdGhlXG5cdFx0Ly8gY3VycmVudGx5IGZvY3VzZWQgc2Vzc2lvbiBzbyB0aGVpciB3b3JkcyBsYW5kIHdoZXJlIHRoZXkgd2VyZSBhaW1lZC5cblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9jb25zdW1lUGlubmVkU3VibWl0U2Vzc2lvbigpID8/IHRoaXMuX3RhcmdldFNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKHRhcmdldCkge1xuXHRcdFx0Ly8gQ2hlY2sgaWYgdGFyZ2V0IGlzIHRoZSBjdXJyZW50bHkgdmlzaWJsZSBzZXNzaW9uXG5cdFx0XHRjb25zdCBjdXJyZW50U2Vzc2lvbiA9IGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8c3RyaW5nIHwgdW5kZWZpbmVkPignX2NoYXQudm9pY2UuZ2V0Q3VycmVudFNlc3Npb24nKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgaXNUYXJnZXRWaXNpYmxlID0gY3VycmVudFNlc3Npb24gPT09IHRhcmdldC50b1N0cmluZygpO1xuXG5cdFx0XHRpZiAoaXNUYXJnZXRWaXNpYmxlKSB7XG5cdFx0XHRcdC8vIFRhcmdldCBpcyB2aXNpYmxlIFx1MjAxNCBzZW5kIHZpYSB0aGUgY2hhdCBwYW5lIGRpcmVjdGx5XG5cdFx0XHRcdHRoaXMuX2FjY2VwdFZvaWNlSW5wdXQodGV4dCwgdGFyZ2V0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFRhcmdldCBpcyBOT1QgdmlzaWJsZSBcdTIwMTQgZW5zdXJlIHNlc3Npb24gaXMgbG9hZGVkLCB0aGVuIHNlbmRcblx0XHRcdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuY2hhdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24odGFyZ2V0LCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjdHMudG9rZW4sICd2b2ljZS1zZW5kJykuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW3ZvaWNlXSBGYWlsZWQgdG8gbG9hZCB0YXJnZXQgc2Vzc2lvbjonLCBlcnIpO1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdFx0XHRpZiAoIXJlZikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbdm9pY2VdIENvdWxkIG5vdCBsb2FkIHRhcmdldCBzZXNzaW9uLCBmYWxsaW5nIGJhY2sgdG8gc3dpdGNoJyk7XG5cdFx0XHRcdFx0Ly8gRmFsbGJhY2s6IHN3aXRjaCB0byB0aGUgc2Vzc2lvbiBhbmQgc2VuZCB2aWEgdGhlIFVJXG5cdFx0XHRcdFx0Y29uc3Qgc3dpdGNoZWQgPSBhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPGJvb2xlYW4+KCdfY2hhdC52b2ljZS5zd2l0Y2hUb1Nlc3Npb24nLCB0YXJnZXQudG9TdHJpbmcoKSkuY2F0Y2goKCkgPT4gZmFsc2UpO1xuXHRcdFx0XHRcdGlmIChzd2l0Y2hlZCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDIwMCkpO1xuXHRcdFx0XHRcdFx0dGhpcy5fYWNjZXB0Vm9pY2VJbnB1dCh0ZXh0LCB0YXJnZXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fc2VuZFZvaWNlUmVxdWVzdCh0YXJnZXQsIHRleHQpO1xuXHRcdFx0XHRpZiAocmVzdWx0ICYmIHJlc3VsdC5raW5kICE9PSAncmVqZWN0ZWQnKSB7XG5cdFx0XHRcdFx0Ly8gU3VyZmFjZSByZXNwb25zZSBpbiBmbG9hdGluZyB3aW5kb3dcblx0XHRcdFx0XHR0aGlzLl93YXRjaFJlc3BvbnNlRm9yRmxvYXRpbmdXaW5kb3codGFyZ2V0KTtcblx0XHRcdFx0XHQvLyBPcGVuIHRoZSBmbG9hdGluZyB3aW5kb3cgc28gdXNlciBjYW4gc2VlIHRoZSByZXNwb25zZVxuXHRcdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ19hZ2VudHNWb2ljZS5vcGVuV2luZG93JykuY2F0Y2goKCkgPT4geyAvKiBpZ25vcmUgKi8gfSk7XG5cdFx0XHRcdFx0Ly8gS2VlcCB0aGUgc2Vzc2lvbiBtb2RlbCBsb2FkZWQgdW50aWwgdGhlIHJlc3BvbnNlIGNvbXBsZXRlc1xuXHRcdFx0XHRcdC8vIHNvIHRoZSBhdXRvcnVuIGNhbiBvYnNlcnZlIHN0YXRlIHRyYW5zaXRpb25zIGFuZCB0cmlnZ2VyIG5hcnJhdGlvbi5cblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbih0YXJnZXQpO1xuXHRcdFx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFzdFJlcSA9IG1vZGVsLmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdFx0XHRcdFx0aWYgKGxhc3RSZXE/LnJlc3BvbnNlICYmICFsYXN0UmVxLnJlc3BvbnNlLmlzQ29tcGxldGUgJiYgIWxhc3RSZXEucmVzcG9uc2UuaXNDYW5jZWxlZCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZXNwb25zZURpc3Bvc2FibGUgPSBsYXN0UmVxLnJlc3BvbnNlLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAobGFzdFJlcS5yZXNwb25zZSEuaXNDb21wbGV0ZSB8fCBsYXN0UmVxLnJlc3BvbnNlIS5pc0NhbmNlbGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXNwb25zZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBVc2UgdGhlIGN1cnJlbnRseSBmb2N1c2VkIGNoYXQgc2Vzc2lvbiBpZiBhdmFpbGFibGVcblx0XHRcdGNvbnN0IGN1cnJlbnRTZXNzaW9uID0gYXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxzdHJpbmcgfCB1bmRlZmluZWQ+KCdfY2hhdC52b2ljZS5nZXRDdXJyZW50U2Vzc2lvbicpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0XHRpZiAoY3VycmVudFNlc3Npb24pIHtcblx0XHRcdFx0Ly8gVGhlcmUncyBhbiBhY3RpdmUgY2hhdCB3aWRnZXQgXHUyMDE0IHNlbmQgdG8gaXRcblx0XHRcdFx0dGhpcy5fYWNjZXB0Vm9pY2VJbnB1dCh0ZXh0LCBVUkkucGFyc2UoY3VycmVudFNlc3Npb24pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIE5vIGZvY3VzZWQgY2hhdCBzZXNzaW9uIFx1MjAxNCBmaW5kIHRoZSBtb3N0IHJlY2VudCBleGlzdGluZyBzZXNzaW9uXG5cdFx0XHRcdC8vIGluc3RlYWQgb2YgY3JlYXRpbmcgYSBuZXcgb25lLCBzbyB2b2ljZSBjb250aW51ZXMgdGhlIGNvbnZlcnNhdGlvbi5cblx0XHRcdFx0Y29uc3QgbW9kZWxzID0gWy4uLnRoaXMuY2hhdFNlcnZpY2UuY2hhdE1vZGVscy5nZXQoKV07XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nU2Vzc2lvbiA9IG1vZGVscy5sZW5ndGggPiAwID8gbW9kZWxzW21vZGVscy5sZW5ndGggLSAxXSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gZXhpc3RpbmdTZXNzaW9uPy5zZXNzaW9uUmVzb3VyY2U7XG5cblx0XHRcdFx0aWYgKHNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0XHRcdC8vIFN3aXRjaCB0byBhbmQgc2VuZCB0byB0aGUgZXhpc3Rpbmcgc2Vzc2lvblxuXHRcdFx0XHRcdGNvbnN0IHN3aXRjaGVkID0gYXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxib29sZWFuPignX2NoYXQudm9pY2Uuc3dpdGNoVG9TZXNzaW9uJywgc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpLmNhdGNoKCgpID0+IGZhbHNlKTtcblx0XHRcdFx0XHRpZiAoc3dpdGNoZWQpIHtcblx0XHRcdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAyMDApKTtcblx0XHRcdFx0XHRcdHRoaXMuX2FjY2VwdFZvaWNlSW5wdXQodGV4dCwgc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gRGlyZWN0IHNlbmQgYXMgZmFsbGJhY2tcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX3NlbmRWb2ljZVJlcXVlc3Qoc2Vzc2lvblJlc291cmNlLCB0ZXh0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gVHJ1bHkgbm8gc2Vzc2lvbnMgZXhpc3QgXHUyMDE0IGNyZWF0ZSBvbmVcblx0XHRcdFx0XHRjb25zdCByZWYgPSB0aGlzLmNoYXRTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0XHRcdGNvbnN0IHJlc291cmNlID0gcmVmLm9iamVjdC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHQvLyBTd2l0Y2ggdG8gdGhlIG5ldyBzZXNzaW9uIHNvIHRoZSB1c2VyIHNlZXMgdGhlIHJlc3BvbnNlXG5cdFx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnX2NoYXQudm9pY2Uuc3dpdGNoVG9TZXNzaW9uJywgcmVzb3VyY2UudG9TdHJpbmcoKSkuY2F0Y2goKCkgPT4geyAvKiBwYW5lIG1heSBub3QgZXhpc3QgKi8gfSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fc2VuZFZvaWNlUmVxdWVzdChyZXNvdXJjZSwgdGV4dCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gRW5zdXJlIHRoZSBjaGF0IHZpZXcgaXMgdmlzaWJsZSBzbyB0aGUgdXNlciBzZWVzL2hlYXJzIHRoZSByZXNwb25zZVxuXHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLnBhbmVsLmNoYXQudmlldy5jb3BpbG90LmZvY3VzJykuY2F0Y2goKCkgPT4geyAvKiBpZ25vcmUgKi8gfSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFdhdGNoIGEgc2Vzc2lvbidzIGxhdGVzdCByZXNwb25zZSBhbmQgc3VyZmFjZSBpdCBpbiB0aGUgZmxvYXRpbmcgd2luZG93XG5cdCAqIHRyYW5zY3JpcHQuIENhbGxlZCB3aGVuIHZvaWNlIHNlbmRzIHRvIGEgbm9uLXZpc2libGUgc2Vzc2lvbiBzbyB0aGUgdXNlclxuXHQgKiBjYW4gc2VlIHRoZSByZXBseSB3aXRob3V0IHN3aXRjaGluZyB0aGUgY2hhdCBwYW5lbC5cblx0ICovXG5cdHByaXZhdGUgX3dhdGNoUmVzcG9uc2VGb3JGbG9hdGluZ1dpbmRvdyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNlZWQgdGhlIHN0YXRlIGNhY2hlIHNvIHRoZSBkZWx0YSBtZWNoYW5pc20gc2VlcyB0aGlua2luZ1x1MjE5MmlkbGUgYXMgYSB0cmFuc2l0aW9uXG5cdFx0Ly8gYW5kIGluY2x1ZGVzIGxhc3RfcmVzcG9uc2Vfc3VtbWFyeSBpbiB0aGUgcGF0Y2guXG5cdFx0dGhpcy5fcHJldlNlc3Npb25TdGF0ZXMuc2V0KHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLCB7IHN0YXRlOiAndGhpbmtpbmcnLCBkZXRhaWw6ICcnLCBwZW5kaW5nSWQ6ICcnLCBsYXN0UmVzcG9uc2VTdW1tYXJ5OiAnJyB9KTtcblx0XHR0aGlzLl9zZW5kQ29udGV4dCgpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bGV0IGxhc3RUZXh0ID0gJyc7XG5cblx0XHRjb25zdCB1cGRhdGVGcm9tUmVzcG9uc2UgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBsYXN0UmVxID0gbW9kZWwubGFzdFJlcXVlc3Q7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGxhc3RSZXE/LnJlc3BvbnNlO1xuXHRcdFx0aWYgKCFyZXNwb25zZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1hcmtkb3duID0gcmVzcG9uc2UucmVzcG9uc2UuZ2V0TWFya2Rvd24oKTtcblx0XHRcdC8vIE9ubHkgZmlyc3QgfjIwMCBjaGFycyBmb3IgdGhlIGZsb2F0aW5nIHdpbmRvdyB0cmFuc2NyaXB0IHByZXZpZXdcblx0XHRcdGNvbnN0IHByZXZpZXdUZXh0ID0gbWFya2Rvd24ubGVuZ3RoID4gMjAwID8gbWFya2Rvd24uc2xpY2UoMCwgMjAwKSArICdcdTIwMjYnIDogbWFya2Rvd247XG5cdFx0XHRpZiAocHJldmlld1RleHQgJiYgcHJldmlld1RleHQgIT09IGxhc3RUZXh0KSB7XG5cdFx0XHRcdGNvbnN0IGlzRmlyc3QgPSBsYXN0VGV4dCA9PT0gJyc7XG5cdFx0XHRcdGxhc3RUZXh0ID0gcHJldmlld1RleHQ7XG5cdFx0XHRcdHRoaXMuX3NldEFzc2lzdGFudFR1cm4ocHJldmlld1RleHQsIHsgc3RhcnROZXdUdXJuOiBpc0ZpcnN0IH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVzcG9uc2UuaXNDb21wbGV0ZSB8fCByZXNwb25zZS5pc0NhbmNlbGVkKSB7XG5cdFx0XHRcdC8vIE5vdGlmeSB0aGUgdm9pY2UgYmFja2VuZCBvZiB0aGUgc3RhdGUgdHJhbnNpdGlvbiBzbyBpdCBjYW5cblx0XHRcdFx0Ly8gbmFycmF0ZSB0aGUgcmVzcG9uc2UgZm9yIHRoaXMgbm9uLWZvY3VzZWQgc2Vzc2lvbi5cblx0XHRcdFx0dGhpcy5fcHJldlNlc3Npb25TdGF0ZXMuc2V0KHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLCB7IHN0YXRlOiAnaWRsZScsIGRldGFpbDogJycsIHBlbmRpbmdJZDogJycsIGxhc3RSZXNwb25zZVN1bW1hcnk6ICcnIH0pO1xuXHRcdFx0XHR0aGlzLl9zZW5kQ29udGV4dCgpO1xuXHRcdFx0XHR0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5mbHVzaFNlc3Npb25Db250ZXh0KCk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gTGlzdGVuIGZvciByZXNwb25zZSBjaGFuZ2VzXG5cdFx0Y29uc3QgY2hlY2tSZXNwb25zZSA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGxhc3RSZXEgPSBtb2RlbC5sYXN0UmVxdWVzdDtcblx0XHRcdGlmIChsYXN0UmVxPy5yZXNwb25zZSkge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFzdFJlcS5yZXNwb25zZS5vbkRpZENoYW5nZSgoKSA9PiB1cGRhdGVGcm9tUmVzcG9uc2UoKSkpO1xuXHRcdFx0XHR1cGRhdGVGcm9tUmVzcG9uc2UoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gVGhlIHJlc3BvbnNlIG1heSBub3QgZXhpc3QgeWV0IFx1MjAxNCBsaXN0ZW4gZm9yIG1vZGVsIGNoYW5nZXNcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5raW5kID09PSAnYWRkUmVzcG9uc2UnKSB7XG5cdFx0XHRcdGNoZWNrUmVzcG9uc2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y2hlY2tSZXNwb25zZSgpO1xuXG5cdFx0Ly8gU2FmZXR5OiBkaXNwb3NlIGFmdGVyIDUgbWludXRlcyBpbiBjYXNlIHRoZSByZXNwb25zZSBuZXZlciBjb21wbGV0ZXNcblx0XHRjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCksIDUgKiA2MCAqIDEwMDApO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IGNsZWFyVGltZW91dCh0aW1lb3V0KSB9KTtcblx0fVxuXG5cdC8vIC0tLSBUcmFuc2NyaXB0IGJ1ZmZlciBoZWxwZXJzIC0tLVxuXG5cdHByaXZhdGUgX3B1c2hUdXJuKHR1cm46IElUcmFuc2NyaXB0VHVybik6IHZvaWQge1xuXHRcdGNvbnN0IGN1ciA9IHRoaXMuX3RyYW5zY3JpcHRUdXJucy5nZXQoKTtcblx0XHRjb25zdCBuZXh0ID0gWy4uLmN1ciwgdHVybl0uc2xpY2UoLVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuX01BWF9UVVJOUyk7XG5cdFx0dGhpcy5fdHJhbnNjcmlwdFR1cm5zLnNldChuZXh0LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0YXJ0IGEgbmV3IHVzZXIgdHVybiBhdCB0aGUgdGFpbCBvZiB0aGUgYnVmZmVyLiBJZiB0aGUgcHJldmlvdXMgdGFpbCBpc1xuXHQgKiBhbHJlYWR5IGFuIGVtcHR5IHVzZXIgdHVybiAocmFwaWQgUFRUIHRvZ2dsZSBiZWZvcmUgYW55IHRyYW5zY3JpcHRpb25cblx0ICogbGFuZGVkKSwgcmV1c2UgaXQgaW5zdGVhZCBvZiBwdXNoaW5nIGEgZHVwbGljYXRlIGVtcHR5IGVudHJ5LlxuXHQgKi9cblx0cHJpdmF0ZSBfc3RhcnRVc2VyVHVybigpOiB2b2lkIHtcblx0XHRjb25zdCBjdXIgPSB0aGlzLl90cmFuc2NyaXB0VHVybnMuZ2V0KCk7XG5cdFx0Y29uc3QgbGFzdCA9IGN1cltjdXIubGVuZ3RoIC0gMV07XG5cdFx0aWYgKGxhc3QgJiYgbGFzdC5zcGVha2VyID09PSAndXNlcicgJiYgIWxhc3QudGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wdXNoVHVybih7IHNwZWFrZXI6ICd1c2VyJywgdGV4dDogJycsIGNvbW1pdHRlZDogJycsIGlzUGFydGlhbDogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVVzZXJUdXJuKHRleHQ6IHN0cmluZywgY29tbWl0dGVkOiBzdHJpbmcsIGlzUGFydGlhbDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGN1ciA9IHRoaXMuX3RyYW5zY3JpcHRUdXJucy5nZXQoKTtcblx0XHRjb25zdCBsYXN0ID0gY3VyW2N1ci5sZW5ndGggLSAxXTtcblx0XHRpZiAoIWxhc3QgfHwgbGFzdC5zcGVha2VyICE9PSAndXNlcicpIHtcblx0XHRcdC8vIFNlcnZlci1WQUQgb3Igb3RoZXIgcGF0aCB0aGF0IGRlbGl2ZXJlZCB0cmFuc2NyaXB0aW9uIGJlZm9yZSBhXG5cdFx0XHQvLyBmb3JtYWwgdHVybiB3YXMgc3RhcnRlZCBcdTIwMTQgb3BlbiBvbmUgbm93LlxuXHRcdFx0dGhpcy5fcHVzaFR1cm4oeyBzcGVha2VyOiAndXNlcicsIHRleHQsIGNvbW1pdHRlZCwgaXNQYXJ0aWFsIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB1cGRhdGVkOiBJVHJhbnNjcmlwdFR1cm4gPSB7IHNwZWFrZXI6ICd1c2VyJywgdGV4dCwgY29tbWl0dGVkLCBpc1BhcnRpYWwgfTtcblx0XHR0aGlzLl90cmFuc2NyaXB0VHVybnMuc2V0KFsuLi5jdXIuc2xpY2UoMCwgLTEpLCB1cGRhdGVkXSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGUgdGhlIGFzc2lzdGFudCB0dXJuIGF0IHRoZSB0YWlsIG9mIHRoZSBidWZmZXIgd2l0aCBgdGV4dGAuXG5cdCAqXG5cdCAqIFRoZSBzdHJlYW1pbmcgVFRTIHBpcGVsaW5lIHB1c2hlcyBhIG1vbm90b25pY2FsbHktZ3Jvd2luZyB0cmFuc2NyaXB0XG5cdCAqIHdpdGggZWFjaCBhdWRpbyBjaHVuayBvZiBhIHJlc3BvbnNlLiBgc3RhcnROZXdUdXJuYCBkaXN0aW5ndWlzaGVzXG5cdCAqIHRoZSBmaXJzdCBjaHVuayBvZiBhIE5FVyByZXNwb25zZSAocHVzaCBhIGZyZXNoIGFzc2lzdGFudCB0dXJuKVxuXHQgKiBmcm9tIGNvbnRpbnVhdGlvbiBjaHVua3Mgb2YgdGhlIFNBTUUgcmVzcG9uc2UgKHJlcGxhY2UgdGhlIHRhaWwnc1xuXHQgKiB0ZXh0IGFzIHRoZSB0cmFuc2NyaXB0IGdyb3dzKS4gVGhpcyBwcmV2ZW50cyB0d28gZGlzdGluY3Rcblx0ICogYXNzaXN0YW50IHJlc3BvbnNlcyBmcm9tIGNvbGxhcHNpbmcgaW50byBvbmUgd2hlbiB0aGV5IGhhcHBlblxuXHQgKiBiYWNrLXRvLWJhY2sgd2l0aG91dCBhbiBpbnRlcnZlbmluZyB1c2VyIHR1cm4gKGUuZy4gcHJvYWN0aXZlXG5cdCAqIG5hcnJhdGlvbiBmb2xsb3dlZCBieSBhIGNvbW1hbmQgcmVwbHkpLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2V0QXNzaXN0YW50VHVybih0ZXh0OiBzdHJpbmcsIG9wdHM6IHsgc3RhcnROZXdUdXJuOiBib29sZWFuIH0gPSB7IHN0YXJ0TmV3VHVybjogdHJ1ZSB9KTogdm9pZCB7XG5cdFx0Y29uc3QgY3VyID0gdGhpcy5fdHJhbnNjcmlwdFR1cm5zLmdldCgpO1xuXHRcdGNvbnN0IGxhc3QgPSBjdXJbY3VyLmxlbmd0aCAtIDFdO1xuXHRcdGlmICghb3B0cy5zdGFydE5ld1R1cm4gJiYgbGFzdCAmJiBsYXN0LnNwZWFrZXIgPT09ICdhc3Npc3RhbnQnKSB7XG5cdFx0XHRjb25zdCB1cGRhdGVkOiBJVHJhbnNjcmlwdFR1cm4gPSB7IHNwZWFrZXI6ICdhc3Npc3RhbnQnLCB0ZXh0LCBjb21taXR0ZWQ6ICcnLCBpc1BhcnRpYWw6IGZhbHNlIH07XG5cdFx0XHR0aGlzLl90cmFuc2NyaXB0VHVybnMuc2V0KFsuLi5jdXIuc2xpY2UoMCwgLTEpLCB1cGRhdGVkXSwgdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcHVzaFR1cm4oeyBzcGVha2VyOiAnYXNzaXN0YW50JywgdGV4dCwgY29tbWl0dGVkOiAnJywgaXNQYXJ0aWFsOiBmYWxzZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2NhbmNlbFRyYW5zY3JpcHRGYWRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl90cmFuc2NyaXB0RmFkZVRpbWVyKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fdHJhbnNjcmlwdEZhZGVUaW1lcik7XG5cdFx0XHR0aGlzLl90cmFuc2NyaXB0RmFkZVRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBUcmFuc2NyaXB0IHBlcnNpc3RlbmNlIChsb2NhbC1vbmx5KSAtLS1cblxuXHQvKipcblx0ICogQXBwZW5kIGEgZmluYWwgZW50cnkgdG8gdGhlIG9uLWRpc2sgdHJhbnNjcmlwdCBzdG9yZS5cblx0ICpcblx0ICogRW50cnkgaWRzIGFyZSBnZW5lcmF0ZWQgbG9jYWxseSBcdTIwMTQgdm9pY2VfY29kZSdzIGJhY2tlbmQgaGFzIG5vIHBlcnNpc3RlbnRcblx0ICogY29udmVyc2F0aW9uIG1lbW9yeSB0b2RheSwgc28gdGhlcmUncyBubyBzZXJ2ZXItaXNzdWVkIGlkIHRvIGRlZmVyIHRvLlxuXHQgKiBFYWNoIG5ldyBlbnRyeSBjaGFpbnMgb2ZmIHRoZSBwcmV2aW91cyBvbmUgdmlhIGBgYW5jZXN0b3JJZHNgYCBzbyBhIFVJXG5cdCAqIGNhbiBzaG93IHRoZSBsaW5lYXIgY29udmVyc2F0aW9uIG9yZGVyLlxuXHQgKlxuXHQgKiBgYHVzZXJfdm9pY2VgYCBhbmQgYGBhZ2VudF92b2ljZWBgIGFyZSB1c2VyLXZpc2libGUgaW4gdGhlIHRyYW5zY3JpcHRzXG5cdCAqIHBhbmUuIGBgYWdlbnRfdG9vbF9jYWxsYGAgYW5kIGBgY29kaW5nX2V2ZW50YGAgYXJlIHBlcnNpc3RlZCBvbmx5IHNvIHdlXG5cdCAqIGNhbiByZXBsYXkgdGhlbSBhcyBjcm9zcy1zZXNzaW9uIGNvbnRleHQgdG8gdGhlIGJhY2tlbmQgb24gcmVjb25uZWN0LlxuXHQgKi9cblx0cHJpdmF0ZSBfcGVyc2lzdEVudHJ5KFxuXHRcdGtpbmQ6IFZvaWNlVHJhbnNjcmlwdEtpbmQsXG5cdFx0dGV4dDogc3RyaW5nLFxuXHRcdG1ldGFkYXRhPzogSVZvaWNlVHJhbnNjcmlwdEVudHJ5TWV0YWRhdGEsXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IHVzZXJJZCA9IHRoaXMuX3VzZXJMb2dpbjtcblx0XHRpZiAoIXVzZXJJZCB8fCAhdGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlbnRyeTogSVZvaWNlVHJhbnNjcmlwdFR1cm4gPSB7XG5cdFx0XHR0dXJuSWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0YW5jZXN0b3JJZHM6IHRoaXMuX2xhc3RQZXJzaXN0ZWRUdXJuSWQgPyBbdGhpcy5fbGFzdFBlcnNpc3RlZFR1cm5JZF0gOiBbXSxcblx0XHRcdGtpbmQsXG5cdFx0XHRyb2xlOiBraW5kID09PSAndXNlcl92b2ljZScgPyAndXNlcicgOiAnYXNzaXN0YW50Jyxcblx0XHRcdHRleHQsXG5cdFx0XHR0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdC4uLihtZXRhZGF0YSA/IHsgbWV0YWRhdGEgfSA6IHt9KSxcblx0XHR9O1xuXHRcdHRoaXMuX2xhc3RQZXJzaXN0ZWRUdXJuSWQgPSBlbnRyeS50dXJuSWQ7XG5cdFx0dGhpcy52b2ljZVRyYW5zY3JpcHRTdG9yZS5hcHBlbmRUdXJuKHVzZXJJZCwgZW50cnkpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW3ZvaWNlXSBmYWlsZWQgdG8gcGVyc2lzdCB0cmFuc2NyaXB0IGVudHJ5JywgZXJyKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKiBCYWNrLWNvbXBhdCB0aGluIHNoaW0gZm9yIHRoZSB0d28gZXhpc3Rpbmcgdm9pY2UgY2FsbCBzaXRlcy4gKi9cblx0cHJpdmF0ZSBfcGVyc2lzdFR1cm4ocm9sZTogJ3VzZXInIHwgJ2Fzc2lzdGFudCcsIHRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3BlcnNpc3RFbnRyeShyb2xlID09PSAndXNlcicgPyAndXNlcl92b2ljZScgOiAnYWdlbnRfdm9pY2UnLCB0ZXh0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPbmUtbGluZSwgaHVtYW4vTExNLXJlYWRhYmxlIHN1bW1hcnkgb2YgYSB2b2ljZSB0b29sIGNhbGwgZm9yIHRoZVxuXHQgKiB0aW1lbGluZS4gQmFja2VuZCdzIHByaW9yX3RpbWVsaW5lIHJlbmRlcmVyIGV4cGVjdHMgdGhpcyBmb3JtYXQgXHUyMDE0IGtlZXBcblx0ICogaXQgc3RhYmxlLlxuXHQgKlxuXHQgKiAgIHNlbmRfdG9fY2hhdCh0ZXh0PVwiT3BlbiBhIG5ldyB0ZXJtaW5hbCBhbmQgY2QgaW50byB0aGUgY3VycmVudCBkaXJlY3RvcnkuXCIpXG5cdCAqICAgbmV3X3Nlc3Npb25zKHNlc3Npb25zPVt7XCJ0ZXh0XCI6IFwiUmVmYWN0b3IgdXBsb2FkIHNlcnZpY2VcIn1dKVxuXHQgKiAgIHJlc3BvbmRfdG9fc2Vzc2lvbiguLi4pXG5cdCAqL1xuXHRwcml2YXRlIF9yZW5kZXJUb29sQ2FsbFN1bW1hcnkobmFtZTogc3RyaW5nLCBhcmdzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0aWYgKCFhcmdzIHx8IE9iamVjdC5rZXlzKGFyZ3MpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGAke25hbWV9KClgO1xuXHRcdH1cblx0XHRjb25zdCBwYWlyczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhhcmdzKSkge1xuXHRcdFx0Ly8gQm91bmQgbG9uZyB2YWx1ZXMgXHUyMDE0IGZ1bGwgYXJncyBhcmUgc3RpbGwgaW4gbWV0YWRhdGEudG9vbEFyZ3MuXG5cdFx0XHRsZXQgcmVuZGVyZWQ6IHN0cmluZztcblx0XHRcdGlmICh0eXBlb2YgdiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmVuZGVyZWQgPSB2Lmxlbmd0aCA+IDIwMCA/IGAke3Yuc2xpY2UoMCwgMTk3KX0uLi5gIDogdjtcblx0XHRcdFx0cmVuZGVyZWQgPSBKU09OLnN0cmluZ2lmeShyZW5kZXJlZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeSh2KTtcblx0XHRcdFx0XHRyZW5kZXJlZCA9IGpzb24ubGVuZ3RoID4gMjAwID8gYCR7anNvbi5zbGljZSgwLCAxOTcpfS4uLmAgOiBqc29uO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRyZW5kZXJlZCA9IFN0cmluZyh2KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cGFpcnMucHVzaChgJHtrfT0ke3JlbmRlcmVkfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gYCR7bmFtZX0oJHtwYWlycy5qb2luKCcsICcpfSlgO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnQgcGVyc2lzdGVkIHRyYW5zY3JpcHQgdHVybnMgaW50byB0eXBlZCB0aW1lbGluZSBlbnRyaWVzIGZvclxuXHQgKiB0aGUgQkUsIHRoZW4gdG9wIHVwIHdpdGggYSBzeW50aGVzaXplZCBgYGNvZGluZ19hZ2VudF9yZXBseWBgIHBlclxuXHQgKiBhY3RpdmUgY29kaW5nIHNlc3Npb24gKGZpcnN0IH4yIHNlbnRlbmNlcyBvZiB0aGUgbGF0ZXN0IENvcGlsb3Rcblx0ICogcmVzcG9uc2UpLiBUaGUgc3ludGhldGljIGVudHJpZXMgYXJlICpub3QqIHBlcnNpc3RlZCBcdTIwMTQgdGhleSByZWFkXG5cdCAqIGxpdmUgYGBJQ2hhdE1vZGVsYGAgc3RhdGUgc28gdGhlIHN1bW1hcnkgc3RheXMgZnJlc2ggb24gZXZlcnlcblx0ICogcmVjb25uZWN0LlxuXHQgKlxuXHQgKiBPdXRwdXQgaXMgY2hyb25vbG9naWNhbCAob2xkZXN0IGZpcnN0KSwgbWF0Y2hpbmcgd2hhdCB0aGUgQkVcblx0ICogcmVuZGVycyBpbnRvIGl0cyBgYFtQUklPUl9DT05URVhUXWBgIGJsb2NrLiBTeW50aGV0aWNcblx0ICogYGBjb2RpbmdfYWdlbnRfcmVwbHlgYCBlbnRyaWVzIGFyZSBhcHBlbmRlZCBhdCB0aGUgZW5kIHNpbmNlIHRoZXlcblx0ICogcmVwcmVzZW50IHRoZSAqY3VycmVudCogc3RhdGUgb2YgY29kaW5nIHNlc3Npb25zIGF0IHJlY29ubmVjdC5cblx0ICovXG5cdHByaXZhdGUgX2J1aWxkUHJpb3JUaW1lbGluZSh0dXJuczogcmVhZG9ubHkgSVZvaWNlVHJhbnNjcmlwdFR1cm5bXSk6IElWb2ljZVByaW9yVGltZWxpbmVFbnRyeVtdIHtcblx0XHRjb25zdCBvdXQ6IElWb2ljZVByaW9yVGltZWxpbmVFbnRyeVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHQgb2YgdHVybnMpIHtcblx0XHRcdC8vIFByZS10aW1lbGluZSByb3dzIChubyBraW5kKSBhcmUgZmlsdGVyZWQgb3V0IGJ5IHRoZSBzdG9yZSdzXG5cdFx0XHQvLyBhdXRvLXdpcGUgaW4gbG9hZFR1cm5zOyBhbnl0aGluZyB0aGF0IHJlYWNoZXMgdXMgaGVyZSBpc1xuXHRcdFx0Ly8gd2VsbC1mb3JtZWQuIEd1YXJkIGFueXdheSBpbiBjYXNlIG9mIHBhcnRpYWwtcm9sbG91dCBjYXNlcy5cblx0XHRcdGNvbnN0IGtpbmQ6IFZvaWNlVHJhbnNjcmlwdEtpbmQgfCB1bmRlZmluZWQgPSB0LmtpbmQ7XG5cdFx0XHRpZiAoIWtpbmQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnRyeTogSVZvaWNlUHJpb3JUaW1lbGluZUVudHJ5ID0ge1xuXHRcdFx0XHRraW5kLFxuXHRcdFx0XHR0ZXh0OiB0LnRleHQsXG5cdFx0XHRcdHRpbWVzdGFtcDogbmV3IERhdGUodC50aW1lc3RhbXApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdC4uLih0Lm1ldGFkYXRhPy50b29sTmFtZSA/IHsgdG9vbE5hbWU6IHQubWV0YWRhdGEudG9vbE5hbWUgfSA6IHt9KSxcblx0XHRcdFx0Li4uKHQubWV0YWRhdGE/LmNvZGluZ1Nlc3Npb25JZCA/IHsgY29kaW5nU2Vzc2lvbklkOiB0Lm1ldGFkYXRhLmNvZGluZ1Nlc3Npb25JZCB9IDoge30pLFxuXHRcdFx0XHQuLi4odC5tZXRhZGF0YT8uY29kaW5nU3RhdHVzID8geyBjb2RpbmdTdGF0dXM6IHQubWV0YWRhdGEuY29kaW5nU3RhdHVzIH0gOiB7fSksXG5cdFx0XHR9O1xuXHRcdFx0b3V0LnB1c2goZW50cnkpO1xuXHRcdH1cblxuXHRcdC8vIFN5bnRoZXNpemUgY29kaW5nX2FnZW50X3JlcGx5IHBlciBhY3RpdmUgc2Vzc2lvbiBcdTIwMTQgcmVmbGVjdHMgdGhlXG5cdFx0Ly8gbW9kZWwncyBsYXRlc3QgcmVzcG9uc2Ugd2l0aG91dCBhbnkgZXh0cmEgcGVyc2lzdGVuY2UgbGF5ZXIuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9ucy5maWx0ZXIocyA9PiAhcy5pc0FyY2hpdmVkKCkpO1xuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBsYXN0UmVxID0gbW9kZWw/LmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IGxhc3RSZXE/LnJlc3BvbnNlPy5yZXNwb25zZS52YWx1ZTtcblx0XHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGZ1bGwgPSB2YWx1ZVxuXHRcdFx0XHRcdC5maWx0ZXIocCA9PiBwLmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnKVxuXHRcdFx0XHRcdC5tYXAocCA9PiAocCBhcyB7IGNvbnRlbnQ6IHsgdmFsdWU6IHN0cmluZyB9IH0pLmNvbnRlbnQudmFsdWUpXG5cdFx0XHRcdFx0LmpvaW4oJyAnKVxuXHRcdFx0XHRcdC50cmltKCk7XG5cdFx0XHRcdGlmICghZnVsbCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHN1bW1hcnkgPSB0aGlzLl9maXJzdFNlbnRlbmNlcyhmdWxsLCBWb2ljZVNlc3Npb25Db250cm9sbGVyLkNPRElOR19BR0VOVF9SRVBMWV9TRU5URU5DRV9MSU1JVCk7XG5cdFx0XHRcdGlmICghc3VtbWFyeSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG91dC5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiAnY29kaW5nX2FnZW50X3JlcGx5Jyxcblx0XHRcdFx0XHR0ZXh0OiBzdW1tYXJ5LFxuXHRcdFx0XHRcdHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRcdGNvZGluZ1Nlc3Npb25JZDogc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbdm9pY2VdIGZhaWxlZCB0byBzeW50aGVzaXplIGNvZGluZ19hZ2VudF9yZXBseSB0aW1lbGluZSBlbnRyaWVzJywgZXJyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gb3V0O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybiB0aGUgZmlyc3QgYGBuYGAgc2VudGVuY2VzIG9mIGBgdGV4dGBgLiBDaGVhcCByZWdleCBzcGxpdCBcdTIwMTRcblx0ICogZ29vZCBlbm91Z2ggZm9yIGEgcHJvbXB0LXByZWZpeCBzdW1tYXJ5OyB3ZSBkb24ndCBuZWVkIHBlcmZlY3QgTkxQXG5cdCAqIGJvdW5kYXJpZXMgaGVyZS4gRmFsbHMgYmFjayB0byBhIGhhcmQgY2hhciBjYXAgaWYgbm8gdGVybWluYXRvclxuXHQgKiBzaG93cyB1cCBpbiB0aGUgZmlyc3QgNjAwIGNoYXJzLlxuXHQgKi9cblx0cHJpdmF0ZSBfZmlyc3RTZW50ZW5jZXModGV4dDogc3RyaW5nLCBuOiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNvbGxhcHNlZCA9IHRleHQucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRyaW0oKTtcblx0XHRpZiAoIWNvbGxhcHNlZCkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRjb25zdCBzZW50ZW5jZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcmUgPSAvW14uIT9dK1suIT9dKyhcXHN8JCkvZztcblx0XHRsZXQgbTogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblx0XHR3aGlsZSAoKG0gPSByZS5leGVjKGNvbGxhcHNlZCkpICE9PSBudWxsICYmIHNlbnRlbmNlcy5sZW5ndGggPCBuKSB7XG5cdFx0XHRzZW50ZW5jZXMucHVzaChtWzBdLnRyaW0oKSk7XG5cdFx0fVxuXHRcdGlmIChzZW50ZW5jZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gY29sbGFwc2VkLmxlbmd0aCA+IDYwMCA/IGAke2NvbGxhcHNlZC5zbGljZSgwLCA1OTcpfS4uLmAgOiBjb2xsYXBzZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBzZW50ZW5jZXMuam9pbignICcpO1xuXHR9XG5cblx0Ly8gLS0tIERlZmVycmVkIHJlc3BvbnNlcyBmb3Igbm9uLWZvY3VzZWQgc2Vzc2lvbnMgLS0tXG5cblx0LyoqXG5cdCAqIFJlY29yZCB0aGUgYmFja2VuZFx1MjE5MlVJIHJlc291cmNlIGFsaWFzIGZvciBhbiBhZ2VudC1ob3N0IHNlc3Npb24gc28gYSByZXNwb25zZVxuXHQgKiB0aGUgdm9pY2UgYmFja2VuZCB0YWdzIHdpdGggdGhlIGJhcmUgYmFja2VuZCBpZCByZXNvbHZlcyB0byB0aGlzIFVJIHNlc3Npb25cblx0ICogcmVzb3VyY2UgKHRoZSBzcGFjZSBpbiB3aGljaCBmb2N1cywgZGVmZXIvZmx1c2ggYnVmZmVyIGtleXMsIGFuZCB0aGUgcGVuZGluZ1xuXHQgKiBpbmRpY2F0b3Igb3BlcmF0ZSkuIE5vLW9wIGZvciBub24tYWdlbnQtaG9zdCByZXNvdXJjZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9yZWNvcmRTZXNzaW9uQWxpYXModWlSZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3QgYmFja2VuZCA9IHRvQWdlbnRIb3N0QmFja2VuZFNlc3Npb25VcmkodWlSZXNvdXJjZSk7XG5cdFx0aWYgKCFiYWNrZW5kKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGZyb20gPSBiYWNrZW5kLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgdG8gPSB1aVJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0aWYgKHRoaXMuX3VpUmVzb3VyY2VCeUJhY2tlbmRJZC5nZXQoZnJvbSkgPT09IHRvKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3VpUmVzb3VyY2VCeUJhY2tlbmRJZC5zZXQoZnJvbSwgdG8pO1xuXHRcdC8vIEEgbmV3bHktbGVhcm5lZCBhbGlhcyBtZWFucyBhbnkgc3RhdGUgc3RvcmVkIHVuZGVyIHRoZSBiYXJlIGJhY2tlbmQgaWRcblx0XHQvLyBtdXN0IG1vdmUgdG8gdGhlIGNhbm9uaWNhbCBVSSBrZXksIHNvIHRoZSB0d28gaWQgc3BhY2VzIG5ldmVyIGRpdmVyZ2UgYW5kXG5cdFx0Ly8gbm8gYWxpYXMtYXdhcmUgaXRlcmF0aW9uIGlzIG5lZWRlZCBhbnl3aGVyZSBlbHNlLlxuXHRcdHRoaXMuX3Jla2V5U2Vzc2lvbihmcm9tLCB0byk7XG5cdH1cblxuXHQvKiogTW92ZSBldmVyeSBzZXNzaW9uLXNjb3BlZCBlbnRyeSAoYW5kIHRoZSB2aXNpYmxlIGluZGljYXRvcikgZnJvbSBhIGJhcmVcblx0ICogIGJhY2tlbmQgaWQgdG8gaXRzIGNhbm9uaWNhbCBVSSBrZXkgb25jZSB0aGUgYWxpYXMgYmVjb21lcyBrbm93bi4gKi9cblx0cHJpdmF0ZSBfcmVrZXlTZXNzaW9uKGZyb206IHN0cmluZywgdG86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChmcm9tID09PSB0bykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZWtleU1hcCA9IDxWPihtOiBNYXA8c3RyaW5nLCBWPik6IHZvaWQgPT4ge1xuXHRcdFx0aWYgKG0uaGFzKGZyb20pKSB7XG5cdFx0XHRcdGlmICghbS5oYXModG8pKSB7XG5cdFx0XHRcdFx0bS5zZXQodG8sIG0uZ2V0KGZyb20pISk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bS5kZWxldGUoZnJvbSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCByZWtleVNldCA9IChzOiBTZXQ8c3RyaW5nPik6IHZvaWQgPT4ge1xuXHRcdFx0aWYgKHMuaGFzKGZyb20pKSB7XG5cdFx0XHRcdHMuZGVsZXRlKGZyb20pO1xuXHRcdFx0XHRzLmFkZCh0byk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRyZWtleU1hcCh0aGlzLl9kZWZlcnJlZFJlc3BvbnNlcyk7XG5cdFx0cmVrZXlNYXAodGhpcy5fcGVuZGluZ1Jlc3BvbnNlU3VtbWFyaWVzKTtcblx0XHRyZWtleU1hcCh0aGlzLl9sYXN0TmFycmF0ZWRUZXh0KTtcblx0XHRyZWtleU1hcCh0aGlzLl9sYXN0SGVhcmRUcmFuc2NyaXB0QnlJZCk7XG5cdFx0cmVrZXlNYXAodGhpcy5fcmVjZW50bHlSZWFkUmVzcG9uc2UpO1xuXHRcdHJla2V5TWFwKHRoaXMuX2xhc3RSZXNwb25zZVN1bW1hcnlCeUlkKTtcblx0XHRyZWtleU1hcCh0aGlzLl9wZW5kaW5nTmFycmF0aW9uUmV0cmllcyk7XG5cdFx0cmVrZXlNYXAodGhpcy5fZGVmZXJyZWROYXJyYXRpb25zKTtcblx0XHRyZWtleU1hcCh0aGlzLl9uYXJyYXRlZFBlbmRpbmcpO1xuXHRcdHJla2V5U2V0KHRoaXMuX2NvbmZpcm1hdGlvblBlbmRpbmdTZXNzaW9ucyk7XG5cdFx0cmVrZXlTZXQodGhpcy5fbGl2ZVJlcGx5S2V5cyk7XG5cdFx0cmVrZXlTZXQodGhpcy5fc2Vzc2lvbnNBd2FpdGluZ1Jlc3BvbnNlU3VtbWFyeSk7XG5cdFx0cmVrZXlTZXQodGhpcy5fcGVuZGluZ0lkbGVOYXJyYXRpb24pO1xuXHRcdHRoaXMuX21hcmtQZW5kaW5nUmVzcG9uc2UoZnJvbSwgZmFsc2UpO1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nT3duZWQodG8pKSB7XG5cdFx0XHR0aGlzLl9tYXJrUGVuZGluZ1Jlc3BvbnNlKHRvLCB0cnVlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHNpbmdsZSBjYW5vbmljYWwga2V5IGZvciBhIHNlc3Npb246IHRoZSBVSSBhZ2VudC1ob3N0IHJlc291cmNlIHdoZW4gdGhlXG5cdCAqIGJhY2tlbmQgdGFnZ2VkIGl0IHdpdGggdGhlIGJhcmUgYmFja2VuZCBpZCwgZWxzZSB0aGUgaWQgdW5jaGFuZ2VkLiBFdmVyeVxuXHQgKiBzZXNzaW9uLXNjb3BlZCBjb2xsZWN0aW9uIGlzIGtleWVkIGJ5IHRoaXMsIHNvIHRoZSB0d28gaWQgc3BhY2VzIG5ldmVyXG5cdCAqIGRpdmVyZ2UgYW5kIG93bmVyc2hpcCBjaGVja3MgYXJlIHBsYWluIE8oMSkgbWFwL3NldCBsb29rdXBzLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2Vzc2lvbktleShpZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fdWlSZXNvdXJjZUJ5QmFja2VuZElkLmdldChpZCkgPz8gaWQ7XG5cdH1cblxuXHQvKiogV2hldGhlciBhbnkgb2YgdGhlIHRocmVlIGluZGljYXRvciBvd25lcnMgc3RpbGwgaG9sZHMgdGhpcyBjYW5vbmljYWwga2V5LiAqL1xuXHRwcml2YXRlIF9wZW5kaW5nT3duZWQoa2V5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlybWF0aW9uUGVuZGluZ1Nlc3Npb25zLmhhcyhrZXkpXG5cdFx0XHR8fCB0aGlzLl9kZWZlcnJlZFJlc3BvbnNlcy5oYXMoa2V5KVxuXHRcdFx0fHwgdGhpcy5fcGVuZGluZ1Jlc3BvbnNlU3VtbWFyaWVzLmhhcyhrZXkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbm9uaWNhbGl6ZSBhIHNlc3Npb24gaWQgdG8gdGhlIFVJIGFnZW50LWhvc3QgcmVzb3VyY2Ugc3BhY2Ugd2hlbiB0aGVcblx0ICogYmFja2VuZCB0YWdnZWQgaXQgd2l0aCB0aGUgYmFyZSBiYWNrZW5kIGlkLiBVbnRhZ2dlZCAvIG5vbi1hZ2VudC1ob3N0IGlkc1xuXHQgKiBwYXNzIHRocm91Z2ggdW5jaGFuZ2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBfY2Fub25pY2FsU2Vzc2lvbklkKGlkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBpZCA/ICh0aGlzLl91aVJlc291cmNlQnlCYWNrZW5kSWQuZ2V0KGlkKSA/PyBpZCkgOiBpZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWZyZXNoIHRoZSBjYWNoZWQgZm9jdXNlZCBzZXNzaW9uIGFuZCBmbHVzaCBhbnkgcmVzcG9uc2UgdGhhdCB3YXMgaGVsZFxuXHQgKiBmb3IgdGhlIHNlc3Npb24gdGhhdCBqdXN0IGJlY2FtZSBmb2N1c2VkLlxuXHQgKi9cblx0LyoqXG5cdCAqIFRoZSBzZXNzaW9uIHRoZSB1c2VyIGlzIGN1cnJlbnRseSBsb29raW5nIGF0LCByZWFkIGxpdmUgZnJvbSB0aGVcblx0ICogbGFzdC1mb2N1c2VkIGNoYXQgd2lkZ2V0ICh0aGUgc2FtZSBzb3VyY2UgdGhhdCBmaXJlc1xuXHQgKiBgb25EaWRDaGFuZ2VGb2N1c2VkU2Vzc2lvbmApLiBSZWFkaW5nIGxpdmUgLSByYXRoZXIgdGhhbiB0cnVzdGluZyBhIHZhbHVlXG5cdCAqIGNhY2hlZCBvbiB0aGUgY2hhbmdlIGV2ZW50IC0gcHJvdGVjdHMgdGhlIGRlZmVyL2ZsdXNoIGRlY2lzaW9uIGZyb20gYVxuXHQgKiBtaXNzZWQgb3Igb3V0LW9mLW9yZGVyIGZvY3VzIGV2ZW50LCB3aGljaCB3b3VsZCBvdGhlcndpc2UgbGVhdmUgYSByZXNwb25zZVxuXHQgKiBidWZmZXJlZCBmb3JldmVyIG9yIGRyb3AgaXQgaW50byB0aGUgd3Jvbmcgc2Vzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgX2dldEZvY3VzZWRTZXNzaW9uSWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldD8udmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U/LnRvU3RyaW5nKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkZvY3VzZWRTZXNzaW9uQ2hhbmdlZCgpOiB2b2lkIHtcblx0XHQvLyBJbiBlbWJlZGRlci1kcml2ZW4gbW9kZSwgZm9jdXMgaXMgdW5yZWxpYWJsZTsgaWdub3JlIGZvY3VzIGFjdGl2YXRpb24uXG5cdFx0aWYgKHRoaXMuX2V4dGVybmFsQWN0aXZlU2Vzc2lvbk1vZGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMuX2dldEZvY3VzZWRTZXNzaW9uSWQoKTtcblx0XHRpZiAoZm9jdXNlZCkge1xuXHRcdFx0dGhpcy5fYWN0aXZhdGVTaG93blNlc3Npb24oVVJJLnBhcnNlKGZvY3VzZWQpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gUmUtc2VuZCArIGZsdXNoIGNvbnRleHQgb24gZm9jdXMgY2hhbmdlIHNvIHRoZSBiYWNrZW5kJ3Mgbm90aW9uIG9mIHRoZVxuXHRcdC8vIGFjdGl2ZSBzZXNzaW9uIChpc19hY3RpdmUpIHRyYWNrcyBmb2N1cyBwcm9tcHRseSByYXRoZXIgdGhhbiB3YWl0aW5nXG5cdFx0Ly8gZm9yIHRoZSBuZXh0IHBvbGwuXG5cdFx0dGhpcy5fc2VuZENvbnRleHQoKTtcblx0XHR0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5mbHVzaFNlc3Npb25Db250ZXh0KCk7XG5cdH1cblxuXHQvKipcblx0ICogVHJhY2sgYSBjaGF0IHdpZGdldCdzIHZpZXctbW9kZWwgc28gd2Ugbm90aWNlIHdoZW4gYSBzZXNzaW9uIGlzIHNob3duIGluIGl0LFxuXHQgKiBldmVuIGlmIHRoYXQgd2lkZ2V0IG5ldmVyIHRha2VzIERPTSBmb2N1cyAoc28gYG9uRGlkQ2hhbmdlRm9jdXNlZFNlc3Npb25gXG5cdCAqIHN0YXlzIHNpbGVudCkuIE9wZW5pbmcgYSBzZXNzaW9uIGZyb20gdGhlIHNlc3Npb25zIGxpc3QgcmV2ZWFscyBpdCBpbiB0aGVcblx0ICogY2hhdCB2aWV3IHBhbmUgdGhpcyB3YXkuXG5cdCAqL1xuXHRwcml2YXRlIF90cmFja1dpZGdldFNlc3Npb24od2lkZ2V0OiBJQ2hhdFdpZGdldCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHdpZGdldC5vbkRpZENoYW5nZVZpZXdNb2RlbChlID0+IHRoaXMuX29uU2Vzc2lvblNob3duKGUuY3VycmVudFNlc3Npb25SZXNvdXJjZSkpKTtcblx0XHQvLyBTZWVkIGZyb20gdGhlIHdpZGdldCdzIGN1cnJlbnQgdmlldy1tb2RlbC4gV2hlbiBhIHNlc3Npb24gb3BlbnMgaW4gYVxuXHRcdC8vIGZyZXNobHktY3JlYXRlZCB3aWRnZXQsIGl0cyB2aWV3LW1vZGVsIGlzIG9mdGVuIGFscmVhZHkgc2V0IGJ5IHRoZSB0aW1lXG5cdFx0Ly8gd2Ugc3Vic2NyaWJlIGFib3ZlLCBzbyB0aGUgaW5pdGlhbCBgb25EaWRDaGFuZ2VWaWV3TW9kZWxgIG5ldmVyIGZpcmVzXG5cdFx0Ly8gYW5kIHRoZSBzaG93biBzZXNzaW9uIHdvdWxkIG90aGVyd2lzZSBiZSBtaXNzZWQgKGxlYXZpbmcgYSBidWZmZXJlZFxuXHRcdC8vIHJlc3BvbnNlIHN0dWNrIHVudGlsIHRoZSBzdGFsZSBmb2N1cyBwYXRoIGhhcHBlbnMgdG8gY2F0Y2ggdXApLlxuXHRcdHRoaXMuX29uU2Vzc2lvblNob3duKHdpZGdldC52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHQvKiogQSBzZXNzaW9uIGJlY2FtZSB2aXNpYmxlIChvcGVuZWQvcmV2ZWFsZWQpOiB0cmVhdCBsaWtlIGEgZm9jdXMgY2hhbmdlIFx1MjAxNCBtYWtlIGl0IGFjdGl2ZSwgZmx1c2ggYW55IGJ1ZmZlcmVkIHJlc3BvbnNlLCBjbGVhciBpdHMgcGVuZGluZyBpbmRpY2F0b3IsIGFuZCBuYXJyYXRlIGl0cyBwZW5kaW5nIGl0ZW0uICovXG5cdHByaXZhdGUgX29uU2Vzc2lvblNob3duKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHQvLyBJbiBlbWJlZGRlci1kcml2ZW4gbW9kZSwgd2lkZ2V0IHN3YXBzIGFyZSBub3QgYXV0aG9yaXRhdGl2ZSBhbmQgY2FuXG5cdFx0Ly8gZmx1c2ggdGhlIHdyb25nIHNlc3Npb24gb3IgdGhyYXNoIHRoZSBhY3RpdmUgb25lLlxuXHRcdGlmICh0aGlzLl9leHRlcm5hbEFjdGl2ZVNlc3Npb25Nb2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGtleSA9IHJlc291cmNlPy50b1N0cmluZygpO1xuXHRcdGlmICgha2V5IHx8IGtleSA9PT0gdGhpcy5fbGFzdFNob3duU2Vzc2lvbklkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBzZXNzaW9uIHNob3duPSR7a2V5fTsgZmx1c2hpbmcvcmUtc2VuZGluZyBjb250ZXh0YCk7XG5cdFx0dGhpcy5fYWN0aXZhdGVTaG93blNlc3Npb24ocmVzb3VyY2UhKTtcblx0fVxuXG5cdC8qKiBNYWtlIGEgc2hvd24vZm9jdXNlZCBzZXNzaW9uIGFjdGl2ZTogZmx1c2ggaXRzIGJ1ZmZlcmVkIHJlc3BvbnNlLCBjbGVhciBpdHMgcGVuZGluZyBpbmRpY2F0b3IsIGFuZCBuYXJyYXRlIGl0cyBwZW5kaW5nIGNvbmZpcm1hdGlvbi9yZXNwb25zZSAobG9hZGluZyB0aGUgbW9kZWwgZmlyc3QgaWYgYSBjb25maXJtYXRpb24ncyBkZXRhaWwgaXNuJ3QgcmVzaWRlbnQpLiAqL1xuXHRwcml2YXRlIF9hY3RpdmF0ZVNob3duU2Vzc2lvbihyZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHR0aGlzLl9sYXN0U2hvd25TZXNzaW9uSWQgPSBrZXk7XG5cdFx0Ly8gUmVmcmVzaCB0aGUgYmFja2VuZFx1MjE5MlVJIGFsaWFzIGZvciB0aGlzIHJlc291cmNlIHVwIGZyb250IHNvIGEgcmVzcG9uc2Vcblx0XHQvLyBidWZmZXJlZCB1bmRlciB0aGUgYmFyZSBiYWNrZW5kIGlkIChhbGlhcyBub3QgeWV0IGtub3duIGF0IGFycml2YWwpXG5cdFx0Ly8gcmVzb2x2ZXMgdG8gdGhpcyBrZXksIGFuZCBzbyBmdXR1cmUgcmVzcG9uc2VzIGZvciBpdCByb3V0ZSBjb3JyZWN0bHkuXG5cdFx0dGhpcy5fcmVjb3JkU2Vzc2lvbkFsaWFzKHJlc291cmNlKTtcblx0XHQvLyBOb3RoaW5nIGNhbiBiZSBmbHVzaGVkIG9yIG5hcnJhdGVkIHdoaWxlIGRpc2Nvbm5lY3RlZDogcmVxdWVzdE5hcnJhdGlvblxuXHRcdC8vIGNhbid0IHNlbmQsIGFuZCBkb2luZyB0aGlzIHdvcmsgaGVyZSAoZS5nLiBmcm9tIGEgZm9jdXMvd2lkZ2V0IGV2ZW50LCBvclxuXHRcdC8vIHRoZSBfb25Gb2N1c2VkU2Vzc2lvbkNoYW5nZWQoKSBjYWxsIGF0IHRoZSBzdGFydCBvZiBjb25uZWN0KCkpIHdvdWxkXG5cdFx0Ly8gc3Rhc2ggYSBwZW5kaW5nIG5hcnJhdGlvbiB0aGF0IHNlc3Npb25faW5pdCBsYXRlciByZXBsYXlzIC0gc3RvcHBpbmcgdGhlXG5cdFx0Ly8gZnJlc2hseSBlbnRlcmVkIGxpc3RlbmluZyB0dXJuLiBBbGlhcy9sYXN0LXNob3duIGJvb2trZWVwaW5nIGFib3ZlIGlzXG5cdFx0Ly8ga2VwdCBzbyByb3V0aW5nIGlzIGNvcnJlY3Qgb25jZSBjb25uZWN0ZWQ7IHRoZSByZXBseSBpcyBuYXJyYXRlZCBvbiB0aGVcblx0XHQvLyBuZXh0IGZvY3VzL3N0YXRlIGV2ZW50IChvciBhbiBleHBsaWNpdCBhY3RpdmF0ZVNlc3Npb24pIGFmdGVyIGNvbm5lY3QuXG5cdFx0aWYgKCF0aGlzLl9pc0Nvbm5lY3RlZC5nZXQoKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIF9hY3RpdmF0ZVNob3duU2Vzc2lvbigke2tleS5zbGljZSgtMzIpfSkgc2tpcHBlZDogY29udHJvbGxlciBub3QgY29ubmVjdGVkIChleHRlcm5hbD0ke3RoaXMuX2V4dGVybmFsQWN0aXZlU2Vzc2lvbk1vZGV9KWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBmbHVzaFJlc3VsdCA9IHRoaXMuX2ZsdXNoRGVmZXJyZWRSZXNwb25zZShrZXkpO1xuXHRcdHRoaXMuX2NsZWFyQ29uZmlybWF0aW9uSW5kaWNhdG9yKGtleSk7XG5cdFx0aWYgKHRoaXMuX2NvbmZpcm1hdGlvbkRldGFpbFBlbmRpbmcocmVzb3VyY2UpKSB7XG5cdFx0XHR0aGlzLl9lbnN1cmVNb2RlbExvYWRlZChyZXNvdXJjZSk7XG5cdFx0fVxuXHRcdC8vIEluIGVtYmVkZGVyLWRyaXZlbiBtb2RlLCBhcm0gZGVkdXBlIHdpdGggdGhlIGxhc3QgaGVhcmQgcmVwbHkgc28gbWF0Y2hpbmdcblx0XHQvLyBvbi1mb2N1cyByZS1yZWFkcyBkcm9wOyBuZXcgcmVwbGllcyBhbmQgY29uZmlybWF0aW9ucyBzdGlsbCBuYXJyYXRlLlxuXHRcdGlmICh0aGlzLl9leHRlcm5hbEFjdGl2ZVNlc3Npb25Nb2RlICYmICF0aGlzLl9yZWNlbnRseVJlYWRSZXNwb25zZS5oYXMoa2V5KSkge1xuXHRcdFx0Y29uc3QgaGVhcmQgPSB0aGlzLl9sYXN0SGVhcmRUcmFuc2NyaXB0QnlJZC5nZXQoa2V5KTtcblx0XHRcdGlmIChoZWFyZCkge1xuXHRcdFx0XHR0aGlzLl9yZWNlbnRseVJlYWRSZXNwb25zZS5zZXQoa2V5LCB7IHRyYW5zY3JpcHQ6IGhlYXJkLCBhdDogRGF0ZS5ub3coKSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gQXNrIHRoZSBiYWNrZW5kIHRvIHNwZWFrIHRoaXMgc2Vzc2lvbidzIHBlbmRpbmcgaXRlbSBub3cgdGhhdCBpdCdzIHNob3duLlxuXHRcdC8vIElmIHdlIGp1c3QgcmVwbGF5ZWQgdGhpcyBzZXNzaW9uJ3MgY29tcGxldGVkIHJlcGx5LCB0aGF0IElTIHRoZSByZXNwb25zZVxuXHRcdC8vIHJlYWQgLSBkb24ndCBhbHNvIG5hcnJhdGUgdGhlIHN0b3JlZCBzdW1tYXJ5IChhIGRvdWJsZS1yZWFkKS4gQnV0IGRlY2lkZVxuXHRcdC8vIHRoYXQgYnkgVFJBTlNDUklQVCBJREVOVElUWSwgbm90IHRoZSBtZXJlIGZhY3QgdGhhdCBzb21lIGF1ZGlvIHdhc1xuXHRcdC8vIGZsdXNoZWQ6IHRoZSBidWZmZXIgbWF5IGhhdmUgaGVsZCBhIGRpZmZlcmVudCwgcGFydGlhbCwgb3Igb2xkZXIgcmVzcG9uc2Vcblx0XHQvLyAoZS5nLiB0aGUgdXNlciBjbGlja2VkIHdoaWxlIGEgc2Vjb25kIHJlcGx5IHdhcyBzdGlsbCBzdHJlYW1pbmcpLCBhbmQgdGhlXG5cdFx0Ly8gc3RvcmVkIHN1bW1hcnkgaXMgdGhlIGF1dGhvcml0YXRpdmUsIGNvbXBsZXRlIHRleHQgLSBpdCBtdXN0IHN0aWxsIGJlXG5cdFx0Ly8gbmFycmF0ZWQgdW5sZXNzIGl0cyBvd24gdHJhbnNjcmlwdCB3YXMgYW1vbmcgdGhvc2UganVzdCBwbGF5ZWQuXG5cdFx0bGV0IG5hcnJhdGFibGUgPSB0aGlzLl9jdXJyZW50TmFycmF0YWJsZShyZXNvdXJjZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9IHRoaXMuX3Nlc3Npb25LZXkoa2V5KTtcblx0XHRjb25zdCBwZW5kaW5nU3VtbWFyeSA9IHRoaXMuX3BlbmRpbmdSZXNwb25zZVN1bW1hcmllcy5nZXQoc2Vzc2lvbktleSk7XG5cdFx0Y29uc3QgcGVuZGluZ1N1bW1hcnlGbHVzaGVkID0gISFwZW5kaW5nU3VtbWFyeVxuXHRcdFx0JiYgZmx1c2hSZXN1bHQuZmluYWxUcmFuc2NyaXB0cy5pbmNsdWRlcyh0aGlzLl9ub3JtYWxpemVUcmFuc2NyaXB0KHBlbmRpbmdTdW1tYXJ5KSk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIGFjdGl2YXRlIHNob3duPSR7a2V5LnNsaWNlKC0zMil9IHBlbmRpbmdLZXk9JHt0aGlzLl9wZW5kaW5nUmVzcG9uc2VTdW1tYXJpZXMuaGFzKHNlc3Npb25LZXkpID8gc2Vzc2lvbktleS5zbGljZSgtMzIpIDogJzxub25lPid9IG5hcnJhdGFibGU9JHtuYXJyYXRhYmxlPy5raW5kID8/ICc8bm9uZT4nfSBmbHVzaGVkRmluYWw9JHtmbHVzaFJlc3VsdC5maW5hbFRyYW5zY3JpcHRzLmxlbmd0aH0gcGVuZGluZ0ZsdXNoZWQ9JHtwZW5kaW5nU3VtbWFyeUZsdXNoZWR9YCk7XG5cdFx0Ly8gRmFsbCBiYWNrIHRvIHRoZSBzdG9yZWQgc3VtbWFyeSAodGhlIHNvdXJjZSBvZiB0aGUgcGVuZGluZyBpbmRpY2F0b3IpXG5cdFx0Ly8gd2hlbiB0aGUgbW9kZWwgaXNuJ3QgcmVzaWRlbnQgdG8gc3VyZmFjZSB0aGUgY29tcGxldGVkIHJlcGx5IC0gYnV0IG9ubHlcblx0XHQvLyBpZiB0aGF0IGV4YWN0IHN1bW1hcnkgd2Fzbid0IGp1c3QgZmx1c2hlZCBhcyBhdWRpbyAoZWxzZSBpdCdkIHJlYWQgdHdpY2UpLlxuXHRcdGlmICghbmFycmF0YWJsZSAmJiBwZW5kaW5nU3VtbWFyeSAmJiAhcGVuZGluZ1N1bW1hcnlGbHVzaGVkKSB7XG5cdFx0XHRuYXJyYXRhYmxlID0geyBraW5kOiAncmVzcG9uc2UnLCB0ZXh0OiBwZW5kaW5nU3VtbWFyeSB9O1xuXHRcdH1cblx0XHQvLyBPbmx5IHRyZWF0IHRoZSByZXNwb25zZSBhcyBoYW5kbGVkIChhbmQgY2xlYXIgaXRzIGluZGljYXRvciBiZWxvdykgd2hlblxuXHRcdC8vIGl0cyBvd24gcmVwbHkgd2FzIGFjdHVhbGx5IGFjY291bnRlZCBmb3I6IHRoZSBzdG9yZWQgc3VtbWFyeSdzIHRyYW5zY3JpcHRcblx0XHQvLyB3YXMganVzdCBwbGF5ZWQsIE9SIGEgbmFycmF0aW9uIGlzIGlzc3VlZC9kZWR1cGVkIGZvciB0aGUgbmFycmF0YWJsZSBpdGVtLlxuXHRcdC8vIE5ldmVyIGluaXRpYWxpemUgdGhpcyBmcm9tIGZsdXNoUmVzdWx0LmZsdXNoZWQgLSBwYXJ0aWFsL290aGVyIGJ1ZmZlcmVkXG5cdFx0Ly8gYXVkaW8gbXVzdCBub3QgYmUgdGFrZW4gYXMgXCJ0aGlzIHNlc3Npb24ncyByZXBseSB3YXMgcmVhZFwiLlxuXHRcdGxldCBoYW5kbGVkUmVzcG9uc2UgPSBwZW5kaW5nU3VtbWFyeUZsdXNoZWQ7XG5cdFx0Ly8gUHVzaCB0aGlzIHNlc3Npb24ncyBjb250ZXh0IGFuZCBjbGVhciB0aGUgZGVib3VuY2UgYmVmb3JlIG5hcnJhdGluZy4gVGhlXG5cdFx0Ly8gYmFja2VuZCB2YWxpZGF0ZXMgYSBuYXJyYXRpb24gcmVxdWVzdCBhZ2FpbnN0IGl0cyBtaXJyb3Igb2YgdGhlIHNlc3Npb25cblx0XHQvLyBjb250ZXh0LCBzbyBvbiB0aGUgZm9jdXMgcGF0aCAod2hlcmUgdGhlIHNlc3Npb24gbWF5IG5ldmVyIGhhdmUgYmVlblxuXHRcdC8vIHNlbnQgYXQgYWxsKSBuYXJyYXRpbmcgZmlyc3QgYXNrcyBpdCB0byBzcGVhayBzb21ldGhpbmcgaXQgaGFzIG5vdCB5ZXRcblx0XHQvLyBiZWVuIHRvbGQgZXhpc3RzLlxuXHRcdHRoaXMuX3NlbmRDb250ZXh0KCk7XG5cdFx0dGhpcy52b2ljZUNsaWVudFNlcnZpY2UuZmx1c2hTZXNzaW9uQ29udGV4dCgpO1xuXHRcdGlmIChuYXJyYXRhYmxlKSB7XG5cdFx0XHRjb25zdCB3YXNKdXN0UGxheWVkID0gbmFycmF0YWJsZS5raW5kID09PSAncmVzcG9uc2UnXG5cdFx0XHRcdCYmIGZsdXNoUmVzdWx0LmZpbmFsVHJhbnNjcmlwdHMuaW5jbHVkZXModGhpcy5fbm9ybWFsaXplVHJhbnNjcmlwdChuYXJyYXRhYmxlLnRleHQpKTtcblx0XHRcdGlmICh3YXNKdXN0UGxheWVkKSB7XG5cdFx0XHRcdHRoaXMuX2xhc3ROYXJyYXRlZFRleHQuc2V0KHNlc3Npb25LZXksIG5hcnJhdGFibGUudGV4dCk7XG5cdFx0XHRcdGhhbmRsZWRSZXNwb25zZSA9IHRydWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBOYXJyYXRlIGEgZnJlc2ggaXRlbSBmb3IgdGhlIG5vdy1zaG93biBzZXNzaW9uLiBfbmFycmF0ZSBleGl0c1xuXHRcdFx0XHQvLyBsaXN0ZW5pbmcvYXV0by1saXN0ZW4gZmlyc3QgKHNvIHRoZSBlY2hvZWQgYXVkaW8gaXNuJ3Qgc3VwcHJlc3NlZFxuXHRcdFx0XHQvLyBvciBjYXB0dXJlZCBhcyB0aGUgdXNlcidzIHR1cm4pLCB0aGVuIHJlcXVlc3RzIG5hcnJhdGlvbiAtXG5cdFx0XHRcdC8vIHJlc3BvbnNlcyBvbiBmb2N1cyBhcmUgbmFycmF0ZWQgZXhhY3RseSBsaWtlIGNvbmZpcm1hdGlvbnMuXG5cdFx0XHRcdGNvbnN0IGFscmVhZHlOYXJyYXRlZCA9IG5hcnJhdGFibGUua2luZCA9PT0gJ3Jlc3BvbnNlJ1xuXHRcdFx0XHRcdCYmIHRoaXMuX2dldExhc3ROYXJyYXRlZFRleHQoa2V5KSA9PT0gbmFycmF0YWJsZS50ZXh0O1xuXHRcdFx0XHQvLyBBIHN0aWxsLXBlbmRpbmcgY29uZmlybWF0aW9uIG9yIHF1ZXN0aW9uIHdlIGFscmVhZHkgc3Bva2UgbXVzdCBub3Rcblx0XHRcdFx0Ly8gYmUgcmUtbmFycmF0ZWQgb24gYSBtZXJlIHJlZm9jdXMuIF9uYXJyYXRlZFBlbmRpbmcgcmVjb3Jkc1xuXHRcdFx0XHQvLyB0aGUgdGV4dCBvbmx5IG9uY2UgaXRzIGF1ZGlvIGZpbmFsaXplZCwgc28gb25lIHRoYXQgd2FzXG5cdFx0XHRcdC8vIGRlZmVycmVkL2Ryb3BwZWQgKG5ldmVyIGhlYXJkKSBzdGlsbCByZXRyaWVzIGhlcmUsIHdoaWxlIG9uZSB0aGVcblx0XHRcdFx0Ly8gdXNlciBhbHJlYWR5IGhlYXJkIHN0YXlzIHNpbGVudCB1bnRpbCBpdCBjaGFuZ2VzIG9yIHJlc29sdmVzLlxuXHRcdFx0XHRjb25zdCBwZW5kaW5nQWxyZWFkeUhlYXJkID0gbmFycmF0YWJsZS5raW5kICE9PSAncmVzcG9uc2UnXG5cdFx0XHRcdFx0JiYgdGhpcy5fbmFycmF0ZWRQZW5kaW5nLmdldChzZXNzaW9uS2V5KSA9PT0gdGhpcy5fbmFycmF0YWJsZUlkZW50aXR5KG5hcnJhdGFibGUpO1xuXHRcdFx0XHQvLyBPbmx5IG5hcnJhdGUgYSByZXNwb25zZSBvbiBmb2N1cyB3aGVuIGl0J3MgYSBjb21wbGV0aW9uIHJlY29yZGVkXG5cdFx0XHRcdC8vIFRISVMgcnVuIC0gaS5lLiB0aGUgc2Vzc2lvbiBvd25zIGEgcGVuZGluZy1yZXNwb25zZSBzdW1tYXJ5LCBzZXQgb25cblx0XHRcdFx0Ly8gdGhlIG9ic2VydmVkIGlkbGUgdHJhbnNpdGlvbiBpbiBfaGFuZGxlTmFycmF0YWJsZVN0YXRlQ2hhbmdlLiBBXG5cdFx0XHRcdC8vIHJlc2lkZW50IG1vZGVsIHN1cmZhY2VkIGJ5IGZvY3VzIG9yIGVhZ2VyLWxvYWQgY2FycmllcyB3aGF0ZXZlclxuXHRcdFx0XHQvLyByZXBseSBpdCBsYXN0IGhlbGQsIGluY2x1ZGluZyBvbmUgdGhhdCBjb21wbGV0ZWQgYmVmb3JlIHdlIHN0YXJ0ZWRcblx0XHRcdFx0Ly8gdHJhY2tpbmcgKGUuZy4gYW4gb2xkIHNlc3Npb24gcmV2ZWFsZWQgYnkgYSBsaXN0L2ZpbHRlciBjaGFuZ2UpO1xuXHRcdFx0XHQvLyB0aGF0IHByZWRhdGVzIG91ciBvYnNlcnZhdGlvbiBhbmQgbXVzdCBub3QgYmUgcmVhZCBvdXQuIFRoZVxuXHRcdFx0XHQvLyBwZW5kaW5nLXN1bW1hcnkgdG9rZW4gaXMgdGhlIHBlci10dXJuIGZyZXNobmVzcyBzaWduYWwgKHRoZSBzYW1lIG9uZVxuXHRcdFx0XHQvLyB0aGF0IGRyaXZlcyB0aGUgdW5yZWFkLXJlcGx5IGluZGljYXRvciksIHNvIGZvY3VzIG5hcnJhdGVzIGV4YWN0bHlcblx0XHRcdFx0Ly8gdGhlIHJlcGxpZXMgdGhhdCBzaG93IGFzIHVucmVhZC4gQ29uZmlybWF0aW9ucyBhcmUgZXhlbXB0OiB0aGV5IGFyZVxuXHRcdFx0XHQvLyBjdXJyZW50IGFjdGlvbmFibGUgc3RhdGUsIGRlZHVwZWQgc2VwYXJhdGVseSBieSBfbmFycmF0ZWRQZW5kaW5nLlxuXHRcdFx0XHRjb25zdCBzdGFsZVJlc3BvbnNlID0gbmFycmF0YWJsZS5raW5kID09PSAncmVzcG9uc2UnXG5cdFx0XHRcdFx0JiYgIXRoaXMuX3BlbmRpbmdSZXNwb25zZVN1bW1hcmllcy5oYXMoc2Vzc2lvbktleSk7XG5cdFx0XHRcdC8vIEEgaGVsZCBkZWxpYmVyYXRlIHByZXNzIGtlcHQgVEhJUyByZXBseSBidWZmZXJlZCAoc2VlXG5cdFx0XHRcdC8vIF9mbHVzaERlZmVycmVkUmVzcG9uc2UpLCBzbyBpdCB3aWxsIHBsYXkgb24gcmVsZWFzZS4gUmUtaXNzdWluZ1xuXHRcdFx0XHQvLyBpdCBub3cgd291bGQgYmUgTkFDSydkIGJ1c3ksIGRlZmVycmVkLCBhbmQgdGhlbiBkb3VibGUgdXAgd2l0aFxuXHRcdFx0XHQvLyB0aGF0IGJ1ZmZlci4gU3VwcHJlc3Mgb25seSB0aGF0IGV4YWN0IGR1cGxpY2F0ZTogYW4gdW5yZWxhdGVkXG5cdFx0XHRcdC8vIGNvbmZpcm1hdGlvbiBvciBhIG5ld2VyLCBkaWZmZXJlbnQgcmVzcG9uc2UgZm9yIHRoZSBzZXNzaW9uIG11c3Rcblx0XHRcdFx0Ly8gc3RpbGwgbmFycmF0ZSAodGhlIGJ1ZmZlciBob2xkcyBhIGRpZmZlcmVudCwgb2xkZXIgcmVwbHkpLlxuXHRcdFx0XHRjb25zdCBidWZmZXJSZXRhaW5lZFVuZGVyUHJlc3MgPSBmbHVzaFJlc3VsdC5yZXRhaW5lZCA9PT0gdHJ1ZVxuXHRcdFx0XHRcdCYmIG5hcnJhdGFibGUua2luZCA9PT0gJ3Jlc3BvbnNlJ1xuXHRcdFx0XHRcdCYmICEhZmx1c2hSZXN1bHQucmV0YWluZWRUcmFuc2NyaXB0XG5cdFx0XHRcdFx0JiYgdGhpcy5fbm9ybWFsaXplVHJhbnNjcmlwdChuYXJyYXRhYmxlLnRleHQpID09PSBmbHVzaFJlc3VsdC5yZXRhaW5lZFRyYW5zY3JpcHQ7XG5cdFx0XHRcdGlmIChwZW5kaW5nQWxyZWFkeUhlYXJkKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIGFjdGl2YXRlIHNraXA6ICR7bmFycmF0YWJsZS5raW5kfSBhbHJlYWR5IGhlYXJkIGZvciAke2tleS5zbGljZSgtMzIpfWApO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHN0YWxlUmVzcG9uc2UpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFt2b2ljZV0gYWN0aXZhdGUgc2tpcDogc3RhbGUgcmVzcG9uc2UgKG5vIHBlbmRpbmcgc3VtbWFyeSkgZm9yICR7a2V5LnNsaWNlKC0zMil9YCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYnVmZmVyUmV0YWluZWRVbmRlclByZXNzKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIGFjdGl2YXRlIHNraXA6IGJ1ZmZlcmVkIHJlcGx5IHJldGFpbmVkIHVuZGVyIGhlbGQgcHJlc3MgZm9yICR7a2V5LnNsaWNlKC0zMil9YCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fbmFycmF0ZShrZXksIG5hcnJhdGFibGUua2luZCwgbmFycmF0YWJsZS50ZXh0LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbmFycmF0YWJsZS5jb25maXJtYXRpb25UeXBlLCBuYXJyYXRhYmxlLnBlbmRpbmcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChuYXJyYXRhYmxlLmtpbmQgPT09ICdyZXNwb25zZScpIHtcblx0XHRcdFx0XHQvLyBBIHJlcXVlc3QgYmVpbmcgU0VOVCBpcyBub3QgdGhlIHJlcGx5IGJlaW5nIGhlYXJkOiBrZWVwIHRoZVxuXHRcdFx0XHRcdC8vIHBlbmRpbmcgaW5kaWNhdG9yIHVudGlsIGl0cyBhdWRpbyBmaW5hbGl6ZXMgKF9tYXJrTmFycmF0aW9uSGVhcmRcblx0XHRcdFx0XHQvLyBjbGVhcnMgaXQgdGhlbikuIE9ubHkgYW4gYWxyZWFkeS1uYXJyYXRlZCByZXBseSBpcyBoYW5kbGVkIGhlcmUsXG5cdFx0XHRcdFx0Ly8gc28gYSByZS1mb2N1cyBvZiBhIGdlbnVpbmVseS1yZWFkIHJlcGx5IHN0aWxsIGNsZWFycyBwcm9tcHRseS5cblx0XHRcdFx0XHRoYW5kbGVkUmVzcG9uc2UgPSBoYW5kbGVkUmVzcG9uc2UgfHwgYWxyZWFkeU5hcnJhdGVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIENsZWFyIHRoaXMgc2Vzc2lvbidzIHBlbmRpbmcgcmVwbHkgaW5kaWNhdG9yL3N1bW1hcnkgb25seSBvbmNlIGl0cyByZXBseVxuXHRcdC8vIHdhcyBhY3R1YWxseSBoYW5kbGVkOiBpdHMgYnVmZmVyZWQgYXVkaW8gd2FzIGZsdXNoZWQvcGxheWVkLCBvciBpdCB3YXNcblx0XHQvLyBhbHJlYWR5IG5hcnJhdGVkIChhIHJlLWZvY3VzIG9mIGEgcmVwbHkgd2UgcmVhZCBiZWZvcmUpLiBBIGZyZXNobHlcblx0XHQvLyBSRVFVRVNURUQgbmFycmF0aW9uIGRvZXMgTk9UIGNsZWFyIGhlcmUgLSBhIHNlbnQgcmVxdWVzdCBpcyBub3QgYSBoZWFyZFxuXHRcdC8vIHJlcGx5OyBpdHMgaW5kaWNhdG9yIGlzIGNsZWFyZWQgZnJvbSBfbWFya05hcnJhdGlvbkhlYXJkIG9uY2UgdGhlIGF1ZGlvXG5cdFx0Ly8gYWN0dWFsbHkgZmluaXNoZXMgcGxheWluZyAob3IgaXMgcmV0YWluZWQgaWYgdGhlIGF1ZGlvIG5ldmVyIGFycml2ZXMsIHNvXG5cdFx0Ly8gYSBsYXRlciBmb2N1cy9zdGF0ZSBldmVudCBjYW4gcmV0cnkpLiBNaXJyb3JzIGhvdyB0aGUgY29uZmlybWF0aW9uXG5cdFx0Ly8gaW5kaWNhdG9yIGlzIGNsZWFyZWQgb24gZm9jdXMgKHNlZSBfY2xlYXJDb25maXJtYXRpb25JbmRpY2F0b3IpLlxuXHRcdGlmIChoYW5kbGVkUmVzcG9uc2UpIHtcblx0XHRcdHRoaXMuX2NsZWFyUGVuZGluZ1Jlc3BvbnNlKHNlc3Npb25LZXkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBBc2sgdGhlIGJhY2tlbmQgdG8gbmFycmF0ZSBhIHNlc3Npb24ncyBwZW5kaW5nIGl0ZW0sIGRlLWR1cGVkIGJ5IHRoZSBleGFjdCB0ZXh0IGxhc3Qgc3Bva2VuIGZvciBpdCAoe0BsaW5rIF9sYXN0TmFycmF0ZWRUZXh0fSkgYW5kIGJ5IGFueSBpbi1mbGlnaHQgcmVxdWVzdCBmb3IgdGhlIHNhbWUgdGV4dCAoe0BsaW5rIF9wZW5kaW5nU29saWNpdGVkTmFycmF0aW9uc30pOyB0aGUgc2luZ2xlIG5hcnJhdGlvbiB0cmlnZ2VyIGZvciBib3RoIGxpdmUgYW5kIG9uLWZvY3VzIHBhdGhzLiBSZXR1cm5zIGB0cnVlYCB3aGVuIGEgcmVxdWVzdCB3YXMgYWN0dWFsbHkgU0VOVCAtIE5PVCB0aGF0IHRoZSByZXBseSB3YXMgaGVhcmQgKHRoZSBhdWRpbyBtYXkgc3RpbGwgYmUgZHJvcHBlZC9kZWZlcnJlZC9uZXZlciBhcnJpdmUpLiBUaGUgcmVwbHkgaXMgbWFya2VkIG5hcnJhdGVkIGFuZCBpdHMgcGVuZGluZyBpbmRpY2F0b3IgY2xlYXJlZCBvbmx5IG9uY2UgaXRzIGF1ZGlvIGZpbmFsaXplcyAoc2VlIHtAbGluayBfbWFya05hcnJhdGlvbkhlYXJkfSkuICovXG5cdHByaXZhdGUgX25hcnJhdGUoc2Vzc2lvbklkOiBzdHJpbmcsIGtpbmQ6IFZvaWNlTmFycmF0aW9uS2luZCwgdGV4dDogc3RyaW5nLCByZXVzZUlkPzogc3RyaW5nLCBjaGVja3BvaW50PzogSVZvaWNlQ2hlY2twb2ludE5hcnJhdGlvbk1ldGFkYXRhLCBjb25maXJtYXRpb25UeXBlPzogVm9pY2VDb25maXJtYXRpb25UeXBlLCBwZW5kaW5nPzogeyBwZW5kaW5nSWQ6IHN0cmluZyB9KTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0ZXh0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIFBlcnNpc3RlbnQgZXhhY3RseS1vbmNlIGRlZHVwIGFwcGxpZXMgb25seSB0byBjb21wbGV0ZWQgcmVzcG9uc2VzOiBhXG5cdFx0Ly8gcmVzcG9uc2UgaXMgaW1tdXRhYmxlIGNvbnRlbnQsIHNvIHJlLXJlYWRpbmcgdGhlIHNhbWUgdGV4dCBvbiBmb2N1cyBpc1xuXHRcdC8vIHVuZGVzaXJhYmxlLiBBIGNvbmZpcm1hdGlvbiBpcyBjdXJyZW50IGFjdGlvbmFibGUgc3RhdGUgLSB0d28gc2VwYXJhdGVcblx0XHQvLyB0b29scyBjYW4gbGVnaXRpbWF0ZWx5IHJhaXNlIGlkZW50aWNhbCBwcm9tcHRzIChcIkFsbG93IHRoaXMgY29tbWFuZD9cIiksXG5cdFx0Ly8gYW5kIGVhY2ggbXVzdCBiZSBuYXJyYXRlZCwgc28gY29uZmlybWF0aW9ucyBhcmUgbmV2ZXIgc3VwcHJlc3NlZCBoZXJlLlxuXHRcdGlmIChraW5kID09PSAncmVzcG9uc2UnICYmIHRoaXMuX2dldExhc3ROYXJyYXRlZFRleHQoc2Vzc2lvbklkKSA9PT0gdGV4dCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBBIHJlcXVlc3QgZm9yIHRoaXMgZXhhY3Qgb2NjdXJyZW5jZStraW5kIGlzIGFscmVhZHkgaW4gZmxpZ2h0IChpdHMgYXVkaW9cblx0XHQvLyBoYXNuJ3QgZmluYWxpemVkIHlldCk7IGRvbid0IHJlLXJlcXVlc3Qgb3Igd2UnZCBuYXJyYXRlIGl0IHR3aWNlLiBNYXRjaCBvblxuXHRcdC8vIGtpbmQgdG9vIHNvIGFuIGluLWZsaWdodCByZXNwb25zZSBjYW4ndCBzdXBwcmVzcyBhIHNhbWUtdGV4dCBjb25maXJtYXRpb24sXG5cdFx0Ly8gYW5kIG9uIHRoZSBwZW5kaW5nIGlkIHNvIGEgKmRpZmZlcmVudCogZm9ybSB0aGF0IGhhcHBlbnMgdG8gcmVuZGVyIHRoZVxuXHRcdC8vIHNhbWUgcHJvbXB0IGlzIG5vdCBtaXN0YWtlbiBmb3IgdGhlIG9uZSBhbHJlYWR5IGluIGZsaWdodC5cblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gdGhpcy5fc2Vzc2lvbktleShzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IGlkZW50aXR5ID0gdGhpcy5fbmFycmF0YWJsZUlkZW50aXR5KHsgdGV4dCwgcGVuZGluZywgY29uZmlybWF0aW9uVHlwZSB9KTtcblx0XHRmb3IgKGNvbnN0IHMgb2YgdGhpcy5fcGVuZGluZ1NvbGljaXRlZE5hcnJhdGlvbnMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChzLmtpbmQgPT09IGtpbmQgJiYgdGhpcy5fbmFycmF0YWJsZUlkZW50aXR5KHMpID09PSBpZGVudGl0eSAmJiB0aGlzLl9zZXNzaW9uS2V5KHMuc2Vzc2lvbklkKSA9PT0gc2Vzc2lvbktleSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIEEgcmVzcG9uc2Ugb25seSBzdXBlcnNlZGVzIGNoZWNrcG9pbnQgcGxheWJhY2sgb25jZSBub24tZW1wdHkgcmVzcG9uc2UgYXVkaW8gYXJyaXZlcy5cblx0XHRpZiAoa2luZCAhPT0gJ3Jlc3BvbnNlJykge1xuXHRcdFx0dGhpcy5fcHJlZW1wdENoZWNrcG9pbnRQbGF5YmFjaygpO1xuXHRcdH1cblx0XHRpZiAoa2luZCA9PT0gJ2NvbmZpcm1hdGlvbicpIHtcblx0XHRcdHRoaXMuX3NlbmRDb250ZXh0KCk7XG5cdFx0XHR0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5mbHVzaFNlc3Npb25Db250ZXh0KCk7XG5cdFx0fVxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBuYXJyYXRlIGtpbmQ9JHtraW5kfSBpZD0ke3Nlc3Npb25JZC5zbGljZSgtMzIpfWApO1xuXHRcdGNvbnN0IG5hcnJhdGlvbklkID0gdGhpcy52b2ljZUNsaWVudFNlcnZpY2UucmVxdWVzdE5hcnJhdGlvbihzZXNzaW9uSWQsIGtpbmQsIHRleHQsIHJldXNlSWQsIGNoZWNrcG9pbnQsIGNvbmZpcm1hdGlvblR5cGUsIHBlbmRpbmcpO1xuXHRcdGlmICghbmFycmF0aW9uSWQpIHtcblx0XHRcdGlmIChraW5kID09PSAnY2hlY2twb2ludCcpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gU29ja2V0IHdhcyBjbG9zZWQsIHNvIG5vdGhpbmcgd2FzIHNlbnQ6IGRvbid0IHRvdWNoIHBsYXliYWNrL2xpc3RlbmluZ1xuXHRcdFx0Ly8gc3RhdGUgKHRoYXQgd291bGQgdGVhciBkb3duIGEgZnJlc2hseS1lbnRlcmVkIGxpc3RlbiBvbiBjb25uZWN0KS5cblx0XHRcdC8vIFJlbWVtYmVyIHRoZSBpdGVtIHNvIHRoZSBuZXh0IHNlc3Npb25faW5pdCByZXBsYXlzIGl0IGFmdGVyIHJlc3VtZTtcblx0XHRcdC8vIGxlYXZpbmcgdGhlIGRlZHVwIHVuc2V0IGxldHMgYSBsYXRlciBmb2N1cy9zdGF0ZSBldmVudCByZXRyeSB0b28uXG5cdFx0XHR0aGlzLl9wZW5kaW5nTmFycmF0aW9uUmV0cmllcy5zZXQoc2Vzc2lvbklkLCB7IGtpbmQsIHRleHQsIGNvbmZpcm1hdGlvblR5cGUsIHBlbmRpbmcgfSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChraW5kID09PSAnY2hlY2twb2ludCcpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXVtjaGVja3BvaW50XSByZXF1ZXN0ZWQgbmFycmF0aW9uX2lkPSR7bmFycmF0aW9uSWR9IHJlcXVlc3RfaWQ9JHtjaGVja3BvaW50Py5yZXF1ZXN0SWQgPz8gJzx1bmtub3duPid9IHBoYXNlPSR7Y2hlY2twb2ludD8uY2hlY2twb2ludElkID8/ICc8dW5rbm93bj4nfSBzZXF1ZW5jZT0ke2NoZWNrcG9pbnQ/LnNlcXVlbmNlID8/IDB9IHNlZWQ9JHtKU09OLnN0cmluZ2lmeSh0ZXh0KX1gKTtcblx0XHR9XG5cdFx0Ly8gVGhlIG5hcnJhdGlvbiBhdWRpbyBpcyBub3cgaW5ib3VuZC4gR2V0IG91dCBvZiBsaXN0ZW5pbmcvYXV0by1saXN0ZW4gc29cblx0XHQvLyB0aGUgZWNob2VkIGF1ZGlvIGlzbid0IHN1cHByZXNzZWQgKG9yIGNhcHR1cmVkIGFzIHRoZSB1c2VyJ3Mgb3duIHR1cm4pXG5cdFx0Ly8gd2hpbGUgUFRUL21pYyBjYXB0dXJlIGlzIGFjdGl2ZS4gRG9uZSBoZXJlIHNvIGV2ZXJ5IG5hcnJhdGlvbiBwYXRoXG5cdFx0Ly8gKGxpdmUsIG9uLWZvY3VzLCBvbi1yZWNvbm5lY3QgcmV0cnkpIGlzIHByZXBhcmVkLCBub3QganVzdCBmb2N1cyAtIGJ1dFxuXHRcdC8vIG9ubHkgb25jZSBhIHJlcXVlc3QgaXMgYWN0dWFsbHkgaW4gZmxpZ2h0LiBBIGhlbGQgZGVsaWJlcmF0ZSBwcmVzc1xuXHRcdC8vIGxlYXZlcyB0aGUgc2xvdCB1bnRvdWNoZWQgKHNlZSBfcHJlcGFyZUZvclBsYXliYWNrKTsgaXRzIG5hcnJhdGlvbiBpc1xuXHRcdC8vIE5BQ0snZCBidXN5IGFuZCByZXRyaWVkIG9uIHJlbGVhc2UsIHNvIHRoZSBpZ25vcmVkIHJldHVybiBpcyBleHBlY3RlZC5cblx0XHR0aGlzLl9wcmVwYXJlRm9yUGxheWJhY2soKTtcblx0XHR0aGlzLl9wZW5kaW5nTmFycmF0aW9uUmV0cmllcy5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHQvLyBUaGlzIG5ld2VyIHJlcXVlc3Qgc3VwZXJzZWRlcyBhbnkgb2xkZXIgYnVzeS9pbnRlcnJ1cHRlZCBlbnRyeSBkZWZlcnJlZFxuXHRcdC8vIGZvciB0aGlzIHNlc3Npb24gKGxhdGVzdC13aW5zIHBlciBzZXNzaW9uKS4gV2l0aG91dCB0aGlzLCBhIGxhdGVyXG5cdFx0Ly8gbmFycmF0aW9uX3VuYmxvY2tlZCBjb3VsZCByZXRyeSB0aGUgc3RhbGUgZW50cnkgYW5kLCBzaW5jZSBjb25maXJtYXRpb25zXG5cdFx0Ly8gYXJlIG5vdCB0ZXh0LWRlZHVwZWQsIHNwZWFrIHRoZSBzYW1lIHByb21wdCBhIHNlY29uZCB0aW1lLlxuXHRcdHRoaXMuX2NsZWFyRGVmZXJyZWQoc2Vzc2lvbktleSk7XG5cdFx0Ly8gUmVtZW1iZXIgdGhpcyBpZCBzbyB0aGUgZWNob2VkIGF1ZGlvIChyZXNwb25zZUlkID09PSBuYXJyYXRpb25JZCkgaXNcblx0XHQvLyBuZXZlciBkcm9wcGVkIGFzIGFuIHVuc29saWNpdGVkIGR1cGxpY2F0ZSBieSBfaXNSZW5hcnJhdGlvbiwgZXZlbiB3aGVuXG5cdFx0Ly8gaXRzIHRyYW5zY3JpcHQgbWF0Y2hlcyBhIHJlcGx5IHdlIHJlY2VudGx5IHJlYWQgZm9yIHRoaXMgc2Vzc2lvbi4gQm91bmRcblx0XHQvLyB0aGUgc2V0IHNvIGlkcyB0aGF0IG5ldmVyIHlpZWxkIGF1ZGlvIChsZWdhY3kgYmFja2VuZHMgdGhhdCBkb24ndCBlY2hvXG5cdFx0Ly8gdGhlbSwgaW50ZXJydXB0ZWQgc3RyZWFtcykgY2FuJ3QgbGVhayBhY3Jvc3MgYSBsb25nIHNlc3Npb24uXG5cdFx0aWYgKHRoaXMuX3NvbGljaXRlZE5hcnJhdGlvbklkcy5zaXplID49IDY0KSB7XG5cdFx0XHRjb25zdCBvbGRlc3QgPSB0aGlzLl9zb2xpY2l0ZWROYXJyYXRpb25JZHMudmFsdWVzKCkubmV4dCgpLnZhbHVlO1xuXHRcdFx0aWYgKG9sZGVzdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX3NvbGljaXRlZE5hcnJhdGlvbklkcy5kZWxldGUob2xkZXN0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fc29saWNpdGVkTmFycmF0aW9uSWRzLmFkZChuYXJyYXRpb25JZCk7XG5cdFx0Ly8gRG8gTk9UIG1hcmsgdGhlIHJlcGx5IG5hcnJhdGVkIC8gY2xlYXIgaXRzIHBlbmRpbmcgaW5kaWNhdG9yIHlldCAtIGFcblx0XHQvLyByZXF1ZXN0IGJlaW5nIGFjY2VwdGVkIGlzIG5vdCB0aGUgcmVwbHkgYmVpbmcgaGVhcmQuIFdhaXQgZm9yIHRoZVxuXHRcdC8vIGJhY2tlbmQgdG8gc3RhcnQgcmV0dXJuaW5nIGF1ZGlvOiBpZiBpdCBuZXZlciBkb2VzLCB0aGUgd2F0Y2hkb2cgYmVsb3dcblx0XHQvLyByZWxlYXNlcyB0aGUgZ3VhcmQgYW5kIHJlc3RvcmVzIHN0YXRlIHNvIHZvaWNlIG1vZGUgY2FuJ3QgZ2V0IHN0dWNrIG9uXG5cdFx0Ly8gYSBjb21wbGV0ZWQgcmVzcG9uc2UgdGhhdCBuZXZlciBwcm9kdWNlZCBhdWRpby4gT25jZSBhdWRpbyBzdGFydHMsIHRoZVxuXHRcdC8vIHN0cmVhbSBpcyBsZWZ0IHRvIGZpbmFsaXplIG5vcm1hbGx5IChfbWFya05hcnJhdGlvbkhlYXJkKSB3aXRoIG5vXG5cdFx0Ly8gdGltZW91dCBvbiB0aGUgcmVtYWluZGVyLlxuXHRcdGNvbnN0IGF1ZGlvU3RhcnRUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5faGFuZGxlU29saWNpdGVkTmFycmF0aW9uQXVkaW9TdGFydFRpbWVvdXQobmFycmF0aW9uSWQpO1xuXHRcdH0sIFZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuX1NPTElDSVRFRF9OQVJSQVRJT05fQVVESU9fU1RBUlRfVElNRU9VVF9NUyk7XG5cdFx0dGhpcy5fcGVuZGluZ1NvbGljaXRlZE5hcnJhdGlvbnMuc2V0KG5hcnJhdGlvbklkLCB7XG5cdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHRraW5kLFxuXHRcdFx0dGV4dCxcblx0XHRcdHBlbmRpbmcsXG5cdFx0XHRjaGVja3BvaW50LFxuXHRcdFx0Y29uZmlybWF0aW9uVHlwZSxcblx0XHRcdGF1ZGlvU3RhcnRUaW1lcixcblx0XHRcdGhhc1JlY2VpdmVkQXVkaW86IGZhbHNlLFxuXHRcdH0pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWFya1NvbGljaXRlZE5hcnJhdGlvbkF1ZGlvU3RhcnRlZChuYXJyYXRpb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCFuYXJyYXRpb25JZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ1NvbGljaXRlZE5hcnJhdGlvbnMuZ2V0KG5hcnJhdGlvbklkKTtcblx0XHRpZiAoIXBlbmRpbmcgfHwgcGVuZGluZy5oYXNSZWNlaXZlZEF1ZGlvKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEF1ZGlvIGhhcyBzdGFydGVkIGFycml2aW5nLCBzbyB0aGUgXCJubyBhdWRpbyBhdCBhbGxcIiB3YXRjaGRvZyBpcyBkb25lLlxuXHRcdC8vIFRoZSByZXN0IG9mIHRoZSBzdHJlYW0gaXMgbGVmdCB0byBmaW5hbGl6ZSBub3JtYWxseSAoX21hcmtOYXJyYXRpb25IZWFyZCk7XG5cdFx0Ly8gd2UgZG9uJ3QgdGltZSBvdXQgYSBzdHJlYW0gdGhhdCBpcyBhY3RpdmVseSBjb21pbmcgaW4uXG5cdFx0cGVuZGluZy5oYXNSZWNlaXZlZEF1ZGlvID0gdHJ1ZTtcblx0XHRjbGVhclRpbWVvdXQocGVuZGluZy5hdWRpb1N0YXJ0VGltZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlU29saWNpdGVkTmFycmF0aW9uQXVkaW9TdGFydFRpbWVvdXQobmFycmF0aW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nU29saWNpdGVkTmFycmF0aW9ucy5nZXQobmFycmF0aW9uSWQpO1xuXHRcdGlmICghcGVuZGluZyB8fCBwZW5kaW5nLmhhc1JlY2VpdmVkQXVkaW8pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ1NvbGljaXRlZE5hcnJhdGlvbnMuZGVsZXRlKG5hcnJhdGlvbklkKTtcblx0XHR0aGlzLl9zb2xpY2l0ZWROYXJyYXRpb25JZHMuZGVsZXRlKG5hcnJhdGlvbklkKTtcblx0XHQvLyBPbmx5IHJlc3RvcmUgc3RhdGUgd2hlbiB0aGlzIHdhcyB0aGUgbGFzdCB0aGluZyB3ZSB3ZXJlIHdhaXRpbmcgb24uIElmIGFcblx0XHQvLyBkaXJlY3QgY2hhdCByZXBseSBpcyBzdGlsbCBleHBlY3RlZCAoYF9hd2FpdGluZ1JlcGx5QXVkaW9gKSBvciBhbm90aGVyXG5cdFx0Ly8gc29saWNpdGVkIG5hcnJhdGlvbiBpcyBzdGlsbCB3YWl0aW5nIGZvciBpdHMgYXVkaW8gdG8gc3RhcnQsIHJlc3RvcmluZ1xuXHRcdC8vIGlkbGUgLyByZS1lbnRlcmluZyB0aGUgaGFuZHMtZnJlZSBtaWMgaGVyZSBjb3VsZCBzdXBwcmVzcyB0aGF0IG90aGVyXG5cdFx0Ly8gcmVzcG9uc2UncyBhdWRpby4gTGVhdmUgcmVzdG9yYXRpb24gdG8gd2hpY2hldmVyIHdhdGNoZG9nIGZpcmVzIGxhc3QuXG5cdFx0aWYgKHRoaXMuX2F3YWl0aW5nUmVwbHlBdWRpbyB8fCB0aGlzLl9oYXNOYXJyYXRpb25Bd2FpdGluZ0F1ZGlvKCkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBzb2xpY2l0ZWQgbmFycmF0aW9uICR7bmFycmF0aW9uSWQuc2xpY2UoMCwgOCl9IHRpbWVkIG91dCB3YWl0aW5nIGZvciBhdWRpbyBzdGFydDsgYW5vdGhlciByZXNwb25zZSBzdGlsbCBleHBlY3RlZCwgZGVmZXJyaW5nIHN0YXRlIHJlc3RvcmVgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIHNvbGljaXRlZCBuYXJyYXRpb24gJHtuYXJyYXRpb25JZC5zbGljZSgwLCA4KX0gdGltZWQgb3V0IHdhaXRpbmcgZm9yIGF1ZGlvIHN0YXJ0OyByZXN0b3JpbmcgaWRsZSBzdGF0ZWApO1xuXHRcdHRoaXMuX3Jlc3RvcmVWb2ljZVN0YXRlQWZ0ZXJOYXJyYXRpb25UaW1lb3V0KCk7XG5cdH1cblxuXHQvKiogVHJ1ZSB3aGlsZSBhbnkgdHJhY2tlZCBzb2xpY2l0ZWQgbmFycmF0aW9uIGlzIHN0aWxsIHdhaXRpbmcgZm9yIGl0cyBhdWRpb1xuXHQgKiAgdG8gc3RhcnQgKGkuZS4gYSBuby1hdWRpbyB3YXRjaGRvZyBpcyBzdGlsbCBvdXRzdGFuZGluZykuICovXG5cdHByaXZhdGUgX2hhc05hcnJhdGlvbkF3YWl0aW5nQXVkaW8oKTogYm9vbGVhbiB7XG5cdFx0Zm9yIChjb25zdCBwZW5kaW5nIG9mIHRoaXMuX3BlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoIXBlbmRpbmcuaGFzUmVjZWl2ZWRBdWRpbykge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJQZW5kaW5nU29saWNpdGVkTmFycmF0aW9uKG5hcnJhdGlvbklkOiBzdHJpbmcsIHBlbmRpbmc6IElQZW5kaW5nU29saWNpdGVkTmFycmF0aW9uKTogdm9pZCB7XG5cdFx0Y2xlYXJUaW1lb3V0KHBlbmRpbmcuYXVkaW9TdGFydFRpbWVyKTtcblx0XHR0aGlzLl9wZW5kaW5nU29saWNpdGVkTmFycmF0aW9ucy5kZWxldGUobmFycmF0aW9uSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbm90aWZ5Q2hlY2twb2ludFBsYXliYWNrQ29tcGxldGUoc2Vzc2lvbklkOiBzdHJpbmcsIG5hcnJhdGlvbklkOiBzdHJpbmcsIG5hcnJhdGlvbjogSVBsYXliYWNrTmFycmF0aW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKG5hcnJhdGlvbj8ua2luZCA9PT0gJ2NoZWNrcG9pbnQnICYmIG5hcnJhdGlvbi5wbGF5YmFja0lkKSB7XG5cdFx0XHR0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5zZW5kTmFycmF0aW9uUGxheWJhY2tDb21wbGV0ZShzZXNzaW9uSWQsIG5hcnJhdGlvbklkLCBuYXJyYXRpb24ucGxheWJhY2tJZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVzdG9yZVZvaWNlU3RhdGVBZnRlck5hcnJhdGlvblRpbWVvdXQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudHRzUGxheWJhY2tTZXJ2aWNlLmlzUGxheWluZyB8fCB0aGlzLl9hdWRpb1F1ZXVlLmxlbmd0aCA+IDAgfHwgdGhpcy5fY3VycmVudFBsYXliYWNrU2Vzc2lvbklkICE9PSBudWxsIHx8IHRoaXMuX3B0dEhlbGQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2lzSGFuZHNGcmVlRW5hYmxlZCgpICYmIHRoaXMuX3dpbmRvdyAmJiB0aGlzLl9pc0Nvbm5lY3RlZC5nZXQoKSkge1xuXHRcdFx0dGhpcy5fZW50ZXJBdXRvTGlzdGVuKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3ZvaWNlU3RhdGUuc2V0KCdpZGxlJywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9zdGF0dXNUZXh0LnNldCgnSG9sZCB0byBzcGVhay4uLicsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKiogTWFyayBhIHNvbGljaXRlZCBuYXJyYXRpb24ncyByZXBseSBhcyBhY3R1YWxseSBoZWFyZCBvbmNlIGl0cyBmaW5hbCBhdWRpb1xuXHQgKiAgY2h1bmsgYXJyaXZlcyAocmVzcG9uc2VJZCA9PT0gdGhlIG5hcnJhdGlvbiBpZCB3ZSBzZW50KS4gT25seSBub3cgZG8gd2Ugc2V0XG5cdCAqICB0aGUgZXhhY3RseS1vbmNlIGRlZHVwIGFuZCBjbGVhciB0aGUgc2Vzc2lvbidzIHBlbmRpbmctcmVzcG9uc2UgaW5kaWNhdG9yLFxuXHQgKiAgc2luY2UgYSBtZXJlIHJlcXVlc3QgYWNjZXB0YW5jZSBpcyBub3QgcHJvb2YgdGhlIHJlcGx5IHBsYXllZC4gKi9cblx0cHJpdmF0ZSBfbWFya05hcnJhdGlvbkhlYXJkKG5hcnJhdGlvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzb2xpY2l0ZWQgPSB0aGlzLl9wZW5kaW5nU29saWNpdGVkTmFycmF0aW9ucy5nZXQobmFycmF0aW9uSWQpO1xuXHRcdGlmICghc29saWNpdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2NsZWFyUGVuZGluZ1NvbGljaXRlZE5hcnJhdGlvbihuYXJyYXRpb25JZCwgc29saWNpdGVkKTtcblx0XHQvLyBPbmx5IHJlc3BvbnNlcyBwb3B1bGF0ZSB0aGUgcGVyc2lzdGVudCB0ZXh0IGRlZHVwIChhbmQgb3duIHRoZSBwZW5kaW5nXG5cdFx0Ly8gaW5kaWNhdG9yKS4gQSBjb25maXJtYXRpb24gaXMgdHJhbnNpZW50IGFjdGlvbmFibGUgc3RhdGUgdGhhdCBtdXN0IGJlXG5cdFx0Ly8gcmUtbmFycmF0YWJsZSwgc28gaGVhcmQgY29uZmlybWF0aW9ucyBsZWF2ZSBfbGFzdE5hcnJhdGVkVGV4dCB1bnRvdWNoZWQuXG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9IHRoaXMuX3Nlc3Npb25LZXkoc29saWNpdGVkLnNlc3Npb25JZCk7XG5cdFx0aWYgKHNvbGljaXRlZC5raW5kID09PSAncmVzcG9uc2UnKSB7XG5cdFx0XHR0aGlzLl9sYXN0TmFycmF0ZWRUZXh0LnNldChzZXNzaW9uS2V5LCBzb2xpY2l0ZWQudGV4dCk7XG5cdFx0XHR0aGlzLl9jbGVhclBlbmRpbmdSZXNwb25zZShzZXNzaW9uS2V5KTtcblx0XHR9IGVsc2UgaWYgKHNvbGljaXRlZC5raW5kID09PSAnY29uZmlybWF0aW9uJykge1xuXHRcdFx0Ly8gQ29uZmlybWF0aW9uIGhlYXJkOiBtYXJrIFRISVMgb2NjdXJyZW5jZSBzcG9rZW4gc28gYSBtZXJlIHJlZm9jdXNcblx0XHRcdC8vIHdoaWxlIGl0IGlzIHN0aWxsIHBlbmRpbmcgZG9lc24ndCByZS1uYXJyYXRlIGl0IChzZWVcblx0XHRcdC8vIF9hY3RpdmF0ZVNob3duU2Vzc2lvbikuIENsZWFyZWQgd2hlbiB0aGUgc2Vzc2lvbiBsZWF2ZXNcblx0XHRcdC8vIHdhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbiAoYXV0b3J1bikgb3Igd2hlbiB0aGUgcGVuZGluZyBpdGVtIGNoYW5nZXNcblx0XHRcdC8vIHVuZGVybmVhdGggaXQsIHNvIGEgZ2VudWluZWx5IG5ldyBjb25maXJtYXRpb24gLSBldmVuIHdpdGggaWRlbnRpY2FsXG5cdFx0XHQvLyB0ZXh0IC0gbmFycmF0ZXMgYWdhaW4uXG5cdFx0XHR0aGlzLl9uYXJyYXRlZFBlbmRpbmcuc2V0KHNlc3Npb25LZXksIHRoaXMuX25hcnJhdGFibGVJZGVudGl0eShzb2xpY2l0ZWQpKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBjb25maXJtYXRpb24gaGVhcmQgZm9yICR7c2Vzc2lvbktleS5zbGljZSgtMzIpfTsgbWFya2luZyBvY2N1cnJlbmNlIHNwb2tlbmApO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGUgYSBgbmFycmF0aW9uX2Fja2AgZm9yIGEgYHJlcXVlc3RfbmFycmF0aW9uYCB3ZSBzZW50LlxuXHQgKlxuXHQgKiBgYWNjZXB0ZWRgIG5lZWRzIG5vdGhpbmc6IHRoZSByZXF1ZXN0IGlzIGFscmVhZHkgdHJhY2tlZCBpblxuXHQgKiB7QGxpbmsgX3BlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb25zfSBhbmQgaXRzIGF1ZGlvIHdpbGwgZmluYWxpemUgbm9ybWFsbHkuXG5cdCAqIGBidXN5YCBtZWFucyB0aGUgYmFja2VuZCBjb3VsZCBub3QgcGxheSByaWdodCBub3cgKHVzZXIgc3BlYWtpbmcgLyByZXBseSBpblxuXHQgKiBmbGlnaHQpOyBpdCB3aWxsIG51ZGdlIHVzIHdpdGggYG5hcnJhdGlvbl91bmJsb2NrZWRgIHdoZW4gdGhlIGd1YXJkIGNsZWFycyxcblx0ICogc28gd2Ugc3RvcCB0cmFja2luZyB0aGUgaWQgYXMgaW4tZmxpZ2h0IGFuZCByZW1lbWJlciBpdCBmb3IgYSByZXZhbGlkYXRlZFxuXHQgKiByZXRyeS4gYGludmFsaWRgIGFuZCBsZWdhY3kgYHN1cHByZXNzZWRgIGFyZSB0ZXJtaW5hbCwgc28gd2UgZHJvcCB0aGVtIGVudGlyZWx5LlxuXHQgKi9cblx0cHJpdmF0ZSBfaGFuZGxlTmFycmF0aW9uQWNrKGU6IElWb2ljZU5hcnJhdGlvbkFjayk6IHZvaWQge1xuXHRcdGlmIChlLmRpc3Bvc2l0aW9uID09PSAnYWNjZXB0ZWQnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGtleSA9IHRoaXMuX3Nlc3Npb25LZXkoZS5jb2RpbmdTZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHNvbGljaXRlZCA9IHRoaXMuX3BlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb25zLmdldChlLm5hcnJhdGlvbklkKTtcblx0XHRpZiAoc29saWNpdGVkKSB7XG5cdFx0XHR0aGlzLl9jbGVhclBlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb24oZS5uYXJyYXRpb25JZCwgc29saWNpdGVkKTtcblx0XHR9XG5cdFx0dGhpcy5fc29saWNpdGVkTmFycmF0aW9uSWRzLmRlbGV0ZShlLm5hcnJhdGlvbklkKTtcblx0XHRpZiAoZS5kaXNwb3NpdGlvbiA9PT0gJ2ludmFsaWQnIHx8IGUuZGlzcG9zaXRpb24gPT09ICdzdXBwcmVzc2VkJykge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIG5hcnJhdGlvbl9hY2sgJHtlLmRpc3Bvc2l0aW9ufSBpZD0ke2UubmFycmF0aW9uSWQuc2xpY2UoMCwgOCl9IHJlYXNvbj0ke2UucmVhc29uID8/ICc8bm9uZT4nfTsgZHJvcHBpbmdgKTtcblx0XHRcdHRoaXMuX2NsZWFyRGVmZXJyZWQoa2V5KTtcblx0XHRcdGlmIChzb2xpY2l0ZWQpIHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Vm9pY2VOYXJyYXRpb25Ecm9wcGVkRXZlbnQsIFZvaWNlTmFycmF0aW9uRHJvcHBlZENsYXNzaWZpY2F0aW9uPigndm9pY2VOYXJyYXRpb25Ecm9wcGVkJywgeyBraW5kOiBzb2xpY2l0ZWQua2luZCwgcmVhc29uOiBlLmRpc3Bvc2l0aW9uIH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBidXN5OiBkZWZlciBmb3IgYSByZXZhbGlkYXRlZCByZXRyeSBvbmNlIHRoZSBndWFyZCBjbGVhcnMuXG5cdFx0Y29uc3Qga2luZCA9IHNvbGljaXRlZD8ua2luZDtcblx0XHRjb25zdCB0ZXh0ID0gc29saWNpdGVkPy50ZXh0O1xuXHRcdGlmIChraW5kICYmIHRleHQpIHtcblx0XHRcdGlmIChraW5kID09PSAnY2hlY2twb2ludCcpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIG5hcnJhdGlvbl9hY2sgYnVzeSBpZD0ke2UubmFycmF0aW9uSWQuc2xpY2UoMCwgOCl9OyBkcm9wcGluZyBjaGVja3BvaW50YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBuYXJyYXRpb25fYWNrIGJ1c3kgaWQ9JHtlLm5hcnJhdGlvbklkLnNsaWNlKDAsIDgpfSByZWFzb249JHtlLnJlYXNvbiA/PyAnPG5vbmU+J307IGRlZmVycmluZ2ApO1xuXHRcdFx0dGhpcy5fZGVmZXJyZWROYXJyYXRpb25zLnNldChrZXksIHsgbmFycmF0aW9uSWQ6IGUubmFycmF0aW9uSWQsIGtpbmQsIHRleHQsIHJldXNlTmFycmF0aW9uSWQ6IHRydWUsIGNvbmZpcm1hdGlvblR5cGU6IHNvbGljaXRlZC5jb25maXJtYXRpb25UeXBlLCBwZW5kaW5nOiBzb2xpY2l0ZWQucGVuZGluZyB9KTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFZvaWNlTmFycmF0aW9uRGVmZXJyZWRFdmVudCwgVm9pY2VOYXJyYXRpb25EZWZlcnJlZENsYXNzaWZpY2F0aW9uPigndm9pY2VOYXJyYXRpb25EZWZlcnJlZCcsIHsga2luZCwgcmVhc29uOiAnYnVzeScgfSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZSBhIGBuYXJyYXRpb25faW50ZXJydXB0ZWRgOiBhbiBhY2NlcHRlZCwgaW4tZmxpZ2h0IG5hcnJhdGlvbiB3YXNcblx0ICogY2FuY2VsbGVkIGJ5IGJhcmdlLWluLiBUaGUgYmFja2VuZCBldmljdGVkIHRoZSBpZCwgc28gc3RvcCB0cmFja2luZyBpdCBhbmRcblx0ICogZGVmZXIgYSByZXZhbGlkYXRlZCByZXRyeSAoZHJpdmVuIGJ5IHRoZSBgbmFycmF0aW9uX3VuYmxvY2tlZGAgdGhhdCBmb2xsb3dzXG5cdCAqIG9uY2UgdGhlIGJhcmdlLWluIHR1cm4gZW5kcykuXG5cdCAqL1xuXHRwcml2YXRlIF9oYW5kbGVOYXJyYXRpb25JbnRlcnJ1cHRlZChlOiBJVm9pY2VOYXJyYXRpb25TaWduYWwpOiB2b2lkIHtcblx0XHRjb25zdCBzb2xpY2l0ZWQgPSB0aGlzLl9wZW5kaW5nU29saWNpdGVkTmFycmF0aW9ucy5nZXQoZS5uYXJyYXRpb25JZCk7XG5cdFx0aWYgKHNvbGljaXRlZCkge1xuXHRcdFx0aWYgKHNvbGljaXRlZC5raW5kID09PSAnY2hlY2twb2ludCcpIHtcblx0XHRcdFx0dGhpcy5fcHJlZW1wdENoZWNrcG9pbnRQbGF5YmFjayhlLmNvZGluZ1Nlc3Npb25JZCwgZS5uYXJyYXRpb25JZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2RlZmVySW50ZXJydXB0ZWROYXJyYXRpb24oZS5uYXJyYXRpb25JZCwgc29saWNpdGVkKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBuYXJyYXRpb25faW50ZXJydXB0ZWQgaWQ9JHtlLm5hcnJhdGlvbklkLnNsaWNlKDAsIDgpfTsgZGVmZXJyaW5nIGZvciByZXZhbGlkYXRpb25gKTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFZvaWNlTmFycmF0aW9uRGVmZXJyZWRFdmVudCwgVm9pY2VOYXJyYXRpb25EZWZlcnJlZENsYXNzaWZpY2F0aW9uPigndm9pY2VOYXJyYXRpb25EZWZlcnJlZCcsIHsga2luZDogc29saWNpdGVkLmtpbmQsIHJlYXNvbjogJ2ludGVycnVwdGVkJyB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc29saWNpdGVkTmFycmF0aW9uSWRzLmRlbGV0ZShlLm5hcnJhdGlvbklkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kZWZlckludGVycnVwdGVkTmFycmF0aW9uKG5hcnJhdGlvbklkOiBzdHJpbmcsIHNvbGljaXRlZDogSVBlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9jbGVhclBlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb24obmFycmF0aW9uSWQsIHNvbGljaXRlZCk7XG5cdFx0dGhpcy5fc29saWNpdGVkTmFycmF0aW9uSWRzLmRlbGV0ZShuYXJyYXRpb25JZCk7XG5cdFx0aWYgKHNvbGljaXRlZC5raW5kID09PSAnY2hlY2twb2ludCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGVmZXJyZWROYXJyYXRpb25zLnNldCh0aGlzLl9zZXNzaW9uS2V5KHNvbGljaXRlZC5zZXNzaW9uSWQpLCB7XG5cdFx0XHRuYXJyYXRpb25JZCxcblx0XHRcdGtpbmQ6IHNvbGljaXRlZC5raW5kLFxuXHRcdFx0dGV4dDogc29saWNpdGVkLnRleHQsXG5cdFx0XHRyZXVzZU5hcnJhdGlvbklkOiBmYWxzZSxcblx0XHRcdHBlbmRpbmc6IHNvbGljaXRlZC5wZW5kaW5nLFxuXHRcdFx0Y29uZmlybWF0aW9uVHlwZTogc29saWNpdGVkLmNvbmZpcm1hdGlvblR5cGUsXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGBuYXJyYXRpb25fdW5ibG9ja2VkYCBudWRnZSBmaXJlZCBmb3IgYSBkZWZlcnJlZCBuYXJyYXRpb24uIFJldmFsaWRhdGVcblx0ICogYWdhaW5zdCB0aGUgY3VycmVudCBzZXNzaW9uIHN0YXRlIGFuZCBvbmx5IHJlLXJlcXVlc3QgaWYgaXQgaXMgc3RpbGxcblx0ICogd2FycmFudGVkLCByZXVzaW5nIHRoZSBzYW1lIGlkIGZvciBhIGJ1c3kgcmV0cnkgd2hlbiB0aGUgdGV4dCBpcyB1bmNoYW5nZWRcblx0ICogKHNvIHRoZSBiYWNrZW5kIGRlZHVwcyBhIGxvc3QgYWNrKSwgYnV0IG1pbnRpbmcgYSBmcmVzaCBpZCBhZnRlciBhblxuXHQgKiBpbnRlcnJ1cHRpb24gYmVjYXVzZSB0aGUgb2xkIGlkIGlzIHRvbWJzdG9uZWQgZm9yIGxhdGUtYXVkaW8gc3VwcHJlc3Npb24uXG5cdCAqIElmIGl0IGlzIG5vIGxvbmdlciB3YXJyYW50ZWQgKHJlc29sdmVkLCBvciBhIGRpZmZlcmVudCBraW5kKSwgZHJvcCBpdC5cblx0ICovXG5cdHByaXZhdGUgX3JldHJ5RGVmZXJyZWROYXJyYXRpb24oc2Vzc2lvbktleTogc3RyaW5nLCB1bmJsb2NrZWROYXJyYXRpb25JZD86IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGRlZmVycmVkID0gdGhpcy5fZGVmZXJyZWROYXJyYXRpb25zLmdldChzZXNzaW9uS2V5KTtcblx0XHRpZiAoIWRlZmVycmVkKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFt2b2ljZV0gbmFycmF0aW9uX3VuYmxvY2tlZCBmb3IgJHtzZXNzaW9uS2V5LnNsaWNlKC0zMil9IGJ1dCBub3RoaW5nIGRlZmVycmVkOyBub3RoaW5nIHRvIHJldHJ5YCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh1bmJsb2NrZWROYXJyYXRpb25JZCAmJiBkZWZlcnJlZC5uYXJyYXRpb25JZCAhPT0gdW5ibG9ja2VkTmFycmF0aW9uSWQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBuYXJyYXRpb25fdW5ibG9ja2VkIGlkPSR7dW5ibG9ja2VkTmFycmF0aW9uSWQuc2xpY2UoMCwgOCl9IGZvciAke3Nlc3Npb25LZXkuc2xpY2UoLTMyKX0gZG9lcyBub3QgbWF0Y2ggY3VycmVudGx5IGRlZmVycmVkIGlkPSR7ZGVmZXJyZWQubmFycmF0aW9uSWQuc2xpY2UoMCwgOCl9OyBhIG5ld2VyIGVudHJ5IHN1cGVyc2VkZWQgaXQsIHNraXBwaW5nYCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGxldCByZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXNvdXJjZSA9IFVSSS5wYXJzZShzZXNzaW9uS2V5KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJlc291cmNlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBuYXJyYXRhYmxlID0gcmVzb3VyY2UgPyB0aGlzLl9jdXJyZW50TmFycmF0YWJsZShyZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFuYXJyYXRhYmxlXG5cdFx0XHR8fCBuYXJyYXRhYmxlLmtpbmQgIT09IGRlZmVycmVkLmtpbmRcblx0XHRcdHx8IG5hcnJhdGFibGUudGV4dCAhPT0gZGVmZXJyZWQudGV4dFxuXHRcdFx0fHwgKGRlZmVycmVkLmtpbmQgPT09ICdjb25maXJtYXRpb24nICYmIG5hcnJhdGFibGUuY29uZmlybWF0aW9uVHlwZSAhPT0gZGVmZXJyZWQuY29uZmlybWF0aW9uVHlwZSkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBkZWZlcnJlZCBuYXJyYXRpb24gZm9yICR7c2Vzc2lvbktleS5zbGljZSgtMzIpfSBubyBsb25nZXIgd2FycmFudGVkOyBkcm9wcGluZ2ApO1xuXHRcdFx0dGhpcy5fY2xlYXJEZWZlcnJlZChzZXNzaW9uS2V5KTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFZvaWNlTmFycmF0aW9uRHJvcHBlZEV2ZW50LCBWb2ljZU5hcnJhdGlvbkRyb3BwZWRDbGFzc2lmaWNhdGlvbj4oJ3ZvaWNlTmFycmF0aW9uRHJvcHBlZCcsIHsga2luZDogZGVmZXJyZWQua2luZCwgcmVhc29uOiAnc3RhbGUnIH0pO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBUaGUgc2Vzc2lvbiBtYXkgbm8gbG9uZ2VyIGJlIHRoZSBvbmUgc2hvd24gKHRoZSB1c2VyIHN3aXRjaGVkIGF3YXkgd2hpbGVcblx0XHQvLyB0aGUgYmFja2VuZCB3YXMgYnVzeSkuIFNwZWFraW5nIG5vdyB3b3VsZCBwbGF5IHRoaXMgc2Vzc2lvbidzIGl0ZW0gb3ZlclxuXHRcdC8vIHRoZSBuZXdseSBzaG93biBzZXNzaW9uLCBieXBhc3NpbmcgdGhlIFwiYmFja2dyb3VuZCBzZXNzaW9ucyB3YWl0IHVudGlsXG5cdFx0Ly8gZm9jdXNlZFwiIHBvbGljeTsgZHJvcCBpdCBpbnN0ZWFkIC0gdGhlIGNvbmZpcm1hdGlvbi9yZXNwb25zZSBpbmRpY2F0b3JzXG5cdFx0Ly8gc3VyZmFjZSBpdCB3aGVuIHRoZSB1c2VyIGZvY3VzZXMgdGhpcyBzZXNzaW9uIGFnYWluLlxuXHRcdGlmICh0aGlzLl9zaG91bGREZWZlckZvclNlc3Npb24oc2Vzc2lvbktleSkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBkZWZlcnJlZCBuYXJyYXRpb24gZm9yICR7c2Vzc2lvbktleS5zbGljZSgtMzIpfSBubyBsb25nZXIgc2hvd247IGRyb3BwaW5nYCk7XG5cdFx0XHR0aGlzLl9jbGVhckRlZmVycmVkKHNlc3Npb25LZXkpO1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Vm9pY2VOYXJyYXRpb25Ecm9wcGVkRXZlbnQsIFZvaWNlTmFycmF0aW9uRHJvcHBlZENsYXNzaWZpY2F0aW9uPigndm9pY2VOYXJyYXRpb25Ecm9wcGVkJywgeyBraW5kOiBkZWZlcnJlZC5raW5kLCByZWFzb246ICdzZXNzaW9uX2NoYW5nZWQnIH0pO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBSZXVzZSB0aGUgaWQgb25seSBmb3IgdGhlIHNhbWUgKm9jY3VycmVuY2UqLCBzbyB0aGUgYmFja2VuZCBkZWR1cHMgYSBsb3N0XG5cdFx0Ly8gYWNrIHJhdGhlciB0aGFuIGJlaW5nIGhhbmRlZCBhbiBpZCB0aGF0IG5vdyBuYW1lcyBhIGRpZmZlcmVudCBmb3JtLiBBblxuXHRcdC8vIGludGVycnVwdGVkIG5hcnJhdGlvbiBuZXZlciByZXVzZXM6IGl0cyBpZCBpcyB0b21ic3RvbmVkLlxuXHRcdGNvbnN0IHJldXNlSWQgPSBkZWZlcnJlZC5yZXVzZU5hcnJhdGlvbklkICYmIHRoaXMuX25hcnJhdGFibGVJZGVudGl0eShuYXJyYXRhYmxlKSA9PT0gdGhpcy5fbmFycmF0YWJsZUlkZW50aXR5KGRlZmVycmVkKSA/IGRlZmVycmVkLm5hcnJhdGlvbklkIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSByZXRyeWluZyBkZWZlcnJlZCBuYXJyYXRpb24gZm9yICR7c2Vzc2lvbktleS5zbGljZSgtMzIpfSByZXVzZT0keyEhcmV1c2VJZH1gKTtcblx0XHR0aGlzLl9jbGVhckRlZmVycmVkKHNlc3Npb25LZXkpO1xuXHRcdHJldHVybiB0aGlzLl9uYXJyYXRlKHNlc3Npb25LZXksIG5hcnJhdGFibGUua2luZCwgbmFycmF0YWJsZS50ZXh0LCByZXVzZUlkLCB1bmRlZmluZWQsIG5hcnJhdGFibGUuY29uZmlybWF0aW9uVHlwZSwgbmFycmF0YWJsZS5wZW5kaW5nKTtcblx0fVxuXG5cdHByaXZhdGUgX3JldHJ5UGVuZGluZ05hcnJhdGlvbihzZXNzaW9uSWQ6IHN0cmluZywgcGVuZGluZzogSVZvaWNlTmFycmF0YWJsZSk6IGJvb2xlYW4ge1xuXHRcdGxldCByZXNvdXJjZTogVVJJO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXNvdXJjZSA9IFVSSS5wYXJzZShzZXNzaW9uSWQpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIHF1ZXVlZCBjb25maXJtYXRpb24gZm9yIGludmFsaWQgc2Vzc2lvbiBpZDsgZHJvcHBpbmdgKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX2N1cnJlbnROYXJyYXRhYmxlKHJlc291cmNlKTtcblx0XHRpZiAoIWN1cnJlbnRcblx0XHRcdHx8IGN1cnJlbnQua2luZCAhPT0gcGVuZGluZy5raW5kXG5cdFx0XHR8fCB0aGlzLl9uYXJyYXRhYmxlSWRlbnRpdHkoY3VycmVudCkgIT09IHRoaXMuX25hcnJhdGFibGVJZGVudGl0eShwZW5kaW5nKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIHF1ZXVlZCBuYXJyYXRpb24gZm9yICR7c2Vzc2lvbklkLnNsaWNlKC0zMil9IG5vIGxvbmdlciBtYXRjaGVzIGN1cnJlbnQgc3RhdGU7IGRyb3BwaW5nYCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChjdXJyZW50LmtpbmQgIT09ICdyZXNwb25zZScgJiYgdGhpcy5fc2hvdWxkRGVmZXJGb3JTZXNzaW9uKHRoaXMuX3Nlc3Npb25LZXkoc2Vzc2lvbklkKSkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBxdWV1ZWQgbmFycmF0aW9uIGZvciAke3Nlc3Npb25JZC5zbGljZSgtMzIpfSBpcyBubyBsb25nZXIgc2hvd247IGRyb3BwaW5nYCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9uYXJyYXRlKHNlc3Npb25JZCwgY3VycmVudC5raW5kLCBjdXJyZW50LnRleHQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjdXJyZW50LmNvbmZpcm1hdGlvblR5cGUsIGN1cnJlbnQucGVuZGluZyk7XG5cdH1cblxuXHQvKiogRHJvcCBhIGRlZmVycmVkIG5hcnJhdGlvbi4gKi9cblx0cHJpdmF0ZSBfY2xlYXJEZWZlcnJlZChzZXNzaW9uS2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9kZWZlcnJlZE5hcnJhdGlvbnMuZGVsZXRlKHNlc3Npb25LZXkpO1xuXHR9XG5cblx0LyoqIFRoZSBwZW5kaW5nIGl0ZW0gYSBzZXNzaW9uIHdvdWxkIG5hcnJhdGUgbm93ICh3YWl0aW5nIGNvbmZpcm1hdGlvbiBwcm9tcHQgb3IgY29tcGxldGVkIHJlcGx5IHN1bW1hcnkpLCBmcm9tIHRoZSByZXNpZGVudCBtb2RlbCBvciBjYWNoZWQgc3VtbWFyeS9zdGF0dXM7IHJldHVybnMgdW5kZWZpbmVkIChraWNraW5nIG9mZiBhIGxvYWQpIGlmIGEgY29uZmlybWF0aW9uJ3MgZGV0YWlsIGlzbid0IHJlYWR5LiAqL1xuXHRwcml2YXRlIF9jdXJyZW50TmFycmF0YWJsZShyZXNvdXJjZTogVVJJKTogSVZvaWNlTmFycmF0YWJsZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24ocmVzb3VyY2UpO1xuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0Ly8gQSBxdWVzdGlvbiBmb3JtIGlzIG5hcnJhdGVkIGZyb20gdGhlIHN0cnVjdHVyZWQgcGF5bG9hZCwgbm90IGZyb21cblx0XHRcdC8vIGBhZ2VudF9zdGF0ZV9kZXRhaWxgOiB0aGF0IHN0cmluZyBpcyBqdXN0IHRoZSBxdWVzdGlvbiB0aXRsZXMsIHNvIHRoZVxuXHRcdFx0Ly8gdXNlciB3b3VsZCBoZWFyIHdoYXQgdGhleSBhcmUgYmVpbmcgYXNrZWQgd2l0aG91dCBoZWFyaW5nIHRoZSBvcHRpb25zXG5cdFx0XHQvLyB0aGV5IGFyZSBtZWFudCB0byBwaWNrIGZyb20uXG5cdFx0XHRjb25zdCBxdWVzdGlvbiA9IHRoaXMuX3F1ZXN0aW9uTmFycmF0YWJsZShtb2RlbCk7XG5cdFx0XHRpZiAocXVlc3Rpb24pIHtcblx0XHRcdFx0cmV0dXJuIHF1ZXN0aW9uO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW5mbyA9IHRoaXMuX2dldEFnZW50U3RhdGVJbmZvKG1vZGVsKTtcblx0XHRcdGlmIChpbmZvLnN0YXRlID09PSAnd2FpdGluZ19mb3JfY29uZmlybWF0aW9uJyAmJiBpbmZvLmRldGFpbCkge1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnY29uZmlybWF0aW9uJywgdGV4dDogaW5mby5kZXRhaWwsIGNvbmZpcm1hdGlvblR5cGU6IGluZm8uY29uZmlybWF0aW9uX3R5cGUgfTtcblx0XHRcdH1cblx0XHRcdGlmIChpbmZvLnN0YXRlID09PSAnaWRsZScgJiYgaW5mby5sYXN0X3Jlc3BvbnNlX3N1bW1hcnkpIHtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ3Jlc3BvbnNlJywgdGV4dDogaW5mby5sYXN0X3Jlc3BvbnNlX3N1bW1hcnkgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnNlc3Npb25zLmZpbmQocyA9PiAhcy5pc0FyY2hpdmVkKCkgJiYgaXNFcXVhbChzLnJlc291cmNlLCByZXNvdXJjZSkpO1xuXHRcdGlmIChzZXNzaW9uPy5zdGF0dXMgPT09IEFnZW50U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0KSB7XG5cdFx0XHQvLyBEZXRhaWwgbGl2ZXMgb24gdGhlIG1vZGVsOyBsb2FkIGl0IGFuZCBsZXQgdGhlIHN0YXRlLWNoYW5nZSBwYXRoIG5hcnJhdGUgb25jZSBpdCByZW5kZXJzLlxuXHRcdFx0dGhpcy5fZW5zdXJlTW9kZWxMb2FkZWQocmVzb3VyY2UpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHNlc3Npb24/LnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCkge1xuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IHRoaXMuX2xhc3RSZXNwb25zZVN1bW1hcnlCeUlkLmdldChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGlmIChzdW1tYXJ5KSB7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdyZXNwb25zZScsIHRleHQ6IHN1bW1hcnkgfTtcblx0XHRcdH1cblx0XHRcdC8vIFRoZSByZXBseSBzdW1tYXJ5IGxpdmVzIG9uIHRoZSBtb2RlbCBhbmQgd2Fzbid0IGNhY2hlZCAodGhlIHNlc3Npb25cblx0XHRcdC8vIG5ldmVyIHdlbnQgcmVzaWRlbnQgdGhpcyB0dXJuLCBlLmcuIGEgcmVtb3RlL0NvcGlsb3QgcmVwbHkgdGhhdFxuXHRcdFx0Ly8gY29tcGxldGVkIHdoaWxlIHVuZm9jdXNlZCkuIExvYWQgaXQgYW5kIGxldCB0aGUgb24tZm9jdXMgcmUtYWN0aXZhdGlvblxuXHRcdFx0Ly8gaW4gX2Vuc3VyZU1vZGVsTG9hZGVkIG5hcnJhdGUgaXQgb25jZSBpdCByZW5kZXJzIC0gbWlycm9ycyB0aGVcblx0XHRcdC8vIE5lZWRzSW5wdXQgYnJhbmNoIGFib3ZlIHNvIGEgY29tcGxldGVkIGJhY2tncm91bmQgcmVwbHkgaXMgcmVhZCB3aGVuXG5cdFx0XHQvLyBmb2N1c2VkIGluc3RlYWQgb2Ygc3RheWluZyBzaWxlbnQuXG5cdFx0XHR0aGlzLl9lbnN1cmVNb2RlbExvYWRlZChyZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBpZCBvZiB0aGUgcGVuZGluZyBpdGVtIGEgc2Vzc2lvbiBpcyBzaG93aW5nIHJpZ2h0IG5vdywgb3IgYCcnYC5cblx0ICpcblx0ICogVXNlZCBhcyBhIHBlci1vY2N1cnJlbmNlIGZpbmdlcnByaW50IGluIHN0YXRlLXRyYW5zaXRpb24gZGV0ZWN0aW9uOiB0aGVcblx0ICogcHJvc2UgYGRldGFpbGAgdHdvIGZvcm1zIHByb2R1Y2UgY2FuIGJlIGlkZW50aWNhbCwgc28gd2l0aG91dCB0aGlzLFxuXHQgKiByZXBsYWNpbmcgb25lIGZvcm0gd2l0aCBhbm90aGVyIGluc2lkZSBgd2FpdGluZ19mb3JfY29uZmlybWF0aW9uYCBsb29rc1xuXHQgKiBsaWtlIG5vIGNoYW5nZSBhdCBhbGwgYW5kIGlzIG5ldmVyIG5hcnJhdGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfcGVuZGluZ0lkRm9yKHNlc3Npb25JZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHQvLyBPbmx5IG1lYW5pbmdmdWwgd2hpbGUgYSBzZXNzaW9uIGlzIHNob3dpbmcgYSBwZW5kaW5nIGl0ZW07IGNhbGxlcnMgc2tpcFxuXHRcdC8vIGl0IG90aGVyd2lzZSByYXRoZXIgdGhhbiB3YWxrIGEgc2V0dGxlZCByZXNwb25zZSdzIHBhcnRzIGZvciBub3RoaW5nLlxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWxGb3JTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIChtb2RlbCA/IHRoaXMuX2J1aWxkUGVuZGluZ1BheWxvYWQobW9kZWwpPy5wZW5kaW5nX2lkIDogdW5kZWZpbmVkKSA/PyAnJztcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgaWRlbnRpdHkgb2Ygb25lICpvY2N1cnJlbmNlKiBvZiBhIG5hcnJhdGFibGUgaXRlbSwgZm9yIGRlZHVwLlxuXHQgKlxuXHQgKiBUd28gZm9ybXMgY2FuIGFzayB0aGUgc2FtZSBxdWVzdGlvbnMgYW5kIHR3byB0b29scyBjYW4gcmFpc2UgdGhlIHNhbWVcblx0ICogcHJvbXB0LCBzbyBrZXlpbmcgXCJhbHJlYWR5IGhlYXJkXCIgb24gdGV4dCBhbG9uZSBzd2FsbG93cyB0aGUgc2Vjb25kIG9uZS5cblx0ICogVGV4dCBpcyBvbmx5IGEgZmFsbGJhY2sgZm9yIG5hcnJhdGFibGVzIHdpdGggbm8gc3RydWN0dXJlZCBwZW5kaW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBfbmFycmF0YWJsZUlkZW50aXR5KG5hcnJhdGFibGU6IHsgdGV4dDogc3RyaW5nOyBwZW5kaW5nPzogeyBwZW5kaW5nSWQ6IHN0cmluZyB9OyBjb25maXJtYXRpb25UeXBlPzogVm9pY2VDb25maXJtYXRpb25UeXBlIH0pOiBzdHJpbmcge1xuXHRcdHJldHVybiBuYXJyYXRhYmxlLnBlbmRpbmcgPyBgIyR7bmFycmF0YWJsZS5wZW5kaW5nLnBlbmRpbmdJZH1gIDogYCR7bmFycmF0YWJsZS5jb25maXJtYXRpb25UeXBlID8/ICcnfToke25hcnJhdGFibGUudGV4dH1gO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBzcG9rZW4gZm9ybSBvZiBhIHNlc3Npb24ncyBwZW5kaW5nIHF1ZXN0aW9uIGZvcm0sIGlmIGl0IGhhcyBvbmUuXG5cdCAqXG5cdCAqIFRoaXMgYXNrcyBmb3IgKnRoZSBmb3JtKiwgbm90IGEgcGFydGljdWxhciBxdWVzdGlvbiBpbiBpdDogdGhlIGJhY2tlbmQgb3duc1xuXHQgKiB0aGUgZHJhZnQgb2YgYW5zd2VycyBzbyBmYXIsIHNvIG9ubHkgaXQga25vd3Mgd2hpY2ggcXVlc3Rpb24gdGhlIGZvcm0gaXNcblx0ICogd2FpdGluZyBvbi4gTmFtaW5nIG9uZSBoZXJlIHdvdWxkIGxlYXZlIGEgcGFydGlhbGx5IGFuc3dlcmVkIGZvcm0gc2lsZW50LFxuXHQgKiBzaW5jZSB0aGUgY2xpZW50IG9ubHkgZXZlciBzZWVzIHF1ZXN0aW9uIDEuIFRoZSB0ZXh0IGlzIHVzZWQgZHVyaW5nIHRoZVxuXHQgKiBkZWJvdW5jZSB3aW5kb3cgYmVmb3JlIHRoZSBiYWNrZW5kJ3MgbWlycm9yIGNhdGNoZXMgdXAsIHdoaWNoIGlzIGJ5XG5cdCAqIGRlZmluaXRpb24gZmlyc3Qgc2lnaHRpbmcuXG5cdCAqL1xuXHRwcml2YXRlIF9xdWVzdGlvbk5hcnJhdGFibGUobW9kZWw6IElDaGF0TW9kZWwgfCB1bmRlZmluZWQgfCBudWxsKTogeyBraW5kOiAncXVlc3Rpb24nOyB0ZXh0OiBzdHJpbmc7IHBlbmRpbmc6IHsgcGVuZGluZ0lkOiBzdHJpbmcgfSB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwZW5kaW5nID0gbW9kZWwgPyB0aGlzLl9idWlsZFBlbmRpbmdQYXlsb2FkKG1vZGVsKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBxdWVzdGlvbiA9IHBlbmRpbmc/LnR5cGUgPT09ICdxdWVzdGlvbnMnID8gcGVuZGluZy5xdWVzdGlvbnM/LlswXSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXBlbmRpbmcgfHwgIXF1ZXN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ3F1ZXN0aW9uJyxcblx0XHRcdHRleHQ6IGZvcm1hdFF1ZXN0aW9uUHJvbXB0KHF1ZXN0aW9uLCBwZW5kaW5nLmFsbG93X3NraXAgPT09IHRydWUpLFxuXHRcdFx0cGVuZGluZzogeyBwZW5kaW5nSWQ6IHBlbmRpbmcucGVuZGluZ19pZCB9LFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogVHJ1ZSB3aGVuIGEgc2Vzc2lvbiBpcyBhd2FpdGluZyBjb25maXJtYXRpb24gYnV0IGl0cyBjb25maXJtYXRpb24gZGV0YWlsIGlzXG5cdCAqIG5vdCB5ZXQgYXZhaWxhYmxlIChtb2RlbCBub3QgbG9hZGVkLCBvciB0aGUgcGVuZGluZy1jb25maXJtYXRpb24gcGFydCBoYXNuJ3Rcblx0ICogcmVuZGVyZWQpLiBVc2VkIHRvIGF2b2lkIG5hcnJhdGluZyBhIGRldGFpbC1sZXNzIGNvbmZpcm1hdGlvbiBvbiB0aGUgZmlyc3Rcblx0ICogY29udGV4dCBzZW5kIGZvbGxvd2VkIGJ5IHRoZSBkZXRhaWxlZCBvbmUgbW9tZW50cyBsYXRlci5cblx0ICovXG5cdHByaXZhdGUgX2NvbmZpcm1hdGlvbkRldGFpbFBlbmRpbmcocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnNlc3Npb25zLmZpbmQocyA9PiAhcy5pc0FyY2hpdmVkKCkgJiYgaXNFcXVhbChzLnJlc291cmNlLCByZXNvdXJjZSkpO1xuXHRcdGlmICghc2Vzc2lvbiB8fCBzZXNzaW9uLnN0YXR1cyAhPT0gQWdlbnRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24ocmVzb3VyY2UpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBpbmZvID0gdGhpcy5fZ2V0QWdlbnRTdGF0ZUluZm8obW9kZWwpO1xuXHRcdHJldHVybiBpbmZvLnN0YXRlICE9PSAnd2FpdGluZ19mb3JfY29uZmlybWF0aW9uJyB8fCAhaW5mby5kZXRhaWw7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHNlc3Npb24gdGhlIHVzZXIgaXMgYWN0aXZlbHkgd29ya2luZyB3aXRoIGZvciB0aGUgcHVycG9zZSBvZiByb3V0aW5nXG5cdCAqIHZvaWNlIGF1ZGlvOiB0aGUgZXhwbGljaXRseSB0YXJnZXRlZCBzZXNzaW9uIGlmIG9uZSBpcyBzZXQsIG90aGVyd2lzZSB0aGVcblx0ICogc2Vzc2lvbiBtb3N0IHJlY2VudGx5IHNob3duIHRvIHRoZSB1c2VyIChhY3Jvc3MgYWxsIHdpZGdldHMsIHNvIGFuIG9wZW5lZFxuXHQgKiBzZXNzaW9uIHRoYXQgaGFzbid0IHRha2VuIERPTSBmb2N1cyBzdGlsbCBjb3VudHMpLCBmYWxsaW5nIGJhY2sgdG8gdGhlIHJhd1xuXHQgKiBmb2N1c2VkIHdpZGdldC4gVGhpcyBtaXJyb3JzIGhvdyBgX2J1aWxkU2Vzc2lvbkNvbnRleHRgIGNvbXB1dGVzIHRoZVxuXHQgKiBiYWNrZW5kJ3MgYGlzX2FjdGl2ZWAgc2Vzc2lvbiwgc28gcGxheWJhY2sgYW5kIHRoZSBiYWNrZW5kIGFncmVlIG9uIHdoaWNoXG5cdCAqIHNlc3Npb24gaXMgXCJhY3RpdmVcIiBhbmQgZXZlcnl0aGluZyBlbHNlIGlzIGEgYmFja2dyb3VuZCBuYXJyYXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRBY3RpdmVTZXNzaW9uSWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fZXh0ZXJuYWxBY3RpdmVTZXNzaW9uTW9kZSkge1xuXHRcdFx0Ly8gRW1iZWRkZXIgaXMgYXV0aG9yaXRhdGl2ZTsgaWdub3JlIHBvbGx1dGVkIGZvY3VzL2xhc3Qtc2hvd24gaGV1cmlzdGljcy5cblx0XHRcdHJldHVybiB0aGlzLl90YXJnZXRTZXNzaW9uLmdldCgpPy50b1N0cmluZygpID8/IHRoaXMuX2FjdGl2ZVNlc3Npb25TaG93bjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3RhcmdldFNlc3Npb24uZ2V0KCk/LnRvU3RyaW5nKCkgPz8gdGhpcy5fYWN0aXZlU2Vzc2lvblNob3duID8/IHRoaXMuX2xhc3RTaG93blNlc3Npb25JZCA/PyB0aGlzLl9nZXRGb2N1c2VkU2Vzc2lvbklkKCk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHNlc3Npb24gdGhlIHVzZXIgaXMgY3VycmVudGx5IGxvb2tpbmcgYXQsIHVzZWQgdG8gcm91dGUgZGVmZXJyYWwgYW5kXG5cdCAqIGRlY2lkZSB3aGljaCBjb21wbGV0aW9ucyBuYXJyYXRlIGltbWVkaWF0ZWx5IHZzLiBkZWZlciArIGluZGljYXRlLlxuXHQgKlxuXHQgKiBJbiBmb2N1cy1iYXNlZCAobWFpbi13aW5kb3cpIG1vZGUgdGhpcyBpcyB0aGUgTElWRSBmb2N1c2VkIHNlc3Npb24sIE5PVCB0aGVcblx0ICogc3RpY2t5IGBfbGFzdFNob3duU2Vzc2lvbklkYDogdGhhdCBmaWVsZCBpcyB1cGRhdGVkIGJ5IGFueSB0cmFja2VkIGNoYXRcblx0ICogd2lkZ2V0J3Mgdmlldy1tb2RlbCBzd2FwIChzZWUgYF90cmFja1dpZGdldFNlc3Npb25gKSwgc28gd2hpbGUgdGhlIGJhY2tlbmRcblx0ICogd29ya3MgYSBiYWNrZ3JvdW5kIHNlc3Npb24gaXQgY2FuIHRyYW5zaWVudGx5IHBvaW50IHRoZXJlIGFuZCBtYWtlIHRoYXRcblx0ICogc2Vzc2lvbiBsb29rIFwic2hvd25cIiAtIHdoaWNoIHN1cHByZXNzZWQgZGVmZXJyYWwsIHRoZSBwZW5kaW5nIGluZGljYXRvciwgYW5kXG5cdCAqIG9uLWZvY3VzIHBsYXliYWNrIGZvciByZXNwb25zZXMuIFRoZSBjb25maXJtYXRpb24gaW5kaWNhdG9yIGhhcyBhbHdheXMgdXNlZFxuXHQgKiBsaXZlIGZvY3VzIChzZWUgYF9yZWNvbmNpbGVDb25maXJtYXRpb25JbmRpY2F0b3JzYCkgYW5kIHdvcmtlZCBjb3JyZWN0bHk7XG5cdCAqIHRoaXMga2VlcHMgcmVzcG9uc2VzIGNvbnNpc3RlbnQgd2l0aCBpdC4gT3BlbmluZyBhIHNlc3Npb24gc3RpbGwgZmx1c2hlcyBpdHNcblx0ICogYnVmZmVyIGRpcmVjdGx5IHZpYSBgX29uU2Vzc2lvblNob3duYCwgc28gdGhlIHN0aWNreSB2YWx1ZSBpc24ndCBuZWVkZWQgaGVyZS5cblx0ICogVW5saWtlIHtAbGluayBfZ2V0QWN0aXZlU2Vzc2lvbklkfSBpdCBpZ25vcmVzIHRoZSBzdGlja3kgaW5wdXRcblx0ICogYF90YXJnZXRTZXNzaW9uYCAod2hlcmUgdGhlIG5leHQgdXR0ZXJhbmNlIGlzIHNlbnQsIG5vdCB3aGF0IGlzIHZpZXdlZCkuXG5cdCAqL1xuXHRwcml2YXRlIF9zaG93blNlc3Npb25JZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9leHRlcm5hbEFjdGl2ZVNlc3Npb25Nb2RlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlU2Vzc2lvblNob3duO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZ2V0Rm9jdXNlZFNlc3Npb25JZCgpO1xuXHR9XG5cblx0c2V0QWN0aXZlU2Vzc2lvblNob3duKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSByZXNvdXJjZT8udG9TdHJpbmcoKTtcblx0XHQvLyBgdW5kZWZpbmVkYCBtZWFucyB0aGUgZW1iZWRkZXIgaGFzIG5vIGFjdGl2ZSBzZXNzaW9uIHRvIHBpbiAoZS5nLiBhXG5cdFx0Ly8gZHJhZnQgY29tcG9zZXIpLiBQZXIgdGhlIGludGVyZmFjZSBjb250cmFjdCB0aGlzIFJFU1RPUkVTIGZvY3VzLWJhc2VkXG5cdFx0Ly8gZGV0ZWN0aW9uOiBsZWF2aW5nIGV4dGVybmFsIG1vZGUgb24gd2hpbGUgYmxhbmtpbmcgYF9hY3RpdmVTZXNzaW9uU2hvd25gXG5cdFx0Ly8gd291bGQgd2VkZ2UgbmFycmF0aW9uIC0gYF9zaG93blNlc3Npb25JZCgpYCByZXR1cm5zIHVuZGVmaW5lZCwgc28gbm9cblx0XHQvLyBzZXNzaW9uIGlzIGV2ZXIgXCJzaG93blwiLCBldmVyeSB0YWdnZWQgcmVwbHkgZGVmZXJzIGZvcmV2ZXIsIGFuZCBib3RoXG5cdFx0Ly8gZm9jdXMgcGF0aHMgc3RheSBnYXRlZCBvZmYuIFJlc2V0IHRvIGZvY3VzLWJhc2VkIGluc3RlYWQuXG5cdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0aWYgKCF0aGlzLl9leHRlcm5hbEFjdGl2ZVNlc3Npb25Nb2RlICYmIHRoaXMuX2FjdGl2ZVNlc3Npb25TaG93biA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBzZXRBY3RpdmVTZXNzaW9uU2hvd249PG5vbmU+OyByZXN0b3JpbmcgZm9jdXMtYmFzZWQgZGV0ZWN0aW9uICh3YXMgJHt0aGlzLl9hY3RpdmVTZXNzaW9uU2hvd24gPz8gJzxub25lPid9KWApO1xuXHRcdFx0dGhpcy5fZXh0ZXJuYWxBY3RpdmVTZXNzaW9uTW9kZSA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fYWN0aXZlU2Vzc2lvblNob3duID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fb25Gb2N1c2VkU2Vzc2lvbkNoYW5nZWQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZXh0ZXJuYWxBY3RpdmVTZXNzaW9uTW9kZSA9IHRydWU7XG5cdFx0Y29uc3QgZGVmaW5lZEtleSA9IGtleSE7XG5cdFx0aWYgKHRoaXMuX2lzU2FtZVNlc3Npb24oZGVmaW5lZEtleSwgdGhpcy5fYWN0aXZlU2Vzc2lvblNob3duKSkge1xuXHRcdFx0Ly8gU2FtZSBzZXNzaW9uIHJlLXBpbm5lZC4gTm9ybWFsbHkgYWxyZWFkeSBhY3RpdmF0ZWQsIGJ1dCBpdHMgcGVuZGluZ1xuXHRcdFx0Ly8gaXRlbSBtYXkgc3RpbGwgYmUgdW5oZWFyZDogYSByZXNwb25zZSBjYW4gYXJyaXZlLWFuZC1kZWZlciBmb3IgaXRcblx0XHRcdC8vIEFGVEVSIGl0IGJlY2FtZSBhY3RpdmUgKGJhY2tlbmQgdGFnZ2VkIGl0IHdpdGggYSBub3QteWV0LWFsaWFzZWQgYmFyZVxuXHRcdFx0Ly8gaWQsIHNvIHRoZSBkZWZlciBkZWNpc2lvbiBjb3VsZG4ndCB0ZWxsIGl0IHdhcyB0aGUgc2hvd24gc2Vzc2lvbiksIG9yXG5cdFx0XHQvLyBhIGNvbXBsZXRlZCBiYWNrZ3JvdW5kIHJlcGx5IC8gY29uZmlybWF0aW9uIGNhbiBiZSBwZW5kaW5nLiBSZS1hY3RpdmF0ZVxuXHRcdFx0Ly8gc28gYW55IHN0cmFuZGVkIGJ1ZmZlciwgcGVuZGluZyBzdW1tYXJ5LCBvciBwZW5kaW5nIGNvbmZpcm1hdGlvblxuXHRcdFx0Ly8gcmVzb2x2ZXMgYW5kIGlzIGhlYXJkLCByYXRoZXIgdGhhbiBiZWluZyBzaWxlbnRseSBzdHVjay5cblx0XHRcdGNvbnN0IHNlc3Npb25LZXkgPSB0aGlzLl9zZXNzaW9uS2V5KGRlZmluZWRLZXkpO1xuXHRcdFx0aWYgKHRoaXMuX3BlbmRpbmdPd25lZChzZXNzaW9uS2V5KSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFt2b2ljZV0gcmUtcGlubmVkIGFjdGl2ZSBzZXNzaW9uPSR7ZGVmaW5lZEtleX0gaGFzIHBlbmRpbmcgdm9pY2Ugd29yazsgcmUtYWN0aXZhdGluZ2ApO1xuXHRcdFx0XHR0aGlzLl9hY3RpdmF0ZVNob3duU2Vzc2lvbihyZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBzZXRBY3RpdmVTZXNzaW9uU2hvd249JHtkZWZpbmVkS2V5fSAod2FzICR7dGhpcy5fYWN0aXZlU2Vzc2lvblNob3duID8/ICc8bm9uZT4nfSlgKTtcblx0XHR0aGlzLl9hY3RpdmVTZXNzaW9uU2hvd24gPSBkZWZpbmVkS2V5O1xuXHRcdC8vIFJvdXRlIGF1ZGlvIGhlcmUgbm93OiBmbHVzaCBidWZmZXJzLCBjbGVhciBwZW5kaW5nLCBhbmQgcmUtc2VuZCBjb250ZXh0LlxuXHRcdHRoaXMuX2FjdGl2YXRlU2hvd25TZXNzaW9uKHJlc291cmNlKTtcblx0fVxuXG5cdGFjdGl2YXRlU2Vzc2lvbihyZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFt2b2ljZV0gYWN0aXZhdGVTZXNzaW9uPSR7a2V5fSAoZXhwbGljaXQgVUkgYWN0aW9uKWApO1xuXHRcdC8vIEluIGVtYmVkZGVyLWRyaXZlbiAoQWdlbnRzKSBtb2RlLCByb3V0aW5nIGZvbGxvd3MgX2FjdGl2ZVNlc3Npb25TaG93biwgc29cblx0XHQvLyBwaW4gaXQgaGVyZSB0b28gLSBvdGhlcndpc2UgYSBjbGljayBvbiBhbiBhbHJlYWR5LWFjdGl2ZSBzZXNzaW9uICh3aG9zZVxuXHRcdC8vIGFjdGl2ZVNlc3Npb24gb2JzZXJ2YWJsZSBkaWRuJ3QgY2hhbmdlLCBzbyBzZXRBY3RpdmVTZXNzaW9uU2hvd24gd2FzIG5ldmVyXG5cdFx0Ly8gcmUtY2FsbGVkKSB3b3VsZCBmbHVzaC9uYXJyYXRlIGJ1dCBhdWRpbyByb3V0aW5nIHdvdWxkbid0IHBvaW50IGhlcmUuXG5cdFx0aWYgKHRoaXMuX2V4dGVybmFsQWN0aXZlU2Vzc2lvbk1vZGUpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZVNlc3Npb25TaG93biA9IGtleTtcblx0XHR9XG5cdFx0dGhpcy5fYWN0aXZhdGVTaG93blNlc3Npb24ocmVzb3VyY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJvdXRpbmcgZGVjaXNpb24gZm9yIG9uZSBhdWRpby1yZXNwb25zZSBjaHVuay4gV2hlbiB0aGUgYmFja2VuZCBlY2hvZXMgYVxuXHQgKiBwZXItcmVzcG9uc2UgaWQsIGRlY2lkZSB0aGUgd2hvbGUgcmVzcG9uc2UncyBmYXRlIG9uY2UgKG9uIGl0cyBmaXJzdCBjaHVuayksXG5cdCAqIHN0b3JlIGl0IGluIHtAbGluayBfcmVzcG9uc2VSb3V0ZXN9LCBhbmQgbWFrZSBldmVyeSBsYXRlciBjaHVuayBvZiB0aGF0IGlkXG5cdCAqIGZvbGxvdyBpdCAtIHNvIGludGVybGVhdmVkIHJlc3BvbnNlcyBmb3IgZGlmZmVyZW50IHNlc3Npb25zIG5ldmVyIHN0ZWFsIGVhY2hcblx0ICogb3RoZXIncyByb3V0aW5nIGFuZCBhIHJlc3BvbnNlIGlzIG5ldmVyIHNwbGl0LiBXaXRob3V0IGEgcmVzcG9uc2VJZCwgZGVmZXJcblx0ICogdG8gdGhlIGxlZ2FjeSBzZXNzaW9uLWtleWVkIHtAbGluayBfc2hvdWxkRGVmZXJSZXNwb25zZX0uXG5cdCAqL1xuXHRwcml2YXRlIF9zaG91bGREZWZlclJlc3BvbnNlU3RyZWFtKHJlc3BvbnNlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgc2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGlzRmlyc3RDaHVuazogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGlmICghcmVzcG9uc2VJZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Nob3VsZERlZmVyUmVzcG9uc2Uoc2Vzc2lvbklkLCBpc0ZpcnN0Q2h1bmspO1xuXHRcdH1cblx0XHRjb25zdCBrbm93biA9IHRoaXMuX3Jlc3BvbnNlUm91dGVzLmdldChyZXNwb25zZUlkKTtcblx0XHRpZiAoa25vd24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gRXZlcnkgY2h1bmsgYWZ0ZXIgdGhlIGZpcnN0IGZvbGxvd3MgdGhlIGZpcnN0IGNodW5rJ3MgZGVjaXNpb24sIGV2ZW5cblx0XHRcdC8vIGlmIGZvY3VzIGNoYW5nZWQgbWVhbndoaWxlIChhIGZvY3VzIGNoYW5nZSBwcm9tb3RlcyB2aWEgdGhlIGZsdXNoXG5cdFx0XHQvLyBwYXRoLCB3aGljaCByZXdyaXRlcyB0aGUgcm91dGUgdG8gJ2xpdmUnKS5cblx0XHRcdHJldHVybiBrbm93biA9PT0gJ2RlZmVycmVkJztcblx0XHR9XG5cdFx0Y29uc3QgZGVmZXIgPSB0aGlzLl9zaG91bGREZWZlckZvclNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHR0aGlzLl9yZXNwb25zZVJvdXRlcy5zZXQocmVzcG9uc2VJZCwgZGVmZXIgPyAnZGVmZXJyZWQnIDogJ2xpdmUnKTtcblx0XHRyZXR1cm4gZGVmZXI7XG5cdH1cblxuXHQvKiogV2hldGhlciB0d28gc2Vzc2lvbiBpZHMgcmVmZXIgdG8gdGhlIHNhbWUgc2Vzc2lvbiwgdG9sZXJhbnQgb2YgdGhlIHR3byBpZFxuXHQgKiAgc3BhY2VzIChiYXJlIGJhY2tlbmQgaWQgdnMgVUkgcmVzb3VyY2UpIGFuZCB0cml2aWFsIHNlcmlhbGl6YXRpb25cblx0ICogIGRpZmZlcmVuY2VzLiBNaXJyb3JzIHRoZSBtYXRjaGluZyB1c2VkIHRvIGZsdXNoIGJ1ZmZlcmVkIHJlc3BvbnNlcyBzbyB0aGVcblx0ICogIGRlZmVyIGRlY2lzaW9uIGFuZCB0aGUgZmx1c2ggYWdyZWUgb24gaWRlbnRpdHkuICovXG5cdHByaXZhdGUgX2lzU2FtZVNlc3Npb24oYTogc3RyaW5nIHwgdW5kZWZpbmVkLCBiOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoIWEgfHwgIWIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGEgPT09IGIgfHwgdGhpcy5fY2Fub25pY2FsU2Vzc2lvbklkKGEpID09PSB0aGlzLl9jYW5vbmljYWxTZXNzaW9uSWQoYikpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGlzRXF1YWwoVVJJLnBhcnNlKGEpLCBVUkkucGFyc2UoYikpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBBbGlhcy1hd2FyZSByZWFkIG9mIHRoZSBsYXN0IHRleHQgbmFycmF0ZWQgZm9yIGEgc2Vzc2lvbiwgdXNlZCBmb3Jcblx0ICogIGV4YWN0bHktb25jZSBkZWR1cGUuICovXG5cdHByaXZhdGUgX2dldExhc3ROYXJyYXRlZFRleHQoc2Vzc2lvbklkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9sYXN0TmFycmF0ZWRUZXh0LmdldCh0aGlzLl9zZXNzaW9uS2V5KHNlc3Npb25JZCkpO1xuXHR9XG5cblx0LyoqIENsZWFyIHRoZSBsYXN0LW5hcnJhdGVkIGRlZHVwZSBmb3IgYSBzZXNzaW9uLiAqL1xuXHRwcml2YXRlIF9jbGVhckxhc3ROYXJyYXRlZFRleHQoc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9sYXN0TmFycmF0ZWRUZXh0LmRlbGV0ZSh0aGlzLl9zZXNzaW9uS2V5KHNlc3Npb25JZCkpO1xuXHR9XG5cblx0LyoqIFdoZXRoZXIgYSByZXNwb25zZSBmb3IgYHNlc3Npb25JZGAgc2hvdWxkIGRlZmVyOiB0cnVlIHVubGVzcyBpdCBpcyB0aGVcblx0ICogIHNlc3Npb24gY3VycmVudGx5IHNob3duIHRvIHRoZSB1c2VyICh1bnRhZ2dlZCBhdWRpbyBcdTIxOTIgcGxheSkuIEEgcmVwbHkgdGhlXG5cdCAqICB1c2VyIGlzIGF3YWl0aW5nIGlzIE5PVCBleGVtcHRlZDogaWYgdGhleSBzd2l0Y2hlZCBhd2F5IGJlZm9yZSBpdCBhcnJpdmVkLFxuXHQgKiAgaXQgaXMgZGVmZXJyZWQgbGlrZSBhbnkgb3RoZXIgYmFja2dyb3VuZCBuYXJyYXRpb24gYW5kIGZsdXNoZWQgb24gcmV0dXJuLiAqL1xuXHRwcml2YXRlIF9zaG91bGREZWZlckZvclNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoIXNlc3Npb25JZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gIXRoaXMuX2lzU2FtZVNlc3Npb24odGhpcy5fc2hvd25TZXNzaW9uSWQoKSwgc2Vzc2lvbklkKTtcblx0fVxuXG5cdC8qKiBUcnVlIHdoZW4gb25lIG9mIHRoZSBzZXNzaW9uJ3MgYnVmZmVyZWQgcmVzcG9uc2VzIGlzIHRoZSBTQU1FIHN0cmVhbSBhc1xuXHQgKiAgYHJlc3BvbnNlSWRgIChzbyBhIGxpdmUgY2h1bmsgZm9yIGl0IGlzIGEgcHJvbW90aW9uLCBub3QgYSBuZXcgcmVzcG9uc2UpLiAqL1xuXHRwcml2YXRlIF9kZWZlcnJlZEJ1ZmZlckhhc1Jlc3BvbnNlKHNlc3Npb25JZDogc3RyaW5nLCByZXNwb25zZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoIXJlc3BvbnNlSWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2RlZmVycmVkUmVzcG9uc2VzLmdldChzZXNzaW9uSWQpPy5zb21lKHIgPT4gci5yZXNwb25zZUlkID09PSByZXNwb25zZUlkKSA/PyBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIHJlc3BvbnNlIGlzIGRlZmVycmVkIHdoZW4gaXQgaXMgYSBiYWNrZ3JvdW5kIG5hcnJhdGlvbiBmb3IgYSBzZXNzaW9uIHRoZVxuXHQgKiB1c2VyIGlzIE5PVCBsb29raW5nIGF0LiBJdCBwbGF5cyBpbW1lZGlhdGVseSBvbmx5IGZvciB0aGUgc2hvd24gc2Vzc2lvbiAob3Jcblx0ICogd2hlbiBpdCBpcyB1bnRhZ2dlZCBhdWRpbyk7IGEgcmVwbHkgdGhlIHVzZXIgd2FzIGF3YWl0aW5nIGJ1dCBoYXMgc2luY2Vcblx0ICogc3dpdGNoZWQgYXdheSBmcm9tIGlzIGRlZmVycmVkIGxpa2UgYW55IG90aGVyIGJhY2tncm91bmQgbmFycmF0aW9uLlxuXHQgKlxuXHQgKiBUaGUgZGVjaXNpb24gaXMgbWFkZSBvbiB0aGUgZmlyc3QgY2h1bmsgYW5kIHJlY29yZGVkIGluIGBfbGl2ZVJlcGx5S2V5c2A7XG5cdCAqIHJlbWFpbmluZyBjaHVua3MgZm9sbG93IHRoZSBzYW1lIGRlY2lzaW9uIHNvIGEgcmVzcG9uc2UgaXMgbmV2ZXIgc3BsaXRcblx0ICogYmV0d2VlbiBwbGF5YmFjayBhbmQgdGhlIGRlZmVycmVkIGJ1ZmZlci4gVGhpcyBzZXNzaW9uLWtleWVkIGhldXJpc3RpYyBpc1xuXHQgKiB0aGUgZmFsbGJhY2sgZm9yIGJhY2tlbmRzIHRoYXQgZG9uJ3QgZWNobyBhIHBlci1yZXNwb25zZSBpZDsgd2hlbiB0aGV5IGRvLFxuXHQgKiB7QGxpbmsgX3Nob3VsZERlZmVyUmVzcG9uc2VTdHJlYW19IHJvdXRlcyBieSB0aGF0IGlkIGluc3RlYWQuXG5cdCAqL1xuXHRwcml2YXRlIF9zaG91bGREZWZlclJlc3BvbnNlKHNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBpc0ZpcnN0Q2h1bms6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRjb25zdCBrZXkgPSBzZXNzaW9uSWQgPyB0aGlzLl9zZXNzaW9uS2V5KHNlc3Npb25JZCkgOiAnJztcblx0XHRpZiAoaXNGaXJzdENodW5rKSB7XG5cdFx0XHQvLyBVbnRhZ2dlZCBhdWRpbyBjYW4ndCBiZSBhdHRyaWJ1dGVkIHRvIGEgc2Vzc2lvbiBcdTIwMTQgYWx3YXlzIHBsYXkgaXQuXG5cdFx0XHRpZiAoIXNlc3Npb25JZCkge1xuXHRcdFx0XHR0aGlzLl9saXZlUmVwbHlLZXlzLmFkZChrZXkpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHQvLyBQbGF5IGxpdmUgb25seSBmb3IgdGhlIHNob3duIHNlc3Npb247IGRlZmVyIHRoZSByZXN0LlxuXHRcdFx0aWYgKCF0aGlzLl9zaG91bGREZWZlckZvclNlc3Npb24oc2Vzc2lvbklkKSkge1xuXHRcdFx0XHR0aGlzLl9saXZlUmVwbHlLZXlzLmFkZChrZXkpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9saXZlUmVwbHlLZXlzLmRlbGV0ZShrZXkpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gQ29udGludWF0aW9uIGNodW5rOiBzdGF5IGNvbnNpc3RlbnQgd2l0aCBob3cgdGhpcyByZXNwb25zZSBzdGFydGVkLlxuXHRcdGlmICh0aGlzLl9kZWZlcnJlZFJlc3BvbnNlcy5oYXMoa2V5KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9saXZlUmVwbHlLZXlzLmhhcyhrZXkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIENvbnRpbnVhdGlvbiB3aG9zZSBmaXJzdCBjaHVuayB3ZSBuZXZlciBvYnNlcnZlZDogZmFsbCBiYWNrIHRvIHRoZSBzaG93blxuXHRcdC8vIHNlc3Npb24gKG1pcnJvcnMgdGhlIGZpcnN0LWNodW5rIGRlY2lzaW9uIGFib3ZlKS5cblx0XHRyZXR1cm4gdGhpcy5fc2hvdWxkRGVmZXJGb3JTZXNzaW9uKHNlc3Npb25JZCk7XG5cdH1cblxuXHRwcml2YXRlIF9kZWZlclJlc3BvbnNlKHNlc3Npb25JZDogc3RyaW5nLCBhdWRpbzogc3RyaW5nLCBpc0ZpcnN0Q2h1bms6IGJvb2xlYW4sIGlzRmluYWw6IGJvb2xlYW4sIHRyYW5zY3JpcHQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgcmVzcG9uc2VJZD86IHN0cmluZywgdHVybklkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fc2Vzc2lvbktleShzZXNzaW9uSWQpO1xuXHRcdGxldCByZXNwb25zZXMgPSB0aGlzLl9kZWZlcnJlZFJlc3BvbnNlcy5nZXQoa2V5KTtcblx0XHRpZiAoIXJlc3BvbnNlcykge1xuXHRcdFx0cmVzcG9uc2VzID0gW107XG5cdFx0XHR0aGlzLl9kZWZlcnJlZFJlc3BvbnNlcy5zZXQoa2V5LCByZXNwb25zZXMpO1xuXHRcdH1cblx0XHQvLyBBIGZpcnN0IGNodW5rIGJlZ2lucyBhIE5FVyByZXNwb25zZSAoYXBwZW5kZWQgYWZ0ZXIgYW55IGFscmVhZHkgYnVmZmVyZWRcblx0XHQvLyBmb3IgdGhpcyBzZXNzaW9uLCBzbyBhbGwgYXJlIGtlcHQgYW5kIGxhdGVyIHBsYXllZCBpbiBvcmRlcikuIEFcblx0XHQvLyBjb250aW51YXRpb24gYXR0YWNoZXMgdG8gSVRTIE9XTiByZXNwb25zZTogcHJlZmVyIGFuIGV4YWN0IHJlc3BvbnNlSWRcblx0XHQvLyBtYXRjaCBzbyBpbnRlcmxlYXZlZCBzYW1lLXNlc3Npb24gc3RyZWFtcyAoUjEgZmlyc3QsIFIyIGZpcnN0LCBSMSBjb250LFxuXHRcdC8vIFIyIGNvbnQpIGRvbid0IGNyb3NzLWNvbnRhbWluYXRlOyBmYWxsIGJhY2sgdG8gdGhlIG1vc3QgcmVjZW50IHN0aWxsLW9wZW5cblx0XHQvLyByZXNwb25zZSBvbmx5IHdoZW4gdGhlIGJhY2tlbmQgZGlkbid0IGVjaG8gYSByZXNwb25zZUlkLlxuXHRcdGxldCByZXNwb25zZTogSURlZmVycmVkUmVzcG9uc2UgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCFpc0ZpcnN0Q2h1bmspIHtcblx0XHRcdHJlc3BvbnNlID0gcmVzcG9uc2VJZFxuXHRcdFx0XHQ/IHJlc3BvbnNlcy5maW5kKHIgPT4gci5yZXNwb25zZUlkID09PSByZXNwb25zZUlkKVxuXHRcdFx0XHQ6IFsuLi5yZXNwb25zZXNdLnJldmVyc2UoKS5maW5kKHIgPT4gIXIuZmluYWxpemVkKTtcblx0XHR9XG5cdFx0aWYgKCFyZXNwb25zZSkge1xuXHRcdFx0cmVzcG9uc2UgPSB7IHJlc3BvbnNlSWQsIHR1cm5JZCwgZmluYWxpemVkOiBmYWxzZSwgY2h1bmtzOiBbXSB9O1xuXHRcdFx0cmVzcG9uc2VzLnB1c2gocmVzcG9uc2UpO1xuXHRcdFx0dGhpcy5fbWFya1BlbmRpbmdSZXNwb25zZShrZXksIHRydWUpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIGRlZmVycmluZyByZXNwb25zZSBmb3IgdW5mb2N1c2VkIHNlc3Npb249JHtrZXl9IChidWZmZXJlZD0ke3Jlc3BvbnNlcy5sZW5ndGh9KTsgc2hvd2luZyBwZW5kaW5nIGluZGljYXRvcmApO1xuXHRcdH1cblx0XHRyZXNwb25zZS5jaHVua3MucHVzaCh7IGF1ZGlvLCBpc0ZpcnN0Q2h1bmssIGlzRmluYWwsIHRyYW5zY3JpcHQgfSk7XG5cdFx0aWYgKGlzRmluYWwpIHtcblx0XHRcdHJlc3BvbnNlLmZpbmFsaXplZCA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0LyoqIEZpbmQgdGhlIGJ1ZmZlcmVkLXJlc3BvbnNlIGtleSBmb3IgYSBub3ctc2hvd24gc2Vzc2lvbi4gVGhlIGJ1ZmZlciBpcyBrZXllZFxuXHQgKiAgYnkgdGhlIGNhbm9uaWNhbCBzZXNzaW9uIGtleSAoe0BsaW5rIF9zZXNzaW9uS2V5fSk7IGEgc3RydWN0dXJhbCBVUkktZXF1YWxpdHlcblx0ICogIGZhbGxiYWNrIGd1YXJkcyBhIHRyaXZpYWwgc2VyaWFsaXphdGlvbiBkaWZmZXJlbmNlIGJldHdlZW4gdGhlIGJhY2tlbmQnc1xuXHQgKiAgY29kaW5nX3Nlc3Npb25faWQgYW5kIHRoZSBmb2N1c2VkIHNlc3Npb25SZXNvdXJjZS4gKi9cblx0cHJpdmF0ZSBfbWF0Y2hEZWZlcnJlZEtleShzZXNzaW9uSWQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fc2Vzc2lvbktleShzZXNzaW9uSWQpO1xuXHRcdGlmICh0aGlzLl9kZWZlcnJlZFJlc3BvbnNlcy5oYXMoa2V5KSkge1xuXHRcdFx0cmV0dXJuIGtleTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2RlZmVycmVkUmVzcG9uc2VzLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCBmb2N1c2VkVXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHsgZm9jdXNlZFVyaSA9IFVSSS5wYXJzZShrZXkpOyB9IGNhdGNoIHsgZm9jdXNlZFVyaSA9IHVuZGVmaW5lZDsgfVxuXHRcdGlmIChmb2N1c2VkVXJpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiB0aGlzLl9kZWZlcnJlZFJlc3BvbnNlcy5rZXlzKCkpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRpZiAoaXNFcXVhbChVUkkucGFyc2UoY2FuZGlkYXRlKSwgZm9jdXNlZFVyaSkpIHsgcmV0dXJuIGNhbmRpZGF0ZTsgfVxuXHRcdFx0XHR9IGNhdGNoIHsgLyogaWdub3JlIHVucGFyc2VhYmxlIGtleXMgKi8gfVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqIFJlcGxheXMgYWxsIGJ1ZmZlcmVkIHJlc3BvbnNlcyBmb3IgYSBub3ctc2hvd24gc2Vzc2lvbiwgaW4gYXJyaXZhbCBvcmRlci5cblx0ICogIFJldHVybnMgd2hldGhlciBhbnl0aGluZyB3YXMgZmx1c2hlZCBwbHVzIHRoZSBub3JtYWxpemVkIGZpbmFsIHRyYW5zY3JpcHRcblx0ICogIG9mIGVhY2ggcmVzcG9uc2UgcGxheWVkLCBzbyB0aGUgY2FsbGVyIGNhbiBtYXJrIF9sYXN0TmFycmF0ZWRUZXh0IG9ubHkgZm9yXG5cdCAqICB0ZXh0IHRoYXQgd2FzIGFjdHVhbGx5IHJlYWQgKG5ldmVyIGEgbmV3ZXIsIHVucGxheWVkIHN1bW1hcnkpLiAqL1xuXHRwcml2YXRlIF9mbHVzaERlZmVycmVkUmVzcG9uc2Uoc2Vzc2lvbklkOiBzdHJpbmcpOiBJRGVmZXJyZWRGbHVzaFJlc3VsdCB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fbWF0Y2hEZWZlcnJlZEtleShzZXNzaW9uSWQpO1xuXHRcdGlmICgha2V5KSB7XG5cdFx0XHRpZiAodGhpcy5fZGVmZXJyZWRSZXNwb25zZXMuc2l6ZSA+IDApIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIG5vIGJ1ZmZlcmVkIHJlc3BvbnNlIG1hdGNoZXMgZm9jdXNlZD0ke3Nlc3Npb25JZH07IHBlbmRpbmcga2V5cz1bJHtbLi4udGhpcy5fZGVmZXJyZWRSZXNwb25zZXMua2V5cygpXS5qb2luKCcsICcpfV1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGZsdXNoZWQ6IGZhbHNlLCBmaW5hbFRyYW5zY3JpcHRzOiBbXSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3BvbnNlcyA9IHRoaXMuX2RlZmVycmVkUmVzcG9uc2VzLmdldChrZXkpO1xuXHRcdGlmICghcmVzcG9uc2VzIHx8IHJlc3BvbnNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX2RlZmVycmVkUmVzcG9uc2VzLmRlbGV0ZShrZXkpO1xuXHRcdFx0dGhpcy5fbWF5YmVIaWRlSW5kaWNhdG9yKGtleSk7XG5cdFx0XHRyZXR1cm4geyBmbHVzaGVkOiBmYWxzZSwgZmluYWxUcmFuc2NyaXB0czogW10gfTtcblx0XHR9XG5cblx0XHQvLyBFeGl0IGFueSBhY3RpdmUgbGlzdGVuaW5nIC8gYXV0by1saXN0ZW4gYW5kIHJlYWR5IHRoZSBwbGF5YmFjayBzbG90IHNvXG5cdFx0Ly8gdGhlIGJ1ZmZlcmVkIGNodW5rcyBjYW4gcGxheS4gSWYgYSBoZWxkIGRlbGliZXJhdGUgKG5vbi1wYXNzaXZlKSBwcmVzc1xuXHRcdC8vIGlzIHByZXNlcnZlZCwgdGhlIHNsb3QgY2FuJ3QgYmUgY2xhaW1lZCB3aXRob3V0IHN0cmFuZGluZyB0aGUgYmFja2VuZFxuXHRcdC8vIGxhdGNoLCBzbyBsZWF2ZSB0aGUgcmVzcG9uc2VzIGJ1ZmZlcmVkIGFuZCByZXBvcnQgYHJldGFpbmVkYCBzbyB0aGVcblx0XHQvLyBjYWxsZXIgc2tpcHMgaXNzdWluZyBhIGZyZXNoIG5hcnJhdGlvbiBmb3IgdGhpcyBzYW1lIHJlcGx5LiBUaGUgYnVmZmVyXG5cdFx0Ly8gcmUtZmx1c2hlcyBvbmNlIHRoZSBwcmVzcyByZWxlYXNlcywgZWl0aGVyIHZpYSB0aGUgcGVyaW9kaWMgc2FmZXR5LW5ldFxuXHRcdC8vIChfY2hlY2tTZXNzaW9uU3RhdGVDaGFuZ2VzKSBvciBhIGxhdGVyIGZvY3VzLiBOb3RoaW5nIGlzIGNvbnN1bWVkIGhlcmUsXG5cdFx0Ly8gc28gdGhlIGRlZmVycmVkIGVudHJ5IGFuZCBpdHMgaW5kaWNhdG9yIHN0YXkgaW50YWN0LlxuXHRcdGlmICghdGhpcy5fcHJlcGFyZUZvclBsYXliYWNrKCkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBkZWZlcnJlZCBmbHVzaCBmb3Igc2Vzc2lvbj0ke2tleX0gZGVmZXJyZWQ6IGhlbGQgZGVsaWJlcmF0ZSBwcmVzcyBwcmVzZXJ2ZWQsIGtlZXBpbmcgJHtyZXNwb25zZXMubGVuZ3RofSBidWZmZXJlZCByZXNwb25zZShzKWApO1xuXHRcdFx0Ly8gUmVwb3J0IHRoZSBtb3N0IHJlY2VudCBidWZmZXJlZCByZXBseSdzIHRyYW5zY3JpcHQgc28gdGhlIGNhbGxlclxuXHRcdFx0Ly8gc3VwcHJlc3NlcyBvbmx5IGEgZHVwbGljYXRlIHJlLW5hcnJhdGUgb2YgdGhhdCBleGFjdCByZXBseSwgbm90IGFuXG5cdFx0XHQvLyB1bnJlbGF0ZWQgY29uZmlybWF0aW9uIG9yIGEgbmV3ZXIsIGRpZmZlcmVudCByZXNwb25zZSBmb3IgdGhlIHNlc3Npb24uXG5cdFx0XHRjb25zdCByZXRhaW5lZEZpbmFscyA9IHJlc3BvbnNlc1xuXHRcdFx0XHQubWFwKHIgPT4gdGhpcy5fbm9ybWFsaXplVHJhbnNjcmlwdChbLi4uci5jaHVua3NdLnJldmVyc2UoKS5maW5kKGMgPT4gYy50cmFuc2NyaXB0KT8udHJhbnNjcmlwdCA/PyAnJykpXG5cdFx0XHRcdC5maWx0ZXIodCA9PiAhIXQpO1xuXHRcdFx0cmV0dXJuIHsgZmx1c2hlZDogZmFsc2UsIHJldGFpbmVkOiB0cnVlLCByZXRhaW5lZFRyYW5zY3JpcHQ6IHJldGFpbmVkRmluYWxzW3JldGFpbmVkRmluYWxzLmxlbmd0aCAtIDFdLCBmaW5hbFRyYW5zY3JpcHRzOiBbXSB9O1xuXHRcdH1cblxuXHRcdHRoaXMuX2RlZmVycmVkUmVzcG9uc2VzLmRlbGV0ZShrZXkpO1xuXHRcdHRoaXMuX21heWJlSGlkZUluZGljYXRvcihrZXkpO1xuXHRcdGNvbnN0IHRvdGFsQ2h1bmtzID0gcmVzcG9uc2VzLnJlZHVjZSgobiwgcikgPT4gbiArIHIuY2h1bmtzLmxlbmd0aCwgMCk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIGZsdXNoaW5nICR7cmVzcG9uc2VzLmxlbmd0aH0gYnVmZmVyZWQgcmVzcG9uc2UocykgKCR7dG90YWxDaHVua3N9IGNodW5rKHMpKSBmb3Igbm93LWZvY3VzZWQgc2Vzc2lvbj0ke2tleX1gKTtcblx0XHQvLyBQcm9tb3RlIGFueSBzdGlsbC1vcGVuIChub3QteWV0LWZpbmFsaXplZCkgcmVzcG9uc2UncyByb3V0ZSBmcm9tXG5cdFx0Ly8gJ2RlZmVycmVkJyB0byAnbGl2ZScgc28gdGhlIHJlbWFpbmluZyBjaHVua3MgKGFycml2aW5nIGFmdGVyIHRoaXMgZmx1c2gpXG5cdFx0Ly8gcGxheSBpbW1lZGlhdGVseSBpbnN0ZWFkIG9mIGJlaW5nIHJlLWJ1ZmZlcmVkIC0gYSByZXNwb25zZSBpcyBuZXZlclxuXHRcdC8vIHNwbGl0IGFjcm9zcyBhIGZvY3VzIGNoYW5nZS4gQSBmaW5pc2hlZCByZXNwb25zZSBoYXMgbm8gcm91dGUgKHJldGlyZWRcblx0XHQvLyBvbiBpdHMgZmluYWwgY2h1bmspLCBzbyB0aGVyZSBpcyBub3RoaW5nIHRvIHByb21vdGUuXG5cdFx0Zm9yIChjb25zdCByIG9mIHJlc3BvbnNlcykge1xuXHRcdFx0aWYgKHIucmVzcG9uc2VJZCAmJiAhci5maW5hbGl6ZWQpIHtcblx0XHRcdFx0dGhpcy5fcmVzcG9uc2VSb3V0ZXMuc2V0KHIucmVzcG9uc2VJZCwgJ2xpdmUnKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gVGhlIG5vcm1hbGl6ZWQgZmluYWwgdHJhbnNjcmlwdCBvZiBlYWNoIHJlc3BvbnNlIChpdHMgbGFzdCBub24tZW1wdHlcblx0XHQvLyBjaHVuayBob2xkcyB0aGUgY29tcGxldGUsIGN1bXVsYXRpdmUgdGV4dCkuIFJldHVybmVkIHRvIHRoZSBjYWxsZXIgYW5kXG5cdFx0Ly8gdXNlZCBiZWxvdyBmb3IgZGVkdXBlLlxuXHRcdGNvbnN0IGZpbmFsVHJhbnNjcmlwdHMgPSByZXNwb25zZXNcblx0XHRcdC5tYXAociA9PiB0aGlzLl9ub3JtYWxpemVUcmFuc2NyaXB0KFsuLi5yLmNodW5rc10ucmV2ZXJzZSgpLmZpbmQoYyA9PiBjLnRyYW5zY3JpcHQpPy50cmFuc2NyaXB0ID8/ICcnKSlcblx0XHRcdC5maWx0ZXIodCA9PiAhIXQpO1xuXHRcdC8vIFJlY29yZCB0aGF0IHdlIGp1c3QgcmVwbGF5ZWQgdGhpcyBzZXNzaW9uJ3MgYnVmZmVyZWQgcmVwbHksIHNvIGEgYmFja2VuZFxuXHRcdC8vIHJlLW5hcnJhdGlvbiAoc2FtZSB0ZXh0KSBhcnJpdmluZyBzaG9ydGx5IGFmdGVyIGlzIGRyb3BwZWQgcmF0aGVyIHRoYW5cblx0XHQvLyBkb3VibGUtcmVhZC4gVGhlIGxhc3QgcmVzcG9uc2UgaXMgdGhlIG1vc3QgcmVjZW50IC0gdGhlIG9uZSB0aGUgYmFja2VuZFxuXHRcdC8vIHdvdWxkIHJlLW5hcnJhdGUgb24gYWN0aXZhdGlvbiAtIHNvIGRlZHVwZSBhZ2FpbnN0IGl0cyBmaW5hbCB0cmFuc2NyaXB0LlxuXHRcdGNvbnN0IGZsdXNoZWRUcmFuc2NyaXB0ID0gZmluYWxUcmFuc2NyaXB0c1tmaW5hbFRyYW5zY3JpcHRzLmxlbmd0aCAtIDFdO1xuXHRcdGlmIChmbHVzaGVkVHJhbnNjcmlwdCkge1xuXHRcdFx0dGhpcy5fcmVjZW50bHlSZWFkUmVzcG9uc2Uuc2V0KGtleSwgeyB0cmFuc2NyaXB0OiBmbHVzaGVkVHJhbnNjcmlwdCwgYXQ6IERhdGUubm93KCkgfSk7XG5cdFx0XHR0aGlzLl9sYXN0SGVhcmRUcmFuc2NyaXB0QnlJZC5zZXQoa2V5LCBmbHVzaGVkVHJhbnNjcmlwdCk7XG5cdFx0fVxuXG5cdFx0Ly8gUGxheSBldmVyeSBidWZmZXJlZCByZXNwb25zZSBmb3IgdGhpcyBzZXNzaW9uLCBpbiB0aGUgb3JkZXIgdGhleSBhcnJpdmVkLlxuXHRcdGZvciAoY29uc3QgciBvZiByZXNwb25zZXMpIHtcblx0XHRcdGZvciAoY29uc3QgY2h1bmsgb2Ygci5jaHVua3MpIHtcblx0XHRcdFx0dGhpcy5fZW5xdWV1ZUF1ZGlvKGtleSwgY2h1bmsuYXVkaW8sIGNodW5rLmlzRmlyc3RDaHVuaywgY2h1bmsuaXNGaW5hbCwgY2h1bmsudHJhbnNjcmlwdCwgci5yZXNwb25zZUlkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gRG8gbm90IG1hcmsgdGhlc2UgbmFycmF0aW9ucyBoZWFyZCBoZXJlIC0gZW5xdWV1aW5nIGlzIG5vdCBwbGF5aW5nLlxuXHRcdC8vIFRoZSBhdWRpbyBtYXkgc3RpbGwgYmUgZHJvcHBlZCBieSBhIGxhdGVyIGFjdGl2YXRpb24gLyBQVFQgLyBxdWV1ZSByZXNldFxuXHRcdC8vIC8gaW50ZXJydXB0aW9uIGJlZm9yZSBpdCBwbGF5cy4gSXQgaXMgbWFya2VkIGhlYXJkIGZyb20gb25QbGF5YmFja1N0b3BwZWRcblx0XHQvLyAob3IgdGhlIHNwZWVjaC1kaXNhYmxlZCBicmFuY2ggb2YgX3BsYXlDaHVuayksIGtleWVkIGJ5IHJlc3BvbnNlSWQsIG9ubHlcblx0XHQvLyBvbmNlIHRoZSBhdWRpbyBoYXMgYWN0dWFsbHkgZmluaXNoZWQgLSBwcmVzZXJ2aW5nIHRoZSBwZW5kaW5nIHN0YXRlIHNvIGFuXG5cdFx0Ly8gdW5wbGF5ZWQgcmVwbHkgY2FuIGJlIHJldHJpZWQgaW5zdGVhZCBvZiBzaWxlbnRseSBsb3N0LlxuXHRcdHJldHVybiB7IGZsdXNoZWQ6IHRydWUsIGZpbmFsVHJhbnNjcmlwdHMgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGNvbnRyb2xsZXIgb3V0IG9mIGxpc3RlbmluZy9hdXRvLWxpc3RlbiBhbmQgcmVhZHkgdGhlIHBsYXliYWNrIHNsb3Rcblx0ICogc28gYW4gYWJvdXQtdG8tYXJyaXZlIChvciBqdXN0LWJ1ZmZlcmVkKSBuYXJyYXRpb24gYWN0dWFsbHkgcGxheXMgaW5zdGVhZCBvZlxuXHQgKiBiZWluZyBzdXBwcmVzc2VkLiBVc2VkIGJlZm9yZSBmbHVzaGluZyBhIGRlZmVycmVkIHJlc3BvbnNlIGFuZCBiZWZvcmVcblx0ICogbmFycmF0aW5nIGEgZnJlc2hseS1zaG93biBzZXNzaW9uJ3MgcGVuZGluZyBpdGVtIChlLmcuIGEgY29uZmlybWF0aW9uLCB3aGljaFxuXHQgKiBjYXJyaWVzIG5vIGJ1ZmZlcmVkIGF1ZGlvIGFuZCBzbyBuZXZlciBoaXRzIHRoZSBmbHVzaCBwYXRoKSAtIG90aGVyd2lzZSB0aGVcblx0ICogY29udHJvbGxlciBjYW4gc2l0IGluIGxpc3RlbmluZyBhbmQgdGhlIGVjaG9lZCBhdWRpbyBpcyBkcm9wcGVkLCBsZWF2aW5nIHRoZVxuXHQgKiB1c2VyIHN0YXJpbmcgYXQgYSBmb2N1c2VkIHNlc3Npb24gdGhhdCBuZXZlciBzcGVha3MuXG5cdCAqXG5cdCAqIFJldHVybnMgYHRydWVgIHdoZW4gdGhlIHBsYXliYWNrIHNsb3QgaXMgcmVhZHkgKG5vIHByZXNzIGhlbGQsIG9yIGEgcGFzc2l2ZVxuXHQgKiBvcGVuLW1pYyB0dXJuIHdhcyB0b3JuIGRvd24pLCBhbmQgYGZhbHNlYCB3aGVuIGl0IGRlbGliZXJhdGVseSBwcmVzZXJ2ZWQgYVxuXHQgKiBoZWxkIG5vbi1wYXNzaXZlIHByZXNzLiBBIGBmYWxzZWAgcmV0dXJuIHRlbGxzIHRoZSBmbHVzaCBjYWxsZXIgdG8gbGVhdmUgaXRzXG5cdCAqIGJ1ZmZlcmVkIGF1ZGlvIGRlZmVycmVkIHJhdGhlciB0aGFuIHBsYXkgaXQgb3ZlciB0aGUgdXNlcidzIGxpdmUgcHJlc3MuXG5cdCAqL1xuXHRwcml2YXRlIF9wcmVwYXJlRm9yUGxheWJhY2soKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fY2xlYXJBdXRvTGlzdGVuVGltZXIoKTtcblx0XHR0aGlzLl9hdXRvTGlzdGVuU3VwcHJlc3NlZCA9IGZhbHNlO1xuXHRcdC8vIEEgaGVsZCBkZWxpYmVyYXRlIHByZXNzIChub24tcGFzc2l2ZSkgbGF0Y2hlZCB0aGUgYmFja2VuZCdzXG5cdFx0Ly8gYHVzZXJfaXNfc3BlYWtpbmdgLCBzbyBpdHMgbmFycmF0aW9uIHJlcXVlc3Qgd2FzIE5BQ0snZCBgYnVzeWAgYW5kXG5cdFx0Ly8gZGVmZXJyZWQ6IGl0IHdpbGwgbm90IHBsYXkgbm93LiBMZWF2ZSB0aGUgcHJlc3MgZnVsbHkgaW50YWN0LiBBYm9ydGluZ1xuXHRcdC8vIGl0IGhlcmUgc2VuZHMgbm8gYHB0dF9lbmRgIGFuZCB3b3VsZCBzdHJhbmQgdGhlIGxhdGNoOyBpdHMgbmF0dXJhbFxuXHRcdC8vIHJlbGVhc2Ugc2VuZHMgYHB0dF9lbmRgLCBjbGVhcmluZyB0aGUgZ3VhcmQgYW5kIGRyaXZpbmcgdGhlXG5cdFx0Ly8gYG5hcnJhdGlvbl91bmJsb2NrZWRgIHJldHJ5LiBPbmx5IGEgcGFzc2l2ZSBvcGVuLW1pYyB0dXJuIChhdXRvLWxpc3RlblxuXHRcdC8vIG9yIGJhcmdlLWluKSwgd2hpY2ggbmV2ZXIgbGF0Y2hlZCwgaXMgc2FmZSB0byBhYm9ydCBoZXJlIHRvIGZyZWUgdGhlXG5cdFx0Ly8gbWljIGZvciB0aGUgaW5jb21pbmcgbmFycmF0aW9uIGF1ZGlvLlxuXHRcdGlmICh0aGlzLl9wdHRIZWxkICYmICF0aGlzLl9wdHRDdXJyZW50VHVyblBhc3NpdmUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3B0dEhlbGQpIHtcblx0XHRcdC8vIEEgbG9jYWwtb25seSBhYm9ydCAoJ2F1dG8nLCBubyBgcHR0X2VuZGApOiBhIHBhc3NpdmUgdHVybiBuZXZlclxuXHRcdFx0Ly8gbGF0Y2hlZCBgdXNlcl9pc19zcGVha2luZ2AsIHNvIHRoZXJlJ3Mgbm90aGluZyB0byBmb3JjZS1jbGVhci5cblx0XHRcdC8vICdpbnRlcm5hbCcgbWFya3MgdGhpcyBhcyBhIG5vbi11c2VyLWdlc3R1cmUgc3RvcCBzbyBpdCBkb2Vzbid0IGVtaXRcblx0XHRcdC8vIHRoZSBleHBsaWNpdCBsaXN0ZW5pbmctc3RvcHBlZCBzaWduYWwuXG5cdFx0XHR0aGlzLl9maW5pc2hQdHQoJ2F1dG8nLCAnaW50ZXJuYWwnKTtcblx0XHR9XG5cdFx0dGhpcy5fcHR0VG9nZ2xlTW9kZSA9IGZhbHNlO1xuXHRcdHRoaXMuX3B0dEhlbGQgPSBmYWxzZTtcblx0XHR0aGlzLl9zdXBwcmVzc0luY29taW5nQXVkaW8gPSBmYWxzZTtcblx0XHQvLyBSZXNldCB0aGUgcGxheWJhY2sgc2xvdCB3aGVuIG5vdGhpbmcgaXMgYWN0dWFsbHkgcGxheWluZyBzbyBgX2VucXVldWVBdWRpb2Bcblx0XHQvLyBjYW4gY2xhaW0gaXQgYW5kIGRyaXZlIHRoZSBzdGF0ZSBtYWNoaW5lIHRvICdzcGVha2luZycuIEEgcHJpb3IgZ2VuZXJpY1xuXHRcdC8vIHJlc3BvbnNlIGxlYXZlcyB0aGUgc2xvdCBgdW5kZWZpbmVkYCAobm90IGBudWxsYCksIHdoaWNoIHNraXBzIHRoZVxuXHRcdC8vIGZhc3QtcGF0aCwgc28gYW4gZXhwbGljaXQgcmVzZXQgaXMgcmVxdWlyZWQuIERvIG5vdCB3aXBlIGBfYXVkaW9RdWV1ZWA6XG5cdFx0Ly8gdmFsaWQgYXVkaW8gY2FuIGJlIHBlbmRpbmcgZHVyaW5nIHRoZSB+NTAwbXMgcG9zdC1wbGF5YmFjayByZS1wcm9jZXNzIGdhcFxuXHRcdC8vIChpc1BsYXlpbmcgaXMgZmFsc2UgYnV0IHRoZSBxdWV1ZSBpcyBub24tZW1wdHkpLCBhbmQgY2xlYXJpbmcgaXQgaGVyZVxuXHRcdC8vIHdvdWxkIHNpbGVudGx5IGRyb3AgdGhvc2UgcmVzcG9uc2VzLlxuXHRcdGlmICghdGhpcy50dHNQbGF5YmFja1NlcnZpY2UuaXNQbGF5aW5nICYmIHRoaXMuX2N1cnJlbnRQbGF5YmFja1Nlc3Npb25JZCAhPT0gbnVsbCkge1xuXHRcdFx0dGhpcy5fY3VycmVudFBsYXliYWNrU2Vzc2lvbklkID0gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogVHJ1ZSB3aGVuIGFuIGluY29taW5nIHJlcGx5IGlzIGEgcmUtbmFycmF0aW9uIG9mIGEgcmVwbHkgd2UgcmVjZW50bHkgcmVhZFxuXHQgKiBmb3IgdGhpcyBzZXNzaW9uIChwbGF5ZWQgbGl2ZSBvciBmbHVzaGVkIGZyb20gdGhlIGRlZmVycmVkIGJ1ZmZlcikuIFRoZVxuXHQgKiBiYWNrZW5kIHJlLWVtaXRzIGEgc2Vzc2lvbidzIHJlcGx5IHdoZW4gdGhhdCBzZXNzaW9uIGJlY29tZXMgYWN0aXZlIChvblxuXHQgKiBmb2N1cyksIHdoaWNoIHdvdWxkIG90aGVyd2lzZSBiZSByZWFkIGEgc2Vjb25kIHRpbWUuIFdlIGRyb3AgaXQgT05MWSB3aGVuXG5cdCAqIGl0cyB0cmFuc2NyaXB0IG1hdGNoZXMgd2hhdCB3ZSByZWNlbnRseSByZWFkIEFORCBhcnJpdmVzIHdpdGhpblxuXHQgKiBSRU5BUlJBVElPTl9ERURVUEVfV0lORE9XX01TIC0gc28gYSBnZW51aW5lbHkgbmV3IHJlcGx5IChkaWZmZXJlbnQgdGV4dClcblx0ICogYWx3YXlzIHBsYXlzLCBhbmQgc28gZG9lcyBhIGxhdGVyIGlkZW50aWNhbCByZXBseSBvbmNlIHRoZSB3aW5kb3cgbGFwc2VzLlxuXHQgKiBUaGUgd2hvbGUgcmVzcG9uc2UgKGluY2x1ZGluZyBjb250aW51YXRpb24gY2h1bmtzKSBpcyBkcm9wcGVkIHVudGlsIGZpbmFsLlxuXHQgKlxuXHQgKiBUaGlzIGlzIHB1cmVseSBjb250ZW50LWJhc2VkOiBpdCBuZXZlciBzdXBwcmVzc2VzIGEgcmVwbHkganVzdCBiZWNhdXNlIHRoZVxuXHQgKiBzZXNzaW9uIHdhcyBoZWFyZCBiZWZvcmUsIHdoaWNoIGlzIHdoYXQgbGV0IHRoZSBiYWNrZW5kJ3Mgc2VydmVyLXNpZGVcblx0ICogZGVmZXJyYWwgb2YgYSBORVcgcmVwbHkgKGRlbGl2ZXJlZCBhcyBhbiBvbi1mb2N1cyBuYXJyYXRpb24pIGJlIHN3YWxsb3dlZC5cblx0ICovXG5cdHByaXZhdGUgX2lzUmVuYXJyYXRpb24ocmVzcG9uc2VJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBzZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgdHJhbnNjcmlwdDogc3RyaW5nIHwgdW5kZWZpbmVkLCBpc0ZpcnN0Q2h1bms6IGJvb2xlYW4sIGlzRmluYWw6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRpZiAoIXNlc3Npb25JZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBLZXkgdGhlIGRyb3AgbWFya2VyIGJ5IHJlc3BvbnNlSWQgd2hlbiBwcmVzZW50IHNvIGEgRElGRkVSRU5UIHNhbWUtc2Vzc2lvblxuXHRcdC8vIHJlc3BvbnNlIHN0cmVhbWluZyBjb25jdXJyZW50bHkgaXNuJ3QgZHJvcHBlZCBqdXN0IGJlY2F1c2UgYW4gZWFybGllciBvbmVcblx0XHQvLyB3YXMgYSByZS1uYXJyYXRpb247IGZhbGwgYmFjayB0byBzZXNzaW9uSWQgd2hlbiBubyBpZCB3YXMgZWNob2VkLlxuXHRcdGNvbnN0IGRyb3BLZXkgPSByZXNwb25zZUlkID8/IHNlc3Npb25JZDtcblx0XHQvLyBBdWRpbyB3ZSBleHBsaWNpdGx5IHNvbGljaXRlZCAoaXRzIHJlc3BvbnNlSWQgaXMgb25lIHdlIHNlbnQgb25cblx0XHQvLyByZXF1ZXN0X25hcnJhdGlvbikgaXMgYWx3YXlzIGFsbG93ZWQgdG8gcGxheSAtIGl0IGNhbid0IGJlIGFuXG5cdFx0Ly8gdW5zb2xpY2l0ZWQgZHVwbGljYXRlLiBSZXRpcmUgdGhlIGlkIG9uY2UgaXRzIHN0cmVhbSBlbmRzLlxuXHRcdGlmIChyZXNwb25zZUlkICYmIHRoaXMuX3NvbGljaXRlZE5hcnJhdGlvbklkcy5oYXMocmVzcG9uc2VJZCkpIHtcblx0XHRcdGlmIChpc0ZpbmFsKSB7XG5cdFx0XHRcdHRoaXMuX3NvbGljaXRlZE5hcnJhdGlvbklkcy5kZWxldGUocmVzcG9uc2VJZCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIENvbnRpbnVhdGlvbiBvZiBhIHJlLW5hcnJhdGlvbiB3ZSdyZSBhbHJlYWR5IGRyb3BwaW5nLlxuXHRcdGlmICghaXNGaXJzdENodW5rICYmIHRoaXMuX2Ryb3BwaW5nUmVuYXJyYXRpb24uaGFzKGRyb3BLZXkpKSB7XG5cdFx0XHRpZiAoaXNGaW5hbCkge1xuXHRcdFx0XHR0aGlzLl9kcm9wcGluZ1JlbmFycmF0aW9uLmRlbGV0ZShkcm9wS2V5KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIWlzRmlyc3RDaHVuaykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBBIHNvbGljaXRlZCByZXBseSB0aGUgdXNlciBpcyBhY3RpdmVseSBhd2FpdGluZyBhbHdheXMgcGxheXMuXG5cdFx0aWYgKHRoaXMuX2F3YWl0aW5nUmVwbHlBdWRpbyAmJiB0aGlzLl9hd2FpdGluZ1JlcGx5Rm9yU2Vzc2lvbiA9PT0gc2Vzc2lvbklkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHJlY2VudCA9IHRoaXMuX3JlY2VudGx5UmVhZFJlc3BvbnNlLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmIChyZWNlbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoRGF0ZS5ub3coKSAtIHJlY2VudC5hdCA+IFZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuUkVOQVJSQVRJT05fREVEVVBFX1dJTkRPV19NUykge1xuXHRcdFx0dGhpcy5fcmVjZW50bHlSZWFkUmVzcG9uc2UuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIE9ubHkgZHJvcCB3aGVuIHRoZSBpbmNvbWluZyByZXBseSBpcyB0aGUgU0FNRSB0ZXh0IHdlIHJlY2VudGx5IHJlYWQuXG5cdFx0Ly8gQSBnZW51aW5lbHkgbmV3IHJlcGx5IChkaWZmZXJlbnQgdGV4dCkgZm9yIHRoZSBzYW1lIHNlc3Npb24gbXVzdCBzdGlsbFxuXHRcdC8vIHBsYXksIHNvIHdlIG5ldmVyIHN1cHByZXNzIG9uIHRoZSB0aW1lIHdpbmRvdyBhbG9uZS5cblx0XHRjb25zdCBpbmNvbWluZyA9IHRoaXMuX25vcm1hbGl6ZVRyYW5zY3JpcHQodHJhbnNjcmlwdCA/PyAnJyk7XG5cdFx0aWYgKCFpbmNvbWluZyB8fCAhKHJlY2VudC50cmFuc2NyaXB0ID09PSBpbmNvbWluZyB8fCByZWNlbnQudHJhbnNjcmlwdC5zdGFydHNXaXRoKGluY29taW5nKSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gVGhpcyBmaXJzdCBjaHVuayBpcyB0aGUgcmUtbmFycmF0aW9uOyBrZWVwIGRyb3BwaW5nIGl0cyBjb250aW51YXRpb25cblx0XHQvLyBjaHVua3MgKGlmIGFueSkgdW50aWwgZmluYWwuIFRoZSBtYXJrZXIgaXMgbGVmdCBpbiBwbGFjZSBzbyByZXBlYXRlZFxuXHRcdC8vIHJlLW5hcnJhdGlvbnMgd2l0aGluIHRoZSB3aW5kb3cgYXJlIGFsc28gZHJvcHBlZDsgaXQgZXhwaXJlcyBieSB0aW1lIG9yXG5cdFx0Ly8gaXMgb3ZlcndyaXR0ZW4gd2hlbiBhIG5ldyByZXBseSBpcyByZWFkLlxuXHRcdHRoaXMuX2xpdmVSZXBseUtleXMuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0aWYgKCFpc0ZpbmFsKSB7XG5cdFx0XHR0aGlzLl9kcm9wcGluZ1JlbmFycmF0aW9uLmFkZChkcm9wS2V5KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKiogTG93ZXJjYXNlLCBjb2xsYXBzZSB3aGl0ZXNwYWNlIGFuZCBzdHJpcCBzdXJyb3VuZGluZyBwdW5jdHVhdGlvbiBzbyB0d29cblx0ICogIHRyYW5zY3JpcHRzIG9mIHRoZSBzYW1lIHJlcGx5IGNvbXBhcmUgZXF1YWwgZGVzcGl0ZSBtaW5vciBmb3JtYXR0aW5nLiAqL1xuXHRwcml2YXRlIF9ub3JtYWxpemVUcmFuc2NyaXB0KHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRleHQudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9cXHMrL2csICcgJykucmVwbGFjZSgvXltcXHMuLCE/OzonXCJdK3xbXFxzLiwhPzs6J1wiXSskL2csICcnKS50cmltKCk7XG5cdH1cblxuXHRwcml2YXRlIF9tYXJrUGVuZGluZ1Jlc3BvbnNlKHNlc3Npb25JZDogc3RyaW5nLCBwZW5kaW5nOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMudm9pY2VQbGF5YmFja1NlcnZpY2Uuc2V0UGVuZGluZ1Jlc3BvbnNlKFVSSS5wYXJzZShzZXNzaW9uSWQpLCBwZW5kaW5nKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIHNlc3Npb25JZCBpc24ndCBhIHBhcnNlYWJsZSByZXNvdXJjZSAtIG5vdGhpbmcgdG8gaW5kaWNhdGUuXG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlY29uY2lsZSB0aGUgc2Vzc2lvbnMtbGlzdCBcInBlbmRpbmcgcmVzcG9uc2VcIiBpbmRpY2F0b3IgZm9yIGNvbmZpcm1hdGlvbnMuXG5cdCAqIEEgc2Vzc2lvbiB0aGF0IGlzIGF3YWl0aW5nIHVzZXIgY29uZmlybWF0aW9uIHdoaWxlIE5PVCBmb2N1c2VkIHNob3VsZCBzaG93XG5cdCAqIHRoZSBpbmRpY2F0b3I7IG9uY2UgaXQgaXMgZm9jdXNlZCBvciB0aGUgY29uZmlybWF0aW9uIGlzIHJlc29sdmVkIHRoZVxuXHQgKiBpbmRpY2F0b3IgaXMgY2xlYXJlZC4gVGhpcyBpcyBkcml2ZW4gcHVyZWx5IGZyb20gY2xpZW50LW9ic2VydmVkIHNlc3Npb25cblx0ICogc3RhdGUsIHNvIGl0IGlzIGFjY3VyYXRlIHJlZ2FyZGxlc3Mgb2Ygd2hldGhlciB0aGUgYmFja2VuZCBuYXJyYXRlcyB0aGVcblx0ICogY29uZmlybWF0aW9uIGFzIGF1ZGlvLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVjb25jaWxlQ29uZmlybWF0aW9uSW5kaWNhdG9ycyh3YWl0aW5nU2Vzc2lvbklkczogU2V0PHN0cmluZz4pOiB2b2lkIHtcblx0XHQvLyBTdXBwcmVzcyB0aGUgaW5kaWNhdG9yIG9ubHkgZm9yIHRoZSBzZXNzaW9uIHRoZSB1c2VyIGlzIGN1cnJlbnRseVxuXHRcdC8vIHZpZXdpbmcuIEluIHRoZSBhZ2VudHMgd2luZG93IHVzZSB0aGUgZW1iZWRkZXItcHJvdmlkZWQgc2hvd24gc2Vzc2lvblxuXHRcdC8vIChyYXcgY2hhdC13aWRnZXQgZm9jdXMgaXMgdW5yZWxpYWJsZSB0aGVyZSk7IGluIHRoZSBtYWluIHdpbmRvdyB1c2Vcblx0XHQvLyB0aGUgZm9jdXNlZCBzZXNzaW9uLiBEZWxpYmVyYXRlbHkgYXZvaWQgdGhlIF9nZXRBY3RpdmVTZXNzaW9uSWQoKVxuXHRcdC8vIGZhbGxiYWNrIGNoYWluIChfdGFyZ2V0U2Vzc2lvbiAvIF9sYXN0U2hvd25TZXNzaW9uSWQpLCB3aGljaCBjYW4gcG9pbnRcblx0XHQvLyBhdCBhIG5vdC1jdXJyZW50bHktdmlzaWJsZSBzZXNzaW9uIGFuZCB3cm9uZ2x5IGhpZGUgaXRzIGluZGljYXRvci5cblx0XHRjb25zdCBhY3RpdmVJZCA9IHRoaXMuX2V4dGVybmFsQWN0aXZlU2Vzc2lvbk1vZGVcblx0XHRcdD8gdGhpcy5fYWN0aXZlU2Vzc2lvblNob3duXG5cdFx0XHQ6IHRoaXMuX2dldEZvY3VzZWRTZXNzaW9uSWQoKTtcblx0XHRjb25zdCBhY3RpdmVLZXkgPSBhY3RpdmVJZCA/IHRoaXMuX3Nlc3Npb25LZXkoYWN0aXZlSWQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHdhaXRpbmdLZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uSWQgb2Ygd2FpdGluZ1Nlc3Npb25JZHMpIHtcblx0XHRcdGNvbnN0IGtleSA9IHRoaXMuX3Nlc3Npb25LZXkoc2Vzc2lvbklkKTtcblx0XHRcdHdhaXRpbmdLZXlzLmFkZChrZXkpO1xuXHRcdFx0aWYgKGtleSA9PT0gYWN0aXZlS2V5KSB7XG5cdFx0XHRcdC8vIE5vdyB0aGUgYWN0aXZlIHNlc3Npb24gLSBtYWtlIHN1cmUgYW55IGVudHJ5IGlzIGdvbmUuXG5cdFx0XHRcdHRoaXMuX2NsZWFyQ29uZmlybWF0aW9uSW5kaWNhdG9yKGtleSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLl9jb25maXJtYXRpb25QZW5kaW5nU2Vzc2lvbnMuaGFzKGtleSkpIHtcblx0XHRcdFx0dGhpcy5fY29uZmlybWF0aW9uUGVuZGluZ1Nlc3Npb25zLmFkZChrZXkpO1xuXHRcdFx0XHR0aGlzLl9tYXJrUGVuZGluZ1Jlc3BvbnNlKGtleSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIENsZWFyIGl0IGZvciBzZXNzaW9ucyB0aGF0IGFyZSBub3cgYWN0aXZlIG9yIG5vIGxvbmdlciB3YWl0aW5nLlxuXHRcdGZvciAoY29uc3Qga2V5IG9mIFsuLi50aGlzLl9jb25maXJtYXRpb25QZW5kaW5nU2Vzc2lvbnNdKSB7XG5cdFx0XHRpZiAod2FpdGluZ0tleXMuaGFzKGtleSkgJiYga2V5ICE9PSBhY3RpdmVLZXkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jbGVhckNvbmZpcm1hdGlvbkluZGljYXRvcihrZXkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyQ29uZmlybWF0aW9uSW5kaWNhdG9yKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fc2Vzc2lvbktleShzZXNzaW9uSWQpO1xuXHRcdGlmICh0aGlzLl9jb25maXJtYXRpb25QZW5kaW5nU2Vzc2lvbnMuZGVsZXRlKGtleSkpIHtcblx0XHRcdHRoaXMuX21heWJlSGlkZUluZGljYXRvcihrZXkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBEcm9wIGEgc2Vzc2lvbidzIHBlbmRpbmctcmVzcG9uc2UgKGNvbXBsZXRlZC1yZXBseSkgaW5kaWNhdG9yL3N1bW1hcnkuICovXG5cdHByaXZhdGUgX2NsZWFyUGVuZGluZ1Jlc3BvbnNlKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fc2Vzc2lvbktleShzZXNzaW9uSWQpO1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nUmVzcG9uc2VTdW1tYXJpZXMuZGVsZXRlKGtleSkpIHtcblx0XHRcdHRoaXMuX21heWJlSGlkZUluZGljYXRvcihrZXkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBIaWRlIHRoZSBzZXNzaW9ucy1saXN0IGluZGljYXRvciBvbmx5IHdoZW4gbm8gb3duZXIgc3RpbGwgbmVlZHMgaXQuIFRoZVxuXHQgKiAgc2FtZSB2aXNpYmxlIGluZGljYXRvciBpcyBzaGFyZWQgYnkgdGhyZWUgaW5kZXBlbmRlbnQgc291cmNlcyAtIGFuXG5cdCAqICB1bmZvY3VzZWQgY29uZmlybWF0aW9uLCBidWZmZXJlZCBkZWZlcnJlZCBhdWRpbywgYW5kIGEgY29tcGxldGVkXG5cdCAqICBiYWNrZ3JvdW5kIHJlcGx5IC0gc28gaXQgbXVzdCBzdGF5IHZpc2libGUgdW50aWwgYWxsIGFyZSByZXNvbHZlZC4gKi9cblx0cHJpdmF0ZSBfbWF5YmVIaWRlSW5kaWNhdG9yKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fc2Vzc2lvbktleShzZXNzaW9uSWQpO1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nT3duZWQoa2V5KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9tYXJrUGVuZGluZ1Jlc3BvbnNlKGtleSwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJEZWZlcnJlZFJlc3BvbnNlcygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiB0aGlzLl9kZWZlcnJlZFJlc3BvbnNlcy5rZXlzKCkpIHtcblx0XHRcdHRoaXMuX21hcmtQZW5kaW5nUmVzcG9uc2Uoa2V5LCBmYWxzZSk7XG5cdFx0fVxuXHRcdHRoaXMuX2RlZmVycmVkUmVzcG9uc2VzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcmVzcG9uc2VSb3V0ZXMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiB0aGlzLl9jb25maXJtYXRpb25QZW5kaW5nU2Vzc2lvbnMpIHtcblx0XHRcdHRoaXMuX21hcmtQZW5kaW5nUmVzcG9uc2Uoa2V5LCBmYWxzZSk7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbmZpcm1hdGlvblBlbmRpbmdTZXNzaW9ucy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIHRoaXMuX3BlbmRpbmdSZXNwb25zZVN1bW1hcmllcy5rZXlzKCkpIHtcblx0XHRcdHRoaXMuX21hcmtQZW5kaW5nUmVzcG9uc2Uoa2V5LCBmYWxzZSk7XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdSZXNwb25zZVN1bW1hcmllcy5jbGVhcigpO1xuXHR9XG5cblx0Ly8gLS0tIEF1ZGlvIEZJRk8gcXVldWUgLS0tXG5cblx0cHJpdmF0ZSBfcHJlZW1wdENoZWNrcG9pbnRQbGF5YmFjayhzZXNzaW9uSWQ/OiBzdHJpbmcsIHRhcmdldE5hcnJhdGlvbklkPzogc3RyaW5nLCBzdG9wQWN0aXZlUGxheWJhY2sgPSB0cnVlKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9IHNlc3Npb25JZCA/IHRoaXMuX3Nlc3Npb25LZXkoc2Vzc2lvbklkKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzaG91bGRQcmVlbXB0ID0gKGNhbmRpZGF0ZVNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBjYW5kaWRhdGVOYXJyYXRpb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBuYXJyYXRpb246IElQbGF5YmFja05hcnJhdGlvbiB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0cmV0dXJuIG5hcnJhdGlvbj8ua2luZCA9PT0gJ2NoZWNrcG9pbnQnXG5cdFx0XHRcdCYmICh0YXJnZXROYXJyYXRpb25JZCA9PT0gdW5kZWZpbmVkIHx8IGNhbmRpZGF0ZU5hcnJhdGlvbklkID09PSB0YXJnZXROYXJyYXRpb25JZClcblx0XHRcdFx0JiYgKHNlc3Npb25LZXkgPT09IHVuZGVmaW5lZCB8fCAoY2FuZGlkYXRlU2Vzc2lvbklkICE9PSB1bmRlZmluZWQgJiYgdGhpcy5fc2Vzc2lvbktleShjYW5kaWRhdGVTZXNzaW9uSWQpID09PSBzZXNzaW9uS2V5KSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGludGVycnVwdGVkSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChsZXQgaSA9IHRoaXMuX2F1ZGlvUXVldWUubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IHF1ZXVlZCA9IHRoaXMuX2F1ZGlvUXVldWVbaV07XG5cdFx0XHRpZiAoIXNob3VsZFByZWVtcHQocXVldWVkLnNlc3Npb25JZCwgcXVldWVkLnJlc3BvbnNlSWQsIHF1ZXVlZC5uYXJyYXRpb24pKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHF1ZXVlZC5yZXNwb25zZUlkKSB7XG5cdFx0XHRcdGludGVycnVwdGVkSWRzLmFkZChxdWV1ZWQucmVzcG9uc2VJZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9hdWRpb1F1ZXVlLnNwbGljZShpLCAxKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBbY2FuZGlkYXRlTmFycmF0aW9uSWQsIHBlbmRpbmddIG9mIHRoaXMuX3BlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb25zKSB7XG5cdFx0XHRpZiAocGVuZGluZy5raW5kICE9PSAnY2hlY2twb2ludCdcblx0XHRcdFx0fHwgKHRhcmdldE5hcnJhdGlvbklkICE9PSB1bmRlZmluZWQgJiYgY2FuZGlkYXRlTmFycmF0aW9uSWQgIT09IHRhcmdldE5hcnJhdGlvbklkKVxuXHRcdFx0XHR8fCAoc2Vzc2lvbktleSAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX3Nlc3Npb25LZXkocGVuZGluZy5zZXNzaW9uSWQpICE9PSBzZXNzaW9uS2V5KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGludGVycnVwdGVkSWRzLmFkZChjYW5kaWRhdGVOYXJyYXRpb25JZCk7XG5cdFx0XHR0aGlzLl9jbGVhclBlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb24oY2FuZGlkYXRlTmFycmF0aW9uSWQsIHBlbmRpbmcpO1xuXHRcdFx0dGhpcy5fc29saWNpdGVkTmFycmF0aW9uSWRzLmRlbGV0ZShjYW5kaWRhdGVOYXJyYXRpb25JZCk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgbmFycmF0aW9uSWQgb2YgaW50ZXJydXB0ZWRJZHMpIHtcblx0XHRcdHRoaXMuX3JlbWVtYmVySW50ZXJydXB0ZWRBdWRpb0lkKG5hcnJhdGlvbklkKTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVDaGVja3BvaW50TWF0Y2hlcyA9IHNob3VsZFByZWVtcHQodGhpcy5fY3VycmVudFBsYXliYWNrU2Vzc2lvbklkID8/IHVuZGVmaW5lZCwgdGhpcy5fY3VycmVudFBsYXliYWNrUmVzcG9uc2VJZCwgdGhpcy5fY3VycmVudFBsYXliYWNrTmFycmF0aW9uKTtcblx0XHRpZiAoYWN0aXZlQ2hlY2twb2ludE1hdGNoZXMgJiYgdGhpcy5fY3VycmVudFBsYXliYWNrUmVzcG9uc2VJZCkge1xuXHRcdFx0dGhpcy5fcmVtZW1iZXJJbnRlcnJ1cHRlZEF1ZGlvSWQodGhpcy5fY3VycmVudFBsYXliYWNrUmVzcG9uc2VJZCk7XG5cdFx0fVxuXHRcdGlmIChhY3RpdmVDaGVja3BvaW50TWF0Y2hlcyAmJiBzdG9wQWN0aXZlUGxheWJhY2spIHtcblx0XHRcdHRoaXMuX3N0b3BDdXJyZW50UGxheWJhY2tBc0ludGVycnVwdGVkKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaW50ZXJydXB0QXNzaXN0YW50UGxheWJhY2soKTogdm9pZCB7XG5cdFx0Y29uc3QgaW50ZXJydXB0ZWRTZXNzaW9uSWQgPSB0aGlzLl9jdXJyZW50UGxheWJhY2tTZXNzaW9uSWQgPz8gdGhpcy5fc2hvd25TZXNzaW9uSWQoKTtcblx0XHRpZiAoaW50ZXJydXB0ZWRTZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuX2NhbmNlbFZvaWNlUHJvZ3Jlc3MoaW50ZXJydXB0ZWRTZXNzaW9uSWQpO1xuXHRcdH1cblx0XHR0aGlzLl9wcmVlbXB0Q2hlY2twb2ludFBsYXliYWNrKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0dGhpcy5fcmVtZW1iZXJJbnRlcnJ1cHRlZFBsYXliYWNrSWRzKCk7XG5cdFx0dGhpcy5fdGVsZW1ldHJ5VHRzSW50ZXJydXB0ZWQgPSB0aGlzLl90ZWxlbWV0cnlUdHNJbnRlcnJ1cHRlZCB8fCB0aGlzLnR0c1BsYXliYWNrU2VydmljZS5pc1BsYXlpbmc7XG5cdFx0dGhpcy5fYXVkaW9RdWV1ZS5sZW5ndGggPSAwO1xuXHRcdHRoaXMuX2N1cnJlbnRQbGF5YmFja1Nlc3Npb25JZCA9IG51bGw7XG5cdFx0dGhpcy5fY3VycmVudFBsYXliYWNrRmluYWxpemVkID0gZmFsc2U7XG5cdFx0dGhpcy5faXNQcm9jZXNzaW5nUXVldWUgPSBmYWxzZTtcblx0XHR0aGlzLl9zdXBwcmVzc0luY29taW5nQXVkaW8gPSB0cnVlO1xuXHRcdHRoaXMudHRzUGxheWJhY2tTZXJ2aWNlLnN0b3BQbGF5YmFjaygpO1xuXHRcdC8vIENsZWFyIGFueSBuYXJyYXRpb24gaWQgbGVmdCBvdmVyIGlmIHN0b3BQbGF5YmFjayBkaWRuJ3QgZmlyZSBvblBsYXliYWNrU3RvcHBlZFxuXHRcdC8vIChlLmcuIG5vdGhpbmcgd2FzIHBsYXlpbmcpLCBzbyBhIGxhdGVyIHN0cmF5IHN0b3AgY2FuJ3QgY29uc3VtZSBhIHN0YWxlIGlkLlxuXHRcdHRoaXMuX2N1cnJlbnRQbGF5YmFja1Jlc3BvbnNlSWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY3VycmVudFBsYXliYWNrTmFycmF0aW9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMudm9pY2VQbGF5YmFja1NlcnZpY2Uubm90aWZ5UGxheWJhY2tFbmQodW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX3N0b3BDdXJyZW50UGxheWJhY2tBc0ludGVycnVwdGVkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnR0c1BsYXliYWNrU2VydmljZS5pc1BsYXlpbmcpIHtcblx0XHRcdHRoaXMuX3RlbGVtZXRyeVR0c0ludGVycnVwdGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMudHRzUGxheWJhY2tTZXJ2aWNlLnN0b3BQbGF5YmFjaygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBjb250cm9sbGVyIGNsYWltcyB0aGUgcGxheWJhY2sgc2xvdCBiZWZvcmUgV2ViQXVkaW8gZmluaXNoZXMgZGVjb2RpbmcuXG5cdFx0Ly8gU3RvcHBpbmcgZHVyaW5nIHRoYXQgd2luZG93IGVtaXRzIG5vIHBsYXliYWNrLXN0b3BwZWQgZXZlbnQsIHNvIGNsb3NlIHRoZVxuXHRcdC8vIGxpZmVjeWNsZSBoZXJlIGluc3RlYWQgb2YgbGVha2luZyBpbnRlcnJ1cHRpb24gc3RhdGUgaW50byB0aGUgbmV4dCByZXBseS5cblx0XHR0aGlzLnR0c1BsYXliYWNrU2VydmljZS5zdG9wUGxheWJhY2soKTtcblx0XHR0aGlzLl90ZWxlbWV0cnlUdHNJbnRlcnJ1cHRlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2N1cnJlbnRQbGF5YmFja1Nlc3Npb25JZCA9IG51bGw7XG5cdFx0dGhpcy5fY3VycmVudFBsYXliYWNrUmVzcG9uc2VJZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jdXJyZW50UGxheWJhY2tOYXJyYXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY3VycmVudFBsYXliYWNrRmluYWxpemVkID0gZmFsc2U7XG5cdFx0dGhpcy52b2ljZVBsYXliYWNrU2VydmljZS5ub3RpZnlQbGF5YmFja0VuZCh1bmRlZmluZWQpO1xuXHRcdGlmICh0aGlzLl9hdWRpb1F1ZXVlLmxlbmd0aCA+IDApIHtcblx0XHRcdGlmICghdGhpcy5faXNQcm9jZXNzaW5nUXVldWUpIHtcblx0XHRcdFx0dGhpcy5fcHJvY2Vzc1F1ZXVlKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Jlc3RvcmVWb2ljZVN0YXRlQWZ0ZXJOYXJyYXRpb25UaW1lb3V0KCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFN0b3AgcmVhZGluZyBhbiBhY3Rpb25hYmxlIHBlbmRpbmcgcmVxdWVzdCBhbG91ZCBvbmNlIGl0IGhhcyBiZWVuIHJlc29sdmVkXG5cdCAqIChlLmcuIHRoZSB1c2VyIHByZXNzZWQgQWxsb3csIG9yIGFuc3dlcmVkIHRoZSBmb3JtIHdpdGggdGhlIG1vdXNlLCBiZWZvcmVcblx0ICogdGhlIG5hcnJhdGlvbiBmaW5pc2hlZCkuIENhbmNlbHMgdGhlIHNlc3Npb24ncyBpbi1mbGlnaHRcblx0ICogY29uZmlybWF0aW9uL3F1ZXN0aW9uIG5hcnJhdGlvbihzKTogZHJvcHMgdGhlaXIgcXVldWVkIGF1ZGlvLCByZW1lbWJlcnNcblx0ICogdGhlaXIgaWRzIHNvIHRyYWlsaW5nIC8gbm90LXlldCBhcnJpdmVkIGNodW5rcyBhcmUgc3dhbGxvd2VkIGluIHRoZVxuXHQgKiBgYXVkaW9fcmVzcG9uc2VgIGhhbmRsZXIsIGFuZCBjdXRzIG9mZiBwbGF5YmFjayBpZiBvbmUgb2YgdGhlbSBpcyB3aGF0IGlzXG5cdCAqIGN1cnJlbnRseSBzcGVha2luZy4gVGhlIGFnZW50J3Mgc3Vic2VxdWVudCByZWFsIHJlcGx5IHVzZXMgYSBkaWZmZXJlbnRcblx0ICogbmFycmF0aW9uIGlkIGFuZCBpcyB1bmFmZmVjdGVkLlxuXHQgKlxuXHQgKiBSZXNwb25zZXMgYXJlIGRlbGliZXJhdGVseSBleGVtcHQ6IGEgY29tcGxldGVkIHJlcGx5IHN0YXlzIHdvcnRoIGhlYXJpbmdcblx0ICogYWZ0ZXIgdGhlIHRoaW5nIGl0IGRlc2NyaWJlcyBoYXMgYmVlbiBkZWFsdCB3aXRoLCB3aGVyZWFzIGEgcHJvbXB0IGZvciBhblxuXHQgKiBhY3Rpb24gdGhhdCBoYXMgYWxyZWFkeSBiZWVuIHRha2VuIGlzIG9ubHkgY29uZnVzaW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBfc3RvcFBlbmRpbmdOYXJyYXRpb24oc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gdGhpcy5fc2Vzc2lvbktleShzZXNzaW9uSWQpO1xuXHRcdC8vIENvbGxlY3QgdGhlIG5hcnJhdGlvbiBpZHMgb2YgdGhpcyBzZXNzaW9uJ3MgYWN0aW9uYWJsZSBuYXJyYXRpb25zIHRoYXRcblx0XHQvLyBhcmUgc3RpbGwgaW4gZmxpZ2h0IChyZXF1ZXN0ZWQvcXVldWVkL3BsYXlpbmcgYnV0IG5vdCBmaW5pc2hlZCkuXG5cdFx0Y29uc3QgY2FuY2VsbGVkSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBbbmFycmF0aW9uSWQsIHBlbmRpbmddIG9mIHRoaXMuX3BlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb25zKSB7XG5cdFx0XHRpZiAocGVuZGluZy5raW5kICE9PSAncmVzcG9uc2UnICYmIHRoaXMuX3Nlc3Npb25LZXkocGVuZGluZy5zZXNzaW9uSWQpID09PSBzZXNzaW9uS2V5KSB7XG5cdFx0XHRcdGNhbmNlbGxlZElkcy5hZGQobmFycmF0aW9uSWQpO1xuXHRcdFx0XHR0aGlzLl9jbGVhclBlbmRpbmdTb2xpY2l0ZWROYXJyYXRpb24obmFycmF0aW9uSWQsIHBlbmRpbmcpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoY2FuY2VsbGVkSWRzLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gRHJvcCBhbnkgbm90LXlldC1wbGF5ZWQgY2h1bmtzIG9mIHRob3NlIG5hcnJhdGlvbnMgZnJvbSB0aGUgcXVldWUuXG5cdFx0Zm9yIChsZXQgaSA9IHRoaXMuX2F1ZGlvUXVldWUubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlSWQgPSB0aGlzLl9hdWRpb1F1ZXVlW2ldLnJlc3BvbnNlSWQ7XG5cdFx0XHRpZiAocmVzcG9uc2VJZCAhPT0gdW5kZWZpbmVkICYmIGNhbmNlbGxlZElkcy5oYXMocmVzcG9uc2VJZCkpIHtcblx0XHRcdFx0dGhpcy5fYXVkaW9RdWV1ZS5zcGxpY2UoaSwgMSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFJlbWVtYmVyIHRoZSBpZHMgc28gdHJhaWxpbmcgY2h1bmtzIChvciBhIG5hcnJhdGlvbiB3aG9zZSBhdWRpbyBoYXNcblx0XHQvLyBub3Qgc3RhcnRlZCBhcnJpdmluZyB5ZXQpIGFyZSBzd2FsbG93ZWQgaW4gdGhlIGF1ZGlvX3Jlc3BvbnNlIGhhbmRsZXIuXG5cdFx0Ly8gQm91bmQgdGhlIHNldCBzbyBpZHMgdGhhdCBuZXZlciB5aWVsZCBhdWRpbyBjYW4ndCBsZWFrIGFjcm9zcyBhIGxvbmdcblx0XHQvLyBzZXNzaW9uLlxuXHRcdGZvciAoY29uc3QgaWQgb2YgY2FuY2VsbGVkSWRzKSB7XG5cdFx0XHRpZiAodGhpcy5fY2FuY2VsbGVkUGVuZGluZ05hcnJhdGlvbklkcy5zaXplID49IDY0KSB7XG5cdFx0XHRcdGNvbnN0IG9sZGVzdCA9IHRoaXMuX2NhbmNlbGxlZFBlbmRpbmdOYXJyYXRpb25JZHMudmFsdWVzKCkubmV4dCgpLnZhbHVlO1xuXHRcdFx0XHRpZiAob2xkZXN0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9jYW5jZWxsZWRQZW5kaW5nTmFycmF0aW9uSWRzLmRlbGV0ZShvbGRlc3QpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jYW5jZWxsZWRQZW5kaW5nTmFycmF0aW9uSWRzLmFkZChpZCk7XG5cdFx0fVxuXHRcdC8vIEEgY29uZmlybWF0aW9uIG5hcnJhdGlvbiBtYXkgYWxyZWFkeSBoYXZlIGJlZW4gYnVmZmVyZWQgZm9yIGFuXG5cdFx0Ly8gdW5mb2N1c2VkIHNlc3Npb24gKGluIF9kZWZlcnJlZFJlc3BvbnNlcyk7IHRoZSBxdWV1ZSBzcGxpY2UgYWJvdmUgYW5kXG5cdFx0Ly8gdGhlIGF1ZGlvX3Jlc3BvbnNlIGRyb3Agb25seSBndWFyZCB0aGUgTElWRSBxdWV1ZSwgc28gcHVyZ2UgdGhvc2Vcblx0XHQvLyBkZWZlcnJlZCBidWZmZXJzIHRvbyBvciB0aGUgcmVzb2x2ZWQgYXBwcm92YWwgcmVwbGF5cyBvbiBuZXh0IGZvY3VzLlxuXHRcdGZvciAoY29uc3QgW2tleSwgcmVzcG9uc2VzXSBvZiB0aGlzLl9kZWZlcnJlZFJlc3BvbnNlcykge1xuXHRcdFx0Y29uc3Qga2VwdCA9IHJlc3BvbnNlcy5maWx0ZXIociA9PiByLnJlc3BvbnNlSWQgPT09IHVuZGVmaW5lZCB8fCAhY2FuY2VsbGVkSWRzLmhhcyhyLnJlc3BvbnNlSWQpKTtcblx0XHRcdGlmIChrZXB0Lmxlbmd0aCA9PT0gcmVzcG9uc2VzLmxlbmd0aCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChrZXB0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9kZWZlcnJlZFJlc3BvbnNlcy5kZWxldGUoa2V5KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2RlZmVycmVkUmVzcG9uc2VzLnNldChrZXksIGtlcHQpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVGhlIGJ1ZmZlcmVkIGNvbmZpcm1hdGlvbiBtYXkgaGF2ZSBiZWVuIHRoZSBpbmRpY2F0b3IncyBvbmx5IG93bmVyLlxuXHRcdFx0dGhpcy5fbWF5YmVIaWRlSW5kaWNhdG9yKGtleSk7XG5cdFx0fVxuXHRcdC8vIFJldGlyZSB0aGUgcGVyLXJlc3BvbnNlIHJvdXRlIGZvciBlYWNoIGNhbmNlbGxlZCBpZDogdGhlIGF1ZGlvX3Jlc3BvbnNlXG5cdFx0Ly8gaGFuZGxlciByZXR1cm5zIGVhcmx5IGZvciB0aGVzZSAoYmVmb3JlIGl0cyBub3JtYWwgZW5kLW9mLXN0cmVhbVxuXHRcdC8vIGNsZWFudXApLCBzbyB0aGVpciBfcmVzcG9uc2VSb3V0ZXMgZW50cmllcyB3b3VsZCBvdGhlcndpc2UgbGVhay5cblx0XHRmb3IgKGNvbnN0IGlkIG9mIGNhbmNlbGxlZElkcykge1xuXHRcdFx0dGhpcy5fcmVzcG9uc2VSb3V0ZXMuZGVsZXRlKGlkKTtcblx0XHR9XG5cdFx0Ly8gSWYgb25lIG9mIHRoZSBjYW5jZWxsZWQgbmFycmF0aW9ucyBpcyB3aGF0J3MgY3VycmVudGx5IHBsYXlpbmcsIGN1dCBpdFxuXHRcdC8vIG9mZi4gTWFyayBpdCBpbnRlcnJ1cHRlZCBmaXJzdCBzbyBvblBsYXliYWNrU3RvcHBlZCBkb2Vzbid0IHRyZWF0IGl0IGFzXG5cdFx0Ly8gXCJoZWFyZFwiOyB0aGF0IGhhbmRsZXIgdGhlbiByZXNldHMgdGhlIHNsb3QsIGRyYWlucyB0aGUgcXVldWUgYW5kXG5cdFx0Ly8gcmVzdG9yZXMgaWRsZSAvIGhhbmRzLWZyZWUgbGlzdGVuaW5nLlxuXHRcdGlmICh0aGlzLl9jdXJyZW50UGxheWJhY2tSZXNwb25zZUlkICE9PSB1bmRlZmluZWQgJiYgY2FuY2VsbGVkSWRzLmhhcyh0aGlzLl9jdXJyZW50UGxheWJhY2tSZXNwb25zZUlkKSkge1xuXHRcdFx0dGhpcy5fc3RvcEN1cnJlbnRQbGF5YmFja0FzSW50ZXJydXB0ZWQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9lbnF1ZXVlQXVkaW8oc2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGF1ZGlvOiBzdHJpbmcsIGlzRmlyc3RDaHVuazogYm9vbGVhbiwgaXNGaW5hbDogYm9vbGVhbiwgdHJhbnNjcmlwdDogc3RyaW5nIHwgdW5kZWZpbmVkLCByZXNwb25zZUlkPzogc3RyaW5nLCBuYXJyYXRpb24/OiBJUGxheWJhY2tOYXJyYXRpb24pOiB2b2lkIHtcblx0XHRjb25zdCBpc0NoZWNrcG9pbnROYXJyYXRpb24gPSBuYXJyYXRpb24/LmtpbmQgPT09ICdjaGVja3BvaW50Jztcblx0XHQvLyBBbiBpbmNvbWluZyByZXNwb25zZSBmcmFtZSBtZWFucyB0aGUgYXNzaXN0YW50IGlzIGFjdGl2ZWx5IHJlcGx5aW5nLCBzb1xuXHRcdC8vIGNhbmNlbCBhbnkgcGVuZGluZyBhdXRvLWxpc3Rlbi4gT3RoZXJ3aXNlIGEgZGVib3VuY2VkIGxpc3RlbiBzY2hlZHVsZWRcblx0XHQvLyB3aGVuIHRoZSBwcmV2aW91cyBzZXNzaW9uJ3MgcGxheWJhY2sgc3RvcHBlZCBjYW4gZmlyZSBtaWQtcmVzcG9uc2UgYW5kXG5cdFx0Ly8gaXRzIHN5bnRoZXRpYyBwdHREb3duIHN1cHByZXNzZXMgdGhpcyBzZXNzaW9uJ3MgYXVkaW8uIFRoaXMgbWF0dGVycyBtb3N0XG5cdFx0Ly8gd2hlbiBhIHJlc3BvbnNlIGxlYWRzIHdpdGggYSB0cmFuc2NyaXB0LW9ubHkgZnJhbWUgKGVtcHR5IGF1ZGlvKTogaXRcblx0XHQvLyBjb25zdW1lcyB0aGUgZmlyc3QtY2h1bmsgZmxhZyB3aXRob3V0IHN0YXJ0aW5nIHBsYXliYWNrLCBzbyB0aGUgbGF0ZXJcblx0XHQvLyBhdWRpbyBjaHVua3MgYXJyaXZlIGFzIG5vbi1maXJzdCBjaHVua3MgYW5kIHdvdWxkIGJlIGRyb3BwZWQuXG5cdFx0dGhpcy5fY2xlYXJBdXRvTGlzdGVuVGltZXIoKTtcblxuXHRcdC8vIFVzZXIgaW50ZXJydXB0ZWQgKHB0dERvd24gLyBvblNwZWVjaFN0YXJ0ZWQgLyBiYXJnZV9pbik6IGRyb3AgbGF0ZSBjaHVua3MgZnJvbSB0aGVcblx0XHQvLyBwcmV2aW91cyB0dXJuLiBUaGUgYmFja2VuZCBtYXJrcyB0aGUgZmlyc3QgYXVkaW8gY2h1bmsgb2YgYSBuZXdcblx0XHQvLyByZXNwb25zZSB3aXRoIGBpc19maXJzdF9jaHVuazogdHJ1ZWAgXHUyMDE0IHRoYXQncyBvdXIgc2lnbmFsIHRoYXQgYSBmcmVzaFxuXHRcdC8vIHJlc3BvbnNlIGlzIHN0YXJ0aW5nIGFuZCBzdXBwcmVzc2lvbiBzaG91bGQgY2xlYXIuIChXZSBjYW4ndCBrZXkgb25cblx0XHQvLyBgdHJhbnNjcmlwdGAgaGVyZSBhbnltb3JlIGJlY2F1c2UgdGhlIHN0cmVhbWluZyBwaXBlbGluZSBzZW5kcyBhXG5cdFx0Ly8gcnVubmluZy1jb25jYXQgdHJhbnNjcmlwdCBvbiBldmVyeSBjaHVuaywgaW5jbHVkaW5nIGxhdGUgY2h1bmtzIG9mXG5cdFx0Ly8gdGhlIHN1cHByZXNzZWQgcHJldmlvdXMgcmVzcG9uc2UuKVxuXHRcdGlmICh0aGlzLl9zdXBwcmVzc0luY29taW5nQXVkaW8pIHtcblx0XHRcdGlmIChpc0ZpcnN0Q2h1bmspIHtcblx0XHRcdFx0dGhpcy5fc3VwcHJlc3NJbmNvbWluZ0F1ZGlvID0gZmFsc2U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGlzRmlyc3RDaHVuayAmJiAhaXNDaGVja3BvaW50TmFycmF0aW9uKSB7XG5cdFx0XHR0aGlzLl9jbGVhckF3YWl0aW5nUmVwbHkoKTtcblx0XHR9XG5cblx0XHQvLyBJZiBub3RoaW5nIGlzIHBsYXlpbmcgYW5kIHF1ZXVlIGlzIGVtcHR5LCBvciBzYW1lIHNlc3Npb24gaXMgcGxheWluZywgcGxheSBpbW1lZGlhdGVseVxuXHRcdGNvbnN0IG5vdGhpbmdQbGF5aW5nID0gdGhpcy5fY3VycmVudFBsYXliYWNrU2Vzc2lvbklkID09PSBudWxsO1xuXHRcdGNvbnN0IHNhbWVTZXNzaW9uID0gIW5vdGhpbmdQbGF5aW5nICYmIHRoaXMuX2N1cnJlbnRQbGF5YmFja1Nlc3Npb25JZCA9PT0gc2Vzc2lvbklkO1xuXHRcdC8vIE9ubHkgZmFzdC1wYXRoIENPTlRJTlVBVElPTiBjaHVua3Mgb2YgdGhlIHJlc3BvbnNlIHRoYXQgaXMgY3VycmVudGx5XG5cdFx0Ly8gcGxheWluZyAoc2FtZSBzZXNzaW9uLCBub3QgYSBmaXJzdCBjaHVuaywgYW5kIG5vdCB5ZXQgZmluYWxpemVkKS4gQVxuXHRcdC8vIGZpcnN0IGNodW5rIGFsd2F5cyBiZWdpbnMgYSBORVcgcmVzcG9uc2U6IGV2ZW4gZm9yIHRoZSBzYW1lIHNlc3Npb24gaXRcblx0XHQvLyBtdXN0IG5ldmVyIGJlIGFwcGVuZGVkIHRvIHRoZSBjdXJyZW50IHBsYXliYWNrIHR1cm4sIG9yIGFuIG92ZXJsYXBwaW5nXG5cdFx0Ly8gcmVzcG9uc2UncyBhdWRpbyBpcyBwdXNoZWQgcGFzdCB0aGUgY3VycmVudCB0dXJuJ3Mgc2NoZWR1bGVkXG5cdFx0Ly8gYG5vZGUuc3RvcCgpYCBib3VuZGFyeSBhbmQgb25lIG9mIHRoZSB0d28gc3RyZWFtcyBpcyBzaWxlbnRseSBkcm9wcGVkLlxuXHRcdC8vIE9uY2UgdGhlIGN1cnJlbnQgcmVzcG9uc2UncyBmaW5hbCBjaHVuayBoYXMgYmVlbiBzZW50LCB0aGUgVFRTXG5cdFx0Ly8gc2VydmljZSdzIHNpbmdsZSBwbGF5YmFjayB0dXJuIGhhcyBzY2hlZHVsZWQgYG5vZGUuc3RvcCgpYCBhdCB0aGF0XG5cdFx0Ly8gcmVzcG9uc2UncyBib3VuZGFyeSwgc28gYSBjb250aW51YXRpb24gbXVzdCBzZXJpYWxpemUgdGhyb3VnaCB0aGUgcXVldWVcblx0XHQvLyB0b28gLSBmb3JjaW5nIGEgZnJlc2ggdHVybiBvbmNlIHRoZSBjdXJyZW50IG9uZSBmaW5pc2hlcy5cblx0XHRjb25zdCBjb250aW51YXRpb25PZkN1cnJlbnQgPSBzYW1lU2Vzc2lvbiAmJiAhaXNGaXJzdENodW5rICYmICF0aGlzLl9jdXJyZW50UGxheWJhY2tGaW5hbGl6ZWQ7XG5cdFx0aWYgKChub3RoaW5nUGxheWluZyAmJiB0aGlzLl9hdWRpb1F1ZXVlLmxlbmd0aCA9PT0gMCkgfHwgY29udGludWF0aW9uT2ZDdXJyZW50KSB7XG5cdFx0XHR0aGlzLl9wbGF5Q2h1bmsoc2Vzc2lvbklkLCBhdWRpbywgaXNGaXJzdENodW5rLCBpc0ZpbmFsLCB0cmFuc2NyaXB0LCByZXNwb25zZUlkLCBuYXJyYXRpb24pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFF1ZXVlIHRoaXMgY2h1bmsuIEEgcmVzcG9uc2UncyBjaHVua3MgbXVzdCBuZXZlciBtZXJnZSB3aXRoIGEgRElGRkVSRU5UXG5cdFx0Ly8gcmVzcG9uc2UgZm9yIHRoZSBzYW1lIHNlc3Npb246IHBsYXlpbmcgYSBsYXRlciByZXNwb25zZSdzIGF1ZGlvIGludG8gYW5cblx0XHQvLyBhbHJlYWR5LWZpbmFsaXplZCBlbnRyeSdzIGJ1ZmZlciB3b3VsZCBwdXNoIGl0IHBhc3QgdGhhdCBlbnRyeSdzXG5cdFx0Ly8gc2NoZWR1bGVkIGBub2RlLnN0b3AoKWAgYW5kIHNpbGVudGx5IGRyb3AgaXQuIFNvIGV2ZXJ5IGZpcnN0IGNodW5rXG5cdFx0Ly8gc3RhcnRzIGEgZnJlc2ggZW50cnk7IGNvbnRpbnVhdGlvbiBjaHVua3MgYXR0YWNoIHRvIHRoYXQgc2Vzc2lvbidzIG1vc3Rcblx0XHQvLyByZWNlbnQgc3RpbGwtb3BlbiAobm90LXlldC1maW5hbGl6ZWQpIGVudHJ5LlxuXHRcdGxldCBlbnRyeSA9IGlzRmlyc3RDaHVua1xuXHRcdFx0PyB1bmRlZmluZWRcblx0XHRcdDogWy4uLnRoaXMuX2F1ZGlvUXVldWVdLnJldmVyc2UoKS5maW5kKGUgPT5cblx0XHRcdFx0IWUuZmluYWxpemVkICYmIChlLnNlc3Npb25JZCA9PT0gc2Vzc2lvbklkIHx8IChlLnNlc3Npb25JZCA9PT0gdW5kZWZpbmVkICYmIHNlc3Npb25JZCA9PT0gdW5kZWZpbmVkKSlcblx0XHRcdCk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0ZW50cnkgPSB7IHNlc3Npb25JZCwgcmVzcG9uc2VJZCwgbmFycmF0aW9uLCBmaW5hbGl6ZWQ6IGZhbHNlLCBjaHVua3M6IFtdIH07XG5cdFx0XHR0aGlzLl9hdWRpb1F1ZXVlLnB1c2goZW50cnkpO1xuXHRcdH1cblx0XHRlbnRyeS5jaHVua3MucHVzaCh7IGF1ZGlvLCBpc0ZpcnN0Q2h1bmssIGlzRmluYWwsIHRyYW5zY3JpcHQgfSk7XG5cdFx0aWYgKGlzRmluYWwpIHtcblx0XHRcdGVudHJ5LmZpbmFsaXplZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgbm90aGluZyBpcyBjdXJyZW50bHkgcGxheWluZywgc3RhcnQgcHJvY2Vzc2luZ1xuXHRcdGlmICh0aGlzLl9jdXJyZW50UGxheWJhY2tTZXNzaW9uSWQgPT09IG51bGwgJiYgIXRoaXMuX2lzUHJvY2Vzc2luZ1F1ZXVlKSB7XG5cdFx0XHR0aGlzLl9wcm9jZXNzUXVldWUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9wbGF5Q2h1bmsoc2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGF1ZGlvOiBzdHJpbmcsIGlzRmlyc3RDaHVuazogYm9vbGVhbiwgaXNGaW5hbDogYm9vbGVhbiwgdHJhbnNjcmlwdDogc3RyaW5nIHwgdW5kZWZpbmVkLCByZXNwb25zZUlkPzogc3RyaW5nLCBuYXJyYXRpb24/OiBJUGxheWJhY2tOYXJyYXRpb24pOiB2b2lkIHtcblx0XHRjb25zdCBpc0NoZWNrcG9pbnROYXJyYXRpb24gPSBuYXJyYXRpb24/LmtpbmQgPT09ICdjaGVja3BvaW50Jztcblx0XHQvLyBTdHJlYW1pbmcgcGlwZWxpbmUgc2VuZHMgYSBtb25vdG9uaWNhbGx5LWdyb3dpbmcgdHJhbnNjcmlwdCBvbiBldmVyeVxuXHRcdC8vIGNodW5rLiBPbiB0aGUgRklSU1QgY2h1bmsgb2YgYSByZXNwb25zZSB3ZSBwdXNoIGEgZnJlc2ggYXNzaXN0YW50XG5cdFx0Ly8gdHVybiBpbnRvIHRoZSByb2xsaW5nIGJ1ZmZlcjsgb24gc3Vic2VxdWVudCBjaHVua3Mgd2UgUkVQTEFDRSB0aGF0XG5cdFx0Ly8gdHVybidzIHRleHQgYXMgdGhlIHRyYW5zY3JpcHQgZ3Jvd3MuIGBfc2V0QXNzaXN0YW50VHVybmAgZG9lcyB0aGVcblx0XHQvLyByaWdodCB0aGluZyBpbiBib3RoIGNhc2VzIChyZXBsYWNlLWlmLXRhaWwtaXMtYXNzaXN0YW50KSwgYnV0IHdlXG5cdFx0Ly8gZ2F0ZSBvbiBgdHJhbnNjcmlwdGAgcHJlc2VuY2Ugc28gZW1wdHktZmluYWwgZGVnZW5lcmF0ZSBmcmFtZXNcblx0XHQvLyBkb24ndCBibGFuayB0aGUgaW4tZmxpZ2h0IHR1cm4uXG5cdFx0aWYgKHRyYW5zY3JpcHQpIHtcblx0XHRcdHRoaXMuX3NldEFzc2lzdGFudFR1cm4odHJhbnNjcmlwdCwgeyBzdGFydE5ld1R1cm46IGlzRmlyc3RDaHVuayB9KTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uSWQgPyBVUkkucGFyc2Uoc2Vzc2lvbklkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHR0aGlzLnZvaWNlUGxheWJhY2tTZXJ2aWNlLm5vdGlmeVBsYXliYWNrU3RhcnQoc2Vzc2lvblJlc291cmNlLCB0cmFuc2NyaXB0KTtcblx0XHR9XG5cblx0XHRjb25zdCBzcGVha1Jlc3BvbnNlc0VuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdhZ2VudHMudm9pY2Uuc3BlYWtSZXNwb25zZXMnKSAhPT0gZmFsc2U7XG5cdFx0aWYgKHNwZWFrUmVzcG9uc2VzRW5hYmxlZCAmJiBhdWRpbykge1xuXHRcdFx0Ly8gQ2xhaW0gdGhlIHBsYXliYWNrIHNsb3Qgb25seSB3aGVuIHdlIGFjdHVhbGx5IGhhdmUgYXVkaW8gdG8gcGxheS5cblx0XHRcdC8vIEEgdHJhbnNjcmlwdC1vbmx5IGZyYW1lIChlbXB0eSBhdWRpbykgbXVzdCBOT1QgY2xhaW0gaXQsIG9yIHRoZVxuXHRcdFx0Ly8gc2xvdCB3b3VsZCBzdGF5IHBpbm5lZCB0byBhIHNlc3Npb24gdGhhdCBuZXZlciBzdGFydHMgcGxheWJhY2tcblx0XHRcdC8vIChvblBsYXliYWNrU3RvcHBlZCBuZXZlciBmaXJlcyksIGRlYWRsb2NraW5nIGV2ZXJ5IG90aGVyXG5cdFx0XHQvLyBzZXNzaW9uJ3MgcXVldWVkIGF1ZGlvLlxuXHRcdFx0dGhpcy5fY3VycmVudFBsYXliYWNrU2Vzc2lvbklkID0gc2Vzc2lvbklkO1xuXHRcdFx0Ly8gVHJhY2sgdGhlIHJlc3BvbnNlIG5vdyBvY2N1cHlpbmcgdGhlIHNsb3Qgc28gb25QbGF5YmFja1N0b3BwZWQgY2FuXG5cdFx0XHQvLyBtYXJrIGl0IGhlYXJkIG9uY2UgaXRzIGF1ZGlvIHRydWx5IGZpbmlzaGVzIChub3QgbWVyZWx5IHF1ZXVlZCkuXG5cdFx0XHR0aGlzLl9jdXJyZW50UGxheWJhY2tSZXNwb25zZUlkID0gcmVzcG9uc2VJZDtcblx0XHRcdHRoaXMuX2N1cnJlbnRQbGF5YmFja05hcnJhdGlvbiA9IG5hcnJhdGlvbjtcblx0XHRcdC8vIEEgc2FtZS1zZXNzaW9uIGZyYW1lIGFycml2aW5nIGFmdGVyIHRoZSBmaW5hbCBjaHVuayBpcyBhIE5FV1xuXHRcdFx0Ly8gcmVzcG9uc2UgYW5kIG11c3QgYmUgc2VyaWFsaXplZCAoc2VlIGBfZW5xdWV1ZUF1ZGlvYCkuXG5cdFx0XHR0aGlzLl9jdXJyZW50UGxheWJhY2tGaW5hbGl6ZWQgPSBpc0ZpbmFsO1xuXHRcdFx0dGhpcy5fY2xlYXJBdXRvTGlzdGVuVGltZXIoKTtcblx0XHRcdGlmICghaXNDaGVja3BvaW50TmFycmF0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX3JlcGx5UGxheWVkU2luY2VTZW5kID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3ZvaWNlU3RhdGUuc2V0KCdzcGVha2luZycsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9zdGF0dXNUZXh0LnNldCgnU3BlYWtpbmcuLi4nLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy50dHNQbGF5YmFja1NlcnZpY2UucGxheUF1ZGlvQ2h1bmsoYXVkaW8sIGlzRmluYWwsIHRoaXMuX3dpbmRvdyEpO1xuXHRcdFx0aWYgKHRoaXMuX2lzSGFuZHNGcmVlRW5hYmxlZCgpKSB7XG5cdFx0XHRcdC8vIEhhbmRzLWZyZWU6IGtlZXAgdGhlIG1pYyBzdHJlYW1pbmcgd2hpbGUgdGhlIGFzc2lzdGFudCBzcGVha3Mgc29cblx0XHRcdFx0Ly8gdGhlIGJhY2tlbmQncyBzZXJ2ZXItVkFEIGNhbiBoZWFyIHRoZSB1c2VyIGJhcmdlIGluIG92ZXIgaXQuIFRoZVxuXHRcdFx0XHQvLyBiYWNrZW5kIHNpZ25hbHMgYSByZWFsIGludGVycnVwdGlvbiB2aWEgYHNwZWVjaF9zdGFydGVkYCAvIGBiYXJnZV9pbmBcblx0XHRcdFx0Ly8gKGFscmVhZHkgd2lyZWQgdG8gc3RvcCBwbGF5YmFjayk7IHVudGlsIHRoZW4gdGhpcyBpcyBhIHBhc3NpdmUsXG5cdFx0XHRcdC8vIG5vbi1pbnRlcnJ1cHRpbmcgbGlzdGVuIHRoYXQgYmVjb21lcyB0aGUgbmV4dCBsaXN0ZW5pbmcgdHVybiBpZiB0aGVcblx0XHRcdFx0Ly8gdXNlciBzdGF5cyBzaWxlbnQuXG5cdFx0XHRcdHRoaXMuX3N0YXJ0QmFyZ2VJbkxpc3RlbigpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5taWNDYXB0dXJlU2VydmljZS5zdXBwcmVzc1VudGlsKERhdGUubm93KCkgKyA4MDApO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoIXNwZWFrUmVzcG9uc2VzRW5hYmxlZCkge1xuXHRcdFx0aWYgKCFpc0NoZWNrcG9pbnROYXJyYXRpb24pIHtcblx0XHRcdFx0dGhpcy5fcmVwbHlQbGF5ZWRTaW5jZVNlbmQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzRmluYWwpIHtcblx0XHRcdFx0dGhpcy5fY3VycmVudFBsYXliYWNrU2Vzc2lvbklkID0gbnVsbDtcblx0XHRcdFx0dGhpcy5fY3VycmVudFBsYXliYWNrUmVzcG9uc2VJZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fY3VycmVudFBsYXliYWNrTmFycmF0aW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0XHQvLyBTcGVlY2ggaXMgZGlzYWJsZWQgc28gbm8gYXVkaW8gcGxheXMgYW5kIG9uUGxheWJhY2tTdG9wcGVkIHdvbid0XG5cdFx0XHRcdC8vIGZpcmU6IHRoZSByZXBseSBpcyBub25ldGhlbGVzcyBjb25zdW1lZCwgc28gbWFyayB0aGUgc29saWNpdGVkXG5cdFx0XHRcdC8vIG5hcnJhdGlvbiBoZWFyZCBoZXJlIHRvIGNsZWFyIGl0cyBwZW5kaW5nIGluZGljYXRvci5cblx0XHRcdFx0aWYgKHJlc3BvbnNlSWQpIHtcblx0XHRcdFx0XHRpZiAoc2Vzc2lvbklkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9ub3RpZnlDaGVja3BvaW50UGxheWJhY2tDb21wbGV0ZShzZXNzaW9uSWQsIHJlc3BvbnNlSWQsIG5hcnJhdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX21hcmtOYXJyYXRpb25IZWFyZChyZXNwb25zZUlkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBBdm9pZCByZS1lbnRlcmluZyBfcHJvY2Vzc1F1ZXVlIGlmIHdlJ3JlIGFscmVhZHkgaW5zaWRlIGl0c1xuXHRcdFx0XHQvLyBkcmFpbiBsb29wOyB0aGF0IGxvb3Agd2lsbCBjb250aW51ZSBvbiBpdHMgb3duLlxuXHRcdFx0XHRpZiAoIXRoaXMuX2lzUHJvY2Vzc2luZ1F1ZXVlKSB7XG5cdFx0XHRcdFx0dGhpcy5fcHJvY2Vzc1F1ZXVlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuX2lzSGFuZHNGcmVlRW5hYmxlZCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2NoZWR1bGVBdXRvTGlzdGVuKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVFRTIGVuYWJsZWQgYnV0IG5vIGF1ZGlvIGluIHRoaXMgZnJhbWUuIEZvcndhcmQgaXQgc28gYSBmaW5hbFxuXHRcdFx0Ly8gZnJhbWUgY2FuIGZsdXNoL3N0b3AgYW4gaW4tZmxpZ2h0IHBsYXliYWNrIHR1cm47IGEgbm9uLWZpbmFsXG5cdFx0XHQvLyBlbXB0eSBmcmFtZSBpcyBhIG5vLW9wIGFuZCBsZWF2ZXMgdGhlIHNsb3QgdW50b3VjaGVkLlxuXHRcdFx0Ly8gSWYgdGhpcyBlbXB0eSBmcmFtZSBmaW5hbGl6ZXMgdGhlIGN1cnJlbnRseS1wbGF5aW5nIHJlc3BvbnNlLFxuXHRcdFx0Ly8gbWFyayBpdCBzbyBhIGxhdGVyIHNhbWUtc2Vzc2lvbiBmcmFtZSBzZXJpYWxpemVzIGFzIGEgbmV3IHR1cm4uXG5cdFx0XHRpZiAoaXNGaW5hbCAmJiB0aGlzLl9jdXJyZW50UGxheWJhY2tTZXNzaW9uSWQgPT09IHNlc3Npb25JZCkge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50UGxheWJhY2tGaW5hbGl6ZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy50dHNQbGF5YmFja1NlcnZpY2UucGxheUF1ZGlvQ2h1bmsoYXVkaW8sIGlzRmluYWwsIHRoaXMuX3dpbmRvdyEpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Byb2Nlc3NRdWV1ZSgpOiB2b2lkIHtcblx0XHQvLyBEcmFpbiBlbnRyaWVzIHVudGlsIG9uZSBhY3R1YWxseSBjbGFpbXMgdGhlIHBsYXliYWNrIHNsb3QgKHN0YXJ0c1xuXHRcdC8vIGF1ZGlvKSBvciB0aGUgcXVldWUgZW1wdGllcy4gRW50cmllcyB0aGF0IHByb2R1Y2Ugbm8gYXVkaW8gKGUuZy5cblx0XHQvLyB0cmFuc2NyaXB0LW9ubHkgZnJhbWVzKSB3b3VsZCBvdGhlcndpc2Ugc3RhbGwgdGhlIGNoYWluLCBzaW5jZVxuXHRcdC8vIG5vdGhpbmcgZmlyZXMgb25QbGF5YmFja1N0b3BwZWQgdG8gcHVtcCB0aGUgbmV4dCBlbnRyeS5cblx0XHR0aGlzLl9pc1Byb2Nlc3NpbmdRdWV1ZSA9IHRydWU7XG5cdFx0d2hpbGUgKHRoaXMuX2N1cnJlbnRQbGF5YmFja1Nlc3Npb25JZCA9PT0gbnVsbCAmJiB0aGlzLl9hdWRpb1F1ZXVlLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IG5leHQgPSB0aGlzLl9hdWRpb1F1ZXVlLnNoaWZ0KCkhO1xuXHRcdFx0Zm9yIChjb25zdCBjaHVuayBvZiBuZXh0LmNodW5rcykge1xuXHRcdFx0XHR0aGlzLl9wbGF5Q2h1bmsobmV4dC5zZXNzaW9uSWQsIGNodW5rLmF1ZGlvLCBjaHVuay5pc0ZpcnN0Q2h1bmssIGNodW5rLmlzRmluYWwsIGNodW5rLnRyYW5zY3JpcHQsIG5leHQucmVzcG9uc2VJZCwgbmV4dC5uYXJyYXRpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9pc1Byb2Nlc3NpbmdRdWV1ZSA9IGZhbHNlO1xuXHR9XG5cblx0Ly8gLS0tIFJlcGxheSBmcm9tIGNhY2hlIC0tLVxuXG5cdHByaXZhdGUgX3JlcGxheVNlc3Npb25BdWRpbyhzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3N0b3BSZXBsYXkoKTtcblxuXHRcdGNvbnN0IHNhbXBsZXMgPSB0aGlzLl9zZXNzaW9uQXVkaW9DYWNoZS5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIXNhbXBsZXMgfHwgIXRoaXMuX3dpbmRvdykgeyByZXR1cm47IH1cblxuXHRcdGNvbnN0IGN0eCA9IHRoaXMudHRzUGxheWJhY2tTZXJ2aWNlLmVuc3VyZUNvbnRleHQodGhpcy5fd2luZG93KTtcblx0XHRjb25zdCBidWZmZXIgPSBjdHguY3JlYXRlQnVmZmVyKDEsIHNhbXBsZXMubGVuZ3RoLCAyNDAwMCk7XG5cdFx0YnVmZmVyLmdldENoYW5uZWxEYXRhKDApLnNldChzYW1wbGVzKTtcblxuXHRcdGNvbnN0IHNvdXJjZSA9IGN0eC5jcmVhdGVCdWZmZXJTb3VyY2UoKTtcblx0XHRzb3VyY2UuYnVmZmVyID0gYnVmZmVyO1xuXHRcdHNvdXJjZS5jb25uZWN0KGN0eC5kZXN0aW5hdGlvbik7XG5cdFx0dGhpcy5fcmVwbGF5U291cmNlTm9kZSA9IHNvdXJjZTtcblxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZShzZXNzaW9uSWQpO1xuXHRcdHRoaXMudm9pY2VQbGF5YmFja1NlcnZpY2Uubm90aWZ5UGxheWJhY2tTdGFydChzZXNzaW9uUmVzb3VyY2UsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fdm9pY2VTdGF0ZS5zZXQoJ3NwZWFraW5nJywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9zdGF0dXNUZXh0LnNldCgnUmVwbGF5aW5nLi4uJywgdW5kZWZpbmVkKTtcblxuXHRcdHNvdXJjZS5vbmVuZGVkID0gKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3JlcGxheVNvdXJjZU5vZGUgPT09IHNvdXJjZSkge1xuXHRcdFx0XHR0aGlzLl9yZXBsYXlTb3VyY2VOb2RlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLnZvaWNlUGxheWJhY2tTZXJ2aWNlLm5vdGlmeVBsYXliYWNrRW5kKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuX3ZvaWNlU3RhdGUuc2V0KCdpZGxlJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5fc3RhdHVzVGV4dC5zZXQoJ0hvbGQgdG8gc3BlYWsuLi4nLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRzb3VyY2Uuc3RhcnQoMCk7XG5cdH1cblxuXHRwcml2YXRlIF9zdG9wUmVwbGF5KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9yZXBsYXlTb3VyY2VOb2RlKSB7XG5cdFx0XHR0cnkgeyB0aGlzLl9yZXBsYXlTb3VyY2VOb2RlLnN0b3AoKTsgfSBjYXRjaCB7IC8qIGFscmVhZHkgc3RvcHBlZCAqLyB9XG5cdFx0XHR0aGlzLl9yZXBsYXlTb3VyY2VOb2RlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBQcml2YXRlIGhlbHBlcnMgLS0tXG5cblx0cHJpdmF0ZSBfc2VuZENvbnRleHQoKTogdm9pZCB7XG5cdFx0dGhpcy52b2ljZUNsaWVudFNlcnZpY2Uuc2VuZFNlc3Npb25Db250ZXh0KHRoaXMuX2J1aWxkU2Vzc2lvbkNvbnRleHQoKSk7XG5cdH1cblxuXHQvKipcblx0ICogKFJlKWFybSB0aGUgc2V0dGxlIHRpbWVyIHRoYXQgZW1pdHMgYnVmZmVyZWQgc2Vzc2lvbiBzdGF0ZSBjaGFuZ2VzLiBFYWNoXG5cdCAqIGRldGVjdGVkIHRyYW5zaXRpb24gcmVzZXRzIHRoZSB0aW1lciwgc28gYSByYXBpZCBidXJzdCAoZS5nLiB0aGUgaGlzdG9yeVxuXHQgKiByZXBsYXkgYGB0aGlua2luZyA8LT4gaWRsZWBgIHN0b3JtKSBpcyBjb2xsYXBzZWQgdG8gb25lIGVtaXNzaW9uIG9uY2UgdGhlXG5cdCAqIHN0YXRlIHN0b3BzIGNoYW5naW5nLiBTZWUge0BsaW5rIF9wZW5kaW5nU3RhdGVDaGFuZ2VzfS5cblx0ICovXG5cdHByaXZhdGUgX3NjaGVkdWxlU3RhdGVDaGFuZ2VFbWl0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZUNoYW5nZUVtaXRUaW1lcikge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3N0YXRlQ2hhbmdlRW1pdFRpbWVyKTtcblx0XHR9XG5cdFx0dGhpcy5fc3RhdGVDaGFuZ2VFbWl0VGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX3N0YXRlQ2hhbmdlRW1pdFRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fZW1pdFBlbmRpbmdTdGF0ZUNoYW5nZXMoKTtcblx0XHR9LCBWb2ljZVNlc3Npb25Db250cm9sbGVyLl9TVEFURV9DSEFOR0VfU0VUVExFX01TKTtcblx0fVxuXG5cdC8qKiBSZWFjdCB0byBhIHNlc3Npb24gcmVhY2hpbmcgYSBuYXJyYXRhYmxlIHN0YXRlLiBJZiBpdCdzIHRoZSBzaG93biBzZXNzaW9uLCBzcGVhayBpdCBub3c7IGEgY29tcGxldGVkIHJlcGx5IG9uIGEgYmFja2dyb3VuZCBzZXNzaW9uIGluc3RlYWQgc2hvd3MgdGhlIHNlc3Npb25zLWxpc3QgcGVuZGluZyBpbmRpY2F0b3IgYW5kIGlzIHJlYWQgd2hlbiBmb2N1c2VkLiBBIG5ldyB0dXJuIChgdGhpbmtpbmdgKSBjbGVhcnMgYm90aCB0aGUgZGVkdXAgYW5kIGFueSBzdGFsZSBwZW5kaW5nIGluZGljYXRvci4gKi9cblx0cHJpdmF0ZSBfaGFuZGxlTmFycmF0YWJsZVN0YXRlQ2hhbmdlKHNlc3Npb25JZDogc3RyaW5nLCBjdXJyZW50U3RhdGU6IHN0cmluZywgZGV0YWlsOiBzdHJpbmcgfCB1bmRlZmluZWQsIGxhc3RSZXNwb25zZVN1bW1hcnk6IHN0cmluZyB8IHVuZGVmaW5lZCwgc2hvd25Ob3c6IHN0cmluZyB8IHVuZGVmaW5lZCwgY29uZmlybWF0aW9uVHlwZT86IFZvaWNlQ29uZmlybWF0aW9uVHlwZSk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSB0aGlzLl9zZXNzaW9uS2V5KHNlc3Npb25JZCk7XG5cdFx0aWYgKGN1cnJlbnRTdGF0ZSA9PT0gJ2lkbGUnIHx8IGN1cnJlbnRTdGF0ZSA9PT0gJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicpIHtcblx0XHRcdHRoaXMuX2NhbmNlbFZvaWNlUHJvZ3Jlc3Moc2Vzc2lvbklkKTtcblx0XHR9XG5cdFx0aWYgKGN1cnJlbnRTdGF0ZSA9PT0gJ3RoaW5raW5nJykge1xuXHRcdFx0dGhpcy5fY2xlYXJMYXN0TmFycmF0ZWRUZXh0KHNlc3Npb25LZXkpO1xuXHRcdFx0Ly8gQSBuZXcgdHVybiBzdXBlcnNlZGVzIGFueSBjb21wbGV0ZWQgcmVwbHkgdGhhdCB3YXMgd2FpdGluZyB0byBiZVxuXHRcdFx0Ly8gcmVhZCBvbiBmb2N1cyAtIGRyb3AgdGhlIHN0YWxlIHBlbmRpbmctcmVzcG9uc2UgaW5kaWNhdG9yLlxuXHRcdFx0dGhpcy5fY2xlYXJQZW5kaW5nUmVzcG9uc2Uoc2Vzc2lvbktleSk7XG5cdFx0XHQvLyBBIGRlZmVycmVkIG5hcnJhdGlvbiBmcm9tIHRoZSBwcmV2aW91cyB0dXJuIGlzIG5vdyBzdGFsZS5cblx0XHRcdHRoaXMuX2NsZWFyRGVmZXJyZWQoc2Vzc2lvbktleSk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5faXNTYW1lU2Vzc2lvbihzZXNzaW9uSWQsIHNob3duTm93KSkge1xuXHRcdFx0Ly8gQmFja2dyb3VuZCBzZXNzaW9uLiBBIGNvbXBsZXRlZCByZXBseSBtdXN0IG5vdCBwbGF5IG5vdzogc2hvdyB0aGVcblx0XHRcdC8vIHNlc3Npb25zLWxpc3QgaW5kaWNhdG9yIGFuZCByZW1lbWJlciB0aGUgc3VtbWFyeSBzbyBmb2N1c2luZyB0aGVcblx0XHRcdC8vIHNlc3Npb24gcmVhZHMgaXQgKG1pcnJvcnMgdGhlIGNvbmZpcm1hdGlvbiBpbmRpY2F0b3IsIHdoaWNoIGlzXG5cdFx0XHQvLyBjbGllbnQtZHJpdmVuIGFuZCBkb2VzIG5vdCBkZXBlbmQgb24gdGhlIGJhY2tlbmQgc2VuZGluZyBhdWRpbykuXG5cdFx0XHQvLyBDb25maXJtYXRpb25zIGdldCB0aGVpciBvd24gaW5kaWNhdG9yIHZpYVxuXHRcdFx0Ly8gX3JlY29uY2lsZUNvbmZpcm1hdGlvbkluZGljYXRvcnMsIHNvIG9ubHkgcmVzcG9uc2VzIGFyZSBoYW5kbGVkIGhlcmUuXG5cdFx0XHRpZiAoY3VycmVudFN0YXRlID09PSAnaWRsZScgJiYgbGFzdFJlc3BvbnNlU3VtbWFyeSkge1xuXHRcdFx0XHQvLyBTa2lwIGEgcmVwbHkgYWxyZWFkeSByZWFkIGZvciB0aGlzIHNlc3Npb24gKGl0cyBleGFjdCB0ZXh0IGlzIGluXG5cdFx0XHRcdC8vIF9sYXN0TmFycmF0ZWRUZXh0KS4gVGhhdCBtYXAgaXMgY2xlYXJlZCB3aGVuIHRoZSBzZXNzaW9uIHN0YXJ0cyBhXG5cdFx0XHRcdC8vIG5ldyB0dXJuICh0aGlua2luZywgYWJvdmUpLCBzbyBhIGdlbnVpbmVseSBuZXcgcmVwbHkgc3RpbGwgc2hvd3Ncblx0XHRcdFx0Ly8gdGhlIGluZGljYXRvcjsgdGhpcyBvbmx5IHN1cHByZXNzZXMgcmUtaW5kaWNhdGluZyBhbiBvbGQgcmVwbHlcblx0XHRcdFx0Ly8gcmVzdXJmYWNlZCBieSBhIHJlY29ubmVjdC9wb2xsIHN0YXRlIHN5bmMuXG5cdFx0XHRcdGNvbnN0IGFscmVhZHlSZWFkID0gdGhpcy5fbGFzdE5hcnJhdGVkVGV4dC5nZXQoc2Vzc2lvbktleSkgPT09IGxhc3RSZXNwb25zZVN1bW1hcnk7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nU3VtbWFyeSA9IHRoaXMuX3BlbmRpbmdSZXNwb25zZVN1bW1hcmllcy5nZXQoc2Vzc2lvbktleSk7XG5cdFx0XHRcdGlmICghYWxyZWFkeVJlYWQgJiYgZXhpc3RpbmdTdW1tYXJ5ICE9PSBsYXN0UmVzcG9uc2VTdW1tYXJ5KSB7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ1Jlc3BvbnNlU3VtbWFyaWVzLnNldChzZXNzaW9uS2V5LCBsYXN0UmVzcG9uc2VTdW1tYXJ5KTtcblx0XHRcdFx0XHR0aGlzLl9tYXJrUGVuZGluZ1Jlc3BvbnNlKHNlc3Npb25LZXksIHRydWUpO1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSByZXNwb25zZSBjb21wbGV0ZWQgZm9yIHVuZm9jdXNlZCBzZXNzaW9uPSR7c2Vzc2lvbktleS5zbGljZSgtMzIpfTsgc2hvd2luZyBwZW5kaW5nIGluZGljYXRvcmApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChjdXJyZW50U3RhdGUgPT09ICdpZGxlJyAmJiBsYXN0UmVzcG9uc2VTdW1tYXJ5KSB7XG5cdFx0XHQvLyBOYXJyYXRlIHRoZSBzaG93biBzZXNzaW9uJ3MgcmVwbHkgbm93LiBDbGVhciBpdHMgcGVuZGluZyBpbmRpY2F0b3Jcblx0XHRcdC8vIG9ubHkgaWYgaXQgd2FzIEFMUkVBRFkgcmVhZCAoYSByZS1maXJlIG9mIGEgcmVwbHkgd2UgbmFycmF0ZWQgYmVmb3JlKTtcblx0XHRcdC8vIGEgZnJlc2hseSByZXF1ZXN0ZWQgbmFycmF0aW9uIGtlZXBzIHRoZSBpbmRpY2F0b3IgdW50aWwgaXRzIGF1ZGlvXG5cdFx0XHQvLyBmaW5hbGl6ZXMgKF9tYXJrTmFycmF0aW9uSGVhcmQgY2xlYXJzIGl0IHRoZW4pLCBzbyBhIHJlcXVlc3QgdGhhdCBpc1xuXHRcdFx0Ly8gYWNjZXB0ZWQgYnV0IG5ldmVyIHByb2R1Y2VzIGF1ZGlvIGRvZXNuJ3QgbG9zZSB0aGUgcmVwbHkuXG5cdFx0XHRjb25zdCBhbHJlYWR5TmFycmF0ZWQgPSB0aGlzLl9sYXN0TmFycmF0ZWRUZXh0LmdldChzZXNzaW9uS2V5KSA9PT0gbGFzdFJlc3BvbnNlU3VtbWFyeTtcblx0XHRcdHRoaXMuX25hcnJhdGUoc2Vzc2lvbklkLCAncmVzcG9uc2UnLCBsYXN0UmVzcG9uc2VTdW1tYXJ5KTtcblx0XHRcdGlmIChhbHJlYWR5TmFycmF0ZWQpIHtcblx0XHRcdFx0dGhpcy5fY2xlYXJQZW5kaW5nUmVzcG9uc2Uoc2Vzc2lvbktleSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChjdXJyZW50U3RhdGUgPT09ICd3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24nICYmIGRldGFpbCkge1xuXHRcdFx0Ly8gYGRldGFpbGAgaXMgdGhlIHByb3NlIGZsYXR0ZW5pbmcsIHdoaWNoIGZvciBhIHF1ZXN0aW9uIGZvcm0gaXMganVzdFxuXHRcdFx0Ly8gdGhlIHF1ZXN0aW9uIHRpdGxlczsgdGhlIG9wdGlvbnMgdGhlIHVzZXIgaGFzIHRvIGNob29zZSBiZXR3ZWVuIGFyZVxuXHRcdFx0Ly8gbm90IGluIGl0LCBzbyBoZWFyaW5nIGl0IGxlYXZlcyB0aGVtIHdpdGggbm90aGluZyB0byBzYXkgYmFjay4gVXNlXG5cdFx0XHQvLyB0aGUgc3RydWN0dXJlZCByZW5kZXJpbmcgd2hlbmV2ZXIgdGhlIG1vZGVsIGlzIHJlc2lkZW50IGVub3VnaCB0b1xuXHRcdFx0Ly8gcHJvZHVjZSBvbmU7IGEgcmVtb3RlIHNlc3Npb24gd2l0aCBubyBsb2FkZWQgbW9kZWwgc3RpbGwgZ2V0cyB0aGVcblx0XHRcdC8vIHByb3NlLCB3aGljaCBpcyB3aGF0IGl0IGdvdCBiZWZvcmUuXG5cdFx0XHRjb25zdCBxdWVzdGlvbiA9IHRoaXMuX3F1ZXN0aW9uTmFycmF0YWJsZSh0aGlzLl9tb2RlbEZvclNlc3Npb24oc2Vzc2lvbklkKSk7XG5cdFx0XHRpZiAocXVlc3Rpb24pIHtcblx0XHRcdFx0dGhpcy5fbmFycmF0ZShzZXNzaW9uSWQsIHF1ZXN0aW9uLmtpbmQsIHF1ZXN0aW9uLnRleHQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHF1ZXN0aW9uLnBlbmRpbmcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbmFycmF0ZShzZXNzaW9uSWQsICdjb25maXJtYXRpb24nLCBkZXRhaWwsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjb25maXJtYXRpb25UeXBlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKiogVGhlIHJlc2lkZW50IGNoYXQgbW9kZWwgZm9yIGEgc2Vzc2lvbiBpZCwgb3IgYHVuZGVmaW5lZGAgd2hlbiBpdCBpc24ndCBsb2FkZWQgKG9yIHRoZSBpZCBpc24ndCBhIFVSSSkuICovXG5cdHByaXZhdGUgX21vZGVsRm9yU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IElDaGF0TW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdGxldCByZXNvdXJjZTogVVJJO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXNvdXJjZSA9IFVSSS5wYXJzZShzZXNzaW9uSWQpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihyZXNvdXJjZSk7XG5cdH1cblxuXHQvKipcblx0ICogRmx1c2ggdGhlIGNvYWxlc2NlZCBzZXNzaW9uIHN0YXRlIGNoYW5nZXMgdG8gdGhlIGJhY2tlbmQgYW5kIHBlcnNpc3Qgb25seVxuXHQgKiB0cnVlIG5ldCBjaGFuZ2VzIHRvIHRoZSBsb2NhbCB0aW1lbGluZS4ge0BsaW5rIF9zZW5kQ29udGV4dH0gcmVidWlsZHMgdGhlXG5cdCAqIGZ1bGwgY29udGV4dCBmcm9tIHRoZSBub3ctc2V0dGxlZCBtb2RlbCBzdGF0ZSBhbmQgYF9zZW5kRGVsdGFgIG1lcmdlLXBhdGNoZXNcblx0ICogYWdhaW5zdCB0aGUgbGFzdC1zZW50IHNuYXBzaG90LCBzbyBhbiBvc2NpbGxhdGlvbiB0aGF0IHJldHVybmVkIHRvIGl0cyBwcmlvclxuXHQgKiBzdGF0ZSBwcm9kdWNlcyBubyBkZWx0YS4gRWFjaCBidWZmZXJlZCBjaGFuZ2UgY2FycmllcyB0aGUgYnVyc3QncyBiYXNlbGluZVxuXHQgKiAoYGZyb21TdGF0ZWAvYGZyb21EZXRhaWxgKTsgd2UgY29tcGFyZSB0aGUgc2V0dGxlZCBzdGF0ZSBhZ2FpbnN0IGl0IHNvIGFcblx0ICogbmV0LXplcm8gd29iYmxlIGlzIG5laXRoZXIgdHJhY2VkIG5vciBwZXJzaXN0ZWQgYXMgYSBgY29kaW5nX2V2ZW50YCAod2hpY2hcblx0ICogd291bGQgb3RoZXJ3aXNlIHJlcGxheSBhIHBoYW50b20gdHJhbnNpdGlvbiB0byB0aGUgYmFja2VuZCBvbiByZWNvbm5lY3QpLFxuXHQgKiBhbmQgYSBkZXRhaWwgY2hhbmdlIHJlYWNoZWQgdmlhIGFuIGludGVybWVkaWF0ZSBzdGF0ZSAoZS5nLlxuXHQgKiBgd2FpdGluZyhvbGQpIFx1MjE5MiB0aGlua2luZyBcdTIxOTIgd2FpdGluZyhuZXcpYCkgaXMgc3RpbGwgdHJlYXRlZCBhcyBkZXRhaWwtb25seS5cblx0ICovXG5cdHByaXZhdGUgX2VtaXRQZW5kaW5nU3RhdGVDaGFuZ2VzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYW5nZXMgPSBbLi4udGhpcy5fcGVuZGluZ1N0YXRlQ2hhbmdlcy52YWx1ZXMoKV07XG5cdFx0dGhpcy5fcGVuZGluZ1N0YXRlQ2hhbmdlcy5jbGVhcigpO1xuXHRcdGlmIChjaGFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBLZWVwIG9ubHkgY2hhbmdlcyB3aG9zZSBzZXR0bGVkIHN0YXRlIGRpZmZlcnMgZnJvbSB0aGUgYnVyc3QgYmFzZWxpbmU7XG5cdFx0Ly8gY2xhc3NpZnkgYSBzYW1lLXN0YXRlIGNvbmZpcm1hdGlvbiB3aG9zZSBkZXRhaWwgY2hhbmdlZCBhcyBkZXRhaWwtb25seS5cblx0XHRjb25zdCBuZXRDaGFuZ2VzOiB7IGNoYW5nZTogdHlwZW9mIGNoYW5nZXNbbnVtYmVyXTsgZGV0YWlsT25seTogYm9vbGVhbiB9W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBjaGFuZ2VzKSB7XG5cdFx0XHRjb25zdCBkZXRhaWwgPSBjaGFuZ2UuZGV0YWlsID8/ICcnO1xuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IGNoYW5nZS5sYXN0UmVzcG9uc2VTdW1tYXJ5ID8/ICcnO1xuXHRcdFx0Y29uc3Qgc3RhdGVDaGFuZ2VkID0gY2hhbmdlLmZyb21TdGF0ZSAhPT0gY2hhbmdlLmN1cnJlbnRTdGF0ZTtcblx0XHRcdC8vIFNhbWUgcGVuZGluZ0lkIHRlc3QgYXMgdGhlIHBlci1zZXNzaW9uIHBhdGg6IHR3byBmb3JtcyBhc2tpbmcgdGhlIHNhbWVcblx0XHRcdC8vIHRoaW5ncyBoYXZlIGlkZW50aWNhbCBkZXRhaWwsIHNvIG9ubHkgdGhlIGlkIGRpc3Rpbmd1aXNoZXMgdGhlbS5cblx0XHRcdGNvbnN0IGRldGFpbE9ubHkgPSAhc3RhdGVDaGFuZ2VkICYmIGNoYW5nZS5jdXJyZW50U3RhdGUgPT09ICd3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24nXG5cdFx0XHRcdCYmIChjaGFuZ2UuZnJvbURldGFpbCAhPT0gZGV0YWlsIHx8IGNoYW5nZS5mcm9tUGVuZGluZ0lkICE9PSBjaGFuZ2UucGVuZGluZ0lkIHx8IGNoYW5nZS5mcm9tQ29uZmlybWF0aW9uVHlwZSAhPT0gY2hhbmdlLmNvbmZpcm1hdGlvblR5cGUpO1xuXHRcdFx0Ly8gQSBzdW1tYXJ5IHRoYXQgYXBwZWFyZWQvY2hhbmdlZCB3aGlsZSB0aGUgc2Vzc2lvbiBzdGF5ZWQgaWRsZSBpcyBhXG5cdFx0XHQvLyByZWFsIG5hcnJhdGFibGUgY2hhbmdlIGV2ZW4gdGhvdWdoIHRoZSBjb2Fyc2Ugc3RhdGUgZGlkbid0IG1vdmUuXG5cdFx0XHRjb25zdCByZXNwb25zZVN1bW1hcnlPbmx5ID0gIXN0YXRlQ2hhbmdlZCAmJiBjaGFuZ2UuY3VycmVudFN0YXRlID09PSAnaWRsZScgJiYgISFzdW1tYXJ5ICYmIGNoYW5nZS5mcm9tUmVzcG9uc2VTdW1tYXJ5ICE9PSBzdW1tYXJ5O1xuXHRcdFx0aWYgKHN0YXRlQ2hhbmdlZCB8fCBkZXRhaWxPbmx5IHx8IHJlc3BvbnNlU3VtbWFyeU9ubHkpIHtcblx0XHRcdFx0bmV0Q2hhbmdlcy5wdXNoKHsgY2hhbmdlLCBkZXRhaWxPbmx5IH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAobmV0Q2hhbmdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIFRoZSBzdG9ybSBzZXR0bGVkIGJhY2sgdG8gdGhlIGJhc2VsaW5lOyBzdGlsbCBzZW5kIGEgZnJlc2ggY29udGV4dFxuXHRcdFx0Ly8gKGlkZW1wb3RlbnQgXHUyMDE0IF9zZW5kRGVsdGEgZW1pdHMgbm90aGluZykgYnV0IHRyYWNlL3BlcnNpc3Qgbm90aGluZy5cblx0XHRcdHRoaXMuX3NlbmRDb250ZXh0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFRoZSBiYWNrZW5kIHZhbGlkYXRlcyBhIG5hcnJhdGlvbiByZXF1ZXN0IGFnYWluc3QgaXRzIG1pcnJvciBvZiB0aGVcblx0XHQvLyBzZXNzaW9uIGNvbnRleHQsIGFuZCB0aGF0IG1pcnJvciBpcyBkZWJvdW5jZWQgNTAwbXMuIE5hcnJhdGluZyBmaXJzdFxuXHRcdC8vIHdvdWxkIGFzayBpdCB0byBzcGVhayBhIGZvcm0gaXQgaGFzIG5vdCBiZWVuIHRvbGQgYWJvdXQgeWV0LCBzbyB0aGVcblx0XHQvLyBjb250ZXh0IHRoYXQganVzdGlmaWVzIHRoZSBuYXJyYXRpb24gZ29lcyBvdXQsIGFuZCBwYXN0IHRoZSBkZWJvdW5jZSxcblx0XHQvLyBiZWZvcmUgdGhlIG5hcnJhdGlvbiBpcyByZXF1ZXN0ZWQuXG5cdFx0Ly9cblx0XHQvLyBGb3IgZGV0YWlsLW9ubHkgdHJhbnNpdGlvbnMgKHNhbWUgYWdlbnRfc3RhdGUgYnV0IGRpZmZlcmVudCBwZW5kaW5nXG5cdFx0Ly8gY29udGVudCksIGludmFsaWRhdGUgdGhlIGNhY2hlIGZpcnN0IHNvIF9zZW5kRGVsdGEgdHJlYXRzIHRoZSBzZXNzaW9uIGFzXG5cdFx0Ly8gbmV3IGFuZCBpbmNsdWRlcyBhZ2VudF9zdGF0ZSArIGFnZW50X3N0YXRlX2RldGFpbCB0b2dldGhlci5cblx0XHRmb3IgKGNvbnN0IHsgY2hhbmdlLCBkZXRhaWxPbmx5IH0gb2YgbmV0Q2hhbmdlcykge1xuXHRcdFx0aWYgKGRldGFpbE9ubHkpIHtcblx0XHRcdFx0dGhpcy52b2ljZUNsaWVudFNlcnZpY2UuaW52YWxpZGF0ZVNlc3Npb25DYWNoZShjaGFuZ2Uuc2Vzc2lvbklkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fc2VuZENvbnRleHQoKTtcblx0XHR0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5mbHVzaFNlc3Npb25Db250ZXh0KCk7XG5cdFx0Ly8gU3BlYWsgdGhlIHNldHRsZWQgaXRlbSBmb3IgdGhlIHNob3duIHNlc3Npb247IGEgYmFja2dyb3VuZCBzZXNzaW9uJ3MgaXRlbVxuXHRcdC8vIHdhaXRzIHVudGlsIHRoZSB1c2VyIGZvY3VzZXMgaXQuIEJvdGggdGhpcyBjb2FsZXNjZWQgcGF0aCBhbmQgdGhlIGRpcmVjdFxuXHRcdC8vIF9jaGVja1Nlc3Npb25TdGF0ZUNoYW5nZXMgcGF0aCBmZWVkIHRoaXMsIHNvIHJlbW90ZS91bmxvYWRlZCBzZXNzaW9uc1xuXHRcdC8vIHN1cmZhY2VkIG9ubHkgYnkgdGhlIGxhdHRlciBhcmUgY292ZXJlZCB0b28uXG5cdFx0Y29uc3Qgc2hvd25Ob3cgPSB0aGlzLl9zaG93blNlc3Npb25JZCgpO1xuXHRcdGZvciAoY29uc3QgeyBjaGFuZ2UgfSBvZiBuZXRDaGFuZ2VzKSB7XG5cdFx0XHR0aGlzLl9oYW5kbGVOYXJyYXRhYmxlU3RhdGVDaGFuZ2UoY2hhbmdlLnNlc3Npb25JZCwgY2hhbmdlLmN1cnJlbnRTdGF0ZSwgY2hhbmdlLmRldGFpbCwgY2hhbmdlLmxhc3RSZXNwb25zZVN1bW1hcnksIHNob3duTm93LCBjaGFuZ2UuY29uZmlybWF0aW9uVHlwZSk7XG5cdFx0fVxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBlbWl0dGluZyAke25ldENoYW5nZXMubGVuZ3RofSBzZXR0bGVkIHN0YXRlQ2hhbmdlKHMpOiAke25ldENoYW5nZXMubWFwKCh7IGNoYW5nZSwgZGV0YWlsT25seSB9KSA9PiBgJHtjaGFuZ2UubGFiZWx9OiR7Y2hhbmdlLmN1cnJlbnRTdGF0ZX0ke2RldGFpbE9ubHkgPyAnIChkZXRhaWwtb25seSknIDogJyd9YCkuam9pbignLCAnKX1gKTtcblx0XHRmb3IgKGNvbnN0IHsgY2hhbmdlIH0gb2YgbmV0Q2hhbmdlcykge1xuXHRcdFx0Ly8gUGVyc2lzdCBhcyBhIGNvZGluZ19ldmVudCBpbiB0aGUgbG9jYWwgdGltZWxpbmUgc29cblx0XHRcdC8vIFwic2Vzc2lvbiBYIHdlbnQgZnJvbSB0aGlua2luZyBcdTIxOTIgd2FpdGluZ19mb3JfY29uZmlybWF0aW9uXCJcblx0XHRcdC8vIGNhbiBiZSByZXBsYXllZCBhcyBjcm9zcy1zZXNzaW9uIGNvbnRleHQgb24gcmVjb25uZWN0LlxuXHRcdFx0dGhpcy5fcGVyc2lzdEVudHJ5KFxuXHRcdFx0XHQnY29kaW5nX2V2ZW50Jyxcblx0XHRcdFx0YHNlc3Npb24gXCIke2NoYW5nZS5sYWJlbH1cIiBcdTIxOTIgJHtjaGFuZ2UuY3VycmVudFN0YXRlfWAsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb2RpbmdTZXNzaW9uSWQ6IGNoYW5nZS5zZXNzaW9uSWQsXG5cdFx0XHRcdFx0Y29kaW5nU3RhdHVzOiBjaGFuZ2UuY3VycmVudFN0YXRlLFxuXHRcdFx0XHRcdGNvZGluZ1Nlc3Npb25MYWJlbDogY2hhbmdlLmxhYmVsLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUGFyYW5vaWQgbWl0aWdhdGlvbiBmb3IgdGhlIFwiY29uZmlybWF0aW9uIG5hcnJhdGlvbiBub3QgZmlyZWQgd2hpbGUgdXNlclxuXHQgKiBpcyBvbiB0aGUgc2FtZSBzZXNzaW9uXCIgc3ltcHRvbS4gRXZlbiB0aG91Z2ggdGhlIGF1dG9ydW4gY2FsbHNcblx0ICogYF9zZW5kQ29udGV4dCArIGZsdXNoU2Vzc2lvbkNvbnRleHRgIGF0IHRoZSB0cmFuc2l0aW9uLCBpbiBwcmFjdGljZVxuXHQgKiB1c2VycyBvYnNlcnZlZCB0aGF0IHRoZSBCRS1zaWRlIG5hcnJhdGlvbiAoXCJJIG5lZWQgYXBwcm92YWwgdG8gcnVuIFhcIilcblx0ICogb25seSBmaXJlcyBhZnRlciB0aGV5IG5hdmlnYXRlIEFXQVkgZnJvbSB0aGUgc2Vzc2lvbi5cblx0ICpcblx0ICogQXMgYSBndWFyZGVkIHJlLWZsdXNoIHdlIHNjaGVkdWxlIGEgc2luZ2xlIGRlbGF5ZWQgYF9zZW5kQ29udGV4dCArIGZsdXNoYFxuXHQgKiBwZXIgc2Vzc2lvbiB0aGF0J3MgYXdhaXRpbmcgY29uZmlybWF0aW9uLiBUaGUgbWVyZ2UtcGF0Y2ggaW5cblx0ICogYF9zZW5kRGVsdGFgIHNob3J0LWNpcmN1aXRzIHdoZW4gbm8gZmllbGRzIGNoYW5nZWQgKHNlZSBsaW5lcyAzOTMtMzk1KSxcblx0ICogc28gYSBuby1vcCByZS1zZW5kIGlzIHNpbGVudCBvbiB0aGUgQkUgXHUyMDE0IGJ1dCBpZiB0aGUgRklSU1Qgc2VuZCB3YXNcblx0ICogZHJvcHBlZCAocmFjZSBjb25kaXRpb24sIGRlYm91bmNlIGhpY2N1cCwgV1MgY29hbGVzY2luZyksIHRoaXMgc2Vjb25kXG5cdCAqIHNlbmQgcHVzaGVzIHRoZSBzdGF0ZSB0aHJvdWdoLlxuXHQgKlxuXHQgKiBUaGUgd2F0Y2hkb2cgYXV0by1jbGVhcnMgb25jZSB0aGUgYXV0b3J1biBvYnNlcnZlcyB0aGUgc2Vzc2lvbiBoYXMgbGVmdFxuXHQgKiBgd2FpdGluZ19mb3JfY29uZmlybWF0aW9uYC5cblx0ICovXG5cdHByaXZhdGUgX2FybUNvbmZpcm1hdGlvbkZsdXNoV2F0Y2hkb2coc2Vzc2lvbklkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIGlzVHJhbnNpdGlvbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIEFscmVhZHkgYXJtZWQgXHUyMDE0IGxlYXZlIGl0IGFsb25lLiBXZSB3YW50IGV4YWN0bHkgb25lIGRlbGF5ZWRcblx0XHQvLyByZS1mbHVzaCBwZXIgY29uZmlybWF0aW9uIHdpbmRvdywgbm90IGEgcmVmcmVzaGVkIHRpbWVyLlxuXHRcdGlmICh0aGlzLl9jb25maXJtYXRpb25GbHVzaFdhdGNoZG9ncy5oYXMoc2Vzc2lvbklkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoaXNUcmFuc2l0aW9uKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFt2b2ljZV0gYXJtaW5nIGNvbmZpcm1hdGlvbiBmbHVzaCB3YXRjaGRvZyBpZD0ke3Nlc3Npb25JZC5zbGljZSgtMzIpfSBsYWJlbD1cIiR7bGFiZWx9XCJgKTtcblx0XHR9XG5cdFx0Y29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2NvbmZpcm1hdGlvbkZsdXNoV2F0Y2hkb2dzLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIGNvbmZpcm1hdGlvbiBmbHVzaCB3YXRjaGRvZyBmaXJpbmcgaWQ9JHtzZXNzaW9uSWQuc2xpY2UoLTMyKX0gbGFiZWw9XCIke2xhYmVsfVwiYCk7XG5cdFx0XHQvLyBSZS1wdWJsaXNoIHRoZSBjdXJyZW50IGNvbnRleHQuIF9zZW5kRGVsdGEgbWVyZ2UtcGF0Y2ggd2lsbCBiZVxuXHRcdFx0Ly8gYSBuby1vcCBpZiB0aGUgQkUgYWxyZWFkeSByZWNlaXZlZCB0aGUgcHJpb3IgZGVsdGEuXG5cdFx0XHR0aGlzLl9zZW5kQ29udGV4dCgpO1xuXHRcdFx0dGhpcy52b2ljZUNsaWVudFNlcnZpY2UuZmx1c2hTZXNzaW9uQ29udGV4dCgpO1xuXHRcdH0sIFZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuX0NPTkZJUk1BVElPTl9GTFVTSF9ERUxBWV9NUyk7XG5cdFx0dGhpcy5fY29uZmlybWF0aW9uRmx1c2hXYXRjaGRvZ3Muc2V0KHNlc3Npb25JZCwgdGltZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrIGFsbCBzZXNzaW9ucyBmb3Igc3RhdGUgY2hhbmdlcyBhbmQgc2VuZCBub3RpZmljYXRpb25zIHRvIGJhY2tlbmQuXG5cdCAqIFRoaXMgY2F0Y2hlcyBzdGF0ZSB0cmFuc2l0aW9ucyBmb3Igc2Vzc2lvbnMgd2l0aG91dCBhIGxvYWRlZCBjaGF0IG1vZGVsXG5cdCAqICh3aGljaCB0aGUgYXV0b3J1biBjYW4ndCB0cmFjayB2aWEgb2JzZXJ2YWJsZXMpLCBhbmQgYWxzbyByZWd1bGFyIGNoYXRcblx0ICogc2Vzc2lvbnMgdGhhdCBhcmUgbm90IGFnZW50IHNlc3Npb25zLlxuXHQgKi9cblx0cHJpdmF0ZSBfY2hlY2tTZXNzaW9uU3RhdGVDaGFuZ2VzKCk6IHZvaWQge1xuXHRcdC8vIFNhZmV0eSBuZXQ6IGlmIHRoZSBmb2N1cy1jaGFuZ2UgZXZlbnQgd2FzIG1pc3NlZCB3aGlsZSB2b2ljZSB3YXMgYnVzeSxcblx0XHQvLyBmbHVzaCBhbnkgYnVmZmVyZWQgcmVzcG9uc2UgZm9yIHRoZSBzZXNzaW9uIG5vdyBzaG93biB0byB0aGUgdXNlciBzbyBpdFxuXHRcdC8vIG5ldmVyIHN0YXlzIHN0dWNrIGFzIGEgcGVuZGluZyBpbmRpY2F0b3Igd2l0aCBubyBwbGF5YmFjay4gVXNlIHRoZSBTSE9XTlxuXHRcdC8vIHNlc3Npb24gKG5vdCBgX2dldEFjdGl2ZVNlc3Npb25JZCgpYCwgd2hpY2ggcHJlZmVycyB0aGUgc3RpY2t5IGlucHV0XG5cdFx0Ly8gYF90YXJnZXRTZXNzaW9uYCBhbmQgd291bGQgZmx1c2ggYSBiYWNrZ3JvdW5kIHNlc3Npb24ncyByZXBseSBvdmVyIHRoZVxuXHRcdC8vIG9uZSB0aGUgdXNlciBpcyB2aWV3aW5nKS4gVGhlIGZsdXNoIG1hdGNoZXMgdGhlIGJ1ZmZlcmVkIGtleSByb2J1c3RseS5cblx0XHRpZiAodGhpcy5fZGVmZXJyZWRSZXNwb25zZXMuc2l6ZSA+IDApIHtcblx0XHRcdGNvbnN0IHNob3duID0gdGhpcy5fc2hvd25TZXNzaW9uSWQoKTtcblx0XHRcdGlmIChzaG93bikge1xuXHRcdFx0XHR0aGlzLl9mbHVzaERlZmVycmVkUmVzcG9uc2Uoc2hvd24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25zID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9ucy5maWx0ZXIocyA9PiAhcy5pc0FyY2hpdmVkKCkpO1xuXHRcdGNvbnN0IHN0YXRlQ2hhbmdlczogeyBzZXNzaW9uSWQ6IHN0cmluZzsgY3VycmVudFN0YXRlOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGRldGFpbD86IHN0cmluZzsgY29uZmlybWF0aW9uVHlwZT86IFZvaWNlQ29uZmlybWF0aW9uVHlwZTsgbGFzdFJlc3BvbnNlU3VtbWFyeT86IHN0cmluZyB9W10gPSBbXTtcblx0XHRjb25zdCBwcm9jZXNzZWRSZXNvdXJjZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCB3YWl0aW5nU2Vzc2lvbklkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0Zm9yIChjb25zdCBzIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRwcm9jZXNzZWRSZXNvdXJjZXMuYWRkKHMucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSBzLnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihzLnJlc291cmNlKTtcblx0XHRcdGxldCBjdXJyZW50U3RhdGU6IHN0cmluZztcblx0XHRcdGxldCBkZXRhaWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBjb25maXJtYXRpb25UeXBlOiBWb2ljZUNvbmZpcm1hdGlvblR5cGUgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgbGFzdFJlc3BvbnNlU3VtbWFyeTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdGNvbnN0IGluZm8gPSB0aGlzLl9nZXRBZ2VudFN0YXRlSW5mbyhtb2RlbCk7XG5cdFx0XHRcdC8vIEhvbGQgYSBzdW1tYXJ5LWxlc3MgaWRsZSB3aGlsZSBhbiBlYWdlciByZWxvYWQgaXMgc3RpbGwgcmVwbGF5aW5nXG5cdFx0XHRcdC8vIChzZWUgX2VmZmVjdGl2ZVJlc2lkZW50U3RhdGUpOyBvbmNlIHdlIHN0b3AgaG9sZGluZyB0aGUgbW9kZWwgaXNcblx0XHRcdFx0Ly8gcmVzaWRlbnQgd2l0aCBhIHByb3BlciBzdW1tYXJ5LCBzbyBkcm9wIHRoZSBwZW5kaW5nIGlkbGUgZGVmZXJyYWwuXG5cdFx0XHRcdGN1cnJlbnRTdGF0ZSA9IHRoaXMuX2VmZmVjdGl2ZVJlc2lkZW50U3RhdGUoc2Vzc2lvbklkLCBpbmZvKTtcblx0XHRcdFx0ZGV0YWlsID0gaW5mby5kZXRhaWw7XG5cdFx0XHRcdGNvbmZpcm1hdGlvblR5cGUgPSBpbmZvLmNvbmZpcm1hdGlvbl90eXBlO1xuXHRcdFx0XHRsYXN0UmVzcG9uc2VTdW1tYXJ5ID0gY3VycmVudFN0YXRlID09PSBpbmZvLnN0YXRlID8gaW5mby5sYXN0X3Jlc3BvbnNlX3N1bW1hcnkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdC8vIENhcHR1cmUgdGhlIHN1bW1hcnkgd2hpbGUgcmVzaWRlbnQgc28gYSBsYXRlciBjb21wbGV0aW9uIGFmdGVyXG5cdFx0XHRcdC8vIGRpc3Bvc2FsIGNhbiBzdGlsbCBuYXJyYXRlLlxuXHRcdFx0XHR0aGlzLl9jYWNoZVJlc3BvbnNlU3VtbWFyeShzZXNzaW9uSWQsIGluZm8uc3RhdGUsIGluZm8ubGFzdF9yZXNwb25zZV9zdW1tYXJ5KTtcblx0XHRcdFx0aWYgKGN1cnJlbnRTdGF0ZSA9PT0gaW5mby5zdGF0ZSkge1xuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdJZGxlTmFycmF0aW9uLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjdXJyZW50U3RhdGUgPSBzLnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MgPyAndGhpbmtpbmcnXG5cdFx0XHRcdFx0OiBzLnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQgPyAnd2FpdGluZ19mb3JfY29uZmlybWF0aW9uJ1xuXHRcdFx0XHRcdFx0OiBzLnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCA/ICdpZGxlJ1xuXHRcdFx0XHRcdFx0XHQ6ICd1bmtub3duJztcblx0XHRcdFx0Ly8gQSBuZXcgdHVybiBzdXBlcnNlZGVzIGFueSBjYWNoZWQgc3VtbWFyeSBldmVuIHdpdGhvdXQgYSByZXNpZGVudFxuXHRcdFx0XHQvLyBtb2RlbCwgc28gYSBsYXRlciBjb21wbGV0aW9uIG5ldmVyIG5hcnJhdGVzIHRoZSBwcmV2aW91cyByZXBseS5cblx0XHRcdFx0dGhpcy5fY2FjaGVSZXNwb25zZVN1bW1hcnkoc2Vzc2lvbklkLCBjdXJyZW50U3RhdGUsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGlmIChzLnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQpIHtcblx0XHRcdFx0XHR0aGlzLl9lbnN1cmVNb2RlbExvYWRlZChzLnJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcmV2ID0gdGhpcy5fcHJldlNlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0XHRjb25zdCBpc1N0YXRlQ2hhbmdlID0gcHJldiAhPT0gdW5kZWZpbmVkICYmIHByZXYuc3RhdGUgIT09IGN1cnJlbnRTdGF0ZSAmJiBjdXJyZW50U3RhdGUgIT09ICd1bmtub3duJztcblx0XHRcdGNvbnN0IHBlbmRpbmdJZCA9IGN1cnJlbnRTdGF0ZSA9PT0gJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicgPyB0aGlzLl9wZW5kaW5nSWRGb3Ioc2Vzc2lvbklkKSA6ICcnO1xuXHRcdFx0Y29uc3QgaXNEZXRhaWxDaGFuZ2UgPSAhaXNTdGF0ZUNoYW5nZSAmJiBwcmV2ICE9PSB1bmRlZmluZWQgJiYgY3VycmVudFN0YXRlID09PSAnd2FpdGluZ19mb3JfY29uZmlybWF0aW9uJ1xuXHRcdFx0XHQmJiAoKGRldGFpbCA/PyAnJykgIT09IHByZXYuZGV0YWlsIHx8IHBlbmRpbmdJZCAhPT0gcHJldi5wZW5kaW5nSWQgfHwgY29uZmlybWF0aW9uVHlwZSAhPT0gcHJldi5jb25maXJtYXRpb25UeXBlKTtcblxuXHRcdFx0Ly8gQXJtIHRoZSBhd2FpdGluZy1zdW1tYXJ5IG1hcmtlciBvbiBhIGdlbnVpbmUgbmV3IHR1cm4gc28gdGhpcyBydW4nc1xuXHRcdFx0Ly8gY29tcGxldGlvbiBpcyBsYXRlciByZWNvZ25pemVkIGFzIG5ldyAoc2VlIGF1dG9ydW4gZm9yIHJhdGlvbmFsZSkuXG5cdFx0XHRpZiAoaXNTdGF0ZUNoYW5nZSAmJiBjdXJyZW50U3RhdGUgPT09ICd0aGlua2luZycgJiYgIXRoaXMuX2VhZ2VyTW9kZWxMb2FkaW5nLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25zQXdhaXRpbmdSZXNwb25zZVN1bW1hcnkuYWRkKHNlc3Npb25JZCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN1bW1hcnktbGVzcyBpZGxlIHRyYW5zaXRpb25zIGZvciByZW1vdGUvQ29waWxvdCBzZXNzaW9uczogbmFycmF0ZVxuXHRcdFx0Ly8gZnJvbSB0aGUgY2FjaGVkIHN1bW1hcnkgaWYgd2UgaGF2ZSBvbmUsIG90aGVyd2lzZSBkZWZlciB1bnRpbCB0aGVcblx0XHRcdC8vIG1vZGVsIGxvYWRzIChzZWUgX2RlZmVySWRsZU5hcnJhdGlvblVudGlsTW9kZWxMb2FkZWQpLlxuXHRcdFx0aWYgKCFtb2RlbCAmJiBjdXJyZW50U3RhdGUgPT09ICdpZGxlJyAmJiBpc1N0YXRlQ2hhbmdlKSB7XG5cdFx0XHRcdGNvbnN0IGNhY2hlZFN1bW1hcnkgPSB0aGlzLl9sYXN0UmVzcG9uc2VTdW1tYXJ5QnlJZC5nZXQoc2Vzc2lvbklkKTtcblx0XHRcdFx0aWYgKCFjYWNoZWRTdW1tYXJ5KSB7XG5cdFx0XHRcdFx0dGhpcy5fZGVmZXJJZGxlTmFycmF0aW9uVW50aWxNb2RlbExvYWRlZChzLnJlc291cmNlKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRsYXN0UmVzcG9uc2VTdW1tYXJ5ID0gY2FjaGVkU3VtbWFyeTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQSBjb21wbGV0ZWQgcmVwbHkncyBzdW1tYXJ5IGNhbiBsYW5kIGFmdGVyIHRoZSBpZGxlIHRyYW5zaXRpb24gKG9yXG5cdFx0XHQvLyBjaGFuZ2Ugd2hpbGUgc3RpbGwgaWRsZSksIHByb2R1Y2luZyBubyBzdGF0ZSBjaGFuZ2U7IHRyZWF0IGl0IGFzIGl0c1xuXHRcdFx0Ly8gb3duIG5hcnJhdGFibGUgdHJhbnNpdGlvbiBzbyB0aGUgcmVwbHkgaXMgc3RpbGwgc3VyZmFjZWQvbmFycmF0ZWQgLVxuXHRcdFx0Ly8gYnV0IE9OTFkgZm9yIGEgc2Vzc2lvbiB0aGF0IGFjdHVhbGx5IHJhbiB0aGlzIGxpZmV0aW1lLCBzbyBhbiBvbGRcblx0XHRcdC8vIHN1bW1hcnkgc3VyZmFjaW5nIGZyb20gYSByZWh5ZHJhdGVkIGRvcm1hbnQgbW9kZWwgaXNuJ3QgbWlzdGFrZW4gZm9yXG5cdFx0XHQvLyBhIG5ldyByZXBseS5cblx0XHRcdGNvbnN0IG5vcm1hbGl6ZWRTdW1tYXJ5ID0gbGFzdFJlc3BvbnNlU3VtbWFyeSA/PyAnJztcblx0XHRcdGNvbnN0IGlzUmVzcG9uc2VTdW1tYXJ5Q2hhbmdlID0gIWlzU3RhdGVDaGFuZ2UgJiYgcHJldiAhPT0gdW5kZWZpbmVkICYmIGN1cnJlbnRTdGF0ZSA9PT0gJ2lkbGUnICYmICEhbm9ybWFsaXplZFN1bW1hcnkgJiYgbm9ybWFsaXplZFN1bW1hcnkgIT09IHByZXYubGFzdFJlc3BvbnNlU3VtbWFyeSAmJiB0aGlzLl9zZXNzaW9uc0F3YWl0aW5nUmVzcG9uc2VTdW1tYXJ5LmhhcyhzZXNzaW9uSWQpO1xuXG5cdFx0XHQvLyBUaGUgY29tcGxldGlvbiBmb3IgdGhpcyBydW4gaGFzIGJlZW4gYWNjZXB0ZWQ7IGNvbnN1bWUgdGhlIG1hcmtlci5cblx0XHRcdGlmICgoaXNTdGF0ZUNoYW5nZSAmJiBjdXJyZW50U3RhdGUgPT09ICdpZGxlJyAmJiAhIW5vcm1hbGl6ZWRTdW1tYXJ5KSB8fCBpc1Jlc3BvbnNlU3VtbWFyeUNoYW5nZSkge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uc0F3YWl0aW5nUmVzcG9uc2VTdW1tYXJ5LmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNTdGF0ZUNoYW5nZSB8fCBpc0RldGFpbENoYW5nZSB8fCBpc1Jlc3BvbnNlU3VtbWFyeUNoYW5nZSkge1xuXHRcdFx0XHRjb25zdCBjYW5jZWxFeHBpcnkgPSB0aGlzLl91c2VyQ2FuY2VsbGVkU2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0XHRcdGlmIChjYW5jZWxFeHBpcnkpIHtcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQoY2FuY2VsRXhwaXJ5KTtcblx0XHRcdFx0XHR0aGlzLl91c2VyQ2FuY2VsbGVkU2Vzc2lvbnMuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKGlzRGV0YWlsQ2hhbmdlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5pbnZhbGlkYXRlU2Vzc2lvbkNhY2hlKHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHN0YXRlQ2hhbmdlcy5wdXNoKHsgc2Vzc2lvbklkLCBjdXJyZW50U3RhdGUsIGxhYmVsOiBzLmxhYmVsIHx8ICdVbnRpdGxlZCBzZXNzaW9uJywgZGV0YWlsLCBjb25maXJtYXRpb25UeXBlLCBsYXN0UmVzcG9uc2VTdW1tYXJ5IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoY3VycmVudFN0YXRlICE9PSAndW5rbm93bicpIHtcblx0XHRcdFx0Ly8gUHJlc2VydmUgYSBrbm93biBzdW1tYXJ5IHJhdGhlciB0aGFuIGNsb2JiZXJpbmcgd2l0aCAnJyBzbyBhXG5cdFx0XHRcdC8vIG1vZGVsIHVubG9hZFx1MjE5MnJlbG9hZCBjYW4ndCBtYW51ZmFjdHVyZSBhIGZyZXNoLXJlcGx5IHRyYW5zaXRpb24uXG5cdFx0XHRcdGNvbnN0IHJlbWVtYmVyZWRTdW1tYXJ5ID0gbm9ybWFsaXplZFN1bW1hcnkgfHwgdGhpcy5fbGFzdFJlc3BvbnNlU3VtbWFyeUJ5SWQuZ2V0KHNlc3Npb25JZCkgfHwgcHJldj8ubGFzdFJlc3BvbnNlU3VtbWFyeSB8fCAnJztcblx0XHRcdFx0dGhpcy5fcHJldlNlc3Npb25TdGF0ZXMuc2V0KHNlc3Npb25JZCwgeyBzdGF0ZTogY3VycmVudFN0YXRlLCBkZXRhaWw6IGRldGFpbCA/PyAnJywgcGVuZGluZ0lkLCBjb25maXJtYXRpb25UeXBlLCBsYXN0UmVzcG9uc2VTdW1tYXJ5OiByZW1lbWJlcmVkU3VtbWFyeSB9KTtcblx0XHRcdH1cblx0XHRcdGlmIChjdXJyZW50U3RhdGUgPT09ICd3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24nKSB7XG5cdFx0XHRcdHdhaXRpbmdTZXNzaW9uSWRzLmFkZChzZXNzaW9uSWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFsc28gY2hlY2sgcmVndWxhciAobm9uLWFnZW50KSBjaGF0IHNlc3Npb25zXG5cdFx0Zm9yIChjb25zdCBjaGF0TW9kZWwgb2YgdGhpcy5jaGF0U2VydmljZS5jaGF0TW9kZWxzLmdldCgpKSB7XG5cdFx0XHRjb25zdCBrZXkgPSBjaGF0TW9kZWwuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRpZiAocHJvY2Vzc2VkUmVzb3VyY2VzLmhhcyhrZXkpKSB7IGNvbnRpbnVlOyB9XG5cdFx0XHRpZiAoY2hhdE1vZGVsLmdldFJlcXVlc3RzKCkubGVuZ3RoID09PSAwKSB7IGNvbnRpbnVlOyB9XG5cblx0XHRcdGNvbnN0IGluZm8gPSB0aGlzLl9nZXRBZ2VudFN0YXRlSW5mbyhjaGF0TW9kZWwpO1xuXHRcdFx0Y29uc3QgY3VycmVudFN0YXRlID0gaW5mby5zdGF0ZTtcblx0XHRcdGNvbnN0IGRldGFpbCA9IGluZm8uZGV0YWlsO1xuXHRcdFx0Y29uc3QgY29uZmlybWF0aW9uVHlwZSA9IGluZm8uY29uZmlybWF0aW9uX3R5cGU7XG5cdFx0XHRjb25zdCBsYXN0UmVzcG9uc2VTdW1tYXJ5ID0gaW5mby5sYXN0X3Jlc3BvbnNlX3N1bW1hcnk7XG5cblx0XHRcdGNvbnN0IHByZXYgPSB0aGlzLl9wcmV2U2Vzc2lvblN0YXRlcy5nZXQoa2V5KTtcblx0XHRcdGNvbnN0IGlzU3RhdGVDaGFuZ2UgPSBwcmV2ICE9PSB1bmRlZmluZWQgJiYgcHJldi5zdGF0ZSAhPT0gY3VycmVudFN0YXRlICYmIGN1cnJlbnRTdGF0ZSAhPT0gJ3Vua25vd24nO1xuXHRcdFx0Y29uc3QgcGVuZGluZ0lkID0gY3VycmVudFN0YXRlID09PSAnd2FpdGluZ19mb3JfY29uZmlybWF0aW9uJyA/IHRoaXMuX3BlbmRpbmdJZEZvcihrZXkpIDogJyc7XG5cdFx0XHRjb25zdCBpc0RldGFpbENoYW5nZSA9ICFpc1N0YXRlQ2hhbmdlICYmIHByZXYgIT09IHVuZGVmaW5lZCAmJiBjdXJyZW50U3RhdGUgPT09ICd3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24nXG5cdFx0XHRcdCYmICgoZGV0YWlsID8/ICcnKSAhPT0gcHJldi5kZXRhaWwgfHwgcGVuZGluZ0lkICE9PSBwcmV2LnBlbmRpbmdJZCB8fCBjb25maXJtYXRpb25UeXBlICE9PSBwcmV2LmNvbmZpcm1hdGlvblR5cGUpO1xuXG5cdFx0XHQvLyBBcm0gdGhlIGF3YWl0aW5nLXN1bW1hcnkgbWFya2VyIG9uIGEgZ2VudWluZSBuZXcgdHVybi5cblx0XHRcdGlmIChpc1N0YXRlQ2hhbmdlICYmIGN1cnJlbnRTdGF0ZSA9PT0gJ3RoaW5raW5nJyAmJiAhdGhpcy5fZWFnZXJNb2RlbExvYWRpbmcuaGFzKGtleSkpIHtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbnNBd2FpdGluZ1Jlc3BvbnNlU3VtbWFyeS5hZGQoa2V5KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgbm9ybWFsaXplZFN1bW1hcnkgPSBsYXN0UmVzcG9uc2VTdW1tYXJ5ID8/ICcnO1xuXHRcdFx0Y29uc3QgaXNSZXNwb25zZVN1bW1hcnlDaGFuZ2UgPSAhaXNTdGF0ZUNoYW5nZSAmJiBwcmV2ICE9PSB1bmRlZmluZWQgJiYgY3VycmVudFN0YXRlID09PSAnaWRsZScgJiYgISFub3JtYWxpemVkU3VtbWFyeSAmJiBub3JtYWxpemVkU3VtbWFyeSAhPT0gcHJldi5sYXN0UmVzcG9uc2VTdW1tYXJ5ICYmIHRoaXMuX3Nlc3Npb25zQXdhaXRpbmdSZXNwb25zZVN1bW1hcnkuaGFzKGtleSk7XG5cblx0XHRcdC8vIFRoZSBjb21wbGV0aW9uIGZvciB0aGlzIHJ1biBoYXMgYmVlbiBhY2NlcHRlZDsgY29uc3VtZSB0aGUgbWFya2VyLlxuXHRcdFx0aWYgKChpc1N0YXRlQ2hhbmdlICYmIGN1cnJlbnRTdGF0ZSA9PT0gJ2lkbGUnICYmICEhbm9ybWFsaXplZFN1bW1hcnkpIHx8IGlzUmVzcG9uc2VTdW1tYXJ5Q2hhbmdlKSB7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25zQXdhaXRpbmdSZXNwb25zZVN1bW1hcnkuZGVsZXRlKGtleSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc1N0YXRlQ2hhbmdlIHx8IGlzRGV0YWlsQ2hhbmdlIHx8IGlzUmVzcG9uc2VTdW1tYXJ5Q2hhbmdlKSB7XG5cdFx0XHRcdGlmIChpc0RldGFpbENoYW5nZSkge1xuXHRcdFx0XHRcdHRoaXMudm9pY2VDbGllbnRTZXJ2aWNlLmludmFsaWRhdGVTZXNzaW9uQ2FjaGUoa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzdGF0ZUNoYW5nZXMucHVzaCh7IHNlc3Npb25JZDoga2V5LCBjdXJyZW50U3RhdGUsIGxhYmVsOiBjaGF0TW9kZWwudGl0bGUgfHwgJ0NoYXQnLCBkZXRhaWwsIGNvbmZpcm1hdGlvblR5cGUsIGxhc3RSZXNwb25zZVN1bW1hcnkgfSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY3VycmVudFN0YXRlICE9PSAndW5rbm93bicpIHtcblx0XHRcdFx0Y29uc3QgcmVtZW1iZXJlZFN1bW1hcnkgPSBub3JtYWxpemVkU3VtbWFyeSB8fCB0aGlzLl9sYXN0UmVzcG9uc2VTdW1tYXJ5QnlJZC5nZXQoa2V5KSB8fCBwcmV2Py5sYXN0UmVzcG9uc2VTdW1tYXJ5IHx8ICcnO1xuXHRcdFx0XHR0aGlzLl9wcmV2U2Vzc2lvblN0YXRlcy5zZXQoa2V5LCB7IHN0YXRlOiBjdXJyZW50U3RhdGUsIGRldGFpbDogZGV0YWlsID8/ICcnLCBwZW5kaW5nSWQsIGNvbmZpcm1hdGlvblR5cGUsIGxhc3RSZXNwb25zZVN1bW1hcnk6IHJlbWVtYmVyZWRTdW1tYXJ5IH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN1cnJlbnRTdGF0ZSA9PT0gJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicpIHtcblx0XHRcdFx0d2FpdGluZ1Nlc3Npb25JZHMuYWRkKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gS2VlcCB0aGUgc2Vzc2lvbnMtbGlzdCBwZW5kaW5nIGluZGljYXRvciBpbiBzeW5jIGZvciBjb25maXJtYXRpb25zIHRoYXRcblx0XHQvLyBhcnJpdmUgb24gc2Vzc2lvbnMgZGV0ZWN0ZWQgaGVyZSAoZS5nLiByZW1vdGUvdW5sb2FkZWQgc2Vzc2lvbnMgc3VyZmFjZWRcblx0XHQvLyB2aWEgb25EaWRDaGFuZ2VTZXNzaW9ucyBvciB0aGUgcGVyaW9kaWMgcG9sbCByYXRoZXIgdGhhbiB0aGUgYXV0b3J1bikuXG5cdFx0dGhpcy5fcmVjb25jaWxlQ29uZmlybWF0aW9uSW5kaWNhdG9ycyh3YWl0aW5nU2Vzc2lvbklkcyk7XG5cblx0XHRpZiAoc3RhdGVDaGFuZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBvbkRpZENoYW5nZVNlc3Npb25zIGRldGVjdGVkICR7c3RhdGVDaGFuZ2VzLmxlbmd0aH0gc3RhdGUgY2hhbmdlKHMpOiAke3N0YXRlQ2hhbmdlcy5tYXAoYyA9PiBgJHtjLmxhYmVsfTogJHtjLmN1cnJlbnRTdGF0ZX1gKS5qb2luKCcsICcpfWApO1xuXHRcdFx0Ly8gRmx1c2ggdGhlIGNvbnRleHQgYmVmb3JlIG5hcnJhdGluZzsgc2VlIGBfYWN0aXZhdGVTaG93blNlc3Npb25gLlxuXHRcdFx0dGhpcy5fc2VuZENvbnRleHQoKTtcblx0XHRcdHRoaXMudm9pY2VDbGllbnRTZXJ2aWNlLmZsdXNoU2Vzc2lvbkNvbnRleHQoKTtcblx0XHR9XG5cblx0XHQvLyBTcGVhayB0aGUgc2V0dGxlZCBpdGVtIGZvciB0aGUgc2hvd24gc2Vzc2lvbjsgY29tcGxldGlvbnMgc3VyZmFjZWQgT05MWVxuXHRcdC8vIGhlcmUgKGUuZy4gcmVtb3RlL3VubG9hZGVkIHNlc3Npb25zKSBhcmUgY292ZXJlZCB0b28uIEJhY2tncm91bmQgc2Vzc2lvbnNcblx0XHQvLyBhcmUgc3Bva2VuIG9uIGZvY3VzLlxuXHRcdGNvbnN0IHNob3duTm93ID0gdGhpcy5fc2hvd25TZXNzaW9uSWQoKTtcblx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBzdGF0ZUNoYW5nZXMpIHtcblx0XHRcdHRoaXMuX2hhbmRsZU5hcnJhdGFibGVTdGF0ZUNoYW5nZShjaGFuZ2Uuc2Vzc2lvbklkLCBjaGFuZ2UuY3VycmVudFN0YXRlLCBjaGFuZ2UuZGV0YWlsLCBjaGFuZ2UubGFzdFJlc3BvbnNlU3VtbWFyeSwgc2hvd25Ob3csIGNoYW5nZS5jb25maXJtYXRpb25UeXBlKTtcblx0XHR9XG5cblx0XHRpZiAoc3RhdGVDaGFuZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIHN0YXRlQ2hhbmdlcykge1xuXHRcdFx0XHR0aGlzLl9wZXJzaXN0RW50cnkoXG5cdFx0XHRcdFx0J2NvZGluZ19ldmVudCcsXG5cdFx0XHRcdFx0YHNlc3Npb24gXCIke2NoYW5nZS5sYWJlbH1cIiBcdTIxOTIgJHtjaGFuZ2UuY3VycmVudFN0YXRlfWAsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBjaGFuZ2Uuc2Vzc2lvbklkLFxuXHRcdFx0XHRcdFx0Y29kaW5nU3RhdHVzOiBjaGFuZ2UuY3VycmVudFN0YXRlLFxuXHRcdFx0XHRcdFx0Y29kaW5nU2Vzc2lvbkxhYmVsOiBjaGFuZ2UubGFiZWwsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2NvcGUgY29uZmlybWF0aW9ucyB0byB0aGUgYWN0aXZlIHNlc3Npb24gYmVmb3JlIHJlcG9ydGluZyB0byB0aGUgYmFja2VuZC5cblx0ICpcblx0ICogT25seSB0aGUgYWN0aXZlIChmb2N1c2VkL3RhcmdldCkgc2Vzc2lvbidzIGB3YWl0aW5nX2Zvcl9jb25maXJtYXRpb25gIHN0YXRlXG5cdCAqIGlzIHJlcG9ydGVkIGFzIHN1Y2g7IGFueSBPVEhFUiBzZXNzaW9uIGF3YWl0aW5nIGNvbmZpcm1hdGlvbiBpcyBkb3duZ3JhZGVkXG5cdCAqIHRvIGB0aGlua2luZ2AgKGFuZCBpdHMgY29uZmlybWF0aW9uIGRldGFpbCBkcm9wcGVkKS4gVGhpcyBkb2VzIHR3byB0aGluZ3M6XG5cdCAqXG5cdCAqICAxLiBUaGUgYmFja2VuZCBvbmx5IGV2ZXIgc2VlcyBhIHNpbmdsZSBjb25maXJtYXRpb24sIHNvIGl0IG5ldmVyIGFza3MgdGhlXG5cdCAqICAgICB1c2VyIFwid2hpY2ggb25lIGRvIHlvdSB3YW50IG1lIHRvIGFwcHJvdmU/XCIuXG5cdCAqICAyLiBXaGVuIHRoZSB1c2VyIGZvY3VzZXMgYSBzZXNzaW9uIHRoYXQgd2FzIGF3YWl0aW5nIGNvbmZpcm1hdGlvbiB3aGlsZVxuXHQgKiAgICAgdW5mb2N1c2VkLCBgX2J1aWxkU2Vzc2lvbkNvbnRleHRgIHN0YXJ0cyByZXBvcnRpbmcgaXQgYXNcblx0ICogICAgIGB3YWl0aW5nX2Zvcl9jb25maXJtYXRpb25gLiBUaGUgYmFja2VuZCBvYnNlcnZlcyB0aGUgZnJlc2hcblx0ICogICAgIGB0aGlua2luZyAtPiB3YWl0aW5nX2Zvcl9jb25maXJtYXRpb25gIHRyYW5zaXRpb24gYW5kIG5hcnJhdGVzIHRoZVxuXHQgKiAgICAgY29uZmlybWF0aW9uIGF0IHRoYXQgbW9tZW50ICh0aGUgXCJyZWFkIGl0IG91dCBvbiBmb2N1c1wiIGJlaGF2aW91cikuXG5cdCAqXG5cdCAqIFRoZSBzZXNzaW9ucy1saXN0IHBlbmRpbmcgaW5kaWNhdG9yIGZvciB0aGUgdW5mb2N1c2VkIGNvbmZpcm1hdGlvbiBpc1xuXHQgKiBkcml2ZW4gc2VwYXJhdGVseSBmcm9tIGNsaWVudC1vYnNlcnZlZCBzdGF0ZSAoX3JlY29uY2lsZUNvbmZpcm1hdGlvbkluZGljYXRvcnMpLFxuXHQgKiBzbyBpdCBzdGF5cyBhY2N1cmF0ZSBldmVuIHRob3VnaCB0aGUgYmFja2VuZCBpc24ndCB0b2xkIGFib3V0IGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVwb3J0ZWRBZ2VudFN0YXRlKHJlYWxTdGF0ZTogc3RyaW5nLCBpc0FjdGl2ZTogYm9vbGVhbik6IHsgc3RhdGU6IHN0cmluZzsgaGlkZUNvbmZpcm1hdGlvbkRldGFpbDogYm9vbGVhbiB9IHtcblx0XHRpZiAocmVhbFN0YXRlID09PSAnd2FpdGluZ19mb3JfY29uZmlybWF0aW9uJyAmJiAhaXNBY3RpdmUpIHtcblx0XHRcdHJldHVybiB7IHN0YXRlOiAndGhpbmtpbmcnLCBoaWRlQ29uZmlybWF0aW9uRGV0YWlsOiB0cnVlIH07XG5cdFx0fVxuXHRcdHJldHVybiB7IHN0YXRlOiByZWFsU3RhdGUsIGhpZGVDb25maXJtYXRpb25EZXRhaWw6IGZhbHNlIH07XG5cdH1cblxuXG5cblx0cHJpdmF0ZSBfYnVpbGRTZXNzaW9uQ29udGV4dCgpOiBJVm9pY2VTZXNzaW9uQ29udGV4dCB7XG5cdFx0Y29uc3Qgb25lSG91ckFnbyA9IERhdGUubm93KCkgLSA2MCAqIDYwICogMTAwMDtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwuc2Vzc2lvbnMuZmlsdGVyKHMgPT4ge1xuXHRcdFx0aWYgKHMuaXNBcmNoaXZlZCgpKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0aWYgKHMuc3RhdHVzID09PSBBZ2VudFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyB8fCBzLnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQpIHsgcmV0dXJuIHRydWU7IH1cblx0XHRcdGlmIChzLnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCkge1xuXHRcdFx0XHRjb25zdCBlbmRlZEF0ID0gcy50aW1pbmcubGFzdFJlcXVlc3RFbmRlZCA/PyBzLnRpbWluZy5jcmVhdGVkO1xuXHRcdFx0XHRyZXR1cm4gZW5kZWRBdCAhPT0gdW5kZWZpbmVkICYmIGVuZGVkQXQgPiBvbmVIb3VyQWdvO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0pO1xuXG5cdFx0Ly8gUHJlZmVyIGFuIGV4cGxpY2l0IHRhcmdldCBzZXNzaW9uLCBidXQgZmFsbCBiYWNrIHRvIHRoZSBjdXJyZW50bHlcblx0XHQvLyBhY3RpdmUgKGxhc3Qtc2hvd24gLyBmb2N1c2VkKSBzZXNzaW9uIHNvIHRoZSBiYWNrZW5kIGFsd2F5cyBoYXMgYVxuXHRcdC8vIHNpbmdsZSBhY3RpdmUgc2Vzc2lvbiB0byBhY3Qgb24uIFdpdGhvdXQgdGhpcywgd2hlbiBzZXZlcmFsIHNlc3Npb25zXG5cdFx0Ly8gYXdhaXQgY29uZmlybWF0aW9uIHRoZSBiYWNrZW5kIGhhcyBubyBhY3RpdmUgc2Vzc2lvbiBhbmQgYXNrcyB0aGUgdXNlclxuXHRcdC8vIHdoaWNoIG9uZSB0byB1c2UuXG5cdFx0Y29uc3QgdGFyZ2V0U2Vzc2lvbklkID0gdGhpcy5fZ2V0QWN0aXZlU2Vzc2lvbklkKCk7XG5cblx0XHRjb25zdCBzZXNzaW9uTGlzdCA9IHNlc3Npb25zLm1hcChzID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKHMucmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgaXNBY3RpdmUgPSBzLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHRhcmdldFNlc3Npb25JZDtcblx0XHRcdGlmICghbW9kZWwpIHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbklkU3RyID0gcy5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0XHRsZXQgZmFsbGJhY2tTdGF0ZSA9IHMuc3RhdHVzID09PSBBZ2VudFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyA/ICd0aGlua2luZydcblx0XHRcdFx0XHQ6IHMuc3RhdHVzID09PSBBZ2VudFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCA/ICd3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24nXG5cdFx0XHRcdFx0XHQ6IHMuc3RhdHVzID09PSBBZ2VudFNlc3Npb25TdGF0dXMuQ29tcGxldGVkID8gJ2lkbGUnXG5cdFx0XHRcdFx0XHRcdDogJ3Vua25vd24nO1xuXHRcdFx0XHQvLyBJZiB0aGlzIGlkbGUgdHJhbnNpdGlvbiBpcyBkZWZlcnJlZCB1bnRpbCB0aGUgbW9kZWwgbG9hZHMsIGtlZXBcblx0XHRcdFx0Ly8gcmVwb3J0aW5nIHRoZSBwcmlvciBzdGF0ZSBzbyB0aGUgYmFja2VuZCBkb2Vzbid0IG5hcnJhdGUgYVxuXHRcdFx0XHQvLyBwcmVtYXR1cmUsIHN1bW1hcnktbGVzcyBjb21wbGV0aW9uLiBTZWUgX3BlbmRpbmdJZGxlTmFycmF0aW9uLlxuXHRcdFx0XHQvLyBJZiB3ZSBhbHJlYWR5IGNhY2hlZCBhIHN1bW1hcnkgd2hpbGUgdGhlIG1vZGVsIHdhcyByZXNpZGVudCB3ZVxuXHRcdFx0XHQvLyBjYW4gbmFycmF0ZSBub3csIHNvIGRvbid0IGhvbGQgaW4gdGhhdCBjYXNlLlxuXHRcdFx0XHRpZiAoZmFsbGJhY2tTdGF0ZSA9PT0gJ2lkbGUnICYmIHRoaXMuX3BlbmRpbmdJZGxlTmFycmF0aW9uLmhhcyhzZXNzaW9uSWRTdHIpICYmICF0aGlzLl9sYXN0UmVzcG9uc2VTdW1tYXJ5QnlJZC5oYXMoc2Vzc2lvbklkU3RyKSkge1xuXHRcdFx0XHRcdGNvbnN0IHByZXYgPSB0aGlzLl9wcmV2U2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbklkU3RyKTtcblx0XHRcdFx0XHRpZiAocHJldj8uc3RhdGUpIHtcblx0XHRcdFx0XHRcdGZhbGxiYWNrU3RhdGUgPSBwcmV2LnN0YXRlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBBIGNvbmZpcm1hdGlvbiB3aG9zZSBtb2RlbCBpc24ndCByZXNpZGVudCBoYXMgbm8gZGV0YWlsIHlldDsgcmVwb3J0IGB0aGlua2luZ2AgKGFuZCBsb2FkIHRoZSBtb2RlbCkgc28gdGhlIGJhY2tlbmQncyBzdGF0ZSB0cmFja2luZyBkb2Vzbid0IGJyaWVmbHkgc2hvdyBhIGRldGFpbC1sZXNzIGNvbmZpcm1hdGlvbi4gTmFycmF0aW9uIGZvbGxvd3Mgb25jZSB0aGUgZGV0YWlsIHJlbmRlcnMuXG5cdFx0XHRcdGlmIChmYWxsYmFja1N0YXRlID09PSAnd2FpdGluZ19mb3JfY29uZmlybWF0aW9uJykge1xuXHRcdFx0XHRcdHRoaXMuX2Vuc3VyZU1vZGVsTG9hZGVkKHMucmVzb3VyY2UpO1xuXHRcdFx0XHRcdGZhbGxiYWNrU3RhdGUgPSAndGhpbmtpbmcnO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHNjb3BlZCA9IHRoaXMuX3JlcG9ydGVkQWdlbnRTdGF0ZShmYWxsYmFja1N0YXRlLCBpc0FjdGl2ZSk7XG5cdFx0XHRcdC8vIFN1cHBseSB0aGUgc3VtbWFyeSBjYXB0dXJlZCB3aGlsZSB0aGUgbW9kZWwgd2FzIHJlc2lkZW50LCBzbyBhblxuXHRcdFx0XHQvLyBpZGxlIGNvbXBsZXRpb24gdGhhdCBsYW5kcyBhZnRlciB0aGUgbW9kZWwgaXMgZGlzcG9zZWQgc3RpbGxcblx0XHRcdFx0Ly8gbmFycmF0ZXMgaW5zdGVhZCBvZiBzaGlwcGluZyBhIHN1bW1hcnktbGVzcyAoc2lsZW50KSBpZGxlLlxuXHRcdFx0XHRjb25zdCBjYWNoZWRTdW1tYXJ5ID0gZmFsbGJhY2tTdGF0ZSA9PT0gJ2lkbGUnID8gdGhpcy5fbGFzdFJlc3BvbnNlU3VtbWFyeUJ5SWQuZ2V0KHNlc3Npb25JZFN0cikgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6IHNlc3Npb25JZFN0cixcblx0XHRcdFx0XHQuLi4ocy5sYWJlbCA/IHsgbGFiZWw6IHMubGFiZWwgfSA6IHt9KSxcblx0XHRcdFx0XHRpc19hY3RpdmU6IGlzQWN0aXZlLFxuXHRcdFx0XHRcdGFnZW50X3N0YXRlOiBzY29wZWQuc3RhdGUsXG5cdFx0XHRcdFx0Li4uKGNhY2hlZFN1bW1hcnkgPyB7IGxhc3RfcmVzcG9uc2Vfc3VtbWFyeTogY2FjaGVkU3VtbWFyeSB9IDoge30pLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3RhdGVJbmZvID0gdGhpcy5fZ2V0QWdlbnRTdGF0ZUluZm8obW9kZWwpO1xuXHRcdFx0Ly8gQ2FwdHVyZSB0aGUgc3VtbWFyeSB3aGlsZSB0aGUgbW9kZWwgaXMgcmVzaWRlbnQgc28gYSBsYXRlclxuXHRcdFx0Ly8gY29tcGxldGlvbiByZXBvcnRlZCBhZnRlciB0aGUgbW9kZWwgaXMgZGlzcG9zZWQgY2FuIHN0aWxsIG5hcnJhdGUuXG5cdFx0XHR0aGlzLl9jYWNoZVJlc3BvbnNlU3VtbWFyeShzLnJlc291cmNlLnRvU3RyaW5nKCksIHN0YXRlSW5mby5zdGF0ZSwgc3RhdGVJbmZvLmxhc3RfcmVzcG9uc2Vfc3VtbWFyeSk7XG5cdFx0XHQvLyBSZXBvcnQgYSBkZXRhaWwtbGVzcyBjb25maXJtYXRpb24gYXMgYHRoaW5raW5nYCBzbyB0aGUgYmFja2VuZCdzIHN0YXRlIHRyYWNraW5nIGRvZXNuJ3QgYnJpZWZseSBzaG93IGEgY29uZmlybWF0aW9uIHdpdGhvdXQgaXRzIGRldGFpbDsgbmFycmF0aW9uIGlzIGRyaXZlbiBzZXBhcmF0ZWx5IG9uY2UgdGhlIGRldGFpbCByZW5kZXJzLlxuXHRcdFx0Y29uc3QgZGV0YWlsUGVuZGluZyA9IHN0YXRlSW5mby5zdGF0ZSA9PT0gJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicgJiYgIXN0YXRlSW5mby5kZXRhaWw7XG5cdFx0XHQvLyBIb2xkIGEgc3VtbWFyeS1sZXNzIGlkbGUgd2hpbGUgYW4gZWFnZXIgcmVsb2FkIGlzIHN0aWxsIHJlcGxheWluZyB0aGVcblx0XHRcdC8vIHJlc3BvbnNlLCBzbyB3ZSBkb24ndCBzaGlwIChhbmQgY29uc3VtZSkgdGhlIGlkbGUgYmVmb3JlIHRoZSBzdW1tYXJ5XG5cdFx0XHQvLyBpcyByZWFkeS4gU2VlIF9lZmZlY3RpdmVSZXNpZGVudFN0YXRlLlxuXHRcdFx0Y29uc3QgaGVsZFN0YXRlID0gdGhpcy5fZWZmZWN0aXZlUmVzaWRlbnRTdGF0ZShzLnJlc291cmNlLnRvU3RyaW5nKCksIHN0YXRlSW5mbyk7XG5cdFx0XHRjb25zdCBzY29wZWQgPSBkZXRhaWxQZW5kaW5nXG5cdFx0XHRcdD8geyBzdGF0ZTogJ3RoaW5raW5nJywgaGlkZUNvbmZpcm1hdGlvbkRldGFpbDogdHJ1ZSB9XG5cdFx0XHRcdDogdGhpcy5fcmVwb3J0ZWRBZ2VudFN0YXRlKGhlbGRTdGF0ZSwgaXNBY3RpdmUpO1xuXHRcdFx0Y29uc3Qgc2hpcFN1bW1hcnkgPSBoZWxkU3RhdGUgPT09IHN0YXRlSW5mby5zdGF0ZSA/IHN0YXRlSW5mby5sYXN0X3Jlc3BvbnNlX3N1bW1hcnkgOiB1bmRlZmluZWQ7XG5cdFx0XHQvLyBgcGVuZGluZ2Agc2hpcHMgZXZlbiB3aGVuIHRoZSBkZXRhaWwgaXMgaGVsZCBiYWNrOiBpdCBpcyB3aGF0IG1ha2VzIGFcblx0XHRcdC8vIGZvcm0gYW5zd2VyYWJsZSwgYW5kIHdpdGhob2xkaW5nIGl0IHdvdWxkIGxlYXZlIGEgZm9ybSB0aGUgdXNlciBjYW5cblx0XHRcdC8vIHNlZSB3aXRoIG5vIHdheSB0byBhbnN3ZXIgaXQgYnkgdm9pY2UuXG5cdFx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fYnVpbGRQZW5kaW5nUGF5bG9hZChtb2RlbCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogcy5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHQuLi4ocy5sYWJlbCA/IHsgbGFiZWw6IHMubGFiZWwgfSA6IHt9KSxcblx0XHRcdFx0aXNfYWN0aXZlOiBpc0FjdGl2ZSxcblx0XHRcdFx0YWdlbnRfc3RhdGU6IHNjb3BlZC5zdGF0ZSxcblx0XHRcdFx0Li4uKCFzY29wZWQuaGlkZUNvbmZpcm1hdGlvbkRldGFpbCAmJiBzdGF0ZUluZm8uZGV0YWlsID8geyBhZ2VudF9zdGF0ZV9kZXRhaWw6IHN0YXRlSW5mby5kZXRhaWwgfSA6IHt9KSxcblx0XHRcdFx0Li4uKCFzY29wZWQuaGlkZUNvbmZpcm1hdGlvbkRldGFpbCAmJiBzdGF0ZUluZm8uY29uZmlybWF0aW9uX3R5cGUgPyB7IGNvbmZpcm1hdGlvbl90eXBlOiBzdGF0ZUluZm8uY29uZmlybWF0aW9uX3R5cGUgfSA6IHt9KSxcblx0XHRcdFx0Li4uKHNoaXBTdW1tYXJ5ID8geyBsYXN0X3Jlc3BvbnNlX3N1bW1hcnk6IHNoaXBTdW1tYXJ5IH0gOiB7fSksXG5cdFx0XHRcdC4uLihwZW5kaW5nID8geyBwZW5kaW5nIH0gOiB7fSksXG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0Ly8gQWxzbyBpbmNsdWRlIHJlZ3VsYXIgKG5vbi1hZ2VudCkgY2hhdCBzZXNzaW9ucyB3aXRoIHJlcXVlc3RzIHNvIHRoZVxuXHRcdC8vIGJhY2tlbmQgY2FuIHRyYWNrIHRoZWlyIHN0YXRlIChjb25maXJtYXRpb25zLCBjb21wbGV0aW9ucywgZXRjLilcblx0XHRjb25zdCBhZ2VudFJlc291cmNlcyA9IG5ldyBTZXQodGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9ucy5tYXAocyA9PiBzLnJlc291cmNlLnRvU3RyaW5nKCkpKTtcblx0XHRmb3IgKGNvbnN0IGNoYXRNb2RlbCBvZiB0aGlzLmNoYXRTZXJ2aWNlLmNoYXRNb2RlbHMuZ2V0KCkpIHtcblx0XHRcdGNvbnN0IGtleSA9IGNoYXRNb2RlbC5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdGlmIChhZ2VudFJlc291cmNlcy5oYXMoa2V5KSkgeyBjb250aW51ZTsgfVxuXHRcdFx0aWYgKGNoYXRNb2RlbC5nZXRSZXF1ZXN0cygpLmxlbmd0aCA9PT0gMCkgeyBjb250aW51ZTsgfVxuXHRcdFx0Y29uc3Qgc3RhdGVJbmZvID0gdGhpcy5fZ2V0QWdlbnRTdGF0ZUluZm8oY2hhdE1vZGVsKTtcblx0XHRcdC8vIEluY2x1ZGUgYWN0aXZlL3dhaXRpbmcgc2Vzc2lvbnMgYWx3YXlzLCBpZGxlIG9ubHkgaWYgcmVjZW50XG5cdFx0XHRpZiAoc3RhdGVJbmZvLnN0YXRlID09PSAnaWRsZScpIHtcblx0XHRcdFx0Y29uc3QgbGFzdEFjdGl2ZSA9IGNoYXRNb2RlbC5sYXN0TWVzc2FnZURhdGU7XG5cdFx0XHRcdGlmIChsYXN0QWN0aXZlIDwgb25lSG91ckFnbykgeyBjb250aW51ZTsgfVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaXNBY3RpdmUgPSBrZXkgPT09IHRhcmdldFNlc3Npb25JZDtcblx0XHRcdGNvbnN0IHNjb3BlZCA9IHRoaXMuX3JlcG9ydGVkQWdlbnRTdGF0ZShzdGF0ZUluZm8uc3RhdGUsIGlzQWN0aXZlKTtcblx0XHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9idWlsZFBlbmRpbmdQYXlsb2FkKGNoYXRNb2RlbCk7XG5cdFx0XHRzZXNzaW9uTGlzdC5wdXNoKHtcblx0XHRcdFx0aWQ6IGtleSxcblx0XHRcdFx0Li4uKGNoYXRNb2RlbC50aXRsZSA/IHsgbGFiZWw6IGNoYXRNb2RlbC50aXRsZSB9IDoge30pLFxuXHRcdFx0XHRpc19hY3RpdmU6IGlzQWN0aXZlLFxuXHRcdFx0XHRhZ2VudF9zdGF0ZTogc2NvcGVkLnN0YXRlLFxuXHRcdFx0XHQuLi4oIXNjb3BlZC5oaWRlQ29uZmlybWF0aW9uRGV0YWlsICYmIHN0YXRlSW5mby5kZXRhaWwgPyB7IGFnZW50X3N0YXRlX2RldGFpbDogc3RhdGVJbmZvLmRldGFpbCB9IDoge30pLFxuXHRcdFx0XHQuLi4oIXNjb3BlZC5oaWRlQ29uZmlybWF0aW9uRGV0YWlsICYmIHN0YXRlSW5mby5jb25maXJtYXRpb25fdHlwZSA/IHsgY29uZmlybWF0aW9uX3R5cGU6IHN0YXRlSW5mby5jb25maXJtYXRpb25fdHlwZSB9IDoge30pLFxuXHRcdFx0XHQuLi4oc3RhdGVJbmZvLmxhc3RfcmVzcG9uc2Vfc3VtbWFyeSA/IHsgbGFzdF9yZXNwb25zZV9zdW1tYXJ5OiBzdGF0ZUluZm8ubGFzdF9yZXNwb25zZV9zdW1tYXJ5IH0gOiB7fSksXG5cdFx0XHRcdC4uLihwZW5kaW5nID8geyBwZW5kaW5nIH0gOiB7fSksXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBgYWN0aXZlX3Nlc3Npb25gIGlzIG5vdCBzZW50OiB0aGUgcGVyLXNlc3Npb24gYGlzX2FjdGl2ZWAgZmxhZyBhbHJlYWR5XG5cdFx0Ly8gbmFtZXMgdGhlIGZvY3VzZWQgc2Vzc2lvbiwgYW5kIHRoZSBiYWNrZW5kIGtleXMgdGhlIG1hcmtlciBvZmYgaXQuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlc3Npb25zOiBzZXNzaW9uTGlzdCxcblx0XHRcdGRpc3BsYXlfbG9jYWxlOiB0aGlzLl93aW5kb3c/Lm5hdmlnYXRvci5sYW5ndWFnZSB8fCAnZW4tVVMnLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogRWFnZXJseSBsb2FkIGEgY2hhdCBtb2RlbCBmb3IgYSBzZXNzaW9uIHRoYXQgbmVlZHMgaW5wdXQgYnV0IGhhc24ndCBiZWVuXG5cdCAqIG9wZW5lZCBpbiB0aGUgVUkgeWV0LiBPbmNlIGxvYWRlZCwgdGhlIGF1dG9ydW4gb2JzZXJ2YWJsZXMgd2lsbCByZS1maXJlXG5cdCAqIHdpdGggZnVsbCBjb25maXJtYXRpb24gZGV0YWlsIHNvIHRoZSBiYWNrZW5kIGNhbiBuYXJyYXRlIHByb3Blcmx5LlxuXHQgKi9cblx0cHJpdmF0ZSBfZW5zdXJlTW9kZWxMb2FkZWQocmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Ly8gU2tpcCBpZiBhbHJlYWR5IGxvYWRlZCwgcmVzaWRlbnQgaW4gdGhlIFVJLCBvciBhIGxvYWQgaXMgaW4gZmxpZ2h0LlxuXHRcdC8vIFRoZSBpbi1mbGlnaHQgZ3VhcmQgcHJldmVudHMgcmVwZWF0ZWQgb25EaWRDaGFuZ2VTZXNzaW9ucy9hdXRvcnVuXG5cdFx0Ly8gY3ljbGVzIGZyb20gc3RhcnRpbmcgY29uY3VycmVudCBsb2FkcyB3aG9zZSByZWZzIHdvdWxkIG92ZXJ3cml0ZSBlYWNoXG5cdFx0Ly8gb3RoZXIgaW4gX2VhZ2VyTW9kZWxSZWZzIGFuZCBsZWFrIHRoZSBwcmlvciByZWYuXG5cdFx0aWYgKHRoaXMuX2VhZ2VyTW9kZWxSZWZzLmhhcyhrZXkpIHx8IHRoaXMuX2VhZ2VyTW9kZWxMb2FkaW5nLmhhcyhrZXkpIHx8IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbdm9pY2VdIGVhZ2VybHkgbG9hZGluZyBtb2RlbCBmb3Igc2Vzc2lvbiAke2tleS5zbGljZSgtMzIpfWApO1xuXHRcdHRoaXMuX2VhZ2VyTW9kZWxMb2FkaW5nLmFkZChrZXkpO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuY2hhdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24ocmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGN0cy50b2tlbiwgJ1ZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIjZWFnZXJMb2FkJykudGhlbihyZWYgPT4ge1xuXHRcdFx0dGhpcy5fZWFnZXJNb2RlbExvYWRpbmcuZGVsZXRlKGtleSk7XG5cdFx0XHRpZiAocmVmKSB7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fZWFnZXJNb2RlbFJlZnMuZ2V0KGtleSk7XG5cdFx0XHRcdGlmICghdGhpcy5faXNDb25uZWN0ZWQuZ2V0KCkgfHwgZXhpc3RpbmcpIHtcblx0XHRcdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGlmICghdGhpcy5faXNDb25uZWN0ZWQuZ2V0KCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdJZGxlTmFycmF0aW9uLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9lYWdlck1vZGVsUmVmcy5zZXQoa2V5LCByZWYpO1xuXHRcdFx0XHRcdC8vIE1vZGVsIHN0YXRlL2RldGFpbCBhcmUgbm93IHJlYWRhYmxlOyBmbHVzaCBzbyBjb25maXJtYXRpb24gbmFycmF0ZXNcblx0XHRcdFx0XHQvLyBpbW1lZGlhdGVseSBpbnN0ZWFkIG9mIHdhaXRpbmcgZm9yIHRoZSBuZXh0IGNvbnRleHQgc2VuZC5cblx0XHRcdFx0XHR0aGlzLl9jaGVja1Nlc3Npb25TdGF0ZUNoYW5nZXMoKTtcblx0XHRcdFx0XHR0aGlzLl9zZW5kQ29udGV4dCgpO1xuXHRcdFx0XHRcdHRoaXMudm9pY2VDbGllbnRTZXJ2aWNlLmZsdXNoU2Vzc2lvbkNvbnRleHQoKTtcblx0XHRcdFx0XHQvLyBJZiB0aGUgdXNlciBpcyBsb29raW5nIGF0IHRoaXMgc2Vzc2lvbiwgbmFycmF0ZSBpdHMgbm93LXJlc2lkZW50XG5cdFx0XHRcdFx0Ly8gcGVuZGluZyBpdGVtIGRpcmVjdGx5LiBfY2hlY2tTZXNzaW9uU3RhdGVDaGFuZ2VzIG9ubHkgbmFycmF0ZXMgb25cblx0XHRcdFx0XHQvLyBhIHN0YXRlIHRyYW5zaXRpb24sIGJ1dCBhIGNvbXBsZXRlZCByZXBseSBmb2N1c2VkIGFmdGVyIGl0IHNldHRsZWRcblx0XHRcdFx0XHQvLyBzaG93cyBubyBpZGxlLT5pZGxlIHRyYW5zaXRpb24gYW5kIHdvdWxkIG90aGVyd2lzZSBzdGF5IHNpbGVudC5cblx0XHRcdFx0XHQvLyBfbmFycmF0ZSdzIF9sYXN0TmFycmF0ZWRUZXh0IGd1YXJkIHByZXZlbnRzIGRvdWJsZS1yZWFkaW5nIGFuXG5cdFx0XHRcdFx0Ly8gYWxyZWFkeS1yZWFkIHJlcGx5OyB0aGlzIG1pcnJvcnMgdGhlIGNvbmZpcm1hdGlvbi1vbi1mb2N1cyBwYXRoLlxuXHRcdFx0XHRcdGlmICh0aGlzLl9zaG93blNlc3Npb25JZCgpID09PSBrZXkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2FjdGl2YXRlU2hvd25TZXNzaW9uKHJlc291cmNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIExvYWQgZmFpbGVkOyBzdG9wIHN1cHByZXNzaW5nIHRoZSBjb2Fyc2UgaWRsZSBmb3IgdGhpcyBzZXNzaW9uLlxuXHRcdFx0XHR0aGlzLl9wZW5kaW5nSWRsZU5hcnJhdGlvbi5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0fSwgKCkgPT4geyB0aGlzLl9lYWdlck1vZGVsTG9hZGluZy5kZWxldGUoa2V5KTsgdGhpcy5fcGVuZGluZ0lkbGVOYXJyYXRpb24uZGVsZXRlKGtleSk7IGN0cy5kaXNwb3NlKCk7IH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIERlZmVyIG5hcnJhdGluZyBhIHNlc3Npb24ncyBgYGlkbGVgYCB0cmFuc2l0aW9uIHVudGlsIGl0cyBjaGF0IG1vZGVsIGlzXG5cdCAqIHJlc2lkZW50LCBzbyB0aGUgbmFycmF0aW9uIGNhbiBpbmNsdWRlIGBgbGFzdF9yZXNwb25zZV9zdW1tYXJ5YGAuIFJlbW90ZS9cblx0ICogQ29waWxvdCBzZXNzaW9ucyBkb24ndCBrZWVwIHRoZWlyIG1vZGVsIGxvYWRlZCwgc28gd2l0aG91dCB0aGlzIHRoZVxuXHQgKiBiYWNrZW5kIHdvdWxkIG9ubHkgZXZlciBzZWUgYSBzdW1tYXJ5LWxlc3MgY29tcGxldGlvbi4gRWFnZXJseSBsb2FkcyB0aGVcblx0ICogbW9kZWw7IG9uY2UgaXQgcmVzb2x2ZXMgdGhlIGF1dG9ydW4gcmUtZmlyZXMgYW5kIG5hcnJhdGVzIHdpdGggdGhlIHN1bW1hcnkuXG5cdCAqL1xuXHRwcml2YXRlIF9kZWZlcklkbGVOYXJyYXRpb25VbnRpbE1vZGVsTG9hZGVkKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nSWRsZU5hcnJhdGlvbi5hZGQocmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0dGhpcy5fZW5zdXJlTW9kZWxMb2FkZWQocmVzb3VyY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhY2hlIChvciBpbnZhbGlkYXRlKSBhIHNlc3Npb24ncyByZXNwb25zZSBzdW1tYXJ5IGJhc2VkIG9uIHRoZSBjdXJyZW50XG5cdCAqIHN0YXRlIG9ic2VydmVkIGZyb20gaXRzIHJlc2lkZW50IG1vZGVsLiBDYWxsZWQgd2hlcmV2ZXIgYSByZXNpZGVudCBtb2RlbCdzXG5cdCAqIHN0YXRlIGlzIGNvbXB1dGVkIHNvIHRoZSBzdW1tYXJ5IHN1cnZpdmVzIHRoZSBtb2RlbCdzIGRpc3Bvc2FsLlxuXHQgKiAtIGBpZGxlYCB3aXRoIGEgc3VtbWFyeSBcdTIxOTIgY2FjaGUgaXQgKHRoZSBjb21wbGV0ZWQgcmVwbHkpLlxuXHQgKiAtIGB0aGlua2luZ2AgXHUyMTkyIGEgbmV3IHR1cm4gc3RhcnRlZDsgZHJvcCB0aGUgc3RhbGUgc3VtbWFyeSBzbyBhIGxhdGVyXG5cdCAqICAgY29tcGxldGlvbiBuZXZlciBuYXJyYXRlcyB0aGUgcHJldmlvdXMgcmVwbHkuXG5cdCAqL1xuXHRwcml2YXRlIF9jYWNoZVJlc3BvbnNlU3VtbWFyeShzZXNzaW9uSWQ6IHN0cmluZywgc3RhdGU6IHN0cmluZywgc3VtbWFyeTogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHN0YXRlID09PSAnaWRsZScgJiYgc3VtbWFyeSkge1xuXHRcdFx0dGhpcy5fbGFzdFJlc3BvbnNlU3VtbWFyeUJ5SWQuc2V0KHNlc3Npb25JZCwgc3VtbWFyeSk7XG5cdFx0fSBlbHNlIGlmIChzdGF0ZSA9PT0gJ3RoaW5raW5nJykge1xuXHRcdFx0dGhpcy5fbGFzdFJlc3BvbnNlU3VtbWFyeUJ5SWQuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIERyb3AgcGVyLXNlc3Npb24gY2FjaGVzIGZvciBzZXNzaW9ucyBubyBsb25nZXIgaW4gdGhlIHRyYWNrZWQgc2V0LCBzbyBhXG5cdCAqIGxvbmctbGl2ZWQgdm9pY2UgY29ubmVjdGlvbiBkb2Vzbid0IHJldGFpbiBzdW1tYXJpZXMvc3RhdGUgZm9yIGFyY2hpdmVkLFxuXHQgKiByZW1vdmVkLCBvciBkaXNwb3NlZCBzZXNzaW9ucyB0aGF0IHdpbGwgbmV2ZXIgYmUgbmFycmF0ZWQgYWdhaW4uXG5cdCAqL1xuXHRwcml2YXRlIF9wcnVuZVNlc3Npb25DYWNoZXMobGl2ZVNlc3Npb25JZHM6IFNldDxzdHJpbmc+KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBpZCBvZiB0aGlzLl9sYXN0UmVzcG9uc2VTdW1tYXJ5QnlJZC5rZXlzKCkpIHtcblx0XHRcdGlmICghbGl2ZVNlc3Npb25JZHMuaGFzKGlkKSkge1xuXHRcdFx0XHR0aGlzLl9sYXN0UmVzcG9uc2VTdW1tYXJ5QnlJZC5kZWxldGUoaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGlkIG9mIHRoaXMuX2xhc3ROYXJyYXRlZFRleHQua2V5cygpKSB7XG5cdFx0XHRpZiAoIWxpdmVTZXNzaW9uSWRzLmhhcyhpZCkpIHtcblx0XHRcdFx0dGhpcy5fbGFzdE5hcnJhdGVkVGV4dC5kZWxldGUoaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGlkIG9mIEFycmF5LmZyb20odGhpcy5fc2Vzc2lvbnNBd2FpdGluZ1Jlc3BvbnNlU3VtbWFyeSkpIHtcblx0XHRcdGlmICghbGl2ZVNlc3Npb25JZHMuaGFzKGlkKSkge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uc0F3YWl0aW5nUmVzcG9uc2VTdW1tYXJ5LmRlbGV0ZShpZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIEEgYmFja2dyb3VuZCBzZXNzaW9uIHRoYXQgY29tcGxldGVkIGEgcmVwbHkgYnV0IHdhcyBhcmNoaXZlZC9yZW1vdmVkXG5cdFx0Ly8gYmVmb3JlIGJlaW5nIGZvY3VzZWQgd291bGQgb3RoZXJ3aXNlIGtlZXAgaXRzIHBlbmRpbmctcmVzcG9uc2Ugc3VtbWFyeVxuXHRcdC8vIGFuZCBzZXNzaW9ucy1saXN0IGluZGljYXRvciBmb3IgdGhlIGxpZmUgb2YgdGhlIHZvaWNlIGNvbm5lY3Rpb24uXG5cdFx0Ly8gX2NsZWFyUGVuZGluZ1Jlc3BvbnNlIGRyb3BzIHRoZSBzdW1tYXJ5IGFuZCBoaWRlcyB0aGUgaW5kaWNhdG9yIChvbmx5XG5cdFx0Ly8gd2hlbiBubyBvdGhlciBvd25lciBzdGlsbCBuZWVkcyBpdCkuXG5cdFx0Zm9yIChjb25zdCBpZCBvZiBbLi4udGhpcy5fcGVuZGluZ1Jlc3BvbnNlU3VtbWFyaWVzLmtleXMoKV0pIHtcblx0XHRcdGlmICghbGl2ZVNlc3Npb25JZHMuaGFzKGlkKSkge1xuXHRcdFx0XHR0aGlzLl9jbGVhclBlbmRpbmdSZXNwb25zZShpZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBzdGF0ZSB0byByZXBvcnQgZm9yIGEgcmVzaWRlbnQgbW9kZWwsIGFwcGx5aW5nIHRoZSBpZGxlLW5hcnJhdGlvbiBob2xkLlxuXHQgKlxuXHQgKiBXaGVuIGEgY29tcGxldGlvbiBpcyBkZXRlY3RlZCBmb3IgYW4gdW5mb2N1c2VkIHNlc3Npb24gd2UgZWFnZXJseSByZWxvYWRcblx0ICogaXRzIChkaXNwb3NlZCkgbW9kZWwgdG8gcmVjb3ZlciBgYGxhc3RfcmVzcG9uc2Vfc3VtbWFyeWBgLiBUaGF0IHJlbG9hZGVkXG5cdCAqIG1vZGVsIGlzIGJyaWVmbHkgcmVzaWRlbnQgd2l0aCBhbiBFTVBUWSByZXNwb25zZSB3aGlsZSBpdHMgaGlzdG9yeSBpcyBzdGlsbFxuXHQgKiByZXBsYXlpbmcsIHNvIHJlcG9ydGluZyBpdHMgYmFyZSBgYGlkbGVgYCBub3cgd291bGQgc2hpcCBhIHN1bW1hcnktbGVzc1xuXHQgKiBjb21wbGV0aW9uICh3aGljaCB0aGUgYmFja2VuZCBuZXZlciBuYXJyYXRlcykgQU5EIGNvbnN1bWUgdGhlIGBgaWRsZWBgXG5cdCAqIHRyYW5zaXRpb24gYmVmb3JlIHRoZSBzdW1tYXJ5IGV4aXN0cy4gV2hpbGUgdGhlIGVhZ2VyIGxvYWQgaXMgc3RpbGwgaW5cblx0ICogZmxpZ2h0IHdlIHRoZXJlZm9yZSBob2xkIFx1MjAxNCByZXBvcnQgdGhlIHByaW9yIHN0YXRlIFx1MjAxNCBzbyB0aGUgYGBpZGxlYGAgaXNuJ3Rcblx0ICogc2hpcHBlZCB1bnRpbCBpdCBjYW4gY2FycnkgdGhlIHN1bW1hcnkuIFRoZSBsb2FkIGFsd2F5cyByZXNvbHZlcyAoaXRzXG5cdCAqIGNhbGxiYWNrIGNsZWFycyBgYF9lYWdlck1vZGVsTG9hZGluZ2BgKSwgc28gdGhlIGhvbGQgY2FuIG5ldmVyIGxhc3QgZm9yZXZlci5cblx0ICovXG5cdHByaXZhdGUgX2VmZmVjdGl2ZVJlc2lkZW50U3RhdGUoc2Vzc2lvbklkOiBzdHJpbmcsIHN0YXRlSW5mbzogeyBzdGF0ZTogc3RyaW5nOyBsYXN0X3Jlc3BvbnNlX3N1bW1hcnk/OiBzdHJpbmcgfSk6IHN0cmluZyB7XG5cdFx0aWYgKHN0YXRlSW5mby5zdGF0ZSA9PT0gJ2lkbGUnXG5cdFx0XHQmJiAhc3RhdGVJbmZvLmxhc3RfcmVzcG9uc2Vfc3VtbWFyeVxuXHRcdFx0JiYgdGhpcy5fcGVuZGluZ0lkbGVOYXJyYXRpb24uaGFzKHNlc3Npb25JZClcblx0XHRcdCYmIHRoaXMuX2VhZ2VyTW9kZWxMb2FkaW5nLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHRjb25zdCBwcmV2ID0gdGhpcy5fcHJldlNlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0XHRyZXR1cm4gcHJldj8uc3RhdGUgPz8gJ3RoaW5raW5nJztcblx0XHR9XG5cdFx0cmV0dXJuIHN0YXRlSW5mby5zdGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgX3Zpc2libGVDb25maXJtYXRpb25UZXh0KHZhbHVlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQsIG1heExlbmd0aCA9IFZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuX01BWF9DT05GSVJNQVRJT05fRklFTERfQ0hBUlMpOiBzdHJpbmcge1xuXHRcdGlmICghdmFsdWUpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0Y29uc3QgcGxhaW5UZXh0ID0gcmVuZGVyQXNQbGFpbnRleHQodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHsgdmFsdWUgfSA6IHZhbHVlLCB7IHVzZUxpbmtGb3JtYXR0ZXI6IHRydWUgfSkucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRyaW0oKTtcblx0XHRpZiAocGxhaW5UZXh0Lmxlbmd0aCA8PSBtYXhMZW5ndGgpIHtcblx0XHRcdHJldHVybiBwbGFpblRleHQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByZWZpeCA9IHBsYWluVGV4dC5zbGljZSgwLCBtYXhMZW5ndGggLSAzKTtcblx0XHRjb25zdCB3b3JkQm91bmRhcnkgPSBwcmVmaXgubGFzdEluZGV4T2YoJyAnKTtcblx0XHRjb25zdCB0cnVuY2F0ZWQgPSB3b3JkQm91bmRhcnkgPiBNYXRoLmZsb29yKG1heExlbmd0aCAqIDAuNikgPyBwcmVmaXguc2xpY2UoMCwgd29yZEJvdW5kYXJ5KSA6IHByZWZpeDtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3ZvaWNlLmNvbmZpcm1hdGlvbi50cnVuY2F0ZWQnLCBcInswfS4uLlwiLCB0cnVuY2F0ZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYm91bmRlZENvbmZpcm1hdGlvbkxpbmVzKGxpbmVzOiByZWFkb25seSBzdHJpbmdbXSwgZmFsbGJhY2s6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBsaW5lcy5maWx0ZXIoQm9vbGVhbikpIHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IFsuLi5yZXN1bHQsIGxpbmVdLmpvaW4oJ1xcbicpO1xuXHRcdFx0aWYgKGNhbmRpZGF0ZS5sZW5ndGggPiBWb2ljZVNlc3Npb25Db250cm9sbGVyLl9NQVhfQ09ORklSTUFUSU9OX05BUlJBVElPTl9DSEFSUykge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKGxpbmUpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0LmpvaW4oJ1xcbicpIHx8IGZhbGxiYWNrO1xuXHR9XG5cblx0cHJpdmF0ZSBfdmlzaWJsZVF1ZXN0aW9ubmFpcmVGcm9tQ2Fyb3VzZWwoY2Fyb3VzZWw6IElDaGF0UXVlc3Rpb25DYXJvdXNlbCwgaW5jbHVkZURldGFpbHM6IGJvb2xlYW4pOiBJVmlzaWJsZVZvaWNlUXVlc3Rpb25uYWlyZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRleHQ6IGNhcm91c2VsLm1lc3NhZ2UsXG5cdFx0XHRxdWVzdGlvbnM6IGNhcm91c2VsLnF1ZXN0aW9ucy5tYXAocXVlc3Rpb24gPT4gKHtcblx0XHRcdFx0cHJvbXB0OiBxdWVzdGlvbi5tZXNzYWdlID8/IChxdWVzdGlvbi50aXRsZSAhPT0gcXVlc3Rpb24uaWQgPyBxdWVzdGlvbi50aXRsZSA6IHVuZGVmaW5lZCksXG5cdFx0XHRcdGRldGFpbHM6IGluY2x1ZGVEZXRhaWxzID8gcXVlc3Rpb24uZGVzY3JpcHRpb24gPz8gcXVlc3Rpb24uZGV0YWlsZWRNZXNzYWdlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRvcHRpb25zOiAocXVlc3Rpb24ub3B0aW9ucyA/PyBbXSkubWFwKG9wdGlvbiA9PiBvcHRpb24ubGFiZWwpLFxuXHRcdFx0XHRhbGxvd0ZyZWVmb3JtSW5wdXQ6IHF1ZXN0aW9uLmFsbG93RnJlZWZvcm1JbnB1dCAhPT0gZmFsc2UsXG5cdFx0XHR9KSksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3Zpc2libGVRdWVzdGlvbm5haXJlRnJvbVRvb2xJbnZvY2F0aW9uKHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uKTogSVZpc2libGVWb2ljZVF1ZXN0aW9ubmFpcmUgfCB1bmRlZmluZWQge1xuXHRcdGlmICghaXNQZW5kaW5nVm9pY2VRdWVzdGlvbm5haXJlSW52b2NhdGlvbih0b29sSW52b2NhdGlvbikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXRlID0gdG9vbEludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24gJiYgc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvclBvc3RBcHByb3ZhbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcGFyYW1ldGVycyA9IHN0YXRlLnBhcmFtZXRlcnM7XG5cdFx0aWYgKCFpc09iamVjdChwYXJhbWV0ZXJzKSB8fCAhaGFzT3duKHBhcmFtZXRlcnMsICdxdWVzdGlvbnMnKSB8fCAhQXJyYXkuaXNBcnJheShwYXJhbWV0ZXJzLnF1ZXN0aW9ucykgfHwgcGFyYW1ldGVycy5xdWVzdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRxdWVzdGlvbnM6IHBhcmFtZXRlcnMucXVlc3Rpb25zLm1hcChyYXdRdWVzdGlvbiA9PiB7XG5cdFx0XHRcdGlmICghaXNPYmplY3QocmF3UXVlc3Rpb24pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgb3B0aW9uczogW10sIGFsbG93RnJlZWZvcm1JbnB1dDogdHJ1ZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHByb21wdCA9IGhhc093bihyYXdRdWVzdGlvbiwgJ3F1ZXN0aW9uJykgJiYgdHlwZW9mIHJhd1F1ZXN0aW9uLnF1ZXN0aW9uID09PSAnc3RyaW5nJ1xuXHRcdFx0XHRcdD8gcmF3UXVlc3Rpb24ucXVlc3Rpb25cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3Qgb3B0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0aWYgKGhhc093bihyYXdRdWVzdGlvbiwgJ29wdGlvbnMnKSAmJiBBcnJheS5pc0FycmF5KHJhd1F1ZXN0aW9uLm9wdGlvbnMpKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCByYXdPcHRpb24gb2YgcmF3UXVlc3Rpb24ub3B0aW9ucykge1xuXHRcdFx0XHRcdFx0aWYgKCFpc09iamVjdChyYXdPcHRpb24pIHx8ICFoYXNPd24ocmF3T3B0aW9uLCAnbGFiZWwnKSB8fCB0eXBlb2YgcmF3T3B0aW9uLmxhYmVsICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gaGFzT3duKHJhd09wdGlvbiwgJ2Rlc2NyaXB0aW9uJykgJiYgdHlwZW9mIHJhd09wdGlvbi5kZXNjcmlwdGlvbiA9PT0gJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0PyByYXdPcHRpb24uZGVzY3JpcHRpb25cblx0XHRcdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRvcHRpb25zLnB1c2goZGVzY3JpcHRpb24gPyBgJHtyYXdPcHRpb24ubGFiZWx9IC0gJHtkZXNjcmlwdGlvbn1gIDogcmF3T3B0aW9uLmxhYmVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWxsb3dGcmVlZm9ybUlucHV0ID0gIShoYXNPd24ocmF3UXVlc3Rpb24sICdhbGxvd0ZyZWVmb3JtSW5wdXQnKSAmJiByYXdRdWVzdGlvbi5hbGxvd0ZyZWVmb3JtSW5wdXQgPT09IGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuIHsgcHJvbXB0LCBvcHRpb25zLCBhbGxvd0ZyZWVmb3JtSW5wdXQgfTtcblx0XHRcdH0pLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9mb3JtYXRRdWVzdGlvbm5haXJlTmFycmF0aW9uKHF1ZXN0aW9ubmFpcmU6IElWaXNpYmxlVm9pY2VRdWVzdGlvbm5haXJlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmYWxsYmFjayA9IGxvY2FsaXplKCd2b2ljZS5xdWVzdGlvbm5haXJlLmZhbGxiYWNrJywgXCJJIG5lZWQgeW91ciBpbnB1dCBpbiB0aGUgb3BlbiBxdWVzdGlvbm5haXJlLlwiKTtcblx0XHRpZiAocXVlc3Rpb25uYWlyZS5xdWVzdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVzID0gW1xuXHRcdFx0cXVlc3Rpb25uYWlyZS5xdWVzdGlvbnMubGVuZ3RoID09PSAxXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3ZvaWNlLnF1ZXN0aW9ubmFpcmUuc2luZ2xlJywgXCJxdWVzdGlvbm5haXJlOiAxIHF1ZXN0aW9uXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3ZvaWNlLnF1ZXN0aW9ubmFpcmUubXVsdGlwbGUnLCBcInF1ZXN0aW9ubmFpcmU6IHswfSBxdWVzdGlvbnNcIiwgcXVlc3Rpb25uYWlyZS5xdWVzdGlvbnMubGVuZ3RoKSxcblx0XHRdO1xuXHRcdGNvbnN0IGNvbnRleHQgPSB0aGlzLl92aXNpYmxlQ29uZmlybWF0aW9uVGV4dChxdWVzdGlvbm5haXJlLmNvbnRleHQsIDIyMCk7XG5cdFx0aWYgKGNvbnRleHQpIHtcblx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ3ZvaWNlLnF1ZXN0aW9ubmFpcmUuY29udGV4dCcsIFwiY29udGV4dDogezB9XCIsIGNvbnRleHQpKTtcblx0XHR9XG5cblx0XHRsZXQgaW5jbHVkZWRRdWVzdGlvbnMgPSAwO1xuXHRcdGNvbnN0IHF1ZXN0aW9uTGltaXQgPSBNYXRoLm1pbihxdWVzdGlvbm5haXJlLnF1ZXN0aW9ucy5sZW5ndGgsIFZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuX01BWF9RVUVTVElPTk5BSVJFX1FVRVNUSU9OUyk7XG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHF1ZXN0aW9uTGltaXQ7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IHF1ZXN0aW9uID0gcXVlc3Rpb25uYWlyZS5xdWVzdGlvbnNbaW5kZXhdO1xuXHRcdFx0Y29uc3QgcHJvbXB0ID0gdGhpcy5fdmlzaWJsZUNvbmZpcm1hdGlvblRleHQocXVlc3Rpb24ucHJvbXB0KTtcblx0XHRcdGNvbnN0IHF1ZXN0aW9uTGluZXMgPSBbXG5cdFx0XHRcdGxvY2FsaXplKCd2b2ljZS5xdWVzdGlvbm5haXJlLnF1ZXN0aW9uJywgXCJ7MH0uIHsxfVwiLCBpbmRleCArIDEsIHByb21wdCB8fCBmYWxsYmFjayksXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSB0aGlzLl92aXNpYmxlQ29uZmlybWF0aW9uVGV4dChxdWVzdGlvbi5kZXRhaWxzLCAxODApO1xuXHRcdFx0aWYgKGRlc2NyaXB0aW9uICYmIGRlc2NyaXB0aW9uICE9PSBwcm9tcHQpIHtcblx0XHRcdFx0cXVlc3Rpb25MaW5lcy5wdXNoKGxvY2FsaXplKCd2b2ljZS5xdWVzdGlvbm5haXJlLmRlc2NyaXB0aW9uJywgXCJkZXRhaWxzOiB7MH1cIiwgZGVzY3JpcHRpb24pKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdmlzaWJsZU9wdGlvbnMgPSBxdWVzdGlvbi5vcHRpb25zXG5cdFx0XHRcdC5tYXAob3B0aW9uID0+IHRoaXMuX3Zpc2libGVDb25maXJtYXRpb25UZXh0KG9wdGlvbiwgMTYwKSlcblx0XHRcdFx0LmZpbHRlcihCb29sZWFuKTtcblx0XHRcdGlmICh2aXNpYmxlT3B0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGluY2x1ZGVkT3B0aW9ucyA9IHZpc2libGVPcHRpb25zLnNsaWNlKDAsIFZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuX01BWF9RVUVTVElPTk5BSVJFX09QVElPTlMpO1xuXHRcdFx0XHRjb25zdCBvbWl0dGVkT3B0aW9ucyA9IHZpc2libGVPcHRpb25zLmxlbmd0aCAtIGluY2x1ZGVkT3B0aW9ucy5sZW5ndGg7XG5cdFx0XHRcdGxldCBvcHRpb25zVGV4dCA9IGluY2x1ZGVkT3B0aW9ucy5qb2luKCc7ICcpO1xuXHRcdFx0XHRpZiAob21pdHRlZE9wdGlvbnMgPiAwKSB7XG5cdFx0XHRcdFx0b3B0aW9uc1RleHQgPSBsb2NhbGl6ZSgndm9pY2UucXVlc3Rpb25uYWlyZS5tb3JlT3B0aW9ucycsIFwiezB9OyB7MX0gbW9yZSBvcHRpb25zXCIsIG9wdGlvbnNUZXh0LCBvbWl0dGVkT3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHF1ZXN0aW9uLmFsbG93RnJlZWZvcm1JbnB1dCkge1xuXHRcdFx0XHRcdG9wdGlvbnNUZXh0ID0gbG9jYWxpemUoJ3ZvaWNlLnF1ZXN0aW9ubmFpcmUuY3VzdG9tT3B0aW9uJywgXCJ7MH07IGEgY3VzdG9tIHJlc3BvbnNlIGlzIGFsc28gYXZhaWxhYmxlXCIsIG9wdGlvbnNUZXh0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRxdWVzdGlvbkxpbmVzLnB1c2gobG9jYWxpemUoJ3ZvaWNlLnF1ZXN0aW9ubmFpcmUub3B0aW9ucycsIFwib3B0aW9uczogezB9XCIsIG9wdGlvbnNUZXh0KSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRxdWVzdGlvbkxpbmVzLnB1c2gobG9jYWxpemUoJ3ZvaWNlLnF1ZXN0aW9ubmFpcmUuZnJlZWZvcm0nLCBcInJlc3BvbnNlOiBlbnRlciBhIGZyZWUtZm9ybSBhbnN3ZXIgaW4gR2l0SHViIENvcGlsb3RcIikpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZW1haW5pbmdBZnRlckNhbmRpZGF0ZSA9IHF1ZXN0aW9ubmFpcmUucXVlc3Rpb25zLmxlbmd0aCAtIChpbmNsdWRlZFF1ZXN0aW9ucyArIDEpO1xuXHRcdFx0Y29uc3QgcmVzZXJ2ZWRTdWZmaXggPSByZW1haW5pbmdBZnRlckNhbmRpZGF0ZSA+IDBcblx0XHRcdFx0PyByZW1haW5pbmdBZnRlckNhbmRpZGF0ZSA9PT0gMVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ3ZvaWNlLnF1ZXN0aW9ubmFpcmUub25lT21pdHRlZCcsIFwiMSBtb3JlIHF1ZXN0aW9uIGlzIG9wZW4gaW4gR2l0SHViIENvcGlsb3QuXCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgndm9pY2UucXVlc3Rpb25uYWlyZS5tYW55T21pdHRlZCcsIFwiezB9IG1vcmUgcXVlc3Rpb25zIGFyZSBvcGVuIGluIEdpdEh1YiBDb3BpbG90LlwiLCByZW1haW5pbmdBZnRlckNhbmRpZGF0ZSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgndm9pY2UucXVlc3Rpb25uYWlyZS5vcGVuJywgXCJUaGUgcXVlc3Rpb25uYWlyZSBpcyBvcGVuIGluIEdpdEh1YiBDb3BpbG90LlwiKTtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IFsuLi5saW5lcywgLi4ucXVlc3Rpb25MaW5lcywgcmVzZXJ2ZWRTdWZmaXhdLmpvaW4oJ1xcbicpO1xuXHRcdFx0aWYgKGNhbmRpZGF0ZS5sZW5ndGggPiBWb2ljZVNlc3Npb25Db250cm9sbGVyLl9NQVhfQ09ORklSTUFUSU9OX05BUlJBVElPTl9DSEFSUykge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGxpbmVzLnB1c2goLi4ucXVlc3Rpb25MaW5lcyk7XG5cdFx0XHRpbmNsdWRlZFF1ZXN0aW9ucysrO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9taXR0ZWRRdWVzdGlvbnMgPSBxdWVzdGlvbm5haXJlLnF1ZXN0aW9ucy5sZW5ndGggLSBpbmNsdWRlZFF1ZXN0aW9ucztcblx0XHRpZiAob21pdHRlZFF1ZXN0aW9ucyA+IDApIHtcblx0XHRcdGxpbmVzLnB1c2gob21pdHRlZFF1ZXN0aW9ucyA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCd2b2ljZS5xdWVzdGlvbm5haXJlLm9uZU9taXR0ZWQnLCBcIjEgbW9yZSBxdWVzdGlvbiBpcyBvcGVuIGluIEdpdEh1YiBDb3BpbG90LlwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCd2b2ljZS5xdWVzdGlvbm5haXJlLm1hbnlPbWl0dGVkJywgXCJ7MH0gbW9yZSBxdWVzdGlvbnMgYXJlIG9wZW4gaW4gR2l0SHViIENvcGlsb3QuXCIsIG9taXR0ZWRRdWVzdGlvbnMpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGluZXMucHVzaChsb2NhbGl6ZSgndm9pY2UucXVlc3Rpb25uYWlyZS5vcGVuJywgXCJUaGUgcXVlc3Rpb25uYWlyZSBpcyBvcGVuIGluIEdpdEh1YiBDb3BpbG90LlwiKSk7XG5cdFx0fVxuXHRcdHJldHVybiBsaW5lcy5qb2luKCdcXG4nKSB8fCBmYWxsYmFjaztcblx0fVxuXG5cdHByaXZhdGUgX2Zvcm1hdENob2ljZUxhYmVscyhjaG9pY2VzOiByZWFkb25seSB7IGxhYmVsOiBzdHJpbmc7IGRlc2NyaXB0aW9uPzogc3RyaW5nIH1bXSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdmlzaWJsZUNob2ljZXMgPSBjaG9pY2VzLm1hcChjaG9pY2UgPT4ge1xuXHRcdFx0Y29uc3QgbGFiZWwgPSB0aGlzLl92aXNpYmxlQ29uZmlybWF0aW9uVGV4dChjaG9pY2UubGFiZWwsIDE2MCk7XG5cdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHRoaXMuX3Zpc2libGVDb25maXJtYXRpb25UZXh0KGNob2ljZS5kZXNjcmlwdGlvbiwgMTYwKTtcblx0XHRcdHJldHVybiBkZXNjcmlwdGlvbiA/IGxvY2FsaXplKCd2b2ljZS5jb25maXJtYXRpb24uY2hvaWNlRGVzY3JpcHRpb24nLCBcInswfSAtIHsxfVwiLCBsYWJlbCwgZGVzY3JpcHRpb24pIDogbGFiZWw7XG5cdFx0fSkuZmlsdGVyKEJvb2xlYW4pO1xuXHRcdGlmICh2aXNpYmxlQ2hvaWNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGluY2x1ZGVkQ2hvaWNlcyA9IHZpc2libGVDaG9pY2VzLnNsaWNlKDAsIFZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuX01BWF9RVUVTVElPTk5BSVJFX09QVElPTlMpO1xuXHRcdGNvbnN0IG9taXR0ZWRDaG9pY2VzID0gdmlzaWJsZUNob2ljZXMubGVuZ3RoIC0gaW5jbHVkZWRDaG9pY2VzLmxlbmd0aDtcblx0XHRjb25zdCB0ZXh0ID0gaW5jbHVkZWRDaG9pY2VzLmpvaW4oJzsgJyk7XG5cdFx0cmV0dXJuIG9taXR0ZWRDaG9pY2VzID4gMFxuXHRcdFx0PyBsb2NhbGl6ZSgndm9pY2UuY29uZmlybWF0aW9uLm1vcmVDaG9pY2VzJywgXCJ7MH07IHsxfSBtb3JlIGNob2ljZXNcIiwgdGV4dCwgb21pdHRlZENob2ljZXMpXG5cdFx0XHQ6IHRleHQ7XG5cdH1cblxuXHRwcml2YXRlIF9mb3JtYXRQbGFuTmFycmF0aW9uKHBsYW46IElDaGF0UGxhblJldmlldyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZmFsbGJhY2sgPSBsb2NhbGl6ZSgndm9pY2UucGxhbi5mYWxsYmFjaycsIFwiQSBwbGFuIGlzIG9wZW4gaW4gR2l0SHViIENvcGlsb3QgYW5kIG5lZWRzIHlvdXIgYXBwcm92YWwuXCIpO1xuXHRcdGNvbnN0IHRpdGxlID0gdGhpcy5fdmlzaWJsZUNvbmZpcm1hdGlvblRleHQocGxhbi50aXRsZSkgfHwgZmFsbGJhY2s7XG5cdFx0Y29uc3QgbGluZXMgPSBbbG9jYWxpemUoJ3ZvaWNlLnBsYW4udGl0bGUnLCBcInBsYW4gYXBwcm92YWw6IHswfVwiLCB0aXRsZSldO1xuXHRcdGNvbnN0IGNob2ljZXMgPSB0aGlzLl9mb3JtYXRDaG9pY2VMYWJlbHMocGxhbi5hY3Rpb25zKTtcblx0XHRpZiAoY2hvaWNlcykge1xuXHRcdFx0bGluZXMucHVzaChsb2NhbGl6ZSgndm9pY2UucGxhbi5jaG9pY2VzJywgXCJjaG9pY2VzOiB7MH1cIiwgY2hvaWNlcykpO1xuXHRcdH1cblx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCd2b2ljZS5wbGFuLm9wZW4nLCBcIlRoZSBwbGFuIGlzIG9wZW4gaW4gR2l0SHViIENvcGlsb3QuXCIpKTtcblx0XHRyZXR1cm4gdGhpcy5fYm91bmRlZENvbmZpcm1hdGlvbkxpbmVzKGxpbmVzLCBmYWxsYmFjayk7XG5cdH1cblxuXHRwcml2YXRlIF9mb3JtYXRFbGljaXRhdGlvbk5hcnJhdGlvbihlbGljaXRhdGlvbjogSUNoYXRFbGljaXRhdGlvblJlcXVlc3QpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGZhbGxiYWNrID0gbG9jYWxpemUoJ3ZvaWNlLmVsaWNpdGF0aW9uLmZhbGxiYWNrJywgXCJHaXRIdWIgQ29waWxvdCBuZWVkcyB5b3VyIGlucHV0IGluIHRoZSBvcGVuIHJlcXVlc3QuXCIpO1xuXHRcdGNvbnN0IHRpdGxlID0gdGhpcy5fdmlzaWJsZUNvbmZpcm1hdGlvblRleHQoZWxpY2l0YXRpb24udGl0bGUpO1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSB0aGlzLl92aXNpYmxlQ29uZmlybWF0aW9uVGV4dChlbGljaXRhdGlvbi5tZXNzYWdlKTtcblx0XHRjb25zdCBzdWJ0aXRsZSA9IHRoaXMuX3Zpc2libGVDb25maXJtYXRpb25UZXh0KGVsaWNpdGF0aW9uLnN1YnRpdGxlKTtcblx0XHRjb25zdCBsaW5lcyA9IFtsb2NhbGl6ZSgndm9pY2UuZWxpY2l0YXRpb24udGl0bGUnLCBcImlucHV0IHJlcXVlc3Q6IHswfVwiLCB0aXRsZSB8fCBtZXNzYWdlIHx8IGZhbGxiYWNrKV07XG5cdFx0aWYgKHN1YnRpdGxlICYmIHN1YnRpdGxlICE9PSB0aXRsZSkge1xuXHRcdFx0bGluZXMucHVzaChzdWJ0aXRsZSk7XG5cdFx0fVxuXHRcdGlmIChtZXNzYWdlICYmIG1lc3NhZ2UgIT09IHRpdGxlKSB7XG5cdFx0XHRsaW5lcy5wdXNoKG1lc3NhZ2UpO1xuXHRcdH1cblx0XHRjb25zdCBjaG9pY2VzID0gdGhpcy5fZm9ybWF0Q2hvaWNlTGFiZWxzKFtcblx0XHRcdHsgbGFiZWw6IGVsaWNpdGF0aW9uLmFjY2VwdEJ1dHRvbkxhYmVsIH0sXG5cdFx0XHQuLi4oZWxpY2l0YXRpb24ucmVqZWN0QnV0dG9uTGFiZWwgPyBbeyBsYWJlbDogZWxpY2l0YXRpb24ucmVqZWN0QnV0dG9uTGFiZWwgfV0gOiBbXSksXG5cdFx0XHQuLi4oZWxpY2l0YXRpb24ubW9yZUFjdGlvbnMgPz8gW10pLm1hcChhY3Rpb24gPT4gKHsgbGFiZWw6IGFjdGlvbi5sYWJlbCB9KSksXG5cdFx0XSk7XG5cdFx0aWYgKGNob2ljZXMpIHtcblx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ3ZvaWNlLmVsaWNpdGF0aW9uLmNob2ljZXMnLCBcImNob2ljZXM6IHswfVwiLCBjaG9pY2VzKSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9ib3VuZGVkQ29uZmlybWF0aW9uTGluZXMobGluZXMsIGZhbGxiYWNrKTtcblx0fVxuXG5cdHByaXZhdGUgX2Zvcm1hdENvbmZpcm1hdGlvbk5hcnJhdGlvbihjb25maXJtYXRpb246IElDaGF0Q29uZmlybWF0aW9uKTogc3RyaW5nIHtcblx0XHRjb25zdCBmYWxsYmFjayA9IGxvY2FsaXplKCd2b2ljZS5jb25maXJtYXRpb24uZmFsbGJhY2snLCBcIkdpdEh1YiBDb3BpbG90IG5lZWRzIHlvdXIgYXBwcm92YWwgdG8gY29udGludWUuXCIpO1xuXHRcdGNvbnN0IHRpdGxlID0gdGhpcy5fdmlzaWJsZUNvbmZpcm1hdGlvblRleHQoY29uZmlybWF0aW9uLnRpdGxlKTtcblx0XHRjb25zdCBtZXNzYWdlID0gdGhpcy5fdmlzaWJsZUNvbmZpcm1hdGlvblRleHQoY29uZmlybWF0aW9uLm1lc3NhZ2UpO1xuXHRcdGNvbnN0IGxpbmVzID0gW2xvY2FsaXplKCd2b2ljZS5jb25maXJtYXRpb24udGl0bGUnLCBcImNvbmZpcm1hdGlvbjogezB9XCIsIHRpdGxlIHx8IG1lc3NhZ2UgfHwgZmFsbGJhY2spXTtcblx0XHRpZiAobWVzc2FnZSAmJiBtZXNzYWdlICE9PSB0aXRsZSkge1xuXHRcdFx0bGluZXMucHVzaChtZXNzYWdlKTtcblx0XHR9XG5cdFx0Y29uc3QgY2hvaWNlcyA9IHRoaXMuX2Zvcm1hdENob2ljZUxhYmVscygoY29uZmlybWF0aW9uLmJ1dHRvbnMgPz8gW10pLm1hcChsYWJlbCA9PiAoeyBsYWJlbCB9KSkpO1xuXHRcdGlmIChjaG9pY2VzKSB7XG5cdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCd2b2ljZS5jb25maXJtYXRpb24uY2hvaWNlcycsIFwiY2hvaWNlczogezB9XCIsIGNob2ljZXMpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2JvdW5kZWRDb25maXJtYXRpb25MaW5lcyhsaW5lcywgZmFsbGJhY2spO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9ybWF0VG9vbE5hcnJhdGlvbih0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbik6IHN0cmluZyB7XG5cdFx0Y29uc3QgZmFsbGJhY2sgPSBsb2NhbGl6ZSgndm9pY2UudG9vbENvbmZpcm1hdGlvbi5mYWxsYmFjaycsIFwiR2l0SHViIENvcGlsb3QgbmVlZHMgeW91ciBhcHByb3ZhbCB0byBjb250aW51ZS5cIik7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRpZiAoc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiAmJiBzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yUG9zdEFwcHJvdmFsKSB7XG5cdFx0XHRyZXR1cm4gZmFsbGJhY2s7XG5cdFx0fVxuXHRcdGNvbnN0IG1lc3NhZ2VzID0gc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXM7XG5cdFx0Y29uc3QgdGl0bGUgPSB0aGlzLl92aXNpYmxlQ29uZmlybWF0aW9uVGV4dChtZXNzYWdlcz8udGl0bGUpIHx8IHRoaXMuX3Zpc2libGVDb25maXJtYXRpb25UZXh0KHRvb2xJbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlKTtcblx0XHRjb25zdCBtZXNzYWdlID0gdGhpcy5fdmlzaWJsZUNvbmZpcm1hdGlvblRleHQobWVzc2FnZXM/Lm1lc3NhZ2UpO1xuXHRcdGNvbnN0IGxpbmVzID0gW2xvY2FsaXplKCd2b2ljZS50b29sQ29uZmlybWF0aW9uLnRpdGxlJywgXCJ0b29sIGFwcHJvdmFsOiB7MH1cIiwgdGl0bGUgfHwgbWVzc2FnZSB8fCBmYWxsYmFjayldO1xuXHRcdGlmIChtZXNzYWdlICYmIG1lc3NhZ2UgIT09IHRpdGxlKSB7XG5cdFx0XHRsaW5lcy5wdXNoKG1lc3NhZ2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYm91bmRlZENvbmZpcm1hdGlvbkxpbmVzKGxpbmVzLCBmYWxsYmFjayk7XG5cdH1cblxuXHRwcml2YXRlIF9mb3JtYXRUb29sTmFycmF0aW9uRmFsbGJhY2soKTogc3RyaW5nIHtcblx0XHRjb25zdCBmYWxsYmFjayA9IGxvY2FsaXplKCd2b2ljZS50b29sQ29uZmlybWF0aW9uLmZhbGxiYWNrJywgXCJHaXRIdWIgQ29waWxvdCBuZWVkcyB5b3VyIGFwcHJvdmFsIHRvIGNvbnRpbnVlLlwiKTtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3ZvaWNlLnRvb2xDb25maXJtYXRpb24udGl0bGUnLCBcInRvb2wgYXBwcm92YWw6IHswfVwiLCBmYWxsYmFjayk7XG5cdH1cblxuXHRwcml2YXRlIF9mb3JtYXRUb29sQXV0aGVudGljYXRpb25OYXJyYXRpb24odG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHN0YXRlID0gdG9vbEludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JBdXRoZW50aWNhdGlvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2VydmVyTmFtZSA9IHRoaXMuX3Zpc2libGVDb25maXJtYXRpb25UZXh0KHN0YXRlLnNlcnZlci5uYW1lKTtcblx0XHRjb25zdCBmYWxsYmFjayA9IGxvY2FsaXplKCd2b2ljZS5hdXRoZW50aWNhdGlvbi5mYWxsYmFjaycsIFwiR2l0SHViIENvcGlsb3QgbmVlZHMgYXV0aGVudGljYXRpb24gdG8gY29udGludWUuXCIpO1xuXHRcdHJldHVybiB0aGlzLl9ib3VuZGVkQ29uZmlybWF0aW9uTGluZXMoW1xuXHRcdFx0bG9jYWxpemUoJ3ZvaWNlLmF1dGhlbnRpY2F0aW9uLnRpdGxlJywgXCJhdXRoZW50aWNhdGlvbiByZXF1ZXN0OiBNQ1AgYXV0aGVudGljYXRpb24gcmVxdWlyZWRcIiksXG5cdFx0XHRzZXJ2ZXJOYW1lXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3ZvaWNlLmF1dGhlbnRpY2F0aW9uLm1lc3NhZ2UnLCBcIlRoZSBNQ1Agc2VydmVyIHswfSByZXF1aXJlcyBhdXRoZW50aWNhdGlvbiB0byBjb250aW51ZSB0aGlzIHRvb2wgY2FsbC5cIiwgc2VydmVyTmFtZSlcblx0XHRcdFx0OiBmYWxsYmFjayxcblx0XHRcdGxvY2FsaXplKCd2b2ljZS5hdXRoZW50aWNhdGlvbi5jaG9pY2VzJywgXCJjaG9pY2VzOiBBdXRoZW50aWNhdGU7IENhbmNlbFwiKSxcblx0XHRdLCBmYWxsYmFjayk7XG5cdH1cblxuXHRwcml2YXRlIF9zZWxlY3RQZW5kaW5nUGFydChtb2RlbDogSUNoYXRNb2RlbCB8IHVuZGVmaW5lZCB8IG51bGwpOiB7IHJlcXVlc3RJZDogc3RyaW5nOyB0eXBlOiBWb2ljZUNvbmZpcm1hdGlvblR5cGU7IHBhcnQ6IElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbGFzdFJlcXVlc3QgPSBtb2RlbD8uZ2V0UmVxdWVzdHMoKS5hdCgtMSk7XG5cdFx0Y29uc3QgcGFydHMgPSBsYXN0UmVxdWVzdD8ucmVzcG9uc2U/LnJlc3BvbnNlLnZhbHVlO1xuXHRcdGlmICghbGFzdFJlcXVlc3QgfHwgIXBhcnRzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBwYXJ0cy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IHBhcnQgPSBwYXJ0c1tpbmRleF07XG5cdFx0XHRjb25zdCB0eXBlID0gZ2V0Vm9pY2VDb25maXJtYXRpb25UeXBlKFtwYXJ0XSk7XG5cdFx0XHRpZiAodHlwZSAmJiB0aGlzLl9pc09wZW5QZW5kaW5nUGFydChwYXJ0KSkge1xuXHRcdFx0XHRpZiAodHlwZSA9PT0gJ3F1ZXN0aW9ubmFpcmUnICYmIGlzVm9pY2VRdWVzdGlvbm5haXJlSW52b2NhdGlvbihwYXJ0KSkge1xuXHRcdFx0XHRcdGNvbnN0IGNhcm91c2VsID0gcGFydHMuc2xpY2UoaW5kZXggKyAxKS5maW5kKGNhbmRpZGF0ZSA9PlxuXHRcdFx0XHRcdFx0Y2FuZGlkYXRlLmtpbmQgPT09ICdxdWVzdGlvbkNhcm91c2VsJ1xuXHRcdFx0XHRcdFx0JiYgY2FuZGlkYXRlLnJlc29sdmVJZCA9PT0gcGFydC50b29sQ2FsbElkXG5cdFx0XHRcdFx0XHQmJiB0aGlzLl9pc09wZW5QZW5kaW5nUGFydChjYW5kaWRhdGUpKTtcblx0XHRcdFx0XHRpZiAoY2Fyb3VzZWwpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IHJlcXVlc3RJZDogbGFzdFJlcXVlc3QuaWQsIHR5cGUsIHBhcnQ6IGNhcm91c2VsIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IHJlcXVlc3RJZDogbGFzdFJlcXVlc3QuaWQsIHR5cGUsIHBhcnQgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2lzT3BlblBlbmRpbmdQYXJ0KHBhcnQ6IElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQpOiBib29sZWFuIHtcblx0XHRpZiAocGFydC5raW5kID09PSAncXVlc3Rpb25DYXJvdXNlbCcpIHtcblx0XHRcdHJldHVybiAhcGFydC5pc1VzZWQgJiYgIXBhcnQuYW5zd2VyZWRFeHRlcm5hbGx5O1xuXHRcdH1cblx0XHRpZiAocGFydC5raW5kID09PSAnZWxpY2l0YXRpb24yJykge1xuXHRcdFx0cmV0dXJuIHBhcnQuc3RhdGUuZ2V0KCkgPT09ICdwZW5kaW5nJztcblx0XHR9XG5cdFx0aWYgKHBhcnQua2luZCA9PT0gJ3BsYW5SZXZpZXcnIHx8IHBhcnQua2luZCA9PT0gJ2NvbmZpcm1hdGlvbicpIHtcblx0XHRcdHJldHVybiAhcGFydC5pc1VzZWQ7XG5cdFx0fVxuXHRcdGlmIChwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicpIHtcblx0XHRcdGNvbnN0IHN0YXRlID0gcGFydC5zdGF0ZS5nZXQoKTtcblx0XHRcdHJldHVybiBzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uXG5cdFx0XHRcdHx8IHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JQb3N0QXBwcm92YWxcblx0XHRcdFx0fHwgc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckF1dGhlbnRpY2F0aW9uO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRQZW5kaW5nQ29uZmlybWF0aW9uSW5mbyhtb2RlbDogSUNoYXRNb2RlbCk6IHsgdHlwZTogVm9pY2VDb25maXJtYXRpb25UeXBlOyBkZXRhaWw/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbGFzdFJlc3BvbnNlID0gbW9kZWwuZ2V0UmVxdWVzdHMoKS5hdCgtMSk/LnJlc3BvbnNlO1xuXHRcdGlmICghbGFzdFJlc3BvbnNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcnRzID0gbGFzdFJlc3BvbnNlLnJlc3BvbnNlLnZhbHVlO1xuXHRcdGNvbnN0IHNlbGVjdGVkID0gdGhpcy5fc2VsZWN0UGVuZGluZ1BhcnQobW9kZWwpO1xuXHRcdGlmICghc2VsZWN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHsgdHlwZSwgcGFydCB9ID0gc2VsZWN0ZWQ7XG5cblx0XHRjb25zdCBhc2tRdWVzdGlvbnNDYWxsSWRzID0gbmV3IFNldChwYXJ0c1xuXHRcdFx0LmZpbHRlcihpc1ZvaWNlUXVlc3Rpb25uYWlyZUludm9jYXRpb24pXG5cdFx0XHQubWFwKHBhcnQgPT4gcGFydC50b29sQ2FsbElkKSk7XG5cdFx0aWYgKHR5cGUgPT09ICdxdWVzdGlvbm5haXJlJyAmJiBwYXJ0Py5raW5kID09PSAncXVlc3Rpb25DYXJvdXNlbCcpIHtcblx0XHRcdGNvbnN0IGluY2x1ZGVEZXRhaWxzID0gIXBhcnQucmVzb2x2ZUlkIHx8ICFhc2tRdWVzdGlvbnNDYWxsSWRzLmhhcyhwYXJ0LnJlc29sdmVJZCk7XG5cdFx0XHRyZXR1cm4geyB0eXBlLCBkZXRhaWw6IHRoaXMuX2Zvcm1hdFF1ZXN0aW9ubmFpcmVOYXJyYXRpb24odGhpcy5fdmlzaWJsZVF1ZXN0aW9ubmFpcmVGcm9tQ2Fyb3VzZWwocGFydCwgaW5jbHVkZURldGFpbHMpKSB9O1xuXHRcdH1cblx0XHRpZiAodHlwZSA9PT0gJ3F1ZXN0aW9ubmFpcmUnICYmIHBhcnQ/LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicpIHtcblx0XHRcdGNvbnN0IHF1ZXN0aW9ubmFpcmUgPSB0aGlzLl92aXNpYmxlUXVlc3Rpb25uYWlyZUZyb21Ub29sSW52b2NhdGlvbihwYXJ0KTtcblx0XHRcdGlmIChxdWVzdGlvbm5haXJlKSB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGUsIGRldGFpbDogdGhpcy5fZm9ybWF0UXVlc3Rpb25uYWlyZU5hcnJhdGlvbihxdWVzdGlvbm5haXJlKSB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodHlwZSA9PT0gJ2VsaWNpdGF0aW9uJyAmJiBwYXJ0Py5raW5kID09PSAnZWxpY2l0YXRpb24yJykge1xuXHRcdFx0cmV0dXJuIHsgdHlwZSwgZGV0YWlsOiB0aGlzLl9mb3JtYXRFbGljaXRhdGlvbk5hcnJhdGlvbihwYXJ0KSB9O1xuXHRcdH1cblx0XHRpZiAodHlwZSA9PT0gJ3BsYW4nICYmIHBhcnQ/LmtpbmQgPT09ICdwbGFuUmV2aWV3Jykge1xuXHRcdFx0cmV0dXJuIHsgdHlwZSwgZGV0YWlsOiB0aGlzLl9mb3JtYXRQbGFuTmFycmF0aW9uKHBhcnQpIH07XG5cdFx0fVxuXHRcdGlmICh0eXBlID09PSAndG9vbCcgJiYgcGFydD8ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0cmV0dXJuIHsgdHlwZSwgZGV0YWlsOiB0aGlzLl9mb3JtYXRUb29sTmFycmF0aW9uKHBhcnQpIH07XG5cdFx0fVxuXHRcdGlmICh0eXBlID09PSAnZ2VuZXJpYycgJiYgcGFydD8ua2luZCA9PT0gJ2NvbmZpcm1hdGlvbicpIHtcblx0XHRcdHJldHVybiB7IHR5cGUsIGRldGFpbDogdGhpcy5fZm9ybWF0Q29uZmlybWF0aW9uTmFycmF0aW9uKHBhcnQpIH07XG5cdFx0fVxuXHRcdGlmICh0eXBlID09PSAnZ2VuZXJpYycgJiYgcGFydD8ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0cmV0dXJuIHsgdHlwZSwgZGV0YWlsOiB0aGlzLl9mb3JtYXRUb29sQXV0aGVudGljYXRpb25OYXJyYXRpb24ocGFydCkgfTtcblx0XHR9XG5cdFx0aWYgKHR5cGUgPT09ICdxdWVzdGlvbm5haXJlJykge1xuXHRcdFx0cmV0dXJuIHsgdHlwZSB9O1xuXHRcdH1cblx0XHRyZXR1cm4geyB0eXBlLCBkZXRhaWw6IHRoaXMuX2Zvcm1hdFRvb2xOYXJyYXRpb25GYWxsYmFjaygpIH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRBZ2VudFN0YXRlSW5mbyhtb2RlbDogSUNoYXRNb2RlbCB8IHVuZGVmaW5lZCB8IG51bGwpOiBJVm9pY2VBZ2VudFN0YXRlSW5mbyB7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIHsgc3RhdGU6ICd1bmtub3duJyB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhc3RSZXF1ZXN0ID0gbW9kZWwuZ2V0UmVxdWVzdHMoKS5hdCgtMSk7XG5cblx0XHQvLyBEbyBub3QgbmFycmF0ZSBwYXJ0aWFsIHdvcmsgYWZ0ZXIgdGhlIHVzZXIgY2FuY2VscyBhIHR1cm4uXG5cdFx0aWYgKGxhc3RSZXF1ZXN0Py5yZXNwb25zZT8uaXNDYW5jZWxlZCkge1xuXHRcdFx0cmV0dXJuIHsgc3RhdGU6ICdpZGxlJyB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHBlbmRpbmdDb25maXJtYXRpb24gPSBsYXN0UmVxdWVzdD8ucmVzcG9uc2U/LmlzUGVuZGluZ0NvbmZpcm1hdGlvbi5nZXQoKTtcblx0XHRjb25zdCBjb25maXJtYXRpb24gPSB0aGlzLl9nZXRQZW5kaW5nQ29uZmlybWF0aW9uSW5mbyhtb2RlbCk7XG5cdFx0aWYgKHBlbmRpbmdDb25maXJtYXRpb24gfHwgY29uZmlybWF0aW9uKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzdGF0ZTogJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdC4uLihjb25maXJtYXRpb24/LmRldGFpbCA/IHsgZGV0YWlsOiBjb25maXJtYXRpb24uZGV0YWlsIH0gOiAhY29uZmlybWF0aW9uID8geyBkZXRhaWw6IHRoaXMuX2Zvcm1hdFRvb2xOYXJyYXRpb25GYWxsYmFjaygpIH0gOiB7fSksXG5cdFx0XHRcdGNvbmZpcm1hdGlvbl90eXBlOiBjb25maXJtYXRpb24/LnR5cGUgPz8gJ2dlbmVyaWMnLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBpbmNvbXBsZXRlID0gbGFzdFJlcXVlc3Q/LnJlc3BvbnNlPy5pc0luY29tcGxldGUuZ2V0KCkgPz8gZmFsc2U7XG5cdFx0aWYgKGluY29tcGxldGUpIHtcblx0XHRcdHJldHVybiB7IHN0YXRlOiAndGhpbmtpbmcnIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzcG9uc2VUZXh0ID0gW1xuXHRcdFx0bGFzdFJlcXVlc3Q/LnJlc3BvbnNlPy5yZXNwb25zZS5nZXRNYXJrZG93bigpLnRyaW0oKSxcblx0XHRcdGxhc3RSZXF1ZXN0Py5yZXNwb25zZT8ucmVzdWx0Py5lcnJvckRldGFpbHM/Lm1lc3NhZ2UudHJpbSgpLFxuXHRcdF0uZmlsdGVyKHZhbHVlID0+ICEhdmFsdWUpLmpvaW4oJ1xcblxcbicpO1xuXHRcdHJldHVybiB7IHN0YXRlOiAnaWRsZScsIC4uLihyZXNwb25zZVRleHQgPyB7IGxhc3RfcmVzcG9uc2Vfc3VtbWFyeTogcmVzcG9uc2VUZXh0IH0gOiB7fSkgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEZXNjcmliZSB3aGF0IGEgc2Vzc2lvbiBpcyB3YWl0aW5nIG9uLCBzdHJ1Y3R1cmFsbHkuXG5cdCAqXG5cdCAqIGBfZ2V0QWdlbnRTdGF0ZUluZm9gIGZsYXR0ZW5zIHRoZSBzYW1lIHN0YXRlIGludG8gYGFnZW50X3N0YXRlX2RldGFpbGAsXG5cdCAqIHdoaWNoIGlzIGZpbmUgdG8gKnNheSogYnV0IGNhbm5vdCBiZSAqYWN0ZWQgb24qOiBhIGZvcm0gYmVjb21lc1xuXHQgKiBgcXVlc3Rpb25zOiA8dGl0bGVzPmAsIGxvc2luZyB0aGUgb3B0aW9ucywgdGhlaXIgdmFsdWVzIGFuZCB0aGUgaWRzLiBUaGlzXG5cdCAqIHJldHVybnMgd2hhdCB0aGUgYmFja2VuZCBuZWVkcyB0byByb3V0ZSBhbiBhbnN3ZXIgYmFjayB0byB0aGUgZXhhY3QgcGFydC5cblx0ICpcblx0ICogVXNlcyB0aGUgc2FtZSB0eXBlZCBwZW5kaW5nIHNlbGVjdGlvbiBhcyBuYXJyYXRpb24sIHNvIHRoZSBiYWNrZW5kIG5ldmVyXG5cdCAqIHJlY2VpdmVzIGFuIGlkIGZvciBhIGRpZmZlcmVudCBhY3Rpb24gdGhhbiB0aGUgb25lIHRoZSB1c2VyIGhlYXJkLlxuXHQgKi9cblx0cHJpdmF0ZSBfYnVpbGRQZW5kaW5nUGF5bG9hZChtb2RlbDogSUNoYXRNb2RlbCB8IHVuZGVmaW5lZCB8IG51bGwpOiBJVm9pY2VTZXNzaW9uUGVuZGluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2VsZWN0ZWQgPSB0aGlzLl9zZWxlY3RQZW5kaW5nUGFydChtb2RlbCk7XG5cdFx0aWYgKCFzZWxlY3RlZCB8fCAoc2VsZWN0ZWQudHlwZSAhPT0gJ3F1ZXN0aW9ubmFpcmUnICYmIHNlbGVjdGVkLnR5cGUgIT09ICdwbGFuJyAmJiBzZWxlY3RlZC50eXBlICE9PSAndG9vbCcpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB7IHJlcXVlc3RJZCwgdHlwZSwgcGFydCB9ID0gc2VsZWN0ZWQ7XG5cdFx0Y29uc3Qgcm91dGluZyA9ICgpID0+ICh7IHBlbmRpbmdfaWQ6IGRlcml2ZVBlbmRpbmdJZChyZXF1ZXN0SWQsIHBhcnQpLCByZXF1ZXN0X2lkOiByZXF1ZXN0SWQgfSk7XG5cdFx0aWYgKHR5cGUgPT09ICdxdWVzdGlvbm5haXJlJyAmJiBwYXJ0LmtpbmQgPT09ICdxdWVzdGlvbkNhcm91c2VsJykge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBwYXJ0IGFzIElDaGF0UXVlc3Rpb25DYXJvdXNlbDtcblx0XHRcdGlmIChjYXJvdXNlbC5hbnN3ZXJlZEV4dGVybmFsbHkgfHwgY2Fyb3VzZWwucXVlc3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ3F1ZXN0aW9ucycsXG5cdFx0XHRcdC4uLnJvdXRpbmcoKSxcblx0XHRcdFx0YWxsb3dfc2tpcDogY2Fyb3VzZWwuYWxsb3dTa2lwID09PSB0cnVlLFxuXHRcdFx0XHQuLi4oY2Fyb3VzZWwubWVzc2FnZSA/IHsgbWVzc2FnZTogdGhpcy5fcGxhaW5UZXh0KGNhcm91c2VsLm1lc3NhZ2UpIH0gOiB7fSksXG5cdFx0XHRcdHF1ZXN0aW9uczogY2Fyb3VzZWwucXVlc3Rpb25zLm1hcCgocXVlc3Rpb24pOiBJVm9pY2VQZW5kaW5nUXVlc3Rpb24gPT4gKHtcblx0XHRcdFx0XHRpZDogcXVlc3Rpb24uaWQsXG5cdFx0XHRcdFx0dHlwZTogcXVlc3Rpb24udHlwZSxcblx0XHRcdFx0XHR0aXRsZTogdGhpcy5fcGxhaW5UZXh0KGdldERpc3BsYXllZFF1ZXN0aW9uVGV4dChxdWVzdGlvbikpLFxuXHRcdFx0XHRcdGFsbG93X2ZyZWVmb3JtOiBxdWVzdGlvbi5hbGxvd0ZyZWVmb3JtSW5wdXQgIT09IGZhbHNlLFxuXHRcdFx0XHRcdG9wdGlvbnM6IGdldE9wdGlvbnNXaXRoRGVmYXVsdHNGaXJzdChxdWVzdGlvbikubWFwKCh7IG9wdGlvbiB9KSA9PiAoe1xuXHRcdFx0XHRcdFx0bGFiZWw6IG9wdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRcdHZhbHVlOiBvcHRpb24udmFsdWUsXG5cdFx0XHRcdFx0fSkpLFxuXHRcdFx0XHR9KSksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRpZiAodHlwZSA9PT0gJ3BsYW4nICYmIHBhcnQua2luZCA9PT0gJ3BsYW5SZXZpZXcnKSB7XG5cdFx0XHRyZXR1cm4geyB0eXBlOiAnYXBwcm92YWwnLCAuLi5yb3V0aW5nKCksIG1lc3NhZ2U6IHRoaXMuX2Zvcm1hdFBsYW5OYXJyYXRpb24ocGFydCkgfTtcblx0XHR9XG5cdFx0aWYgKHR5cGUgPT09ICd0b29sJyAmJiBwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicpIHtcblx0XHRcdHJldHVybiB7IHR5cGU6ICdhcHByb3ZhbCcsIC4uLnJvdXRpbmcoKSwgbWVzc2FnZTogdGhpcy5fZm9ybWF0VG9vbE5hcnJhdGlvbihwYXJ0KSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9wbGFpblRleHQodmFsdWU6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHZhbHVlIDogdmFsdWUudmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9jbGFzc2lmeVBlbmRpbmdUeXBlKHJlc3BvbnNlOiB7IHJlc3BvbnNlOiB7IHZhbHVlOiByZWFkb25seSB7IGtpbmQ6IHN0cmluZyB9W10gfSB9KTogJ2FwcHJvdmFsJyB8ICdpbnB1dCcge1xuXHRcdC8vIFJldHVybiB0aGUgdHlwZSBvZiB0aGUgTEFTVCBwZW5kaW5nIHBhcnQgKG1vc3QgcmVjZW50bHkgYWRkZWQpXG5cdFx0bGV0IHJlc3VsdDogJ2FwcHJvdmFsJyB8ICdpbnB1dCcgPSAnaW5wdXQnO1xuXHRcdGZvciAoY29uc3QgcGFydCBvZiByZXNwb25zZS5yZXNwb25zZS52YWx1ZSkge1xuXHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gcGFydCBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uO1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IGludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uIHx8XG5cdFx0XHRcdFx0c3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvclBvc3RBcHByb3ZhbCkge1xuXHRcdFx0XHRcdHJlc3VsdCA9ICdhcHByb3ZhbCc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICdjb25maXJtYXRpb24nICYmICEocGFydCBhcyB7IGlzVXNlZD86IGJvb2xlYW4gfSkuaXNVc2VkKSB7XG5cdFx0XHRcdHJlc3VsdCA9ICdhcHByb3ZhbCc7XG5cdFx0XHR9XG5cdFx0XHRpZiAocGFydC5raW5kID09PSAncXVlc3Rpb25DYXJvdXNlbCcgJiYgIShwYXJ0IGFzIHsgaXNVc2VkPzogYm9vbGVhbiB9KS5pc1VzZWQpIHtcblx0XHRcdFx0cmVzdWx0ID0gJ2lucHV0Jztcblx0XHRcdH1cblx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICdwbGFuUmV2aWV3JyAmJiAhKHBhcnQgYXMgeyBpc1VzZWQ/OiBib29sZWFuIH0pLmlzVXNlZCkge1xuXHRcdFx0XHRyZXN1bHQgPSAnaW5wdXQnO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ2VsaWNpdGF0aW9uMicpIHtcblx0XHRcdFx0cmVzdWx0ID0gJ2lucHV0Jztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2dldENvbmZpcm1hdGlvbkRlc2NyaXB0aW9uKHJlc3BvbnNlOiB7IHJlc3BvbnNlOiB7IHZhbHVlOiByZWFkb25seSB7IGtpbmQ6IHN0cmluZyB9W10gfSB9KTogc3RyaW5nIHtcblx0XHQvLyBSZXR1cm4gdGhlIGRlc2NyaXB0aW9uIG9mIHRoZSBMQVNUIHBlbmRpbmcgcGFydCAobW9zdCByZWNlbnRseSBhZGRlZClcblx0XHRsZXQgZGVzYyA9ICcnO1xuXHRcdGZvciAoY29uc3QgcGFydCBvZiByZXNwb25zZS5yZXNwb25zZS52YWx1ZSkge1xuXHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gcGFydCBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uO1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IGludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGFyYW1zID0gc3RhdGUucGFyYW1ldGVycyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBjb21tYW5kID0gcGFyYW1zPy5bJ2NvbW1hbmQnXSA/PyBwYXJhbXM/LlsnaW5wdXQnXTtcblx0XHRcdFx0XHRjb25zdCBleHBsYW5hdGlvbiA9IHBhcmFtcz8uWydleHBsYW5hdGlvbiddID8/IHBhcmFtcz8uWydnb2FsJ107XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBjb21tYW5kID09PSAnc3RyaW5nJyAmJiBjb21tYW5kKSB7XG5cdFx0XHRcdFx0XHRkZXNjID0gdHlwZW9mIGV4cGxhbmF0aW9uID09PSAnc3RyaW5nJyA/IGAke2NvbW1hbmR9IFx1MjAxNCAke2V4cGxhbmF0aW9ufWAgOiBjb21tYW5kO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChwYXJ0LmtpbmQgPT09ICdxdWVzdGlvbkNhcm91c2VsJyAmJiAhKHBhcnQgYXMgeyBpc1VzZWQ/OiBib29sZWFuIH0pLmlzVXNlZCkge1xuXHRcdFx0XHRjb25zdCBjYXJvdXNlbCA9IHBhcnQgYXMgeyBxdWVzdGlvbnM/OiB7IHRpdGxlPzogc3RyaW5nIH1bXTsgbWVzc2FnZT86IHN0cmluZyB8IHsgdmFsdWU6IHN0cmluZyB9IH07XG5cdFx0XHRcdGNvbnN0IHRpdGxlcyA9IChjYXJvdXNlbC5xdWVzdGlvbnMgPz8gW10pLm1hcChxID0+IHEudGl0bGUpLmZpbHRlcihCb29sZWFuKTtcblx0XHRcdFx0aWYgKHRpdGxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0ZGVzYyA9IHRpdGxlcy5qb2luKCcsICcpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IG1zZyA9IGNhcm91c2VsLm1lc3NhZ2U7XG5cdFx0XHRcdFx0ZGVzYyA9IG1zZyA/ICh0eXBlb2YgbXNnID09PSAnc3RyaW5nJyA/IG1zZyA6IG1zZy52YWx1ZSkgOiAnYXNraW5nIGNsYXJpZnlpbmcgcXVlc3Rpb25zJztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChwYXJ0LmtpbmQgPT09ICdlbGljaXRhdGlvbjInKSB7XG5cdFx0XHRcdGNvbnN0IGVsaWNpdGF0aW9uID0gcGFydCBhcyB1bmtub3duIGFzIHsgc3RhdGU6IElPYnNlcnZhYmxlPHN0cmluZz47IHRpdGxlPzogc3RyaW5nIHwgeyB2YWx1ZTogc3RyaW5nIH0gfTtcblx0XHRcdFx0aWYgKGVsaWNpdGF0aW9uLnN0YXRlLmdldCgpID09PSAncGVuZGluZycpIHtcblx0XHRcdFx0XHRjb25zdCB0aXRsZSA9IGVsaWNpdGF0aW9uLnRpdGxlO1xuXHRcdFx0XHRcdGRlc2MgPSB0aXRsZSA/ICh0eXBlb2YgdGl0bGUgPT09ICdzdHJpbmcnID8gdGl0bGUgOiB0aXRsZS52YWx1ZSkgOiAnbmVlZHMgaW5wdXQnO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHBhcnQua2luZCA9PT0gJ3BsYW5SZXZpZXcnICYmICEocGFydCBhcyB7IGlzVXNlZD86IGJvb2xlYW4gfSkuaXNVc2VkKSB7XG5cdFx0XHRcdGRlc2MgPSAncmV2aWV3IHRoZSBwbGFuIHRvIGNvbnRpbnVlJztcblx0XHRcdH0gZWxzZSBpZiAocGFydC5raW5kID09PSAnY29uZmlybWF0aW9uJyAmJiAhKHBhcnQgYXMgeyBpc1VzZWQ/OiBib29sZWFuIH0pLmlzVXNlZCkge1xuXHRcdFx0XHRkZXNjID0gKHBhcnQgYXMgeyB0aXRsZT86IHN0cmluZyB9KS50aXRsZSA/PyAnbmVlZHMgYXBwcm92YWwnO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZGVzYztcblx0fVxuXG5cdHByaXZhdGUgX2F1dG9BcHByb3ZlQ2hlY2soKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2F1dG9BcHByb3ZlZFNlc3Npb25zLnNpemUgPT09IDApIHsgcmV0dXJuOyB9XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnNlc3Npb25zLmZpbHRlcihzID0+ICFzLmlzQXJjaGl2ZWQoKSk7XG5cdFx0Zm9yIChjb25zdCBzIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2F1dG9BcHByb3ZlZFNlc3Npb25zLmhhcyhzLnJlc291cmNlLnRvU3RyaW5nKCkpKSB7IGNvbnRpbnVlOyB9XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihzLnJlc291cmNlKTtcblx0XHRcdGlmICghbW9kZWwpIHsgY29udGludWU7IH1cblx0XHRcdHRoaXMuX2F1dG9BcHByb3ZlUGVuZGluZ1Rvb2xzKG1vZGVsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hdXRvQXBwcm92ZVBlbmRpbmdUb29scyhtb2RlbDogSUNoYXRNb2RlbCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcmVxdWVzdCBvZiBtb2RlbC5nZXRSZXF1ZXN0cygpKSB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IHJlcXVlc3QucmVzcG9uc2U7XG5cdFx0XHRpZiAoIXJlc3BvbnNlPy5pc1BlbmRpbmdDb25maXJtYXRpb24uZ2V0KCkgfHwgZ2V0Vm9pY2VDb25maXJtYXRpb25UeXBlKHJlc3BvbnNlLnJlc3BvbnNlLnZhbHVlKSAhPT0gJ3Rvb2wnKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHJlc3BvbnNlLnJlc3BvbnNlLnZhbHVlKSB7XG5cdFx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicpIHtcblx0XHRcdFx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKHBhcnQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gTWFjaGluZSBJRCAtLS1cblxuXHRwcml2YXRlIF9nZXRNYWNoaW5lSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlIGFzIHsgbWFjaGluZUlkPzogc3RyaW5nIH0pLm1hY2hpbmVJZCA/PyAndW5rbm93bic7XG5cdH1cblxuXHQvLyAtLS0gRmVlZGJhY2sgLS0tXG5cblx0YXN5bmMgc3VibWl0RmVlZGJhY2soZmVlZGJhY2tUZXh0OiBzdHJpbmcpOiBQcm9taXNlPHsgb2s6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+IHtcblx0XHRsZXQgdXNlcklkID0gdGhpcy5fdXNlckxvZ2luO1xuXHRcdGlmICghdXNlcklkKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKCdnaXRodWInKTtcblx0XHRcdFx0dXNlcklkID0gc2Vzc2lvbnNbMF0/LmFjY291bnQubGFiZWwgPz8gJ3Vua25vd24nO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHVzZXJJZCA9ICd1bmtub3duJztcblx0XHRcdH1cblx0XHR9XG5cdFx0bGV0IHRyYW5zY3JpcHRIaXN0b3J5OiBJVm9pY2VGZWVkYmFja1RyYW5zY3JpcHRUdXJuW10gPSBbXTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdHVybnMgPSBhd2FpdCB0aGlzLnZvaWNlVHJhbnNjcmlwdFN0b3JlLmxvYWRUdXJucyh1c2VySWQpO1xuXHRcdFx0dHJhbnNjcmlwdEhpc3RvcnkgPSB0dXJucy5tYXAodCA9PiAoe1xuXHRcdFx0XHRyb2xlOiB0LnJvbGUsXG5cdFx0XHRcdHRleHQ6IHQudGV4dCxcblx0XHRcdFx0dGltZXN0YW1wOiB0LnRpbWVzdGFtcCxcblx0XHRcdH0pKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbdm9pY2VdIGZhaWxlZCB0byBsb2FkIHRyYW5zY3JpcHQgaGlzdG9yeSBmb3IgZmVlZGJhY2snLCBlcnIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25zID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9ucy5maWx0ZXIocyA9PiAhcy5pc0FyY2hpdmVkKCkpO1xuXHRcdGNvbnN0IGNsaWVudFNlc3Npb25TdGF0ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7XG5cdFx0XHR2b2ljZVN0YXRlOiB0aGlzLl92b2ljZVN0YXRlLmdldCgpLFxuXHRcdFx0aXNDb25uZWN0ZWQ6IHRoaXMuX2lzQ29ubmVjdGVkLmdldCgpLFxuXHRcdFx0aXNDb25uZWN0aW5nOiB0aGlzLl9pc0Nvbm5lY3RpbmcuZ2V0KCksXG5cdFx0XHRpc1JlY29ubmVjdGluZzogdGhpcy5faXNSZWNvbm5lY3RpbmcuZ2V0KCksXG5cdFx0XHRwZW5kaW5nVG9vbENvbmZpcm1hdGlvbnM6IHRoaXMuX3BlbmRpbmdUb29sQ29uZmlybWF0aW9ucy5nZXQoKS5tYXAodGMgPT4gKHtcblx0XHRcdFx0dHlwZTogdGMudHlwZSxcblx0XHRcdFx0c2Vzc2lvbkxhYmVsOiB0Yy5zZXNzaW9uTGFiZWwsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB0Yy5kZXNjcmlwdGlvbixcblx0XHRcdH0pKSxcblx0XHRcdGFjdGl2ZVNlc3Npb25zOiBzZXNzaW9ucy5tYXAocyA9PiAoe1xuXHRcdFx0XHRpZDogcy5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRsYWJlbDogcy5sYWJlbCxcblx0XHRcdFx0c3RhdHVzOiBzLnN0YXR1cyxcblx0XHRcdH0pKSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgY2xpZW50RW52aXJvbm1lbnQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge1xuXHRcdFx0bWFjaGluZUlkOiB0aGlzLl9nZXRNYWNoaW5lSWQoKSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgcGF5bG9hZDogSVZvaWNlRmVlZGJhY2tQYXlsb2FkID0ge1xuXHRcdFx0ZmVlZGJhY2tUZXh0LFxuXHRcdFx0bWFjaGluZUlkOiB0aGlzLl9nZXRNYWNoaW5lSWQoKSxcblx0XHRcdHVzZXJJZCxcblx0XHRcdHNlc3Npb25JZDogdGhpcy52b2ljZUNsaWVudFNlcnZpY2UuY3VycmVudFNlc3Npb25JZCA/PyAnJyxcblx0XHRcdHN1Ym1pc3Npb25JZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHR0cmFuc2NyaXB0SGlzdG9yeSxcblx0XHRcdGNsaWVudFNlc3Npb25TdGF0ZSxcblx0XHRcdGNsaWVudEVudmlyb25tZW50LFxuXHRcdFx0dGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0fTtcblxuXHRcdHJldHVybiB0aGlzLnZvaWNlQ2xpZW50U2VydmljZS5zdWJtaXRGZWVkYmFjayhwYXlsb2FkKTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJVm9pY2VTZXNzaW9uQ29udHJvbGxlciwgVm9pY2VTZXNzaW9uQ29udHJvbGxlciwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSxlQUFlLGlCQUFpQix5QkFBeUI7QUFDOUUsU0FBc0IsaUJBQWlCLFNBQVMsYUFBYSxpQ0FBaUM7QUFDOUYsU0FBUyx1QkFBdUIsZ0NBQWdDO0FBQ2hFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxpQkFBaUI7QUFFbkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsV0FBVztBQUNwQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsa0JBQWtCLHVCQUF1QjtBQUNsRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDhCQUE4QjtBQUN2QyxTQUF3Qyw2QkFBd0U7QUFDaEgsU0FBZ0YscUJBQStNLHFCQUFnSSxpQkFBaUIsb0NBQW9DO0FBQ3BkLFNBQVMsMEJBQTBCLHVDQUF1QyxzQ0FBc0M7QUFDaEgsU0FBUyxvQkFBb0MseUNBQXlDO0FBQ3RGLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMkJBQTJCLGdDQUFnQztBQUNwRSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGdCQUFvRyxjQUFjLHFCQUFxQix1QkFBNEM7QUFDNUwsU0FBUywwQkFBMEIsbUNBQW1DO0FBQ3RFLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQXNCLDBCQUEwQjtBQUVoRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQixtQ0FBbUM7QUFDakUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQVMsdUJBQXVCO0FBdUdoQyxTQUFTLE9BQXlCLE9BQWUsS0FBcUM7QUFDckYsU0FBTyxPQUFPLFVBQVUsZUFBZSxLQUFLLE9BQU8sR0FBRztBQUN2RDtBQXdJTyxNQUFNLDBCQUEwQixnQkFBeUMsd0JBQXdCO0FBRWpHLElBQU0seUJBQU4sY0FBcUMsV0FBOEM7QUFBQSxFQStjekYsWUFDdUMsb0JBQ0QsbUJBQ0Msb0JBQ00sMEJBQ0osc0JBQ0Esc0JBQ1QsYUFDRyxnQkFDTyx1QkFDRCxzQkFDVixZQUNpQixvQkFDWCxrQkFDSSxzQkFDTSw0QkFDTixzQkFDSCxtQkFDRSxxQkFDTCxnQkFDakM7QUFDRCxVQUFNO0FBcEJnQztBQUNEO0FBQ0M7QUFDTTtBQUNKO0FBQ0E7QUFDVDtBQUNHO0FBQ087QUFDRDtBQUNWO0FBQ2lCO0FBQ1g7QUFDSTtBQUNNO0FBQ047QUFDSDtBQUNFO0FBQ0w7QUE3ZG5DO0FBQUEsU0FBaUIsY0FBYyxnQkFBNEIsTUFBTSxNQUFNO0FBQ3ZFLFNBQVMsYUFBc0MsS0FBSztBQUVwRCxTQUFpQixjQUFjLGdCQUF3QixNQUFNLGNBQWM7QUFDM0UsU0FBUyxhQUFrQyxLQUFLO0FBTWhELFNBQWlCLG1CQUFtQixnQkFBNEMsTUFBTSxDQUFDLENBQUM7QUFDeEYsU0FBUyxrQkFBMkQsS0FBSztBQUV6RSxTQUFpQixlQUFlLGdCQUF5QixNQUFNLEtBQUs7QUFDcEUsU0FBUyxjQUFvQyxLQUFLO0FBRWxELFNBQWlCLGdCQUFnQixnQkFBeUIsTUFBTSxLQUFLO0FBQ3JFLFNBQVMsZUFBcUMsS0FBSztBQUVuRCxTQUFpQixrQkFBa0IsZ0JBQXlCLE1BQU0sS0FBSztBQUN2RSxTQUFTLGlCQUF1QyxLQUFLO0FBTXJEO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBUSxtQkFBbUI7QUFFM0IsU0FBaUIsNEJBQTRCLGdCQUFxRCxNQUFNLENBQUMsQ0FBQztBQUMxRyxTQUFTLDJCQUE2RSxLQUFLO0FBUTNGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLGtDQUFrQyxnQkFBcUMsTUFBTSxvQkFBSSxJQUFJLENBQUM7QUFFdkcsU0FBaUIsaUJBQWlCLGdCQUFpQyxNQUFNLE1BQVM7QUFDbEYsU0FBUyxnQkFBOEMsS0FBSztBQUc1RDtBQUFBLFNBQVEsV0FBVztBQVFuQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVEseUJBQXlCO0FBQ2pDLFNBQVEsaUJBQWlCO0FBUXpCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBUSx1QkFBdUI7QUFHL0I7QUFBQTtBQUFBLFNBQVEsd0JBQXdCO0FBT2hDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVEsa0JBQWtCO0FBSTFCO0FBQUE7QUFBQTtBQUFBLFNBQVEsMkJBQTJCO0FBV25DO0FBQUE7QUFBQSxTQUFRLDRCQUE0QjtBQUNwQyxTQUFRLG9CQUFvQjtBQUc1QixTQUFpQix5QkFBeUIsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFDOUUsU0FBaUIsMEJBQTBCLEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBT2pGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxrQkFBa0IsQ0FBQztBQUUxRSxTQUFRLDRCQUE0QjtBQUNwQyxTQUFRLG1DQUFtQztBQUMzQyxTQUFpQix3QkFBd0Isb0JBQUksSUFBWTtBQVl6RCxTQUFRLHlCQUF5QjtBQUVqQztBQUFBLFNBQVEsd0JBQXdCO0FBRWhDO0FBQUEsU0FBUSxzQkFBc0I7QUFTOUI7QUFBQSxTQUFpQixjQUFzQyxDQUFDO0FBQ3hELFNBQVEsNEJBQXVEO0FBWS9EO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBUSw0QkFBNEI7QUFDcEMsU0FBUSxxQkFBcUI7QUFTN0I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFRLHlCQUF5QjtBQUVqQztBQUFBLFNBQWlCLHVCQUF1QixvQkFBSSxJQUFZO0FBdUJ4RDtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVEsNkJBQTZCO0FBVXJDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLHFCQUFxQixvQkFBSSxJQUFpQztBQWEzRTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQix5QkFBeUIsb0JBQUksSUFBb0I7QUFHbEU7QUFBQTtBQUFBLFNBQWlCLCtCQUErQixvQkFBSSxJQUFZO0FBTWhFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQixnQ0FBZ0Msb0JBQUksSUFBWTtBQU9qRTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQiw0QkFBNEIsb0JBQUksSUFBb0I7QUFjckU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQixpQkFBaUIsb0JBQUksSUFBWTtBQWNsRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQixrQkFBa0Isb0JBQUksSUFBaUM7QUFVeEU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLHdCQUF3QixvQkFBSSxJQUFnRDtBQUs3RjtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLHVCQUF1QixvQkFBSSxJQUFZO0FBUXhEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIseUJBQXlCLG9CQUFJLElBQVk7QUFRMUQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLDJCQUEyQixvQkFBSSxJQUFvQjtBQUdwRTtBQUFBLFNBQWlCLHFCQUFxQixvQkFBSSxJQUEwQjtBQUlwRTtBQUFBLFNBQWlCLHFCQUFxQixvQkFBSSxJQUF5STtBQU9uTDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIseUJBQXlCLG9CQUFJLElBQTJDO0FBZ0J6RjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQiw4QkFBOEIsb0JBQUksSUFBMkM7QUFXOUY7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLHVCQUF1QixvQkFBSSxJQUE2VDtBQUt6VztBQUFBLFNBQWlCLGtCQUFrQixvQkFBSSxJQUFpQztBQUd4RTtBQUFBLFNBQWlCLHFCQUFxQixvQkFBSSxJQUFZO0FBUXREO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLHdCQUF3QixvQkFBSSxJQUFZO0FBWXpEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIsbUNBQW1DLG9CQUFJLElBQVk7QUFhcEU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLDJCQUEyQixvQkFBSSxJQUFvQjtBQVdwRTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQixvQkFBb0Isb0JBQUksSUFBb0I7QUFPN0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLDJCQUEyQixvQkFBSSxJQUE4QjtBQVk5RTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLDhCQUE4QixvQkFBSSxJQUF3QztBQVMzRixTQUFpQiwwQkFBMEIsS0FBSyxVQUFVLElBQUksY0FBdUMsQ0FBQztBQUN0RyxTQUFpQixrQ0FBa0Msb0JBQUksSUFBb0I7QUFDM0UsU0FBaUIseUJBQXlCLG9CQUFJLElBQW9CO0FBVWxFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQixzQkFBc0Isb0JBQUksSUFBbUY7QUFjOUg7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIsbUJBQW1CLG9CQUFJLElBQW9CO0FBRzVEO0FBQUEsU0FBUSx5QkFBeUI7QUFFakMsU0FBUSxzQkFBc0I7QUFDOUIsU0FBUSwyQkFBMkI7QUFDbkMsU0FBUSx5QkFBeUI7QUFNakMsU0FBUSwyQkFBMkI7QUFZbkM7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFRLHdCQUFvRCxDQUFDO0FBd0M1RCxTQUFLLFVBQVUsS0FBSyxrQkFBa0IsMEJBQTBCLE1BQU0sS0FBSyx5QkFBeUIsQ0FBQyxDQUFDO0FBU3RHLGVBQVcsVUFBVSxLQUFLLGtCQUFrQixjQUFjLEdBQUc7QUFDNUQsV0FBSyxvQkFBb0IsTUFBTTtBQUFBLElBQ2hDO0FBQ0EsU0FBSyxVQUFVLEtBQUssa0JBQWtCLGVBQWUsWUFBVSxLQUFLLG9CQUFvQixNQUFNLENBQUMsQ0FBQztBQUdoRyxTQUFLLHlCQUF5QixZQUFZO0FBQUEsTUFDekMsYUFBYSxDQUFDLFNBQTBCO0FBQ3ZDLGFBQUssZUFBZSxlQUFlLDJCQUEyQixJQUFJLEVBQUUsTUFBTSxTQUFPO0FBQ2hGLGVBQUssV0FBVyxLQUFLLHdDQUF3QyxHQUFHO0FBQUEsUUFDakUsQ0FBQztBQUNELGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSwyQkFBMkIsWUFBc0M7QUFDaEUsY0FBTSxjQUFjLE1BQU0sS0FBSyxlQUFlLGVBQW1DLCtCQUErQixFQUFFLE1BQU0sTUFBTSxNQUFTO0FBQ3ZJLGVBQU8sY0FBYyxJQUFJLE1BQU0sV0FBVyxJQUFJO0FBQUEsTUFDL0M7QUFBQSxNQUNBLGlCQUFpQixDQUFDLGFBQXdCO0FBQ3pDLGFBQUssZUFBZSxlQUFlLCtCQUErQixTQUFTLFNBQVMsQ0FBQztBQUFBLE1BQ3RGO0FBQUEsTUFDQSx5QkFBeUIsTUFBbUI7QUFDM0MsZUFBTyxLQUFLO0FBQUEsTUFDYjtBQUFBLE1BQ0EsNEJBQTRCLE1BQVk7QUFDdkMsY0FBTSxXQUFXLEtBQUsscUJBQXFCLE1BQU0sU0FBUyxPQUFPLE9BQUssQ0FBQyxFQUFFLFdBQVcsQ0FBQztBQUNyRixtQkFBVyxLQUFLLFVBQVU7QUFDekIsZUFBSyxzQkFBc0IsSUFBSSxFQUFFLFNBQVMsU0FBUyxDQUFDO0FBQ3BELGdCQUFNLFFBQVEsS0FBSyxZQUFZLFdBQVcsRUFBRSxRQUFRO0FBQ3BELGNBQUksT0FBTztBQUNWLGlCQUFLLHlCQUF5QixLQUFLO0FBQUEsVUFDcEM7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLE1BQ0EsMkJBQTJCLENBQUMsYUFBMkI7QUFDdEQsYUFBSyxzQkFBc0IsT0FBTyxRQUFRO0FBQUEsTUFDM0M7QUFBQSxNQUNBLHlCQUF5QixNQUFZO0FBQ3BDLGFBQUssa0JBQWtCO0FBQUEsTUFDeEI7QUFBQSxJQUNELENBQUM7QUFJRCxTQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLFlBQU0sZ0JBQWdCLEtBQUsscUJBQXFCLE1BQU0sU0FBUyxPQUFPLE9BQUssQ0FBQyxFQUFFLFdBQVcsQ0FBQztBQUMxRixZQUFNLG9CQUFnRCxDQUFDO0FBQ3ZELFlBQU0scUJBQXFCLG9CQUFJLElBQVk7QUFJM0MsWUFBTSxxQkFBcUIsS0FBSyxnQ0FBZ0MsS0FBSyxNQUFNO0FBRzNFLFlBQU0sZ0JBQXVFLENBQUM7QUFDOUUsaUJBQVcsS0FBSyxlQUFlO0FBQzlCLDJCQUFtQixJQUFJLEVBQUUsU0FBUyxTQUFTLENBQUM7QUFJNUMsYUFBSyxvQkFBb0IsRUFBRSxRQUFRO0FBQ25DLGNBQU0sUUFBUSxLQUFLLFlBQVksV0FBVyxFQUFFLFFBQVE7QUFDcEQsWUFBSSxPQUFPO0FBQ1Ysd0JBQWMsS0FBSyxFQUFFLE9BQU8sVUFBVSxFQUFFLFVBQVUsT0FBTyxFQUFFLFNBQVMsbUJBQW1CLENBQUM7QUFBQSxRQUN6RjtBQUFBLE1BQ0Q7QUFHQSxpQkFBVyxhQUFhLEtBQUssWUFBWSxXQUFXLEtBQUssTUFBTSxHQUFHO0FBQ2pFLGNBQU0sTUFBTSxVQUFVLGdCQUFnQixTQUFTO0FBQy9DLFlBQUksbUJBQW1CLElBQUksR0FBRyxHQUFHO0FBQUU7QUFBQSxRQUFVO0FBQzdDLFlBQUksVUFBVSxZQUFZLEVBQUUsV0FBVyxHQUFHO0FBQUU7QUFBQSxRQUFVO0FBQ3RELDJCQUFtQixJQUFJLEdBQUc7QUFDMUIsc0JBQWMsS0FBSyxFQUFFLE9BQU8sV0FBVyxVQUFVLFVBQVUsaUJBQWlCLE9BQU8sVUFBVSxTQUFTLE9BQU8sQ0FBQztBQUFBLE1BQy9HO0FBRUEsaUJBQVcsRUFBRSxPQUFPLFVBQVUsTUFBTSxLQUFLLGVBQWU7QUFDdkQsWUFBSSxtQkFBbUIsSUFBSSxTQUFTLFNBQVMsQ0FBQyxHQUFHO0FBQUU7QUFBQSxRQUFVO0FBQzdELGNBQU0sVUFBVSxNQUFNLGVBQWUsS0FBSyxNQUFNO0FBQ2hELFlBQUksU0FBUyxVQUFVO0FBQ3RCLGdCQUFNLFVBQVUsUUFBUSxTQUFTLHNCQUFzQixLQUFLLE1BQU07QUFDbEUsY0FBSSxXQUFXLENBQUMsS0FBSyxzQkFBc0IsSUFBSSxTQUFTLFNBQVMsQ0FBQyxHQUFHO0FBQ3BFLGtCQUFNLGNBQWMsS0FBSyxxQkFBcUIsUUFBUSxRQUFRO0FBQzlELGtCQUFNLE9BQU8sS0FBSyw0QkFBNEIsUUFBUSxRQUFRO0FBQzlELDhCQUFrQixLQUFLO0FBQUEsY0FDdEIsTUFBTTtBQUFBLGNBQ04sY0FBYztBQUFBLGNBQ2QsaUJBQWlCO0FBQUEsY0FDakIsYUFBYSxRQUFRLFFBQVEsV0FBVyxnQkFBZ0IsVUFBVSxxQkFBcUI7QUFBQSxjQUN2RixTQUFTLE1BQU07QUFDZCxvQkFBSSxRQUFRLFVBQVU7QUFDckIsNkJBQVcsUUFBUSxRQUFRLFNBQVMsU0FBUyxPQUFPO0FBQ25ELHdCQUFJLEtBQUssU0FBUyxrQkFBa0I7QUFDbkMsMENBQW9CLFlBQVksTUFBNkIsRUFBRSxNQUFNLGdCQUFnQixXQUFXLENBQUM7QUFBQSxvQkFDbEc7QUFBQSxrQkFDRDtBQUFBLGdCQUNEO0FBQUEsY0FDRDtBQUFBLGNBQ0EsTUFBTSxNQUFNO0FBQ1gsb0JBQUksUUFBUSxVQUFVO0FBQ3JCLDZCQUFXLFFBQVEsUUFBUSxTQUFTLFNBQVMsT0FBTztBQUNuRCx3QkFBSSxLQUFLLFNBQVMsa0JBQWtCO0FBQ25DLDBDQUFvQixZQUFZLE1BQTZCLEVBQUUsTUFBTSxnQkFBZ0IsT0FBTyxDQUFDO0FBQUEsb0JBQzlGO0FBQUEsa0JBQ0Q7QUFBQSxnQkFDRDtBQUFBLGNBQ0Q7QUFBQSxZQUNELENBQUM7QUFBQSxVQUNGO0FBS0EsY0FBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLHNCQUFzQixJQUFJLFNBQVMsU0FBUyxDQUFDLEdBQUc7QUFDckUsdUJBQVcsUUFBUSxRQUFRLFNBQVMsU0FBUyxPQUFPO0FBQ25ELGtCQUFJLEtBQUssU0FBUyxrQkFBa0I7QUFDbkMsc0JBQU0sWUFBYSxLQUE2QixNQUFNLEtBQUssTUFBTTtBQUNqRSxvQkFBSSxVQUFVLFNBQVMsb0JBQW9CLFVBQVUsd0JBQXdCO0FBQzVFLHdCQUFNLFNBQVMsVUFBVTtBQUN6Qix3QkFBTSxZQUFZLFNBQVMsV0FBVztBQUN0QyxzQkFBSSxPQUFPO0FBQ1gsc0JBQUksTUFBTSxRQUFRLFNBQVMsS0FBSyxVQUFVLFNBQVMsR0FBRztBQUNyRCwyQkFBTyxVQUFVLElBQUksQ0FBQyxNQUErQjtBQUNwRCw0QkFBTSxRQUFRLEVBQUUsUUFBUSxLQUFLLEVBQUUsVUFBVTtBQUN6QywwQkFBSSxDQUFDLE9BQU87QUFDWCwrQkFBTztBQUFBLHNCQUNSO0FBQ0EsNEJBQU0sVUFBVSxFQUFFLFNBQVM7QUFDM0IsMEJBQUksTUFBTSxRQUFRLE9BQU8sS0FBSyxRQUFRLFNBQVMsR0FBRztBQUNqRCw4QkFBTSxTQUFTLFFBQ2IsSUFBSSxDQUFDLE1BQStCLEVBQUUsT0FBTyxDQUFDLEVBQzlDLE9BQU8sT0FBTztBQUNoQiw0QkFBSSxPQUFPLFNBQVMsR0FBRztBQUN0QixpQ0FBTyxHQUFHLEtBQUssS0FBSyxPQUFPLEtBQUssSUFBSSxDQUFDO0FBQUEsd0JBQ3RDO0FBQUEsc0JBQ0Q7QUFDQSw2QkFBTztBQUFBLG9CQUNSLENBQUMsRUFBRSxPQUFPLE9BQU8sRUFBRSxLQUFLLElBQUk7QUFBQSxrQkFDN0I7QUFDQSxvQ0FBa0IsS0FBSztBQUFBLG9CQUN0QixNQUFNO0FBQUEsb0JBQ04sY0FBYztBQUFBLG9CQUNkLGlCQUFpQjtBQUFBLG9CQUNqQixhQUFhLFFBQVE7QUFBQSxvQkFDckIsU0FBUyxNQUFNO0FBQ2QsMENBQW9CLFlBQVksTUFBNkIsRUFBRSxNQUFNLGdCQUFnQixXQUFXLENBQUM7QUFBQSxvQkFDbEc7QUFBQSxvQkFDQSxNQUFNLE1BQU07QUFDWCwwQ0FBb0IsWUFBWSxNQUE2QixFQUFFLE1BQU0sZ0JBQWdCLE9BQU8sQ0FBQztBQUFBLG9CQUM5RjtBQUFBLGtCQUNELENBQUM7QUFDRDtBQUFBLGdCQUNEO0FBQUEsY0FDRDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSxXQUFLLDBCQUEwQixJQUFJLG1CQUFtQixNQUFTO0FBQUEsSUFDaEUsQ0FBQyxDQUFDO0FBR0YsU0FBSyxVQUFVLGlCQUFpQixnQkFBZ0IsOEJBQThCLENBQUMsV0FBVyxZQUEwRDtBQUNuSixZQUFNLFlBQVksU0FBUztBQUMzQixVQUFJLENBQUMsV0FBVztBQUFFO0FBQUEsTUFBUTtBQUMxQixXQUFLLG9CQUFvQixTQUFTO0FBQUEsSUFDbkMsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLGlCQUFpQixnQkFBZ0IsNEJBQTRCLENBQUMsV0FBVyxZQUFxQztBQUM1SCxXQUFLLFlBQVk7QUFDakIsVUFBSSxTQUFTLFdBQVc7QUFDdkIsYUFBSyxxQkFBcUIsa0JBQWtCLElBQUksTUFBTSxRQUFRLFNBQVMsQ0FBQztBQUFBLE1BQ3pFO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsRUFBRSxTQUFTLE1BQU0sS0FBSyxXQUFXLEVBQUUsQ0FBQztBQUFBLEVBQ3BEO0FBQUEsRUFFQSxNQUFNLFFBQVEsUUFBbUQ7QUFDaEUsUUFBSSxLQUFLLGNBQWMsSUFBSSxLQUFLLEtBQUssYUFBYSxJQUFJLEdBQUc7QUFBRTtBQUFBLElBQVE7QUFDbkUsVUFBTSwyQkFBMkIsRUFBRSxLQUFLO0FBRXhDLFNBQUssVUFBVTtBQUNmLFNBQUsseUJBQXlCO0FBQzlCLFNBQUssbUJBQW1CO0FBR3hCLFNBQUssZ0NBQWdDLElBQUksb0JBQUksSUFBSSxHQUFHLE1BQVM7QUFDN0QsU0FBSyxjQUFjLElBQUksTUFBTSxNQUFTO0FBQ3RDLFNBQUssWUFBWSxJQUFJLGlCQUFpQixNQUFTO0FBQy9DLFNBQUssWUFBWSxJQUFJLFFBQVEsTUFBUztBQUN0QyxTQUFLLDJCQUEyQixLQUFLLElBQUk7QUFPekMsU0FBSyxvQkFBb0I7QUFLekIsUUFBSTtBQUNKLFFBQUk7QUFDSCxZQUFNLFdBQVcsTUFBTSxLQUFLLHNCQUFzQixZQUFZLFFBQVE7QUFDdEUsVUFBSSw2QkFBNkIsS0FBSywyQkFBMkI7QUFDaEU7QUFBQSxNQUNEO0FBQ0EsV0FBSyxhQUFhLFNBQVMsQ0FBQyxHQUFHLFFBQVE7QUFDdkMsa0JBQVksU0FBUyxDQUFDLEdBQUc7QUFDekIsVUFBSSxDQUFDLEtBQUssWUFBWTtBQUNyQixhQUFLLFdBQVcsS0FBSyxvRUFBb0U7QUFBQSxNQUMxRixPQUFPO0FBSU4sY0FBTSxZQUFZLE1BQU0sS0FBSyxxQkFBcUIsVUFBVSxLQUFLLFlBQVksRUFBRSxPQUFPLEVBQUUsQ0FBQyxHQUFHLENBQUM7QUFDN0YsWUFBSSw2QkFBNkIsS0FBSywyQkFBMkI7QUFDaEU7QUFBQSxRQUNEO0FBQ0EsYUFBSyx1QkFBdUIsVUFBVTtBQU90QyxZQUFJO0FBQ0gsZ0JBQU0sU0FBUyxNQUFNLEtBQUsscUJBQXFCO0FBQUEsWUFDOUMsS0FBSztBQUFBLFlBQ0wsRUFBRSxPQUFPLHVCQUF1QiwyQkFBMkI7QUFBQSxVQUM1RDtBQUNBLGNBQUksNkJBQTZCLEtBQUssMkJBQTJCO0FBQ2hFO0FBQUEsVUFDRDtBQUNBLGVBQUssd0JBQXdCLEtBQUssb0JBQW9CLE1BQU07QUFBQSxRQUM3RCxTQUFTLEtBQUs7QUFDYixlQUFLLFdBQVcsS0FBSyw2REFBNkQsR0FBRztBQUNyRixlQUFLLHdCQUF3QixDQUFDO0FBQUEsUUFDL0I7QUFBQSxNQUNEO0FBQUEsSUFDRCxTQUFTLEtBQUs7QUFDYixXQUFLLFdBQVcsS0FBSyw0Q0FBNEMsR0FBRztBQUFBLElBQ3JFO0FBS0EsUUFBSSxDQUFDLEtBQUssY0FBYyxJQUFJLEtBQUssNkJBQTZCLEtBQUssMkJBQTJCO0FBQzdGO0FBQUEsSUFDRDtBQUVBLFNBQUssdUJBQXVCLE1BQU07QUFLbEMsU0FBSyx1QkFBdUIsSUFBSSxzQkFBc0IsS0FBSyxTQUFVLFFBQVEsTUFBTSxLQUFLLGNBQWMsQ0FBQyxDQUFDO0FBQ3hHLFNBQUssdUJBQXVCLElBQUksc0JBQXNCLEtBQUssU0FBVSxTQUFTLE1BQU0sS0FBSyxlQUFlLENBQUMsQ0FBQztBQUcxRyxTQUFLLHVCQUF1QixJQUFJLEtBQUssa0JBQWtCLFdBQVcsQ0FBQyxZQUFZO0FBQzlFLFdBQUssbUJBQW1CLGFBQWEsS0FBSyxtQkFBbUIsT0FBTztBQUFBLElBQ3JFLENBQUMsQ0FBQztBQUNGLFNBQUssdUJBQXVCLElBQUksS0FBSyxrQkFBa0IsZ0JBQWdCLFNBQU87QUFDN0UsV0FBSyxtQkFBbUIsa0JBQWtCLEdBQUc7QUFBQSxJQUM5QyxDQUFDLENBQUM7QUFDRixTQUFLLHVCQUF1QixJQUFJLEtBQUssa0JBQWtCLFNBQVMsTUFBTTtBQUNyRSxXQUFLLG1CQUFtQixXQUFXO0FBQUEsSUFDcEMsQ0FBQyxDQUFDO0FBQ0YsU0FBSyx1QkFBdUIsSUFBSSxLQUFLLGtCQUFrQixnQkFBZ0IsQ0FBQyxTQUF5QjtBQUdoRyxXQUFLLFdBQVc7QUFBQSxRQUNmLGtDQUFrQyxLQUFLLE1BQU0sV0FDbkMsS0FBSyxNQUFNLGVBQWUsS0FBSyxVQUFVLGdCQUFnQixLQUFLLFdBQVcsZUFDckUsS0FBSyxVQUFVLGdCQUFnQixLQUFLLFdBQVcsaUJBQWlCLEtBQUssWUFBWSxrQkFBa0IsS0FBSyxhQUFhLHVCQUM3RyxLQUFLLGtCQUFrQiw4QkFBOEIsS0FBSyx5QkFBeUIseUJBQ2pGLEtBQUssb0JBQW9CLHVCQUF1QixLQUFLLGtCQUFrQiw2QkFDbkUsS0FBSyx3QkFBd0Isb0NBQW9DLEtBQUssK0JBQStCLHdCQUMxRyxLQUFLLG1CQUFtQiwwQkFDdEIsS0FBSyxxQkFBcUIsd0JBQXdCLEtBQUssbUJBQW1CO0FBQUEsTUFDcEc7QUFDQSxXQUFLLG1CQUFtQixrQkFBa0IsS0FBSyxRQUFRO0FBQUEsUUFDdEQsU0FBUyxLQUFLO0FBQUEsUUFDZCxhQUFhLEtBQUs7QUFBQSxRQUNsQixjQUFjLEtBQUs7QUFBQSxRQUNuQixhQUFhLEtBQUs7QUFBQSxRQUNsQixjQUFjLEtBQUs7QUFBQSxRQUNuQixlQUFlLEtBQUs7QUFBQSxRQUNwQixpQkFBaUIsS0FBSztBQUFBLFFBQ3RCLHVCQUF1QixLQUFLO0FBQUEsUUFDNUIsOEJBQThCLEtBQUs7QUFBQSxRQUNuQyx3QkFBd0IsS0FBSztBQUFBLFFBQzdCLHNCQUFzQixLQUFLO0FBQUEsUUFDM0IsOEJBQThCLEtBQUs7QUFBQSxRQUNuQyxxQ0FBcUMsS0FBSztBQUFBLFFBQzFDLHdCQUF3QixLQUFLO0FBQUEsUUFDN0IseUJBQXlCLEtBQUs7QUFBQSxRQUM5Qix3QkFBd0IsS0FBSztBQUFBLE1BQzlCLENBQUM7QUFBQSxJQUNGLENBQUMsQ0FBQztBQUdGLFNBQUssdUJBQXVCLElBQUksS0FBSyxtQkFBbUIsa0JBQWtCLE1BQU07QUFJL0UsWUFBTSxpQkFBaUIsS0FBSztBQUU1QixZQUFNLGdCQUFnQixDQUFDO0FBQ3ZCLFdBQUssaUJBQWlCLFdBQTRFLHlCQUF5QjtBQUFBLFFBQzFIO0FBQUEsUUFDQSxhQUFhLGdCQUFnQixNQUFNO0FBQUE7QUFBQSxNQUNwQyxDQUFDO0FBQ0QsV0FBSywyQkFBMkI7QUFFaEMsWUFBTSxvQkFBb0IsS0FBSztBQUMvQixZQUFNLFVBQVUsS0FBSyxtQkFBbUIscUJBQXFCO0FBQzdELFVBQUksV0FBVyxzQkFBc0IsTUFBTTtBQUMxQyxjQUFNLFdBQVcscUJBQXFCO0FBQ3RDLGFBQUssbUJBQW1CLElBQUksVUFBVSxPQUFPO0FBQUEsTUFDOUM7QUFFQSxXQUFLLHFCQUFxQixrQkFBa0IsTUFBUztBQUNyRCxXQUFLLDRCQUE0QjtBQUNqQyxXQUFLLDRCQUE0QjtBQUNqQyxZQUFNLHFCQUFxQixLQUFLO0FBQ2hDLFdBQUssNkJBQTZCO0FBQ2xDLFlBQU0sb0JBQW9CLEtBQUs7QUFDL0IsV0FBSyw0QkFBNEI7QUFDakMsVUFBSSxzQkFBc0IsQ0FBQyxnQkFBZ0I7QUFDMUMsY0FBTSxrQkFBa0IscUJBQXFCLEtBQUssZ0JBQWdCO0FBQ2xFLFlBQUksaUJBQWlCO0FBQ3BCLGVBQUssdUJBQXVCLElBQUksS0FBSyxZQUFZLGVBQWUsR0FBRyxLQUFLLElBQUksQ0FBQztBQUM3RSxlQUFLLGtDQUFrQyxpQkFBaUIsb0JBQW9CLGlCQUFpQjtBQUFBLFFBQzlGO0FBS0EsYUFBSyxvQkFBb0Isa0JBQWtCO0FBQUEsTUFDNUMsV0FBVyxzQkFBc0IsZ0JBQWdCO0FBS2hELGNBQU0sVUFBVSxLQUFLLDRCQUE0QixJQUFJLGtCQUFrQjtBQUN2RSxZQUFJLFNBQVM7QUFDWixlQUFLLDJCQUEyQixvQkFBb0IsT0FBTztBQUFBLFFBQzVEO0FBQUEsTUFDRDtBQUdBLFVBQUksS0FBSyxZQUFZLFNBQVMsR0FBRztBQUNoQyxtQkFBVyxNQUFNLEtBQUssY0FBYyxHQUFHLEdBQUc7QUFBQSxNQUMzQyxPQUFPO0FBQ04sWUFBSSxLQUFLLFVBQVU7QUFDbEIsY0FBSSxLQUFLLHNCQUFzQjtBQU05QixpQkFBSyx1QkFBdUI7QUFDNUIsaUJBQUssaUJBQWlCO0FBQUEsVUFDdkI7QUFDQSxlQUFLLFlBQVksSUFBSSxhQUFhLE1BQVM7QUFDM0MsZUFBSyxZQUFZLElBQUksZ0JBQWdCLE1BQVM7QUFBQSxRQUMvQyxPQUFPO0FBQ04sZUFBSyxZQUFZLElBQUksUUFBUSxNQUFTO0FBQ3RDLGVBQUssWUFBWSxJQUFJLG9CQUFvQixNQUFTO0FBQ2xELGNBQUksS0FBSyx3QkFBd0I7QUFDaEMsaUJBQUssd0JBQXdCO0FBQUEsVUFDOUI7QUFHQSxjQUFJLEtBQUssb0JBQW9CLEtBQUssQ0FBQyxLQUFLLHVCQUF1QixLQUFLLHVCQUF1QjtBQUMxRixpQkFBSyxvQkFBb0I7QUFBQSxVQUMxQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFHRixTQUFLLHVCQUF1QixJQUFJLEtBQUssbUJBQW1CLDJCQUEyQixPQUFNLGNBQWE7QUFDckcsVUFBSSxXQUFXO0FBQ2QsY0FBTSxrQ0FBa0MsRUFBRSxLQUFLO0FBRy9DLGFBQUssb0JBQW9CO0FBQ3pCLGNBQU0sUUFBUSxLQUFLLG1CQUFtQixjQUFjLE1BQU07QUFDMUQsY0FBTSxPQUFPO0FBRWIsY0FBTSxhQUFhLEtBQUssbUJBQW1CO0FBRzNDLGNBQU0sTUFBTSxLQUFLLElBQUk7QUFDckIsY0FBTSxZQUFZLEtBQUssMkJBQTJCLE1BQU0sS0FBSywyQkFBMkI7QUFDeEYsWUFBSSxLQUFLLHdCQUF3QjtBQUNoQyxlQUFLLHlCQUF5QjtBQUM5QixlQUFLLGlCQUFpQixXQUFvRSxxQkFBcUIsRUFBRSxpQkFBaUIsVUFBVSxDQUFDO0FBQUEsUUFDOUk7QUFDQSxZQUFJLFlBQVk7QUFDZixlQUFLO0FBQ0wsZ0JBQU0sZUFBZSxLQUFLLDBCQUEwQixLQUFLLE9BQU8sTUFBTSxLQUFLLDJCQUEyQixHQUFJLElBQUk7QUFDOUcsZUFBSyxpQkFBaUIsV0FBOEQsa0JBQWtCLEVBQUUseUJBQXlCLGFBQWEsQ0FBQztBQUFBLFFBQ2hKLE9BQU87QUFDTixlQUFLO0FBQ0wsZUFBSyx5QkFBeUI7QUFDOUIsZUFBSyxzQkFBc0I7QUFDM0IsZUFBSywyQkFBMkI7QUFDaEMsZUFBSyxpQkFBaUIsV0FBd0UsdUJBQXVCLEVBQUUsY0FBYyxLQUFLLHVCQUF1QixDQUFDO0FBQUEsUUFDbks7QUFDQSxhQUFLLDBCQUEwQjtBQUMvQixjQUFNLG9CQUFvQixNQUFNLEtBQUssZUFBZSxxQkFBcUIsa0JBQWtCLElBQUk7QUFDL0YsWUFDQyw2QkFBNkIsS0FBSyw2QkFDbEMsb0NBQW9DLEtBQUssb0NBQ3pDLENBQUMsS0FBSyxtQkFBbUIsZUFDeEIsQ0FBQyxLQUFLLGNBQWMsSUFBSSxLQUFLLENBQUMsS0FBSyxnQkFBZ0IsSUFBSSxHQUN2RDtBQUNEO0FBQUEsUUFDRDtBQUNBLFlBQUksWUFBWTtBQUNmLGVBQUssa0JBQWtCLFlBQVk7QUFBQSxRQUNwQztBQUNBLGFBQUssa0JBQWtCLFFBQVEsTUFBTTtBQUNyQyxZQUFJLEtBQUssb0JBQW9CLEdBQUc7QUFDL0IsY0FBSTtBQUNILGtCQUFNLEtBQUssa0JBQWtCLGFBQWEsTUFBTTtBQUFBLFVBQ2pELFNBQVMsS0FBSztBQUNiLGdCQUNDLDZCQUE2QixLQUFLLDZCQUNsQyxvQ0FBb0MsS0FBSyxvQ0FDekMsQ0FBQyxLQUFLLG1CQUFtQixlQUN4QixDQUFDLEtBQUssY0FBYyxJQUFJLEtBQUssQ0FBQyxLQUFLLGdCQUFnQixJQUFJLEdBQ3ZEO0FBQ0Q7QUFBQSxZQUNEO0FBQ0EsaUJBQUssV0FBVyxLQUFLLHVGQUF1RixHQUFHO0FBQy9HLGtCQUFNLG1CQUFtQixrQ0FBa0MsR0FBRztBQUM5RCxpQkFBSyx1QkFBdUIsQ0FBQyxnQkFBZ0I7QUFDN0M7QUFBQSxVQUNEO0FBQ0EsY0FDQyw2QkFBNkIsS0FBSyw2QkFDbEMsb0NBQW9DLEtBQUssb0NBQ3pDLENBQUMsS0FBSyxtQkFBbUIsZUFDeEIsQ0FBQyxLQUFLLGNBQWMsSUFBSSxLQUFLLENBQUMsS0FBSyxnQkFBZ0IsSUFBSSxHQUN2RDtBQUNEO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFFQSxZQUFJLFlBQVk7QUFDZixlQUFLLG1CQUFtQixrQkFBa0IsS0FBSyxxQkFBcUIsR0FBRyxLQUFLLGNBQWMsR0FBRyxpQkFBaUI7QUFBQSxRQUMvRyxPQUFPO0FBQ04sZ0JBQU0sZ0JBQWdCLEtBQUs7QUFDM0IsZUFBSyx3QkFBd0IsQ0FBQztBQUM5QixlQUFLLG1CQUFtQixpQkFBaUIsS0FBSyxxQkFBcUIsR0FBRyxLQUFLLGNBQWMsR0FBRyxlQUFlLFFBQVcsaUJBQWlCO0FBQUEsUUFDeEk7QUFFQSxvQkFBWSxRQUFNO0FBQ2pCLGVBQUssY0FBYyxJQUFJLE9BQU8sRUFBRTtBQUNoQyxlQUFLLGdCQUFnQixJQUFJLE9BQU8sRUFBRTtBQUNsQyxlQUFLLGFBQWEsSUFBSSxNQUFNLEVBQUU7QUFBQSxRQUMvQixDQUFDO0FBRUQsYUFBSyxpQkFBaUIsTUFBTTtBQUc1QixjQUFNLGtCQUFrQixvQkFBSSxJQUFZO0FBQ3hDLG1CQUFXLEtBQUssS0FBSyxxQkFBcUIsTUFBTSxTQUFTLE9BQU8sUUFBTSxDQUFDLEdBQUcsV0FBVyxDQUFDLEdBQUc7QUFDeEYsMEJBQWdCLElBQUksRUFBRSxTQUFTLFNBQVMsQ0FBQztBQUN6QyxnQkFBTSxRQUFRLEtBQUssWUFBWSxXQUFXLEVBQUUsUUFBUTtBQUNwRCxnQkFBTSxPQUFPLFFBQVEsS0FBSyxtQkFBbUIsS0FBSyxJQUFJO0FBQ3RELGdCQUFNLGVBQWUsTUFBTSxVQUN0QixFQUFFLFdBQVcsbUJBQW1CLGFBQWEsYUFDOUMsRUFBRSxXQUFXLG1CQUFtQixhQUFhLDZCQUM1QyxFQUFFLFdBQVcsbUJBQW1CLFlBQVksU0FDM0M7QUFDTixjQUFJLGlCQUFpQixXQUFXO0FBQy9CLGlCQUFLLG1CQUFtQixJQUFJLEVBQUUsU0FBUyxTQUFTLEdBQUcsRUFBRSxPQUFPLGNBQWMsUUFBUSxNQUFNLFVBQVUsSUFBSSxXQUFXLGlCQUFpQiw2QkFBNkIsS0FBSyxjQUFjLEVBQUUsU0FBUyxTQUFTLENBQUMsSUFBSSxJQUFJLGtCQUFrQixNQUFNLG1CQUFtQixxQkFBcUIsTUFBTSx5QkFBeUIsR0FBRyxDQUFDO0FBQUEsVUFDblQ7QUFBQSxRQUNEO0FBRUEsbUJBQVcsYUFBYSxLQUFLLFlBQVksV0FBVyxJQUFJLEdBQUc7QUFDMUQsZ0JBQU0sTUFBTSxVQUFVLGdCQUFnQixTQUFTO0FBQy9DLGNBQUksZ0JBQWdCLElBQUksR0FBRyxHQUFHO0FBQUU7QUFBQSxVQUFVO0FBQzFDLGNBQUksVUFBVSxZQUFZLEVBQUUsV0FBVyxHQUFHO0FBQUU7QUFBQSxVQUFVO0FBQ3RELGdCQUFNLE9BQU8sS0FBSyxtQkFBbUIsU0FBUztBQUM5QyxjQUFJLEtBQUssVUFBVSxXQUFXO0FBQzdCLGlCQUFLLG1CQUFtQixJQUFJLEtBQUssRUFBRSxPQUFPLEtBQUssT0FBTyxRQUFRLEtBQUssVUFBVSxJQUFJLFdBQVcsS0FBSyxVQUFVLDZCQUE2QixLQUFLLGNBQWMsR0FBRyxJQUFJLElBQUksa0JBQWtCLEtBQUssbUJBQW1CLHFCQUFxQixLQUFLLHlCQUF5QixHQUFHLENBQUM7QUFBQSxVQUN4UTtBQUFBLFFBQ0Q7QUFHQSxjQUFNLHdCQUF3QixLQUFLLHFCQUFxQixNQUFNLG9CQUFvQixNQUFNO0FBSXZGLGVBQUssMEJBQTBCO0FBQy9CLGVBQUssYUFBYTtBQUFBLFFBQ25CLENBQUM7QUFDRCxjQUFNLG9CQUFvQixRQUFRLFlBQVU7QUFDM0MsZ0JBQU0sZ0JBQWdCLEtBQUsscUJBQXFCLE1BQU0sU0FBUyxPQUFPLE9BQUssQ0FBQyxFQUFFLFdBQVcsQ0FBQztBQUMxRixjQUFJLGVBQWU7QUFDbkIsZ0JBQU0sZUFBa1UsQ0FBQztBQUN6VSxnQkFBTSxpQ0FBK0csQ0FBQztBQUN0SCxnQkFBTSxxQkFBcUIsb0JBQUksSUFBWTtBQUczQyxnQkFBTSxlQUFlLENBQUMsT0FBbUIsVUFBZSxVQUFrQjtBQUN6RSxrQkFBTSxZQUFZLFNBQVMsU0FBUztBQUNwQyxrQkFBTSxVQUFVLE1BQU0sZUFBZSxLQUFLLE1BQU07QUFDaEQsZ0JBQUksU0FBUyxVQUFVO0FBQ3RCLHNCQUFRLFNBQVMsYUFBYSxLQUFLLE1BQU07QUFDekMsb0JBQU0sVUFBVSxRQUFRLFNBQVMsc0JBQXNCLEtBQUssTUFBTTtBQUVsRSxvQkFBTUEsb0JBQW1CLHlCQUF5QixRQUFRLFNBQVMsU0FBUyxLQUFLO0FBQ2pGLGtCQUFJLFdBQVdBLHNCQUFxQixVQUFVLEtBQUssc0JBQXNCLElBQUksU0FBUyxHQUFHO0FBQ3hGLDJCQUFXLFFBQVEsUUFBUSxTQUFTLFNBQVMsT0FBTztBQUNuRCxzQkFBSSxLQUFLLFNBQVMsa0JBQWtCO0FBQ25DLHdCQUFJLG9CQUFvQixZQUFZLE1BQTZCLEVBQUUsTUFBTSxnQkFBZ0IsV0FBVyxDQUFDLEdBQUc7QUFDdkcscUNBQWU7QUFBQSxvQkFDaEI7QUFBQSxrQkFDRDtBQUFBLGdCQUNEO0FBQUEsY0FDRDtBQU1BLG9CQUFNLGlCQUFpQiwwQkFBMEIsUUFBUSxVQUFVLFFBQVEsU0FBUyxXQUFXO0FBQy9GLDZCQUFlLEtBQUssTUFBTTtBQUFBLFlBQzNCO0FBR0Esa0JBQU0sT0FBTyxLQUFLLG1CQUFtQixLQUFLO0FBTTFDLGtCQUFNLGVBQWUsS0FBSyx3QkFBd0IsV0FBVyxJQUFJO0FBQ2pFLGdCQUFJLGlCQUFpQixLQUFLLE9BQU87QUFDaEMsbUJBQUssc0JBQXNCLE9BQU8sU0FBUztBQUFBLFlBQzVDO0FBQ0Esa0JBQU0sU0FBUyxLQUFLO0FBQ3BCLGtCQUFNLG1CQUFtQixLQUFLO0FBQzlCLGtCQUFNLHNCQUFzQixLQUFLO0FBR2pDLGlCQUFLLHNCQUFzQixXQUFXLEtBQUssT0FBTyxtQkFBbUI7QUFFckUsa0JBQU0sT0FBTyxLQUFLLG1CQUFtQixJQUFJLFNBQVM7QUFDbEQsa0JBQU0sb0JBQW9CLHVCQUF1QjtBQUNqRCxrQkFBTSxvQkFBb0IsU0FBUyxVQUFhLEtBQUssVUFBVSxnQkFBZ0IsaUJBQWlCO0FBS2hHLGtCQUFNLFlBQVksaUJBQWlCLDZCQUE2QixLQUFLLGNBQWMsU0FBUyxJQUFJO0FBQ2hHLGtCQUFNLHFCQUFxQixDQUFDLHFCQUFxQixTQUFTLFVBQWEsaUJBQWlCLGdDQUNsRixVQUFVLFFBQVEsS0FBSyxVQUFVLGNBQWMsS0FBSyxhQUFhLHFCQUFxQixLQUFLO0FBU2pHLGtCQUFNLDhCQUE4QixDQUFDLHFCQUFxQixTQUFTLFVBQWEsaUJBQWlCLFVBQVUsQ0FBQyxDQUFDLHFCQUFxQixzQkFBc0IsS0FBSyx1QkFBdUIsS0FBSyxpQ0FBaUMsSUFBSSxTQUFTO0FBQ3ZPLGtCQUFNLGVBQWUscUJBQXFCLHNCQUFzQjtBQUNoRSxnQkFBSSxjQUFjO0FBQ2pCLG1CQUFLLFdBQVcsTUFBTSxpQ0FBaUMsVUFBVSxNQUFNLEdBQUcsQ0FBQyxJQUFJLE1BQU0sS0FBSyxTQUFJLFlBQVksa0JBQWtCLGtCQUFrQixtQkFBbUIsMkJBQTJCLGNBQWMsQ0FBQyxDQUFDLE1BQU0sRUFBRTtBQUVwTixrQkFBSSxpQkFBaUIsY0FBYyxDQUFDLEtBQUssbUJBQW1CLElBQUksU0FBUyxHQUFHO0FBQzNFLHFCQUFLLHVCQUF1QixTQUFTO0FBTXJDLHFCQUFLLGVBQWUsS0FBSyxZQUFZLFNBQVMsQ0FBQztBQUMvQyxxQkFBSyxpQ0FBaUMsSUFBSSxTQUFTO0FBQUEsY0FDcEQ7QUFFQSxrQkFBSSxpQkFBaUIsVUFBVSxDQUFDLENBQUMsbUJBQW1CO0FBQ25ELHFCQUFLLGlDQUFpQyxPQUFPLFNBQVM7QUFBQSxjQUN2RDtBQUNBLG9CQUFNLGVBQWUsS0FBSyx1QkFBdUIsSUFBSSxTQUFTO0FBQzlELGtCQUFJLGNBQWM7QUFDakIscUJBQUssV0FBVyxNQUFNLDZEQUE2RCxVQUFVLE1BQU0sR0FBRyxDQUFDLEVBQUU7QUFDekcsNkJBQWEsWUFBWTtBQUN6QixxQkFBSyx1QkFBdUIsT0FBTyxTQUFTO0FBQUEsY0FDN0MsT0FBTztBQUNOLDZCQUFhLEtBQUssRUFBRSxXQUFXLGNBQWMsT0FBTyxRQUFRLGtCQUFrQixxQkFBcUIsV0FBVyxNQUFNLFNBQVMsY0FBYyxZQUFZLE1BQU0sVUFBVSxJQUFJLHNCQUFzQixNQUFNLGtCQUFrQixxQkFBcUIsTUFBTSx1QkFBdUIsSUFBSSxXQUFXLGVBQWUsTUFBTSxhQUFhLEdBQUcsQ0FBQztBQUFBLGNBQ2pVO0FBQUEsWUFDRDtBQUNBLGdCQUFJLGlCQUFpQixXQUFXO0FBSS9CLG9CQUFNLG9CQUFvQixxQkFBcUIsS0FBSyx5QkFBeUIsSUFBSSxTQUFTLEtBQUssTUFBTSx1QkFBdUI7QUFDNUgsbUJBQUssbUJBQW1CLElBQUksV0FBVyxFQUFFLE9BQU8sY0FBYyxRQUFRLFVBQVUsSUFBSSxXQUFXLGtCQUFrQixxQkFBcUIsa0JBQWtCLENBQUM7QUFJekosa0JBQUksaUJBQWlCLDRCQUE0QjtBQUNoRCxxQkFBSyxpQkFBaUIsT0FBTyxLQUFLLFlBQVksU0FBUyxDQUFDO0FBR3hELG9CQUFJLE1BQU0sVUFBVSw0QkFBNEI7QUFDL0MsdUJBQUssc0JBQXNCLFNBQVM7QUFBQSxnQkFDckM7QUFBQSxjQUNELFdBQVcsU0FBUyxVQUFhLGNBQWMsS0FBSyxXQUFXO0FBSzlELHFCQUFLLGlCQUFpQixPQUFPLEtBQUssWUFBWSxTQUFTLENBQUM7QUFDeEQscUJBQUssc0JBQXNCLFNBQVM7QUFBQSxjQUNyQztBQUFBLFlBQ0Q7QUFFQSxnQkFBSSxpQkFBaUIsNEJBQTRCO0FBQ2hELDZDQUErQixLQUFLLEVBQUUsV0FBVyxPQUFPLFFBQVEsWUFBWSxhQUFhLENBQUM7QUFBQSxZQUMzRjtBQUFBLFVBQ0Q7QUFHQSxxQkFBVyxLQUFLLGVBQWU7QUFDOUIsK0JBQW1CLElBQUksRUFBRSxTQUFTLFNBQVMsQ0FBQztBQUM1QyxrQkFBTSxRQUFRLEtBQUssWUFBWSxXQUFXLEVBQUUsUUFBUTtBQUNwRCxnQkFBSSxPQUFPO0FBQ1YsMkJBQWEsT0FBTyxFQUFFLFVBQVUsRUFBRSxTQUFTLGtCQUFrQjtBQUFBLFlBQzlELE9BQU87QUFFTixvQkFBTSxZQUFZLEVBQUUsU0FBUyxTQUFTO0FBQ3RDLG9CQUFNLGVBQWUsRUFBRSxXQUFXLG1CQUFtQixhQUFhLGFBQy9ELEVBQUUsV0FBVyxtQkFBbUIsYUFBYSw2QkFDNUMsRUFBRSxXQUFXLG1CQUFtQixZQUFZLFNBQzNDO0FBSUwsbUJBQUssc0JBQXNCLFdBQVcsY0FBYyxNQUFTO0FBQzdELGtCQUFJLEVBQUUsV0FBVyxtQkFBbUIsWUFBWTtBQUMvQyxxQkFBSyxtQkFBbUIsRUFBRSxRQUFRO0FBQUEsY0FDbkM7QUFFQSxvQkFBTSxPQUFPLEtBQUssbUJBQW1CLElBQUksU0FBUztBQUNsRCxvQkFBTSxvQkFBb0IsU0FBUyxVQUFhLEtBQUssVUFBVSxnQkFBZ0IsaUJBQWlCO0FBSWhHLGtCQUFJLHFCQUFxQixpQkFBaUIsWUFBWTtBQUNyRCxxQkFBSyxpQ0FBaUMsSUFBSSxTQUFTO0FBQUEsY0FDcEQ7QUFPQSxrQkFBSSxNQUFNLFVBQVUsOEJBQThCLGlCQUFpQiw4QkFBOEIsaUJBQWlCLFdBQVc7QUFDNUgscUJBQUssaUJBQWlCLE9BQU8sS0FBSyxZQUFZLFNBQVMsQ0FBQztBQUN4RCxxQkFBSyxzQkFBc0IsU0FBUztBQUFBLGNBQ3JDO0FBVUEsa0JBQUkscUJBQXFCLGlCQUFpQixRQUFRO0FBQ2pELHNCQUFNLGdCQUFnQixLQUFLLHlCQUF5QixJQUFJLFNBQVM7QUFDakUsb0JBQUksQ0FBQyxlQUFlO0FBQ25CLHVCQUFLLG9DQUFvQyxFQUFFLFFBQVE7QUFDbkQ7QUFBQSxnQkFDRDtBQUNBLHFCQUFLLGlDQUFpQyxPQUFPLFNBQVM7QUFDdEQsb0JBQUksQ0FBQyxLQUFLLHVCQUF1QixJQUFJLFNBQVMsR0FBRztBQUNoRCwrQkFBYSxLQUFLLEVBQUUsV0FBVyxjQUFjLE9BQU8sRUFBRSxTQUFTLG9CQUFvQixxQkFBcUIsZUFBZSxXQUFXLE1BQU0sU0FBUyxjQUFjLFlBQVksTUFBTSxVQUFVLElBQUksc0JBQXNCLE1BQU0sa0JBQWtCLHFCQUFxQixNQUFNLHVCQUF1QixJQUFJLFdBQVcsSUFBSSxlQUFlLE1BQU0sYUFBYSxHQUFHLENBQUM7QUFBQSxnQkFDelY7QUFDQSxxQkFBSyxtQkFBbUIsSUFBSSxXQUFXLEVBQUUsT0FBTyxjQUFjLFFBQVEsSUFBSSxXQUFXLElBQUkscUJBQXFCLGlCQUFpQixHQUFHLENBQUM7QUFDbkk7QUFBQSxjQUNEO0FBRUEsa0JBQUksbUJBQW1CO0FBQ3RCLHNCQUFNLGVBQWUsS0FBSyx1QkFBdUIsSUFBSSxTQUFTO0FBQzlELG9CQUFJLGNBQWM7QUFDakIsK0JBQWEsWUFBWTtBQUN6Qix1QkFBSyx1QkFBdUIsT0FBTyxTQUFTO0FBQUEsZ0JBQzdDLE9BQU87QUFDTiwrQkFBYSxLQUFLLEVBQUUsV0FBVyxjQUFjLE9BQU8sRUFBRSxTQUFTLG9CQUFvQixXQUFXLE1BQU0sU0FBUyxjQUFjLFlBQVksTUFBTSxVQUFVLElBQUksc0JBQXNCLE1BQU0sa0JBQWtCLHFCQUFxQixNQUFNLHVCQUF1QixJQUFJLFdBQVcsSUFBSSxlQUFlLE1BQU0sYUFBYSxHQUFHLENBQUM7QUFBQSxnQkFDclQ7QUFBQSxjQUNEO0FBQ0Esa0JBQUksaUJBQWlCLFdBQVc7QUFHL0Isc0JBQU0sb0JBQW9CLEtBQUsseUJBQXlCLElBQUksU0FBUyxLQUFLLE1BQU0sdUJBQXVCO0FBQ3ZHLHFCQUFLLG1CQUFtQixJQUFJLFdBQVcsRUFBRSxPQUFPLGNBQWMsUUFBUSxJQUFJLFdBQVcsSUFBSSxxQkFBcUIsa0JBQWtCLENBQUM7QUFHakksb0JBQUksaUJBQWlCLDRCQUE0QjtBQUNoRCx1QkFBSyxpQkFBaUIsT0FBTyxLQUFLLFlBQVksU0FBUyxDQUFDO0FBQUEsZ0JBSXpEO0FBQUEsY0FDRDtBQUNBLGtCQUFJLGlCQUFpQiw0QkFBNEI7QUFDaEQsK0NBQStCLEtBQUssRUFBRSxXQUFXLE9BQU8sRUFBRSxTQUFTLG9CQUFvQixRQUFRLFFBQVcsWUFBWSxrQkFBa0IsQ0FBQztBQUFBLGNBQzFJO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFHQSxxQkFBVyxhQUFhLEtBQUssWUFBWSxXQUFXLEtBQUssTUFBTSxHQUFHO0FBQ2pFLGtCQUFNLE1BQU0sVUFBVSxnQkFBZ0IsU0FBUztBQUMvQyxnQkFBSSxtQkFBbUIsSUFBSSxHQUFHLEdBQUc7QUFBRTtBQUFBLFlBQVU7QUFDN0MsZ0JBQUksVUFBVSxZQUFZLEVBQUUsV0FBVyxHQUFHO0FBQUU7QUFBQSxZQUFVO0FBQ3RELCtCQUFtQixJQUFJLEdBQUc7QUFDMUIseUJBQWEsV0FBVyxVQUFVLGlCQUFpQixVQUFVLFNBQVMsTUFBTTtBQUFBLFVBQzdFO0FBRUEsY0FBSSxjQUFjO0FBQ2pCLHVCQUFXLE1BQU0sS0FBSyxrQkFBa0IsR0FBRyxHQUFHO0FBQUEsVUFDL0M7QUFJQSxlQUFLLG9CQUFvQixrQkFBa0I7QUFFM0MsY0FBSSxhQUFhLFNBQVMsR0FBRztBQWE1Qix1QkFBVyxVQUFVLGNBQWM7QUFDbEMsb0JBQU0sV0FBVyxLQUFLLHFCQUFxQixJQUFJLE9BQU8sU0FBUztBQUMvRCxtQkFBSyxxQkFBcUIsSUFBSSxPQUFPLFdBQVcsV0FDN0MsRUFBRSxHQUFHLFFBQVEsV0FBVyxTQUFTLFdBQVcsWUFBWSxTQUFTLFlBQVksc0JBQXNCLFNBQVMsc0JBQXNCLHFCQUFxQixTQUFTLHFCQUFxQixlQUFlLFNBQVMsY0FBYyxJQUMzTixNQUFNO0FBQUEsWUFDVjtBQUNBLGlCQUFLLHlCQUF5QjtBQUFBLFVBQy9CLE9BQU87QUFDTixpQkFBSyxhQUFhO0FBQUEsVUFDbkI7QUFRQSxxQkFBVyxLQUFLLGdDQUFnQztBQUMvQyxpQkFBSyw4QkFBOEIsRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFLFVBQVU7QUFBQSxVQUN0RTtBQUVBLGdCQUFNLGVBQWUsSUFBSSxJQUFJLCtCQUErQixJQUFJLE9BQUssRUFBRSxTQUFTLENBQUM7QUFHakYsZUFBSyxpQ0FBaUMsWUFBWTtBQUNsRCxxQkFBVyxNQUFNLENBQUMsR0FBRyxLQUFLLDRCQUE0QixLQUFLLENBQUMsR0FBRztBQUM5RCxnQkFBSSxDQUFDLGFBQWEsSUFBSSxFQUFFLEdBQUc7QUFDMUIsb0JBQU0sSUFBSSxLQUFLLDRCQUE0QixJQUFJLEVBQUU7QUFDakQsa0JBQUksR0FBRztBQUFFLDZCQUFhLENBQUM7QUFBQSxjQUFHO0FBQzFCLG1CQUFLLDRCQUE0QixPQUFPLEVBQUU7QUFBQSxZQUMzQztBQUFBLFVBQ0Q7QUFFQSxxQkFBVyxNQUFNLENBQUMsR0FBRyxLQUFLLGdCQUFnQixLQUFLLENBQUMsR0FBRztBQUNsRCxnQkFBSSxDQUFDLGFBQWEsSUFBSSxFQUFFLEdBQUc7QUFDMUIsbUJBQUssZ0JBQWdCLElBQUksRUFBRSxFQUFHLFFBQVE7QUFDdEMsbUJBQUssZ0JBQWdCLE9BQU8sRUFBRTtBQUFBLFlBQy9CO0FBQUEsVUFDRDtBQUFBLFFBQ0QsQ0FBQztBQUlELGNBQU0sd0JBQXdCLElBQUksZ0JBQWdCO0FBQ2xELDhCQUFzQixJQUFJLHFCQUFxQjtBQUMvQyw4QkFBc0IsSUFBSSxpQkFBaUI7QUFDM0MsOEJBQXNCLElBQUkseUJBQXlCLEtBQUssU0FBVSxNQUFNLEtBQUssMEJBQTBCLEdBQUcsR0FBSSxDQUFDO0FBQy9HLGFBQUssd0JBQXdCLFFBQVE7QUFFckMsYUFBSyxrQkFBa0IsVUFBVTtBQUNqQyxhQUFLLFlBQVksSUFBSSxvQkFBb0IsTUFBUztBQUNsRCxhQUFLLFlBQVksSUFBSSxRQUFRLE1BQVM7QUFHdEMsYUFBSyw0QkFBNEIsS0FBSyxnQ0FBZ0MsVUFBVTtBQUNoRixhQUFLLFdBQVcsTUFBTSxpQ0FBaUMsVUFBVSxjQUFjLEtBQUssb0JBQW9CLENBQUMsY0FBYyxLQUFLLHlCQUF5QixFQUFFO0FBQ3ZKLFlBQUksS0FBSywyQkFBMkI7QUFDbkMsZUFBSyx1QkFBdUIsSUFBSSxrQkFBa0IsTUFBTTtBQUN2RCxnQkFBSSxLQUFLLDZCQUE2QixLQUFLLGFBQWEsSUFBSSxHQUFHO0FBQzlELG1CQUFLLFdBQVcsTUFBTSw2RUFBNkU7QUFDbkcsbUJBQUssNEJBQTRCO0FBQ2pDLG1CQUFLLGlCQUFpQixTQUFTO0FBQUEsWUFDaEM7QUFBQSxVQUNELEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDUjtBQUFBLE1BQ0QsT0FBTztBQUNOLGFBQUs7QUFDTCxZQUFJLEtBQUssa0JBQWtCO0FBQUEsUUFJM0IsV0FBVyxDQUFDLEtBQUssbUJBQW1CLGVBQWU7QUFDbEQsZUFBSyxXQUFXO0FBQUEsUUFDakIsV0FBVyxLQUFLLGFBQWEsSUFBSSxHQUFHO0FBQ25DLGVBQUssa0JBQWtCO0FBQUEsUUFDeEIsT0FBTztBQUdOLGVBQUssa0JBQWtCLFlBQVk7QUFDbkMsc0JBQVksUUFBTTtBQUNqQixpQkFBSyxjQUFjLElBQUksT0FBTyxFQUFFO0FBQ2hDLGlCQUFLLGdCQUFnQixJQUFJLE1BQU0sRUFBRTtBQUFBLFVBQ2xDLENBQUM7QUFDRCxlQUFLLFlBQVksSUFBSSxRQUFRLE1BQVM7QUFDdEMsZUFBSyxZQUFZLElBQUksbUJBQW1CLE1BQVM7QUFBQSxRQUNsRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUtGLFNBQUssdUJBQXVCLElBQUksS0FBSyxtQkFBbUIsY0FBYyxNQUFNO0FBQzNFLFdBQUssV0FBVyxNQUFNLDRDQUE0QyxLQUFLLHlCQUF5QixtQkFBbUIsS0FBSyx5QkFBeUIsSUFBSSx1QkFBdUIsS0FBSyxvQkFBb0IsSUFBSSxFQUFFO0FBTzNNLFVBQUksV0FBVztBQUNmLFVBQUksS0FBSyx5QkFBeUIsT0FBTyxHQUFHO0FBQzNDLGNBQU0sVUFBVSxDQUFDLEdBQUcsS0FBSyx5QkFBeUIsUUFBUSxDQUFDO0FBQzNELGFBQUsseUJBQXlCLE1BQU07QUFDcEMsbUJBQVcsQ0FBQyxXQUFXLElBQUksS0FBSyxTQUFTO0FBQ3hDLHFCQUFXLEtBQUssdUJBQXVCLFdBQVcsSUFBSSxLQUFLO0FBQUEsUUFDNUQ7QUFBQSxNQUNEO0FBSUEsVUFBSSxLQUFLLG9CQUFvQixPQUFPLEdBQUc7QUFDdEMsY0FBTSxlQUFlLENBQUMsR0FBRyxLQUFLLG9CQUFvQixLQUFLLENBQUM7QUFDeEQsbUJBQVcsY0FBYyxjQUFjO0FBQ3RDLHFCQUFXLEtBQUssd0JBQXdCLFVBQVUsS0FBSztBQUFBLFFBQ3hEO0FBQUEsTUFDRDtBQUNBLFVBQUksS0FBSyw2QkFBNkIsQ0FBQyxVQUFVO0FBQ2hELGFBQUssNEJBQTRCO0FBQ2pDLGFBQUssaUJBQWlCLFNBQVM7QUFBQSxNQUNoQyxXQUFXLFVBQVU7QUFDcEIsYUFBSyw0QkFBNEI7QUFBQSxNQUNsQztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsU0FBSyx1QkFBdUIsSUFBSSxLQUFLLG1CQUFtQixVQUFVLE9BQUssS0FBSyxlQUFlLENBQUMsQ0FBQyxDQUFDO0FBRzlGLFNBQUssdUJBQXVCLElBQUksS0FBSyxtQkFBbUIsZUFBZSxPQUFLO0FBQzNFLFdBQUssb0JBQW9CLENBQUM7QUFBQSxJQUMzQixDQUFDLENBQUM7QUFDRixTQUFLLHVCQUF1QixJQUFJLEtBQUssbUJBQW1CLHFCQUFxQixPQUFLO0FBQ2pGLFdBQUssd0JBQXdCLEtBQUssWUFBWSxFQUFFLGVBQWUsR0FBRyxFQUFFLGVBQWUsTUFBUztBQUFBLElBQzdGLENBQUMsQ0FBQztBQUNGLFNBQUssdUJBQXVCLElBQUksS0FBSyxtQkFBbUIsdUJBQXVCLE9BQUs7QUFDbkYsV0FBSyw0QkFBNEIsQ0FBQztBQUFBLElBQ25DLENBQUMsQ0FBQztBQUlGLFNBQUssdUJBQXVCLElBQUksS0FBSyxtQkFBbUIsZ0JBQWdCLFdBQVM7QUFDaEYsV0FBSyxzQkFBc0I7QUFDM0IsV0FBSyw0QkFBNEI7QUFDakMsWUFBTSxTQUFTLE1BQU0sVUFBVSxLQUFLO0FBQ3BDLFVBQUksVUFBVSxLQUFLLHlCQUF5QixXQUFXLFFBQVE7QUFDOUQsYUFBSyx3QkFBd0IsTUFBTTtBQUFBLE1BQ3BDO0FBQ0EsV0FBSyxlQUFlO0FBQUEsSUFDckIsQ0FBQyxDQUFDO0FBTUYsU0FBSyx1QkFBdUIsSUFBSSxLQUFLLG1CQUFtQixnQkFBZ0IsT0FBSyxLQUFLLHFCQUFxQixDQUFDLENBQUMsQ0FBQztBQVMxRyxTQUFLLHVCQUF1QixJQUFJLEtBQUssbUJBQW1CLGdCQUFnQixPQUFLLEtBQUsscUJBQXFCLENBQUMsQ0FBQyxDQUFDO0FBRzFHLFNBQUssdUJBQXVCLElBQUksS0FBSyxtQkFBbUIsZ0JBQWdCLE9BQUs7QUFDNUUsVUFBSSxLQUFLLG9CQUFvQixDQUFDLEdBQUc7QUFDaEM7QUFBQSxNQUNEO0FBQ0EsWUFBTSxxQkFBcUIsRUFBRSxhQUFhLEtBQUssNEJBQTRCLElBQUksRUFBRSxVQUFVLElBQUk7QUFDL0YsWUFBTSxtQkFBa0UsRUFBRSxhQUFhLEVBQUUsZ0JBQWdCLEVBQUUsYUFBYSxTQUNySCxFQUFFLFdBQVcsRUFBRSxXQUFXLGNBQWMsRUFBRSxjQUFjLFVBQVUsRUFBRSxTQUFTLElBQzdFO0FBQ0gsWUFBTSxnQkFBZ0IsRUFBRSxpQkFBaUIsb0JBQW9CO0FBQzdELFlBQU0sb0JBQW9ELGdCQUN2RDtBQUFBLFFBQ0QsTUFBTTtBQUFBLFFBQ04sWUFBWSxvQkFBb0Isb0JBQW9CO0FBQUEsUUFDcEQsWUFBWSxFQUFFO0FBQUEsTUFDZixJQUNFO0FBQ0gsWUFBTSx3QkFBd0IsbUJBQW1CLFNBQVM7QUFDMUQsVUFBSSx5QkFBeUIsRUFBRSxTQUFTO0FBQ3ZDLGFBQUssV0FBVyxNQUFNLDZDQUE2QyxFQUFFLFVBQVUsZUFBZSxrQkFBa0IsWUFBWSxhQUFhLFdBQVcsVUFBVSxrQkFBa0IsWUFBWSxnQkFBZ0IsV0FBVyxhQUFhLGtCQUFrQixZQUFZLFlBQVksQ0FBQyxnQkFBZ0Isa0JBQWtCLGNBQWMsUUFBUSxXQUFXLEtBQUssVUFBVSxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUU7QUFBQSxNQUN2WDtBQUVBLFVBQUksRUFBRSxnQkFBZ0IsS0FBSyxtQkFBbUI7QUFDN0MsY0FBTSxPQUFPLEtBQUssa0NBQWtDLEtBQUssc0JBQ3RELEtBQUssaUNBQWlDLEtBQUssc0JBQXNCO0FBQ3BFLGNBQU0sTUFBTSxLQUFLLElBQUksSUFBSSxLQUFLO0FBQzlCLGFBQUssaUJBQWlCLFdBQTBELGdCQUFnQjtBQUFBLFVBQy9GLDRCQUE0QjtBQUFBLFVBQzVCLGdCQUFnQjtBQUFBLFFBQ2pCLENBQUM7QUFDRCxhQUFLLG9CQUFvQjtBQUFBLE1BQzFCO0FBT0EsWUFBTSxrQkFBa0IsS0FBSyxvQkFBb0IsRUFBRSxlQUFlO0FBTWxFLFVBQUksRUFBRSxlQUFlLFVBQWEsS0FBSyw4QkFBOEIsSUFBSSxFQUFFLFVBQVUsR0FBRztBQUN2RixZQUFJLEVBQUUsU0FBUztBQUNkLGVBQUssOEJBQThCLE9BQU8sRUFBRSxVQUFVO0FBQUEsUUFDdkQ7QUFDQTtBQUFBLE1BQ0Q7QUFDQSxVQUFJLEVBQUUsT0FBTztBQUNaLGFBQUssb0NBQW9DLEVBQUUsVUFBVTtBQUFBLE1BQ3REO0FBQ0EsVUFBSSx5QkFBeUIsc0JBQXNCLEVBQUUsV0FBVyxDQUFDLEVBQUUsU0FBUyxDQUFDLG1CQUFtQixrQkFBa0I7QUFDakgsWUFBSSxFQUFFLFlBQVk7QUFDakIsZUFBSyxnQ0FBZ0MsRUFBRSxZQUFZLGtCQUFrQjtBQUNyRSxlQUFLLHVCQUF1QixPQUFPLEVBQUUsVUFBVTtBQUMvQyxlQUFLLGdCQUFnQixPQUFPLEVBQUUsVUFBVTtBQUFBLFFBQ3pDO0FBQ0E7QUFBQSxNQUNEO0FBV0EsWUFBTSxnQkFBZ0IsS0FBSyxlQUFlLEVBQUUsWUFBWSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLE9BQU87QUFDaEgsWUFBTSxRQUFRLGdCQUFnQixRQUFRLEtBQUssMkJBQTJCLEVBQUUsWUFBWSxpQkFBaUIsRUFBRSxZQUFZO0FBQ25ILFVBQUksRUFBRSxnQkFBZ0IsRUFBRSxTQUFTO0FBQ2hDLGFBQUssV0FBVyxNQUFNLDBDQUEwQyxtQkFBbUIsUUFBUSxlQUFlLEVBQUUsWUFBWSxNQUFNLEdBQUcsQ0FBQyxLQUFLLFFBQVEsVUFBVSxLQUFLLGdCQUFnQixLQUFLLFFBQVEsWUFBWSxLQUFLLHFCQUFxQixLQUFLLFFBQVEsYUFBYSxLQUFLLHVCQUF1QixRQUFRLGFBQWEsS0FBSyw0QkFBNEIsUUFBUSxpQkFBaUIsRUFBRSxZQUFZLFlBQVksRUFBRSxPQUFPLGFBQWEsS0FBSyxzQkFBc0IsZ0JBQWdCLGFBQWEsVUFBVSxLQUFLLEVBQUU7QUFBQSxNQUNoZTtBQUNBLFVBQUksZUFBZTtBQUdsQixhQUFLLFdBQVcsTUFBTSw2Q0FBNkMsZUFBZSxlQUFlLEVBQUUsWUFBWSxNQUFNLEdBQUcsQ0FBQyxLQUFLLFFBQVEsaUJBQWlCLEVBQUUsWUFBWSxZQUFZLEVBQUUsT0FBTyxFQUFFO0FBQUEsTUFDN0wsV0FBVyxTQUFTLHVCQUF1QjtBQUMxQyxZQUFJLEVBQUUsY0FBYyxvQkFBb0I7QUFDdkMsZUFBSyxnQ0FBZ0MsRUFBRSxZQUFZLGtCQUFrQjtBQUNyRSxlQUFLLHVCQUF1QixPQUFPLEVBQUUsVUFBVTtBQUFBLFFBQ2hEO0FBQ0E7QUFBQSxNQUNELFdBQVcsT0FBTztBQUNqQixhQUFLLGVBQWUsaUJBQWtCLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLFlBQVksRUFBRSxNQUFNO0FBQUEsTUFDL0csT0FBTztBQUNOLFlBQUksRUFBRSxTQUFTLENBQUMsdUJBQXVCO0FBQ3RDLGVBQUssMkJBQTJCO0FBQUEsUUFDakM7QUFPQSxZQUFJLEVBQUUsZ0JBQWdCLG1CQUFtQixLQUFLLG1CQUFtQixJQUFJLGVBQWUsS0FDaEYsQ0FBQyxLQUFLLDJCQUEyQixpQkFBaUIsRUFBRSxVQUFVLEdBQUc7QUFDcEUsZUFBSyx1QkFBdUIsZUFBZTtBQUFBLFFBQzVDO0FBQ0EsYUFBSyxjQUFjLGlCQUFpQixFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsU0FBUyxFQUFFLFlBQVksRUFBRSxZQUFZLGlCQUFpQjtBQUNySCxZQUFJLEVBQUUsU0FBUztBQUNkLGVBQUssZUFBZSxPQUFPLG1CQUFtQixFQUFFO0FBV2hELGdCQUFNLGlCQUFpQixtQkFBbUIsS0FBSyw0QkFBNEIsS0FBSyxnQkFBZ0I7QUFDaEcsY0FBSSxDQUFDLHlCQUF5QixrQkFBa0IsRUFBRSxZQUFZO0FBQzdELGtCQUFNLFFBQVEsS0FBSyxxQkFBcUIsRUFBRSxVQUFVO0FBQ3BELGdCQUFJLE9BQU87QUFDVixvQkFBTSxXQUFXLEtBQUssWUFBWSxjQUFjO0FBQ2hELG1CQUFLLHlCQUF5QixJQUFJLFVBQVUsS0FBSztBQUNqRCxtQkFBSyxzQkFBc0IsSUFBSSxVQUFVLEVBQUUsWUFBWSxPQUFPLElBQUksS0FBSyxJQUFJLEVBQUUsQ0FBQztBQUFBLFlBQy9FO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsVUFBSSxDQUFDLHlCQUF5QixFQUFFLFdBQVcsRUFBRSxZQUFZO0FBQ3hELGFBQUssYUFBYSxhQUFhLEVBQUUsVUFBVTtBQUFBLE1BQzVDO0FBU0EsVUFBSSxFQUFFLFdBQVcsRUFBRSxZQUFZO0FBQzlCLGFBQUssZ0JBQWdCLE9BQU8sRUFBRSxVQUFVO0FBQUEsTUFDekM7QUFBQSxJQUNELENBQUMsQ0FBQztBQVNGLFNBQUssdUJBQXVCLElBQUksS0FBSyxtQkFBbUIsV0FBVyxPQUFLO0FBQ3ZFLFdBQUssV0FBVyxNQUFNLG1DQUFtQyxFQUFFLElBQUksc0JBQXNCLE9BQU8sRUFBRSxPQUFPLG1CQUFtQixNQUFNLFdBQVcsT0FBTyxFQUFFLEtBQUssbUJBQW1CLENBQUMsRUFBRSxNQUFNLEdBQUcsSUFBSSxRQUFRLGFBQWEsS0FBSyxvQkFBb0IsR0FBRyxNQUFNLEdBQUcsS0FBSyxRQUFRLEVBQUU7QUFDblEsWUFBTSxlQUFlO0FBQUEsUUFDcEI7QUFBQSxRQUNBO0FBQUEsUUFBb0I7QUFBQSxRQUF1QjtBQUFBLFFBQzNDO0FBQUEsUUFDQTtBQUFBLFFBQXdCO0FBQUEsUUFDeEI7QUFBQSxNQUNEO0FBQ0EsVUFBSSxFQUFFLFNBQVMsZ0JBQWdCO0FBSTlCLFlBQUksS0FBSyxJQUFJLElBQUksS0FBSywwQkFBMEI7QUFDL0MsZUFBSyxXQUFXLE1BQU0sK0RBQStEO0FBQ3JGLGVBQUssbUJBQW1CLGVBQWUsRUFBRSxRQUFRLElBQUk7QUFDckQ7QUFBQSxRQUNEO0FBQ0EsY0FBTSxVQUFVLE9BQU8sRUFBRSxPQUFPLE1BQU0sTUFBTSxXQUFZLEVBQUUsS0FBSyxNQUFNLElBQWU7QUFHcEYsY0FBTSxPQUFPLEtBQUssaUJBQWlCLE9BQU87QUFDMUMsWUFBSSxTQUFTLFdBQVcsRUFBRSxNQUFNO0FBQy9CLFlBQUUsS0FBSyxNQUFNLElBQUk7QUFBQSxRQUNsQjtBQUNBLGFBQUssWUFBWSxJQUFJLHlCQUF5QixlQUFlLEVBQUUsSUFBSSxHQUFHLE1BQVM7QUFDL0UsYUFBSyxjQUFjLG1CQUFtQixLQUFLLHVCQUF1QixFQUFFLE1BQU0sRUFBRSxJQUFJLEdBQUc7QUFBQSxVQUNsRixVQUFVLEVBQUU7QUFBQSxVQUNaLFVBQVUsRUFBRTtBQUFBLFFBQ2IsQ0FBQztBQUNELGFBQUssa0JBQWtCO0FBQ3ZCLGNBQU0sY0FBYyxLQUFLLEtBQUssSUFDM0IsS0FBSyx5QkFBeUIsSUFBSSxJQUNsQyxRQUFRLFFBQVE7QUFDbkIsb0JBQVksUUFBUSxNQUFNO0FBQ3pCLGVBQUssbUJBQW1CLGVBQWUsRUFBRSxRQUFRLElBQUk7QUFDckQsZUFBSyxZQUFZLElBQUksUUFBUSxNQUFTO0FBQ3RDLGVBQUssWUFBWSxJQUFJLG9CQUFvQixNQUFTO0FBQ2xELGVBQUssYUFBYTtBQUFBLFFBQ25CLENBQUM7QUFDRDtBQUFBLE1BQ0Q7QUFDQSxVQUFJLGFBQWEsU0FBUyxFQUFFLElBQUksR0FBRztBQUVsQyxjQUFNLGVBQWUsQ0FBQyxvQkFBb0IsdUJBQXVCLG9CQUFvQjtBQUNyRixZQUFJLGFBQWEsU0FBUyxFQUFFLElBQUksR0FBRztBQUNsQyxlQUFLLHlCQUF5QixpQkFBaUIsQ0FBQyxFQUFFLEtBQUssWUFBVTtBQUNoRSxpQkFBSyxtQkFBbUIsZUFBZSxFQUFFLFFBQVEsTUFBTTtBQUFBLFVBQ3hELEdBQUcsU0FBTztBQUVULGlCQUFLLFdBQVcsTUFBTSx3QkFBd0IsRUFBRSxJQUFJLG9CQUFvQixHQUFHO0FBQzNFLGlCQUFLLG1CQUFtQixlQUFlLEVBQUUsUUFBUSxPQUFPO0FBQUEsVUFDekQsQ0FBQztBQUNEO0FBQUEsUUFDRDtBQUNBLGFBQUssWUFBWSxJQUFJLHlCQUF5QixlQUFlLEVBQUUsSUFBSSxHQUFHLE1BQVM7QUFDL0UsYUFBSyxjQUFjLG1CQUFtQixLQUFLLHVCQUF1QixFQUFFLE1BQU0sRUFBRSxJQUFJLEdBQUc7QUFBQSxVQUNsRixVQUFVLEVBQUU7QUFBQSxVQUNaLFVBQVUsRUFBRTtBQUFBLFFBQ2IsQ0FBQztBQUVELFlBQUksS0FBSyxVQUFVO0FBQ2xCLGVBQUssV0FBVztBQUFBLFFBQ2pCO0FBQ0EsYUFBSyx5QkFBeUI7QUFDOUIsYUFBSyxrQkFBa0I7QUFDdkIsY0FBTSxTQUFTLE1BQVk7QUFDMUIsZUFBSyxZQUFZLElBQUksUUFBUSxNQUFTO0FBQ3RDLGVBQUssWUFBWSxJQUFJLG9CQUFvQixNQUFTO0FBQ2xELGVBQUssYUFBYTtBQUFBLFFBQ25CO0FBQ0EsWUFBSSxFQUFFLFNBQVMsc0JBQXNCO0FBSXBDLGdCQUFNLFdBQVcsRUFBRSxPQUFPLFVBQVU7QUFDcEMsZ0JBQU0sZUFBZSxZQUFZLE9BQU8sYUFBYSxZQUFZLENBQUMsTUFBTSxRQUFRLFFBQVEsSUFDcEYsU0FBcUMsTUFBTSxJQUM1QztBQUNILGVBQUsseUJBQXlCLGlCQUFpQixDQUFDLEVBQUUsS0FBSyxZQUFVO0FBQ2hFLGlCQUFLLFdBQVcsTUFBTSxtQ0FBbUMsT0FBTyxZQUFZLENBQUMsT0FBTyxPQUFPLEVBQUUsV0FBVyxPQUFPLFVBQVUsUUFBUSxzQkFBc0IsT0FBTyxFQUFFLE9BQU8sbUJBQW1CLE1BQU0sV0FBVyxPQUFPLEVBQUUsS0FBSyxtQkFBbUIsQ0FBQyxFQUFFLE1BQU0sR0FBRyxJQUFJLFFBQVEsRUFBRTtBQUN0USxnQkFBSSxpQkFBaUIsYUFBYSxpQkFBaUIsVUFBVTtBQUM1RCxtQkFBSyxpQkFBaUIsV0FBb0UscUJBQXFCO0FBQUEsZ0JBQzlHLFVBQVUsRUFBRTtBQUFBLGdCQUNaLFVBQVUsaUJBQWlCO0FBQUEsY0FDNUIsQ0FBQztBQUFBLFlBQ0Y7QUFDQSxpQkFBSyxtQkFBbUIsZUFBZSxFQUFFLFFBQVEsTUFBTTtBQUN2RCxtQkFBTztBQUFBLFVBQ1IsR0FBRyxTQUFPO0FBQ1QsaUJBQUssV0FBVyxNQUFNLDhDQUE4QyxHQUFHO0FBQ3ZFLGlCQUFLLG1CQUFtQixlQUFlLEVBQUUsUUFBUSxFQUFFLElBQUksT0FBTyxRQUFRLGNBQWMsQ0FBQztBQUNyRixtQkFBTztBQUFBLFVBQ1IsQ0FBQztBQUNEO0FBQUEsUUFDRDtBQUNBLGFBQUsseUJBQXlCLGlCQUFpQixDQUFDLEVBQUUsS0FBSyxZQUFVO0FBQ2hFLGVBQUssbUJBQW1CLGVBQWUsRUFBRSxRQUFRLE1BQU07QUFDdkQsaUJBQU87QUFBQSxRQUNSLEdBQUcsU0FBTztBQUVULGVBQUssV0FBVyxNQUFNLGdCQUFnQixFQUFFLElBQUksb0JBQW9CLEdBQUc7QUFDbkUsZUFBSyxtQkFBbUIsZUFBZSxFQUFFLFFBQVEsT0FBTztBQUN4RCxpQkFBTztBQUFBLFFBQ1IsQ0FBQztBQUFBLE1BQ0YsT0FBTztBQUlOLGFBQUssbUJBQW1CLGVBQWUsRUFBRSxRQUFRLElBQUk7QUFBQSxNQUN0RDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YsU0FBSyx1QkFBdUIsSUFBSSxLQUFLLG1CQUFtQixRQUFRLFlBQVU7QUFDekUsVUFBSSxDQUFDLEtBQUssY0FBYyxJQUFJLEdBQUc7QUFDOUIsYUFBSyxZQUFZLElBQUksU0FBUyxNQUFTO0FBQ3ZDLGFBQUssWUFBWSxJQUFJLFVBQVUsTUFBTSxJQUFJLE1BQVM7QUFBQSxNQUNuRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsU0FBSyx1QkFBdUIsSUFBSSxLQUFLLG1CQUFtQixrQkFBa0IsT0FBSztBQUM5RSxXQUFLLHVCQUF1QixFQUFFLE1BQU0sRUFBRSxNQUFNO0FBQUEsSUFDN0MsQ0FBQyxDQUFDO0FBRUYsVUFBTSxLQUFLLG1CQUFtQixRQUFRLFFBQVEsU0FBUztBQUN2RCxRQUFJLENBQUMsS0FBSyxjQUFjLElBQUksS0FBSyw2QkFBNkIsS0FBSywyQkFBMkI7QUFDN0Y7QUFBQSxJQUNEO0FBR0EsU0FBSyxvQkFBb0I7QUFBQSxFQUMxQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUVEsc0JBQTRCO0FBQ25DLFNBQUssaUJBQWlCLFFBQVEsa0JBQWtCLE1BQU07QUFDckQsVUFBSyxDQUFDLEtBQUssY0FBYyxJQUFJLEtBQUssQ0FBQyxLQUFLLGdCQUFnQixJQUFJLEtBQU0sS0FBSyxhQUFhLElBQUksR0FBRztBQUMxRjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLFdBQVcsS0FBSywyREFBMkQ7QUFDaEYsV0FBSyx1QkFBdUI7QUFBQSxJQUM3QixHQUFHLHVCQUF1QixtQkFBbUI7QUFBQSxFQUM5QztBQUFBLEVBRVEsdUJBQXVCLGFBQWEsTUFBWTtBQUN2RCxTQUFLLFdBQVc7QUFDaEIsUUFBSSxZQUFZO0FBQ2YsV0FBSyxvQkFBb0IsT0FBTztBQUFBLFFBQy9CLFVBQVUsU0FBUztBQUFBLFFBQ25CLFNBQVMsU0FBUyx1QkFBdUIsaURBQWlEO0FBQUEsTUFDM0YsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT1EsNENBQWtEO0FBQ3pELFVBQU0sYUFBYSxJQUFJLElBQUksS0FBSyxnQ0FBZ0MsSUFBSSxDQUFDO0FBQ3JFLGVBQVcsTUFBTSxLQUFLLDBCQUEwQixJQUFJLEdBQUc7QUFDdEQsaUJBQVcsSUFBSSxHQUFHLGdCQUFnQixTQUFTLENBQUM7QUFBQSxJQUM3QztBQUNBLFNBQUssZ0NBQWdDLElBQUksWUFBWSxNQUFTO0FBQUEsRUFDL0Q7QUFBQSxFQUVBLFdBQVcsU0FBa0MsWUFBa0I7QUFDOUQsU0FBSztBQUNMLFVBQU0sMEJBQTBCLFdBQVcsZUFBZSxLQUFLLGNBQWMsSUFBSSxLQUFLLEtBQUssYUFBYSxJQUFJLEtBQUssS0FBSyxnQkFBZ0IsSUFBSTtBQUMxSSxVQUFNLG1DQUFtQyxXQUFXLGNBQWMsS0FBSztBQUd2RSxRQUFJLEtBQUssd0JBQXdCO0FBQ2hDLFlBQU0sY0FBYyxLQUFLLE9BQU8sS0FBSyxJQUFJLElBQUksS0FBSywwQkFBMEIsR0FBSTtBQUNoRixXQUFLLGlCQUFpQixXQUFvRSxxQkFBcUI7QUFBQSxRQUM5RyxXQUFXLEtBQUs7QUFBQSxRQUNoQjtBQUFBLFFBQ0EsZ0JBQWdCLEtBQUs7QUFBQSxNQUN0QixDQUFDO0FBQ0QsV0FBSyx5QkFBeUI7QUFBQSxJQUMvQjtBQUVBLFNBQUssY0FBYyxJQUFJLE9BQU8sTUFBUztBQUN2QyxTQUFLLGdCQUFnQixJQUFJLE9BQU8sTUFBUztBQUN6QyxTQUFLLGlCQUFpQixNQUFNO0FBQzVCLFNBQUssd0JBQXdCLE1BQU07QUFDbkMsU0FBSyx1QkFBdUIsTUFBTTtBQUNsQyxTQUFLLG1CQUFtQixhQUFhO0FBQ3JDLFNBQUssa0JBQWtCLFlBQVk7QUFDbkMsU0FBSyxtQkFBbUIsV0FBVztBQUNuQyxTQUFLLFdBQVc7QUFDaEIsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyxvQkFBb0I7QUFDekIsU0FBSyx3QkFBd0I7QUFDN0IsU0FBSyx1QkFBdUI7QUFDNUIsU0FBSyxhQUFhLElBQUksT0FBTyxNQUFTO0FBQ3RDLFNBQUssWUFBWSxJQUFJLFFBQVEsTUFBUztBQUN0QyxTQUFLLFlBQVksSUFBSSxnQkFBZ0IsTUFBUztBQUM5QyxTQUFLLGlCQUFpQixJQUFJLENBQUMsR0FBRyxNQUFTO0FBQ3ZDLFNBQUssc0JBQXNCO0FBQzNCLFNBQUssb0JBQW9CO0FBQ3pCLFNBQUssd0JBQXdCO0FBQzdCLFNBQUssNEJBQTRCO0FBQ2pDLFNBQUssd0JBQXdCO0FBQzdCLFNBQUssWUFBWSxTQUFTO0FBQzFCLFNBQUssNEJBQTRCO0FBQ2pDLFNBQUssNkJBQTZCO0FBQ2xDLFNBQUssNEJBQTRCO0FBQ2pDLFNBQUsscUJBQXFCO0FBQzFCLFNBQUsseUJBQXlCO0FBQzlCLFNBQUsscUJBQXFCLE1BQU07QUFDaEMsU0FBSyx3QkFBd0I7QUFDN0IsU0FBSyx1QkFBdUIsTUFBTTtBQUNsQyxTQUFLLGVBQWUsTUFBTTtBQUMxQixTQUFLLHNCQUFzQjtBQUkzQixTQUFLLGVBQWUsSUFBSSxRQUFXLE1BQVM7QUFDNUMsU0FBSywwQ0FBMEM7QUFDL0MsU0FBSywwQkFBMEIsSUFBSSxDQUFDLEdBQUcsTUFBUztBQUtoRCxTQUFLLHNCQUFzQjtBQUMzQixTQUFLLDZCQUE2QjtBQUNsQyxTQUFLLHNCQUFzQixNQUFNO0FBQ2pDLFNBQUsscUJBQXFCLE1BQU07QUFDaEMsU0FBSyx1QkFBdUIsTUFBTTtBQUNsQyxTQUFLLDhCQUE4QixNQUFNO0FBQ3pDLFNBQUsseUJBQXlCLE1BQU07QUFDcEMsU0FBSywyQkFBMkI7QUFDaEMsU0FBSyxtQkFBbUIsTUFBTTtBQUM5QixlQUFXLEtBQUssS0FBSyx1QkFBdUIsT0FBTyxHQUFHO0FBQUUsbUJBQWEsQ0FBQztBQUFBLElBQUc7QUFDekUsU0FBSyx1QkFBdUIsTUFBTTtBQUNsQyxlQUFXLEtBQUssS0FBSyw0QkFBNEIsT0FBTyxHQUFHO0FBQUUsbUJBQWEsQ0FBQztBQUFBLElBQUc7QUFDOUUsU0FBSyw0QkFBNEIsTUFBTTtBQUN2QyxRQUFJLEtBQUssdUJBQXVCO0FBQUUsbUJBQWEsS0FBSyxxQkFBcUI7QUFBRyxXQUFLLHdCQUF3QjtBQUFBLElBQVc7QUFDcEgsU0FBSyxxQkFBcUIsTUFBTTtBQUNoQyxlQUFXLE9BQU8sS0FBSyxnQkFBZ0IsT0FBTyxHQUFHO0FBQUUsVUFBSSxRQUFRO0FBQUEsSUFBRztBQUNsRSxTQUFLLGdCQUFnQixNQUFNO0FBQzNCLFNBQUssbUJBQW1CLE1BQU07QUFDOUIsU0FBSyxzQkFBc0IsTUFBTTtBQUNqQyxTQUFLLGlDQUFpQyxNQUFNO0FBQzVDLFNBQUsseUJBQXlCLE1BQU07QUFDcEMsU0FBSyxrQkFBa0IsTUFBTTtBQUM3QixTQUFLLHlCQUF5QixNQUFNO0FBQ3BDLFNBQUssd0JBQXdCLG1CQUFtQjtBQUNoRCxTQUFLLGdDQUFnQyxNQUFNO0FBQzNDLFNBQUssdUJBQXVCLE1BQU07QUFDbEMsZUFBVyxDQUFDLGFBQWEsT0FBTyxLQUFLLEtBQUssNkJBQTZCO0FBQ3RFLFdBQUssZ0NBQWdDLGFBQWEsT0FBTztBQUFBLElBQzFEO0FBQ0EsU0FBSyw0QkFBNEIsTUFBTTtBQUN2QyxTQUFLLG9CQUFvQixNQUFNO0FBQy9CLFNBQUssaUJBQWlCLE1BQU07QUFDNUIsU0FBSyxhQUFhO0FBQ2xCLFNBQUssdUJBQXVCO0FBQzVCLFNBQUssd0JBQXdCLENBQUM7QUFDOUIsU0FBSyxZQUFZO0FBQ2pCLFNBQUssbUJBQW1CLE1BQU07QUFDOUIsUUFBSSxrQ0FBa0M7QUFDckMsV0FBSyw0QkFBNEIsSUFBSTtBQUFBLElBQ3RDO0FBQ0EsUUFBSSx5QkFBeUI7QUFDNUIsV0FBSyxLQUFLLDJCQUEyQixXQUFXLG9CQUFvQixrQkFBa0I7QUFBQSxRQUNyRixRQUFRO0FBQUEsUUFDUixhQUFhO0FBQUEsTUFDZCxDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBR0EscUJBQTJCO0FBQzFCLFNBQUssYUFBYSxJQUFJLE1BQU0sTUFBUztBQUNyQyxTQUFLLGNBQWMsSUFBSSxPQUFPLE1BQVM7QUFDdkMsU0FBSyxZQUFZLElBQUksUUFBUSxNQUFTO0FBQ3RDLFNBQUssWUFBWSxJQUFJLG9CQUFvQixNQUFTO0FBR2xELFNBQUssdUJBQXVCLElBQUksa0JBQWtCLE1BQU07QUFDdkQsVUFBSSxDQUFDLEtBQUssYUFBYSxJQUFJLEdBQUc7QUFBRTtBQUFBLE1BQVE7QUFDeEMsV0FBSyxZQUFZLElBQUksYUFBYSxNQUFTO0FBQzNDLFdBQUssaUJBQWlCLElBQUksQ0FBQyxFQUFFLFNBQVMsUUFBUSxNQUFNLFlBQVksV0FBVyxJQUFJLFdBQVcsS0FBSyxDQUFDLEdBQUcsTUFBUztBQUFBLElBQzdHLEdBQUcsR0FBSSxDQUFDO0FBR1IsU0FBSyx1QkFBdUIsSUFBSSxrQkFBa0IsTUFBTTtBQUN2RCxVQUFJLENBQUMsS0FBSyxhQUFhLElBQUksR0FBRztBQUFFO0FBQUEsTUFBUTtBQUN4QyxXQUFLLGlCQUFpQixJQUFJLENBQUMsRUFBRSxTQUFTLFFBQVEsTUFBTSxnQ0FBZ0MsV0FBVyxhQUFhLFdBQVcsS0FBSyxDQUFDLEdBQUcsTUFBUztBQUFBLElBQzFJLEdBQUcsR0FBSSxDQUFDO0FBR1IsU0FBSyx1QkFBdUIsSUFBSSxrQkFBa0IsTUFBTTtBQUN2RCxVQUFJLENBQUMsS0FBSyxhQUFhLElBQUksR0FBRztBQUFFO0FBQUEsTUFBUTtBQUN4QyxXQUFLLGlCQUFpQixJQUFJLENBQUMsRUFBRSxTQUFTLFFBQVEsTUFBTSxrREFBa0QsV0FBVyxrREFBa0QsV0FBVyxNQUFNLENBQUMsR0FBRyxNQUFTO0FBQ2pNLFdBQUssWUFBWSxJQUFJLFFBQVEsTUFBUztBQUFBLElBQ3ZDLEdBQUcsR0FBSSxDQUFDO0FBR1IsU0FBSyx1QkFBdUIsSUFBSSxrQkFBa0IsTUFBTTtBQUN2RCxVQUFJLENBQUMsS0FBSyxhQUFhLElBQUksR0FBRztBQUFFO0FBQUEsTUFBUTtBQUN4QyxXQUFLLGlCQUFpQixJQUFJO0FBQUEsUUFDekIsRUFBRSxTQUFTLFFBQVEsTUFBTSxrREFBa0QsV0FBVyxrREFBa0QsV0FBVyxNQUFNO0FBQUEsUUFDekosRUFBRSxTQUFTLGFBQWEsTUFBTSwwREFBMkQsV0FBVyxJQUFJLFdBQVcsTUFBTTtBQUFBLE1BQzFILEdBQUcsTUFBUztBQUFBLElBQ2IsR0FBRyxJQUFJLENBQUM7QUFBQSxFQUNUO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVVEsdUJBQXVCLE1BQWMsUUFBc0I7QUFDbEUsU0FBSyxXQUFXLEtBQUssaUNBQWlDLElBQUksV0FBVyxNQUFNLCtCQUErQjtBQUMxRyxTQUFLLG1CQUFtQjtBQVF4QixTQUFLLFlBQVksU0FBUztBQUMxQixTQUFLLDRCQUE0QjtBQUNqQyxTQUFLLDZCQUE2QjtBQUNsQyxTQUFLLDRCQUE0QjtBQUNqQyxTQUFLLHFCQUFxQjtBQUMxQixTQUFLLG1CQUFtQixhQUFhO0FBQ3JDLFNBQUssa0JBQWtCLFlBQVk7QUFDbkMsU0FBSyxXQUFXO0FBQ2hCLFNBQUssaUJBQWlCO0FBTXRCLGVBQVcsQ0FBQyxhQUFhLE9BQU8sS0FBSyxLQUFLLDZCQUE2QjtBQUN0RSxXQUFLLGdDQUFnQyxhQUFhLE9BQU87QUFBQSxJQUMxRDtBQUNBLFNBQUssNEJBQTRCLE1BQU07QUFDdkMsU0FBSyx1QkFBdUIsTUFBTTtBQUNsQyxTQUFLLDhCQUE4QixNQUFNO0FBQ3pDLFNBQUsseUJBQXlCLE1BQU07QUFDcEMsU0FBSyx3QkFBd0IsbUJBQW1CO0FBQ2hELFNBQUssZ0NBQWdDLE1BQU07QUFDM0MsU0FBSyx1QkFBdUIsTUFBTTtBQUNsQyxTQUFLLG9CQUFvQixNQUFNO0FBQy9CLFNBQUssaUJBQWlCLE1BQU07QUFJNUIsU0FBSyxlQUFlLElBQUksUUFBVyxNQUFTO0FBQzVDLFNBQUssMENBQTBDO0FBQy9DLFNBQUssMEJBQTBCLElBQUksQ0FBQyxHQUFHLE1BQVM7QUFDaEQsZ0JBQVksUUFBTTtBQUNqQixXQUFLLGNBQWMsSUFBSSxPQUFPLEVBQUU7QUFDaEMsV0FBSyxnQkFBZ0IsSUFBSSxPQUFPLEVBQUU7QUFDbEMsV0FBSyxhQUFhLElBQUksT0FBTyxFQUFFO0FBQUEsSUFDaEMsQ0FBQztBQUNELFNBQUssWUFBWSxJQUFJLFNBQVMsTUFBUztBQUd2QyxVQUFNLFVBQVUsU0FBUyxPQUN0QixTQUFTLDhCQUE4Qiw4Q0FBOEMsSUFDcEYsVUFBVSxTQUFTLHlCQUF5QixtQ0FBbUM7QUFDbkYsU0FBSyxZQUFZLElBQUksU0FBUyxNQUFTO0FBSXZDLGNBQVUsT0FBTztBQUFBLEVBQ2xCO0FBQUEsRUFFUSxvQkFBMEI7QUFDakMsU0FBSyxXQUFXLEtBQUsseURBQXlEO0FBSzlFLFNBQUssbUJBQW1CLGFBQWE7QUFDckMsU0FBSyxXQUFXO0FBQ2hCLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssb0JBQW9CO0FBQ3pCLFNBQUssd0JBQXdCO0FBQzdCLFNBQUssYUFBYSxJQUFJLE9BQU8sTUFBUztBQUN0QyxTQUFLLGdCQUFnQixJQUFJLE1BQU0sTUFBUztBQUN4QyxTQUFLLFlBQVksSUFBSSxRQUFRLE1BQVM7QUFDdEMsU0FBSyxZQUFZLElBQUksbUJBQW1CLE1BQVM7QUFBQSxFQUNsRDtBQUFBLEVBRVEsd0JBQXdCLFFBQXNCO0FBQ3JELFNBQUssMEJBQTBCO0FBQUEsTUFDOUI7QUFBQSxNQUNBLGlCQUFpQjtBQUFBLE1BQ2pCLE9BQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBRVEsZ0NBQXNDO0FBQzdDLFFBQUksS0FBSyx5QkFBeUIsV0FBVyxLQUFLLHFCQUFxQixLQUFLLHdCQUF3QixVQUFVLFVBQVU7QUFDdkgsV0FBSyx3QkFBd0IsUUFBUTtBQUFBLElBQ3RDO0FBQUEsRUFDRDtBQUFBLEVBRVEsMEJBQWdDO0FBQ3ZDLFNBQUssMEJBQTBCO0FBQUEsRUFDaEM7QUFBQSxFQUVRLHFCQUFxQixPQUFrQztBQUM5RCxRQUFJLENBQUMsS0FBSyxVQUFVO0FBQ25CO0FBQUEsSUFDRDtBQUNBLFFBQUksTUFBTSxVQUFVLE1BQU0sV0FBVyxLQUFLLG1CQUFtQjtBQUM1RDtBQUFBLElBQ0Q7QUFDQSxTQUFLLGlCQUFpQjtBQUN0QixTQUFLLFdBQVcsTUFBTTtBQUFBLEVBQ3ZCO0FBQUEsRUFFUSxlQUFlLE9BQTRCO0FBQ2xELFFBQUksTUFBTSxRQUFRO0FBQ2pCLFVBQUksS0FBSyx5QkFBeUIsV0FBVyxNQUFNLFFBQVE7QUFDMUQsYUFBSyx3QkFBd0IsTUFBTSxNQUFNO0FBQUEsTUFDMUM7QUFBQSxJQUNELE9BQU87QUFDTixXQUFLLHdCQUF3QjtBQUFBLElBQzlCO0FBQ0EsU0FBSyxlQUFlO0FBQ3BCLFNBQUssNEJBQTRCLE1BQU0saUJBQWlCO0FBQ3hELFNBQUssOEJBQThCO0FBQ25DLFNBQUssNEJBQTRCO0FBQUEsRUFDbEM7QUFBQSxFQUVRLGtDQUF3QztBQUMvQyxTQUFLLDRCQUE0QixLQUFLLDBCQUEwQjtBQUNoRSxlQUFXLFVBQVUsS0FBSyxhQUFhO0FBQ3RDLFdBQUssNEJBQTRCLE9BQU8sVUFBVTtBQUFBLElBQ25EO0FBQUEsRUFDRDtBQUFBLEVBRVEsNEJBQTRCLElBQThCO0FBQ2pFLFFBQUksQ0FBQyxJQUFJO0FBQ1I7QUFBQSxJQUNEO0FBQ0EsU0FBSyxxQkFBcUIsT0FBTyxFQUFFO0FBQ25DLFFBQUksS0FBSyxxQkFBcUIsUUFBUSxJQUFJO0FBQ3pDLFlBQU0sU0FBUyxLQUFLLHFCQUFxQixPQUFPLEVBQUUsS0FBSyxFQUFFO0FBQ3pELFVBQUksV0FBVyxRQUFXO0FBQ3pCLGFBQUsscUJBQXFCLE9BQU8sTUFBTTtBQUFBLE1BQ3hDO0FBQUEsSUFDRDtBQUNBLFNBQUsscUJBQXFCLElBQUksRUFBRTtBQUNoQyxTQUFLLGdCQUFnQixPQUFPLEVBQUU7QUFBQSxFQUMvQjtBQUFBLEVBRVEsb0JBQW9CLE9BQXFDO0FBQ2hFLFdBQVEsTUFBTSxXQUFXLFVBQWEsS0FBSyxxQkFBcUIsSUFBSSxNQUFNLE1BQU0sS0FDM0UsTUFBTSxlQUFlLFVBQWEsS0FBSyxxQkFBcUIsSUFBSSxNQUFNLFVBQVU7QUFBQSxFQUN0RjtBQUFBLEVBRVEsZ0NBQXNDO0FBQzdDLGVBQVcsQ0FBQyxLQUFLLFNBQVMsS0FBSyxLQUFLLG9CQUFvQjtBQUN2RCxZQUFNLE9BQU8sVUFBVSxPQUFPLGNBQVk7QUFDekMsY0FBTSxjQUFlLFNBQVMsV0FBVyxVQUFhLEtBQUsscUJBQXFCLElBQUksU0FBUyxNQUFNLEtBQzlGLFNBQVMsZUFBZSxVQUFhLEtBQUsscUJBQXFCLElBQUksU0FBUyxVQUFVO0FBQzNGLFlBQUksZUFBZSxTQUFTLFlBQVk7QUFDdkMsZUFBSyxnQkFBZ0IsT0FBTyxTQUFTLFVBQVU7QUFBQSxRQUNoRDtBQUNBLGVBQU8sQ0FBQztBQUFBLE1BQ1QsQ0FBQztBQUNELFVBQUksS0FBSyxXQUFXLFVBQVUsUUFBUTtBQUNyQztBQUFBLE1BQ0Q7QUFDQSxVQUFJLEtBQUssV0FBVyxHQUFHO0FBQ3RCLGFBQUssbUJBQW1CLE9BQU8sR0FBRztBQUFBLE1BQ25DLE9BQU87QUFDTixhQUFLLG1CQUFtQixJQUFJLEtBQUssSUFBSTtBQUFBLE1BQ3RDO0FBQ0EsV0FBSyxvQkFBb0IsR0FBRztBQUFBLElBQzdCO0FBQUEsRUFDRDtBQUFBLEVBRVEscUJBQXFCLE9BQWtDO0FBQzlELFVBQU0sUUFBUSxLQUFLO0FBQ25CLFFBQUksTUFBTSxRQUFRO0FBQ2pCLFVBQUksQ0FBQyxTQUFTLE1BQU0sV0FBVyxNQUFNLFVBQVUsTUFBTSxVQUFVLFNBQVM7QUFDdkU7QUFBQSxNQUNEO0FBQ0EsVUFBSSxNQUFNLGFBQWEsUUFBVztBQUNqQyxZQUFJLE1BQU0sb0JBQW9CLFVBQWEsTUFBTSxZQUFZLE1BQU0saUJBQWlCO0FBQ25GO0FBQUEsUUFDRDtBQUNBLGNBQU0sa0JBQWtCLE1BQU07QUFBQSxNQUMvQjtBQUFBLElBQ0Q7QUFFQSxRQUFJLENBQUMsS0FBSyxrQ0FBa0MsS0FBSyxxQkFBcUI7QUFDckUsV0FBSyxpQ0FBaUMsS0FBSyxJQUFJO0FBQUEsSUFDaEQ7QUFFQSxVQUFNLFlBQVksTUFBTSxXQUFXO0FBS25DLFFBQUksYUFBYSxDQUFDLEtBQUsseUJBQXlCLEdBQUc7QUFDbEQ7QUFBQSxJQUNEO0FBQ0EsU0FBSyxnQkFBZ0IsTUFBTSxNQUFNLE1BQU0sYUFBYSxJQUFJLFNBQVM7QUFDakUsUUFBSSxXQUFXO0FBQ2Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLEtBQUssVUFBVTtBQUNuQixXQUFLLFlBQVksSUFBSSxjQUFjLE1BQVM7QUFDNUMsV0FBSyxZQUFZLElBQUksaUJBQWlCLE1BQVM7QUFBQSxJQUNoRDtBQUNBLFNBQUssYUFBYSxRQUFRLE1BQU0sSUFBSTtBQUNwQyxRQUFJLE1BQU0sVUFBVSxPQUFPO0FBQzFCLFlBQU0sUUFBUTtBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBQUEsRUFFQSxRQUFRLFNBQTBDLFlBQVksZUFBZSxPQUFhO0FBQ3pGLFFBQUksQ0FBQyxLQUFLLGFBQWEsSUFBSSxHQUFHO0FBQUUsV0FBSyxXQUFXLE1BQU0sd0NBQXdDO0FBQUc7QUFBQSxJQUFRO0FBS3pHLFVBQU0sVUFBVSxXQUFXO0FBSTNCLFNBQUssMkJBQTJCO0FBQ2hDLFNBQUssd0JBQXdCLE1BQVM7QUFJdEMsUUFBSSxjQUFjO0FBQ2pCLFdBQUssaUJBQWlCO0FBQUEsSUFDdkIsV0FBVyxLQUFLLGdCQUFnQjtBQUMvQixXQUFLLFdBQVcsTUFBTSwyREFBMkQ7QUFDakYsV0FBSyxpQkFBaUI7QUFDdEIsV0FBSyxXQUFXO0FBQ2hCO0FBQUEsSUFDRDtBQU9BLFFBQUksS0FBSyxzQkFBc0I7QUFDOUIsV0FBSyxXQUFXLE1BQU0sc0VBQXNFO0FBQzVGLFlBQU0saUJBQWlCLEtBQUssZ0JBQWdCO0FBQzVDLFVBQUksZ0JBQWdCO0FBQ25CLGFBQUsscUJBQXFCLGNBQWM7QUFBQSxNQUN6QztBQUNBLFdBQUssMkJBQTJCLFFBQVcsUUFBVyxLQUFLO0FBQzNELFdBQUssdUJBQXVCO0FBSzVCLFdBQUsseUJBQXlCO0FBQzlCLFdBQUssd0JBQXdCO0FBQzdCLFdBQUsseUJBQXlCO0FBRTlCLFdBQUssc0JBQXNCLEtBQUssSUFBSTtBQUNwQyxXQUFLLGlDQUFpQztBQUN0QyxXQUFLO0FBQ0wsV0FBSyxnQ0FBZ0M7QUFDckMsV0FBSywyQkFBMkIsS0FBSyw0QkFBNEIsS0FBSyxtQkFBbUI7QUFDekYsVUFBSSxLQUFLLHNCQUFzQjtBQUM5QixxQkFBYSxLQUFLLG9CQUFvQjtBQUN0QyxhQUFLLHVCQUF1QjtBQUFBLE1BQzdCO0FBQ0EsV0FBSyxzQkFBc0I7QUFDM0IsV0FBSyxlQUFlO0FBQ3BCLFdBQUssWUFBWSxTQUFTO0FBQzFCLFdBQUssNEJBQTRCO0FBQ2pDLFdBQUssNkJBQTZCO0FBQ2xDLFdBQUssNEJBQTRCO0FBQ2pDLFdBQUssNEJBQTRCO0FBQ2pDLFdBQUsscUJBQXFCO0FBQzFCLFdBQUsseUJBQXlCO0FBQzlCLFdBQUssbUJBQW1CLGFBQWE7QUFDckMsV0FBSyxZQUFZLElBQUksYUFBYSxNQUFTO0FBQzNDLFdBQUssWUFBWSxJQUFJLGdCQUFnQixNQUFTO0FBQzlDLFVBQUksV0FBVyxRQUFRO0FBQ3RCLGFBQUssNEJBQTRCLE1BQU07QUFBQSxNQUN4QztBQUNBLFVBQUksQ0FBQyxLQUFLLHNCQUFzQjtBQUMvQixhQUFLLHVCQUF1QixXQUFXLE1BQU07QUFDNUMsY0FBSSxLQUFLLFVBQVU7QUFDbEIsaUJBQUssWUFBWSxJQUFJLHdCQUF3QixNQUFTO0FBQ3RELGlCQUFLLE1BQU0sVUFBVTtBQUFBLFVBQ3RCO0FBQUEsUUFDRCxHQUFHLHVCQUF1QixvQkFBb0I7QUFBQSxNQUMvQztBQUNBO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxVQUFVO0FBQUUsV0FBSyxXQUFXLE1BQU0sdUNBQXVDO0FBQUc7QUFBQSxJQUFRO0FBQzdGLFFBQUksV0FBVyxZQUFZO0FBQzFCLFlBQU0saUJBQWlCLEtBQUssZ0JBQWdCO0FBQzVDLFVBQUksZ0JBQWdCO0FBQ25CLGFBQUsscUJBQXFCLGNBQWM7QUFBQSxNQUN6QztBQUNBLFdBQUssMkJBQTJCLFFBQVcsUUFBVyxLQUFLO0FBQUEsSUFDNUQ7QUFDQSxTQUFLLFdBQVc7QUFDaEIsU0FBSyx5QkFBeUI7QUFDOUIsU0FBSyx3QkFBd0I7QUFDN0IsU0FBSyxzQkFBc0I7QUFDM0IsU0FBSyxvQkFBb0IsYUFBYTtBQUN0QyxTQUFLLHdCQUF3QixLQUFLLGlCQUFpQjtBQUNuRCxTQUFLLHlCQUF5QjtBQUM5QixTQUFLLHNCQUFzQixLQUFLLElBQUk7QUFDcEMsU0FBSyxpQ0FBaUM7QUFDdEMsU0FBSztBQUNMLFNBQUssZ0NBQWdDO0FBQ3JDLFNBQUssMkJBQTJCLEtBQUssNEJBQTRCLEtBQUssbUJBQW1CO0FBQ3pGLFFBQUksS0FBSyxzQkFBc0I7QUFDOUIsbUJBQWEsS0FBSyxvQkFBb0I7QUFDdEMsV0FBSyx1QkFBdUI7QUFBQSxJQUM3QjtBQUNBLFNBQUssc0JBQXNCO0FBRzNCLFNBQUssZUFBZTtBQVdwQixTQUFLLFlBQVksU0FBUztBQUMxQixTQUFLLDRCQUE0QjtBQUNqQyxTQUFLLDZCQUE2QjtBQUNsQyxTQUFLLDRCQUE0QjtBQUNqQyxTQUFLLDRCQUE0QjtBQUNqQyxTQUFLLHFCQUFxQjtBQUMxQixTQUFLLHlCQUF5QjtBQUU5QixTQUFLLGtCQUFrQixVQUFVO0FBQ2pDLFNBQUssa0JBQWtCLGNBQWMsQ0FBQztBQUd0QyxTQUFLLGtCQUFrQixRQUFRLEtBQUssbUJBQW1CLE9BQU8sRUFBRSxNQUFNLENBQUMsUUFBUTtBQUM5RSxXQUFLLFdBQVcsS0FBSyw0REFBNEQsR0FBRztBQUNwRixXQUFLLFdBQVc7QUFDaEIsV0FBSyxZQUFZLElBQUkscUJBQXFCLE1BQVM7QUFDbkQsV0FBSyxZQUFZLElBQUksU0FBUyxNQUFTO0FBSXZDLFVBQUksS0FBSyxzQkFBc0I7QUFDOUIscUJBQWEsS0FBSyxvQkFBb0I7QUFDdEMsYUFBSyx1QkFBdUI7QUFBQSxNQUM3QjtBQUNBLFdBQUssV0FBVztBQUFBLElBQ2pCLENBQUM7QUFDRCxTQUFLLG1CQUFtQixhQUFhO0FBQ3JDLFNBQUssWUFBWSxJQUFJLGFBQWEsTUFBUztBQUMzQyxTQUFLLFlBQVksSUFBSSxnQkFBZ0IsTUFBUztBQUM5QyxRQUFJLFdBQVcsUUFBUTtBQUN0QixXQUFLLDRCQUE0QixNQUFNO0FBQUEsSUFDeEM7QUFFQSxTQUFLLHVCQUF1QixXQUFXLE1BQU07QUFDNUMsVUFBSSxLQUFLLFVBQVU7QUFDbEIsYUFBSyxZQUFZLElBQUksd0JBQXdCLE1BQVM7QUFDdEQsYUFBSyxNQUFNLFVBQVU7QUFBQSxNQUN0QjtBQUFBLElBQ0QsR0FBRyx1QkFBdUIsb0JBQW9CO0FBQUEsRUFDL0M7QUFBQSxFQUVBLE1BQU0sU0FBa0MsWUFBWSxjQUFjLE9BQWE7QUFDOUUsUUFBSSxDQUFDLEtBQUssVUFBVTtBQUFFO0FBQUEsSUFBUTtBQUc5QixRQUFJLENBQUMsYUFBYTtBQUNqQixZQUFNLFNBQVMsS0FBSyxzQkFBc0IsS0FBSyxJQUFJLElBQUksS0FBSyxzQkFBc0I7QUFDbEYsVUFBSSxTQUFTLHVCQUF1QiwwQkFBMEI7QUFDN0QsYUFBSyxpQkFBaUI7QUFDdEI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFNBQUssV0FBVyxTQUFTLE1BQU07QUFBQSxFQUNoQztBQUFBLEVBRUEsa0JBQWtCLE1BQXFCO0FBQ3RDLFFBQUksS0FBSyxvQkFBb0IsTUFBTTtBQUNsQztBQUFBLElBQ0Q7QUFDQSxTQUFLLGtCQUFrQjtBQUN2QixTQUFLLFdBQVcsTUFBTSw4QkFBOEIsSUFBSSxFQUFFO0FBQzFELFFBQUksTUFBTTtBQUdULFdBQUssc0JBQXNCO0FBQzNCLFVBQUksS0FBSyxhQUFhLElBQUksS0FBSyxLQUFLLFVBQVU7QUFDN0MsYUFBSyxXQUFXLFNBQVMsVUFBVTtBQUFBLE1BQ3BDO0FBQ0E7QUFBQSxJQUNEO0FBSUEsUUFBSSxLQUFLLGFBQWEsSUFBSSxLQUFLLEtBQUssb0JBQW9CLEdBQUc7QUFDMUQsV0FBSyxpQkFBaUIsU0FBUztBQUFBLElBQ2hDO0FBQUEsRUFDRDtBQUFBLEVBRUEsY0FBYyxTQUFrQyxZQUFrQjtBQU9qRSxRQUFJLENBQUMsS0FBSyxhQUFhLElBQUksR0FBRztBQUFFO0FBQUEsSUFBUTtBQUN4QyxTQUFLLHdCQUF3QjtBQUM3QixTQUFLLGlCQUFpQjtBQUN0QixTQUFLLHNCQUFzQjtBQUMzQixRQUFJLEtBQUssVUFBVTtBQUNsQixXQUFLLFdBQVcsU0FBUyxNQUFNO0FBQUEsSUFDaEMsT0FBTztBQUNOLFdBQUssWUFBWSxJQUFJLFFBQVEsTUFBUztBQUN0QyxXQUFLLFlBQVksSUFBSSxnQkFBZ0IsTUFBUztBQUFBLElBQy9DO0FBQUEsRUFDRDtBQUFBLEVBRUEsbUJBQXlCO0FBT3hCLFFBQUksQ0FBQyxLQUFLLGFBQWEsSUFBSSxHQUFHO0FBQUU7QUFBQSxJQUFRO0FBQ3hDLFNBQUssd0JBQXdCO0FBQzdCLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssc0JBQXNCO0FBQzNCLFNBQUssMkJBQTJCLEtBQUssSUFBSSxJQUFJLHVCQUF1QjtBQUNwRSxRQUFJLEtBQUssVUFBVTtBQUNsQixXQUFLLFdBQVcsU0FBUztBQUFBLElBQzFCLE9BQU87QUFDTixXQUFLLFlBQVksSUFBSSxRQUFRLE1BQVM7QUFDdEMsV0FBSyxZQUFZLElBQUksZ0JBQWdCLE1BQVM7QUFBQSxJQUMvQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLDJCQUEyQixTQUFvQjtBQUs5QyxRQUFJLENBQUMsS0FBSyxhQUFhLElBQUksR0FBRztBQUFFO0FBQUEsSUFBUTtBQUN4QyxTQUFLLHdCQUF3QjtBQUM3QixTQUFLLGlCQUFpQjtBQUN0QixTQUFLLHNCQUFzQjtBQUMzQixTQUFLLHdCQUF3QixPQUFPO0FBQ3BDLFFBQUksS0FBSyxVQUFVO0FBQ2xCLFdBQUssV0FBVyxTQUFTLFVBQVU7QUFBQSxJQUNwQyxPQUFPO0FBR04sV0FBSyxZQUFZLElBQUksY0FBYyxNQUFTO0FBQzVDLFdBQUssWUFBWSxJQUFJLGlCQUFpQixNQUFTO0FBQUEsSUFDaEQ7QUFBQSxFQUNEO0FBQUEsRUFFUSx3QkFBd0IsU0FBZ0M7QUFDL0QsUUFBSSxLQUFLLG9CQUFvQjtBQUM1QixtQkFBYSxLQUFLLGtCQUFrQjtBQUNwQyxXQUFLLHFCQUFxQjtBQUFBLElBQzNCO0FBQ0EsU0FBSyx1QkFBdUI7QUFDNUIsUUFBSSxTQUFTO0FBQ1osV0FBSyxxQkFBcUIsV0FBVyxNQUFNO0FBQzFDLGFBQUsscUJBQXFCO0FBQzFCLGFBQUssdUJBQXVCO0FBQUEsTUFDN0IsR0FBRyx1QkFBdUIsd0JBQXdCO0FBQUEsSUFDbkQ7QUFBQSxFQUNEO0FBQUEsRUFFUSw4QkFBK0M7QUFDdEQsVUFBTSxTQUFTLEtBQUs7QUFDcEIsUUFBSSxRQUFRO0FBQ1gsV0FBSyx3QkFBd0IsTUFBUztBQUFBLElBQ3ZDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBZVEsV0FBVyxTQUF1QyxTQUFTLFNBQWtDLFlBQWtCO0FBRXRILFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssdUJBQXVCO0FBQzVCLFFBQUksQ0FBQyxLQUFLLFVBQVU7QUFBRTtBQUFBLElBQVE7QUFDOUIsU0FBSyxzQkFBc0I7QUFDM0IsU0FBSyxXQUFXO0FBRWhCLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssb0JBQW9CLEtBQUssSUFBSTtBQUNsQyxVQUFNLFNBQVMsS0FBSyxzQkFBc0IsS0FBSyxJQUFJLElBQUksS0FBSyxzQkFBc0I7QUFDbEYsU0FBSyxpQkFBaUIsV0FBa0QsWUFBWSxFQUFFLGdCQUFnQixPQUFPLENBQUM7QUFDOUcsUUFBSSxLQUFLLHNCQUFzQjtBQUM5QixtQkFBYSxLQUFLLG9CQUFvQjtBQUN0QyxXQUFLLHVCQUF1QjtBQUFBLElBQzdCO0FBQ0EsU0FBSyxZQUFZLElBQUksY0FBYyxNQUFTO0FBQzVDLFNBQUssWUFBWSxJQUFJLGlCQUFpQixNQUFTO0FBQy9DLFNBQUssd0JBQXdCO0FBQzdCLFNBQUssb0JBQW9CO0FBQ3pCLFNBQUsseUJBQXlCO0FBQzlCLFNBQUssOEJBQThCO0FBQ25DLFFBQUksV0FBVyxVQUFVLFdBQVcsV0FBVztBQUk5QyxXQUFLLGtCQUFrQixTQUFTO0FBQUEsSUFDakMsT0FBTztBQUNOLFdBQUssa0JBQWtCLE1BQU07QUFBQSxJQUM5QjtBQUNBLFFBQUksV0FBVyxXQUFXO0FBRXpCLFdBQUssWUFBWSxJQUFJLFFBQVEsTUFBUztBQUN0QyxXQUFLLFlBQVksSUFBSSxnQkFBZ0IsTUFBUztBQUFBLElBQy9DO0FBQ0EsUUFBSSxXQUFXLFdBQVcsV0FBVyxZQUFZO0FBQ2hELFdBQUssNEJBQTRCLElBQUk7QUFBQSxJQUN0QyxXQUFXLEtBQUsscUJBQXFCLHdCQUF3QixHQUFHO0FBQy9ELFdBQUssNEJBQTRCLEtBQUs7QUFBQSxJQUN2QztBQUFBLEVBQ0Q7QUFBQSxFQUVRLDRCQUE0QixhQUE0QjtBQUMvRCxTQUFLLEtBQUssMkJBQTJCLFdBQVcsb0JBQW9CLHVCQUF1QjtBQUFBLE1BQzFGLFFBQVEsY0FBYyx1Q0FBdUM7QUFBQSxNQUM3RDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLGtCQUFrQixXQUF5QjtBQUMxQyxTQUFLLHFCQUFxQixTQUFTO0FBQ25DLFNBQUssMkJBQTJCLFNBQVM7QUFDekMsVUFBTSxXQUFXLEtBQUssdUJBQXVCLElBQUksU0FBUztBQUMxRCxRQUFJLFVBQVU7QUFBRSxtQkFBYSxRQUFRO0FBQUEsSUFBRztBQUN4QyxVQUFNLFNBQVMsV0FBVyxNQUFNO0FBQy9CLFdBQUssdUJBQXVCLE9BQU8sU0FBUztBQUFBLElBQzdDLEdBQUcsdUJBQXVCLHdCQUF3QjtBQUNsRCxTQUFLLHVCQUF1QixJQUFJLFdBQVcsTUFBTTtBQUFBLEVBQ2xEO0FBQUEsRUFFQSxpQkFBaUIsVUFBaUM7QUFDakQsU0FBSyxlQUFlLElBQUksVUFBVSxNQUFTO0FBQUEsRUFDNUM7QUFBQSxFQUVBLHFCQUEyQjtBQUMxQixVQUFNLE1BQU0sS0FBSyxZQUFZLHFCQUFxQixrQkFBa0IsSUFBSTtBQUN4RSxVQUFNLFdBQVcsSUFBSSxPQUFPO0FBQzVCLFFBQUksUUFBUTtBQUNaLFNBQUssZUFBZSxJQUFJLFVBQVUsTUFBUztBQUUzQyxTQUFLLGVBQWUsZUFBZSwrQkFBK0IsU0FBUyxTQUFTLENBQUMsRUFBRSxNQUFNLE1BQU07QUFBQSxJQUEyQixDQUFDO0FBQUEsRUFDaEk7QUFBQSxFQUVRLDBCQUFnQztBQUN2QyxRQUFJLEtBQUssc0JBQXNCO0FBQzlCLG1CQUFhLEtBQUssb0JBQW9CO0FBQUEsSUFDdkM7QUFDQSxTQUFLLHVCQUF1QixXQUFXLE1BQU07QUFDNUMsV0FBSyx1QkFBdUI7QUFDNUIsV0FBSyx5QkFBeUI7QUFBQSxJQUMvQixHQUFHLEdBQUk7QUFBQSxFQUNSO0FBQUEsRUFFUSxzQkFBK0I7QUFJdEMsV0FBTyxLQUFLLHFCQUFxQixTQUFrQix3QkFBd0IsTUFBTTtBQUFBLEVBQ2xGO0FBQUEsRUFFUSxnQ0FBZ0MsWUFBOEI7QUFDckUsV0FBTyxDQUFDLGNBQWMsS0FBSyxvQkFBb0I7QUFBQSxFQUNoRDtBQUFBLEVBRVEsMkJBQW9DO0FBSTNDLFdBQU8sS0FBSyxxQkFBcUIsU0FBa0IsNkJBQTZCLE1BQU07QUFBQSxFQUN2RjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVVRLGlCQUFpQixNQUFzQjtBQUM5QyxVQUFNLE1BQU0sS0FBSyxxQkFBcUIsU0FBbUIsK0JBQStCO0FBQ3hGLFVBQU0sVUFBVSxNQUFNLFFBQVEsR0FBRyxJQUM5QixJQUFJLElBQUksT0FBTSxPQUFPLE1BQU0sV0FBVyxFQUFFLEtBQUssSUFBSSxFQUFHLEVBQUUsT0FBTyxPQUFLLEVBQUUsU0FBUyxDQUFDLElBQzlFLENBQUM7QUFDSixRQUFJLFFBQVEsV0FBVyxHQUFHO0FBQ3pCLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxVQUFVLEtBQUssUUFBUSxFQUFFLFFBQVEsY0FBYyxFQUFFLEVBQUUsUUFBUTtBQUNqRSxVQUFNLGVBQWUsUUFBUSxZQUFZO0FBRXpDLFVBQU0sU0FBUyxDQUFDLEdBQUcsT0FBTyxFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTTtBQUM5RCxlQUFXLFVBQVUsUUFBUTtBQUM1QixZQUFNLGNBQWMsT0FBTyxZQUFZO0FBQ3ZDLFVBQUksQ0FBQyxhQUFhLFNBQVMsV0FBVyxHQUFHO0FBQ3hDO0FBQUEsTUFDRDtBQUNBLFlBQU0sTUFBTSxRQUFRLFNBQVMsT0FBTztBQUdwQyxVQUFJLFFBQVEsS0FBSyxLQUFLLEtBQUssUUFBUSxNQUFNLENBQUMsQ0FBQyxHQUFHO0FBQzdDLGVBQU8sUUFBUSxNQUFNLEdBQUcsR0FBRyxFQUFFLFFBQVEsZ0JBQWdCLEVBQUU7QUFBQSxNQUN4RDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFTUSxtQkFBNEI7QUFDbkMsUUFBSTtBQUNILGFBQU8sS0FBSyxTQUFTLFNBQVMsU0FBUyxLQUFLO0FBQUEsSUFDN0MsUUFBUTtBQUNQLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsZ0JBQXNCO0FBQzdCLFFBQUksS0FBSyxZQUFZLEtBQUssd0JBQXdCO0FBQ2pELFdBQUssV0FBVyxNQUFNLDRFQUE0RTtBQUNsRyxXQUFLLFdBQVcsV0FBVyxVQUFVO0FBQUEsSUFDdEM7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBLEVBSVEsaUJBQXVCO0FBQzlCLFFBQUksS0FBSyxvQkFBb0IsR0FBRztBQUMvQixXQUFLLFdBQVcsTUFBTSw2RUFBNkU7QUFDbkcsV0FBSyxpQkFBaUI7QUFBQSxJQUN2QjtBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBR1EsaUJBQWlCLFNBQTZCLFFBQWM7QUFDbkUsU0FBSyxzQkFBc0I7QUFDM0IsUUFBSSxLQUFLLG1CQUFtQixLQUFLLHlCQUF5QixDQUFDLEtBQUssYUFBYSxJQUFJLEtBQUssS0FBSyxVQUFVO0FBQ3BHLFdBQUssV0FBVyxNQUFNLDBDQUEwQyxLQUFLLGVBQWUsZUFBZSxLQUFLLHFCQUFxQixjQUFjLEtBQUssYUFBYSxJQUFJLENBQUMsWUFBWSxLQUFLLFFBQVEsRUFBRTtBQUM3TDtBQUFBLElBQ0Q7QUFLQSxRQUFJLFdBQVcsVUFBVSxDQUFDLEtBQUssaUJBQWlCLEdBQUc7QUFDbEQsV0FBSyxXQUFXLE1BQU0sZ0ZBQWdGO0FBQ3RHO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxtQkFBbUIsYUFBYSxLQUFLLFlBQVksU0FBUyxLQUFLLEtBQUssOEJBQThCLE1BQU07QUFDaEgsV0FBSyxXQUFXLE1BQU0seURBQXlELEtBQUssbUJBQW1CLFNBQVMsVUFBVSxLQUFLLFlBQVksTUFBTSxjQUFjLEtBQUssOEJBQThCLElBQUksR0FBRztBQUN6TTtBQUFBLElBQ0Q7QUFDQSxTQUFLLFdBQVcsTUFBTSw2Q0FBNkM7QUFDbkUsU0FBSyxRQUFRLE1BQU07QUFDbkIsU0FBSyxNQUFNLFVBQVU7QUFBQSxFQUN0QjtBQUFBLEVBRVEsNEJBQTRCLFFBQXNDO0FBQ3pFLFFBQUksV0FBVyxXQUFXO0FBQ3pCLFdBQUssS0FBSywyQkFBMkIsV0FBVyxvQkFBb0Isa0JBQWtCO0FBQUEsUUFDckYsUUFBUTtBQUFBLFFBQ1IsYUFBYTtBQUFBLE1BQ2QsQ0FBQztBQUNEO0FBQUEsSUFDRDtBQUVBLFNBQUssS0FBSywyQkFBMkIsV0FBVyxvQkFBb0IsdUJBQXVCO0FBQUEsTUFDMUYsUUFBUTtBQUFBLE1BQ1IsYUFBYTtBQUFBLElBQ2QsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQWlCUSxzQkFBNEI7QUFDbkMsUUFBSSxDQUFDLEtBQUssb0JBQW9CLEtBQUssQ0FBQyxLQUFLLGFBQWEsSUFBSSxLQUFLLEtBQUssWUFBWSxLQUFLLG1CQUFtQixLQUFLLHlCQUF5QixDQUFDLEtBQUssU0FBUztBQUNwSjtBQUFBLElBQ0Q7QUFHQSxRQUFJLENBQUMsS0FBSyxpQkFBaUIsR0FBRztBQUM3QjtBQUFBLElBQ0Q7QUFDQSxTQUFLLHNCQUFzQjtBQUMzQixTQUFLLG9CQUFvQixhQUFhO0FBQ3RDLFNBQUssV0FBVztBQUNoQixTQUFLLHlCQUF5QjtBQU05QixTQUFLLHVCQUF1QjtBQU01QixTQUFLLHNCQUFzQixLQUFLLElBQUk7QUFDcEMsU0FBSyxrQkFBa0IsVUFBVTtBQUNqQyxTQUFLLGtCQUFrQixjQUFjLENBQUM7QUFDdEMsU0FBSyxrQkFBa0I7QUFBQSxNQUFRLEtBQUs7QUFBQTtBQUFBLE1BQWlDO0FBQUEsSUFBSSxFQUFFLE1BQU0sU0FBTztBQUN2RixXQUFLLFdBQVcsS0FBSywyQ0FBMkMsR0FBRztBQUNuRSxXQUFLLFdBQVc7QUFDaEIsV0FBSyx1QkFBdUI7QUFBQSxJQUM3QixDQUFDO0FBQUEsRUFDRjtBQUFBO0FBQUEsRUFHUSxzQkFBNEI7QUFDbkMsU0FBSyxzQkFBc0I7QUFDM0IsU0FBSyxtQkFBbUIsV0FBVyxNQUFNO0FBQ3hDLFdBQUssbUJBQW1CO0FBRXhCLFVBQUksS0FBSyxxQkFBcUI7QUFBRTtBQUFBLE1BQVE7QUFDeEMsV0FBSyxpQkFBaUI7QUFBQSxJQUN2QixHQUFHLHVCQUF1QixxQkFBcUI7QUFBQSxFQUNoRDtBQUFBLEVBRVEsd0JBQThCO0FBQ3JDLFFBQUksS0FBSyxrQkFBa0I7QUFDMUIsbUJBQWEsS0FBSyxnQkFBZ0I7QUFDbEMsV0FBSyxtQkFBbUI7QUFBQSxJQUN6QjtBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBR1Esb0JBQTBCO0FBQ2pDLFNBQUssc0JBQXNCO0FBQzNCLFNBQUssMkJBQTJCLEtBQUssb0JBQW9CO0FBQ3pELFNBQUssc0JBQXNCO0FBQzNCLFFBQUksS0FBSyx3QkFBd0I7QUFDaEMsbUJBQWEsS0FBSyxzQkFBc0I7QUFBQSxJQUN6QztBQUNBLFNBQUsseUJBQXlCLFdBQVcsTUFBTTtBQUM5QyxXQUFLLHlCQUF5QjtBQUM5QixXQUFLLHNCQUFzQjtBQUMzQixXQUFLLDJCQUEyQjtBQUVoQyxVQUFJLEtBQUssb0JBQW9CLEtBQUssQ0FBQyxLQUFLLFVBQVU7QUFDakQsYUFBSyxpQkFBaUI7QUFBQSxNQUN2QjtBQUFBLElBQ0QsR0FBRyxHQUFNO0FBQUEsRUFDVjtBQUFBLEVBRVEsc0JBQTRCO0FBQ25DLFNBQUssc0JBQXNCO0FBQzNCLFNBQUssMkJBQTJCO0FBQ2hDLFFBQUksS0FBSyx3QkFBd0I7QUFDaEMsbUJBQWEsS0FBSyxzQkFBc0I7QUFDeEMsV0FBSyx5QkFBeUI7QUFBQSxJQUMvQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGtCQUFrQixNQUFjLGlCQUE0QjtBQUNuRSxTQUFLLGVBQWUsZUFBK0MsMkJBQTJCLElBQUksRUFBRSxLQUFLLGNBQVk7QUFDcEgsV0FBSyxXQUFXLEtBQUsseUNBQXlDLGdCQUFnQixTQUFTLENBQUMsYUFBYSxVQUFVLE1BQU0sTUFBTSxjQUFjLEtBQUssYUFBYSxJQUFJLENBQUMsRUFBRTtBQUNsSyxVQUFJLFlBQVksS0FBSyxhQUFhLElBQUksR0FBRztBQUN4QyxhQUFLLG9CQUFvQixpQkFBaUIsUUFBUTtBQUFBLE1BQ25EO0FBQUEsSUFDRCxDQUFDLEVBQUUsTUFBTSxTQUFPLEtBQUssV0FBVyxLQUFLLCtCQUErQixHQUFHLENBQUM7QUFBQSxFQUN6RTtBQUFBLEVBRUEsTUFBYyxrQkFBa0IsaUJBQXNCLE1BQW1EO0FBQ3hHLFVBQU0sU0FBUyxNQUFNLEtBQUssWUFBWSxZQUFZLGlCQUFpQixNQUFNLEVBQUUsa0JBQWtCLEtBQUssd0JBQXdCLEVBQUUsQ0FBQyxFQUFFLE1BQU0sU0FBTztBQUMzSSxXQUFLLFdBQVcsS0FBSyx3Q0FBd0MsR0FBRztBQUNoRSxhQUFPO0FBQUEsSUFDUixDQUFDO0FBQ0QsUUFBSSxDQUFDLFFBQVE7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sYUFBYSxlQUFlLFNBQVMsTUFBTSxJQUFJLE9BQU8sV0FBVyxRQUFRLFFBQVEsTUFBTTtBQUM3RixlQUFXLEtBQUssT0FBTSxTQUFRO0FBQzdCLFVBQUksZUFBZSxPQUFPLElBQUksR0FBRztBQUNoQyxjQUFNLFdBQVcsTUFBTSxLQUFLLEtBQUs7QUFDakMsWUFBSSxLQUFLLGFBQWEsSUFBSSxHQUFHO0FBQzVCLGVBQUssb0JBQW9CLGlCQUFpQixRQUFRO0FBQUEsUUFDbkQ7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLEVBQUUsTUFBTSxTQUFPLEtBQUssV0FBVyxLQUFLLDJDQUEyQyxHQUFHLENBQUM7QUFDcEYsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLG9CQUFvQixpQkFBc0IsVUFBb0M7QUFDckYsUUFBSSxDQUFDLEtBQUssd0JBQXdCLEdBQUc7QUFDcEM7QUFBQSxJQUNEO0FBQ0EsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFVBQU0sUUFBUSxZQUFZLElBQUksSUFBSSxrQkFBa0IsQ0FBQztBQUNyRCxVQUFNLE9BQU8sb0JBQUksSUFBWTtBQUM3QixVQUFNLFlBQVksZ0JBQWdCLFNBQVM7QUFDM0MsVUFBTSxhQUFhLEtBQUssWUFBWSxTQUFTO0FBQzdDLFVBQU0sbUJBQW1CLEtBQUssSUFBSTtBQUNsQyxRQUFJLGdCQUFnQjtBQUNwQixRQUFJO0FBQ0osUUFBSSxlQUFlO0FBQ25CLFFBQUk7QUFDSixTQUFLLFdBQVcsS0FBSyxxQ0FBcUMsU0FBUyxhQUFhLFNBQVMsRUFBRSxZQUFZLFNBQVMsU0FBUyxFQUFFO0FBRTNILFVBQU0sVUFBVSxNQUFNLEtBQUssd0JBQXdCLGlCQUFpQixTQUFTLEVBQUU7QUFDL0UsVUFBTSxpQkFBaUIsTUFBTTtBQUM1QixVQUFJLHFCQUFxQixRQUFXO0FBQ25DLGVBQU8sbUJBQW1CLHVCQUF1QjtBQUFBLE1BQ2xEO0FBQ0EsWUFBTSxlQUFlLEtBQUssdUJBQXVCLElBQUksVUFBVTtBQUMvRCxhQUFPLEtBQUs7QUFBQSxRQUNYLG1CQUFtQix1QkFBdUI7QUFBQSxTQUN6QyxnQkFBZ0IsS0FBSyx1QkFBdUI7QUFBQSxNQUM5QztBQUFBLElBQ0Q7QUFDQSxVQUFNLFFBQVEsTUFBTTtBQUNuQixZQUFNLE1BQU07QUFDWixVQUFJLENBQUMsS0FBSyx3QkFBd0IsR0FBRztBQUNwQyxnQkFBUTtBQUNSO0FBQUEsTUFDRDtBQUNBLFVBQUksU0FBUyxjQUFjLFNBQVMsWUFBWTtBQUMvQyxnQkFBUTtBQUNSO0FBQUEsTUFDRDtBQUNBLFVBQUksQ0FBQyxXQUFXLGlCQUFpQix1QkFBdUIsaUNBQWlDO0FBQ3hGO0FBQUEsTUFDRDtBQUNBLFVBQUksQ0FBQyxLQUFLLGFBQWEsSUFBSSxHQUFHO0FBQzdCO0FBQUEsTUFDRDtBQUNBLFlBQU0sOEJBQThCLEtBQUssMkJBQTJCLFNBQVM7QUFDN0UsVUFBSSxLQUFLLG1CQUFtQixhQUFhLENBQUMsNkJBQTZCO0FBQ3RFO0FBQUEsTUFDRDtBQUNBLFlBQU0sUUFBUSxlQUFlLElBQUksS0FBSyxJQUFJO0FBQzFDLFVBQUksUUFBUSxHQUFHO0FBQ2QsY0FBTSxRQUFRLGtCQUFrQixPQUFPLEtBQUs7QUFDNUM7QUFBQSxNQUNEO0FBRUEsWUFBTSxhQUFhO0FBQ25CLGdCQUFVO0FBQ1YsWUFBTSxXQUE4QztBQUFBLFFBQ25ELFdBQVcsU0FBUztBQUFBLFFBQ3BCLGNBQWMsV0FBVztBQUFBLFFBQ3pCLFVBQVU7QUFBQSxNQUNYO0FBQ0EsWUFBTSxXQUFXLEtBQUssYUFBYSxJQUFJLEtBQ25DLEtBQUssZUFBZSxXQUFXLEtBQUssZ0JBQWdCLENBQUMsS0FDckQsS0FBSyxTQUFTLFdBQVcsY0FBYyxXQUFXLE9BQU8sUUFBVyxRQUFRO0FBQ2hGLFdBQUssV0FBVyxLQUFLLHVDQUF1QyxTQUFTLGFBQWEsU0FBUyxFQUFFLFVBQVUsV0FBVyxFQUFFLGFBQWEsU0FBUyxRQUFRLGFBQWEsUUFBUSxRQUFRLENBQUMsRUFBRTtBQUNsTCxVQUFJLFVBQVU7QUFDYjtBQUNBLDJCQUFtQixLQUFLLElBQUk7QUFBQSxNQUM3QjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVcsTUFBTTtBQUN0QixZQUFNLE1BQU07QUFDWixZQUFNLFFBQVEsZUFBZSxJQUFJLEtBQUssSUFBSTtBQUMxQyxVQUFJLFNBQVMsR0FBRztBQUNmLGNBQU07QUFBQSxNQUNQLE9BQU87QUFDTixjQUFNLFFBQVEsa0JBQWtCLE9BQU8sS0FBSztBQUFBLE1BQzdDO0FBQUEsSUFDRDtBQUNBLFVBQU0sU0FBUyxNQUFNO0FBQ3BCLFVBQUksQ0FBQyxLQUFLLHdCQUF3QixHQUFHO0FBQ3BDLGdCQUFRO0FBQ1I7QUFBQSxNQUNEO0FBQ0EsVUFBSSxTQUFTLGNBQWMsU0FBUyxZQUFZO0FBQy9DLGFBQUssMkJBQTJCLFNBQVM7QUFDekMsZ0JBQVE7QUFDUjtBQUFBLE1BQ0Q7QUFDQSxpQkFBVyxRQUFRLFNBQVMsU0FBUyxPQUFPO0FBQzNDLFlBQUksS0FBSyxTQUFTLG1CQUFtQixDQUFDLG9CQUFvQixLQUFLLEVBQUUsS0FBSyxLQUFLLElBQUksS0FBSyxFQUFFLEdBQUc7QUFDeEY7QUFBQSxRQUNEO0FBQ0EsYUFBSyxJQUFJLEtBQUssRUFBRTtBQUNoQixrQkFBVSxFQUFFLElBQUksS0FBSyxJQUFJLE9BQU8sS0FBSyxNQUFNO0FBQzNDLGFBQUssV0FBVyxLQUFLLHVDQUF1QyxTQUFTLGFBQWEsU0FBUyxFQUFFLFVBQVUsS0FBSyxFQUFFLEVBQUU7QUFBQSxNQUNqSDtBQUNBLFVBQUksU0FBUztBQUNaLGlCQUFTO0FBQUEsTUFDVjtBQUFBLElBQ0Q7QUFFQSxnQkFBWSxJQUFJLFNBQVMsWUFBWSxNQUFNLENBQUM7QUFDNUMsZ0JBQVksSUFBSSxRQUFRLFlBQVU7QUFDakMsVUFBSSxLQUFLLGFBQWEsS0FBSyxNQUFNLEtBQUssU0FBUztBQUM5QyxpQkFBUztBQUFBLE1BQ1Y7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLGdCQUFZLElBQUksS0FBSyxtQkFBbUIsa0JBQWtCLE1BQU07QUFDL0QsVUFBSSxTQUFTO0FBQ1osaUJBQVM7QUFBQSxNQUNWO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixnQkFBWSxJQUFJLEVBQUUsU0FBUyxNQUFNLEtBQUssZ0NBQWdDLE9BQU8sU0FBUyxFQUFFLEVBQUUsQ0FBQztBQUMzRixTQUFLLHdCQUF3QixJQUFJLFNBQVMsSUFBSSxXQUFXO0FBQ3pELFNBQUssZ0NBQWdDLElBQUksU0FBUyxJQUFJLFVBQVU7QUFDaEUsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLDBCQUFtQztBQUMxQyxXQUFPLEtBQUsscUJBQXFCLFNBQWtCLDRCQUE0QixNQUFNO0FBQUEsRUFDdEY7QUFBQSxFQUVRLHFCQUFxQixXQUEwQjtBQUN0RCxVQUFNLGFBQWEsWUFBWSxLQUFLLFlBQVksU0FBUyxJQUFJO0FBQzdELGVBQVcsY0FBYyxDQUFDLEdBQUcsS0FBSyx3QkFBd0IsS0FBSyxDQUFDLEdBQUc7QUFDbEUsVUFBSSxlQUFlLFVBQWEsS0FBSyxnQ0FBZ0MsSUFBSSxVQUFVLE1BQU0sWUFBWTtBQUNwRyxhQUFLLHdCQUF3QixpQkFBaUIsVUFBVTtBQUFBLE1BQ3pEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQWMseUJBQXlCLE1BQTZCO0FBSW5FLFVBQU0sU0FBUyxLQUFLLDRCQUE0QixLQUFLLEtBQUssZUFBZSxJQUFJO0FBQzdFLFFBQUksUUFBUTtBQUVYLFlBQU0saUJBQWlCLE1BQU0sS0FBSyxlQUFlLGVBQW1DLCtCQUErQixFQUFFLE1BQU0sTUFBTSxNQUFTO0FBQzFJLFlBQU0sa0JBQWtCLG1CQUFtQixPQUFPLFNBQVM7QUFFM0QsVUFBSSxpQkFBaUI7QUFFcEIsYUFBSyxrQkFBa0IsTUFBTSxNQUFNO0FBQUEsTUFDcEMsT0FBTztBQUVOLGNBQU0sTUFBTSxJQUFJLHdCQUF3QjtBQUN4QyxjQUFNLE1BQU0sTUFBTSxLQUFLLFlBQVkscUJBQXFCLFFBQVEsa0JBQWtCLE1BQU0sSUFBSSxPQUFPLFlBQVksRUFBRSxNQUFNLFNBQU87QUFDN0gsZUFBSyxXQUFXLEtBQUssMENBQTBDLEdBQUc7QUFDbEUsaUJBQU87QUFBQSxRQUNSLENBQUM7QUFDRCxZQUFJLFFBQVE7QUFDWixZQUFJLENBQUMsS0FBSztBQUNULGVBQUssV0FBVyxLQUFLLCtEQUErRDtBQUVwRixnQkFBTSxXQUFXLE1BQU0sS0FBSyxlQUFlLGVBQXdCLCtCQUErQixPQUFPLFNBQVMsQ0FBQyxFQUFFLE1BQU0sTUFBTSxLQUFLO0FBQ3RJLGNBQUksVUFBVTtBQUNiLGtCQUFNLElBQUksUUFBUSxhQUFXLFdBQVcsU0FBUyxHQUFHLENBQUM7QUFDckQsaUJBQUssa0JBQWtCLE1BQU0sTUFBTTtBQUFBLFVBQ3BDO0FBQ0E7QUFBQSxRQUNEO0FBQ0EsY0FBTSxTQUFTLE1BQU0sS0FBSyxrQkFBa0IsUUFBUSxJQUFJO0FBQ3hELFlBQUksVUFBVSxPQUFPLFNBQVMsWUFBWTtBQUV6QyxlQUFLLGdDQUFnQyxNQUFNO0FBRTNDLGVBQUssZUFBZSxlQUFlLHlCQUF5QixFQUFFLE1BQU0sTUFBTTtBQUFBLFVBQWUsQ0FBQztBQUcxRixnQkFBTSxRQUFRLEtBQUssWUFBWSxXQUFXLE1BQU07QUFDaEQsY0FBSSxPQUFPO0FBQ1Ysa0JBQU0sVUFBVSxNQUFNLFlBQVksRUFBRSxHQUFHLEVBQUU7QUFDekMsZ0JBQUksU0FBUyxZQUFZLENBQUMsUUFBUSxTQUFTLGNBQWMsQ0FBQyxRQUFRLFNBQVMsWUFBWTtBQUN0RixvQkFBTSxxQkFBcUIsUUFBUSxTQUFTLFlBQVksTUFBTTtBQUM3RCxvQkFBSSxRQUFRLFNBQVUsY0FBYyxRQUFRLFNBQVUsWUFBWTtBQUNqRSxxQ0FBbUIsUUFBUTtBQUMzQixzQkFBSSxRQUFRO0FBQUEsZ0JBQ2I7QUFBQSxjQUNELENBQUM7QUFBQSxZQUNGLE9BQU87QUFDTixrQkFBSSxRQUFRO0FBQUEsWUFDYjtBQUFBLFVBQ0QsT0FBTztBQUNOLGdCQUFJLFFBQVE7QUFBQSxVQUNiO0FBQUEsUUFDRCxPQUFPO0FBQ04sY0FBSSxRQUFRO0FBQUEsUUFDYjtBQUFBLE1BQ0Q7QUFBQSxJQUNELE9BQU87QUFFTixZQUFNLGlCQUFpQixNQUFNLEtBQUssZUFBZSxlQUFtQywrQkFBK0IsRUFBRSxNQUFNLE1BQU0sTUFBUztBQUMxSSxVQUFJLGdCQUFnQjtBQUVuQixhQUFLLGtCQUFrQixNQUFNLElBQUksTUFBTSxjQUFjLENBQUM7QUFBQSxNQUN2RCxPQUFPO0FBR04sY0FBTSxTQUFTLENBQUMsR0FBRyxLQUFLLFlBQVksV0FBVyxJQUFJLENBQUM7QUFDcEQsY0FBTSxrQkFBa0IsT0FBTyxTQUFTLElBQUksT0FBTyxPQUFPLFNBQVMsQ0FBQyxJQUFJO0FBQ3hFLGNBQU0sa0JBQWtCLGlCQUFpQjtBQUV6QyxZQUFJLGlCQUFpQjtBQUVwQixnQkFBTSxXQUFXLE1BQU0sS0FBSyxlQUFlLGVBQXdCLCtCQUErQixnQkFBZ0IsU0FBUyxDQUFDLEVBQUUsTUFBTSxNQUFNLEtBQUs7QUFDL0ksY0FBSSxVQUFVO0FBQ2Isa0JBQU0sSUFBSSxRQUFRLGFBQVcsV0FBVyxTQUFTLEdBQUcsQ0FBQztBQUNyRCxpQkFBSyxrQkFBa0IsTUFBTSxlQUFlO0FBQUEsVUFDN0MsT0FBTztBQUVOLGtCQUFNLEtBQUssa0JBQWtCLGlCQUFpQixJQUFJO0FBQUEsVUFDbkQ7QUFBQSxRQUNELE9BQU87QUFFTixnQkFBTSxNQUFNLEtBQUssWUFBWSxxQkFBcUIsa0JBQWtCLElBQUk7QUFDeEUsZ0JBQU0sV0FBVyxJQUFJLE9BQU87QUFDNUIsY0FBSSxRQUFRO0FBRVosZUFBSyxlQUFlLGVBQWUsK0JBQStCLFNBQVMsU0FBUyxDQUFDLEVBQUUsTUFBTSxNQUFNO0FBQUEsVUFBMkIsQ0FBQztBQUMvSCxnQkFBTSxLQUFLLGtCQUFrQixVQUFVLElBQUk7QUFBQSxRQUM1QztBQUFBLE1BQ0Q7QUFHQSxXQUFLLGVBQWUsZUFBZSx5Q0FBeUMsRUFBRSxNQUFNLE1BQU07QUFBQSxNQUFlLENBQUM7QUFBQSxJQUMzRztBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPUSxnQ0FBZ0MsaUJBQTRCO0FBQ25FLFVBQU0sUUFBUSxLQUFLLFlBQVksV0FBVyxlQUFlO0FBQ3pELFFBQUksQ0FBQyxPQUFPO0FBQ1g7QUFBQSxJQUNEO0FBSUEsU0FBSyxtQkFBbUIsSUFBSSxnQkFBZ0IsU0FBUyxHQUFHLEVBQUUsT0FBTyxZQUFZLFFBQVEsSUFBSSxXQUFXLElBQUkscUJBQXFCLEdBQUcsQ0FBQztBQUNqSSxTQUFLLGFBQWE7QUFFbEIsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFFBQUksV0FBVztBQUVmLFVBQU0scUJBQXFCLE1BQU07QUFDaEMsWUFBTSxVQUFVLE1BQU07QUFDdEIsWUFBTSxXQUFXLFNBQVM7QUFDMUIsVUFBSSxDQUFDLFVBQVU7QUFDZDtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFdBQVcsU0FBUyxTQUFTLFlBQVk7QUFFL0MsWUFBTSxjQUFjLFNBQVMsU0FBUyxNQUFNLFNBQVMsTUFBTSxHQUFHLEdBQUcsSUFBSSxXQUFNO0FBQzNFLFVBQUksZUFBZSxnQkFBZ0IsVUFBVTtBQUM1QyxjQUFNLFVBQVUsYUFBYTtBQUM3QixtQkFBVztBQUNYLGFBQUssa0JBQWtCLGFBQWEsRUFBRSxjQUFjLFFBQVEsQ0FBQztBQUFBLE1BQzlEO0FBRUEsVUFBSSxTQUFTLGNBQWMsU0FBUyxZQUFZO0FBRy9DLGFBQUssbUJBQW1CLElBQUksZ0JBQWdCLFNBQVMsR0FBRyxFQUFFLE9BQU8sUUFBUSxRQUFRLElBQUksV0FBVyxJQUFJLHFCQUFxQixHQUFHLENBQUM7QUFDN0gsYUFBSyxhQUFhO0FBQ2xCLGFBQUssbUJBQW1CLG9CQUFvQjtBQUM1QyxvQkFBWSxRQUFRO0FBQUEsTUFDckI7QUFBQSxJQUNEO0FBR0EsVUFBTSxnQkFBZ0IsTUFBTTtBQUMzQixZQUFNLFVBQVUsTUFBTTtBQUN0QixVQUFJLFNBQVMsVUFBVTtBQUN0QixvQkFBWSxJQUFJLFFBQVEsU0FBUyxZQUFZLE1BQU0sbUJBQW1CLENBQUMsQ0FBQztBQUN4RSwyQkFBbUI7QUFBQSxNQUNwQjtBQUFBLElBQ0Q7QUFHQSxnQkFBWSxJQUFJLE1BQU0sWUFBWSxPQUFLO0FBQ3RDLFVBQUksRUFBRSxTQUFTLGVBQWU7QUFDN0Isc0JBQWM7QUFBQSxNQUNmO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixrQkFBYztBQUdkLFVBQU0sVUFBVSxXQUFXLE1BQU0sWUFBWSxRQUFRLEdBQUcsSUFBSSxLQUFLLEdBQUk7QUFDckUsZ0JBQVksSUFBSSxFQUFFLFNBQVMsTUFBTSxhQUFhLE9BQU8sRUFBRSxDQUFDO0FBQUEsRUFDekQ7QUFBQTtBQUFBLEVBSVEsVUFBVSxNQUE2QjtBQUM5QyxVQUFNLE1BQU0sS0FBSyxpQkFBaUIsSUFBSTtBQUN0QyxVQUFNLE9BQU8sQ0FBQyxHQUFHLEtBQUssSUFBSSxFQUFFLE1BQU0sQ0FBQyx1QkFBdUIsVUFBVTtBQUNwRSxTQUFLLGlCQUFpQixJQUFJLE1BQU0sTUFBUztBQUFBLEVBQzFDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT1EsaUJBQXVCO0FBQzlCLFVBQU0sTUFBTSxLQUFLLGlCQUFpQixJQUFJO0FBQ3RDLFVBQU0sT0FBTyxJQUFJLElBQUksU0FBUyxDQUFDO0FBQy9CLFFBQUksUUFBUSxLQUFLLFlBQVksVUFBVSxDQUFDLEtBQUssTUFBTTtBQUNsRDtBQUFBLElBQ0Q7QUFDQSxTQUFLLFVBQVUsRUFBRSxTQUFTLFFBQVEsTUFBTSxJQUFJLFdBQVcsSUFBSSxXQUFXLEtBQUssQ0FBQztBQUFBLEVBQzdFO0FBQUEsRUFFUSxnQkFBZ0IsTUFBYyxXQUFtQixXQUEwQjtBQUNsRixVQUFNLE1BQU0sS0FBSyxpQkFBaUIsSUFBSTtBQUN0QyxVQUFNLE9BQU8sSUFBSSxJQUFJLFNBQVMsQ0FBQztBQUMvQixRQUFJLENBQUMsUUFBUSxLQUFLLFlBQVksUUFBUTtBQUdyQyxXQUFLLFVBQVUsRUFBRSxTQUFTLFFBQVEsTUFBTSxXQUFXLFVBQVUsQ0FBQztBQUM5RDtBQUFBLElBQ0Q7QUFDQSxVQUFNLFVBQTJCLEVBQUUsU0FBUyxRQUFRLE1BQU0sV0FBVyxVQUFVO0FBQy9FLFNBQUssaUJBQWlCLElBQUksQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEVBQUUsR0FBRyxPQUFPLEdBQUcsTUFBUztBQUFBLEVBQ3BFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFjUSxrQkFBa0IsTUFBYyxPQUFrQyxFQUFFLGNBQWMsS0FBSyxHQUFTO0FBQ3ZHLFVBQU0sTUFBTSxLQUFLLGlCQUFpQixJQUFJO0FBQ3RDLFVBQU0sT0FBTyxJQUFJLElBQUksU0FBUyxDQUFDO0FBQy9CLFFBQUksQ0FBQyxLQUFLLGdCQUFnQixRQUFRLEtBQUssWUFBWSxhQUFhO0FBQy9ELFlBQU0sVUFBMkIsRUFBRSxTQUFTLGFBQWEsTUFBTSxXQUFXLElBQUksV0FBVyxNQUFNO0FBQy9GLFdBQUssaUJBQWlCLElBQUksQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEVBQUUsR0FBRyxPQUFPLEdBQUcsTUFBUztBQUNuRTtBQUFBLElBQ0Q7QUFDQSxTQUFLLFVBQVUsRUFBRSxTQUFTLGFBQWEsTUFBTSxXQUFXLElBQUksV0FBVyxNQUFNLENBQUM7QUFBQSxFQUMvRTtBQUFBLEVBRVEsd0JBQThCO0FBQ3JDLFFBQUksS0FBSyxzQkFBc0I7QUFDOUIsbUJBQWEsS0FBSyxvQkFBb0I7QUFDdEMsV0FBSyx1QkFBdUI7QUFBQSxJQUM3QjtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBZ0JRLGNBQ1AsTUFDQSxNQUNBLFVBQ087QUFDUCxVQUFNLFNBQVMsS0FBSztBQUNwQixRQUFJLENBQUMsVUFBVSxDQUFDLE1BQU07QUFDckI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxRQUE4QjtBQUFBLE1BQ25DLFFBQVEsYUFBYTtBQUFBLE1BQ3JCLGFBQWEsS0FBSyx1QkFBdUIsQ0FBQyxLQUFLLG9CQUFvQixJQUFJLENBQUM7QUFBQSxNQUN4RTtBQUFBLE1BQ0EsTUFBTSxTQUFTLGVBQWUsU0FBUztBQUFBLE1BQ3ZDO0FBQUEsTUFDQSxZQUFXLG9CQUFJLEtBQUssR0FBRSxZQUFZO0FBQUEsTUFDbEMsR0FBSSxXQUFXLEVBQUUsU0FBUyxJQUFJLENBQUM7QUFBQSxJQUNoQztBQUNBLFNBQUssdUJBQXVCLE1BQU07QUFDbEMsU0FBSyxxQkFBcUIsV0FBVyxRQUFRLEtBQUssRUFBRSxNQUFNLFNBQU87QUFDaEUsV0FBSyxXQUFXLEtBQUssOENBQThDLEdBQUc7QUFBQSxJQUN2RSxDQUFDO0FBQUEsRUFDRjtBQUFBO0FBQUEsRUFHUSxhQUFhLE1BQTRCLE1BQW9CO0FBQ3BFLFNBQUssY0FBYyxTQUFTLFNBQVMsZUFBZSxlQUFlLElBQUk7QUFBQSxFQUN4RTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBV1EsdUJBQXVCLE1BQWMsTUFBbUQ7QUFDL0YsUUFBSSxDQUFDLFFBQVEsT0FBTyxLQUFLLElBQUksRUFBRSxXQUFXLEdBQUc7QUFDNUMsYUFBTyxHQUFHLElBQUk7QUFBQSxJQUNmO0FBQ0EsVUFBTSxRQUFrQixDQUFDO0FBQ3pCLGVBQVcsQ0FBQyxHQUFHLENBQUMsS0FBSyxPQUFPLFFBQVEsSUFBSSxHQUFHO0FBRTFDLFVBQUk7QUFDSixVQUFJLE9BQU8sTUFBTSxVQUFVO0FBQzFCLG1CQUFXLEVBQUUsU0FBUyxNQUFNLEdBQUcsRUFBRSxNQUFNLEdBQUcsR0FBRyxDQUFDLFFBQVE7QUFDdEQsbUJBQVcsS0FBSyxVQUFVLFFBQVE7QUFBQSxNQUNuQyxPQUFPO0FBQ04sWUFBSTtBQUNILGdCQUFNLE9BQU8sS0FBSyxVQUFVLENBQUM7QUFDN0IscUJBQVcsS0FBSyxTQUFTLE1BQU0sR0FBRyxLQUFLLE1BQU0sR0FBRyxHQUFHLENBQUMsUUFBUTtBQUFBLFFBQzdELFFBQVE7QUFDUCxxQkFBVyxPQUFPLENBQUM7QUFBQSxRQUNwQjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLEtBQUssR0FBRyxDQUFDLElBQUksUUFBUSxFQUFFO0FBQUEsSUFDOUI7QUFDQSxXQUFPLEdBQUcsSUFBSSxJQUFJLE1BQU0sS0FBSyxJQUFJLENBQUM7QUFBQSxFQUNuQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFlUSxvQkFBb0IsT0FBb0U7QUFDL0YsVUFBTSxNQUFrQyxDQUFDO0FBRXpDLGVBQVcsS0FBSyxPQUFPO0FBSXRCLFlBQU0sT0FBd0MsRUFBRTtBQUNoRCxVQUFJLENBQUMsTUFBTTtBQUNWO0FBQUEsTUFDRDtBQUNBLFlBQU0sUUFBa0M7QUFBQSxRQUN2QztBQUFBLFFBQ0EsTUFBTSxFQUFFO0FBQUEsUUFDUixXQUFXLElBQUksS0FBSyxFQUFFLFNBQVMsRUFBRSxZQUFZO0FBQUEsUUFDN0MsR0FBSSxFQUFFLFVBQVUsV0FBVyxFQUFFLFVBQVUsRUFBRSxTQUFTLFNBQVMsSUFBSSxDQUFDO0FBQUEsUUFDaEUsR0FBSSxFQUFFLFVBQVUsa0JBQWtCLEVBQUUsaUJBQWlCLEVBQUUsU0FBUyxnQkFBZ0IsSUFBSSxDQUFDO0FBQUEsUUFDckYsR0FBSSxFQUFFLFVBQVUsZUFBZSxFQUFFLGNBQWMsRUFBRSxTQUFTLGFBQWEsSUFBSSxDQUFDO0FBQUEsTUFDN0U7QUFDQSxVQUFJLEtBQUssS0FBSztBQUFBLElBQ2Y7QUFJQSxRQUFJO0FBQ0gsWUFBTSxXQUFXLEtBQUsscUJBQXFCLE1BQU0sU0FBUyxPQUFPLE9BQUssQ0FBQyxFQUFFLFdBQVcsQ0FBQztBQUNyRixpQkFBVyxXQUFXLFVBQVU7QUFDL0IsY0FBTSxRQUFRLEtBQUssWUFBWSxXQUFXLFFBQVEsUUFBUTtBQUMxRCxjQUFNLFVBQVUsT0FBTyxZQUFZLEVBQUUsR0FBRyxFQUFFO0FBQzFDLGNBQU0sUUFBUSxTQUFTLFVBQVUsU0FBUztBQUMxQyxZQUFJLENBQUMsT0FBTztBQUNYO0FBQUEsUUFDRDtBQUNBLGNBQU0sT0FBTyxNQUNYLE9BQU8sT0FBSyxFQUFFLFNBQVMsaUJBQWlCLEVBQ3hDLElBQUksT0FBTSxFQUFxQyxRQUFRLEtBQUssRUFDNUQsS0FBSyxHQUFHLEVBQ1IsS0FBSztBQUNQLFlBQUksQ0FBQyxNQUFNO0FBQ1Y7QUFBQSxRQUNEO0FBQ0EsY0FBTSxVQUFVLEtBQUssZ0JBQWdCLE1BQU0sdUJBQXVCLGlDQUFpQztBQUNuRyxZQUFJLENBQUMsU0FBUztBQUNiO0FBQUEsUUFDRDtBQUNBLFlBQUksS0FBSztBQUFBLFVBQ1IsTUFBTTtBQUFBLFVBQ04sTUFBTTtBQUFBLFVBQ04sWUFBVyxvQkFBSSxLQUFLLEdBQUUsWUFBWTtBQUFBLFVBQ2xDLGlCQUFpQixRQUFRLFNBQVMsU0FBUztBQUFBLFFBQzVDLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxTQUFTLEtBQUs7QUFDYixXQUFLLFdBQVcsS0FBSyxvRUFBb0UsR0FBRztBQUFBLElBQzdGO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFRLGdCQUFnQixNQUFjLEdBQW1CO0FBQ3hELFVBQU0sWUFBWSxLQUFLLFFBQVEsUUFBUSxHQUFHLEVBQUUsS0FBSztBQUNqRCxRQUFJLENBQUMsV0FBVztBQUNmLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxZQUFzQixDQUFDO0FBQzdCLFVBQU0sS0FBSztBQUNYLFFBQUk7QUFDSixZQUFRLElBQUksR0FBRyxLQUFLLFNBQVMsT0FBTyxRQUFRLFVBQVUsU0FBUyxHQUFHO0FBQ2pFLGdCQUFVLEtBQUssRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDO0FBQUEsSUFDM0I7QUFDQSxRQUFJLFVBQVUsV0FBVyxHQUFHO0FBQzNCLGFBQU8sVUFBVSxTQUFTLE1BQU0sR0FBRyxVQUFVLE1BQU0sR0FBRyxHQUFHLENBQUMsUUFBUTtBQUFBLElBQ25FO0FBQ0EsV0FBTyxVQUFVLEtBQUssR0FBRztBQUFBLEVBQzFCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVVRLG9CQUFvQixZQUF1QjtBQUNsRCxVQUFNLFVBQVUsNkJBQTZCLFVBQVU7QUFDdkQsUUFBSSxDQUFDLFNBQVM7QUFDYjtBQUFBLElBQ0Q7QUFDQSxVQUFNLE9BQU8sUUFBUSxTQUFTO0FBQzlCLFVBQU0sS0FBSyxXQUFXLFNBQVM7QUFDL0IsUUFBSSxLQUFLLHVCQUF1QixJQUFJLElBQUksTUFBTSxJQUFJO0FBQ2pEO0FBQUEsSUFDRDtBQUNBLFNBQUssdUJBQXVCLElBQUksTUFBTSxFQUFFO0FBSXhDLFNBQUssY0FBYyxNQUFNLEVBQUU7QUFBQSxFQUM1QjtBQUFBO0FBQUE7QUFBQSxFQUlRLGNBQWMsTUFBYyxJQUFrQjtBQUNyRCxRQUFJLFNBQVMsSUFBSTtBQUNoQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVcsQ0FBSSxNQUE0QjtBQUNoRCxVQUFJLEVBQUUsSUFBSSxJQUFJLEdBQUc7QUFDaEIsWUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUc7QUFDZixZQUFFLElBQUksSUFBSSxFQUFFLElBQUksSUFBSSxDQUFFO0FBQUEsUUFDdkI7QUFDQSxVQUFFLE9BQU8sSUFBSTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBQ0EsVUFBTSxXQUFXLENBQUMsTUFBeUI7QUFDMUMsVUFBSSxFQUFFLElBQUksSUFBSSxHQUFHO0FBQ2hCLFVBQUUsT0FBTyxJQUFJO0FBQ2IsVUFBRSxJQUFJLEVBQUU7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUNBLGFBQVMsS0FBSyxrQkFBa0I7QUFDaEMsYUFBUyxLQUFLLHlCQUF5QjtBQUN2QyxhQUFTLEtBQUssaUJBQWlCO0FBQy9CLGFBQVMsS0FBSyx3QkFBd0I7QUFDdEMsYUFBUyxLQUFLLHFCQUFxQjtBQUNuQyxhQUFTLEtBQUssd0JBQXdCO0FBQ3RDLGFBQVMsS0FBSyx3QkFBd0I7QUFDdEMsYUFBUyxLQUFLLG1CQUFtQjtBQUNqQyxhQUFTLEtBQUssZ0JBQWdCO0FBQzlCLGFBQVMsS0FBSyw0QkFBNEI7QUFDMUMsYUFBUyxLQUFLLGNBQWM7QUFDNUIsYUFBUyxLQUFLLGdDQUFnQztBQUM5QyxhQUFTLEtBQUsscUJBQXFCO0FBQ25DLFNBQUsscUJBQXFCLE1BQU0sS0FBSztBQUNyQyxRQUFJLEtBQUssY0FBYyxFQUFFLEdBQUc7QUFDM0IsV0FBSyxxQkFBcUIsSUFBSSxJQUFJO0FBQUEsSUFDbkM7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRUSxZQUFZLElBQW9CO0FBQ3ZDLFdBQU8sS0FBSyx1QkFBdUIsSUFBSSxFQUFFLEtBQUs7QUFBQSxFQUMvQztBQUFBO0FBQUEsRUFHUSxjQUFjLEtBQXNCO0FBQzNDLFdBQU8sS0FBSyw2QkFBNkIsSUFBSSxHQUFHLEtBQzVDLEtBQUssbUJBQW1CLElBQUksR0FBRyxLQUMvQixLQUFLLDBCQUEwQixJQUFJLEdBQUc7QUFBQSxFQUMzQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9RLG9CQUFvQixJQUE0QztBQUN2RSxXQUFPLEtBQU0sS0FBSyx1QkFBdUIsSUFBSSxFQUFFLEtBQUssS0FBTTtBQUFBLEVBQzNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFjUSx1QkFBMkM7QUFDbEQsV0FBTyxLQUFLLGtCQUFrQixtQkFBbUIsV0FBVyxpQkFBaUIsU0FBUztBQUFBLEVBQ3ZGO0FBQUEsRUFFUSwyQkFBaUM7QUFFeEMsUUFBSSxLQUFLLDRCQUE0QjtBQUNwQztBQUFBLElBQ0Q7QUFDQSxVQUFNLFVBQVUsS0FBSyxxQkFBcUI7QUFDMUMsUUFBSSxTQUFTO0FBQ1osV0FBSyxzQkFBc0IsSUFBSSxNQUFNLE9BQU8sQ0FBQztBQUM3QztBQUFBLElBQ0Q7QUFJQSxTQUFLLGFBQWE7QUFDbEIsU0FBSyxtQkFBbUIsb0JBQW9CO0FBQUEsRUFDN0M7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFRLG9CQUFvQixRQUEyQjtBQUN0RCxTQUFLLFVBQVUsT0FBTyxxQkFBcUIsT0FBSyxLQUFLLGdCQUFnQixFQUFFLHNCQUFzQixDQUFDLENBQUM7QUFNL0YsU0FBSyxnQkFBZ0IsT0FBTyxXQUFXLGVBQWU7QUFBQSxFQUN2RDtBQUFBO0FBQUEsRUFHUSxnQkFBZ0IsVUFBaUM7QUFHeEQsUUFBSSxLQUFLLDRCQUE0QjtBQUNwQztBQUFBLElBQ0Q7QUFDQSxVQUFNLE1BQU0sVUFBVSxTQUFTO0FBQy9CLFFBQUksQ0FBQyxPQUFPLFFBQVEsS0FBSyxxQkFBcUI7QUFDN0M7QUFBQSxJQUNEO0FBQ0EsU0FBSyxXQUFXLE1BQU0seUJBQXlCLEdBQUcsK0JBQStCO0FBQ2pGLFNBQUssc0JBQXNCLFFBQVM7QUFBQSxFQUNyQztBQUFBO0FBQUEsRUFHUSxzQkFBc0IsVUFBcUI7QUFDbEQsVUFBTSxNQUFNLFNBQVMsU0FBUztBQUM5QixTQUFLLHNCQUFzQjtBQUkzQixTQUFLLG9CQUFvQixRQUFRO0FBUWpDLFFBQUksQ0FBQyxLQUFLLGFBQWEsSUFBSSxHQUFHO0FBQzdCLFdBQUssV0FBVyxNQUFNLGlDQUFpQyxJQUFJLE1BQU0sR0FBRyxDQUFDLGlEQUFpRCxLQUFLLDBCQUEwQixHQUFHO0FBQ3hKO0FBQUEsSUFDRDtBQUNBLFVBQU0sY0FBYyxLQUFLLHVCQUF1QixHQUFHO0FBQ25ELFNBQUssNEJBQTRCLEdBQUc7QUFDcEMsUUFBSSxLQUFLLDJCQUEyQixRQUFRLEdBQUc7QUFDOUMsV0FBSyxtQkFBbUIsUUFBUTtBQUFBLElBQ2pDO0FBR0EsUUFBSSxLQUFLLDhCQUE4QixDQUFDLEtBQUssc0JBQXNCLElBQUksR0FBRyxHQUFHO0FBQzVFLFlBQU0sUUFBUSxLQUFLLHlCQUF5QixJQUFJLEdBQUc7QUFDbkQsVUFBSSxPQUFPO0FBQ1YsYUFBSyxzQkFBc0IsSUFBSSxLQUFLLEVBQUUsWUFBWSxPQUFPLElBQUksS0FBSyxJQUFJLEVBQUUsQ0FBQztBQUFBLE1BQzFFO0FBQUEsSUFDRDtBQVNBLFFBQUksYUFBYSxLQUFLLG1CQUFtQixRQUFRO0FBQ2pELFVBQU0sYUFBYSxLQUFLLFlBQVksR0FBRztBQUN2QyxVQUFNLGlCQUFpQixLQUFLLDBCQUEwQixJQUFJLFVBQVU7QUFDcEUsVUFBTSx3QkFBd0IsQ0FBQyxDQUFDLGtCQUM1QixZQUFZLGlCQUFpQixTQUFTLEtBQUsscUJBQXFCLGNBQWMsQ0FBQztBQUNuRixTQUFLLFdBQVcsTUFBTSwwQkFBMEIsSUFBSSxNQUFNLEdBQUcsQ0FBQyxlQUFlLEtBQUssMEJBQTBCLElBQUksVUFBVSxJQUFJLFdBQVcsTUFBTSxHQUFHLElBQUksUUFBUSxlQUFlLFlBQVksUUFBUSxRQUFRLGlCQUFpQixZQUFZLGlCQUFpQixNQUFNLG1CQUFtQixxQkFBcUIsRUFBRTtBQUl2UyxRQUFJLENBQUMsY0FBYyxrQkFBa0IsQ0FBQyx1QkFBdUI7QUFDNUQsbUJBQWEsRUFBRSxNQUFNLFlBQVksTUFBTSxlQUFlO0FBQUEsSUFDdkQ7QUFNQSxRQUFJLGtCQUFrQjtBQU10QixTQUFLLGFBQWE7QUFDbEIsU0FBSyxtQkFBbUIsb0JBQW9CO0FBQzVDLFFBQUksWUFBWTtBQUNmLFlBQU0sZ0JBQWdCLFdBQVcsU0FBUyxjQUN0QyxZQUFZLGlCQUFpQixTQUFTLEtBQUsscUJBQXFCLFdBQVcsSUFBSSxDQUFDO0FBQ3BGLFVBQUksZUFBZTtBQUNsQixhQUFLLGtCQUFrQixJQUFJLFlBQVksV0FBVyxJQUFJO0FBQ3RELDBCQUFrQjtBQUFBLE1BQ25CLE9BQU87QUFLTixjQUFNLGtCQUFrQixXQUFXLFNBQVMsY0FDeEMsS0FBSyxxQkFBcUIsR0FBRyxNQUFNLFdBQVc7QUFNbEQsY0FBTSxzQkFBc0IsV0FBVyxTQUFTLGNBQzVDLEtBQUssaUJBQWlCLElBQUksVUFBVSxNQUFNLEtBQUssb0JBQW9CLFVBQVU7QUFZakYsY0FBTSxnQkFBZ0IsV0FBVyxTQUFTLGNBQ3RDLENBQUMsS0FBSywwQkFBMEIsSUFBSSxVQUFVO0FBT2xELGNBQU0sMkJBQTJCLFlBQVksYUFBYSxRQUN0RCxXQUFXLFNBQVMsY0FDcEIsQ0FBQyxDQUFDLFlBQVksc0JBQ2QsS0FBSyxxQkFBcUIsV0FBVyxJQUFJLE1BQU0sWUFBWTtBQUMvRCxZQUFJLHFCQUFxQjtBQUN4QixlQUFLLFdBQVcsTUFBTSwwQkFBMEIsV0FBVyxJQUFJLHNCQUFzQixJQUFJLE1BQU0sR0FBRyxDQUFDLEVBQUU7QUFBQSxRQUN0RyxXQUFXLGVBQWU7QUFDekIsZUFBSyxXQUFXLE1BQU0sa0VBQWtFLElBQUksTUFBTSxHQUFHLENBQUMsRUFBRTtBQUFBLFFBQ3pHLFdBQVcsMEJBQTBCO0FBQ3BDLGVBQUssV0FBVyxNQUFNLHVFQUF1RSxJQUFJLE1BQU0sR0FBRyxDQUFDLEVBQUU7QUFBQSxRQUM5RyxPQUFPO0FBQ04sZUFBSyxTQUFTLEtBQUssV0FBVyxNQUFNLFdBQVcsTUFBTSxRQUFXLFFBQVcsV0FBVyxrQkFBa0IsV0FBVyxPQUFPO0FBQUEsUUFDM0g7QUFDQSxZQUFJLFdBQVcsU0FBUyxZQUFZO0FBS25DLDRCQUFrQixtQkFBbUI7QUFBQSxRQUN0QztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBU0EsUUFBSSxpQkFBaUI7QUFDcEIsV0FBSyxzQkFBc0IsVUFBVTtBQUFBLElBQ3RDO0FBQUEsRUFDRDtBQUFBO0FBQUEsRUFHUSxTQUFTLFdBQW1CLE1BQTBCLE1BQWMsU0FBa0IsWUFBZ0Qsa0JBQTBDLFNBQTBDO0FBQ2pPLFFBQUksQ0FBQyxNQUFNO0FBQ1YsYUFBTztBQUFBLElBQ1I7QUFNQSxRQUFJLFNBQVMsY0FBYyxLQUFLLHFCQUFxQixTQUFTLE1BQU0sTUFBTTtBQUN6RSxhQUFPO0FBQUEsSUFDUjtBQU1BLFVBQU0sYUFBYSxLQUFLLFlBQVksU0FBUztBQUM3QyxVQUFNLFdBQVcsS0FBSyxvQkFBb0IsRUFBRSxNQUFNLFNBQVMsaUJBQWlCLENBQUM7QUFDN0UsZUFBVyxLQUFLLEtBQUssNEJBQTRCLE9BQU8sR0FBRztBQUMxRCxVQUFJLEVBQUUsU0FBUyxRQUFRLEtBQUssb0JBQW9CLENBQUMsTUFBTSxZQUFZLEtBQUssWUFBWSxFQUFFLFNBQVMsTUFBTSxZQUFZO0FBQ2hILGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFFBQUksU0FBUyxZQUFZO0FBQ3hCLFdBQUssMkJBQTJCO0FBQUEsSUFDakM7QUFDQSxRQUFJLFNBQVMsZ0JBQWdCO0FBQzVCLFdBQUssYUFBYTtBQUNsQixXQUFLLG1CQUFtQixvQkFBb0I7QUFBQSxJQUM3QztBQUNBLFNBQUssV0FBVyxNQUFNLHdCQUF3QixJQUFJLE9BQU8sVUFBVSxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQy9FLFVBQU0sY0FBYyxLQUFLLG1CQUFtQixpQkFBaUIsV0FBVyxNQUFNLE1BQU0sU0FBUyxZQUFZLGtCQUFrQixPQUFPO0FBQ2xJLFFBQUksQ0FBQyxhQUFhO0FBQ2pCLFVBQUksU0FBUyxjQUFjO0FBQzFCLGVBQU87QUFBQSxNQUNSO0FBS0EsV0FBSyx5QkFBeUIsSUFBSSxXQUFXLEVBQUUsTUFBTSxNQUFNLGtCQUFrQixRQUFRLENBQUM7QUFDdEYsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLFNBQVMsY0FBYztBQUMxQixXQUFLLFdBQVcsTUFBTSw4Q0FBOEMsV0FBVyxlQUFlLFlBQVksYUFBYSxXQUFXLFVBQVUsWUFBWSxnQkFBZ0IsV0FBVyxhQUFhLFlBQVksWUFBWSxDQUFDLFNBQVMsS0FBSyxVQUFVLElBQUksQ0FBQyxFQUFFO0FBQUEsSUFDelA7QUFRQSxTQUFLLG9CQUFvQjtBQUN6QixTQUFLLHlCQUF5QixPQUFPLFNBQVM7QUFLOUMsU0FBSyxlQUFlLFVBQVU7QUFNOUIsUUFBSSxLQUFLLHVCQUF1QixRQUFRLElBQUk7QUFDM0MsWUFBTSxTQUFTLEtBQUssdUJBQXVCLE9BQU8sRUFBRSxLQUFLLEVBQUU7QUFDM0QsVUFBSSxXQUFXLFFBQVc7QUFDekIsYUFBSyx1QkFBdUIsT0FBTyxNQUFNO0FBQUEsTUFDMUM7QUFBQSxJQUNEO0FBQ0EsU0FBSyx1QkFBdUIsSUFBSSxXQUFXO0FBUTNDLFVBQU0sa0JBQWtCLFdBQVcsTUFBTTtBQUN4QyxXQUFLLDJDQUEyQyxXQUFXO0FBQUEsSUFDNUQsR0FBRyx1QkFBdUIsMkNBQTJDO0FBQ3JFLFNBQUssNEJBQTRCLElBQUksYUFBYTtBQUFBLE1BQ2pEO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxrQkFBa0I7QUFBQSxJQUNuQixDQUFDO0FBQ0QsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLG9DQUFvQyxhQUF1QztBQUNsRixRQUFJLENBQUMsYUFBYTtBQUNqQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFVBQVUsS0FBSyw0QkFBNEIsSUFBSSxXQUFXO0FBQ2hFLFFBQUksQ0FBQyxXQUFXLFFBQVEsa0JBQWtCO0FBQ3pDO0FBQUEsSUFDRDtBQUlBLFlBQVEsbUJBQW1CO0FBQzNCLGlCQUFhLFFBQVEsZUFBZTtBQUFBLEVBQ3JDO0FBQUEsRUFFUSwyQ0FBMkMsYUFBMkI7QUFDN0UsVUFBTSxVQUFVLEtBQUssNEJBQTRCLElBQUksV0FBVztBQUNoRSxRQUFJLENBQUMsV0FBVyxRQUFRLGtCQUFrQjtBQUN6QztBQUFBLElBQ0Q7QUFDQSxTQUFLLDRCQUE0QixPQUFPLFdBQVc7QUFDbkQsU0FBSyx1QkFBdUIsT0FBTyxXQUFXO0FBTTlDLFFBQUksS0FBSyx1QkFBdUIsS0FBSywyQkFBMkIsR0FBRztBQUNsRSxXQUFLLFdBQVcsTUFBTSwrQkFBK0IsWUFBWSxNQUFNLEdBQUcsQ0FBQyxDQUFDLDhGQUE4RjtBQUMxSztBQUFBLElBQ0Q7QUFDQSxTQUFLLFdBQVcsTUFBTSwrQkFBK0IsWUFBWSxNQUFNLEdBQUcsQ0FBQyxDQUFDLDBEQUEwRDtBQUN0SSxTQUFLLHdDQUF3QztBQUFBLEVBQzlDO0FBQUE7QUFBQTtBQUFBLEVBSVEsNkJBQXNDO0FBQzdDLGVBQVcsV0FBVyxLQUFLLDRCQUE0QixPQUFPLEdBQUc7QUFDaEUsVUFBSSxDQUFDLFFBQVEsa0JBQWtCO0FBQzlCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxnQ0FBZ0MsYUFBcUIsU0FBMkM7QUFDdkcsaUJBQWEsUUFBUSxlQUFlO0FBQ3BDLFNBQUssNEJBQTRCLE9BQU8sV0FBVztBQUFBLEVBQ3BEO0FBQUEsRUFFUSxrQ0FBa0MsV0FBbUIsYUFBcUIsV0FBaUQ7QUFDbEksUUFBSSxXQUFXLFNBQVMsZ0JBQWdCLFVBQVUsWUFBWTtBQUM3RCxXQUFLLG1CQUFtQiw4QkFBOEIsV0FBVyxhQUFhLFVBQVUsVUFBVTtBQUFBLElBQ25HO0FBQUEsRUFDRDtBQUFBLEVBRVEsMENBQWdEO0FBQ3ZELFFBQUksS0FBSyxtQkFBbUIsYUFBYSxLQUFLLFlBQVksU0FBUyxLQUFLLEtBQUssOEJBQThCLFFBQVEsS0FBSyxVQUFVO0FBQ2pJO0FBQUEsSUFDRDtBQUNBLFFBQUksS0FBSyxvQkFBb0IsS0FBSyxLQUFLLFdBQVcsS0FBSyxhQUFhLElBQUksR0FBRztBQUMxRSxXQUFLLGlCQUFpQjtBQUN0QjtBQUFBLElBQ0Q7QUFDQSxTQUFLLFlBQVksSUFBSSxRQUFRLE1BQVM7QUFDdEMsU0FBSyxZQUFZLElBQUksb0JBQW9CLE1BQVM7QUFBQSxFQUNuRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxvQkFBb0IsYUFBMkI7QUFDdEQsVUFBTSxZQUFZLEtBQUssNEJBQTRCLElBQUksV0FBVztBQUNsRSxRQUFJLENBQUMsV0FBVztBQUNmO0FBQUEsSUFDRDtBQUNBLFNBQUssZ0NBQWdDLGFBQWEsU0FBUztBQUkzRCxVQUFNLGFBQWEsS0FBSyxZQUFZLFVBQVUsU0FBUztBQUN2RCxRQUFJLFVBQVUsU0FBUyxZQUFZO0FBQ2xDLFdBQUssa0JBQWtCLElBQUksWUFBWSxVQUFVLElBQUk7QUFDckQsV0FBSyxzQkFBc0IsVUFBVTtBQUFBLElBQ3RDLFdBQVcsVUFBVSxTQUFTLGdCQUFnQjtBQU83QyxXQUFLLGlCQUFpQixJQUFJLFlBQVksS0FBSyxvQkFBb0IsU0FBUyxDQUFDO0FBQ3pFLFdBQUssV0FBVyxNQUFNLGtDQUFrQyxXQUFXLE1BQU0sR0FBRyxDQUFDLDZCQUE2QjtBQUFBLElBQzNHO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFZUSxvQkFBb0IsR0FBNkI7QUFDeEQsUUFBSSxFQUFFLGdCQUFnQixZQUFZO0FBQ2pDO0FBQUEsSUFDRDtBQUNBLFVBQU0sTUFBTSxLQUFLLFlBQVksRUFBRSxlQUFlO0FBQzlDLFVBQU0sWUFBWSxLQUFLLDRCQUE0QixJQUFJLEVBQUUsV0FBVztBQUNwRSxRQUFJLFdBQVc7QUFDZCxXQUFLLGdDQUFnQyxFQUFFLGFBQWEsU0FBUztBQUFBLElBQzlEO0FBQ0EsU0FBSyx1QkFBdUIsT0FBTyxFQUFFLFdBQVc7QUFDaEQsUUFBSSxFQUFFLGdCQUFnQixhQUFhLEVBQUUsZ0JBQWdCLGNBQWM7QUFDbEUsV0FBSyxXQUFXLE1BQU0seUJBQXlCLEVBQUUsV0FBVyxPQUFPLEVBQUUsWUFBWSxNQUFNLEdBQUcsQ0FBQyxDQUFDLFdBQVcsRUFBRSxVQUFVLFFBQVEsWUFBWTtBQUN2SSxXQUFLLGVBQWUsR0FBRztBQUN2QixVQUFJLFdBQVc7QUFDZCxhQUFLLGlCQUFpQixXQUE0RSx5QkFBeUIsRUFBRSxNQUFNLFVBQVUsTUFBTSxRQUFRLEVBQUUsWUFBWSxDQUFDO0FBQUEsTUFDM0s7QUFDQTtBQUFBLElBQ0Q7QUFFQSxVQUFNLE9BQU8sV0FBVztBQUN4QixVQUFNLE9BQU8sV0FBVztBQUN4QixRQUFJLFFBQVEsTUFBTTtBQUNqQixVQUFJLFNBQVMsY0FBYztBQUMxQixhQUFLLFdBQVcsTUFBTSxpQ0FBaUMsRUFBRSxZQUFZLE1BQU0sR0FBRyxDQUFDLENBQUMsdUJBQXVCO0FBQ3ZHO0FBQUEsTUFDRDtBQUNBLFdBQUssV0FBVyxNQUFNLGlDQUFpQyxFQUFFLFlBQVksTUFBTSxHQUFHLENBQUMsQ0FBQyxXQUFXLEVBQUUsVUFBVSxRQUFRLGFBQWE7QUFDNUgsV0FBSyxvQkFBb0IsSUFBSSxLQUFLLEVBQUUsYUFBYSxFQUFFLGFBQWEsTUFBTSxNQUFNLGtCQUFrQixNQUFNLGtCQUFrQixVQUFVLGtCQUFrQixTQUFTLFVBQVUsUUFBUSxDQUFDO0FBQzlLLFdBQUssaUJBQWlCLFdBQThFLDBCQUEwQixFQUFFLE1BQU0sUUFBUSxPQUFPLENBQUM7QUFBQSxJQUN2SjtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFRLDRCQUE0QixHQUFnQztBQUNuRSxVQUFNLFlBQVksS0FBSyw0QkFBNEIsSUFBSSxFQUFFLFdBQVc7QUFDcEUsUUFBSSxXQUFXO0FBQ2QsVUFBSSxVQUFVLFNBQVMsY0FBYztBQUNwQyxhQUFLLDJCQUEyQixFQUFFLGlCQUFpQixFQUFFLFdBQVc7QUFDaEU7QUFBQSxNQUNEO0FBQ0EsV0FBSywyQkFBMkIsRUFBRSxhQUFhLFNBQVM7QUFDeEQsV0FBSyxXQUFXLE1BQU0sb0NBQW9DLEVBQUUsWUFBWSxNQUFNLEdBQUcsQ0FBQyxDQUFDLDhCQUE4QjtBQUNqSCxXQUFLLGlCQUFpQixXQUE4RSwwQkFBMEIsRUFBRSxNQUFNLFVBQVUsTUFBTSxRQUFRLGNBQWMsQ0FBQztBQUFBLElBQzlLLE9BQU87QUFDTixXQUFLLHVCQUF1QixPQUFPLEVBQUUsV0FBVztBQUFBLElBQ2pEO0FBQUEsRUFDRDtBQUFBLEVBRVEsMkJBQTJCLGFBQXFCLFdBQTZDO0FBQ3BHLFNBQUssZ0NBQWdDLGFBQWEsU0FBUztBQUMzRCxTQUFLLHVCQUF1QixPQUFPLFdBQVc7QUFDOUMsUUFBSSxVQUFVLFNBQVMsY0FBYztBQUNwQztBQUFBLElBQ0Q7QUFDQSxTQUFLLG9CQUFvQixJQUFJLEtBQUssWUFBWSxVQUFVLFNBQVMsR0FBRztBQUFBLE1BQ25FO0FBQUEsTUFDQSxNQUFNLFVBQVU7QUFBQSxNQUNoQixNQUFNLFVBQVU7QUFBQSxNQUNoQixrQkFBa0I7QUFBQSxNQUNsQixTQUFTLFVBQVU7QUFBQSxNQUNuQixrQkFBa0IsVUFBVTtBQUFBLElBQzdCLENBQUM7QUFBQSxFQUNGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVVEsd0JBQXdCLFlBQW9CLHNCQUF3QztBQUMzRixVQUFNLFdBQVcsS0FBSyxvQkFBb0IsSUFBSSxVQUFVO0FBQ3hELFFBQUksQ0FBQyxVQUFVO0FBQ2QsV0FBSyxXQUFXLE1BQU0sbUNBQW1DLFdBQVcsTUFBTSxHQUFHLENBQUMseUNBQXlDO0FBQ3ZILGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSx3QkFBd0IsU0FBUyxnQkFBZ0Isc0JBQXNCO0FBQzFFLFdBQUssV0FBVyxNQUFNLGtDQUFrQyxxQkFBcUIsTUFBTSxHQUFHLENBQUMsQ0FBQyxRQUFRLFdBQVcsTUFBTSxHQUFHLENBQUMseUNBQXlDLFNBQVMsWUFBWSxNQUFNLEdBQUcsQ0FBQyxDQUFDLHlDQUF5QztBQUN2TyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUk7QUFDSixRQUFJO0FBQ0gsaUJBQVcsSUFBSSxNQUFNLFVBQVU7QUFBQSxJQUNoQyxRQUFRO0FBQ1AsaUJBQVc7QUFBQSxJQUNaO0FBQ0EsVUFBTSxhQUFhLFdBQVcsS0FBSyxtQkFBbUIsUUFBUSxJQUFJO0FBQ2xFLFFBQUksQ0FBQyxjQUNELFdBQVcsU0FBUyxTQUFTLFFBQzdCLFdBQVcsU0FBUyxTQUFTLFFBQzVCLFNBQVMsU0FBUyxrQkFBa0IsV0FBVyxxQkFBcUIsU0FBUyxrQkFBbUI7QUFDcEcsV0FBSyxXQUFXLE1BQU0sa0NBQWtDLFdBQVcsTUFBTSxHQUFHLENBQUMsZ0NBQWdDO0FBQzdHLFdBQUssZUFBZSxVQUFVO0FBQzlCLFdBQUssaUJBQWlCLFdBQTRFLHlCQUF5QixFQUFFLE1BQU0sU0FBUyxNQUFNLFFBQVEsUUFBUSxDQUFDO0FBQ25LLGFBQU87QUFBQSxJQUNSO0FBTUEsUUFBSSxLQUFLLHVCQUF1QixVQUFVLEdBQUc7QUFDNUMsV0FBSyxXQUFXLE1BQU0sa0NBQWtDLFdBQVcsTUFBTSxHQUFHLENBQUMsNEJBQTRCO0FBQ3pHLFdBQUssZUFBZSxVQUFVO0FBQzlCLFdBQUssaUJBQWlCLFdBQTRFLHlCQUF5QixFQUFFLE1BQU0sU0FBUyxNQUFNLFFBQVEsa0JBQWtCLENBQUM7QUFDN0ssYUFBTztBQUFBLElBQ1I7QUFJQSxVQUFNLFVBQVUsU0FBUyxvQkFBb0IsS0FBSyxvQkFBb0IsVUFBVSxNQUFNLEtBQUssb0JBQW9CLFFBQVEsSUFBSSxTQUFTLGNBQWM7QUFDbEosU0FBSyxXQUFXLE1BQU0sMkNBQTJDLFdBQVcsTUFBTSxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUMsT0FBTyxFQUFFO0FBQzNHLFNBQUssZUFBZSxVQUFVO0FBQzlCLFdBQU8sS0FBSyxTQUFTLFlBQVksV0FBVyxNQUFNLFdBQVcsTUFBTSxTQUFTLFFBQVcsV0FBVyxrQkFBa0IsV0FBVyxPQUFPO0FBQUEsRUFDdkk7QUFBQSxFQUVRLHVCQUF1QixXQUFtQixTQUFvQztBQUNyRixRQUFJO0FBQ0osUUFBSTtBQUNILGlCQUFXLElBQUksTUFBTSxTQUFTO0FBQUEsSUFDL0IsUUFBUTtBQUNQLFdBQUssV0FBVyxNQUFNLDhEQUE4RDtBQUNwRixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sVUFBVSxLQUFLLG1CQUFtQixRQUFRO0FBQ2hELFFBQUksQ0FBQyxXQUNELFFBQVEsU0FBUyxRQUFRLFFBQ3pCLEtBQUssb0JBQW9CLE9BQU8sTUFBTSxLQUFLLG9CQUFvQixPQUFPLEdBQUc7QUFDNUUsV0FBSyxXQUFXLE1BQU0sZ0NBQWdDLFVBQVUsTUFBTSxHQUFHLENBQUMsNENBQTRDO0FBQ3RILGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxRQUFRLFNBQVMsY0FBYyxLQUFLLHVCQUF1QixLQUFLLFlBQVksU0FBUyxDQUFDLEdBQUc7QUFDNUYsV0FBSyxXQUFXLE1BQU0sZ0NBQWdDLFVBQVUsTUFBTSxHQUFHLENBQUMsK0JBQStCO0FBQ3pHLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxLQUFLLFNBQVMsV0FBVyxRQUFRLE1BQU0sUUFBUSxNQUFNLFFBQVcsUUFBVyxRQUFRLGtCQUFrQixRQUFRLE9BQU87QUFBQSxFQUM1SDtBQUFBO0FBQUEsRUFHUSxlQUFlLFlBQTBCO0FBQ2hELFNBQUssb0JBQW9CLE9BQU8sVUFBVTtBQUFBLEVBQzNDO0FBQUE7QUFBQSxFQUdRLG1CQUFtQixVQUE2QztBQUN2RSxVQUFNLFFBQVEsS0FBSyxZQUFZLFdBQVcsUUFBUTtBQUNsRCxRQUFJLE9BQU87QUFLVixZQUFNLFdBQVcsS0FBSyxvQkFBb0IsS0FBSztBQUMvQyxVQUFJLFVBQVU7QUFDYixlQUFPO0FBQUEsTUFDUjtBQUNBLFlBQU0sT0FBTyxLQUFLLG1CQUFtQixLQUFLO0FBQzFDLFVBQUksS0FBSyxVQUFVLDhCQUE4QixLQUFLLFFBQVE7QUFDN0QsZUFBTyxFQUFFLE1BQU0sZ0JBQWdCLE1BQU0sS0FBSyxRQUFRLGtCQUFrQixLQUFLLGtCQUFrQjtBQUFBLE1BQzVGO0FBQ0EsVUFBSSxLQUFLLFVBQVUsVUFBVSxLQUFLLHVCQUF1QjtBQUN4RCxlQUFPLEVBQUUsTUFBTSxZQUFZLE1BQU0sS0FBSyxzQkFBc0I7QUFBQSxNQUM3RDtBQUNBLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxVQUFVLEtBQUsscUJBQXFCLE1BQU0sU0FBUyxLQUFLLE9BQUssQ0FBQyxFQUFFLFdBQVcsS0FBSyxRQUFRLEVBQUUsVUFBVSxRQUFRLENBQUM7QUFDbkgsUUFBSSxTQUFTLFdBQVcsbUJBQW1CLFlBQVk7QUFFdEQsV0FBSyxtQkFBbUIsUUFBUTtBQUNoQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksU0FBUyxXQUFXLG1CQUFtQixXQUFXO0FBQ3JELFlBQU0sVUFBVSxLQUFLLHlCQUF5QixJQUFJLFNBQVMsU0FBUyxDQUFDO0FBQ3JFLFVBQUksU0FBUztBQUNaLGVBQU8sRUFBRSxNQUFNLFlBQVksTUFBTSxRQUFRO0FBQUEsTUFDMUM7QUFPQSxXQUFLLG1CQUFtQixRQUFRO0FBQ2hDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFVUSxjQUFjLFdBQTJCO0FBR2hELFVBQU0sUUFBUSxLQUFLLGlCQUFpQixTQUFTO0FBQzdDLFlBQVEsUUFBUSxLQUFLLHFCQUFxQixLQUFLLEdBQUcsYUFBYSxXQUFjO0FBQUEsRUFDOUU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBU1Esb0JBQW9CLFlBQWlIO0FBQzVJLFdBQU8sV0FBVyxVQUFVLElBQUksV0FBVyxRQUFRLFNBQVMsS0FBSyxHQUFHLFdBQVcsb0JBQW9CLEVBQUUsSUFBSSxXQUFXLElBQUk7QUFBQSxFQUN6SDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFZUSxvQkFBb0IsT0FBc0g7QUFDakosVUFBTSxVQUFVLFFBQVEsS0FBSyxxQkFBcUIsS0FBSyxJQUFJO0FBQzNELFVBQU0sV0FBVyxTQUFTLFNBQVMsY0FBYyxRQUFRLFlBQVksQ0FBQyxJQUFJO0FBQzFFLFFBQUksQ0FBQyxXQUFXLENBQUMsVUFBVTtBQUMxQixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLE1BQU0scUJBQXFCLFVBQVUsUUFBUSxlQUFlLElBQUk7QUFBQSxNQUNoRSxTQUFTLEVBQUUsV0FBVyxRQUFRLFdBQVc7QUFBQSxJQUMxQztBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFRLDJCQUEyQixVQUF3QjtBQUMxRCxVQUFNLFVBQVUsS0FBSyxxQkFBcUIsTUFBTSxTQUFTLEtBQUssT0FBSyxDQUFDLEVBQUUsV0FBVyxLQUFLLFFBQVEsRUFBRSxVQUFVLFFBQVEsQ0FBQztBQUNuSCxRQUFJLENBQUMsV0FBVyxRQUFRLFdBQVcsbUJBQW1CLFlBQVk7QUFDakUsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFFBQVEsS0FBSyxZQUFZLFdBQVcsUUFBUTtBQUNsRCxRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxPQUFPLEtBQUssbUJBQW1CLEtBQUs7QUFDMUMsV0FBTyxLQUFLLFVBQVUsOEJBQThCLENBQUMsS0FBSztBQUFBLEVBQzNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFXUSxzQkFBMEM7QUFDakQsUUFBSSxLQUFLLDRCQUE0QjtBQUVwQyxhQUFPLEtBQUssZUFBZSxJQUFJLEdBQUcsU0FBUyxLQUFLLEtBQUs7QUFBQSxJQUN0RDtBQUNBLFdBQU8sS0FBSyxlQUFlLElBQUksR0FBRyxTQUFTLEtBQUssS0FBSyx1QkFBdUIsS0FBSyx1QkFBdUIsS0FBSyxxQkFBcUI7QUFBQSxFQUNuSTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFrQlEsa0JBQXNDO0FBQzdDLFFBQUksS0FBSyw0QkFBNEI7QUFDcEMsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFdBQU8sS0FBSyxxQkFBcUI7QUFBQSxFQUNsQztBQUFBLEVBRUEsc0JBQXNCLFVBQWlDO0FBQ3RELFVBQU0sTUFBTSxVQUFVLFNBQVM7QUFPL0IsUUFBSSxDQUFDLFVBQVU7QUFDZCxVQUFJLENBQUMsS0FBSyw4QkFBOEIsS0FBSyx3QkFBd0IsUUFBVztBQUMvRTtBQUFBLE1BQ0Q7QUFDQSxXQUFLLFdBQVcsTUFBTSw4RUFBOEUsS0FBSyx1QkFBdUIsUUFBUSxHQUFHO0FBQzNJLFdBQUssNkJBQTZCO0FBQ2xDLFdBQUssc0JBQXNCO0FBQzNCLFdBQUsseUJBQXlCO0FBQzlCO0FBQUEsSUFDRDtBQUNBLFNBQUssNkJBQTZCO0FBQ2xDLFVBQU0sYUFBYTtBQUNuQixRQUFJLEtBQUssZUFBZSxZQUFZLEtBQUssbUJBQW1CLEdBQUc7QUFROUQsWUFBTSxhQUFhLEtBQUssWUFBWSxVQUFVO0FBQzlDLFVBQUksS0FBSyxjQUFjLFVBQVUsR0FBRztBQUNuQyxhQUFLLFdBQVcsTUFBTSxvQ0FBb0MsVUFBVSx3Q0FBd0M7QUFDNUcsYUFBSyxzQkFBc0IsUUFBUTtBQUFBLE1BQ3BDO0FBQ0E7QUFBQSxJQUNEO0FBQ0EsU0FBSyxXQUFXLE1BQU0saUNBQWlDLFVBQVUsU0FBUyxLQUFLLHVCQUF1QixRQUFRLEdBQUc7QUFDakgsU0FBSyxzQkFBc0I7QUFFM0IsU0FBSyxzQkFBc0IsUUFBUTtBQUFBLEVBQ3BDO0FBQUEsRUFFQSxnQkFBZ0IsVUFBcUI7QUFDcEMsVUFBTSxNQUFNLFNBQVMsU0FBUztBQUM5QixTQUFLLFdBQVcsTUFBTSwyQkFBMkIsR0FBRyx1QkFBdUI7QUFLM0UsUUFBSSxLQUFLLDRCQUE0QjtBQUNwQyxXQUFLLHNCQUFzQjtBQUFBLElBQzVCO0FBQ0EsU0FBSyxzQkFBc0IsUUFBUTtBQUFBLEVBQ3BDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVVEsMkJBQTJCLFlBQWdDLFdBQStCLGNBQWdDO0FBQ2pJLFFBQUksQ0FBQyxZQUFZO0FBQ2hCLGFBQU8sS0FBSyxxQkFBcUIsV0FBVyxZQUFZO0FBQUEsSUFDekQ7QUFDQSxVQUFNLFFBQVEsS0FBSyxnQkFBZ0IsSUFBSSxVQUFVO0FBQ2pELFFBQUksVUFBVSxRQUFXO0FBSXhCLGFBQU8sVUFBVTtBQUFBLElBQ2xCO0FBQ0EsVUFBTSxRQUFRLEtBQUssdUJBQXVCLFNBQVM7QUFDbkQsU0FBSyxnQkFBZ0IsSUFBSSxZQUFZLFFBQVEsYUFBYSxNQUFNO0FBQ2hFLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1RLGVBQWUsR0FBdUIsR0FBZ0M7QUFDN0UsUUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLE1BQU0sS0FBSyxLQUFLLG9CQUFvQixDQUFDLE1BQU0sS0FBSyxvQkFBb0IsQ0FBQyxHQUFHO0FBQzNFLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSTtBQUNILGFBQU8sUUFBUSxJQUFJLE1BQU0sQ0FBQyxHQUFHLElBQUksTUFBTSxDQUFDLENBQUM7QUFBQSxJQUMxQyxRQUFRO0FBQ1AsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBLEVBSVEscUJBQXFCLFdBQXVDO0FBQ25FLFdBQU8sS0FBSyxrQkFBa0IsSUFBSSxLQUFLLFlBQVksU0FBUyxDQUFDO0FBQUEsRUFDOUQ7QUFBQTtBQUFBLEVBR1EsdUJBQXVCLFdBQXlCO0FBQ3ZELFNBQUssa0JBQWtCLE9BQU8sS0FBSyxZQUFZLFNBQVMsQ0FBQztBQUFBLEVBQzFEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1RLHVCQUF1QixXQUF3QztBQUN0RSxRQUFJLENBQUMsV0FBVztBQUNmLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxDQUFDLEtBQUssZUFBZSxLQUFLLGdCQUFnQixHQUFHLFNBQVM7QUFBQSxFQUM5RDtBQUFBO0FBQUE7QUFBQSxFQUlRLDJCQUEyQixXQUFtQixZQUF5QztBQUM5RixRQUFJLENBQUMsWUFBWTtBQUNoQixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sS0FBSyxtQkFBbUIsSUFBSSxTQUFTLEdBQUcsS0FBSyxPQUFLLEVBQUUsZUFBZSxVQUFVLEtBQUs7QUFBQSxFQUMxRjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBY1EscUJBQXFCLFdBQStCLGNBQWdDO0FBQzNGLFVBQU0sTUFBTSxZQUFZLEtBQUssWUFBWSxTQUFTLElBQUk7QUFDdEQsUUFBSSxjQUFjO0FBRWpCLFVBQUksQ0FBQyxXQUFXO0FBQ2YsYUFBSyxlQUFlLElBQUksR0FBRztBQUMzQixlQUFPO0FBQUEsTUFDUjtBQUVBLFVBQUksQ0FBQyxLQUFLLHVCQUF1QixTQUFTLEdBQUc7QUFDNUMsYUFBSyxlQUFlLElBQUksR0FBRztBQUMzQixlQUFPO0FBQUEsTUFDUjtBQUNBLFdBQUssZUFBZSxPQUFPLEdBQUc7QUFDOUIsYUFBTztBQUFBLElBQ1I7QUFHQSxRQUFJLEtBQUssbUJBQW1CLElBQUksR0FBRyxHQUFHO0FBQ3JDLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxLQUFLLGVBQWUsSUFBSSxHQUFHLEdBQUc7QUFDakMsYUFBTztBQUFBLElBQ1I7QUFHQSxXQUFPLEtBQUssdUJBQXVCLFNBQVM7QUFBQSxFQUM3QztBQUFBLEVBRVEsZUFBZSxXQUFtQixPQUFlLGNBQXVCLFNBQWtCLFlBQWdDLFlBQXFCLFFBQXVCO0FBQzdLLFVBQU0sTUFBTSxLQUFLLFlBQVksU0FBUztBQUN0QyxRQUFJLFlBQVksS0FBSyxtQkFBbUIsSUFBSSxHQUFHO0FBQy9DLFFBQUksQ0FBQyxXQUFXO0FBQ2Ysa0JBQVksQ0FBQztBQUNiLFdBQUssbUJBQW1CLElBQUksS0FBSyxTQUFTO0FBQUEsSUFDM0M7QUFPQSxRQUFJO0FBQ0osUUFBSSxDQUFDLGNBQWM7QUFDbEIsaUJBQVcsYUFDUixVQUFVLEtBQUssT0FBSyxFQUFFLGVBQWUsVUFBVSxJQUMvQyxDQUFDLEdBQUcsU0FBUyxFQUFFLFFBQVEsRUFBRSxLQUFLLE9BQUssQ0FBQyxFQUFFLFNBQVM7QUFBQSxJQUNuRDtBQUNBLFFBQUksQ0FBQyxVQUFVO0FBQ2QsaUJBQVcsRUFBRSxZQUFZLFFBQVEsV0FBVyxPQUFPLFFBQVEsQ0FBQyxFQUFFO0FBQzlELGdCQUFVLEtBQUssUUFBUTtBQUN2QixXQUFLLHFCQUFxQixLQUFLLElBQUk7QUFDbkMsV0FBSyxXQUFXLE1BQU0sb0RBQW9ELEdBQUcsY0FBYyxVQUFVLE1BQU0sOEJBQThCO0FBQUEsSUFDMUk7QUFDQSxhQUFTLE9BQU8sS0FBSyxFQUFFLE9BQU8sY0FBYyxTQUFTLFdBQVcsQ0FBQztBQUNqRSxRQUFJLFNBQVM7QUFDWixlQUFTLFlBQVk7QUFBQSxJQUN0QjtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsa0JBQWtCLFdBQXVDO0FBQ2hFLFVBQU0sTUFBTSxLQUFLLFlBQVksU0FBUztBQUN0QyxRQUFJLEtBQUssbUJBQW1CLElBQUksR0FBRyxHQUFHO0FBQ3JDLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxLQUFLLG1CQUFtQixTQUFTLEdBQUc7QUFDdkMsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJO0FBQ0osUUFBSTtBQUFFLG1CQUFhLElBQUksTUFBTSxHQUFHO0FBQUEsSUFBRyxRQUFRO0FBQUUsbUJBQWE7QUFBQSxJQUFXO0FBQ3JFLFFBQUksWUFBWTtBQUNmLGlCQUFXLGFBQWEsS0FBSyxtQkFBbUIsS0FBSyxHQUFHO0FBQ3ZELFlBQUk7QUFDSCxjQUFJLFFBQVEsSUFBSSxNQUFNLFNBQVMsR0FBRyxVQUFVLEdBQUc7QUFBRSxtQkFBTztBQUFBLFVBQVc7QUFBQSxRQUNwRSxRQUFRO0FBQUEsUUFBZ0M7QUFBQSxNQUN6QztBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSx1QkFBdUIsV0FBeUM7QUFDdkUsVUFBTSxNQUFNLEtBQUssa0JBQWtCLFNBQVM7QUFDNUMsUUFBSSxDQUFDLEtBQUs7QUFDVCxVQUFJLEtBQUssbUJBQW1CLE9BQU8sR0FBRztBQUNyQyxhQUFLLFdBQVcsTUFBTSxnREFBZ0QsU0FBUyxtQkFBbUIsQ0FBQyxHQUFHLEtBQUssbUJBQW1CLEtBQUssQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLEdBQUc7QUFBQSxNQUNwSjtBQUNBLGFBQU8sRUFBRSxTQUFTLE9BQU8sa0JBQWtCLENBQUMsRUFBRTtBQUFBLElBQy9DO0FBRUEsVUFBTSxZQUFZLEtBQUssbUJBQW1CLElBQUksR0FBRztBQUNqRCxRQUFJLENBQUMsYUFBYSxVQUFVLFdBQVcsR0FBRztBQUN6QyxXQUFLLG1CQUFtQixPQUFPLEdBQUc7QUFDbEMsV0FBSyxvQkFBb0IsR0FBRztBQUM1QixhQUFPLEVBQUUsU0FBUyxPQUFPLGtCQUFrQixDQUFDLEVBQUU7QUFBQSxJQUMvQztBQVVBLFFBQUksQ0FBQyxLQUFLLG9CQUFvQixHQUFHO0FBQ2hDLFdBQUssV0FBVyxNQUFNLHNDQUFzQyxHQUFHLHVEQUF1RCxVQUFVLE1BQU0sdUJBQXVCO0FBSTdKLFlBQU0saUJBQWlCLFVBQ3JCLElBQUksT0FBSyxLQUFLLHFCQUFxQixDQUFDLEdBQUcsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLEtBQUssT0FBSyxFQUFFLFVBQVUsR0FBRyxjQUFjLEVBQUUsQ0FBQyxFQUNyRyxPQUFPLE9BQUssQ0FBQyxDQUFDLENBQUM7QUFDakIsYUFBTyxFQUFFLFNBQVMsT0FBTyxVQUFVLE1BQU0sb0JBQW9CLGVBQWUsZUFBZSxTQUFTLENBQUMsR0FBRyxrQkFBa0IsQ0FBQyxFQUFFO0FBQUEsSUFDOUg7QUFFQSxTQUFLLG1CQUFtQixPQUFPLEdBQUc7QUFDbEMsU0FBSyxvQkFBb0IsR0FBRztBQUM1QixVQUFNLGNBQWMsVUFBVSxPQUFPLENBQUMsR0FBRyxNQUFNLElBQUksRUFBRSxPQUFPLFFBQVEsQ0FBQztBQUNyRSxTQUFLLFdBQVcsTUFBTSxvQkFBb0IsVUFBVSxNQUFNLDBCQUEwQixXQUFXLHNDQUFzQyxHQUFHLEVBQUU7QUFNMUksZUFBVyxLQUFLLFdBQVc7QUFDMUIsVUFBSSxFQUFFLGNBQWMsQ0FBQyxFQUFFLFdBQVc7QUFDakMsYUFBSyxnQkFBZ0IsSUFBSSxFQUFFLFlBQVksTUFBTTtBQUFBLE1BQzlDO0FBQUEsSUFDRDtBQUlBLFVBQU0sbUJBQW1CLFVBQ3ZCLElBQUksT0FBSyxLQUFLLHFCQUFxQixDQUFDLEdBQUcsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLEtBQUssT0FBSyxFQUFFLFVBQVUsR0FBRyxjQUFjLEVBQUUsQ0FBQyxFQUNyRyxPQUFPLE9BQUssQ0FBQyxDQUFDLENBQUM7QUFLakIsVUFBTSxvQkFBb0IsaUJBQWlCLGlCQUFpQixTQUFTLENBQUM7QUFDdEUsUUFBSSxtQkFBbUI7QUFDdEIsV0FBSyxzQkFBc0IsSUFBSSxLQUFLLEVBQUUsWUFBWSxtQkFBbUIsSUFBSSxLQUFLLElBQUksRUFBRSxDQUFDO0FBQ3JGLFdBQUsseUJBQXlCLElBQUksS0FBSyxpQkFBaUI7QUFBQSxJQUN6RDtBQUdBLGVBQVcsS0FBSyxXQUFXO0FBQzFCLGlCQUFXLFNBQVMsRUFBRSxRQUFRO0FBQzdCLGFBQUssY0FBYyxLQUFLLE1BQU0sT0FBTyxNQUFNLGNBQWMsTUFBTSxTQUFTLE1BQU0sWUFBWSxFQUFFLFVBQVU7QUFBQSxNQUN2RztBQUFBLElBQ0Q7QUFPQSxXQUFPLEVBQUUsU0FBUyxNQUFNLGlCQUFpQjtBQUFBLEVBQzFDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBZ0JRLHNCQUErQjtBQUN0QyxTQUFLLHNCQUFzQjtBQUMzQixTQUFLLHdCQUF3QjtBQVM3QixRQUFJLEtBQUssWUFBWSxDQUFDLEtBQUssd0JBQXdCO0FBQ2xELGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxLQUFLLFVBQVU7QUFLbEIsV0FBSyxXQUFXLFFBQVEsVUFBVTtBQUFBLElBQ25DO0FBQ0EsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyxXQUFXO0FBQ2hCLFNBQUsseUJBQXlCO0FBUTlCLFFBQUksQ0FBQyxLQUFLLG1CQUFtQixhQUFhLEtBQUssOEJBQThCLE1BQU07QUFDbEYsV0FBSyw0QkFBNEI7QUFBQSxJQUNsQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBZ0JRLGVBQWUsWUFBZ0MsV0FBK0IsWUFBZ0MsY0FBdUIsU0FBMkI7QUFDdkssUUFBSSxDQUFDLFdBQVc7QUFDZixhQUFPO0FBQUEsSUFDUjtBQUlBLFVBQU0sVUFBVSxjQUFjO0FBSTlCLFFBQUksY0FBYyxLQUFLLHVCQUF1QixJQUFJLFVBQVUsR0FBRztBQUM5RCxVQUFJLFNBQVM7QUFDWixhQUFLLHVCQUF1QixPQUFPLFVBQVU7QUFBQSxNQUM5QztBQUNBLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxDQUFDLGdCQUFnQixLQUFLLHFCQUFxQixJQUFJLE9BQU8sR0FBRztBQUM1RCxVQUFJLFNBQVM7QUFDWixhQUFLLHFCQUFxQixPQUFPLE9BQU87QUFBQSxNQUN6QztBQUNBLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxDQUFDLGNBQWM7QUFDbEIsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLEtBQUssdUJBQXVCLEtBQUssNkJBQTZCLFdBQVc7QUFDNUUsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFNBQVMsS0FBSyxzQkFBc0IsSUFBSSxTQUFTO0FBQ3ZELFFBQUksV0FBVyxRQUFXO0FBQ3pCLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxLQUFLLElBQUksSUFBSSxPQUFPLEtBQUssdUJBQXVCLDhCQUE4QjtBQUNqRixXQUFLLHNCQUFzQixPQUFPLFNBQVM7QUFDM0MsYUFBTztBQUFBLElBQ1I7QUFJQSxVQUFNLFdBQVcsS0FBSyxxQkFBcUIsY0FBYyxFQUFFO0FBQzNELFFBQUksQ0FBQyxZQUFZLEVBQUUsT0FBTyxlQUFlLFlBQVksT0FBTyxXQUFXLFdBQVcsUUFBUSxJQUFJO0FBQzdGLGFBQU87QUFBQSxJQUNSO0FBS0EsU0FBSyxlQUFlLE9BQU8sU0FBUztBQUNwQyxRQUFJLENBQUMsU0FBUztBQUNiLFdBQUsscUJBQXFCLElBQUksT0FBTztBQUFBLElBQ3RDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUEsRUFJUSxxQkFBcUIsTUFBc0I7QUFDbEQsV0FBTyxLQUFLLFlBQVksRUFBRSxRQUFRLFFBQVEsR0FBRyxFQUFFLFFBQVEsa0NBQWtDLEVBQUUsRUFBRSxLQUFLO0FBQUEsRUFDbkc7QUFBQSxFQUVRLHFCQUFxQixXQUFtQixTQUF3QjtBQUN2RSxRQUFJO0FBQ0gsV0FBSyxxQkFBcUIsbUJBQW1CLElBQUksTUFBTSxTQUFTLEdBQUcsT0FBTztBQUFBLElBQzNFLFFBQVE7QUFBQSxJQUVSO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVVRLGlDQUFpQyxtQkFBc0M7QUFPOUUsVUFBTSxXQUFXLEtBQUssNkJBQ25CLEtBQUssc0JBQ0wsS0FBSyxxQkFBcUI7QUFDN0IsVUFBTSxZQUFZLFdBQVcsS0FBSyxZQUFZLFFBQVEsSUFBSTtBQUMxRCxVQUFNLGNBQWMsb0JBQUksSUFBWTtBQUNwQyxlQUFXLGFBQWEsbUJBQW1CO0FBQzFDLFlBQU0sTUFBTSxLQUFLLFlBQVksU0FBUztBQUN0QyxrQkFBWSxJQUFJLEdBQUc7QUFDbkIsVUFBSSxRQUFRLFdBQVc7QUFFdEIsYUFBSyw0QkFBNEIsR0FBRztBQUNwQztBQUFBLE1BQ0Q7QUFDQSxVQUFJLENBQUMsS0FBSyw2QkFBNkIsSUFBSSxHQUFHLEdBQUc7QUFDaEQsYUFBSyw2QkFBNkIsSUFBSSxHQUFHO0FBQ3pDLGFBQUsscUJBQXFCLEtBQUssSUFBSTtBQUFBLE1BQ3BDO0FBQUEsSUFDRDtBQUVBLGVBQVcsT0FBTyxDQUFDLEdBQUcsS0FBSyw0QkFBNEIsR0FBRztBQUN6RCxVQUFJLFlBQVksSUFBSSxHQUFHLEtBQUssUUFBUSxXQUFXO0FBQzlDO0FBQUEsTUFDRDtBQUNBLFdBQUssNEJBQTRCLEdBQUc7QUFBQSxJQUNyQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLDRCQUE0QixXQUF5QjtBQUM1RCxVQUFNLE1BQU0sS0FBSyxZQUFZLFNBQVM7QUFDdEMsUUFBSSxLQUFLLDZCQUE2QixPQUFPLEdBQUcsR0FBRztBQUNsRCxXQUFLLG9CQUFvQixHQUFHO0FBQUEsSUFDN0I7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUdRLHNCQUFzQixXQUF5QjtBQUN0RCxVQUFNLE1BQU0sS0FBSyxZQUFZLFNBQVM7QUFDdEMsUUFBSSxLQUFLLDBCQUEwQixPQUFPLEdBQUcsR0FBRztBQUMvQyxXQUFLLG9CQUFvQixHQUFHO0FBQUEsSUFDN0I7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1RLG9CQUFvQixXQUF5QjtBQUNwRCxVQUFNLE1BQU0sS0FBSyxZQUFZLFNBQVM7QUFDdEMsUUFBSSxLQUFLLGNBQWMsR0FBRyxHQUFHO0FBQzVCO0FBQUEsSUFDRDtBQUNBLFNBQUsscUJBQXFCLEtBQUssS0FBSztBQUFBLEVBQ3JDO0FBQUEsRUFFUSwwQkFBZ0M7QUFDdkMsZUFBVyxPQUFPLEtBQUssbUJBQW1CLEtBQUssR0FBRztBQUNqRCxXQUFLLHFCQUFxQixLQUFLLEtBQUs7QUFBQSxJQUNyQztBQUNBLFNBQUssbUJBQW1CLE1BQU07QUFDOUIsU0FBSyxnQkFBZ0IsTUFBTTtBQUMzQixlQUFXLE9BQU8sS0FBSyw4QkFBOEI7QUFDcEQsV0FBSyxxQkFBcUIsS0FBSyxLQUFLO0FBQUEsSUFDckM7QUFDQSxTQUFLLDZCQUE2QixNQUFNO0FBQ3hDLGVBQVcsT0FBTyxLQUFLLDBCQUEwQixLQUFLLEdBQUc7QUFDeEQsV0FBSyxxQkFBcUIsS0FBSyxLQUFLO0FBQUEsSUFDckM7QUFDQSxTQUFLLDBCQUEwQixNQUFNO0FBQUEsRUFDdEM7QUFBQTtBQUFBLEVBSVEsMkJBQTJCLFdBQW9CLG1CQUE0QixxQkFBcUIsTUFBWTtBQUNuSCxVQUFNLGFBQWEsWUFBWSxLQUFLLFlBQVksU0FBUyxJQUFJO0FBQzdELFVBQU0sZ0JBQWdCLENBQUMsb0JBQXdDLHNCQUEwQyxjQUE4QztBQUN0SixhQUFPLFdBQVcsU0FBUyxpQkFDdEIsc0JBQXNCLFVBQWEseUJBQXlCLHVCQUM1RCxlQUFlLFVBQWMsdUJBQXVCLFVBQWEsS0FBSyxZQUFZLGtCQUFrQixNQUFNO0FBQUEsSUFDaEg7QUFFQSxVQUFNLGlCQUFpQixvQkFBSSxJQUFZO0FBQ3ZDLGFBQVMsSUFBSSxLQUFLLFlBQVksU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLO0FBQ3RELFlBQU0sU0FBUyxLQUFLLFlBQVksQ0FBQztBQUNqQyxVQUFJLENBQUMsY0FBYyxPQUFPLFdBQVcsT0FBTyxZQUFZLE9BQU8sU0FBUyxHQUFHO0FBQzFFO0FBQUEsTUFDRDtBQUNBLFVBQUksT0FBTyxZQUFZO0FBQ3RCLHVCQUFlLElBQUksT0FBTyxVQUFVO0FBQUEsTUFDckM7QUFDQSxXQUFLLFlBQVksT0FBTyxHQUFHLENBQUM7QUFBQSxJQUM3QjtBQUNBLGVBQVcsQ0FBQyxzQkFBc0IsT0FBTyxLQUFLLEtBQUssNkJBQTZCO0FBQy9FLFVBQUksUUFBUSxTQUFTLGdCQUNoQixzQkFBc0IsVUFBYSx5QkFBeUIscUJBQzVELGVBQWUsVUFBYSxLQUFLLFlBQVksUUFBUSxTQUFTLE1BQU0sWUFBYTtBQUNyRjtBQUFBLE1BQ0Q7QUFDQSxxQkFBZSxJQUFJLG9CQUFvQjtBQUN2QyxXQUFLLGdDQUFnQyxzQkFBc0IsT0FBTztBQUNsRSxXQUFLLHVCQUF1QixPQUFPLG9CQUFvQjtBQUFBLElBQ3hEO0FBQ0EsZUFBVyxlQUFlLGdCQUFnQjtBQUN6QyxXQUFLLDRCQUE0QixXQUFXO0FBQUEsSUFDN0M7QUFFQSxVQUFNLDBCQUEwQixjQUFjLEtBQUssNkJBQTZCLFFBQVcsS0FBSyw0QkFBNEIsS0FBSyx5QkFBeUI7QUFDMUosUUFBSSwyQkFBMkIsS0FBSyw0QkFBNEI7QUFDL0QsV0FBSyw0QkFBNEIsS0FBSywwQkFBMEI7QUFBQSxJQUNqRTtBQUNBLFFBQUksMkJBQTJCLG9CQUFvQjtBQUNsRCxXQUFLLGtDQUFrQztBQUFBLElBQ3hDO0FBQUEsRUFDRDtBQUFBLEVBRVEsOEJBQW9DO0FBQzNDLFVBQU0sdUJBQXVCLEtBQUssNkJBQTZCLEtBQUssZ0JBQWdCO0FBQ3BGLFFBQUksc0JBQXNCO0FBQ3pCLFdBQUsscUJBQXFCLG9CQUFvQjtBQUFBLElBQy9DO0FBQ0EsU0FBSywyQkFBMkIsUUFBVyxRQUFXLEtBQUs7QUFDM0QsU0FBSyxnQ0FBZ0M7QUFDckMsU0FBSywyQkFBMkIsS0FBSyw0QkFBNEIsS0FBSyxtQkFBbUI7QUFDekYsU0FBSyxZQUFZLFNBQVM7QUFDMUIsU0FBSyw0QkFBNEI7QUFDakMsU0FBSyw0QkFBNEI7QUFDakMsU0FBSyxxQkFBcUI7QUFDMUIsU0FBSyx5QkFBeUI7QUFDOUIsU0FBSyxtQkFBbUIsYUFBYTtBQUdyQyxTQUFLLDZCQUE2QjtBQUNsQyxTQUFLLDRCQUE0QjtBQUNqQyxTQUFLLHFCQUFxQixrQkFBa0IsTUFBUztBQUFBLEVBQ3REO0FBQUEsRUFFUSxvQ0FBMEM7QUFDakQsUUFBSSxLQUFLLG1CQUFtQixXQUFXO0FBQ3RDLFdBQUssMkJBQTJCO0FBQ2hDLFdBQUssbUJBQW1CLGFBQWE7QUFDckM7QUFBQSxJQUNEO0FBS0EsU0FBSyxtQkFBbUIsYUFBYTtBQUNyQyxTQUFLLDJCQUEyQjtBQUNoQyxTQUFLLDRCQUE0QjtBQUNqQyxTQUFLLDZCQUE2QjtBQUNsQyxTQUFLLDRCQUE0QjtBQUNqQyxTQUFLLDRCQUE0QjtBQUNqQyxTQUFLLHFCQUFxQixrQkFBa0IsTUFBUztBQUNyRCxRQUFJLEtBQUssWUFBWSxTQUFTLEdBQUc7QUFDaEMsVUFBSSxDQUFDLEtBQUssb0JBQW9CO0FBQzdCLGFBQUssY0FBYztBQUFBLE1BQ3BCO0FBQUEsSUFDRCxPQUFPO0FBQ04sV0FBSyx3Q0FBd0M7QUFBQSxJQUM5QztBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFnQlEsc0JBQXNCLFdBQXlCO0FBQ3RELFVBQU0sYUFBYSxLQUFLLFlBQVksU0FBUztBQUc3QyxVQUFNLGVBQWUsb0JBQUksSUFBWTtBQUNyQyxlQUFXLENBQUMsYUFBYSxPQUFPLEtBQUssS0FBSyw2QkFBNkI7QUFDdEUsVUFBSSxRQUFRLFNBQVMsY0FBYyxLQUFLLFlBQVksUUFBUSxTQUFTLE1BQU0sWUFBWTtBQUN0RixxQkFBYSxJQUFJLFdBQVc7QUFDNUIsYUFBSyxnQ0FBZ0MsYUFBYSxPQUFPO0FBQUEsTUFDMUQ7QUFBQSxJQUNEO0FBQ0EsUUFBSSxhQUFhLFNBQVMsR0FBRztBQUM1QjtBQUFBLElBQ0Q7QUFFQSxhQUFTLElBQUksS0FBSyxZQUFZLFNBQVMsR0FBRyxLQUFLLEdBQUcsS0FBSztBQUN0RCxZQUFNLGFBQWEsS0FBSyxZQUFZLENBQUMsRUFBRTtBQUN2QyxVQUFJLGVBQWUsVUFBYSxhQUFhLElBQUksVUFBVSxHQUFHO0FBQzdELGFBQUssWUFBWSxPQUFPLEdBQUcsQ0FBQztBQUFBLE1BQzdCO0FBQUEsSUFDRDtBQUtBLGVBQVcsTUFBTSxjQUFjO0FBQzlCLFVBQUksS0FBSyw4QkFBOEIsUUFBUSxJQUFJO0FBQ2xELGNBQU0sU0FBUyxLQUFLLDhCQUE4QixPQUFPLEVBQUUsS0FBSyxFQUFFO0FBQ2xFLFlBQUksV0FBVyxRQUFXO0FBQ3pCLGVBQUssOEJBQThCLE9BQU8sTUFBTTtBQUFBLFFBQ2pEO0FBQUEsTUFDRDtBQUNBLFdBQUssOEJBQThCLElBQUksRUFBRTtBQUFBLElBQzFDO0FBS0EsZUFBVyxDQUFDLEtBQUssU0FBUyxLQUFLLEtBQUssb0JBQW9CO0FBQ3ZELFlBQU0sT0FBTyxVQUFVLE9BQU8sT0FBSyxFQUFFLGVBQWUsVUFBYSxDQUFDLGFBQWEsSUFBSSxFQUFFLFVBQVUsQ0FBQztBQUNoRyxVQUFJLEtBQUssV0FBVyxVQUFVLFFBQVE7QUFDckM7QUFBQSxNQUNEO0FBQ0EsVUFBSSxLQUFLLFdBQVcsR0FBRztBQUN0QixhQUFLLG1CQUFtQixPQUFPLEdBQUc7QUFBQSxNQUNuQyxPQUFPO0FBQ04sYUFBSyxtQkFBbUIsSUFBSSxLQUFLLElBQUk7QUFBQSxNQUN0QztBQUVBLFdBQUssb0JBQW9CLEdBQUc7QUFBQSxJQUM3QjtBQUlBLGVBQVcsTUFBTSxjQUFjO0FBQzlCLFdBQUssZ0JBQWdCLE9BQU8sRUFBRTtBQUFBLElBQy9CO0FBS0EsUUFBSSxLQUFLLCtCQUErQixVQUFhLGFBQWEsSUFBSSxLQUFLLDBCQUEwQixHQUFHO0FBQ3ZHLFdBQUssa0NBQWtDO0FBQUEsSUFDeEM7QUFBQSxFQUNEO0FBQUEsRUFFUSxjQUFjLFdBQStCLE9BQWUsY0FBdUIsU0FBa0IsWUFBZ0MsWUFBcUIsV0FBc0M7QUFDdk0sVUFBTSx3QkFBd0IsV0FBVyxTQUFTO0FBUWxELFNBQUssc0JBQXNCO0FBUzNCLFFBQUksS0FBSyx3QkFBd0I7QUFDaEMsVUFBSSxjQUFjO0FBQ2pCLGFBQUsseUJBQXlCO0FBQUEsTUFDL0IsT0FBTztBQUNOO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLGdCQUFnQixDQUFDLHVCQUF1QjtBQUMzQyxXQUFLLG9CQUFvQjtBQUFBLElBQzFCO0FBR0EsVUFBTSxpQkFBaUIsS0FBSyw4QkFBOEI7QUFDMUQsVUFBTSxjQUFjLENBQUMsa0JBQWtCLEtBQUssOEJBQThCO0FBVzFFLFVBQU0sd0JBQXdCLGVBQWUsQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLO0FBQ3BFLFFBQUssa0JBQWtCLEtBQUssWUFBWSxXQUFXLEtBQU0sdUJBQXVCO0FBQy9FLFdBQUssV0FBVyxXQUFXLE9BQU8sY0FBYyxTQUFTLFlBQVksWUFBWSxTQUFTO0FBQzFGO0FBQUEsSUFDRDtBQVFBLFFBQUksUUFBUSxlQUNULFNBQ0EsQ0FBQyxHQUFHLEtBQUssV0FBVyxFQUFFLFFBQVEsRUFBRTtBQUFBLE1BQUssT0FDdEMsQ0FBQyxFQUFFLGNBQWMsRUFBRSxjQUFjLGFBQWMsRUFBRSxjQUFjLFVBQWEsY0FBYztBQUFBLElBQzNGO0FBQ0QsUUFBSSxDQUFDLE9BQU87QUFDWCxjQUFRLEVBQUUsV0FBVyxZQUFZLFdBQVcsV0FBVyxPQUFPLFFBQVEsQ0FBQyxFQUFFO0FBQ3pFLFdBQUssWUFBWSxLQUFLLEtBQUs7QUFBQSxJQUM1QjtBQUNBLFVBQU0sT0FBTyxLQUFLLEVBQUUsT0FBTyxjQUFjLFNBQVMsV0FBVyxDQUFDO0FBQzlELFFBQUksU0FBUztBQUNaLFlBQU0sWUFBWTtBQUFBLElBQ25CO0FBR0EsUUFBSSxLQUFLLDhCQUE4QixRQUFRLENBQUMsS0FBSyxvQkFBb0I7QUFDeEUsV0FBSyxjQUFjO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQUEsRUFFUSxXQUFXLFdBQStCLE9BQWUsY0FBdUIsU0FBa0IsWUFBZ0MsWUFBcUIsV0FBc0M7QUFDcE0sVUFBTSx3QkFBd0IsV0FBVyxTQUFTO0FBUWxELFFBQUksWUFBWTtBQUNmLFdBQUssa0JBQWtCLFlBQVksRUFBRSxjQUFjLGFBQWEsQ0FBQztBQUFBLElBQ2xFO0FBRUEsVUFBTSxrQkFBa0IsWUFBWSxJQUFJLE1BQU0sU0FBUyxJQUFJO0FBQzNELFFBQUksaUJBQWlCO0FBQ3BCLFdBQUsscUJBQXFCLG9CQUFvQixpQkFBaUIsVUFBVTtBQUFBLElBQzFFO0FBRUEsVUFBTSx3QkFBd0IsS0FBSyxxQkFBcUIsU0FBa0IsNkJBQTZCLE1BQU07QUFDN0csUUFBSSx5QkFBeUIsT0FBTztBQU1uQyxXQUFLLDRCQUE0QjtBQUdqQyxXQUFLLDZCQUE2QjtBQUNsQyxXQUFLLDRCQUE0QjtBQUdqQyxXQUFLLDRCQUE0QjtBQUNqQyxXQUFLLHNCQUFzQjtBQUMzQixVQUFJLENBQUMsdUJBQXVCO0FBQzNCLGFBQUssd0JBQXdCO0FBQUEsTUFDOUI7QUFDQSxXQUFLLFlBQVksSUFBSSxZQUFZLE1BQVM7QUFDMUMsV0FBSyxZQUFZLElBQUksZUFBZSxNQUFTO0FBQzdDLFdBQUssbUJBQW1CLGVBQWUsT0FBTyxTQUFTLEtBQUssT0FBUTtBQUNwRSxVQUFJLEtBQUssb0JBQW9CLEdBQUc7QUFPL0IsYUFBSyxvQkFBb0I7QUFBQSxNQUMxQixPQUFPO0FBQ04sYUFBSyxrQkFBa0IsY0FBYyxLQUFLLElBQUksSUFBSSxHQUFHO0FBQUEsTUFDdEQ7QUFBQSxJQUNELFdBQVcsQ0FBQyx1QkFBdUI7QUFDbEMsVUFBSSxDQUFDLHVCQUF1QjtBQUMzQixhQUFLLHdCQUF3QjtBQUFBLE1BQzlCO0FBQ0EsVUFBSSxTQUFTO0FBQ1osYUFBSyw0QkFBNEI7QUFDakMsYUFBSyw2QkFBNkI7QUFDbEMsYUFBSyw0QkFBNEI7QUFJakMsWUFBSSxZQUFZO0FBQ2YsY0FBSSxXQUFXO0FBQ2QsaUJBQUssa0NBQWtDLFdBQVcsWUFBWSxTQUFTO0FBQUEsVUFDeEU7QUFDQSxlQUFLLG9CQUFvQixVQUFVO0FBQUEsUUFDcEM7QUFHQSxZQUFJLENBQUMsS0FBSyxvQkFBb0I7QUFDN0IsZUFBSyxjQUFjO0FBQUEsUUFDcEI7QUFDQSxZQUFJLEtBQUssb0JBQW9CLEdBQUc7QUFDL0IsZUFBSyxvQkFBb0I7QUFBQSxRQUMxQjtBQUFBLE1BQ0Q7QUFBQSxJQUNELE9BQU87QUFNTixVQUFJLFdBQVcsS0FBSyw4QkFBOEIsV0FBVztBQUM1RCxhQUFLLDRCQUE0QjtBQUFBLE1BQ2xDO0FBQ0EsV0FBSyxtQkFBbUIsZUFBZSxPQUFPLFNBQVMsS0FBSyxPQUFRO0FBQUEsSUFDckU7QUFBQSxFQUNEO0FBQUEsRUFFUSxnQkFBc0I7QUFLN0IsU0FBSyxxQkFBcUI7QUFDMUIsV0FBTyxLQUFLLDhCQUE4QixRQUFRLEtBQUssWUFBWSxTQUFTLEdBQUc7QUFDOUUsWUFBTSxPQUFPLEtBQUssWUFBWSxNQUFNO0FBQ3BDLGlCQUFXLFNBQVMsS0FBSyxRQUFRO0FBQ2hDLGFBQUssV0FBVyxLQUFLLFdBQVcsTUFBTSxPQUFPLE1BQU0sY0FBYyxNQUFNLFNBQVMsTUFBTSxZQUFZLEtBQUssWUFBWSxLQUFLLFNBQVM7QUFBQSxNQUNsSTtBQUFBLElBQ0Q7QUFDQSxTQUFLLHFCQUFxQjtBQUFBLEVBQzNCO0FBQUE7QUFBQSxFQUlRLG9CQUFvQixXQUF5QjtBQUNwRCxTQUFLLFlBQVk7QUFFakIsVUFBTSxVQUFVLEtBQUssbUJBQW1CLElBQUksU0FBUztBQUNyRCxRQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssU0FBUztBQUFFO0FBQUEsSUFBUTtBQUV6QyxVQUFNLE1BQU0sS0FBSyxtQkFBbUIsY0FBYyxLQUFLLE9BQU87QUFDOUQsVUFBTSxTQUFTLElBQUksYUFBYSxHQUFHLFFBQVEsUUFBUSxJQUFLO0FBQ3hELFdBQU8sZUFBZSxDQUFDLEVBQUUsSUFBSSxPQUFPO0FBRXBDLFVBQU0sU0FBUyxJQUFJLG1CQUFtQjtBQUN0QyxXQUFPLFNBQVM7QUFDaEIsV0FBTyxRQUFRLElBQUksV0FBVztBQUM5QixTQUFLLG9CQUFvQjtBQUV6QixVQUFNLGtCQUFrQixJQUFJLE1BQU0sU0FBUztBQUMzQyxTQUFLLHFCQUFxQixvQkFBb0IsaUJBQWlCLE1BQVM7QUFDeEUsU0FBSyxZQUFZLElBQUksWUFBWSxNQUFTO0FBQzFDLFNBQUssWUFBWSxJQUFJLGdCQUFnQixNQUFTO0FBRTlDLFdBQU8sVUFBVSxNQUFNO0FBQ3RCLFVBQUksS0FBSyxzQkFBc0IsUUFBUTtBQUN0QyxhQUFLLG9CQUFvQjtBQUN6QixhQUFLLHFCQUFxQixrQkFBa0IsZUFBZTtBQUMzRCxhQUFLLFlBQVksSUFBSSxRQUFRLE1BQVM7QUFDdEMsYUFBSyxZQUFZLElBQUksb0JBQW9CLE1BQVM7QUFBQSxNQUNuRDtBQUFBLElBQ0Q7QUFFQSxXQUFPLE1BQU0sQ0FBQztBQUFBLEVBQ2Y7QUFBQSxFQUVRLGNBQW9CO0FBQzNCLFFBQUksS0FBSyxtQkFBbUI7QUFDM0IsVUFBSTtBQUFFLGFBQUssa0JBQWtCLEtBQUs7QUFBQSxNQUFHLFFBQVE7QUFBQSxNQUF3QjtBQUNyRSxXQUFLLG9CQUFvQjtBQUFBLElBQzFCO0FBQUEsRUFDRDtBQUFBO0FBQUEsRUFJUSxlQUFxQjtBQUM1QixTQUFLLG1CQUFtQixtQkFBbUIsS0FBSyxxQkFBcUIsQ0FBQztBQUFBLEVBQ3ZFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRUSwyQkFBaUM7QUFDeEMsUUFBSSxLQUFLLHVCQUF1QjtBQUMvQixtQkFBYSxLQUFLLHFCQUFxQjtBQUFBLElBQ3hDO0FBQ0EsU0FBSyx3QkFBd0IsV0FBVyxNQUFNO0FBQzdDLFdBQUssd0JBQXdCO0FBQzdCLFdBQUsseUJBQXlCO0FBQUEsSUFDL0IsR0FBRyx1QkFBdUIsdUJBQXVCO0FBQUEsRUFDbEQ7QUFBQTtBQUFBLEVBR1EsNkJBQTZCLFdBQW1CLGNBQXNCLFFBQTRCLHFCQUF5QyxVQUE4QixrQkFBZ0Q7QUFDaE8sVUFBTSxhQUFhLEtBQUssWUFBWSxTQUFTO0FBQzdDLFFBQUksaUJBQWlCLFVBQVUsaUJBQWlCLDRCQUE0QjtBQUMzRSxXQUFLLHFCQUFxQixTQUFTO0FBQUEsSUFDcEM7QUFDQSxRQUFJLGlCQUFpQixZQUFZO0FBQ2hDLFdBQUssdUJBQXVCLFVBQVU7QUFHdEMsV0FBSyxzQkFBc0IsVUFBVTtBQUVyQyxXQUFLLGVBQWUsVUFBVTtBQUFBLElBQy9CO0FBQ0EsUUFBSSxDQUFDLEtBQUssZUFBZSxXQUFXLFFBQVEsR0FBRztBQU85QyxVQUFJLGlCQUFpQixVQUFVLHFCQUFxQjtBQU1uRCxjQUFNLGNBQWMsS0FBSyxrQkFBa0IsSUFBSSxVQUFVLE1BQU07QUFDL0QsY0FBTSxrQkFBa0IsS0FBSywwQkFBMEIsSUFBSSxVQUFVO0FBQ3JFLFlBQUksQ0FBQyxlQUFlLG9CQUFvQixxQkFBcUI7QUFDNUQsZUFBSywwQkFBMEIsSUFBSSxZQUFZLG1CQUFtQjtBQUNsRSxlQUFLLHFCQUFxQixZQUFZLElBQUk7QUFDMUMsZUFBSyxXQUFXLE1BQU0sb0RBQW9ELFdBQVcsTUFBTSxHQUFHLENBQUMsNkJBQTZCO0FBQUEsUUFDN0g7QUFBQSxNQUNEO0FBQ0E7QUFBQSxJQUNEO0FBQ0EsUUFBSSxpQkFBaUIsVUFBVSxxQkFBcUI7QUFNbkQsWUFBTSxrQkFBa0IsS0FBSyxrQkFBa0IsSUFBSSxVQUFVLE1BQU07QUFDbkUsV0FBSyxTQUFTLFdBQVcsWUFBWSxtQkFBbUI7QUFDeEQsVUFBSSxpQkFBaUI7QUFDcEIsYUFBSyxzQkFBc0IsVUFBVTtBQUFBLE1BQ3RDO0FBQUEsSUFDRCxXQUFXLGlCQUFpQiw4QkFBOEIsUUFBUTtBQU9qRSxZQUFNLFdBQVcsS0FBSyxvQkFBb0IsS0FBSyxpQkFBaUIsU0FBUyxDQUFDO0FBQzFFLFVBQUksVUFBVTtBQUNiLGFBQUssU0FBUyxXQUFXLFNBQVMsTUFBTSxTQUFTLE1BQU0sUUFBVyxRQUFXLFFBQVcsU0FBUyxPQUFPO0FBQUEsTUFDekcsT0FBTztBQUNOLGFBQUssU0FBUyxXQUFXLGdCQUFnQixRQUFRLFFBQVcsUUFBVyxnQkFBZ0I7QUFBQSxNQUN4RjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUdRLGlCQUFpQixXQUEyQztBQUNuRSxRQUFJO0FBQ0osUUFBSTtBQUNILGlCQUFXLElBQUksTUFBTSxTQUFTO0FBQUEsSUFDL0IsUUFBUTtBQUNQLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxLQUFLLFlBQVksV0FBVyxRQUFRO0FBQUEsRUFDNUM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQWNRLDJCQUFpQztBQUN4QyxVQUFNLFVBQVUsQ0FBQyxHQUFHLEtBQUsscUJBQXFCLE9BQU8sQ0FBQztBQUN0RCxTQUFLLHFCQUFxQixNQUFNO0FBQ2hDLFFBQUksUUFBUSxXQUFXLEdBQUc7QUFDekI7QUFBQSxJQUNEO0FBR0EsVUFBTSxhQUF3RSxDQUFDO0FBQy9FLGVBQVcsVUFBVSxTQUFTO0FBQzdCLFlBQU0sU0FBUyxPQUFPLFVBQVU7QUFDaEMsWUFBTSxVQUFVLE9BQU8sdUJBQXVCO0FBQzlDLFlBQU0sZUFBZSxPQUFPLGNBQWMsT0FBTztBQUdqRCxZQUFNLGFBQWEsQ0FBQyxnQkFBZ0IsT0FBTyxpQkFBaUIsK0JBQ3ZELE9BQU8sZUFBZSxVQUFVLE9BQU8sa0JBQWtCLE9BQU8sYUFBYSxPQUFPLHlCQUF5QixPQUFPO0FBR3pILFlBQU0sc0JBQXNCLENBQUMsZ0JBQWdCLE9BQU8saUJBQWlCLFVBQVUsQ0FBQyxDQUFDLFdBQVcsT0FBTyx3QkFBd0I7QUFDM0gsVUFBSSxnQkFBZ0IsY0FBYyxxQkFBcUI7QUFDdEQsbUJBQVcsS0FBSyxFQUFFLFFBQVEsV0FBVyxDQUFDO0FBQUEsTUFDdkM7QUFBQSxJQUNEO0FBQ0EsUUFBSSxXQUFXLFdBQVcsR0FBRztBQUc1QixXQUFLLGFBQWE7QUFDbEI7QUFBQSxJQUNEO0FBVUEsZUFBVyxFQUFFLFFBQVEsV0FBVyxLQUFLLFlBQVk7QUFDaEQsVUFBSSxZQUFZO0FBQ2YsYUFBSyxtQkFBbUIsdUJBQXVCLE9BQU8sU0FBUztBQUFBLE1BQ2hFO0FBQUEsSUFDRDtBQUNBLFNBQUssYUFBYTtBQUNsQixTQUFLLG1CQUFtQixvQkFBb0I7QUFLNUMsVUFBTSxXQUFXLEtBQUssZ0JBQWdCO0FBQ3RDLGVBQVcsRUFBRSxPQUFPLEtBQUssWUFBWTtBQUNwQyxXQUFLLDZCQUE2QixPQUFPLFdBQVcsT0FBTyxjQUFjLE9BQU8sUUFBUSxPQUFPLHFCQUFxQixVQUFVLE9BQU8sZ0JBQWdCO0FBQUEsSUFDdEo7QUFDQSxTQUFLLFdBQVcsTUFBTSxvQkFBb0IsV0FBVyxNQUFNLDRCQUE0QixXQUFXLElBQUksQ0FBQyxFQUFFLFFBQVEsV0FBVyxNQUFNLEdBQUcsT0FBTyxLQUFLLElBQUksT0FBTyxZQUFZLEdBQUcsYUFBYSxtQkFBbUIsRUFBRSxFQUFFLEVBQUUsS0FBSyxJQUFJLENBQUMsRUFBRTtBQUM3TixlQUFXLEVBQUUsT0FBTyxLQUFLLFlBQVk7QUFJcEMsV0FBSztBQUFBLFFBQ0o7QUFBQSxRQUNBLFlBQVksT0FBTyxLQUFLLFlBQU8sT0FBTyxZQUFZO0FBQUEsUUFDbEQ7QUFBQSxVQUNDLGlCQUFpQixPQUFPO0FBQUEsVUFDeEIsY0FBYyxPQUFPO0FBQUEsVUFDckIsb0JBQW9CLE9BQU87QUFBQSxRQUM1QjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQW1CUSw4QkFBOEIsV0FBbUIsT0FBZSxjQUE2QjtBQUdwRyxRQUFJLEtBQUssNEJBQTRCLElBQUksU0FBUyxHQUFHO0FBQ3BEO0FBQUEsSUFDRDtBQUNBLFFBQUksY0FBYztBQUNqQixXQUFLLFdBQVcsTUFBTSxpREFBaUQsVUFBVSxNQUFNLEdBQUcsQ0FBQyxXQUFXLEtBQUssR0FBRztBQUFBLElBQy9HO0FBQ0EsVUFBTSxRQUFRLFdBQVcsTUFBTTtBQUM5QixXQUFLLDRCQUE0QixPQUFPLFNBQVM7QUFDakQsV0FBSyxXQUFXLE1BQU0saURBQWlELFVBQVUsTUFBTSxHQUFHLENBQUMsV0FBVyxLQUFLLEdBQUc7QUFHOUcsV0FBSyxhQUFhO0FBQ2xCLFdBQUssbUJBQW1CLG9CQUFvQjtBQUFBLElBQzdDLEdBQUcsdUJBQXVCLDRCQUE0QjtBQUN0RCxTQUFLLDRCQUE0QixJQUFJLFdBQVcsS0FBSztBQUFBLEVBQ3REO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRUSw0QkFBa0M7QUFPekMsUUFBSSxLQUFLLG1CQUFtQixPQUFPLEdBQUc7QUFDckMsWUFBTSxRQUFRLEtBQUssZ0JBQWdCO0FBQ25DLFVBQUksT0FBTztBQUNWLGFBQUssdUJBQXVCLEtBQUs7QUFBQSxNQUNsQztBQUFBLElBQ0Q7QUFFQSxVQUFNLFdBQVcsS0FBSyxxQkFBcUIsTUFBTSxTQUFTLE9BQU8sT0FBSyxDQUFDLEVBQUUsV0FBVyxDQUFDO0FBQ3JGLFVBQU0sZUFBc0ssQ0FBQztBQUM3SyxVQUFNLHFCQUFxQixvQkFBSSxJQUFZO0FBQzNDLFVBQU0sb0JBQW9CLG9CQUFJLElBQVk7QUFFMUMsZUFBVyxLQUFLLFVBQVU7QUFDekIseUJBQW1CLElBQUksRUFBRSxTQUFTLFNBQVMsQ0FBQztBQUM1QyxZQUFNLFlBQVksRUFBRSxTQUFTLFNBQVM7QUFDdEMsWUFBTSxRQUFRLEtBQUssWUFBWSxXQUFXLEVBQUUsUUFBUTtBQUNwRCxVQUFJO0FBQ0osVUFBSTtBQUNKLFVBQUk7QUFDSixVQUFJO0FBQ0osVUFBSSxPQUFPO0FBQ1YsY0FBTSxPQUFPLEtBQUssbUJBQW1CLEtBQUs7QUFJMUMsdUJBQWUsS0FBSyx3QkFBd0IsV0FBVyxJQUFJO0FBQzNELGlCQUFTLEtBQUs7QUFDZCwyQkFBbUIsS0FBSztBQUN4Qiw4QkFBc0IsaUJBQWlCLEtBQUssUUFBUSxLQUFLLHdCQUF3QjtBQUdqRixhQUFLLHNCQUFzQixXQUFXLEtBQUssT0FBTyxLQUFLLHFCQUFxQjtBQUM1RSxZQUFJLGlCQUFpQixLQUFLLE9BQU87QUFDaEMsZUFBSyxzQkFBc0IsT0FBTyxTQUFTO0FBQUEsUUFDNUM7QUFBQSxNQUNELE9BQU87QUFDTix1QkFBZSxFQUFFLFdBQVcsbUJBQW1CLGFBQWEsYUFDekQsRUFBRSxXQUFXLG1CQUFtQixhQUFhLDZCQUM1QyxFQUFFLFdBQVcsbUJBQW1CLFlBQVksU0FDM0M7QUFHTCxhQUFLLHNCQUFzQixXQUFXLGNBQWMsTUFBUztBQUM3RCxZQUFJLEVBQUUsV0FBVyxtQkFBbUIsWUFBWTtBQUMvQyxlQUFLLG1CQUFtQixFQUFFLFFBQVE7QUFBQSxRQUNuQztBQUFBLE1BQ0Q7QUFFQSxZQUFNLE9BQU8sS0FBSyxtQkFBbUIsSUFBSSxTQUFTO0FBQ2xELFlBQU0sZ0JBQWdCLFNBQVMsVUFBYSxLQUFLLFVBQVUsZ0JBQWdCLGlCQUFpQjtBQUM1RixZQUFNLFlBQVksaUJBQWlCLDZCQUE2QixLQUFLLGNBQWMsU0FBUyxJQUFJO0FBQ2hHLFlBQU0saUJBQWlCLENBQUMsaUJBQWlCLFNBQVMsVUFBYSxpQkFBaUIsZ0NBQzFFLFVBQVUsUUFBUSxLQUFLLFVBQVUsY0FBYyxLQUFLLGFBQWEscUJBQXFCLEtBQUs7QUFJakcsVUFBSSxpQkFBaUIsaUJBQWlCLGNBQWMsQ0FBQyxLQUFLLG1CQUFtQixJQUFJLFNBQVMsR0FBRztBQUM1RixhQUFLLGlDQUFpQyxJQUFJLFNBQVM7QUFBQSxNQUNwRDtBQUtBLFVBQUksQ0FBQyxTQUFTLGlCQUFpQixVQUFVLGVBQWU7QUFDdkQsY0FBTSxnQkFBZ0IsS0FBSyx5QkFBeUIsSUFBSSxTQUFTO0FBQ2pFLFlBQUksQ0FBQyxlQUFlO0FBQ25CLGVBQUssb0NBQW9DLEVBQUUsUUFBUTtBQUNuRDtBQUFBLFFBQ0Q7QUFDQSw4QkFBc0I7QUFBQSxNQUN2QjtBQVFBLFlBQU0sb0JBQW9CLHVCQUF1QjtBQUNqRCxZQUFNLDBCQUEwQixDQUFDLGlCQUFpQixTQUFTLFVBQWEsaUJBQWlCLFVBQVUsQ0FBQyxDQUFDLHFCQUFxQixzQkFBc0IsS0FBSyx1QkFBdUIsS0FBSyxpQ0FBaUMsSUFBSSxTQUFTO0FBRy9OLFVBQUssaUJBQWlCLGlCQUFpQixVQUFVLENBQUMsQ0FBQyxxQkFBc0IseUJBQXlCO0FBQ2pHLGFBQUssaUNBQWlDLE9BQU8sU0FBUztBQUFBLE1BQ3ZEO0FBRUEsVUFBSSxpQkFBaUIsa0JBQWtCLHlCQUF5QjtBQUMvRCxjQUFNLGVBQWUsS0FBSyx1QkFBdUIsSUFBSSxTQUFTO0FBQzlELFlBQUksY0FBYztBQUNqQix1QkFBYSxZQUFZO0FBQ3pCLGVBQUssdUJBQXVCLE9BQU8sU0FBUztBQUFBLFFBQzdDLE9BQU87QUFDTixjQUFJLGdCQUFnQjtBQUNuQixpQkFBSyxtQkFBbUIsdUJBQXVCLFNBQVM7QUFBQSxVQUN6RDtBQUNBLHVCQUFhLEtBQUssRUFBRSxXQUFXLGNBQWMsT0FBTyxFQUFFLFNBQVMsb0JBQW9CLFFBQVEsa0JBQWtCLG9CQUFvQixDQUFDO0FBQUEsUUFDbkk7QUFBQSxNQUNEO0FBQ0EsVUFBSSxpQkFBaUIsV0FBVztBQUcvQixjQUFNLG9CQUFvQixxQkFBcUIsS0FBSyx5QkFBeUIsSUFBSSxTQUFTLEtBQUssTUFBTSx1QkFBdUI7QUFDNUgsYUFBSyxtQkFBbUIsSUFBSSxXQUFXLEVBQUUsT0FBTyxjQUFjLFFBQVEsVUFBVSxJQUFJLFdBQVcsa0JBQWtCLHFCQUFxQixrQkFBa0IsQ0FBQztBQUFBLE1BQzFKO0FBQ0EsVUFBSSxpQkFBaUIsNEJBQTRCO0FBQ2hELDBCQUFrQixJQUFJLFNBQVM7QUFBQSxNQUNoQztBQUFBLElBQ0Q7QUFHQSxlQUFXLGFBQWEsS0FBSyxZQUFZLFdBQVcsSUFBSSxHQUFHO0FBQzFELFlBQU0sTUFBTSxVQUFVLGdCQUFnQixTQUFTO0FBQy9DLFVBQUksbUJBQW1CLElBQUksR0FBRyxHQUFHO0FBQUU7QUFBQSxNQUFVO0FBQzdDLFVBQUksVUFBVSxZQUFZLEVBQUUsV0FBVyxHQUFHO0FBQUU7QUFBQSxNQUFVO0FBRXRELFlBQU0sT0FBTyxLQUFLLG1CQUFtQixTQUFTO0FBQzlDLFlBQU0sZUFBZSxLQUFLO0FBQzFCLFlBQU0sU0FBUyxLQUFLO0FBQ3BCLFlBQU0sbUJBQW1CLEtBQUs7QUFDOUIsWUFBTSxzQkFBc0IsS0FBSztBQUVqQyxZQUFNLE9BQU8sS0FBSyxtQkFBbUIsSUFBSSxHQUFHO0FBQzVDLFlBQU0sZ0JBQWdCLFNBQVMsVUFBYSxLQUFLLFVBQVUsZ0JBQWdCLGlCQUFpQjtBQUM1RixZQUFNLFlBQVksaUJBQWlCLDZCQUE2QixLQUFLLGNBQWMsR0FBRyxJQUFJO0FBQzFGLFlBQU0saUJBQWlCLENBQUMsaUJBQWlCLFNBQVMsVUFBYSxpQkFBaUIsZ0NBQzFFLFVBQVUsUUFBUSxLQUFLLFVBQVUsY0FBYyxLQUFLLGFBQWEscUJBQXFCLEtBQUs7QUFHakcsVUFBSSxpQkFBaUIsaUJBQWlCLGNBQWMsQ0FBQyxLQUFLLG1CQUFtQixJQUFJLEdBQUcsR0FBRztBQUN0RixhQUFLLGlDQUFpQyxJQUFJLEdBQUc7QUFBQSxNQUM5QztBQUVBLFlBQU0sb0JBQW9CLHVCQUF1QjtBQUNqRCxZQUFNLDBCQUEwQixDQUFDLGlCQUFpQixTQUFTLFVBQWEsaUJBQWlCLFVBQVUsQ0FBQyxDQUFDLHFCQUFxQixzQkFBc0IsS0FBSyx1QkFBdUIsS0FBSyxpQ0FBaUMsSUFBSSxHQUFHO0FBR3pOLFVBQUssaUJBQWlCLGlCQUFpQixVQUFVLENBQUMsQ0FBQyxxQkFBc0IseUJBQXlCO0FBQ2pHLGFBQUssaUNBQWlDLE9BQU8sR0FBRztBQUFBLE1BQ2pEO0FBRUEsVUFBSSxpQkFBaUIsa0JBQWtCLHlCQUF5QjtBQUMvRCxZQUFJLGdCQUFnQjtBQUNuQixlQUFLLG1CQUFtQix1QkFBdUIsR0FBRztBQUFBLFFBQ25EO0FBQ0EscUJBQWEsS0FBSyxFQUFFLFdBQVcsS0FBSyxjQUFjLE9BQU8sVUFBVSxTQUFTLFFBQVEsUUFBUSxrQkFBa0Isb0JBQW9CLENBQUM7QUFBQSxNQUNwSTtBQUNBLFVBQUksaUJBQWlCLFdBQVc7QUFDL0IsY0FBTSxvQkFBb0IscUJBQXFCLEtBQUsseUJBQXlCLElBQUksR0FBRyxLQUFLLE1BQU0sdUJBQXVCO0FBQ3RILGFBQUssbUJBQW1CLElBQUksS0FBSyxFQUFFLE9BQU8sY0FBYyxRQUFRLFVBQVUsSUFBSSxXQUFXLGtCQUFrQixxQkFBcUIsa0JBQWtCLENBQUM7QUFBQSxNQUNwSjtBQUNBLFVBQUksaUJBQWlCLDRCQUE0QjtBQUNoRCwwQkFBa0IsSUFBSSxHQUFHO0FBQUEsTUFDMUI7QUFBQSxJQUNEO0FBS0EsU0FBSyxpQ0FBaUMsaUJBQWlCO0FBRXZELFFBQUksYUFBYSxTQUFTLEdBQUc7QUFDNUIsV0FBSyxXQUFXLE1BQU0sd0NBQXdDLGFBQWEsTUFBTSxxQkFBcUIsYUFBYSxJQUFJLE9BQUssR0FBRyxFQUFFLEtBQUssS0FBSyxFQUFFLFlBQVksRUFBRSxFQUFFLEtBQUssSUFBSSxDQUFDLEVBQUU7QUFFekssV0FBSyxhQUFhO0FBQ2xCLFdBQUssbUJBQW1CLG9CQUFvQjtBQUFBLElBQzdDO0FBS0EsVUFBTSxXQUFXLEtBQUssZ0JBQWdCO0FBQ3RDLGVBQVcsVUFBVSxjQUFjO0FBQ2xDLFdBQUssNkJBQTZCLE9BQU8sV0FBVyxPQUFPLGNBQWMsT0FBTyxRQUFRLE9BQU8scUJBQXFCLFVBQVUsT0FBTyxnQkFBZ0I7QUFBQSxJQUN0SjtBQUVBLFFBQUksYUFBYSxTQUFTLEdBQUc7QUFDNUIsaUJBQVcsVUFBVSxjQUFjO0FBQ2xDLGFBQUs7QUFBQSxVQUNKO0FBQUEsVUFDQSxZQUFZLE9BQU8sS0FBSyxZQUFPLE9BQU8sWUFBWTtBQUFBLFVBQ2xEO0FBQUEsWUFDQyxpQkFBaUIsT0FBTztBQUFBLFlBQ3hCLGNBQWMsT0FBTztBQUFBLFlBQ3JCLG9CQUFvQixPQUFPO0FBQUEsVUFDNUI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQXFCUSxvQkFBb0IsV0FBbUIsVUFBdUU7QUFDckgsUUFBSSxjQUFjLDhCQUE4QixDQUFDLFVBQVU7QUFDMUQsYUFBTyxFQUFFLE9BQU8sWUFBWSx3QkFBd0IsS0FBSztBQUFBLElBQzFEO0FBQ0EsV0FBTyxFQUFFLE9BQU8sV0FBVyx3QkFBd0IsTUFBTTtBQUFBLEVBQzFEO0FBQUEsRUFJUSx1QkFBNkM7QUFDcEQsVUFBTSxhQUFhLEtBQUssSUFBSSxJQUFJLEtBQUssS0FBSztBQUMxQyxVQUFNLFdBQVcsS0FBSyxxQkFBcUIsTUFBTSxTQUFTLE9BQU8sT0FBSztBQUNyRSxVQUFJLEVBQUUsV0FBVyxHQUFHO0FBQUUsZUFBTztBQUFBLE1BQU87QUFDcEMsVUFBSSxFQUFFLFdBQVcsbUJBQW1CLGNBQWMsRUFBRSxXQUFXLG1CQUFtQixZQUFZO0FBQUUsZUFBTztBQUFBLE1BQU07QUFDN0csVUFBSSxFQUFFLFdBQVcsbUJBQW1CLFdBQVc7QUFDOUMsY0FBTSxVQUFVLEVBQUUsT0FBTyxvQkFBb0IsRUFBRSxPQUFPO0FBQ3RELGVBQU8sWUFBWSxVQUFhLFVBQVU7QUFBQSxNQUMzQztBQUNBLGFBQU87QUFBQSxJQUNSLENBQUM7QUFPRCxVQUFNLGtCQUFrQixLQUFLLG9CQUFvQjtBQUVqRCxVQUFNLGNBQWMsU0FBUyxJQUFJLE9BQUs7QUFDckMsWUFBTSxRQUFRLEtBQUssWUFBWSxXQUFXLEVBQUUsUUFBUTtBQUNwRCxZQUFNLFdBQVcsRUFBRSxTQUFTLFNBQVMsTUFBTTtBQUMzQyxVQUFJLENBQUMsT0FBTztBQUNYLGNBQU0sZUFBZSxFQUFFLFNBQVMsU0FBUztBQUN6QyxZQUFJLGdCQUFnQixFQUFFLFdBQVcsbUJBQW1CLGFBQWEsYUFDOUQsRUFBRSxXQUFXLG1CQUFtQixhQUFhLDZCQUM1QyxFQUFFLFdBQVcsbUJBQW1CLFlBQVksU0FDM0M7QUFNTCxZQUFJLGtCQUFrQixVQUFVLEtBQUssc0JBQXNCLElBQUksWUFBWSxLQUFLLENBQUMsS0FBSyx5QkFBeUIsSUFBSSxZQUFZLEdBQUc7QUFDakksZ0JBQU0sT0FBTyxLQUFLLG1CQUFtQixJQUFJLFlBQVk7QUFDckQsY0FBSSxNQUFNLE9BQU87QUFDaEIsNEJBQWdCLEtBQUs7QUFBQSxVQUN0QjtBQUFBLFFBQ0Q7QUFFQSxZQUFJLGtCQUFrQiw0QkFBNEI7QUFDakQsZUFBSyxtQkFBbUIsRUFBRSxRQUFRO0FBQ2xDLDBCQUFnQjtBQUFBLFFBQ2pCO0FBQ0EsY0FBTUMsVUFBUyxLQUFLLG9CQUFvQixlQUFlLFFBQVE7QUFJL0QsY0FBTSxnQkFBZ0Isa0JBQWtCLFNBQVMsS0FBSyx5QkFBeUIsSUFBSSxZQUFZLElBQUk7QUFDbkcsZUFBTztBQUFBLFVBQ04sSUFBSTtBQUFBLFVBQ0osR0FBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFBQSxVQUNwQyxXQUFXO0FBQUEsVUFDWCxhQUFhQSxRQUFPO0FBQUEsVUFDcEIsR0FBSSxnQkFBZ0IsRUFBRSx1QkFBdUIsY0FBYyxJQUFJLENBQUM7QUFBQSxRQUNqRTtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFlBQVksS0FBSyxtQkFBbUIsS0FBSztBQUcvQyxXQUFLLHNCQUFzQixFQUFFLFNBQVMsU0FBUyxHQUFHLFVBQVUsT0FBTyxVQUFVLHFCQUFxQjtBQUVsRyxZQUFNLGdCQUFnQixVQUFVLFVBQVUsOEJBQThCLENBQUMsVUFBVTtBQUluRixZQUFNLFlBQVksS0FBSyx3QkFBd0IsRUFBRSxTQUFTLFNBQVMsR0FBRyxTQUFTO0FBQy9FLFlBQU0sU0FBUyxnQkFDWixFQUFFLE9BQU8sWUFBWSx3QkFBd0IsS0FBSyxJQUNsRCxLQUFLLG9CQUFvQixXQUFXLFFBQVE7QUFDL0MsWUFBTSxjQUFjLGNBQWMsVUFBVSxRQUFRLFVBQVUsd0JBQXdCO0FBSXRGLFlBQU0sVUFBVSxLQUFLLHFCQUFxQixLQUFLO0FBQy9DLGFBQU87QUFBQSxRQUNOLElBQUksRUFBRSxTQUFTLFNBQVM7QUFBQSxRQUN4QixHQUFJLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLElBQUksQ0FBQztBQUFBLFFBQ3BDLFdBQVc7QUFBQSxRQUNYLGFBQWEsT0FBTztBQUFBLFFBQ3BCLEdBQUksQ0FBQyxPQUFPLDBCQUEwQixVQUFVLFNBQVMsRUFBRSxvQkFBb0IsVUFBVSxPQUFPLElBQUksQ0FBQztBQUFBLFFBQ3JHLEdBQUksQ0FBQyxPQUFPLDBCQUEwQixVQUFVLG9CQUFvQixFQUFFLG1CQUFtQixVQUFVLGtCQUFrQixJQUFJLENBQUM7QUFBQSxRQUMxSCxHQUFJLGNBQWMsRUFBRSx1QkFBdUIsWUFBWSxJQUFJLENBQUM7QUFBQSxRQUM1RCxHQUFJLFVBQVUsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBLE1BQzlCO0FBQUEsSUFDRCxDQUFDO0FBSUQsVUFBTSxpQkFBaUIsSUFBSSxJQUFJLEtBQUsscUJBQXFCLE1BQU0sU0FBUyxJQUFJLE9BQUssRUFBRSxTQUFTLFNBQVMsQ0FBQyxDQUFDO0FBQ3ZHLGVBQVcsYUFBYSxLQUFLLFlBQVksV0FBVyxJQUFJLEdBQUc7QUFDMUQsWUFBTSxNQUFNLFVBQVUsZ0JBQWdCLFNBQVM7QUFDL0MsVUFBSSxlQUFlLElBQUksR0FBRyxHQUFHO0FBQUU7QUFBQSxNQUFVO0FBQ3pDLFVBQUksVUFBVSxZQUFZLEVBQUUsV0FBVyxHQUFHO0FBQUU7QUFBQSxNQUFVO0FBQ3RELFlBQU0sWUFBWSxLQUFLLG1CQUFtQixTQUFTO0FBRW5ELFVBQUksVUFBVSxVQUFVLFFBQVE7QUFDL0IsY0FBTSxhQUFhLFVBQVU7QUFDN0IsWUFBSSxhQUFhLFlBQVk7QUFBRTtBQUFBLFFBQVU7QUFBQSxNQUMxQztBQUNBLFlBQU0sV0FBVyxRQUFRO0FBQ3pCLFlBQU0sU0FBUyxLQUFLLG9CQUFvQixVQUFVLE9BQU8sUUFBUTtBQUNqRSxZQUFNLFVBQVUsS0FBSyxxQkFBcUIsU0FBUztBQUNuRCxrQkFBWSxLQUFLO0FBQUEsUUFDaEIsSUFBSTtBQUFBLFFBQ0osR0FBSSxVQUFVLFFBQVEsRUFBRSxPQUFPLFVBQVUsTUFBTSxJQUFJLENBQUM7QUFBQSxRQUNwRCxXQUFXO0FBQUEsUUFDWCxhQUFhLE9BQU87QUFBQSxRQUNwQixHQUFJLENBQUMsT0FBTywwQkFBMEIsVUFBVSxTQUFTLEVBQUUsb0JBQW9CLFVBQVUsT0FBTyxJQUFJLENBQUM7QUFBQSxRQUNyRyxHQUFJLENBQUMsT0FBTywwQkFBMEIsVUFBVSxvQkFBb0IsRUFBRSxtQkFBbUIsVUFBVSxrQkFBa0IsSUFBSSxDQUFDO0FBQUEsUUFDMUgsR0FBSSxVQUFVLHdCQUF3QixFQUFFLHVCQUF1QixVQUFVLHNCQUFzQixJQUFJLENBQUM7QUFBQSxRQUNwRyxHQUFJLFVBQVUsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBLE1BQzlCLENBQUM7QUFBQSxJQUNGO0FBSUEsV0FBTztBQUFBLE1BQ04sVUFBVTtBQUFBLE1BQ1YsZ0JBQWdCLEtBQUssU0FBUyxVQUFVLFlBQVk7QUFBQSxJQUNyRDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPUSxtQkFBbUIsVUFBcUI7QUFDL0MsVUFBTSxNQUFNLFNBQVMsU0FBUztBQUs5QixRQUFJLEtBQUssZ0JBQWdCLElBQUksR0FBRyxLQUFLLEtBQUssbUJBQW1CLElBQUksR0FBRyxLQUFLLEtBQUssWUFBWSxXQUFXLFFBQVEsR0FBRztBQUMvRztBQUFBLElBQ0Q7QUFDQSxTQUFLLFdBQVcsTUFBTSw2Q0FBNkMsSUFBSSxNQUFNLEdBQUcsQ0FBQyxFQUFFO0FBQ25GLFNBQUssbUJBQW1CLElBQUksR0FBRztBQUMvQixVQUFNLE1BQU0sSUFBSSx3QkFBd0I7QUFDeEMsU0FBSyxZQUFZLHFCQUFxQixVQUFVLGtCQUFrQixNQUFNLElBQUksT0FBTyxrQ0FBa0MsRUFBRSxLQUFLLFNBQU87QUFDbEksV0FBSyxtQkFBbUIsT0FBTyxHQUFHO0FBQ2xDLFVBQUksS0FBSztBQUNSLGNBQU0sV0FBVyxLQUFLLGdCQUFnQixJQUFJLEdBQUc7QUFDN0MsWUFBSSxDQUFDLEtBQUssYUFBYSxJQUFJLEtBQUssVUFBVTtBQUN6QyxjQUFJLFFBQVE7QUFDWixjQUFJLENBQUMsS0FBSyxhQUFhLElBQUksR0FBRztBQUM3QixpQkFBSyxzQkFBc0IsT0FBTyxHQUFHO0FBQUEsVUFDdEM7QUFBQSxRQUNELE9BQU87QUFDTixlQUFLLGdCQUFnQixJQUFJLEtBQUssR0FBRztBQUdqQyxlQUFLLDBCQUEwQjtBQUMvQixlQUFLLGFBQWE7QUFDbEIsZUFBSyxtQkFBbUIsb0JBQW9CO0FBTzVDLGNBQUksS0FBSyxnQkFBZ0IsTUFBTSxLQUFLO0FBQ25DLGlCQUFLLHNCQUFzQixRQUFRO0FBQUEsVUFDcEM7QUFBQSxRQUNEO0FBQUEsTUFDRCxPQUFPO0FBRU4sYUFBSyxzQkFBc0IsT0FBTyxHQUFHO0FBQUEsTUFDdEM7QUFDQSxVQUFJLFFBQVE7QUFBQSxJQUNiLEdBQUcsTUFBTTtBQUFFLFdBQUssbUJBQW1CLE9BQU8sR0FBRztBQUFHLFdBQUssc0JBQXNCLE9BQU8sR0FBRztBQUFHLFVBQUksUUFBUTtBQUFBLElBQUcsQ0FBQztBQUFBLEVBQ3pHO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNRLG9DQUFvQyxVQUFxQjtBQUNoRSxTQUFLLHNCQUFzQixJQUFJLFNBQVMsU0FBUyxDQUFDO0FBQ2xELFNBQUssbUJBQW1CLFFBQVE7QUFBQSxFQUNqQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVVRLHNCQUFzQixXQUFtQixPQUFlLFNBQW1DO0FBQ2xHLFFBQUksVUFBVSxVQUFVLFNBQVM7QUFDaEMsV0FBSyx5QkFBeUIsSUFBSSxXQUFXLE9BQU87QUFBQSxJQUNyRCxXQUFXLFVBQVUsWUFBWTtBQUNoQyxXQUFLLHlCQUF5QixPQUFPLFNBQVM7QUFBQSxJQUMvQztBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPUSxvQkFBb0IsZ0JBQW1DO0FBQzlELGVBQVcsTUFBTSxLQUFLLHlCQUF5QixLQUFLLEdBQUc7QUFDdEQsVUFBSSxDQUFDLGVBQWUsSUFBSSxFQUFFLEdBQUc7QUFDNUIsYUFBSyx5QkFBeUIsT0FBTyxFQUFFO0FBQUEsTUFDeEM7QUFBQSxJQUNEO0FBQ0EsZUFBVyxNQUFNLEtBQUssa0JBQWtCLEtBQUssR0FBRztBQUMvQyxVQUFJLENBQUMsZUFBZSxJQUFJLEVBQUUsR0FBRztBQUM1QixhQUFLLGtCQUFrQixPQUFPLEVBQUU7QUFBQSxNQUNqQztBQUFBLElBQ0Q7QUFDQSxlQUFXLE1BQU0sTUFBTSxLQUFLLEtBQUssZ0NBQWdDLEdBQUc7QUFDbkUsVUFBSSxDQUFDLGVBQWUsSUFBSSxFQUFFLEdBQUc7QUFDNUIsYUFBSyxpQ0FBaUMsT0FBTyxFQUFFO0FBQUEsTUFDaEQ7QUFBQSxJQUNEO0FBTUEsZUFBVyxNQUFNLENBQUMsR0FBRyxLQUFLLDBCQUEwQixLQUFLLENBQUMsR0FBRztBQUM1RCxVQUFJLENBQUMsZUFBZSxJQUFJLEVBQUUsR0FBRztBQUM1QixhQUFLLHNCQUFzQixFQUFFO0FBQUEsTUFDOUI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFlUSx3QkFBd0IsV0FBbUIsV0FBc0U7QUFDeEgsUUFBSSxVQUFVLFVBQVUsVUFDcEIsQ0FBQyxVQUFVLHlCQUNYLEtBQUssc0JBQXNCLElBQUksU0FBUyxLQUN4QyxLQUFLLG1CQUFtQixJQUFJLFNBQVMsR0FBRztBQUMzQyxZQUFNLE9BQU8sS0FBSyxtQkFBbUIsSUFBSSxTQUFTO0FBQ2xELGFBQU8sTUFBTSxTQUFTO0FBQUEsSUFDdkI7QUFDQSxXQUFPLFVBQVU7QUFBQSxFQUNsQjtBQUFBLEVBRVEseUJBQXlCLE9BQTZDLFlBQVksdUJBQXVCLCtCQUF1QztBQUN2SixRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxZQUFZLGtCQUFrQixPQUFPLFVBQVUsV0FBVyxFQUFFLE1BQU0sSUFBSSxPQUFPLEVBQUUsa0JBQWtCLEtBQUssQ0FBQyxFQUFFLFFBQVEsUUFBUSxHQUFHLEVBQUUsS0FBSztBQUN6SSxRQUFJLFVBQVUsVUFBVSxXQUFXO0FBQ2xDLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxTQUFTLFVBQVUsTUFBTSxHQUFHLFlBQVksQ0FBQztBQUMvQyxVQUFNLGVBQWUsT0FBTyxZQUFZLEdBQUc7QUFDM0MsVUFBTSxZQUFZLGVBQWUsS0FBSyxNQUFNLFlBQVksR0FBRyxJQUFJLE9BQU8sTUFBTSxHQUFHLFlBQVksSUFBSTtBQUMvRixXQUFPLFNBQVMsZ0NBQWdDLFVBQVUsU0FBUztBQUFBLEVBQ3BFO0FBQUEsRUFFUSwwQkFBMEIsT0FBMEIsVUFBMEI7QUFDckYsVUFBTSxTQUFtQixDQUFDO0FBQzFCLGVBQVcsUUFBUSxNQUFNLE9BQU8sT0FBTyxHQUFHO0FBQ3pDLFlBQU0sWUFBWSxDQUFDLEdBQUcsUUFBUSxJQUFJLEVBQUUsS0FBSyxJQUFJO0FBQzdDLFVBQUksVUFBVSxTQUFTLHVCQUF1QixtQ0FBbUM7QUFDaEY7QUFBQSxNQUNEO0FBQ0EsYUFBTyxLQUFLLElBQUk7QUFBQSxJQUNqQjtBQUNBLFdBQU8sT0FBTyxLQUFLLElBQUksS0FBSztBQUFBLEVBQzdCO0FBQUEsRUFFUSxrQ0FBa0MsVUFBaUMsZ0JBQXFEO0FBQy9ILFdBQU87QUFBQSxNQUNOLFNBQVMsU0FBUztBQUFBLE1BQ2xCLFdBQVcsU0FBUyxVQUFVLElBQUksZUFBYTtBQUFBLFFBQzlDLFFBQVEsU0FBUyxZQUFZLFNBQVMsVUFBVSxTQUFTLEtBQUssU0FBUyxRQUFRO0FBQUEsUUFDL0UsU0FBUyxpQkFBaUIsU0FBUyxlQUFlLFNBQVMsa0JBQWtCO0FBQUEsUUFDN0UsVUFBVSxTQUFTLFdBQVcsQ0FBQyxHQUFHLElBQUksWUFBVSxPQUFPLEtBQUs7QUFBQSxRQUM1RCxvQkFBb0IsU0FBUyx1QkFBdUI7QUFBQSxNQUNyRCxFQUFFO0FBQUEsSUFDSDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHdDQUF3QyxnQkFBNkU7QUFDNUgsUUFBSSxDQUFDLHNDQUFzQyxjQUFjLEdBQUc7QUFDM0QsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFFBQVEsZUFBZSxNQUFNLElBQUk7QUFDdkMsUUFBSSxNQUFNLFNBQVMsb0JBQW9CLFVBQVUsMEJBQTBCLE1BQU0sU0FBUyxvQkFBb0IsVUFBVSx3QkFBd0I7QUFDL0ksYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLGFBQWEsTUFBTTtBQUN6QixRQUFJLENBQUMsU0FBUyxVQUFVLEtBQUssQ0FBQyxPQUFPLFlBQVksV0FBVyxLQUFLLENBQUMsTUFBTSxRQUFRLFdBQVcsU0FBUyxLQUFLLFdBQVcsVUFBVSxXQUFXLEdBQUc7QUFDM0ksYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsTUFDTixXQUFXLFdBQVcsVUFBVSxJQUFJLGlCQUFlO0FBQ2xELFlBQUksQ0FBQyxTQUFTLFdBQVcsR0FBRztBQUMzQixpQkFBTyxFQUFFLFNBQVMsQ0FBQyxHQUFHLG9CQUFvQixLQUFLO0FBQUEsUUFDaEQ7QUFDQSxjQUFNLFNBQVMsT0FBTyxhQUFhLFVBQVUsS0FBSyxPQUFPLFlBQVksYUFBYSxXQUMvRSxZQUFZLFdBQ1o7QUFDSCxjQUFNLFVBQW9CLENBQUM7QUFDM0IsWUFBSSxPQUFPLGFBQWEsU0FBUyxLQUFLLE1BQU0sUUFBUSxZQUFZLE9BQU8sR0FBRztBQUN6RSxxQkFBVyxhQUFhLFlBQVksU0FBUztBQUM1QyxnQkFBSSxDQUFDLFNBQVMsU0FBUyxLQUFLLENBQUMsT0FBTyxXQUFXLE9BQU8sS0FBSyxPQUFPLFVBQVUsVUFBVSxVQUFVO0FBQy9GO0FBQUEsWUFDRDtBQUNBLGtCQUFNLGNBQWMsT0FBTyxXQUFXLGFBQWEsS0FBSyxPQUFPLFVBQVUsZ0JBQWdCLFdBQ3RGLFVBQVUsY0FDVjtBQUNILG9CQUFRLEtBQUssY0FBYyxHQUFHLFVBQVUsS0FBSyxNQUFNLFdBQVcsS0FBSyxVQUFVLEtBQUs7QUFBQSxVQUNuRjtBQUFBLFFBQ0Q7QUFDQSxjQUFNLHFCQUFxQixFQUFFLE9BQU8sYUFBYSxvQkFBb0IsS0FBSyxZQUFZLHVCQUF1QjtBQUM3RyxlQUFPLEVBQUUsUUFBUSxTQUFTLG1CQUFtQjtBQUFBLE1BQzlDLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRVEsOEJBQThCLGVBQStEO0FBQ3BHLFVBQU0sV0FBVyxTQUFTLGdDQUFnQyw4Q0FBOEM7QUFDeEcsUUFBSSxjQUFjLFVBQVUsV0FBVyxHQUFHO0FBQ3pDLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxRQUFRO0FBQUEsTUFDYixjQUFjLFVBQVUsV0FBVyxJQUNoQyxTQUFTLDhCQUE4QiwyQkFBMkIsSUFDbEUsU0FBUyxnQ0FBZ0MsZ0NBQWdDLGNBQWMsVUFBVSxNQUFNO0FBQUEsSUFDM0c7QUFDQSxVQUFNLFVBQVUsS0FBSyx5QkFBeUIsY0FBYyxTQUFTLEdBQUc7QUFDeEUsUUFBSSxTQUFTO0FBQ1osWUFBTSxLQUFLLFNBQVMsK0JBQStCLGdCQUFnQixPQUFPLENBQUM7QUFBQSxJQUM1RTtBQUVBLFFBQUksb0JBQW9CO0FBQ3hCLFVBQU0sZ0JBQWdCLEtBQUssSUFBSSxjQUFjLFVBQVUsUUFBUSx1QkFBdUIsNEJBQTRCO0FBQ2xILGFBQVMsUUFBUSxHQUFHLFFBQVEsZUFBZSxTQUFTO0FBQ25ELFlBQU0sV0FBVyxjQUFjLFVBQVUsS0FBSztBQUM5QyxZQUFNLFNBQVMsS0FBSyx5QkFBeUIsU0FBUyxNQUFNO0FBQzVELFlBQU0sZ0JBQWdCO0FBQUEsUUFDckIsU0FBUyxnQ0FBZ0MsWUFBWSxRQUFRLEdBQUcsVUFBVSxRQUFRO0FBQUEsTUFDbkY7QUFDQSxZQUFNLGNBQWMsS0FBSyx5QkFBeUIsU0FBUyxTQUFTLEdBQUc7QUFDdkUsVUFBSSxlQUFlLGdCQUFnQixRQUFRO0FBQzFDLHNCQUFjLEtBQUssU0FBUyxtQ0FBbUMsZ0JBQWdCLFdBQVcsQ0FBQztBQUFBLE1BQzVGO0FBRUEsWUFBTSxpQkFBaUIsU0FBUyxRQUM5QixJQUFJLFlBQVUsS0FBSyx5QkFBeUIsUUFBUSxHQUFHLENBQUMsRUFDeEQsT0FBTyxPQUFPO0FBQ2hCLFVBQUksZUFBZSxTQUFTLEdBQUc7QUFDOUIsY0FBTSxrQkFBa0IsZUFBZSxNQUFNLEdBQUcsdUJBQXVCLDBCQUEwQjtBQUNqRyxjQUFNLGlCQUFpQixlQUFlLFNBQVMsZ0JBQWdCO0FBQy9ELFlBQUksY0FBYyxnQkFBZ0IsS0FBSyxJQUFJO0FBQzNDLFlBQUksaUJBQWlCLEdBQUc7QUFDdkIsd0JBQWMsU0FBUyxtQ0FBbUMseUJBQXlCLGFBQWEsY0FBYztBQUFBLFFBQy9HO0FBQ0EsWUFBSSxTQUFTLG9CQUFvQjtBQUNoQyx3QkFBYyxTQUFTLG9DQUFvQyw0Q0FBNEMsV0FBVztBQUFBLFFBQ25IO0FBQ0Esc0JBQWMsS0FBSyxTQUFTLCtCQUErQixnQkFBZ0IsV0FBVyxDQUFDO0FBQUEsTUFDeEYsT0FBTztBQUNOLHNCQUFjLEtBQUssU0FBUyxnQ0FBZ0Msc0RBQXNELENBQUM7QUFBQSxNQUNwSDtBQUVBLFlBQU0sMEJBQTBCLGNBQWMsVUFBVSxVQUFVLG9CQUFvQjtBQUN0RixZQUFNLGlCQUFpQiwwQkFBMEIsSUFDOUMsNEJBQTRCLElBQzNCLFNBQVMsa0NBQWtDLDRDQUE0QyxJQUN2RixTQUFTLG1DQUFtQyxrREFBa0QsdUJBQXVCLElBQ3RILFNBQVMsNEJBQTRCLDhDQUE4QztBQUN0RixZQUFNLFlBQVksQ0FBQyxHQUFHLE9BQU8sR0FBRyxlQUFlLGNBQWMsRUFBRSxLQUFLLElBQUk7QUFDeEUsVUFBSSxVQUFVLFNBQVMsdUJBQXVCLG1DQUFtQztBQUNoRjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLEtBQUssR0FBRyxhQUFhO0FBQzNCO0FBQUEsSUFDRDtBQUVBLFVBQU0sbUJBQW1CLGNBQWMsVUFBVSxTQUFTO0FBQzFELFFBQUksbUJBQW1CLEdBQUc7QUFDekIsWUFBTSxLQUFLLHFCQUFxQixJQUM3QixTQUFTLGtDQUFrQyw0Q0FBNEMsSUFDdkYsU0FBUyxtQ0FBbUMsa0RBQWtELGdCQUFnQixDQUFDO0FBQUEsSUFDbkgsT0FBTztBQUNOLFlBQU0sS0FBSyxTQUFTLDRCQUE0Qiw4Q0FBOEMsQ0FBQztBQUFBLElBQ2hHO0FBQ0EsV0FBTyxNQUFNLEtBQUssSUFBSSxLQUFLO0FBQUEsRUFDNUI7QUFBQSxFQUVRLG9CQUFvQixTQUFpRjtBQUM1RyxVQUFNLGlCQUFpQixRQUFRLElBQUksWUFBVTtBQUM1QyxZQUFNLFFBQVEsS0FBSyx5QkFBeUIsT0FBTyxPQUFPLEdBQUc7QUFDN0QsWUFBTSxjQUFjLEtBQUsseUJBQXlCLE9BQU8sYUFBYSxHQUFHO0FBQ3pFLGFBQU8sY0FBYyxTQUFTLHdDQUF3QyxhQUFhLE9BQU8sV0FBVyxJQUFJO0FBQUEsSUFDMUcsQ0FBQyxFQUFFLE9BQU8sT0FBTztBQUNqQixRQUFJLGVBQWUsV0FBVyxHQUFHO0FBQ2hDLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxrQkFBa0IsZUFBZSxNQUFNLEdBQUcsdUJBQXVCLDBCQUEwQjtBQUNqRyxVQUFNLGlCQUFpQixlQUFlLFNBQVMsZ0JBQWdCO0FBQy9ELFVBQU0sT0FBTyxnQkFBZ0IsS0FBSyxJQUFJO0FBQ3RDLFdBQU8saUJBQWlCLElBQ3JCLFNBQVMsa0NBQWtDLHlCQUF5QixNQUFNLGNBQWMsSUFDeEY7QUFBQSxFQUNKO0FBQUEsRUFFUSxxQkFBcUIsTUFBK0I7QUFDM0QsVUFBTSxXQUFXLFNBQVMsdUJBQXVCLDJEQUEyRDtBQUM1RyxVQUFNLFFBQVEsS0FBSyx5QkFBeUIsS0FBSyxLQUFLLEtBQUs7QUFDM0QsVUFBTSxRQUFRLENBQUMsU0FBUyxvQkFBb0Isc0JBQXNCLEtBQUssQ0FBQztBQUN4RSxVQUFNLFVBQVUsS0FBSyxvQkFBb0IsS0FBSyxPQUFPO0FBQ3JELFFBQUksU0FBUztBQUNaLFlBQU0sS0FBSyxTQUFTLHNCQUFzQixnQkFBZ0IsT0FBTyxDQUFDO0FBQUEsSUFDbkU7QUFDQSxVQUFNLEtBQUssU0FBUyxtQkFBbUIscUNBQXFDLENBQUM7QUFDN0UsV0FBTyxLQUFLLDBCQUEwQixPQUFPLFFBQVE7QUFBQSxFQUN0RDtBQUFBLEVBRVEsNEJBQTRCLGFBQThDO0FBQ2pGLFVBQU0sV0FBVyxTQUFTLDhCQUE4QixzREFBc0Q7QUFDOUcsVUFBTSxRQUFRLEtBQUsseUJBQXlCLFlBQVksS0FBSztBQUM3RCxVQUFNLFVBQVUsS0FBSyx5QkFBeUIsWUFBWSxPQUFPO0FBQ2pFLFVBQU0sV0FBVyxLQUFLLHlCQUF5QixZQUFZLFFBQVE7QUFDbkUsVUFBTSxRQUFRLENBQUMsU0FBUywyQkFBMkIsc0JBQXNCLFNBQVMsV0FBVyxRQUFRLENBQUM7QUFDdEcsUUFBSSxZQUFZLGFBQWEsT0FBTztBQUNuQyxZQUFNLEtBQUssUUFBUTtBQUFBLElBQ3BCO0FBQ0EsUUFBSSxXQUFXLFlBQVksT0FBTztBQUNqQyxZQUFNLEtBQUssT0FBTztBQUFBLElBQ25CO0FBQ0EsVUFBTSxVQUFVLEtBQUssb0JBQW9CO0FBQUEsTUFDeEMsRUFBRSxPQUFPLFlBQVksa0JBQWtCO0FBQUEsTUFDdkMsR0FBSSxZQUFZLG9CQUFvQixDQUFDLEVBQUUsT0FBTyxZQUFZLGtCQUFrQixDQUFDLElBQUksQ0FBQztBQUFBLE1BQ2xGLElBQUksWUFBWSxlQUFlLENBQUMsR0FBRyxJQUFJLGFBQVcsRUFBRSxPQUFPLE9BQU8sTUFBTSxFQUFFO0FBQUEsSUFDM0UsQ0FBQztBQUNELFFBQUksU0FBUztBQUNaLFlBQU0sS0FBSyxTQUFTLDZCQUE2QixnQkFBZ0IsT0FBTyxDQUFDO0FBQUEsSUFDMUU7QUFDQSxXQUFPLEtBQUssMEJBQTBCLE9BQU8sUUFBUTtBQUFBLEVBQ3REO0FBQUEsRUFFUSw2QkFBNkIsY0FBeUM7QUFDN0UsVUFBTSxXQUFXLFNBQVMsK0JBQStCLGlEQUFpRDtBQUMxRyxVQUFNLFFBQVEsS0FBSyx5QkFBeUIsYUFBYSxLQUFLO0FBQzlELFVBQU0sVUFBVSxLQUFLLHlCQUF5QixhQUFhLE9BQU87QUFDbEUsVUFBTSxRQUFRLENBQUMsU0FBUyw0QkFBNEIscUJBQXFCLFNBQVMsV0FBVyxRQUFRLENBQUM7QUFDdEcsUUFBSSxXQUFXLFlBQVksT0FBTztBQUNqQyxZQUFNLEtBQUssT0FBTztBQUFBLElBQ25CO0FBQ0EsVUFBTSxVQUFVLEtBQUsscUJBQXFCLGFBQWEsV0FBVyxDQUFDLEdBQUcsSUFBSSxZQUFVLEVBQUUsTUFBTSxFQUFFLENBQUM7QUFDL0YsUUFBSSxTQUFTO0FBQ1osWUFBTSxLQUFLLFNBQVMsOEJBQThCLGdCQUFnQixPQUFPLENBQUM7QUFBQSxJQUMzRTtBQUNBLFdBQU8sS0FBSywwQkFBMEIsT0FBTyxRQUFRO0FBQUEsRUFDdEQ7QUFBQSxFQUVRLHFCQUFxQixnQkFBNkM7QUFDekUsVUFBTSxXQUFXLFNBQVMsbUNBQW1DLGlEQUFpRDtBQUM5RyxVQUFNLFFBQVEsZUFBZSxNQUFNLElBQUk7QUFDdkMsUUFBSSxNQUFNLFNBQVMsb0JBQW9CLFVBQVUsMEJBQTBCLE1BQU0sU0FBUyxvQkFBb0IsVUFBVSx3QkFBd0I7QUFDL0ksYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFdBQVcsTUFBTTtBQUN2QixVQUFNLFFBQVEsS0FBSyx5QkFBeUIsVUFBVSxLQUFLLEtBQUssS0FBSyx5QkFBeUIsZUFBZSxpQkFBaUI7QUFDOUgsVUFBTSxVQUFVLEtBQUsseUJBQXlCLFVBQVUsT0FBTztBQUMvRCxVQUFNLFFBQVEsQ0FBQyxTQUFTLGdDQUFnQyxzQkFBc0IsU0FBUyxXQUFXLFFBQVEsQ0FBQztBQUMzRyxRQUFJLFdBQVcsWUFBWSxPQUFPO0FBQ2pDLFlBQU0sS0FBSyxPQUFPO0FBQUEsSUFDbkI7QUFDQSxXQUFPLEtBQUssMEJBQTBCLE9BQU8sUUFBUTtBQUFBLEVBQ3REO0FBQUEsRUFFUSwrQkFBdUM7QUFDOUMsVUFBTSxXQUFXLFNBQVMsbUNBQW1DLGlEQUFpRDtBQUM5RyxXQUFPLFNBQVMsZ0NBQWdDLHNCQUFzQixRQUFRO0FBQUEsRUFDL0U7QUFBQSxFQUVRLG1DQUFtQyxnQkFBeUQ7QUFDbkcsVUFBTSxRQUFRLGVBQWUsTUFBTSxJQUFJO0FBQ3ZDLFFBQUksTUFBTSxTQUFTLG9CQUFvQixVQUFVLDBCQUEwQjtBQUMxRSxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sYUFBYSxLQUFLLHlCQUF5QixNQUFNLE9BQU8sSUFBSTtBQUNsRSxVQUFNLFdBQVcsU0FBUyxpQ0FBaUMsa0RBQWtEO0FBQzdHLFdBQU8sS0FBSywwQkFBMEI7QUFBQSxNQUNyQyxTQUFTLDhCQUE4QixxREFBcUQ7QUFBQSxNQUM1RixhQUNHLFNBQVMsZ0NBQWdDLDBFQUEwRSxVQUFVLElBQzdIO0FBQUEsTUFDSCxTQUFTLGdDQUFnQywrQkFBK0I7QUFBQSxJQUN6RSxHQUFHLFFBQVE7QUFBQSxFQUNaO0FBQUEsRUFFUSxtQkFBbUIsT0FBMEk7QUFDcEssVUFBTSxjQUFjLE9BQU8sWUFBWSxFQUFFLEdBQUcsRUFBRTtBQUM5QyxVQUFNLFFBQVEsYUFBYSxVQUFVLFNBQVM7QUFDOUMsUUFBSSxDQUFDLGVBQWUsQ0FBQyxPQUFPO0FBQzNCLGFBQU87QUFBQSxJQUNSO0FBRUEsYUFBUyxRQUFRLEdBQUcsUUFBUSxNQUFNLFFBQVEsU0FBUztBQUNsRCxZQUFNLE9BQU8sTUFBTSxLQUFLO0FBQ3hCLFlBQU0sT0FBTyx5QkFBeUIsQ0FBQyxJQUFJLENBQUM7QUFDNUMsVUFBSSxRQUFRLEtBQUssbUJBQW1CLElBQUksR0FBRztBQUMxQyxZQUFJLFNBQVMsbUJBQW1CLCtCQUErQixJQUFJLEdBQUc7QUFDckUsZ0JBQU0sV0FBVyxNQUFNLE1BQU0sUUFBUSxDQUFDLEVBQUUsS0FBSyxlQUM1QyxVQUFVLFNBQVMsc0JBQ2hCLFVBQVUsY0FBYyxLQUFLLGNBQzdCLEtBQUssbUJBQW1CLFNBQVMsQ0FBQztBQUN0QyxjQUFJLFVBQVU7QUFDYixtQkFBTyxFQUFFLFdBQVcsWUFBWSxJQUFJLE1BQU0sTUFBTSxTQUFTO0FBQUEsVUFDMUQ7QUFBQSxRQUNEO0FBQ0EsZUFBTyxFQUFFLFdBQVcsWUFBWSxJQUFJLE1BQU0sS0FBSztBQUFBLE1BQ2hEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxtQkFBbUIsTUFBNkM7QUFDdkUsUUFBSSxLQUFLLFNBQVMsb0JBQW9CO0FBQ3JDLGFBQU8sQ0FBQyxLQUFLLFVBQVUsQ0FBQyxLQUFLO0FBQUEsSUFDOUI7QUFDQSxRQUFJLEtBQUssU0FBUyxnQkFBZ0I7QUFDakMsYUFBTyxLQUFLLE1BQU0sSUFBSSxNQUFNO0FBQUEsSUFDN0I7QUFDQSxRQUFJLEtBQUssU0FBUyxnQkFBZ0IsS0FBSyxTQUFTLGdCQUFnQjtBQUMvRCxhQUFPLENBQUMsS0FBSztBQUFBLElBQ2Q7QUFDQSxRQUFJLEtBQUssU0FBUyxrQkFBa0I7QUFDbkMsWUFBTSxRQUFRLEtBQUssTUFBTSxJQUFJO0FBQzdCLGFBQU8sTUFBTSxTQUFTLG9CQUFvQixVQUFVLDBCQUNoRCxNQUFNLFNBQVMsb0JBQW9CLFVBQVUsMEJBQzdDLE1BQU0sU0FBUyxvQkFBb0IsVUFBVTtBQUFBLElBQ2xEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLDRCQUE0QixPQUFpRjtBQUNwSCxVQUFNLGVBQWUsTUFBTSxZQUFZLEVBQUUsR0FBRyxFQUFFLEdBQUc7QUFDakQsUUFBSSxDQUFDLGNBQWM7QUFDbEIsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFFBQVEsYUFBYSxTQUFTO0FBQ3BDLFVBQU0sV0FBVyxLQUFLLG1CQUFtQixLQUFLO0FBQzlDLFFBQUksQ0FBQyxVQUFVO0FBQ2QsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLEVBQUUsTUFBTSxLQUFLLElBQUk7QUFFdkIsVUFBTSxzQkFBc0IsSUFBSSxJQUFJLE1BQ2xDLE9BQU8sOEJBQThCLEVBQ3JDLElBQUksQ0FBQUMsVUFBUUEsTUFBSyxVQUFVLENBQUM7QUFDOUIsUUFBSSxTQUFTLG1CQUFtQixNQUFNLFNBQVMsb0JBQW9CO0FBQ2xFLFlBQU0saUJBQWlCLENBQUMsS0FBSyxhQUFhLENBQUMsb0JBQW9CLElBQUksS0FBSyxTQUFTO0FBQ2pGLGFBQU8sRUFBRSxNQUFNLFFBQVEsS0FBSyw4QkFBOEIsS0FBSyxrQ0FBa0MsTUFBTSxjQUFjLENBQUMsRUFBRTtBQUFBLElBQ3pIO0FBQ0EsUUFBSSxTQUFTLG1CQUFtQixNQUFNLFNBQVMsa0JBQWtCO0FBQ2hFLFlBQU0sZ0JBQWdCLEtBQUssd0NBQXdDLElBQUk7QUFDdkUsVUFBSSxlQUFlO0FBQ2xCLGVBQU8sRUFBRSxNQUFNLFFBQVEsS0FBSyw4QkFBOEIsYUFBYSxFQUFFO0FBQUEsTUFDMUU7QUFBQSxJQUNEO0FBQ0EsUUFBSSxTQUFTLGlCQUFpQixNQUFNLFNBQVMsZ0JBQWdCO0FBQzVELGFBQU8sRUFBRSxNQUFNLFFBQVEsS0FBSyw0QkFBNEIsSUFBSSxFQUFFO0FBQUEsSUFDL0Q7QUFDQSxRQUFJLFNBQVMsVUFBVSxNQUFNLFNBQVMsY0FBYztBQUNuRCxhQUFPLEVBQUUsTUFBTSxRQUFRLEtBQUsscUJBQXFCLElBQUksRUFBRTtBQUFBLElBQ3hEO0FBQ0EsUUFBSSxTQUFTLFVBQVUsTUFBTSxTQUFTLGtCQUFrQjtBQUN2RCxhQUFPLEVBQUUsTUFBTSxRQUFRLEtBQUsscUJBQXFCLElBQUksRUFBRTtBQUFBLElBQ3hEO0FBQ0EsUUFBSSxTQUFTLGFBQWEsTUFBTSxTQUFTLGdCQUFnQjtBQUN4RCxhQUFPLEVBQUUsTUFBTSxRQUFRLEtBQUssNkJBQTZCLElBQUksRUFBRTtBQUFBLElBQ2hFO0FBQ0EsUUFBSSxTQUFTLGFBQWEsTUFBTSxTQUFTLGtCQUFrQjtBQUMxRCxhQUFPLEVBQUUsTUFBTSxRQUFRLEtBQUssbUNBQW1DLElBQUksRUFBRTtBQUFBLElBQ3RFO0FBQ0EsUUFBSSxTQUFTLGlCQUFpQjtBQUM3QixhQUFPLEVBQUUsS0FBSztBQUFBLElBQ2Y7QUFDQSxXQUFPLEVBQUUsTUFBTSxRQUFRLEtBQUssNkJBQTZCLEVBQUU7QUFBQSxFQUM1RDtBQUFBLEVBRVEsbUJBQW1CLE9BQTREO0FBQ3RGLFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTyxFQUFFLE9BQU8sVUFBVTtBQUFBLElBQzNCO0FBRUEsVUFBTSxjQUFjLE1BQU0sWUFBWSxFQUFFLEdBQUcsRUFBRTtBQUc3QyxRQUFJLGFBQWEsVUFBVSxZQUFZO0FBQ3RDLGFBQU8sRUFBRSxPQUFPLE9BQU87QUFBQSxJQUN4QjtBQUVBLFVBQU0sc0JBQXNCLGFBQWEsVUFBVSxzQkFBc0IsSUFBSTtBQUM3RSxVQUFNLGVBQWUsS0FBSyw0QkFBNEIsS0FBSztBQUMzRCxRQUFJLHVCQUF1QixjQUFjO0FBQ3hDLGFBQU87QUFBQSxRQUNOLE9BQU87QUFBQSxRQUNQLEdBQUksY0FBYyxTQUFTLEVBQUUsUUFBUSxhQUFhLE9BQU8sSUFBSSxDQUFDLGVBQWUsRUFBRSxRQUFRLEtBQUssNkJBQTZCLEVBQUUsSUFBSSxDQUFDO0FBQUEsUUFDaEksbUJBQW1CLGNBQWMsUUFBUTtBQUFBLE1BQzFDO0FBQUEsSUFDRDtBQUVBLFVBQU0sYUFBYSxhQUFhLFVBQVUsYUFBYSxJQUFJLEtBQUs7QUFDaEUsUUFBSSxZQUFZO0FBQ2YsYUFBTyxFQUFFLE9BQU8sV0FBVztBQUFBLElBQzVCO0FBRUEsVUFBTSxlQUFlO0FBQUEsTUFDcEIsYUFBYSxVQUFVLFNBQVMsWUFBWSxFQUFFLEtBQUs7QUFBQSxNQUNuRCxhQUFhLFVBQVUsUUFBUSxjQUFjLFFBQVEsS0FBSztBQUFBLElBQzNELEVBQUUsT0FBTyxXQUFTLENBQUMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxNQUFNO0FBQ3RDLFdBQU8sRUFBRSxPQUFPLFFBQVEsR0FBSSxlQUFlLEVBQUUsdUJBQXVCLGFBQWEsSUFBSSxDQUFDLEVBQUc7QUFBQSxFQUMxRjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQWFRLHFCQUFxQixPQUF3RTtBQUNwRyxVQUFNLFdBQVcsS0FBSyxtQkFBbUIsS0FBSztBQUM5QyxRQUFJLENBQUMsWUFBYSxTQUFTLFNBQVMsbUJBQW1CLFNBQVMsU0FBUyxVQUFVLFNBQVMsU0FBUyxRQUFTO0FBQzdHLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxFQUFFLFdBQVcsTUFBTSxLQUFLLElBQUk7QUFDbEMsVUFBTSxVQUFVLE9BQU8sRUFBRSxZQUFZLGdCQUFnQixXQUFXLElBQUksR0FBRyxZQUFZLFVBQVU7QUFDN0YsUUFBSSxTQUFTLG1CQUFtQixLQUFLLFNBQVMsb0JBQW9CO0FBQ2pFLFlBQU0sV0FBVztBQUNqQixVQUFJLFNBQVMsc0JBQXNCLFNBQVMsVUFBVSxXQUFXLEdBQUc7QUFDbkUsZUFBTztBQUFBLE1BQ1I7QUFDQSxhQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixHQUFHLFFBQVE7QUFBQSxRQUNYLFlBQVksU0FBUyxjQUFjO0FBQUEsUUFDbkMsR0FBSSxTQUFTLFVBQVUsRUFBRSxTQUFTLEtBQUssV0FBVyxTQUFTLE9BQU8sRUFBRSxJQUFJLENBQUM7QUFBQSxRQUN6RSxXQUFXLFNBQVMsVUFBVSxJQUFJLENBQUMsY0FBcUM7QUFBQSxVQUN2RSxJQUFJLFNBQVM7QUFBQSxVQUNiLE1BQU0sU0FBUztBQUFBLFVBQ2YsT0FBTyxLQUFLLFdBQVcseUJBQXlCLFFBQVEsQ0FBQztBQUFBLFVBQ3pELGdCQUFnQixTQUFTLHVCQUF1QjtBQUFBLFVBQ2hELFNBQVMsNEJBQTRCLFFBQVEsRUFBRSxJQUFJLENBQUMsRUFBRSxPQUFPLE9BQU87QUFBQSxZQUNuRSxPQUFPLE9BQU87QUFBQSxZQUNkLE9BQU8sT0FBTztBQUFBLFVBQ2YsRUFBRTtBQUFBLFFBQ0gsRUFBRTtBQUFBLE1BQ0g7QUFBQSxJQUNEO0FBQ0EsUUFBSSxTQUFTLFVBQVUsS0FBSyxTQUFTLGNBQWM7QUFDbEQsYUFBTyxFQUFFLE1BQU0sWUFBWSxHQUFHLFFBQVEsR0FBRyxTQUFTLEtBQUsscUJBQXFCLElBQUksRUFBRTtBQUFBLElBQ25GO0FBQ0EsUUFBSSxTQUFTLFVBQVUsS0FBSyxTQUFTLGtCQUFrQjtBQUN0RCxhQUFPLEVBQUUsTUFBTSxZQUFZLEdBQUcsUUFBUSxHQUFHLFNBQVMsS0FBSyxxQkFBcUIsSUFBSSxFQUFFO0FBQUEsSUFDbkY7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsV0FBVyxPQUFxRDtBQUN2RSxRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxPQUFPLFVBQVUsV0FBVyxRQUFRLE1BQU07QUFBQSxFQUNsRDtBQUFBLEVBRVEscUJBQXFCLFVBQXNGO0FBRWxILFFBQUksU0FBK0I7QUFDbkMsZUFBVyxRQUFRLFNBQVMsU0FBUyxPQUFPO0FBQzNDLFVBQUksS0FBSyxTQUFTLGtCQUFrQjtBQUNuQyxjQUFNLGFBQWE7QUFDbkIsY0FBTSxRQUFRLFdBQVcsTUFBTSxJQUFJO0FBQ25DLFlBQUksTUFBTSxTQUFTLG9CQUFvQixVQUFVLDBCQUNoRCxNQUFNLFNBQVMsb0JBQW9CLFVBQVUsd0JBQXdCO0FBQ3JFLG1CQUFTO0FBQUEsUUFDVjtBQUFBLE1BQ0Q7QUFDQSxVQUFJLEtBQUssU0FBUyxrQkFBa0IsQ0FBRSxLQUE4QixRQUFRO0FBQzNFLGlCQUFTO0FBQUEsTUFDVjtBQUNBLFVBQUksS0FBSyxTQUFTLHNCQUFzQixDQUFFLEtBQThCLFFBQVE7QUFDL0UsaUJBQVM7QUFBQSxNQUNWO0FBQ0EsVUFBSSxLQUFLLFNBQVMsZ0JBQWdCLENBQUUsS0FBOEIsUUFBUTtBQUN6RSxpQkFBUztBQUFBLE1BQ1Y7QUFDQSxVQUFJLEtBQUssU0FBUyxnQkFBZ0I7QUFDakMsaUJBQVM7QUFBQSxNQUNWO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSw0QkFBNEIsVUFBd0U7QUFFM0csUUFBSSxPQUFPO0FBQ1gsZUFBVyxRQUFRLFNBQVMsU0FBUyxPQUFPO0FBQzNDLFVBQUksS0FBSyxTQUFTLGtCQUFrQjtBQUNuQyxjQUFNLGFBQWE7QUFDbkIsY0FBTSxRQUFRLFdBQVcsTUFBTSxJQUFJO0FBQ25DLFlBQUksTUFBTSxTQUFTLG9CQUFvQixVQUFVLHdCQUF3QjtBQUN4RSxnQkFBTSxTQUFTLE1BQU07QUFDckIsZ0JBQU0sVUFBVSxTQUFTLFNBQVMsS0FBSyxTQUFTLE9BQU87QUFDdkQsZ0JBQU0sY0FBYyxTQUFTLGFBQWEsS0FBSyxTQUFTLE1BQU07QUFDOUQsY0FBSSxPQUFPLFlBQVksWUFBWSxTQUFTO0FBQzNDLG1CQUFPLE9BQU8sZ0JBQWdCLFdBQVcsR0FBRyxPQUFPLFdBQU0sV0FBVyxLQUFLO0FBQUEsVUFDMUU7QUFBQSxRQUNEO0FBQUEsTUFDRCxXQUFXLEtBQUssU0FBUyxzQkFBc0IsQ0FBRSxLQUE4QixRQUFRO0FBQ3RGLGNBQU0sV0FBVztBQUNqQixjQUFNLFVBQVUsU0FBUyxhQUFhLENBQUMsR0FBRyxJQUFJLE9BQUssRUFBRSxLQUFLLEVBQUUsT0FBTyxPQUFPO0FBQzFFLFlBQUksT0FBTyxTQUFTLEdBQUc7QUFDdEIsaUJBQU8sT0FBTyxLQUFLLElBQUk7QUFBQSxRQUN4QixPQUFPO0FBQ04sZ0JBQU0sTUFBTSxTQUFTO0FBQ3JCLGlCQUFPLE1BQU8sT0FBTyxRQUFRLFdBQVcsTUFBTSxJQUFJLFFBQVM7QUFBQSxRQUM1RDtBQUFBLE1BQ0QsV0FBVyxLQUFLLFNBQVMsZ0JBQWdCO0FBQ3hDLGNBQU0sY0FBYztBQUNwQixZQUFJLFlBQVksTUFBTSxJQUFJLE1BQU0sV0FBVztBQUMxQyxnQkFBTSxRQUFRLFlBQVk7QUFDMUIsaUJBQU8sUUFBUyxPQUFPLFVBQVUsV0FBVyxRQUFRLE1BQU0sUUFBUztBQUFBLFFBQ3BFO0FBQUEsTUFDRCxXQUFXLEtBQUssU0FBUyxnQkFBZ0IsQ0FBRSxLQUE4QixRQUFRO0FBQ2hGLGVBQU87QUFBQSxNQUNSLFdBQVcsS0FBSyxTQUFTLGtCQUFrQixDQUFFLEtBQThCLFFBQVE7QUFDbEYsZUFBUSxLQUE0QixTQUFTO0FBQUEsTUFDOUM7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLG9CQUEwQjtBQUNqQyxRQUFJLEtBQUssc0JBQXNCLFNBQVMsR0FBRztBQUFFO0FBQUEsSUFBUTtBQUNyRCxVQUFNLFdBQVcsS0FBSyxxQkFBcUIsTUFBTSxTQUFTLE9BQU8sT0FBSyxDQUFDLEVBQUUsV0FBVyxDQUFDO0FBQ3JGLGVBQVcsS0FBSyxVQUFVO0FBQ3pCLFVBQUksQ0FBQyxLQUFLLHNCQUFzQixJQUFJLEVBQUUsU0FBUyxTQUFTLENBQUMsR0FBRztBQUFFO0FBQUEsTUFBVTtBQUN4RSxZQUFNLFFBQVEsS0FBSyxZQUFZLFdBQVcsRUFBRSxRQUFRO0FBQ3BELFVBQUksQ0FBQyxPQUFPO0FBQUU7QUFBQSxNQUFVO0FBQ3hCLFdBQUsseUJBQXlCLEtBQUs7QUFBQSxJQUNwQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLHlCQUF5QixPQUF5QjtBQUN6RCxlQUFXLFdBQVcsTUFBTSxZQUFZLEdBQUc7QUFDMUMsWUFBTSxXQUFXLFFBQVE7QUFDekIsVUFBSSxDQUFDLFVBQVUsc0JBQXNCLElBQUksS0FBSyx5QkFBeUIsU0FBUyxTQUFTLEtBQUssTUFBTSxRQUFRO0FBQzNHO0FBQUEsTUFDRDtBQUNBLGlCQUFXLFFBQVEsU0FBUyxTQUFTLE9BQU87QUFDM0MsWUFBSSxLQUFLLFNBQVMsa0JBQWtCO0FBQ25DLDhCQUFvQixZQUFZLE1BQU0sRUFBRSxNQUFNLGdCQUFnQixXQUFXLENBQUM7QUFBQSxRQUMzRTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBO0FBQUEsRUFJUSxnQkFBd0I7QUFDL0IsV0FBUSxLQUFLLG1CQUE4QyxhQUFhO0FBQUEsRUFDekU7QUFBQTtBQUFBLEVBSUEsTUFBTSxlQUFlLGNBQWdFO0FBQ3BGLFFBQUksU0FBUyxLQUFLO0FBQ2xCLFFBQUksQ0FBQyxRQUFRO0FBQ1osVUFBSTtBQUNILGNBQU1DLFlBQVcsTUFBTSxLQUFLLHNCQUFzQixZQUFZLFFBQVE7QUFDdEUsaUJBQVNBLFVBQVMsQ0FBQyxHQUFHLFFBQVEsU0FBUztBQUFBLE1BQ3hDLFFBQVE7QUFDUCxpQkFBUztBQUFBLE1BQ1Y7QUFBQSxJQUNEO0FBQ0EsUUFBSSxvQkFBb0QsQ0FBQztBQUN6RCxRQUFJO0FBQ0gsWUFBTSxRQUFRLE1BQU0sS0FBSyxxQkFBcUIsVUFBVSxNQUFNO0FBQzlELDBCQUFvQixNQUFNLElBQUksUUFBTTtBQUFBLFFBQ25DLE1BQU0sRUFBRTtBQUFBLFFBQ1IsTUFBTSxFQUFFO0FBQUEsUUFDUixXQUFXLEVBQUU7QUFBQSxNQUNkLEVBQUU7QUFBQSxJQUNILFNBQVMsS0FBSztBQUNiLFdBQUssV0FBVyxLQUFLLDBEQUEwRCxHQUFHO0FBQUEsSUFDbkY7QUFFQSxVQUFNLFdBQVcsS0FBSyxxQkFBcUIsTUFBTSxTQUFTLE9BQU8sT0FBSyxDQUFDLEVBQUUsV0FBVyxDQUFDO0FBQ3JGLFVBQU0scUJBQThDO0FBQUEsTUFDbkQsWUFBWSxLQUFLLFlBQVksSUFBSTtBQUFBLE1BQ2pDLGFBQWEsS0FBSyxhQUFhLElBQUk7QUFBQSxNQUNuQyxjQUFjLEtBQUssY0FBYyxJQUFJO0FBQUEsTUFDckMsZ0JBQWdCLEtBQUssZ0JBQWdCLElBQUk7QUFBQSxNQUN6QywwQkFBMEIsS0FBSywwQkFBMEIsSUFBSSxFQUFFLElBQUksU0FBTztBQUFBLFFBQ3pFLE1BQU0sR0FBRztBQUFBLFFBQ1QsY0FBYyxHQUFHO0FBQUEsUUFDakIsYUFBYSxHQUFHO0FBQUEsTUFDakIsRUFBRTtBQUFBLE1BQ0YsZ0JBQWdCLFNBQVMsSUFBSSxRQUFNO0FBQUEsUUFDbEMsSUFBSSxFQUFFLFNBQVMsU0FBUztBQUFBLFFBQ3hCLE9BQU8sRUFBRTtBQUFBLFFBQ1QsUUFBUSxFQUFFO0FBQUEsTUFDWCxFQUFFO0FBQUEsSUFDSDtBQUVBLFVBQU0sb0JBQTZDO0FBQUEsTUFDbEQsV0FBVyxLQUFLLGNBQWM7QUFBQSxJQUMvQjtBQUVBLFVBQU0sVUFBaUM7QUFBQSxNQUN0QztBQUFBLE1BQ0EsV0FBVyxLQUFLLGNBQWM7QUFBQSxNQUM5QjtBQUFBLE1BQ0EsV0FBVyxLQUFLLG1CQUFtQixvQkFBb0I7QUFBQSxNQUN2RCxjQUFjLGFBQWE7QUFBQSxNQUMzQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxZQUFXLG9CQUFJLEtBQUssR0FBRSxZQUFZO0FBQUEsSUFDbkM7QUFFQSxXQUFPLEtBQUssbUJBQW1CLGVBQWUsT0FBTztBQUFBLEVBQ3REO0FBQ0Q7QUFBQTtBQUFBO0FBQUE7QUE5b01hLHVCQWNZLGFBQWE7QUFkekIsdUJBdUdZLHNCQUFzQjtBQXZHbEMsdUJBNkdZLHVCQUF1QixJQUFJLEtBQUs7QUFBQTtBQUFBO0FBN0c1Qyx1QkFnSFksMkJBQTJCO0FBQUE7QUFoSHZDLHVCQW1IWSx3QkFBd0I7QUFuSHBDLHVCQThRWSwrQkFBK0I7QUE5UTNDLHVCQW9TWSwyQkFBMkI7QUFBQTtBQUFBO0FBcFN2Qyx1QkF1U1ksNEJBQTRCO0FBQUE7QUFBQTtBQUFBO0FBdlN4Qyx1QkEyU1ksMkJBQTJCO0FBM1N2Qyx1QkFvVFksK0JBQStCO0FBcFQzQyx1QkFnVVksMEJBQTBCO0FBaFV0Qyx1QkFzWVksOENBQThDO0FBdFkxRCx1QkF1WVksbUNBQW1DO0FBdlkvQyx1QkF3WVksOEJBQThCO0FBeFkxQyx1QkF5WVksa0NBQWtDO0FBelk5Qyx1QkEwWVksb0NBQW9DO0FBMVloRCx1QkEyWVksK0JBQStCO0FBM1kzQyx1QkE0WVksNkJBQTZCO0FBNVl6Qyx1QkE2WVksZ0NBQWdDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQTdZNUMsdUJBdWNZLDZCQUE2QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUF2Y3pDLHVCQTZjWSxvQ0FBb0M7QUE3Y2hELHlCQUFOO0FBQUEsRUFnZEo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWxlVTtBQWdwTWIsa0JBQWtCLHlCQUF5Qix3QkFBd0Isa0JBQWtCLE9BQU87IiwKICAibmFtZXMiOiBbImNvbmZpcm1hdGlvblR5cGUiLCAic2NvcGVkIiwgInBhcnQiLCAic2Vzc2lvbnMiXQp9Cg==
