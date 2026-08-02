import { decodeBase64 } from "../../../../../../base/common/buffer.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { escapeMarkdownLinkLabel, MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { escapeIcons } from "../../../../../../base/common/iconLabels.js";
import { marked } from "../../../../../../base/common/marked/marked.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { posix, win32 } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { buildSubagentChatUri, MessageKind, ToolCallCancellationReason, ToolCallContributorKind, ToolCallRiskAssessmentStatus, ToolCallStatus, TurnState, ResponsePartKind, getToolFileEdits, getToolOutputText, getToolSubagentContent, hasReportedUsage, readUsageInfoMeta, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, FileEditKind, ToolResultContentType } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { getToolKind } from "../../../../../../platform/agentHost/common/state/sessionReducers.js";
import { readToolCallMeta } from "../../../../../../platform/agentHost/common/meta/agentToolCallMeta.js";
import { getChatErrorDetailsFromMeta } from "../../../common/chatErrorMessages.js";
import { AGENT_HOST_SCHEME, toAgentHostUri } from "../../../../../../platform/agentHost/common/agentHostUri.js";
import { AgentHostElementAttachmentDisplayKind, getElementAttachmentCorrelationId } from "../../../../../../platform/agentHost/common/meta/agentElementAttachments.js";
import { AgentHostAutoReplyAnswer } from "../../../../../../platform/agentHost/common/agentHostSchema.js";
import { getAgentFeedbackAttachmentMetadata, isAgentFeedbackAnnotationsAttachment, isAgentFeedbackAttachment } from "../../../../../../platform/agentHost/common/meta/agentFeedbackAttachments.js";
import { getBrowserViewAttachmentMetadata, isBrowserViewAttachment } from "../../../../../../platform/agentHost/common/meta/browserViewAttachments.js";
import { isViewUnreviewedCommentsTool, isAddCommentTool } from "../../../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js";
import { isCreateChatTool, isCreateSessionTool, isSendMessageTool, parseOpenSessionLinkChatId, parseOpenSessionLinkUri } from "../../../../../../platform/agentHost/common/openSessionLink.js";
import { parsePartialToolInputForDisplay } from "../../../../../../platform/agentHost/common/partialToolInput.js";
import { MessageAttachmentKind } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { normalizeFileEdit } from "../../../../../../platform/agentHost/common/fileEditDiff.js";
import product from "../../../../../../platform/product/common/product.js";
import { ConfigureAutomationToolReferenceName } from "../../../common/automations/automationService.js";
import { formatCopilotCredits, ElicitationState, ToolConfirmKind, AgentFeedbackReviewCommandId } from "../../../common/chatService/chatService.js";
import { isTerminalCommandPrompt } from "../../../common/chatSessionsService.js";
import { ChatToolInvocation } from "../../../common/model/chatProgressTypes/chatToolInvocation.js";
import { ChatPlanReviewData } from "../../../common/model/chatProgressTypes/chatPlanReviewData.js";
import { ChatQuestionCarouselData } from "../../../common/model/chatProgressTypes/chatQuestionCarouselData.js";
import { AgentHostCompletionReferenceKind, restorePasteVariableEntryFromAttachment, toAgentHostCompletionVariableEntryFromMetadata } from "../../../common/attachments/chatVariableEntries.js";
import { ToolDataSource, ToolInvocationPresentation } from "../../../common/tools/languageModelToolsService.js";
import { basename } from "../../../../../../base/common/resources.js";
import { hasKey } from "../../../../../../base/common/types.js";
import { localize } from "../../../../../../nls.js";
import { isSessionReferenceTrajectoryAttachment, restoreSessionReferenceVariableEntryFromAttachment } from "./agentHostSessionReferenceAttachment.js";
import { restoreChatReferenceVariableEntryFromAttachment } from "./agentHostChatReferenceAttachment.js";
const BOOLEAN_TRUE_OPTION_ID = "true";
const BOOLEAN_FALSE_OPTION_ID = "false";
const agentHostAskUserToolNames = /* @__PURE__ */ new Set(["ask_user", "AskUserQuestion", "request_user_input"]);
function isAgentHostAskUserTool(toolName) {
  return agentHostAskUserToolNames.has(toolName);
}
function shouldHideCompletedAgentHostAskUserTool(toolCall) {
  if (!isAgentHostAskUserTool(toolCall.toolName)) {
    return false;
  }
  if (toolCall.status === ToolCallStatus.Completed) {
    return toolCall.success;
  }
  return toolCall.status === ToolCallStatus.Cancelled && toolCall.reason === ToolCallCancellationReason.Skipped;
}
function makeAhpTerminalToolSessionId(terminalUri, session) {
  return JSON.stringify({ terminal: terminalUri, session: session.toString() });
}
function parseAhpTerminalToolSessionId(id) {
  try {
    const parsed = JSON.parse(id);
    if (typeof parsed?.terminal === "string" && typeof parsed?.session === "string") {
      return parsed;
    }
  } catch {
  }
  return void 0;
}
function convertProtocolAnswer(answer) {
  if (answer.state !== ChatInputAnswerState.Submitted) {
    return void 0;
  }
  switch (answer.value.kind) {
    case ChatInputAnswerValueKind.Text:
      return answer.value.value;
    case ChatInputAnswerValueKind.Number:
    case ChatInputAnswerValueKind.Boolean:
      return String(answer.value.value);
    case ChatInputAnswerValueKind.Selected:
      return {
        selectedValue: answer.value.value,
        freeformValue: answer.value.freeformValues?.[0]
      };
    case ChatInputAnswerValueKind.SelectedMany:
      return {
        selectedValues: answer.value.value,
        freeformValue: answer.value.freeformValues?.[0]
      };
  }
}
function convertProtocolAnswers(raw) {
  if (!raw) {
    return void 0;
  }
  const answers = {};
  for (const [questionId, answer] of Object.entries(raw)) {
    const converted = convertProtocolAnswer(answer);
    if (converted !== void 0) {
      answers[questionId] = converted;
    }
  }
  return Object.keys(answers).length > 0 ? answers : void 0;
}
function containsAutomaticReplyAnswer(raw) {
  return Object.values(raw ?? {}).some(
    (answer) => answer.state === ChatInputAnswerState.Submitted && answer.value.kind === ChatInputAnswerValueKind.Text && answer.value.value === AgentHostAutoReplyAnswer
  );
}
function getPlanReviewAction(planReview, actionId) {
  return actionId ? planReview.actions.find((action) => action.id === actionId) : void 0;
}
function convertProtocolPlanReviewResult(planReview, response, answers) {
  if (response === ChatInputResponseKind.Decline) {
    return { rejected: true };
  }
  if (response !== ChatInputResponseKind.Accept) {
    return void 0;
  }
  const answer = answers?.[planReview.answerQuestionId];
  if (!answer || answer.state === ChatInputAnswerState.Skipped) {
    return void 0;
  }
  const value = answer.value;
  if (value.kind === ChatInputAnswerValueKind.Text) {
    const feedback2 = value.value.trim();
    return feedback2 ? { rejected: false, feedback: feedback2, feedbackOverall: feedback2 } : void 0;
  }
  if (value.kind !== ChatInputAnswerValueKind.Selected) {
    return void 0;
  }
  const action = getPlanReviewAction(planReview, value.value);
  const feedback = value.freeformValues?.find((v) => v.trim().length > 0)?.trim();
  return {
    rejected: false,
    action: action?.label ?? value.value,
    actionId: action?.id ?? value.value,
    ...feedback ? { feedback, feedbackOverall: feedback } : {}
  };
}
function createInputRequestCarousel(inputReq, connectionAuthority) {
  const questions = (inputReq.questions ?? []).map((question) => {
    let title = question.title;
    let message = question.message;
    if (!title) {
      const endOfLine = question.message.indexOf("\n");
      title = endOfLine === -1 ? question.message : question.message.substring(0, endOfLine).trim();
      message = endOfLine === -1 ? "" : question.message.substring(endOfLine + 1).trim();
    }
    const detailedMessage = new MarkdownString(message, { isTrusted: false });
    switch (question.kind) {
      case ChatInputQuestionKind.SingleSelect:
        return {
          id: question.id,
          type: "singleSelect",
          title,
          detailedMessage,
          required: question.required,
          allowFreeformInput: question.allowFreeformInput ?? true,
          options: question.options.map((option) => ({ id: option.id, label: option.label, value: option.id }))
        };
      case ChatInputQuestionKind.MultiSelect:
        return {
          id: question.id,
          type: "multiSelect",
          title,
          detailedMessage,
          required: question.required,
          allowFreeformInput: question.allowFreeformInput ?? true,
          options: question.options.map((option) => ({ id: option.id, label: option.label, value: option.id }))
        };
      case ChatInputQuestionKind.Boolean:
        return {
          id: question.id,
          type: "singleSelect",
          title,
          detailedMessage,
          required: question.required,
          allowFreeformInput: false,
          defaultValue: question.defaultValue === void 0 ? void 0 : String(question.defaultValue),
          options: [
            { id: BOOLEAN_TRUE_OPTION_ID, label: localize("chat.inputRequest.boolean.true", "True"), value: BOOLEAN_TRUE_OPTION_ID },
            { id: BOOLEAN_FALSE_OPTION_ID, label: localize("chat.inputRequest.boolean.false", "False"), value: BOOLEAN_FALSE_OPTION_ID }
          ]
        };
      case ChatInputQuestionKind.Text:
        return {
          id: question.id,
          type: "text",
          title,
          detailedMessage,
          required: question.required,
          defaultValue: question.defaultValue
        };
      default:
        return {
          id: question.id,
          type: "text",
          title,
          detailedMessage,
          required: question.required
        };
    }
  });
  if (questions.length === 0) {
    questions.push({
      id: "answer",
      type: "text",
      title: inputReq.message ?? "",
      required: true
    });
  }
  const carousel = new ChatQuestionCarouselData(
    questions,
    true,
    inputReq.id,
    void 0,
    void 0,
    inputReq.message ? rawMarkdownToString(inputReq.message, connectionAuthority) : void 0
  );
  carousel.answerPresentation = "conversation";
  return carousel;
}
function createInputRequestPlanReview(inputReq, planReview) {
  return new ChatPlanReviewData(
    planReview.title,
    planReview.content,
    planReview.actions.map((action) => ({
      id: action.id,
      label: action.label,
      ...action.description ? { description: action.description } : {},
      ...action.default ? { default: true } : {},
      ...action.permissionLevel ? { permissionLevel: action.permissionLevel } : {}
    })),
    planReview.canProvideFeedback,
    planReview.planUri ? URI.parse(planReview.planUri).toJSON() : void 0,
    inputReq.id
  );
}
function getUrlInputRequestPresentation(inputReq, url) {
  let authority = url;
  try {
    authority = URI.parse(url).authority || url;
  } catch {
  }
  const message = new MarkdownString();
  if (inputReq.message) {
    message.appendText(inputReq.message);
    message.appendMarkdown("\n\n");
  }
  message.appendMarkdown(localize("agentHost.elicit.url.instruction", "Open this URL?"));
  message.appendCodeblock("", url);
  return { authority, message };
}
function inputRequestResponsePartToProgress(part, connectionAuthority) {
  const inputReq = part.request;
  const planReview = inputReq.planReview;
  if (planReview) {
    const review = createInputRequestPlanReview(inputReq, planReview);
    review.data = part.response === void 0 ? void 0 : convertProtocolPlanReviewResult(planReview, part.response, inputReq.answers);
    review.isUsed = true;
    return review;
  }
  if (inputReq.url) {
    const presentation = getUrlInputRequestPresentation(inputReq, inputReq.url);
    return {
      kind: "elicitationSerialized",
      title: localize("agentHost.elicit.url.title", "Authorization Required"),
      message: presentation.message,
      subtitle: "",
      source: void 0,
      state: part.response === ChatInputResponseKind.Accept ? ElicitationState.Accepted : ElicitationState.Rejected,
      isHidden: false
    };
  }
  const carousel = createInputRequestCarousel(inputReq, connectionAuthority);
  const answers = part.response === ChatInputResponseKind.Accept ? convertProtocolAnswers(inputReq.answers) : void 0;
  carousel.data = answers ?? {};
  carousel.isUsed = true;
  carousel.autoReply = containsAutomaticReplyAnswer(inputReq.answers);
  carousel.answeredExternally = part.response === ChatInputResponseKind.Accept && (carousel.autoReply || !answers);
  return carousel;
}
function getSubagentTaskDescription(tc) {
  const v = readToolCallMeta(tc).subagentDescription;
  return v && v.length > 0 ? v : void 0;
}
function getSubagentAgentName(tc) {
  const v = readToolCallMeta(tc).subagentAgentName;
  return v && v.length > 0 ? v : void 0;
}
function getSubagentChatResource(tc, subagentContent, sessionResource) {
  return readToolCallMeta(tc).subagentChatUri ?? subagentContent?.resource ?? buildSubagentChatUri(sessionResource.toString(), tc.toolCallId);
}
function getMcpAppData(tc, _sessionResource) {
  if (tc.contributor?.kind !== ToolCallContributorKind.MCP) {
    return void 0;
  }
  const ui = readToolCallMeta(tc).ui;
  if (!ui) {
    return void 0;
  }
  const resourceUri = ui.resourceUri;
  const channelValue = ui.channel;
  if (channelValue === void 0) {
    return void 0;
  }
  return {
    kind: "agentHost",
    resourceUri,
    serverId: tc.contributor.customizationId,
    channel: channelValue
  };
}
function getToolRawInput(tc) {
  try {
    return tc.status === ToolCallStatus.Streaming || !tc.toolInput ? {} : JSON.parse(tc.toolInput);
  } catch {
    return { input: tc.status === ToolCallStatus.Streaming ? void 0 : tc.toolInput };
  }
}
function buildMcpAppToolInputData(tc, sessionResource, existingRawInput) {
  const mcpAppData = getMcpAppData(tc, sessionResource);
  if (!mcpAppData) {
    return void 0;
  }
  return {
    kind: "input",
    rawInput: existingRawInput ?? getToolRawInput(tc),
    mcpAppData
  };
}
function isSameMcpAppData(a, b) {
  if (a?.kind !== b?.kind || a?.resourceUri !== b?.resourceUri) {
    return false;
  }
  if (a?.kind === "agentHost" && b?.kind === "agentHost") {
    return a.serverId === b.serverId && a.channel === b.channel;
  }
  if (a?.kind === "local" && b?.kind === "local") {
    return a.serverDefinitionId === b.serverDefinitionId && a.collectionId === b.collectionId;
  }
  return a === b;
}
const SUBAGENT_TOOL_NAMES = /* @__PURE__ */ new Set(["task"]);
function isSubagentToolName(toolName) {
  return SUBAGENT_TOOL_NAMES.has(toolName);
}
function systemNotificationToChatPart(content, connectionAuthority) {
  if (!content) {
    return void 0;
  }
  const value = stringOrMarkdownToString(content, connectionAuthority);
  return { kind: "systemNotification", content: typeof value === "string" ? new MarkdownString(value) : value };
}
function isSubagentTool(tc) {
  return getToolKind(tc) === "subagent" || isSubagentToolName(tc.toolName);
}
function getTerminalContentUri(content) {
  return getTerminalContent(content)?.resource;
}
function getTerminalContent(content) {
  return content?.find(isToolResultTerminalContent);
}
function formatTurnResponseDetails(model, billedModelId, usage) {
  if (!model) {
    return void 0;
  }
  const displayName = formatTurnModelName(model, billedModelId);
  const credits = usageInfoToChatUsage(usage)?.copilotCredits;
  if (credits !== void 0) {
    const formatted = formatCopilotCredits(credits);
    const creditDetails = formatted === "1" ? localize("agentHost.responseDetails.credit", "{0} credit", formatted) : localize("agentHost.responseDetails.credits", "{0} credits", formatted);
    return [displayName, creditDetails].join(" \u2022 ");
  }
  return [displayName, model.pricing].filter(Boolean).join(" \xB7 ");
}
function usageInfoToAutoModeResolution(usage, resolvedModelName) {
  const resolution = readUsageInfoMeta(usage).autoModeResolved;
  if (!resolution || typeof resolution.confidence !== "number" || !Number.isFinite(resolution.confidence)) {
    return void 0;
  }
  const predictedLabel = resolution.predictedLabel;
  if (predictedLabel !== "needs_reasoning" && predictedLabel !== "no_reasoning" && predictedLabel !== "fallback") {
    return void 0;
  }
  return {
    kind: "autoModeResolution",
    resolvedModel: resolution.chosenModel,
    resolvedModelName: resolvedModelName ?? resolution.chosenModel,
    predictedLabel,
    confidence: Math.max(0, Math.min(1, resolution.confidence))
  };
}
function formatTurnModelName(model, billedModelId) {
  if (billedModelId) {
    return localize("agentHost.responseDetails.resolvedModel", "{0} ({1})", model.name, billedModelId);
  }
  return model.name;
}
function usageInfoToChatUsage(usage) {
  if (!hasReportedUsage(usage)) {
    return void 0;
  }
  return {
    kind: "usage",
    promptTokens: usage?.inputTokens ?? 0,
    completionTokens: usage?.outputTokens ?? 0,
    copilotCredits: getCopilotCredits(usage),
    sessionCopilotCredits: getSessionCopilotCredits(usage),
    promptTokenDetails: contextAttributionToPromptTokenDetails(usage)
  };
}
function getSessionCopilotCredits(usage) {
  const sessionTotalNanoAiu = readUsageInfoMeta(usage).copilotUsage?.sessionTotalNanoAiu;
  return typeof sessionTotalNanoAiu === "number" && sessionTotalNanoAiu >= 0 ? sessionTotalNanoAiu / 1e9 : void 0;
}
function getCopilotCredits(usage) {
  const meta = readUsageInfoMeta(usage);
  const totalNanoAiu = meta?.copilotUsage?.totalNanoAiu;
  if (typeof totalNanoAiu === "number" && totalNanoAiu >= 0) {
    return totalNanoAiu / 1e9;
  }
  const cost = meta?.cost;
  return typeof cost === "number" && cost >= 0 ? cost : void 0;
}
function kindToCategory(kind) {
  switch (kind) {
    case "system":
    case "toolDefinition":
      return localize("contextAttribution.category.system", "System");
    case "tool":
    case "skill":
    case "subagent":
    case "mcpServer":
    case "plugin":
      return localize("contextAttribution.category.userContext", "User Context");
    default:
      return localize("contextAttribution.category.userContext", "User Context");
  }
}
function kindToAggregateLabel(kind) {
  switch (kind) {
    case "tool":
      return localize("contextAttribution.label.toolResults", "Tool Results");
    case "toolDefinition":
      return localize("contextAttribution.label.toolDefinitions", "Tool Definitions");
    case "skill":
      return localize("contextAttribution.label.skills", "Skills");
    case "subagent":
      return localize("contextAttribution.label.subAgents", "Sub-agents");
    case "mcpServer":
      return localize("contextAttribution.label.mcpTools", "MCP Tools");
    case "plugin":
      return localize("contextAttribution.label.plugins", "Plugins");
    default:
      return kind;
  }
}
function contextAttributionToPromptTokenDetails(usage) {
  const meta = readUsageInfoMeta(usage);
  const attribution = meta?.contextAttribution;
  if (!attribution || attribution.totalTokens <= 0 || attribution.entries.length === 0) {
    return void 0;
  }
  const details = [];
  const parentIds = /* @__PURE__ */ new Set();
  for (const entry of attribution.entries) {
    if (entry.parentId) {
      parentIds.add(entry.parentId);
    }
  }
  const kindTokens = /* @__PURE__ */ new Map();
  let accountedTokens = 0;
  for (const entry of attribution.entries) {
    if (entry.kind === "system") {
      if (parentIds.has(entry.id)) {
        continue;
      }
      accountedTokens += entry.tokens;
      const percentageOfPrompt = Math.round(entry.tokens / attribution.totalTokens * 100);
      if (percentageOfPrompt > 0) {
        details.push({
          category: kindToCategory("system"),
          label: entry.label,
          percentageOfPrompt
        });
      }
    } else {
      kindTokens.set(entry.kind, (kindTokens.get(entry.kind) ?? 0) + entry.tokens);
    }
  }
  for (const [kind, tokens] of kindTokens) {
    accountedTokens += tokens;
    const percentageOfPrompt = Math.round(tokens / attribution.totalTokens * 100);
    if (percentageOfPrompt <= 0) {
      continue;
    }
    const category = kindToCategory(kind);
    const label = kindToAggregateLabel(kind);
    details.push({ category, label, percentageOfPrompt });
  }
  const messageTokens = Math.max(0, attribution.totalTokens - accountedTokens);
  if (messageTokens > 0) {
    const percentageOfPrompt = Math.round(messageTokens / attribution.totalTokens * 100);
    if (percentageOfPrompt > 0) {
      details.push({
        category: localize("contextAttribution.category.userContext", "User Context"),
        label: localize("contextAttribution.label.messages", "Messages"),
        percentageOfPrompt
      });
    }
  }
  return details.length > 0 ? details : void 0;
}
function mapAccountQuotaSnapshot(snapshot) {
  const unlimited = snapshot.isUnlimitedEntitlement ?? false;
  const entitlement = typeof snapshot.entitlementRequests === "number" ? snapshot.entitlementRequests : void 0;
  if (!unlimited && entitlement === 0) {
    return void 0;
  }
  if (typeof snapshot.remainingPercentage !== "number") {
    return void 0;
  }
  const used = typeof snapshot.usedRequests === "number" ? snapshot.usedRequests : void 0;
  const resetAt = snapshot.resetDate ? Date.parse(snapshot.resetDate) : NaN;
  return {
    percentRemaining: Math.min(100, Math.max(0, snapshot.remainingPercentage)),
    unlimited,
    entitlement: !unlimited && entitlement !== void 0 && entitlement >= 0 ? entitlement : void 0,
    quotaRemaining: !unlimited && entitlement !== void 0 && used !== void 0 ? Math.max(0, entitlement - used) : void 0,
    resetAt: Number.isFinite(resetAt) ? resetAt : void 0
  };
}
function usageInfoToQuotas(usage) {
  const meta = readUsageInfoMeta(usage);
  const snapshots = meta?.quotaSnapshots;
  if (!snapshots) {
    return void 0;
  }
  const update = {};
  let hasAny = false;
  const chat = snapshots["chat"] && mapAccountQuotaSnapshot(snapshots["chat"]);
  if (chat) {
    update.chat = chat;
    hasAny = true;
  }
  const completions = snapshots["completions"] && mapAccountQuotaSnapshot(snapshots["completions"]);
  if (completions) {
    update.completions = completions;
    hasAny = true;
  }
  const premiumRaw = snapshots["premium_interactions"];
  const premiumChat = premiumRaw && mapAccountQuotaSnapshot(premiumRaw);
  if (premiumChat) {
    update.premiumChat = premiumChat;
    hasAny = true;
  }
  if (premiumRaw) {
    update.additionalUsageEnabled = premiumRaw.overageAllowedWithExhaustedQuota ?? false;
    update.additionalUsageCount = typeof premiumRaw.overage === "number" ? premiumRaw.overage : 0;
    hasAny = true;
  }
  const resetDate = premiumRaw?.resetDate ?? snapshots["chat"]?.resetDate;
  if (resetDate) {
    update.resetDate = resetDate;
  }
  return hasAny ? update : void 0;
}
function turnsToHistory(backendSession, turns, participantId, connectionAuthority, lookup, errorContext, terminalCommandPrefix) {
  const history = [];
  for (const turn of turns) {
    const rawModelId = turn.usage?.model;
    const modelId = lookup?.toLanguageModelId(rawModelId);
    const details = lookup?.toResponseDetails(rawModelId, turn.usage);
    const variableData = messageToVariableData(turn.message, connectionAuthority);
    const isSystemInitiated = turn.message.origin.kind === MessageKind.SystemNotification;
    const isTerminalRequest = isTerminalCommandPrompt(turn.message.text, terminalCommandPrefix);
    history.push({
      id: turn.id,
      type: "request",
      prompt: turn.message.text,
      participant: participantId,
      modelId,
      ...turn.startedAt !== void 0 && Number.isFinite(Date.parse(turn.startedAt)) ? { timestamp: Date.parse(turn.startedAt) } : {},
      variableData,
      ...isSystemInitiated ? {
        isSystemInitiated: true
      } : {},
      ...isTerminalRequest ? {
        isTerminalRequest: true
      } : {}
    });
    const parts = [];
    const autoModeResolution = lookup?.toAutoModeResolution?.(turn.usage);
    if (autoModeResolution) {
      parts.push(autoModeResolution);
    }
    const usage = usageInfoToChatUsage(turn.usage);
    if (usage) {
      parts.push(usage);
    }
    for (const rp of turn.responseParts) {
      switch (rp.kind) {
        case ResponsePartKind.Markdown:
          if (rp.content) {
            parts.push({ kind: "markdownContent", content: new MarkdownString(rp.content) });
          }
          break;
        case ResponsePartKind.ToolCall: {
          const tc = rp.toolCall;
          const fileEditParts = completedToolCallToEditParts(tc, connectionAuthority);
          const serialized = completedToolCallToSerialized(tc, void 0, backendSession, connectionAuthority);
          if (fileEditParts.length > 0) {
            serialized.presentation = ToolInvocationPresentation.Hidden;
          }
          parts.push(serialized);
          parts.push(...fileEditParts);
          break;
        }
        case ResponsePartKind.Reasoning:
          if (rp.content) {
            parts.push({ kind: "thinking", value: rp.content, id: rp.id });
          }
          break;
        case ResponsePartKind.SystemNotification:
          {
            const progress = systemNotificationToChatPart(rp.content, connectionAuthority);
            if (progress) {
              parts.push(progress);
            }
          }
          break;
        case ResponsePartKind.ContentRef:
          break;
        case ResponsePartKind.InputRequest: {
          parts.push(inputRequestResponsePartToProgress(rp, connectionAuthority));
          break;
        }
      }
    }
    let errorDetails;
    if (turn.state === TurnState.Error && turn.error) {
      errorDetails = getChatErrorDetailsFromMeta(turn.error, errorContext) ?? { message: `Error: (${turn.error.errorType}) ${turn.error.message}` };
    }
    const startedAt = turn.startedAt === void 0 ? void 0 : Date.parse(turn.startedAt);
    const completedAt = startedAt !== void 0 && Number.isFinite(startedAt) && typeof turn.duration === "number" && Number.isFinite(turn.duration) && turn.duration >= 0 ? startedAt + turn.duration : void 0;
    history.push({ type: "response", parts, participant: participantId, details, elapsedMs: turn.duration, completedAt, ...errorDetails ? { errorDetails } : {} });
  }
  return history;
}
function messageToVariableData(message, connectionAuthority) {
  return messageAttachmentsToVariableData(message.attachments, connectionAuthority, message.text);
}
function messageAttachmentsToVariableData(attachments, connectionAuthority, messageText) {
  if (!attachments?.length) {
    return void 0;
  }
  const variables = [];
  const aggregatedFeedback = aggregateAgentFeedbackAnnotationAttachments(attachments, connectionAuthority);
  if (aggregatedFeedback) {
    variables.push(aggregatedFeedback);
  }
  const consumedAttachments = /* @__PURE__ */ new Set();
  for (const a of attachments) {
    if (isAgentFeedbackAnnotationsAttachment(a) || consumedAttachments.has(a)) {
      continue;
    }
    const element = restoreElementVariableEntry(a, a.type === MessageAttachmentKind.Simple ? a.modelRepresentation : void 0);
    if (element) {
      const correlationId = getElementAttachmentCorrelationId(a);
      const imageAttachment = correlationId ? attachments.find((candidate) => candidate.displayKind === "image" && getElementAttachmentCorrelationId(candidate) === correlationId) : void 0;
      const image = imageAttachment ? messageAttachmentToVariableEntry(imageAttachment, connectionAuthority) : void 0;
      if (imageAttachment && image?.kind === "image") {
        consumedAttachments.add(imageAttachment);
      }
      variables.push(image?.kind === "image" ? { ...element, imageData: image.value instanceof Uint8Array || URI.isUri(image.value) ? image.value : void 0, imageMimeType: image.mimeType } : element);
      continue;
    }
    const v = messageAttachmentToVariableEntry(a, connectionAuthority, messageText);
    if (v) {
      variables.push(v);
    }
  }
  return variables.length > 0 ? { variables } : void 0;
}
function aggregateAgentFeedbackAnnotationAttachments(attachments, connectionAuthority) {
  const feedbackAttachments = attachments.filter(isAgentFeedbackAnnotationsAttachment);
  if (feedbackAttachments.length === 0) {
    return void 0;
  }
  let sessionResource;
  let annotationsResource;
  const feedbackItems = [];
  for (const attachment of feedbackAttachments) {
    annotationsResource ??= attachment.resource;
    const metadata = getAgentFeedbackAttachmentMetadata(attachment);
    if (!metadata) {
      continue;
    }
    sessionResource ??= metadata.sessionResource;
    for (const item of metadata.feedbackItems) {
      feedbackItems.push({
        id: item.id,
        text: item.text,
        resourceUri: toAgentHostUri(URI.parse(item.resourceUri), connectionAuthority),
        range: textRangeToIRange(item.range),
        ...item.replies?.length ? { replies: item.replies } : {}
      });
    }
  }
  if (feedbackItems.length === 0 || !sessionResource) {
    return void 0;
  }
  return {
    kind: "agentFeedback",
    id: generateUuid(),
    name: feedbackItems.length === 1 ? localize("agentFeedback.one", "1 comment") : localize("agentFeedback.many", "{0} comments", feedbackItems.length),
    value: feedbackAttachments[0].label,
    sessionResource: URI.parse(sessionResource),
    annotationsResource: annotationsResource ? URI.parse(annotationsResource) : void 0,
    feedbackItems
  };
}
function messageAttachmentToVariableEntry(attachment, connectionAuthority, messageText) {
  if (isAgentFeedbackAttachment(attachment)) {
    const metadata = getAgentFeedbackAttachmentMetadata(attachment);
    if (metadata) {
      return {
        kind: "agentFeedback",
        id: generateUuid(),
        name: attachment.label,
        value: attachment.modelRepresentation || attachment.label,
        sessionResource: URI.parse(metadata.sessionResource),
        feedbackItems: metadata.feedbackItems.map((item) => ({
          id: item.id,
          text: item.text,
          resourceUri: toAgentHostUri(URI.parse(item.resourceUri), connectionAuthority),
          range: textRangeToIRange(item.range)
        })),
        _meta: attachment._meta
      };
    }
  }
  if (attachment.type === MessageAttachmentKind.Resource) {
    if (isSessionReferenceTrajectoryAttachment(attachment)) {
      return void 0;
    }
    const uri = toAgentHostUri(URI.parse(attachment.uri), connectionAuthority);
    const name = attachment.label;
    const id = uri.toString() + (attachment.selection ? `:${attachment.selection.range.start.line}-${attachment.selection.range.end.line}` : "");
    const _meta = attachment._meta;
    if (attachment.displayKind === "directory") {
      return { kind: "directory", id, name, value: uri, _meta };
    }
    if (attachment.displayKind === "image") {
      return {
        kind: "image",
        id,
        name,
        value: uri,
        isURL: true,
        references: [{ kind: "reference", reference: uri }],
        _meta
      };
    }
    if (attachment.selection) {
      return {
        kind: "file",
        id,
        name,
        value: { uri, range: textRangeToIRange(attachment.selection.range) },
        _meta
      };
    }
    return { kind: "file", id, name, value: uri, _meta };
  }
  if (attachment.type === MessageAttachmentKind.EmbeddedResource) {
    if (!attachment.contentType.startsWith("image/")) {
      return {
        kind: "generic",
        id: generateUuid(),
        name: attachment.label,
        value: decodeBase64(attachment.data).buffer,
        _meta: attachment._meta
      };
    }
    return {
      kind: "image",
      id: generateUuid(),
      name: attachment.label || "image",
      value: decodeBase64(attachment.data).buffer,
      mimeType: attachment.contentType,
      isURL: false,
      _meta: attachment._meta
    };
  }
  if (attachment.type === MessageAttachmentKind.Chat) {
    return restoreChatReferenceVariableEntryFromAttachment(attachment, messageText);
  }
  const agentHostCompletionKind = getAgentHostCompletionKind(attachment);
  if (agentHostCompletionKind !== void 0) {
    return toAgentHostCompletionVariableEntryFromMetadata(agentHostCompletionKind, attachment.label, attachment._meta);
  }
  const modelRepresentation = attachment.type === MessageAttachmentKind.Simple ? attachment.modelRepresentation : void 0;
  if (isBrowserViewAttachment(attachment) && modelRepresentation !== void 0) {
    const metadata = getBrowserViewAttachmentMetadata(attachment);
    if (metadata) {
      return {
        kind: "browserView",
        id: metadata.browserUri,
        name: attachment.label,
        value: URI.parse(metadata.browserUri),
        browserId: metadata.browserId,
        modelDescription: modelRepresentation,
        _meta: attachment._meta
      };
    }
  }
  if (attachment.displayKind === "workspace" && modelRepresentation !== void 0) {
    return {
      kind: "workspace",
      id: attachment.label,
      name: attachment.label,
      value: modelRepresentation,
      _meta: attachment._meta
    };
  }
  if (attachment.type === MessageAttachmentKind.Simple) {
    const sessionReferenceEntry = restoreSessionReferenceVariableEntryFromAttachment(attachment);
    if (sessionReferenceEntry) {
      return sessionReferenceEntry;
    }
  }
  const pasteEntry = restorePasteVariableEntryFromAttachment({
    label: attachment.label,
    displayKind: attachment.displayKind,
    modelRepresentation,
    _meta: attachment._meta
  });
  if (pasteEntry) {
    return pasteEntry;
  }
  return {
    kind: "generic",
    id: generateUuid(),
    name: attachment.label,
    value: modelRepresentation || attachment.label,
    _meta: attachment._meta
  };
}
function restoreElementVariableEntry(attachment, modelRepresentation) {
  if (attachment.displayKind !== AgentHostElementAttachmentDisplayKind || modelRepresentation === void 0) {
    return void 0;
  }
  const fullName = /^Element:\s*(?<name>.+)$/m.exec(modelRepresentation)?.groups?.name;
  return {
    kind: "element",
    id: generateUuid(),
    name: attachment.label,
    ...fullName ? { fullName } : {},
    icon: Codicon.layout,
    value: modelRepresentation,
    _meta: attachment._meta
  };
}
function getAgentHostCompletionKind(attachment) {
  if (attachment.type !== MessageAttachmentKind.Simple) {
    return void 0;
  }
  switch (attachment.displayKind) {
    case "command":
      return AgentHostCompletionReferenceKind.Command;
    case "skill":
      return AgentHostCompletionReferenceKind.Skill;
  }
  return void 0;
}
function textRangeToIRange(range) {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1
  };
}
function activeTurnToProgress(sessionResource, activeTurn, connectionAuthority, mcpServerAuthority = sessionResource.authority, toolInvocationOptions) {
  const parts = [];
  const usage = usageInfoToChatUsage(activeTurn.usage);
  if (usage) {
    parts.push(usage);
  }
  for (const rp of activeTurn.responseParts) {
    switch (rp.kind) {
      case ResponsePartKind.Markdown:
        if (rp.content) {
          parts.push({ kind: "markdownContent", content: new MarkdownString(rp.content) });
        }
        break;
      case ResponsePartKind.Reasoning:
        if (rp.content) {
          parts.push({ kind: "thinking", value: rp.content, id: rp.id });
        }
        break;
      case ResponsePartKind.ToolCall: {
        const tc = rp.toolCall;
        const isOtherClientToolCall = tc.contributor?.kind === ToolCallContributorKind.Client && toolInvocationOptions && tc.contributor.clientId !== toolInvocationOptions.currentClientId;
        if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) {
          parts.push(completedToolCallToSerialized(tc, void 0, sessionResource, connectionAuthority));
        } else if (tc.status === ToolCallStatus.Streaming && !isOtherClientToolCall) {
          parts.push(toolCallStateToStreamingInvocation(tc, void 0, sessionResource, connectionAuthority, mcpServerAuthority));
        } else if (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.AuthRequired || tc.status === ToolCallStatus.Streaming || tc.status === ToolCallStatus.PendingConfirmation) {
          parts.push(toolCallStateToInvocation(tc, void 0, sessionResource, connectionAuthority, mcpServerAuthority, toolInvocationOptions));
        }
        break;
      }
      case ResponsePartKind.SystemNotification:
        {
          const progress = systemNotificationToChatPart(rp.content, connectionAuthority);
          if (progress) {
            parts.push(progress);
          }
        }
        break;
      case ResponsePartKind.ContentRef:
        break;
    }
  }
  return parts;
}
function getTerminalInput(tc) {
  if (tc.status !== ToolCallStatus.Streaming && tc.toolInput) {
    try {
      return JSON.parse(tc.toolInput).command || tc.toolInput;
    } catch {
      return tc.toolInput;
    }
  }
  return void 0;
}
function getTerminalOutput(tc) {
  if (tc.status !== ToolCallStatus.Completed && tc.status !== ToolCallStatus.Running) {
    return void 0;
  }
  const terminalContent = getTerminalContent(tc.content);
  const terminalResult = getTerminalCommandResult(tc);
  let text = terminalResult?.preview;
  const hasRetainedNonPtySnapshot = terminalContent?.isPty === false && text !== void 0;
  if (text === void 0 && terminalContent?.isPty !== false) {
    const fallbackText = tc.content?.find(isToolResultTextContent)?.text;
    text = fallbackText === void 0 ? void 0 : stripLegacyTerminalExitMarkers(fallbackText);
  }
  if (text === void 0 || !text && !hasRetainedNonPtySnapshot && terminalResult?.truncated !== true) {
    return void 0;
  }
  return {
    text: text.replace(/\r?\n/g, "\r\n"),
    ...terminalResult?.truncated !== void 0 ? { truncated: terminalResult.truncated } : {}
  };
}
function stripLegacyTerminalExitMarkers(text) {
  return text.replace(/<shellId:[^>\r\n]*completed with exit code \d+>\s*$/i, "");
}
function isToolResultTextContent(content) {
  return content.type === ToolResultContentType.Text;
}
function getTerminalCommandState(tc, fallbackSuccess) {
  const terminalResult = tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Running ? getTerminalCommandResult(tc) : void 0;
  if (terminalResult?.exitCode !== void 0) {
    return { exitCode: terminalResult.exitCode };
  }
  if ((tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Running) && getTerminalContent(tc.content)?.isPty === false) {
    return fallbackSuccess === false ? { exitCode: 1 } : void 0;
  }
  return fallbackSuccess === void 0 ? void 0 : { exitCode: fallbackSuccess ? 0 : 1 };
}
function isToolResultTerminalContent(content) {
  return content.type === ToolResultContentType.Terminal;
}
function getTerminalCommandResult(tc) {
  const result = tc.content?.find(isToolResultTerminalContent)?.result;
  if (result) {
    return result;
  }
  return tc.content?.find((c) => c.type === "terminalComplete");
}
function getTerminalLanguage(tc) {
  return tc.toolName === "powershell" ? "powershell" : "shellscript";
}
function isTerminalToolCall(tc, existingKind) {
  if (existingKind === "terminal") {
    return true;
  }
  if (getToolKind(tc) === "terminal" && getTerminalInput(tc) !== void 0) {
    return true;
  }
  if (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed) {
    return !!getTerminalContentUri(tc.content);
  }
  return false;
}
function buildTerminalToolSpecificData(tc, sessionResource, existing) {
  const terminalContent = tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed ? getTerminalContent(tc.content) : void 0;
  const terminalContentUri = terminalContent?.resource;
  const nextCommand = getTerminalInput(tc);
  const commandLine = nextCommand ? { ...existing?.commandLine, original: nextCommand } : existing?.commandLine ?? { original: "" };
  const nextOutput = getTerminalOutput(tc);
  return {
    ...existing,
    kind: "terminal",
    commandLine,
    intention: tc.intention ?? existing?.intention,
    language: existing?.language ?? getTerminalLanguage(tc),
    autoApproveRuleResolvable: readToolCallMeta(tc).autoApproveRuleResolvable ?? existing?.autoApproveRuleResolvable,
    terminalToolSessionId: terminalContentUri ? makeAhpTerminalToolSessionId(terminalContentUri, sessionResource) : existing?.terminalToolSessionId,
    terminalCommandUri: terminalContentUri ? URI.parse(terminalContentUri) : existing?.terminalCommandUri,
    isPty: terminalContent?.isPty ?? existing?.isPty,
    terminalCommandOutput: nextOutput ?? existing?.terminalCommandOutput
  };
}
function getToolInputOutputDetails(tc, isError, errorString, includeMcpOutput, connectionAuthority) {
  const toolInput = tc.status === ToolCallStatus.Streaming ? void 0 : tc.toolInput;
  if (!toolInput) {
    return void 0;
  }
  const output = [];
  if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Running) {
    for (const block of tc.content ?? []) {
      switch (block.type) {
        case ToolResultContentType.Text:
          output.push({ type: "embed", value: block.text, isText: true, mimeType: "text/plain" });
          break;
        case ToolResultContentType.EmbeddedResource:
          output.push({ type: "embed", value: block.data, mimeType: block.contentType });
          break;
        case ToolResultContentType.Resource:
          output.push({ type: "ref", uri: wrapResourceUri(block.uri, connectionAuthority), mimeType: block.contentType });
          break;
      }
    }
  }
  if (output.length === 0 && errorString) {
    output.push({ type: "embed", value: errorString, isText: true, mimeType: "text/plain" });
  }
  return {
    input: toolInput,
    inputLanguage: "json",
    output,
    isError,
    mcpOutput: includeMcpOutput ? toMcpCallToolResult(tc, isError, connectionAuthority) : void 0
  };
}
function toMcpCallToolResult(tc, isError, connectionAuthority) {
  if (tc.status !== ToolCallStatus.Completed && tc.status !== ToolCallStatus.Running) {
    return void 0;
  }
  const content = [];
  for (const block of tc.content ?? []) {
    const mcpBlock = toMcpContentBlock(block, connectionAuthority);
    if (mcpBlock) {
      content.push(mcpBlock);
    }
  }
  if (content.length === 0 && !isError) {
    return void 0;
  }
  return { content, isError: isError || void 0 };
}
function toMcpContentBlock(block, connectionAuthority) {
  switch (block.type) {
    case ToolResultContentType.Text:
      return { type: "text", text: block.text };
    case ToolResultContentType.EmbeddedResource: {
      if (block.contentType.startsWith("image/")) {
        return { type: "image", data: block.data, mimeType: block.contentType };
      }
      if (block.contentType.startsWith("audio/")) {
        return { type: "audio", data: block.data, mimeType: block.contentType };
      }
      return {
        type: "resource",
        resource: {
          uri: `data:${block.contentType};base64,${block.data}`,
          mimeType: block.contentType,
          blob: block.data
        }
      };
    }
    case ToolResultContentType.Resource: {
      const wrapped = wrapResourceUri(block.uri, connectionAuthority);
      return {
        type: "resource_link",
        name: basename(wrapped) || wrapped.toString(),
        uri: wrapped.toString(),
        mimeType: block.contentType
      };
    }
    default:
      return void 0;
  }
}
function wrapResourceUri(uri, connectionAuthority) {
  return toAgentHostUri(URI.parse(uri), connectionAuthority);
}
function getToolErrorString(tc) {
  if (tc.status === ToolCallStatus.Completed) {
    return tc.error?.message;
  }
  if (tc.status === ToolCallStatus.Cancelled) {
    return typeof tc.reasonMessage === "string" ? tc.reasonMessage : tc.reasonMessage?.markdown;
  }
  return void 0;
}
function buildSessionCreatedToolData(tc) {
  if (tc.status !== ToolCallStatus.Completed || !tc.success) {
    return void 0;
  }
  const isSend = isSendMessageTool(tc.toolName);
  if (!isCreateSessionTool(tc.toolName) && !isCreateChatTool(tc.toolName) && !isSend) {
    return void 0;
  }
  const output = getToolOutputText(tc);
  const match = output?.match(/agent-host-session:\/\/[^\s)<>;"']+/);
  const openLink = match?.[0];
  const backend = openLink ? parseOpenSessionLinkUri(openLink) : void 0;
  if (!openLink || !backend) {
    return void 0;
  }
  const isChat = isCreateChatTool(tc.toolName) || isSend && !!parseOpenSessionLinkChatId(openLink);
  const label = createSessionTitleFromArgs(tc.toolInput) ?? (backend.path.replace(/^\//, "") || backend.toString());
  return { kind: "sessionCreated", openLink, label, isChat };
}
function buildAutomationConfiguredToolData(tc) {
  if (tc.status !== ToolCallStatus.Completed || !tc.success || tc.toolName !== ConfigureAutomationToolReferenceName) {
    return void 0;
  }
  const output = getToolOutputText(tc);
  if (!output) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(output);
    const operation = parsed.status === "created" || parsed.status === "updated" ? parsed.status : void 0;
    if (!operation || typeof parsed.automation?.id !== "string" || typeof parsed.automation.name !== "string") {
      return void 0;
    }
    return {
      kind: "automationConfigured",
      automationId: parsed.automation.id,
      automationName: parsed.automation.name,
      operation
    };
  } catch {
    return void 0;
  }
}
function createSessionTitleFromArgs(toolInput) {
  if (!toolInput) {
    return void 0;
  }
  try {
    const args = JSON.parse(toolInput);
    const text = typeof args.prompt === "string" ? args.prompt : typeof args.message === "string" ? args.message : void 0;
    if (text === void 0) {
      return void 0;
    }
    const firstLine = text.trim().split("\n")[0].trim();
    if (!firstLine) {
      return void 0;
    }
    return firstLine.length > 60 ? `${firstLine.slice(0, 57)}\u2026` : firstLine;
  } catch {
    return void 0;
  }
}
function completedToolCallConfirmedReason(tc) {
  if (tc.status === ToolCallStatus.Completed) {
    return { type: ToolConfirmKind.ConfirmationNotNeeded };
  }
  return { type: tc.reason === ToolCallCancellationReason.Skipped ? ToolConfirmKind.Skipped : ToolConfirmKind.Denied };
}
function completedToolCallToSerialized(tc, subAgentInvocationId, sessionResource, connectionAuthority) {
  const isTerminal = isTerminalToolCall(tc);
  const isSuccess = tc.status === ToolCallStatus.Completed && tc.success;
  let invocationMsg = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? tc.displayName;
  const subagentContent = tc.status === ToolCallStatus.Completed ? getToolSubagentContent(tc) : void 0;
  const isSubagent = subagentContent || isSubagentTool(tc);
  if (isSubagent && tc.status === ToolCallStatus.Completed) {
    const resultText = getToolOutputText(tc);
    const pastTenseMsg2 = isSuccess ? stringOrMarkdownToString(tc.pastTenseMessage, connectionAuthority) ?? invocationMsg : invocationMsg;
    return {
      kind: "toolInvocationSerialized",
      toolCallId: tc.toolCallId,
      toolId: tc.toolName,
      source: ToolDataSource.Internal,
      invocationMessage: invocationMsg,
      originMessage: void 0,
      pastTenseMessage: pastTenseMsg2,
      isConfirmed: completedToolCallConfirmedReason(tc),
      isComplete: true,
      presentation: void 0,
      subAgentInvocationId,
      toolSpecificData: {
        kind: "subagent",
        description: getSubagentTaskDescription(tc) ?? tc.displayName,
        agentName: subagentContent?.agentName ?? getSubagentAgentName(tc),
        result: resultText,
        chatResource: getSubagentChatResource(tc, subagentContent, sessionResource)
      }
    };
  }
  let toolSpecificData;
  if (isTerminal) {
    toolSpecificData = {
      ...buildTerminalToolSpecificData(tc, sessionResource),
      terminalCommandState: getTerminalCommandState(tc, isSuccess)
    };
  } else if (getToolKind(tc) === "search") {
    toolSpecificData = { kind: "search" };
  } else {
    toolSpecificData = buildSessionCreatedToolData(tc) ?? buildAutomationConfiguredToolData(tc);
    if (!toolSpecificData) {
      toolSpecificData = buildMcpAppToolInputData(tc, sessionResource);
    }
  }
  let pastTenseMsg = isSuccess ? stringOrMarkdownToString(tc.pastTenseMessage, connectionAuthority) ?? invocationMsg : invocationMsg;
  if (isAddCommentTool(tc.toolName)) {
    const ref = addCommentReference(tc);
    if (ref) {
      invocationMsg = ref;
      pastTenseMsg = ref;
    }
  }
  const resultDetails = (!toolSpecificData || toolSpecificData.kind === "input" && toolSpecificData.mcpAppData) && (tc.status !== ToolCallStatus.Completed || getToolFileEdits(tc).length === 0) ? getToolInputOutputDetails(tc, !isSuccess, getToolErrorString(tc), !!(toolSpecificData?.kind === "input" && toolSpecificData.mcpAppData), connectionAuthority) : void 0;
  return {
    kind: "toolInvocationSerialized",
    toolCallId: tc.toolCallId,
    toolId: tc.toolName,
    source: ToolDataSource.Internal,
    invocationMessage: invocationMsg,
    originMessage: void 0,
    pastTenseMessage: isTerminal ? void 0 : pastTenseMsg,
    isConfirmed: completedToolCallConfirmedReason(tc),
    isComplete: true,
    presentation: shouldHideCompletedAgentHostAskUserTool(tc) ? ToolInvocationPresentation.HiddenAfterComplete : void 0,
    subAgentInvocationId,
    toolSpecificData,
    resultDetails
  };
}
function completedToolCallToEditParts(tc, connectionAuthority) {
  if (tc.status !== ToolCallStatus.Completed) {
    return [];
  }
  const fileEdits = getToolFileEdits(tc);
  if (fileEdits.length === 0) {
    return [];
  }
  const parts = [];
  for (const edit of fileEdits) {
    const part = fileEditToExternalEdit(edit, tc.toolCallId, connectionAuthority);
    if (part) {
      parts.push(part);
    }
  }
  return parts;
}
function fileEditToExternalEdit(edit, undoStopId, connectionAuthority) {
  const normalized = normalizeFileEdit(edit);
  if (!normalized) {
    return void 0;
  }
  const diff = edit.diff && (edit.diff.added !== void 0 || edit.diff.removed !== void 0) ? { added: edit.diff.added ?? 0, removed: edit.diff.removed ?? 0 } : void 0;
  return {
    kind: "externalEdit",
    uri: toAgentHostUri(normalized.resource, connectionAuthority),
    editKind: normalized.kind,
    originalUri: normalized.kind === FileEditKind.Rename && normalized.beforeUri ? toAgentHostUri(normalized.beforeUri, connectionAuthority) : void 0,
    beforeContentUri: normalized.beforeContentUri ? toAgentHostUri(normalized.beforeContentUri, connectionAuthority) : void 0,
    afterContentUri: normalized.afterContentUri ? toAgentHostUri(normalized.afterContentUri, connectionAuthority) : void 0,
    diff,
    undoStopId
  };
}
const EXTERNAL_LINK_SCHEMES = /* @__PURE__ */ new Set([
  "http",
  "https",
  "mailto",
  "ws",
  "wss",
  "ftp",
  "ftps",
  "data",
  "blob",
  "javascript",
  "command",
  "vscode",
  "vscode-insiders",
  Schemas.vscodeBrowser,
  "copilot-skill",
  product.urlProtocol,
  AGENT_HOST_SCHEME
]);
function rewriteMarkdownLinks(markdown, connectionAuthority) {
  let tokens;
  try {
    tokens = marked.lexer(markdown);
  } catch {
    return markdown;
  }
  const edits = [];
  marked.walkTokens(tokens, (token) => {
    if (token.type !== "link" && token.type !== "image") {
      return;
    }
    const replacement = rewriteLinkTokenRaw(token, connectionAuthority);
    if (replacement !== void 0) {
      edits.push({ raw: token.raw, replacement });
    }
  });
  if (edits.length === 0) {
    return markdown;
  }
  let out = "";
  let pos = 0;
  for (const { raw, replacement } of edits) {
    const idx = markdown.indexOf(raw, pos);
    if (idx < 0) {
      continue;
    }
    out += markdown.substring(pos, idx) + replacement;
    pos = idx + raw.length;
  }
  return out + markdown.substring(pos);
}
function rewriteLinkTokenRaw(token, connectionAuthority) {
  let parsed;
  try {
    parsed = URI.parse(token.href, true);
  } catch {
    return void 0;
  }
  const scheme = parsed.scheme.toLowerCase();
  if (!scheme || EXTERNAL_LINK_SCHEMES.has(scheme)) {
    return void 0;
  }
  let agentHostUri = toAgentHostUri(parsed, connectionAuthority);
  const isSkill = isSkillFileUri(parsed);
  if (isSkill && !agentHostUri.query.includes("vscodeLinkType=")) {
    const existing = agentHostUri.query;
    agentHostUri = agentHostUri.with({ query: existing ? `${existing}&vscodeLinkType=skill` : "vscodeLinkType=skill" });
  }
  const prefix = token.type === "image" ? "![" : "[";
  const text = isSkill || token.type === "image" ? escapeMarkdownLinkLabel(token.text ?? "") : "";
  return `${prefix}${text}](${agentHostUri.toString()})`;
}
function isSkillFileUri(uri) {
  const name = basename(uri);
  return name.toLowerCase() === "skill.md";
}
function rawMarkdownToString(content, connectionAuthority) {
  const rewritten = connectionAuthority ? rewriteMarkdownLinks(content, connectionAuthority) : content;
  return new MarkdownString(rewritten);
}
function parseAbsoluteFileLinkTarget(href) {
  const fragmentIndex = href.indexOf("#");
  const rawPath = fragmentIndex >= 0 ? href.substring(0, fragmentIndex) : href;
  if (rawPath.includes("?")) {
    return void 0;
  }
  const existingFragment = fragmentIndex >= 0 ? href.substring(fragmentIndex + 1) : "";
  const parsedPath = existingFragment ? { path: rawPath } : parseFileLocation(rawPath);
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(parsedPath.path);
  } catch {
    return void 0;
  }
  const absolutePath = decodedPath;
  const isWindowsPath = win32.isAbsolute(absolutePath);
  if (!posix.isAbsolute(absolutePath) && !isWindowsPath) {
    return void 0;
  }
  const selectionFragment = formatLocationFragment(parsedPath);
  const normalizedPath = isWindowsPath ? absolutePath.replaceAll("\\", "/") : absolutePath;
  return URI.file(normalizedPath).with({ fragment: existingFragment || selectionFragment });
}
function parseFileLocation(path) {
  const match = /^(?<path>.+?):(?<line>[1-9]\d*)(?::(?<column>[1-9]\d*))?$/.exec(path);
  if (!match?.groups) {
    return { path };
  }
  const line = Number(match.groups.line);
  const column = match.groups.column ? Number(match.groups.column) : void 0;
  if (!Number.isSafeInteger(line) || column !== void 0 && !Number.isSafeInteger(column)) {
    return { path };
  }
  return { path: match.groups.path, line, column };
}
function formatLocationFragment(location) {
  if (location.line === void 0) {
    return "";
  }
  return `L${location.line}${location.column !== void 0 && location.column !== 1 ? `,${location.column}` : ""}`;
}
function normalizeFileUriSelection(uri, href) {
  if (uri.scheme.toLowerCase() !== Schemas.file || uri.query || uri.fragment) {
    return uri;
  }
  const parsedPath = parseFileLocation(href);
  if (parsedPath.line === void 0) {
    return uri;
  }
  const fragment = formatLocationFragment(parsedPath);
  const suffixLength = href.length - parsedPath.path.length;
  return uri.with({ path: uri.path.substring(0, uri.path.length - suffixLength), fragment });
}
function rewriteAgentHostLinkTarget(href, connectionAuthority) {
  let parsed = parseAbsoluteFileLinkTarget(href);
  if (!parsed) {
    try {
      parsed = URI.parse(href, true);
    } catch {
      return href;
    }
    const scheme = parsed.scheme.toLowerCase();
    if (!scheme || EXTERNAL_LINK_SCHEMES.has(scheme)) {
      return href;
    }
    parsed = normalizeFileUriSelection(parsed.with({ scheme }), href);
    if (!parsed.path.startsWith("/")) {
      return href;
    }
  }
  let agentHostUri;
  try {
    agentHostUri = toAgentHostUri(parsed, connectionAuthority);
  } catch {
    return href;
  }
  if (isSkillFileUri(parsed) && !agentHostUri.query.includes("vscodeLinkType=")) {
    const existing = agentHostUri.query;
    agentHostUri = agentHostUri.with({ query: existing ? `${existing}&vscodeLinkType=skill` : "vscodeLinkType=skill" });
  }
  return agentHostUri.toString();
}
function stringOrMarkdownToString(value, connectionAuthority) {
  if (value === void 0) {
    return void 0;
  }
  if (typeof value === "string") {
    return value;
  }
  return rawMarkdownToString(value.markdown, connectionAuthority);
}
const ADD_COMMENT_PREVIEW_LENGTH = 40;
function addCommentPreview(text) {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > ADD_COMMENT_PREVIEW_LENGTH ? `${singleLine.slice(0, ADD_COMMENT_PREVIEW_LENGTH)}\u2026` : singleLine;
}
function isPositiveInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}
function isOneBasedRange(value) {
  const range = value;
  return !!range && typeof range === "object" && isPositiveInteger(range.startLineNumber) && isPositiveInteger(range.startColumn) && isPositiveInteger(range.endLineNumber) && isPositiveInteger(range.endColumn);
}
function addCommentReference(tc) {
  if (tc.status === ToolCallStatus.Streaming || !tc.toolInput) {
    return void 0;
  }
  const toolInput = tc.toolInput;
  let args;
  try {
    args = JSON.parse(toolInput);
  } catch {
    return void 0;
  }
  if (typeof args.resourceUri !== "string" || typeof args.text !== "string" || !isOneBasedRange(args.range)) {
    return void 0;
  }
  const preview = escapeIcons(escapeMarkdownLinkLabel(addCommentPreview(args.text)));
  const commandArgs = encodeURIComponent(JSON.stringify([args.resourceUri, args.range]));
  const link = `command:${AgentFeedbackReviewCommandId.RevealAt}?${commandArgs}`;
  return new MarkdownString(`[addComment "${preview}"](${link})`, {
    isTrusted: { enabledCommands: [AgentFeedbackReviewCommandId.RevealAt] },
    supportThemeIcons: true
  });
}
function toolCallStateToInvocation(tc, subAgentInvocationId, sessionResource, connectionAuthority, mcpServerAuthority = sessionResource.authority, options) {
  const toolData = {
    id: tc.toolName,
    source: ToolDataSource.Internal,
    displayName: tc.displayName,
    modelDescription: tc.toolName
  };
  if (tc.contributor?.kind === ToolCallContributorKind.Client && options && tc.contributor.clientId !== options.currentClientId) {
    const invocation2 = new ChatToolInvocation(void 0, toolData, tc.toolCallId, subAgentInvocationId, void 0);
    invocation2.invocationMessage = localize("agentHost.otherClientTool.running", "Running {0} on another client...", tc.displayName);
    invocation2.otherClientToolCall = {
      cancel: () => options.cancelOtherClientToolCall(tc)
    };
    return invocation2;
  }
  if (tc.status === ToolCallStatus.PendingConfirmation) {
    const confirmationMessages = toolCallConfirmationMessages(tc, connectionAuthority);
    let toolSpecificData;
    const pendingEdits = tc.edits?.items;
    if (isViewUnreviewedCommentsTool(tc.toolName)) {
      toolSpecificData = {
        kind: "agentFeedbackReviewConfirmation",
        options: [localize("agentFeedback.reveal", "Reveal Selected")]
      };
    } else if (pendingEdits?.length) {
      const wrap = (uri) => connectionAuthority ? toAgentHostUri(uri, connectionAuthority) : uri;
      const mapped = mapFileEdits(pendingEdits, tc.toolCallId);
      toolSpecificData = {
        kind: "modifiedFilesConfirmation",
        options: ["Allow"],
        modifiedFiles: mapped.map((edit) => {
          const resource = wrap(edit.resource);
          const originalResource = edit.originalResource ? wrap(edit.originalResource) : void 0;
          const modifiedContent = edit.afterContentUri ? wrap(edit.afterContentUri) : void 0;
          const originalContent = edit.beforeContentUri ? wrap(edit.beforeContentUri) : void 0;
          return {
            uri: resource,
            editKind: edit.kind,
            originalUri: originalResource,
            modifiedContentUri: modifiedContent,
            originalContentUri: originalContent,
            insertions: edit.diff?.added,
            deletions: edit.diff?.removed,
            title: basename(edit.resource),
            description: edit.resource.path
          };
        })
      };
    } else if (getToolKind(tc) === "terminal" && tc.toolInput) {
      toolSpecificData = buildTerminalToolSpecificData(tc, sessionResource);
    } else if (tc.toolInput) {
      let rawInput;
      try {
        rawInput = JSON.parse(tc.toolInput);
      } catch {
        rawInput = { input: tc.toolInput };
      }
      toolSpecificData = { kind: "input", rawInput };
    }
    return new ChatToolInvocation(
      {
        invocationMessage: stringOrMarkdownToString(tc.invocationMessage, connectionAuthority),
        confirmationMessages,
        presentation: ToolInvocationPresentation.HiddenAfterComplete,
        toolSpecificData
      },
      toolData,
      tc.toolCallId,
      subAgentInvocationId,
      void 0
    );
  }
  const invocation = new ChatToolInvocation(void 0, toolData, tc.toolCallId, subAgentInvocationId, void 0);
  invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? tc.displayName;
  if (isAgentHostAskUserTool(tc.toolName)) {
    invocation.invocationMessage = localize("agentHost.askUser.waiting", "Waiting for answer...");
    invocation.presentation = ToolInvocationPresentation.HiddenAfterComplete;
  }
  if (tc.status === ToolCallStatus.AuthRequired) {
    invocation.setAuthenticationRequired(toolCallAuthenticationServer(tc, mcpServerAuthority));
  }
  if (isAddCommentTool(tc.toolName)) {
    invocation.invocationMessage = addCommentReference(tc) ?? invocation.invocationMessage;
  }
  if (isTerminalToolCall(tc)) {
    invocation.toolSpecificData = buildTerminalToolSpecificData(tc, sessionResource);
  } else if (isSubagentTool(tc)) {
    const subagentContent = tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed ? getToolSubagentContent(tc) : void 0;
    invocation.toolSpecificData = {
      kind: "subagent",
      description: getSubagentTaskDescription(tc),
      agentName: subagentContent?.agentName ?? getSubagentAgentName(tc),
      chatResource: getSubagentChatResource(tc, subagentContent, sessionResource)
    };
  } else if (getToolKind(tc) === "search") {
    invocation.toolSpecificData = { kind: "search" };
  } else if (tc.status !== ToolCallStatus.Streaming) {
    invocation.toolSpecificData = buildMcpAppToolInputData(tc, sessionResource);
  }
  return invocation;
}
function toolCallConfirmationMessages(tc, connectionAuthority) {
  const riskAssessment = tc.riskAssessment;
  let approvalReason;
  if (riskAssessment?.status === ToolCallRiskAssessmentStatus.Loading) {
    approvalReason = { status: "loading" };
  } else if (riskAssessment?.status === ToolCallRiskAssessmentStatus.Complete) {
    approvalReason = {
      status: "complete",
      explanation: stringOrMarkdownToString(riskAssessment.reason, connectionAuthority),
      safety: riskAssessment.safety
    };
  }
  return {
    title: isViewUnreviewedCommentsTool(tc.toolName) ? localize("agentFeedback.reviewTitle", "Reveal unreviewed comments?") : stringOrMarkdownToString(tc.confirmationTitle, connectionAuthority) ?? tc.displayName,
    message: isViewUnreviewedCommentsTool(tc.toolName) ? localize("agentFeedback.reviewMessage", "Choose which comments to reveal to the agent. Unchecked comments stay hidden.") : stringOrMarkdownToString(tc.invocationMessage, connectionAuthority),
    approvalReason,
    ...tc.options ? { customOptions: tc.options } : {}
  };
}
function toolCallAuthenticationServer(tc, sessionAuthority) {
  const metadata = readToolCallMeta(tc);
  return {
    id: `${sessionAuthority}/${tc.contributor.customizationId}`,
    name: tc.auth.resource.resource_name ?? metadata.mcpServerName ?? tc.displayName,
    resource: tc.auth.resource.resource,
    oauthClient: tc.auth.oauthClient,
    authorizationServers: tc.auth.resource.authorization_servers,
    supportedScopes: tc.auth.resource.scopes_supported,
    requiredScopes: tc.auth.requiredScopes,
    reason: tc.auth.reason
  };
}
function toolCallStateToStreamingInvocation(tc, subAgentInvocationId, sessionResource, connectionAuthority, mcpServerAuthority) {
  const invocation = ChatToolInvocation.createStreaming({
    toolCallId: tc.toolCallId,
    toolId: tc.toolName,
    toolData: {
      id: tc.toolName,
      source: ToolDataSource.Internal,
      displayName: tc.displayName,
      modelDescription: tc.toolName
    },
    subagentInvocationId: subAgentInvocationId
  });
  updateStreamingToolInvocation(invocation, tc, connectionAuthority ?? "");
  if (isAgentHostAskUserTool(tc.toolName)) {
    invocation.invocationMessage = localize("agentHost.askUser.asking", "Asking a question...");
    invocation.presentation = ToolInvocationPresentation.HiddenAfterComplete;
  }
  if (sessionResource && isSubagentTool(tc)) {
    invocation.toolSpecificData = toolCallStateToInvocation(tc, subAgentInvocationId, sessionResource, connectionAuthority ?? "", mcpServerAuthority).toolSpecificData;
  }
  return invocation;
}
function getStreamingToolInputForDisplay(tc) {
  if (tc.status !== ToolCallStatus.Streaming || !tc.partialInput) {
    return void 0;
  }
  return parsePartialToolInputForDisplay(tc.partialInput) ?? tc.partialInput;
}
function updateStreamingToolInvocation(existing, tc, connectionAuthority) {
  if (tc.status !== ToolCallStatus.Streaming) {
    return void 0;
  }
  const partialInput = getStreamingToolInputForDisplay(tc);
  if (partialInput !== void 0) {
    existing.updatePartialInput(partialInput);
  }
  const invocationMessage = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority);
  if (invocationMessage) {
    existing.updateStreamingMessage(invocationMessage);
  }
  return partialInput;
}
function toolCallStateToPreparedInvocation(tc, sessionResource, connectionAuthority, mcpServerAuthority = sessionResource.authority, options) {
  const built = toolCallStateToInvocation(tc, void 0, sessionResource, connectionAuthority, mcpServerAuthority, options);
  return {
    invocationMessage: built.invocationMessage,
    pastTenseMessage: built.pastTenseMessage,
    confirmationMessages: built.confirmationMessages,
    presentation: built.presentation,
    toolSpecificData: built.toolSpecificData
  };
}
function updateRunningToolSpecificData(existing, tc, sessionResource, connectionAuthority) {
  if (tc.status !== ToolCallStatus.Running) {
    return;
  }
  existing.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? existing.invocationMessage;
  if (isAgentHostAskUserTool(tc.toolName)) {
    existing.invocationMessage = localize("agentHost.askUser.waiting", "Waiting for answer...");
    existing.presentation = ToolInvocationPresentation.HiddenAfterComplete;
  }
  if (isAddCommentTool(tc.toolName)) {
    existing.invocationMessage = addCommentReference(tc) ?? existing.invocationMessage;
  }
  const subagentContent = getToolSubagentContent(tc);
  if (subagentContent) {
    existing.toolSpecificData = {
      kind: "subagent",
      isActive: existing.toolSpecificData?.kind === "subagent" ? existing.toolSpecificData.isActive : void 0,
      description: getSubagentTaskDescription(tc),
      agentName: subagentContent.agentName,
      credits: existing.toolSpecificData?.kind === "subagent" ? existing.toolSpecificData.credits : void 0,
      modelName: existing.toolSpecificData?.kind === "subagent" ? existing.toolSpecificData.modelName : void 0,
      startedAt: existing.toolSpecificData?.kind === "subagent" ? existing.toolSpecificData.startedAt : void 0,
      duration: existing.toolSpecificData?.kind === "subagent" ? existing.toolSpecificData.duration : void 0,
      chatResource: subagentContent.resource
    };
    existing.notifyToolSpecificDataChanged();
    return;
  }
  if (existing.toolSpecificData?.kind === "subagent") {
    const description = getSubagentTaskDescription(tc) ?? existing.toolSpecificData.description;
    const agentName = getSubagentAgentName(tc) ?? existing.toolSpecificData.agentName;
    if (description !== existing.toolSpecificData.description || agentName !== existing.toolSpecificData.agentName) {
      existing.toolSpecificData = { ...existing.toolSpecificData, description, agentName };
      existing.notifyToolSpecificDataChanged();
    }
    return;
  }
  const existingInput = existing.toolSpecificData?.kind === "input" ? existing.toolSpecificData : void 0;
  const nextInput = buildMcpAppToolInputData(tc, sessionResource, existingInput?.rawInput);
  if (nextInput) {
    if (!existingInput || !isSameMcpAppData(existingInput.mcpAppData, nextInput.mcpAppData)) {
      existing.toolSpecificData = nextInput;
      existing.notifyToolSpecificDataChanged();
    }
    return;
  }
  const existingTerminal = existing.toolSpecificData?.kind === "terminal" ? existing.toolSpecificData : void 0;
  if (isTerminalToolCall(tc, existing.toolSpecificData?.kind)) {
    const next = buildTerminalToolSpecificData(tc, sessionResource, existingTerminal);
    const outputChanged = next.terminalCommandOutput?.text !== existingTerminal?.terminalCommandOutput?.text;
    const commandChanged = next.commandLine.original !== existingTerminal?.commandLine.original;
    if (!existingTerminal || outputChanged || commandChanged) {
      existing.toolSpecificData = next;
      existing.notifyToolSpecificDataChanged();
    }
  }
}
function finalizeToolInvocation(invocation, tc, backendSession, connectionAuthority) {
  const isCompleted = tc.status === ToolCallStatus.Completed;
  const isCancelled = tc.status === ToolCallStatus.Cancelled;
  const isTerminal = isTerminalToolCall(tc, invocation.toolSpecificData?.kind);
  if ((isCompleted || isCancelled) && hasKey(tc, { invocationMessage: true })) {
    invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? invocation.invocationMessage;
  }
  if (isAddCommentTool(tc.toolName)) {
    invocation.invocationMessage = addCommentReference(tc) ?? invocation.invocationMessage;
  }
  if (isAgentHostAskUserTool(tc.toolName)) {
    invocation.presentation = ToolInvocationPresentation.HiddenAfterComplete;
  }
  if (isCompleted) {
    const subagentContent = getToolSubagentContent(tc);
    if (subagentContent) {
      const resultText = getToolOutputText(tc);
      invocation.toolSpecificData = {
        kind: "subagent",
        isActive: invocation.toolSpecificData?.kind === "subagent" ? invocation.toolSpecificData.isActive : void 0,
        description: getSubagentTaskDescription(tc),
        agentName: subagentContent.agentName,
        result: resultText,
        credits: invocation.toolSpecificData?.kind === "subagent" ? invocation.toolSpecificData.credits : void 0,
        modelName: invocation.toolSpecificData?.kind === "subagent" ? invocation.toolSpecificData.modelName : void 0,
        startedAt: invocation.toolSpecificData?.kind === "subagent" ? invocation.toolSpecificData.startedAt : void 0,
        duration: invocation.toolSpecificData?.kind === "subagent" ? invocation.toolSpecificData.duration : void 0,
        chatResource: getSubagentChatResource(tc, subagentContent, backendSession)
      };
    } else if (invocation.toolSpecificData?.kind === "subagent") {
      invocation.toolSpecificData = {
        kind: "subagent",
        isActive: invocation.toolSpecificData.isActive,
        description: getSubagentTaskDescription(tc) ?? invocation.toolSpecificData.description,
        agentName: getSubagentAgentName(tc) ?? invocation.toolSpecificData.agentName,
        result: getToolOutputText(tc),
        credits: invocation.toolSpecificData.credits,
        modelName: invocation.toolSpecificData.modelName,
        startedAt: invocation.toolSpecificData.startedAt,
        duration: invocation.toolSpecificData.duration,
        chatResource: invocation.toolSpecificData.chatResource ?? getSubagentChatResource(tc, void 0, backendSession)
      };
    }
  }
  if (isTerminal && (isCompleted || isCancelled)) {
    const existing = invocation.toolSpecificData?.kind === "terminal" ? invocation.toolSpecificData : void 0;
    invocation.presentation = void 0;
    invocation.toolSpecificData = {
      ...buildTerminalToolSpecificData(tc, backendSession, existing),
      terminalCommandState: getTerminalCommandState(tc, isCompleted && tc.success)
    };
  } else if (isCompleted && tc.pastTenseMessage) {
    invocation.pastTenseMessage = stringOrMarkdownToString(tc.pastTenseMessage, connectionAuthority);
  }
  if (isCompleted && isAddCommentTool(tc.toolName)) {
    invocation.pastTenseMessage = addCommentReference(tc) ?? invocation.pastTenseMessage;
  }
  if (isCompleted) {
    const resultToolSpecificData = buildSessionCreatedToolData(tc) ?? buildAutomationConfiguredToolData(tc);
    if (resultToolSpecificData) {
      invocation.presentation = void 0;
      invocation.toolSpecificData = resultToolSpecificData;
      invocation.notifyToolSpecificDataChanged();
    }
  }
  if (isCompleted) {
    const mcpAppInput = buildMcpAppToolInputData(
      tc,
      backendSession,
      invocation.toolSpecificData?.kind === "input" ? invocation.toolSpecificData.rawInput : void 0
    );
    if (mcpAppInput) {
      const existingInput = invocation.toolSpecificData?.kind === "input" ? invocation.toolSpecificData : void 0;
      invocation.toolSpecificData = mcpAppInput;
      if (!existingInput || !isSameMcpAppData(existingInput.mcpAppData, mcpAppInput.mcpAppData)) {
        invocation.notifyToolSpecificDataChanged();
      }
    }
  }
  const isFailure = isCompleted && !tc.success || isCancelled;
  const errorMessage = isCompleted ? tc.error?.message : isCancelled ? tc.reasonMessage : void 0;
  const errorString = typeof errorMessage === "string" ? errorMessage : errorMessage?.markdown;
  const fileEdits = isCompleted ? fileEditsToExternalEdits(tc) : [];
  if (isAgentHostAskUserTool(tc.toolName)) {
    invocation.presentation = shouldHideCompletedAgentHostAskUserTool(tc) ? ToolInvocationPresentation.HiddenAfterComplete : void 0;
  }
  if (fileEdits.length > 0 && !isFailure) {
    invocation.presentation = ToolInvocationPresentation.Hidden;
  }
  const hasMcpAppData = invocation.toolSpecificData?.kind === "input" && !!invocation.toolSpecificData.mcpAppData;
  const resultDetails = !isTerminal && invocation.toolSpecificData?.kind !== "subagent" && invocation.toolSpecificData?.kind !== "sessionCreated" && getToolKind(tc) !== "search" && fileEdits.length === 0 ? getToolInputOutputDetails(tc, isFailure, errorString, hasMcpAppData, connectionAuthority) : void 0;
  const result = isFailure || resultDetails ? { content: [], toolResultError: isFailure ? errorString : void 0, toolResultDetails: resultDetails } : void 0;
  const cancelledFromStreaming = isCancelled && invocation.cancelFromStreaming(
    tc.reason === ToolCallCancellationReason.Skipped ? ToolConfirmKind.Skipped : ToolConfirmKind.Denied,
    tc.reasonMessage ? stringOrMarkdownToString(tc.reasonMessage, connectionAuthority) : void 0
  );
  if (!cancelledFromStreaming) {
    invocation.didExecuteTool(result);
  }
  return fileEdits;
}
function fileEditsToExternalEdits(tc) {
  if (tc.status !== ToolCallStatus.Completed) {
    return [];
  }
  const edits = getToolFileEdits(tc);
  if (edits.length === 0) {
    return [];
  }
  return mapFileEdits(edits, tc.toolCallId);
}
function mapFileEdits(items, undoStopId) {
  const result = [];
  for (const edit of items) {
    const normalized = normalizeFileEdit(edit);
    if (!normalized) {
      continue;
    }
    result.push({
      kind: normalized.kind,
      resource: normalized.resource,
      originalResource: normalized.kind === FileEditKind.Rename ? normalized.beforeUri : void 0,
      beforeContentUri: normalized.beforeContentUri,
      afterContentUri: normalized.afterContentUri,
      undoStopId,
      diff: edit.diff
    });
  }
  return result;
}
export {
  BOOLEAN_FALSE_OPTION_ID,
  BOOLEAN_TRUE_OPTION_ID,
  activeTurnToProgress,
  completedToolCallToEditParts,
  completedToolCallToSerialized,
  containsAutomaticReplyAnswer,
  convertProtocolAnswers,
  convertProtocolPlanReviewResult,
  createInputRequestCarousel,
  createInputRequestPlanReview,
  fileEditsToExternalEdits,
  finalizeToolInvocation,
  formatTurnResponseDetails,
  getTerminalContent,
  getUrlInputRequestPresentation,
  inputRequestResponsePartToProgress,
  isSubagentTool,
  isSubagentToolName,
  makeAhpTerminalToolSessionId,
  messageAttachmentsToVariableData,
  messageToVariableData,
  parseAhpTerminalToolSessionId,
  rawMarkdownToString,
  rewriteAgentHostLinkTarget,
  rewriteMarkdownLinks,
  stringOrMarkdownToString,
  systemNotificationToChatPart,
  toolCallAuthenticationServer,
  toolCallConfirmationMessages,
  toolCallStateToInvocation,
  toolCallStateToPreparedInvocation,
  toolCallStateToStreamingInvocation,
  turnsToHistory,
  updateRunningToolSpecificData,
  updateStreamingToolInvocation,
  usageInfoToAutoModeResolution,
  usageInfoToChatUsage,
  usageInfoToQuotas
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9zdGF0ZVRvUHJvZ3Jlc3NBZGFwdGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVjb2RlQmFzZTY0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBlc2NhcGVNYXJrZG93bkxpbmtMYWJlbCwgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGVzY2FwZUljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBtYXJrZWQsIHR5cGUgVG9rZW4sIHR5cGUgVG9rZW5zLCB0eXBlIFRva2Vuc0xpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJrZWQvbWFya2VkLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IHBvc2l4LCB3aW4zMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgYnVpbGRTdWJhZ2VudENoYXRVcmksIE1lc3NhZ2VLaW5kLCBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbiwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRTdGF0dXMsIFRvb2xDYWxsU3RhdHVzLCBUdXJuU3RhdGUsIFJlc3BvbnNlUGFydEtpbmQsIGdldFRvb2xGaWxlRWRpdHMsIGdldFRvb2xPdXRwdXRUZXh0LCBnZXRUb29sU3ViYWdlbnRDb250ZW50LCBoYXNSZXBvcnRlZFVzYWdlLCByZWFkVXNhZ2VJbmZvTWV0YSwgQ2hhdElucHV0QW5zd2VyU3RhdGUsIENoYXRJbnB1dEFuc3dlclZhbHVlS2luZCwgQ2hhdElucHV0UXVlc3Rpb25LaW5kLCBDaGF0SW5wdXRSZXNwb25zZUtpbmQsIHR5cGUgQWN0aXZlVHVybiwgdHlwZSBDaGF0SW5wdXRBbnN3ZXIsIHR5cGUgQ2hhdElucHV0UmVxdWVzdCwgdHlwZSBJQ29tcGxldGVkVG9vbENhbGwsIHR5cGUgSW5wdXRSZXF1ZXN0UmVzcG9uc2VQYXJ0LCB0eXBlIE1lc3NhZ2UsIHR5cGUgVGVybWluYWxDb21tYW5kUmVzdWx0LCB0eXBlIFRvb2xDYWxsUGVuZGluZ0NvbmZpcm1hdGlvblN0YXRlLCB0eXBlIFRvb2xDYWxsU3RhdGUsIHR5cGUgVG9vbFJlc3VsdFN1YmFnZW50Q29udGVudCwgdHlwZSBUdXJuLCBGaWxlRWRpdEtpbmQsIFRvb2xSZXN1bHRDb250ZW50VHlwZSwgdHlwZSBUb29sUmVzdWx0Q29udGVudCwgdHlwZSBVc2FnZUluZm8sIHR5cGUgVXNhZ2VJbmZvTWV0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgQ2hhdElucHV0UmVxdWVzdFdpdGhQbGFuUmV2aWV3LCBJQWdlbnRIb3N0UGxhblJldmlldyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0UGxhblJldmlldy5qcyc7XG5pbXBvcnQgeyBnZXRUb29sS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblJlZHVjZXJzLmpzJztcbmltcG9ydCB7IHJlYWRUb29sQ2FsbE1ldGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL21ldGEvYWdlbnRUb29sQ2FsbE1ldGEuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdEVycm9yRGV0YWlsc0Zyb21NZXRhLCBJQ2hhdEVycm9yQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0RXJyb3JNZXNzYWdlcy5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX1NDSEVNRSwgdG9BZ2VudEhvc3RVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RFbGVtZW50QXR0YWNobWVudERpc3BsYXlLaW5kLCBnZXRFbGVtZW50QXR0YWNobWVudENvcnJlbGF0aW9uSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL21ldGEvYWdlbnRFbGVtZW50QXR0YWNobWVudHMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0QXV0b1JlcGx5QW5zd2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuaW1wb3J0IHsgZ2V0QWdlbnRGZWVkYmFja0F0dGFjaG1lbnRNZXRhZGF0YSwgaXNBZ2VudEZlZWRiYWNrQW5ub3RhdGlvbnNBdHRhY2htZW50LCBpc0FnZW50RmVlZGJhY2tBdHRhY2htZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9tZXRhL2FnZW50RmVlZGJhY2tBdHRhY2htZW50cy5qcyc7XG5pbXBvcnQgeyBnZXRCcm93c2VyVmlld0F0dGFjaG1lbnRNZXRhZGF0YSwgaXNCcm93c2VyVmlld0F0dGFjaG1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL21ldGEvYnJvd3NlclZpZXdBdHRhY2htZW50cy5qcyc7XG5pbXBvcnQgeyBpc1ZpZXdVbnJldmlld2VkQ29tbWVudHNUb29sLCBpc0FkZENvbW1lbnRUb29sIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9tZXRhL2FnZW50RmVlZGJhY2tBbm5vdGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBpc0NyZWF0ZUNoYXRUb29sLCBpc0NyZWF0ZVNlc3Npb25Ub29sLCBpc1NlbmRNZXNzYWdlVG9vbCwgcGFyc2VPcGVuU2Vzc2lvbkxpbmtDaGF0SWQsIHBhcnNlT3BlblNlc3Npb25MaW5rVXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9vcGVuU2Vzc2lvbkxpbmsuanMnO1xuaW1wb3J0IHsgcGFyc2VQYXJ0aWFsVG9vbElucHV0Rm9yRGlzcGxheSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcGFydGlhbFRvb2xJbnB1dC5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlQXR0YWNobWVudEtpbmQsIHR5cGUgRmlsZUVkaXQsIHR5cGUgTWVzc2FnZUF0dGFjaG1lbnQsIHR5cGUgU3RyaW5nT3JNYXJrZG93biwgdHlwZSBUZXh0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IG5vcm1hbGl6ZUZpbGVFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9maWxlRWRpdERpZmYuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmVBdXRvbWF0aW9uVG9vbFJlZmVyZW5jZU5hbWUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZm9ybWF0Q29waWxvdENyZWRpdHMsIEVsaWNpdGF0aW9uU3RhdGUsIHR5cGUgQ2hhdEV4dGVybmFsRWRpdEtpbmQsIHR5cGUgQ2hhdE1jcEFwcERhdGEsIHR5cGUgSUNoYXRBZ2VudEZlZWRiYWNrUmV2aWV3Q29uZmlybWF0aW9uRGF0YSwgdHlwZSBJQ2hhdEF1dG9tYXRpb25Db25maWd1cmVkRGF0YSwgdHlwZSBJQ2hhdEF1dG9Nb2RlUmVzb2x1dGlvblBhcnQsIHR5cGUgSUNoYXRFeHRlcm5hbEVkaXQsIHR5cGUgSUNoYXRNY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkU2VydmVyLCB0eXBlIElDaGF0TW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvbkRhdGEsIHR5cGUgSUNoYXRQbGFuUmV2aWV3UmVzdWx0LCB0eXBlIElDaGF0UHJvZ3Jlc3MsIHR5cGUgSUNoYXRRdWVzdGlvbiwgdHlwZSBJQ2hhdFF1ZXN0aW9uQW5zd2VyVmFsdWUsIHR5cGUgSUNoYXRRdWVzdGlvbkFuc3dlcnMsIHR5cGUgSUNoYXRSZXNwb25zZUVycm9yRGV0YWlscywgdHlwZSBJQ2hhdFNlYXJjaFRvb2xJbnZvY2F0aW9uRGF0YSwgdHlwZSBJQ2hhdFNlc3Npb25DcmVhdGVkRGF0YSwgdHlwZSBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhLCB0eXBlIElDaGF0VG9vbElucHV0SW52b2NhdGlvbkRhdGEsIHR5cGUgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsIHR5cGUgSUNoYXRVc2FnZSwgdHlwZSBJQ2hhdFVzYWdlUHJvbXB0VG9rZW5EZXRhaWwsIFRvb2xDb25maXJtS2luZCwgQWdlbnRGZWVkYmFja1Jldmlld0NvbW1hbmRJZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1Rlcm1pbmFsQ29tbWFuZFByb21wdCwgdHlwZSBJQ2hhdFNlc3Npb25IaXN0b3J5SXRlbSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHR5cGUgSVF1b3RhU25hcHNob3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRUb29sSW52b2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0VG9vbEludm9jYXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhdFBsYW5SZXZpZXdEYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRQbGFuUmV2aWV3RGF0YS5qcyc7XG5pbXBvcnQgeyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhLmpzJztcbmltcG9ydCB7IHR5cGUgSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZCwgcmVzdG9yZVBhc3RlVmFyaWFibGVFbnRyeUZyb21BdHRhY2htZW50LCB0b0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5RnJvbU1ldGFkYXRhLCB0eXBlIElBZ2VudEZlZWRiYWNrVmFyaWFibGVFbnRyeSwgdHlwZSBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCB0eXBlIElFbGVtZW50VmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IHR5cGUgSVRvb2xDb25maXJtYXRpb25NZXNzYWdlcywgdHlwZSBJVG9vbERhdGEsIHR5cGUgSVByZXBhcmVkVG9vbEludm9jYXRpb24sIHR5cGUgSVRvb2xSZXN1bHQsIHR5cGUgSVRvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHMsIFRvb2xEYXRhU291cmNlLCBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1DUCB9IGZyb20gJy4uLy4uLy4uLy4uL21jcC9jb21tb24vbW9kZWxDb250ZXh0UHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgaGFzS2V5LCB0eXBlIE11dGFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgdHlwZSB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBpc1Nlc3Npb25SZWZlcmVuY2VUcmFqZWN0b3J5QXR0YWNobWVudCwgcmVzdG9yZVNlc3Npb25SZWZlcmVuY2VWYXJpYWJsZUVudHJ5RnJvbUF0dGFjaG1lbnQgfSBmcm9tICcuL2FnZW50SG9zdFNlc3Npb25SZWZlcmVuY2VBdHRhY2htZW50LmpzJztcbmltcG9ydCB7IHJlc3RvcmVDaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeUZyb21BdHRhY2htZW50IH0gZnJvbSAnLi9hZ2VudEhvc3RDaGF0UmVmZXJlbmNlQXR0YWNobWVudC5qcyc7XG5cbmV4cG9ydCBjb25zdCBCT09MRUFOX1RSVUVfT1BUSU9OX0lEID0gJ3RydWUnO1xuZXhwb3J0IGNvbnN0IEJPT0xFQU5fRkFMU0VfT1BUSU9OX0lEID0gJ2ZhbHNlJztcblxuY29uc3QgYWdlbnRIb3N0QXNrVXNlclRvb2xOYW1lcyA9IG5ldyBTZXQoWydhc2tfdXNlcicsICdBc2tVc2VyUXVlc3Rpb24nLCAncmVxdWVzdF91c2VyX2lucHV0J10pO1xuXG5mdW5jdGlvbiBpc0FnZW50SG9zdEFza1VzZXJUb29sKHRvb2xOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGFnZW50SG9zdEFza1VzZXJUb29sTmFtZXMuaGFzKHRvb2xOYW1lKTtcbn1cblxuZnVuY3Rpb24gc2hvdWxkSGlkZUNvbXBsZXRlZEFnZW50SG9zdEFza1VzZXJUb29sKHRvb2xDYWxsOiBUb29sQ2FsbFN0YXRlKTogYm9vbGVhbiB7XG5cdGlmICghaXNBZ2VudEhvc3RBc2tVc2VyVG9vbCh0b29sQ2FsbC50b29sTmFtZSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKHRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKSB7XG5cdFx0cmV0dXJuIHRvb2xDYWxsLnN1Y2Nlc3M7XG5cdH1cblx0cmV0dXJuIHRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ2FuY2VsbGVkICYmIHRvb2xDYWxsLnJlYXNvbiA9PT0gVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24uU2tpcHBlZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0VG9vbEludm9jYXRpb25PcHRpb25zIHtcblx0cmVhZG9ubHkgY3VycmVudENsaWVudElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNhbmNlbE90aGVyQ2xpZW50VG9vbENhbGw6ICh0b29sQ2FsbDogVG9vbENhbGxTdGF0ZSkgPT4gdm9pZDtcbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3RzIGEgdGVybWluYWwgdG9vbCBzZXNzaW9uIElEIGZyb20gYSB0ZXJtaW5hbCBVUkkgYW5kIGJhY2tlbmQgc2Vzc2lvbi5cbiAqIFRoZSBJRCBpcyBhIEpTT04gc3RyaW5nIGNvbnRhaW5pbmcgYm90aCBzbyBjb25zdW1lcnMgY2FuIHBhcnNlIG91dCBlaXRoZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYWtlQWhwVGVybWluYWxUb29sU2Vzc2lvbklkKHRlcm1pbmFsVXJpOiBzdHJpbmcsIHNlc3Npb246IFVSSSk6IHN0cmluZyB7XG5cdHJldHVybiBKU09OLnN0cmluZ2lmeSh7IHRlcm1pbmFsOiB0ZXJtaW5hbFVyaSwgc2Vzc2lvbjogc2Vzc2lvbi50b1N0cmluZygpIH0pO1xufVxuXG4vKipcbiAqIFBhcnNlcyBhIHRlcm1pbmFsIHRvb2wgc2Vzc2lvbiBJRCBiYWNrIGludG8gaXRzIHRlcm1pbmFsIGFuZCBzZXNzaW9uIFVSSXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUFocFRlcm1pbmFsVG9vbFNlc3Npb25JZChpZDogc3RyaW5nKTogeyB0ZXJtaW5hbDogc3RyaW5nOyBzZXNzaW9uOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShpZCk7XG5cdFx0aWYgKHR5cGVvZiBwYXJzZWQ/LnRlcm1pbmFsID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgcGFyc2VkPy5zZXNzaW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHBhcnNlZDtcblx0XHR9XG5cdH0gY2F0Y2ggeyAvKiBub3QgYW4gQUhQIHRlcm1pbmFsIHNlc3Npb24gSUQgKi8gfVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBjb252ZXJ0UHJvdG9jb2xBbnN3ZXIoYW5zd2VyOiBDaGF0SW5wdXRBbnN3ZXIpOiBJQ2hhdFF1ZXN0aW9uQW5zd2VyVmFsdWUgfCB1bmRlZmluZWQge1xuXHRpZiAoYW5zd2VyLnN0YXRlICE9PSBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHN3aXRjaCAoYW5zd2VyLnZhbHVlLmtpbmQpIHtcblx0XHRjYXNlIENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0OlxuXHRcdFx0cmV0dXJuIGFuc3dlci52YWx1ZS52YWx1ZTtcblx0XHRjYXNlIENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5OdW1iZXI6XG5cdFx0Y2FzZSBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuQm9vbGVhbjpcblx0XHRcdHJldHVybiBTdHJpbmcoYW5zd2VyLnZhbHVlLnZhbHVlKTtcblx0XHRjYXNlIENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5TZWxlY3RlZDpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHNlbGVjdGVkVmFsdWU6IGFuc3dlci52YWx1ZS52YWx1ZSxcblx0XHRcdFx0ZnJlZWZvcm1WYWx1ZTogYW5zd2VyLnZhbHVlLmZyZWVmb3JtVmFsdWVzPy5bMF0sXG5cdFx0XHR9O1xuXHRcdGNhc2UgQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkTWFueTpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHNlbGVjdGVkVmFsdWVzOiBhbnN3ZXIudmFsdWUudmFsdWUsXG5cdFx0XHRcdGZyZWVmb3JtVmFsdWU6IGFuc3dlci52YWx1ZS5mcmVlZm9ybVZhbHVlcz8uWzBdLFxuXHRcdFx0fTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY29udmVydFByb3RvY29sQW5zd2VycyhyYXc6IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4gfCB1bmRlZmluZWQpOiBJQ2hhdFF1ZXN0aW9uQW5zd2VycyB8IHVuZGVmaW5lZCB7XG5cdGlmICghcmF3KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBhbnN3ZXJzOiBJQ2hhdFF1ZXN0aW9uQW5zd2VycyA9IHt9O1xuXHRmb3IgKGNvbnN0IFtxdWVzdGlvbklkLCBhbnN3ZXJdIG9mIE9iamVjdC5lbnRyaWVzKHJhdykpIHtcblx0XHRjb25zdCBjb252ZXJ0ZWQgPSBjb252ZXJ0UHJvdG9jb2xBbnN3ZXIoYW5zd2VyKTtcblx0XHRpZiAoY29udmVydGVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGFuc3dlcnNbcXVlc3Rpb25JZF0gPSBjb252ZXJ0ZWQ7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBPYmplY3Qua2V5cyhhbnN3ZXJzKS5sZW5ndGggPiAwID8gYW5zd2VycyA6IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbnRhaW5zQXV0b21hdGljUmVwbHlBbnN3ZXIocmF3OiBSZWNvcmQ8c3RyaW5nLCBDaGF0SW5wdXRBbnN3ZXI+IHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdHJldHVybiBPYmplY3QudmFsdWVzKHJhdyA/PyB7fSkuc29tZShhbnN3ZXIgPT5cblx0XHRhbnN3ZXIuc3RhdGUgPT09IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZFxuXHRcdCYmIGFuc3dlci52YWx1ZS5raW5kID09PSBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuVGV4dFxuXHRcdCYmIGFuc3dlci52YWx1ZS52YWx1ZSA9PT0gQWdlbnRIb3N0QXV0b1JlcGx5QW5zd2VyXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGdldFBsYW5SZXZpZXdBY3Rpb24ocGxhblJldmlldzogSUFnZW50SG9zdFBsYW5SZXZpZXcsIGFjdGlvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0cmV0dXJuIGFjdGlvbklkID8gcGxhblJldmlldy5hY3Rpb25zLmZpbmQoYWN0aW9uID0+IGFjdGlvbi5pZCA9PT0gYWN0aW9uSWQpIDogdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29udmVydFByb3RvY29sUGxhblJldmlld1Jlc3VsdChwbGFuUmV2aWV3OiBJQWdlbnRIb3N0UGxhblJldmlldywgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZCwgYW5zd2VyczogUmVjb3JkPHN0cmluZywgQ2hhdElucHV0QW5zd2VyPiB8IHVuZGVmaW5lZCk6IElDaGF0UGxhblJldmlld1Jlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdGlmIChyZXNwb25zZSA9PT0gQ2hhdElucHV0UmVzcG9uc2VLaW5kLkRlY2xpbmUpIHtcblx0XHRyZXR1cm4geyByZWplY3RlZDogdHJ1ZSB9O1xuXHR9XG5cdGlmIChyZXNwb25zZSAhPT0gQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBhbnN3ZXIgPSBhbnN3ZXJzPy5bcGxhblJldmlldy5hbnN3ZXJRdWVzdGlvbklkXTtcblx0aWYgKCFhbnN3ZXIgfHwgYW5zd2VyLnN0YXRlID09PSBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5Ta2lwcGVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IHZhbHVlID0gYW5zd2VyLnZhbHVlO1xuXHRpZiAodmFsdWUua2luZCA9PT0gQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQpIHtcblx0XHRjb25zdCBmZWVkYmFjayA9IHZhbHVlLnZhbHVlLnRyaW0oKTtcblx0XHRyZXR1cm4gZmVlZGJhY2sgPyB7IHJlamVjdGVkOiBmYWxzZSwgZmVlZGJhY2ssIGZlZWRiYWNrT3ZlcmFsbDogZmVlZGJhY2sgfSA6IHVuZGVmaW5lZDtcblx0fVxuXHRpZiAodmFsdWUua2luZCAhPT0gQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IGFjdGlvbiA9IGdldFBsYW5SZXZpZXdBY3Rpb24ocGxhblJldmlldywgdmFsdWUudmFsdWUpO1xuXHRjb25zdCBmZWVkYmFjayA9IHZhbHVlLmZyZWVmb3JtVmFsdWVzPy5maW5kKHYgPT4gdi50cmltKCkubGVuZ3RoID4gMCk/LnRyaW0oKTtcblx0cmV0dXJuIHtcblx0XHRyZWplY3RlZDogZmFsc2UsXG5cdFx0YWN0aW9uOiBhY3Rpb24/LmxhYmVsID8/IHZhbHVlLnZhbHVlLFxuXHRcdGFjdGlvbklkOiBhY3Rpb24/LmlkID8/IHZhbHVlLnZhbHVlLFxuXHRcdC4uLihmZWVkYmFjayA/IHsgZmVlZGJhY2ssIGZlZWRiYWNrT3ZlcmFsbDogZmVlZGJhY2sgfSA6IHt9KSxcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUlucHV0UmVxdWVzdENhcm91c2VsKGlucHV0UmVxOiBDaGF0SW5wdXRSZXF1ZXN0LCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcpOiBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEge1xuXHRjb25zdCBxdWVzdGlvbnM6IElDaGF0UXVlc3Rpb25bXSA9IChpbnB1dFJlcS5xdWVzdGlvbnMgPz8gW10pLm1hcCgocXVlc3Rpb24pOiBJQ2hhdFF1ZXN0aW9uID0+IHtcblx0XHRsZXQgdGl0bGUgPSBxdWVzdGlvbi50aXRsZTtcblx0XHRsZXQgbWVzc2FnZSA9IHF1ZXN0aW9uLm1lc3NhZ2U7XG5cdFx0aWYgKCF0aXRsZSkge1xuXHRcdFx0Y29uc3QgZW5kT2ZMaW5lID0gcXVlc3Rpb24ubWVzc2FnZS5pbmRleE9mKCdcXG4nKTtcblx0XHRcdHRpdGxlID0gZW5kT2ZMaW5lID09PSAtMSA/IHF1ZXN0aW9uLm1lc3NhZ2UgOiBxdWVzdGlvbi5tZXNzYWdlLnN1YnN0cmluZygwLCBlbmRPZkxpbmUpLnRyaW0oKTtcblx0XHRcdG1lc3NhZ2UgPSBlbmRPZkxpbmUgPT09IC0xID8gJycgOiBxdWVzdGlvbi5tZXNzYWdlLnN1YnN0cmluZyhlbmRPZkxpbmUgKyAxKS50cmltKCk7XG5cdFx0fVxuXHRcdGNvbnN0IGRldGFpbGVkTWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZyhtZXNzYWdlLCB7IGlzVHJ1c3RlZDogZmFsc2UgfSk7XG5cblx0XHRzd2l0Y2ggKHF1ZXN0aW9uLmtpbmQpIHtcblx0XHRcdGNhc2UgQ2hhdElucHV0UXVlc3Rpb25LaW5kLlNpbmdsZVNlbGVjdDpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogcXVlc3Rpb24uaWQsXG5cdFx0XHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdFx0ZGV0YWlsZWRNZXNzYWdlLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBxdWVzdGlvbi5yZXF1aXJlZCxcblx0XHRcdFx0XHRhbGxvd0ZyZWVmb3JtSW5wdXQ6IHF1ZXN0aW9uLmFsbG93RnJlZWZvcm1JbnB1dCA/PyB0cnVlLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHF1ZXN0aW9uLm9wdGlvbnMubWFwKG9wdGlvbiA9PiAoeyBpZDogb3B0aW9uLmlkLCBsYWJlbDogb3B0aW9uLmxhYmVsLCB2YWx1ZTogb3B0aW9uLmlkIH0pKSxcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgQ2hhdElucHV0UXVlc3Rpb25LaW5kLk11bHRpU2VsZWN0OlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGlkOiBxdWVzdGlvbi5pZCxcblx0XHRcdFx0XHR0eXBlOiAnbXVsdGlTZWxlY3QnLFxuXHRcdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRcdGRldGFpbGVkTWVzc2FnZSxcblx0XHRcdFx0XHRyZXF1aXJlZDogcXVlc3Rpb24ucmVxdWlyZWQsXG5cdFx0XHRcdFx0YWxsb3dGcmVlZm9ybUlucHV0OiBxdWVzdGlvbi5hbGxvd0ZyZWVmb3JtSW5wdXQgPz8gdHJ1ZSxcblx0XHRcdFx0XHRvcHRpb25zOiBxdWVzdGlvbi5vcHRpb25zLm1hcChvcHRpb24gPT4gKHsgaWQ6IG9wdGlvbi5pZCwgbGFiZWw6IG9wdGlvbi5sYWJlbCwgdmFsdWU6IG9wdGlvbi5pZCB9KSksXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIENoYXRJbnB1dFF1ZXN0aW9uS2luZC5Cb29sZWFuOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGlkOiBxdWVzdGlvbi5pZCxcblx0XHRcdFx0XHR0eXBlOiAnc2luZ2xlU2VsZWN0Jyxcblx0XHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0XHRkZXRhaWxlZE1lc3NhZ2UsXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IHF1ZXN0aW9uLnJlcXVpcmVkLFxuXHRcdFx0XHRcdGFsbG93RnJlZWZvcm1JbnB1dDogZmFsc2UsXG5cdFx0XHRcdFx0ZGVmYXVsdFZhbHVlOiBxdWVzdGlvbi5kZWZhdWx0VmFsdWUgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IFN0cmluZyhxdWVzdGlvbi5kZWZhdWx0VmFsdWUpLFxuXHRcdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgaWQ6IEJPT0xFQU5fVFJVRV9PUFRJT05fSUQsIGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5pbnB1dFJlcXVlc3QuYm9vbGVhbi50cnVlJywgXCJUcnVlXCIpLCB2YWx1ZTogQk9PTEVBTl9UUlVFX09QVElPTl9JRCB9LFxuXHRcdFx0XHRcdFx0eyBpZDogQk9PTEVBTl9GQUxTRV9PUFRJT05fSUQsIGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5pbnB1dFJlcXVlc3QuYm9vbGVhbi5mYWxzZScsIFwiRmFsc2VcIiksIHZhbHVlOiBCT09MRUFOX0ZBTFNFX09QVElPTl9JRCB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIENoYXRJbnB1dFF1ZXN0aW9uS2luZC5UZXh0OlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGlkOiBxdWVzdGlvbi5pZCxcblx0XHRcdFx0XHR0eXBlOiAndGV4dCcsXG5cdFx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdFx0ZGV0YWlsZWRNZXNzYWdlLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBxdWVzdGlvbi5yZXF1aXJlZCxcblx0XHRcdFx0XHRkZWZhdWx0VmFsdWU6IHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSxcblx0XHRcdFx0fTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6IHF1ZXN0aW9uLmlkLFxuXHRcdFx0XHRcdHR5cGU6ICd0ZXh0Jyxcblx0XHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0XHRkZXRhaWxlZE1lc3NhZ2UsXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IHF1ZXN0aW9uLnJlcXVpcmVkLFxuXHRcdFx0XHR9O1xuXHRcdH1cblx0fSk7XG5cblx0aWYgKHF1ZXN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRxdWVzdGlvbnMucHVzaCh7XG5cdFx0XHRpZDogJ2Fuc3dlcicsXG5cdFx0XHR0eXBlOiAndGV4dCcsXG5cdFx0XHR0aXRsZTogaW5wdXRSZXEubWVzc2FnZSA/PyAnJyxcblx0XHRcdHJlcXVpcmVkOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0Y29uc3QgY2Fyb3VzZWwgPSBuZXcgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhKFxuXHRcdHF1ZXN0aW9ucyxcblx0XHR0cnVlLFxuXHRcdGlucHV0UmVxLmlkLFxuXHRcdHVuZGVmaW5lZCxcblx0XHR1bmRlZmluZWQsXG5cdFx0aW5wdXRSZXEubWVzc2FnZSA/IHJhd01hcmtkb3duVG9TdHJpbmcoaW5wdXRSZXEubWVzc2FnZSwgY29ubmVjdGlvbkF1dGhvcml0eSkgOiB1bmRlZmluZWQsXG5cdCk7XG5cdGNhcm91c2VsLmFuc3dlclByZXNlbnRhdGlvbiA9ICdjb252ZXJzYXRpb24nO1xuXHRyZXR1cm4gY2Fyb3VzZWw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbnB1dFJlcXVlc3RQbGFuUmV2aWV3KGlucHV0UmVxOiBDaGF0SW5wdXRSZXF1ZXN0LCBwbGFuUmV2aWV3OiBJQWdlbnRIb3N0UGxhblJldmlldyk6IENoYXRQbGFuUmV2aWV3RGF0YSB7XG5cdHJldHVybiBuZXcgQ2hhdFBsYW5SZXZpZXdEYXRhKFxuXHRcdHBsYW5SZXZpZXcudGl0bGUsXG5cdFx0cGxhblJldmlldy5jb250ZW50LFxuXHRcdHBsYW5SZXZpZXcuYWN0aW9ucy5tYXAoYWN0aW9uID0+ICh7XG5cdFx0XHRpZDogYWN0aW9uLmlkLFxuXHRcdFx0bGFiZWw6IGFjdGlvbi5sYWJlbCxcblx0XHRcdC4uLihhY3Rpb24uZGVzY3JpcHRpb24gPyB7IGRlc2NyaXB0aW9uOiBhY3Rpb24uZGVzY3JpcHRpb24gfSA6IHt9KSxcblx0XHRcdC4uLihhY3Rpb24uZGVmYXVsdCA/IHsgZGVmYXVsdDogdHJ1ZSB9IDoge30pLFxuXHRcdFx0Li4uKGFjdGlvbi5wZXJtaXNzaW9uTGV2ZWwgPyB7IHBlcm1pc3Npb25MZXZlbDogYWN0aW9uLnBlcm1pc3Npb25MZXZlbCB9IDoge30pLFxuXHRcdH0pKSxcblx0XHRwbGFuUmV2aWV3LmNhblByb3ZpZGVGZWVkYmFjayxcblx0XHRwbGFuUmV2aWV3LnBsYW5VcmkgPyBVUkkucGFyc2UocGxhblJldmlldy5wbGFuVXJpKS50b0pTT04oKSA6IHVuZGVmaW5lZCxcblx0XHRpbnB1dFJlcS5pZCxcblx0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFVybElucHV0UmVxdWVzdFByZXNlbnRhdGlvbihpbnB1dFJlcTogQ2hhdElucHV0UmVxdWVzdCwgdXJsOiBzdHJpbmcpOiB7IGF1dGhvcml0eTogc3RyaW5nOyBtZXNzYWdlOiBNYXJrZG93blN0cmluZyB9IHtcblx0bGV0IGF1dGhvcml0eSA9IHVybDtcblx0dHJ5IHtcblx0XHRhdXRob3JpdHkgPSBVUkkucGFyc2UodXJsKS5hdXRob3JpdHkgfHwgdXJsO1xuXHR9IGNhdGNoIHtcblx0XHQvLyBGYWxsIGJhY2sgdG8gdGhlIHJhdyBVUkwgc3RyaW5nLlxuXHR9XG5cblx0Y29uc3QgbWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZygpO1xuXHRpZiAoaW5wdXRSZXEubWVzc2FnZSkge1xuXHRcdG1lc3NhZ2UuYXBwZW5kVGV4dChpbnB1dFJlcS5tZXNzYWdlKTtcblx0XHRtZXNzYWdlLmFwcGVuZE1hcmtkb3duKCdcXG5cXG4nKTtcblx0fVxuXHRtZXNzYWdlLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdhZ2VudEhvc3QuZWxpY2l0LnVybC5pbnN0cnVjdGlvbicsIFwiT3BlbiB0aGlzIFVSTD9cIikpO1xuXHRtZXNzYWdlLmFwcGVuZENvZGVibG9jaygnJywgdXJsKTtcblx0cmV0dXJuIHsgYXV0aG9yaXR5LCBtZXNzYWdlIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnB1dFJlcXVlc3RSZXNwb25zZVBhcnRUb1Byb2dyZXNzKHBhcnQ6IElucHV0UmVxdWVzdFJlc3BvbnNlUGFydCwgY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nKTogSUNoYXRQcm9ncmVzcyB7XG5cdGNvbnN0IGlucHV0UmVxID0gcGFydC5yZXF1ZXN0O1xuXHRjb25zdCBwbGFuUmV2aWV3ID0gKGlucHV0UmVxIGFzIENoYXRJbnB1dFJlcXVlc3RXaXRoUGxhblJldmlldykucGxhblJldmlldztcblx0aWYgKHBsYW5SZXZpZXcpIHtcblx0XHRjb25zdCByZXZpZXcgPSBjcmVhdGVJbnB1dFJlcXVlc3RQbGFuUmV2aWV3KGlucHV0UmVxLCBwbGFuUmV2aWV3KTtcblx0XHRyZXZpZXcuZGF0YSA9IHBhcnQucmVzcG9uc2UgPT09IHVuZGVmaW5lZFxuXHRcdFx0PyB1bmRlZmluZWRcblx0XHRcdDogY29udmVydFByb3RvY29sUGxhblJldmlld1Jlc3VsdChwbGFuUmV2aWV3LCBwYXJ0LnJlc3BvbnNlLCBpbnB1dFJlcS5hbnN3ZXJzKTtcblx0XHRyZXZpZXcuaXNVc2VkID0gdHJ1ZTtcblx0XHRyZXR1cm4gcmV2aWV3O1xuXHR9XG5cblx0aWYgKGlucHV0UmVxLnVybCkge1xuXHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IGdldFVybElucHV0UmVxdWVzdFByZXNlbnRhdGlvbihpbnB1dFJlcSwgaW5wdXRSZXEudXJsKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2VsaWNpdGF0aW9uU2VyaWFsaXplZCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5lbGljaXQudXJsLnRpdGxlJywgXCJBdXRob3JpemF0aW9uIFJlcXVpcmVkXCIpLFxuXHRcdFx0bWVzc2FnZTogcHJlc2VudGF0aW9uLm1lc3NhZ2UsXG5cdFx0XHRzdWJ0aXRsZTogJycsXG5cdFx0XHRzb3VyY2U6IHVuZGVmaW5lZCxcblx0XHRcdHN0YXRlOiBwYXJ0LnJlc3BvbnNlID09PSBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0ID8gRWxpY2l0YXRpb25TdGF0ZS5BY2NlcHRlZCA6IEVsaWNpdGF0aW9uU3RhdGUuUmVqZWN0ZWQsXG5cdFx0XHRpc0hpZGRlbjogZmFsc2UsXG5cdFx0fTtcblx0fVxuXG5cdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlSW5wdXRSZXF1ZXN0Q2Fyb3VzZWwoaW5wdXRSZXEsIGNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHRjb25zdCBhbnN3ZXJzID0gcGFydC5yZXNwb25zZSA9PT0gQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdFxuXHRcdD8gY29udmVydFByb3RvY29sQW5zd2VycyhpbnB1dFJlcS5hbnN3ZXJzKVxuXHRcdDogdW5kZWZpbmVkO1xuXHRjYXJvdXNlbC5kYXRhID0gYW5zd2VycyA/PyB7fTtcblx0Y2Fyb3VzZWwuaXNVc2VkID0gdHJ1ZTtcblx0Y2Fyb3VzZWwuYXV0b1JlcGx5ID0gY29udGFpbnNBdXRvbWF0aWNSZXBseUFuc3dlcihpbnB1dFJlcS5hbnN3ZXJzKTtcblx0Y2Fyb3VzZWwuYW5zd2VyZWRFeHRlcm5hbGx5ID0gcGFydC5yZXNwb25zZSA9PT0gQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCAmJiAoY2Fyb3VzZWwuYXV0b1JlcGx5IHx8ICFhbnN3ZXJzKTtcblx0cmV0dXJuIGNhcm91c2VsO1xufVxuXG4vKipcbiAqIEV4dHJhY3RzIHRoZSB0YXNrIGRlc2NyaXB0aW9uIGZyb20gYF9tZXRhLnN1YmFnZW50RGVzY3JpcHRpb25gLCB3aGljaCBpc1xuICogcG9wdWxhdGVkIGZyb20gdGhlIHRvb2wncyBhcmd1bWVudHMgYXQgYHRvb2xfc3RhcnRgIHRpbWUgYnkgdGhlIGV2ZW50XG4gKiBtYXBwZXIuIFRoaXMgaXMgdGhlIHNob3J0IHRhc2sgZGVzY3JpcHRpb24gKGUuZy4sIFwiRmluZCByZWxhdGVkIGZpbGVzXCIpLFxuICogTk9UIHRoZSBhZ2VudCdzIG93biBkZXNjcmlwdGlvbi5cbiAqL1xuZnVuY3Rpb24gZ2V0U3ViYWdlbnRUYXNrRGVzY3JpcHRpb24odGM6IFRvb2xDYWxsU3RhdGUpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCB2ID0gcmVhZFRvb2xDYWxsTWV0YSh0Yykuc3ViYWdlbnREZXNjcmlwdGlvbjtcblx0cmV0dXJuIHYgJiYgdi5sZW5ndGggPiAwID8gdiA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBFeHRyYWN0cyB0aGUgYWdlbnQgbmFtZSBmcm9tIGBfbWV0YS5zdWJhZ2VudEFnZW50TmFtZWAuXG4gKi9cbmZ1bmN0aW9uIGdldFN1YmFnZW50QWdlbnROYW1lKHRjOiBUb29sQ2FsbFN0YXRlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdiA9IHJlYWRUb29sQ2FsbE1ldGEodGMpLnN1YmFnZW50QWdlbnROYW1lO1xuXHRyZXR1cm4gdiAmJiB2Lmxlbmd0aCA+IDAgPyB2IDogdW5kZWZpbmVkO1xufVxuXG4vKiogVGhlIHN1YmFnZW50IGNoYXQgcmVzb3VyY2UgZm9yIGEgc3ViYWdlbnQtc3Bhd25pbmcgdG9vbCBjYWxsOiBwcmVmZXIgdGhlIGhvc3Qtc3RhbXBlZCBgX21ldGEuc3ViYWdlbnRDaGF0VXJpYCwgdGhlbiBhIGRpc2NvdmVyeSBibG9jaywgdGhlbiBhIGRlcml2ZWQgZmFsbGJhY2suICovXG5mdW5jdGlvbiBnZXRTdWJhZ2VudENoYXRSZXNvdXJjZSh0YzogVG9vbENhbGxTdGF0ZSwgc3ViYWdlbnRDb250ZW50OiBUb29sUmVzdWx0U3ViYWdlbnRDb250ZW50IHwgdW5kZWZpbmVkLCBzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdHJldHVybiByZWFkVG9vbENhbGxNZXRhKHRjKS5zdWJhZ2VudENoYXRVcmkgPz8gc3ViYWdlbnRDb250ZW50Py5yZXNvdXJjZSA/PyBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwgdGMudG9vbENhbGxJZCk7XG59XG5cbi8qKlxuICogUmV0dXJucyBNQ1AgQXBwIHJlbmRlciBkYXRhIGZvciBhIHRvb2wgY2FsbCB3aGVuIGl0IGlzIGFuIE1DUCBjYWxsXG4gKiB3aXRoIGFuIGBfbWV0YS51aS5yZXNvdXJjZVVyaWAgYW5kIGEga25vd24gQUhQIGBtY3A6Ly9gIGBjaGFubmVsYC5cbiAqIFVzZWQgYnkgYm90aCBsaXZlIGFuZCBzZXJpYWxpemVkIGFkYXB0ZXJzIHRvIHBvcHVsYXRlXG4gKiBgSUNoYXRUb29sSW5wdXRJbnZvY2F0aW9uRGF0YS5tY3BBcHBEYXRhYCBzbyB0aGUgY2hhdCByZW5kZXJlciBtb3VudHNcbiAqIGEgYENoYXRNY3BBcHBTdWJQYXJ0YCBvdmVyIHRoZSB0b29sLlxuICpcbiAqIFRvb2wgY2FsbHMgcHJvZHVjZWQgYnkgYW4gYWdlbnQgaG9zdCBhbHdheXMgcm91dGUgdGhyb3VnaCB0aGUgQUhQXG4gKiBgbWNwOi8vYCBzaWRlIGNoYW5uZWwgKGFuZCBuZXZlciB0aHJvdWdoIHtAbGluayBJTWNwU2VydmljZX0pLCBzb1xuICogdGhlIHJldHVybmVkIGRhdGEgaXMgYWx3YXlzIGBraW5kOiAnYWdlbnRIb3N0J2AuIFRoZSBjdXN0b21pemF0aW9uXG4gKiBpZCBkb3VibGVzIGFzIGEgc3RhYmxlIHBlci1zZXNzaW9uIGBzZXJ2ZXJJZGAgZm9yIHdlYnZpZXcgb3JpZ2luXG4gKiBzY29waW5nIFx1MjAxNCB0d28gc2Vzc2lvbnMgZXhwb3NpbmcgdGhlIHNhbWUgdXBzdHJlYW0gTUNQIHNlcnZlciB0aGVyZWZvcmVcbiAqIGdldCBkaXN0aW5jdCB3ZWJ2aWV3IG9yaWdpbnMgKGFzc3VtaW5nIGRpc3RpbmN0IGN1c3RvbWl6YXRpb24gaWRzKS5cbiAqL1xuZnVuY3Rpb24gZ2V0TWNwQXBwRGF0YSh0YzogVG9vbENhbGxTdGF0ZSwgX3Nlc3Npb25SZXNvdXJjZTogVVJJKTogQ2hhdE1jcEFwcERhdGEgfCB1bmRlZmluZWQge1xuXHRpZiAodGMuY29udHJpYnV0b3I/LmtpbmQgIT09IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLk1DUCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgdWkgPSByZWFkVG9vbENhbGxNZXRhKHRjKS51aTtcblx0aWYgKCF1aSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgcmVzb3VyY2VVcmkgPSB1aS5yZXNvdXJjZVVyaTtcblx0Y29uc3QgY2hhbm5lbFZhbHVlID0gdWkuY2hhbm5lbDtcblx0aWYgKGNoYW5uZWxWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0Ly8gTm8gY2hhbm5lbCB5ZXQgXHUyMDE0IHRoZSBBcHAncyBzdWItUlBDcyB3b3VsZCBoYXZlIG5vd2hlcmUgdG8gZ28uXG5cdFx0Ly8gU2tpcCBtb3VudGluZyB1bnRpbCB0aGUgY3VzdG9taXphdGlvbiByZWFjaGVzIFJlYWR5IGFuZCB0aGVcblx0XHQvLyBwcm9kdWNlciByZS1lbWl0cyB3aXRoIHRoZSBjaGFubmVsIHBvcHVsYXRlZC5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2FnZW50SG9zdCcsXG5cdFx0cmVzb3VyY2VVcmksXG5cdFx0c2VydmVySWQ6IHRjLmNvbnRyaWJ1dG9yLmN1c3RvbWl6YXRpb25JZCxcblx0XHRjaGFubmVsOiBjaGFubmVsVmFsdWUsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGdldFRvb2xSYXdJbnB1dCh0YzogVG9vbENhbGxTdGF0ZSk6IHVua25vd24ge1xuXHR0cnkge1xuXHRcdHJldHVybiB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyB8fCAhdGMudG9vbElucHV0ID8ge30gOiBKU09OLnBhcnNlKHRjLnRvb2xJbnB1dCk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB7IGlucHV0OiB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyA/IHVuZGVmaW5lZCA6IHRjLnRvb2xJbnB1dCB9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGJ1aWxkTWNwQXBwVG9vbElucHV0RGF0YSh0YzogVG9vbENhbGxTdGF0ZSwgc2Vzc2lvblJlc291cmNlOiBVUkksIGV4aXN0aW5nUmF3SW5wdXQ/OiB1bmtub3duKTogSUNoYXRUb29sSW5wdXRJbnZvY2F0aW9uRGF0YSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG1jcEFwcERhdGEgPSBnZXRNY3BBcHBEYXRhKHRjLCBzZXNzaW9uUmVzb3VyY2UpO1xuXHRpZiAoIW1jcEFwcERhdGEpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2lucHV0Jyxcblx0XHRyYXdJbnB1dDogZXhpc3RpbmdSYXdJbnB1dCA/PyBnZXRUb29sUmF3SW5wdXQodGMpLFxuXHRcdG1jcEFwcERhdGEsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGlzU2FtZU1jcEFwcERhdGEoYTogQ2hhdE1jcEFwcERhdGEgfCB1bmRlZmluZWQsIGI6IENoYXRNY3BBcHBEYXRhIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGlmIChhPy5raW5kICE9PSBiPy5raW5kIHx8IGE/LnJlc291cmNlVXJpICE9PSBiPy5yZXNvdXJjZVVyaSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoYT8ua2luZCA9PT0gJ2FnZW50SG9zdCcgJiYgYj8ua2luZCA9PT0gJ2FnZW50SG9zdCcpIHtcblx0XHRyZXR1cm4gYS5zZXJ2ZXJJZCA9PT0gYi5zZXJ2ZXJJZCAmJiBhLmNoYW5uZWwgPT09IGIuY2hhbm5lbDtcblx0fVxuXHRpZiAoYT8ua2luZCA9PT0gJ2xvY2FsJyAmJiBiPy5raW5kID09PSAnbG9jYWwnKSB7XG5cdFx0cmV0dXJuIGEuc2VydmVyRGVmaW5pdGlvbklkID09PSBiLnNlcnZlckRlZmluaXRpb25JZCAmJiBhLmNvbGxlY3Rpb25JZCA9PT0gYi5jb2xsZWN0aW9uSWQ7XG5cdH1cblx0cmV0dXJuIGEgPT09IGI7XG59XG5cbi8qKlxuICogS25vd24gdG9vbCBuYW1lcyB0aGF0IHNwYXduIHN1YmFnZW50IHNlc3Npb25zLiBVc2VkIGFzIGEgY2xpZW50LXNpZGVcbiAqIGZhbGxiYWNrIHdoZW4gdGhlIHNlcnZlciBoYXNuJ3Qgc2V0IGBfbWV0YS50b29sS2luZGAgKGUuZy4gc2Vzc2lvbnNcbiAqIHJlc3RvcmVkIGJ5IGFuIG9sZGVyIHNlcnZlciB2ZXJzaW9uIHRoYXQgZGlkbid0IGNhcnJ5IGBfbWV0YWApLlxuICovXG5jb25zdCBTVUJBR0VOVF9UT09MX05BTUVTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChbJ3Rhc2snXSk7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N1YmFnZW50VG9vbE5hbWUodG9vbE5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gU1VCQUdFTlRfVE9PTF9OQU1FUy5oYXModG9vbE5hbWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3lzdGVtTm90aWZpY2F0aW9uVG9DaGF0UGFydChjb250ZW50OiBTdHJpbmdPck1hcmtkb3duIHwgdW5kZWZpbmVkLCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcpOiBJQ2hhdFByb2dyZXNzIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFjb250ZW50KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB2YWx1ZSA9IHN0cmluZ09yTWFya2Rvd25Ub1N0cmluZyhjb250ZW50LCBjb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0cmV0dXJuIHsga2luZDogJ3N5c3RlbU5vdGlmaWNhdGlvbicsIGNvbnRlbnQ6IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyBuZXcgTWFya2Rvd25TdHJpbmcodmFsdWUpIDogdmFsdWUgfTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgdGhpcyB0b29sIGNhbGwgc3Bhd25zIGEgc3ViYWdlbnQgc2Vzc2lvbiwgZWl0aGVyIGJlY2F1c2VcbiAqIHRoZSBzZXJ2ZXIgcmVwb3J0ZWQgYF9tZXRhLnRvb2xLaW5kID09PSAnc3ViYWdlbnQnYCBvciBiZWNhdXNlIHRoZSB0b29sXG4gKiBuYW1lIGlzIGluIHRoZSBrbm93biBmYWxsYmFjayBzZXQgKG9sZGVyIHNuYXBzaG90cyB3aXRob3V0IGBfbWV0YWApLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNTdWJhZ2VudFRvb2wodGM6IFRvb2xDYWxsU3RhdGUpOiBib29sZWFuIHtcblx0cmV0dXJuIGdldFRvb2xLaW5kKHRjKSA9PT0gJ3N1YmFnZW50JyB8fCBpc1N1YmFnZW50VG9vbE5hbWUodGMudG9vbE5hbWUpO1xufVxuXG4vKipcbiAqIEZpbmRzIGEgdGVybWluYWwgY29udGVudCBibG9jayBpbiBhIHRvb2wgY2FsbCdzIGNvbnRlbnQgYXJyYXkuXG4gKiBSZXR1cm5zIHRoZSB0ZXJtaW5hbCBVUkkgaWYgZm91bmQuXG4gKi9cbmZ1bmN0aW9uIGdldFRlcm1pbmFsQ29udGVudFVyaShjb250ZW50OiBUb29sUmVzdWx0Q29udGVudFtdIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGdldFRlcm1pbmFsQ29udGVudChjb250ZW50KT8ucmVzb3VyY2U7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUZXJtaW5hbENvbnRlbnQoY29udGVudDogVG9vbFJlc3VsdENvbnRlbnRbXSB8IHVuZGVmaW5lZCk6IEV4dHJhY3Q8VG9vbFJlc3VsdENvbnRlbnQsIHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsIH0+IHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGNvbnRlbnQ/LmZpbmQoaXNUb29sUmVzdWx0VGVybWluYWxDb250ZW50KTtcbn1cblxuLyoqXG4gKiBSZXNvbHZlcyBhIHJhdyBwZXItdHVybiBtb2RlbCBpZCAoYXMgaXQgYXBwZWFycyBvbiBgVXNhZ2VJbmZvLm1vZGVsYCkgaW50b1xuICogdGhlIGNoYXQgbGF5ZXIncyBuYW1lc3BhY2VkIGxhbmd1YWdlLW1vZGVsIGlkIGFuZCBhIGh1bWFuLXJlYWRhYmxlIGRpc3BsYXlcbiAqIGRldGFpbHMuIEJvdGggaGFsdmVzIGFyZSBpbmRlcGVuZGVudDogdGhlIGlkIGZsb3dzIG9udG8gcmVxdWVzdCBoaXN0b3J5XG4gKiBpdGVtcyAoc28gdGhlIGlucHV0IHBpY2tlciBzaG93cyB0aGUgbW9kZWwgdGhhdCByYW4pLCB3aGlsZSB0aGUgZGV0YWlsc1xuICogZmxvdyBvbnRvIHJlc3BvbnNlIGhpc3RvcnkgaXRlbXMgKHNvIHRoZSByZXNwb25zZSBmb290ZXIgc2hvd3MgdGhlIG1vZGVsXG4gKiBhbmQgYW55IHVzYWdlIG1ldGFkYXRhKS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBUdXJuTW9kZWxMb29rdXAge1xuXHQvKiogUmV0dXJucyB0aGUgY2hhdC1sYXllciBuYW1lc3BhY2VkIG1vZGVsIGlkIGZvciBhIHJhdyBBSFAgbW9kZWwgaWQuICovXG5cdHRvTGFuZ3VhZ2VNb2RlbElkKHJhd01vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIFJldHVybnMgdGhlIGh1bWFuLXJlYWRhYmxlIHJlc3BvbnNlIGRldGFpbHMsIG9yIHVuZGVmaW5lZCBpZiB1bmtub3duLiAqL1xuXHR0b1Jlc3BvbnNlRGV0YWlscyhyYXdNb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHVzYWdlOiBVc2FnZUluZm8gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKiBSZXR1cm5zIHRoZSBBdXRvIG1vZGVsIHJvdXRpbmcgcGFydCBjYXJyaWVkIGJ5IHRoaXMgdXNhZ2UgcmVwb3J0LCBpZiBhbnkuICovXG5cdHRvQXV0b01vZGVSZXNvbHV0aW9uPyh1c2FnZTogVXNhZ2VJbmZvIHwgdW5kZWZpbmVkKTogSUNoYXRBdXRvTW9kZVJlc29sdXRpb25QYXJ0IHwgdW5kZWZpbmVkO1xufVxuXG4vKiogTWluaW1hbCBtb2RlbCBtZXRhZGF0YSBuZWVkZWQgdG8gcmVuZGVyIGEgdHVybidzIHJlc3BvbnNlIGZvb3RlciAoa2VwdCBzbWFsbCBmb3IgdW5pdCB0ZXN0aW5nKS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVR1cm5SZXNwb25zZU1vZGVsIHtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBwcmljaW5nPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIEZvcm1hdHMgYSB0dXJuJ3MgcmVzcG9uc2UgZm9vdGVyOiB0aGUgbW9kZWwgZGlzcGxheSBuYW1lIHBsdXMgdXNhZ2UgbWV0YWRhdGEgKGNyZWRpdHMgb3IgcHJpY2luZykuXG4gKiBgbW9kZWxgIGlzIHRoZSByZXNvbHZlZCBtb2RlbDsgYGJpbGxlZE1vZGVsSWRgIGlzIHRoZSB0dXJuJ3MgYHVzYWdlLm1vZGVsYCB3aGVuIGl0IGRpZG4ndCByZXNvbHZlIHRvIGFcbiAqIHJlZ2lzdGVyZWQgbW9kZWwgKGUuZy4gYW4gXCJBdXRvXCIgcGljayBiaWxsZWQgYXMgYHJhcHRvci1taW5pYCksIHNob3duIGlubGluZSBhcyBgQXV0byAocmFwdG9yLW1pbmkpYC5cbiAqIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgbW9kZWwgaXMgdW5rbm93bi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdFR1cm5SZXNwb25zZURldGFpbHMoXG5cdG1vZGVsOiBJVHVyblJlc3BvbnNlTW9kZWwgfCB1bmRlZmluZWQsXG5cdGJpbGxlZE1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0dXNhZ2U6IFVzYWdlSW5mbyB8IHVuZGVmaW5lZCxcbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICghbW9kZWwpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGRpc3BsYXlOYW1lID0gZm9ybWF0VHVybk1vZGVsTmFtZShtb2RlbCwgYmlsbGVkTW9kZWxJZCk7XG5cdGNvbnN0IGNyZWRpdHMgPSB1c2FnZUluZm9Ub0NoYXRVc2FnZSh1c2FnZSk/LmNvcGlsb3RDcmVkaXRzO1xuXHRpZiAoY3JlZGl0cyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgZm9ybWF0dGVkID0gZm9ybWF0Q29waWxvdENyZWRpdHMoY3JlZGl0cyk7XG5cdFx0Y29uc3QgY3JlZGl0RGV0YWlscyA9IGZvcm1hdHRlZCA9PT0gJzEnXG5cdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEhvc3QucmVzcG9uc2VEZXRhaWxzLmNyZWRpdCcsIFwiezB9IGNyZWRpdFwiLCBmb3JtYXR0ZWQpXG5cdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3QucmVzcG9uc2VEZXRhaWxzLmNyZWRpdHMnLCBcInswfSBjcmVkaXRzXCIsIGZvcm1hdHRlZCk7XG5cdFx0cmV0dXJuIFtkaXNwbGF5TmFtZSwgY3JlZGl0RGV0YWlsc10uam9pbignIFx1MjAyMiAnKTtcblx0fVxuXHRyZXR1cm4gW2Rpc3BsYXlOYW1lLCBtb2RlbC5wcmljaW5nXS5maWx0ZXIoQm9vbGVhbikuam9pbignIFx1MDBCNyAnKTtcbn1cblxuLyoqIENvbnZlcnRzIGFuIGFnZW50LWhvc3QgQXV0byByb3V0aW5nIHJlc3VsdCBpbnRvIHRoZSBzaGFyZWQgY2hhdCBVSSBwYXJ0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHVzYWdlSW5mb1RvQXV0b01vZGVSZXNvbHV0aW9uKHVzYWdlOiBVc2FnZUluZm8gfCB1bmRlZmluZWQsIHJlc29sdmVkTW9kZWxOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJQ2hhdEF1dG9Nb2RlUmVzb2x1dGlvblBhcnQgfCB1bmRlZmluZWQge1xuXHRjb25zdCByZXNvbHV0aW9uID0gcmVhZFVzYWdlSW5mb01ldGEodXNhZ2UpLmF1dG9Nb2RlUmVzb2x2ZWQ7XG5cdGlmICghcmVzb2x1dGlvbiB8fCB0eXBlb2YgcmVzb2x1dGlvbi5jb25maWRlbmNlICE9PSAnbnVtYmVyJyB8fCAhTnVtYmVyLmlzRmluaXRlKHJlc29sdXRpb24uY29uZmlkZW5jZSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHByZWRpY3RlZExhYmVsID0gcmVzb2x1dGlvbi5wcmVkaWN0ZWRMYWJlbDtcblx0aWYgKHByZWRpY3RlZExhYmVsICE9PSAnbmVlZHNfcmVhc29uaW5nJyAmJiBwcmVkaWN0ZWRMYWJlbCAhPT0gJ25vX3JlYXNvbmluZycgJiYgcHJlZGljdGVkTGFiZWwgIT09ICdmYWxsYmFjaycpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2F1dG9Nb2RlUmVzb2x1dGlvbicsXG5cdFx0cmVzb2x2ZWRNb2RlbDogcmVzb2x1dGlvbi5jaG9zZW5Nb2RlbCxcblx0XHRyZXNvbHZlZE1vZGVsTmFtZTogcmVzb2x2ZWRNb2RlbE5hbWUgPz8gcmVzb2x1dGlvbi5jaG9zZW5Nb2RlbCxcblx0XHRwcmVkaWN0ZWRMYWJlbCxcblx0XHRjb25maWRlbmNlOiBNYXRoLm1heCgwLCBNYXRoLm1pbigxLCByZXNvbHV0aW9uLmNvbmZpZGVuY2UpKSxcblx0fTtcbn1cblxuLyoqIEFwcGVuZHMgdGhlIGJpbGxlZCBtb2RlbCBpZCAoZS5nLiBgQXV0byAocmFwdG9yLW1pbmkpYCkgd2hlbiBvbmUgaXMgc3VwcGxpZWQuICovXG5mdW5jdGlvbiBmb3JtYXRUdXJuTW9kZWxOYW1lKG1vZGVsOiBJVHVyblJlc3BvbnNlTW9kZWwsIGJpbGxlZE1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdGlmIChiaWxsZWRNb2RlbElkKSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdhZ2VudEhvc3QucmVzcG9uc2VEZXRhaWxzLnJlc29sdmVkTW9kZWwnLCBcInswfSAoezF9KVwiLCBtb2RlbC5uYW1lLCBiaWxsZWRNb2RlbElkKTtcblx0fVxuXHRyZXR1cm4gbW9kZWwubmFtZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVzYWdlSW5mb1RvQ2hhdFVzYWdlKHVzYWdlOiBVc2FnZUluZm8gfCB1bmRlZmluZWQpOiBJQ2hhdFVzYWdlIHwgdW5kZWZpbmVkIHtcblx0Ly8gU2hhcmVkIHdpdGggdGhlIGhvc3QncyByZXN0b3JlIHBhdGgsIHNvIFwidGhpcyB0dXJuIGhhcyB1c2FnZSB3b3J0aFxuXHQvLyBzaG93aW5nXCIgY2Fubm90IGRyaWZ0IGJldHdlZW4gdGhlIHR3by5cblx0aWYgKCFoYXNSZXBvcnRlZFVzYWdlKHVzYWdlKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRraW5kOiAndXNhZ2UnLFxuXHRcdHByb21wdFRva2VuczogdXNhZ2U/LmlucHV0VG9rZW5zID8/IDAsXG5cdFx0Y29tcGxldGlvblRva2VuczogdXNhZ2U/Lm91dHB1dFRva2VucyA/PyAwLFxuXHRcdGNvcGlsb3RDcmVkaXRzOiBnZXRDb3BpbG90Q3JlZGl0cyh1c2FnZSksXG5cdFx0c2Vzc2lvbkNvcGlsb3RDcmVkaXRzOiBnZXRTZXNzaW9uQ29waWxvdENyZWRpdHModXNhZ2UpLFxuXHRcdHByb21wdFRva2VuRGV0YWlsczogY29udGV4dEF0dHJpYnV0aW9uVG9Qcm9tcHRUb2tlbkRldGFpbHModXNhZ2UpLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBnZXRTZXNzaW9uQ29waWxvdENyZWRpdHModXNhZ2U6IFVzYWdlSW5mbyB8IHVuZGVmaW5lZCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHNlc3Npb25Ub3RhbE5hbm9BaXUgPSByZWFkVXNhZ2VJbmZvTWV0YSh1c2FnZSkuY29waWxvdFVzYWdlPy5zZXNzaW9uVG90YWxOYW5vQWl1O1xuXHRyZXR1cm4gdHlwZW9mIHNlc3Npb25Ub3RhbE5hbm9BaXUgPT09ICdudW1iZXInICYmIHNlc3Npb25Ub3RhbE5hbm9BaXUgPj0gMFxuXHRcdD8gc2Vzc2lvblRvdGFsTmFub0FpdSAvIDFfMDAwXzAwMF8wMDBcblx0XHQ6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZ2V0Q29waWxvdENyZWRpdHModXNhZ2U6IFVzYWdlSW5mbyB8IHVuZGVmaW5lZCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG1ldGEgPSByZWFkVXNhZ2VJbmZvTWV0YSh1c2FnZSk7XG5cdGNvbnN0IHRvdGFsTmFub0FpdSA9IG1ldGE/LmNvcGlsb3RVc2FnZT8udG90YWxOYW5vQWl1O1xuXHRpZiAodHlwZW9mIHRvdGFsTmFub0FpdSA9PT0gJ251bWJlcicgJiYgdG90YWxOYW5vQWl1ID49IDApIHtcblx0XHRyZXR1cm4gdG90YWxOYW5vQWl1IC8gMV8wMDBfMDAwXzAwMDtcblx0fVxuXHRjb25zdCBjb3N0ID0gbWV0YT8uY29zdDtcblx0cmV0dXJuIHR5cGVvZiBjb3N0ID09PSAnbnVtYmVyJyAmJiBjb3N0ID49IDBcblx0XHQ/IGNvc3Rcblx0XHQ6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBNYXBzIFNESyBga2luZGAgdmFsdWVzIHRvIGRpc3BsYXkgY2F0ZWdvcmllcyB1c2VkIGJ5IHRoZSBjb250ZXh0LXVzYWdlXG4gKiB3aWRnZXQuIENhdGVnb3JpZXMgZm9sbG93IHRoZSBsb2NhbCBhZ2VudCdzIGVzdGFibGlzaGVkIGdyb3VwaW5nXG4gKiAoXCJTeXN0ZW1cIiBmb3IgaW5mcmFzdHJ1Y3R1cmUsIFwiVXNlciBDb250ZXh0XCIgZm9yIGNvbnZlcnNhdGlvbiBjb250ZW50KS5cbiAqL1xuZnVuY3Rpb24ga2luZFRvQ2F0ZWdvcnkoa2luZDogc3RyaW5nKTogc3RyaW5nIHtcblx0c3dpdGNoIChraW5kKSB7XG5cdFx0Y2FzZSAnc3lzdGVtJzpcblx0XHRjYXNlICd0b29sRGVmaW5pdGlvbic6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NvbnRleHRBdHRyaWJ1dGlvbi5jYXRlZ29yeS5zeXN0ZW0nLCBcIlN5c3RlbVwiKTtcblx0XHRjYXNlICd0b29sJzpcblx0XHRjYXNlICdza2lsbCc6XG5cdFx0Y2FzZSAnc3ViYWdlbnQnOlxuXHRcdGNhc2UgJ21jcFNlcnZlcic6XG5cdFx0Y2FzZSAncGx1Z2luJzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY29udGV4dEF0dHJpYnV0aW9uLmNhdGVnb3J5LnVzZXJDb250ZXh0JywgXCJVc2VyIENvbnRleHRcIik7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY29udGV4dEF0dHJpYnV0aW9uLmNhdGVnb3J5LnVzZXJDb250ZXh0JywgXCJVc2VyIENvbnRleHRcIik7XG5cdH1cbn1cblxuLyoqXG4gKiBIdW1hbi1yZWFkYWJsZSBsYWJlbHMgZm9yIGFnZ3JlZ2F0ZWQgYGtpbmRgIGdyb3Vwcy4gRW50cmllcyBvZiBraW5kXG4gKiBgc3lzdGVtYCBhcmUgc2hvd24gaW5kaXZpZHVhbGx5ICh0aGV5IGFyZSBhbHJlYWR5IGFnZ3JlZ2F0ZWQgcm9sbHVwcyk7XG4gKiBvdGhlciBraW5kcyBhcmUgc3VtbWVkIGludG8gYSBzaW5nbGUgcm93IHBlciBraW5kLlxuICovXG5mdW5jdGlvbiBraW5kVG9BZ2dyZWdhdGVMYWJlbChraW5kOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKGtpbmQpIHtcblx0XHRjYXNlICd0b29sJzogcmV0dXJuIGxvY2FsaXplKCdjb250ZXh0QXR0cmlidXRpb24ubGFiZWwudG9vbFJlc3VsdHMnLCBcIlRvb2wgUmVzdWx0c1wiKTtcblx0XHRjYXNlICd0b29sRGVmaW5pdGlvbic6IHJldHVybiBsb2NhbGl6ZSgnY29udGV4dEF0dHJpYnV0aW9uLmxhYmVsLnRvb2xEZWZpbml0aW9ucycsIFwiVG9vbCBEZWZpbml0aW9uc1wiKTtcblx0XHRjYXNlICdza2lsbCc6IHJldHVybiBsb2NhbGl6ZSgnY29udGV4dEF0dHJpYnV0aW9uLmxhYmVsLnNraWxscycsIFwiU2tpbGxzXCIpO1xuXHRcdGNhc2UgJ3N1YmFnZW50JzogcmV0dXJuIGxvY2FsaXplKCdjb250ZXh0QXR0cmlidXRpb24ubGFiZWwuc3ViQWdlbnRzJywgXCJTdWItYWdlbnRzXCIpO1xuXHRcdGNhc2UgJ21jcFNlcnZlcic6IHJldHVybiBsb2NhbGl6ZSgnY29udGV4dEF0dHJpYnV0aW9uLmxhYmVsLm1jcFRvb2xzJywgXCJNQ1AgVG9vbHNcIik7XG5cdFx0Y2FzZSAncGx1Z2luJzogcmV0dXJuIGxvY2FsaXplKCdjb250ZXh0QXR0cmlidXRpb24ubGFiZWwucGx1Z2lucycsIFwiUGx1Z2luc1wiKTtcblx0XHRkZWZhdWx0OiByZXR1cm4ga2luZDtcblx0fVxufVxuXG4vKipcbiAqIENvbnZlcnRzIHRoZSBTREsncyBmbGF0IGBjb250ZXh0QXR0cmlidXRpb24uZW50cmllc1tdYCBpbnRvIHRoZVxuICogYHByb21wdFRva2VuRGV0YWlsc2AgYXJyYXkgY29uc3VtZWQgYnkgdGhlIGNvbnRleHQtdXNhZ2Ugd2lkZ2V0LlxuICpcbiAqIEVudHJpZXMgb2YgYGtpbmQ6IFwic3lzdGVtXCJgIGFyZSBlbWl0dGVkIGluZGl2aWR1YWxseSAodGhleSBhcmUgYWxyZWFkeVxuICogaGlnaC1sZXZlbCByb2xsdXBzIGxpa2UgXCJTeXN0ZW0gcHJvbXB0XCIpIHVubGVzcyB0aGV5IGFyZSBhIHBhcmVudCBvZlxuICogYHRvb2xEZWZpbml0aW9uYCBlbnRyaWVzIFx1MjAxNCBpbiB0aGF0IGNhc2UgdGhlIHJvbGx1cCBpcyBza2lwcGVkIGFuZCB0aGVcbiAqIGluZGl2aWR1YWwgYHRvb2xEZWZpbml0aW9uYCBlbnRyaWVzIGFyZSBhZ2dyZWdhdGVkIGludG8gdGhlaXIgb3duIHJvdy5cbiAqIEFsbCBvdGhlciBraW5kcyBhcmUgKiphZ2dyZWdhdGVkIGludG8gb25lIHJvdyBwZXIga2luZCoqIChlLmcuIGFsbFxuICogYG1jcFNlcnZlcmAgZW50cmllcyBiZWNvbWUgYSBzaW5nbGUgXCJNQ1AgVG9vbHNcIiBsaW5lKSB0byBtYXRjaCB0aGVcbiAqIENMSSdzIGAvY29udGV4dGAgc3VtbWFyeSB2aWV3LlxuICogQW55IHJlbWFpbmluZyB0b2tlbnMgbm90IGNvdmVyZWQgYnkgZW50cmllcyBhcmUgcmVwb3J0ZWQgYXMgXCJNZXNzYWdlc1wiXG4gKiAoY29udmVyc2F0aW9uIGhpc3Rvcnk6IHVzZXIvYXNzaXN0YW50IG1lc3NhZ2VzIGFuZCB0b29sIHJlc3VsdHMpLlxuICovXG5mdW5jdGlvbiBjb250ZXh0QXR0cmlidXRpb25Ub1Byb21wdFRva2VuRGV0YWlscyh1c2FnZTogVXNhZ2VJbmZvIHwgdW5kZWZpbmVkKTogSUNoYXRVc2FnZVByb21wdFRva2VuRGV0YWlsW10gfCB1bmRlZmluZWQge1xuXHRjb25zdCBtZXRhID0gcmVhZFVzYWdlSW5mb01ldGEodXNhZ2UpO1xuXHRjb25zdCBhdHRyaWJ1dGlvbiA9IG1ldGE/LmNvbnRleHRBdHRyaWJ1dGlvbjtcblx0aWYgKCFhdHRyaWJ1dGlvbiB8fCBhdHRyaWJ1dGlvbi50b3RhbFRva2VucyA8PSAwIHx8IGF0dHJpYnV0aW9uLmVudHJpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBkZXRhaWxzOiBJQ2hhdFVzYWdlUHJvbXB0VG9rZW5EZXRhaWxbXSA9IFtdO1xuXG5cdC8vIElkZW50aWZ5IHN5c3RlbSBlbnRyaWVzIHRoYXQgYXJlIHBhcmVudHMgb2Ygb3RoZXIgZW50cmllcy5cblx0Ly8gVGhlc2Ugcm9sbHVwcyBhcmUgc2tpcHBlZCBiZWNhdXNlIHRoZWlyIGNoaWxkcmVuIGFyZSBhZ2dyZWdhdGVkXG5cdC8vIGRpcmVjdGx5IGludG8gdGhlaXIgb3duIHJvd3MgdG8gYXZvaWQgZG91YmxlLWNvdW50aW5nLlxuXHRjb25zdCBwYXJlbnRJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Zm9yIChjb25zdCBlbnRyeSBvZiBhdHRyaWJ1dGlvbi5lbnRyaWVzKSB7XG5cdFx0aWYgKGVudHJ5LnBhcmVudElkKSB7XG5cdFx0XHRwYXJlbnRJZHMuYWRkKGVudHJ5LnBhcmVudElkKTtcblx0XHR9XG5cdH1cblxuXHQvLyBBY2N1bXVsYXRlIHRva2VucyBwZXIgYWdncmVnYXRlZCBraW5kXG5cdGNvbnN0IGtpbmRUb2tlbnMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHQvLyBUcmFjayB0b2tlbnMgYWNjb3VudGVkIGZvciBieSB0b3AtbGV2ZWwgZW50cmllcyAoc3lzdGVtIHJvbGx1cHMgKyBhZ2dyZWdhdGVkIGtpbmRzKVxuXHRsZXQgYWNjb3VudGVkVG9rZW5zID0gMDtcblxuXHRmb3IgKGNvbnN0IGVudHJ5IG9mIGF0dHJpYnV0aW9uLmVudHJpZXMpIHtcblx0XHRpZiAoZW50cnkua2luZCA9PT0gJ3N5c3RlbScpIHtcblx0XHRcdGlmIChwYXJlbnRJZHMuaGFzKGVudHJ5LmlkKSkge1xuXHRcdFx0XHQvLyBUaGlzIHN5c3RlbSBlbnRyeSBpcyBhIHJvbGx1cCBwYXJlbnQgd2hvc2UgY2hpbGRyZW4gYXJlXG5cdFx0XHRcdC8vIGFnZ3JlZ2F0ZWQgc2VwYXJhdGVseSBcdTIwMTQgc2tpcCB0byBhdm9pZCBkb3VibGUtY291bnRpbmcuXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gU3lzdGVtIGVudHJpZXMgYXJlIHNob3duIGluZGl2aWR1YWxseSAoYWxyZWFkeSBoaWdoLWxldmVsIHJvbGx1cHMpXG5cdFx0XHRhY2NvdW50ZWRUb2tlbnMgKz0gZW50cnkudG9rZW5zO1xuXHRcdFx0Y29uc3QgcGVyY2VudGFnZU9mUHJvbXB0ID0gTWF0aC5yb3VuZCgoZW50cnkudG9rZW5zIC8gYXR0cmlidXRpb24udG90YWxUb2tlbnMpICogMTAwKTtcblx0XHRcdGlmIChwZXJjZW50YWdlT2ZQcm9tcHQgPiAwKSB7XG5cdFx0XHRcdGRldGFpbHMucHVzaCh7XG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IGtpbmRUb0NhdGVnb3J5KCdzeXN0ZW0nKSxcblx0XHRcdFx0XHRsYWJlbDogZW50cnkubGFiZWwsXG5cdFx0XHRcdFx0cGVyY2VudGFnZU9mUHJvbXB0LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQWdncmVnYXRlIGFsbCBvdGhlciBraW5kcyAoaW5jbHVkaW5nIHRvb2xEZWZpbml0aW9uKSBpbnRvIG9uZSByb3cgcGVyIGtpbmRcblx0XHRcdGtpbmRUb2tlbnMuc2V0KGVudHJ5LmtpbmQsIChraW5kVG9rZW5zLmdldChlbnRyeS5raW5kKSA/PyAwKSArIGVudHJ5LnRva2Vucyk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gRW1pdCBhZ2dyZWdhdGVkIHJvd3Ncblx0Zm9yIChjb25zdCBba2luZCwgdG9rZW5zXSBvZiBraW5kVG9rZW5zKSB7XG5cdFx0YWNjb3VudGVkVG9rZW5zICs9IHRva2Vucztcblx0XHRjb25zdCBwZXJjZW50YWdlT2ZQcm9tcHQgPSBNYXRoLnJvdW5kKCh0b2tlbnMgLyBhdHRyaWJ1dGlvbi50b3RhbFRva2VucykgKiAxMDApO1xuXHRcdGlmIChwZXJjZW50YWdlT2ZQcm9tcHQgPD0gMCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IGNhdGVnb3J5ID0ga2luZFRvQ2F0ZWdvcnkoa2luZCk7XG5cdFx0Y29uc3QgbGFiZWwgPSBraW5kVG9BZ2dyZWdhdGVMYWJlbChraW5kKTtcblx0XHRkZXRhaWxzLnB1c2goeyBjYXRlZ29yeSwgbGFiZWwsIHBlcmNlbnRhZ2VPZlByb21wdCB9KTtcblx0fVxuXG5cdC8vIFRoZSByZW1haW5kZXIgaXMgY29udmVyc2F0aW9uIG1lc3NhZ2VzICh1c2VyL2Fzc2lzdGFudCB0dXJucywgdG9vbCByZXN1bHRzKVxuXHQvLyBub3QgYXR0cmlidXRlZCB0byBhbnkgc3BlY2lmaWMgZW50cnkgYnkgdGhlIFNESy5cblx0Y29uc3QgbWVzc2FnZVRva2VucyA9IE1hdGgubWF4KDAsIGF0dHJpYnV0aW9uLnRvdGFsVG9rZW5zIC0gYWNjb3VudGVkVG9rZW5zKTtcblx0aWYgKG1lc3NhZ2VUb2tlbnMgPiAwKSB7XG5cdFx0Y29uc3QgcGVyY2VudGFnZU9mUHJvbXB0ID0gTWF0aC5yb3VuZCgobWVzc2FnZVRva2VucyAvIGF0dHJpYnV0aW9uLnRvdGFsVG9rZW5zKSAqIDEwMCk7XG5cdFx0aWYgKHBlcmNlbnRhZ2VPZlByb21wdCA+IDApIHtcblx0XHRcdGRldGFpbHMucHVzaCh7XG5cdFx0XHRcdGNhdGVnb3J5OiBsb2NhbGl6ZSgnY29udGV4dEF0dHJpYnV0aW9uLmNhdGVnb3J5LnVzZXJDb250ZXh0JywgXCJVc2VyIENvbnRleHRcIiksXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY29udGV4dEF0dHJpYnV0aW9uLmxhYmVsLm1lc3NhZ2VzJywgXCJNZXNzYWdlc1wiKSxcblx0XHRcdFx0cGVyY2VudGFnZU9mUHJvbXB0LFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGRldGFpbHMubGVuZ3RoID4gMCA/IGRldGFpbHMgOiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogQSBwYXJ0aWFsIHF1b3RhIHVwZGF0ZSBkZXJpdmVkIGZyb20gYSB1c2FnZSByZXBvcnQncyBgX21ldGEucXVvdGFTbmFwc2hvdHNgLiBTdHJ1Y3R1cmFsbHkgYVxuICogc3Vic2V0IG9mIHRoZSBlbnRpdGxlbWVudCBzZXJ2aWNlJ3MgcXVvdGEgc3RhdGUsIHNvIGNhbGxlcnMgbWVyZ2UgaXQgb250byB0aGUgZXhpc3RpbmcgcXVvdGFzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RRdW90YVVwZGF0ZSB7XG5cdHJlYWRvbmx5IGNoYXQ/OiBJUXVvdGFTbmFwc2hvdDtcblx0cmVhZG9ubHkgY29tcGxldGlvbnM/OiBJUXVvdGFTbmFwc2hvdDtcblx0cmVhZG9ubHkgcHJlbWl1bUNoYXQ/OiBJUXVvdGFTbmFwc2hvdDtcblx0cmVhZG9ubHkgYWRkaXRpb25hbFVzYWdlRW5hYmxlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGFkZGl0aW9uYWxVc2FnZUNvdW50PzogbnVtYmVyO1xuXHRyZWFkb25seSByZXNldERhdGU/OiBzdHJpbmc7XG59XG5cbnR5cGUgQWNjb3VudFF1b3RhU25hcHNob3QgPSBOb25OdWxsYWJsZTxOb25OdWxsYWJsZTxVc2FnZUluZm9NZXRhWydxdW90YVNuYXBzaG90cyddPltzdHJpbmddPjtcblxuZnVuY3Rpb24gbWFwQWNjb3VudFF1b3RhU25hcHNob3Qoc25hcHNob3Q6IEFjY291bnRRdW90YVNuYXBzaG90KTogSVF1b3RhU25hcHNob3QgfCB1bmRlZmluZWQge1xuXHRjb25zdCB1bmxpbWl0ZWQgPSBzbmFwc2hvdC5pc1VubGltaXRlZEVudGl0bGVtZW50ID8/IGZhbHNlO1xuXHRjb25zdCBlbnRpdGxlbWVudCA9IHR5cGVvZiBzbmFwc2hvdC5lbnRpdGxlbWVudFJlcXVlc3RzID09PSAnbnVtYmVyJyA/IHNuYXBzaG90LmVudGl0bGVtZW50UmVxdWVzdHMgOiB1bmRlZmluZWQ7XG5cblx0Ly8gU2tpcCBjYXRlZ29yaWVzIHdpdGggbm8gYWxsb2NhdGVkIGVudGl0bGVtZW50IChlLmcuIGZyZWUtdGllciBwcmVtaXVtIHdpdGggMCBjcmVkaXRzKSxcblx0Ly8gbWlycm9yaW5nIGBwYXJzZVF1b3Rhc2Agc28gd2UgZG9uJ3Qgc3VyZmFjZSBhbiBlbXB0eSBwcmVtaXVtIGJ1Y2tldC5cblx0aWYgKCF1bmxpbWl0ZWQgJiYgZW50aXRsZW1lbnQgPT09IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Ly8gYHJlbWFpbmluZ1BlcmNlbnRhZ2VgIGlzIHJlcXVpcmVkIHRvIGV4cHJlc3MgYSB1c2FibGUgc25hcHNob3QuIFRyZWF0IGl0cyBhYnNlbmNlIGFzXG5cdC8vIFwibm8gZGF0YVwiIGFuZCBza2lwIHRoZSBjYXRlZ29yeSByYXRoZXIgdGhhbiBkZWZhdWx0aW5nIHRvIDAsIHdoaWNoIHdvdWxkIG90aGVyd2lzZVxuXHQvLyBtYXNxdWVyYWRlIGFzIGFuIGV4aGF1c3RlZCBxdW90YSAobWF0Y2hpbmcgYHBhcnNlUXVvdGFzYCwgd2hlcmUgYHBlcmNlbnRfcmVtYWluaW5nYCBpcyByZXF1aXJlZCkuXG5cdGlmICh0eXBlb2Ygc25hcHNob3QucmVtYWluaW5nUGVyY2VudGFnZSAhPT0gJ251bWJlcicpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgdXNlZCA9IHR5cGVvZiBzbmFwc2hvdC51c2VkUmVxdWVzdHMgPT09ICdudW1iZXInID8gc25hcHNob3QudXNlZFJlcXVlc3RzIDogdW5kZWZpbmVkO1xuXHRjb25zdCByZXNldEF0ID0gc25hcHNob3QucmVzZXREYXRlID8gRGF0ZS5wYXJzZShzbmFwc2hvdC5yZXNldERhdGUpIDogTmFOO1xuXHRyZXR1cm4ge1xuXHRcdHBlcmNlbnRSZW1haW5pbmc6IE1hdGgubWluKDEwMCwgTWF0aC5tYXgoMCwgc25hcHNob3QucmVtYWluaW5nUGVyY2VudGFnZSkpLFxuXHRcdHVubGltaXRlZCxcblx0XHRlbnRpdGxlbWVudDogIXVubGltaXRlZCAmJiBlbnRpdGxlbWVudCAhPT0gdW5kZWZpbmVkICYmIGVudGl0bGVtZW50ID49IDAgPyBlbnRpdGxlbWVudCA6IHVuZGVmaW5lZCxcblx0XHRxdW90YVJlbWFpbmluZzogIXVubGltaXRlZCAmJiBlbnRpdGxlbWVudCAhPT0gdW5kZWZpbmVkICYmIHVzZWQgIT09IHVuZGVmaW5lZCA/IE1hdGgubWF4KDAsIGVudGl0bGVtZW50IC0gdXNlZCkgOiB1bmRlZmluZWQsXG5cdFx0cmVzZXRBdDogTnVtYmVyLmlzRmluaXRlKHJlc2V0QXQpID8gcmVzZXRBdCA6IHVuZGVmaW5lZCxcblx0fTtcbn1cblxuLyoqXG4gKiBNYXBzIHRoZSBwZXItY2F0ZWdvcnkgcXVvdGEgc25hcHNob3RzIGNhcnJpZWQgb24gYSB1c2FnZSByZXBvcnQncyBgX21ldGEucXVvdGFTbmFwc2hvdHNgXG4gKiAocmVwb3J0ZWQgYnkgdGhlIG1vZGVsLWNhbGwgdXNhZ2UgZXZlbnQpIGludG8gYSBwYXJ0aWFsIHF1b3RhIHVwZGF0ZSBmb3IgdGhlIGVudGl0bGVtZW50XG4gKiBzZXJ2aWNlLiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gbm8gdXNhYmxlIHNuYXBzaG90IGlzIHByZXNlbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1c2FnZUluZm9Ub1F1b3Rhcyh1c2FnZTogVXNhZ2VJbmZvIHwgdW5kZWZpbmVkKTogSUFnZW50SG9zdFF1b3RhVXBkYXRlIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbWV0YSA9IHJlYWRVc2FnZUluZm9NZXRhKHVzYWdlKTtcblx0Y29uc3Qgc25hcHNob3RzID0gbWV0YT8ucXVvdGFTbmFwc2hvdHM7XG5cdGlmICghc25hcHNob3RzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IHVwZGF0ZTogTXV0YWJsZTxJQWdlbnRIb3N0UXVvdGFVcGRhdGU+ID0ge307XG5cdGxldCBoYXNBbnkgPSBmYWxzZTtcblxuXHRjb25zdCBjaGF0ID0gc25hcHNob3RzWydjaGF0J10gJiYgbWFwQWNjb3VudFF1b3RhU25hcHNob3Qoc25hcHNob3RzWydjaGF0J10pO1xuXHRpZiAoY2hhdCkge1xuXHRcdHVwZGF0ZS5jaGF0ID0gY2hhdDtcblx0XHRoYXNBbnkgPSB0cnVlO1xuXHR9XG5cdGNvbnN0IGNvbXBsZXRpb25zID0gc25hcHNob3RzWydjb21wbGV0aW9ucyddICYmIG1hcEFjY291bnRRdW90YVNuYXBzaG90KHNuYXBzaG90c1snY29tcGxldGlvbnMnXSk7XG5cdGlmIChjb21wbGV0aW9ucykge1xuXHRcdHVwZGF0ZS5jb21wbGV0aW9ucyA9IGNvbXBsZXRpb25zO1xuXHRcdGhhc0FueSA9IHRydWU7XG5cdH1cblx0Y29uc3QgcHJlbWl1bVJhdyA9IHNuYXBzaG90c1sncHJlbWl1bV9pbnRlcmFjdGlvbnMnXTtcblx0Y29uc3QgcHJlbWl1bUNoYXQgPSBwcmVtaXVtUmF3ICYmIG1hcEFjY291bnRRdW90YVNuYXBzaG90KHByZW1pdW1SYXcpO1xuXHRpZiAocHJlbWl1bUNoYXQpIHtcblx0XHR1cGRhdGUucHJlbWl1bUNoYXQgPSBwcmVtaXVtQ2hhdDtcblx0XHRoYXNBbnkgPSB0cnVlO1xuXHR9XG5cdGlmIChwcmVtaXVtUmF3KSB7XG5cdFx0dXBkYXRlLmFkZGl0aW9uYWxVc2FnZUVuYWJsZWQgPSBwcmVtaXVtUmF3Lm92ZXJhZ2VBbGxvd2VkV2l0aEV4aGF1c3RlZFF1b3RhID8/IGZhbHNlO1xuXHRcdHVwZGF0ZS5hZGRpdGlvbmFsVXNhZ2VDb3VudCA9IHR5cGVvZiBwcmVtaXVtUmF3Lm92ZXJhZ2UgPT09ICdudW1iZXInID8gcHJlbWl1bVJhdy5vdmVyYWdlIDogMDtcblx0XHRoYXNBbnkgPSB0cnVlO1xuXHR9XG5cblx0Y29uc3QgcmVzZXREYXRlID0gcHJlbWl1bVJhdz8ucmVzZXREYXRlID8/IHNuYXBzaG90c1snY2hhdCddPy5yZXNldERhdGU7XG5cdGlmIChyZXNldERhdGUpIHtcblx0XHR1cGRhdGUucmVzZXREYXRlID0gcmVzZXREYXRlO1xuXHR9XG5cblx0cmV0dXJuIGhhc0FueSA/IHVwZGF0ZSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBjb21wbGV0ZWQgdHVybnMgZnJvbSB0aGUgcHJvdG9jb2wgc3RhdGUgaW50byBzZXNzaW9uIGhpc3RvcnkgaXRlbXMuXG4gKlxuICogUGVyIHR1cm4sIHByZWZlcnMgYHR1cm4udXNhZ2U/Lm1vZGVsYCBzbyBlYWNoIHJlcXVlc3QvcmVzcG9uc2UgcGFpciBzaG93c1xuICogdGhlIG1vZGVsIHRoYXQgYWN0dWFsbHkgcmFuLCBldmVuIGlmIHRoZSB1c2VyIGNoYW5nZWQgbW9kZWxzIG1pZC1zZXNzaW9uLlxuICogVGhlIGBsb29rdXBgIGNhbGxiYWNrIGlzIHJlc3BvbnNpYmxlIGZvciBhbnkgc2Vzc2lvbi1sZXZlbCBmYWxsYmFjayAoZS5nLlxuICogYHN1bW1hcnkubW9kZWw/LmlkYCB3aGVuIHVzYWdlIGhhc24ndCByZXBvcnRlZCBhIG1vZGVsIHlldCkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0dXJuc1RvSGlzdG9yeShiYWNrZW5kU2Vzc2lvbjogVVJJLCB0dXJuczogcmVhZG9ubHkgVHVybltdLCBwYXJ0aWNpcGFudElkOiBzdHJpbmcsIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZywgbG9va3VwPzogVHVybk1vZGVsTG9va3VwLCBlcnJvckNvbnRleHQ/OiBJQ2hhdEVycm9yQ29udGV4dCwgdGVybWluYWxDb21tYW5kUHJlZml4Pzogc3RyaW5nKTogSUNoYXRTZXNzaW9uSGlzdG9yeUl0ZW1bXSB7XG5cdGNvbnN0IGhpc3Rvcnk6IElDaGF0U2Vzc2lvbkhpc3RvcnlJdGVtW10gPSBbXTtcblx0Zm9yIChjb25zdCB0dXJuIG9mIHR1cm5zKSB7XG5cdFx0Y29uc3QgcmF3TW9kZWxJZCA9IHR1cm4udXNhZ2U/Lm1vZGVsO1xuXHRcdGNvbnN0IG1vZGVsSWQgPSBsb29rdXA/LnRvTGFuZ3VhZ2VNb2RlbElkKHJhd01vZGVsSWQpO1xuXHRcdGNvbnN0IGRldGFpbHMgPSBsb29rdXA/LnRvUmVzcG9uc2VEZXRhaWxzKHJhd01vZGVsSWQsIHR1cm4udXNhZ2UpO1xuXG5cdFx0Ly8gUmVxdWVzdFxuXHRcdGNvbnN0IHZhcmlhYmxlRGF0YSA9IG1lc3NhZ2VUb1ZhcmlhYmxlRGF0YSh0dXJuLm1lc3NhZ2UsIGNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHRcdGNvbnN0IGlzU3lzdGVtSW5pdGlhdGVkID0gdHVybi5tZXNzYWdlLm9yaWdpbi5raW5kID09PSBNZXNzYWdlS2luZC5TeXN0ZW1Ob3RpZmljYXRpb247XG5cdFx0Ly8gQSBtZXNzYWdlIHJ1bnMgYXMgYSB0ZXJtaW5hbCBjb21tYW5kIHdoZW4gaXQgc3RhcnRzIHdpdGggdGhlIGhvc3Qnc1xuXHRcdC8vIGFkdmVydGlzZWQgcHJlZml4IGFuZCBoYXMgYSBub24tZW1wdHkgY29tbWFuZCBhZnRlciBpdCAobWlycm9yaW5nIHRoZVxuXHRcdC8vIGhvc3Qtc2lkZSBiYW5nIHBhcnNlciwgd2hlcmUgYSBsb25lIGAhYCBpcyBmb3J3YXJkZWQgdG8gdGhlIGFnZW50KS5cblx0XHRjb25zdCBpc1Rlcm1pbmFsUmVxdWVzdCA9IGlzVGVybWluYWxDb21tYW5kUHJvbXB0KHR1cm4ubWVzc2FnZS50ZXh0LCB0ZXJtaW5hbENvbW1hbmRQcmVmaXgpO1xuXHRcdGhpc3RvcnkucHVzaCh7XG5cdFx0XHRpZDogdHVybi5pZCxcblx0XHRcdHR5cGU6ICdyZXF1ZXN0Jyxcblx0XHRcdHByb21wdDogdHVybi5tZXNzYWdlLnRleHQsXG5cdFx0XHRwYXJ0aWNpcGFudDogcGFydGljaXBhbnRJZCxcblx0XHRcdG1vZGVsSWQsXG5cdFx0XHQuLi4odHVybi5zdGFydGVkQXQgIT09IHVuZGVmaW5lZCAmJiBOdW1iZXIuaXNGaW5pdGUoRGF0ZS5wYXJzZSh0dXJuLnN0YXJ0ZWRBdCkpID8geyB0aW1lc3RhbXA6IERhdGUucGFyc2UodHVybi5zdGFydGVkQXQpIH0gOiB7fSksXG5cdFx0XHR2YXJpYWJsZURhdGEsXG5cdFx0XHQuLi4oaXNTeXN0ZW1Jbml0aWF0ZWQgPyB7XG5cdFx0XHRcdGlzU3lzdGVtSW5pdGlhdGVkOiB0cnVlLFxuXHRcdFx0fSA6IHt9KSxcblx0XHRcdC4uLihpc1Rlcm1pbmFsUmVxdWVzdCA/IHtcblx0XHRcdFx0aXNUZXJtaW5hbFJlcXVlc3Q6IHRydWUsXG5cdFx0XHR9IDoge30pLFxuXHRcdH0pO1xuXG5cdFx0Ly8gUmVzcG9uc2UgcGFydHMgXHUyMDE0IGl0ZXJhdGUgdGhlIHVuaWZpZWQgcmVzcG9uc2VQYXJ0cyBhcnJheVxuXHRcdGNvbnN0IHBhcnRzOiBJQ2hhdFByb2dyZXNzW10gPSBbXTtcblx0XHRjb25zdCBhdXRvTW9kZVJlc29sdXRpb24gPSBsb29rdXA/LnRvQXV0b01vZGVSZXNvbHV0aW9uPy4odHVybi51c2FnZSk7XG5cdFx0aWYgKGF1dG9Nb2RlUmVzb2x1dGlvbikge1xuXHRcdFx0cGFydHMucHVzaChhdXRvTW9kZVJlc29sdXRpb24pO1xuXHRcdH1cblx0XHRjb25zdCB1c2FnZSA9IHVzYWdlSW5mb1RvQ2hhdFVzYWdlKHR1cm4udXNhZ2UpO1xuXHRcdGlmICh1c2FnZSkge1xuXHRcdFx0cGFydHMucHVzaCh1c2FnZSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBycCBvZiB0dXJuLnJlc3BvbnNlUGFydHMpIHtcblx0XHRcdHN3aXRjaCAocnAua2luZCkge1xuXHRcdFx0XHRjYXNlIFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd246XG5cdFx0XHRcdFx0aWYgKHJwLmNvbnRlbnQpIHtcblx0XHRcdFx0XHRcdHBhcnRzLnB1c2goeyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKHJwLmNvbnRlbnQpIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsOiB7XG5cdFx0XHRcdFx0Y29uc3QgdGMgPSBycC50b29sQ2FsbCBhcyBJQ29tcGxldGVkVG9vbENhbGw7XG5cdFx0XHRcdFx0Y29uc3QgZmlsZUVkaXRQYXJ0cyA9IGNvbXBsZXRlZFRvb2xDYWxsVG9FZGl0UGFydHModGMsIGNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHRcdFx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSBjb21wbGV0ZWRUb29sQ2FsbFRvU2VyaWFsaXplZCh0YywgdW5kZWZpbmVkLCBiYWNrZW5kU2Vzc2lvbiwgY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdFx0XHRcdFx0aWYgKGZpbGVFZGl0UGFydHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0c2VyaWFsaXplZC5wcmVzZW50YXRpb24gPSBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbi5IaWRkZW47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHBhcnRzLnB1c2goc2VyaWFsaXplZCk7XG5cdFx0XHRcdFx0cGFydHMucHVzaCguLi5maWxlRWRpdFBhcnRzKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nOlxuXHRcdFx0XHRcdGlmIChycC5jb250ZW50KSB7XG5cdFx0XHRcdFx0XHRwYXJ0cy5wdXNoKHsga2luZDogJ3RoaW5raW5nJywgdmFsdWU6IHJwLmNvbnRlbnQsIGlkOiBycC5pZCB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgUmVzcG9uc2VQYXJ0S2luZC5TeXN0ZW1Ob3RpZmljYXRpb246XG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Y29uc3QgcHJvZ3Jlc3MgPSBzeXN0ZW1Ob3RpZmljYXRpb25Ub0NoYXRQYXJ0KHJwLmNvbnRlbnQsIGNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHRcdFx0XHRcdFx0aWYgKHByb2dyZXNzKSB7XG5cdFx0XHRcdFx0XHRcdHBhcnRzLnB1c2gocHJvZ3Jlc3MpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBSZXNwb25zZVBhcnRLaW5kLkNvbnRlbnRSZWY6XG5cdFx0XHRcdFx0Ly8gQ29udGVudCByZWZlcmVuY2VzIGFyZSBub3QgcmVzdG9yZWQgaW50byBoaXN0b3J5O1xuXHRcdFx0XHRcdC8vIHRoZXkgYXJlIGhhbmRsZWQgc2VwYXJhdGVseSBieSB0aGUgY29udGVudCBwcm92aWRlci5cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBSZXNwb25zZVBhcnRLaW5kLklucHV0UmVxdWVzdDoge1xuXHRcdFx0XHRcdHBhcnRzLnB1c2goaW5wdXRSZXF1ZXN0UmVzcG9uc2VQYXJ0VG9Qcm9ncmVzcyhycCwgY29ubmVjdGlvbkF1dGhvcml0eSkpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRXJyb3IgZGV0YWlscyBmb3IgZmFpbGVkIHR1cm5zLiBTdXJmYWNlZCBhcyB0aGUgcmVzcG9uc2Unc1xuXHRcdC8vIGBlcnJvckRldGFpbHNgIChyYXRoZXIgdGhhbiBpbmxpbmUgbWFya2Rvd24pIHNvIHRoZSBjaGF0IHJlbmRlcnMgYVxuXHRcdC8vIHByb3BlciBlcnJvciBcdTIwMTQgaW5jbHVkaW5nIHRoZSBxdW90YS1leGNlZWRlZCB1cGdyYWRlIGFmZm9yZGFuY2UgXHUyMDE0XG5cdFx0Ly8gY29uc2lzdGVudGx5IHdpdGggdGhlIGxpdmUgYWdlbnQgcmVzdWx0LlxuXHRcdGxldCBlcnJvckRldGFpbHM6IElDaGF0UmVzcG9uc2VFcnJvckRldGFpbHMgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHR1cm4uc3RhdGUgPT09IFR1cm5TdGF0ZS5FcnJvciAmJiB0dXJuLmVycm9yKSB7XG5cdFx0XHRlcnJvckRldGFpbHMgPSBnZXRDaGF0RXJyb3JEZXRhaWxzRnJvbU1ldGEodHVybi5lcnJvciwgZXJyb3JDb250ZXh0KVxuXHRcdFx0XHQ/PyB7IG1lc3NhZ2U6IGBFcnJvcjogKCR7dHVybi5lcnJvci5lcnJvclR5cGV9KSAke3R1cm4uZXJyb3IubWVzc2FnZX1gIH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnRlZEF0ID0gdHVybi5zdGFydGVkQXQgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IERhdGUucGFyc2UodHVybi5zdGFydGVkQXQpO1xuXHRcdGNvbnN0IGNvbXBsZXRlZEF0ID0gc3RhcnRlZEF0ICE9PSB1bmRlZmluZWQgJiYgTnVtYmVyLmlzRmluaXRlKHN0YXJ0ZWRBdCkgJiYgdHlwZW9mIHR1cm4uZHVyYXRpb24gPT09ICdudW1iZXInICYmIE51bWJlci5pc0Zpbml0ZSh0dXJuLmR1cmF0aW9uKSAmJiB0dXJuLmR1cmF0aW9uID49IDBcblx0XHRcdD8gc3RhcnRlZEF0ICsgdHVybi5kdXJhdGlvblxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0aGlzdG9yeS5wdXNoKHsgdHlwZTogJ3Jlc3BvbnNlJywgcGFydHMsIHBhcnRpY2lwYW50OiBwYXJ0aWNpcGFudElkLCBkZXRhaWxzLCBlbGFwc2VkTXM6IHR1cm4uZHVyYXRpb24sIGNvbXBsZXRlZEF0LCAuLi4oZXJyb3JEZXRhaWxzID8geyBlcnJvckRldGFpbHMgfSA6IHt9KSB9KTtcblx0fVxuXHRyZXR1cm4gaGlzdG9yeTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBhIHR1cm4ncyBwZXJzaXN0ZWQge0BsaW5rIE1lc3NhZ2V9IGludG8gdGhlIGNoYXQtbGF5ZXJcbiAqIHtAbGluayBJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGF9IHNoYXBlIHNvIGF0dGFjaG1lbnRzIHN1cnZpdmUgYVxuICogaGlzdG9yeSByZXBsYXkgKGFuZCBwZW5kaW5nL3NlcnZlci1pbml0aWF0ZWQgdHVybiBzeW50aGVzaXMpLiBSZXR1cm5zXG4gKiBgdW5kZWZpbmVkYCB3aGVuIHRoZSBtZXNzYWdlIGhhcyBubyBjb252ZXJ0aWJsZSBhdHRhY2htZW50cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1lc3NhZ2VUb1ZhcmlhYmxlRGF0YShtZXNzYWdlOiBNZXNzYWdlLCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGEgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gbWVzc2FnZUF0dGFjaG1lbnRzVG9WYXJpYWJsZURhdGEobWVzc2FnZS5hdHRhY2htZW50cywgY29ubmVjdGlvbkF1dGhvcml0eSwgbWVzc2FnZS50ZXh0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1lc3NhZ2VBdHRhY2htZW50c1RvVmFyaWFibGVEYXRhKGF0dGFjaG1lbnRzOiByZWFkb25seSBNZXNzYWdlQXR0YWNobWVudFtdIHwgdW5kZWZpbmVkLCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcsIG1lc3NhZ2VUZXh0Pzogc3RyaW5nKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFhdHRhY2htZW50cz8ubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB2YXJpYWJsZXM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtdO1xuXHQvLyBBZ2VudCBmZWVkYmFjayBpcyBzZW50IGFzIG9uZSBhbm5vdGF0aW9ucyBhdHRhY2htZW50IHBlciBjb21tZW50OyByZXN0b3JlXG5cdC8vIHRoZW0gaW50byBhIHNpbmdsZSBhZ2dyZWdhdGVkIGFnZW50RmVlZGJhY2sgZW50cnkgc28gaGlzdG9yeSBzaG93cyBvbmVcblx0Ly8gXCJOIGNvbW1lbnRzXCIgY2hpcCByYXRoZXIgdGhhbiBvbmUgY2hpcCBwZXIgY29tbWVudC5cblx0Y29uc3QgYWdncmVnYXRlZEZlZWRiYWNrID0gYWdncmVnYXRlQWdlbnRGZWVkYmFja0Fubm90YXRpb25BdHRhY2htZW50cyhhdHRhY2htZW50cywgY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdGlmIChhZ2dyZWdhdGVkRmVlZGJhY2spIHtcblx0XHR2YXJpYWJsZXMucHVzaChhZ2dyZWdhdGVkRmVlZGJhY2spO1xuXHR9XG5cdGNvbnN0IGNvbnN1bWVkQXR0YWNobWVudHMgPSBuZXcgU2V0PE1lc3NhZ2VBdHRhY2htZW50PigpO1xuXHRmb3IgKGNvbnN0IGEgb2YgYXR0YWNobWVudHMpIHtcblx0XHRpZiAoaXNBZ2VudEZlZWRiYWNrQW5ub3RhdGlvbnNBdHRhY2htZW50KGEpIHx8IGNvbnN1bWVkQXR0YWNobWVudHMuaGFzKGEpKSB7XG5cdFx0XHRjb250aW51ZTsgLy8gaGFuZGxlZCBieSB0aGUgYWdncmVnYXRpb24gYWJvdmVcblx0XHR9XG5cdFx0Y29uc3QgZWxlbWVudCA9IHJlc3RvcmVFbGVtZW50VmFyaWFibGVFbnRyeShhLCBhLnR5cGUgPT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUgPyBhLm1vZGVsUmVwcmVzZW50YXRpb24gOiB1bmRlZmluZWQpO1xuXHRcdGlmIChlbGVtZW50KSB7XG5cdFx0XHRjb25zdCBjb3JyZWxhdGlvbklkID0gZ2V0RWxlbWVudEF0dGFjaG1lbnRDb3JyZWxhdGlvbklkKGEpO1xuXHRcdFx0Y29uc3QgaW1hZ2VBdHRhY2htZW50ID0gY29ycmVsYXRpb25JZFxuXHRcdFx0XHQ/IGF0dGFjaG1lbnRzLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5kaXNwbGF5S2luZCA9PT0gJ2ltYWdlJyAmJiBnZXRFbGVtZW50QXR0YWNobWVudENvcnJlbGF0aW9uSWQoY2FuZGlkYXRlKSA9PT0gY29ycmVsYXRpb25JZClcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBpbWFnZSA9IGltYWdlQXR0YWNobWVudCA/IG1lc3NhZ2VBdHRhY2htZW50VG9WYXJpYWJsZUVudHJ5KGltYWdlQXR0YWNobWVudCwgY29ubmVjdGlvbkF1dGhvcml0eSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoaW1hZ2VBdHRhY2htZW50ICYmIGltYWdlPy5raW5kID09PSAnaW1hZ2UnKSB7XG5cdFx0XHRcdGNvbnN1bWVkQXR0YWNobWVudHMuYWRkKGltYWdlQXR0YWNobWVudCk7XG5cdFx0XHR9XG5cdFx0XHR2YXJpYWJsZXMucHVzaChpbWFnZT8ua2luZCA9PT0gJ2ltYWdlJ1xuXHRcdFx0XHQ/IHsgLi4uZWxlbWVudCwgaW1hZ2VEYXRhOiBpbWFnZS52YWx1ZSBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkgfHwgVVJJLmlzVXJpKGltYWdlLnZhbHVlKSA/IGltYWdlLnZhbHVlIDogdW5kZWZpbmVkLCBpbWFnZU1pbWVUeXBlOiBpbWFnZS5taW1lVHlwZSB9XG5cdFx0XHRcdDogZWxlbWVudCk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgdiA9IG1lc3NhZ2VBdHRhY2htZW50VG9WYXJpYWJsZUVudHJ5KGEsIGNvbm5lY3Rpb25BdXRob3JpdHksIG1lc3NhZ2VUZXh0KTtcblx0XHRpZiAodikge1xuXHRcdFx0dmFyaWFibGVzLnB1c2godik7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB2YXJpYWJsZXMubGVuZ3RoID4gMCA/IHsgdmFyaWFibGVzIH0gOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGFnZ3JlZ2F0ZUFnZW50RmVlZGJhY2tBbm5vdGF0aW9uQXR0YWNobWVudHMoYXR0YWNobWVudHM6IHJlYWRvbmx5IE1lc3NhZ2VBdHRhY2htZW50W10sIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyk6IElBZ2VudEZlZWRiYWNrVmFyaWFibGVFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGZlZWRiYWNrQXR0YWNobWVudHMgPSBhdHRhY2htZW50cy5maWx0ZXIoaXNBZ2VudEZlZWRiYWNrQW5ub3RhdGlvbnNBdHRhY2htZW50KTtcblx0aWYgKGZlZWRiYWNrQXR0YWNobWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRsZXQgc2Vzc2lvblJlc291cmNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCBhbm5vdGF0aW9uc1Jlc291cmNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGNvbnN0IGZlZWRiYWNrSXRlbXM6IElBZ2VudEZlZWRiYWNrVmFyaWFibGVFbnRyeVsnZmVlZGJhY2tJdGVtcyddW251bWJlcl1bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGF0dGFjaG1lbnQgb2YgZmVlZGJhY2tBdHRhY2htZW50cykge1xuXHRcdGFubm90YXRpb25zUmVzb3VyY2UgPz89IGF0dGFjaG1lbnQucmVzb3VyY2U7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSBnZXRBZ2VudEZlZWRiYWNrQXR0YWNobWVudE1ldGFkYXRhKGF0dGFjaG1lbnQpO1xuXHRcdGlmICghbWV0YWRhdGEpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRzZXNzaW9uUmVzb3VyY2UgPz89IG1ldGFkYXRhLnNlc3Npb25SZXNvdXJjZTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgbWV0YWRhdGEuZmVlZGJhY2tJdGVtcykge1xuXHRcdFx0ZmVlZGJhY2tJdGVtcy5wdXNoKHtcblx0XHRcdFx0aWQ6IGl0ZW0uaWQsXG5cdFx0XHRcdHRleHQ6IGl0ZW0udGV4dCxcblx0XHRcdFx0cmVzb3VyY2VVcmk6IHRvQWdlbnRIb3N0VXJpKFVSSS5wYXJzZShpdGVtLnJlc291cmNlVXJpKSwgY29ubmVjdGlvbkF1dGhvcml0eSksXG5cdFx0XHRcdHJhbmdlOiB0ZXh0UmFuZ2VUb0lSYW5nZShpdGVtLnJhbmdlKSxcblx0XHRcdFx0Li4uKGl0ZW0ucmVwbGllcz8ubGVuZ3RoID8geyByZXBsaWVzOiBpdGVtLnJlcGxpZXMgfSA6IHt9KSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXHRpZiAoZmVlZGJhY2tJdGVtcy5sZW5ndGggPT09IDAgfHwgIXNlc3Npb25SZXNvdXJjZSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRraW5kOiAnYWdlbnRGZWVkYmFjaycsXG5cdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdG5hbWU6IGZlZWRiYWNrSXRlbXMubGVuZ3RoID09PSAxXG5cdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEZlZWRiYWNrLm9uZScsIFwiMSBjb21tZW50XCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEZlZWRiYWNrLm1hbnknLCBcInswfSBjb21tZW50c1wiLCBmZWVkYmFja0l0ZW1zLmxlbmd0aCksXG5cdFx0dmFsdWU6IGZlZWRiYWNrQXR0YWNobWVudHNbMF0ubGFiZWwsXG5cdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2Uoc2Vzc2lvblJlc291cmNlKSxcblx0XHRhbm5vdGF0aW9uc1Jlc291cmNlOiBhbm5vdGF0aW9uc1Jlc291cmNlID8gVVJJLnBhcnNlKGFubm90YXRpb25zUmVzb3VyY2UpIDogdW5kZWZpbmVkLFxuXHRcdGZlZWRiYWNrSXRlbXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1lc3NhZ2VBdHRhY2htZW50VG9WYXJpYWJsZUVudHJ5KGF0dGFjaG1lbnQ6IE1lc3NhZ2VBdHRhY2htZW50LCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcsIG1lc3NhZ2VUZXh0Pzogc3RyaW5nKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdGlmIChpc0FnZW50RmVlZGJhY2tBdHRhY2htZW50KGF0dGFjaG1lbnQpKSB7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSBnZXRBZ2VudEZlZWRiYWNrQXR0YWNobWVudE1ldGFkYXRhKGF0dGFjaG1lbnQpO1xuXHRcdGlmIChtZXRhZGF0YSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ2FnZW50RmVlZGJhY2snLFxuXHRcdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRcdG5hbWU6IGF0dGFjaG1lbnQubGFiZWwsXG5cdFx0XHRcdHZhbHVlOiBhdHRhY2htZW50Lm1vZGVsUmVwcmVzZW50YXRpb24gfHwgYXR0YWNobWVudC5sYWJlbCxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UobWV0YWRhdGEuc2Vzc2lvblJlc291cmNlKSxcblx0XHRcdFx0ZmVlZGJhY2tJdGVtczogbWV0YWRhdGEuZmVlZGJhY2tJdGVtcy5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0XHRcdGlkOiBpdGVtLmlkLFxuXHRcdFx0XHRcdHRleHQ6IGl0ZW0udGV4dCxcblx0XHRcdFx0XHRyZXNvdXJjZVVyaTogdG9BZ2VudEhvc3RVcmkoVVJJLnBhcnNlKGl0ZW0ucmVzb3VyY2VVcmkpLCBjb25uZWN0aW9uQXV0aG9yaXR5KSxcblx0XHRcdFx0XHRyYW5nZTogdGV4dFJhbmdlVG9JUmFuZ2UoaXRlbS5yYW5nZSksXG5cdFx0XHRcdH0pKSxcblx0XHRcdFx0X21ldGE6IGF0dGFjaG1lbnQuX21ldGEsXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdGlmIChhdHRhY2htZW50LnR5cGUgPT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSkge1xuXHRcdGlmIChpc1Nlc3Npb25SZWZlcmVuY2VUcmFqZWN0b3J5QXR0YWNobWVudChhdHRhY2htZW50KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdXJpID0gdG9BZ2VudEhvc3RVcmkoVVJJLnBhcnNlKGF0dGFjaG1lbnQudXJpKSwgY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdFx0Y29uc3QgbmFtZSA9IGF0dGFjaG1lbnQubGFiZWw7XG5cdFx0Y29uc3QgaWQgPSB1cmkudG9TdHJpbmcoKSArIChhdHRhY2htZW50LnNlbGVjdGlvblxuXHRcdFx0PyBgOiR7YXR0YWNobWVudC5zZWxlY3Rpb24ucmFuZ2Uuc3RhcnQubGluZX0tJHthdHRhY2htZW50LnNlbGVjdGlvbi5yYW5nZS5lbmQubGluZX1gXG5cdFx0XHQ6ICcnKTtcblx0XHRjb25zdCBfbWV0YSA9IGF0dGFjaG1lbnQuX21ldGE7XG5cblx0XHRpZiAoYXR0YWNobWVudC5kaXNwbGF5S2luZCA9PT0gJ2RpcmVjdG9yeScpIHtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICdkaXJlY3RvcnknLCBpZCwgbmFtZSwgdmFsdWU6IHVyaSwgX21ldGEgfTtcblx0XHR9XG5cdFx0aWYgKGF0dGFjaG1lbnQuZGlzcGxheUtpbmQgPT09ICdpbWFnZScpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6ICdpbWFnZScsXG5cdFx0XHRcdGlkLFxuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHR2YWx1ZTogdXJpLFxuXHRcdFx0XHRpc1VSTDogdHJ1ZSxcblx0XHRcdFx0cmVmZXJlbmNlczogW3sga2luZDogJ3JlZmVyZW5jZScsIHJlZmVyZW5jZTogdXJpIH1dLFxuXHRcdFx0XHRfbWV0YSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGlmIChhdHRhY2htZW50LnNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ2ZpbGUnLFxuXHRcdFx0XHRpZCxcblx0XHRcdFx0bmFtZSxcblx0XHRcdFx0dmFsdWU6IHsgdXJpLCByYW5nZTogdGV4dFJhbmdlVG9JUmFuZ2UoYXR0YWNobWVudC5zZWxlY3Rpb24ucmFuZ2UpIH0sXG5cdFx0XHRcdF9tZXRhLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHsga2luZDogJ2ZpbGUnLCBpZCwgbmFtZSwgdmFsdWU6IHVyaSwgX21ldGEgfTtcblx0fVxuXG5cdGlmIChhdHRhY2htZW50LnR5cGUgPT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5FbWJlZGRlZFJlc291cmNlKSB7XG5cdFx0aWYgKCFhdHRhY2htZW50LmNvbnRlbnRUeXBlLnN0YXJ0c1dpdGgoJ2ltYWdlLycpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0bmFtZTogYXR0YWNobWVudC5sYWJlbCxcblx0XHRcdFx0dmFsdWU6IGRlY29kZUJhc2U2NChhdHRhY2htZW50LmRhdGEpLmJ1ZmZlcixcblx0XHRcdFx0X21ldGE6IGF0dGFjaG1lbnQuX21ldGEsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnaW1hZ2UnLFxuXHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0bmFtZTogYXR0YWNobWVudC5sYWJlbCB8fCAnaW1hZ2UnLFxuXHRcdFx0dmFsdWU6IGRlY29kZUJhc2U2NChhdHRhY2htZW50LmRhdGEpLmJ1ZmZlcixcblx0XHRcdG1pbWVUeXBlOiBhdHRhY2htZW50LmNvbnRlbnRUeXBlLFxuXHRcdFx0aXNVUkw6IGZhbHNlLFxuXHRcdFx0X21ldGE6IGF0dGFjaG1lbnQuX21ldGEsXG5cdFx0fTtcblx0fVxuXG5cdGlmIChhdHRhY2htZW50LnR5cGUgPT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5DaGF0KSB7XG5cdFx0cmV0dXJuIHJlc3RvcmVDaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeUZyb21BdHRhY2htZW50KGF0dGFjaG1lbnQsIG1lc3NhZ2VUZXh0KTtcblx0fVxuXG5cdGNvbnN0IGFnZW50SG9zdENvbXBsZXRpb25LaW5kID0gZ2V0QWdlbnRIb3N0Q29tcGxldGlvbktpbmQoYXR0YWNobWVudCk7XG5cdGlmIChhZ2VudEhvc3RDb21wbGV0aW9uS2luZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHRvQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnlGcm9tTWV0YWRhdGEoYWdlbnRIb3N0Q29tcGxldGlvbktpbmQsIGF0dGFjaG1lbnQubGFiZWwsIGF0dGFjaG1lbnQuX21ldGEpO1xuXHR9XG5cblx0Y29uc3QgbW9kZWxSZXByZXNlbnRhdGlvbiA9IGF0dGFjaG1lbnQudHlwZSA9PT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSA/IGF0dGFjaG1lbnQubW9kZWxSZXByZXNlbnRhdGlvbiA6IHVuZGVmaW5lZDtcblx0aWYgKGlzQnJvd3NlclZpZXdBdHRhY2htZW50KGF0dGFjaG1lbnQpICYmIG1vZGVsUmVwcmVzZW50YXRpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gZ2V0QnJvd3NlclZpZXdBdHRhY2htZW50TWV0YWRhdGEoYXR0YWNobWVudCk7XG5cdFx0aWYgKG1ldGFkYXRhKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAnYnJvd3NlclZpZXcnLFxuXHRcdFx0XHRpZDogbWV0YWRhdGEuYnJvd3NlclVyaSxcblx0XHRcdFx0bmFtZTogYXR0YWNobWVudC5sYWJlbCxcblx0XHRcdFx0dmFsdWU6IFVSSS5wYXJzZShtZXRhZGF0YS5icm93c2VyVXJpKSxcblx0XHRcdFx0YnJvd3NlcklkOiBtZXRhZGF0YS5icm93c2VySWQsXG5cdFx0XHRcdG1vZGVsRGVzY3JpcHRpb246IG1vZGVsUmVwcmVzZW50YXRpb24sXG5cdFx0XHRcdF9tZXRhOiBhdHRhY2htZW50Ll9tZXRhLFxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblx0aWYgKGF0dGFjaG1lbnQuZGlzcGxheUtpbmQgPT09ICd3b3Jrc3BhY2UnICYmIG1vZGVsUmVwcmVzZW50YXRpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnd29ya3NwYWNlJyxcblx0XHRcdGlkOiBhdHRhY2htZW50LmxhYmVsLFxuXHRcdFx0bmFtZTogYXR0YWNobWVudC5sYWJlbCxcblx0XHRcdHZhbHVlOiBtb2RlbFJlcHJlc2VudGF0aW9uLFxuXHRcdFx0X21ldGE6IGF0dGFjaG1lbnQuX21ldGEsXG5cdFx0fTtcblx0fVxuXHRpZiAoYXR0YWNobWVudC50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlZmVyZW5jZUVudHJ5ID0gcmVzdG9yZVNlc3Npb25SZWZlcmVuY2VWYXJpYWJsZUVudHJ5RnJvbUF0dGFjaG1lbnQoYXR0YWNobWVudCk7XG5cdFx0aWYgKHNlc3Npb25SZWZlcmVuY2VFbnRyeSkge1xuXHRcdFx0cmV0dXJuIHNlc3Npb25SZWZlcmVuY2VFbnRyeTtcblx0XHR9XG5cdH1cblx0Y29uc3QgcGFzdGVFbnRyeSA9IHJlc3RvcmVQYXN0ZVZhcmlhYmxlRW50cnlGcm9tQXR0YWNobWVudCh7XG5cdFx0bGFiZWw6IGF0dGFjaG1lbnQubGFiZWwsXG5cdFx0ZGlzcGxheUtpbmQ6IGF0dGFjaG1lbnQuZGlzcGxheUtpbmQsXG5cdFx0bW9kZWxSZXByZXNlbnRhdGlvbixcblx0XHRfbWV0YTogYXR0YWNobWVudC5fbWV0YSxcblx0fSk7XG5cdGlmIChwYXN0ZUVudHJ5KSB7XG5cdFx0cmV0dXJuIHBhc3RlRW50cnk7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdG5hbWU6IGF0dGFjaG1lbnQubGFiZWwsXG5cdFx0dmFsdWU6IG1vZGVsUmVwcmVzZW50YXRpb24gfHwgYXR0YWNobWVudC5sYWJlbCxcblx0XHRfbWV0YTogYXR0YWNobWVudC5fbWV0YSxcblx0fTtcbn1cblxuZnVuY3Rpb24gcmVzdG9yZUVsZW1lbnRWYXJpYWJsZUVudHJ5KGF0dGFjaG1lbnQ6IE1lc3NhZ2VBdHRhY2htZW50LCBtb2RlbFJlcHJlc2VudGF0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJRWxlbWVudFZhcmlhYmxlRW50cnkgfCB1bmRlZmluZWQge1xuXHRpZiAoYXR0YWNobWVudC5kaXNwbGF5S2luZCAhPT0gQWdlbnRIb3N0RWxlbWVudEF0dGFjaG1lbnREaXNwbGF5S2luZCB8fCBtb2RlbFJlcHJlc2VudGF0aW9uID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGZ1bGxOYW1lID0gL15FbGVtZW50OlxccyooPzxuYW1lPi4rKSQvbS5leGVjKG1vZGVsUmVwcmVzZW50YXRpb24pPy5ncm91cHM/Lm5hbWU7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2VsZW1lbnQnLFxuXHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRuYW1lOiBhdHRhY2htZW50LmxhYmVsLFxuXHRcdC4uLihmdWxsTmFtZSA/IHsgZnVsbE5hbWUgfSA6IHt9KSxcblx0XHRpY29uOiBDb2RpY29uLmxheW91dCxcblx0XHR2YWx1ZTogbW9kZWxSZXByZXNlbnRhdGlvbixcblx0XHRfbWV0YTogYXR0YWNobWVudC5fbWV0YSxcblx0fTtcbn1cblxuZnVuY3Rpb24gZ2V0QWdlbnRIb3N0Q29tcGxldGlvbktpbmQoYXR0YWNobWVudDogTWVzc2FnZUF0dGFjaG1lbnQpOiBBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZCB8IHVuZGVmaW5lZCB7XG5cdGlmIChhdHRhY2htZW50LnR5cGUgIT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHN3aXRjaCAoYXR0YWNobWVudC5kaXNwbGF5S2luZCkge1xuXHRcdGNhc2UgJ2NvbW1hbmQnOlxuXHRcdFx0cmV0dXJuIEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLkNvbW1hbmQ7XG5cdFx0Y2FzZSAnc2tpbGwnOlxuXHRcdFx0cmV0dXJuIEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLlNraWxsO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHRleHRSYW5nZVRvSVJhbmdlKHJhbmdlOiBUZXh0UmFuZ2UpOiBJUmFuZ2Uge1xuXHRyZXR1cm4ge1xuXHRcdHN0YXJ0TGluZU51bWJlcjogcmFuZ2Uuc3RhcnQubGluZSArIDEsXG5cdFx0c3RhcnRDb2x1bW46IHJhbmdlLnN0YXJ0LmNoYXJhY3RlciArIDEsXG5cdFx0ZW5kTGluZU51bWJlcjogcmFuZ2UuZW5kLmxpbmUgKyAxLFxuXHRcdGVuZENvbHVtbjogcmFuZ2UuZW5kLmNoYXJhY3RlciArIDEsXG5cdH07XG59XG5cbi8qKlxuICogQ29udmVydHMgYW4gYWN0aXZlIChpbi1wcm9ncmVzcykgdHVybidzIGFjY3VtdWxhdGVkIHN0YXRlIGludG8gcHJvZ3Jlc3NcbiAqIGl0ZW1zIHN1aXRhYmxlIGZvciByZXBsYXlpbmcgaW50byB0aGUgY2hhdCBVSSB3aGVuIHJlY29ubmVjdGluZyB0byBhXG4gKiBzZXNzaW9uIHRoYXQgaXMgbWlkLXR1cm4uXG4gKlxuICogUmV0dXJucyBzZXJpYWxpemVkIHByb2dyZXNzIGl0ZW1zIGZvciBjb250ZW50IGFscmVhZHkgcmVjZWl2ZWQgKHRleHQsXG4gKiByZWFzb25pbmcsIGNvbXBsZXRlZCB0b29sIGNhbGxzKSBhbmQgbGl2ZSB7QGxpbmsgQ2hhdFRvb2xJbnZvY2F0aW9ufVxuICogb2JqZWN0cyBmb3IgcnVubmluZyB0b29sIGNhbGxzIGFuZCBwZW5kaW5nIGNvbmZpcm1hdGlvbnMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhY3RpdmVUdXJuVG9Qcm9ncmVzcyhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgYWN0aXZlVHVybjogQWN0aXZlVHVybiwgY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nLCBtY3BTZXJ2ZXJBdXRob3JpdHkgPSBzZXNzaW9uUmVzb3VyY2UuYXV0aG9yaXR5LCB0b29sSW52b2NhdGlvbk9wdGlvbnM/OiBJQWdlbnRIb3N0VG9vbEludm9jYXRpb25PcHRpb25zKTogSUNoYXRQcm9ncmVzc1tdIHtcblx0Y29uc3QgcGFydHM6IElDaGF0UHJvZ3Jlc3NbXSA9IFtdO1xuXHRjb25zdCB1c2FnZSA9IHVzYWdlSW5mb1RvQ2hhdFVzYWdlKGFjdGl2ZVR1cm4udXNhZ2UpO1xuXHRpZiAodXNhZ2UpIHtcblx0XHRwYXJ0cy5wdXNoKHVzYWdlKTtcblx0fVxuXG5cdGZvciAoY29uc3QgcnAgb2YgYWN0aXZlVHVybi5yZXNwb25zZVBhcnRzKSB7XG5cdFx0c3dpdGNoIChycC5raW5kKSB7XG5cdFx0XHRjYXNlIFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd246XG5cdFx0XHRcdGlmIChycC5jb250ZW50KSB7XG5cdFx0XHRcdFx0cGFydHMucHVzaCh7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcocnAuY29udGVudCkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nOlxuXHRcdFx0XHRpZiAocnAuY29udGVudCkge1xuXHRcdFx0XHRcdHBhcnRzLnB1c2goeyBraW5kOiAndGhpbmtpbmcnLCB2YWx1ZTogcnAuY29udGVudCwgaWQ6IHJwLmlkIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsOiB7XG5cdFx0XHRcdGNvbnN0IHRjID0gcnAudG9vbENhbGw7XG5cdFx0XHRcdGNvbnN0IGlzT3RoZXJDbGllbnRUb29sQ2FsbCA9IHRjLmNvbnRyaWJ1dG9yPy5raW5kID09PSBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnRcblx0XHRcdFx0XHQmJiB0b29sSW52b2NhdGlvbk9wdGlvbnNcblx0XHRcdFx0XHQmJiB0Yy5jb250cmlidXRvci5jbGllbnRJZCAhPT0gdG9vbEludm9jYXRpb25PcHRpb25zLmN1cnJlbnRDbGllbnRJZDtcblx0XHRcdFx0aWYgKHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkIHx8IHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ2FuY2VsbGVkKSB7XG5cdFx0XHRcdFx0cGFydHMucHVzaChjb21wbGV0ZWRUb29sQ2FsbFRvU2VyaWFsaXplZCh0YyBhcyBJQ29tcGxldGVkVG9vbENhbGwsIHVuZGVmaW5lZCwgc2Vzc2lvblJlc291cmNlLCBjb25uZWN0aW9uQXV0aG9yaXR5KSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcgJiYgIWlzT3RoZXJDbGllbnRUb29sQ2FsbCkge1xuXHRcdFx0XHRcdHBhcnRzLnB1c2godG9vbENhbGxTdGF0ZVRvU3RyZWFtaW5nSW52b2NhdGlvbih0YywgdW5kZWZpbmVkLCBzZXNzaW9uUmVzb3VyY2UsIGNvbm5lY3Rpb25BdXRob3JpdHksIG1jcFNlcnZlckF1dGhvcml0eSkpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUnVubmluZyB8fCB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkF1dGhSZXF1aXJlZCB8fCB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyB8fCB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24pIHtcblx0XHRcdFx0XHRwYXJ0cy5wdXNoKHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMsIHVuZGVmaW5lZCwgc2Vzc2lvblJlc291cmNlLCBjb25uZWN0aW9uQXV0aG9yaXR5LCBtY3BTZXJ2ZXJBdXRob3JpdHksIHRvb2xJbnZvY2F0aW9uT3B0aW9ucykpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBSZXNwb25zZVBhcnRLaW5kLlN5c3RlbU5vdGlmaWNhdGlvbjpcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnN0IHByb2dyZXNzID0gc3lzdGVtTm90aWZpY2F0aW9uVG9DaGF0UGFydChycC5jb250ZW50LCBjb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0XHRcdFx0XHRpZiAocHJvZ3Jlc3MpIHtcblx0XHRcdFx0XHRcdHBhcnRzLnB1c2gocHJvZ3Jlc3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUmVzcG9uc2VQYXJ0S2luZC5Db250ZW50UmVmOlxuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcGFydHM7XG59XG5cbmZ1bmN0aW9uIGdldFRlcm1pbmFsSW5wdXQodGM6IFRvb2xDYWxsU3RhdGUpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcgJiYgdGMudG9vbElucHV0KSB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBKU09OLnBhcnNlKHRjLnRvb2xJbnB1dCkuY29tbWFuZCB8fCB0Yy50b29sSW5wdXQ7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdGMudG9vbElucHV0O1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGdldFRlcm1pbmFsT3V0cHV0KHRjOiBUb29sQ2FsbFN0YXRlKSB7XG5cdGlmICh0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCAmJiB0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgdGVybWluYWxDb250ZW50ID0gZ2V0VGVybWluYWxDb250ZW50KHRjLmNvbnRlbnQpO1xuXHRjb25zdCB0ZXJtaW5hbFJlc3VsdCA9IGdldFRlcm1pbmFsQ29tbWFuZFJlc3VsdCh0Yyk7XG5cblx0Ly8gUHJlZmVyIHRoZSBzdHJ1Y3R1cmVkIHRlcm1pbmFsIHNuYXBzaG90LiBUZXh0IGNvbnRlbnQgaXMgYSBjb21wYXRpYmlsaXR5XG5cdC8vIGZhbGxiYWNrIGZvciBvbGRlci9yZXN0b3JlZCByZXN1bHRzIGFuZCBjYW4gaW5jbHVkZSBsZWdhY3kgYm9va2tlZXBpbmcuXG5cdGxldCB0ZXh0ID0gdGVybWluYWxSZXN1bHQ/LnByZXZpZXc7XG5cdGNvbnN0IGhhc1JldGFpbmVkTm9uUHR5U25hcHNob3QgPSB0ZXJtaW5hbENvbnRlbnQ/LmlzUHR5ID09PSBmYWxzZSAmJiB0ZXh0ICE9PSB1bmRlZmluZWQ7XG5cdGlmICh0ZXh0ID09PSB1bmRlZmluZWQgJiYgdGVybWluYWxDb250ZW50Py5pc1B0eSAhPT0gZmFsc2UpIHtcblx0XHRjb25zdCBmYWxsYmFja1RleHQgPSB0Yy5jb250ZW50Py5maW5kKGlzVG9vbFJlc3VsdFRleHRDb250ZW50KT8udGV4dDtcblx0XHR0ZXh0ID0gZmFsbGJhY2tUZXh0ID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBzdHJpcExlZ2FjeVRlcm1pbmFsRXhpdE1hcmtlcnMoZmFsbGJhY2tUZXh0KTtcblx0fVxuXHRpZiAodGV4dCA9PT0gdW5kZWZpbmVkIHx8ICghdGV4dCAmJiAhaGFzUmV0YWluZWROb25QdHlTbmFwc2hvdCAmJiB0ZXJtaW5hbFJlc3VsdD8udHJ1bmNhdGVkICE9PSB0cnVlKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdHRleHQ6IHRleHQucmVwbGFjZSgvXFxyP1xcbi9nLCAnXFxyXFxuJyksXG5cdFx0Li4uKHRlcm1pbmFsUmVzdWx0Py50cnVuY2F0ZWQgIT09IHVuZGVmaW5lZCA/IHsgdHJ1bmNhdGVkOiB0ZXJtaW5hbFJlc3VsdC50cnVuY2F0ZWQgfSA6IHt9KSxcblx0fTtcbn1cblxuZnVuY3Rpb24gc3RyaXBMZWdhY3lUZXJtaW5hbEV4aXRNYXJrZXJzKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiB0ZXh0LnJlcGxhY2UoLzxzaGVsbElkOltePlxcclxcbl0qY29tcGxldGVkIHdpdGggZXhpdCBjb2RlIFxcZCs+XFxzKiQvaSwgJycpO1xufVxuXG5mdW5jdGlvbiBpc1Rvb2xSZXN1bHRUZXh0Q29udGVudChjb250ZW50OiBUb29sUmVzdWx0Q29udGVudCk6IGNvbnRlbnQgaXMgRXh0cmFjdDxUb29sUmVzdWx0Q29udGVudCwgeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCB9PiB7XG5cdHJldHVybiBjb250ZW50LnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0O1xufVxuXG5mdW5jdGlvbiBnZXRUZXJtaW5hbENvbW1hbmRTdGF0ZSh0YzogVG9vbENhbGxTdGF0ZSwgZmFsbGJhY2tTdWNjZXNzPzogYm9vbGVhbik6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGFbJ3Rlcm1pbmFsQ29tbWFuZFN0YXRlJ10gfCB1bmRlZmluZWQge1xuXHRjb25zdCB0ZXJtaW5hbFJlc3VsdCA9IHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkIHx8IHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUnVubmluZ1xuXHRcdD8gZ2V0VGVybWluYWxDb21tYW5kUmVzdWx0KHRjKVxuXHRcdDogdW5kZWZpbmVkO1xuXHRpZiAodGVybWluYWxSZXN1bHQ/LmV4aXRDb2RlICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4geyBleGl0Q29kZTogdGVybWluYWxSZXN1bHQuZXhpdENvZGUgfTtcblx0fVxuXHRpZiAoKHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkIHx8IHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUnVubmluZykgJiYgZ2V0VGVybWluYWxDb250ZW50KHRjLmNvbnRlbnQpPy5pc1B0eSA9PT0gZmFsc2UpIHtcblx0XHQvLyBBIGZhaWxlZCBTREsgc2hlbGwgY2FsbCBkb2VzIG5vdCBhbHdheXMgaW5jbHVkZSBzaGVsbF9leGl0IGNvbnRlbnQuXG5cdFx0Ly8gUHJlc2VydmUgdGhhdCBmYWlsdXJlIGZvciBkZWNvcmF0aW9uL2NvbXBsZXRpb24gc3RhdGUgd2l0aG91dFxuXHRcdC8vIGZhYnJpY2F0aW5nIGEgc3VjY2Vzc2Z1bCBwcm9jZXNzIGV4aXQgd2hlbiBub25lIHdhcyByZXBvcnRlZC5cblx0XHRyZXR1cm4gZmFsbGJhY2tTdWNjZXNzID09PSBmYWxzZSA/IHsgZXhpdENvZGU6IDEgfSA6IHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gZmFsbGJhY2tTdWNjZXNzID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiB7IGV4aXRDb2RlOiBmYWxsYmFja1N1Y2Nlc3MgPyAwIDogMSB9O1xufVxuXG5mdW5jdGlvbiBpc1Rvb2xSZXN1bHRUZXJtaW5hbENvbnRlbnQoY29udGVudDogVG9vbFJlc3VsdENvbnRlbnQpOiBjb250ZW50IGlzIEV4dHJhY3Q8VG9vbFJlc3VsdENvbnRlbnQsIHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsIH0+IHtcblx0cmV0dXJuIGNvbnRlbnQudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsO1xufVxuXG4vKipcbiAqIFNoYXBlIG9mIHRoZSBgdGVybWluYWxDb21wbGV0ZWAgdG9vbCByZXN1bHQgYmxvY2sgdGhhdCBBSFAgMC43LjAgcmVtb3ZlZFxuICogKGl0cyBkYXRhIG1vdmVkIG9udG8gdGhlIHRlcm1pbmFsIGJsb2NrIGFzIGByZXN1bHRgKS4gT2xkIHBlcnNpc3RlZCB0dXJuc1xuICogbWF5IHN0aWxsIGNhcnJ5IGl0LCBzbyBjb21wbGV0aW9uIGRhdGEgZmFsbHMgYmFjayB0byBpdC5cbiAqL1xuaW50ZXJmYWNlIElMZWdhY3lUZXJtaW5hbENvbXBsZXRlQ29udGVudCB7XG5cdHR5cGU6ICd0ZXJtaW5hbENvbXBsZXRlJztcblx0ZXhpdENvZGU/OiBudW1iZXI7XG5cdHByZXZpZXc/OiBzdHJpbmc7XG5cdHRydW5jYXRlZD86IGJvb2xlYW47XG59XG5cbi8qKlxuICogQ29tcGxldGlvbiBkYXRhIGZvciBhIHRlcm1pbmFsLXN0eWxlIHRvb2wgY2FsbDogdGhlIHRlcm1pbmFsIGJsb2NrJ3NcbiAqIGByZXN1bHRgLCBmYWxsaW5nIGJhY2sgdG8gYSBsZWdhY3kgYHRlcm1pbmFsQ29tcGxldGVgIGJsb2NrLlxuICovXG5mdW5jdGlvbiBnZXRUZXJtaW5hbENvbW1hbmRSZXN1bHQodGM6IHsgY29udGVudD86IFRvb2xSZXN1bHRDb250ZW50W10gfSk6IFRlcm1pbmFsQ29tbWFuZFJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHJlc3VsdCA9IHRjLmNvbnRlbnQ/LmZpbmQoaXNUb29sUmVzdWx0VGVybWluYWxDb250ZW50KT8ucmVzdWx0O1xuXHRpZiAocmVzdWx0KSB7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXHRyZXR1cm4gdGMuY29udGVudD8uZmluZChjID0+IChjIGFzIHsgdHlwZTogc3RyaW5nIH0pLnR5cGUgPT09ICd0ZXJtaW5hbENvbXBsZXRlJykgYXMgSUxlZ2FjeVRlcm1pbmFsQ29tcGxldGVDb250ZW50IHwgdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBnZXRUZXJtaW5hbExhbmd1YWdlKHRjOiBUb29sQ2FsbFN0YXRlKSB7XG5cdHJldHVybiB0Yy50b29sTmFtZSA9PT0gJ3Bvd2Vyc2hlbGwnID8gJ3Bvd2Vyc2hlbGwnIDogJ3NoZWxsc2NyaXB0Jztcbn1cblxuLyoqXG4gKiBUcnVlIGlmIHRoaXMgdG9vbCBjYWxsIHNob3VsZCByZW5kZXIgYXMgYSB0ZXJtaW5hbCBwaWxsIGluIHRoZSBjaGF0IFVJLlxuICpcbiAqIENvbWJpbmVzIHRocmVlIHNpZ25hbHMgc28gdGhlIHdvcmtiZW5jaCByZW5kZXJzIGNvbnNpc3RlbnRseSBhY3Jvc3MgZXZlcnlcbiAqIHN0YWdlIG9mIHRoZSB0b29sIGxpZmVjeWNsZTpcbiAqXG4gKiAxLiBgZXhpc3RpbmdLaW5kID09PSAndGVybWluYWwnYCBcdTIwMTQgcHJlc2VydmUgdGhlIHByaW9yIHJlbmRlciBkZWNpc2lvbiBzbyBhXG4gKiAgICB0b29sIGFscmVhZHkgc2V0IHVwIGFzIHRlcm1pbmFsIHN0YXlzIHRlcm1pbmFsIGFjcm9zcyBzbmFwc2hvdHMuXG4gKiAyLiBgZ2V0VG9vbEtpbmQodGMpID09PSAndGVybWluYWwnYCB3aXRoIGEgY29tbWFuZCBhdmFpbGFibGUgXHUyMDE0IHRoZVxuICogICAgYWx3YXlzLWF2YWlsYWJsZSBgX21ldGEudG9vbEtpbmRgIGZsYWcgc2V0IGJ5IHRoZSBldmVudCBtYXBwZXIgZm9yXG4gKiAgICBidWlsdC1pbiBgYmFzaGAvYHBvd2Vyc2hlbGxgIFNESyB0b29scyB0aGF0IG5ldmVyIGVtaXQgYVxuICogICAge0BsaW5rIFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbH0gY29udGVudCBibG9jay4gV2Ugb25seSByZW5kZXIgdGhlXG4gKiAgICB0ZXJtaW5hbCBwaWxsIG9uY2Ugd2UgYWN0dWFsbHkgaGF2ZSB0aGUgY29tbWFuZCAoYGdldFRlcm1pbmFsSW5wdXRgKTpcbiAqICAgIHJlbmRlcmluZyBhIHRlcm1pbmFsIHBpbGwgd2l0aCBhbiBlbXB0eSBjb21tYW5kIGxpbmUgbG9va3MgYnJva2VuLCBzb1xuICogICAgdW50aWwgdGhlIGNvbW1hbmQgYXJyaXZlcyB3ZSBmYWxsIGJhY2sgdG8gdGhlIGdlbmVyaWMgdG9vbCB3aWRnZXRcbiAqICAgICh0aGUgYGludm9jYXRpb25NZXNzYWdlYCkuXG4gKiAzLiBBIGBUZXJtaW5hbGAgY29udGVudCBibG9jayBpbiBgdGMuY29udGVudGAgKFJ1bm5pbmcvQ29tcGxldGVkIG9ubHkpIFx1MjAxNFxuICogICAgdGhlIEFIUC1zaWRlIHNpZ25hbCBmb3IgdGhlIGN1c3RvbSB0ZXJtaW5hbCB0b29sIChgYWdlbnRob3N0LXRlcm1pbmFsOmBcbiAqICAgIFVSSXMpLlxuICpcbiAqIFdpdGhvdXQgKDEpIHRoZSBsaXZlIGludm9jYXRpb24gd291bGQgcmFjZSBhZ2FpbnN0IHRoZSBhc3luYyBhcnJpdmFsIG9mIHRoZVxuICogVGVybWluYWwgYmxvY2sgdmlhIGBvbkRpZEFzc29jaWF0ZVRlcm1pbmFsYC5cbiAqL1xuZnVuY3Rpb24gaXNUZXJtaW5hbFRvb2xDYWxsKHRjOiBUb29sQ2FsbFN0YXRlLCBleGlzdGluZ0tpbmQ/OiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKGV4aXN0aW5nS2luZCA9PT0gJ3Rlcm1pbmFsJykge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGlmIChnZXRUb29sS2luZCh0YykgPT09ICd0ZXJtaW5hbCcgJiYgZ2V0VGVybWluYWxJbnB1dCh0YykgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGlmICh0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcgfHwgdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQpIHtcblx0XHRyZXR1cm4gISFnZXRUZXJtaW5hbENvbnRlbnRVcmkodGMuY29udGVudCk7XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIEJ1aWxkIGFuIHtAbGluayBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhfSBwYXlsb2FkIGZyb20gYSB0b29sLWNhbGxcbiAqIHN0YXRlLiBTaW5nbGUgc291cmNlIG9mIHRydXRoIGZvciB0aGUgZml2ZSBwbGFjZXMgdGhhdCBuZWVkIHRvIChyZSljb21wdXRlXG4gKiB0aGUgdGVybWluYWwgcGF5bG9hZDogcGVuZGluZyBjb25maXJtYXRpb24sIGxpdmUgY3JlYXRlLCBzdHJlYW1pbmcgcmVmcmVzaCxcbiAqIGZpbmFsaXplLCBhbmQgaGlzdG9yeSByZXBsYXkuXG4gKlxuICogRWFjaCBmaWVsZCBmYWxscyBiYWNrIHRvIGBleGlzdGluZ2Agc28gY2FsbGVycyBjYW4gcmUtY2FsbCBvbiBsYXRlclxuICogc25hcHNob3RzIHdpdGhvdXQgbG9zaW5nIHZhbHVlcyB0aGF0IGFycml2ZWQgZWFybGllci4gVGhpcyBpcyBjcml0aWNhbCBmb3JcbiAqIHRoZSBBSFAgZmllbGRzIGB0ZXJtaW5hbFRvb2xTZXNzaW9uSWRgIC8gYHRlcm1pbmFsQ29tbWFuZFVyaWAsIHdoaWNoXG4gKiBgX3Jldml2ZVRlcm1pbmFsSWZOZWVkZWRgIHBvcHVsYXRlcyBhc3luY2hyb25vdXNseSBvbmNlIGEgVGVybWluYWwgY29udGVudFxuICogYmxvY2sgYXJyaXZlcyBcdTIwMTQgcmVmcmVzaGluZyBmcm9tIGB0Y2AgYWxvbmUgd291bGQgY2xvYmJlciB0aGVtIHdoZW5ldmVyIHRoZVxuICogYmxvY2sgaGFzbid0IGxhbmRlZCB5ZXQuXG4gKlxuICogQ29tcGxldGlvbi1vbmx5IGZpZWxkcyAoZS5nLiBgdGVybWluYWxDb21tYW5kU3RhdGVgKSBhcmUgbGF5ZXJlZCBvbiB0b3AgYnlcbiAqIHRoZSBjYWxsZXI7IHRoZSBoZWxwZXIgaXMgc3RhdHVzLWFnbm9zdGljLlxuICovXG5mdW5jdGlvbiBidWlsZFRlcm1pbmFsVG9vbFNwZWNpZmljRGF0YShcblx0dGM6IFRvb2xDYWxsU3RhdGUsXG5cdHNlc3Npb25SZXNvdXJjZTogVVJJLFxuXHRleGlzdGluZz86IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEsXG4pOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIHtcblx0Y29uc3QgdGVybWluYWxDb250ZW50ID0gKHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUnVubmluZyB8fCB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZClcblx0XHQ/IGdldFRlcm1pbmFsQ29udGVudCh0Yy5jb250ZW50KVxuXHRcdDogdW5kZWZpbmVkO1xuXHRjb25zdCB0ZXJtaW5hbENvbnRlbnRVcmkgPSB0ZXJtaW5hbENvbnRlbnQ/LnJlc291cmNlO1xuXHRjb25zdCBuZXh0Q29tbWFuZCA9IGdldFRlcm1pbmFsSW5wdXQodGMpO1xuXHRjb25zdCBjb21tYW5kTGluZSA9IG5leHRDb21tYW5kXG5cdFx0PyB7IC4uLmV4aXN0aW5nPy5jb21tYW5kTGluZSwgb3JpZ2luYWw6IG5leHRDb21tYW5kIH1cblx0XHQ6IGV4aXN0aW5nPy5jb21tYW5kTGluZSA/PyB7IG9yaWdpbmFsOiAnJyB9O1xuXHRjb25zdCBuZXh0T3V0cHV0ID0gZ2V0VGVybWluYWxPdXRwdXQodGMpO1xuXHQvLyBTcHJlYWQgYGV4aXN0aW5nYCBzbyBhbnkgZmllbGQgc2V0IGJ5IGEgcHJpb3IgcGFzcyAobm90YWJseSB0aGVcblx0Ly8gYXN5bmMtcG9wdWxhdGVkIEFIUCBmaWVsZHMgYW5kIGFueXRoaW5nIHdlIGRvbid0IGV4cGxpY2l0bHkgaGFuZGxlKVxuXHQvLyBpcyBwcmVzZXJ2ZWQgdW5sZXNzIHdlIGhhdmUgYSBmcmVzaCB2YWx1ZSB0byBvdmVycmlkZSBpdCB3aXRoLlxuXHRyZXR1cm4ge1xuXHRcdC4uLmV4aXN0aW5nLFxuXHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0Y29tbWFuZExpbmUsXG5cdFx0aW50ZW50aW9uOiB0Yy5pbnRlbnRpb24gPz8gZXhpc3Rpbmc/LmludGVudGlvbixcblx0XHRsYW5ndWFnZTogZXhpc3Rpbmc/Lmxhbmd1YWdlID8/IGdldFRlcm1pbmFsTGFuZ3VhZ2UodGMpLFxuXHRcdGF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGU6IHJlYWRUb29sQ2FsbE1ldGEodGMpLmF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGUgPz8gZXhpc3Rpbmc/LmF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGUsXG5cdFx0dGVybWluYWxUb29sU2Vzc2lvbklkOiB0ZXJtaW5hbENvbnRlbnRVcmlcblx0XHRcdD8gbWFrZUFocFRlcm1pbmFsVG9vbFNlc3Npb25JZCh0ZXJtaW5hbENvbnRlbnRVcmksIHNlc3Npb25SZXNvdXJjZSlcblx0XHRcdDogZXhpc3Rpbmc/LnRlcm1pbmFsVG9vbFNlc3Npb25JZCxcblx0XHR0ZXJtaW5hbENvbW1hbmRVcmk6IHRlcm1pbmFsQ29udGVudFVyaSA/IFVSSS5wYXJzZSh0ZXJtaW5hbENvbnRlbnRVcmkpIDogZXhpc3Rpbmc/LnRlcm1pbmFsQ29tbWFuZFVyaSxcblx0XHRpc1B0eTogdGVybWluYWxDb250ZW50Py5pc1B0eSA/PyBleGlzdGluZz8uaXNQdHksXG5cdFx0dGVybWluYWxDb21tYW5kT3V0cHV0OiBuZXh0T3V0cHV0ID8/IGV4aXN0aW5nPy50ZXJtaW5hbENvbW1hbmRPdXRwdXQsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGdldFRvb2xJbnB1dE91dHB1dERldGFpbHModGM6IFRvb2xDYWxsU3RhdGUsIGlzRXJyb3I6IGJvb2xlYW4sIGVycm9yU3RyaW5nOiBzdHJpbmcgfCB1bmRlZmluZWQsIGluY2x1ZGVNY3BPdXRwdXQ6IGJvb2xlYW4sIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyk6IElUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdG9vbElucHV0ID0gdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcgPyB1bmRlZmluZWQgOiB0Yy50b29sSW5wdXQ7XG5cdGlmICghdG9vbElucHV0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IG91dHB1dDogSVRvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHNbJ291dHB1dCddID0gW107XG5cdGlmICh0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCB8fCB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcpIHtcblx0XHRmb3IgKGNvbnN0IGJsb2NrIG9mIHRjLmNvbnRlbnQgPz8gW10pIHtcblx0XHRcdHN3aXRjaCAoYmxvY2sudHlwZSkge1xuXHRcdFx0XHRjYXNlIFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0OlxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKHsgdHlwZTogJ2VtYmVkJywgdmFsdWU6IGJsb2NrLnRleHQsIGlzVGV4dDogdHJ1ZSwgbWltZVR5cGU6ICd0ZXh0L3BsYWluJyB9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBUb29sUmVzdWx0Q29udGVudFR5cGUuRW1iZWRkZWRSZXNvdXJjZTpcblx0XHRcdFx0XHRvdXRwdXQucHVzaCh7IHR5cGU6ICdlbWJlZCcsIHZhbHVlOiBibG9jay5kYXRhLCBtaW1lVHlwZTogYmxvY2suY29udGVudFR5cGUgfSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgVG9vbFJlc3VsdENvbnRlbnRUeXBlLlJlc291cmNlOlxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKHsgdHlwZTogJ3JlZicsIHVyaTogd3JhcFJlc291cmNlVXJpKGJsb2NrLnVyaSwgY29ubmVjdGlvbkF1dGhvcml0eSksIG1pbWVUeXBlOiBibG9jay5jb250ZW50VHlwZSB9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAob3V0cHV0Lmxlbmd0aCA9PT0gMCAmJiBlcnJvclN0cmluZykge1xuXHRcdG91dHB1dC5wdXNoKHsgdHlwZTogJ2VtYmVkJywgdmFsdWU6IGVycm9yU3RyaW5nLCBpc1RleHQ6IHRydWUsIG1pbWVUeXBlOiAndGV4dC9wbGFpbicgfSk7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdGlucHV0OiB0b29sSW5wdXQsXG5cdFx0aW5wdXRMYW5ndWFnZTogJ2pzb24nLFxuXHRcdG91dHB1dCxcblx0XHRpc0Vycm9yLFxuXHRcdG1jcE91dHB1dDogaW5jbHVkZU1jcE91dHB1dCA/IHRvTWNwQ2FsbFRvb2xSZXN1bHQodGMsIGlzRXJyb3IsIGNvbm5lY3Rpb25BdXRob3JpdHkpIDogdW5kZWZpbmVkLFxuXHR9O1xufVxuXG4vKipcbiAqIEJ1aWxkcyBhIG1pbmltYWwge0BsaW5rIE1DUC5DYWxsVG9vbFJlc3VsdH0gZnJvbSBhbiBhZ2VudC1ob3N0IHRvb2wgY2FsbCdzXG4gKiBjb250ZW50IGJsb2NrcyBzbyB0aGUgY2hhdCBNQ1AgQXBwIHdlYnZpZXcgY2FuIHJlY2VpdmUgYVxuICogYHVpL25vdGlmaWNhdGlvbnMvdG9vbC1yZXN1bHRgIG5vdGlmaWNhdGlvbiB3aXRoIHRoZSByZWFsIHRvb2wgb3V0cHV0XG4gKiAoc2VlIHtAbGluayBjaGF0TWNwQXBwTW9kZWx9KS4gQWdlbnQtaG9zdCB0b29sIGNvbXBsZXRpb25zIG9ubHkgY2Fycnkgb3VyXG4gKiBvd24gYWJzdHJhY3RlZCBjb250ZW50IHNoYXBlICh0aGUgcmF3IE1DUCByZXN1bHQgaXMgY29uc3VtZWQgYnkgdGhlXG4gKiBDb3BpbG90IENMSSdzIE1DUCBob3N0IGFuZCBuZXZlciBzdXJmYWNlcyBiYWNrIG92ZXIgdGhlIEFIUCksIHNvIHdlXG4gKiB0cmFuc2xhdGUgZWFjaCBBSFAgY29udGVudCBibG9jayBpbnRvIHRoZSBjbG9zZXN0IE1DUCBjb250ZW50IGJsb2NrOlxuICogIC0gYFRleHRgIFx1MjE5MiBgTUNQLlRleHRDb250ZW50YFxuICogIC0gYEVtYmVkZGVkUmVzb3VyY2VgIHdpdGggYW4gaW1hZ2UvYXVkaW8gTUlNRSBcdTIxOTIgYEltYWdlQ29udGVudGAvYEF1ZGlvQ29udGVudGBcbiAqICAtIGBFbWJlZGRlZFJlc291cmNlYCAob3RoZXIpIFx1MjE5MiBgRW1iZWRkZWRSZXNvdXJjZWAgd3JhcHBpbmcgYSBzeW50aGV0aWNcbiAqICAgIGBkYXRhOmAgVVJJIHNvIE1DUCdzIHJlc291cmNlIHNoYXBlIGlzIGhvbm9yZWRcbiAqICAtIGBSZXNvdXJjZWAgKGNvbnRlbnQgcmVmKSBcdTIxOTIgYFJlc291cmNlTGlua2AgdG8gdGhlIHJlZmVyZW5jZWQgVVJJXG4gKi9cbmZ1bmN0aW9uIHRvTWNwQ2FsbFRvb2xSZXN1bHQodGM6IFRvb2xDYWxsU3RhdGUsIGlzRXJyb3I6IGJvb2xlYW4sIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyk6IE1DUC5DYWxsVG9vbFJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdGlmICh0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCAmJiB0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGNvbnRlbnQ6IE1DUC5Db250ZW50QmxvY2tbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGJsb2NrIG9mIHRjLmNvbnRlbnQgPz8gW10pIHtcblx0XHRjb25zdCBtY3BCbG9jayA9IHRvTWNwQ29udGVudEJsb2NrKGJsb2NrLCBjb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0XHRpZiAobWNwQmxvY2spIHtcblx0XHRcdGNvbnRlbnQucHVzaChtY3BCbG9jayk7XG5cdFx0fVxuXHR9XG5cdGlmIChjb250ZW50Lmxlbmd0aCA9PT0gMCAmJiAhaXNFcnJvcikge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHsgY29udGVudCwgaXNFcnJvcjogaXNFcnJvciB8fCB1bmRlZmluZWQgfTtcbn1cblxuZnVuY3Rpb24gdG9NY3BDb250ZW50QmxvY2soYmxvY2s6IFRvb2xSZXN1bHRDb250ZW50LCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcpOiBNQ1AuQ29udGVudEJsb2NrIHwgdW5kZWZpbmVkIHtcblx0c3dpdGNoIChibG9jay50eXBlKSB7XG5cdFx0Y2FzZSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dDpcblx0XHRcdHJldHVybiB7IHR5cGU6ICd0ZXh0JywgdGV4dDogYmxvY2sudGV4dCB9O1xuXHRcdGNhc2UgVG9vbFJlc3VsdENvbnRlbnRUeXBlLkVtYmVkZGVkUmVzb3VyY2U6IHtcblx0XHRcdGlmIChibG9jay5jb250ZW50VHlwZS5zdGFydHNXaXRoKCdpbWFnZS8nKSkge1xuXHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnaW1hZ2UnLCBkYXRhOiBibG9jay5kYXRhLCBtaW1lVHlwZTogYmxvY2suY29udGVudFR5cGUgfTtcblx0XHRcdH1cblx0XHRcdGlmIChibG9jay5jb250ZW50VHlwZS5zdGFydHNXaXRoKCdhdWRpby8nKSkge1xuXHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnYXVkaW8nLCBkYXRhOiBibG9jay5kYXRhLCBtaW1lVHlwZTogYmxvY2suY29udGVudFR5cGUgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdyZXNvdXJjZScsXG5cdFx0XHRcdHJlc291cmNlOiB7XG5cdFx0XHRcdFx0dXJpOiBgZGF0YToke2Jsb2NrLmNvbnRlbnRUeXBlfTtiYXNlNjQsJHtibG9jay5kYXRhfWAsXG5cdFx0XHRcdFx0bWltZVR5cGU6IGJsb2NrLmNvbnRlbnRUeXBlLFxuXHRcdFx0XHRcdGJsb2I6IGJsb2NrLmRhdGEsXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjYXNlIFRvb2xSZXN1bHRDb250ZW50VHlwZS5SZXNvdXJjZToge1xuXHRcdFx0Y29uc3Qgd3JhcHBlZCA9IHdyYXBSZXNvdXJjZVVyaShibG9jay51cmksIGNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ3Jlc291cmNlX2xpbmsnLFxuXHRcdFx0XHRuYW1lOiBiYXNlbmFtZSh3cmFwcGVkKSB8fCB3cmFwcGVkLnRvU3RyaW5nKCksXG5cdFx0XHRcdHVyaTogd3JhcHBlZC50b1N0cmluZygpLFxuXHRcdFx0XHRtaW1lVHlwZTogYmxvY2suY29udGVudFR5cGUsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIFdyYXBzIGEgdG9vbC1yZXN1bHQgcmVzb3VyY2UgVVJJIChzdHJpbmcpIHZpYSB7QGxpbmsgdG9BZ2VudEhvc3RVcml9IHNvIGl0XG4gKiByZXNvbHZlcyB0aHJvdWdoIHRoZSBhZ2VudCBob3N0IGZpbGVzeXN0ZW0gcHJvdmlkZXIgb24gdGhlIGNsaWVudC4gVGhlXG4gKiB1bmRlcmx5aW5nIGhlbHBlciBoYXMgYSBmYXN0LXBhdGggdGhhdCByZXR1cm5zIHRoZSBVUkkgdW5jaGFuZ2VkIHdoZW4gaXQnc1xuICogYWxyZWFkeSBhIGxvY2FsIGBmaWxlOi8vYCByZXNvdXJjZSwgc28gdGhlIHdyYXAgaXMgc2FmZSBmb3IgYWxsIGNhc2VzLlxuICovXG5mdW5jdGlvbiB3cmFwUmVzb3VyY2VVcmkodXJpOiBzdHJpbmcsIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyk6IFVSSSB7XG5cdHJldHVybiB0b0FnZW50SG9zdFVyaShVUkkucGFyc2UodXJpKSwgY29ubmVjdGlvbkF1dGhvcml0eSk7XG59XG5cbmZ1bmN0aW9uIGdldFRvb2xFcnJvclN0cmluZyh0YzogVG9vbENhbGxTdGF0ZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICh0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCkge1xuXHRcdHJldHVybiB0Yy5lcnJvcj8ubWVzc2FnZTtcblx0fVxuXHRpZiAodGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5DYW5jZWxsZWQpIHtcblx0XHRyZXR1cm4gdHlwZW9mIHRjLnJlYXNvbk1lc3NhZ2UgPT09ICdzdHJpbmcnID8gdGMucmVhc29uTWVzc2FnZSA6IHRjLnJlYXNvbk1lc3NhZ2U/Lm1hcmtkb3duO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogQnVpbGRzIHRoZSBgc2Vzc2lvbkNyZWF0ZWRgIHRvb2wtc3BlY2lmaWMgZGF0YSBmb3IgYSBjb21wbGV0ZWQsIHN1Y2Nlc3NmdWxcbiAqIGBjcmVhdGVfc2Vzc2lvbmAgb3IgYGNyZWF0ZV9jaGF0YCB0b29sIGNhbGwgYnkgcmVjb3ZlcmluZyB0aGUgb3Blbi1zZXNzaW9uXG4gKiBsaW5rIGZyb20gaXRzIHRleHR1YWwgcmVzdWx0LiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gdGhlIHRvb2wgaXNuJ3Qgb25lIG9mXG4gKiB0aG9zZSBvciB0aGUgcmVzdWx0IGNhcnJpZXMgbm8gcmVjb2duaXphYmxlIGxpbmsuXG4gKi9cbmZ1bmN0aW9uIGJ1aWxkU2Vzc2lvbkNyZWF0ZWRUb29sRGF0YSh0YzogVG9vbENhbGxTdGF0ZSk6IElDaGF0U2Vzc2lvbkNyZWF0ZWREYXRhIHwgdW5kZWZpbmVkIHtcblx0aWYgKHRjLnN0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkIHx8ICF0Yy5zdWNjZXNzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBpc1NlbmQgPSBpc1NlbmRNZXNzYWdlVG9vbCh0Yy50b29sTmFtZSk7XG5cdGlmICghaXNDcmVhdGVTZXNzaW9uVG9vbCh0Yy50b29sTmFtZSkgJiYgIWlzQ3JlYXRlQ2hhdFRvb2wodGMudG9vbE5hbWUpICYmICFpc1NlbmQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IG91dHB1dCA9IGdldFRvb2xPdXRwdXRUZXh0KHRjKTtcblx0Y29uc3QgbWF0Y2ggPSBvdXRwdXQ/Lm1hdGNoKC9hZ2VudC1ob3N0LXNlc3Npb246XFwvXFwvW15cXHMpPD47XCInXSsvKTtcblx0Y29uc3Qgb3BlbkxpbmsgPSBtYXRjaD8uWzBdO1xuXHRjb25zdCBiYWNrZW5kID0gb3BlbkxpbmsgPyBwYXJzZU9wZW5TZXNzaW9uTGlua1VyaShvcGVuTGluaykgOiB1bmRlZmluZWQ7XG5cdGlmICghb3BlbkxpbmsgfHwgIWJhY2tlbmQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdC8vIEEgY2hhdC1zY29wZWQgbGluayAoY3JlYXRlX2NoYXQsIG9yIHNlbmRfbWVzc2FnZSB0YXJnZXRpbmcgYSBzcGVjaWZpYyBjaGF0KVxuXHQvLyBzaG93cyB0aGUgY29udmVyc2F0aW9uIGljb247IGEgc2Vzc2lvbi1zY29wZWQgbGluayBzaG93cyB0aGUgYWdlbnQgaWNvbi5cblx0Y29uc3QgaXNDaGF0ID0gaXNDcmVhdGVDaGF0VG9vbCh0Yy50b29sTmFtZSkgfHwgKGlzU2VuZCAmJiAhIXBhcnNlT3BlblNlc3Npb25MaW5rQ2hhdElkKG9wZW5MaW5rKSk7XG5cdGNvbnN0IGxhYmVsID0gY3JlYXRlU2Vzc2lvblRpdGxlRnJvbUFyZ3ModGMudG9vbElucHV0KSA/PyAoYmFja2VuZC5wYXRoLnJlcGxhY2UoL15cXC8vLCAnJykgfHwgYmFja2VuZC50b1N0cmluZygpKTtcblx0cmV0dXJuIHsga2luZDogJ3Nlc3Npb25DcmVhdGVkJywgb3BlbkxpbmssIGxhYmVsLCBpc0NoYXQgfTtcbn1cblxuZnVuY3Rpb24gYnVpbGRBdXRvbWF0aW9uQ29uZmlndXJlZFRvb2xEYXRhKHRjOiBUb29sQ2FsbFN0YXRlKTogSUNoYXRBdXRvbWF0aW9uQ29uZmlndXJlZERhdGEgfCB1bmRlZmluZWQge1xuXHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgfHwgIXRjLnN1Y2Nlc3MgfHwgdGMudG9vbE5hbWUgIT09IENvbmZpZ3VyZUF1dG9tYXRpb25Ub29sUmVmZXJlbmNlTmFtZSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgb3V0cHV0ID0gZ2V0VG9vbE91dHB1dFRleHQodGMpO1xuXHRpZiAoIW91dHB1dCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0dHJ5IHtcblx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKG91dHB1dCkgYXMgeyBzdGF0dXM/OiB1bmtub3duOyBhdXRvbWF0aW9uPzogeyBpZD86IHVua25vd247IG5hbWU/OiB1bmtub3duIH0gfTtcblx0XHRjb25zdCBvcGVyYXRpb24gPSBwYXJzZWQuc3RhdHVzID09PSAnY3JlYXRlZCcgfHwgcGFyc2VkLnN0YXR1cyA9PT0gJ3VwZGF0ZWQnID8gcGFyc2VkLnN0YXR1cyA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIW9wZXJhdGlvbiB8fCB0eXBlb2YgcGFyc2VkLmF1dG9tYXRpb24/LmlkICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgcGFyc2VkLmF1dG9tYXRpb24ubmFtZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnYXV0b21hdGlvbkNvbmZpZ3VyZWQnLFxuXHRcdFx0YXV0b21hdGlvbklkOiBwYXJzZWQuYXV0b21hdGlvbi5pZCxcblx0XHRcdGF1dG9tYXRpb25OYW1lOiBwYXJzZWQuYXV0b21hdGlvbi5uYW1lLFxuXHRcdFx0b3BlcmF0aW9uLFxuXHRcdH07XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuLyoqXG4gKiBEZXJpdmVzIGEgdGl0bGUgZm9yIHRoZSBcIk9wZW4gU2Vzc2lvblwiIGJ1dHRvbiBmcm9tIGEgc2Vzc2lvbiB0b29sJ3MgYXJndW1lbnRzIFx1MjAxNFxuICogdGhlIGBwcm9tcHRgIChjcmVhdGVfc2Vzc2lvbi9jcmVhdGVfY2hhdCkgb3IgYG1lc3NhZ2VgIChzZW5kX21lc3NhZ2UpIGl0IHdhc1xuICogc3RhcnRlZCB3aXRoLCB0cmltbWVkIHRvIG9uZSBsaW5lLlxuICovXG5mdW5jdGlvbiBjcmVhdGVTZXNzaW9uVGl0bGVGcm9tQXJncyh0b29sSW5wdXQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICghdG9vbElucHV0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHR0cnkge1xuXHRcdGNvbnN0IGFyZ3MgPSBKU09OLnBhcnNlKHRvb2xJbnB1dCkgYXMgeyBwcm9tcHQ/OiB1bmtub3duOyBtZXNzYWdlPzogdW5rbm93biB9O1xuXHRcdGNvbnN0IHRleHQgPSB0eXBlb2YgYXJncy5wcm9tcHQgPT09ICdzdHJpbmcnID8gYXJncy5wcm9tcHQgOiAodHlwZW9mIGFyZ3MubWVzc2FnZSA9PT0gJ3N0cmluZycgPyBhcmdzLm1lc3NhZ2UgOiB1bmRlZmluZWQpO1xuXHRcdGlmICh0ZXh0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGZpcnN0TGluZSA9IHRleHQudHJpbSgpLnNwbGl0KCdcXG4nKVswXS50cmltKCk7XG5cdFx0aWYgKCFmaXJzdExpbmUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBmaXJzdExpbmUubGVuZ3RoID4gNjAgPyBgJHtmaXJzdExpbmUuc2xpY2UoMCwgNTcpfVx1MjAyNmAgOiBmaXJzdExpbmU7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gY29tcGxldGVkVG9vbENhbGxDb25maXJtZWRSZWFzb24odGM6IElDb21wbGV0ZWRUb29sQ2FsbCk6IE5vbk51bGxhYmxlPElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkWydpc0NvbmZpcm1lZCddPiB7XG5cdGlmICh0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCkge1xuXHRcdHJldHVybiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQgfTtcblx0fVxuXG5cdHJldHVybiB7IHR5cGU6IHRjLnJlYXNvbiA9PT0gVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24uU2tpcHBlZCA/IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkIDogVG9vbENvbmZpcm1LaW5kLkRlbmllZCB9O1xufVxuXG4vKipcbiAqIENvbnZlcnRzIGEgY29tcGxldGVkIHRvb2wgY2FsbCBmcm9tIHRoZSBwcm90b2NvbCBzdGF0ZSBpbnRvIGEgc2VyaWFsaXplZFxuICogdG9vbCBpbnZvY2F0aW9uIHN1aXRhYmxlIGZvciBoaXN0b3J5IHJlcGxheS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXBsZXRlZFRvb2xDYWxsVG9TZXJpYWxpemVkKHRjOiBJQ29tcGxldGVkVG9vbENhbGwsIHN1YkFnZW50SW52b2NhdGlvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHNlc3Npb25SZXNvdXJjZTogVVJJLCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcpOiBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCB7XG5cdGNvbnN0IGlzVGVybWluYWwgPSBpc1Rlcm1pbmFsVG9vbENhbGwodGMpO1xuXHRjb25zdCBpc1N1Y2Nlc3MgPSB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCAmJiB0Yy5zdWNjZXNzO1xuXHRsZXQgaW52b2NhdGlvbk1zZyA9IHN0cmluZ09yTWFya2Rvd25Ub1N0cmluZyh0Yy5pbnZvY2F0aW9uTWVzc2FnZSwgY29ubmVjdGlvbkF1dGhvcml0eSkgPz8gdGMuZGlzcGxheU5hbWU7XG5cblx0Ly8gQ2hlY2sgZm9yIHN1YmFnZW50IGNvbnRlbnRcblx0Y29uc3Qgc3ViYWdlbnRDb250ZW50ID0gdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgPyBnZXRUb29sU3ViYWdlbnRDb250ZW50KHRjKSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgaXNTdWJhZ2VudCA9IHN1YmFnZW50Q29udGVudCB8fCBpc1N1YmFnZW50VG9vbCh0Yyk7XG5cdGlmIChpc1N1YmFnZW50ICYmIHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKSB7XG5cdFx0Y29uc3QgcmVzdWx0VGV4dCA9IGdldFRvb2xPdXRwdXRUZXh0KHRjKTtcblx0XHRjb25zdCBwYXN0VGVuc2VNc2cgPSBpc1N1Y2Nlc3Ncblx0XHRcdD8gc3RyaW5nT3JNYXJrZG93blRvU3RyaW5nKHRjLnBhc3RUZW5zZU1lc3NhZ2UsIGNvbm5lY3Rpb25BdXRob3JpdHkpID8/IGludm9jYXRpb25Nc2dcblx0XHRcdDogaW52b2NhdGlvbk1zZztcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcsXG5cdFx0XHR0b29sQ2FsbElkOiB0Yy50b29sQ2FsbElkLFxuXHRcdFx0dG9vbElkOiB0Yy50b29sTmFtZSxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogaW52b2NhdGlvbk1zZyxcblx0XHRcdG9yaWdpbk1lc3NhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHBhc3RUZW5zZU1zZyxcblx0XHRcdGlzQ29uZmlybWVkOiBjb21wbGV0ZWRUb29sQ2FsbENvbmZpcm1lZFJlYXNvbih0YyksXG5cdFx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0cHJlc2VudGF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogc3ViQWdlbnRJbnZvY2F0aW9uSWQsXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBnZXRTdWJhZ2VudFRhc2tEZXNjcmlwdGlvbih0YykgPz8gdGMuZGlzcGxheU5hbWUsXG5cdFx0XHRcdGFnZW50TmFtZTogc3ViYWdlbnRDb250ZW50Py5hZ2VudE5hbWUgPz8gZ2V0U3ViYWdlbnRBZ2VudE5hbWUodGMpLFxuXHRcdFx0XHRyZXN1bHQ6IHJlc3VsdFRleHQsXG5cdFx0XHRcdGNoYXRSZXNvdXJjZTogZ2V0U3ViYWdlbnRDaGF0UmVzb3VyY2UodGMsIHN1YmFnZW50Q29udGVudCwgc2Vzc2lvblJlc291cmNlKSxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdGxldCB0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIHwgSUNoYXRTZWFyY2hUb29sSW52b2NhdGlvbkRhdGEgfCBJQ2hhdFRvb2xJbnB1dEludm9jYXRpb25EYXRhIHwgSUNoYXRTZXNzaW9uQ3JlYXRlZERhdGEgfCBJQ2hhdEF1dG9tYXRpb25Db25maWd1cmVkRGF0YSB8IHVuZGVmaW5lZDtcblx0aWYgKGlzVGVybWluYWwpIHtcblx0XHR0b29sU3BlY2lmaWNEYXRhID0ge1xuXHRcdFx0Li4uYnVpbGRUZXJtaW5hbFRvb2xTcGVjaWZpY0RhdGEodGMsIHNlc3Npb25SZXNvdXJjZSksXG5cdFx0XHR0ZXJtaW5hbENvbW1hbmRTdGF0ZTogZ2V0VGVybWluYWxDb21tYW5kU3RhdGUodGMsIGlzU3VjY2VzcyksXG5cdFx0fTtcblx0fSBlbHNlIGlmIChnZXRUb29sS2luZCh0YykgPT09ICdzZWFyY2gnKSB7XG5cdFx0dG9vbFNwZWNpZmljRGF0YSA9IHsga2luZDogJ3NlYXJjaCcgfTtcblx0fSBlbHNlIHtcblx0XHR0b29sU3BlY2lmaWNEYXRhID0gYnVpbGRTZXNzaW9uQ3JlYXRlZFRvb2xEYXRhKHRjKSA/PyBidWlsZEF1dG9tYXRpb25Db25maWd1cmVkVG9vbERhdGEodGMpO1xuXHRcdGlmICghdG9vbFNwZWNpZmljRGF0YSkge1xuXHRcdFx0dG9vbFNwZWNpZmljRGF0YSA9IGJ1aWxkTWNwQXBwVG9vbElucHV0RGF0YSh0Yywgc2Vzc2lvblJlc291cmNlKTtcblx0XHR9XG5cdH1cblxuXHRsZXQgcGFzdFRlbnNlTXNnID0gaXNTdWNjZXNzXG5cdFx0PyBzdHJpbmdPck1hcmtkb3duVG9TdHJpbmcodGMucGFzdFRlbnNlTWVzc2FnZSwgY29ubmVjdGlvbkF1dGhvcml0eSkgPz8gaW52b2NhdGlvbk1zZ1xuXHRcdDogaW52b2NhdGlvbk1zZztcblx0Ly8gVG9vbHMgdGhhdCByZW5kZXIgYSBiZXNwb2tlLCBjbGllbnQtYXV0aG9yZWQgbWVzc2FnZSBvdmVycmlkZSBib3RoIHRoZVxuXHQvLyBpbnZvY2F0aW9uIGFuZCBwYXN0LXRlbnNlIHRleHQgaGVyZS4gQWRkIG5ldyBwZXItdG9vbCBjYXNlcyBhbG9uZ3NpZGUuXG5cdGlmIChpc0FkZENvbW1lbnRUb29sKHRjLnRvb2xOYW1lKSkge1xuXHRcdGNvbnN0IHJlZiA9IGFkZENvbW1lbnRSZWZlcmVuY2UodGMpO1xuXHRcdGlmIChyZWYpIHtcblx0XHRcdGludm9jYXRpb25Nc2cgPSByZWY7XG5cdFx0XHRwYXN0VGVuc2VNc2cgPSByZWY7XG5cdFx0fVxuXHR9XG5cdGNvbnN0IHJlc3VsdERldGFpbHMgPSAoIXRvb2xTcGVjaWZpY0RhdGEgfHwgdG9vbFNwZWNpZmljRGF0YS5raW5kID09PSAnaW5wdXQnICYmIHRvb2xTcGVjaWZpY0RhdGEubWNwQXBwRGF0YSlcblx0XHQmJiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgfHwgZ2V0VG9vbEZpbGVFZGl0cyh0YykubGVuZ3RoID09PSAwKVxuXHRcdD8gZ2V0VG9vbElucHV0T3V0cHV0RGV0YWlscyh0YywgIWlzU3VjY2VzcywgZ2V0VG9vbEVycm9yU3RyaW5nKHRjKSwgISEodG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ2lucHV0JyAmJiB0b29sU3BlY2lmaWNEYXRhLm1jcEFwcERhdGEpLCBjb25uZWN0aW9uQXV0aG9yaXR5KVxuXHRcdDogdW5kZWZpbmVkO1xuXG5cdHJldHVybiB7XG5cdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcsXG5cdFx0dG9vbENhbGxJZDogdGMudG9vbENhbGxJZCxcblx0XHR0b29sSWQ6IHRjLnRvb2xOYW1lLFxuXHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGludm9jYXRpb25Nc2csXG5cdFx0b3JpZ2luTWVzc2FnZTogdW5kZWZpbmVkLFxuXHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGlzVGVybWluYWwgPyB1bmRlZmluZWQgOiBwYXN0VGVuc2VNc2csXG5cdFx0aXNDb25maXJtZWQ6IGNvbXBsZXRlZFRvb2xDYWxsQ29uZmlybWVkUmVhc29uKHRjKSxcblx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdHByZXNlbnRhdGlvbjogc2hvdWxkSGlkZUNvbXBsZXRlZEFnZW50SG9zdEFza1VzZXJUb29sKHRjKSA/IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbkFmdGVyQ29tcGxldGUgOiB1bmRlZmluZWQsXG5cdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHN1YkFnZW50SW52b2NhdGlvbklkLFxuXHRcdHRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0cmVzdWx0RGV0YWlscyxcblx0fTtcbn1cblxuLyoqXG4gKiBCdWlsZHMge0BsaW5rIElDaGF0RXh0ZXJuYWxFZGl0fSBwcm9ncmVzcyBwYXJ0cyBmb3IgYSBjb21wbGV0ZWQgdG9vbCBjYWxsXG4gKiB0aGF0IHByb2R1Y2VkIGZpbGUgZWRpdHMuIFJldHVybnMgYW4gZW1wdHkgYXJyYXkgaWYgdGhlIHRvb2wgY2FsbCBoYXMgbm9cbiAqIGVkaXRzLiBFYWNoIGVtaXR0ZWQgcGFydCBjYXJyaWVzIHRoZSBVUkksIGVkaXQga2luZCwgYmVmb3JlL2FmdGVyIGNvbnRlbnRcbiAqIFVSSXMsIGFuZCB0aGUgZGlmZiBzdGF0cyBhbHJlYWR5IGtub3duIGZyb20gdGhlIGFnZW50IGhvc3QgcHJvdG9jb2wgXHUyMDE0XG4gKiBkb3duc3RyZWFtIHJlbmRlcmluZyBjYW4gcHJvZHVjZSBhIHN0YXRpYyBcImVkaXQgcGlsbFwiIHdpdGhvdXQgcmUtZGVyaXZpbmdcbiAqIGFueSBvZiB0aGlzIGZyb20gYW4gZWRpdGluZyBzZXNzaW9uLlxuICpcbiAqIGBjb25uZWN0aW9uQXV0aG9yaXR5YCBpcyByZXF1aXJlZCBzbyBhbGwgZW1pdHRlZCBVUklzIGFyZSB3cmFwcGVkIHZpYVxuICoge0BsaW5rIHRvQWdlbnRIb3N0VXJpfTsgb3RoZXJ3aXNlIHRoZSBjaGF0IHNlc3Npb24gd291bGQgcmVjZWl2ZSByYXdcbiAqIHJlbW90ZSBVUklzIHRoYXQgaXRzIGZpbGUgc3lzdGVtIHByb3ZpZGVycyBjYW5ub3QgcmVzb2x2ZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXBsZXRlZFRvb2xDYWxsVG9FZGl0UGFydHModGM6IElDb21wbGV0ZWRUb29sQ2FsbCwgY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nKTogSUNoYXRQcm9ncmVzc1tdIHtcblx0aWYgKHRjLnN0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGNvbnN0IGZpbGVFZGl0cyA9IGdldFRvb2xGaWxlRWRpdHModGMpO1xuXHRpZiAoZmlsZUVkaXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRjb25zdCBwYXJ0czogSUNoYXRQcm9ncmVzc1tdID0gW107XG5cdGZvciAoY29uc3QgZWRpdCBvZiBmaWxlRWRpdHMpIHtcblx0XHRjb25zdCBwYXJ0ID0gZmlsZUVkaXRUb0V4dGVybmFsRWRpdChlZGl0LCB0Yy50b29sQ2FsbElkLCBjb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0XHRpZiAocGFydCkge1xuXHRcdFx0cGFydHMucHVzaChwYXJ0KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHBhcnRzO1xufVxuXG4vKipcbiAqIFRyYW5zbGF0ZXMgYSBzaW5nbGUgcHJvdG9jb2wge0BsaW5rIEZpbGVFZGl0fSByZWNvcmQgaW50byB0aGVcbiAqIHtAbGluayBJQ2hhdEV4dGVybmFsRWRpdH0gcHJvZ3Jlc3MgcGFydCByZW5kZXJlZCBhcyBhbiBlZGl0IHBpbGwuIEFsbFxuICogVVJJcyBhcmUgd3JhcHBlZCB0aHJvdWdoIHtAbGluayB0b0FnZW50SG9zdFVyaX0gc28gdGhhdCByZW1vdGUtcmVzb3VyY2VcbiAqIGxvb2t1cHMgcmVzb2x2ZSB0aHJvdWdoIHRoZSBhZ2VudCBob3N0IGZpbGUgc3lzdGVtIHByb3ZpZGVyLlxuICovXG5mdW5jdGlvbiBmaWxlRWRpdFRvRXh0ZXJuYWxFZGl0KGVkaXQ6IEZpbGVFZGl0LCB1bmRvU3RvcElkOiBzdHJpbmcsIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyk6IElDaGF0RXh0ZXJuYWxFZGl0IHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZUZpbGVFZGl0KGVkaXQpO1xuXHRpZiAoIW5vcm1hbGl6ZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGRpZmYgPSBlZGl0LmRpZmYgJiYgKGVkaXQuZGlmZi5hZGRlZCAhPT0gdW5kZWZpbmVkIHx8IGVkaXQuZGlmZi5yZW1vdmVkICE9PSB1bmRlZmluZWQpXG5cdFx0PyB7IGFkZGVkOiBlZGl0LmRpZmYuYWRkZWQgPz8gMCwgcmVtb3ZlZDogZWRpdC5kaWZmLnJlbW92ZWQgPz8gMCB9XG5cdFx0OiB1bmRlZmluZWQ7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2V4dGVybmFsRWRpdCcsXG5cdFx0dXJpOiB0b0FnZW50SG9zdFVyaShub3JtYWxpemVkLnJlc291cmNlLCBjb25uZWN0aW9uQXV0aG9yaXR5KSxcblx0XHRlZGl0S2luZDogbm9ybWFsaXplZC5raW5kIGFzIENoYXRFeHRlcm5hbEVkaXRLaW5kLFxuXHRcdG9yaWdpbmFsVXJpOiBub3JtYWxpemVkLmtpbmQgPT09IEZpbGVFZGl0S2luZC5SZW5hbWUgJiYgbm9ybWFsaXplZC5iZWZvcmVVcmkgPyB0b0FnZW50SG9zdFVyaShub3JtYWxpemVkLmJlZm9yZVVyaSwgY29ubmVjdGlvbkF1dGhvcml0eSkgOiB1bmRlZmluZWQsXG5cdFx0YmVmb3JlQ29udGVudFVyaTogbm9ybWFsaXplZC5iZWZvcmVDb250ZW50VXJpID8gdG9BZ2VudEhvc3RVcmkobm9ybWFsaXplZC5iZWZvcmVDb250ZW50VXJpLCBjb25uZWN0aW9uQXV0aG9yaXR5KSA6IHVuZGVmaW5lZCxcblx0XHRhZnRlckNvbnRlbnRVcmk6IG5vcm1hbGl6ZWQuYWZ0ZXJDb250ZW50VXJpID8gdG9BZ2VudEhvc3RVcmkobm9ybWFsaXplZC5hZnRlckNvbnRlbnRVcmksIGNvbm5lY3Rpb25BdXRob3JpdHkpIDogdW5kZWZpbmVkLFxuXHRcdGRpZmYsXG5cdFx0dW5kb1N0b3BJZCxcblx0fTtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbGl2ZSB7QGxpbmsgQ2hhdFRvb2xJbnZvY2F0aW9ufSBmcm9tIHRoZSBwcm90b2NvbCdzIHRvb2wtY2FsbFxuICogc3RhdGUuIFVzZWQgZHVyaW5nIGFjdGl2ZSB0dXJucyB0byByZXByZXNlbnQgcnVubmluZyB0b29sIGNhbGxzIGluIHRoZSBVSS5cbiAqL1xuLyoqXG4gKiBVUkkgc2NoZW1lcyB0aGF0IHNob3VsZCBOT1QgYmUgcmV3cml0dGVuIHdoZW4gdGhleSBhcHBlYXIgaW5zaWRlIG1hcmtkb3duXG4gKiBsaW5rcyByZWNlaXZlZCBmcm9tIGEgcmVtb3RlIGFnZW50IGhvc3QuIFRoZXNlIGFyZSBsaW5rcyB0aGF0IGFyZVxuICogbWVhbmluZ2Z1bCBvdXRzaWRlIHRoZSBhZ2VudCBob3N0J3Mgd29ya3NwYWNlIChlLmcuIHdlYiBsaW5rcywgVlMgQ29kZVxuICogY29tbWFuZHMpIG9yIGFyZSBhbHJlYWR5IHdyYXBwZWQgaW4gdGhlIGFnZW50LWhvc3Qgc2NoZW1lLlxuICovXG5jb25zdCBFWFRFUk5BTF9MSU5LX1NDSEVNRVM6IFJlYWRvbmx5U2V0PHN0cmluZz4gPSBuZXcgU2V0KFtcblx0J2h0dHAnLFxuXHQnaHR0cHMnLFxuXHQnbWFpbHRvJyxcblx0J3dzJyxcblx0J3dzcycsXG5cdCdmdHAnLFxuXHQnZnRwcycsXG5cdCdkYXRhJyxcblx0J2Jsb2InLFxuXHQnamF2YXNjcmlwdCcsXG5cdCdjb21tYW5kJyxcblx0J3ZzY29kZScsXG5cdCd2c2NvZGUtaW5zaWRlcnMnLFxuXHRTY2hlbWFzLnZzY29kZUJyb3dzZXIsXG5cdCdjb3BpbG90LXNraWxsJyxcblx0cHJvZHVjdC51cmxQcm90b2NvbCxcblx0QUdFTlRfSE9TVF9TQ0hFTUUsXG5dKTtcblxuLyoqXG4gKiBSZXdyaXRlcyBpbmxpbmUgbWFya2Rvd24gbGluayBVUklzIHNvIHRoYXQgbm9uLWV4dGVybmFsIHNjaGVtZXMgYXJlIHdyYXBwZWRcbiAqIGluIHRoZSBgdnNjb2RlLWFnZW50LWhvc3Q6Ly9gIHNjaGVtZSwgbWlycm9yaW5nIHtAbGluayB0b0FnZW50SG9zdFVyaX0uXG4gKiBUaGlzIGFsbG93cyBsaW5rcyBpbiBtYXJrZG93biBjb250ZW50IHN0cmVhbWVkIGZyb20gYSByZW1vdGUgYWdlbnQgaG9zdFxuICogKGUuZy4gYGZpbGU6Ly8vLi4uYCBvciBgYWdlbnRob3N0LWNvbnRlbnQ6Ly8vLi4uYCkgdG8gcmVzb2x2ZSBjb3JyZWN0bHkgb25cbiAqIHRoZSBjbGllbnQgdGhyb3VnaCB0aGUgYWdlbnQgaG9zdCBmaWxlc3lzdGVtIHByb3ZpZGVyLlxuICpcbiAqIExpbmtzIHdpdGggZXh0ZXJuYWwgc2NoZW1lcyAoaHR0cCwgaHR0cHMsIG1haWx0bywgY29tbWFuZCwgZXRjLikgYW5kXG4gKiByZWxhdGl2ZS9hbmNob3Itb25seSBsaW5rcyB3aXRob3V0IGEgc2NoZW1lIGFyZSBwcmVzZXJ2ZWQgYXMtaXMuIFRoZVxuICogbWFya2Rvd24gaXMgcGFyc2VkIHdpdGggbWFya2VkIGFuZCBlYWNoIGBsaW5rYCAvIGBpbWFnZWAgdG9rZW4gaXNcbiAqIHJld3JpdHRlbiBpbmRpdmlkdWFsbHksIHNvIGxpbmstbG9va2luZyB0ZXh0IGluc2lkZSBjb2RlIHNwYW5zIG9yIGZlbmNlZFxuICogY29kZSBibG9ja3MgaXMgdW50b3VjaGVkIChtYXJrZWQgZW1pdHMgdGhvc2UgYXMgYGNvZGVgL2Bjb2Rlc3BhbmAgdG9rZW5zXG4gKiB3aXRoIG5vIG5lc3RlZCBsaW5rIHRva2VucykuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXdyaXRlTWFya2Rvd25MaW5rcyhtYXJrZG93bjogc3RyaW5nLCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgdG9rZW5zOiBUb2tlbnNMaXN0O1xuXHR0cnkge1xuXHRcdHRva2VucyA9IG1hcmtlZC5sZXhlcihtYXJrZG93bik7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiBtYXJrZG93bjtcblx0fVxuXG5cdGNvbnN0IGVkaXRzOiB7IHJhdzogc3RyaW5nOyByZXBsYWNlbWVudDogc3RyaW5nIH1bXSA9IFtdO1xuXHRtYXJrZWQud2Fsa1Rva2Vucyh0b2tlbnMsIHRva2VuID0+IHtcblx0XHRpZiAodG9rZW4udHlwZSAhPT0gJ2xpbmsnICYmIHRva2VuLnR5cGUgIT09ICdpbWFnZScpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVwbGFjZW1lbnQgPSByZXdyaXRlTGlua1Rva2VuUmF3KHRva2VuIGFzIFRva2Vucy5MaW5rIHwgVG9rZW5zLkltYWdlLCBjb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0XHRpZiAocmVwbGFjZW1lbnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZWRpdHMucHVzaCh7IHJhdzogKHRva2VuIGFzIFRva2VuICYgeyByYXc6IHN0cmluZyB9KS5yYXcsIHJlcGxhY2VtZW50IH0pO1xuXHRcdH1cblx0fSk7XG5cblx0aWYgKGVkaXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBtYXJrZG93bjtcblx0fVxuXG5cdC8vIEFwcGx5IGVkaXRzIHNlcXVlbnRpYWxseSBhZ2FpbnN0IHRoZSBvcmlnaW5hbCBtYXJrZG93bi4gd2Fsa1Rva2Vuc1xuXHQvLyB2aXNpdHMgdG9rZW5zIGluIGRvY3VtZW50IG9yZGVyIHNvIGEgZm9yd2FyZCBzY2FuIGlzIHN1ZmZpY2llbnQuXG5cdGxldCBvdXQgPSAnJztcblx0bGV0IHBvcyA9IDA7XG5cdGZvciAoY29uc3QgeyByYXcsIHJlcGxhY2VtZW50IH0gb2YgZWRpdHMpIHtcblx0XHRjb25zdCBpZHggPSBtYXJrZG93bi5pbmRleE9mKHJhdywgcG9zKTtcblx0XHRpZiAoaWR4IDwgMCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdG91dCArPSBtYXJrZG93bi5zdWJzdHJpbmcocG9zLCBpZHgpICsgcmVwbGFjZW1lbnQ7XG5cdFx0cG9zID0gaWR4ICsgcmF3Lmxlbmd0aDtcblx0fVxuXHRyZXR1cm4gb3V0ICsgbWFya2Rvd24uc3Vic3RyaW5nKHBvcyk7XG59XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIHJld3JpdHRlbiBgcmF3YCBzdHJpbmcgZm9yIGEgc2luZ2xlIGxpbmsgb3IgaW1hZ2UgdG9rZW4sXG4gKiBvciByZXR1cm5zIGB1bmRlZmluZWRgIGlmIHRoZSB0b2tlbiBzaG91bGQgYmUgbGVmdCBhbG9uZSAoZXh0ZXJuYWxcbiAqIHNjaGVtZSBvciB1bnBhcnNlYWJsZSBVUkkpLlxuICpcbiAqIFRoZSBvdXRwdXQgY29sbGFwc2VzIHRvIHRoZSBjYW5vbmljYWwgaW5saW5lIGZvcm0gYFtdKG5ld0hyZWYpYCAob3JcbiAqIGAhW10obmV3SHJlZilgIGZvciBpbWFnZXMpIFx1MjAxNCB0aGUgY2hhdCByZW5kZXJlciBoYXMgcmljaGVyIGhhbmRsaW5nIGZvclxuICogZW1wdHktdGV4dCBhZ2VudC1ob3N0IGxpbmtzIChyZW5kZXJpbmcgdGhlbSBhcyBhIGZpbGUgd2lkZ2V0KSwgc29cbiAqIHByZXNlcnZpbmcgdGhlIG9yaWdpbmFsIGxhYmVsIGlzbid0IHVzZWZ1bCBmb3IgbW9zdCBsaW5rcy4gVGhlIG9uZVxuICogZXhjZXB0aW9uIGlzIHNraWxsIGxpbmtzIChVUklzIHdob3NlIGJhc2VuYW1lIGlzIGBTS0lMTC5tZGApLCB3aGVyZSB0aGVcbiAqIHNraWxsIG5hbWUgaXMgcHJlc2VydmVkIGFzIHRoZSBsYWJlbCBzbyB0aGUgc2tpbGwgcGlsbCByZW5kZXJlciBjYW5cbiAqIGRpc3BsYXkgaXQgaW5zdGVhZCBvZiB0aGUgYWx3YXlzLWlkZW50aWNhbCBgU0tJTEwubWRgIGJhc2VuYW1lLiBUaGlzXG4gKiBhbHNvIG1lYW5zIGF1dG9saW5rcyAoYDx1cmw+YCkgYW5kIHJlZmVyZW5jZS1zdHlsZSBsaW5rc1xuICogKGBbdGV4dF1bcmVmXWApIGFyZSBub3JtYWxpemVkIGludG8gdGhlIGlubGluZSBmb3JtLlxuICovXG5mdW5jdGlvbiByZXdyaXRlTGlua1Rva2VuUmF3KHRva2VuOiBUb2tlbnMuTGluayB8IFRva2Vucy5JbWFnZSwgY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0bGV0IHBhcnNlZDogVVJJO1xuXHR0cnkge1xuXHRcdHBhcnNlZCA9IFVSSS5wYXJzZSh0b2tlbi5ocmVmLCB0cnVlKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBzY2hlbWUgPSBwYXJzZWQuc2NoZW1lLnRvTG93ZXJDYXNlKCk7XG5cdGlmICghc2NoZW1lIHx8IEVYVEVSTkFMX0xJTktfU0NIRU1FUy5oYXMoc2NoZW1lKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0bGV0IGFnZW50SG9zdFVyaSA9IHRvQWdlbnRIb3N0VXJpKHBhcnNlZCwgY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdGNvbnN0IGlzU2tpbGwgPSBpc1NraWxsRmlsZVVyaShwYXJzZWQpO1xuXHQvLyBWUy1Db2RlLXNwZWNpZmljOiBsaW5rcyBwb2ludGluZyBhdCBhIGBTS0lMTC5tZGAgZmlsZSBhcmUgcmVuZGVyZWQgYXMgYVxuXHQvLyByaWNoIHNraWxsIHBpbGwgcmF0aGVyIHRoYW4gYSBwbGFpbiBtYXJrZG93biBsaW5rLiBUaGUgY2hhdCByZW5kZXJlcidzXG5cdC8vIGlubGluZSBhbmNob3Igd2lkZ2V0IGtleXMgb2ZmIHRoZSBgdnNjb2RlTGlua1R5cGVgIHF1ZXJ5IHBhcmFtZXRlciAoc2VlXG5cdC8vIGBjaGF0SW5saW5lQW5jaG9yV2lkZ2V0LnRzYCksIHNvIHdlIHRhZyB0aGUgVVJJIGhlcmUgb24gdGhlIGNsaWVudCBzaWRlXG5cdC8vIHJhdGhlciB0aGFuIGF0IHRoZSBhZ2VudCBob3N0LiBXZSBkbyB0aGlzIHdoZXRoZXIgb3Igbm90IHRoZSBsaW5rIGNhbWVcblx0Ly8gaW4gcHJlLXRhZ2dlZCBzbyBvbGRlciBzZXNzaW9ucyBhbmQgb3RoZXIgYWdlbnQgcHJvdmlkZXJzIGFsc28gYmVuZWZpdC5cblx0aWYgKGlzU2tpbGwgJiYgIWFnZW50SG9zdFVyaS5xdWVyeS5pbmNsdWRlcygndnNjb2RlTGlua1R5cGU9JykpIHtcblx0XHRjb25zdCBleGlzdGluZyA9IGFnZW50SG9zdFVyaS5xdWVyeTtcblx0XHRhZ2VudEhvc3RVcmkgPSBhZ2VudEhvc3RVcmkud2l0aCh7IHF1ZXJ5OiBleGlzdGluZyA/IGAke2V4aXN0aW5nfSZ2c2NvZGVMaW5rVHlwZT1za2lsbGAgOiAndnNjb2RlTGlua1R5cGU9c2tpbGwnIH0pO1xuXHR9XG5cdGNvbnN0IHByZWZpeCA9IHRva2VuLnR5cGUgPT09ICdpbWFnZScgPyAnIVsnIDogJ1snO1xuXHQvLyBQcmVzZXJ2ZSB0aGUgbGFiZWwgZm9yIHNraWxsIGxpbmtzIChzbyB0aGUgc2tpbGwgcGlsbCByZW5kZXJlciBjYW4gc2hvd1xuXHQvLyB0aGUgc2tpbGwgbmFtZSkgYW5kIGZvciBpbWFnZSBhbHQgdGV4dCAoYWNjZXNzaWJpbGl0eSBcdTIwMTQgdGhlIGlubGluZVxuXHQvLyBhbmNob3Igd2lkZ2V0IG9ubHkgYXBwbGllcyB0byBsaW5rcywgbm90IGltYWdlcykuIEZvciBhbGwgb3RoZXJcblx0Ly8gYWdlbnQtaG9zdCBsaW5rcywgbGVhdmUgdGhlIHRleHQgZW1wdHkgc28gdGhlIGNoYXQgcmVuZGVyZXIncyBpbmxpbmVcblx0Ly8gYW5jaG9yIHdpZGdldCB0YWtlcyBvdmVyIHdpdGggaXRzIHJpY2ggZmlsZS13aWRnZXQgcmVuZGVyaW5nLlxuXHQvLyBFc2NhcGUgb25seSB0aGUgY2hhcmFjdGVycyB0aGF0IHdvdWxkIGJyZWFrIG91dCBvZiBtYXJrZG93biBsaW5rIHRleHRcblx0Ly8gc3ludGF4IChgXFxgIGFuZCBgXWApOyBhIGZ1bGwgbWFya2Rvd24gZXNjYXBlIHdvdWxkIGxlYXZlIHZpc2libGVcblx0Ly8gYmFja3NsYXNoZXMgaW4gdGhlIHNraWxsIHBpbGwgd2hpY2ggZXh0cmFjdHMgdGV4dCB3aXRob3V0IHJlLXBhcnNpbmcuXG5cdGNvbnN0IHRleHQgPSBpc1NraWxsIHx8IHRva2VuLnR5cGUgPT09ICdpbWFnZScgPyBlc2NhcGVNYXJrZG93bkxpbmtMYWJlbCh0b2tlbi50ZXh0ID8/ICcnKSA6ICcnO1xuXHRyZXR1cm4gYCR7cHJlZml4fSR7dGV4dH1dKCR7YWdlbnRIb3N0VXJpLnRvU3RyaW5nKCl9KWA7XG59XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIHdoZW4gdGhlIFVSSSdzIGJhc2VuYW1lIGlzIGBTS0lMTC5tZGAgKGNhc2UtaW5zZW5zaXRpdmUpLlxuICogVXNlZCB0byB0YWcgc2tpbGwgbGlua3Mgc28gdGhlIGNoYXQgcmVuZGVyZXIgc2hvd3MgdGhlIHJpY2ggc2tpbGwgcGlsbFxuICogaW5zdGVhZCBvZiBhIHBsYWluIG1hcmtkb3duIGFuY2hvci5cbiAqL1xuZnVuY3Rpb24gaXNTa2lsbEZpbGVVcmkodXJpOiBVUkkpOiBib29sZWFuIHtcblx0Y29uc3QgbmFtZSA9IGJhc2VuYW1lKHVyaSk7XG5cdHJldHVybiBuYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdza2lsbC5tZCc7XG59XG5cbi8qKlxuICogV3JhcHMgYSByYXcgbWFya2Rvd24gc3RyaW5nIGludG8gYW4ge0BsaW5rIElNYXJrZG93blN0cmluZ30sIHJld3JpdGluZ1xuICogbGluayBVUklzIHRocm91Z2gge0BsaW5rIHJld3JpdGVNYXJrZG93bkxpbmtzfSB3aGVuIGEgY29ubmVjdGlvbiBhdXRob3JpdHlcbiAqIGlzIHByb3ZpZGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmF3TWFya2Rvd25Ub1N0cmluZyhjb250ZW50OiBzdHJpbmcsIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyk6IE1hcmtkb3duU3RyaW5nIHtcblx0Y29uc3QgcmV3cml0dGVuID0gY29ubmVjdGlvbkF1dGhvcml0eSA/IHJld3JpdGVNYXJrZG93bkxpbmtzKGNvbnRlbnQsIGNvbm5lY3Rpb25BdXRob3JpdHkpIDogY29udGVudDtcblx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhyZXdyaXR0ZW4pO1xufVxuXG5mdW5jdGlvbiBwYXJzZUFic29sdXRlRmlsZUxpbmtUYXJnZXQoaHJlZjogc3RyaW5nKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgZnJhZ21lbnRJbmRleCA9IGhyZWYuaW5kZXhPZignIycpO1xuXHRjb25zdCByYXdQYXRoID0gZnJhZ21lbnRJbmRleCA+PSAwID8gaHJlZi5zdWJzdHJpbmcoMCwgZnJhZ21lbnRJbmRleCkgOiBocmVmO1xuXHRpZiAocmF3UGF0aC5pbmNsdWRlcygnPycpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IGV4aXN0aW5nRnJhZ21lbnQgPSBmcmFnbWVudEluZGV4ID49IDAgPyBocmVmLnN1YnN0cmluZyhmcmFnbWVudEluZGV4ICsgMSkgOiAnJztcblx0Y29uc3QgcGFyc2VkUGF0aCA9IGV4aXN0aW5nRnJhZ21lbnQgPyB7IHBhdGg6IHJhd1BhdGggfSA6IHBhcnNlRmlsZUxvY2F0aW9uKHJhd1BhdGgpO1xuXHRsZXQgZGVjb2RlZFBhdGg6IHN0cmluZztcblx0dHJ5IHtcblx0XHRkZWNvZGVkUGF0aCA9IGRlY29kZVVSSUNvbXBvbmVudChwYXJzZWRQYXRoLnBhdGgpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgYWJzb2x1dGVQYXRoID0gZGVjb2RlZFBhdGg7XG5cdGNvbnN0IGlzV2luZG93c1BhdGggPSB3aW4zMi5pc0Fic29sdXRlKGFic29sdXRlUGF0aCk7XG5cdGlmICghcG9zaXguaXNBYnNvbHV0ZShhYnNvbHV0ZVBhdGgpICYmICFpc1dpbmRvd3NQYXRoKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IHNlbGVjdGlvbkZyYWdtZW50ID0gZm9ybWF0TG9jYXRpb25GcmFnbWVudChwYXJzZWRQYXRoKTtcblx0Y29uc3Qgbm9ybWFsaXplZFBhdGggPSBpc1dpbmRvd3NQYXRoID8gYWJzb2x1dGVQYXRoLnJlcGxhY2VBbGwoJ1xcXFwnLCAnLycpIDogYWJzb2x1dGVQYXRoO1xuXHRyZXR1cm4gVVJJLmZpbGUobm9ybWFsaXplZFBhdGgpLndpdGgoeyBmcmFnbWVudDogZXhpc3RpbmdGcmFnbWVudCB8fCBzZWxlY3Rpb25GcmFnbWVudCB9KTtcbn1cblxuaW50ZXJmYWNlIElGaWxlTG9jYXRpb24ge1xuXHRyZWFkb25seSBwYXRoOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxpbmU/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGNvbHVtbj86IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gcGFyc2VGaWxlTG9jYXRpb24ocGF0aDogc3RyaW5nKTogSUZpbGVMb2NhdGlvbiB7XG5cdGNvbnN0IG1hdGNoID0gL14oPzxwYXRoPi4rPyk6KD88bGluZT5bMS05XVxcZCopKD86Oig/PGNvbHVtbj5bMS05XVxcZCopKT8kLy5leGVjKHBhdGgpO1xuXHRpZiAoIW1hdGNoPy5ncm91cHMpIHtcblx0XHRyZXR1cm4geyBwYXRoIH07XG5cdH1cblx0Y29uc3QgbGluZSA9IE51bWJlcihtYXRjaC5ncm91cHMubGluZSk7XG5cdGNvbnN0IGNvbHVtbiA9IG1hdGNoLmdyb3Vwcy5jb2x1bW4gPyBOdW1iZXIobWF0Y2guZ3JvdXBzLmNvbHVtbikgOiB1bmRlZmluZWQ7XG5cdGlmIChcblx0XHQhTnVtYmVyLmlzU2FmZUludGVnZXIobGluZSlcblx0XHR8fCBjb2x1bW4gIT09IHVuZGVmaW5lZCAmJiAhTnVtYmVyLmlzU2FmZUludGVnZXIoY29sdW1uKVxuXHQpIHtcblx0XHRyZXR1cm4geyBwYXRoIH07XG5cdH1cblx0cmV0dXJuIHsgcGF0aDogbWF0Y2guZ3JvdXBzLnBhdGgsIGxpbmUsIGNvbHVtbiB9O1xufVxuXG5mdW5jdGlvbiBmb3JtYXRMb2NhdGlvbkZyYWdtZW50KGxvY2F0aW9uOiBJRmlsZUxvY2F0aW9uKTogc3RyaW5nIHtcblx0aWYgKGxvY2F0aW9uLmxpbmUgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXHRyZXR1cm4gYEwke2xvY2F0aW9uLmxpbmV9JHtsb2NhdGlvbi5jb2x1bW4gIT09IHVuZGVmaW5lZCAmJiBsb2NhdGlvbi5jb2x1bW4gIT09IDEgPyBgLCR7bG9jYXRpb24uY29sdW1ufWAgOiAnJ31gO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVGaWxlVXJpU2VsZWN0aW9uKHVyaTogVVJJLCBocmVmOiBzdHJpbmcpOiBVUkkge1xuXHRpZiAodXJpLnNjaGVtZS50b0xvd2VyQ2FzZSgpICE9PSBTY2hlbWFzLmZpbGUgfHwgdXJpLnF1ZXJ5IHx8IHVyaS5mcmFnbWVudCkge1xuXHRcdHJldHVybiB1cmk7XG5cdH1cblx0Y29uc3QgcGFyc2VkUGF0aCA9IHBhcnNlRmlsZUxvY2F0aW9uKGhyZWYpO1xuXHRpZiAocGFyc2VkUGF0aC5saW5lID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdXJpO1xuXHR9XG5cdGNvbnN0IGZyYWdtZW50ID0gZm9ybWF0TG9jYXRpb25GcmFnbWVudChwYXJzZWRQYXRoKTtcblx0Y29uc3Qgc3VmZml4TGVuZ3RoID0gaHJlZi5sZW5ndGggLSBwYXJzZWRQYXRoLnBhdGgubGVuZ3RoO1xuXHRyZXR1cm4gdXJpLndpdGgoeyBwYXRoOiB1cmkucGF0aC5zdWJzdHJpbmcoMCwgdXJpLnBhdGgubGVuZ3RoIC0gc3VmZml4TGVuZ3RoKSwgZnJhZ21lbnQgfSk7XG59XG5cbi8qKiBXcmFwcyBhbiBhYnNvbHV0ZSBwYXRoIG9yIGludGVybmFsIFVSSSB0YXJnZXQgZm9yIHRoZSBvd25pbmcgQWdlbnQgSG9zdCBjb25uZWN0aW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJld3JpdGVBZ2VudEhvc3RMaW5rVGFyZ2V0KGhyZWY6IHN0cmluZywgY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nKTogc3RyaW5nIHtcblx0bGV0IHBhcnNlZCA9IHBhcnNlQWJzb2x1dGVGaWxlTGlua1RhcmdldChocmVmKTtcblx0aWYgKCFwYXJzZWQpIHtcblx0XHR0cnkge1xuXHRcdFx0cGFyc2VkID0gVVJJLnBhcnNlKGhyZWYsIHRydWUpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIGhyZWY7XG5cdFx0fVxuXHRcdGNvbnN0IHNjaGVtZSA9IHBhcnNlZC5zY2hlbWUudG9Mb3dlckNhc2UoKTtcblx0XHRpZiAoIXNjaGVtZSB8fCBFWFRFUk5BTF9MSU5LX1NDSEVNRVMuaGFzKHNjaGVtZSkpIHtcblx0XHRcdHJldHVybiBocmVmO1xuXHRcdH1cblx0XHRwYXJzZWQgPSBub3JtYWxpemVGaWxlVXJpU2VsZWN0aW9uKHBhcnNlZC53aXRoKHsgc2NoZW1lIH0pLCBocmVmKTtcblx0XHRpZiAoIXBhcnNlZC5wYXRoLnN0YXJ0c1dpdGgoJy8nKSkge1xuXHRcdFx0cmV0dXJuIGhyZWY7XG5cdFx0fVxuXHR9XG5cblx0bGV0IGFnZW50SG9zdFVyaTogVVJJO1xuXHR0cnkge1xuXHRcdGFnZW50SG9zdFVyaSA9IHRvQWdlbnRIb3N0VXJpKHBhcnNlZCwgY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiBocmVmO1xuXHR9XG5cdGlmIChpc1NraWxsRmlsZVVyaShwYXJzZWQpICYmICFhZ2VudEhvc3RVcmkucXVlcnkuaW5jbHVkZXMoJ3ZzY29kZUxpbmtUeXBlPScpKSB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBhZ2VudEhvc3RVcmkucXVlcnk7XG5cdFx0YWdlbnRIb3N0VXJpID0gYWdlbnRIb3N0VXJpLndpdGgoeyBxdWVyeTogZXhpc3RpbmcgPyBgJHtleGlzdGluZ30mdnNjb2RlTGlua1R5cGU9c2tpbGxgIDogJ3ZzY29kZUxpbmtUeXBlPXNraWxsJyB9KTtcblx0fVxuXHRyZXR1cm4gYWdlbnRIb3N0VXJpLnRvU3RyaW5nKCk7XG59XG5cbi8qKlxuICogQ29udmVydHMgYSBwcm90b2NvbCBgU3RyaW5nT3JNYXJrZG93bmAgdmFsdWUgdG8gYSBjaGF0LWxheWVyIGBJTWFya2Rvd25TdHJpbmdgLlxuICpcbiAqIFdoZW4gYGNvbm5lY3Rpb25BdXRob3JpdHlgIGlzIHByb3ZpZGVkLCBtYXJrZG93biBsaW5rIFVSSXMgYXJlIHJld3JpdHRlblxuICogdGhyb3VnaCB7QGxpbmsgcmV3cml0ZU1hcmtkb3duTGlua3N9IHNvIHRoYXQgcmVtb3RlIHJlc291cmNlcyByZXNvbHZlXG4gKiB0aHJvdWdoIHRoZSBhZ2VudCBob3N0IGZpbGVzeXN0ZW0gcHJvdmlkZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdHJpbmdPck1hcmtkb3duVG9TdHJpbmcodmFsdWU6IFN0cmluZ09yTWFya2Rvd24sIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyk6IHN0cmluZyB8IElNYXJrZG93blN0cmluZztcbmV4cG9ydCBmdW5jdGlvbiBzdHJpbmdPck1hcmtkb3duVG9TdHJpbmcodmFsdWU6IFN0cmluZ09yTWFya2Rvd24gfCB1bmRlZmluZWQsIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyk6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZDtcbmV4cG9ydCBmdW5jdGlvbiBzdHJpbmdPck1hcmtkb3duVG9TdHJpbmcodmFsdWU6IFN0cmluZ09yTWFya2Rvd24gfCB1bmRlZmluZWQsIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyk6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXHRyZXR1cm4gcmF3TWFya2Rvd25Ub1N0cmluZyh2YWx1ZS5tYXJrZG93biwgY29ubmVjdGlvbkF1dGhvcml0eSk7XG59XG5cbi8qKlxuICogTnVtYmVyIG9mIGNvbW1lbnQtYm9keSBjaGFyYWN0ZXJzIHNob3duIGlubGluZSBpbiB0aGUge0BsaW5rIGFkZENvbW1lbnRSZWZlcmVuY2V9XG4gKiBwaWxsIGJlZm9yZSBpdCBpcyB0cnVuY2F0ZWQgd2l0aCBhbiBlbGxpcHNpcy5cbiAqL1xuY29uc3QgQUREX0NPTU1FTlRfUFJFVklFV19MRU5HVEggPSA0MDtcblxuLyoqXG4gKiBCdWlsZHMgdGhlIGlubGluZSBwcmV2aWV3IG9mIGFuIGBhZGRDb21tZW50YCBjb21tZW50IGJvZHk6IHdoaXRlc3BhY2UgaXNcbiAqIGNvbGxhcHNlZCB0byBzaW5nbGUgc3BhY2VzIGFuZCB0aGUgdGV4dCBpcyB0cnVuY2F0ZWQgdG9cbiAqIHtAbGluayBBRERfQ09NTUVOVF9QUkVWSUVXX0xFTkdUSH0gY2hhcmFjdGVycyB3aXRoIGEgdHJhaWxpbmcgZWxsaXBzaXMuXG4gKi9cbmZ1bmN0aW9uIGFkZENvbW1lbnRQcmV2aWV3KHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHNpbmdsZUxpbmUgPSB0ZXh0LnJlcGxhY2UoL1xccysvZywgJyAnKS50cmltKCk7XG5cdHJldHVybiBzaW5nbGVMaW5lLmxlbmd0aCA+IEFERF9DT01NRU5UX1BSRVZJRVdfTEVOR1RIXG5cdFx0PyBgJHtzaW5nbGVMaW5lLnNsaWNlKDAsIEFERF9DT01NRU5UX1BSRVZJRVdfTEVOR1RIKX1cdTIwMjZgXG5cdFx0OiBzaW5nbGVMaW5lO1xufVxuXG4vKiogV2hldGhlciB7QGxpbmsgdmFsdWV9IGlzIGEgcG9zaXRpdmUgMS1iYXNlZCBsaW5lL2NvbHVtbiBjb29yZGluYXRlLiAqL1xuZnVuY3Rpb24gaXNQb3NpdGl2ZUludGVnZXIodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBudW1iZXIge1xuXHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNJbnRlZ2VyKHZhbHVlKSAmJiB2YWx1ZSA+PSAxO1xufVxuXG4vKipcbiAqIFdoZXRoZXIge0BsaW5rIHZhbHVlfSBpcyBhIHZhbGlkIDEtYmFzZWQgZWRpdG9yIHJhbmdlOiBldmVyeSBjb29yZGluYXRlIG11c3RcbiAqIGJlIGFuIGludGVnZXIgPj0gMSwgc2luY2UgdGhlIHJhbmdlIGlzIGxhdGVyIHVzZWQgZm9yIGVkaXRvciBzZWxlY3Rpb24gYW5kXG4gKiByZXZlYWwuIEludmFsaWQgaW5wdXQgaXMgdHJlYXRlZCBhcyB1bnBhcnNlYWJsZSBzbyB0aGUgVUkgZmFsbHMgYmFjayB0byB0aGVcbiAqIHNlcnZlci1hdXRob3JlZCBtZXNzYWdlLlxuICovXG5mdW5jdGlvbiBpc09uZUJhc2VkUmFuZ2UodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBJUmFuZ2Uge1xuXHRjb25zdCByYW5nZSA9IHZhbHVlIGFzIElSYW5nZSB8IHVuZGVmaW5lZDtcblx0cmV0dXJuICEhcmFuZ2UgJiYgdHlwZW9mIHJhbmdlID09PSAnb2JqZWN0J1xuXHRcdCYmIGlzUG9zaXRpdmVJbnRlZ2VyKHJhbmdlLnN0YXJ0TGluZU51bWJlcilcblx0XHQmJiBpc1Bvc2l0aXZlSW50ZWdlcihyYW5nZS5zdGFydENvbHVtbilcblx0XHQmJiBpc1Bvc2l0aXZlSW50ZWdlcihyYW5nZS5lbmRMaW5lTnVtYmVyKVxuXHRcdCYmIGlzUG9zaXRpdmVJbnRlZ2VyKHJhbmdlLmVuZENvbHVtbik7XG59XG5cbi8qKlxuICogQnVpbGRzIGEgcmljaCwgY2xpY2thYmxlIHJlZmVyZW5jZSBmb3IgdGhlIGFnZW50IGhvc3QgYGFkZENvbW1lbnRgIGZlZWRiYWNrXG4gKiB0b29sIGNhbGwgXHUyMDE0IHRoZSB0b29sIG5hbWUgYW5kIHRoZSBmaXJzdFxuICoge0BsaW5rIEFERF9DT01NRU5UX1BSRVZJRVdfTEVOR1RIfSBjaGFyYWN0ZXJzIG9mIHRoZSBjb21tZW50IGJvZHkgaW4gcXVvdGVzLlxuICogQ2xpY2tpbmcgaXQgcnVucyB7QGxpbmsgQWdlbnRGZWVkYmFja1Jldmlld0NvbW1hbmRJZC5SZXZlYWxBdH0gdG8gb3BlbiB0aGVcbiAqIGZpbGUgYW5kIHJldmVhbCB0aGUgY29tbWVudCAoYWdlbnQgZmVlZGJhY2spIGluIHRoZSBlZGl0b3IuXG4gKlxuICogT25seSBjYWxsIHRoaXMgZm9yIHRoZSBgYWRkQ29tbWVudGAgdG9vbCAoZ2F0ZSBjYWxsIHNpdGVzIHdpdGhcbiAqIHtAbGluayBpc0FkZENvbW1lbnRUb29sfSkuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgYXJndW1lbnRzIGNhbid0IGJlXG4gKiBwYXJzZWQsIHNvIHRoZSBjYWxsZXIgZmFsbHMgYmFjayB0byB0aGUgc2VydmVyLWF1dGhvcmVkIG1lc3NhZ2UuXG4gKi9cbmZ1bmN0aW9uIGFkZENvbW1lbnRSZWZlcmVuY2UodGM6IFRvb2xDYWxsU3RhdGUpOiBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQge1xuXHQvLyBgdG9vbElucHV0YCBpcyBhYnNlbnQgd2hpbGUgcGFyYW1ldGVycyBhcmUgc3RpbGwgc3RyZWFtaW5nOyBldmVyeSBvdGhlclxuXHQvLyBzdGF0ZSBjYXJyaWVzIGl0IChzZWUgYFRvb2xDYWxsUGFyYW1ldGVyRmllbGRzYCkuXG5cdGlmICh0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyB8fCAhdGMudG9vbElucHV0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB0b29sSW5wdXQgPSB0Yy50b29sSW5wdXQ7XG5cdGxldCBhcmdzOiB7IHJlc291cmNlVXJpPzogdW5rbm93bjsgcmFuZ2U/OiB1bmtub3duOyB0ZXh0PzogdW5rbm93biB9O1xuXHR0cnkge1xuXHRcdGFyZ3MgPSBKU09OLnBhcnNlKHRvb2xJbnB1dCk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHR5cGVvZiBhcmdzLnJlc291cmNlVXJpICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgYXJncy50ZXh0ICE9PSAnc3RyaW5nJyB8fCAhaXNPbmVCYXNlZFJhbmdlKGFyZ3MucmFuZ2UpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBwcmV2aWV3ID0gZXNjYXBlSWNvbnMoZXNjYXBlTWFya2Rvd25MaW5rTGFiZWwoYWRkQ29tbWVudFByZXZpZXcoYXJncy50ZXh0KSkpO1xuXHQvLyBUaGUgY29tbWFuZCByZXNvbHZlcyB0aGUgb3duaW5nIHNlc3Npb24gZnJvbSB0aGUgZmlsZSByZXNvdXJjZSwgc28gdGhlXG5cdC8vIGxpbmsgb25seSBuZWVkcyB0aGUgcmVzb3VyY2UgYW5kIHJhbmdlIChib3RoIGtub3duIGhlcmUpLlxuXHRjb25zdCBjb21tYW5kQXJncyA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShbYXJncy5yZXNvdXJjZVVyaSwgYXJncy5yYW5nZV0pKTtcblx0Y29uc3QgbGluayA9IGBjb21tYW5kOiR7QWdlbnRGZWVkYmFja1Jldmlld0NvbW1hbmRJZC5SZXZlYWxBdH0/JHtjb21tYW5kQXJnc31gO1xuXHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKGBbYWRkQ29tbWVudCBcIiR7cHJldmlld31cIl0oJHtsaW5rfSlgLCB7XG5cdFx0aXNUcnVzdGVkOiB7IGVuYWJsZWRDb21tYW5kczogW0FnZW50RmVlZGJhY2tSZXZpZXdDb21tYW5kSWQuUmV2ZWFsQXRdIH0sXG5cdFx0c3VwcG9ydFRoZW1lSWNvbnM6IHRydWUsXG5cdH0pO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBsaXZlIHtAbGluayBDaGF0VG9vbEludm9jYXRpb259IGZyb20gdGhlIHByb3RvY29sJ3MgdG9vbC1jYWxsXG4gKiBzdGF0ZS4gVXNlZCBkdXJpbmcgYWN0aXZlIHR1cm5zIHRvIHJlcHJlc2VudCBydW5uaW5nIHRvb2wgY2FsbHMgaW4gdGhlIFVJLlxuICpcbiAqIEBwYXJhbSBjb25uZWN0aW9uQXV0aG9yaXR5IFNhbml0aXplZCBjb25uZWN0aW9uIGlkZW50aWZpZXIgdXNlZCB3aGVuXG4gKiAgIHdyYXBwaW5nIHJlbW90ZSBmaWxlIFVSSXMgaW50byBgdnNjb2RlLWFnZW50LWhvc3Q6YCBVUklzLiBPbWl0IHRvIHNraXBcbiAqICAgVVJJIHdyYXBwaW5nIChlLmcuIGluIHRlc3RzIHRoYXQgZG9uJ3QgZXhlcmNpc2UgdGhlIGNvbmZpcm1hdGlvbiBVSSkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjOiBUb29sQ2FsbFN0YXRlLCBzdWJBZ2VudEludm9jYXRpb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBzZXNzaW9uUmVzb3VyY2U6IFVSSSwgY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nLCBtY3BTZXJ2ZXJBdXRob3JpdHkgPSBzZXNzaW9uUmVzb3VyY2UuYXV0aG9yaXR5LCBvcHRpb25zPzogSUFnZW50SG9zdFRvb2xJbnZvY2F0aW9uT3B0aW9ucyk6IENoYXRUb29sSW52b2NhdGlvbiB7XG5cdGNvbnN0IHRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdFx0aWQ6IHRjLnRvb2xOYW1lLFxuXHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0ZGlzcGxheU5hbWU6IHRjLmRpc3BsYXlOYW1lLFxuXHRcdG1vZGVsRGVzY3JpcHRpb246IHRjLnRvb2xOYW1lLFxuXHR9O1xuXG5cdGlmICh0Yy5jb250cmlidXRvcj8ua2luZCA9PT0gVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50ICYmIG9wdGlvbnMgJiYgdGMuY29udHJpYnV0b3IuY2xpZW50SWQgIT09IG9wdGlvbnMuY3VycmVudENsaWVudElkKSB7XG5cdFx0Y29uc3QgaW52b2NhdGlvbiA9IG5ldyBDaGF0VG9vbEludm9jYXRpb24odW5kZWZpbmVkLCB0b29sRGF0YSwgdGMudG9vbENhbGxJZCwgc3ViQWdlbnRJbnZvY2F0aW9uSWQsIHVuZGVmaW5lZCk7XG5cdFx0aW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSA9IGxvY2FsaXplKCdhZ2VudEhvc3Qub3RoZXJDbGllbnRUb29sLnJ1bm5pbmcnLCBcIlJ1bm5pbmcgezB9IG9uIGFub3RoZXIgY2xpZW50Li4uXCIsIHRjLmRpc3BsYXlOYW1lKTtcblx0XHRpbnZvY2F0aW9uLm90aGVyQ2xpZW50VG9vbENhbGwgPSB7XG5cdFx0XHRjYW5jZWw6ICgpID0+IG9wdGlvbnMuY2FuY2VsT3RoZXJDbGllbnRUb29sQ2FsbCh0YyksXG5cdFx0fTtcblx0XHRyZXR1cm4gaW52b2NhdGlvbjtcblx0fVxuXG5cdGlmICh0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24pIHtcblx0XHQvLyBUb29sIG5lZWRzIGNvbmZpcm1hdGlvbiBcdTIwMTQgY3JlYXRlIHdpdGggY29uZmlybWF0aW9uIG1lc3NhZ2VzLlxuXHRcdC8vIChTdWJhZ2VudC1zcGF3bmluZyB0b29scyBuZXZlciByZWFjaCB0aGlzIHN0YXRlIGluIHByb2R1Y3Rpb246IHRoZVxuXHRcdC8vIENvcGlsb3QgU0RLJ3MgYHRhc2tgIHRvb2wgZG9lc24ndCByZXF1ZXN0IHBlcm1pc3Npb24sIGFuZCB0aGUgZXZlbnRcblx0XHQvLyBtYXBwZXIgYXV0by1lbWl0cyBgdG9vbF9yZWFkeWAgd2l0aCBgY29uZmlybWVkOiBOb3ROZWVkZWRgIHBhaXJlZFxuXHRcdC8vIHdpdGggYHRvb2xfc3RhcnRgLiBTbyBubyBzcGVjaWFsLWNhc2UgZm9yIHN1YmFnZW50cyBpcyBuZWVkZWQgaGVyZS4pXG5cdFx0Y29uc3QgY29uZmlybWF0aW9uTWVzc2FnZXMgPSB0b29sQ2FsbENvbmZpcm1hdGlvbk1lc3NhZ2VzKHRjLCBjb25uZWN0aW9uQXV0aG9yaXR5KTtcblxuXHRcdGxldCB0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIHwgSUNoYXRUb29sSW5wdXRJbnZvY2F0aW9uRGF0YSB8IElDaGF0TW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvbkRhdGEgfCBJQ2hhdEFnZW50RmVlZGJhY2tSZXZpZXdDb25maXJtYXRpb25EYXRhIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHBlbmRpbmdFZGl0cyA9IHRjLmVkaXRzPy5pdGVtcztcblx0XHRpZiAoaXNWaWV3VW5yZXZpZXdlZENvbW1lbnRzVG9vbCh0Yy50b29sTmFtZSkpIHtcblx0XHRcdC8vIFRoZSBhZ2VudCBob3N0IHN1cmZhY2VzIHRoaXMgc2VydmVyIHRvb2wgYXMgYSBjb25maXJtYXRpb24gKGl0IGlzXG5cdFx0XHQvLyBleGNsdWRlZCBmcm9tIGF1dG8tYXBwcm92ZSkuIFJlbmRlciBhIGN1c3RvbSBjb25maXJtYXRpb24gdGhhdCBsZXRzXG5cdFx0XHQvLyB0aGUgdXNlciBwaWNrIHdoaWNoIHVucmV2aWV3ZWQgY29tbWVudHMgdG8gcmV2ZWFsOyB0aGUgcmVuZGVyZXJcblx0XHRcdC8vIGZldGNoZXMgdGhlIGNvbW1lbnRzIGFuZCBhcHBsaWVzIHRoZSBzZWxlY3Rpb24gdmlhIGZlZWRiYWNrXG5cdFx0XHQvLyBjb21tYW5kcywgc28gdGhpcyBsYXllciBjYXJyaWVzIG9ubHkgdGhlIGJ1dHRvbiBsYWJlbHMuXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhID0ge1xuXHRcdFx0XHRraW5kOiAnYWdlbnRGZWVkYmFja1Jldmlld0NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdG9wdGlvbnM6IFtsb2NhbGl6ZSgnYWdlbnRGZWVkYmFjay5yZXZlYWwnLCBcIlJldmVhbCBTZWxlY3RlZFwiKV0sXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSBpZiAocGVuZGluZ0VkaXRzPy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHdyYXAgPSAodXJpOiBVUkkpID0+IGNvbm5lY3Rpb25BdXRob3JpdHkgPyB0b0FnZW50SG9zdFVyaSh1cmksIGNvbm5lY3Rpb25BdXRob3JpdHkpIDogdXJpO1xuXHRcdFx0Y29uc3QgbWFwcGVkID0gbWFwRmlsZUVkaXRzKHBlbmRpbmdFZGl0cywgdGMudG9vbENhbGxJZCk7XG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhID0ge1xuXHRcdFx0XHRraW5kOiAnbW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdG9wdGlvbnM6IFsnQWxsb3cnXSxcblx0XHRcdFx0bW9kaWZpZWRGaWxlczogbWFwcGVkLm1hcChlZGl0ID0+IHtcblx0XHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IHdyYXAoZWRpdC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxSZXNvdXJjZSA9IGVkaXQub3JpZ2luYWxSZXNvdXJjZSA/IHdyYXAoZWRpdC5vcmlnaW5hbFJlc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBtb2RpZmllZENvbnRlbnQgPSBlZGl0LmFmdGVyQ29udGVudFVyaSA/IHdyYXAoZWRpdC5hZnRlckNvbnRlbnRVcmkpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsQ29udGVudCA9IGVkaXQuYmVmb3JlQ29udGVudFVyaSA/IHdyYXAoZWRpdC5iZWZvcmVDb250ZW50VXJpKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0dXJpOiByZXNvdXJjZSxcblx0XHRcdFx0XHRcdGVkaXRLaW5kOiBlZGl0LmtpbmQgYXMgQ2hhdEV4dGVybmFsRWRpdEtpbmQsXG5cdFx0XHRcdFx0XHRvcmlnaW5hbFVyaTogb3JpZ2luYWxSZXNvdXJjZSxcblx0XHRcdFx0XHRcdG1vZGlmaWVkQ29udGVudFVyaTogbW9kaWZpZWRDb250ZW50LFxuXHRcdFx0XHRcdFx0b3JpZ2luYWxDb250ZW50VXJpOiBvcmlnaW5hbENvbnRlbnQsXG5cdFx0XHRcdFx0XHRpbnNlcnRpb25zOiBlZGl0LmRpZmY/LmFkZGVkLFxuXHRcdFx0XHRcdFx0ZGVsZXRpb25zOiBlZGl0LmRpZmY/LnJlbW92ZWQsXG5cdFx0XHRcdFx0XHR0aXRsZTogYmFzZW5hbWUoZWRpdC5yZXNvdXJjZSksXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZWRpdC5yZXNvdXJjZS5wYXRoLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pLFxuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKGdldFRvb2xLaW5kKHRjKSA9PT0gJ3Rlcm1pbmFsJyAmJiB0Yy50b29sSW5wdXQpIHtcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEgPSBidWlsZFRlcm1pbmFsVG9vbFNwZWNpZmljRGF0YSh0Yywgc2Vzc2lvblJlc291cmNlKTtcblx0XHR9IGVsc2UgaWYgKHRjLnRvb2xJbnB1dCkge1xuXHRcdFx0bGV0IHJhd0lucHV0OiB1bmtub3duO1xuXHRcdFx0dHJ5IHsgcmF3SW5wdXQgPSBKU09OLnBhcnNlKHRjLnRvb2xJbnB1dCk7IH0gY2F0Y2ggeyByYXdJbnB1dCA9IHsgaW5wdXQ6IHRjLnRvb2xJbnB1dCB9OyB9XG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhID0geyBraW5kOiAnaW5wdXQnLCByYXdJbnB1dCB9O1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgQ2hhdFRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0e1xuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogc3RyaW5nT3JNYXJrZG93blRvU3RyaW5nKHRjLmludm9jYXRpb25NZXNzYWdlLCBjb25uZWN0aW9uQXV0aG9yaXR5KSxcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0XHRcdHByZXNlbnRhdGlvbjogVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24uSGlkZGVuQWZ0ZXJDb21wbGV0ZSxcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdH0sXG5cdFx0XHR0b29sRGF0YSxcblx0XHRcdHRjLnRvb2xDYWxsSWQsXG5cdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXHR9XG5cblx0Y29uc3QgaW52b2NhdGlvbiA9IG5ldyBDaGF0VG9vbEludm9jYXRpb24odW5kZWZpbmVkLCB0b29sRGF0YSwgdGMudG9vbENhbGxJZCwgc3ViQWdlbnRJbnZvY2F0aW9uSWQsIHVuZGVmaW5lZCk7XG5cdGludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UgPSBzdHJpbmdPck1hcmtkb3duVG9TdHJpbmcodGMuaW52b2NhdGlvbk1lc3NhZ2UsIGNvbm5lY3Rpb25BdXRob3JpdHkpID8/IHRjLmRpc3BsYXlOYW1lO1xuXHRpZiAoaXNBZ2VudEhvc3RBc2tVc2VyVG9vbCh0Yy50b29sTmFtZSkpIHtcblx0XHRpbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlID0gbG9jYWxpemUoJ2FnZW50SG9zdC5hc2tVc2VyLndhaXRpbmcnLCBcIldhaXRpbmcgZm9yIGFuc3dlci4uLlwiKTtcblx0XHRpbnZvY2F0aW9uLnByZXNlbnRhdGlvbiA9IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbkFmdGVyQ29tcGxldGU7XG5cdH1cblx0aWYgKHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQXV0aFJlcXVpcmVkKSB7XG5cdFx0aW52b2NhdGlvbi5zZXRBdXRoZW50aWNhdGlvblJlcXVpcmVkKHRvb2xDYWxsQXV0aGVudGljYXRpb25TZXJ2ZXIodGMsIG1jcFNlcnZlckF1dGhvcml0eSkpO1xuXHR9XG5cblx0Ly8gVG9vbHMgdGhhdCByZW5kZXIgYSBiZXNwb2tlLCBjbGllbnQtYXV0aG9yZWQgaW52b2NhdGlvbiBtZXNzYWdlIG92ZXJyaWRlXG5cdC8vIHRoZSBzZXJ2ZXIgdGV4dCBoZXJlLiBBZGQgbmV3IHBlci10b29sIGNhc2VzIGFsb25nc2lkZSB0aGlzIGJyYW5jaC5cblx0aWYgKGlzQWRkQ29tbWVudFRvb2wodGMudG9vbE5hbWUpKSB7XG5cdFx0aW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSA9IGFkZENvbW1lbnRSZWZlcmVuY2UodGMpID8/IGludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2U7XG5cdH1cblxuXHRpZiAoaXNUZXJtaW5hbFRvb2xDYWxsKHRjKSkge1xuXHRcdC8vIFNldCB0ZXJtaW5hbCB0b29sU3BlY2lmaWNEYXRhIGVhZ2VybHkgc28gdGhlIHJlbmRlcmVyIHNob3dzIGFcblx0XHQvLyB0ZXJtaW5hbCBwaWxsIChleHBhbmRhYmxlIGNvbW1hbmQgKyBvdXRwdXQgYXJlYSkgZnJvbSB0aGUgc3RhcnQsXG5cdFx0Ly8gaW5zdGVhZCBvZiBmYWxsaW5nIGJhY2sgdG8gdGhlIGdlbmVyaWMgdG9vbCB3aWRnZXQgdGhhdCBvbmx5XG5cdFx0Ly8gc3VyZmFjZXMgdGhlIGZpcnN0IGxpbmUgb2YgdGhlIGNvbW1hbmQgdmlhIHRoZSBpbnZvY2F0aW9uIG1lc3NhZ2UuXG5cdFx0Ly8gRm9yIHRoZSBTREsncyBidWlsdC1pbiBgYmFzaGAvYHBvd2Vyc2hlbGxgIHRvb2xzIHRoZXJlJ3Mgbm9cblx0XHQvLyBUZXJtaW5hbCBjb250ZW50IGJsb2NrICh0aGV5IHJ1biBvdXRzaWRlIEFIUCdzIHRlcm1pbmFsIGluZnJhKSxcblx0XHQvLyBzbyB0aGUgQUhQLXRlcm1pbmFsIGZpZWxkcyAoYHRlcm1pbmFsVG9vbFNlc3Npb25JZGAsXG5cdFx0Ly8gYHRlcm1pbmFsQ29tbWFuZFVyaWApIHN0YXkgdW5kZWZpbmVkIFx1MjAxNCB0aGUgcmVuZGVyZXIgdHJlYXRzIHRoaXNcblx0XHQvLyBhcyBhIGRpc3BsYXktb25seSB0ZXJtaW5hbCB0aGF0IHN0aWxsIHN1cmZhY2VzIGNvbW1hbmQgKyBvdXRwdXQuXG5cdFx0aW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhID0gYnVpbGRUZXJtaW5hbFRvb2xTcGVjaWZpY0RhdGEodGMsIHNlc3Npb25SZXNvdXJjZSk7XG5cdH0gZWxzZSBpZiAoaXNTdWJhZ2VudFRvb2wodGMpKSB7XG5cdFx0Ly8gU3ViYWdlbnQtc3Bhd25pbmcgdG9vbDogc2V0IHN1YmFnZW50IHRvb2xTcGVjaWZpY0RhdGEgZWFnZXJseSBzbyB0aGVcblx0XHQvLyByZW5kZXJlciBncm91cHMgaXQgY29ycmVjdGx5IGZyb20gdGhlIHN0YXJ0IChiZWZvcmUgY2hpbGQgY29udGVudFxuXHRcdC8vIGFycml2ZXMpLiBBZ2VudCBtZXRhZGF0YSBjb21lcyBmcm9tIGBfbWV0YWAgKHNldCBieSB0aGUgZXZlbnRcblx0XHQvLyBtYXBwZXIgZnJvbSB0aGUgdG9vbCdzIGFyZ3VtZW50cykgYW5kIGlzIGxhdGVyIHJlZmluZWQgYnkgdGhlXG5cdFx0Ly8gU3ViYWdlbnQgY29udGVudCBibG9jayB2aWEgYHVwZGF0ZVJ1bm5pbmdUb29sU3BlY2lmaWNEYXRhYC5cblx0XHRjb25zdCBzdWJhZ2VudENvbnRlbnQgPSAodGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nIHx8IHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKVxuXHRcdFx0PyBnZXRUb29sU3ViYWdlbnRDb250ZW50KHRjKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0aW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhID0ge1xuXHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBnZXRTdWJhZ2VudFRhc2tEZXNjcmlwdGlvbih0YyksXG5cdFx0XHRhZ2VudE5hbWU6IHN1YmFnZW50Q29udGVudD8uYWdlbnROYW1lID8/IGdldFN1YmFnZW50QWdlbnROYW1lKHRjKSxcblx0XHRcdGNoYXRSZXNvdXJjZTogZ2V0U3ViYWdlbnRDaGF0UmVzb3VyY2UodGMsIHN1YmFnZW50Q29udGVudCwgc2Vzc2lvblJlc291cmNlKSxcblx0XHR9O1xuXHR9IGVsc2UgaWYgKGdldFRvb2xLaW5kKHRjKSA9PT0gJ3NlYXJjaCcpIHtcblx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSB7IGtpbmQ6ICdzZWFyY2gnIH07XG5cdH0gZWxzZSBpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcpIHtcblx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSBidWlsZE1jcEFwcFRvb2xJbnB1dERhdGEodGMsIHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRyZXR1cm4gaW52b2NhdGlvbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvb2xDYWxsQ29uZmlybWF0aW9uTWVzc2FnZXModGM6IFRvb2xDYWxsUGVuZGluZ0NvbmZpcm1hdGlvblN0YXRlLCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcpOiBJVG9vbENvbmZpcm1hdGlvbk1lc3NhZ2VzIHtcblx0Y29uc3Qgcmlza0Fzc2Vzc21lbnQgPSB0Yy5yaXNrQXNzZXNzbWVudDtcblx0bGV0IGFwcHJvdmFsUmVhc29uOiBJVG9vbENvbmZpcm1hdGlvbk1lc3NhZ2VzWydhcHByb3ZhbFJlYXNvbiddO1xuXHRpZiAocmlza0Fzc2Vzc21lbnQ/LnN0YXR1cyA9PT0gVG9vbENhbGxSaXNrQXNzZXNzbWVudFN0YXR1cy5Mb2FkaW5nKSB7XG5cdFx0YXBwcm92YWxSZWFzb24gPSB7IHN0YXR1czogJ2xvYWRpbmcnIH07XG5cdH0gZWxzZSBpZiAocmlza0Fzc2Vzc21lbnQ/LnN0YXR1cyA9PT0gVG9vbENhbGxSaXNrQXNzZXNzbWVudFN0YXR1cy5Db21wbGV0ZSkge1xuXHRcdGFwcHJvdmFsUmVhc29uID0ge1xuXHRcdFx0c3RhdHVzOiAnY29tcGxldGUnLFxuXHRcdFx0ZXhwbGFuYXRpb246IHN0cmluZ09yTWFya2Rvd25Ub1N0cmluZyhyaXNrQXNzZXNzbWVudC5yZWFzb24sIGNvbm5lY3Rpb25BdXRob3JpdHkpLFxuXHRcdFx0c2FmZXR5OiByaXNrQXNzZXNzbWVudC5zYWZldHksXG5cdFx0fTtcblx0fVxuXHRyZXR1cm4ge1xuXHRcdHRpdGxlOiBpc1ZpZXdVbnJldmlld2VkQ29tbWVudHNUb29sKHRjLnRvb2xOYW1lKVxuXHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRGZWVkYmFjay5yZXZpZXdUaXRsZScsIFwiUmV2ZWFsIHVucmV2aWV3ZWQgY29tbWVudHM/XCIpXG5cdFx0XHQ6IHN0cmluZ09yTWFya2Rvd25Ub1N0cmluZyh0Yy5jb25maXJtYXRpb25UaXRsZSwgY29ubmVjdGlvbkF1dGhvcml0eSkgPz8gdGMuZGlzcGxheU5hbWUsXG5cdFx0bWVzc2FnZTogaXNWaWV3VW5yZXZpZXdlZENvbW1lbnRzVG9vbCh0Yy50b29sTmFtZSlcblx0XHRcdD8gbG9jYWxpemUoJ2FnZW50RmVlZGJhY2sucmV2aWV3TWVzc2FnZScsIFwiQ2hvb3NlIHdoaWNoIGNvbW1lbnRzIHRvIHJldmVhbCB0byB0aGUgYWdlbnQuIFVuY2hlY2tlZCBjb21tZW50cyBzdGF5IGhpZGRlbi5cIilcblx0XHRcdDogc3RyaW5nT3JNYXJrZG93blRvU3RyaW5nKHRjLmludm9jYXRpb25NZXNzYWdlLCBjb25uZWN0aW9uQXV0aG9yaXR5KSxcblx0XHRhcHByb3ZhbFJlYXNvbixcblx0XHQuLi4odGMub3B0aW9ucyA/IHsgY3VzdG9tT3B0aW9uczogdGMub3B0aW9ucyB9IDoge30pLFxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9vbENhbGxBdXRoZW50aWNhdGlvblNlcnZlcih0YzogVG9vbENhbGxTdGF0ZSAmIHsgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5BdXRoUmVxdWlyZWQgfSwgc2Vzc2lvbkF1dGhvcml0eTogc3RyaW5nKTogSUNoYXRNY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkU2VydmVyIHtcblx0Y29uc3QgbWV0YWRhdGEgPSByZWFkVG9vbENhbGxNZXRhKHRjKTtcblx0cmV0dXJuIHtcblx0XHRpZDogYCR7c2Vzc2lvbkF1dGhvcml0eX0vJHt0Yy5jb250cmlidXRvci5jdXN0b21pemF0aW9uSWR9YCxcblx0XHRuYW1lOiB0Yy5hdXRoLnJlc291cmNlLnJlc291cmNlX25hbWUgPz8gbWV0YWRhdGEubWNwU2VydmVyTmFtZSA/PyB0Yy5kaXNwbGF5TmFtZSxcblx0XHRyZXNvdXJjZTogdGMuYXV0aC5yZXNvdXJjZS5yZXNvdXJjZSxcblx0XHRvYXV0aENsaWVudDogdGMuYXV0aC5vYXV0aENsaWVudCxcblx0XHRhdXRob3JpemF0aW9uU2VydmVyczogdGMuYXV0aC5yZXNvdXJjZS5hdXRob3JpemF0aW9uX3NlcnZlcnMsXG5cdFx0c3VwcG9ydGVkU2NvcGVzOiB0Yy5hdXRoLnJlc291cmNlLnNjb3Blc19zdXBwb3J0ZWQsXG5cdFx0cmVxdWlyZWRTY29wZXM6IHRjLmF1dGgucmVxdWlyZWRTY29wZXMsXG5cdFx0cmVhc29uOiB0Yy5hdXRoLnJlYXNvbixcblx0fTtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEge0BsaW5rIENoYXRUb29sSW52b2NhdGlvbn0gaW4gdGhlIG5hdGl2ZSBzdHJlYW1pbmcgc3RhdGUgZm9yIGFcbiAqIHRvb2wgY2FsbCB0aGF0IGlzIHN0aWxsIHN0cmVhbWluZyBpdHMgYXJndW1lbnRzIChBSFBcbiAqIHtAbGluayBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmd9KS4gVGhlIGludm9jYXRpb24gaXMgbGF0ZXIgZHJpdmVuIG91dCBvZiB0aGVcbiAqIHN0cmVhbWluZyBzdGF0ZSB2aWEge0BsaW5rIENoYXRUb29sSW52b2NhdGlvbi50cmFuc2l0aW9uRnJvbVN0cmVhbWluZ30gb25jZVxuICogdGhlIHRvb2wgcmVhY2hlcyBjb25maXJtYXRpb24vcnVubmluZywgc28gYSBzaW5nbGUgY2FyZCByZXByZXNlbnRzIHRoZSB3aG9sZVxuICogbGlmZWN5Y2xlIGluc3RlYWQgb2YgYSBzZXR0bGVkIHBsYWNlaG9sZGVyIHBsdXMgYSByZXBsYWNlbWVudC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRvb2xDYWxsU3RhdGVUb1N0cmVhbWluZ0ludm9jYXRpb24odGM6IFRvb2xDYWxsU3RhdGUsIHN1YkFnZW50SW52b2NhdGlvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHNlc3Npb25SZXNvdXJjZT86IFVSSSwgY29ubmVjdGlvbkF1dGhvcml0eT86IHN0cmluZywgbWNwU2VydmVyQXV0aG9yaXR5Pzogc3RyaW5nKTogQ2hhdFRvb2xJbnZvY2F0aW9uIHtcblx0Y29uc3QgaW52b2NhdGlvbiA9IENoYXRUb29sSW52b2NhdGlvbi5jcmVhdGVTdHJlYW1pbmcoe1xuXHRcdHRvb2xDYWxsSWQ6IHRjLnRvb2xDYWxsSWQsXG5cdFx0dG9vbElkOiB0Yy50b29sTmFtZSxcblx0XHR0b29sRGF0YToge1xuXHRcdFx0aWQ6IHRjLnRvb2xOYW1lLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGRpc3BsYXlOYW1lOiB0Yy5kaXNwbGF5TmFtZSxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246IHRjLnRvb2xOYW1lLFxuXHRcdH0sXG5cdFx0c3ViYWdlbnRJbnZvY2F0aW9uSWQ6IHN1YkFnZW50SW52b2NhdGlvbklkLFxuXHR9KTtcblx0dXBkYXRlU3RyZWFtaW5nVG9vbEludm9jYXRpb24oaW52b2NhdGlvbiwgdGMsIGNvbm5lY3Rpb25BdXRob3JpdHkgPz8gJycpO1xuXHRpZiAoaXNBZ2VudEhvc3RBc2tVc2VyVG9vbCh0Yy50b29sTmFtZSkpIHtcblx0XHRpbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlID0gbG9jYWxpemUoJ2FnZW50SG9zdC5hc2tVc2VyLmFza2luZycsIFwiQXNraW5nIGEgcXVlc3Rpb24uLi5cIik7XG5cdFx0aW52b2NhdGlvbi5wcmVzZW50YXRpb24gPSBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbi5IaWRkZW5BZnRlckNvbXBsZXRlO1xuXHR9XG5cdGlmIChzZXNzaW9uUmVzb3VyY2UgJiYgaXNTdWJhZ2VudFRvb2wodGMpKSB7XG5cdFx0aW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yywgc3ViQWdlbnRJbnZvY2F0aW9uSWQsIHNlc3Npb25SZXNvdXJjZSwgY29ubmVjdGlvbkF1dGhvcml0eSA/PyAnJywgbWNwU2VydmVyQXV0aG9yaXR5KS50b29sU3BlY2lmaWNEYXRhO1xuXHR9XG5cdHJldHVybiBpbnZvY2F0aW9uO1xufVxuXG5mdW5jdGlvbiBnZXRTdHJlYW1pbmdUb29sSW5wdXRGb3JEaXNwbGF5KHRjOiBUb29sQ2FsbFN0YXRlKTogdW5rbm93biB8IHVuZGVmaW5lZCB7XG5cdGlmICh0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyB8fCAhdGMucGFydGlhbElucHV0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gcGFyc2VQYXJ0aWFsVG9vbElucHV0Rm9yRGlzcGxheSh0Yy5wYXJ0aWFsSW5wdXQpID8/IHRjLnBhcnRpYWxJbnB1dDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZVN0cmVhbWluZ1Rvb2xJbnZvY2F0aW9uKGV4aXN0aW5nOiBDaGF0VG9vbEludm9jYXRpb24sIHRjOiBUb29sQ2FsbFN0YXRlLCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcpOiB1bmtub3duIHwgdW5kZWZpbmVkIHtcblx0aWYgKHRjLnN0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBwYXJ0aWFsSW5wdXQgPSBnZXRTdHJlYW1pbmdUb29sSW5wdXRGb3JEaXNwbGF5KHRjKTtcblx0aWYgKHBhcnRpYWxJbnB1dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0ZXhpc3RpbmcudXBkYXRlUGFydGlhbElucHV0KHBhcnRpYWxJbnB1dCk7XG5cdH1cblx0Y29uc3QgaW52b2NhdGlvbk1lc3NhZ2UgPSBzdHJpbmdPck1hcmtkb3duVG9TdHJpbmcodGMuaW52b2NhdGlvbk1lc3NhZ2UsIGNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHRpZiAoaW52b2NhdGlvbk1lc3NhZ2UpIHtcblx0XHRleGlzdGluZy51cGRhdGVTdHJlYW1pbmdNZXNzYWdlKGludm9jYXRpb25NZXNzYWdlKTtcblx0fVxuXHRyZXR1cm4gcGFydGlhbElucHV0O1xufVxuXG4vKipcbiAqIEV4dHJhY3RzIHRoZSB7QGxpbmsgSVByZXBhcmVkVG9vbEludm9jYXRpb259IGRpc3BsYXkgZmllbGRzIGZvciBhIHRvb2wtY2FsbFxuICogc3RhdGUsIHJldXNpbmcge0BsaW5rIHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb259IHNvIHRoZSBjb25maXJtYXRpb24sXG4gKiB0ZXJtaW5hbCwgYW5kIG90aGVyIGB0b29sU3BlY2lmaWNEYXRhYCBsb2dpYyBzdGF5cyBpbiBvbmUgcGxhY2UuIFVzZWQgdG9cbiAqIHRyYW5zaXRpb24gYSBzdHJlYW1pbmcgaW52b2NhdGlvbiBpbnRvIGl0cyBjb25maXJtYXRpb24vcnVubmluZyBwcmVzZW50YXRpb25cbiAqIHdpdGhvdXQgYWxsb2NhdGluZyBhIHNlY29uZCB2aXNpYmxlIGNhcmQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b29sQ2FsbFN0YXRlVG9QcmVwYXJlZEludm9jYXRpb24odGM6IFRvb2xDYWxsU3RhdGUsIHNlc3Npb25SZXNvdXJjZTogVVJJLCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcsIG1jcFNlcnZlckF1dGhvcml0eSA9IHNlc3Npb25SZXNvdXJjZS5hdXRob3JpdHksIG9wdGlvbnM/OiBJQWdlbnRIb3N0VG9vbEludm9jYXRpb25PcHRpb25zKTogSVByZXBhcmVkVG9vbEludm9jYXRpb24ge1xuXHRjb25zdCBidWlsdCA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMsIHVuZGVmaW5lZCwgc2Vzc2lvblJlc291cmNlLCBjb25uZWN0aW9uQXV0aG9yaXR5LCBtY3BTZXJ2ZXJBdXRob3JpdHksIG9wdGlvbnMpO1xuXHRyZXR1cm4ge1xuXHRcdGludm9jYXRpb25NZXNzYWdlOiBidWlsdC5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRwYXN0VGVuc2VNZXNzYWdlOiBidWlsdC5wYXN0VGVuc2VNZXNzYWdlLFxuXHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiBidWlsdC5jb25maXJtYXRpb25NZXNzYWdlcyxcblx0XHRwcmVzZW50YXRpb246IGJ1aWx0LnByZXNlbnRhdGlvbixcblx0XHR0b29sU3BlY2lmaWNEYXRhOiBidWlsdC50b29sU3BlY2lmaWNEYXRhLFxuXHR9O1xufVxuXG4vKipcbiAqIFVwZGF0ZXMgYSBydW5uaW5nIHRvb2wgaW52b2NhdGlvbidzIGB0b29sU3BlY2lmaWNEYXRhYCBiYXNlZCBvbiB0aGVcbiAqIHByb3RvY29sIHRvb2wgY2FsbCBzdGF0ZS4gSGFuZGxlcyB0ZXJtaW5hbCBhbmQgc3ViYWdlbnQgY29udGVudCBkZXRlY3Rpb24uXG4gKlxuICogQ2FsbGVkIGZyb20gdGhlIHNlc3Npb24gaGFuZGxlciB3aGVuIGEgdG9vbCB0cmFuc2l0aW9ucyB0byBSdW5uaW5nIHN0YXRlXG4gKiB0byBzZXQgdGhlIGluaXRpYWwgYHRvb2xTcGVjaWZpY0RhdGFgLCBvciB3aGVuIGNvbnRlbnQgY2hhbmdlcyBhcnJpdmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVSdW5uaW5nVG9vbFNwZWNpZmljRGF0YShleGlzdGluZzogQ2hhdFRvb2xJbnZvY2F0aW9uLCB0YzogVG9vbENhbGxTdGF0ZSwgc2Vzc2lvblJlc291cmNlOiBVUkksIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyk6IHZvaWQge1xuXHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGV4aXN0aW5nLmludm9jYXRpb25NZXNzYWdlID0gc3RyaW5nT3JNYXJrZG93blRvU3RyaW5nKHRjLmludm9jYXRpb25NZXNzYWdlLCBjb25uZWN0aW9uQXV0aG9yaXR5KSA/PyBleGlzdGluZy5pbnZvY2F0aW9uTWVzc2FnZTtcblx0aWYgKGlzQWdlbnRIb3N0QXNrVXNlclRvb2wodGMudG9vbE5hbWUpKSB7XG5cdFx0ZXhpc3RpbmcuaW52b2NhdGlvbk1lc3NhZ2UgPSBsb2NhbGl6ZSgnYWdlbnRIb3N0LmFza1VzZXIud2FpdGluZycsIFwiV2FpdGluZyBmb3IgYW5zd2VyLi4uXCIpO1xuXHRcdGV4aXN0aW5nLnByZXNlbnRhdGlvbiA9IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbkFmdGVyQ29tcGxldGU7XG5cdH1cblx0aWYgKGlzQWRkQ29tbWVudFRvb2wodGMudG9vbE5hbWUpKSB7XG5cdFx0ZXhpc3RpbmcuaW52b2NhdGlvbk1lc3NhZ2UgPSBhZGRDb21tZW50UmVmZXJlbmNlKHRjKSA/PyBleGlzdGluZy5pbnZvY2F0aW9uTWVzc2FnZTtcblx0fVxuXG5cblx0Y29uc3Qgc3ViYWdlbnRDb250ZW50ID0gZ2V0VG9vbFN1YmFnZW50Q29udGVudCh0Yyk7XG5cdGlmIChzdWJhZ2VudENvbnRlbnQpIHtcblx0XHRleGlzdGluZy50b29sU3BlY2lmaWNEYXRhID0ge1xuXHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdGlzQWN0aXZlOiBleGlzdGluZy50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gZXhpc3RpbmcudG9vbFNwZWNpZmljRGF0YS5pc0FjdGl2ZSA6IHVuZGVmaW5lZCxcblx0XHRcdGRlc2NyaXB0aW9uOiBnZXRTdWJhZ2VudFRhc2tEZXNjcmlwdGlvbih0YyksXG5cdFx0XHRhZ2VudE5hbWU6IHN1YmFnZW50Q29udGVudC5hZ2VudE5hbWUsXG5cdFx0XHRjcmVkaXRzOiBleGlzdGluZy50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gZXhpc3RpbmcudG9vbFNwZWNpZmljRGF0YS5jcmVkaXRzIDogdW5kZWZpbmVkLFxuXHRcdFx0bW9kZWxOYW1lOiBleGlzdGluZy50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gZXhpc3RpbmcudG9vbFNwZWNpZmljRGF0YS5tb2RlbE5hbWUgOiB1bmRlZmluZWQsXG5cdFx0XHRzdGFydGVkQXQ6IGV4aXN0aW5nLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcgPyBleGlzdGluZy50b29sU3BlY2lmaWNEYXRhLnN0YXJ0ZWRBdCA6IHVuZGVmaW5lZCxcblx0XHRcdGR1cmF0aW9uOiBleGlzdGluZy50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gZXhpc3RpbmcudG9vbFNwZWNpZmljRGF0YS5kdXJhdGlvbiA6IHVuZGVmaW5lZCxcblx0XHRcdGNoYXRSZXNvdXJjZTogc3ViYWdlbnRDb250ZW50LnJlc291cmNlLFxuXHRcdH07XG5cdFx0Ly8gdG9vbFNwZWNpZmljRGF0YSBpcyBhIHBsYWluIHByb3BlcnR5IFx1MjAxNCBub3RpZnkgc3RhdGUgb2JzZXJ2ZXJzXG5cdFx0Ly8gc28gQ2hhdFN1YmFnZW50Q29udGVudFBhcnQgcmUtcmVhZHMgdGhlIHVwZGF0ZWQgbWV0YWRhdGEuXG5cdFx0ZXhpc3Rpbmcubm90aWZ5VG9vbFNwZWNpZmljRGF0YUNoYW5nZWQoKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBSZWZyZXNoIHN1YmFnZW50IG1ldGFkYXRhIGZyb20gYF9tZXRhYCAoc2V0IGJ5IHRoZSBldmVudCBtYXBwZXIgZnJvbVxuXHQvLyB0aGUgdG9vbCdzIGFyZ3VtZW50cykgaW4gY2FzZSBpdCBhcnJpdmVkIGFmdGVyIGludm9jYXRpb24gY3JlYXRpb24uXG5cdGlmIChleGlzdGluZy50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnKSB7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBnZXRTdWJhZ2VudFRhc2tEZXNjcmlwdGlvbih0YykgPz8gZXhpc3RpbmcudG9vbFNwZWNpZmljRGF0YS5kZXNjcmlwdGlvbjtcblx0XHRjb25zdCBhZ2VudE5hbWUgPSBnZXRTdWJhZ2VudEFnZW50TmFtZSh0YykgPz8gZXhpc3RpbmcudG9vbFNwZWNpZmljRGF0YS5hZ2VudE5hbWU7XG5cdFx0aWYgKGRlc2NyaXB0aW9uICE9PSBleGlzdGluZy50b29sU3BlY2lmaWNEYXRhLmRlc2NyaXB0aW9uIHx8IGFnZW50TmFtZSAhPT0gZXhpc3RpbmcudG9vbFNwZWNpZmljRGF0YS5hZ2VudE5hbWUpIHtcblx0XHRcdGV4aXN0aW5nLnRvb2xTcGVjaWZpY0RhdGEgPSB7IC4uLmV4aXN0aW5nLnRvb2xTcGVjaWZpY0RhdGEsIGRlc2NyaXB0aW9uLCBhZ2VudE5hbWUgfTtcblx0XHRcdGV4aXN0aW5nLm5vdGlmeVRvb2xTcGVjaWZpY0RhdGFDaGFuZ2VkKCk7XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIE1vdW50IHRoZSBNQ1AgQXBwIG9uY2UgdGhlIHRvb2wgc3RhcnRzIHJ1bm5pbmcuIFRoZSBjaGFubmVsIGlzIHByZXNlbnRcblx0Ly8gaW4gYF9tZXRhLnVpYCBmcm9tIHRoZSBmaXJzdCB0b29sIHN0YXRlIChhIHRvb2wgY2Fubm90IHN0YXJ0IHVudGlsIGl0c1xuXHQvLyBNQ1Agc2VydmVyIGlzIFJlYWR5KSwgYnV0IGNvbmZpcm1hdGlvbi1nYXRlZCB0b29scyBhcmUgY3JlYXRlZCB3aXRob3V0XG5cdC8vIGBtY3BBcHBEYXRhYCAoc2VlIGB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uYCksIHNvIHRoaXMgaXMgd2hlcmUgdGhlIEFwcFxuXHQvLyBmaXJzdCBhcHBlYXJzIGZvciB0aGVtLiBgYnVpbGRNY3BBcHBUb29sSW5wdXREYXRhYCByZXR1cm5zIGB1bmRlZmluZWRgXG5cdC8vIGZvciBub24tTUNQIHRvb2xzIChzZWFyY2gsIHRlcm1pbmFsLCBcdTIwMjYpLCBzbyB0aG9zZSBmYWxsIHRocm91Z2ggdG8gdGhlXG5cdC8vIGhhbmRsaW5nIGJlbG93LlxuXHRjb25zdCBleGlzdGluZ0lucHV0ID0gZXhpc3RpbmcudG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ2lucHV0JyA/IGV4aXN0aW5nLnRvb2xTcGVjaWZpY0RhdGEgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IG5leHRJbnB1dCA9IGJ1aWxkTWNwQXBwVG9vbElucHV0RGF0YSh0Yywgc2Vzc2lvblJlc291cmNlLCBleGlzdGluZ0lucHV0Py5yYXdJbnB1dCk7XG5cdGlmIChuZXh0SW5wdXQpIHtcblx0XHRpZiAoIWV4aXN0aW5nSW5wdXQgfHwgIWlzU2FtZU1jcEFwcERhdGEoZXhpc3RpbmdJbnB1dC5tY3BBcHBEYXRhLCBuZXh0SW5wdXQubWNwQXBwRGF0YSkpIHtcblx0XHRcdGV4aXN0aW5nLnRvb2xTcGVjaWZpY0RhdGEgPSBuZXh0SW5wdXQ7XG5cdFx0XHRleGlzdGluZy5ub3RpZnlUb29sU3BlY2lmaWNEYXRhQ2hhbmdlZCgpO1xuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBSZWZyZXNoIHRlcm1pbmFsIHRvb2xTcGVjaWZpY0RhdGEgYXMgc3RyZWFtaW5nIHRleHQgY29udGVudCBhcnJpdmVzXG5cdC8vIChvciB3aGVuIHRlcm1pbmFsIHRvb2xTcGVjaWZpY0RhdGEgd2FzIG5vdCBzZXQgdXAtZnJvbnQgYmVjYXVzZSB0aGVcblx0Ly8gdG9vbCB0cmFuc2l0aW9uZWQgdGhyb3VnaCB0aGUgU3RyZWFtaW5nIHN0YXRlIGJlZm9yZSByZWFjaGluZ1xuXHQvLyBSdW5uaW5nKS4gUHJlc2VydmVzIEFIUC10ZXJtaW5hbCBmaWVsZHMgKGB0ZXJtaW5hbFRvb2xTZXNzaW9uSWRgLFxuXHQvLyBgdGVybWluYWxDb21tYW5kVXJpYCwgYHRlcm1pbmFsQ29tbWFuZElkYCkgdGhhdCBgX3Jldml2ZVRlcm1pbmFsSWZOZWVkZWRgXG5cdC8vIGluIHRoZSBzZXNzaW9uIGhhbmRsZXIgcG9wdWxhdGVzIHdoZW4gYSBUZXJtaW5hbFxuXHQvLyBjb250ZW50IGJsb2NrIGlzIHByZXNlbnQuXG5cdGNvbnN0IGV4aXN0aW5nVGVybWluYWwgPSBleGlzdGluZy50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAndGVybWluYWwnXG5cdFx0PyBleGlzdGluZy50b29sU3BlY2lmaWNEYXRhXG5cdFx0OiB1bmRlZmluZWQ7XG5cdGlmIChpc1Rlcm1pbmFsVG9vbENhbGwodGMsIGV4aXN0aW5nLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQpKSB7XG5cdFx0Y29uc3QgbmV4dCA9IGJ1aWxkVGVybWluYWxUb29sU3BlY2lmaWNEYXRhKHRjLCBzZXNzaW9uUmVzb3VyY2UsIGV4aXN0aW5nVGVybWluYWwpO1xuXHRcdGNvbnN0IG91dHB1dENoYW5nZWQgPSBuZXh0LnRlcm1pbmFsQ29tbWFuZE91dHB1dD8udGV4dCAhPT0gZXhpc3RpbmdUZXJtaW5hbD8udGVybWluYWxDb21tYW5kT3V0cHV0Py50ZXh0O1xuXHRcdGNvbnN0IGNvbW1hbmRDaGFuZ2VkID0gbmV4dC5jb21tYW5kTGluZS5vcmlnaW5hbCAhPT0gZXhpc3RpbmdUZXJtaW5hbD8uY29tbWFuZExpbmUub3JpZ2luYWw7XG5cdFx0aWYgKCFleGlzdGluZ1Rlcm1pbmFsIHx8IG91dHB1dENoYW5nZWQgfHwgY29tbWFuZENoYW5nZWQpIHtcblx0XHRcdGV4aXN0aW5nLnRvb2xTcGVjaWZpY0RhdGEgPSBuZXh0O1xuXHRcdFx0ZXhpc3Rpbmcubm90aWZ5VG9vbFNwZWNpZmljRGF0YUNoYW5nZWQoKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBEYXRhIHJldHVybmVkIGJ5IHtAbGluayBmaW5hbGl6ZVRvb2xJbnZvY2F0aW9ufSBkZXNjcmliaW5nIGZpbGUgZWRpdHNcbiAqIHRoYXQgc2hvdWxkIGJlIHJvdXRlZCB0aHJvdWdoIHRoZSBlZGl0aW5nIHNlc3Npb24ncyBleHRlcm5hbCBlZGl0cyBwaXBlbGluZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVG9vbENhbGxGaWxlRWRpdCB7XG5cdC8qKiBUaGUga2luZCBvZiBmaWxlIG9wZXJhdGlvbi4gKi9cblx0cmVhZG9ubHkga2luZDogRmlsZUVkaXRLaW5kO1xuXHQvKiogVGhlIHByaW1hcnkgZmlsZSBVUkkgKGFmdGVyLVVSSSBmb3IgZWRpdHMvY3JlYXRlcy9yZW5hbWVzLCBiZWZvcmUtVVJJIGZvciBkZWxldGVzKS4gKi9cblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcblx0LyoqIEZvciByZW5hbWVzLCB0aGUgb3JpZ2luYWwgZmlsZSBVUkkgYmVmb3JlIHRoZSBtb3ZlLiAqL1xuXHRyZWFkb25seSBvcmlnaW5hbFJlc291cmNlPzogVVJJO1xuXHQvKiogVVJJIHRvIHJlYWQgdGhlIGJlZm9yZS1zbmFwc2hvdCBjb250ZW50IGZyb20uIEFic2VudCBmb3IgY3JlYXRlcy4gKi9cblx0cmVhZG9ubHkgYmVmb3JlQ29udGVudFVyaT86IFVSSTtcblx0LyoqIFVSSSB0byByZWFkIHRoZSBhZnRlci1jb250ZW50IGZyb20uIEFic2VudCBmb3IgZGVsZXRlcy4gKi9cblx0cmVhZG9ubHkgYWZ0ZXJDb250ZW50VXJpPzogVVJJO1xuXHQvKiogVW5kbyBzdG9wIElEIGZvciBncm91cGluZyBlZGl0cy4gKi9cblx0cmVhZG9ubHkgdW5kb1N0b3BJZDogc3RyaW5nO1xuXHQvKiogT3B0aW9uYWwgZGlmZiBkaXNwbGF5IG1ldGFkYXRhLiAqL1xuXHRyZWFkb25seSBkaWZmPzogeyBhZGRlZD86IG51bWJlcjsgcmVtb3ZlZD86IG51bWJlciB9O1xufVxuXG4vKipcbiAqIFVwZGF0ZXMgYSBsaXZlIHtAbGluayBDaGF0VG9vbEludm9jYXRpb259IHdpdGggY29tcGxldGlvbiBkYXRhIGZyb20gdGhlXG4gKiBwcm90b2NvbCdzIHRvb2wtY2FsbCBzdGF0ZSwgdHJhbnNpdGlvbmluZyBpdCB0byB0aGUgY29tcGxldGVkIHN0YXRlLlxuICpcbiAqIFJldHVybnMgZmlsZSBlZGl0cyB0aGF0IHRoZSBjYWxsZXIgc2hvdWxkIHJvdXRlIHRocm91Z2ggdGhlIGVkaXRpbmdcbiAqIHNlc3Npb24ncyBleHRlcm5hbCBlZGl0cyBwaXBlbGluZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbmFsaXplVG9vbEludm9jYXRpb24oaW52b2NhdGlvbjogQ2hhdFRvb2xJbnZvY2F0aW9uLCB0YzogVG9vbENhbGxTdGF0ZSwgYmFja2VuZFNlc3Npb246IFVSSSwgY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nKTogSVRvb2xDYWxsRmlsZUVkaXRbXSB7XG5cdGNvbnN0IGlzQ29tcGxldGVkID0gdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQ7XG5cdGNvbnN0IGlzQ2FuY2VsbGVkID0gdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5DYW5jZWxsZWQ7XG5cdGNvbnN0IGlzVGVybWluYWwgPSBpc1Rlcm1pbmFsVG9vbENhbGwodGMsIGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCk7XG5cblx0aWYgKChpc0NvbXBsZXRlZCB8fCBpc0NhbmNlbGxlZCkgJiYgaGFzS2V5KHRjLCB7IGludm9jYXRpb25NZXNzYWdlOiB0cnVlIH0pKSB7XG5cdFx0aW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSA9IHN0cmluZ09yTWFya2Rvd25Ub1N0cmluZyh0Yy5pbnZvY2F0aW9uTWVzc2FnZSwgY29ubmVjdGlvbkF1dGhvcml0eSkgPz8gaW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZTtcblx0fVxuXHQvLyBUb29scyB0aGF0IHJlbmRlciBhIGJlc3Bva2UsIGNsaWVudC1hdXRob3JlZCBtZXNzYWdlIG92ZXJyaWRlIHRoZVxuXHQvLyBpbnZvY2F0aW9uIHRleHQgaGVyZS4gQWRkIG5ldyBwZXItdG9vbCBjYXNlcyBhbG9uZ3NpZGUgdGhpcyBicmFuY2guXG5cdGlmIChpc0FkZENvbW1lbnRUb29sKHRjLnRvb2xOYW1lKSkge1xuXHRcdGludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UgPSBhZGRDb21tZW50UmVmZXJlbmNlKHRjKSA/PyBpbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlO1xuXHR9XG5cdGlmIChpc0FnZW50SG9zdEFza1VzZXJUb29sKHRjLnRvb2xOYW1lKSkge1xuXHRcdGludm9jYXRpb24ucHJlc2VudGF0aW9uID0gVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24uSGlkZGVuQWZ0ZXJDb21wbGV0ZTtcblx0fVxuXG5cdC8vIENoZWNrIGZvciBzdWJhZ2VudCBjb250ZW50IFx1MjAxNCBzZXQgdG9vbFNwZWNpZmljRGF0YSBzbyB0aGUgVUkgcmVuZGVycyBhIHN1YmFnZW50IHdpZGdldFxuXHRpZiAoaXNDb21wbGV0ZWQpIHtcblx0XHRjb25zdCBzdWJhZ2VudENvbnRlbnQgPSBnZXRUb29sU3ViYWdlbnRDb250ZW50KHRjKTtcblx0XHRpZiAoc3ViYWdlbnRDb250ZW50KSB7XG5cdFx0XHRjb25zdCByZXN1bHRUZXh0ID0gZ2V0VG9vbE91dHB1dFRleHQodGMpO1xuXHRcdFx0aW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhID0ge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRpc0FjdGl2ZTogaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmlzQWN0aXZlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZ2V0U3ViYWdlbnRUYXNrRGVzY3JpcHRpb24odGMpLFxuXHRcdFx0XHRhZ2VudE5hbWU6IHN1YmFnZW50Q29udGVudC5hZ2VudE5hbWUsXG5cdFx0XHRcdHJlc3VsdDogcmVzdWx0VGV4dCxcblx0XHRcdFx0Y3JlZGl0czogaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmNyZWRpdHMgOiB1bmRlZmluZWQsXG5cdFx0XHRcdG1vZGVsTmFtZTogaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLm1vZGVsTmFtZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3RhcnRlZEF0OiBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcgPyBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuc3RhcnRlZEF0IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRkdXJhdGlvbjogaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmR1cmF0aW9uIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjaGF0UmVzb3VyY2U6IGdldFN1YmFnZW50Q2hhdFJlc291cmNlKHRjLCBzdWJhZ2VudENvbnRlbnQsIGJhY2tlbmRTZXNzaW9uKSxcblx0XHRcdH07XG5cdFx0fSBlbHNlIGlmIChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcpIHtcblx0XHRcdC8vIFN1YmFnZW50LXNwYXduaW5nIHRvb2wgdGhhdCBjb21wbGV0ZWQgd2l0aG91dCBhIFN1YmFnZW50IGNvbnRlbnRcblx0XHRcdC8vIGJsb2NrLiBSZWZyZXNoIG1ldGFkYXRhICsgY2FycnkgdGhlIHRvb2wncyBvdXRwdXQgYXMgdGhlIHJlc3VsdC5cblx0XHRcdGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSA9IHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0aXNBY3RpdmU6IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5pc0FjdGl2ZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGdldFN1YmFnZW50VGFza0Rlc2NyaXB0aW9uKHRjKSA/PyBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuZGVzY3JpcHRpb24sXG5cdFx0XHRcdGFnZW50TmFtZTogZ2V0U3ViYWdlbnRBZ2VudE5hbWUodGMpID8/IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5hZ2VudE5hbWUsXG5cdFx0XHRcdHJlc3VsdDogZ2V0VG9vbE91dHB1dFRleHQodGMpLFxuXHRcdFx0XHRjcmVkaXRzOiBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuY3JlZGl0cyxcblx0XHRcdFx0bW9kZWxOYW1lOiBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEubW9kZWxOYW1lLFxuXHRcdFx0XHRzdGFydGVkQXQ6IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5zdGFydGVkQXQsXG5cdFx0XHRcdGR1cmF0aW9uOiBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuZHVyYXRpb24sXG5cdFx0XHRcdGNoYXRSZXNvdXJjZTogaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmNoYXRSZXNvdXJjZSA/PyBnZXRTdWJhZ2VudENoYXRSZXNvdXJjZSh0YywgdW5kZWZpbmVkLCBiYWNrZW5kU2Vzc2lvbiksXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdGlmIChpc1Rlcm1pbmFsICYmIChpc0NvbXBsZXRlZCB8fCBpc0NhbmNlbGxlZCkpIHtcblx0XHRjb25zdCBleGlzdGluZyA9IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3Rlcm1pbmFsJyA/IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSA6IHVuZGVmaW5lZDtcblx0XHRpbnZvY2F0aW9uLnByZXNlbnRhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSB7XG5cdFx0XHQuLi5idWlsZFRlcm1pbmFsVG9vbFNwZWNpZmljRGF0YSh0YywgYmFja2VuZFNlc3Npb24sIGV4aXN0aW5nKSxcblx0XHRcdHRlcm1pbmFsQ29tbWFuZFN0YXRlOiBnZXRUZXJtaW5hbENvbW1hbmRTdGF0ZSh0YywgaXNDb21wbGV0ZWQgJiYgdGMuc3VjY2VzcyksXG5cdFx0fTtcblx0fSBlbHNlIGlmIChpc0NvbXBsZXRlZCAmJiB0Yy5wYXN0VGVuc2VNZXNzYWdlKSB7XG5cdFx0aW52b2NhdGlvbi5wYXN0VGVuc2VNZXNzYWdlID0gc3RyaW5nT3JNYXJrZG93blRvU3RyaW5nKHRjLnBhc3RUZW5zZU1lc3NhZ2UsIGNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHR9XG5cdC8vIFRvb2xzIHRoYXQgcmVuZGVyIGEgYmVzcG9rZSwgY2xpZW50LWF1dGhvcmVkIG1lc3NhZ2Ugb3ZlcnJpZGUgdGhlXG5cdC8vIHBhc3QtdGVuc2UgdGV4dCBoZXJlLiBBZGQgbmV3IHBlci10b29sIGNhc2VzIGFsb25nc2lkZSB0aGlzIGJyYW5jaC5cblx0aWYgKGlzQ29tcGxldGVkICYmIGlzQWRkQ29tbWVudFRvb2wodGMudG9vbE5hbWUpKSB7XG5cdFx0aW52b2NhdGlvbi5wYXN0VGVuc2VNZXNzYWdlID0gYWRkQ29tbWVudFJlZmVyZW5jZSh0YykgPz8gaW52b2NhdGlvbi5wYXN0VGVuc2VNZXNzYWdlO1xuXHR9XG5cblx0aWYgKGlzQ29tcGxldGVkKSB7XG5cdFx0Y29uc3QgcmVzdWx0VG9vbFNwZWNpZmljRGF0YSA9IGJ1aWxkU2Vzc2lvbkNyZWF0ZWRUb29sRGF0YSh0YykgPz8gYnVpbGRBdXRvbWF0aW9uQ29uZmlndXJlZFRvb2xEYXRhKHRjKTtcblx0XHRpZiAocmVzdWx0VG9vbFNwZWNpZmljRGF0YSkge1xuXHRcdFx0Ly8gVGhlIHRvb2wgcmVxdWlyZWQgY29uZmlybWF0aW9uLCBzbyBpdCB3YXMgY3JlYXRlZCB3aXRoXG5cdFx0XHQvLyBgSGlkZGVuQWZ0ZXJDb21wbGV0ZWA7IGNsZWFyIGl0IHNvIHRoZSByZXN1bHQgcGlsbCBzdGF5cyB2aXNpYmxlLlxuXHRcdFx0aW52b2NhdGlvbi5wcmVzZW50YXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSByZXN1bHRUb29sU3BlY2lmaWNEYXRhO1xuXHRcdFx0aW52b2NhdGlvbi5ub3RpZnlUb29sU3BlY2lmaWNEYXRhQ2hhbmdlZCgpO1xuXHRcdH1cblx0fVxuXG5cdGlmIChpc0NvbXBsZXRlZCkge1xuXHRcdGNvbnN0IG1jcEFwcElucHV0ID0gYnVpbGRNY3BBcHBUb29sSW5wdXREYXRhKFxuXHRcdFx0dGMsXG5cdFx0XHRiYWNrZW5kU2Vzc2lvbixcblx0XHRcdGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ2lucHV0JyA/IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5yYXdJbnB1dCA6IHVuZGVmaW5lZCxcblx0XHQpO1xuXHRcdGlmIChtY3BBcHBJbnB1dCkge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdJbnB1dCA9IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ2lucHV0JyA/IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSA6IHVuZGVmaW5lZDtcblx0XHRcdGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSA9IG1jcEFwcElucHV0O1xuXHRcdFx0aWYgKCFleGlzdGluZ0lucHV0IHx8ICFpc1NhbWVNY3BBcHBEYXRhKGV4aXN0aW5nSW5wdXQubWNwQXBwRGF0YSwgbWNwQXBwSW5wdXQubWNwQXBwRGF0YSkpIHtcblx0XHRcdFx0aW52b2NhdGlvbi5ub3RpZnlUb29sU3BlY2lmaWNEYXRhQ2hhbmdlZCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNvbnN0IGlzRmFpbHVyZSA9IChpc0NvbXBsZXRlZCAmJiAhdGMuc3VjY2VzcykgfHwgaXNDYW5jZWxsZWQ7XG5cdGNvbnN0IGVycm9yTWVzc2FnZSA9IGlzQ29tcGxldGVkID8gdGMuZXJyb3I/Lm1lc3NhZ2UgOiAoaXNDYW5jZWxsZWQgPyB0Yy5yZWFzb25NZXNzYWdlIDogdW5kZWZpbmVkKTtcblx0Y29uc3QgZXJyb3JTdHJpbmcgPSB0eXBlb2YgZXJyb3JNZXNzYWdlID09PSAnc3RyaW5nJyA/IGVycm9yTWVzc2FnZSA6IGVycm9yTWVzc2FnZT8ubWFya2Rvd247XG5cdGNvbnN0IGZpbGVFZGl0cyA9IGlzQ29tcGxldGVkID8gZmlsZUVkaXRzVG9FeHRlcm5hbEVkaXRzKHRjKSA6IFtdO1xuXHRpZiAoaXNBZ2VudEhvc3RBc2tVc2VyVG9vbCh0Yy50b29sTmFtZSkpIHtcblx0XHRpbnZvY2F0aW9uLnByZXNlbnRhdGlvbiA9IHNob3VsZEhpZGVDb21wbGV0ZWRBZ2VudEhvc3RBc2tVc2VyVG9vbCh0Yylcblx0XHRcdD8gVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24uSGlkZGVuQWZ0ZXJDb21wbGV0ZVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyBIaWRlIHRoZSB0b29sIHdpZGdldCB3aGVuIGZpbGUgZWRpdHMgYXJlIHNob3duIHNlcGFyYXRlbHkgdmlhIG9uRmlsZUVkaXRzXG5cdGlmIChmaWxlRWRpdHMubGVuZ3RoID4gMCAmJiAhaXNGYWlsdXJlKSB7XG5cdFx0aW52b2NhdGlvbi5wcmVzZW50YXRpb24gPSBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbi5IaWRkZW47XG5cdH1cblxuXHRjb25zdCBoYXNNY3BBcHBEYXRhID0gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnaW5wdXQnICYmICEhaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLm1jcEFwcERhdGE7XG5cdC8vIFRoZSBnZW5lcmljIHJhdyBpbnB1dC9vdXRwdXQgZGV0YWlscyAodGhlIGV4cGFuZGFibGUgSlNPTiBibG9iKSBhcmVcblx0Ly8gc3VwcHJlc3NlZCBmb3IgdG9vbCBraW5kcyB0aGF0IHJlbmRlciB0aGVpciBvd24gYmVzcG9rZSBVSSBcdTIwMTQgdGhlIHN1YmFnZW50XG5cdC8vIGNhcmQgYW5kIHRoZSBgc2Vzc2lvbkNyZWF0ZWRgIFwiT3BlbiBTZXNzaW9uXCIgcGlsbCBcdTIwMTQgc28gd2UgZG9uJ3QgZHVwbGljYXRlXG5cdC8vIHRoZSByZXN1bHQgdW5kZXJuZWF0aCB0aGVtLiBTZWFyY2ggcmVzdWx0cyBhbmQgc2VwYXJhdGVseS1yZW5kZXJlZCBmaWxlXG5cdC8vIGVkaXRzIGFyZSBsaWtld2lzZSBleGNsdWRlZC5cblx0Y29uc3QgcmVzdWx0RGV0YWlscyA9ICFpc1Rlcm1pbmFsXG5cdFx0JiYgaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kICE9PSAnc3ViYWdlbnQnXG5cdFx0JiYgaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kICE9PSAnc2Vzc2lvbkNyZWF0ZWQnXG5cdFx0JiYgZ2V0VG9vbEtpbmQodGMpICE9PSAnc2VhcmNoJ1xuXHRcdCYmIGZpbGVFZGl0cy5sZW5ndGggPT09IDBcblx0XHQ/IGdldFRvb2xJbnB1dE91dHB1dERldGFpbHModGMsIGlzRmFpbHVyZSwgZXJyb3JTdHJpbmcsIGhhc01jcEFwcERhdGEsIGNvbm5lY3Rpb25BdXRob3JpdHkpXG5cdFx0OiB1bmRlZmluZWQ7XG5cdGNvbnN0IHJlc3VsdDogSVRvb2xSZXN1bHQgfCB1bmRlZmluZWQgPSBpc0ZhaWx1cmUgfHwgcmVzdWx0RGV0YWlsc1xuXHRcdD8geyBjb250ZW50OiBbXSwgdG9vbFJlc3VsdEVycm9yOiBpc0ZhaWx1cmUgPyBlcnJvclN0cmluZyA6IHVuZGVmaW5lZCwgdG9vbFJlc3VsdERldGFpbHM6IHJlc3VsdERldGFpbHMgfVxuXHRcdDogdW5kZWZpbmVkO1xuXHRjb25zdCBjYW5jZWxsZWRGcm9tU3RyZWFtaW5nID0gaXNDYW5jZWxsZWQgJiYgaW52b2NhdGlvbi5jYW5jZWxGcm9tU3RyZWFtaW5nKFxuXHRcdHRjLnJlYXNvbiA9PT0gVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24uU2tpcHBlZCA/IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkIDogVG9vbENvbmZpcm1LaW5kLkRlbmllZCxcblx0XHR0Yy5yZWFzb25NZXNzYWdlID8gc3RyaW5nT3JNYXJrZG93blRvU3RyaW5nKHRjLnJlYXNvbk1lc3NhZ2UsIGNvbm5lY3Rpb25BdXRob3JpdHkpIDogdW5kZWZpbmVkLFxuXHQpO1xuXHRpZiAoIWNhbmNlbGxlZEZyb21TdHJlYW1pbmcpIHtcblx0XHRpbnZvY2F0aW9uLmRpZEV4ZWN1dGVUb29sKHJlc3VsdCk7XG5cdH1cblxuXHRyZXR1cm4gZmlsZUVkaXRzO1xufVxuXG4vKipcbiAqIEV4dHJhY3RzIGZpbGUgZWRpdCBjb250ZW50IGVudHJpZXMgZnJvbSBhIGNvbXBsZXRlZCB0b29sIGNhbGwgYW5kXG4gKiBjb252ZXJ0cyB0aGVtIHRvIHtAbGluayBJVG9vbENhbGxGaWxlRWRpdH0gZGF0YSBmb3Igcm91dGluZyB0aHJvdWdoXG4gKiB0aGUgZWRpdGluZyBzZXNzaW9uJ3MgZXh0ZXJuYWwgZWRpdHMgcGlwZWxpbmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaWxlRWRpdHNUb0V4dGVybmFsRWRpdHModGM6IFRvb2xDYWxsU3RhdGUpOiBJVG9vbENhbGxGaWxlRWRpdFtdIHtcblx0aWYgKHRjLnN0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGNvbnN0IGVkaXRzID0gZ2V0VG9vbEZpbGVFZGl0cyh0Yyk7XG5cdGlmIChlZGl0cy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0cmV0dXJuIG1hcEZpbGVFZGl0cyhlZGl0cywgdGMudG9vbENhbGxJZCk7XG59XG5cbi8qKlxuICogVHJhbnNsYXRlcyBhIGxpc3Qgb2Yge0BsaW5rIEZpbGVFZGl0fSByZWNvcmRzIGludG8ge0BsaW5rIElUb29sQ2FsbEZpbGVFZGl0fVxuICogZW50cmllcyBzdWl0YWJsZSBmb3IgdGhlIGV4dGVybmFsIGVkaXRzIHBpcGVsaW5lIG9yIHRoZSBjaGF0IG1vZGlmaWVkLWZpbGVzXG4gKiBjb25maXJtYXRpb24gVUkuIFNoYXJlZCBiZXR3ZWVuIGNvbXBsZXRlZCB0b29sIGVkaXRzIGFuZCBwZW5kaW5nIHdyaXRlXG4gKiBjb25maXJtYXRpb25zLlxuICovXG5mdW5jdGlvbiBtYXBGaWxlRWRpdHMoaXRlbXM6IHJlYWRvbmx5IEZpbGVFZGl0W10sIHVuZG9TdG9wSWQ6IHN0cmluZyk6IElUb29sQ2FsbEZpbGVFZGl0W10ge1xuXHRjb25zdCByZXN1bHQ6IElUb29sQ2FsbEZpbGVFZGl0W10gPSBbXTtcblx0Zm9yIChjb25zdCBlZGl0IG9mIGl0ZW1zKSB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZUZpbGVFZGl0KGVkaXQpO1xuXHRcdGlmICghbm9ybWFsaXplZCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0a2luZDogbm9ybWFsaXplZC5raW5kLFxuXHRcdFx0cmVzb3VyY2U6IG5vcm1hbGl6ZWQucmVzb3VyY2UsXG5cdFx0XHRvcmlnaW5hbFJlc291cmNlOiBub3JtYWxpemVkLmtpbmQgPT09IEZpbGVFZGl0S2luZC5SZW5hbWUgPyBub3JtYWxpemVkLmJlZm9yZVVyaSA6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnRVcmk6IG5vcm1hbGl6ZWQuYmVmb3JlQ29udGVudFVyaSxcblx0XHRcdGFmdGVyQ29udGVudFVyaTogbm9ybWFsaXplZC5hZnRlckNvbnRlbnRVcmksXG5cdFx0XHR1bmRvU3RvcElkLFxuXHRcdFx0ZGlmZjogZWRpdC5kaWZmLFxuXHRcdH0pO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGVBQWU7QUFDeEIsU0FBUyx5QkFBMEMsc0JBQXNCO0FBQ3pFLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsY0FBd0Q7QUFDakUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsT0FBTyxhQUFhO0FBQzdCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHNCQUFzQixhQUFhLDRCQUE0Qix5QkFBeUIsOEJBQThCLGdCQUFnQixXQUFXLGtCQUFrQixrQkFBa0IsbUJBQW1CLHdCQUF3QixrQkFBa0IsbUJBQW1CLHNC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RUFDdEQ7QUFFQSxRQUFNLGdCQUFnQixXQUFXLGtCQUFrQixTQUFTLFdBQVcsQ0FBQyxDQUFDLFdBQVcsaUJBQWlCO0FBTXJHLFFBQU0sZ0JBQWdCLENBQUMsY0FDbkIsV0FBVyxrQkFBa0IsU0FBUyxjQUN0QyxXQUFXLGtCQUFrQixTQUFTLG9CQUN0QyxZQUFZLEVBQUUsTUFBTSxZQUNwQixVQUFVLFdBQVcsSUFDdEIsMEJBQTBCLElBQUksV0FBVyxhQUFhLGVBQWUsbUJBQW1CLElBQ3hGO0FBQ0gsUUFBTSxTQUFrQyxhQUFhLGdCQUNsRCxFQUFFLFNBQVMsQ0FBQyxHQUFHLGlCQUFpQixZQUFZLGNBQWMsUUFBVyxtQkFBbUIsY0FBYyxJQUN0RztBQUNILFFBQU0seUJBQXlCLGVBQWUsV0FBVztBQUFBLElBQ3hELEdBQUcsV0FBVywyQkFBMkIsVUFBVSxnQkFBZ0IsVUFBVSxnQkFBZ0I7QUFBQSxJQUM3RixHQUFHLGdCQUFnQix5QkFBeUIsR0FBRyxlQUFlLG1CQUFtQixJQUFJO0FBQUEsRUFDdEY7QUFDQSxNQUFJLENBQUMsd0JBQXdCO0FBQzVCLGVBQVcsZUFBZSxNQUFNO0FBQUEsRUFDakM7QUFFQSxTQUFPO0FBQ1I7QUFPTyxTQUFTLHlCQUF5QixJQUF3QztBQUNoRixNQUFJLEdBQUcsV0FBVyxlQUFlLFdBQVc7QUFDM0MsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUNBLFFBQU0sUUFBUSxpQkFBaUIsRUFBRTtBQUNqQyxNQUFJLE1BQU0sV0FBVyxHQUFHO0FBQ3ZCLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFDQSxTQUFPLGFBQWEsT0FBTyxHQUFHLFVBQVU7QUFDekM7QUFRQSxTQUFTLGFBQWEsT0FBNEIsWUFBeUM7QUFDMUYsUUFBTSxTQUE4QixDQUFDO0FBQ3JDLGFBQVcsUUFBUSxPQUFPO0FBQ3pCLFVBQU0sYUFBYSxrQkFBa0IsSUFBSTtBQUN6QyxRQUFJLENBQUMsWUFBWTtBQUNoQjtBQUFBLElBQ0Q7QUFFQSxXQUFPLEtBQUs7QUFBQSxNQUNYLE1BQU0sV0FBVztBQUFBLE1BQ2pCLFVBQVUsV0FBVztBQUFBLE1BQ3JCLGtCQUFrQixXQUFXLFNBQVMsYUFBYSxTQUFTLFdBQVcsWUFBWTtBQUFBLE1BQ25GLGtCQUFrQixXQUFXO0FBQUEsTUFDN0IsaUJBQWlCLFdBQVc7QUFBQSxNQUM1QjtBQUFBLE1BQ0EsTUFBTSxLQUFLO0FBQUEsSUFDWixDQUFDO0FBQUEsRUFDRjtBQUNBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsiZmVlZGJhY2siLCAicGFzdFRlbnNlTXNnIiwgImludm9jYXRpb24iXQp9Cg==
