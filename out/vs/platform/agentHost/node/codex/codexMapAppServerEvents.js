import { generateUuid } from "../../../../base/common/uuid.js";
import { toToolCallMeta } from "../../common/meta/agentToolCallMeta.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallContributorKind, ToolResultContentType, TurnState } from "../../common/state/sessionState.js";
import { extractForwardedErrorInfo } from "../shared/forwardedChatError.js";
import { getServerToolDisplay } from "../shared/serverToolGroups.js";
import { ActiveClientToolSet } from "../activeClientState.js";
import { unwrapShellInvocation } from "./codexShellCommand.js";
function createCodexSessionMapState(serverToolNames = /* @__PURE__ */ new Set(), clientToolSet = new ActiveClientToolSet()) {
  return {
    itemToPartId: /* @__PURE__ */ new Map(),
    itemToToolCall: /* @__PURE__ */ new Map(),
    itemToReasoningPartId: /* @__PURE__ */ new Map(),
    currentTurnId: void 0,
    clientToolSet,
    serverToolNames,
    mcpCustomizationIds: /* @__PURE__ */ new Map(),
    declinedToolCalls: /* @__PURE__ */ new Set(),
    pendingPreflight: void 0,
    agentMessagePartCount: 0
  };
}
function resetCodexTurnMapState(state) {
  state.itemToPartId.clear();
  state.itemToToolCall.clear();
  state.itemToReasoningPartId.clear();
  state.declinedToolCalls.clear();
  state.pendingPreflight = void 0;
  state.agentMessagePartCount = 0;
}
function flushPendingPreflight(state) {
  const pending = state.pendingPreflight;
  if (!pending) {
    return [];
  }
  state.pendingPreflight = void 0;
  return pending.completion;
}
function extractUserInputText(content) {
  const collected = [];
  for (const c of content) {
    if (c.type === "text") {
      collected.push(c.text);
    }
  }
  return collected.join("\n\n");
}
function reasoningKey(itemId, kind, index) {
  return `${itemId}:${kind}:${index}`;
}
function ensureReasoningPart(state, turnId, key) {
  const existing = state.itemToReasoningPartId.get(key);
  if (existing) {
    return { partId: existing, actions: [] };
  }
  const partId = generateUuid();
  state.itemToReasoningPartId.set(key, partId);
  return {
    partId,
    actions: [{
      type: ActionType.ChatResponsePart,
      turnId,
      part: { kind: ResponsePartKind.Reasoning, id: partId, content: "" }
    }]
  };
}
function describeWebSearch(query, action) {
  if (action?.type === "search") {
    return action.queries?.join(", ") ?? action.query ?? query;
  }
  if (action?.type === "openPage") {
    return action.url ?? query;
  }
  if (action?.type === "findInPage") {
    return [action.pattern, action.url].filter(Boolean).join(" in ") || query;
  }
  return query;
}
function describeFileChange(changes) {
  return changes.map((change) => {
    const kind = change.kind.type === "update" && change.kind.move_path ? `rename from ${change.kind.move_path}` : change.kind.type;
    return `${kind}: ${change.path}`;
  }).join("\n");
}
function fileChangeOutput(changes) {
  return changes.map((change) => `${describeFileChange([change])}
${change.diff}`.trim()).join("\n\n");
}
function jsonValueToText(value) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
function toolInputText(value) {
  return JSON.stringify(value, null, 2);
}
function dynamicToolOutput(contentItems) {
  return contentItems?.map((item) => item.type === "inputText" ? item.text : item.imageUrl).join("\n") ?? "";
}
function mcpToolOutput(result, errorMessage) {
  if (errorMessage) {
    return errorMessage;
  }
  if (!result) {
    return "";
  }
  const content = result.content.map(jsonValueToText).join("\n");
  const structuredContent = result.structuredContent !== null ? jsonValueToText(result.structuredContent) : "";
  return [content, structuredContent].filter(Boolean).join("\n");
}
function collabAgentToolLabels(tool) {
  switch (tool) {
    case "spawnAgent":
      return { displayName: "Spawn agent", present: "Spawning agent", past: "Spawned agent" };
    case "sendInput":
      return { displayName: "Send input to agent", present: "Sending input to agent", past: "Sent input to agent" };
    case "resumeAgent":
      return { displayName: "Resume agent", present: "Resuming agent", past: "Resumed agent" };
    case "wait":
      return { displayName: "Wait for agents", present: "Waiting for agents", past: "Finished waiting" };
    case "closeAgent":
      return { displayName: "Close agent", present: "Closing agent", past: "Closed agent" };
    default:
      return { displayName: tool, present: tool, past: tool };
  }
}
function collabAgentStateSummary(state) {
  switch (state.status) {
    case "completed":
      return state.message ? `Completed \u2014 ${state.message}` : "Completed";
    case "errored":
      return state.message ? `Errored \u2014 ${state.message}` : "Errored";
    case "running":
      return state.message ? `Running \u2014 ${state.message}` : "Running";
    case "interrupted":
      return state.message ? `Interrupted \u2014 ${state.message}` : "Interrupted";
    case "pendingInit":
      return "Pending init";
    case "shutdown":
      return "Shutdown";
    case "notFound":
      return "Not found";
    default:
      return state.status;
  }
}
function collabAgentResultOutput(receiverThreadIds, agentsStates) {
  const seen = /* @__PURE__ */ new Set();
  const states = [];
  for (const id of receiverThreadIds) {
    const state = agentsStates[id];
    if (state) {
      states.push(state);
      seen.add(id);
    }
  }
  for (const id of Object.keys(agentsStates).sort()) {
    if (seen.has(id)) {
      continue;
    }
    const state = agentsStates[id];
    if (state) {
      states.push(state);
    }
  }
  if (states.length === 0) {
    return "";
  }
  if (states.length === 1) {
    return collabAgentStateSummary(states[0]);
  }
  return states.map((state, index) => `Agent ${index + 1}: ${collabAgentStateSummary(state)}`).join("\n");
}
function mapTurnStarted(state, params, fallbackUserText) {
  state.currentTurnId = params.turn.id;
  resetCodexTurnMapState(state);
  let userText = fallbackUserText;
  const first = params.turn.items?.[0];
  if (first && first.type === "userMessage") {
    const collected = extractUserInputText(first.content);
    if (collected.length > 0) {
      userText = collected;
    }
  }
  return [
    {
      type: ActionType.ChatTurnStarted,
      turnId: params.turn.id,
      startedAt: typeof params.turn.startedAt === "number" ? new Date(params.turn.startedAt * 1e3).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
      message: { text: userText, origin: { kind: MessageKind.User } }
    }
  ];
}
function mapReasoningSummaryPartAdded(state, params) {
  return ensureReasoningPart(state, params.turnId, reasoningKey(params.itemId, "summary", params.summaryIndex)).actions;
}
function mapReasoningSummaryTextDelta(state, params) {
  const ensured = ensureReasoningPart(state, params.turnId, reasoningKey(params.itemId, "summary", params.summaryIndex));
  return [
    ...ensured.actions,
    { type: ActionType.ChatReasoning, turnId: params.turnId, partId: ensured.partId, content: params.delta }
  ];
}
function mapReasoningTextDelta(state, params) {
  const ensured = ensureReasoningPart(state, params.turnId, reasoningKey(params.itemId, "text", params.contentIndex));
  return [
    ...ensured.actions,
    { type: ActionType.ChatReasoning, turnId: params.turnId, partId: ensured.partId, content: params.delta }
  ];
}
function clearReasoningForItem(state, itemId) {
  for (const key of [...state.itemToReasoningPartId.keys()]) {
    if (key.startsWith(`${itemId}:`)) {
      state.itemToReasoningPartId.delete(key);
    }
  }
}
function mapTokenUsageUpdated(params) {
  const last = params.tokenUsage.last;
  return [{
    type: ActionType.ChatUsage,
    turnId: params.turnId,
    usage: {
      inputTokens: last.inputTokens,
      outputTokens: last.outputTokens,
      cacheReadTokens: last.cachedInputTokens,
      _meta: {
        reasoningOutputTokens: last.reasoningOutputTokens,
        modelContextWindow: params.tokenUsage.modelContextWindow
      }
    }
  }];
}
function mapItemStarted(state, params) {
  if (params.item.type === "commandExecution") {
    const pending = state.pendingPreflight;
    if (pending && pending.turnId === params.turnId && pending.command === unwrapShellInvocation(params.item.command ?? "")) {
      state.pendingPreflight = void 0;
      state.itemToToolCall.set(params.item.id, {
        toolCallId: pending.toolCallId,
        turnId: params.turnId,
        toolName: "shell",
        output: ""
      });
      return [];
    }
  }
  const flushed = flushPendingPreflight(state);
  const body = mapItemStartedBody(state, params);
  return flushed.length === 0 ? body : [...flushed, ...body];
}
function mapItemStartedBody(state, params) {
  if (params.item.type === "agentMessage") {
    const partId = generateUuid();
    state.itemToPartId.set(params.item.id, partId);
    const separator = state.agentMessagePartCount > 0 ? "\n\n" : "";
    state.agentMessagePartCount++;
    return [
      {
        type: ActionType.ChatResponsePart,
        turnId: params.turnId,
        part: {
          kind: ResponsePartKind.Markdown,
          id: partId,
          content: separator + (params.item.text ?? "")
        }
      }
    ];
  }
  if (params.item.type === "commandExecution") {
    const toolCallId = generateUuid();
    state.itemToToolCall.set(params.item.id, {
      toolCallId,
      turnId: params.turnId,
      toolName: "shell",
      output: ""
    });
    const command = unwrapShellInvocation(params.item.command ?? "");
    return [
      {
        type: ActionType.ChatToolCallStart,
        turnId: params.turnId,
        toolCallId,
        toolName: "shell",
        displayName: "Run shell command",
        _meta: toToolCallMeta({ toolKind: "terminal" })
      },
      {
        type: ActionType.ChatToolCallDelta,
        turnId: params.turnId,
        toolCallId,
        content: command
      },
      {
        type: ActionType.ChatToolCallReady,
        turnId: params.turnId,
        toolCallId,
        invocationMessage: command,
        toolInput: command,
        confirmed: ToolCallConfirmationReason.NotNeeded,
        _meta: toToolCallMeta({ toolKind: "terminal" })
      }
    ];
  }
  if (params.item.type === "webSearch") {
    const toolCallId = generateUuid();
    state.itemToToolCall.set(params.item.id, {
      toolCallId,
      turnId: params.turnId,
      toolName: "web_search",
      output: ""
    });
    const query = describeWebSearch(params.item.query, params.item.action);
    return [
      {
        type: ActionType.ChatToolCallStart,
        turnId: params.turnId,
        toolCallId,
        toolName: "web_search",
        displayName: "Web search",
        _meta: toToolCallMeta({ toolKind: "search" })
      },
      {
        type: ActionType.ChatToolCallDelta,
        turnId: params.turnId,
        toolCallId,
        content: query
      },
      {
        type: ActionType.ChatToolCallReady,
        turnId: params.turnId,
        toolCallId,
        invocationMessage: query,
        toolInput: query,
        confirmed: ToolCallConfirmationReason.NotNeeded,
        _meta: toToolCallMeta({ toolKind: "search" })
      }
    ];
  }
  if (params.item.type === "fileChange") {
    const toolCallId = generateUuid();
    const output = fileChangeOutput(params.item.changes);
    state.itemToToolCall.set(params.item.id, {
      toolCallId,
      turnId: params.turnId,
      toolName: "file_edit",
      output
    });
    const summary = describeFileChange(params.item.changes) || "Apply file changes";
    return [
      {
        type: ActionType.ChatToolCallStart,
        turnId: params.turnId,
        toolCallId,
        toolName: "file_edit",
        displayName: "Apply file changes"
      },
      {
        type: ActionType.ChatToolCallDelta,
        turnId: params.turnId,
        toolCallId,
        content: summary
      },
      {
        type: ActionType.ChatToolCallReady,
        turnId: params.turnId,
        toolCallId,
        invocationMessage: summary,
        toolInput: summary,
        confirmed: ToolCallConfirmationReason.NotNeeded
      },
      ...output ? [{
        type: ActionType.ChatToolCallContentChanged,
        turnId: params.turnId,
        toolCallId,
        content: [{ type: ToolResultContentType.Text, text: output }]
      }] : []
    ];
  }
  if (params.item.type === "mcpToolCall") {
    const toolCallId = generateUuid();
    const toolName = `${params.item.server}.${params.item.tool}`;
    const toolInput = toolInputText(params.item.arguments);
    const customizationId = state.mcpCustomizationIds.get(params.item.server);
    state.itemToToolCall.set(params.item.id, {
      toolCallId,
      turnId: params.turnId,
      toolName,
      output: ""
    });
    return [
      {
        type: ActionType.ChatToolCallStart,
        turnId: params.turnId,
        toolCallId,
        toolName,
        displayName: params.item.tool,
        ...customizationId ? { contributor: { kind: ToolCallContributorKind.MCP, customizationId } } : {}
      },
      {
        type: ActionType.ChatToolCallDelta,
        turnId: params.turnId,
        toolCallId,
        content: toolInput
      },
      {
        type: ActionType.ChatToolCallReady,
        turnId: params.turnId,
        toolCallId,
        invocationMessage: `Calling ${toolName}`,
        toolInput,
        confirmed: ToolCallConfirmationReason.NotNeeded
      }
    ];
  }
  if (params.item.type === "dynamicToolCall") {
    const toolCallId = generateUuid();
    const toolName = params.item.namespace ? `${params.item.namespace}.${params.item.tool}` : params.item.tool;
    const toolInput = toolInputText(params.item.arguments);
    const output = dynamicToolOutput(params.item.contentItems);
    const isServerTool = params.item.namespace === null && state.serverToolNames.has(params.item.tool);
    const ownerClientId = isServerTool ? void 0 : state.clientToolSet.ownerOf(params.item.tool);
    const serverDisplay = getServerToolDisplay(params.item.tool, params.item.arguments);
    state.itemToToolCall.set(params.item.id, {
      toolCallId,
      turnId: params.turnId,
      toolName,
      output
    });
    return [
      {
        type: ActionType.ChatToolCallStart,
        turnId: params.turnId,
        toolCallId,
        toolName,
        displayName: serverDisplay?.displayName ?? params.item.tool,
        ...ownerClientId ? { contributor: { kind: ToolCallContributorKind.Client, clientId: ownerClientId } } : {}
      },
      {
        type: ActionType.ChatToolCallDelta,
        turnId: params.turnId,
        toolCallId,
        content: toolInput
      },
      {
        type: ActionType.ChatToolCallReady,
        turnId: params.turnId,
        toolCallId,
        invocationMessage: serverDisplay?.invocationMessage ?? `Calling ${toolName}`,
        toolInput,
        confirmed: ToolCallConfirmationReason.NotNeeded
      },
      ...output ? [{
        type: ActionType.ChatToolCallContentChanged,
        turnId: params.turnId,
        toolCallId,
        content: [{ type: ToolResultContentType.Text, text: output }]
      }] : []
    ];
  }
  if (params.item.type === "collabAgentToolCall") {
    const toolCallId = generateUuid();
    const labels = collabAgentToolLabels(params.item.tool);
    const toolName = `codex.${params.item.tool}`;
    state.itemToToolCall.set(params.item.id, {
      toolCallId,
      turnId: params.turnId,
      toolName,
      output: ""
    });
    if (params.item.tool === "spawnAgent") {
      return [
        {
          type: ActionType.ChatToolCallStart,
          turnId: params.turnId,
          toolCallId,
          toolName,
          displayName: labels.displayName
        },
        {
          type: ActionType.ChatToolCallReady,
          turnId: params.turnId,
          toolCallId,
          invocationMessage: labels.present,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      ];
    }
    const inputParts = [];
    if (params.item.prompt) {
      inputParts.push(params.item.prompt);
    }
    if (params.item.model) {
      inputParts.push(`Model: ${params.item.model}`);
    }
    const toolInput = inputParts.join("\n\n");
    return [
      {
        type: ActionType.ChatToolCallStart,
        turnId: params.turnId,
        toolCallId,
        toolName,
        displayName: labels.displayName
      },
      ...toolInput ? [{
        type: ActionType.ChatToolCallDelta,
        turnId: params.turnId,
        toolCallId,
        content: toolInput
      }] : [],
      {
        type: ActionType.ChatToolCallReady,
        turnId: params.turnId,
        toolCallId,
        invocationMessage: labels.present,
        toolInput,
        confirmed: ToolCallConfirmationReason.NotNeeded
      }
    ];
  }
  return [];
}
function mapCommandExecutionOutputDelta(state, params) {
  const entry = state.itemToToolCall.get(params.itemId);
  if (!entry) {
    return [];
  }
  entry.output += params.delta;
  return [{
    type: ActionType.ChatToolCallContentChanged,
    turnId: entry.turnId,
    toolCallId: entry.toolCallId,
    content: [{ type: ToolResultContentType.Text, text: entry.output }]
  }];
}
function mapFileChangePatchUpdated(state, params) {
  const entry = state.itemToToolCall.get(params.itemId);
  if (!entry) {
    return [];
  }
  entry.output = fileChangeOutput(params.changes);
  return [{
    type: ActionType.ChatToolCallContentChanged,
    turnId: entry.turnId,
    toolCallId: entry.toolCallId,
    content: entry.output ? [{ type: ToolResultContentType.Text, text: entry.output }] : []
  }];
}
function mapFileChangeOutputDelta(state, params) {
  const entry = state.itemToToolCall.get(params.itemId);
  if (!entry) {
    return [];
  }
  entry.output += params.delta;
  return [{
    type: ActionType.ChatToolCallContentChanged,
    turnId: entry.turnId,
    toolCallId: entry.toolCallId,
    content: [{ type: ToolResultContentType.Text, text: entry.output }]
  }];
}
function mapMcpToolCallProgress(state, params) {
  const entry = state.itemToToolCall.get(params.itemId);
  if (!entry) {
    return [];
  }
  entry.output = [entry.output, params.message].filter(Boolean).join("\n");
  return [{
    type: ActionType.ChatToolCallContentChanged,
    turnId: entry.turnId,
    toolCallId: entry.toolCallId,
    content: [{ type: ToolResultContentType.Text, text: entry.output }]
  }];
}
function mapAgentMessageDelta(state, params) {
  const partId = state.itemToPartId.get(params.itemId);
  if (!partId) {
    return [];
  }
  return [
    {
      type: ActionType.ChatDelta,
      turnId: params.turnId,
      partId,
      content: params.delta
    }
  ];
}
function mapItemCompleted(state, params) {
  if (params.item.type === "agentMessage") {
    state.itemToPartId.delete(params.item.id);
    return [];
  }
  if (params.item.type === "reasoning") {
    clearReasoningForItem(state, params.item.id);
    return [];
  }
  const entry = state.itemToToolCall.get(params.item.id);
  if (!entry) {
    return [];
  }
  state.itemToToolCall.delete(params.item.id);
  const declined = state.declinedToolCalls.delete(entry.toolCallId);
  if (params.item.type === "commandExecution") {
    const success = params.item.status === "completed" && (params.item.exitCode === 0 || params.item.exitCode === null);
    const output = params.item.aggregatedOutput ?? entry.output;
    const command = unwrapShellInvocation(params.item.command ?? "");
    const exit = params.item.exitCode;
    const pastTense = success ? `Ran \`${command}\`` : exit !== null ? `Ran \`${command}\` (exit ${exit})` : `Ran \`${command}\` (failed)`;
    const completion = [
      {
        type: ActionType.ChatToolCallComplete,
        turnId: entry.turnId,
        toolCallId: entry.toolCallId,
        result: {
          success,
          pastTenseMessage: pastTense,
          content: output ? [{ type: ToolResultContentType.Text, text: output }] : void 0,
          error: success ? void 0 : {
            message: exit !== null ? `Exit code ${exit}` : "Command failed",
            ...declined ? { code: "denied" } : {}
          }
        }
      }
    ];
    if (success && !output && !declined) {
      const flushed = flushPendingPreflight(state);
      state.pendingPreflight = { toolCallId: entry.toolCallId, turnId: entry.turnId, command, completion };
      return flushed;
    }
    return [...flushPendingPreflight(state), ...completion];
  }
  if (params.item.type === "webSearch") {
    const query = describeWebSearch(params.item.query, params.item.action);
    return [{
      type: ActionType.ChatToolCallComplete,
      turnId: entry.turnId,
      toolCallId: entry.toolCallId,
      result: {
        success: true,
        pastTenseMessage: `Searched ${query}`
      }
    }];
  }
  if (params.item.type === "fileChange") {
    const output = fileChangeOutput(params.item.changes) || entry.output;
    const success = params.item.status === "completed";
    const content = output ? [{ type: ToolResultContentType.Text, text: output }] : void 0;
    const result = {
      success,
      pastTenseMessage: success ? "Applied file changes" : "Failed to apply file changes",
      content,
      ...success ? {} : { error: { message: `Patch ${params.item.status}`, ...declined ? { code: "denied" } : {} } }
    };
    return [{
      type: ActionType.ChatToolCallComplete,
      turnId: entry.turnId,
      toolCallId: entry.toolCallId,
      result
    }];
  }
  if (params.item.type === "mcpToolCall") {
    const success = params.item.status === "completed" && !params.item.error;
    const output = mcpToolOutput(params.item.result, params.item.error?.message) || entry.output;
    const content = output ? [{ type: ToolResultContentType.Text, text: output }] : void 0;
    return [{
      type: ActionType.ChatToolCallComplete,
      turnId: entry.turnId,
      toolCallId: entry.toolCallId,
      result: {
        success,
        pastTenseMessage: success ? `Called ${entry.toolName}` : `Failed to call ${entry.toolName}`,
        content,
        ...success ? {} : { error: { message: params.item.error?.message ?? `MCP tool ${params.item.status}`, ...declined ? { code: "denied" } : {} } }
      }
    }];
  }
  if (params.item.type === "dynamicToolCall") {
    const success = params.item.success === true || params.item.status === "completed";
    const output = dynamicToolOutput(params.item.contentItems) || entry.output;
    const content = output ? [{ type: ToolResultContentType.Text, text: output }] : void 0;
    const serverPastTense = success ? getServerToolDisplay(entry.toolName, params.item.arguments, { text: output, success })?.pastTenseMessage : void 0;
    return [{
      type: ActionType.ChatToolCallComplete,
      turnId: entry.turnId,
      toolCallId: entry.toolCallId,
      result: {
        success,
        pastTenseMessage: serverPastTense ?? (success ? `Called ${entry.toolName}` : `Failed to call ${entry.toolName}`),
        content,
        ...success ? {} : { error: { message: `Dynamic tool ${params.item.status}`, ...declined ? { code: "denied" } : {} } }
      }
    }];
  }
  if (params.item.type === "collabAgentToolCall") {
    const labels = collabAgentToolLabels(params.item.tool);
    const success = params.item.status === "completed";
    const output = collabAgentResultOutput(params.item.receiverThreadIds, params.item.agentsStates) || entry.output;
    const content = output ? [{ type: ToolResultContentType.Text, text: output }] : void 0;
    return [{
      type: ActionType.ChatToolCallComplete,
      turnId: entry.turnId,
      toolCallId: entry.toolCallId,
      result: {
        success,
        pastTenseMessage: success ? labels.past : `${labels.displayName} failed`,
        content,
        ...success ? {} : { error: { message: `Collab agent ${params.item.status}`, ...declined ? { code: "denied" } : {} } }
      }
    }];
  }
  return [];
}
function mapTurnCompleted(state, params, fallbackDuration) {
  state.currentTurnId = void 0;
  state.itemToPartId.clear();
  state.itemToReasoningPartId.clear();
  const preflightFlush = flushPendingPreflight(state);
  const orphanedToolCalls = [...state.itemToToolCall.values()];
  state.itemToToolCall.clear();
  const turnId = params.turn.id;
  const status = params.turn.status;
  const duration = typeof params.turn.durationMs === "number" && Number.isFinite(params.turn.durationMs) && params.turn.durationMs >= 0 ? params.turn.durationMs : typeof params.turn.startedAt === "number" && typeof params.turn.completedAt === "number" ? Math.max(0, (params.turn.completedAt - params.turn.startedAt) * 1e3) : typeof fallbackDuration === "number" && Number.isFinite(fallbackDuration) ? Math.max(0, fallbackDuration) : 0;
  const orphanedToolCallActions = orphanedToolCalls.map((entry) => ({
    type: ActionType.ChatToolCallComplete,
    turnId: entry.turnId,
    toolCallId: entry.toolCallId,
    result: {
      success: false,
      pastTenseMessage: `Stopped ${entry.toolName}`,
      content: entry.output ? [{ type: ToolResultContentType.Text, text: entry.output }] : void 0,
      error: { message: status === "interrupted" ? "Turn interrupted before the tool completed" : "Turn completed before the tool reported completion" }
    }
  }));
  if (status === "failed" && params.turn.error) {
    const errMessage = params.turn.error.message ?? "Codex turn failed";
    return [
      ...preflightFlush,
      ...orphanedToolCallActions,
      {
        type: ActionType.ChatError,
        turnId,
        duration,
        error: {
          errorType: "CodexError",
          ...extractForwardedErrorInfo(errMessage)
        }
      },
      {
        type: ActionType.ChatTurnComplete,
        turnId,
        duration
      }
    ];
  }
  if (status === "interrupted") {
    return [...preflightFlush, ...orphanedToolCallActions, { type: ActionType.ChatTurnCancelled, turnId, duration }];
  }
  return [...preflightFlush, ...orphanedToolCallActions, { type: ActionType.ChatTurnComplete, turnId, duration }];
}
function turnStateFromStatus(status) {
  switch (status) {
    case "completed":
      return TurnState.Complete;
    case "interrupted":
      return TurnState.Cancelled;
    case "failed":
      return TurnState.Error;
    default:
      return TurnState.Complete;
  }
}
export {
  clearReasoningForItem,
  createCodexSessionMapState,
  describeFileChange,
  describeWebSearch,
  extractUserInputText,
  fileChangeOutput,
  mapAgentMessageDelta,
  mapCommandExecutionOutputDelta,
  mapFileChangeOutputDelta,
  mapFileChangePatchUpdated,
  mapItemCompleted,
  mapItemStarted,
  mapMcpToolCallProgress,
  mapReasoningSummaryPartAdded,
  mapReasoningSummaryTextDelta,
  mapReasoningTextDelta,
  mapTokenUsageUpdated,
  mapTurnCompleted,
  mapTurnStarted,
  resetCodexTurnMapState,
  turnStateFromStatus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NvZGV4L2NvZGV4TWFwQXBwU2VydmVyRXZlbnRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyB0b1Rvb2xDYWxsTWV0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tZXRhL2FnZW50VG9vbENhbGxNZXRhLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgU2Vzc2lvbkFjdGlvbiwgdHlwZSBDaGF0QWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VLaW5kLCBSZXNwb25zZVBhcnRLaW5kLCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIFRvb2xSZXN1bHRDb250ZW50VHlwZSwgVHVyblN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBleHRyYWN0Rm9yd2FyZGVkRXJyb3JJbmZvIH0gZnJvbSAnLi4vc2hhcmVkL2ZvcndhcmRlZENoYXRFcnJvci5qcyc7XG5pbXBvcnQgeyBnZXRTZXJ2ZXJUb29sRGlzcGxheSB9IGZyb20gJy4uL3NoYXJlZC9zZXJ2ZXJUb29sR3JvdXBzLmpzJztcbmltcG9ydCB7IEFjdGl2ZUNsaWVudFRvb2xTZXQgfSBmcm9tICcuLi9hY3RpdmVDbGllbnRTdGF0ZS5qcyc7XG5pbXBvcnQgeyB1bndyYXBTaGVsbEludm9jYXRpb24gfSBmcm9tICcuL2NvZGV4U2hlbGxDb21tYW5kLmpzJztcbmltcG9ydCB0eXBlIHsgQWdlbnRNZXNzYWdlRGVsdGFOb3RpZmljYXRpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9BZ2VudE1lc3NhZ2VEZWx0YU5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IENvbW1hbmRFeGVjdXRpb25PdXRwdXREZWx0YU5vdGlmaWNhdGlvbiB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0NvbW1hbmRFeGVjdXRpb25PdXRwdXREZWx0YU5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IEZpbGVDaGFuZ2VPdXRwdXREZWx0YU5vdGlmaWNhdGlvbiB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0ZpbGVDaGFuZ2VPdXRwdXREZWx0YU5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IEZpbGVDaGFuZ2VQYXRjaFVwZGF0ZWROb3RpZmljYXRpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9GaWxlQ2hhbmdlUGF0Y2hVcGRhdGVkTm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgRmlsZVVwZGF0ZUNoYW5nZSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0ZpbGVVcGRhdGVDaGFuZ2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJdGVtQ29tcGxldGVkTm90aWZpY2F0aW9uIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvSXRlbUNvbXBsZXRlZE5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IEl0ZW1TdGFydGVkTm90aWZpY2F0aW9uIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvSXRlbVN0YXJ0ZWROb3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBNY3BUb29sQ2FsbFByb2dyZXNzTm90aWZpY2F0aW9uIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvTWNwVG9vbENhbGxQcm9ncmVzc05vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IE1jcFRvb2xDYWxsUmVzdWx0IH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvTWNwVG9vbENhbGxSZXN1bHQuanMnO1xuaW1wb3J0IHR5cGUgeyBSZWFzb25pbmdTdW1tYXJ5UGFydEFkZGVkTm90aWZpY2F0aW9uIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvUmVhc29uaW5nU3VtbWFyeVBhcnRBZGRlZE5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IFJlYXNvbmluZ1N1bW1hcnlUZXh0RGVsdGFOb3RpZmljYXRpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9SZWFzb25pbmdTdW1tYXJ5VGV4dERlbHRhTm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgUmVhc29uaW5nVGV4dERlbHRhTm90aWZpY2F0aW9uIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvUmVhc29uaW5nVGV4dERlbHRhTm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgVGhyZWFkVG9rZW5Vc2FnZVVwZGF0ZWROb3RpZmljYXRpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9UaHJlYWRUb2tlblVzYWdlVXBkYXRlZE5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IFR1cm5Db21wbGV0ZWROb3RpZmljYXRpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9UdXJuQ29tcGxldGVkTm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgVHVyblN0YXJ0ZWROb3RpZmljYXRpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9UdXJuU3RhcnRlZE5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IFVzZXJJbnB1dCB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL1VzZXJJbnB1dC5qcyc7XG5pbXBvcnQgdHlwZSB7IFdlYlNlYXJjaEFjdGlvbiB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL1dlYlNlYXJjaEFjdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IER5bmFtaWNUb29sQ2FsbE91dHB1dENvbnRlbnRJdGVtIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvRHluYW1pY1Rvb2xDYWxsT3V0cHV0Q29udGVudEl0ZW0uanMnO1xuaW1wb3J0IHR5cGUgeyBKc29uVmFsdWUgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC9zZXJkZV9qc29uL0pzb25WYWx1ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IENvbGxhYkFnZW50VG9vbCB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0NvbGxhYkFnZW50VG9vbC5qcyc7XG5pbXBvcnQgdHlwZSB7IENvbGxhYkFnZW50U3RhdGUgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9Db2xsYWJBZ2VudFN0YXRlLmpzJztcblxuLyoqXG4gKiBQZXItc2Vzc2lvbiBtdXRhYmxlIHN0YXRlIGhlbGQgYnkgdGhlIG1hcHBlci4gQ2FycmllcyB0aGUgYm9va2tlZXBpbmdcbiAqIG5lZWRlZCB0byBnbHVlIGNvZGV4J3MgaXRlbS1zdHJlYW0gKGVhY2ggYGFnZW50TWVzc2FnZWAgaXRlbSBoYXMgaXRzXG4gKiBvd24gaWQpIHRvIHRoZSBhZ2VudCBob3N0IHByb3RvY29sIChlYWNoIG1hcmtkb3duIHBhcnQgaGFzIGl0cyBvd24gaWQpLlxuICpcbiAqIFBoYXNlIDIgdHJhY2tzIG9ubHkgYGl0ZW1JZCBcdTIxOTIgcGFydElkYCBmb3IgYWdlbnQgbWVzc2FnZXMuIFBoYXNlIDRcbiAqIGV4dGVuZHMgdGhpcyB3aXRoIHRvb2wtY2FsbCBjb3JyZWxhdGlvbjsgUGhhc2UgNiBhZGRzIHJlYXNvbmluZyBwYXJ0cy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ29kZXhTZXNzaW9uTWFwU3RhdGUge1xuXHQvKiogU3RhYmxlIGNvZGV4IGBpdGVtSWRgIFx1MjE5MiBvdXIgbWFya2Rvd24gcmVzcG9uc2UgcGFydCBpZC4gKi9cblx0cmVhZG9ubHkgaXRlbVRvUGFydElkOiBNYXA8c3RyaW5nLCBzdHJpbmc+O1xuXHQvKipcblx0ICogU3RhYmxlIGNvZGV4IGBpdGVtSWRgIFx1MjE5MiB0b29sLWNhbGwgYm9va2tlZXBpbmcuIFBoYXNlIDQgdHJhY2tzXG5cdCAqIGBjb21tYW5kRXhlY3V0aW9uYCBoZXJlIHNvIGNvbXBsZXRpb24vYXBwcm92YWwgaGFuZGxlcnMgY2FuIGZpbmRcblx0ICogdGhlIHJpZ2h0IHRvb2xDYWxsSWQvdHVybklkIGZvciBlYWNoIGl0ZW0uXG5cdCAqL1xuXHRyZWFkb25seSBpdGVtVG9Ub29sQ2FsbDogTWFwPHN0cmluZywgSUNvZGV4VG9vbENhbGxFbnRyeT47XG5cdC8qKiBTdGFibGUgY29kZXggcmVhc29uaW5nIGl0ZW0vaW5kZXggXHUyMTkyIG91ciByZWFzb25pbmcgcmVzcG9uc2UgcGFydCBpZC4gKi9cblx0cmVhZG9ubHkgaXRlbVRvUmVhc29uaW5nUGFydElkOiBNYXA8c3RyaW5nLCBzdHJpbmc+O1xuXHQvKiogQ3VycmVudCB0dXJuIGlkIChwZXIgYHR1cm4vc3RhcnRlZGApLiAqL1xuXHRjdXJyZW50VHVybklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBMaXZlIHJlZ2lzdHJ5IG9mIHRoZSBzZXNzaW9uJ3MgY2xpZW50LXByb3ZpZGVkIChgZHluYW1pY1Rvb2xzYCkgdG9vbHMsXG5cdCAqIGtleWVkIGJ5IGNvbnRyaWJ1dGluZyB3b3JrYmVuY2ggY2xpZW50LiBBIGBkeW5hbWljVG9vbENhbGxgIHRvb2wtY2FsbFxuXHQgKiBzdGFydCBpcyBzdGFtcGVkIHdpdGggdGhlIG93bmluZyBjbGllbnQgKHNvIHRoZSB3b3JrYmVuY2ggcm91dGVzXG5cdCAqIGV4ZWN1dGlvbiBiYWNrIHRvIGl0KSByZXNvbHZlZCB2aWEge0BsaW5rIEFjdGl2ZUNsaWVudFRvb2xTZXQub3duZXJPZn0uXG5cdCAqL1xuXHRjbGllbnRUb29sU2V0OiBBY3RpdmVDbGllbnRUb29sU2V0O1xuXHQvKipcblx0ICogTmFtZXMgb2YgdGhlIGFnZW50IGhvc3QncyBzZXJ2ZXIgdG9vbHMgKGV4ZWN1dGVkIGluLXByb2Nlc3MpLiBBXG5cdCAqIGBkeW5hbWljVG9vbENhbGxgIGZvciBvbmUgb2YgdGhlc2Ugb21pdHMgdGhlIGBDbGllbnRgIGNvbnRyaWJ1dG9yIHNvIHRoZVxuXHQgKiB3b3JrYmVuY2ggZG9lcyBub3QgdHJ5IHRvIHJvdXRlIGV4ZWN1dGlvbiB0byBhIGNsaWVudCBcdTIwMTQgdGhlIGFnZW50IGhvc3Rcblx0ICogYW5zd2VycyB0aGUgYGl0ZW0vdG9vbC9jYWxsYCBkaXJlY3RseS5cblx0ICovXG5cdHNlcnZlclRvb2xOYW1lczogUmVhZG9ubHlTZXQ8c3RyaW5nPjtcblx0LyoqXG5cdCAqIFNlcnZlciBuYW1lIFx1MjE5MiBjdXN0b21pemF0aW9uIGlkIGZvciB0aGUgc2Vzc2lvbidzIE1DUCBzZXJ2ZXJzLCB1c2VkIHRvXG5cdCAqIHN0YW1wIHRoZSB7QGxpbmsgVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQfSBjb250cmlidXRvciBvbiBgbWNwVG9vbENhbGxgXG5cdCAqIHN0YXJ0cyBzbyBjbGllbnRzIGNhbiBjb3JyZWxhdGUgdGhlIGNhbGwgd2l0aCBpdHMgb3JpZ2luYXRpbmcgc2VydmVyXG5cdCAqIGN1c3RvbWl6YXRpb24uIE93bmVkIGFuZCBwb3B1bGF0ZWQgYnkgdGhlIGFnZW50IChtaXJyb3JzXG5cdCAqIHtAbGluayBjbGllbnRUb29sU2V0fSk7IGVtcHR5IHVudGlsIHRoZSBhZ2VudCBmaXJzdCBhcHBsaWVzIHRoZSBpbnZlbnRvcnkuXG5cdCAqL1xuXHRyZWFkb25seSBtY3BDdXN0b21pemF0aW9uSWRzOiBNYXA8c3RyaW5nLCBzdHJpbmc+O1xuXHQvKipcblx0ICogVG9vbCBjYWxsIGlkcyB0aGUgaG9zdCBkZWNsaW5lZCBhdCB0aGUgYXBwcm92YWwgcHJvbXB0LiBDb2RleCByZXBvcnRzIHRoZVxuXHQgKiByZXN1bHRpbmcgYGl0ZW0vY29tcGxldGVkYCBhcyBhIGdlbmVyaWMgZmFpbHVyZSwgc28gdGhlIGNvbXBsZXRpb24gaGFuZGxlclxuXHQgKiBjb25zdWx0cyB0aGlzIHNldCB0byBlbWl0IGEgYHVzZXJDYW5jZWxsZWRgIChgZXJyb3IuY29kZSA9ICdkZW5pZWQnYClcblx0ICogcmVzdWx0IGluc3RlYWQuIERyYWluZWQgb24gY29tcGxldGlvbiBhbmQgY2xlYXJlZCBwZXIgdHVybi5cblx0ICovXG5cdHJlYWRvbmx5IGRlY2xpbmVkVG9vbENhbGxzOiBTZXQ8c3RyaW5nPjtcblx0LyoqXG5cdCAqIEEgYGNvbW1hbmRFeGVjdXRpb25gIHRoYXQgY29tcGxldGVkIHN1Y2Nlc3NmdWxseSB3aXRoIE5PIG91dHB1dCBpc1xuXHQgKiBwb3RlbnRpYWxseSBhIHNhbmRib3ggcHJlLWZsaWdodC4gV2hlbiBDb2RleCBydW5zIGEgbmV0d29yayAob3Igb3RoZXJ3aXNlXG5cdCAqIGVzY2FsYXRlZCkgY29tbWFuZCB1bmRlciBgb24tcmVxdWVzdGAgKyBgd29ya3NwYWNlLXdyaXRlYCBpdCBmaXJzdCBhdHRlbXB0c1xuXHQgKiBpdCBpbnNpZGUgdGhlIHNhbmRib3ggXHUyMDE0IHdoaWNoIGNvbXBsZXRlcyBpbnN0YW50bHkgd2l0aCBubyBvdXRwdXQgYmVjYXVzZVxuXHQgKiB0aGUgc2FuZGJveCBibG9ja2VkIGl0IFx1MjAxNCB0aGVuIHJlLXJ1bnMgdGhlIFNBTUUgY29tbWFuZCBhcyBhIHNlcGFyYXRlXG5cdCAqIGBjb21tYW5kRXhlY3V0aW9uYCBpdGVtIGd1YXJkZWQgYnkgYW4gYXBwcm92YWwgcmVxdWVzdC4gUmVuZGVyaW5nIGJvdGhcblx0ICogaXRlbXMgZHJhd3MgdGhlIGNvbW1hbmQgYm94IHR3aWNlLiBUbyBjb2FsZXNjZSB0aGVtIHdlIGRlZmVyIHRoZVxuXHQgKiBwcmUtZmxpZ2h0J3MgY29tcGxldGlvbiBoZXJlOiBpZiB0aGUgbmV4dCBgY29tbWFuZEV4ZWN1dGlvbmAgaW4gdGhlIHR1cm5cblx0ICogcmUtcnVucyB0aGUgc2FtZSBjb21tYW5kIGl0IHJldXNlcyB0aGlzIChzdGlsbC1vcGVuKSB0b29sIGNhbGwgZm9yIGEgc2luZ2xlXG5cdCAqIGJveDsgb3RoZXJ3aXNlIHRoZSBkZWZlcnJlZCBjb21wbGV0aW9uIGlzIGZsdXNoZWQgKG9uIHRoZSBuZXh0IGl0ZW0gb3IgYXRcblx0ICogdHVybiBlbmQpIHNvIGEgZ2VudWluZWx5IG91dHB1dC1sZXNzIGNvbW1hbmQgc3RpbGwgZmluYWxpemVzLlxuXHQgKi9cblx0cGVuZGluZ1ByZWZsaWdodDogSUNvZGV4UGVuZGluZ1ByZWZsaWdodCB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIENvdW50IG9mIGBhZ2VudE1lc3NhZ2VgIG1hcmtkb3duIHBhcnRzIHN0YXJ0ZWQgaW4gdGhlIGN1cnJlbnQgdHVybi4gUmVzZXRcblx0ICogcGVyIHR1cm4gYnkge0BsaW5rIHJlc2V0Q29kZXhUdXJuTWFwU3RhdGV9OyBzZWUge0BsaW5rIG1hcEl0ZW1TdGFydGVkQm9keX0uXG5cdCAqL1xuXHRhZ2VudE1lc3NhZ2VQYXJ0Q291bnQ6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBBIGRlZmVycmVkIGBjb21tYW5kRXhlY3V0aW9uYCBjb21wbGV0aW9uIGhlbGQgYmFjayB0byBjb2FsZXNjZSBhIHNhbmRib3hcbiAqIHByZS1mbGlnaHQgd2l0aCBpdHMgYXBwcm92YWwtZ3VhcmRlZCByZS1ydW4uIFNlZVxuICoge0BsaW5rIElDb2RleFNlc3Npb25NYXBTdGF0ZS5wZW5kaW5nUHJlZmxpZ2h0fS5cbiAqL1xuaW50ZXJmYWNlIElDb2RleFBlbmRpbmdQcmVmbGlnaHQge1xuXHRyZWFkb25seSB0b29sQ2FsbElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHR1cm5JZDogc3RyaW5nO1xuXHQvKiogVW53cmFwcGVkIGNvbW1hbmQgdGV4dCwgdXNlZCB0byBtYXRjaCB0aGUgcmUtcnVuLiAqL1xuXHRyZWFkb25seSBjb21tYW5kOiBzdHJpbmc7XG5cdC8qKiBUaGUgYENoYXRUb29sQ2FsbENvbXBsZXRlYCBhY3Rpb24gdG8gZW1pdCBpZiB0aGUgcHJlLWZsaWdodCBpcyBub3QgcmV1c2VkLiAqL1xuXHRyZWFkb25seSBjb21wbGV0aW9uOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvZGV4VG9vbENhbGxFbnRyeSB7XG5cdHJlYWRvbmx5IHRvb2xDYWxsSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdHVybklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRvb2xOYW1lOiBzdHJpbmc7XG5cdG91dHB1dDogc3RyaW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoc2VydmVyVG9vbE5hbWVzOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldCgpLCBjbGllbnRUb29sU2V0OiBBY3RpdmVDbGllbnRUb29sU2V0ID0gbmV3IEFjdGl2ZUNsaWVudFRvb2xTZXQoKSk6IElDb2RleFNlc3Npb25NYXBTdGF0ZSB7XG5cdHJldHVybiB7XG5cdFx0aXRlbVRvUGFydElkOiBuZXcgTWFwKCksXG5cdFx0aXRlbVRvVG9vbENhbGw6IG5ldyBNYXAoKSxcblx0XHRpdGVtVG9SZWFzb25pbmdQYXJ0SWQ6IG5ldyBNYXAoKSxcblx0XHRjdXJyZW50VHVybklkOiB1bmRlZmluZWQsXG5cdFx0Y2xpZW50VG9vbFNldCxcblx0XHRzZXJ2ZXJUb29sTmFtZXMsXG5cdFx0bWNwQ3VzdG9taXphdGlvbklkczogbmV3IE1hcCgpLFxuXHRcdGRlY2xpbmVkVG9vbENhbGxzOiBuZXcgU2V0KCksXG5cdFx0cGVuZGluZ1ByZWZsaWdodDogdW5kZWZpbmVkLFxuXHRcdGFnZW50TWVzc2FnZVBhcnRDb3VudDogMCxcblx0fTtcbn1cblxuLyoqXG4gKiBDbGVhciB0aGUgcGVyLXR1cm4gYm9va2tlZXBpbmcgbWFwcyBzbyBzdHJlYW1lZCBwYXJ0cywgdG9vbC1jYWxscywgYW5kXG4gKiByZWFzb25pbmcgcGFydHMgZnJvbSBhIGZpbmlzaGVkIChvciBwcmVlbXB0ZWQpIHR1cm4gZG9uJ3QgYmxlZWQgaW50byB0aGVcbiAqIG5leHQgb25lLiBEb2VzIE5PVCB0b3VjaCB7QGxpbmsgSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLmN1cnJlbnRUdXJuSWR9LFxuICogd2hpY2ggdHJhY2tzIHRoZSBjb2RleCBhcHAtc2VydmVyIHR1cm4gaWQgYW5kIGlzIG93bmVkIGJ5IHRoZVxuICogdHVybi9zdGFydGVkICsgdHVybi9jb21wbGV0ZWQgaGFuZGxlcnMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNldENvZGV4VHVybk1hcFN0YXRlKHN0YXRlOiBJQ29kZXhTZXNzaW9uTWFwU3RhdGUpOiB2b2lkIHtcblx0c3RhdGUuaXRlbVRvUGFydElkLmNsZWFyKCk7XG5cdHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmNsZWFyKCk7XG5cdHN0YXRlLml0ZW1Ub1JlYXNvbmluZ1BhcnRJZC5jbGVhcigpO1xuXHRzdGF0ZS5kZWNsaW5lZFRvb2xDYWxscy5jbGVhcigpO1xuXHRzdGF0ZS5wZW5kaW5nUHJlZmxpZ2h0ID0gdW5kZWZpbmVkO1xuXHRzdGF0ZS5hZ2VudE1lc3NhZ2VQYXJ0Q291bnQgPSAwO1xufVxuXG4vKipcbiAqIEVtaXQgYW5kIGNsZWFyIGFueSBkZWZlcnJlZCBzYW5kYm94IHByZS1mbGlnaHQgY29tcGxldGlvbiAoc2VlXG4gKiB7QGxpbmsgSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLnBlbmRpbmdQcmVmbGlnaHR9KS4gUmV0dXJucyBgW11gIHdoZW4gbm90aGluZyBpc1xuICogcGVuZGluZywgc28gY2FsbGVycyBjYW4gdW5jb25kaXRpb25hbGx5IHByZXBlbmQgdGhlIHJlc3VsdC5cbiAqL1xuZnVuY3Rpb24gZmx1c2hQZW5kaW5nUHJlZmxpZ2h0KHN0YXRlOiBJQ29kZXhTZXNzaW9uTWFwU3RhdGUpOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRjb25zdCBwZW5kaW5nID0gc3RhdGUucGVuZGluZ1ByZWZsaWdodDtcblx0aWYgKCFwZW5kaW5nKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdHN0YXRlLnBlbmRpbmdQcmVmbGlnaHQgPSB1bmRlZmluZWQ7XG5cdHJldHVybiBwZW5kaW5nLmNvbXBsZXRpb247XG59XG5cbi8qKlxuICogQ29sbGVjdCB0aGUgcGxhaW4tdGV4dCBwb3J0aW9ucyBvZiBhIGNvZGV4IGB1c2VyTWVzc2FnZWAgaXRlbSdzXG4gKiBgY29udGVudGAgKGFuIGFycmF5IG9mIHtAbGluayBVc2VySW5wdXR9KS4gTm9uLXRleHQgaW5wdXRzIChpbWFnZXMsXG4gKiBza2lsbHMsIG1lbnRpb25zKSBhcmUgaWdub3JlZC4gTXVsdGlwbGUgdGV4dCBwYXJ0cyBhcmUgam9pbmVkIHdpdGggYVxuICogYmxhbmsgbGluZSwgbWlycm9yaW5nIHtAbGluayBtYXBUdXJuU3RhcnRlZH0ncyByZWNvbnN0cnVjdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RVc2VySW5wdXRUZXh0KGNvbnRlbnQ6IHJlYWRvbmx5IFVzZXJJbnB1dFtdKTogc3RyaW5nIHtcblx0Y29uc3QgY29sbGVjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGMgb2YgY29udGVudCkge1xuXHRcdGlmIChjLnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0Y29sbGVjdGVkLnB1c2goYy50ZXh0KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGNvbGxlY3RlZC5qb2luKCdcXG5cXG4nKTtcbn1cblxuZnVuY3Rpb24gcmVhc29uaW5nS2V5KGl0ZW1JZDogc3RyaW5nLCBraW5kOiAnc3VtbWFyeScgfCAndGV4dCcsIGluZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7aXRlbUlkfToke2tpbmR9OiR7aW5kZXh9YDtcbn1cblxuZnVuY3Rpb24gZW5zdXJlUmVhc29uaW5nUGFydChzdGF0ZTogSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLCB0dXJuSWQ6IHN0cmluZywga2V5OiBzdHJpbmcpOiB7IHJlYWRvbmx5IHBhcnRJZDogc3RyaW5nOyByZWFkb25seSBhY3Rpb25zOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10gfSB7XG5cdGNvbnN0IGV4aXN0aW5nID0gc3RhdGUuaXRlbVRvUmVhc29uaW5nUGFydElkLmdldChrZXkpO1xuXHRpZiAoZXhpc3RpbmcpIHtcblx0XHRyZXR1cm4geyBwYXJ0SWQ6IGV4aXN0aW5nLCBhY3Rpb25zOiBbXSB9O1xuXHR9XG5cdGNvbnN0IHBhcnRJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRzdGF0ZS5pdGVtVG9SZWFzb25pbmdQYXJ0SWQuc2V0KGtleSwgcGFydElkKTtcblx0cmV0dXJuIHtcblx0XHRwYXJ0SWQsXG5cdFx0YWN0aW9uczogW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHBhcnQ6IHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcsIGlkOiBwYXJ0SWQsIGNvbnRlbnQ6ICcnIH0sXG5cdFx0fV0sXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZXNjcmliZVdlYlNlYXJjaChxdWVyeTogc3RyaW5nLCBhY3Rpb246IFdlYlNlYXJjaEFjdGlvbiB8IG51bGwpOiBzdHJpbmcge1xuXHRpZiAoYWN0aW9uPy50eXBlID09PSAnc2VhcmNoJykge1xuXHRcdHJldHVybiBhY3Rpb24ucXVlcmllcz8uam9pbignLCAnKSA/PyBhY3Rpb24ucXVlcnkgPz8gcXVlcnk7XG5cdH1cblx0aWYgKGFjdGlvbj8udHlwZSA9PT0gJ29wZW5QYWdlJykge1xuXHRcdHJldHVybiBhY3Rpb24udXJsID8/IHF1ZXJ5O1xuXHR9XG5cdGlmIChhY3Rpb24/LnR5cGUgPT09ICdmaW5kSW5QYWdlJykge1xuXHRcdHJldHVybiBbYWN0aW9uLnBhdHRlcm4sIGFjdGlvbi51cmxdLmZpbHRlcihCb29sZWFuKS5qb2luKCcgaW4gJykgfHwgcXVlcnk7XG5cdH1cblx0cmV0dXJuIHF1ZXJ5O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVzY3JpYmVGaWxlQ2hhbmdlKGNoYW5nZXM6IHJlYWRvbmx5IEZpbGVVcGRhdGVDaGFuZ2VbXSk6IHN0cmluZyB7XG5cdHJldHVybiBjaGFuZ2VzLm1hcChjaGFuZ2UgPT4ge1xuXHRcdGNvbnN0IGtpbmQgPSBjaGFuZ2Uua2luZC50eXBlID09PSAndXBkYXRlJyAmJiBjaGFuZ2Uua2luZC5tb3ZlX3BhdGhcblx0XHRcdD8gYHJlbmFtZSBmcm9tICR7Y2hhbmdlLmtpbmQubW92ZV9wYXRofWBcblx0XHRcdDogY2hhbmdlLmtpbmQudHlwZTtcblx0XHRyZXR1cm4gYCR7a2luZH06ICR7Y2hhbmdlLnBhdGh9YDtcblx0fSkuam9pbignXFxuJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaWxlQ2hhbmdlT3V0cHV0KGNoYW5nZXM6IHJlYWRvbmx5IEZpbGVVcGRhdGVDaGFuZ2VbXSk6IHN0cmluZyB7XG5cdHJldHVybiBjaGFuZ2VzLm1hcChjaGFuZ2UgPT4gYCR7ZGVzY3JpYmVGaWxlQ2hhbmdlKFtjaGFuZ2VdKX1cXG4ke2NoYW5nZS5kaWZmfWAudHJpbSgpKS5qb2luKCdcXG5cXG4nKTtcbn1cblxuZnVuY3Rpb24ganNvblZhbHVlVG9UZXh0KHZhbHVlOiBKc29uVmFsdWUpOiBzdHJpbmcge1xuXHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHZhbHVlIDogSlNPTi5zdHJpbmdpZnkodmFsdWUsIG51bGwsIDIpO1xufVxuXG5mdW5jdGlvbiB0b29sSW5wdXRUZXh0KHZhbHVlOiBKc29uVmFsdWUpOiBzdHJpbmcge1xuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsdWUsIG51bGwsIDIpO1xufVxuXG5mdW5jdGlvbiBkeW5hbWljVG9vbE91dHB1dChjb250ZW50SXRlbXM6IHJlYWRvbmx5IER5bmFtaWNUb29sQ2FsbE91dHB1dENvbnRlbnRJdGVtW10gfCBudWxsKTogc3RyaW5nIHtcblx0cmV0dXJuIGNvbnRlbnRJdGVtcz8ubWFwKGl0ZW0gPT4gaXRlbS50eXBlID09PSAnaW5wdXRUZXh0JyA/IGl0ZW0udGV4dCA6IGl0ZW0uaW1hZ2VVcmwpLmpvaW4oJ1xcbicpID8/ICcnO1xufVxuXG5mdW5jdGlvbiBtY3BUb29sT3V0cHV0KHJlc3VsdDogTWNwVG9vbENhbGxSZXN1bHQgfCBudWxsLCBlcnJvck1lc3NhZ2U/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoZXJyb3JNZXNzYWdlKSB7XG5cdFx0cmV0dXJuIGVycm9yTWVzc2FnZTtcblx0fVxuXHRpZiAoIXJlc3VsdCkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXHRjb25zdCBjb250ZW50ID0gcmVzdWx0LmNvbnRlbnQubWFwKGpzb25WYWx1ZVRvVGV4dCkuam9pbignXFxuJyk7XG5cdGNvbnN0IHN0cnVjdHVyZWRDb250ZW50ID0gcmVzdWx0LnN0cnVjdHVyZWRDb250ZW50ICE9PSBudWxsID8ganNvblZhbHVlVG9UZXh0KHJlc3VsdC5zdHJ1Y3R1cmVkQ29udGVudCkgOiAnJztcblx0cmV0dXJuIFtjb250ZW50LCBzdHJ1Y3R1cmVkQ29udGVudF0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJ1xcbicpO1xufVxuXG4vKipcbiAqIEh1bWFuIGxhYmVscyBmb3IgYSBDb2RleCBjb2xsYWItYWdlbnQgKHN1YmFnZW50KSB0b29sIGNhbGwsIG1pcnJvcmluZyB0aGVcbiAqIHJlZmVyZW5jZSBjbGllbnQncyBwaHJhc2luZy4gQ29kZXggc3VyZmFjZXMgc3ViYWdlbnQgb3JjaGVzdHJhdGlvbiBhc1xuICogYGNvbGxhYkFnZW50VG9vbENhbGxgIGl0ZW1zIG9uIHRoZSBwYXJlbnQgdGhyZWFkLCBidXQgZWFjaCBzcGF3bmVkIGFnZW50XG4gKiBBTFNPIHJ1bnMgYXMgaXRzIG93biBjaGlsZCB0aHJlYWQgdGhhdCBlbWl0cyBhIGZ1bGwgYHR1cm4vKmAgKyBgaXRlbS8qYFxuICogZXZlbnQgc3RyZWFtLiBUaGUgaG9zdCAoe0BsaW5rIENvZGV4QWdlbnR9KSByZW5kZXJzIHRoYXQgY2hpbGQgc3RyZWFtIGluIGFcbiAqIHJlYWQtb25seSBwZWVyIGNoYXQgYW5kIGF0dGFjaGVzIGEgZGlzY292ZXJ5IGJsb2NrIHRvIHRoZSBwYXJlbnRcbiAqIGBzcGF3bkFnZW50YCB0b29sIGNhbGw7IHRoZSBsaWZlY3ljbGUgY29sbGFiIHRvb2xzIChgd2FpdGAsIGBjbG9zZUFnZW50YCxcbiAqIGBzZW5kSW5wdXRgLCBcdTIwMjYpIHJlbmRlciBhcyBwbGFpbiB0b29sIGNhbGxzIGluIHRoZSBwYXJlbnQgY2hhdC5cbiAqL1xuZnVuY3Rpb24gY29sbGFiQWdlbnRUb29sTGFiZWxzKHRvb2w6IENvbGxhYkFnZW50VG9vbCk6IHsgcmVhZG9ubHkgZGlzcGxheU5hbWU6IHN0cmluZzsgcmVhZG9ubHkgcHJlc2VudDogc3RyaW5nOyByZWFkb25seSBwYXN0OiBzdHJpbmcgfSB7XG5cdHN3aXRjaCAodG9vbCkge1xuXHRcdGNhc2UgJ3NwYXduQWdlbnQnOiByZXR1cm4geyBkaXNwbGF5TmFtZTogJ1NwYXduIGFnZW50JywgcHJlc2VudDogJ1NwYXduaW5nIGFnZW50JywgcGFzdDogJ1NwYXduZWQgYWdlbnQnIH07XG5cdFx0Y2FzZSAnc2VuZElucHV0JzogcmV0dXJuIHsgZGlzcGxheU5hbWU6ICdTZW5kIGlucHV0IHRvIGFnZW50JywgcHJlc2VudDogJ1NlbmRpbmcgaW5wdXQgdG8gYWdlbnQnLCBwYXN0OiAnU2VudCBpbnB1dCB0byBhZ2VudCcgfTtcblx0XHRjYXNlICdyZXN1bWVBZ2VudCc6IHJldHVybiB7IGRpc3BsYXlOYW1lOiAnUmVzdW1lIGFnZW50JywgcHJlc2VudDogJ1Jlc3VtaW5nIGFnZW50JywgcGFzdDogJ1Jlc3VtZWQgYWdlbnQnIH07XG5cdFx0Y2FzZSAnd2FpdCc6IHJldHVybiB7IGRpc3BsYXlOYW1lOiAnV2FpdCBmb3IgYWdlbnRzJywgcHJlc2VudDogJ1dhaXRpbmcgZm9yIGFnZW50cycsIHBhc3Q6ICdGaW5pc2hlZCB3YWl0aW5nJyB9O1xuXHRcdGNhc2UgJ2Nsb3NlQWdlbnQnOiByZXR1cm4geyBkaXNwbGF5TmFtZTogJ0Nsb3NlIGFnZW50JywgcHJlc2VudDogJ0Nsb3NpbmcgYWdlbnQnLCBwYXN0OiAnQ2xvc2VkIGFnZW50JyB9O1xuXHRcdGRlZmF1bHQ6IHJldHVybiB7IGRpc3BsYXlOYW1lOiB0b29sLCBwcmVzZW50OiB0b29sLCBwYXN0OiB0b29sIH07XG5cdH1cbn1cblxuLyoqIE9uZS1saW5lIHN1bW1hcnkgb2YgYSBzcGF3bmVkIGFnZW50J3Mgc3RhdGUgXHUyMDE0IHRoZSBzdWJhZ2VudCdzIHJlc3VsdC4gKi9cbmZ1bmN0aW9uIGNvbGxhYkFnZW50U3RhdGVTdW1tYXJ5KHN0YXRlOiBDb2xsYWJBZ2VudFN0YXRlKTogc3RyaW5nIHtcblx0c3dpdGNoIChzdGF0ZS5zdGF0dXMpIHtcblx0XHRjYXNlICdjb21wbGV0ZWQnOiByZXR1cm4gc3RhdGUubWVzc2FnZSA/IGBDb21wbGV0ZWQgXHUyMDE0ICR7c3RhdGUubWVzc2FnZX1gIDogJ0NvbXBsZXRlZCc7XG5cdFx0Y2FzZSAnZXJyb3JlZCc6IHJldHVybiBzdGF0ZS5tZXNzYWdlID8gYEVycm9yZWQgXHUyMDE0ICR7c3RhdGUubWVzc2FnZX1gIDogJ0Vycm9yZWQnO1xuXHRcdGNhc2UgJ3J1bm5pbmcnOiByZXR1cm4gc3RhdGUubWVzc2FnZSA/IGBSdW5uaW5nIFx1MjAxNCAke3N0YXRlLm1lc3NhZ2V9YCA6ICdSdW5uaW5nJztcblx0XHRjYXNlICdpbnRlcnJ1cHRlZCc6IHJldHVybiBzdGF0ZS5tZXNzYWdlID8gYEludGVycnVwdGVkIFx1MjAxNCAke3N0YXRlLm1lc3NhZ2V9YCA6ICdJbnRlcnJ1cHRlZCc7XG5cdFx0Y2FzZSAncGVuZGluZ0luaXQnOiByZXR1cm4gJ1BlbmRpbmcgaW5pdCc7XG5cdFx0Y2FzZSAnc2h1dGRvd24nOiByZXR1cm4gJ1NodXRkb3duJztcblx0XHRjYXNlICdub3RGb3VuZCc6IHJldHVybiAnTm90IGZvdW5kJztcblx0XHRkZWZhdWx0OiByZXR1cm4gc3RhdGUuc3RhdHVzO1xuXHR9XG59XG5cbi8qKlxuICogUmVuZGVyIHRoZSBwZXItYWdlbnQgcmVzdWx0IGJsb2NrIGZvciBhIGNvbXBsZXRlZCBjb2xsYWIgdG9vbCBjYWxsLiBQcmVmZXJzXG4gKiB0aGUgcmVjZWl2ZXIgb3JkZXIsIHRoZW4gYXBwZW5kcyBhbnkgb3RoZXIgYWdlbnRzIHByZXNlbnQgaW4gYGFnZW50c1N0YXRlc2AuXG4gKiBUaGUgY29tcGxldGVkIG1lc3NhZ2UgY2FycmllcyB0aGUgc3ViYWdlbnQncyBhY3R1YWwgb3V0cHV0LlxuICovXG5mdW5jdGlvbiBjb2xsYWJBZ2VudFJlc3VsdE91dHB1dChyZWNlaXZlclRocmVhZElkczogcmVhZG9ubHkgc3RyaW5nW10sIGFnZW50c1N0YXRlczogeyByZWFkb25seSBba2V5OiBzdHJpbmddOiBDb2xsYWJBZ2VudFN0YXRlIHwgdW5kZWZpbmVkIH0pOiBzdHJpbmcge1xuXHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IHN0YXRlczogQ29sbGFiQWdlbnRTdGF0ZVtdID0gW107XG5cdGZvciAoY29uc3QgaWQgb2YgcmVjZWl2ZXJUaHJlYWRJZHMpIHtcblx0XHRjb25zdCBzdGF0ZSA9IGFnZW50c1N0YXRlc1tpZF07XG5cdFx0aWYgKHN0YXRlKSB7XG5cdFx0XHRzdGF0ZXMucHVzaChzdGF0ZSk7XG5cdFx0XHRzZWVuLmFkZChpZCk7XG5cdFx0fVxuXHR9XG5cdGZvciAoY29uc3QgaWQgb2YgT2JqZWN0LmtleXMoYWdlbnRzU3RhdGVzKS5zb3J0KCkpIHtcblx0XHRpZiAoc2Vlbi5oYXMoaWQpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3Qgc3RhdGUgPSBhZ2VudHNTdGF0ZXNbaWRdO1xuXHRcdGlmIChzdGF0ZSkge1xuXHRcdFx0c3RhdGVzLnB1c2goc3RhdGUpO1xuXHRcdH1cblx0fVxuXHRpZiAoc3RhdGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXHRpZiAoc3RhdGVzLmxlbmd0aCA9PT0gMSkge1xuXHRcdHJldHVybiBjb2xsYWJBZ2VudFN0YXRlU3VtbWFyeShzdGF0ZXNbMF0pO1xuXHR9XG5cdHJldHVybiBzdGF0ZXMubWFwKChzdGF0ZSwgaW5kZXgpID0+IGBBZ2VudCAke2luZGV4ICsgMX06ICR7Y29sbGFiQWdlbnRTdGF0ZVN1bW1hcnkoc3RhdGUpfWApLmpvaW4oJ1xcbicpO1xufVxuXG4vKipcbiAqIFRyYW5zbGF0ZSBgdHVybi9zdGFydGVkYCBpbnRvIGEgYENoYXRUdXJuU3RhcnRlZGAgYWN0aW9uLlxuICpcbiAqIENvZGV4J3MgYHR1cm4vc3RhcnRlZC50dXJuLml0ZW1zWzBdYCBTSE9VTEQgYmUgdGhlIHVzZXJNZXNzYWdlIHRoYXRcbiAqIGtpY2tlZCBvZmYgdGhlIHR1cm47IHdlIHJlY29uc3RydWN0IHRoZSB1c2VyIG1lc3NhZ2UgZnJvbSBpdC4gSWZcbiAqIGNvZGV4IGRpZG4ndCBpbmNsdWRlIGl0ZW1zIChpdCBtYXkgbm90KSwgd2Ugc3ludGhlc2l6ZSBhbiBlbXB0eSB1c2VyXG4gKiBtZXNzYWdlIHNvIHRoZSBhZ2VudCBob3N0IGNhbiBzdGlsbCBjcmVhdGUgdGhlIHR1cm4gc2hlbGwgXHUyMDE0IHRoZSBhY3R1YWxcbiAqIHByb21wdCB0ZXh0IHdhcyBzZW50IHZpYSBgdHVybi9zdGFydGAgYW5kIGlzIGFscmVhZHkga25vd24gYnkgdGhlIGhvc3RcbiAqIHZpYSB0aGUgcHJpb3IgYHNlbmRNZXNzYWdlYCBjYWxsLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWFwVHVyblN0YXJ0ZWQoXG5cdHN0YXRlOiBJQ29kZXhTZXNzaW9uTWFwU3RhdGUsXG5cdHBhcmFtczogVHVyblN0YXJ0ZWROb3RpZmljYXRpb24sXG5cdGZhbGxiYWNrVXNlclRleHQ6IHN0cmluZyxcbik6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSB7XG5cdHN0YXRlLmN1cnJlbnRUdXJuSWQgPSBwYXJhbXMudHVybi5pZDtcblx0cmVzZXRDb2RleFR1cm5NYXBTdGF0ZShzdGF0ZSk7XG5cdGxldCB1c2VyVGV4dCA9IGZhbGxiYWNrVXNlclRleHQ7XG5cdGNvbnN0IGZpcnN0ID0gcGFyYW1zLnR1cm4uaXRlbXM/LlswXTtcblx0aWYgKGZpcnN0ICYmIGZpcnN0LnR5cGUgPT09ICd1c2VyTWVzc2FnZScpIHtcblx0XHRjb25zdCBjb2xsZWN0ZWQgPSBleHRyYWN0VXNlcklucHV0VGV4dChmaXJzdC5jb250ZW50KTtcblx0XHRpZiAoY29sbGVjdGVkLmxlbmd0aCA+IDApIHtcblx0XHRcdHVzZXJUZXh0ID0gY29sbGVjdGVkO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gW1xuXHRcdHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiBwYXJhbXMudHVybi5pZCxcblx0XHRcdHN0YXJ0ZWRBdDogdHlwZW9mIHBhcmFtcy50dXJuLnN0YXJ0ZWRBdCA9PT0gJ251bWJlcicgPyBuZXcgRGF0ZShwYXJhbXMudHVybi5zdGFydGVkQXQgKiAxMDAwKS50b0lTT1N0cmluZygpIDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiB1c2VyVGV4dCwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH0sXG5cdF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXBSZWFzb25pbmdTdW1tYXJ5UGFydEFkZGVkKFxuXHRzdGF0ZTogSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLFxuXHRwYXJhbXM6IFJlYXNvbmluZ1N1bW1hcnlQYXJ0QWRkZWROb3RpZmljYXRpb24sXG4pOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRyZXR1cm4gZW5zdXJlUmVhc29uaW5nUGFydChzdGF0ZSwgcGFyYW1zLnR1cm5JZCwgcmVhc29uaW5nS2V5KHBhcmFtcy5pdGVtSWQsICdzdW1tYXJ5JywgcGFyYW1zLnN1bW1hcnlJbmRleCkpLmFjdGlvbnM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXBSZWFzb25pbmdTdW1tYXJ5VGV4dERlbHRhKFxuXHRzdGF0ZTogSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLFxuXHRwYXJhbXM6IFJlYXNvbmluZ1N1bW1hcnlUZXh0RGVsdGFOb3RpZmljYXRpb24sXG4pOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRjb25zdCBlbnN1cmVkID0gZW5zdXJlUmVhc29uaW5nUGFydChzdGF0ZSwgcGFyYW1zLnR1cm5JZCwgcmVhc29uaW5nS2V5KHBhcmFtcy5pdGVtSWQsICdzdW1tYXJ5JywgcGFyYW1zLnN1bW1hcnlJbmRleCkpO1xuXHRyZXR1cm4gW1xuXHRcdC4uLmVuc3VyZWQuYWN0aW9ucyxcblx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlYXNvbmluZywgdHVybklkOiBwYXJhbXMudHVybklkLCBwYXJ0SWQ6IGVuc3VyZWQucGFydElkLCBjb250ZW50OiBwYXJhbXMuZGVsdGEgfSxcblx0XTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1hcFJlYXNvbmluZ1RleHREZWx0YShcblx0c3RhdGU6IElDb2RleFNlc3Npb25NYXBTdGF0ZSxcblx0cGFyYW1zOiBSZWFzb25pbmdUZXh0RGVsdGFOb3RpZmljYXRpb24sXG4pOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRjb25zdCBlbnN1cmVkID0gZW5zdXJlUmVhc29uaW5nUGFydChzdGF0ZSwgcGFyYW1zLnR1cm5JZCwgcmVhc29uaW5nS2V5KHBhcmFtcy5pdGVtSWQsICd0ZXh0JywgcGFyYW1zLmNvbnRlbnRJbmRleCkpO1xuXHRyZXR1cm4gW1xuXHRcdC4uLmVuc3VyZWQuYWN0aW9ucyxcblx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlYXNvbmluZywgdHVybklkOiBwYXJhbXMudHVybklkLCBwYXJ0SWQ6IGVuc3VyZWQucGFydElkLCBjb250ZW50OiBwYXJhbXMuZGVsdGEgfSxcblx0XTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyUmVhc29uaW5nRm9ySXRlbShzdGF0ZTogSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLCBpdGVtSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRmb3IgKGNvbnN0IGtleSBvZiBbLi4uc3RhdGUuaXRlbVRvUmVhc29uaW5nUGFydElkLmtleXMoKV0pIHtcblx0XHRpZiAoa2V5LnN0YXJ0c1dpdGgoYCR7aXRlbUlkfTpgKSkge1xuXHRcdFx0c3RhdGUuaXRlbVRvUmVhc29uaW5nUGFydElkLmRlbGV0ZShrZXkpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbWFwVG9rZW5Vc2FnZVVwZGF0ZWQocGFyYW1zOiBUaHJlYWRUb2tlblVzYWdlVXBkYXRlZE5vdGlmaWNhdGlvbik6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSB7XG5cdGNvbnN0IGxhc3QgPSBwYXJhbXMudG9rZW5Vc2FnZS5sYXN0O1xuXHRyZXR1cm4gW3tcblx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRVc2FnZSxcblx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0dXNhZ2U6IHtcblx0XHRcdGlucHV0VG9rZW5zOiBsYXN0LmlucHV0VG9rZW5zLFxuXHRcdFx0b3V0cHV0VG9rZW5zOiBsYXN0Lm91dHB1dFRva2Vucyxcblx0XHRcdGNhY2hlUmVhZFRva2VuczogbGFzdC5jYWNoZWRJbnB1dFRva2Vucyxcblx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdHJlYXNvbmluZ091dHB1dFRva2VuczogbGFzdC5yZWFzb25pbmdPdXRwdXRUb2tlbnMsXG5cdFx0XHRcdG1vZGVsQ29udGV4dFdpbmRvdzogcGFyYW1zLnRva2VuVXNhZ2UubW9kZWxDb250ZXh0V2luZG93LFxuXHRcdFx0fSxcblx0XHR9LFxuXHR9XTtcbn1cblxuLyoqXG4gKiBgaXRlbS9zdGFydGVkYCBmb3IgYW4gYGFnZW50TWVzc2FnZWAgYmVjb21lcyBhIGBDaGF0UmVzcG9uc2VQYXJ0YFxuICogYWN0aW9uIHdpdGggYW4gZW1wdHkgYE1hcmtkb3duUmVzcG9uc2VQYXJ0YCBzaGVsbC4gU3Vic2VxdWVudFxuICogYGl0ZW0vYWdlbnRNZXNzYWdlL2RlbHRhYCBub3RpZmljYXRpb25zIGFwcGVuZCB0byB0aGF0IHBhcnQuXG4gKlxuICogT3RoZXIgaXRlbSB0eXBlcyBhcmUgaWdub3JlZCBpbiBQaGFzZSAyIFx1MjAxNCB0aGV5J2xsIGJlIHBpY2tlZCB1cCBieVxuICogUGhhc2UgNidzIHRvb2wtY2FsbCBtYXBwZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXBJdGVtU3RhcnRlZChcblx0c3RhdGU6IElDb2RleFNlc3Npb25NYXBTdGF0ZSxcblx0cGFyYW1zOiBJdGVtU3RhcnRlZE5vdGlmaWNhdGlvbixcbik6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSB7XG5cdC8vIENvYWxlc2NlIGEgc2FuZGJveCBwcmUtZmxpZ2h0IHdpdGggaXRzIGFwcHJvdmFsLWd1YXJkZWQgcmUtcnVuOiBpZiB0aGVcblx0Ly8gaW1tZWRpYXRlbHktcHJlY2VkaW5nIGNvbW1hbmRFeGVjdXRpb24gaW4gdGhpcyB0dXJuIHJhbiB0aGUgc2FtZSBjb21tYW5kXG5cdC8vIGFuZCBjb21wbGV0ZWQgd2l0aCBubyBvdXRwdXQgKGRlZmVycmVkIGFzIGEgcGVuZGluZyBwcmUtZmxpZ2h0KSwgcmV1c2UgaXRzXG5cdC8vIHN0aWxsLW9wZW4gdG9vbCBjYWxsIGluc3RlYWQgb2Ygb3BlbmluZyBhIHNlY29uZCBib3guIFRoZSBlc2NhbGF0aW9uJ3Ncblx0Ly8gYHJlcXVlc3RBcHByb3ZhbGAgLyBgaXRlbS9jb21wbGV0ZWRgIHRoZW4gZHJpdmUgdGhhdCBib3ggdG8gaXRzIGZpbmFsXG5cdC8vIHN0YXRlLCBzbyBub3RoaW5nIG5ldyBpcyBlbWl0dGVkIGhlcmUuXG5cdGlmIChwYXJhbXMuaXRlbS50eXBlID09PSAnY29tbWFuZEV4ZWN1dGlvbicpIHtcblx0XHRjb25zdCBwZW5kaW5nID0gc3RhdGUucGVuZGluZ1ByZWZsaWdodDtcblx0XHRpZiAocGVuZGluZyAmJiBwZW5kaW5nLnR1cm5JZCA9PT0gcGFyYW1zLnR1cm5JZCAmJiBwZW5kaW5nLmNvbW1hbmQgPT09IHVud3JhcFNoZWxsSW52b2NhdGlvbihwYXJhbXMuaXRlbS5jb21tYW5kID8/ICcnKSkge1xuXHRcdFx0c3RhdGUucGVuZGluZ1ByZWZsaWdodCA9IHVuZGVmaW5lZDtcblx0XHRcdHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLnNldChwYXJhbXMuaXRlbS5pZCwge1xuXHRcdFx0XHR0b29sQ2FsbElkOiBwZW5kaW5nLnRvb2xDYWxsSWQsXG5cdFx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdFx0dG9vbE5hbWU6ICdzaGVsbCcsXG5cdFx0XHRcdG91dHB1dDogJycsXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblx0Ly8gQW55IG90aGVyIGl0ZW0gc3VwZXJzZWRlcyBhIGRlZmVycmVkIHByZS1mbGlnaHQ6IGZpbmFsaXplIGl0IGZpcnN0IHNvIGFcblx0Ly8gZ2VudWluZWx5IG91dHB1dC1sZXNzIGNvbW1hbmQgc3RpbGwgcmVuZGVycyBwcm9tcHRseSBhcyBhIHNpbmdsZSBib3guXG5cdGNvbnN0IGZsdXNoZWQgPSBmbHVzaFBlbmRpbmdQcmVmbGlnaHQoc3RhdGUpO1xuXHRjb25zdCBib2R5ID0gbWFwSXRlbVN0YXJ0ZWRCb2R5KHN0YXRlLCBwYXJhbXMpO1xuXHRyZXR1cm4gZmx1c2hlZC5sZW5ndGggPT09IDAgPyBib2R5IDogWy4uLmZsdXNoZWQsIC4uLmJvZHldO1xufVxuXG5mdW5jdGlvbiBtYXBJdGVtU3RhcnRlZEJvZHkoXG5cdHN0YXRlOiBJQ29kZXhTZXNzaW9uTWFwU3RhdGUsXG5cdHBhcmFtczogSXRlbVN0YXJ0ZWROb3RpZmljYXRpb24sXG4pOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRpZiAocGFyYW1zLml0ZW0udHlwZSA9PT0gJ2FnZW50TWVzc2FnZScpIHtcblx0XHRjb25zdCBwYXJ0SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRzdGF0ZS5pdGVtVG9QYXJ0SWQuc2V0KHBhcmFtcy5pdGVtLmlkLCBwYXJ0SWQpO1xuXHRcdC8vIFNlcGFyYXRlIGNvbnNlY3V0aXZlIGFnZW50IG1lc3NhZ2VzIHNvIHRoZSBjaGF0IG1vZGVsJ3Mgc2VwYXJhdG9yLWxlc3Ncblx0XHQvLyBtYXJrZG93biBjb2FsZXNjaW5nIGRvZXNuJ3QgZ2x1ZSBhIGZvbGxvd2luZyBoZWFkaW5nIG9udG8gdGhlIHByaW9yIGxpbmUuXG5cdFx0Y29uc3Qgc2VwYXJhdG9yID0gc3RhdGUuYWdlbnRNZXNzYWdlUGFydENvdW50ID4gMCA/ICdcXG5cXG4nIDogJyc7XG5cdFx0c3RhdGUuYWdlbnRNZXNzYWdlUGFydENvdW50Kys7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LFxuXHRcdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRcdHBhcnQ6IHtcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLFxuXHRcdFx0XHRcdGlkOiBwYXJ0SWQsXG5cdFx0XHRcdFx0Y29udGVudDogc2VwYXJhdG9yICsgKHBhcmFtcy5pdGVtLnRleHQgPz8gJycpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRdO1xuXHR9XG5cdGlmIChwYXJhbXMuaXRlbS50eXBlID09PSAnY29tbWFuZEV4ZWN1dGlvbicpIHtcblx0XHQvLyBQaGFzZSA0OiBzdXJmYWNlIHNoZWxsIGNvbW1hbmRzIGFzIHRvb2wgY2FsbHMuIFdlIGFsbG9jYXRlIGFcblx0XHQvLyBmcmVzaCB0b29sQ2FsbElkOyB0aGUgYGNvbW1hbmRFeGVjdXRpb25gIGl0ZW0gaWQgb25seVxuXHRcdC8vIGRpc2FtYmlndWF0ZXMgdGhlIGNvZGV4IHNpZGUuXG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLnNldChwYXJhbXMuaXRlbS5pZCwge1xuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdHRvb2xOYW1lOiAnc2hlbGwnLFxuXHRcdFx0b3V0cHV0OiAnJyxcblx0XHR9KTtcblx0XHRjb25zdCBjb21tYW5kID0gdW53cmFwU2hlbGxJbnZvY2F0aW9uKHBhcmFtcy5pdGVtLmNvbW1hbmQgPz8gJycpO1xuXHRcdHJldHVybiBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0dG9vbE5hbWU6ICdzaGVsbCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIHNoZWxsIGNvbW1hbmQnLFxuXHRcdFx0XHRfbWV0YTogdG9Ub29sQ2FsbE1ldGEoeyB0b29sS2luZDogJ3Rlcm1pbmFsJyB9KSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGEsXG5cdFx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0Y29udGVudDogY29tbWFuZCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGNvbW1hbmQsXG5cdFx0XHRcdHRvb2xJbnB1dDogY29tbWFuZCxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdF9tZXRhOiB0b1Rvb2xDYWxsTWV0YSh7IHRvb2xLaW5kOiAndGVybWluYWwnIH0pLFxuXHRcdFx0fSxcblx0XHRdO1xuXHR9XG5cdGlmIChwYXJhbXMuaXRlbS50eXBlID09PSAnd2ViU2VhcmNoJykge1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5zZXQocGFyYW1zLml0ZW0uaWQsIHtcblx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHR0b29sTmFtZTogJ3dlYl9zZWFyY2gnLFxuXHRcdFx0b3V0cHV0OiAnJyxcblx0XHR9KTtcblx0XHRjb25zdCBxdWVyeSA9IGRlc2NyaWJlV2ViU2VhcmNoKHBhcmFtcy5pdGVtLnF1ZXJ5LCBwYXJhbXMuaXRlbS5hY3Rpb24pO1xuXHRcdHJldHVybiBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0dG9vbE5hbWU6ICd3ZWJfc2VhcmNoJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdXZWIgc2VhcmNoJyxcblx0XHRcdFx0X21ldGE6IHRvVG9vbENhbGxNZXRhKHsgdG9vbEtpbmQ6ICdzZWFyY2gnIH0pLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRjb250ZW50OiBxdWVyeSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHF1ZXJ5LFxuXHRcdFx0XHR0b29sSW5wdXQ6IHF1ZXJ5LFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0X21ldGE6IHRvVG9vbENhbGxNZXRhKHsgdG9vbEtpbmQ6ICdzZWFyY2gnIH0pLFxuXHRcdFx0fSxcblx0XHRdO1xuXHR9XG5cdGlmIChwYXJhbXMuaXRlbS50eXBlID09PSAnZmlsZUNoYW5nZScpIHtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gZmlsZUNoYW5nZU91dHB1dChwYXJhbXMuaXRlbS5jaGFuZ2VzKTtcblx0XHRzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5zZXQocGFyYW1zLml0ZW0uaWQsIHtcblx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHR0b29sTmFtZTogJ2ZpbGVfZWRpdCcsXG5cdFx0XHRvdXRwdXQsXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc3VtbWFyeSA9IGRlc2NyaWJlRmlsZUNoYW5nZShwYXJhbXMuaXRlbS5jaGFuZ2VzKSB8fCAnQXBwbHkgZmlsZSBjaGFuZ2VzJztcblx0XHRyZXR1cm4gW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdHRvb2xOYW1lOiAnZmlsZV9lZGl0Jyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdBcHBseSBmaWxlIGNoYW5nZXMnLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRjb250ZW50OiBzdW1tYXJ5LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogc3VtbWFyeSxcblx0XHRcdFx0dG9vbElucHV0OiBzdW1tYXJ5LFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0sXG5cdFx0XHQuLi4ob3V0cHV0ID8gW3tcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb250ZW50Q2hhbmdlZCxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogb3V0cHV0IH1dLFxuXHRcdFx0fSBzYXRpc2ZpZXMgU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb25dIDogW10pLFxuXHRcdF07XG5cdH1cblx0aWYgKHBhcmFtcy5pdGVtLnR5cGUgPT09ICdtY3BUb29sQ2FsbCcpIHtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgdG9vbE5hbWUgPSBgJHtwYXJhbXMuaXRlbS5zZXJ2ZXJ9LiR7cGFyYW1zLml0ZW0udG9vbH1gO1xuXHRcdGNvbnN0IHRvb2xJbnB1dCA9IHRvb2xJbnB1dFRleHQocGFyYW1zLml0ZW0uYXJndW1lbnRzKTtcblx0XHRjb25zdCBjdXN0b21pemF0aW9uSWQgPSBzdGF0ZS5tY3BDdXN0b21pemF0aW9uSWRzLmdldChwYXJhbXMuaXRlbS5zZXJ2ZXIpO1xuXHRcdHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLnNldChwYXJhbXMuaXRlbS5pZCwge1xuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdHRvb2xOYW1lLFxuXHRcdFx0b3V0cHV0OiAnJyxcblx0XHR9KTtcblx0XHRyZXR1cm4gW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdHRvb2xOYW1lLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogcGFyYW1zLml0ZW0udG9vbCxcblx0XHRcdFx0Li4uKGN1c3RvbWl6YXRpb25JZCA/IHsgY29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQLCBjdXN0b21pemF0aW9uSWQgfSB9IDoge30pLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRjb250ZW50OiB0b29sSW5wdXQsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBgQ2FsbGluZyAke3Rvb2xOYW1lfWAsXG5cdFx0XHRcdHRvb2xJbnB1dCxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9LFxuXHRcdF07XG5cdH1cblx0aWYgKHBhcmFtcy5pdGVtLnR5cGUgPT09ICdkeW5hbWljVG9vbENhbGwnKSB7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHRvb2xOYW1lID0gcGFyYW1zLml0ZW0ubmFtZXNwYWNlID8gYCR7cGFyYW1zLml0ZW0ubmFtZXNwYWNlfS4ke3BhcmFtcy5pdGVtLnRvb2x9YCA6IHBhcmFtcy5pdGVtLnRvb2w7XG5cdFx0Y29uc3QgdG9vbElucHV0ID0gdG9vbElucHV0VGV4dChwYXJhbXMuaXRlbS5hcmd1bWVudHMpO1xuXHRcdGNvbnN0IG91dHB1dCA9IGR5bmFtaWNUb29sT3V0cHV0KHBhcmFtcy5pdGVtLmNvbnRlbnRJdGVtcyk7XG5cdFx0Ly8gU2VydmVyIHRvb2xzIChyZWdpc3RlcmVkIHVuZGVyIHRoZWlyIGJhcmUgbmFtZSkgZXhlY3V0ZSBpbi1wcm9jZXNzLCBzb1xuXHRcdC8vIHRoZXkgY2Fycnkgbm8gYENsaWVudGAgY29udHJpYnV0b3I7IG9ubHkgY2xpZW50LXByb3ZpZGVkIHRvb2xzIHJvdXRlXG5cdFx0Ly8gZXhlY3V0aW9uIGJhY2sgdG8gdGhlIG93bmluZyB3b3JrYmVuY2ggY2xpZW50LlxuXHRcdGNvbnN0IGlzU2VydmVyVG9vbCA9IHBhcmFtcy5pdGVtLm5hbWVzcGFjZSA9PT0gbnVsbCAmJiBzdGF0ZS5zZXJ2ZXJUb29sTmFtZXMuaGFzKHBhcmFtcy5pdGVtLnRvb2wpO1xuXHRcdGNvbnN0IG93bmVyQ2xpZW50SWQgPSBpc1NlcnZlclRvb2wgPyB1bmRlZmluZWQgOiBzdGF0ZS5jbGllbnRUb29sU2V0Lm93bmVyT2YocGFyYW1zLml0ZW0udG9vbCk7XG5cdFx0Y29uc3Qgc2VydmVyRGlzcGxheSA9IGdldFNlcnZlclRvb2xEaXNwbGF5KHBhcmFtcy5pdGVtLnRvb2wsIHBhcmFtcy5pdGVtLmFyZ3VtZW50cyk7XG5cdFx0c3RhdGUuaXRlbVRvVG9vbENhbGwuc2V0KHBhcmFtcy5pdGVtLmlkLCB7XG5cdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0dG9vbE5hbWUsXG5cdFx0XHRvdXRwdXQsXG5cdFx0fSk7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHR0b29sTmFtZSxcblx0XHRcdFx0ZGlzcGxheU5hbWU6IHNlcnZlckRpc3BsYXk/LmRpc3BsYXlOYW1lID8/IHBhcmFtcy5pdGVtLnRvb2wsXG5cdFx0XHRcdC4uLihvd25lckNsaWVudElkID8geyBjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiBvd25lckNsaWVudElkIH0gfSA6IHt9KSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGEsXG5cdFx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0Y29udGVudDogdG9vbElucHV0LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogc2VydmVyRGlzcGxheT8uaW52b2NhdGlvbk1lc3NhZ2UgPz8gYENhbGxpbmcgJHt0b29sTmFtZX1gLFxuXHRcdFx0XHR0b29sSW5wdXQsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSxcblx0XHRcdC4uLihvdXRwdXQgPyBbe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLFxuXHRcdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiBvdXRwdXQgfV0sXG5cdFx0XHR9IHNhdGlzZmllcyBTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbl0gOiBbXSksXG5cdFx0XTtcblx0fVxuXHRpZiAocGFyYW1zLml0ZW0udHlwZSA9PT0gJ2NvbGxhYkFnZW50VG9vbENhbGwnKSB7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IGxhYmVscyA9IGNvbGxhYkFnZW50VG9vbExhYmVscyhwYXJhbXMuaXRlbS50b29sKTtcblx0XHRjb25zdCB0b29sTmFtZSA9IGBjb2RleC4ke3BhcmFtcy5pdGVtLnRvb2x9YDtcblx0XHRzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5zZXQocGFyYW1zLml0ZW0uaWQsIHtcblx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHR0b29sTmFtZSxcblx0XHRcdG91dHB1dDogJycsXG5cdFx0fSk7XG5cdFx0Ly8gYHNwYXduQWdlbnRgIG9wZW5zIGEgcmVhZC1vbmx5IHBlZXIgY2hhdCBmb3IgdGhlIGNoaWxkIHRocmVhZCAodGhlXG5cdFx0Ly8gaG9zdCBhdHRhY2hlcyB0aGUgc3ViYWdlbnQtZGlzY292ZXJ5IGJsb2NrIHRvIFRISVMgdG9vbCBjYWxsIG9uXG5cdFx0Ly8gYHN1YmFnZW50X3N0YXJ0ZWRgKSwgc28gd2UgZGVsaWJlcmF0ZWx5IGRvIE5PVCBkdW1wIHRoZSByYXcgcHJvbXB0XG5cdFx0Ly8gaW50byB0aGUgdG9vbCBib3ggXHUyMDE0IGl0IHdvdWxkIGR1cGxpY2F0ZSB0aGUgY2hpbGQgY2hhdCdzIGZpcnN0IHVzZXJcblx0XHQvLyBtZXNzYWdlIGFuZCBibG93IG91dCB0aGUgdG9vbC1jYWxsIHdpZHRoLiBUaGUgb3RoZXIgY29sbGFiIHRvb2xzXG5cdFx0Ly8gKGBzZW5kSW5wdXRgLCBgd2FpdGAsIGBjbG9zZUFnZW50YCwgXHUyMDI2KSBhcmUgbGlmZWN5Y2xlIG9wcyB3aXRoIG5vIHBlZXJcblx0XHQvLyBjaGF0LCBzbyB0aGV5IGtlZXAgYSBjb21wYWN0IHByb21wdC9tb2RlbCBzdW1tYXJ5LlxuXHRcdGlmIChwYXJhbXMuaXRlbS50b29sID09PSAnc3Bhd25BZ2VudCcpIHtcblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRcdHRvb2xOYW1lLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiBsYWJlbHMuZGlzcGxheU5hbWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBsYWJlbHMucHJlc2VudCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0UGFydHM6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKHBhcmFtcy5pdGVtLnByb21wdCkge1xuXHRcdFx0aW5wdXRQYXJ0cy5wdXNoKHBhcmFtcy5pdGVtLnByb21wdCk7XG5cdFx0fVxuXHRcdGlmIChwYXJhbXMuaXRlbS5tb2RlbCkge1xuXHRcdFx0aW5wdXRQYXJ0cy5wdXNoKGBNb2RlbDogJHtwYXJhbXMuaXRlbS5tb2RlbH1gKTtcblx0XHR9XG5cdFx0Y29uc3QgdG9vbElucHV0ID0gaW5wdXRQYXJ0cy5qb2luKCdcXG5cXG4nKTtcblx0XHRyZXR1cm4gW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdHRvb2xOYW1lLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogbGFiZWxzLmRpc3BsYXlOYW1lLFxuXHRcdFx0fSxcblx0XHRcdC4uLih0b29sSW5wdXQgPyBbe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhLFxuXHRcdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdGNvbnRlbnQ6IHRvb2xJbnB1dCxcblx0XHRcdH0gc2F0aXNmaWVzIFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uXSA6IFtdKSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbGFiZWxzLnByZXNlbnQsXG5cdFx0XHRcdHRvb2xJbnB1dCxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9LFxuXHRcdF07XG5cdH1cblx0cmV0dXJuIFtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWFwQ29tbWFuZEV4ZWN1dGlvbk91dHB1dERlbHRhKFxuXHRzdGF0ZTogSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLFxuXHRwYXJhbXM6IENvbW1hbmRFeGVjdXRpb25PdXRwdXREZWx0YU5vdGlmaWNhdGlvbixcbik6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSB7XG5cdGNvbnN0IGVudHJ5ID0gc3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KHBhcmFtcy5pdGVtSWQpO1xuXHRpZiAoIWVudHJ5KSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGVudHJ5Lm91dHB1dCArPSBwYXJhbXMuZGVsdGE7XG5cdHJldHVybiBbe1xuXHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29udGVudENoYW5nZWQsXG5cdFx0dHVybklkOiBlbnRyeS50dXJuSWQsXG5cdFx0dG9vbENhbGxJZDogZW50cnkudG9vbENhbGxJZCxcblx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogZW50cnkub3V0cHV0IH1dLFxuXHR9XTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1hcEZpbGVDaGFuZ2VQYXRjaFVwZGF0ZWQoXG5cdHN0YXRlOiBJQ29kZXhTZXNzaW9uTWFwU3RhdGUsXG5cdHBhcmFtczogRmlsZUNoYW5nZVBhdGNoVXBkYXRlZE5vdGlmaWNhdGlvbixcbik6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSB7XG5cdGNvbnN0IGVudHJ5ID0gc3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KHBhcmFtcy5pdGVtSWQpO1xuXHRpZiAoIWVudHJ5KSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGVudHJ5Lm91dHB1dCA9IGZpbGVDaGFuZ2VPdXRwdXQocGFyYW1zLmNoYW5nZXMpO1xuXHRyZXR1cm4gW3tcblx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLFxuXHRcdHR1cm5JZDogZW50cnkudHVybklkLFxuXHRcdHRvb2xDYWxsSWQ6IGVudHJ5LnRvb2xDYWxsSWQsXG5cdFx0Y29udGVudDogZW50cnkub3V0cHV0ID8gW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IGVudHJ5Lm91dHB1dCB9XSA6IFtdLFxuXHR9XTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1hcEZpbGVDaGFuZ2VPdXRwdXREZWx0YShcblx0c3RhdGU6IElDb2RleFNlc3Npb25NYXBTdGF0ZSxcblx0cGFyYW1zOiBGaWxlQ2hhbmdlT3V0cHV0RGVsdGFOb3RpZmljYXRpb24sXG4pOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRjb25zdCBlbnRyeSA9IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldChwYXJhbXMuaXRlbUlkKTtcblx0aWYgKCFlbnRyeSkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRlbnRyeS5vdXRwdXQgKz0gcGFyYW1zLmRlbHRhO1xuXHRyZXR1cm4gW3tcblx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLFxuXHRcdHR1cm5JZDogZW50cnkudHVybklkLFxuXHRcdHRvb2xDYWxsSWQ6IGVudHJ5LnRvb2xDYWxsSWQsXG5cdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IGVudHJ5Lm91dHB1dCB9XSxcblx0fV07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXBNY3BUb29sQ2FsbFByb2dyZXNzKFxuXHRzdGF0ZTogSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLFxuXHRwYXJhbXM6IE1jcFRvb2xDYWxsUHJvZ3Jlc3NOb3RpZmljYXRpb24sXG4pOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRjb25zdCBlbnRyeSA9IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldChwYXJhbXMuaXRlbUlkKTtcblx0aWYgKCFlbnRyeSkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRlbnRyeS5vdXRwdXQgPSBbZW50cnkub3V0cHV0LCBwYXJhbXMubWVzc2FnZV0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJ1xcbicpO1xuXHRyZXR1cm4gW3tcblx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLFxuXHRcdHR1cm5JZDogZW50cnkudHVybklkLFxuXHRcdHRvb2xDYWxsSWQ6IGVudHJ5LnRvb2xDYWxsSWQsXG5cdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IGVudHJ5Lm91dHB1dCB9XSxcblx0fV07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXBBZ2VudE1lc3NhZ2VEZWx0YShcblx0c3RhdGU6IElDb2RleFNlc3Npb25NYXBTdGF0ZSxcblx0cGFyYW1zOiBBZ2VudE1lc3NhZ2VEZWx0YU5vdGlmaWNhdGlvbixcbik6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSB7XG5cdGNvbnN0IHBhcnRJZCA9IHN0YXRlLml0ZW1Ub1BhcnRJZC5nZXQocGFyYW1zLml0ZW1JZCk7XG5cdGlmICghcGFydElkKSB7XG5cdFx0Ly8gR290IGEgZGVsdGEgYmVmb3JlIHdlIHNhdyB0aGUgY29ycmVzcG9uZGluZyBgaXRlbS9zdGFydGVkYC5cblx0XHQvLyBEcm9wIGl0IFx1MjAxNCBQaGFzZSAyIGlzIGJlc3QtZWZmb3J0IGFuZCB0aGUgbG9zdCB0ZXh0IGlzIHJlcGxhY2VkXG5cdFx0Ly8gd2hlbiBgaXRlbS9jb21wbGV0ZWRgIGFycml2ZXMgd2l0aCB0aGUgZnVsbCBgdGV4dGAgZmllbGQuXG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdHJldHVybiBbXG5cdFx0e1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0RGVsdGEsXG5cdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRwYXJ0SWQsXG5cdFx0XHRjb250ZW50OiBwYXJhbXMuZGVsdGEsXG5cdFx0fSxcblx0XTtcbn1cblxuLyoqXG4gKiBgaXRlbS9jb21wbGV0ZWRgIGZvciBhbiBgYWdlbnRNZXNzYWdlYCBcdTIwMTQgdGhlIHBhcnQgaXMgZmluYWxpemVkIHNlcnZlclxuICogc2lkZS4gRm9yIFBoYXNlIDIgd2UgZG9uJ3QgbmVlZCB0byBlbWl0IGFuIGV4dHJhIGFjdGlvbjogdGhlIGRlbHRhc1xuICogYWxyZWFkeSB1cGRhdGVkIHRoZSBwYXJ0J3MgY29udGVudC4gV2UganVzdCBkcm9wIHRoZSBtYXBwaW5nIHNvIHRoZVxuICogbWVtb3J5IHByZXNzdXJlIHN0YXlzIGJvdW5kZWQuXG4gKlxuICogRm9yIGBjb21tYW5kRXhlY3V0aW9uYCwgZW1pdCBhIHN5bnRoZXRpYyBgQ2hhdFRvb2xDYWxsUmVhZHlgXG4gKiAoYXV0by1jb25maXJtZWQ7IHRoZSBjb2RleCBzZXJ2ZXIgYWxyZWFkeSBkZWNpZGVkIHRvIHJ1biB0aGUgY29tbWFuZFxuICogXHUyMDE0IGFueSBob3N0LXNpZGUgYXBwcm92YWwgd2FzIHNldHRsZWQgdmlhIHRoZSBgcmVxdWVzdEFwcHJvdmFsYFxuICogc2VydmVyLXJlcXVlc3QgaGFuZGxlciBiZWZvcmUgd2UgZ290IGhlcmUpIGZvbGxvd2VkIGJ5IGFcbiAqIGBDaGF0VG9vbENhbGxDb21wbGV0ZWAgY2FycnlpbmcgdGhlIGFnZ3JlZ2F0ZWQgb3V0cHV0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWFwSXRlbUNvbXBsZXRlZChcblx0c3RhdGU6IElDb2RleFNlc3Npb25NYXBTdGF0ZSxcblx0cGFyYW1zOiBJdGVtQ29tcGxldGVkTm90aWZpY2F0aW9uLFxuKTogKFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uKVtdIHtcblx0aWYgKHBhcmFtcy5pdGVtLnR5cGUgPT09ICdhZ2VudE1lc3NhZ2UnKSB7XG5cdFx0c3RhdGUuaXRlbVRvUGFydElkLmRlbGV0ZShwYXJhbXMuaXRlbS5pZCk7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGlmIChwYXJhbXMuaXRlbS50eXBlID09PSAncmVhc29uaW5nJykge1xuXHRcdGNsZWFyUmVhc29uaW5nRm9ySXRlbShzdGF0ZSwgcGFyYW1zLml0ZW0uaWQpO1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHQvLyBFdmVyeSByZW1haW5pbmcgaXRlbSB0eXBlIGlzIGEgdG9vbCBjYWxsLiBSZXNvbHZlIHRoZSB0cmFja2VkIGVudHJ5IGFuZFxuXHQvLyBkcmFpbiB0aGUgaG9zdC1kZWNsaW5lIGZsYWcgaGVyZSwgb25jZSwgc28gYWxsIGNvbXBsZXRpb24gcGF0aHMgdHJlYXQgYVxuXHQvLyBkZWNsaW5lZCB0b29sIHVuaWZvcm1seSAocmVwb3J0ZWQgYXMgYHVzZXJDYW5jZWxsZWRgIHZpYVxuXHQvLyBgZXJyb3IuY29kZSA9ICdkZW5pZWQnYCkgaW5zdGVhZCBvZiBkZXBlbmRpbmcgb24gd2hpY2ggdG9vbCB0eXBlIGNvbXBsZXRlZC5cblx0Y29uc3QgZW50cnkgPSBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQocGFyYW1zLml0ZW0uaWQpO1xuXHRpZiAoIWVudHJ5KSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmRlbGV0ZShwYXJhbXMuaXRlbS5pZCk7XG5cdGNvbnN0IGRlY2xpbmVkID0gc3RhdGUuZGVjbGluZWRUb29sQ2FsbHMuZGVsZXRlKGVudHJ5LnRvb2xDYWxsSWQpO1xuXHRpZiAocGFyYW1zLml0ZW0udHlwZSA9PT0gJ2NvbW1hbmRFeGVjdXRpb24nKSB7XG5cdFx0Y29uc3Qgc3VjY2VzcyA9IHBhcmFtcy5pdGVtLnN0YXR1cyA9PT0gJ2NvbXBsZXRlZCcgJiYgKHBhcmFtcy5pdGVtLmV4aXRDb2RlID09PSAwIHx8IHBhcmFtcy5pdGVtLmV4aXRDb2RlID09PSBudWxsKTtcblx0XHRjb25zdCBvdXRwdXQgPSBwYXJhbXMuaXRlbS5hZ2dyZWdhdGVkT3V0cHV0ID8/IGVudHJ5Lm91dHB1dDtcblx0XHRjb25zdCBjb21tYW5kID0gdW53cmFwU2hlbGxJbnZvY2F0aW9uKHBhcmFtcy5pdGVtLmNvbW1hbmQgPz8gJycpO1xuXHRcdGNvbnN0IGV4aXQgPSBwYXJhbXMuaXRlbS5leGl0Q29kZTtcblx0XHRjb25zdCBwYXN0VGVuc2UgPSBzdWNjZXNzXG5cdFx0XHQ/IGBSYW4gXFxgJHtjb21tYW5kfVxcYGBcblx0XHRcdDogZXhpdCAhPT0gbnVsbFxuXHRcdFx0XHQ/IGBSYW4gXFxgJHtjb21tYW5kfVxcYCAoZXhpdCAke2V4aXR9KWBcblx0XHRcdFx0OiBgUmFuIFxcYCR7Y29tbWFuZH1cXGAgKGZhaWxlZClgO1xuXHRcdGNvbnN0IGNvbXBsZXRpb246IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiBlbnRyeS50dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IGVudHJ5LnRvb2xDYWxsSWQsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHN1Y2Nlc3MsXG5cdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogcGFzdFRlbnNlLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IG91dHB1dFxuXHRcdFx0XHRcdFx0PyBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogb3V0cHV0IH1dXG5cdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRlcnJvcjogc3VjY2VzcyA/IHVuZGVmaW5lZCA6IHtcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGV4aXQgIT09IG51bGwgPyBgRXhpdCBjb2RlICR7ZXhpdH1gIDogJ0NvbW1hbmQgZmFpbGVkJyxcblx0XHRcdFx0XHRcdC4uLihkZWNsaW5lZCA/IHsgY29kZTogJ2RlbmllZCcgfSA6IHt9KSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRdO1xuXHRcdC8vIEEgc3VjY2Vzc2Z1bCBjb21tYW5kIHRoYXQgcHJvZHVjZWQgTk8gb3V0cHV0IG1heSBiZSBhIHNhbmRib3hcblx0XHQvLyBwcmUtZmxpZ2h0IHRoYXQgQ29kZXggd2lsbCBpbW1lZGlhdGVseSByZS1ydW4gdW5kZXIgYW4gYXBwcm92YWwgcHJvbXB0XG5cdFx0Ly8gKHNhbWUgY29tbWFuZCwgbmV3IGl0ZW0pLiBEZWZlciBpdHMgY29tcGxldGlvbiBzbyB0aGUgcmUtcnVuIGNhbiByZXVzZVxuXHRcdC8vIHRoaXMgYm94OyBpZiBubyByZS1ydW4gYXJyaXZlcywgaXQgaXMgZmx1c2hlZCBvbiB0aGUgbmV4dCBpdGVtIG9yIGF0XG5cdFx0Ly8gdHVybiBlbmQgKHNlZSBtYXBJdGVtU3RhcnRlZCAvIG1hcFR1cm5Db21wbGV0ZWQpLlxuXHRcdGlmIChzdWNjZXNzICYmICFvdXRwdXQgJiYgIWRlY2xpbmVkKSB7XG5cdFx0XHRjb25zdCBmbHVzaGVkID0gZmx1c2hQZW5kaW5nUHJlZmxpZ2h0KHN0YXRlKTtcblx0XHRcdHN0YXRlLnBlbmRpbmdQcmVmbGlnaHQgPSB7IHRvb2xDYWxsSWQ6IGVudHJ5LnRvb2xDYWxsSWQsIHR1cm5JZDogZW50cnkudHVybklkLCBjb21tYW5kLCBjb21wbGV0aW9uIH07XG5cdFx0XHRyZXR1cm4gZmx1c2hlZDtcblx0XHR9XG5cdFx0cmV0dXJuIFsuLi5mbHVzaFBlbmRpbmdQcmVmbGlnaHQoc3RhdGUpLCAuLi5jb21wbGV0aW9uXTtcblx0fVxuXHRpZiAocGFyYW1zLml0ZW0udHlwZSA9PT0gJ3dlYlNlYXJjaCcpIHtcblx0XHRjb25zdCBxdWVyeSA9IGRlc2NyaWJlV2ViU2VhcmNoKHBhcmFtcy5pdGVtLnF1ZXJ5LCBwYXJhbXMuaXRlbS5hY3Rpb24pO1xuXHRcdHJldHVybiBbe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdHR1cm5JZDogZW50cnkudHVybklkLFxuXHRcdFx0dG9vbENhbGxJZDogZW50cnkudG9vbENhbGxJZCxcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBgU2VhcmNoZWQgJHtxdWVyeX1gLFxuXHRcdFx0fSxcblx0XHR9XTtcblx0fVxuXHRpZiAocGFyYW1zLml0ZW0udHlwZSA9PT0gJ2ZpbGVDaGFuZ2UnKSB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gZmlsZUNoYW5nZU91dHB1dChwYXJhbXMuaXRlbS5jaGFuZ2VzKSB8fCBlbnRyeS5vdXRwdXQ7XG5cdFx0Y29uc3Qgc3VjY2VzcyA9IHBhcmFtcy5pdGVtLnN0YXR1cyA9PT0gJ2NvbXBsZXRlZCc7XG5cdFx0Y29uc3QgY29udGVudCA9IG91dHB1dCA/IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0IGFzIGNvbnN0LCB0ZXh0OiBvdXRwdXQgfV0gOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmVzdWx0ID0ge1xuXHRcdFx0c3VjY2Vzcyxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHN1Y2Nlc3MgPyAnQXBwbGllZCBmaWxlIGNoYW5nZXMnIDogJ0ZhaWxlZCB0byBhcHBseSBmaWxlIGNoYW5nZXMnLFxuXHRcdFx0Y29udGVudCxcblx0XHRcdC4uLihzdWNjZXNzID8ge30gOiB7IGVycm9yOiB7IG1lc3NhZ2U6IGBQYXRjaCAke3BhcmFtcy5pdGVtLnN0YXR1c31gLCAuLi4oZGVjbGluZWQgPyB7IGNvZGU6ICdkZW5pZWQnIH0gOiB7fSkgfSB9KSxcblx0XHR9O1xuXHRcdHJldHVybiBbe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdHR1cm5JZDogZW50cnkudHVybklkLFxuXHRcdFx0dG9vbENhbGxJZDogZW50cnkudG9vbENhbGxJZCxcblx0XHRcdHJlc3VsdCxcblx0XHR9XTtcblx0fVxuXHRpZiAocGFyYW1zLml0ZW0udHlwZSA9PT0gJ21jcFRvb2xDYWxsJykge1xuXHRcdGNvbnN0IHN1Y2Nlc3MgPSBwYXJhbXMuaXRlbS5zdGF0dXMgPT09ICdjb21wbGV0ZWQnICYmICFwYXJhbXMuaXRlbS5lcnJvcjtcblx0XHRjb25zdCBvdXRwdXQgPSBtY3BUb29sT3V0cHV0KHBhcmFtcy5pdGVtLnJlc3VsdCwgcGFyYW1zLml0ZW0uZXJyb3I/Lm1lc3NhZ2UpIHx8IGVudHJ5Lm91dHB1dDtcblx0XHRjb25zdCBjb250ZW50ID0gb3V0cHV0ID8gW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQgYXMgY29uc3QsIHRleHQ6IG91dHB1dCB9XSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHR0dXJuSWQ6IGVudHJ5LnR1cm5JZCxcblx0XHRcdHRvb2xDYWxsSWQ6IGVudHJ5LnRvb2xDYWxsSWQsXG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0c3VjY2Vzcyxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogc3VjY2VzcyA/IGBDYWxsZWQgJHtlbnRyeS50b29sTmFtZX1gIDogYEZhaWxlZCB0byBjYWxsICR7ZW50cnkudG9vbE5hbWV9YCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Li4uKHN1Y2Nlc3MgPyB7fSA6IHsgZXJyb3I6IHsgbWVzc2FnZTogcGFyYW1zLml0ZW0uZXJyb3I/Lm1lc3NhZ2UgPz8gYE1DUCB0b29sICR7cGFyYW1zLml0ZW0uc3RhdHVzfWAsIC4uLihkZWNsaW5lZCA/IHsgY29kZTogJ2RlbmllZCcgfSA6IHt9KSB9IH0pLFxuXHRcdFx0fSxcblx0XHR9XTtcblx0fVxuXHRpZiAocGFyYW1zLml0ZW0udHlwZSA9PT0gJ2R5bmFtaWNUb29sQ2FsbCcpIHtcblx0XHRjb25zdCBzdWNjZXNzID0gcGFyYW1zLml0ZW0uc3VjY2VzcyA9PT0gdHJ1ZSB8fCBwYXJhbXMuaXRlbS5zdGF0dXMgPT09ICdjb21wbGV0ZWQnO1xuXHRcdGNvbnN0IG91dHB1dCA9IGR5bmFtaWNUb29sT3V0cHV0KHBhcmFtcy5pdGVtLmNvbnRlbnRJdGVtcykgfHwgZW50cnkub3V0cHV0O1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBvdXRwdXQgPyBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCBhcyBjb25zdCwgdGV4dDogb3V0cHV0IH1dIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHNlcnZlclBhc3RUZW5zZSA9IHN1Y2Nlc3MgPyBnZXRTZXJ2ZXJUb29sRGlzcGxheShlbnRyeS50b29sTmFtZSwgcGFyYW1zLml0ZW0uYXJndW1lbnRzLCB7IHRleHQ6IG91dHB1dCwgc3VjY2VzcyB9KT8ucGFzdFRlbnNlTWVzc2FnZSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHR0dXJuSWQ6IGVudHJ5LnR1cm5JZCxcblx0XHRcdHRvb2xDYWxsSWQ6IGVudHJ5LnRvb2xDYWxsSWQsXG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0c3VjY2Vzcyxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogc2VydmVyUGFzdFRlbnNlID8/IChzdWNjZXNzID8gYENhbGxlZCAke2VudHJ5LnRvb2xOYW1lfWAgOiBgRmFpbGVkIHRvIGNhbGwgJHtlbnRyeS50b29sTmFtZX1gKSxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Li4uKHN1Y2Nlc3MgPyB7fSA6IHsgZXJyb3I6IHsgbWVzc2FnZTogYER5bmFtaWMgdG9vbCAke3BhcmFtcy5pdGVtLnN0YXR1c31gLCAuLi4oZGVjbGluZWQgPyB7IGNvZGU6ICdkZW5pZWQnIH0gOiB7fSkgfSB9KSxcblx0XHRcdH0sXG5cdFx0fV07XG5cdH1cblx0aWYgKHBhcmFtcy5pdGVtLnR5cGUgPT09ICdjb2xsYWJBZ2VudFRvb2xDYWxsJykge1xuXHRcdGNvbnN0IGxhYmVscyA9IGNvbGxhYkFnZW50VG9vbExhYmVscyhwYXJhbXMuaXRlbS50b29sKTtcblx0XHRjb25zdCBzdWNjZXNzID0gcGFyYW1zLml0ZW0uc3RhdHVzID09PSAnY29tcGxldGVkJztcblx0XHRjb25zdCBvdXRwdXQgPSBjb2xsYWJBZ2VudFJlc3VsdE91dHB1dChwYXJhbXMuaXRlbS5yZWNlaXZlclRocmVhZElkcywgcGFyYW1zLml0ZW0uYWdlbnRzU3RhdGVzKSB8fCBlbnRyeS5vdXRwdXQ7XG5cdFx0Y29uc3QgY29udGVudCA9IG91dHB1dCA/IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0IGFzIGNvbnN0LCB0ZXh0OiBvdXRwdXQgfV0gOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIFt7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0dHVybklkOiBlbnRyeS50dXJuSWQsXG5cdFx0XHR0b29sQ2FsbElkOiBlbnRyeS50b29sQ2FsbElkLFxuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHN1Y2Nlc3MsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHN1Y2Nlc3MgPyBsYWJlbHMucGFzdCA6IGAke2xhYmVscy5kaXNwbGF5TmFtZX0gZmFpbGVkYCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Li4uKHN1Y2Nlc3MgPyB7fSA6IHsgZXJyb3I6IHsgbWVzc2FnZTogYENvbGxhYiBhZ2VudCAke3BhcmFtcy5pdGVtLnN0YXR1c31gLCAuLi4oZGVjbGluZWQgPyB7IGNvZGU6ICdkZW5pZWQnIH0gOiB7fSkgfSB9KSxcblx0XHRcdH0sXG5cdFx0fV07XG5cdH1cblx0cmV0dXJuIFtdO1xufVxuXG4vKipcbiAqIGB0dXJuL2NvbXBsZXRlZGAgdHJhbnNsYXRlcyB0byBlaXRoZXIgYSBub3JtYWwgY29tcGxldGUgc2lnbmFsIG9yLCB3aGVuXG4gKiB0aGUgdHVybiBlbmRlZCB3aXRoIGBzdGF0dXM6ICdmYWlsZWQnYCwgYW4gZXJyb3IgZm9sbG93ZWQgYnkgdGhlXG4gKiBjb21wbGV0ZSBzaWduYWwgc28gY29uc3VtZXJzIGNhbiByZWFjdCB0byBib3RoLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWFwVHVybkNvbXBsZXRlZChcblx0c3RhdGU6IElDb2RleFNlc3Npb25NYXBTdGF0ZSxcblx0cGFyYW1zOiBUdXJuQ29tcGxldGVkTm90aWZpY2F0aW9uLFxuXHRmYWxsYmFja0R1cmF0aW9uPzogbnVtYmVyLFxuKTogKFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uKVtdIHtcblx0c3RhdGUuY3VycmVudFR1cm5JZCA9IHVuZGVmaW5lZDtcblx0c3RhdGUuaXRlbVRvUGFydElkLmNsZWFyKCk7XG5cdHN0YXRlLml0ZW1Ub1JlYXNvbmluZ1BhcnRJZC5jbGVhcigpO1xuXHQvLyBGaW5hbGl6ZSBhbnkgY29tbWFuZCB3aG9zZSBjb21wbGV0aW9uIHdhcyBkZWZlcnJlZCB0byBjb2FsZXNjZSBhIHBvc3NpYmxlXG5cdC8vIHNhbmRib3ggcHJlLWZsaWdodCAoc2VlIElDb2RleFNlc3Npb25NYXBTdGF0ZS5wZW5kaW5nUHJlZmxpZ2h0KSBcdTIwMTQgaXQgd2FzXG5cdC8vIG5ldmVyIHJldXNlZCwgc28gaXQgaXMgYSBnZW51aW5lIG91dHB1dC1sZXNzIGNvbW1hbmQgYW5kIG11c3QgY29tcGxldGUuXG5cdGNvbnN0IHByZWZsaWdodEZsdXNoID0gZmx1c2hQZW5kaW5nUHJlZmxpZ2h0KHN0YXRlKTtcblx0Y29uc3Qgb3JwaGFuZWRUb29sQ2FsbHMgPSBbLi4uc3RhdGUuaXRlbVRvVG9vbENhbGwudmFsdWVzKCldO1xuXHRzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5jbGVhcigpO1xuXHRjb25zdCB0dXJuSWQgPSBwYXJhbXMudHVybi5pZDtcblx0Y29uc3Qgc3RhdHVzID0gcGFyYW1zLnR1cm4uc3RhdHVzO1xuXHRjb25zdCBkdXJhdGlvbiA9IHR5cGVvZiBwYXJhbXMudHVybi5kdXJhdGlvbk1zID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUocGFyYW1zLnR1cm4uZHVyYXRpb25NcykgJiYgcGFyYW1zLnR1cm4uZHVyYXRpb25NcyA+PSAwXG5cdFx0PyBwYXJhbXMudHVybi5kdXJhdGlvbk1zXG5cdFx0OiB0eXBlb2YgcGFyYW1zLnR1cm4uc3RhcnRlZEF0ID09PSAnbnVtYmVyJyAmJiB0eXBlb2YgcGFyYW1zLnR1cm4uY29tcGxldGVkQXQgPT09ICdudW1iZXInXG5cdFx0XHQ/IE1hdGgubWF4KDAsIChwYXJhbXMudHVybi5jb21wbGV0ZWRBdCAtIHBhcmFtcy50dXJuLnN0YXJ0ZWRBdCkgKiAxMDAwKVxuXHRcdFx0OiB0eXBlb2YgZmFsbGJhY2tEdXJhdGlvbiA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKGZhbGxiYWNrRHVyYXRpb24pXG5cdFx0XHRcdD8gTWF0aC5tYXgoMCwgZmFsbGJhY2tEdXJhdGlvbilcblx0XHRcdFx0OiAwO1xuXHRjb25zdCBvcnBoYW5lZFRvb2xDYWxsQWN0aW9uczogKFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uKVtdID0gb3JwaGFuZWRUb29sQ2FsbHMubWFwKGVudHJ5ID0+ICh7XG5cdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHR0dXJuSWQ6IGVudHJ5LnR1cm5JZCxcblx0XHR0b29sQ2FsbElkOiBlbnRyeS50b29sQ2FsbElkLFxuXHRcdHJlc3VsdDoge1xuXHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBgU3RvcHBlZCAke2VudHJ5LnRvb2xOYW1lfWAsXG5cdFx0XHRjb250ZW50OiBlbnRyeS5vdXRwdXQgPyBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCBhcyBjb25zdCwgdGV4dDogZW50cnkub3V0cHV0IH1dIDogdW5kZWZpbmVkLFxuXHRcdFx0ZXJyb3I6IHsgbWVzc2FnZTogc3RhdHVzID09PSAnaW50ZXJydXB0ZWQnID8gJ1R1cm4gaW50ZXJydXB0ZWQgYmVmb3JlIHRoZSB0b29sIGNvbXBsZXRlZCcgOiAnVHVybiBjb21wbGV0ZWQgYmVmb3JlIHRoZSB0b29sIHJlcG9ydGVkIGNvbXBsZXRpb24nIH0sXG5cdFx0fSxcblx0fSkpO1xuXHRpZiAoc3RhdHVzID09PSAnZmFpbGVkJyAmJiBwYXJhbXMudHVybi5lcnJvcikge1xuXHRcdGNvbnN0IGVyck1lc3NhZ2UgPSBwYXJhbXMudHVybi5lcnJvci5tZXNzYWdlID8/ICdDb2RleCB0dXJuIGZhaWxlZCc7XG5cdFx0cmV0dXJuIFtcblx0XHRcdC4uLnByZWZsaWdodEZsdXNoLFxuXHRcdFx0Li4ub3JwaGFuZWRUb29sQ2FsbEFjdGlvbnMsXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdEVycm9yLFxuXHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdGR1cmF0aW9uLFxuXHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdGVycm9yVHlwZTogJ0NvZGV4RXJyb3InLFxuXHRcdFx0XHRcdC4uLmV4dHJhY3RGb3J3YXJkZWRFcnJvckluZm8oZXJyTWVzc2FnZSksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0ZHVyYXRpb24sXG5cdFx0XHR9LFxuXHRcdF07XG5cdH1cblx0aWYgKHN0YXR1cyA9PT0gJ2ludGVycnVwdGVkJykge1xuXHRcdHJldHVybiBbLi4ucHJlZmxpZ2h0Rmx1c2gsIC4uLm9ycGhhbmVkVG9vbENhbGxBY3Rpb25zLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQsIHR1cm5JZCwgZHVyYXRpb24gfV07XG5cdH1cblx0cmV0dXJuIFsuLi5wcmVmbGlnaHRGbHVzaCwgLi4ub3JwaGFuZWRUb29sQ2FsbEFjdGlvbnMsIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQsIGR1cmF0aW9uIH1dO1xufVxuXG4vKipcbiAqIEJ1aWxkIGEge0BsaW5rIFR1cm5TdGF0ZX0gZnJvbSBhIGNvZGV4IGBUdXJuLnN0YXR1c2AuIE1vc3RseSB1c2VmdWxcbiAqIGZvciByZXBsYXkgKFBoYXNlIDMpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdHVyblN0YXRlRnJvbVN0YXR1cyhzdGF0dXM6IHN0cmluZyk6IFR1cm5TdGF0ZSB7XG5cdHN3aXRjaCAoc3RhdHVzKSB7XG5cdFx0Y2FzZSAnY29tcGxldGVkJzpcblx0XHRcdHJldHVybiBUdXJuU3RhdGUuQ29tcGxldGU7XG5cdFx0Y2FzZSAnaW50ZXJydXB0ZWQnOlxuXHRcdFx0cmV0dXJuIFR1cm5TdGF0ZS5DYW5jZWxsZWQ7XG5cdFx0Y2FzZSAnZmFpbGVkJzpcblx0XHRcdHJldHVybiBUdXJuU3RhdGUuRXJyb3I7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBUdXJuU3RhdGUuQ29tcGxldGU7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0JBQXVEO0FBQ2hFLFNBQVMsYUFBYSxrQkFBa0IsNEJBQTRCLHlCQUF5Qix1QkFBdUIsaUJBQWlCO0FBQ3JJLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBbUgvQixTQUFTLDJCQUEyQixrQkFBdUMsb0JBQUksSUFBSSxHQUFHLGdCQUFxQyxJQUFJLG9CQUFvQixHQUEwQjtBQUNuTCxTQUFPO0FBQUEsSUFDTixjQUFjLG9CQUFJLElBQUk7QUFBQSxJQUN0QixnQkFBZ0Isb0JBQUksSUFBSTtBQUFBLElBQ3hCLHVCQUF1QixvQkFBSSxJQUFJO0FBQUEsSUFDL0IsZUFBZTtBQUFBLElBQ2Y7QUFBQSxJQUNBO0FBQUEsSUFDQSxxQkFBcUIsb0JBQUksSUFBSTtBQUFBLElBQzdCLG1CQUFtQixvQkFBSSxJQUFJO0FBQUEsSUFDM0Isa0JBQWtCO0FBQUEsSUFDbEIsdUJBQXVCO0FBQUEsRUFDeEI7QUFDRDtBQVNPLFNBQVMsdUJBQXVCLE9BQW9DO0FBQzFFLFFBQU0sYUFBYSxNQUFNO0FBQ3pCLFFBQU0sZUFBZSxNQUFNO0FBQzNCLFFBQU0sc0JBQXNCLE1BQU07QUFDbEMsUUFBTSxrQkFBa0IsTUFBTTtBQUM5QixRQUFNLG1CQUFtQjtBQUN6QixRQUFNLHdCQUF3QjtBQUMvQjtBQU9BLFNBQVMsc0JBQXNCLE9BQThEO0FBQzVGLFFBQU0sVUFBVSxNQUFNO0FBQ3RCLE1BQUksQ0FBQyxTQUFTO0FBQ2IsV0FB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
