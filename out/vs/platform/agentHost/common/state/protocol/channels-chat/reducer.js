import { ActionType } from "../common/actions.js";
import { TurnState, ToolCallStatus, ToolCallConfirmationReason, ToolCallCancellationReason, ToolCallContributorKind, ResponsePartKind, PendingMessageKind } from "./state.js";
import { SessionStatus } from "../channels-session/state.js";
import { softAssertNever } from "../common/reducer-helpers.js";
function tcBase(tc) {
  return {
    toolCallId: tc.toolCallId,
    toolName: tc.toolName,
    displayName: tc.displayName,
    intention: tc.intention,
    contributor: tc.contributor,
    _meta: tc._meta
  };
}
function tcBaseWithMeta(tc, meta) {
  return {
    ...tcBase(tc),
    _meta: meta ?? tc._meta
  };
}
function refineToolCallContributor(current, next, log) {
  if (!next) {
    return current;
  }
  if (current?.kind === ToolCallContributorKind.Client) {
    if (next.kind === ToolCallContributorKind.Client && next.clientId === current.clientId) {
      return next;
    }
    log?.(`Ignoring contributor change for client tool call from '${current.clientId}'`);
    return current;
  }
  if (next.kind === ToolCallContributorKind.Client) {
    log?.(`Ignoring late client contributor '${next.clientId}' because client execution ownership must be established at tool call start`);
    return current;
  }
  return next;
}
function resolveSelectedOption(options, id) {
  if (!id || !options) {
    return void 0;
  }
  return options.find((o) => o.id === id);
}
function hasBlockingToolCall(state) {
  if (!state.activeTurn) {
    return false;
  }
  return state.activeTurn.responseParts.some(
    (part) => part.kind === ResponsePartKind.ToolCall && (part.toolCall.status === ToolCallStatus.PendingConfirmation || part.toolCall.status === ToolCallStatus.PendingResultConfirmation || part.toolCall.status === ToolCallStatus.AuthRequired)
  );
}
function hasOpenInputRequest(state) {
  return state.activeTurn?.responseParts.some(
    (part) => part.kind === ResponsePartKind.InputRequest && part.response === void 0
  ) ?? false;
}
function findOpenInputRequestPart(responseParts, requestId) {
  const index = responseParts.findIndex(
    (part2) => part2.kind === ResponsePartKind.InputRequest && part2.response === void 0 && part2.request.id === requestId
  );
  if (index < 0) {
    return void 0;
  }
  const part = responseParts[index];
  return part.kind === ResponsePartKind.InputRequest ? { index, part } : void 0;
}
const STATUS_ACTIVITY_MASK = (1 << 5) - 1;
function withStatusFlag(status, flag, set) {
  return set ? status | flag : status & ~flag;
}
function summaryStatus(state, terminalStatus) {
  let activity;
  if (terminalStatus) {
    activity = terminalStatus;
  } else if (hasOpenInputRequest(state) || hasBlockingToolCall(state)) {
    activity = SessionStatus.InputNeeded;
  } else if (state.activeTurn) {
    activity = SessionStatus.InProgress;
  } else {
    activity = SessionStatus.Idle;
  }
  return state.status & ~STATUS_ACTIVITY_MASK | activity;
}
function refreshSummaryStatus(state) {
  const status = summaryStatus(state);
  if (status === state.status) {
    return state;
  }
  return { ...state, status };
}
function endTurn(state, turnId, turnState, duration, terminalStatus, error) {
  if (!state.activeTurn || state.activeTurn.id !== turnId) {
    return state;
  }
  const active = state.activeTurn;
  const responseParts = active.responseParts.map((part) => {
    if (part.kind !== ResponsePartKind.ToolCall) {
      return part;
    }
    const tc = part.toolCall;
    if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) {
      return part;
    }
    return {
      kind: ResponsePartKind.ToolCall,
      toolCall: {
        status: ToolCallStatus.Cancelled,
        ...tcBase(tc),
        invocationMessage: tc.status === ToolCallStatus.Streaming ? tc.invocationMessage ?? "" : tc.invocationMessage,
        toolInput: tc.status === ToolCallStatus.Streaming ? void 0 : tc.toolInput,
        reason: ToolCallCancellationReason.Skipped
      }
    };
  });
  const turn = {
    id: active.id,
    startedAt: active.startedAt,
    // Defensive clamp: the duration is producer-supplied and opaque to this
    // reducer, but a negative value would be nonsensical to display.
    duration: Math.max(0, duration),
    message: active.message,
    responseParts,
    usage: active.usage,
    state: turnState,
    error
  };
  const next = {
    ...state,
    turns: [...state.turns, turn],
    activeTurn: void 0,
    modifiedAt: new Date(Date.now()).toISOString()
  };
  return {
    ...next,
    status: summaryStatus(next, terminalStatus)
  };
}
function upsertInputRequestPart(state, request) {
  const activeTurn = state.activeTurn;
  if (!activeTurn) {
    return state;
  }
  const existing = findOpenInputRequestPart(activeTurn.responseParts, request.id);
  const responseParts = [...activeTurn.responseParts];
  const part = {
    kind: ResponsePartKind.InputRequest,
    request
  };
  if (existing) {
    part.request = {
      ...request,
      answers: request.answers ?? existing.part.request.answers
    };
    responseParts[existing.index] = part;
  } else {
    responseParts.push(part);
  }
  const next = {
    ...state,
    activeTurn: {
      ...activeTurn,
      responseParts
    }
  };
  return { ...next, status: withStatusFlag(summaryStatus(next), SessionStatus.IsRead, false), modifiedAt: new Date(Date.now()).toISOString() };
}
function updateToolCallInParts(state, turnId, toolCallId, updater) {
  const activeTurn = state.activeTurn;
  if (!activeTurn || activeTurn.id !== turnId) {
    return state;
  }
  let found = false;
  const responseParts = activeTurn.responseParts.map((part) => {
    if (part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === toolCallId) {
      const updated = updater(part.toolCall);
      if (updated === part.toolCall) {
        return part;
      }
      found = true;
      return { ...part, toolCall: updated };
    }
    return part;
  });
  if (!found) {
    return state;
  }
  return {
    ...state,
    activeTurn: { ...activeTurn, responseParts }
  };
}
function updateResponsePart(state, turnId, partId, updater) {
  const activeTurn = state.activeTurn;
  if (!activeTurn || activeTurn.id !== turnId) {
    return state;
  }
  let found = false;
  const responseParts = activeTurn.responseParts.map((part) => {
    if (!found) {
      const id = part.kind === ResponsePartKind.ToolCall ? part.toolCall.toolCallId : "id" in part ? part.id : void 0;
      if (id === partId) {
        found = true;
        return updater(part);
      }
    }
    return part;
  });
  if (!found) {
    return state;
  }
  return {
    ...state,
    activeTurn: { ...activeTurn, responseParts }
  };
}
function chatReducer(state, action, log) {
  switch (action.type) {
    // ── Turn Lifecycle ────────────────────────────────────────────────────
    case ActionType.ChatTurnStarted: {
      let next = {
        ...state,
        activeTurn: {
          id: action.turnId,
          startedAt: action.startedAt,
          message: action.message,
          responseParts: [],
          usage: void 0
        }
      };
      next = {
        ...next,
        status: withStatusFlag(summaryStatus(next), SessionStatus.IsRead, false),
        modifiedAt: new Date(Date.now()).toISOString()
      };
      if (action.queuedMessageId) {
        if (next.steeringMessage?.id === action.queuedMessageId) {
          next = { ...next, steeringMessage: void 0 };
        }
        if (next.queuedMessages) {
          const filtered = next.queuedMessages.filter((m) => m.id !== action.queuedMessageId);
          next = { ...next, queuedMessages: filtered.length > 0 ? filtered : void 0 };
        }
      }
      return next;
    }
    case ActionType.ChatDelta:
      return updateResponsePart(state, action.turnId, action.partId, (part) => {
        if (part.kind === ResponsePartKind.Markdown) {
          return { ...part, content: part.content + action.content };
        }
        return part;
      });
    case ActionType.ChatResponsePart:
      if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
        return state;
      }
      return {
        ...state,
        activeTurn: {
          ...state.activeTurn,
          responseParts: [...state.activeTurn.responseParts, action.part]
        }
      };
    case ActionType.ChatTurnComplete:
      return endTurn(state, action.turnId, TurnState.Complete, action.duration);
    case ActionType.ChatTurnCancelled:
      return endTurn(state, action.turnId, TurnState.Cancelled, action.duration);
    case ActionType.ChatError:
      return endTurn(state, action.turnId, TurnState.Error, action.duration, SessionStatus.Error, action.error);
    case ActionType.ChatActivityChanged:
      return { ...state, activity: action.activity };
    // ── Working Directories ───────────────────────────────────────────────
    case ActionType.ChatWorkingDirectorySet: {
      const list = state.workingDirectories ?? [];
      if (list.includes(action.directory)) {
        return state;
      }
      return { ...state, workingDirectories: [...list, action.directory] };
    }
    case ActionType.ChatWorkingDirectoryRemoved: {
      const list = state.workingDirectories;
      if (!list) {
        return state;
      }
      const idx = list.indexOf(action.directory);
      if (idx < 0) {
        return state;
      }
      const updated = list.slice();
      updated.splice(idx, 1);
      return { ...state, workingDirectories: updated };
    }
    // ── Tool Call State Machine ───────────────────────────────────────────
    case ActionType.ChatToolCallStart:
      if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
        return state;
      }
      return {
        ...state,
        activeTurn: {
          ...state.activeTurn,
          responseParts: [
            ...state.activeTurn.responseParts,
            {
              kind: ResponsePartKind.ToolCall,
              toolCall: {
                toolCallId: action.toolCallId,
                toolName: action.toolName,
                displayName: action.displayName,
                intention: action.intention,
                contributor: action.contributor,
                _meta: action._meta,
                status: ToolCallStatus.Streaming
              }
            }
          ]
        }
      };
    case ActionType.ChatToolCallDelta:
      return updateToolCallInParts(state, action.turnId, action.toolCallId, (tc) => {
        if (tc.status !== ToolCallStatus.Streaming) {
          return tc;
        }
        return {
          ...tc,
          ...action._meta !== void 0 ? { _meta: action._meta } : {},
          partialInput: (tc.partialInput ?? "") + action.content,
          invocationMessage: action.invocationMessage ?? tc.invocationMessage
        };
      });
    case ActionType.ChatToolCallReady:
      return refreshSummaryStatus(updateToolCallInParts(state, action.turnId, action.toolCallId, (tc) => {
        if (tc.status !== ToolCallStatus.Streaming && tc.status !== ToolCallStatus.Running && tc.status !== ToolCallStatus.PendingConfirmation) {
          return tc;
        }
        const base = {
          ...tcBaseWithMeta(tc, action._meta),
          contributor: refineToolCallContributor(tc.contributor, action.contributor, log),
          intention: action.intention ?? tc.intention
        };
        if (action.confirmed) {
          return {
            status: ToolCallStatus.Running,
            ...base,
            invocationMessage: action.invocationMessage,
            toolInput: action.toolInput,
            confirmed: action.confirmed
          };
        }
        const pending = tc.status === ToolCallStatus.PendingConfirmation ? tc : void 0;
        const options = action.options ?? pending?.options;
        return {
          status: ToolCallStatus.PendingConfirmation,
          ...base,
          invocationMessage: action.invocationMessage,
          toolInput: action.toolInput ?? pending?.toolInput,
          confirmationTitle: action.confirmationTitle ?? pending?.confirmationTitle,
          riskAssessment: action.riskAssessment ?? pending?.riskAssessment,
          edits: action.edits ?? pending?.edits,
          editable: action.editable ?? pending?.editable,
          ...options ? { options } : {}
        };
      }));
    case ActionType.ChatToolCallConfirmed:
      return refreshSummaryStatus(updateToolCallInParts(state, action.turnId, action.toolCallId, (tc) => {
        if (tc.status !== ToolCallStatus.PendingConfirmation) {
          return tc;
        }
        const base = tcBaseWithMeta(tc, action._meta);
        const selectedOption = resolveSelectedOption(tc.options, action.selectedOptionId);
        if (action.approved) {
          return {
            status: ToolCallStatus.Running,
            ...base,
            invocationMessage: tc.invocationMessage,
            toolInput: action.editedToolInput ?? tc.toolInput,
            confirmed: action.confirmed,
            ...selectedOption ? { selectedOption } : {}
          };
        }
        return {
          status: ToolCallStatus.Cancelled,
          ...base,
          invocationMessage: tc.invocationMessage,
          toolInput: tc.toolInput,
          reason: action.reason,
          reasonMessage: action.reasonMessage,
          userSuggestion: action.userSuggestion,
          ...selectedOption ? { selectedOption } : {}
        };
      }));
    case ActionType.ChatToolCallComplete:
      return refreshSummaryStatus(updateToolCallInParts(state, action.turnId, action.toolCallId, (tc) => {
        if (tc.status !== ToolCallStatus.Running && tc.status !== ToolCallStatus.PendingConfirmation && tc.status !== ToolCallStatus.AuthRequired) {
          return tc;
        }
        if (tc.status === ToolCallStatus.AuthRequired && action.result.success) {
          return tc;
        }
        const base = tcBaseWithMeta(tc, action._meta);
        const confirmed = tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.AuthRequired ? tc.confirmed : ToolCallConfirmationReason.NotNeeded;
        const selectedOption = tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.AuthRequired ? tc.selectedOption : void 0;
        const preAuthContent = tc.status === ToolCallStatus.AuthRequired ? tc.content : void 0;
        if (action.requiresResultConfirmation && tc.status !== ToolCallStatus.AuthRequired) {
          return {
            status: ToolCallStatus.PendingResultConfirmation,
            ...base,
            invocationMessage: tc.invocationMessage,
            toolInput: tc.toolInput,
            confirmed,
            ...selectedOption ? { selectedOption } : {},
            ...preAuthContent ? { content: preAuthContent } : {},
            ...action.result
          };
        }
        return {
          status: ToolCallStatus.Completed,
          ...base,
          invocationMessage: tc.invocationMessage,
          toolInput: tc.toolInput,
          confirmed,
          ...selectedOption ? { selectedOption } : {},
          ...preAuthContent ? { content: preAuthContent } : {},
          ...action.result
        };
      }));
    case ActionType.ChatToolCallResultConfirmed:
      return refreshSummaryStatus(updateToolCallInParts(state, action.turnId, action.toolCallId, (tc) => {
        if (tc.status !== ToolCallStatus.PendingResultConfirmation) {
          return tc;
        }
        const base = tcBaseWithMeta(tc, action._meta);
        if (action.approved) {
          return {
            status: ToolCallStatus.Completed,
            ...base,
            invocationMessage: tc.invocationMessage,
            toolInput: tc.toolInput,
            confirmed: tc.confirmed,
            ...tc.selectedOption ? { selectedOption: tc.selectedOption } : {},
            success: tc.success,
            pastTenseMessage: tc.pastTenseMessage,
            content: tc.content,
            structuredContent: tc.structuredContent,
            error: tc.error
          };
        }
        return {
          status: ToolCallStatus.Cancelled,
          ...base,
          invocationMessage: tc.invocationMessage,
          toolInput: tc.toolInput,
          reason: ToolCallCancellationReason.ResultDenied,
          ...tc.selectedOption ? { selectedOption: tc.selectedOption } : {}
        };
      }));
    case ActionType.ChatToolCallContentChanged:
      return updateToolCallInParts(state, action.turnId, action.toolCallId, (tc) => {
        if (tc.status !== ToolCallStatus.Running) {
          return tc;
        }
        return {
          ...tc,
          ...action._meta !== void 0 ? { _meta: action._meta } : {},
          content: action.content
        };
      });
    case ActionType.ChatToolCallAuthRequired:
      return refreshSummaryStatus(updateToolCallInParts(state, action.turnId, action.toolCallId, (tc) => {
        if (tc.status !== ToolCallStatus.Running) {
          return tc;
        }
        if (!tc.contributor || tc.contributor.kind !== ToolCallContributorKind.MCP) {
          return tc;
        }
        const base = tcBaseWithMeta(tc, action._meta);
        return {
          status: ToolCallStatus.AuthRequired,
          ...base,
          contributor: tc.contributor,
          invocationMessage: tc.invocationMessage,
          toolInput: tc.toolInput,
          confirmed: tc.confirmed,
          ...tc.selectedOption ? { selectedOption: tc.selectedOption } : {},
          ...tc.content ? { content: tc.content } : {},
          auth: action.auth
        };
      }));
    case ActionType.ChatToolCallAuthResolved:
      return refreshSummaryStatus(updateToolCallInParts(state, action.turnId, action.toolCallId, (tc) => {
        if (tc.status !== ToolCallStatus.AuthRequired) {
          return tc;
        }
        const base = tcBaseWithMeta(tc, action._meta);
        return {
          status: ToolCallStatus.Running,
          ...base,
          invocationMessage: tc.invocationMessage,
          toolInput: tc.toolInput,
          confirmed: tc.confirmed,
          ...tc.selectedOption ? { selectedOption: tc.selectedOption } : {},
          ...tc.content ? { content: tc.content } : {}
        };
      }));
    case ActionType.ChatUsage:
      if (!state.activeTurn || state.activeTurn.id !== action.turnId) {
        return state;
      }
      return {
        ...state,
        activeTurn: { ...state.activeTurn, usage: action.usage }
      };
    case ActionType.ChatReasoning:
      return updateResponsePart(state, action.turnId, action.partId, (part) => {
        if (part.kind === ResponsePartKind.Reasoning) {
          return { ...part, content: part.content + action.content };
        }
        return part;
      });
    // ── Truncation ────────────────────────────────────────────────────────
    case ActionType.ChatTruncated: {
      let turns;
      if (action.turnId === void 0) {
        turns = [];
      } else {
        const idx = state.turns.findIndex((t) => t.id === action.turnId);
        if (idx < 0) {
          return state;
        }
        turns = state.turns.slice(0, idx + 1);
      }
      const next = {
        ...state,
        turns,
        activeTurn: void 0,
        modifiedAt: new Date(Date.now()).toISOString()
      };
      if (action.turnId === void 0) {
        delete next.turnsNextCursor;
      }
      return {
        ...next,
        status: summaryStatus(next)
      };
    }
    case ActionType.ChatTurnsLoaded: {
      const existingIds = new Set(state.turns.map((turn) => turn.id));
      const olderTurns = action.turns.filter((turn) => !existingIds.has(turn.id));
      return {
        ...state,
        turns: [...olderTurns, ...state.turns],
        turnsNextCursor: action.turnsNextCursor
      };
    }
    // ── Session Input Requests ─────────────────────────────────────────────
    case ActionType.ChatInputRequested:
      return upsertInputRequestPart(state, action.request);
    case ActionType.ChatInputAnswerChanged: {
      const activeTurn = state.activeTurn;
      const existing = activeTurn ? findOpenInputRequestPart(activeTurn.responseParts, action.requestId) : void 0;
      if (!activeTurn || !existing) {
        return state;
      }
      const { index, part } = existing;
      const request = part.request;
      const answers = { ...request.answers ?? {} };
      if (action.answer === void 0) {
        delete answers[action.questionId];
      } else {
        answers[action.questionId] = action.answer;
      }
      const responseParts = [...activeTurn.responseParts];
      responseParts[index] = {
        ...part,
        request: {
          ...request,
          answers: Object.keys(answers).length > 0 ? answers : void 0
        }
      };
      return {
        ...state,
        activeTurn: {
          ...activeTurn,
          responseParts
        },
        modifiedAt: new Date(Date.now()).toISOString()
      };
    }
    case ActionType.ChatInputCompleted: {
      const activeTurn = state.activeTurn;
      const existing = activeTurn ? findOpenInputRequestPart(activeTurn.responseParts, action.requestId) : void 0;
      if (!activeTurn || !existing) {
        return state;
      }
      const { index, part } = existing;
      const finalAnswers = { ...part.request.answers ?? {}, ...action.answers ?? {} };
      const responseParts = [...activeTurn.responseParts];
      responseParts[index] = {
        ...part,
        request: {
          ...part.request,
          answers: Object.keys(finalAnswers).length > 0 ? finalAnswers : void 0
        },
        response: action.response
      };
      const next = {
        ...state,
        activeTurn: {
          ...activeTurn,
          responseParts
        }
      };
      return {
        ...next,
        status: summaryStatus(next),
        modifiedAt: new Date(Date.now()).toISOString()
      };
    }
    // ── Pending Messages ──────────────────────────────────────────────────
    case ActionType.ChatPendingMessageSet: {
      const entry = { id: action.id, message: action.message };
      if (action.kind === PendingMessageKind.Steering) {
        return { ...state, steeringMessage: entry };
      }
      const existing = state.queuedMessages ?? [];
      const idx = existing.findIndex((m) => m.id === action.id);
      if (idx >= 0) {
        const updated = [...existing];
        updated[idx] = entry;
        return { ...state, queuedMessages: updated };
      }
      return { ...state, queuedMessages: [...existing, entry] };
    }
    case ActionType.ChatPendingMessageRemoved: {
      if (action.kind === PendingMessageKind.Steering) {
        if (!state.steeringMessage || state.steeringMessage.id !== action.id) {
          return state;
        }
        return { ...state, steeringMessage: void 0 };
      }
      const existing = state.queuedMessages;
      if (!existing) {
        return state;
      }
      const filtered = existing.filter((m) => m.id !== action.id);
      return filtered.length === existing.length ? state : { ...state, queuedMessages: filtered.length > 0 ? filtered : void 0 };
    }
    case ActionType.ChatQueuedMessagesReordered: {
      const existing = state.queuedMessages;
      if (!existing) {
        return state;
      }
      const byId = new Map(existing.map((m) => [m.id, m]));
      const ordered = /* @__PURE__ */ new Set();
      const reordered = action.order.filter((id) => {
        if (byId.has(id) && !ordered.has(id)) {
          ordered.add(id);
          return true;
        }
        return false;
      }).map((id) => byId.get(id));
      for (const m of existing) {
        if (!ordered.has(m.id)) {
          reordered.push(m);
        }
      }
      return { ...state, queuedMessages: reordered };
    }
    // ── Draft ─────────────────────────────────────────────────────────────
    case ActionType.ChatDraftChanged:
      return { ...state, draft: action.draft };
    default:
      softAssertNever(action, log);
      return state;
  }
}
export {
  chatReducer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtY2hhdC9yZWR1Y2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLy8gYWxsb3ctYW55LXVuaWNvZGUtY29tbWVudC1maWxlXG4vLyBETyBOT1QgRURJVCAtLSBhdXRvLWdlbmVyYXRlZCBieSBzY3JpcHRzL3N5bmMtYWdlbnQtaG9zdC1wcm90b2NvbC50c1xuXG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgVHVyblN0YXRlLCBUb29sQ2FsbFN0YXR1cywgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sIFRvb2xDYWxsQ2FuY2VsbGF0aW9uUmVhc29uLCBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgUGVuZGluZ01lc3NhZ2VLaW5kLCB0eXBlIENoYXRTdGF0ZSwgdHlwZSBUb29sQ2FsbFN0YXRlLCB0eXBlIFJlc3BvbnNlUGFydCwgdHlwZSBUb29sQ2FsbFJlc3BvbnNlUGFydCwgdHlwZSBJbnB1dFJlcXVlc3RSZXNwb25zZVBhcnQsIHR5cGUgVHVybiwgdHlwZSBQZW5kaW5nTWVzc2FnZSwgdHlwZSBDb25maXJtYXRpb25PcHRpb24sIHR5cGUgVG9vbENhbGxDb250cmlidXRvciB9IGZyb20gJy4vc3RhdGUuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uL2NoYW5uZWxzLXNlc3Npb24vc3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBDaGF0QWN0aW9uIH0gZnJvbSAnLi4vYWN0aW9uLW9yaWdpbi5nZW5lcmF0ZWQuanMnO1xuaW1wb3J0IHsgc29mdEFzc2VydE5ldmVyIH0gZnJvbSAnLi4vY29tbW9uL3JlZHVjZXItaGVscGVycy5qcyc7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBIZWxwZXJzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG4vKiogRXh0cmFjdHMgdGhlIGNvbW1vbiBiYXNlIGZpZWxkcyBzaGFyZWQgYnkgYWxsIHRvb2wgY2FsbCBsaWZlY3ljbGUgc3RhdGVzLiAqL1xuZnVuY3Rpb24gdGNCYXNlKHRjOiBUb29sQ2FsbFN0YXRlKSB7XG5cdHJldHVybiB7XG5cdFx0dG9vbENhbGxJZDogdGMudG9vbENhbGxJZCxcblx0XHR0b29sTmFtZTogdGMudG9vbE5hbWUsXG5cdFx0ZGlzcGxheU5hbWU6IHRjLmRpc3BsYXlOYW1lLFxuXHRcdGludGVudGlvbjogdGMuaW50ZW50aW9uLFxuXHRcdGNvbnRyaWJ1dG9yOiB0Yy5jb250cmlidXRvcixcblx0XHRfbWV0YTogdGMuX21ldGEsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHRjQmFzZVdpdGhNZXRhKHRjOiBUb29sQ2FsbFN0YXRlLCBtZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCkge1xuXHRyZXR1cm4ge1xuXHRcdC4uLnRjQmFzZSh0YyksXG5cdFx0X21ldGE6IG1ldGEgPz8gdGMuX21ldGEsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHJlZmluZVRvb2xDYWxsQ29udHJpYnV0b3IoXG5cdGN1cnJlbnQ6IFRvb2xDYWxsQ29udHJpYnV0b3IgfCB1bmRlZmluZWQsXG5cdG5leHQ6IFRvb2xDYWxsQ29udHJpYnV0b3IgfCB1bmRlZmluZWQsXG5cdGxvZz86IChtc2c6IHN0cmluZykgPT4gdm9pZCxcbik6IFRvb2xDYWxsQ29udHJpYnV0b3IgfCB1bmRlZmluZWQge1xuXHRpZiAoIW5leHQpIHtcblx0XHRyZXR1cm4gY3VycmVudDtcblx0fVxuXHRpZiAoY3VycmVudD8ua2luZCA9PT0gVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50KSB7XG5cdFx0aWYgKG5leHQua2luZCA9PT0gVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50ICYmIG5leHQuY2xpZW50SWQgPT09IGN1cnJlbnQuY2xpZW50SWQpIHtcblx0XHRcdHJldHVybiBuZXh0O1xuXHRcdH1cblx0XHRsb2c/LihgSWdub3JpbmcgY29udHJpYnV0b3IgY2hhbmdlIGZvciBjbGllbnQgdG9vbCBjYWxsIGZyb20gJyR7Y3VycmVudC5jbGllbnRJZH0nYCk7XG5cdFx0cmV0dXJuIGN1cnJlbnQ7XG5cdH1cblx0aWYgKG5leHQua2luZCA9PT0gVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50KSB7XG5cdFx0bG9nPy4oYElnbm9yaW5nIGxhdGUgY2xpZW50IGNvbnRyaWJ1dG9yICcke25leHQuY2xpZW50SWR9JyBiZWNhdXNlIGNsaWVudCBleGVjdXRpb24gb3duZXJzaGlwIG11c3QgYmUgZXN0YWJsaXNoZWQgYXQgdG9vbCBjYWxsIHN0YXJ0YCk7XG5cdFx0cmV0dXJuIGN1cnJlbnQ7XG5cdH1cblx0cmV0dXJuIG5leHQ7XG59XG5cbi8qKiBSZXNvbHZlcyBhIHNlbGVjdGVkIG9wdGlvbiBmcm9tIHRoZSBjb25maXJtYXRpb24gb3B0aW9ucyBhcnJheSBieSBJRC4gKi9cbmZ1bmN0aW9uIHJlc29sdmVTZWxlY3RlZE9wdGlvbihvcHRpb25zOiBDb25maXJtYXRpb25PcHRpb25bXSB8IHVuZGVmaW5lZCwgaWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IENvbmZpcm1hdGlvbk9wdGlvbiB8IHVuZGVmaW5lZCB7XG5cdGlmICghaWQgfHwgIW9wdGlvbnMpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBvcHRpb25zLmZpbmQobyA9PiBvLmlkID09PSBpZCk7XG59XG5cbi8qKlxuICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGFjdGl2ZSB0dXJuIGhhcyBhbnkgdG9vbCBjYWxsIGJsb2NraW5nIG9uIHNvbWV0aGluZ1xuICogZXh0ZXJuYWwgdG8gdGhlIHR1cm4gaXRzZWxmIFx1MjAxNCBhIHBlbmRpbmcgY29uZmlybWF0aW9uL3Jlc3VsdC1jb25maXJtYXRpb24sXG4gKiBvciBhIHRvb2wgY2FsbCBwYXVzZWQgb24gTUNQIGF1dGhlbnRpY2F0aW9uLlxuICovXG5mdW5jdGlvbiBoYXNCbG9ja2luZ1Rvb2xDYWxsKHN0YXRlOiBDaGF0U3RhdGUpOiBib29sZWFuIHtcblx0aWYgKCFzdGF0ZS5hY3RpdmVUdXJuKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiBzdGF0ZS5hY3RpdmVUdXJuLnJlc3BvbnNlUGFydHMuc29tZShwYXJ0ID0+XG5cdFx0cGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsXG5cdFx0JiYgKHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uXG5cdFx0XHR8fCBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ1Jlc3VsdENvbmZpcm1hdGlvblxuXHRcdFx0fHwgcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkF1dGhSZXF1aXJlZCksXG5cdCk7XG59XG5cbi8qKiBSZXR1cm5zIHdoZXRoZXIgdGhlIGFjdGl2ZSB0dXJuIGNvbnRhaW5zIGFuIGlucHV0IHJlcXVlc3QgYXdhaXRpbmcgc3VibWlzc2lvbi4gKi9cbmZ1bmN0aW9uIGhhc09wZW5JbnB1dFJlcXVlc3Qoc3RhdGU6IENoYXRTdGF0ZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc3RhdGUuYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5zb21lKHBhcnQgPT5cblx0XHRwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuSW5wdXRSZXF1ZXN0ICYmIHBhcnQucmVzcG9uc2UgPT09IHVuZGVmaW5lZCxcblx0KSA/PyBmYWxzZTtcbn1cblxuZnVuY3Rpb24gZmluZE9wZW5JbnB1dFJlcXVlc3RQYXJ0KFxuXHRyZXNwb25zZVBhcnRzOiByZWFkb25seSBSZXNwb25zZVBhcnRbXSxcblx0cmVxdWVzdElkOiBzdHJpbmcsXG4pOiB7IGluZGV4OiBudW1iZXI7IHBhcnQ6IElucHV0UmVxdWVzdFJlc3BvbnNlUGFydCB9IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgaW5kZXggPSByZXNwb25zZVBhcnRzLmZpbmRJbmRleChwYXJ0ID0+XG5cdFx0cGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLklucHV0UmVxdWVzdFxuXHRcdCYmIHBhcnQucmVzcG9uc2UgPT09IHVuZGVmaW5lZFxuXHRcdCYmIHBhcnQucmVxdWVzdC5pZCA9PT0gcmVxdWVzdElkLFxuXHQpO1xuXHRpZiAoaW5kZXggPCAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBwYXJ0ID0gcmVzcG9uc2VQYXJ0c1tpbmRleF07XG5cdHJldHVybiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuSW5wdXRSZXF1ZXN0ID8geyBpbmRleCwgcGFydCB9IDogdW5kZWZpbmVkO1xufVxuXG4vKiogQml0bWFzayBjb3ZlcmluZyB0aGUgbXV0dWFsbHktZXhjbHVzaXZlIGFjdGl2aXR5IGJpdHMgKGJpdHMgMFx1MjAxMzQpLiAqL1xuY29uc3QgU1RBVFVTX0FDVElWSVRZX01BU0sgPSAoMSA8PCA1KSAtIDE7XG5cbi8qKiBTZXRzIG9yIGNsZWFycyBhIG1ldGFkYXRhIGZsYWcgb24gYSBzdGF0dXMgdmFsdWUuICovXG5mdW5jdGlvbiB3aXRoU3RhdHVzRmxhZyhzdGF0dXM6IFNlc3Npb25TdGF0dXMsIGZsYWc6IFNlc3Npb25TdGF0dXMsIHNldDogYm9vbGVhbik6IFNlc3Npb25TdGF0dXMge1xuXHRyZXR1cm4gc2V0ID8gc3RhdHVzIHwgZmxhZyA6IHN0YXR1cyAmIH5mbGFnO1xufVxuXG4vKiogRGVyaXZlcyB0aGUgc3VtbWFyeSBzdGF0dXMgZnJvbSBsaXZlIHNlc3Npb24gd29yaywgcHJlc2VydmluZyBvcnRob2dvbmFsIGZsYWdzLiAqL1xuZnVuY3Rpb24gc3VtbWFyeVN0YXR1cyhzdGF0ZTogQ2hhdFN0YXRlLCB0ZXJtaW5hbFN0YXR1cz86IFNlc3Npb25TdGF0dXMuRXJyb3IpOiBTZXNzaW9uU3RhdHVzIHtcblx0bGV0IGFjdGl2aXR5OiBTZXNzaW9uU3RhdHVzO1xuXHRpZiAodGVybWluYWxTdGF0dXMpIHtcblx0XHRhY3Rpdml0eSA9IHRlcm1pbmFsU3RhdHVzO1xuXHR9IGVsc2UgaWYgKGhhc09wZW5JbnB1dFJlcXVlc3Qoc3RhdGUpIHx8IGhhc0Jsb2NraW5nVG9vbENhbGwoc3RhdGUpKSB7XG5cdFx0YWN0aXZpdHkgPSBTZXNzaW9uU3RhdHVzLklucHV0TmVlZGVkO1xuXHR9IGVsc2UgaWYgKHN0YXRlLmFjdGl2ZVR1cm4pIHtcblx0XHRhY3Rpdml0eSA9IFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcztcblx0fSBlbHNlIHtcblx0XHRhY3Rpdml0eSA9IFNlc3Npb25TdGF0dXMuSWRsZTtcblx0fVxuXG5cdHJldHVybiBzdGF0ZS5zdGF0dXMgJiB+U1RBVFVTX0FDVElWSVRZX01BU0sgfCBhY3Rpdml0eTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgc3RhdGUgd2l0aCBgc3RhdHVzYCByZWNvbXB1dGVkLiBVc2UgdGhpcyBhZnRlciByZWR1Y2Vyc1xuICogdGhhdCBjaGFuZ2UgZGF0YSB3aGljaCBmZWVkcyBpbnRvIHtAbGluayBzdW1tYXJ5U3RhdHVzfSAoZS5nLiB0b29sIGNhbGxcbiAqIGxpZmVjeWNsZSB0cmFuc2l0aW9ucyB0aGF0IG1heSBlbnRlciBvciBsZWF2ZSBhIHBlbmRpbmctY29uZmlybWF0aW9uIHN0YXRlKS5cbiAqL1xuZnVuY3Rpb24gcmVmcmVzaFN1bW1hcnlTdGF0dXMoc3RhdGU6IENoYXRTdGF0ZSk6IENoYXRTdGF0ZSB7XG5cdGNvbnN0IHN0YXR1cyA9IHN1bW1hcnlTdGF0dXMoc3RhdGUpO1xuXHRpZiAoc3RhdHVzID09PSBzdGF0ZS5zdGF0dXMpIHtcblx0XHRyZXR1cm4gc3RhdGU7XG5cdH1cblx0cmV0dXJuIHsgLi4uc3RhdGUsIHN0YXR1cyB9O1xufVxuXG4vKipcbiAqIEVuZHMgdGhlIGFjdGl2ZSB0dXJuLCBmaW5hbGl6aW5nIGl0IGludG8gYSBjb21wbGV0ZWQgdHVybiByZWNvcmQuXG4gKlxuICogVG9vbCBjYWxsIHBhcnRzIHdpdGggbm9uLXRlcm1pbmFsIHN0YXRlcyBhcmUgZm9yY2VkIHRvIGNhbmNlbGxlZC5cbiAqIFBlbmRpbmcgcGVybWlzc2lvbnMgYXJlIHN0cmlwcGVkIGZyb20gdG9vbCBjYWxsIHBhcnRzLlxuICovXG5mdW5jdGlvbiBlbmRUdXJuKFxuXHRzdGF0ZTogQ2hhdFN0YXRlLFxuXHR0dXJuSWQ6IHN0cmluZyxcblx0dHVyblN0YXRlOiBUdXJuU3RhdGUsXG5cdGR1cmF0aW9uOiBudW1iZXIsXG5cdHRlcm1pbmFsU3RhdHVzPzogU2Vzc2lvblN0YXR1cy5FcnJvcixcblx0ZXJyb3I/OiB7IGVycm9yVHlwZTogc3RyaW5nOyBtZXNzYWdlOiBzdHJpbmc7IHN0YWNrPzogc3RyaW5nIH0sXG4pOiBDaGF0U3RhdGUge1xuXHRpZiAoIXN0YXRlLmFjdGl2ZVR1cm4gfHwgc3RhdGUuYWN0aXZlVHVybi5pZCAhPT0gdHVybklkKSB7XG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG5cdGNvbnN0IGFjdGl2ZSA9IHN0YXRlLmFjdGl2ZVR1cm47XG5cblx0Y29uc3QgcmVzcG9uc2VQYXJ0czogUmVzcG9uc2VQYXJ0W10gPSBhY3RpdmUucmVzcG9uc2VQYXJ0cy5tYXAocGFydCA9PiB7XG5cdFx0aWYgKHBhcnQua2luZCAhPT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCkge1xuXHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0fVxuXHRcdGNvbnN0IHRjID0gcGFydC50b29sQ2FsbDtcblx0XHRpZiAodGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgfHwgdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5DYW5jZWxsZWQpIHtcblx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdH1cblx0XHQvLyBGb3JjZSBub24tdGVybWluYWwgdG9vbCBjYWxscyBpbnRvIGNhbmNlbGxlZCBzdGF0ZVxuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLFxuXHRcdFx0dG9vbENhbGw6IHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5DYW5jZWxsZWQgYXMgY29uc3QsXG5cdFx0XHRcdC4uLnRjQmFzZSh0YyksXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyA/ICh0Yy5pbnZvY2F0aW9uTWVzc2FnZSA/PyAnJykgOiB0Yy5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0dG9vbElucHV0OiB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyA/IHVuZGVmaW5lZCA6IHRjLnRvb2xJbnB1dCxcblx0XHRcdFx0cmVhc29uOiBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbi5Ta2lwcGVkLFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9KTtcblxuXHRjb25zdCB0dXJuOiBUdXJuID0ge1xuXHRcdGlkOiBhY3RpdmUuaWQsXG5cdFx0c3RhcnRlZEF0OiBhY3RpdmUuc3RhcnRlZEF0LFxuXHRcdC8vIERlZmVuc2l2ZSBjbGFtcDogdGhlIGR1cmF0aW9uIGlzIHByb2R1Y2VyLXN1cHBsaWVkIGFuZCBvcGFxdWUgdG8gdGhpc1xuXHRcdC8vIHJlZHVjZXIsIGJ1dCBhIG5lZ2F0aXZlIHZhbHVlIHdvdWxkIGJlIG5vbnNlbnNpY2FsIHRvIGRpc3BsYXkuXG5cdFx0ZHVyYXRpb246IE1hdGgubWF4KDAsIGR1cmF0aW9uKSxcblx0XHRtZXNzYWdlOiBhY3RpdmUubWVzc2FnZSxcblx0XHRyZXNwb25zZVBhcnRzLFxuXHRcdHVzYWdlOiBhY3RpdmUudXNhZ2UsXG5cdFx0c3RhdGU6IHR1cm5TdGF0ZSxcblx0XHRlcnJvcixcblx0fTtcblxuXHRjb25zdCBuZXh0OiBDaGF0U3RhdGUgPSB7XG5cdFx0Li4uc3RhdGUsXG5cdFx0dHVybnM6IFsuLi5zdGF0ZS50dXJucywgdHVybl0sXG5cdFx0YWN0aXZlVHVybjogdW5kZWZpbmVkLFxuXHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKERhdGUubm93KCkpLnRvSVNPU3RyaW5nKCksXG5cdH07XG5cdHJldHVybiB7XG5cdFx0Li4ubmV4dCxcblx0XHRzdGF0dXM6IHN1bW1hcnlTdGF0dXMobmV4dCwgdGVybWluYWxTdGF0dXMpLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB1cHNlcnRJbnB1dFJlcXVlc3RQYXJ0KHN0YXRlOiBDaGF0U3RhdGUsIHJlcXVlc3Q6IElucHV0UmVxdWVzdFJlc3BvbnNlUGFydFsncmVxdWVzdCddKTogQ2hhdFN0YXRlIHtcblx0Y29uc3QgYWN0aXZlVHVybiA9IHN0YXRlLmFjdGl2ZVR1cm47XG5cdGlmICghYWN0aXZlVHVybikge1xuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXHRjb25zdCBleGlzdGluZyA9IGZpbmRPcGVuSW5wdXRSZXF1ZXN0UGFydChhY3RpdmVUdXJuLnJlc3BvbnNlUGFydHMsIHJlcXVlc3QuaWQpO1xuXHRjb25zdCByZXNwb25zZVBhcnRzID0gWy4uLmFjdGl2ZVR1cm4ucmVzcG9uc2VQYXJ0c107XG5cdGNvbnN0IHBhcnQ6IElucHV0UmVxdWVzdFJlc3BvbnNlUGFydCA9IHtcblx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLklucHV0UmVxdWVzdCxcblx0XHRyZXF1ZXN0LFxuXHR9O1xuXHRpZiAoZXhpc3RpbmcpIHtcblx0XHRwYXJ0LnJlcXVlc3QgPSB7XG5cdFx0XHQuLi5yZXF1ZXN0LFxuXHRcdFx0YW5zd2VyczogcmVxdWVzdC5hbnN3ZXJzID8/IGV4aXN0aW5nLnBhcnQucmVxdWVzdC5hbnN3ZXJzLFxuXHRcdH07XG5cdFx0cmVzcG9uc2VQYXJ0c1tleGlzdGluZy5pbmRleF0gPSBwYXJ0O1xuXHR9IGVsc2Uge1xuXHRcdHJlc3BvbnNlUGFydHMucHVzaChwYXJ0KTtcblx0fVxuXHRjb25zdCBuZXh0OiBDaGF0U3RhdGUgPSB7XG5cdFx0Li4uc3RhdGUsXG5cdFx0YWN0aXZlVHVybjoge1xuXHRcdFx0Li4uYWN0aXZlVHVybixcblx0XHRcdHJlc3BvbnNlUGFydHMsXG5cdFx0fSxcblx0fTtcblx0cmV0dXJuIHsgLi4ubmV4dCwgc3RhdHVzOiB3aXRoU3RhdHVzRmxhZyhzdW1tYXJ5U3RhdHVzKG5leHQpLCBTZXNzaW9uU3RhdHVzLklzUmVhZCwgZmFsc2UpLCBtb2RpZmllZEF0OiBuZXcgRGF0ZShEYXRlLm5vdygpKS50b0lTT1N0cmluZygpIH07XG59XG5cbi8qKlxuICogSW1tdXRhYmx5IHVwZGF0ZXMgdGhlIHRvb2wgY2FsbCBpbnNpZGUgYSBgVG9vbENhbGxgIHJlc3BvbnNlIHBhcnQgaW4gdGhlXG4gKiBhY3RpdmUgdHVybidzIGByZXNwb25zZVBhcnRzYCBhcnJheS4gUmV0dXJucyBgc3RhdGVgIHVuY2hhbmdlZCBpZiB0aGVcbiAqIGFjdGl2ZSB0dXJuIG9yIHRvb2wgY2FsbCBkb2Vzbid0IG1hdGNoLlxuICovXG5mdW5jdGlvbiB1cGRhdGVUb29sQ2FsbEluUGFydHMoXG5cdHN0YXRlOiBDaGF0U3RhdGUsXG5cdHR1cm5JZDogc3RyaW5nLFxuXHR0b29sQ2FsbElkOiBzdHJpbmcsXG5cdHVwZGF0ZXI6ICh0YzogVG9vbENhbGxTdGF0ZSkgPT4gVG9vbENhbGxTdGF0ZSxcbik6IENoYXRTdGF0ZSB7XG5cdGNvbnN0IGFjdGl2ZVR1cm4gPSBzdGF0ZS5hY3RpdmVUdXJuO1xuXHRpZiAoIWFjdGl2ZVR1cm4gfHwgYWN0aXZlVHVybi5pZCAhPT0gdHVybklkKSB7XG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG5cblx0bGV0IGZvdW5kID0gZmFsc2U7XG5cdGNvbnN0IHJlc3BvbnNlUGFydHMgPSBhY3RpdmVUdXJuLnJlc3BvbnNlUGFydHMubWFwKHBhcnQgPT4ge1xuXHRcdGlmIChwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcGFydC50b29sQ2FsbC50b29sQ2FsbElkID09PSB0b29sQ2FsbElkKSB7XG5cdFx0XHRjb25zdCB1cGRhdGVkID0gdXBkYXRlcihwYXJ0LnRvb2xDYWxsKTtcblx0XHRcdGlmICh1cGRhdGVkID09PSBwYXJ0LnRvb2xDYWxsKSB7XG5cdFx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdFx0fVxuXHRcdFx0Zm91bmQgPSB0cnVlO1xuXHRcdFx0cmV0dXJuIHsgLi4ucGFydCwgdG9vbENhbGw6IHVwZGF0ZWQgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHBhcnQ7XG5cdH0pO1xuXG5cdGlmICghZm91bmQpIHtcblx0XHRyZXR1cm4gc3RhdGU7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdC4uLnN0YXRlLFxuXHRcdGFjdGl2ZVR1cm46IHsgLi4uYWN0aXZlVHVybiwgcmVzcG9uc2VQYXJ0cyB9LFxuXHR9O1xufVxuXG4vKipcbiAqIEltbXV0YWJseSB1cGRhdGVzIGEgcmVzcG9uc2UgcGFydCBieSBgcGFydElkYCBpbiB0aGUgYWN0aXZlIHR1cm4uXG4gKiBGb3IgbWFya2Rvd24vcmVhc29uaW5nIHBhcnRzLCBtYXRjaGVzIG9uIGBpZGAuIEZvciB0b29sIGNhbGwgcGFydHMsXG4gKiBtYXRjaGVzIG9uIGB0b29sQ2FsbC50b29sQ2FsbElkYC5cbiAqL1xuZnVuY3Rpb24gdXBkYXRlUmVzcG9uc2VQYXJ0KFxuXHRzdGF0ZTogQ2hhdFN0YXRlLFxuXHR0dXJuSWQ6IHN0cmluZyxcblx0cGFydElkOiBzdHJpbmcsXG5cdHVwZGF0ZXI6IChwYXJ0OiBSZXNwb25zZVBhcnQpID0+IFJlc3BvbnNlUGFydCxcbik6IENoYXRTdGF0ZSB7XG5cdGNvbnN0IGFjdGl2ZVR1cm4gPSBzdGF0ZS5hY3RpdmVUdXJuO1xuXHRpZiAoIWFjdGl2ZVR1cm4gfHwgYWN0aXZlVHVybi5pZCAhPT0gdHVybklkKSB7XG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG5cblx0bGV0IGZvdW5kID0gZmFsc2U7XG5cdGNvbnN0IHJlc3BvbnNlUGFydHMgPSBhY3RpdmVUdXJuLnJlc3BvbnNlUGFydHMubWFwKHBhcnQgPT4ge1xuXHRcdGlmICghZm91bmQpIHtcblx0XHRcdGNvbnN0IGlkID0gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsXG5cdFx0XHRcdD8gcGFydC50b29sQ2FsbC50b29sQ2FsbElkXG5cdFx0XHRcdDogJ2lkJyBpbiBwYXJ0ID8gcGFydC5pZCA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChpZCA9PT0gcGFydElkKSB7XG5cdFx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIHVwZGF0ZXIocGFydCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBwYXJ0O1xuXHR9KTtcblxuXHRpZiAoIWZvdW5kKSB7XG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHQuLi5zdGF0ZSxcblx0XHRhY3RpdmVUdXJuOiB7IC4uLmFjdGl2ZVR1cm4sIHJlc3BvbnNlUGFydHMgfSxcblx0fTtcbn1cblxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgQ2hhdCBSZWR1Y2VyIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG4vKipcbiAqIFB1cmUgcmVkdWNlciBmb3IgY2hhdCBzdGF0ZS4gSGFuZGxlcyBhbGwge0BsaW5rIENoYXRBY3Rpb259IHZhcmlhbnRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2hhdFJlZHVjZXIoc3RhdGU6IENoYXRTdGF0ZSwgYWN0aW9uOiBDaGF0QWN0aW9uLCBsb2c/OiAobXNnOiBzdHJpbmcpID0+IHZvaWQpOiBDaGF0U3RhdGUge1xuXHRzd2l0Y2ggKGFjdGlvbi50eXBlKSB7XG5cdFx0Ly8gXHUyNTAwXHUyNTAwIFR1cm4gTGlmZWN5Y2xlIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZDoge1xuXHRcdFx0bGV0IG5leHQ6IENoYXRTdGF0ZSA9IHtcblx0XHRcdFx0Li4uc3RhdGUsXG5cdFx0XHRcdGFjdGl2ZVR1cm46IHtcblx0XHRcdFx0XHRpZDogYWN0aW9uLnR1cm5JZCxcblx0XHRcdFx0XHRzdGFydGVkQXQ6IGFjdGlvbi5zdGFydGVkQXQsXG5cdFx0XHRcdFx0bWVzc2FnZTogYWN0aW9uLm1lc3NhZ2UsXG5cdFx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW10sXG5cdFx0XHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRuZXh0ID0ge1xuXHRcdFx0XHQuLi5uZXh0LFxuXHRcdFx0XHRzdGF0dXM6IHdpdGhTdGF0dXNGbGFnKHN1bW1hcnlTdGF0dXMobmV4dCksIFNlc3Npb25TdGF0dXMuSXNSZWFkLCBmYWxzZSksXG5cdFx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKERhdGUubm93KCkpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBJZiB0aGlzIHR1cm4gd2FzIGF1dG8tc3RhcnRlZCBmcm9tIGEgcGVuZGluZyBtZXNzYWdlLCByZW1vdmUgaXRcblx0XHRcdGlmIChhY3Rpb24ucXVldWVkTWVzc2FnZUlkKSB7XG5cdFx0XHRcdGlmIChuZXh0LnN0ZWVyaW5nTWVzc2FnZT8uaWQgPT09IGFjdGlvbi5xdWV1ZWRNZXNzYWdlSWQpIHtcblx0XHRcdFx0XHRuZXh0ID0geyAuLi5uZXh0LCBzdGVlcmluZ01lc3NhZ2U6IHVuZGVmaW5lZCB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChuZXh0LnF1ZXVlZE1lc3NhZ2VzKSB7XG5cdFx0XHRcdFx0Y29uc3QgZmlsdGVyZWQgPSBuZXh0LnF1ZXVlZE1lc3NhZ2VzLmZpbHRlcihtID0+IG0uaWQgIT09IGFjdGlvbi5xdWV1ZWRNZXNzYWdlSWQpO1xuXHRcdFx0XHRcdG5leHQgPSB7IC4uLm5leHQsIHF1ZXVlZE1lc3NhZ2VzOiBmaWx0ZXJlZC5sZW5ndGggPiAwID8gZmlsdGVyZWQgOiB1bmRlZmluZWQgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbmV4dDtcblx0XHR9XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdERlbHRhOlxuXHRcdFx0cmV0dXJuIHVwZGF0ZVJlc3BvbnNlUGFydChzdGF0ZSwgYWN0aW9uLnR1cm5JZCwgYWN0aW9uLnBhcnRJZCwgcGFydCA9PiB7XG5cdFx0XHRcdGlmIChwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24pIHtcblx0XHRcdFx0XHRyZXR1cm4geyAuLi5wYXJ0LCBjb250ZW50OiBwYXJ0LmNvbnRlbnQgKyBhY3Rpb24uY29udGVudCB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdFx0fSk7XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydDpcblx0XHRcdGlmICghc3RhdGUuYWN0aXZlVHVybiB8fCBzdGF0ZS5hY3RpdmVUdXJuLmlkICE9PSBhY3Rpb24udHVybklkKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnN0YXRlLFxuXHRcdFx0XHRhY3RpdmVUdXJuOiB7XG5cdFx0XHRcdFx0Li4uc3RhdGUuYWN0aXZlVHVybixcblx0XHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbLi4uc3RhdGUuYWN0aXZlVHVybi5yZXNwb25zZVBhcnRzLCBhY3Rpb24ucGFydF0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGU6XG5cdFx0XHRyZXR1cm4gZW5kVHVybihzdGF0ZSwgYWN0aW9uLnR1cm5JZCwgVHVyblN0YXRlLkNvbXBsZXRlLCBhY3Rpb24uZHVyYXRpb24pO1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkOlxuXHRcdFx0cmV0dXJuIGVuZFR1cm4oc3RhdGUsIGFjdGlvbi50dXJuSWQsIFR1cm5TdGF0ZS5DYW5jZWxsZWQsIGFjdGlvbi5kdXJhdGlvbik7XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdEVycm9yOlxuXHRcdFx0cmV0dXJuIGVuZFR1cm4oc3RhdGUsIGFjdGlvbi50dXJuSWQsIFR1cm5TdGF0ZS5FcnJvciwgYWN0aW9uLmR1cmF0aW9uLCBTZXNzaW9uU3RhdHVzLkVycm9yLCBhY3Rpb24uZXJyb3IpO1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRBY3Rpdml0eUNoYW5nZWQ6XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgYWN0aXZpdHk6IGFjdGlvbi5hY3Rpdml0eSB9O1xuXG5cdFx0Ly8gXHUyNTAwXHUyNTAwIFdvcmtpbmcgRGlyZWN0b3JpZXMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFdvcmtpbmdEaXJlY3RvcnlTZXQ6IHtcblx0XHRcdGNvbnN0IGxpc3QgPSBzdGF0ZS53b3JraW5nRGlyZWN0b3JpZXMgPz8gW107XG5cdFx0XHRpZiAobGlzdC5pbmNsdWRlcyhhY3Rpb24uZGlyZWN0b3J5KSkge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgd29ya2luZ0RpcmVjdG9yaWVzOiBbLi4ubGlzdCwgYWN0aW9uLmRpcmVjdG9yeV0gfTtcblx0XHR9XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFdvcmtpbmdEaXJlY3RvcnlSZW1vdmVkOiB7XG5cdFx0XHRjb25zdCBsaXN0ID0gc3RhdGUud29ya2luZ0RpcmVjdG9yaWVzO1xuXHRcdFx0aWYgKCFsaXN0KSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlkeCA9IGxpc3QuaW5kZXhPZihhY3Rpb24uZGlyZWN0b3J5KTtcblx0XHRcdGlmIChpZHggPCAwKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHVwZGF0ZWQgPSBsaXN0LnNsaWNlKCk7XG5cdFx0XHR1cGRhdGVkLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIHdvcmtpbmdEaXJlY3RvcmllczogdXBkYXRlZCB9O1xuXHRcdH1cblxuXHRcdC8vIFx1MjUwMFx1MjUwMCBUb29sIENhbGwgU3RhdGUgTWFjaGluZSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydDpcblx0XHRcdGlmICghc3RhdGUuYWN0aXZlVHVybiB8fCBzdGF0ZS5hY3RpdmVUdXJuLmlkICE9PSBhY3Rpb24udHVybklkKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnN0YXRlLFxuXHRcdFx0XHRhY3RpdmVUdXJuOiB7XG5cdFx0XHRcdFx0Li4uc3RhdGUuYWN0aXZlVHVybixcblx0XHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbXG5cdFx0XHRcdFx0XHQuLi5zdGF0ZS5hY3RpdmVUdXJuLnJlc3BvbnNlUGFydHMsXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsXG5cdFx0XHRcdFx0XHRcdHRvb2xDYWxsOiB7XG5cdFx0XHRcdFx0XHRcdFx0dG9vbENhbGxJZDogYWN0aW9uLnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0XHRcdFx0dG9vbE5hbWU6IGFjdGlvbi50b29sTmFtZSxcblx0XHRcdFx0XHRcdFx0XHRkaXNwbGF5TmFtZTogYWN0aW9uLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdFx0XHRcdGludGVudGlvbjogYWN0aW9uLmludGVudGlvbixcblx0XHRcdFx0XHRcdFx0XHRjb250cmlidXRvcjogYWN0aW9uLmNvbnRyaWJ1dG9yLFxuXHRcdFx0XHRcdFx0XHRcdF9tZXRhOiBhY3Rpb24uX21ldGEsXG5cdFx0XHRcdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9IHNhdGlzZmllcyBUb29sQ2FsbFJlc3BvbnNlUGFydCxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YTpcblx0XHRcdHJldHVybiB1cGRhdGVUb29sQ2FsbEluUGFydHMoc3RhdGUsIGFjdGlvbi50dXJuSWQsIGFjdGlvbi50b29sQ2FsbElkLCB0YyA9PiB7XG5cdFx0XHRcdGlmICh0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZykge1xuXHRcdFx0XHRcdHJldHVybiB0Yztcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLnRjLFxuXHRcdFx0XHRcdC4uLihhY3Rpb24uX21ldGEgIT09IHVuZGVmaW5lZCA/IHsgX21ldGE6IGFjdGlvbi5fbWV0YSB9IDoge30pLFxuXHRcdFx0XHRcdHBhcnRpYWxJbnB1dDogKHRjLnBhcnRpYWxJbnB1dCA/PyAnJykgKyBhY3Rpb24uY29udGVudCxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogYWN0aW9uLmludm9jYXRpb25NZXNzYWdlID8/IHRjLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHk6XG5cdFx0XHRyZXR1cm4gcmVmcmVzaFN1bW1hcnlTdGF0dXModXBkYXRlVG9vbENhbGxJblBhcnRzKHN0YXRlLCBhY3Rpb24udHVybklkLCBhY3Rpb24udG9vbENhbGxJZCwgdGMgPT4ge1xuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0dGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmdcblx0XHRcdFx0XHQmJiB0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmdcblx0XHRcdFx0XHQmJiB0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb25cblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRjO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGJhc2UgPSB7XG5cdFx0XHRcdFx0Li4udGNCYXNlV2l0aE1ldGEodGMsIGFjdGlvbi5fbWV0YSksXG5cdFx0XHRcdFx0Y29udHJpYnV0b3I6IHJlZmluZVRvb2xDYWxsQ29udHJpYnV0b3IodGMuY29udHJpYnV0b3IsIGFjdGlvbi5jb250cmlidXRvciwgbG9nKSxcblx0XHRcdFx0XHRpbnRlbnRpb246IGFjdGlvbi5pbnRlbnRpb24gPz8gdGMuaW50ZW50aW9uLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRpZiAoYWN0aW9uLmNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGFjdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0XHRcdHRvb2xJbnB1dDogYWN0aW9uLnRvb2xJbnB1dCxcblx0XHRcdFx0XHRcdGNvbmZpcm1lZDogYWN0aW9uLmNvbmZpcm1lZCxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHBlbmRpbmcgPSB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24gPyB0YyA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3Qgb3B0aW9ucyA9IGFjdGlvbi5vcHRpb25zID8/IHBlbmRpbmc/Lm9wdGlvbnM7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGFjdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0XHR0b29sSW5wdXQ6IGFjdGlvbi50b29sSW5wdXQgPz8gcGVuZGluZz8udG9vbElucHV0LFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiBhY3Rpb24uY29uZmlybWF0aW9uVGl0bGUgPz8gcGVuZGluZz8uY29uZmlybWF0aW9uVGl0bGUsXG5cdFx0XHRcdFx0cmlza0Fzc2Vzc21lbnQ6IGFjdGlvbi5yaXNrQXNzZXNzbWVudCA/PyBwZW5kaW5nPy5yaXNrQXNzZXNzbWVudCxcblx0XHRcdFx0XHRlZGl0czogYWN0aW9uLmVkaXRzID8/IHBlbmRpbmc/LmVkaXRzLFxuXHRcdFx0XHRcdGVkaXRhYmxlOiBhY3Rpb24uZWRpdGFibGUgPz8gcGVuZGluZz8uZWRpdGFibGUsXG5cdFx0XHRcdFx0Li4uKG9wdGlvbnMgPyB7IG9wdGlvbnMgfSA6IHt9KSxcblx0XHRcdFx0fTtcblx0XHRcdH0pKTtcblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQ6XG5cdFx0XHRyZXR1cm4gcmVmcmVzaFN1bW1hcnlTdGF0dXModXBkYXRlVG9vbENhbGxJblBhcnRzKHN0YXRlLCBhY3Rpb24udHVybklkLCBhY3Rpb24udG9vbENhbGxJZCwgdGMgPT4ge1xuXHRcdFx0XHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRjO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGJhc2UgPSB0Y0Jhc2VXaXRoTWV0YSh0YywgYWN0aW9uLl9tZXRhKTtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRPcHRpb24gPSByZXNvbHZlU2VsZWN0ZWRPcHRpb24odGMub3B0aW9ucywgYWN0aW9uLnNlbGVjdGVkT3B0aW9uSWQpO1xuXHRcdFx0XHRpZiAoYWN0aW9uLmFwcHJvdmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZyxcblx0XHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogdGMuaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdFx0XHR0b29sSW5wdXQ6IGFjdGlvbi5lZGl0ZWRUb29sSW5wdXQgPz8gdGMudG9vbElucHV0LFxuXHRcdFx0XHRcdFx0Y29uZmlybWVkOiBhY3Rpb24uY29uZmlybWVkLFxuXHRcdFx0XHRcdFx0Li4uKHNlbGVjdGVkT3B0aW9uID8geyBzZWxlY3RlZE9wdGlvbiB9IDoge30pLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNhbmNlbGxlZCxcblx0XHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiB0Yy5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0XHR0b29sSW5wdXQ6IHRjLnRvb2xJbnB1dCxcblx0XHRcdFx0XHRyZWFzb246IGFjdGlvbi5yZWFzb24sXG5cdFx0XHRcdFx0cmVhc29uTWVzc2FnZTogYWN0aW9uLnJlYXNvbk1lc3NhZ2UsXG5cdFx0XHRcdFx0dXNlclN1Z2dlc3Rpb246IGFjdGlvbi51c2VyU3VnZ2VzdGlvbixcblx0XHRcdFx0XHQuLi4oc2VsZWN0ZWRPcHRpb24gPyB7IHNlbGVjdGVkT3B0aW9uIH0gOiB7fSksXG5cdFx0XHRcdH07XG5cdFx0XHR9KSk7XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGU6XG5cdFx0XHRyZXR1cm4gcmVmcmVzaFN1bW1hcnlTdGF0dXModXBkYXRlVG9vbENhbGxJblBhcnRzKHN0YXRlLCBhY3Rpb24udHVybklkLCBhY3Rpb24udG9vbENhbGxJZCwgdGMgPT4ge1xuXHRcdFx0XHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nICYmIHRjLnN0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbiAmJiB0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLkF1dGhSZXF1aXJlZCkge1xuXHRcdFx0XHRcdHJldHVybiB0Yztcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBBIHRvb2wgY2FsbCBpbiBgYXV0aC1yZXF1aXJlZGAgY2FuIG9ubHkgYmUgY29tcGxldGVkIHdpdGggYSBmYWlsZWRcblx0XHRcdFx0Ly8gcmVzdWx0IFx1MjAxNCB0aGF0J3MgdGhlIGNsaWVudCBjYW5jZWxsaW5nIHRoZSBpbnZvY2F0aW9uIGluc3RlYWQgb2Zcblx0XHRcdFx0Ly8gcmVzb2x2aW5nIHRoZSBwZW5kaW5nIE1DUCBhdXRoZW50aWNhdGlvbiBjaGFsbGVuZ2UuIEEgKnN1Y2Nlc3NmdWwqXG5cdFx0XHRcdC8vIGNvbXBsZXRpb24gZnJvbSBgYXV0aC1yZXF1aXJlZGAgaXMgaW52YWxpZDogZXhlY3V0aW9uIG5ldmVyXG5cdFx0XHRcdC8vIHJlc3VtZWQgYWZ0ZXIgdGhlIGNoYWxsZW5nZSwgc28gdGhlcmUncyBub3RoaW5nIHRoYXQgY291bGQgaGF2ZVxuXHRcdFx0XHQvLyBwcm9kdWNlZCBhIHJlYWwgcmVzdWx0LiBUaGUgcmVkdWNlciBpZ25vcmVzIGl0LCBsZWF2aW5nIHRoZSB0b29sXG5cdFx0XHRcdC8vIGNhbGwgaW4gYGF1dGgtcmVxdWlyZWRgOyB0aGUgY2xpZW50IG11c3QgcmVzb2x2ZSB0aGUgYXV0aFxuXHRcdFx0XHQvLyBjaGFsbGVuZ2UgKGBjaGF0L3Rvb2xDYWxsQXV0aFJlc29sdmVkYCkgYmVmb3JlIGNvbXBsZXRpbmdcblx0XHRcdFx0Ly8gc3VjY2Vzc2Z1bGx5LlxuXHRcdFx0XHRpZiAodGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5BdXRoUmVxdWlyZWQgJiYgYWN0aW9uLnJlc3VsdC5zdWNjZXNzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRjO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGJhc2UgPSB0Y0Jhc2VXaXRoTWV0YSh0YywgYWN0aW9uLl9tZXRhKTtcblx0XHRcdFx0Y29uc3QgY29uZmlybWVkID0gdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nIHx8IHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQXV0aFJlcXVpcmVkXG5cdFx0XHRcdFx0PyB0Yy5jb25maXJtZWRcblx0XHRcdFx0XHQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZDtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRPcHRpb24gPSB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcgfHwgdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5BdXRoUmVxdWlyZWRcblx0XHRcdFx0XHQ/IHRjLnNlbGVjdGVkT3B0aW9uXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdC8vIFByZXNlcnZlIGFueSBwYXJ0aWFsIGNvbnRlbnQgcHJvZHVjZWQgYmVmb3JlIHRoZSBjYWxsIHBhdXNlZCBmb3Jcblx0XHRcdFx0Ly8gYXV0aCBcdTIwMTQgYSBjbGllbnQgY2FuY2VsbGluZyBmcm9tIGBhdXRoLXJlcXVpcmVkYCB3aXRob3V0XG5cdFx0XHRcdC8vIGF1dGhlbnRpY2F0aW5nIG5ldmVyIHJlc3VtZXMgZXhlY3V0aW9uLCBzbyB0aGlzIGlzIHRoZSBvbmx5XG5cdFx0XHRcdC8vIGNvbnRlbnQgdGhlIHRvb2wgZXZlciBwcm9kdWNlZCB1bmxlc3MgYGFjdGlvbi5yZXN1bHRgIG92ZXJyaWRlcyBpdC5cblx0XHRcdFx0Y29uc3QgcHJlQXV0aENvbnRlbnQgPSB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkF1dGhSZXF1aXJlZCA/IHRjLmNvbnRlbnQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdC8vIENhbmNlbGxpbmcgZnJvbSBgYXV0aC1yZXF1aXJlZGAgYWx3YXlzIGNvbXBsZXRlcyB0ZXJtaW5hbGx5OiB0aGVcblx0XHRcdFx0Ly8gcGVuZGluZyBhdXRoIGNoYWxsZW5nZSBpc24ndCBhIFwicGVuZGluZyByZXN1bHRcIiB0aGUgY2xpZW50IGNhblxuXHRcdFx0XHQvLyByZXZpZXcsIHNvIGByZXF1aXJlc1Jlc3VsdENvbmZpcm1hdGlvbmAgaXMgaWdub3JlZCBmb3IgdGhpcyBwYXRoIFx1MjAxNFxuXHRcdFx0XHQvLyBpdCBtdXN0IG5ldmVyIGVudGVyIGBwZW5kaW5nLXJlc3VsdC1jb25maXJtYXRpb25gLlxuXHRcdFx0XHRpZiAoYWN0aW9uLnJlcXVpcmVzUmVzdWx0Q29uZmlybWF0aW9uICYmIHRjLnN0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuQXV0aFJlcXVpcmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ1Jlc3VsdENvbmZpcm1hdGlvbixcblx0XHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogdGMuaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdFx0XHR0b29sSW5wdXQ6IHRjLnRvb2xJbnB1dCxcblx0XHRcdFx0XHRcdGNvbmZpcm1lZCxcblx0XHRcdFx0XHRcdC4uLihzZWxlY3RlZE9wdGlvbiA/IHsgc2VsZWN0ZWRPcHRpb24gfSA6IHt9KSxcblx0XHRcdFx0XHRcdC4uLihwcmVBdXRoQ29udGVudCA/IHsgY29udGVudDogcHJlQXV0aENvbnRlbnQgfSA6IHt9KSxcblx0XHRcdFx0XHRcdC4uLmFjdGlvbi5yZXN1bHQsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHRjLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHRcdHRvb2xJbnB1dDogdGMudG9vbElucHV0LFxuXHRcdFx0XHRcdGNvbmZpcm1lZCxcblx0XHRcdFx0XHQuLi4oc2VsZWN0ZWRPcHRpb24gPyB7IHNlbGVjdGVkT3B0aW9uIH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKHByZUF1dGhDb250ZW50ID8geyBjb250ZW50OiBwcmVBdXRoQ29udGVudCB9IDoge30pLFxuXHRcdFx0XHRcdC4uLmFjdGlvbi5yZXN1bHQsXG5cdFx0XHRcdH07XG5cdFx0XHR9KSk7XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVzdWx0Q29uZmlybWVkOlxuXHRcdFx0cmV0dXJuIHJlZnJlc2hTdW1tYXJ5U3RhdHVzKHVwZGF0ZVRvb2xDYWxsSW5QYXJ0cyhzdGF0ZSwgYWN0aW9uLnR1cm5JZCwgYWN0aW9uLnRvb2xDYWxsSWQsIHRjID0+IHtcblx0XHRcdFx0aWYgKHRjLnN0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ1Jlc3VsdENvbmZpcm1hdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiB0Yztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBiYXNlID0gdGNCYXNlV2l0aE1ldGEodGMsIGFjdGlvbi5fbWV0YSk7XG5cdFx0XHRcdGlmIChhY3Rpb24uYXBwcm92ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHRjLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHRcdFx0dG9vbElucHV0OiB0Yy50b29sSW5wdXQsXG5cdFx0XHRcdFx0XHRjb25maXJtZWQ6IHRjLmNvbmZpcm1lZCxcblx0XHRcdFx0XHRcdC4uLih0Yy5zZWxlY3RlZE9wdGlvbiA/IHsgc2VsZWN0ZWRPcHRpb246IHRjLnNlbGVjdGVkT3B0aW9uIH0gOiB7fSksXG5cdFx0XHRcdFx0XHRzdWNjZXNzOiB0Yy5zdWNjZXNzLFxuXHRcdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogdGMucGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IHRjLmNvbnRlbnQsXG5cdFx0XHRcdFx0XHRzdHJ1Y3R1cmVkQ29udGVudDogdGMuc3RydWN0dXJlZENvbnRlbnQsXG5cdFx0XHRcdFx0XHRlcnJvcjogdGMuZXJyb3IsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ2FuY2VsbGVkLFxuXHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHRjLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHRcdHRvb2xJbnB1dDogdGMudG9vbElucHV0LFxuXHRcdFx0XHRcdHJlYXNvbjogVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24uUmVzdWx0RGVuaWVkLFxuXHRcdFx0XHRcdC4uLih0Yy5zZWxlY3RlZE9wdGlvbiA/IHsgc2VsZWN0ZWRPcHRpb246IHRjLnNlbGVjdGVkT3B0aW9uIH0gOiB7fSksXG5cdFx0XHRcdH07XG5cdFx0XHR9KSk7XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29udGVudENoYW5nZWQ6XG5cdFx0XHRyZXR1cm4gdXBkYXRlVG9vbENhbGxJblBhcnRzKHN0YXRlLCBhY3Rpb24udHVybklkLCBhY3Rpb24udG9vbENhbGxJZCwgdGMgPT4ge1xuXHRcdFx0XHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRjO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4udGMsXG5cdFx0XHRcdFx0Li4uKGFjdGlvbi5fbWV0YSAhPT0gdW5kZWZpbmVkID8geyBfbWV0YTogYWN0aW9uLl9tZXRhIH0gOiB7fSksXG5cdFx0XHRcdFx0Y29udGVudDogYWN0aW9uLmNvbnRlbnQsXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxBdXRoUmVxdWlyZWQ6XG5cdFx0XHRyZXR1cm4gcmVmcmVzaFN1bW1hcnlTdGF0dXModXBkYXRlVG9vbENhbGxJblBhcnRzKHN0YXRlLCBhY3Rpb24udHVybklkLCBhY3Rpb24udG9vbENhbGxJZCwgdGMgPT4ge1xuXHRcdFx0XHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRjO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEludmFyaWFudDogYXV0aC1yZXF1aXJlZCBvbmx5IGFwcGxpZXMgdG8gTUNQLWNvbnRyaWJ1dGVkIHRvb2wgY2FsbHMuXG5cdFx0XHRcdGlmICghdGMuY29udHJpYnV0b3IgfHwgdGMuY29udHJpYnV0b3Iua2luZCAhPT0gVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRjO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGJhc2UgPSB0Y0Jhc2VXaXRoTWV0YSh0YywgYWN0aW9uLl9tZXRhKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkF1dGhSZXF1aXJlZCxcblx0XHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRcdGNvbnRyaWJ1dG9yOiB0Yy5jb250cmlidXRvcixcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogdGMuaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdFx0dG9vbElucHV0OiB0Yy50b29sSW5wdXQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiB0Yy5jb25maXJtZWQsXG5cdFx0XHRcdFx0Li4uKHRjLnNlbGVjdGVkT3B0aW9uID8geyBzZWxlY3RlZE9wdGlvbjogdGMuc2VsZWN0ZWRPcHRpb24gfSA6IHt9KSxcblx0XHRcdFx0XHQuLi4odGMuY29udGVudCA/IHsgY29udGVudDogdGMuY29udGVudCB9IDoge30pLFxuXHRcdFx0XHRcdGF1dGg6IGFjdGlvbi5hdXRoLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSkpO1xuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbEF1dGhSZXNvbHZlZDpcblx0XHRcdHJldHVybiByZWZyZXNoU3VtbWFyeVN0YXR1cyh1cGRhdGVUb29sQ2FsbEluUGFydHMoc3RhdGUsIGFjdGlvbi50dXJuSWQsIGFjdGlvbi50b29sQ2FsbElkLCB0YyA9PiB7XG5cdFx0XHRcdGlmICh0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLkF1dGhSZXF1aXJlZCkge1xuXHRcdFx0XHRcdHJldHVybiB0Yztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBiYXNlID0gdGNCYXNlV2l0aE1ldGEodGMsIGFjdGlvbi5fbWV0YSk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHRjLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHRcdHRvb2xJbnB1dDogdGMudG9vbElucHV0LFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogdGMuY29uZmlybWVkLFxuXHRcdFx0XHRcdC4uLih0Yy5zZWxlY3RlZE9wdGlvbiA/IHsgc2VsZWN0ZWRPcHRpb246IHRjLnNlbGVjdGVkT3B0aW9uIH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKHRjLmNvbnRlbnQgPyB7IGNvbnRlbnQ6IHRjLmNvbnRlbnQgfSA6IHt9KSxcblx0XHRcdFx0fTtcblx0XHRcdH0pKTtcblxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRVc2FnZTpcblx0XHRcdGlmICghc3RhdGUuYWN0aXZlVHVybiB8fCBzdGF0ZS5hY3RpdmVUdXJuLmlkICE9PSBhY3Rpb24udHVybklkKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnN0YXRlLFxuXHRcdFx0XHRhY3RpdmVUdXJuOiB7IC4uLnN0YXRlLmFjdGl2ZVR1cm4sIHVzYWdlOiBhY3Rpb24udXNhZ2UgfSxcblx0XHRcdH07XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFJlYXNvbmluZzpcblx0XHRcdHJldHVybiB1cGRhdGVSZXNwb25zZVBhcnQoc3RhdGUsIGFjdGlvbi50dXJuSWQsIGFjdGlvbi5wYXJ0SWQsIHBhcnQgPT4ge1xuXHRcdFx0XHRpZiAocGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZykge1xuXHRcdFx0XHRcdHJldHVybiB7IC4uLnBhcnQsIGNvbnRlbnQ6IHBhcnQuY29udGVudCArIGFjdGlvbi5jb250ZW50IH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0XHR9KTtcblxuXG5cdFx0Ly8gXHUyNTAwXHUyNTAwIFRydW5jYXRpb24gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRydW5jYXRlZDoge1xuXHRcdFx0bGV0IHR1cm5zOiB0eXBlb2Ygc3RhdGUudHVybnM7XG5cdFx0XHRpZiAoYWN0aW9uLnR1cm5JZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHR1cm5zID0gW107XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBpZHggPSBzdGF0ZS50dXJucy5maW5kSW5kZXgodCA9PiB0LmlkID09PSBhY3Rpb24udHVybklkKTtcblx0XHRcdFx0aWYgKGlkeCA8IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dHVybnMgPSBzdGF0ZS50dXJucy5zbGljZSgwLCBpZHggKyAxKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG5leHQ6IENoYXRTdGF0ZSA9IHtcblx0XHRcdFx0Li4uc3RhdGUsXG5cdFx0XHRcdHR1cm5zLFxuXHRcdFx0XHRhY3RpdmVUdXJuOiB1bmRlZmluZWQsXG5cdFx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKERhdGUubm93KCkpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHR9O1xuXHRcdFx0aWYgKGFjdGlvbi50dXJuSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRkZWxldGUgbmV4dC50dXJuc05leHRDdXJzb3I7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5uZXh0LFxuXHRcdFx0XHRzdGF0dXM6IHN1bW1hcnlTdGF0dXMobmV4dCksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VHVybnNMb2FkZWQ6IHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nSWRzID0gbmV3IFNldChzdGF0ZS50dXJucy5tYXAodHVybiA9PiB0dXJuLmlkKSk7XG5cdFx0XHRjb25zdCBvbGRlclR1cm5zID0gYWN0aW9uLnR1cm5zLmZpbHRlcih0dXJuID0+ICFleGlzdGluZ0lkcy5oYXModHVybi5pZCkpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4uc3RhdGUsXG5cdFx0XHRcdHR1cm5zOiBbLi4ub2xkZXJUdXJucywgLi4uc3RhdGUudHVybnNdLFxuXHRcdFx0XHR0dXJuc05leHRDdXJzb3I6IGFjdGlvbi50dXJuc05leHRDdXJzb3IsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIFx1MjUwMFx1MjUwMCBTZXNzaW9uIElucHV0IFJlcXVlc3RzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRJbnB1dFJlcXVlc3RlZDpcblx0XHRcdHJldHVybiB1cHNlcnRJbnB1dFJlcXVlc3RQYXJ0KHN0YXRlLCBhY3Rpb24ucmVxdWVzdCk7XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdElucHV0QW5zd2VyQ2hhbmdlZDoge1xuXHRcdFx0Y29uc3QgYWN0aXZlVHVybiA9IHN0YXRlLmFjdGl2ZVR1cm47XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IGFjdGl2ZVR1cm5cblx0XHRcdFx0PyBmaW5kT3BlbklucHV0UmVxdWVzdFBhcnQoYWN0aXZlVHVybi5yZXNwb25zZVBhcnRzLCBhY3Rpb24ucmVxdWVzdElkKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdGlmICghYWN0aXZlVHVybiB8fCAhZXhpc3RpbmcpIHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgeyBpbmRleCwgcGFydCB9ID0gZXhpc3Rpbmc7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gcGFydC5yZXF1ZXN0O1xuXHRcdFx0Y29uc3QgYW5zd2VycyA9IHsgLi4uKHJlcXVlc3QuYW5zd2VycyA/PyB7fSkgfTtcblx0XHRcdGlmIChhY3Rpb24uYW5zd2VyID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0ZGVsZXRlIGFuc3dlcnNbYWN0aW9uLnF1ZXN0aW9uSWRdO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YW5zd2Vyc1thY3Rpb24ucXVlc3Rpb25JZF0gPSBhY3Rpb24uYW5zd2VyO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzcG9uc2VQYXJ0cyA9IFsuLi5hY3RpdmVUdXJuLnJlc3BvbnNlUGFydHNdO1xuXHRcdFx0cmVzcG9uc2VQYXJ0c1tpbmRleF0gPSB7XG5cdFx0XHRcdC4uLnBhcnQsXG5cdFx0XHRcdHJlcXVlc3Q6IHtcblx0XHRcdFx0XHQuLi5yZXF1ZXN0LFxuXHRcdFx0XHRcdGFuc3dlcnM6IE9iamVjdC5rZXlzKGFuc3dlcnMpLmxlbmd0aCA+IDAgPyBhbnN3ZXJzIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnN0YXRlLFxuXHRcdFx0XHRhY3RpdmVUdXJuOiB7XG5cdFx0XHRcdFx0Li4uYWN0aXZlVHVybixcblx0XHRcdFx0XHRyZXNwb25zZVBhcnRzLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZShEYXRlLm5vdygpKS50b0lTT1N0cmluZygpLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdElucHV0Q29tcGxldGVkOiB7XG5cdFx0XHRjb25zdCBhY3RpdmVUdXJuID0gc3RhdGUuYWN0aXZlVHVybjtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gYWN0aXZlVHVyblxuXHRcdFx0XHQ/IGZpbmRPcGVuSW5wdXRSZXF1ZXN0UGFydChhY3RpdmVUdXJuLnJlc3BvbnNlUGFydHMsIGFjdGlvbi5yZXF1ZXN0SWQpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCFhY3RpdmVUdXJuIHx8ICFleGlzdGluZykge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB7IGluZGV4LCBwYXJ0IH0gPSBleGlzdGluZztcblx0XHRcdGNvbnN0IGZpbmFsQW5zd2VycyA9IHsgLi4uKHBhcnQucmVxdWVzdC5hbnN3ZXJzID8/IHt9KSwgLi4uKGFjdGlvbi5hbnN3ZXJzID8/IHt9KSB9O1xuXHRcdFx0Y29uc3QgcmVzcG9uc2VQYXJ0cyA9IFsuLi5hY3RpdmVUdXJuLnJlc3BvbnNlUGFydHNdO1xuXHRcdFx0cmVzcG9uc2VQYXJ0c1tpbmRleF0gPSB7XG5cdFx0XHRcdC4uLnBhcnQsXG5cdFx0XHRcdHJlcXVlc3Q6IHtcblx0XHRcdFx0XHQuLi5wYXJ0LnJlcXVlc3QsXG5cdFx0XHRcdFx0YW5zd2VyczogT2JqZWN0LmtleXMoZmluYWxBbnN3ZXJzKS5sZW5ndGggPiAwID8gZmluYWxBbnN3ZXJzIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXNwb25zZTogYWN0aW9uLnJlc3BvbnNlLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG5leHQ6IENoYXRTdGF0ZSA9IHtcblx0XHRcdFx0Li4uc3RhdGUsXG5cdFx0XHRcdGFjdGl2ZVR1cm46IHtcblx0XHRcdFx0XHQuLi5hY3RpdmVUdXJuLFxuXHRcdFx0XHRcdHJlc3BvbnNlUGFydHMsXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4ubmV4dCxcblx0XHRcdFx0c3RhdHVzOiBzdW1tYXJ5U3RhdHVzKG5leHQpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZShEYXRlLm5vdygpKS50b0lTT1N0cmluZygpLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBcdTI1MDBcdTI1MDAgUGVuZGluZyBNZXNzYWdlcyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQ6IHtcblx0XHRcdGNvbnN0IGVudHJ5OiBQZW5kaW5nTWVzc2FnZSA9IHsgaWQ6IGFjdGlvbi5pZCwgbWVzc2FnZTogYWN0aW9uLm1lc3NhZ2UgfTtcblx0XHRcdGlmIChhY3Rpb24ua2luZCA9PT0gUGVuZGluZ01lc3NhZ2VLaW5kLlN0ZWVyaW5nKSB7XG5cdFx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCBzdGVlcmluZ01lc3NhZ2U6IGVudHJ5IH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHN0YXRlLnF1ZXVlZE1lc3NhZ2VzID8/IFtdO1xuXHRcdFx0Y29uc3QgaWR4ID0gZXhpc3RpbmcuZmluZEluZGV4KG0gPT4gbS5pZCA9PT0gYWN0aW9uLmlkKTtcblx0XHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0XHRjb25zdCB1cGRhdGVkID0gWy4uLmV4aXN0aW5nXTtcblx0XHRcdFx0dXBkYXRlZFtpZHhdID0gZW50cnk7XG5cdFx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCBxdWV1ZWRNZXNzYWdlczogdXBkYXRlZCB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIHF1ZXVlZE1lc3NhZ2VzOiBbLi4uZXhpc3RpbmcsIGVudHJ5XSB9O1xuXHRcdH1cblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VSZW1vdmVkOiB7XG5cdFx0XHRpZiAoYWN0aW9uLmtpbmQgPT09IFBlbmRpbmdNZXNzYWdlS2luZC5TdGVlcmluZykge1xuXHRcdFx0XHRpZiAoIXN0YXRlLnN0ZWVyaW5nTWVzc2FnZSB8fCBzdGF0ZS5zdGVlcmluZ01lc3NhZ2UuaWQgIT09IGFjdGlvbi5pZCkge1xuXHRcdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyAuLi5zdGF0ZSwgc3RlZXJpbmdNZXNzYWdlOiB1bmRlZmluZWQgfTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gc3RhdGUucXVldWVkTWVzc2FnZXM7XG5cdFx0XHRpZiAoIWV4aXN0aW5nKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZpbHRlcmVkID0gZXhpc3RpbmcuZmlsdGVyKG0gPT4gbS5pZCAhPT0gYWN0aW9uLmlkKTtcblx0XHRcdHJldHVybiBmaWx0ZXJlZC5sZW5ndGggPT09IGV4aXN0aW5nLmxlbmd0aFxuXHRcdFx0XHQ/IHN0YXRlXG5cdFx0XHRcdDogeyAuLi5zdGF0ZSwgcXVldWVkTWVzc2FnZXM6IGZpbHRlcmVkLmxlbmd0aCA+IDAgPyBmaWx0ZXJlZCA6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0UXVldWVkTWVzc2FnZXNSZW9yZGVyZWQ6IHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gc3RhdGUucXVldWVkTWVzc2FnZXM7XG5cdFx0XHRpZiAoIWV4aXN0aW5nKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJ5SWQgPSBuZXcgTWFwKGV4aXN0aW5nLm1hcChtID0+IFttLmlkLCBtXSkpO1xuXHRcdFx0Y29uc3Qgb3JkZXJlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Y29uc3QgcmVvcmRlcmVkID0gYWN0aW9uLm9yZGVyXG5cdFx0XHRcdC5maWx0ZXIoaWQgPT4ge1xuXHRcdFx0XHRcdGlmIChieUlkLmhhcyhpZCkgJiYgIW9yZGVyZWQuaGFzKGlkKSkge1xuXHRcdFx0XHRcdFx0b3JkZXJlZC5hZGQoaWQpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fSlcblx0XHRcdFx0Lm1hcChpZCA9PiBieUlkLmdldChpZCkhKTtcblx0XHRcdC8vIEFwcGVuZCBhbnkgbWVzc2FnZXMgbm90IG1lbnRpb25lZCBpbiBvcmRlciwgcHJlc2VydmluZyBvcmlnaW5hbCBvcmRlclxuXHRcdFx0Zm9yIChjb25zdCBtIG9mIGV4aXN0aW5nKSB7XG5cdFx0XHRcdGlmICghb3JkZXJlZC5oYXMobS5pZCkpIHtcblx0XHRcdFx0XHRyZW9yZGVyZWQucHVzaChtKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgLi4uc3RhdGUsIHF1ZXVlZE1lc3NhZ2VzOiByZW9yZGVyZWQgfTtcblx0XHR9XG5cblx0XHQvLyBcdTI1MDBcdTI1MDAgRHJhZnQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdERyYWZ0Q2hhbmdlZDpcblx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCBkcmFmdDogYWN0aW9uLmRyYWZ0IH07XG5cblx0XHRkZWZhdWx0OlxuXHRcdFx0c29mdEFzc2VydE5ldmVyKGFjdGlvbiwgbG9nKTtcblx0XHRcdHJldHVybiBzdGF0ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBUUEsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXLGdCQUFnQiw0QkFBNEIsNEJBQTRCLHlCQUF5QixrQkFBa0IsMEJBQThOO0FBQ3JXLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsdUJBQXVCO0FBS2hDLFNBQVMsT0FBTyxJQUFtQjtBQUNsQyxTQUFPO0FBQUEs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
