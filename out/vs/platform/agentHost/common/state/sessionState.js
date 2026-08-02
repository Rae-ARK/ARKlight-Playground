import { decodeBase64, encodeBase64, VSBuffer } from "../../../../base/common/buffer.js";
import { hasKey } from "../../../../base/common/types.js";
import { URI as ResourceURI } from "../../../../base/common/uri.js";
import { readToolCallMeta } from "../meta/agentToolCallMeta.js";
import {
  ResponsePartKind,
  SessionStatus,
  ToolCallStatus,
  SessionLifecycle,
  ToolResultContentType,
  ChatOriginKind,
  ChatInteractivity
} from "./protocol/state.js";
import {
  ChangesetOperationScope,
  ChangesetOperationStatus,
  ChangesetStatus,
  CustomizationLoadStatus,
  CustomizationType,
  MessageAttachmentKind,
  MessageKind,
  PendingMessageKind,
  PolicyState,
  ResponsePartKind as ResponsePartKind2,
  ChatInputAnswerState,
  ChatInputAnswerValueKind,
  ChatInputQuestionKind,
  ChatInputResponseKind,
  ChatInteractivity as ChatInteractivity2,
  ChatOriginKind as ChatOriginKind2,
  SessionLifecycle as SessionLifecycle2,
  SessionStatus as SessionStatus2,
  ToolCallCancellationReason,
  ToolCallConfirmationReason,
  ToolCallContributorKind,
  ToolCallRiskAssessmentKind,
  ToolCallRiskAssessmentStatus,
  ToolCallStatus as ToolCallStatus2,
  ToolResultContentType as ToolResultContentType2,
  TurnState
} from "./protocol/state.js";
function readAccountQuotaSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const raw = value;
  const snapshot = {};
  if (typeof raw["isUnlimitedEntitlement"] === "boolean") {
    snapshot.isUnlimitedEntitlement = raw["isUnlimitedEntitlement"];
  }
  if (typeof raw["entitlementRequests"] === "number") {
    snapshot.entitlementRequests = raw["entitlementRequests"];
  }
  if (typeof raw["usedRequests"] === "number") {
    snapshot.usedRequests = raw["usedRequests"];
  }
  if (typeof raw["remainingPercentage"] === "number") {
    snapshot.remainingPercentage = raw["remainingPercentage"];
  }
  if (typeof raw["overage"] === "number") {
    snapshot.overage = raw["overage"];
  }
  if (typeof raw["overageAllowedWithExhaustedQuota"] === "boolean") {
    snapshot.overageAllowedWithExhaustedQuota = raw["overageAllowedWithExhaustedQuota"];
  }
  if (typeof raw["resetDate"] === "string") {
    snapshot.resetDate = raw["resetDate"];
  }
  return snapshot;
}
function readUsageInfoMeta(usage) {
  const meta = usage?._meta;
  if (!meta) {
    return {};
  }
  const result = {};
  if (typeof meta["cost"] === "number") {
    result.cost = meta["cost"];
  }
  const autoModeResolved = readAutoModeResolvedInfo(meta["autoModeResolved"]);
  if (autoModeResolved) {
    result.autoModeResolved = autoModeResolved;
  }
  const copilotUsage = meta["copilotUsage"];
  if (copilotUsage && typeof copilotUsage === "object" && !Array.isArray(copilotUsage)) {
    const rawUsage = copilotUsage;
    const usage2 = {};
    if (typeof rawUsage["totalNanoAiu"] === "number") {
      usage2.totalNanoAiu = rawUsage["totalNanoAiu"];
    }
    if (typeof rawUsage["sessionTotalNanoAiu"] === "number") {
      usage2.sessionTotalNanoAiu = rawUsage["sessionTotalNanoAiu"];
    }
    result.copilotUsage = usage2;
  }
  const quotaSnapshots = meta["quotaSnapshots"];
  if (quotaSnapshots && typeof quotaSnapshots === "object" && !Array.isArray(quotaSnapshots)) {
    const snapshots = {};
    for (const [quotaType, value] of Object.entries(quotaSnapshots)) {
      snapshots[quotaType] = readAccountQuotaSnapshot(value);
    }
    result.quotaSnapshots = snapshots;
  }
  const contextAttribution = readContextAttribution(meta["contextAttribution"]);
  if (contextAttribution) {
    result.contextAttribution = contextAttribution;
  }
  return result;
}
function hasReportedUsage(usage) {
  if (!usage) {
    return false;
  }
  if (typeof usage.inputTokens === "number" || typeof usage.outputTokens === "number") {
    return true;
  }
  const meta = readUsageInfoMeta(usage);
  return typeof meta.copilotUsage?.totalNanoAiu === "number" && meta.copilotUsage.totalNanoAiu >= 0 || typeof meta.copilotUsage?.sessionTotalNanoAiu === "number" && meta.copilotUsage.sessionTotalNanoAiu >= 0 || typeof meta.cost === "number" && meta.cost >= 0;
}
function readAutoModeResolvedInfo(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const raw = value;
  if (typeof raw["chosenModel"] !== "string") {
    return void 0;
  }
  const result = { chosenModel: raw["chosenModel"] };
  const reasoningBucket = raw["reasoningBucket"];
  if (reasoningBucket === "low" || reasoningBucket === "medium" || reasoningBucket === "high") {
    result.reasoningBucket = reasoningBucket;
  }
  const categoryScores = raw["categoryScores"];
  if (categoryScores && typeof categoryScores === "object" && !Array.isArray(categoryScores)) {
    const scores = {};
    for (const [category, score] of Object.entries(categoryScores)) {
      if (typeof score === "number") {
        scores[category] = score;
      }
    }
    result.categoryScores = scores;
  }
  if (typeof raw["predictedLabel"] === "string") {
    result.predictedLabel = raw["predictedLabel"];
  }
  if (typeof raw["confidence"] === "number") {
    result.confidence = raw["confidence"];
  }
  if (Array.isArray(raw["candidateModels"]) && raw["candidateModels"].every((candidate) => typeof candidate === "string")) {
    result.candidateModels = raw["candidateModels"];
  }
  return result;
}
function readContextAttribution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const raw = value;
  if (typeof raw["totalTokens"] !== "number" || !Array.isArray(raw["entries"])) {
    return void 0;
  }
  const entries = [];
  for (const item of raw["entries"]) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const entry = item;
    if (typeof entry["kind"] !== "string" || typeof entry["id"] !== "string" || typeof entry["label"] !== "string" || typeof entry["tokens"] !== "number") {
      continue;
    }
    entries.push({
      kind: entry["kind"],
      id: entry["id"],
      label: entry["label"],
      tokens: entry["tokens"],
      parentId: typeof entry["parentId"] === "string" ? entry["parentId"] : void 0,
      attributes: entry["attributes"] && typeof entry["attributes"] === "object" && !Array.isArray(entry["attributes"]) ? filterStringAttributes(entry["attributes"]) : void 0
    });
  }
  const compactionsRaw = raw["compactions"];
  const compactions = compactionsRaw && typeof compactionsRaw === "object" && !Array.isArray(compactionsRaw) && typeof compactionsRaw["count"] === "number" ? { count: compactionsRaw["count"] } : { count: 0 };
  return { totalTokens: raw["totalTokens"], entries, compactions };
}
function filterStringAttributes(raw) {
  const result = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" || value === void 0) {
      result[key] = value;
    }
  }
  return result;
}
import {
  ChangesetOperationTargetKind
} from "./protocol/commands.js";
import {
  ChatInputAnswerState as ChatInputAnswerState2,
  ChatInputAnswerValueKind as ChatInputAnswerValueKind2,
  ChatInputQuestionKind as ChatInputQuestionKind2,
  ChatInputResponseKind as ChatInputResponseKind2
} from "./protocol/state.js";
var FileEditKind = /* @__PURE__ */ ((FileEditKind2) => {
  FileEditKind2["Edit"] = "edit";
  FileEditKind2["Create"] = "create";
  FileEditKind2["Delete"] = "delete";
  FileEditKind2["Rename"] = "rename";
  return FileEditKind2;
})(FileEditKind || {});
const ROOT_STATE_URI = "ahp-root://";
const AHP_ROOT_SCHEME = "ahp-root";
const AHP_RESOURCE_WATCH_SCHEME = "ahp-resource-watch";
function buildResourceWatchChannelUri(descriptor) {
  const payload = { root: descriptor.root };
  if (descriptor.recursive) {
    payload.recursive = true;
  }
  if (descriptor.excludes && descriptor.excludes.items.length > 0) {
    payload.excludes = [...descriptor.excludes.items];
  }
  if (descriptor.includes && descriptor.includes.items.length > 0) {
    payload.includes = [...descriptor.includes.items];
  }
  const json = encodeBase64(VSBuffer.fromString(JSON.stringify(payload)), false, true);
  return `${AHP_RESOURCE_WATCH_SCHEME}://r/${json}`;
}
function parseResourceWatchChannelUri(uri) {
  let parsed;
  try {
    parsed = ResourceURI.parse(uri);
  } catch {
    return void 0;
  }
  if (parsed.scheme !== AHP_RESOURCE_WATCH_SCHEME) {
    return void 0;
  }
  const encoded = parsed.path.replace(/^\//, "");
  if (!encoded) {
    return void 0;
  }
  try {
    const payload = JSON.parse(decodeBase64(encoded).toString());
    if (typeof payload.root !== "string") {
      return void 0;
    }
    return {
      root: payload.root,
      recursive: payload.recursive === true,
      ...Array.isArray(payload.excludes) ? { excludes: { items: payload.excludes.filter((x) => typeof x === "string") } } : {},
      ...Array.isArray(payload.includes) ? { includes: { items: payload.includes.filter((x) => typeof x === "string") } } : {}
    };
  } catch {
    return void 0;
  }
}
function isAhpResourceWatchChannel(uri) {
  try {
    return ResourceURI.parse(uri).scheme === AHP_RESOURCE_WATCH_SCHEME;
  } catch {
    return false;
  }
}
function isAhpRootChannel(uri) {
  if (uri === ROOT_STATE_URI) {
    return true;
  }
  try {
    return ResourceURI.parse(uri).scheme === AHP_ROOT_SCHEME;
  } catch {
    return false;
  }
}
function customizationId(uri, range) {
  if (!range) {
    return uri;
  }
  const safeUri = uri.replace(/#/g, "%23");
  return `${safeUri}#range=${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}
function getToolOutputText(result) {
  if (!result.content || result.content.length === 0) {
    return void 0;
  }
  const textParts = [];
  for (const c of result.content) {
    if (hasKey(c, { type: true }) && c.type === ToolResultContentType.Text) {
      textParts.push(c);
    }
  }
  if (textParts.length === 0) {
    return void 0;
  }
  return textParts.map((p) => p.text).join("\n");
}
function getToolFileEdits(result) {
  if (!result.content || result.content.length === 0) {
    return [];
  }
  const edits = [];
  for (const c of result.content) {
    if (hasKey(c, { type: true }) && c.type === ToolResultContentType.FileEdit) {
      edits.push(c);
    }
  }
  return edits;
}
function getToolSubagentContent(result) {
  if (!result.content || result.content.length === 0) {
    return void 0;
  }
  for (const c of result.content) {
    if (hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent) {
      return c;
    }
  }
  return void 0;
}
const SUBAGENT_URI_SEGMENT = "subagent";
const SUBAGENT_URI_MARKER = `/${SUBAGENT_URI_SEGMENT}/`;
const SUBAGENT_URI_PATH_REGEX = /^(?<parentPath>.+)\/subagent\/(?<toolCallId>.+)$/;
function asResourceUri(uri) {
  return typeof uri === "string" ? ResourceURI.parse(uri) : uri;
}
function getSubagentBasePath(parentSession) {
  const parent = asResourceUri(parentSession);
  const parentPath = parent.path.endsWith("/") ? parent.path.slice(0, -1) : parent.path;
  return { parent, path: `${parentPath}${SUBAGENT_URI_MARKER}` };
}
function buildSubagentSessionUri(parentSession, toolCallId) {
  const { parent, path } = getSubagentBasePath(parentSession);
  return parent.with({ path: `${path}${toolCallId}` }).toString();
}
function parseSubagentSessionUri(uri) {
  const resource = asResourceUri(uri);
  const match = SUBAGENT_URI_PATH_REGEX.exec(resource.path);
  if (!match?.groups) {
    return void 0;
  }
  return {
    parentSession: resource.with({ path: match.groups.parentPath }),
    toolCallId: match.groups.toolCallId
  };
}
function isSubagentSession(uri) {
  return parseSubagentSessionUri(uri) !== void 0;
}
function buildSubagentSessionUriPrefix(parentSession) {
  const { parent, path } = getSubagentBasePath(parentSession);
  return parent.with({ path }).toString();
}
function createRootState() {
  return {
    agents: [],
    activeSessions: 0
  };
}
function createSessionState(summary) {
  const state = {
    provider: summary.provider,
    title: summary.title,
    status: summary.status,
    lifecycle: SessionLifecycle.Creating,
    activeClients: [],
    chats: [],
    defaultChat: void 0
  };
  if (summary.activity !== void 0) {
    state.activity = summary.activity;
  }
  if (summary.project !== void 0) {
    state.project = summary.project;
  }
  if (summary.workingDirectories !== void 0) {
    state.workingDirectories = summary.workingDirectories;
  }
  if (summary.annotations !== void 0) {
    state.annotations = summary.annotations;
  }
  if (summary._meta !== void 0) {
    state._meta = summary._meta;
  }
  return state;
}
function createChatState(summary) {
  return {
    resource: summary.resource,
    title: summary.title,
    status: summary.status,
    activity: summary.activity,
    modifiedAt: summary.modifiedAt,
    origin: summary.origin,
    interactivity: summary.interactivity,
    workingDirectories: summary.workingDirectories,
    turns: [],
    activeTurn: void 0
  };
}
function createDefaultChatSummary(session, chatUri) {
  const summary = {
    resource: chatUri,
    title: session.title,
    status: session.status,
    modifiedAt: session.modifiedAt,
    origin: { kind: ChatOriginKind.User }
  };
  if (session.activity !== void 0) {
    summary.activity = session.activity;
  }
  return summary;
}
const STATUS_ACTIVITY_MASK = (1 << 5) - 1;
function hasAutoApprovedPendingConfirmation(state) {
  return !!state.activeTurn?.responseParts.some(
    (part) => part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.PendingConfirmation && readToolCallMeta(part.toolCall).autoApproveBySetting === true
  );
}
function chatAwaitsUserInput(state) {
  return !!state.activeTurn?.responseParts.some((part) => {
    if (part.kind === ResponsePartKind.InputRequest) {
      return part.response === void 0;
    }
    if (part.kind !== ResponsePartKind.ToolCall) {
      return false;
    }
    const status = part.toolCall.status;
    if (status === ToolCallStatus.PendingResultConfirmation || status === ToolCallStatus.AuthRequired) {
      return true;
    }
    return status === ToolCallStatus.PendingConfirmation && readToolCallMeta(part.toolCall).autoApproveBySetting !== true;
  });
}
function chatSummaryStatus(state) {
  const status = state.status;
  if ((status & SessionStatus.InputNeeded) !== SessionStatus.InputNeeded) {
    return status;
  }
  if (hasAutoApprovedPendingConfirmation(state) && !chatAwaitsUserInput(state)) {
    return status & ~STATUS_ACTIVITY_MASK | SessionStatus.InProgress;
  }
  return status;
}
function chatSummaryFromState(state) {
  const summary = {
    resource: state.resource,
    title: state.title,
    status: chatSummaryStatus(state),
    modifiedAt: state.modifiedAt
  };
  if (state.activity !== void 0) {
    summary.activity = state.activity;
  }
  if (state.origin !== void 0) {
    summary.origin = state.origin;
  }
  if (state.interactivity !== void 0) {
    summary.interactivity = state.interactivity;
  }
  if (state.workingDirectories !== void 0) {
    summary.workingDirectories = state.workingDirectories;
  }
  return summary;
}
function effectiveChatInteractivity(interactivity, sessionArchived) {
  if (interactivity === ChatInteractivity.Hidden) {
    return ChatInteractivity.Hidden;
  }
  if (sessionArchived) {
    return ChatInteractivity.ReadOnly;
  }
  return interactivity ?? ChatInteractivity.Full;
}
function isChatReadOnly(interactivity, sessionArchived) {
  return effectiveChatInteractivity(interactivity, sessionArchived) === ChatInteractivity.ReadOnly;
}
function createActiveTurn(id, message, startedAt) {
  return {
    id,
    startedAt,
    message,
    responseParts: [],
    usage: void 0
  };
}
var StateComponents = /* @__PURE__ */ ((StateComponents2) => {
  StateComponents2[StateComponents2["Root"] = 0] = "Root";
  StateComponents2[StateComponents2["Session"] = 1] = "Session";
  StateComponents2[StateComponents2["Chat"] = 2] = "Chat";
  StateComponents2[StateComponents2["Terminal"] = 3] = "Terminal";
  StateComponents2[StateComponents2["Changeset"] = 4] = "Changeset";
  StateComponents2[StateComponents2["Annotations"] = 5] = "Annotations";
  return StateComponents2;
})(StateComponents || {});
const AHP_CHAT_SCHEME = "ahp-chat";
const DEFAULT_CHAT_ID = "default";
function buildChatUri(sessionUri, chatId) {
  const session = typeof sessionUri === "string" ? sessionUri : sessionUri.toString();
  const encoded = encodeBase64(VSBuffer.fromString(session), false, true);
  return `${AHP_CHAT_SCHEME}://${chatId}/${encoded}`;
}
function buildDefaultChatUri(sessionUri) {
  return buildChatUri(sessionUri, DEFAULT_CHAT_ID);
}
const SUBAGENT_CHAT_ID = "subagent";
function isSubagentChatUri(uri) {
  const parsed = typeof uri === "string" ? ResourceURI.parse(uri) : uri;
  return parsed.scheme === AHP_CHAT_SCHEME && parsed.authority === SUBAGENT_CHAT_ID;
}
function buildSubagentChatUri(sessionUri, toolCallId) {
  const session = typeof sessionUri === "string" ? sessionUri : sessionUri.toString();
  const encoded = encodeBase64(VSBuffer.fromString(session), false, true);
  return `${AHP_CHAT_SCHEME}://${SUBAGENT_CHAT_ID}/${encoded}/${encodeURIComponent(toolCallId)}`;
}
function parseChatUri(uri) {
  let parsed;
  try {
    parsed = typeof uri === "string" ? ResourceURI.parse(uri) : uri;
  } catch {
    return void 0;
  }
  if (parsed.scheme !== AHP_CHAT_SCHEME || !parsed.authority) {
    return void 0;
  }
  const encoded = parsed.path.replace(/^\//, "");
  if (!encoded) {
    return void 0;
  }
  try {
    if (parsed.authority === SUBAGENT_CHAT_ID) {
      const [sessionPart, ...toolCallIdParts] = encoded.split("/");
      const toolCallId = toolCallIdParts.join("/");
      if (!sessionPart || !toolCallId) {
        return void 0;
      }
      return { session: decodeBase64(sessionPart).toString(), chatId: `${SUBAGENT_CHAT_ID}/${decodeURIComponent(toolCallId)}` };
    }
    return { session: decodeBase64(encoded).toString(), chatId: parsed.authority };
  } catch {
    return void 0;
  }
}
function parseDefaultChatUri(uri) {
  return parseChatUri(uri)?.session;
}
function parseRequiredSessionUriFromChatUri(uri) {
  const session = parseDefaultChatUri(uri);
  if (session === void 0) {
    throw new Error(`Malformed AHP chat URI: ${typeof uri === "string" ? uri : uri.toString()}`);
  }
  return session;
}
function isDefaultChatUri(uri) {
  return parseChatUri(uri)?.chatId === DEFAULT_CHAT_ID;
}
function resolveChatUri(session, chat) {
  return isDefaultChatUri(chat) ? session : chat;
}
function chatStorageUri(chatChannel) {
  const parsed = parseChatUri(chatChannel);
  if (!parsed) {
    return void 0;
  }
  return resolveChatUri(ResourceURI.parse(parsed.session), ResourceURI.parse(chatChannel.toString()));
}
function isAhpChatChannel(uri) {
  try {
    return ResourceURI.parse(uri).scheme === AHP_CHAT_SCHEME;
  } catch {
    return false;
  }
}
function mergeSessionWithDefaultChat(session, chat) {
  return {
    ...session,
    workingDirectories: chat?.workingDirectories ?? session.workingDirectories,
    turns: chat?.turns ?? [],
    activeTurn: chat?.activeTurn,
    steeringMessage: chat?.steeringMessage,
    queuedMessages: chat?.queuedMessages,
    draft: chat?.draft
  };
}
function getActiveTurn(chat) {
  return chat?.activeTurn;
}
function getDefaultChat(session) {
  if (session.defaultChat !== void 0) {
    const match = session.chats.find((c) => c.resource === session.defaultChat);
    if (match) {
      return match;
    }
  }
  return session.chats[0];
}
const SESSION_META_GIT_KEY = "git";
const SESSION_META_GITHUB_KEY = "github";
const SESSION_META_PROMPT_CACHE_KEY = "vscode.promptCache";
function readSessionPromptCacheState(meta) {
  const value = meta?.[SESSION_META_PROMPT_CACHE_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const raw = value;
  return typeof raw["modelId"] === "string" && typeof raw["cacheExpiresAt"] === "string" ? { modelId: raw["modelId"], cacheExpiresAt: raw["cacheExpiresAt"] } : void 0;
}
function withSessionPromptCacheState(meta, promptCache) {
  const next = { ...meta };
  if (promptCache) {
    next[SESSION_META_PROMPT_CACHE_KEY] = promptCache;
  } else {
    delete next[SESSION_META_PROMPT_CACHE_KEY];
  }
  return Object.keys(next).length > 0 ? next : void 0;
}
function hasSessionPullRequestForBranch(gitHubState, branchName) {
  if (!gitHubState?.pullRequestUrl) {
    return false;
  }
  return gitHubState.pullRequestBranchName === void 0 || gitHubState.pullRequestBranchName === branchName;
}
function readSessionGitState(meta) {
  const value = meta?.[SESSION_META_GIT_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const raw = value;
  const result = {};
  if (typeof raw["hasGitHubRemote"] === "boolean") {
    result.hasGitHubRemote = raw["hasGitHubRemote"];
  }
  if (typeof raw["branchName"] === "string") {
    result.branchName = raw["branchName"];
  }
  if (typeof raw["baseBranchName"] === "string") {
    result.baseBranchName = raw["baseBranchName"];
  }
  if (typeof raw["upstreamBranchName"] === "string") {
    result.upstreamBranchName = raw["upstreamBranchName"];
  }
  if (typeof raw["incomingChanges"] === "number") {
    result.incomingChanges = raw["incomingChanges"];
  }
  if (typeof raw["outgoingChanges"] === "number") {
    result.outgoingChanges = raw["outgoingChanges"];
  }
  if (typeof raw["uncommittedChanges"] === "number") {
    result.uncommittedChanges = raw["uncommittedChanges"];
  }
  if (typeof raw["githubOwner"] === "string") {
    result.githubOwner = raw["githubOwner"];
  }
  if (typeof raw["githubHeadOwner"] === "string") {
    result.githubHeadOwner = raw["githubHeadOwner"];
  }
  if (typeof raw["githubRepo"] === "string") {
    result.githubRepo = raw["githubRepo"];
  }
  return result;
}
function withSessionGitState(meta, gitState) {
  const next = { ...meta };
  if (gitState !== void 0) {
    next[SESSION_META_GIT_KEY] = gitState;
  } else {
    delete next[SESSION_META_GIT_KEY];
  }
  return Object.keys(next).length > 0 ? next : void 0;
}
function readSessionGitHubState(meta) {
  const value = meta?.[SESSION_META_GITHUB_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const raw = value;
  const result = {};
  if (typeof raw["owner"] === "string") {
    result.owner = raw["owner"];
  }
  if (typeof raw["repo"] === "string") {
    result.repo = raw["repo"];
  }
  if (typeof raw["pullRequestUrl"] === "string") {
    result.pullRequestUrl = raw["pullRequestUrl"];
  }
  if (Array.isArray(raw["issueUrls"])) {
    result.issueUrls = raw["issueUrls"].filter((url) => typeof url === "string");
  }
  if (typeof raw["pullRequestBranchName"] === "string") {
    result.pullRequestBranchName = raw["pullRequestBranchName"];
  }
  return result;
}
function withSessionGitHubState(meta, gitHubState) {
  const next = { ...meta };
  if (gitHubState !== void 0) {
    next[SESSION_META_GITHUB_KEY] = gitHubState;
  } else {
    delete next[SESSION_META_GITHUB_KEY];
  }
  return Object.keys(next).length > 0 ? next : void 0;
}
const SESSION_META_SPAWN_DEPTH_KEY = "agentHost/sessionSpawnDepth";
function readSessionSpawnDepth(meta) {
  const value = meta?.[SESSION_META_SPAWN_DEPTH_KEY];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function withSessionSpawnDepth(meta, depth) {
  return { ...meta, [SESSION_META_SPAWN_DEPTH_KEY]: depth };
}
const SESSION_META_WORKSPACELESS_KEY = "workspaceless";
const AH_META_WORKSPACELESS_DB_KEY = "agentHost.workspaceless";
const AH_META_IS_ARCHIVED_DB_KEY = "isArchived";
const AH_META_IS_DONE_DB_KEY = "isDone";
const AH_META_IS_READ_DB_KEY = "isRead";
function withSessionStatusFlag(status, flag, set) {
  return set ? status | flag : status & ~flag;
}
function isSessionStatusRead(status) {
  return status !== void 0 && (status & SessionStatus.IsRead) !== 0;
}
function isSessionStatusArchived(status) {
  return status !== void 0 && (status & SessionStatus.IsArchived) !== 0;
}
function readSessionWorkspaceless(meta) {
  return meta?.[SESSION_META_WORKSPACELESS_KEY] === true;
}
function withSessionWorkspaceless(meta, workspaceless) {
  const next = { ...meta };
  if (workspaceless) {
    next[SESSION_META_WORKSPACELESS_KEY] = true;
  } else {
    delete next[SESSION_META_WORKSPACELESS_KEY];
  }
  return Object.keys(next).length > 0 ? next : void 0;
}
const ROOT_META_HOST_BUILD_KEY = "hostBuild";
function hostBuildInfoFromProduct(productService) {
  return {
    version: productService.version,
    commit: productService.commit,
    date: productService.date,
    quality: productService.quality
  };
}
function readHostBuildInfo(state) {
  const meta = state?._meta;
  const value = meta?.[ROOT_META_HOST_BUILD_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const raw = value;
  if (typeof raw["version"] !== "string") {
    return void 0;
  }
  const result = {
    version: raw["version"]
  };
  if (typeof raw["commit"] === "string") {
    result.commit = raw["commit"];
  }
  if (typeof raw["date"] === "string") {
    result.date = raw["date"];
  }
  if (typeof raw["quality"] === "string") {
    result.quality = raw["quality"];
  }
  return result;
}
function withHostBuildInfo(meta, buildInfo) {
  const next = { ...meta };
  if (buildInfo !== void 0) {
    next[ROOT_META_HOST_BUILD_KEY] = buildInfo;
  } else {
    delete next[ROOT_META_HOST_BUILD_KEY];
  }
  return Object.keys(next).length > 0 ? next : void 0;
}
function formatHostBuildInfo(info) {
  const details = [];
  if (info.commit) {
    details.push(`commit ${info.commit}`);
  }
  if (info.date) {
    details.push(info.date);
  }
  if (info.quality) {
    details.push(info.quality);
  }
  return details.length > 0 ? `${info.version} (${details.join(", ")})` : info.version;
}
export {
  AHP_CHAT_SCHEME,
  AHP_RESOURCE_WATCH_SCHEME,
  AHP_ROOT_SCHEME,
  AH_META_IS_ARCHIVED_DB_KEY,
  AH_META_IS_DONE_DB_KEY,
  AH_META_IS_READ_DB_KEY,
  AH_META_WORKSPACELESS_DB_KEY,
  ChangesetOperationScope,
  ChangesetOperationStatus,
  ChangesetOperationTargetKind,
  ChangesetStatus,
  ChatInputAnswerState2 as ChatInputAnswerState,
  ChatInputAnswerValueKind2 as ChatInputAnswerValueKind,
  ChatInputQuestionKind2 as ChatInputQuestionKind,
  ChatInputResponseKind2 as ChatInputResponseKind,
  ChatInteractivity2 as ChatInteractivity,
  ChatOriginKind2 as ChatOriginKind,
  CustomizationLoadStatus,
  CustomizationType,
  DEFAULT_CHAT_ID,
  FileEditKind,
  MessageAttachmentKind,
  MessageKind,
  PendingMessageKind,
  PolicyState,
  ROOT_META_HOST_BUILD_KEY,
  ROOT_STATE_URI,
  ResponsePartKind2 as ResponsePartKind,
  SESSION_META_GITHUB_KEY,
  SESSION_META_GIT_KEY,
  SESSION_META_PROMPT_CACHE_KEY,
  SESSION_META_SPAWN_DEPTH_KEY,
  SESSION_META_WORKSPACELESS_KEY,
  ChatInputAnswerState as SessionInputAnswerState,
  ChatInputAnswerValueKind as SessionInputAnswerValueKind,
  ChatInputQuestionKind as SessionInputQuestionKind,
  ChatInputResponseKind as SessionInputResponseKind,
  SessionLifecycle2 as SessionLifecycle,
  SessionStatus2 as SessionStatus,
  StateComponents,
  ToolCallCancellationReason,
  ToolCallConfirmationReason,
  ToolCallContributorKind,
  ToolCallRiskAssessmentKind,
  ToolCallRiskAssessmentStatus,
  ToolCallStatus2 as ToolCallStatus,
  ToolResultContentType2 as ToolResultContentType,
  TurnState,
  buildChatUri,
  buildDefaultChatUri,
  buildResourceWatchChannelUri,
  buildSubagentChatUri,
  buildSubagentSessionUri,
  buildSubagentSessionUriPrefix,
  chatStorageUri,
  chatSummaryFromState,
  createActiveTurn,
  createChatState,
  createDefaultChatSummary,
  createRootState,
  createSessionState,
  customizationId,
  effectiveChatInteractivity,
  formatHostBuildInfo,
  getActiveTurn,
  getDefaultChat,
  getToolFileEdits,
  getToolOutputText,
  getToolSubagentContent,
  hasReportedUsage,
  hasSessionPullRequestForBranch,
  hostBuildInfoFromProduct,
  isAhpChatChannel,
  isAhpResourceWatchChannel,
  isAhpRootChannel,
  isChatReadOnly,
  isDefaultChatUri,
  isSessionStatusArchived,
  isSessionStatusRead,
  isSubagentChatUri,
  isSubagentSession,
  mergeSessionWithDefaultChat,
  parseChatUri,
  parseDefaultChatUri,
  parseRequiredSessionUriFromChatUri,
  parseResourceWatchChannelUri,
  parseSubagentSessionUri,
  readHostBuildInfo,
  readSessionGitHubState,
  readSessionGitState,
  readSessionPromptCacheState,
  readSessionSpawnDepth,
  readSessionWorkspaceless,
  readUsageInfoMeta,
  resolveChatUri,
  withHostBuildInfo,
  withSessionGitHubState,
  withSessionGitState,
  withSessionPromptCacheState,
  withSessionSpawnDepth,
  withSessionStatusFlag,
  withSessionWorkspaceless
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLy8gSW1tdXRhYmxlIHN0YXRlIHR5cGVzIGZvciB0aGUgc2Vzc2lvbnMgcHJvY2VzcyBwcm90b2NvbC5cbi8vIFNlZSBwcm90b2NvbC5tZCBmb3IgdGhlIGZ1bGwgZGVzaWduIHJhdGlvbmFsZS5cbi8vXG4vLyBNb3N0IHR5cGVzIGFyZSBpbXBvcnRlZCBmcm9tIHRoZSBhdXRvLWdlbmVyYXRlZCBwcm90b2NvbCBsYXllclxuLy8gKHN5bmNlZCBmcm9tIHRoZSBhZ2VudC1ob3N0LXByb3RvY29sIHJlcG8pLiBUaGlzIGZpbGUgYWRkcyBWUyBDb2RlLXNwZWNpZmljXG4vLyBoZWxwZXJzIGFuZCByZS1leHBvcnRzLlxuXG5pbXBvcnQgeyBkZWNvZGVCYXNlNjQsIGVuY29kZUJhc2U2NCwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgaGFzS2V5LCB0eXBlIE11dGFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgYXMgUmVzb3VyY2VVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHR5cGUgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyByZWFkVG9vbENhbGxNZXRhIH0gZnJvbSAnLi4vbWV0YS9hZ2VudFRvb2xDYWxsTWV0YS5qcyc7XG5pbXBvcnQge1xuXHRSZXNwb25zZVBhcnRLaW5kLFxuXHRTZXNzaW9uU3RhdHVzLFxuXHRUb29sQ2FsbFN0YXR1cyxcblx0U2Vzc2lvbkxpZmVjeWNsZSxcblx0VGVybWluYWxTdGF0ZSxcblx0VG9vbFJlc3VsdENvbnRlbnRUeXBlLFxuXHRUb29sUmVzdWx0RmlsZUVkaXRDb250ZW50LFxuXHRDaGF0T3JpZ2luS2luZCxcblx0Q2hhdEludGVyYWN0aXZpdHksXG5cdHR5cGUgQWN0aXZlVHVybixcblx0dHlwZSBDaGFuZ2VzZXRTdGF0ZSxcblx0dHlwZSBDaGF0U3RhdGUsXG5cdHR5cGUgQ2hhdFN1bW1hcnksXG5cdHR5cGUgUGVuZGluZ01lc3NhZ2UsXG5cdHR5cGUgVHVybixcblx0dHlwZSBBbm5vdGF0aW9uc1N0YXRlLFxuXHR0eXBlIFVSSSBhcyBQcm90b2NvbFVSSSxcblx0dHlwZSBSb290U3RhdGUsXG5cdHR5cGUgU2Vzc2lvblN0YXRlLFxuXHR0eXBlIFNlc3Npb25TdW1tYXJ5LFxuXHR0eXBlIFRleHRSYW5nZSxcblx0dHlwZSBUb29sQ2FsbENhbmNlbGxlZFN0YXRlLFxuXHR0eXBlIFRvb2xDYWxsQ29tcGxldGVkU3RhdGUsXG5cdHR5cGUgVG9vbENhbGxSZXN1bHQsXG5cdHR5cGUgVG9vbENhbGxTdGF0ZSxcblx0dHlwZSBUb29sUmVzdWx0Q29udGVudCxcblx0dHlwZSBUb29sUmVzdWx0U3ViYWdlbnRDb250ZW50LFxuXHR0eXBlIFRvb2xSZXN1bHRUZXh0Q29udGVudCxcblx0dHlwZSBVc2FnZUluZm8sXG5cdHR5cGUgTWVzc2FnZSxcbn0gZnJvbSAnLi9wcm90b2NvbC9zdGF0ZS5qcyc7XG5cbi8vIFJlLWV4cG9ydCBldmVyeXRoaW5nIGZyb20gdGhlIHByb3RvY29sIHN0YXRlIG1vZHVsZVxuZXhwb3J0IHtcblx0Q2hhbmdlc2V0T3BlcmF0aW9uU2NvcGUsIENoYW5nZXNldE9wZXJhdGlvblN0YXR1cywgQ2hhbmdlc2V0U3RhdHVzLCBDdXN0b21pemF0aW9uTG9hZFN0YXR1cyxcblx0Q3VzdG9taXphdGlvblR5cGUsIE1lc3NhZ2VBdHRhY2htZW50S2luZCwgTWVzc2FnZUtpbmQsXG5cdFBlbmRpbmdNZXNzYWdlS2luZCxcblx0UG9saWN5U3RhdGUsXG5cdFJlc3BvbnNlUGFydEtpbmQsXG5cdENoYXRJbnB1dEFuc3dlclN0YXRlIGFzIFNlc3Npb25JbnB1dEFuc3dlclN0YXRlLFxuXHRDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQgYXMgU2Vzc2lvbklucHV0QW5zd2VyVmFsdWVLaW5kLFxuXHRDaGF0SW5wdXRRdWVzdGlvbktpbmQgYXMgU2Vzc2lvbklucHV0UXVlc3Rpb25LaW5kLFxuXHRDaGF0SW5wdXRSZXNwb25zZUtpbmQgYXMgU2Vzc2lvbklucHV0UmVzcG9uc2VLaW5kLFxuXHRDaGF0SW50ZXJhY3Rpdml0eSxcblx0Q2hhdE9yaWdpbktpbmQsXG5cdFNlc3Npb25MaWZlY3ljbGUsXG5cdFNlc3Npb25TdGF0dXMsIFRvb2xDYWxsQ2FuY2VsbGF0aW9uUmVhc29uLCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRLaW5kLCBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50U3RhdHVzLCBUb29sQ2FsbFN0YXR1cyxcblx0VG9vbFJlc3VsdENvbnRlbnRUeXBlLFxuXHRUdXJuU3RhdGUsIHR5cGUgQWN0aXZlVHVybiwgdHlwZSBBZ2VudEN1c3RvbWl6YXRpb24sIHR5cGUgQWdlbnRDYXBhYmlsaXRpZXMsIHR5cGUgQWdlbnRJbmZvLCB0eXBlIEFnZW50U2VsZWN0aW9uLCB0eXBlIEFubm90YXRpb24sIHR5cGUgQW5ub3RhdGlvbkVudHJ5LCB0eXBlIEFubm90YXRpb25zU3RhdGUsIHR5cGUgQW5ub3RhdGlvbnNTdW1tYXJ5LCB0eXBlIENoYW5nZXNldCwgdHlwZSBDaGFuZ2VzZXRGaWxlLFxuXHR0eXBlIENoYW5nZXNldE9wZXJhdGlvbiwgdHlwZSBDaGFuZ2VzZXRTdGF0ZSwgdHlwZSBDaGF0U3RhdGUsIHR5cGUgQ2hhdFN1bW1hcnksIHR5cGUgQ2hhdE9yaWdpbiwgdHlwZSBDaGlsZEN1c3RvbWl6YXRpb24sIHR5cGUgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbiwgdHlwZSBDb25maWdQcm9wZXJ0eVNjaGVtYSxcblx0dHlwZSBDb25maWdTY2hlbWEsXG5cdHR5cGUgQ29udGVudFJlZiwgdHlwZSBDdXN0b21pemF0aW9uLCB0eXBlIEN1c3RvbWl6YXRpb25EZWdyYWRlZFN0YXRlLFxuXHR0eXBlIEN1c3RvbWl6YXRpb25FcnJvclN0YXRlLCB0eXBlIEN1c3RvbWl6YXRpb25Mb2FkZWRTdGF0ZSwgdHlwZSBDdXN0b21pemF0aW9uTG9hZGluZ1N0YXRlLCB0eXBlIEN1c3RvbWl6YXRpb25Mb2FkU3RhdGUsIHR5cGUgRGlyZWN0b3J5Q3VzdG9taXphdGlvbiwgdHlwZSBFcnJvckluZm8sIHR5cGUgSG9va0N1c3RvbWl6YXRpb24sIHR5cGUgRmlsZUVkaXQgYXMgSVNlc3Npb25GaWxlRGlmZiwgdHlwZSBUb29sUmVzdWx0RW1iZWRkZWRSZXNvdXJjZUNvbnRlbnQgYXMgSVRvb2xSZXN1bHRCaW5hcnlDb250ZW50LCB0eXBlIE1hcmtkb3duUmVzcG9uc2VQYXJ0LCB0eXBlIE1jcFNlcnZlckN1c3RvbWl6YXRpb24sIHR5cGUgTWVzc2FnZUF0dGFjaG1lbnQsXG5cdHR5cGUgTWVzc2FnZVJlc291cmNlQXR0YWNobWVudCwgdHlwZSBNZXNzYWdlRW1iZWRkZWRSZXNvdXJjZUF0dGFjaG1lbnQsIHR5cGUgTWVzc2FnZUFubm90YXRpb25zQXR0YWNobWVudCwgdHlwZSBNZXNzYWdlQ2hhdEF0dGFjaG1lbnQsIHR5cGUgTW9kZWxTZWxlY3Rpb24sIHR5cGUgUGVuZGluZ01lc3NhZ2UsIHR5cGUgUGx1Z2luQ3VzdG9taXphdGlvbiwgdHlwZSBQcm9qZWN0SW5mbywgdHlwZSBQcm9tcHRDdXN0b21pemF0aW9uLCB0eXBlIFJlYXNvbmluZ1Jlc3BvbnNlUGFydCxcblx0dHlwZSBSZXNwb25zZVBhcnQsXG5cdHR5cGUgUm9vdFN0YXRlLCB0eXBlIFJ1bGVDdXN0b21pemF0aW9uLCB0eXBlIFNlc3Npb25BY3RpdmVDbGllbnQsXG5cdHR5cGUgU2Vzc2lvbkNvbmZpZ1N0YXRlLCB0eXBlIENoYXRJbnB1dEFuc3dlciBhcyBTZXNzaW9uSW5wdXRBbnN3ZXIsXG5cdHR5cGUgQ2hhdElucHV0T3B0aW9uIGFzIFNlc3Npb25JbnB1dE9wdGlvbiwgdHlwZSBDaGF0SW5wdXRRdWVzdGlvbiBhcyBTZXNzaW9uSW5wdXRRdWVzdGlvbiwgdHlwZSBDaGF0SW5wdXRSZXF1ZXN0IGFzIFNlc3Npb25JbnB1dFJlcXVlc3QsIHR5cGUgU2Vzc2lvbk1vZGVsSW5mbyxcblx0dHlwZSBTZXNzaW9uU3RhdGUsXG5cdHR5cGUgU2Vzc2lvblN1bW1hcnksIHR5cGUgU2tpbGxDdXN0b21pemF0aW9uLCB0eXBlIFNuYXBzaG90LCB0eXBlIFN0cmluZ09yTWFya2Rvd24sIHR5cGUgVGVybWluYWxTdGF0ZSwgdHlwZSBUZXh0UmFuZ2UsXG5cdHR5cGUgVG9vbEFubm90YXRpb25zLFxuXHR0eXBlIFRvb2xDYWxsQ2FuY2VsbGVkU3RhdGUsXG5cdHR5cGUgVG9vbENhbGxDb21wbGV0ZWRTdGF0ZSxcblx0dHlwZSBUb29sQ2FsbFBlbmRpbmdDb25maXJtYXRpb25TdGF0ZSxcblx0dHlwZSBUb29sQ2FsbFBlbmRpbmdSZXN1bHRDb25maXJtYXRpb25TdGF0ZSxcblx0dHlwZSBUb29sQ2FsbFJlc3BvbnNlUGFydCxcblx0dHlwZSBUb29sQ2FsbFJlc3VsdCxcblx0dHlwZSBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50LFxuXHR0eXBlIFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRDb21wbGV0ZVN0YXRlLFxuXHR0eXBlIFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRMb2FkaW5nU3RhdGUsXG5cdHR5cGUgVG9vbENhbGxSdW5uaW5nU3RhdGUsXG5cdHR5cGUgVG9vbENhbGxTdGF0ZSxcblx0dHlwZSBUb29sQ2FsbFN0cmVhbWluZ1N0YXRlLFxuXHR0eXBlIFRvb2xDYWxsQ29udHJpYnV0b3IsXG5cdHR5cGUgVG9vbERlZmluaXRpb24sIHR5cGUgVG9vbFJlc3VsdENvbnRlbnQsXG5cdHR5cGUgVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudCxcblx0dHlwZSBUZXJtaW5hbENvbW1hbmRSZXN1bHQsXG5cdHR5cGUgVG9vbFJlc3VsdFN1YmFnZW50Q29udGVudCxcblx0dHlwZSBUb29sUmVzdWx0VGVybWluYWxDb250ZW50LFxuXHR0eXBlIFRvb2xSZXN1bHRUZXh0Q29udGVudCxcblx0dHlwZSBUdXJuLCB0eXBlIFVSSSwgdHlwZSBVc2FnZUluZm8sXG5cdHR5cGUgTWVzc2FnZVxufSBmcm9tICcuL3Byb3RvY29sL3N0YXRlLmpzJztcblxuLyoqXG4gKiBXZWxsLWtub3duIGtleXMgdGhhdCBtYXkgYXBwZWFyIG9uIHtAbGluayBVc2FnZUluZm8uX21ldGF9LlxuICogQ2xpZW50cyBNQVkgcmVhZCB0aGVzZSB0byBwcm92aWRlIGVuaGFuY2VkIFVJIChlLmcuIGNyZWRpdCBjb3N0IGRpc3BsYXkpLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFVzYWdlSW5mb01ldGEge1xuXHQvKiogUGVyLXR1cm4gY3JlZGl0IGNvc3QgcmVwb3J0ZWQgYnkgdGhlIGJhY2tlbmQuICovXG5cdGNvc3Q/OiBudW1iZXI7XG5cdC8qKiBUaGUgY29uY3JldGUgbW9kZWwgc2VsZWN0ZWQgYnkgQ29waWxvdCBBdXRvIGFuZCB0aGUgcm91dGluZyBleHBsYW5hdGlvbi4gKi9cblx0YXV0b01vZGVSZXNvbHZlZD86IElBdXRvTW9kZVJlc29sdmVkSW5mbztcblx0LyoqIENvcGlsb3Qtc3BlY2lmaWMgdXNhZ2UgYnJlYWtkb3duLCBpbmNsdWRpbmcgbmFuby1BSVUgdG90YWxzLiAqL1xuXHRjb3BpbG90VXNhZ2U/OiB7XG5cdFx0LyoqIFRoaXMgdHVybidzIG5hbm8tQUlVIGNvc3QuICovXG5cdFx0dG90YWxOYW5vQWl1PzogbnVtYmVyO1xuXHRcdC8qKlxuXHRcdCAqIFRoZSB3aG9sZSBzZXNzaW9uJ3MgYWNjdW11bGF0ZWQgbmFuby1BSVUgY29zdCwgYXMgcmVwb3J0ZWQgYnkgdGhlXG5cdFx0ICogYmFja2VuZCByYXRoZXIgdGhhbiBzdW1tZWQgZnJvbSB0aGUgdHVybnMuIENsaWVudHMgU0hPVUxEIHByZWZlciB0aGlzXG5cdFx0ICogb3ZlciBhZGRpbmcgdXAgcGVyLXR1cm4gdG90YWxzOiBpdCBpcyBhdXRob3JpdGF0aXZlLCBhbmQgaXQgYWxzb1xuXHRcdCAqIGNvdmVycyB3b3JrIGJpbGxlZCBvdXRzaWRlIGFueSB0dXJuIChlLmcuIGFuIG91dC1vZi10dXJuIGNvbXBhY3Rpb24pLlxuXHRcdCAqL1xuXHRcdHNlc3Npb25Ub3RhbE5hbm9BaXU/OiBudW1iZXI7XG5cdFx0W2tleTogc3RyaW5nXTogdW5rbm93bjtcblx0fTtcblx0LyoqXG5cdCAqIFBlci1jYXRlZ29yeSBhY2NvdW50IHF1b3RhIHNuYXBzaG90cyByZXBvcnRlZCBieSB0aGUgYmFja2VuZCBvbiB0aGVcblx0ICogbW9kZWwtY2FsbCB1c2FnZSBldmVudCwga2V5ZWQgYnkgcXVvdGEgdHlwZSAoZS5nLiBgY2hhdGAsXG5cdCAqIGBwcmVtaXVtX2ludGVyYWN0aW9uc2ApLiBDbGllbnRzIE1BWSB1c2UgdGhlc2UgdG8ga2VlcCB0aGUgYWNjb3VudCBxdW90YVxuXHQgKiBVSSBjdXJyZW50IHdpdGhvdXQgYSBzZXBhcmF0ZSBxdW90YSBmZXRjaC5cblx0ICovXG5cdHF1b3RhU25hcHNob3RzPzoge1xuXHRcdFtxdW90YVR5cGU6IHN0cmluZ106IHtcblx0XHRcdHJlYWRvbmx5IGlzVW5saW1pdGVkRW50aXRsZW1lbnQ/OiBib29sZWFuO1xuXHRcdFx0cmVhZG9ubHkgZW50aXRsZW1lbnRSZXF1ZXN0cz86IG51bWJlcjtcblx0XHRcdHJlYWRvbmx5IHVzZWRSZXF1ZXN0cz86IG51bWJlcjtcblx0XHRcdHJlYWRvbmx5IHJlbWFpbmluZ1BlcmNlbnRhZ2U/OiBudW1iZXI7XG5cdFx0XHRyZWFkb25seSBvdmVyYWdlPzogbnVtYmVyO1xuXHRcdFx0cmVhZG9ubHkgb3ZlcmFnZUFsbG93ZWRXaXRoRXhoYXVzdGVkUXVvdGE/OiBib29sZWFuO1xuXHRcdFx0LyoqIElTTyA4NjAxIGRhdGUgd2hlbiB0aGUgcXVvdGEgcmVzZXRzLCBpZiBhcHBsaWNhYmxlLiAqL1xuXHRcdFx0cmVhZG9ubHkgcmVzZXREYXRlPzogc3RyaW5nO1xuXHRcdH0gfCB1bmRlZmluZWQ7XG5cdH07XG5cdC8qKlxuXHQgKiBQZXItc291cmNlIGNvbnRleHQtd2luZG93IGF0dHJpYnV0aW9uIGJyZWFrZG93biByZXBvcnRlZCBieSB0aGUgU0RLJ3Ncblx0ICogYHNlc3Npb24ucnBjLm1ldGFkYXRhLmdldENvbnRleHRBdHRyaWJ1dGlvbigpYC4gUG9wdWxhdGVkIGFzeW5jaHJvbm91c2x5XG5cdCAqIGFmdGVyIGVhY2ggdXNhZ2UgZXZlbnQgYW5kIHBpcGVkIHRvIHRoZSBjb250ZXh0LXVzYWdlIHdpZGdldCBhc1xuXHQgKiBgcHJvbXB0VG9rZW5EZXRhaWxzYC5cblx0ICovXG5cdGNvbnRleHRBdHRyaWJ1dGlvbj86IElDb250ZXh0QXR0cmlidXRpb25EYXRhO1xuXHRba2V5OiBzdHJpbmddOiB1bmtub3duO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBdXRvTW9kZVJlc29sdmVkSW5mbyB7XG5cdHJlYWRvbmx5IGNob3Nlbk1vZGVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlYXNvbmluZ0J1Y2tldD86ICdsb3cnIHwgJ21lZGl1bScgfCAnaGlnaCc7XG5cdHJlYWRvbmx5IGNhdGVnb3J5U2NvcmVzPzogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgbnVtYmVyIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IHByZWRpY3RlZExhYmVsPzogc3RyaW5nO1xuXHRyZWFkb25seSBjb25maWRlbmNlPzogbnVtYmVyO1xuXHRyZWFkb25seSBjYW5kaWRhdGVNb2RlbHM/OiByZWFkb25seSBzdHJpbmdbXTtcbn1cblxuLyoqXG4gKiBNaXJyb3JzIHRoZSBTREsncyBgU2Vzc2lvbkNvbnRleHRBdHRyaWJ1dGlvbmAgc2hhcGUgXHUyMDE0IGEgZmxhdCBsaXN0IG9mXG4gKiBwZXItc291cmNlIGVudHJpZXMgZGVzY3JpYmluZyB3aGF0IG9jY3VwaWVzIHRoZSBzZXNzaW9uJ3MgY29udGV4dCB3aW5kb3cuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbnRleHRBdHRyaWJ1dGlvbkRhdGEge1xuXHRyZWFkb25seSB0b3RhbFRva2VuczogbnVtYmVyO1xuXHRyZWFkb25seSBlbnRyaWVzOiByZWFkb25seSBJQ29udGV4dEF0dHJpYnV0aW9uRW50cnlbXTtcblx0cmVhZG9ubHkgY29tcGFjdGlvbnM6IHsgcmVhZG9ubHkgY291bnQ6IG51bWJlciB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb250ZXh0QXR0cmlidXRpb25FbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6IHN0cmluZztcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgdG9rZW5zOiBudW1iZXI7XG5cdHJlYWRvbmx5IHBhcmVudElkPzogc3RyaW5nO1xuXHRyZWFkb25seSBhdHRyaWJ1dGVzPzogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPj47XG59XG5cbnR5cGUgQWNjb3VudFF1b3RhU25hcHNob3QgPSBOb25OdWxsYWJsZTxOb25OdWxsYWJsZTxVc2FnZUluZm9NZXRhWydxdW90YVNuYXBzaG90cyddPltzdHJpbmddPjtcblxuZnVuY3Rpb24gcmVhZEFjY291bnRRdW90YVNuYXBzaG90KHZhbHVlOiB1bmtub3duKTogQWNjb3VudFF1b3RhU25hcHNob3QgfCB1bmRlZmluZWQge1xuXHRpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJhdyA9IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRjb25zdCBzbmFwc2hvdDogTXV0YWJsZTxBY2NvdW50UXVvdGFTbmFwc2hvdD4gPSB7fTtcblx0aWYgKHR5cGVvZiByYXdbJ2lzVW5saW1pdGVkRW50aXRsZW1lbnQnXSA9PT0gJ2Jvb2xlYW4nKSB7IHNuYXBzaG90LmlzVW5saW1pdGVkRW50aXRsZW1lbnQgPSByYXdbJ2lzVW5saW1pdGVkRW50aXRsZW1lbnQnXTsgfVxuXHRpZiAodHlwZW9mIHJhd1snZW50aXRsZW1lbnRSZXF1ZXN0cyddID09PSAnbnVtYmVyJykgeyBzbmFwc2hvdC5lbnRpdGxlbWVudFJlcXVlc3RzID0gcmF3WydlbnRpdGxlbWVudFJlcXVlc3RzJ107IH1cblx0aWYgKHR5cGVvZiByYXdbJ3VzZWRSZXF1ZXN0cyddID09PSAnbnVtYmVyJykgeyBzbmFwc2hvdC51c2VkUmVxdWVzdHMgPSByYXdbJ3VzZWRSZXF1ZXN0cyddOyB9XG5cdGlmICh0eXBlb2YgcmF3WydyZW1haW5pbmdQZXJjZW50YWdlJ10gPT09ICdudW1iZXInKSB7IHNuYXBzaG90LnJlbWFpbmluZ1BlcmNlbnRhZ2UgPSByYXdbJ3JlbWFpbmluZ1BlcmNlbnRhZ2UnXTsgfVxuXHRpZiAodHlwZW9mIHJhd1snb3ZlcmFnZSddID09PSAnbnVtYmVyJykgeyBzbmFwc2hvdC5vdmVyYWdlID0gcmF3WydvdmVyYWdlJ107IH1cblx0aWYgKHR5cGVvZiByYXdbJ292ZXJhZ2VBbGxvd2VkV2l0aEV4aGF1c3RlZFF1b3RhJ10gPT09ICdib29sZWFuJykgeyBzbmFwc2hvdC5vdmVyYWdlQWxsb3dlZFdpdGhFeGhhdXN0ZWRRdW90YSA9IHJhd1snb3ZlcmFnZUFsbG93ZWRXaXRoRXhoYXVzdGVkUXVvdGEnXTsgfVxuXHRpZiAodHlwZW9mIHJhd1sncmVzZXREYXRlJ10gPT09ICdzdHJpbmcnKSB7IHNuYXBzaG90LnJlc2V0RGF0ZSA9IHJhd1sncmVzZXREYXRlJ107IH1cblx0cmV0dXJuIHNuYXBzaG90O1xufVxuXG4vKipcbiAqIFJlYWRzIHRoZSB3ZWxsLWtub3duIHtAbGluayBVc2FnZUluZm9NZXRhfSBrZXlzIGZyb20gYSB1c2FnZSByZXBvcnQncyBvcGVuXG4gKiBgX21ldGFgIGJhZywgaWdub3JpbmcgdW5yZWxhdGVkIHByb3ZpZGVyLXNwZWNpZmljIGtleXMgYW5kIHZhbGlkYXRpbmcgZWFjaFxuICogZmllbGQncyB0eXBlLiBBbHdheXMgcmVhZCB7QGxpbmsgVXNhZ2VJbmZvLl9tZXRhfSB0aHJvdWdoIHRoaXMgaGVscGVyIHJhdGhlclxuICogdGhhbiBjYXN0aW5nIHRoZSBiYWcgdG8ge0BsaW5rIFVzYWdlSW5mb01ldGF9LCBzbyBhIG1hbGZvcm1lZCBvciBwYXJ0aWFsIGJhZ1xuICogZGVncmFkZXMgdG8gYWJzZW50IGZpZWxkcyBpbnN0ZWFkIG9mIHByb2R1Y2luZyB2YWx1ZXMgb2YgdGhlIHdyb25nIHJ1bnRpbWVcbiAqIHR5cGUuIFJldHVybnMgYW4gZW1wdHkgb2JqZWN0IHdoZW4gdGhlIGJhZyBpcyBhYnNlbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWFkVXNhZ2VJbmZvTWV0YSh1c2FnZTogVXNhZ2VJbmZvIHwgdW5kZWZpbmVkKTogVXNhZ2VJbmZvTWV0YSB7XG5cdGNvbnN0IG1ldGEgPSB1c2FnZT8uX21ldGE7XG5cdGlmICghbWV0YSkge1xuXHRcdHJldHVybiB7fTtcblx0fVxuXHRjb25zdCByZXN1bHQ6IE11dGFibGU8VXNhZ2VJbmZvTWV0YT4gPSB7fTtcblx0aWYgKHR5cGVvZiBtZXRhWydjb3N0J10gPT09ICdudW1iZXInKSB7IHJlc3VsdC5jb3N0ID0gbWV0YVsnY29zdCddOyB9XG5cdGNvbnN0IGF1dG9Nb2RlUmVzb2x2ZWQgPSByZWFkQXV0b01vZGVSZXNvbHZlZEluZm8obWV0YVsnYXV0b01vZGVSZXNvbHZlZCddKTtcblx0aWYgKGF1dG9Nb2RlUmVzb2x2ZWQpIHsgcmVzdWx0LmF1dG9Nb2RlUmVzb2x2ZWQgPSBhdXRvTW9kZVJlc29sdmVkOyB9XG5cdGNvbnN0IGNvcGlsb3RVc2FnZSA9IG1ldGFbJ2NvcGlsb3RVc2FnZSddO1xuXHRpZiAoY29waWxvdFVzYWdlICYmIHR5cGVvZiBjb3BpbG90VXNhZ2UgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KGNvcGlsb3RVc2FnZSkpIHtcblx0XHRjb25zdCByYXdVc2FnZSA9IGNvcGlsb3RVc2FnZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRjb25zdCB1c2FnZTogTXV0YWJsZTxOb25OdWxsYWJsZTxVc2FnZUluZm9NZXRhWydjb3BpbG90VXNhZ2UnXT4+ID0ge307XG5cdFx0aWYgKHR5cGVvZiByYXdVc2FnZVsndG90YWxOYW5vQWl1J10gPT09ICdudW1iZXInKSB7IHVzYWdlLnRvdGFsTmFub0FpdSA9IHJhd1VzYWdlWyd0b3RhbE5hbm9BaXUnXTsgfVxuXHRcdGlmICh0eXBlb2YgcmF3VXNhZ2VbJ3Nlc3Npb25Ub3RhbE5hbm9BaXUnXSA9PT0gJ251bWJlcicpIHsgdXNhZ2Uuc2Vzc2lvblRvdGFsTmFub0FpdSA9IHJhd1VzYWdlWydzZXNzaW9uVG90YWxOYW5vQWl1J107IH1cblx0XHRyZXN1bHQuY29waWxvdFVzYWdlID0gdXNhZ2U7XG5cdH1cblx0Y29uc3QgcXVvdGFTbmFwc2hvdHMgPSBtZXRhWydxdW90YVNuYXBzaG90cyddO1xuXHRpZiAocXVvdGFTbmFwc2hvdHMgJiYgdHlwZW9mIHF1b3RhU25hcHNob3RzID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShxdW90YVNuYXBzaG90cykpIHtcblx0XHRjb25zdCBzbmFwc2hvdHM6IE11dGFibGU8Tm9uTnVsbGFibGU8VXNhZ2VJbmZvTWV0YVsncXVvdGFTbmFwc2hvdHMnXT4+ID0ge307XG5cdFx0Zm9yIChjb25zdCBbcXVvdGFUeXBlLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMocXVvdGFTbmFwc2hvdHMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pKSB7XG5cdFx0XHRzbmFwc2hvdHNbcXVvdGFUeXBlXSA9IHJlYWRBY2NvdW50UXVvdGFTbmFwc2hvdCh2YWx1ZSk7XG5cdFx0fVxuXHRcdHJlc3VsdC5xdW90YVNuYXBzaG90cyA9IHNuYXBzaG90cztcblx0fVxuXHRjb25zdCBjb250ZXh0QXR0cmlidXRpb24gPSByZWFkQ29udGV4dEF0dHJpYnV0aW9uKG1ldGFbJ2NvbnRleHRBdHRyaWJ1dGlvbiddKTtcblx0aWYgKGNvbnRleHRBdHRyaWJ1dGlvbikge1xuXHRcdHJlc3VsdC5jb250ZXh0QXR0cmlidXRpb24gPSBjb250ZXh0QXR0cmlidXRpb247XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBXaGV0aGVyIGEgdXNhZ2UgcmVwb3J0IGFjdHVhbGx5IHJlY29yZHMgY29uc3VtcHRpb24sIGFzIG9wcG9zZWQgdG8gbWVyZWx5XG4gKiBleGlzdGluZy5cbiAqXG4gKiBBIHR1cm4gY2FuIGNhcnJ5IGEgdG9rZW4tbGVzcyB7QGxpbmsgVXNhZ2VJbmZvfSB0aGF0IGV4aXN0cyBvbmx5IHRvIGhvbGRcbiAqIHJvdXRpbmcgbWV0YWRhdGEgXHUyMDE0IG5vdGFibHkgYSBDb3BpbG90IEF1dG8gdHVybiByZXN0b3JlZCBmcm9tIHRoZSBldmVudCBsb2csXG4gKiB3aGljaCBrZWVwcyBgX21ldGEuYXV0b01vZGVSZXNvbHZlZGAgZXZlbiB0aG91Z2ggdGhlIHVzYWdlIGV2ZW50IGl0c2VsZiBpc1xuICogZXBoZW1lcmFsIGFuZCB3YXMgbmV2ZXIgcGVyc2lzdGVkLiBDYWxsZXJzIHRoYXQgYXNrIFwiZG9lcyB0aGlzIHR1cm4gaGF2ZVxuICogdXNhZ2U/XCIgYWxtb3N0IGFsd2F5cyBtZWFuIFwiZG9lcyBpdCBoYXZlIG51bWJlcnMgdG8gc2hvd1wiLCBzbyByb3V0ZSB0aGF0XG4gKiBxdWVzdGlvbiB0aHJvdWdoIGhlcmUgcmF0aGVyIHRoYW4gdGVzdGluZyB0aGUgb2JqZWN0IGZvciB0cnV0aGluZXNzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaGFzUmVwb3J0ZWRVc2FnZSh1c2FnZTogVXNhZ2VJbmZvIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGlmICghdXNhZ2UpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKHR5cGVvZiB1c2FnZS5pbnB1dFRva2VucyA9PT0gJ251bWJlcicgfHwgdHlwZW9mIHVzYWdlLm91dHB1dFRva2VucyA9PT0gJ251bWJlcicpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRjb25zdCBtZXRhID0gcmVhZFVzYWdlSW5mb01ldGEodXNhZ2UpO1xuXHQvLyBOZWdhdGl2ZSB0b3RhbHMgYXJlIHRyZWF0ZWQgYXMgYWJzZW50LCBtYXRjaGluZyBob3cgY3JlZGl0cyBhcmUgcmVhZCBmb3IgZGlzcGxheS5cblx0cmV0dXJuICh0eXBlb2YgbWV0YS5jb3BpbG90VXNhZ2U/LnRvdGFsTmFub0FpdSA9PT0gJ251bWJlcicgJiYgbWV0YS5jb3BpbG90VXNhZ2UudG90YWxOYW5vQWl1ID49IDApXG5cdFx0Ly8gQSByZXBvcnQgY2FuIGNhcnJ5IG9ubHkgdGhlIHNlc3Npb24gdG90YWwgXHUyMDE0IGEgY29tcGFjdGlvbiBiaWxsZWQgd2hpbGUgbm8gdHVyblxuXHRcdC8vIHdhcyBhY3RpdmUgYWR2YW5jZXMgaXQgd2l0aG91dCBhbnkgcGVyLWV2ZW50IGJpbGxpbmcgcGF5bG9hZCBcdTIwMTQgYW5kIHRoYXQgaXNcblx0XHQvLyBzdGlsbCBjb25zdW1wdGlvbiB3b3J0aCBzaG93aW5nLlxuXHRcdHx8ICh0eXBlb2YgbWV0YS5jb3BpbG90VXNhZ2U/LnNlc3Npb25Ub3RhbE5hbm9BaXUgPT09ICdudW1iZXInICYmIG1ldGEuY29waWxvdFVzYWdlLnNlc3Npb25Ub3RhbE5hbm9BaXUgPj0gMClcblx0XHR8fCAodHlwZW9mIG1ldGEuY29zdCA9PT0gJ251bWJlcicgJiYgbWV0YS5jb3N0ID49IDApO1xufVxuXG5mdW5jdGlvbiByZWFkQXV0b01vZGVSZXNvbHZlZEluZm8odmFsdWU6IHVua25vd24pOiBJQXV0b01vZGVSZXNvbHZlZEluZm8gfCB1bmRlZmluZWQge1xuXHRpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJhdyA9IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRpZiAodHlwZW9mIHJhd1snY2hvc2VuTW9kZWwnXSAhPT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJlc3VsdDogTXV0YWJsZTxJQXV0b01vZGVSZXNvbHZlZEluZm8+ID0geyBjaG9zZW5Nb2RlbDogcmF3WydjaG9zZW5Nb2RlbCddIH07XG5cdGNvbnN0IHJlYXNvbmluZ0J1Y2tldCA9IHJhd1sncmVhc29uaW5nQnVja2V0J107XG5cdGlmIChyZWFzb25pbmdCdWNrZXQgPT09ICdsb3cnIHx8IHJlYXNvbmluZ0J1Y2tldCA9PT0gJ21lZGl1bScgfHwgcmVhc29uaW5nQnVja2V0ID09PSAnaGlnaCcpIHtcblx0XHRyZXN1bHQucmVhc29uaW5nQnVja2V0ID0gcmVhc29uaW5nQnVja2V0O1xuXHR9XG5cdGNvbnN0IGNhdGVnb3J5U2NvcmVzID0gcmF3WydjYXRlZ29yeVNjb3JlcyddO1xuXHRpZiAoY2F0ZWdvcnlTY29yZXMgJiYgdHlwZW9mIGNhdGVnb3J5U2NvcmVzID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShjYXRlZ29yeVNjb3JlcykpIHtcblx0XHRjb25zdCBzY29yZXM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IFtjYXRlZ29yeSwgc2NvcmVdIG9mIE9iamVjdC5lbnRyaWVzKGNhdGVnb3J5U2NvcmVzIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KSkge1xuXHRcdFx0aWYgKHR5cGVvZiBzY29yZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0c2NvcmVzW2NhdGVnb3J5XSA9IHNjb3JlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXN1bHQuY2F0ZWdvcnlTY29yZXMgPSBzY29yZXM7XG5cdH1cblx0aWYgKHR5cGVvZiByYXdbJ3ByZWRpY3RlZExhYmVsJ10gPT09ICdzdHJpbmcnKSB7IHJlc3VsdC5wcmVkaWN0ZWRMYWJlbCA9IHJhd1sncHJlZGljdGVkTGFiZWwnXTsgfVxuXHRpZiAodHlwZW9mIHJhd1snY29uZmlkZW5jZSddID09PSAnbnVtYmVyJykgeyByZXN1bHQuY29uZmlkZW5jZSA9IHJhd1snY29uZmlkZW5jZSddOyB9XG5cdGlmIChBcnJheS5pc0FycmF5KHJhd1snY2FuZGlkYXRlTW9kZWxzJ10pICYmIHJhd1snY2FuZGlkYXRlTW9kZWxzJ10uZXZlcnkoY2FuZGlkYXRlID0+IHR5cGVvZiBjYW5kaWRhdGUgPT09ICdzdHJpbmcnKSkge1xuXHRcdHJlc3VsdC5jYW5kaWRhdGVNb2RlbHMgPSByYXdbJ2NhbmRpZGF0ZU1vZGVscyddO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIHJlYWRDb250ZXh0QXR0cmlidXRpb24odmFsdWU6IHVua25vd24pOiBJQ29udGV4dEF0dHJpYnV0aW9uRGF0YSB8IHVuZGVmaW5lZCB7XG5cdGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgcmF3ID0gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdGlmICh0eXBlb2YgcmF3Wyd0b3RhbFRva2VucyddICE9PSAnbnVtYmVyJyB8fCAhQXJyYXkuaXNBcnJheShyYXdbJ2VudHJpZXMnXSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGVudHJpZXM6IElDb250ZXh0QXR0cmlidXRpb25FbnRyeVtdID0gW107XG5cdGZvciAoY29uc3QgaXRlbSBvZiByYXdbJ2VudHJpZXMnXSkge1xuXHRcdGlmICghaXRlbSB8fCB0eXBlb2YgaXRlbSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheShpdGVtKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IGVudHJ5ID0gaXRlbSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRpZiAodHlwZW9mIGVudHJ5WydraW5kJ10gIT09ICdzdHJpbmcnIHx8IHR5cGVvZiBlbnRyeVsnaWQnXSAhPT0gJ3N0cmluZydcblx0XHRcdHx8IHR5cGVvZiBlbnRyeVsnbGFiZWwnXSAhPT0gJ3N0cmluZycgfHwgdHlwZW9mIGVudHJ5Wyd0b2tlbnMnXSAhPT0gJ251bWJlcicpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRlbnRyaWVzLnB1c2goe1xuXHRcdFx0a2luZDogZW50cnlbJ2tpbmQnXSxcblx0XHRcdGlkOiBlbnRyeVsnaWQnXSxcblx0XHRcdGxhYmVsOiBlbnRyeVsnbGFiZWwnXSxcblx0XHRcdHRva2VuczogZW50cnlbJ3Rva2VucyddLFxuXHRcdFx0cGFyZW50SWQ6IHR5cGVvZiBlbnRyeVsncGFyZW50SWQnXSA9PT0gJ3N0cmluZycgPyBlbnRyeVsncGFyZW50SWQnXSA6IHVuZGVmaW5lZCxcblx0XHRcdGF0dHJpYnV0ZXM6IGVudHJ5WydhdHRyaWJ1dGVzJ10gJiYgdHlwZW9mIGVudHJ5WydhdHRyaWJ1dGVzJ10gPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KGVudHJ5WydhdHRyaWJ1dGVzJ10pXG5cdFx0XHRcdD8gZmlsdGVyU3RyaW5nQXR0cmlidXRlcyhlbnRyeVsnYXR0cmlidXRlcyddIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fVxuXHRjb25zdCBjb21wYWN0aW9uc1JhdyA9IHJhd1snY29tcGFjdGlvbnMnXTtcblx0Y29uc3QgY29tcGFjdGlvbnMgPSBjb21wYWN0aW9uc1JhdyAmJiB0eXBlb2YgY29tcGFjdGlvbnNSYXcgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KGNvbXBhY3Rpb25zUmF3KVxuXHRcdCYmIHR5cGVvZiAoY29tcGFjdGlvbnNSYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pWydjb3VudCddID09PSAnbnVtYmVyJ1xuXHRcdD8geyBjb3VudDogKGNvbXBhY3Rpb25zUmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVsnY291bnQnXSBhcyBudW1iZXIgfVxuXHRcdDogeyBjb3VudDogMCB9O1xuXHRyZXR1cm4geyB0b3RhbFRva2VuczogcmF3Wyd0b3RhbFRva2VucyddIGFzIG51bWJlciwgZW50cmllcywgY29tcGFjdGlvbnMgfTtcbn1cblxuZnVuY3Rpb24gZmlsdGVyU3RyaW5nQXR0cmlidXRlcyhyYXc6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IHJlc3VsdDogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiA9IHt9O1xuXHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhyYXcpKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzdWx0W2tleV0gPSB2YWx1ZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IHtcblx0Q2hhbmdlc2V0T3BlcmF0aW9uVGFyZ2V0S2luZCwgdHlwZSBDaGFuZ2VzZXRPcGVyYXRpb25Gb2xsb3dVcCwgdHlwZSBDaGFuZ2VzZXRPcGVyYXRpb25UYXJnZXRcbn0gZnJvbSAnLi9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5cbi8vIENhbm9uaWNhbCBjaGF0LWlucHV0IHR5cGUgbmFtZXMgKHRoZSBwcm90b2NvbCByZW5hbWVkIHRoZSBmb3JtZXJcbi8vIGBTZXNzaW9uSW5wdXQqYCB0eXBlcyB0byBgQ2hhdElucHV0KmAgd2hlbiBpbnB1dCByZXF1ZXN0cyBtb3ZlZCBvbnRvIHRoZVxuLy8gY2hhdCBjaGFubmVsKS4gUmUtZXhwb3J0ZWQgaGVyZSBzbyBjb25zdW1lcnMgY2FuIGltcG9ydCB0aGVtIGZyb20gdGhlIGdsdWVcbi8vIGxheWVyIGFsb25nc2lkZSB0aGUgbGVnYWN5IGBTZXNzaW9uSW5wdXQqYCBhbGlhc2VzIGFib3ZlLlxuZXhwb3J0IHtcblx0Q2hhdElucHV0QW5zd2VyU3RhdGUsXG5cdENoYXRJbnB1dEFuc3dlclZhbHVlS2luZCxcblx0Q2hhdElucHV0UXVlc3Rpb25LaW5kLFxuXHRDaGF0SW5wdXRSZXNwb25zZUtpbmQsXG5cdHR5cGUgQ2hhdElucHV0QW5zd2VyLFxuXHR0eXBlIENoYXRJbnB1dE9wdGlvbixcblx0dHlwZSBDaGF0SW5wdXRRdWVzdGlvbixcblx0dHlwZSBDaGF0SW5wdXRSZXF1ZXN0LFxuXHR0eXBlIElucHV0UmVxdWVzdFJlc3BvbnNlUGFydCxcbn0gZnJvbSAnLi9wcm90b2NvbC9zdGF0ZS5qcyc7XG5cbi8vIC0tLS0gRmlsZSBlZGl0IGtpbmQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogVGhlIGtpbmQgb2YgZmlsZSBlZGl0IG9wZXJhdGlvbi4gRGVyaXZlZCBmcm9tIHRoZSBwcmVzZW5jZS9hYnNlbmNlIG9mXG4gKiBgYmVmb3JlYC9gYWZ0ZXJgIGluIHtAbGluayBUb29sUmVzdWx0RmlsZUVkaXRDb250ZW50fS5cbiAqL1xuZXhwb3J0IGNvbnN0IGVudW0gRmlsZUVkaXRLaW5kIHtcblx0LyoqIENvbnRlbnQgZWRpdCAoc2FtZSBmaWxlIFVSSSwgZGlmZmVyZW50IGNvbnRlbnQpLiAqL1xuXHRFZGl0ID0gJ2VkaXQnLFxuXHQvKiogRmlsZSBjcmVhdGlvbiAobm8gYmVmb3JlIHN0YXRlKS4gKi9cblx0Q3JlYXRlID0gJ2NyZWF0ZScsXG5cdC8qKiBGaWxlIGRlbGV0aW9uIChubyBhZnRlciBzdGF0ZSkuICovXG5cdERlbGV0ZSA9ICdkZWxldGUnLFxuXHQvKiogRmlsZSByZW5hbWUvbW92ZSAoZGlmZmVyZW50IGJlZm9yZSBhbmQgYWZ0ZXIgVVJJcykuICovXG5cdFJlbmFtZSA9ICdyZW5hbWUnLFxufVxuXG4vLyAtLS0tIFdlbGwta25vd24gVVJJcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKiogVVJJIGZvciB0aGUgcm9vdCBzdGF0ZSBzdWJzY3JpcHRpb24uICovXG5leHBvcnQgY29uc3QgUk9PVF9TVEFURV9VUkkgPSAnYWhwLXJvb3Q6Ly8nO1xuXG4vKiogU2NoZW1lIHVzZWQgYnkge0BsaW5rIFJPT1RfU1RBVEVfVVJJfS4gKi9cbmV4cG9ydCBjb25zdCBBSFBfUk9PVF9TQ0hFTUUgPSAnYWhwLXJvb3QnO1xuXG4vKiogU2NoZW1lIHVzZWQgYnkgcmVzb3VyY2Utd2F0Y2ggY2hhbm5lbCBVUklzIChgYWhwLXJlc291cmNlLXdhdGNoOi88ZW5jb2RlZD5gKS4gKi9cbmV4cG9ydCBjb25zdCBBSFBfUkVTT1VSQ0VfV0FUQ0hfU0NIRU1FID0gJ2FocC1yZXNvdXJjZS13YXRjaCc7XG5cbi8qKlxuICogRW5jb2RlIGEgcmVzb3VyY2Utd2F0Y2ggZGVzY3JpcHRvciBpbnRvIGl0cyBjYW5vbmljYWwgY2hhbm5lbCBVUkkuIFRoZVxuICogZGVzY3JpcHRvciBpcyBzZXJpYWxpc2VkIGludG8gdGhlIFVSSSBwYXRoIHNvIHRoZSByZWNlaXZlciBjYW4gcmVjb3ZlclxuICogdGhlIHdhdGNoIHBhcmFtZXRlcnMgd2l0aG91dCBhbnkgc2VydmVyLXNpZGUgYm9va2tlZXBpbmcgXHUyMDE0IHN1YnNjcmliZSBpc1xuICogdGhlIG9ubHkgcG9pbnQgd2hlcmUgc3RhdGUgaXMgbWF0ZXJpYWxpc2VkIChhbiBgSUZpbGVTZXJ2aWNlYCB3YXRjaGVyXG4gKiBpcyBhdHRhY2hlZCBvbiB0aGUgZmlyc3Qgc3Vic2NyaWJlciBhbmQgaGVsZCB0aHJvdWdoIGEgZ3JhY2Ugd2luZG93XG4gKiBhZnRlciB0aGUgbGFzdCBkcm9wcykuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFJlc291cmNlV2F0Y2hDaGFubmVsVXJpKGRlc2NyaXB0b3I6IHtcblx0cmVhZG9ubHkgcm9vdDogc3RyaW5nO1xuXHRyZWFkb25seSByZWN1cnNpdmU/OiBib29sZWFuO1xuXHRyZWFkb25seSBleGNsdWRlcz86IHsgaXRlbXM6IHJlYWRvbmx5IHN0cmluZ1tdIH07XG5cdHJlYWRvbmx5IGluY2x1ZGVzPzogeyBpdGVtczogcmVhZG9ubHkgc3RyaW5nW10gfTtcbn0pOiBzdHJpbmcge1xuXHRjb25zdCBwYXlsb2FkOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHsgcm9vdDogZGVzY3JpcHRvci5yb290IH07XG5cdGlmIChkZXNjcmlwdG9yLnJlY3Vyc2l2ZSkgeyBwYXlsb2FkLnJlY3Vyc2l2ZSA9IHRydWU7IH1cblx0aWYgKGRlc2NyaXB0b3IuZXhjbHVkZXMgJiYgZGVzY3JpcHRvci5leGNsdWRlcy5pdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0cGF5bG9hZC5leGNsdWRlcyA9IFsuLi5kZXNjcmlwdG9yLmV4Y2x1ZGVzLml0ZW1zXTtcblx0fVxuXHRpZiAoZGVzY3JpcHRvci5pbmNsdWRlcyAmJiBkZXNjcmlwdG9yLmluY2x1ZGVzLml0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRwYXlsb2FkLmluY2x1ZGVzID0gWy4uLmRlc2NyaXB0b3IuaW5jbHVkZXMuaXRlbXNdO1xuXHR9XG5cblx0Y29uc3QganNvbiA9IGVuY29kZUJhc2U2NChWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHBheWxvYWQpKSwgZmFsc2UsIHRydWUpO1xuXHRyZXR1cm4gYCR7QUhQX1JFU09VUkNFX1dBVENIX1NDSEVNRX06Ly9yLyR7anNvbn1gO1xufVxuXG4vKipcbiAqIEludmVyc2Ugb2Yge0BsaW5rIGJ1aWxkUmVzb3VyY2VXYXRjaENoYW5uZWxVcml9LiBSZXR1cm5zIGB1bmRlZmluZWRgIGlmXG4gKiBgdXJpYCBpcyBub3QgYSB3ZWxsLWZvcm1lZCBgYWhwLXJlc291cmNlLXdhdGNoOmAgVVJJIFx1MjAxNCBjYWxsZXJzIHNob3VsZFxuICogc3VyZmFjZSB0aGF0IGFzIGEgbm90LWZvdW5kIGVycm9yIHRvIHRoZSBjbGllbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVJlc291cmNlV2F0Y2hDaGFubmVsVXJpKHVyaTogc3RyaW5nKToge1xuXHRyb290OiBzdHJpbmc7XG5cdHJlY3Vyc2l2ZTogYm9vbGVhbjtcblx0ZXhjbHVkZXM/OiB7IGl0ZW1zOiBzdHJpbmdbXSB9O1xuXHRpbmNsdWRlcz86IHsgaXRlbXM6IHN0cmluZ1tdIH07XG59IHwgdW5kZWZpbmVkIHtcblx0bGV0IHBhcnNlZDogUmVzb3VyY2VVUkk7XG5cdHRyeSB7XG5cdFx0cGFyc2VkID0gUmVzb3VyY2VVUkkucGFyc2UodXJpKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAocGFyc2VkLnNjaGVtZSAhPT0gQUhQX1JFU09VUkNFX1dBVENIX1NDSEVNRSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgZW5jb2RlZCA9IHBhcnNlZC5wYXRoLnJlcGxhY2UoL15cXC8vLCAnJyk7XG5cdGlmICghZW5jb2RlZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0dHJ5IHtcblx0XHRjb25zdCBwYXlsb2FkID0gSlNPTi5wYXJzZShkZWNvZGVCYXNlNjQoZW5jb2RlZCkudG9TdHJpbmcoKSkgYXMgeyByb290PzogdW5rbm93bjsgcmVjdXJzaXZlPzogdW5rbm93bjsgZXhjbHVkZXM/OiB1bmtub3duOyBpbmNsdWRlcz86IHVua25vd24gfTtcblx0XHRpZiAodHlwZW9mIHBheWxvYWQucm9vdCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJvb3Q6IHBheWxvYWQucm9vdCxcblx0XHRcdHJlY3Vyc2l2ZTogcGF5bG9hZC5yZWN1cnNpdmUgPT09IHRydWUsXG5cdFx0XHQuLi4oQXJyYXkuaXNBcnJheShwYXlsb2FkLmV4Y2x1ZGVzKSA/IHsgZXhjbHVkZXM6IHsgaXRlbXM6IHBheWxvYWQuZXhjbHVkZXMuZmlsdGVyKCh4KTogeCBpcyBzdHJpbmcgPT4gdHlwZW9mIHggPT09ICdzdHJpbmcnKSB9IH0gOiB7fSksXG5cdFx0XHQuLi4oQXJyYXkuaXNBcnJheShwYXlsb2FkLmluY2x1ZGVzKSA/IHsgaW5jbHVkZXM6IHsgaXRlbXM6IHBheWxvYWQuaW5jbHVkZXMuZmlsdGVyKCh4KTogeCBpcyBzdHJpbmcgPT4gdHlwZW9mIHggPT09ICdzdHJpbmcnKSB9IH0gOiB7fSksXG5cdFx0fTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKiogUmV0dXJucyBgdHJ1ZWAgd2hlbiBgdXJpYCBpZGVudGlmaWVzIGEgcmVzb3VyY2Utd2F0Y2ggY2hhbm5lbC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0FocFJlc291cmNlV2F0Y2hDaGFubmVsKHVyaTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIFJlc291cmNlVVJJLnBhcnNlKHVyaSkuc2NoZW1lID09PSBBSFBfUkVTT1VSQ0VfV0FUQ0hfU0NIRU1FO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuLyoqXG4gKiBSZXR1cm5zIGB0cnVlYCB3aGVuIGB1cmlgIGlkZW50aWZpZXMgdGhlIHJvb3QgY2hhbm5lbCwgcmVnYXJkbGVzcyBvZlxuICogd2hldGhlciB0aGUgY2FsbGVyIHBhc3NlcyB0aGUgY2Fub25pY2FsIHdpcmUgZm9ybSAoYCdhaHAtcm9vdDovLydgKSBvciBhXG4gKiB2YXJpYW50IHRoYXQgaGFzIGJlZW4gcm91bmQtdHJpcHBlZCB0aHJvdWdoIHRoZSB3b3JrYmVuY2gge0BsaW5rIFVSSX0gY2xhc3NcbiAqICh3aGljaCBub3JtYWxpemVzIHRoZSBhdXRob3JpdHktbGVzcyBmb3JtIHRvIGAnYWhwLXJvb3Q6J2ApLiBBbHdheXMgcHJlZmVyXG4gKiB0aGlzIGhlbHBlciBvdmVyIGEgZGlyZWN0IGA9PT0gUk9PVF9TVEFURV9VUklgIGNvbXBhcmlzb24gc28gdGhlIHR3b1xuICogc3BlbGxpbmdzIHN0YXkgaW50ZXJjaGFuZ2VhYmxlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNBaHBSb290Q2hhbm5lbCh1cmk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAodXJpID09PSBST09UX1NUQVRFX1VSSSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHRyeSB7XG5cdFx0cmV0dXJuIFJlc291cmNlVVJJLnBhcnNlKHVyaSkuc2NoZW1lID09PSBBSFBfUk9PVF9TQ0hFTUU7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG4vKipcbiAqIE1pbnRzIGEgc2Vzc2lvbi11bmlxdWUgb3BhcXVlIGlkIGZvciBhIGN1c3RvbWl6YXRpb24sIGRlcml2ZWQgZnJvbSBpdHNcbiAqIHNvdXJjZSBVUkkgYW5kICh3aGVuIHByZXNlbnQpIGl0cyBgcmFuZ2VgIHdpdGhpbiB0aGUgc291cmNlLiBQbHVnaW5zIE1BWVxuICogZGVjbGFyZSBtdWx0aXBsZSBjaGlsZHJlbiAoZS5nLiBNQ1Agc2VydmVycywgaG9va3MpIGluc2lkZSB0aGUgc2FtZVxuICogbWFuaWZlc3QgZmlsZTsgaW5jbHVkaW5nIHRoZSByYW5nZSBkaXNhbWJpZ3VhdGVzIHRoZW0gd2l0aG91dCBhbiBleHRyYVxuICogbWFwcGluZyB0YWJsZS5cbiAqXG4gKiBUaGUgcmFuZ2UgaXMgYXBwZW5kZWQgYXMgYSByZXNlcnZlZCBgI3JhbmdlPWAgcXVlcnktc3R5bGUgc3VmZml4OyBhbnlcbiAqIGV4aXN0aW5nIGAjYCBpbiB0aGUgVVJJIGlzIHBlcmNlbnQtZW5jb2RlZCBmaXJzdCBzbyBhIHNvdXJjZSBVUkkgdGhhdFxuICogYWxyZWFkeSBjb250YWlucyBhIGZyYWdtZW50IGNhbm5vdCBjb2xsaWRlIHdpdGggYSByYW5nZWQgaWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjdXN0b21pemF0aW9uSWQodXJpOiBzdHJpbmcsIHJhbmdlPzogVGV4dFJhbmdlKTogc3RyaW5nIHtcblx0aWYgKCFyYW5nZSkge1xuXHRcdHJldHVybiB1cmk7XG5cdH1cblx0Y29uc3Qgc2FmZVVyaSA9IHVyaS5yZXBsYWNlKC8jL2csICclMjMnKTtcblx0cmV0dXJuIGAke3NhZmVVcml9I3JhbmdlPSR7cmFuZ2Uuc3RhcnQubGluZX06JHtyYW5nZS5zdGFydC5jaGFyYWN0ZXJ9LSR7cmFuZ2UuZW5kLmxpbmV9OiR7cmFuZ2UuZW5kLmNoYXJhY3Rlcn1gO1xufVxuXG4vLyAtLS0tIFZTIENvZGUtc3BlY2lmaWMgZGVyaXZlZCB0eXBlcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIEEgdG9vbCBjYWxsIGluIGEgdGVybWluYWwgc3RhdGUsIHN0b3JlZCBpbiBjb21wbGV0ZWQgdHVybnMuXG4gKi9cbmV4cG9ydCB0eXBlIElDb21wbGV0ZWRUb29sQ2FsbCA9IFRvb2xDYWxsQ29tcGxldGVkU3RhdGUgfCBUb29sQ2FsbENhbmNlbGxlZFN0YXRlO1xuXG4vKipcbiAqIERlcml2ZWQgc3RhdHVzIHR5cGUgZm9yIHRoZSB0b29sIGNhbGwgbGlmZWN5Y2xlLlxuICovXG5leHBvcnQgdHlwZSBUb29sQ2FsbFN0YXR1c1N0cmluZyA9IFRvb2xDYWxsU3RhdGVbJ3N0YXR1cyddO1xuXG4vLyAtLS0tIFRvb2wgb3V0cHV0IGhlbHBlciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIEV4dHJhY3RzIGEgcGxhaW4tdGV4dCB0b29sIG91dHB1dCBzdHJpbmcgZnJvbSBhIHRvb2wgY2FsbCByZXN1bHQncyBgY29udGVudGBcbiAqIGFycmF5LiBKb2lucyBhbGwgdGV4dC10eXBlIGNvbnRlbnQgcGFydHMgaW50byBhIHNpbmdsZSBzdHJpbmcuXG4gKlxuICogUmV0dXJucyBgdW5kZWZpbmVkYCBpZiB0aGVyZSBhcmUgbm8gdGV4dCBjb250ZW50IHBhcnRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0VG9vbE91dHB1dFRleHQocmVzdWx0OiBUb29sQ2FsbFJlc3VsdCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICghcmVzdWx0LmNvbnRlbnQgfHwgcmVzdWx0LmNvbnRlbnQubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB0ZXh0UGFydHM6IFRvb2xSZXN1bHRUZXh0Q29udGVudFtdID0gW107XG5cdGZvciAoY29uc3QgYyBvZiByZXN1bHQuY29udGVudCkge1xuXHRcdGlmIChoYXNLZXkoYywgeyB0eXBlOiB0cnVlIH0pICYmIGMudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQpIHtcblx0XHRcdHRleHRQYXJ0cy5wdXNoKGMpO1xuXHRcdH1cblx0fVxuXHRpZiAodGV4dFBhcnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHRleHRQYXJ0cy5tYXAocCA9PiBwLnRleHQpLmpvaW4oJ1xcbicpO1xufVxuXG4vKipcbiAqIEV4dHJhY3RzIGZpbGUgZWRpdCBjb250ZW50IGVudHJpZXMgZnJvbSBhIHRvb2wgY2FsbCByZXN1bHQncyBgY29udGVudGAgYXJyYXkuXG4gKiBSZXR1cm5zIGFuIGVtcHR5IGFycmF5IGlmIHRoZXJlIGFyZSBubyBmaWxlIGVkaXQgY29udGVudCBwYXJ0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFRvb2xGaWxlRWRpdHMocmVzdWx0OiBUb29sQ2FsbFJlc3VsdCk6IFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnRbXSB7XG5cdGlmICghcmVzdWx0LmNvbnRlbnQgfHwgcmVzdWx0LmNvbnRlbnQubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGNvbnN0IGVkaXRzOiBUb29sUmVzdWx0RmlsZUVkaXRDb250ZW50W10gPSBbXTtcblx0Zm9yIChjb25zdCBjIG9mIHJlc3VsdC5jb250ZW50KSB7XG5cdFx0aWYgKGhhc0tleShjLCB7IHR5cGU6IHRydWUgfSkgJiYgYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQpIHtcblx0XHRcdGVkaXRzLnB1c2goYyk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBlZGl0cztcbn1cblxuLyoqXG4gKiBFeHRyYWN0cyB0aGUgZmlyc3Qgc3ViYWdlbnQgY29udGVudCBlbnRyeSBmcm9tIGEgdG9vbCBjYWxsJ3MgYGNvbnRlbnRgIGFycmF5LlxuICogV29ya3Mgd2l0aCBib3RoIGNvbXBsZXRlZCB0b29sIGNhbGwgcmVzdWx0cyBhbmQgcnVubmluZyB0b29sIGNhbGwgc3RhdGVzLlxuICogUmV0dXJucyBgdW5kZWZpbmVkYCBpZiB0aGVyZSBhcmUgbm8gc3ViYWdlbnQgY29udGVudCBwYXJ0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFRvb2xTdWJhZ2VudENvbnRlbnQocmVzdWx0OiB7IGNvbnRlbnQ/OiByZWFkb25seSBUb29sUmVzdWx0Q29udGVudFtdIH0pOiBUb29sUmVzdWx0U3ViYWdlbnRDb250ZW50IHwgdW5kZWZpbmVkIHtcblx0aWYgKCFyZXN1bHQuY29udGVudCB8fCByZXN1bHQuY29udGVudC5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGZvciAoY29uc3QgYyBvZiByZXN1bHQuY29udGVudCkge1xuXHRcdGlmIChoYXNLZXkoYywgeyB0eXBlOiB0cnVlIH0pICYmIGMudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50KSB7XG5cdFx0XHRyZXR1cm4gYyBhcyBUb29sUmVzdWx0U3ViYWdlbnRDb250ZW50O1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vLyAtLS0tIFN1YmFnZW50IFVSSSBoZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5jb25zdCBTVUJBR0VOVF9VUklfU0VHTUVOVCA9ICdzdWJhZ2VudCc7XG5jb25zdCBTVUJBR0VOVF9VUklfTUFSS0VSID0gYC8ke1NVQkFHRU5UX1VSSV9TRUdNRU5UfS9gO1xuY29uc3QgU1VCQUdFTlRfVVJJX1BBVEhfUkVHRVggPSAvXig/PHBhcmVudFBhdGg+LispXFwvc3ViYWdlbnRcXC8oPzx0b29sQ2FsbElkPi4rKSQvO1xuXG5mdW5jdGlvbiBhc1Jlc291cmNlVXJpKHVyaTogUHJvdG9jb2xVUkkgfCBSZXNvdXJjZVVSSSk6IFJlc291cmNlVVJJIHtcblx0cmV0dXJuIHR5cGVvZiB1cmkgPT09ICdzdHJpbmcnID8gUmVzb3VyY2VVUkkucGFyc2UodXJpKSA6IHVyaTtcbn1cblxuZnVuY3Rpb24gZ2V0U3ViYWdlbnRCYXNlUGF0aChwYXJlbnRTZXNzaW9uOiBQcm90b2NvbFVSSSB8IFJlc291cmNlVVJJKTogeyBwYXJlbnQ6IFJlc291cmNlVVJJOyBwYXRoOiBzdHJpbmcgfSB7XG5cdGNvbnN0IHBhcmVudCA9IGFzUmVzb3VyY2VVcmkocGFyZW50U2Vzc2lvbik7XG5cdGNvbnN0IHBhcmVudFBhdGggPSBwYXJlbnQucGF0aC5lbmRzV2l0aCgnLycpID8gcGFyZW50LnBhdGguc2xpY2UoMCwgLTEpIDogcGFyZW50LnBhdGg7XG5cdHJldHVybiB7IHBhcmVudCwgcGF0aDogYCR7cGFyZW50UGF0aH0ke1NVQkFHRU5UX1VSSV9NQVJLRVJ9YCB9O1xufVxuXG4vKipcbiAqIEJ1aWxkcyBhIHN1YmFnZW50IHNlc3Npb24gVVJJIGZyb20gYSBwYXJlbnQgc2Vzc2lvbiBVUkkgYW5kIHRvb2wgY2FsbCBJRC5cbiAqIENvbnZlbnRpb246IGB7cGFyZW50U2Vzc2lvblVyaX0vc3ViYWdlbnQve3Rvb2xDYWxsSWR9YFxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRTdWJhZ2VudFNlc3Npb25VcmkocGFyZW50U2Vzc2lvbjogUHJvdG9jb2xVUkkgfCBSZXNvdXJjZVVSSSwgdG9vbENhbGxJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgeyBwYXJlbnQsIHBhdGggfSA9IGdldFN1YmFnZW50QmFzZVBhdGgocGFyZW50U2Vzc2lvbik7XG5cdHJldHVybiBwYXJlbnQud2l0aCh7IHBhdGg6IGAke3BhdGh9JHt0b29sQ2FsbElkfWAgfSkudG9TdHJpbmcoKTtcbn1cblxuLyoqXG4gKiBQYXJzZXMgYSBzdWJhZ2VudCBzZXNzaW9uIFVSSSBpbnRvIGl0cyBwYXJlbnQgc2Vzc2lvbiBVUkkgYW5kIHRvb2wgY2FsbCBJRC5cbiAqIFJldHVybnMgYHVuZGVmaW5lZGAgaWYgdGhlIFVSSSBkb2VzIG5vdCBmb2xsb3cgdGhlIHN1YmFnZW50IGNvbnZlbnRpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVN1YmFnZW50U2Vzc2lvblVyaSh1cmk6IFByb3RvY29sVVJJIHwgUmVzb3VyY2VVUkkpOiB7IHBhcmVudFNlc3Npb246IFJlc291cmNlVVJJOyB0b29sQ2FsbElkOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHJlc291cmNlID0gYXNSZXNvdXJjZVVyaSh1cmkpO1xuXHRjb25zdCBtYXRjaCA9IFNVQkFHRU5UX1VSSV9QQVRIX1JFR0VYLmV4ZWMocmVzb3VyY2UucGF0aCk7XG5cdGlmICghbWF0Y2g/Lmdyb3Vwcykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRwYXJlbnRTZXNzaW9uOiByZXNvdXJjZS53aXRoKHsgcGF0aDogbWF0Y2guZ3JvdXBzLnBhcmVudFBhdGggfSksXG5cdFx0dG9vbENhbGxJZDogbWF0Y2guZ3JvdXBzLnRvb2xDYWxsSWQsXG5cdH07XG59XG5cbi8qKlxuICogUmV0dXJucyB3aGV0aGVyIGEgc2Vzc2lvbiBVUkkgcmVwcmVzZW50cyBhIHN1YmFnZW50IHNlc3Npb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1N1YmFnZW50U2Vzc2lvbih1cmk6IFByb3RvY29sVVJJIHwgUmVzb3VyY2VVUkkpOiBib29sZWFuIHtcblx0cmV0dXJuIHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKHVyaSkgIT09IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBCdWlsZHMgdGhlIHN0cmluZyBwcmVmaXggdXNlZCBieSB0aGUgc3RhdGUgbWFuYWdlciBmb3IgY2FjaGVkIHN1YmFnZW50IHNlc3Npb25zLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRTdWJhZ2VudFNlc3Npb25VcmlQcmVmaXgocGFyZW50U2Vzc2lvbjogUHJvdG9jb2xVUkkgfCBSZXNvdXJjZVVSSSk6IHN0cmluZyB7XG5cdGNvbnN0IHsgcGFyZW50LCBwYXRoIH0gPSBnZXRTdWJhZ2VudEJhc2VQYXRoKHBhcmVudFNlc3Npb24pO1xuXHRyZXR1cm4gcGFyZW50LndpdGgoeyBwYXRoIH0pLnRvU3RyaW5nKCk7XG59XG5cbi8vIC0tLS0gRmFjdG9yeSBoZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSb290U3RhdGUoKTogUm9vdFN0YXRlIHtcblx0cmV0dXJuIHtcblx0XHRhZ2VudHM6IFtdLFxuXHRcdGFjdGl2ZVNlc3Npb25zOiAwLFxuXHR9O1xufVxuXG4vKipcbiAqIENyZWF0ZXMgdGhlIGluaXRpYWwgZmxhdCB7QGxpbmsgU2Vzc2lvblN0YXRlfSBmb3IgYSBzZXNzaW9uIGZyb20gaXRzXG4gKiByb290LWNoYW5uZWwge0BsaW5rIFNlc3Npb25TdW1tYXJ5fSBjYXRhbG9nIGVudHJ5LiBTZXNzaW9uIG1ldGFkYXRhXG4gKiAoe0BsaW5rIFNlc3Npb25NZXRhZGF0YX0pIFx1MjAxNCBhbmQgdGhlIHNoYXJlZCBgX21ldGFgIGJhZyBcdTIwMTQgYXJlIGlubGluZWQgZGlyZWN0bHlcbiAqIG9udG8gdGhlIHN0YXRlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlU2Vzc2lvblN0YXRlKHN1bW1hcnk6IFNlc3Npb25TdW1tYXJ5KTogU2Vzc2lvblN0YXRlIHtcblx0Y29uc3Qgc3RhdGU6IFNlc3Npb25TdGF0ZSA9IHtcblx0XHRwcm92aWRlcjogc3VtbWFyeS5wcm92aWRlcixcblx0XHR0aXRsZTogc3VtbWFyeS50aXRsZSxcblx0XHRzdGF0dXM6IHN1bW1hcnkuc3RhdHVzLFxuXHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5DcmVhdGluZyxcblx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRjaGF0czogW10sXG5cdFx0ZGVmYXVsdENoYXQ6IHVuZGVmaW5lZCxcblx0fTtcblx0aWYgKHN1bW1hcnkuYWN0aXZpdHkgIT09IHVuZGVmaW5lZCkgeyBzdGF0ZS5hY3Rpdml0eSA9IHN1bW1hcnkuYWN0aXZpdHk7IH1cblx0aWYgKHN1bW1hcnkucHJvamVjdCAhPT0gdW5kZWZpbmVkKSB7IHN0YXRlLnByb2plY3QgPSBzdW1tYXJ5LnByb2plY3Q7IH1cblx0aWYgKHN1bW1hcnkud29ya2luZ0RpcmVjdG9yaWVzICE9PSB1bmRlZmluZWQpIHsgc3RhdGUud29ya2luZ0RpcmVjdG9yaWVzID0gc3VtbWFyeS53b3JraW5nRGlyZWN0b3JpZXM7IH1cblx0aWYgKHN1bW1hcnkuYW5ub3RhdGlvbnMgIT09IHVuZGVmaW5lZCkgeyBzdGF0ZS5hbm5vdGF0aW9ucyA9IHN1bW1hcnkuYW5ub3RhdGlvbnM7IH1cblx0aWYgKHN1bW1hcnkuX21ldGEgIT09IHVuZGVmaW5lZCkgeyBzdGF0ZS5fbWV0YSA9IHN1bW1hcnkuX21ldGE7IH1cblx0cmV0dXJuIHN0YXRlO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYW4gZW1wdHkge0BsaW5rIENoYXRTdGF0ZX0gZm9yIGEgY2hhdC4gVGhlIHN1bW1hcnkgZmllbGRzIGFyZVxuICogZGVub3JtYWxpemVkIG9udG8gdGhlIGNoYXQgc3RhdGUgcGVyIHRoZSBwcm90b2NvbCBjb250cmFjdDsgY2FsbGVycyBwYXNzXG4gKiB0aGUgY2hhdCdzIGNhdGFsb2cgc3VtbWFyeSBhbmQgdGhpcyBzZWVkcyBhbiBlbXB0eSBjb252ZXJzYXRpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVDaGF0U3RhdGUoc3VtbWFyeTogQ2hhdFN1bW1hcnkpOiBDaGF0U3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdHJlc291cmNlOiBzdW1tYXJ5LnJlc291cmNlLFxuXHRcdHRpdGxlOiBzdW1tYXJ5LnRpdGxlLFxuXHRcdHN0YXR1czogc3VtbWFyeS5zdGF0dXMsXG5cdFx0YWN0aXZpdHk6IHN1bW1hcnkuYWN0aXZpdHksXG5cdFx0bW9kaWZpZWRBdDogc3VtbWFyeS5tb2RpZmllZEF0LFxuXHRcdG9yaWdpbjogc3VtbWFyeS5vcmlnaW4sXG5cdFx0aW50ZXJhY3Rpdml0eTogc3VtbWFyeS5pbnRlcmFjdGl2aXR5LFxuXHRcdHdvcmtpbmdEaXJlY3Rvcmllczogc3VtbWFyeS53b3JraW5nRGlyZWN0b3JpZXMsXG5cdFx0dHVybnM6IFtdLFxuXHRcdGFjdGl2ZVR1cm46IHVuZGVmaW5lZCxcblx0fTtcbn1cblxuLyoqXG4gKiBEZXJpdmVzIHRoZSBkZWZhdWx0LWNoYXQge0BsaW5rIENoYXRTdW1tYXJ5fSBmb3IgYSBzZXNzaW9uIGZyb20gaXRzXG4gKiB7QGxpbmsgU2Vzc2lvblN1bW1hcnl9LiBUaGUgZGVmYXVsdCBjaGF0IGluaGVyaXRzIHRoZSBzZXNzaW9uJ3MgdGl0bGUsXG4gKiBzdGF0dXMsIGFjdGl2aXR5IGFuZCB3b3JraW5nIGRpcmVjdG9yeSwgYW5kIGlzIG1hcmtlZCBhcyBhXG4gKiB7QGxpbmsgQ2hhdE9yaWdpbktpbmQuVXNlciB8IHVzZXItb3JpZ2luYXRlZH0gY2hhdC4gQm90aCB0aGUgc2Vzc2lvbiBhbmRcbiAqIGNoYXQgYG1vZGlmaWVkQXRgIGFyZSBJU08tODYwMSBzdHJpbmdzLCBzbyBpdCBpcyBjYXJyaWVkIG92ZXIgZGlyZWN0bHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVEZWZhdWx0Q2hhdFN1bW1hcnkoc2Vzc2lvbjogU2Vzc2lvblN1bW1hcnksIGNoYXRVcmk6IFByb3RvY29sVVJJKTogQ2hhdFN1bW1hcnkge1xuXHRjb25zdCBzdW1tYXJ5OiBDaGF0U3VtbWFyeSA9IHtcblx0XHRyZXNvdXJjZTogY2hhdFVyaSxcblx0XHR0aXRsZTogc2Vzc2lvbi50aXRsZSxcblx0XHRzdGF0dXM6IHNlc3Npb24uc3RhdHVzLFxuXHRcdG1vZGlmaWVkQXQ6IHNlc3Npb24ubW9kaWZpZWRBdCxcblx0XHRvcmlnaW46IHsga2luZDogQ2hhdE9yaWdpbktpbmQuVXNlciB9LFxuXHR9O1xuXHRpZiAoc2Vzc2lvbi5hY3Rpdml0eSAhPT0gdW5kZWZpbmVkKSB7IHN1bW1hcnkuYWN0aXZpdHkgPSBzZXNzaW9uLmFjdGl2aXR5OyB9XG5cdC8vIGB3b3JraW5nRGlyZWN0b3JpZXNgIGlzIGRlbGliZXJhdGVseSBOT1QgY29waWVkOiBwZXIgdGhlIHByb3RvY29sIGl0IGlzIGFcblx0Ly8gcGVyLWNoYXQgU1VCU0VUIG92ZXJyaWRlIGFuZCwgd2hlbiBhYnNlbnQsIHRoZSBjaGF0IGluaGVyaXRzIHRoZSBzZXNzaW9uJ3Ncblx0Ly8gZnVsbCBzZXQgb2Ygd29ya2luZyBkaXJlY3RvcmllcyAoc2VlIGBtZXJnZVNlc3Npb25XaXRoRGVmYXVsdENoYXRgKS5cblx0Ly8gU2VlZGluZyBpdCBoZXJlIHdvdWxkIGRlbm9ybWFsaXplIHRoZSBzZXNzaW9uIGRlZmF1bHQgb250byBldmVyeSBjaGF0IGFzIGFcblx0Ly8gZmFrZSBvdmVycmlkZSwgd2hpY2ggdGhlbiBnb2VzIHN0YWxlIHdoZW4gdGhlIHNlc3Npb24ncyB3b3JraW5nXG5cdC8vIGRpcmVjdG9yaWVzIGFyZSByZXNvbHZlZCBsYXRlciAoZS5nLiBhIHdvcmt0cmVlIHJlc29sdmVkIGF0XG5cdC8vIG1hdGVyaWFsaXphdGlvbikuXG5cdHJldHVybiBzdW1tYXJ5O1xufVxuXG4vKiogQWN0aXZpdHkgYml0cyAoMC00KSBvZiB7QGxpbmsgU2Vzc2lvblN0YXR1c307IHRoZSBoaWdoIGJpdHMgY2Fycnkgb3J0aG9nb25hbCBmbGFncyAoSXNSZWFkIC8gSXNBcmNoaXZlZCkuICovXG5jb25zdCBTVEFUVVNfQUNUSVZJVFlfTUFTSyA9ICgxIDw8IDUpIC0gMTtcblxuLyoqIFdoZXRoZXIgdGhlIGFjdGl2ZSB0dXJuIGhhcyBhIGBQZW5kaW5nQ29uZmlybWF0aW9uYCB0b29sIGNhbGwgYXV0by1hcHByb3ZlZCBieSB0aGUgc2Vzc2lvbidzIGJ5cGFzcyBzZXR0aW5nLiAqL1xuZnVuY3Rpb24gaGFzQXV0b0FwcHJvdmVkUGVuZGluZ0NvbmZpcm1hdGlvbihzdGF0ZTogQ2hhdFN0YXRlKTogYm9vbGVhbiB7XG5cdHJldHVybiAhIXN0YXRlLmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuc29tZShwYXJ0ID0+XG5cdFx0cGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsXG5cdFx0JiYgcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb25cblx0XHQmJiByZWFkVG9vbENhbGxNZXRhKHBhcnQudG9vbENhbGwpLmF1dG9BcHByb3ZlQnlTZXR0aW5nID09PSB0cnVlLFxuXHQpO1xufVxuXG4vKiogV2hldGhlciB0aGUgY2hhdCBpcyBnZW51aW5lbHkgYmxvY2tlZCBvbiB1c2VyIGlucHV0IChhbiBvcGVuIGlucHV0IHJlcXVlc3QsIGFuIGF1dGgtcmVxdWlyZWQgdG9vbCwgb3IgYSBub24tYXV0by1hcHByb3ZlZCBjb25maXJtYXRpb24gZ2F0ZSkuICovXG5mdW5jdGlvbiBjaGF0QXdhaXRzVXNlcklucHV0KHN0YXRlOiBDaGF0U3RhdGUpOiBib29sZWFuIHtcblx0cmV0dXJuICEhc3RhdGUuYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5zb21lKHBhcnQgPT4ge1xuXHRcdC8vIEFuIG9wZW4gZWxpY2l0YXRpb24gYWx3YXlzIGF3YWl0cyB0aGUgdXNlciB1bnRpbCBpdCBpcyBhbnN3ZXJlZC5cblx0XHRpZiAocGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLklucHV0UmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuIHBhcnQucmVzcG9uc2UgPT09IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHBhcnQua2luZCAhPT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBzdGF0dXMgPSBwYXJ0LnRvb2xDYWxsLnN0YXR1cztcblx0XHQvLyBSZXN1bHQtY29uZmlybWF0aW9uIGFuZCBhdXRoLXJlcXVpcmVkIGdhdGVzIGFsd2F5cyByZXF1aXJlIHRoZSB1c2VyOyBhXG5cdFx0Ly8gcGFyYW1ldGVyLWNvbmZpcm1hdGlvbiBnYXRlIG9ubHkgd2hlbiBpdCB3YXMgbm90IGF1dG8tYXBwcm92ZWQuXG5cdFx0aWYgKHN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ1Jlc3VsdENvbmZpcm1hdGlvbiB8fCBzdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkF1dGhSZXF1aXJlZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBzdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb25cblx0XHRcdCYmIHJlYWRUb29sQ2FsbE1ldGEocGFydC50b29sQ2FsbCkuYXV0b0FwcHJvdmVCeVNldHRpbmcgIT09IHRydWU7XG5cdH0pO1xufVxuXG4vKipcbiAqIFByb2plY3RzIGEgY2hhdCdzIHN0YXR1cyBmb3Igc2Vzc2lvbi1zdW1tYXJ5IGFnZ3JlZ2F0aW9uLCBkZW1vdGluZyBhblxuICogYElucHV0TmVlZGVkYCBiYWNrIHRvIGBJblByb2dyZXNzYCBvbmx5IHdoZW4gaXQgaXMgY2F1c2VkIHNvbGVseSBieSBhblxuICogYXV0by1hcHByb3ZlZCBjb25maXJtYXRpb24gXHUyMDE0IG90aGVyd2lzZSBhIHNlc3Npb24gd2l0aCBieXBhc3MgYXBwcm92YWxzIGZsYXNoZXNcbiAqIFwiaW5wdXQgbmVlZGVkXCIgaW4gdGhlIHNlc3Npb25zIGxpc3Qgd2hpbGUgYW4gYXV0by1hcHByb3ZlZCB0b29sIHJ1bnMuXG4gKi9cbmZ1bmN0aW9uIGNoYXRTdW1tYXJ5U3RhdHVzKHN0YXRlOiBDaGF0U3RhdGUpOiBTZXNzaW9uU3RhdHVzIHtcblx0Y29uc3Qgc3RhdHVzID0gc3RhdGUuc3RhdHVzO1xuXHRpZiAoKHN0YXR1cyAmIFNlc3Npb25TdGF0dXMuSW5wdXROZWVkZWQpICE9PSBTZXNzaW9uU3RhdHVzLklucHV0TmVlZGVkKSB7XG5cdFx0cmV0dXJuIHN0YXR1cztcblx0fVxuXHQvLyBPbmx5IGRlbW90ZSB3aGVuIHdlIGNhbiBwb3NpdGl2ZWx5IGF0dHJpYnV0ZSB0aGUgSW5wdXROZWVkZWQgdG8gYW5cblx0Ly8gYXV0by1hcHByb3ZlZCBjb25maXJtYXRpb24gd2l0aCBubyBnZW51aW5lIGJsb2NrZXIgcHJlc2VudDsgb3RoZXJ3aXNlIChlLmcuXG5cdC8vIGEgcmVzdG9yZWQgc3VtbWFyeSB3aG9zZSBhY3RpdmVUdXJuIGlzIG5vdCBsb2FkZWQpIHByZXNlcnZlIHRoZSBzdGF0dXMuXG5cdGlmIChoYXNBdXRvQXBwcm92ZWRQZW5kaW5nQ29uZmlybWF0aW9uKHN0YXRlKSAmJiAhY2hhdEF3YWl0c1VzZXJJbnB1dChzdGF0ZSkpIHtcblx0XHRyZXR1cm4gKHN0YXR1cyAmIH5TVEFUVVNfQUNUSVZJVFlfTUFTSykgfCBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3M7XG5cdH1cblx0cmV0dXJuIHN0YXR1cztcbn1cblxuLyoqXG4gKiBEZXJpdmVzIGEge0BsaW5rIENoYXRTdW1tYXJ5fSBmcm9tIGEgZnVsbHktcG9wdWxhdGVkIHtAbGluayBDaGF0U3RhdGV9IGJ5XG4gKiBwcm9qZWN0aW5nIG91dCB0aGUgZGVub3JtYWxpemVkIHN1bW1hcnkgZmllbGRzLiBVc2VkIHRvIGtlZXAgdGhlIHBhcmVudFxuICogc2Vzc2lvbidzIGBjaGF0c2AgY2F0YWxvZyBpbiBzeW5jIHdpdGggYSBjaGF0J3MgZGVub3JtYWxpemVkIHN0YXRlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2hhdFN1bW1hcnlGcm9tU3RhdGUoc3RhdGU6IENoYXRTdGF0ZSk6IENoYXRTdW1tYXJ5IHtcblx0Y29uc3Qgc3VtbWFyeTogQ2hhdFN1bW1hcnkgPSB7XG5cdFx0cmVzb3VyY2U6IHN0YXRlLnJlc291cmNlLFxuXHRcdHRpdGxlOiBzdGF0ZS50aXRsZSxcblx0XHRzdGF0dXM6IGNoYXRTdW1tYXJ5U3RhdHVzKHN0YXRlKSxcblx0XHRtb2RpZmllZEF0OiBzdGF0ZS5tb2RpZmllZEF0LFxuXHR9O1xuXHRpZiAoc3RhdGUuYWN0aXZpdHkgIT09IHVuZGVmaW5lZCkgeyBzdW1tYXJ5LmFjdGl2aXR5ID0gc3RhdGUuYWN0aXZpdHk7IH1cblx0aWYgKHN0YXRlLm9yaWdpbiAhPT0gdW5kZWZpbmVkKSB7IHN1bW1hcnkub3JpZ2luID0gc3RhdGUub3JpZ2luOyB9XG5cdGlmIChzdGF0ZS5pbnRlcmFjdGl2aXR5ICE9PSB1bmRlZmluZWQpIHsgc3VtbWFyeS5pbnRlcmFjdGl2aXR5ID0gc3RhdGUuaW50ZXJhY3Rpdml0eTsgfVxuXHRpZiAoc3RhdGUud29ya2luZ0RpcmVjdG9yaWVzICE9PSB1bmRlZmluZWQpIHsgc3VtbWFyeS53b3JraW5nRGlyZWN0b3JpZXMgPSBzdGF0ZS53b3JraW5nRGlyZWN0b3JpZXM7IH1cblx0cmV0dXJuIHN1bW1hcnk7XG59XG5cbi8qKlxuICogVGhlIGVmZmVjdGl2ZSBpbnRlcmFjdGl2aXR5IG9mIGEgY2hhdCBnaXZlbiBpdHMgc2Vzc2lvbidzIGFyY2hpdmVkIHN0YXRlLlxuICpcbiAqIGBpbnRlcmFjdGl2aXR5YCBpcyB0aGUgZ2VuZXJhbCByZWFkLW9ubHkgbWVjaGFuaXNtIChlLmcuIHN1YmFnZW50IHdvcmtlclxuICogY2hhdHMgYXJlIGBSZWFkT25seWApLiBBbiBhcmNoaXZlZCBzZXNzaW9uIGlzIHJlYWQtb25seSB0b28sIHNvIGl0c1xuICogaW50ZXJhY3RpdmUgY2hhdHMgYXJlIGRvd25ncmFkZWQgdG8gYFJlYWRPbmx5YC4gYEhpZGRlbmAgY2hhdHMgc3RheSBoaWRkZW4gXHUyMDE0XG4gKiBhcmNoaXZpbmcgb25seSBkb3duZ3JhZGVzIGBGdWxsYCBjaGF0cy4gQWJzZW50IGludGVyYWN0aXZpdHkgZGVmYXVsdHMgdG9cbiAqIGBGdWxsYCBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eS5cbiAqXG4gKiBUaGUgaG9zdCB1c2VzIHRoaXMgdG8gZW5mb3JjZSByZWFkLW9ubHkgdHVybnMgb2ZmIGEgc2luZ2xlIHNpZ25hbFxuICogKHtAbGluayBpc0NoYXRSZWFkT25seX0pIHJhdGhlciB0aGFuIHNwZWNpYWwtY2FzaW5nIGFyY2hpdmVkOyB0aGUgc2FtZSBydWxlXG4gKiBpcyBtaXJyb3JlZCBjbGllbnQtc2lkZSB0byBoaWRlIHRoZSBjb21wb3Nlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVmZmVjdGl2ZUNoYXRJbnRlcmFjdGl2aXR5KGludGVyYWN0aXZpdHk6IENoYXRJbnRlcmFjdGl2aXR5IHwgdW5kZWZpbmVkLCBzZXNzaW9uQXJjaGl2ZWQ6IGJvb2xlYW4pOiBDaGF0SW50ZXJhY3Rpdml0eSB7XG5cdGlmIChpbnRlcmFjdGl2aXR5ID09PSBDaGF0SW50ZXJhY3Rpdml0eS5IaWRkZW4pIHtcblx0XHRyZXR1cm4gQ2hhdEludGVyYWN0aXZpdHkuSGlkZGVuO1xuXHR9XG5cdGlmIChzZXNzaW9uQXJjaGl2ZWQpIHtcblx0XHRyZXR1cm4gQ2hhdEludGVyYWN0aXZpdHkuUmVhZE9ubHk7XG5cdH1cblx0cmV0dXJuIGludGVyYWN0aXZpdHkgPz8gQ2hhdEludGVyYWN0aXZpdHkuRnVsbDtcbn1cblxuLyoqXG4gKiBXaGV0aGVyIGEgY2hhdCByZWplY3RzIHVzZXItZGlzcGF0Y2hlZCB0dXJucywgZ2l2ZW4gaXRzIG93biBpbnRlcmFjdGl2aXR5IGFuZFxuICogaXRzIHNlc3Npb24ncyBhcmNoaXZlZCBzdGF0ZS4gYHRydWVgIGZvciBgUmVhZE9ubHlgIGNoYXRzIChpbmNsdWRpbmcgYXJjaGl2ZWRcbiAqIHNlc3Npb25zJyBpbnRlcmFjdGl2ZSBjaGF0cykuIFNlZSB7QGxpbmsgZWZmZWN0aXZlQ2hhdEludGVyYWN0aXZpdHl9LlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNDaGF0UmVhZE9ubHkoaW50ZXJhY3Rpdml0eTogQ2hhdEludGVyYWN0aXZpdHkgfCB1bmRlZmluZWQsIHNlc3Npb25BcmNoaXZlZDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZWZmZWN0aXZlQ2hhdEludGVyYWN0aXZpdHkoaW50ZXJhY3Rpdml0eSwgc2Vzc2lvbkFyY2hpdmVkKSA9PT0gQ2hhdEludGVyYWN0aXZpdHkuUmVhZE9ubHk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBY3RpdmVUdXJuKGlkOiBzdHJpbmcsIG1lc3NhZ2U6IE1lc3NhZ2UsIHN0YXJ0ZWRBdDogc3RyaW5nKTogQWN0aXZlVHVybiB7XG5cdHJldHVybiB7XG5cdFx0aWQsXG5cdFx0c3RhcnRlZEF0LFxuXHRcdG1lc3NhZ2UsXG5cdFx0cmVzcG9uc2VQYXJ0czogW10sXG5cdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0fTtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gU3RhdGVDb21wb25lbnRzIHtcblx0Um9vdCxcblx0U2Vzc2lvbixcblx0Q2hhdCxcblx0VGVybWluYWwsXG5cdENoYW5nZXNldCxcblx0QW5ub3RhdGlvbnMsXG59XG5cbmV4cG9ydCB0eXBlIENvbXBvbmVudFRvU3RhdGUgPSB7XG5cdFtTdGF0ZUNvbXBvbmVudHMuUm9vdF06IFJvb3RTdGF0ZTtcblx0W1N0YXRlQ29tcG9uZW50cy5TZXNzaW9uXTogU2Vzc2lvblN0YXRlO1xuXHRbU3RhdGVDb21wb25lbnRzLkNoYXRdOiBDaGF0U3RhdGU7XG5cdFtTdGF0ZUNvbXBvbmVudHMuVGVybWluYWxdOiBUZXJtaW5hbFN0YXRlO1xuXHRbU3RhdGVDb21wb25lbnRzLkNoYW5nZXNldF06IENoYW5nZXNldFN0YXRlO1xuXHRbU3RhdGVDb21wb25lbnRzLkFubm90YXRpb25zXTogQW5ub3RhdGlvbnNTdGF0ZTtcbn07XG5cbi8vIC0tLS0gRGVmYXVsdCBjaGF0IFVSSSBoZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqIFNjaGVtZSB1c2VkIGJ5IGNoYXQgY2hhbm5lbCBVUklzIChgYWhwLWNoYXQ6Ly8uLi5gKS4gKi9cbmV4cG9ydCBjb25zdCBBSFBfQ0hBVF9TQ0hFTUUgPSAnYWhwLWNoYXQnO1xuXG4vKiogQ2hhdCBpZCBvZiB0aGUgZGVmYXVsdCBjaGF0IHRoYXQgZXZlcnkgc2Vzc2lvbiBvd25zLiAqL1xuZXhwb3J0IGNvbnN0IERFRkFVTFRfQ0hBVF9JRCA9ICdkZWZhdWx0JztcblxuLyoqXG4gKiBEZXJpdmVzIHRoZSBkZXRlcm1pbmlzdGljIGNoYW5uZWwgVVJJIGZvciBhIGNoYXQgd2l0aGluIGEgc2Vzc2lvbi4gRXZlcnkgY2hhdFxuICogXHUyMDE0IHRoZSBkZWZhdWx0IGNoYXQgYW5kIGFueSBhZGRpdGlvbmFsIHBlZXIgY2hhdHMgXHUyMDE0IGVuY29kZXMgaXRzIG93bmluZyBzZXNzaW9uXG4gKiBVUkkgaW50byB0aGUgcGF0aCBzbyBwcm9kdWNlcnMgYW5kIGNvbnN1bWVycyBjYW4gcmVjb3ZlciB0aGUgc2Vzc2lvbiB3aXRob3V0IGFcbiAqIGxvb2t1cCB0YWJsZSAoc2VlIHtAbGluayBwYXJzZUNoYXRVcml9KS4gVGhlIGNoYXQgaWQgaXMgY2FycmllZCBpbiB0aGUgVVJJXG4gKiBhdXRob3JpdHkuXG4gKlxuICogYGFocC1jaGF0Oi8vPGNoYXRJZD4vPGJhc2U2NChzZXNzaW9uVXJpKT5gXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZENoYXRVcmkoc2Vzc2lvblVyaTogUHJvdG9jb2xVUkkgfCBSZXNvdXJjZVVSSSwgY2hhdElkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBzZXNzaW9uID0gdHlwZW9mIHNlc3Npb25VcmkgPT09ICdzdHJpbmcnID8gc2Vzc2lvblVyaSA6IHNlc3Npb25VcmkudG9TdHJpbmcoKTtcblx0Y29uc3QgZW5jb2RlZCA9IGVuY29kZUJhc2U2NChWU0J1ZmZlci5mcm9tU3RyaW5nKHNlc3Npb24pLCBmYWxzZSwgdHJ1ZSk7XG5cdHJldHVybiBgJHtBSFBfQ0hBVF9TQ0hFTUV9Oi8vJHtjaGF0SWR9LyR7ZW5jb2RlZH1gO1xufVxuXG4vKipcbiAqIERlcml2ZXMgdGhlIGRldGVybWluaXN0aWMgZGVmYXVsdC1jaGF0IGNoYW5uZWwgVVJJIGZvciBhIHNlc3Npb24uIFdoaWxlIHRoZVxuICogcHJvdG9jb2wgYWxsb3dzIGEgc2Vzc2lvbiB0byBjb250YWluIG1hbnkgY2hhdHMsIGV2ZXJ5IHNlc3Npb24gYWx3YXlzIG93bnMgYVxuICogZGVmYXVsdCBjaGF0IHdob3NlIFVSSSBpcyBkZXJpdmVkIGZyb20gdGhlIG93bmluZyBzZXNzaW9uIFVSSSBzbyBwcm9kdWNlcnMgYW5kXG4gKiBjb25zdW1lcnMgY2FuIGNvbXB1dGUgaXQgd2l0aG91dCBhIGxvb2t1cCB0YWJsZS5cbiAqXG4gKiBUaGUgc2Vzc2lvbiBVUkkgaXMgZW5jb2RlZCBpbnRvIHRoZSBwYXRoIHNvIHtAbGluayBwYXJzZUNoYXRVcml9IGNhbiByZWNvdmVyXG4gKiBpdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaTogUHJvdG9jb2xVUkkgfCBSZXNvdXJjZVVSSSk6IHN0cmluZyB7XG5cdHJldHVybiBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgREVGQVVMVF9DSEFUX0lEKTtcbn1cblxuY29uc3QgU1VCQUdFTlRfQ0hBVF9JRCA9ICdzdWJhZ2VudCc7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N1YmFnZW50Q2hhdFVyaSh1cmk6IFByb3RvY29sVVJJIHwgUmVzb3VyY2VVUkkpOiBib29sZWFuIHtcblx0Y29uc3QgcGFyc2VkID0gdHlwZW9mIHVyaSA9PT0gJ3N0cmluZycgPyBSZXNvdXJjZVVSSS5wYXJzZSh1cmkpIDogdXJpO1xuXHRyZXR1cm4gcGFyc2VkLnNjaGVtZSA9PT0gQUhQX0NIQVRfU0NIRU1FICYmIHBhcnNlZC5hdXRob3JpdHkgPT09IFNVQkFHRU5UX0NIQVRfSUQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpOiBQcm90b2NvbFVSSSB8IFJlc291cmNlVVJJLCB0b29sQ2FsbElkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBzZXNzaW9uID0gdHlwZW9mIHNlc3Npb25VcmkgPT09ICdzdHJpbmcnID8gc2Vzc2lvblVyaSA6IHNlc3Npb25VcmkudG9TdHJpbmcoKTtcblx0Y29uc3QgZW5jb2RlZCA9IGVuY29kZUJhc2U2NChWU0J1ZmZlci5mcm9tU3RyaW5nKHNlc3Npb24pLCBmYWxzZSwgdHJ1ZSk7XG5cdHJldHVybiBgJHtBSFBfQ0hBVF9TQ0hFTUV9Oi8vJHtTVUJBR0VOVF9DSEFUX0lEfS8ke2VuY29kZWR9LyR7ZW5jb2RlVVJJQ29tcG9uZW50KHRvb2xDYWxsSWQpfWA7XG59XG5cbi8qKlxuICogSW52ZXJzZSBvZiB7QGxpbmsgYnVpbGRDaGF0VXJpfTogcmVjb3ZlcnMgdGhlIG93bmluZyBzZXNzaW9uIFVSSSBhbmQgY2hhdCBpZFxuICogZnJvbSBhbnkgY2hhdCBjaGFubmVsIFVSSS4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIGB1cmlgIGlzIG5vdCBhIHdlbGwtZm9ybWVkXG4gKiBjaGF0IFVSSS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQ2hhdFVyaSh1cmk6IFByb3RvY29sVVJJIHwgUmVzb3VyY2VVUkkpOiB7IHNlc3Npb246IHN0cmluZzsgY2hhdElkOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdGxldCBwYXJzZWQ6IFJlc291cmNlVVJJO1xuXHR0cnkge1xuXHRcdHBhcnNlZCA9IHR5cGVvZiB1cmkgPT09ICdzdHJpbmcnID8gUmVzb3VyY2VVUkkucGFyc2UodXJpKSA6IHVyaTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAocGFyc2VkLnNjaGVtZSAhPT0gQUhQX0NIQVRfU0NIRU1FIHx8ICFwYXJzZWQuYXV0aG9yaXR5KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBlbmNvZGVkID0gcGFyc2VkLnBhdGgucmVwbGFjZSgvXlxcLy8sICcnKTtcblx0aWYgKCFlbmNvZGVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHR0cnkge1xuXHRcdGlmIChwYXJzZWQuYXV0aG9yaXR5ID09PSBTVUJBR0VOVF9DSEFUX0lEKSB7XG5cdFx0XHRjb25zdCBbc2Vzc2lvblBhcnQsIC4uLnRvb2xDYWxsSWRQYXJ0c10gPSBlbmNvZGVkLnNwbGl0KCcvJyk7XG5cdFx0XHRjb25zdCB0b29sQ2FsbElkID0gdG9vbENhbGxJZFBhcnRzLmpvaW4oJy8nKTtcblx0XHRcdGlmICghc2Vzc2lvblBhcnQgfHwgIXRvb2xDYWxsSWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHNlc3Npb246IGRlY29kZUJhc2U2NChzZXNzaW9uUGFydCkudG9TdHJpbmcoKSwgY2hhdElkOiBgJHtTVUJBR0VOVF9DSEFUX0lEfS8ke2RlY29kZVVSSUNvbXBvbmVudCh0b29sQ2FsbElkKX1gIH07XG5cdFx0fVxuXHRcdHJldHVybiB7IHNlc3Npb246IGRlY29kZUJhc2U2NChlbmNvZGVkKS50b1N0cmluZygpLCBjaGF0SWQ6IHBhcnNlZC5hdXRob3JpdHkgfTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIEludmVyc2Ugb2Yge0BsaW5rIGJ1aWxkRGVmYXVsdENoYXRVcml9OiByZWNvdmVycyB0aGUgb3duaW5nIHNlc3Npb24gVVJJIGZyb20gYVxuICogY2hhdCBjaGFubmVsIFVSSS4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIGB1cmlgIGlzIG5vdCBhIHdlbGwtZm9ybWVkIGNoYXQgVVJJLlxuICogQWNjZXB0cyBhbnkgY2hhdCBVUkkgKGRlZmF1bHQgb3IgYWRkaXRpb25hbCkgc28gY2FsbGVycyB0aGF0IG9ubHkgbmVlZCB0aGVcbiAqIHBhcmVudCBzZXNzaW9uIGNhbiB1c2UgaXQgdW5pZm9ybWx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VEZWZhdWx0Q2hhdFVyaSh1cmk6IFByb3RvY29sVVJJIHwgUmVzb3VyY2VVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gcGFyc2VDaGF0VXJpKHVyaSk/LnNlc3Npb247XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKHVyaTogUHJvdG9jb2xVUkkgfCBSZXNvdXJjZVVSSSk6IHN0cmluZyB7XG5cdGNvbnN0IHNlc3Npb24gPSBwYXJzZURlZmF1bHRDaGF0VXJpKHVyaSk7XG5cdGlmIChzZXNzaW9uID09PSB1bmRlZmluZWQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYE1hbGZvcm1lZCBBSFAgY2hhdCBVUkk6ICR7dHlwZW9mIHVyaSA9PT0gJ3N0cmluZycgPyB1cmkgOiB1cmkudG9TdHJpbmcoKX1gKTtcblx0fVxuXHRyZXR1cm4gc2Vzc2lvbjtcbn1cblxuLyoqIFJldHVybnMgYHRydWVgIHdoZW4gYHVyaWAgaXMgdGhlIGRlZmF1bHQgY2hhdCBvZiBpdHMgc2Vzc2lvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0RlZmF1bHRDaGF0VXJpKHVyaTogUHJvdG9jb2xVUkkgfCBSZXNvdXJjZVVSSSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcGFyc2VDaGF0VXJpKHVyaSk/LmNoYXRJZCA9PT0gREVGQVVMVF9DSEFUX0lEO1xufVxuXG4vKipcbiAqIFJlc29sdmVzIGEgZmVhdHVyZS1sZXZlbCBgKHNlc3Npb24sIGNoYXQpYCBwYWlyIHRvIHRoZSBzaW5nbGUgY2hhdCBVUkkgdXNlZCBieVxuICogdGhlIGFnZW50IHNlc3Npb24vY2hhdCBzdXJmYWNlLiBBIHNlc3Npb24gYWx3YXlzIG93bnMgYSBERUZBVUxUIGNoYXQgYWRkcmVzc2VkXG4gKiBieSB0aGUgc2Vzc2lvbiBVUkkgaXRzZWxmOyBhZGRpdGlvbmFsIChwZWVyKSBjaGF0cyBhcmUgYWRkcmVzc2VkIGJ5IHRoZWlyIG93blxuICogY2hhdCBjaGFubmVsIFVSSXMuIFRoaXMgaXMgdGhlIG9uZSBwbGFjZSBkZWZhdWx0LWNoYXQgcmVzb2x1dGlvbiBsaXZlcyBzb1xuICogYWdlbnRzIG5ldmVyIHJlLWRlcml2ZSBcImlzIHRoaXMgdGhlIGRlZmF1bHQgY2hhdD9cIi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVDaGF0VXJpKHNlc3Npb246IFJlc291cmNlVVJJLCBjaGF0OiBSZXNvdXJjZVVSSSk6IFJlc291cmNlVVJJIHtcblx0cmV0dXJuIGlzRGVmYXVsdENoYXRVcmkoY2hhdCkgPyBzZXNzaW9uIDogY2hhdDtcbn1cblxuLyoqXG4gKiBSZXNvbHZlcyB0aGUgVVJJIGEgY2hhdCdzIHBlcnNpc3RlZCBkYXRhIGlzIHN0b3JlZCB1bmRlciBcdTIwMTQgdGhlIHNhbWVcbiAqIHtAbGluayByZXNvbHZlQ2hhdFVyaX0gcnVsZSBhcHBsaWVkIHRvIGEgY2hhdCBjaGFubmVsIFVSSSBhbG9uZSwgcmVjb3ZlcmluZ1xuICogdGhlIG93bmluZyBzZXNzaW9uIGZyb20gdGhlIGNoYW5uZWwuIEFnZW50cyBrZXkgdGhlaXIgcGVyLXNlc3Npb24gZGF0YWJhc2VcbiAqIGFuZCBkYXRhIGRpcmVjdG9yeSBieSB0aGlzIHZhbHVlLCBzbyBhbnl0aGluZyByZWFkaW5nIG9yIHdyaXRpbmcgdGhhdCBzdG9yYWdlXG4gKiBmcm9tIG91dHNpZGUgdGhlIGFnZW50IG11c3QgZGVyaXZlIGl0IHRoZSBzYW1lIHdheS4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuXG4gKiBgY2hhdENoYW5uZWxgIGlzIG5vdCBhIHBhcnNlYWJsZSBjaGF0IGNoYW5uZWwgVVJJLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2hhdFN0b3JhZ2VVcmkoY2hhdENoYW5uZWw6IFByb3RvY29sVVJJIHwgUmVzb3VyY2VVUkkpOiBSZXNvdXJjZVVSSSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ2hhdFVyaShjaGF0Q2hhbm5lbCk7XG5cdGlmICghcGFyc2VkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gcmVzb2x2ZUNoYXRVcmkoUmVzb3VyY2VVUkkucGFyc2UocGFyc2VkLnNlc3Npb24pLCBSZXNvdXJjZVVSSS5wYXJzZShjaGF0Q2hhbm5lbC50b1N0cmluZygpKSk7XG59XG5cbi8qKiBSZXR1cm5zIGB0cnVlYCB3aGVuIGB1cmlgIGlkZW50aWZpZXMgYSBjaGF0IGNoYW5uZWwuICovXG5leHBvcnQgZnVuY3Rpb24gaXNBaHBDaGF0Q2hhbm5lbCh1cmk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHR0cnkge1xuXHRcdHJldHVybiBSZXNvdXJjZVVSSS5wYXJzZSh1cmkpLnNjaGVtZSA9PT0gQUhQX0NIQVRfU0NIRU1FO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuLy8gLS0tLSBTZXNzaW9uICsgZGVmYXVsdC1jaGF0IGNvbXBvc2l0ZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIEEgc2luZ2xlIGNoYXQncyBlZmZlY3RpdmUgc2Vzc2lvbiBjb250ZXh0OiB0aGUgc2hhcmVkIHtAbGluayBTZXNzaW9uU3RhdGV9XG4gKiAod29ya2luZyBkaXJlY3RvcmllcywgYWN0aXZlIGNsaWVudHMsIGNvbmZpZywgY3VzdG9taXphdGlvbnMvTUNQIHNjb3BlLCBcdTIwMjYpXG4gKiByZXNvbHZlZCBmb3Igb25lIGNoYXQgYW5kIG1lcmdlZCB3aXRoIHRoYXQgY2hhdCdzIGNvbnZlcnNhdGlvbiBjb250ZW50cy5cbiAqXG4gKiBUaGUgcHJvdG9jb2wgbW92ZWQgdHVybnMgYW5kIHBlbmRpbmcgc3RhdGUgb2ZmIHRoZSBzZXNzaW9uIGFuZCBvbnRvIGFcbiAqIHBlci1jaGF0IGNoYW5uZWwsIGFuZCBsZXRzIGEgY2hhdCBvdmVycmlkZSB0aGUgc2Vzc2lvbidzIHdvcmtpbmcgZGlyZWN0b3JpZXNcbiAqIHdpdGggYSBzdWJzZXQgKGUuZy4ge0BsaW5rIENoYXRTdGF0ZS53b3JraW5nRGlyZWN0b3JpZXN9KS4gVGhpcyBjb21wb3NpdGVcbiAqIHJlY29tYmluZXMgdGhlIHNlc3Npb24gd2l0aCBvbmUgb2YgaXRzIGNoYXRzIFx1MjAxNCBkZWZhdWx0IG9yIHBlZXIgXHUyMDE0IHNvIGNvbnN1bWVyc1xuICogcmVhZCB0aGUgY2hhdCdzIGVmZmVjdGl2ZSBjb250ZXh0IGFuZCBjb252ZXJzYXRpb24gdGhyb3VnaCBvbmUgb2JqZWN0IHdpdGhvdXRcbiAqIHdhbGtpbmcgYmFjayB0byB0aGUgc2Vzc2lvbiB0byByZS1kZXJpdmUgc2hhcmVkIHN0YXRlLiBUaGVcbiAqIHtAbGluayBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdC53b3JraW5nRGlyZWN0b3JpZXN9IGNhcnJ5IHRoZSBjaGF0J3MgKmVmZmVjdGl2ZSpcbiAqIHdvcmtpbmcgZGlyZWN0b3JpZXMgKGl0cyBvd24gc3Vic2V0IG92ZXJyaWRlIHdoZW4gcHJlc2VudCwgZWxzZSB0aGUgc2Vzc2lvbidzXG4gKiBmdWxsIHNldCkuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25XaXRoRGVmYXVsdENoYXQgZXh0ZW5kcyBTZXNzaW9uU3RhdGUge1xuXHQvKiogQ29tcGxldGVkIHR1cm5zIG9mIHRoaXMgY2hhdC4gKi9cblx0dHVybnM6IFR1cm5bXTtcblx0LyoqIEN1cnJlbnRseSBpbi1wcm9ncmVzcyB0dXJuIG9mIHRoaXMgY2hhdC4gKi9cblx0YWN0aXZlVHVybj86IEFjdGl2ZVR1cm47XG5cdC8qKiBTdGVlcmluZyBtZXNzYWdlIHBlbmRpbmcgb24gdGhpcyBjaGF0LiAqL1xuXHRzdGVlcmluZ01lc3NhZ2U/OiBQZW5kaW5nTWVzc2FnZTtcblx0LyoqIFF1ZXVlZCBtZXNzYWdlcyBwZW5kaW5nIG9uIHRoaXMgY2hhdC4gKi9cblx0cXVldWVkTWVzc2FnZXM/OiBQZW5kaW5nTWVzc2FnZVtdO1xuXHQvKiogRHJhZnQgaW5wdXQgb2YgdGhpcyBjaGF0LiAqL1xuXHRkcmFmdD86IE1lc3NhZ2U7XG59XG5cbi8qKlxuICogUHJvamVjdHMgYSB7QGxpbmsgU2Vzc2lvblN0YXRlfSBhbmQgb25lIG9mIGl0cyB7QGxpbmsgQ2hhdFN0YXRlIHwgY2hhdHN9XG4gKiAoZGVmYXVsdCBvciBwZWVyKSBpbnRvIHRoYXQgY2hhdCdzIHtAbGluayBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCB8IGVmZmVjdGl2ZVxuICogc2Vzc2lvbiBjb250ZXh0fS4gUGVyLWNoYXQgb3ZlcnJpZGVzICh0aGUgd29ya2luZy1kaXJlY3RvcmllcyBzdWJzZXQpIGFyZVxuICogbGF5ZXJlZCBvdmVyIHRoZSBzZXNzaW9uIGRlZmF1bHRzLCBhbmQgdGhlIGNvbnZlcnNhdGlvbiBmaWVsZHMgYXJlIHRha2VuIGZyb21cbiAqIHRoZSBjaGF0LiBXaGVuIHRoZSBjaGF0IHN0YXRlIGlzIGFic2VudCAoZS5nLiBub3QgeWV0IGh5ZHJhdGVkKSB0aGVcbiAqIGNvbnZlcnNhdGlvbiBmaWVsZHMgZGVmYXVsdCB0byBlbXB0eSBhbmQgdGhlIHNlc3Npb24gZGVmYXVsdHMgYXBwbHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZVNlc3Npb25XaXRoRGVmYXVsdENoYXQoc2Vzc2lvbjogU2Vzc2lvblN0YXRlLCBjaGF0OiBDaGF0U3RhdGUgfCB1bmRlZmluZWQpOiBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCB7XG5cdHJldHVybiB7XG5cdFx0Li4uc2Vzc2lvbixcblx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IGNoYXQ/LndvcmtpbmdEaXJlY3RvcmllcyA/PyBzZXNzaW9uLndvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHR0dXJuczogY2hhdD8udHVybnMgPz8gW10sXG5cdFx0YWN0aXZlVHVybjogY2hhdD8uYWN0aXZlVHVybixcblx0XHRzdGVlcmluZ01lc3NhZ2U6IGNoYXQ/LnN0ZWVyaW5nTWVzc2FnZSxcblx0XHRxdWV1ZWRNZXNzYWdlczogY2hhdD8ucXVldWVkTWVzc2FnZXMsXG5cdFx0ZHJhZnQ6IGNoYXQ/LmRyYWZ0LFxuXHR9O1xufVxuXG4vKipcbiAqIFJlc29sdmVzIHRoZSBhY3RpdmUgdHVybiBvZiBhIHNlc3Npb24ncyBkZWZhdWx0IGNoYXQsIGlmIGFueS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEFjdGl2ZVR1cm4oY2hhdDogQ2hhdFN0YXRlIHwgdW5kZWZpbmVkKTogQWN0aXZlVHVybiB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBjaGF0Py5hY3RpdmVUdXJuO1xufVxuXG4vKipcbiAqIFJlc29sdmVzIHRoZSBkZWZhdWx0IGNoYXQncyBjYXRhbG9nIHN1bW1hcnkgZnJvbSBhIHNlc3Npb24sIGlmIHByZXNlbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXREZWZhdWx0Q2hhdChzZXNzaW9uOiBTZXNzaW9uU3RhdGUpOiBDaGF0U3VtbWFyeSB8IHVuZGVmaW5lZCB7XG5cdGlmIChzZXNzaW9uLmRlZmF1bHRDaGF0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRjb25zdCBtYXRjaCA9IHNlc3Npb24uY2hhdHMuZmluZChjID0+IGMucmVzb3VyY2UgPT09IHNlc3Npb24uZGVmYXVsdENoYXQpO1xuXHRcdGlmIChtYXRjaCkge1xuXHRcdFx0cmV0dXJuIG1hdGNoO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gc2Vzc2lvbi5jaGF0c1swXTtcbn1cblxuLy8gLS0tLSBTZXNzaW9uTWV0YSBhY2Nlc3NvcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIFZTIENvZGUtc2lkZSBhbGlhcyBmb3IgdGhlIHByb3RvY29sJ3Mgb3BlbiBgX21ldGFgIHByb3BlcnR5IGJhZyBvblxuICoge0BsaW5rIFNlc3Npb25TdGF0ZX0uIEtleXMgU0hPVUxEIGJlIG5hbWVzcGFjZWQgKGUuZy4gYGdpdGAsIGB2c2NvZGUuZm9vYClcbiAqIHRvIGF2b2lkIGNvbGxpc2lvbnM7IHZhbHVlcyBNVVNUIGJlIEpTT04tc2VyaWFsaXphYmxlLlxuICovXG5leHBvcnQgdHlwZSBTZXNzaW9uTWV0YSA9IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXG4vKipcbiAqIFZTIENvZGUtc2lkZSBhbGlhcyBmb3IgdGhlIHByb3RvY29sJ3Mgb3BlbiBgX21ldGFgIHByb3BlcnR5IGJhZyBvblxuICoge0BsaW5rIFNlc3Npb25TdW1tYXJ5fS4gS2V5cyBTSE9VTEQgYmUgbmFtZXNwYWNlZCAoZS5nLiBgZ2l0YCwgYHZzY29kZS5mb29gKVxuICogdG8gYXZvaWQgY29sbGlzaW9uczsgdmFsdWVzIE1VU1QgYmUgSlNPTi1zZXJpYWxpemFibGUuXG4gKi9cbmV4cG9ydCB0eXBlIFNlc3Npb25TdW1tYXJ5TWV0YSA9IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXG4vKipcbiAqIFJlc2VydmVkIGtleSB1bmRlciB7QGxpbmsgU2Vzc2lvbk1ldGF9IGZvciB0aGUgd2VsbC1rbm93biBnaXQtc3RhdGVcbiAqIHBheWxvYWQuIFZhbHVlIGF0IHRoaXMga2V5LCB3aGVuIHByZXNlbnQsIE1VU1QgYmUgc2hhcGVkIGxpa2VcbiAqIHtAbGluayBJU2Vzc2lvbkdpdFN0YXRlfS4gVGhpcyBpcyBhIFZTIENvZGUtc3BlY2lmaWMgY29udmVudGlvbiBsYXllcmVkXG4gKiBvbiB0b3Agb2YgdGhlIHByb3RvY29sJ3MgZ2VuZXJpYyBgX21ldGFgIGJhZyBcdTIwMTQgdGhlIHByb3RvY29sIGl0c2VsZiBkb2VzXG4gKiBub3Qga25vdyBhYm91dCBnaXQgc3RhdGUuXG4gKi9cbmV4cG9ydCBjb25zdCBTRVNTSU9OX01FVEFfR0lUX0tFWSA9ICdnaXQnO1xuXG4vKipcbiAqIFJlc2VydmVkIGtleSB1bmRlciB7QGxpbmsgU2Vzc2lvbk1ldGF9IGZvciB0aGUgd2VsbC1rbm93biBHaXRIdWItc3RhdGVcbiAqIHBheWxvYWQuIFZhbHVlIGF0IHRoaXMga2V5LCB3aGVuIHByZXNlbnQsIE1VU1QgYmUgc2hhcGVkIGxpa2VcbiAqIHtAbGluayBJU2Vzc2lvbkdpdEh1YlN0YXRlfS4gVGhpcyBpcyBhIFZTIENvZGUtc3BlY2lmaWMgY29udmVudGlvbiBsYXllcmVkXG4gKiBvbiB0b3Agb2YgdGhlIHByb3RvY29sJ3MgZ2VuZXJpYyBgX21ldGFgIGJhZyBcdTIwMTQgdGhlIHByb3RvY29sIGl0c2VsZiBkb2VzXG4gKiBub3Qga25vdyBhYm91dCBHaXRIdWIgc3RhdGUuXG4gKi9cbmV4cG9ydCBjb25zdCBTRVNTSU9OX01FVEFfR0lUSFVCX0tFWSA9ICdnaXRodWInO1xuXG5leHBvcnQgY29uc3QgU0VTU0lPTl9NRVRBX1BST01QVF9DQUNIRV9LRVkgPSAndnNjb2RlLnByb21wdENhY2hlJztcblxuLyoqIExhdGVzdCBrbm93biBwcm9tcHQtY2FjaGUgc3RhdGUgZm9yIHRoZSBtb2RlbCBhY3RpdmUgaW4gYW4gYWdlbnQgc2Vzc2lvbi4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25Qcm9tcHRDYWNoZVN0YXRlIHtcblx0cmVhZG9ubHkgbW9kZWxJZDogc3RyaW5nO1xuXHRyZWFkb25seSBjYWNoZUV4cGlyZXNBdDogc3RyaW5nO1xufVxuXG4vKiogUmVhZHMgdGhlIGxhdGVzdCBrbm93biBwcm9tcHQtY2FjaGUgc3RhdGUgZnJvbSBzZXNzaW9uIG1ldGFkYXRhLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlYWRTZXNzaW9uUHJvbXB0Q2FjaGVTdGF0ZShtZXRhOiBTZXNzaW9uTWV0YSB8IHVuZGVmaW5lZCk6IElTZXNzaW9uUHJvbXB0Q2FjaGVTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHZhbHVlID0gbWV0YT8uW1NFU1NJT05fTUVUQV9QUk9NUFRfQ0FDSEVfS0VZXTtcblx0aWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCByYXcgPSB2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0cmV0dXJuIHR5cGVvZiByYXdbJ21vZGVsSWQnXSA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIHJhd1snY2FjaGVFeHBpcmVzQXQnXSA9PT0gJ3N0cmluZydcblx0XHQ/IHsgbW9kZWxJZDogcmF3Wydtb2RlbElkJ10sIGNhY2hlRXhwaXJlc0F0OiByYXdbJ2NhY2hlRXhwaXJlc0F0J10gfVxuXHRcdDogdW5kZWZpbmVkO1xufVxuXG4vKiogUmV0dXJucyBzZXNzaW9uIG1ldGFkYXRhIHdpdGggdGhlIHByb21wdC1jYWNoZSBzbG90IHVwZGF0ZWQgb3IgcmVtb3ZlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3aXRoU2Vzc2lvblByb21wdENhY2hlU3RhdGUobWV0YTogU2Vzc2lvbk1ldGEgfCB1bmRlZmluZWQsIHByb21wdENhY2hlOiBJU2Vzc2lvblByb21wdENhY2hlU3RhdGUgfCB1bmRlZmluZWQpOiBTZXNzaW9uTWV0YSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG5leHQ6IFNlc3Npb25NZXRhID0geyAuLi5tZXRhIH07XG5cdGlmIChwcm9tcHRDYWNoZSkge1xuXHRcdG5leHRbU0VTU0lPTl9NRVRBX1BST01QVF9DQUNIRV9LRVldID0gcHJvbXB0Q2FjaGU7XG5cdH0gZWxzZSB7XG5cdFx0ZGVsZXRlIG5leHRbU0VTU0lPTl9NRVRBX1BST01QVF9DQUNIRV9LRVldO1xuXHR9XG5cdHJldHVybiBPYmplY3Qua2V5cyhuZXh0KS5sZW5ndGggPiAwID8gbmV4dCA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBHaXQgc3RhdGUgb2YgYSBzZXNzaW9uJ3Mgd29ya2luZyBkaXJlY3RvcnksIGNhcnJpZWQgdW5kZXJcbiAqIHtAbGluayBTZXNzaW9uTWV0YX0gYXQge0BsaW5rIFNFU1NJT05fTUVUQV9HSVRfS0VZfS4gVXNlZCBieSBjbGllbnRzIHRvXG4gKiBkcml2ZSBzb3VyY2UtY29udHJvbCBhZmZvcmRhbmNlcyAoZS5nLiBQUi9tZXJnZSBidXR0b25zIGluIHRoZSBBZ2VudHNcbiAqIGFwcCkuXG4gKlxuICogQWxsIGZpZWxkcyBhcmUgb3B0aW9uYWwgXHUyMDE0IGFnZW50cyB0aGF0IGRvIG5vdCB0cmFjayBhIHBhcnRpY3VsYXIgZmllbGRcbiAqIHNob3VsZCBvbWl0IGl0IHJhdGhlciB0aGFuIHNlbmQgYSBwbGFjZWhvbGRlciwgc28gY2xpZW50cyBjYW4gZGlzdGluZ3Vpc2hcbiAqIFwidW5rbm93blwiIGZyb20gXCJrbm93biB0byBiZSB6ZXJvXCIuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25HaXRTdGF0ZSB7XG5cdC8qKiBXaGV0aGVyIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBoYXMgYSBgZ2l0aHViLmNvbWAgZ2l0IHJlbW90ZS4gKi9cblx0cmVhZG9ubHkgaGFzR2l0SHViUmVtb3RlPzogYm9vbGVhbjtcblx0LyoqIEN1cnJlbnQgYnJhbmNoIG5hbWUuICovXG5cdHJlYWRvbmx5IGJyYW5jaE5hbWU/OiBzdHJpbmc7XG5cdC8qKiBCYXNlIGJyYW5jaCB0aGUgd29yayB0YXJnZXRzIChlLmcuIGBtYWluYCkuICovXG5cdHJlYWRvbmx5IGJhc2VCcmFuY2hOYW1lPzogc3RyaW5nO1xuXHQvKiogVXBzdHJlYW0gdHJhY2tpbmcgYnJhbmNoIChlLmcuIGBvcmlnaW4vZmVhdHVyZWApLiAqL1xuXHRyZWFkb25seSB1cHN0cmVhbUJyYW5jaE5hbWU/OiBzdHJpbmc7XG5cdC8qKiBOdW1iZXIgb2YgY29tbWl0cyB0aGUgdXBzdHJlYW0gYnJhbmNoIGhhcyBhaGVhZCBvZiB0aGUgbG9jYWwgYnJhbmNoLiAqL1xuXHRyZWFkb25seSBpbmNvbWluZ0NoYW5nZXM/OiBudW1iZXI7XG5cdC8qKiBOdW1iZXIgb2YgY29tbWl0cyB0aGUgbG9jYWwgYnJhbmNoIGhhcyBhaGVhZCBvZiB0aGUgdXBzdHJlYW0gYnJhbmNoLiAqL1xuXHRyZWFkb25seSBvdXRnb2luZ0NoYW5nZXM/OiBudW1iZXI7XG5cdC8qKiBOdW1iZXIgb2YgZmlsZXMgd2l0aCB1bmNvbW1pdHRlZCBjaGFuZ2VzLiAqL1xuXHRyZWFkb25seSB1bmNvbW1pdHRlZENoYW5nZXM/OiBudW1iZXI7XG5cdC8qKiBHaXRIdWIgcmVwb3NpdG9yeSBvd25lciBwYXJzZWQgZnJvbSB0aGUgd29ya2luZyBjb3B5J3MgR2l0SHViIHJlbW90ZSAocHJlZmVycmluZyBgb3JpZ2luYCwgZmFsbGluZyBiYWNrIHRvIHRoZSBmaXJzdCBHaXRIdWIgcmVtb3RlKS4gKi9cblx0cmVhZG9ubHkgZ2l0aHViT3duZXI/OiBzdHJpbmc7XG5cdC8qKiBHaXRIdWIgb3duZXIgcGFyc2VkIGZyb20gdGhlIGN1cnJlbnQgYnJhbmNoJ3MgdXBzdHJlYW0gcmVtb3RlLiAqL1xuXHRyZWFkb25seSBnaXRodWJIZWFkT3duZXI/OiBzdHJpbmc7XG5cdC8qKiBHaXRIdWIgcmVwb3NpdG9yeSBuYW1lIHBhcnNlZCBmcm9tIHRoZSB3b3JraW5nIGNvcHkncyBHaXRIdWIgcmVtb3RlIChwcmVmZXJyaW5nIGBvcmlnaW5gLCBmYWxsaW5nIGJhY2sgdG8gdGhlIGZpcnN0IEdpdEh1YiByZW1vdGUpLiAqL1xuXHRyZWFkb25seSBnaXRodWJSZXBvPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIEdpdEh1YiBzdGF0ZSBvZiBhIHNlc3Npb24sIGNhcnJpZWQgdW5kZXIge0BsaW5rIFNlc3Npb25NZXRhfSBhdFxuICoge0BsaW5rIFNFU1NJT05fTUVUQV9HSVRIVUJfS0VZfS4gVXNlZCBieSBjbGllbnRzIHRvIGRyaXZlIEdpdEh1Yi1zcGVjaWZpY1xuICogYWZmb3JkYW5jZXMgKGUuZy4gUFIvbWVyZ2UgYnV0dG9ucyBpbiB0aGUgQWdlbnRzIGFwcCkuXG4gKlxuICogQWxsIGZpZWxkcyBhcmUgb3B0aW9uYWwgXHUyMDE0IGFnZW50cyB0aGF0IGRvIG5vdCB0cmFjayBhIHBhcnRpY3VsYXIgZmllbGRcbiAqIHNob3VsZCBvbWl0IGl0IHJhdGhlciB0aGFuIHNlbmQgYSBwbGFjZWhvbGRlciwgc28gY2xpZW50cyBjYW4gZGlzdGluZ3Vpc2hcbiAqIFwidW5rbm93blwiIGZyb20gXCJrbm93biB0byBiZSB6ZXJvXCIuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25HaXRIdWJTdGF0ZSB7XG5cdC8qKiBUaGUgb3duZXIgb2YgdGhlIEdpdEh1YiByZXBvc2l0b3J5LiAqL1xuXHRyZWFkb25seSBvd25lcj86IHN0cmluZztcblx0LyoqIFRoZSBuYW1lIG9mIHRoZSBHaXRIdWIgcmVwb3NpdG9yeS4gKi9cblx0cmVhZG9ubHkgcmVwbz86IHN0cmluZztcblx0LyoqIFRoZSBVUkwgb2YgdGhlIEdpdEh1YiBwdWxsIHJlcXVlc3QuICovXG5cdHJlYWRvbmx5IHB1bGxSZXF1ZXN0VXJsPzogc3RyaW5nO1xuXHQvKipcbjw8PDw8PDwgSEVBRFxuXHQgKiBVUkxzIG9mIHRoZSBHaXRIdWIgaXNzdWVzIHJlZmVyZW5jZWQgYnkgdGhlIHNlc3Npb24ncyB1c2VyIG1lc3NhZ2VzLCBpblxuXHQgKiBvcmRlciBvZiBmaXJzdCBhcHBlYXJhbmNlLlxuXHQgKi9cblx0cmVhZG9ubHkgaXNzdWVVcmxzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdC8qKlxuXHQgKiBUaGUgbmFtZSBvZiB0aGUgYnJhbmNoIHtAbGluayBwdWxsUmVxdWVzdFVybH0gd2FzIGZvdW5kIChvciBjcmVhdGVkKSBmb3IuXG5cdCAqIEEgcHVsbCByZXF1ZXN0IGFsd2F5cyByZWxhdGVzIHRvIGEgYnJhbmNoOiB3aGVuIHRoZSB3b3JraW5nIGNvcHkgc3dpdGNoZXNcblx0ICogdG8gYSBkaWZmZXJlbnQgYnJhbmNoIHRoZSBob3N0IGtlZXBzIHJlcG9ydGluZyB0aGUga25vd24gcHVsbCByZXF1ZXN0IGJ1dFxuXHQgKiByZXN1bWVzIGxvb2tpbmcgZm9yIG9uZSB0aGF0IGJlbG9uZ3MgdG8gdGhlIG5ld2x5IGNoZWNrZWQgb3V0IGJyYW5jaC5cblx0ICovXG5cdHJlYWRvbmx5IHB1bGxSZXF1ZXN0QnJhbmNoTmFtZT86IHN0cmluZztcbn1cblxuLyoqXG4gKiBXaGV0aGVyIHRoZSBrbm93biBwdWxsIHJlcXVlc3Qgb2YgYGdpdEh1YlN0YXRlYCBiZWxvbmdzIHRvIGBicmFuY2hOYW1lYC5cbiAqXG4gKiBTdGF0ZSBwZXJzaXN0ZWQgYmVmb3JlIHB1bGwgcmVxdWVzdHMgd2VyZSB0cmFja2VkIHBlciBicmFuY2ggaGFzIG5vXG4gKiB7QGxpbmsgSVNlc3Npb25HaXRIdWJTdGF0ZS5wdWxsUmVxdWVzdEJyYW5jaE5hbWV9OyBzdWNoIGEgcHVsbCByZXF1ZXN0IGlzXG4gKiBvcHRpbWlzdGljYWxseSB0cmVhdGVkIGFzIGJlbG9uZ2luZyB0byB0aGUgZ2l2ZW4gYnJhbmNoIHNvIGV4aXN0aW5nIHNlc3Npb25zXG4gKiBrZWVwIHRoZWlyIHB1bGwgcmVxdWVzdCBhZmZvcmRhbmNlcyB1bnRpbCB0aGUgaG9zdCBoYXMgdmVyaWZpZWQgd2hpY2ggYnJhbmNoXG4gKiBpdCBhY3R1YWxseSBiZWxvbmdzIHRvLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaGFzU2Vzc2lvblB1bGxSZXF1ZXN0Rm9yQnJhbmNoKGdpdEh1YlN0YXRlOiBJU2Vzc2lvbkdpdEh1YlN0YXRlIHwgdW5kZWZpbmVkLCBicmFuY2hOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0aWYgKCFnaXRIdWJTdGF0ZT8ucHVsbFJlcXVlc3RVcmwpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIGdpdEh1YlN0YXRlLnB1bGxSZXF1ZXN0QnJhbmNoTmFtZSA9PT0gdW5kZWZpbmVkIHx8IGdpdEh1YlN0YXRlLnB1bGxSZXF1ZXN0QnJhbmNoTmFtZSA9PT0gYnJhbmNoTmFtZTtcbn1cblxuLyoqXG4gKiBSZWFkcyB0aGUgd2VsbC1rbm93biBnaXQtc3RhdGUgcGF5bG9hZCBmcm9tIHtAbGluayBTZXNzaW9uTWV0YX0sIGlmXG4gKiBwcmVzZW50LiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gdGhlIG1ldGEgYmFnIGlzIGFic2VudCBvciB0aGUgdmFsdWUgYXRcbiAqIHRoZSBnaXQga2V5IGlzIG5vdCBhIHBsYWluIG9iamVjdCAoZS5nLiBhbiBhcnJheSBvciBhIHByaW1pdGl2ZSkuXG4gKiBJbmRpdmlkdWFsIGZpZWxkcyB3aXRoIHdyb25nIHR5cGVzIGFyZSBzaWxlbnRseSBkcm9wcGVkIHNvIHBhcnRpYWwgc3RhdGVcbiAqIHN0aWxsIHByb3BhZ2F0ZXMuXG4gKlxuICogVW5saWtlIHRoZSBvdGhlciB0eXBlZCByZWFkZXJzLCB0aGlzIHRha2VzIHRoZSByYXcge0BsaW5rIFNlc3Npb25NZXRhfSB2YWx1ZVxuICogcmF0aGVyIHRoYW4gaXRzIHBhcmVudCB7QGxpbmsgU2Vzc2lvblN0YXRlfTogdGhlIHNlc3Npb25zIHByb3ZpZGVyIHN0b3JlcyBhbmRcbiAqIHJlYWRzIGEgZGV0YWNoZWQgbWV0YSBzbmFwc2hvdCB3aXRob3V0IHJldGFpbmluZyB0aGUgb3duaW5nIHN0YXRlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZFNlc3Npb25HaXRTdGF0ZShtZXRhOiBTZXNzaW9uTWV0YSB8IHVuZGVmaW5lZCk6IElTZXNzaW9uR2l0U3RhdGUgfCB1bmRlZmluZWQge1xuXHRjb25zdCB2YWx1ZSA9IG1ldGE/LltTRVNTSU9OX01FVEFfR0lUX0tFWV07XG5cdGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgcmF3ID0gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdGNvbnN0IHJlc3VsdDoge1xuXHRcdGhhc0dpdEh1YlJlbW90ZT86IGJvb2xlYW47XG5cdFx0YnJhbmNoTmFtZT86IHN0cmluZztcblx0XHRiYXNlQnJhbmNoTmFtZT86IHN0cmluZztcblx0XHR1cHN0cmVhbUJyYW5jaE5hbWU/OiBzdHJpbmc7XG5cdFx0aW5jb21pbmdDaGFuZ2VzPzogbnVtYmVyO1xuXHRcdG91dGdvaW5nQ2hhbmdlcz86IG51bWJlcjtcblx0XHR1bmNvbW1pdHRlZENoYW5nZXM/OiBudW1iZXI7XG5cdFx0Z2l0aHViT3duZXI/OiBzdHJpbmc7XG5cdFx0Z2l0aHViSGVhZE93bmVyPzogc3RyaW5nO1xuXHRcdGdpdGh1YlJlcG8/OiBzdHJpbmc7XG5cdH0gPSB7fTtcblx0aWYgKHR5cGVvZiByYXdbJ2hhc0dpdEh1YlJlbW90ZSddID09PSAnYm9vbGVhbicpIHsgcmVzdWx0Lmhhc0dpdEh1YlJlbW90ZSA9IHJhd1snaGFzR2l0SHViUmVtb3RlJ107IH1cblx0aWYgKHR5cGVvZiByYXdbJ2JyYW5jaE5hbWUnXSA9PT0gJ3N0cmluZycpIHsgcmVzdWx0LmJyYW5jaE5hbWUgPSByYXdbJ2JyYW5jaE5hbWUnXTsgfVxuXHRpZiAodHlwZW9mIHJhd1snYmFzZUJyYW5jaE5hbWUnXSA9PT0gJ3N0cmluZycpIHsgcmVzdWx0LmJhc2VCcmFuY2hOYW1lID0gcmF3WydiYXNlQnJhbmNoTmFtZSddOyB9XG5cdGlmICh0eXBlb2YgcmF3Wyd1cHN0cmVhbUJyYW5jaE5hbWUnXSA9PT0gJ3N0cmluZycpIHsgcmVzdWx0LnVwc3RyZWFtQnJhbmNoTmFtZSA9IHJhd1sndXBzdHJlYW1CcmFuY2hOYW1lJ107IH1cblx0aWYgKHR5cGVvZiByYXdbJ2luY29taW5nQ2hhbmdlcyddID09PSAnbnVtYmVyJykgeyByZXN1bHQuaW5jb21pbmdDaGFuZ2VzID0gcmF3WydpbmNvbWluZ0NoYW5nZXMnXTsgfVxuXHRpZiAodHlwZW9mIHJhd1snb3V0Z29pbmdDaGFuZ2VzJ10gPT09ICdudW1iZXInKSB7IHJlc3VsdC5vdXRnb2luZ0NoYW5nZXMgPSByYXdbJ291dGdvaW5nQ2hhbmdlcyddOyB9XG5cdGlmICh0eXBlb2YgcmF3Wyd1bmNvbW1pdHRlZENoYW5nZXMnXSA9PT0gJ251bWJlcicpIHsgcmVzdWx0LnVuY29tbWl0dGVkQ2hhbmdlcyA9IHJhd1sndW5jb21taXR0ZWRDaGFuZ2VzJ107IH1cblx0aWYgKHR5cGVvZiByYXdbJ2dpdGh1Yk93bmVyJ10gPT09ICdzdHJpbmcnKSB7IHJlc3VsdC5naXRodWJPd25lciA9IHJhd1snZ2l0aHViT3duZXInXTsgfVxuXHRpZiAodHlwZW9mIHJhd1snZ2l0aHViSGVhZE93bmVyJ10gPT09ICdzdHJpbmcnKSB7IHJlc3VsdC5naXRodWJIZWFkT3duZXIgPSByYXdbJ2dpdGh1YkhlYWRPd25lciddOyB9XG5cdGlmICh0eXBlb2YgcmF3WydnaXRodWJSZXBvJ10gPT09ICdzdHJpbmcnKSB7IHJlc3VsdC5naXRodWJSZXBvID0gcmF3WydnaXRodWJSZXBvJ107IH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgbmV3IHtAbGluayBTZXNzaW9uTWV0YX0gd2l0aCB0aGUgZ2l0LXN0YXRlIHBheWxvYWQgc2V0IHRvXG4gKiBgZ2l0U3RhdGVgLCBvciB3aXRoIHRoZSBnaXQgc2xvdCByZW1vdmVkIGlmIGBnaXRTdGF0ZWAgaXMgYHVuZGVmaW5lZGAuXG4gKiBSZXR1cm5zIGB1bmRlZmluZWRgIGlmIHRoZSByZXN1bHQgd291bGQgYmUgZW1wdHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3aXRoU2Vzc2lvbkdpdFN0YXRlKG1ldGE6IFNlc3Npb25NZXRhIHwgdW5kZWZpbmVkLCBnaXRTdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSB8IHVuZGVmaW5lZCk6IFNlc3Npb25NZXRhIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbmV4dDogeyBba2V5OiBzdHJpbmddOiB1bmtub3duIH0gPSB7IC4uLm1ldGEgfTtcblx0aWYgKGdpdFN0YXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRuZXh0W1NFU1NJT05fTUVUQV9HSVRfS0VZXSA9IGdpdFN0YXRlO1xuXHR9IGVsc2Uge1xuXHRcdGRlbGV0ZSBuZXh0W1NFU1NJT05fTUVUQV9HSVRfS0VZXTtcblx0fVxuXHRyZXR1cm4gT2JqZWN0LmtleXMobmV4dCkubGVuZ3RoID4gMCA/IG5leHQgOiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogUmVhZHMgdGhlIHdlbGwta25vd24gR2l0SHViIHN0YXRlIHBheWxvYWQgZnJvbSB7QGxpbmsgU2Vzc2lvblN1bW1hcnlNZXRhfSwgaWZcbiAqIHByZXNlbnQuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgbWV0YSBiYWcgaXMgYWJzZW50IG9yIHRoZSB2YWx1ZSBhdCB0aGVcbiAqIEdpdEh1YiBrZXkgaXMgbm90IGEgcGxhaW4gb2JqZWN0IChlLmcuIGFuIGFycmF5IG9yIGEgcHJpbWl0aXZlKS5cbiAqIEluZGl2aWR1YWwgZmllbGRzIHdpdGggd3JvbmcgdHlwZXMgYXJlIHNpbGVudGx5IGRyb3BwZWQgc28gcGFydGlhbCBzdGF0ZVxuICogc3RpbGwgcHJvcGFnYXRlcy5cbiAqXG4gKiBVbmxpa2UgdGhlIG90aGVyIHR5cGVkIHJlYWRlcnMsIHRoaXMgdGFrZXMgdGhlIHJhdyB7QGxpbmsgU2Vzc2lvblN1bW1hcnlNZXRhfVxuICogdmFsdWUgcmF0aGVyIHRoYW4gaXRzIHBhcmVudCB7QGxpbmsgU2Vzc2lvblN0YXRlfTogdGhlIHNlc3Npb25zIHByb3ZpZGVyIHN0b3JlcyBhbmRcbiAqIHJlYWRzIGEgZGV0YWNoZWQgbWV0YSBzbmFwc2hvdCB3aXRob3V0IHJldGFpbmluZyB0aGUgb3duaW5nIHN0YXRlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShtZXRhOiBTZXNzaW9uU3VtbWFyeU1ldGEgfCB1bmRlZmluZWQpOiBJU2Vzc2lvbkdpdEh1YlN0YXRlIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdmFsdWUgPSBtZXRhPy5bU0VTU0lPTl9NRVRBX0dJVEhVQl9LRVldO1xuXHRpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJhdyA9IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRjb25zdCByZXN1bHQ6IHtcblx0XHRvd25lcj86IHN0cmluZztcblx0XHRyZXBvPzogc3RyaW5nO1xuXHRcdHB1bGxSZXF1ZXN0VXJsPzogc3RyaW5nO1xuXHRcdGlzc3VlVXJscz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRcdHB1bGxSZXF1ZXN0QnJhbmNoTmFtZT86IHN0cmluZztcblx0fSA9IHt9O1xuXG5cdGlmICh0eXBlb2YgcmF3Wydvd25lciddID09PSAnc3RyaW5nJykgeyByZXN1bHQub3duZXIgPSByYXdbJ293bmVyJ107IH1cblx0aWYgKHR5cGVvZiByYXdbJ3JlcG8nXSA9PT0gJ3N0cmluZycpIHsgcmVzdWx0LnJlcG8gPSByYXdbJ3JlcG8nXTsgfVxuXHRpZiAodHlwZW9mIHJhd1sncHVsbFJlcXVlc3RVcmwnXSA9PT0gJ3N0cmluZycpIHsgcmVzdWx0LnB1bGxSZXF1ZXN0VXJsID0gcmF3WydwdWxsUmVxdWVzdFVybCddOyB9XG5cdGlmIChBcnJheS5pc0FycmF5KHJhd1snaXNzdWVVcmxzJ10pKSB7IHJlc3VsdC5pc3N1ZVVybHMgPSByYXdbJ2lzc3VlVXJscyddLmZpbHRlcigodXJsKTogdXJsIGlzIHN0cmluZyA9PiB0eXBlb2YgdXJsID09PSAnc3RyaW5nJyk7IH1cblx0aWYgKHR5cGVvZiByYXdbJ3B1bGxSZXF1ZXN0QnJhbmNoTmFtZSddID09PSAnc3RyaW5nJykgeyByZXN1bHQucHVsbFJlcXVlc3RCcmFuY2hOYW1lID0gcmF3WydwdWxsUmVxdWVzdEJyYW5jaE5hbWUnXTsgfVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcge0BsaW5rIFNlc3Npb25TdW1tYXJ5TWV0YX0gd2l0aCB0aGUgR2l0SHViLXN0YXRlIHBheWxvYWQgc2V0IHRvXG4gKiBgZ2l0SHViU3RhdGVgLCBvciB3aXRoIHRoZSBHaXRIdWIgc2xvdCByZW1vdmVkIGlmIGBnaXRIdWJTdGF0ZWAgaXMgYHVuZGVmaW5lZGAuXG4gKiBSZXR1cm5zIGB1bmRlZmluZWRgIGlmIHRoZSByZXN1bHQgd291bGQgYmUgZW1wdHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3aXRoU2Vzc2lvbkdpdEh1YlN0YXRlKG1ldGE6IFNlc3Npb25TdW1tYXJ5TWV0YSB8IHVuZGVmaW5lZCwgZ2l0SHViU3RhdGU6IElTZXNzaW9uR2l0SHViU3RhdGUgfCB1bmRlZmluZWQpOiBTZXNzaW9uU3VtbWFyeU1ldGEgfCB1bmRlZmluZWQge1xuXHRjb25zdCBuZXh0OiB7IFtrZXk6IHN0cmluZ106IHVua25vd24gfSA9IHsgLi4ubWV0YSB9O1xuXHRpZiAoZ2l0SHViU3RhdGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdG5leHRbU0VTU0lPTl9NRVRBX0dJVEhVQl9LRVldID0gZ2l0SHViU3RhdGU7XG5cdH0gZWxzZSB7XG5cdFx0ZGVsZXRlIG5leHRbU0VTU0lPTl9NRVRBX0dJVEhVQl9LRVldO1xuXHR9XG5cdHJldHVybiBPYmplY3Qua2V5cyhuZXh0KS5sZW5ndGggPiAwID8gbmV4dCA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBSZXNlcnZlZCBrZXkgdW5kZXIge0BsaW5rIFNlc3Npb25TdW1tYXJ5TWV0YX0gcmVjb3JkaW5nIGhvdyBkZWVwbHkgYSBzZXNzaW9uXG4gKiB3YXMgc3Bhd25lZCB2aWEgdGhlIGBjcmVhdGVfc2Vzc2lvbmAgaG9zdCB0b29sICgwIGZvciBhIHRvcC1sZXZlbCwgdXNlci1jcmVhdGVkXG4gKiBzZXNzaW9uKS4gVXNlZCB0byBib3VuZCByZWN1cnNpdmUgc2Vzc2lvbiBjcmVhdGlvbi4gVlMgQ29kZS1zcGVjaWZpYyBjb252ZW50aW9uXG4gKiBsYXllcmVkIG9uIHRvcCBvZiB0aGUgcHJvdG9jb2wncyBnZW5lcmljIGBfbWV0YWAgYmFnLlxuICovXG5leHBvcnQgY29uc3QgU0VTU0lPTl9NRVRBX1NQQVdOX0RFUFRIX0tFWSA9ICdhZ2VudEhvc3Qvc2Vzc2lvblNwYXduRGVwdGgnO1xuXG4vKipcbiAqIFJlYWRzIHRoZSBgY3JlYXRlX3Nlc3Npb25gIHNwYXduIGRlcHRoIGZyb20gYSB7QGxpbmsgU2Vzc2lvblN1bW1hcnlNZXRhfSBiYWcsXG4gKiByZXR1cm5pbmcgYDBgIHdoZW4gdGhlIGtleSBpcyBhYnNlbnQgb3Igbm90IGEgZmluaXRlIG51bWJlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlYWRTZXNzaW9uU3Bhd25EZXB0aChtZXRhOiBTZXNzaW9uU3VtbWFyeU1ldGEgfCB1bmRlZmluZWQpOiBudW1iZXIge1xuXHRjb25zdCB2YWx1ZSA9IG1ldGE/LltTRVNTSU9OX01FVEFfU1BBV05fREVQVEhfS0VZXTtcblx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKHZhbHVlKSA/IHZhbHVlIDogMDtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgbmV3IHtAbGluayBTZXNzaW9uU3VtbWFyeU1ldGF9IHdpdGggdGhlIGBjcmVhdGVfc2Vzc2lvbmAgc3Bhd24gZGVwdGhcbiAqIHNldCB0byBgZGVwdGhgLCBwcmVzZXJ2aW5nIGFueSBvdGhlciBrZXlzIGluIHRoZSBiYWcuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3aXRoU2Vzc2lvblNwYXduRGVwdGgobWV0YTogU2Vzc2lvblN1bW1hcnlNZXRhIHwgdW5kZWZpbmVkLCBkZXB0aDogbnVtYmVyKTogU2Vzc2lvblN1bW1hcnlNZXRhIHtcblx0cmV0dXJuIHsgLi4ubWV0YSwgW1NFU1NJT05fTUVUQV9TUEFXTl9ERVBUSF9LRVldOiBkZXB0aCB9O1xufVxuXG4vKipcbiAqIFJlc2VydmVkIGtleSB1bmRlciB7QGxpbmsgU2Vzc2lvblN1bW1hcnlNZXRhfSBtYXJraW5nIGEgc2Vzc2lvbiBhc1xuICogd29ya3NwYWNlLWxlc3M6IGEgc2Vzc2lvbiB3aXRoIG5vIHdvcmtzcGFjZS9mb2xkZXIgYmluZGluZyAoc3VyZmFjZWQgaW4gdGhlXG4gKiBVSSBhcyBhIFwiUXVpY2sgQ2hhdFwiKS4gQ2FycmllZCBvbiB0aGUgc3VtbWFyeSBiYWcgKG5vdCB0aGUgZnVsbCBzdGF0ZSkgc29cbiAqIGNsaWVudHMgY2FuIGdyb3VwL3N0eWxlIHN1Y2ggc2Vzc2lvbnMgaW4gc2Vzc2lvbiBsaXN0cyB3aXRob3V0IHN1YnNjcmliaW5nIHRvXG4gKiBmdWxsIHNlc3Npb24gc3RhdGUuIFZTIENvZGUtc3BlY2lmaWMgY29udmVudGlvbiBsYXllcmVkIG9uIHRoZSBwcm90b2NvbCdzXG4gKiBnZW5lcmljIGBfbWV0YWAgYmFnLlxuICovXG5leHBvcnQgY29uc3QgU0VTU0lPTl9NRVRBX1dPUktTUEFDRUxFU1NfS0VZID0gJ3dvcmtzcGFjZWxlc3MnO1xuXG4vKipcbiAqIFNlc3Npb24tZGF0YWJhc2UgbWV0YWRhdGEga2V5IHJlY29yZGluZyB3aGV0aGVyIGEgc2Vzc2lvbiBpcyB3b3Jrc3BhY2UtbGVzcyAoYVxuICogd29ya3NwYWNlLWxlc3MgY2hhdCkuIE93bmVkIGJ5IHRoZSBBSCBzZXJ2aWNlOiBgQWdlbnRTZXJ2aWNlYCB3cml0ZXMgaXQgY2VudHJhbGx5IGF0XG4gKiBjcmVhdGUvbWF0ZXJpYWxpemUgYW5kIG92ZXJsYXlzIGl0IG9udG8gZXZlcnkgYWdlbnQncyBzdW1tYXJ5IGBfbWV0YWAgaW5cbiAqIGBsaXN0U2Vzc2lvbnNgOyBhZ2VudHMgb25seSByZWFkIGl0IChlLmcuIHRvIHBpY2sgdGhlIHdvcmtzcGFjZS1sZXNzIHN5c3RlbSBwcm9tcHRcbiAqIG9uIHJlc3VtZSkgYW5kIG5ldmVyIHBlcnNpc3QgaXQgdGhlbXNlbHZlcy5cbiAqL1xuZXhwb3J0IGNvbnN0IEFIX01FVEFfV09SS1NQQUNFTEVTU19EQl9LRVkgPSAnYWdlbnRIb3N0LndvcmtzcGFjZWxlc3MnO1xuXG4vKipcbiAqIFNlc3Npb24tZGF0YWJhc2UgbWV0YWRhdGEga2V5IHJlY29yZGluZyB3aGV0aGVyIGEgc2Vzc2lvbiBpcyBhcmNoaXZlZC4gV3JpdHRlbiBieVxuICogdGhlIEFIIG9yY2hlc3RyYXRvciAoYEFnZW50U2lkZUVmZmVjdHNgIG9uIGBTZXNzaW9uSXNBcmNoaXZlZENoYW5nZWRgKSBhbmQgcmVhZCBieVxuICogYm90aCB0aGUgb3JjaGVzdHJhdG9yIChgQWdlbnRTZXJ2aWNlYCByZXN0b3JlL2xpc3QpIGFuZCBhZ2VudHMgKGUuZy4gYENvcGlsb3RBZ2VudGBcbiAqIGRlY2lkZXMgd2hldGhlciB0byByZWNyZWF0ZSBhIG1pc3Npbmcgd29ya3RyZWUgdnMuIHJlc3VtZSByZWFkLW9ubHkgZm9yIGhpc3RvcnkpLlxuICoge0BsaW5rIEFIX01FVEFfSVNfRE9ORV9EQl9LRVl9IGlzIHRoZSBsZWdhY3kgbmFtZSBrZXB0IGZvciBzZXNzaW9ucyBwZXJzaXN0ZWQgYmVmb3JlXG4gKiB0aGUgcmVuYW1lOyByZWFkZXJzIGZhbGwgYmFjayB0byBpdCB3aGVuIHtAbGluayBBSF9NRVRBX0lTX0FSQ0hJVkVEX0RCX0tFWX0gaXMgYWJzZW50LlxuICovXG5leHBvcnQgY29uc3QgQUhfTUVUQV9JU19BUkNISVZFRF9EQl9LRVkgPSAnaXNBcmNoaXZlZCc7XG5cbi8qKiBMZWdhY3kgbWV0YWRhdGEga2V5IGZvciB0aGUgYXJjaGl2ZWQgZmxhZzsgc2VlIHtAbGluayBBSF9NRVRBX0lTX0FSQ0hJVkVEX0RCX0tFWX0uICovXG5leHBvcnQgY29uc3QgQUhfTUVUQV9JU19ET05FX0RCX0tFWSA9ICdpc0RvbmUnO1xuXG4vKipcbiAqIFNlc3Npb24tZGF0YWJhc2UgbWV0YWRhdGEga2V5IHJlY29yZGluZyB3aGV0aGVyIGEgc2Vzc2lvbiBoYXMgYmVlbiByZWFkLiBUaGlzIGlzXG4gKiB0aGUgb25seSBkdXJhYmxlIHJlcHJlc2VudGF0aW9uIG9mIHJlYWQgc3RhdGU7IHRoZSBpbi1tZW1vcnkgdHJ1dGggaXNcbiAqIHtAbGluayBTZXNzaW9uU3RhdHVzLklzUmVhZH0uIFRoZSBob3N0IG93bnMgaXQgXHUyMDE0IG5vIGFnZW50IFNESyB0cmFja3MgcmVhZCBzdGF0ZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEFIX01FVEFfSVNfUkVBRF9EQl9LRVkgPSAnaXNSZWFkJztcblxuLyoqIFJldHVybnMgYHN0YXR1c2Agd2l0aCBgZmxhZ2Agc2V0IG9yIGNsZWFyZWQuICovXG5leHBvcnQgZnVuY3Rpb24gd2l0aFNlc3Npb25TdGF0dXNGbGFnKHN0YXR1czogU2Vzc2lvblN0YXR1cywgZmxhZzogU2Vzc2lvblN0YXR1cywgc2V0OiBib29sZWFuKTogU2Vzc2lvblN0YXR1cyB7XG5cdHJldHVybiBzZXQgPyAoc3RhdHVzIHwgZmxhZykgOiAoc3RhdHVzICYgfmZsYWcpO1xufVxuXG4vKiogV2hldGhlciB0aGUge0BsaW5rIFNlc3Npb25TdGF0dXMuSXNSZWFkfSBmbGFnIGJpdCBpcyBzZXQuICovXG5leHBvcnQgZnVuY3Rpb24gaXNTZXNzaW9uU3RhdHVzUmVhZChzdGF0dXM6IFNlc3Npb25TdGF0dXMgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIHN0YXR1cyAhPT0gdW5kZWZpbmVkICYmIChzdGF0dXMgJiBTZXNzaW9uU3RhdHVzLklzUmVhZCkgIT09IDA7XG59XG5cbi8qKiBXaGV0aGVyIHRoZSB7QGxpbmsgU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkfSBmbGFnIGJpdCBpcyBzZXQuICovXG5leHBvcnQgZnVuY3Rpb24gaXNTZXNzaW9uU3RhdHVzQXJjaGl2ZWQoc3RhdHVzOiBTZXNzaW9uU3RhdHVzIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdHJldHVybiBzdGF0dXMgIT09IHVuZGVmaW5lZCAmJiAoc3RhdHVzICYgU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkKSAhPT0gMDtcbn1cblxuLyoqXG4gKiBSZWFkcyB0aGUgd29ya3NwYWNlLWxlc3MgbWFya2VyIGZyb20ge0BsaW5rIFNlc3Npb25TdW1tYXJ5TWV0YX0uIFJldHVybnNcbiAqIGB0cnVlYCBvbmx5IHdoZW4gdGhlIHdlbGwta25vd24ga2V5IGlzIHByZXNlbnQgYW5kIHNldCB0byBib29sZWFuIGB0cnVlYC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlYWRTZXNzaW9uV29ya3NwYWNlbGVzcyhtZXRhOiBTZXNzaW9uU3VtbWFyeU1ldGEgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIG1ldGE/LltTRVNTSU9OX01FVEFfV09SS1NQQUNFTEVTU19LRVldID09PSB0cnVlO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcge0BsaW5rIFNlc3Npb25TdW1tYXJ5TWV0YX0gd2l0aCB0aGUgd29ya3NwYWNlLWxlc3MgbWFya2VyIHNldCxcbiAqIG9yIHdpdGggdGhlIHNsb3QgcmVtb3ZlZCB3aGVuIGB3b3Jrc3BhY2VsZXNzYCBpcyBgZmFsc2VgLiBSZXR1cm5zIGB1bmRlZmluZWRgXG4gKiBpZiB0aGUgcmVzdWx0IHdvdWxkIGJlIGVtcHR5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gd2l0aFNlc3Npb25Xb3Jrc3BhY2VsZXNzKG1ldGE6IFNlc3Npb25TdW1tYXJ5TWV0YSB8IHVuZGVmaW5lZCwgd29ya3NwYWNlbGVzczogYm9vbGVhbik6IFNlc3Npb25TdW1tYXJ5TWV0YSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG5leHQ6IHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9ID0geyAuLi5tZXRhIH07XG5cdGlmICh3b3Jrc3BhY2VsZXNzKSB7XG5cdFx0bmV4dFtTRVNTSU9OX01FVEFfV09SS1NQQUNFTEVTU19LRVldID0gdHJ1ZTtcblx0fSBlbHNlIHtcblx0XHRkZWxldGUgbmV4dFtTRVNTSU9OX01FVEFfV09SS1NQQUNFTEVTU19LRVldO1xuXHR9XG5cdHJldHVybiBPYmplY3Qua2V5cyhuZXh0KS5sZW5ndGggPiAwID8gbmV4dCA6IHVuZGVmaW5lZDtcbn1cblxuLy8gLS0tLSBSb290U3RhdGUgX21ldGEgYWNjZXNzb3JzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIFZTIENvZGUtc2lkZSBhbGlhcyBmb3IgdGhlIHByb3RvY29sJ3Mgb3BlbiBgX21ldGFgIHByb3BlcnR5IGJhZyBvblxuICoge0BsaW5rIFJvb3RTdGF0ZX0uIEtleXMgU0hPVUxEIGJlIG5hbWVzcGFjZWQgdG8gYXZvaWQgY29sbGlzaW9uczsgdmFsdWVzIE1VU1RcbiAqIGJlIEpTT04tc2VyaWFsaXphYmxlLlxuICovXG5leHBvcnQgdHlwZSBSb290TWV0YSA9IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXG4vKipcbiAqIFJlc2VydmVkIGtleSB1bmRlciB7QGxpbmsgUm9vdE1ldGF9IGZvciB0aGUgd2VsbC1rbm93biBob3N0LWJ1aWxkIHBheWxvYWQuXG4gKiBWYWx1ZSBhdCB0aGlzIGtleSwgd2hlbiBwcmVzZW50LCBNVVNUIGJlIHNoYXBlZCBsaWtlIHtAbGluayBJSG9zdEJ1aWxkSW5mb30uXG4gKiBUaGlzIGlzIGEgVlMgQ29kZS1zcGVjaWZpYyBjb252ZW50aW9uIGxheWVyZWQgb24gdG9wIG9mIHRoZSBwcm90b2NvbCdzXG4gKiBnZW5lcmljIGBfbWV0YWAgYmFnIFx1MjAxNCB0aGUgcHJvdG9jb2wgaXRzZWxmIGRvZXMgbm90IGtub3cgYWJvdXQgYnVpbGQgaW5mby5cbiAqL1xuZXhwb3J0IGNvbnN0IFJPT1RfTUVUQV9IT1NUX0JVSUxEX0tFWSA9ICdob3N0QnVpbGQnO1xuXG4vKipcbiAqIEJ1aWxkIGluZm9ybWF0aW9uIGFib3V0IHRoZSBwcm9ncmFtIGhvc3RpbmcgdGhlIGFnZW50IGhvc3QgKHRoZSBWUyBDb2RlIENMSSksXG4gKiBjYXJyaWVkIHVuZGVyIHtAbGluayBSb290TWV0YX0gYXQge0BsaW5rIFJPT1RfTUVUQV9IT1NUX0JVSUxEX0tFWX0uIExldHMgYVxuICogY2xpZW50IHNlZSB3aGljaCBidWlsZCBpcyBob3N0aW5nIGl0IFx1MjAxNCB1c2VmdWwgd2hlbiBpbnNwZWN0aW5nIHRoZSBvdXRwdXQgb2YgYVxuICogcmVtb3RlIGFnZW50IGhvc3QuXG4gKlxuICogQWxsIGZpZWxkcyBleGNlcHQge0BsaW5rIHZlcnNpb259IGFyZSBvcHRpb25hbCBcdTIwMTQgYSBidWlsZCB0aGF0IGRvZXMgbm90IHRyYWNrXG4gKiBhIHBhcnRpY3VsYXIgZmllbGQgc2hvdWxkIG9taXQgaXQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUhvc3RCdWlsZEluZm8ge1xuXHQvKiogUHJvZHVjdCB2ZXJzaW9uIChlLmcuIGAxLjk2LjBgKS4gKi9cblx0cmVhZG9ubHkgdmVyc2lvbjogc3RyaW5nO1xuXHQvKiogQ29tbWl0IFNIQSBvZiB0aGUgYnVpbGQsIGlmIGtub3duLiAqL1xuXHRyZWFkb25seSBjb21taXQ/OiBzdHJpbmc7XG5cdC8qKiBCdWlsZCBkYXRlIChJU08gODYwMSksIGlmIGtub3duLiAqL1xuXHRyZWFkb25seSBkYXRlPzogc3RyaW5nO1xuXHQvKiogUmVsZWFzZSBxdWFsaXR5IChlLmcuIGBzdGFibGVgLCBgaW5zaWRlcmApLCBpZiBrbm93bi4gKi9cblx0cmVhZG9ubHkgcXVhbGl0eT86IHN0cmluZztcbn1cblxuLyoqXG4gKiBEZXJpdmVzIHtAbGluayBJSG9zdEJ1aWxkSW5mb30gZnJvbSB0aGUgaG9zdCdzIHtAbGluayBJUHJvZHVjdFNlcnZpY2V9LlxuICovXG5leHBvcnQgZnVuY3Rpb24gaG9zdEJ1aWxkSW5mb0Zyb21Qcm9kdWN0KHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UpOiBJSG9zdEJ1aWxkSW5mbyB7XG5cdHJldHVybiB7XG5cdFx0dmVyc2lvbjogcHJvZHVjdFNlcnZpY2UudmVyc2lvbixcblx0XHRjb21taXQ6IHByb2R1Y3RTZXJ2aWNlLmNvbW1pdCxcblx0XHRkYXRlOiBwcm9kdWN0U2VydmljZS5kYXRlLFxuXHRcdHF1YWxpdHk6IHByb2R1Y3RTZXJ2aWNlLnF1YWxpdHksXG5cdH07XG59XG5cbi8qKlxuICogUmVhZHMgdGhlIHdlbGwta25vd24gaG9zdC1idWlsZCBwYXlsb2FkIGZyb20ge0BsaW5rIFJvb3RNZXRhfSwgaWYgcHJlc2VudC5cbiAqIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgbWV0YSBiYWcgaXMgYWJzZW50IG9yIHRoZSB2YWx1ZSBhdCB0aGUgaG9zdC1idWlsZFxuICoga2V5IGlzIG5vdCBhIHBsYWluIG9iamVjdCB3aXRoIGEgc3RyaW5nIGB2ZXJzaW9uYC4gT3B0aW9uYWwgZmllbGRzIHdpdGggd3JvbmdcbiAqIHR5cGVzIGFyZSBzaWxlbnRseSBkcm9wcGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZEhvc3RCdWlsZEluZm8oc3RhdGU6IFJvb3RTdGF0ZSB8IHVuZGVmaW5lZCk6IElIb3N0QnVpbGRJbmZvIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbWV0YSA9IHN0YXRlPy5fbWV0YTtcblx0Y29uc3QgdmFsdWUgPSBtZXRhPy5bUk9PVF9NRVRBX0hPU1RfQlVJTERfS0VZXTtcblx0aWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCByYXcgPSB2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0aWYgKHR5cGVvZiByYXdbJ3ZlcnNpb24nXSAhPT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJlc3VsdDogeyB2ZXJzaW9uOiBzdHJpbmc7IGNvbW1pdD86IHN0cmluZzsgZGF0ZT86IHN0cmluZzsgcXVhbGl0eT86IHN0cmluZyB9ID0ge1xuXHRcdHZlcnNpb246IHJhd1sndmVyc2lvbiddLFxuXHR9O1xuXHRpZiAodHlwZW9mIHJhd1snY29tbWl0J10gPT09ICdzdHJpbmcnKSB7IHJlc3VsdC5jb21taXQgPSByYXdbJ2NvbW1pdCddOyB9XG5cdGlmICh0eXBlb2YgcmF3WydkYXRlJ10gPT09ICdzdHJpbmcnKSB7IHJlc3VsdC5kYXRlID0gcmF3WydkYXRlJ107IH1cblx0aWYgKHR5cGVvZiByYXdbJ3F1YWxpdHknXSA9PT0gJ3N0cmluZycpIHsgcmVzdWx0LnF1YWxpdHkgPSByYXdbJ3F1YWxpdHknXTsgfVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcge0BsaW5rIFJvb3RNZXRhfSB3aXRoIHRoZSBob3N0LWJ1aWxkIHBheWxvYWQgc2V0IHRvXG4gKiBgYnVpbGRJbmZvYCwgb3Igd2l0aCB0aGUgc2xvdCByZW1vdmVkIGlmIGBidWlsZEluZm9gIGlzIGB1bmRlZmluZWRgLiBSZXR1cm5zXG4gKiBgdW5kZWZpbmVkYCBpZiB0aGUgcmVzdWx0IHdvdWxkIGJlIGVtcHR5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gd2l0aEhvc3RCdWlsZEluZm8obWV0YTogUm9vdE1ldGEgfCB1bmRlZmluZWQsIGJ1aWxkSW5mbzogSUhvc3RCdWlsZEluZm8gfCB1bmRlZmluZWQpOiBSb290TWV0YSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG5leHQ6IHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9ID0geyAuLi5tZXRhIH07XG5cdGlmIChidWlsZEluZm8gIT09IHVuZGVmaW5lZCkge1xuXHRcdG5leHRbUk9PVF9NRVRBX0hPU1RfQlVJTERfS0VZXSA9IGJ1aWxkSW5mbztcblx0fSBlbHNlIHtcblx0XHRkZWxldGUgbmV4dFtST09UX01FVEFfSE9TVF9CVUlMRF9LRVldO1xuXHR9XG5cdHJldHVybiBPYmplY3Qua2V5cyhuZXh0KS5sZW5ndGggPiAwID8gbmV4dCA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBGb3JtYXRzIHtAbGluayBJSG9zdEJ1aWxkSW5mb30gYXMgYSBzaG9ydCBzaW5nbGUtbGluZSBodW1hbi1yZWFkYWJsZSBzdHJpbmcsXG4gKiBlLmcuIGAxLjk2LjAgKGNvbW1pdCBhYmMxMjM0LCAyMDI0LTAxLTAyVDAzOjA0OjA1WiwgaW5zaWRlcilgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0SG9zdEJ1aWxkSW5mbyhpbmZvOiBJSG9zdEJ1aWxkSW5mbyk6IHN0cmluZyB7XG5cdGNvbnN0IGRldGFpbHM6IHN0cmluZ1tdID0gW107XG5cdGlmIChpbmZvLmNvbW1pdCkgeyBkZXRhaWxzLnB1c2goYGNvbW1pdCAke2luZm8uY29tbWl0fWApOyB9XG5cdGlmIChpbmZvLmRhdGUpIHsgZGV0YWlscy5wdXNoKGluZm8uZGF0ZSk7IH1cblx0aWYgKGluZm8ucXVhbGl0eSkgeyBkZXRhaWxzLnB1c2goaW5mby5xdWFsaXR5KTsgfVxuXHRyZXR1cm4gZGV0YWlscy5sZW5ndGggPiAwID8gYCR7aW5mby52ZXJzaW9ufSAoJHtkZXRhaWxzLmpvaW4oJywgJyl9KWAgOiBpbmZvLnZlcnNpb247XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFZQSxTQUFTLGNBQWMsY0FBYyxnQkFBZ0I7QUFDckQsU0FBUyxjQUE0QjtBQUNyQyxTQUFTLE9BQU8sbUJBQW1CO0FBRW5DLFNBQVMsd0JBQXdCO0FBQ2pDO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBRUE7QUFBQSxFQUVBO0FBQUEsRUFDQTtBQUFBLE9Bc0JNO0FBR1A7QUFBQSxFQUNDO0FBQUEsRUFBeUI7QUFBQSxFQUEwQjtBQUFBLEVBQWlCO0FBQUEsRUFDcEU7QUFBQSxFQUFtQjtBQUFBLEVBQXVCO0FBQUEsRUFDMUM7QUFBQSxFQUNBO0FBQUEsRUFDQSxvQkFBQUE7QUFBQSxFQUN3QjtBQUFBLEVBQ0k7QUFBQSxFQUNIO0FBQUEsRUFDQTtBQUFBLEVBQ3pCLHFCQUFBQztBQUFBLEVBQ0Esa0JBQUFDO0FBQUEsRUFD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QUFLLEtBQUssSUFBSTtBQUFBLEVBQUc7QUFDMUMsTUFBSSxLQUFLLFNBQVM7QUFBRSxZQUFRLEtBQUssS0FBSyxPQUFPO0FBQUEsRUFBRztBQUNoRCxTQUFPLFFBQVEsU0FBUyxJQUFJLEdBQUcsS0FBSyxPQUFPLEtBQUssUUFBUSxLQUFLLElBQUksQ0FBQyxNQUFNLEtBQUs7QUFDOUU7IiwKICAibmFtZXMiOiBbIlJlc3BvbnNlUGFydEtpbmQiLCAiQ2hhdEludGVyYWN0aXZpdHkiLCAiQ2hhdE9yaWdpbktpbmQiLCAiU2Vzc2lvbkxpZmVjeWNsZSIsICJTZXNzaW9uU3RhdHVzIiwgIlRvb2xDYWxsU3RhdHVzIiwgIlRvb2xSZXN1bHRDb250ZW50VHlwZSIsICJ1c2FnZSIsICJDaGF0SW5wdXRBbnN3ZXJTdGF0ZSIsICJDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQiLCAiQ2hhdElucHV0UXVlc3Rpb25LaW5kIiwgIkNoYXRJbnB1dFJlc3BvbnNlS2luZCIsICJGaWxlRWRpdEtpbmQiLCAiU3RhdGVDb21wb25lbnRzIl0KfQo=
