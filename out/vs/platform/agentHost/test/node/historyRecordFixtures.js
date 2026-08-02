import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { isString } from "../../../../base/common/types.js";
import { stripRedundantCdPrefix } from "../../common/commandLineHelpers.js";
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, buildSubagentSessionUri } from "../../common/state/sessionState.js";
import { getInvocationMessage, getPastTenseMessage, getShellLanguage, getSubagentMetadata, getToolDisplayName, getToolInputString, getToolKind, isEditTool, isHiddenTool, synthesizeSkillToolCall } from "../../node/copilot/copilotToolDisplay.js";
import { buildSessionDbUri } from "../../common/sessionDbUri.js";
function extractSubagentMeta(start) {
  if (!start) {
    return {};
  }
  return {
    subagentDescription: start.subagentDescription,
    subagentAgentName: start.subagentAgentName
  };
}
function buildTurnsFromHistory(messages) {
  const turns = [];
  const subagentsByToolCallId = /* @__PURE__ */ new Map();
  let currentTurn;
  const finalizeTurn = (turn, state) => {
    turns.push({
      id: turn.id,
      message: turn.message,
      responseParts: turn.responseParts,
      usage: void 0,
      state
    });
  };
  const startTurn = (id, text) => ({
    id,
    message: { text, origin: { kind: MessageKind.User } },
    responseParts: [],
    pendingTools: /* @__PURE__ */ new Map()
  });
  for (const msg of messages) {
    if (msg.type === "message" && msg.role === "user") {
      if (currentTurn) {
        finalizeTurn(currentTurn, TurnState.Cancelled);
      }
      currentTurn = startTurn(msg.messageId, msg.content);
    } else if (msg.type === "message" && msg.role === "assistant") {
      if (msg.parentToolCallId) {
        continue;
      }
      if (!currentTurn) {
        currentTurn = startTurn(msg.messageId, "");
      }
      if (msg.reasoningText) {
        currentTurn.responseParts.push({
          kind: ResponsePartKind.Reasoning,
          id: generateUuid(),
          content: msg.reasoningText
        });
      }
      if (msg.content) {
        currentTurn.responseParts.push({
          kind: ResponsePartKind.Markdown,
          id: generateUuid(),
          content: msg.content
        });
      }
      if (!msg.toolRequests || msg.toolRequests.length === 0) {
        finalizeTurn(currentTurn, TurnState.Complete);
        currentTurn = void 0;
      }
    } else if (msg.type === "subagent_started") {
      subagentsByToolCallId.set(msg.toolCallId, msg);
    } else if (msg.type === "tool_start") {
      if (msg.parentToolCallId) {
        continue;
      }
      currentTurn?.pendingTools.set(msg.toolCallId, msg);
    } else if (msg.type === "tool_complete") {
      if (msg.parentToolCallId) {
        continue;
      }
      if (currentTurn) {
        const start = currentTurn.pendingTools.get(msg.toolCallId);
        currentTurn.pendingTools.delete(msg.toolCallId);
        const subagentEvent = subagentsByToolCallId.get(msg.toolCallId);
        const contentWithSubagent = msg.result.content ? [...msg.result.content] : [];
        if (subagentEvent) {
          const parentSessionStr = msg.session.toString();
          contentWithSubagent.push({
            type: ToolResultContentType.Subagent,
            resource: buildSubagentSessionUri(parentSessionStr, msg.toolCallId),
            title: subagentEvent.agentDisplayName,
            agentName: subagentEvent.agentName,
            description: subagentEvent.agentDescription
          });
        }
        const tc = {
          status: ToolCallStatus.Completed,
          toolCallId: msg.toolCallId,
          toolName: start?.toolName ?? "unknown",
          displayName: start?.displayName ?? "Unknown Tool",
          invocationMessage: start?.invocationMessage ?? "Unknown tool",
          toolInput: start?.toolInput,
          success: msg.result.success,
          pastTenseMessage: msg.result.pastTenseMessage,
          content: contentWithSubagent.length > 0 ? contentWithSubagent : void 0,
          error: msg.result.error,
          confirmed: ToolCallConfirmationReason.NotNeeded,
          _meta: {
            toolKind: start?.toolKind,
            language: start?.language,
            ...extractSubagentMeta(start)
          }
        };
        currentTurn.responseParts.push({
          kind: ResponsePartKind.ToolCall,
          toolCall: tc
        });
      }
    }
  }
  if (currentTurn) {
    finalizeTurn(currentTurn, TurnState.Cancelled);
  }
  return turns;
}
function buildSubagentTurnsFromHistory(parentMessages, parentToolCallId, childSessionUri) {
  const innerToolCallIds = /* @__PURE__ */ new Set();
  for (const msg of parentMessages) {
    if ((msg.type === "tool_start" || msg.type === "tool_complete") && msg.parentToolCallId === parentToolCallId) {
      innerToolCallIds.add(msg.toolCallId);
    }
  }
  const subagentsByToolCallId = /* @__PURE__ */ new Map();
  for (const msg of parentMessages) {
    if (msg.type === "subagent_started" && innerToolCallIds.has(msg.toolCallId)) {
      subagentsByToolCallId.set(msg.toolCallId, msg);
    }
  }
  const innerMessages = parentMessages.filter((msg) => {
    if (msg.type === "tool_start" || msg.type === "tool_complete") {
      return msg.parentToolCallId === parentToolCallId;
    }
    if (msg.type === "message") {
      return msg.parentToolCallId === parentToolCallId;
    }
    return false;
  });
  if (innerMessages.length === 0) {
    return [];
  }
  const responseParts = [];
  const pendingTools = /* @__PURE__ */ new Map();
  for (const msg of innerMessages) {
    if (msg.type === "tool_start") {
      pendingTools.set(msg.toolCallId, msg);
    } else if (msg.type === "tool_complete") {
      const start = pendingTools.get(msg.toolCallId);
      pendingTools.delete(msg.toolCallId);
      const subagentEvent = subagentsByToolCallId.get(msg.toolCallId);
      const contentWithSubagent = msg.result.content ? [...msg.result.content] : [];
      if (subagentEvent) {
        contentWithSubagent.push({
          type: ToolResultContentType.Subagent,
          resource: buildSubagentSessionUri(childSessionUri, msg.toolCallId),
          title: subagentEvent.agentDisplayName,
          agentName: subagentEvent.agentName,
          description: subagentEvent.agentDescription
        });
      }
      const tc = {
        status: ToolCallStatus.Completed,
        toolCallId: msg.toolCallId,
        toolName: start?.toolName ?? "unknown",
        displayName: start?.displayName ?? "Unknown Tool",
        invocationMessage: start?.invocationMessage ?? "Unknown tool",
        toolInput: start?.toolInput,
        success: msg.result.success,
        pastTenseMessage: msg.result.pastTenseMessage,
        content: contentWithSubagent.length > 0 ? contentWithSubagent : void 0,
        error: msg.result.error,
        confirmed: ToolCallConfirmationReason.NotNeeded,
        _meta: {
          toolKind: start?.toolKind,
          language: start?.language,
          ...extractSubagentMeta(start)
        }
      };
      responseParts.push({
        kind: ResponsePartKind.ToolCall,
        toolCall: tc
      });
    } else if (msg.type === "message" && msg.role === "assistant") {
      if (msg.reasoningText) {
        responseParts.push({
          kind: ResponsePartKind.Reasoning,
          id: generateUuid(),
          content: msg.reasoningText
        });
      }
      if (msg.content) {
        responseParts.push({
          kind: ResponsePartKind.Markdown,
          id: generateUuid(),
          content: msg.content
        });
      }
    }
  }
  if (responseParts.length === 0) {
    return [];
  }
  return [{
    id: generateUuid(),
    message: { text: "", origin: { kind: MessageKind.User } },
    responseParts,
    usage: void 0,
    state: TurnState.Complete
  }];
}
function tryStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return void 0;
  }
}
function isSyntheticUserMessage(event) {
  if (event.type !== "user.message") {
    return false;
  }
  const source = event.data?.source;
  return !!source && source.toLowerCase() !== "user";
}
async function mapSessionEventsToHistoryRecords(session, db, events, workingDirectory) {
  const result = [];
  const toolInfoByCallId = /* @__PURE__ */ new Map();
  const editToolCallIds = [];
  const parentToolCallIdByAgentId = /* @__PURE__ */ new Map();
  const resolveParentToolCallId = (agentId, deprecatedParentToolCallId) => {
    const mapped = agentId ? parentToolCallIdByAgentId.get(agentId) : void 0;
    return mapped ?? deprecatedParentToolCallId;
  };
  for (const e of events) {
    if (e.type === "subagent.started") {
      const sub = e;
      if (sub.agentId) {
        parentToolCallIdByAgentId.set(sub.agentId, sub.data.toolCallId);
      }
    }
    if (e.type === "tool.execution_start") {
      const d = e.data;
      if (isHiddenTool(d.toolName)) {
        continue;
      }
      const toolArgs = d.arguments !== void 0 ? tryStringify(d.arguments) : void 0;
      let parameters;
      if (toolArgs) {
        try {
          parameters = JSON.parse(toolArgs);
        } catch {
        }
      }
      const rewrittenArgs = stripRedundantCdPrefix(d.toolName, parameters, workingDirectory) ? tryStringify(parameters) : void 0;
      toolInfoByCallId.set(d.toolCallId, { toolName: d.toolName, parameters, rewrittenArgs });
      const command = isString(parameters?.command) ? parameters.command : void 0;
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
  for (const e of events) {
    if (e.type === "assistant.message" || e.type === "user.message") {
      if (isSyntheticUserMessage(e)) {
        continue;
      }
      const d = e.data;
      result.push({
        session,
        type: "message",
        role: e.type === "user.message" ? "user" : "assistant",
        messageId: d?.messageId ?? d?.interactionId ?? "",
        content: d?.content ?? "",
        toolRequests: d?.toolRequests?.map((tr) => ({
          toolCallId: tr.toolCallId,
          name: tr.name,
          arguments: tr.arguments !== void 0 ? tryStringify(tr.arguments) : void 0,
          type: tr.type
        })),
        reasoningOpaque: d?.reasoningOpaque,
        reasoningText: d?.reasoningText,
        encryptedContent: d?.encryptedContent,
        parentToolCallId: resolveParentToolCallId(e.agentId, d?.parentToolCallId)
      });
    } else if (e.type === "tool.execution_start") {
      const d = e.data;
      if (isHiddenTool(d.toolName)) {
        continue;
      }
      const info = toolInfoByCallId.get(d.toolCallId);
      const displayName = getToolDisplayName(d.toolName);
      const toolKind = getToolKind(d.toolName);
      const toolArgs = info?.rewrittenArgs ?? (d.arguments !== void 0 ? tryStringify(d.arguments) : void 0);
      const subagentMeta = toolKind === "subagent" ? getSubagentMetadata(info?.parameters) : void 0;
      result.push({
        session,
        type: "tool_start",
        toolCallId: d.toolCallId,
        toolName: d.toolName,
        displayName,
        invocationMessage: getInvocationMessage(d.toolName, displayName, info?.parameters),
        toolInput: getToolInputString(d.toolName, info?.parameters, toolArgs),
        toolKind,
        language: toolKind === "terminal" ? getShellLanguage(d.toolName) : void 0,
        subagentAgentName: subagentMeta?.agentName,
        subagentDescription: subagentMeta?.description,
        mcpServerName: d.mcpServerName,
        mcpToolName: d.mcpToolName,
        parentToolCallId: resolveParentToolCallId(e.agentId, d.parentToolCallId)
      });
    } else if (e.type === "tool.execution_complete") {
      const d = e.data;
      const info = toolInfoByCallId.get(d.toolCallId);
      if (!info) {
        continue;
      }
      toolInfoByCallId.delete(d.toolCallId);
      const displayName = getToolDisplayName(info.toolName);
      const toolOutput = d.error?.message ?? d.result?.content;
      const content = [];
      if (toolOutput !== void 0) {
        content.push({ type: ToolResultContentType.Text, text: toolOutput });
      }
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
      result.push({
        session,
        type: "tool_complete",
        toolCallId: d.toolCallId,
        result: {
          success: d.success,
          pastTenseMessage: getPastTenseMessage(info.toolName, displayName, info.parameters, d.success),
          content: content.length > 0 ? content : void 0,
          error: d.error
        },
        isUserRequested: d.isUserRequested,
        toolTelemetry: d.toolTelemetry !== void 0 ? tryStringify(d.toolTelemetry) : void 0,
        parentToolCallId: resolveParentToolCallId(e.agentId, d.parentToolCallId)
      });
    } else if (e.type === "subagent.started") {
      const d = e.data;
      result.push({
        session,
        type: "subagent_started",
        toolCallId: d.toolCallId,
        agentName: d.agentName,
        agentDisplayName: d.agentDisplayName,
        agentDescription: d.agentDescription
      });
    } else if (e.type === "skill.invoked") {
      const skillEvent = e;
      const synth = synthesizeSkillToolCall(skillEvent.data, skillEvent.id);
      result.push(
        { session, type: "tool_start", toolCallId: synth.toolCallId, toolName: synth.toolName, displayName: synth.displayName, invocationMessage: synth.invocationMessage },
        { session, type: "tool_complete", toolCallId: synth.toolCallId, result: { success: true, pastTenseMessage: synth.pastTenseMessage } }
      );
    }
  }
  return result;
}
export {
  buildSubagentTurnsFromHistory,
  buildTurnsFromHistory,
  mapSessionEventsToHistoryRecords
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvaGlzdG9yeVJlY29yZEZpeHR1cmVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBzdHJpcFJlZHVuZGFudENkUHJlZml4IH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbW1hbmRMaW5lSGVscGVycy5qcyc7XG5pbXBvcnQgeyBJRmlsZUVkaXRSZWNvcmQsIElTZXNzaW9uRGF0YWJhc2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VLaW5kLCBSZXNwb25zZVBhcnRLaW5kLCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgVG9vbENhbGxTdGF0dXMsIFRvb2xSZXN1bHRDb250ZW50VHlwZSwgVHVyblN0YXRlLCBidWlsZFN1YmFnZW50U2Vzc2lvblVyaSwgdHlwZSBNZXNzYWdlLCB0eXBlIFJlc3BvbnNlUGFydCwgdHlwZSBTdHJpbmdPck1hcmtkb3duLCB0eXBlIFRvb2xDYWxsQ29tcGxldGVkU3RhdGUsIHR5cGUgVG9vbFJlc3VsdENvbnRlbnQsIHR5cGUgVHVybiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgZ2V0SW52b2NhdGlvbk1lc3NhZ2UsIGdldFBhc3RUZW5zZU1lc3NhZ2UsIGdldFNoZWxsTGFuZ3VhZ2UsIGdldFN1YmFnZW50TWV0YWRhdGEsIGdldFRvb2xEaXNwbGF5TmFtZSwgZ2V0VG9vbElucHV0U3RyaW5nLCBnZXRUb29sS2luZCwgaXNFZGl0VG9vbCwgaXNIaWRkZW5Ub29sLCBzeW50aGVzaXplU2tpbGxUb29sQ2FsbCB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9jb3BpbG90VG9vbERpc3BsYXkuanMnO1xuaW1wb3J0IHsgYnVpbGRTZXNzaW9uRGJVcmkgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRiVXJpLmpzJztcbmltcG9ydCB0eXBlIHsgSVNlc3Npb25FdmVudCwgSVNlc3Npb25FdmVudE1lc3NhZ2UsIElTZXNzaW9uRXZlbnRTa2lsbEludm9rZWQsIElTZXNzaW9uRXZlbnRTdWJhZ2VudFN0YXJ0ZWQsIElTZXNzaW9uRXZlbnRUb29sQ29tcGxldGUsIElTZXNzaW9uRXZlbnRUb29sU3RhcnQgfSBmcm9tICcuL2NvcGlsb3RUZXN0RXZlbnRzLmpzJztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEhpc3RvcnktcmVjb3JkIHRlc3QgZml4dHVyZXNcbi8vXG4vLyBGbGF0LCBkZWNsYXJhdGl2ZSBEU0wgdXNlZCBieSBtb2NrIGFnZW50cyBhbmQgdW5pdCB0ZXN0cyB0byBidWlsZCBzZXNzaW9uXG4vLyBoaXN0b3J5IHdpdGhvdXQgbWFudWFsbHkgY29uc3RydWN0aW5nIGBUdXJuW11gLiBSZWNvcmRzIG1pcnJvciB0aGUgd2lyZVxuLy8gc2hhcGUgb2YgYW4gU0RLIGV2ZW50IHN0cmVhbSBcdTIwMTQgYG1lc3NhZ2VgLCBgdG9vbF9zdGFydGAsIGB0b29sX2NvbXBsZXRlYCxcbi8vIGBzdWJhZ2VudF9zdGFydGVkYCBcdTIwMTQgc28gdHJhbnNjcmlwdHMgcmVhZCBsaWtlIHRoZSBwcm90b2NvbCB0aGV5J3JlXG4vLyBlbXVsYXRpbmcuXG4vL1xuLy8gUHJvZHVjdGlvbiBjb2RlIGRvZXMgTk9UIGRlcGVuZCBvbiB0aGlzIG1vZHVsZS4gVGhlIHJlYWxcbi8vIFNESy1ldmVudHMtdG8tVHVybltdIHBpcGVsaW5lIGluIGBub2RlL2NvcGlsb3QvbWFwU2Vzc2lvbkV2ZW50cy50c2AgcnVuc1xuLy8gaW4gYSBzaW5nbGUgcGFzcyB3aXRob3V0IHByb2R1Y2luZyB0aGUgaW50ZXJtZWRpYXRlIHJlY29yZCBzaGFwZS5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmludGVyZmFjZSBJSGlzdG9yeVJlY29yZEJhc2Uge1xuXHRyZWFkb25seSBzZXNzaW9uOiBVUkk7XG59XG5cbmludGVyZmFjZSBJSGlzdG9yeU1lc3NhZ2VSZWNvcmQgZXh0ZW5kcyBJSGlzdG9yeVJlY29yZEJhc2Uge1xuXHRyZWFkb25seSB0eXBlOiAnbWVzc2FnZSc7XG5cdHJlYWRvbmx5IHJvbGU6ICd1c2VyJyB8ICdhc3Npc3RhbnQnO1xuXHRyZWFkb25seSBtZXNzYWdlSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgY29udGVudDogc3RyaW5nO1xuXHRyZWFkb25seSB0b29sUmVxdWVzdHM/OiByZWFkb25seSB7XG5cdFx0cmVhZG9ubHkgdG9vbENhbGxJZDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0XHRyZWFkb25seSBhcmd1bWVudHM/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgdHlwZT86ICdmdW5jdGlvbicgfCAnY3VzdG9tJztcblx0fVtdO1xuXHRyZWFkb25seSByZWFzb25pbmdPcGFxdWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlYXNvbmluZ1RleHQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGVuY3J5cHRlZENvbnRlbnQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhcmVudFRvb2xDYWxsSWQ/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUhpc3RvcnlUb29sU3RhcnRSZWNvcmQgZXh0ZW5kcyBJSGlzdG9yeVJlY29yZEJhc2Uge1xuXHRyZWFkb25seSB0eXBlOiAndG9vbF9zdGFydCc7XG5cdHJlYWRvbmx5IHRvb2xDYWxsSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdG9vbE5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZGlzcGxheU5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgaW52b2NhdGlvbk1lc3NhZ2U6IFN0cmluZ09yTWFya2Rvd247XG5cdHJlYWRvbmx5IHRvb2xJbnB1dD86IHN0cmluZztcblx0cmVhZG9ubHkgdG9vbEtpbmQ/OiAndGVybWluYWwnIHwgJ3N1YmFnZW50JyB8ICdzZWFyY2gnO1xuXHRyZWFkb25seSBsYW5ndWFnZT86IHN0cmluZztcblx0cmVhZG9ubHkgc3ViYWdlbnRBZ2VudE5hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN1YmFnZW50RGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1jcFNlcnZlck5hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1jcFRvb2xOYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBwYXJlbnRUb29sQ2FsbElkPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSUhpc3RvcnlUb29sQ29tcGxldGVSZWNvcmQgZXh0ZW5kcyBJSGlzdG9yeVJlY29yZEJhc2Uge1xuXHRyZWFkb25seSB0eXBlOiAndG9vbF9jb21wbGV0ZSc7XG5cdHJlYWRvbmx5IHRvb2xDYWxsSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmVzdWx0OiB7XG5cdFx0cmVhZG9ubHkgc3VjY2VzczogYm9vbGVhbjtcblx0XHRyZWFkb25seSBwYXN0VGVuc2VNZXNzYWdlOiBTdHJpbmdPck1hcmtkb3duO1xuXHRcdHJlYWRvbmx5IGNvbnRlbnQ/OiBUb29sUmVzdWx0Q29udGVudFtdO1xuXHRcdHJlYWRvbmx5IGVycm9yPzogeyByZWFkb25seSBtZXNzYWdlOiBzdHJpbmc7IHJlYWRvbmx5IGNvZGU/OiBzdHJpbmcgfTtcblx0fTtcblx0cmVhZG9ubHkgaXNVc2VyUmVxdWVzdGVkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdG9vbFRlbGVtZXRyeT86IHN0cmluZztcblx0cmVhZG9ubHkgcGFyZW50VG9vbENhbGxJZD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElIaXN0b3J5U3ViYWdlbnRTdGFydGVkUmVjb3JkIGV4dGVuZHMgSUhpc3RvcnlSZWNvcmRCYXNlIHtcblx0cmVhZG9ubHkgdHlwZTogJ3N1YmFnZW50X3N0YXJ0ZWQnO1xuXHRyZWFkb25seSB0b29sQ2FsbElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFnZW50TmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBhZ2VudERpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFnZW50RGVzY3JpcHRpb24/OiBzdHJpbmc7XG59XG5cbi8qKiBUZXN0IGZpeHR1cmUgcmVjb3JkLiBIYW5kLWNvbnN0cnVjdGVkIGJ5IHRlc3RzIHRvIHNlZWQgbW9jayBzZXNzaW9uIGhpc3Rvcmllcy4gKi9cbmV4cG9ydCB0eXBlIElIaXN0b3J5UmVjb3JkID1cblx0fCBJSGlzdG9yeU1lc3NhZ2VSZWNvcmRcblx0fCBJSGlzdG9yeVRvb2xTdGFydFJlY29yZFxuXHR8IElIaXN0b3J5VG9vbENvbXBsZXRlUmVjb3JkXG5cdHwgSUhpc3RvcnlTdWJhZ2VudFN0YXJ0ZWRSZWNvcmQ7XG5cbmZ1bmN0aW9uIGV4dHJhY3RTdWJhZ2VudE1ldGEoc3RhcnQ6IElIaXN0b3J5VG9vbFN0YXJ0UmVjb3JkIHwgdW5kZWZpbmVkKTogeyBzdWJhZ2VudERlc2NyaXB0aW9uPzogc3RyaW5nOyBzdWJhZ2VudEFnZW50TmFtZT86IHN0cmluZyB9IHtcblx0aWYgKCFzdGFydCkge1xuXHRcdHJldHVybiB7fTtcblx0fVxuXHRyZXR1cm4ge1xuXHRcdHN1YmFnZW50RGVzY3JpcHRpb246IHN0YXJ0LnN1YmFnZW50RGVzY3JpcHRpb24sXG5cdFx0c3ViYWdlbnRBZ2VudE5hbWU6IHN0YXJ0LnN1YmFnZW50QWdlbnROYW1lLFxuXHR9O1xufVxuXG4vKipcbiAqIEJ1aWxkcyBhIHBhcmVudCBzZXNzaW9uJ3Mge0BsaW5rIFR1cm59cyBmcm9tIGEgZmxhdCBsaXN0IG9mIGhpc3RvcnlcbiAqIHJlY29yZHMuXG4gKlxuICogRWFjaCBgdXNlcmAgbWVzc2FnZSBzdGFydHMgYSBuZXcgdHVybi4gSW5uZXIgc3ViYWdlbnQgcmVjb3JkcyAodGhvc2VcbiAqIGNhcnJ5aW5nIGBwYXJlbnRUb29sQ2FsbElkYCkgYXJlIHNraXBwZWQgXHUyMDE0IHNlZVxuICoge0BsaW5rIGJ1aWxkU3ViYWdlbnRUdXJuc0Zyb21IaXN0b3J5fS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkVHVybnNGcm9tSGlzdG9yeShtZXNzYWdlczogcmVhZG9ubHkgSUhpc3RvcnlSZWNvcmRbXSk6IFR1cm5bXSB7XG5cdGNvbnN0IHR1cm5zOiBUdXJuW10gPSBbXTtcblx0Y29uc3Qgc3ViYWdlbnRzQnlUb29sQ2FsbElkID0gbmV3IE1hcDxzdHJpbmcsIElIaXN0b3J5U3ViYWdlbnRTdGFydGVkUmVjb3JkPigpO1xuXHRsZXQgY3VycmVudFR1cm46IHtcblx0XHRpZDogc3RyaW5nO1xuXHRcdG1lc3NhZ2U6IE1lc3NhZ2U7XG5cdFx0cmVzcG9uc2VQYXJ0czogUmVzcG9uc2VQYXJ0W107XG5cdFx0cGVuZGluZ1Rvb2xzOiBNYXA8c3RyaW5nLCBJSGlzdG9yeVRvb2xTdGFydFJlY29yZD47XG5cdH0gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3QgZmluYWxpemVUdXJuID0gKHR1cm46IE5vbk51bGxhYmxlPHR5cGVvZiBjdXJyZW50VHVybj4sIHN0YXRlOiBUdXJuU3RhdGUpOiB2b2lkID0+IHtcblx0XHR0dXJucy5wdXNoKHtcblx0XHRcdGlkOiB0dXJuLmlkLFxuXHRcdFx0bWVzc2FnZTogdHVybi5tZXNzYWdlLFxuXHRcdFx0cmVzcG9uc2VQYXJ0czogdHVybi5yZXNwb25zZVBhcnRzLFxuXHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHN0YXRlLFxuXHRcdH0pO1xuXHR9O1xuXG5cdGNvbnN0IHN0YXJ0VHVybiA9IChpZDogc3RyaW5nLCB0ZXh0OiBzdHJpbmcpOiBOb25OdWxsYWJsZTx0eXBlb2YgY3VycmVudFR1cm4+ID0+ICh7XG5cdFx0aWQsXG5cdFx0bWVzc2FnZTogeyB0ZXh0LCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0cmVzcG9uc2VQYXJ0czogW10sXG5cdFx0cGVuZGluZ1Rvb2xzOiBuZXcgTWFwKCksXG5cdH0pO1xuXG5cdGZvciAoY29uc3QgbXNnIG9mIG1lc3NhZ2VzKSB7XG5cdFx0aWYgKG1zZy50eXBlID09PSAnbWVzc2FnZScgJiYgbXNnLnJvbGUgPT09ICd1c2VyJykge1xuXHRcdFx0aWYgKGN1cnJlbnRUdXJuKSB7XG5cdFx0XHRcdGZpbmFsaXplVHVybihjdXJyZW50VHVybiwgVHVyblN0YXRlLkNhbmNlbGxlZCk7XG5cdFx0XHR9XG5cdFx0XHRjdXJyZW50VHVybiA9IHN0YXJ0VHVybihtc2cubWVzc2FnZUlkLCBtc2cuY29udGVudCk7XG5cdFx0fSBlbHNlIGlmIChtc2cudHlwZSA9PT0gJ21lc3NhZ2UnICYmIG1zZy5yb2xlID09PSAnYXNzaXN0YW50Jykge1xuXHRcdFx0aWYgKG1zZy5wYXJlbnRUb29sQ2FsbElkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFjdXJyZW50VHVybikge1xuXHRcdFx0XHRjdXJyZW50VHVybiA9IHN0YXJ0VHVybihtc2cubWVzc2FnZUlkLCAnJyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAobXNnLnJlYXNvbmluZ1RleHQpIHtcblx0XHRcdFx0Y3VycmVudFR1cm4ucmVzcG9uc2VQYXJ0cy5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZyxcblx0XHRcdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRcdFx0Y29udGVudDogbXNnLnJlYXNvbmluZ1RleHQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG1zZy5jb250ZW50KSB7XG5cdFx0XHRcdGN1cnJlbnRUdXJuLnJlc3BvbnNlUGFydHMucHVzaCh7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bixcblx0XHRcdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRcdFx0Y29udGVudDogbXNnLmNvbnRlbnQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFtc2cudG9vbFJlcXVlc3RzIHx8IG1zZy50b29sUmVxdWVzdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGZpbmFsaXplVHVybihjdXJyZW50VHVybiwgVHVyblN0YXRlLkNvbXBsZXRlKTtcblx0XHRcdFx0Y3VycmVudFR1cm4gPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChtc2cudHlwZSA9PT0gJ3N1YmFnZW50X3N0YXJ0ZWQnKSB7XG5cdFx0XHRzdWJhZ2VudHNCeVRvb2xDYWxsSWQuc2V0KG1zZy50b29sQ2FsbElkLCBtc2cpO1xuXHRcdH0gZWxzZSBpZiAobXNnLnR5cGUgPT09ICd0b29sX3N0YXJ0Jykge1xuXHRcdFx0aWYgKG1zZy5wYXJlbnRUb29sQ2FsbElkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y3VycmVudFR1cm4/LnBlbmRpbmdUb29scy5zZXQobXNnLnRvb2xDYWxsSWQsIG1zZyk7XG5cdFx0fSBlbHNlIGlmIChtc2cudHlwZSA9PT0gJ3Rvb2xfY29tcGxldGUnKSB7XG5cdFx0XHRpZiAobXNnLnBhcmVudFRvb2xDYWxsSWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY3VycmVudFR1cm4pIHtcblx0XHRcdFx0Y29uc3Qgc3RhcnQgPSBjdXJyZW50VHVybi5wZW5kaW5nVG9vbHMuZ2V0KG1zZy50b29sQ2FsbElkKTtcblx0XHRcdFx0Y3VycmVudFR1cm4ucGVuZGluZ1Rvb2xzLmRlbGV0ZShtc2cudG9vbENhbGxJZCk7XG5cblx0XHRcdFx0Y29uc3Qgc3ViYWdlbnRFdmVudCA9IHN1YmFnZW50c0J5VG9vbENhbGxJZC5nZXQobXNnLnRvb2xDYWxsSWQpO1xuXHRcdFx0XHRjb25zdCBjb250ZW50V2l0aFN1YmFnZW50ID0gbXNnLnJlc3VsdC5jb250ZW50ID8gWy4uLm1zZy5yZXN1bHQuY29udGVudF0gOiBbXTtcblx0XHRcdFx0aWYgKHN1YmFnZW50RXZlbnQpIHtcblx0XHRcdFx0XHRjb25zdCBwYXJlbnRTZXNzaW9uU3RyID0gbXNnLnNlc3Npb24udG9TdHJpbmcoKTtcblx0XHRcdFx0XHRjb250ZW50V2l0aFN1YmFnZW50LnB1c2goe1xuXHRcdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50LFxuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpKHBhcmVudFNlc3Npb25TdHIsIG1zZy50b29sQ2FsbElkKSxcblx0XHRcdFx0XHRcdHRpdGxlOiBzdWJhZ2VudEV2ZW50LmFnZW50RGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0XHRhZ2VudE5hbWU6IHN1YmFnZW50RXZlbnQuYWdlbnROYW1lLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHN1YmFnZW50RXZlbnQuYWdlbnREZXNjcmlwdGlvbixcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHRjOiBUb29sQ2FsbENvbXBsZXRlZFN0YXRlID0ge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6IG1zZy50b29sQ2FsbElkLFxuXHRcdFx0XHRcdHRvb2xOYW1lOiBzdGFydD8udG9vbE5hbWUgPz8gJ3Vua25vd24nLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiBzdGFydD8uZGlzcGxheU5hbWUgPz8gJ1Vua25vd24gVG9vbCcsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHN0YXJ0Py5pbnZvY2F0aW9uTWVzc2FnZSA/PyAnVW5rbm93biB0b29sJyxcblx0XHRcdFx0XHR0b29sSW5wdXQ6IHN0YXJ0Py50b29sSW5wdXQsXG5cdFx0XHRcdFx0c3VjY2VzczogbXNnLnJlc3VsdC5zdWNjZXNzLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IG1zZy5yZXN1bHQucGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdFx0XHRjb250ZW50OiBjb250ZW50V2l0aFN1YmFnZW50Lmxlbmd0aCA+IDAgPyBjb250ZW50V2l0aFN1YmFnZW50IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGVycm9yOiBtc2cucmVzdWx0LmVycm9yLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0XHR0b29sS2luZDogc3RhcnQ/LnRvb2xLaW5kLFxuXHRcdFx0XHRcdFx0bGFuZ3VhZ2U6IHN0YXJ0Py5sYW5ndWFnZSxcblx0XHRcdFx0XHRcdC4uLmV4dHJhY3RTdWJhZ2VudE1ldGEoc3RhcnQpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHRcdGN1cnJlbnRUdXJuLnJlc3BvbnNlUGFydHMucHVzaCh7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCxcblx0XHRcdFx0XHR0b29sQ2FsbDogdGMsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGlmIChjdXJyZW50VHVybikge1xuXHRcdGZpbmFsaXplVHVybihjdXJyZW50VHVybiwgVHVyblN0YXRlLkNhbmNlbGxlZCk7XG5cdH1cblxuXHRyZXR1cm4gdHVybnM7XG59XG5cbi8qKlxuICogQnVpbGRzIHRoZSB7QGxpbmsgVHVybn1zIGZvciBhIHN1YmFnZW50IGNoaWxkIHNlc3Npb24gYnkgZmlsdGVyaW5nIHRoZVxuICogcGFyZW50J3MgaGlzdG9yeSBmb3IgcmVjb3JkcyBjYXJyeWluZyB0aGUgbWF0Y2hpbmcgYHBhcmVudFRvb2xDYWxsSWRgLlxuICogUmV0dXJucyBhIHNpbmdsZSB0dXJuIGNvbnRhaW5pbmcgYWxsIGlubmVyIHRvb2wgY2FsbHMgYW5kIGFzc2lzdGFudFxuICogbWVzc2FnZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFN1YmFnZW50VHVybnNGcm9tSGlzdG9yeShcblx0cGFyZW50TWVzc2FnZXM6IHJlYWRvbmx5IElIaXN0b3J5UmVjb3JkW10sXG5cdHBhcmVudFRvb2xDYWxsSWQ6IHN0cmluZyxcblx0Y2hpbGRTZXNzaW9uVXJpOiBzdHJpbmcsXG4pOiBUdXJuW10ge1xuXHRjb25zdCBpbm5lclRvb2xDYWxsSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGZvciAoY29uc3QgbXNnIG9mIHBhcmVudE1lc3NhZ2VzKSB7XG5cdFx0aWYgKChtc2cudHlwZSA9PT0gJ3Rvb2xfc3RhcnQnIHx8IG1zZy50eXBlID09PSAndG9vbF9jb21wbGV0ZScpICYmIG1zZy5wYXJlbnRUb29sQ2FsbElkID09PSBwYXJlbnRUb29sQ2FsbElkKSB7XG5cdFx0XHRpbm5lclRvb2xDYWxsSWRzLmFkZChtc2cudG9vbENhbGxJZCk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3Qgc3ViYWdlbnRzQnlUb29sQ2FsbElkID0gbmV3IE1hcDxzdHJpbmcsIElIaXN0b3J5U3ViYWdlbnRTdGFydGVkUmVjb3JkPigpO1xuXHRmb3IgKGNvbnN0IG1zZyBvZiBwYXJlbnRNZXNzYWdlcykge1xuXHRcdGlmIChtc2cudHlwZSA9PT0gJ3N1YmFnZW50X3N0YXJ0ZWQnICYmIGlubmVyVG9vbENhbGxJZHMuaGFzKG1zZy50b29sQ2FsbElkKSkge1xuXHRcdFx0c3ViYWdlbnRzQnlUb29sQ2FsbElkLnNldChtc2cudG9vbENhbGxJZCwgbXNnKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBpbm5lck1lc3NhZ2VzID0gcGFyZW50TWVzc2FnZXMuZmlsdGVyKG1zZyA9PiB7XG5cdFx0aWYgKG1zZy50eXBlID09PSAndG9vbF9zdGFydCcgfHwgbXNnLnR5cGUgPT09ICd0b29sX2NvbXBsZXRlJykge1xuXHRcdFx0cmV0dXJuIG1zZy5wYXJlbnRUb29sQ2FsbElkID09PSBwYXJlbnRUb29sQ2FsbElkO1xuXHRcdH1cblx0XHRpZiAobXNnLnR5cGUgPT09ICdtZXNzYWdlJykge1xuXHRcdFx0cmV0dXJuIG1zZy5wYXJlbnRUb29sQ2FsbElkID09PSBwYXJlbnRUb29sQ2FsbElkO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH0pO1xuXG5cdGlmIChpbm5lck1lc3NhZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGNvbnN0IHJlc3BvbnNlUGFydHM6IFJlc3BvbnNlUGFydFtdID0gW107XG5cdGNvbnN0IHBlbmRpbmdUb29scyA9IG5ldyBNYXA8c3RyaW5nLCBJSGlzdG9yeVRvb2xTdGFydFJlY29yZD4oKTtcblxuXHRmb3IgKGNvbnN0IG1zZyBvZiBpbm5lck1lc3NhZ2VzKSB7XG5cdFx0aWYgKG1zZy50eXBlID09PSAndG9vbF9zdGFydCcpIHtcblx0XHRcdHBlbmRpbmdUb29scy5zZXQobXNnLnRvb2xDYWxsSWQsIG1zZyk7XG5cdFx0fSBlbHNlIGlmIChtc2cudHlwZSA9PT0gJ3Rvb2xfY29tcGxldGUnKSB7XG5cdFx0XHRjb25zdCBzdGFydCA9IHBlbmRpbmdUb29scy5nZXQobXNnLnRvb2xDYWxsSWQpO1xuXHRcdFx0cGVuZGluZ1Rvb2xzLmRlbGV0ZShtc2cudG9vbENhbGxJZCk7XG5cblx0XHRcdGNvbnN0IHN1YmFnZW50RXZlbnQgPSBzdWJhZ2VudHNCeVRvb2xDYWxsSWQuZ2V0KG1zZy50b29sQ2FsbElkKTtcblx0XHRcdGNvbnN0IGNvbnRlbnRXaXRoU3ViYWdlbnQgPSBtc2cucmVzdWx0LmNvbnRlbnQgPyBbLi4ubXNnLnJlc3VsdC5jb250ZW50XSA6IFtdO1xuXHRcdFx0aWYgKHN1YmFnZW50RXZlbnQpIHtcblx0XHRcdFx0Y29udGVudFdpdGhTdWJhZ2VudC5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQsXG5cdFx0XHRcdFx0cmVzb3VyY2U6IGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpKGNoaWxkU2Vzc2lvblVyaSwgbXNnLnRvb2xDYWxsSWQpLFxuXHRcdFx0XHRcdHRpdGxlOiBzdWJhZ2VudEV2ZW50LmFnZW50RGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiBzdWJhZ2VudEV2ZW50LmFnZW50TmFtZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogc3ViYWdlbnRFdmVudC5hZ2VudERlc2NyaXB0aW9uLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGM6IFRvb2xDYWxsQ29tcGxldGVkU3RhdGUgPSB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBtc2cudG9vbENhbGxJZCxcblx0XHRcdFx0dG9vbE5hbWU6IHN0YXJ0Py50b29sTmFtZSA/PyAndW5rbm93bicsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBzdGFydD8uZGlzcGxheU5hbWUgPz8gJ1Vua25vd24gVG9vbCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBzdGFydD8uaW52b2NhdGlvbk1lc3NhZ2UgPz8gJ1Vua25vd24gdG9vbCcsXG5cdFx0XHRcdHRvb2xJbnB1dDogc3RhcnQ/LnRvb2xJbnB1dCxcblx0XHRcdFx0c3VjY2VzczogbXNnLnJlc3VsdC5zdWNjZXNzLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBtc2cucmVzdWx0LnBhc3RUZW5zZU1lc3NhZ2UsXG5cdFx0XHRcdGNvbnRlbnQ6IGNvbnRlbnRXaXRoU3ViYWdlbnQubGVuZ3RoID4gMCA/IGNvbnRlbnRXaXRoU3ViYWdlbnQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVycm9yOiBtc2cucmVzdWx0LmVycm9yLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHR0b29sS2luZDogc3RhcnQ/LnRvb2xLaW5kLFxuXHRcdFx0XHRcdGxhbmd1YWdlOiBzdGFydD8ubGFuZ3VhZ2UsXG5cdFx0XHRcdFx0Li4uZXh0cmFjdFN1YmFnZW50TWV0YShzdGFydCksXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0cmVzcG9uc2VQYXJ0cy5wdXNoKHtcblx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCxcblx0XHRcdFx0dG9vbENhbGw6IHRjLFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGlmIChtc2cudHlwZSA9PT0gJ21lc3NhZ2UnICYmIG1zZy5yb2xlID09PSAnYXNzaXN0YW50Jykge1xuXHRcdFx0aWYgKG1zZy5yZWFzb25pbmdUZXh0KSB7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHMucHVzaCh7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcsXG5cdFx0XHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IG1zZy5yZWFzb25pbmdUZXh0LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGlmIChtc2cuY29udGVudCkge1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzLnB1c2goe1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sXG5cdFx0XHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IG1zZy5jb250ZW50LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAocmVzcG9uc2VQYXJ0cy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRyZXR1cm4gW3tcblx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0bWVzc2FnZTogeyB0ZXh0OiAnJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdHJlc3BvbnNlUGFydHMsXG5cdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHR9XTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFNESy1ldmVudHMtdG8taGlzdG9yeS1yZWNvcmRzICh0ZXN0IGZpeHR1cmUgbG9hZGVyKVxuLy9cbi8vIFRyYW5zbGF0ZXMgcmF3IENvcGlsb3QgU0RLIHNlc3Npb24gZXZlbnRzIGludG8gYSBmbGF0IElIaXN0b3J5UmVjb3JkXG4vLyBzdHJlYW0uIFRoaXMgaXMgdGhlIHRlc3Qtc2lkZSBlcXVpdmFsZW50IG9mIHRoZSBwcm9kdWN0aW9uIHNpbmdsZS1wYXNzXG4vLyBgbWFwU2Vzc2lvbkV2ZW50c2AgKHdoaWNoIGdvZXMgZGlyZWN0bHkgdG8gVHVybltdKS4gSXQgZXhpc3RzIHNvIEpTT05MXG4vLyBmaXh0dXJlcyBjYXB0dXJlZCBmcm9tIHJlYWwgYH4vLmNvcGlsb3Qvc2Vzc2lvbi1zdGF0ZS9gIGZpbGVzIGNhbiBiZVxuLy8gbG9hZGVkIGludG8gdGhlIHRlc3QgRFNMIHdpdGhvdXQgZm9yY2luZyB0ZXN0cyB0byBhbHNvIGFkb3B0IFR1cm5bXS5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIHRyeVN0cmluZ2lmeSh2YWx1ZTogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5mdW5jdGlvbiBpc1N5bnRoZXRpY1VzZXJNZXNzYWdlKGV2ZW50OiBJU2Vzc2lvbkV2ZW50KTogYm9vbGVhbiB7XG5cdGlmIChldmVudC50eXBlICE9PSAndXNlci5tZXNzYWdlJykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBzb3VyY2UgPSAoZXZlbnQgYXMgSVNlc3Npb25FdmVudE1lc3NhZ2UpLmRhdGE/LnNvdXJjZTtcblx0cmV0dXJuICEhc291cmNlICYmIHNvdXJjZS50b0xvd2VyQ2FzZSgpICE9PSAndXNlcic7XG59XG5cbi8qKlxuICogTWFwcyByYXcgU0RLIHNlc3Npb24gZXZlbnRzIGludG8gYSBmbGF0IGxpc3Qgb2Yge0BsaW5rIElIaXN0b3J5UmVjb3JkfXMsXG4gKiByZXN0b3Jpbmcgc3RvcmVkIGZpbGUtZWRpdCBtZXRhZGF0YSBmcm9tIHRoZSBzZXNzaW9uIGRhdGFiYXNlIHdoZW5cbiAqIGF2YWlsYWJsZS4gVGVzdC1maXh0dXJlLW9ubHkuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBtYXBTZXNzaW9uRXZlbnRzVG9IaXN0b3J5UmVjb3Jkcyhcblx0c2Vzc2lvbjogVVJJLFxuXHRkYjogSVNlc3Npb25EYXRhYmFzZSB8IHVuZGVmaW5lZCxcblx0ZXZlbnRzOiByZWFkb25seSBJU2Vzc2lvbkV2ZW50W10sXG5cdHdvcmtpbmdEaXJlY3Rvcnk/OiBVUkksXG4pOiBQcm9taXNlPElIaXN0b3J5UmVjb3JkW10+IHtcblx0Y29uc3QgcmVzdWx0OiBJSGlzdG9yeVJlY29yZFtdID0gW107XG5cdGNvbnN0IHRvb2xJbmZvQnlDYWxsSWQgPSBuZXcgTWFwPHN0cmluZywgeyB0b29sTmFtZTogc3RyaW5nOyBwYXJhbWV0ZXJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZDsgcmV3cml0dGVuQXJncz86IHN0cmluZyB9PigpO1xuXHRjb25zdCBlZGl0VG9vbENhbGxJZHM6IHN0cmluZ1tdID0gW107XG5cblx0Ly8gVGhlIFNESyB0YWdzIHN1Yi1hZ2VudCBldmVudHMgd2l0aCBhbiBlbnZlbG9wZS1sZXZlbCBgYWdlbnRJZGAgKHRoZVxuXHQvLyBgZGF0YS5wYXJlbnRUb29sQ2FsbElkYCBmaWVsZCBpcyBkZXByZWNhdGVkKS4gYHN1YmFnZW50LnN0YXJ0ZWRgIG1hcHMgdGhlXG5cdC8vIHN1Yi1hZ2VudCdzIGBhZ2VudElkYCB0byB0aGUgcGFyZW50IHRvb2wgY2FsbCBpZDsgcmVzb2x2ZSBsYXRlciBldmVudHNcblx0Ly8gdGhyb3VnaCBpdCBzbyB0aGUgcHJvZHVjZWQgcmVjb3JkcyBjYXJyeSB0aGUgcmlnaHQgYHBhcmVudFRvb2xDYWxsSWRgLlxuXHRjb25zdCBwYXJlbnRUb29sQ2FsbElkQnlBZ2VudElkID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0Y29uc3QgcmVzb2x2ZVBhcmVudFRvb2xDYWxsSWQgPSAoYWdlbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBkZXByZWNhdGVkUGFyZW50VG9vbENhbGxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRjb25zdCBtYXBwZWQgPSBhZ2VudElkID8gcGFyZW50VG9vbENhbGxJZEJ5QWdlbnRJZC5nZXQoYWdlbnRJZCkgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIG1hcHBlZCA/PyBkZXByZWNhdGVkUGFyZW50VG9vbENhbGxJZDtcblx0fTtcblxuXHRmb3IgKGNvbnN0IGUgb2YgZXZlbnRzKSB7XG5cdFx0aWYgKGUudHlwZSA9PT0gJ3N1YmFnZW50LnN0YXJ0ZWQnKSB7XG5cdFx0XHRjb25zdCBzdWIgPSBlIGFzIElTZXNzaW9uRXZlbnRTdWJhZ2VudFN0YXJ0ZWQ7XG5cdFx0XHRpZiAoc3ViLmFnZW50SWQpIHtcblx0XHRcdFx0cGFyZW50VG9vbENhbGxJZEJ5QWdlbnRJZC5zZXQoc3ViLmFnZW50SWQsIHN1Yi5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoZS50eXBlID09PSAndG9vbC5leGVjdXRpb25fc3RhcnQnKSB7XG5cdFx0XHRjb25zdCBkID0gKGUgYXMgSVNlc3Npb25FdmVudFRvb2xTdGFydCkuZGF0YTtcblx0XHRcdGlmIChpc0hpZGRlblRvb2woZC50b29sTmFtZSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0b29sQXJncyA9IGQuYXJndW1lbnRzICE9PSB1bmRlZmluZWQgPyB0cnlTdHJpbmdpZnkoZC5hcmd1bWVudHMpIDogdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRvb2xBcmdzKSB7XG5cdFx0XHRcdHRyeSB7IHBhcmFtZXRlcnMgPSBKU09OLnBhcnNlKHRvb2xBcmdzKSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXdyaXR0ZW5BcmdzID0gc3RyaXBSZWR1bmRhbnRDZFByZWZpeChkLnRvb2xOYW1lLCBwYXJhbWV0ZXJzLCB3b3JraW5nRGlyZWN0b3J5KSA/IHRyeVN0cmluZ2lmeShwYXJhbWV0ZXJzKSA6IHVuZGVmaW5lZDtcblx0XHRcdHRvb2xJbmZvQnlDYWxsSWQuc2V0KGQudG9vbENhbGxJZCwgeyB0b29sTmFtZTogZC50b29sTmFtZSwgcGFyYW1ldGVycywgcmV3cml0dGVuQXJncyB9KTtcblx0XHRcdGNvbnN0IGNvbW1hbmQgPSBpc1N0cmluZyhwYXJhbWV0ZXJzPy5jb21tYW5kKSA/IHBhcmFtZXRlcnMuY29tbWFuZCA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChpc0VkaXRUb29sKGQudG9vbE5hbWUsIGNvbW1hbmQpKSB7XG5cdFx0XHRcdGVkaXRUb29sQ2FsbElkcy5wdXNoKGQudG9vbENhbGxJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0bGV0IHN0b3JlZEVkaXRzOiBNYXA8c3RyaW5nLCBJRmlsZUVkaXRSZWNvcmRbXT4gfCB1bmRlZmluZWQ7XG5cdGlmIChkYiAmJiBlZGl0VG9vbENhbGxJZHMubGVuZ3RoID4gMCkge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZWNvcmRzID0gYXdhaXQgZGIuZ2V0RmlsZUVkaXRzKGVkaXRUb29sQ2FsbElkcyk7XG5cdFx0XHRpZiAocmVjb3Jkcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHN0b3JlZEVkaXRzID0gbmV3IE1hcCgpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHIgb2YgcmVjb3Jkcykge1xuXHRcdFx0XHRcdGxldCBsaXN0ID0gc3RvcmVkRWRpdHMuZ2V0KHIudG9vbENhbGxJZCk7XG5cdFx0XHRcdFx0aWYgKCFsaXN0KSB7XG5cdFx0XHRcdFx0XHRsaXN0ID0gW107XG5cdFx0XHRcdFx0XHRzdG9yZWRFZGl0cy5zZXQoci50b29sQ2FsbElkLCBsaXN0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bGlzdC5wdXNoKHIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBEYXRhYmFzZSBtYXkgbm90IGV4aXN0IHlldCBcdTIwMTQgdGhhdCdzIGZpbmUuXG5cdFx0fVxuXHR9XG5cblx0Y29uc3Qgc2Vzc2lvblVyaVN0ciA9IHNlc3Npb24udG9TdHJpbmcoKTtcblxuXHRmb3IgKGNvbnN0IGUgb2YgZXZlbnRzKSB7XG5cdFx0aWYgKGUudHlwZSA9PT0gJ2Fzc2lzdGFudC5tZXNzYWdlJyB8fCBlLnR5cGUgPT09ICd1c2VyLm1lc3NhZ2UnKSB7XG5cdFx0XHRpZiAoaXNTeW50aGV0aWNVc2VyTWVzc2FnZShlKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGQgPSAoZSBhcyBJU2Vzc2lvbkV2ZW50TWVzc2FnZSkuZGF0YTtcblx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0c2Vzc2lvbixcblx0XHRcdFx0dHlwZTogJ21lc3NhZ2UnLFxuXHRcdFx0XHRyb2xlOiBlLnR5cGUgPT09ICd1c2VyLm1lc3NhZ2UnID8gJ3VzZXInIDogJ2Fzc2lzdGFudCcsXG5cdFx0XHRcdG1lc3NhZ2VJZDogZD8ubWVzc2FnZUlkID8/IGQ/LmludGVyYWN0aW9uSWQgPz8gJycsXG5cdFx0XHRcdGNvbnRlbnQ6IGQ/LmNvbnRlbnQgPz8gJycsXG5cdFx0XHRcdHRvb2xSZXF1ZXN0czogZD8udG9vbFJlcXVlc3RzPy5tYXAodHIgPT4gKHtcblx0XHRcdFx0XHR0b29sQ2FsbElkOiB0ci50b29sQ2FsbElkLFxuXHRcdFx0XHRcdG5hbWU6IHRyLm5hbWUsXG5cdFx0XHRcdFx0YXJndW1lbnRzOiB0ci5hcmd1bWVudHMgIT09IHVuZGVmaW5lZCA/IHRyeVN0cmluZ2lmeSh0ci5hcmd1bWVudHMpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHR5cGU6IHRyLnR5cGUsXG5cdFx0XHRcdH0pKSxcblx0XHRcdFx0cmVhc29uaW5nT3BhcXVlOiBkPy5yZWFzb25pbmdPcGFxdWUsXG5cdFx0XHRcdHJlYXNvbmluZ1RleHQ6IGQ/LnJlYXNvbmluZ1RleHQsXG5cdFx0XHRcdGVuY3J5cHRlZENvbnRlbnQ6IGQ/LmVuY3J5cHRlZENvbnRlbnQsXG5cdFx0XHRcdHBhcmVudFRvb2xDYWxsSWQ6IHJlc29sdmVQYXJlbnRUb29sQ2FsbElkKChlIGFzIElTZXNzaW9uRXZlbnRNZXNzYWdlKS5hZ2VudElkLCBkPy5wYXJlbnRUb29sQ2FsbElkKSxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBpZiAoZS50eXBlID09PSAndG9vbC5leGVjdXRpb25fc3RhcnQnKSB7XG5cdFx0XHRjb25zdCBkID0gKGUgYXMgSVNlc3Npb25FdmVudFRvb2xTdGFydCkuZGF0YTtcblx0XHRcdGlmIChpc0hpZGRlblRvb2woZC50b29sTmFtZSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbmZvID0gdG9vbEluZm9CeUNhbGxJZC5nZXQoZC50b29sQ2FsbElkKTtcblx0XHRcdGNvbnN0IGRpc3BsYXlOYW1lID0gZ2V0VG9vbERpc3BsYXlOYW1lKGQudG9vbE5hbWUpO1xuXHRcdFx0Y29uc3QgdG9vbEtpbmQgPSBnZXRUb29sS2luZChkLnRvb2xOYW1lKTtcblx0XHRcdGNvbnN0IHRvb2xBcmdzID0gaW5mbz8ucmV3cml0dGVuQXJncyA/PyAoZC5hcmd1bWVudHMgIT09IHVuZGVmaW5lZCA/IHRyeVN0cmluZ2lmeShkLmFyZ3VtZW50cykgOiB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnRNZXRhID0gdG9vbEtpbmQgPT09ICdzdWJhZ2VudCcgPyBnZXRTdWJhZ2VudE1ldGFkYXRhKGluZm8/LnBhcmFtZXRlcnMpIDogdW5kZWZpbmVkO1xuXHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRzZXNzaW9uLFxuXHRcdFx0XHR0eXBlOiAndG9vbF9zdGFydCcsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IGQudG9vbENhbGxJZCxcblx0XHRcdFx0dG9vbE5hbWU6IGQudG9vbE5hbWUsXG5cdFx0XHRcdGRpc3BsYXlOYW1lLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogZ2V0SW52b2NhdGlvbk1lc3NhZ2UoZC50b29sTmFtZSwgZGlzcGxheU5hbWUsIGluZm8/LnBhcmFtZXRlcnMpLFxuXHRcdFx0XHR0b29sSW5wdXQ6IGdldFRvb2xJbnB1dFN0cmluZyhkLnRvb2xOYW1lLCBpbmZvPy5wYXJhbWV0ZXJzLCB0b29sQXJncyksXG5cdFx0XHRcdHRvb2xLaW5kLFxuXHRcdFx0XHRsYW5ndWFnZTogdG9vbEtpbmQgPT09ICd0ZXJtaW5hbCcgPyBnZXRTaGVsbExhbmd1YWdlKGQudG9vbE5hbWUpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzdWJhZ2VudEFnZW50TmFtZTogc3ViYWdlbnRNZXRhPy5hZ2VudE5hbWUsXG5cdFx0XHRcdHN1YmFnZW50RGVzY3JpcHRpb246IHN1YmFnZW50TWV0YT8uZGVzY3JpcHRpb24sXG5cdFx0XHRcdG1jcFNlcnZlck5hbWU6IGQubWNwU2VydmVyTmFtZSxcblx0XHRcdFx0bWNwVG9vbE5hbWU6IGQubWNwVG9vbE5hbWUsXG5cdFx0XHRcdHBhcmVudFRvb2xDYWxsSWQ6IHJlc29sdmVQYXJlbnRUb29sQ2FsbElkKChlIGFzIElTZXNzaW9uRXZlbnRUb29sU3RhcnQpLmFnZW50SWQsIGQucGFyZW50VG9vbENhbGxJZCksXG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKGUudHlwZSA9PT0gJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJykge1xuXHRcdFx0Y29uc3QgZCA9IChlIGFzIElTZXNzaW9uRXZlbnRUb29sQ29tcGxldGUpLmRhdGE7XG5cdFx0XHRjb25zdCBpbmZvID0gdG9vbEluZm9CeUNhbGxJZC5nZXQoZC50b29sQ2FsbElkKTtcblx0XHRcdGlmICghaW5mbykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRvb2xJbmZvQnlDYWxsSWQuZGVsZXRlKGQudG9vbENhbGxJZCk7XG5cdFx0XHRjb25zdCBkaXNwbGF5TmFtZSA9IGdldFRvb2xEaXNwbGF5TmFtZShpbmZvLnRvb2xOYW1lKTtcblx0XHRcdGNvbnN0IHRvb2xPdXRwdXQgPSBkLmVycm9yPy5tZXNzYWdlID8/IGQucmVzdWx0Py5jb250ZW50O1xuXHRcdFx0Y29uc3QgY29udGVudDogVG9vbFJlc3VsdENvbnRlbnRbXSA9IFtdO1xuXHRcdFx0aWYgKHRvb2xPdXRwdXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb250ZW50LnB1c2goeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogdG9vbE91dHB1dCB9KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVkaXRzID0gc3RvcmVkRWRpdHM/LmdldChkLnRvb2xDYWxsSWQpO1xuXHRcdFx0aWYgKGVkaXRzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZWRpdCBvZiBlZGl0cykge1xuXHRcdFx0XHRcdGNvbnN0IGJlZm9yZVVyaSA9IGVkaXQua2luZCA9PT0gJ3JlbmFtZScgJiYgZWRpdC5vcmlnaW5hbFBhdGhcblx0XHRcdFx0XHRcdD8gVVJJLmZpbGUoZWRpdC5vcmlnaW5hbFBhdGgpLnRvU3RyaW5nKClcblx0XHRcdFx0XHRcdDogVVJJLmZpbGUoZWRpdC5maWxlUGF0aCkudG9TdHJpbmcoKTtcblx0XHRcdFx0XHRjb25zdCBhZnRlclVyaSA9IFVSSS5maWxlKGVkaXQuZmlsZVBhdGgpLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0Y29uc3QgaGFzQmVmb3JlID0gZWRpdC5raW5kICE9PSAnY3JlYXRlJztcblx0XHRcdFx0XHRjb25zdCBoYXNBZnRlciA9IGVkaXQua2luZCAhPT0gJ2RlbGV0ZSc7XG5cdFx0XHRcdFx0Y29udGVudC5wdXNoKHtcblx0XHRcdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCxcblx0XHRcdFx0XHRcdGJlZm9yZTogaGFzQmVmb3JlID8ge1xuXHRcdFx0XHRcdFx0XHR1cmk6IGJlZm9yZVVyaSxcblx0XHRcdFx0XHRcdFx0Y29udGVudDogeyB1cmk6IGJ1aWxkU2Vzc2lvbkRiVXJpKHNlc3Npb25VcmlTdHIsIGVkaXQudG9vbENhbGxJZCwgZWRpdC5maWxlUGF0aCwgJ2JlZm9yZScpIH0sXG5cdFx0XHRcdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0YWZ0ZXI6IGhhc0FmdGVyID8ge1xuXHRcdFx0XHRcdFx0XHR1cmk6IGFmdGVyVXJpLFxuXHRcdFx0XHRcdFx0XHRjb250ZW50OiB7IHVyaTogYnVpbGRTZXNzaW9uRGJVcmkoc2Vzc2lvblVyaVN0ciwgZWRpdC50b29sQ2FsbElkLCBlZGl0LmZpbGVQYXRoLCAnYWZ0ZXInKSB9LFxuXHRcdFx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGRpZmY6IChlZGl0LmFkZGVkTGluZXMgIT09IHVuZGVmaW5lZCB8fCBlZGl0LnJlbW92ZWRMaW5lcyAhPT0gdW5kZWZpbmVkKVxuXHRcdFx0XHRcdFx0XHQ/IHsgYWRkZWQ6IGVkaXQuYWRkZWRMaW5lcywgcmVtb3ZlZDogZWRpdC5yZW1vdmVkTGluZXMgfVxuXHRcdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRzZXNzaW9uLFxuXHRcdFx0XHR0eXBlOiAndG9vbF9jb21wbGV0ZScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IGQudG9vbENhbGxJZCxcblx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0c3VjY2VzczogZC5zdWNjZXNzLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGdldFBhc3RUZW5zZU1lc3NhZ2UoaW5mby50b29sTmFtZSwgZGlzcGxheU5hbWUsIGluZm8ucGFyYW1ldGVycywgZC5zdWNjZXNzKSxcblx0XHRcdFx0XHRjb250ZW50OiBjb250ZW50Lmxlbmd0aCA+IDAgPyBjb250ZW50IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGVycm9yOiBkLmVycm9yLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpc1VzZXJSZXF1ZXN0ZWQ6IGQuaXNVc2VyUmVxdWVzdGVkLFxuXHRcdFx0XHR0b29sVGVsZW1ldHJ5OiBkLnRvb2xUZWxlbWV0cnkgIT09IHVuZGVmaW5lZCA/IHRyeVN0cmluZ2lmeShkLnRvb2xUZWxlbWV0cnkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwYXJlbnRUb29sQ2FsbElkOiByZXNvbHZlUGFyZW50VG9vbENhbGxJZCgoZSBhcyBJU2Vzc2lvbkV2ZW50VG9vbENvbXBsZXRlKS5hZ2VudElkLCBkLnBhcmVudFRvb2xDYWxsSWQpLFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGlmIChlLnR5cGUgPT09ICdzdWJhZ2VudC5zdGFydGVkJykge1xuXHRcdFx0Y29uc3QgZCA9IChlIGFzIElTZXNzaW9uRXZlbnRTdWJhZ2VudFN0YXJ0ZWQpLmRhdGE7XG5cdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdHNlc3Npb24sXG5cdFx0XHRcdHR5cGU6ICdzdWJhZ2VudF9zdGFydGVkJyxcblx0XHRcdFx0dG9vbENhbGxJZDogZC50b29sQ2FsbElkLFxuXHRcdFx0XHRhZ2VudE5hbWU6IGQuYWdlbnROYW1lLFxuXHRcdFx0XHRhZ2VudERpc3BsYXlOYW1lOiBkLmFnZW50RGlzcGxheU5hbWUsXG5cdFx0XHRcdGFnZW50RGVzY3JpcHRpb246IGQuYWdlbnREZXNjcmlwdGlvbixcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBpZiAoZS50eXBlID09PSAnc2tpbGwuaW52b2tlZCcpIHtcblx0XHRcdGNvbnN0IHNraWxsRXZlbnQgPSBlIGFzIElTZXNzaW9uRXZlbnRTa2lsbEludm9rZWQ7XG5cdFx0XHRjb25zdCBzeW50aCA9IHN5bnRoZXNpemVTa2lsbFRvb2xDYWxsKHNraWxsRXZlbnQuZGF0YSwgc2tpbGxFdmVudC5pZCk7XG5cdFx0XHRyZXN1bHQucHVzaChcblx0XHRcdFx0eyBzZXNzaW9uLCB0eXBlOiAndG9vbF9zdGFydCcsIHRvb2xDYWxsSWQ6IHN5bnRoLnRvb2xDYWxsSWQsIHRvb2xOYW1lOiBzeW50aC50b29sTmFtZSwgZGlzcGxheU5hbWU6IHN5bnRoLmRpc3BsYXlOYW1lLCBpbnZvY2F0aW9uTWVzc2FnZTogc3ludGguaW52b2NhdGlvbk1lc3NhZ2UgfSxcblx0XHRcdFx0eyBzZXNzaW9uLCB0eXBlOiAndG9vbF9jb21wbGV0ZScsIHRvb2xDYWxsSWQ6IHN5bnRoLnRvb2xDYWxsSWQsIHJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiBzeW50aC5wYXN0VGVuc2VNZXNzYWdlIH0gfSxcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDhCQUE4QjtBQUV2QyxTQUFTLGFBQWEsa0JBQWtCLDRCQUE0QixnQkFBZ0IsdUJBQXVCLFdBQVcsK0JBQXVKO0FBQzdRLFNBQVMsc0JBQXNCLHFCQUFxQixrQkFBa0IscUJBQXFCLG9CQUFvQixvQkFBb0IsYUFBYSxZQUFZLGNBQWMsK0JBQStCO0FBQ3pNLFNBQVMseUJBQXlCO0FBbUZsQyxTQUFTLG9CQUFvQixPQUEwRztBQUN0SSxNQUFJLENBQUMsT0FBTztBQUNYLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFDQSxTQUFPO0FBQUEsSUFDTixxQkFBcUIsTUFBTTtBQUFBLElBQzNCLG1CQUFtQixNQUFNO0FBQUEsRUFDMUI7QUFDRDtBQVVPLFNBQVMsc0JBQXNCLFVBQTZDO0FBQ2xGLFFBQU0sUUFBZ0IsQ0FBQztBQUN2QixRQUFNLHdCQUF3QixvQkFBSSxJQUEyQztBQUM3RSxNQUFJO0FBT0osUUFBTSxlQUFlLENBQUMsTUFBdUMsVUFBMkI7QUFDdkYsVUFBTSxLQUFLO0FBQUEsTUFDVixJQUFJLEtBQUs7QUFBQSxNQUNULFNBQVMsS0FBSztBQUFBLE1BQ2QsZUFBZSxLQUFLO0FBQUEsTUFDcEIsT0FBTztBQUFBLE1BQ1A7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBRUEsUUFBTSxZQUFZLENBQUMsSUFBWSxVQUFtRDtBQUFBLElBQ2pGO0FBQUEsSUFDQSxTQUFTLEVBQUUsTUFBTSxRQUFRLEVBQUUsTUFBTSxZQUFZLEtBQUssRUFBRTtBQUFBLElBQ3BELGVBQWUsQ0FBQztB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
