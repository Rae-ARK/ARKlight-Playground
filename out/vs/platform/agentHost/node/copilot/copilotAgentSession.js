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
import { raceCancellation, RunOnceScheduler, Sequencer, Throttler } from "../../../../base/common/async.js";
import { encodeBase64, VSBuffer } from "../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { CancellationError, getErrorMessage } from "../../../../base/common/errors.js";
import { escapeMarkdownSyntaxTokens } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableMap, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { isAuthorizationProtectedResourceMetadata } from "../../../../base/common/oauth.js";
import { safeStringify } from "../../../../base/common/objects.js";
import { isAbsolute, join } from "../../../../base/common/path.js";
import { extUriBiasedIgnorePathCase, normalizePath } from "../../../../base/common/resources.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { splitLinesIncludeSeparators } from "../../../../base/common/strings.js";
import { hasKey, isDefined, isObject, isString } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { INativeEnvironmentService } from "../../../environment/common/environment.js";
import { IFileService } from "../../../files/common/files.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { ILogService, LogLevel } from "../../../log/common/log.js";
import { ITelemetryService } from "../../../telemetry/common/telemetry.js";
import { getCopilotHomePath } from "../../common/copilotHome.js";
import { CopilotCliConfigKey, applyModelFamilyAlias, copilotCliConfigSchema } from "../../common/copilotCliConfig.js";
import { gitHubMcpServerUrl } from "../../common/githubEndpoints.js";
import { AgentHostSandboxConfigKey, sandboxConfigSchema } from "../../common/sandboxConfigSchema.js";
import { AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostAutoReplyAnswer, AgentHostAutoReplyEnabledConfigKey, AgentHostDisableRepoInfoTelemetryConfigKey, platformRootSchema, platformSessionSchema } from "../../common/agentHostSchema.js";
import { AgentSession, subagentChatTitle } from "../../common/agentService.js";
import { META_DIFF_BASE_BRANCH } from "../../common/agentHostGitService.js";
import { stripRedundantCdPrefix } from "../../common/commandLineHelpers.js";
import { readToolCallMeta, toToolCallMeta } from "../../common/meta/agentToolCallMeta.js";
import { OtelData } from "../../common/otlp/otlpLogEmitter.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
import { resolveCopilotConfigSlashCommandOnSend } from "../../common/copilotConfigSlashCommands.js";
import { STREAMING_TOOL_DISPLAY_INTERVAL_MS, streamingToolDisplayText } from "../../common/streamingToolCallDisplay.js";
import { isAgentFeedbackAnnotationsAttachment, renderAgentFeedbackAnnotationsAttachment } from "../../common/meta/agentFeedbackAttachments.js";
import { ISessionDataService, SESSION_ATTACHMENTS_DIRNAME } from "../../common/sessionDataService.js";
import { MessageAttachmentKind, ToolCallContributorKind } from "../../common/state/protocol/state.js";
import { ActionType, isChatAction } from "../../common/state/sessionActions.js";
import { MessageKind, ResponsePartKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, ToolCallConfirmationReason, ToolCallRiskAssessmentKind, ToolCallRiskAssessmentStatus, ToolCallStatus, ToolResultContentType, buildSubagentSessionUri, getToolSubagentContent, isDefaultChatUri, isSubagentSession, readSessionPromptCacheState, withSessionPromptCacheState } from "../../common/state/sessionState.js";
import { IAgentConfigurationService } from "../agentConfigurationService.js";
import { clientToolNamesFromSnapshot } from "./copilotSessionLauncher.js";
import { agentHostModelSupportsToolSearch, CLIENT_TOOL_SEARCH_REFERENCE_NAME, NON_DEFERRED_CLIENT_TOOL_NAMES, RUNTIME_TOOL_SEARCH_TOOL_NAME } from "./toolSearchDeferral.js";
import { ActiveClientToolSet } from "../activeClientState.js";
import { AgentHostTelemetryReporter } from "../agentHostTelemetryReporter.js";
import { AgentHostRepoInfoTelemetry } from "../agentHostRepoInfoTelemetry.js";
import { PendingRequestRegistry } from "../../common/pendingRequestRegistry.js";
import { buildCopilotSystemNotification } from "./copilotSystemNotification.js";
import { parseLeadingSlashCommand } from "../../common/agentHostSlashCommand.js";
import { NonPtyShellTerminalStreams } from "./copilotNonPtyShellTerminals.js";
import { buildSandboxConfigForSdk } from "./sandboxConfigForSdk.js";
import { getEditFilePaths, getInvocationMessage, getPastTenseMessage, getPermissionDisplay, getShellIntention, getShellLanguage, getStreamingInvocationMessage, getSubagentMetadata, getTaskCompleteMarkdown, getToolDisplayName, getToolInputString, getToolKind, isAgentCoordinationTool, isEditTool, isHiddenTool, isShellTool, isTaskCompleteTool, parseCopilotStreamingToolInput, synthesizeSkillToolCall, tryStringify } from "./copilotToolDisplay.js";
import { FileEditTracker } from "../shared/fileEditTracker.js";
import { ICopilotApiService } from "../shared/copilotApiService.js";
import { stripProxyErrorMarker, tryBuildChatErrorMeta, tryBuildChatErrorMetaFromFields } from "../shared/forwardedChatError.js";
import { getEffectiveMcpServerCustomizations, McpCustomizationController } from "../shared/mcpCustomizationController.js";
import { appendSdkToolResultContent, mapSessionEvents } from "./mapSessionEvents.js";
import { addSimpleAttachmentDisplayKindToMimeType } from "./copilotAttachmentUtils.js";
import { buildPendingEditContentUri } from "./pendingEditContentStore.js";
import { IAgentHostStateManager } from "../agentHostStateManager.js";
import { AgentHostClientType } from "../../common/agentHostClientInfo.js";
import { McpAuthRequiredReason, McpServerStatus } from "../../common/state/protocol/channels-session/state.js";
import { CopilotSlashCommandProvider } from "./copilotSlashCommandProvider.js";
const SESSION_STATE_DIRECTORY = "session-state";
const EMPTY_TOOL_RESULT_TEXT = "<empty />";
function isPermissionDeniedKind(kind) {
  switch (kind) {
    case "cancelled":
    case "denied-by-rules":
    case "denied-no-approval-rule-and-could-not-request-from-user":
    case "denied-interactively-by-user":
    case "denied-by-content-exclusion-policy":
    case "denied-by-permission-request-hook":
      return true;
    default:
      return false;
  }
}
function mapPermissionResultToConfirmKind(kind, resolvedByHook) {
  if (kind === void 0) {
    return "confirmationNotNeeded";
  }
  if (isPermissionDeniedKind(kind)) {
    return "denied";
  }
  if (kind === "approved-for-session" || kind === "approved-for-location") {
    return "setting";
  }
  return resolvedByHook ? "confirmationNotNeeded" : "userAction";
}
function normalizeMcpServerUrl(value) {
  if (!URL.canParse(value)) {
    return void 0;
  }
  const url = new URL(value);
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}
function getEmptyToolResultText(binaryResults) {
  if (!binaryResults?.length) {
    return EMPTY_TOOL_RESULT_TEXT;
  }
  const hasImage = binaryResults.some((result) => result.type === "image");
  const hasFile = binaryResults.some((result) => result.type === "resource");
  if (hasImage && hasFile) {
    return "Tool produced the attached image and file";
  }
  if (hasImage) {
    return "Tool produced the attached image";
  }
  return "Tool produced the attached file";
}
function getPlanActionDescription(actionId) {
  switch (actionId) {
    case "autopilot":
      return {
        label: localize("agentHost.planReview.autopilot.label", "Implement with Autopilot"),
        description: localize("agentHost.planReview.autopilot.description", "Continue autonomously until done, using the selected approval level.")
      };
    case "autopilot_fleet":
      return {
        label: localize("agentHost.planReview.autopilotFleet.label", "Implement with Autopilot Fleet"),
        description: localize("agentHost.planReview.autopilotFleet.description", "Continue autonomously with fleet management, using the selected approval level.")
      };
    case "interactive":
      return {
        label: localize("agentHost.planReview.interactive.label", "Implement Plan"),
        description: localize("agentHost.planReview.interactive.description", "Implement the plan, asking for input and approval for each action.")
      };
    case "exit_only":
      return {
        label: localize("agentHost.planReview.exitOnly.label", "Approve Plan Only"),
        description: localize("agentHost.planReview.exitOnly.description", "Approve the plan without executing it. I will implement it myself.")
      };
    default:
      return void 0;
  }
}
function getToolCommand(input) {
  const command = isObject(input.toolArgs) ? Reflect.get(input.toolArgs, "command") : void 0;
  return isString(command) ? command : void 0;
}
function toCopilotSdkMode(mode) {
  mode = mode?.toLowerCase() === "goal" ? "plan" : mode;
  switch (mode) {
    case "interactive":
    case "plan":
    case "autopilot":
      return mode;
    default:
      return void 0;
  }
}
function elicitationFieldToQuestion(fieldName, field, required) {
  const base = {
    id: fieldName,
    title: field.title ?? fieldName,
    message: field.description ?? field.title ?? fieldName,
    required
  };
  switch (field.type) {
    case "boolean":
      return { ...base, kind: ChatInputQuestionKind.Boolean, defaultValue: field.default };
    case "integer":
    case "number":
      return {
        ...base,
        kind: field.type === "integer" ? ChatInputQuestionKind.Integer : ChatInputQuestionKind.Number,
        min: field.minimum,
        max: field.maximum,
        defaultValue: field.default
      };
    case "array": {
      const options = hasKey(field.items, { enum: true }) ? field.items.enum.map((value) => ({ id: value, label: value })) : field.items.anyOf.map((option) => ({ id: option.const, label: option.title }));
      return {
        ...base,
        kind: ChatInputQuestionKind.MultiSelect,
        options,
        min: field.minItems,
        max: field.maxItems
      };
    }
    case "string": {
      if (hasKey(field, { enum: true })) {
        const enumNames = field.enumNames;
        const options = field.enum.map((value, idx) => ({ id: value, label: enumNames?.[idx] ?? value }));
        return { ...base, kind: ChatInputQuestionKind.SingleSelect, options };
      }
      if (hasKey(field, { oneOf: true })) {
        const options = field.oneOf.map((option) => ({ id: option.const, label: option.title }));
        return { ...base, kind: ChatInputQuestionKind.SingleSelect, options };
      }
      return {
        ...base,
        kind: ChatInputQuestionKind.Text,
        format: field.format,
        min: field.minLength,
        max: field.maxLength,
        defaultValue: field.default
      };
    }
  }
}
function elicitationAnswerToFieldValue(field, answer) {
  if (!answer || answer.state === ChatInputAnswerState.Skipped) {
    return void 0;
  }
  const value = answer.value;
  if (field.type === "boolean") {
    if (value.kind === ChatInputAnswerValueKind.Boolean) {
      return value.value;
    }
    if (value.kind === ChatInputAnswerValueKind.Text) {
      if (value.value === "true") {
        return true;
      }
      if (value.value === "false") {
        return false;
      }
      return void 0;
    }
    return void 0;
  }
  if (field.type === "number" || field.type === "integer") {
    if (value.kind === ChatInputAnswerValueKind.Number) {
      return field.type === "integer" ? Math.trunc(value.value) : value.value;
    }
    if (value.kind === ChatInputAnswerValueKind.Text) {
      if (value.value.trim() === "") {
        return void 0;
      }
      const n = Number(value.value);
      return Number.isFinite(n) ? field.type === "integer" ? Math.trunc(n) : n : void 0;
    }
    return void 0;
  }
  if (field.type === "array") {
    if (value.kind === ChatInputAnswerValueKind.SelectedMany) {
      return [...value.value, ...value.freeformValues ?? []];
    }
    if (value.kind === ChatInputAnswerValueKind.Selected) {
      return value.value ? [value.value, ...value.freeformValues ?? []] : [...value.freeformValues ?? []];
    }
    if (value.kind === ChatInputAnswerValueKind.Text) {
      return value.value ? [value.value] : [];
    }
    return void 0;
  }
  if (value.kind === ChatInputAnswerValueKind.Text) {
    return value.value;
  }
  if (value.kind === ChatInputAnswerValueKind.Selected) {
    return value.value;
  }
  return void 0;
}
function getCopilotCLISessionStateDir(userHome) {
  return join(getCopilotHomePath(userHome, process.env), SESSION_STATE_DIRECTORY);
}
const COPILOT_SDK_TOOL_OUTPUT_BASENAME_RE = /^(?:\d{10,}-copilot-tool-output-[a-z0-9]{6}|copilot-tool-output-\d{10,}-[a-z0-9]{6})\.txt$/i;
function isCopilotSdkToolOutputTempFile(filePath, tmpDir) {
  const fileUri = normalizePath(URI.file(filePath));
  const tmpDirUri = normalizePath(URI.file(tmpDir));
  const parentUri = normalizePath(URI.joinPath(fileUri, ".."));
  if (!extUriBiasedIgnorePathCase.isEqual(parentUri, tmpDirUri)) {
    return false;
  }
  const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const basename = lastSlash >= 0 ? filePath.substring(lastSlash + 1) : filePath;
  return COPILOT_SDK_TOOL_OUTPUT_BASENAME_RE.test(basename);
}
class CopilotTurn {
  constructor(id, ordinal, senderClientId, clientType) {
    this.id = id;
    this.ordinal = ordinal;
    this.senderClientId = senderClientId;
    this.clientType = clientType;
    this._state = "pending";
    this._stopWatch = StopWatch.create(false);
    /**
     * This turn's own Copilot cost in nano-AIU, summed from the `copilotUsage`
     * carried by the model calls the turn caused — its own, every subagent's,
     * and any compaction that ran mid-turn.
     *
     * Accumulated synchronously as each event arrives rather than derived from
     * the SDK's session-wide total: that total is read asynchronously, and the
     * terminal `session.idle` can close the turn while a read is in flight,
     * which would drop the turn's last model call from its reported cost.
     */
    this.copilotNanoAiu = 0;
    /**
     * Per-subagent component cost, in nano-AIU, keyed by `parentToolCallId`.
     * The SDK's session metrics are session-wide and carry no per-agent
     * breakdown, so a subagent's own running total is still accumulated from
     * its usage events in order to report it on the subagent's child session.
     */
    this.subagentNanoAiuByToolCallId = /* @__PURE__ */ new Map();
    /**
     * Current markdown response part IDs for this turn, keyed by
     * `parentToolCallId ?? ''`. Parent and subagent text stream through the
     * same SDK session but land in different AHP sessions, so their markdown
     * part state must not mask or append to each other.
     */
    this.markdownPartIds = /* @__PURE__ */ new Map();
    /** Current reasoning response part IDs for this turn, keyed by `parentToolCallId ?? ''`. */
    this.reasoningPartIds = /* @__PURE__ */ new Map();
    /**
     * Per-turn tool-call aggregate accumulated across the turn's `assistant.message` rounds (main
     * agent only), for the restricted `toolCallDetails` telemetry. `toolCounts` is keyed by tool name.
     */
    this.toolCounts = /* @__PURE__ */ new Map();
    this.toolCallRounds = 0;
    this.totalToolCalls = 0;
    this.parallelToolCallRounds = 0;
    this.parallelToolCallsTotal = 0;
    this.toolCallDetailsReported = false;
  }
  get state() {
    return this._state;
  }
  get isPending() {
    return this._state === "pending";
  }
  get isRunning() {
    return this._state === "running";
  }
  get duration() {
    return Math.max(0, this._stopWatch.elapsed());
  }
  /** Transition `pending → running` on the first SDK event. No-op once running/finished. */
  markRunning() {
    if (this._state === "pending") {
      this._state = "running";
    }
  }
  markCompleted() {
    this._state = "completed";
  }
  markAborted() {
    this._state = "aborted";
  }
}
let CopilotAgentSession = class extends Disposable {
  constructor(options, _instantiationService, _logService, sessionDataService, _fileService, _environmentService, _configurationService, _stateManager, _telemetryService, _copilotApiService) {
    super();
    this._instantiationService = _instantiationService;
    this._logService = _logService;
    this._fileService = _fileService;
    this._environmentService = _environmentService;
    this._configurationService = _configurationService;
    this._stateManager = _stateManager;
    this._telemetryService = _telemetryService;
    this._copilotApiService = _copilotApiService;
    /** Tracks active tool invocations so we can produce past-tense messages on completion. */
    this._activeToolCalls = /* @__PURE__ */ new Map();
    this._streamingToolCalls = /* @__PURE__ */ new Map();
    this._streamingToolDisplaySchedulers = this._register(new DisposableMap());
    /**
     * Maps a subagent's stable `agentId` to its parent tool call id. Completion
     * ends the current subagent turn, but steering can start another turn with
     * the same id, so mappings live until session teardown.
     */
    this._parentToolCallIdsByAgentId = /* @__PURE__ */ new Map();
    this._activeSubagentAgentIds = /* @__PURE__ */ new Set();
    this._unroutableSubagentToolCallIds = /* @__PURE__ */ new Set();
    this._autoApprovals = /* @__PURE__ */ new Map();
    this._pendingAutoApprovals = new PendingRequestRegistry();
    /** Correlates tool execution with the SDK permission lifecycle for `chat.toolApproval` telemetry. */
    this._toolApprovalRecords = /* @__PURE__ */ new Map();
    /** Pending permission requests awaiting a renderer-side decision. */
    this._pendingPermissions = new PendingRequestRegistry();
    /** Cancels callbacks that began before or during an SDK abort. */
    this._abortCts = this._register(new MutableDisposable());
    /**
     * Signatures ({@link safeStringify}) of user-approved `read`/`write`
     * permission requests, keyed by tool call id. The Copilot CLI runtime emits
     * two identical `permission.requested` events for a single file read or
     * write (an internal `path` prompt followed by a `read`/`write` prompt), so
     * without this the user would be asked to approve the same operation twice
     * (issue #324477). An entry is single-use: it auto-approves exactly one
     * subsequent request that is byte-identical to the approved one, then is
     * removed, so approval never carries across a different tool call, a changed
     * path/diff/contents, or a different kind.
     */
    this._approvedDuplicablePermissionSignatures = /* @__PURE__ */ new Map();
    /** Pending user input requests awaiting a renderer-side answer. */
    this._pendingUserInputs = new PendingRequestRegistry();
    /**
     * Pending elicitation requests awaiting a renderer-side answer. Keyed
     * by request id; the schema is retained so the completion handler can
     * project the submitted {@link ChatInputAnswer}s back into the
     * SDK's {@link ElicitationResult.content} shape.
     */
    this._pendingElicitations = new PendingRequestRegistry();
    /**
     * Pending plan-review requests originating from the CLI's
     * `exitPlanMode.request` RPC. Tracked separately from
     * {@link _pendingUserInputs} so the completion handler can resolve the
     * RPC with a structured {@link IExitPlanModeResponse} (which the CLI
     * forwards to `session.respondToExitPlanMode`) rather than feeding it
     * back through the SDK's `ask_user` callback.
     */
    this._pendingPlanReviews = new PendingRequestRegistry();
    /** Monotonic 0-based ordinal assigned to each turn as it starts, for numeric `turnIndex` telemetry parity. */
    this._nextTurnOrdinal = 0;
    /**
     * Latest session-wide nano-AIU total reported by the SDK's usage metrics
     * (`rpc.usage.getMetrics`), which is authoritative for what the session as a
     * whole has been billed: it folds in every model call plus compaction,
     * covers work billed while no turn was active, and survives resume.
     *
     * Deliberately *not* used to derive per-turn cost. It is session-scoped and
     * read asynchronously, so differencing it against a previous reading races
     * turn boundaries — the SDK's terminal `session.idle` can close a turn while
     * a read is still in flight. Per-turn cost comes from the synchronous
     * per-event `copilotUsage` instead (see {@link CopilotTurn.copilotNanoAiu}).
     */
    this._sessionTotalNanoAiu = 0;
    this._promptCacheRefreshGeneration = 0;
    /**
     * Serializes the metrics reads behind {@link _refreshSessionUsageMetrics}. Several
     * handlers refresh the total, so without this their RPCs overlap and an older
     * one resolving last would publish a session cost that visibly regresses. A
     * high-water mark cannot be used to reject stale reads instead, because the
     * total is legitimately non-monotonic (see the truncation note below). Keeping
     * one read in flight makes out-of-order resolution impossible, and coalesces
     * the redundant reads that a burst of usage events would otherwise issue.
     */
    this._sessionUsageMetricsRefreshThrottler = this._register(new Throttler());
    this._autoApprovalExperimentalModeEnabled = false;
    this._permissionModeSequencer = new Sequencer();
    this._steeringMessagesInFlight = /* @__PURE__ */ new Set();
    /**
     * Steering messages that have been accepted by the SDK but not yet
     * surfaced to the chat UI as a separate user message. When the SDK
     * echoes a steering through a `user.message` event whose `content`
     * matches one of these entries, we finalize the in-flight turn and
     * dispatch a new {@link ActionType.ChatTurnStarted} whose
     * `userMessage` is the steering content. The reducer also removes
     * the pending steering via the action's `queuedMessageId`.
     *
     * Entries left here at abort/dispose time are flushed as
     * `steering_consumed` signals so the chat UI's pending state still
     * clears in cleanup paths where we never observe the echo.
     */
    this._pendingSteeringFlips = /* @__PURE__ */ new Map();
    /** Deferred promises for pending client tool calls, keyed by toolCallId. */
    this._pendingClientToolCalls = new PendingRequestRegistry();
    /** Pending SDK MCP auth handler promises, keyed by SDK auth request id. */
    this._pendingMcpAuthRequests = new PendingRequestRegistry();
    /** `pending-edit-content:` URIs written during permission requests, keyed
     *  by toolCallId. Cleaned up when the permission resolves or the session
     *  is disposed. */
    this._pendingEditContentUris = /* @__PURE__ */ new Map();
    /**
     * Fans MCP server notifications (today: `notifications/tools/list_changed`)
     * up to the agent and on to the protocol server. Fired by the
     * `onToolsUpdated` listener once per ready MCP channel.
     */
    this._onMcpNotification = this._register(new Emitter());
    this.onMcpNotification = this._onMcpNotification.event;
    /**
     * Pending MCP `sampling/createMessage` requests received over the
     * AHP `mcp://` channel, keyed by the cancellation handle we passed
     * into {@link rpc.mcp.executeSampling}. Tracked so that session
     * teardown can issue a best-effort
     * {@link rpc.mcp.cancelSamplingExecution} for each one instead of
     * leaving the SDK-side promise (and the upstream App) hanging.
     */
    this._pendingMcpSamplings = /* @__PURE__ */ new Set();
    /** Tracks whether a non-empty activity has been published, so we only emit a clear when needed. */
    this._hasActivity = false;
    /**
     * Last SDK-reported MCP status logged for each server (keyed by server
     * name). Used to suppress duplicate lifecycle log records when the SDK
     * re-reports an unchanged status — the `rpc.mcp.list` seed and the
     * `session.mcp_servers_loaded` event routinely carry the same snapshot.
     */
    this._lastLoggedMcpStatus = /* @__PURE__ */ new Map();
    this._abortCts.value = new CancellationTokenSource();
    this.sessionId = options.rawSessionId;
    this.sessionUri = options.sessionUri;
    this._slashCommandProvider = new CopilotSlashCommandProvider(() => this._wrapper.session.rpc.commands.list({ includeBuiltins: true, includeSkills: true, includeClientCommands: true }).then((c) => c.commands), this._logService);
    this._chatChannelUri = options.chatChannelUri;
    this._onDidSessionProgress = options.onDidSessionProgress;
    this._sessionLauncher = options.sessionLauncher;
    this._launchPlan = options.launchPlan;
    this._isLaunchTokenStillCurrent = options.isLaunchTokenCurrent ?? (() => true);
    this._onTurnEnded = options.onTurnEnded ?? (() => {
    });
    this._shellManager = options.shellManager;
    this._nonPtyShellTerminals = this._register(this._instantiationService.createInstance(NonPtyShellTerminalStreams, options.sessionUri));
    this._workingDirectory = options.workingDirectory;
    this._customizationDirectory = options.customizationDirectory;
    this._serverToolHost = options.serverToolHost;
    this._platform = options.platform ?? process.platform;
    this._telemetryReporter = new AgentHostTelemetryReporter(this._telemetryService);
    this._repoInfoTelemetry = this._register(this._instantiationService.createInstance(AgentHostRepoInfoTelemetry, this._telemetryReporter));
    this._appliedSnapshot = options.clientSnapshot ?? { tools: [], plugins: [], mcpServers: {} };
    this._clientToolNames = clientToolNamesFromSnapshot(this._appliedSnapshot);
    const model = this._launchPlan.kind === "create" ? this._launchPlan.model : this._launchPlan.fallback.model;
    const effectiveModel = applyModelFamilyAlias(model, this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.ModelCapabilityOverrides));
    this._toolSearchActive = this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.ToolSearchEnabled) === true && agentHostModelSupportsToolSearch(effectiveModel?.id) && this._clientToolNames.has(CLIENT_TOOL_SEARCH_REFERENCE_NAME);
    this._activeClientToolSet = options.activeClientToolSet ?? new ActiveClientToolSet();
    this._databaseRef = sessionDataService.openDatabase(this._storageUri);
    this._register(toDisposable(() => this._databaseRef.dispose()));
    this._sessionDataDir = sessionDataService.getSessionDataDir(this._storageUri);
    this._editTracker = this._instantiationService.createInstance(FileEditTracker, this._storageUri.toString(), this._databaseRef.object);
    this._mcpCustomizations = this._register(this._instantiationService.createInstance(McpCustomizationController, {
      providerId: this.sessionUri.scheme,
      sessionId: this.sessionId,
      sessionUri: this.sessionUri,
      resolveChildId: options.resolveMcpChildId,
      emit: (action) => this._emitAction(action)
    }));
    this._register(toDisposable(() => this._cancelAllPendingInteractions()));
    this._register(toDisposable(() => this._shellManager?.dispose()));
    this._register(toDisposable(() => this._drainPendingSteeringFlips()));
    if (this._shellManager) {
      this._register(this._shellManager.onDidAssociateTerminal(({ toolCallId, terminalUri, displayName }) => {
        const tracked = this._activeToolCalls.get(toolCallId);
        if (!tracked) {
          return;
        }
        tracked.content.push({
          type: ToolResultContentType.Terminal,
          resource: terminalUri,
          title: displayName
        });
        this._emitAction({
          type: ActionType.ChatToolCallContentChanged,
          turnId: this._turnId,
          toolCallId,
          content: tracked.content
        });
      }));
    }
  }
  /** Working directory this session operates in, if any. */
  get workingDirectory() {
    return this._workingDirectory;
  }
  /**
   * Protocol turn ID of the active turn, or `''` when idle. Used by file
   * edit tracking and emitted on per-turn actions.
   */
  get _turnId() {
    return this._currentTurn?.id ?? "";
  }
  /** 0-based ordinal of the active turn within the session, or `0` when idle. */
  get _turnOrdinal() {
    return this._currentTurn?.ordinal ?? 0;
  }
  /**
   * Whether the session currently has an in-flight turn. Used by
   * non-destructive idle release to avoid disconnecting mid-turn.
   */
  get hasActiveTurn() {
    return this._currentTurn !== void 0;
  }
  get currentTurnClientType() {
    return this._currentTurn?.clientType ?? AgentHostClientType.Unknown;
  }
  get _storageUri() {
    return isDefaultChatUri(this._chatChannelUri) ? this.sessionUri : this._chatChannelUri;
  }
  get mcpServerStates() {
    return this._mcpCustomizations.runtimeStates;
  }
  // ---- AgentSignal helpers ------------------------------------------------
  /** Wraps a {@link SessionAction} in an {@link AgentSignal} envelope and emits it. */
  /** todo@connor4312: AHP is missing a chat activity update action which is needed to drop `SessionAction` here */
  _emitAction(action, parentToolCallId) {
    this._onDidSessionProgress.fire({
      kind: "action",
      resource: isChatAction(action) ? this._chatChannelUri : this.sessionUri,
      action,
      parentToolCallId
    });
  }
  /**
   * Promotes a pending steering message into its own protocol turn:
   * closes the in-flight turn (so its responseParts settle into history)
   * and dispatches {@link ActionType.ChatTurnStarted} for a fresh
   * turn whose user message is the steering content. The action's
   * `queuedMessageId` atomically clears the corresponding pending
   * steering message from the session state.
   *
   * All subsequent SDK events (message deltas, tool calls, …) emitted
   * by the agent now reference the new `_turnId`, so the steering
   * response lands in the new turn rather than being folded into the
   * original.
   *
   * Returns the new turn id so callers (notably the `user.message`
   * handler) can associate the SDK event id with the steering turn for
   * history.truncate / sessions.fork mapping.
   */
  _beginSteeringTurn(steering) {
    this._completeActiveTurn();
    const newTurnId = generateUuid();
    this._emitAction({
      type: ActionType.ChatTurnStarted,
      turnId: newTurnId,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      message: steering.message,
      queuedMessageId: steering.id
    });
    this.resetTurnState(newTurnId);
    if (this._currentTurn) {
      this._currentTurn.messageCharLen = steering.message.text.length;
      this._currentTurn.markRunning();
    }
    return newTurnId;
  }
  /**
   * Drains any steering messages we acknowledged to the SDK but never
   * promoted to their own turn (e.g. on abort or session dispose). Fires
   * `steering_consumed` so the chat UI removes the lingering pending
   * steering bubble even when no fresh `user.message` arrives.
   */
  _drainPendingSteeringFlips() {
    if (this._pendingSteeringFlips.size === 0) {
      return;
    }
    const ids = [...this._pendingSteeringFlips.keys()];
    this._pendingSteeringFlips.clear();
    for (const id of ids) {
      this._onDidSessionProgress.fire({
        kind: "steering_consumed",
        chat: this._chatChannelUri,
        id
      });
    }
  }
  /**
   * Pops the buffered steering message whose text matches the SDK
   * `user.message` content we just observed. Matching by content (rather
   * than just popping FIFO) keeps us robust against the SDK reordering
   * or coalescing entries — concurrent steering messages with different
   * texts are still matched to the correct one. Returns `undefined` if
   * no buffered entry matches; the caller treats the `user.message` as
   * an ordinary echo and skips the turn flip.
   */
  _takeMatchingPendingSteering(content) {
    if (this._pendingSteeringFlips.size === 0) {
      return void 0;
    }
    for (const [id, msg] of this._pendingSteeringFlips) {
      if (msg.message.text === content) {
        this._pendingSteeringFlips.delete(id);
        return msg;
      }
    }
    return void 0;
  }
  _parentToolCallIdForSubagentEvent(e) {
    return e.agentId ? this._parentToolCallIdsByAgentId.get(e.agentId) : void 0;
  }
  _resumeSubagentForEvent(e, message) {
    if (!e.agentId || this._activeSubagentAgentIds.has(e.agentId)) {
      return;
    }
    const parentToolCallId = this._parentToolCallIdsByAgentId.get(e.agentId);
    if (!parentToolCallId) {
      return;
    }
    this._activeSubagentAgentIds.add(e.agentId);
    this._onDidSessionProgress.fire({
      kind: "subagent_resumed",
      chat: this._chatChannelUri,
      toolCallId: parentToolCallId,
      message
    });
  }
  _completeSubagentTurn(agentId, toolCallId) {
    if (agentId) {
      if (!this._activeSubagentAgentIds.delete(agentId)) {
        return;
      }
    } else if (!toolCallId) {
      return;
    }
    const parentToolCallId = toolCallId ?? (agentId ? this._parentToolCallIdsByAgentId.get(agentId) : void 0);
    if (!parentToolCallId) {
      return;
    }
    this._onDidSessionProgress.fire({
      kind: "subagent_completed",
      chat: this._chatChannelUri,
      toolCallId: parentToolCallId
    });
  }
  _shouldDropUnmappedSubagentEvent(e, eventName) {
    const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
    if (!parentToolCallId && e.agentId) {
      this._logService.warn(`[Copilot:${this.sessionId}] Dropping ${eventName} for unknown subagent agentId=${e.agentId}`);
      return true;
    }
    return false;
  }
  _getToolCallContributor(toolName, mcpServerName) {
    const clientToolName = this._clientToolName(toolName);
    if (this._clientToolNames.has(clientToolName)) {
      const clientId = this._activeClientToolSet.ownerOf(clientToolName, this._currentTurn?.senderClientId);
      return clientId ? { kind: ToolCallContributorKind.Client, clientId } : void 0;
    }
    if (mcpServerName) {
      const customizationId = this._mcpCustomizations.customizationIdForServer(mcpServerName);
      return customizationId ? { kind: ToolCallContributorKind.MCP, customizationId } : void 0;
    }
    return void 0;
  }
  _createToolCallMeta(toolName, parameters) {
    const toolKind = getToolKind(toolName);
    const subagentMeta = toolKind === "subagent" ? getSubagentMetadata(parameters) : void 0;
    return {
      toolKind,
      language: toolKind === "terminal" ? getShellLanguage(toolName) : void 0,
      subagentDescription: subagentMeta?.description,
      subagentAgentName: subagentMeta?.agentName
    };
  }
  _getStreamingToolCallDisplay(toolName, input) {
    const partialInput = parseCopilotStreamingToolInput(input);
    const parameters = partialInput !== null && typeof partialInput === "object" && !Array.isArray(partialInput) ? partialInput : void 0;
    return {
      parameters,
      meta: this._createToolCallMeta(toolName, parameters),
      invocationMessage: getStreamingInvocationMessage(toolName, getToolDisplayName(toolName), partialInput, (path) => this._resolveEditFilePath(path))
    };
  }
  _emitStreamingToolCallDisplay(toolCallId, streaming) {
    if (!streaming.toolName) {
      return;
    }
    const display = this._getStreamingToolCallDisplay(streaming.toolName, streaming.input);
    streaming.displayedInputLength = streaming.input.length;
    const message = streamingToolDisplayText(display.invocationMessage);
    if (message === streaming.displayedMessage) {
      return;
    }
    streaming.displayedMessage = message;
    this._emitAction({
      type: ActionType.ChatToolCallDelta,
      turnId: this._turnId,
      toolCallId,
      content: "",
      invocationMessage: display.invocationMessage,
      _meta: toToolCallMeta(display.meta)
    }, streaming.parentToolCallId);
  }
  _scheduleStreamingToolCallDisplay(toolCallId) {
    let scheduler = this._streamingToolDisplaySchedulers.get(toolCallId);
    if (!scheduler) {
      scheduler = new RunOnceScheduler(() => {
        const streaming = this._streamingToolCalls.get(toolCallId);
        if (!streaming?.started || !streaming.toolName) {
          return;
        }
        if (streaming.displayedInputLength === streaming.input.length) {
          return;
        }
        this._emitStreamingToolCallDisplay(toolCallId, streaming);
      }, STREAMING_TOOL_DISPLAY_INTERVAL_MS);
      this._streamingToolDisplaySchedulers.set(toolCallId, scheduler);
    }
    if (!scheduler.isScheduled()) {
      scheduler.schedule();
    }
  }
  _beginToolCallRound(parentToolCallId) {
    const scope = parentToolCallId ?? "";
    this._currentTurn?.markdownPartIds.delete(scope);
    this._currentTurn?.reasoningPartIds.delete(scope);
  }
  /**
   * Starts a fresh `pending` turn, discarding any per-turn streaming state
   * from a previous turn so the next text/reasoning chunk allocates a new
   * response part. The turn becomes `running` on the first SDK event.
   */
  resetTurnState(turnId, senderClientId, clientType = AgentHostClientType.Unknown) {
    this._streamingToolCalls.clear();
    this._streamingToolDisplaySchedulers.clearAndDisposeAll();
    this._currentTurn = new CopilotTurn(turnId, this._nextTurnOrdinal++, senderClientId, clientType);
  }
  /** Refreshes prompt-cache state and the session-wide nano-AIU total from the SDK's authoritative usage metrics. */
  async _refreshSessionUsageMetrics() {
    try {
      return await this._sessionUsageMetricsRefreshThrottler.queue(async () => {
        const promptCacheRefreshGeneration = this._promptCacheRefreshGeneration;
        const metrics = await this._wrapper.session.rpc.usage.getMetrics();
        const modelId = metrics.currentModel;
        if (!this._store.isDisposed && modelId && promptCacheRefreshGeneration === this._promptCacheRefreshGeneration) {
          const cacheExpiresAt = metrics.modelMetrics[modelId]?.cacheExpiresAt;
          this._setPromptCacheState(cacheExpiresAt ? { modelId, cacheExpiresAt } : void 0);
        }
        const total = metrics.totalNanoAiu;
        if (typeof total !== "number" || !Number.isFinite(total) || total < 0 || total === this._sessionTotalNanoAiu) {
          return false;
        }
        this._sessionTotalNanoAiu = total;
        return true;
      });
    } catch (err) {
      this._logService.trace(`[Copilot:${this.sessionId}] usage.getMetrics RPC failed: ${getErrorMessage(err)}`);
      return false;
    }
  }
  /**
   * The parent-scope Copilot billing metadata for the active turn: the turn's
   * own accumulated cost plus the SDK's session-wide total. Absent until
   * something has actually been billed.
   */
  _parentCopilotUsageMeta() {
    const turnNanoAiu = this._currentTurn?.copilotNanoAiu ?? 0;
    if (!turnNanoAiu && !this._sessionTotalNanoAiu) {
      return void 0;
    }
    return {
      ...turnNanoAiu ? { totalNanoAiu: turnNanoAiu } : {},
      ...this._sessionTotalNanoAiu ? { sessionTotalNanoAiu: this._sessionTotalNanoAiu } : {}
    };
  }
  /** Reads the SDK's per-source context-window attribution, or `undefined` when unavailable. */
  async _readContextAttribution() {
    let attribution;
    try {
      attribution = (await this._wrapper.session.rpc.metadata.getContextAttribution())?.contextAttribution ?? void 0;
    } catch (err) {
      this._logService.trace(`[Copilot:${this.sessionId}] contextAttribution RPC failed: ${getErrorMessage(err)}`);
      return void 0;
    }
    if (!attribution) {
      this._logService.trace(`[Copilot:${this.sessionId}] contextAttribution: null/empty`);
      return void 0;
    }
    if (this._logService.getLevel() <= LogLevel.Trace) {
      this._logService.trace(`[Copilot:${this.sessionId}] contextAttribution: totalTokens=${attribution.totalTokens}, entries=${JSON.stringify(attribution.entries.map((e) => ({ kind: e.kind, id: e.id, label: e.label, tokens: e.tokens, parentId: e.parentId })))}`);
    }
    return attribution;
  }
  _completeActiveTurn() {
    const turn = this._currentTurn;
    if (!turn) {
      return;
    }
    turn.markCompleted();
    this._reportToolCallDetails(turn, "success");
    this._emitAction({
      type: ActionType.ChatTurnComplete,
      turnId: turn.id,
      duration: turn.duration
    });
    this._clearActiveTurn();
  }
  /**
   * Drops the active turn and reports that this chat is now idle. Every
   * transition out of an in-flight turn must go through here so work the
   * agent defers while a turn runs — notably a pending CLI client restart —
   * is not stranded waiting on a turn that already ended.
   */
  _clearActiveTurn() {
    this._currentTurn = void 0;
    this._streamingToolCalls.clear();
    this._streamingToolDisplaySchedulers.clearAndDisposeAll();
    try {
      this._onTurnEnded();
    } catch (err) {
      this._logService.error(err, `[Copilot:${this.sessionId}] onTurnEnded callback failed`);
    }
  }
  _reportToolCallDetails(turn, responseType) {
    if (turn.toolCallDetailsReported) {
      return;
    }
    turn.toolCallDetailsReported = true;
    void this._telemetryReporter.toolCallDetails({
      provider: "copilot",
      session: this.sessionUri.toString(),
      turnId: turn.id,
      clientType: turn.clientType,
      model: turn.lastModel,
      responseType,
      toolCounts: Object.fromEntries(turn.toolCounts),
      availableTools: this._appliedSnapshot.tools.map((tool) => tool.name),
      numRequests: turn.toolCallRounds,
      turnIndex: turn.ordinal,
      turnDuration: turn.duration,
      messageCharLen: turn.messageCharLen,
      totalToolCalls: turn.totalToolCalls,
      parallelToolCallRounds: turn.parallelToolCallRounds,
      parallelToolCallsTotal: turn.parallelToolCallsTotal
    }).catch((err) => this._logService.trace(`[Copilot:${this.sessionId}] Telemetry emission failed: ${getErrorMessage(err)}`));
  }
  _reportToolApproval(toolCallId, toolName, mcpServerName) {
    const record = this._toolApprovalRecords.get(toolCallId);
    if (!toolName || isHiddenTool(toolName) || record?.reported) {
      return;
    }
    const confirmKind = mapPermissionResultToConfirmKind(record?.resultKind, record?.resolvedByHook === true);
    this._telemetryReporter.toolApproval({
      provider: "copilot",
      session: this.sessionUri.toString(),
      turnId: this._turnId,
      toolId: toolName,
      toolSourceKind: this._toolSourceKindFor(toolName, mcpServerName),
      confirmKind,
      confirmationNotNeededReason: confirmKind === "confirmationNotNeeded" && record?.resolvedByHook ? "other" : void 0,
      requestUnsandboxedExecution: record?.requestSandboxBypass ? true : void 0
    });
    if (record) {
      record.reported = true;
    }
  }
  _reportToolApprovalIfNoPermission(toolCallId) {
    const record = this._toolApprovalRecords.get(toolCallId);
    if (record && !record.permissionRequested) {
      this._reportToolApproval(toolCallId, record.toolName, record.mcpServerName);
    }
  }
  _toolSourceKindFor(toolName, mcpServerName) {
    if (mcpServerName) {
      return "mcp";
    }
    if (this._clientToolNames.has(toolName)) {
      return "client";
    }
    return "internal";
  }
  _getEditFilePaths(parameters) {
    return getEditFilePaths(parameters).map((path) => this._resolveEditFilePath(path));
  }
  _resolveEditFilePath(path) {
    if (isAbsolute(path) || !this._workingDirectory || this._workingDirectory.scheme !== Schemas.file) {
      return path;
    }
    return join(this._workingDirectory.fsPath, path);
  }
  /**
   * Emits a synthetic markdown content block for the active turn and
   * makes it the current markdown response part so that subsequent SDK
   * deltas append to it. Used by the agent to surface one-shot host
   * messages (e.g. the worktree-created announcement) at the top of the
   * first response.
   */
  emitInitialMarkdown(content) {
    this._emitMarkdownDelta(content);
  }
  /**
   * Emits a streaming text delta. The first delta of a turn allocates a
   * markdown response part; subsequent deltas append to it.
   */
  _emitMarkdownDelta(content, parentToolCallId) {
    const turn = this._currentTurn;
    if (!turn) {
      this._logService.error(`[Copilot:${this.sessionId}] Markdown delta emitted with no active turn; dropping`);
      return;
    }
    const markdownScope = parentToolCallId ?? "";
    let partId = turn.markdownPartIds.get(markdownScope);
    if (!partId) {
      partId = generateUuid();
      turn.markdownPartIds.set(markdownScope, partId);
      this._emitAction({
        type: ActionType.ChatResponsePart,
        turnId: turn.id,
        part: { kind: ResponsePartKind.Markdown, id: partId, content }
      }, parentToolCallId);
      return;
    }
    this._emitAction({
      type: ActionType.ChatDelta,
      turnId: turn.id,
      partId,
      content
    }, parentToolCallId);
  }
  /** Emits a reasoning delta, similar to {@link _emitMarkdownDelta} but for reasoning parts. */
  _emitReasoningDelta(content, parentToolCallId) {
    const turn = this._currentTurn;
    if (!turn) {
      this._logService.error(`[Copilot:${this.sessionId}] Reasoning delta emitted with no active turn; dropping`);
      return;
    }
    const reasoningScope = parentToolCallId ?? "";
    let partId = turn.reasoningPartIds.get(reasoningScope);
    if (!partId) {
      partId = generateUuid();
      turn.reasoningPartIds.set(reasoningScope, partId);
      this._emitAction({
        type: ActionType.ChatResponsePart,
        turnId: turn.id,
        part: { kind: ResponsePartKind.Reasoning, id: partId, content }
      }, parentToolCallId);
      return;
    }
    this._emitAction({
      type: ActionType.ChatReasoning,
      turnId: turn.id,
      partId,
      content
    }, parentToolCallId);
  }
  /**
   * The snapshot of client contributions captured when this session was
   * created. Used by the agent to detect when the session is 1stale.
   */
  get appliedSnapshot() {
    return this._appliedSnapshot;
  }
  get customizationDirectory() {
    return this._customizationDirectory;
  }
  /**
   * Creates SDK {@link Tool} objects for the client-provided tools in the
   * applied snapshot. The handler parks a request in
   * {@link _pendingClientToolCalls} and waits for the client to dispatch
   * `session/toolCallComplete`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _createClientSdkTools() {
    const tools = this._appliedSnapshot.tools;
    if (tools.length === 0) {
      return [];
    }
    const toolSearchActive = this._isToolSearchActive();
    const sessionTools = toolSearchActive ? tools : tools.filter((def) => def.name !== CLIENT_TOOL_SEARCH_REFERENCE_NAME);
    return sessionTools.map((def) => {
      if (toolSearchActive && def.name === CLIENT_TOOL_SEARCH_REFERENCE_NAME) {
        return {
          name: RUNTIME_TOOL_SEARCH_TOOL_NAME,
          description: def.description ?? "",
          parameters: def.inputSchema ?? { type: "object", properties: {} },
          overridesBuiltInTool: true,
          defer: "never",
          skipPermission: true,
          handler: this._guarded(async (_args, invocation) => {
            try {
              const candidates = this._toToolSearchCandidates(invocation.availableTools);
              const clientResult = await this._pendingClientToolCalls.registerAndFire(
                invocation.toolCallId,
                () => this._emitToolSearchReady(invocation.toolCallId, candidates)
              );
              return this._toToolSearchResult(clientResult, invocation.availableTools);
            } catch (error) {
              this._logService.error(error, `[Copilot:${this.sessionId}] Failed in tool-search handler: toolCallId=${invocation.toolCallId}`);
              return this._toolSearchFailure(getErrorMessage(error));
            }
          }, this._toolSearchFailure("Tool call cancelled: session is aborting"), "tool-search")
        };
      }
      const defer = toolSearchActive ? NON_DEFERRED_CLIENT_TOOL_NAMES.has(def.name) ? "never" : "auto" : void 0;
      return {
        name: def.name,
        description: def.description ?? "",
        parameters: def.inputSchema ?? { type: "object", properties: {} },
        defer,
        handler: this._guarded(async (_args, { toolCallId }) => {
          try {
            return await this._pendingClientToolCalls.register(toolCallId);
          } catch (error) {
            this._logService.error(error, `[Copilot:${this.sessionId}] Failed in client tool handler: tool=${def.name}, toolCallId=${toolCallId}`);
            throw error;
          }
        }, this._toolSearchFailure("Tool call cancelled: session is aborting"), "client-tool")
      };
    });
  }
  _isToolSearchActive() {
    return this._toolSearchActive;
  }
  get _abortToken() {
    return this._abortCts.value?.token ?? CancellationToken.Cancelled;
  }
  _beginAbort() {
    if (this._abortToken.isCancellationRequested) {
      return;
    }
    this._abortCts.value?.cancel();
    this._cancelAllPendingInteractions();
  }
  _resetAbortToken() {
    this._abortCts.value = new CancellationTokenSource();
  }
  /**
   * Guards SDK callbacks against aborts: the synchronous pre-check avoids the `shortcutEvent` macrotask for already-cancelled tokens, while the race releases callbacks that park after the abort sweep.
   * The post-race check catches handler completions that win the cancellation macrotask because promise continuations run as microtasks.
   */
  _guarded(handler, cancelled, label) {
    return async (...args) => {
      const token = this._abortToken;
      if (token.isCancellationRequested) {
        this._logService.info(`[Copilot:${this.sessionId}] Discarding ${label} callback received while aborting`);
        return cancelled;
      }
      const result = await raceCancellation(handler(...args), token, cancelled);
      if (token.isCancellationRequested) {
        this._logService.info(`[Copilot:${this.sessionId}] Discarding ${label} callback result after abort`);
        return cancelled;
      }
      return result;
    };
  }
  _clientToolName(toolName) {
    return this._isToolSearchActive() && toolName === RUNTIME_TOOL_SEARCH_TOOL_NAME ? CLIENT_TOOL_SEARCH_REFERENCE_NAME : toolName;
  }
  _toToolSearchCandidates(availableTools) {
    return (availableTools ?? []).filter((tool) => tool.deferLoading).map((tool) => ({
      name: tool.name,
      description: tool.description ?? ""
    }));
  }
  _emitToolSearchReady(toolCallId, candidates) {
    const tracked = this._activeToolCalls.get(toolCallId);
    if (!tracked) {
      throw new Error(`Tool-search call '${toolCallId}' was not tracked.`);
    }
    this._emitAction({
      type: ActionType.ChatToolCallReady,
      turnId: this._turnId,
      toolCallId,
      ...tracked.contributor ? { contributor: tracked.contributor } : {},
      ...tracked.intention !== void 0 ? { intention: tracked.intention } : {},
      invocationMessage: getInvocationMessage(tracked.toolName, tracked.displayName, tracked.parameters, (path) => this._resolveEditFilePath(path)),
      toolInput: getToolInputString(tracked.toolName, tracked.parameters, tracked.parameters ? tryStringify(tracked.parameters) : void 0),
      confirmed: ToolCallConfirmationReason.NotNeeded,
      _meta: toToolCallMeta({ ...tracked.meta ?? {}, toolSearchCandidates: candidates })
    }, tracked.parentToolCallId);
  }
  _toolSearchFailure(message) {
    return { textResultForLlm: message, resultType: "failure", error: message, toolReferences: [] };
  }
  _toToolSearchResult(clientResult, availableTools) {
    const deferred = /* @__PURE__ */ new Set();
    for (const tool of availableTools ?? []) {
      if (tool.deferLoading) {
        deferred.add(tool.name);
        if (tool.namespacedName) {
          deferred.add(tool.namespacedName);
        }
      }
    }
    const clientNames = this._parseToolSearchNames(clientResult.textResultForLlm);
    const toolReferences = clientNames.filter((name) => deferred.has(name));
    this._logService.info(`[Copilot:${this.sessionId}] tool_search override: availableTools=${availableTools?.length ?? 0}, deferred=${deferred.size}, clientMatched=[${clientNames.join(", ")}] -> toolReferences=[${toolReferences.join(", ")}]`);
    return { ...clientResult, toolReferences };
  }
  _parseToolSearchNames(text) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed.filter((name) => typeof name === "string") : [];
    } catch {
      return [];
    }
  }
  /**
   * Builds SDK tool handlers for the agent host's server tools. Each handler
   * executes the tool against this session's state via the
   * {@link IAgentServerToolHost} and returns its textual result. Returns an
   * empty list when no server-tool host is wired (e.g. test / standalone
   * construction).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _createServerSdkTools() {
    const host = this._serverToolHost;
    if (!host) {
      return [];
    }
    return host.definitions.map((def) => ({
      name: def.name,
      description: def.description ?? "",
      parameters: def.inputSchema ?? { type: "object", properties: {} },
      defer: "never",
      handler: async (args) => {
        try {
          const text = host.executeTool(this._chatChannelUri.toString(), def.name, args);
          return { textResultForLlm: await text, resultType: "success" };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this._logService.error(error, `[Copilot:${this.sessionId}] Failed in server tool handler: tool=${def.name}`);
          return { textResultForLlm: message, resultType: "failure", error: message };
        }
      }
    }));
  }
  /**
   * Resolves a pending client tool call. If the SDK handler has not yet
   * registered for `toolCallId`, the result is buffered so the handler
   * resolves immediately once it does.
   */
  handleClientToolCallComplete(toolCallId, result) {
    this._approvedDuplicablePermissionSignatures.delete(toolCallId);
    if (!result.success && this._cancelMcpAuthenticationForToolCall(toolCallId)) {
      this._activeToolCalls.delete(toolCallId);
      return;
    }
    const textContent = result.content?.filter((c) => c.type === ToolResultContentType.Text).map((c) => c.text).join("\n") ?? "";
    const binaryResults = result.content?.filter((c) => c.type === ToolResultContentType.EmbeddedResource).map((c) => ({ data: c.data, mimeType: c.contentType, type: /^image(\/|$)/.test(c.contentType) ? "image" : "resource" }));
    const textResultForLlm = textContent.trim() ? textContent : getEmptyToolResultText(binaryResults);
    if (result.success) {
      this._pendingClientToolCalls.respondOrBuffer(toolCallId, {
        textResultForLlm,
        resultType: "success",
        binaryResultsForLlm: binaryResults?.length ? binaryResults : void 0
      });
    } else {
      this._pendingClientToolCalls.respondOrBuffer(toolCallId, {
        textResultForLlm: textContent.trim() ? textContent : result.error?.message || "Tool call failed",
        resultType: "failure",
        error: result.error?.message,
        binaryResultsForLlm: binaryResults?.length ? binaryResults : void 0
      });
    }
    if (this._pendingPermissions.getMetadata(toolCallId)?.managedApprovalRequired !== true) {
      this.respondToPermissionRequest(toolCallId, true);
    }
  }
  _cancelMcpAuthenticationForToolCall(toolCallId) {
    for (const [requestId, pending] of this._pendingMcpAuthRequests.entries()) {
      const toolCallIndex = pending.toolCalls.findIndex((toolCall) => toolCall.toolCallId === toolCallId);
      if (toolCallIndex === -1) {
        continue;
      }
      pending.toolCalls.splice(toolCallIndex, 1);
      if (pending.toolCalls.length === 0) {
        this._pendingMcpAuthRequests.respond(requestId, { kind: "cancelled" });
      }
      return true;
    }
    return false;
  }
  /**
   * Creates (or resumes) the SDK session via the injected launcher and
   * wires up all event listeners. Must be called exactly once after
   * construction before using the session.
   */
  async initializeSession() {
    const wrapper = await this._sessionLauncher.launch(this._launchPlan, this._createRuntimeAdapter());
    if (this._store.isDisposed) {
      wrapper.dispose();
      throw new CancellationError();
    }
    this._wrapper = this._register(wrapper);
    this._subscribeToEvents();
    this._subscribeForLogging();
    this._subscribeForMemoInvalidation();
    this._subscribeForInstructionsCollectedTelemetry();
    this._subscribeToPermissionConfigChanges();
    this._promptCacheState = readSessionPromptCacheState(this._stateManager.getSessionSummary(this.sessionUri.toString())?._meta);
    if (this._launchPlan.kind === "resume") {
      await this._refreshSessionUsageMetrics();
      if (this._store.isDisposed) {
        throw new CancellationError();
      }
    }
    this._serverToolHost?.advertise(this._storageUri.toString());
  }
  _setPromptCacheState(promptCache) {
    const currentSummary = this._stateManager.getSessionSummary(this.sessionUri.toString());
    const currentMeta = currentSummary?._meta;
    const currentPromptCache = currentSummary ? readSessionPromptCacheState(currentMeta) : this._promptCacheState;
    this._promptCacheState = currentPromptCache;
    if (currentPromptCache?.modelId === promptCache?.modelId && currentPromptCache?.cacheExpiresAt === promptCache?.cacheExpiresAt) {
      return;
    }
    this._promptCacheState = promptCache;
    this._stateManager.setSessionMeta(this.sessionUri.toString(), withSessionPromptCacheState(currentMeta, promptCache));
  }
  _createRuntimeAdapter() {
    return {
      handlePermissionRequest: this._guarded((request) => this._handlePermissionRequest(request), { kind: "reject" }, "permission"),
      handleExitPlanModeRequest: this._guarded((request, invocation) => this._handleExitPlanModeRequest(request, invocation), { approved: false }, "exit-plan-mode"),
      handleUserInputRequest: this._guarded((request, invocation) => this._handleUserInputRequest(request, invocation), { answer: "", wasFreeform: true }, "user-input"),
      handleElicitationRequest: this._guarded((context) => this._handleElicitationRequest(context), { action: "cancel" }, "elicitation"),
      handleMcpAuthRequest: this._guarded((request) => this._handleMcpAuthRequest(request), { kind: "cancelled" }, "mcp-auth"),
      requestUnsandboxedCommandConfirmation: this._guarded((request) => this._requestUnsandboxedCommandConfirmation(request), false, "unsandboxed-command-confirmation"),
      createClientSdkTools: () => this._createClientSdkTools(),
      createServerSdkTools: () => this._createServerSdkTools(),
      handlePreToolUse: (input) => this._handlePreToolUse(input),
      handlePostToolUse: (input) => this._handlePostToolUse(input)
    };
  }
  async resolveMcpAuthentication(params) {
    let resolved = false;
    for (const [requestId, pending] of this._pendingMcpAuthRequests.entries()) {
      if (pending.resource.resource !== params.resource || !this._scopesSatisfy(params.scopes, pending.requiredScopes)) {
        continue;
      }
      for (const toolCall of pending.toolCalls) {
        this._emitAction({
          type: ActionType.ChatToolCallAuthResolved,
          turnId: toolCall.turnId,
          toolCallId: toolCall.toolCallId
        }, toolCall.parentToolCallId);
      }
      resolved = this._pendingMcpAuthRequests.respond(requestId, { kind: "token", accessToken: params.token }) || resolved;
    }
    return resolved;
  }
  async _handleMcpAuthRequest(request) {
    const githubToken = request.reason === "initial" && this._scopesFromChallenge(request.wwwAuthenticateParams?.scope).length === 0 ? await this._initialGitHubMcpToken(request) : void 0;
    if (githubToken) {
      this._logService.info(`[Copilot:${this.sessionId}] Reusing the existing GitHub token for initial GitHub MCP authentication`);
      return { kind: "token", accessToken: githubToken };
    }
    const resource = this._protectedResourceFromMcpAuthRequest(request);
    const requiredScopes = this._scopesFromChallenge(request.wwwAuthenticateParams?.scope);
    const oauthClient = request.staticClientConfig?.publicClient ? { clientId: request.staticClientConfig.clientId } : request.staticClientConfig?.clientSecret ? { clientId: request.staticClientConfig.clientId, clientSecret: request.staticClientConfig.clientSecret } : void 0;
    const auth = {
      reason: this._mcpAuthRequiredReason(request.reason),
      ...oauthClient ? { oauthClient } : {},
      resource,
      requiredScopes: requiredScopes.length ? [...requiredScopes] : void 0,
      description: request.wwwAuthenticateParams?.error
    };
    const toolCalls = this._activeMcpToolCalls(request.serverName);
    const result = this._pendingMcpAuthRequests.register(request.requestId, {
      serverName: request.serverName,
      resource,
      requiredScopes,
      toolCalls
    });
    this._mcpCustomizations.applyOne({
      name: request.serverName,
      state: {
        kind: McpServerStatus.AuthRequired,
        ...auth
      }
    });
    for (const toolCall of toolCalls) {
      this._emitAction({
        type: ActionType.ChatToolCallAuthRequired,
        turnId: toolCall.turnId,
        toolCallId: toolCall.toolCallId,
        auth
      }, toolCall.parentToolCallId);
    }
    this._logService.info(`[Copilot:${this.sessionId}] MCP server '${request.serverName}' requires authentication for ${resource.resource}`);
    return result;
  }
  _activeMcpToolCalls(serverName) {
    if (!this._turnId) {
      return [];
    }
    const result = [];
    for (const [toolCallId, toolCall] of this._activeToolCalls) {
      if (toolCall.mcpServerName === serverName) {
        result.push({ turnId: this._turnId, toolCallId, parentToolCallId: toolCall.parentToolCallId });
      }
    }
    return result;
  }
  async _initialGitHubMcpToken(request) {
    const githubToken = this._launchPlan.githubToken;
    const requestUrl = normalizeMcpServerUrl(request.serverUrl);
    if (!githubToken || requestUrl === void 0) {
      return void 0;
    }
    const configuredUrls = [gitHubMcpServerUrl(void 0)];
    try {
      const resolvedUrl = gitHubMcpServerUrl(await this._copilotApiService.resolveApiEndpoint(githubToken));
      if (resolvedUrl) {
        configuredUrls.push(resolvedUrl);
      }
    } catch (error) {
      this._logService.warn(`[Copilot:${this.sessionId}] Failed to resolve the GitHub MCP server URL: ${getErrorMessage(error)}`);
      return void 0;
    }
    return configuredUrls.some((u) => u && requestUrl === normalizeMcpServerUrl(u)) ? githubToken : void 0;
  }
  _protectedResourceFromMcpAuthRequest(request) {
    if (request.resourceMetadata) {
      try {
        const parsed = JSON.parse(request.resourceMetadata);
        if (isAuthorizationProtectedResourceMetadata(parsed)) {
          return parsed;
        }
        this._logService.warn(`[Copilot:${this.sessionId}] Ignoring invalid MCP protected-resource metadata for '${request.serverName}'`);
      } catch (err) {
        this._logService.warn(`[Copilot:${this.sessionId}] Failed to parse MCP protected-resource metadata for '${request.serverName}'`, err);
      }
    }
    const scopes = this._scopesFromChallenge(request.wwwAuthenticateParams?.scope);
    return {
      resource: request.serverUrl,
      resource_name: request.serverName,
      scopes_supported: scopes.length ? scopes.slice() : void 0
    };
  }
  _scopesFromChallenge(scope) {
    return scope?.split(/\s+/).map((s) => s.trim()).filter((s) => s.length > 0) ?? [];
  }
  _mcpAuthRequiredReason(reason) {
    switch (reason) {
      case "refresh":
      case "reauth":
        return McpAuthRequiredReason.Expired;
      case "upscope":
        return McpAuthRequiredReason.InsufficientScope;
      case "initial":
      default:
        return McpAuthRequiredReason.Required;
    }
  }
  _scopesSatisfy(provided, required) {
    if (required.length === 0 || provided === void 0) {
      return true;
    }
    const providedSet = new Set(provided);
    return required.every((scope) => providedSet.has(scope));
  }
  _cancelPendingMcpAuthRequests() {
    this._pendingMcpAuthRequests.denyAll({ kind: "cancelled" });
  }
  _cancelPendingMcpAuthRequestsForServer(serverName) {
    for (const [requestId, pending] of this._pendingMcpAuthRequests.entries()) {
      if (pending.serverName !== serverName) {
        continue;
      }
      for (const toolCall of pending.toolCalls) {
        this._emitAction({
          type: ActionType.ChatToolCallAuthResolved,
          turnId: toolCall.turnId,
          toolCallId: toolCall.toolCallId
        }, toolCall.parentToolCallId);
      }
      this._pendingMcpAuthRequests.respond(requestId, { kind: "cancelled" });
    }
  }
  // ---- session operations -------------------------------------------------
  async send(prompt, attachments, turnId, mode, senderClientId, clientType = AgentHostClientType.Unknown) {
    this._resetAbortToken();
    if (turnId && this._currentTurn?.id !== turnId) {
      this.resetTurnState(turnId, senderClientId, clientType);
    }
    if (this._currentTurn) {
      this._currentTurn.messageCharLen = prompt.length;
    }
    const turn = this._currentTurn;
    try {
      await this._send(prompt, attachments, mode);
    } catch (err) {
      if (turn && this._currentTurn === turn) {
        this._clearActiveTurn();
      }
      throw err;
    }
  }
  async _send(prompt, attachments, mode) {
    this._logService.info(`[Copilot:${this.sessionId}] sendMessage called: "${prompt.substring(0, 100)}${prompt.length > 100 ? "..." : ""}" (${attachments?.length ?? 0} attachments)`);
    const slashCommand = parseLeadingSlashCommand(prompt);
    if (slashCommand?.command === "compact") {
      try {
        const result = await this._wrapper.session.rpc.history.compact();
        const usedTokens = result.contextWindow?.currentTokens;
        if (typeof usedTokens === "number") {
          await this._refreshSessionUsageMetrics();
          const copilotUsage = this._parentCopilotUsageMeta();
          this._emitAction({
            type: ActionType.ChatUsage,
            turnId: this._turnId,
            usage: {
              inputTokens: usedTokens,
              outputTokens: 0,
              model: this._lastSeenModelId,
              ...copilotUsage ? { _meta: { copilotUsage } } : {}
            }
          });
        }
        this.emitInitialMarkdown(localize("copilotAgent.compactionCompleted", "Compaction completed"));
      } catch (err) {
        if (getErrorMessage(err).toLowerCase().includes("nothing to compact")) {
          this.emitInitialMarkdown(localize("copilotAgent.compactionCompleted", "Compaction completed"));
          this._completeActiveTurn();
          return;
        }
        this._logService.error(err, `[Copilot:${this.sessionId}] rpc.history.compact failed`);
        throw err;
      }
      this._completeActiveTurn();
      return;
    }
    const configAction = slashCommand ? resolveCopilotConfigSlashCommandOnSend(slashCommand.command, slashCommand.rawRest) : void 0;
    if (configAction) {
      const sdkMode = toCopilotSdkMode(configAction.applyConfig[SessionConfigKey.Mode]);
      if (sdkMode) {
        mode = sdkMode;
      }
      prompt = configAction.strippedPrompt;
    } else if (slashCommand?.command === "rubber-duck") {
      if (this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.RubberDuck) !== true) {
        prompt = slashCommand.rest;
      } else {
        const userPrompt = slashCommand.rest;
        prompt = userPrompt ? `The user has requested a rubber duck review via the /rubber-duck command. Use the task tool with agent_type: "rubber-duck" to get an independent critique of your current approach, plan, or recent work. Summarize the relevant context for the rubber duck agent so it has what it needs to evaluate it.

Additional instructions: ${userPrompt}` : 'The user has requested a rubber duck review via the /rubber-duck command. Use the task tool with agent_type: "rubber-duck" to get an independent critique of your current approach, plan, or recent work. Summarize the relevant context for the rubber duck agent so it has what it needs to evaluate it.';
      }
    } else if (slashCommand) {
      const runtimeSlashCommand = await this._slashCommandProvider.resolveSlashCommand(slashCommand.command);
      if (runtimeSlashCommand && runtimeSlashCommand.kind !== "skill") {
        let result;
        try {
          result = await this._wrapper.session.rpc.commands.invoke({
            name: runtimeSlashCommand.name,
            ...slashCommand.rawRest.length > 0 ? { input: slashCommand.rawRest } : {}
          });
        } catch (err) {
          this._logService.error(err, `[Copilot:${this.sessionId}] rpc.commands.invoke(${slashCommand.command}) failed`);
          throw err;
        }
        switch (result.kind) {
          case "text":
            this._emitMarkdownDelta(result.markdown === true ? result.text : escapeMarkdownSyntaxTokens(result.text));
            break;
          case "completed":
            if (result.message) {
              this._emitMarkdownDelta(result.message);
            }
            break;
          case "agent-prompt": {
            const runtimeMode = toCopilotSdkMode(result.mode);
            if (runtimeMode) {
              mode = runtimeMode;
            }
            prompt = result.prompt;
            break;
          }
          case "select-subcommand":
            this._emitMarkdownDelta(localize(
              "copilotSlashCommand.selectSubcommandResult",
              "The /{0} command requires selecting a subcommand. Available options: {1}",
              result.command,
              result.options.map((option) => option.name).join(", ")
            ));
            break;
          default:
            this._logService.warn(`[Copilot:${this.sessionId}] Unhandled slash command result kind: ${result.kind}`);
            break;
        }
        if (result.runtimeSettingsChanged === true) {
          this._slashCommandProvider.clearCache();
        }
        if (result.kind !== "agent-prompt") {
          this._completeActiveTurn();
          return;
        }
      }
    }
    const sdkAttachments = attachments?.length ? (await Promise.all(attachments.map((a) => this._toSdkAttachment(a)))).filter(isDefined) : void 0;
    if (sdkAttachments?.length) {
      this._logService.trace(`[Copilot:${this.sessionId}] Attachments: ${JSON.stringify(sdkAttachments.map((a) => ({ type: a.type })))}`);
    }
    await this.applyMode(mode);
    await this.syncPermissionMode("turn-start");
    await this._applyEffectiveSandboxConfig();
    await this._reconcileMcpServerEnablement();
    await this._wrapper.session.send({ prompt, attachments: sdkAttachments?.length ? sdkAttachments : void 0 });
    this._logService.info(`[Copilot:${this.sessionId}] session.send() returned`);
  }
  async hasRuntimeSlashCommand(command) {
    try {
      return !!await this._slashCommandProvider.resolveSlashCommand(command);
    } catch (err) {
      this._logService.warn(`[Copilot:${this.sessionId}] rpc.commands.list failed`, err);
      return false;
    }
  }
  async getRuntimeSlashCommands(options) {
    try {
      return await this._slashCommandProvider.getSlashCommands(options);
    } catch (err) {
      this._logService.warn(`[Copilot:${this.sessionId}] rpc.commands.list failed`, err);
      return [];
    }
  }
  /**
   * Translate a protocol {@link MessageAttachment} into the Copilot CLI SDK's `attachments` payload shape. Resource
   * attachments map to the SDK's reference-style `file`/`directory`/`selection` variants (the
   * {@link MessageAttachmentBase.displayKind} advisory hint controls which one). Embedded resources (e.g. inline
   * image bytes, or unsaved editor content) map to the SDK's `blob` variant, and simple attachments with a model
   * representation map to `text/plain` blob attachments.
   *
   * Any Resource attachment carrying a {@link TextSelection} (e.g. `displayKind === 'selection'` or `'symbol'`) is
   * mapped to the SDK's `selection` variant so the range survives the round-trip — keying off the `selection` field
   * rather than just `displayKind` avoids symbol attachments degrading to a plain file reference (#315193). For those
   * we read the resource content from disk and slice it by the carried range (the protocol's {@link TextSelection}
   * only carries the range, not the inline text); on read failure the selection downgrades to a plain file reference.
   * A textual embedded resource already carries the exact inline text to send (the whole live buffer for a document,
   * or just the selected text for a selection), so it is forwarded as-is without further slicing.
   */
  async _toSdkAttachment(attachment) {
    if (isAgentFeedbackAnnotationsAttachment(attachment)) {
      const rendered = renderAgentFeedbackAnnotationsAttachment(attachment);
      if (!rendered) {
        return void 0;
      }
      return {
        type: "blob",
        data: encodeBase64(VSBuffer.fromString(rendered)),
        mimeType: "text/plain",
        displayName: attachment.label
      };
    }
    if (attachment.type === MessageAttachmentKind.Simple) {
      if (attachment.modelRepresentation) {
        return {
          type: "blob",
          data: encodeBase64(VSBuffer.fromString(attachment.modelRepresentation)),
          mimeType: addSimpleAttachmentDisplayKindToMimeType(attachment),
          displayName: attachment.label
        };
      }
      return void 0;
    }
    if (attachment.type === MessageAttachmentKind.EmbeddedResource) {
      return { type: "blob", data: attachment.data, mimeType: attachment.contentType, displayName: attachment.label };
    }
    if (attachment.type !== MessageAttachmentKind.Resource) {
      return void 0;
    }
    const uri = URI.parse(attachment.uri);
    const path = uri.scheme === "file" ? uri.fsPath : uri.toString();
    const displayName = attachment.label ?? path;
    if (attachment.selection) {
      try {
        const text = await this._readSelectedText(uri, attachment.selection.range);
        return { type: "selection", filePath: path, displayName, text, selection: attachment.selection.range };
      } catch (err) {
        this._logService.warn(`[Copilot:${this.sessionId}] Failed to read selected text for ${uri.toString()}: ${err}`);
        return { type: "file", path, displayName };
      }
    }
    if (attachment.displayKind === "selection") {
      return { type: "file", path, displayName };
    }
    const type = attachment.displayKind === "directory" ? "directory" : "file";
    return { type, path, displayName };
  }
  async _readSelectedText(uri, range) {
    const content = await this._fileService.readFile(uri);
    const text = content.value.toString();
    const lines = splitLinesIncludeSeparators(text);
    const start = this._getOffsetAt(lines, range.start);
    const end = this._getOffsetAt(lines, range.end);
    return text.substring(start, Math.max(start, end));
  }
  _getOffsetAt(lines, position) {
    const line = Math.max(0, Math.min(position.line, lines.length - 1));
    let offset = 0;
    for (let i = 0; i < line; i++) {
      offset += lines[i].length;
    }
    const lineText = lines[line].replace(/\r\n|\r|\n$/, "");
    return offset + Math.max(0, Math.min(position.character, lineText.length));
  }
  /**
   * Pushes `mode` to the SDK via `rpc.mode.set` if it differs from the
   * last applied value. Failures are logged and swallowed so that mode
   * propagation does not block the turn.
   */
  async applyMode(mode) {
    if (!mode || mode === this._lastAppliedMode) {
      return;
    }
    try {
      await this._wrapper.session.rpc.mode.set({ mode });
      this._lastAppliedMode = mode;
      this._logService.info(`[Copilot:${this.sessionId}] rpc.mode.set succeeded: mode=${mode}`);
    } catch (err) {
      this._logService.error(err, `[Copilot:${this.sessionId}] rpc.mode.set failed: mode=${mode}`);
    }
  }
  /**
   * `true` when the session's effective `mode` is `autopilot` — the
   * autonomous, continue-until-done mode in which no user is available to
   * answer questions or fill in elicitation forms.
   */
  _isAutopilotMode() {
    return this._configurationService.getEffectiveValue(this._storageUri.toString(), platformSessionSchema, SessionConfigKey.Mode) === "autopilot";
  }
  /**
   * Whether VS Code's auto-reply setting is enabled in the root config.
   */
  _isAutoReplyEnabled() {
    return this._configurationService.getRootValue(platformRootSchema, AgentHostAutoReplyEnabledConfigKey) === true;
  }
  async sendSteering(steeringMessage) {
    if (this._steeringMessagesInFlight.has(steeringMessage.id) || this._pendingSteeringFlips.has(steeringMessage.id)) {
      return;
    }
    this._steeringMessagesInFlight.add(steeringMessage.id);
    this._logService.info(`[Copilot:${this.sessionId}] Sending steering message: "${steeringMessage.message.text.substring(0, 100)}"`);
    try {
      await this._reconcileMcpServerEnablement();
      this._pendingSteeringFlips.set(steeringMessage.id, steeringMessage);
      await this._wrapper.session.send({
        prompt: steeringMessage.message.text,
        mode: "immediate"
      });
    } catch (err) {
      this._pendingSteeringFlips.delete(steeringMessage.id);
      this._logService.error(`[Copilot:${this.sessionId}] Steering message failed`, err);
    } finally {
      this._steeringMessagesInFlight.delete(steeringMessage.id);
    }
  }
  async getMessages() {
    const result = await this._getMappedEvents();
    return result.turns;
  }
  async getSubagentMessages(parentToolCallId) {
    const result = await this._getMappedEvents();
    const turns = result.subagentTurnsByToolCallId.get(parentToolCallId) ?? [];
    return turns;
  }
  /**
   * Returns the subagent child sessions discoverable in this session's event
   * log, derived from the same {@link mapSessionEvents} reconstruction used
   * for {@link getMessages}/{@link getSubagentMessages}. Lets a parent
   * restore register every child up-front instead of each child re-fetching
   * and re-reconstructing the full parent event log.
   */
  async getSubagentSessions() {
    const result = await this._getMappedEvents();
    if (result.subagentTurnsByToolCallId.size === 0) {
      return [];
    }
    const parentSessionStr = this._storageUri.toString();
    const out = [];
    for (const turn of result.turns) {
      for (const rp of turn.responseParts) {
        if (rp.kind !== ResponsePartKind.ToolCall) {
          continue;
        }
        const tc = rp.toolCall;
        const childTurns = result.subagentTurnsByToolCallId.get(tc.toolCallId);
        if (!childTurns || childTurns.length === 0) {
          continue;
        }
        const content = tc.content;
        const subagentContent = content ? getToolSubagentContent({ content }) : void 0;
        const taskDescription = readToolCallMeta(tc).subagentDescription;
        out.push({
          resource: URI.parse(buildSubagentSessionUri(parentSessionStr, tc.toolCallId)),
          toolCallId: tc.toolCallId,
          title: subagentChatTitle(taskDescription, subagentContent?.title),
          turns: childTurns
        });
      }
    }
    return out;
  }
  _getMappedEvents() {
    if (!this._mappedEventsMemo) {
      const pending = this._computeMappedEvents();
      this._mappedEventsMemo = pending;
      pending.catch(() => {
        if (this._mappedEventsMemo === pending) {
          this._mappedEventsMemo = void 0;
        }
      });
    }
    return this._mappedEventsMemo;
  }
  async _computeMappedEvents() {
    const events = await this._wrapper.session.getEvents();
    let db;
    try {
      db = this._databaseRef.object;
    } catch {
    }
    const result = await mapSessionEvents(this._storageUri, db, events, {
      workingDirectory: this._workingDirectory,
      model: this._launchPlan.kind === "create" ? this._launchPlan.model : this._launchPlan.fallback.model
    });
    return result;
  }
  /** Drop the memoized event reconstruction; the next read rebuilds it. */
  _invalidateMappedEvents() {
    this._mappedEventsMemo = void 0;
  }
  async abort() {
    this._logService.info(`[Copilot:${this.sessionId}] Aborting session...`);
    this._beginAbort();
    this._drainPendingSteeringFlips();
    try {
      await this._wrapper.session.abort();
    } catch (error) {
      this._resetAbortToken();
      throw error;
    }
  }
  /**
   * Aborts before tearing down so that in-flight {@link _guarded} callbacks
   * settle rather than hang: disposing the {@link _abortCts} would drop each
   * racing `onCancellationRequested` listener without ever firing it, leaving
   * a callback that parks its deferred after the teardown sweep with nothing
   * left to resolve it. The sweep registered in the constructor stays as the
   * backstop, since {@link _beginAbort} no-ops when already aborted.
   */
  dispose() {
    void this._editTracker.flushAttribution().catch((error) => {
      this._logService.warn(`[Copilot:${this.sessionId}] Failed to flush edit attribution: ${error}`);
    });
    this._beginAbort();
    super.dispose();
  }
  /**
   * Explicitly destroys the underlying SDK session and waits for cleanup
   * to complete. Call this before {@link dispose} when you need to ensure
   * the session's on-disk data is no longer locked (e.g. before
   * truncation or fork operations that modify the session files).
   */
  async destroySession() {
    try {
      await this._editTracker.flushAttribution();
    } catch (error) {
      this._logService.warn(`[Copilot:${this.sessionId}] Failed to flush edit attribution: ${error}`);
    }
    await this._wrapper.session.disconnect();
  }
  async setModel(model, reasoningEffort, contextTier) {
    this._logService.info(`[Copilot:${this.sessionId}] Changing model to: ${model}`);
    this._lastSeenModelId = model;
    await this._wrapper.session.setModel(model, { reasoningEffort, contextTier });
  }
  /**
   * Dispatches an MCP JSON-RPC method received on the `mcp://` side
   * channel to the Copilot SDK's `session.rpc.mcp.*` surface.
   *
   * Mapping:
   *  - `tools/list` → `rpc.mcp.apps.listTools`
   *  - `tools/call` → `rpc.mcp.apps.callTool`
   *  - `resources/read` → `rpc.mcp.apps.readResource`
   *  - `resources/list` → `rpc.mcp.apps.listResources` (empty list fallback)
   *  - `resources/templates/list` → `rpc.mcp.apps.listResourceTemplates` (empty list fallback)
   *  - `sampling/createMessage` → `rpc.mcp.executeSampling`
   *
   * Other MCP methods are rejected with `Method not found` (the caller
   * translates that into a JSON-RPC `-32601`).
   */
  async handleMcpRequest(serverName, method, params) {
    const apps = this._wrapper.session.rpc.mcp.apps;
    switch (method) {
      case "tools/list":
        return apps.listTools({ serverName, originServerName: serverName });
      case "tools/call": {
        const name = params && typeof params["name"] === "string" ? params["name"] : void 0;
        if (!name) {
          throw new Error(`tools/call missing 'name' parameter`);
        }
        const rawArgs = params ? params["arguments"] : void 0;
        const args = isObject(rawArgs) ? rawArgs : void 0;
        return apps.callTool({ serverName, toolName: name, arguments: args, originServerName: serverName });
      }
      case "resources/read": {
        const uri = params && typeof params["uri"] === "string" ? params["uri"] : void 0;
        if (!uri) {
          throw new Error(`resources/read missing 'uri' parameter`);
        }
        return apps.readResource({ serverName, uri });
      }
      case "resources/list": {
        return { resources: [] };
      }
      case "resources/templates/list": {
        return { resourceTemplates: [] };
      }
      case "sampling/createMessage":
        return this._handleSamplingCreateMessage(serverName, params);
      default:
        throw new Error(`Method not found: ${method}`);
    }
  }
  async startMcpServer(id) {
    const serverName = this._mcpCustomizations.serverNameForCustomizationId(id);
    if (!serverName) {
      this._logService.warn(`[Copilot:${this.sessionId}] Cannot start unknown MCP server customization ${id}`);
      return;
    }
    try {
      await this._wrapper.session.rpc.mcp.startServer({ serverName });
    } finally {
      this._seedMcpServersFromRpc();
    }
  }
  async _reconcileMcpServerEnablement() {
    const desiredCustomizations = this._stateManager.getSessionState(this.sessionUri.toString())?.customizations ?? [];
    const desiredServers = getEffectiveMcpServerCustomizations(desiredCustomizations);
    if (desiredServers.length === 0) {
      return;
    }
    await this._refreshMcpServersFromRpc();
    let changed = false;
    for (const server of this._mcpCustomizations.serverEnablement()) {
      const desired = desiredServers.find((customization) => customization.id === server.customizationId)?.enabled;
      if (desired === void 0 || desired === server.enabled) {
        continue;
      }
      try {
        if (desired) {
          changed = true;
          await this._wrapper.session.rpc.mcp.enable({ serverName: server.serverName });
        } else {
          await this._disableMcpServer(server.serverName);
          changed = true;
        }
      } catch (e) {
        this._logService.error(e, `[Copilot:${this.sessionId}] Failed to ${desired ? "enable" : "disable"} MCP server ${server.serverName}`);
      }
    }
    if (changed) {
      await this._refreshMcpServersFromRpc();
    }
  }
  async _disableMcpServer(serverName) {
    this._cancelPendingMcpAuthRequestsForServer(serverName);
    await this._wrapper.session.rpc.mcp.disable({ serverName });
  }
  async stopMcpServer(id) {
    const serverName = this._mcpCustomizations.serverNameForCustomizationId(id);
    if (!serverName) {
      this._logService.warn(`[Copilot:${this.sessionId}] Cannot stop unknown MCP server customization ${id}`);
      return;
    }
    await this._wrapper.session.rpc.mcp.stopServer({ serverName });
    this._mcpCustomizations.applyOne({ name: serverName, state: { kind: McpServerStatus.Stopped } });
  }
  /**
   * Forwards an App→host `sampling/createMessage` request received
   * over the AHP `mcp://` channel to `rpc.mcp.executeSampling`. The
   * Copilot runtime owns the MCP→chat-completion conversion and the
   * sampling response shape, so we pass the raw MCP params through
   * untouched and return the SDK's result directly.
   *
   * Resolves the JSON-RPC request with the `CreateMessageResult` on
   * success and rejects on failure/cancellation, mirroring the
   * `sampling/createMessage` MCP contract.
   */
  async _handleSamplingCreateMessage(serverName, params) {
    if (!params) {
      throw new Error(`sampling/createMessage missing params`);
    }
    const requestId = generateUuid();
    const mcpRequestId = generateUuid();
    this._pendingMcpSamplings.add(requestId);
    try {
      const result = await this._wrapper.session.rpc.mcp.executeSampling({
        requestId,
        serverName,
        mcpRequestId,
        request: params
      });
      if (result.action === "success") {
        return result.result ?? null;
      }
      throw new Error(`sampling/createMessage ${result.action}${result.error ? `: ${result.error}` : ""}`);
    } finally {
      this._pendingMcpSamplings.delete(requestId);
    }
  }
  /**
   * Selects (or clears) a custom agent on the live SDK session.
   * Mirrors the SDK's `rpc.agent.select` / `rpc.agent.deselect` pair.
   */
  async setAgent(agentName) {
    if (agentName) {
      const name = agentName;
      this._logService.info(`[Copilot:${this.sessionId}] Selecting custom agent: ${name}`);
      try {
        await this._wrapper.session.rpc.agent.select({ name });
      } catch (err) {
        this._logService.error(err, `[Copilot:${this.sessionId}] rpc.agent.select failed: name=${name}`);
        throw err;
      }
    } else {
      this._logService.info(`[Copilot:${this.sessionId}] Clearing custom agent selection`);
      try {
        await this._wrapper.session.rpc.agent.deselect();
      } catch (err) {
        this._logService.error(err, `[Copilot:${this.sessionId}] rpc.agent.deselect failed`);
        throw err;
      }
    }
  }
  // ---- permission handling ------------------------------------------------
  /**
   * Handles a permission request from the SDK by firing a `tool_ready` event
   * (which transitions the tool to PendingConfirmation) and waiting for the
   * side-effects layer to respond via {@link respondToPermissionRequest}.
   */
  async _handlePermissionRequest(request) {
    try {
      const toolCallId = request.toolCallId;
      if (!toolCallId) {
        this._logService.warn(`[Copilot:${this.sessionId}] Permission request without toolCallId, auto-denying: kind=${request.kind}`);
        return { kind: "reject" };
      }
      if (this._unroutableSubagentToolCallIds.delete(toolCallId)) {
        this._logService.error(`[Copilot:${this.sessionId}] Rejecting permission request for unroutable subagent tool call: toolCallId=${toolCallId}, kind=${request.kind}`);
        return { kind: "reject" };
      }
      const managedApprovalRequired = request.managedApprovalRequired === true;
      const autoApproval = !managedApprovalRequired && this._lastAppliedPermissionMode === "auto" ? await this._takeAutoApproval(toolCallId) : void 0;
      const recommendation = autoApproval?.recommendation;
      if (recommendation === "approve" && !request.requestSandboxBypass) {
        if (request.kind === "custom-tool" && typeof request.toolName === "string" && this._clientToolNames.has(this._clientToolName(request.toolName))) {
          const trackedToolCall2 = this._activeToolCalls.get(toolCallId);
          const displayName = trackedToolCall2?.displayName ?? getToolDisplayName(request.toolName);
          const parameters = trackedToolCall2?.parameters;
          const parentToolCallId2 = trackedToolCall2?.parentToolCallId;
          this._onDidSessionProgress.fire({
            kind: "pending_confirmation",
            chat: this._chatChannelUri,
            state: {
              status: ToolCallStatus.PendingConfirmation,
              toolCallId,
              toolName: request.toolName,
              displayName,
              invocationMessage: getInvocationMessage(request.toolName, displayName, parameters, (path) => this._resolveEditFilePath(path)),
              toolInput: getToolInputString(request.toolName, parameters, tryStringify(parameters)),
              riskAssessment: autoApproval?.reason ? {
                kind: ToolCallRiskAssessmentKind.Judge,
                status: ToolCallRiskAssessmentStatus.Complete,
                reason: autoApproval.reason,
                safety: 1
              } : void 0
            },
            parentToolCallId: parentToolCallId2
          });
        }
        return { kind: "approve-once" };
      }
      const approvedSignature = this._approvedDuplicablePermissionSignatures.get(toolCallId);
      if (approvedSignature !== void 0) {
        this._approvedDuplicablePermissionSignatures.delete(toolCallId);
        if (!managedApprovalRequired && (request.kind === "write" || request.kind === "read") && safeStringify(request) === approvedSignature) {
          this._logService.info(`[Copilot:${this.sessionId}] Auto-approving duplicate ${request.kind} permission request for tool call ${toolCallId}`);
          return { kind: "approve-once" };
        }
      }
      const sessionResourcePath = this._getInternalSessionResourcePath(request);
      if (!managedApprovalRequired && sessionResourcePath) {
        this._logService.info(`[Copilot:${this.sessionId}] Auto-approving internal session resource ${sessionResourcePath}`);
        return { kind: "approve-once" };
      }
      if (!managedApprovalRequired && request.kind === "read" && typeof request.path === "string" && this._isSessionAttachmentPath(request.path)) {
        this._logService.info(`[Copilot:${this.sessionId}] Auto-approving session attachment ${request.path}`);
        return { kind: "approve-once" };
      }
      if (!managedApprovalRequired && request.kind === "read" && typeof request.path === "string") {
        if (isCopilotSdkToolOutputTempFile(request.path, this._environmentService.tmpDir.fsPath)) {
          this._logService.info(`[Copilot:${this.sessionId}] Auto-approving Copilot SDK tool-output temp file ${request.path}`);
          return { kind: "approve-once" };
        }
      }
      if (!managedApprovalRequired && request.kind === "custom-tool" && typeof request.toolName === "string" && this._serverToolHost?.toolNames.includes(request.toolName) && !this._serverToolHost.requiresConfirmation(request.toolName)) {
        this._logService.info(`[Copilot:${this.sessionId}] Auto-approving server tool ${request.toolName}`);
        return { kind: "approve-once" };
      }
      const customShellToolName = request.kind === "custom-tool" && typeof request.toolName === "string" && isShellTool(request.toolName) ? request.toolName : void 0;
      const isShellRequest = request.kind === "shell" || customShellToolName !== void 0;
      const trackedToolName = this._activeToolCalls.get(toolCallId)?.toolName;
      const shellToolName = request.kind === "shell" ? trackedToolName : customShellToolName;
      const shellLanguage = isShellRequest && (shellToolName === "bash" || shellToolName === "powershell") ? shellToolName : void 0;
      if (isShellRequest && shellLanguage === void 0) {
        this._logService.warn(`[Copilot:${this.sessionId}] Shell permission request has no recognized shell tool name; requiring confirmation: toolCallId=${toolCallId}, toolName=${shellToolName ?? "(missing)"}`);
      }
      if (!managedApprovalRequired && request.kind === "custom-tool" && typeof request.toolName === "string" && this._clientToolNames.has(this._clientToolName(request.toolName)) && this._pendingClientToolCalls.hasBufferedResult(toolCallId)) {
        this._logService.info(`[Copilot:${this.sessionId}] Auto-approving client tool ${request.toolName} because its result arrived before the permission request`);
        return { kind: "approve-once" };
      }
      this._logService.info(`[Copilot:${this.sessionId}] Requesting confirmation for tool call: ${toolCallId}`);
      const pendingPermission = this._pendingPermissions.register(toolCallId, { managedApprovalRequired });
      if (!managedApprovalRequired && isShellRequest && !request.requestSandboxBypass && await this._isShellSandboxedByDefault()) {
        if (this._pendingPermissions.has(toolCallId)) {
          this._pendingPermissions.respond(toolCallId, { kind: "approve-once" });
          this._logService.info(`[Copilot:${this.sessionId}] Auto-approving sandboxed shell command for tool call ${toolCallId}`);
          return { kind: "approve-once" };
        }
        return { kind: "reject" };
      }
      const edits = await this._buildEditsForPermission(request, toolCallId);
      if (!this._pendingPermissions.has(toolCallId)) {
        return { kind: "reject" };
      }
      const isNewFile = edits?.items.some((edit) => !edit.before && !!edit.after);
      const { confirmationTitle, invocationMessage, toolInput, permissionKind, permissionPath } = getPermissionDisplay(request, this._workingDirectory, isNewFile);
      const toolName = request.toolName ?? request.kind;
      const trackedToolCall = this._activeToolCalls.get(toolCallId);
      const parentToolCallId = trackedToolCall?.parentToolCallId;
      this._onDidSessionProgress.fire({
        kind: "pending_confirmation",
        chat: this._chatChannelUri,
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId,
          toolName,
          displayName: getToolDisplayName(toolName),
          contributor: trackedToolCall?.contributor,
          intention: trackedToolCall?.intention,
          invocationMessage,
          toolInput,
          confirmationTitle,
          riskAssessment: autoApproval?.reason ? {
            kind: ToolCallRiskAssessmentKind.Judge,
            status: ToolCallRiskAssessmentStatus.Complete,
            reason: autoApproval.reason,
            safety: recommendation === "approve" ? 1 : 0
          } : void 0,
          edits
        },
        permissionKind,
        permissionPath,
        managedApprovalRequired,
        requestSandboxBypass: request.requestSandboxBypass,
        shellLanguage,
        parentToolCallId
      });
      const result = await pendingPermission;
      this._logService.info(`[Copilot:${this.sessionId}] Permission response: toolCallId=${toolCallId}, result=${result.kind}`);
      if (!managedApprovalRequired && result.kind === "approve-once" && (request.kind === "write" || request.kind === "read")) {
        this._approvedDuplicablePermissionSignatures.set(toolCallId, safeStringify(request));
      }
      return result;
    } catch (error) {
      this._logService.error(error, `[Copilot:${this.sessionId}] Failed to handle permission request: kind=${request.kind}, toolCallId=${request.toolCallId ?? "missing"}`);
      throw error;
    }
  }
  _getInternalSessionResourcePath(request) {
    let permissionPath;
    if (request.kind === "read") {
      permissionPath = typeof request.path === "string" ? request.path : void 0;
    } else if (request.kind === "write") {
      permissionPath = typeof request.fileName === "string" ? request.fileName : void 0;
    }
    if (!permissionPath) {
      return void 0;
    }
    const sessionStateDir = normalizePath(URI.file(getCopilotCLISessionStateDir(this._environmentService.userHome.fsPath)));
    const sessionDir = normalizePath(URI.joinPath(sessionStateDir, this.sessionId));
    if (!extUriBiasedIgnorePathCase.isEqualOrParent(sessionDir, sessionStateDir)) {
      return void 0;
    }
    const permissionUri = normalizePath(URI.file(permissionPath));
    return extUriBiasedIgnorePathCase.isEqualOrParent(permissionUri, sessionDir) ? permissionPath : void 0;
  }
  /**
   * Returns true when `permissionPath` lives under this session's
   * `<sessionDataDir>/attachments` directory — i.e. the bytes were
   * written by the agent host's user-message attachment rewriter and so
   * are already user-supplied content that does not need to be
   * re-confirmed via a permission prompt.
   */
  _isSessionAttachmentPath(permissionPath) {
    const attachmentsDir = normalizePath(URI.joinPath(this._sessionDataDir, SESSION_ATTACHMENTS_DIRNAME));
    const permissionUri = normalizePath(URI.file(permissionPath));
    return extUriBiasedIgnorePathCase.isEqualOrParent(permissionUri, attachmentsDir);
  }
  /**
   * Returns true when shell commands run inside a sandbox by default — either
   * through the AgentHost's own {@link TerminalSandboxEngine} (when the custom
   * terminal tool is enabled) or through the SDK's built-in shell tool wrapped
   * by the `sandboxConfig` we pushed via `session.options.update`.
   *
   * Callers use this to auto-approve shell permission prompts that the sandbox
   * already contains. Commands that explicitly opt out of the sandbox
   * (`requestSandboxBypass`) are excluded by the caller, since the
   * sandbox no longer contains them.
   *
   * Returns false when neither sandbox path is configured, so the standard
   * confirmation flow is preserved.
   */
  async _isShellSandboxedByDefault() {
    if (this._isCustomTerminalToolEnabled()) {
      if (!this._shellManager) {
        return false;
      }
      return this._shellManager.getOrCreateSandboxEngine().isEnabled();
    }
    return this._computeSdkSandboxConfig() !== void 0;
  }
  /**
   * `true` when the AgentHost's own shell tools (wrapped by
   * {@link TerminalSandboxEngine}) replace the SDK's built-in shell. In that
   * mode the SDK sandbox config is unused, so we neither forward nor toggle it.
   */
  _isCustomTerminalToolEnabled() {
    return this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.EnableCustomTerminalTool) === true;
  }
  /**
   * The SDK-shaped sandbox policy for this session, mirroring
   * {@link CopilotSessionLauncher}'s computation: `undefined` when the custom
   * terminal tool is enabled (the host's own terminal sandbox engine handles
   * containment) or when the host sandbox config evaluates to disabled
   * (including on Windows, where the sandbox is not supported).
   */
  _computeSdkSandboxConfig() {
    if (this._isCustomTerminalToolEnabled()) {
      return void 0;
    }
    const sandbox = this._configurationService.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox);
    return buildSandboxConfigForSdk(this._platform, sandbox);
  }
  /**
   * `true` when the session runs with bypass approvals — either the global
   * auto-approve setting or the session's `autoApprove` ("Allow All")
   * level. Agent mode is an orthogonal axis and does not affect approvals.
   */
  _isBypassApprovals() {
    if (this._configurationService.getRootValue(platformRootSchema, AgentHostGlobalAutoApproveEnabledConfigKey) === true) {
      return true;
    }
    return this._configurationService.getEffectiveValue(this._storageUri.toString(), platformSessionSchema, SessionConfigKey.AutoApprove) === "autoApprove";
  }
  _getSdkPermissionMode() {
    if (this._isBypassApprovals()) {
      return "on";
    }
    return this._getConfiguredApprovalLevel() === "assisted" ? "auto" : "off";
  }
  _getConfiguredApprovalLevel() {
    return this._configurationService.getEffectiveValue(this._storageUri.toString(), platformSessionSchema, SessionConfigKey.AutoApprove) ?? "default";
  }
  _getConfiguredAgentMode() {
    return this._configurationService.getEffectiveValue(this._storageUri.toString(), platformSessionSchema, SessionConfigKey.Mode) ?? "interactive";
  }
  _subscribeToPermissionConfigChanges() {
    this._register(this._configurationService.onDidRootConfigChange(() => {
      void this._syncPermissionModeAfterConfigChange();
    }));
    this._register(this._configurationService.onDidSessionConfigChange((event) => {
      if (event.session === this._storageUri.toString() && Object.hasOwn(event.config, SessionConfigKey.AutoApprove)) {
        void this._syncPermissionModeAfterConfigChange();
      }
    }));
  }
  async _syncPermissionModeAfterConfigChange() {
    try {
      await this.syncPermissionMode("config-change");
    } catch (error) {
      this._logService.error(error, `[Copilot:${this.sessionId}] Failed to apply permission config change; aborting active turn`);
      try {
        await this.abort();
      } catch (abortError) {
        this._logService.error(abortError, `[Copilot:${this.sessionId}] Failed to abort after permission config sync failure`);
      }
    }
  }
  async _takeAutoApproval(toolCallId) {
    if (this._autoApprovals.has(toolCallId)) {
      const autoApproval = this._autoApprovals.get(toolCallId) ?? void 0;
      this._autoApprovals.delete(toolCallId);
      return autoApproval;
    }
    return this._pendingAutoApprovals.register(toolCallId);
  }
  _recordAutoApproval(toolCallId, autoApproval) {
    if (this._pendingAutoApprovals.respond(toolCallId, autoApproval)) {
      return;
    }
    this._autoApprovals.set(toolCallId, autoApproval ?? null);
  }
  syncPermissionMode(source) {
    return this._permissionModeSequencer.queue(async () => {
      const mode = this._getSdkPermissionMode();
      const configuredLevel = this._getConfiguredApprovalLevel();
      this._logService.info(`[Copilot:${this.sessionId}] Syncing permission mode: source=${source}, agentMode=${this._getConfiguredAgentMode()}, configuredLevel=${configuredLevel}, sdkMode=${mode}, previousSdkMode=${this._lastAppliedPermissionMode ?? "unknown"}, globalAutoApprove=${this._configurationService.getRootValue(platformRootSchema, AgentHostGlobalAutoApproveEnabledConfigKey) === true}`);
      const experimentalModeEnabled = mode === "auto";
      if (this._autoApprovalExperimentalModeEnabled !== experimentalModeEnabled) {
        const experimentalResult = await this._wrapper.session.rpc.options.update({ isExperimentalMode: experimentalModeEnabled });
        if (!experimentalResult.success) {
          throw new Error(`Copilot SDK rejected experimental mode update required by permission mode '${mode}'`);
        }
        this._autoApprovalExperimentalModeEnabled = experimentalModeEnabled;
        this._logService.info(`[Copilot:${this.sessionId}] ${experimentalModeEnabled ? "Enabled" : "Disabled"} SDK experimental mode for permission mode '${mode}'`);
      }
      if (this._lastAppliedPermissionMode === mode) {
        return;
      }
      const result = await this._wrapper.session.rpc.permissions.setAllowAll({ mode });
      if (!result.success || result.mode !== void 0 && result.mode !== mode) {
        throw new Error(`Copilot SDK rejected permission mode '${mode}'`);
      }
      this._lastAppliedPermissionMode = mode;
    });
  }
  /**
   * Apply the SDK sandbox policy for the request that is about to be sent.
   *
   * Skips the SDK sandbox entirely when the custom terminal tool is enabled
   * (the host's own terminal sandbox engine handles containment and the SDK's
   * built-in shell is unused). Otherwise it always pushes the effective state
   * so the SDK never retains a stale or auto-discovered sandbox: the
   * configured policy unless the request runs with bypass approvals, or an
   * explicitly disabled sandbox when no sandbox is configured (setting off,
   * or Windows).
   */
  async _applyEffectiveSandboxConfig() {
    if (this._isCustomTerminalToolEnabled()) {
      return;
    }
    const sandbox = this._configurationService.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox);
    const base = buildSandboxConfigForSdk(this._platform, sandbox);
    const sandboxConfig = base && !this._isBypassApprovals() ? base : { enabled: false };
    try {
      await this._wrapper.session.rpc.options.update({ sandboxConfig });
    } catch (err) {
      this._logService.warn(`[Copilot:${this.sessionId}] Failed to update sandbox config for request`, err);
    }
  }
  /**
   * Builds an {@link FileEdit} preview for a write permission request.
   *
   * The `before` side references the existing file on disk directly (if it
   * exists); the `after` side is written to the `pending-edit-content:`
   * in-memory filesystem so the client can fetch it via `resourceRead`.
   *
   * Returns `undefined` for permission kinds that don't describe file
   * edits or when the request is missing the fields needed to build a
   * preview. If the permission request is no longer pending by the time
   * the in-memory write completes (e.g. the session was aborted), the
   * just-written entry is deleted so it cannot leak.
   */
  async _buildEditsForPermission(request, toolCallId) {
    if (request.kind !== "write") {
      return void 0;
    }
    const filePath = typeof request.fileName === "string" ? request.fileName : void 0;
    const newFileContents = typeof request.newFileContents === "string" ? request.newFileContents : void 0;
    if (!filePath || newFileContents === void 0) {
      return void 0;
    }
    const fileUri = URI.file(filePath);
    const fileUriStr = fileUri.toString();
    let beforeExists = false;
    try {
      beforeExists = await this._fileService.exists(fileUri);
    } catch (err) {
      this._logService.warn(`[Copilot:${this.sessionId}] Failed to check file for edit preview: ${filePath}`, err);
    }
    const afterUri = buildPendingEditContentUri(this._storageUri.toString(), toolCallId, filePath);
    try {
      await this._fileService.writeFile(afterUri, VSBuffer.fromString(newFileContents));
    } catch (err) {
      this._logService.warn(`[Copilot:${this.sessionId}] Failed to write pending edit content for ${filePath}`, err);
      return void 0;
    }
    if (!this._pendingPermissions.has(toolCallId)) {
      this._fileService.del(afterUri).catch((err) => {
        this._logService.warn(`[Copilot:${this.sessionId}] Failed to delete orphaned pending edit content: ${afterUri.toString()}`, err);
      });
      return void 0;
    }
    this._pendingEditContentUris.set(toolCallId, afterUri);
    const diffCounts = typeof request.diff === "string" ? countUnifiedDiffLines(request.diff) : void 0;
    const edit = {
      ...beforeExists ? { before: { uri: fileUriStr, content: { uri: fileUriStr } } } : {},
      after: { uri: fileUriStr, content: { uri: afterUri.toString() } },
      ...diffCounts ? { diff: diffCounts } : {}
    };
    return { items: [edit] };
  }
  respondToPermissionRequest(requestId, approved) {
    if (this._pendingPermissions.respond(requestId, approved ? { kind: "approve-once" } : { kind: "denied-interactively-by-user" })) {
      this._deletePendingEditContent(requestId);
      return true;
    }
    return false;
  }
  async _requestUnsandboxedCommandConfirmation(request) {
    const pendingPermission = this._pendingPermissions.register(request.toolCallId, { managedApprovalRequired: false });
    const displayName = getToolDisplayName(request.toolName);
    const blockedDomains = request.blockedDomains?.length ? request.blockedDomains.join(", ") : void 0;
    const confirmationTitle = blockedDomains ? localize("agentHost.unsandboxedCommandConfirmation.title.blockedDomains", "Run Command Outside the Sandbox to Access {0}?", blockedDomains) : localize("agentHost.unsandboxedCommandConfirmation.title.generic", "Run Command Outside the Sandbox?");
    const invocationMessage = request.reason ? localize("agentHost.unsandboxedCommandConfirmation.reason", "Reason for leaving the sandbox: {0}", request.reason) : blockedDomains ? localize("agentHost.unsandboxedCommandConfirmation.blockedDomains", "This command needs to access blocked network domain(s): {0}.", blockedDomains) : localize("agentHost.unsandboxedCommandConfirmation.generic", "This command needs to run outside the sandbox.");
    const parentToolCallId = this._activeToolCalls.get(request.toolCallId)?.parentToolCallId;
    this._onDidSessionProgress.fire({
      kind: "pending_confirmation",
      chat: this._chatChannelUri,
      state: {
        status: ToolCallStatus.PendingConfirmation,
        toolCallId: request.toolCallId,
        toolName: request.toolName,
        displayName,
        invocationMessage,
        toolInput: request.command,
        confirmationTitle
      },
      // Intentionally omit `permissionKind: 'shell'`: that would route this
      // through the shell rule-based auto-approver and silently approve
      // common safe commands (`pwd`, `ls`, etc.) without prompting.
      // Mirrors the workbench's sandbox-aware analyzer, which forces
      // `isAutoApproveAllowed: false` whenever `requiresUnsandboxConfirmation`
      // is set.
      parentToolCallId
    });
    return (await pendingPermission).kind === "approve-once";
  }
  // ---- user input handling ------------------------------------------------
  /**
   * Handles a user input request from the SDK (ask_user tool). Auto-answers when the user is unavailable; otherwise waits for the renderer to respond via {@link respondToUserInputRequest}.
   */
  async _handleUserInputRequest(request, _invocation) {
    const requestId = generateUuid();
    const questionId = generateUuid();
    const inputRequest = {
      id: requestId,
      questions: [
        request.choices && request.choices.length > 0 ? {
          kind: ChatInputQuestionKind.SingleSelect,
          id: questionId,
          message: request.question,
          required: true,
          options: request.choices.map((c) => ({ id: c, label: c })),
          allowFreeformInput: request.allowFreeform ?? true
        } : {
          kind: ChatInputQuestionKind.Text,
          id: questionId,
          message: request.question,
          required: true
        }
      ]
    };
    const isAutopilot = this._isAutopilotMode();
    if (isAutopilot || this._isAutoReplyEnabled()) {
      this._emitAction({
        type: ActionType.ChatInputRequested,
        request: inputRequest
      });
      this._emitAction({
        type: ActionType.ChatInputCompleted,
        requestId,
        response: ChatInputResponseKind.Accept,
        answers: {
          [questionId]: {
            state: ChatInputAnswerState.Submitted,
            value: {
              kind: ChatInputAnswerValueKind.Text,
              value: AgentHostAutoReplyAnswer
            }
          }
        }
      });
      return {
        answer: AgentHostAutoReplyAnswer,
        wasFreeform: true
      };
    }
    if (!this.hasActiveTurn) {
      this._logService.warn(`[Copilot:${this.sessionId}] Rejecting user input request without an active turn`);
      return { answer: "No active turn", wasFreeform: true };
    }
    const questionPreview = request.question.substring(0, 100);
    try {
      this._logService.info(`[Copilot:${this.sessionId}] User input request: requestId=${requestId}, question="${questionPreview}"`);
      const pendingInput = this._pendingUserInputs.register(requestId, { questionId });
      this._emitAction({
        type: ActionType.ChatInputRequested,
        request: inputRequest
      });
      const result = await pendingInput;
      this._logService.info(`[Copilot:${this.sessionId}] User input response: requestId=${requestId}, response=${result.response}`);
      if (result.response !== ChatInputResponseKind.Accept || !result.answers) {
        return { answer: "", wasFreeform: true };
      }
      const answer = result.answers[questionId];
      if (!answer || answer.state === ChatInputAnswerState.Skipped) {
        return { answer: "", wasFreeform: true };
      }
      const { value: val } = answer;
      if (val.kind === ChatInputAnswerValueKind.Text) {
        return { answer: val.value, wasFreeform: true };
      } else if (val.kind === ChatInputAnswerValueKind.Selected) {
        const wasFreeform = !request.choices?.includes(val.value);
        return { answer: val.value, wasFreeform };
      }
      return { answer: "", wasFreeform: true };
    } catch (error) {
      this._logService.error(error, `[Copilot:${this.sessionId}] Failed to handle user input request: question="${questionPreview}"`);
      throw error;
    }
  }
  /**
   * Handles an elicitation request from the SDK (MCP server / tool prompt)
   * by firing a `session/inputRequested` action and waiting for the
   * renderer to respond via {@link respondToUserInputRequest}.
   *
   * - `form` mode requests are projected from the SDK's
   *   {@link ElicitationSchema} into a list of
   *   {@link ChatInputQuestion}s.
   * - `url` mode requests surface as a question-less input request whose
   *   {@link ChatInputRequest.url} drives the renderer's "open URL"
   *   affordance.
   *
   * Under autopilot the request is auto-cancelled — there is no user
   * available to fill in a form, and accepting with empty content would
   * be misleading to the MCP server.
   */
  async _handleElicitationRequest(context) {
    const isAutopilot = this._isAutopilotMode();
    if (isAutopilot) {
      return { action: "cancel" };
    }
    if (!this.hasActiveTurn) {
      this._logService.warn(`[Copilot:${this.sessionId}] Rejecting elicitation request without an active turn`);
      return { action: "decline" };
    }
    const messagePreview = context.message.substring(0, 100);
    try {
      const requestId = generateUuid();
      this._logService.info(`[Copilot:${this.sessionId}] Elicitation request: requestId=${requestId}, mode=${context.mode ?? "form"}, source=${context.elicitationSource ?? "<unknown>"}, message="${messagePreview}"`);
      const schema = context.mode === "url" ? void 0 : context.requestedSchema;
      const requiredSet = new Set(schema?.required ?? []);
      const questions = schema ? Object.entries(schema.properties).map(([fieldName, field]) => elicitationFieldToQuestion(fieldName, field, requiredSet.has(fieldName))) : void 0;
      const pendingElicitation = this._pendingElicitations.register(requestId, { schema });
      const inputRequest = {
        id: requestId,
        message: context.message,
        ...context.mode === "url" && context.url ? { url: context.url } : {},
        ...questions && questions.length > 0 ? { questions } : {}
      };
      this._emitAction({
        type: ActionType.ChatInputRequested,
        request: inputRequest
      });
      const result = await pendingElicitation;
      this._logService.info(`[Copilot:${this.sessionId}] Elicitation response: requestId=${requestId}, response=${result.response}`);
      if (result.response === ChatInputResponseKind.Decline) {
        return { action: "decline" };
      }
      if (result.response !== ChatInputResponseKind.Accept) {
        return { action: "cancel" };
      }
      const answers = result.answers ?? {};
      if (!schema) {
        const freeform = answers.answer;
        if (freeform && freeform.state !== ChatInputAnswerState.Skipped && freeform.value.kind === ChatInputAnswerValueKind.Text) {
          return { action: "accept", content: { answer: freeform.value.value } };
        }
        return { action: "accept" };
      }
      const content = {};
      for (const [fieldName, field] of Object.entries(schema.properties)) {
        const value = elicitationAnswerToFieldValue(field, answers[fieldName]);
        if (value !== void 0) {
          content[fieldName] = value;
        }
      }
      return { action: "accept", content };
    } catch (error) {
      this._logService.error(error, `[Copilot:${this.sessionId}] Failed to handle elicitation request: message="${messagePreview}"`);
      throw error;
    }
  }
  respondToUserInputRequest(requestId, response, answers) {
    const pendingPlanReview = this._pendingPlanReviews.getMetadata(requestId);
    if (pendingPlanReview) {
      return this._pendingPlanReviews.respond(requestId, this._resolveExitPlanMode(pendingPlanReview, response, answers));
    }
    if (this._pendingElicitations.respond(requestId, { response, answers })) {
      return true;
    }
    if (this._pendingUserInputs.respond(requestId, { response, answers })) {
      return true;
    }
    return false;
  }
  /**
   * Maps an `exit_plan_mode` input response back to an
   * {@link IExitPlanModeResponse} that the CLI can feed into
   * `session.respondToExitPlanMode`. Mapping rules:
   *
   *  - Decline / Cancel / no answer → `{ approved: false }` (model gets a
   *    rejection result and stays in plan mode).
   *  - Accept + freeform feedback → `{ approved: false, feedback, selectedAction? }`
   *    (the SDK treats this as a revision request and re-emits
   *    `exit_plan_mode.requested` after revising the plan).
   *  - Accept + selected option → `{ approved: true, selectedAction, autoApproveEdits }`
   *    where `autoApproveEdits` is set for the autopilot variants.
   *
   * `selectedAction` is validated against the SDK's offered `actions`; an
   * unknown value is treated as a decline so the SDK isn't fed a value it
   * cannot handle.
   */
  _resolveExitPlanMode(pending, response, answers) {
    if (response !== ChatInputResponseKind.Accept) {
      return { approved: false };
    }
    const answer = answers?.[pending.questionId];
    if (!answer || answer.state === ChatInputAnswerState.Skipped) {
      return { approved: false };
    }
    const value = answer.value;
    let candidateAction;
    let feedback;
    if (value.kind === ChatInputAnswerValueKind.Selected) {
      candidateAction = value.value;
      const freeform = value.freeformValues?.find((s) => s.trim().length > 0)?.trim();
      feedback = freeform;
    } else if (value.kind === ChatInputAnswerValueKind.Text) {
      feedback = value.value.trim() || void 0;
    } else {
      return { approved: false };
    }
    const selectedAction = candidateAction && pending.actions.includes(candidateAction) ? candidateAction : pending.actions.includes(pending.recommendedAction) ? pending.recommendedAction : void 0;
    if (feedback) {
      return {
        approved: false,
        feedback,
        ...selectedAction ? { selectedAction } : {}
      };
    }
    if (!selectedAction) {
      return { approved: false };
    }
    this._syncAhpModeFromExitPlanAction(selectedAction);
    const isAutopilot = selectedAction === "autopilot" || selectedAction === "autopilot_fleet";
    return {
      approved: true,
      selectedAction,
      ...isAutopilot && this._isBypassApprovals() ? { autoApproveEdits: true } : {}
    };
  }
  /**
   * Translates an approved `exit_plan_mode` action into the AHP `mode` axis
   * and writes it so the mode picker reflects the choice immediately:
   *
   *  - `autopilot` / `autopilot_fleet` → `mode='autopilot'`.
   *  - `interactive` → `mode='interactive'`.
   *  - `exit_only` (approve plan without executing) leaves the mode untouched.
   */
  _syncAhpModeFromExitPlanAction(selectedAction) {
    switch (selectedAction) {
      case "autopilot":
      case "autopilot_fleet":
        this._syncAhpConfigFromSdkMode("autopilot");
        break;
      case "interactive":
        this._syncAhpConfigFromSdkMode("interactive");
        break;
    }
  }
  async _handlePreToolUse(input) {
    try {
      if (isEditTool(input.toolName, getToolCommand(input))) {
        const filePaths = this._getEditFilePaths(input.toolArgs);
        await Promise.all(filePaths.map((p) => this._editTracker.trackEditStart(p)));
      }
    } catch (error) {
      this._logService.error(error, `[Copilot:${this.sessionId}] Failed in onPreToolUse: tool=${input.toolName}`);
      throw error;
    }
  }
  async _handlePostToolUse(input) {
    try {
      if (isEditTool(input.toolName, getToolCommand(input))) {
        const filePaths = this._getEditFilePaths(input.toolArgs);
        await Promise.all(filePaths.map((p) => this._editTracker.completeEdit(p)));
      }
    } catch (error) {
      this._logService.error(error, `[Copilot:${this.sessionId}] Failed in onPostToolUse: tool=${input.toolName}`);
      throw error;
    }
  }
  async _beginRepoInfoTelemetry(telemetryMessageId, clientType, isCurrent) {
    let resolved;
    try {
      resolved = await this._resolveRepoInfoTelemetryContext();
    } catch (error) {
      this._logService.warn(`[Copilot:${this.sessionId}] Failed to resolve repository info telemetry context: ${getErrorMessage(error)}`);
      return void 0;
    }
    if (!resolved || this._store.isDisposed || !isCurrent()) {
      return void 0;
    }
    await this._repoInfoTelemetry.reportBegin(resolved.context, this.sessionUri.toString(), telemetryMessageId, clientType, this._workingDirectory, resolved.baseBranch, isCurrent);
    return resolved;
  }
  async _endRepoInfoTelemetry(telemetryMessageId, resolved, isCurrent) {
    if (!resolved || this._store.isDisposed || !isCurrent()) {
      return;
    }
    await this._repoInfoTelemetry.reportEnd(resolved.context, this.sessionUri.toString(), telemetryMessageId, this._workingDirectory, resolved.baseBranch, isCurrent);
  }
  _completeActiveRepoInfoTelemetry() {
    const turn = this._activeRepoInfoTurn;
    if (!turn) {
      return;
    }
    this._activeRepoInfoTurn = void 0;
    const isCurrent = () => !turn.cancelled && this._isLaunchTokenCurrent();
    void turn.begin.then((resolved) => this._endRepoInfoTelemetry(turn.telemetryMessageId, resolved, isCurrent));
  }
  _cancelActiveRepoInfoTelemetry() {
    const turn = this._activeRepoInfoTurn;
    if (!turn) {
      return;
    }
    this._activeRepoInfoTurn = void 0;
    turn.cancelled = true;
    void turn.begin.finally(() => this._repoInfoTelemetry.clearTurn(turn.telemetryMessageId));
  }
  async _resolveRepoInfoTelemetryContext() {
    if (this._configurationService.getRootValue(platformRootSchema, AgentHostDisableRepoInfoTelemetryConfigKey) === true) {
      return void 0;
    }
    const githubToken = this._launchPlan.githubToken;
    if (!githubToken) {
      return void 0;
    }
    const [rawContext, baseBranch] = await Promise.all([
      this._copilotApiService.resolveRestrictedTelemetryContext(githubToken),
      this._databaseRef.object.getMetadata(META_DIFF_BASE_BRANCH)
    ]);
    if (!rawContext.restrictedTelemetryEnabled && !rawContext.isInternal) {
      return void 0;
    }
    return { context: this._toRepoInfoTelemetryContext(rawContext), baseBranch };
  }
  _isLaunchTokenCurrent() {
    return this._launchPlan.githubToken !== void 0 && this._isLaunchTokenStillCurrent();
  }
  _toRepoInfoTelemetryContext(context) {
    return {
      restrictedTelemetryEnabled: context.restrictedTelemetryEnabled,
      trackingId: context.trackingId,
      telemetryEndpoint: context.telemetryEndpoint ? `${context.telemetryEndpoint.replace(/\/+$/, "")}/telemetry` : void 0,
      isInternal: context.isInternal === true,
      userName: context.userName,
      isVscodeTeamMember: context.isVscodeTeamMember === true,
      copilotIgnoreEnabled: context.copilotIgnoreEnabled
    };
  }
  // ---- event wiring -------------------------------------------------------
  _subscribeToEvents() {
    const wrapper = this._wrapper;
    const sessionId = this.sessionId;
    this._register(wrapper.onSystemNotification((e) => {
      const notification = buildCopilotSystemNotification(e);
      if (!notification) {
        this._logService.trace(`[Copilot:${sessionId}] Ignoring system.notification kind=${e.data.kind.type}`);
        return;
      }
      this._logService.info(`[Copilot:${sessionId}] System notification received: kind=${e.data.kind.type}`);
      if (this._turnId) {
        this._emitAction({
          type: ActionType.ChatResponsePart,
          turnId: this._turnId,
          part: {
            kind: ResponsePartKind.SystemNotification,
            content: notification.messageText
          }
        });
        return;
      }
      if (!notification.startsTurn) {
        this._logService.trace(`[Copilot:${sessionId}] Ignoring passive system.notification kind=${e.data.kind.type} without an active turn`);
        return;
      }
      const turnId = generateUuid();
      this.resetTurnState(turnId);
      this._emitAction({
        type: ActionType.ChatTurnStarted,
        turnId,
        startedAt: (/* @__PURE__ */ new Date()).toISOString(),
        message: {
          text: notification.messageText,
          origin: { kind: MessageKind.SystemNotification }
        }
      });
    }));
    this._register(wrapper.onUserMessage((e) => {
      if (e.agentId) {
        this._resumeSubagentForEvent(e, { text: e.data.content, origin: { kind: MessageKind.User } });
        return;
      }
      if (e.data.source && e.data.source.toLowerCase() !== "user") {
        return;
      }
      this._currentTurn?.markRunning();
      const steering = this._takeMatchingPendingSteering(e.data.content);
      if (steering) {
        this._beginSteeringTurn(steering);
      }
      if (this._turnId) {
        this._databaseRef.object.setTurnEventId(this._turnId, e.id);
      }
    }));
    this._register(wrapper.onMessageDelta((e) => {
      this._logService.trace(`[Copilot:${sessionId}] delta: ${e.data.deltaContent}`);
      this._resumeSubagentForEvent(e);
      if (this._shouldDropUnmappedSubagentEvent(e, "assistant.message_delta")) {
        return;
      }
      this._emitMarkdownDelta(e.data.deltaContent, this._parentToolCallIdForSubagentEvent(e));
    }));
    this._register(wrapper.onMessage((e) => {
      this._logService.info(`[Copilot:${sessionId}] Full message received: ${e.data.content.length} chars`);
      this._resumeSubagentForEvent(e);
      if (!e.agentId) {
        const clientType = this._currentTurn?.clientType ?? AgentHostClientType.Unknown;
        void this._telemetryReporter.assistantMessageReceived(this.sessionUri.toString(), clientType, e.data.clientRequestId, this._appliedSnapshot.tools).catch((err) => this._logService.trace(`[Copilot:${this.sessionId}] Telemetry emission failed: ${getErrorMessage(err)}`));
        void this._telemetryReporter.modelMessageText(this.sessionUri.toString(), clientType, e.data.content, this._turnOrdinal, e.data.clientRequestId).catch((err) => this._logService.trace(`[Copilot:${this.sessionId}] Telemetry emission failed: ${getErrorMessage(err)}`));
        const turn = this._currentTurn;
        if (turn) {
          turn.toolCallRounds++;
          if (e.data.model) {
            turn.lastModel = e.data.model;
          }
          const toolRequests = e.data.toolRequests;
          if (toolRequests?.length) {
            turn.totalToolCalls += toolRequests.length;
            if (toolRequests.length > 1) {
              turn.parallelToolCallRounds++;
              turn.parallelToolCallsTotal += toolRequests.length;
            }
            for (const req of toolRequests) {
              turn.toolCounts.set(req.name, (turn.toolCounts.get(req.name) ?? 0) + 1);
            }
          }
        }
      }
      if (this._shouldDropUnmappedSubagentEvent(e, "assistant.message")) {
        return;
      }
      const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
      const markdownScope = parentToolCallId ?? "";
      if (e.data.content && !this._currentTurn?.markdownPartIds.has(markdownScope)) {
        const partId = generateUuid();
        this._currentTurn?.markdownPartIds.set(markdownScope, partId);
        this._emitAction({
          type: ActionType.ChatResponsePart,
          turnId: this._turnId,
          part: { kind: ResponsePartKind.Markdown, id: partId, content: e.data.content }
        }, parentToolCallId);
      }
      if (e.data.toolRequests?.length) {
        this._beginToolCallRound(parentToolCallId);
      }
    }));
    this._register(wrapper.onPermissionRequested((e) => {
      const toolCallId = e.data.permissionRequest.toolCallId;
      if (!toolCallId) {
        return;
      }
      this._recordAutoApproval(toolCallId, e.data.promptRequest?.autoApproval);
      const existing = this._toolApprovalRecords.get(toolCallId);
      const permissionRequest = e.data.permissionRequest;
      this._toolApprovalRecords.set(toolCallId, {
        permissionRequested: true,
        resolvedByHook: existing?.resolvedByHook || e.data.resolvedByHook === true,
        requestSandboxBypass: existing?.requestSandboxBypass || permissionRequest.requestSandboxBypass === true,
        resultKind: existing?.resultKind,
        toolName: existing?.toolName ?? permissionRequest.toolName,
        mcpServerName: existing?.mcpServerName,
        reported: existing?.reported ?? false
      });
    }));
    this._register(wrapper.onPermissionCompleted((e) => {
      const toolCallId = e.data.toolCallId;
      if (!toolCallId) {
        return;
      }
      const existing = this._toolApprovalRecords.get(toolCallId);
      const record = {
        permissionRequested: existing?.permissionRequested ?? true,
        resolvedByHook: existing?.resolvedByHook ?? false,
        requestSandboxBypass: existing?.requestSandboxBypass ?? false,
        resultKind: e.data.result.kind,
        toolName: existing?.toolName,
        mcpServerName: existing?.mcpServerName,
        reported: existing?.reported ?? false
      };
      this._toolApprovalRecords.set(toolCallId, record);
      this._reportToolApproval(toolCallId, record.toolName, record.mcpServerName);
      if (isPermissionDeniedKind(record.resultKind)) {
        this._toolApprovalRecords.delete(toolCallId);
      }
    }));
    this._register(wrapper.onToolCallDelta((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Tool call delta: ${e.data.toolName ?? "<pending>"} (${e.data.toolCallId})`);
      this._resumeSubagentForEvent(e);
      if (this._shouldDropUnmappedSubagentEvent(e, "assistant.tool_call_delta")) {
        return;
      }
      const existing = this._streamingToolCalls.get(e.data.toolCallId);
      const streaming = existing ?? {
        input: "",
        toolName: void 0,
        parentToolCallId: void 0,
        started: false,
        displayedInputLength: 0,
        displayedMessage: void 0
      };
      streaming.input += e.data.inputDelta;
      if (e.data.toolName) {
        if (streaming.toolName && streaming.toolName !== e.data.toolName) {
          this._logService.warn(`[Copilot:${sessionId}] Tool call ${e.data.toolCallId} changed name while streaming from ${streaming.toolName} to ${e.data.toolName}`);
        } else {
          streaming.toolName = e.data.toolName;
        }
      }
      this._streamingToolCalls.set(e.data.toolCallId, streaming);
      const toolName = streaming.toolName;
      if (!toolName || isHiddenTool(toolName) || isTaskCompleteTool(toolName) || this._clientToolNames.has(this._clientToolName(toolName))) {
        return;
      }
      if (!streaming.started) {
        streaming.parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
      }
      if (!streaming.started) {
        streaming.started = true;
        this._emitAction({
          type: ActionType.ChatToolCallStart,
          turnId: this._turnId,
          toolCallId: e.data.toolCallId,
          toolName,
          displayName: getToolDisplayName(toolName),
          contributor: this._getToolCallContributor(toolName, void 0),
          _meta: toToolCallMeta(this._createToolCallMeta(toolName, void 0))
        }, streaming.parentToolCallId);
        this._emitStreamingToolCallDisplay(e.data.toolCallId, streaming);
        return;
      }
      this._scheduleStreamingToolCallDisplay(e.data.toolCallId);
    }));
    this._register(wrapper.onToolStart((e) => {
      if (isHiddenTool(e.data.toolName)) {
        this._streamingToolDisplaySchedulers.deleteAndDispose(e.data.toolCallId);
        this._streamingToolCalls.delete(e.data.toolCallId);
        this._logService.trace(`[Copilot:${sessionId}] Tool started (hidden): ${e.data.toolName}`);
        return;
      }
      this._logService.info(`[Copilot:${sessionId}] Tool started: ${e.data.toolName}`);
      let toolArgs = e.data.arguments !== void 0 ? tryStringify(e.data.arguments) : void 0;
      let parameters;
      if (toolArgs) {
        try {
          parameters = JSON.parse(toolArgs);
        } catch {
        }
      }
      if (stripRedundantCdPrefix(e.data.toolName, parameters, this._workingDirectory)) {
        toolArgs = tryStringify(parameters);
      }
      const displayName = getToolDisplayName(e.data.toolName);
      const streamed = this._streamingToolCalls.get(e.data.toolCallId);
      this._streamingToolDisplaySchedulers.deleteAndDispose(e.data.toolCallId);
      if (streamed?.started && streamed.displayedInputLength < streamed.input.length) {
        this._emitStreamingToolCallDisplay(e.data.toolCallId, streamed);
      }
      this._streamingToolCalls.delete(e.data.toolCallId);
      if (streamed?.toolName && streamed.toolName !== e.data.toolName) {
        this._logService.warn(`[Copilot:${sessionId}] Tool call ${e.data.toolCallId} started as ${e.data.toolName} after streaming as ${streamed.toolName}`);
      }
      this._resumeSubagentForEvent(e);
      if (!streamed?.started && this._shouldDropUnmappedSubagentEvent(e, "tool.execution_start")) {
        this._unroutableSubagentToolCallIds.add(e.data.toolCallId);
        return;
      }
      const parentToolCallId = streamed?.parentToolCallId ?? this._parentToolCallIdForSubagentEvent(e);
      const clientToolName = this._clientToolName(e.data.toolName);
      const isClientTool = this._clientToolNames.has(clientToolName);
      const contributor = this._getToolCallContributor(e.data.toolName, e.data.mcpServerName);
      const intention = getShellIntention(e.data.toolName, parameters);
      this._activeToolCalls.set(e.data.toolCallId, {
        toolName: e.data.toolName,
        displayName,
        parameters,
        content: [],
        parentToolCallId,
        mcpServerName: e.data.mcpServerName,
        contributor,
        intention,
        meta: void 0
      });
      const existingApproval = this._toolApprovalRecords.get(e.data.toolCallId);
      const approvalRecord = {
        permissionRequested: existingApproval?.permissionRequested ?? false,
        resolvedByHook: existingApproval?.resolvedByHook ?? false,
        requestSandboxBypass: existingApproval?.requestSandboxBypass ?? false,
        resultKind: existingApproval?.resultKind,
        toolName: e.data.toolName,
        mcpServerName: e.data.mcpServerName,
        reported: existingApproval?.reported ?? false
      };
      this._toolApprovalRecords.set(e.data.toolCallId, approvalRecord);
      if (approvalRecord.resultKind !== void 0) {
        this._reportToolApproval(e.data.toolCallId, e.data.toolName, e.data.mcpServerName);
      }
      if (isShellTool(e.data.toolName)) {
        this._nonPtyShellTerminals.track(e.data.toolCallId, displayName);
      }
      if (isTaskCompleteTool(e.data.toolName)) {
        this._beginToolCallRound(parentToolCallId);
        return;
      }
      if (!streamed?.started) {
        this._beginToolCallRound(parentToolCallId);
      }
      const meta = this._createToolCallMeta(e.data.toolName, parameters);
      if (e.data.mcpServerName) {
        meta.mcpServerName = e.data.mcpServerName;
      }
      if (e.data.mcpToolName) {
        meta.mcpToolName = e.data.mcpToolName;
      }
      const resourceUri = e.data.toolDescription?._meta?.ui?.resourceUri;
      this._setToolCallUiMeta(meta, resourceUri, e.data.mcpServerName);
      const tracked = this._activeToolCalls.get(e.data.toolCallId);
      if (tracked) {
        tracked.meta = meta;
      }
      if (!streamed?.started) {
        this._emitAction({
          type: ActionType.ChatToolCallStart,
          turnId: this._turnId,
          toolCallId: e.data.toolCallId,
          toolName: e.data.toolName,
          displayName,
          intention,
          contributor,
          _meta: toToolCallMeta(meta)
        }, parentToolCallId);
      }
      if (isClientTool && !contributor) {
        this._logService.warn(`[Copilot:${sessionId}] Client tool '${e.data.toolName}' started with no connected client; failing it immediately.`);
        this._reportToolApprovalIfNoPermission(e.data.toolCallId);
        this._toolApprovalRecords.delete(e.data.toolCallId);
        this._activeToolCalls.delete(e.data.toolCallId);
        this._emitAction({
          type: ActionType.ChatToolCallReady,
          turnId: this._turnId,
          toolCallId: e.data.toolCallId,
          ...contributor ? { contributor } : {},
          ...intention !== void 0 ? { intention } : {},
          invocationMessage: getInvocationMessage(e.data.toolName, displayName, parameters, (path) => this._resolveEditFilePath(path)),
          toolInput: getToolInputString(e.data.toolName, parameters, toolArgs),
          confirmed: ToolCallConfirmationReason.NotNeeded,
          _meta: toToolCallMeta(meta)
        }, parentToolCallId);
        this._emitAction({
          type: ActionType.ChatToolCallComplete,
          turnId: this._turnId,
          toolCallId: e.data.toolCallId,
          result: {
            success: false,
            pastTenseMessage: `${displayName} failed`,
            error: { message: `No client was connected to run ${displayName}` }
          }
        }, parentToolCallId);
        this._pendingClientToolCalls.respondOrBuffer(e.data.toolCallId, {
          textResultForLlm: `No client was connected to run ${displayName}.`,
          resultType: "failure",
          error: "No client connected"
        });
        return;
      }
      const clientToolAutoApproved = contributor?.kind === ToolCallContributorKind.Client && this._lastAppliedPermissionMode === "on";
      const shouldWaitForClientToolReady = contributor?.kind === ToolCallContributorKind.Client && !isAgentCoordinationTool(e.data.toolName) && !clientToolAutoApproved;
      if (shouldWaitForClientToolReady) {
        return;
      }
      this._emitAction({
        type: ActionType.ChatToolCallReady,
        turnId: this._turnId,
        toolCallId: e.data.toolCallId,
        ...contributor ? { contributor } : {},
        ...intention !== void 0 ? { intention } : {},
        invocationMessage: getInvocationMessage(e.data.toolName, displayName, parameters, (path) => this._resolveEditFilePath(path)),
        toolInput: getToolInputString(e.data.toolName, parameters, toolArgs),
        confirmed: ToolCallConfirmationReason.NotNeeded,
        _meta: toToolCallMeta(clientToolAutoApproved ? { ...meta, autoApproveBySetting: true } : meta)
      }, parentToolCallId);
    }));
    this._register(wrapper.onToolComplete(async (e) => {
      this._approvedDuplicablePermissionSignatures.delete(e.data.toolCallId);
      const tracked = this._activeToolCalls.get(e.data.toolCallId);
      if (!tracked) {
        this._unroutableSubagentToolCallIds.delete(e.data.toolCallId);
        return;
      }
      const parentToolCallId = tracked.parentToolCallId ?? this._parentToolCallIdForSubagentEvent(e);
      if (!parentToolCallId && e.agentId) {
        this._logService.warn(`[Copilot:${this.sessionId}] Dropping tool.execution_complete for unknown subagent agentId=${e.agentId}`);
        return;
      }
      this._logService.info(`[Copilot:${sessionId}] Tool completed: ${e.data.toolCallId}`);
      this._reportToolApprovalIfNoPermission(e.data.toolCallId);
      this._activeToolCalls.delete(e.data.toolCallId);
      this._autoApprovals.delete(e.data.toolCallId);
      this._toolApprovalRecords.delete(e.data.toolCallId);
      this._pendingAutoApprovals.respond(e.data.toolCallId, void 0);
      const displayName = tracked.displayName;
      const toolOutput = e.data.error?.message ?? e.data.result?.content;
      if (isTaskCompleteTool(tracked.toolName)) {
        const summary = getTaskCompleteMarkdown(tracked.parameters, toolOutput);
        if (summary) {
          this._emitAction({
            type: ActionType.ChatResponsePart,
            turnId: this._turnId,
            part: { kind: ResponsePartKind.Markdown, id: generateUuid(), content: summary }
          });
        }
        return;
      }
      const content = [...tracked.content];
      if (toolOutput !== void 0) {
        content.push({ type: ToolResultContentType.Text, text: toolOutput });
      }
      const ptyTerminalUri = isShellTool(tracked.toolName) ? this._shellManager?.getTerminalUriForToolCall(e.data.toolCallId) : void 0;
      let retireNonPtyShellTracking = !!ptyTerminalUri;
      if (ptyTerminalUri && !content.some((c) => c.type === ToolResultContentType.Terminal)) {
        content.push({
          type: ToolResultContentType.Terminal,
          resource: ptyTerminalUri,
          title: tracked.displayName
        });
      }
      const shellExit = appendSdkToolResultContent(content, e.data.result?.contents, { session: this.sessionUri, toolCallId: e.data.toolCallId, title: tracked.displayName });
      if (isShellTool(tracked.toolName) && !ptyTerminalUri) {
        const completion = this._nonPtyShellTerminals.completeToolCall(e.data.toolCallId, toolOutput, shellExit);
        if (completion) {
          retireNonPtyShellTracking = completion.shouldRetire;
          const terminalIndex = content.findIndex((c) => c.type === ToolResultContentType.Terminal);
          if (terminalIndex === -1) {
            content.push({
              type: ToolResultContentType.Terminal,
              resource: completion.uri,
              title: tracked.displayName,
              isPty: false,
              ...completion.result ? { result: completion.result } : {}
            });
          } else if (completion.result) {
            const terminalBlock = content[terminalIndex];
            content[terminalIndex] = { ...terminalBlock, result: completion.result };
          }
        }
      }
      const command = isString(tracked.parameters?.command) ? tracked.parameters.command : void 0;
      const filePaths = isEditTool(tracked.toolName, command) ? this._getEditFilePaths(tracked.parameters) : [];
      for (const filePath of filePaths) {
        try {
          const fileEdit = await this._editTracker.takeCompletedEdit(this._turnId, e.data.toolCallId, filePath, tracked.toolName, tracked.parameters, this._lastSeenModelId);
          if (fileEdit) {
            content.push(fileEdit);
          }
        } catch (err) {
          this._logService.warn(`[Copilot:${sessionId}] Failed to take completed edit`, err);
        }
      }
      this._emitAction({
        type: ActionType.ChatToolCallComplete,
        turnId: this._turnId,
        toolCallId: e.data.toolCallId,
        result: {
          success: e.data.success,
          pastTenseMessage: getPastTenseMessage(tracked.toolName, displayName, tracked.parameters, e.data.success, e.data.success ? toolOutput : void 0, (path) => this._resolveEditFilePath(path)),
          content: content.length > 0 ? content : void 0,
          error: e.data.error
        },
        _meta: tracked.meta ? toToolCallMeta(tracked.meta) : void 0
      }, parentToolCallId);
      if (retireNonPtyShellTracking) {
        this._nonPtyShellTerminals.retire(e.data.toolCallId);
      }
    }));
    this._register(wrapper.onIdle((e) => {
      this._logService.info(`[Copilot:${sessionId}] Session idle`);
      if (e.data.aborted) {
        this._resetAbortToken();
      }
      if (this._hasActivity) {
        this._hasActivity = false;
        this._emitAction({
          type: ActionType.SessionActivityChanged,
          activity: void 0
        });
      }
      const turn = this._currentTurn;
      if (!turn) {
        return;
      }
      if (e.data.aborted) {
        this._cancelActiveRepoInfoTelemetry();
        if (turn.isRunning) {
          this._logService.trace(`[Copilot:${sessionId}] Idle from abort; tearing down running turn ${turn.id}`);
          this._reportToolCallDetails(turn, "cancelled");
          turn.markAborted();
          this._clearActiveTurn();
        } else {
          this._logService.trace(`[Copilot:${sessionId}] Idle from abort; leaving ${turn.state} turn ${turn.id} open`);
        }
        return;
      }
      this._completeActiveRepoInfoTelemetry();
      this._completeActiveTurn();
    }));
    this._register(wrapper.onSkillInvoked((e) => {
      this._logService.info(`[Copilot:${sessionId}] Skill invoked: ${e.data.name} (${e.data.path})`);
      this._resumeSubagentForEvent(e);
      if (this._shouldDropUnmappedSubagentEvent(e, "skill.invoked")) {
        return;
      }
      if (!e.agentId) {
        this._telemetryReporter.skillContentRead({
          clientType: this._currentTurn?.clientType ?? AgentHostClientType.Unknown,
          name: e.data.name,
          path: e.data.path,
          content: e.data.content,
          source: e.data.source,
          pluginName: e.data.pluginName,
          pluginVersion: e.data.pluginVersion
        });
      }
      const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
      const synth = synthesizeSkillToolCall(e.data, e.id);
      this._emitAction({
        type: ActionType.ChatToolCallStart,
        turnId: this._turnId,
        toolCallId: synth.toolCallId,
        toolName: synth.toolName,
        displayName: synth.displayName
      }, parentToolCallId);
      this._emitAction({
        type: ActionType.ChatToolCallReady,
        turnId: this._turnId,
        toolCallId: synth.toolCallId,
        invocationMessage: synth.invocationMessage,
        confirmed: ToolCallConfirmationReason.NotNeeded
      }, parentToolCallId);
      this._emitAction({
        type: ActionType.ChatToolCallComplete,
        turnId: this._turnId,
        toolCallId: synth.toolCallId,
        result: {
          success: true,
          pastTenseMessage: synth.pastTenseMessage
        }
      }, parentToolCallId);
    }));
    this._register(wrapper.onSubagentStarted((e) => {
      if (e.agentId) {
        this._parentToolCallIdsByAgentId.set(e.agentId, e.data.toolCallId);
        this._activeSubagentAgentIds.add(e.agentId);
      }
      this._logService.info(`[Copilot:${sessionId}] Subagent started: toolCallId=${e.data.toolCallId}, agent=${e.data.agentName}`);
      const tracked = this._activeToolCalls.get(e.data.toolCallId);
      this._onDidSessionProgress.fire({
        kind: "subagent_started",
        chat: this._chatChannelUri,
        toolCallId: e.data.toolCallId,
        agentName: e.data.agentName,
        agentDisplayName: e.data.agentDisplayName,
        agentDescription: e.data.agentDescription,
        // The spawning Task tool's short `description` input (captured on
        // tool start) is the concise per-task tab title for the subagent's
        // read-only peer chat — distinct even for same-type subagents.
        taskDescription: tracked?.meta?.subagentDescription,
        // The full delegated instruction (the spawning tool's `prompt`
        // argument) seeds the subagent peer chat's opening request.
        taskPrompt: typeof tracked?.parameters?.prompt === "string" ? tracked.parameters.prompt : void 0,
        // When the spawning tool call is itself an inner tool of
        // another subagent, its recorded parent is the tool call one
        // level up — the tool call in whose (subagent) chat this
        // spawning tool lives. The host uses it to route the
        // discovery content block to that immediate parent chat, at
        // any nesting depth.
        parentToolCallId: tracked?.parentToolCallId
      });
    }));
    this._register(wrapper.onSessionError((e) => {
      this._logService.error(`[Copilot:${sessionId}] Session error: ${e.data.errorType} - ${e.data.message}`);
      if (this._currentTurn) {
        this._reportToolCallDetails(this._currentTurn, "failed");
      }
      const meta = tryBuildChatErrorMetaFromFields(e.data) ?? tryBuildChatErrorMeta(e.data.message);
      this._emitAction({
        type: ActionType.ChatError,
        turnId: this._turnId,
        duration: this._currentTurn?.duration ?? 0,
        error: {
          errorType: e.data.errorType,
          message: stripProxyErrorMarker(e.data.message),
          stack: e.data.stack,
          ...meta ? { _meta: meta } : {}
        }
      });
    }));
    let lastParentUsage;
    let lastParentUsageTurnId;
    let autoModeResolved;
    this._register(wrapper.onAutoModeResolved((e) => {
      this._lastSeenModelId = e.data.chosenModel;
      const turnId = this._turnId;
      this._logService.info(`[Copilot:${sessionId}] Auto mode resolved to ${e.data.chosenModel}${e.data.reasoningBucket ? ` (${e.data.reasoningBucket})` : ""}`);
      if (!turnId) {
        return;
      }
      if (!e.agentId) {
        this._telemetryReporter.autoModeRouterDecision({
          session: this.sessionUri.toString(),
          turnId,
          clientType: this._currentTurn?.clientType ?? AgentHostClientType.Unknown,
          chosenModel: e.data.chosenModel,
          predictedLabel: e.data.predictedLabel,
          confidence: e.data.confidence,
          candidateModels: e.data.candidateModels,
          categoryScores: e.data.categoryScores
        });
      }
      autoModeResolved = { turnId, data: e.data };
      const priorUsage = lastParentUsageTurnId === turnId ? lastParentUsage : void 0;
      const usage = {
        ...priorUsage,
        model: e.data.chosenModel,
        _meta: {
          ...priorUsage?._meta ?? {},
          autoModeResolved: e.data
        }
      };
      lastParentUsage = usage;
      lastParentUsageTurnId = turnId;
      this._emitAction({
        type: ActionType.ChatUsage,
        turnId,
        usage
      });
    }));
    this._register(wrapper.onUsage((e) => {
      this._resumeSubagentForEvent(e);
      const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
      if (!parentToolCallId && !e.agentId && !e.data.parentToolCallId) {
        this._promptCacheRefreshGeneration++;
        if (e.data.model && e.data.cacheExpiresAt) {
          this._setPromptCacheState({ modelId: e.data.model, cacheExpiresAt: e.data.cacheExpiresAt });
        } else if (e.data.model && this._promptCacheState?.modelId !== e.data.model) {
          this._setPromptCacheState(void 0);
        }
      }
      const copilotUsage = readCopilotUsage(e.data);
      const quotaSnapshots = normalizeQuotaSnapshots(e.data.quotaSnapshots);
      const turn = this._currentTurn;
      if (typeof e.data.model === "string" && e.data.model) {
        this._lastSeenModelId = e.data.model;
      }
      const eventContext = {
        inputTokens: e.data.inputTokens,
        outputTokens: e.data.outputTokens,
        model: e.data.model,
        cacheReadTokens: e.data.cacheReadTokens,
        ...typeof e.data.cost === "number" ? { cost: e.data.cost } : {}
      };
      if (!parentToolCallId && turn) {
        turn.parentContextUsage = eventContext;
      }
      const buildUsage = (context, scopedCopilotUsage, isParentScope) => {
        const metadata = {};
        if (typeof context.cost === "number") {
          metadata.cost = context.cost;
        }
        if (isParentScope && autoModeResolved?.turnId === this._turnId) {
          metadata.autoModeResolved = autoModeResolved.data;
        }
        if (scopedCopilotUsage) {
          metadata.copilotUsage = scopedCopilotUsage;
        }
        if (quotaSnapshots) {
          metadata.quotaSnapshots = quotaSnapshots;
        }
        return {
          inputTokens: context.inputTokens,
          outputTokens: context.outputTokens,
          model: context.model,
          cacheReadTokens: context.cacheReadTokens,
          ...Object.keys(metadata).length > 0 ? { _meta: metadata } : {}
        };
      };
      if (turn && copilotUsage) {
        turn.copilotNanoAiu += copilotUsage.totalNanoAiu;
        if (parentToolCallId) {
          const scopedTotal = (turn.subagentNanoAiuByToolCallId.get(parentToolCallId) ?? 0) + copilotUsage.totalNanoAiu;
          turn.subagentNanoAiuByToolCallId.set(parentToolCallId, scopedTotal);
        }
      }
      const parentContext = parentToolCallId ? turn?.parentContextUsage ?? {} : eventContext;
      const parentUsage = buildUsage(parentContext, this._parentCopilotUsageMeta(), true);
      lastParentUsage = parentUsage;
      lastParentUsageTurnId = this._turnId;
      this._emitAction({
        type: ActionType.ChatUsage,
        turnId: this._turnId,
        usage: parentUsage
      });
      if (parentToolCallId) {
        const scopedTotal = turn?.subagentNanoAiuByToolCallId.get(parentToolCallId);
        const subagentCopilotUsage = copilotUsage && scopedTotal !== void 0 ? { ...copilotUsage, totalNanoAiu: scopedTotal } : void 0;
        this._emitAction({
          type: ActionType.ChatUsage,
          turnId: this._turnId,
          usage: buildUsage(eventContext, subagentCopilotUsage, false)
        }, parentToolCallId);
      }
    }));
    this._register(wrapper.onUsage(async (e) => {
      const isSubagentEvent = !!this._parentToolCallIdForSubagentEvent(e);
      const turnId = this._turnId;
      const baseUsage = lastParentUsageTurnId === turnId ? lastParentUsage : void 0;
      const usage = baseUsage ?? {
        inputTokens: e.data.inputTokens,
        outputTokens: e.data.outputTokens,
        model: e.data.model,
        cacheReadTokens: e.data.cacheReadTokens
      };
      await this._refreshSessionUsageMetrics();
      const attribution = isSubagentEvent ? void 0 : await this._readContextAttribution();
      if (!turnId) {
        return;
      }
      if (turnId !== this._turnId || usage !== lastParentUsage || lastParentUsageTurnId !== turnId) {
        return;
      }
      const copilotUsage = this._parentCopilotUsageMeta();
      if (!attribution && !copilotUsage) {
        return;
      }
      const enriched = {
        ...usage,
        _meta: {
          ...usage._meta ?? {},
          ...copilotUsage ? { copilotUsage } : {},
          ...attribution ? { contextAttribution: attribution } : {}
        }
      };
      lastParentUsage = enriched;
      lastParentUsageTurnId = turnId;
      this._emitAction({
        type: ActionType.ChatUsage,
        turnId,
        usage: enriched
      });
    }));
    this._register(wrapper.onSessionCompactionComplete(async (e) => {
      if (e.agentId || e.data.success === false) {
        return;
      }
      const copilotUsage = readCopilotUsage(e.data.compactionTokensUsed);
      const emitParentUsage = () => {
        const turnId = this._turnId;
        const parentCopilotUsage = this._parentCopilotUsageMeta();
        if (!turnId || !parentCopilotUsage) {
          return void 0;
        }
        const base = lastParentUsageTurnId === turnId ? lastParentUsage : void 0;
        const usage = {
          ...base,
          model: base?.model ?? this._lastSeenModelId,
          _meta: {
            ...base?._meta ?? {},
            copilotUsage: parentCopilotUsage
          }
        };
        lastParentUsage = usage;
        lastParentUsageTurnId = turnId;
        this._emitAction({
          type: ActionType.ChatUsage,
          turnId,
          usage
        });
        return turnId;
      };
      const turn = this._currentTurn;
      if (turn && copilotUsage) {
        turn.copilotNanoAiu += copilotUsage.totalNanoAiu;
        emitParentUsage();
      }
      const turnIdBeforeRefresh = this._turnId;
      if (await this._refreshSessionUsageMetrics() && turnIdBeforeRefresh === this._turnId) {
        emitParentUsage();
      }
    }));
    this._register(wrapper.onReasoningDelta((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Reasoning delta: ${e.data.deltaContent.length} chars`);
      this._resumeSubagentForEvent(e);
      if (this._shouldDropUnmappedSubagentEvent(e, "assistant.reasoning_delta")) {
        return;
      }
      this._emitReasoningDelta(e.data.deltaContent, this._parentToolCallIdForSubagentEvent(e));
    }));
    this._register(wrapper.onSessionModeChanged((e) => {
      if (e.agentId) {
        this._logService.trace(`[Copilot:${sessionId}] Ignoring subagent session.mode_changed: agentId=${e.agentId}, ${e.data.previousMode} -> ${e.data.newMode}`);
        return;
      }
      this._logService.info(`[Copilot:${sessionId}] session.mode_changed: ${e.data.previousMode} -> ${e.data.newMode}`);
      const newMode = e.data.newMode;
      if (newMode !== "interactive" && newMode !== "plan" && newMode !== "autopilot") {
        return;
      }
      this._lastAppliedMode = newMode;
      this._syncAhpConfigFromSdkMode(newMode);
    }));
    this._register(wrapper.onMcpServersLoaded((e) => {
      this._logMcpServersSnapshot(e.data.servers.map((s) => ({
        name: s.name,
        status: s.status,
        error: s.error,
        source: s.source,
        transport: s.transport,
        pluginName: s.pluginName,
        pluginVersion: s.pluginVersion
      })), "loaded");
      this._applyMcpServerList(e.data.servers);
    }));
    this._register(wrapper.onMcpServerStatusChanged((e) => {
      this._logMcpServerLifecycle({ name: e.data.serverName, status: e.data.status, error: e.data.error, origin: "statusChanged" });
      const server = this._toSdkMcpServer(e.data.serverName, e.data.status, e.data.error);
      if (!server) {
        this._mcpCustomizations.remove(e.data.serverName);
        return;
      }
      this._mcpCustomizations.applyOne(server);
    }));
    this._register(wrapper.onToolsUpdated(() => {
      this._slashCommandProvider.clearCache();
      this._fireMcpToolsListChanged();
    }));
    this._register(wrapper.onCommandsChanged(() => {
      this._slashCommandProvider.clearCache();
    }));
    this._seedMcpServersFromRpc();
  }
  /**
   * One-shot fetch of `rpc.mcp.list` at subscription time. Best-effort:
   * any failure is logged and the inventory simply stays empty until the
   * next live event arrives.
   */
  _seedMcpServersFromRpc() {
    this._refreshMcpServersFromRpc().catch((err) => {
      this._logService.warn(`[Copilot:${this.sessionId}] Failed to seed MCP server inventory`, err);
    });
  }
  async _refreshMcpServersFromRpc() {
    const mcpRpc = this._wrapper.session.rpc?.mcp;
    if (!mcpRpc) {
      return;
    }
    const result = await mcpRpc.list();
    if (!this._store.isDisposed) {
      this._logMcpServersSnapshot(result.servers.map((s) => ({
        name: s.name,
        status: s.status,
        error: s.error,
        source: s.source,
        pluginName: s.sourcePlugin,
        pluginVersion: s.sourcePluginVersion
      })), "inventory");
      this._applyMcpServerList(result.servers);
    }
  }
  _applyMcpServerList(servers) {
    const sdkServers = servers.map((s) => this._toSdkMcpServer(s.name, s.status, s.error));
    this._mcpCustomizations.applyAll(sdkServers);
  }
  /**
   * Logs a full MCP inventory snapshot ({@link _logMcpServerLifecycle} per
   * server), then forgets the dedup entry for any server that dropped out of
   * the snapshot so a later re-add re-logs its arrival.
   */
  _logMcpServersSnapshot(servers, origin) {
    const seen = /* @__PURE__ */ new Set();
    for (const server of servers) {
      seen.add(server.name);
      this._logMcpServerLifecycle({ ...server, origin });
    }
    for (const name of [...this._lastLoggedMcpStatus.keys()]) {
      if (!seen.has(name)) {
        this._lastLoggedMcpStatus.delete(name);
      }
    }
  }
  /**
   * Emits a single structured MCP lifecycle log record for `server`,
   * deduplicated by SDK status so an unchanged re-report stays quiet. Failed
   * servers log at `error` (carrying the failure text in the body and an
   * `errorType` attribute); every other transition logs at `info`. Records
   * flow through {@link ILogService} to the agent host's OTLP log stream.
   */
  _logMcpServerLifecycle(server) {
    if (this._lastLoggedMcpStatus.get(server.name) === server.status) {
      return;
    }
    this._lastLoggedMcpStatus.set(server.name, server.status);
    const state = this._translateSdkMcpStatus(server.name, server.status, server.error);
    const attributes = {
      mcpEvent: server.origin,
      mcpServer: server.name,
      mcpStatus: server.status,
      mcpState: state.kind
    };
    if (server.source) {
      attributes.mcpSource = server.source;
    }
    if (server.transport) {
      attributes.mcpTransport = server.transport;
    }
    if (server.pluginName) {
      attributes.mcpPlugin = server.pluginName;
    }
    if (server.pluginVersion) {
      attributes.mcpPluginVersion = server.pluginVersion;
    }
    if (state.kind === McpServerStatus.Error) {
      attributes.errorType = state.error.errorType;
    }
    const detail = server.error ? `: ${server.error}` : "";
    const message = `[Copilot:${this.sessionId}] MCP server '${server.name}' ${server.status} (${state.kind})${detail}`;
    if (server.status === "failed") {
      this._logService.error(message, new OtelData(attributes));
    } else {
      this._logService.info(message, new OtelData(attributes));
    }
  }
  _setToolCallUiMeta(meta, resourceUri, mcpServerName) {
    if (!resourceUri) {
      return;
    }
    const ui = { resourceUri };
    if (mcpServerName) {
      const channel = this._mcpCustomizations.channelForServer(mcpServerName);
      if (channel !== void 0) {
        ui.channel = channel;
      }
    }
    meta.ui = ui;
  }
  /**
   * Broadcasts `notifications/tools/list_changed` for every MCP server
   * currently in the `Ready` state. The SDK's `session.tools_updated`
   * event is a coarse "tools refreshed" hint that doesn't identify
   * which server changed, so we fan out to all ready channels. Clients
   * are expected to refetch `tools/list` on each notification.
   */
  _fireMcpToolsListChanged() {
    for (const { channel } of this._mcpCustomizations.readyChannels()) {
      this._onMcpNotification.fire({
        channel,
        method: "notifications/tools/list_changed"
      });
    }
  }
  /** Snapshot of MCP servers that have no plugin-derived child entry. */
  topLevelMcpCustomizations() {
    return this._mcpCustomizations.topLevelCustomizations();
  }
  /**
   * Translates the SDK's flat MCP status string into AHP's discriminated
   * {@link McpServerState} union.
   */
  _toSdkMcpServer(name, status, error) {
    return {
      name,
      state: this._translateSdkMcpStatus(name, status, error),
      enabled: status !== "disabled"
    };
  }
  _translateSdkMcpStatus(name, status, error) {
    switch (status) {
      case "connected":
        return { kind: McpServerStatus.Ready };
      case "failed":
        return {
          kind: McpServerStatus.Error,
          error: {
            errorType: "mcp-server-failed",
            message: error ?? "MCP server failed to start"
          }
        };
      case "pending":
      case "needs-auth": {
        const previous = this._mcpCustomizations.stateForServer(name);
        if (previous?.kind === McpServerStatus.AuthRequired) {
          return previous;
        }
        return { kind: McpServerStatus.Starting };
      }
      case "disabled":
      case "not_configured":
        return { kind: McpServerStatus.Stopped };
      default:
        return { kind: McpServerStatus.Stopped };
    }
  }
  /**
   * Translates the SDK's three-mode space (`interactive` / `plan` /
   * `autopilot`) to AHP's `mode` axis directly:
   *
   *  - SDK `plan` → AHP `mode='plan'`.
   *  - SDK `interactive` → AHP `mode='interactive'`.
   *  - SDK `autopilot` → AHP `mode='autopilot'`.
   *
   * Autopilot lives on the `mode` axis; the orthogonal `autoApprove` axis
   * (Default / Bypass) is left untouched so the user's chosen
   * approval level is preserved across SDK mode transitions.
   *
   * Patches that already match the current AHP values are still
   * dispatched (the reducer is a no-op in that case) but written values
   * propagate to all subscribed clients via `session/configChanged`.
   */
  _syncAhpConfigFromSdkMode(sdkMode) {
    const sessionUri = this._storageUri.toString();
    const patch = {};
    switch (sdkMode) {
      case "plan":
        patch[SessionConfigKey.Mode] = "plan";
        break;
      case "autopilot":
        patch[SessionConfigKey.Mode] = "autopilot";
        break;
      case "interactive":
        patch[SessionConfigKey.Mode] = "interactive";
        break;
    }
    this._configurationService.updateSessionConfig(sessionUri, patch);
  }
  /**
   * Handles the CLI's `exitPlanMode.request` RPC by surfacing it as a
   * {@link ChatInputRequest} and awaiting the client's response. The
   * resolved {@link IExitPlanModeResponse} flows back to the CLI, which
   * calls `session.respondToExitPlanMode` internally — that resumes the
   * paused `exit_plan_mode` tool call and (on accept) updates the SDK's
   * `currentMode` so the model can continue with implementation.
   */
  async _handleExitPlanModeRequest(data, _invocation) {
    const turnId = this._currentTurn?.id;
    if (!turnId) {
      this._logService.warn(`[Copilot:${this.sessionId}] Rejecting plan review request without an active turn`);
      return { approved: false };
    }
    const requestId = generateUuid();
    const questionId = generateUuid();
    this._logService.info(`[Copilot:${this.sessionId}] exitPlanMode.request: rpcId=${requestId}, actions=[${data.actions.join(",")}], recommended=${data.recommendedAction}`);
    let planPath = null;
    try {
      const planRead = await this._wrapper.session.rpc.plan.read();
      planPath = planRead.path ?? null;
    } catch (err) {
      this._logService.warn(`[Copilot:${this.sessionId}] rpc.plan.read failed for exit_plan_mode: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (this._currentTurn?.id !== turnId) {
      this._logService.warn(`[Copilot:${this.sessionId}] Rejecting plan review request after its turn ended`);
      return { approved: false };
    }
    const options = data.actions.map((actionId) => {
      const desc = getPlanActionDescription(actionId);
      return {
        id: actionId,
        label: desc?.label ?? actionId,
        description: desc?.description,
        recommended: actionId === data.recommendedAction
      };
    });
    const actions = options.map((option) => ({
      id: option.id,
      label: option.label,
      ...option.description ? { description: option.description } : {},
      ...option.recommended ? { default: true } : {}
    }));
    const inputRequest = {
      id: requestId,
      planReview: {
        title: localize("agentHost.planReview.title", "Review Plan"),
        content: data.summary || localize("agentHost.planReview.fallbackSummary", "A plan is ready for review."),
        actions,
        canProvideFeedback: true,
        answerQuestionId: questionId,
        ...planPath ? { planUri: URI.file(planPath).toString() } : {}
      },
      questions: [{
        kind: ChatInputQuestionKind.SingleSelect,
        id: questionId,
        title: localize("agentHost.planReview.title", "Review Plan"),
        message: localize("agentHost.planReview.questionMessage", "How would you like to proceed?"),
        required: true,
        options,
        allowFreeformInput: true
      }]
    };
    const pendingPlanReview = this._pendingPlanReviews.register(requestId, {
      actions: data.actions,
      recommendedAction: data.recommendedAction,
      questionId
    });
    this._onDidSessionProgress.fire({
      kind: "action",
      resource: this._chatChannelUri,
      action: {
        type: ActionType.ChatInputRequested,
        request: inputRequest
      }
    });
    try {
      return await pendingPlanReview;
    } catch (err) {
      this._logService.error(err, `[Copilot:${this.sessionId}] exitPlanMode.request handler failed: rpcId=${requestId}`);
      return { approved: false };
    }
  }
  /**
   * Drop the memoized event reconstruction whenever the persisted event log
   * could have changed, so {@link _getMappedEvents} never serves stale turns
   * once the session resumes activity. While the session is idle (e.g. during
   * a historical session open) none of these fire, so the whole restore wave
   * coalesces to a single reconstruction.
   */
  _subscribeForMemoInvalidation() {
    const wrapper = this._wrapper;
    const invalidate = () => this._invalidateMappedEvents();
    this._register(wrapper.onUserMessage(invalidate));
    this._register(wrapper.onTurnStart(invalidate));
    this._register(wrapper.onMessage(invalidate));
    this._register(wrapper.onToolStart(invalidate));
    this._register(wrapper.onToolComplete(invalidate));
    this._register(wrapper.onSubagentStarted(invalidate));
    this._register(wrapper.onSubagentCompleted(invalidate));
    this._register(wrapper.onSubagentFailed(invalidate));
    this._register(wrapper.onTurnEnd(invalidate));
    this._register(wrapper.onSessionCompactionComplete(invalidate));
    this._register(wrapper.onSessionTruncation(invalidate));
    this._register(wrapper.onSessionSnapshotRewind(invalidate));
  }
  /**
   * Emits `instructionsCollected` per user message.
   * Attempts to match local chat's `ComputeAutomaticInstructions`
   * emitter (`src/vs/workbench/contrib/chat/common/promptSyntax/computeAutomaticInstructions.ts`)
   */
  _subscribeForInstructionsCollectedTelemetry() {
    const wrapper = this._wrapper;
    const sessionId = this.sessionId;
    this._register(wrapper.onUserMessage((e) => {
      if (e.agentId || e.data.source && e.data.source.toLowerCase() !== "user") {
        return;
      }
      void (async () => {
        let sources;
        try {
          sources = (await wrapper.session.rpc.instructions.getSources()).sources;
        } catch (err) {
          this._logService.trace(`[Copilot:${sessionId}] Failed to fetch instruction sources for telemetry: ${getErrorMessage(err)}`);
          return;
        }
        let agentInstructionsCount = 0;
        let applyingInstructionsCount = 0;
        let referencedInstructionsCount = 0;
        let claudeMdCount = 0;
        for (const s of sources) {
          if (s.type === "home" || s.type === "repo" || s.type === "model") {
            agentInstructionsCount++;
          }
          if (s.applyTo && s.applyTo.length > 0) {
            applyingInstructionsCount++;
          }
          if (s.type === "child-instructions" || s.type === "nested-agents") {
            referencedInstructionsCount++;
          }
          const lastSep = Math.max(s.sourcePath.lastIndexOf("/"), s.sourcePath.lastIndexOf("\\"));
          const filename = lastSep >= 0 ? s.sourcePath.slice(lastSep + 1) : s.sourcePath;
          if (filename === "CLAUDE.md") {
            claudeMdCount++;
          }
        }
        this._telemetryService.publicLog2("agentHost.instructionsCollected", {
          provider: this.sessionUri.scheme,
          agentSessionId: AgentSession.id(this.sessionUri),
          isSubagentSession: isSubagentSession(this.sessionUri),
          totalInstructionsCount: sources.length,
          agentInstructionsCount,
          applyingInstructionsCount,
          referencedInstructionsCount,
          claudeMdCount
        });
      })().catch((err) => {
        this._logService.trace(`[Copilot:${sessionId}] instructionsCollected telemetry failed: ${getErrorMessage(err)}`);
      });
    }));
  }
  _subscribeForLogging() {
    const wrapper = this._wrapper;
    const sessionId = this.sessionId;
    this._register(wrapper.onUnhandledEvent((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Unhandled SDK event: ${safeStringify(e)}`);
    }));
    this._register(wrapper.onSessionStart((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Session started: model=${e.data.selectedModel ?? "default"}, producer=${e.data.producer}`);
    }));
    this._register(wrapper.onSessionResume((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Session resumed: eventCount=${e.data.eventCount}`);
    }));
    this._register(wrapper.onSessionInfo((e) => {
      const attributes = { infoType: e.data.infoType };
      if (e.data.tip) {
        attributes.tip = e.data.tip;
      }
      const message = `[Copilot:${sessionId}] [${e.data.infoType}]: ${e.data.message}`;
      const otelData = new OtelData(attributes);
      if (e.data.infoType === "mcp") {
        this._logService.info(message, otelData);
      } else {
        this._logService.trace(message, otelData);
      }
    }));
    this._register(wrapper.onSessionWarning((e) => {
      this._logService.warn(`[Copilot:${sessionId}] ${e.data.message}`, new OtelData({ warningType: e.data.warningType }));
    }));
    this._register(wrapper.onSessionModelChange((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Model changed: ${e.data.previousModel ?? "(none)"} -> ${e.data.newModel}`);
      if (!e.agentId) {
        this._promptCacheRefreshGeneration++;
        if (e.data.previousModel !== e.data.newModel) {
          this._setPromptCacheState(void 0);
        }
        void this._refreshSessionUsageMetrics();
      }
    }));
    this._register(wrapper.onManagedSettingsResolved((e) => {
      this._logService.info(`[Copilot:${sessionId}] Managed settings resolved: source=${e.data.source}, managedKeys=${e.data.managedKeys.join(",") || "(none)"}, bypassPermissionsDisabled=${e.data.bypassPermissionsDisabled}, failClosed=${e.data.failClosed}`);
    }));
    this._register(wrapper.onManagedSettingsEnforced((e) => {
      this._logService.warn(`[Copilot:${sessionId}] Managed settings enforced: action=${e.data.action}, setting=${e.data.setting}, escalation=${e.data.escalation ?? "(none)"}, failClosed=${e.data.failClosed}, message=${e.data.message}`);
    }));
    this._register(wrapper.onSessionHandoff((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Session handoff: sourceType=${e.data.sourceType}, remoteSessionId=${e.data.remoteSessionId ?? "(none)"}`);
    }));
    this._register(wrapper.onSessionTruncation((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Session truncation: removed ${e.data.tokensRemovedDuringTruncation} tokens, ${e.data.messagesRemovedDuringTruncation} messages`);
    }));
    this._register(wrapper.onSessionSnapshotRewind((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Snapshot rewind: upTo=${e.data.upToEventId}, eventsRemoved=${e.data.eventsRemoved}`);
    }));
    this._register(wrapper.onSessionShutdown((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Session shutdown: type=${e.data.shutdownType}, apiDuration=${e.data.totalApiDurationMs}ms`);
    }));
    this._register(wrapper.onSessionUsageInfo((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Usage info: ${e.data.currentTokens}/${e.data.tokenLimit} tokens, ${e.data.messagesLength} messages`);
    }));
    this._register(wrapper.onSessionCompactionStart(() => {
      this._logService.trace(`[Copilot:${sessionId}] Compaction started`);
    }));
    this._register(wrapper.onSessionCompactionComplete((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Compaction complete: success=${e.data.success}, tokensRemoved=${e.data.tokensRemoved ?? "?"}`);
    }));
    this._register(wrapper.onUserMessage((e) => {
      this._logService.trace(`[Copilot:${sessionId}] User message: ${e.data.content.length} chars, ${e.data.attachments?.length ?? 0} attachments`);
      if (!e.agentId && (!e.data.source || e.data.source.toLowerCase() === "user")) {
        void this._telemetryReporter.userMessageText(this.sessionUri.toString(), this._currentTurn?.clientType ?? AgentHostClientType.Unknown, e.data.content, this._turnOrdinal).catch((err) => this._logService.trace(`[Copilot:${this.sessionId}] Telemetry emission failed: ${getErrorMessage(err)}`));
      }
    }));
    this._register(wrapper.onPendingMessagesModified(() => {
      this._logService.trace(`[Copilot:${sessionId}] Pending messages modified`);
    }));
    this._register(wrapper.onTurnStart((e) => {
      this._currentTurn?.markRunning();
      this._logService.trace(`[Copilot:${sessionId}] Turn started: ${e.data.turnId}`);
      if (!e.agentId) {
        const telemetryMessageId = this._currentTurn?.id ?? e.data.turnId;
        if (this._activeRepoInfoTurn?.telemetryMessageId === telemetryMessageId) {
          return;
        }
        this._cancelActiveRepoInfoTelemetry();
        const turn = {
          telemetryMessageId,
          cancelled: false,
          begin: Promise.resolve(void 0)
        };
        const isCurrent = () => !turn.cancelled && this._isLaunchTokenCurrent();
        turn.begin = this._beginRepoInfoTelemetry(telemetryMessageId, this._currentTurn?.clientType ?? AgentHostClientType.Unknown, isCurrent);
        this._activeRepoInfoTurn = turn;
      }
    }));
    this._register(wrapper.onIntent((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Intent: ${e.data.intent}`);
      const activity = e.data.intent || void 0;
      if (activity === void 0 && !this._hasActivity) {
        return;
      }
      this._hasActivity = activity !== void 0;
      this._emitAction({
        type: ActionType.SessionActivityChanged,
        activity
      });
    }));
    this._register(wrapper.onReasoning((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Reasoning: ${e.data.content.length} chars`);
    }));
    this._register(wrapper.onTurnEnd((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Turn ended: ${e.data.turnId}`);
    }));
    this._register(wrapper.onAbort((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Aborted: ${e.data.reason}`);
      this._cancelActiveRepoInfoTelemetry();
      if (this._currentTurn?.isRunning) {
        this._reportToolCallDetails(this._currentTurn, "cancelled");
      }
    }));
    this._register(wrapper.onToolUserRequested((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Tool user-requested: ${e.data.toolName} (${e.data.toolCallId})`);
    }));
    this._register(wrapper.onToolPartialResult((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Tool partial result: ${e.data.toolCallId} (${e.data.partialOutput.length} chars)`);
      const tracked = this._activeToolCalls.get(e.data.toolCallId);
      if (!tracked || !isShellTool(tracked.toolName)) {
        return;
      }
      if (this._shellManager?.getTerminalUriForToolCall(e.data.toolCallId)) {
        return;
      }
      const appended = this._nonPtyShellTerminals.append(e.data.toolCallId, e.data.partialOutput);
      if (appended?.created) {
        const { uri } = appended;
        tracked.content.push({
          type: ToolResultContentType.Terminal,
          resource: uri,
          title: tracked.displayName,
          isPty: false
        });
        this._emitAction({
          type: ActionType.ChatToolCallContentChanged,
          turnId: this._turnId,
          toolCallId: e.data.toolCallId,
          content: tracked.content
        }, tracked.parentToolCallId);
      }
    }));
    this._register(wrapper.onToolProgress((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Tool progress: ${e.data.toolCallId} - ${e.data.progressMessage}`);
    }));
    this._register(wrapper.onSkillInvoked((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Skill invoked: ${e.data.name} (${e.data.path})`);
    }));
    this._register(wrapper.onSubagentStarted((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Subagent started: ${e.data.agentName} (${e.data.agentDisplayName})`);
    }));
    this._register(wrapper.onSubagentCompleted((e) => {
      this._completeSubagentTurn(e.agentId, e.data.toolCallId);
      this._logService.trace(`[Copilot:${sessionId}] Subagent completed: ${e.data.agentName}`);
    }));
    this._register(wrapper.onSubagentFailed((e) => {
      this._completeSubagentTurn(e.agentId, e.data.toolCallId);
      this._logService.error(`[Copilot:${sessionId}] Subagent failed: ${e.data.agentName} - ${e.data.error}`);
    }));
    this._register(wrapper.onSubagentSelected((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Subagent selected: ${e.data.agentName}`);
    }));
    this._register(wrapper.onHookStart((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Hook started: ${e.data.hookType} (${e.data.hookInvocationId})`);
    }));
    this._register(wrapper.onHookEnd((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Hook ended: ${e.data.hookType} (${e.data.hookInvocationId}), success=${e.data.success}`);
      if (e.data.hookType === "agentStop") {
        this._completeSubagentTurn(e.agentId);
      }
    }));
    this._register(wrapper.onSystemMessage((e) => {
      this._logService.trace(`[Copilot:${sessionId}] System message [${e.data.role}]: ${e.data.content.length} chars`);
    }));
  }
  // ---- SDK event ID tracking & truncation ---------------------------------
  /**
   * Returns the SDK event ID for the turn inserted after the given turn,
   * or `undefined` if it's the last turn.
   */
  getNextTurnEventId(turnId) {
    return this._databaseRef.object.getNextTurnEventId(turnId);
  }
  /**
   * Returns the SDK event ID of the earliest turn.
   */
  getFirstTurnEventId() {
    return this._databaseRef.object.getFirstTurnEventId();
  }
  /**
   * Truncates the session history via the SDK's RPC and cleans up
   * stale turns from the session database.
   *
   * @param eventId The SDK event ID at which to truncate. This event
   *        and all events after it are removed.
   * @param keepTurnId If provided, turns inserted after this turn are
   *        deleted from the DB. If omitted, all turns are deleted.
   */
  async truncateAtEventId(eventId, keepTurnId) {
    this._logService.info(`[Copilot:${this.sessionId}] Truncating via SDK RPC at eventId=${eventId}`);
    const result = await this._wrapper.session.rpc.history.truncate({ eventId });
    this._logService.info(`[Copilot:${this.sessionId}] SDK truncation removed ${result.eventsRemoved} events`);
    if (keepTurnId) {
      await this._databaseRef.object.deleteTurnsAfter(keepTurnId);
    } else {
      await this._databaseRef.object.deleteAllTurns();
    }
  }
  /**
   * Bulk-remaps turn IDs in this session's database.
   * Used after file-copying a source session's database for a fork.
   */
  async remapTurnIds(mapping) {
    await this._databaseRef.object.remapTurnIds(mapping);
  }
  // ---- cleanup ------------------------------------------------------------
  /**
   * Cancels every pending interaction for abort and dispose. This completes synchronously before any awaiter resumes, so ordering is not significant.
   */
  _cancelAllPendingInteractions() {
    this._cancelPendingAutoApprovals();
    this._denyPendingPermissions();
    this._cancelPendingUserInputs();
    this._cancelPendingElicitations();
    this._cancelPendingPlanReviews();
    this._cancelPendingMcpAuthRequests();
    this._cancelPendingMcpSamplings();
    this._cancelPendingClientToolCalls();
  }
  _cancelPendingAutoApprovals() {
    this._pendingAutoApprovals.denyAll(void 0);
    this._autoApprovals.clear();
  }
  _denyPendingPermissions() {
    for (const [toolCallId] of this._pendingPermissions.entries()) {
      this._deletePendingEditContent(toolCallId);
    }
    this._pendingPermissions.denyAll({ kind: "reject" });
    this._approvedDuplicablePermissionSignatures.clear();
  }
  /**
   * Removes any `pending-edit-content:` entries associated with a resolved
   * (approved, denied, or cancelled) permission request.
   */
  _deletePendingEditContent(toolCallId) {
    const uri = this._pendingEditContentUris.get(toolCallId);
    if (!uri) {
      return;
    }
    this._pendingEditContentUris.delete(toolCallId);
    this._fileService.del(uri).catch((err) => {
      this._logService.warn(`[Copilot:${this.sessionId}] Failed to delete pending edit content: ${uri.toString()}`, err);
    });
  }
  _cancelPendingUserInputs() {
    this._pendingUserInputs.denyAll({ response: ChatInputResponseKind.Cancel });
  }
  _cancelPendingElicitations() {
    this._pendingElicitations.denyAll({ response: ChatInputResponseKind.Cancel });
  }
  _cancelPendingPlanReviews() {
    this._pendingPlanReviews.denyAll({ approved: false });
  }
  _cancelPendingMcpSamplings() {
    const pending = Array.from(this._pendingMcpSamplings);
    this._pendingMcpSamplings.clear();
    for (const requestId of pending) {
      this._wrapper.session.rpc.mcp.cancelSamplingExecution({ requestId }).catch(() => {
      });
    }
  }
  _cancelPendingClientToolCalls() {
    this._pendingClientToolCalls.denyAll({ textResultForLlm: "Tool call cancelled: session ended", resultType: "failure", error: "Session ended" });
  }
};
CopilotAgentSession = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILogService),
  __decorateParam(3, ISessionDataService),
  __decorateParam(4, IFileService),
  __decorateParam(5, INativeEnvironmentService),
  __decorateParam(6, IAgentConfigurationService),
  __decorateParam(7, IAgentHostStateManager),
  __decorateParam(8, ITelemetryService),
  __decorateParam(9, ICopilotApiService)
], CopilotAgentSession);
function countUnifiedDiffLines(diff) {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    if (line.startsWith("+")) {
      added++;
    } else if (line.startsWith("-")) {
      removed++;
    }
  }
  if (added === 0 && removed === 0) {
    return void 0;
  }
  return { added, removed };
}
function readCopilotUsage(raw) {
  if (!raw || typeof raw !== "object") {
    return void 0;
  }
  const usage = raw.copilotUsage;
  if (!usage || typeof usage !== "object") {
    return void 0;
  }
  const totalNanoAiu = usage.totalNanoAiu;
  if (typeof totalNanoAiu !== "number" || !Number.isFinite(totalNanoAiu) || totalNanoAiu < 0) {
    return void 0;
  }
  return { ...usage, totalNanoAiu };
}
function normalizeQuotaSnapshots(raw) {
  if (!raw || typeof raw !== "object") {
    return void 0;
  }
  const result = {};
  let hasAny = false;
  for (const [quotaType, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const v = value;
    const resetDateRaw = v.resetDate;
    const resetDate = typeof resetDateRaw === "string" ? resetDateRaw : resetDateRaw instanceof Date ? resetDateRaw.toISOString() : void 0;
    result[quotaType] = {
      isUnlimitedEntitlement: typeof v.isUnlimitedEntitlement === "boolean" ? v.isUnlimitedEntitlement : void 0,
      entitlementRequests: typeof v.entitlementRequests === "number" ? v.entitlementRequests : void 0,
      usedRequests: typeof v.usedRequests === "number" ? v.usedRequests : void 0,
      remainingPercentage: typeof v.remainingPercentage === "number" ? v.remainingPercentage : void 0,
      overage: typeof v.overage === "number" ? v.overage : void 0,
      overageAllowedWithExhaustedQuota: typeof v.overageAllowedWithExhaustedQuota === "boolean" ? v.overageAllowedWithExhaustedQuota : void 0,
      resetDate
    };
    hasAny = true;
  }
  return hasAny ? result : void 0;
}
export {
  CopilotAgentSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NvcGlsb3QvY29waWxvdEFnZW50U2Vzc2lvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgQ29waWxvdFNlc3Npb24sIEN1cnJlbnRUb29sTWV0YWRhdGEsIEV4aXRQbGFuTW9kZVJlcXVlc3QsIE1jcFNlcnZlcnNMb2FkZWRTZXJ2ZXIsIE1lc3NhZ2VPcHRpb25zLCBQZXJtaXNzaW9uQWxsb3dBbGxNb2RlLCBQZXJtaXNzaW9uQXV0b0FwcHJvdmFsLCBQZXJtaXNzaW9uUmVxdWVzdFJlc3VsdCwgUGVybWlzc2lvblJlc3VsdCwgU2Vzc2lvbkNvbmZpZywgVG9vbCwgVG9vbFJlc3VsdE9iamVjdCwgTWNwU2VydmVyU3RhdHVzIGFzIFNka01jcFNlcnZlclN0YXR1cyB9IGZyb20gJ0BnaXRodWIvY29waWxvdC1zZGsnO1xuaW1wb3J0IHsgcmFjZUNhbmNlbGxhdGlvbiwgUnVuT25jZVNjaGVkdWxlciwgU2VxdWVuY2VyLCBUaHJvdHRsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBlbmNvZGVCYXNlNjQsIFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIGdldEVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBlc2NhcGVNYXJrZG93blN5bnRheFRva2VucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIElSZWZlcmVuY2UsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgaXNBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29hdXRoLmpzJztcbmltcG9ydCB7IHNhZmVTdHJpbmdpZnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGlzQWJzb2x1dGUsIGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLCBub3JtYWxpemVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBzcGxpdExpbmVzSW5jbHVkZVNlcGFyYXRvcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGhhc0tleSwgaXNEZWZpbmVkLCBpc09iamVjdCwgaXNTdHJpbmcsIHR5cGUgTXV0YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIExvZ0xldmVsIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBnZXRDb3BpbG90SG9tZVBhdGggfSBmcm9tICcuLi8uLi9jb21tb24vY29waWxvdEhvbWUuanMnO1xuaW1wb3J0IHsgQ29waWxvdENsaUNvbmZpZ0tleSwgYXBwbHlNb2RlbEZhbWlseUFsaWFzLCBjb3BpbG90Q2xpQ29uZmlnU2NoZW1hIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcGlsb3RDbGlDb25maWcuanMnO1xuaW1wb3J0IHR5cGUgeyBDaGF0SW5wdXRSZXF1ZXN0V2l0aFBsYW5SZXZpZXcsIElBZ2VudEhvc3RQbGFuUmV2aWV3QWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFBsYW5SZXZpZXcuanMnO1xuaW1wb3J0IHsgZ2l0SHViTWNwU2VydmVyVXJsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2dpdGh1YkVuZHBvaW50cy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTYW5kYm94Q29uZmlnS2V5LCBzYW5kYm94Q29uZmlnU2NoZW1hIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NhbmRib3hDb25maWdTY2hlbWEuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0R2xvYmFsQXV0b0FwcHJvdmVFbmFibGVkQ29uZmlnS2V5LCBBZ2VudEhvc3RBdXRvUmVwbHlBbnN3ZXIsIEFnZW50SG9zdEF1dG9SZXBseUVuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdERpc2FibGVSZXBvSW5mb1RlbGVtZXRyeUNvbmZpZ0tleSwgcGxhdGZvcm1Sb290U2NoZW1hLCBwbGF0Zm9ybVNlc3Npb25TY2hlbWEgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiwgQWdlbnRTaWduYWwsIEF1dGhlbnRpY2F0ZVBhcmFtcywgSU1jcE5vdGlmaWNhdGlvbiwgSVJlc3RvcmVkU3ViYWdlbnRTZXNzaW9uLCBzdWJhZ2VudENoYXRUaXRsZSwgdHlwZSBJQWdlbnRUb29sUGVuZGluZ0NvbmZpcm1hdGlvblNpZ25hbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTUVUQV9ESUZGX0JBU0VfQlJBTkNIIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgc3RyaXBSZWR1bmRhbnRDZFByZWZpeCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb21tYW5kTGluZUhlbHBlcnMuanMnO1xuaW1wb3J0IHsgcmVhZFRvb2xDYWxsTWV0YSwgdG9Ub29sQ2FsbE1ldGEsIHR5cGUgSVRvb2xDYWxsTWV0YSwgdHlwZSBJVG9vbENhbGxVaU1ldGEsIHR5cGUgSVRvb2xTZWFyY2hDYW5kaWRhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vbWV0YS9hZ2VudFRvb2xDYWxsTWV0YS5qcyc7XG5pbXBvcnQgeyBPdGVsRGF0YSwgdHlwZSBPdGVsQXR0cmlidXRlVmFsdWUgfSBmcm9tICcuLi8uLi9jb21tb24vb3RscC9vdGxwTG9nRW1pdHRlci5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IHJlc29sdmVDb3BpbG90Q29uZmlnU2xhc2hDb21tYW5kT25TZW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcGlsb3RDb25maWdTbGFzaENvbW1hbmRzLmpzJztcbmltcG9ydCB7IFNUUkVBTUlOR19UT09MX0RJU1BMQVlfSU5URVJWQUxfTVMsIHN0cmVhbWluZ1Rvb2xEaXNwbGF5VGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdHJlYW1pbmdUb29sQ2FsbERpc3BsYXkuanMnO1xuaW1wb3J0IHsgaXNBZ2VudEZlZWRiYWNrQW5ub3RhdGlvbnNBdHRhY2htZW50LCByZW5kZXJBZ2VudEZlZWRiYWNrQW5ub3RhdGlvbnNBdHRhY2htZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL21ldGEvYWdlbnRGZWVkYmFja0F0dGFjaG1lbnRzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGF0YWJhc2UsIElTZXNzaW9uRGF0YVNlcnZpY2UsIFNFU1NJT05fQVRUQUNITUVOVFNfRElSTkFNRSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uRGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLCBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZCwgdHlwZSBGaWxlRWRpdCwgdHlwZSBNZXNzYWdlQXR0YWNobWVudCwgdHlwZSBUb29sQ2FsbENvbnRyaWJ1dG9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIGlzQ2hhdEFjdGlvbiwgdHlwZSBDaGF0QWN0aW9uLCB0eXBlIFNlc3Npb25BY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUtpbmQsIFJlc3BvbnNlUGFydEtpbmQsIENoYXRJbnB1dEFuc3dlclN0YXRlLCBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQsIENoYXRJbnB1dFF1ZXN0aW9uS2luZCwgQ2hhdElucHV0UmVzcG9uc2VLaW5kLCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgVG9vbENhbGxSaXNrQXNzZXNzbWVudEtpbmQsIFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRTdGF0dXMsIFRvb2xDYWxsU3RhdHVzLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpLCBnZXRUb29sU3ViYWdlbnRDb250ZW50LCBpc0RlZmF1bHRDaGF0VXJpLCBpc1N1YmFnZW50U2Vzc2lvbiwgcmVhZFNlc3Npb25Qcm9tcHRDYWNoZVN0YXRlLCB3aXRoU2Vzc2lvblByb21wdENhY2hlU3RhdGUsIHR5cGUgTWVzc2FnZSwgdHlwZSBQZW5kaW5nTWVzc2FnZSwgdHlwZSBDaGF0SW5wdXRBbnN3ZXIsIHR5cGUgQ2hhdElucHV0T3B0aW9uLCB0eXBlIENoYXRJbnB1dFF1ZXN0aW9uLCB0eXBlIENoYXRJbnB1dFJlcXVlc3QsIHR5cGUgVG9vbENhbGxSZXN1bHQsIHR5cGUgVG9vbFJlc3VsdENvbnRlbnQsIHR5cGUgVG9vbFJlc3VsdFRlcm1pbmFsQ29udGVudCwgdHlwZSBUdXJuLCB0eXBlIFVzYWdlSW5mbywgdHlwZSBVc2FnZUluZm9NZXRhLCB0eXBlIElDb250ZXh0QXR0cmlidXRpb25EYXRhLCB0eXBlIElTZXNzaW9uUHJvbXB0Q2FjaGVTdGF0ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSUV4aXRQbGFuTW9kZVJlc3BvbnNlIH0gZnJvbSAnLi9jb3BpbG90QWdlbnQuanMnO1xuaW1wb3J0IHsgQ29waWxvdFNlc3Npb25XcmFwcGVyIH0gZnJvbSAnLi9jb3BpbG90U2Vzc2lvbldyYXBwZXIuanMnO1xuaW1wb3J0IHsgY2xpZW50VG9vbE5hbWVzRnJvbVNuYXBzaG90LCB0eXBlIENvcGlsb3RTZXNzaW9uTGF1bmNoUGxhbiwgdHlwZSBJQWN0aXZlQ2xpZW50U25hcHNob3QsIHR5cGUgSUNvcGlsb3RTZXNzaW9uTGF1bmNoZXIsIHR5cGUgSUNvcGlsb3RTZXNzaW9uUnVudGltZSB9IGZyb20gJy4vY29waWxvdFNlc3Npb25MYXVuY2hlci5qcyc7XG5pbXBvcnQgeyBhZ2VudEhvc3RNb2RlbFN1cHBvcnRzVG9vbFNlYXJjaCwgQ0xJRU5UX1RPT0xfU0VBUkNIX1JFRkVSRU5DRV9OQU1FLCBOT05fREVGRVJSRURfQ0xJRU5UX1RPT0xfTkFNRVMsIFJVTlRJTUVfVE9PTF9TRUFSQ0hfVE9PTF9OQU1FIH0gZnJvbSAnLi90b29sU2VhcmNoRGVmZXJyYWwuanMnO1xuaW1wb3J0IHsgQWN0aXZlQ2xpZW50VG9vbFNldCB9IGZyb20gJy4uL2FjdGl2ZUNsaWVudFN0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFRlbGVtZXRyeVJlcG9ydGVyIH0gZnJvbSAnLi4vYWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0UmVwb0luZm9UZWxlbWV0cnkgfSBmcm9tICcuLi9hZ2VudEhvc3RSZXBvSW5mb1RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3BlbmRpbmdSZXF1ZXN0UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgYnVpbGRDb3BpbG90U3lzdGVtTm90aWZpY2F0aW9uIH0gZnJvbSAnLi9jb3BpbG90U3lzdGVtTm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IHBhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTbGFzaENvbW1hbmQuanMnO1xuaW1wb3J0IHR5cGUgeyBJVW5zYW5kYm94ZWRDb21tYW5kQ29uZmlybWF0aW9uUmVxdWVzdCwgU2hlbGxNYW5hZ2VyIH0gZnJvbSAnLi9jb3BpbG90U2hlbGxUb29scy5qcyc7XG5pbXBvcnQgeyBOb25QdHlTaGVsbFRlcm1pbmFsU3RyZWFtcyB9IGZyb20gJy4vY29waWxvdE5vblB0eVNoZWxsVGVybWluYWxzLmpzJztcbmltcG9ydCB7IGJ1aWxkU2FuZGJveENvbmZpZ0ZvclNkaywgdHlwZSBJU2RrU2FuZGJveENvbmZpZyB9IGZyb20gJy4vc2FuZGJveENvbmZpZ0ZvclNkay5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudFNlcnZlclRvb2xIb3N0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50U2VydmVyVG9vbHMuanMnO1xuaW1wb3J0IHsgZ2V0RWRpdEZpbGVQYXRocywgZ2V0SW52b2NhdGlvbk1lc3NhZ2UsIGdldFBhc3RUZW5zZU1lc3NhZ2UsIGdldFBlcm1pc3Npb25EaXNwbGF5LCBnZXRTaGVsbEludGVudGlvbiwgZ2V0U2hlbGxMYW5ndWFnZSwgZ2V0U3RyZWFtaW5nSW52b2NhdGlvbk1lc3NhZ2UsIGdldFN1YmFnZW50TWV0YWRhdGEsIGdldFRhc2tDb21wbGV0ZU1hcmtkb3duLCBnZXRUb29sRGlzcGxheU5hbWUsIGdldFRvb2xJbnB1dFN0cmluZywgZ2V0VG9vbEtpbmQsIGlzQWdlbnRDb29yZGluYXRpb25Ub29sLCBpc0VkaXRUb29sLCBpc0hpZGRlblRvb2wsIGlzU2hlbGxUb29sLCBpc1Rhc2tDb21wbGV0ZVRvb2wsIHBhcnNlQ29waWxvdFN0cmVhbWluZ1Rvb2xJbnB1dCwgc3ludGhlc2l6ZVNraWxsVG9vbENhbGwsIHRyeVN0cmluZ2lmeSwgdHlwZSBJVHlwZWRQZXJtaXNzaW9uUmVxdWVzdCB9IGZyb20gJy4vY29waWxvdFRvb2xEaXNwbGF5LmpzJztcbmltcG9ydCB7IEZpbGVFZGl0VHJhY2tlciB9IGZyb20gJy4uL3NoYXJlZC9maWxlRWRpdFRyYWNrZXIuanMnO1xuaW1wb3J0IHsgSUNvcGlsb3RBcGlTZXJ2aWNlLCB0eXBlIElSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dCB9IGZyb20gJy4uL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudEhvc3RSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dCB9IGZyb20gJy4uL2FnZW50SG9zdFJlc3RyaWN0ZWRUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgc3RyaXBQcm94eUVycm9yTWFya2VyLCB0cnlCdWlsZENoYXRFcnJvck1ldGEsIHRyeUJ1aWxkQ2hhdEVycm9yTWV0YUZyb21GaWVsZHMgfSBmcm9tICcuLi9zaGFyZWQvZm9yd2FyZGVkQ2hhdEVycm9yLmpzJztcbmltcG9ydCB7IGdldEVmZmVjdGl2ZU1jcFNlcnZlckN1c3RvbWl6YXRpb25zLCBNY3BDdXN0b21pemF0aW9uQ29udHJvbGxlciwgdHlwZSBJU2RrTWNwU2VydmVyIH0gZnJvbSAnLi4vc2hhcmVkL21jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IGFwcGVuZFNka1Rvb2xSZXN1bHRDb250ZW50LCBtYXBTZXNzaW9uRXZlbnRzIH0gZnJvbSAnLi9tYXBTZXNzaW9uRXZlbnRzLmpzJztcbmltcG9ydCB7IGFkZFNpbXBsZUF0dGFjaG1lbnREaXNwbGF5S2luZFRvTWltZVR5cGUgfSBmcm9tICcuL2NvcGlsb3RBdHRhY2htZW50VXRpbHMuanMnO1xuaW1wb3J0IHsgYnVpbGRQZW5kaW5nRWRpdENvbnRlbnRVcmkgfSBmcm9tICcuL3BlbmRpbmdFZGl0Q29udGVudFN0b3JlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciwgSUFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDbGllbnRUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENsaWVudEluZm8uanMnO1xuaW1wb3J0IHsgTWNwQXV0aFJlcXVpcmVkUmVhc29uLCBNY3BTZXJ2ZXJTdGF0dXMsIHR5cGUgTWNwQXV0aFJlcXVpcmVtZW50LCB0eXBlIE1jcFNlcnZlclN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NoYW5uZWxzLXNlc3Npb24vc3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1vbi9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBDb3BpbG90U2xhc2hDb21tYW5kUHJvdmlkZXIgfSBmcm9tICcuL2NvcGlsb3RTbGFzaENvbW1hbmRQcm92aWRlci5qcyc7XG5cbi8qKlxuICogVGhlIGZ1bGwgc2V0IG9mIGFnZW50IG1vZGVzIHRoZSBDb3BpbG90IFNESyBhY2NlcHRzLiBBSFAgbm93IGV4cG9zZXMgdGhlXG4gKiBzYW1lIHRocmVlIG1vZGVzIChgaW50ZXJhY3RpdmVgIC8gYHBsYW5gIC8gYGF1dG9waWxvdGApIG9uIGl0cyBgbW9kZWAgYXhpcyxcbiAqIHNvIHRoZSBDb3BpbG90IGFnZW50IG1hcHMgYmV0d2VlbiB0aGUgdHdvIHZpZXdzIGRpcmVjdGx5IGluXG4gKiB7QGxpbmsgQ29waWxvdEFnZW50U2Vzc2lvbi5zZW5kfSBhbmQgdGhlIGBzZXNzaW9uLm1vZGVfY2hhbmdlZGAgbGlzdGVuZXIuXG4gKi9cbmV4cG9ydCB0eXBlIENvcGlsb3RTZGtNb2RlID0gJ2ludGVyYWN0aXZlJyB8ICdwbGFuJyB8ICdhdXRvcGlsb3QnO1xudHlwZSBDb3BpbG90U2RrQXR0YWNobWVudCA9IFJlcXVpcmVkPE1lc3NhZ2VPcHRpb25zPlsnYXR0YWNobWVudHMnXVtudW1iZXJdO1xudHlwZSBDb3BpbG90Q29tbWFuZEludm9jYXRpb25SZXN1bHQgPSBBd2FpdGVkPFJldHVyblR5cGU8Q29waWxvdFNlc3Npb25bJ3JwYyddWydjb21tYW5kcyddWydpbnZva2UnXT4+O1xudHlwZSBSdW50aW1lU2xhc2hDb21tYW5kSW5mbyA9IEF3YWl0ZWQ8UmV0dXJuVHlwZTxDb3BpbG90U2Vzc2lvblsncnBjJ11bJ2NvbW1hbmRzJ11bJ2xpc3QnXT4+Wydjb21tYW5kcyddW251bWJlcl07XG50eXBlIE1jcEF1dGhIYW5kbGVyID0gTm9uTnVsbGFibGU8U2Vzc2lvbkNvbmZpZ1snb25NY3BBdXRoUmVxdWVzdCddPjtcbnR5cGUgTWNwQXV0aFJlcXVlc3QgPSBQYXJhbWV0ZXJzPE1jcEF1dGhIYW5kbGVyPlswXTtcbnR5cGUgTWNwQXV0aFJlc3VsdCA9IEF3YWl0ZWQ8UmV0dXJuVHlwZTxNY3BBdXRoSGFuZGxlcj4+O1xuXG5pbnRlcmZhY2UgSVBlbmRpbmdNY3BBdXRoUmVxdWVzdCB7XG5cdHJlYWRvbmx5IHNlcnZlck5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgcmVzb3VyY2U6IFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGE7XG5cdHJlYWRvbmx5IHJlcXVpcmVkU2NvcGVzOiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgdG9vbENhbGxzOiBJTWNwQXV0aFRvb2xDYWxsW107XG59XG5cbmludGVyZmFjZSBJTWNwQXV0aFRvb2xDYWxsIHtcblx0cmVhZG9ubHkgdHVybklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRvb2xDYWxsSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcGFyZW50VG9vbENhbGxJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgSUNvcGlsb3RBY3RpdmVUb29sQ2FsbCB7XG5cdHJlYWRvbmx5IHRvb2xOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBjb250ZW50OiBUb29sUmVzdWx0Q29udGVudFtdO1xuXHRyZWFkb25seSBwYXJlbnRUb29sQ2FsbElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG1jcFNlcnZlck5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY29udHJpYnV0b3I6IFRvb2xDYWxsQ29udHJpYnV0b3IgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGludGVudGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRtZXRhOiBJVG9vbENhbGxNZXRhIHwgdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgSUNvcGlsb3RTdHJlYW1pbmdUb29sQ2FsbCB7XG5cdGlucHV0OiBzdHJpbmc7XG5cdHRvb2xOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHBhcmVudFRvb2xDYWxsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0c3RhcnRlZDogYm9vbGVhbjtcblx0ZGlzcGxheWVkSW5wdXRMZW5ndGg6IG51bWJlcjtcblx0ZGlzcGxheWVkTWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5jb25zdCBTRVNTSU9OX1NUQVRFX0RJUkVDVE9SWSA9ICdzZXNzaW9uLXN0YXRlJztcbmNvbnN0IEVNUFRZX1RPT0xfUkVTVUxUX1RFWFQgPSAnPGVtcHR5IC8+JztcblxuZnVuY3Rpb24gaXNQZXJtaXNzaW9uRGVuaWVkS2luZChraW5kOiBQZXJtaXNzaW9uUmVzdWx0WydraW5kJ10gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0c3dpdGNoIChraW5kKSB7XG5cdFx0Y2FzZSAnY2FuY2VsbGVkJzpcblx0XHRjYXNlICdkZW5pZWQtYnktcnVsZXMnOlxuXHRcdGNhc2UgJ2RlbmllZC1uby1hcHByb3ZhbC1ydWxlLWFuZC1jb3VsZC1ub3QtcmVxdWVzdC1mcm9tLXVzZXInOlxuXHRcdGNhc2UgJ2RlbmllZC1pbnRlcmFjdGl2ZWx5LWJ5LXVzZXInOlxuXHRcdGNhc2UgJ2RlbmllZC1ieS1jb250ZW50LWV4Y2x1c2lvbi1wb2xpY3knOlxuXHRcdGNhc2UgJ2RlbmllZC1ieS1wZXJtaXNzaW9uLXJlcXVlc3QtaG9vayc6XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1hcFBlcm1pc3Npb25SZXN1bHRUb0NvbmZpcm1LaW5kKGtpbmQ6IFBlcm1pc3Npb25SZXN1bHRbJ2tpbmQnXSB8IHVuZGVmaW5lZCwgcmVzb2x2ZWRCeUhvb2s6IGJvb2xlYW4pOiAndXNlckFjdGlvbicgfCAnc2V0dGluZycgfCAnY29uZmlybWF0aW9uTm90TmVlZGVkJyB8ICdkZW5pZWQnIHtcblx0aWYgKGtpbmQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiAnY29uZmlybWF0aW9uTm90TmVlZGVkJztcblx0fVxuXHRpZiAoaXNQZXJtaXNzaW9uRGVuaWVkS2luZChraW5kKSkge1xuXHRcdHJldHVybiAnZGVuaWVkJztcblx0fVxuXHRpZiAoa2luZCA9PT0gJ2FwcHJvdmVkLWZvci1zZXNzaW9uJyB8fCBraW5kID09PSAnYXBwcm92ZWQtZm9yLWxvY2F0aW9uJykge1xuXHRcdHJldHVybiAnc2V0dGluZyc7XG5cdH1cblx0cmV0dXJuIHJlc29sdmVkQnlIb29rID8gJ2NvbmZpcm1hdGlvbk5vdE5lZWRlZCcgOiAndXNlckFjdGlvbic7XG59XG5cblxuZnVuY3Rpb24gbm9ybWFsaXplTWNwU2VydmVyVXJsKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoIVVSTC5jYW5QYXJzZSh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHVybCA9IG5ldyBVUkwodmFsdWUpO1xuXHR1cmwuaGFzaCA9ICcnO1xuXHR1cmwucGF0aG5hbWUgPSB1cmwucGF0aG5hbWUucmVwbGFjZSgvXFwvKyQvLCAnJyk7XG5cdHJldHVybiB1cmwuaHJlZjtcbn1cblxudHlwZSBJTWFwcGVkU2Vzc2lvbkV2ZW50cyA9IHsgdHVybnM6IFR1cm5bXTsgc3ViYWdlbnRUdXJuc0J5VG9vbENhbGxJZDogUmVhZG9ubHlNYXA8c3RyaW5nLCBUdXJuW10+IH07XG5cbmZ1bmN0aW9uIGdldEVtcHR5VG9vbFJlc3VsdFRleHQoYmluYXJ5UmVzdWx0czogcmVhZG9ubHkgeyByZWFkb25seSB0eXBlOiAnaW1hZ2UnIHwgJ3Jlc291cmNlJyB9W10gfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRpZiAoIWJpbmFyeVJlc3VsdHM/Lmxlbmd0aCkge1xuXHRcdHJldHVybiBFTVBUWV9UT09MX1JFU1VMVF9URVhUO1xuXHR9XG5cblx0Y29uc3QgaGFzSW1hZ2UgPSBiaW5hcnlSZXN1bHRzLnNvbWUocmVzdWx0ID0+IHJlc3VsdC50eXBlID09PSAnaW1hZ2UnKTtcblx0Y29uc3QgaGFzRmlsZSA9IGJpbmFyeVJlc3VsdHMuc29tZShyZXN1bHQgPT4gcmVzdWx0LnR5cGUgPT09ICdyZXNvdXJjZScpO1xuXHRpZiAoaGFzSW1hZ2UgJiYgaGFzRmlsZSkge1xuXHRcdHJldHVybiAnVG9vbCBwcm9kdWNlZCB0aGUgYXR0YWNoZWQgaW1hZ2UgYW5kIGZpbGUnO1xuXHR9XG5cdGlmIChoYXNJbWFnZSkge1xuXHRcdHJldHVybiAnVG9vbCBwcm9kdWNlZCB0aGUgYXR0YWNoZWQgaW1hZ2UnO1xuXHR9XG5cdHJldHVybiAnVG9vbCBwcm9kdWNlZCB0aGUgYXR0YWNoZWQgZmlsZSc7XG59XG5cbi8qKlxuICogRGlzcGxheSBsYWJlbHMgYW5kIGRlc2NyaXB0aW9ucyBmb3IgdGhlIFNESydzIGBleGl0X3BsYW5fbW9kZWAgYWN0aW9uIGlkcy5cbiAqIEtleXMgbm90IHByZXNlbnQgaGVyZSBmYWxsIGJhY2sgdG8gdGhlIHJhdyBhY3Rpb24gaWQuXG4gKi9cbmZ1bmN0aW9uIGdldFBsYW5BY3Rpb25EZXNjcmlwdGlvbihhY3Rpb25JZDogc3RyaW5nKTogeyBsYWJlbDogc3RyaW5nOyBkZXNjcmlwdGlvbjogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRzd2l0Y2ggKGFjdGlvbklkKSB7XG5cdFx0Y2FzZSAnYXV0b3BpbG90Jzpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnBsYW5SZXZpZXcuYXV0b3BpbG90LmxhYmVsJywgXCJJbXBsZW1lbnQgd2l0aCBBdXRvcGlsb3RcIiksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnBsYW5SZXZpZXcuYXV0b3BpbG90LmRlc2NyaXB0aW9uJywgXCJDb250aW51ZSBhdXRvbm9tb3VzbHkgdW50aWwgZG9uZSwgdXNpbmcgdGhlIHNlbGVjdGVkIGFwcHJvdmFsIGxldmVsLlwiKSxcblx0XHRcdH07XG5cdFx0Y2FzZSAnYXV0b3BpbG90X2ZsZWV0Jzpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnBsYW5SZXZpZXcuYXV0b3BpbG90RmxlZXQubGFiZWwnLCBcIkltcGxlbWVudCB3aXRoIEF1dG9waWxvdCBGbGVldFwiKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3QucGxhblJldmlldy5hdXRvcGlsb3RGbGVldC5kZXNjcmlwdGlvbicsIFwiQ29udGludWUgYXV0b25vbW91c2x5IHdpdGggZmxlZXQgbWFuYWdlbWVudCwgdXNpbmcgdGhlIHNlbGVjdGVkIGFwcHJvdmFsIGxldmVsLlwiKSxcblx0XHRcdH07XG5cdFx0Y2FzZSAnaW50ZXJhY3RpdmUnOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZ2VudEhvc3QucGxhblJldmlldy5pbnRlcmFjdGl2ZS5sYWJlbCcsIFwiSW1wbGVtZW50IFBsYW5cIiksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnBsYW5SZXZpZXcuaW50ZXJhY3RpdmUuZGVzY3JpcHRpb24nLCBcIkltcGxlbWVudCB0aGUgcGxhbiwgYXNraW5nIGZvciBpbnB1dCBhbmQgYXBwcm92YWwgZm9yIGVhY2ggYWN0aW9uLlwiKSxcblx0XHRcdH07XG5cdFx0Y2FzZSAnZXhpdF9vbmx5Jzpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnBsYW5SZXZpZXcuZXhpdE9ubHkubGFiZWwnLCBcIkFwcHJvdmUgUGxhbiBPbmx5XCIpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5wbGFuUmV2aWV3LmV4aXRPbmx5LmRlc2NyaXB0aW9uJywgXCJBcHByb3ZlIHRoZSBwbGFuIHdpdGhvdXQgZXhlY3V0aW5nIGl0LiBJIHdpbGwgaW1wbGVtZW50IGl0IG15c2VsZi5cIiksXG5cdFx0XHR9O1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbnR5cGUgVXNlcklucHV0SGFuZGxlciA9IE5vbk51bGxhYmxlPFNlc3Npb25Db25maWdbJ29uVXNlcklucHV0UmVxdWVzdCddPjtcbnR5cGUgVXNlcklucHV0UmVxdWVzdCA9IFBhcmFtZXRlcnM8VXNlcklucHV0SGFuZGxlcj5bMF07XG50eXBlIFVzZXJJbnB1dFJlc3BvbnNlID0gQXdhaXRlZDxSZXR1cm5UeXBlPFVzZXJJbnB1dEhhbmRsZXI+PjtcbnR5cGUgRWxpY2l0YXRpb25IYW5kbGVyID0gTm9uTnVsbGFibGU8U2Vzc2lvbkNvbmZpZ1snb25FbGljaXRhdGlvblJlcXVlc3QnXT47XG50eXBlIEVsaWNpdGF0aW9uQ29udGV4dCA9IFBhcmFtZXRlcnM8RWxpY2l0YXRpb25IYW5kbGVyPlswXTtcbnR5cGUgRWxpY2l0YXRpb25SZXN1bHQgPSBBd2FpdGVkPFJldHVyblR5cGU8RWxpY2l0YXRpb25IYW5kbGVyPj47XG50eXBlIEVsaWNpdGF0aW9uU2NoZW1hID0gTm9uTnVsbGFibGU8RWxpY2l0YXRpb25Db250ZXh0WydyZXF1ZXN0ZWRTY2hlbWEnXT47XG50eXBlIEVsaWNpdGF0aW9uU2NoZW1hRmllbGQgPSBFbGljaXRhdGlvblNjaGVtYVsncHJvcGVydGllcyddW3N0cmluZ107XG50eXBlIEVsaWNpdGF0aW9uRmllbGRWYWx1ZSA9IE5vbk51bGxhYmxlPEVsaWNpdGF0aW9uUmVzdWx0Wydjb250ZW50J10+W3N0cmluZ107XG50eXBlIFNlc3Npb25Ib29rcyA9IE5vbk51bGxhYmxlPFNlc3Npb25Db25maWdbJ2hvb2tzJ10+O1xudHlwZSBQcmVUb29sVXNlSG9va0lucHV0ID0gUGFyYW1ldGVyczxOb25OdWxsYWJsZTxTZXNzaW9uSG9va3NbJ29uUHJlVG9vbFVzZSddPj5bMF07XG50eXBlIFBvc3RUb29sVXNlSG9va0lucHV0ID0gUGFyYW1ldGVyczxOb25OdWxsYWJsZTxTZXNzaW9uSG9va3NbJ29uUG9zdFRvb2xVc2UnXT4+WzBdO1xudHlwZSBUb29sVXNlSG9va0lucHV0ID0gUHJlVG9vbFVzZUhvb2tJbnB1dCB8IFBvc3RUb29sVXNlSG9va0lucHV0O1xuXG5mdW5jdGlvbiBnZXRUb29sQ29tbWFuZChpbnB1dDogVG9vbFVzZUhvb2tJbnB1dCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGNvbW1hbmQgPSBpc09iamVjdChpbnB1dC50b29sQXJncykgPyBSZWZsZWN0LmdldChpbnB1dC50b29sQXJncywgJ2NvbW1hbmQnKSA6IHVuZGVmaW5lZDtcblx0cmV0dXJuIGlzU3RyaW5nKGNvbW1hbmQpID8gY29tbWFuZCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gdG9Db3BpbG90U2RrTW9kZShtb2RlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBDb3BpbG90U2RrTW9kZSB8IHVuZGVmaW5lZCB7XG5cdG1vZGUgPSBtb2RlPy50b0xvd2VyQ2FzZSgpID09PSAnZ29hbCcgPyAncGxhbicgOiBtb2RlO1xuXHRzd2l0Y2ggKG1vZGUpIHtcblx0XHRjYXNlICdpbnRlcmFjdGl2ZSc6XG5cdFx0Y2FzZSAncGxhbic6XG5cdFx0Y2FzZSAnYXV0b3BpbG90Jzpcblx0XHRcdHJldHVybiBtb2RlO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogUHJvamVjdHMgYW4ge0BsaW5rIEVsaWNpdGF0aW9uU2NoZW1hfSBmaWVsZCBpbnRvIGFcbiAqIHtAbGluayBDaGF0SW5wdXRRdWVzdGlvbn0uIFRoZSBzY2hlbWEncyBwcm9wZXJ0eSBrZXkgYmVjb21lcyB0aGVcbiAqIHF1ZXN0aW9uIGlkIHNvIHdlIGNhbiByb3V0ZSB0aGUgYW5zd2VyIGJhY2sgYnkgZmllbGQgbmFtZS5cbiAqL1xuZnVuY3Rpb24gZWxpY2l0YXRpb25GaWVsZFRvUXVlc3Rpb24oZmllbGROYW1lOiBzdHJpbmcsIGZpZWxkOiBFbGljaXRhdGlvblNjaGVtYUZpZWxkLCByZXF1aXJlZDogYm9vbGVhbik6IENoYXRJbnB1dFF1ZXN0aW9uIHtcblx0Y29uc3QgYmFzZSA9IHtcblx0XHRpZDogZmllbGROYW1lLFxuXHRcdHRpdGxlOiBmaWVsZC50aXRsZSA/PyBmaWVsZE5hbWUsXG5cdFx0bWVzc2FnZTogZmllbGQuZGVzY3JpcHRpb24gPz8gZmllbGQudGl0bGUgPz8gZmllbGROYW1lLFxuXHRcdHJlcXVpcmVkLFxuXHR9O1xuXG5cdHN3aXRjaCAoZmllbGQudHlwZSkge1xuXHRcdGNhc2UgJ2Jvb2xlYW4nOlxuXHRcdFx0cmV0dXJuIHsgLi4uYmFzZSwga2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLkJvb2xlYW4sIGRlZmF1bHRWYWx1ZTogZmllbGQuZGVmYXVsdCB9O1xuXHRcdGNhc2UgJ2ludGVnZXInOlxuXHRcdGNhc2UgJ251bWJlcic6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRraW5kOiBmaWVsZC50eXBlID09PSAnaW50ZWdlcicgPyBDaGF0SW5wdXRRdWVzdGlvbktpbmQuSW50ZWdlciA6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5OdW1iZXIsXG5cdFx0XHRcdG1pbjogZmllbGQubWluaW11bSxcblx0XHRcdFx0bWF4OiBmaWVsZC5tYXhpbXVtLFxuXHRcdFx0XHRkZWZhdWx0VmFsdWU6IGZpZWxkLmRlZmF1bHQsXG5cdFx0XHR9O1xuXHRcdGNhc2UgJ2FycmF5Jzoge1xuXHRcdFx0Y29uc3Qgb3B0aW9uczogQ2hhdElucHV0T3B0aW9uW10gPSBoYXNLZXkoZmllbGQuaXRlbXMsIHsgZW51bTogdHJ1ZSB9KVxuXHRcdFx0XHQ/IGZpZWxkLml0ZW1zLmVudW0ubWFwKHZhbHVlID0+ICh7IGlkOiB2YWx1ZSwgbGFiZWw6IHZhbHVlIH0pKVxuXHRcdFx0XHQ6IGZpZWxkLml0ZW1zLmFueU9mLm1hcChvcHRpb24gPT4gKHsgaWQ6IG9wdGlvbi5jb25zdCwgbGFiZWw6IG9wdGlvbi50aXRsZSB9KSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuTXVsdGlTZWxlY3QsXG5cdFx0XHRcdG9wdGlvbnMsXG5cdFx0XHRcdG1pbjogZmllbGQubWluSXRlbXMsXG5cdFx0XHRcdG1heDogZmllbGQubWF4SXRlbXMsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjYXNlICdzdHJpbmcnOiB7XG5cdFx0XHRpZiAoaGFzS2V5KGZpZWxkLCB7IGVudW06IHRydWUgfSkpIHtcblx0XHRcdFx0Y29uc3QgZW51bU5hbWVzID0gZmllbGQuZW51bU5hbWVzO1xuXHRcdFx0XHRjb25zdCBvcHRpb25zOiBDaGF0SW5wdXRPcHRpb25bXSA9IGZpZWxkLmVudW0ubWFwKCh2YWx1ZSwgaWR4KSA9PiAoeyBpZDogdmFsdWUsIGxhYmVsOiBlbnVtTmFtZXM/LltpZHhdID8/IHZhbHVlIH0pKTtcblx0XHRcdFx0cmV0dXJuIHsgLi4uYmFzZSwga2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLlNpbmdsZVNlbGVjdCwgb3B0aW9ucyB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhhc0tleShmaWVsZCwgeyBvbmVPZjogdHJ1ZSB9KSkge1xuXHRcdFx0XHRjb25zdCBvcHRpb25zOiBDaGF0SW5wdXRPcHRpb25bXSA9IGZpZWxkLm9uZU9mLm1hcChvcHRpb24gPT4gKHsgaWQ6IG9wdGlvbi5jb25zdCwgbGFiZWw6IG9wdGlvbi50aXRsZSB9KSk7XG5cdFx0XHRcdHJldHVybiB7IC4uLmJhc2UsIGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5TaW5nbGVTZWxlY3QsIG9wdGlvbnMgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5UZXh0LFxuXHRcdFx0XHRmb3JtYXQ6IGZpZWxkLmZvcm1hdCxcblx0XHRcdFx0bWluOiBmaWVsZC5taW5MZW5ndGgsXG5cdFx0XHRcdG1heDogZmllbGQubWF4TGVuZ3RoLFxuXHRcdFx0XHRkZWZhdWx0VmFsdWU6IGZpZWxkLmRlZmF1bHQsXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIFByb2plY3RzIGEge0BsaW5rIENoYXRJbnB1dEFuc3dlcn0gYmFjayBpbnRvIHRoZVxuICoge0BsaW5rIEVsaWNpdGF0aW9uRmllbGRWYWx1ZX0gc2hhcGUgZXhwZWN0ZWQgYnkgdGhlIFNESyBmb3IgdGhlIGdpdmVuXG4gKiBzY2hlbWEgZmllbGQuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgYW5zd2VyIGlzIG1pc3Npbmcvc2tpcHBlZCBvclxuICogY2Fubm90IGJlIGNvZXJjZWQgdG8gdGhlIGZpZWxkJ3MgZGVjbGFyZWQgdHlwZS5cbiAqL1xuZnVuY3Rpb24gZWxpY2l0YXRpb25BbnN3ZXJUb0ZpZWxkVmFsdWUoZmllbGQ6IEVsaWNpdGF0aW9uU2NoZW1hRmllbGQsIGFuc3dlcjogQ2hhdElucHV0QW5zd2VyIHwgdW5kZWZpbmVkKTogRWxpY2l0YXRpb25GaWVsZFZhbHVlIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFhbnN3ZXIgfHwgYW5zd2VyLnN0YXRlID09PSBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5Ta2lwcGVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB2YWx1ZSA9IGFuc3dlci52YWx1ZTtcblx0aWYgKGZpZWxkLnR5cGUgPT09ICdib29sZWFuJykge1xuXHRcdGlmICh2YWx1ZS5raW5kID09PSBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuQm9vbGVhbikgeyByZXR1cm4gdmFsdWUudmFsdWU7IH1cblx0XHRpZiAodmFsdWUua2luZCA9PT0gQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQpIHtcblx0XHRcdGlmICh2YWx1ZS52YWx1ZSA9PT0gJ3RydWUnKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0XHRpZiAodmFsdWUudmFsdWUgPT09ICdmYWxzZScpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmIChmaWVsZC50eXBlID09PSAnbnVtYmVyJyB8fCBmaWVsZC50eXBlID09PSAnaW50ZWdlcicpIHtcblx0XHRpZiAodmFsdWUua2luZCA9PT0gQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLk51bWJlcikge1xuXHRcdFx0cmV0dXJuIGZpZWxkLnR5cGUgPT09ICdpbnRlZ2VyJyA/IE1hdGgudHJ1bmModmFsdWUudmFsdWUpIDogdmFsdWUudmFsdWU7XG5cdFx0fVxuXHRcdGlmICh2YWx1ZS5raW5kID09PSBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuVGV4dCkge1xuXHRcdFx0aWYgKHZhbHVlLnZhbHVlLnRyaW0oKSA9PT0gJycpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0Y29uc3QgbiA9IE51bWJlcih2YWx1ZS52YWx1ZSk7XG5cdFx0XHRyZXR1cm4gTnVtYmVyLmlzRmluaXRlKG4pID8gKGZpZWxkLnR5cGUgPT09ICdpbnRlZ2VyJyA/IE1hdGgudHJ1bmMobikgOiBuKSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoZmllbGQudHlwZSA9PT0gJ2FycmF5Jykge1xuXHRcdGlmICh2YWx1ZS5raW5kID09PSBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWRNYW55KSB7XG5cdFx0XHRyZXR1cm4gWy4uLnZhbHVlLnZhbHVlLCAuLi4odmFsdWUuZnJlZWZvcm1WYWx1ZXMgPz8gW10pXTtcblx0XHR9XG5cdFx0aWYgKHZhbHVlLmtpbmQgPT09IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5TZWxlY3RlZCkge1xuXHRcdFx0cmV0dXJuIHZhbHVlLnZhbHVlID8gW3ZhbHVlLnZhbHVlLCAuLi4odmFsdWUuZnJlZWZvcm1WYWx1ZXMgPz8gW10pXSA6IFsuLi4odmFsdWUuZnJlZWZvcm1WYWx1ZXMgPz8gW10pXTtcblx0XHR9XG5cdFx0aWYgKHZhbHVlLmtpbmQgPT09IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0KSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUudmFsdWUgPyBbdmFsdWUudmFsdWVdIDogW107XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Ly8gZmllbGQudHlwZSA9PT0gJ3N0cmluZydcblx0aWYgKHZhbHVlLmtpbmQgPT09IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0KSB7IHJldHVybiB2YWx1ZS52YWx1ZTsgfVxuXHRpZiAodmFsdWUua2luZCA9PT0gQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkKSB7IHJldHVybiB2YWx1ZS52YWx1ZTsgfVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBnZXRDb3BpbG90Q0xJU2Vzc2lvblN0YXRlRGlyKHVzZXJIb21lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gam9pbihnZXRDb3BpbG90SG9tZVBhdGgodXNlckhvbWUsIHByb2Nlc3MuZW52KSwgU0VTU0lPTl9TVEFURV9ESVJFQ1RPUlkpO1xufVxuXG4vKipcbiAqIE1hdGNoZXMgdGhlIHRlbXAgZmlsZSBuYW1lcyB0aGUgQ29waWxvdCBTREsgdXNlcyB3aGVuIHNwaWxsaW5nIGxhcmdlIHRvb2xcbiAqIHJlc3VsdHMgdG8gZGlzay4gVGhlIFNESyB3cml0ZXMgdGhlc2UgaW50byBgb3MudG1wZGlyKClgIGFuZCByZWZlcmVuY2VzIHRoZVxuICogcGF0aCBiYWNrIHRvIHRoZSBtb2RlbCBzbyBpdCBjYW4gcmVhZCB0aGUgb3V0cHV0IGluIGEgZm9sbG93LXVwIHR1cm4uXG4gKlxuICogVHdvIGxheW91dHMgYXJlIGVtaXR0ZWQgYnkgdGhlIFNESyBkZXBlbmRpbmcgb24gdGhlIGNvZGVwYXRoOlxuICogIC0gYDx0aW1lc3RhbXA+LWNvcGlsb3QtdG9vbC1vdXRwdXQtPDYtY2hhci1pZD4udHh0YCAobGFyZ2UgdG9vbCByZXN1bHQpXG4gKiAgLSBgY29waWxvdC10b29sLW91dHB1dC08dGltZXN0YW1wPi08Ni1jaGFyLWlkPi50eHRgIChzdHJlYW1pbmcgb3V0cHV0IGJ1ZmZlcilcbiAqXG4gKiBCb3RoIGxpdmUgZGlyZWN0bHkgaW5zaWRlIGBvcy50bXBkaXIoKWAsIHNvIHdlIGFkZGl0aW9uYWxseSByZXF1aXJlIHRoZVxuICogZmlsZSdzIHBhcmVudCBkaXJlY3RvcnkgdG8gYmUgdGhlIE9TIHRlbXAgZGlyZWN0b3J5IGJlZm9yZSBhdXRvLWFwcHJvdmluZy5cbiAqL1xuY29uc3QgQ09QSUxPVF9TREtfVE9PTF9PVVRQVVRfQkFTRU5BTUVfUkUgPSAvXig/OlxcZHsxMCx9LWNvcGlsb3QtdG9vbC1vdXRwdXQtW2EtejAtOV17Nn18Y29waWxvdC10b29sLW91dHB1dC1cXGR7MTAsfS1bYS16MC05XXs2fSlcXC50eHQkL2k7XG5cbmZ1bmN0aW9uIGlzQ29waWxvdFNka1Rvb2xPdXRwdXRUZW1wRmlsZShmaWxlUGF0aDogc3RyaW5nLCB0bXBEaXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCBmaWxlVXJpID0gbm9ybWFsaXplUGF0aChVUkkuZmlsZShmaWxlUGF0aCkpO1xuXHRjb25zdCB0bXBEaXJVcmkgPSBub3JtYWxpemVQYXRoKFVSSS5maWxlKHRtcERpcikpO1xuXHRjb25zdCBwYXJlbnRVcmkgPSBub3JtYWxpemVQYXRoKFVSSS5qb2luUGF0aChmaWxlVXJpLCAnLi4nKSk7XG5cdGlmICghZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbChwYXJlbnRVcmksIHRtcERpclVyaSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3QgbGFzdFNsYXNoID0gTWF0aC5tYXgoZmlsZVBhdGgubGFzdEluZGV4T2YoJy8nKSwgZmlsZVBhdGgubGFzdEluZGV4T2YoJ1xcXFwnKSk7XG5cdGNvbnN0IGJhc2VuYW1lID0gbGFzdFNsYXNoID49IDAgPyBmaWxlUGF0aC5zdWJzdHJpbmcobGFzdFNsYXNoICsgMSkgOiBmaWxlUGF0aDtcblx0cmV0dXJuIENPUElMT1RfU0RLX1RPT0xfT1VUUFVUX0JBU0VOQU1FX1JFLnRlc3QoYmFzZW5hbWUpO1xufVxuXG4vKipcbiAqIE9wdGlvbnMgZm9yIGNvbnN0cnVjdGluZyBhIHtAbGluayBDb3BpbG90QWdlbnRTZXNzaW9ufS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ29waWxvdEFnZW50U2Vzc2lvbk9wdGlvbnMge1xuXHRyZWFkb25seSBzZXNzaW9uVXJpOiBVUkk7XG5cdHJlYWRvbmx5IGNoYXRDaGFubmVsVXJpOiBVUkk7XG5cdHJlYWRvbmx5IHJhd1Nlc3Npb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSBvbkRpZFNlc3Npb25Qcm9ncmVzczogRW1pdHRlcjxBZ2VudFNpZ25hbD47XG5cdHJlYWRvbmx5IHNlc3Npb25MYXVuY2hlcjogSUNvcGlsb3RTZXNzaW9uTGF1bmNoZXI7XG5cdHJlYWRvbmx5IGxhdW5jaFBsYW46IENvcGlsb3RTZXNzaW9uTGF1bmNoUGxhbjtcblx0cmVhZG9ubHkgc2hlbGxNYW5hZ2VyOiBTaGVsbE1hbmFnZXIgfCB1bmRlZmluZWQ7XG5cdC8qKiBXb3JraW5nIGRpcmVjdG9yeSBhc3NvY2lhdGVkIHdpdGggdGhlIHNlc3Npb24sIHVzZWQgdG8gc3RyaXAgcmVkdW5kYW50IGBjZGAgcHJlZml4ZXMgZnJvbSBzaGVsbCBjb21tYW5kcy4gKi9cblx0cmVhZG9ubHkgd29ya2luZ0RpcmVjdG9yeT86IFVSSTtcblx0LyoqIERpcmVjdG9yeSB1c2VkIHRvIHJlc29sdmUgd29ya3NwYWNlLXNjb3BlZCBjdXN0b21pemF0aW9ucyBmb3IgdGhpcyBzZXNzaW9uLiAqL1xuXHRyZWFkb25seSBjdXN0b21pemF0aW9uRGlyZWN0b3J5PzogVVJJO1xuXHQvKiogU25hcHNob3Qgb2YgdGhlIGFjdGl2ZSBjbGllbnQncyB0b29scyBhbmQgcGx1Z2lucyBhdCBzZXNzaW9uIGNyZWF0aW9uIHRpbWUuICovXG5cdHJlYWRvbmx5IGNsaWVudFNuYXBzaG90PzogSUFjdGl2ZUNsaWVudFNuYXBzaG90O1xuXHQvKipcblx0ICogTG9va3MgdXAgdGhlIEFIUCBpZCBvZiBhbiBleGlzdGluZyBjaGlsZCBNQ1AgY3VzdG9taXphdGlvbiBieVxuXHQgKiBzZXJ2ZXIgbmFtZSwgc28gU0RLIE1DUCBzdGF0ZSBldmVudHMgY2FuIHRhcmdldCBwbHVnaW4tZGVyaXZlZFxuXHQgKiBlbnRyaWVzIG5hcnJvd2x5LiBSZXR1cm5zIGB1bmRlZmluZWRgIGZvciBTREsgc2VydmVycyB0aGF0IGhhdmVcblx0ICogbm8gY29ycmVzcG9uZGluZyBwbHVnaW4gZW50cnkgXHUyMDE0IHRoZSBzZXNzaW9uIHN1cmZhY2VzIHRob3NlIGFzXG5cdCAqIGJhcmUgdG9wLWxldmVsIGN1c3RvbWl6YXRpb25zIHZpYSB7QGxpbmsgQ29waWxvdEFnZW50U2Vzc2lvbi50b3BMZXZlbE1jcEN1c3RvbWl6YXRpb25zfS5cblx0ICovXG5cdHJlYWRvbmx5IHJlc29sdmVNY3BDaGlsZElkOiAoc2VydmVyTmFtZTogc3RyaW5nKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBMaXZlIHJlZ2lzdHJ5IG9mIGV2ZXJ5IGFjdGl2ZSBjbGllbnQncyB0b29sIGNvbnRyaWJ1dGlvbnMsIHNoYXJlZCBieVxuXHQgKiByZWZlcmVuY2Ugd2l0aCB0aGUgYWdlbnQncyBwZXItc2Vzc2lvbiB7QGxpbmsgQWN0aXZlQ2xpZW50fS4gUmVhZCBhdFxuXHQgKiB0b29sLWNhbGwgc3RhbXAgdGltZSBzbyBhIHdpbmRvdyByZWxvYWQgKG5ldyBgY2xpZW50SWRgLCBpZGVudGljYWxcblx0ICogdG9vbHMpIHN0YW1wcyB3aXRoIHRoZSBjdXJyZW50IG93bmluZyBpZCwgYW5kIHNvIGVhY2ggdG9vbCBjYWxsIGlzXG5cdCAqIGF0dHJpYnV0ZWQgdG8gd2hpY2hldmVyIGNsaWVudCBjb250cmlidXRlZCBpdC4gV2hlbiBvbWl0dGVkLCBhIGZyZXNoXG5cdCAqIGVtcHR5IHJlZ2lzdHJ5IGlzIHVzZWQgKHRlc3QgLyBzdGFuZGFsb25lIHBhdGgpIGFuZCBjbGllbnQgdG9vbCBjYWxsc1xuXHQgKiBhcmUgbGVmdCB1bnN0YW1wZWQuXG5cdCAqL1xuXHRyZWFkb25seSBhY3RpdmVDbGllbnRUb29sU2V0PzogQWN0aXZlQ2xpZW50VG9vbFNldDtcblx0LyoqXG5cdCAqIFNlcnZlci1zaWRlIGhvc3QgZm9yIHRoZSBhZ2VudCBob3N0J3Mgc2VydmVyIHRvb2xzLiBXaGVuIHByb3ZpZGVkLCB0aGVcblx0ICogc2Vzc2lvbiBhZHZlcnRpc2VzIHRoZSBzZXJ2ZXIgdG9vbHMgKGZlZWRiYWNrIFwiY29tbWVudHNcIiB0b2RheSwgbW9yZSBpblxuXHQgKiB0aGUgZnV0dXJlKSBhbmQgZXhwb3NlcyBTREsgdG9vbCBoYW5kbGVycyB0aGF0IGV4ZWN1dGUgdGhlbSBpbi1wcm9jZXNzLlxuXHQgKi9cblx0cmVhZG9ubHkgc2VydmVyVG9vbEhvc3Q/OiBJQWdlbnRTZXJ2ZXJUb29sSG9zdDtcblx0LyoqIFJldHVybnMgd2hldGhlciB0aGUgdG9rZW4gdGhhdCBsYXVuY2hlZCB0aGlzIHNlc3Npb24gaXMgc3RpbGwgdGhlIGFjdGl2ZSBhY2NvdW50IHRva2VuLiAqL1xuXHRyZWFkb25seSBpc0xhdW5jaFRva2VuQ3VycmVudD86ICgpID0+IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEludm9rZWQgd2hlbmV2ZXIgdGhpcyBjaGF0J3MgaW4tZmxpZ2h0IHR1cm4gZW5kcyBcdTIwMTQgbm9ybWFsIGNvbXBsZXRpb24sXG5cdCAqIGFib3J0LCBvciBlcnJvciBcdTIwMTQgbGVhdmluZyB0aGUgY2hhdCBpZGxlLiBMZXRzIHRoZSBhZ2VudCBydW4gd29yayB0aGF0XG5cdCAqIG11c3Qgbm90IGludGVycnVwdCBhIGxpdmUgdHVybiwgbm90YWJseSBhIENMSSBjbGllbnQgcmVzdGFydCBkZWZlcnJlZFxuXHQgKiB3aGlsZSB0aGUgdHVybiB3YXMgcnVubmluZy4gQ2FsbGVkIHN5bmNocm9ub3VzbHkgZnJvbSB0aGUgc2Vzc2lvbidzIFNES1xuXHQgKiBldmVudCBoYW5kbGluZywgc28gdGhlIGFnZW50IG11c3Qgc2NoZWR1bGUgYW55dGhpbmcgdGhhdCBjb3VsZCBkaXNwb3NlXG5cdCAqIHRoaXMgc2Vzc2lvbiBvZmYgdGhlIGN1cnJlbnQgc3RhY2suXG5cdCAqL1xuXHRyZWFkb25seSBvblR1cm5FbmRlZD86ICgpID0+IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFBsYXRmb3JtIHVzZWQgdG8gY29tcHV0ZSB0aGUgU0RLIHNhbmRib3ggcG9saWN5LiBEZWZhdWx0cyB0b1xuXHQgKiBgcHJvY2Vzcy5wbGF0Zm9ybWA7IGluamVjdGFibGUgc28gdGVzdHMgY2FuIGV4ZXJjaXNlIHRoZSBwZXItT1MgZ2F0aW5nXG5cdCAqIChub3RhYmx5IHRoYXQgdGhlIHNhbmRib3ggaXMgaWdub3JlZCBvbiBXaW5kb3dzKSBkZXRlcm1pbmlzdGljYWxseS5cblx0ICovXG5cdHJlYWRvbmx5IHBsYXRmb3JtPzogTm9kZUpTLlBsYXRmb3JtO1xufVxuXG4vKipcbiAqIExpZmVjeWNsZSBzdGF0ZSBvZiBhIHtAbGluayBDb3BpbG90VHVybn0uXG4gKlxuICogIC0gYHBlbmRpbmdgICAgXHUyMDE0IHRoZSBob3N0IGhhcyBkaXNwYXRjaGVkIHRoZSBtZXNzYWdlIChgc2VuZCgpYCksIGJ1dCB0aGUgU0RLXG4gKiAgICAgICAgICAgICAgICAgIGhhcyBub3QgeWV0IGVtaXR0ZWQgYW55IGV2ZW50IGZvciB0aGlzIHR1cm4ncyBhZ2VudGljIGxvb3AuXG4gKiAgLSBgcnVubmluZ2AgICBcdTIwMTQgdGhlIFNESyBoYXMgZW1pdHRlZCBhdCBsZWFzdCBvbmUgZXZlbnQgZm9yIHRoaXMgdHVybi5cbiAqICAtIGBjb21wbGV0ZWRgIFx1MjAxNCB0aGUgdHVybiBmaW5pc2hlZCBub3JtYWxseSAodGhlIGxvb3Agd2VudCBpZGxlKS5cbiAqICAtIGBhYm9ydGVkYCAgIFx1MjAxNCB0aGUgdHVybidzIGxvb3Agd2FzIGNhbmNlbGxlZCB2aWEgYW4gYWJvcnQuXG4gKi9cbnR5cGUgQ29waWxvdFR1cm5TdGF0ZSA9ICdwZW5kaW5nJyB8ICdydW5uaW5nJyB8ICdjb21wbGV0ZWQnIHwgJ2Fib3J0ZWQnO1xuXG4vKipcbiAqIEVuY2Fwc3VsYXRlcyBhbGwgcGVyLXR1cm4gYm9va2tlZXBpbmcgZm9yIGEgc2luZ2xlIHByb3RvY29sIHR1cm4sIHBsdXMgYW5cbiAqIGV4cGxpY2l0IGxpZmVjeWNsZSB7QGxpbmsgQ29waWxvdFR1cm4uc3RhdGV9LiBIb2xkaW5nIHRoaXMgc3RhdGUgb24gb25lXG4gKiBvYmplY3QgKGNyZWF0ZWQgZnJlc2ggcGVyIHR1cm4pIHJhdGhlciB0aGFuIGFzIGEgaGFuZGZ1bCBvZiBtdXRhYmxlIHNlc3Npb25cbiAqIGZpZWxkcyBtZWFucyB0aGVyZSBpcyBhIHNpbmdsZSwgYXRvbWljIG5vdGlvbiBvZiBcInRoZSBjdXJyZW50IHR1cm5cIjogdGhlcmVcbiAqIGlzIG5vIHNldCBvZiBjb3VudGVycy9tYXBzIHRoYXQgbXVzdCBiZSByZXNldCBpbiBsb2Nrc3RlcCwgYW5kIHR1cm5cbiAqIHRyYW5zaXRpb25zIChydW5uaW5nL2NvbXBsZXRlZC9hYm9ydGVkKSBhcmUgZXhwbGljaXQgYW5kIGNoZWNrYWJsZS5cbiAqXG4gKiBUaGUgYHBlbmRpbmcgXHUyMTkyIHJ1bm5pbmdgIGRpc3RpbmN0aW9uIGd1YXJkcyB0dXJuIGNvbXBsZXRpb24gYWdhaW5zdCBhIHN0cmF5XG4gKiBpZGxlOiBhbiBhYm9ydCdzIHRlcm1pbmFsIGBzZXNzaW9uLmlkbGVgIGZpbmRzIGEgcXVldWVkIG1lc3NhZ2UncyB0dXJuIHN0aWxsXG4gKiBgcGVuZGluZ2AgKHRoZSBTREsgaGFzIG5vdCBiZWd1biBpdCkgYW5kIGxlYXZlcyBpdCBvcGVuLCByYXRoZXIgdGhhblxuICogY29tcGxldGluZyBpdCBhbmQgb3JwaGFuaW5nIGl0cyByZWFsIHJlc3BvbnNlLiBBIG5vbi1hYm9ydCBpZGxlIHN0aWxsXG4gKiBjb21wbGV0ZXMgYSBgcGVuZGluZ2AgdHVybiBkZWZlbnNpdmVseSwgc28gYSBkZWdlbmVyYXRlIG5vLW9wIHNlbmQgY2Fubm90XG4gKiBoYW5nIHRoZSBzZXNzaW9uLlxuICovXG5cbi8qKlxuICogVGhlIHRva2VuL21vZGVsL2Nvc3QgY29udGV4dCBmb3IgYSBzaW5nbGUgbW9kZWwgY2FsbCwgdXNlZCB0byBidWlsZCBhXG4gKiBgVXNhZ2VJbmZvYC4gQWxsIGZpZWxkcyBhcmUgb3B0aW9uYWwgc28gYSBwYXJ0aWFsIG9yIGVtcHR5IGNvbnRleHQgKGUuZy4gYVxuICogc3ViYWdlbnQgdXNhZ2UgZXZlbnQgc2VlbiBiZWZvcmUgdGhlIHBhcmVudCdzIG93biBjb250ZXh0KSBpcyByZXByZXNlbnRhYmxlLlxuICovXG5pbnRlcmZhY2UgVXNhZ2VDb250ZXh0IHtcblx0aW5wdXRUb2tlbnM/OiBudW1iZXI7XG5cdG91dHB1dFRva2Vucz86IG51bWJlcjtcblx0bW9kZWw/OiBzdHJpbmc7XG5cdGNhY2hlUmVhZFRva2Vucz86IG51bWJlcjtcblx0Y29zdD86IG51bWJlcjtcbn1cblxuLyoqIFdoaWNoIFNESyBzb3VyY2UgcHJvZHVjZWQgYW4gTUNQIGxpZmVjeWNsZSBsb2cgcmVjb3JkLiAqL1xudHlwZSBNY3BMaWZlY3ljbGVPcmlnaW4gPSAnbG9hZGVkJyB8ICdzdGF0dXNDaGFuZ2VkJyB8ICdpbnZlbnRvcnknO1xuXG4vKipcbiAqIFNESy1uZXV0cmFsIGZpZWxkcyBjYXJyaWVkIGludG8gYSBzaW5nbGUgTUNQIGxpZmVjeWNsZSBsb2cgcmVjb3JkLiBUaGVcbiAqIGBzZXNzaW9uLm1jcF9zZXJ2ZXJzX2xvYWRlZGAgZXZlbnQsIHRoZSBgc2Vzc2lvbi5tY3Bfc2VydmVyX3N0YXR1c19jaGFuZ2VkYFxuICogZXZlbnQsIGFuZCB0aGUgYHJwYy5tY3AubGlzdGAgaW52ZW50b3J5IGVhY2ggcG9wdWxhdGUgdGhlIHN1YnNldCB0aGV5IGNhcnJ5LlxuICovXG5pbnRlcmZhY2UgSU1jcExpZmVjeWNsZUxvZ0luZm8ge1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN0YXR1czogU2RrTWNwU2VydmVyU3RhdHVzO1xuXHRyZWFkb25seSBlcnJvcj86IHN0cmluZztcblx0cmVhZG9ubHkgc291cmNlPzogc3RyaW5nO1xuXHRyZWFkb25seSB0cmFuc3BvcnQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBsdWdpbk5hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBsdWdpblZlcnNpb24/OiBzdHJpbmc7XG59XG5cbmNsYXNzIENvcGlsb3RUdXJuIHtcblxuXHRwcml2YXRlIF9zdGF0ZTogQ29waWxvdFR1cm5TdGF0ZSA9ICdwZW5kaW5nJztcblx0cHJpdmF0ZSByZWFkb25seSBfc3RvcFdhdGNoID0gU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSk7XG5cblx0LyoqXG5cdCAqIFRoaXMgdHVybidzIG93biBDb3BpbG90IGNvc3QgaW4gbmFuby1BSVUsIHN1bW1lZCBmcm9tIHRoZSBgY29waWxvdFVzYWdlYFxuXHQgKiBjYXJyaWVkIGJ5IHRoZSBtb2RlbCBjYWxscyB0aGUgdHVybiBjYXVzZWQgXHUyMDE0IGl0cyBvd24sIGV2ZXJ5IHN1YmFnZW50J3MsXG5cdCAqIGFuZCBhbnkgY29tcGFjdGlvbiB0aGF0IHJhbiBtaWQtdHVybi5cblx0ICpcblx0ICogQWNjdW11bGF0ZWQgc3luY2hyb25vdXNseSBhcyBlYWNoIGV2ZW50IGFycml2ZXMgcmF0aGVyIHRoYW4gZGVyaXZlZCBmcm9tXG5cdCAqIHRoZSBTREsncyBzZXNzaW9uLXdpZGUgdG90YWw6IHRoYXQgdG90YWwgaXMgcmVhZCBhc3luY2hyb25vdXNseSwgYW5kIHRoZVxuXHQgKiB0ZXJtaW5hbCBgc2Vzc2lvbi5pZGxlYCBjYW4gY2xvc2UgdGhlIHR1cm4gd2hpbGUgYSByZWFkIGlzIGluIGZsaWdodCxcblx0ICogd2hpY2ggd291bGQgZHJvcCB0aGUgdHVybidzIGxhc3QgbW9kZWwgY2FsbCBmcm9tIGl0cyByZXBvcnRlZCBjb3N0LlxuXHQgKi9cblx0Y29waWxvdE5hbm9BaXUgPSAwO1xuXG5cdC8qKlxuXHQgKiBQZXItc3ViYWdlbnQgY29tcG9uZW50IGNvc3QsIGluIG5hbm8tQUlVLCBrZXllZCBieSBgcGFyZW50VG9vbENhbGxJZGAuXG5cdCAqIFRoZSBTREsncyBzZXNzaW9uIG1ldHJpY3MgYXJlIHNlc3Npb24td2lkZSBhbmQgY2Fycnkgbm8gcGVyLWFnZW50XG5cdCAqIGJyZWFrZG93biwgc28gYSBzdWJhZ2VudCdzIG93biBydW5uaW5nIHRvdGFsIGlzIHN0aWxsIGFjY3VtdWxhdGVkIGZyb21cblx0ICogaXRzIHVzYWdlIGV2ZW50cyBpbiBvcmRlciB0byByZXBvcnQgaXQgb24gdGhlIHN1YmFnZW50J3MgY2hpbGQgc2Vzc2lvbi5cblx0ICovXG5cdHJlYWRvbmx5IHN1YmFnZW50TmFub0FpdUJ5VG9vbENhbGxJZCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cblx0LyoqXG5cdCAqIFRoZSBwYXJlbnQgKG1haW4tYWdlbnQpIHR1cm4ncyBvd24gbGFzdCBjb250ZXh0IHVzYWdlIFx1MjAxNCBtb2RlbCBwbHVzIHRva2VuXG5cdCAqIGNvdW50cyBhbmQgcGVyLWV2ZW50IGNvc3QuIEEgc3ViYWdlbnQncyBtb2RlbCBjYWxsIGNvbnRyaWJ1dGVzIHRvIHRoZVxuXHQgKiB0dXJuJ3MgY3JlZGl0cyAodGhlIFNESydzIHNlc3Npb24gbWV0cmljcyBhbHJlYWR5IGluY2x1ZGUgaXQpIGJ1dCBtdXN0IG5vdFxuXHQgKiBvdmVyd3JpdGUgdGhlIHBhcmVudCB0dXJuJ3MgbW9kZWwvY29udGV4dC10b2tlbiB1c2FnZS4gUmV0YWluaW5nIHRoZVxuXHQgKiBwYXJlbnQncyBvd24gbGFzdCB2YWx1ZXMgbGV0cyBlYWNoIHN1YmFnZW50IHVzYWdlIGV2ZW50IHJlZnJlc2ggdGhlIHBhcmVudFxuXHQgKiBhZ2dyZWdhdGUncyBjcmVkaXQgdG90YWwgd2hpbGUgcHJlc2VydmluZyB0aGUgbW9kZWwgdGhhdCBwcm9kdWNlZCB0aGVcblx0ICogcGFyZW50IHJlc3BvbnNlLlxuXHQgKi9cblx0cGFyZW50Q29udGV4dFVzYWdlOiBVc2FnZUNvbnRleHQgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEN1cnJlbnQgbWFya2Rvd24gcmVzcG9uc2UgcGFydCBJRHMgZm9yIHRoaXMgdHVybiwga2V5ZWQgYnlcblx0ICogYHBhcmVudFRvb2xDYWxsSWQgPz8gJydgLiBQYXJlbnQgYW5kIHN1YmFnZW50IHRleHQgc3RyZWFtIHRocm91Z2ggdGhlXG5cdCAqIHNhbWUgU0RLIHNlc3Npb24gYnV0IGxhbmQgaW4gZGlmZmVyZW50IEFIUCBzZXNzaW9ucywgc28gdGhlaXIgbWFya2Rvd25cblx0ICogcGFydCBzdGF0ZSBtdXN0IG5vdCBtYXNrIG9yIGFwcGVuZCB0byBlYWNoIG90aGVyLlxuXHQgKi9cblx0cmVhZG9ubHkgbWFya2Rvd25QYXJ0SWRzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuXHQvKiogQ3VycmVudCByZWFzb25pbmcgcmVzcG9uc2UgcGFydCBJRHMgZm9yIHRoaXMgdHVybiwga2V5ZWQgYnkgYHBhcmVudFRvb2xDYWxsSWQgPz8gJydgLiAqL1xuXHRyZWFkb25seSByZWFzb25pbmdQYXJ0SWRzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuXHQvKipcblx0ICogUGVyLXR1cm4gdG9vbC1jYWxsIGFnZ3JlZ2F0ZSBhY2N1bXVsYXRlZCBhY3Jvc3MgdGhlIHR1cm4ncyBgYXNzaXN0YW50Lm1lc3NhZ2VgIHJvdW5kcyAobWFpblxuXHQgKiBhZ2VudCBvbmx5KSwgZm9yIHRoZSByZXN0cmljdGVkIGB0b29sQ2FsbERldGFpbHNgIHRlbGVtZXRyeS4gYHRvb2xDb3VudHNgIGlzIGtleWVkIGJ5IHRvb2wgbmFtZS5cblx0ICovXG5cdHJlYWRvbmx5IHRvb2xDb3VudHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHR0b29sQ2FsbFJvdW5kcyA9IDA7XG5cdHRvdGFsVG9vbENhbGxzID0gMDtcblx0cGFyYWxsZWxUb29sQ2FsbFJvdW5kcyA9IDA7XG5cdHBhcmFsbGVsVG9vbENhbGxzVG90YWwgPSAwO1xuXHR0b29sQ2FsbERldGFpbHNSZXBvcnRlZCA9IGZhbHNlO1xuXHRtZXNzYWdlQ2hhckxlbjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHQvKiogTW9kZWwgb2YgdGhlIG1vc3QgcmVjZW50IHJvdW5kLCByZXBvcnRlZCBhcyB0aGUgdHVybidzIG1vZGVsLiAqL1xuXHRsYXN0TW9kZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBpZDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IG9yZGluYWw6IG51bWJlcixcblx0XHRyZWFkb25seSBzZW5kZXJDbGllbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IGNsaWVudFR5cGU6IEFnZW50SG9zdENsaWVudFR5cGUsXG5cdCkgeyB9XG5cblx0Z2V0IHN0YXRlKCk6IENvcGlsb3RUdXJuU3RhdGUgeyByZXR1cm4gdGhpcy5fc3RhdGU7IH1cblx0Z2V0IGlzUGVuZGluZygpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX3N0YXRlID09PSAncGVuZGluZyc7IH1cblx0Z2V0IGlzUnVubmluZygpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX3N0YXRlID09PSAncnVubmluZyc7IH1cblx0Z2V0IGR1cmF0aW9uKCk6IG51bWJlciB7IHJldHVybiBNYXRoLm1heCgwLCB0aGlzLl9zdG9wV2F0Y2guZWxhcHNlZCgpKTsgfVxuXG5cdC8qKiBUcmFuc2l0aW9uIGBwZW5kaW5nIFx1MjE5MiBydW5uaW5nYCBvbiB0aGUgZmlyc3QgU0RLIGV2ZW50LiBOby1vcCBvbmNlIHJ1bm5pbmcvZmluaXNoZWQuICovXG5cdG1hcmtSdW5uaW5nKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gJ3BlbmRpbmcnKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZSA9ICdydW5uaW5nJztcblx0XHR9XG5cdH1cblxuXHRtYXJrQ29tcGxldGVkKCk6IHZvaWQgeyB0aGlzLl9zdGF0ZSA9ICdjb21wbGV0ZWQnOyB9XG5cdG1hcmtBYm9ydGVkKCk6IHZvaWQgeyB0aGlzLl9zdGF0ZSA9ICdhYm9ydGVkJzsgfVxufVxuXG4vKipcbiAqIEVuY2Fwc3VsYXRlcyBhIHNpbmdsZSBDb3BpbG90IFNESyBzZXNzaW9uIGFuZCBhbGwgaXRzIGFzc29jaWF0ZWQgYm9va2tlZXBpbmcuXG4gKlxuICogQ3JlYXRlZCBieSB7QGxpbmsgQ29waWxvdEFnZW50fSwgb25lIGluc3RhbmNlIHBlciBhY3RpdmUgc2Vzc2lvbi4gRGlzcG9zaW5nXG4gKiB0aGlzIGNsYXNzIHRlYXJzIGRvd24gYWxsIHBlci1zZXNzaW9uIHJlc291cmNlcyAoU0RLIHdyYXBwZXIsIGVkaXQgdHJhY2tlcixcbiAqIGRhdGFiYXNlIHJlZmVyZW5jZSwgcGVuZGluZyBwZXJtaXNzaW9ucykuXG4gKi9cbmV4cG9ydCBjbGFzcyBDb3BpbG90QWdlbnRTZXNzaW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IHNlc3Npb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uVXJpOiBVUkk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRDaGFubmVsVXJpOiBVUkk7XG5cblx0LyoqIFdvcmtpbmcgZGlyZWN0b3J5IHRoaXMgc2Vzc2lvbiBvcGVyYXRlcyBpbiwgaWYgYW55LiAqL1xuXHRnZXQgd29ya2luZ0RpcmVjdG9yeSgpOiBVUkkgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fd29ya2luZ0RpcmVjdG9yeTsgfVxuXG5cdC8qKiBUcmFja3MgYWN0aXZlIHRvb2wgaW52b2NhdGlvbnMgc28gd2UgY2FuIHByb2R1Y2UgcGFzdC10ZW5zZSBtZXNzYWdlcyBvbiBjb21wbGV0aW9uLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVUb29sQ2FsbHMgPSBuZXcgTWFwPHN0cmluZywgSUNvcGlsb3RBY3RpdmVUb29sQ2FsbD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RyZWFtaW5nVG9vbENhbGxzID0gbmV3IE1hcDxzdHJpbmcsIElDb3BpbG90U3RyZWFtaW5nVG9vbENhbGw+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0cmVhbWluZ1Rvb2xEaXNwbGF5U2NoZWR1bGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgUnVuT25jZVNjaGVkdWxlcj4oKSk7XG5cdC8qKlxuXHQgKiBNYXBzIGEgc3ViYWdlbnQncyBzdGFibGUgYGFnZW50SWRgIHRvIGl0cyBwYXJlbnQgdG9vbCBjYWxsIGlkLiBDb21wbGV0aW9uXG5cdCAqIGVuZHMgdGhlIGN1cnJlbnQgc3ViYWdlbnQgdHVybiwgYnV0IHN0ZWVyaW5nIGNhbiBzdGFydCBhbm90aGVyIHR1cm4gd2l0aFxuXHQgKiB0aGUgc2FtZSBpZCwgc28gbWFwcGluZ3MgbGl2ZSB1bnRpbCBzZXNzaW9uIHRlYXJkb3duLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGFyZW50VG9vbENhbGxJZHNCeUFnZW50SWQgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVTdWJhZ2VudEFnZW50SWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Vucm91dGFibGVTdWJhZ2VudFRvb2xDYWxsSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2F1dG9BcHByb3ZhbHMgPSBuZXcgTWFwPHN0cmluZywgUGVybWlzc2lvbkF1dG9BcHByb3ZhbCB8IG51bGw+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdBdXRvQXBwcm92YWxzID0gbmV3IFBlbmRpbmdSZXF1ZXN0UmVnaXN0cnk8UGVybWlzc2lvbkF1dG9BcHByb3ZhbCB8IHVuZGVmaW5lZD4oKTtcblx0LyoqIENvcnJlbGF0ZXMgdG9vbCBleGVjdXRpb24gd2l0aCB0aGUgU0RLIHBlcm1pc3Npb24gbGlmZWN5Y2xlIGZvciBgY2hhdC50b29sQXBwcm92YWxgIHRlbGVtZXRyeS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfdG9vbEFwcHJvdmFsUmVjb3JkcyA9IG5ldyBNYXA8c3RyaW5nLCB7XG5cdFx0cGVybWlzc2lvblJlcXVlc3RlZDogYm9vbGVhbjtcblx0XHRyZXNvbHZlZEJ5SG9vazogYm9vbGVhbjtcblx0XHRyZXF1ZXN0U2FuZGJveEJ5cGFzczogYm9vbGVhbjtcblx0XHRyZXN1bHRLaW5kOiBQZXJtaXNzaW9uUmVzdWx0WydraW5kJ10gfCB1bmRlZmluZWQ7XG5cdFx0dG9vbE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRtY3BTZXJ2ZXJOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0cmVwb3J0ZWQ6IGJvb2xlYW47XG5cdH0+KCk7XG5cdC8qKiBQZW5kaW5nIHBlcm1pc3Npb24gcmVxdWVzdHMgYXdhaXRpbmcgYSByZW5kZXJlci1zaWRlIGRlY2lzaW9uLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nUGVybWlzc2lvbnMgPSBuZXcgUGVuZGluZ1JlcXVlc3RSZWdpc3RyeTxQZXJtaXNzaW9uUmVxdWVzdFJlc3VsdCwge1xuXHRcdHJlYWRvbmx5IG1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkOiBib29sZWFuO1xuXHR9PigpO1xuXHQvKiogQ2FuY2VscyBjYWxsYmFja3MgdGhhdCBiZWdhbiBiZWZvcmUgb3IgZHVyaW5nIGFuIFNESyBhYm9ydC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYWJvcnRDdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXHQvKipcblx0ICogU2lnbmF0dXJlcyAoe0BsaW5rIHNhZmVTdHJpbmdpZnl9KSBvZiB1c2VyLWFwcHJvdmVkIGByZWFkYC9gd3JpdGVgXG5cdCAqIHBlcm1pc3Npb24gcmVxdWVzdHMsIGtleWVkIGJ5IHRvb2wgY2FsbCBpZC4gVGhlIENvcGlsb3QgQ0xJIHJ1bnRpbWUgZW1pdHNcblx0ICogdHdvIGlkZW50aWNhbCBgcGVybWlzc2lvbi5yZXF1ZXN0ZWRgIGV2ZW50cyBmb3IgYSBzaW5nbGUgZmlsZSByZWFkIG9yXG5cdCAqIHdyaXRlIChhbiBpbnRlcm5hbCBgcGF0aGAgcHJvbXB0IGZvbGxvd2VkIGJ5IGEgYHJlYWRgL2B3cml0ZWAgcHJvbXB0KSwgc29cblx0ICogd2l0aG91dCB0aGlzIHRoZSB1c2VyIHdvdWxkIGJlIGFza2VkIHRvIGFwcHJvdmUgdGhlIHNhbWUgb3BlcmF0aW9uIHR3aWNlXG5cdCAqIChpc3N1ZSAjMzI0NDc3KS4gQW4gZW50cnkgaXMgc2luZ2xlLXVzZTogaXQgYXV0by1hcHByb3ZlcyBleGFjdGx5IG9uZVxuXHQgKiBzdWJzZXF1ZW50IHJlcXVlc3QgdGhhdCBpcyBieXRlLWlkZW50aWNhbCB0byB0aGUgYXBwcm92ZWQgb25lLCB0aGVuIGlzXG5cdCAqIHJlbW92ZWQsIHNvIGFwcHJvdmFsIG5ldmVyIGNhcnJpZXMgYWNyb3NzIGEgZGlmZmVyZW50IHRvb2wgY2FsbCwgYSBjaGFuZ2VkXG5cdCAqIHBhdGgvZGlmZi9jb250ZW50cywgb3IgYSBkaWZmZXJlbnQga2luZC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FwcHJvdmVkRHVwbGljYWJsZVBlcm1pc3Npb25TaWduYXR1cmVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0LyoqIFBlbmRpbmcgdXNlciBpbnB1dCByZXF1ZXN0cyBhd2FpdGluZyBhIHJlbmRlcmVyLXNpZGUgYW5zd2VyLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nVXNlcklucHV0cyA9IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PFxuXHRcdHsgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZDsgYW5zd2Vycz86IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4gfSxcblx0XHR7IHF1ZXN0aW9uSWQ6IHN0cmluZyB9XG5cdD4oKTtcblx0LyoqXG5cdCAqIFBlbmRpbmcgZWxpY2l0YXRpb24gcmVxdWVzdHMgYXdhaXRpbmcgYSByZW5kZXJlci1zaWRlIGFuc3dlci4gS2V5ZWRcblx0ICogYnkgcmVxdWVzdCBpZDsgdGhlIHNjaGVtYSBpcyByZXRhaW5lZCBzbyB0aGUgY29tcGxldGlvbiBoYW5kbGVyIGNhblxuXHQgKiBwcm9qZWN0IHRoZSBzdWJtaXR0ZWQge0BsaW5rIENoYXRJbnB1dEFuc3dlcn1zIGJhY2sgaW50byB0aGVcblx0ICogU0RLJ3Mge0BsaW5rIEVsaWNpdGF0aW9uUmVzdWx0LmNvbnRlbnR9IHNoYXBlLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0VsaWNpdGF0aW9ucyA9IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PFxuXHRcdHsgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZDsgYW5zd2Vycz86IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4gfSxcblx0XHR7IHNjaGVtYTogRWxpY2l0YXRpb25TY2hlbWEgfCB1bmRlZmluZWQgfVxuXHQ+KCk7XG5cdC8qKlxuXHQgKiBQZW5kaW5nIHBsYW4tcmV2aWV3IHJlcXVlc3RzIG9yaWdpbmF0aW5nIGZyb20gdGhlIENMSSdzXG5cdCAqIGBleGl0UGxhbk1vZGUucmVxdWVzdGAgUlBDLiBUcmFja2VkIHNlcGFyYXRlbHkgZnJvbVxuXHQgKiB7QGxpbmsgX3BlbmRpbmdVc2VySW5wdXRzfSBzbyB0aGUgY29tcGxldGlvbiBoYW5kbGVyIGNhbiByZXNvbHZlIHRoZVxuXHQgKiBSUEMgd2l0aCBhIHN0cnVjdHVyZWQge0BsaW5rIElFeGl0UGxhbk1vZGVSZXNwb25zZX0gKHdoaWNoIHRoZSBDTElcblx0ICogZm9yd2FyZHMgdG8gYHNlc3Npb24ucmVzcG9uZFRvRXhpdFBsYW5Nb2RlYCkgcmF0aGVyIHRoYW4gZmVlZGluZyBpdFxuXHQgKiBiYWNrIHRocm91Z2ggdGhlIFNESydzIGBhc2tfdXNlcmAgY2FsbGJhY2suXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nUGxhblJldmlld3MgPSBuZXcgUGVuZGluZ1JlcXVlc3RSZWdpc3RyeTxcblx0XHRJRXhpdFBsYW5Nb2RlUmVzcG9uc2UsXG5cdFx0e1xuXHRcdFx0cmVhZG9ubHkgYWN0aW9uczogcmVhZG9ubHkgc3RyaW5nW107XG5cdFx0XHRyZWFkb25seSByZWNvbW1lbmRlZEFjdGlvbjogc3RyaW5nO1xuXHRcdFx0cmVhZG9ubHkgcXVlc3Rpb25JZDogc3RyaW5nO1xuXHRcdH1cblx0PigpO1xuXHQvKiogRmlsZSBlZGl0IHRyYWNrZXIgZm9yIHRoaXMgc2Vzc2lvbi4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdFRyYWNrZXI6IEZpbGVFZGl0VHJhY2tlcjtcblx0LyoqIFNlc3Npb24gZGF0YWJhc2UgcmVmZXJlbmNlLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kYXRhYmFzZVJlZjogSVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPjtcblx0LyoqIE9uLWRpc2sgcm9vdCBmb3IgcGVyLXNlc3Npb24gZGF0YSAoZGF0YWJhc2UsIGF0dGFjaG1lbnRzLCBcdTIwMjYpLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uRGF0YURpcjogVVJJO1xuXHQvKipcblx0ICogVGhlIGN1cnJlbnQgcHJvdG9jb2wgdHVybiBhbmQgaXRzIHBlci10dXJuIGJvb2trZWVwaW5nLCBvciBgdW5kZWZpbmVkYFxuXHQgKiB3aGVuIHRoZSBzZXNzaW9uIGlzIGlkbGUgKG5vIGFjdGl2ZSB0dXJuKS4gUmVwbGFjZXMgdGhlIGZvcm1lciBzZXQgb2Zcblx0ICogbG9vc2VseS1jb3VwbGVkIHBlci10dXJuIGZpZWxkcyAoYF90dXJuSWRgLCB1c2FnZSBjb3VudGVyLCBzdHJlYW1pbmdcblx0ICogcGFydC1pZCBtYXBzKSB3aXRoIGEgc2luZ2xlIG9iamVjdCBjYXJyeWluZyBhbiBleHBsaWNpdFxuXHQgKiB7QGxpbmsgQ29waWxvdFR1cm4uc3RhdGV9IGxpZmVjeWNsZS4gQ3JlYXRlZCAoYHBlbmRpbmdgKSBieVxuXHQgKiB7QGxpbmsgcmVzZXRUdXJuU3RhdGV9LCBmaW5hbGl6ZWQgYnkge0BsaW5rIF9jb21wbGV0ZUFjdGl2ZVR1cm59LlxuXHQgKi9cblx0cHJpdmF0ZSBfY3VycmVudFR1cm46IENvcGlsb3RUdXJuIHwgdW5kZWZpbmVkO1xuXHQvKiogTW9ub3RvbmljIDAtYmFzZWQgb3JkaW5hbCBhc3NpZ25lZCB0byBlYWNoIHR1cm4gYXMgaXQgc3RhcnRzLCBmb3IgbnVtZXJpYyBgdHVybkluZGV4YCB0ZWxlbWV0cnkgcGFyaXR5LiAqL1xuXHRwcml2YXRlIF9uZXh0VHVybk9yZGluYWwgPSAwO1xuXHQvKipcblx0ICogUHJvdG9jb2wgdHVybiBJRCBvZiB0aGUgYWN0aXZlIHR1cm4sIG9yIGAnJ2Agd2hlbiBpZGxlLiBVc2VkIGJ5IGZpbGVcblx0ICogZWRpdCB0cmFja2luZyBhbmQgZW1pdHRlZCBvbiBwZXItdHVybiBhY3Rpb25zLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXQgX3R1cm5JZCgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5fY3VycmVudFR1cm4/LmlkID8/ICcnOyB9XG5cdC8qKiAwLWJhc2VkIG9yZGluYWwgb2YgdGhlIGFjdGl2ZSB0dXJuIHdpdGhpbiB0aGUgc2Vzc2lvbiwgb3IgYDBgIHdoZW4gaWRsZS4gKi9cblx0cHJpdmF0ZSBnZXQgX3R1cm5PcmRpbmFsKCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9jdXJyZW50VHVybj8ub3JkaW5hbCA/PyAwOyB9XG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBzZXNzaW9uIGN1cnJlbnRseSBoYXMgYW4gaW4tZmxpZ2h0IHR1cm4uIFVzZWQgYnlcblx0ICogbm9uLWRlc3RydWN0aXZlIGlkbGUgcmVsZWFzZSB0byBhdm9pZCBkaXNjb25uZWN0aW5nIG1pZC10dXJuLlxuXHQgKi9cblx0Z2V0IGhhc0FjdGl2ZVR1cm4oKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9jdXJyZW50VHVybiAhPT0gdW5kZWZpbmVkOyB9XG5cdGdldCBjdXJyZW50VHVybkNsaWVudFR5cGUoKTogQWdlbnRIb3N0Q2xpZW50VHlwZSB7IHJldHVybiB0aGlzLl9jdXJyZW50VHVybj8uY2xpZW50VHlwZSA/PyBBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd247IH1cblx0LyoqXG5cdCAqIExhc3QgbW9kZWwgaWQgc2VlbiBvbiB0aGUgU0RLJ3MgcGVyLUxMTS1jYWxsIGBVc2FnZWAgZXZlbnQgKG9yIGFcblx0ICogZGlyZWN0IHtAbGluayBzZXRNb2RlbH0gY2FsbCkuIFdlIHJlbHkgb24gdGhlXG5cdCAqIGBVc2FnZWAgZXZlbnQgcmF0aGVyIHRoYW4gdGhlIHRvb2wtY2FsbCBldmVudCBpdHNlbGYgYmVjYXVzZVxuXHQgKiB0b29sLWNhbGwgZXZlbnRzIGRvbid0IGNhcnJ5IHRoZSBtb2RlbCBpZDsgdGhlIGBVc2FnZWAgZXZlbnQgZm9yXG5cdCAqIGFuIExMTSB0dXJuIHByZWNlZGVzIHRoYXQgdHVybidzIGB0b29sX3VzZWAgZXZlbnRzLlxuXHQgKi9cblx0cHJpdmF0ZSBfbGFzdFNlZW5Nb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBMYXRlc3Qgc2Vzc2lvbi13aWRlIG5hbm8tQUlVIHRvdGFsIHJlcG9ydGVkIGJ5IHRoZSBTREsncyB1c2FnZSBtZXRyaWNzXG5cdCAqIChgcnBjLnVzYWdlLmdldE1ldHJpY3NgKSwgd2hpY2ggaXMgYXV0aG9yaXRhdGl2ZSBmb3Igd2hhdCB0aGUgc2Vzc2lvbiBhcyBhXG5cdCAqIHdob2xlIGhhcyBiZWVuIGJpbGxlZDogaXQgZm9sZHMgaW4gZXZlcnkgbW9kZWwgY2FsbCBwbHVzIGNvbXBhY3Rpb24sXG5cdCAqIGNvdmVycyB3b3JrIGJpbGxlZCB3aGlsZSBubyB0dXJuIHdhcyBhY3RpdmUsIGFuZCBzdXJ2aXZlcyByZXN1bWUuXG5cdCAqXG5cdCAqIERlbGliZXJhdGVseSAqbm90KiB1c2VkIHRvIGRlcml2ZSBwZXItdHVybiBjb3N0LiBJdCBpcyBzZXNzaW9uLXNjb3BlZCBhbmRcblx0ICogcmVhZCBhc3luY2hyb25vdXNseSwgc28gZGlmZmVyZW5jaW5nIGl0IGFnYWluc3QgYSBwcmV2aW91cyByZWFkaW5nIHJhY2VzXG5cdCAqIHR1cm4gYm91bmRhcmllcyBcdTIwMTQgdGhlIFNESydzIHRlcm1pbmFsIGBzZXNzaW9uLmlkbGVgIGNhbiBjbG9zZSBhIHR1cm4gd2hpbGVcblx0ICogYSByZWFkIGlzIHN0aWxsIGluIGZsaWdodC4gUGVyLXR1cm4gY29zdCBjb21lcyBmcm9tIHRoZSBzeW5jaHJvbm91c1xuXHQgKiBwZXItZXZlbnQgYGNvcGlsb3RVc2FnZWAgaW5zdGVhZCAoc2VlIHtAbGluayBDb3BpbG90VHVybi5jb3BpbG90TmFub0FpdX0pLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2Vzc2lvblRvdGFsTmFub0FpdSA9IDA7XG5cdHByaXZhdGUgX3Byb21wdENhY2hlU3RhdGU6IElTZXNzaW9uUHJvbXB0Q2FjaGVTdGF0ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcHJvbXB0Q2FjaGVSZWZyZXNoR2VuZXJhdGlvbiA9IDA7XG5cdC8qKlxuXHQgKiBTZXJpYWxpemVzIHRoZSBtZXRyaWNzIHJlYWRzIGJlaGluZCB7QGxpbmsgX3JlZnJlc2hTZXNzaW9uVXNhZ2VNZXRyaWNzfS4gU2V2ZXJhbFxuXHQgKiBoYW5kbGVycyByZWZyZXNoIHRoZSB0b3RhbCwgc28gd2l0aG91dCB0aGlzIHRoZWlyIFJQQ3Mgb3ZlcmxhcCBhbmQgYW4gb2xkZXJcblx0ICogb25lIHJlc29sdmluZyBsYXN0IHdvdWxkIHB1Ymxpc2ggYSBzZXNzaW9uIGNvc3QgdGhhdCB2aXNpYmx5IHJlZ3Jlc3Nlcy4gQVxuXHQgKiBoaWdoLXdhdGVyIG1hcmsgY2Fubm90IGJlIHVzZWQgdG8gcmVqZWN0IHN0YWxlIHJlYWRzIGluc3RlYWQsIGJlY2F1c2UgdGhlXG5cdCAqIHRvdGFsIGlzIGxlZ2l0aW1hdGVseSBub24tbW9ub3RvbmljIChzZWUgdGhlIHRydW5jYXRpb24gbm90ZSBiZWxvdykuIEtlZXBpbmdcblx0ICogb25lIHJlYWQgaW4gZmxpZ2h0IG1ha2VzIG91dC1vZi1vcmRlciByZXNvbHV0aW9uIGltcG9zc2libGUsIGFuZCBjb2FsZXNjZXNcblx0ICogdGhlIHJlZHVuZGFudCByZWFkcyB0aGF0IGEgYnVyc3Qgb2YgdXNhZ2UgZXZlbnRzIHdvdWxkIG90aGVyd2lzZSBpc3N1ZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25Vc2FnZU1ldHJpY3NSZWZyZXNoVGhyb3R0bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlcigpKTtcblx0LyoqIFNESyBzZXNzaW9uIHdyYXBwZXIsIHNldCBieSB7QGxpbmsgaW5pdGlhbGl6ZVNlc3Npb259LiAqL1xuXHRwcml2YXRlIF93cmFwcGVyITogQ29waWxvdFNlc3Npb25XcmFwcGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zbGFzaENvbW1hbmRQcm92aWRlcjogQ29waWxvdFNsYXNoQ29tbWFuZFByb3ZpZGVyO1xuXHQvKiogTGFzdCBhZ2VudCBtb2RlIHB1c2hlZCB0byB0aGUgU0RLIHZpYSB7QGxpbmsgYXBwbHlNb2RlfSwgdG8gZWxpZGUgcmVkdW5kYW50IGBycGMubW9kZS5zZXRgIGNhbGxzLiAqL1xuXHRwcml2YXRlIF9sYXN0QXBwbGllZE1vZGU6IENvcGlsb3RTZGtNb2RlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9sYXN0QXBwbGllZFBlcm1pc3Npb25Nb2RlOiBQZXJtaXNzaW9uQWxsb3dBbGxNb2RlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hdXRvQXBwcm92YWxFeHBlcmltZW50YWxNb2RlRW5hYmxlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZXJtaXNzaW9uTW9kZVNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RlZXJpbmdNZXNzYWdlc0luRmxpZ2h0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdC8qKlxuXHQgKiBTdGVlcmluZyBtZXNzYWdlcyB0aGF0IGhhdmUgYmVlbiBhY2NlcHRlZCBieSB0aGUgU0RLIGJ1dCBub3QgeWV0XG5cdCAqIHN1cmZhY2VkIHRvIHRoZSBjaGF0IFVJIGFzIGEgc2VwYXJhdGUgdXNlciBtZXNzYWdlLiBXaGVuIHRoZSBTREtcblx0ICogZWNob2VzIGEgc3RlZXJpbmcgdGhyb3VnaCBhIGB1c2VyLm1lc3NhZ2VgIGV2ZW50IHdob3NlIGBjb250ZW50YFxuXHQgKiBtYXRjaGVzIG9uZSBvZiB0aGVzZSBlbnRyaWVzLCB3ZSBmaW5hbGl6ZSB0aGUgaW4tZmxpZ2h0IHR1cm4gYW5kXG5cdCAqIGRpc3BhdGNoIGEgbmV3IHtAbGluayBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZH0gd2hvc2Vcblx0ICogYHVzZXJNZXNzYWdlYCBpcyB0aGUgc3RlZXJpbmcgY29udGVudC4gVGhlIHJlZHVjZXIgYWxzbyByZW1vdmVzXG5cdCAqIHRoZSBwZW5kaW5nIHN0ZWVyaW5nIHZpYSB0aGUgYWN0aW9uJ3MgYHF1ZXVlZE1lc3NhZ2VJZGAuXG5cdCAqXG5cdCAqIEVudHJpZXMgbGVmdCBoZXJlIGF0IGFib3J0L2Rpc3Bvc2UgdGltZSBhcmUgZmx1c2hlZCBhc1xuXHQgKiBgc3RlZXJpbmdfY29uc3VtZWRgIHNpZ25hbHMgc28gdGhlIGNoYXQgVUkncyBwZW5kaW5nIHN0YXRlIHN0aWxsXG5cdCAqIGNsZWFycyBpbiBjbGVhbnVwIHBhdGhzIHdoZXJlIHdlIG5ldmVyIG9ic2VydmUgdGhlIGVjaG8uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nU3RlZXJpbmdGbGlwcyA9IG5ldyBNYXA8c3RyaW5nLCBQZW5kaW5nTWVzc2FnZT4oKTtcblxuXHQvKiogU25hcHNob3QgY2FwdHVyZWQgYXQgc2Vzc2lvbiBjcmVhdGlvbiBmb3IgcmVmcmVzaCBkZXRlY3Rpb24uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FwcGxpZWRTbmFwc2hvdDogSUFjdGl2ZUNsaWVudFNuYXBzaG90O1xuXHQvKipcblx0ICogTGl2ZSBvd25pbmctY2xpZW50IGlkZW50aXR5LCByZWFkIGF0IHRvb2wtY2FsbCBzdGFtcCB0aW1lIHNvIGEgd2luZG93XG5cdCAqIHJlbG9hZCB0aGF0IHJlLXB1c2hlcyBpZGVudGljYWwgdG9vbHMgd2l0aCBhIG5ldyBgY2xpZW50SWRgIHN0YW1wc1xuXHQgKiBzdWJzZXF1ZW50IGNsaWVudCB0b29sIGNhbGxzIHdpdGggdGhlIGN1cnJlbnQgaWQgcmF0aGVyIHRoYW4gdGhlIG9uZVxuXHQgKiBmcm96ZW4gaW50byB7QGxpbmsgX2FwcGxpZWRTbmFwc2hvdH0uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVDbGllbnRUb29sU2V0OiBBY3RpdmVDbGllbnRUb29sU2V0O1xuXHQvKiogVG9vbCBuYW1lcyB0aGF0IGFyZSBjbGllbnQtcHJvdmlkZWQsIGRlcml2ZWQgZnJvbSBzbmFwc2hvdC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY2xpZW50VG9vbE5hbWVzOiBSZWFkb25seVNldDxzdHJpbmc+O1xuXHQvKiogTGF1bmNoLXRpbWUgdG9vbC1zZWFyY2ggZGVjaXNpb247IGtlcHQgc3RhYmxlIGZvciB0aGUgbGlmZXRpbWUgb2YgdGhlIFNESyBzZXNzaW9uLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b29sU2VhcmNoQWN0aXZlOiBib29sZWFuO1xuXHQvKiogRGVmZXJyZWQgcHJvbWlzZXMgZm9yIHBlbmRpbmcgY2xpZW50IHRvb2wgY2FsbHMsIGtleWVkIGJ5IHRvb2xDYWxsSWQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdDbGllbnRUb29sQ2FsbHMgPSBuZXcgUGVuZGluZ1JlcXVlc3RSZWdpc3RyeTxUb29sUmVzdWx0T2JqZWN0PigpO1xuXHQvKiogUGVuZGluZyBTREsgTUNQIGF1dGggaGFuZGxlciBwcm9taXNlcywga2V5ZWQgYnkgU0RLIGF1dGggcmVxdWVzdCBpZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ01jcEF1dGhSZXF1ZXN0cyA9IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PE1jcEF1dGhSZXN1bHQgfCBudWxsIHwgdW5kZWZpbmVkLCBJUGVuZGluZ01jcEF1dGhSZXF1ZXN0PigpO1xuXHQvKiogYHBlbmRpbmctZWRpdC1jb250ZW50OmAgVVJJcyB3cml0dGVuIGR1cmluZyBwZXJtaXNzaW9uIHJlcXVlc3RzLCBrZXllZFxuXHQgKiAgYnkgdG9vbENhbGxJZC4gQ2xlYW5lZCB1cCB3aGVuIHRoZSBwZXJtaXNzaW9uIHJlc29sdmVzIG9yIHRoZSBzZXNzaW9uXG5cdCAqICBpcyBkaXNwb3NlZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0VkaXRDb250ZW50VXJpcyA9IG5ldyBNYXA8c3RyaW5nLCBVUkk+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZXNzaW9uUHJvZ3Jlc3M6IEVtaXR0ZXI8QWdlbnRTaWduYWw+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uTGF1bmNoZXI6IElDb3BpbG90U2Vzc2lvbkxhdW5jaGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXVuY2hQbGFuOiBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzTGF1bmNoVG9rZW5TdGlsbEN1cnJlbnQ6ICgpID0+IGJvb2xlYW47XG5cdC8qKiBOb3RpZmllcyB0aGUgYWdlbnQgdGhhdCB0aGlzIGNoYXQncyB0dXJuIGVuZGVkLiBTZWUge0BsaW5rIElDb3BpbG90QWdlbnRTZXNzaW9uT3B0aW9ucy5vblR1cm5FbmRlZH0uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uVHVybkVuZGVkOiAoKSA9PiB2b2lkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaGVsbE1hbmFnZXI6IFNoZWxsTWFuYWdlciB8IHVuZGVmaW5lZDtcblx0LyoqIFN0cmVhbXMgcnVudGltZS1leGVjdXRlZCBzaGVsbCBvdXRwdXQgaW50byBvdXRwdXQtb25seSAobm9uLXB0eSkgdGVybWluYWwgY2hhbm5lbHMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX25vblB0eVNoZWxsVGVybWluYWxzOiBOb25QdHlTaGVsbFRlcm1pbmFsU3RyZWFtcztcblx0cHJpdmF0ZSByZWFkb25seSBfd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXN0b21pemF0aW9uRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlcnZlclRvb2xIb3N0OiBJQWdlbnRTZXJ2ZXJUb29sSG9zdCB8IHVuZGVmaW5lZDtcblx0LyoqIEJyaWRnZXMgU0RLLXJlcG9ydGVkIE1DUCBzZXJ2ZXIgc3RhdGUgaW50byBBSFAgY3VzdG9taXphdGlvbiBhY3Rpb25zLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tY3BDdXN0b21pemF0aW9uczogTWNwQ3VzdG9taXphdGlvbkNvbnRyb2xsZXI7XG5cblx0cHJpdmF0ZSBnZXQgX3N0b3JhZ2VVcmkoKTogVVJJIHtcblx0XHRyZXR1cm4gaXNEZWZhdWx0Q2hhdFVyaSh0aGlzLl9jaGF0Q2hhbm5lbFVyaSkgPyB0aGlzLnNlc3Npb25VcmkgOiB0aGlzLl9jaGF0Q2hhbm5lbFVyaTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGYW5zIE1DUCBzZXJ2ZXIgbm90aWZpY2F0aW9ucyAodG9kYXk6IGBub3RpZmljYXRpb25zL3Rvb2xzL2xpc3RfY2hhbmdlZGApXG5cdCAqIHVwIHRvIHRoZSBhZ2VudCBhbmQgb24gdG8gdGhlIHByb3RvY29sIHNlcnZlci4gRmlyZWQgYnkgdGhlXG5cdCAqIGBvblRvb2xzVXBkYXRlZGAgbGlzdGVuZXIgb25jZSBwZXIgcmVhZHkgTUNQIGNoYW5uZWwuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1jcE5vdGlmaWNhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElNY3BOb3RpZmljYXRpb24+KCkpO1xuXHRyZWFkb25seSBvbk1jcE5vdGlmaWNhdGlvbiA9IHRoaXMuX29uTWNwTm90aWZpY2F0aW9uLmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBQZW5kaW5nIE1DUCBgc2FtcGxpbmcvY3JlYXRlTWVzc2FnZWAgcmVxdWVzdHMgcmVjZWl2ZWQgb3ZlciB0aGVcblx0ICogQUhQIGBtY3A6Ly9gIGNoYW5uZWwsIGtleWVkIGJ5IHRoZSBjYW5jZWxsYXRpb24gaGFuZGxlIHdlIHBhc3NlZFxuXHQgKiBpbnRvIHtAbGluayBycGMubWNwLmV4ZWN1dGVTYW1wbGluZ30uIFRyYWNrZWQgc28gdGhhdCBzZXNzaW9uXG5cdCAqIHRlYXJkb3duIGNhbiBpc3N1ZSBhIGJlc3QtZWZmb3J0XG5cdCAqIHtAbGluayBycGMubWNwLmNhbmNlbFNhbXBsaW5nRXhlY3V0aW9ufSBmb3IgZWFjaCBvbmUgaW5zdGVhZCBvZlxuXHQgKiBsZWF2aW5nIHRoZSBTREstc2lkZSBwcm9taXNlIChhbmQgdGhlIHVwc3RyZWFtIEFwcCkgaGFuZ2luZy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdNY3BTYW1wbGluZ3MgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHQvKiogVHJhY2tzIHdoZXRoZXIgYSBub24tZW1wdHkgYWN0aXZpdHkgaGFzIGJlZW4gcHVibGlzaGVkLCBzbyB3ZSBvbmx5IGVtaXQgYSBjbGVhciB3aGVuIG5lZWRlZC4gKi9cblx0cHJpdmF0ZSBfaGFzQWN0aXZpdHkgPSBmYWxzZTtcblxuXHQvKipcblx0ICogTGFzdCBTREstcmVwb3J0ZWQgTUNQIHN0YXR1cyBsb2dnZWQgZm9yIGVhY2ggc2VydmVyIChrZXllZCBieSBzZXJ2ZXJcblx0ICogbmFtZSkuIFVzZWQgdG8gc3VwcHJlc3MgZHVwbGljYXRlIGxpZmVjeWNsZSBsb2cgcmVjb3JkcyB3aGVuIHRoZSBTREtcblx0ICogcmUtcmVwb3J0cyBhbiB1bmNoYW5nZWQgc3RhdHVzIFx1MjAxNCB0aGUgYHJwYy5tY3AubGlzdGAgc2VlZCBhbmQgdGhlXG5cdCAqIGBzZXNzaW9uLm1jcF9zZXJ2ZXJzX2xvYWRlZGAgZXZlbnQgcm91dGluZWx5IGNhcnJ5IHRoZSBzYW1lIHNuYXBzaG90LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbGFzdExvZ2dlZE1jcFN0YXR1cyA9IG5ldyBNYXA8c3RyaW5nLCBTZGtNY3BTZXJ2ZXJTdGF0dXM+KCk7XG5cblx0LyoqIFBsYXRmb3JtIHVzZWQgdG8gY29tcHV0ZSB0aGUgU0RLIHNhbmRib3ggcG9saWN5IChpbmplY3RhYmxlIGZvciB0ZXN0cykuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BsYXRmb3JtOiBOb2RlSlMuUGxhdGZvcm07XG5cblx0Z2V0IG1jcFNlcnZlclN0YXRlcygpIHtcblx0XHRyZXR1cm4gdGhpcy5fbWNwQ3VzdG9taXphdGlvbnMucnVudGltZVN0YXRlcztcblx0fVxuXG5cdC8qKiBTdGF0ZWxlc3MgcmVwb3J0ZXIgdXNlZCB0byBlbWl0IHJlc3RyaWN0ZWQgR0gvTVNGVCB0ZWxlbWV0cnkgZm9yIHRoaXMgc2Vzc2lvbidzIG1vZGVsIGNhbGxzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlSZXBvcnRlcjogQWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlcG9JbmZvVGVsZW1ldHJ5OiBBZ2VudEhvc3RSZXBvSW5mb1RlbGVtZXRyeTtcblx0cHJpdmF0ZSBfYWN0aXZlUmVwb0luZm9UdXJuOiB7XG5cdFx0cmVhZG9ubHkgdGVsZW1ldHJ5TWVzc2FnZUlkOiBzdHJpbmc7XG5cdFx0Y2FuY2VsbGVkOiBib29sZWFuO1xuXHRcdGJlZ2luOiBQcm9taXNlPHsgcmVhZG9ubHkgY29udGV4dDogSUFnZW50SG9zdFJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0OyByZWFkb25seSBiYXNlQnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZD47XG5cdH0gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSUNvcGlsb3RBZ2VudFNlc3Npb25PcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElTZXNzaW9uRGF0YVNlcnZpY2Ugc2Vzc2lvbkRhdGFTZXJ2aWNlOiBJU2Vzc2lvbkRhdGFTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU5hdGl2ZUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFnZW50SG9zdFN0YXRlTWFuYWdlciBwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlcixcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDb3BpbG90QXBpU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb3BpbG90QXBpU2VydmljZTogSUNvcGlsb3RBcGlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2Fib3J0Q3RzLnZhbHVlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5zZXNzaW9uSWQgPSBvcHRpb25zLnJhd1Nlc3Npb25JZDtcblx0XHR0aGlzLnNlc3Npb25VcmkgPSBvcHRpb25zLnNlc3Npb25Vcmk7XG5cdFx0dGhpcy5fc2xhc2hDb21tYW5kUHJvdmlkZXIgPSBuZXcgQ29waWxvdFNsYXNoQ29tbWFuZFByb3ZpZGVyKCgpID0+IHRoaXMuX3dyYXBwZXIuc2Vzc2lvbi5ycGMuY29tbWFuZHMubGlzdCh7IGluY2x1ZGVCdWlsdGluczogdHJ1ZSwgaW5jbHVkZVNraWxsczogdHJ1ZSwgaW5jbHVkZUNsaWVudENvbW1hbmRzOiB0cnVlIH0pLnRoZW4oYyA9PiBjLmNvbW1hbmRzKSwgdGhpcy5fbG9nU2VydmljZSk7XG5cdFx0dGhpcy5fY2hhdENoYW5uZWxVcmkgPSBvcHRpb25zLmNoYXRDaGFubmVsVXJpO1xuXHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzID0gb3B0aW9ucy5vbkRpZFNlc3Npb25Qcm9ncmVzcztcblx0XHR0aGlzLl9zZXNzaW9uTGF1bmNoZXIgPSBvcHRpb25zLnNlc3Npb25MYXVuY2hlcjtcblx0XHR0aGlzLl9sYXVuY2hQbGFuID0gb3B0aW9ucy5sYXVuY2hQbGFuO1xuXHRcdHRoaXMuX2lzTGF1bmNoVG9rZW5TdGlsbEN1cnJlbnQgPSBvcHRpb25zLmlzTGF1bmNoVG9rZW5DdXJyZW50ID8/ICgoKSA9PiB0cnVlKTtcblx0XHR0aGlzLl9vblR1cm5FbmRlZCA9IG9wdGlvbnMub25UdXJuRW5kZWQgPz8gKCgpID0+IHsgfSk7XG5cdFx0dGhpcy5fc2hlbGxNYW5hZ2VyID0gb3B0aW9ucy5zaGVsbE1hbmFnZXI7XG5cdFx0dGhpcy5fbm9uUHR5U2hlbGxUZXJtaW5hbHMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb25QdHlTaGVsbFRlcm1pbmFsU3RyZWFtcywgb3B0aW9ucy5zZXNzaW9uVXJpKSk7XG5cdFx0dGhpcy5fd29ya2luZ0RpcmVjdG9yeSA9IG9wdGlvbnMud29ya2luZ0RpcmVjdG9yeTtcblx0XHR0aGlzLl9jdXN0b21pemF0aW9uRGlyZWN0b3J5ID0gb3B0aW9ucy5jdXN0b21pemF0aW9uRGlyZWN0b3J5O1xuXHRcdHRoaXMuX3NlcnZlclRvb2xIb3N0ID0gb3B0aW9ucy5zZXJ2ZXJUb29sSG9zdDtcblx0XHR0aGlzLl9wbGF0Zm9ybSA9IG9wdGlvbnMucGxhdGZvcm0gPz8gcHJvY2Vzcy5wbGF0Zm9ybTtcblx0XHR0aGlzLl90ZWxlbWV0cnlSZXBvcnRlciA9IG5ldyBBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlcih0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZXBvSW5mb1RlbGVtZXRyeSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFJlcG9JbmZvVGVsZW1ldHJ5LCB0aGlzLl90ZWxlbWV0cnlSZXBvcnRlcikpO1xuXG5cdFx0dGhpcy5fYXBwbGllZFNuYXBzaG90ID0gb3B0aW9ucy5jbGllbnRTbmFwc2hvdCA/PyB7IHRvb2xzOiBbXSwgcGx1Z2luczogW10sIG1jcFNlcnZlcnM6IHt9IH07XG5cdFx0dGhpcy5fY2xpZW50VG9vbE5hbWVzID0gY2xpZW50VG9vbE5hbWVzRnJvbVNuYXBzaG90KHRoaXMuX2FwcGxpZWRTbmFwc2hvdCk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9sYXVuY2hQbGFuLmtpbmQgPT09ICdjcmVhdGUnID8gdGhpcy5fbGF1bmNoUGxhbi5tb2RlbCA6IHRoaXMuX2xhdW5jaFBsYW4uZmFsbGJhY2subW9kZWw7XG5cdFx0Ly8gQ2FwYWJpbGl0eSBkZWNpc2lvbnMgdXNlIHRoZSBmYW1pbHktYWxpYXNlZCBzZWxlY3Rpb24gc28gYW4gYWxpYXNlZFxuXHRcdC8vIHByZXZpZXcgbW9kZWwgYWdyZWVzIHdpdGggdGhlIGxhdW5jaGVyJ3MgdG9vbC1zZWFyY2ggZ2F0aW5nICh3aGljaFxuXHRcdC8vIGFsc28gYWxpYXNlcyBiZWZvcmUgY2hlY2tpbmcpOyB0aGUgd2lyZSBtb2RlbCBpZCBpcyB1bmFmZmVjdGVkLlxuXHRcdGNvbnN0IGVmZmVjdGl2ZU1vZGVsID0gYXBwbHlNb2RlbEZhbWlseUFsaWFzKG1vZGVsLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUoY29waWxvdENsaUNvbmZpZ1NjaGVtYSwgQ29waWxvdENsaUNvbmZpZ0tleS5Nb2RlbENhcGFiaWxpdHlPdmVycmlkZXMpKTtcblx0XHR0aGlzLl90b29sU2VhcmNoQWN0aXZlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKGNvcGlsb3RDbGlDb25maWdTY2hlbWEsIENvcGlsb3RDbGlDb25maWdLZXkuVG9vbFNlYXJjaEVuYWJsZWQpID09PSB0cnVlXG5cdFx0XHQmJiBhZ2VudEhvc3RNb2RlbFN1cHBvcnRzVG9vbFNlYXJjaChlZmZlY3RpdmVNb2RlbD8uaWQpXG5cdFx0XHQmJiB0aGlzLl9jbGllbnRUb29sTmFtZXMuaGFzKENMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRSk7XG5cdFx0Ly8gU2hhcmUgdGhlIGFnZW50J3MgbGl2ZSBBY3RpdmVDbGllbnRUb29sU2V0IHdoZW4gcHJvdmlkZWQgc28gY2xpZW50XG5cdFx0Ly8gY29udHJpYnV0aW9ucyAoYW5kIG93bmVyIGlkZW50aXR5KSBhcmUgb2JzZXJ2ZWQgYXQgc3RhbXAgdGltZS5cblx0XHQvLyBTdGFuZGFsb25lIC8gdGVzdCBjb25zdHJ1Y3Rpb24gdXNlcyBhIGZyZXNoIGVtcHR5IHJlZ2lzdHJ5LCB3aGljaFxuXHRcdC8vIGxlYXZlcyBjbGllbnQgdG9vbCBjYWxscyB1bnN0YW1wZWQgKG5vIG93bmluZyBjbGllbnQpLlxuXHRcdHRoaXMuX2FjdGl2ZUNsaWVudFRvb2xTZXQgPSBvcHRpb25zLmFjdGl2ZUNsaWVudFRvb2xTZXQgPz8gbmV3IEFjdGl2ZUNsaWVudFRvb2xTZXQoKTtcblxuXHRcdHRoaXMuX2RhdGFiYXNlUmVmID0gc2Vzc2lvbkRhdGFTZXJ2aWNlLm9wZW5EYXRhYmFzZSh0aGlzLl9zdG9yYWdlVXJpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fZGF0YWJhc2VSZWYuZGlzcG9zZSgpKSk7XG5cdFx0dGhpcy5fc2Vzc2lvbkRhdGFEaXIgPSBzZXNzaW9uRGF0YVNlcnZpY2UuZ2V0U2Vzc2lvbkRhdGFEaXIodGhpcy5fc3RvcmFnZVVyaSk7XG5cblx0XHR0aGlzLl9lZGl0VHJhY2tlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZpbGVFZGl0VHJhY2tlciwgdGhpcy5fc3RvcmFnZVVyaS50b1N0cmluZygpLCB0aGlzLl9kYXRhYmFzZVJlZi5vYmplY3QpO1xuXG5cdFx0dGhpcy5fbWNwQ3VzdG9taXphdGlvbnMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BDdXN0b21pemF0aW9uQ29udHJvbGxlciwge1xuXHRcdFx0cHJvdmlkZXJJZDogdGhpcy5zZXNzaW9uVXJpLnNjaGVtZSxcblx0XHRcdHNlc3Npb25JZDogdGhpcy5zZXNzaW9uSWQsXG5cdFx0XHRzZXNzaW9uVXJpOiB0aGlzLnNlc3Npb25VcmksXG5cdFx0XHRyZXNvbHZlQ2hpbGRJZDogb3B0aW9ucy5yZXNvbHZlTWNwQ2hpbGRJZCxcblx0XHRcdGVtaXQ6IGFjdGlvbiA9PiB0aGlzLl9lbWl0QWN0aW9uKGFjdGlvbiksXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2NhbmNlbEFsbFBlbmRpbmdJbnRlcmFjdGlvbnMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9zaGVsbE1hbmFnZXI/LmRpc3Bvc2UoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9kcmFpblBlbmRpbmdTdGVlcmluZ0ZsaXBzKCkpKTtcblxuXHRcdC8vIFdoZW4gYSBzaGVsbCB0b29sIGFzc29jaWF0ZXMgYSB0ZXJtaW5hbCB3aXRoIGEgdG9vbCBjYWxsLCBmaXJlIGFcblx0XHQvLyB0b29sX2NvbnRlbnRfY2hhbmdlZCBldmVudCBzbyB0aGUgVUkgY2FuIGNvbm5lY3QgdG8gdGhlIHRlcm1pbmFsXG5cdFx0Ly8gd2hpbGUgdGhlIGNvbW1hbmQgaXMgc3RpbGwgcnVubmluZy5cblx0XHRpZiAodGhpcy5fc2hlbGxNYW5hZ2VyKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zaGVsbE1hbmFnZXIub25EaWRBc3NvY2lhdGVUZXJtaW5hbCgoeyB0b29sQ2FsbElkLCB0ZXJtaW5hbFVyaSwgZGlzcGxheU5hbWUgfSkgPT4ge1xuXHRcdFx0XHRjb25zdCB0cmFja2VkID0gdGhpcy5fYWN0aXZlVG9vbENhbGxzLmdldCh0b29sQ2FsbElkKTtcblx0XHRcdFx0aWYgKCF0cmFja2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dHJhY2tlZC5jb250ZW50LnB1c2goe1xuXHRcdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCxcblx0XHRcdFx0XHRyZXNvdXJjZTogdGVybWluYWxVcmksXG5cdFx0XHRcdFx0dGl0bGU6IGRpc3BsYXlOYW1lLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLFxuXHRcdFx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0Y29udGVudDogdHJhY2tlZC5jb250ZW50LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIEFnZW50U2lnbmFsIGhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqIFdyYXBzIGEge0BsaW5rIFNlc3Npb25BY3Rpb259IGluIGFuIHtAbGluayBBZ2VudFNpZ25hbH0gZW52ZWxvcGUgYW5kIGVtaXRzIGl0LiAqL1xuXHQvKiogdG9kb0Bjb25ub3I0MzEyOiBBSFAgaXMgbWlzc2luZyBhIGNoYXQgYWN0aXZpdHkgdXBkYXRlIGFjdGlvbiB3aGljaCBpcyBuZWVkZWQgdG8gZHJvcCBgU2Vzc2lvbkFjdGlvbmAgaGVyZSAqL1xuXHRwcml2YXRlIF9lbWl0QWN0aW9uKGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24sIHBhcmVudFRvb2xDYWxsSWQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKHtcblx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0cmVzb3VyY2U6IGlzQ2hhdEFjdGlvbihhY3Rpb24pID8gdGhpcy5fY2hhdENoYW5uZWxVcmkgOiB0aGlzLnNlc3Npb25VcmksXG5cdFx0XHRhY3Rpb24sXG5cdFx0XHRwYXJlbnRUb29sQ2FsbElkLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFByb21vdGVzIGEgcGVuZGluZyBzdGVlcmluZyBtZXNzYWdlIGludG8gaXRzIG93biBwcm90b2NvbCB0dXJuOlxuXHQgKiBjbG9zZXMgdGhlIGluLWZsaWdodCB0dXJuIChzbyBpdHMgcmVzcG9uc2VQYXJ0cyBzZXR0bGUgaW50byBoaXN0b3J5KVxuXHQgKiBhbmQgZGlzcGF0Y2hlcyB7QGxpbmsgQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWR9IGZvciBhIGZyZXNoXG5cdCAqIHR1cm4gd2hvc2UgdXNlciBtZXNzYWdlIGlzIHRoZSBzdGVlcmluZyBjb250ZW50LiBUaGUgYWN0aW9uJ3Ncblx0ICogYHF1ZXVlZE1lc3NhZ2VJZGAgYXRvbWljYWxseSBjbGVhcnMgdGhlIGNvcnJlc3BvbmRpbmcgcGVuZGluZ1xuXHQgKiBzdGVlcmluZyBtZXNzYWdlIGZyb20gdGhlIHNlc3Npb24gc3RhdGUuXG5cdCAqXG5cdCAqIEFsbCBzdWJzZXF1ZW50IFNESyBldmVudHMgKG1lc3NhZ2UgZGVsdGFzLCB0b29sIGNhbGxzLCBcdTIwMjYpIGVtaXR0ZWRcblx0ICogYnkgdGhlIGFnZW50IG5vdyByZWZlcmVuY2UgdGhlIG5ldyBgX3R1cm5JZGAsIHNvIHRoZSBzdGVlcmluZ1xuXHQgKiByZXNwb25zZSBsYW5kcyBpbiB0aGUgbmV3IHR1cm4gcmF0aGVyIHRoYW4gYmVpbmcgZm9sZGVkIGludG8gdGhlXG5cdCAqIG9yaWdpbmFsLlxuXHQgKlxuXHQgKiBSZXR1cm5zIHRoZSBuZXcgdHVybiBpZCBzbyBjYWxsZXJzIChub3RhYmx5IHRoZSBgdXNlci5tZXNzYWdlYFxuXHQgKiBoYW5kbGVyKSBjYW4gYXNzb2NpYXRlIHRoZSBTREsgZXZlbnQgaWQgd2l0aCB0aGUgc3RlZXJpbmcgdHVybiBmb3Jcblx0ICogaGlzdG9yeS50cnVuY2F0ZSAvIHNlc3Npb25zLmZvcmsgbWFwcGluZy5cblx0ICovXG5cdHByaXZhdGUgX2JlZ2luU3RlZXJpbmdUdXJuKHN0ZWVyaW5nOiBQZW5kaW5nTWVzc2FnZSk6IHN0cmluZyB7XG5cdFx0dGhpcy5fY29tcGxldGVBY3RpdmVUdXJuKCk7XG5cdFx0Y29uc3QgbmV3VHVybklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZDogbmV3VHVybklkLFxuXHRcdFx0c3RhcnRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRtZXNzYWdlOiBzdGVlcmluZy5tZXNzYWdlLFxuXHRcdFx0cXVldWVkTWVzc2FnZUlkOiBzdGVlcmluZy5pZCxcblx0XHR9KTtcblx0XHQvLyBNaXJyb3IgYHJlc2V0VHVyblN0YXRlYCBzbyBwZXItdHVybiBjb3VudGVycy9tYXBwaW5ncyAodXNhZ2UgdG90YWwsXG5cdFx0Ly8gc3RyZWFtaW5nIHBhcnQgaWRzKSBkb24ndCBibGVlZCBmcm9tIHRoZSBwcmVlbXB0ZWQgdHVybiBpbnRvIHRoZSBuZXdcblx0XHQvLyBzdGVlcmluZyB0dXJuLiBUaGUgc3RlZXJpbmcgdHVybiBpcyBjcmVhdGVkIG1pZC1sb29wIGluIHJlc3BvbnNlIHRvIGFuXG5cdFx0Ly8gU0RLIGB1c2VyLm1lc3NhZ2VgIGV2ZW50LCBzbyB0aGUgU0RLIGlzIGFscmVhZHkgYWN0aXZlbHkgcHJvZHVjaW5nIGl0c1xuXHRcdC8vIHJlc3BvbnNlOiBtYXJrIGl0IGBydW5uaW5nYCBpbW1lZGlhdGVseSByYXRoZXIgdGhhbiBsZWF2aW5nIGl0XG5cdFx0Ly8gYHBlbmRpbmdgLCBvdGhlcndpc2UgYW4gYWJvcnQgZHVyaW5nIHRoZSBzdGVlcmluZyB0dXJuIHdvdWxkIHRyZWF0IGl0XG5cdFx0Ly8gYXMgYSBub3QteWV0LXN0YXJ0ZWQgcXVldWVkIHR1cm4gYW5kIGxlYXZlIGl0IG9wZW4uXG5cdFx0dGhpcy5yZXNldFR1cm5TdGF0ZShuZXdUdXJuSWQpO1xuXHRcdGlmICh0aGlzLl9jdXJyZW50VHVybikge1xuXHRcdFx0dGhpcy5fY3VycmVudFR1cm4ubWVzc2FnZUNoYXJMZW4gPSBzdGVlcmluZy5tZXNzYWdlLnRleHQubGVuZ3RoO1xuXHRcdFx0dGhpcy5fY3VycmVudFR1cm4ubWFya1J1bm5pbmcoKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ld1R1cm5JZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBEcmFpbnMgYW55IHN0ZWVyaW5nIG1lc3NhZ2VzIHdlIGFja25vd2xlZGdlZCB0byB0aGUgU0RLIGJ1dCBuZXZlclxuXHQgKiBwcm9tb3RlZCB0byB0aGVpciBvd24gdHVybiAoZS5nLiBvbiBhYm9ydCBvciBzZXNzaW9uIGRpc3Bvc2UpLiBGaXJlc1xuXHQgKiBgc3RlZXJpbmdfY29uc3VtZWRgIHNvIHRoZSBjaGF0IFVJIHJlbW92ZXMgdGhlIGxpbmdlcmluZyBwZW5kaW5nXG5cdCAqIHN0ZWVyaW5nIGJ1YmJsZSBldmVuIHdoZW4gbm8gZnJlc2ggYHVzZXIubWVzc2FnZWAgYXJyaXZlcy5cblx0ICovXG5cdHByaXZhdGUgX2RyYWluUGVuZGluZ1N0ZWVyaW5nRmxpcHMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdTdGVlcmluZ0ZsaXBzLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaWRzID0gWy4uLnRoaXMuX3BlbmRpbmdTdGVlcmluZ0ZsaXBzLmtleXMoKV07XG5cdFx0dGhpcy5fcGVuZGluZ1N0ZWVyaW5nRmxpcHMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuXHRcdFx0dGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZmlyZSh7XG5cdFx0XHRcdGtpbmQ6ICdzdGVlcmluZ19jb25zdW1lZCcsXG5cdFx0XHRcdGNoYXQ6IHRoaXMuX2NoYXRDaGFubmVsVXJpLFxuXHRcdFx0XHRpZCxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBQb3BzIHRoZSBidWZmZXJlZCBzdGVlcmluZyBtZXNzYWdlIHdob3NlIHRleHQgbWF0Y2hlcyB0aGUgU0RLXG5cdCAqIGB1c2VyLm1lc3NhZ2VgIGNvbnRlbnQgd2UganVzdCBvYnNlcnZlZC4gTWF0Y2hpbmcgYnkgY29udGVudCAocmF0aGVyXG5cdCAqIHRoYW4ganVzdCBwb3BwaW5nIEZJRk8pIGtlZXBzIHVzIHJvYnVzdCBhZ2FpbnN0IHRoZSBTREsgcmVvcmRlcmluZ1xuXHQgKiBvciBjb2FsZXNjaW5nIGVudHJpZXMgXHUyMDE0IGNvbmN1cnJlbnQgc3RlZXJpbmcgbWVzc2FnZXMgd2l0aCBkaWZmZXJlbnRcblx0ICogdGV4dHMgYXJlIHN0aWxsIG1hdGNoZWQgdG8gdGhlIGNvcnJlY3Qgb25lLiBSZXR1cm5zIGB1bmRlZmluZWRgIGlmXG5cdCAqIG5vIGJ1ZmZlcmVkIGVudHJ5IG1hdGNoZXM7IHRoZSBjYWxsZXIgdHJlYXRzIHRoZSBgdXNlci5tZXNzYWdlYCBhc1xuXHQgKiBhbiBvcmRpbmFyeSBlY2hvIGFuZCBza2lwcyB0aGUgdHVybiBmbGlwLlxuXHQgKi9cblx0cHJpdmF0ZSBfdGFrZU1hdGNoaW5nUGVuZGluZ1N0ZWVyaW5nKGNvbnRlbnQ6IHN0cmluZyk6IFBlbmRpbmdNZXNzYWdlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fcGVuZGluZ1N0ZWVyaW5nRmxpcHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBbaWQsIG1zZ10gb2YgdGhpcy5fcGVuZGluZ1N0ZWVyaW5nRmxpcHMpIHtcblx0XHRcdGlmIChtc2cubWVzc2FnZS50ZXh0ID09PSBjb250ZW50KSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdTdGVlcmluZ0ZsaXBzLmRlbGV0ZShpZCk7XG5cdFx0XHRcdHJldHVybiBtc2c7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9wYXJlbnRUb29sQ2FsbElkRm9yU3ViYWdlbnRFdmVudChlOiB7IHJlYWRvbmx5IGFnZW50SWQ/OiBzdHJpbmcgfSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGUuYWdlbnRJZCA/IHRoaXMuX3BhcmVudFRvb2xDYWxsSWRzQnlBZ2VudElkLmdldChlLmFnZW50SWQpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzdW1lU3ViYWdlbnRGb3JFdmVudChlOiB7IHJlYWRvbmx5IGFnZW50SWQ/OiBzdHJpbmcgfSwgbWVzc2FnZT86IE1lc3NhZ2UpOiB2b2lkIHtcblx0XHRpZiAoIWUuYWdlbnRJZCB8fCB0aGlzLl9hY3RpdmVTdWJhZ2VudEFnZW50SWRzLmhhcyhlLmFnZW50SWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHBhcmVudFRvb2xDYWxsSWQgPSB0aGlzLl9wYXJlbnRUb29sQ2FsbElkc0J5QWdlbnRJZC5nZXQoZS5hZ2VudElkKTtcblx0XHRpZiAoIXBhcmVudFRvb2xDYWxsSWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYWN0aXZlU3ViYWdlbnRBZ2VudElkcy5hZGQoZS5hZ2VudElkKTtcblx0XHR0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKHtcblx0XHRcdGtpbmQ6ICdzdWJhZ2VudF9yZXN1bWVkJyxcblx0XHRcdGNoYXQ6IHRoaXMuX2NoYXRDaGFubmVsVXJpLFxuXHRcdFx0dG9vbENhbGxJZDogcGFyZW50VG9vbENhbGxJZCxcblx0XHRcdG1lc3NhZ2UsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wbGV0ZVN1YmFnZW50VHVybihhZ2VudElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRvb2xDYWxsSWQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoYWdlbnRJZCkge1xuXHRcdFx0aWYgKCF0aGlzLl9hY3RpdmVTdWJhZ2VudEFnZW50SWRzLmRlbGV0ZShhZ2VudElkKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICghdG9vbENhbGxJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbElkID0gdG9vbENhbGxJZCA/PyAoYWdlbnRJZCA/IHRoaXMuX3BhcmVudFRvb2xDYWxsSWRzQnlBZ2VudElkLmdldChhZ2VudElkKSA6IHVuZGVmaW5lZCk7XG5cdFx0aWYgKCFwYXJlbnRUb29sQ2FsbElkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUoe1xuXHRcdFx0a2luZDogJ3N1YmFnZW50X2NvbXBsZXRlZCcsXG5cdFx0XHRjaGF0OiB0aGlzLl9jaGF0Q2hhbm5lbFVyaSxcblx0XHRcdHRvb2xDYWxsSWQ6IHBhcmVudFRvb2xDYWxsSWQsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zaG91bGREcm9wVW5tYXBwZWRTdWJhZ2VudEV2ZW50KGU6IHsgcmVhZG9ubHkgYWdlbnRJZD86IHN0cmluZyB9LCBldmVudE5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHBhcmVudFRvb2xDYWxsSWQgPSB0aGlzLl9wYXJlbnRUb29sQ2FsbElkRm9yU3ViYWdlbnRFdmVudChlKTtcblx0XHRpZiAoIXBhcmVudFRvb2xDYWxsSWQgJiYgZS5hZ2VudElkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBEcm9wcGluZyAke2V2ZW50TmFtZX0gZm9yIHVua25vd24gc3ViYWdlbnQgYWdlbnRJZD0ke2UuYWdlbnRJZH1gKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUb29sQ2FsbENvbnRyaWJ1dG9yKHRvb2xOYW1lOiBzdHJpbmcsIG1jcFNlcnZlck5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFRvb2xDYWxsQ29udHJpYnV0b3IgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNsaWVudFRvb2xOYW1lID0gdGhpcy5fY2xpZW50VG9vbE5hbWUodG9vbE5hbWUpO1xuXHRcdGlmICh0aGlzLl9jbGllbnRUb29sTmFtZXMuaGFzKGNsaWVudFRvb2xOYW1lKSkge1xuXHRcdFx0Y29uc3QgY2xpZW50SWQgPSB0aGlzLl9hY3RpdmVDbGllbnRUb29sU2V0Lm93bmVyT2YoY2xpZW50VG9vbE5hbWUsIHRoaXMuX2N1cnJlbnRUdXJuPy5zZW5kZXJDbGllbnRJZCk7XG5cdFx0XHRyZXR1cm4gY2xpZW50SWQgPyB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQgfSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKG1jcFNlcnZlck5hbWUpIHtcblx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb25JZCA9IHRoaXMuX21jcEN1c3RvbWl6YXRpb25zLmN1c3RvbWl6YXRpb25JZEZvclNlcnZlcihtY3BTZXJ2ZXJOYW1lKTtcblx0XHRcdHJldHVybiBjdXN0b21pemF0aW9uSWQgPyB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLk1DUCwgY3VzdG9taXphdGlvbklkIH0gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVUb29sQ2FsbE1ldGEodG9vbE5hbWU6IHN0cmluZywgcGFyYW1ldGVyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBNdXRhYmxlPElUb29sQ2FsbE1ldGE+IHtcblx0XHRjb25zdCB0b29sS2luZCA9IGdldFRvb2xLaW5kKHRvb2xOYW1lKTtcblx0XHRjb25zdCBzdWJhZ2VudE1ldGEgPSB0b29sS2luZCA9PT0gJ3N1YmFnZW50JyA/IGdldFN1YmFnZW50TWV0YWRhdGEocGFyYW1ldGVycykgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRvb2xLaW5kLFxuXHRcdFx0bGFuZ3VhZ2U6IHRvb2xLaW5kID09PSAndGVybWluYWwnID8gZ2V0U2hlbGxMYW5ndWFnZSh0b29sTmFtZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRzdWJhZ2VudERlc2NyaXB0aW9uOiBzdWJhZ2VudE1ldGE/LmRlc2NyaXB0aW9uLFxuXHRcdFx0c3ViYWdlbnRBZ2VudE5hbWU6IHN1YmFnZW50TWV0YT8uYWdlbnROYW1lLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTdHJlYW1pbmdUb29sQ2FsbERpc3BsYXkodG9vbE5hbWU6IHN0cmluZywgaW5wdXQ6IHN0cmluZykge1xuXHRcdGNvbnN0IHBhcnRpYWxJbnB1dCA9IHBhcnNlQ29waWxvdFN0cmVhbWluZ1Rvb2xJbnB1dChpbnB1dCk7XG5cdFx0Y29uc3QgcGFyYW1ldGVycyA9IHBhcnRpYWxJbnB1dCAhPT0gbnVsbCAmJiB0eXBlb2YgcGFydGlhbElucHV0ID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShwYXJ0aWFsSW5wdXQpXG5cdFx0XHQ/IHBhcnRpYWxJbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPlxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHBhcmFtZXRlcnMsXG5cdFx0XHRtZXRhOiB0aGlzLl9jcmVhdGVUb29sQ2FsbE1ldGEodG9vbE5hbWUsIHBhcmFtZXRlcnMpLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGdldFN0cmVhbWluZ0ludm9jYXRpb25NZXNzYWdlKHRvb2xOYW1lLCBnZXRUb29sRGlzcGxheU5hbWUodG9vbE5hbWUpLCBwYXJ0aWFsSW5wdXQsIHBhdGggPT4gdGhpcy5fcmVzb2x2ZUVkaXRGaWxlUGF0aChwYXRoKSksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2VtaXRTdHJlYW1pbmdUb29sQ2FsbERpc3BsYXkodG9vbENhbGxJZDogc3RyaW5nLCBzdHJlYW1pbmc6IElDb3BpbG90U3RyZWFtaW5nVG9vbENhbGwpOiB2b2lkIHtcblx0XHRpZiAoIXN0cmVhbWluZy50b29sTmFtZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkaXNwbGF5ID0gdGhpcy5fZ2V0U3RyZWFtaW5nVG9vbENhbGxEaXNwbGF5KHN0cmVhbWluZy50b29sTmFtZSwgc3RyZWFtaW5nLmlucHV0KTtcblx0XHRzdHJlYW1pbmcuZGlzcGxheWVkSW5wdXRMZW5ndGggPSBzdHJlYW1pbmcuaW5wdXQubGVuZ3RoO1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSBzdHJlYW1pbmdUb29sRGlzcGxheVRleHQoZGlzcGxheS5pbnZvY2F0aW9uTWVzc2FnZSk7XG5cdFx0aWYgKG1lc3NhZ2UgPT09IHN0cmVhbWluZy5kaXNwbGF5ZWRNZXNzYWdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHN0cmVhbWluZy5kaXNwbGF5ZWRNZXNzYWdlID0gbWVzc2FnZTtcblx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGEsXG5cdFx0XHR0dXJuSWQ6IHRoaXMuX3R1cm5JZCxcblx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRjb250ZW50OiAnJyxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBkaXNwbGF5Lmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0X21ldGE6IHRvVG9vbENhbGxNZXRhKGRpc3BsYXkubWV0YSksXG5cdFx0fSwgc3RyZWFtaW5nLnBhcmVudFRvb2xDYWxsSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVTdHJlYW1pbmdUb29sQ2FsbERpc3BsYXkodG9vbENhbGxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0bGV0IHNjaGVkdWxlciA9IHRoaXMuX3N0cmVhbWluZ1Rvb2xEaXNwbGF5U2NoZWR1bGVycy5nZXQodG9vbENhbGxJZCk7XG5cdFx0aWYgKCFzY2hlZHVsZXIpIHtcblx0XHRcdHNjaGVkdWxlciA9IG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RyZWFtaW5nID0gdGhpcy5fc3RyZWFtaW5nVG9vbENhbGxzLmdldCh0b29sQ2FsbElkKTtcblx0XHRcdFx0aWYgKCFzdHJlYW1pbmc/LnN0YXJ0ZWQgfHwgIXN0cmVhbWluZy50b29sTmFtZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc3RyZWFtaW5nLmRpc3BsYXllZElucHV0TGVuZ3RoID09PSBzdHJlYW1pbmcuaW5wdXQubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2VtaXRTdHJlYW1pbmdUb29sQ2FsbERpc3BsYXkodG9vbENhbGxJZCwgc3RyZWFtaW5nKTtcblx0XHRcdH0sIFNUUkVBTUlOR19UT09MX0RJU1BMQVlfSU5URVJWQUxfTVMpO1xuXHRcdFx0dGhpcy5fc3RyZWFtaW5nVG9vbERpc3BsYXlTY2hlZHVsZXJzLnNldCh0b29sQ2FsbElkLCBzY2hlZHVsZXIpO1xuXHRcdH1cblx0XHRpZiAoIXNjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRzY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9iZWdpblRvb2xDYWxsUm91bmQocGFyZW50VG9vbENhbGxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2NvcGUgPSBwYXJlbnRUb29sQ2FsbElkID8/ICcnO1xuXHRcdHRoaXMuX2N1cnJlbnRUdXJuPy5tYXJrZG93blBhcnRJZHMuZGVsZXRlKHNjb3BlKTtcblx0XHR0aGlzLl9jdXJyZW50VHVybj8ucmVhc29uaW5nUGFydElkcy5kZWxldGUoc2NvcGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0YXJ0cyBhIGZyZXNoIGBwZW5kaW5nYCB0dXJuLCBkaXNjYXJkaW5nIGFueSBwZXItdHVybiBzdHJlYW1pbmcgc3RhdGVcblx0ICogZnJvbSBhIHByZXZpb3VzIHR1cm4gc28gdGhlIG5leHQgdGV4dC9yZWFzb25pbmcgY2h1bmsgYWxsb2NhdGVzIGEgbmV3XG5cdCAqIHJlc3BvbnNlIHBhcnQuIFRoZSB0dXJuIGJlY29tZXMgYHJ1bm5pbmdgIG9uIHRoZSBmaXJzdCBTREsgZXZlbnQuXG5cdCAqL1xuXHRyZXNldFR1cm5TdGF0ZSh0dXJuSWQ6IHN0cmluZywgc2VuZGVyQ2xpZW50SWQ/OiBzdHJpbmcsIGNsaWVudFR5cGUgPSBBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd24pOiB2b2lkIHtcblx0XHR0aGlzLl9zdHJlYW1pbmdUb29sQ2FsbHMuY2xlYXIoKTtcblx0XHR0aGlzLl9zdHJlYW1pbmdUb29sRGlzcGxheVNjaGVkdWxlcnMuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cdFx0dGhpcy5fY3VycmVudFR1cm4gPSBuZXcgQ29waWxvdFR1cm4odHVybklkLCB0aGlzLl9uZXh0VHVybk9yZGluYWwrKywgc2VuZGVyQ2xpZW50SWQsIGNsaWVudFR5cGUpO1xuXHR9XG5cblx0LyoqIFJlZnJlc2hlcyBwcm9tcHQtY2FjaGUgc3RhdGUgYW5kIHRoZSBzZXNzaW9uLXdpZGUgbmFuby1BSVUgdG90YWwgZnJvbSB0aGUgU0RLJ3MgYXV0aG9yaXRhdGl2ZSB1c2FnZSBtZXRyaWNzLiAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZWZyZXNoU2Vzc2lvblVzYWdlTWV0cmljcygpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3Nlc3Npb25Vc2FnZU1ldHJpY3NSZWZyZXNoVGhyb3R0bGVyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcHJvbXB0Q2FjaGVSZWZyZXNoR2VuZXJhdGlvbiA9IHRoaXMuX3Byb21wdENhY2hlUmVmcmVzaEdlbmVyYXRpb247XG5cdFx0XHRcdGNvbnN0IG1ldHJpY3MgPSBhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLnVzYWdlLmdldE1ldHJpY3MoKTtcblx0XHRcdFx0Y29uc3QgbW9kZWxJZCA9IG1ldHJpY3MuY3VycmVudE1vZGVsO1xuXHRcdFx0XHRpZiAoIXRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgJiYgbW9kZWxJZCAmJiBwcm9tcHRDYWNoZVJlZnJlc2hHZW5lcmF0aW9uID09PSB0aGlzLl9wcm9tcHRDYWNoZVJlZnJlc2hHZW5lcmF0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2FjaGVFeHBpcmVzQXQgPSBtZXRyaWNzLm1vZGVsTWV0cmljc1ttb2RlbElkXT8uY2FjaGVFeHBpcmVzQXQ7XG5cdFx0XHRcdFx0dGhpcy5fc2V0UHJvbXB0Q2FjaGVTdGF0ZShjYWNoZUV4cGlyZXNBdCA/IHsgbW9kZWxJZCwgY2FjaGVFeHBpcmVzQXQgfSA6IHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB0b3RhbCA9IG1ldHJpY3MudG90YWxOYW5vQWl1O1xuXHRcdFx0XHRpZiAodHlwZW9mIHRvdGFsICE9PSAnbnVtYmVyJyB8fCAhTnVtYmVyLmlzRmluaXRlKHRvdGFsKSB8fCB0b3RhbCA8IDAgfHwgdG90YWwgPT09IHRoaXMuX3Nlc3Npb25Ub3RhbE5hbm9BaXUpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc2Vzc2lvblRvdGFsTmFub0FpdSA9IHRvdGFsO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gQWxzbyBjb3ZlcnMgdGhlIHJlamVjdGlvbiBmcm9tIGEgdGhyb3R0bGVyIGRpc3Bvc2VkIG1pZC1yZWFkLlxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIHVzYWdlLmdldE1ldHJpY3MgUlBDIGZhaWxlZDogJHtnZXRFcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHBhcmVudC1zY29wZSBDb3BpbG90IGJpbGxpbmcgbWV0YWRhdGEgZm9yIHRoZSBhY3RpdmUgdHVybjogdGhlIHR1cm4nc1xuXHQgKiBvd24gYWNjdW11bGF0ZWQgY29zdCBwbHVzIHRoZSBTREsncyBzZXNzaW9uLXdpZGUgdG90YWwuIEFic2VudCB1bnRpbFxuXHQgKiBzb21ldGhpbmcgaGFzIGFjdHVhbGx5IGJlZW4gYmlsbGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfcGFyZW50Q29waWxvdFVzYWdlTWV0YSgpOiBVc2FnZUluZm9NZXRhWydjb3BpbG90VXNhZ2UnXSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdHVybk5hbm9BaXUgPSB0aGlzLl9jdXJyZW50VHVybj8uY29waWxvdE5hbm9BaXUgPz8gMDtcblx0XHRpZiAoIXR1cm5OYW5vQWl1ICYmICF0aGlzLl9zZXNzaW9uVG90YWxOYW5vQWl1KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uKHR1cm5OYW5vQWl1ID8geyB0b3RhbE5hbm9BaXU6IHR1cm5OYW5vQWl1IH0gOiB7fSksXG5cdFx0XHQuLi4odGhpcy5fc2Vzc2lvblRvdGFsTmFub0FpdSA/IHsgc2Vzc2lvblRvdGFsTmFub0FpdTogdGhpcy5fc2Vzc2lvblRvdGFsTmFub0FpdSB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHQvKiogUmVhZHMgdGhlIFNESydzIHBlci1zb3VyY2UgY29udGV4dC13aW5kb3cgYXR0cmlidXRpb24sIG9yIGB1bmRlZmluZWRgIHdoZW4gdW5hdmFpbGFibGUuICovXG5cdHByaXZhdGUgYXN5bmMgX3JlYWRDb250ZXh0QXR0cmlidXRpb24oKTogUHJvbWlzZTxJQ29udGV4dEF0dHJpYnV0aW9uRGF0YSB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBhdHRyaWJ1dGlvbjogSUNvbnRleHRBdHRyaWJ1dGlvbkRhdGEgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF0dHJpYnV0aW9uID0gKGF3YWl0IHRoaXMuX3dyYXBwZXIuc2Vzc2lvbi5ycGMubWV0YWRhdGEuZ2V0Q29udGV4dEF0dHJpYnV0aW9uKCkpPy5jb250ZXh0QXR0cmlidXRpb24gPz8gdW5kZWZpbmVkO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIGNvbnRleHRBdHRyaWJ1dGlvbiBSUEMgZmFpbGVkOiAke2dldEVycm9yTWVzc2FnZShlcnIpfWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCFhdHRyaWJ1dGlvbikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIGNvbnRleHRBdHRyaWJ1dGlvbjogbnVsbC9lbXB0eWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2xvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSA8PSBMb2dMZXZlbC5UcmFjZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIGNvbnRleHRBdHRyaWJ1dGlvbjogdG90YWxUb2tlbnM9JHthdHRyaWJ1dGlvbi50b3RhbFRva2Vuc30sIGVudHJpZXM9JHtKU09OLnN0cmluZ2lmeShhdHRyaWJ1dGlvbi5lbnRyaWVzLm1hcChlID0+ICh7IGtpbmQ6IGUua2luZCwgaWQ6IGUuaWQsIGxhYmVsOiBlLmxhYmVsLCB0b2tlbnM6IGUudG9rZW5zLCBwYXJlbnRJZDogZS5wYXJlbnRJZCB9KSkpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gYXR0cmlidXRpb247XG5cdH1cblxuXHRwcml2YXRlIF9jb21wbGV0ZUFjdGl2ZVR1cm4oKTogdm9pZCB7XG5cdFx0Y29uc3QgdHVybiA9IHRoaXMuX2N1cnJlbnRUdXJuO1xuXHRcdGlmICghdHVybikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0dXJuLm1hcmtDb21wbGV0ZWQoKTtcblx0XHR0aGlzLl9yZXBvcnRUb29sQ2FsbERldGFpbHModHVybiwgJ3N1Y2Nlc3MnKTtcblx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdHR1cm5JZDogdHVybi5pZCxcblx0XHRcdGR1cmF0aW9uOiB0dXJuLmR1cmF0aW9uLFxuXHRcdH0pO1xuXHRcdHRoaXMuX2NsZWFyQWN0aXZlVHVybigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERyb3BzIHRoZSBhY3RpdmUgdHVybiBhbmQgcmVwb3J0cyB0aGF0IHRoaXMgY2hhdCBpcyBub3cgaWRsZS4gRXZlcnlcblx0ICogdHJhbnNpdGlvbiBvdXQgb2YgYW4gaW4tZmxpZ2h0IHR1cm4gbXVzdCBnbyB0aHJvdWdoIGhlcmUgc28gd29yayB0aGVcblx0ICogYWdlbnQgZGVmZXJzIHdoaWxlIGEgdHVybiBydW5zIFx1MjAxNCBub3RhYmx5IGEgcGVuZGluZyBDTEkgY2xpZW50IHJlc3RhcnQgXHUyMDE0XG5cdCAqIGlzIG5vdCBzdHJhbmRlZCB3YWl0aW5nIG9uIGEgdHVybiB0aGF0IGFscmVhZHkgZW5kZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9jbGVhckFjdGl2ZVR1cm4oKTogdm9pZCB7XG5cdFx0dGhpcy5fY3VycmVudFR1cm4gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc3RyZWFtaW5nVG9vbENhbGxzLmNsZWFyKCk7XG5cdFx0dGhpcy5fc3RyZWFtaW5nVG9vbERpc3BsYXlTY2hlZHVsZXJzLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9vblR1cm5FbmRlZCgpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gVGhlIHR1cm4gaXMgYWxyZWFkeSBjbGVhcmVkLCBzbyB0aGUgc2Vzc2lvbidzIG93biBzdGF0ZSBpc1xuXHRcdFx0Ly8gY29uc2lzdGVudC4gQ29udGFpbiB0aGUgZmFpbHVyZSB0byB0aGUgYWdlbnQncyBib29ra2VlcGluZyByYXRoZXJcblx0XHRcdC8vIHRoYW4gbGV0dGluZyBpdCBlc2NhcGUgaW50byBTREsgZXZlbnQgaGFuZGxpbmcgXHUyMDE0IG9yLCBvbiB0aGVcblx0XHRcdC8vIGBzZW5kKClgIGZhaWx1cmUgcGF0aCwgcmVwbGFjZSB0aGUgZXJyb3Igd2UgYXJlIHByb3BhZ2F0aW5nLlxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIsIGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gb25UdXJuRW5kZWQgY2FsbGJhY2sgZmFpbGVkYCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVwb3J0VG9vbENhbGxEZXRhaWxzKHR1cm46IENvcGlsb3RUdXJuLCByZXNwb25zZVR5cGU6ICdzdWNjZXNzJyB8ICdjYW5jZWxsZWQnIHwgJ2ZhaWxlZCcpOiB2b2lkIHtcblx0XHRpZiAodHVybi50b29sQ2FsbERldGFpbHNSZXBvcnRlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0dXJuLnRvb2xDYWxsRGV0YWlsc1JlcG9ydGVkID0gdHJ1ZTtcblx0XHR2b2lkIHRoaXMuX3RlbGVtZXRyeVJlcG9ydGVyLnRvb2xDYWxsRGV0YWlscyh7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0c2Vzc2lvbjogdGhpcy5zZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHR0dXJuSWQ6IHR1cm4uaWQsXG5cdFx0XHRjbGllbnRUeXBlOiB0dXJuLmNsaWVudFR5cGUsXG5cdFx0XHRtb2RlbDogdHVybi5sYXN0TW9kZWwsXG5cdFx0XHRyZXNwb25zZVR5cGUsXG5cdFx0XHR0b29sQ291bnRzOiBPYmplY3QuZnJvbUVudHJpZXModHVybi50b29sQ291bnRzKSxcblx0XHRcdGF2YWlsYWJsZVRvb2xzOiB0aGlzLl9hcHBsaWVkU25hcHNob3QudG9vbHMubWFwKHRvb2wgPT4gdG9vbC5uYW1lKSxcblx0XHRcdG51bVJlcXVlc3RzOiB0dXJuLnRvb2xDYWxsUm91bmRzLFxuXHRcdFx0dHVybkluZGV4OiB0dXJuLm9yZGluYWwsXG5cdFx0XHR0dXJuRHVyYXRpb246IHR1cm4uZHVyYXRpb24sXG5cdFx0XHRtZXNzYWdlQ2hhckxlbjogdHVybi5tZXNzYWdlQ2hhckxlbixcblx0XHRcdHRvdGFsVG9vbENhbGxzOiB0dXJuLnRvdGFsVG9vbENhbGxzLFxuXHRcdFx0cGFyYWxsZWxUb29sQ2FsbFJvdW5kczogdHVybi5wYXJhbGxlbFRvb2xDYWxsUm91bmRzLFxuXHRcdFx0cGFyYWxsZWxUb29sQ2FsbHNUb3RhbDogdHVybi5wYXJhbGxlbFRvb2xDYWxsc1RvdGFsLFxuXHRcdH0pLmNhdGNoKGVyciA9PiB0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gVGVsZW1ldHJ5IGVtaXNzaW9uIGZhaWxlZDogJHtnZXRFcnJvck1lc3NhZ2UoZXJyKX1gKSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXBvcnRUb29sQXBwcm92YWwodG9vbENhbGxJZDogc3RyaW5nLCB0b29sTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBtY3BTZXJ2ZXJOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCByZWNvcmQgPSB0aGlzLl90b29sQXBwcm92YWxSZWNvcmRzLmdldCh0b29sQ2FsbElkKTtcblx0XHRpZiAoIXRvb2xOYW1lIHx8IGlzSGlkZGVuVG9vbCh0b29sTmFtZSkgfHwgcmVjb3JkPy5yZXBvcnRlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb25maXJtS2luZCA9IG1hcFBlcm1pc3Npb25SZXN1bHRUb0NvbmZpcm1LaW5kKHJlY29yZD8ucmVzdWx0S2luZCwgcmVjb3JkPy5yZXNvbHZlZEJ5SG9vayA9PT0gdHJ1ZSk7XG5cdFx0dGhpcy5fdGVsZW1ldHJ5UmVwb3J0ZXIudG9vbEFwcHJvdmFsKHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRzZXNzaW9uOiB0aGlzLnNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0dG9vbElkOiB0b29sTmFtZSxcblx0XHRcdHRvb2xTb3VyY2VLaW5kOiB0aGlzLl90b29sU291cmNlS2luZEZvcih0b29sTmFtZSwgbWNwU2VydmVyTmFtZSksXG5cdFx0XHRjb25maXJtS2luZCxcblx0XHRcdGNvbmZpcm1hdGlvbk5vdE5lZWRlZFJlYXNvbjogY29uZmlybUtpbmQgPT09ICdjb25maXJtYXRpb25Ob3ROZWVkZWQnICYmIHJlY29yZD8ucmVzb2x2ZWRCeUhvb2sgPyAnb3RoZXInIDogdW5kZWZpbmVkLFxuXHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uOiByZWNvcmQ/LnJlcXVlc3RTYW5kYm94QnlwYXNzID8gdHJ1ZSA6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRpZiAocmVjb3JkKSB7XG5cdFx0XHRyZWNvcmQucmVwb3J0ZWQgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlcG9ydFRvb2xBcHByb3ZhbElmTm9QZXJtaXNzaW9uKHRvb2xDYWxsSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHJlY29yZCA9IHRoaXMuX3Rvb2xBcHByb3ZhbFJlY29yZHMuZ2V0KHRvb2xDYWxsSWQpO1xuXHRcdGlmIChyZWNvcmQgJiYgIXJlY29yZC5wZXJtaXNzaW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aGlzLl9yZXBvcnRUb29sQXBwcm92YWwodG9vbENhbGxJZCwgcmVjb3JkLnRvb2xOYW1lLCByZWNvcmQubWNwU2VydmVyTmFtZSk7XG5cdFx0fVxuXHR9XG5cdHByaXZhdGUgX3Rvb2xTb3VyY2VLaW5kRm9yKHRvb2xOYW1lOiBzdHJpbmcsIG1jcFNlcnZlck5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0aWYgKG1jcFNlcnZlck5hbWUpIHtcblx0XHRcdHJldHVybiAnbWNwJztcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NsaWVudFRvb2xOYW1lcy5oYXModG9vbE5hbWUpKSB7XG5cdFx0XHRyZXR1cm4gJ2NsaWVudCc7XG5cdFx0fVxuXHRcdHJldHVybiAnaW50ZXJuYWwnO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RWRpdEZpbGVQYXRocyhwYXJhbWV0ZXJzOiB1bmtub3duKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBnZXRFZGl0RmlsZVBhdGhzKHBhcmFtZXRlcnMpLm1hcChwYXRoID0+IHRoaXMuX3Jlc29sdmVFZGl0RmlsZVBhdGgocGF0aCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZUVkaXRGaWxlUGF0aChwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmIChpc0Fic29sdXRlKHBhdGgpIHx8ICF0aGlzLl93b3JraW5nRGlyZWN0b3J5IHx8IHRoaXMuX3dvcmtpbmdEaXJlY3Rvcnkuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdHJldHVybiBwYXRoO1xuXHRcdH1cblx0XHRyZXR1cm4gam9pbih0aGlzLl93b3JraW5nRGlyZWN0b3J5LmZzUGF0aCwgcGF0aCk7XG5cdH1cblxuXHQvKipcblx0ICogRW1pdHMgYSBzeW50aGV0aWMgbWFya2Rvd24gY29udGVudCBibG9jayBmb3IgdGhlIGFjdGl2ZSB0dXJuIGFuZFxuXHQgKiBtYWtlcyBpdCB0aGUgY3VycmVudCBtYXJrZG93biByZXNwb25zZSBwYXJ0IHNvIHRoYXQgc3Vic2VxdWVudCBTREtcblx0ICogZGVsdGFzIGFwcGVuZCB0byBpdC4gVXNlZCBieSB0aGUgYWdlbnQgdG8gc3VyZmFjZSBvbmUtc2hvdCBob3N0XG5cdCAqIG1lc3NhZ2VzIChlLmcuIHRoZSB3b3JrdHJlZS1jcmVhdGVkIGFubm91bmNlbWVudCkgYXQgdGhlIHRvcCBvZiB0aGVcblx0ICogZmlyc3QgcmVzcG9uc2UuXG5cdCAqL1xuXHRlbWl0SW5pdGlhbE1hcmtkb3duKGNvbnRlbnQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2VtaXRNYXJrZG93bkRlbHRhKGNvbnRlbnQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVtaXRzIGEgc3RyZWFtaW5nIHRleHQgZGVsdGEuIFRoZSBmaXJzdCBkZWx0YSBvZiBhIHR1cm4gYWxsb2NhdGVzIGFcblx0ICogbWFya2Rvd24gcmVzcG9uc2UgcGFydDsgc3Vic2VxdWVudCBkZWx0YXMgYXBwZW5kIHRvIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBfZW1pdE1hcmtkb3duRGVsdGEoY29udGVudDogc3RyaW5nLCBwYXJlbnRUb29sQ2FsbElkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdHVybiA9IHRoaXMuX2N1cnJlbnRUdXJuO1xuXHRcdGlmICghdHVybikge1xuXHRcdFx0Ly8gQSBtYXJrZG93biBkZWx0YSBzaG91bGQgb25seSBldmVyIGFycml2ZSB3aGlsZSBhIHR1cm4gaXMgYWN0aXZlLlxuXHRcdFx0Ly8gV2l0aG91dCBhIHR1cm4gd2UgY2FuJ3QgcGVyc2lzdCB0aGUgcGFydCBpZCAoc28gZXZlcnkgZGVsdGEgd291bGRcblx0XHRcdC8vIGFsbG9jYXRlIGEgZnJlc2ggcGFydCkgYW5kIHRoZSBhY3Rpb24gd291bGQgY2FycnkgYW4gZW1wdHkgdHVybklkLlxuXHRcdFx0Ly8gRHJvcCBpdCBhbmQgc3VyZmFjZSB0aGUgdW5leHBlY3RlZCBzdGF0ZS5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBNYXJrZG93biBkZWx0YSBlbWl0dGVkIHdpdGggbm8gYWN0aXZlIHR1cm47IGRyb3BwaW5nYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG1hcmtkb3duU2NvcGUgPSBwYXJlbnRUb29sQ2FsbElkID8/ICcnO1xuXHRcdGxldCBwYXJ0SWQgPSB0dXJuLm1hcmtkb3duUGFydElkcy5nZXQobWFya2Rvd25TY29wZSk7XG5cdFx0aWYgKCFwYXJ0SWQpIHtcblx0XHRcdHBhcnRJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0dHVybi5tYXJrZG93blBhcnRJZHMuc2V0KG1hcmtkb3duU2NvcGUsIHBhcnRJZCk7XG5cdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LFxuXHRcdFx0XHR0dXJuSWQ6IHR1cm4uaWQsXG5cdFx0XHRcdHBhcnQ6IHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6IHBhcnRJZCwgY29udGVudCB9LFxuXHRcdFx0fSwgcGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0RGVsdGEsXG5cdFx0XHR0dXJuSWQ6IHR1cm4uaWQsXG5cdFx0XHRwYXJ0SWQsXG5cdFx0XHRjb250ZW50LFxuXHRcdH0sIHBhcmVudFRvb2xDYWxsSWQpO1xuXHR9XG5cblx0LyoqIEVtaXRzIGEgcmVhc29uaW5nIGRlbHRhLCBzaW1pbGFyIHRvIHtAbGluayBfZW1pdE1hcmtkb3duRGVsdGF9IGJ1dCBmb3IgcmVhc29uaW5nIHBhcnRzLiAqL1xuXHRwcml2YXRlIF9lbWl0UmVhc29uaW5nRGVsdGEoY29udGVudDogc3RyaW5nLCBwYXJlbnRUb29sQ2FsbElkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdHVybiA9IHRoaXMuX2N1cnJlbnRUdXJuO1xuXHRcdGlmICghdHVybikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIFJlYXNvbmluZyBkZWx0YSBlbWl0dGVkIHdpdGggbm8gYWN0aXZlIHR1cm47IGRyb3BwaW5nYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlYXNvbmluZ1Njb3BlID0gcGFyZW50VG9vbENhbGxJZCA/PyAnJztcblx0XHRsZXQgcGFydElkID0gdHVybi5yZWFzb25pbmdQYXJ0SWRzLmdldChyZWFzb25pbmdTY29wZSk7XG5cdFx0aWYgKCFwYXJ0SWQpIHtcblx0XHRcdHBhcnRJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0dHVybi5yZWFzb25pbmdQYXJ0SWRzLnNldChyZWFzb25pbmdTY29wZSwgcGFydElkKTtcblx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQsXG5cdFx0XHRcdHR1cm5JZDogdHVybi5pZCxcblx0XHRcdFx0cGFydDogeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZywgaWQ6IHBhcnRJZCwgY29udGVudCB9LFxuXHRcdFx0fSwgcGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UmVhc29uaW5nLFxuXHRcdFx0dHVybklkOiB0dXJuLmlkLFxuXHRcdFx0cGFydElkLFxuXHRcdFx0Y29udGVudCxcblx0XHR9LCBwYXJlbnRUb29sQ2FsbElkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgc25hcHNob3Qgb2YgY2xpZW50IGNvbnRyaWJ1dGlvbnMgY2FwdHVyZWQgd2hlbiB0aGlzIHNlc3Npb24gd2FzXG5cdCAqIGNyZWF0ZWQuIFVzZWQgYnkgdGhlIGFnZW50IHRvIGRldGVjdCB3aGVuIHRoZSBzZXNzaW9uIGlzIDFzdGFsZS5cblx0ICovXG5cdGdldCBhcHBsaWVkU25hcHNob3QoKTogSUFjdGl2ZUNsaWVudFNuYXBzaG90IHtcblx0XHRyZXR1cm4gdGhpcy5fYXBwbGllZFNuYXBzaG90O1xuXHR9XG5cblx0Z2V0IGN1c3RvbWl6YXRpb25EaXJlY3RvcnkoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY3VzdG9taXphdGlvbkRpcmVjdG9yeTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIFNESyB7QGxpbmsgVG9vbH0gb2JqZWN0cyBmb3IgdGhlIGNsaWVudC1wcm92aWRlZCB0b29scyBpbiB0aGVcblx0ICogYXBwbGllZCBzbmFwc2hvdC4gVGhlIGhhbmRsZXIgcGFya3MgYSByZXF1ZXN0IGluXG5cdCAqIHtAbGluayBfcGVuZGluZ0NsaWVudFRvb2xDYWxsc30gYW5kIHdhaXRzIGZvciB0aGUgY2xpZW50IHRvIGRpc3BhdGNoXG5cdCAqIGBzZXNzaW9uL3Rvb2xDYWxsQ29tcGxldGVgLlxuXHQgKi9cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0cHJpdmF0ZSBfY3JlYXRlQ2xpZW50U2RrVG9vbHMoKTogVG9vbDxhbnk+W10ge1xuXHRcdGNvbnN0IHRvb2xzID0gdGhpcy5fYXBwbGllZFNuYXBzaG90LnRvb2xzO1xuXHRcdGlmICh0b29scy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgdG9vbFNlYXJjaEFjdGl2ZSA9IHRoaXMuX2lzVG9vbFNlYXJjaEFjdGl2ZSgpO1xuXHRcdGNvbnN0IHNlc3Npb25Ub29scyA9IHRvb2xTZWFyY2hBY3RpdmVcblx0XHRcdD8gdG9vbHNcblx0XHRcdDogdG9vbHMuZmlsdGVyKGRlZiA9PiBkZWYubmFtZSAhPT0gQ0xJRU5UX1RPT0xfU0VBUkNIX1JFRkVSRU5DRV9OQU1FKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdHJldHVybiBzZXNzaW9uVG9vbHMubWFwKChkZWYpOiBUb29sPGFueT4gPT4ge1xuXHRcdFx0aWYgKHRvb2xTZWFyY2hBY3RpdmUgJiYgZGVmLm5hbWUgPT09IENMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG5hbWU6IFJVTlRJTUVfVE9PTF9TRUFSQ0hfVE9PTF9OQU1FLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBkZWYuZGVzY3JpcHRpb24gPz8gJycsXG5cdFx0XHRcdFx0cGFyYW1ldGVyczogZGVmLmlucHV0U2NoZW1hID8/IHsgdHlwZTogJ29iamVjdCcgYXMgY29uc3QsIHByb3BlcnRpZXM6IHt9IH0sXG5cdFx0XHRcdFx0b3ZlcnJpZGVzQnVpbHRJblRvb2w6IHRydWUsXG5cdFx0XHRcdFx0ZGVmZXI6ICduZXZlcicsXG5cdFx0XHRcdFx0c2tpcFBlcm1pc3Npb246IHRydWUsXG5cdFx0XHRcdFx0aGFuZGxlcjogdGhpcy5fZ3VhcmRlZChhc3luYyAoX2FyZ3M6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBpbnZvY2F0aW9uKSA9PiB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjYW5kaWRhdGVzID0gdGhpcy5fdG9Ub29sU2VhcmNoQ2FuZGlkYXRlcyhpbnZvY2F0aW9uLmF2YWlsYWJsZVRvb2xzKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY2xpZW50UmVzdWx0ID0gYXdhaXQgdGhpcy5fcGVuZGluZ0NsaWVudFRvb2xDYWxscy5yZWdpc3RlckFuZEZpcmUoXG5cdFx0XHRcdFx0XHRcdFx0aW52b2NhdGlvbi50b29sQ2FsbElkLFxuXHRcdFx0XHRcdFx0XHRcdCgpID0+IHRoaXMuX2VtaXRUb29sU2VhcmNoUmVhZHkoaW52b2NhdGlvbi50b29sQ2FsbElkLCBjYW5kaWRhdGVzKSxcblx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3RvVG9vbFNlYXJjaFJlc3VsdChjbGllbnRSZXN1bHQsIGludm9jYXRpb24uYXZhaWxhYmxlVG9vbHMpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnJvciwgYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBGYWlsZWQgaW4gdG9vbC1zZWFyY2ggaGFuZGxlcjogdG9vbENhbGxJZD0ke2ludm9jYXRpb24udG9vbENhbGxJZH1gKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3Rvb2xTZWFyY2hGYWlsdXJlKGdldEVycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sIHRoaXMuX3Rvb2xTZWFyY2hGYWlsdXJlKCdUb29sIGNhbGwgY2FuY2VsbGVkOiBzZXNzaW9uIGlzIGFib3J0aW5nJyksICd0b29sLXNlYXJjaCcpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGVmZXI6ICdhdXRvJyB8ICduZXZlcicgfCB1bmRlZmluZWQgPSB0b29sU2VhcmNoQWN0aXZlXG5cdFx0XHRcdD8gKE5PTl9ERUZFUlJFRF9DTElFTlRfVE9PTF9OQU1FUy5oYXMoZGVmLm5hbWUpID8gJ25ldmVyJyA6ICdhdXRvJylcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRuYW1lOiBkZWYubmFtZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGRlZi5kZXNjcmlwdGlvbiA/PyAnJyxcblx0XHRcdFx0cGFyYW1ldGVyczogZGVmLmlucHV0U2NoZW1hID8/IHsgdHlwZTogJ29iamVjdCcgYXMgY29uc3QsIHByb3BlcnRpZXM6IHt9IH0sXG5cdFx0XHRcdGRlZmVyLFxuXHRcdFx0XHRoYW5kbGVyOiB0aGlzLl9ndWFyZGVkKGFzeW5jIChfYXJnczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHsgdG9vbENhbGxJZCB9KSA9PiB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9wZW5kaW5nQ2xpZW50VG9vbENhbGxzLnJlZ2lzdGVyKHRvb2xDYWxsSWQpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVycm9yLCBgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEZhaWxlZCBpbiBjbGllbnQgdG9vbCBoYW5kbGVyOiB0b29sPSR7ZGVmLm5hbWV9LCB0b29sQ2FsbElkPSR7dG9vbENhbGxJZH1gKTtcblx0XHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgdGhpcy5fdG9vbFNlYXJjaEZhaWx1cmUoJ1Rvb2wgY2FsbCBjYW5jZWxsZWQ6IHNlc3Npb24gaXMgYWJvcnRpbmcnKSwgJ2NsaWVudC10b29sJyksXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNUb29sU2VhcmNoQWN0aXZlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl90b29sU2VhcmNoQWN0aXZlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX2Fib3J0VG9rZW4oKTogQ2FuY2VsbGF0aW9uVG9rZW4ge1xuXHRcdHJldHVybiB0aGlzLl9hYm9ydEN0cy52YWx1ZT8udG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uQ2FuY2VsbGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfYmVnaW5BYm9ydCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYWJvcnRUb2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9hYm9ydEN0cy52YWx1ZT8uY2FuY2VsKCk7XG5cdFx0dGhpcy5fY2FuY2VsQWxsUGVuZGluZ0ludGVyYWN0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzZXRBYm9ydFRva2VuKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Fib3J0Q3RzLnZhbHVlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdH1cblxuXHQvKipcblx0ICogR3VhcmRzIFNESyBjYWxsYmFja3MgYWdhaW5zdCBhYm9ydHM6IHRoZSBzeW5jaHJvbm91cyBwcmUtY2hlY2sgYXZvaWRzIHRoZSBgc2hvcnRjdXRFdmVudGAgbWFjcm90YXNrIGZvciBhbHJlYWR5LWNhbmNlbGxlZCB0b2tlbnMsIHdoaWxlIHRoZSByYWNlIHJlbGVhc2VzIGNhbGxiYWNrcyB0aGF0IHBhcmsgYWZ0ZXIgdGhlIGFib3J0IHN3ZWVwLlxuXHQgKiBUaGUgcG9zdC1yYWNlIGNoZWNrIGNhdGNoZXMgaGFuZGxlciBjb21wbGV0aW9ucyB0aGF0IHdpbiB0aGUgY2FuY2VsbGF0aW9uIG1hY3JvdGFzayBiZWNhdXNlIHByb21pc2UgY29udGludWF0aW9ucyBydW4gYXMgbWljcm90YXNrcy5cblx0ICovXG5cdHByaXZhdGUgX2d1YXJkZWQ8QSBleHRlbmRzIHVua25vd25bXSwgUj4oaGFuZGxlcjogKC4uLmFyZ3M6IEEpID0+IFByb21pc2U8Uj4sIGNhbmNlbGxlZDogUiwgbGFiZWw6IHN0cmluZyk6ICguLi5hcmdzOiBBKSA9PiBQcm9taXNlPFI+IHtcblx0XHRyZXR1cm4gYXN5bmMgKC4uLmFyZ3MpID0+IHtcblx0XHRcdGNvbnN0IHRva2VuID0gdGhpcy5fYWJvcnRUb2tlbjtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBEaXNjYXJkaW5nICR7bGFiZWx9IGNhbGxiYWNrIHJlY2VpdmVkIHdoaWxlIGFib3J0aW5nYCk7XG5cdFx0XHRcdHJldHVybiBjYW5jZWxsZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByYWNlQ2FuY2VsbGF0aW9uKGhhbmRsZXIoLi4uYXJncyksIHRva2VuLCBjYW5jZWxsZWQpO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIERpc2NhcmRpbmcgJHtsYWJlbH0gY2FsbGJhY2sgcmVzdWx0IGFmdGVyIGFib3J0YCk7XG5cdFx0XHRcdHJldHVybiBjYW5jZWxsZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9jbGllbnRUb29sTmFtZSh0b29sTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5faXNUb29sU2VhcmNoQWN0aXZlKClcblx0XHRcdCYmIHRvb2xOYW1lID09PSBSVU5USU1FX1RPT0xfU0VBUkNIX1RPT0xfTkFNRVxuXHRcdFx0PyBDTElFTlRfVE9PTF9TRUFSQ0hfUkVGRVJFTkNFX05BTUVcblx0XHRcdDogdG9vbE5hbWU7XG5cdH1cblxuXHRwcml2YXRlIF90b1Rvb2xTZWFyY2hDYW5kaWRhdGVzKGF2YWlsYWJsZVRvb2xzOiByZWFkb25seSBDdXJyZW50VG9vbE1ldGFkYXRhW10gfCB1bmRlZmluZWQpOiByZWFkb25seSBJVG9vbFNlYXJjaENhbmRpZGF0ZVtdIHtcblx0XHRyZXR1cm4gKGF2YWlsYWJsZVRvb2xzID8/IFtdKVxuXHRcdFx0LmZpbHRlcih0b29sID0+IHRvb2wuZGVmZXJMb2FkaW5nKVxuXHRcdFx0Lm1hcCh0b29sID0+ICh7XG5cdFx0XHRcdG5hbWU6IHRvb2wubmFtZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHRvb2wuZGVzY3JpcHRpb24gPz8gJycsXG5cdFx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9lbWl0VG9vbFNlYXJjaFJlYWR5KHRvb2xDYWxsSWQ6IHN0cmluZywgY2FuZGlkYXRlczogcmVhZG9ubHkgSVRvb2xTZWFyY2hDYW5kaWRhdGVbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHRyYWNrZWQgPSB0aGlzLl9hY3RpdmVUb29sQ2FsbHMuZ2V0KHRvb2xDYWxsSWQpO1xuXHRcdGlmICghdHJhY2tlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUb29sLXNlYXJjaCBjYWxsICcke3Rvb2xDYWxsSWR9JyB3YXMgbm90IHRyYWNrZWQuYCk7XG5cdFx0fVxuXHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdC4uLih0cmFja2VkLmNvbnRyaWJ1dG9yID8geyBjb250cmlidXRvcjogdHJhY2tlZC5jb250cmlidXRvciB9IDoge30pLFxuXHRcdFx0Li4uKHRyYWNrZWQuaW50ZW50aW9uICE9PSB1bmRlZmluZWQgPyB7IGludGVudGlvbjogdHJhY2tlZC5pbnRlbnRpb24gfSA6IHt9KSxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBnZXRJbnZvY2F0aW9uTWVzc2FnZSh0cmFja2VkLnRvb2xOYW1lLCB0cmFja2VkLmRpc3BsYXlOYW1lLCB0cmFja2VkLnBhcmFtZXRlcnMsIHBhdGggPT4gdGhpcy5fcmVzb2x2ZUVkaXRGaWxlUGF0aChwYXRoKSksXG5cdFx0XHR0b29sSW5wdXQ6IGdldFRvb2xJbnB1dFN0cmluZyh0cmFja2VkLnRvb2xOYW1lLCB0cmFja2VkLnBhcmFtZXRlcnMsIHRyYWNrZWQucGFyYW1ldGVycyA/IHRyeVN0cmluZ2lmeSh0cmFja2VkLnBhcmFtZXRlcnMpIDogdW5kZWZpbmVkKSxcblx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0X21ldGE6IHRvVG9vbENhbGxNZXRhKHsgLi4uKHRyYWNrZWQubWV0YSA/PyB7fSksIHRvb2xTZWFyY2hDYW5kaWRhdGVzOiBjYW5kaWRhdGVzIH0pLFxuXHRcdH0sIHRyYWNrZWQucGFyZW50VG9vbENhbGxJZCk7XG5cdH1cblxuXHRwcml2YXRlIF90b29sU2VhcmNoRmFpbHVyZShtZXNzYWdlOiBzdHJpbmcpOiBUb29sUmVzdWx0T2JqZWN0IHtcblx0XHRyZXR1cm4geyB0ZXh0UmVzdWx0Rm9yTGxtOiBtZXNzYWdlLCByZXN1bHRUeXBlOiAnZmFpbHVyZScsIGVycm9yOiBtZXNzYWdlLCB0b29sUmVmZXJlbmNlczogW10gfTtcblx0fVxuXG5cdHByaXZhdGUgX3RvVG9vbFNlYXJjaFJlc3VsdChjbGllbnRSZXN1bHQ6IFRvb2xSZXN1bHRPYmplY3QsIGF2YWlsYWJsZVRvb2xzOiByZWFkb25seSBDdXJyZW50VG9vbE1ldGFkYXRhW10gfCB1bmRlZmluZWQpOiBUb29sUmVzdWx0T2JqZWN0IHtcblx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgdG9vbCBvZiBhdmFpbGFibGVUb29scyA/PyBbXSkge1xuXHRcdFx0aWYgKHRvb2wuZGVmZXJMb2FkaW5nKSB7XG5cdFx0XHRcdGRlZmVycmVkLmFkZCh0b29sLm5hbWUpO1xuXHRcdFx0XHRpZiAodG9vbC5uYW1lc3BhY2VkTmFtZSkge1xuXHRcdFx0XHRcdGRlZmVycmVkLmFkZCh0b29sLm5hbWVzcGFjZWROYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBjbGllbnROYW1lcyA9IHRoaXMuX3BhcnNlVG9vbFNlYXJjaE5hbWVzKGNsaWVudFJlc3VsdC50ZXh0UmVzdWx0Rm9yTGxtKTtcblx0XHRjb25zdCB0b29sUmVmZXJlbmNlcyA9IGNsaWVudE5hbWVzLmZpbHRlcihuYW1lID0+IGRlZmVycmVkLmhhcyhuYW1lKSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gdG9vbF9zZWFyY2ggb3ZlcnJpZGU6IGF2YWlsYWJsZVRvb2xzPSR7YXZhaWxhYmxlVG9vbHM/Lmxlbmd0aCA/PyAwfSwgZGVmZXJyZWQ9JHtkZWZlcnJlZC5zaXplfSwgY2xpZW50TWF0Y2hlZD1bJHtjbGllbnROYW1lcy5qb2luKCcsICcpfV0gLT4gdG9vbFJlZmVyZW5jZXM9WyR7dG9vbFJlZmVyZW5jZXMuam9pbignLCAnKX1dYCk7XG5cdFx0cmV0dXJuIHsgLi4uY2xpZW50UmVzdWx0LCB0b29sUmVmZXJlbmNlcyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2VUb29sU2VhcmNoTmFtZXModGV4dDogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHRleHQpO1xuXHRcdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkocGFyc2VkKSA/IHBhcnNlZC5maWx0ZXIoKG5hbWUpOiBuYW1lIGlzIHN0cmluZyA9PiB0eXBlb2YgbmFtZSA9PT0gJ3N0cmluZycpIDogW107XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkcyBTREsgdG9vbCBoYW5kbGVycyBmb3IgdGhlIGFnZW50IGhvc3QncyBzZXJ2ZXIgdG9vbHMuIEVhY2ggaGFuZGxlclxuXHQgKiBleGVjdXRlcyB0aGUgdG9vbCBhZ2FpbnN0IHRoaXMgc2Vzc2lvbidzIHN0YXRlIHZpYSB0aGVcblx0ICoge0BsaW5rIElBZ2VudFNlcnZlclRvb2xIb3N0fSBhbmQgcmV0dXJucyBpdHMgdGV4dHVhbCByZXN1bHQuIFJldHVybnMgYW5cblx0ICogZW1wdHkgbGlzdCB3aGVuIG5vIHNlcnZlci10b29sIGhvc3QgaXMgd2lyZWQgKGUuZy4gdGVzdCAvIHN0YW5kYWxvbmVcblx0ICogY29uc3RydWN0aW9uKS5cblx0ICovXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdHByaXZhdGUgX2NyZWF0ZVNlcnZlclNka1Rvb2xzKCk6IFRvb2w8YW55PltdIHtcblx0XHRjb25zdCBob3N0ID0gdGhpcy5fc2VydmVyVG9vbEhvc3Q7XG5cdFx0aWYgKCFob3N0KSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiBob3N0LmRlZmluaXRpb25zLm1hcChkZWYgPT4gKHtcblx0XHRcdG5hbWU6IGRlZi5uYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IGRlZi5kZXNjcmlwdGlvbiA/PyAnJyxcblx0XHRcdHBhcmFtZXRlcnM6IGRlZi5pbnB1dFNjaGVtYSA/PyB7IHR5cGU6ICdvYmplY3QnIGFzIGNvbnN0LCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdFx0ZGVmZXI6ICduZXZlcicgYXMgY29uc3QsXG5cdFx0XHRoYW5kbGVyOiBhc3luYyAoYXJnczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBQcm9taXNlPFRvb2xSZXN1bHRPYmplY3Q+ID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCB0ZXh0ID0gaG9zdC5leGVjdXRlVG9vbCh0aGlzLl9jaGF0Q2hhbm5lbFVyaS50b1N0cmluZygpLCBkZWYubmFtZSwgYXJncyk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdGV4dFJlc3VsdEZvckxsbTogYXdhaXQgdGV4dCwgcmVzdWx0VHlwZTogJ3N1Y2Nlc3MnIH07XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVycm9yLCBgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEZhaWxlZCBpbiBzZXJ2ZXIgdG9vbCBoYW5kbGVyOiB0b29sPSR7ZGVmLm5hbWV9YCk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdGV4dFJlc3VsdEZvckxsbTogbWVzc2FnZSwgcmVzdWx0VHlwZTogJ2ZhaWx1cmUnLCBlcnJvcjogbWVzc2FnZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyBhIHBlbmRpbmcgY2xpZW50IHRvb2wgY2FsbC4gSWYgdGhlIFNESyBoYW5kbGVyIGhhcyBub3QgeWV0XG5cdCAqIHJlZ2lzdGVyZWQgZm9yIGB0b29sQ2FsbElkYCwgdGhlIHJlc3VsdCBpcyBidWZmZXJlZCBzbyB0aGUgaGFuZGxlclxuXHQgKiByZXNvbHZlcyBpbW1lZGlhdGVseSBvbmNlIGl0IGRvZXMuXG5cdCAqL1xuXHRoYW5kbGVDbGllbnRUb29sQ2FsbENvbXBsZXRlKHRvb2xDYWxsSWQ6IHN0cmluZywgcmVzdWx0OiBUb29sQ2FsbFJlc3VsdCkge1xuXHRcdHRoaXMuX2FwcHJvdmVkRHVwbGljYWJsZVBlcm1pc3Npb25TaWduYXR1cmVzLmRlbGV0ZSh0b29sQ2FsbElkKTtcblx0XHRpZiAoIXJlc3VsdC5zdWNjZXNzICYmIHRoaXMuX2NhbmNlbE1jcEF1dGhlbnRpY2F0aW9uRm9yVG9vbENhbGwodG9vbENhbGxJZCkpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZVRvb2xDYWxscy5kZWxldGUodG9vbENhbGxJZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRleHRDb250ZW50ID0gcmVzdWx0LmNvbnRlbnRcblx0XHRcdD8uZmlsdGVyKGMgPT4gYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dClcblx0XHRcdC5tYXAoYyA9PiBjLnRleHQpXG5cdFx0XHQuam9pbignXFxuJykgPz8gJyc7XG5cblx0XHRjb25zdCBiaW5hcnlSZXN1bHRzID0gcmVzdWx0LmNvbnRlbnRcblx0XHRcdD8uZmlsdGVyKGMgPT4gYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuRW1iZWRkZWRSZXNvdXJjZSlcblx0XHRcdC5tYXAoYyA9PiAoeyBkYXRhOiBjLmRhdGEsIG1pbWVUeXBlOiBjLmNvbnRlbnRUeXBlLCB0eXBlOiAoL15pbWFnZShcXC98JCkvLnRlc3QoYy5jb250ZW50VHlwZSkgPyAnaW1hZ2UnIDogJ3Jlc291cmNlJykgYXMgJ2ltYWdlJyB8ICdyZXNvdXJjZScgfSkpO1xuXHRcdGNvbnN0IHRleHRSZXN1bHRGb3JMbG0gPSB0ZXh0Q29udGVudC50cmltKCkgPyB0ZXh0Q29udGVudCA6IGdldEVtcHR5VG9vbFJlc3VsdFRleHQoYmluYXJ5UmVzdWx0cyk7XG5cblx0XHRpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdDbGllbnRUb29sQ2FsbHMucmVzcG9uZE9yQnVmZmVyKHRvb2xDYWxsSWQsIHtcblx0XHRcdFx0dGV4dFJlc3VsdEZvckxsbSxcblx0XHRcdFx0cmVzdWx0VHlwZTogJ3N1Y2Nlc3MnLFxuXHRcdFx0XHRiaW5hcnlSZXN1bHRzRm9yTGxtOiBiaW5hcnlSZXN1bHRzPy5sZW5ndGggPyBiaW5hcnlSZXN1bHRzIDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdDbGllbnRUb29sQ2FsbHMucmVzcG9uZE9yQnVmZmVyKHRvb2xDYWxsSWQsIHtcblx0XHRcdFx0dGV4dFJlc3VsdEZvckxsbTogdGV4dENvbnRlbnQudHJpbSgpID8gdGV4dENvbnRlbnQgOiByZXN1bHQuZXJyb3I/Lm1lc3NhZ2UgfHwgJ1Rvb2wgY2FsbCBmYWlsZWQnLFxuXHRcdFx0XHRyZXN1bHRUeXBlOiAnZmFpbHVyZScsXG5cdFx0XHRcdGVycm9yOiByZXN1bHQuZXJyb3I/Lm1lc3NhZ2UsXG5cdFx0XHRcdGJpbmFyeVJlc3VsdHNGb3JMbG06IGJpbmFyeVJlc3VsdHM/Lmxlbmd0aCA/IGJpbmFyeVJlc3VsdHMgOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBTdGlsbCBwZW5kaW5nIHBlcm1pc3Npb24sIHNvIHRoaXMgY2FsbCBtYXkgaGF2ZSBlcnJvcmVkIHdoaWxlIGdldHRpbmcgcGVybWlzc2lvbi5cblx0XHQvLyBHbyBhaGVhZCBhbmQgYWxsb3cgdGhlIGNhbGwgd2hpY2ggd2lsbCBpbW1lZGlhdGVseSBzZWUgdGhlIGJ1ZmZlcmVkIHZhbHVlLlxuXHRcdGlmICh0aGlzLl9wZW5kaW5nUGVybWlzc2lvbnMuZ2V0TWV0YWRhdGEodG9vbENhbGxJZCk/Lm1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkICE9PSB0cnVlKSB7XG5cdFx0XHR0aGlzLnJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0KHRvb2xDYWxsSWQsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NhbmNlbE1jcEF1dGhlbnRpY2F0aW9uRm9yVG9vbENhbGwodG9vbENhbGxJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Zm9yIChjb25zdCBbcmVxdWVzdElkLCBwZW5kaW5nXSBvZiB0aGlzLl9wZW5kaW5nTWNwQXV0aFJlcXVlc3RzLmVudHJpZXMoKSkge1xuXHRcdFx0Y29uc3QgdG9vbENhbGxJbmRleCA9IHBlbmRpbmcudG9vbENhbGxzLmZpbmRJbmRleCh0b29sQ2FsbCA9PiB0b29sQ2FsbC50b29sQ2FsbElkID09PSB0b29sQ2FsbElkKTtcblx0XHRcdGlmICh0b29sQ2FsbEluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHBlbmRpbmcudG9vbENhbGxzLnNwbGljZSh0b29sQ2FsbEluZGV4LCAxKTtcblx0XHRcdGlmIChwZW5kaW5nLnRvb2xDYWxscy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ01jcEF1dGhSZXF1ZXN0cy5yZXNwb25kKHJlcXVlc3RJZCwgeyBraW5kOiAnY2FuY2VsbGVkJyB9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyAob3IgcmVzdW1lcykgdGhlIFNESyBzZXNzaW9uIHZpYSB0aGUgaW5qZWN0ZWQgbGF1bmNoZXIgYW5kXG5cdCAqIHdpcmVzIHVwIGFsbCBldmVudCBsaXN0ZW5lcnMuIE11c3QgYmUgY2FsbGVkIGV4YWN0bHkgb25jZSBhZnRlclxuXHQgKiBjb25zdHJ1Y3Rpb24gYmVmb3JlIHVzaW5nIHRoZSBzZXNzaW9uLlxuXHQgKi9cblx0YXN5bmMgaW5pdGlhbGl6ZVNlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd3JhcHBlciA9IGF3YWl0IHRoaXMuX3Nlc3Npb25MYXVuY2hlci5sYXVuY2godGhpcy5fbGF1bmNoUGxhbiwgdGhpcy5fY3JlYXRlUnVudGltZUFkYXB0ZXIoKSk7XG5cdFx0Ly8gVGhlIHNlc3Npb24gbWF5IGhhdmUgYmVlbiBkaXNwb3NlZCB3aGlsZSB3ZSB3ZXJlIGF3YWl0aW5nIHRoZVxuXHRcdC8vIGxhdW5jaGVyLiBJZiBzbywgZGlzcG9zZSB0aGUgZnJlc2hseS1jcmVhdGVkIHdyYXBwZXIgYW5kXG5cdFx0Ly8gc2tpcCBzdWJzY3JpYmluZyBcdTIwMTQgcmVnaXN0ZXJpbmcgb24gYSBkaXNwb3NlZCBzdG9yZSB3b3VsZCBsZWFrLlxuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR3cmFwcGVyLmRpc3Bvc2UoKTtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblx0XHR0aGlzLl93cmFwcGVyID0gdGhpcy5fcmVnaXN0ZXIod3JhcHBlcik7XG5cdFx0dGhpcy5fc3Vic2NyaWJlVG9FdmVudHMoKTtcblx0XHR0aGlzLl9zdWJzY3JpYmVGb3JMb2dnaW5nKCk7XG5cdFx0dGhpcy5fc3Vic2NyaWJlRm9yTWVtb0ludmFsaWRhdGlvbigpO1xuXHRcdHRoaXMuX3N1YnNjcmliZUZvckluc3RydWN0aW9uc0NvbGxlY3RlZFRlbGVtZXRyeSgpO1xuXHRcdHRoaXMuX3N1YnNjcmliZVRvUGVybWlzc2lvbkNvbmZpZ0NoYW5nZXMoKTtcblx0XHR0aGlzLl9wcm9tcHRDYWNoZVN0YXRlID0gcmVhZFNlc3Npb25Qcm9tcHRDYWNoZVN0YXRlKHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeSh0aGlzLnNlc3Npb25VcmkudG9TdHJpbmcoKSk/Ll9tZXRhKTtcblx0XHRpZiAodGhpcy5fbGF1bmNoUGxhbi5raW5kID09PSAncmVzdW1lJykge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVmcmVzaFNlc3Npb25Vc2FnZU1ldHJpY3MoKTtcblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFkdmVydGlzZSB0aGUgYWdlbnQgaG9zdCdzIHNlcnZlciB0b29scyBmb3IgdGhpcyBzZXNzaW9uIHNvIGNsaWVudHNcblx0XHQvLyBzZWUgdGhlbSBhcyBzZXJ2ZXItcHJvdmlkZWQuIEV4ZWN1dGlvbiBoYXBwZW5zIGluLXByb2Nlc3MgdmlhIHRoZSBTREtcblx0XHQvLyB0b29sIGhhbmRsZXJzIGJ1aWx0IGluIGBfY3JlYXRlU2VydmVyU2RrVG9vbHNgLlxuXHRcdHRoaXMuX3NlcnZlclRvb2xIb3N0Py5hZHZlcnRpc2UodGhpcy5fc3RvcmFnZVVyaS50b1N0cmluZygpKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFByb21wdENhY2hlU3RhdGUocHJvbXB0Q2FjaGU6IElTZXNzaW9uUHJvbXB0Q2FjaGVTdGF0ZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnRTdW1tYXJ5ID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdW1tYXJ5KHRoaXMuc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRjb25zdCBjdXJyZW50TWV0YSA9IGN1cnJlbnRTdW1tYXJ5Py5fbWV0YTtcblx0XHQvLyBDb25jdXJyZW50IHNlc3Npb25zIGNhbiBzaGFyZSBgc2Vzc2lvblVyaWAsIHNvIHRoZSBwZXJzaXN0ZWQgbWV0YWRhdGEgXHUyMDE0IG5vdCB0aGlzXG5cdFx0Ly8gaW5zdGFuY2UncyBjYWNoZWQgdmFsdWUgXHUyMDE0IGlzIGF1dGhvcml0YXRpdmUgd2hlbmV2ZXIgYSBzdW1tYXJ5IGlzIGF2YWlsYWJsZS5cblx0XHRjb25zdCBjdXJyZW50UHJvbXB0Q2FjaGUgPSBjdXJyZW50U3VtbWFyeSA/IHJlYWRTZXNzaW9uUHJvbXB0Q2FjaGVTdGF0ZShjdXJyZW50TWV0YSkgOiB0aGlzLl9wcm9tcHRDYWNoZVN0YXRlO1xuXHRcdHRoaXMuX3Byb21wdENhY2hlU3RhdGUgPSBjdXJyZW50UHJvbXB0Q2FjaGU7XG5cdFx0aWYgKGN1cnJlbnRQcm9tcHRDYWNoZT8ubW9kZWxJZCA9PT0gcHJvbXB0Q2FjaGU/Lm1vZGVsSWQgJiYgY3VycmVudFByb21wdENhY2hlPy5jYWNoZUV4cGlyZXNBdCA9PT0gcHJvbXB0Q2FjaGU/LmNhY2hlRXhwaXJlc0F0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Byb21wdENhY2hlU3RhdGUgPSBwcm9tcHRDYWNoZTtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbk1ldGEodGhpcy5zZXNzaW9uVXJpLnRvU3RyaW5nKCksIHdpdGhTZXNzaW9uUHJvbXB0Q2FjaGVTdGF0ZShjdXJyZW50TWV0YSwgcHJvbXB0Q2FjaGUpKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVJ1bnRpbWVBZGFwdGVyKCk6IElDb3BpbG90U2Vzc2lvblJ1bnRpbWUge1xuXHRcdHJldHVybiB7XG5cdFx0XHRoYW5kbGVQZXJtaXNzaW9uUmVxdWVzdDogdGhpcy5fZ3VhcmRlZChyZXF1ZXN0ID0+IHRoaXMuX2hhbmRsZVBlcm1pc3Npb25SZXF1ZXN0KHJlcXVlc3QpLCB7IGtpbmQ6ICdyZWplY3QnIH0gc2F0aXNmaWVzIFBlcm1pc3Npb25SZXF1ZXN0UmVzdWx0LCAncGVybWlzc2lvbicpLFxuXHRcdFx0aGFuZGxlRXhpdFBsYW5Nb2RlUmVxdWVzdDogdGhpcy5fZ3VhcmRlZCgocmVxdWVzdCwgaW52b2NhdGlvbikgPT4gdGhpcy5faGFuZGxlRXhpdFBsYW5Nb2RlUmVxdWVzdChyZXF1ZXN0LCBpbnZvY2F0aW9uKSwgeyBhcHByb3ZlZDogZmFsc2UgfSBzYXRpc2ZpZXMgSUV4aXRQbGFuTW9kZVJlc3BvbnNlLCAnZXhpdC1wbGFuLW1vZGUnKSxcblx0XHRcdGhhbmRsZVVzZXJJbnB1dFJlcXVlc3Q6IHRoaXMuX2d1YXJkZWQoKHJlcXVlc3QsIGludm9jYXRpb24pID0+IHRoaXMuX2hhbmRsZVVzZXJJbnB1dFJlcXVlc3QocmVxdWVzdCwgaW52b2NhdGlvbiksIHsgYW5zd2VyOiAnJywgd2FzRnJlZWZvcm06IHRydWUgfSBzYXRpc2ZpZXMgVXNlcklucHV0UmVzcG9uc2UsICd1c2VyLWlucHV0JyksXG5cdFx0XHRoYW5kbGVFbGljaXRhdGlvblJlcXVlc3Q6IHRoaXMuX2d1YXJkZWQoY29udGV4dCA9PiB0aGlzLl9oYW5kbGVFbGljaXRhdGlvblJlcXVlc3QoY29udGV4dCksIHsgYWN0aW9uOiAnY2FuY2VsJyB9IHNhdGlzZmllcyBFbGljaXRhdGlvblJlc3VsdCwgJ2VsaWNpdGF0aW9uJyksXG5cdFx0XHRoYW5kbGVNY3BBdXRoUmVxdWVzdDogdGhpcy5fZ3VhcmRlZChyZXF1ZXN0ID0+IHRoaXMuX2hhbmRsZU1jcEF1dGhSZXF1ZXN0KHJlcXVlc3QpLCB7IGtpbmQ6ICdjYW5jZWxsZWQnIH0gc2F0aXNmaWVzIE1jcEF1dGhSZXN1bHQsICdtY3AtYXV0aCcpLFxuXHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkQ29tbWFuZENvbmZpcm1hdGlvbjogdGhpcy5fZ3VhcmRlZChyZXF1ZXN0ID0+IHRoaXMuX3JlcXVlc3RVbnNhbmRib3hlZENvbW1hbmRDb25maXJtYXRpb24ocmVxdWVzdCksIGZhbHNlLCAndW5zYW5kYm94ZWQtY29tbWFuZC1jb25maXJtYXRpb24nKSxcblx0XHRcdGNyZWF0ZUNsaWVudFNka1Rvb2xzOiAoKSA9PiB0aGlzLl9jcmVhdGVDbGllbnRTZGtUb29scygpLFxuXHRcdFx0Y3JlYXRlU2VydmVyU2RrVG9vbHM6ICgpID0+IHRoaXMuX2NyZWF0ZVNlcnZlclNka1Rvb2xzKCksXG5cdFx0XHRoYW5kbGVQcmVUb29sVXNlOiBpbnB1dCA9PiB0aGlzLl9oYW5kbGVQcmVUb29sVXNlKGlucHV0KSxcblx0XHRcdGhhbmRsZVBvc3RUb29sVXNlOiBpbnB1dCA9PiB0aGlzLl9oYW5kbGVQb3N0VG9vbFVzZShpbnB1dCksXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVNY3BBdXRoZW50aWNhdGlvbihwYXJhbXM6IEF1dGhlbnRpY2F0ZVBhcmFtcyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGxldCByZXNvbHZlZCA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgW3JlcXVlc3RJZCwgcGVuZGluZ10gb2YgdGhpcy5fcGVuZGluZ01jcEF1dGhSZXF1ZXN0cy5lbnRyaWVzKCkpIHtcblx0XHRcdGlmIChwZW5kaW5nLnJlc291cmNlLnJlc291cmNlICE9PSBwYXJhbXMucmVzb3VyY2UgfHwgIXRoaXMuX3Njb3Blc1NhdGlzZnkocGFyYW1zLnNjb3BlcywgcGVuZGluZy5yZXF1aXJlZFNjb3BlcykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHRvb2xDYWxsIG9mIHBlbmRpbmcudG9vbENhbGxzKSB7XG5cdFx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQXV0aFJlc29sdmVkLFxuXHRcdFx0XHRcdHR1cm5JZDogdG9vbENhbGwudHVybklkLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6IHRvb2xDYWxsLnRvb2xDYWxsSWQsXG5cdFx0XHRcdH0sIHRvb2xDYWxsLnBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXHRcdFx0cmVzb2x2ZWQgPSB0aGlzLl9wZW5kaW5nTWNwQXV0aFJlcXVlc3RzLnJlc3BvbmQocmVxdWVzdElkLCB7IGtpbmQ6ICd0b2tlbicsIGFjY2Vzc1Rva2VuOiBwYXJhbXMudG9rZW4gfSkgfHwgcmVzb2x2ZWQ7XG5cdFx0fVxuXHRcdHJldHVybiByZXNvbHZlZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZU1jcEF1dGhSZXF1ZXN0KHJlcXVlc3Q6IE1jcEF1dGhSZXF1ZXN0KTogUHJvbWlzZTxNY3BBdXRoUmVzdWx0IHwgbnVsbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGdpdGh1YlRva2VuID0gcmVxdWVzdC5yZWFzb24gPT09ICdpbml0aWFsJyAmJiB0aGlzLl9zY29wZXNGcm9tQ2hhbGxlbmdlKHJlcXVlc3Qud3d3QXV0aGVudGljYXRlUGFyYW1zPy5zY29wZSkubGVuZ3RoID09PSAwXG5cdFx0XHQ/IGF3YWl0IHRoaXMuX2luaXRpYWxHaXRIdWJNY3BUb2tlbihyZXF1ZXN0KVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0aWYgKGdpdGh1YlRva2VuKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBSZXVzaW5nIHRoZSBleGlzdGluZyBHaXRIdWIgdG9rZW4gZm9yIGluaXRpYWwgR2l0SHViIE1DUCBhdXRoZW50aWNhdGlvbmApO1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ3Rva2VuJywgYWNjZXNzVG9rZW46IGdpdGh1YlRva2VuIH07XG5cdFx0fVxuXHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5fcHJvdGVjdGVkUmVzb3VyY2VGcm9tTWNwQXV0aFJlcXVlc3QocmVxdWVzdCk7XG5cdFx0Y29uc3QgcmVxdWlyZWRTY29wZXMgPSB0aGlzLl9zY29wZXNGcm9tQ2hhbGxlbmdlKHJlcXVlc3Qud3d3QXV0aGVudGljYXRlUGFyYW1zPy5zY29wZSk7XG5cdFx0Y29uc3Qgb2F1dGhDbGllbnQ6IE1jcEF1dGhSZXF1aXJlbWVudFsnb2F1dGhDbGllbnQnXSA9IHJlcXVlc3Quc3RhdGljQ2xpZW50Q29uZmlnPy5wdWJsaWNDbGllbnRcblx0XHRcdD8geyBjbGllbnRJZDogcmVxdWVzdC5zdGF0aWNDbGllbnRDb25maWcuY2xpZW50SWQgfVxuXHRcdFx0OiByZXF1ZXN0LnN0YXRpY0NsaWVudENvbmZpZz8uY2xpZW50U2VjcmV0XG5cdFx0XHRcdD8geyBjbGllbnRJZDogcmVxdWVzdC5zdGF0aWNDbGllbnRDb25maWcuY2xpZW50SWQsIGNsaWVudFNlY3JldDogcmVxdWVzdC5zdGF0aWNDbGllbnRDb25maWcuY2xpZW50U2VjcmV0IH1cblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYXV0aDogTWNwQXV0aFJlcXVpcmVtZW50ID0ge1xuXHRcdFx0cmVhc29uOiB0aGlzLl9tY3BBdXRoUmVxdWlyZWRSZWFzb24ocmVxdWVzdC5yZWFzb24pLFxuXHRcdFx0Li4uKG9hdXRoQ2xpZW50ID8geyBvYXV0aENsaWVudCB9IDoge30pLFxuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRyZXF1aXJlZFNjb3BlczogcmVxdWlyZWRTY29wZXMubGVuZ3RoID8gWy4uLnJlcXVpcmVkU2NvcGVzXSA6IHVuZGVmaW5lZCxcblx0XHRcdGRlc2NyaXB0aW9uOiByZXF1ZXN0Lnd3d0F1dGhlbnRpY2F0ZVBhcmFtcz8uZXJyb3IsXG5cdFx0fTtcblx0XHRjb25zdCB0b29sQ2FsbHMgPSB0aGlzLl9hY3RpdmVNY3BUb29sQ2FsbHMocmVxdWVzdC5zZXJ2ZXJOYW1lKTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9wZW5kaW5nTWNwQXV0aFJlcXVlc3RzLnJlZ2lzdGVyKHJlcXVlc3QucmVxdWVzdElkLCB7XG5cdFx0XHRzZXJ2ZXJOYW1lOiByZXF1ZXN0LnNlcnZlck5hbWUsXG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHJlcXVpcmVkU2NvcGVzLFxuXHRcdFx0dG9vbENhbGxzLFxuXHRcdH0pO1xuXHRcdHRoaXMuX21jcEN1c3RvbWl6YXRpb25zLmFwcGx5T25lKHtcblx0XHRcdG5hbWU6IHJlcXVlc3Quc2VydmVyTmFtZSxcblx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWQsXG5cdFx0XHRcdC4uLmF1dGgsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGZvciAoY29uc3QgdG9vbENhbGwgb2YgdG9vbENhbGxzKSB7XG5cdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxBdXRoUmVxdWlyZWQsXG5cdFx0XHRcdHR1cm5JZDogdG9vbENhbGwudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiB0b29sQ2FsbC50b29sQ2FsbElkLFxuXHRcdFx0XHRhdXRoLFxuXHRcdFx0fSwgdG9vbENhbGwucGFyZW50VG9vbENhbGxJZCk7XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIE1DUCBzZXJ2ZXIgJyR7cmVxdWVzdC5zZXJ2ZXJOYW1lfScgcmVxdWlyZXMgYXV0aGVudGljYXRpb24gZm9yICR7cmVzb3VyY2UucmVzb3VyY2V9YCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2FjdGl2ZU1jcFRvb2xDYWxscyhzZXJ2ZXJOYW1lOiBzdHJpbmcpOiBJTWNwQXV0aFRvb2xDYWxsW10ge1xuXHRcdGlmICghdGhpcy5fdHVybklkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdDogSU1jcEF1dGhUb29sQ2FsbFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbdG9vbENhbGxJZCwgdG9vbENhbGxdIG9mIHRoaXMuX2FjdGl2ZVRvb2xDYWxscykge1xuXHRcdFx0aWYgKHRvb2xDYWxsLm1jcFNlcnZlck5hbWUgPT09IHNlcnZlck5hbWUpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyB0dXJuSWQ6IHRoaXMuX3R1cm5JZCwgdG9vbENhbGxJZCwgcGFyZW50VG9vbENhbGxJZDogdG9vbENhbGwucGFyZW50VG9vbENhbGxJZCB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2luaXRpYWxHaXRIdWJNY3BUb2tlbihyZXF1ZXN0OiBNY3BBdXRoUmVxdWVzdCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZ2l0aHViVG9rZW4gPSB0aGlzLl9sYXVuY2hQbGFuLmdpdGh1YlRva2VuO1xuXHRcdGNvbnN0IHJlcXVlc3RVcmwgPSBub3JtYWxpemVNY3BTZXJ2ZXJVcmwocmVxdWVzdC5zZXJ2ZXJVcmwpO1xuXHRcdGlmICghZ2l0aHViVG9rZW4gfHwgcmVxdWVzdFVybCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBjb25maWd1cmVkVXJscyA9IFtnaXRIdWJNY3BTZXJ2ZXJVcmwodW5kZWZpbmVkKV07XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkVXJsID0gZ2l0SHViTWNwU2VydmVyVXJsKGF3YWl0IHRoaXMuX2NvcGlsb3RBcGlTZXJ2aWNlLnJlc29sdmVBcGlFbmRwb2ludChnaXRodWJUb2tlbikpO1xuXHRcdFx0aWYgKHJlc29sdmVkVXJsKSB7XG5cdFx0XHRcdGNvbmZpZ3VyZWRVcmxzLnB1c2gocmVzb2x2ZWRVcmwpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBGYWlsZWQgdG8gcmVzb2x2ZSB0aGUgR2l0SHViIE1DUCBzZXJ2ZXIgVVJMOiAke2dldEVycm9yTWVzc2FnZShlcnJvcil9YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gY29uZmlndXJlZFVybHMuc29tZSh1ID0+IHUgJiYgcmVxdWVzdFVybCA9PT0gbm9ybWFsaXplTWNwU2VydmVyVXJsKHUpKSA/IGdpdGh1YlRva2VuIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJvdGVjdGVkUmVzb3VyY2VGcm9tTWNwQXV0aFJlcXVlc3QocmVxdWVzdDogTWNwQXV0aFJlcXVlc3QpOiBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhIHtcblx0XHRpZiAocmVxdWVzdC5yZXNvdXJjZU1ldGFkYXRhKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJlcXVlc3QucmVzb3VyY2VNZXRhZGF0YSk7XG5cdFx0XHRcdGlmIChpc0F1dGhvcml6YXRpb25Qcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhKHBhcnNlZCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gcGFyc2VkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIElnbm9yaW5nIGludmFsaWQgTUNQIHByb3RlY3RlZC1yZXNvdXJjZSBtZXRhZGF0YSBmb3IgJyR7cmVxdWVzdC5zZXJ2ZXJOYW1lfSdgKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBGYWlsZWQgdG8gcGFyc2UgTUNQIHByb3RlY3RlZC1yZXNvdXJjZSBtZXRhZGF0YSBmb3IgJyR7cmVxdWVzdC5zZXJ2ZXJOYW1lfSdgLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBzY29wZXMgPSB0aGlzLl9zY29wZXNGcm9tQ2hhbGxlbmdlKHJlcXVlc3Qud3d3QXV0aGVudGljYXRlUGFyYW1zPy5zY29wZSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc291cmNlOiByZXF1ZXN0LnNlcnZlclVybCxcblx0XHRcdHJlc291cmNlX25hbWU6IHJlcXVlc3Quc2VydmVyTmFtZSxcblx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IHNjb3Blcy5sZW5ndGggPyBzY29wZXMuc2xpY2UoKSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2NvcGVzRnJvbUNoYWxsZW5nZShzY29wZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRcdHJldHVybiBzY29wZT8uc3BsaXQoL1xccysvKS5tYXAocyA9PiBzLnRyaW0oKSkuZmlsdGVyKHMgPT4gcy5sZW5ndGggPiAwKSA/PyBbXTtcblx0fVxuXG5cdHByaXZhdGUgX21jcEF1dGhSZXF1aXJlZFJlYXNvbihyZWFzb246IE1jcEF1dGhSZXF1ZXN0WydyZWFzb24nXSk6IE1jcEF1dGhSZXF1aXJlZFJlYXNvbiB7XG5cdFx0c3dpdGNoIChyZWFzb24pIHtcblx0XHRcdGNhc2UgJ3JlZnJlc2gnOlxuXHRcdFx0Y2FzZSAncmVhdXRoJzpcblx0XHRcdFx0cmV0dXJuIE1jcEF1dGhSZXF1aXJlZFJlYXNvbi5FeHBpcmVkO1xuXHRcdFx0Y2FzZSAndXBzY29wZSc6XG5cdFx0XHRcdHJldHVybiBNY3BBdXRoUmVxdWlyZWRSZWFzb24uSW5zdWZmaWNpZW50U2NvcGU7XG5cdFx0XHRjYXNlICdpbml0aWFsJzpcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBNY3BBdXRoUmVxdWlyZWRSZWFzb24uUmVxdWlyZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2NvcGVzU2F0aXNmeShwcm92aWRlZDogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQsIHJlcXVpcmVkOiByZWFkb25seSBzdHJpbmdbXSk6IGJvb2xlYW4ge1xuXHRcdGlmIChyZXF1aXJlZC5sZW5ndGggPT09IDAgfHwgcHJvdmlkZWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IHByb3ZpZGVkU2V0ID0gbmV3IFNldChwcm92aWRlZCk7XG5cdFx0cmV0dXJuIHJlcXVpcmVkLmV2ZXJ5KHNjb3BlID0+IHByb3ZpZGVkU2V0LmhhcyhzY29wZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsUGVuZGluZ01jcEF1dGhSZXF1ZXN0cygpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nTWNwQXV0aFJlcXVlc3RzLmRlbnlBbGwoeyBraW5kOiAnY2FuY2VsbGVkJyB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2NhbmNlbFBlbmRpbmdNY3BBdXRoUmVxdWVzdHNGb3JTZXJ2ZXIoc2VydmVyTmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbcmVxdWVzdElkLCBwZW5kaW5nXSBvZiB0aGlzLl9wZW5kaW5nTWNwQXV0aFJlcXVlc3RzLmVudHJpZXMoKSkge1xuXHRcdFx0aWYgKHBlbmRpbmcuc2VydmVyTmFtZSAhPT0gc2VydmVyTmFtZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgdG9vbENhbGwgb2YgcGVuZGluZy50b29sQ2FsbHMpIHtcblx0XHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxBdXRoUmVzb2x2ZWQsXG5cdFx0XHRcdFx0dHVybklkOiB0b29sQ2FsbC50dXJuSWQsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogdG9vbENhbGwudG9vbENhbGxJZCxcblx0XHRcdFx0fSwgdG9vbENhbGwucGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wZW5kaW5nTWNwQXV0aFJlcXVlc3RzLnJlc3BvbmQocmVxdWVzdElkLCB7IGtpbmQ6ICdjYW5jZWxsZWQnIH0pO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0gc2Vzc2lvbiBvcGVyYXRpb25zIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRhc3luYyBzZW5kKHByb21wdDogc3RyaW5nLCBhdHRhY2htZW50cz86IHJlYWRvbmx5IE1lc3NhZ2VBdHRhY2htZW50W10sIHR1cm5JZD86IHN0cmluZywgbW9kZT86IENvcGlsb3RTZGtNb2RlLCBzZW5kZXJDbGllbnRJZD86IHN0cmluZywgY2xpZW50VHlwZSA9IEFnZW50SG9zdENsaWVudFR5cGUuVW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3Jlc2V0QWJvcnRUb2tlbigpO1xuXHRcdGlmICh0dXJuSWQgJiYgdGhpcy5fY3VycmVudFR1cm4/LmlkICE9PSB0dXJuSWQpIHtcblx0XHRcdC8vIEVzdGFibGlzaCB0aGUgYHBlbmRpbmdgIHR1cm4gZm9yIHRoaXMgbWVzc2FnZS4gQ2FsbGVycyBub3JtYWxseVxuXHRcdFx0Ly8gY2FsbCBgcmVzZXRUdXJuU3RhdGVgIGp1c3QgYmVmb3JlIGBzZW5kKClgOyB0aGlzIGNvdmVycyB0aGVcblx0XHRcdC8vIGRpcmVjdC1zZW5kIHBhdGggYW5kIGlzIGEgbm8tb3Agd2hlbiB0aGUgdHVybiBhbHJlYWR5IGV4aXN0cy5cblx0XHRcdHRoaXMucmVzZXRUdXJuU3RhdGUodHVybklkLCBzZW5kZXJDbGllbnRJZCwgY2xpZW50VHlwZSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jdXJyZW50VHVybikge1xuXHRcdFx0dGhpcy5fY3VycmVudFR1cm4ubWVzc2FnZUNoYXJMZW4gPSBwcm9tcHQubGVuZ3RoO1xuXHRcdH1cblx0XHRjb25zdCB0dXJuID0gdGhpcy5fY3VycmVudFR1cm47XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3NlbmQocHJvbXB0LCBhdHRhY2htZW50cywgbW9kZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBBIHJlamVjdGVkIHNlbmQgbmV2ZXIgcmVhY2hlcyB0aGUgU0RLJ3MgYWdlbnRpYyBsb29wLCBzbyBub1xuXHRcdFx0Ly8gYHNlc3Npb24uaWRsZWAgd2lsbCBldmVyIGFycml2ZSB0byBjbG9zZSB0aGlzIHR1cm4uIFRoZSBob3N0IHR1cm5zXG5cdFx0XHQvLyB0aGUgcmVqZWN0aW9uIGludG8gYSBgQ2hhdEVycm9yYCB0aGF0IGZpbmFsaXplcyB0aGUgcHJvdG9jb2wgdHVybixcblx0XHRcdC8vIHNvIGRyb3Agb3VyIGhhbmRsZSB0byBtYXRjaDogbGVhdmluZyBpdCBzZXQgbWFrZXMgdGhlIGNoYXQgbG9va1xuXHRcdFx0Ly8gYnVzeSBmb3JldmVyLCB3aGljaCBibG9ja3MgaWRsZSBldmljdGlvbiBhbmQgcGFya3MgYW55IGRlZmVycmVkXG5cdFx0XHQvLyBjbGllbnQgcmVzdGFydCBmb3IgdGhlIHJlc3Qgb2YgdGhlIHByb2Nlc3MncyBsaWZlLlxuXHRcdFx0aWYgKHR1cm4gJiYgdGhpcy5fY3VycmVudFR1cm4gPT09IHR1cm4pIHtcblx0XHRcdFx0dGhpcy5fY2xlYXJBY3RpdmVUdXJuKCk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHR9XG5cdHByaXZhdGUgYXN5bmMgX3NlbmQocHJvbXB0OiBzdHJpbmcsIGF0dGFjaG1lbnRzOiByZWFkb25seSBNZXNzYWdlQXR0YWNobWVudFtdIHwgdW5kZWZpbmVkLCBtb2RlOiBDb3BpbG90U2RrTW9kZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIHNlbmRNZXNzYWdlIGNhbGxlZDogXCIke3Byb21wdC5zdWJzdHJpbmcoMCwgMTAwKX0ke3Byb21wdC5sZW5ndGggPiAxMDAgPyAnLi4uJyA6ICcnfVwiICgke2F0dGFjaG1lbnRzPy5sZW5ndGggPz8gMH0gYXR0YWNobWVudHMpYCk7XG5cblx0XHRjb25zdCBzbGFzaENvbW1hbmQgPSBwYXJzZUxlYWRpbmdTbGFzaENvbW1hbmQocHJvbXB0KTtcblx0XHRpZiAoc2xhc2hDb21tYW5kPy5jb21tYW5kID09PSAnY29tcGFjdCcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3dyYXBwZXIuc2Vzc2lvbi5ycGMuaGlzdG9yeS5jb21wYWN0KCk7XG5cdFx0XHRcdC8vIENvbXBhY3Rpb24gcmVkdWNlcyB0aGUgbnVtYmVyIG9mIHRva2VucyBjdXJyZW50bHkgb2NjdXB5aW5nIHRoZSBjb250ZXh0IHdpbmRvdy4gUmVwb3J0IHRoZVxuXHRcdFx0XHQvLyBuZXcgb2NjdXBhbmN5IHNvIHRoZSBjb250ZXh0LXVzYWdlIHdpZGdldCByZWZyZXNoZXMgaW1tZWRpYXRlbHkuIEVtaXR0ZWQgYmVmb3JlXG5cdFx0XHRcdC8vIGBfY29tcGxldGVBY3RpdmVUdXJuYCBzaW5jZSB0aGUgcmVkdWNlciBkcm9wcyB1c2FnZSBmb3IgYSBub24tYWN0aXZlIHR1cm4uXG5cdFx0XHRcdGNvbnN0IHVzZWRUb2tlbnMgPSByZXN1bHQuY29udGV4dFdpbmRvdz8uY3VycmVudFRva2Vucztcblx0XHRcdFx0aWYgKHR5cGVvZiB1c2VkVG9rZW5zID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdC8vIGBzZXNzaW9uLmNvbXBhY3Rpb25fY29tcGxldGVgIGhhcyBhbHJlYWR5IGZvbGRlZCB0aGUgc3VtbWFyaXphdGlvbiBjYWxsJ3Ncblx0XHRcdFx0XHQvLyBjb3N0IGludG8gdGhlIHR1cm4gYnkgdGhlIHRpbWUgdGhpcyBSUEMgcmVzb2x2ZXM7IHJlZnJlc2ggdGhlIHNlc3Npb24gdG90YWxcblx0XHRcdFx0XHQvLyBzbyB0aGUgcmVwb3J0IGNhcnJpZXMgYm90aC5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9yZWZyZXNoU2Vzc2lvblVzYWdlTWV0cmljcygpO1xuXHRcdFx0XHRcdGNvbnN0IGNvcGlsb3RVc2FnZSA9IHRoaXMuX3BhcmVudENvcGlsb3RVc2FnZU1ldGEoKTtcblx0XHRcdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFVzYWdlLFxuXHRcdFx0XHRcdFx0dHVybklkOiB0aGlzLl90dXJuSWQsXG5cdFx0XHRcdFx0XHR1c2FnZToge1xuXHRcdFx0XHRcdFx0XHRpbnB1dFRva2VuczogdXNlZFRva2Vucyxcblx0XHRcdFx0XHRcdFx0b3V0cHV0VG9rZW5zOiAwLFxuXHRcdFx0XHRcdFx0XHRtb2RlbDogdGhpcy5fbGFzdFNlZW5Nb2RlbElkLFxuXHRcdFx0XHRcdFx0XHQuLi4oY29waWxvdFVzYWdlID8geyBfbWV0YTogeyBjb3BpbG90VXNhZ2UgfSB9IDoge30pLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmVtaXRJbml0aWFsTWFya2Rvd24obG9jYWxpemUoJ2NvcGlsb3RBZ2VudC5jb21wYWN0aW9uQ29tcGxldGVkJywgXCJDb21wYWN0aW9uIGNvbXBsZXRlZFwiKSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0aWYgKGdldEVycm9yTWVzc2FnZShlcnIpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ25vdGhpbmcgdG8gY29tcGFjdCcpKSB7XG5cdFx0XHRcdFx0dGhpcy5lbWl0SW5pdGlhbE1hcmtkb3duKGxvY2FsaXplKCdjb3BpbG90QWdlbnQuY29tcGFjdGlvbkNvbXBsZXRlZCcsIFwiQ29tcGFjdGlvbiBjb21wbGV0ZWRcIikpO1xuXHRcdFx0XHRcdHRoaXMuX2NvbXBsZXRlQWN0aXZlVHVybigpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVyciwgYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBycGMuaGlzdG9yeS5jb21wYWN0IGZhaWxlZGApO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0XHQvLyBgL2NvbXBhY3RgIGlzIGhhbmRsZWQgaW5saW5lIHZpYSB0aGUgaGlzdG9yeSBSUEMgcmF0aGVyIHRoYW4gYnlcblx0XHRcdC8vIGRyaXZpbmcgYW4gU0RLIHR1cm4sIHNvIHRoZSBTREsgbmV2ZXIgZmlyZXMgYG9uSWRsZWAgdG8gY2xvc2UgdGhlXG5cdFx0XHQvLyB0dXJuLiBDb21wbGV0ZSB0aGUgdHVybiBoZXJlIHNvIHRoZSBzZXNzaW9uIHJldHVybnMgdG8gaWRsZVxuXHRcdFx0Ly8gaW5zdGVhZCBvZiBzcGlubmluZyBmb3JldmVyLlxuXHRcdFx0dGhpcy5fY29tcGxldGVBY3RpdmVUdXJuKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvbmZpZ0FjdGlvbiA9IHNsYXNoQ29tbWFuZCA/IHJlc29sdmVDb3BpbG90Q29uZmlnU2xhc2hDb21tYW5kT25TZW5kKHNsYXNoQ29tbWFuZC5jb21tYW5kLCBzbGFzaENvbW1hbmQucmF3UmVzdCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGNvbmZpZ0FjdGlvbikge1xuXHRcdFx0Ly8gV29ya2JlbmNoIGNvbmZpZy1hY3Rpb24gY29tbWFuZCAocGVybWlzc2lvbi9tb2RlIHRvZ2dsZSwgZS5nLlxuXHRcdFx0Ly8gYC9hdXRvcGlsb3QgPHByb21wdD5gLCBgL3BsYW5gLCBgL3lvbG9gKS4gVGhlIGNvbmZpZyBpcyBhcHBsaWVkXG5cdFx0XHQvLyBjbGllbnQtc2lkZSBvbiBhY2NlcHQgdmlhIHRoZSBzZXNzaW9uIHByb3ZpZGVyOyBoZXJlIHdlIHJlLWFwcGx5IHRoZVxuXHRcdFx0Ly8gbW9kZSBmb3IgdGhpcyB0dXJuIChiZWx0LWFuZC1zdXNwZW5kZXJzKSBhbmQgc3RyaXAgdGhlIGNvbW1hbmQgdG9rZW5cblx0XHRcdC8vIHNvIGl0IGlzIG5vdCBkaXNwYXRjaGVkIHRvIHRoZSBydW50aW1lIGFzIGEgcnVudGltZSBjb21tYW5kLlxuXHRcdFx0Ly8gYGF1dG9BcHByb3ZlYCBjaGFuZ2VzIGFyZSBhbHJlYWR5IHJlZmxlY3RlZCBpbiB0aGUgc2Vzc2lvbiBjb25maWcgYW5kXG5cdFx0XHQvLyBhcHBsaWVkIGJ5IGBzeW5jUGVybWlzc2lvbk1vZGUoJ3R1cm4tc3RhcnQnKWAgYmVsb3cuXG5cdFx0XHRjb25zdCBzZGtNb2RlID0gdG9Db3BpbG90U2RrTW9kZShjb25maWdBY3Rpb24uYXBwbHlDb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXSk7XG5cdFx0XHRpZiAoc2RrTW9kZSkge1xuXHRcdFx0XHRtb2RlID0gc2RrTW9kZTtcblx0XHRcdH1cblx0XHRcdHByb21wdCA9IGNvbmZpZ0FjdGlvbi5zdHJpcHBlZFByb21wdDtcblx0XHR9IGVsc2UgaWYgKHNsYXNoQ29tbWFuZD8uY29tbWFuZCA9PT0gJ3J1YmJlci1kdWNrJykge1xuXHRcdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShjb3BpbG90Q2xpQ29uZmlnU2NoZW1hLCBDb3BpbG90Q2xpQ29uZmlnS2V5LlJ1YmJlckR1Y2spICE9PSB0cnVlKSB7XG5cdFx0XHRcdC8vIEZlYXR1cmUgbm90IGVuYWJsZWQgXHUyMDE0IHBhc3MgdGhlIHJlbWFpbmluZyB0ZXh0IHRocm91Z2ggYXMgYSBwbGFpblxuXHRcdFx0XHQvLyBtZXNzYWdlIHJhdGhlciB0aGFuIGluamVjdGluZyBhZ2VudCBpbnN0cnVjdGlvbnMgZm9yIGFuIHVuYXZhaWxhYmxlIGFnZW50LlxuXHRcdFx0XHRwcm9tcHQgPSBzbGFzaENvbW1hbmQucmVzdDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHVzZXJQcm9tcHQgPSBzbGFzaENvbW1hbmQucmVzdDtcblx0XHRcdFx0cHJvbXB0ID0gdXNlclByb21wdFxuXHRcdFx0XHRcdD8gYFRoZSB1c2VyIGhhcyByZXF1ZXN0ZWQgYSBydWJiZXIgZHVjayByZXZpZXcgdmlhIHRoZSAvcnViYmVyLWR1Y2sgY29tbWFuZC4gVXNlIHRoZSB0YXNrIHRvb2wgd2l0aCBhZ2VudF90eXBlOiBcInJ1YmJlci1kdWNrXCIgdG8gZ2V0IGFuIGluZGVwZW5kZW50IGNyaXRpcXVlIG9mIHlvdXIgY3VycmVudCBhcHByb2FjaCwgcGxhbiwgb3IgcmVjZW50IHdvcmsuIFN1bW1hcml6ZSB0aGUgcmVsZXZhbnQgY29udGV4dCBmb3IgdGhlIHJ1YmJlciBkdWNrIGFnZW50IHNvIGl0IGhhcyB3aGF0IGl0IG5lZWRzIHRvIGV2YWx1YXRlIGl0LlxcblxcbkFkZGl0aW9uYWwgaW5zdHJ1Y3Rpb25zOiAke3VzZXJQcm9tcHR9YFxuXHRcdFx0XHRcdDogJ1RoZSB1c2VyIGhhcyByZXF1ZXN0ZWQgYSBydWJiZXIgZHVjayByZXZpZXcgdmlhIHRoZSAvcnViYmVyLWR1Y2sgY29tbWFuZC4gVXNlIHRoZSB0YXNrIHRvb2wgd2l0aCBhZ2VudF90eXBlOiBcInJ1YmJlci1kdWNrXCIgdG8gZ2V0IGFuIGluZGVwZW5kZW50IGNyaXRpcXVlIG9mIHlvdXIgY3VycmVudCBhcHByb2FjaCwgcGxhbiwgb3IgcmVjZW50IHdvcmsuIFN1bW1hcml6ZSB0aGUgcmVsZXZhbnQgY29udGV4dCBmb3IgdGhlIHJ1YmJlciBkdWNrIGFnZW50IHNvIGl0IGhhcyB3aGF0IGl0IG5lZWRzIHRvIGV2YWx1YXRlIGl0Lic7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChzbGFzaENvbW1hbmQpIHtcblx0XHRcdGNvbnN0IHJ1bnRpbWVTbGFzaENvbW1hbmQgPSBhd2FpdCB0aGlzLl9zbGFzaENvbW1hbmRQcm92aWRlci5yZXNvbHZlU2xhc2hDb21tYW5kKHNsYXNoQ29tbWFuZC5jb21tYW5kKTtcblx0XHRcdC8vIFNraWxscyBjYW4gYmUgcGFzc2VkIGFzIGlzIHRvIHRoZSBydW50aW1lLlxuXHRcdFx0aWYgKHJ1bnRpbWVTbGFzaENvbW1hbmQgJiYgcnVudGltZVNsYXNoQ29tbWFuZC5raW5kICE9PSAnc2tpbGwnKSB7XG5cdFx0XHRcdGxldCByZXN1bHQ6IENvcGlsb3RDb21tYW5kSW52b2NhdGlvblJlc3VsdDtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLmNvbW1hbmRzLmludm9rZSh7XG5cdFx0XHRcdFx0XHRuYW1lOiBydW50aW1lU2xhc2hDb21tYW5kLm5hbWUsXG5cdFx0XHRcdFx0XHQuLi4oc2xhc2hDb21tYW5kLnJhd1Jlc3QubGVuZ3RoID4gMCA/IHsgaW5wdXQ6IHNsYXNoQ29tbWFuZC5yYXdSZXN0IH0gOiB7fSksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyLCBgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIHJwYy5jb21tYW5kcy5pbnZva2UoJHtzbGFzaENvbW1hbmQuY29tbWFuZH0pIGZhaWxlZGApO1xuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXHRcdFx0XHRzd2l0Y2ggKHJlc3VsdC5raW5kKSB7XG5cdFx0XHRcdFx0Y2FzZSAndGV4dCc6XG5cdFx0XHRcdFx0XHR0aGlzLl9lbWl0TWFya2Rvd25EZWx0YShyZXN1bHQubWFya2Rvd24gPT09IHRydWUgPyByZXN1bHQudGV4dCA6IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKHJlc3VsdC50ZXh0KSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdjb21wbGV0ZWQnOlxuXHRcdFx0XHRcdFx0aWYgKHJlc3VsdC5tZXNzYWdlKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2VtaXRNYXJrZG93bkRlbHRhKHJlc3VsdC5tZXNzYWdlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2FnZW50LXByb21wdCc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IHJ1bnRpbWVNb2RlID0gdG9Db3BpbG90U2RrTW9kZShyZXN1bHQubW9kZSk7XG5cdFx0XHRcdFx0XHRpZiAocnVudGltZU1vZGUpIHtcblx0XHRcdFx0XHRcdFx0bW9kZSA9IHJ1bnRpbWVNb2RlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cHJvbXB0ID0gcmVzdWx0LnByb21wdDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdzZWxlY3Qtc3ViY29tbWFuZCc6XG5cdFx0XHRcdFx0XHR0aGlzLl9lbWl0TWFya2Rvd25EZWx0YShsb2NhbGl6ZShcblx0XHRcdFx0XHRcdFx0J2NvcGlsb3RTbGFzaENvbW1hbmQuc2VsZWN0U3ViY29tbWFuZFJlc3VsdCcsXG5cdFx0XHRcdFx0XHRcdFwiVGhlIC97MH0gY29tbWFuZCByZXF1aXJlcyBzZWxlY3RpbmcgYSBzdWJjb21tYW5kLiBBdmFpbGFibGUgb3B0aW9uczogezF9XCIsXG5cdFx0XHRcdFx0XHRcdHJlc3VsdC5jb21tYW5kLFxuXHRcdFx0XHRcdFx0XHRyZXN1bHQub3B0aW9ucy5tYXAob3B0aW9uID0+IG9wdGlvbi5uYW1lKS5qb2luKCcsICcpLFxuXHRcdFx0XHRcdFx0KSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0Ly8gVGhlIHJ1bnRpbWUgY2FuIGJlIG5ld2VyIHRoYW4gdGhlc2UgY29tcGlsZWQgU0RLIHR5cGVzLCBzbyBhblxuXHRcdFx0XHRcdFx0Ly8gdW5rbm93biBraW5kIG11c3QgYmUgbG9nZ2VkIHJhdGhlciB0aGFuIHNpbGVudGx5IHN3YWxsb3dlZCAodGhlXG5cdFx0XHRcdFx0XHQvLyB0dXJuIHdvdWxkIG90aGVyd2lzZSBjb21wbGV0ZSB3aXRoIG5vIHVzZXItZmFjaW5nIG91dHB1dCkuXG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBVbmhhbmRsZWQgc2xhc2ggY29tbWFuZCByZXN1bHQga2luZDogJHsocmVzdWx0IGFzIHsga2luZDogc3RyaW5nIH0pLmtpbmR9YCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmVzdWx0LnJ1bnRpbWVTZXR0aW5nc0NoYW5nZWQgPT09IHRydWUpIHtcblx0XHRcdFx0XHR0aGlzLl9zbGFzaENvbW1hbmRQcm92aWRlci5jbGVhckNhY2hlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHJlc3VsdC5raW5kICE9PSAnYWdlbnQtcHJvbXB0Jykge1xuXHRcdFx0XHRcdHRoaXMuX2NvbXBsZXRlQWN0aXZlVHVybigpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNka0F0dGFjaG1lbnRzID0gYXR0YWNobWVudHM/Lmxlbmd0aFxuXHRcdFx0PyAoYXdhaXQgUHJvbWlzZS5hbGwoYXR0YWNobWVudHMubWFwKGEgPT4gdGhpcy5fdG9TZGtBdHRhY2htZW50KGEpKSkpLmZpbHRlcihpc0RlZmluZWQpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRpZiAoc2RrQXR0YWNobWVudHM/Lmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEF0dGFjaG1lbnRzOiAke0pTT04uc3RyaW5naWZ5KHNka0F0dGFjaG1lbnRzLm1hcChhID0+ICh7IHR5cGU6IGEudHlwZSB9KSkpfWApO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuYXBwbHlNb2RlKG1vZGUpO1xuXHRcdGF3YWl0IHRoaXMuc3luY1Blcm1pc3Npb25Nb2RlKCd0dXJuLXN0YXJ0Jyk7XG5cdFx0YXdhaXQgdGhpcy5fYXBwbHlFZmZlY3RpdmVTYW5kYm94Q29uZmlnKCk7XG5cdFx0YXdhaXQgdGhpcy5fcmVjb25jaWxlTWNwU2VydmVyRW5hYmxlbWVudCgpO1xuXHRcdGF3YWl0IHRoaXMuX3dyYXBwZXIuc2Vzc2lvbi5zZW5kKHsgcHJvbXB0LCBhdHRhY2htZW50czogc2RrQXR0YWNobWVudHM/Lmxlbmd0aCA/IHNka0F0dGFjaG1lbnRzIDogdW5kZWZpbmVkIH0pO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIHNlc3Npb24uc2VuZCgpIHJldHVybmVkYCk7XG5cdH1cblxuXHRhc3luYyBoYXNSdW50aW1lU2xhc2hDb21tYW5kKGNvbW1hbmQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gISEoYXdhaXQgdGhpcy5fc2xhc2hDb21tYW5kUHJvdmlkZXIucmVzb2x2ZVNsYXNoQ29tbWFuZChjb21tYW5kKSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBycGMuY29tbWFuZHMubGlzdCBmYWlsZWRgLCBlcnIpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldFJ1bnRpbWVTbGFzaENvbW1hbmRzKG9wdGlvbnM/OiB7IHJlYWRvbmx5IG1heFdhaXRNcz86IG51bWJlciB9KTogUHJvbWlzZTxyZWFkb25seSBSdW50aW1lU2xhc2hDb21tYW5kSW5mb1tdPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9zbGFzaENvbW1hbmRQcm92aWRlci5nZXRTbGFzaENvbW1hbmRzKG9wdGlvbnMpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gcnBjLmNvbW1hbmRzLmxpc3QgZmFpbGVkYCwgZXJyKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVHJhbnNsYXRlIGEgcHJvdG9jb2wge0BsaW5rIE1lc3NhZ2VBdHRhY2htZW50fSBpbnRvIHRoZSBDb3BpbG90IENMSSBTREsncyBgYXR0YWNobWVudHNgIHBheWxvYWQgc2hhcGUuIFJlc291cmNlXG5cdCAqIGF0dGFjaG1lbnRzIG1hcCB0byB0aGUgU0RLJ3MgcmVmZXJlbmNlLXN0eWxlIGBmaWxlYC9gZGlyZWN0b3J5YC9gc2VsZWN0aW9uYCB2YXJpYW50cyAodGhlXG5cdCAqIHtAbGluayBNZXNzYWdlQXR0YWNobWVudEJhc2UuZGlzcGxheUtpbmR9IGFkdmlzb3J5IGhpbnQgY29udHJvbHMgd2hpY2ggb25lKS4gRW1iZWRkZWQgcmVzb3VyY2VzIChlLmcuIGlubGluZVxuXHQgKiBpbWFnZSBieXRlcywgb3IgdW5zYXZlZCBlZGl0b3IgY29udGVudCkgbWFwIHRvIHRoZSBTREsncyBgYmxvYmAgdmFyaWFudCwgYW5kIHNpbXBsZSBhdHRhY2htZW50cyB3aXRoIGEgbW9kZWxcblx0ICogcmVwcmVzZW50YXRpb24gbWFwIHRvIGB0ZXh0L3BsYWluYCBibG9iIGF0dGFjaG1lbnRzLlxuXHQgKlxuXHQgKiBBbnkgUmVzb3VyY2UgYXR0YWNobWVudCBjYXJyeWluZyBhIHtAbGluayBUZXh0U2VsZWN0aW9ufSAoZS5nLiBgZGlzcGxheUtpbmQgPT09ICdzZWxlY3Rpb24nYCBvciBgJ3N5bWJvbCdgKSBpc1xuXHQgKiBtYXBwZWQgdG8gdGhlIFNESydzIGBzZWxlY3Rpb25gIHZhcmlhbnQgc28gdGhlIHJhbmdlIHN1cnZpdmVzIHRoZSByb3VuZC10cmlwIFx1MjAxNCBrZXlpbmcgb2ZmIHRoZSBgc2VsZWN0aW9uYCBmaWVsZFxuXHQgKiByYXRoZXIgdGhhbiBqdXN0IGBkaXNwbGF5S2luZGAgYXZvaWRzIHN5bWJvbCBhdHRhY2htZW50cyBkZWdyYWRpbmcgdG8gYSBwbGFpbiBmaWxlIHJlZmVyZW5jZSAoIzMxNTE5MykuIEZvciB0aG9zZVxuXHQgKiB3ZSByZWFkIHRoZSByZXNvdXJjZSBjb250ZW50IGZyb20gZGlzayBhbmQgc2xpY2UgaXQgYnkgdGhlIGNhcnJpZWQgcmFuZ2UgKHRoZSBwcm90b2NvbCdzIHtAbGluayBUZXh0U2VsZWN0aW9ufVxuXHQgKiBvbmx5IGNhcnJpZXMgdGhlIHJhbmdlLCBub3QgdGhlIGlubGluZSB0ZXh0KTsgb24gcmVhZCBmYWlsdXJlIHRoZSBzZWxlY3Rpb24gZG93bmdyYWRlcyB0byBhIHBsYWluIGZpbGUgcmVmZXJlbmNlLlxuXHQgKiBBIHRleHR1YWwgZW1iZWRkZWQgcmVzb3VyY2UgYWxyZWFkeSBjYXJyaWVzIHRoZSBleGFjdCBpbmxpbmUgdGV4dCB0byBzZW5kICh0aGUgd2hvbGUgbGl2ZSBidWZmZXIgZm9yIGEgZG9jdW1lbnQsXG5cdCAqIG9yIGp1c3QgdGhlIHNlbGVjdGVkIHRleHQgZm9yIGEgc2VsZWN0aW9uKSwgc28gaXQgaXMgZm9yd2FyZGVkIGFzLWlzIHdpdGhvdXQgZnVydGhlciBzbGljaW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfdG9TZGtBdHRhY2htZW50KGF0dGFjaG1lbnQ6IE1lc3NhZ2VBdHRhY2htZW50KTogUHJvbWlzZTxDb3BpbG90U2RrQXR0YWNobWVudCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChpc0FnZW50RmVlZGJhY2tBbm5vdGF0aW9uc0F0dGFjaG1lbnQoYXR0YWNobWVudCkpIHtcblx0XHRcdGNvbnN0IHJlbmRlcmVkID0gcmVuZGVyQWdlbnRGZWVkYmFja0Fubm90YXRpb25zQXR0YWNobWVudChhdHRhY2htZW50KTtcblx0XHRcdGlmICghcmVuZGVyZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdibG9iJyBhcyBjb25zdCxcblx0XHRcdFx0ZGF0YTogZW5jb2RlQmFzZTY0KFZTQnVmZmVyLmZyb21TdHJpbmcocmVuZGVyZWQpKSxcblx0XHRcdFx0bWltZVR5cGU6ICd0ZXh0L3BsYWluJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6IGF0dGFjaG1lbnQubGFiZWwsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRpZiAoYXR0YWNobWVudC50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlKSB7XG5cdFx0XHRpZiAoYXR0YWNobWVudC5tb2RlbFJlcHJlc2VudGF0aW9uKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jsb2InIGFzIGNvbnN0LFxuXHRcdFx0XHRcdGRhdGE6IGVuY29kZUJhc2U2NChWU0J1ZmZlci5mcm9tU3RyaW5nKGF0dGFjaG1lbnQubW9kZWxSZXByZXNlbnRhdGlvbikpLFxuXHRcdFx0XHRcdG1pbWVUeXBlOiBhZGRTaW1wbGVBdHRhY2htZW50RGlzcGxheUtpbmRUb01pbWVUeXBlKGF0dGFjaG1lbnQpLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiBhdHRhY2htZW50LmxhYmVsLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGF0dGFjaG1lbnQudHlwZSA9PT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkVtYmVkZGVkUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB7IHR5cGU6ICdibG9iJyBhcyBjb25zdCwgZGF0YTogYXR0YWNobWVudC5kYXRhLCBtaW1lVHlwZTogYXR0YWNobWVudC5jb250ZW50VHlwZSwgZGlzcGxheU5hbWU6IGF0dGFjaG1lbnQubGFiZWwgfTtcblx0XHR9XG5cdFx0aWYgKGF0dGFjaG1lbnQudHlwZSAhPT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoYXR0YWNobWVudC51cmkpO1xuXHRcdGNvbnN0IHBhdGggPSB1cmkuc2NoZW1lID09PSAnZmlsZScgPyB1cmkuZnNQYXRoIDogdXJpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBhdHRhY2htZW50LmxhYmVsID8/IHBhdGg7XG5cdFx0aWYgKGF0dGFjaG1lbnQuc2VsZWN0aW9uKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gYXdhaXQgdGhpcy5fcmVhZFNlbGVjdGVkVGV4dCh1cmksIGF0dGFjaG1lbnQuc2VsZWN0aW9uLnJhbmdlKTtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ3NlbGVjdGlvbicgYXMgY29uc3QsIGZpbGVQYXRoOiBwYXRoLCBkaXNwbGF5TmFtZSwgdGV4dCwgc2VsZWN0aW9uOiBhdHRhY2htZW50LnNlbGVjdGlvbi5yYW5nZSB9O1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEZhaWxlZCB0byByZWFkIHNlbGVjdGVkIHRleHQgZm9yICR7dXJpLnRvU3RyaW5nKCl9OiAke2Vycn1gKTtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2ZpbGUnIGFzIGNvbnN0LCBwYXRoLCBkaXNwbGF5TmFtZSB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoYXR0YWNobWVudC5kaXNwbGF5S2luZCA9PT0gJ3NlbGVjdGlvbicpIHtcblx0XHRcdHJldHVybiB7IHR5cGU6ICdmaWxlJyBhcyBjb25zdCwgcGF0aCwgZGlzcGxheU5hbWUgfTtcblx0XHR9XG5cdFx0Y29uc3QgdHlwZSA9IGF0dGFjaG1lbnQuZGlzcGxheUtpbmQgPT09ICdkaXJlY3RvcnknID8gJ2RpcmVjdG9yeScgOiAnZmlsZSc7XG5cdFx0cmV0dXJuIHsgdHlwZSwgcGF0aCwgZGlzcGxheU5hbWUgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlYWRTZWxlY3RlZFRleHQodXJpOiBVUkksIHJhbmdlOiB7IHJlYWRvbmx5IHN0YXJ0OiB7IHJlYWRvbmx5IGxpbmU6IG51bWJlcjsgcmVhZG9ubHkgY2hhcmFjdGVyOiBudW1iZXIgfTsgcmVhZG9ubHkgZW5kOiB7IHJlYWRvbmx5IGxpbmU6IG51bWJlcjsgcmVhZG9ubHkgY2hhcmFjdGVyOiBudW1iZXIgfSB9KTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUodXJpKTtcblx0XHRjb25zdCB0ZXh0ID0gY29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdC8vIEFIUCBjYXJyaWVzIHRoZSByZXNvdXJjZSByYW5nZTsgdGhlIHB1YmxpYyBTREsgY2FuIGNhcnJ5IHRoZSBzZWxlY3RlZCB0ZXh0IHRvby5cblx0XHQvLyBUaGlzIHJlYWRzIHRoZSByZXNvdXJjZSBVUkksIHNvIHVuc2F2ZWQgZWRpdG9yIGNoYW5nZXMgYXJlIG5vdCBpbmNsdWRlZC5cblx0XHRjb25zdCBsaW5lcyA9IHNwbGl0TGluZXNJbmNsdWRlU2VwYXJhdG9ycyh0ZXh0KTtcblx0XHRjb25zdCBzdGFydCA9IHRoaXMuX2dldE9mZnNldEF0KGxpbmVzLCByYW5nZS5zdGFydCk7XG5cdFx0Y29uc3QgZW5kID0gdGhpcy5fZ2V0T2Zmc2V0QXQobGluZXMsIHJhbmdlLmVuZCk7XG5cdFx0cmV0dXJuIHRleHQuc3Vic3RyaW5nKHN0YXJ0LCBNYXRoLm1heChzdGFydCwgZW5kKSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPZmZzZXRBdChsaW5lczogcmVhZG9ubHkgc3RyaW5nW10sIHBvc2l0aW9uOiB7IHJlYWRvbmx5IGxpbmU6IG51bWJlcjsgcmVhZG9ubHkgY2hhcmFjdGVyOiBudW1iZXIgfSk6IG51bWJlciB7XG5cdFx0Y29uc3QgbGluZSA9IE1hdGgubWF4KDAsIE1hdGgubWluKHBvc2l0aW9uLmxpbmUsIGxpbmVzLmxlbmd0aCAtIDEpKTtcblx0XHRsZXQgb2Zmc2V0ID0gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmU7IGkrKykge1xuXHRcdFx0b2Zmc2V0ICs9IGxpbmVzW2ldLmxlbmd0aDtcblx0XHR9XG5cdFx0Y29uc3QgbGluZVRleHQgPSBsaW5lc1tsaW5lXS5yZXBsYWNlKC9cXHJcXG58XFxyfFxcbiQvLCAnJyk7XG5cdFx0cmV0dXJuIG9mZnNldCArIE1hdGgubWF4KDAsIE1hdGgubWluKHBvc2l0aW9uLmNoYXJhY3RlciwgbGluZVRleHQubGVuZ3RoKSk7XG5cdH1cblxuXHQvKipcblx0ICogUHVzaGVzIGBtb2RlYCB0byB0aGUgU0RLIHZpYSBgcnBjLm1vZGUuc2V0YCBpZiBpdCBkaWZmZXJzIGZyb20gdGhlXG5cdCAqIGxhc3QgYXBwbGllZCB2YWx1ZS4gRmFpbHVyZXMgYXJlIGxvZ2dlZCBhbmQgc3dhbGxvd2VkIHNvIHRoYXQgbW9kZVxuXHQgKiBwcm9wYWdhdGlvbiBkb2VzIG5vdCBibG9jayB0aGUgdHVybi5cblx0ICovXG5cdGFzeW5jIGFwcGx5TW9kZShtb2RlOiBDb3BpbG90U2RrTW9kZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghbW9kZSB8fCBtb2RlID09PSB0aGlzLl9sYXN0QXBwbGllZE1vZGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3dyYXBwZXIuc2Vzc2lvbi5ycGMubW9kZS5zZXQoeyBtb2RlIH0pO1xuXHRcdFx0dGhpcy5fbGFzdEFwcGxpZWRNb2RlID0gbW9kZTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIHJwYy5tb2RlLnNldCBzdWNjZWVkZWQ6IG1vZGU9JHttb2RlfWApO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIsIGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gcnBjLm1vZGUuc2V0IGZhaWxlZDogbW9kZT0ke21vZGV9YCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIGB0cnVlYCB3aGVuIHRoZSBzZXNzaW9uJ3MgZWZmZWN0aXZlIGBtb2RlYCBpcyBgYXV0b3BpbG90YCBcdTIwMTQgdGhlXG5cdCAqIGF1dG9ub21vdXMsIGNvbnRpbnVlLXVudGlsLWRvbmUgbW9kZSBpbiB3aGljaCBubyB1c2VyIGlzIGF2YWlsYWJsZSB0b1xuXHQgKiBhbnN3ZXIgcXVlc3Rpb25zIG9yIGZpbGwgaW4gZWxpY2l0YXRpb24gZm9ybXMuXG5cdCAqL1xuXHRwcml2YXRlIF9pc0F1dG9waWxvdE1vZGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEVmZmVjdGl2ZVZhbHVlKHRoaXMuX3N0b3JhZ2VVcmkudG9TdHJpbmcoKSwgcGxhdGZvcm1TZXNzaW9uU2NoZW1hLCBTZXNzaW9uQ29uZmlnS2V5Lk1vZGUpID09PSAnYXV0b3BpbG90Jztcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIFZTIENvZGUncyBhdXRvLXJlcGx5IHNldHRpbmcgaXMgZW5hYmxlZCBpbiB0aGUgcm9vdCBjb25maWcuXG5cdCAqL1xuXHRwcml2YXRlIF9pc0F1dG9SZXBseUVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdEF1dG9SZXBseUVuYWJsZWRDb25maWdLZXkpID09PSB0cnVlO1xuXHR9XG5cblx0YXN5bmMgc2VuZFN0ZWVyaW5nKHN0ZWVyaW5nTWVzc2FnZTogUGVuZGluZ01lc3NhZ2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fc3RlZXJpbmdNZXNzYWdlc0luRmxpZ2h0LmhhcyhzdGVlcmluZ01lc3NhZ2UuaWQpIHx8IHRoaXMuX3BlbmRpbmdTdGVlcmluZ0ZsaXBzLmhhcyhzdGVlcmluZ01lc3NhZ2UuaWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N0ZWVyaW5nTWVzc2FnZXNJbkZsaWdodC5hZGQoc3RlZXJpbmdNZXNzYWdlLmlkKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBTZW5kaW5nIHN0ZWVyaW5nIG1lc3NhZ2U6IFwiJHtzdGVlcmluZ01lc3NhZ2UubWVzc2FnZS50ZXh0LnN1YnN0cmluZygwLCAxMDApfVwiYCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3JlY29uY2lsZU1jcFNlcnZlckVuYWJsZW1lbnQoKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdTdGVlcmluZ0ZsaXBzLnNldChzdGVlcmluZ01lc3NhZ2UuaWQsIHN0ZWVyaW5nTWVzc2FnZSk7XG5cdFx0XHRhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24uc2VuZCh7XG5cdFx0XHRcdHByb21wdDogc3RlZXJpbmdNZXNzYWdlLm1lc3NhZ2UudGV4dCxcblx0XHRcdFx0bW9kZTogJ2ltbWVkaWF0ZScsXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdTdGVlcmluZ0ZsaXBzLmRlbGV0ZShzdGVlcmluZ01lc3NhZ2UuaWQpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIFN0ZWVyaW5nIG1lc3NhZ2UgZmFpbGVkYCwgZXJyKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fc3RlZXJpbmdNZXNzYWdlc0luRmxpZ2h0LmRlbGV0ZShzdGVlcmluZ01lc3NhZ2UuaWQpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldE1lc3NhZ2VzKCk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fZ2V0TWFwcGVkRXZlbnRzKCk7XG5cdFx0cmV0dXJuIHJlc3VsdC50dXJucztcblx0fVxuXG5cdGFzeW5jIGdldFN1YmFnZW50TWVzc2FnZXMocGFyZW50VG9vbENhbGxJZDogc3RyaW5nKTogUHJvbWlzZTxyZWFkb25seSBUdXJuW10+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9nZXRNYXBwZWRFdmVudHMoKTtcblx0XHRjb25zdCB0dXJucyA9IHJlc3VsdC5zdWJhZ2VudFR1cm5zQnlUb29sQ2FsbElkLmdldChwYXJlbnRUb29sQ2FsbElkKSA/PyBbXTtcblx0XHRyZXR1cm4gdHVybnM7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgc3ViYWdlbnQgY2hpbGQgc2Vzc2lvbnMgZGlzY292ZXJhYmxlIGluIHRoaXMgc2Vzc2lvbidzIGV2ZW50XG5cdCAqIGxvZywgZGVyaXZlZCBmcm9tIHRoZSBzYW1lIHtAbGluayBtYXBTZXNzaW9uRXZlbnRzfSByZWNvbnN0cnVjdGlvbiB1c2VkXG5cdCAqIGZvciB7QGxpbmsgZ2V0TWVzc2FnZXN9L3tAbGluayBnZXRTdWJhZ2VudE1lc3NhZ2VzfS4gTGV0cyBhIHBhcmVudFxuXHQgKiByZXN0b3JlIHJlZ2lzdGVyIGV2ZXJ5IGNoaWxkIHVwLWZyb250IGluc3RlYWQgb2YgZWFjaCBjaGlsZCByZS1mZXRjaGluZ1xuXHQgKiBhbmQgcmUtcmVjb25zdHJ1Y3RpbmcgdGhlIGZ1bGwgcGFyZW50IGV2ZW50IGxvZy5cblx0ICovXG5cdGFzeW5jIGdldFN1YmFnZW50U2Vzc2lvbnMoKTogUHJvbWlzZTxyZWFkb25seSBJUmVzdG9yZWRTdWJhZ2VudFNlc3Npb25bXT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2dldE1hcHBlZEV2ZW50cygpO1xuXHRcdGlmIChyZXN1bHQuc3ViYWdlbnRUdXJuc0J5VG9vbENhbGxJZC5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IHBhcmVudFNlc3Npb25TdHIgPSB0aGlzLl9zdG9yYWdlVXJpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgb3V0OiBJUmVzdG9yZWRTdWJhZ2VudFNlc3Npb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdHVybiBvZiByZXN1bHQudHVybnMpIHtcblx0XHRcdGZvciAoY29uc3QgcnAgb2YgdHVybi5yZXNwb25zZVBhcnRzKSB7XG5cdFx0XHRcdGlmIChycC5raW5kICE9PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdGMgPSBycC50b29sQ2FsbDtcblx0XHRcdFx0Y29uc3QgY2hpbGRUdXJucyA9IHJlc3VsdC5zdWJhZ2VudFR1cm5zQnlUb29sQ2FsbElkLmdldCh0Yy50b29sQ2FsbElkKTtcblx0XHRcdFx0aWYgKCFjaGlsZFR1cm5zIHx8IGNoaWxkVHVybnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY29udGVudCA9ICh0YyBhcyB7IGNvbnRlbnQ/OiByZWFkb25seSBUb29sUmVzdWx0Q29udGVudFtdIH0pLmNvbnRlbnQ7XG5cdFx0XHRcdGNvbnN0IHN1YmFnZW50Q29udGVudCA9IGNvbnRlbnQgPyBnZXRUb29sU3ViYWdlbnRDb250ZW50KHsgY29udGVudCB9KSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Ly8gUHJlZmVyIHRoZSBzcGF3bmluZyBUYXNrIHRvb2wncyBzaG9ydCBgZGVzY3JpcHRpb25gIChjYXB0dXJlZCBvblxuXHRcdFx0XHQvLyB0aGUgcGFyZW50IHRvb2wgY2FsbCdzIGBfbWV0YWApIHNvIHJlc3RvcmVkIHBlZXIgdGFicyBtYXRjaCB0aGVcblx0XHRcdFx0Ly8gbGl2ZSBwYXRoJ3MgY29uY2lzZSwgcGVyLXRhc2sgbmFtaW5nOyBmYWxsIGJhY2sgdG8gdGhlIGFnZW50XG5cdFx0XHRcdC8vIHR5cGUncyBkaXNwbGF5IG5hbWUuXG5cdFx0XHRcdGNvbnN0IHRhc2tEZXNjcmlwdGlvbiA9IHJlYWRUb29sQ2FsbE1ldGEodGMpLnN1YmFnZW50RGVzY3JpcHRpb247XG5cdFx0XHRcdG91dC5wdXNoKHtcblx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpKHBhcmVudFNlc3Npb25TdHIsIHRjLnRvb2xDYWxsSWQpKSxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiB0Yy50b29sQ2FsbElkLFxuXHRcdFx0XHRcdHRpdGxlOiBzdWJhZ2VudENoYXRUaXRsZSh0YXNrRGVzY3JpcHRpb24sIHN1YmFnZW50Q29udGVudD8udGl0bGUpLFxuXHRcdFx0XHRcdHR1cm5zOiBjaGlsZFR1cm5zLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG91dDtcblx0fVxuXG5cdC8qKlxuXHQgKiBNZW1vaXplZCBgZ2V0RXZlbnRzKClgICsge0BsaW5rIG1hcFNlc3Npb25FdmVudHN9IHJlc3VsdCwgc2hhcmVkIGJ5XG5cdCAqIHtAbGluayBnZXRNZXNzYWdlc30sIHtAbGluayBnZXRTdWJhZ2VudE1lc3NhZ2VzfSBhbmRcblx0ICoge0BsaW5rIGdldFN1YmFnZW50U2Vzc2lvbnN9LiBBIHNpbmdsZSBzZXNzaW9uIG9wZW4gcmVhZHMgYW5kXG5cdCAqIHJlY29uc3RydWN0cyB0aGUgZnVsbCBwYXJlbnQgZXZlbnQgbG9nIG9uY2UgaW5zdGVhZCBvZiBvbmNlIHBlclxuXHQgKiBzdWJhZ2VudC4gVGhlIG1lbW8gaXMgc2NvcGVkIHRvIHRoZSByZXN1bWUvcmVzdG9yZSB3YXZlOiBpdCBpcyBkcm9wcGVkXG5cdCAqIHdoZW5ldmVyIHRoZSBwZXJzaXN0ZWQgZXZlbnQgbG9nIGNvdWxkIGNoYW5nZSAoc2VlXG5cdCAqIHtAbGluayBfaW52YWxpZGF0ZU1hcHBlZEV2ZW50c30pIGFuZCBvbiBkaXNwb3NlLCBzbyBpdCBuZXZlciBzZXJ2ZXNcblx0ICogc3RhbGUgdHVybnMgZm9yIGFuIGFjdGl2ZWx5LXJ1bm5pbmcgc2Vzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgX21hcHBlZEV2ZW50c01lbW86IFByb21pc2U8SU1hcHBlZFNlc3Npb25FdmVudHM+IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2dldE1hcHBlZEV2ZW50cygpOiBQcm9taXNlPElNYXBwZWRTZXNzaW9uRXZlbnRzPiB7XG5cdFx0aWYgKCF0aGlzLl9tYXBwZWRFdmVudHNNZW1vKSB7XG5cdFx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fY29tcHV0ZU1hcHBlZEV2ZW50cygpO1xuXHRcdFx0dGhpcy5fbWFwcGVkRXZlbnRzTWVtbyA9IHBlbmRpbmc7XG5cdFx0XHQvLyBEb24ndCBjYWNoZSBhIHJlamVjdGVkIHJlY29uc3RydWN0aW9uIFx1MjAxNCBsZXQgdGhlIG5leHQgY2FsbGVyIHJldHJ5LlxuXHRcdFx0cGVuZGluZy5jYXRjaCgoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9tYXBwZWRFdmVudHNNZW1vID09PSBwZW5kaW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5fbWFwcGVkRXZlbnRzTWVtbyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tYXBwZWRFdmVudHNNZW1vO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29tcHV0ZU1hcHBlZEV2ZW50cygpOiBQcm9taXNlPElNYXBwZWRTZXNzaW9uRXZlbnRzPiB7XG5cdFx0Y29uc3QgZXZlbnRzID0gYXdhaXQgdGhpcy5fd3JhcHBlci5zZXNzaW9uLmdldEV2ZW50cygpO1xuXHRcdGxldCBkYjogSVNlc3Npb25EYXRhYmFzZSB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0ZGIgPSB0aGlzLl9kYXRhYmFzZVJlZi5vYmplY3Q7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBEYXRhYmFzZSBtYXkgbm90IGV4aXN0IHlldCBcdTIwMTQgdGhhdCdzIGZpbmVcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyh0aGlzLl9zdG9yYWdlVXJpLCBkYiwgZXZlbnRzLCB7XG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB0aGlzLl93b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0bW9kZWw6IHRoaXMuX2xhdW5jaFBsYW4ua2luZCA9PT0gJ2NyZWF0ZSdcblx0XHRcdFx0PyB0aGlzLl9sYXVuY2hQbGFuLm1vZGVsXG5cdFx0XHRcdDogdGhpcy5fbGF1bmNoUGxhbi5mYWxsYmFjay5tb2RlbCxcblx0XHR9KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0LyoqIERyb3AgdGhlIG1lbW9pemVkIGV2ZW50IHJlY29uc3RydWN0aW9uOyB0aGUgbmV4dCByZWFkIHJlYnVpbGRzIGl0LiAqL1xuXHRwcml2YXRlIF9pbnZhbGlkYXRlTWFwcGVkRXZlbnRzKCk6IHZvaWQge1xuXHRcdHRoaXMuX21hcHBlZEV2ZW50c01lbW8gPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBhYm9ydCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBBYm9ydGluZyBzZXNzaW9uLi4uYCk7XG5cdFx0dGhpcy5fYmVnaW5BYm9ydCgpO1xuXHRcdHRoaXMuX2RyYWluUGVuZGluZ1N0ZWVyaW5nRmxpcHMoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fd3JhcHBlci5zZXNzaW9uLmFib3J0KCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX3Jlc2V0QWJvcnRUb2tlbigpO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFib3J0cyBiZWZvcmUgdGVhcmluZyBkb3duIHNvIHRoYXQgaW4tZmxpZ2h0IHtAbGluayBfZ3VhcmRlZH0gY2FsbGJhY2tzXG5cdCAqIHNldHRsZSByYXRoZXIgdGhhbiBoYW5nOiBkaXNwb3NpbmcgdGhlIHtAbGluayBfYWJvcnRDdHN9IHdvdWxkIGRyb3AgZWFjaFxuXHQgKiByYWNpbmcgYG9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkYCBsaXN0ZW5lciB3aXRob3V0IGV2ZXIgZmlyaW5nIGl0LCBsZWF2aW5nXG5cdCAqIGEgY2FsbGJhY2sgdGhhdCBwYXJrcyBpdHMgZGVmZXJyZWQgYWZ0ZXIgdGhlIHRlYXJkb3duIHN3ZWVwIHdpdGggbm90aGluZ1xuXHQgKiBsZWZ0IHRvIHJlc29sdmUgaXQuIFRoZSBzd2VlcCByZWdpc3RlcmVkIGluIHRoZSBjb25zdHJ1Y3RvciBzdGF5cyBhcyB0aGVcblx0ICogYmFja3N0b3AsIHNpbmNlIHtAbGluayBfYmVnaW5BYm9ydH0gbm8tb3BzIHdoZW4gYWxyZWFkeSBhYm9ydGVkLlxuXHQgKi9cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR2b2lkIHRoaXMuX2VkaXRUcmFja2VyLmZsdXNoQXR0cmlidXRpb24oKS5jYXRjaChlcnJvciA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBGYWlsZWQgdG8gZmx1c2ggZWRpdCBhdHRyaWJ1dGlvbjogJHtlcnJvcn1gKTtcblx0XHR9KTtcblx0XHR0aGlzLl9iZWdpbkFib3J0KCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4cGxpY2l0bHkgZGVzdHJveXMgdGhlIHVuZGVybHlpbmcgU0RLIHNlc3Npb24gYW5kIHdhaXRzIGZvciBjbGVhbnVwXG5cdCAqIHRvIGNvbXBsZXRlLiBDYWxsIHRoaXMgYmVmb3JlIHtAbGluayBkaXNwb3NlfSB3aGVuIHlvdSBuZWVkIHRvIGVuc3VyZVxuXHQgKiB0aGUgc2Vzc2lvbidzIG9uLWRpc2sgZGF0YSBpcyBubyBsb25nZXIgbG9ja2VkIChlLmcuIGJlZm9yZVxuXHQgKiB0cnVuY2F0aW9uIG9yIGZvcmsgb3BlcmF0aW9ucyB0aGF0IG1vZGlmeSB0aGUgc2Vzc2lvbiBmaWxlcykuXG5cdCAqL1xuXHRhc3luYyBkZXN0cm95U2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZWRpdFRyYWNrZXIuZmx1c2hBdHRyaWJ1dGlvbigpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBGYWlsZWQgdG8gZmx1c2ggZWRpdCBhdHRyaWJ1dGlvbjogJHtlcnJvcn1gKTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fd3JhcHBlci5zZXNzaW9uLmRpc2Nvbm5lY3QoKTtcblx0fVxuXG5cdGFzeW5jIHNldE1vZGVsKG1vZGVsOiBzdHJpbmcsIHJlYXNvbmluZ0VmZm9ydD86IFNlc3Npb25Db25maWdbJ3JlYXNvbmluZ0VmZm9ydCddLCBjb250ZXh0VGllcj86IFNlc3Npb25Db25maWdbJ2NvbnRleHRUaWVyJ10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBDaGFuZ2luZyBtb2RlbCB0bzogJHttb2RlbH1gKTtcblx0XHR0aGlzLl9sYXN0U2Vlbk1vZGVsSWQgPSBtb2RlbDtcblx0XHRhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24uc2V0TW9kZWwobW9kZWwsIHsgcmVhc29uaW5nRWZmb3J0LCBjb250ZXh0VGllciB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNwYXRjaGVzIGFuIE1DUCBKU09OLVJQQyBtZXRob2QgcmVjZWl2ZWQgb24gdGhlIGBtY3A6Ly9gIHNpZGVcblx0ICogY2hhbm5lbCB0byB0aGUgQ29waWxvdCBTREsncyBgc2Vzc2lvbi5ycGMubWNwLipgIHN1cmZhY2UuXG5cdCAqXG5cdCAqIE1hcHBpbmc6XG5cdCAqICAtIGB0b29scy9saXN0YCBcdTIxOTIgYHJwYy5tY3AuYXBwcy5saXN0VG9vbHNgXG5cdCAqICAtIGB0b29scy9jYWxsYCBcdTIxOTIgYHJwYy5tY3AuYXBwcy5jYWxsVG9vbGBcblx0ICogIC0gYHJlc291cmNlcy9yZWFkYCBcdTIxOTIgYHJwYy5tY3AuYXBwcy5yZWFkUmVzb3VyY2VgXG5cdCAqICAtIGByZXNvdXJjZXMvbGlzdGAgXHUyMTkyIGBycGMubWNwLmFwcHMubGlzdFJlc291cmNlc2AgKGVtcHR5IGxpc3QgZmFsbGJhY2spXG5cdCAqICAtIGByZXNvdXJjZXMvdGVtcGxhdGVzL2xpc3RgIFx1MjE5MiBgcnBjLm1jcC5hcHBzLmxpc3RSZXNvdXJjZVRlbXBsYXRlc2AgKGVtcHR5IGxpc3QgZmFsbGJhY2spXG5cdCAqICAtIGBzYW1wbGluZy9jcmVhdGVNZXNzYWdlYCBcdTIxOTIgYHJwYy5tY3AuZXhlY3V0ZVNhbXBsaW5nYFxuXHQgKlxuXHQgKiBPdGhlciBNQ1AgbWV0aG9kcyBhcmUgcmVqZWN0ZWQgd2l0aCBgTWV0aG9kIG5vdCBmb3VuZGAgKHRoZSBjYWxsZXJcblx0ICogdHJhbnNsYXRlcyB0aGF0IGludG8gYSBKU09OLVJQQyBgLTMyNjAxYCkuXG5cdCAqL1xuXHRhc3luYyBoYW5kbGVNY3BSZXF1ZXN0KHNlcnZlck5hbWU6IHN0cmluZywgbWV0aG9kOiBzdHJpbmcsIHBhcmFtczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRjb25zdCBhcHBzID0gdGhpcy5fd3JhcHBlci5zZXNzaW9uLnJwYy5tY3AuYXBwcztcblx0XHRzd2l0Y2ggKG1ldGhvZCkge1xuXHRcdFx0Y2FzZSAndG9vbHMvbGlzdCc6XG5cdFx0XHRcdHJldHVybiBhcHBzLmxpc3RUb29scyh7IHNlcnZlck5hbWUsIG9yaWdpblNlcnZlck5hbWU6IHNlcnZlck5hbWUgfSk7XG5cdFx0XHRjYXNlICd0b29scy9jYWxsJzoge1xuXHRcdFx0XHRjb25zdCBuYW1lID0gcGFyYW1zICYmIHR5cGVvZiBwYXJhbXNbJ25hbWUnXSA9PT0gJ3N0cmluZycgPyBwYXJhbXNbJ25hbWUnXSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKCFuYW1lKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGB0b29scy9jYWxsIG1pc3NpbmcgJ25hbWUnIHBhcmFtZXRlcmApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJhd0FyZ3MgPSBwYXJhbXMgPyBwYXJhbXNbJ2FyZ3VtZW50cyddIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBhcmdzID0gaXNPYmplY3QocmF3QXJncykgPyByYXdBcmdzIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IDogdW5kZWZpbmVkO1xuXHRcdFx0XHRyZXR1cm4gYXBwcy5jYWxsVG9vbCh7IHNlcnZlck5hbWUsIHRvb2xOYW1lOiBuYW1lLCBhcmd1bWVudHM6IGFyZ3MsIG9yaWdpblNlcnZlck5hbWU6IHNlcnZlck5hbWUgfSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdyZXNvdXJjZXMvcmVhZCc6IHtcblx0XHRcdFx0Y29uc3QgdXJpID0gcGFyYW1zICYmIHR5cGVvZiBwYXJhbXNbJ3VyaSddID09PSAnc3RyaW5nJyA/IHBhcmFtc1sndXJpJ10gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICghdXJpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGByZXNvdXJjZXMvcmVhZCBtaXNzaW5nICd1cmknIHBhcmFtZXRlcmApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhcHBzLnJlYWRSZXNvdXJjZSh7IHNlcnZlck5hbWUsIHVyaSB9KTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3Jlc291cmNlcy9saXN0Jzoge1xuXHRcdFx0XHQvLyBOb3QgaW1wbGVtZW50ZWQgaW4gdGhlIFNESyB5ZXRcblx0XHRcdFx0cmV0dXJuIHsgcmVzb3VyY2VzOiBbXSB9O1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAncmVzb3VyY2VzL3RlbXBsYXRlcy9saXN0Jzoge1xuXHRcdFx0XHQvLyBOb3QgaW1wbGVtZW50ZWQgaW4gdGhlIFNESyB5ZXRcblx0XHRcdFx0cmV0dXJuIHsgcmVzb3VyY2VUZW1wbGF0ZXM6IFtdIH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdzYW1wbGluZy9jcmVhdGVNZXNzYWdlJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2hhbmRsZVNhbXBsaW5nQ3JlYXRlTWVzc2FnZShzZXJ2ZXJOYW1lLCBwYXJhbXMpO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNZXRob2Qgbm90IGZvdW5kOiAke21ldGhvZH1gKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzdGFydE1jcFNlcnZlcihpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VydmVyTmFtZSA9IHRoaXMuX21jcEN1c3RvbWl6YXRpb25zLnNlcnZlck5hbWVGb3JDdXN0b21pemF0aW9uSWQoaWQpO1xuXHRcdGlmICghc2VydmVyTmFtZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gQ2Fubm90IHN0YXJ0IHVua25vd24gTUNQIHNlcnZlciBjdXN0b21pemF0aW9uICR7aWR9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLm1jcC5zdGFydFNlcnZlcih7IHNlcnZlck5hbWUgfSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdC8vIFJlY29uY2lsZSBhZ2FpbnN0IHRoZSBTREsncyByZWFsIHN0YXRlLiBUaGUgbGl2ZVxuXHRcdFx0Ly8gYHNlc3Npb24ubWNwX3NlcnZlcl9zdGF0dXNfY2hhbmdlZGAgc3RyZWFtIGFscmVhZHkgcmVwb3J0cyB0aGVcblx0XHRcdC8vIGNvbm5lY3QgKGBwZW5kaW5nYCAtPiBgY29ubmVjdGVkYC9gZmFpbGVkYCk7IHRoaXMgY292ZXJzIHRoZSBjYXNlXG5cdFx0XHQvLyB3aGVyZSB0aGUgc3RhcnQgcmVqZWN0cyBiZWZvcmUgYW55IHN0YXR1cyBpcyBlbWl0dGVkLlxuXHRcdFx0dGhpcy5fc2VlZE1jcFNlcnZlcnNGcm9tUnBjKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVjb25jaWxlTWNwU2VydmVyRW5hYmxlbWVudCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZXNpcmVkQ3VzdG9taXphdGlvbnMgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHRoaXMuc2Vzc2lvblVyaS50b1N0cmluZygpKT8uY3VzdG9taXphdGlvbnMgPz8gW107XG5cdFx0Y29uc3QgZGVzaXJlZFNlcnZlcnMgPSBnZXRFZmZlY3RpdmVNY3BTZXJ2ZXJDdXN0b21pemF0aW9ucyhkZXNpcmVkQ3VzdG9taXphdGlvbnMpO1xuXHRcdGlmIChkZXNpcmVkU2VydmVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fcmVmcmVzaE1jcFNlcnZlcnNGcm9tUnBjKCk7XG5cdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiB0aGlzLl9tY3BDdXN0b21pemF0aW9ucy5zZXJ2ZXJFbmFibGVtZW50KCkpIHtcblx0XHRcdGNvbnN0IGRlc2lyZWQgPSBkZXNpcmVkU2VydmVycy5maW5kKGN1c3RvbWl6YXRpb24gPT4gY3VzdG9taXphdGlvbi5pZCA9PT0gc2VydmVyLmN1c3RvbWl6YXRpb25JZCk/LmVuYWJsZWQ7XG5cdFx0XHRpZiAoZGVzaXJlZCA9PT0gdW5kZWZpbmVkIHx8IGRlc2lyZWQgPT09IHNlcnZlci5lbmFibGVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKGRlc2lyZWQpIHtcblx0XHRcdFx0XHQvLyBSZS1lbmFibGluZyByZXN0YXJ0cyB0aGUgc2VydmVyLiBUaGUgU0RLIHJlcG9ydHMgdGhlXG5cdFx0XHRcdFx0Ly8gY29ubmVjdCBsaXZlIChgcGVuZGluZ2AgLT4gYGNvbm5lY3RlZGAvYGZhaWxlZGApLCBzbyBub1xuXHRcdFx0XHRcdC8vIG9wdGltaXN0aWMgc3RhdGUgaXMgd3JpdHRlbiBoZXJlLiBNYXJrIGBjaGFuZ2VkYCBub3dcblx0XHRcdFx0XHQvLyAoYmVmb3JlIHRoZSBlbmFibGUpIHNvIHRoZSB0cmFpbGluZyByZWZyZXNoIGFsd2F5cyBydW5zXG5cdFx0XHRcdFx0Ly8gZXZlbiBpZiB0aGUgZW5hYmxlIHJlamVjdHMuXG5cdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fd3JhcHBlci5zZXNzaW9uLnJwYy5tY3AuZW5hYmxlKHsgc2VydmVyTmFtZTogc2VydmVyLnNlcnZlck5hbWUgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fZGlzYWJsZU1jcFNlcnZlcihzZXJ2ZXIuc2VydmVyTmFtZSk7XG5cdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlLCBgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEZhaWxlZCB0byAke2Rlc2lyZWQgPyAnZW5hYmxlJyA6ICdkaXNhYmxlJ30gTUNQIHNlcnZlciAke3NlcnZlci5zZXJ2ZXJOYW1lfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVmcmVzaE1jcFNlcnZlcnNGcm9tUnBjKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGlzYWJsZU1jcFNlcnZlcihzZXJ2ZXJOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBkaXNhYmxlKCkgaGFuZ3MgdW50aWwgcGVuZGluZyBhdXRoIHJlcXVlc3RzIGhhdmUgcmVzb2x2ZWQuXG5cdFx0Ly8gcmVwb3J0ZWQgdG8gdGhlIFNESyBmb2xrcyB0aG91Z2ggYXJndWFibGUgd2hldGhlciBpdCdzIGEgYnVnIG9yIG5vdC4uLlxuXHRcdHRoaXMuX2NhbmNlbFBlbmRpbmdNY3BBdXRoUmVxdWVzdHNGb3JTZXJ2ZXIoc2VydmVyTmFtZSk7XG5cdFx0YXdhaXQgdGhpcy5fd3JhcHBlci5zZXNzaW9uLnJwYy5tY3AuZGlzYWJsZSh7IHNlcnZlck5hbWUgfSk7XG5cdH1cblxuXHRhc3luYyBzdG9wTWNwU2VydmVyKGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXJ2ZXJOYW1lID0gdGhpcy5fbWNwQ3VzdG9taXphdGlvbnMuc2VydmVyTmFtZUZvckN1c3RvbWl6YXRpb25JZChpZCk7XG5cdFx0aWYgKCFzZXJ2ZXJOYW1lKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBDYW5ub3Qgc3RvcCB1bmtub3duIE1DUCBzZXJ2ZXIgY3VzdG9taXphdGlvbiAke2lkfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLm1jcC5zdG9wU2VydmVyKHsgc2VydmVyTmFtZSB9KTtcblx0XHR0aGlzLl9tY3BDdXN0b21pemF0aW9ucy5hcHBseU9uZSh7IG5hbWU6IHNlcnZlck5hbWUsIHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkIH0gfSk7XG5cdH1cblxuXHQvKipcblx0ICogRm9yd2FyZHMgYW4gQXBwXHUyMTkyaG9zdCBgc2FtcGxpbmcvY3JlYXRlTWVzc2FnZWAgcmVxdWVzdCByZWNlaXZlZFxuXHQgKiBvdmVyIHRoZSBBSFAgYG1jcDovL2AgY2hhbm5lbCB0byBgcnBjLm1jcC5leGVjdXRlU2FtcGxpbmdgLiBUaGVcblx0ICogQ29waWxvdCBydW50aW1lIG93bnMgdGhlIE1DUFx1MjE5MmNoYXQtY29tcGxldGlvbiBjb252ZXJzaW9uIGFuZCB0aGVcblx0ICogc2FtcGxpbmcgcmVzcG9uc2Ugc2hhcGUsIHNvIHdlIHBhc3MgdGhlIHJhdyBNQ1AgcGFyYW1zIHRocm91Z2hcblx0ICogdW50b3VjaGVkIGFuZCByZXR1cm4gdGhlIFNESydzIHJlc3VsdCBkaXJlY3RseS5cblx0ICpcblx0ICogUmVzb2x2ZXMgdGhlIEpTT04tUlBDIHJlcXVlc3Qgd2l0aCB0aGUgYENyZWF0ZU1lc3NhZ2VSZXN1bHRgIG9uXG5cdCAqIHN1Y2Nlc3MgYW5kIHJlamVjdHMgb24gZmFpbHVyZS9jYW5jZWxsYXRpb24sIG1pcnJvcmluZyB0aGVcblx0ICogYHNhbXBsaW5nL2NyZWF0ZU1lc3NhZ2VgIE1DUCBjb250cmFjdC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVNhbXBsaW5nQ3JlYXRlTWVzc2FnZShzZXJ2ZXJOYW1lOiBzdHJpbmcsIHBhcmFtczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRpZiAoIXBhcmFtcykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBzYW1wbGluZy9jcmVhdGVNZXNzYWdlIG1pc3NpbmcgcGFyYW1zYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVxdWVzdElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgbWNwUmVxdWVzdElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0dGhpcy5fcGVuZGluZ01jcFNhbXBsaW5ncy5hZGQocmVxdWVzdElkKTtcblx0XHR0cnkge1xuXHRcdFx0dHlwZSBNY3BFeGVjdXRlU2FtcGxpbmdQYXJhbXMgPSBQYXJhbWV0ZXJzPHR5cGVvZiB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLm1jcC5leGVjdXRlU2FtcGxpbmc+WzBdO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fd3JhcHBlci5zZXNzaW9uLnJwYy5tY3AuZXhlY3V0ZVNhbXBsaW5nKHtcblx0XHRcdFx0cmVxdWVzdElkLFxuXHRcdFx0XHRzZXJ2ZXJOYW1lLFxuXHRcdFx0XHRtY3BSZXF1ZXN0SWQ6IG1jcFJlcXVlc3RJZCBhcyB1bmtub3duIGFzIE1jcEV4ZWN1dGVTYW1wbGluZ1BhcmFtc1snbWNwUmVxdWVzdElkJ10sXG5cdFx0XHRcdHJlcXVlc3Q6IHBhcmFtcyxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKHJlc3VsdC5hY3Rpb24gPT09ICdzdWNjZXNzJykge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0LnJlc3VsdCA/PyBudWxsO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBzYW1wbGluZy9jcmVhdGVNZXNzYWdlICR7cmVzdWx0LmFjdGlvbn0ke3Jlc3VsdC5lcnJvciA/IGA6ICR7cmVzdWx0LmVycm9yfWAgOiAnJ31gKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ01jcFNhbXBsaW5ncy5kZWxldGUocmVxdWVzdElkKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2VsZWN0cyAob3IgY2xlYXJzKSBhIGN1c3RvbSBhZ2VudCBvbiB0aGUgbGl2ZSBTREsgc2Vzc2lvbi5cblx0ICogTWlycm9ycyB0aGUgU0RLJ3MgYHJwYy5hZ2VudC5zZWxlY3RgIC8gYHJwYy5hZ2VudC5kZXNlbGVjdGAgcGFpci5cblx0ICovXG5cdGFzeW5jIHNldEFnZW50KGFnZW50TmFtZT86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChhZ2VudE5hbWUpIHtcblx0XHRcdGNvbnN0IG5hbWUgPSBhZ2VudE5hbWU7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBTZWxlY3RpbmcgY3VzdG9tIGFnZW50OiAke25hbWV9YCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLmFnZW50LnNlbGVjdCh7IG5hbWUgfSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIsIGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gcnBjLmFnZW50LnNlbGVjdCBmYWlsZWQ6IG5hbWU9JHtuYW1lfWApO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIENsZWFyaW5nIGN1c3RvbSBhZ2VudCBzZWxlY3Rpb25gKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3dyYXBwZXIuc2Vzc2lvbi5ycGMuYWdlbnQuZGVzZWxlY3QoKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVyciwgYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBycGMuYWdlbnQuZGVzZWxlY3QgZmFpbGVkYCk7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIHBlcm1pc3Npb24gaGFuZGxpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgYSBwZXJtaXNzaW9uIHJlcXVlc3QgZnJvbSB0aGUgU0RLIGJ5IGZpcmluZyBhIGB0b29sX3JlYWR5YCBldmVudFxuXHQgKiAod2hpY2ggdHJhbnNpdGlvbnMgdGhlIHRvb2wgdG8gUGVuZGluZ0NvbmZpcm1hdGlvbikgYW5kIHdhaXRpbmcgZm9yIHRoZVxuXHQgKiBzaWRlLWVmZmVjdHMgbGF5ZXIgdG8gcmVzcG9uZCB2aWEge0BsaW5rIHJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0fS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVBlcm1pc3Npb25SZXF1ZXN0KFxuXHRcdHJlcXVlc3Q6IElUeXBlZFBlcm1pc3Npb25SZXF1ZXN0LFxuXHQpOiBQcm9taXNlPFBlcm1pc3Npb25SZXF1ZXN0UmVzdWx0PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRvb2xDYWxsSWQgPSByZXF1ZXN0LnRvb2xDYWxsSWQ7XG5cdFx0XHRpZiAoIXRvb2xDYWxsSWQpIHtcblx0XHRcdFx0Ly8gVE9ETzogaGFuZGxlIHBlcm1pc3Npb24gcmVxdWVzdHMgd2l0aG91dCBhIHRvb2xDYWxsSWQgYnkgY3JlYXRpbmcgYSBzeW50aGV0aWMgdG9vbCBjYWxsXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIFBlcm1pc3Npb24gcmVxdWVzdCB3aXRob3V0IHRvb2xDYWxsSWQsIGF1dG8tZGVueWluZzoga2luZD0ke3JlcXVlc3Qua2luZH1gKTtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ3JlamVjdCcgfTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl91bnJvdXRhYmxlU3ViYWdlbnRUb29sQ2FsbElkcy5kZWxldGUodG9vbENhbGxJZCkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIFJlamVjdGluZyBwZXJtaXNzaW9uIHJlcXVlc3QgZm9yIHVucm91dGFibGUgc3ViYWdlbnQgdG9vbCBjYWxsOiB0b29sQ2FsbElkPSR7dG9vbENhbGxJZH0sIGtpbmQ9JHtyZXF1ZXN0LmtpbmR9YCk7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdyZWplY3QnIH07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkID0gcmVxdWVzdC5tYW5hZ2VkQXBwcm92YWxSZXF1aXJlZCA9PT0gdHJ1ZTtcblx0XHRcdGNvbnN0IGF1dG9BcHByb3ZhbCA9ICFtYW5hZ2VkQXBwcm92YWxSZXF1aXJlZCAmJiB0aGlzLl9sYXN0QXBwbGllZFBlcm1pc3Npb25Nb2RlID09PSAnYXV0bydcblx0XHRcdFx0PyBhd2FpdCB0aGlzLl90YWtlQXV0b0FwcHJvdmFsKHRvb2xDYWxsSWQpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcmVjb21tZW5kYXRpb24gPSBhdXRvQXBwcm92YWw/LnJlY29tbWVuZGF0aW9uO1xuXHRcdFx0aWYgKHJlY29tbWVuZGF0aW9uID09PSAnYXBwcm92ZScgJiYgIXJlcXVlc3QucmVxdWVzdFNhbmRib3hCeXBhc3MpIHtcblx0XHRcdFx0aWYgKHJlcXVlc3Qua2luZCA9PT0gJ2N1c3RvbS10b29sJ1xuXHRcdFx0XHRcdCYmIHR5cGVvZiByZXF1ZXN0LnRvb2xOYW1lID09PSAnc3RyaW5nJ1xuXHRcdFx0XHRcdCYmIHRoaXMuX2NsaWVudFRvb2xOYW1lcy5oYXModGhpcy5fY2xpZW50VG9vbE5hbWUocmVxdWVzdC50b29sTmFtZSkpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdGNvbnN0IHRyYWNrZWRUb29sQ2FsbCA9IHRoaXMuX2FjdGl2ZVRvb2xDYWxscy5nZXQodG9vbENhbGxJZCk7XG5cdFx0XHRcdFx0Y29uc3QgZGlzcGxheU5hbWUgPSB0cmFja2VkVG9vbENhbGw/LmRpc3BsYXlOYW1lID8/IGdldFRvb2xEaXNwbGF5TmFtZShyZXF1ZXN0LnRvb2xOYW1lKTtcblx0XHRcdFx0XHRjb25zdCBwYXJhbWV0ZXJzID0gdHJhY2tlZFRvb2xDYWxsPy5wYXJhbWV0ZXJzO1xuXHRcdFx0XHRcdGNvbnN0IHBhcmVudFRvb2xDYWxsSWQgPSB0cmFja2VkVG9vbENhbGw/LnBhcmVudFRvb2xDYWxsSWQ7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZmlyZSh7XG5cdFx0XHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLFxuXHRcdFx0XHRcdFx0Y2hhdDogdGhpcy5fY2hhdENoYW5uZWxVcmksXG5cdFx0XHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0XHRcdHRvb2xOYW1lOiByZXF1ZXN0LnRvb2xOYW1lLFxuXHRcdFx0XHRcdFx0XHRkaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGdldEludm9jYXRpb25NZXNzYWdlKHJlcXVlc3QudG9vbE5hbWUsIGRpc3BsYXlOYW1lLCBwYXJhbWV0ZXJzLCBwYXRoID0+IHRoaXMuX3Jlc29sdmVFZGl0RmlsZVBhdGgocGF0aCkpLFxuXHRcdFx0XHRcdFx0XHR0b29sSW5wdXQ6IGdldFRvb2xJbnB1dFN0cmluZyhyZXF1ZXN0LnRvb2xOYW1lLCBwYXJhbWV0ZXJzLCB0cnlTdHJpbmdpZnkocGFyYW1ldGVycykpLFxuXHRcdFx0XHRcdFx0XHRyaXNrQXNzZXNzbWVudDogYXV0b0FwcHJvdmFsPy5yZWFzb25cblx0XHRcdFx0XHRcdFx0XHQ/IHtcblx0XHRcdFx0XHRcdFx0XHRcdGtpbmQ6IFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRLaW5kLkp1ZGdlLFxuXHRcdFx0XHRcdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50U3RhdHVzLkNvbXBsZXRlLFxuXHRcdFx0XHRcdFx0XHRcdFx0cmVhc29uOiBhdXRvQXBwcm92YWwucmVhc29uLFxuXHRcdFx0XHRcdFx0XHRcdFx0c2FmZXR5OiAxLFxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRwYXJlbnRUb29sQ2FsbElkLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdhcHByb3ZlLW9uY2UnIH07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFwcHJvdmVkU2lnbmF0dXJlID0gdGhpcy5fYXBwcm92ZWREdXBsaWNhYmxlUGVybWlzc2lvblNpZ25hdHVyZXMuZ2V0KHRvb2xDYWxsSWQpO1xuXHRcdFx0aWYgKGFwcHJvdmVkU2lnbmF0dXJlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fYXBwcm92ZWREdXBsaWNhYmxlUGVybWlzc2lvblNpZ25hdHVyZXMuZGVsZXRlKHRvb2xDYWxsSWQpO1xuXHRcdFx0XHRpZiAoIW1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkICYmIChyZXF1ZXN0LmtpbmQgPT09ICd3cml0ZScgfHwgcmVxdWVzdC5raW5kID09PSAncmVhZCcpICYmIHNhZmVTdHJpbmdpZnkocmVxdWVzdCkgPT09IGFwcHJvdmVkU2lnbmF0dXJlKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gQXV0by1hcHByb3ZpbmcgZHVwbGljYXRlICR7cmVxdWVzdC5raW5kfSBwZXJtaXNzaW9uIHJlcXVlc3QgZm9yIHRvb2wgY2FsbCAke3Rvb2xDYWxsSWR9YCk7XG5cdFx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2FwcHJvdmUtb25jZScgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2VQYXRoID0gdGhpcy5fZ2V0SW50ZXJuYWxTZXNzaW9uUmVzb3VyY2VQYXRoKHJlcXVlc3QpO1xuXHRcdFx0aWYgKCFtYW5hZ2VkQXBwcm92YWxSZXF1aXJlZCAmJiBzZXNzaW9uUmVzb3VyY2VQYXRoKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEF1dG8tYXBwcm92aW5nIGludGVybmFsIHNlc3Npb24gcmVzb3VyY2UgJHtzZXNzaW9uUmVzb3VyY2VQYXRofWApO1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnYXBwcm92ZS1vbmNlJyB9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBdXRvLWFwcHJvdmUgcmVhZHMgb2YgZmlsZXMgdW5kZXIgdGhlIHNlc3Npb24ncyBhdHRhY2htZW50c1xuXHRcdFx0Ly8gZGlyZWN0b3J5LiBUaGUgYWdlbnQgaG9zdCB3cml0ZXMgdXNlci1tZXNzYWdlIGF0dGFjaG1lbnRzXG5cdFx0XHQvLyAocGFzdGVkIGltYWdlcywgc25hcHNob3R0ZWQgY2xpZW50LXNpZGUgZmlsZXMsIGV0Yy4pIHRoZXJlXG5cdFx0XHQvLyBiZWZvcmUgZGlzcGF0Y2hpbmcgdGhlIHR1cm47IHRoZSBhZ2VudCBlbmRzIHVwIG5lZWRpbmcgdG9cblx0XHRcdC8vIHJlYWQgdGhvc2Ugc2FtZSBmaWxlcyBiYWNrLCBhbmQgcHJvbXB0aW5nIHRoZSB1c2VyIHRvXG5cdFx0XHQvLyBhcHByb3ZlIGEgcmVhZCBvZiBieXRlcyB0aGV5IHRoZW1zZWx2ZXMgYXR0YWNoZWQgaXNcblx0XHRcdC8vIHJlZHVuZGFudC5cblx0XHRcdGlmICghbWFuYWdlZEFwcHJvdmFsUmVxdWlyZWQgJiYgcmVxdWVzdC5raW5kID09PSAncmVhZCcgJiYgdHlwZW9mIHJlcXVlc3QucGF0aCA9PT0gJ3N0cmluZydcblx0XHRcdFx0JiYgdGhpcy5faXNTZXNzaW9uQXR0YWNobWVudFBhdGgocmVxdWVzdC5wYXRoKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEF1dG8tYXBwcm92aW5nIHNlc3Npb24gYXR0YWNobWVudCAke3JlcXVlc3QucGF0aH1gKTtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2FwcHJvdmUtb25jZScgfTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQXV0by1hcHByb3ZlIHJlYWRzIG9mIGxhcmdlLXRvb2wtb3V0cHV0IHRlbXAgZmlsZXMgd3JpdHRlbiBieSB0aGVcblx0XHRcdC8vIENvcGlsb3QgU0RLIGl0c2VsZi4gVGhlIFNESyBzcGlsbHMgb3ZlcnNpemVkIHRvb2wgcmVzdWx0cyB0b1xuXHRcdFx0Ly8gYG9zLnRtcGRpcigpL2NvcGlsb3QtdG9vbC1vdXRwdXQtXHUyMDI2dHh0YCBhbmQgdGhlbiBhc2tzIHRoZSBtb2RlbFxuXHRcdFx0Ly8gdG8gcmVhZCB0aGVtIGJhY2sgaW4gYSBmb2xsb3ctdXAgdHVybiBcdTIwMTQgbm8gbmVlZCB0byBjb25maXJtLlxuXHRcdFx0aWYgKCFtYW5hZ2VkQXBwcm92YWxSZXF1aXJlZCAmJiByZXF1ZXN0LmtpbmQgPT09ICdyZWFkJyAmJiB0eXBlb2YgcmVxdWVzdC5wYXRoID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRpZiAoaXNDb3BpbG90U2RrVG9vbE91dHB1dFRlbXBGaWxlKHJlcXVlc3QucGF0aCwgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnRtcERpci5mc1BhdGgpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gQXV0by1hcHByb3ZpbmcgQ29waWxvdCBTREsgdG9vbC1vdXRwdXQgdGVtcCBmaWxlICR7cmVxdWVzdC5wYXRofWApO1xuXHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdhcHByb3ZlLW9uY2UnIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQXV0by1hcHByb3ZlIHRoZSBhZ2VudCBob3N0J3Mgc2VydmVyIHRvb2xzLiBUaGV5IG9ubHkgcmVhZCBvclxuXHRcdFx0Ly8gbXV0YXRlIHRoZSBzZXNzaW9uJ3Mgb3duIHNlcnZlci1oZWxkIHN0YXRlIGFuZCBuZXZlciB0b3VjaCB0aGVcblx0XHRcdC8vIHdvcmtzcGFjZSwgc2hlbGwsIG9yIG5ldHdvcmssIHNvIHByb21wdGluZyBmb3IgdGhlbSBpcyByZWR1bmRhbnRcblx0XHRcdC8vIG5vaXNlLiBUb29scyB0aGF0IGV4cGxpY2l0bHkgcmVxdWlyZSBjb25maXJtYXRpb24gKGUuZy4gcmV2ZWFsaW5nXG5cdFx0XHQvLyB1bnJldmlld2VkIHJldmlldyBjb21tZW50cykgYXJlIGV4Y2x1ZGVkIHNvIHRoZSB1c2VyIGlzIHByb21wdGVkLlxuXHRcdFx0aWYgKCFtYW5hZ2VkQXBwcm92YWxSZXF1aXJlZCAmJiByZXF1ZXN0LmtpbmQgPT09ICdjdXN0b20tdG9vbCcgJiYgdHlwZW9mIHJlcXVlc3QudG9vbE5hbWUgPT09ICdzdHJpbmcnXG5cdFx0XHRcdCYmIHRoaXMuX3NlcnZlclRvb2xIb3N0Py50b29sTmFtZXMuaW5jbHVkZXMocmVxdWVzdC50b29sTmFtZSlcblx0XHRcdFx0JiYgIXRoaXMuX3NlcnZlclRvb2xIb3N0LnJlcXVpcmVzQ29uZmlybWF0aW9uKHJlcXVlc3QudG9vbE5hbWUpXG5cdFx0XHQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gQXV0by1hcHByb3Zpbmcgc2VydmVyIHRvb2wgJHtyZXF1ZXN0LnRvb2xOYW1lfWApO1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnYXBwcm92ZS1vbmNlJyB9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUaGUgU0RLJ3MgYnVpbHQtaW4gdGVybWluYWwgcmVwb3J0cyBga2luZDogJ3NoZWxsJ2AuIFRoZSBBZ2VudCBIb3N0J3Ncblx0XHRcdC8vIHRlcm1pbmFsIG92ZXJyaWRlIGlzIHJlZ2lzdGVyZWQgYXMgYW4gU0RLIGN1c3RvbSB0b29sIG5hbWVkIGBiYXNoYCBvclxuXHRcdFx0Ly8gYHBvd2Vyc2hlbGxgLCBzbyBpdCByZXBvcnRzIGBraW5kOiAnY3VzdG9tLXRvb2wnYCBpbnN0ZWFkLlxuXHRcdFx0Y29uc3QgY3VzdG9tU2hlbGxUb29sTmFtZSA9IHJlcXVlc3Qua2luZCA9PT0gJ2N1c3RvbS10b29sJ1xuXHRcdFx0XHQmJiB0eXBlb2YgcmVxdWVzdC50b29sTmFtZSA9PT0gJ3N0cmluZydcblx0XHRcdFx0JiYgaXNTaGVsbFRvb2wocmVxdWVzdC50b29sTmFtZSlcblx0XHRcdFx0PyByZXF1ZXN0LnRvb2xOYW1lXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgaXNTaGVsbFJlcXVlc3QgPSByZXF1ZXN0LmtpbmQgPT09ICdzaGVsbCcgfHwgY3VzdG9tU2hlbGxUb29sTmFtZSAhPT0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgdHJhY2tlZFRvb2xOYW1lID0gdGhpcy5fYWN0aXZlVG9vbENhbGxzLmdldCh0b29sQ2FsbElkKT8udG9vbE5hbWU7XG5cdFx0XHRjb25zdCBzaGVsbFRvb2xOYW1lID0gcmVxdWVzdC5raW5kID09PSAnc2hlbGwnXG5cdFx0XHRcdD8gdHJhY2tlZFRvb2xOYW1lXG5cdFx0XHRcdDogY3VzdG9tU2hlbGxUb29sTmFtZTtcblx0XHRcdC8vIE9ubHkgZW1pdCBhIGxhbmd1YWdlIHdoZW4gdGhlIGV4ZWN1dGluZyBzaGVsbCB0b29sIGlzIGtub3duLlxuXHRcdFx0Ly8gTWlzc2luZyBsYW5ndWFnZSBmYWlscyBjbG9zZWQgaW4gU2Vzc2lvblBlcm1pc3Npb25NYW5hZ2VyLlxuXHRcdFx0Y29uc3Qgc2hlbGxMYW5ndWFnZTogSUFnZW50VG9vbFBlbmRpbmdDb25maXJtYXRpb25TaWduYWxbJ3NoZWxsTGFuZ3VhZ2UnXSA9XG5cdFx0XHRcdGlzU2hlbGxSZXF1ZXN0ICYmIChzaGVsbFRvb2xOYW1lID09PSAnYmFzaCcgfHwgc2hlbGxUb29sTmFtZSA9PT0gJ3Bvd2Vyc2hlbGwnKVxuXHRcdFx0XHRcdD8gc2hlbGxUb29sTmFtZVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGlzU2hlbGxSZXF1ZXN0ICYmIHNoZWxsTGFuZ3VhZ2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBTaGVsbCBwZXJtaXNzaW9uIHJlcXVlc3QgaGFzIG5vIHJlY29nbml6ZWQgc2hlbGwgdG9vbCBuYW1lOyByZXF1aXJpbmcgY29uZmlybWF0aW9uOiB0b29sQ2FsbElkPSR7dG9vbENhbGxJZH0sIHRvb2xOYW1lPSR7c2hlbGxUb29sTmFtZSA/PyAnKG1pc3NpbmcpJ31gKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFtYW5hZ2VkQXBwcm92YWxSZXF1aXJlZCAmJiByZXF1ZXN0LmtpbmQgPT09ICdjdXN0b20tdG9vbCdcblx0XHRcdFx0JiYgdHlwZW9mIHJlcXVlc3QudG9vbE5hbWUgPT09ICdzdHJpbmcnXG5cdFx0XHRcdCYmIHRoaXMuX2NsaWVudFRvb2xOYW1lcy5oYXModGhpcy5fY2xpZW50VG9vbE5hbWUocmVxdWVzdC50b29sTmFtZSkpXG5cdFx0XHRcdCYmIHRoaXMuX3BlbmRpbmdDbGllbnRUb29sQ2FsbHMuaGFzQnVmZmVyZWRSZXN1bHQodG9vbENhbGxJZClcblx0XHRcdCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBBdXRvLWFwcHJvdmluZyBjbGllbnQgdG9vbCAke3JlcXVlc3QudG9vbE5hbWV9IGJlY2F1c2UgaXRzIHJlc3VsdCBhcnJpdmVkIGJlZm9yZSB0aGUgcGVybWlzc2lvbiByZXF1ZXN0YCk7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdhcHByb3ZlLW9uY2UnIH07XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIFJlcXVlc3RpbmcgY29uZmlybWF0aW9uIGZvciB0b29sIGNhbGw6ICR7dG9vbENhbGxJZH1gKTtcblxuXHRcdFx0Y29uc3QgcGVuZGluZ1Blcm1pc3Npb24gPSB0aGlzLl9wZW5kaW5nUGVybWlzc2lvbnMucmVnaXN0ZXIodG9vbENhbGxJZCwgeyBtYW5hZ2VkQXBwcm92YWxSZXF1aXJlZCB9KTtcblxuXHRcdFx0Ly8gQXV0by1hcHByb3ZlIHNoZWxsIGNvbW1hbmRzIHRoYXQgcnVuIHNhbmRib3hlZCBieSBkZWZhdWx0LCBzaW5jZSB0aGVcblx0XHRcdC8vIHNhbmRib3ggYWxyZWFkeSBjb250YWlucyB0aGVtLiBDb21tYW5kcyB0aGF0IG9wdGVkIE9VVCBvZiB0aGUgc2FuZGJveFxuXHRcdFx0Ly8gKGByZXF1ZXN0U2FuZGJveEJ5cGFzc2ApIGFyZSBhbiBlbGV2YXRpb24gb2YgcHJpdmlsZWdlIGFuZCBtdXN0XG5cdFx0XHQvLyBmYWxsIHRocm91Z2ggdG8gdGhlIG5vcm1hbCBjb25maXJtYXRpb24gZmxvdyBcdTIwMTQgb3RoZXJ3aXNlIGVuYWJsaW5nXG5cdFx0XHQvLyBgc2FuZGJveC5hbGxvd0J5cGFzc2Agd291bGQgbGV0IHRoZSBtb2RlbCBlc2NhcGUgdGhlIHNhbmRib3ggd2l0aCBub1xuXHRcdFx0Ly8gcHJvbXB0IGF0IGFsbC5cblx0XHRcdGlmICghbWFuYWdlZEFwcHJvdmFsUmVxdWlyZWQgJiYgaXNTaGVsbFJlcXVlc3QgJiYgIXJlcXVlc3QucmVxdWVzdFNhbmRib3hCeXBhc3MgJiYgYXdhaXQgdGhpcy5faXNTaGVsbFNhbmRib3hlZEJ5RGVmYXVsdCgpKSB7XG5cdFx0XHRcdC8vIFNlc3Npb24gbWF5IGhhdmUgYmVlbiBkaXNwb3NlZCB3aGlsZSB3ZSBhd2FpdGVkIHRoZSBlbmdpbmVcblx0XHRcdFx0Ly8gY2hlY2s7IGlmIHNvIHRoZSBkZWZlcnJlZCBoYXMgYWxyZWFkeSBiZWVuIHNldHRsZWQgYW5kXG5cdFx0XHRcdC8vIHJlbW92ZWQsIHNvIGxlYXZlIGl0IGFsb25lLlxuXHRcdFx0XHRpZiAodGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLmhhcyh0b29sQ2FsbElkKSkge1xuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdQZXJtaXNzaW9ucy5yZXNwb25kKHRvb2xDYWxsSWQsIHsga2luZDogJ2FwcHJvdmUtb25jZScgfSk7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gQXV0by1hcHByb3Zpbmcgc2FuZGJveGVkIHNoZWxsIGNvbW1hbmQgZm9yIHRvb2wgY2FsbCAke3Rvb2xDYWxsSWR9YCk7XG5cdFx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2FwcHJvdmUtb25jZScgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAncmVqZWN0JyB9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGb3Igd3JpdGUgcGVybWlzc2lvbiByZXF1ZXN0cywgYnVpbGQgYSBGaWxlRWRpdCBwcmV2aWV3IHNvIHRoZVxuXHRcdFx0Ly8gY2xpZW50IGNhbiBzaG93IGEgZGlmZiBiZWZvcmUgdGhlIHVzZXIgYXBwcm92ZXMgb3IgZGVuaWVzLiBUaGlzXG5cdFx0XHQvLyBhd2FpdHMgYXN5bmMgZmlsZXN5c3RlbSBvcGVyYXRpb25zOyB0aGUgU0RLIGFscmVhZHkgY2FsbHNcblx0XHRcdC8vIGBoYW5kbGVQZXJtaXNzaW9uUmVxdWVzdGAgZnJvbSBhbiBhcmJpdHJhcnkgYXN5bmMgY29udGV4dCwgc28gdGhlXG5cdFx0XHQvLyBleHRyYSBhd2FpdCBoZXJlIGlzIGZpbmUuXG5cdFx0XHRjb25zdCBlZGl0cyA9IGF3YWl0IHRoaXMuX2J1aWxkRWRpdHNGb3JQZXJtaXNzaW9uKHJlcXVlc3QsIHRvb2xDYWxsSWQpO1xuXG5cdFx0XHQvLyBJZiB0aGUgc2Vzc2lvbiB3YXMgYWJvcnRlZC9kaXNwb3NlZCB3aGlsZSB3ZSB3ZXJlIGJ1aWxkaW5nIHRoZVxuXHRcdFx0Ly8gcHJldmlldywgdGhlIGRlZmVycmVkIGhhcyBhbHJlYWR5IGJlZW4gcmVzb2x2ZWQgYW5kIHRoZVxuXHRcdFx0Ly8gYHBlbmRpbmctZWRpdC1jb250ZW50OmAgZW50cnkgaGFzIGJlZW4gY2xlYW5lZCB1cC4gQmFpbCB3aXRob3V0XG5cdFx0XHQvLyBmaXJpbmcgdG9vbF9yZWFkeS5cblx0XHRcdGlmICghdGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLmhhcyh0b29sQ2FsbElkKSkge1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAncmVqZWN0JyB9O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc05ld0ZpbGUgPSBlZGl0cz8uaXRlbXMuc29tZShlZGl0ID0+ICFlZGl0LmJlZm9yZSAmJiAhIWVkaXQuYWZ0ZXIpO1xuXHRcdFx0Y29uc3QgeyBjb25maXJtYXRpb25UaXRsZSwgaW52b2NhdGlvbk1lc3NhZ2UsIHRvb2xJbnB1dCwgcGVybWlzc2lvbktpbmQsIHBlcm1pc3Npb25QYXRoIH0gPSBnZXRQZXJtaXNzaW9uRGlzcGxheShyZXF1ZXN0LCB0aGlzLl93b3JraW5nRGlyZWN0b3J5LCBpc05ld0ZpbGUpO1xuXG5cdFx0XHQvLyBGaXJlIGEgcGVuZGluZ19jb25maXJtYXRpb24gc2lnbmFsIHRvIHRyYW5zaXRpb24gdGhlIHRvb2wgdG8gUGVuZGluZ0NvbmZpcm1hdGlvblxuXHRcdFx0Y29uc3QgdG9vbE5hbWUgPSByZXF1ZXN0LnRvb2xOYW1lID8/IHJlcXVlc3Qua2luZDtcblx0XHRcdC8vIEZvcndhcmQgdGhlIHRvb2wncyBwYXJlbnRUb29sQ2FsbElkIChpZiBhbnkpIHNvIHRoZSBob3N0IGNhblxuXHRcdFx0Ly8gcm91dGUgdGhlIHJlc3VsdGluZyBDaGF0VG9vbENhbGxSZWFkeSB0byB0aGUgY29ycmVjdFxuXHRcdFx0Ly8gc3ViYWdlbnQgc2Vzc2lvbiBcdTIwMTQgd2l0aG91dCBpdCB0aGUgYWN0aW9uIHdvdWxkIGxhbmQgb24gdGhlXG5cdFx0XHQvLyBwYXJlbnQgc2Vzc2lvbiwgd2hpY2ggaGFzIG5vIG1hdGNoaW5nIENoYXRUb29sQ2FsbFN0YXJ0LlxuXHRcdFx0Y29uc3QgdHJhY2tlZFRvb2xDYWxsID0gdGhpcy5fYWN0aXZlVG9vbENhbGxzLmdldCh0b29sQ2FsbElkKTtcblx0XHRcdGNvbnN0IHBhcmVudFRvb2xDYWxsSWQgPSB0cmFja2VkVG9vbENhbGw/LnBhcmVudFRvb2xDYWxsSWQ7XG5cdFx0XHR0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJyxcblx0XHRcdFx0Y2hhdDogdGhpcy5fY2hhdENoYW5uZWxVcmksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0dG9vbE5hbWUsXG5cdFx0XHRcdFx0ZGlzcGxheU5hbWU6IGdldFRvb2xEaXNwbGF5TmFtZSh0b29sTmFtZSksXG5cdFx0XHRcdFx0Y29udHJpYnV0b3I6IHRyYWNrZWRUb29sQ2FsbD8uY29udHJpYnV0b3IsXG5cdFx0XHRcdFx0aW50ZW50aW9uOiB0cmFja2VkVG9vbENhbGw/LmludGVudGlvbixcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0XHR0b29sSW5wdXQsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGUsXG5cdFx0XHRcdFx0cmlza0Fzc2Vzc21lbnQ6IGF1dG9BcHByb3ZhbD8ucmVhc29uXG5cdFx0XHRcdFx0XHQ/IHtcblx0XHRcdFx0XHRcdFx0a2luZDogVG9vbENhbGxSaXNrQXNzZXNzbWVudEtpbmQuSnVkZ2UsXG5cdFx0XHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxSaXNrQXNzZXNzbWVudFN0YXR1cy5Db21wbGV0ZSxcblx0XHRcdFx0XHRcdFx0cmVhc29uOiBhdXRvQXBwcm92YWwucmVhc29uLFxuXHRcdFx0XHRcdFx0XHRzYWZldHk6IHJlY29tbWVuZGF0aW9uID09PSAnYXBwcm92ZScgPyAxIDogMCxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGVkaXRzLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZCxcblx0XHRcdFx0cGVybWlzc2lvblBhdGgsXG5cdFx0XHRcdG1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkLFxuXHRcdFx0XHRyZXF1ZXN0U2FuZGJveEJ5cGFzczogcmVxdWVzdC5yZXF1ZXN0U2FuZGJveEJ5cGFzcyxcblx0XHRcdFx0c2hlbGxMYW5ndWFnZSxcblx0XHRcdFx0cGFyZW50VG9vbENhbGxJZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwZW5kaW5nUGVybWlzc2lvbjtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIFBlcm1pc3Npb24gcmVzcG9uc2U6IHRvb2xDYWxsSWQ9JHt0b29sQ2FsbElkfSwgcmVzdWx0PSR7cmVzdWx0LmtpbmR9YCk7XG5cdFx0XHRpZiAoIW1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkICYmIHJlc3VsdC5raW5kID09PSAnYXBwcm92ZS1vbmNlJyAmJiAocmVxdWVzdC5raW5kID09PSAnd3JpdGUnIHx8IHJlcXVlc3Qua2luZCA9PT0gJ3JlYWQnKSkge1xuXHRcdFx0XHR0aGlzLl9hcHByb3ZlZER1cGxpY2FibGVQZXJtaXNzaW9uU2lnbmF0dXJlcy5zZXQodG9vbENhbGxJZCwgc2FmZVN0cmluZ2lmeShyZXF1ZXN0KSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVycm9yLCBgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEZhaWxlZCB0byBoYW5kbGUgcGVybWlzc2lvbiByZXF1ZXN0OiBraW5kPSR7cmVxdWVzdC5raW5kfSwgdG9vbENhbGxJZD0ke3JlcXVlc3QudG9vbENhbGxJZCA/PyAnbWlzc2luZyd9YCk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRJbnRlcm5hbFNlc3Npb25SZXNvdXJjZVBhdGgocmVxdWVzdDogSVR5cGVkUGVybWlzc2lvblJlcXVlc3QpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGxldCBwZXJtaXNzaW9uUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChyZXF1ZXN0LmtpbmQgPT09ICdyZWFkJykge1xuXHRcdFx0cGVybWlzc2lvblBhdGggPSB0eXBlb2YgcmVxdWVzdC5wYXRoID09PSAnc3RyaW5nJyA/IHJlcXVlc3QucGF0aCA6IHVuZGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKHJlcXVlc3Qua2luZCA9PT0gJ3dyaXRlJykge1xuXHRcdFx0cGVybWlzc2lvblBhdGggPSB0eXBlb2YgcmVxdWVzdC5maWxlTmFtZSA9PT0gJ3N0cmluZycgPyByZXF1ZXN0LmZpbGVOYW1lIDogdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghcGVybWlzc2lvblBhdGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvblN0YXRlRGlyID0gbm9ybWFsaXplUGF0aChVUkkuZmlsZShnZXRDb3BpbG90Q0xJU2Vzc2lvblN0YXRlRGlyKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS51c2VySG9tZS5mc1BhdGgpKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkRpciA9IG5vcm1hbGl6ZVBhdGgoVVJJLmpvaW5QYXRoKHNlc3Npb25TdGF0ZURpciwgdGhpcy5zZXNzaW9uSWQpKTtcblx0XHRpZiAoIWV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudChzZXNzaW9uRGlyLCBzZXNzaW9uU3RhdGVEaXIpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBlcm1pc3Npb25VcmkgPSBub3JtYWxpemVQYXRoKFVSSS5maWxlKHBlcm1pc3Npb25QYXRoKSk7XG5cdFx0cmV0dXJuIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudChwZXJtaXNzaW9uVXJpLCBzZXNzaW9uRGlyKSA/IHBlcm1pc3Npb25QYXRoIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdHJ1ZSB3aGVuIGBwZXJtaXNzaW9uUGF0aGAgbGl2ZXMgdW5kZXIgdGhpcyBzZXNzaW9uJ3Ncblx0ICogYDxzZXNzaW9uRGF0YURpcj4vYXR0YWNobWVudHNgIGRpcmVjdG9yeSBcdTIwMTQgaS5lLiB0aGUgYnl0ZXMgd2VyZVxuXHQgKiB3cml0dGVuIGJ5IHRoZSBhZ2VudCBob3N0J3MgdXNlci1tZXNzYWdlIGF0dGFjaG1lbnQgcmV3cml0ZXIgYW5kIHNvXG5cdCAqIGFyZSBhbHJlYWR5IHVzZXItc3VwcGxpZWQgY29udGVudCB0aGF0IGRvZXMgbm90IG5lZWQgdG8gYmVcblx0ICogcmUtY29uZmlybWVkIHZpYSBhIHBlcm1pc3Npb24gcHJvbXB0LlxuXHQgKi9cblx0cHJpdmF0ZSBfaXNTZXNzaW9uQXR0YWNobWVudFBhdGgocGVybWlzc2lvblBhdGg6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRzRGlyID0gbm9ybWFsaXplUGF0aChVUkkuam9pblBhdGgodGhpcy5fc2Vzc2lvbkRhdGFEaXIsIFNFU1NJT05fQVRUQUNITUVOVFNfRElSTkFNRSkpO1xuXHRcdGNvbnN0IHBlcm1pc3Npb25VcmkgPSBub3JtYWxpemVQYXRoKFVSSS5maWxlKHBlcm1pc3Npb25QYXRoKSk7XG5cdFx0cmV0dXJuIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudChwZXJtaXNzaW9uVXJpLCBhdHRhY2htZW50c0Rpcik7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIHdoZW4gc2hlbGwgY29tbWFuZHMgcnVuIGluc2lkZSBhIHNhbmRib3ggYnkgZGVmYXVsdCBcdTIwMTQgZWl0aGVyXG5cdCAqIHRocm91Z2ggdGhlIEFnZW50SG9zdCdzIG93biB7QGxpbmsgVGVybWluYWxTYW5kYm94RW5naW5lfSAod2hlbiB0aGUgY3VzdG9tXG5cdCAqIHRlcm1pbmFsIHRvb2wgaXMgZW5hYmxlZCkgb3IgdGhyb3VnaCB0aGUgU0RLJ3MgYnVpbHQtaW4gc2hlbGwgdG9vbCB3cmFwcGVkXG5cdCAqIGJ5IHRoZSBgc2FuZGJveENvbmZpZ2Agd2UgcHVzaGVkIHZpYSBgc2Vzc2lvbi5vcHRpb25zLnVwZGF0ZWAuXG5cdCAqXG5cdCAqIENhbGxlcnMgdXNlIHRoaXMgdG8gYXV0by1hcHByb3ZlIHNoZWxsIHBlcm1pc3Npb24gcHJvbXB0cyB0aGF0IHRoZSBzYW5kYm94XG5cdCAqIGFscmVhZHkgY29udGFpbnMuIENvbW1hbmRzIHRoYXQgZXhwbGljaXRseSBvcHQgb3V0IG9mIHRoZSBzYW5kYm94XG5cdCAqIChgcmVxdWVzdFNhbmRib3hCeXBhc3NgKSBhcmUgZXhjbHVkZWQgYnkgdGhlIGNhbGxlciwgc2luY2UgdGhlXG5cdCAqIHNhbmRib3ggbm8gbG9uZ2VyIGNvbnRhaW5zIHRoZW0uXG5cdCAqXG5cdCAqIFJldHVybnMgZmFsc2Ugd2hlbiBuZWl0aGVyIHNhbmRib3ggcGF0aCBpcyBjb25maWd1cmVkLCBzbyB0aGUgc3RhbmRhcmRcblx0ICogY29uZmlybWF0aW9uIGZsb3cgaXMgcHJlc2VydmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaXNTaGVsbFNhbmRib3hlZEJ5RGVmYXVsdCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAodGhpcy5faXNDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkKCkpIHtcblx0XHRcdGlmICghdGhpcy5fc2hlbGxNYW5hZ2VyKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl9zaGVsbE1hbmFnZXIuZ2V0T3JDcmVhdGVTYW5kYm94RW5naW5lKCkuaXNFbmFibGVkKCk7XG5cdFx0fVxuXHRcdC8vIFNESy1tYW5hZ2VkIHNoZWxsIHBhdGg6IGdhdGUgb24gdGhlIHNhbWUgaG9zdCBjb25maWcgdGhhdFxuXHRcdC8vIGBDb3BpbG90U2Vzc2lvbkxhdW5jaGVyYCByZWFkcyB3aGVuIGZvcndhcmRpbmcgYHNhbmRib3hDb25maWdgIHRvXG5cdFx0Ly8gdGhlIFNESywgc28gdGhlIHR3byBzdGF5IGluIGxvY2stc3RlcC5cblx0XHRyZXR1cm4gdGhpcy5fY29tcHV0ZVNka1NhbmRib3hDb25maWcoKSAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIGB0cnVlYCB3aGVuIHRoZSBBZ2VudEhvc3QncyBvd24gc2hlbGwgdG9vbHMgKHdyYXBwZWQgYnlcblx0ICoge0BsaW5rIFRlcm1pbmFsU2FuZGJveEVuZ2luZX0pIHJlcGxhY2UgdGhlIFNESydzIGJ1aWx0LWluIHNoZWxsLiBJbiB0aGF0XG5cdCAqIG1vZGUgdGhlIFNESyBzYW5kYm94IGNvbmZpZyBpcyB1bnVzZWQsIHNvIHdlIG5laXRoZXIgZm9yd2FyZCBub3IgdG9nZ2xlIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBfaXNDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUoY29waWxvdENsaUNvbmZpZ1NjaGVtYSwgQ29waWxvdENsaUNvbmZpZ0tleS5FbmFibGVDdXN0b21UZXJtaW5hbFRvb2wpID09PSB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBTREstc2hhcGVkIHNhbmRib3ggcG9saWN5IGZvciB0aGlzIHNlc3Npb24sIG1pcnJvcmluZ1xuXHQgKiB7QGxpbmsgQ29waWxvdFNlc3Npb25MYXVuY2hlcn0ncyBjb21wdXRhdGlvbjogYHVuZGVmaW5lZGAgd2hlbiB0aGUgY3VzdG9tXG5cdCAqIHRlcm1pbmFsIHRvb2wgaXMgZW5hYmxlZCAodGhlIGhvc3QncyBvd24gdGVybWluYWwgc2FuZGJveCBlbmdpbmUgaGFuZGxlc1xuXHQgKiBjb250YWlubWVudCkgb3Igd2hlbiB0aGUgaG9zdCBzYW5kYm94IGNvbmZpZyBldmFsdWF0ZXMgdG8gZGlzYWJsZWRcblx0ICogKGluY2x1ZGluZyBvbiBXaW5kb3dzLCB3aGVyZSB0aGUgc2FuZGJveCBpcyBub3Qgc3VwcG9ydGVkKS5cblx0ICovXG5cdHByaXZhdGUgX2NvbXB1dGVTZGtTYW5kYm94Q29uZmlnKCk6IElTZGtTYW5kYm94Q29uZmlnIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5faXNDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNhbmRib3ggPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUoc2FuZGJveENvbmZpZ1NjaGVtYSwgQWdlbnRIb3N0U2FuZGJveENvbmZpZ0tleS5TYW5kYm94KTtcblx0XHRyZXR1cm4gYnVpbGRTYW5kYm94Q29uZmlnRm9yU2RrKHRoaXMuX3BsYXRmb3JtLCBzYW5kYm94KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBgdHJ1ZWAgd2hlbiB0aGUgc2Vzc2lvbiBydW5zIHdpdGggYnlwYXNzIGFwcHJvdmFscyBcdTIwMTQgZWl0aGVyIHRoZSBnbG9iYWxcblx0ICogYXV0by1hcHByb3ZlIHNldHRpbmcgb3IgdGhlIHNlc3Npb24ncyBgYXV0b0FwcHJvdmVgIChcIkFsbG93IEFsbFwiKVxuXHQgKiBsZXZlbC4gQWdlbnQgbW9kZSBpcyBhbiBvcnRob2dvbmFsIGF4aXMgYW5kIGRvZXMgbm90IGFmZmVjdCBhcHByb3ZhbHMuXG5cdCAqL1xuXHRwcml2YXRlIF9pc0J5cGFzc0FwcHJvdmFscygpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKHBsYXRmb3JtUm9vdFNjaGVtYSwgQWdlbnRIb3N0R2xvYmFsQXV0b0FwcHJvdmVFbmFibGVkQ29uZmlnS2V5KSA9PT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRFZmZlY3RpdmVWYWx1ZSh0aGlzLl9zdG9yYWdlVXJpLnRvU3RyaW5nKCksIHBsYXRmb3JtU2Vzc2lvblNjaGVtYSwgU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSkgPT09ICdhdXRvQXBwcm92ZSc7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTZGtQZXJtaXNzaW9uTW9kZSgpOiBQZXJtaXNzaW9uQWxsb3dBbGxNb2RlIHtcblx0XHRpZiAodGhpcy5faXNCeXBhc3NBcHByb3ZhbHMoKSkge1xuXHRcdFx0cmV0dXJuICdvbic7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9nZXRDb25maWd1cmVkQXBwcm92YWxMZXZlbCgpID09PSAnYXNzaXN0ZWQnXG5cdFx0XHQ/ICdhdXRvJ1xuXHRcdFx0OiAnb2ZmJztcblx0fVxuXG5cdHByaXZhdGUgX2dldENvbmZpZ3VyZWRBcHByb3ZhbExldmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEVmZmVjdGl2ZVZhbHVlKHRoaXMuX3N0b3JhZ2VVcmkudG9TdHJpbmcoKSwgcGxhdGZvcm1TZXNzaW9uU2NoZW1hLCBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlKSA/PyAnZGVmYXVsdCc7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb25maWd1cmVkQWdlbnRNb2RlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEVmZmVjdGl2ZVZhbHVlKHRoaXMuX3N0b3JhZ2VVcmkudG9TdHJpbmcoKSwgcGxhdGZvcm1TZXNzaW9uU2NoZW1hLCBTZXNzaW9uQ29uZmlnS2V5Lk1vZGUpID8/ICdpbnRlcmFjdGl2ZSc7XG5cdH1cblxuXHRwcml2YXRlIF9zdWJzY3JpYmVUb1Blcm1pc3Npb25Db25maWdDaGFuZ2VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkUm9vdENvbmZpZ0NoYW5nZSgoKSA9PiB7XG5cdFx0XHR2b2lkIHRoaXMuX3N5bmNQZXJtaXNzaW9uTW9kZUFmdGVyQ29uZmlnQ2hhbmdlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkU2Vzc2lvbkNvbmZpZ0NoYW5nZShldmVudCA9PiB7XG5cdFx0XHRpZiAoZXZlbnQuc2Vzc2lvbiA9PT0gdGhpcy5fc3RvcmFnZVVyaS50b1N0cmluZygpICYmIE9iamVjdC5oYXNPd24oZXZlbnQuY29uZmlnLCBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlKSkge1xuXHRcdFx0XHR2b2lkIHRoaXMuX3N5bmNQZXJtaXNzaW9uTW9kZUFmdGVyQ29uZmlnQ2hhbmdlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3luY1Blcm1pc3Npb25Nb2RlQWZ0ZXJDb25maWdDaGFuZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuc3luY1Blcm1pc3Npb25Nb2RlKCdjb25maWctY2hhbmdlJyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IsIGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gRmFpbGVkIHRvIGFwcGx5IHBlcm1pc3Npb24gY29uZmlnIGNoYW5nZTsgYWJvcnRpbmcgYWN0aXZlIHR1cm5gKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuYWJvcnQoKTtcblx0XHRcdH0gY2F0Y2ggKGFib3J0RXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihhYm9ydEVycm9yLCBgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEZhaWxlZCB0byBhYm9ydCBhZnRlciBwZXJtaXNzaW9uIGNvbmZpZyBzeW5jIGZhaWx1cmVgKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF90YWtlQXV0b0FwcHJvdmFsKHRvb2xDYWxsSWQ6IHN0cmluZyk6IFByb21pc2U8UGVybWlzc2lvbkF1dG9BcHByb3ZhbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLl9hdXRvQXBwcm92YWxzLmhhcyh0b29sQ2FsbElkKSkge1xuXHRcdFx0Y29uc3QgYXV0b0FwcHJvdmFsID0gdGhpcy5fYXV0b0FwcHJvdmFscy5nZXQodG9vbENhbGxJZCkgPz8gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fYXV0b0FwcHJvdmFscy5kZWxldGUodG9vbENhbGxJZCk7XG5cdFx0XHRyZXR1cm4gYXV0b0FwcHJvdmFsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcGVuZGluZ0F1dG9BcHByb3ZhbHMucmVnaXN0ZXIodG9vbENhbGxJZCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvcmRBdXRvQXBwcm92YWwodG9vbENhbGxJZDogc3RyaW5nLCBhdXRvQXBwcm92YWw6IFBlcm1pc3Npb25BdXRvQXBwcm92YWwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcGVuZGluZ0F1dG9BcHByb3ZhbHMucmVzcG9uZCh0b29sQ2FsbElkLCBhdXRvQXBwcm92YWwpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2F1dG9BcHByb3ZhbHMuc2V0KHRvb2xDYWxsSWQsIGF1dG9BcHByb3ZhbCA/PyBudWxsKTtcblx0fVxuXG5cdHN5bmNQZXJtaXNzaW9uTW9kZShzb3VyY2U6ICdjb25maWctY2hhbmdlJyB8ICd0dXJuLXN0YXJ0Jyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wZXJtaXNzaW9uTW9kZVNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlID0gdGhpcy5fZ2V0U2RrUGVybWlzc2lvbk1vZGUoKTtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRMZXZlbCA9IHRoaXMuX2dldENvbmZpZ3VyZWRBcHByb3ZhbExldmVsKCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBTeW5jaW5nIHBlcm1pc3Npb24gbW9kZTogc291cmNlPSR7c291cmNlfSwgYWdlbnRNb2RlPSR7dGhpcy5fZ2V0Q29uZmlndXJlZEFnZW50TW9kZSgpfSwgY29uZmlndXJlZExldmVsPSR7Y29uZmlndXJlZExldmVsfSwgc2RrTW9kZT0ke21vZGV9LCBwcmV2aW91c1Nka01vZGU9JHt0aGlzLl9sYXN0QXBwbGllZFBlcm1pc3Npb25Nb2RlID8/ICd1bmtub3duJ30sIGdsb2JhbEF1dG9BcHByb3ZlPSR7dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKHBsYXRmb3JtUm9vdFNjaGVtYSwgQWdlbnRIb3N0R2xvYmFsQXV0b0FwcHJvdmVFbmFibGVkQ29uZmlnS2V5KSA9PT0gdHJ1ZX1gKTtcblx0XHRcdGNvbnN0IGV4cGVyaW1lbnRhbE1vZGVFbmFibGVkID0gbW9kZSA9PT0gJ2F1dG8nO1xuXHRcdFx0aWYgKHRoaXMuX2F1dG9BcHByb3ZhbEV4cGVyaW1lbnRhbE1vZGVFbmFibGVkICE9PSBleHBlcmltZW50YWxNb2RlRW5hYmxlZCkge1xuXHRcdFx0XHRjb25zdCBleHBlcmltZW50YWxSZXN1bHQgPSBhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLm9wdGlvbnMudXBkYXRlKHsgaXNFeHBlcmltZW50YWxNb2RlOiBleHBlcmltZW50YWxNb2RlRW5hYmxlZCB9KTtcblx0XHRcdFx0aWYgKCFleHBlcmltZW50YWxSZXN1bHQuc3VjY2Vzcykge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ29waWxvdCBTREsgcmVqZWN0ZWQgZXhwZXJpbWVudGFsIG1vZGUgdXBkYXRlIHJlcXVpcmVkIGJ5IHBlcm1pc3Npb24gbW9kZSAnJHttb2RlfSdgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9hdXRvQXBwcm92YWxFeHBlcmltZW50YWxNb2RlRW5hYmxlZCA9IGV4cGVyaW1lbnRhbE1vZGVFbmFibGVkO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSAke2V4cGVyaW1lbnRhbE1vZGVFbmFibGVkID8gJ0VuYWJsZWQnIDogJ0Rpc2FibGVkJ30gU0RLIGV4cGVyaW1lbnRhbCBtb2RlIGZvciBwZXJtaXNzaW9uIG1vZGUgJyR7bW9kZX0nYCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fbGFzdEFwcGxpZWRQZXJtaXNzaW9uTW9kZSA9PT0gbW9kZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLnBlcm1pc3Npb25zLnNldEFsbG93QWxsKHsgbW9kZSB9KTtcblx0XHRcdGlmICghcmVzdWx0LnN1Y2Nlc3MgfHwgKHJlc3VsdC5tb2RlICE9PSB1bmRlZmluZWQgJiYgcmVzdWx0Lm1vZGUgIT09IG1vZGUpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ29waWxvdCBTREsgcmVqZWN0ZWQgcGVybWlzc2lvbiBtb2RlICcke21vZGV9J2ApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbGFzdEFwcGxpZWRQZXJtaXNzaW9uTW9kZSA9IG1vZGU7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQXBwbHkgdGhlIFNESyBzYW5kYm94IHBvbGljeSBmb3IgdGhlIHJlcXVlc3QgdGhhdCBpcyBhYm91dCB0byBiZSBzZW50LlxuXHQgKlxuXHQgKiBTa2lwcyB0aGUgU0RLIHNhbmRib3ggZW50aXJlbHkgd2hlbiB0aGUgY3VzdG9tIHRlcm1pbmFsIHRvb2wgaXMgZW5hYmxlZFxuXHQgKiAodGhlIGhvc3QncyBvd24gdGVybWluYWwgc2FuZGJveCBlbmdpbmUgaGFuZGxlcyBjb250YWlubWVudCBhbmQgdGhlIFNESydzXG5cdCAqIGJ1aWx0LWluIHNoZWxsIGlzIHVudXNlZCkuIE90aGVyd2lzZSBpdCBhbHdheXMgcHVzaGVzIHRoZSBlZmZlY3RpdmUgc3RhdGVcblx0ICogc28gdGhlIFNESyBuZXZlciByZXRhaW5zIGEgc3RhbGUgb3IgYXV0by1kaXNjb3ZlcmVkIHNhbmRib3g6IHRoZVxuXHQgKiBjb25maWd1cmVkIHBvbGljeSB1bmxlc3MgdGhlIHJlcXVlc3QgcnVucyB3aXRoIGJ5cGFzcyBhcHByb3ZhbHMsIG9yIGFuXG5cdCAqIGV4cGxpY2l0bHkgZGlzYWJsZWQgc2FuZGJveCB3aGVuIG5vIHNhbmRib3ggaXMgY29uZmlndXJlZCAoc2V0dGluZyBvZmYsXG5cdCAqIG9yIFdpbmRvd3MpLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfYXBwbHlFZmZlY3RpdmVTYW5kYm94Q29uZmlnKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9pc0N1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzYW5kYm94ID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKHNhbmRib3hDb25maWdTY2hlbWEsIEFnZW50SG9zdFNhbmRib3hDb25maWdLZXkuU2FuZGJveCk7XG5cdFx0Y29uc3QgYmFzZSA9IGJ1aWxkU2FuZGJveENvbmZpZ0ZvclNkayh0aGlzLl9wbGF0Zm9ybSwgc2FuZGJveCk7XG5cdFx0Y29uc3Qgc2FuZGJveENvbmZpZzogSVNka1NhbmRib3hDb25maWcgfCB7IGVuYWJsZWQ6IGZhbHNlIH0gPSAoYmFzZSAmJiAhdGhpcy5faXNCeXBhc3NBcHByb3ZhbHMoKSkgPyBiYXNlIDogeyBlbmFibGVkOiBmYWxzZSB9O1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLm9wdGlvbnMudXBkYXRlKHsgc2FuZGJveENvbmZpZyB9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEZhaWxlZCB0byB1cGRhdGUgc2FuZGJveCBjb25maWcgZm9yIHJlcXVlc3RgLCBlcnIpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZHMgYW4ge0BsaW5rIEZpbGVFZGl0fSBwcmV2aWV3IGZvciBhIHdyaXRlIHBlcm1pc3Npb24gcmVxdWVzdC5cblx0ICpcblx0ICogVGhlIGBiZWZvcmVgIHNpZGUgcmVmZXJlbmNlcyB0aGUgZXhpc3RpbmcgZmlsZSBvbiBkaXNrIGRpcmVjdGx5IChpZiBpdFxuXHQgKiBleGlzdHMpOyB0aGUgYGFmdGVyYCBzaWRlIGlzIHdyaXR0ZW4gdG8gdGhlIGBwZW5kaW5nLWVkaXQtY29udGVudDpgXG5cdCAqIGluLW1lbW9yeSBmaWxlc3lzdGVtIHNvIHRoZSBjbGllbnQgY2FuIGZldGNoIGl0IHZpYSBgcmVzb3VyY2VSZWFkYC5cblx0ICpcblx0ICogUmV0dXJucyBgdW5kZWZpbmVkYCBmb3IgcGVybWlzc2lvbiBraW5kcyB0aGF0IGRvbid0IGRlc2NyaWJlIGZpbGVcblx0ICogZWRpdHMgb3Igd2hlbiB0aGUgcmVxdWVzdCBpcyBtaXNzaW5nIHRoZSBmaWVsZHMgbmVlZGVkIHRvIGJ1aWxkIGFcblx0ICogcHJldmlldy4gSWYgdGhlIHBlcm1pc3Npb24gcmVxdWVzdCBpcyBubyBsb25nZXIgcGVuZGluZyBieSB0aGUgdGltZVxuXHQgKiB0aGUgaW4tbWVtb3J5IHdyaXRlIGNvbXBsZXRlcyAoZS5nLiB0aGUgc2Vzc2lvbiB3YXMgYWJvcnRlZCksIHRoZVxuXHQgKiBqdXN0LXdyaXR0ZW4gZW50cnkgaXMgZGVsZXRlZCBzbyBpdCBjYW5ub3QgbGVhay5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2J1aWxkRWRpdHNGb3JQZXJtaXNzaW9uKHJlcXVlc3Q6IElUeXBlZFBlcm1pc3Npb25SZXF1ZXN0LCB0b29sQ2FsbElkOiBzdHJpbmcpOiBQcm9taXNlPHsgaXRlbXM6IEZpbGVFZGl0W10gfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChyZXF1ZXN0LmtpbmQgIT09ICd3cml0ZScpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGZpbGVQYXRoID0gdHlwZW9mIHJlcXVlc3QuZmlsZU5hbWUgPT09ICdzdHJpbmcnID8gcmVxdWVzdC5maWxlTmFtZSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBuZXdGaWxlQ29udGVudHMgPSB0eXBlb2YgcmVxdWVzdC5uZXdGaWxlQ29udGVudHMgPT09ICdzdHJpbmcnID8gcmVxdWVzdC5uZXdGaWxlQ29udGVudHMgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFmaWxlUGF0aCB8fCBuZXdGaWxlQ29udGVudHMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBmaWxlVXJpID0gVVJJLmZpbGUoZmlsZVBhdGgpO1xuXHRcdGNvbnN0IGZpbGVVcmlTdHIgPSBmaWxlVXJpLnRvU3RyaW5nKCk7XG5cblx0XHRsZXQgYmVmb3JlRXhpc3RzID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGJlZm9yZUV4aXN0cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyhmaWxlVXJpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEZhaWxlZCB0byBjaGVjayBmaWxlIGZvciBlZGl0IHByZXZpZXc6ICR7ZmlsZVBhdGh9YCwgZXJyKTtcblx0XHR9XG5cblx0XHRjb25zdCBhZnRlclVyaSA9IGJ1aWxkUGVuZGluZ0VkaXRDb250ZW50VXJpKHRoaXMuX3N0b3JhZ2VVcmkudG9TdHJpbmcoKSwgdG9vbENhbGxJZCwgZmlsZVBhdGgpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS53cml0ZUZpbGUoYWZ0ZXJVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3RmlsZUNvbnRlbnRzKSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBGYWlsZWQgdG8gd3JpdGUgcGVuZGluZyBlZGl0IGNvbnRlbnQgZm9yICR7ZmlsZVBhdGh9YCwgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIHJlcXVlc3Qgd2FzIGFscmVhZHkgcmVzb2x2ZWQgKGFib3J0ZWQvZGlzcG9zZWQpIHdoaWxlIHdlXG5cdFx0Ly8gd2VyZSBhd2FpdGluZyB0aGUgd3JpdGUsIGRyb3AgdGhlIGluLW1lbW9yeSBlbnRyeSBpbW1lZGlhdGVseTtcblx0XHQvLyBgX2RlbGV0ZVBlbmRpbmdFZGl0Q29udGVudGAgaGFzIGFscmVhZHkgcnVuIGFuZCB3b24ndCBydW4gYWdhaW4uXG5cdFx0aWYgKCF0aGlzLl9wZW5kaW5nUGVybWlzc2lvbnMuaGFzKHRvb2xDYWxsSWQpKSB7XG5cdFx0XHR0aGlzLl9maWxlU2VydmljZS5kZWwoYWZ0ZXJVcmkpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEZhaWxlZCB0byBkZWxldGUgb3JwaGFuZWQgcGVuZGluZyBlZGl0IGNvbnRlbnQ6ICR7YWZ0ZXJVcmkudG9TdHJpbmcoKX1gLCBlcnIpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nRWRpdENvbnRlbnRVcmlzLnNldCh0b29sQ2FsbElkLCBhZnRlclVyaSk7XG5cblx0XHRjb25zdCBkaWZmQ291bnRzID0gdHlwZW9mIHJlcXVlc3QuZGlmZiA9PT0gJ3N0cmluZycgPyBjb3VudFVuaWZpZWREaWZmTGluZXMocmVxdWVzdC5kaWZmKSA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGVkaXQ6IEZpbGVFZGl0ID0ge1xuXHRcdFx0Li4uKGJlZm9yZUV4aXN0cyA/IHsgYmVmb3JlOiB7IHVyaTogZmlsZVVyaVN0ciwgY29udGVudDogeyB1cmk6IGZpbGVVcmlTdHIgfSB9IH0gOiB7fSksXG5cdFx0XHRhZnRlcjogeyB1cmk6IGZpbGVVcmlTdHIsIGNvbnRlbnQ6IHsgdXJpOiBhZnRlclVyaS50b1N0cmluZygpIH0gfSxcblx0XHRcdC4uLihkaWZmQ291bnRzID8geyBkaWZmOiBkaWZmQ291bnRzIH0gOiB7fSksXG5cdFx0fTtcblx0XHRyZXR1cm4geyBpdGVtczogW2VkaXRdIH07XG5cdH1cblxuXHRyZXNwb25kVG9QZXJtaXNzaW9uUmVxdWVzdChyZXF1ZXN0SWQ6IHN0cmluZywgYXBwcm92ZWQ6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLnJlc3BvbmQocmVxdWVzdElkLCBhcHByb3ZlZCA/IHsga2luZDogJ2FwcHJvdmUtb25jZScgfSA6IHsga2luZDogJ2RlbmllZC1pbnRlcmFjdGl2ZWx5LWJ5LXVzZXInIH0pKSB7XG5cdFx0XHR0aGlzLl9kZWxldGVQZW5kaW5nRWRpdENvbnRlbnQocmVxdWVzdElkKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXF1ZXN0VW5zYW5kYm94ZWRDb21tYW5kQ29uZmlybWF0aW9uKHJlcXVlc3Q6IElVbnNhbmRib3hlZENvbW1hbmRDb25maXJtYXRpb25SZXF1ZXN0KTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgcGVuZGluZ1Blcm1pc3Npb24gPSB0aGlzLl9wZW5kaW5nUGVybWlzc2lvbnMucmVnaXN0ZXIocmVxdWVzdC50b29sQ2FsbElkLCB7IG1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkOiBmYWxzZSB9KTtcblxuXHRcdGNvbnN0IGRpc3BsYXlOYW1lID0gZ2V0VG9vbERpc3BsYXlOYW1lKHJlcXVlc3QudG9vbE5hbWUpO1xuXHRcdGNvbnN0IGJsb2NrZWREb21haW5zID0gcmVxdWVzdC5ibG9ja2VkRG9tYWlucz8ubGVuZ3RoID8gcmVxdWVzdC5ibG9ja2VkRG9tYWlucy5qb2luKCcsICcpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbmZpcm1hdGlvblRpdGxlID0gYmxvY2tlZERvbWFpbnNcblx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdC51bnNhbmRib3hlZENvbW1hbmRDb25maXJtYXRpb24udGl0bGUuYmxvY2tlZERvbWFpbnMnLCBcIlJ1biBDb21tYW5kIE91dHNpZGUgdGhlIFNhbmRib3ggdG8gQWNjZXNzIHswfT9cIiwgYmxvY2tlZERvbWFpbnMpXG5cdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3QudW5zYW5kYm94ZWRDb21tYW5kQ29uZmlybWF0aW9uLnRpdGxlLmdlbmVyaWMnLCBcIlJ1biBDb21tYW5kIE91dHNpZGUgdGhlIFNhbmRib3g/XCIpO1xuXHRcdGNvbnN0IGludm9jYXRpb25NZXNzYWdlID0gcmVxdWVzdC5yZWFzb25cblx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdC51bnNhbmRib3hlZENvbW1hbmRDb25maXJtYXRpb24ucmVhc29uJywgXCJSZWFzb24gZm9yIGxlYXZpbmcgdGhlIHNhbmRib3g6IHswfVwiLCByZXF1ZXN0LnJlYXNvbilcblx0XHRcdDogYmxvY2tlZERvbWFpbnNcblx0XHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRIb3N0LnVuc2FuZGJveGVkQ29tbWFuZENvbmZpcm1hdGlvbi5ibG9ja2VkRG9tYWlucycsIFwiVGhpcyBjb21tYW5kIG5lZWRzIHRvIGFjY2VzcyBibG9ja2VkIG5ldHdvcmsgZG9tYWluKHMpOiB7MH0uXCIsIGJsb2NrZWREb21haW5zKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3QudW5zYW5kYm94ZWRDb21tYW5kQ29uZmlybWF0aW9uLmdlbmVyaWMnLCBcIlRoaXMgY29tbWFuZCBuZWVkcyB0byBydW4gb3V0c2lkZSB0aGUgc2FuZGJveC5cIik7XG5cblx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbElkID0gdGhpcy5fYWN0aXZlVG9vbENhbGxzLmdldChyZXF1ZXN0LnRvb2xDYWxsSWQpPy5wYXJlbnRUb29sQ2FsbElkO1xuXHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUoe1xuXHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJyxcblx0XHRcdGNoYXQ6IHRoaXMuX2NoYXRDaGFubmVsVXJpLFxuXHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHR0b29sQ2FsbElkOiByZXF1ZXN0LnRvb2xDYWxsSWQsXG5cdFx0XHRcdHRvb2xOYW1lOiByZXF1ZXN0LnRvb2xOYW1lLFxuXHRcdFx0XHRkaXNwbGF5TmFtZSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdHRvb2xJbnB1dDogcmVxdWVzdC5jb21tYW5kLFxuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZSxcblx0XHRcdH0sXG5cdFx0XHQvLyBJbnRlbnRpb25hbGx5IG9taXQgYHBlcm1pc3Npb25LaW5kOiAnc2hlbGwnYDogdGhhdCB3b3VsZCByb3V0ZSB0aGlzXG5cdFx0XHQvLyB0aHJvdWdoIHRoZSBzaGVsbCBydWxlLWJhc2VkIGF1dG8tYXBwcm92ZXIgYW5kIHNpbGVudGx5IGFwcHJvdmVcblx0XHRcdC8vIGNvbW1vbiBzYWZlIGNvbW1hbmRzIChgcHdkYCwgYGxzYCwgZXRjLikgd2l0aG91dCBwcm9tcHRpbmcuXG5cdFx0XHQvLyBNaXJyb3JzIHRoZSB3b3JrYmVuY2gncyBzYW5kYm94LWF3YXJlIGFuYWx5emVyLCB3aGljaCBmb3JjZXNcblx0XHRcdC8vIGBpc0F1dG9BcHByb3ZlQWxsb3dlZDogZmFsc2VgIHdoZW5ldmVyIGByZXF1aXJlc1Vuc2FuZGJveENvbmZpcm1hdGlvbmBcblx0XHRcdC8vIGlzIHNldC5cblx0XHRcdHBhcmVudFRvb2xDYWxsSWQsXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gKGF3YWl0IHBlbmRpbmdQZXJtaXNzaW9uKS5raW5kID09PSAnYXBwcm92ZS1vbmNlJztcblx0fVxuXG5cdC8vIC0tLS0gdXNlciBpbnB1dCBoYW5kbGluZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogSGFuZGxlcyBhIHVzZXIgaW5wdXQgcmVxdWVzdCBmcm9tIHRoZSBTREsgKGFza191c2VyIHRvb2wpLiBBdXRvLWFuc3dlcnMgd2hlbiB0aGUgdXNlciBpcyB1bmF2YWlsYWJsZTsgb3RoZXJ3aXNlIHdhaXRzIGZvciB0aGUgcmVuZGVyZXIgdG8gcmVzcG9uZCB2aWEge0BsaW5rIHJlc3BvbmRUb1VzZXJJbnB1dFJlcXVlc3R9LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlVXNlcklucHV0UmVxdWVzdChcblx0XHRyZXF1ZXN0OiBVc2VySW5wdXRSZXF1ZXN0LFxuXHRcdF9pbnZvY2F0aW9uOiB7IHNlc3Npb25JZDogc3RyaW5nIH0sXG5cdCk6IFByb21pc2U8VXNlcklucHV0UmVzcG9uc2U+IHtcblx0XHRjb25zdCByZXF1ZXN0SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBxdWVzdGlvbklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgaW5wdXRSZXF1ZXN0OiBDaGF0SW5wdXRSZXF1ZXN0ID0ge1xuXHRcdFx0aWQ6IHJlcXVlc3RJZCxcblx0XHRcdHF1ZXN0aW9uczogW3JlcXVlc3QuY2hvaWNlcyAmJiByZXF1ZXN0LmNob2ljZXMubGVuZ3RoID4gMFxuXHRcdFx0XHQ/IHtcblx0XHRcdFx0XHRraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuU2luZ2xlU2VsZWN0LFxuXHRcdFx0XHRcdGlkOiBxdWVzdGlvbklkLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHJlcXVlc3QucXVlc3Rpb24sXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IHRydWUsXG5cdFx0XHRcdFx0b3B0aW9uczogcmVxdWVzdC5jaG9pY2VzLm1hcChjID0+ICh7IGlkOiBjLCBsYWJlbDogYyB9KSksXG5cdFx0XHRcdFx0YWxsb3dGcmVlZm9ybUlucHV0OiByZXF1ZXN0LmFsbG93RnJlZWZvcm0gPz8gdHJ1ZSxcblx0XHRcdFx0fVxuXHRcdFx0XHQ6IHtcblx0XHRcdFx0XHRraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuVGV4dCxcblx0XHRcdFx0XHRpZDogcXVlc3Rpb25JZCxcblx0XHRcdFx0XHRtZXNzYWdlOiByZXF1ZXN0LnF1ZXN0aW9uLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgaXNBdXRvcGlsb3QgPSB0aGlzLl9pc0F1dG9waWxvdE1vZGUoKTtcblx0XHRpZiAoaXNBdXRvcGlsb3QgfHwgdGhpcy5faXNBdXRvUmVwbHlFbmFibGVkKCkpIHtcblx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dFJlcXVlc3RlZCxcblx0XHRcdFx0cmVxdWVzdDogaW5wdXRSZXF1ZXN0LFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0SW5wdXRDb21wbGV0ZWQsXG5cdFx0XHRcdHJlcXVlc3RJZCxcblx0XHRcdFx0cmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQsXG5cdFx0XHRcdGFuc3dlcnM6IHtcblx0XHRcdFx0XHRbcXVlc3Rpb25JZF06IHtcblx0XHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRcdFx0XHRraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuVGV4dCxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IEFnZW50SG9zdEF1dG9SZXBseUFuc3dlcixcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0YW5zd2VyOiBBZ2VudEhvc3RBdXRvUmVwbHlBbnN3ZXIsXG5cdFx0XHRcdHdhc0ZyZWVmb3JtOiB0cnVlLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmhhc0FjdGl2ZVR1cm4pIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIFJlamVjdGluZyB1c2VyIGlucHV0IHJlcXVlc3Qgd2l0aG91dCBhbiBhY3RpdmUgdHVybmApO1xuXHRcdFx0cmV0dXJuIHsgYW5zd2VyOiAnTm8gYWN0aXZlIHR1cm4nLCB3YXNGcmVlZm9ybTogdHJ1ZSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHF1ZXN0aW9uUHJldmlldyA9IHJlcXVlc3QucXVlc3Rpb24uc3Vic3RyaW5nKDAsIDEwMCk7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIFVzZXIgaW5wdXQgcmVxdWVzdDogcmVxdWVzdElkPSR7cmVxdWVzdElkfSwgcXVlc3Rpb249XCIke3F1ZXN0aW9uUHJldmlld31cImApO1xuXG5cdFx0XHRjb25zdCBwZW5kaW5nSW5wdXQgPSB0aGlzLl9wZW5kaW5nVXNlcklucHV0cy5yZWdpc3RlcihyZXF1ZXN0SWQsIHsgcXVlc3Rpb25JZCB9KTtcblxuXHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0UmVxdWVzdGVkLFxuXHRcdFx0XHRyZXF1ZXN0OiBpbnB1dFJlcXVlc3QsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGVuZGluZ0lucHV0O1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gVXNlciBpbnB1dCByZXNwb25zZTogcmVxdWVzdElkPSR7cmVxdWVzdElkfSwgcmVzcG9uc2U9JHtyZXN1bHQucmVzcG9uc2V9YCk7XG5cblx0XHRcdGlmIChyZXN1bHQucmVzcG9uc2UgIT09IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQgfHwgIXJlc3VsdC5hbnN3ZXJzKSB7XG5cdFx0XHRcdHJldHVybiB7IGFuc3dlcjogJycsIHdhc0ZyZWVmb3JtOiB0cnVlIH07XG5cdFx0XHR9XG5cblx0XHRcdC8vIEV4dHJhY3QgdGhlIGFuc3dlciBmb3Igb3VyIHNpbmdsZSBxdWVzdGlvblxuXHRcdFx0Y29uc3QgYW5zd2VyID0gcmVzdWx0LmFuc3dlcnNbcXVlc3Rpb25JZF07XG5cdFx0XHRpZiAoIWFuc3dlciB8fCBhbnN3ZXIuc3RhdGUgPT09IENoYXRJbnB1dEFuc3dlclN0YXRlLlNraXBwZWQpIHtcblx0XHRcdFx0cmV0dXJuIHsgYW5zd2VyOiAnJywgd2FzRnJlZWZvcm06IHRydWUgfTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgeyB2YWx1ZTogdmFsIH0gPSBhbnN3ZXI7XG5cdFx0XHRpZiAodmFsLmtpbmQgPT09IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0KSB7XG5cdFx0XHRcdHJldHVybiB7IGFuc3dlcjogdmFsLnZhbHVlLCB3YXNGcmVlZm9ybTogdHJ1ZSB9O1xuXHRcdFx0fSBlbHNlIGlmICh2YWwua2luZCA9PT0gQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkKSB7XG5cdFx0XHRcdGNvbnN0IHdhc0ZyZWVmb3JtID0gIXJlcXVlc3QuY2hvaWNlcz8uaW5jbHVkZXModmFsLnZhbHVlKTtcblx0XHRcdFx0cmV0dXJuIHsgYW5zd2VyOiB2YWwudmFsdWUsIHdhc0ZyZWVmb3JtIH07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IGFuc3dlcjogJycsIHdhc0ZyZWVmb3JtOiB0cnVlIH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IsIGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gRmFpbGVkIHRvIGhhbmRsZSB1c2VyIGlucHV0IHJlcXVlc3Q6IHF1ZXN0aW9uPVwiJHtxdWVzdGlvblByZXZpZXd9XCJgKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIGFuIGVsaWNpdGF0aW9uIHJlcXVlc3QgZnJvbSB0aGUgU0RLIChNQ1Agc2VydmVyIC8gdG9vbCBwcm9tcHQpXG5cdCAqIGJ5IGZpcmluZyBhIGBzZXNzaW9uL2lucHV0UmVxdWVzdGVkYCBhY3Rpb24gYW5kIHdhaXRpbmcgZm9yIHRoZVxuXHQgKiByZW5kZXJlciB0byByZXNwb25kIHZpYSB7QGxpbmsgcmVzcG9uZFRvVXNlcklucHV0UmVxdWVzdH0uXG5cdCAqXG5cdCAqIC0gYGZvcm1gIG1vZGUgcmVxdWVzdHMgYXJlIHByb2plY3RlZCBmcm9tIHRoZSBTREsnc1xuXHQgKiAgIHtAbGluayBFbGljaXRhdGlvblNjaGVtYX0gaW50byBhIGxpc3Qgb2Zcblx0ICogICB7QGxpbmsgQ2hhdElucHV0UXVlc3Rpb259cy5cblx0ICogLSBgdXJsYCBtb2RlIHJlcXVlc3RzIHN1cmZhY2UgYXMgYSBxdWVzdGlvbi1sZXNzIGlucHV0IHJlcXVlc3Qgd2hvc2Vcblx0ICogICB7QGxpbmsgQ2hhdElucHV0UmVxdWVzdC51cmx9IGRyaXZlcyB0aGUgcmVuZGVyZXIncyBcIm9wZW4gVVJMXCJcblx0ICogICBhZmZvcmRhbmNlLlxuXHQgKlxuXHQgKiBVbmRlciBhdXRvcGlsb3QgdGhlIHJlcXVlc3QgaXMgYXV0by1jYW5jZWxsZWQgXHUyMDE0IHRoZXJlIGlzIG5vIHVzZXJcblx0ICogYXZhaWxhYmxlIHRvIGZpbGwgaW4gYSBmb3JtLCBhbmQgYWNjZXB0aW5nIHdpdGggZW1wdHkgY29udGVudCB3b3VsZFxuXHQgKiBiZSBtaXNsZWFkaW5nIHRvIHRoZSBNQ1Agc2VydmVyLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlRWxpY2l0YXRpb25SZXF1ZXN0KGNvbnRleHQ6IEVsaWNpdGF0aW9uQ29udGV4dCk6IFByb21pc2U8RWxpY2l0YXRpb25SZXN1bHQ+IHtcblx0XHRjb25zdCBpc0F1dG9waWxvdCA9IHRoaXMuX2lzQXV0b3BpbG90TW9kZSgpO1xuXHRcdGlmIChpc0F1dG9waWxvdCkge1xuXHRcdFx0cmV0dXJuIHsgYWN0aW9uOiAnY2FuY2VsJyB9O1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuaGFzQWN0aXZlVHVybikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gUmVqZWN0aW5nIGVsaWNpdGF0aW9uIHJlcXVlc3Qgd2l0aG91dCBhbiBhY3RpdmUgdHVybmApO1xuXHRcdFx0cmV0dXJuIHsgYWN0aW9uOiAnZGVjbGluZScgfTtcblx0XHR9XG5cblx0XHRjb25zdCBtZXNzYWdlUHJldmlldyA9IGNvbnRleHQubWVzc2FnZS5zdWJzdHJpbmcoMCwgMTAwKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVxdWVzdElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBFbGljaXRhdGlvbiByZXF1ZXN0OiByZXF1ZXN0SWQ9JHtyZXF1ZXN0SWR9LCBtb2RlPSR7Y29udGV4dC5tb2RlID8/ICdmb3JtJ30sIHNvdXJjZT0ke2NvbnRleHQuZWxpY2l0YXRpb25Tb3VyY2UgPz8gJzx1bmtub3duPid9LCBtZXNzYWdlPVwiJHttZXNzYWdlUHJldmlld31cImApO1xuXG5cdFx0XHRjb25zdCBzY2hlbWEgPSBjb250ZXh0Lm1vZGUgPT09ICd1cmwnID8gdW5kZWZpbmVkIDogY29udGV4dC5yZXF1ZXN0ZWRTY2hlbWE7XG5cdFx0XHRjb25zdCByZXF1aXJlZFNldCA9IG5ldyBTZXQoc2NoZW1hPy5yZXF1aXJlZCA/PyBbXSk7XG5cdFx0XHRjb25zdCBxdWVzdGlvbnM6IENoYXRJbnB1dFF1ZXN0aW9uW10gfCB1bmRlZmluZWQgPSBzY2hlbWFcblx0XHRcdFx0PyBPYmplY3QuZW50cmllcyhzY2hlbWEucHJvcGVydGllcykubWFwKChbZmllbGROYW1lLCBmaWVsZF0pID0+IGVsaWNpdGF0aW9uRmllbGRUb1F1ZXN0aW9uKGZpZWxkTmFtZSwgZmllbGQsIHJlcXVpcmVkU2V0LmhhcyhmaWVsZE5hbWUpKSlcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IHBlbmRpbmdFbGljaXRhdGlvbiA9IHRoaXMuX3BlbmRpbmdFbGljaXRhdGlvbnMucmVnaXN0ZXIocmVxdWVzdElkLCB7IHNjaGVtYSB9KTtcblxuXHRcdFx0Y29uc3QgaW5wdXRSZXF1ZXN0OiBDaGF0SW5wdXRSZXF1ZXN0ID0ge1xuXHRcdFx0XHRpZDogcmVxdWVzdElkLFxuXHRcdFx0XHRtZXNzYWdlOiBjb250ZXh0Lm1lc3NhZ2UsXG5cdFx0XHRcdC4uLihjb250ZXh0Lm1vZGUgPT09ICd1cmwnICYmIGNvbnRleHQudXJsID8geyB1cmw6IGNvbnRleHQudXJsIH0gOiB7fSksXG5cdFx0XHRcdC4uLihxdWVzdGlvbnMgJiYgcXVlc3Rpb25zLmxlbmd0aCA+IDAgPyB7IHF1ZXN0aW9ucyB9IDoge30pLFxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0UmVxdWVzdGVkLFxuXHRcdFx0XHRyZXF1ZXN0OiBpbnB1dFJlcXVlc3QsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGVuZGluZ0VsaWNpdGF0aW9uO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gRWxpY2l0YXRpb24gcmVzcG9uc2U6IHJlcXVlc3RJZD0ke3JlcXVlc3RJZH0sIHJlc3BvbnNlPSR7cmVzdWx0LnJlc3BvbnNlfWApO1xuXG5cdFx0XHRpZiAocmVzdWx0LnJlc3BvbnNlID09PSBDaGF0SW5wdXRSZXNwb25zZUtpbmQuRGVjbGluZSkge1xuXHRcdFx0XHRyZXR1cm4geyBhY3Rpb246ICdkZWNsaW5lJyB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3VsdC5yZXNwb25zZSAhPT0gQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCkge1xuXHRcdFx0XHRyZXR1cm4geyBhY3Rpb246ICdjYW5jZWwnIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhbnN3ZXJzID0gcmVzdWx0LmFuc3dlcnMgPz8ge307XG5cdFx0XHRpZiAoIXNjaGVtYSkge1xuXHRcdFx0XHRjb25zdCBmcmVlZm9ybSA9IGFuc3dlcnMuYW5zd2VyO1xuXHRcdFx0XHRpZiAoZnJlZWZvcm0gJiYgZnJlZWZvcm0uc3RhdGUgIT09IENoYXRJbnB1dEFuc3dlclN0YXRlLlNraXBwZWQgJiYgZnJlZWZvcm0udmFsdWUua2luZCA9PT0gQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBhY3Rpb246ICdhY2NlcHQnLCBjb250ZW50OiB7IGFuc3dlcjogZnJlZWZvcm0udmFsdWUudmFsdWUgfSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IGFjdGlvbjogJ2FjY2VwdCcgfTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbnRlbnQ6IFJlY29yZDxzdHJpbmcsIEVsaWNpdGF0aW9uRmllbGRWYWx1ZT4gPSB7fTtcblx0XHRcdGZvciAoY29uc3QgW2ZpZWxkTmFtZSwgZmllbGRdIG9mIE9iamVjdC5lbnRyaWVzKHNjaGVtYS5wcm9wZXJ0aWVzKSkge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IGVsaWNpdGF0aW9uQW5zd2VyVG9GaWVsZFZhbHVlKGZpZWxkLCBhbnN3ZXJzW2ZpZWxkTmFtZV0pO1xuXHRcdFx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNvbnRlbnRbZmllbGROYW1lXSA9IHZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBhY3Rpb246ICdhY2NlcHQnLCBjb250ZW50IH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IsIGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gRmFpbGVkIHRvIGhhbmRsZSBlbGljaXRhdGlvbiByZXF1ZXN0OiBtZXNzYWdlPVwiJHttZXNzYWdlUHJldmlld31cImApO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0cmVzcG9uZFRvVXNlcklucHV0UmVxdWVzdChyZXF1ZXN0SWQ6IHN0cmluZywgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZCwgYW5zd2Vycz86IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4pOiBib29sZWFuIHtcblx0XHRjb25zdCBwZW5kaW5nUGxhblJldmlldyA9IHRoaXMuX3BlbmRpbmdQbGFuUmV2aWV3cy5nZXRNZXRhZGF0YShyZXF1ZXN0SWQpO1xuXHRcdGlmIChwZW5kaW5nUGxhblJldmlldykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3BlbmRpbmdQbGFuUmV2aWV3cy5yZXNwb25kKHJlcXVlc3RJZCwgdGhpcy5fcmVzb2x2ZUV4aXRQbGFuTW9kZShwZW5kaW5nUGxhblJldmlldywgcmVzcG9uc2UsIGFuc3dlcnMpKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcGVuZGluZ0VsaWNpdGF0aW9ucy5yZXNwb25kKHJlcXVlc3RJZCwgeyByZXNwb25zZSwgYW5zd2VycyB9KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdVc2VySW5wdXRzLnJlc3BvbmQocmVxdWVzdElkLCB7IHJlc3BvbnNlLCBhbnN3ZXJzIH0pKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1hcHMgYW4gYGV4aXRfcGxhbl9tb2RlYCBpbnB1dCByZXNwb25zZSBiYWNrIHRvIGFuXG5cdCAqIHtAbGluayBJRXhpdFBsYW5Nb2RlUmVzcG9uc2V9IHRoYXQgdGhlIENMSSBjYW4gZmVlZCBpbnRvXG5cdCAqIGBzZXNzaW9uLnJlc3BvbmRUb0V4aXRQbGFuTW9kZWAuIE1hcHBpbmcgcnVsZXM6XG5cdCAqXG5cdCAqICAtIERlY2xpbmUgLyBDYW5jZWwgLyBubyBhbnN3ZXIgXHUyMTkyIGB7IGFwcHJvdmVkOiBmYWxzZSB9YCAobW9kZWwgZ2V0cyBhXG5cdCAqICAgIHJlamVjdGlvbiByZXN1bHQgYW5kIHN0YXlzIGluIHBsYW4gbW9kZSkuXG5cdCAqICAtIEFjY2VwdCArIGZyZWVmb3JtIGZlZWRiYWNrIFx1MjE5MiBgeyBhcHByb3ZlZDogZmFsc2UsIGZlZWRiYWNrLCBzZWxlY3RlZEFjdGlvbj8gfWBcblx0ICogICAgKHRoZSBTREsgdHJlYXRzIHRoaXMgYXMgYSByZXZpc2lvbiByZXF1ZXN0IGFuZCByZS1lbWl0c1xuXHQgKiAgICBgZXhpdF9wbGFuX21vZGUucmVxdWVzdGVkYCBhZnRlciByZXZpc2luZyB0aGUgcGxhbikuXG5cdCAqICAtIEFjY2VwdCArIHNlbGVjdGVkIG9wdGlvbiBcdTIxOTIgYHsgYXBwcm92ZWQ6IHRydWUsIHNlbGVjdGVkQWN0aW9uLCBhdXRvQXBwcm92ZUVkaXRzIH1gXG5cdCAqICAgIHdoZXJlIGBhdXRvQXBwcm92ZUVkaXRzYCBpcyBzZXQgZm9yIHRoZSBhdXRvcGlsb3QgdmFyaWFudHMuXG5cdCAqXG5cdCAqIGBzZWxlY3RlZEFjdGlvbmAgaXMgdmFsaWRhdGVkIGFnYWluc3QgdGhlIFNESydzIG9mZmVyZWQgYGFjdGlvbnNgOyBhblxuXHQgKiB1bmtub3duIHZhbHVlIGlzIHRyZWF0ZWQgYXMgYSBkZWNsaW5lIHNvIHRoZSBTREsgaXNuJ3QgZmVkIGEgdmFsdWUgaXRcblx0ICogY2Fubm90IGhhbmRsZS5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVFeGl0UGxhbk1vZGUoXG5cdFx0cGVuZGluZzogeyBhY3Rpb25zOiByZWFkb25seSBzdHJpbmdbXTsgcmVjb21tZW5kZWRBY3Rpb246IHN0cmluZzsgcXVlc3Rpb25JZDogc3RyaW5nIH0sXG5cdFx0cmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZCxcblx0XHRhbnN3ZXJzPzogUmVjb3JkPHN0cmluZywgQ2hhdElucHV0QW5zd2VyPixcblx0KTogSUV4aXRQbGFuTW9kZVJlc3BvbnNlIHtcblx0XHRpZiAocmVzcG9uc2UgIT09IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQpIHtcblx0XHRcdHJldHVybiB7IGFwcHJvdmVkOiBmYWxzZSB9O1xuXHRcdH1cblx0XHRjb25zdCBhbnN3ZXIgPSBhbnN3ZXJzPy5bcGVuZGluZy5xdWVzdGlvbklkXTtcblx0XHRpZiAoIWFuc3dlciB8fCBhbnN3ZXIuc3RhdGUgPT09IENoYXRJbnB1dEFuc3dlclN0YXRlLlNraXBwZWQpIHtcblx0XHRcdHJldHVybiB7IGFwcHJvdmVkOiBmYWxzZSB9O1xuXHRcdH1cblx0XHRjb25zdCB2YWx1ZSA9IGFuc3dlci52YWx1ZTtcblxuXHRcdC8vIERldGVybWluZSB0aGUgc2VsZWN0ZWQgYWN0aW9uIGFuZCBhbnkgZnJlZWZvcm0gZmVlZGJhY2suIFRoZVxuXHRcdC8vIGBzaW5nbGUtc2VsZWN0YCBxdWVzdGlvbiBtYXkgY2FycnkgYm90aCAod2hlbiB0aGUgdXNlciBwaWNrcyBhblxuXHRcdC8vIG9wdGlvbiBBTkQgdHlwZXMgZmVlZGJhY2spLCBvciBqdXN0IGZyZWVmb3JtIHRleHQgKHdoZW4gdGhlXG5cdFx0Ly8gdXNlciB0eXBlcyBpbnN0ZWFkIG9mIHBpY2tpbmcpLiBOb3JtYWxpemUgdG8gb25lIHNoYXBlLlxuXHRcdGxldCBjYW5kaWRhdGVBY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZmVlZGJhY2s6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAodmFsdWUua2luZCA9PT0gQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkKSB7XG5cdFx0XHRjYW5kaWRhdGVBY3Rpb24gPSB2YWx1ZS52YWx1ZTtcblx0XHRcdGNvbnN0IGZyZWVmb3JtID0gdmFsdWUuZnJlZWZvcm1WYWx1ZXM/LmZpbmQocyA9PiBzLnRyaW0oKS5sZW5ndGggPiAwKT8udHJpbSgpO1xuXHRcdFx0ZmVlZGJhY2sgPSBmcmVlZm9ybTtcblx0XHR9IGVsc2UgaWYgKHZhbHVlLmtpbmQgPT09IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0KSB7XG5cdFx0XHRmZWVkYmFjayA9IHZhbHVlLnZhbHVlLnRyaW0oKSB8fCB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB7IGFwcHJvdmVkOiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdC8vIENsYW1wIGBzZWxlY3RlZEFjdGlvbmAgdG8gdGhlIFNESydzIG9mZmVyZWQgc2V0LiBBbnl0aGluZyBlbHNlXG5cdFx0Ly8gKGluY2x1ZGluZyBmcmVlZm9ybSB0ZXh0IHNtdWdnbGVkIGludG8gdGhlIGB2YWx1ZWAgZmllbGQpIGZhbGxzXG5cdFx0Ly8gYmFjayB0byB0aGUgcmVjb21tZW5kZWQgYWN0aW9uIHNvIHdlIG5ldmVyIGZlZWQgdGhlIFNESyBhIHZhbHVlXG5cdFx0Ly8gaXQgY2FuJ3QgYWN0IG9uLlxuXHRcdGNvbnN0IHNlbGVjdGVkQWN0aW9uID0gY2FuZGlkYXRlQWN0aW9uICYmIHBlbmRpbmcuYWN0aW9ucy5pbmNsdWRlcyhjYW5kaWRhdGVBY3Rpb24pXG5cdFx0XHQ/IGNhbmRpZGF0ZUFjdGlvblxuXHRcdFx0OiBwZW5kaW5nLmFjdGlvbnMuaW5jbHVkZXMocGVuZGluZy5yZWNvbW1lbmRlZEFjdGlvbilcblx0XHRcdFx0PyBwZW5kaW5nLnJlY29tbWVuZGVkQWN0aW9uXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gRnJlZWZvcm0gZmVlZGJhY2sgPT4gcmV2aXNpb24gcmVxdWVzdC4gVGhlIFNESyBzZW1hbnRpY3MgYXJlXG5cdFx0Ly8gYGFwcHJvdmVkOiBmYWxzZWAgd2l0aCBhIG5vbi1lbXB0eSBgZmVlZGJhY2tgOyBpdCB3aWxsIHJldmlzZVxuXHRcdC8vIHRoZSBwbGFuIGFuZCByZS1lbWl0IGBleGl0X3BsYW5fbW9kZS5yZXF1ZXN0ZWRgLlxuXHRcdGlmIChmZWVkYmFjaykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0YXBwcm92ZWQ6IGZhbHNlLFxuXHRcdFx0XHRmZWVkYmFjayxcblx0XHRcdFx0Li4uKHNlbGVjdGVkQWN0aW9uID8geyBzZWxlY3RlZEFjdGlvbiB9IDoge30pLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBObyBzZWxlY3RhYmxlIGFjdGlvbiBhbmQgbm8gZmVlZGJhY2sgXHUyMDE0IG5vdGhpbmcgYWN0aW9uYWJsZS5cblx0XHRpZiAoIXNlbGVjdGVkQWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4geyBhcHByb3ZlZDogZmFsc2UgfTtcblx0XHR9XG5cblx0XHQvLyBSZWZsZWN0IHRoZSBjaG9zZW4gaW1wbGVtZW50YXRpb24gcGF0aCBvbiB0aGUgQUhQIGBtb2RlYCBheGlzIHJpZ2h0XG5cdFx0Ly8gYXdheSBzbyB0aGUgbW9kZSBwaWNrZXIgdXBkYXRlcyBhcyBzb29uIGFzIHRoZSB1c2VyIGFwcHJvdmVzIHRoZVxuXHRcdC8vIHBsYW4gKGUuZy4gUGxhbiBcdTIxOTIgQXV0b3BpbG90IHdoZW4gdGhleSBwaWNrIFwiSW1wbGVtZW50IHdpdGhcblx0XHQvLyBBdXRvcGlsb3RcIikuIFRoZSBTREsgYWxzbyBmaXJlcyBgc2Vzc2lvbi5tb2RlX2NoYW5nZWRgLCBidXQgdGhhdCBpc1xuXHRcdC8vIGFzeW5jOyB3cml0aW5nIGhlcmUgbWFrZXMgdGhlIFVJIHVwZGF0ZSBkZXRlcm1pbmlzdGljLiBUaGUgcGF0Y2ggaXNcblx0XHQvLyBpZGVtcG90ZW50LCBzbyB0aGUgbGF0ZXIgZXZlbnQgaXMgYSBuby1vcC5cblx0XHR0aGlzLl9zeW5jQWhwTW9kZUZyb21FeGl0UGxhbkFjdGlvbihzZWxlY3RlZEFjdGlvbik7XG5cblx0XHRjb25zdCBpc0F1dG9waWxvdCA9IHNlbGVjdGVkQWN0aW9uID09PSAnYXV0b3BpbG90JyB8fCBzZWxlY3RlZEFjdGlvbiA9PT0gJ2F1dG9waWxvdF9mbGVldCc7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFwcHJvdmVkOiB0cnVlLFxuXHRcdFx0c2VsZWN0ZWRBY3Rpb24sXG5cdFx0XHQuLi4oaXNBdXRvcGlsb3QgJiYgdGhpcy5faXNCeXBhc3NBcHByb3ZhbHMoKSA/IHsgYXV0b0FwcHJvdmVFZGl0czogdHJ1ZSB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogVHJhbnNsYXRlcyBhbiBhcHByb3ZlZCBgZXhpdF9wbGFuX21vZGVgIGFjdGlvbiBpbnRvIHRoZSBBSFAgYG1vZGVgIGF4aXNcblx0ICogYW5kIHdyaXRlcyBpdCBzbyB0aGUgbW9kZSBwaWNrZXIgcmVmbGVjdHMgdGhlIGNob2ljZSBpbW1lZGlhdGVseTpcblx0ICpcblx0ICogIC0gYGF1dG9waWxvdGAgLyBgYXV0b3BpbG90X2ZsZWV0YCBcdTIxOTIgYG1vZGU9J2F1dG9waWxvdCdgLlxuXHQgKiAgLSBgaW50ZXJhY3RpdmVgIFx1MjE5MiBgbW9kZT0naW50ZXJhY3RpdmUnYC5cblx0ICogIC0gYGV4aXRfb25seWAgKGFwcHJvdmUgcGxhbiB3aXRob3V0IGV4ZWN1dGluZykgbGVhdmVzIHRoZSBtb2RlIHVudG91Y2hlZC5cblx0ICovXG5cdHByaXZhdGUgX3N5bmNBaHBNb2RlRnJvbUV4aXRQbGFuQWN0aW9uKHNlbGVjdGVkQWN0aW9uOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRzd2l0Y2ggKHNlbGVjdGVkQWN0aW9uKSB7XG5cdFx0XHRjYXNlICdhdXRvcGlsb3QnOlxuXHRcdFx0Y2FzZSAnYXV0b3BpbG90X2ZsZWV0Jzpcblx0XHRcdFx0dGhpcy5fc3luY0FocENvbmZpZ0Zyb21TZGtNb2RlKCdhdXRvcGlsb3QnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdpbnRlcmFjdGl2ZSc6XG5cdFx0XHRcdHRoaXMuX3N5bmNBaHBDb25maWdGcm9tU2RrTW9kZSgnaW50ZXJhY3RpdmUnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlUHJlVG9vbFVzZShpbnB1dDogUHJlVG9vbFVzZUhvb2tJbnB1dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoaXNFZGl0VG9vbChpbnB1dC50b29sTmFtZSwgZ2V0VG9vbENvbW1hbmQoaW5wdXQpKSkge1xuXHRcdFx0XHRjb25zdCBmaWxlUGF0aHMgPSB0aGlzLl9nZXRFZGl0RmlsZVBhdGhzKGlucHV0LnRvb2xBcmdzKTtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoZmlsZVBhdGhzLm1hcChwID0+IHRoaXMuX2VkaXRUcmFja2VyLnRyYWNrRWRpdFN0YXJ0KHApKSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IsIGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gRmFpbGVkIGluIG9uUHJlVG9vbFVzZTogdG9vbD0ke2lucHV0LnRvb2xOYW1lfWApO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlUG9zdFRvb2xVc2UoaW5wdXQ6IFBvc3RUb29sVXNlSG9va0lucHV0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChpc0VkaXRUb29sKGlucHV0LnRvb2xOYW1lLCBnZXRUb29sQ29tbWFuZChpbnB1dCkpKSB7XG5cdFx0XHRcdGNvbnN0IGZpbGVQYXRocyA9IHRoaXMuX2dldEVkaXRGaWxlUGF0aHMoaW5wdXQudG9vbEFyZ3MpO1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChmaWxlUGF0aHMubWFwKHAgPT4gdGhpcy5fZWRpdFRyYWNrZXIuY29tcGxldGVFZGl0KHApKSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IsIGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gRmFpbGVkIGluIG9uUG9zdFRvb2xVc2U6IHRvb2w9JHtpbnB1dC50b29sTmFtZX1gKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2JlZ2luUmVwb0luZm9UZWxlbWV0cnkodGVsZW1ldHJ5TWVzc2FnZUlkOiBzdHJpbmcsIGNsaWVudFR5cGU6IEFnZW50SG9zdENsaWVudFR5cGUsIGlzQ3VycmVudDogKCkgPT4gYm9vbGVhbik6IFByb21pc2U8eyByZWFkb25seSBjb250ZXh0OiBJQWdlbnRIb3N0UmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQ7IHJlYWRvbmx5IGJhc2VCcmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IHJlc29sdmVkOiB7IHJlYWRvbmx5IGNvbnRleHQ6IElBZ2VudEhvc3RSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dDsgcmVhZG9ubHkgYmFzZUJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHJlc29sdmVkID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVJlcG9JbmZvVGVsZW1ldHJ5Q29udGV4dCgpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBGYWlsZWQgdG8gcmVzb2x2ZSByZXBvc2l0b3J5IGluZm8gdGVsZW1ldHJ5IGNvbnRleHQ6ICR7Z2V0RXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghcmVzb2x2ZWQgfHwgdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCB8fCAhaXNDdXJyZW50KCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3JlcG9JbmZvVGVsZW1ldHJ5LnJlcG9ydEJlZ2luKHJlc29sdmVkLmNvbnRleHQsIHRoaXMuc2Vzc2lvblVyaS50b1N0cmluZygpLCB0ZWxlbWV0cnlNZXNzYWdlSWQsIGNsaWVudFR5cGUsIHRoaXMuX3dvcmtpbmdEaXJlY3RvcnksIHJlc29sdmVkLmJhc2VCcmFuY2gsIGlzQ3VycmVudCk7XG5cdFx0cmV0dXJuIHJlc29sdmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZW5kUmVwb0luZm9UZWxlbWV0cnkodGVsZW1ldHJ5TWVzc2FnZUlkOiBzdHJpbmcsIHJlc29sdmVkOiB7IHJlYWRvbmx5IGNvbnRleHQ6IElBZ2VudEhvc3RSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dDsgcmVhZG9ubHkgYmFzZUJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQsIGlzQ3VycmVudDogKCkgPT4gYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghcmVzb2x2ZWQgfHwgdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCB8fCAhaXNDdXJyZW50KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fcmVwb0luZm9UZWxlbWV0cnkucmVwb3J0RW5kKHJlc29sdmVkLmNvbnRleHQsIHRoaXMuc2Vzc2lvblVyaS50b1N0cmluZygpLCB0ZWxlbWV0cnlNZXNzYWdlSWQsIHRoaXMuX3dvcmtpbmdEaXJlY3RvcnksIHJlc29sdmVkLmJhc2VCcmFuY2gsIGlzQ3VycmVudCk7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wbGV0ZUFjdGl2ZVJlcG9JbmZvVGVsZW1ldHJ5KCk6IHZvaWQge1xuXHRcdGNvbnN0IHR1cm4gPSB0aGlzLl9hY3RpdmVSZXBvSW5mb1R1cm47XG5cdFx0aWYgKCF0dXJuKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGl2ZVJlcG9JbmZvVHVybiA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBpc0N1cnJlbnQgPSAoKSA9PiAhdHVybi5jYW5jZWxsZWQgJiYgdGhpcy5faXNMYXVuY2hUb2tlbkN1cnJlbnQoKTtcblx0XHR2b2lkIHR1cm4uYmVnaW4udGhlbihyZXNvbHZlZCA9PiB0aGlzLl9lbmRSZXBvSW5mb1RlbGVtZXRyeSh0dXJuLnRlbGVtZXRyeU1lc3NhZ2VJZCwgcmVzb2x2ZWQsIGlzQ3VycmVudCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsQWN0aXZlUmVwb0luZm9UZWxlbWV0cnkoKTogdm9pZCB7XG5cdFx0Y29uc3QgdHVybiA9IHRoaXMuX2FjdGl2ZVJlcG9JbmZvVHVybjtcblx0XHRpZiAoIXR1cm4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYWN0aXZlUmVwb0luZm9UdXJuID0gdW5kZWZpbmVkO1xuXHRcdHR1cm4uY2FuY2VsbGVkID0gdHJ1ZTtcblx0XHR2b2lkIHR1cm4uYmVnaW4uZmluYWxseSgoKSA9PiB0aGlzLl9yZXBvSW5mb1RlbGVtZXRyeS5jbGVhclR1cm4odHVybi50ZWxlbWV0cnlNZXNzYWdlSWQpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVSZXBvSW5mb1RlbGVtZXRyeUNvbnRleHQoKTogUHJvbWlzZTx7IHJlYWRvbmx5IGNvbnRleHQ6IElBZ2VudEhvc3RSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dDsgcmVhZG9ubHkgYmFzZUJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKHBsYXRmb3JtUm9vdFNjaGVtYSwgQWdlbnRIb3N0RGlzYWJsZVJlcG9JbmZvVGVsZW1ldHJ5Q29uZmlnS2V5KSA9PT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZ2l0aHViVG9rZW4gPSB0aGlzLl9sYXVuY2hQbGFuLmdpdGh1YlRva2VuO1xuXHRcdGlmICghZ2l0aHViVG9rZW4pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IFtyYXdDb250ZXh0LCBiYXNlQnJhbmNoXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuX2NvcGlsb3RBcGlTZXJ2aWNlLnJlc29sdmVSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dChnaXRodWJUb2tlbiksXG5cdFx0XHR0aGlzLl9kYXRhYmFzZVJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoTUVUQV9ESUZGX0JBU0VfQlJBTkNIKSxcblx0XHRdKTtcblx0XHRpZiAoIXJhd0NvbnRleHQucmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQgJiYgIXJhd0NvbnRleHQuaXNJbnRlcm5hbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHsgY29udGV4dDogdGhpcy5fdG9SZXBvSW5mb1RlbGVtZXRyeUNvbnRleHQocmF3Q29udGV4dCksIGJhc2VCcmFuY2ggfTtcblx0fVxuXG5cdHByaXZhdGUgX2lzTGF1bmNoVG9rZW5DdXJyZW50KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9sYXVuY2hQbGFuLmdpdGh1YlRva2VuICE9PSB1bmRlZmluZWQgJiYgdGhpcy5faXNMYXVuY2hUb2tlblN0aWxsQ3VycmVudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9SZXBvSW5mb1RlbGVtZXRyeUNvbnRleHQoY29udGV4dDogSVJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0KTogSUFnZW50SG9zdFJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQ6IGNvbnRleHQucmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQsXG5cdFx0XHR0cmFja2luZ0lkOiBjb250ZXh0LnRyYWNraW5nSWQsXG5cdFx0XHR0ZWxlbWV0cnlFbmRwb2ludDogY29udGV4dC50ZWxlbWV0cnlFbmRwb2ludCA/IGAke2NvbnRleHQudGVsZW1ldHJ5RW5kcG9pbnQucmVwbGFjZSgvXFwvKyQvLCAnJyl9L3RlbGVtZXRyeWAgOiB1bmRlZmluZWQsXG5cdFx0XHRpc0ludGVybmFsOiBjb250ZXh0LmlzSW50ZXJuYWwgPT09IHRydWUsXG5cdFx0XHR1c2VyTmFtZTogY29udGV4dC51c2VyTmFtZSxcblx0XHRcdGlzVnNjb2RlVGVhbU1lbWJlcjogY29udGV4dC5pc1ZzY29kZVRlYW1NZW1iZXIgPT09IHRydWUsXG5cdFx0XHRjb3BpbG90SWdub3JlRW5hYmxlZDogY29udGV4dC5jb3BpbG90SWdub3JlRW5hYmxlZCxcblx0XHR9O1xuXHR9XG5cblx0Ly8gLS0tLSBldmVudCB3aXJpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX3N1YnNjcmliZVRvRXZlbnRzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHdyYXBwZXIgPSB0aGlzLl93cmFwcGVyO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHRoaXMuc2Vzc2lvbklkO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblN5c3RlbU5vdGlmaWNhdGlvbihlID0+IHtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IGJ1aWxkQ29waWxvdFN5c3RlbU5vdGlmaWNhdGlvbihlKTtcblx0XHRcdGlmICghbm90aWZpY2F0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gSWdub3Jpbmcgc3lzdGVtLm5vdGlmaWNhdGlvbiBraW5kPSR7ZS5kYXRhLmtpbmQudHlwZX1gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gU3lzdGVtIG5vdGlmaWNhdGlvbiByZWNlaXZlZDoga2luZD0ke2UuZGF0YS5raW5kLnR5cGV9YCk7XG5cdFx0XHRpZiAodGhpcy5fdHVybklkKSB7XG5cdFx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCxcblx0XHRcdFx0XHR0dXJuSWQ6IHRoaXMuX3R1cm5JZCxcblx0XHRcdFx0XHRwYXJ0OiB7XG5cdFx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlN5c3RlbU5vdGlmaWNhdGlvbixcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IG5vdGlmaWNhdGlvbi5tZXNzYWdlVGV4dCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFub3RpZmljYXRpb24uc3RhcnRzVHVybikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIElnbm9yaW5nIHBhc3NpdmUgc3lzdGVtLm5vdGlmaWNhdGlvbiBraW5kPSR7ZS5kYXRhLmtpbmQudHlwZX0gd2l0aG91dCBhbiBhY3RpdmUgdHVybmApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHR1cm5JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0dGhpcy5yZXNldFR1cm5TdGF0ZSh0dXJuSWQpO1xuXHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogbm90aWZpY2F0aW9uLm1lc3NhZ2VUZXh0LFxuXHRcdFx0XHRcdG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5TeXN0ZW1Ob3RpZmljYXRpb24gfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdC8vIEhhbmRsZSBgdXNlci5tZXNzYWdlYCBldmVudHMgd2l0aCB0aHJlZSByZXNwb25zaWJpbGl0aWVzOlxuXHRcdC8vXG5cdFx0Ly8gMS4gU2tpcCBzdWJhZ2VudCBhbmQgU0RLLWluamVjdGVkIChgc291cmNlICE9PSAndXNlcidgKSBtZXNzYWdlc1xuXHRcdC8vICAgIG91dHJpZ2h0IFx1MjAxNCBuZWl0aGVyIHJlcHJlc2VudHMgYSByb290IHVzZXIgdHVybiBhbmQgbmVpdGhlciBtYXlcblx0XHQvLyAgICBiZSBhc3NvY2lhdGVkIHdpdGggdGhlIHJvb3QgdHVybiBib3VuZGFyeS5cblx0XHQvL1xuXHRcdC8vIDIuIElmIHRoZSBjb250ZW50IG1hdGNoZXMgYSBzdGVlcmluZyBtZXNzYWdlIHdlIGFja25vd2xlZGdlZFxuXHRcdC8vICAgIHZpYSB7QGxpbmsgc2VuZFN0ZWVyaW5nfSwgcHJvbW90ZSBpdCB0byBpdHMgb3duIHByb3RvY29sXG5cdFx0Ly8gICAgdHVybiAoY2xvc2luZyB0aGUgaW4tZmxpZ2h0IHR1cm4pIEJFRk9SRSBzdGVwIDMgc28gdGhlXG5cdFx0Ly8gICAgZXZlbnQgaWQgaXMgcmVjb3JkZWQgYWdhaW5zdCB0aGUgbmV3IHN0ZWVyaW5nIHR1cm4gcmF0aGVyXG5cdFx0Ly8gICAgdGhhbiB0aGUgcHJlZW1wdGVkIG9uZS5cblx0XHQvL1xuXHRcdC8vIDMuIFJlY29yZCB0aGUgU0RLIGV2ZW50IGlkIGFnYWluc3QgdGhlIGN1cnJlbnQgdHVybiBzbyB0aGVcblx0XHQvLyAgICBgaGlzdG9yeS50cnVuY2F0ZWAgLyBgc2Vzc2lvbnMuZm9ya2AgUlBDcyBjYW4gdGFyZ2V0IHRoZVxuXHRcdC8vICAgIHJpZ2h0IGJvdW5kYXJ5LiBUaGUgREIgb25seSBzZXRzIGBldmVudF9pZGAgd2hlbiBpdCdzIE5VTEwsXG5cdFx0Ly8gICAgc28gZG9pbmcgdGhpcyBmb3Igc3ludGhldGljIGluamVjdGlvbnMgd291bGQgcGVybWFuZW50bHlcblx0XHQvLyAgICBwaW4gdGhlIHdyb25nIGV2ZW50IHRvIHRoZSB0dXJuLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Vc2VyTWVzc2FnZShlID0+IHtcblx0XHRcdGlmIChlLmFnZW50SWQpIHtcblx0XHRcdFx0dGhpcy5fcmVzdW1lU3ViYWdlbnRGb3JFdmVudChlLCB7IHRleHQ6IGUuZGF0YS5jb250ZW50LCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5kYXRhLnNvdXJjZSAmJiBlLmRhdGEuc291cmNlLnRvTG93ZXJDYXNlKCkgIT09ICd1c2VyJykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBGaXJzdCBTREsgZXZlbnQgZm9yIHRoZSBsb29wOiBwcm9tb3RlIHRoZSB0dXJuIG91dCBvZiBgcGVuZGluZ2AuXG5cdFx0XHR0aGlzLl9jdXJyZW50VHVybj8ubWFya1J1bm5pbmcoKTtcblx0XHRcdGNvbnN0IHN0ZWVyaW5nID0gdGhpcy5fdGFrZU1hdGNoaW5nUGVuZGluZ1N0ZWVyaW5nKGUuZGF0YS5jb250ZW50KTtcblx0XHRcdGlmIChzdGVlcmluZykge1xuXHRcdFx0XHR0aGlzLl9iZWdpblN0ZWVyaW5nVHVybihzdGVlcmluZyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fdHVybklkKSB7XG5cdFx0XHRcdHRoaXMuX2RhdGFiYXNlUmVmLm9iamVjdC5zZXRUdXJuRXZlbnRJZCh0aGlzLl90dXJuSWQsIGUuaWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25NZXNzYWdlRGVsdGEoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIGRlbHRhOiAke2UuZGF0YS5kZWx0YUNvbnRlbnR9YCk7XG5cdFx0XHR0aGlzLl9yZXN1bWVTdWJhZ2VudEZvckV2ZW50KGUpO1xuXHRcdFx0aWYgKHRoaXMuX3Nob3VsZERyb3BVbm1hcHBlZFN1YmFnZW50RXZlbnQoZSwgJ2Fzc2lzdGFudC5tZXNzYWdlX2RlbHRhJykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZW1pdE1hcmtkb3duRGVsdGEoZS5kYXRhLmRlbHRhQ29udGVudCwgdGhpcy5fcGFyZW50VG9vbENhbGxJZEZvclN1YmFnZW50RXZlbnQoZSkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25NZXNzYWdlKGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIEZ1bGwgbWVzc2FnZSByZWNlaXZlZDogJHtlLmRhdGEuY29udGVudC5sZW5ndGh9IGNoYXJzYCk7XG5cdFx0XHR0aGlzLl9yZXN1bWVTdWJhZ2VudEZvckV2ZW50KGUpO1xuXHRcdFx0Ly8gUmVwb3J0IHRoZSBlbmhhbmNlZCBHSCBgcmVxdWVzdC5vcHRpb25zLnRvb2xzYCBldmVudCBmb3IgdGhpcyBtb2RlbCBjYWxsIFx1MjAxNCBwYXJpdHkgd2l0aFxuXHRcdFx0Ly8gdGhlIENvcGlsb3QgZXh0ZW5zaW9uLCB3aGljaCBlbWl0cyBpdCBwZXIgTExNIHJlcXVlc3QuIGBhc3Npc3RhbnQubWVzc2FnZWAgaXMgdGhlXG5cdFx0XHQvLyBhZ2VudC1ob3N0J3MgcGVyLW1vZGVsLWNhbGwgYm91bmRhcnk7IHdlIGNvcnJlbGF0ZSBvbiBpdHMgY2xpZW50LW1pbnRlZCBgeC1yZXF1ZXN0LWlkYC5cblx0XHRcdC8vIE1haW4gYWdlbnQgb25seTogYF9hcHBsaWVkU25hcHNob3QudG9vbHNgIGlzIHRoZSBzZXNzaW9uJ3MgdG9vbCBzZXQsIHdoaWNoIGRvZXMgbm90XG5cdFx0XHQvLyBkZXNjcmliZSBhIHN1YmFnZW50J3MgbW9kZWwgY2FsbCwgc28gc3ViYWdlbnQgbWVzc2FnZXMgKG1hcHBlZCBvciBkcm9wcGVkKSBhcmUgc2tpcHBlZC5cblx0XHRcdGlmICghZS5hZ2VudElkKSB7XG5cdFx0XHRcdGNvbnN0IGNsaWVudFR5cGUgPSB0aGlzLl9jdXJyZW50VHVybj8uY2xpZW50VHlwZSA/PyBBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd247XG5cdFx0XHRcdHZvaWQgdGhpcy5fdGVsZW1ldHJ5UmVwb3J0ZXIuYXNzaXN0YW50TWVzc2FnZVJlY2VpdmVkKHRoaXMuc2Vzc2lvblVyaS50b1N0cmluZygpLCBjbGllbnRUeXBlLCBlLmRhdGEuY2xpZW50UmVxdWVzdElkLCB0aGlzLl9hcHBsaWVkU25hcHNob3QudG9vbHMpLmNhdGNoKGVyciA9PiB0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gVGVsZW1ldHJ5IGVtaXNzaW9uIGZhaWxlZDogJHtnZXRFcnJvck1lc3NhZ2UoZXJyKX1gKSk7XG5cdFx0XHRcdC8vIFJlc3RyaWN0ZWQgYGNvbnZlcnNhdGlvbi5tZXNzYWdlVGV4dGAgKHNvdXJjZT1tb2RlbCk6IHRoZSBtb2RlbCdzIHJhdyByZXNwb25zZSB0ZXh0LlxuXHRcdFx0XHR2b2lkIHRoaXMuX3RlbGVtZXRyeVJlcG9ydGVyLm1vZGVsTWVzc2FnZVRleHQodGhpcy5zZXNzaW9uVXJpLnRvU3RyaW5nKCksIGNsaWVudFR5cGUsIGUuZGF0YS5jb250ZW50LCB0aGlzLl90dXJuT3JkaW5hbCwgZS5kYXRhLmNsaWVudFJlcXVlc3RJZCkuY2F0Y2goZXJyID0+IHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBUZWxlbWV0cnkgZW1pc3Npb24gZmFpbGVkOiAke2dldEVycm9yTWVzc2FnZShlcnIpfWApKTtcblx0XHRcdFx0Ly8gQWNjdW11bGF0ZSB0aGUgcGVyLXR1cm4gdG9vbC1jYWxsIGFnZ3JlZ2F0ZSBmb3IgdGhlIHJlc3RyaWN0ZWQgYHRvb2xDYWxsRGV0YWlsc2AgZXZlbnQuXG5cdFx0XHRcdC8vIEV2ZXJ5IG1haW4tYWdlbnQgYGFzc2lzdGFudC5tZXNzYWdlYCBpcyBvbmUgbW9kZWwtY2FsbCByb3VuZCAobWF0Y2hlcyB0aGUgZXh0ZW5zaW9uJ3Ncblx0XHRcdFx0Ly8gYG51bVJlcXVlc3RzID0gdG9vbENhbGxSb3VuZHMubGVuZ3RoYCwgd2hpY2ggY291bnRzIHRoZSBmaW5hbCB0b29sLWZyZWUgcmVzcG9uc2Ugcm91bmRcblx0XHRcdFx0Ly8gdG9vKTsgdGhlIHRvb2wtY291bnQgc3RhdHMgb25seSBhcHBseSB0byByb3VuZHMgdGhhdCBjYXJyaWVkIHRvb2wgcmVxdWVzdHMuXG5cdFx0XHRcdGNvbnN0IHR1cm4gPSB0aGlzLl9jdXJyZW50VHVybjtcblx0XHRcdFx0aWYgKHR1cm4pIHtcblx0XHRcdFx0XHR0dXJuLnRvb2xDYWxsUm91bmRzKys7XG5cdFx0XHRcdFx0aWYgKGUuZGF0YS5tb2RlbCkge1xuXHRcdFx0XHRcdFx0dHVybi5sYXN0TW9kZWwgPSBlLmRhdGEubW9kZWw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHRvb2xSZXF1ZXN0cyA9IGUuZGF0YS50b29sUmVxdWVzdHM7XG5cdFx0XHRcdFx0aWYgKHRvb2xSZXF1ZXN0cz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHR0dXJuLnRvdGFsVG9vbENhbGxzICs9IHRvb2xSZXF1ZXN0cy5sZW5ndGg7XG5cdFx0XHRcdFx0XHRpZiAodG9vbFJlcXVlc3RzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHRcdFx0dHVybi5wYXJhbGxlbFRvb2xDYWxsUm91bmRzKys7XG5cdFx0XHRcdFx0XHRcdHR1cm4ucGFyYWxsZWxUb29sQ2FsbHNUb3RhbCArPSB0b29sUmVxdWVzdHMubGVuZ3RoO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCByZXEgb2YgdG9vbFJlcXVlc3RzKSB7XG5cdFx0XHRcdFx0XHRcdHR1cm4udG9vbENvdW50cy5zZXQocmVxLm5hbWUsICh0dXJuLnRvb2xDb3VudHMuZ2V0KHJlcS5uYW1lKSA/PyAwKSArIDEpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gVGhlIFNESyBmaXJlcyBhIGBtZXNzYWdlYCBldmVudCB3aXRoIHRoZSBmdWxsIGFzc2VtYmxlZCBjb250ZW50IGFmdGVyXG5cdFx0XHQvLyBzdHJlYW1pbmcgZGVsdGFzLiBJZiBkZWx0YXMgYWxyZWFkeSBjcmVhdGVkIGEgbWFya2Rvd24gcGFydCBmb3IgdGhpc1xuXHRcdFx0Ly8gdHVybiwgdGhlIGxpdmUgc3RhdGUgaXMgdXAgdG8gZGF0ZSBhbmQgd2Ugc2tpcC4gT25seSBlbWl0IGEgZnJlc2hcblx0XHRcdC8vIHBhcnQgd2hlbiBubyBkZWx0YXMgcHJlY2VkZWQgdGhlIG1lc3NhZ2UgKGUuZy4gdGV4dCBhZnRlciB0b29sIGNhbGxzXG5cdFx0XHQvLyB3aGVyZSB0aGUgU0RLIGRlbGl2ZXJlZCB0aGUgZnVsbCBtZXNzYWdlIGF0IG9uY2UpLlxuXHRcdFx0Ly9cblx0XHRcdC8vIE90aGVyIGZpZWxkcyAodG9vbFJlcXVlc3RzLCByZWFzb25pbmdUZXh0LCBlbmNyeXB0ZWRDb250ZW50KSBhcmVcblx0XHRcdC8vIG9ubHkgdXNlZCBmb3IgaGlzdG9yeSByZWNvbnN0cnVjdGlvbiBhbmQgbGl2ZSB0b29sIGNhbGxzIGZpcmUgdGhlaXJcblx0XHRcdC8vIG93biB0b29sX3N0YXJ0IGV2ZW50cywgc28gd2UgY2FuIHNhZmVseSBkcm9wIHRoZW0gaGVyZS5cblx0XHRcdGlmICh0aGlzLl9zaG91bGREcm9wVW5tYXBwZWRTdWJhZ2VudEV2ZW50KGUsICdhc3Npc3RhbnQubWVzc2FnZScpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcmVudFRvb2xDYWxsSWQgPSB0aGlzLl9wYXJlbnRUb29sQ2FsbElkRm9yU3ViYWdlbnRFdmVudChlKTtcblx0XHRcdGNvbnN0IG1hcmtkb3duU2NvcGUgPSBwYXJlbnRUb29sQ2FsbElkID8/ICcnO1xuXHRcdFx0aWYgKGUuZGF0YS5jb250ZW50ICYmICF0aGlzLl9jdXJyZW50VHVybj8ubWFya2Rvd25QYXJ0SWRzLmhhcyhtYXJrZG93blNjb3BlKSkge1xuXHRcdFx0XHRjb25zdCBwYXJ0SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdFx0dGhpcy5fY3VycmVudFR1cm4/Lm1hcmtkb3duUGFydElkcy5zZXQobWFya2Rvd25TY29wZSwgcGFydElkKTtcblx0XHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LFxuXHRcdFx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0XHRcdHBhcnQ6IHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6IHBhcnRJZCwgY29udGVudDogZS5kYXRhLmNvbnRlbnQgfSxcblx0XHRcdFx0fSwgcGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5kYXRhLnRvb2xSZXF1ZXN0cz8ubGVuZ3RoKSB7XG5cdFx0XHRcdC8vIFdhaXQgZm9yIHRoZSBmdWxsIG1lc3NhZ2UgYm91bmRhcnk7IGNsZWFyaW5nIG9uIGFuIGVhcmxpZXIgdG9vbCBkZWx0YSB3b3VsZCBkdXBsaWNhdGUgYXNzZW1ibGVkIG1hcmtkb3duLlxuXHRcdFx0XHR0aGlzLl9iZWdpblRvb2xDYWxsUm91bmQocGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVE9ET0Bjb25ub3I0MzEyOiBSZW1vdmUgdGhpcyBjb3JyZWxhdGlvbiBvbmNlIHRoZSBTREsgcGVybWlzc2lvbiBjYWxsYmFjayBpbmNsdWRlcyBhdXRvLWFwcHJvdmFsIGRhdGEuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblBlcm1pc3Npb25SZXF1ZXN0ZWQoZSA9PiB7XG5cdFx0XHRjb25zdCB0b29sQ2FsbElkID0gZS5kYXRhLnBlcm1pc3Npb25SZXF1ZXN0LnRvb2xDYWxsSWQ7XG5cdFx0XHRpZiAoIXRvb2xDYWxsSWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVjb3JkQXV0b0FwcHJvdmFsKHRvb2xDYWxsSWQsIGUuZGF0YS5wcm9tcHRSZXF1ZXN0Py5hdXRvQXBwcm92YWwpO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl90b29sQXBwcm92YWxSZWNvcmRzLmdldCh0b29sQ2FsbElkKTtcblx0XHRcdGNvbnN0IHBlcm1pc3Npb25SZXF1ZXN0ID0gZS5kYXRhLnBlcm1pc3Npb25SZXF1ZXN0IGFzIHsgcmVxdWVzdFNhbmRib3hCeXBhc3M/OiBib29sZWFuOyB0b29sTmFtZT86IHN0cmluZyB9O1xuXHRcdFx0dGhpcy5fdG9vbEFwcHJvdmFsUmVjb3Jkcy5zZXQodG9vbENhbGxJZCwge1xuXHRcdFx0XHRwZXJtaXNzaW9uUmVxdWVzdGVkOiB0cnVlLFxuXHRcdFx0XHRyZXNvbHZlZEJ5SG9vazogZXhpc3Rpbmc/LnJlc29sdmVkQnlIb29rIHx8IGUuZGF0YS5yZXNvbHZlZEJ5SG9vayA9PT0gdHJ1ZSxcblx0XHRcdFx0cmVxdWVzdFNhbmRib3hCeXBhc3M6IGV4aXN0aW5nPy5yZXF1ZXN0U2FuZGJveEJ5cGFzcyB8fCBwZXJtaXNzaW9uUmVxdWVzdC5yZXF1ZXN0U2FuZGJveEJ5cGFzcyA9PT0gdHJ1ZSxcblx0XHRcdFx0cmVzdWx0S2luZDogZXhpc3Rpbmc/LnJlc3VsdEtpbmQsXG5cdFx0XHRcdHRvb2xOYW1lOiBleGlzdGluZz8udG9vbE5hbWUgPz8gcGVybWlzc2lvblJlcXVlc3QudG9vbE5hbWUsXG5cdFx0XHRcdG1jcFNlcnZlck5hbWU6IGV4aXN0aW5nPy5tY3BTZXJ2ZXJOYW1lLFxuXHRcdFx0XHRyZXBvcnRlZDogZXhpc3Rpbmc/LnJlcG9ydGVkID8/IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblBlcm1pc3Npb25Db21wbGV0ZWQoZSA9PiB7XG5cdFx0XHRjb25zdCB0b29sQ2FsbElkID0gZS5kYXRhLnRvb2xDYWxsSWQ7XG5cdFx0XHRpZiAoIXRvb2xDYWxsSWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl90b29sQXBwcm92YWxSZWNvcmRzLmdldCh0b29sQ2FsbElkKTtcblx0XHRcdGNvbnN0IHJlY29yZCA9IHtcblx0XHRcdFx0cGVybWlzc2lvblJlcXVlc3RlZDogZXhpc3Rpbmc/LnBlcm1pc3Npb25SZXF1ZXN0ZWQgPz8gdHJ1ZSxcblx0XHRcdFx0cmVzb2x2ZWRCeUhvb2s6IGV4aXN0aW5nPy5yZXNvbHZlZEJ5SG9vayA/PyBmYWxzZSxcblx0XHRcdFx0cmVxdWVzdFNhbmRib3hCeXBhc3M6IGV4aXN0aW5nPy5yZXF1ZXN0U2FuZGJveEJ5cGFzcyA/PyBmYWxzZSxcblx0XHRcdFx0cmVzdWx0S2luZDogZS5kYXRhLnJlc3VsdC5raW5kLFxuXHRcdFx0XHR0b29sTmFtZTogZXhpc3Rpbmc/LnRvb2xOYW1lLFxuXHRcdFx0XHRtY3BTZXJ2ZXJOYW1lOiBleGlzdGluZz8ubWNwU2VydmVyTmFtZSxcblx0XHRcdFx0cmVwb3J0ZWQ6IGV4aXN0aW5nPy5yZXBvcnRlZCA/PyBmYWxzZSxcblx0XHRcdH07XG5cdFx0XHR0aGlzLl90b29sQXBwcm92YWxSZWNvcmRzLnNldCh0b29sQ2FsbElkLCByZWNvcmQpO1xuXHRcdFx0dGhpcy5fcmVwb3J0VG9vbEFwcHJvdmFsKHRvb2xDYWxsSWQsIHJlY29yZC50b29sTmFtZSwgcmVjb3JkLm1jcFNlcnZlck5hbWUpO1xuXHRcdFx0aWYgKGlzUGVybWlzc2lvbkRlbmllZEtpbmQocmVjb3JkLnJlc3VsdEtpbmQpKSB7XG5cdFx0XHRcdHRoaXMuX3Rvb2xBcHByb3ZhbFJlY29yZHMuZGVsZXRlKHRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Ub29sQ2FsbERlbHRhKGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBUb29sIGNhbGwgZGVsdGE6ICR7ZS5kYXRhLnRvb2xOYW1lID8/ICc8cGVuZGluZz4nfSAoJHtlLmRhdGEudG9vbENhbGxJZH0pYCk7XG5cdFx0XHR0aGlzLl9yZXN1bWVTdWJhZ2VudEZvckV2ZW50KGUpO1xuXHRcdFx0aWYgKHRoaXMuX3Nob3VsZERyb3BVbm1hcHBlZFN1YmFnZW50RXZlbnQoZSwgJ2Fzc2lzdGFudC50b29sX2NhbGxfZGVsdGEnKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc3RyZWFtaW5nVG9vbENhbGxzLmdldChlLmRhdGEudG9vbENhbGxJZCk7XG5cdFx0XHRjb25zdCBzdHJlYW1pbmcgPSBleGlzdGluZyA/PyB7XG5cdFx0XHRcdGlucHV0OiAnJyxcblx0XHRcdFx0dG9vbE5hbWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGFyZW50VG9vbENhbGxJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzdGFydGVkOiBmYWxzZSxcblx0XHRcdFx0ZGlzcGxheWVkSW5wdXRMZW5ndGg6IDAsXG5cdFx0XHRcdGRpc3BsYXllZE1lc3NhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0XHRzdHJlYW1pbmcuaW5wdXQgKz0gZS5kYXRhLmlucHV0RGVsdGE7XG5cdFx0XHRpZiAoZS5kYXRhLnRvb2xOYW1lKSB7XG5cdFx0XHRcdGlmIChzdHJlYW1pbmcudG9vbE5hbWUgJiYgc3RyZWFtaW5nLnRvb2xOYW1lICE9PSBlLmRhdGEudG9vbE5hbWUpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gVG9vbCBjYWxsICR7ZS5kYXRhLnRvb2xDYWxsSWR9IGNoYW5nZWQgbmFtZSB3aGlsZSBzdHJlYW1pbmcgZnJvbSAke3N0cmVhbWluZy50b29sTmFtZX0gdG8gJHtlLmRhdGEudG9vbE5hbWV9YCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c3RyZWFtaW5nLnRvb2xOYW1lID0gZS5kYXRhLnRvb2xOYW1lO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdHJlYW1pbmdUb29sQ2FsbHMuc2V0KGUuZGF0YS50b29sQ2FsbElkLCBzdHJlYW1pbmcpO1xuXG5cdFx0XHRjb25zdCB0b29sTmFtZSA9IHN0cmVhbWluZy50b29sTmFtZTtcblx0XHRcdGlmICghdG9vbE5hbWUgfHwgaXNIaWRkZW5Ub29sKHRvb2xOYW1lKSB8fCBpc1Rhc2tDb21wbGV0ZVRvb2wodG9vbE5hbWUpIHx8IHRoaXMuX2NsaWVudFRvb2xOYW1lcy5oYXModGhpcy5fY2xpZW50VG9vbE5hbWUodG9vbE5hbWUpKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXN0cmVhbWluZy5zdGFydGVkKSB7XG5cdFx0XHRcdHN0cmVhbWluZy5wYXJlbnRUb29sQ2FsbElkID0gdGhpcy5fcGFyZW50VG9vbENhbGxJZEZvclN1YmFnZW50RXZlbnQoZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghc3RyZWFtaW5nLnN0YXJ0ZWQpIHtcblx0XHRcdFx0c3RyZWFtaW5nLnN0YXJ0ZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGUuZGF0YS50b29sQ2FsbElkLFxuXHRcdFx0XHRcdHRvb2xOYW1lLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiBnZXRUb29sRGlzcGxheU5hbWUodG9vbE5hbWUpLFxuXHRcdFx0XHRcdGNvbnRyaWJ1dG9yOiB0aGlzLl9nZXRUb29sQ2FsbENvbnRyaWJ1dG9yKHRvb2xOYW1lLCB1bmRlZmluZWQpLFxuXHRcdFx0XHRcdF9tZXRhOiB0b1Rvb2xDYWxsTWV0YSh0aGlzLl9jcmVhdGVUb29sQ2FsbE1ldGEodG9vbE5hbWUsIHVuZGVmaW5lZCkpLFxuXHRcdFx0XHR9LCBzdHJlYW1pbmcucGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRcdHRoaXMuX2VtaXRTdHJlYW1pbmdUb29sQ2FsbERpc3BsYXkoZS5kYXRhLnRvb2xDYWxsSWQsIHN0cmVhbWluZyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3NjaGVkdWxlU3RyZWFtaW5nVG9vbENhbGxEaXNwbGF5KGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uVG9vbFN0YXJ0KGUgPT4ge1xuXHRcdFx0aWYgKGlzSGlkZGVuVG9vbChlLmRhdGEudG9vbE5hbWUpKSB7XG5cdFx0XHRcdHRoaXMuX3N0cmVhbWluZ1Rvb2xEaXNwbGF5U2NoZWR1bGVycy5kZWxldGVBbmREaXNwb3NlKGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdFx0dGhpcy5fc3RyZWFtaW5nVG9vbENhbGxzLmRlbGV0ZShlLmRhdGEudG9vbENhbGxJZCk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gVG9vbCBzdGFydGVkIChoaWRkZW4pOiAke2UuZGF0YS50b29sTmFtZX1gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFRvb2wgc3RhcnRlZDogJHtlLmRhdGEudG9vbE5hbWV9YCk7XG5cdFx0XHRsZXQgdG9vbEFyZ3MgPSBlLmRhdGEuYXJndW1lbnRzICE9PSB1bmRlZmluZWQgPyB0cnlTdHJpbmdpZnkoZS5kYXRhLmFyZ3VtZW50cykgOiB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgcGFyYW1ldGVyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodG9vbEFyZ3MpIHtcblx0XHRcdFx0dHJ5IHsgcGFyYW1ldGVycyA9IEpTT04ucGFyc2UodG9vbEFyZ3MpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+OyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblx0XHRcdH1cblx0XHRcdC8vIFN0cmlwIHJlZHVuZGFudCBgY2QgPHdvcmtpbmdEaXJlY3Rvcnk+ICYmIFx1MjAyNmAgcHJlZml4ZXMgZnJvbSBzaGVsbCB0b29sXG5cdFx0XHQvLyBjb21tYW5kcyBzbyBjbGllbnRzIHNlZSB0aGUgc2ltcGxpZmllZCBmb3JtLiBNaXJyb3JzIHRoZSBsb2dpYyBpblxuXHRcdFx0Ly8gbWFwU2Vzc2lvbkV2ZW50cyAod2hpY2ggaGFuZGxlcyB0aGUgaGlzdG9yeS1yZXBsYXkgcGF0aCkuXG5cdFx0XHRpZiAoc3RyaXBSZWR1bmRhbnRDZFByZWZpeChlLmRhdGEudG9vbE5hbWUsIHBhcmFtZXRlcnMsIHRoaXMuX3dvcmtpbmdEaXJlY3RvcnkpKSB7XG5cdFx0XHRcdHRvb2xBcmdzID0gdHJ5U3RyaW5naWZ5KHBhcmFtZXRlcnMpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBnZXRUb29sRGlzcGxheU5hbWUoZS5kYXRhLnRvb2xOYW1lKTtcblx0XHRcdGNvbnN0IHN0cmVhbWVkID0gdGhpcy5fc3RyZWFtaW5nVG9vbENhbGxzLmdldChlLmRhdGEudG9vbENhbGxJZCk7XG5cdFx0XHR0aGlzLl9zdHJlYW1pbmdUb29sRGlzcGxheVNjaGVkdWxlcnMuZGVsZXRlQW5kRGlzcG9zZShlLmRhdGEudG9vbENhbGxJZCk7XG5cdFx0XHRpZiAoc3RyZWFtZWQ/LnN0YXJ0ZWQgJiYgc3RyZWFtZWQuZGlzcGxheWVkSW5wdXRMZW5ndGggPCBzdHJlYW1lZC5pbnB1dC5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5fZW1pdFN0cmVhbWluZ1Rvb2xDYWxsRGlzcGxheShlLmRhdGEudG9vbENhbGxJZCwgc3RyZWFtZWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc3RyZWFtaW5nVG9vbENhbGxzLmRlbGV0ZShlLmRhdGEudG9vbENhbGxJZCk7XG5cdFx0XHRpZiAoc3RyZWFtZWQ/LnRvb2xOYW1lICYmIHN0cmVhbWVkLnRvb2xOYW1lICE9PSBlLmRhdGEudG9vbE5hbWUpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFRvb2wgY2FsbCAke2UuZGF0YS50b29sQ2FsbElkfSBzdGFydGVkIGFzICR7ZS5kYXRhLnRvb2xOYW1lfSBhZnRlciBzdHJlYW1pbmcgYXMgJHtzdHJlYW1lZC50b29sTmFtZX1gKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Jlc3VtZVN1YmFnZW50Rm9yRXZlbnQoZSk7XG5cdFx0XHRpZiAoIXN0cmVhbWVkPy5zdGFydGVkICYmIHRoaXMuX3Nob3VsZERyb3BVbm1hcHBlZFN1YmFnZW50RXZlbnQoZSwgJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0JykpIHtcblx0XHRcdFx0dGhpcy5fdW5yb3V0YWJsZVN1YmFnZW50VG9vbENhbGxJZHMuYWRkKGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGFyZW50VG9vbENhbGxJZCA9IHN0cmVhbWVkPy5wYXJlbnRUb29sQ2FsbElkID8/IHRoaXMuX3BhcmVudFRvb2xDYWxsSWRGb3JTdWJhZ2VudEV2ZW50KGUpO1xuXHRcdFx0Y29uc3QgY2xpZW50VG9vbE5hbWUgPSB0aGlzLl9jbGllbnRUb29sTmFtZShlLmRhdGEudG9vbE5hbWUpO1xuXHRcdFx0Y29uc3QgaXNDbGllbnRUb29sID0gdGhpcy5fY2xpZW50VG9vbE5hbWVzLmhhcyhjbGllbnRUb29sTmFtZSk7XG5cdFx0XHRjb25zdCBjb250cmlidXRvciA9IHRoaXMuX2dldFRvb2xDYWxsQ29udHJpYnV0b3IoZS5kYXRhLnRvb2xOYW1lLCBlLmRhdGEubWNwU2VydmVyTmFtZSk7XG5cdFx0XHRjb25zdCBpbnRlbnRpb24gPSBnZXRTaGVsbEludGVudGlvbihlLmRhdGEudG9vbE5hbWUsIHBhcmFtZXRlcnMpO1xuXHRcdFx0dGhpcy5fYWN0aXZlVG9vbENhbGxzLnNldChlLmRhdGEudG9vbENhbGxJZCwge1xuXHRcdFx0XHR0b29sTmFtZTogZS5kYXRhLnRvb2xOYW1lLFxuXHRcdFx0XHRkaXNwbGF5TmFtZSxcblx0XHRcdFx0cGFyYW1ldGVycyxcblx0XHRcdFx0Y29udGVudDogW10sXG5cdFx0XHRcdHBhcmVudFRvb2xDYWxsSWQsXG5cdFx0XHRcdG1jcFNlcnZlck5hbWU6IGUuZGF0YS5tY3BTZXJ2ZXJOYW1lLFxuXHRcdFx0XHRjb250cmlidXRvcixcblx0XHRcdFx0aW50ZW50aW9uLFxuXHRcdFx0XHRtZXRhOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGV4aXN0aW5nQXBwcm92YWwgPSB0aGlzLl90b29sQXBwcm92YWxSZWNvcmRzLmdldChlLmRhdGEudG9vbENhbGxJZCk7XG5cdFx0XHRjb25zdCBhcHByb3ZhbFJlY29yZCA9IHtcblx0XHRcdFx0cGVybWlzc2lvblJlcXVlc3RlZDogZXhpc3RpbmdBcHByb3ZhbD8ucGVybWlzc2lvblJlcXVlc3RlZCA/PyBmYWxzZSxcblx0XHRcdFx0cmVzb2x2ZWRCeUhvb2s6IGV4aXN0aW5nQXBwcm92YWw/LnJlc29sdmVkQnlIb29rID8/IGZhbHNlLFxuXHRcdFx0XHRyZXF1ZXN0U2FuZGJveEJ5cGFzczogZXhpc3RpbmdBcHByb3ZhbD8ucmVxdWVzdFNhbmRib3hCeXBhc3MgPz8gZmFsc2UsXG5cdFx0XHRcdHJlc3VsdEtpbmQ6IGV4aXN0aW5nQXBwcm92YWw/LnJlc3VsdEtpbmQsXG5cdFx0XHRcdHRvb2xOYW1lOiBlLmRhdGEudG9vbE5hbWUsXG5cdFx0XHRcdG1jcFNlcnZlck5hbWU6IGUuZGF0YS5tY3BTZXJ2ZXJOYW1lLFxuXHRcdFx0XHRyZXBvcnRlZDogZXhpc3RpbmdBcHByb3ZhbD8ucmVwb3J0ZWQgPz8gZmFsc2UsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fdG9vbEFwcHJvdmFsUmVjb3Jkcy5zZXQoZS5kYXRhLnRvb2xDYWxsSWQsIGFwcHJvdmFsUmVjb3JkKTtcblx0XHRcdGlmIChhcHByb3ZhbFJlY29yZC5yZXN1bHRLaW5kICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fcmVwb3J0VG9vbEFwcHJvdmFsKGUuZGF0YS50b29sQ2FsbElkLCBlLmRhdGEudG9vbE5hbWUsIGUuZGF0YS5tY3BTZXJ2ZXJOYW1lKTtcblx0XHRcdH1cblx0XHRcdGlmIChpc1NoZWxsVG9vbChlLmRhdGEudG9vbE5hbWUpKSB7XG5cdFx0XHRcdHRoaXMuX25vblB0eVNoZWxsVGVybWluYWxzLnRyYWNrKGUuZGF0YS50b29sQ2FsbElkLCBkaXNwbGF5TmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNUYXNrQ29tcGxldGVUb29sKGUuZGF0YS50b29sTmFtZSkpIHtcblx0XHRcdFx0dGhpcy5fYmVnaW5Ub29sQ2FsbFJvdW5kKHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghc3RyZWFtZWQ/LnN0YXJ0ZWQpIHtcblx0XHRcdFx0dGhpcy5fYmVnaW5Ub29sQ2FsbFJvdW5kKHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtZXRhID0gdGhpcy5fY3JlYXRlVG9vbENhbGxNZXRhKGUuZGF0YS50b29sTmFtZSwgcGFyYW1ldGVycyk7XG5cdFx0XHRpZiAoZS5kYXRhLm1jcFNlcnZlck5hbWUpIHtcblx0XHRcdFx0bWV0YS5tY3BTZXJ2ZXJOYW1lID0gZS5kYXRhLm1jcFNlcnZlck5hbWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5kYXRhLm1jcFRvb2xOYW1lKSB7XG5cdFx0XHRcdG1ldGEubWNwVG9vbE5hbWUgPSBlLmRhdGEubWNwVG9vbE5hbWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby11bnR5cGVkLW1ldGEtYWNjZXNzIC0tIENvcGlsb3QgU0RLJ3Mgb3duIHR5cGVkIGBfbWV0YWAsIG5vdCB0aGUgQUhQIHByb3RvY29sIGJhZy5cblx0XHRcdGNvbnN0IHJlc291cmNlVXJpID0gZS5kYXRhLnRvb2xEZXNjcmlwdGlvbj8uX21ldGE/LnVpPy5yZXNvdXJjZVVyaTtcblx0XHRcdHRoaXMuX3NldFRvb2xDYWxsVWlNZXRhKG1ldGEsIHJlc291cmNlVXJpLCBlLmRhdGEubWNwU2VydmVyTmFtZSk7XG5cblx0XHRcdC8vIFN0YXNoIHRoZSBzdGFydC10aW1lIG1ldGEgb24gdGhlIHRyYWNrZWQgdG9vbCBjYWxsIHNvIHRoZVxuXHRcdFx0Ly8gYHRvb2wuZXhlY3V0aW9uX2NvbXBsZXRlYCBlbWlzc2lvbiBiZWxvdyBjYW4gbWVyZ2UgYW55XG5cdFx0XHQvLyBhZGRpdGlvbmFsIG5hbWVzcGFjZXMgKGUuZy4gYHVpYCkgb24gdG9wIHdpdGhvdXQgZHJvcHBpbmdcblx0XHRcdC8vIHdoYXQgd2UgYWxyZWFkeSBwdWJsaXNoZWQgYXQgc3RhcnQgdGltZS5cblx0XHRcdGNvbnN0IHRyYWNrZWQgPSB0aGlzLl9hY3RpdmVUb29sQ2FsbHMuZ2V0KGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdGlmICh0cmFja2VkKSB7XG5cdFx0XHRcdHRyYWNrZWQubWV0YSA9IG1ldGE7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghc3RyZWFtZWQ/LnN0YXJ0ZWQpIHtcblx0XHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0XHR0dXJuSWQ6IHRoaXMuX3R1cm5JZCxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiBlLmRhdGEudG9vbENhbGxJZCxcblx0XHRcdFx0XHR0b29sTmFtZTogZS5kYXRhLnRvb2xOYW1lLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdGludGVudGlvbixcblx0XHRcdFx0XHRjb250cmlidXRvcixcblx0XHRcdFx0XHRfbWV0YTogdG9Ub29sQ2FsbE1ldGEobWV0YSksXG5cdFx0XHRcdH0sIHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBObyBjbGllbnQgaXMgY29ubmVjdGVkIHRvIHJ1biB0aGlzIGNsaWVudCB0b29sLiBGYWlsIGl0XG5cdFx0XHQvLyBpbW1lZGlhdGVseSBpbnN0ZWFkIG9mIGxlYXZpbmcgaXQgcGVuZGluZyB1bnRpbCB0aGVcblx0XHRcdC8vIHNlcnZlci1zaWRlIGRpc2Nvbm5lY3QgdGltZW91dCBmaXJlcy4gV2UgZW1pdCB0aGUgY29tcGxldGlvblxuXHRcdFx0Ly8gb3Vyc2VsdmVzIGFuZCBkcm9wIHRoZSBhY3RpdmUtdG9vbCBlbnRyeSBzbyB0aGUgU0RLJ3Mgb3duXG5cdFx0XHQvLyB0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZSBmb3IgdGhpcyBpZCBpcyBzdXBwcmVzc2VkLlxuXHRcdFx0aWYgKGlzQ2xpZW50VG9vbCAmJiAhY29udHJpYnV0b3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIENsaWVudCB0b29sICcke2UuZGF0YS50b29sTmFtZX0nIHN0YXJ0ZWQgd2l0aCBubyBjb25uZWN0ZWQgY2xpZW50OyBmYWlsaW5nIGl0IGltbWVkaWF0ZWx5LmApO1xuXHRcdFx0XHR0aGlzLl9yZXBvcnRUb29sQXBwcm92YWxJZk5vUGVybWlzc2lvbihlLmRhdGEudG9vbENhbGxJZCk7XG5cdFx0XHRcdHRoaXMuX3Rvb2xBcHByb3ZhbFJlY29yZHMuZGVsZXRlKGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdFx0dGhpcy5fYWN0aXZlVG9vbENhbGxzLmRlbGV0ZShlLmRhdGEudG9vbENhbGxJZCk7XG5cdFx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdFx0dHVybklkOiB0aGlzLl90dXJuSWQsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogZS5kYXRhLnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0Li4uKGNvbnRyaWJ1dG9yID8geyBjb250cmlidXRvciB9IDoge30pLFxuXHRcdFx0XHRcdC4uLihpbnRlbnRpb24gIT09IHVuZGVmaW5lZCA/IHsgaW50ZW50aW9uIH0gOiB7fSksXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGdldEludm9jYXRpb25NZXNzYWdlKGUuZGF0YS50b29sTmFtZSwgZGlzcGxheU5hbWUsIHBhcmFtZXRlcnMsIHBhdGggPT4gdGhpcy5fcmVzb2x2ZUVkaXRGaWxlUGF0aChwYXRoKSksXG5cdFx0XHRcdFx0dG9vbElucHV0OiBnZXRUb29sSW5wdXRTdHJpbmcoZS5kYXRhLnRvb2xOYW1lLCBwYXJhbWV0ZXJzLCB0b29sQXJncyksXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdFx0X21ldGE6IHRvVG9vbENhbGxNZXRhKG1ldGEpLFxuXHRcdFx0XHR9LCBwYXJlbnRUb29sQ2FsbElkKTtcblx0XHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0XHR0dXJuSWQ6IHRoaXMuX3R1cm5JZCxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiBlLmRhdGEudG9vbENhbGxJZCxcblx0XHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogYCR7ZGlzcGxheU5hbWV9IGZhaWxlZGAsXG5cdFx0XHRcdFx0XHRlcnJvcjogeyBtZXNzYWdlOiBgTm8gY2xpZW50IHdhcyBjb25uZWN0ZWQgdG8gcnVuICR7ZGlzcGxheU5hbWV9YCB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sIHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nQ2xpZW50VG9vbENhbGxzLnJlc3BvbmRPckJ1ZmZlcihlLmRhdGEudG9vbENhbGxJZCwge1xuXHRcdFx0XHRcdHRleHRSZXN1bHRGb3JMbG06IGBObyBjbGllbnQgd2FzIGNvbm5lY3RlZCB0byBydW4gJHtkaXNwbGF5TmFtZX0uYCxcblx0XHRcdFx0XHRyZXN1bHRUeXBlOiAnZmFpbHVyZScsXG5cdFx0XHRcdFx0ZXJyb3I6ICdObyBjbGllbnQgY29ubmVjdGVkJyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2xpZW50VG9vbEF1dG9BcHByb3ZlZCA9IGNvbnRyaWJ1dG9yPy5raW5kID09PSBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQgJiYgdGhpcy5fbGFzdEFwcGxpZWRQZXJtaXNzaW9uTW9kZSA9PT0gJ29uJztcblx0XHRcdGNvbnN0IHNob3VsZFdhaXRGb3JDbGllbnRUb29sUmVhZHkgPSBjb250cmlidXRvcj8ua2luZCA9PT0gVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50XG5cdFx0XHRcdCYmICFpc0FnZW50Q29vcmRpbmF0aW9uVG9vbChlLmRhdGEudG9vbE5hbWUpXG5cdFx0XHRcdCYmICFjbGllbnRUb29sQXV0b0FwcHJvdmVkO1xuXHRcdFx0aWYgKHNob3VsZFdhaXRGb3JDbGllbnRUb29sUmVhZHkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiB0aGlzLl90dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IGUuZGF0YS50b29sQ2FsbElkLFxuXHRcdFx0XHQuLi4oY29udHJpYnV0b3IgPyB7IGNvbnRyaWJ1dG9yIH0gOiB7fSksXG5cdFx0XHRcdC4uLihpbnRlbnRpb24gIT09IHVuZGVmaW5lZCA/IHsgaW50ZW50aW9uIH0gOiB7fSksXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBnZXRJbnZvY2F0aW9uTWVzc2FnZShlLmRhdGEudG9vbE5hbWUsIGRpc3BsYXlOYW1lLCBwYXJhbWV0ZXJzLCBwYXRoID0+IHRoaXMuX3Jlc29sdmVFZGl0RmlsZVBhdGgocGF0aCkpLFxuXHRcdFx0XHR0b29sSW5wdXQ6IGdldFRvb2xJbnB1dFN0cmluZyhlLmRhdGEudG9vbE5hbWUsIHBhcmFtZXRlcnMsIHRvb2xBcmdzKSxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdF9tZXRhOiB0b1Rvb2xDYWxsTWV0YShjbGllbnRUb29sQXV0b0FwcHJvdmVkID8geyAuLi5tZXRhLCBhdXRvQXBwcm92ZUJ5U2V0dGluZzogdHJ1ZSB9IDogbWV0YSksXG5cdFx0XHR9LCBwYXJlbnRUb29sQ2FsbElkKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uVG9vbENvbXBsZXRlKGFzeW5jIGUgPT4ge1xuXHRcdFx0dGhpcy5fYXBwcm92ZWREdXBsaWNhYmxlUGVybWlzc2lvblNpZ25hdHVyZXMuZGVsZXRlKGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdGNvbnN0IHRyYWNrZWQgPSB0aGlzLl9hY3RpdmVUb29sQ2FsbHMuZ2V0KGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdGlmICghdHJhY2tlZCkge1xuXHRcdFx0XHR0aGlzLl91bnJvdXRhYmxlU3ViYWdlbnRUb29sQ2FsbElkcy5kZWxldGUoZS5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbElkID0gdHJhY2tlZC5wYXJlbnRUb29sQ2FsbElkID8/IHRoaXMuX3BhcmVudFRvb2xDYWxsSWRGb3JTdWJhZ2VudEV2ZW50KGUpO1xuXHRcdFx0aWYgKCFwYXJlbnRUb29sQ2FsbElkICYmIGUuYWdlbnRJZCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBEcm9wcGluZyB0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZSBmb3IgdW5rbm93biBzdWJhZ2VudCBhZ2VudElkPSR7ZS5hZ2VudElkfWApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gVG9vbCBjb21wbGV0ZWQ6ICR7ZS5kYXRhLnRvb2xDYWxsSWR9YCk7XG5cdFx0XHR0aGlzLl9yZXBvcnRUb29sQXBwcm92YWxJZk5vUGVybWlzc2lvbihlLmRhdGEudG9vbENhbGxJZCk7XG5cdFx0XHR0aGlzLl9hY3RpdmVUb29sQ2FsbHMuZGVsZXRlKGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdHRoaXMuX2F1dG9BcHByb3ZhbHMuZGVsZXRlKGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdHRoaXMuX3Rvb2xBcHByb3ZhbFJlY29yZHMuZGVsZXRlKGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdBdXRvQXBwcm92YWxzLnJlc3BvbmQoZS5kYXRhLnRvb2xDYWxsSWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBkaXNwbGF5TmFtZSA9IHRyYWNrZWQuZGlzcGxheU5hbWU7XG5cdFx0XHRjb25zdCB0b29sT3V0cHV0ID0gZS5kYXRhLmVycm9yPy5tZXNzYWdlID8/IGUuZGF0YS5yZXN1bHQ/LmNvbnRlbnQ7XG5cblx0XHRcdGlmIChpc1Rhc2tDb21wbGV0ZVRvb2wodHJhY2tlZC50b29sTmFtZSkpIHtcblx0XHRcdFx0Y29uc3Qgc3VtbWFyeSA9IGdldFRhc2tDb21wbGV0ZU1hcmtkb3duKHRyYWNrZWQucGFyYW1ldGVycywgdG9vbE91dHB1dCk7XG5cdFx0XHRcdGlmIChzdW1tYXJ5KSB7XG5cdFx0XHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQsXG5cdFx0XHRcdFx0XHR0dXJuSWQ6IHRoaXMuX3R1cm5JZCxcblx0XHRcdFx0XHRcdHBhcnQ6IHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6IGdlbmVyYXRlVXVpZCgpLCBjb250ZW50OiBzdW1tYXJ5IH0sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb250ZW50OiBUb29sUmVzdWx0Q29udGVudFtdID0gWy4uLnRyYWNrZWQuY29udGVudF07XG5cdFx0XHRpZiAodG9vbE91dHB1dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnRlbnQucHVzaCh7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiB0b29sT3V0cHV0IH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBdHRhY2ggdGhlIHB0eSB0ZXJtaW5hbCByZWZlcmVuY2UgZm9yIHNoZWxsIHRvb2xzIGJlZm9yZSBmb2xkaW5nIGluXG5cdFx0XHQvLyBTREsgcmVzdWx0IGNvbnRlbnQsIHNvIGEgYHNoZWxsX2V4aXRgIGxhbmRzIGl0cyBjb21wbGV0aW9uIGRhdGEgb25cblx0XHRcdC8vIHRoZSB0ZXJtaW5hbCBibG9jayAoc2tpcCBpZiBhbnkgdGVybWluYWwgYmxvY2sgd2FzIGFscmVhZHkgYWRkZWRcblx0XHRcdC8vIHdoaWxlIHRoZSB0b29sIHdhcyBydW5uaW5nKS5cblx0XHRcdGNvbnN0IHB0eVRlcm1pbmFsVXJpID0gaXNTaGVsbFRvb2wodHJhY2tlZC50b29sTmFtZSkgPyB0aGlzLl9zaGVsbE1hbmFnZXI/LmdldFRlcm1pbmFsVXJpRm9yVG9vbENhbGwoZS5kYXRhLnRvb2xDYWxsSWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHJldGlyZU5vblB0eVNoZWxsVHJhY2tpbmcgPSAhIXB0eVRlcm1pbmFsVXJpO1xuXHRcdFx0aWYgKHB0eVRlcm1pbmFsVXJpICYmICFjb250ZW50LnNvbWUoYyA9PiBjLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCkpIHtcblx0XHRcdFx0Y29udGVudC5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsXG5cdFx0XHRcdFx0cmVzb3VyY2U6IHB0eVRlcm1pbmFsVXJpLFxuXHRcdFx0XHRcdHRpdGxlOiB0cmFja2VkLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2hlbGxFeGl0ID0gYXBwZW5kU2RrVG9vbFJlc3VsdENvbnRlbnQoY29udGVudCwgZS5kYXRhLnJlc3VsdD8uY29udGVudHMsIHsgc2Vzc2lvbjogdGhpcy5zZXNzaW9uVXJpLCB0b29sQ2FsbElkOiBlLmRhdGEudG9vbENhbGxJZCwgdGl0bGU6IHRyYWNrZWQuZGlzcGxheU5hbWUgfSk7XG5cdFx0XHRpZiAoaXNTaGVsbFRvb2wodHJhY2tlZC50b29sTmFtZSkgJiYgIXB0eVRlcm1pbmFsVXJpKSB7XG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRpb24gPSB0aGlzLl9ub25QdHlTaGVsbFRlcm1pbmFscy5jb21wbGV0ZVRvb2xDYWxsKGUuZGF0YS50b29sQ2FsbElkLCB0b29sT3V0cHV0LCBzaGVsbEV4aXQpO1xuXHRcdFx0XHRpZiAoY29tcGxldGlvbikge1xuXHRcdFx0XHRcdHJldGlyZU5vblB0eVNoZWxsVHJhY2tpbmcgPSBjb21wbGV0aW9uLnNob3VsZFJldGlyZTtcblx0XHRcdFx0XHRjb25zdCB0ZXJtaW5hbEluZGV4ID0gY29udGVudC5maW5kSW5kZXgoYyA9PiBjLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCk7XG5cdFx0XHRcdFx0aWYgKHRlcm1pbmFsSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0XHRjb250ZW50LnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsXG5cdFx0XHRcdFx0XHRcdHJlc291cmNlOiBjb21wbGV0aW9uLnVyaSxcblx0XHRcdFx0XHRcdFx0dGl0bGU6IHRyYWNrZWQuZGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0XHRcdGlzUHR5OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0Li4uKGNvbXBsZXRpb24ucmVzdWx0ID8geyByZXN1bHQ6IGNvbXBsZXRpb24ucmVzdWx0IH0gOiB7fSksXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGNvbXBsZXRpb24ucmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0ZXJtaW5hbEJsb2NrID0gY29udGVudFt0ZXJtaW5hbEluZGV4XSBhcyBUb29sUmVzdWx0VGVybWluYWxDb250ZW50O1xuXHRcdFx0XHRcdFx0Y29udGVudFt0ZXJtaW5hbEluZGV4XSA9IHsgLi4udGVybWluYWxCbG9jaywgcmVzdWx0OiBjb21wbGV0aW9uLnJlc3VsdCB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb21tYW5kID0gaXNTdHJpbmcodHJhY2tlZC5wYXJhbWV0ZXJzPy5jb21tYW5kKSA/IHRyYWNrZWQucGFyYW1ldGVycy5jb21tYW5kIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgZmlsZVBhdGhzID0gaXNFZGl0VG9vbCh0cmFja2VkLnRvb2xOYW1lLCBjb21tYW5kKSA/IHRoaXMuX2dldEVkaXRGaWxlUGF0aHModHJhY2tlZC5wYXJhbWV0ZXJzKSA6IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBmaWxlUGF0aCBvZiBmaWxlUGF0aHMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBmaWxlRWRpdCA9IGF3YWl0IHRoaXMuX2VkaXRUcmFja2VyLnRha2VDb21wbGV0ZWRFZGl0KHRoaXMuX3R1cm5JZCwgZS5kYXRhLnRvb2xDYWxsSWQsIGZpbGVQYXRoLCB0cmFja2VkLnRvb2xOYW1lLCB0cmFja2VkLnBhcmFtZXRlcnMsIHRoaXMuX2xhc3RTZWVuTW9kZWxJZCk7XG5cdFx0XHRcdFx0aWYgKGZpbGVFZGl0KSB7XG5cdFx0XHRcdFx0XHRjb250ZW50LnB1c2goZmlsZUVkaXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIEZhaWxlZCB0byB0YWtlIGNvbXBsZXRlZCBlZGl0YCwgZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiB0aGlzLl90dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IGUuZGF0YS50b29sQ2FsbElkLFxuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRzdWNjZXNzOiBlLmRhdGEuc3VjY2Vzcyxcblx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBnZXRQYXN0VGVuc2VNZXNzYWdlKHRyYWNrZWQudG9vbE5hbWUsIGRpc3BsYXlOYW1lLCB0cmFja2VkLnBhcmFtZXRlcnMsIGUuZGF0YS5zdWNjZXNzLCBlLmRhdGEuc3VjY2VzcyA/IHRvb2xPdXRwdXQgOiB1bmRlZmluZWQsIHBhdGggPT4gdGhpcy5fcmVzb2x2ZUVkaXRGaWxlUGF0aChwYXRoKSksXG5cdFx0XHRcdFx0Y29udGVudDogY29udGVudC5sZW5ndGggPiAwID8gY29udGVudCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRlcnJvcjogZS5kYXRhLmVycm9yLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRfbWV0YTogdHJhY2tlZC5tZXRhID8gdG9Ub29sQ2FsbE1ldGEodHJhY2tlZC5tZXRhKSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sIHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0aWYgKHJldGlyZU5vblB0eVNoZWxsVHJhY2tpbmcpIHtcblx0XHRcdFx0Ly8gUHJlc2VydmUgdGhlIHRlcm1pbmFsIHJlc3VsdCBpbiBjaGF0IHN0YXRlIGJlZm9yZSByZW1vdmluZyBpdHNcblx0XHRcdFx0Ly8gbm93LXJlZHVuZGFudCBsaXZlIG91dHB1dCByZXNvdXJjZSBmcm9tIHRoZSBob3N0LlxuXHRcdFx0XHR0aGlzLl9ub25QdHlTaGVsbFRlcm1pbmFscy5yZXRpcmUoZS5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25JZGxlKGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFNlc3Npb24gaWRsZWApO1xuXHRcdFx0aWYgKGUuZGF0YS5hYm9ydGVkKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc2V0QWJvcnRUb2tlbigpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2hhc0FjdGl2aXR5KSB7XG5cdFx0XHRcdHRoaXMuX2hhc0FjdGl2aXR5ID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2aXR5Q2hhbmdlZCxcblx0XHRcdFx0XHRhY3Rpdml0eTogdW5kZWZpbmVkLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHR1cm4gPSB0aGlzLl9jdXJyZW50VHVybjtcblx0XHRcdGlmICghdHVybikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBBbiBhYm9ydCBkcml2ZXMgdGhlIGxvb3AgdG8gaWRsZS4gVGhhdCB0ZXJtaW5hbCBpZGxlIG11c3QgbmV2ZXJcblx0XHRcdC8vIGNvbXBsZXRlIGEgdHVybjpcblx0XHRcdC8vICAtIGlmIGB0dXJuYCBpcyB0aGUgYWJvcnRlZCAocnVubmluZykgdHVybiwgdGhlIGNsaWVudC1kaXNwYXRjaGVkXG5cdFx0XHQvLyAgICBgQ2hhdFR1cm5DYW5jZWxsZWRgIGZpbmFsaXplcyB0aGUgcHJvdG9jb2wgdHVybjsgZHJvcCBvdXIgaGFuZGxlXG5cdFx0XHQvLyAgICBzbyBhIGxhdGVyIGlkbGUgY2FuJ3QgY29tcGxldGUgaXQuXG5cdFx0XHQvLyAgLSBpZiBgdHVybmAgaXMgc3RpbGwgYHBlbmRpbmdgLCBhIHF1ZXVlZCBtZXNzYWdlIHN0YXJ0ZWQgaXQgYWZ0ZXJcblx0XHRcdC8vICAgIHRoZSBhYm9ydCBhbmQgdGhlIFNESyBoYXMgbm90IHJ1biBpdCB5ZXQ7IGNvbXBsZXRpbmcgaXQgd291bGRcblx0XHRcdC8vICAgIGVtaXQgYW4gZW1wdHkgYENoYXRUdXJuQ29tcGxldGVgIGFuZCBvcnBoYW4gaXRzIHJlYWwgcmVzcG9uc2UuXG5cdFx0XHQvLyAgICBMZWF2ZSBpdCBvcGVuIGZvciBpdHMgb3duIChub24tYWJvcnQpIGlkbGUuXG5cdFx0XHQvLyBUaGUgc3RydWN0dXJhbCBgcGVuZGluZ2AgZ3VhcmQgYmVsb3cgYWxyZWFkeSBwcm90ZWN0cyB0aGVcblx0XHRcdC8vIHF1ZXVlZC1tZXNzYWdlIGNhc2U7IHJlYWRpbmcgYGUuZGF0YS5hYm9ydGVkYCBpcyB0aGUgYXV0aG9yaXRhdGl2ZVxuXHRcdFx0Ly8gU0RLIHNpZ25hbCB0aGF0IGxldHMgdXMgYWxzbyB0ZWFyIGRvd24gdGhlIGFib3J0ZWQgcnVubmluZyB0dXJuLlxuXHRcdFx0aWYgKGUuZGF0YS5hYm9ydGVkKSB7XG5cdFx0XHRcdHRoaXMuX2NhbmNlbEFjdGl2ZVJlcG9JbmZvVGVsZW1ldHJ5KCk7XG5cdFx0XHRcdGlmICh0dXJuLmlzUnVubmluZykge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gSWRsZSBmcm9tIGFib3J0OyB0ZWFyaW5nIGRvd24gcnVubmluZyB0dXJuICR7dHVybi5pZH1gKTtcblx0XHRcdFx0XHR0aGlzLl9yZXBvcnRUb29sQ2FsbERldGFpbHModHVybiwgJ2NhbmNlbGxlZCcpO1xuXHRcdFx0XHRcdHR1cm4ubWFya0Fib3J0ZWQoKTtcblx0XHRcdFx0XHR0aGlzLl9jbGVhckFjdGl2ZVR1cm4oKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIElkbGUgZnJvbSBhYm9ydDsgbGVhdmluZyAke3R1cm4uc3RhdGV9IHR1cm4gJHt0dXJuLmlkfSBvcGVuYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gT25seSBhIGBydW5uaW5nYCB0dXJuIGlzIGNvbXBsZXRlZCBieSBhIG5vcm1hbCBpZGxlLiBBIGBwZW5kaW5nYFxuXHRcdFx0Ly8gdHVybiBoZXJlIG1lYW5zIHRoZSBTREsgd2VudCBpZGxlIGJlZm9yZSBlbWl0dGluZyBhbnkgZXZlbnQgZm9yIGl0XG5cdFx0XHQvLyAoYSBkZWdlbmVyYXRlIG5vLW9wIHNlbmQpOyBjb21wbGV0ZSBpdCBkZWZlbnNpdmVseSBzbyB0aGUgc2Vzc2lvblxuXHRcdFx0Ly8gZG9lcyBub3QgaGFuZy5cblx0XHRcdHRoaXMuX2NvbXBsZXRlQWN0aXZlUmVwb0luZm9UZWxlbWV0cnkoKTtcblx0XHRcdHRoaXMuX2NvbXBsZXRlQWN0aXZlVHVybigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRoZSBTREsgZW1pdHMgYSBgc2tpbGxgIHRvb2wgY2FsbCAod2hpY2ggd2UgaGlkZSkgYW5kIGEgcmljaGVyXG5cdFx0Ly8gYHNraWxsLmludm9rZWRgIGV2ZW50IHdpdGggdGhlIHJlc29sdmVkIFNLSUxMLm1kIHBhdGguIFN5bnRoZXNpemUgYVxuXHRcdC8vIHRvb2wtc3RhcnQvY29tcGxldGUgcGFpciBmcm9tIHRoZSBsYXR0ZXIgc28gdGhlIFVJIGNhbiByZW5kZXIgYVxuXHRcdC8vIGNsaWNrYWJsZSBmaWxlIGxpbmssIG1hdGNoaW5nIHRoZSBgdmlld2AtdG9vbCBkaXNwbGF5IHN0eWxlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Ta2lsbEludm9rZWQoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gU2tpbGwgaW52b2tlZDogJHtlLmRhdGEubmFtZX0gKCR7ZS5kYXRhLnBhdGh9KWApO1xuXHRcdFx0dGhpcy5fcmVzdW1lU3ViYWdlbnRGb3JFdmVudChlKTtcblx0XHRcdGlmICh0aGlzLl9zaG91bGREcm9wVW5tYXBwZWRTdWJhZ2VudEV2ZW50KGUsICdza2lsbC5pbnZva2VkJykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUmVzdHJpY3RlZCBgc2tpbGxDb250ZW50UmVhZGA6IHdoaWNoIHNraWxsIGZpbGUgd2FzIGxvYWRlZC4gTWFpbi1hZ2VudCBvbmx5LCBsaWtlIHRoZSBvdGhlciByZXN0cmljdGVkIGV2ZW50cy5cblx0XHRcdGlmICghZS5hZ2VudElkKSB7XG5cdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVJlcG9ydGVyLnNraWxsQ29udGVudFJlYWQoe1xuXHRcdFx0XHRcdGNsaWVudFR5cGU6IHRoaXMuX2N1cnJlbnRUdXJuPy5jbGllbnRUeXBlID8/IEFnZW50SG9zdENsaWVudFR5cGUuVW5rbm93bixcblx0XHRcdFx0XHRuYW1lOiBlLmRhdGEubmFtZSxcblx0XHRcdFx0XHRwYXRoOiBlLmRhdGEucGF0aCxcblx0XHRcdFx0XHRjb250ZW50OiBlLmRhdGEuY29udGVudCxcblx0XHRcdFx0XHRzb3VyY2U6IGUuZGF0YS5zb3VyY2UsXG5cdFx0XHRcdFx0cGx1Z2luTmFtZTogZS5kYXRhLnBsdWdpbk5hbWUsXG5cdFx0XHRcdFx0cGx1Z2luVmVyc2lvbjogZS5kYXRhLnBsdWdpblZlcnNpb24sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGFyZW50VG9vbENhbGxJZCA9IHRoaXMuX3BhcmVudFRvb2xDYWxsSWRGb3JTdWJhZ2VudEV2ZW50KGUpO1xuXHRcdFx0Y29uc3Qgc3ludGggPSBzeW50aGVzaXplU2tpbGxUb29sQ2FsbChlLmRhdGEsIGUuaWQpO1xuXHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBzeW50aC50b29sQ2FsbElkLFxuXHRcdFx0XHR0b29sTmFtZTogc3ludGgudG9vbE5hbWUsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBzeW50aC5kaXNwbGF5TmFtZSxcblx0XHRcdH0sIHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBzeW50aC50b29sQ2FsbElkLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogc3ludGguaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSwgcGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiB0aGlzLl90dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IHN5bnRoLnRvb2xDYWxsSWQsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogc3ludGgucGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TdWJhZ2VudFN0YXJ0ZWQoZSA9PiB7XG5cdFx0XHRpZiAoZS5hZ2VudElkKSB7XG5cdFx0XHRcdHRoaXMuX3BhcmVudFRvb2xDYWxsSWRzQnlBZ2VudElkLnNldChlLmFnZW50SWQsIGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdFx0dGhpcy5fYWN0aXZlU3ViYWdlbnRBZ2VudElkcy5hZGQoZS5hZ2VudElkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBTdWJhZ2VudCBzdGFydGVkOiB0b29sQ2FsbElkPSR7ZS5kYXRhLnRvb2xDYWxsSWR9LCBhZ2VudD0ke2UuZGF0YS5hZ2VudE5hbWV9YCk7XG5cdFx0XHRjb25zdCB0cmFja2VkID0gdGhpcy5fYWN0aXZlVG9vbENhbGxzLmdldChlLmRhdGEudG9vbENhbGxJZCk7XG5cdFx0XHR0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLFxuXHRcdFx0XHRjaGF0OiB0aGlzLl9jaGF0Q2hhbm5lbFVyaSxcblx0XHRcdFx0dG9vbENhbGxJZDogZS5kYXRhLnRvb2xDYWxsSWQsXG5cdFx0XHRcdGFnZW50TmFtZTogZS5kYXRhLmFnZW50TmFtZSxcblx0XHRcdFx0YWdlbnREaXNwbGF5TmFtZTogZS5kYXRhLmFnZW50RGlzcGxheU5hbWUsXG5cdFx0XHRcdGFnZW50RGVzY3JpcHRpb246IGUuZGF0YS5hZ2VudERlc2NyaXB0aW9uLFxuXHRcdFx0XHQvLyBUaGUgc3Bhd25pbmcgVGFzayB0b29sJ3Mgc2hvcnQgYGRlc2NyaXB0aW9uYCBpbnB1dCAoY2FwdHVyZWQgb25cblx0XHRcdFx0Ly8gdG9vbCBzdGFydCkgaXMgdGhlIGNvbmNpc2UgcGVyLXRhc2sgdGFiIHRpdGxlIGZvciB0aGUgc3ViYWdlbnQnc1xuXHRcdFx0XHQvLyByZWFkLW9ubHkgcGVlciBjaGF0IFx1MjAxNCBkaXN0aW5jdCBldmVuIGZvciBzYW1lLXR5cGUgc3ViYWdlbnRzLlxuXHRcdFx0XHR0YXNrRGVzY3JpcHRpb246IHRyYWNrZWQ/Lm1ldGE/LnN1YmFnZW50RGVzY3JpcHRpb24sXG5cdFx0XHRcdC8vIFRoZSBmdWxsIGRlbGVnYXRlZCBpbnN0cnVjdGlvbiAodGhlIHNwYXduaW5nIHRvb2wncyBgcHJvbXB0YFxuXHRcdFx0XHQvLyBhcmd1bWVudCkgc2VlZHMgdGhlIHN1YmFnZW50IHBlZXIgY2hhdCdzIG9wZW5pbmcgcmVxdWVzdC5cblx0XHRcdFx0dGFza1Byb21wdDogdHlwZW9mIHRyYWNrZWQ/LnBhcmFtZXRlcnM/LnByb21wdCA9PT0gJ3N0cmluZycgPyB0cmFja2VkLnBhcmFtZXRlcnMucHJvbXB0IDogdW5kZWZpbmVkLFxuXHRcdFx0XHQvLyBXaGVuIHRoZSBzcGF3bmluZyB0b29sIGNhbGwgaXMgaXRzZWxmIGFuIGlubmVyIHRvb2wgb2Zcblx0XHRcdFx0Ly8gYW5vdGhlciBzdWJhZ2VudCwgaXRzIHJlY29yZGVkIHBhcmVudCBpcyB0aGUgdG9vbCBjYWxsIG9uZVxuXHRcdFx0XHQvLyBsZXZlbCB1cCBcdTIwMTQgdGhlIHRvb2wgY2FsbCBpbiB3aG9zZSAoc3ViYWdlbnQpIGNoYXQgdGhpc1xuXHRcdFx0XHQvLyBzcGF3bmluZyB0b29sIGxpdmVzLiBUaGUgaG9zdCB1c2VzIGl0IHRvIHJvdXRlIHRoZVxuXHRcdFx0XHQvLyBkaXNjb3ZlcnkgY29udGVudCBibG9jayB0byB0aGF0IGltbWVkaWF0ZSBwYXJlbnQgY2hhdCwgYXRcblx0XHRcdFx0Ly8gYW55IG5lc3RpbmcgZGVwdGguXG5cdFx0XHRcdHBhcmVudFRvb2xDYWxsSWQ6IHRyYWNrZWQ/LnBhcmVudFRvb2xDYWxsSWQsXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uU2Vzc2lvbkVycm9yKGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBTZXNzaW9uIGVycm9yOiAke2UuZGF0YS5lcnJvclR5cGV9IC0gJHtlLmRhdGEubWVzc2FnZX1gKTtcblx0XHRcdGlmICh0aGlzLl9jdXJyZW50VHVybikge1xuXHRcdFx0XHR0aGlzLl9yZXBvcnRUb29sQ2FsbERldGFpbHModGhpcy5fY3VycmVudFR1cm4sICdmYWlsZWQnKTtcblx0XHRcdH1cblx0XHRcdC8vIFByZWZlciB0aGUgc3RydWN0dXJlZCBTREsgZmllbGRzICh0aGUgQ29waWxvdCBDTEkgY2xhc3NpZmllcyBpdHMgb3duXG5cdFx0XHQvLyBDQVBJIGVycm9ycyk7IGZhbGwgYmFjayB0byBkZWNvZGluZyBhIGZvcndhcmRlZCBtYXJrZXIgZnJvbSB0aGUgbWVzc2FnZS5cblx0XHRcdGNvbnN0IG1ldGEgPSB0cnlCdWlsZENoYXRFcnJvck1ldGFGcm9tRmllbGRzKGUuZGF0YSkgPz8gdHJ5QnVpbGRDaGF0RXJyb3JNZXRhKGUuZGF0YS5tZXNzYWdlKTtcblx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRFcnJvcixcblx0XHRcdFx0dHVybklkOiB0aGlzLl90dXJuSWQsXG5cdFx0XHRcdGR1cmF0aW9uOiB0aGlzLl9jdXJyZW50VHVybj8uZHVyYXRpb24gPz8gMCxcblx0XHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0XHRlcnJvclR5cGU6IGUuZGF0YS5lcnJvclR5cGUsXG5cdFx0XHRcdFx0bWVzc2FnZTogc3RyaXBQcm94eUVycm9yTWFya2VyKGUuZGF0YS5tZXNzYWdlKSxcblx0XHRcdFx0XHRzdGFjazogZS5kYXRhLnN0YWNrLFxuXHRcdFx0XHRcdC4uLihtZXRhID8geyBfbWV0YTogbWV0YSB9IDoge30pLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVHJhY2tzIHRoZSBsYXN0IHBhcmVudC1zY29wZSB1c2FnZSBzbyB0aGUgYXN5bmMgYXR0cmlidXRpb24gZW5yaWNobWVudFxuXHRcdC8vIGNhbiByZS1lbWl0IGEgY29tcGxldGUgYWN0aW9uICh3aXRoIGFjY3VtdWxhdGVkIGNyZWRpdHMsIHF1b3RhLCBldGMuKS5cblx0XHRsZXQgbGFzdFBhcmVudFVzYWdlOiBVc2FnZUluZm8gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGxhc3RQYXJlbnRVc2FnZVR1cm5JZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBhdXRvTW9kZVJlc29sdmVkOiB7IHJlYWRvbmx5IHR1cm5JZDogc3RyaW5nOyByZWFkb25seSBkYXRhOiBOb25OdWxsYWJsZTxVc2FnZUluZm9NZXRhWydhdXRvTW9kZVJlc29sdmVkJ10+IH0gfCB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uQXV0b01vZGVSZXNvbHZlZChlID0+IHtcblx0XHRcdHRoaXMuX2xhc3RTZWVuTW9kZWxJZCA9IGUuZGF0YS5jaG9zZW5Nb2RlbDtcblx0XHRcdGNvbnN0IHR1cm5JZCA9IHRoaXMuX3R1cm5JZDtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBBdXRvIG1vZGUgcmVzb2x2ZWQgdG8gJHtlLmRhdGEuY2hvc2VuTW9kZWx9JHtlLmRhdGEucmVhc29uaW5nQnVja2V0ID8gYCAoJHtlLmRhdGEucmVhc29uaW5nQnVja2V0fSlgIDogJyd9YCk7XG5cdFx0XHRpZiAoIXR1cm5JZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWUuYWdlbnRJZCkge1xuXHRcdFx0XHR0aGlzLl90ZWxlbWV0cnlSZXBvcnRlci5hdXRvTW9kZVJvdXRlckRlY2lzaW9uKHtcblx0XHRcdFx0XHRzZXNzaW9uOiB0aGlzLnNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0Y2xpZW50VHlwZTogdGhpcy5fY3VycmVudFR1cm4/LmNsaWVudFR5cGUgPz8gQWdlbnRIb3N0Q2xpZW50VHlwZS5Vbmtub3duLFxuXHRcdFx0XHRcdGNob3Nlbk1vZGVsOiBlLmRhdGEuY2hvc2VuTW9kZWwsXG5cdFx0XHRcdFx0cHJlZGljdGVkTGFiZWw6IGUuZGF0YS5wcmVkaWN0ZWRMYWJlbCxcblx0XHRcdFx0XHRjb25maWRlbmNlOiBlLmRhdGEuY29uZmlkZW5jZSxcblx0XHRcdFx0XHRjYW5kaWRhdGVNb2RlbHM6IGUuZGF0YS5jYW5kaWRhdGVNb2RlbHMsXG5cdFx0XHRcdFx0Y2F0ZWdvcnlTY29yZXM6IGUuZGF0YS5jYXRlZ29yeVNjb3Jlcyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhdXRvTW9kZVJlc29sdmVkID0geyB0dXJuSWQsIGRhdGE6IGUuZGF0YSB9O1xuXHRcdFx0Y29uc3QgcHJpb3JVc2FnZSA9IGxhc3RQYXJlbnRVc2FnZVR1cm5JZCA9PT0gdHVybklkID8gbGFzdFBhcmVudFVzYWdlIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgdXNhZ2U6IFVzYWdlSW5mbyA9IHtcblx0XHRcdFx0Li4ucHJpb3JVc2FnZSxcblx0XHRcdFx0bW9kZWw6IGUuZGF0YS5jaG9zZW5Nb2RlbCxcblx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHQuLi4ocHJpb3JVc2FnZT8uX21ldGEgPz8ge30pLFxuXHRcdFx0XHRcdGF1dG9Nb2RlUmVzb2x2ZWQ6IGUuZGF0YSxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRsYXN0UGFyZW50VXNhZ2UgPSB1c2FnZTtcblx0XHRcdGxhc3RQYXJlbnRVc2FnZVR1cm5JZCA9IHR1cm5JZDtcblx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRVc2FnZSxcblx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHR1c2FnZSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Vc2FnZShlID0+IHtcblx0XHRcdHRoaXMuX3Jlc3VtZVN1YmFnZW50Rm9yRXZlbnQoZSk7XG5cdFx0XHQvLyBVc2FnZSBldmVudHMgZm9yIGEgc3ViYWdlbnQncyBtb2RlbCBjYWxscyBjYXJyeSB0aGUgc3ViYWdlbnQnc1xuXHRcdFx0Ly8gYGFnZW50SWRgLiBFdmVyeSBtb2RlbCBjYWxsIFx1MjAxNCB0aGUgcGFyZW50J3Mgb3duIGFuZCBldmVyeSBzdWJhZ2VudCdzIFx1MjAxNFxuXHRcdFx0Ly8gaXMgZm9sZGVkIGludG8gdGhlIHR1cm4ncyBjb3N0IGJlbG93LCBzbyBzdWNoIGFuIGV2ZW50IGFkZGl0aW9uYWxseVxuXHRcdFx0Ly8gbmVlZHMgb25seSB0aGUgc3ViYWdlbnQncyBvd24gcnVubmluZyBjb21wb25lbnQgdG90YWwgZW1pdHRlZCB0byBpdHNcblx0XHRcdC8vIGNoaWxkIHNlc3Npb24gKHZpYSBgcGFyZW50VG9vbENhbGxJZGApIGZvciB0aGUgc3ViYWdlbnQgdG9vbCB0byBzaG93XG5cdFx0XHQvLyBpdHMgb3duIGNvc3QuXG5cdFx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbElkID0gdGhpcy5fcGFyZW50VG9vbENhbGxJZEZvclN1YmFnZW50RXZlbnQoZSk7XG5cdFx0XHRpZiAoIXBhcmVudFRvb2xDYWxsSWQgJiYgIWUuYWdlbnRJZCAmJiAhZS5kYXRhLnBhcmVudFRvb2xDYWxsSWQpIHtcblx0XHRcdFx0dGhpcy5fcHJvbXB0Q2FjaGVSZWZyZXNoR2VuZXJhdGlvbisrO1xuXHRcdFx0XHRpZiAoZS5kYXRhLm1vZGVsICYmIGUuZGF0YS5jYWNoZUV4cGlyZXNBdCkge1xuXHRcdFx0XHRcdHRoaXMuX3NldFByb21wdENhY2hlU3RhdGUoeyBtb2RlbElkOiBlLmRhdGEubW9kZWwsIGNhY2hlRXhwaXJlc0F0OiBlLmRhdGEuY2FjaGVFeHBpcmVzQXQgfSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZS5kYXRhLm1vZGVsICYmIHRoaXMuX3Byb21wdENhY2hlU3RhdGU/Lm1vZGVsSWQgIT09IGUuZGF0YS5tb2RlbCkge1xuXHRcdFx0XHRcdHRoaXMuX3NldFByb21wdENhY2hlU3RhdGUodW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gYGNvcGlsb3RVc2FnZWAgaXMgbWFya2VkIGBhc0ludGVybmFsYCBpbiB0aGUgU0RLIHNjaGVtYSBzbyBpdCBpcyBub3QgZXhwb3NlZCBvbiB0aGUgZ2VuZXJhdGVkXG5cdFx0XHQvLyBgQXNzaXN0YW50VXNhZ2VEYXRhYCB0eXBlLCBidXQgaXQgaXMgcHJlc2VudCBhdCBydW50aW1lLiBSZWFkIGl0IGR5bmFtaWNhbGx5LlxuXHRcdFx0Y29uc3QgY29waWxvdFVzYWdlID0gcmVhZENvcGlsb3RVc2FnZShlLmRhdGEpO1xuXHRcdFx0Ly8gYHF1b3RhU25hcHNob3RzYCBpcyBsaWtld2lzZSBgYXNJbnRlcm5hbGAgaW4gdGhlIFNESyBzY2hlbWEgKG5vdCBvbiB0aGUgZ2VuZXJhdGVkIHR5cGUpIGJ1dCBpc1xuXHRcdFx0Ly8gcHJlc2VudCBhdCBydW50aW1lLiBGb3J3YXJkIHRoZSBwZXItY2F0ZWdvcnkgc25hcHNob3RzIG9uIGBfbWV0YWAgc28gdGhlIGNsaWVudCBjYW4ga2VlcCB0aGVcblx0XHRcdC8vIGFjY291bnQgcXVvdGEgVUkgY3VycmVudC4gTWlycm9ycyB0aGUgZXh0ZW5zaW9uLWhvc3QgQ0xJIHBhdGgsIHdoaWNoIGZlZWRzIHRoZXNlIGludG8gaXRzIHF1b3RhIHNlcnZpY2UuXG5cdFx0XHRjb25zdCBxdW90YVNuYXBzaG90cyA9IG5vcm1hbGl6ZVF1b3RhU25hcHNob3RzKChlLmRhdGEgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikucXVvdGFTbmFwc2hvdHMpO1xuXHRcdFx0Y29uc3QgdHVybiA9IHRoaXMuX2N1cnJlbnRUdXJuO1xuXG5cdFx0XHRpZiAodHlwZW9mIGUuZGF0YS5tb2RlbCA9PT0gJ3N0cmluZycgJiYgZS5kYXRhLm1vZGVsKSB7XG5cdFx0XHRcdHRoaXMuX2xhc3RTZWVuTW9kZWxJZCA9IGUuZGF0YS5tb2RlbDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVGhpcyBldmVudCdzIG93biBjb250ZXh0IHVzYWdlICh0aGUgbW9kZWwgY2FsbCB0aGF0IHByb2R1Y2VkIGl0KS5cblx0XHRcdGNvbnN0IGV2ZW50Q29udGV4dCA9IHtcblx0XHRcdFx0aW5wdXRUb2tlbnM6IGUuZGF0YS5pbnB1dFRva2Vucyxcblx0XHRcdFx0b3V0cHV0VG9rZW5zOiBlLmRhdGEub3V0cHV0VG9rZW5zLFxuXHRcdFx0XHRtb2RlbDogZS5kYXRhLm1vZGVsLFxuXHRcdFx0XHRjYWNoZVJlYWRUb2tlbnM6IGUuZGF0YS5jYWNoZVJlYWRUb2tlbnMsXG5cdFx0XHRcdC4uLih0eXBlb2YgZS5kYXRhLmNvc3QgPT09ICdudW1iZXInID8geyBjb3N0OiBlLmRhdGEuY29zdCB9IDoge30pLFxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gUmVjb3JkIHRoZSBwYXJlbnQgYWdlbnQncyBvd24gY29udGV4dCB1c2FnZSBzbyBzdWJhZ2VudCBldmVudHNcblx0XHRcdC8vIGRvbid0IG92ZXJ3cml0ZSB0aGUgbW9kZWwvY29udGV4dCB0b2tlbnMgc2hvd24gZm9yIHRoZSBwYXJlbnQgdHVybi5cblx0XHRcdGlmICghcGFyZW50VG9vbENhbGxJZCAmJiB0dXJuKSB7XG5cdFx0XHRcdHR1cm4ucGFyZW50Q29udGV4dFVzYWdlID0gZXZlbnRDb250ZXh0O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBCdWlsZHMgYSB1c2FnZSBvYmplY3QgY2FycnlpbmcgdGhlIGdpdmVuIGNvbnRleHQncyB0b2tlbnMvbW9kZWwgcGx1c1xuXHRcdFx0Ly8gdGhlIGNyZWRpdCB0b3RhbCBmb3IgdGhlIGdpdmVuIHNjb3BlLiBgY29waWxvdFVzYWdlYCBpcyB0aGUgc2NvcGUnc1xuXHRcdFx0Ly8gQ29waWxvdCBiaWxsaW5nIG1ldGFkYXRhLCBvciBgdW5kZWZpbmVkYCB3aGVuIG5vdGhpbmcgaXMgYmlsbGVkIHlldC5cblx0XHRcdGNvbnN0IGJ1aWxkVXNhZ2UgPSAoY29udGV4dDogVXNhZ2VDb250ZXh0LCBzY29wZWRDb3BpbG90VXNhZ2U6IFVzYWdlSW5mb01ldGFbJ2NvcGlsb3RVc2FnZSddLCBpc1BhcmVudFNjb3BlOiBib29sZWFuKTogVXNhZ2VJbmZvID0+IHtcblx0XHRcdFx0Y29uc3QgbWV0YWRhdGE6IFVzYWdlSW5mb01ldGEgPSB7fTtcblx0XHRcdFx0aWYgKHR5cGVvZiBjb250ZXh0LmNvc3QgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0bWV0YWRhdGEuY29zdCA9IGNvbnRleHQuY29zdDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaXNQYXJlbnRTY29wZSAmJiBhdXRvTW9kZVJlc29sdmVkPy50dXJuSWQgPT09IHRoaXMuX3R1cm5JZCkge1xuXHRcdFx0XHRcdG1ldGFkYXRhLmF1dG9Nb2RlUmVzb2x2ZWQgPSBhdXRvTW9kZVJlc29sdmVkLmRhdGE7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHNjb3BlZENvcGlsb3RVc2FnZSkge1xuXHRcdFx0XHRcdG1ldGFkYXRhLmNvcGlsb3RVc2FnZSA9IHNjb3BlZENvcGlsb3RVc2FnZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocXVvdGFTbmFwc2hvdHMpIHtcblx0XHRcdFx0XHRtZXRhZGF0YS5xdW90YVNuYXBzaG90cyA9IHF1b3RhU25hcHNob3RzO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aW5wdXRUb2tlbnM6IGNvbnRleHQuaW5wdXRUb2tlbnMsXG5cdFx0XHRcdFx0b3V0cHV0VG9rZW5zOiBjb250ZXh0Lm91dHB1dFRva2Vucyxcblx0XHRcdFx0XHRtb2RlbDogY29udGV4dC5tb2RlbCxcblx0XHRcdFx0XHRjYWNoZVJlYWRUb2tlbnM6IGNvbnRleHQuY2FjaGVSZWFkVG9rZW5zLFxuXHRcdFx0XHRcdC4uLihPYmplY3Qua2V5cyhtZXRhZGF0YSkubGVuZ3RoID4gMCA/IHsgX21ldGE6IG1ldGFkYXRhIH0gOiB7fSksXG5cdFx0XHRcdH07XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBGb2xkIHRoaXMgY2FsbCdzIGNvc3QgaW50byB0aGUgdHVybiBiZWZvcmUgYnVpbGRpbmcgYW55IHJlcG9ydCwgc28gdGhlXG5cdFx0XHQvLyBlbWlzc2lvbiBiZWxvdyBhbHJlYWR5IGNhcnJpZXMgaXQuIEV2ZXJ5IG1vZGVsIGNhbGwgdGhlIHR1cm4gY2F1c2VkXG5cdFx0XHQvLyBjb3VudHMgdG93YXJkIGl0LCBzdWJhZ2VudHMgaW5jbHVkZWQuIERvbmUgc3luY2hyb25vdXNseSBoZXJlIHJhdGhlclxuXHRcdFx0Ly8gdGhhbiBmcm9tIHRoZSBTREsncyBzZXNzaW9uIHRvdGFsLCB3aGljaCBpcyByZWFkIGFjcm9zcyBhbiBhd2FpdCB0aGF0XG5cdFx0XHQvLyB0aGUgdGVybWluYWwgYHNlc3Npb24uaWRsZWAgY2FuIGJlYXQuXG5cdFx0XHRpZiAodHVybiAmJiBjb3BpbG90VXNhZ2UpIHtcblx0XHRcdFx0dHVybi5jb3BpbG90TmFub0FpdSArPSBjb3BpbG90VXNhZ2UudG90YWxOYW5vQWl1O1xuXHRcdFx0XHRpZiAocGFyZW50VG9vbENhbGxJZCkge1xuXHRcdFx0XHRcdGNvbnN0IHNjb3BlZFRvdGFsID0gKHR1cm4uc3ViYWdlbnROYW5vQWl1QnlUb29sQ2FsbElkLmdldChwYXJlbnRUb29sQ2FsbElkKSA/PyAwKSArIGNvcGlsb3RVc2FnZS50b3RhbE5hbm9BaXU7XG5cdFx0XHRcdFx0dHVybi5zdWJhZ2VudE5hbm9BaXVCeVRvb2xDYWxsSWQuc2V0KHBhcmVudFRvb2xDYWxsSWQsIHNjb3BlZFRvdGFsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBQYXJlbnQgdHVybiBhZ2dyZWdhdGU6IGEgc3ViYWdlbnQgZXZlbnQgbXVzdCBub3QgcmVwbGFjZSB0aGUgcGFyZW50XG5cdFx0XHQvLyB0dXJuJ3Mgb3duIG1vZGVsL2NvbnRleHQtdG9rZW4gdXNhZ2UsIHNvIHByZXNlcnZlIHRoZSBwYXJlbnQncyBjb250ZXh0LlxuXHRcdFx0Y29uc3QgcGFyZW50Q29udGV4dCA9IHBhcmVudFRvb2xDYWxsSWQgPyAodHVybj8ucGFyZW50Q29udGV4dFVzYWdlID8/IHt9KSA6IGV2ZW50Q29udGV4dDtcblx0XHRcdGNvbnN0IHBhcmVudFVzYWdlID0gYnVpbGRVc2FnZShwYXJlbnRDb250ZXh0LCB0aGlzLl9wYXJlbnRDb3BpbG90VXNhZ2VNZXRhKCksIHRydWUpO1xuXHRcdFx0bGFzdFBhcmVudFVzYWdlID0gcGFyZW50VXNhZ2U7XG5cdFx0XHRsYXN0UGFyZW50VXNhZ2VUdXJuSWQgPSB0aGlzLl90dXJuSWQ7XG5cdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VXNhZ2UsXG5cdFx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0XHR1c2FnZTogcGFyZW50VXNhZ2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gU3ViYWdlbnQgY29tcG9uZW50OiBhZGRpdGlvbmFsbHkgcmVwb3J0IHRoZSBzdWJhZ2VudCdzIG93biBydW5uaW5nXG5cdFx0XHQvLyB0b3RhbCB0byBpdHMgY2hpbGQgc2Vzc2lvbi4gVGhlIFNESydzIHNlc3Npb24gbWV0cmljcyBjYXJyeSBub1xuXHRcdFx0Ly8gcGVyLWFnZW50IGJyZWFrZG93biwgc28gdGhpcyBpcyB0aGUgb25seSBzb3VyY2UgZm9yIGl0LlxuXHRcdFx0aWYgKHBhcmVudFRvb2xDYWxsSWQpIHtcblx0XHRcdFx0Y29uc3Qgc2NvcGVkVG90YWwgPSB0dXJuPy5zdWJhZ2VudE5hbm9BaXVCeVRvb2xDYWxsSWQuZ2V0KHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0XHRjb25zdCBzdWJhZ2VudENvcGlsb3RVc2FnZSA9IGNvcGlsb3RVc2FnZSAmJiBzY29wZWRUb3RhbCAhPT0gdW5kZWZpbmVkXG5cdFx0XHRcdFx0PyB7IC4uLmNvcGlsb3RVc2FnZSwgdG90YWxOYW5vQWl1OiBzY29wZWRUb3RhbCB9XG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFVzYWdlLFxuXHRcdFx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0XHRcdHVzYWdlOiBidWlsZFVzYWdlKGV2ZW50Q29udGV4dCwgc3ViYWdlbnRDb3BpbG90VXNhZ2UsIGZhbHNlKSxcblx0XHRcdFx0fSwgcGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQWZ0ZXIgZWFjaCB1c2FnZSBldmVudCwgYXN5bmNocm9ub3VzbHkgcmVmcmVzaCB0aGUgU0RLJ3Mgc2Vzc2lvbi13aWRlIHRvdGFsXG5cdFx0Ly8gKGF1dGhvcml0YXRpdmUgZm9yIHRoZSBzZXNzaW9uLCBhbmQgdGhlIG9ubHkgc291cmNlIHRoYXQgc2VlcyB3b3JrIGJpbGxlZFxuXHRcdC8vIG91dHNpZGUgYSB0dXJuKSBhbmQgcmUtZW1pdCB0aGUgcGFyZW50IGFnZ3JlZ2F0ZSB3aXRoIGl0LiBGb3IgbWFpbi1hZ2VudFxuXHRcdC8vIGNhbGxzIHRoZSBwZXItc291cmNlIGNvbnRleHQtd2luZG93IGF0dHJpYnV0aW9uIGlzIGZldGNoZWQgYW5kIG1lcmdlZCBpblxuXHRcdC8vIHRvbyBcdTIwMTQgYSBzdWJhZ2VudCBydW5zIGFnYWluc3QgaXRzIG93biBjb250ZXh0LCBzbyBpdHMgZXZlbnRzIG11c3Qgbm90XG5cdFx0Ly8gcmV3cml0ZSB0aGUgcGFyZW50J3MgYXR0cmlidXRpb24uIFRoZSByZWR1Y2VyIHJlcGxhY2VzIGBhY3RpdmVUdXJuLnVzYWdlYCxcblx0XHQvLyBzbyB0aGUgd2lkZ2V0IHBpY2tzIHVwIHRoZSB1cGRhdGUgb24gdGhlIG5leHQgcmVuZGVyIGN5Y2xlLlxuXHRcdC8vXG5cdFx0Ly8gTG9zaW5nIHRoaXMgcmUtZW1pdCB0byBhIHR1cm4gdGhhdCBlbmRlZCBtaWQtZmxpZ2h0IGNvc3RzIG9ubHkgdGhlIHNlc3Npb25cblx0XHQvLyB0b3RhbCdzIGZyZXNobmVzczsgdGhlIHR1cm4ncyBvd24gY29zdCB3YXMgYWxyZWFkeSByZXBvcnRlZCBzeW5jaHJvbm91c2x5LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Vc2FnZShhc3luYyBlID0+IHtcblx0XHRcdGNvbnN0IGlzU3ViYWdlbnRFdmVudCA9ICEhdGhpcy5fcGFyZW50VG9vbENhbGxJZEZvclN1YmFnZW50RXZlbnQoZSk7XG5cdFx0XHRjb25zdCB0dXJuSWQgPSB0aGlzLl90dXJuSWQ7XG5cdFx0XHQvLyBDYXB0dXJlIHRoZSBiYXNlIHVzYWdlIGJlZm9yZSB0aGUgYXdhaXQgYm91bmRhcnkgc28gY29uY3VycmVudFxuXHRcdFx0Ly8gdXNhZ2UgZXZlbnRzIGRvbid0IG92ZXJ3cml0ZSB3aGF0IHdlIG1lcmdlIGludG8uXG5cdFx0XHRjb25zdCBiYXNlVXNhZ2UgPSBsYXN0UGFyZW50VXNhZ2VUdXJuSWQgPT09IHR1cm5JZCA/IGxhc3RQYXJlbnRVc2FnZSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHVzYWdlOiBVc2FnZUluZm8gPSBiYXNlVXNhZ2UgPz8ge1xuXHRcdFx0XHRpbnB1dFRva2VuczogZS5kYXRhLmlucHV0VG9rZW5zLFxuXHRcdFx0XHRvdXRwdXRUb2tlbnM6IGUuZGF0YS5vdXRwdXRUb2tlbnMsXG5cdFx0XHRcdG1vZGVsOiBlLmRhdGEubW9kZWwsXG5cdFx0XHRcdGNhY2hlUmVhZFRva2VuczogZS5kYXRhLmNhY2hlUmVhZFRva2Vucyxcblx0XHRcdH07XG5cdFx0XHRhd2FpdCB0aGlzLl9yZWZyZXNoU2Vzc2lvblVzYWdlTWV0cmljcygpO1xuXHRcdFx0Y29uc3QgYXR0cmlidXRpb24gPSBpc1N1YmFnZW50RXZlbnQgPyB1bmRlZmluZWQgOiBhd2FpdCB0aGlzLl9yZWFkQ29udGV4dEF0dHJpYnV0aW9uKCk7XG5cdFx0XHRpZiAoIXR1cm5JZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBJZiB0aGUgdHVybiBjaGFuZ2VkIHdoaWxlIHdlIHdlcmUgYXdhaXRpbmcsIGRvbid0IHBvbGx1dGUgdGhlXG5cdFx0XHQvLyBuZXcgdHVybidzIHN0YXRlIHdpdGggc3RhbGUgZGF0YS4gTGlrZXdpc2UsIGd1YXJkIGFnYWluc3QgYSBuZXdlclxuXHRcdFx0Ly8gdXNhZ2UgZXZlbnQgaGF2aW5nIGFycml2ZWQgXHUyMDE0IG9ubHkgZW5yaWNoIGlmIGJhc2VVc2FnZSBpcyBjdXJyZW50LlxuXHRcdFx0aWYgKHR1cm5JZCAhPT0gdGhpcy5fdHVybklkIHx8IHVzYWdlICE9PSBsYXN0UGFyZW50VXNhZ2UgfHwgbGFzdFBhcmVudFVzYWdlVHVybklkICE9PSB0dXJuSWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29waWxvdFVzYWdlID0gdGhpcy5fcGFyZW50Q29waWxvdFVzYWdlTWV0YSgpO1xuXHRcdFx0aWYgKCFhdHRyaWJ1dGlvbiAmJiAhY29waWxvdFVzYWdlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVucmljaGVkOiBVc2FnZUluZm8gPSB7XG5cdFx0XHRcdC4uLnVzYWdlLFxuXHRcdFx0XHRfbWV0YToge1xuXHRcdFx0XHRcdC4uLih1c2FnZS5fbWV0YSA/PyB7fSksXG5cdFx0XHRcdFx0Li4uKGNvcGlsb3RVc2FnZSA/IHsgY29waWxvdFVzYWdlIH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKGF0dHJpYnV0aW9uID8geyBjb250ZXh0QXR0cmlidXRpb246IGF0dHJpYnV0aW9uIH0gOiB7fSksXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0bGFzdFBhcmVudFVzYWdlID0gZW5yaWNoZWQ7XG5cdFx0XHRsYXN0UGFyZW50VXNhZ2VUdXJuSWQgPSB0dXJuSWQ7XG5cdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VXNhZ2UsXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0dXNhZ2U6IGVucmljaGVkLFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ29tcGFjdGlvbiAobWFudWFsIGAvY29tcGFjdGAgb3IgYXV0b21hdGljKSBydW5zIGl0cyBvd24gc3VtbWFyaXphdGlvbiBtb2RlbCBjYWxsLCB3aGljaCB0aGVcblx0XHQvLyBTREsgYmlsbHMgb24gYHNlc3Npb24uY29tcGFjdGlvbl9jb21wbGV0ZWAgcmF0aGVyIHRoYW4gYXMgYW4gYGFzc2lzdGFudC51c2FnZWAgZXZlbnQuXG5cdFx0Ly9cblx0XHQvLyBBIGNvbXBhY3Rpb24gdGhhdCBydW5zICpkdXJpbmcqIGEgdHVybiBpcyB0aGF0IHR1cm4ncyBjb3N0LCBzbyBmb2xkIGl0IGluIGxpa2UgYW55IG90aGVyXG5cdFx0Ly8gY2FsbC4gT25lIHRoYXQgcnVucyBiZXR3ZWVuIHR1cm5zIGJlbG9uZ3MgdG8gbm8gdHVybjogaXQgaXMgcmVmbGVjdGVkIGluIHRoZSBzZXNzaW9uIHRvdGFsXG5cdFx0Ly8gb25seSwgcmF0aGVyIHRoYW4gYmVpbmcgY2FycmllZCBvbnRvIHdoYXRldmVyIHJ1bnMgbmV4dCBhbmQgaW5mbGF0aW5nIGFuIHVucmVsYXRlZFxuXHRcdC8vIHJlc3BvbnNlIGZvb3RlciBieSB3aGF0IGlzIG9mdGVuIHRoZSBzZXNzaW9uJ3Mgc2luZ2xlIG1vc3QgZXhwZW5zaXZlIGNhbGwuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblNlc3Npb25Db21wYWN0aW9uQ29tcGxldGUoYXN5bmMgZSA9PiB7XG5cdFx0XHRpZiAoZS5hZ2VudElkIHx8IGUuZGF0YS5zdWNjZXNzID09PSBmYWxzZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb3BpbG90VXNhZ2UgPSByZWFkQ29waWxvdFVzYWdlKGUuZGF0YS5jb21wYWN0aW9uVG9rZW5zVXNlZCk7XG5cdFx0XHQvLyBSZXBvcnQgdGhlIHR1cm4ncyBjb3N0IGJlZm9yZSBhd2FpdGluZyBhbnl0aGluZy4gVGhlIHRlcm1pbmFsIGBzZXNzaW9uLmlkbGVgXG5cdFx0XHQvLyBjYW4gYXJyaXZlIHdoaWxlIHRoZSBtZXRyaWNzIHJlYWQgaXMgaW4gZmxpZ2h0IGFuZCBjbG9zZSB0aGUgdHVybiwgYWZ0ZXJcblx0XHRcdC8vIHdoaWNoIHRoZSByZWR1Y2VyIGRyb3BzIHVzYWdlIGZvciBpdCBcdTIwMTQgc28gYSBjb21wYWN0aW9uIHdob3NlIHR1cm4gZW5kc1xuXHRcdFx0Ly8gaW1tZWRpYXRlbHkgKGUuZy4gb25lIGZvbGxvd2VkIGJ5IGEgZmFpbGluZyBtb2RlbCBjYWxsKSB3b3VsZCBuZXZlciBiZVxuXHRcdFx0Ly8gcGVyc2lzdGVkIGlmIHRoaXMgd2FpdGVkLlxuXHRcdFx0Y29uc3QgZW1pdFBhcmVudFVzYWdlID0gKCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdGNvbnN0IHR1cm5JZCA9IHRoaXMuX3R1cm5JZDtcblx0XHRcdFx0Y29uc3QgcGFyZW50Q29waWxvdFVzYWdlID0gdGhpcy5fcGFyZW50Q29waWxvdFVzYWdlTWV0YSgpO1xuXHRcdFx0XHRpZiAoIXR1cm5JZCB8fCAhcGFyZW50Q29waWxvdFVzYWdlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBQcmVzZXJ2ZSB0aGUgcGFyZW50IHR1cm4ncyBvd24gbW9kZWwvY29udGV4dCB0b2tlbnM6IHRoZSBjb21wYWN0aW9uIGNhbGwncyB0b2tlbnMgZGVzY3JpYmVcblx0XHRcdFx0Ly8gdGhlIHN1bW1hcml6YXRpb24gcmVxdWVzdCwgbm90IHRoZSBjb252ZXJzYXRpb24sIHNvIHRoZXkgbXVzdCBub3QgcmVwbGFjZSB3aGF0IGlzIHNob3duLlxuXHRcdFx0XHRjb25zdCBiYXNlID0gbGFzdFBhcmVudFVzYWdlVHVybklkID09PSB0dXJuSWQgPyBsYXN0UGFyZW50VXNhZ2UgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHVzYWdlOiBVc2FnZUluZm8gPSB7XG5cdFx0XHRcdFx0Li4uYmFzZSxcblx0XHRcdFx0XHRtb2RlbDogYmFzZT8ubW9kZWwgPz8gdGhpcy5fbGFzdFNlZW5Nb2RlbElkLFxuXHRcdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0XHQuLi4oYmFzZT8uX21ldGEgPz8ge30pLFxuXHRcdFx0XHRcdFx0Y29waWxvdFVzYWdlOiBwYXJlbnRDb3BpbG90VXNhZ2UsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdFx0bGFzdFBhcmVudFVzYWdlID0gdXNhZ2U7XG5cdFx0XHRcdGxhc3RQYXJlbnRVc2FnZVR1cm5JZCA9IHR1cm5JZDtcblx0XHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VXNhZ2UsXG5cdFx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRcdHVzYWdlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuIHR1cm5JZDtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHR1cm4gPSB0aGlzLl9jdXJyZW50VHVybjtcblx0XHRcdGlmICh0dXJuICYmIGNvcGlsb3RVc2FnZSkge1xuXHRcdFx0XHR0dXJuLmNvcGlsb3ROYW5vQWl1ICs9IGNvcGlsb3RVc2FnZS50b3RhbE5hbm9BaXU7XG5cdFx0XHRcdGVtaXRQYXJlbnRVc2FnZSgpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVGhlbiBwaWNrIHVwIHRoZSBzZXNzaW9uLXdpZGUgdG90YWwsIHdoaWNoIGFsc28gY292ZXJzIGEgY29tcGFjdGlvbiBiaWxsZWRcblx0XHRcdC8vIHdoaWxlIG5vIHR1cm4gd2FzIGFjdGl2ZSwgYW5kIHJlLWVtaXQgc28gdGhlIHdpZGdldCByZWZsZWN0cyBpdC5cblx0XHRcdGNvbnN0IHR1cm5JZEJlZm9yZVJlZnJlc2ggPSB0aGlzLl90dXJuSWQ7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5fcmVmcmVzaFNlc3Npb25Vc2FnZU1ldHJpY3MoKSAmJiB0dXJuSWRCZWZvcmVSZWZyZXNoID09PSB0aGlzLl90dXJuSWQpIHtcblx0XHRcdFx0ZW1pdFBhcmVudFVzYWdlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblJlYXNvbmluZ0RlbHRhKGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBSZWFzb25pbmcgZGVsdGE6ICR7ZS5kYXRhLmRlbHRhQ29udGVudC5sZW5ndGh9IGNoYXJzYCk7XG5cdFx0XHR0aGlzLl9yZXN1bWVTdWJhZ2VudEZvckV2ZW50KGUpO1xuXHRcdFx0aWYgKHRoaXMuX3Nob3VsZERyb3BVbm1hcHBlZFN1YmFnZW50RXZlbnQoZSwgJ2Fzc2lzdGFudC5yZWFzb25pbmdfZGVsdGEnKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9lbWl0UmVhc29uaW5nRGVsdGEoZS5kYXRhLmRlbHRhQ29udGVudCwgdGhpcy5fcGFyZW50VG9vbENhbGxJZEZvclN1YmFnZW50RXZlbnQoZSkpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFN5bmMgdGhlIEFIUCBzZXNzaW9uIGNvbmZpZyB3aGVuIHRoZSBTREsncyBgY3VycmVudE1vZGVgIGNoYW5nZXNcblx0XHQvLyAoZS5nLiBhZnRlciB0aGUgbW9kZWwgYXBwcm92ZXMgYSBwbGFuLCBvciBhZnRlciB3ZSBzZXQgdGhlIG1vZGVcblx0XHQvLyBiZWZvcmUgc2VuZGluZykuIFRoZSBTREsgYW5kIEFIUCBzaGFyZSB0aGUgc2FtZSB0aHJlZSBtb2Rlc1xuXHRcdC8vIChgaW50ZXJhY3RpdmVgIC8gYHBsYW5gIC8gYGF1dG9waWxvdGApLCBzbyB3ZSBtYXAgZGlyZWN0bHkuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblNlc3Npb25Nb2RlQ2hhbmdlZChlID0+IHtcblx0XHRcdC8vIFN1Yi1hZ2VudHMgKGUuZy4gYSBgdGFza2AgdG9vbCBzdWItYWdlbnQgcnVubmluZyBpbiBwbGFuIG1vZGUpXG5cdFx0XHQvLyBlbWl0IHRoZWlyIG93biBgc2Vzc2lvbi5tb2RlX2NoYW5nZWRgIGV2ZW50cyBjYXJyeWluZyBhblxuXHRcdFx0Ly8gYGFnZW50SWRgLlxuXHRcdFx0aWYgKGUuYWdlbnRJZCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIElnbm9yaW5nIHN1YmFnZW50IHNlc3Npb24ubW9kZV9jaGFuZ2VkOiBhZ2VudElkPSR7ZS5hZ2VudElkfSwgJHtlLmRhdGEucHJldmlvdXNNb2RlfSAtPiAke2UuZGF0YS5uZXdNb2RlfWApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gc2Vzc2lvbi5tb2RlX2NoYW5nZWQ6ICR7ZS5kYXRhLnByZXZpb3VzTW9kZX0gLT4gJHtlLmRhdGEubmV3TW9kZX1gKTtcblx0XHRcdGNvbnN0IG5ld01vZGUgPSBlLmRhdGEubmV3TW9kZTtcblx0XHRcdGlmIChuZXdNb2RlICE9PSAnaW50ZXJhY3RpdmUnICYmIG5ld01vZGUgIT09ICdwbGFuJyAmJiBuZXdNb2RlICE9PSAnYXV0b3BpbG90Jykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sYXN0QXBwbGllZE1vZGUgPSBuZXdNb2RlO1xuXHRcdFx0dGhpcy5fc3luY0FocENvbmZpZ0Zyb21TZGtNb2RlKG5ld01vZGUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRyYW5zbGF0ZSBTREstcmVwb3J0ZWQgTUNQIHNlcnZlciBsaWZlY3ljbGUgaW50byBBSFAgY3VzdG9taXphdGlvblxuXHRcdC8vIGFjdGlvbnMuIFRoZSBjb250cm9sbGVyIGRlY2lkZXMgd2hldGhlciBlYWNoIHNlcnZlciBpcyBhXG5cdFx0Ly8gcGx1Z2luLWRlcml2ZWQgY2hpbGQgKG5hcnJvdyBgU2Vzc2lvbk1jcFNlcnZlclN0YXRlQ2hhbmdlZGApIG9yIGFcblx0XHQvLyBiYXJlIHRvcC1sZXZlbCBlbnRyeSAoYFNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZGApLiBFYWNoIHN0YXRlXG5cdFx0Ly8gY2hhbmdlIGlzIGFsc28gbG9nZ2VkICh3aXRoIHN0cnVjdHVyZWQgbWV0YWRhdGEpIHNvIGl0IGZsb3dzIHRvIHRoZVxuXHRcdC8vIGFnZW50IGhvc3QncyBPVExQIGxvZyBzdHJlYW0gYW5kIHRoZSBwZXItc2VydmVyIE91dHB1dCBjaGFubmVscy5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uTWNwU2VydmVyc0xvYWRlZChlID0+IHtcblx0XHRcdHRoaXMuX2xvZ01jcFNlcnZlcnNTbmFwc2hvdChlLmRhdGEuc2VydmVycy5tYXAoKHM6IE1jcFNlcnZlcnNMb2FkZWRTZXJ2ZXIpID0+ICh7XG5cdFx0XHRcdG5hbWU6IHMubmFtZSxcblx0XHRcdFx0c3RhdHVzOiBzLnN0YXR1cyxcblx0XHRcdFx0ZXJyb3I6IHMuZXJyb3IsXG5cdFx0XHRcdHNvdXJjZTogcy5zb3VyY2UsXG5cdFx0XHRcdHRyYW5zcG9ydDogcy50cmFuc3BvcnQsXG5cdFx0XHRcdHBsdWdpbk5hbWU6IHMucGx1Z2luTmFtZSxcblx0XHRcdFx0cGx1Z2luVmVyc2lvbjogcy5wbHVnaW5WZXJzaW9uLFxuXHRcdFx0fSkpLCAnbG9hZGVkJyk7XG5cdFx0XHR0aGlzLl9hcHBseU1jcFNlcnZlckxpc3QoZS5kYXRhLnNlcnZlcnMpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uTWNwU2VydmVyU3RhdHVzQ2hhbmdlZChlID0+IHtcblx0XHRcdHRoaXMuX2xvZ01jcFNlcnZlckxpZmVjeWNsZSh7IG5hbWU6IGUuZGF0YS5zZXJ2ZXJOYW1lLCBzdGF0dXM6IGUuZGF0YS5zdGF0dXMsIGVycm9yOiBlLmRhdGEuZXJyb3IsIG9yaWdpbjogJ3N0YXR1c0NoYW5nZWQnIH0pO1xuXHRcdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5fdG9TZGtNY3BTZXJ2ZXIoZS5kYXRhLnNlcnZlck5hbWUsIGUuZGF0YS5zdGF0dXMsIGUuZGF0YS5lcnJvcik7XG5cdFx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0XHR0aGlzLl9tY3BDdXN0b21pemF0aW9ucy5yZW1vdmUoZS5kYXRhLnNlcnZlck5hbWUpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9tY3BDdXN0b21pemF0aW9ucy5hcHBseU9uZShzZXJ2ZXIpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Ub29sc1VwZGF0ZWQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fc2xhc2hDb21tYW5kUHJvdmlkZXIuY2xlYXJDYWNoZSgpO1xuXHRcdFx0dGhpcy5fZmlyZU1jcFRvb2xzTGlzdENoYW5nZWQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vbkNvbW1hbmRzQ2hhbmdlZCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9zbGFzaENvbW1hbmRQcm92aWRlci5jbGVhckNhY2hlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU2VlZCB0aGUgaW52ZW50b3J5IHdpdGggYW55IHNlcnZlcnMgdGhlIFNESyBoYXMgYWxyZWFkeSBsb2FkZWQgYnlcblx0XHQvLyB0aGUgdGltZSB3ZSBhdHRhY2guIFRoZSBgc2Vzc2lvbi5tY3Bfc2VydmVyc19sb2FkZWRgIGV2ZW50IG1heVxuXHRcdC8vIGhhdmUgZmlyZWQgYmVmb3JlIG91ciBzdWJzY3JpcHRpb24gKGUuZy4gZm9yIHJlc3RvcmVkIHNlc3Npb25zIG9yXG5cdFx0Ly8gd2hlbiBzZXJ2ZXJzIGFyZSBjb25maWd1cmVkIGF0IHNlc3Npb24tY3JlYXRpb24gdGltZSksIGFuZCB0aGVyZVxuXHRcdC8vIGlzIG5vIHJlcGxheS4gU3Vic2VxdWVudCBgYXBwbHlBbGxgIGNhbGxzIGZyb20gdGhlIGV2ZW50IGFyZVxuXHRcdC8vIGlkZW1wb3RlbnQsIHNvIHRoaXMgc2FmZWx5IGNvbnZlcmdlcyBlaXRoZXIgd2F5LlxuXHRcdHRoaXMuX3NlZWRNY3BTZXJ2ZXJzRnJvbVJwYygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE9uZS1zaG90IGZldGNoIG9mIGBycGMubWNwLmxpc3RgIGF0IHN1YnNjcmlwdGlvbiB0aW1lLiBCZXN0LWVmZm9ydDpcblx0ICogYW55IGZhaWx1cmUgaXMgbG9nZ2VkIGFuZCB0aGUgaW52ZW50b3J5IHNpbXBseSBzdGF5cyBlbXB0eSB1bnRpbCB0aGVcblx0ICogbmV4dCBsaXZlIGV2ZW50IGFycml2ZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9zZWVkTWNwU2VydmVyc0Zyb21ScGMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVmcmVzaE1jcFNlcnZlcnNGcm9tUnBjKCkuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEZhaWxlZCB0byBzZWVkIE1DUCBzZXJ2ZXIgaW52ZW50b3J5YCwgZXJyKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlZnJlc2hNY3BTZXJ2ZXJzRnJvbVJwYygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtY3BScGMgPSB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjPy5tY3A7XG5cdFx0aWYgKCFtY3BScGMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbWNwUnBjLmxpc3QoKTtcblx0XHRpZiAoIXRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHRoaXMuX2xvZ01jcFNlcnZlcnNTbmFwc2hvdChyZXN1bHQuc2VydmVycy5tYXAocyA9PiAoe1xuXHRcdFx0XHRuYW1lOiBzLm5hbWUsXG5cdFx0XHRcdHN0YXR1czogcy5zdGF0dXMsXG5cdFx0XHRcdGVycm9yOiBzLmVycm9yLFxuXHRcdFx0XHRzb3VyY2U6IHMuc291cmNlLFxuXHRcdFx0XHRwbHVnaW5OYW1lOiBzLnNvdXJjZVBsdWdpbixcblx0XHRcdFx0cGx1Z2luVmVyc2lvbjogcy5zb3VyY2VQbHVnaW5WZXJzaW9uLFxuXHRcdFx0fSkpLCAnaW52ZW50b3J5Jyk7XG5cdFx0XHR0aGlzLl9hcHBseU1jcFNlcnZlckxpc3QocmVzdWx0LnNlcnZlcnMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5TWNwU2VydmVyTGlzdChzZXJ2ZXJzOiByZWFkb25seSB7IHJlYWRvbmx5IG5hbWU6IHN0cmluZzsgcmVhZG9ubHkgc3RhdHVzOiBTZGtNY3BTZXJ2ZXJTdGF0dXM7IHJlYWRvbmx5IGVycm9yPzogc3RyaW5nIH1bXSk6IHZvaWQge1xuXHRcdGNvbnN0IHNka1NlcnZlcnMgPSBzZXJ2ZXJzXG5cdFx0XHQubWFwKHMgPT4gdGhpcy5fdG9TZGtNY3BTZXJ2ZXIocy5uYW1lLCBzLnN0YXR1cywgcy5lcnJvcikpO1xuXHRcdHRoaXMuX21jcEN1c3RvbWl6YXRpb25zLmFwcGx5QWxsKHNka1NlcnZlcnMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIExvZ3MgYSBmdWxsIE1DUCBpbnZlbnRvcnkgc25hcHNob3QgKHtAbGluayBfbG9nTWNwU2VydmVyTGlmZWN5Y2xlfSBwZXJcblx0ICogc2VydmVyKSwgdGhlbiBmb3JnZXRzIHRoZSBkZWR1cCBlbnRyeSBmb3IgYW55IHNlcnZlciB0aGF0IGRyb3BwZWQgb3V0IG9mXG5cdCAqIHRoZSBzbmFwc2hvdCBzbyBhIGxhdGVyIHJlLWFkZCByZS1sb2dzIGl0cyBhcnJpdmFsLlxuXHQgKi9cblx0cHJpdmF0ZSBfbG9nTWNwU2VydmVyc1NuYXBzaG90KHNlcnZlcnM6IHJlYWRvbmx5IElNY3BMaWZlY3ljbGVMb2dJbmZvW10sIG9yaWdpbjogTWNwTGlmZWN5Y2xlT3JpZ2luKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHNlcnZlcnMpIHtcblx0XHRcdHNlZW4uYWRkKHNlcnZlci5uYW1lKTtcblx0XHRcdHRoaXMuX2xvZ01jcFNlcnZlckxpZmVjeWNsZSh7IC4uLnNlcnZlciwgb3JpZ2luIH0pO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IG5hbWUgb2YgWy4uLnRoaXMuX2xhc3RMb2dnZWRNY3BTdGF0dXMua2V5cygpXSkge1xuXHRcdFx0aWYgKCFzZWVuLmhhcyhuYW1lKSkge1xuXHRcdFx0XHR0aGlzLl9sYXN0TG9nZ2VkTWNwU3RhdHVzLmRlbGV0ZShuYW1lKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRW1pdHMgYSBzaW5nbGUgc3RydWN0dXJlZCBNQ1AgbGlmZWN5Y2xlIGxvZyByZWNvcmQgZm9yIGBzZXJ2ZXJgLFxuXHQgKiBkZWR1cGxpY2F0ZWQgYnkgU0RLIHN0YXR1cyBzbyBhbiB1bmNoYW5nZWQgcmUtcmVwb3J0IHN0YXlzIHF1aWV0LiBGYWlsZWRcblx0ICogc2VydmVycyBsb2cgYXQgYGVycm9yYCAoY2FycnlpbmcgdGhlIGZhaWx1cmUgdGV4dCBpbiB0aGUgYm9keSBhbmQgYW5cblx0ICogYGVycm9yVHlwZWAgYXR0cmlidXRlKTsgZXZlcnkgb3RoZXIgdHJhbnNpdGlvbiBsb2dzIGF0IGBpbmZvYC4gUmVjb3Jkc1xuXHQgKiBmbG93IHRocm91Z2gge0BsaW5rIElMb2dTZXJ2aWNlfSB0byB0aGUgYWdlbnQgaG9zdCdzIE9UTFAgbG9nIHN0cmVhbS5cblx0ICovXG5cdHByaXZhdGUgX2xvZ01jcFNlcnZlckxpZmVjeWNsZShzZXJ2ZXI6IElNY3BMaWZlY3ljbGVMb2dJbmZvICYgeyByZWFkb25seSBvcmlnaW46IE1jcExpZmVjeWNsZU9yaWdpbiB9KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2xhc3RMb2dnZWRNY3BTdGF0dXMuZ2V0KHNlcnZlci5uYW1lKSA9PT0gc2VydmVyLnN0YXR1cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9sYXN0TG9nZ2VkTWNwU3RhdHVzLnNldChzZXJ2ZXIubmFtZSwgc2VydmVyLnN0YXR1cyk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3RyYW5zbGF0ZVNka01jcFN0YXR1cyhzZXJ2ZXIubmFtZSwgc2VydmVyLnN0YXR1cywgc2VydmVyLmVycm9yKTtcblx0XHRjb25zdCBhdHRyaWJ1dGVzOiBSZWNvcmQ8c3RyaW5nLCBPdGVsQXR0cmlidXRlVmFsdWU+ID0ge1xuXHRcdFx0bWNwRXZlbnQ6IHNlcnZlci5vcmlnaW4sXG5cdFx0XHRtY3BTZXJ2ZXI6IHNlcnZlci5uYW1lLFxuXHRcdFx0bWNwU3RhdHVzOiBzZXJ2ZXIuc3RhdHVzLFxuXHRcdFx0bWNwU3RhdGU6IHN0YXRlLmtpbmQsXG5cdFx0fTtcblx0XHRpZiAoc2VydmVyLnNvdXJjZSkgeyBhdHRyaWJ1dGVzLm1jcFNvdXJjZSA9IHNlcnZlci5zb3VyY2U7IH1cblx0XHRpZiAoc2VydmVyLnRyYW5zcG9ydCkgeyBhdHRyaWJ1dGVzLm1jcFRyYW5zcG9ydCA9IHNlcnZlci50cmFuc3BvcnQ7IH1cblx0XHRpZiAoc2VydmVyLnBsdWdpbk5hbWUpIHsgYXR0cmlidXRlcy5tY3BQbHVnaW4gPSBzZXJ2ZXIucGx1Z2luTmFtZTsgfVxuXHRcdGlmIChzZXJ2ZXIucGx1Z2luVmVyc2lvbikgeyBhdHRyaWJ1dGVzLm1jcFBsdWdpblZlcnNpb24gPSBzZXJ2ZXIucGx1Z2luVmVyc2lvbjsgfVxuXHRcdGlmIChzdGF0ZS5raW5kID09PSBNY3BTZXJ2ZXJTdGF0dXMuRXJyb3IpIHsgYXR0cmlidXRlcy5lcnJvclR5cGUgPSBzdGF0ZS5lcnJvci5lcnJvclR5cGU7IH1cblxuXHRcdGNvbnN0IGRldGFpbCA9IHNlcnZlci5lcnJvciA/IGA6ICR7c2VydmVyLmVycm9yfWAgOiAnJztcblx0XHRjb25zdCBtZXNzYWdlID0gYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBNQ1Agc2VydmVyICcke3NlcnZlci5uYW1lfScgJHtzZXJ2ZXIuc3RhdHVzfSAoJHtzdGF0ZS5raW5kfSkke2RldGFpbH1gO1xuXHRcdGlmIChzZXJ2ZXIuc3RhdHVzID09PSAnZmFpbGVkJykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihtZXNzYWdlLCBuZXcgT3RlbERhdGEoYXR0cmlidXRlcykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8obWVzc2FnZSwgbmV3IE90ZWxEYXRhKGF0dHJpYnV0ZXMpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXRUb29sQ2FsbFVpTWV0YShtZXRhOiBNdXRhYmxlPElUb29sQ2FsbE1ldGE+LCByZXNvdXJjZVVyaTogc3RyaW5nIHwgdW5kZWZpbmVkLCBtY3BTZXJ2ZXJOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIXJlc291cmNlVXJpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHVpOiBNdXRhYmxlPElUb29sQ2FsbFVpTWV0YT4gPSB7IHJlc291cmNlVXJpIH07XG5cdFx0aWYgKG1jcFNlcnZlck5hbWUpIHtcblx0XHRcdGNvbnN0IGNoYW5uZWwgPSB0aGlzLl9tY3BDdXN0b21pemF0aW9ucy5jaGFubmVsRm9yU2VydmVyKG1jcFNlcnZlck5hbWUpO1xuXHRcdFx0aWYgKGNoYW5uZWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR1aS5jaGFubmVsID0gY2hhbm5lbDtcblx0XHRcdH1cblx0XHR9XG5cdFx0bWV0YS51aSA9IHVpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJyb2FkY2FzdHMgYG5vdGlmaWNhdGlvbnMvdG9vbHMvbGlzdF9jaGFuZ2VkYCBmb3IgZXZlcnkgTUNQIHNlcnZlclxuXHQgKiBjdXJyZW50bHkgaW4gdGhlIGBSZWFkeWAgc3RhdGUuIFRoZSBTREsncyBgc2Vzc2lvbi50b29sc191cGRhdGVkYFxuXHQgKiBldmVudCBpcyBhIGNvYXJzZSBcInRvb2xzIHJlZnJlc2hlZFwiIGhpbnQgdGhhdCBkb2Vzbid0IGlkZW50aWZ5XG5cdCAqIHdoaWNoIHNlcnZlciBjaGFuZ2VkLCBzbyB3ZSBmYW4gb3V0IHRvIGFsbCByZWFkeSBjaGFubmVscy4gQ2xpZW50c1xuXHQgKiBhcmUgZXhwZWN0ZWQgdG8gcmVmZXRjaCBgdG9vbHMvbGlzdGAgb24gZWFjaCBub3RpZmljYXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9maXJlTWNwVG9vbHNMaXN0Q2hhbmdlZCgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHsgY2hhbm5lbCB9IG9mIHRoaXMuX21jcEN1c3RvbWl6YXRpb25zLnJlYWR5Q2hhbm5lbHMoKSkge1xuXHRcdFx0dGhpcy5fb25NY3BOb3RpZmljYXRpb24uZmlyZSh7XG5cdFx0XHRcdGNoYW5uZWwsXG5cdFx0XHRcdG1ldGhvZDogJ25vdGlmaWNhdGlvbnMvdG9vbHMvbGlzdF9jaGFuZ2VkJyxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBTbmFwc2hvdCBvZiBNQ1Agc2VydmVycyB0aGF0IGhhdmUgbm8gcGx1Z2luLWRlcml2ZWQgY2hpbGQgZW50cnkuICovXG5cdHRvcExldmVsTWNwQ3VzdG9taXphdGlvbnMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21jcEN1c3RvbWl6YXRpb25zLnRvcExldmVsQ3VzdG9taXphdGlvbnMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcmFuc2xhdGVzIHRoZSBTREsncyBmbGF0IE1DUCBzdGF0dXMgc3RyaW5nIGludG8gQUhQJ3MgZGlzY3JpbWluYXRlZFxuXHQgKiB7QGxpbmsgTWNwU2VydmVyU3RhdGV9IHVuaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfdG9TZGtNY3BTZXJ2ZXIobmFtZTogc3RyaW5nLCBzdGF0dXM6IFNka01jcFNlcnZlclN0YXR1cywgZXJyb3I/OiBzdHJpbmcpOiBJU2RrTWNwU2VydmVyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZSxcblx0XHRcdHN0YXRlOiB0aGlzLl90cmFuc2xhdGVTZGtNY3BTdGF0dXMobmFtZSwgc3RhdHVzLCBlcnJvciksXG5cdFx0XHRlbmFibGVkOiBzdGF0dXMgIT09ICdkaXNhYmxlZCcsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3RyYW5zbGF0ZVNka01jcFN0YXR1cyhuYW1lOiBzdHJpbmcsIHN0YXR1czogU2RrTWNwU2VydmVyU3RhdHVzLCBlcnJvcj86IHN0cmluZyk6IE1jcFNlcnZlclN0YXRlIHtcblx0XHRzd2l0Y2ggKHN0YXR1cykge1xuXHRcdFx0Y2FzZSAnY29ubmVjdGVkJzpcblx0XHRcdFx0cmV0dXJuIHsga2luZDogTWNwU2VydmVyU3RhdHVzLlJlYWR5IH07XG5cdFx0XHRjYXNlICdmYWlsZWQnOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5FcnJvcixcblx0XHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdFx0ZXJyb3JUeXBlOiAnbWNwLXNlcnZlci1mYWlsZWQnLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogZXJyb3IgPz8gJ01DUCBzZXJ2ZXIgZmFpbGVkIHRvIHN0YXJ0Jyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAncGVuZGluZyc6XG5cdFx0XHRjYXNlICduZWVkcy1hdXRoJzoge1xuXHRcdFx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX21jcEN1c3RvbWl6YXRpb25zLnN0YXRlRm9yU2VydmVyKG5hbWUpO1xuXHRcdFx0XHRpZiAocHJldmlvdXM/LmtpbmQgPT09IE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gcHJldmlvdXM7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHsga2luZDogTWNwU2VydmVyU3RhdHVzLlN0YXJ0aW5nIH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdkaXNhYmxlZCc6XG5cdFx0XHRjYXNlICdub3RfY29uZmlndXJlZCc6XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkIH07XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4geyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuU3RvcHBlZCB9O1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUcmFuc2xhdGVzIHRoZSBTREsncyB0aHJlZS1tb2RlIHNwYWNlIChgaW50ZXJhY3RpdmVgIC8gYHBsYW5gIC9cblx0ICogYGF1dG9waWxvdGApIHRvIEFIUCdzIGBtb2RlYCBheGlzIGRpcmVjdGx5OlxuXHQgKlxuXHQgKiAgLSBTREsgYHBsYW5gIFx1MjE5MiBBSFAgYG1vZGU9J3BsYW4nYC5cblx0ICogIC0gU0RLIGBpbnRlcmFjdGl2ZWAgXHUyMTkyIEFIUCBgbW9kZT0naW50ZXJhY3RpdmUnYC5cblx0ICogIC0gU0RLIGBhdXRvcGlsb3RgIFx1MjE5MiBBSFAgYG1vZGU9J2F1dG9waWxvdCdgLlxuXHQgKlxuXHQgKiBBdXRvcGlsb3QgbGl2ZXMgb24gdGhlIGBtb2RlYCBheGlzOyB0aGUgb3J0aG9nb25hbCBgYXV0b0FwcHJvdmVgIGF4aXNcblx0ICogKERlZmF1bHQgLyBCeXBhc3MpIGlzIGxlZnQgdW50b3VjaGVkIHNvIHRoZSB1c2VyJ3MgY2hvc2VuXG5cdCAqIGFwcHJvdmFsIGxldmVsIGlzIHByZXNlcnZlZCBhY3Jvc3MgU0RLIG1vZGUgdHJhbnNpdGlvbnMuXG5cdCAqXG5cdCAqIFBhdGNoZXMgdGhhdCBhbHJlYWR5IG1hdGNoIHRoZSBjdXJyZW50IEFIUCB2YWx1ZXMgYXJlIHN0aWxsXG5cdCAqIGRpc3BhdGNoZWQgKHRoZSByZWR1Y2VyIGlzIGEgbm8tb3AgaW4gdGhhdCBjYXNlKSBidXQgd3JpdHRlbiB2YWx1ZXNcblx0ICogcHJvcGFnYXRlIHRvIGFsbCBzdWJzY3JpYmVkIGNsaWVudHMgdmlhIGBzZXNzaW9uL2NvbmZpZ0NoYW5nZWRgLlxuXHQgKi9cblx0cHJpdmF0ZSBfc3luY0FocENvbmZpZ0Zyb21TZGtNb2RlKHNka01vZGU6IENvcGlsb3RTZGtNb2RlKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IHRoaXMuX3N0b3JhZ2VVcmkudG9TdHJpbmcoKTtcblx0XHRjb25zdCBwYXRjaDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcblx0XHRzd2l0Y2ggKHNka01vZGUpIHtcblx0XHRcdGNhc2UgJ3BsYW4nOlxuXHRcdFx0XHRwYXRjaFtTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdID0gJ3BsYW4nO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2F1dG9waWxvdCc6XG5cdFx0XHRcdHBhdGNoW1Nlc3Npb25Db25maWdLZXkuTW9kZV0gPSAnYXV0b3BpbG90Jztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdpbnRlcmFjdGl2ZSc6XG5cdFx0XHRcdHBhdGNoW1Nlc3Npb25Db25maWdLZXkuTW9kZV0gPSAnaW50ZXJhY3RpdmUnO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlU2Vzc2lvbkNvbmZpZyhzZXNzaW9uVXJpLCBwYXRjaCk7XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlcyB0aGUgQ0xJJ3MgYGV4aXRQbGFuTW9kZS5yZXF1ZXN0YCBSUEMgYnkgc3VyZmFjaW5nIGl0IGFzIGFcblx0ICoge0BsaW5rIENoYXRJbnB1dFJlcXVlc3R9IGFuZCBhd2FpdGluZyB0aGUgY2xpZW50J3MgcmVzcG9uc2UuIFRoZVxuXHQgKiByZXNvbHZlZCB7QGxpbmsgSUV4aXRQbGFuTW9kZVJlc3BvbnNlfSBmbG93cyBiYWNrIHRvIHRoZSBDTEksIHdoaWNoXG5cdCAqIGNhbGxzIGBzZXNzaW9uLnJlc3BvbmRUb0V4aXRQbGFuTW9kZWAgaW50ZXJuYWxseSBcdTIwMTQgdGhhdCByZXN1bWVzIHRoZVxuXHQgKiBwYXVzZWQgYGV4aXRfcGxhbl9tb2RlYCB0b29sIGNhbGwgYW5kIChvbiBhY2NlcHQpIHVwZGF0ZXMgdGhlIFNESydzXG5cdCAqIGBjdXJyZW50TW9kZWAgc28gdGhlIG1vZGVsIGNhbiBjb250aW51ZSB3aXRoIGltcGxlbWVudGF0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlRXhpdFBsYW5Nb2RlUmVxdWVzdChkYXRhOiBFeGl0UGxhbk1vZGVSZXF1ZXN0LCBfaW52b2NhdGlvbjogeyBzZXNzaW9uSWQ6IHN0cmluZyB9KTogUHJvbWlzZTxJRXhpdFBsYW5Nb2RlUmVzcG9uc2U+IHtcblx0XHRjb25zdCB0dXJuSWQgPSB0aGlzLl9jdXJyZW50VHVybj8uaWQ7XG5cdFx0aWYgKCF0dXJuSWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIFJlamVjdGluZyBwbGFuIHJldmlldyByZXF1ZXN0IHdpdGhvdXQgYW4gYWN0aXZlIHR1cm5gKTtcblx0XHRcdHJldHVybiB7IGFwcHJvdmVkOiBmYWxzZSB9O1xuXHRcdH1cblx0XHRjb25zdCByZXF1ZXN0SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBxdWVzdGlvbklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gZXhpdFBsYW5Nb2RlLnJlcXVlc3Q6IHJwY0lkPSR7cmVxdWVzdElkfSwgYWN0aW9ucz1bJHtkYXRhLmFjdGlvbnMuam9pbignLCcpfV0sIHJlY29tbWVuZGVkPSR7ZGF0YS5yZWNvbW1lbmRlZEFjdGlvbn1gKTtcblxuXHRcdGxldCBwbGFuUGF0aDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBsYW5SZWFkID0gYXdhaXQgdGhpcy5fd3JhcHBlci5zZXNzaW9uLnJwYy5wbGFuLnJlYWQoKTtcblx0XHRcdHBsYW5QYXRoID0gcGxhblJlYWQucGF0aCA/PyBudWxsO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gcnBjLnBsYW4ucmVhZCBmYWlsZWQgZm9yIGV4aXRfcGxhbl9tb2RlOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRUdXJuPy5pZCAhPT0gdHVybklkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBSZWplY3RpbmcgcGxhbiByZXZpZXcgcmVxdWVzdCBhZnRlciBpdHMgdHVybiBlbmRlZGApO1xuXHRcdFx0cmV0dXJuIHsgYXBwcm92ZWQ6IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGRhdGEuYWN0aW9ucy5tYXAoYWN0aW9uSWQgPT4ge1xuXHRcdFx0Y29uc3QgZGVzYyA9IGdldFBsYW5BY3Rpb25EZXNjcmlwdGlvbihhY3Rpb25JZCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogYWN0aW9uSWQsXG5cdFx0XHRcdGxhYmVsOiBkZXNjPy5sYWJlbCA/PyBhY3Rpb25JZCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGRlc2M/LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRyZWNvbW1lbmRlZDogYWN0aW9uSWQgPT09IGRhdGEucmVjb21tZW5kZWRBY3Rpb24sXG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYWN0aW9uczogSUFnZW50SG9zdFBsYW5SZXZpZXdBY3Rpb25bXSA9IG9wdGlvbnMubWFwKG9wdGlvbiA9PiAoe1xuXHRcdFx0aWQ6IG9wdGlvbi5pZCxcblx0XHRcdGxhYmVsOiBvcHRpb24ubGFiZWwsXG5cdFx0XHQuLi4ob3B0aW9uLmRlc2NyaXB0aW9uID8geyBkZXNjcmlwdGlvbjogb3B0aW9uLmRlc2NyaXB0aW9uIH0gOiB7fSksXG5cdFx0XHQuLi4ob3B0aW9uLnJlY29tbWVuZGVkID8geyBkZWZhdWx0OiB0cnVlIH0gOiB7fSksXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5wdXRSZXF1ZXN0OiBDaGF0SW5wdXRSZXF1ZXN0V2l0aFBsYW5SZXZpZXcgPSB7XG5cdFx0XHRpZDogcmVxdWVzdElkLFxuXHRcdFx0cGxhblJldmlldzoge1xuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5wbGFuUmV2aWV3LnRpdGxlJywgXCJSZXZpZXcgUGxhblwiKSxcblx0XHRcdFx0Y29udGVudDogZGF0YS5zdW1tYXJ5IHx8IGxvY2FsaXplKCdhZ2VudEhvc3QucGxhblJldmlldy5mYWxsYmFja1N1bW1hcnknLCBcIkEgcGxhbiBpcyByZWFkeSBmb3IgcmV2aWV3LlwiKSxcblx0XHRcdFx0YWN0aW9ucyxcblx0XHRcdFx0Y2FuUHJvdmlkZUZlZWRiYWNrOiB0cnVlLFxuXHRcdFx0XHRhbnN3ZXJRdWVzdGlvbklkOiBxdWVzdGlvbklkLFxuXHRcdFx0XHQuLi4ocGxhblBhdGggPyB7IHBsYW5Vcmk6IFVSSS5maWxlKHBsYW5QYXRoKS50b1N0cmluZygpIH0gOiB7fSksXG5cdFx0XHR9LFxuXHRcdFx0cXVlc3Rpb25zOiBbe1xuXHRcdFx0XHRraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuU2luZ2xlU2VsZWN0LFxuXHRcdFx0XHRpZDogcXVlc3Rpb25JZCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3QucGxhblJldmlldy50aXRsZScsIFwiUmV2aWV3IFBsYW5cIiksXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdhZ2VudEhvc3QucGxhblJldmlldy5xdWVzdGlvbk1lc3NhZ2UnLCBcIkhvdyB3b3VsZCB5b3UgbGlrZSB0byBwcm9jZWVkP1wiKSxcblx0XHRcdFx0cmVxdWlyZWQ6IHRydWUsXG5cdFx0XHRcdG9wdGlvbnMsXG5cdFx0XHRcdGFsbG93RnJlZWZvcm1JbnB1dDogdHJ1ZSxcblx0XHRcdH1dLFxuXHRcdH07XG5cblx0XHRjb25zdCBwZW5kaW5nUGxhblJldmlldyA9IHRoaXMuX3BlbmRpbmdQbGFuUmV2aWV3cy5yZWdpc3RlcihyZXF1ZXN0SWQsIHtcblx0XHRcdGFjdGlvbnM6IGRhdGEuYWN0aW9ucyxcblx0XHRcdHJlY29tbWVuZGVkQWN0aW9uOiBkYXRhLnJlY29tbWVuZGVkQWN0aW9uLFxuXHRcdFx0cXVlc3Rpb25JZCxcblx0XHR9KTtcblxuXHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUoe1xuXHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRyZXNvdXJjZTogdGhpcy5fY2hhdENoYW5uZWxVcmksXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0SW5wdXRSZXF1ZXN0ZWQsXG5cdFx0XHRcdHJlcXVlc3Q6IGlucHV0UmVxdWVzdCxcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgcGVuZGluZ1BsYW5SZXZpZXc7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVyciwgYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBleGl0UGxhbk1vZGUucmVxdWVzdCBoYW5kbGVyIGZhaWxlZDogcnBjSWQ9JHtyZXF1ZXN0SWR9YCk7XG5cdFx0XHRyZXR1cm4geyBhcHByb3ZlZDogZmFsc2UgfTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRHJvcCB0aGUgbWVtb2l6ZWQgZXZlbnQgcmVjb25zdHJ1Y3Rpb24gd2hlbmV2ZXIgdGhlIHBlcnNpc3RlZCBldmVudCBsb2dcblx0ICogY291bGQgaGF2ZSBjaGFuZ2VkLCBzbyB7QGxpbmsgX2dldE1hcHBlZEV2ZW50c30gbmV2ZXIgc2VydmVzIHN0YWxlIHR1cm5zXG5cdCAqIG9uY2UgdGhlIHNlc3Npb24gcmVzdW1lcyBhY3Rpdml0eS4gV2hpbGUgdGhlIHNlc3Npb24gaXMgaWRsZSAoZS5nLiBkdXJpbmdcblx0ICogYSBoaXN0b3JpY2FsIHNlc3Npb24gb3Blbikgbm9uZSBvZiB0aGVzZSBmaXJlLCBzbyB0aGUgd2hvbGUgcmVzdG9yZSB3YXZlXG5cdCAqIGNvYWxlc2NlcyB0byBhIHNpbmdsZSByZWNvbnN0cnVjdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX3N1YnNjcmliZUZvck1lbW9JbnZhbGlkYXRpb24oKTogdm9pZCB7XG5cdFx0Y29uc3Qgd3JhcHBlciA9IHRoaXMuX3dyYXBwZXI7XG5cdFx0Y29uc3QgaW52YWxpZGF0ZSA9ICgpID0+IHRoaXMuX2ludmFsaWRhdGVNYXBwZWRFdmVudHMoKTtcblx0XHQvLyBOZXcgY29udGVudCBhcHBlbmRlZCB0byB0aGUgbG9nLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Vc2VyTWVzc2FnZShpbnZhbGlkYXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblR1cm5TdGFydChpbnZhbGlkYXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vbk1lc3NhZ2UoaW52YWxpZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Ub29sU3RhcnQoaW52YWxpZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Ub29sQ29tcGxldGUoaW52YWxpZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TdWJhZ2VudFN0YXJ0ZWQoaW52YWxpZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TdWJhZ2VudENvbXBsZXRlZChpbnZhbGlkYXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblN1YmFnZW50RmFpbGVkKGludmFsaWRhdGUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uVHVybkVuZChpbnZhbGlkYXRlKSk7XG5cdFx0Ly8gSW4tcGxhY2UgcmV3cml0ZXMgb2YgdGhlIHBlcnNpc3RlZCBsb2cuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblNlc3Npb25Db21wYWN0aW9uQ29tcGxldGUoaW52YWxpZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TZXNzaW9uVHJ1bmNhdGlvbihpbnZhbGlkYXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblNlc3Npb25TbmFwc2hvdFJld2luZChpbnZhbGlkYXRlKSk7XG5cdH1cblxuXHQvKipcblx0ICogRW1pdHMgYGluc3RydWN0aW9uc0NvbGxlY3RlZGAgcGVyIHVzZXIgbWVzc2FnZS5cblx0ICogQXR0ZW1wdHMgdG8gbWF0Y2ggbG9jYWwgY2hhdCdzIGBDb21wdXRlQXV0b21hdGljSW5zdHJ1Y3Rpb25zYFxuXHQgKiBlbWl0dGVyIChgc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9jb21wdXRlQXV0b21hdGljSW5zdHJ1Y3Rpb25zLnRzYClcblx0ICovXG5cdHByaXZhdGUgX3N1YnNjcmliZUZvckluc3RydWN0aW9uc0NvbGxlY3RlZFRlbGVtZXRyeSgpOiB2b2lkIHtcblx0XHRjb25zdCB3cmFwcGVyID0gdGhpcy5fd3JhcHBlcjtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLnNlc3Npb25JZDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Vc2VyTWVzc2FnZShlID0+IHtcblx0XHRcdC8vIFNraXAgc3ViYWdlbnQgYW5kIFNESy1pbmplY3RlZCBtZXNzYWdlcyAobWF0Y2hlcyBndWFyZCBvbiB0aGlzIGV2ZW50IGFib3ZlKS5cblx0XHRcdGlmIChlLmFnZW50SWQgfHwgKGUuZGF0YS5zb3VyY2UgJiYgZS5kYXRhLnNvdXJjZS50b0xvd2VyQ2FzZSgpICE9PSAndXNlcicpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHZvaWQgKGFzeW5jICgpID0+IHtcblx0XHRcdFx0bGV0IHNvdXJjZXM7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0c291cmNlcyA9IChhd2FpdCB3cmFwcGVyLnNlc3Npb24ucnBjLmluc3RydWN0aW9ucy5nZXRTb3VyY2VzKCkpLnNvdXJjZXM7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gRmFpbGVkIHRvIGZldGNoIGluc3RydWN0aW9uIHNvdXJjZXMgZm9yIHRlbGVtZXRyeTogJHtnZXRFcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgYWdlbnRJbnN0cnVjdGlvbnNDb3VudCA9IDA7XG5cdFx0XHRcdGxldCBhcHBseWluZ0luc3RydWN0aW9uc0NvdW50ID0gMDtcblx0XHRcdFx0bGV0IHJlZmVyZW5jZWRJbnN0cnVjdGlvbnNDb3VudCA9IDA7XG5cdFx0XHRcdGxldCBjbGF1ZGVNZENvdW50ID0gMDtcblx0XHRcdFx0Zm9yIChjb25zdCBzIG9mIHNvdXJjZXMpIHtcblx0XHRcdFx0XHQvLyBUaGUgU0RLIG1hcmtzIGNvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kIChob21lL3JlcG8pIGFuZCByb290LWxldmVsXG5cdFx0XHRcdFx0Ly8gQUdFTlRTLm1kIC8gQ0xBVURFLm1kIC8gR0VNSU5JLm1kIGFzIGBob21lYC9gcmVwb2AvYG1vZGVsYFxuXHRcdFx0XHRcdGlmIChzLnR5cGUgPT09ICdob21lJyB8fCBzLnR5cGUgPT09ICdyZXBvJyB8fCBzLnR5cGUgPT09ICdtb2RlbCcpIHtcblx0XHRcdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zQ291bnQrKztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAocy5hcHBseVRvICYmIHMuYXBwbHlUby5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRhcHBseWluZ0luc3RydWN0aW9uc0NvdW50Kys7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHMudHlwZSA9PT0gJ2NoaWxkLWluc3RydWN0aW9ucycgfHwgcy50eXBlID09PSAnbmVzdGVkLWFnZW50cycpIHtcblx0XHRcdFx0XHRcdHJlZmVyZW5jZWRJbnN0cnVjdGlvbnNDb3VudCsrO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGxhc3RTZXAgPSBNYXRoLm1heChzLnNvdXJjZVBhdGgubGFzdEluZGV4T2YoJy8nKSwgcy5zb3VyY2VQYXRoLmxhc3RJbmRleE9mKCdcXFxcJykpO1xuXHRcdFx0XHRcdGNvbnN0IGZpbGVuYW1lID0gbGFzdFNlcCA+PSAwID8gcy5zb3VyY2VQYXRoLnNsaWNlKGxhc3RTZXAgKyAxKSA6IHMuc291cmNlUGF0aDtcblx0XHRcdFx0XHRpZiAoZmlsZW5hbWUgPT09ICdDTEFVREUubWQnKSB7XG5cdFx0XHRcdFx0XHRjbGF1ZGVNZENvdW50Kys7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dHlwZSBBZ2VudEhvc3RJbnN0cnVjdGlvbnNDb2xsZWN0ZWRFdmVudCA9IHtcblx0XHRcdFx0XHRwcm92aWRlcjogc3RyaW5nO1xuXHRcdFx0XHRcdGFnZW50U2Vzc2lvbklkOiBzdHJpbmc7XG5cdFx0XHRcdFx0aXNTdWJhZ2VudFNlc3Npb246IGJvb2xlYW47XG5cdFx0XHRcdFx0dG90YWxJbnN0cnVjdGlvbnNDb3VudDogbnVtYmVyO1xuXHRcdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zQ291bnQ6IG51bWJlcjtcblx0XHRcdFx0XHRhcHBseWluZ0luc3RydWN0aW9uc0NvdW50OiBudW1iZXI7XG5cdFx0XHRcdFx0cmVmZXJlbmNlZEluc3RydWN0aW9uc0NvdW50OiBudW1iZXI7XG5cdFx0XHRcdFx0Y2xhdWRlTWRDb3VudDogbnVtYmVyO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR0eXBlIEFnZW50SG9zdEluc3RydWN0aW9uc0NvbGxlY3RlZENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdHByb3ZpZGVyOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIEFnZW50IEhvc3QgcHJvdmlkZXIgdGhhdCBlbWl0dGVkIHRoaXMgZXZlbnQgKGUuZy4gY29waWxvdGNsaSkuIEFic2VudCBvbiBsb2NhbCByb3dzOyB1c2UgcHJlc2VuY2UgdG8gZGlzdGluZ3Vpc2ggQUggZnJvbSBsb2NhbC4nIH07XG5cdFx0XHRcdFx0YWdlbnRTZXNzaW9uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgQWdlbnQgSG9zdCBzZXNzaW9uIGlkZW50aWZpZXIuIEFic2VudCBvbiBsb2NhbCByb3dzLicgfTtcblx0XHRcdFx0XHRpc1N1YmFnZW50U2Vzc2lvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1doZXRoZXIgdGhlIGVtaXNzaW9uIHdhcyBmcm9tIGEgc3ViYWdlbnQgc2Vzc2lvbi4nIH07XG5cdFx0XHRcdFx0dG90YWxJbnN0cnVjdGlvbnNDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RvdGFsIG51bWJlciBvZiBpbnN0cnVjdGlvbiBzb3VyY2VzIGxvYWRlZCBieSB0aGUgQWdlbnQgSG9zdCBzZXNzaW9uLicgfTtcblx0XHRcdFx0XHRhZ2VudEluc3RydWN0aW9uc0NvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIHRvcC1sZXZlbCBhZ2VudCBpbnN0cnVjdGlvbiBmaWxlcyAoY29waWxvdC1pbnN0cnVjdGlvbnMubWQsIEFHRU5UUy5tZCwgQ0xBVURFLm1kLCBHRU1JTkkubWQpIGFtb25nIHRoZSBsb2FkZWQgc291cmNlcy4nIH07XG5cdFx0XHRcdFx0YXBwbHlpbmdJbnN0cnVjdGlvbnNDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBsb2FkZWQgaW5zdHJ1Y3Rpb24gc291cmNlcyB0aGF0IGNhcnJ5IGFuIGFwcGx5VG8gZ2xvYiBwYXR0ZXJuLiBTZW1hbnRpYyBzaGlmdCBmcm9tIHRoZSBsb2NhbCBmaWVsZCwgd2hpY2ggY291bnRzIHNvdXJjZXMgd2hvc2UgYXBwbHlUbyBtYXRjaGVkIHRoZSBjdXJyZW50IHJlcXVlc3QgY29udGV4dC4nIH07XG5cdFx0XHRcdFx0cmVmZXJlbmNlZEluc3RydWN0aW9uc0NvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIGxvYWRlZCBpbnN0cnVjdGlvbiBzb3VyY2VzIGRpc2NvdmVyZWQgdHJhbnNpdGl2ZWx5IChjaGlsZC1pbnN0cnVjdGlvbnMgdmlhIHN1YmRpcmVjdG9yeSB3YWxrLCBvciBuZXN0ZWQgQUdFTlRTLm1kKS4gU2VtYW50aWMgc2hpZnQgZnJvbSB0aGUgbG9jYWwgZmllbGQsIHdoaWNoIGNvdW50cyBzb3VyY2VzIGFkZGVkIHZpYSBleHBsaWNpdCA8ZmlsZT4gcmVmZXJlbmNlcyBpbiBvdGhlciBpbnN0cnVjdGlvbiBmaWxlcy4nIH07XG5cdFx0XHRcdFx0Y2xhdWRlTWRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBDTEFVREUubWQgZmlsZXMgYW1vbmcgdGhlIGxvYWRlZCBzb3VyY2VzLicgfTtcblx0XHRcdFx0XHRvd25lcjogJ2FtdW5nZXInO1xuXHRcdFx0XHRcdGNvbW1lbnQ6ICdBZ2VudCBIb3N0IGVtaXNzaW9uIG9mIGFnZW50SG9zdC5pbnN0cnVjdGlvbnNDb2xsZWN0ZWQuIENhcnJpZXMgdGhlIHN1YnNldCBvZiB0aGUgbG9jYWwgc2hhcGUgdGhhdCBjYW4gYmUgaG9uZXN0bHkgKG9yIGNsb3NlLWFuYWxvZ291c2x5KSBjb21wdXRlZCBmcm9tIHRoZSBTREtcXCdzIEluc3RydWN0aW9uU291cmNlIGxpc3Q7IG90aGVyIGZpZWxkcyBhcmUgaW50ZW50aW9uYWxseSBvbWl0dGVkIChzZWUgc291cmNlIGNvbW1lbnQpLic7XG5cdFx0XHRcdH07XG5cdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxBZ2VudEhvc3RJbnN0cnVjdGlvbnNDb2xsZWN0ZWRFdmVudCwgQWdlbnRIb3N0SW5zdHJ1Y3Rpb25zQ29sbGVjdGVkQ2xhc3NpZmljYXRpb24+KCdhZ2VudEhvc3QuaW5zdHJ1Y3Rpb25zQ29sbGVjdGVkJywge1xuXHRcdFx0XHRcdHByb3ZpZGVyOiB0aGlzLnNlc3Npb25Vcmkuc2NoZW1lLFxuXHRcdFx0XHRcdGFnZW50U2Vzc2lvbklkOiBBZ2VudFNlc3Npb24uaWQodGhpcy5zZXNzaW9uVXJpKSxcblx0XHRcdFx0XHRpc1N1YmFnZW50U2Vzc2lvbjogaXNTdWJhZ2VudFNlc3Npb24odGhpcy5zZXNzaW9uVXJpKSxcblx0XHRcdFx0XHR0b3RhbEluc3RydWN0aW9uc0NvdW50OiBzb3VyY2VzLmxlbmd0aCxcblx0XHRcdFx0XHRhZ2VudEluc3RydWN0aW9uc0NvdW50LFxuXHRcdFx0XHRcdGFwcGx5aW5nSW5zdHJ1Y3Rpb25zQ291bnQsXG5cdFx0XHRcdFx0cmVmZXJlbmNlZEluc3RydWN0aW9uc0NvdW50LFxuXHRcdFx0XHRcdGNsYXVkZU1kQ291bnQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSkoKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIGluc3RydWN0aW9uc0NvbGxlY3RlZCB0ZWxlbWV0cnkgZmFpbGVkOiAke2dldEVycm9yTWVzc2FnZShlcnIpfWApO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3Vic2NyaWJlRm9yTG9nZ2luZygpOiB2b2lkIHtcblx0XHRjb25zdCB3cmFwcGVyID0gdGhpcy5fd3JhcHBlcjtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLnNlc3Npb25JZDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25VbmhhbmRsZWRFdmVudChlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gVW5oYW5kbGVkIFNESyBldmVudDogJHtzYWZlU3RyaW5naWZ5KGUpfWApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TZXNzaW9uU3RhcnQoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFNlc3Npb24gc3RhcnRlZDogbW9kZWw9JHtlLmRhdGEuc2VsZWN0ZWRNb2RlbCA/PyAnZGVmYXVsdCd9LCBwcm9kdWNlcj0ke2UuZGF0YS5wcm9kdWNlcn1gKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uU2Vzc2lvblJlc3VtZShlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gU2Vzc2lvbiByZXN1bWVkOiBldmVudENvdW50PSR7ZS5kYXRhLmV2ZW50Q291bnR9YCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblNlc3Npb25JbmZvKGUgPT4ge1xuXHRcdFx0Y29uc3QgYXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgT3RlbEF0dHJpYnV0ZVZhbHVlPiA9IHsgaW5mb1R5cGU6IGUuZGF0YS5pbmZvVHlwZSB9O1xuXHRcdFx0aWYgKGUuZGF0YS50aXApIHtcblx0XHRcdFx0YXR0cmlidXRlcy50aXAgPSBlLmRhdGEudGlwO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFske2UuZGF0YS5pbmZvVHlwZX1dOiAke2UuZGF0YS5tZXNzYWdlfWA7XG5cdFx0XHRjb25zdCBvdGVsRGF0YSA9IG5ldyBPdGVsRGF0YShhdHRyaWJ1dGVzKTtcblx0XHRcdGlmIChlLmRhdGEuaW5mb1R5cGUgPT09ICdtY3AnKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhtZXNzYWdlLCBvdGVsRGF0YSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKG1lc3NhZ2UsIG90ZWxEYXRhKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uU2Vzc2lvbldhcm5pbmcoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gJHtlLmRhdGEubWVzc2FnZX1gLCBuZXcgT3RlbERhdGEoeyB3YXJuaW5nVHlwZTogZS5kYXRhLndhcm5pbmdUeXBlIH0pKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uU2Vzc2lvbk1vZGVsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBNb2RlbCBjaGFuZ2VkOiAke2UuZGF0YS5wcmV2aW91c01vZGVsID8/ICcobm9uZSknfSAtPiAke2UuZGF0YS5uZXdNb2RlbH1gKTtcblx0XHRcdGlmICghZS5hZ2VudElkKSB7XG5cdFx0XHRcdHRoaXMuX3Byb21wdENhY2hlUmVmcmVzaEdlbmVyYXRpb24rKztcblx0XHRcdFx0aWYgKGUuZGF0YS5wcmV2aW91c01vZGVsICE9PSBlLmRhdGEubmV3TW9kZWwpIHtcblx0XHRcdFx0XHR0aGlzLl9zZXRQcm9tcHRDYWNoZVN0YXRlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dm9pZCB0aGlzLl9yZWZyZXNoU2Vzc2lvblVzYWdlTWV0cmljcygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25NYW5hZ2VkU2V0dGluZ3NSZXNvbHZlZChlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBNYW5hZ2VkIHNldHRpbmdzIHJlc29sdmVkOiBzb3VyY2U9JHtlLmRhdGEuc291cmNlfSwgbWFuYWdlZEtleXM9JHtlLmRhdGEubWFuYWdlZEtleXMuam9pbignLCcpIHx8ICcobm9uZSknfSwgYnlwYXNzUGVybWlzc2lvbnNEaXNhYmxlZD0ke2UuZGF0YS5ieXBhc3NQZXJtaXNzaW9uc0Rpc2FibGVkfSwgZmFpbENsb3NlZD0ke2UuZGF0YS5mYWlsQ2xvc2VkfWApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25NYW5hZ2VkU2V0dGluZ3NFbmZvcmNlZChlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBNYW5hZ2VkIHNldHRpbmdzIGVuZm9yY2VkOiBhY3Rpb249JHtlLmRhdGEuYWN0aW9ufSwgc2V0dGluZz0ke2UuZGF0YS5zZXR0aW5nfSwgZXNjYWxhdGlvbj0ke2UuZGF0YS5lc2NhbGF0aW9uID8/ICcobm9uZSknfSwgZmFpbENsb3NlZD0ke2UuZGF0YS5mYWlsQ2xvc2VkfSwgbWVzc2FnZT0ke2UuZGF0YS5tZXNzYWdlfWApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TZXNzaW9uSGFuZG9mZihlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gU2Vzc2lvbiBoYW5kb2ZmOiBzb3VyY2VUeXBlPSR7ZS5kYXRhLnNvdXJjZVR5cGV9LCByZW1vdGVTZXNzaW9uSWQ9JHtlLmRhdGEucmVtb3RlU2Vzc2lvbklkID8/ICcobm9uZSknfWApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TZXNzaW9uVHJ1bmNhdGlvbihlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gU2Vzc2lvbiB0cnVuY2F0aW9uOiByZW1vdmVkICR7ZS5kYXRhLnRva2Vuc1JlbW92ZWREdXJpbmdUcnVuY2F0aW9ufSB0b2tlbnMsICR7ZS5kYXRhLm1lc3NhZ2VzUmVtb3ZlZER1cmluZ1RydW5jYXRpb259IG1lc3NhZ2VzYCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblNlc3Npb25TbmFwc2hvdFJld2luZChlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gU25hcHNob3QgcmV3aW5kOiB1cFRvPSR7ZS5kYXRhLnVwVG9FdmVudElkfSwgZXZlbnRzUmVtb3ZlZD0ke2UuZGF0YS5ldmVudHNSZW1vdmVkfWApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TZXNzaW9uU2h1dGRvd24oZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFNlc3Npb24gc2h1dGRvd246IHR5cGU9JHtlLmRhdGEuc2h1dGRvd25UeXBlfSwgYXBpRHVyYXRpb249JHtlLmRhdGEudG90YWxBcGlEdXJhdGlvbk1zfW1zYCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblNlc3Npb25Vc2FnZUluZm8oZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFVzYWdlIGluZm86ICR7ZS5kYXRhLmN1cnJlbnRUb2tlbnN9LyR7ZS5kYXRhLnRva2VuTGltaXR9IHRva2VucywgJHtlLmRhdGEubWVzc2FnZXNMZW5ndGh9IG1lc3NhZ2VzYCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblNlc3Npb25Db21wYWN0aW9uU3RhcnQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBDb21wYWN0aW9uIHN0YXJ0ZWRgKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uU2Vzc2lvbkNvbXBhY3Rpb25Db21wbGV0ZShlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gQ29tcGFjdGlvbiBjb21wbGV0ZTogc3VjY2Vzcz0ke2UuZGF0YS5zdWNjZXNzfSwgdG9rZW5zUmVtb3ZlZD0ke2UuZGF0YS50b2tlbnNSZW1vdmVkID8/ICc/J31gKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uVXNlck1lc3NhZ2UoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFVzZXIgbWVzc2FnZTogJHtlLmRhdGEuY29udGVudC5sZW5ndGh9IGNoYXJzLCAke2UuZGF0YS5hdHRhY2htZW50cz8ubGVuZ3RoID8/IDB9IGF0dGFjaG1lbnRzYCk7XG5cdFx0XHQvLyBSZXN0cmljdGVkIGBjb252ZXJzYXRpb24ubWVzc2FnZVRleHRgIChzb3VyY2U9dXNlcik6IHRoZSByYXcgdXNlciBwcm9tcHQgdGV4dC4gRW1pdCBvbmx5XG5cdFx0XHQvLyBmb3IgZ2VudWluZSBodW1hbiBwcm9tcHRzIG9uIHRoZSBtYWluIGFnZW50IFx1MjAxNCBza2lwIHN1YmFnZW50IHR1cm5zIChkcml2ZW4gYnkgdGhlIHBhcmVudClcblx0XHRcdC8vIGFuZCBTREstaW5qZWN0ZWQgc3ludGhldGljIG1lc3NhZ2VzIChza2lsbC9oYXJuZXNzIGluamVjdGlvbnMgY2FycnkgYSBub24tYHVzZXJgIHNvdXJjZSxcblx0XHRcdC8vIG1hdGNoaW5nIGBpc1N5bnRoZXRpY1VzZXJNZXNzYWdlYCkgc28gaW5qZWN0ZWQgY29udGVudCBpcyBub3QgcmVwb3J0ZWQgYXMgdGhlIHVzZXIncyBwcm9tcHQuXG5cdFx0XHRpZiAoIWUuYWdlbnRJZCAmJiAoIWUuZGF0YS5zb3VyY2UgfHwgZS5kYXRhLnNvdXJjZS50b0xvd2VyQ2FzZSgpID09PSAndXNlcicpKSB7XG5cdFx0XHRcdHZvaWQgdGhpcy5fdGVsZW1ldHJ5UmVwb3J0ZXIudXNlck1lc3NhZ2VUZXh0KHRoaXMuc2Vzc2lvblVyaS50b1N0cmluZygpLCB0aGlzLl9jdXJyZW50VHVybj8uY2xpZW50VHlwZSA/PyBBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd24sIGUuZGF0YS5jb250ZW50LCB0aGlzLl90dXJuT3JkaW5hbCkuY2F0Y2goZXJyID0+IHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBUZWxlbWV0cnkgZW1pc3Npb24gZmFpbGVkOiAke2dldEVycm9yTWVzc2FnZShlcnIpfWApKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uUGVuZGluZ01lc3NhZ2VzTW9kaWZpZWQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBQZW5kaW5nIG1lc3NhZ2VzIG1vZGlmaWVkYCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblR1cm5TdGFydChlID0+IHtcblx0XHRcdHRoaXMuX2N1cnJlbnRUdXJuPy5tYXJrUnVubmluZygpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBUdXJuIHN0YXJ0ZWQ6ICR7ZS5kYXRhLnR1cm5JZH1gKTtcblx0XHRcdGlmICghZS5hZ2VudElkKSB7XG5cdFx0XHRcdGNvbnN0IHRlbGVtZXRyeU1lc3NhZ2VJZCA9IHRoaXMuX2N1cnJlbnRUdXJuPy5pZCA/PyBlLmRhdGEudHVybklkO1xuXHRcdFx0XHRpZiAodGhpcy5fYWN0aXZlUmVwb0luZm9UdXJuPy50ZWxlbWV0cnlNZXNzYWdlSWQgPT09IHRlbGVtZXRyeU1lc3NhZ2VJZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9jYW5jZWxBY3RpdmVSZXBvSW5mb1RlbGVtZXRyeSgpO1xuXHRcdFx0XHRjb25zdCB0dXJuOiBOb25OdWxsYWJsZTxDb3BpbG90QWdlbnRTZXNzaW9uWydfYWN0aXZlUmVwb0luZm9UdXJuJ10+ID0ge1xuXHRcdFx0XHRcdHRlbGVtZXRyeU1lc3NhZ2VJZCxcblx0XHRcdFx0XHRjYW5jZWxsZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGJlZ2luOiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKSxcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgaXNDdXJyZW50ID0gKCkgPT4gIXR1cm4uY2FuY2VsbGVkICYmIHRoaXMuX2lzTGF1bmNoVG9rZW5DdXJyZW50KCk7XG5cdFx0XHRcdHR1cm4uYmVnaW4gPSB0aGlzLl9iZWdpblJlcG9JbmZvVGVsZW1ldHJ5KHRlbGVtZXRyeU1lc3NhZ2VJZCwgdGhpcy5fY3VycmVudFR1cm4/LmNsaWVudFR5cGUgPz8gQWdlbnRIb3N0Q2xpZW50VHlwZS5Vbmtub3duLCBpc0N1cnJlbnQpO1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVSZXBvSW5mb1R1cm4gPSB0dXJuO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25JbnRlbnQoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIEludGVudDogJHtlLmRhdGEuaW50ZW50fWApO1xuXHRcdFx0Y29uc3QgYWN0aXZpdHkgPSBlLmRhdGEuaW50ZW50IHx8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChhY3Rpdml0eSA9PT0gdW5kZWZpbmVkICYmICF0aGlzLl9oYXNBY3Rpdml0eSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9oYXNBY3Rpdml0eSA9IGFjdGl2aXR5ICE9PSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZpdHlDaGFuZ2VkLFxuXHRcdFx0XHRhY3Rpdml0eSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25SZWFzb25pbmcoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFJlYXNvbmluZzogJHtlLmRhdGEuY29udGVudC5sZW5ndGh9IGNoYXJzYCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblR1cm5FbmQoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFR1cm4gZW5kZWQ6ICR7ZS5kYXRhLnR1cm5JZH1gKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uQWJvcnQoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIEFib3J0ZWQ6ICR7ZS5kYXRhLnJlYXNvbn1gKTtcblx0XHRcdHRoaXMuX2NhbmNlbEFjdGl2ZVJlcG9JbmZvVGVsZW1ldHJ5KCk7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudFR1cm4/LmlzUnVubmluZykge1xuXHRcdFx0XHR0aGlzLl9yZXBvcnRUb29sQ2FsbERldGFpbHModGhpcy5fY3VycmVudFR1cm4sICdjYW5jZWxsZWQnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uVG9vbFVzZXJSZXF1ZXN0ZWQoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFRvb2wgdXNlci1yZXF1ZXN0ZWQ6ICR7ZS5kYXRhLnRvb2xOYW1lfSAoJHtlLmRhdGEudG9vbENhbGxJZH0pYCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblRvb2xQYXJ0aWFsUmVzdWx0KGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBUb29sIHBhcnRpYWwgcmVzdWx0OiAke2UuZGF0YS50b29sQ2FsbElkfSAoJHtlLmRhdGEucGFydGlhbE91dHB1dC5sZW5ndGh9IGNoYXJzKWApO1xuXHRcdFx0Y29uc3QgdHJhY2tlZCA9IHRoaXMuX2FjdGl2ZVRvb2xDYWxscy5nZXQoZS5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0aWYgKCF0cmFja2VkIHx8ICFpc1NoZWxsVG9vbCh0cmFja2VkLnRvb2xOYW1lKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fc2hlbGxNYW5hZ2VyPy5nZXRUZXJtaW5hbFVyaUZvclRvb2xDYWxsKGUuZGF0YS50b29sQ2FsbElkKSkge1xuXHRcdFx0XHQvLyBDbGllbnQtaG9zdGVkIHB0eSBzaGVsbCBcdTIwMTQgaXRzIHRlcm1pbmFsIGNoYW5uZWwgc3RyZWFtcyBsaXZlIG91dHB1dCBpdHNlbGYuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFwcGVuZGVkID0gdGhpcy5fbm9uUHR5U2hlbGxUZXJtaW5hbHMuYXBwZW5kKGUuZGF0YS50b29sQ2FsbElkLCBlLmRhdGEucGFydGlhbE91dHB1dCk7XG5cdFx0XHRpZiAoYXBwZW5kZWQ/LmNyZWF0ZWQpIHtcblx0XHRcdFx0Y29uc3QgeyB1cmkgfSA9IGFwcGVuZGVkO1xuXHRcdFx0XHR0cmFja2VkLmNvbnRlbnQucHVzaCh7XG5cdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLFxuXHRcdFx0XHRcdHJlc291cmNlOiB1cmksXG5cdFx0XHRcdFx0dGl0bGU6IHRyYWNrZWQuZGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0aXNQdHk6IGZhbHNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb250ZW50Q2hhbmdlZCxcblx0XHRcdFx0XHR0dXJuSWQ6IHRoaXMuX3R1cm5JZCxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiBlLmRhdGEudG9vbENhbGxJZCxcblx0XHRcdFx0XHRjb250ZW50OiB0cmFja2VkLmNvbnRlbnQsXG5cdFx0XHRcdH0sIHRyYWNrZWQucGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblRvb2xQcm9ncmVzcyhlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gVG9vbCBwcm9ncmVzczogJHtlLmRhdGEudG9vbENhbGxJZH0gLSAke2UuZGF0YS5wcm9ncmVzc01lc3NhZ2V9YCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblNraWxsSW52b2tlZChlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gU2tpbGwgaW52b2tlZDogJHtlLmRhdGEubmFtZX0gKCR7ZS5kYXRhLnBhdGh9KWApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TdWJhZ2VudFN0YXJ0ZWQoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFN1YmFnZW50IHN0YXJ0ZWQ6ICR7ZS5kYXRhLmFnZW50TmFtZX0gKCR7ZS5kYXRhLmFnZW50RGlzcGxheU5hbWV9KWApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TdWJhZ2VudENvbXBsZXRlZChlID0+IHtcblx0XHRcdHRoaXMuX2NvbXBsZXRlU3ViYWdlbnRUdXJuKGUuYWdlbnRJZCwgZS5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBTdWJhZ2VudCBjb21wbGV0ZWQ6ICR7ZS5kYXRhLmFnZW50TmFtZX1gKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uU3ViYWdlbnRGYWlsZWQoZSA9PiB7XG5cdFx0XHR0aGlzLl9jb21wbGV0ZVN1YmFnZW50VHVybihlLmFnZW50SWQsIGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gU3ViYWdlbnQgZmFpbGVkOiAke2UuZGF0YS5hZ2VudE5hbWV9IC0gJHtlLmRhdGEuZXJyb3J9YCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblN1YmFnZW50U2VsZWN0ZWQoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFN1YmFnZW50IHNlbGVjdGVkOiAke2UuZGF0YS5hZ2VudE5hbWV9YCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vbkhvb2tTdGFydChlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gSG9vayBzdGFydGVkOiAke2UuZGF0YS5ob29rVHlwZX0gKCR7ZS5kYXRhLmhvb2tJbnZvY2F0aW9uSWR9KWApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Ib29rRW5kKGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBIb29rIGVuZGVkOiAke2UuZGF0YS5ob29rVHlwZX0gKCR7ZS5kYXRhLmhvb2tJbnZvY2F0aW9uSWR9KSwgc3VjY2Vzcz0ke2UuZGF0YS5zdWNjZXNzfWApO1xuXHRcdFx0aWYgKGUuZGF0YS5ob29rVHlwZSA9PT0gJ2FnZW50U3RvcCcpIHtcblx0XHRcdFx0dGhpcy5fY29tcGxldGVTdWJhZ2VudFR1cm4oZS5hZ2VudElkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uU3lzdGVtTWVzc2FnZShlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gU3lzdGVtIG1lc3NhZ2UgWyR7ZS5kYXRhLnJvbGV9XTogJHtlLmRhdGEuY29udGVudC5sZW5ndGh9IGNoYXJzYCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gLS0tLSBTREsgZXZlbnQgSUQgdHJhY2tpbmcgJiB0cnVuY2F0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBTREsgZXZlbnQgSUQgZm9yIHRoZSB0dXJuIGluc2VydGVkIGFmdGVyIHRoZSBnaXZlbiB0dXJuLFxuXHQgKiBvciBgdW5kZWZpbmVkYCBpZiBpdCdzIHRoZSBsYXN0IHR1cm4uXG5cdCAqL1xuXHRnZXROZXh0VHVybkV2ZW50SWQodHVybklkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9kYXRhYmFzZVJlZi5vYmplY3QuZ2V0TmV4dFR1cm5FdmVudElkKHR1cm5JZCk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgU0RLIGV2ZW50IElEIG9mIHRoZSBlYXJsaWVzdCB0dXJuLlxuXHQgKi9cblx0Z2V0Rmlyc3RUdXJuRXZlbnRJZCgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9kYXRhYmFzZVJlZi5vYmplY3QuZ2V0Rmlyc3RUdXJuRXZlbnRJZCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRydW5jYXRlcyB0aGUgc2Vzc2lvbiBoaXN0b3J5IHZpYSB0aGUgU0RLJ3MgUlBDIGFuZCBjbGVhbnMgdXBcblx0ICogc3RhbGUgdHVybnMgZnJvbSB0aGUgc2Vzc2lvbiBkYXRhYmFzZS5cblx0ICpcblx0ICogQHBhcmFtIGV2ZW50SWQgVGhlIFNESyBldmVudCBJRCBhdCB3aGljaCB0byB0cnVuY2F0ZS4gVGhpcyBldmVudFxuXHQgKiAgICAgICAgYW5kIGFsbCBldmVudHMgYWZ0ZXIgaXQgYXJlIHJlbW92ZWQuXG5cdCAqIEBwYXJhbSBrZWVwVHVybklkIElmIHByb3ZpZGVkLCB0dXJucyBpbnNlcnRlZCBhZnRlciB0aGlzIHR1cm4gYXJlXG5cdCAqICAgICAgICBkZWxldGVkIGZyb20gdGhlIERCLiBJZiBvbWl0dGVkLCBhbGwgdHVybnMgYXJlIGRlbGV0ZWQuXG5cdCAqL1xuXHRhc3luYyB0cnVuY2F0ZUF0RXZlbnRJZChldmVudElkOiBzdHJpbmcsIGtlZXBUdXJuSWQ/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBUcnVuY2F0aW5nIHZpYSBTREsgUlBDIGF0IGV2ZW50SWQ9JHtldmVudElkfWApO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3dyYXBwZXIuc2Vzc2lvbi5ycGMuaGlzdG9yeS50cnVuY2F0ZSh7IGV2ZW50SWQgfSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gU0RLIHRydW5jYXRpb24gcmVtb3ZlZCAke3Jlc3VsdC5ldmVudHNSZW1vdmVkfSBldmVudHNgKTtcblxuXHRcdC8vIENsZWFuIHVwIHN0YWxlIHR1cm5zIGZyb20gb3VyIERCIHNvIGdldE5leHRUdXJuRXZlbnRJZCBkb2Vzbid0XG5cdFx0Ly8gcmV0dXJuIGV2ZW50IElEcyBmb3IgdHVybnMgdGhhdCBubyBsb25nZXIgZXhpc3QgaW4gdGhlIFNESy5cblx0XHRpZiAoa2VlcFR1cm5JZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZGF0YWJhc2VSZWYub2JqZWN0LmRlbGV0ZVR1cm5zQWZ0ZXIoa2VlcFR1cm5JZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuX2RhdGFiYXNlUmVmLm9iamVjdC5kZWxldGVBbGxUdXJucygpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBCdWxrLXJlbWFwcyB0dXJuIElEcyBpbiB0aGlzIHNlc3Npb24ncyBkYXRhYmFzZS5cblx0ICogVXNlZCBhZnRlciBmaWxlLWNvcHlpbmcgYSBzb3VyY2Ugc2Vzc2lvbidzIGRhdGFiYXNlIGZvciBhIGZvcmsuXG5cdCAqL1xuXHRhc3luYyByZW1hcFR1cm5JZHMobWFwcGluZzogUmVhZG9ubHlNYXA8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fZGF0YWJhc2VSZWYub2JqZWN0LnJlbWFwVHVybklkcyhtYXBwaW5nKTtcblx0fVxuXG5cdC8vIC0tLS0gY2xlYW51cCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogQ2FuY2VscyBldmVyeSBwZW5kaW5nIGludGVyYWN0aW9uIGZvciBhYm9ydCBhbmQgZGlzcG9zZS4gVGhpcyBjb21wbGV0ZXMgc3luY2hyb25vdXNseSBiZWZvcmUgYW55IGF3YWl0ZXIgcmVzdW1lcywgc28gb3JkZXJpbmcgaXMgbm90IHNpZ25pZmljYW50LlxuXHQgKi9cblx0cHJpdmF0ZSBfY2FuY2VsQWxsUGVuZGluZ0ludGVyYWN0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLl9jYW5jZWxQZW5kaW5nQXV0b0FwcHJvdmFscygpO1xuXHRcdHRoaXMuX2RlbnlQZW5kaW5nUGVybWlzc2lvbnMoKTtcblx0XHR0aGlzLl9jYW5jZWxQZW5kaW5nVXNlcklucHV0cygpO1xuXHRcdHRoaXMuX2NhbmNlbFBlbmRpbmdFbGljaXRhdGlvbnMoKTtcblx0XHR0aGlzLl9jYW5jZWxQZW5kaW5nUGxhblJldmlld3MoKTtcblx0XHR0aGlzLl9jYW5jZWxQZW5kaW5nTWNwQXV0aFJlcXVlc3RzKCk7XG5cdFx0dGhpcy5fY2FuY2VsUGVuZGluZ01jcFNhbXBsaW5ncygpO1xuXHRcdHRoaXMuX2NhbmNlbFBlbmRpbmdDbGllbnRUb29sQ2FsbHMoKTtcblx0fVxuXG5cdHByaXZhdGUgX2NhbmNlbFBlbmRpbmdBdXRvQXBwcm92YWxzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdBdXRvQXBwcm92YWxzLmRlbnlBbGwodW5kZWZpbmVkKTtcblx0XHR0aGlzLl9hdXRvQXBwcm92YWxzLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9kZW55UGVuZGluZ1Blcm1pc3Npb25zKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW3Rvb2xDYWxsSWRdIG9mIHRoaXMuX3BlbmRpbmdQZXJtaXNzaW9ucy5lbnRyaWVzKCkpIHtcblx0XHRcdHRoaXMuX2RlbGV0ZVBlbmRpbmdFZGl0Q29udGVudCh0b29sQ2FsbElkKTtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLmRlbnlBbGwoeyBraW5kOiAncmVqZWN0JyB9KTtcblx0XHR0aGlzLl9hcHByb3ZlZER1cGxpY2FibGVQZXJtaXNzaW9uU2lnbmF0dXJlcy5jbGVhcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbW92ZXMgYW55IGBwZW5kaW5nLWVkaXQtY29udGVudDpgIGVudHJpZXMgYXNzb2NpYXRlZCB3aXRoIGEgcmVzb2x2ZWRcblx0ICogKGFwcHJvdmVkLCBkZW5pZWQsIG9yIGNhbmNlbGxlZCkgcGVybWlzc2lvbiByZXF1ZXN0LlxuXHQgKi9cblx0cHJpdmF0ZSBfZGVsZXRlUGVuZGluZ0VkaXRDb250ZW50KHRvb2xDYWxsSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHVyaSA9IHRoaXMuX3BlbmRpbmdFZGl0Q29udGVudFVyaXMuZ2V0KHRvb2xDYWxsSWQpO1xuXHRcdGlmICghdXJpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdFZGl0Q29udGVudFVyaXMuZGVsZXRlKHRvb2xDYWxsSWQpO1xuXHRcdHRoaXMuX2ZpbGVTZXJ2aWNlLmRlbCh1cmkpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBGYWlsZWQgdG8gZGVsZXRlIHBlbmRpbmcgZWRpdCBjb250ZW50OiAke3VyaS50b1N0cmluZygpfWAsIGVycik7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxQZW5kaW5nVXNlcklucHV0cygpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nVXNlcklucHV0cy5kZW55QWxsKHsgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZC5DYW5jZWwgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxQZW5kaW5nRWxpY2l0YXRpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdFbGljaXRhdGlvbnMuZGVueUFsbCh7IHJlc3BvbnNlOiBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQ2FuY2VsIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsUGVuZGluZ1BsYW5SZXZpZXdzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdQbGFuUmV2aWV3cy5kZW55QWxsKHsgYXBwcm92ZWQ6IGZhbHNlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsUGVuZGluZ01jcFNhbXBsaW5ncygpOiB2b2lkIHtcblx0XHRjb25zdCBwZW5kaW5nID0gQXJyYXkuZnJvbSh0aGlzLl9wZW5kaW5nTWNwU2FtcGxpbmdzKTtcblx0XHR0aGlzLl9wZW5kaW5nTWNwU2FtcGxpbmdzLmNsZWFyKCk7XG5cdFx0Zm9yIChjb25zdCByZXF1ZXN0SWQgb2YgcGVuZGluZykge1xuXHRcdFx0dGhpcy5fd3JhcHBlci5zZXNzaW9uLnJwYy5tY3AuY2FuY2VsU2FtcGxpbmdFeGVjdXRpb24oeyByZXF1ZXN0SWQgfSkuY2F0Y2goKCkgPT4ge1xuXHRcdFx0XHQvLyBCZXN0LWVmZm9ydDogU0RLIG1heSBoYXZlIGFscmVhZHkgdG9ybiBkb3duLlxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsUGVuZGluZ0NsaWVudFRvb2xDYWxscygpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nQ2xpZW50VG9vbENhbGxzLmRlbnlBbGwoeyB0ZXh0UmVzdWx0Rm9yTGxtOiAnVG9vbCBjYWxsIGNhbmNlbGxlZDogc2Vzc2lvbiBlbmRlZCcsIHJlc3VsdFR5cGU6ICdmYWlsdXJlJywgZXJyb3I6ICdTZXNzaW9uIGVuZGVkJyB9KTtcblx0fVxufVxuXG4vKipcbiAqIENvdW50cyBhZGRlZC9yZW1vdmVkIGxpbmVzIGluIGEgdW5pZmllZCBkaWZmIHN0cmluZy4gSWdub3JlcyB0aGUgYCsrK2AgYW5kXG4gKiBgLS0tYCBoZWFkZXIgcm93cyBhbmQgYW55IG5vbi1odW5rIGNvbnRleHQuXG4gKi9cbmZ1bmN0aW9uIGNvdW50VW5pZmllZERpZmZMaW5lcyhkaWZmOiBzdHJpbmcpOiB7IGFkZGVkOiBudW1iZXI7IHJlbW92ZWQ6IG51bWJlciB9IHwgdW5kZWZpbmVkIHtcblx0bGV0IGFkZGVkID0gMDtcblx0bGV0IHJlbW92ZWQgPSAwO1xuXHRmb3IgKGNvbnN0IGxpbmUgb2YgZGlmZi5zcGxpdCgnXFxuJykpIHtcblx0XHRpZiAobGluZS5zdGFydHNXaXRoKCcrKysnKSB8fCBsaW5lLnN0YXJ0c1dpdGgoJy0tLScpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKGxpbmUuc3RhcnRzV2l0aCgnKycpKSB7XG5cdFx0XHRhZGRlZCsrO1xuXHRcdH0gZWxzZSBpZiAobGluZS5zdGFydHNXaXRoKCctJykpIHtcblx0XHRcdHJlbW92ZWQrKztcblx0XHR9XG5cdH1cblx0aWYgKGFkZGVkID09PSAwICYmIHJlbW92ZWQgPT09IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7IGFkZGVkLCByZW1vdmVkIH07XG59XG5cbi8qKlxuICogUmVhZHMgdGhlIFNESydzIGludGVybmFsIGBjb3BpbG90VXNhZ2VgIGJpbGxpbmcgcGF5bG9hZCwgY2FycmllZCBvbiBib3RoIHRoZSBgYXNzaXN0YW50LnVzYWdlYFxuICogZXZlbnQgYW5kIGBzZXNzaW9uLmNvbXBhY3Rpb25fY29tcGxldGVgJ3MgYGNvbXBhY3Rpb25Ub2tlbnNVc2VkYC4gSXQgaXMgbWFya2VkIGBhc0ludGVybmFsYCBpblxuICogdGhlIFNESyBzY2hlbWEsIHNvIGl0IGlzIGFic2VudCBmcm9tIHRoZSBnZW5lcmF0ZWQgdHlwZXMgKGBBc3Npc3RhbnRVc2FnZURhdGFgLFxuICogYENvbXBhY3Rpb25Db21wbGV0ZUNvbXBhY3Rpb25Ub2tlbnNVc2VkYCkgZXZlbiB0aG91Z2ggaXQgaXMgcHJlc2VudCBhdCBydW50aW1lIFx1MjAxNCBoZW5jZSB0aGVcbiAqIGR5bmFtaWMgcmVhZC4gVGhpcyBpcyB0aGUgc291cmNlIGZvciBwZXItdHVybiBhbmQgcGVyLXN1YmFnZW50IGNvc3QsIGFjY3VtdWxhdGVkIHN5bmNocm9ub3VzbHlcbiAqIGFzIGVhY2ggZXZlbnQgYXJyaXZlczsgb25seSB0aGUgc2Vzc2lvbi13aWRlIHRvdGFsIGNvbWVzIGZyb20gdGhlIFNESydzIHVzYWdlIG1ldHJpY3MuXG4gKiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gdGhlIHBheWxvYWQgY2FycmllcyBubyB1c2FibGUgbmFuby1BSVUgdG90YWwuXG4gKi9cbmZ1bmN0aW9uIHJlYWRDb3BpbG90VXNhZ2UocmF3OiB1bmtub3duKTogeyB0b3RhbE5hbm9BaXU6IG51bWJlciB9ICYgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQge1xuXHRpZiAoIXJhdyB8fCB0eXBlb2YgcmF3ICE9PSAnb2JqZWN0Jykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgdXNhZ2UgPSAocmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS5jb3BpbG90VXNhZ2U7XG5cdGlmICghdXNhZ2UgfHwgdHlwZW9mIHVzYWdlICE9PSAnb2JqZWN0Jykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgdG90YWxOYW5vQWl1ID0gKHVzYWdlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS50b3RhbE5hbm9BaXU7XG5cdGlmICh0eXBlb2YgdG90YWxOYW5vQWl1ICE9PSAnbnVtYmVyJyB8fCAhTnVtYmVyLmlzRmluaXRlKHRvdGFsTmFub0FpdSkgfHwgdG90YWxOYW5vQWl1IDwgMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHsgLi4uKHVzYWdlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KSwgdG90YWxOYW5vQWl1IH07XG59XG5cbi8qKlxuICogTm9ybWFsaXplcyB0aGUgU0RLJ3MgaW50ZXJuYWwgYHF1b3RhU25hcHNob3RzYCBmaWVsZCBcdTIwMTQgcHJlc2VudCBvbiB0aGUgYGFzc2lzdGFudC51c2FnZWAgZXZlbnQgYXRcbiAqIHJ1bnRpbWUgYnV0IGFic2VudCBmcm9tIHRoZSBnZW5lcmF0ZWQgYEFzc2lzdGFudFVzYWdlRGF0YWAgdHlwZSBcdTIwMTQgaW50byB0aGUgc2VyaWFsaXphYmxlIHNoYXBlXG4gKiBjYXJyaWVkIG9uIHtAbGluayBVc2FnZUluZm9NZXRhLnF1b3RhU25hcHNob3RzfS4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIG5vIHVzYWJsZSBzbmFwc2hvdCBpcyBwcmVzZW50LlxuICovXG5mdW5jdGlvbiBub3JtYWxpemVRdW90YVNuYXBzaG90cyhyYXc6IHVua25vd24pOiBVc2FnZUluZm9NZXRhWydxdW90YVNuYXBzaG90cyddIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFyYXcgfHwgdHlwZW9mIHJhdyAhPT0gJ29iamVjdCcpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJlc3VsdDogTm9uTnVsbGFibGU8VXNhZ2VJbmZvTWV0YVsncXVvdGFTbmFwc2hvdHMnXT4gPSB7fTtcblx0bGV0IGhhc0FueSA9IGZhbHNlO1xuXHRmb3IgKGNvbnN0IFtxdW90YVR5cGUsIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhyYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pKSB7XG5cdFx0aWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgdiA9IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGNvbnN0IHJlc2V0RGF0ZVJhdyA9IHYucmVzZXREYXRlO1xuXHRcdGNvbnN0IHJlc2V0RGF0ZSA9IHR5cGVvZiByZXNldERhdGVSYXcgPT09ICdzdHJpbmcnXG5cdFx0XHQ/IHJlc2V0RGF0ZVJhd1xuXHRcdFx0OiByZXNldERhdGVSYXcgaW5zdGFuY2VvZiBEYXRlXG5cdFx0XHRcdD8gcmVzZXREYXRlUmF3LnRvSVNPU3RyaW5nKClcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0cmVzdWx0W3F1b3RhVHlwZV0gPSB7XG5cdFx0XHRpc1VubGltaXRlZEVudGl0bGVtZW50OiB0eXBlb2Ygdi5pc1VubGltaXRlZEVudGl0bGVtZW50ID09PSAnYm9vbGVhbicgPyB2LmlzVW5saW1pdGVkRW50aXRsZW1lbnQgOiB1bmRlZmluZWQsXG5cdFx0XHRlbnRpdGxlbWVudFJlcXVlc3RzOiB0eXBlb2Ygdi5lbnRpdGxlbWVudFJlcXVlc3RzID09PSAnbnVtYmVyJyA/IHYuZW50aXRsZW1lbnRSZXF1ZXN0cyA6IHVuZGVmaW5lZCxcblx0XHRcdHVzZWRSZXF1ZXN0czogdHlwZW9mIHYudXNlZFJlcXVlc3RzID09PSAnbnVtYmVyJyA/IHYudXNlZFJlcXVlc3RzIDogdW5kZWZpbmVkLFxuXHRcdFx0cmVtYWluaW5nUGVyY2VudGFnZTogdHlwZW9mIHYucmVtYWluaW5nUGVyY2VudGFnZSA9PT0gJ251bWJlcicgPyB2LnJlbWFpbmluZ1BlcmNlbnRhZ2UgOiB1bmRlZmluZWQsXG5cdFx0XHRvdmVyYWdlOiB0eXBlb2Ygdi5vdmVyYWdlID09PSAnbnVtYmVyJyA/IHYub3ZlcmFnZSA6IHVuZGVmaW5lZCxcblx0XHRcdG92ZXJhZ2VBbGxvd2VkV2l0aEV4aGF1c3RlZFF1b3RhOiB0eXBlb2Ygdi5vdmVyYWdlQWxsb3dlZFdpdGhFeGhhdXN0ZWRRdW90YSA9PT0gJ2Jvb2xlYW4nID8gdi5vdmVyYWdlQWxsb3dlZFdpdGhFeGhhdXN0ZWRRdW90YSA6IHVuZGVmaW5lZCxcblx0XHRcdHJlc2V0RGF0ZSxcblx0XHR9O1xuXHRcdGhhc0FueSA9IHRydWU7XG5cdH1cblx0cmV0dXJuIGhhc0FueSA/IHJlc3VsdCA6IHVuZGVmaW5lZDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxrQkFBa0Isa0JBQWtCLFdBQVcsaUJBQWlCO0FBQ3pFLFNBQVMsY0FBYyxnQkFBZ0I7QUFDdkMsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLG1CQUFtQix1QkFBdUI7QUFDbkQsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxZQUFZLGVBQTJCLG1CQUFtQixvQkFBb0I7QUFDdkYsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0RBQWdEO0FBQ3pELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsWUFBWSxZQUFZO0FBQ2pDLFNBQVMsNEJBQTRCLHFCQUFxQjtBQUMxRCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLFFBQVEsV0FBVyxVQUFVLGdCQUE4QjtBQUNwRSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxhQUFhLGdCQUFnQjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFCQUFxQix1QkFBdUIsOEJBQThCO0FBRW5GLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCLDJCQUEyQjtBQUMvRCxTQUFTLDRDQUE0QywwQkFB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QVEsR0FBOEIsR0FBRztBQUNoRixRQUFJLENBQUMsU0FBUyxPQUFPLFVBQVUsVUFBVTtBQUN4QztBQUFBLElBQ0Q7QUFDQSxVQUFNLElBQUk7QUFDVixVQUFNLGVBQWUsRUFBRTtBQUN2QixVQUFNLFlBQVksT0FBTyxpQkFBaUIsV0FDdkMsZUFDQSx3QkFBd0IsT0FDdkIsYUFBYSxZQUFZLElBQ3pCO0FBQ0osV0FBTyxTQUFTLElBQUk7QUFBQSxNQUNuQix3QkFBd0IsT0FBTyxFQUFFLDJCQUEyQixZQUFZLEVBQUUseUJBQXlCO0FBQUEsTUFDbkcscUJBQXFCLE9BQU8sRUFBRSx3QkFBd0IsV0FBVyxFQUFFLHNCQUFzQjtBQUFBLE1BQ3pGLGNBQWMsT0FBTyxFQUFFLGlCQUFpQixXQUFXLEVBQUUsZUFBZTtBQUFBLE1BQ3BFLHFCQUFxQixPQUFPLEVBQUUsd0JBQXdCLFdBQVcsRUFBRSxzQkFBc0I7QUFBQSxNQUN6RixTQUFTLE9BQU8sRUFBRSxZQUFZLFdBQVcsRUFBRSxVQUFVO0FBQUEsTUFDckQsa0NBQWtDLE9BQU8sRUFBRSxxQ0FBcUMsWUFBWSxFQUFFLG1DQUFtQztBQUFBLE1BQ2pJO0FBQUEsSUFDRDtBQUNBLGFBQVM7QUFBQSxFQUNWO0FBQ0EsU0FBTyxTQUFTLFNBQVM7QUFDMUI7IiwKICAibmFtZXMiOiBbInRyYWNrZWRUb29sQ2FsbCIsICJwYXJlbnRUb29sQ2FsbElkIl0KfQo=
