import { localize } from "../../../../nls.js";
import {
  ResponsePartKind,
  ToolCallCancellationReason,
  ToolCallConfirmationReason,
  ToolCallStatus,
  ToolResultContentType,
  TurnState,
  MessageKind
} from "../../common/state/protocol/state.js";
import { buildSubagentSessionUri } from "../../common/state/sessionState.js";
import { readToolCallMeta } from "../../common/meta/agentToolCallMeta.js";
import { formatGenericToolInput } from "../../common/streamingToolCallDisplay.js";
import { buildClaudeToolMeta, getClaudeInvocationMessage, getClaudePastTenseMessage, getClaudeToolDisplayName, getClaudeToolInputString } from "./claudeToolDisplay.js";
import { hasClientToolNamePrefix, stripClientToolNamePrefix } from "./clientTools/claudeClientToolMcpServer.js";
function mapSessionMessagesToTurns(messages, session, logService) {
  const builder = new ReplayBuilder(session, logService);
  for (const msg of messages) {
    const parsed = parseSessionMessage(msg);
    if (parsed === void 0) {
      continue;
    }
    builder.consume(parsed);
  }
  return builder.finish();
}
function resolveForkAnchorUuid(messages, turnId) {
  let turnOpen = false;
  let seenTarget = false;
  let lastAssistantUuid;
  for (const msg of messages) {
    const parsed = parseSessionMessage(msg);
    if (parsed === void 0) {
      continue;
    }
    if (parsed.kind === "user-text") {
      if (seenTarget) {
        break;
      }
      turnOpen = true;
      if (parsed.uuid === turnId) {
        seenTarget = true;
      }
    } else if (parsed.kind === "assistant") {
      if (!turnOpen) {
        turnOpen = true;
        if (parsed.uuid === turnId) {
          seenTarget = true;
        }
      }
      if (seenTarget) {
        lastAssistantUuid = parsed.uuid;
      }
    }
  }
  if (!seenTarget) {
    return void 0;
  }
  return lastAssistantUuid;
}
function parseSessionMessage(msg) {
  const timestamp = readTimestamp(msg);
  switch (msg.type) {
    case "user":
      return parseUserMessage(msg, timestamp);
    case "assistant":
      return parseAssistantMessage(msg, timestamp);
    case "system":
      return parseSystemMessage(msg, timestamp);
    default:
      return void 0;
  }
}
function readTimestamp(msg) {
  if (typeof msg.timestamp !== "string") {
    return void 0;
  }
  const timestamp = Date.parse(msg.timestamp);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : void 0;
}
function parseUserMessage(msg, timestamp) {
  const content = readUserContent(msg.message);
  if (content === void 0) {
    return void 0;
  }
  if (isCliEchoContent(content)) {
    return void 0;
  }
  if (typeof content === "string") {
    return { kind: "user-text", uuid: msg.uuid, text: content, timestamp };
  }
  const textBlocks = content.filter((b) => b.type === "text");
  if (textBlocks.length === 0) {
    const results = content.filter((b) => b.type === "tool_result");
    return results.length > 0 ? { kind: "user-tool-results", uuid: msg.uuid, results, timestamp } : void 0;
  }
  return { kind: "user-text", uuid: msg.uuid, text: textBlocks.map((b) => b.text).join("\n"), timestamp };
}
function parseAssistantMessage(msg, timestamp) {
  const blocks = readAssistantBlocks(msg.message);
  if (blocks === void 0 || blocks.length === 0) {
    return void 0;
  }
  return { kind: "assistant", uuid: msg.uuid, blocks, isInner: msg.parent_tool_use_id !== null, timestamp };
}
function parseSystemMessage(msg, timestamp) {
  const subtype = readSystemSubtype(msg.message);
  if (subtype === void 0 || !ALLOWED_SYSTEM_SUBTYPES.has(subtype)) {
    return void 0;
  }
  const text = readSystemText(msg.message) ?? `[${subtype}]`;
  return { kind: "system-notification", uuid: msg.uuid, subtype, text, timestamp };
}
const ALLOWED_SYSTEM_SUBTYPES = /* @__PURE__ */ new Set([
  "compact_boundary",
  "notification"
]);
const CLI_ECHO_MARKER_PATTERN = /^<(command-name|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat)>/;
function missingPromptPlaceholder() {
  return localize("claude.replay.missingPrompt", "Message content could not be retrieved");
}
class ReplayBuilder {
  constructor(_session, _logService) {
    this._session = _session;
    this._logService = _logService;
    this._turns = [];
    /**
     * Cross-turn tool-use tracking. Keyed by `tool_use_id`:
     * - `turnId` — the announcing turn (so a late `tool_result` in a
     *   later `user` envelope can attach back to the right turn per M7).
     * - `parsedInput` — the original `tool_use.input`, looked up at
     *   `_attachToolResult` so the past-tense message can include the
     *   original parameters. Mirrors the live mapper's `_toolCallInfo`
     *   pattern but simpler (replay has the full input synchronously on
     *   the `tool_use` block).
     */
    this._toolUses = /* @__PURE__ */ new Map();
    /** Turns opened from a leading assistant envelope because the prompt was missing. Reported once by {@link finish}. */
    this._recoveredPromptlessTurns = 0;
    /** `tool_result` blocks whose announcing `tool_use` was not in the slice. Reported once by {@link finish}. */
    this._orphanToolResults = 0;
  }
  consume(msg) {
    switch (msg.kind) {
      case "user-text":
        this._closeActive();
        this._active = {
          id: msg.uuid,
          userText: msg.text,
          startedAt: msg.timestamp,
          responseParts: [],
          pendingToolUseIds: /* @__PURE__ */ new Set(),
          toolCallParts: /* @__PURE__ */ new Map()
        };
        return;
      case "user-tool-results": {
        let updatesActiveTurn = false;
        for (const block of msg.results) {
          updatesActiveTurn = this._attachToolResult(block) === this._active?.id || updatesActiveTurn;
        }
        if (updatesActiveTurn && this._active && msg.timestamp) {
          this._active.lastResponseAt = msg.timestamp;
        }
        return;
      }
      case "assistant":
        this._consumeAssistant(msg);
        return;
      case "system-notification":
        if (this._active === void 0) {
          return;
        }
        this._active.responseParts.push({
          kind: ResponsePartKind.SystemNotification,
          content: msg.text
        });
        if (msg.timestamp) {
          this._active.lastResponseAt = msg.timestamp;
        }
        return;
    }
  }
  finish() {
    this._closeActive();
    if (this._recoveredPromptlessTurns > 0 || this._orphanToolResults > 0) {
      this._logService.warn(`[claudeReplayMapper] incomplete transcript for ${this._session.toString()}: ${this._recoveredPromptlessTurns} turn(s) recovered without their prompt, ${this._orphanToolResults} orphaned tool_result(s)`);
    }
    return this._turns;
  }
  _consumeAssistant(msg) {
    if (this._active === void 0) {
      if (!msg.isInner) {
        this._recoveredPromptlessTurns++;
      }
      this._active = {
        id: msg.uuid,
        userText: msg.isInner ? "" : missingPromptPlaceholder(),
        startedAt: msg.timestamp,
        responseParts: [],
        pendingToolUseIds: /* @__PURE__ */ new Set(),
        toolCallParts: /* @__PURE__ */ new Map()
      };
    }
    let textPartCounter = 0;
    let reasoningPartCounter = 0;
    for (const block of msg.blocks) {
      if (block.type === "text" && typeof block.text === "string") {
        this._active.responseParts.push({
          kind: ResponsePartKind.Markdown,
          id: `${this._active.id}#${msg.uuid}#text-${textPartCounter++}`,
          content: block.text
        });
      } else if (block.type === "thinking" && typeof block.thinking === "string") {
        this._active.responseParts.push({
          kind: ResponsePartKind.Reasoning,
          id: `${this._active.id}#${msg.uuid}#thinking-${reasoningPartCounter++}`,
          content: block.thinking
        });
      } else if (block.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string") {
        this._openToolUse(block.id, stripClientToolNamePrefix(block.name), block.input, hasClientToolNamePrefix(block.name));
      }
    }
    if (msg.timestamp) {
      this._active.lastResponseAt = msg.timestamp;
    }
  }
  _openToolUse(toolUseId, toolName, input, isClientTool) {
    if (this._active === void 0) {
      return;
    }
    const displayName = isClientTool ? toolName : getClaudeToolDisplayName(toolName);
    const parsedInput = input !== null && typeof input === "object" ? input : void 0;
    const meta = isClientTool ? void 0 : buildClaudeToolMeta(toolName);
    const placeholder = {
      status: ToolCallStatus.Cancelled,
      toolCallId: toolUseId,
      toolName,
      displayName,
      invocationMessage: isClientTool ? displayName : getClaudeInvocationMessage(toolName, displayName, parsedInput),
      toolInput: parsedInput !== void 0 ? isClientTool ? formatGenericToolInput(parsedInput) : getClaudeToolInputString(toolName, parsedInput) : typeof input === "string" ? input : input !== void 0 ? safeStringify(input) : void 0,
      reason: ToolCallCancellationReason.Skipped,
      ...meta ? { _meta: meta } : {}
    };
    const part = {
      kind: ResponsePartKind.ToolCall,
      toolCall: placeholder
    };
    this._active.responseParts.push(part);
    this._active.toolCallParts.set(toolUseId, part);
    this._active.pendingToolUseIds.add(toolUseId);
    this._toolUses.set(toolUseId, { turnId: this._active.id, parsedInput, isClientTool });
  }
  _attachToolResult(block) {
    const entry = this._toolUses.get(block.tool_use_id);
    if (entry === void 0) {
      this._orphanToolResults++;
      return void 0;
    }
    const announcingTurnId = entry.turnId;
    const part = this._findToolCallPart(announcingTurnId, block.tool_use_id);
    if (part === void 0) {
      return void 0;
    }
    const isError = block.is_error;
    const previousState = part.toolCall;
    const isSubagent = readToolCallMeta(previousState).toolKind === "subagent";
    const content = extractToolResultContent(block.content) ?? [];
    const resultText = content.filter((c) => c.type === ToolResultContentType.Text).map((c) => c.text).join("\n");
    if (isSubagent) {
      content.push({
        type: ToolResultContentType.Subagent,
        resource: buildSubagentSessionUri(this._session.toString(), previousState.toolCallId),
        title: previousState.displayName
      });
    }
    const completed = {
      status: ToolCallStatus.Completed,
      toolCallId: previousState.toolCallId,
      toolName: previousState.toolName,
      displayName: previousState.displayName,
      invocationMessage: previousState.invocationMessage ?? previousState.displayName,
      toolInput: previousState.status === ToolCallStatus.Streaming ? void 0 : previousState.toolInput,
      confirmed: ToolCallConfirmationReason.NotNeeded,
      success: !isError,
      pastTenseMessage: entry.isClientTool ? previousState.displayName : getClaudePastTenseMessage(previousState.toolName, previousState.displayName, entry.parsedInput, !isError, resultText),
      content: content.length > 0 ? content : void 0,
      ...previousState._meta ? { _meta: previousState._meta } : {}
    };
    part.toolCall = completed;
    if (this._active?.id === announcingTurnId) {
      this._active.pendingToolUseIds.delete(block.tool_use_id);
    }
    return announcingTurnId;
  }
  _findToolCallPart(turnId, toolUseId) {
    if (this._active && this._active.id === turnId) {
      return this._active.toolCallParts.get(toolUseId);
    }
    for (let i = this._turns.length - 1; i >= 0; i--) {
      if (this._turns[i].id !== turnId) {
        continue;
      }
      for (const part of this._turns[i].responseParts) {
        if (part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === toolUseId) {
          return part;
        }
      }
      return void 0;
    }
    return void 0;
  }
  _closeActive() {
    if (this._active === void 0) {
      return;
    }
    const a = this._active;
    const state = a.pendingToolUseIds.size === 0 ? TurnState.Complete : TurnState.Cancelled;
    const startedAt = a.startedAt === void 0 ? void 0 : Date.parse(a.startedAt);
    const endedAt = a.lastResponseAt === void 0 ? void 0 : Date.parse(a.lastResponseAt);
    const duration = startedAt !== void 0 && endedAt !== void 0 && Number.isFinite(startedAt) && Number.isFinite(endedAt) ? Math.max(0, endedAt - startedAt) : void 0;
    const turn = {
      id: a.id,
      startedAt: a.startedAt,
      duration,
      message: { text: a.userText, origin: { kind: MessageKind.User } },
      responseParts: a.responseParts,
      usage: void 0,
      state
    };
    this._turns.push(turn);
    this._active = void 0;
  }
}
function readUserContent(raw) {
  if (raw === null || typeof raw !== "object") {
    return void 0;
  }
  const content = raw.content;
  if (typeof content === "string") {
    return content.length > 0 ? content : void 0;
  }
  if (!Array.isArray(content) || content.length === 0) {
    return void 0;
  }
  const out = [];
  for (const block of content) {
    if (block === null || typeof block !== "object") {
      continue;
    }
    const b = block;
    if (b.type === "text" && typeof b.text === "string") {
      out.push({ type: "text", text: b.text });
    } else if (b.type === "tool_result" && typeof b.tool_use_id === "string") {
      out.push({ type: "tool_result", tool_use_id: b.tool_use_id, content: b.content, is_error: b.is_error === true });
    }
  }
  return out.length > 0 ? out : void 0;
}
function readAssistantBlocks(raw) {
  if (raw === null || typeof raw !== "object") {
    return void 0;
  }
  const content = raw.content;
  if (!Array.isArray(content)) {
    return void 0;
  }
  const out = [];
  for (const block of content) {
    if (block === null || typeof block !== "object") {
      continue;
    }
    const b = block;
    if (typeof b.type !== "string") {
      continue;
    }
    out.push({
      type: b.type,
      text: typeof b.text === "string" ? b.text : void 0,
      thinking: typeof b.thinking === "string" ? b.thinking : void 0,
      id: typeof b.id === "string" ? b.id : void 0,
      name: typeof b.name === "string" ? b.name : void 0,
      input: b.input
    });
  }
  return out;
}
function readSystemSubtype(raw) {
  if (raw === null || typeof raw !== "object") {
    return void 0;
  }
  const subtype = raw.subtype;
  return typeof subtype === "string" ? subtype : void 0;
}
function readSystemText(raw) {
  if (raw === null || typeof raw !== "object") {
    return void 0;
  }
  const r = raw;
  if (typeof r.text === "string") {
    return r.text;
  }
  if (typeof r.message === "string") {
    return r.message;
  }
  return void 0;
}
function extractToolResultContent(content) {
  if (typeof content === "string") {
    return content.length > 0 ? [{ type: ToolResultContentType.Text, text: content }] : void 0;
  }
  if (!Array.isArray(content)) {
    return void 0;
  }
  const out = [];
  for (const block of content) {
    if (block === null || typeof block !== "object") {
      continue;
    }
    const b = block;
    if (b.type === "text" && typeof b.text === "string") {
      out.push({ type: ToolResultContentType.Text, text: b.text });
    }
  }
  return out.length > 0 ? out : void 0;
}
function safeStringify(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return void 0;
  }
}
function isCliEchoContent(content) {
  if (typeof content === "string") {
    return CLI_ECHO_MARKER_PATTERN.test(content);
  }
  const firstText = content.find((b) => b.type === "text");
  return firstText !== void 0 && CLI_ECHO_MARKER_PATTERN.test(firstText.text);
}
export {
  mapSessionMessagesToTurns,
  missingPromptPlaceholder,
  resolveForkAnchorUuid
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NsYXVkZS9jbGF1ZGVSZXBsYXlNYXBwZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IFNlc3Npb25NZXNzYWdlIH0gZnJvbSAnQGFudGhyb3BpYy1haS9jbGF1ZGUtYWdlbnQtc2RrJztcbmltcG9ydCB0eXBlIHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB0eXBlIHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQge1xuXHRSZXNwb25zZVBhcnRLaW5kLFxuXHRUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbixcblx0VG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sXG5cdFRvb2xDYWxsU3RhdHVzLFxuXHRUb29sUmVzdWx0Q29udGVudFR5cGUsXG5cdFR1cm5TdGF0ZSxcblx0TWVzc2FnZUtpbmQsXG5cdHR5cGUgUmVzcG9uc2VQYXJ0LFxuXHR0eXBlIFRvb2xDYWxsQ2FuY2VsbGVkU3RhdGUsXG5cdHR5cGUgVG9vbENhbGxDb21wbGV0ZWRTdGF0ZSxcblx0dHlwZSBUb29sQ2FsbFJlc3BvbnNlUGFydCxcblx0dHlwZSBUb29sUmVzdWx0Q29udGVudCxcblx0dHlwZSBUdXJuLFxufSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgYnVpbGRTdWJhZ2VudFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IHJlYWRUb29sQ2FsbE1ldGEgfSBmcm9tICcuLi8uLi9jb21tb24vbWV0YS9hZ2VudFRvb2xDYWxsTWV0YS5qcyc7XG5pbXBvcnQgeyBmb3JtYXRHZW5lcmljVG9vbElucHV0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0cmVhbWluZ1Rvb2xDYWxsRGlzcGxheS5qcyc7XG5pbXBvcnQgeyBidWlsZENsYXVkZVRvb2xNZXRhLCBnZXRDbGF1ZGVJbnZvY2F0aW9uTWVzc2FnZSwgZ2V0Q2xhdWRlUGFzdFRlbnNlTWVzc2FnZSwgZ2V0Q2xhdWRlVG9vbERpc3BsYXlOYW1lLCBnZXRDbGF1ZGVUb29sSW5wdXRTdHJpbmcgfSBmcm9tICcuL2NsYXVkZVRvb2xEaXNwbGF5LmpzJztcbmltcG9ydCB7IGhhc0NsaWVudFRvb2xOYW1lUHJlZml4LCBzdHJpcENsaWVudFRvb2xOYW1lUHJlZml4IH0gZnJvbSAnLi9jbGllbnRUb29scy9jbGF1ZGVDbGllbnRUb29sTWNwU2VydmVyLmpzJztcblxuLyoqXG4gKiBQaGFzZSAxMyBcdTIwMTQgcmVwbGF5IG1hcHBlci4gUmVkdWNlcyBhIGZsYXQgYFNlc3Npb25NZXNzYWdlW11gICh0aGUgU0RLJ3NcbiAqIG9uLWRpc2sgSlNPTkwgdHJhbnNjcmlwdCkgaW50byB0aGUgcHJvdG9jb2wncyBgVHVybltdYCBzaGFwZSBwZXJcbiAqIFtDT05URVhULm1kIE03XSguL0NPTlRFWFQubWQpLiBQdXJlIGZ1bmN0aW9uOyBubyBJL08sIG5vIERJLlxuICpcbiAqIERpc3RpbmN0IGZyb20gdGhlIGxpdmUgbWFwcGVyIChgbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzYCkgYmVjYXVzZTpcbiAqIC0gaW5wdXQgc2hhcGUgZGlmZmVycyAoYFNlc3Npb25NZXNzYWdlYCBlbnZlbG9wZSB2cyBgU0RLTWVzc2FnZWAgdW5pb24pLFxuICogLSBvdXRwdXQgc2hhcGUgZGlmZmVycyAoYFR1cm5bXWAgdnMgYEFnZW50U2lnbmFsW11gKSxcbiAqIC0gcmVwbGF5IGhhcyBubyBgJ3Jlc3VsdCdgIGVudmVsb3BlIChTREsgZG9lc24ndCBwZXJzaXN0IGl0KSBhbmQgbm9cbiAqICAgYCdzdHJlYW1fZXZlbnQnYCBsaWZlY3ljbGUgKHRlcm1pbmFsIHN0YXRlcyBvbmx5KS5cbiAqXG4gKiBTaGFyZWQgaW52YXJpYW50IHdpdGggdGhlIGxpdmUgbWFwcGVyOiB0aGUgYE1hcDx0b29sX3VzZV9pZCwgdHVybklkPmBcbiAqIGF0dHJpYnV0aW9uIHJ1bGUgZnJvbSBNNyBcdTIwMTQgYHRvb2xfcmVzdWx0YCBsZWdpdGltYXRlbHkgbGFuZHMgaW4gYSBsYXRlclxuICogYCd1c2VyJ2AgZW52ZWxvcGUgYW5kIG11c3QgcmVzb2x2ZSBiYWNrIHRvIHRoZSBhbm5vdW5jaW5nIGB0b29sX3VzZWAnc1xuICogdHVybi4gVGhpcyBtYXBwZXIgYnVpbGRzIGFuIGVxdWl2YWxlbnQgbG9jYWwgbWFwIGR1cmluZyBpdHMgc2luZ2xlIHBhc3MuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXBTZXNzaW9uTWVzc2FnZXNUb1R1cm5zKFxuXHRtZXNzYWdlczogcmVhZG9ubHkgU2Vzc2lvbk1lc3NhZ2VbXSxcblx0c2Vzc2lvbjogVVJJLFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcbik6IHJlYWRvbmx5IFR1cm5bXSB7XG5cdGNvbnN0IGJ1aWxkZXIgPSBuZXcgUmVwbGF5QnVpbGRlcihzZXNzaW9uLCBsb2dTZXJ2aWNlKTtcblx0Zm9yIChjb25zdCBtc2cgb2YgbWVzc2FnZXMpIHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZVNlc3Npb25NZXNzYWdlKG1zZyk7XG5cdFx0aWYgKHBhcnNlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0YnVpbGRlci5jb25zdW1lKHBhcnNlZCk7XG5cdH1cblx0cmV0dXJuIGJ1aWxkZXIuZmluaXNoKCk7XG59XG5cbi8qKlxuICogUGhhc2UgNi41IFx1MjAxNCB0cmFuc2xhdGUgYSBwcm90b2NvbCBgdHVybklkYCAodGhlIGxhc3QgS0VQVCB0dXJuIE4pIGludG8gdGhlXG4gKiBTREsgZW52ZWxvcGUgYHV1aWRgIHRoYXQgYGZvcmtTZXNzaW9uKHsgdXBUb01lc3NhZ2VJZCB9KWAgYWNjZXB0c1xuICogKElOQ0xVU0lWRSkuIFJldHVybnMgdGhlIGB1dWlkYCBvZiB0dXJuIE4ncyBsYXN0IGAnYXNzaXN0YW50J2AgZW52ZWxvcGUsXG4gKiBvciBgdW5kZWZpbmVkYCB3aGVuIGB0dXJuSWRgIGlzIG5vdCBpbiB0aGUgdHJhbnNjcmlwdCBvciB0aGUgdHVybiBoYXMgbm9cbiAqIGFzc2lzdGFudCBlbnZlbG9wZSB5ZXQuIEFnZW50IEhvc3QgUHJvdG9jb2wgcmVxdWVzdCB0dXJuIElEcyBhcmUgbm90IHZhbGlkIFNESyBmb3JrIFVVSURzLlxuICogUmV1c2VzIHtAbGluayBwYXJzZVNlc3Npb25NZXNzYWdlfSBzbyB0aGUgdHVybi1ib3VuZGFyeSBydWxlIG1hdGNoZXNcbiAqIHtAbGluayBSZXBsYXlCdWlsZGVyfTsgYWx3YXlzIHJldHVybnMgYW4gZW52ZWxvcGUgYHV1aWRgLCBuZXZlciBhIGBtc2dfXHUyMDI2YCBpZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVGb3JrQW5jaG9yVXVpZChtZXNzYWdlczogcmVhZG9ubHkgU2Vzc2lvbk1lc3NhZ2VbXSwgdHVybklkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRsZXQgdHVybk9wZW4gPSBmYWxzZTtcblx0bGV0IHNlZW5UYXJnZXQgPSBmYWxzZTtcblx0bGV0IGxhc3RBc3Npc3RhbnRVdWlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGZvciAoY29uc3QgbXNnIG9mIG1lc3NhZ2VzKSB7XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VTZXNzaW9uTWVzc2FnZShtc2cpO1xuXHRcdGlmIChwYXJzZWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmIChwYXJzZWQua2luZCA9PT0gJ3VzZXItdGV4dCcpIHtcblx0XHRcdGlmIChzZWVuVGFyZ2V0KSB7XG5cdFx0XHRcdC8vIEZpcnN0IGdlbnVpbmUgdXNlci10ZXh0IGFmdGVyIHR1cm4gTiBzdGFydGVkIFx1MjE5MiB0dXJuIE4gaXMgb3Zlci5cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHR0dXJuT3BlbiA9IHRydWU7XG5cdFx0XHRpZiAocGFyc2VkLnV1aWQgPT09IHR1cm5JZCkge1xuXHRcdFx0XHRzZWVuVGFyZ2V0ID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHBhcnNlZC5raW5kID09PSAnYXNzaXN0YW50Jykge1xuXHRcdFx0aWYgKCF0dXJuT3Blbikge1xuXHRcdFx0XHQvLyBNaXJyb3JzIHtAbGluayBSZXBsYXlCdWlsZGVyLl9jb25zdW1lQXNzaXN0YW50fTogYW4gYXNzaXN0YW50XG5cdFx0XHRcdC8vIGVudmVsb3BlIHdpdGggbm8gdHVybiBvcGVuIHN0YXJ0cyBvbmUga2V5ZWQgb24gaXRzIG93biB1dWlkXG5cdFx0XHRcdC8vIChzdWJhZ2VudCB0cmFuc2NyaXB0LCBvciBhIHRydW5jYXRlZCBzbGljZSB0aGF0IGxvc3QgaXRzXG5cdFx0XHRcdC8vIHByb21wdCkuIFdpdGhvdXQgdGhpcyB0aGUgcmVzb2x2ZXIgY2FuJ3QgYW5jaG9yIGEgZm9yayBvblxuXHRcdFx0XHQvLyBzdWNoIGEgdHVybi5cblx0XHRcdFx0dHVybk9wZW4gPSB0cnVlO1xuXHRcdFx0XHRpZiAocGFyc2VkLnV1aWQgPT09IHR1cm5JZCkge1xuXHRcdFx0XHRcdHNlZW5UYXJnZXQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2VlblRhcmdldCkge1xuXHRcdFx0XHRsYXN0QXNzaXN0YW50VXVpZCA9IHBhcnNlZC51dWlkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyAndXNlci10b29sLXJlc3VsdHMnIC8gJ3N5c3RlbS1ub3RpZmljYXRpb24nIG5ldmVyIGZsaXAgdGhlIHR1cm4uXG5cdH1cblx0aWYgKCFzZWVuVGFyZ2V0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gbGFzdEFzc2lzdGFudFV1aWQ7XG59XG5cbi8vICNyZWdpb24gUGFyc2VkIG1lc3NhZ2UgdW5pb24gXHUyMDE0IG5hcnJvdy1hdC10aGUtc2VhbSBhZGFwdGVyXG5cbmludGVyZmFjZSBVc2VyVGV4dEJsb2NrIHsgcmVhZG9ubHkgdHlwZTogJ3RleHQnOyByZWFkb25seSB0ZXh0OiBzdHJpbmcgfVxuaW50ZXJmYWNlIFVzZXJUb29sUmVzdWx0QmxvY2sgeyByZWFkb25seSB0eXBlOiAndG9vbF9yZXN1bHQnOyByZWFkb25seSB0b29sX3VzZV9pZDogc3RyaW5nOyByZWFkb25seSBjb250ZW50OiB1bmtub3duOyByZWFkb25seSBpc19lcnJvcjogYm9vbGVhbiB9XG5pbnRlcmZhY2UgQXNzaXN0YW50QmxvY2sgeyByZWFkb25seSB0eXBlOiBzdHJpbmc7IHJlYWRvbmx5IHRleHQ/OiBzdHJpbmc7IHJlYWRvbmx5IHRoaW5raW5nPzogc3RyaW5nOyByZWFkb25seSBpZD86IHN0cmluZzsgcmVhZG9ubHkgbmFtZT86IHN0cmluZzsgcmVhZG9ubHkgaW5wdXQ/OiB1bmtub3duIH1cblxuLyoqXG4gKiBEaXNjcmltaW5hdGVkIHVuaW9uIG9mIHJlcGxheS1yZWxldmFudCBtZXNzYWdlIHNoYXBlcy4gRXZlcnl0aGluZyB0aGF0XG4gKiB0aGUgbWFwcGVyIGFjdHVhbGx5IGNhcmVzIGFib3V0IGlzIG9uZSBvZiB0aGVzZTsgZXZlcnl0aGluZyBlbHNlIChob29rcyxcbiAqIENMSS1lY2hvIGVudHJpZXMsIHVuYWxsb3dlZCBzeXN0ZW0gc3VidHlwZXMsIG1hbGZvcm1lZCBlbnZlbG9wZXMpIHJldHVybnNcbiAqIGB1bmRlZmluZWRgIGZyb20ge0BsaW5rIHBhcnNlU2Vzc2lvbk1lc3NhZ2V9LlxuICpcbiAqIFRoZSBzcGxpdCBrZWVwcyBTREsgc2hhcGUgZGV0ZWN0aW9uICh0aGlzIHNlYW0pIHNlcGFyYXRlIGZyb20gdGhlXG4gKiBzdGF0ZWZ1bCByZWR1Y3Rpb24gKHRoZSB7QGxpbmsgUmVwbGF5QnVpbGRlcn0pIFx1MjAxNCBzZWUgQ09OVEVYVCBNNy5cbiAqL1xudHlwZSBQYXJzZWRTZXNzaW9uTWVzc2FnZSA9XG5cdHwgeyByZWFkb25seSBraW5kOiAndXNlci10ZXh0JzsgcmVhZG9ubHkgdXVpZDogc3RyaW5nOyByZWFkb25seSB0ZXh0OiBzdHJpbmc7IHJlYWRvbmx5IHRpbWVzdGFtcD86IHN0cmluZyB9XG5cdHwgeyByZWFkb25seSBraW5kOiAndXNlci10b29sLXJlc3VsdHMnOyByZWFkb25seSB1dWlkOiBzdHJpbmc7IHJlYWRvbmx5IHJlc3VsdHM6IHJlYWRvbmx5IFVzZXJUb29sUmVzdWx0QmxvY2tbXTsgcmVhZG9ubHkgdGltZXN0YW1wPzogc3RyaW5nIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICdhc3Npc3RhbnQnOyByZWFkb25seSB1dWlkOiBzdHJpbmc7IHJlYWRvbmx5IGJsb2NrczogcmVhZG9ubHkgQXNzaXN0YW50QmxvY2tbXTsgcmVhZG9ubHkgaXNJbm5lcjogYm9vbGVhbjsgcmVhZG9ubHkgdGltZXN0YW1wPzogc3RyaW5nIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICdzeXN0ZW0tbm90aWZpY2F0aW9uJzsgcmVhZG9ubHkgdXVpZDogc3RyaW5nOyByZWFkb25seSBzdWJ0eXBlOiBzdHJpbmc7IHJlYWRvbmx5IHRleHQ6IHN0cmluZzsgcmVhZG9ubHkgdGltZXN0YW1wPzogc3RyaW5nIH07XG5cbmZ1bmN0aW9uIHBhcnNlU2Vzc2lvbk1lc3NhZ2UobXNnOiBTZXNzaW9uTWVzc2FnZSk6IFBhcnNlZFNlc3Npb25NZXNzYWdlIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdGltZXN0YW1wID0gcmVhZFRpbWVzdGFtcChtc2cpO1xuXHRzd2l0Y2ggKG1zZy50eXBlKSB7XG5cdFx0Y2FzZSAndXNlcic6IHJldHVybiBwYXJzZVVzZXJNZXNzYWdlKG1zZywgdGltZXN0YW1wKTtcblx0XHRjYXNlICdhc3Npc3RhbnQnOiByZXR1cm4gcGFyc2VBc3Npc3RhbnRNZXNzYWdlKG1zZywgdGltZXN0YW1wKTtcblx0XHRjYXNlICdzeXN0ZW0nOiByZXR1cm4gcGFyc2VTeXN0ZW1NZXNzYWdlKG1zZywgdGltZXN0YW1wKTtcblx0XHRkZWZhdWx0OiByZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlYWRUaW1lc3RhbXAobXNnOiBTZXNzaW9uTWVzc2FnZSAmIHsgcmVhZG9ubHkgdGltZXN0YW1wPzogdW5rbm93biB9KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKHR5cGVvZiBtc2cudGltZXN0YW1wICE9PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgdGltZXN0YW1wID0gRGF0ZS5wYXJzZShtc2cudGltZXN0YW1wKTtcblx0cmV0dXJuIE51bWJlci5pc0Zpbml0ZSh0aW1lc3RhbXApID8gbmV3IERhdGUodGltZXN0YW1wKS50b0lTT1N0cmluZygpIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBwYXJzZVVzZXJNZXNzYWdlKG1zZzogU2Vzc2lvbk1lc3NhZ2UsIHRpbWVzdGFtcDogc3RyaW5nIHwgdW5kZWZpbmVkKTogUGFyc2VkU2Vzc2lvbk1lc3NhZ2UgfCB1bmRlZmluZWQge1xuXHRjb25zdCBjb250ZW50ID0gcmVhZFVzZXJDb250ZW50KG1zZy5tZXNzYWdlKTtcblx0aWYgKGNvbnRlbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKGlzQ2xpRWNob0NvbnRlbnQoY29udGVudCkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmICh0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4geyBraW5kOiAndXNlci10ZXh0JywgdXVpZDogbXNnLnV1aWQsIHRleHQ6IGNvbnRlbnQsIHRpbWVzdGFtcCB9O1xuXHR9XG5cdGNvbnN0IHRleHRCbG9ja3MgPSBjb250ZW50LmZpbHRlcigoYik6IGIgaXMgVXNlclRleHRCbG9jayA9PiBiLnR5cGUgPT09ICd0ZXh0Jyk7XG5cdGlmICh0ZXh0QmxvY2tzLmxlbmd0aCA9PT0gMCkge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBjb250ZW50LmZpbHRlcigoYik6IGIgaXMgVXNlclRvb2xSZXN1bHRCbG9jayA9PiBiLnR5cGUgPT09ICd0b29sX3Jlc3VsdCcpO1xuXHRcdHJldHVybiByZXN1bHRzLmxlbmd0aCA+IDAgPyB7IGtpbmQ6ICd1c2VyLXRvb2wtcmVzdWx0cycsIHV1aWQ6IG1zZy51dWlkLCByZXN1bHRzLCB0aW1lc3RhbXAgfSA6IHVuZGVmaW5lZDtcblx0fVxuXHQvLyBNaXhlZCBvciB0ZXh0LW9ubHk6IHRleHQgd2lucyBcdTIwMTQgbWF0Y2hlcyBwcmlvciBiZWhhdmlvciB3aGVyZSB0b29sX3Jlc3VsdHNcblx0Ly8gaW4gYSB0ZXh0LWJlYXJpbmcgZW52ZWxvcGUgYXJlIGRyb3BwZWQgKHRoZXkgc2hvdWxkIGFscmVhZHkgaGF2ZSBiZWVuIGRlbGl2ZXJlZCkuXG5cdHJldHVybiB7IGtpbmQ6ICd1c2VyLXRleHQnLCB1dWlkOiBtc2cudXVpZCwgdGV4dDogdGV4dEJsb2Nrcy5tYXAoYiA9PiBiLnRleHQpLmpvaW4oJ1xcbicpLCB0aW1lc3RhbXAgfTtcbn1cblxuZnVuY3Rpb24gcGFyc2VBc3Npc3RhbnRNZXNzYWdlKG1zZzogU2Vzc2lvbk1lc3NhZ2UsIHRpbWVzdGFtcDogc3RyaW5nIHwgdW5kZWZpbmVkKTogUGFyc2VkU2Vzc2lvbk1lc3NhZ2UgfCB1bmRlZmluZWQge1xuXHRjb25zdCBibG9ja3MgPSByZWFkQXNzaXN0YW50QmxvY2tzKG1zZy5tZXNzYWdlKTtcblx0aWYgKGJsb2NrcyA9PT0gdW5kZWZpbmVkIHx8IGJsb2Nrcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdC8vIFN1YmFnZW50IHRyYW5zY3JpcHRzIChmcm9tIGBnZXRTdWJhZ2VudE1lc3NhZ2VzYCkgY2FycnkgYVxuXHQvLyBgcGFyZW50X3Rvb2xfdXNlX2lkYCBvbiBldmVyeSBlbnZlbG9wZSBhbmQgaGF2ZSBubyBzeW50aGV0aWMgc3Bhd25pbmdcblx0Ly8gdXNlciBwcm9tcHQsIHNvIHRoZXkgbGVnaXRpbWF0ZWx5IG9wZW4gd2l0aCBhbiBhc3Npc3RhbnQgbWVzc2FnZSBcdTIwMTRcblx0Ly8gYGlzSW5uZXJgIGxldHMgdGhlIGJ1aWxkZXIgc3ludGhlc2l6ZSBhIHR1cm4gaW5zdGVhZCBvZiBkcm9wcGluZyBpdC5cblx0cmV0dXJuIHsga2luZDogJ2Fzc2lzdGFudCcsIHV1aWQ6IG1zZy51dWlkLCBibG9ja3MsIGlzSW5uZXI6IG1zZy5wYXJlbnRfdG9vbF91c2VfaWQgIT09IG51bGwsIHRpbWVzdGFtcCB9O1xufVxuXG5mdW5jdGlvbiBwYXJzZVN5c3RlbU1lc3NhZ2UobXNnOiBTZXNzaW9uTWVzc2FnZSwgdGltZXN0YW1wOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQYXJzZWRTZXNzaW9uTWVzc2FnZSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHN1YnR5cGUgPSByZWFkU3lzdGVtU3VidHlwZShtc2cubWVzc2FnZSk7XG5cdGlmIChzdWJ0eXBlID09PSB1bmRlZmluZWQgfHwgIUFMTE9XRURfU1lTVEVNX1NVQlRZUEVTLmhhcyhzdWJ0eXBlKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgdGV4dCA9IHJlYWRTeXN0ZW1UZXh0KG1zZy5tZXNzYWdlKSA/PyBgWyR7c3VidHlwZX1dYDtcblx0cmV0dXJuIHsga2luZDogJ3N5c3RlbS1ub3RpZmljYXRpb24nLCB1dWlkOiBtc2cudXVpZCwgc3VidHlwZSwgdGV4dCwgdGltZXN0YW1wIH07XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBCdWlsZGVyXG5cbi8qKlxuICogQWxsb3dsaXN0IG9mIGBzeXN0ZW1gIHN1YnR5cGVzIHRoYXQgc3Vydml2ZSByZXBsYXkgYXNcbiAqIHtAbGluayBSZXNwb25zZVBhcnRLaW5kLlN5c3RlbU5vdGlmaWNhdGlvbn0gcGFydHMgb24gdGhlIGFjdGl2ZSB0dXJuLlxuICogTWlycm9ycyBDT05URVhUIE03J3MgdGFibGUgXHUyMDE0IGFueXRoaW5nIG5vdCBpbiB0aGlzIHNldCBpcyBkcm9wcGVkLlxuICovXG5jb25zdCBBTExPV0VEX1NZU1RFTV9TVUJUWVBFUzogUmVhZG9ubHlTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoW1xuXHQnY29tcGFjdF9ib3VuZGFyeScsXG5cdCdub3RpZmljYXRpb24nLFxuXSk7XG5cbi8qKlxuICogQ0xJLWVjaG8gbWFya2VycyB0aGUgQ2xhdWRlIENvZGUgQ0xJIHdyaXRlcyBpbnRvIHRoZSB0cmFuc2NyaXB0IGZvclxuICogcmVwbGF5IGZpZGVsaXR5LiBUaGV5IGFyZSBgdHlwZTogJ3VzZXInYCBlbnZlbG9wZXMgd2hvc2UgYG1lc3NhZ2UuY29udGVudGBcbiAqIGlzIGEgcmF3IHN0cmluZyBzdGFydGluZyB3aXRoIG9uZSBvZiB0aGVzZSB0YWdzIFx1MjAxNCBgPGNvbW1hbmQtbmFtZT5gIC9cbiAqIGA8Y29tbWFuZC1hcmdzPmAgKHNsYXNoLWNvbW1hbmQgZWNob2VzIGxpa2UgYC9tb2RlbCBjbGF1ZGUtb3B1cy00LjdgKSxcbiAqIGA8bG9jYWwtY29tbWFuZC1zdGRvdXQ+YCAvIGA8bG9jYWwtY29tbWFuZC1zdGRlcnI+YCAoZWNobyBvZiB0aGUgbG9jYWxcbiAqIGhhbmRsZXIncyBvdXRwdXQsIGUuZy4gXCJTZXQgbW9kZWwgdG8gY2xhdWRlLW9wdXMtNC43XCIpLCBhbmRcbiAqIGA8bG9jYWwtY29tbWFuZC1jYXZlYXQ+YCAodGhlIFwibWVzc2FnZXMgYmVsb3cgd2VyZSBnZW5lcmF0ZWQgd2hpbGVcdTIwMjZcIlxuICogcHJlYW1ibGUpLiBUaGUgZW50cmllcyBkb24ndCBjYXJyeSBgaXNTeW50aGV0aWNgIC8gYGlzTWV0YWAgcmVsaWFibHlcbiAqICh0aGUgYC9tb2RlbGAgZWNobyBsYWNrcyBib3RoLCB2ZXJpZmllZCBlbXBpcmljYWxseSksIHNvIHRoZSBvbmx5IHJlbGlhYmxlXG4gKiBkaXNjcmltaW5hdG9yIGlzIHRoZSBjb250ZW50IHNoYXBlIGl0c2VsZi4gRHJvcCBvbiByZXBsYXkgc28gdGhlIHdvcmtiZW5jaFxuICogZG9lc24ndCByZW5kZXIgdGhlbSBhcyB1c2VyIHR1cm5zLlxuICovXG5jb25zdCBDTElfRUNIT19NQVJLRVJfUEFUVEVSTiA9IC9ePChjb21tYW5kLW5hbWV8Y29tbWFuZC1tZXNzYWdlfGNvbW1hbmQtYXJnc3xsb2NhbC1jb21tYW5kLXN0ZG91dHxsb2NhbC1jb21tYW5kLXN0ZGVycnxsb2NhbC1jb21tYW5kLWNhdmVhdCk+LztcblxuLyoqXG4gKiBTdGFuZC1pbiBwcm9tcHQgZm9yIGEgdHVybiB3aG9zZSB1c2VyIG1lc3NhZ2UgaXMgbm90IHByZXNlbnQgaW4gdGhlXG4gKiB0cmFuc2NyaXB0IHNsaWNlIHdlIHdlcmUgaGFuZGVkLiBUaGlzIGhhcHBlbnMgd2hlbiB0aGUgU0RLIHRydW5jYXRlcyBhXG4gKiBsYXJnZSB0cmFuc2NyaXB0IChpdCByZXR1cm5zIG9ubHkgdGhlIGJ5dGVzIGFmdGVyIHRoZSBsYXN0IGNvbXBhY3RcbiAqIGJvdW5kYXJ5KSwgd2hpY2ggY3V0cyB0aGUgb3BlbmluZyBwcm9tcHQgb2ZmIG1pZC10dXJuLiBTaG93aW5nIHRoZVxuICogcmVjb3ZlcmVkIGFzc2lzdGFudCBjb250ZW50IHVuZGVyIGEgcGxhY2Vob2xkZXIgcHJvbXB0IGlzIHN0cmljdGx5IGJldHRlclxuICogdGhhbiBkcm9wcGluZyB0aGUgdHVybiBcdTIwMTQgZHJvcHBpbmcgY2FuIHNpbGVudGx5IGVtcHR5IGFuIGVudGlyZSBzZXNzaW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWlzc2luZ1Byb21wdFBsYWNlaG9sZGVyKCk6IHN0cmluZyB7XG5cdHJldHVybiBsb2NhbGl6ZSgnY2xhdWRlLnJlcGxheS5taXNzaW5nUHJvbXB0JywgXCJNZXNzYWdlIGNvbnRlbnQgY291bGQgbm90IGJlIHJldHJpZXZlZFwiKTtcbn1cblxuaW50ZXJmYWNlIEluUHJvZ3Jlc3NUdXJuIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdXNlclRleHQ6IHN0cmluZztcblx0cmVhZG9ubHkgc3RhcnRlZEF0Pzogc3RyaW5nO1xuXHRsYXN0UmVzcG9uc2VBdD86IHN0cmluZztcblx0cmVhZG9ubHkgcmVzcG9uc2VQYXJ0czogUmVzcG9uc2VQYXJ0W107XG5cdC8qKlxuXHQgKiBgdG9vbF91c2VfaWRgcyBhbm5vdW5jZWQgYnkgVEhJUyB0dXJuLiBEcmFpbmVkIHdoZW4gdGhlIG1hdGNoaW5nXG5cdCAqIGB0b29sX3Jlc3VsdGAgbGFuZHMgKHdoaWNoIG1heSBhcnJpdmUgaW4gdGhpcyB0dXJuJ3MgdXNlci1zaWRlXG5cdCAqIGB0b29sX3Jlc3VsdGAgYmxvY2sgb3IgYSBsYXRlciB0dXJuJ3MpLiBBdCB0dXJuIGNsb3NlLCBub24tZW1wdHkgXHUyMTkyXG5cdCAqIHRhaWwgVHVybiBtYXJrZWQgYENhbmNlbGxlZGAuXG5cdCAqL1xuXHRyZWFkb25seSBwZW5kaW5nVG9vbFVzZUlkczogU2V0PHN0cmluZz47XG5cdC8qKlxuXHQgKiBTdGFzaCBvZiBjb21wbGV0ZWQgYFRvb2xDYWxsUmVzcG9uc2VQYXJ0YHMgd2FpdGluZyBvbiB0aGVpciByZXN1bHRcblx0ICogY29udGVudC4gYHRvb2xfdXNlYCBvcGVucyB3aXRoIGEgcGxhY2Vob2xkZXI7IHRoZSBtYXRjaGluZ1xuXHQgKiBgdG9vbF9yZXN1bHRgIGZpbGxzIGl0IGluLiBLZXllZCBieSBgdG9vbF91c2VfaWRgLlxuXHQgKi9cblx0cmVhZG9ubHkgdG9vbENhbGxQYXJ0czogTWFwPHN0cmluZywgVG9vbENhbGxSZXNwb25zZVBhcnQ+O1xufVxuXG5jbGFzcyBSZXBsYXlCdWlsZGVyIHtcblx0cHJpdmF0ZSByZWFkb25seSBfdHVybnM6IFR1cm5bXSA9IFtdO1xuXHRwcml2YXRlIF9hY3RpdmU6IEluUHJvZ3Jlc3NUdXJuIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogQ3Jvc3MtdHVybiB0b29sLXVzZSB0cmFja2luZy4gS2V5ZWQgYnkgYHRvb2xfdXNlX2lkYDpcblx0ICogLSBgdHVybklkYCBcdTIwMTQgdGhlIGFubm91bmNpbmcgdHVybiAoc28gYSBsYXRlIGB0b29sX3Jlc3VsdGAgaW4gYVxuXHQgKiAgIGxhdGVyIGB1c2VyYCBlbnZlbG9wZSBjYW4gYXR0YWNoIGJhY2sgdG8gdGhlIHJpZ2h0IHR1cm4gcGVyIE03KS5cblx0ICogLSBgcGFyc2VkSW5wdXRgIFx1MjAxNCB0aGUgb3JpZ2luYWwgYHRvb2xfdXNlLmlucHV0YCwgbG9va2VkIHVwIGF0XG5cdCAqICAgYF9hdHRhY2hUb29sUmVzdWx0YCBzbyB0aGUgcGFzdC10ZW5zZSBtZXNzYWdlIGNhbiBpbmNsdWRlIHRoZVxuXHQgKiAgIG9yaWdpbmFsIHBhcmFtZXRlcnMuIE1pcnJvcnMgdGhlIGxpdmUgbWFwcGVyJ3MgYF90b29sQ2FsbEluZm9gXG5cdCAqICAgcGF0dGVybiBidXQgc2ltcGxlciAocmVwbGF5IGhhcyB0aGUgZnVsbCBpbnB1dCBzeW5jaHJvbm91c2x5IG9uXG5cdCAqICAgdGhlIGB0b29sX3VzZWAgYmxvY2spLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfdG9vbFVzZXMgPSBuZXcgTWFwPHN0cmluZywgeyByZWFkb25seSB0dXJuSWQ6IHN0cmluZzsgcmVhZG9ubHkgcGFyc2VkSW5wdXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkOyByZWFkb25seSBpc0NsaWVudFRvb2w6IGJvb2xlYW4gfT4oKTtcblxuXHQvKiogVHVybnMgb3BlbmVkIGZyb20gYSBsZWFkaW5nIGFzc2lzdGFudCBlbnZlbG9wZSBiZWNhdXNlIHRoZSBwcm9tcHQgd2FzIG1pc3NpbmcuIFJlcG9ydGVkIG9uY2UgYnkge0BsaW5rIGZpbmlzaH0uICovXG5cdHByaXZhdGUgX3JlY292ZXJlZFByb21wdGxlc3NUdXJucyA9IDA7XG5cblx0LyoqIGB0b29sX3Jlc3VsdGAgYmxvY2tzIHdob3NlIGFubm91bmNpbmcgYHRvb2xfdXNlYCB3YXMgbm90IGluIHRoZSBzbGljZS4gUmVwb3J0ZWQgb25jZSBieSB7QGxpbmsgZmluaXNofS4gKi9cblx0cHJpdmF0ZSBfb3JwaGFuVG9vbFJlc3VsdHMgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb246IFVSSSwgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpIHsgfVxuXG5cdGNvbnN1bWUobXNnOiBQYXJzZWRTZXNzaW9uTWVzc2FnZSk6IHZvaWQge1xuXHRcdHN3aXRjaCAobXNnLmtpbmQpIHtcblx0XHRcdGNhc2UgJ3VzZXItdGV4dCc6XG5cdFx0XHRcdHRoaXMuX2Nsb3NlQWN0aXZlKCk7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZSA9IHtcblx0XHRcdFx0XHRpZDogbXNnLnV1aWQsXG5cdFx0XHRcdFx0dXNlclRleHQ6IG1zZy50ZXh0LFxuXHRcdFx0XHRcdHN0YXJ0ZWRBdDogbXNnLnRpbWVzdGFtcCxcblx0XHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbXSxcblx0XHRcdFx0XHRwZW5kaW5nVG9vbFVzZUlkczogbmV3IFNldCgpLFxuXHRcdFx0XHRcdHRvb2xDYWxsUGFydHM6IG5ldyBNYXAoKSxcblx0XHRcdFx0fTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0Y2FzZSAndXNlci10b29sLXJlc3VsdHMnOiB7XG5cdFx0XHRcdGxldCB1cGRhdGVzQWN0aXZlVHVybiA9IGZhbHNlO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGJsb2NrIG9mIG1zZy5yZXN1bHRzKSB7XG5cdFx0XHRcdFx0dXBkYXRlc0FjdGl2ZVR1cm4gPSB0aGlzLl9hdHRhY2hUb29sUmVzdWx0KGJsb2NrKSA9PT0gdGhpcy5fYWN0aXZlPy5pZCB8fCB1cGRhdGVzQWN0aXZlVHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodXBkYXRlc0FjdGl2ZVR1cm4gJiYgdGhpcy5fYWN0aXZlICYmIG1zZy50aW1lc3RhbXApIHtcblx0XHRcdFx0XHR0aGlzLl9hY3RpdmUubGFzdFJlc3BvbnNlQXQgPSBtc2cudGltZXN0YW1wO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2Fzc2lzdGFudCc6XG5cdFx0XHRcdHRoaXMuX2NvbnN1bWVBc3Npc3RhbnQobXNnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0Y2FzZSAnc3lzdGVtLW5vdGlmaWNhdGlvbic6XG5cdFx0XHRcdGlmICh0aGlzLl9hY3RpdmUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdC8vIFN5c3RlbSBub3RpZmljYXRpb24gYmVmb3JlIGFueSB1c2VyIG1lc3NhZ2UgXHUyMDE0IGRyb3AuIFdpdGhvdXQgYW4gYWN0aXZlIHR1cm4gdGhlcmUncyBub3doZXJlIHRvIGF0dGFjaC5cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fYWN0aXZlLnJlc3BvbnNlUGFydHMucHVzaCh7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5TeXN0ZW1Ob3RpZmljYXRpb24sXG5cdFx0XHRcdFx0Y29udGVudDogbXNnLnRleHQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAobXNnLnRpbWVzdGFtcCkge1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZS5sYXN0UmVzcG9uc2VBdCA9IG1zZy50aW1lc3RhbXA7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxuXG5cdGZpbmlzaCgpOiByZWFkb25seSBUdXJuW10ge1xuXHRcdHRoaXMuX2Nsb3NlQWN0aXZlKCk7XG5cdFx0Ly8gT25lIHN1bW1hcnkgbGluZSBwZXIgcmVwbGF5IGluc3RlYWQgb2Ygb25lIHdhcm4gcGVyIGVudmVsb3BlOiBhXG5cdFx0Ly8gdHJ1bmNhdGVkIHRyYW5zY3JpcHQgcHJvZHVjZXMgdGhlc2UgYnkgdGhlIGh1bmRyZWQsIGFuZCB0aGVcblx0XHQvLyBwZXItZW52ZWxvcGUgZm9ybSBkcm93bmVkIG91dCB0aGUgZmFjdCB0aGF0IHRoZSB3aG9sZSBzZXNzaW9uIGhhZFxuXHRcdC8vIGJlZW4gcmVkdWNlZCB0byBub3RoaW5nLlxuXHRcdGlmICh0aGlzLl9yZWNvdmVyZWRQcm9tcHRsZXNzVHVybnMgPiAwIHx8IHRoaXMuX29ycGhhblRvb2xSZXN1bHRzID4gMCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbY2xhdWRlUmVwbGF5TWFwcGVyXSBpbmNvbXBsZXRlIHRyYW5zY3JpcHQgZm9yICR7dGhpcy5fc2Vzc2lvbi50b1N0cmluZygpfTogJHt0aGlzLl9yZWNvdmVyZWRQcm9tcHRsZXNzVHVybnN9IHR1cm4ocykgcmVjb3ZlcmVkIHdpdGhvdXQgdGhlaXIgcHJvbXB0LCAke3RoaXMuX29ycGhhblRvb2xSZXN1bHRzfSBvcnBoYW5lZCB0b29sX3Jlc3VsdChzKWApO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdHVybnM7XG5cdH1cblxuXHRwcml2YXRlIF9jb25zdW1lQXNzaXN0YW50KG1zZzogUGFyc2VkU2Vzc2lvbk1lc3NhZ2UgJiB7IGtpbmQ6ICdhc3Npc3RhbnQnIH0pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYWN0aXZlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIFR3byB3YXlzIGEgdHJhbnNjcmlwdCBsZWdpdGltYXRlbHkgb3BlbnMgd2l0aCBhbiBhc3Npc3RhbnRcblx0XHRcdC8vIGVudmVsb3BlOlxuXHRcdFx0Ly8gLSBTdWJhZ2VudCB0cmFuc2NyaXB0IChgaXNJbm5lcmApOiBldmVyeSBlbnZlbG9wZSBjYXJyaWVzXG5cdFx0XHQvLyAgIGBwYXJlbnRfdG9vbF91c2VfaWRgIGFuZCB0aGUgU0RLIG9taXRzIHRoZSBzeW50aGV0aWMgc3Bhd25pbmdcblx0XHRcdC8vICAgcHJvbXB0LCBzbyB0aGVyZSBpcyBnZW51aW5lbHkgbm8gcHJvbXB0IHRvIHNob3cuXG5cdFx0XHQvLyAtIFRydW5jYXRlZCBwYXJlbnQgdHJhbnNjcmlwdDogdGhlIFNESyBkcm9wcyBldmVyeXRoaW5nIGJlZm9yZVxuXHRcdFx0Ly8gICB0aGUgbGFzdCBjb21wYWN0IGJvdW5kYXJ5IGZvciB0cmFuc2NyaXB0cyBvdmVyIGl0cyBzaXplXG5cdFx0XHQvLyAgIHRocmVzaG9sZCwgd2hpY2ggY2FuIGN1dCB0aGUgcHJvbXB0IG9mZiBtaWQtdHVybi5cblx0XHRcdC8vIEVpdGhlciB3YXksIHN5bnRoZXNpemUgYSB0dXJuIHRvIGhvbGQgdGhlIHJlcGx5LiBEcm9wcGluZyB3b3VsZFxuXHRcdFx0Ly8gZGlzY2FyZCB0aGUgYXNzaXN0YW50IGNvbnRlbnQgXHUyMDE0IGFuZCB3aGVuIHRoZSB0cnVuY2F0ZWQgc2xpY2Vcblx0XHRcdC8vIGNvbnRhaW5zIG5vIHVzZXIgbWVzc2FnZSBhdCBhbGwgKG9uZSBsb25nIGFnZW50aWMgdHVybiksIHRoYXRcblx0XHRcdC8vIG1lYW5zIGRpc2NhcmRpbmcgdGhlIGVudGlyZSBzZXNzaW9uLlxuXHRcdFx0aWYgKCFtc2cuaXNJbm5lcikge1xuXHRcdFx0XHR0aGlzLl9yZWNvdmVyZWRQcm9tcHRsZXNzVHVybnMrKztcblx0XHRcdH1cblx0XHRcdHRoaXMuX2FjdGl2ZSA9IHtcblx0XHRcdFx0aWQ6IG1zZy51dWlkLFxuXHRcdFx0XHR1c2VyVGV4dDogbXNnLmlzSW5uZXIgPyAnJyA6IG1pc3NpbmdQcm9tcHRQbGFjZWhvbGRlcigpLFxuXHRcdFx0XHRzdGFydGVkQXQ6IG1zZy50aW1lc3RhbXAsXG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFtdLFxuXHRcdFx0XHRwZW5kaW5nVG9vbFVzZUlkczogbmV3IFNldCgpLFxuXHRcdFx0XHR0b29sQ2FsbFBhcnRzOiBuZXcgTWFwKCksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRsZXQgdGV4dFBhcnRDb3VudGVyID0gMDtcblx0XHRsZXQgcmVhc29uaW5nUGFydENvdW50ZXIgPSAwO1xuXHRcdGZvciAoY29uc3QgYmxvY2sgb2YgbXNnLmJsb2Nrcykge1xuXHRcdFx0aWYgKGJsb2NrLnR5cGUgPT09ICd0ZXh0JyAmJiB0eXBlb2YgYmxvY2sudGV4dCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZlLnJlc3BvbnNlUGFydHMucHVzaCh7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bixcblx0XHRcdFx0XHRpZDogYCR7dGhpcy5fYWN0aXZlLmlkfSMke21zZy51dWlkfSN0ZXh0LSR7dGV4dFBhcnRDb3VudGVyKyt9YCxcblx0XHRcdFx0XHRjb250ZW50OiBibG9jay50ZXh0LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoYmxvY2sudHlwZSA9PT0gJ3RoaW5raW5nJyAmJiB0eXBlb2YgYmxvY2sudGhpbmtpbmcgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZS5yZXNwb25zZVBhcnRzLnB1c2goe1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nLFxuXHRcdFx0XHRcdGlkOiBgJHt0aGlzLl9hY3RpdmUuaWR9IyR7bXNnLnV1aWR9I3RoaW5raW5nLSR7cmVhc29uaW5nUGFydENvdW50ZXIrK31gLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IGJsb2NrLnRoaW5raW5nLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoYmxvY2sudHlwZSA9PT0gJ3Rvb2xfdXNlJyAmJiB0eXBlb2YgYmxvY2suaWQgPT09ICdzdHJpbmcnICYmIHR5cGVvZiBibG9jay5uYW1lID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHQvLyBTdHJpcCB0aGUgaW4tcHJvY2VzcyBNQ1Agc2VydmVyIHByZWZpeCBzbyB0aGUgd29ya2JlbmNoIHJlc29sdmVzXG5cdFx0XHRcdC8vIHRoZSB3b3JrYmVuY2gtcmVnaXN0ZXJlZCB0b29sIGJ5IGl0cyB1bnByZWZpeGVkIG5hbWUgKG1hdGNoZXMgdGhlXG5cdFx0XHRcdC8vIGxpdmUgc3RyZWFtIG1hcHBlcikuIFdpdGhvdXQgdGhpcywgcmVwbGF5ZWQgY2xpZW50LXRvb2wgY2FsbHNcblx0XHRcdFx0Ly8gZmFsbCBiYWNrIHRvIHRoZSBnZW5lcmljIFwiUnVuIE1DUCB0b29sXCIgcmVuZGVyaW5nLlxuXHRcdFx0XHR0aGlzLl9vcGVuVG9vbFVzZShibG9jay5pZCwgc3RyaXBDbGllbnRUb29sTmFtZVByZWZpeChibG9jay5uYW1lKSwgYmxvY2suaW5wdXQsIGhhc0NsaWVudFRvb2xOYW1lUHJlZml4KGJsb2NrLm5hbWUpKTtcblx0XHRcdH1cblx0XHRcdC8vIE90aGVyIGJsb2NrIHR5cGVzIChzZXJ2ZXJfdG9vbF91c2UsIGV0Yy4pIGFyZSBkcm9wcGVkIHNpbGVudGx5IHBlciBNNy5cblx0XHR9XG5cdFx0aWYgKG1zZy50aW1lc3RhbXApIHtcblx0XHRcdHRoaXMuX2FjdGl2ZS5sYXN0UmVzcG9uc2VBdCA9IG1zZy50aW1lc3RhbXA7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb3BlblRvb2xVc2UodG9vbFVzZUlkOiBzdHJpbmcsIHRvb2xOYW1lOiBzdHJpbmcsIGlucHV0OiB1bmtub3duLCBpc0NsaWVudFRvb2w6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYWN0aXZlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBpc0NsaWVudFRvb2wgPyB0b29sTmFtZSA6IGdldENsYXVkZVRvb2xEaXNwbGF5TmFtZSh0b29sTmFtZSk7XG5cdFx0Y29uc3QgcGFyc2VkSW5wdXQgPSBpbnB1dCAhPT0gbnVsbCAmJiB0eXBlb2YgaW5wdXQgPT09ICdvYmplY3QnID8gaW5wdXQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbWV0YSA9IGlzQ2xpZW50VG9vbCA/IHVuZGVmaW5lZCA6IGJ1aWxkQ2xhdWRlVG9vbE1ldGEodG9vbE5hbWUpO1xuXHRcdC8vIEJ1aWxkIGEgcGxhY2Vob2xkZXIgQ2FuY2VsbGVkIHN0YXRlIGJ5IGRlZmF1bHQ7IHJlcGxhY2VkIHdpdGggQ29tcGxldGVkIHdoZW4gdGhlIHRvb2xfcmVzdWx0IGxhbmRzLlxuXHRcdGNvbnN0IHBsYWNlaG9sZGVyOiBUb29sQ2FsbENhbmNlbGxlZFN0YXRlID0ge1xuXHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5DYW5jZWxsZWQsXG5cdFx0XHR0b29sQ2FsbElkOiB0b29sVXNlSWQsXG5cdFx0XHR0b29sTmFtZSxcblx0XHRcdGRpc3BsYXlOYW1lLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGlzQ2xpZW50VG9vbCA/IGRpc3BsYXlOYW1lIDogZ2V0Q2xhdWRlSW52b2NhdGlvbk1lc3NhZ2UodG9vbE5hbWUsIGRpc3BsYXlOYW1lLCBwYXJzZWRJbnB1dCksXG5cdFx0XHR0b29sSW5wdXQ6IHBhcnNlZElucHV0ICE9PSB1bmRlZmluZWRcblx0XHRcdFx0PyBpc0NsaWVudFRvb2wgPyBmb3JtYXRHZW5lcmljVG9vbElucHV0KHBhcnNlZElucHV0KSA6IGdldENsYXVkZVRvb2xJbnB1dFN0cmluZyh0b29sTmFtZSwgcGFyc2VkSW5wdXQpXG5cdFx0XHRcdDogKHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycgPyBpbnB1dCA6IGlucHV0ICE9PSB1bmRlZmluZWQgPyBzYWZlU3RyaW5naWZ5KGlucHV0KSA6IHVuZGVmaW5lZCksXG5cdFx0XHRyZWFzb246IFRvb2xDYWxsQ2FuY2VsbGF0aW9uUmVhc29uLlNraXBwZWQsXG5cdFx0XHQuLi4obWV0YSA/IHsgX21ldGE6IG1ldGEgfSA6IHt9KSxcblx0XHR9O1xuXHRcdGNvbnN0IHBhcnQ6IFRvb2xDYWxsUmVzcG9uc2VQYXJ0ID0ge1xuXHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCxcblx0XHRcdHRvb2xDYWxsOiBwbGFjZWhvbGRlcixcblx0XHR9O1xuXHRcdHRoaXMuX2FjdGl2ZS5yZXNwb25zZVBhcnRzLnB1c2gocGFydCk7XG5cdFx0dGhpcy5fYWN0aXZlLnRvb2xDYWxsUGFydHMuc2V0KHRvb2xVc2VJZCwgcGFydCk7XG5cdFx0dGhpcy5fYWN0aXZlLnBlbmRpbmdUb29sVXNlSWRzLmFkZCh0b29sVXNlSWQpO1xuXHRcdHRoaXMuX3Rvb2xVc2VzLnNldCh0b29sVXNlSWQsIHsgdHVybklkOiB0aGlzLl9hY3RpdmUuaWQsIHBhcnNlZElucHV0LCBpc0NsaWVudFRvb2wgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9hdHRhY2hUb29sUmVzdWx0KGJsb2NrOiBVc2VyVG9vbFJlc3VsdEJsb2NrKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3Rvb2xVc2VzLmdldChibG9jay50b29sX3VzZV9pZCk7XG5cdFx0aWYgKGVudHJ5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX29ycGhhblRvb2xSZXN1bHRzKys7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBhbm5vdW5jaW5nVHVybklkID0gZW50cnkudHVybklkO1xuXHRcdC8vIEZpbmQgdGhlIHBhcnQgXHUyMDE0IGl0IGxpdmVzIG9uIHRoZSBhbm5vdW5jaW5nIHR1cm4gKHdoaWNoIG1heSBiZSBgX2FjdGl2ZWAgb3Igb25lIGFscmVhZHkgcHVzaGVkIHRvIGBfdHVybnNgKS5cblx0XHRjb25zdCBwYXJ0ID0gdGhpcy5fZmluZFRvb2xDYWxsUGFydChhbm5vdW5jaW5nVHVybklkLCBibG9jay50b29sX3VzZV9pZCk7XG5cdFx0aWYgKHBhcnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgaXNFcnJvciA9IGJsb2NrLmlzX2Vycm9yO1xuXHRcdGNvbnN0IHByZXZpb3VzU3RhdGUgPSBwYXJ0LnRvb2xDYWxsO1xuXHRcdGNvbnN0IGlzU3ViYWdlbnQgPSByZWFkVG9vbENhbGxNZXRhKHByZXZpb3VzU3RhdGUpLnRvb2xLaW5kID09PSAnc3ViYWdlbnQnO1xuXHRcdGNvbnN0IGNvbnRlbnQ6IFRvb2xSZXN1bHRDb250ZW50W10gPSBleHRyYWN0VG9vbFJlc3VsdENvbnRlbnQoYmxvY2suY29udGVudCkgPz8gW107XG5cdFx0Y29uc3QgcmVzdWx0VGV4dCA9IGNvbnRlbnRcblx0XHRcdC5maWx0ZXIoKGMpOiBjIGlzIHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQ7IHRleHQ6IHN0cmluZyB9ID0+IGMudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQpXG5cdFx0XHQubWFwKGMgPT4gYy50ZXh0KVxuXHRcdFx0LmpvaW4oJ1xcbicpO1xuXHRcdGlmIChpc1N1YmFnZW50KSB7XG5cdFx0XHRjb250ZW50LnB1c2goe1xuXHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQsXG5cdFx0XHRcdHJlc291cmNlOiBidWlsZFN1YmFnZW50U2Vzc2lvblVyaSh0aGlzLl9zZXNzaW9uLnRvU3RyaW5nKCksIHByZXZpb3VzU3RhdGUudG9vbENhbGxJZCksXG5cdFx0XHRcdHRpdGxlOiBwcmV2aW91c1N0YXRlLmRpc3BsYXlOYW1lLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbXBsZXRlZDogVG9vbENhbGxDb21wbGV0ZWRTdGF0ZSA9IHtcblx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0dG9vbENhbGxJZDogcHJldmlvdXNTdGF0ZS50b29sQ2FsbElkLFxuXHRcdFx0dG9vbE5hbWU6IHByZXZpb3VzU3RhdGUudG9vbE5hbWUsXG5cdFx0XHRkaXNwbGF5TmFtZTogcHJldmlvdXNTdGF0ZS5kaXNwbGF5TmFtZSxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBwcmV2aW91c1N0YXRlLmludm9jYXRpb25NZXNzYWdlID8/IHByZXZpb3VzU3RhdGUuZGlzcGxheU5hbWUsXG5cdFx0XHR0b29sSW5wdXQ6IHByZXZpb3VzU3RhdGUuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcgPyB1bmRlZmluZWQgOiBwcmV2aW91c1N0YXRlLnRvb2xJbnB1dCxcblx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0c3VjY2VzczogIWlzRXJyb3IsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBlbnRyeS5pc0NsaWVudFRvb2xcblx0XHRcdFx0PyBwcmV2aW91c1N0YXRlLmRpc3BsYXlOYW1lXG5cdFx0XHRcdDogZ2V0Q2xhdWRlUGFzdFRlbnNlTWVzc2FnZShwcmV2aW91c1N0YXRlLnRvb2xOYW1lLCBwcmV2aW91c1N0YXRlLmRpc3BsYXlOYW1lLCBlbnRyeS5wYXJzZWRJbnB1dCwgIWlzRXJyb3IsIHJlc3VsdFRleHQpLFxuXHRcdFx0Y29udGVudDogY29udGVudC5sZW5ndGggPiAwID8gY29udGVudCA6IHVuZGVmaW5lZCxcblx0XHRcdC4uLihwcmV2aW91c1N0YXRlLl9tZXRhID8geyBfbWV0YTogcHJldmlvdXNTdGF0ZS5fbWV0YSB9IDoge30pLFxuXHRcdH07XG5cdFx0cGFydC50b29sQ2FsbCA9IGNvbXBsZXRlZDtcblx0XHQvLyBEcmFpbiBwZW5kaW5nIHRyYWNrZXIgb24gdGhlIGFubm91bmNpbmcgdHVybiBcdTIwMTQgYnV0IG9ubHkgaWYgdGhhdFxuXHRcdC8vIHR1cm4gaXMgc3RpbGwgaW4gcHJvZ3Jlc3MuIENvbW1pdHRlZCB0dXJucyBoYXZlIHRoZWlyIHN0YXRlXG5cdFx0Ly8gbG9ja2VkIGF0IGNsb3NlIHRpbWUgcGVyIEZpeHR1cmUgNmIgKFwib3JwaGFuIGluIHR1cm4gTiBkb2VzXG5cdFx0Ly8gTk9UIGNhbmNlbCB0dXJuIE4rMVwiKTsgYSBsYXRlLWFycml2aW5nIHRvb2xfcmVzdWx0IGZvciBhXG5cdFx0Ly8gY29tbWl0dGVkIHR1cm4gZG9lc24ndCByZS1wcm9tb3RlIGl0LlxuXHRcdGlmICh0aGlzLl9hY3RpdmU/LmlkID09PSBhbm5vdW5jaW5nVHVybklkKSB7XG5cdFx0XHR0aGlzLl9hY3RpdmUucGVuZGluZ1Rvb2xVc2VJZHMuZGVsZXRlKGJsb2NrLnRvb2xfdXNlX2lkKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFubm91bmNpbmdUdXJuSWQ7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kVG9vbENhbGxQYXJ0KHR1cm5JZDogc3RyaW5nLCB0b29sVXNlSWQ6IHN0cmluZyk6IFRvb2xDYWxsUmVzcG9uc2VQYXJ0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fYWN0aXZlICYmIHRoaXMuX2FjdGl2ZS5pZCA9PT0gdHVybklkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlLnRvb2xDYWxsUGFydHMuZ2V0KHRvb2xVc2VJZCk7XG5cdFx0fVxuXHRcdC8vIEFscmVhZHktY2xvc2VkIHR1cm46IHNlYXJjaCBjb21taXR0ZWQgVHVybnMuIExpbmVhciBzY2FuIGlzIGZpbmUgXHUyMDE0IHJlcGxheSBpcyBvbmUtc2hvdCBwZXIgc2Vzc2lvbiBhbmQgdHVybnMgYXJlIE8odGVucy1odW5kcmVkcykuXG5cdFx0Zm9yIChsZXQgaSA9IHRoaXMuX3R1cm5zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRpZiAodGhpcy5fdHVybnNbaV0uaWQgIT09IHR1cm5JZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgcGFydCBvZiB0aGlzLl90dXJuc1tpXS5yZXNwb25zZVBhcnRzKSB7XG5cdFx0XHRcdGlmIChwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcGFydC50b29sQ2FsbC50b29sQ2FsbElkID09PSB0b29sVXNlSWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gcGFydDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2Nsb3NlQWN0aXZlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9hY3RpdmUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhID0gdGhpcy5fYWN0aXZlO1xuXHRcdGNvbnN0IHN0YXRlID0gYS5wZW5kaW5nVG9vbFVzZUlkcy5zaXplID09PSAwID8gVHVyblN0YXRlLkNvbXBsZXRlIDogVHVyblN0YXRlLkNhbmNlbGxlZDtcblx0XHRjb25zdCBzdGFydGVkQXQgPSBhLnN0YXJ0ZWRBdCA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogRGF0ZS5wYXJzZShhLnN0YXJ0ZWRBdCk7XG5cdFx0Y29uc3QgZW5kZWRBdCA9IGEubGFzdFJlc3BvbnNlQXQgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IERhdGUucGFyc2UoYS5sYXN0UmVzcG9uc2VBdCk7XG5cdFx0Y29uc3QgZHVyYXRpb24gPSBzdGFydGVkQXQgIT09IHVuZGVmaW5lZCAmJiBlbmRlZEF0ICE9PSB1bmRlZmluZWQgJiYgTnVtYmVyLmlzRmluaXRlKHN0YXJ0ZWRBdCkgJiYgTnVtYmVyLmlzRmluaXRlKGVuZGVkQXQpXG5cdFx0XHQ/IE1hdGgubWF4KDAsIGVuZGVkQXQgLSBzdGFydGVkQXQpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRjb25zdCB0dXJuOiBUdXJuID0ge1xuXHRcdFx0aWQ6IGEuaWQsXG5cdFx0XHRzdGFydGVkQXQ6IGEuc3RhcnRlZEF0LFxuXHRcdFx0ZHVyYXRpb24sXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6IGEudXNlclRleHQsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdHJlc3BvbnNlUGFydHM6IGEucmVzcG9uc2VQYXJ0cyxcblx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRzdGF0ZSxcblx0XHR9O1xuXHRcdHRoaXMuX3R1cm5zLnB1c2godHVybik7XG5cdFx0dGhpcy5fYWN0aXZlID0gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBIZWxwZXJzIFx1MjAxNCBuYXJyb3ctYXQtdGhlLXNlYW0gc2hhcGUgcmVhZGVyc1xuXG4vKipcbiAqIFJldHVybnMgc3RyaW5nIGNvbnRlbnQgKGxlZ2FjeSBmb3JtKSBvciBhbiBhcnJheSBvZiByZWNvZ25pc2VkIHVzZXJcbiAqIGJsb2NrcyAodGV4dCArIHRvb2xfcmVzdWx0KS4gQW55dGhpbmcgZWxzZSByZXR1cm5zIGB1bmRlZmluZWRgIGFuZCB0aGVcbiAqIGNhbGxlciBkcm9wcyB0aGUgbWVzc2FnZSBcdTIwMTQgbWF0Y2hlcyB0aGUgcHJvZHVjdGlvbiBleHRlbnNpb24ncyBwYXJzZXJcbiAqIHNlbWFudGljcyBwZXIgQ09OVEVYVCBNNyBnbG9zc2FyeS5cbiAqL1xuZnVuY3Rpb24gcmVhZFVzZXJDb250ZW50KHJhdzogdW5rbm93bik6IHN0cmluZyB8IFJlYWRvbmx5QXJyYXk8VXNlclRleHRCbG9jayB8IFVzZXJUb29sUmVzdWx0QmxvY2s+IHwgdW5kZWZpbmVkIHtcblx0aWYgKHJhdyA9PT0gbnVsbCB8fCB0eXBlb2YgcmF3ICE9PSAnb2JqZWN0Jykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgY29udGVudCA9IChyYXcgYXMgeyBjb250ZW50PzogdW5rbm93biB9KS5jb250ZW50O1xuXHRpZiAodHlwZW9mIGNvbnRlbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIGNvbnRlbnQubGVuZ3RoID4gMCA/IGNvbnRlbnQgOiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKCFBcnJheS5pc0FycmF5KGNvbnRlbnQpIHx8IGNvbnRlbnQubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBvdXQ6IChVc2VyVGV4dEJsb2NrIHwgVXNlclRvb2xSZXN1bHRCbG9jaylbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGJsb2NrIG9mIGNvbnRlbnQpIHtcblx0XHRpZiAoYmxvY2sgPT09IG51bGwgfHwgdHlwZW9mIGJsb2NrICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IGIgPSBibG9jayBhcyB7IHR5cGU/OiB1bmtub3duOyB0ZXh0PzogdW5rbm93bjsgdG9vbF91c2VfaWQ/OiB1bmtub3duOyBjb250ZW50PzogdW5rbm93bjsgaXNfZXJyb3I/OiB1bmtub3duIH07XG5cdFx0aWYgKGIudHlwZSA9PT0gJ3RleHQnICYmIHR5cGVvZiBiLnRleHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRvdXQucHVzaCh7IHR5cGU6ICd0ZXh0JywgdGV4dDogYi50ZXh0IH0pO1xuXHRcdH0gZWxzZSBpZiAoYi50eXBlID09PSAndG9vbF9yZXN1bHQnICYmIHR5cGVvZiBiLnRvb2xfdXNlX2lkID09PSAnc3RyaW5nJykge1xuXHRcdFx0b3V0LnB1c2goeyB0eXBlOiAndG9vbF9yZXN1bHQnLCB0b29sX3VzZV9pZDogYi50b29sX3VzZV9pZCwgY29udGVudDogYi5jb250ZW50LCBpc19lcnJvcjogYi5pc19lcnJvciA9PT0gdHJ1ZSB9KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIG91dC5sZW5ndGggPiAwID8gb3V0IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiByZWFkQXNzaXN0YW50QmxvY2tzKHJhdzogdW5rbm93bik6IHJlYWRvbmx5IEFzc2lzdGFudEJsb2NrW10gfCB1bmRlZmluZWQge1xuXHRpZiAocmF3ID09PSBudWxsIHx8IHR5cGVvZiByYXcgIT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBjb250ZW50ID0gKHJhdyBhcyB7IGNvbnRlbnQ/OiB1bmtub3duIH0pLmNvbnRlbnQ7XG5cdGlmICghQXJyYXkuaXNBcnJheShjb250ZW50KSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgb3V0OiBBc3Npc3RhbnRCbG9ja1tdID0gW107XG5cdGZvciAoY29uc3QgYmxvY2sgb2YgY29udGVudCkge1xuXHRcdGlmIChibG9jayA9PT0gbnVsbCB8fCB0eXBlb2YgYmxvY2sgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgYiA9IGJsb2NrIGFzIHsgdHlwZT86IHVua25vd247IHRleHQ/OiB1bmtub3duOyB0aGlua2luZz86IHVua25vd247IGlkPzogdW5rbm93bjsgbmFtZT86IHVua25vd247IGlucHV0PzogdW5rbm93biB9O1xuXHRcdGlmICh0eXBlb2YgYi50eXBlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdG91dC5wdXNoKHtcblx0XHRcdHR5cGU6IGIudHlwZSxcblx0XHRcdHRleHQ6IHR5cGVvZiBiLnRleHQgPT09ICdzdHJpbmcnID8gYi50ZXh0IDogdW5kZWZpbmVkLFxuXHRcdFx0dGhpbmtpbmc6IHR5cGVvZiBiLnRoaW5raW5nID09PSAnc3RyaW5nJyA/IGIudGhpbmtpbmcgOiB1bmRlZmluZWQsXG5cdFx0XHRpZDogdHlwZW9mIGIuaWQgPT09ICdzdHJpbmcnID8gYi5pZCA6IHVuZGVmaW5lZCxcblx0XHRcdG5hbWU6IHR5cGVvZiBiLm5hbWUgPT09ICdzdHJpbmcnID8gYi5uYW1lIDogdW5kZWZpbmVkLFxuXHRcdFx0aW5wdXQ6IGIuaW5wdXQsXG5cdFx0fSk7XG5cdH1cblx0cmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gcmVhZFN5c3RlbVN1YnR5cGUocmF3OiB1bmtub3duKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKHJhdyA9PT0gbnVsbCB8fCB0eXBlb2YgcmF3ICE9PSAnb2JqZWN0Jykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgc3VidHlwZSA9IChyYXcgYXMgeyBzdWJ0eXBlPzogdW5rbm93biB9KS5zdWJ0eXBlO1xuXHRyZXR1cm4gdHlwZW9mIHN1YnR5cGUgPT09ICdzdHJpbmcnID8gc3VidHlwZSA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gcmVhZFN5c3RlbVRleHQocmF3OiB1bmtub3duKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKHJhdyA9PT0gbnVsbCB8fCB0eXBlb2YgcmF3ICE9PSAnb2JqZWN0Jykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgciA9IHJhdyBhcyB7IHRleHQ/OiB1bmtub3duOyBtZXNzYWdlPzogdW5rbm93biB9O1xuXHRpZiAodHlwZW9mIHIudGV4dCA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gci50ZXh0O1xuXHR9XG5cdGlmICh0eXBlb2Ygci5tZXNzYWdlID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiByLm1lc3NhZ2U7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBNaXJyb3Igb2YgdGhlIGxpdmUgbWFwcGVyJ3MgaGVscGVyIFx1MjAxNCBrZXB0IGlubGluZSBzbyB0aGUgdHdvIG1hcHBlcnNcbiAqIGRvbid0IHlldCBuZWVkIGEgc2hhcmVkIG1vZHVsZS4gSWYgYSB0aGlyZCBjb25zdW1lciBhcHBlYXJzLCBmYWN0b3JcbiAqIHRvIGBjbGF1ZGVUb29sUmVzdWx0Q29udGVudC50c2AuXG4gKi9cbmZ1bmN0aW9uIGV4dHJhY3RUb29sUmVzdWx0Q29udGVudChjb250ZW50OiB1bmtub3duKTogeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dDsgdGV4dDogc3RyaW5nIH1bXSB8IHVuZGVmaW5lZCB7XG5cdGlmICh0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gY29udGVudC5sZW5ndGggPiAwID8gW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IGNvbnRlbnQgfV0gOiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKCFBcnJheS5pc0FycmF5KGNvbnRlbnQpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBvdXQ6IHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQ7IHRleHQ6IHN0cmluZyB9W10gPSBbXTtcblx0Zm9yIChjb25zdCBibG9jayBvZiBjb250ZW50KSB7XG5cdFx0aWYgKGJsb2NrID09PSBudWxsIHx8IHR5cGVvZiBibG9jayAhPT0gJ29iamVjdCcpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBiID0gYmxvY2sgYXMgeyB0eXBlPzogdW5rbm93bjsgdGV4dD86IHVua25vd24gfTtcblx0XHRpZiAoYi50eXBlID09PSAndGV4dCcgJiYgdHlwZW9mIGIudGV4dCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdG91dC5wdXNoKHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IGIudGV4dCB9KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIG91dC5sZW5ndGggPiAwID8gb3V0IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBzYWZlU3RyaW5naWZ5KHY6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHR0cnkge1xuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh2KTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIFRydWUgd2hlbiB0aGUgbWVzc2FnZSBjb250ZW50IGlzIGEgQ0xJIHNsYXNoLWNvbW1hbmQgZWNobyAoZS5nLlxuICogYDxjb21tYW5kLW5hbWU+L21vZGVsPC9jb21tYW5kLW5hbWU+Li4uYCkgdGhhdCB0aGUgc3VicHJvY2VzcyB3cml0ZXNcbiAqIHRvIHRoZSB0cmFuc2NyaXB0IGZvciByZXN0b3JlIGZpZGVsaXR5IGJ1dCBpcyBub3QgYSB1c2VyLWF1dGhvcmVkIHByb21wdC5cbiAqIENoZWNrcyB0aGUgZmlyc3QgdGV4dCBmcmFnbWVudCBvbmx5OyBtaXhlZCBtZXNzYWdlcyB3aGVyZSB0aGUgZmlyc3RcbiAqIGNvbnRlbnQgYmxvY2sgaXMgYSByZWFsIHByb21wdCBhcmUgTk9UIGZpbHRlcmVkLlxuICovXG5mdW5jdGlvbiBpc0NsaUVjaG9Db250ZW50KGNvbnRlbnQ6IHN0cmluZyB8IFJlYWRvbmx5QXJyYXk8VXNlclRleHRCbG9jayB8IFVzZXJUb29sUmVzdWx0QmxvY2s+KTogYm9vbGVhbiB7XG5cdGlmICh0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gQ0xJX0VDSE9fTUFSS0VSX1BBVFRFUk4udGVzdChjb250ZW50KTtcblx0fVxuXHRjb25zdCBmaXJzdFRleHQgPSBjb250ZW50LmZpbmQoKGIpOiBiIGlzIFVzZXJUZXh0QmxvY2sgPT4gYi50eXBlID09PSAndGV4dCcpO1xuXHRyZXR1cm4gZmlyc3RUZXh0ICE9PSB1bmRlZmluZWQgJiYgQ0xJX0VDSE9fTUFSS0VSX1BBVFRFUk4udGVzdChmaXJzdFRleHQudGV4dCk7XG59XG5cbi8vICNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICJBQU9BLFNBQVMsZ0JBQWdCO0FBRXpCO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BT007QUFDUCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHFCQUFxQiw0QkFBNEIsMkJBQTJCLDBCQUEwQixnQ0FBZ0M7QUFDL0ksU0FBUyx5QkFBeUIsaUNBQWlDO0FB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
