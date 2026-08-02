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
import { constObservable } from "../../../../../base/common/observable.js";
import { localize } from "../../../../../nls.js";
import { createDecorator } from "../../../../../platform/instantiation/common/instantiation.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
import { IAgentSessionsService } from "../agentSessions/agentSessionsService.js";
import { AgentSessionStatus, getAgentChangesSummary } from "../agentSessions/agentSessionsModel.js";
import { IChatService, IChatToolInvocation, ToolConfirmKind } from "../../common/chatService/chatService.js";
import { resolveQuestionAnswers } from "../../common/voiceClient/voiceQuestionAnswers.js";
import { ChatQuestionCarouselData } from "../../common/model/chatProgressTypes/chatQuestionCarouselData.js";
import { ChatPlanReviewData } from "../../common/model/chatProgressTypes/chatPlanReviewData.js";
import { ChatAgentLocation, ChatModeKind } from "../../common/constants.js";
import { ILanguageModelToolsService } from "../../common/tools/languageModelToolsService.js";
import { peekPendingId } from "../../common/voiceClient/voiceClientService.js";
import { getVoiceConfirmationType } from "../../common/voiceClient/voiceConfirmation.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
const IVoiceToolDispatchService = createDecorator("voiceToolDispatchService");
const ACTION_LABELS = {
  send_to_chat: localize("agentsVoice.action.sendToChat", "Sending to chat..."),
  new_sessions: localize("agentsVoice.action.newSessions", "Starting new sessions..."),
  get_session_info: localize("agentsVoice.action.getSessionInfo", "Checking sessions..."),
  get_session_changes: localize("agentsVoice.action.getSessionChanges", "Checking changes..."),
  get_session_thread: localize("agentsVoice.action.getSessionThread", "Checking conversation..."),
  respond_to_session: localize("agentsVoice.action.respond", "Responding..."),
  focus_session: localize("agentsVoice.action.focusSession", "Focusing session..."),
  auto_approve_session: localize("agentsVoice.action.autoApprove", "Auto-approving session..."),
  revoke_auto_approve: localize("agentsVoice.action.revokeAutoApprove", "Revoking auto-approve...")
};
let VoiceToolDispatchService = class {
  constructor(agentSessionsService, chatService, toolsService) {
    this.agentSessionsService = agentSessionsService;
    this.chatService = chatService;
    this.toolsService = toolsService;
  }
  setDelegate(delegate) {
    this._delegate = delegate;
  }
  /** Get the action label for a tool call name. */
  static getActionLabel(name) {
    return ACTION_LABELS[name] ?? localize("agentsVoice.action.working", "Working...");
  }
  get _agentModeOptions() {
    const allTools = {};
    for (const tool of this.toolsService.getTools(void 0)) {
      allTools[tool.id] = true;
    }
    return {
      modeInfo: {
        kind: ChatModeKind.Agent,
        isBuiltin: true,
        modeInstructions: void 0,
        telemetryModeId: "agent",
        applyCodeBlockSuggestionId: void 0
      },
      instructionContext: {
        modeKind: ChatModeKind.Agent,
        enabledTools: allTools
      },
      userSelectedTools: constObservable(allTools)
    };
  }
  async dispatchToolCall(toolCall) {
    const delegate = this._delegate;
    if (!delegate) {
      return "error: no delegate set";
    }
    const args = toolCall.args;
    const argString = (k) => {
      const v = args[k];
      return typeof v === "string" ? v : "";
    };
    switch (toolCall.name) {
      case "send_to_chat": {
        const text = argString("text");
        if (text) {
          if (!delegate.acceptInput(text)) {
            const resource = await delegate.getCurrentSessionResource();
            if (resource) {
              await this.chatService.sendRequest(resource, text, this._agentModeOptions);
            } else {
              const ref = this.chatService.startNewLocalSession(ChatAgentLocation.Chat);
              await this.chatService.sendRequest(ref.object.sessionResource, text, this._agentModeOptions);
              ref.dispose();
            }
          }
        }
        break;
      }
      case "new_sessions": {
        const sessions = args["sessions"];
        const items = Array.isArray(sessions) ? sessions : [{ text: argString("text") }];
        let firstResource;
        for (const item of items) {
          const text = item.text;
          if (text) {
            const ref = this.chatService.startNewLocalSession(ChatAgentLocation.Chat);
            const resource = ref.object.sessionResource;
            if (!firstResource) {
              firstResource = resource;
            }
            await this.chatService.sendRequest(resource, text, this._agentModeOptions);
            ref.dispose();
          }
        }
        if (firstResource) {
          delegate.switchToSession(firstResource);
        }
        break;
      }
      case "focus_session": {
        const targetSessionId = argString("coding_session_id");
        let targetResource;
        if (targetSessionId) {
          const agentSession = this.agentSessionsService.model.sessions.find((s) => !s.isArchived() && s.resource.toString() === targetSessionId);
          targetResource = agentSession?.resource;
          if (!targetResource) {
            for (const chatModel of this.chatService.chatModels.get()) {
              if (chatModel.sessionResource.toString() === targetSessionId) {
                targetResource = chatModel.sessionResource;
                break;
              }
            }
          }
        }
        if (targetResource) {
          const currentResource = await delegate.getCurrentSessionResource();
          if (targetResource.toString() !== currentResource?.toString()) {
            delegate.switchToSession(targetResource);
          }
        }
        break;
      }
      case "auto_approve_session": {
        delegate.addAllAutoApprovedSessions();
        break;
      }
      case "revoke_auto_approve": {
        const sessionResource = await delegate.getCurrentSessionResource();
        if (sessionResource) {
          delegate.removeAutoApprovedSession(sessionResource.toString());
        }
        break;
      }
      case "get_session_info": {
        return await this._gatherSessionInfo();
      }
      case "get_session_changes": {
        const sessionId = typeof toolCall.args?.coding_session_id === "string" ? toolCall.args.coding_session_id : void 0;
        return await this._gatherSessionChanges(sessionId);
      }
      case "get_session_thread": {
        const sessionId = typeof toolCall.args?.coding_session_id === "string" ? toolCall.args.coding_session_id : void 0;
        const rawN = toolCall.args?.last_n_turns;
        const lastN = typeof rawN === "number" && rawN > 0 ? Math.min(10, Math.floor(rawN)) : 3;
        return await this._gatherSessionThread(sessionId, lastN);
      }
    }
    return "ok";
  }
  /**
   * Apply a backend-resolved response to the exact pending part it names.
   *
   * Routing is by `pending_id` + `request_id` with no fallback: the path this
   * replaces fell back to the focused session, so a spoken "yes" could approve
   * a prompt the user was not looking at. A response that cannot find its part
   * is reported as stale instead. Answer values are matched exactly; see
   * `resolveQuestionAnswers`.
   */
  async respondToSession(toolCall) {
    const args = toolCall.args;
    const argString = (key) => {
      const value = args[key];
      return typeof value === "string" ? value : "";
    };
    const response = args["response"];
    if (!response || typeof response !== "object" || Array.isArray(response)) {
      return { ok: false, reason: "unsupported" };
    }
    const responseType = response["type"];
    if (responseType !== "approve" && responseType !== "reject" && responseType !== "answer" && responseType !== "skip") {
      return { ok: false, reason: "unsupported" };
    }
    const resolved = await this._resolveModelForResponse(argString("coding_session_id"));
    if (!resolved) {
      return { ok: false, reason: "no_session" };
    }
    try {
      return await this._applyResponse(
        resolved.model,
        argString("request_id"),
        argString("pending_id"),
        responseType,
        response
      );
    } finally {
      resolved.dispose();
    }
  }
  async _applyResponse(model, requestId, pendingId, responseType, response) {
    const request = model.getRequests().find((candidate) => candidate.id === requestId);
    const parts = request?.response?.response.value;
    if (!request || !parts) {
      return { ok: false, reason: "stale_pending" };
    }
    const index = parts.findIndex((candidate) => peekPendingId(request.id, candidate) === pendingId);
    if (index < 0) {
      return { ok: false, reason: "stale_pending" };
    }
    const part = parts[index];
    if (part.kind === "questionCarousel") {
      if (responseType !== "answer" && responseType !== "skip") {
        return { ok: false, reason: "unsupported" };
      }
      return this._answerCarousel(request.id, part, response, responseType === "skip");
    }
    if (responseType === "answer" || responseType === "skip") {
      return { ok: false, reason: "unsupported" };
    }
    const approve = responseType === "approve";
    if (part.kind === "planReview" && part instanceof ChatPlanReviewData) {
      return this._resolvePlanReview(part, approve) ? { ok: true } : { ok: false, reason: "stale_pending" };
    }
    if (part.kind === "toolInvocation") {
      if (getVoiceConfirmationType([part]) !== "tool") {
        return { ok: false, reason: "unsupported" };
      }
      const confirmed = IChatToolInvocation.confirmWith(
        part,
        approve ? { type: ToolConfirmKind.UserAction } : { type: ToolConfirmKind.Denied }
      );
      return confirmed ? { ok: true } : { ok: false, reason: "stale_pending" };
    }
    return { ok: false, reason: "unsupported" };
  }
  _resolvePlanReview(plan, approve) {
    if (plan.isUsed) {
      return false;
    }
    let result;
    if (approve) {
      const action = plan.actions.find((candidate) => candidate.default) ?? plan.actions[0];
      if (!action) {
        return false;
      }
      result = {
        action: action.label,
        actionId: action.id,
        rejected: false
      };
    } else {
      result = { rejected: true };
    }
    plan.data = result;
    plan.isUsed = true;
    void plan.completion.complete(result);
    return true;
  }
  /** Resolve a coding session id to its chat model, never falling back to the focused session. */
  async _resolveModelForResponse(codingSessionId) {
    if (!codingSessionId) {
      return void 0;
    }
    const agentSession = this.agentSessionsService.model.sessions.find((session) => !session.isArchived() && session.resource.toString() === codingSessionId);
    if (agentSession) {
      const loaded = this.chatService.getSession(agentSession.resource);
      if (loaded) {
        return { model: loaded, dispose: () => {
        } };
      }
    }
    for (const chatModel of this.chatService.chatModels.get()) {
      if (chatModel.sessionResource.toString() === codingSessionId) {
        return { model: chatModel, dispose: () => {
        } };
      }
    }
    if (!agentSession) {
      return void 0;
    }
    const cts = new CancellationTokenSource();
    const ref = await this.chatService.acquireOrLoadSession(agentSession.resource, ChatAgentLocation.Chat, cts.token, "voice-respond").catch(() => void 0);
    cts.dispose();
    if (!ref) {
      return void 0;
    }
    const model = this.chatService.getSession(agentSession.resource);
    if (!model) {
      ref.dispose();
      return void 0;
    }
    return { model, dispose: () => ref.dispose() };
  }
  /**
   * Fill in a question carousel exactly as the widget's own submit path does.
   *
   * A `skip` carries whatever the user answered before saying "skip", which on
   * an untouched form is nothing at all. That empty case is why skipping is its
   * own response type: an `answer` with zero answers is indistinguishable from
   * a backend that resolved nothing, and is correctly refused below.
   */
  _answerCarousel(requestId, carousel, response, skip) {
    if (carousel.isUsed || carousel.answeredExternally) {
      return { ok: false, reason: "stale_pending" };
    }
    if (skip && !carousel.allowSkip) {
      return { ok: false, reason: "stale_pending" };
    }
    const raw = response["answers"];
    if (raw !== void 0 && !Array.isArray(raw)) {
      return { ok: false, reason: "invalid_answer" };
    }
    const rawAnswers = raw ?? [];
    let answers;
    if (rawAnswers.length > 0) {
      answers = resolveQuestionAnswers(carousel.questions, rawAnswers);
      if (!answers) {
        return { ok: false, reason: "invalid_answer" };
      }
    } else if (!skip) {
      return { ok: false, reason: "invalid_answer" };
    }
    if (!skip && carousel.questions.some((question) => question.required && answers?.[question.id] === void 0)) {
      return { ok: false, reason: "invalid_answer" };
    }
    if (!(carousel instanceof ChatQuestionCarouselData) && !carousel.resolveId) {
      return { ok: false, reason: "unsupported" };
    }
    if (carousel instanceof ChatQuestionCarouselData) {
      carousel.dismiss(answers);
    } else {
      carousel.data = answers;
      carousel.isUsed = true;
    }
    if (carousel.resolveId) {
      this.chatService.notifyQuestionCarouselAnswer(requestId, carousel.resolveId, answers);
    }
    return { ok: true };
  }
  async _gatherSessionInfo() {
    const allSessions = this.agentSessionsService.model.sessions.filter((s) => !s.isArchived());
    const delegate = this._delegate;
    const currentResource = await delegate?.getCurrentSessionResource();
    const lastActivityOf = (s) => s.timing.lastRequestEnded ?? s.timing.lastRequestStarted ?? s.timing.created ?? 0;
    const dayKey = (ms) => {
      const d = new Date(ms);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };
    const todayKey = dayKey(Date.now());
    const withTiming = allSessions.map((s) => ({ s, t: lastActivityOf(s) })).filter((x) => x.t > 0);
    let filtered;
    const todays = withTiming.filter((x) => dayKey(x.t) === todayKey);
    if (todays.length > 0) {
      filtered = todays.map((x) => x.s);
    } else if (withTiming.length > 0) {
      const mostRecent = withTiming.reduce((a, b) => a.t >= b.t ? a : b);
      const mostRecentKey = dayKey(mostRecent.t);
      filtered = withTiming.filter((x) => dayKey(x.t) === mostRecentKey).map((x) => x.s);
    } else {
      filtered = [];
    }
    const sessionData = filtered.map((session) => {
      const model = this.chatService.getSession(session.resource);
      const changes = getAgentChangesSummary(session.changes);
      const lastReq = model?.getRequests().at(-1);
      const lastResponseSummary = lastReq?.response?.response.value.filter((p) => p.kind === "markdownContent").map((p) => p.content.value).join(" ").slice(0, 500) || "";
      const statusLabel = session.status === AgentSessionStatus.InProgress ? "working" : session.status === AgentSessionStatus.NeedsInput ? "waiting_for_input" : session.status === AgentSessionStatus.Completed ? "idle" : "unknown";
      const isActive = currentResource?.toString() === session.resource.toString();
      const lastActivity = lastActivityOf(session);
      const minutesAgo = lastActivity ? Math.round((Date.now() - lastActivity) / 6e4) : void 0;
      return {
        id: session.resource.toString(),
        state: statusLabel,
        is_active: isActive,
        insertions: changes?.insertions ?? 0,
        deletions: changes?.deletions ?? 0,
        last_activity_minutes_ago: minutesAgo,
        last_response_summary: lastResponseSummary
      };
    });
    return JSON.stringify({ sessions: sessionData });
  }
  /**
   * Resolve a coding_session_id (resource URI string) to an IAgentSession.
   * Falls back to the currently active session when id is missing/unknown.
   */
  async _resolveSession(coding_session_id) {
    const sessions = this.agentSessionsService.model.sessions.filter((s) => !s.isArchived());
    if (coding_session_id) {
      const match = sessions.find((s) => s.resource.toString() === coding_session_id);
      if (match) {
        return match;
      }
    }
    const currentResource = await this._delegate?.getCurrentSessionResource();
    if (currentResource) {
      const active = sessions.find((s) => s.resource.toString() === currentResource.toString());
      if (active) {
        return active;
      }
    }
    return sessions[0];
  }
  /**
   * Gather files touched + per-file insertions/deletions for a session.
   * Returns a JSON string keyed for the LLM follow-up to summarize.
   */
  async _gatherSessionChanges(coding_session_id) {
    const session = await this._resolveSession(coding_session_id);
    if (!session) {
      return JSON.stringify({ session_id: coding_session_id ?? null, files: [], note: "session_not_found" });
    }
    const changes = session.changes;
    const files = [];
    let totalInsertions = 0;
    let totalDeletions = 0;
    let totalFiles = 0;
    if (Array.isArray(changes)) {
      for (const c of changes) {
        const uri = c.modifiedUri ?? c.uri;
        const path = uri ? this._formatPath(uri) : "(unknown)";
        files.push({ path, insertions: c.insertions, deletions: c.deletions });
        totalInsertions += c.insertions;
        totalDeletions += c.deletions;
      }
      totalFiles = files.length;
    } else if (changes && !Array.isArray(changes)) {
      const summary = changes;
      totalInsertions = summary.insertions;
      totalDeletions = summary.deletions;
      totalFiles = summary.files;
    }
    return JSON.stringify({
      session_id: session.resource.toString(),
      total_files: totalFiles,
      total_insertions: totalInsertions,
      total_deletions: totalDeletions,
      files: files.slice(0, 20),
      // cap so LLM context stays bounded
      truncated: files.length > 20
    });
  }
  /**
   * Gather the last N user/assistant turns of a coding session — actual
   * conversation content, trimmed for spoken summarization.
   */
  async _gatherSessionThread(coding_session_id, lastN) {
    const session = await this._resolveSession(coding_session_id);
    if (!session) {
      return JSON.stringify({ session_id: coding_session_id ?? null, turns: [], note: "session_not_found" });
    }
    const model = this.chatService.getSession(session.resource);
    if (!model) {
      return JSON.stringify({
        session_id: session.resource.toString(),
        turns: [],
        note: "chat_model_not_loaded"
      });
    }
    const reqs = model.getRequests().slice(-lastN);
    const turns = reqs.map((req) => {
      const userText = req.message.text || "";
      const assistantText = req.response?.response.value.filter((p) => p.kind === "markdownContent").map((p) => p.content.value).join(" ").slice(0, 600) || "";
      return {
        user: userText.slice(0, 400),
        assistant: assistantText
      };
    });
    return JSON.stringify({
      session_id: session.resource.toString(),
      turn_count: turns.length,
      turns
    });
  }
  /** Render a URI as a short relative-ish path for spoken summaries. */
  _formatPath(uri) {
    const parts = uri.path.split("/").filter(Boolean);
    if (parts.length <= 2) {
      return uri.path.replace(/^\//, "");
    }
    return parts.slice(-2).join("/");
  }
};
VoiceToolDispatchService = __decorateClass([
  __decorateParam(0, IAgentSessionsService),
  __decorateParam(1, IChatService),
  __decorateParam(2, ILanguageModelToolsService)
], VoiceToolDispatchService);
registerSingleton(IVoiceToolDispatchService, VoiceToolDispatchService, InstantiationType.Delayed);
export {
  IVoiceToolDispatchService,
  VoiceToolDispatchService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25TdGF0dXMsIGdldEFnZW50Q2hhbmdlc1N1bW1hcnkgfSBmcm9tICcuLi9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFBsYW5SZXZpZXdSZXN1bHQsIElDaGF0UXVlc3Rpb25BbnN3ZXJzLCBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwsIElDaGF0U2VuZFJlcXVlc3RPcHRpb25zLCBJQ2hhdFNlcnZpY2UsIElDaGF0VG9vbEludm9jYXRpb24sIFRvb2xDb25maXJtS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQmFja2VuZFF1ZXN0aW9uQW5zd2VyLCByZXNvbHZlUXVlc3Rpb25BbnN3ZXJzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3ZvaWNlQ2xpZW50L3ZvaWNlUXVlc3Rpb25BbnN3ZXJzLmpzJztcbmltcG9ydCB7IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEuanMnO1xuaW1wb3J0IHsgQ2hhdFBsYW5SZXZpZXdEYXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRQbGFuUmV2aWV3RGF0YS5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWb2ljZURpc3BhdGNoUmVzdWx0LCBJVm9pY2VUb29sQ2FsbCwgcGVla1BlbmRpbmdJZCB9IGZyb20gJy4uLy4uL2NvbW1vbi92b2ljZUNsaWVudC92b2ljZUNsaWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Vm9pY2VDb25maXJtYXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3ZvaWNlQ2xpZW50L3ZvaWNlQ29uZmlybWF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcblxuLyoqXG4gKiBDYWxsYmFja3MgdGhhdCByZXF1aXJlIGFjY2VzcyB0byB0aGUgY2hhdCB3aWRnZXQgb3IgdmlldyBzdGF0ZS5cbiAqIEltcGxlbWVudGVkIGJ5IHRoZSBDaGF0Vmlld1BhbmUgdG8gYnJpZGdlIFVJIGNvbmNlcm5zLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElWb2ljZVRvb2xEaXNwYXRjaERlbGVnYXRlIHtcblx0LyoqIEFjY2VwdCBpbnB1dCB0ZXh0IGluIHRoZSBjdXJyZW50IGNoYXQgd2lkZ2V0LiBSZXR1cm5zIGZhbHNlIGlmIG5vIHdpZGdldCBhdmFpbGFibGUuICovXG5cdGFjY2VwdElucHV0KHRleHQ6IHN0cmluZyk6IGJvb2xlYW47XG5cdC8qKiBHZXQgdGhlIHJlc291cmNlIFVSSSBvZiB0aGUgY3VycmVudGx5IGFjdGl2ZSBzZXNzaW9uLiAqL1xuXHRnZXRDdXJyZW50U2Vzc2lvblJlc291cmNlKCk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPjtcblx0LyoqIFN3aXRjaCB0aGUgdmlldyB0byBhIGRpZmZlcmVudCBzZXNzaW9uIGJ5IHJlc291cmNlIFVSSS4gKi9cblx0c3dpdGNoVG9TZXNzaW9uKHJlc291cmNlOiBVUkkpOiB2b2lkO1xuXHQvKiogR2V0IHRoZSBzZXQgb2YgYXV0by1hcHByb3ZlZCBzZXNzaW9uIHJlc291cmNlIHN0cmluZ3MuICovXG5cdGdldEF1dG9BcHByb3ZlZFNlc3Npb25zKCk6IFNldDxzdHJpbmc+O1xuXHQvKiogTWFyayBhbGwgY3VycmVudCBzZXNzaW9ucyBhcyBhdXRvLWFwcHJvdmVkLiAqL1xuXHRhZGRBbGxBdXRvQXBwcm92ZWRTZXNzaW9ucygpOiB2b2lkO1xuXHQvKiogUmVtb3ZlIGEgc2Vzc2lvbiBmcm9tIGF1dG8tYXBwcm92ZWQgc2V0LiAqL1xuXHRyZW1vdmVBdXRvQXBwcm92ZWRTZXNzaW9uKHJlc291cmNlOiBzdHJpbmcpOiB2b2lkO1xuXHQvKiogVHJpZ2dlciBhbiBhdXRvLWFwcHJvdmUgY2hlY2sgY3ljbGUuICovXG5cdHRyaWdnZXJBdXRvQXBwcm92ZUNoZWNrKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZvaWNlVG9vbERpc3BhdGNoU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogU2V0IHRoZSBkZWxlZ2F0ZSB0aGF0IGJyaWRnZXMgd2lkZ2V0L1VJIGNvbmNlcm5zLlxuXHQgKiBNdXN0IGJlIGNhbGxlZCBiZWZvcmUgZGlzcGF0Y2hpbmcgdG9vbCBjYWxscy5cblx0ICovXG5cdHNldERlbGVnYXRlKGRlbGVnYXRlOiBJVm9pY2VUb29sRGlzcGF0Y2hEZWxlZ2F0ZSk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIERpc3BhdGNoIGEgdG9vbCBjYWxsIGFuZCByZXR1cm4gdGhlIHJlc3VsdCBzdHJpbmcuXG5cdCAqL1xuXHRkaXNwYXRjaFRvb2xDYWxsKHRvb2xDYWxsOiBJVm9pY2VUb29sQ2FsbCk6IFByb21pc2U8c3RyaW5nPjtcblxuXHQvKipcblx0ICogQXBwbHkgYSBiYWNrZW5kLXJlc29sdmVkIHJlc3BvbnNlIHRvIHdoYXRldmVyIGEgc2Vzc2lvbiBpcyB3YWl0aW5nIG9uLlxuXHQgKlxuXHQgKiBTZXBhcmF0ZSBmcm9tIGBkaXNwYXRjaFRvb2xDYWxsYCBiZWNhdXNlIGl0IGFuc3dlcnMgd2l0aCBhIHN0cnVjdHVyZWRcblx0ICogb3V0Y29tZSByYXRoZXIgdGhhbiBhIHN0cmluZzogdGhlIGJhY2tlbmQgb25seSBzcGVha3MgYW4gYWNrbm93bGVkZ2VtZW50XG5cdCAqIGZvciBzb21ldGhpbmcgaXQgaGFzIGFjdHVhbGx5IG9ic2VydmVkLCBzbyBcIml0IGxhbmRlZFwiIGFuZCBcIml0IGRpZG4ndFwiXG5cdCAqIGhhdmUgdG8gYmUgZGlzdGluZ3Vpc2hhYmxlLlxuXHQgKi9cblx0cmVzcG9uZFRvU2Vzc2lvbih0b29sQ2FsbDogSVZvaWNlVG9vbENhbGwpOiBQcm9taXNlPElWb2ljZURpc3BhdGNoUmVzdWx0Pjtcbn1cblxuZXhwb3J0IGNvbnN0IElWb2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SVZvaWNlVG9vbERpc3BhdGNoU2VydmljZT4oJ3ZvaWNlVG9vbERpc3BhdGNoU2VydmljZScpO1xuXG4vKiogQWN0aW9uIGxhYmVscyBkaXNwbGF5ZWQgaW4gdGhlIHN0YXR1cyBiYXIgZHVyaW5nIHRvb2wgZXhlY3V0aW9uLiAqL1xuY29uc3QgQUNUSU9OX0xBQkVMUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0c2VuZF90b19jaGF0OiBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UuYWN0aW9uLnNlbmRUb0NoYXQnLCBcIlNlbmRpbmcgdG8gY2hhdC4uLlwiKSxcblx0bmV3X3Nlc3Npb25zOiBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UuYWN0aW9uLm5ld1Nlc3Npb25zJywgXCJTdGFydGluZyBuZXcgc2Vzc2lvbnMuLi5cIiksXG5cdGdldF9zZXNzaW9uX2luZm86IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5hY3Rpb24uZ2V0U2Vzc2lvbkluZm8nLCBcIkNoZWNraW5nIHNlc3Npb25zLi4uXCIpLFxuXHRnZXRfc2Vzc2lvbl9jaGFuZ2VzOiBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UuYWN0aW9uLmdldFNlc3Npb25DaGFuZ2VzJywgXCJDaGVja2luZyBjaGFuZ2VzLi4uXCIpLFxuXHRnZXRfc2Vzc2lvbl90aHJlYWQ6IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5hY3Rpb24uZ2V0U2Vzc2lvblRocmVhZCcsIFwiQ2hlY2tpbmcgY29udmVyc2F0aW9uLi4uXCIpLFxuXHRyZXNwb25kX3RvX3Nlc3Npb246IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5hY3Rpb24ucmVzcG9uZCcsIFwiUmVzcG9uZGluZy4uLlwiKSxcblx0Zm9jdXNfc2Vzc2lvbjogbG9jYWxpemUoJ2FnZW50c1ZvaWNlLmFjdGlvbi5mb2N1c1Nlc3Npb24nLCBcIkZvY3VzaW5nIHNlc3Npb24uLi5cIiksXG5cdGF1dG9fYXBwcm92ZV9zZXNzaW9uOiBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UuYWN0aW9uLmF1dG9BcHByb3ZlJywgXCJBdXRvLWFwcHJvdmluZyBzZXNzaW9uLi4uXCIpLFxuXHRyZXZva2VfYXV0b19hcHByb3ZlOiBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UuYWN0aW9uLnJldm9rZUF1dG9BcHByb3ZlJywgXCJSZXZva2luZyBhdXRvLWFwcHJvdmUuLi5cIiksXG59O1xuXG5leHBvcnQgY2xhc3MgVm9pY2VUb29sRGlzcGF0Y2hTZXJ2aWNlIGltcGxlbWVudHMgSVZvaWNlVG9vbERpc3BhdGNoU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfZGVsZWdhdGU6IElWb2ljZVRvb2xEaXNwYXRjaERlbGVnYXRlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudFNlc3Npb25zU2VydmljZTogSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0c2V0RGVsZWdhdGUoZGVsZWdhdGU6IElWb2ljZVRvb2xEaXNwYXRjaERlbGVnYXRlKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVsZWdhdGUgPSBkZWxlZ2F0ZTtcblx0fVxuXG5cdC8qKiBHZXQgdGhlIGFjdGlvbiBsYWJlbCBmb3IgYSB0b29sIGNhbGwgbmFtZS4gKi9cblx0c3RhdGljIGdldEFjdGlvbkxhYmVsKG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEFDVElPTl9MQUJFTFNbbmFtZV0gPz8gbG9jYWxpemUoJ2FnZW50c1ZvaWNlLmFjdGlvbi53b3JraW5nJywgXCJXb3JraW5nLi4uXCIpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX2FnZW50TW9kZU9wdGlvbnMoKTogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMge1xuXHRcdGNvbnN0IGFsbFRvb2xzOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPiA9IHt9O1xuXHRcdGZvciAoY29uc3QgdG9vbCBvZiB0aGlzLnRvb2xzU2VydmljZS5nZXRUb29scyh1bmRlZmluZWQpKSB7XG5cdFx0XHRhbGxUb29sc1t0b29sLmlkXSA9IHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRtb2RlSW5mbzoge1xuXHRcdFx0XHRraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdGlzQnVpbHRpbjogdHJ1ZSxcblx0XHRcdFx0bW9kZUluc3RydWN0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0XHR0ZWxlbWV0cnlNb2RlSWQ6ICdhZ2VudCcsXG5cdFx0XHRcdGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0aW5zdHJ1Y3Rpb25Db250ZXh0OiB7XG5cdFx0XHRcdG1vZGVLaW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdGVuYWJsZWRUb29sczogYWxsVG9vbHMsXG5cdFx0XHR9LFxuXHRcdFx0dXNlclNlbGVjdGVkVG9vbHM6IGNvbnN0T2JzZXJ2YWJsZShhbGxUb29scyksXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGRpc3BhdGNoVG9vbENhbGwodG9vbENhbGw6IElWb2ljZVRvb2xDYWxsKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBkZWxlZ2F0ZSA9IHRoaXMuX2RlbGVnYXRlO1xuXHRcdGlmICghZGVsZWdhdGUpIHtcblx0XHRcdHJldHVybiAnZXJyb3I6IG5vIGRlbGVnYXRlIHNldCc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXJncyA9IHRvb2xDYWxsLmFyZ3M7XG5cdFx0Y29uc3QgYXJnU3RyaW5nID0gKGs6IHN0cmluZyk6IHN0cmluZyA9PiB7XG5cdFx0XHRjb25zdCB2ID0gYXJnc1trXTtcblx0XHRcdHJldHVybiB0eXBlb2YgdiA9PT0gJ3N0cmluZycgPyB2IDogJyc7XG5cdFx0fTtcblxuXHRcdHN3aXRjaCAodG9vbENhbGwubmFtZSkge1xuXHRcdFx0Y2FzZSAnc2VuZF90b19jaGF0Jzoge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gYXJnU3RyaW5nKCd0ZXh0Jyk7XG5cdFx0XHRcdGlmICh0ZXh0KSB7XG5cdFx0XHRcdFx0aWYgKCFkZWxlZ2F0ZS5hY2NlcHRJbnB1dCh0ZXh0KSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBhd2FpdCBkZWxlZ2F0ZS5nZXRDdXJyZW50U2Vzc2lvblJlc291cmNlKCk7XG5cdFx0XHRcdFx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5jaGF0U2VydmljZS5zZW5kUmVxdWVzdChyZXNvdXJjZSwgdGV4dCwgdGhpcy5fYWdlbnRNb2RlT3B0aW9ucyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZWYgPSB0aGlzLmNoYXRTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmNoYXRTZXJ2aWNlLnNlbmRSZXF1ZXN0KHJlZi5vYmplY3Quc2Vzc2lvblJlc291cmNlLCB0ZXh0LCB0aGlzLl9hZ2VudE1vZGVPcHRpb25zKTtcblx0XHRcdFx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICduZXdfc2Vzc2lvbnMnOiB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXJnc1snc2Vzc2lvbnMnXTtcblx0XHRcdFx0Y29uc3QgaXRlbXM6IHsgdGV4dD86IHN0cmluZyB9W10gPSBBcnJheS5pc0FycmF5KHNlc3Npb25zKSA/IHNlc3Npb25zIDogW3sgdGV4dDogYXJnU3RyaW5nKCd0ZXh0JykgfV07XG5cdFx0XHRcdGxldCBmaXJzdFJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0XHRcdGNvbnN0IHRleHQgPSBpdGVtLnRleHQ7XG5cdFx0XHRcdFx0aWYgKHRleHQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlZiA9IHRoaXMuY2hhdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0XHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IHJlZi5vYmplY3Quc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRcdFx0aWYgKCFmaXJzdFJlc291cmNlKSB7XG5cdFx0XHRcdFx0XHRcdGZpcnN0UmVzb3VyY2UgPSByZXNvdXJjZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuY2hhdFNlcnZpY2Uuc2VuZFJlcXVlc3QocmVzb3VyY2UsIHRleHQsIHRoaXMuX2FnZW50TW9kZU9wdGlvbnMpO1xuXHRcdFx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGZpcnN0UmVzb3VyY2UpIHtcblx0XHRcdFx0XHRkZWxlZ2F0ZS5zd2l0Y2hUb1Nlc3Npb24oZmlyc3RSZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdmb2N1c19zZXNzaW9uJzoge1xuXHRcdFx0XHRjb25zdCB0YXJnZXRTZXNzaW9uSWQgPSBhcmdTdHJpbmcoJ2NvZGluZ19zZXNzaW9uX2lkJyk7XG5cdFx0XHRcdGxldCB0YXJnZXRSZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAodGFyZ2V0U2Vzc2lvbklkKSB7XG5cdFx0XHRcdFx0Ly8gVHJ5IGFnZW50IHNlc3Npb25zIGZpcnN0XG5cdFx0XHRcdFx0Y29uc3QgYWdlbnRTZXNzaW9uID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9uc1xuXHRcdFx0XHRcdFx0LmZpbmQocyA9PiAhcy5pc0FyY2hpdmVkKCkgJiYgcy5yZXNvdXJjZS50b1N0cmluZygpID09PSB0YXJnZXRTZXNzaW9uSWQpO1xuXHRcdFx0XHRcdHRhcmdldFJlc291cmNlID0gYWdlbnRTZXNzaW9uPy5yZXNvdXJjZTtcblx0XHRcdFx0XHQvLyBGYWxsIGJhY2sgdG8gcmVndWxhciBjaGF0IHNlc3Npb25zXG5cdFx0XHRcdFx0aWYgKCF0YXJnZXRSZXNvdXJjZSkge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBjaGF0TW9kZWwgb2YgdGhpcy5jaGF0U2VydmljZS5jaGF0TW9kZWxzLmdldCgpKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChjaGF0TW9kZWwuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkgPT09IHRhcmdldFNlc3Npb25JZCkge1xuXHRcdFx0XHRcdFx0XHRcdHRhcmdldFJlc291cmNlID0gY2hhdE1vZGVsLnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGFyZ2V0UmVzb3VyY2UpIHtcblx0XHRcdFx0XHRjb25zdCBjdXJyZW50UmVzb3VyY2UgPSBhd2FpdCBkZWxlZ2F0ZS5nZXRDdXJyZW50U2Vzc2lvblJlc291cmNlKCk7XG5cdFx0XHRcdFx0aWYgKHRhcmdldFJlc291cmNlLnRvU3RyaW5nKCkgIT09IGN1cnJlbnRSZXNvdXJjZT8udG9TdHJpbmcoKSkge1xuXHRcdFx0XHRcdFx0ZGVsZWdhdGUuc3dpdGNoVG9TZXNzaW9uKHRhcmdldFJlc291cmNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdhdXRvX2FwcHJvdmVfc2Vzc2lvbic6IHtcblx0XHRcdFx0ZGVsZWdhdGUuYWRkQWxsQXV0b0FwcHJvdmVkU2Vzc2lvbnMoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdyZXZva2VfYXV0b19hcHByb3ZlJzoge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBhd2FpdCBkZWxlZ2F0ZS5nZXRDdXJyZW50U2Vzc2lvblJlc291cmNlKCk7XG5cdFx0XHRcdGlmIChzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRkZWxlZ2F0ZS5yZW1vdmVBdXRvQXBwcm92ZWRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2dldF9zZXNzaW9uX2luZm8nOiB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9nYXRoZXJTZXNzaW9uSW5mbygpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnZ2V0X3Nlc3Npb25fY2hhbmdlcyc6IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gdHlwZW9mIHRvb2xDYWxsLmFyZ3M/LmNvZGluZ19zZXNzaW9uX2lkID09PSAnc3RyaW5nJ1xuXHRcdFx0XHRcdD8gdG9vbENhbGwuYXJncy5jb2Rpbmdfc2Vzc2lvbl9pZFxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fZ2F0aGVyU2Vzc2lvbkNoYW5nZXMoc2Vzc2lvbklkKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2dldF9zZXNzaW9uX3RocmVhZCc6IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gdHlwZW9mIHRvb2xDYWxsLmFyZ3M/LmNvZGluZ19zZXNzaW9uX2lkID09PSAnc3RyaW5nJ1xuXHRcdFx0XHRcdD8gdG9vbENhbGwuYXJncy5jb2Rpbmdfc2Vzc2lvbl9pZFxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCByYXdOID0gdG9vbENhbGwuYXJncz8ubGFzdF9uX3R1cm5zO1xuXHRcdFx0XHRjb25zdCBsYXN0TiA9IHR5cGVvZiByYXdOID09PSAnbnVtYmVyJyAmJiByYXdOID4gMCA/IE1hdGgubWluKDEwLCBNYXRoLmZsb29yKHJhd04pKSA6IDM7XG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9nYXRoZXJTZXNzaW9uVGhyZWFkKHNlc3Npb25JZCwgbGFzdE4pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gJ29rJztcblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBseSBhIGJhY2tlbmQtcmVzb2x2ZWQgcmVzcG9uc2UgdG8gdGhlIGV4YWN0IHBlbmRpbmcgcGFydCBpdCBuYW1lcy5cblx0ICpcblx0ICogUm91dGluZyBpcyBieSBgcGVuZGluZ19pZGAgKyBgcmVxdWVzdF9pZGAgd2l0aCBubyBmYWxsYmFjazogdGhlIHBhdGggdGhpc1xuXHQgKiByZXBsYWNlcyBmZWxsIGJhY2sgdG8gdGhlIGZvY3VzZWQgc2Vzc2lvbiwgc28gYSBzcG9rZW4gXCJ5ZXNcIiBjb3VsZCBhcHByb3ZlXG5cdCAqIGEgcHJvbXB0IHRoZSB1c2VyIHdhcyBub3QgbG9va2luZyBhdC4gQSByZXNwb25zZSB0aGF0IGNhbm5vdCBmaW5kIGl0cyBwYXJ0XG5cdCAqIGlzIHJlcG9ydGVkIGFzIHN0YWxlIGluc3RlYWQuIEFuc3dlciB2YWx1ZXMgYXJlIG1hdGNoZWQgZXhhY3RseTsgc2VlXG5cdCAqIGByZXNvbHZlUXVlc3Rpb25BbnN3ZXJzYC5cblx0ICovXG5cdGFzeW5jIHJlc3BvbmRUb1Nlc3Npb24odG9vbENhbGw6IElWb2ljZVRvb2xDYWxsKTogUHJvbWlzZTxJVm9pY2VEaXNwYXRjaFJlc3VsdD4ge1xuXHRcdGNvbnN0IGFyZ3MgPSB0b29sQ2FsbC5hcmdzO1xuXHRcdGNvbnN0IGFyZ1N0cmluZyA9IChrZXk6IHN0cmluZyk6IHN0cmluZyA9PiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGFyZ3Nba2V5XTtcblx0XHRcdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUgOiAnJztcblx0XHR9O1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXJnc1sncmVzcG9uc2UnXTtcblx0XHRpZiAoIXJlc3BvbnNlIHx8IHR5cGVvZiByZXNwb25zZSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheShyZXNwb25zZSkpIHtcblx0XHRcdHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAndW5zdXBwb3J0ZWQnIH07XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3BvbnNlVHlwZSA9IChyZXNwb25zZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbJ3R5cGUnXTtcblx0XHRpZiAocmVzcG9uc2VUeXBlICE9PSAnYXBwcm92ZScgJiYgcmVzcG9uc2VUeXBlICE9PSAncmVqZWN0JyAmJiByZXNwb25zZVR5cGUgIT09ICdhbnN3ZXInICYmIHJlc3BvbnNlVHlwZSAhPT0gJ3NraXAnKSB7XG5cdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3Vuc3VwcG9ydGVkJyB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgdGhpcy5fcmVzb2x2ZU1vZGVsRm9yUmVzcG9uc2UoYXJnU3RyaW5nKCdjb2Rpbmdfc2Vzc2lvbl9pZCcpKTtcblx0XHRpZiAoIXJlc29sdmVkKSB7XG5cdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ25vX3Nlc3Npb24nIH07XG5cdFx0fVxuXHRcdC8vIEEgZnJlc2hseSBsb2FkZWQgc2Vzc2lvbiBob2xkcyBpdHMgb25seSByZWZlcmVuY2UgaGVyZSwgc28gZXZlcnl0aGluZ1xuXHRcdC8vIHRoYXQgcmVhZHMgdGhlIG1vZGVsLCBpbmNsdWRpbmcgdGhlIGF3YWl0ZWQgY29uZmlybWF0aW9uIHNlbmQsIGhhcyB0b1xuXHRcdC8vIGhhcHBlbiBiZWZvcmUgaXQgaXMgcmVsZWFzZWQuXG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9hcHBseVJlc3BvbnNlKFxuXHRcdFx0XHRyZXNvbHZlZC5tb2RlbCxcblx0XHRcdFx0YXJnU3RyaW5nKCdyZXF1ZXN0X2lkJyksXG5cdFx0XHRcdGFyZ1N0cmluZygncGVuZGluZ19pZCcpLFxuXHRcdFx0XHRyZXNwb25zZVR5cGUsXG5cdFx0XHRcdHJlc3BvbnNlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+LFxuXHRcdFx0KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVzb2x2ZWQuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FwcGx5UmVzcG9uc2UoXG5cdFx0bW9kZWw6IElDaGF0TW9kZWwsXG5cdFx0cmVxdWVzdElkOiBzdHJpbmcsXG5cdFx0cGVuZGluZ0lkOiBzdHJpbmcsXG5cdFx0cmVzcG9uc2VUeXBlOiAnYXBwcm92ZScgfCAncmVqZWN0JyB8ICdhbnN3ZXInIHwgJ3NraXAnLFxuXHRcdHJlc3BvbnNlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPixcblx0KTogUHJvbWlzZTxJVm9pY2VEaXNwYXRjaFJlc3VsdD4ge1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5nZXRSZXF1ZXN0cygpLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZCA9PT0gcmVxdWVzdElkKTtcblx0XHRjb25zdCBwYXJ0cyA9IHJlcXVlc3Q/LnJlc3BvbnNlPy5yZXNwb25zZS52YWx1ZTtcblx0XHRpZiAoIXJlcXVlc3QgfHwgIXBhcnRzKSB7XG5cdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3N0YWxlX3BlbmRpbmcnIH07XG5cdFx0fVxuXHRcdGNvbnN0IGluZGV4ID0gcGFydHMuZmluZEluZGV4KGNhbmRpZGF0ZSA9PiBwZWVrUGVuZGluZ0lkKHJlcXVlc3QuaWQsIGNhbmRpZGF0ZSkgPT09IHBlbmRpbmdJZCk7XG5cdFx0aWYgKGluZGV4IDwgMCkge1xuXHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdzdGFsZV9wZW5kaW5nJyB9O1xuXHRcdH1cblx0XHRjb25zdCBwYXJ0ID0gcGFydHNbaW5kZXhdO1xuXG5cdFx0aWYgKHBhcnQua2luZCA9PT0gJ3F1ZXN0aW9uQ2Fyb3VzZWwnKSB7XG5cdFx0XHRpZiAocmVzcG9uc2VUeXBlICE9PSAnYW5zd2VyJyAmJiByZXNwb25zZVR5cGUgIT09ICdza2lwJykge1xuXHRcdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3Vuc3VwcG9ydGVkJyB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX2Fuc3dlckNhcm91c2VsKHJlcXVlc3QuaWQsIHBhcnQgYXMgSUNoYXRRdWVzdGlvbkNhcm91c2VsLCByZXNwb25zZSwgcmVzcG9uc2VUeXBlID09PSAnc2tpcCcpO1xuXHRcdH1cblxuXHRcdGlmIChyZXNwb25zZVR5cGUgPT09ICdhbnN3ZXInIHx8IHJlc3BvbnNlVHlwZSA9PT0gJ3NraXAnKSB7XG5cdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3Vuc3VwcG9ydGVkJyB9O1xuXHRcdH1cblx0XHRjb25zdCBhcHByb3ZlID0gcmVzcG9uc2VUeXBlID09PSAnYXBwcm92ZSc7XG5cblx0XHRpZiAocGFydC5raW5kID09PSAncGxhblJldmlldycgJiYgcGFydCBpbnN0YW5jZW9mIENoYXRQbGFuUmV2aWV3RGF0YSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVQbGFuUmV2aWV3KHBhcnQsIGFwcHJvdmUpID8geyBvazogdHJ1ZSB9IDogeyBvazogZmFsc2UsIHJlYXNvbjogJ3N0YWxlX3BlbmRpbmcnIH07XG5cdFx0fVxuXG5cdFx0aWYgKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0aWYgKGdldFZvaWNlQ29uZmlybWF0aW9uVHlwZShbcGFydF0pICE9PSAndG9vbCcpIHtcblx0XHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICd1bnN1cHBvcnRlZCcgfTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbmZpcm1lZCA9IElDaGF0VG9vbEludm9jYXRpb24uY29uZmlybVdpdGgoXG5cdFx0XHRcdHBhcnQgYXMgSUNoYXRUb29sSW52b2NhdGlvbixcblx0XHRcdFx0YXBwcm92ZSA/IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSA6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkRlbmllZCB9LFxuXHRcdFx0KTtcblx0XHRcdHJldHVybiBjb25maXJtZWQgPyB7IG9rOiB0cnVlIH0gOiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc3RhbGVfcGVuZGluZycgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3Vuc3VwcG9ydGVkJyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZVBsYW5SZXZpZXcocGxhbjogQ2hhdFBsYW5SZXZpZXdEYXRhLCBhcHByb3ZlOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0aWYgKHBsYW4uaXNVc2VkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGxldCByZXN1bHQ6IElDaGF0UGxhblJldmlld1Jlc3VsdDtcblx0XHRpZiAoYXBwcm92ZSkge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gcGxhbi5hY3Rpb25zLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5kZWZhdWx0KSA/PyBwbGFuLmFjdGlvbnNbMF07XG5cdFx0XHRpZiAoIWFjdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQgPSB7XG5cdFx0XHRcdGFjdGlvbjogYWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRhY3Rpb25JZDogYWN0aW9uLmlkLFxuXHRcdFx0XHRyZWplY3RlZDogZmFsc2UsXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXN1bHQgPSB7IHJlamVjdGVkOiB0cnVlIH07XG5cdFx0fVxuXHRcdHBsYW4uZGF0YSA9IHJlc3VsdDtcblx0XHRwbGFuLmlzVXNlZCA9IHRydWU7XG5cdFx0dm9pZCBwbGFuLmNvbXBsZXRpb24uY29tcGxldGUocmVzdWx0KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKiBSZXNvbHZlIGEgY29kaW5nIHNlc3Npb24gaWQgdG8gaXRzIGNoYXQgbW9kZWwsIG5ldmVyIGZhbGxpbmcgYmFjayB0byB0aGUgZm9jdXNlZCBzZXNzaW9uLiAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlTW9kZWxGb3JSZXNwb25zZShjb2RpbmdTZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8eyBtb2RlbDogSUNoYXRNb2RlbDsgZGlzcG9zZSgpOiB2b2lkIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIWNvZGluZ1Nlc3Npb25JZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9uc1xuXHRcdFx0LmZpbmQoc2Vzc2lvbiA9PiAhc2Vzc2lvbi5pc0FyY2hpdmVkKCkgJiYgc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpID09PSBjb2RpbmdTZXNzaW9uSWQpO1xuXHRcdGlmIChhZ2VudFNlc3Npb24pIHtcblx0XHRcdGNvbnN0IGxvYWRlZCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihhZ2VudFNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0aWYgKGxvYWRlZCkge1xuXHRcdFx0XHRyZXR1cm4geyBtb2RlbDogbG9hZGVkLCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjaGF0TW9kZWwgb2YgdGhpcy5jaGF0U2VydmljZS5jaGF0TW9kZWxzLmdldCgpKSB7XG5cdFx0XHRpZiAoY2hhdE1vZGVsLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpID09PSBjb2RpbmdTZXNzaW9uSWQpIHtcblx0XHRcdFx0cmV0dXJuIHsgbW9kZWw6IGNoYXRNb2RlbCwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghYWdlbnRTZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLmNoYXRTZXJ2aWNlXG5cdFx0XHQuYWNxdWlyZU9yTG9hZFNlc3Npb24oYWdlbnRTZXNzaW9uLnJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjdHMudG9rZW4sICd2b2ljZS1yZXNwb25kJylcblx0XHRcdC5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0aWYgKCFyZWYpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKGFnZW50U2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIFRoaXMgcmVmZXJlbmNlIGlzIHRoZSBvbmx5IHRoaW5nIGtlZXBpbmcgdGhlIGp1c3QtbG9hZGVkIHNlc3Npb24gYWxpdmU7XG5cdFx0Ly8gcmVsZWFzaW5nIGl0IGhlcmUgd291bGQgbGV0IHRoZSBtb2RlbCBiZSBkaXNwb3NlZCBvdXQgZnJvbSB1bmRlciB0aGVcblx0XHQvLyBjYWxsZXIsIHBvdGVudGlhbGx5IG1pZC1gc2VuZFJlcXVlc3RgLlxuXHRcdHJldHVybiB7IG1vZGVsLCBkaXNwb3NlOiAoKSA9PiByZWYuZGlzcG9zZSgpIH07XG5cdH1cblxuXHQvKipcblx0ICogRmlsbCBpbiBhIHF1ZXN0aW9uIGNhcm91c2VsIGV4YWN0bHkgYXMgdGhlIHdpZGdldCdzIG93biBzdWJtaXQgcGF0aCBkb2VzLlxuXHQgKlxuXHQgKiBBIGBza2lwYCBjYXJyaWVzIHdoYXRldmVyIHRoZSB1c2VyIGFuc3dlcmVkIGJlZm9yZSBzYXlpbmcgXCJza2lwXCIsIHdoaWNoIG9uXG5cdCAqIGFuIHVudG91Y2hlZCBmb3JtIGlzIG5vdGhpbmcgYXQgYWxsLiBUaGF0IGVtcHR5IGNhc2UgaXMgd2h5IHNraXBwaW5nIGlzIGl0c1xuXHQgKiBvd24gcmVzcG9uc2UgdHlwZTogYW4gYGFuc3dlcmAgd2l0aCB6ZXJvIGFuc3dlcnMgaXMgaW5kaXN0aW5ndWlzaGFibGUgZnJvbVxuXHQgKiBhIGJhY2tlbmQgdGhhdCByZXNvbHZlZCBub3RoaW5nLCBhbmQgaXMgY29ycmVjdGx5IHJlZnVzZWQgYmVsb3cuXG5cdCAqL1xuXHRwcml2YXRlIF9hbnN3ZXJDYXJvdXNlbChcblx0XHRyZXF1ZXN0SWQ6IHN0cmluZyxcblx0XHRjYXJvdXNlbDogSUNoYXRRdWVzdGlvbkNhcm91c2VsLFxuXHRcdHJlc3BvbnNlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPixcblx0XHRza2lwOiBib29sZWFuLFxuXHQpOiBJVm9pY2VEaXNwYXRjaFJlc3VsdCB7XG5cdFx0aWYgKGNhcm91c2VsLmlzVXNlZCB8fCBjYXJvdXNlbC5hbnN3ZXJlZEV4dGVybmFsbHkpIHtcblx0XHRcdHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnc3RhbGVfcGVuZGluZycgfTtcblx0XHR9XG5cdFx0aWYgKHNraXAgJiYgIWNhcm91c2VsLmFsbG93U2tpcCkge1xuXHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdzdGFsZV9wZW5kaW5nJyB9O1xuXHRcdH1cblx0XHRjb25zdCByYXcgPSByZXNwb25zZVsnYW5zd2VycyddO1xuXHRcdC8vIE9ubHkgYW4gYWJzZW50IGBhbnN3ZXJzYCBtZWFucyBcIm5vbmVcIi4gQSBwcmVzZW50IG5vbi1hcnJheSBpcyBhXG5cdFx0Ly8gbWFsZm9ybWVkIGNhbGwsIGFuZCBjb2VyY2luZyBpdCB0byBlbXB0eSB3b3VsZCBsZXQgYSBza2lwIHN1Y2NlZWQgd2hpbGVcblx0XHQvLyBkaXNjYXJkaW5nIHdoYXRldmVyIHdhcyBhY3R1YWxseSBtZWFudC5cblx0XHRpZiAocmF3ICE9PSB1bmRlZmluZWQgJiYgIUFycmF5LmlzQXJyYXkocmF3KSkge1xuXHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdpbnZhbGlkX2Fuc3dlcicgfTtcblx0XHR9XG5cdFx0Y29uc3QgcmF3QW5zd2VycyA9IChyYXcgPz8gW10pIGFzIElCYWNrZW5kUXVlc3Rpb25BbnN3ZXJbXTtcblx0XHRsZXQgYW5zd2VyczogSUNoYXRRdWVzdGlvbkFuc3dlcnMgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHJhd0Fuc3dlcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0YW5zd2VycyA9IHJlc29sdmVRdWVzdGlvbkFuc3dlcnMoY2Fyb3VzZWwucXVlc3Rpb25zLCByYXdBbnN3ZXJzKTtcblx0XHRcdGlmICghYW5zd2Vycykge1xuXHRcdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ2ludmFsaWRfYW5zd2VyJyB9O1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoIXNraXApIHtcblx0XHRcdHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiAnaW52YWxpZF9hbnN3ZXInIH07XG5cdFx0fVxuXHRcdC8vIFRoZSB3aWRnZXQgcmVmdXNlcyB0byBzdWJtaXQgd2hpbGUgYSByZXF1aXJlZCBxdWVzdGlvbiBpcyBibGFuaywgc28gYVxuXHRcdC8vIHNwb2tlbiBhbnN3ZXIgbXVzdCBub3QgYmUgYWJsZSB0byBzdWJtaXQgd2hhdCBhIGNsaWNrIGNhbm5vdC4gQWJzZW5jZSBpc1xuXHRcdC8vIHRoZSBvbmx5IGJsYW5rIHBvc3NpYmxlOiBgcmVzb2x2ZVF1ZXN0aW9uQW5zd2Vyc2AgcmVqZWN0cyByYXRoZXIgdGhhblxuXHRcdC8vIGVtaXR0aW5nIGFuIGVtcHR5IHZhbHVlLiBUaGUgYmFja2VuZCBvbmx5IGRpc3BhdGNoZXMgYSBmdWxseSBhbnN3ZXJlZFxuXHRcdC8vIGZvcm0sIHNvIHRoaXMgaXMgYSBiYWNrc3RvcC5cblx0XHRpZiAoIXNraXAgJiYgY2Fyb3VzZWwucXVlc3Rpb25zLnNvbWUocXVlc3Rpb24gPT4gcXVlc3Rpb24ucmVxdWlyZWQgJiYgYW5zd2Vycz8uW3F1ZXN0aW9uLmlkXSA9PT0gdW5kZWZpbmVkKSkge1xuXHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246ICdpbnZhbGlkX2Fuc3dlcicgfTtcblx0XHR9XG5cdFx0Ly8gQ2hlY2tlZCBiZWZvcmUgbXV0YXRpbmc6IGEgZm9ybSB3aXRoIG5laXRoZXIgYSBkZWZlcnJlZCBjb21wbGV0aW9uIG5vclxuXHRcdC8vIGFuIGlkIHRvIG5vdGlmeSBjYW5ub3QgYmUgcmVzb2x2ZWQsIGFuZCBtYXJraW5nIGl0IHVzZWQgd291bGQgbGVhdmUgaXRcblx0XHQvLyBhbnN3ZXJlZCBvbiBzY3JlZW4gd2hpbGUgdGhlIGFzc2lzdGFudCByZXBvcnRzIHRoYXQgaXQgZGlkIG5vdCBsYW5kLlxuXHRcdGlmICghKGNhcm91c2VsIGluc3RhbmNlb2YgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhKSAmJiAhY2Fyb3VzZWwucmVzb2x2ZUlkKSB7XG5cdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogJ3Vuc3VwcG9ydGVkJyB9O1xuXHRcdH1cblx0XHQvLyBgZGlzbWlzc2AgYWxzbyBjb21wbGV0ZXMgdGhlIGRlZmVycmVkIHByb21pc2UgYW4gYWdlbnQtaG9zdGVkIGNhcm91c2VsXG5cdFx0Ly8gaXMgYmxvY2tlZCBvbjsgbWFya2luZyBpdCB1c2VkIHdpdGhvdXQgdGhhdCBsZWF2ZXMgdGhlIGFnZW50IHdhaXRpbmcuXG5cdFx0aWYgKGNhcm91c2VsIGluc3RhbmNlb2YgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhKSB7XG5cdFx0XHRjYXJvdXNlbC5kaXNtaXNzKGFuc3dlcnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjYXJvdXNlbC5kYXRhID0gYW5zd2Vycztcblx0XHRcdGNhcm91c2VsLmlzVXNlZCA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChjYXJvdXNlbC5yZXNvbHZlSWQpIHtcblx0XHRcdHRoaXMuY2hhdFNlcnZpY2Uubm90aWZ5UXVlc3Rpb25DYXJvdXNlbEFuc3dlcihyZXF1ZXN0SWQsIGNhcm91c2VsLnJlc29sdmVJZCwgYW5zd2Vycyk7XG5cdFx0fVxuXHRcdHJldHVybiB7IG9rOiB0cnVlIH07XG5cdH1cblxuXG5cdHByaXZhdGUgYXN5bmMgX2dhdGhlclNlc3Npb25JbmZvKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgYWxsU2Vzc2lvbnMgPSB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnNlc3Npb25zLmZpbHRlcihzID0+ICFzLmlzQXJjaGl2ZWQoKSk7XG5cdFx0Y29uc3QgZGVsZWdhdGUgPSB0aGlzLl9kZWxlZ2F0ZTtcblx0XHRjb25zdCBjdXJyZW50UmVzb3VyY2UgPSBhd2FpdCBkZWxlZ2F0ZT8uZ2V0Q3VycmVudFNlc3Npb25SZXNvdXJjZSgpO1xuXG5cdFx0Ly8gUGVyLXNlc3Npb24gbGFzdEFjdGl2aXR5IChtcyBlcG9jaCkuIDAgbWVhbnMgXCJubyB0aW1pbmcgaW5mb1wiIFx1MjAxNCB0cmVhdCBhcyBvbGRlc3QuXG5cdFx0Y29uc3QgbGFzdEFjdGl2aXR5T2YgPSAoczogdHlwZW9mIGFsbFNlc3Npb25zW251bWJlcl0pOiBudW1iZXIgPT5cblx0XHRcdHMudGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQgPz8gcy50aW1pbmcubGFzdFJlcXVlc3RTdGFydGVkID8/IHMudGltaW5nLmNyZWF0ZWQgPz8gMDtcblxuXHRcdC8vIENhbGVuZGFyLWRheSBrZXkgKGxvY2FsIHRpbWUpIGZvciBhbiBlcG9jaCBtcyB0aW1lc3RhbXAuXG5cdFx0Y29uc3QgZGF5S2V5ID0gKG1zOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuXHRcdFx0Y29uc3QgZCA9IG5ldyBEYXRlKG1zKTtcblx0XHRcdHJldHVybiBgJHtkLmdldEZ1bGxZZWFyKCl9LSR7ZC5nZXRNb250aCgpfS0ke2QuZ2V0RGF0ZSgpfWA7XG5cdFx0fTtcblxuXHRcdC8vIEZpbHRlciB0byBcImFjdGl2ZSB0b2RheSwgb3IgaWYgbm9uZSB0b2RheSwgdGhlIG1vc3QtcmVjZW50IGFjdGl2ZSBkYXlcIi5cblx0XHRjb25zdCB0b2RheUtleSA9IGRheUtleShEYXRlLm5vdygpKTtcblx0XHRjb25zdCB3aXRoVGltaW5nID0gYWxsU2Vzc2lvbnNcblx0XHRcdC5tYXAocyA9PiAoeyBzLCB0OiBsYXN0QWN0aXZpdHlPZihzKSB9KSlcblx0XHRcdC5maWx0ZXIoeCA9PiB4LnQgPiAwKTsgLy8gZHJvcCBzZXNzaW9ucyB3aXRoIG5vIGFjdGl2aXR5IHRpbWVzdGFtcCBhdCBhbGxcblxuXHRcdGxldCBmaWx0ZXJlZDogdHlwZW9mIGFsbFNlc3Npb25zO1xuXHRcdGNvbnN0IHRvZGF5cyA9IHdpdGhUaW1pbmcuZmlsdGVyKHggPT4gZGF5S2V5KHgudCkgPT09IHRvZGF5S2V5KTtcblx0XHRpZiAodG9kYXlzLmxlbmd0aCA+IDApIHtcblx0XHRcdGZpbHRlcmVkID0gdG9kYXlzLm1hcCh4ID0+IHgucyk7XG5cdFx0fSBlbHNlIGlmICh3aXRoVGltaW5nLmxlbmd0aCA+IDApIHtcblx0XHRcdC8vIEZhbGwgYmFjayB0byB0aGUgbW9zdCByZWNlbnQgYWN0aXZlIGRheS5cblx0XHRcdGNvbnN0IG1vc3RSZWNlbnQgPSB3aXRoVGltaW5nLnJlZHVjZSgoYSwgYikgPT4gKGEudCA+PSBiLnQgPyBhIDogYikpO1xuXHRcdFx0Y29uc3QgbW9zdFJlY2VudEtleSA9IGRheUtleShtb3N0UmVjZW50LnQpO1xuXHRcdFx0ZmlsdGVyZWQgPSB3aXRoVGltaW5nLmZpbHRlcih4ID0+IGRheUtleSh4LnQpID09PSBtb3N0UmVjZW50S2V5KS5tYXAoeCA9PiB4LnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmaWx0ZXJlZCA9IFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25EYXRhID0gZmlsdGVyZWQubWFwKHNlc3Npb24gPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBjaGFuZ2VzID0gZ2V0QWdlbnRDaGFuZ2VzU3VtbWFyeShzZXNzaW9uLmNoYW5nZXMpO1xuXHRcdFx0Y29uc3QgbGFzdFJlcSA9IG1vZGVsPy5nZXRSZXF1ZXN0cygpLmF0KC0xKTtcblx0XHRcdGNvbnN0IGxhc3RSZXNwb25zZVN1bW1hcnkgPSBsYXN0UmVxPy5yZXNwb25zZT8ucmVzcG9uc2UudmFsdWVcblx0XHRcdFx0LmZpbHRlcihwID0+IHAua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcpXG5cdFx0XHRcdC5tYXAocCA9PiAocCBhcyB7IGNvbnRlbnQ6IHsgdmFsdWU6IHN0cmluZyB9IH0pLmNvbnRlbnQudmFsdWUpXG5cdFx0XHRcdC5qb2luKCcgJylcblx0XHRcdFx0LnNsaWNlKDAsIDUwMCkgfHwgJyc7XG5cblx0XHRcdGNvbnN0IHN0YXR1c0xhYmVsID1cblx0XHRcdFx0c2Vzc2lvbi5zdGF0dXMgPT09IEFnZW50U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzID8gJ3dvcmtpbmcnXG5cdFx0XHRcdFx0OiBzZXNzaW9uLnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQgPyAnd2FpdGluZ19mb3JfaW5wdXQnXG5cdFx0XHRcdFx0XHQ6IHNlc3Npb24uc3RhdHVzID09PSBBZ2VudFNlc3Npb25TdGF0dXMuQ29tcGxldGVkID8gJ2lkbGUnXG5cdFx0XHRcdFx0XHRcdDogJ3Vua25vd24nO1xuXG5cdFx0XHRjb25zdCBpc0FjdGl2ZSA9IGN1cnJlbnRSZXNvdXJjZT8udG9TdHJpbmcoKSA9PT0gc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgbGFzdEFjdGl2aXR5ID0gbGFzdEFjdGl2aXR5T2Yoc2Vzc2lvbik7XG5cdFx0XHRjb25zdCBtaW51dGVzQWdvID0gbGFzdEFjdGl2aXR5ID8gTWF0aC5yb3VuZCgoRGF0ZS5ub3coKSAtIGxhc3RBY3Rpdml0eSkgLyA2MDAwMCkgOiB1bmRlZmluZWQ7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdHN0YXRlOiBzdGF0dXNMYWJlbCxcblx0XHRcdFx0aXNfYWN0aXZlOiBpc0FjdGl2ZSxcblx0XHRcdFx0aW5zZXJ0aW9uczogY2hhbmdlcz8uaW5zZXJ0aW9ucyA/PyAwLFxuXHRcdFx0XHRkZWxldGlvbnM6IGNoYW5nZXM/LmRlbGV0aW9ucyA/PyAwLFxuXHRcdFx0XHRsYXN0X2FjdGl2aXR5X21pbnV0ZXNfYWdvOiBtaW51dGVzQWdvLFxuXHRcdFx0XHRsYXN0X3Jlc3BvbnNlX3N1bW1hcnk6IGxhc3RSZXNwb25zZVN1bW1hcnksXG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHsgc2Vzc2lvbnM6IHNlc3Npb25EYXRhIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgYSBjb2Rpbmdfc2Vzc2lvbl9pZCAocmVzb3VyY2UgVVJJIHN0cmluZykgdG8gYW4gSUFnZW50U2Vzc2lvbi5cblx0ICogRmFsbHMgYmFjayB0byB0aGUgY3VycmVudGx5IGFjdGl2ZSBzZXNzaW9uIHdoZW4gaWQgaXMgbWlzc2luZy91bmtub3duLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVNlc3Npb24oY29kaW5nX3Nlc3Npb25faWQ6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IHNlc3Npb25zID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9ucy5maWx0ZXIocyA9PiAhcy5pc0FyY2hpdmVkKCkpO1xuXHRcdGlmIChjb2Rpbmdfc2Vzc2lvbl9pZCkge1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSBzZXNzaW9ucy5maW5kKHMgPT4gcy5yZXNvdXJjZS50b1N0cmluZygpID09PSBjb2Rpbmdfc2Vzc2lvbl9pZCk7XG5cdFx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdFx0cmV0dXJuIG1hdGNoO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBjdXJyZW50UmVzb3VyY2UgPSBhd2FpdCB0aGlzLl9kZWxlZ2F0ZT8uZ2V0Q3VycmVudFNlc3Npb25SZXNvdXJjZSgpO1xuXHRcdGlmIChjdXJyZW50UmVzb3VyY2UpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZSA9IHNlc3Npb25zLmZpbmQocyA9PiBzLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IGN1cnJlbnRSZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGlmIChhY3RpdmUpIHtcblx0XHRcdFx0cmV0dXJuIGFjdGl2ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHNlc3Npb25zWzBdO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdhdGhlciBmaWxlcyB0b3VjaGVkICsgcGVyLWZpbGUgaW5zZXJ0aW9ucy9kZWxldGlvbnMgZm9yIGEgc2Vzc2lvbi5cblx0ICogUmV0dXJucyBhIEpTT04gc3RyaW5nIGtleWVkIGZvciB0aGUgTExNIGZvbGxvdy11cCB0byBzdW1tYXJpemUuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9nYXRoZXJTZXNzaW9uQ2hhbmdlcyhjb2Rpbmdfc2Vzc2lvbl9pZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVNlc3Npb24oY29kaW5nX3Nlc3Npb25faWQpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHsgc2Vzc2lvbl9pZDogY29kaW5nX3Nlc3Npb25faWQgPz8gbnVsbCwgZmlsZXM6IFtdLCBub3RlOiAnc2Vzc2lvbl9ub3RfZm91bmQnIH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYW5nZXMgPSBzZXNzaW9uLmNoYW5nZXM7XG5cdFx0Y29uc3QgZmlsZXM6IHsgcGF0aDogc3RyaW5nOyBpbnNlcnRpb25zOiBudW1iZXI7IGRlbGV0aW9uczogbnVtYmVyIH1bXSA9IFtdO1xuXHRcdGxldCB0b3RhbEluc2VydGlvbnMgPSAwO1xuXHRcdGxldCB0b3RhbERlbGV0aW9ucyA9IDA7XG5cdFx0bGV0IHRvdGFsRmlsZXMgPSAwO1xuXG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoY2hhbmdlcykpIHtcblx0XHRcdGZvciAoY29uc3QgYyBvZiBjaGFuZ2VzKSB7XG5cdFx0XHRcdC8vIEJvdGggSUNoYXRTZXNzaW9uRmlsZUNoYW5nZSBhbmQgSUNoYXRTZXNzaW9uRmlsZUNoYW5nZTIgY2FycnkgYSBVUkk7XG5cdFx0XHRcdC8vIHByZWZlciBtb2RpZmllZFVyaSAobW9zdCBhY2N1cmF0ZSBwb3N0LWVkaXQpLCBmYWxsIGJhY2sgdG8gdXJpLlxuXHRcdFx0XHRjb25zdCB1cmkgPSAoYyBhcyB7IG1vZGlmaWVkVXJpPzogVVJJIH0pLm1vZGlmaWVkVXJpID8/IChjIGFzIHsgdXJpPzogVVJJIH0pLnVyaTtcblx0XHRcdFx0Y29uc3QgcGF0aCA9IHVyaSA/IHRoaXMuX2Zvcm1hdFBhdGgodXJpKSA6ICcodW5rbm93biknO1xuXHRcdFx0XHRmaWxlcy5wdXNoKHsgcGF0aCwgaW5zZXJ0aW9uczogYy5pbnNlcnRpb25zLCBkZWxldGlvbnM6IGMuZGVsZXRpb25zIH0pO1xuXHRcdFx0XHR0b3RhbEluc2VydGlvbnMgKz0gYy5pbnNlcnRpb25zO1xuXHRcdFx0XHR0b3RhbERlbGV0aW9ucyArPSBjLmRlbGV0aW9ucztcblx0XHRcdH1cblx0XHRcdHRvdGFsRmlsZXMgPSBmaWxlcy5sZW5ndGg7XG5cdFx0fSBlbHNlIGlmIChjaGFuZ2VzICYmICFBcnJheS5pc0FycmF5KGNoYW5nZXMpKSB7XG5cdFx0XHQvLyBBbHJlYWR5IGluIHN1bW1hcnkgZm9ybSBcdTIwMTQgd2UgZG9uJ3QgaGF2ZSBwZXItZmlsZSBkYXRhLlxuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IGNoYW5nZXMgYXMgeyBmaWxlczogbnVtYmVyOyBpbnNlcnRpb25zOiBudW1iZXI7IGRlbGV0aW9uczogbnVtYmVyIH07XG5cdFx0XHR0b3RhbEluc2VydGlvbnMgPSBzdW1tYXJ5Lmluc2VydGlvbnM7XG5cdFx0XHR0b3RhbERlbGV0aW9ucyA9IHN1bW1hcnkuZGVsZXRpb25zO1xuXHRcdFx0dG90YWxGaWxlcyA9IHN1bW1hcnkuZmlsZXM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdHNlc3Npb25faWQ6IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdHRvdGFsX2ZpbGVzOiB0b3RhbEZpbGVzLFxuXHRcdFx0dG90YWxfaW5zZXJ0aW9uczogdG90YWxJbnNlcnRpb25zLFxuXHRcdFx0dG90YWxfZGVsZXRpb25zOiB0b3RhbERlbGV0aW9ucyxcblx0XHRcdGZpbGVzOiBmaWxlcy5zbGljZSgwLCAyMCksIC8vIGNhcCBzbyBMTE0gY29udGV4dCBzdGF5cyBib3VuZGVkXG5cdFx0XHR0cnVuY2F0ZWQ6IGZpbGVzLmxlbmd0aCA+IDIwLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdhdGhlciB0aGUgbGFzdCBOIHVzZXIvYXNzaXN0YW50IHR1cm5zIG9mIGEgY29kaW5nIHNlc3Npb24gXHUyMDE0IGFjdHVhbFxuXHQgKiBjb252ZXJzYXRpb24gY29udGVudCwgdHJpbW1lZCBmb3Igc3Bva2VuIHN1bW1hcml6YXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9nYXRoZXJTZXNzaW9uVGhyZWFkKGNvZGluZ19zZXNzaW9uX2lkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGxhc3ROOiBudW1iZXIpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLl9yZXNvbHZlU2Vzc2lvbihjb2Rpbmdfc2Vzc2lvbl9pZCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoeyBzZXNzaW9uX2lkOiBjb2Rpbmdfc2Vzc2lvbl9pZCA/PyBudWxsLCB0dXJuczogW10sIG5vdGU6ICdzZXNzaW9uX25vdF9mb3VuZCcgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0c2Vzc2lvbl9pZDogc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHR0dXJuczogW10sXG5cdFx0XHRcdG5vdGU6ICdjaGF0X21vZGVsX25vdF9sb2FkZWQnLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVxcyA9IG1vZGVsLmdldFJlcXVlc3RzKCkuc2xpY2UoLWxhc3ROKTtcblx0XHRjb25zdCB0dXJucyA9IHJlcXMubWFwKHJlcSA9PiB7XG5cdFx0XHRjb25zdCB1c2VyVGV4dCA9IHJlcS5tZXNzYWdlLnRleHQgfHwgJyc7XG5cdFx0XHRjb25zdCBhc3Npc3RhbnRUZXh0ID0gcmVxLnJlc3BvbnNlPy5yZXNwb25zZS52YWx1ZVxuXHRcdFx0XHQuZmlsdGVyKHAgPT4gcC5raW5kID09PSAnbWFya2Rvd25Db250ZW50Jylcblx0XHRcdFx0Lm1hcChwID0+IChwIGFzIHsgY29udGVudDogeyB2YWx1ZTogc3RyaW5nIH0gfSkuY29udGVudC52YWx1ZSlcblx0XHRcdFx0LmpvaW4oJyAnKVxuXHRcdFx0XHQuc2xpY2UoMCwgNjAwKSB8fCAnJztcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHVzZXI6IHVzZXJUZXh0LnNsaWNlKDAsIDQwMCksXG5cdFx0XHRcdGFzc2lzdGFudDogYXNzaXN0YW50VGV4dCxcblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0c2Vzc2lvbl9pZDogc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0dHVybl9jb3VudDogdHVybnMubGVuZ3RoLFxuXHRcdFx0dHVybnMsXG5cdFx0fSk7XG5cdH1cblxuXHQvKiogUmVuZGVyIGEgVVJJIGFzIGEgc2hvcnQgcmVsYXRpdmUtaXNoIHBhdGggZm9yIHNwb2tlbiBzdW1tYXJpZXMuICovXG5cdHByaXZhdGUgX2Zvcm1hdFBhdGgodXJpOiBVUkkpOiBzdHJpbmcge1xuXHRcdC8vIFRha2UgbGFzdCAyIHNlZ21lbnRzIFx1MjAxNCBlbm91Z2ggZm9yIHRoZSBtb2RlbCB0byBpZGVudGlmeSB0aGUgZmlsZVxuXHRcdC8vIHdpdGhvdXQgZHVtcGluZyBmdWxsIHdvcmtzcGFjZSBwYXRocyBpbnRvIHRoZSBwcm9tcHQuXG5cdFx0Y29uc3QgcGFydHMgPSB1cmkucGF0aC5zcGxpdCgnLycpLmZpbHRlcihCb29sZWFuKTtcblx0XHRpZiAocGFydHMubGVuZ3RoIDw9IDIpIHtcblx0XHRcdHJldHVybiB1cmkucGF0aC5yZXBsYWNlKC9eXFwvLywgJycpO1xuXHRcdH1cblx0XHRyZXR1cm4gcGFydHMuc2xpY2UoLTIpLmpvaW4oJy8nKTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJVm9pY2VUb29sRGlzcGF0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
