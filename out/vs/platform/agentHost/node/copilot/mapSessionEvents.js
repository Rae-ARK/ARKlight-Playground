import { decodeBase64 } from "../../../../base/common/buffer.js";
import { Schemas } from "../../../../base/common/network.js";
import { basename, isAbsolute, join } from "../../../../base/common/path.js";
import { isString } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { AgentSession } from "../../common/agentService.js";
import { stripRedundantCdPrefix } from "../../common/commandLineHelpers.js";
import { toToolCallMeta } from "../../common/meta/agentToolCallMeta.js";
import { MessageAttachmentKind } from "../../common/state/protocol/state.js";
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, TurnState, buildSubagentSessionUri } from "../../common/state/sessionState.js";
import { buildNonPtyShellTerminalUri } from "./copilotNonPtyShellTerminals.js";
import { getInvocationMessage, getPastTenseMessage, getShellIntention, getShellLanguage, getSubagentMetadata, getTaskCompleteMarkdown, getToolDisplayName, getToolInputString, getToolKind, isEditTool, isHiddenTool, isTaskCompleteTool, synthesizeSkillToolCall } from "./copilotToolDisplay.js";
import { buildSessionDbUri } from "../../common/sessionDbUri.js";
import { getMediaMime } from "../../../../base/common/mime.js";
import { buildCopilotSystemNotification } from "./copilotSystemNotification.js";
import { buildMcpChannel, buildMcpTopLevelCustomizationId } from "../shared/mcpCustomizationController.js";
import { readSimpleAttachmentDisplayKindFromMimeType } from "./copilotAttachmentUtils.js";
function tryStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return void 0;
  }
}
function resolveToolDisplayPath(path, workingDirectory) {
  return isAbsolute(path) || !workingDirectory || workingDirectory.scheme !== Schemas.file ? path : join(workingDirectory.fsPath, path);
}
function isSyntheticUserMessage(event) {
  if (event.type !== "user.message") {
    return false;
  }
  const source = event.data.source;
  return !!source && source.toLowerCase() !== "user";
}
function appendSdkToolResultContent(content, sdkContents, terminal) {
  let shellExit;
  for (const sdkContent of sdkContents ?? []) {
    switch (sdkContent.type) {
      case "shell_exit": {
        const result = {
          exitCode: sdkContent.exitCode,
          ...sdkContent.outputPreview !== void 0 ? { preview: sdkContent.outputPreview } : {},
          ...sdkContent.outputTruncated !== void 0 ? { truncated: sdkContent.outputTruncated } : {}
        };
        shellExit = { shellId: sdkContent.shellId, result };
        const terminalIndex = content.findIndex((c) => c.type === ToolResultContentType.Terminal);
        if (terminalIndex !== -1) {
          const terminalBlock = content[terminalIndex];
          content[terminalIndex] = { ...terminalBlock, result };
        } else if (terminal) {
          content.push({
            type: ToolResultContentType.Terminal,
            resource: buildNonPtyShellTerminalUri(terminal.session, terminal.toolCallId),
            title: terminal.title,
            isPty: false,
            result
          });
        }
        break;
      }
    }
  }
  return shellExit;
}
function newTurnBuilder(id, text, options) {
  const message = {
    text,
    origin: { kind: options?.origin ?? MessageKind.User },
    ...options?.attachments?.length ? { attachments: options.attachments } : {},
    ...options?.model ? { model: options.model } : {},
    ...options?.agent ? { agent: options.agent } : {}
  };
  return { id, message, startedAt: options?.startedAt, lastEventAt: options?.startedAt, responseParts: [], usage: void 0, pendingTools: /* @__PURE__ */ new Map() };
}
function readEventTimestamp(event) {
  const timestamp = event.timestamp;
  return isString(timestamp) && Number.isFinite(Date.parse(timestamp)) ? timestamp : void 0;
}
function readStringProperty(source, key) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return void 0;
  }
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function readMcpUiResourceUri(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return void 0;
  }
  const toolDescription = source["toolDescription"];
  if (!toolDescription || typeof toolDescription !== "object" || Array.isArray(toolDescription)) {
    return void 0;
  }
  const meta = toolDescription["_meta"];
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return void 0;
  }
  const ui = meta["ui"];
  if (!ui || typeof ui !== "object" || Array.isArray(ui)) {
    return void 0;
  }
  return readStringProperty(ui, "resourceUri");
}
function makeToolStartInfo(toolName, rawArguments, parentToolCallId, workingDirectory, source) {
  if (isHiddenTool(toolName)) {
    return void 0;
  }
  const rawArgs = rawArguments !== void 0 ? tryStringify(rawArguments) : void 0;
  let parameters;
  if (rawArgs) {
    try {
      parameters = JSON.parse(rawArgs);
    } catch {
    }
  }
  const cleaned = stripRedundantCdPrefix(toolName, parameters, workingDirectory) ? tryStringify(parameters) : void 0;
  const toolArgs = cleaned ?? rawArgs;
  const toolKind = getToolKind(toolName);
  const subagentMeta = toolKind === "subagent" ? getSubagentMetadata(parameters) : void 0;
  const displayName = getToolDisplayName(toolName);
  return {
    toolName,
    displayName,
    invocationMessage: getInvocationMessage(toolName, displayName, parameters, (path) => resolveToolDisplayPath(path, workingDirectory)),
    toolInput: getToolInputString(toolName, parameters, toolArgs),
    toolKind,
    language: toolKind === "terminal" ? getShellLanguage(toolName) : void 0,
    intention: getShellIntention(toolName, parameters),
    subagentAgentName: subagentMeta?.agentName,
    subagentDescription: subagentMeta?.description,
    parameters,
    parentToolCallId,
    mcpServerName: readStringProperty(source, "mcpServerName"),
    mcpToolName: readStringProperty(source, "mcpToolName"),
    mcpUiResourceUri: readMcpUiResourceUri(source)
  };
}
function finalizeTurn(builder, state) {
  const startedAtMs = builder.startedAt === void 0 ? void 0 : Date.parse(builder.startedAt);
  const endedAtMs = builder.lastEventAt === void 0 ? void 0 : Date.parse(builder.lastEventAt);
  const duration = startedAtMs !== void 0 && endedAtMs !== void 0 && Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs) ? Math.max(0, endedAtMs - startedAtMs) : void 0;
  return {
    id: builder.id,
    ...builder.startedAt !== void 0 ? { startedAt: builder.startedAt } : {},
    ...duration !== void 0 ? { duration } : {},
    message: builder.message,
    responseParts: builder.responseParts,
    usage: builder.usage,
    state
  };
}
async function mapSessionEvents(session, db, events, options = void 0) {
  const workingDirectory = options instanceof URI ? options : options?.workingDirectory;
  let currentModel = options instanceof URI ? void 0 : options?.model;
  let currentAgent = options instanceof URI ? void 0 : options?.agent;
  const toolInfoByCallId = /* @__PURE__ */ new Map();
  const editToolCallIds = [];
  const completionsByCallId = /* @__PURE__ */ new Map();
  const parentToolCallIdByAgentId = /* @__PURE__ */ new Map();
  const resolveParentToolCallId = (agentId, deprecatedParentToolCallId) => {
    const mapped = agentId ? parentToolCallIdByAgentId.get(agentId) : void 0;
    return mapped ?? deprecatedParentToolCallId;
  };
  for (const e of events) {
    if (e.type === "subagent.started") {
      if (e.agentId) {
        parentToolCallIdByAgentId.set(e.agentId, e.data.toolCallId);
      }
    }
    if (e.type === "tool.execution_complete") {
      completionsByCallId.set(e.data.toolCallId, e.data);
    }
    if (e.type === "tool.execution_start") {
      const d = e.data;
      const parentToolCallId = resolveParentToolCallId(e.agentId, d.parentToolCallId);
      const info = makeToolStartInfo(d.toolName, d.arguments, parentToolCallId, workingDirectory, d);
      if (!info) {
        continue;
      }
      toolInfoByCallId.set(d.toolCallId, info);
      const command = isString(info.parameters?.command) ? info.parameters.command : void 0;
      if (isEditTool(d.toolName, command)) {
        editToolCallIds.push(d.toolCallId);
      }
    }
  }
  let storedEdits;
  if (db && editToolCallIds.length > 0) {
    try {
      const records = await db.getFileEdits(editToolCallIds);
      if (records.length > 0) {
        storedEdits = /* @__PURE__ */ new Map();
        for (const r of records) {
          let list = storedEdits.get(r.toolCallId);
          if (!list) {
            list = [];
            storedEdits.set(r.toolCallId, list);
          }
          list.push(r);
        }
      }
    } catch {
    }
  }
  const sessionUriStr = session.toString();
  const providerId = session.scheme;
  const rawSessionId = AgentSession.id(session);
  const turns = [];
  const subagentBuilders = /* @__PURE__ */ new Map();
  const subagentTurnStates = /* @__PURE__ */ new Map();
  const subagentTurns = /* @__PURE__ */ new Map();
  const subagentInfoByToolCallId = /* @__PURE__ */ new Map();
  let parentBuilder;
  let parentTurnState = TurnState.Cancelled;
  let parentTurnAborted = false;
  let rootAssistantTurnActive = false;
  let pendingAutoModeResolved;
  let currentEventTimestamp;
  const touch = (builder) => {
    if (builder && currentEventTimestamp !== void 0) {
      builder.lastEventAt = currentEventTimestamp;
    }
  };
  const flushParent = () => {
    if (!parentBuilder) {
      return;
    }
    turns.push(finalizeTurn(parentBuilder, parentTurnState));
    parentBuilder = void 0;
    parentTurnState = TurnState.Cancelled;
    parentTurnAborted = false;
  };
  const flushSubagent = (parentToolCallId) => {
    const builder = subagentBuilders.get(parentToolCallId);
    if (!builder) {
      subagentTurnStates.delete(parentToolCallId);
      return;
    }
    subagentBuilders.delete(parentToolCallId);
    const state = subagentTurnStates.get(parentToolCallId) ?? TurnState.Complete;
    subagentTurnStates.delete(parentToolCallId);
    if (builder.responseParts.length === 0) {
      return;
    }
    const list = subagentTurns.get(parentToolCallId) ?? [];
    list.push(finalizeTurn(builder, state));
    subagentTurns.set(parentToolCallId, list);
  };
  const ensureSubagentBuilder = (parentToolCallId) => {
    let builder = subagentBuilders.get(parentToolCallId);
    if (!builder) {
      builder = newTurnBuilder(generateUuid(), "", { startedAt: currentEventTimestamp });
      subagentBuilders.set(parentToolCallId, builder);
      if (!subagentTurnStates.has(parentToolCallId)) {
        subagentTurnStates.set(parentToolCallId, TurnState.Complete);
      }
    }
    touch(builder);
    return builder;
  };
  const targetBuilderFor = (parentToolCallId) => {
    if (parentToolCallId) {
      return ensureSubagentBuilder(parentToolCallId);
    }
    touch(parentBuilder);
    return parentBuilder;
  };
  for (const e of events) {
    currentEventTimestamp = readEventTimestamp(e);
    switch (e.type) {
      case "assistant.turn_start":
        if (!e.agentId) {
          rootAssistantTurnActive = true;
          touch(parentBuilder);
        }
        break;
      case "assistant.turn_end":
        if (!e.agentId) {
          rootAssistantTurnActive = false;
          touch(parentBuilder);
        }
        break;
      case "session.model_change": {
        currentModel = { id: e.data.newModel };
        break;
      }
      case "session.auto_mode_resolved": {
        if (!e.agentId) {
          pendingAutoModeResolved = e.data;
        }
        break;
      }
      case "subagent.deselected": {
        if (!e.agentId) {
          currentAgent = void 0;
        }
        break;
      }
      case "user.message": {
        if (isSyntheticUserMessage(e)) {
          continue;
        }
        const d = e.data;
        const messageId = d.interactionId ?? "";
        const content = d.content ?? "";
        const attachments = sdkAttachmentsToProtocol(d.attachments);
        const parentToolCallId = resolveParentToolCallId(e.agentId, void 0);
        if (e.agentId && !parentToolCallId) {
          continue;
        }
        if (parentToolCallId) {
          const builder = ensureSubagentBuilder(parentToolCallId);
          builder.message = {
            ...builder.message,
            text: content,
            ...attachments?.length ? { attachments } : {}
          };
        } else {
          flushParent();
          const turnId = e.id ?? messageId;
          parentBuilder = newTurnBuilder(turnId, content, { attachments, model: currentModel, agent: currentAgent, startedAt: currentEventTimestamp });
          if (pendingAutoModeResolved) {
            parentBuilder.usage = {
              model: pendingAutoModeResolved.chosenModel,
              _meta: { autoModeResolved: pendingAutoModeResolved }
            };
            pendingAutoModeResolved = void 0;
          }
        }
        break;
      }
      case "assistant.message": {
        const d = e.data;
        const messageId = d.messageId ?? d.interactionId ?? "";
        const content = d.content ?? "";
        const reasoningText = d.reasoningText;
        const hasToolRequests = !!d.toolRequests && d.toolRequests.length > 0;
        const parentToolCallId = resolveParentToolCallId(e.agentId, d.parentToolCallId);
        if (!content && !reasoningText && !hasToolRequests) {
          if (!parentToolCallId && parentBuilder && !parentTurnAborted) {
            parentTurnState = TurnState.Complete;
            touch(parentBuilder);
          }
          break;
        }
        const fallbackTurnId = e.id ?? messageId;
        const builder = targetBuilderFor(parentToolCallId) ?? (parentBuilder = newTurnBuilder(fallbackTurnId, "", { startedAt: currentEventTimestamp }));
        if (reasoningText) {
          builder.responseParts.push({
            kind: ResponsePartKind.Reasoning,
            id: generateUuid(),
            content: reasoningText
          });
        }
        if (content) {
          builder.responseParts.push({
            kind: ResponsePartKind.Markdown,
            id: generateUuid(),
            content
          });
        }
        if (!parentToolCallId && builder === parentBuilder && !parentTurnAborted) {
          parentTurnState = hasToolRequests ? TurnState.Cancelled : TurnState.Complete;
        }
        if (d.toolRequests?.length) {
          appendFallbackToolRequests(builder, d.toolRequests, parentToolCallId);
        }
        break;
      }
      case "system.notification": {
        const notification = buildCopilotSystemNotification(e);
        if (!notification) {
          break;
        }
        if (rootAssistantTurnActive && parentBuilder) {
          parentBuilder.responseParts.push({
            kind: ResponsePartKind.SystemNotification,
            content: notification.messageText
          });
          touch(parentBuilder);
        } else if (notification.startsTurn) {
          flushParent();
          parentBuilder = newTurnBuilder(e.id, notification.messageText, { origin: MessageKind.SystemNotification, startedAt: currentEventTimestamp });
        }
        break;
      }
      case "subagent.started": {
        const d = e.data;
        subagentInfoByToolCallId.set(d.toolCallId, {
          agentName: d.agentName,
          agentDisplayName: d.agentDisplayName,
          agentDescription: d.agentDescription
        });
        break;
      }
      case "tool.execution_start": {
        const parentToolCallId = resolveParentToolCallId(e.agentId, e.data.parentToolCallId);
        if (!parentToolCallId && parentBuilder) {
          parentTurnState = TurnState.Cancelled;
          touch(parentBuilder);
        }
        break;
      }
      case "tool.execution_complete": {
        const d = e.data;
        const info = toolInfoByCallId.get(d.toolCallId);
        if (!info) {
          continue;
        }
        toolInfoByCallId.delete(d.toolCallId);
        const parentToolCallId = resolveParentToolCallId(e.agentId, d.parentToolCallId);
        if (isTaskCompleteTool(info.toolName)) {
          const builder2 = targetBuilderFor(parentToolCallId);
          if (!builder2) {
            continue;
          }
          const summary = getTaskCompleteMarkdown(info.parameters, d.error?.message ?? d.result?.content);
          if (summary) {
            builder2.responseParts.push({
              kind: ResponsePartKind.Markdown,
              id: generateUuid(),
              content: summary
            });
          }
          if (!parentToolCallId && d.success && builder2 === parentBuilder && !parentTurnAborted) {
            parentTurnState = TurnState.Complete;
          }
          continue;
        }
        const builder = targetBuilderFor(parentToolCallId);
        if (!builder) {
          continue;
        }
        const completedPart = makeCompletedToolCallPart(d, info, sessionUriStr, providerId, rawSessionId, storedEdits, subagentInfoByToolCallId.get(d.toolCallId), workingDirectory);
        builder.responseParts.push(completedPart);
        if (!parentToolCallId && subagentInfoByToolCallId.has(d.toolCallId)) {
          flushSubagent(d.toolCallId);
        }
        break;
      }
      case "skill.invoked": {
        const synth = synthesizeSkillToolCall(e.data, e.id);
        const parentToolCallId = resolveParentToolCallId(e.agentId, void 0);
        const builder = targetBuilderFor(parentToolCallId) ?? (parentBuilder = newTurnBuilder(generateUuid(), "", { startedAt: currentEventTimestamp }));
        if (!parentToolCallId && builder === parentBuilder) {
          parentTurnState = TurnState.Cancelled;
        }
        builder.responseParts.push({
          kind: ResponsePartKind.ToolCall,
          toolCall: {
            status: ToolCallStatus.Completed,
            toolCallId: synth.toolCallId,
            toolName: synth.toolName,
            displayName: synth.displayName,
            invocationMessage: synth.invocationMessage,
            success: true,
            pastTenseMessage: synth.pastTenseMessage,
            confirmed: ToolCallConfirmationReason.NotNeeded
          }
        });
        break;
      }
      case "abort": {
        const parentToolCallId = resolveParentToolCallId(e.agentId, void 0);
        if (parentToolCallId) {
          subagentTurnStates.set(parentToolCallId, TurnState.Cancelled);
        } else {
          rootAssistantTurnActive = false;
          if (parentBuilder) {
            parentTurnState = TurnState.Cancelled;
            parentTurnAborted = true;
            touch(parentBuilder);
          }
        }
        break;
      }
      default:
        break;
    }
  }
  flushParent();
  for (const parentToolCallId of [...subagentBuilders.keys()]) {
    flushSubagent(parentToolCallId);
  }
  return { turns, subagentTurnsByToolCallId: subagentTurns };
  function appendFallbackToolRequests(builder, toolRequests, parentToolCallId) {
    for (const request of toolRequests) {
      const completion = completionsByCallId.get(request.toolCallId);
      if (completion && toolInfoByCallId.has(request.toolCallId)) {
        continue;
      }
      const info = toolInfoByCallId.get(request.toolCallId) ?? makeToolStartInfo(request.name, request.arguments, parentToolCallId, workingDirectory, request);
      if (!info) {
        continue;
      }
      if (isTaskCompleteTool(info.toolName)) {
        const summary = getTaskCompleteMarkdown(info.parameters, completion?.error?.message ?? completion?.result?.content);
        if (summary) {
          builder.responseParts.push({
            kind: ResponsePartKind.Markdown,
            id: generateUuid(),
            content: summary
          });
        }
        if (!parentToolCallId && completion?.success && builder === parentBuilder && !parentTurnAborted) {
          parentTurnState = TurnState.Complete;
        }
        continue;
      }
      builder.responseParts.push(makeCompletedToolCallPart(
        completion ?? { toolCallId: request.toolCallId, success: true },
        info,
        sessionUriStr,
        providerId,
        rawSessionId,
        storedEdits,
        subagentInfoByToolCallId.get(request.toolCallId),
        workingDirectory
      ));
    }
  }
}
function sdkAttachmentsToProtocol(attachments) {
  if (!attachments?.length) {
    return void 0;
  }
  const out = [];
  for (const a of attachments) {
    const converted = sdkAttachmentToProtocol(a);
    if (converted) {
      out.push(converted);
    }
  }
  return out.length > 0 ? out : void 0;
}
function sdkAttachmentToProtocol(attachment) {
  switch (attachment.type) {
    case "file": {
      return {
        type: MessageAttachmentKind.Resource,
        uri: URI.file(attachment.path).toString(),
        label: attachment.displayName || basename(attachment.path),
        displayKind: getMediaMime(attachment.path)?.startsWith("image/") ? "image" : "document"
      };
    }
    case "directory": {
      return {
        type: MessageAttachmentKind.Resource,
        uri: URI.file(attachment.path).toString(),
        label: attachment.displayName || basename(attachment.path),
        displayKind: "directory"
      };
    }
    case "selection": {
      return {
        type: MessageAttachmentKind.Resource,
        uri: URI.file(attachment.filePath).toString(),
        label: attachment.displayName,
        displayKind: "selection",
        selection: { range: attachment.selection }
      };
    }
    case "blob": {
      if (typeof attachment.data !== "string") {
        return void 0;
      }
      const simpleDisplayKind = readSimpleAttachmentDisplayKindFromMimeType(attachment.mimeType);
      if (attachment.mimeType.startsWith("text/plain") || simpleDisplayKind !== void 0) {
        return {
          type: MessageAttachmentKind.Simple,
          label: attachment.displayName ?? "attachment",
          modelRepresentation: decodeBase64(attachment.data ?? "").toString(),
          ...simpleDisplayKind !== void 0 ? { displayKind: simpleDisplayKind } : {}
        };
      }
      const displayKind = attachment.mimeType.startsWith("image/") ? "image" : void 0;
      return {
        type: MessageAttachmentKind.EmbeddedResource,
        label: attachment.displayName ?? "attachment",
        data: attachment.data ?? "",
        contentType: attachment.mimeType,
        displayKind
      };
    }
    default:
      return void 0;
  }
}
function makeCompletedToolCallPart(d, info, sessionUriStr, providerId, rawSessionId, storedEdits, subagent, workingDirectory) {
  const toolOutput = d.error?.message ?? d.result?.content;
  const content = [];
  if (toolOutput !== void 0) {
    content.push({ type: ToolResultContentType.Text, text: toolOutput });
  }
  appendSdkToolResultContent(content, d.result?.contents, { session: sessionUriStr, toolCallId: d.toolCallId, title: info.displayName });
  const edits = storedEdits?.get(d.toolCallId);
  if (edits) {
    for (const edit of edits) {
      const beforeUri = edit.kind === "rename" && edit.originalPath ? URI.file(edit.originalPath).toString() : URI.file(edit.filePath).toString();
      const afterUri = URI.file(edit.filePath).toString();
      const hasBefore = edit.kind !== "create";
      const hasAfter = edit.kind !== "delete";
      content.push({
        type: ToolResultContentType.FileEdit,
        before: hasBefore ? {
          uri: beforeUri,
          content: { uri: buildSessionDbUri(sessionUriStr, edit.toolCallId, edit.filePath, "before") }
        } : void 0,
        after: hasAfter ? {
          uri: afterUri,
          content: { uri: buildSessionDbUri(sessionUriStr, edit.toolCallId, edit.filePath, "after") }
        } : void 0,
        diff: edit.addedLines !== void 0 || edit.removedLines !== void 0 ? { added: edit.addedLines, removed: edit.removedLines } : void 0
      });
    }
  }
  if (subagent) {
    content.push({
      type: ToolResultContentType.Subagent,
      resource: buildSubagentSessionUri(sessionUriStr, d.toolCallId),
      title: subagent.agentDisplayName,
      agentName: subagent.agentName,
      description: subagent.agentDescription
    });
  }
  const mcpServerName = info.mcpServerName ?? readStringProperty(d, "mcpServerName");
  const mcpToolName = info.mcpToolName ?? readStringProperty(d, "mcpToolName");
  const mcpUiResourceUri = info.mcpUiResourceUri ?? readMcpUiResourceUri(d);
  const mcpUi = mcpUiResourceUri ? {
    resourceUri: mcpUiResourceUri,
    ...mcpServerName ? { channel: buildMcpChannel(providerId, rawSessionId, mcpServerName) } : {}
  } : void 0;
  const tc = {
    status: ToolCallStatus.Completed,
    toolCallId: d.toolCallId,
    toolName: info.toolName,
    displayName: info.displayName,
    intention: info.intention,
    ...mcpServerName ? { contributor: { kind: ToolCallContributorKind.MCP, customizationId: buildMcpTopLevelCustomizationId(providerId, rawSessionId, mcpServerName) } } : {},
    invocationMessage: info.invocationMessage,
    toolInput: info.toolInput,
    success: d.success,
    pastTenseMessage: getPastTenseMessage(info.toolName, info.displayName, info.parameters, d.success, d.success ? toolOutput : void 0, (path) => resolveToolDisplayPath(path, workingDirectory)),
    content: content.length > 0 ? content : void 0,
    error: d.error,
    confirmed: ToolCallConfirmationReason.NotNeeded,
    _meta: toToolCallMeta({
      toolKind: info.toolKind,
      language: info.language,
      subagentDescription: info.subagentDescription,
      subagentAgentName: info.subagentAgentName,
      mcpServerName,
      mcpToolName,
      ui: mcpUi
    })
  };
  return { kind: ResponsePartKind.ToolCall, toolCall: tc };
}
export {
  appendSdkToolResultContent,
  mapSessionEvents
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NvcGlsb3QvbWFwU2Vzc2lvbkV2ZW50cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgQXNzaXN0YW50TWVzc2FnZVRvb2xSZXF1ZXN0LCBBdHRhY2htZW50LCBTZXNzaW9uRXZlbnQsIFRvb2xFeGVjdXRpb25Db21wbGV0ZUNvbnRlbnQsIFRvb2xFeGVjdXRpb25Db21wbGV0ZURhdGEgfSBmcm9tICdAZ2l0aHViL2NvcGlsb3Qtc2RrJztcbmltcG9ydCB7IGRlY29kZUJhc2U2NCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgaXNBYnNvbHV0ZSwgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHN0cmlwUmVkdW5kYW50Q2RQcmVmaXggfSBmcm9tICcuLi8uLi9jb21tb24vY29tbWFuZExpbmVIZWxwZXJzLmpzJztcbmltcG9ydCB7IHRvVG9vbENhbGxNZXRhLCB0eXBlIElUb29sQ2FsbFVpTWV0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tZXRhL2FnZW50VG9vbENhbGxNZXRhLmpzJztcbmltcG9ydCB7IElGaWxlRWRpdFJlY29yZCwgSVNlc3Npb25EYXRhYmFzZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uRGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLCB0eXBlIE1lc3NhZ2VBdHRhY2htZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VLaW5kLCBSZXNwb25zZVBhcnRLaW5kLCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIFRvb2xDYWxsU3RhdHVzLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIFR1cm5TdGF0ZSwgYnVpbGRTdWJhZ2VudFNlc3Npb25VcmksIHR5cGUgQWdlbnRTZWxlY3Rpb24sIHR5cGUgTWVzc2FnZSwgdHlwZSBNb2RlbFNlbGVjdGlvbiwgdHlwZSBSZXNwb25zZVBhcnQsIHR5cGUgU3RyaW5nT3JNYXJrZG93biwgdHlwZSBUZXJtaW5hbENvbW1hbmRSZXN1bHQsIHR5cGUgVG9vbENhbGxDb21wbGV0ZWRTdGF0ZSwgdHlwZSBUb29sUmVzdWx0Q29udGVudCwgdHlwZSBUb29sUmVzdWx0VGVybWluYWxDb250ZW50LCB0eXBlIFR1cm4sIHR5cGUgVXNhZ2VJbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBidWlsZE5vblB0eVNoZWxsVGVybWluYWxVcmkgfSBmcm9tICcuL2NvcGlsb3ROb25QdHlTaGVsbFRlcm1pbmFscy5qcyc7XG5pbXBvcnQgeyBnZXRJbnZvY2F0aW9uTWVzc2FnZSwgZ2V0UGFzdFRlbnNlTWVzc2FnZSwgZ2V0U2hlbGxJbnRlbnRpb24sIGdldFNoZWxsTGFuZ3VhZ2UsIGdldFN1YmFnZW50TWV0YWRhdGEsIGdldFRhc2tDb21wbGV0ZU1hcmtkb3duLCBnZXRUb29sRGlzcGxheU5hbWUsIGdldFRvb2xJbnB1dFN0cmluZywgZ2V0VG9vbEtpbmQsIGlzRWRpdFRvb2wsIGlzSGlkZGVuVG9vbCwgaXNUYXNrQ29tcGxldGVUb29sLCBzeW50aGVzaXplU2tpbGxUb29sQ2FsbCB9IGZyb20gJy4vY29waWxvdFRvb2xEaXNwbGF5LmpzJztcbmltcG9ydCB7IGJ1aWxkU2Vzc2lvbkRiVXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25EYlVyaS5qcyc7XG5pbXBvcnQgeyBnZXRNZWRpYU1pbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IGJ1aWxkQ29waWxvdFN5c3RlbU5vdGlmaWNhdGlvbiB9IGZyb20gJy4vY29waWxvdFN5c3RlbU5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBidWlsZE1jcENoYW5uZWwsIGJ1aWxkTWNwVG9wTGV2ZWxDdXN0b21pemF0aW9uSWQgfSBmcm9tICcuLi9zaGFyZWQvbWNwQ3VzdG9taXphdGlvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgcmVhZFNpbXBsZUF0dGFjaG1lbnREaXNwbGF5S2luZEZyb21NaW1lVHlwZSB9IGZyb20gJy4vY29waWxvdEF0dGFjaG1lbnRVdGlscy5qcyc7XG5cbmZ1bmN0aW9uIHRyeVN0cmluZ2lmeSh2YWx1ZTogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5mdW5jdGlvbiByZXNvbHZlVG9vbERpc3BsYXlQYXRoKHBhdGg6IHN0cmluZywgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0cmV0dXJuIGlzQWJzb2x1dGUocGF0aCkgfHwgIXdvcmtpbmdEaXJlY3RvcnkgfHwgd29ya2luZ0RpcmVjdG9yeS5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZVxuXHRcdD8gcGF0aFxuXHRcdDogam9pbih3b3JraW5nRGlyZWN0b3J5LmZzUGF0aCwgcGF0aCk7XG59XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmIHRoZSBldmVudCBpcyBhIFNESy1pbmplY3RlZCBgdXNlci5tZXNzYWdlYCB0aGF0IHNob3VsZCBub3RcbiAqIGJlIHNob3duIHRvIHRoZSB1c2VyIChlLmcuIHNraWxsLWNvbnRlbnQgaW5qZWN0aW9uKS5cbiAqXG4gKiBUaGUgU0RLIG1hcmtzIHRoZXNlIHZpYSBhIG5vbi1gJ3VzZXInYCBgc291cmNlYCBmaWVsZC4gT2xkZXIgc2Vzc2lvbnNcbiAqIHBlcnNpc3RlZCBiZWZvcmUgYHNvdXJjZWAgZXhpc3RlZCB3aWxsIG5vdCBiZSBmaWx0ZXJlZDsgdGhhdCBpcyBhY2NlcHRlZFxuICogbGVha2FnZSByYXRoZXIgdGhhbiBndWVzc2VkLWF0IGNvbnRlbnQgc25pZmZpbmcuXG4gKi9cbmZ1bmN0aW9uIGlzU3ludGhldGljVXNlck1lc3NhZ2UoZXZlbnQ6IFNlc3Npb25FdmVudCk6IGJvb2xlYW4ge1xuXHRpZiAoZXZlbnQudHlwZSAhPT0gJ3VzZXIubWVzc2FnZScpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3Qgc291cmNlID0gZXZlbnQuZGF0YS5zb3VyY2U7XG5cdHJldHVybiAhIXNvdXJjZSAmJiBzb3VyY2UudG9Mb3dlckNhc2UoKSAhPT0gJ3VzZXInO1xufVxuXG4vKipcbiAqIENvbnZlcnRzIFNESyBgdG9vbC5leGVjdXRpb25fY29tcGxldGVgIGNvbnRlbnQgYmxvY2tzIGludG8gQUhQIHRvb2wgcmVzdWx0XG4gKiBjb250ZW50LiBBIGBzaGVsbF9leGl0YCBibG9jayBiZWNvbWVzIHtAbGluayBUZXJtaW5hbENvbW1hbmRSZXN1bHR9IGRhdGEgb25cbiAqIHRoZSB0b29sIGNhbGwncyB0ZXJtaW5hbCBjb250ZW50IGJsb2NrOyB3aGVuIG5vIHRlcm1pbmFsIGJsb2NrIGV4aXN0cyB5ZXRcbiAqIChlLmcuIGhpc3RvcnkgcmVwbGF5LCB3aGVyZSBubyBsaXZlIGNoYW5uZWwgc3Vydml2ZXMpIGFuZCBgdGVybWluYWxgIGlzXG4gKiBwcm92aWRlZCwgYSBub24tcHR5IHRlcm1pbmFsIGJsb2NrIGlzIHN5bnRoZXNpemVkIHNvIHRoZSBvdXRjb21lIHN0aWxsXG4gKiByZW5kZXJzIGZyb20gYHJlc3VsdC5wcmV2aWV3YC4gUmV0dXJucyB0aGUgYHNoZWxsX2V4aXRgIG91dGNvbWUsIGlmIGFueSwgc29cbiAqIHRoZSBsaXZlIHBhdGggY2FuIHNldHRsZSB0aGUgbm9uLXB0eSBvdXRwdXQgY2hhbm5lbCBmcm9tIGl0LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZGtTaGVsbEV4aXQge1xuXHRyZWFkb25seSBzaGVsbElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlc3VsdDogVGVybWluYWxDb21tYW5kUmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwZW5kU2RrVG9vbFJlc3VsdENvbnRlbnQoY29udGVudDogVG9vbFJlc3VsdENvbnRlbnRbXSwgc2RrQ29udGVudHM6IHJlYWRvbmx5IFRvb2xFeGVjdXRpb25Db21wbGV0ZUNvbnRlbnRbXSB8IHVuZGVmaW5lZCwgdGVybWluYWw/OiB7IHNlc3Npb246IFVSSSB8IHN0cmluZzsgdG9vbENhbGxJZDogc3RyaW5nOyB0aXRsZTogc3RyaW5nIH0pOiBJU2RrU2hlbGxFeGl0IHwgdW5kZWZpbmVkIHtcblx0bGV0IHNoZWxsRXhpdDogSVNka1NoZWxsRXhpdCB8IHVuZGVmaW5lZDtcblx0Zm9yIChjb25zdCBzZGtDb250ZW50IG9mIHNka0NvbnRlbnRzID8/IFtdKSB7XG5cdFx0c3dpdGNoIChzZGtDb250ZW50LnR5cGUpIHtcblx0XHRcdGNhc2UgJ3NoZWxsX2V4aXQnOiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogVGVybWluYWxDb21tYW5kUmVzdWx0ID0ge1xuXHRcdFx0XHRcdGV4aXRDb2RlOiBzZGtDb250ZW50LmV4aXRDb2RlLFxuXHRcdFx0XHRcdC4uLihzZGtDb250ZW50Lm91dHB1dFByZXZpZXcgIT09IHVuZGVmaW5lZCA/IHsgcHJldmlldzogc2RrQ29udGVudC5vdXRwdXRQcmV2aWV3IH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKHNka0NvbnRlbnQub3V0cHV0VHJ1bmNhdGVkICE9PSB1bmRlZmluZWQgPyB7IHRydW5jYXRlZDogc2RrQ29udGVudC5vdXRwdXRUcnVuY2F0ZWQgfSA6IHt9KSxcblx0XHRcdFx0fTtcblx0XHRcdFx0c2hlbGxFeGl0ID0geyBzaGVsbElkOiBzZGtDb250ZW50LnNoZWxsSWQsIHJlc3VsdCB9O1xuXHRcdFx0XHRjb25zdCB0ZXJtaW5hbEluZGV4ID0gY29udGVudC5maW5kSW5kZXgoYyA9PiBjLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCk7XG5cdFx0XHRcdGlmICh0ZXJtaW5hbEluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdGNvbnN0IHRlcm1pbmFsQmxvY2sgPSBjb250ZW50W3Rlcm1pbmFsSW5kZXhdIGFzIFRvb2xSZXN1bHRUZXJtaW5hbENvbnRlbnQ7XG5cdFx0XHRcdFx0Y29udGVudFt0ZXJtaW5hbEluZGV4XSA9IHsgLi4udGVybWluYWxCbG9jaywgcmVzdWx0IH07XG5cdFx0XHRcdH0gZWxzZSBpZiAodGVybWluYWwpIHtcblx0XHRcdFx0XHRjb250ZW50LnB1c2goe1xuXHRcdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLFxuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IGJ1aWxkTm9uUHR5U2hlbGxUZXJtaW5hbFVyaSh0ZXJtaW5hbC5zZXNzaW9uLCB0ZXJtaW5hbC50b29sQ2FsbElkKSxcblx0XHRcdFx0XHRcdHRpdGxlOiB0ZXJtaW5hbC50aXRsZSxcblx0XHRcdFx0XHRcdGlzUHR5OiBmYWxzZSxcblx0XHRcdFx0XHRcdHJlc3VsdCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIHNoZWxsRXhpdDtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFNpbmdsZS1wYXNzIHR1cm4gYnVpbGRlclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqIFBlci10b29sLWNhbGwgaW5mbyBjYXB0dXJlZCBmcm9tIGB0b29sLmV4ZWN1dGlvbl9zdGFydGAgYW5kIHJldXNlZCBhdCBgdG9vbC5leGVjdXRpb25fY29tcGxldGVgLiAqL1xuaW50ZXJmYWNlIElUb29sU3RhcnRJbmZvIHtcblx0cmVhZG9ubHkgdG9vbE5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZGlzcGxheU5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgaW52b2NhdGlvbk1lc3NhZ2U6IFN0cmluZ09yTWFya2Rvd247XG5cdHJlYWRvbmx5IHRvb2xJbnB1dD86IHN0cmluZztcblx0cmVhZG9ubHkgdG9vbEtpbmQ/OiAndGVybWluYWwnIHwgJ3N1YmFnZW50JyB8ICdzZWFyY2gnO1xuXHRyZWFkb25seSBsYW5ndWFnZT86IHN0cmluZztcblx0LyoqIEludGVudGlvbiAod2h5IHRoZSBjb21tYW5kIHJ1bnMpIGZvciBzaGVsbCB0b29scywgZnJvbSB0aGVpciBgZGVzY3JpcHRpb25gIGFyZ3VtZW50LiAqL1xuXHRyZWFkb25seSBpbnRlbnRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN1YmFnZW50QWdlbnROYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBzdWJhZ2VudERlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBwYXJhbWV0ZXJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcGFyZW50VG9vbENhbGxJZD86IHN0cmluZztcblx0cmVhZG9ubHkgbWNwU2VydmVyTmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgbWNwVG9vbE5hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1jcFVpUmVzb3VyY2VVcmk/OiBzdHJpbmc7XG59XG5cbi8qKiBTdWJhZ2VudCBtZXRhZGF0YSBzZWVuIHZpYSBgc3ViYWdlbnQuc3RhcnRlZGAsIGFwcGxpZWQgdG8gdGhlIHBhcmVudCB0b29sIGNhbGwncyBjb250ZW50IGF0IGB0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZWAuICovXG5pbnRlcmZhY2UgSVN1YmFnZW50SW5mbyB7XG5cdHJlYWRvbmx5IGFnZW50TmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBhZ2VudERpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFnZW50RGVzY3JpcHRpb24/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogTXV0YWJsZSBwZXItdHVybiBzdGF0ZSB1c2VkIHdoaWxlIGl0ZXJhdGluZyBldmVudHMuIFRoZSBwYXJlbnQgc2Vzc2lvblxuICogaGFzIG9uZSBidWlsZGVyOyBlYWNoIHN1YmFnZW50IHR1cm4gKG9uZSBwZXIgYHBhcmVudFRvb2xDYWxsSWRgKSBoYXMgaXRzXG4gKiBvd24gYnVpbGRlciBzbyBpbm5lciBldmVudHMgcm91dGUgdGhlcmUgZGlyZWN0bHkuXG4gKi9cbmludGVyZmFjZSBJVHVybkJ1aWxkZXIge1xuXHRpZDogc3RyaW5nO1xuXHRtZXNzYWdlOiBNZXNzYWdlO1xuXHQvKiogSVNPIDg2MDEgdGltZXN0YW1wIG9mIHRoZSBTREsgZXZlbnQgdGhhdCBvcGVuZWQgdGhpcyB0dXJuLCB3aGVuIGtub3duLiAqL1xuXHRzdGFydGVkQXQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIElTTyA4NjAxIHRpbWVzdGFtcCBvZiB0aGUgbW9zdCByZWNlbnQgU0RLIGV2ZW50IHRoYXQgYmVsb25nZWQgdG8gdGhpcyB0dXJuLiAqL1xuXHRsYXN0RXZlbnRBdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSByZXNwb25zZVBhcnRzOiBSZXNwb25zZVBhcnRbXTtcblx0dXNhZ2U6IFVzYWdlSW5mbyB8IHVuZGVmaW5lZDtcblx0LyoqIFRvb2wgc3RhcnRzIHNlZW4gYnV0IG5vdCB5ZXQgY29tcGxldGVkIGluIHRoaXMgdHVybiwga2V5ZWQgYnkgdG9vbENhbGxJZC4gKi9cblx0cmVhZG9ubHkgcGVuZGluZ1Rvb2xzOiBNYXA8c3RyaW5nLCBJVG9vbFN0YXJ0SW5mbz47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1hcFNlc3Npb25FdmVudHNPcHRpb25zIHtcblx0cmVhZG9ubHkgd29ya2luZ0RpcmVjdG9yeT86IFVSSTtcblx0cmVhZG9ubHkgbW9kZWw/OiBNb2RlbFNlbGVjdGlvbjtcblx0cmVhZG9ubHkgYWdlbnQ/OiBBZ2VudFNlbGVjdGlvbjtcbn1cblxuZnVuY3Rpb24gbmV3VHVybkJ1aWxkZXIoaWQ6IHN0cmluZywgdGV4dDogc3RyaW5nLCBvcHRpb25zPzogeyBhdHRhY2htZW50cz86IE1lc3NhZ2VBdHRhY2htZW50W107IG1vZGVsPzogTW9kZWxTZWxlY3Rpb247IGFnZW50PzogQWdlbnRTZWxlY3Rpb247IG9yaWdpbj86IE1lc3NhZ2VLaW5kOyBzdGFydGVkQXQ/OiBzdHJpbmcgfSk6IElUdXJuQnVpbGRlciB7XG5cdGNvbnN0IG1lc3NhZ2U6IE1lc3NhZ2UgPSB7XG5cdFx0dGV4dCxcblx0XHRvcmlnaW46IHsga2luZDogb3B0aW9ucz8ub3JpZ2luID8/IE1lc3NhZ2VLaW5kLlVzZXIgfSxcblx0XHQuLi4ob3B0aW9ucz8uYXR0YWNobWVudHM/Lmxlbmd0aCA/IHsgYXR0YWNobWVudHM6IG9wdGlvbnMuYXR0YWNobWVudHMgfSA6IHt9KSxcblx0XHQuLi4ob3B0aW9ucz8ubW9kZWwgPyB7IG1vZGVsOiBvcHRpb25zLm1vZGVsIH0gOiB7fSksXG5cdFx0Li4uKG9wdGlvbnM/LmFnZW50ID8geyBhZ2VudDogb3B0aW9ucy5hZ2VudCB9IDoge30pLFxuXHR9O1xuXHRyZXR1cm4geyBpZCwgbWVzc2FnZSwgc3RhcnRlZEF0OiBvcHRpb25zPy5zdGFydGVkQXQsIGxhc3RFdmVudEF0OiBvcHRpb25zPy5zdGFydGVkQXQsIHJlc3BvbnNlUGFydHM6IFtdLCB1c2FnZTogdW5kZWZpbmVkLCBwZW5kaW5nVG9vbHM6IG5ldyBNYXAoKSB9O1xufVxuXG4vKiogUmVhZHMgdGhlIFNESyBlbnZlbG9wZSdzIElTTyA4NjAxIGB0aW1lc3RhbXBgLCBvciBgdW5kZWZpbmVkYCB3aGVuIG1pc3Npbmcgb3IgdW5wYXJzZWFibGUuICovXG5mdW5jdGlvbiByZWFkRXZlbnRUaW1lc3RhbXAoZXZlbnQ6IFNlc3Npb25FdmVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHRpbWVzdGFtcDogdW5rbm93biA9IGV2ZW50LnRpbWVzdGFtcDtcblx0cmV0dXJuIGlzU3RyaW5nKHRpbWVzdGFtcCkgJiYgTnVtYmVyLmlzRmluaXRlKERhdGUucGFyc2UodGltZXN0YW1wKSkgPyB0aW1lc3RhbXAgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHJlYWRTdHJpbmdQcm9wZXJ0eShzb3VyY2U6IHVua25vd24sIGtleTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFzb3VyY2UgfHwgdHlwZW9mIHNvdXJjZSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheShzb3VyY2UpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB2YWx1ZSA9IChzb3VyY2UgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2tleV07XG5cdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIHZhbHVlLmxlbmd0aCA+IDAgPyB2YWx1ZSA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gcmVhZE1jcFVpUmVzb3VyY2VVcmkoc291cmNlOiB1bmtub3duKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFzb3VyY2UgfHwgdHlwZW9mIHNvdXJjZSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheShzb3VyY2UpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB0b29sRGVzY3JpcHRpb24gPSAoc291cmNlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVsndG9vbERlc2NyaXB0aW9uJ107XG5cdGlmICghdG9vbERlc2NyaXB0aW9uIHx8IHR5cGVvZiB0b29sRGVzY3JpcHRpb24gIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkodG9vbERlc2NyaXB0aW9uKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgbWV0YSA9ICh0b29sRGVzY3JpcHRpb24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pWydfbWV0YSddO1xuXHRpZiAoIW1ldGEgfHwgdHlwZW9mIG1ldGEgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkobWV0YSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHVpID0gKG1ldGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pWyd1aSddO1xuXHRpZiAoIXVpIHx8IHR5cGVvZiB1aSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheSh1aSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiByZWFkU3RyaW5nUHJvcGVydHkodWksICdyZXNvdXJjZVVyaScpO1xufVxuXG5mdW5jdGlvbiBtYWtlVG9vbFN0YXJ0SW5mbyh0b29sTmFtZTogc3RyaW5nLCByYXdBcmd1bWVudHM6IHVua25vd24sIHBhcmVudFRvb2xDYWxsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLCBzb3VyY2U6IHVua25vd24pOiBJVG9vbFN0YXJ0SW5mbyB8IHVuZGVmaW5lZCB7XG5cdGlmIChpc0hpZGRlblRvb2wodG9vbE5hbWUpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCByYXdBcmdzID0gcmF3QXJndW1lbnRzICE9PSB1bmRlZmluZWQgPyB0cnlTdHJpbmdpZnkocmF3QXJndW1lbnRzKSA6IHVuZGVmaW5lZDtcblx0bGV0IHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuXHRpZiAocmF3QXJncykge1xuXHRcdHRyeSB7IHBhcmFtZXRlcnMgPSBKU09OLnBhcnNlKHJhd0FyZ3MpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+OyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblx0fVxuXHQvLyBzdHJpcFJlZHVuZGFudENkUHJlZml4IG11dGF0ZXMgYHBhcmFtZXRlcnNgIGFuZCBzaWduYWxzIHZpYSBpdHNcblx0Ly8gcmV0dXJuIHZhbHVlLiBXZSByZS1zdHJpbmdpZnkgb25seSB3aGVuIGl0IGNoYW5nZWQgc29tZXRoaW5nIHNvXG5cdC8vIGBnZXRUb29sSW5wdXRTdHJpbmdgIHNlZXMgdGhlIGNsZWFuZWQgY29tbWFuZCBsaW5lLlxuXHRjb25zdCBjbGVhbmVkID0gc3RyaXBSZWR1bmRhbnRDZFByZWZpeCh0b29sTmFtZSwgcGFyYW1ldGVycywgd29ya2luZ0RpcmVjdG9yeSkgPyB0cnlTdHJpbmdpZnkocGFyYW1ldGVycykgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IHRvb2xBcmdzID0gY2xlYW5lZCA/PyByYXdBcmdzO1xuXHRjb25zdCB0b29sS2luZCA9IGdldFRvb2xLaW5kKHRvb2xOYW1lKTtcblx0Y29uc3Qgc3ViYWdlbnRNZXRhID0gdG9vbEtpbmQgPT09ICdzdWJhZ2VudCcgPyBnZXRTdWJhZ2VudE1ldGFkYXRhKHBhcmFtZXRlcnMpIDogdW5kZWZpbmVkO1xuXHRjb25zdCBkaXNwbGF5TmFtZSA9IGdldFRvb2xEaXNwbGF5TmFtZSh0b29sTmFtZSk7XG5cdHJldHVybiB7XG5cdFx0dG9vbE5hbWUsXG5cdFx0ZGlzcGxheU5hbWUsXG5cdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGdldEludm9jYXRpb25NZXNzYWdlKHRvb2xOYW1lLCBkaXNwbGF5TmFtZSwgcGFyYW1ldGVycywgcGF0aCA9PiByZXNvbHZlVG9vbERpc3BsYXlQYXRoKHBhdGgsIHdvcmtpbmdEaXJlY3RvcnkpKSxcblx0XHR0b29sSW5wdXQ6IGdldFRvb2xJbnB1dFN0cmluZyh0b29sTmFtZSwgcGFyYW1ldGVycywgdG9vbEFyZ3MpLFxuXHRcdHRvb2xLaW5kLFxuXHRcdGxhbmd1YWdlOiB0b29sS2luZCA9PT0gJ3Rlcm1pbmFsJyA/IGdldFNoZWxsTGFuZ3VhZ2UodG9vbE5hbWUpIDogdW5kZWZpbmVkLFxuXHRcdGludGVudGlvbjogZ2V0U2hlbGxJbnRlbnRpb24odG9vbE5hbWUsIHBhcmFtZXRlcnMpLFxuXHRcdHN1YmFnZW50QWdlbnROYW1lOiBzdWJhZ2VudE1ldGE/LmFnZW50TmFtZSxcblx0XHRzdWJhZ2VudERlc2NyaXB0aW9uOiBzdWJhZ2VudE1ldGE/LmRlc2NyaXB0aW9uLFxuXHRcdHBhcmFtZXRlcnMsXG5cdFx0cGFyZW50VG9vbENhbGxJZCxcblx0XHRtY3BTZXJ2ZXJOYW1lOiByZWFkU3RyaW5nUHJvcGVydHkoc291cmNlLCAnbWNwU2VydmVyTmFtZScpLFxuXHRcdG1jcFRvb2xOYW1lOiByZWFkU3RyaW5nUHJvcGVydHkoc291cmNlLCAnbWNwVG9vbE5hbWUnKSxcblx0XHRtY3BVaVJlc291cmNlVXJpOiByZWFkTWNwVWlSZXNvdXJjZVVyaShzb3VyY2UpLFxuXHR9O1xufVxuXG4vKiogU2VhbHMgYSB0dXJuIGJ1aWxkZXIgaW50byBhIHtAbGluayBUdXJufSwgZGVyaXZpbmcgYGR1cmF0aW9uYCBmcm9tIGl0cyBmaXJzdCBhbmQgbGFzdCBldmVudCB0aW1lc3RhbXBzLiAqL1xuZnVuY3Rpb24gZmluYWxpemVUdXJuKGJ1aWxkZXI6IElUdXJuQnVpbGRlciwgc3RhdGU6IFR1cm5TdGF0ZSk6IFR1cm4ge1xuXHRjb25zdCBzdGFydGVkQXRNcyA9IGJ1aWxkZXIuc3RhcnRlZEF0ID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBEYXRlLnBhcnNlKGJ1aWxkZXIuc3RhcnRlZEF0KTtcblx0Y29uc3QgZW5kZWRBdE1zID0gYnVpbGRlci5sYXN0RXZlbnRBdCA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogRGF0ZS5wYXJzZShidWlsZGVyLmxhc3RFdmVudEF0KTtcblx0Y29uc3QgZHVyYXRpb24gPSBzdGFydGVkQXRNcyAhPT0gdW5kZWZpbmVkICYmIGVuZGVkQXRNcyAhPT0gdW5kZWZpbmVkICYmIE51bWJlci5pc0Zpbml0ZShzdGFydGVkQXRNcykgJiYgTnVtYmVyLmlzRmluaXRlKGVuZGVkQXRNcylcblx0XHQ/IE1hdGgubWF4KDAsIGVuZGVkQXRNcyAtIHN0YXJ0ZWRBdE1zKVxuXHRcdDogdW5kZWZpbmVkO1xuXHRyZXR1cm4ge1xuXHRcdGlkOiBidWlsZGVyLmlkLFxuXHRcdC4uLihidWlsZGVyLnN0YXJ0ZWRBdCAhPT0gdW5kZWZpbmVkID8geyBzdGFydGVkQXQ6IGJ1aWxkZXIuc3RhcnRlZEF0IH0gOiB7fSksXG5cdFx0Li4uKGR1cmF0aW9uICE9PSB1bmRlZmluZWQgPyB7IGR1cmF0aW9uIH0gOiB7fSksXG5cdFx0bWVzc2FnZTogYnVpbGRlci5tZXNzYWdlLFxuXHRcdHJlc3BvbnNlUGFydHM6IGJ1aWxkZXIucmVzcG9uc2VQYXJ0cyxcblx0XHR1c2FnZTogYnVpbGRlci51c2FnZSxcblx0XHRzdGF0ZSxcblx0fTtcbn1cblxuLyoqXG4gKiBNYXBzIHJhdyBTREsgc2Vzc2lvbiBldmVudHMgZGlyZWN0bHkgaW50byBhZ2VudC1wcm90b2NvbCB7QGxpbmsgVHVybn1zXG4gKiBmb3IgdGhlIHBhcmVudCBzZXNzaW9uIGFuZCBhbnkgc3ViYWdlbnQgY2hpbGQgc2Vzc2lvbnMsIHJlc3RvcmluZyBzdG9yZWRcbiAqIGZpbGUtZWRpdCBtZXRhZGF0YSBmcm9tIHRoZSBzZXNzaW9uIGRhdGFiYXNlIHdoZW4gYXZhaWxhYmxlLlxuICpcbiAqIFN1YmFnZW50IGlubmVyIGV2ZW50cyBhcmUgcm91dGVkIHRvIHBlci1gcGFyZW50VG9vbENhbGxJZGAgdHVybiBidWlsZGVyc1xuICogc28gdGhleSBhcHBlYXIgdW5kZXIgdGhlaXIgb3duIHNlc3Npb24gdmlldyByYXRoZXIgdGhhbiBwb2xsdXRpbmcgdGhlXG4gKiBwYXJlbnQgdHJhbnNjcmlwdC4gRWFjaCBzdWJhZ2VudCdzIHRvb2wgY2FsbHMgYXJlIHJldHVybmVkIHZpYVxuICoge0BsaW5rIG1hcFNlc3Npb25FdmVudHNUb1R1cm5zLnN1YmFnZW50VHVybnNCeVRvb2xDYWxsSWR9IHNvIGNhbGxlcnMgY2FuXG4gKiBleHBvc2UgYGdldFN1YmFnZW50TWVzc2FnZXNgIGNoZWFwbHkuXG4gKlxuICogSWYgYHdvcmtpbmdEaXJlY3RvcnlgIGlzIHByb3ZpZGVkLCByZWR1bmRhbnQgYGNkIDx3b3JraW5nRGlyZWN0b3J5PiAmJmBcbiAqIChvciBQb3dlclNoZWxsIGVxdWl2YWxlbnQpIHByZWZpeGVzIGFyZSBzdHJpcHBlZCBmcm9tIHNoZWxsIHRvb2xcbiAqIGNvbW1hbmRzIHNvIGNsaWVudHMgc2VlIHRoZSBzaW1wbGlmaWVkIGZvcm0uXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBtYXBTZXNzaW9uRXZlbnRzKFxuXHRzZXNzaW9uOiBVUkksXG5cdGRiOiBJU2Vzc2lvbkRhdGFiYXNlIHwgdW5kZWZpbmVkLFxuXHRldmVudHM6IHJlYWRvbmx5IFNlc3Npb25FdmVudFtdLFxuXHRvcHRpb25zOiBVUkkgfCBJTWFwU2Vzc2lvbkV2ZW50c09wdGlvbnMgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsXG4pOiBQcm9taXNlPHsgdHVybnM6IFR1cm5bXTsgc3ViYWdlbnRUdXJuc0J5VG9vbENhbGxJZDogUmVhZG9ubHlNYXA8c3RyaW5nLCBUdXJuW10+IH0+IHtcblx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IG9wdGlvbnMgaW5zdGFuY2VvZiBVUkkgPyBvcHRpb25zIDogb3B0aW9ucz8ud29ya2luZ0RpcmVjdG9yeTtcblx0bGV0IGN1cnJlbnRNb2RlbCA9IG9wdGlvbnMgaW5zdGFuY2VvZiBVUkkgPyB1bmRlZmluZWQgOiBvcHRpb25zPy5tb2RlbDtcblx0bGV0IGN1cnJlbnRBZ2VudCA9IG9wdGlvbnMgaW5zdGFuY2VvZiBVUkkgPyB1bmRlZmluZWQgOiBvcHRpb25zPy5hZ2VudDtcblx0Ly8gRmlyc3QgcGFzczogY29sbGVjdCB0b29sLWFyZyBpbmZvIGFuZCBpZGVudGlmeSBlZGl0IHRvb2wgY2FsbHMgc28gd2Vcblx0Ly8gY2FuIGJhdGNoLWxvYWQgdGhlaXIgc3RvcmVkIGZpbGUgZWRpdHMgYmVmb3JlIHRoZSBzZWNvbmQgcGFzcyBuZWVkc1xuXHQvLyB0aGVtIGF0IGB0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZWAgdGltZS4gV2UgYWxzbyBidWlsZCB0aGVcblx0Ly8gYGFnZW50SWRgIC0+IHBhcmVudCB0b29sIGNhbGwgaWQgbWFwIGhlcmUgc28gdGhlIHNlY29uZCBwYXNzIGNhbiByb3V0ZVxuXHQvLyBzdWItYWdlbnQgZXZlbnRzIHdpdGhvdXQgZGVwZW5kaW5nIG9uIGV2ZW50IG9yZGVyaW5nLlxuXHRjb25zdCB0b29sSW5mb0J5Q2FsbElkID0gbmV3IE1hcDxzdHJpbmcsIElUb29sU3RhcnRJbmZvPigpO1xuXHRjb25zdCBlZGl0VG9vbENhbGxJZHM6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IGNvbXBsZXRpb25zQnlDYWxsSWQgPSBuZXcgTWFwPHN0cmluZywgVG9vbEV4ZWN1dGlvbkNvbXBsZXRlRGF0YT4oKTtcblxuXHQvLyBUaGUgU0RLIHRhZ3MgZXZlbnRzIHRoYXQgb3JpZ2luYXRlIGZyb20gYSBzdWItYWdlbnQgd2l0aCBhblxuXHQvLyBlbnZlbG9wZS1sZXZlbCBgYWdlbnRJZGAgKHRoZSBkZXByZWNhdGVkIGBkYXRhLnBhcmVudFRvb2xDYWxsSWRgIGlzIG5vXG5cdC8vIGxvbmdlciBwb3B1bGF0ZWQpLiBgc3ViYWdlbnQuc3RhcnRlZGAgY2FycmllcyBib3RoIHRoZSBzdWItYWdlbnQnc1xuXHQvLyBgYWdlbnRJZGAgYW5kIHRoZSBwYXJlbnQgdG9vbCBjYWxsIGlkIGl0IHdhcyBzcGF3bmVkIGZyb20sIHNvIHdlIG1hcFxuXHQvLyBvbmUgdG8gdGhlIG90aGVyIGFuZCByZXNvbHZlIGV2ZXJ5IGxhdGVyIHN1Yi1hZ2VudCBldmVudCB0aHJvdWdoIGl0LlxuXHRjb25zdCBwYXJlbnRUb29sQ2FsbElkQnlBZ2VudElkID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0Y29uc3QgcmVzb2x2ZVBhcmVudFRvb2xDYWxsSWQgPSAoYWdlbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBkZXByZWNhdGVkUGFyZW50VG9vbENhbGxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRjb25zdCBtYXBwZWQgPSBhZ2VudElkID8gcGFyZW50VG9vbENhbGxJZEJ5QWdlbnRJZC5nZXQoYWdlbnRJZCkgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIG1hcHBlZCA/PyBkZXByZWNhdGVkUGFyZW50VG9vbENhbGxJZDtcblx0fTtcblxuXHRmb3IgKGNvbnN0IGUgb2YgZXZlbnRzKSB7XG5cdFx0aWYgKGUudHlwZSA9PT0gJ3N1YmFnZW50LnN0YXJ0ZWQnKSB7XG5cdFx0XHRpZiAoZS5hZ2VudElkKSB7XG5cdFx0XHRcdHBhcmVudFRvb2xDYWxsSWRCeUFnZW50SWQuc2V0KGUuYWdlbnRJZCwgZS5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoZS50eXBlID09PSAndG9vbC5leGVjdXRpb25fY29tcGxldGUnKSB7XG5cdFx0XHRjb21wbGV0aW9uc0J5Q2FsbElkLnNldChlLmRhdGEudG9vbENhbGxJZCwgZS5kYXRhKTtcblx0XHR9XG5cdFx0aWYgKGUudHlwZSA9PT0gJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0Jykge1xuXHRcdFx0Y29uc3QgZCA9IGUuZGF0YTtcblx0XHRcdGNvbnN0IHBhcmVudFRvb2xDYWxsSWQgPSByZXNvbHZlUGFyZW50VG9vbENhbGxJZChlLmFnZW50SWQsIGQucGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRjb25zdCBpbmZvID0gbWFrZVRvb2xTdGFydEluZm8oZC50b29sTmFtZSwgZC5hcmd1bWVudHMsIHBhcmVudFRvb2xDYWxsSWQsIHdvcmtpbmdEaXJlY3RvcnksIGQpO1xuXHRcdFx0aWYgKCFpbmZvKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dG9vbEluZm9CeUNhbGxJZC5zZXQoZC50b29sQ2FsbElkLCBpbmZvKTtcblx0XHRcdGNvbnN0IGNvbW1hbmQgPSBpc1N0cmluZyhpbmZvLnBhcmFtZXRlcnM/LmNvbW1hbmQpID8gaW5mby5wYXJhbWV0ZXJzLmNvbW1hbmQgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoaXNFZGl0VG9vbChkLnRvb2xOYW1lLCBjb21tYW5kKSkge1xuXHRcdFx0XHRlZGl0VG9vbENhbGxJZHMucHVzaChkLnRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIFByZS1sb2FkIHN0b3JlZCBmaWxlLWVkaXQgbWV0YWRhdGEgZm9yIGFsbCBlZGl0IHRvb2wgY2FsbHMuXG5cdGxldCBzdG9yZWRFZGl0czogTWFwPHN0cmluZywgSUZpbGVFZGl0UmVjb3JkW10+IHwgdW5kZWZpbmVkO1xuXHRpZiAoZGIgJiYgZWRpdFRvb2xDYWxsSWRzLmxlbmd0aCA+IDApIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVjb3JkcyA9IGF3YWl0IGRiLmdldEZpbGVFZGl0cyhlZGl0VG9vbENhbGxJZHMpO1xuXHRcdFx0aWYgKHJlY29yZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRzdG9yZWRFZGl0cyA9IG5ldyBNYXAoKTtcblx0XHRcdFx0Zm9yIChjb25zdCByIG9mIHJlY29yZHMpIHtcblx0XHRcdFx0XHRsZXQgbGlzdCA9IHN0b3JlZEVkaXRzLmdldChyLnRvb2xDYWxsSWQpO1xuXHRcdFx0XHRcdGlmICghbGlzdCkge1xuXHRcdFx0XHRcdFx0bGlzdCA9IFtdO1xuXHRcdFx0XHRcdFx0c3RvcmVkRWRpdHMuc2V0KHIudG9vbENhbGxJZCwgbGlzdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxpc3QucHVzaChyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gRGF0YWJhc2UgbWF5IG5vdCBleGlzdCB5ZXQgZm9yIG5ldyBzZXNzaW9ucyBcdTIwMTQgdGhhdCdzIGZpbmUuXG5cdFx0fVxuXHR9XG5cblx0Y29uc3Qgc2Vzc2lvblVyaVN0ciA9IHNlc3Npb24udG9TdHJpbmcoKTtcblx0Y29uc3QgcHJvdmlkZXJJZCA9IHNlc3Npb24uc2NoZW1lO1xuXHRjb25zdCByYXdTZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdGNvbnN0IHR1cm5zOiBUdXJuW10gPSBbXTtcblxuXHQvLyBTdWJhZ2VudCBzdGF0ZS4gRWFjaCBzdWJhZ2VudCBoYXMgaXRzIG93biBhY3RpdmUgdHVybiBidWlsZGVyOyBvbmx5XG5cdC8vIHRoZSBtb3N0IHJlY2VudCB0dXJuIHBlciBzdWJhZ2VudCBpcyBidWlsdCAoc3ViYWdlbnRzIGN1cnJlbnRseSBlbWl0XG5cdC8vIGF0IG1vc3Qgb25lIHR1cm4gcGVyIGludm9jYXRpb24pLlxuXHRjb25zdCBzdWJhZ2VudEJ1aWxkZXJzID0gbmV3IE1hcDxzdHJpbmcsIElUdXJuQnVpbGRlcj4oKTtcblx0Y29uc3Qgc3ViYWdlbnRUdXJuU3RhdGVzID0gbmV3IE1hcDxzdHJpbmcsIFR1cm5TdGF0ZT4oKTtcblx0Y29uc3Qgc3ViYWdlbnRUdXJucyA9IG5ldyBNYXA8c3RyaW5nLCBUdXJuW10+KCk7XG5cdGNvbnN0IHN1YmFnZW50SW5mb0J5VG9vbENhbGxJZCA9IG5ldyBNYXA8c3RyaW5nLCBJU3ViYWdlbnRJbmZvPigpO1xuXG5cdGxldCBwYXJlbnRCdWlsZGVyOiBJVHVybkJ1aWxkZXIgfCB1bmRlZmluZWQ7XG5cdGxldCBwYXJlbnRUdXJuU3RhdGUgPSBUdXJuU3RhdGUuQ2FuY2VsbGVkO1xuXHRsZXQgcGFyZW50VHVybkFib3J0ZWQgPSBmYWxzZTtcblx0bGV0IHJvb3RBc3Npc3RhbnRUdXJuQWN0aXZlID0gZmFsc2U7XG5cdGxldCBwZW5kaW5nQXV0b01vZGVSZXNvbHZlZDogRXh0cmFjdDxTZXNzaW9uRXZlbnQsIHsgdHlwZTogJ3Nlc3Npb24uYXV0b19tb2RlX3Jlc29sdmVkJyB9PlsnZGF0YSddIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBFbnZlbG9wZSB0aW1lc3RhbXAgb2YgdGhlIGV2ZW50IGN1cnJlbnRseSBiZWluZyBwcm9jZXNzZWQuICovXG5cdGxldCBjdXJyZW50RXZlbnRUaW1lc3RhbXA6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvKiogUmVjb3JkcyB0aGUgY3VycmVudCBldmVudCBhcyBiZWxvbmdpbmcgdG8gYGJ1aWxkZXJgLCBzbyBpdCBib3VuZHMgdGhhdCB0dXJuJ3MgZHVyYXRpb24uICovXG5cdGNvbnN0IHRvdWNoID0gKGJ1aWxkZXI6IElUdXJuQnVpbGRlciB8IHVuZGVmaW5lZCk6IHZvaWQgPT4ge1xuXHRcdGlmIChidWlsZGVyICYmIGN1cnJlbnRFdmVudFRpbWVzdGFtcCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRidWlsZGVyLmxhc3RFdmVudEF0ID0gY3VycmVudEV2ZW50VGltZXN0YW1wO1xuXHRcdH1cblx0fTtcblxuXHRjb25zdCBmbHVzaFBhcmVudCA9ICgpOiB2b2lkID0+IHtcblx0XHRpZiAoIXBhcmVudEJ1aWxkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHVybnMucHVzaChmaW5hbGl6ZVR1cm4ocGFyZW50QnVpbGRlciwgcGFyZW50VHVyblN0YXRlKSk7XG5cdFx0cGFyZW50QnVpbGRlciA9IHVuZGVmaW5lZDtcblx0XHRwYXJlbnRUdXJuU3RhdGUgPSBUdXJuU3RhdGUuQ2FuY2VsbGVkO1xuXHRcdHBhcmVudFR1cm5BYm9ydGVkID0gZmFsc2U7XG5cdH07XG5cblx0Y29uc3QgZmx1c2hTdWJhZ2VudCA9IChwYXJlbnRUb29sQ2FsbElkOiBzdHJpbmcpOiB2b2lkID0+IHtcblx0XHRjb25zdCBidWlsZGVyID0gc3ViYWdlbnRCdWlsZGVycy5nZXQocGFyZW50VG9vbENhbGxJZCk7XG5cdFx0aWYgKCFidWlsZGVyKSB7XG5cdFx0XHRzdWJhZ2VudFR1cm5TdGF0ZXMuZGVsZXRlKHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzdWJhZ2VudEJ1aWxkZXJzLmRlbGV0ZShwYXJlbnRUb29sQ2FsbElkKTtcblx0XHRjb25zdCBzdGF0ZSA9IHN1YmFnZW50VHVyblN0YXRlcy5nZXQocGFyZW50VG9vbENhbGxJZCkgPz8gVHVyblN0YXRlLkNvbXBsZXRlO1xuXHRcdHN1YmFnZW50VHVyblN0YXRlcy5kZWxldGUocGFyZW50VG9vbENhbGxJZCk7XG5cdFx0aWYgKGJ1aWxkZXIucmVzcG9uc2VQYXJ0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGlzdCA9IHN1YmFnZW50VHVybnMuZ2V0KHBhcmVudFRvb2xDYWxsSWQpID8/IFtdO1xuXHRcdGxpc3QucHVzaChmaW5hbGl6ZVR1cm4oYnVpbGRlciwgc3RhdGUpKTtcblx0XHRzdWJhZ2VudFR1cm5zLnNldChwYXJlbnRUb29sQ2FsbElkLCBsaXN0KTtcblx0fTtcblxuXHRjb25zdCBlbnN1cmVTdWJhZ2VudEJ1aWxkZXIgPSAocGFyZW50VG9vbENhbGxJZDogc3RyaW5nKTogSVR1cm5CdWlsZGVyID0+IHtcblx0XHRsZXQgYnVpbGRlciA9IHN1YmFnZW50QnVpbGRlcnMuZ2V0KHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdGlmICghYnVpbGRlcikge1xuXHRcdFx0YnVpbGRlciA9IG5ld1R1cm5CdWlsZGVyKGdlbmVyYXRlVXVpZCgpLCAnJywgeyBzdGFydGVkQXQ6IGN1cnJlbnRFdmVudFRpbWVzdGFtcCB9KTtcblx0XHRcdHN1YmFnZW50QnVpbGRlcnMuc2V0KHBhcmVudFRvb2xDYWxsSWQsIGJ1aWxkZXIpO1xuXHRcdFx0aWYgKCFzdWJhZ2VudFR1cm5TdGF0ZXMuaGFzKHBhcmVudFRvb2xDYWxsSWQpKSB7XG5cdFx0XHRcdHN1YmFnZW50VHVyblN0YXRlcy5zZXQocGFyZW50VG9vbENhbGxJZCwgVHVyblN0YXRlLkNvbXBsZXRlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dG91Y2goYnVpbGRlcik7XG5cdFx0cmV0dXJuIGJ1aWxkZXI7XG5cdH07XG5cblx0Y29uc3QgdGFyZ2V0QnVpbGRlckZvciA9IChwYXJlbnRUb29sQ2FsbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJVHVybkJ1aWxkZXIgfCB1bmRlZmluZWQgPT4ge1xuXHRcdGlmIChwYXJlbnRUb29sQ2FsbElkKSB7XG5cdFx0XHRyZXR1cm4gZW5zdXJlU3ViYWdlbnRCdWlsZGVyKHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdH1cblx0XHR0b3VjaChwYXJlbnRCdWlsZGVyKTtcblx0XHRyZXR1cm4gcGFyZW50QnVpbGRlcjtcblx0fTtcblxuXHRmb3IgKGNvbnN0IGUgb2YgZXZlbnRzKSB7XG5cdFx0Y3VycmVudEV2ZW50VGltZXN0YW1wID0gcmVhZEV2ZW50VGltZXN0YW1wKGUpO1xuXHRcdHN3aXRjaCAoZS50eXBlKSB7XG5cdFx0XHRjYXNlICdhc3Npc3RhbnQudHVybl9zdGFydCc6XG5cdFx0XHRcdGlmICghZS5hZ2VudElkKSB7XG5cdFx0XHRcdFx0cm9vdEFzc2lzdGFudFR1cm5BY3RpdmUgPSB0cnVlO1xuXHRcdFx0XHRcdHRvdWNoKHBhcmVudEJ1aWxkZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnYXNzaXN0YW50LnR1cm5fZW5kJzpcblx0XHRcdFx0aWYgKCFlLmFnZW50SWQpIHtcblx0XHRcdFx0XHRyb290QXNzaXN0YW50VHVybkFjdGl2ZSA9IGZhbHNlO1xuXHRcdFx0XHRcdHRvdWNoKHBhcmVudEJ1aWxkZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnc2Vzc2lvbi5tb2RlbF9jaGFuZ2UnOiB7XG5cdFx0XHRcdGN1cnJlbnRNb2RlbCA9IHsgaWQ6IGUuZGF0YS5uZXdNb2RlbCB9O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3Nlc3Npb24uYXV0b19tb2RlX3Jlc29sdmVkJzoge1xuXHRcdFx0XHRpZiAoIWUuYWdlbnRJZCkge1xuXHRcdFx0XHRcdHBlbmRpbmdBdXRvTW9kZVJlc29sdmVkID0gZS5kYXRhO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnc3ViYWdlbnQuZGVzZWxlY3RlZCc6IHtcblx0XHRcdFx0aWYgKCFlLmFnZW50SWQpIHtcblx0XHRcdFx0XHRjdXJyZW50QWdlbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICd1c2VyLm1lc3NhZ2UnOiB7XG5cdFx0XHRcdGlmIChpc1N5bnRoZXRpY1VzZXJNZXNzYWdlKGUpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZCA9IGUuZGF0YTtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZUlkID0gZC5pbnRlcmFjdGlvbklkID8/ICcnO1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gZC5jb250ZW50ID8/ICcnO1xuXHRcdFx0XHRjb25zdCBhdHRhY2htZW50cyA9IHNka0F0dGFjaG1lbnRzVG9Qcm90b2NvbChkLmF0dGFjaG1lbnRzKTtcblx0XHRcdFx0Ly8gVXNlciBtZXNzYWdlcyBjYXJyeSBubyBkZXByZWNhdGVkIGBwYXJlbnRUb29sQ2FsbElkYDsgcm91dGVcblx0XHRcdFx0Ly8gc3ViLWFnZW50IHVzZXIgbWVzc2FnZXMgYnkgdGhlIGVudmVsb3BlIGBhZ2VudElkYCBvbmx5LlxuXHRcdFx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbElkID0gcmVzb2x2ZVBhcmVudFRvb2xDYWxsSWQoZS5hZ2VudElkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRpZiAoZS5hZ2VudElkICYmICFwYXJlbnRUb29sQ2FsbElkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBhcmVudFRvb2xDYWxsSWQpIHtcblx0XHRcdFx0XHRjb25zdCBidWlsZGVyID0gZW5zdXJlU3ViYWdlbnRCdWlsZGVyKHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0XHRcdGJ1aWxkZXIubWVzc2FnZSA9IHtcblx0XHRcdFx0XHRcdC4uLmJ1aWxkZXIubWVzc2FnZSxcblx0XHRcdFx0XHRcdHRleHQ6IGNvbnRlbnQsXG5cdFx0XHRcdFx0XHQuLi4oYXR0YWNobWVudHM/Lmxlbmd0aCA/IHsgYXR0YWNobWVudHMgfSA6IHt9KSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIEEgbmV3IHRvcC1sZXZlbCB1c2VyIG1lc3NhZ2Ugc3RhcnRzIGEgbmV3IHBhcmVudCB0dXJuLlxuXHRcdFx0XHRcdC8vIFVzZSB0aGUgU0RLIGVudmVsb3BlIGlkICh0aGUgc2FtZSB2YWx1ZVxuXHRcdFx0XHRcdC8vIGBzZXRUdXJuRXZlbnRJZGAgcmVjb3JkcyBhcyBgZXZlbnRfaWRgKSBzbyB0aGUgcmVzdG9yZWRcblx0XHRcdFx0XHQvLyB0dXJuIGlkIHJvdW5kLXRyaXBzIGJhY2sgdG8gdGhlIFNESyBib3VuZGFyeSBpZCB0aGF0XG5cdFx0XHRcdFx0Ly8gZm9yayAvIHRydW5jYXRlIFJQQ3Mgb3BlcmF0ZSBvbi5cblx0XHRcdFx0XHRmbHVzaFBhcmVudCgpO1xuXHRcdFx0XHRcdGNvbnN0IHR1cm5JZCA9IGUuaWQgPz8gbWVzc2FnZUlkO1xuXHRcdFx0XHRcdHBhcmVudEJ1aWxkZXIgPSBuZXdUdXJuQnVpbGRlcih0dXJuSWQsIGNvbnRlbnQsIHsgYXR0YWNobWVudHMsIG1vZGVsOiBjdXJyZW50TW9kZWwsIGFnZW50OiBjdXJyZW50QWdlbnQsIHN0YXJ0ZWRBdDogY3VycmVudEV2ZW50VGltZXN0YW1wIH0pO1xuXHRcdFx0XHRcdGlmIChwZW5kaW5nQXV0b01vZGVSZXNvbHZlZCkge1xuXHRcdFx0XHRcdFx0cGFyZW50QnVpbGRlci51c2FnZSA9IHtcblx0XHRcdFx0XHRcdFx0bW9kZWw6IHBlbmRpbmdBdXRvTW9kZVJlc29sdmVkLmNob3Nlbk1vZGVsLFxuXHRcdFx0XHRcdFx0XHRfbWV0YTogeyBhdXRvTW9kZVJlc29sdmVkOiBwZW5kaW5nQXV0b01vZGVSZXNvbHZlZCB9LFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdHBlbmRpbmdBdXRvTW9kZVJlc29sdmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2Fzc2lzdGFudC5tZXNzYWdlJzoge1xuXHRcdFx0XHRjb25zdCBkID0gZS5kYXRhO1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlSWQgPSBkLm1lc3NhZ2VJZCA/PyBkLmludGVyYWN0aW9uSWQgPz8gJyc7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBkLmNvbnRlbnQgPz8gJyc7XG5cdFx0XHRcdGNvbnN0IHJlYXNvbmluZ1RleHQgPSBkLnJlYXNvbmluZ1RleHQ7XG5cdFx0XHRcdGNvbnN0IGhhc1Rvb2xSZXF1ZXN0cyA9ICEhZC50b29sUmVxdWVzdHMgJiYgZC50b29sUmVxdWVzdHMubGVuZ3RoID4gMDtcblx0XHRcdFx0Y29uc3QgcGFyZW50VG9vbENhbGxJZCA9IHJlc29sdmVQYXJlbnRUb29sQ2FsbElkKGUuYWdlbnRJZCwgZC5wYXJlbnRUb29sQ2FsbElkKTtcblx0XHRcdFx0aWYgKCFjb250ZW50ICYmICFyZWFzb25pbmdUZXh0ICYmICFoYXNUb29sUmVxdWVzdHMpIHtcblx0XHRcdFx0XHRpZiAoIXBhcmVudFRvb2xDYWxsSWQgJiYgcGFyZW50QnVpbGRlciAmJiAhcGFyZW50VHVybkFib3J0ZWQpIHtcblx0XHRcdFx0XHRcdHBhcmVudFR1cm5TdGF0ZSA9IFR1cm5TdGF0ZS5Db21wbGV0ZTtcblx0XHRcdFx0XHRcdHRvdWNoKHBhcmVudEJ1aWxkZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBXaGVuIHRoaXMgaXMgdGhlIGZpcnN0IGV2ZW50IGluIGEgdHVybiAobm8gcGFyZW50IGJ1aWxkZXJcblx0XHRcdFx0Ly8geWV0KSwgc2VlZCB0aGUgYnVpbGRlciB3aXRoIHRoZSBTREsgZW52ZWxvcGUgaWQgc28gdGhlXG5cdFx0XHRcdC8vIHR1cm4gaWQgbWF0Y2hlcyBgdHVybnMuZXZlbnRfaWRgIGZvciBmb3JrL3RydW5jYXRlXG5cdFx0XHRcdC8vIGxvb2t1cHMuIFNlZSB0aGUgbWF0Y2hpbmcgbm90ZSBpbiB0aGUgYHVzZXIubWVzc2FnZWBcblx0XHRcdFx0Ly8gYnJhbmNoIGFib3ZlLlxuXHRcdFx0XHRjb25zdCBmYWxsYmFja1R1cm5JZCA9IGUuaWQgPz8gbWVzc2FnZUlkO1xuXHRcdFx0XHRjb25zdCBidWlsZGVyID0gdGFyZ2V0QnVpbGRlckZvcihwYXJlbnRUb29sQ2FsbElkKVxuXHRcdFx0XHRcdD8/IChwYXJlbnRCdWlsZGVyID0gbmV3VHVybkJ1aWxkZXIoZmFsbGJhY2tUdXJuSWQsICcnLCB7IHN0YXJ0ZWRBdDogY3VycmVudEV2ZW50VGltZXN0YW1wIH0pKTtcblx0XHRcdFx0aWYgKHJlYXNvbmluZ1RleHQpIHtcblx0XHRcdFx0XHRidWlsZGVyLnJlc3BvbnNlUGFydHMucHVzaCh7XG5cdFx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZyxcblx0XHRcdFx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IHJlYXNvbmluZ1RleHQsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdFx0XHRidWlsZGVyLnJlc3BvbnNlUGFydHMucHVzaCh7XG5cdFx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLFxuXHRcdFx0XHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXBhcmVudFRvb2xDYWxsSWQgJiYgYnVpbGRlciA9PT0gcGFyZW50QnVpbGRlciAmJiAhcGFyZW50VHVybkFib3J0ZWQpIHtcblx0XHRcdFx0XHRwYXJlbnRUdXJuU3RhdGUgPSBoYXNUb29sUmVxdWVzdHMgPyBUdXJuU3RhdGUuQ2FuY2VsbGVkIDogVHVyblN0YXRlLkNvbXBsZXRlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChkLnRvb2xSZXF1ZXN0cz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0YXBwZW5kRmFsbGJhY2tUb29sUmVxdWVzdHMoYnVpbGRlciwgZC50b29sUmVxdWVzdHMsIHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnc3lzdGVtLm5vdGlmaWNhdGlvbic6IHtcblx0XHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gYnVpbGRDb3BpbG90U3lzdGVtTm90aWZpY2F0aW9uKGUpO1xuXHRcdFx0XHRpZiAoIW5vdGlmaWNhdGlvbikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChyb290QXNzaXN0YW50VHVybkFjdGl2ZSAmJiBwYXJlbnRCdWlsZGVyKSB7XG5cdFx0XHRcdFx0cGFyZW50QnVpbGRlci5yZXNwb25zZVBhcnRzLnB1c2goe1xuXHRcdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5TeXN0ZW1Ob3RpZmljYXRpb24sXG5cdFx0XHRcdFx0XHRjb250ZW50OiBub3RpZmljYXRpb24ubWVzc2FnZVRleHQsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dG91Y2gocGFyZW50QnVpbGRlcik7XG5cdFx0XHRcdH0gZWxzZSBpZiAobm90aWZpY2F0aW9uLnN0YXJ0c1R1cm4pIHtcblx0XHRcdFx0XHRmbHVzaFBhcmVudCgpO1xuXHRcdFx0XHRcdHBhcmVudEJ1aWxkZXIgPSBuZXdUdXJuQnVpbGRlcihlLmlkLCBub3RpZmljYXRpb24ubWVzc2FnZVRleHQsIHsgb3JpZ2luOiBNZXNzYWdlS2luZC5TeXN0ZW1Ob3RpZmljYXRpb24sIHN0YXJ0ZWRBdDogY3VycmVudEV2ZW50VGltZXN0YW1wIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnc3ViYWdlbnQuc3RhcnRlZCc6IHtcblx0XHRcdFx0Y29uc3QgZCA9IGUuZGF0YTtcblx0XHRcdFx0c3ViYWdlbnRJbmZvQnlUb29sQ2FsbElkLnNldChkLnRvb2xDYWxsSWQsIHtcblx0XHRcdFx0XHRhZ2VudE5hbWU6IGQuYWdlbnROYW1lLFxuXHRcdFx0XHRcdGFnZW50RGlzcGxheU5hbWU6IGQuYWdlbnREaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRhZ2VudERlc2NyaXB0aW9uOiBkLmFnZW50RGVzY3JpcHRpb24sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0Jzoge1xuXHRcdFx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbElkID0gcmVzb2x2ZVBhcmVudFRvb2xDYWxsSWQoZS5hZ2VudElkLCBlLmRhdGEucGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRcdGlmICghcGFyZW50VG9vbENhbGxJZCAmJiBwYXJlbnRCdWlsZGVyKSB7XG5cdFx0XHRcdFx0cGFyZW50VHVyblN0YXRlID0gVHVyblN0YXRlLkNhbmNlbGxlZDtcblx0XHRcdFx0XHR0b3VjaChwYXJlbnRCdWlsZGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJzoge1xuXHRcdFx0XHRjb25zdCBkID0gZS5kYXRhO1xuXHRcdFx0XHRjb25zdCBpbmZvID0gdG9vbEluZm9CeUNhbGxJZC5nZXQoZC50b29sQ2FsbElkKTtcblx0XHRcdFx0aWYgKCFpbmZvKSB7XG5cdFx0XHRcdFx0Ly8gT3JwaGFuIGNvbXBsZXRlIChubyBtYXRjaGluZyBzdGFydCksIG9yIGhpZGRlbiB0b29sLlxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRvb2xJbmZvQnlDYWxsSWQuZGVsZXRlKGQudG9vbENhbGxJZCk7XG5cdFx0XHRcdGNvbnN0IHBhcmVudFRvb2xDYWxsSWQgPSByZXNvbHZlUGFyZW50VG9vbENhbGxJZChlLmFnZW50SWQsIGQucGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRcdGlmIChpc1Rhc2tDb21wbGV0ZVRvb2woaW5mby50b29sTmFtZSkpIHtcblx0XHRcdFx0XHRjb25zdCBidWlsZGVyID0gdGFyZ2V0QnVpbGRlckZvcihwYXJlbnRUb29sQ2FsbElkKTtcblx0XHRcdFx0XHRpZiAoIWJ1aWxkZXIpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBzdW1tYXJ5ID0gZ2V0VGFza0NvbXBsZXRlTWFya2Rvd24oaW5mby5wYXJhbWV0ZXJzLCBkLmVycm9yPy5tZXNzYWdlID8/IGQucmVzdWx0Py5jb250ZW50KTtcblx0XHRcdFx0XHRpZiAoc3VtbWFyeSkge1xuXHRcdFx0XHRcdFx0YnVpbGRlci5yZXNwb25zZVBhcnRzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLFxuXHRcdFx0XHRcdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRcdFx0XHRcdGNvbnRlbnQ6IHN1bW1hcnksXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFwYXJlbnRUb29sQ2FsbElkICYmIGQuc3VjY2VzcyAmJiBidWlsZGVyID09PSBwYXJlbnRCdWlsZGVyICYmICFwYXJlbnRUdXJuQWJvcnRlZCkge1xuXHRcdFx0XHRcdFx0cGFyZW50VHVyblN0YXRlID0gVHVyblN0YXRlLkNvbXBsZXRlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBidWlsZGVyID0gdGFyZ2V0QnVpbGRlckZvcihwYXJlbnRUb29sQ2FsbElkKTtcblx0XHRcdFx0aWYgKCFidWlsZGVyKSB7XG5cdFx0XHRcdFx0Ly8gTm8gYWN0aXZlIHR1cm4gdG8gYXR0YWNoIHRoaXMgY29tcGxldGlvbiB0by5cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZWRQYXJ0ID0gbWFrZUNvbXBsZXRlZFRvb2xDYWxsUGFydChkLCBpbmZvLCBzZXNzaW9uVXJpU3RyLCBwcm92aWRlcklkLCByYXdTZXNzaW9uSWQsIHN0b3JlZEVkaXRzLCBzdWJhZ2VudEluZm9CeVRvb2xDYWxsSWQuZ2V0KGQudG9vbENhbGxJZCksIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0XHRidWlsZGVyLnJlc3BvbnNlUGFydHMucHVzaChjb21wbGV0ZWRQYXJ0KTtcblx0XHRcdFx0Ly8gV2hlbiBhIHBhcmVudCB0b29sIGNhbGwgdGhhdCBzcGF3bmVkIGEgc3ViYWdlbnQgY29tcGxldGVzLFxuXHRcdFx0XHQvLyBmbHVzaCB0aGUgc3ViYWdlbnQncyBhY2N1bXVsYXRlZCB0dXJuLlxuXHRcdFx0XHRpZiAoIXBhcmVudFRvb2xDYWxsSWQgJiYgc3ViYWdlbnRJbmZvQnlUb29sQ2FsbElkLmhhcyhkLnRvb2xDYWxsSWQpKSB7XG5cdFx0XHRcdFx0Zmx1c2hTdWJhZ2VudChkLnRvb2xDYWxsSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnc2tpbGwuaW52b2tlZCc6IHtcblx0XHRcdFx0Y29uc3Qgc3ludGggPSBzeW50aGVzaXplU2tpbGxUb29sQ2FsbChlLmRhdGEsIGUuaWQpO1xuXHRcdFx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbElkID0gcmVzb2x2ZVBhcmVudFRvb2xDYWxsSWQoZS5hZ2VudElkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRjb25zdCBidWlsZGVyID0gdGFyZ2V0QnVpbGRlckZvcihwYXJlbnRUb29sQ2FsbElkKVxuXHRcdFx0XHRcdD8/IChwYXJlbnRCdWlsZGVyID0gbmV3VHVybkJ1aWxkZXIoZ2VuZXJhdGVVdWlkKCksICcnLCB7IHN0YXJ0ZWRBdDogY3VycmVudEV2ZW50VGltZXN0YW1wIH0pKTtcblx0XHRcdFx0aWYgKCFwYXJlbnRUb29sQ2FsbElkICYmIGJ1aWxkZXIgPT09IHBhcmVudEJ1aWxkZXIpIHtcblx0XHRcdFx0XHRwYXJlbnRUdXJuU3RhdGUgPSBUdXJuU3RhdGUuQ2FuY2VsbGVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJ1aWxkZXIucmVzcG9uc2VQYXJ0cy5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLFxuXHRcdFx0XHRcdHRvb2xDYWxsOiB7XG5cdFx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6IHN5bnRoLnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0XHR0b29sTmFtZTogc3ludGgudG9vbE5hbWUsXG5cdFx0XHRcdFx0XHRkaXNwbGF5TmFtZTogc3ludGguZGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogc3ludGguaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogc3ludGgucGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIFRvb2xDYWxsQ29tcGxldGVkU3RhdGUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2Fib3J0Jzoge1xuXHRcdFx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbElkID0gcmVzb2x2ZVBhcmVudFRvb2xDYWxsSWQoZS5hZ2VudElkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRpZiAocGFyZW50VG9vbENhbGxJZCkge1xuXHRcdFx0XHRcdHN1YmFnZW50VHVyblN0YXRlcy5zZXQocGFyZW50VG9vbENhbGxJZCwgVHVyblN0YXRlLkNhbmNlbGxlZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cm9vdEFzc2lzdGFudFR1cm5BY3RpdmUgPSBmYWxzZTtcblx0XHRcdFx0XHRpZiAocGFyZW50QnVpbGRlcikge1xuXHRcdFx0XHRcdFx0cGFyZW50VHVyblN0YXRlID0gVHVyblN0YXRlLkNhbmNlbGxlZDtcblx0XHRcdFx0XHRcdHBhcmVudFR1cm5BYm9ydGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHRvdWNoKHBhcmVudEJ1aWxkZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdGZsdXNoUGFyZW50KCk7XG5cdGZvciAoY29uc3QgcGFyZW50VG9vbENhbGxJZCBvZiBbLi4uc3ViYWdlbnRCdWlsZGVycy5rZXlzKCldKSB7XG5cdFx0Zmx1c2hTdWJhZ2VudChwYXJlbnRUb29sQ2FsbElkKTtcblx0fVxuXG5cdHJldHVybiB7IHR1cm5zLCBzdWJhZ2VudFR1cm5zQnlUb29sQ2FsbElkOiBzdWJhZ2VudFR1cm5zIH07XG5cblx0ZnVuY3Rpb24gYXBwZW5kRmFsbGJhY2tUb29sUmVxdWVzdHMoYnVpbGRlcjogSVR1cm5CdWlsZGVyLCB0b29sUmVxdWVzdHM6IHJlYWRvbmx5IEFzc2lzdGFudE1lc3NhZ2VUb29sUmVxdWVzdFtdLCBwYXJlbnRUb29sQ2FsbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHJlcXVlc3Qgb2YgdG9vbFJlcXVlc3RzKSB7XG5cdFx0XHRjb25zdCBjb21wbGV0aW9uID0gY29tcGxldGlvbnNCeUNhbGxJZC5nZXQocmVxdWVzdC50b29sQ2FsbElkKTtcblx0XHRcdGlmIChjb21wbGV0aW9uICYmIHRvb2xJbmZvQnlDYWxsSWQuaGFzKHJlcXVlc3QudG9vbENhbGxJZCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbmZvID0gdG9vbEluZm9CeUNhbGxJZC5nZXQocmVxdWVzdC50b29sQ2FsbElkKVxuXHRcdFx0XHQ/PyBtYWtlVG9vbFN0YXJ0SW5mbyhyZXF1ZXN0Lm5hbWUsIHJlcXVlc3QuYXJndW1lbnRzLCBwYXJlbnRUb29sQ2FsbElkLCB3b3JraW5nRGlyZWN0b3J5LCByZXF1ZXN0KTtcblx0XHRcdGlmICghaW5mbykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChpc1Rhc2tDb21wbGV0ZVRvb2woaW5mby50b29sTmFtZSkpIHtcblx0XHRcdFx0Y29uc3Qgc3VtbWFyeSA9IGdldFRhc2tDb21wbGV0ZU1hcmtkb3duKGluZm8ucGFyYW1ldGVycywgY29tcGxldGlvbj8uZXJyb3I/Lm1lc3NhZ2UgPz8gY29tcGxldGlvbj8ucmVzdWx0Py5jb250ZW50KTtcblx0XHRcdFx0aWYgKHN1bW1hcnkpIHtcblx0XHRcdFx0XHRidWlsZGVyLnJlc3BvbnNlUGFydHMucHVzaCh7XG5cdFx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLFxuXHRcdFx0XHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRcdFx0Y29udGVudDogc3VtbWFyeSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXBhcmVudFRvb2xDYWxsSWQgJiYgY29tcGxldGlvbj8uc3VjY2VzcyAmJiBidWlsZGVyID09PSBwYXJlbnRCdWlsZGVyICYmICFwYXJlbnRUdXJuQWJvcnRlZCkge1xuXHRcdFx0XHRcdHBhcmVudFR1cm5TdGF0ZSA9IFR1cm5TdGF0ZS5Db21wbGV0ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGJ1aWxkZXIucmVzcG9uc2VQYXJ0cy5wdXNoKG1ha2VDb21wbGV0ZWRUb29sQ2FsbFBhcnQoXG5cdFx0XHRcdGNvbXBsZXRpb24gPz8geyB0b29sQ2FsbElkOiByZXF1ZXN0LnRvb2xDYWxsSWQsIHN1Y2Nlc3M6IHRydWUgfSxcblx0XHRcdFx0aW5mbyxcblx0XHRcdFx0c2Vzc2lvblVyaVN0cixcblx0XHRcdFx0cHJvdmlkZXJJZCxcblx0XHRcdFx0cmF3U2Vzc2lvbklkLFxuXHRcdFx0XHRzdG9yZWRFZGl0cyxcblx0XHRcdFx0c3ViYWdlbnRJbmZvQnlUb29sQ2FsbElkLmdldChyZXF1ZXN0LnRvb2xDYWxsSWQpLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0KSk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogVHJhbnNsYXRlcyB0aGUgU0RLJ3MgYFVzZXJNZXNzYWdlQXR0YWNobWVudFtdYCBwYXlsb2FkIGJhY2sgaW50byB0aGVcbiAqIGFnZW50LXByb3RvY29sIHtAbGluayBNZXNzYWdlQXR0YWNobWVudH0gc2hhcGUuIFRleHQgYmxvYiBhdHRhY2htZW50c1xuICogc3VyZmFjZSBhcyB7QGxpbmsgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZX07IG90aGVyIGJsb2JzIHN1cmZhY2UgYXNcbiAqIGlubGluZSB7QGxpbmsgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkVtYmVkZGVkUmVzb3VyY2V9IHBheWxvYWRzLlxuICogRmlsZS9kaXJlY3Rvcnkvc2VsZWN0aW9uIHZhcmlhbnRzIHJlY29uc3RydWN0IGxvY2FsIGBSZXNvdXJjZWBcbiAqIGF0dGFjaG1lbnRzLiBXZSBkb24ndCB0cnkgdG8gcmUtbGluayB0aGVzZSB0byB0aGUgb24tZGlzayBzbmFwc2hvdHNcbiAqIHByb2R1Y2VkIGJ5IHRoZSBhZ2VudCBob3N0J3MgYXR0YWNobWVudCByZXdyaXRlciBcdTIwMTQgdGhlIFNESyBrZWVwcyBhXG4gKiBjb3B5IG9mIHRoZSBieXRlcyAvIHBhdGhzIGl0IGFjdHVhbGx5IHNhdyBvbiBzZW5kLCB3aGljaCBpcyB0aGVcbiAqIGF1dGhvcml0YXRpdmUgcmVjb3JkIGZvciByZXBsYXkuXG4gKi9cbmZ1bmN0aW9uIHNka0F0dGFjaG1lbnRzVG9Qcm90b2NvbChcblx0YXR0YWNobWVudHM6IHJlYWRvbmx5IEF0dGFjaG1lbnRbXSB8IHVuZGVmaW5lZCxcbik6IE1lc3NhZ2VBdHRhY2htZW50W10gfCB1bmRlZmluZWQge1xuXHRpZiAoIWF0dGFjaG1lbnRzPy5sZW5ndGgpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IG91dDogTWVzc2FnZUF0dGFjaG1lbnRbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGEgb2YgYXR0YWNobWVudHMpIHtcblx0XHRjb25zdCBjb252ZXJ0ZWQgPSBzZGtBdHRhY2htZW50VG9Qcm90b2NvbChhKTtcblx0XHRpZiAoY29udmVydGVkKSB7XG5cdFx0XHRvdXQucHVzaChjb252ZXJ0ZWQpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gb3V0Lmxlbmd0aCA+IDAgPyBvdXQgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHNka0F0dGFjaG1lbnRUb1Byb3RvY29sKFxuXHRhdHRhY2htZW50OiBBdHRhY2htZW50LFxuKTogTWVzc2FnZUF0dGFjaG1lbnQgfCB1bmRlZmluZWQge1xuXHRzd2l0Y2ggKGF0dGFjaG1lbnQudHlwZSkge1xuXHRcdGNhc2UgJ2ZpbGUnOiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsXG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoYXR0YWNobWVudC5wYXRoKS50b1N0cmluZygpLFxuXHRcdFx0XHRsYWJlbDogYXR0YWNobWVudC5kaXNwbGF5TmFtZSB8fCBiYXNlbmFtZShhdHRhY2htZW50LnBhdGgpLFxuXHRcdFx0XHRkaXNwbGF5S2luZDogZ2V0TWVkaWFNaW1lKGF0dGFjaG1lbnQucGF0aCk/LnN0YXJ0c1dpdGgoJ2ltYWdlLycpID8gJ2ltYWdlJyA6ICdkb2N1bWVudCcsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjYXNlICdkaXJlY3RvcnknOiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsXG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoYXR0YWNobWVudC5wYXRoKS50b1N0cmluZygpLFxuXHRcdFx0XHRsYWJlbDogYXR0YWNobWVudC5kaXNwbGF5TmFtZSB8fCBiYXNlbmFtZShhdHRhY2htZW50LnBhdGgpLFxuXHRcdFx0XHRkaXNwbGF5S2luZDogJ2RpcmVjdG9yeScsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjYXNlICdzZWxlY3Rpb24nOiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsXG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoYXR0YWNobWVudC5maWxlUGF0aCkudG9TdHJpbmcoKSxcblx0XHRcdFx0bGFiZWw6IGF0dGFjaG1lbnQuZGlzcGxheU5hbWUsXG5cdFx0XHRcdGRpc3BsYXlLaW5kOiAnc2VsZWN0aW9uJyxcblx0XHRcdFx0c2VsZWN0aW9uOiB7IHJhbmdlOiBhdHRhY2htZW50LnNlbGVjdGlvbiEgfSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNhc2UgJ2Jsb2InOiB7XG5cdFx0XHRpZiAodHlwZW9mIGF0dGFjaG1lbnQuZGF0YSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNpbXBsZURpc3BsYXlLaW5kID0gcmVhZFNpbXBsZUF0dGFjaG1lbnREaXNwbGF5S2luZEZyb21NaW1lVHlwZShhdHRhY2htZW50Lm1pbWVUeXBlKTtcblx0XHRcdGlmIChhdHRhY2htZW50Lm1pbWVUeXBlLnN0YXJ0c1dpdGgoJ3RleHQvcGxhaW4nKSB8fCBzaW1wbGVEaXNwbGF5S2luZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdFx0XHRsYWJlbDogYXR0YWNobWVudC5kaXNwbGF5TmFtZSA/PyAnYXR0YWNobWVudCcsXG5cdFx0XHRcdFx0bW9kZWxSZXByZXNlbnRhdGlvbjogZGVjb2RlQmFzZTY0KGF0dGFjaG1lbnQuZGF0YSA/PyAnJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHQuLi4oc2ltcGxlRGlzcGxheUtpbmQgIT09IHVuZGVmaW5lZCA/IHsgZGlzcGxheUtpbmQ6IHNpbXBsZURpc3BsYXlLaW5kIH0gOiB7fSksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkaXNwbGF5S2luZCA9IGF0dGFjaG1lbnQubWltZVR5cGUuc3RhcnRzV2l0aCgnaW1hZ2UvJykgPyAnaW1hZ2UnIDogdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkVtYmVkZGVkUmVzb3VyY2UsXG5cdFx0XHRcdGxhYmVsOiBhdHRhY2htZW50LmRpc3BsYXlOYW1lID8/ICdhdHRhY2htZW50Jyxcblx0XHRcdFx0ZGF0YTogYXR0YWNobWVudC5kYXRhID8/ICcnLFxuXHRcdFx0XHRjb250ZW50VHlwZTogYXR0YWNobWVudC5taW1lVHlwZSxcblx0XHRcdFx0ZGlzcGxheUtpbmQsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIEJ1aWxkcyBhIHtAbGluayBUb29sQ2FsbENvbXBsZXRlZFN0YXRlfS1zaGFwZWQgcmVzcG9uc2UgcGFydCBmcm9tIGFuXG4gKiBTREsgYHRvb2wuZXhlY3V0aW9uX2NvbXBsZXRlYCBldmVudC4gUmVzdG9yZXMgZmlsZS1lZGl0IGNvbnRlbnRcbiAqIHJlZmVyZW5jZXMgZnJvbSBgc3RvcmVkRWRpdHNgIGFuZCBtZXJnZXMgc3ViYWdlbnQgbWV0YWRhdGEgd2hlbiB0aGVcbiAqIHRvb2wgY2FsbCBzcGF3bmVkIGEgY2hpbGQgc2Vzc2lvbi5cbiAqL1xuZnVuY3Rpb24gbWFrZUNvbXBsZXRlZFRvb2xDYWxsUGFydChcblx0ZDogVG9vbEV4ZWN1dGlvbkNvbXBsZXRlRGF0YSxcblx0aW5mbzogSVRvb2xTdGFydEluZm8sXG5cdHNlc3Npb25VcmlTdHI6IHN0cmluZyxcblx0cHJvdmlkZXJJZDogc3RyaW5nLFxuXHRyYXdTZXNzaW9uSWQ6IHN0cmluZyxcblx0c3RvcmVkRWRpdHM6IE1hcDxzdHJpbmcsIElGaWxlRWRpdFJlY29yZFtdPiB8IHVuZGVmaW5lZCxcblx0c3ViYWdlbnQ6IElTdWJhZ2VudEluZm8gfCB1bmRlZmluZWQsXG5cdHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCxcbik6IFJlc3BvbnNlUGFydCB7XG5cdGNvbnN0IHRvb2xPdXRwdXQgPSBkLmVycm9yPy5tZXNzYWdlID8/IGQucmVzdWx0Py5jb250ZW50O1xuXHRjb25zdCBjb250ZW50OiBUb29sUmVzdWx0Q29udGVudFtdID0gW107XG5cdGlmICh0b29sT3V0cHV0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRjb250ZW50LnB1c2goeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogdG9vbE91dHB1dCB9KTtcblx0fVxuXHRhcHBlbmRTZGtUb29sUmVzdWx0Q29udGVudChjb250ZW50LCBkLnJlc3VsdD8uY29udGVudHMsIHsgc2Vzc2lvbjogc2Vzc2lvblVyaVN0ciwgdG9vbENhbGxJZDogZC50b29sQ2FsbElkLCB0aXRsZTogaW5mby5kaXNwbGF5TmFtZSB9KTtcblxuXHQvLyBSZXN0b3JlIGZpbGUgZWRpdCBjb250ZW50IHJlZmVyZW5jZXMgZnJvbSB0aGUgZGF0YWJhc2UuXG5cdGNvbnN0IGVkaXRzID0gc3RvcmVkRWRpdHM/LmdldChkLnRvb2xDYWxsSWQpO1xuXHRpZiAoZWRpdHMpIHtcblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgZWRpdHMpIHtcblx0XHRcdGNvbnN0IGJlZm9yZVVyaSA9IGVkaXQua2luZCA9PT0gJ3JlbmFtZScgJiYgZWRpdC5vcmlnaW5hbFBhdGhcblx0XHRcdFx0PyBVUkkuZmlsZShlZGl0Lm9yaWdpbmFsUGF0aCkudG9TdHJpbmcoKVxuXHRcdFx0XHQ6IFVSSS5maWxlKGVkaXQuZmlsZVBhdGgpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBhZnRlclVyaSA9IFVSSS5maWxlKGVkaXQuZmlsZVBhdGgpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBoYXNCZWZvcmUgPSBlZGl0LmtpbmQgIT09ICdjcmVhdGUnO1xuXHRcdFx0Y29uc3QgaGFzQWZ0ZXIgPSBlZGl0LmtpbmQgIT09ICdkZWxldGUnO1xuXHRcdFx0Y29udGVudC5wdXNoKHtcblx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0LFxuXHRcdFx0XHRiZWZvcmU6IGhhc0JlZm9yZSA/IHtcblx0XHRcdFx0XHR1cmk6IGJlZm9yZVVyaSxcblx0XHRcdFx0XHRjb250ZW50OiB7IHVyaTogYnVpbGRTZXNzaW9uRGJVcmkoc2Vzc2lvblVyaVN0ciwgZWRpdC50b29sQ2FsbElkLCBlZGl0LmZpbGVQYXRoLCAnYmVmb3JlJykgfSxcblx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0YWZ0ZXI6IGhhc0FmdGVyID8ge1xuXHRcdFx0XHRcdHVyaTogYWZ0ZXJVcmksXG5cdFx0XHRcdFx0Y29udGVudDogeyB1cmk6IGJ1aWxkU2Vzc2lvbkRiVXJpKHNlc3Npb25VcmlTdHIsIGVkaXQudG9vbENhbGxJZCwgZWRpdC5maWxlUGF0aCwgJ2FmdGVyJykgfSxcblx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZGlmZjogKGVkaXQuYWRkZWRMaW5lcyAhPT0gdW5kZWZpbmVkIHx8IGVkaXQucmVtb3ZlZExpbmVzICE9PSB1bmRlZmluZWQpXG5cdFx0XHRcdFx0PyB7IGFkZGVkOiBlZGl0LmFkZGVkTGluZXMsIHJlbW92ZWQ6IGVkaXQucmVtb3ZlZExpbmVzIH1cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGlmIChzdWJhZ2VudCkge1xuXHRcdGNvbnRlbnQucHVzaCh7XG5cdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQsXG5cdFx0XHRyZXNvdXJjZTogYnVpbGRTdWJhZ2VudFNlc3Npb25Vcmkoc2Vzc2lvblVyaVN0ciwgZC50b29sQ2FsbElkKSxcblx0XHRcdHRpdGxlOiBzdWJhZ2VudC5hZ2VudERpc3BsYXlOYW1lLFxuXHRcdFx0YWdlbnROYW1lOiBzdWJhZ2VudC5hZ2VudE5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogc3ViYWdlbnQuYWdlbnREZXNjcmlwdGlvbixcblx0XHR9KTtcblx0fVxuXG5cdGNvbnN0IG1jcFNlcnZlck5hbWUgPSBpbmZvLm1jcFNlcnZlck5hbWUgPz8gcmVhZFN0cmluZ1Byb3BlcnR5KGQsICdtY3BTZXJ2ZXJOYW1lJyk7XG5cdGNvbnN0IG1jcFRvb2xOYW1lID0gaW5mby5tY3BUb29sTmFtZSA/PyByZWFkU3RyaW5nUHJvcGVydHkoZCwgJ21jcFRvb2xOYW1lJyk7XG5cdGNvbnN0IG1jcFVpUmVzb3VyY2VVcmkgPSBpbmZvLm1jcFVpUmVzb3VyY2VVcmkgPz8gcmVhZE1jcFVpUmVzb3VyY2VVcmkoZCk7XG5cdGNvbnN0IG1jcFVpOiBJVG9vbENhbGxVaU1ldGEgfCB1bmRlZmluZWQgPSBtY3BVaVJlc291cmNlVXJpXG5cdFx0PyB7XG5cdFx0XHRyZXNvdXJjZVVyaTogbWNwVWlSZXNvdXJjZVVyaSxcblx0XHRcdC4uLihtY3BTZXJ2ZXJOYW1lID8geyBjaGFubmVsOiBidWlsZE1jcENoYW5uZWwocHJvdmlkZXJJZCwgcmF3U2Vzc2lvbklkLCBtY3BTZXJ2ZXJOYW1lKSB9IDoge30pLFxuXHRcdH1cblx0XHQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdCB0YzogVG9vbENhbGxDb21wbGV0ZWRTdGF0ZSA9IHtcblx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHR0b29sQ2FsbElkOiBkLnRvb2xDYWxsSWQsXG5cdFx0dG9vbE5hbWU6IGluZm8udG9vbE5hbWUsXG5cdFx0ZGlzcGxheU5hbWU6IGluZm8uZGlzcGxheU5hbWUsXG5cdFx0aW50ZW50aW9uOiBpbmZvLmludGVudGlvbixcblx0XHQuLi4obWNwU2VydmVyTmFtZSA/IHsgY29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQLCBjdXN0b21pemF0aW9uSWQ6IGJ1aWxkTWNwVG9wTGV2ZWxDdXN0b21pemF0aW9uSWQocHJvdmlkZXJJZCwgcmF3U2Vzc2lvbklkLCBtY3BTZXJ2ZXJOYW1lKSB9IH0gOiB7fSksXG5cdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGluZm8uaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0dG9vbElucHV0OiBpbmZvLnRvb2xJbnB1dCxcblx0XHRzdWNjZXNzOiBkLnN1Y2Nlc3MsXG5cdFx0cGFzdFRlbnNlTWVzc2FnZTogZ2V0UGFzdFRlbnNlTWVzc2FnZShpbmZvLnRvb2xOYW1lLCBpbmZvLmRpc3BsYXlOYW1lLCBpbmZvLnBhcmFtZXRlcnMsIGQuc3VjY2VzcywgZC5zdWNjZXNzID8gdG9vbE91dHB1dCA6IHVuZGVmaW5lZCwgcGF0aCA9PiByZXNvbHZlVG9vbERpc3BsYXlQYXRoKHBhdGgsIHdvcmtpbmdEaXJlY3RvcnkpKSxcblx0XHRjb250ZW50OiBjb250ZW50Lmxlbmd0aCA+IDAgPyBjb250ZW50IDogdW5kZWZpbmVkLFxuXHRcdGVycm9yOiBkLmVycm9yLFxuXHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdF9tZXRhOiB0b1Rvb2xDYWxsTWV0YSh7XG5cdFx0XHR0b29sS2luZDogaW5mby50b29sS2luZCxcblx0XHRcdGxhbmd1YWdlOiBpbmZvLmxhbmd1YWdlLFxuXHRcdFx0c3ViYWdlbnREZXNjcmlwdGlvbjogaW5mby5zdWJhZ2VudERlc2NyaXB0aW9uLFxuXHRcdFx0c3ViYWdlbnRBZ2VudE5hbWU6IGluZm8uc3ViYWdlbnRBZ2VudE5hbWUsXG5cdFx0XHRtY3BTZXJ2ZXJOYW1lLFxuXHRcdFx0bWNwVG9vbE5hbWUsXG5cdFx0XHR1aTogbWNwVWksXG5cdFx0fSksXG5cdH07XG5cdHJldHVybiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsOiB0YyB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsVUFBVSxZQUFZLFlBQVk7QUFDM0MsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsc0JBQTRDO0FBRXJELFNBQVMsNkJBQXFEO0FBQzlELFNBQVMsYUFBYSxrQkFBa0IsNEJBQTRCLHlCQUF5QixnQkFBZ0IsdUJBQXVCLFdB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
