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
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import { CancellationError } from "../../../../base/common/errors.js";
import { raceTimeout } from "../../../../base/common/async.js";
import { fetchResourceMetadata } from "../../../../base/common/oauth.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { basename, dirname, isAbsolute, join, normalize, resolve, sep } from "../../../../base/common/path.js";
import { extUriBiasedIgnorePathCase, isEqual } from "../../../../base/common/resources.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { localize } from "../../../../nls.js";
import { ILogService } from "../../../log/common/log.js";
import { IProductService } from "../../../product/common/productService.js";
import { createSchema, platformRootSchema, platformSessionSchema, schemaProperty, AgentHostCodexMultiRootEnabledConfigKey, AgentHostMcpServersConfigKey } from "../../common/agentHostSchema.js";
import { createPricingMetaFromBilling, normalizeCAPIBilling } from "../../common/agentModelPricing.js";
import { AgentHostConfigKey, agentHostCustomizationConfigSchema } from "../../common/agentHostCustomizationConfig.js";
import { getReasoningEffortDescription, getReasoningEffortLabel } from "../../common/reasoningEffort.js";
import { AgentHostCodexAgentBinaryArgsEnvVar, AgentHostCodexAgentCodexHomeEnvVar, AgentHostCodexAgentSdkRootEnvVar, AgentSession, CODEX_AGENT_PROVIDER_ID } from "../../common/agentService.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
import { AHP_AUTH_REQUIRED, ProtocolError } from "../../common/state/sessionProtocol.js";
import { ActionType, isChatAction } from "../../common/state/sessionActions.js";
import { AuthRequiredReason } from "../../common/state/protocol/common/notifications.js";
import { buildDefaultChatUri, parseChatUri, ToolResultContentType, ResponsePartKind } from "../../common/state/sessionState.js";
import { ActiveClientToolSet } from "../activeClientState.js";
import { McpCustomizationController } from "../shared/mcpCustomizationController.js";
import { buildCodexMcpReadResult, codexMcpListToInventory, codexMcpServersFromConfig, codexMcpToolsChanged, codexStartupErrorNeedsAuth, injectCodexMcpAuthTokens, inventoryToSdkServers, normalizeCodexMcpResourceUrl, translateCodexMcpStartupState } from "./codexMcpServers.js";
import { codexHooksToContainers, codexSkillsToContainers } from "./codexCustomizations.js";
import { CodexClientCustomizationStore, codexMcpServersFromPlugins, codexSkillRootsFromPlugins } from "./codexClientCustomizations.js";
import { buildElicitationRequest, cancelledElicitationResponse, declinedElicitationResponse, elicitationResponseFromAnswers } from "./codexElicitationMapper.js";
import { McpAuthRequiredReason, McpServerStatus } from "../../common/state/protocol/channels-session/state.js";
import { IAgentConfigurationService } from "../agentConfigurationService.js";
import { IFileService } from "../../../files/common/files.js";
import { INativeEnvironmentService } from "../../../environment/common/environment.js";
import { IAgentPluginManager } from "../../common/agentPluginManager.js";
import { parsePlugin } from "../../../agentPlugins/common/pluginParsers.js";
import { IAgentHostGitHubEndpointService } from "../agentHostGitHubEndpointService.js";
import { ICopilotApiService } from "../shared/copilotApiService.js";
import { extractForwardedErrorInfo } from "../shared/forwardedChatError.js";
import { IAgentSdkDownloader } from "../agentSdkDownloader.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { PendingRequestRegistry } from "../../common/pendingRequestRegistry.js";
import { CodexAppServerClient, JsonRpcError, transportFromChildProcess } from "./codexAppServerClient.js";
import { ICodexProxyService } from "./codexProxyService.js";
import { createCodexSessionMapState, extractUserInputText, mapAgentMessageDelta, mapCommandExecutionOutputDelta, mapFileChangeOutputDelta, mapFileChangePatchUpdated, mapItemCompleted, mapItemStarted, mapMcpToolCallProgress, mapReasoningSummaryPartAdded, mapReasoningSummaryTextDelta, mapReasoningTextDelta, mapTokenUsageUpdated, mapTurnCompleted, mapTurnStarted, resetCodexTurnMapState } from "./codexMapAppServerEvents.js";
import { unwrapShellInvocation } from "./codexShellCommand.js";
import { planForkedTurnIdMap, resolveForkBoundary } from "./codexForkPlan.js";
import { resolveCodexInput } from "./codexPromptResolver.js";
import { buildUserInputRequest, emptyUserInputResponse, userInputResponseFromAnswers } from "./codexUserInputMapper.js";
import { replayThreadToTurns } from "./codexReplayMapper.js";
import { CodexSessionMetadataStore } from "./codexSessionMetadataStore.js";
import { buildCodexLaunchConfig, buildCodexResumeParams, isCodexThreadProviderCompatible } from "./codexLaunchConfig.js";
import { codexAccountStateForUsageSource, codexAccountStateFromResponse, codexProtectedResourcesForUsageSource, resolveCodexUsageSourceAfterAccountRead } from "./codexAccountState.js";
import { CodexSessionConfigKey, CODEX_DEFAULT_PERMISSIONS_PRESET, CODEX_PERMISSIONS_PRESETS, collaborationModeKind, migrateCodexPermissionValues, narrowAdditionalDirectories, narrowBoolean, narrowPersonality, narrowReasoningEffort, narrowReasoningSummary, narrowWebSearchMode, resolveCodexPermissions } from "./codexSessionConfigKeys.js";
import { formatGuardianDenialNotification, summarizeGuardianReviewAction, toGuardianAssessmentEventJson } from "./codexGuardianReview.js";
const CLIENT_INFO = {
  name: "vscode_agent_host",
  title: "VS Code Agent Host",
  // The codex `clientInfo.version` is informational. Hardcoded to a
  // non-empty placeholder; bumping it isn't required when our code
  // changes.
  version: "0.1.0"
};
const CODEX_THINKING_LEVEL_KEY = "thinkingLevel";
const USER_AGENT_PREFIX = "vscode_codex";
const CODEX_REASONING_EFFORTS = ["minimal", "low", "medium", "high"];
const CODEX_MCP_APP_CAPABILITIES = {
  serverTools: { listChanged: true },
  serverResources: {}
};
const MCP_TOOL_APPROVAL_QUESTION_ID_PREFIX = "mcp_tool_call_approval_";
const MCP_TOOL_APPROVAL_ANSWER_ALLOW = "Allow";
const MCP_TOOL_APPROVAL_ANSWER_DECLINE = "__codex_mcp_decline__";
const CODEX_RESPONSES_ENDPOINT = "/responses";
function createCodexModeSchema() {
  const base = platformSessionSchema.definition[SessionConfigKey.Mode].protocol;
  const kept = (base.enum ?? []).flatMap((value, index) => value === "autopilot" ? [] : [index]);
  return schemaProperty({
    ...base,
    enum: kept.map((index) => base.enum[index]),
    enumLabels: base.enumLabels && kept.map((index) => base.enumLabels[index]),
    enumDescriptions: base.enumDescriptions && kept.map((index) => base.enumDescriptions[index])
  });
}
const codexSessionConfigSchema = createSchema({
  [CodexSessionConfigKey.PermissionsPreset]: schemaProperty({
    type: "string",
    title: localize("codex.sessionConfig.permissionsPreset", "Approvals"),
    description: localize("codex.sessionConfig.permissionsPresetDescription", "How much Codex can do on its own before asking for approval."),
    enum: [...CODEX_PERMISSIONS_PRESETS],
    enumLabels: [
      localize("codex.sessionConfig.permissionsPreset.default", "Default Permissions"),
      localize("codex.sessionConfig.permissionsPreset.autoReview", "Auto-Review"),
      localize("codex.sessionConfig.permissionsPreset.fullAccess", "Full Access")
    ],
    enumDescriptions: [
      localize("codex.sessionConfig.permissionsPreset.defaultDescription", "Codex can read and edit files in the workspace and run routine local commands. It asks before using the internet or going beyond the workspace."),
      localize("codex.sessionConfig.permissionsPreset.autoReviewDescription", "Same workspace access as Default, but approval requests are routed through the auto-reviewer instead of prompting you."),
      localize("codex.sessionConfig.permissionsPreset.fullAccessDescription", "Codex can edit files outside the workspace and use the internet without asking. Use only when you want full machine access.")
    ],
    default: CODEX_DEFAULT_PERMISSIONS_PRESET,
    sessionMutable: true
  }),
  [CodexSessionConfigKey.ApprovalPolicy]: schemaProperty({
    type: "string",
    title: localize("codex.sessionConfig.approvalPolicy", "Approvals"),
    description: localize("codex.sessionConfig.approvalPolicyDescription", "How Codex requests approval for tool calls."),
    enum: ["never", "on-request", "on-failure", "untrusted"],
    enumLabels: [
      localize("codex.sessionConfig.approvalPolicy.never", "No Escalations"),
      localize("codex.sessionConfig.approvalPolicy.onRequest", "Ask When Needed"),
      localize("codex.sessionConfig.approvalPolicy.onFailure", "Ask on Failure"),
      localize("codex.sessionConfig.approvalPolicy.untrusted", "Ask More Often")
    ],
    enumDescriptions: [
      localize("codex.sessionConfig.approvalPolicy.neverDescription", "Never ask for elevated permission; commands that cannot run in the sandbox are rejected."),
      localize("codex.sessionConfig.approvalPolicy.onRequestDescription", "Ask only when Codex determines a command needs elevated permission."),
      localize("codex.sessionConfig.approvalPolicy.onFailureDescription", "Try commands in the sandbox first, then ask to retry with elevated permission if the sandbox blocks them."),
      localize("codex.sessionConfig.approvalPolicy.untrustedDescription", "Ask before more command categories so you can review actions more closely.")
    ],
    default: "on-request",
    sessionMutable: true
  }),
  [CodexSessionConfigKey.SandboxMode]: schemaProperty({
    type: "string",
    title: localize("codex.sessionConfig.sandboxMode", "Sandbox"),
    description: localize("codex.sessionConfig.sandboxModeDescription", "Filesystem and network restrictions applied to tool calls."),
    enum: ["read-only", "workspace-write", "danger-full-access"],
    enumLabels: [
      localize("codex.sessionConfig.sandboxMode.readOnly", "Read-Only"),
      localize("codex.sessionConfig.sandboxMode.workspaceWrite", "Workspace Write"),
      localize("codex.sessionConfig.sandboxMode.dangerFullAccess", "Full Access (Dangerous)")
    ],
    enumDescriptions: [
      localize("codex.sessionConfig.sandboxMode.readOnlyDescription", "Tool calls can read the workspace but cannot modify files."),
      localize("codex.sessionConfig.sandboxMode.workspaceWriteDescription", "Tool calls can read and write within the workspace; network is controlled separately."),
      localize("codex.sessionConfig.sandboxMode.dangerFullAccessDescription", "Tool calls have unrestricted disk and network access.")
    ],
    default: "workspace-write",
    sessionMutable: true
  }),
  [CodexSessionConfigKey.WebSearchMode]: schemaProperty({
    type: "string",
    title: localize("codex.sessionConfig.webSearchMode", "Web Search"),
    description: localize("codex.sessionConfig.webSearchModeDescription", "Web-search tool availability for the model."),
    enum: ["disabled", "cached", "live"],
    enumLabels: [
      localize("codex.sessionConfig.webSearchMode.disabled", "Disabled"),
      localize("codex.sessionConfig.webSearchMode.cached", "Cached Only"),
      localize("codex.sessionConfig.webSearchMode.live", "Live")
    ],
    default: "disabled",
    sessionMutable: false
  }),
  [CodexSessionConfigKey.ModelReasoningEffort]: schemaProperty({
    type: "string",
    title: localize("codex.sessionConfig.modelReasoningEffort", "Reasoning Effort"),
    description: localize("codex.sessionConfig.modelReasoningEffortDescription", "Controls how much reasoning effort Codex uses."),
    enum: [...CODEX_REASONING_EFFORTS],
    enumLabels: CODEX_REASONING_EFFORTS.map(getReasoningEffortLabel),
    enumDescriptions: CODEX_REASONING_EFFORTS.map((effort) => getReasoningEffortDescription(effort) ?? ""),
    default: "medium",
    sessionMutable: true
  }),
  [SessionConfigKey.Mode]: createCodexModeSchema(),
  [CodexSessionConfigKey.Personality]: schemaProperty({
    type: "string",
    title: localize("codex.sessionConfig.personality", "Personality"),
    description: localize("codex.sessionConfig.personalityDescription", "Tone Codex uses when communicating."),
    enum: ["none", "friendly", "pragmatic"],
    enumLabels: [
      localize("codex.sessionConfig.personality.none", "Default"),
      localize("codex.sessionConfig.personality.friendly", "Friendly"),
      localize("codex.sessionConfig.personality.pragmatic", "Pragmatic")
    ],
    enumDescriptions: [
      localize("codex.sessionConfig.personality.noneDescription", "Use Codex's built-in default tone."),
      localize("codex.sessionConfig.personality.friendlyDescription", "Warmer, more conversational tone."),
      localize("codex.sessionConfig.personality.pragmaticDescription", "Terse, no-nonsense tone focused on actions.")
    ],
    default: "none",
    sessionMutable: true
  }),
  [CodexSessionConfigKey.ReasoningSummary]: schemaProperty({
    type: "string",
    title: localize("codex.sessionConfig.reasoningSummary", "Reasoning Summary"),
    description: localize("codex.sessionConfig.reasoningSummaryDescription", "How Codex summarizes its reasoning in the response stream."),
    enum: ["auto", "concise", "detailed", "none"],
    enumLabels: [
      localize("codex.sessionConfig.reasoningSummary.auto", "Auto"),
      localize("codex.sessionConfig.reasoningSummary.concise", "Concise"),
      localize("codex.sessionConfig.reasoningSummary.detailed", "Detailed"),
      localize("codex.sessionConfig.reasoningSummary.none", "None")
    ],
    default: "auto",
    sessionMutable: true
  }),
  [CodexSessionConfigKey.AdditionalDirectories]: schemaProperty({
    type: "array",
    title: localize("codex.sessionConfig.additionalDirectories", "Additional Writable Directories"),
    description: localize("codex.sessionConfig.additionalDirectoriesDescription", "Absolute paths the sandbox is allowed to write to, in addition to the workspace. Only applies when Sandbox is Workspace Write."),
    items: { type: "string", title: localize("codex.sessionConfig.additionalDirectories.item", "Directory") },
    enumDynamic: true,
    default: [],
    sessionMutable: true
  }),
  [CodexSessionConfigKey.NetworkAccessEnabled]: schemaProperty({
    type: "boolean",
    title: localize("codex.sessionConfig.networkAccessEnabled", "Network"),
    description: localize("codex.sessionConfig.networkAccessEnabledDescription", "Allow sandboxed tool calls to make outbound network requests. Only applies when Sandbox is Workspace Write."),
    default: false,
    sessionMutable: true
  }),
  [SessionConfigKey.Permissions]: platformSessionSchema.definition[SessionConfigKey.Permissions]
});
const codexVisibleSessionConfigSchema = createSchema({
  [SessionConfigKey.Mode]: codexSessionConfigSchema.definition[SessionConfigKey.Mode],
  [CodexSessionConfigKey.PermissionsPreset]: codexSessionConfigSchema.definition[CodexSessionConfigKey.PermissionsPreset],
  [SessionConfigKey.Permissions]: platformSessionSchema.definition[SessionConfigKey.Permissions]
});
const codexSessionConfigDefaults = {
  [CodexSessionConfigKey.PermissionsPreset]: CODEX_DEFAULT_PERMISSIONS_PRESET,
  [CodexSessionConfigKey.ApprovalPolicy]: "on-request",
  [CodexSessionConfigKey.SandboxMode]: "workspace-write",
  [CodexSessionConfigKey.WebSearchMode]: "disabled",
  [CodexSessionConfigKey.ModelReasoningEffort]: "medium",
  [CodexSessionConfigKey.AdditionalDirectories]: [],
  [CodexSessionConfigKey.NetworkAccessEnabled]: false,
  [SessionConfigKey.Mode]: "interactive",
  [CodexSessionConfigKey.Personality]: "none",
  [CodexSessionConfigKey.ReasoningSummary]: "auto"
};
function distinctAbsolutePaths(paths) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const path of paths) {
    const normalized = normalize(path);
    const key = filesystemPathComparisonKey(normalized);
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }
  return result;
}
function distinctWorkingDirectories(directories) {
  if (!directories) {
    return void 0;
  }
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const directory of directories) {
    const path = normalize(directory.fsPath);
    const key = filesystemPathComparisonKey(path);
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(directory);
    }
  }
  return result.length > 0 ? result : void 0;
}
function filesystemPathComparisonKey(path) {
  if (!isAbsolute(path)) {
    return void 0;
  }
  const resource = extUriBiasedIgnorePathCase.removeTrailingPathSeparator(URI.file(path));
  return extUriBiasedIgnorePathCase.getComparisonKey(resource);
}
const CodexPrewarmTtlMs = 6e4;
const CodexSdkPackage = {
  id: "codex",
  displayName: "Codex",
  devOverrideEnvVar: AgentHostCodexAgentSdkRootEnvVar,
  hasSeparateMuslLinuxPackage: false
};
function dynamicToolResponseFromResult(result) {
  const contentItems = [];
  for (const c of result.content ?? []) {
    if (c.type === ToolResultContentType.Text) {
      contentItems.push({ type: "inputText", text: c.text });
    }
  }
  if (contentItems.length === 0) {
    const summary = typeof result.pastTenseMessage === "string" && result.pastTenseMessage.length > 0 ? result.pastTenseMessage : result.success ? "Tool completed with no output." : "Tool failed with no output.";
    contentItems.push({ type: "inputText", text: summary });
  }
  return { contentItems, success: result.success };
}
function toolsSignature(tools) {
  if (!tools || tools.length === 0) {
    return "";
  }
  return tools.map((t) => `${t.name}\0${t.description ?? ""}\0${JSON.stringify(t.inputSchema ?? null)}`).sort().join("");
}
function mcpServersSignature(servers) {
  const names = Object.keys(servers).sort();
  return names.map((name) => `${name}\0${JSON.stringify(servers[name])}`).join("");
}
class CodexActiveClientHandle {
  constructor(_getSession, clientId, displayName, _onToolsSet, _syncCustomizations) {
    this._getSession = _getSession;
    this.clientId = clientId;
    this.displayName = displayName;
    this._onToolsSet = _onToolsSet;
    this._syncCustomizations = _syncCustomizations;
    this._customizations = [];
  }
  get tools() {
    return this._getSession()?.clientToolSet.get(this.clientId) ?? [];
  }
  set tools(tools) {
    this._getSession()?.clientToolSet.set(this.clientId, tools);
    this._onToolsSet(tools);
  }
  get customizations() {
    return this._customizations;
  }
  set customizations(customizations) {
    this._customizations = customizations;
    this._syncCustomizations(customizations);
  }
}
function narrowFileChangeDecision(decision) {
  switch (decision) {
    case "accept":
    case "acceptForSession":
    case "decline":
    case "cancel":
      return decision;
    default:
      return "decline";
  }
}
let CodexAgent = class extends Disposable {
  constructor(_logService, _copilotApiService, _codexProxyService, _configurationService, _gitHubEndpointService, _agentSdkDownloader, _productService, _pluginManager, _fileService, _environmentService, _instantiationService) {
    super();
    this._logService = _logService;
    this._copilotApiService = _copilotApiService;
    this._codexProxyService = _codexProxyService;
    this._configurationService = _configurationService;
    this._gitHubEndpointService = _gitHubEndpointService;
    this._agentSdkDownloader = _agentSdkDownloader;
    this._productService = _productService;
    this._pluginManager = _pluginManager;
    this._fileService = _fileService;
    this._environmentService = _environmentService;
    this._instantiationService = _instantiationService;
    this.id = CODEX_AGENT_PROVIDER_ID;
    this._onDidSessionProgress = this._register(new Emitter());
    this.onDidSessionProgress = this._onDidSessionProgress.event;
    this._onDidMaterializeSession = this._register(new Emitter());
    this.onDidMaterializeSession = this._onDidMaterializeSession.event;
    this._onDidRequireAuth = this._register(new Emitter());
    this.onDidRequireAuth = this._onDidRequireAuth.event;
    this._onMcpNotification = this._register(new Emitter());
    this.onMcpNotification = this._onMcpNotification.event;
    this._models = observableValue(this, []);
    this.models = this._models;
    this._openAIAccountState = { usageSource: "openai", status: "signedOut" };
    this._providerConfigurationValues = {};
    this._providerConfigurationWrite = Promise.resolve();
    this._providerConfigurationReady = false;
    /** Keyed by caller-facing sessionId (the URI host). */
    this._sessions = /* @__PURE__ */ new Map();
    /** Inverse map: codex threadId → caller-facing sessionId, for routing codex notifications back to sessions. */
    this._sessionIdByThreadId = /* @__PURE__ */ new Map();
    /**
     * Live subagent (collab-agent) child threads, keyed by the child codex
     * thread id. Populated when a parent session's `spawnAgent` collab tool
     * call completes (carrying the child `receiverThreadIds`); the child's
     * subsequent `turn/*` and `item/*` notifications route here instead of
     * {@link _sessionIdByThreadId}. Removed on the child's `turn/completed`.
     */
    this._subagentsByThreadId = /* @__PURE__ */ new Map();
    /**
     * Connection-global MCP server inventory reported by the codex
     * app-server (`mcpServerStatus/list` + `mcpServer/startupStatus/updated`).
     * Codex owns MCP servers at the process level — shared across every
     * thread — so the inventory lives on the agent and is mirrored onto each
     * session's {@link ICodexSession.mcpController}. Keyed by server name.
     */
    this._mcpInventory = /* @__PURE__ */ new Map();
    /**
     * OAuth bearer tokens acquired for auth-gated http MCP servers, keyed by
     * the server's {@link normalizeCodexMcpResourceUrl | normalized URL}.
     * Populated by {@link handleAuthenticationToken} after the workbench
     * completes the sign-in, then injected into the per-thread `http_headers`
     * by {@link _buildSessionMcpServers}. Process-global: a token for a given
     * server URL applies to every session/thread that uses it (codex runs one
     * shared app-server).
     */
    this._mcpAuthTokens = /* @__PURE__ */ new Map();
    /**
     * Association from a normalized OAuth `resource` (what the workbench
     * authenticates) to the normalized MCP server URL(s) it unlocks. RFC 9728
     * discovery can return a `resource` that differs from the configured server
     * URL (e.g. root `https://host/` for a `https://host/mcp` endpoint), so the
     * token the workbench pushes back is keyed by the resource, not the server
     * URL. Recorded in {@link _surfaceMcpAuthRequired} at discovery time and
     * read by {@link handleAuthenticationToken} to route the token to the right
     * server(s).
     */
    this._mcpAuthServerUrlsByResource = /* @__PURE__ */ new Map();
    this._connection = { kind: "idle" };
    this._connectionGeneration = 0;
    this._usageSourceValidation = Promise.resolve();
    // ---- Chat surface ------------------------------------------------------
    //
    // Chat-addressed adoption of the {@link IAgent} surface introduced
    // in gate G-C1. Codex is a SINGLE-CHAT harness: a session owns exactly one
    // (default) chat addressed by its default chat channel URI, so the
    // chat methods simply route to the existing session-addressed
    // implementations. The legacy `(session, chat?)` methods below are kept as a
    // compat shim (removed centrally in gate G-C2) and both surfaces coexist.
    /**
     * The chat-addressed operation surface for the chats within a session.
     * Codex is single-chat: peer-chat operations
     * ({@link IAgentChats.createChat}/{@link IAgentChats.fork})
     * are unsupported and throw, mirroring today's behavior where Codex omits
     * `createChat` (the orchestrator rejected multi-chat for Codex). The
     * remaining methods address the session's single default chat, whose
     * URI is the deterministic default chat channel URI.
     */
    this.chats = {
      createChat: (_chat, _options) => {
        throw new Error("Codex agent does not support multiple chats");
      },
      fork: (_chat, _source, _options) => {
        throw new Error("Codex agent does not support chat forking");
      },
      disposeChat: (_chat) => {
        return Promise.resolve();
      },
      sendMessage: (chat, prompt, workingDirectories, attachments, turnId, _senderClientId) => {
        return this._sendMessage(chat, prompt, attachments, turnId, workingDirectories);
      },
      abort: (chat) => {
        return this._abort(chat);
      },
      changeModel: (chat, model) => {
        return this._changeModel(chat, model);
      },
      changeAgent: (_chat, _agent) => {
        return Promise.resolve();
      },
      getMessages: (chat) => {
        return this.getSessionMessages(chat);
      }
    };
    this._metadataStore = this._instantiationService.createInstance(CodexSessionMetadataStore);
    this._usageSource = this._resolveUsageSource();
    this._register(this._configurationService.onDidRootConfigChange(() => {
      const next = this._resolveUsageSource();
      if (next !== this._usageSource) {
        this._requestUsageSourceChange(next);
      } else {
        this._pendingUsageSource = void 0;
      }
      this._queueProviderConfigurationWrite();
    }));
    void this._refreshProviderConfiguration();
    if (this._usageSource === "openai") {
      this._usageSourceValidation = this._validateOpenAIUsageSource();
    }
  }
  async _validateOpenAIUsageSource() {
    let account;
    try {
      const connection = await this._ensureConnection(true);
      account = await this._refreshAccount(connection.client, false);
    } catch (error) {
      if (this._usageSource !== "openai") {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this._setOpenAIAccountState({ usageSource: "openai", status: "error", error: message }, false);
      return;
    }
    if (this._usageSource !== "openai") {
      return;
    }
    const source = resolveCodexUsageSourceAfterAccountRead(this._usageSource, account);
    if (source === "copilot") {
      this._logService.info("[Codex] OpenAI is signed out; falling back to GitHub Copilot");
      this._configurationService.updateRootConfig({ [AgentHostConfigKey.CodexUsageSource]: source });
      return;
    }
    if (account.status === "signedIn") {
      this._queueModelRefresh();
    }
  }
  _setOpenAIAccountState(state, _publish = true) {
    this._openAIAccountState = state;
  }
  _resolveUsageSource() {
    return this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.CodexUsageSource) ?? "copilot";
  }
  _requestUsageSourceChange(source) {
    if (this._hasActiveTurns()) {
      this._pendingUsageSource = source;
      this._logService.info(`[Codex] Deferring usage source change to '${source}' until active turns finish`);
      return;
    }
    if (source === "openai") {
      this._applyUsageSourceChange(source, false, false);
      this._usageSourceValidation = this._validateOpenAIUsageSource();
      return;
    }
    this._applyUsageSourceChange(source);
  }
  _applyUsageSourceChange(source, _publishAccount = true, refreshModels = true) {
    const previousSource = this._usageSource;
    this._pendingUsageSource = void 0;
    this._usageSource = source;
    this._disposeConnection();
    for (const session of this._sessions.values()) {
      this._resetSessionForUsageSourceChange(session, source, previousSource);
    }
    this._subagentsByThreadId.clear();
    this._models.set([], void 0);
    if (!refreshModels) {
      return;
    }
    if (source === "openai") {
      this._queueModelRefresh();
    } else if (this._githubToken) {
      this._queueModelRefresh();
    } else {
      this._onDidRequireAuth.fire({ resource: this._gitHubEndpointService.getCopilotResource().resource, reason: AuthRequiredReason.Required });
    }
  }
  _resetSessionForUsageSourceChange(session, source, previousSource) {
    if (session.threadId === void 0) {
      return;
    }
    this._logService.info(`[Codex:${session.sessionId}] replacing ${previousSource ?? "incompatible-provider"} thread ${session.threadId} with a fresh ${source} thread`);
    this._sessionIdByThreadId.delete(session.threadId);
    session.threadId = void 0;
    session.materializePromise = void 0;
    session.materializedToolsSig = void 0;
    session.materializedMcpSig = void 0;
    session.needsResume = false;
    session.hostTurnIdByAppTurnId.clear();
    session.codexTurnIdByHostTurnId.clear();
  }
  _hasActiveTurns() {
    return [...this._sessions.values()].some((session) => session.currentTurnId !== void 0) || [...this._subagentsByThreadId.values()].some((subagent) => subagent.session.currentTurnId !== void 0);
  }
  _applyPendingUsageSourceIfIdle() {
    const pendingUsageSource = this._pendingUsageSource;
    if (pendingUsageSource && !this._hasActiveTurns()) {
      this._applyUsageSourceChange(pendingUsageSource);
    }
  }
  // #region Auth
  getProtectedResources() {
    return codexProtectedResourcesForUsageSource(
      this._usageSource,
      this._gitHubEndpointService.getCopilotResource(),
      this._gitHubEndpointService.getRepoResource()
    );
  }
  async authenticate(resource, token) {
    if (resource === this._gitHubEndpointService.getRepoResource().resource) {
      return true;
    }
    if (resource !== this._gitHubEndpointService.getCopilotResource().resource) {
      return false;
    }
    const changed = this._githubToken !== token;
    this._githubToken = token;
    if (this._usageSource === "openai") {
      void this._refreshProviderConfiguration();
      return true;
    }
    if (changed && this._connection.kind === "ready" && this._connection.proxyHandle) {
      this._connection.proxyHandle.setToken(token);
      this._queueModelRefresh();
    } else if (changed) {
      this._queueModelRefresh();
    }
    this._logService.info("[Codex] Auth token updated");
    void this._refreshProviderConfiguration();
    return true;
  }
  /**
   * Receives a bearer token the workbench acquired for a protected resource
   * (the `authenticate` command is fanned out to every agent). If the
   * resource maps to one or more configured auth-gated http MCP servers
   * (via the association recorded at discovery time, or a direct URL match),
   * store the token per server URL (so {@link _buildSessionMcpServers} injects
   * it) and reconnect the affected threads so codex picks it up. This is the
   * codex end of the *same* OAuth mechanism the Copilot agent uses: the
   * workbench does the sign-in, the agent injects the resulting bearer.
   * Returns whether the token was consumed by an MCP server (the GitHub agent
   * token flows through {@link authenticate} instead).
   */
  async handleAuthenticationToken(params) {
    const normalizedResource = normalizeCodexMcpResourceUrl(params.resource);
    if (normalizedResource === void 0) {
      return false;
    }
    const serverUrls = new Set(this._mcpAuthServerUrlsByResource.get(normalizedResource) ?? []);
    if (this._isConfiguredHttpServerUrl(normalizedResource)) {
      serverUrls.add(normalizedResource);
    }
    if (serverUrls.size === 0) {
      return false;
    }
    let changed = false;
    for (const serverUrl of serverUrls) {
      if (this._mcpAuthTokens.get(serverUrl) !== params.token) {
        this._mcpAuthTokens.set(serverUrl, params.token);
        changed = true;
      }
    }
    if (!changed) {
      return true;
    }
    this._logService.info(`[Codex] stored MCP auth token for ${params.resource}; reconnecting affected sessions`);
    await this._reconnectSessionsForMcpAuth(serverUrls);
    return true;
  }
  /** Whether `normalizedUrl` is a currently-configured http MCP server (root config or any session's client plugins). */
  _isConfiguredHttpServerUrl(normalizedUrl) {
    if (Object.values(codexMcpServersFromConfig(this._configurationService.getRootValue(platformRootSchema, AgentHostMcpServersConfigKey))).some((server) => server.url !== void 0 && normalizeCodexMcpResourceUrl(server.url) === normalizedUrl)) {
      return true;
    }
    return [...this._sessions.values()].some(
      (session) => [...this._httpMcpServerUrls(session).values()].includes(normalizedUrl)
    );
  }
  /**
   * Reconnects every materialized session whose merged MCP servers include one
   * of `normalizedUrls` so codex re-reads `config.mcp_servers` with the
   * injected `Authorization` header. A thread that has not yet committed a
   * turn is restarted (`thread/start`, lossless); one with history is resumed
   * (`thread/resume` carries the same `config` field, loading history from the
   * rollout) on its next turn via {@link ICodexSession.needsResume}.
   */
  async _reconnectSessionsForMcpAuth(normalizedUrls) {
    for (const session of this._sessions.values()) {
      if (session.disposed || session.threadId === void 0) {
        continue;
      }
      if (![...this._httpMcpServerUrls(session).values()].some((url) => normalizedUrls.has(url))) {
        continue;
      }
      if (!session.firstTurnSent) {
        try {
          await this._restartThreadWithCurrentTools(session);
        } catch (err) {
          this._logService.warn(`[Codex:${session.sessionId}] reconnect after MCP auth failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        session.needsResume = true;
      }
    }
  }
  /**
   * {@link IAgent.refreshModels}. Coalesces onto an in-flight refresh — from
   * an account/usage-source change or an earlier tick — rather than issuing a
   * second enumeration, and never rejects: {@link _refreshModels} logs and
   * applies its own stale-write guards on failure.
   */
  refreshModels() {
    return this._modelsRefreshPromise ?? this._queueModelRefresh();
  }
  _queueModelRefresh() {
    const refreshPromise = this._refreshModels().finally(() => {
      if (this._modelsRefreshPromise === refreshPromise) {
        this._modelsRefreshPromise = void 0;
      }
    });
    this._modelsRefreshPromise = refreshPromise;
    return refreshPromise;
  }
  _ensureAuthenticated() {
    if (this._usageSource === "openai") {
      return void 0;
    }
    const token = this._githubToken;
    if (!token) {
      throw new ProtocolError(
        AHP_AUTH_REQUIRED,
        "Authentication is required to use Codex",
        this.getProtectedResources()
      );
    }
    return token;
  }
  _defaultModel() {
    const models = this._models.get();
    const chosen = models[0];
    return chosen ? { id: chosen.id } : void 0;
  }
  _supportedModelOrUndefined(model) {
    if (model && this._models.get().some((m) => m.id === model.id)) {
      return model;
    }
    if (model) {
      this._logService.warn(`[Codex] Ignoring unknown model '${model.id}'`);
    }
    return this._defaultModel();
  }
  async _resolveModel(session) {
    if (this._models.get().length === 0 && this._modelsRefreshPromise) {
      await this._modelsRefreshPromise;
    }
    const selected = this._supportedModelOrUndefined(session.model);
    if (selected) {
      session.model = selected;
      return selected;
    }
    throw new Error("Codex has no available models.");
  }
  _createReasoningEffortConfigSchema() {
    return {
      type: "object",
      properties: {
        [CODEX_THINKING_LEVEL_KEY]: {
          type: "string",
          title: localize("codex.modelThinkingLevel.title", "Thinking Level"),
          description: localize("codex.modelThinkingLevel.description", "Controls how much reasoning effort Codex uses."),
          default: "medium",
          enum: [...CODEX_REASONING_EFFORTS],
          enumLabels: CODEX_REASONING_EFFORTS.map(getReasoningEffortLabel),
          enumDescriptions: CODEX_REASONING_EFFORTS.map((effort) => getReasoningEffortDescription(effort) ?? "")
        }
      }
    };
  }
  _getReasoningEffort(session) {
    const modelConfigEffort = narrowReasoningEffort(session.model?.config?.[CODEX_THINKING_LEVEL_KEY]);
    if (modelConfigEffort) {
      return modelConfigEffort;
    }
    const config = this._configurationService.getSessionConfigValues(session.sessionUri.toString());
    return narrowReasoningEffort(config?.[CodexSessionConfigKey.ModelReasoningEffort]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.ModelReasoningEffort];
  }
  _readSessionConfig(session) {
    return codexSessionConfigSchema.validateOrDefault(
      this._configurationService.getSessionConfigValues(session.sessionUri.toString()),
      codexSessionConfigDefaults
    );
  }
  /**
   * Resolve the Codex security axes (approval policy, sandbox, reviewer) for a
   * live or restored session from its RAW persisted config values.
   *
   * The raw values are normalized through {@link migrateCodexPermissionValues}
   * (the same migration the restore path applies) before resolving, so the
   * axes we send to the app-server always match the preset the "Approvals" chip
   * displays. This matters for two legacy shapes:
   * - a session that persisted only `sandboxMode = 'read-only'` is preserved
   *   verbatim, so it is NOT silently escalated back to `workspace-write` on
   *   resume (the chip over-promises, but the session stays more locked down);
   * - a session that persisted `approvalPolicy = 'never'` + `workspace-write`
   *   (which the chip renders as "Default Permissions") is snapped onto the
   *   `default` preset's `on-request` policy so it actually prompts, instead of
   *   running commands unprompted while the chip claims it would ask.
   */
  _resolveSessionPermissions(session) {
    const rawValues = this._configurationService.getSessionConfigValues(session.sessionUri.toString());
    const defaults = {
      approvalPolicy: codexSessionConfigDefaults[CodexSessionConfigKey.ApprovalPolicy],
      sandboxMode: codexSessionConfigDefaults[CodexSessionConfigKey.SandboxMode]
    };
    return resolveCodexPermissions(migrateCodexPermissionValues(rawValues, defaults), defaults);
  }
  _sandboxPolicy(session, config, mode) {
    if (mode === "danger-full-access") {
      return { type: "dangerFullAccess" };
    }
    const networkAccess = narrowBoolean(config[CodexSessionConfigKey.NetworkAccessEnabled]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.NetworkAccessEnabled];
    if (mode === "read-only") {
      return { type: "readOnly", networkAccess: false };
    }
    const additionalDirectories = narrowAdditionalDirectories(config[CodexSessionConfigKey.AdditionalDirectories]) ?? [];
    const writableRoots = this._isMultiRootActive(session) ? distinctAbsolutePaths([
      ...this._runtimeWorkspaceRoots(session),
      ...additionalDirectories
    ]) : [
      ...session.workingDirectory ? [session.workingDirectory.fsPath] : [],
      ...additionalDirectories
    ];
    return {
      type: "workspaceWrite",
      writableRoots,
      networkAccess,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false
    };
  }
  _turnStartOptions(session, modelId) {
    const config = this._readSessionConfig(session);
    const { approvalPolicy, sandboxMode, approvalsReviewer } = this._resolveSessionPermissions(session);
    const sandboxPolicy = this._sandboxPolicy(session, config, sandboxMode);
    const runtimeWorkspaceRoots = this._isMultiRootActive(session) ? this._runtimeWorkspaceRoots(session) : sandboxPolicy.type === "workspaceWrite" ? sandboxPolicy.writableRoots : void 0;
    const effort = this._getReasoningEffort(session);
    const personality = narrowPersonality(config[CodexSessionConfigKey.Personality]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.Personality];
    const summary = narrowReasoningSummary(config[CodexSessionConfigKey.ReasoningSummary]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.ReasoningSummary];
    const mode = collaborationModeKind(config[SessionConfigKey.Mode]);
    const collaborationMode = {
      mode,
      settings: { model: modelId, reasoning_effort: effort ?? null, developer_instructions: null }
    };
    return {
      approvalPolicy,
      sandboxPolicy,
      approvalsReviewer,
      effort,
      personality,
      summary,
      collaborationMode,
      ...runtimeWorkspaceRoots ? { runtimeWorkspaceRoots } : {}
    };
  }
  _runtimeWorkspaceRoots(session) {
    const workingDirectories = session.workingDirectories ?? (session.workingDirectory ? [session.workingDirectory] : []);
    return distinctAbsolutePaths(workingDirectories.map((directory) => directory.fsPath));
  }
  _isMultiRootActive(session) {
    return session.multiRootEnabled && (session.workingDirectories?.length ?? 0) > 1;
  }
  async _refreshModels() {
    const usageSource = this._usageSource;
    if (usageSource === "openai") {
      await this._refreshOpenAIModels();
      return;
    }
    const token = this._githubToken;
    if (!token) {
      this._models.set([], void 0);
      return;
    }
    try {
      const userAgent = `${USER_AGENT_PREFIX}/${this._productService.version}`;
      const all = await this._copilotApiService.models(token, { headers: { "User-Agent": userAgent }, suppressIntegrationId: true });
      if (this._usageSource !== usageSource || this._githubToken !== token) {
        return;
      }
      const configSchema = this._createReasoningEffortConfigSchema();
      const models = all.filter((m) => m.supported_endpoints?.includes(CODEX_RESPONSES_ENDPOINT)).sort((a, b) => Number(b.is_chat_default) - Number(a.is_chat_default)).map((m) => ({
        provider: this.id,
        id: m.id,
        name: m.name ?? m.id,
        maxContextWindow: m.capabilities?.limits?.max_context_window_tokens,
        maxOutputTokens: m.capabilities?.limits?.max_output_tokens,
        maxPromptTokens: m.capabilities?.limits?.max_prompt_tokens,
        supportsVision: !!m.capabilities?.supports?.vision,
        configSchema,
        policyState: m.policy?.state,
        _meta: createPricingMetaFromBilling(
          normalizeCAPIBilling(m.billing),
          typeof m.model_picker_price_category === "string" ? m.model_picker_price_category : void 0
        )
      }));
      this._models.set(models, void 0);
    } catch (err) {
      this._logService.warn(`[Codex] Failed to refresh models: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  async _refreshOpenAIModels() {
    try {
      const connection = await this._ensureConnection();
      if (connection.usageSource !== "openai") {
        return;
      }
      const data = [];
      let cursor = null;
      do {
        const response = await connection.client.request("model/list", { cursor, limit: 100, includeHidden: false });
        data.push(...response.data);
        cursor = response.nextCursor;
      } while (cursor !== null);
      const configSchema = this._createReasoningEffortConfigSchema();
      const models = data.sort((left, right) => Number(right.isDefault) - Number(left.isDefault)).map((model) => ({
        provider: this.id,
        id: model.model,
        name: model.displayName,
        supportsVision: model.inputModalities.includes("image"),
        configSchema
      }));
      if (this._usageSource === "openai") {
        this._models.set(models, void 0);
      }
    } catch (err) {
      this._logService.warn(`[Codex] Failed to refresh OpenAI models: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // #endregion
  // #region Connection lifecycle
  /**
   * Lazily spawn the codex app-server, initialize the connection,
   * authenticate via apiKey, and return the ready connection. Idempotent
   * — concurrent callers share the same promise.
   */
  async _ensureConnection(skipUsageSourceValidation = false) {
    if (this._connection.kind === "ready") {
      return Promise.resolve(this._connection);
    }
    if (this._connection.kind === "starting") {
      return this._connection.promise;
    }
    if (!skipUsageSourceValidation && this._usageSource === "openai") {
      let validation = this._usageSourceValidation;
      await validation;
      while (validation !== this._usageSourceValidation) {
        validation = this._usageSourceValidation;
        await validation;
      }
    }
    const token = this._ensureAuthenticated();
    const usageSource = this._usageSource;
    const generation = this._connectionGeneration;
    const startPromise = this._startConnection(usageSource, token);
    const promise = startPromise.then((ready) => {
      if (generation !== this._connectionGeneration || usageSource !== this._usageSource) {
        ready.client.dispose();
        ready.proxyHandle?.dispose();
        try {
          ready.child.kill("SIGKILL");
        } catch {
        }
        throw new Error("Codex usage source changed while app-server was starting");
      }
      this._connection = { kind: "ready", ...ready };
      return ready;
    }).catch((err) => {
      if (generation === this._connectionGeneration) {
        this._connection = { kind: "idle" };
      }
      throw err;
    });
    this._connection = { kind: "starting", promise };
    return promise;
  }
  /**
   * Resolve the Codex SDK root — the directory whose
   * `node_modules/@openai/codex-<target>/…` holds the native binary.
   *
   * Mirrors the three-tier resolution in `ClaudeAgentSdkService._loadSdk`:
   *   1. dev override / product download, via the downloader, when the SDK
   *      `isAvailable` (env override || `product.agentSdks.codex`);
   *   2. dev fallback to this repo's `node_modules`, where `@openai/codex`
   *      and its per-host binary package are devDependencies — this is what
   *      lets running-from-source (and dev smoke tests) spawn Codex without
   *      an env-var override.
   *
   * `isAvailable` is already false in dev, so it discriminates the two
   * without injecting `INativeEnvironmentService`. When neither path
   * resolves we defer to the downloader so callers get its actionable
   * "not configured" diagnostic.
   */
  async _resolveSdkRoot() {
    if (this._agentSdkDownloader.isAvailable(CodexSdkPackage)) {
      return this._agentSdkDownloader.loadSdkRoot(CodexSdkPackage, CancellationToken.None);
    }
    const devRoot = await resolveCodexDevSdkRoot();
    if (devRoot) {
      this._logService.info(`[Codex] resolving SDK from repo node_modules (dev fallback): ${devRoot}`);
      return devRoot;
    }
    return this._agentSdkDownloader.loadSdkRoot(CodexSdkPackage, CancellationToken.None);
  }
  async _startConnection(usageSource, token) {
    const root = await this._resolveSdkRoot();
    const codexTarget = codexPackageSuffix(process.platform, process.arch);
    if (!codexTarget) {
      throw new Error(`Codex: unsupported platform ${process.platform}-${process.arch}`);
    }
    const triple = codexBinaryTriple(codexTarget);
    if (!triple) {
      throw new Error(`Codex: no binary triple known for sdkTarget '${codexTarget}'`);
    }
    const binaryName = process.platform === "win32" ? "codex.exe" : "codex";
    const binaryPath = join(root, "node_modules", `@openai/codex-${codexTarget}`, "vendor", triple, "bin", binaryName);
    try {
      fs.accessSync(binaryPath, fs.constants.X_OK);
    } catch (err) {
      throw new Error(`Codex binary not executable: ${binaryPath} (${err instanceof Error ? err.message : String(err)})`);
    }
    let proxyHandle;
    if (usageSource === "copilot") {
      if (!token) {
        throw new Error("Codex Copilot launch requires a GitHub token");
      }
      proxyHandle = await this._codexProxyService.start(token);
    }
    const extraArgs = parseBinaryArgs(process.env[AgentHostCodexAgentBinaryArgsEnvVar]);
    const launchConfig = buildCodexLaunchConfig(usageSource, process.env, proxyHandle, extraArgs);
    const env = launchConfig.env;
    const userCodexHome = process.env[AgentHostCodexAgentCodexHomeEnvVar];
    if (userCodexHome) {
      env.CODEX_HOME = userCodexHome;
    }
    const args = [...launchConfig.args];
    this._logService.info(`[Codex] spawning usageSource=${usageSource} proxy=${proxyHandle ? "enabled" : "disabled"} ${binaryPath} ${args.join(" ")}`);
    const child = spawn(binaryPath, args, { env, stdio: ["pipe", "pipe", "pipe"] });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => this._logService.info(`[Codex stderr] ${String(chunk).trimEnd()}`));
    const transport = transportFromChildProcess(child);
    const client = new CodexAppServerClient(transport, (level, msg) => {
      this._logService.info(`[CodexClient ${level}] ${msg}`);
    });
    client.onExit((e) => {
      this._logService.warn(`[Codex] app-server exited code=${e.code} signal=${e.signal}`);
      this._handleConnectionLost();
    });
    client.onTransportError((err) => {
      this._logService.error(`[Codex] transport error: ${err.message}`);
      this._handleConnectionLost();
    });
    try {
      await client.request("initialize", {
        clientInfo: CLIENT_INFO,
        capabilities: { experimentalApi: true, requestAttestation: false, optOutNotificationMethods: null }
      });
      client.notify("initialized", void 0);
      if (userCodexHome && proxyHandle) {
        await client.request("account/login/start", {
          type: "apiKey",
          apiKey: proxyHandle.nonce
        });
      }
      if (usageSource === "openai") {
        void this._refreshAccount(client);
      }
    } catch (err) {
      client.dispose();
      proxyHandle?.dispose();
      try {
        child.kill("SIGKILL");
      } catch {
      }
      throw err;
    }
    this._registerIgnoredNotifications(client);
    this._register(client.onNotification("account/login/completed", () => {
    }));
    this._register(client.onNotification("account/updated", () => {
      if (this._usageSource === "openai" && this._connection.kind === "ready" && this._connection.client === client) {
        void this._refreshAccount(client);
        this._queueModelRefresh();
      }
    }));
    this._register(client.onNotification("turn/started", (params) => this._dispatchByThread(params.threadId, (s) => this._handleTurnStartedNotification(s, params))));
    this._register(client.onNotification("item/started", (params) => this._dispatchByThread(params.threadId, (s) => this._handleItemStarted(s, params))));
    this._register(client.onNotification("item/agentMessage/delta", (params) => this._dispatchByThread(params.threadId, (s) => mapAgentMessageDelta(s.mapState, this._withHostTurnId(s, params)))));
    this._register(client.onNotification("item/commandExecution/outputDelta", (params) => this._dispatchByThread(params.threadId, (s) => mapCommandExecutionOutputDelta(s.mapState, this._withHostTurnId(s, params)))));
    this._register(client.onNotification("item/fileChange/patchUpdated", (params) => this._dispatchByThread(params.threadId, (s) => mapFileChangePatchUpdated(s.mapState, this._withHostTurnId(s, params)))));
    this._register(client.onNotification("item/fileChange/outputDelta", (params) => this._dispatchByThread(params.threadId, (s) => mapFileChangeOutputDelta(s.mapState, this._withHostTurnId(s, params)))));
    this._register(client.onNotification("item/mcpToolCall/progress", (params) => this._dispatchByThread(params.threadId, (s) => mapMcpToolCallProgress(s.mapState, this._withHostTurnId(s, params)))));
    this._register(client.onNotification("item/reasoning/summaryPartAdded", (params) => this._dispatchByThread(params.threadId, (s) => mapReasoningSummaryPartAdded(s.mapState, this._withHostTurnId(s, params)))));
    this._register(client.onNotification("item/reasoning/summaryTextDelta", (params) => this._dispatchByThread(params.threadId, (s) => mapReasoningSummaryTextDelta(s.mapState, this._withHostTurnId(s, params)))));
    this._register(client.onNotification("item/reasoning/textDelta", (params) => this._dispatchByThread(params.threadId, (s) => mapReasoningTextDelta(s.mapState, this._withHostTurnId(s, params)))));
    this._register(client.onNotification("thread/tokenUsage/updated", (params) => this._dispatchByThread(params.threadId, (s) => mapTokenUsageUpdated(this._withHostTurnId(s, params)))));
    this._register(client.onNotification("item/completed", (params) => this._dispatchItemCompleted(params)));
    this._register(client.onNotification("turn/completed", (params) => this._dispatchTurnCompleted(params)));
    this._register(client.onNotification("guardianWarning", (params) => this._dispatchByThread(params.threadId, (s) => this._handleGuardianWarning(s, params))));
    this._register(client.onNotification("item/autoApprovalReview/completed", (params) => {
      void this._handleGuardianReviewCompleted(client, params);
    }));
    this._register(client.onNotification("mcpServer/startupStatus/updated", (params) => this._handleMcpStartupStatus(client, params.name, params.status, params.error)));
    this._register(client.onRequest(
      "item/commandExecution/requestApproval",
      (params) => this._handleCommandApprovalRequestRpc(params)
    ));
    this._register(client.onRequest(
      "item/fileChange/requestApproval",
      (params) => this._handleFileChangeApprovalRequestRpc(params)
    ));
    this._register(client.onRequest(
      "item/permissions/requestApproval",
      (params) => this._handlePermissionsApprovalRequestRpc(params)
    ));
    this._register(client.onRequest(
      "item/tool/call",
      (params) => this._handleDynamicToolCallRpc(params)
    ));
    this._register(client.onRequest(
      "item/tool/requestUserInput",
      (params) => this._handleUserInputRequestRpc(params)
    ));
    this._register(client.onRequest(
      "mcpServer/elicitation/request",
      (params) => this._handleElicitationRequestRpc(params)
    ));
    void this._refreshMcpInventory(client);
    return { client, usageSource, proxyHandle, child };
  }
  /**
   * Builds the `mcp_servers` object for a session's `thread/start.config`:
   * the workbench's root `mcpServers` config merged with the session's
   * enabled client-plugin MCP servers. Passing them per-thread (rather than
   * as process-global `-c` spawn overrides) means each new session picks up
   * the current root config without restarting the shared app-server, and it
   * merges with (leaves intact) the user's global `~/.codex/config.toml`.
   * Client-plugin servers win a name collision with the root config. Any
   * OAuth bearer token acquired for an auth-gated http server (see
   * {@link handleAuthenticationToken}) is injected as an `Authorization`
   * header so codex connects authenticated.
   */
  _buildSessionMcpServers(session) {
    const root = codexMcpServersFromConfig(this._configurationService.getRootValue(platformRootSchema, AgentHostMcpServersConfigKey));
    const clientPlugins = codexMcpServersFromPlugins(session.clientCustomizations.enabledPlugins());
    return injectCodexMcpAuthTokens({ ...root, ...clientPlugins }, this._mcpAuthTokens);
  }
  /**
   * The normalized URLs of every configured http MCP server (root config +
   * the session's client plugins), keyed by server name. Used to (a) surface
   * an auth-required server's resource for the workbench sign-in and (b)
   * match a workbench-acquired token back to the server(s) it unlocks.
   * Computed from a token-free build so the URLs are the bare server URLs.
   */
  _httpMcpServerUrls(session) {
    const root = codexMcpServersFromConfig(this._configurationService.getRootValue(platformRootSchema, AgentHostMcpServersConfigKey));
    const clientPlugins = codexMcpServersFromPlugins(session.clientCustomizations.enabledPlugins());
    const urls = /* @__PURE__ */ new Map();
    for (const [name, server] of Object.entries({ ...root, ...clientPlugins })) {
      const normalized = server.url !== void 0 ? normalizeCodexMcpResourceUrl(server.url) : void 0;
      if (normalized !== void 0) {
        urls.set(name, normalized);
      }
    }
    return urls;
  }
  /** The bare (un-normalized) URL of a configured http MCP server by name, across all sessions. */
  _mcpServerUrlForName(name) {
    const root = codexMcpServersFromConfig(this._configurationService.getRootValue(platformRootSchema, AgentHostMcpServersConfigKey));
    if (root[name]?.url !== void 0) {
      return root[name].url;
    }
    for (const session of this._sessions.values()) {
      const fromPlugins = codexMcpServersFromPlugins(session.clientCustomizations.enabledPlugins());
      if (fromPlugins[name]?.url !== void 0) {
        return fromPlugins[name].url;
      }
    }
    return void 0;
  }
  /**
   * Map the session's tools into codex `dynamicTools` specs: the agent host's
   * server tools (executed in-process) plus the workbench client's tools
   * (round-tripped to the client). Both are registered with codex the same
   * way — at `thread/start` — and dispatched apart in
   * {@link _handleDynamicToolCallRpc} by name.
   */
  _buildDynamicTools(session) {
    const serverTools = this._serverToolHost?.definitions ?? [];
    const clientTools = session.clientToolSet.merged();
    const seen = /* @__PURE__ */ new Set();
    const all = [];
    for (const t of [...serverTools, ...clientTools]) {
      if (seen.has(t.name)) {
        continue;
      }
      seen.add(t.name);
      all.push(t);
    }
    if (all.length === 0) {
      return void 0;
    }
    return all.map((t) => ({
      type: "function",
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema ?? { type: "object" }
    }));
  }
  async _handleDynamicToolCallRpc(params) {
    const sessionId = this._sessionIdByThreadId.get(params.threadId);
    const session = sessionId ? this._sessions.get(sessionId) : void 0;
    if (!session) {
      return { result: this._toolFailure(`Codex tool call for unknown thread ${params.threadId}`) };
    }
    const host = this._serverToolHost;
    if (host && params.namespace === null && host.toolNames.includes(params.tool)) {
      try {
        const text = host.executeTool(session.sessionUri.toString(), params.tool, params.arguments);
        return { result: { contentItems: [{ type: "inputText", text: await text }], success: true } };
      } catch (err) {
        return { result: this._toolFailure(`Server tool ${params.tool} failed: ${err instanceof Error ? err.message : String(err)}`) };
      }
    }
    const toolCallId = session.mapState.itemToToolCall.get(params.callId)?.toolCallId;
    if (toolCallId === void 0) {
      return { result: this._toolFailure(`No pending client tool call for ${params.tool} (callId ${params.callId})`) };
    }
    if (session.clientToolSet.size === 0) {
      return { result: this._toolFailure(`No client available to run ${params.tool}`) };
    }
    try {
      const result = await session.pendingClientToolCalls.register(toolCallId);
      return { result: dynamicToolResponseFromResult(result) };
    } catch (err) {
      if (err instanceof CancellationError) {
        return { result: this._toolFailure(`Client tool ${params.tool} was cancelled`) };
      }
      return { result: this._toolFailure(`Client tool ${params.tool} failed: ${err instanceof Error ? err.message : String(err)}`) };
    }
  }
  _toolFailure(message) {
    this._logService.warn(`[Codex] dynamic tool call failed: ${message}`);
    return { contentItems: [{ type: "inputText", text: message }], success: false };
  }
  async _handleUserInputRequestRpc(params) {
    const sessionId = this._sessionIdByThreadId.get(params.threadId);
    const session = sessionId ? this._sessions.get(sessionId) : void 0;
    if (!session) {
      return { result: emptyUserInputResponse(params.questions) };
    }
    if (!session.currentTurnId) {
      this._logService.warn(`[Codex] user input request without an active turn for threadId=${params.threadId}; returning empty answers`);
      return { result: emptyUserInputResponse(params.questions) };
    }
    const approvalQuestion = params.questions.length === 1 && params.questions[0].id.startsWith(MCP_TOOL_APPROVAL_QUESTION_ID_PREFIX) ? params.questions[0] : void 0;
    if (approvalQuestion) {
      const callId = approvalQuestion.id.slice(MCP_TOOL_APPROVAL_QUESTION_ID_PREFIX.length);
      const entry = session.mapState.itemToToolCall.get(callId);
      if (entry) {
        return this._handleMcpToolApprovalViaCard(session, approvalQuestion, entry);
      }
    }
    const requestId = generateUuid();
    const request = buildUserInputRequest(requestId, params.questions);
    try {
      const result = await session.pendingUserInputs.registerAndFire(requestId, () => {
        this._fire(session.sessionUri, { type: ActionType.ChatInputRequested, request });
      });
      return { result: userInputResponseFromAnswers(params.questions, result.response, result.answers) };
    } catch (err) {
      return { result: emptyUserInputResponse(params.questions) };
    }
  }
  /**
   * Renders an MCP tool-call approval on the normal tool-approval card
   * (a pending-confirmation `ChatToolCallReady` on the originating
   * `mcpToolCall` host tool call) rather than as a chat-input question.
   * The user's Allow/Deny decision is mapped back to the answer string
   * codex expects (`Allow` / `__codex_mcp_decline__`). Mirrors the shell
   * command approval flow ({@link CodexAgent._handleCommandApprovalRequest}).
   */
  async _handleMcpToolApprovalViaCard(session, question, entry) {
    const confirmationTitle = question.question || question.header || "Run MCP tool";
    let decision;
    try {
      decision = await session.pendingCommandApprovals.registerAndFire(entry.toolCallId, () => {
        this._fire(session.sessionUri, {
          type: ActionType.ChatToolCallReady,
          turnId: entry.turnId,
          toolCallId: entry.toolCallId,
          invocationMessage: confirmationTitle,
          toolInput: confirmationTitle,
          confirmationTitle
        });
      });
    } catch (err) {
      decision = "decline";
    }
    const allow = decision === "accept" || decision === "acceptForSession";
    const answer = allow ? MCP_TOOL_APPROVAL_ANSWER_ALLOW : MCP_TOOL_APPROVAL_ANSWER_DECLINE;
    return { result: { answers: { [question.id]: { answers: [answer] } } } };
  }
  async _handleElicitationRequestRpc(params) {
    const sessionId = this._sessionIdByThreadId.get(params.threadId);
    const session = sessionId ? this._sessions.get(sessionId) : void 0;
    this._logService.info(`[Codex] elicitation request threadId=${params.threadId} mode=${params.mode} server=${params.serverName} session=${session ? session.sessionId : "NONE"}`);
    if (!session) {
      this._logService.warn(`[Codex] elicitation request for unknown threadId=${params.threadId}; declining`);
      return { result: declinedElicitationResponse() };
    }
    if (!session.currentTurnId) {
      this._logService.warn(`[Codex] elicitation request without an active turn for threadId=${params.threadId}; declining`);
      return { result: declinedElicitationResponse() };
    }
    const requestId = generateUuid();
    const request = buildElicitationRequest(requestId, params);
    try {
      const result = await session.pendingUserInputs.registerAndFire(requestId, () => {
        this._fire(session.sessionUri, { type: ActionType.ChatInputRequested, request });
      });
      this._logService.info(`[Codex] elicitation resolved requestId=${requestId} response=${result.response}`);
      return { result: elicitationResponseFromAnswers(params, result.response, result.answers) };
    } catch (err) {
      this._logService.info(`[Codex] elicitation cancelled requestId=${requestId}: ${err instanceof Error ? err.message : String(err)}`);
      return { result: cancelledElicitationResponse() };
    }
  }
  _hostTurnId(session, appTurnId) {
    return session.hostTurnIdByAppTurnId.get(appTurnId) ?? appTurnId;
  }
  _withHostTurnId(session, params) {
    const turnId = this._hostTurnId(session, params.turnId);
    return turnId === params.turnId ? params : { ...params, turnId };
  }
  _withHostTurn(session, params) {
    const appTurnId = params.turn.id;
    const hostTurnId = session.currentTurnId ?? this._hostTurnId(session, appTurnId);
    session.hostTurnIdByAppTurnId.set(appTurnId, hostTurnId);
    session.currentAppTurnId = appTurnId;
    return hostTurnId === appTurnId ? params : { ...params, turn: { ...params.turn, id: hostTurnId } };
  }
  _handleTurnStartedNotification(session, params) {
    mapTurnStarted(session.mapState, this._withHostTurn(session, params), session.lastPromptText);
    return [];
  }
  _handleTurnCompletedNotification(session, params) {
    const appTurnId = params.turn.id;
    const hostTurnId = this._hostTurnId(session, appTurnId);
    const out = mapTurnCompleted(session.mapState, this._withHostTurn(session, params), this._clearTurnStopWatch(session));
    session.codexTurnIdByHostTurnId.set(hostTurnId, appTurnId);
    if (session.currentAppTurnId === appTurnId || session.currentTurnId === hostTurnId) {
      session.currentTurnId = void 0;
      session.currentAppTurnId = void 0;
    }
    session.hostTurnIdByAppTurnId.delete(appTurnId);
    this._drainPendingSteering(session);
    if (session.pendingGuardianReviewCards.size > 0) {
      for (const guardianToolCallId of [...session.pendingGuardianReviewCards]) {
        session.pendingCommandApprovals.respond(guardianToolCallId, "cancel");
      }
    }
    return out;
  }
  /**
   * Dispatch a codex `item/started` notification. `userMessage` items are
   * intercepted here (rather than in the pure mapper) because steering
   * promotion needs the agent's per-session turn-correlation state; all
   * other item kinds defer to {@link mapItemStarted}.
   */
  _handleItemStarted(session, params) {
    if (params.item.type === "userMessage") {
      return this._handleSteeredUserMessage(session, params.item.content);
    }
    return mapItemStarted(session.mapState, this._withHostTurnId(session, params));
  }
  /**
   * Codex echoes every user message — the turn opener (already shown by
   * the workbench before `sendMessage`) and any steered input — as a
   * `userMessage` item. Only steered input is buffered in
   * {@link ICodexSession.pendingSteeringFlips}; a buffered match is
   * promoted into its own visible turn and everything else is dropped.
   */
  _handleSteeredUserMessage(session, content) {
    const text = extractUserInputText(content);
    const steering = this._takeMatchingPendingSteering(session, text);
    if (!steering) {
      return [];
    }
    return this._beginSteeringTurn(session, steering);
  }
  /**
   * Pop the buffered steering message whose text matches the echoed
   * `userMessage` content. Matching by content (not FIFO) keeps the
   * mapping correct when several steering messages with different texts
   * are in flight.
   */
  _takeMatchingPendingSteering(session, text) {
    for (const [id, msg] of session.pendingSteeringFlips) {
      if (msg.message.text === text) {
        session.pendingSteeringFlips.delete(id);
        return msg;
      }
    }
    return void 0;
  }
  /**
   * Promote a steered message into its own protocol turn: complete the
   * in-flight turn (so its response parts settle into history) and open a
   * fresh turn whose user message is the steering content. The
   * `queuedMessageId` clears the corresponding pending steering bubble.
   * Subsequent codex items for the same app-server turn are re-mapped to
   * the new host turn id so the steering response lands there.
   */
  _beginSteeringTurn(session, steering) {
    const actions = [];
    const appTurnId = session.currentAppTurnId;
    const previousHostTurnId = session.currentTurnId ?? (appTurnId ? this._hostTurnId(session, appTurnId) : void 0);
    if (previousHostTurnId) {
      actions.push({ type: ActionType.ChatTurnComplete, turnId: previousHostTurnId, duration: this._clearTurnStopWatch(session) });
    }
    const newHostTurnId = generateUuid();
    if (appTurnId) {
      session.hostTurnIdByAppTurnId.set(appTurnId, newHostTurnId);
    }
    session.currentTurnId = newHostTurnId;
    resetCodexTurnMapState(session.mapState);
    actions.push({
      type: ActionType.ChatTurnStarted,
      turnId: newHostTurnId,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      message: steering.message,
      queuedMessageId: steering.id
    });
    this._startTurnStopWatch(session);
    return actions;
  }
  /**
   * Clear any steering messages still buffered (never echoed by codex)
   * and fire `steering_consumed` for each so the chat UI removes the
   * lingering pending bubble. Called on turn completion, abort, dispose,
   * and connection loss.
   */
  _drainPendingSteering(session) {
    if (session.pendingSteeringFlips.size === 0) {
      return;
    }
    const ids = [...session.pendingSteeringFlips.keys()];
    session.pendingSteeringFlips.clear();
    for (const id of ids) {
      this._fireSteeringConsumed(session, id);
    }
  }
  _fireSteeringConsumed(session, id) {
    this._onDidSessionProgress.fire({ kind: "steering_consumed", chat: URI.parse(buildDefaultChatUri(session.sessionUri)), id });
  }
  _registerIgnoredNotifications(client) {
    const ignored = [
      "thread/started",
      // thread/start response is authoritative for session materialization.
      "thread/status/changed",
      // Codex thread status is not surfaced in Agent Host state yet.
      "thread/settings/updated",
      // VS Code owns session config; Codex settings echoes are not consumed yet.
      "thread/goal/updated",
      // Goals are not surfaced in the Agent Host UI yet.
      "thread/goal/cleared",
      // Goals are not surfaced in the Agent Host UI yet.
      "account/rateLimits/updated",
      // Rate-limit UI/state is not implemented yet.
      "remoteControl/status/changed",
      // Remote-control state is not part of the VS Code integration.
      "serverRequest/resolved",
      // We resolve requests through JSON-RPC responses, so this echo is informational.
      "item/autoApprovalReview/started"
      // Informational; the completed notification drives the denied-action card.
    ];
    for (const method of ignored) {
      this._register(client.onNotification(method, () => {
      }));
    }
  }
  async _refreshAccount(client, publish = true) {
    try {
      const response = await client.request("account/read", { refreshToken: false });
      const state = codexAccountStateFromResponse(response);
      this._setOpenAIAccountState(state, publish);
      this._logService.info(`[Codex] account/read accountType=${response.account?.type ?? "none"} requiresOpenaiAuth=${response.requiresOpenaiAuth}${state.planType ? ` planType=${state.planType}` : ""}`);
      return state;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._logService.warn(`[Codex] account/read failed: ${message}`);
      const state = { usageSource: "openai", status: "error", error: message };
      this._setOpenAIAccountState(state, publish);
      return state;
    }
  }
  async _readProviderConfiguration() {
    const connection = await this._ensureConnection();
    const response = await connection.client.request("config/read", { includeLayers: true });
    const userLayer = response.layers?.find((layer) => layer.name.type === "user" && layer.name.profile === null) ?? response.layers?.find((layer) => layer.name.type === "user");
    const config = userLayer?.config && typeof userLayer.config === "object" && !Array.isArray(userLayer.config) ? userLayer.config : {};
    return {
      "codex.personality": this._readConfigurationValue(config, "personality") ?? "default",
      "codex.autoReviewPolicy": this._readConfigurationValue(config, "auto_review.policy") ?? ""
    };
  }
  async _writeProviderConfiguration(key, value) {
    const connection = await this._ensureConnection();
    await connection.client.request("config/batchWrite", {
      edits: key === "codex.autoReviewPolicy" && value === "" ? [{ keyPath: "auto_review", value: null, mergeStrategy: "replace" }] : key === "codex.personality" && value === "default" ? [{ keyPath: "personality", value: null, mergeStrategy: "replace" }] : [{ keyPath: key === "codex.personality" ? "personality" : "auto_review.policy", value, mergeStrategy: "replace" }],
      expectedVersion: null,
      reloadUserConfig: true
    });
  }
  _refreshProviderConfiguration() {
    return this._providerConfigurationRefresh ??= (async () => {
      try {
        this._providerConfigurationValues = await this._readProviderConfiguration();
        this._providerConfigurationReady = true;
        this._configurationService.updateRootConfig(this._providerConfigurationValues);
      } catch (error) {
        this._logService.warn(`[Codex] Failed to read config.toml: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        this._providerConfigurationRefresh = void 0;
      }
    })();
  }
  _queueProviderConfigurationWrite() {
    if (!this._providerConfigurationReady) {
      return;
    }
    const values = this._configurationService.getRootConfigValues?.() ?? {};
    for (const key of ["codex.personality", "codex.autoReviewPolicy"]) {
      if (values[key] === this._providerConfigurationValues[key]) {
        continue;
      }
      const value = values[key];
      if (value === void 0) {
        continue;
      }
      this._providerConfigurationWrite = this._providerConfigurationWrite.then(async () => {
        if (this._providerConfigurationValues[key] === value) {
          return;
        }
        await this._writeProviderConfiguration(key, value);
        this._providerConfigurationValues[key] = value;
      }).catch((error) => this._logService.error(`[Codex] Failed to update config.toml: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  _readConfigurationValue(config, keyPath) {
    let value = config;
    for (const segment of keyPath.split(".")) {
      if (!value || Array.isArray(value) || typeof value !== "object") {
        return void 0;
      }
      value = value[segment];
    }
    return value;
  }
  _dispatchByThread(threadId, mapFn) {
    const subagent = this._subagentsByThreadId.get(threadId);
    if (subagent) {
      const actions2 = mapFn(subagent.session);
      for (const action of actions2) {
        this._fireSubagent(subagent, action);
      }
      return;
    }
    const sessionId = this._sessionIdByThreadId.get(threadId);
    const session = sessionId ? this._sessions.get(sessionId) : void 0;
    if (!session) {
      this._logService.trace(`[Codex] Ignoring notification for untracked threadId=${threadId}; likely unclaimed prewarm`);
      return;
    }
    const actions = mapFn(session);
    for (const action of actions) {
      this._fire(session.sessionUri, action);
    }
  }
  /**
   * `item/completed` dispatch. In addition to the normal per-thread mapping,
   * a parent session's completed `spawnAgent` collab tool call now carries
   * the child `receiverThreadIds`, so we register each spawned subagent and
   * emit a `subagent_started` signal (before mapping the completion, so the
   * shared orchestrator has attached the subagent-chat block to the parent
   * tool call by the time it completes).
   */
  _dispatchItemCompleted(params) {
    const subagent = this._subagentsByThreadId.get(params.threadId);
    if (subagent) {
      const actions2 = mapItemCompleted(subagent.session.mapState, this._withHostTurnId(subagent.session, params));
      for (const action of actions2) {
        this._fireSubagent(subagent, action);
      }
      return;
    }
    const sessionId = this._sessionIdByThreadId.get(params.threadId);
    const session = sessionId ? this._sessions.get(sessionId) : void 0;
    if (!session) {
      this._logService.trace(`[Codex] Ignoring item/completed for untracked threadId=${params.threadId}; likely unclaimed prewarm`);
      return;
    }
    this._maybeRegisterSubagents(session, params);
    const actions = mapItemCompleted(session.mapState, this._withHostTurnId(session, params));
    for (const action of actions) {
      this._fire(session.sessionUri, action);
    }
  }
  /**
   * `turn/completed` dispatch. For a subagent child thread, route the turn's
   * flush/orphan actions to the peer chat but suppress its `ChatTurnComplete`
   * — the child chat's turn is closed cleanly (without the parent's
   * checkpoint/changeset/title side effects) by the `subagent_completed`
   * signal, which also tears down the child-thread tracking.
   */
  _dispatchTurnCompleted(params) {
    const subagent = this._subagentsByThreadId.get(params.threadId);
    if (subagent) {
      const actions = this._handleTurnCompletedNotification(subagent.session, params);
      for (const action of actions) {
        if (action.type === ActionType.ChatTurnComplete) {
          continue;
        }
        this._fireSubagent(subagent, action);
      }
      this._subagentsByThreadId.delete(params.threadId);
      subagent.session.pendingCommandApprovals.denyAll("decline");
      this._onDidSessionProgress.fire({
        kind: "subagent_completed",
        chat: URI.parse(buildDefaultChatUri(subagent.session.sessionUri)),
        toolCallId: subagent.toolCallId
      });
      this._applyPendingUsageSourceIfIdle();
      return;
    }
    this._dispatchByThread(params.threadId, (s) => this._handleTurnCompletedNotification(s, params));
    this._applyPendingUsageSourceIfIdle();
  }
  /**
   * When a parent session's `spawnAgent` collab tool call completes it
   * carries the child thread id(s) in `receiverThreadIds`. Register an
   * isolated subagent session for each new child thread and emit a
   * `subagent_started` signal so the shared orchestrator opens the read-only
   * peer chat and attaches its discovery block to the parent tool call.
   */
  _maybeRegisterSubagents(session, params) {
    const item = params.item;
    if (item.type !== "collabAgentToolCall" || item.tool !== "spawnAgent") {
      return;
    }
    const entry = session.mapState.itemToToolCall.get(item.id);
    if (!entry) {
      return;
    }
    const parentChat = URI.parse(buildDefaultChatUri(session.sessionUri));
    const model = item.model || void 0;
    const taskDescription = item.prompt || void 0;
    for (const childThreadId of item.receiverThreadIds) {
      if (this._subagentsByThreadId.has(childThreadId)) {
        continue;
      }
      const subSession = this._createSubagentSession(session, childThreadId);
      this._subagentsByThreadId.set(childThreadId, {
        parentSessionId: session.sessionId,
        toolCallId: entry.toolCallId,
        session: subSession
      });
      this._onDidSessionProgress.fire({
        kind: "subagent_started",
        chat: parentChat,
        toolCallId: entry.toolCallId,
        agentName: model ?? "codex",
        agentDisplayName: model ?? "Subagent",
        taskDescription,
        // Codex surfaces the full delegated instruction as `item.prompt`.
        taskPrompt: typeof item.prompt === "string" && item.prompt.length > 0 ? item.prompt : void 0
      });
      this._logService.trace(`[Codex:${session.sessionId}] subagent spawned thread=${childThreadId} toolCall=${entry.toolCallId} model=${model ?? "(default)"}`);
    }
  }
  /**
   * Build an isolated {@link ICodexSession} used to run the shared event
   * mappers for a subagent child thread. It shares the parent's `sessionUri`
   * (so side effects target the parent's working tree and the fired actions
   * resolve to the parent chat channel) and `acceptedForSession` memo (so the
   * accept-for-session decision spans parent + subagents), but has its own
   * fresh map/turn state and approval registry so the child's events don't
   * collide with the parent's.
   */
  _createSubagentSession(parent, childThreadId) {
    const clientToolSet = new ActiveClientToolSet();
    return {
      sessionId: parent.sessionId,
      threadId: childThreadId,
      sessionUri: parent.sessionUri,
      workingDirectory: parent.workingDirectory,
      workingDirectories: parent.workingDirectories,
      multiRootEnabled: parent.multiRootEnabled,
      managedWorkingDirectory: void 0,
      mapState: createCodexSessionMapState(new Set(this._serverToolHost?.toolNames ?? []), clientToolSet),
      pendingCommandApprovals: new PendingRequestRegistry(),
      acceptedForSession: parent.acceptedForSession,
      handledGuardianReviews: /* @__PURE__ */ new Set(),
      pendingGuardianReviewCards: /* @__PURE__ */ new Set(),
      pendingSteeringFlips: /* @__PURE__ */ new Map(),
      clientToolSet,
      pendingClientToolCalls: new PendingRequestRegistry(),
      pendingUserInputs: new PendingRequestRegistry(),
      materializedToolsSig: void 0,
      materializedMcpSig: void 0,
      firstTurnSent: true,
      model: parent.model,
      currentTurnId: void 0,
      turnStopWatch: void 0,
      currentAppTurnId: void 0,
      hostTurnIdByAppTurnId: /* @__PURE__ */ new Map(),
      codexTurnIdByHostTurnId: /* @__PURE__ */ new Map(),
      needsResume: false,
      lastPromptText: "",
      disposed: false,
      materializePromise: void 0,
      materializedEventFired: true,
      prewarmTimer: void 0,
      prewarmClaimed: true,
      serverToolsAdvertised: true,
      mcpController: void 0,
      clientCustomizations: new CodexClientCustomizationStore()
    };
  }
  /**
   * Fire a subagent action tagged with the parent `spawnAgent` tool call.
   * The `resource` is the PARENT chat channel (the key the subagent chat is
   * registered under in the orchestrator); `parentToolCallId` routes the
   * action into the child's read-only peer chat.
   */
  _fireSubagent(subagent, action) {
    this._onDidSessionProgress.fire({
      kind: "action",
      resource: URI.parse(buildDefaultChatUri(subagent.session.sessionUri)),
      action,
      parentToolCallId: subagent.toolCallId
    });
  }
  /**
   * Phase 4: handle `item/commandExecution/requestApproval` from
   * codex. Look up the host-side tool call for the item, emit a
   * `ChatToolCallReady` in PendingConfirmation, park on a deferred
   * keyed by toolCallId, and resolve when the user (or the
   * accept-for-session memo) decides. Unknown sessions / items
   * decline silently so codex stops blocking.
   */
  async _handleCommandApprovalRequestRpc(params) {
    const decision = await this._handleCommandApprovalRequest(params);
    return { result: { decision } };
  }
  async _handleCommandApprovalRequest(params) {
    const target = this._resolveApprovalTarget(params.threadId);
    if (!target) {
      this._logService.warn(`[Codex] commandExecution/requestApproval for unknown threadId=${params.threadId}; declining`);
      return "decline";
    }
    const session = target.session;
    const entry = session.mapState.itemToToolCall.get(params.itemId);
    if (!entry) {
      this._logService.warn(`[Codex:${session.sessionId}] commandExecution/requestApproval for unknown itemId=${params.itemId}; declining`);
      return "decline";
    }
    const command = params.command ?? "";
    const displayCommand = unwrapShellInvocation(command);
    if (command && session.acceptedForSession.has(command)) {
      return "acceptForSession";
    }
    const confirmationTitle = params.reason ?? "Run shell command";
    const decision = await session.pendingCommandApprovals.registerAndFire(entry.toolCallId, () => {
      this._fireApproval(target, {
        type: ActionType.ChatToolCallReady,
        turnId: entry.turnId,
        toolCallId: entry.toolCallId,
        invocationMessage: displayCommand,
        toolInput: displayCommand,
        confirmationTitle
      });
    });
    if (decision === "acceptForSession" && command) {
      session.acceptedForSession.add(command);
    }
    return decision;
  }
  async _handleFileChangeApprovalRequestRpc(params) {
    const decision = await this._requestItemApproval(params.threadId, params.itemId, params.reason ?? "Apply file changes");
    return { result: { decision: narrowFileChangeDecision(decision) } };
  }
  async _handlePermissionsApprovalRequestRpc(params) {
    const decision = await this._requestItemApproval(params.threadId, params.itemId, params.reason ?? "Grant elevated permissions");
    const granted = decision === "accept" || decision === "acceptForSession";
    return {
      result: {
        // Grant exactly what was requested on accept; nothing on decline.
        permissions: granted ? { network: params.permissions.network ?? void 0, fileSystem: params.permissions.fileSystem ?? void 0 } : {},
        scope: decision === "acceptForSession" ? "session" : "turn"
      }
    };
  }
  /**
   * Shared approval flow for item-scoped `requestApproval` requests that
   * don't carry their own command string: look up the host tool call for
   * the item, fire a pending-confirmation `ChatToolCallReady`, and resolve
   * when the user (via {@link respondToPermissionRequest}) decides. Declines
   * if the session or item is unknown.
   */
  async _requestItemApproval(threadId, itemId, confirmationTitle) {
    const target = this._resolveApprovalTarget(threadId);
    if (!target) {
      this._logService.warn(`[Codex] approval request for unknown threadId=${threadId}; declining`);
      return "decline";
    }
    const session = target.session;
    const entry = session.mapState.itemToToolCall.get(itemId);
    if (!entry) {
      this._logService.warn(`[Codex:${session.sessionId}] approval request for unknown itemId=${itemId}; declining`);
      return "decline";
    }
    return session.pendingCommandApprovals.registerAndFire(entry.toolCallId, () => {
      this._fireApproval(target, {
        type: ActionType.ChatToolCallReady,
        turnId: entry.turnId,
        toolCallId: entry.toolCallId,
        invocationMessage: confirmationTitle,
        toolInput: confirmationTitle,
        confirmationTitle
      });
    });
  }
  /**
   * Resolve the {@link ICodexSession} that owns a codex thread for an
   * approval request, plus the subagent wrapper when the thread is a
   * collab-agent child. A subagent tool call's pending-confirmation
   * `ChatToolCallReady` must be fired with the parent `spawnAgent` tool call
   * as its `parentToolCallId` (via {@link _fireApproval}) so it lands in the
   * child's read-only peer chat — where the matching `ChatToolCallStart`
   * lives — instead of on the parent session.
   */
  _resolveApprovalTarget(threadId) {
    const subagent = this._subagentsByThreadId.get(threadId);
    if (subagent) {
      return { session: subagent.session, subagent };
    }
    const sessionId = this._sessionIdByThreadId.get(threadId);
    const session = sessionId ? this._sessions.get(sessionId) : void 0;
    return session ? { session } : void 0;
  }
  /** Fire an approval action to the parent session or the subagent peer chat. */
  _fireApproval(target, action) {
    if (target.subagent) {
      this._fireSubagent(target.subagent, action);
    } else {
      this._fire(target.session.sessionUri, action);
    }
  }
  _handleGuardianWarning(session, params) {
    const turnId = session.currentTurnId;
    if (turnId === void 0) {
      this._logService.trace(`[Codex:${session.sessionId}] guardianWarning without active turn; ignoring`);
      return [];
    }
    return [{
      type: ActionType.ChatResponsePart,
      turnId,
      part: {
        kind: ResponsePartKind.SystemNotification,
        content: params.message
      }
    }];
  }
  async _handleGuardianReviewCompleted(client, params) {
    const sessionId = this._sessionIdByThreadId.get(params.threadId);
    const session = sessionId ? this._sessions.get(sessionId) : void 0;
    if (!session) {
      this._logService.trace(`[Codex] autoApprovalReview/completed for unknown threadId=${params.threadId}; ignoring`);
      return;
    }
    if (params.review.status !== "denied") {
      return;
    }
    if (session.handledGuardianReviews.has(params.reviewId)) {
      return;
    }
    const turnId = this._hostTurnId(session, params.turnId);
    if (session.currentTurnId !== turnId) {
      this._logService.trace(`[Codex:${sessionId}] autoApprovalReview/completed for non-current turn ${turnId} (current=${session.currentTurnId ?? "(none)"}); ignoring reviewId=${params.reviewId}`);
      return;
    }
    session.handledGuardianReviews.add(params.reviewId);
    const summary = summarizeGuardianReviewAction(params.action);
    this._fire(session.sessionUri, {
      type: ActionType.ChatResponsePart,
      turnId,
      part: {
        kind: ResponsePartKind.Markdown,
        id: generateUuid(),
        content: formatGuardianDenialNotification(summary, params.review.rationale)
      }
    });
    const toolCallId = generateUuid();
    const invocationMessage = summary.detail || summary.title;
    const confirmationTitle = "Approve anyway";
    session.pendingGuardianReviewCards.add(toolCallId);
    let decision;
    try {
      decision = await session.pendingCommandApprovals.registerAndFire(toolCallId, () => {
        this._fire(session.sessionUri, {
          type: ActionType.ChatToolCallStart,
          turnId,
          toolCallId,
          toolName: "auto_review_denied",
          displayName: summary.title,
          intention: invocationMessage
        });
        this._fire(session.sessionUri, {
          type: ActionType.ChatToolCallReady,
          turnId,
          toolCallId,
          invocationMessage,
          confirmationTitle
        });
      });
    } catch (err) {
      this._logService.trace(`[Codex:${sessionId}] guardian approval cancelled for reviewId=${params.reviewId}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    } finally {
      session.pendingGuardianReviewCards.delete(toolCallId);
    }
    if (decision !== "accept" && decision !== "acceptForSession") {
      return;
    }
    if (session.currentTurnId !== turnId) {
      this._logService.trace(`[Codex:${sessionId}] turn ended before guardian approval could be applied for reviewId=${params.reviewId}`);
      return;
    }
    try {
      await client.request("thread/approveGuardianDeniedAction", {
        threadId: params.threadId,
        event: toGuardianAssessmentEventJson(params)
      });
      this._fire(session.sessionUri, {
        type: ActionType.ChatToolCallComplete,
        turnId,
        toolCallId,
        result: {
          success: true,
          pastTenseMessage: "Approved anyway"
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._logService.warn(`[Codex:${sessionId}] approveGuardianDeniedAction failed for reviewId=${params.reviewId}: ${message}`);
      this._fire(session.sessionUri, {
        type: ActionType.ChatToolCallComplete,
        turnId,
        toolCallId,
        result: {
          success: false,
          pastTenseMessage: "Approval failed",
          error: { message }
        }
      });
    }
  }
  _handleConnectionLost() {
    const conn = this._connection;
    if (conn.kind !== "ready") {
      return;
    }
    this._connection = { kind: "idle" };
    for (const session of this._sessions.values()) {
      session.pendingCommandApprovals.denyAll("decline");
      session.pendingClientToolCalls.rejectAll(new CancellationError());
      session.pendingUserInputs.rejectAll(new CancellationError());
      this._drainPendingSteering(session);
      const turnId = session.currentTurnId;
      const appTurnId = session.currentAppTurnId;
      session.currentTurnId = void 0;
      session.currentAppTurnId = void 0;
      if (appTurnId) {
        session.hostTurnIdByAppTurnId.delete(appTurnId);
      }
      if (turnId) {
        const duration = this._clearTurnStopWatch(session);
        this._fire(session.sessionUri, {
          type: ActionType.ChatError,
          turnId,
          duration,
          error: { errorType: "CodexDisconnected", message: "Codex app-server disconnected; session must restart." }
        });
        this._fire(session.sessionUri, { type: ActionType.ChatTurnComplete, turnId, duration });
      }
    }
    for (const subagent of this._subagentsByThreadId.values()) {
      subagent.session.pendingCommandApprovals.denyAll("decline");
      subagent.session.pendingClientToolCalls.rejectAll(new CancellationError());
      subagent.session.pendingUserInputs.rejectAll(new CancellationError());
      subagent.session.currentTurnId = void 0;
      subagent.session.currentAppTurnId = void 0;
    }
    this._subagentsByThreadId.clear();
    this._applyPendingUsageSourceIfIdle();
    try {
      conn.client.dispose();
    } catch (err) {
      this._logService.error(`[Codex] Failed to dispose app-server client after connection lost: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      conn.proxyHandle?.dispose();
    } catch (err) {
      this._logService.error(`[Codex] Failed to dispose proxy handle after connection lost: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  _disposeConnection() {
    const connection = this._connection;
    this._connectionGeneration++;
    this._connection = { kind: "idle" };
    if (connection.kind !== "ready") {
      return;
    }
    try {
      connection.client.dispose();
    } catch {
    }
    try {
      connection.proxyHandle?.dispose();
    } catch {
    }
    try {
      connection.child.kill("SIGKILL");
    } catch {
    }
  }
  // #endregion
  // #region IAgent methods
  getDescriptor() {
    return {
      provider: this.id,
      displayName: localize("codexAgent.displayName", "Codex"),
      description: this._usageSource === "openai" ? localize("codexAgent.description.openai", "Codex agent using your OpenAI account") : localize("codexAgent.description.copilot", "Codex agent using GitHub Copilot"),
      ...this._isMultiRootEnabled() ? { capabilities: { multipleWorkingDirectories: { immutablePrimary: true } } } : {}
    };
  }
  _isMultiRootEnabled() {
    return this._configurationService.getRootValue(platformRootSchema, AgentHostCodexMultiRootEnabledConfigKey) === true;
  }
  _sessionUriFromChat(chat) {
    const parsed = parseChatUri(chat);
    return parsed ? URI.parse(parsed.session) : chat;
  }
  async createSession(config = {}) {
    this._logService.info(`[Codex DEBUG] createSession usageSource=${this._usageSource} accountStatus=${codexAccountStateForUsageSource(this._usageSource, this._openAIAccountState).status} session=${config.session?.toString() ?? "(none)"} model=${config.model?.id ?? "(none)"} cwd=${config.workingDirectories?.[0]?.toString() ?? "(none)"}`);
    let validation = this._usageSourceValidation;
    await validation;
    while (validation !== this._usageSourceValidation) {
      validation = this._usageSourceValidation;
      await validation;
    }
    this._ensureAuthenticated();
    if (config.fork) {
      return this._forkSession(config, config.fork);
    }
    const effectiveModel = this._supportedModelOrUndefined(config.model);
    const sessionId = config.session ? AgentSession.id(config.session) : generateUuid();
    const sessionUri = config.session ?? AgentSession.uri(this.id, sessionId);
    const multiRootEnabled = this._isMultiRootEnabled();
    const workingDirectories = multiRootEnabled && (config.workingDirectories?.length ?? 0) > 1 ? distinctWorkingDirectories(config.workingDirectories) : void 0;
    const existing = this._sessions.get(sessionId);
    if (existing) {
      existing.model = effectiveModel ?? existing.model;
      const cwd = existing.workingDirectory ?? config.workingDirectories?.[0];
      return {
        session: sessionUri,
        resolvedWorkingDirectory: cwd,
        provisional: existing.threadId === void 0
      };
    }
    const clientToolSet = new ActiveClientToolSet();
    const session = {
      sessionId,
      threadId: void 0,
      sessionUri,
      workingDirectory: config.workingDirectories?.[0],
      workingDirectories,
      multiRootEnabled,
      managedWorkingDirectory: void 0,
      mapState: createCodexSessionMapState(new Set(this._serverToolHost?.toolNames ?? []), clientToolSet),
      pendingCommandApprovals: new PendingRequestRegistry(),
      acceptedForSession: /* @__PURE__ */ new Set(),
      handledGuardianReviews: /* @__PURE__ */ new Set(),
      pendingGuardianReviewCards: /* @__PURE__ */ new Set(),
      pendingSteeringFlips: /* @__PURE__ */ new Map(),
      clientToolSet,
      pendingClientToolCalls: new PendingRequestRegistry(),
      pendingUserInputs: new PendingRequestRegistry(),
      materializedToolsSig: void 0,
      materializedMcpSig: void 0,
      firstTurnSent: false,
      model: effectiveModel,
      currentTurnId: void 0,
      turnStopWatch: void 0,
      currentAppTurnId: void 0,
      hostTurnIdByAppTurnId: /* @__PURE__ */ new Map(),
      codexTurnIdByHostTurnId: /* @__PURE__ */ new Map(),
      needsResume: false,
      lastPromptText: "",
      disposed: false,
      materializePromise: void 0,
      materializedEventFired: false,
      prewarmTimer: void 0,
      prewarmClaimed: false,
      serverToolsAdvertised: false,
      mcpController: void 0,
      clientCustomizations: new CodexClientCustomizationStore()
    };
    this._sessions.set(sessionId, session);
    this._schedulePrewarm(session);
    return {
      session: sessionUri,
      resolvedWorkingDirectory: config.workingDirectories?.[0],
      provisional: true
    };
  }
  /**
   * Build an {@link ICodexSession} entry for a thread that already exists on
   * the app-server (a restored session or a freshly forked one). Such a
   * session skips materialization — its first {@link _sendMessage} issues a
   * `thread/resume` (`needsResume: true`) — so the prewarm/first-turn flags
   * are pre-set to their post-materialization values.
   */
  _createResumedSessionEntry(sessionId, threadId, sessionUri, workingDirectory, model, workingDirectories, multiRootEnabled) {
    const clientToolSet = new ActiveClientToolSet();
    const effectiveWorkingDirectories = distinctWorkingDirectories(workingDirectories);
    return {
      sessionId,
      threadId,
      sessionUri,
      workingDirectory,
      workingDirectories: effectiveWorkingDirectories,
      multiRootEnabled: multiRootEnabled ?? (effectiveWorkingDirectories?.length ?? 0) > 1,
      managedWorkingDirectory: void 0,
      mapState: createCodexSessionMapState(new Set(this._serverToolHost?.toolNames ?? []), clientToolSet),
      pendingCommandApprovals: new PendingRequestRegistry(),
      acceptedForSession: /* @__PURE__ */ new Set(),
      handledGuardianReviews: /* @__PURE__ */ new Set(),
      pendingGuardianReviewCards: /* @__PURE__ */ new Set(),
      pendingSteeringFlips: /* @__PURE__ */ new Map(),
      clientToolSet,
      pendingClientToolCalls: new PendingRequestRegistry(),
      pendingUserInputs: new PendingRequestRegistry(),
      materializedToolsSig: void 0,
      materializedMcpSig: void 0,
      firstTurnSent: true,
      model,
      currentTurnId: void 0,
      turnStopWatch: void 0,
      currentAppTurnId: void 0,
      hostTurnIdByAppTurnId: /* @__PURE__ */ new Map(),
      codexTurnIdByHostTurnId: /* @__PURE__ */ new Map(),
      needsResume: true,
      lastPromptText: "",
      disposed: false,
      materializePromise: void 0,
      materializedEventFired: true,
      prewarmTimer: void 0,
      prewarmClaimed: true,
      serverToolsAdvertised: false,
      mcpController: void 0,
      clientCustomizations: new CodexClientCustomizationStore()
    };
  }
  /**
   * Fork an existing codex session at a turn into a brand-new session.
   *
   * Codex is single-chat, so the workbench routes the "fork conversation"
   * gesture here (via {@link AgentHostSessionHandler}) instead of minting a
   * peer chat. We `thread/fork` the source thread — which copies its full
   * history — then `thread/rollback` the trailing turns so the fork retains
   * only the turns up to and including `fork.turnId`. The forked thread is
   * registered as a resumable session (its first send issues a
   * `thread/resume`) keyed by its new thread id, preserving the Codex
   * convention that a session id equals its thread id.
   */
  async _forkSession(config, fork) {
    const sourceRead = await this._readSession(fork.session);
    if (!sourceRead) {
      throw new Error(`Cannot fork codex session ${fork.session.toString()}: source thread could not be read`);
    }
    const sourceThreadId = sourceRead.thread.id;
    const sourceTurns = sourceRead.thread.turns ?? [];
    const sourceSession = this._sessions.get(AgentSession.id(fork.session));
    const sourcePrimary = sourceRead.thread.cwd ? URI.file(sourceRead.thread.cwd) : config.workingDirectories?.[0];
    const sourceStoredWorkingDirectories = sourceSession?.workingDirectories ?? sourceRead.persistedWorkingDirectories;
    const inheritedWorkingDirectories = sourcePrimary ? distinctWorkingDirectories([sourcePrimary, ...sourceStoredWorkingDirectories?.slice(1) ?? []]) : void 0;
    const multiRootEnabled = sourceSession?.multiRootEnabled ?? (inheritedWorkingDirectories?.length ?? 0) > 1;
    const runtimeWorkspaceRoots = multiRootEnabled && inheritedWorkingDirectories && inheritedWorkingDirectories.length > 1 ? distinctAbsolutePaths(inheritedWorkingDirectories.map((directory) => directory.fsPath)) : void 0;
    const codexTurnId = sourceSession?.codexTurnIdByHostTurnId.get(fork.turnId) ?? fork.turnId;
    const boundary = resolveForkBoundary(sourceTurns.map((t) => t.id), codexTurnId, fork.turnIndex);
    if (!boundary.resolved) {
      throw new Error(`Cannot fork codex session ${sourceThreadId}: unable to resolve fork boundary for turn ${fork.turnId} (turnIndex=${fork.turnIndex}, turns=${sourceTurns.length})`);
    }
    const { keepThroughIndex, numTurnsToDrop } = boundary;
    const conn = await this._ensureConnection();
    const model = this._supportedModelOrUndefined(config.model);
    const sourceConfigValues = this._configurationService.getSessionConfigValues(fork.session.toString());
    const forkDefaults = {
      approvalPolicy: codexSessionConfigDefaults[CodexSessionConfigKey.ApprovalPolicy],
      sandboxMode: codexSessionConfigDefaults[CodexSessionConfigKey.SandboxMode]
    };
    const { approvalPolicy, sandboxMode, approvalsReviewer } = resolveCodexPermissions(
      migrateCodexPermissionValues({ ...sourceConfigValues, ...config.config }, forkDefaults),
      forkDefaults
    );
    const forkResult = await conn.client.request("thread/fork", {
      threadId: sourceThreadId,
      ...runtimeWorkspaceRoots?.length ? {
        cwd: runtimeWorkspaceRoots[0],
        runtimeWorkspaceRoots
      } : {},
      ...model ? { model: model.id } : {},
      approvalPolicy,
      sandbox: sandboxMode,
      approvalsReviewer
    });
    const newThreadId = forkResult.thread.id;
    if (numTurnsToDrop > 0) {
      try {
        await conn.client.request("thread/rollback", { threadId: newThreadId, numTurns: numTurnsToDrop });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this._logService.warn(`[Codex:${newThreadId}] fork rollback failed (numTurns=${numTurnsToDrop}); discarding fork: ${message}`);
        try {
          await conn.client.request("thread/archive", { threadId: newThreadId });
        } catch (archiveErr) {
          this._logService.warn(`[Codex:${newThreadId}] failed to archive orphaned fork after rollback failure: ${archiveErr instanceof Error ? archiveErr.message : String(archiveErr)}`);
        }
        throw new Error(`Failed to fork codex session ${sourceThreadId}: could not roll back forked thread ${newThreadId} to the requested turn (${message})`);
      }
    }
    const newSessionUri = AgentSession.uri(this.id, newThreadId);
    const workingDirectory = forkResult.cwd ? URI.file(forkResult.cwd) : sourceRead.thread.cwd ? URI.file(sourceRead.thread.cwd) : config.workingDirectories?.[0];
    const forkWorkingDirectories = multiRootEnabled ? distinctWorkingDirectories(
      forkResult.runtimeWorkspaceRoots?.length ? forkResult.runtimeWorkspaceRoots.map((path) => URI.file(path)) : inheritedWorkingDirectories
    ) : void 0;
    const session = this._createResumedSessionEntry(newThreadId, newThreadId, newSessionUri, workingDirectory, model, forkWorkingDirectories, multiRootEnabled);
    this._sessions.set(newThreadId, session);
    this._sessionIdByThreadId.set(newThreadId, newThreadId);
    if (!session.serverToolsAdvertised && this._serverToolHost) {
      session.serverToolsAdvertised = true;
      this._serverToolHost.advertise(session.sessionUri.toString());
    }
    this._persistMaterializedSession(session);
    if (fork.turnIdMapping && fork.turnIdMapping.size > 0) {
      try {
        const forkedRead = await this._readSession(newSessionUri);
        const forkedTurns = forkedRead?.thread.turns ?? [];
        const entries = planForkedTurnIdMap(
          sourceTurns.map((t) => t.id),
          forkedTurns.map((t) => t.id),
          keepThroughIndex,
          sourceSession?.hostTurnIdByAppTurnId,
          fork.turnIdMapping
        );
        for (const [hostTurnId, forkedCodexTurnId] of entries) {
          session.codexTurnIdByHostTurnId.set(hostTurnId, forkedCodexTurnId);
        }
      } catch (err) {
        this._logService.warn(`[Codex:${newThreadId}] failed to seed forked turn-id map: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    this._logService.info(`[Codex] forked session ${sourceThreadId} \u2192 ${newThreadId} (kept ${sourceTurns.length - numTurnsToDrop}/${sourceTurns.length} turns)`);
    return {
      session: newSessionUri,
      resolvedWorkingDirectory: workingDirectory,
      provisional: false
    };
  }
  /**
   * Lazily start (or resume) a codex thread for `session`. Idempotent:
   * if `threadId` is already populated, just returns. Called from
   * `sendMessage` before the first `turn/start`.
   */
  async _materializeIfNeeded(session, fireMaterializedEvent = true) {
    if (session.disposed) {
      return;
    }
    if (session.threadId !== void 0) {
      if (fireMaterializedEvent) {
        this._fireMaterialized(session);
      }
      return;
    }
    if (session.materializePromise) {
      await session.materializePromise;
      if (fireMaterializedEvent) {
        this._fireMaterialized(session);
      }
      return;
    }
    session.materializePromise = this._materialize(session).finally(() => {
      session.materializePromise = void 0;
    });
    await session.materializePromise;
    if (fireMaterializedEvent) {
      this._fireMaterialized(session);
    }
  }
  async _materialize(session) {
    if (session.disposed) {
      return;
    }
    if (!session.workingDirectory) {
      const dir = join(os.tmpdir(), "vscode-agent-codex", session.sessionId);
      await fs.promises.mkdir(dir, { recursive: true });
      session.workingDirectory = URI.file(dir);
      session.managedWorkingDirectory = session.workingDirectory;
      this._logService.info(`[Codex] no working directory supplied for session=${session.sessionUri.toString()}; using managed temp folder ${dir}`);
    }
    const conn = await this._ensureConnection();
    const config = this._readSessionConfig(session);
    const model = await this._resolveModel(session);
    const { approvalPolicy, sandboxMode, approvalsReviewer } = this._resolveSessionPermissions(session);
    const mcpServers = this._buildSessionMcpServers(session);
    const threadConfig = {
      web_search: narrowWebSearchMode(config[CodexSessionConfigKey.WebSearchMode]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.WebSearchMode]
    };
    const mcpServerNames = Object.keys(mcpServers);
    if (mcpServerNames.length > 0) {
      threadConfig.mcp_servers = mcpServers;
      this._logService.info(`[Codex] thread/start for session=${session.sessionUri.toString()} with ${mcpServerNames.length} MCP server(s): ${mcpServerNames.join(", ")}`);
    }
    const multiRootActive = this._isMultiRootActive(session);
    const runtimeWorkspaceRoots = multiRootActive ? this._runtimeWorkspaceRoots(session) : void 0;
    const startResult = await conn.client.request("thread/start", {
      cwd: session.workingDirectory.fsPath,
      ...runtimeWorkspaceRoots?.length ? { runtimeWorkspaceRoots } : {},
      model: model.id,
      approvalPolicy,
      sandbox: sandboxMode,
      approvalsReviewer,
      config: threadConfig,
      dynamicTools: this._buildDynamicTools(session)
    });
    const threadId = startResult.thread.id;
    if (multiRootActive && !session.workingDirectories && startResult.runtimeWorkspaceRoots?.length) {
      session.workingDirectories = startResult.runtimeWorkspaceRoots.map((path) => URI.file(path));
      session.workingDirectory = session.workingDirectories[0];
    }
    if (session.disposed) {
      try {
        await conn.client.request("thread/unsubscribe", { threadId });
      } catch (err) {
        this._logService.info(`[Codex:${threadId}] thread/unsubscribe after disposed prewarm failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }
    session.threadId = threadId;
    session.materializedMcpSig = mcpServersSignature(mcpServers);
    session.materializedToolsSig = toolsSignature(session.clientToolSet.merged());
    this._logService.info(`[Codex DEBUG] materialized session=${session.sessionUri.toString()} threadId=${session.threadId}`);
    this._sessionIdByThreadId.set(session.threadId, session.sessionId);
    if (!session.serverToolsAdvertised && this._serverToolHost) {
      session.serverToolsAdvertised = true;
      this._serverToolHost.advertise(session.sessionUri.toString());
    }
    void this._refreshSkillHookCustomizations(session);
    void this._refreshSkillExtraRoots();
  }
  /**
   * Tear down the current codex thread and start a fresh one so the
   * session's current client tools are registered as `dynamicTools`.
   * Only safe before any turn has committed history on the thread.
   */
  async _restartThreadWithCurrentTools(session) {
    const conn = this._connection;
    const oldThreadId = session.threadId;
    this._logService.info(`[Codex:${session.sessionId}] restarting thread ${oldThreadId} to apply client tools [${session.clientToolSet.merged().map((t) => t.name).join(", ") || "(none)"}]`);
    if (conn.kind === "ready" && oldThreadId !== void 0) {
      this._sessionIdByThreadId.delete(oldThreadId);
      try {
        await conn.client.request("thread/unsubscribe", { threadId: oldThreadId });
      } catch (err) {
        this._logService.info(`[Codex:${oldThreadId}] thread/unsubscribe during tool restart failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    session.threadId = void 0;
    session.materializePromise = void 0;
    await this._materializeIfNeeded(session);
  }
  _fireMaterialized(session) {
    if (session.disposed) {
      return;
    }
    if (session.materializedEventFired) {
      return;
    }
    session.materializedEventFired = true;
    this._onDidMaterializeSession.fire({
      session: session.sessionUri,
      project: void 0,
      workingDirectories: session.workingDirectories ?? (session.workingDirectory ? [session.workingDirectory] : void 0)
    });
  }
  _schedulePrewarm(session) {
    if (!session.workingDirectory) {
      return;
    }
    if (this._configurationService.isWorkingDirectoryPending(session.sessionUri.toString())) {
      return;
    }
    void (async () => {
      if (!await this._agentSdkDownloader.isSdkResolvableWithoutDownload(CodexSdkPackage)) {
        this._logService.info(`[Codex] SDK not downloaded yet; skipping prewarm for session=${session.sessionUri.toString()} until a message triggers the download`);
        return;
      }
      await this._materializeIfNeeded(session, false);
      if (session.prewarmClaimed || session.threadId === void 0) {
        return;
      }
      this._logService.info(`[Codex] prewarm ready session=${session.sessionUri.toString()} threadId=${session.threadId}`);
      const prewarmTimer = setTimeout(() => {
        void this._expirePrewarm(session);
      }, CodexPrewarmTtlMs);
      session.prewarmTimer = prewarmTimer;
    })().catch((err) => {
      this._logService.warn(`[Codex] prewarm failed session=${session.sessionUri.toString()}: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
  async _expirePrewarm(session) {
    if (session.disposed || session.prewarmClaimed || session.threadId === void 0) {
      return;
    }
    const threadId = session.threadId;
    session.threadId = void 0;
    this._sessionIdByThreadId.delete(threadId);
    try {
      const conn = await this._ensureConnection();
      await conn.client.request("thread/unsubscribe", { threadId });
      this._logService.info(`[Codex] prewarm TTL eviction session=${session.sessionUri.toString()} threadId=${threadId}`);
    } catch (err) {
      this._logService.warn(`[Codex] prewarm TTL eviction failed session=${session.sessionUri.toString()} threadId=${threadId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  _persistMaterializedSession(session) {
    if (session.disposed || !session.threadId) {
      return;
    }
    const multiRootActive = this._isMultiRootActive(session);
    const fields = {
      threadId: session.threadId,
      cwd: session.workingDirectory,
      modelId: session.model?.id,
      workingDirectories: multiRootActive ? session.workingDirectories : void 0
    };
    void this._metadataStore.write(session.sessionUri, fields);
    if (multiRootActive) {
      const canonicalSessionUri = AgentSession.uri(this.id, session.threadId);
      if (!isEqual(session.sessionUri, canonicalSessionUri)) {
        void this._metadataStore.write(canonicalSessionUri, fields);
      }
    }
  }
  _claimPrewarm(session) {
    session.prewarmClaimed = true;
    if (session.prewarmTimer) {
      clearTimeout(session.prewarmTimer);
      session.prewarmTimer = void 0;
    }
  }
  async _adoptWorkingDirectoryBeforeSend(session, workingDirectory) {
    if (!workingDirectory || isEqual(session.workingDirectory, workingDirectory)) {
      return;
    }
    if (session.prewarmClaimed) {
      if (session.threadId === void 0 && !session.materializePromise) {
        session.workingDirectory = workingDirectory;
        if (this._isMultiRootActive(session)) {
          session.workingDirectories = distinctWorkingDirectories([
            workingDirectory,
            ...session.workingDirectories?.slice(1) ?? []
          ]);
        }
      }
      return;
    }
    this._claimPrewarm(session);
    const materializePromise = session.materializePromise;
    if (materializePromise) {
      try {
        await materializePromise;
      } catch (err) {
        this._logService.info(`[Codex] stale prewarm failed before working directory changed for session=${session.sessionUri.toString()}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const threadId = session.threadId;
    if (threadId !== void 0) {
      session.threadId = void 0;
      this._sessionIdByThreadId.delete(threadId);
      const conn = this._connection;
      if (conn.kind === "ready") {
        try {
          await conn.client.request("thread/unsubscribe", { threadId });
        } catch (err) {
          this._logService.warn(`[Codex] stale prewarm unsubscribe failed session=${session.sessionUri.toString()} threadId=${threadId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    session.workingDirectory = workingDirectory;
  }
  _startTurnStopWatch(session) {
    const stopWatch = StopWatch.create(false);
    session.turnStopWatch = stopWatch;
    return stopWatch;
  }
  _clearTurnStopWatch(session) {
    const elapsed = session.turnStopWatch?.elapsed();
    session.turnStopWatch = void 0;
    return typeof elapsed === "number" && Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  }
  async _sendMessage(chat, prompt, attachments, turnId, workingDirectories) {
    const sessionUri = this._sessionUriFromChat(chat);
    this._logService.info(`[Codex DEBUG] sendMessage session=${sessionUri.toString()} prompt=${JSON.stringify(prompt).slice(0, 60)}`);
    const sessionId = AgentSession.id(sessionUri);
    const session = this._sessions.get(sessionId);
    if (!session) {
      throw new Error(`Codex session not found: ${sessionUri.toString()}`);
    }
    await this._adoptWorkingDirectoryBeforeSend(session, workingDirectories?.[0]);
    if (workingDirectories) {
      session.workingDirectories = session.multiRootEnabled && workingDirectories.length > 1 ? distinctWorkingDirectories([
        session.workingDirectory ?? workingDirectories[0],
        ...workingDirectories.slice(1)
      ]) : workingDirectories;
    }
    const conn = await this._ensureConnection();
    const effectiveTurnId = turnId ?? generateUuid();
    try {
      this._claimPrewarm(session);
      await this._materializeIfNeeded(session);
      this._persistMaterializedSession(session);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._logService.error(`[Codex:${sessionId}] materialize failed: ${message}`);
      const duration = this._clearTurnStopWatch(session);
      this._fire(sessionUri, {
        type: ActionType.ChatError,
        turnId: effectiveTurnId,
        duration,
        error: { errorType: "CodexMaterializeFailed", message }
      });
      this._fire(sessionUri, { type: ActionType.ChatTurnComplete, turnId: effectiveTurnId, duration });
      return;
    }
    const toolsChanged = toolsSignature(session.clientToolSet.merged()) !== session.materializedToolsSig;
    const mcpChanged = mcpServersSignature(this._buildSessionMcpServers(session)) !== session.materializedMcpSig;
    if (!session.firstTurnSent && !session.needsResume && (toolsChanged || mcpChanged)) {
      try {
        await this._restartThreadWithCurrentTools(session);
        this._persistMaterializedSession(session);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this._logService.error(`[Codex:${sessionId}] tool re-materialize failed: ${message}`);
        const duration = this._clearTurnStopWatch(session);
        this._fire(sessionUri, {
          type: ActionType.ChatError,
          turnId: effectiveTurnId,
          duration,
          error: { errorType: "CodexMaterializeFailed", message }
        });
        this._fire(sessionUri, { type: ActionType.ChatTurnComplete, turnId: effectiveTurnId, duration });
        return;
      }
    }
    const threadId = session.threadId;
    if (session.needsResume) {
      try {
        const mcpServers = this._buildSessionMcpServers(session);
        const multiRootActive = this._isMultiRootActive(session);
        const runtimeWorkspaceRoots = multiRootActive ? this._runtimeWorkspaceRoots(session) : void 0;
        const resumeResult = await conn.client.request(
          "thread/resume",
          buildCodexResumeParams(this._usageSource, threadId, mcpServers, runtimeWorkspaceRoots)
        );
        if (multiRootActive && !session.workingDirectories && resumeResult.runtimeWorkspaceRoots?.length) {
          session.workingDirectories = resumeResult.runtimeWorkspaceRoots.map((path) => URI.file(path));
          session.workingDirectory = session.workingDirectories[0];
        }
        session.materializedMcpSig = mcpServersSignature(mcpServers);
        session.needsResume = false;
      } catch (err) {
        const duration = this._clearTurnStopWatch(session);
        this._fire(sessionUri, {
          type: ActionType.ChatError,
          turnId: effectiveTurnId,
          duration,
          error: {
            errorType: "CodexResumeFailed",
            message: err instanceof Error ? err.message : String(err)
          }
        });
        this._fire(sessionUri, { type: ActionType.ChatTurnComplete, turnId: effectiveTurnId, duration });
        return;
      }
    }
    const { input, cleanupPaths } = resolveCodexInput(prompt, attachments);
    session.lastPromptText = prompt;
    session.currentTurnId = effectiveTurnId;
    this._startTurnStopWatch(session);
    try {
      const model = await this._resolveModel(session);
      const turnOptions = this._turnStartOptions(session, model.id);
      await conn.client.request("turn/start", {
        threadId,
        input: input.slice(),
        model: model.id,
        ...turnOptions
      });
      session.firstTurnSent = true;
    } catch (err) {
      if (err instanceof CancellationError) {
        this._fire(sessionUri, { type: ActionType.ChatTurnCancelled, turnId: effectiveTurnId, duration: this._clearTurnStopWatch(session) });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this._logService.error(`[Codex:${sessionId}] turn/start error: ${message}`);
      const duration = this._clearTurnStopWatch(session);
      this._fire(sessionUri, {
        type: ActionType.ChatError,
        turnId: effectiveTurnId,
        duration,
        error: { errorType: "CodexTurnError", ...extractForwardedErrorInfo(message) }
      });
      this._fire(sessionUri, { type: ActionType.ChatTurnComplete, turnId: effectiveTurnId, duration });
    } finally {
      if (cleanupPaths.length > 0) {
        setTimeout(() => {
          for (const p of cleanupPaths) {
            try {
              fs.unlinkSync(p);
            } catch {
            }
          }
        }, 3e4);
      }
    }
  }
  setPendingMessages(chat, steeringMessage, _queuedMessages) {
    if (!steeringMessage) {
      return;
    }
    const sessionUri = this._sessionUriFromChat(chat);
    const sessionId = AgentSession.id(sessionUri);
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    if (session.pendingSteeringFlips.has(steeringMessage.id)) {
      return;
    }
    const appTurnId = session.currentAppTurnId;
    const conn = this._connection;
    const text = steeringMessage.message.text;
    const hasContent = text.length > 0 || (steeringMessage.message.attachments?.length ?? 0) > 0;
    if (!appTurnId || conn.kind !== "ready" || session.threadId === void 0 || !hasContent) {
      this._fireSteeringConsumed(session, steeringMessage.id);
      return;
    }
    const { input } = resolveCodexInput(text, steeringMessage.message.attachments);
    const threadId = session.threadId;
    session.pendingSteeringFlips.set(steeringMessage.id, steeringMessage);
    void conn.client.request("turn/steer", {
      threadId,
      input: input.slice(),
      expectedTurnId: appTurnId
    }).catch((err) => {
      if (session.pendingSteeringFlips.delete(steeringMessage.id)) {
        this._fireSteeringConsumed(session, steeringMessage.id);
      }
      if (err instanceof JsonRpcError) {
        this._logService.info(`[Codex:${sessionId}] turn/steer skipped: ${err.message}`);
        return;
      }
      this._logService.warn(`[Codex:${sessionId}] turn/steer failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
  async _abort(chat) {
    const sessionUri = this._sessionUriFromChat(chat);
    const sessionId = AgentSession.id(sessionUri);
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    this._drainPendingSteering(session);
    if (!session.currentAppTurnId || session.threadId === void 0) {
      return;
    }
    const threadId = session.threadId;
    const conn = this._connection;
    if (conn.kind !== "ready") {
      return;
    }
    try {
      await conn.client.request("turn/interrupt", {
        threadId,
        turnId: session.currentAppTurnId
      });
    } catch (err) {
      this._logService.warn(`[Codex:${sessionId}] turn/interrupt failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  async disposeSession(sessionUri) {
    this._logService.info(`[Codex DEBUG] disposeSession session=${sessionUri.toString()}`);
    const sessionId = AgentSession.id(sessionUri);
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    await this._teardownSessionInMemory(session, sessionId);
  }
  /**
   * Non-destructive counterpart to {@link disposeSession}: releases the
   * session's in-memory resources but keeps its codex thread resumable — the
   * on-disk rollout is preserved and the shared codex process stays alive, so
   * the session transparently resumes on the next access. Used by idle-session
   * eviction to bound memory in long-lived host processes.
   *
   * No-ops for sessions that have nothing durable to resume from (provisional
   * sessions whose codex thread was never started) and for sessions with a
   * turn in flight — `thread/unsubscribe` mid-turn would drop live progress.
   */
  async releaseSession(sessionUri) {
    const sessionId = AgentSession.id(sessionUri);
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    if (session.threadId === void 0) {
      return;
    }
    if (session.currentTurnId !== void 0) {
      return;
    }
    this._logService.info(`[Codex:${session.threadId}] Releasing idle session from memory (durable state preserved)`);
    await this._teardownSessionInMemory(session, sessionId);
  }
  /**
   * Shared in-memory teardown for a codex session: drops the tracked entry,
   * disposes its MCP controller, unparks pending approvals / client tool calls
   * / user inputs, and unsubscribes the codex thread (`thread/unsubscribe`).
   * Non-destructive — the codex thread's on-disk rollout is preserved, so the
   * session can be resumed later. Shared by {@link disposeSession} (which the
   * orchestrator pairs with durable deletion) and the non-destructive
   * {@link releaseSession}.
   */
  async _teardownSessionInMemory(session, sessionId) {
    session.disposed = true;
    this._claimPrewarm(session);
    this._sessions.delete(sessionId);
    session.mcpController?.dispose();
    if (!session.clientCustomizations.isEmpty()) {
      void this._refreshSkillExtraRoots();
    }
    if (session.managedWorkingDirectory) {
      const dir = session.managedWorkingDirectory.fsPath;
      fs.promises.rm(dir, { recursive: true, force: true }).catch((err) => {
        this._logService.info(`[Codex] failed to remove managed temp folder ${dir}: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
    if (session.threadId !== void 0) {
      this._sessionIdByThreadId.delete(session.threadId);
    }
    session.pendingCommandApprovals.denyAll("decline");
    session.pendingClientToolCalls.rejectAll(new CancellationError());
    session.pendingUserInputs.rejectAll(new CancellationError());
    this._drainPendingSteering(session);
    for (const [childThreadId, subagent] of this._subagentsByThreadId) {
      if (subagent.parentSessionId === sessionId) {
        subagent.session.pendingCommandApprovals.denyAll("decline");
        this._subagentsByThreadId.delete(childThreadId);
      }
    }
    const conn = this._connection;
    if (conn.kind === "ready" && session.threadId !== void 0) {
      const threadId = session.threadId;
      try {
        await conn.client.request("thread/unsubscribe", { threadId });
      } catch (err) {
        this._logService.info(`[Codex:${threadId}] thread/unsubscribe failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  async _changeModel(chat, model) {
    const sessionUri = this._sessionUriFromChat(chat);
    const session = this._sessions.get(AgentSession.id(sessionUri));
    if (session) {
      const supported = this._supportedModelOrUndefined(model);
      if (supported) {
        session.model = supported;
      }
    }
  }
  async truncateSession(sessionUri, turnId) {
    const read = await this._readSession(sessionUri);
    if (!read) {
      return;
    }
    const turns = read.thread.turns ?? [];
    if (turns.length === 0) {
      return;
    }
    let numTurns;
    if (turnId === void 0) {
      numTurns = turns.length;
    } else {
      const session = this._sessions.get(AgentSession.id(sessionUri));
      const codexTurnId = session?.codexTurnIdByHostTurnId.get(turnId) ?? turnId;
      const index = turns.findIndex((t) => t.id === codexTurnId);
      if (index === -1) {
        this._logService.warn(`[Codex] truncateSession: turnId ${turnId} not found in thread ${read.thread.id}; skipping`);
        return;
      }
      numTurns = turns.length - (index + 1);
    }
    if (numTurns <= 0) {
      return;
    }
    try {
      const conn = await this._ensureConnection();
      await conn.client.request("thread/rollback", { threadId: read.thread.id, numTurns });
    } catch (err) {
      this._logService.warn(`[Codex:${read.thread.id}] thread/rollback failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  async onArchivedChanged(sessionUri, isArchived) {
    const threadId = await this._resolveThreadId(sessionUri);
    if (threadId === void 0) {
      return;
    }
    const conn = this._connection;
    if (conn.kind !== "ready") {
      return;
    }
    try {
      if (isArchived) {
        await conn.client.request("thread/archive", { threadId });
      } else {
        await conn.client.request("thread/unarchive", { threadId });
      }
    } catch (err) {
      this._logService.warn(`[Codex:${threadId}] thread/${isArchived ? "archive" : "unarchive"} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  /** Resolve the codex thread id for a session: in-memory → persisted overlay. */
  async _resolveThreadId(sessionUri) {
    const existing = this._sessions.get(AgentSession.id(sessionUri));
    if (existing?.threadId !== void 0) {
      return existing.threadId;
    }
    const overlay = await this._metadataStore.read(sessionUri);
    return overlay.threadId;
  }
  respondToPermissionRequest(requestId, approved) {
    const sessions = [
      ...this._sessions.values(),
      ...[...this._subagentsByThreadId.values()].map((s) => s.session)
    ];
    for (const session of sessions) {
      if (session.pendingCommandApprovals.respond(requestId, approved ? "accept" : "decline")) {
        if (!approved) {
          session.mapState.declinedToolCalls.add(requestId);
        }
        return;
      }
    }
    this._logService.info(`[Codex] respondToPermissionRequest: unknown requestId=${requestId}`);
  }
  respondToUserInputRequest(requestId, response, answers) {
    for (const session of this._sessions.values()) {
      if (session.pendingUserInputs.respond(requestId, { response, answers })) {
        return;
      }
    }
    this._logService.info(`[Codex] respondToUserInputRequest: unknown requestId=${requestId}`);
  }
  getSessionMessages(chat) {
    return this._readSession(this._sessionUriFromChat(chat)).then((read) => read ? replayThreadToTurns(read.thread) : []);
  }
  async getSessionMetadata(session) {
    const sessionId = AgentSession.id(session);
    const read = await this._readSession(session);
    if (!read) {
      return void 0;
    }
    const metadata = this._withWorkingDirectories(
      this._threadToMetadata(read.thread, session),
      read.persistedWorkingDirectories
    );
    if (!this._sessions.has(sessionId)) {
      const workingDirectory = read.thread.cwd ? URI.file(read.thread.cwd) : void 0;
      const threadId = read.thread.id;
      const restored = this._createResumedSessionEntry(sessionId, threadId, session, workingDirectory, void 0, metadata.workingDirectories);
      this._sessions.set(sessionId, restored);
      this._sessionIdByThreadId.set(threadId, sessionId);
      if (!isCodexThreadProviderCompatible(this._usageSource, read.thread.modelProvider)) {
        this._resetSessionForUsageSourceChange(restored, this._usageSource);
      }
      if (!restored.serverToolsAdvertised && this._serverToolHost) {
        restored.serverToolsAdvertised = true;
        this._serverToolHost.advertise(restored.sessionUri.toString());
      }
    }
    return metadata;
  }
  async _readSession(session) {
    const sessionId = AgentSession.id(session);
    const existing = this._sessions.get(sessionId);
    let threadId = existing?.threadId;
    let persistedWorkingDirectories = existing?.workingDirectories;
    if (threadId === void 0) {
      const overlay = await this._metadataStore.read(session);
      threadId = overlay.threadId ?? sessionId;
      persistedWorkingDirectories = overlay.workingDirectories;
    }
    try {
      const conn = await this._ensureConnection();
      const response = await conn.client.request("thread/read", {
        threadId,
        includeTurns: true
      });
      return { ...response, persistedWorkingDirectories };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/thread not loaded/i.test(message)) {
        this._logService.info(`[Codex:${threadId}] thread/read: not loaded yet (will resume on first send)`);
      } else {
        this._logService.warn(`[Codex:${threadId}] thread/read failed: ${message}`);
      }
      return void 0;
    }
  }
  async listSessions() {
    this._ensureAuthenticated();
    if (!await this._agentSdkDownloader.isSdkResolvableWithoutDownload(CodexSdkPackage)) {
      this._logService.info("[Codex] SDK not downloaded yet; deferring thread/list until a session triggers the download");
      return [];
    }
    try {
      const conn = await this._ensureConnection();
      const response = await conn.client.request("thread/list", {
        limit: 200
      });
      const liveUriByThreadId = /* @__PURE__ */ new Map();
      for (const s of this._sessions.values()) {
        if (s.threadId !== void 0) {
          liveUriByThreadId.set(s.threadId, s.sessionUri);
        }
      }
      return response.data.map((thread) => {
        const sessionUri = liveUriByThreadId.get(thread.id) ?? AgentSession.uri(this.id, thread.id);
        const liveWorkingDirectories = this._sessions.get(AgentSession.id(sessionUri))?.workingDirectories;
        return this._withWorkingDirectories(this._threadToMetadata(thread, sessionUri), liveWorkingDirectories);
      });
    } catch (err) {
      this._logService.warn(`[Codex] thread/list failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }
  _threadToMetadata(thread, sessionUri) {
    return {
      session: sessionUri,
      // Codex returns Unix seconds; the agent host expects ms.
      startTime: (thread.createdAt ?? 0) * 1e3,
      modifiedTime: (thread.updatedAt ?? thread.createdAt ?? 0) * 1e3,
      summary: thread.name ?? thread.preview ?? void 0,
      workingDirectories: thread.cwd ? [URI.file(thread.cwd)] : void 0
    };
  }
  _withWorkingDirectories(metadata, storedWorkingDirectories) {
    const primary = metadata.workingDirectories?.[0];
    if (!primary || !storedWorkingDirectories || storedWorkingDirectories.length <= 1) {
      return metadata;
    }
    const workingDirectories = distinctWorkingDirectories([
      primary,
      ...storedWorkingDirectories.slice(1)
    ]);
    return workingDirectories && workingDirectories.length > 1 ? { ...metadata, workingDirectories } : metadata;
  }
  setServerToolHost(host) {
    this._serverToolHost = host;
  }
  getOrCreateActiveClient(session, client) {
    const sessionId = AgentSession.id(session);
    return new CodexActiveClientHandle(
      () => this._sessions.get(sessionId),
      client.clientId,
      client.displayName,
      (tools) => this._logService.info(`[Codex:${sessionId}] active client ${client.clientId} tools=[${tools.map((t) => t.name).join(", ") || "(none)"}]`),
      (customizations) => {
        void this._syncClientCustomizations(session, client.clientId, [...customizations]);
      }
    );
  }
  removeActiveClient(session, clientId) {
    const sessionId = AgentSession.id(session);
    const sess = this._sessions.get(sessionId);
    sess?.clientToolSet.delete(clientId);
    if (sess?.clientCustomizations.removeClient(clientId)) {
      void this._refreshSkillExtraRoots();
    }
  }
  onClientToolCallComplete(session, _chat, toolCallId, result) {
    const sessionId = AgentSession.id(session);
    const sess = this._sessions.get(sessionId);
    sess?.pendingClientToolCalls.respondOrBuffer(toolCallId, result);
  }
  // ---- Client-pushed plugin customizations -------------------------------
  /**
   * Materialize + parse a client's pushed plugin customizations and store
   * them on the session. Mirrors the Claude client-plugin path: the shared
   * {@link IAgentPluginManager} copies each plugin to local disk (nonce
   * cached), we parse the resulting directory into its
   * {@link IParsedPlugin | components}, publish the customization surface,
   * and refresh the process-global skill roots. MCP servers are attached
   * per-thread at the next {@link _materialize}.
   */
  async _syncClientCustomizations(sessionUri, clientId, customizations) {
    const session = this._sessions.get(AgentSession.id(sessionUri));
    if (!session) {
      return;
    }
    const synced = await this._pluginManager.syncCustomizations(
      clientId,
      [...customizations],
      (status) => this._fire(sessionUri, { type: ActionType.SessionCustomizationUpdated, customization: status })
    );
    if (session.disposed) {
      return;
    }
    const plugins = await Promise.all(synced.map((item) => this._parseClientPlugin(session, item)));
    if (session.disposed) {
      return;
    }
    session.clientCustomizations.setClient(clientId, plugins);
    this._publishClientCustomizations(session);
    await this._refreshSkillExtraRoots();
  }
  /** Parse one synced plugin directory into its components (best-effort). */
  async _parseClientPlugin(session, synced) {
    if (!synced.pluginDir) {
      return { synced, parsed: void 0 };
    }
    try {
      const parsed = await parsePlugin(synced.pluginDir, this._fileService, session.workingDirectory, this._environmentService.userHome, synced.pluginDir);
      return { synced, parsed };
    } catch (err) {
      this._logService.warn(`[Codex] failed to parse client plugin ${synced.customization.uri}: ${err instanceof Error ? err.message : String(err)}`);
      return { synced, parsed: void 0 };
    }
  }
  /** Publish the session's client-plugin customizations as upsert actions. */
  _publishClientCustomizations(session) {
    for (const customization of session.clientCustomizations.toCustomizations()) {
      this._fire(session.sessionUri, { type: ActionType.SessionCustomizationUpdated, customization });
    }
  }
  /**
   * Recompute the process-global skill roots from every live session's
   * enabled client plugins and push them to codex via `skills/extraRoots/set`.
   * codex's extra skill roots are a single shared list (there is no per-thread
   * equivalent), so we send the union across all sessions — which matches the
   * global nature of client plugin choices. No-op when the connection is not
   * ready; the next {@link _materialize} re-applies.
   */
  async _refreshSkillExtraRoots() {
    if (this._connection.kind !== "ready") {
      return;
    }
    const plugins = [];
    for (const session of this._sessions.values()) {
      if (!session.disposed) {
        plugins.push(...session.clientCustomizations.enabledPlugins());
      }
    }
    const roots = codexSkillRootsFromPlugins(plugins);
    try {
      await this._connection.client.request("skills/extraRoots/set", { extraRoots: roots });
      if (roots.length > 0) {
        this._logService.info(`[Codex] applied ${roots.length} client-plugin skill root(s)`);
      }
    } catch (err) {
      this._logService.warn(`[Codex] skills/extraRoots/set failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // ---- MCP servers -------------------------------------------------------
  /**
   * Surfaces codex's MCP servers to AHP clients as per-session
   * customizations. Codex has no plugin/directory customization layer, so
   * every server is a bare top-level {@link McpServerCustomization}. The
   * returned snapshot reflects the current connection-global inventory;
   * subsequent lifecycle transitions arrive as customization actions
   * emitted by the session's {@link McpCustomizationController}.
   */
  async getSessionCustomizations(sessionUri) {
    const session = this._sessions.get(AgentSession.id(sessionUri));
    if (!session) {
      return [];
    }
    const controller = this._getOrCreateMcpController(session);
    controller.applyAll(inventoryToSdkServers(this._mcpInventory));
    this._refreshMcpCustomizationIds(session, controller);
    const skillHookContainers = await this._fetchSkillHookContainers(session);
    return [
      ...session.clientCustomizations.toCustomizations(),
      ...controller.topLevelCustomizations(),
      ...skillHookContainers
    ];
  }
  /**
   * Fetches the skills and hooks codex has loaded for `session`'s working
   * directory (`skills/list` + `hooks/list`, both cwd-scoped) and projects
   * them into {@link DirectoryCustomization} containers. Best-effort: returns
   * an empty array when no connection is ready, no working directory is known,
   * or the app-server rejects the request.
   */
  async _fetchSkillHookContainers(session) {
    if (this._connection.kind !== "ready" || !session.workingDirectory) {
      return [];
    }
    const cwd = session.workingDirectory.fsPath;
    const client = this._connection.client;
    const [skills, hooks] = await Promise.all([
      client.request("skills/list", { cwds: [cwd] }).catch((err) => {
        this._logService.warn(`[Codex] skills/list failed: ${err instanceof Error ? err.message : String(err)}`);
        return void 0;
      }),
      client.request("hooks/list", { cwds: [cwd] }).catch((err) => {
        this._logService.warn(`[Codex] hooks/list failed: ${err instanceof Error ? err.message : String(err)}`);
        return void 0;
      })
    ]);
    return [...codexSkillsToContainers(skills), ...codexHooksToContainers(hooks)];
  }
  /**
   * Re-fetches this session's skill/hook customizations and upserts each
   * container into session state via {@link ActionType.SessionCustomizationUpdated}.
   * Called after materialization (when the connection is ready and the cwd is
   * known) so the workbench Customizations surface reflects what codex loaded
   * from the working directory's `.agents`/`.codex` folders. Upserts (keyed by
   * customization id) leave the MCP customizations untouched.
   */
  async _refreshSkillHookCustomizations(session) {
    if (session.disposed) {
      return;
    }
    const containers = await this._fetchSkillHookContainers(session);
    if (session.disposed) {
      return;
    }
    for (const container of containers) {
      this._fire(session.sessionUri, { type: ActionType.SessionCustomizationUpdated, customization: container });
    }
  }
  /**
   * Routes an MCP request received on this session's `mcp://` side channel
   * to codex. Read-only methods (`tools/list`, `resources/list`,
   * `resources/templates/list`) are answered from the cached inventory;
   * `tools/call` and `resources/read` round-trip to the app-server with the
   * session's thread id. Unknown servers / methods reject with
   * `Method not found` so the protocol server maps them to JSON-RPC
   * `-32601`.
   */
  async handleMcpRequest(sessionUri, serverName, method, params) {
    const sessionId = AgentSession.id(sessionUri);
    const session = this._sessions.get(sessionId);
    if (!session) {
      throw new Error(`Method not found: no active session ${sessionId}`);
    }
    const entry = this._mcpInventory.get(serverName);
    if (!entry) {
      throw new Error(`Method not found: unknown MCP server '${serverName}'`);
    }
    const read = buildCodexMcpReadResult(method, entry);
    if (read.handled) {
      return read.result;
    }
    switch (method) {
      case "tools/call": {
        const tool = params && typeof params["name"] === "string" ? params["name"] : void 0;
        if (!tool) {
          throw new Error(`tools/call missing 'name' parameter`);
        }
        const threadId = await this._ensureThreadId(session);
        const conn = await this._ensureConnection();
        return conn.client.request("mcpServer/tool/call", {
          threadId,
          server: serverName,
          tool,
          arguments: params ? params["arguments"] : void 0
        });
      }
      case "resources/read": {
        const uri = params && typeof params["uri"] === "string" ? params["uri"] : void 0;
        if (!uri) {
          throw new Error(`resources/read missing 'uri' parameter`);
        }
        const threadId = await this._ensureThreadId(session);
        const conn = await this._ensureConnection();
        return conn.client.request("mcpServer/resource/read", {
          threadId,
          server: serverName,
          uri
        });
      }
      default:
        throw new Error(`Method not found: ${method}`);
    }
  }
  async startMcpServer(sessionUri, id) {
    const session = this._sessions.get(AgentSession.id(sessionUri));
    const serverName = session ? this._resolveMcpServerName(session, id) : void 0;
    if (!session || !serverName) {
      this._logService.warn(`[Codex] Cannot start unknown MCP server customization ${id}`);
      return;
    }
    const conn = await this._ensureConnection();
    await conn.client.request("config/mcpServer/reload", void 0);
    await this._refreshMcpInventory(conn.client);
  }
  async stopMcpServer(sessionUri, id) {
    const session = this._sessions.get(AgentSession.id(sessionUri));
    const serverName = session ? this._resolveMcpServerName(session, id) : void 0;
    if (!session || !serverName) {
      this._logService.warn(`[Codex] Cannot stop unknown MCP server customization ${id}`);
      return;
    }
  }
  _resolveMcpServerName(session, id) {
    const controller = this._getOrCreateMcpController(session);
    controller.applyAll(inventoryToSdkServers(this._mcpInventory));
    this._refreshMcpCustomizationIds(session, controller);
    return controller.serverNameForCustomizationId(id);
  }
  /**
   * Lazily create the per-session {@link McpCustomizationController}. Not
   * registered on the agent (sessions come and go) — disposed explicitly
   * when the session is removed.
   */
  _getOrCreateMcpController(session) {
    if (!session.mcpController) {
      session.mcpController = this._instantiationService.createInstance(McpCustomizationController, {
        providerId: this.id,
        sessionId: session.sessionId,
        sessionUri: session.sessionUri,
        resolveChildId: () => void 0,
        emit: (action) => this._fire(session.sessionUri, action),
        capabilities: CODEX_MCP_APP_CAPABILITIES
      });
    }
    return session.mcpController;
  }
  /** Mirrors the connection-global inventory onto every live session. */
  _applyMcpInventoryToSessions() {
    const servers = inventoryToSdkServers(this._mcpInventory);
    for (const session of this._sessions.values()) {
      if (session.disposed) {
        continue;
      }
      const controller = this._getOrCreateMcpController(session);
      controller.applyAll(servers);
      this._refreshMcpCustomizationIds(session, controller);
    }
  }
  /**
   * Refreshes the session's mapper snapshot of server name → customization id
   * (read when stamping the MCP contributor on tool calls). Plain data, owned
   * here — the mapper never reaches back into the controller. Must run on every
   * inventory change because MCP servers are discovered asynchronously, after a
   * session (and possibly its first tool call) already exists.
   */
  _refreshMcpCustomizationIds(session, controller) {
    const ids = session.mapState.mcpCustomizationIds;
    ids.clear();
    for (const serverName of this._mcpInventory.keys()) {
      const id = controller.customizationIdForServer(serverName);
      if (id !== void 0) {
        ids.set(serverName, id);
      }
    }
  }
  /**
   * Re-reads the full MCP inventory from the app-server (paginated) and
   * re-publishes it to every session. Fires `notifications/tools/list_changed`
   * on each ready channel whose tool set changed.
   */
  async _refreshMcpInventory(client) {
    let data = [];
    try {
      let cursor = null;
      do {
        const response = await client.request("mcpServerStatus/list", { cursor, detail: "full" });
        data = data.concat(response.data);
        cursor = response.nextCursor;
      } while (cursor);
    } catch (err) {
      this._logService.warn(`[Codex] Failed to list MCP servers: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (this._connection.kind === "ready" && this._connection.client !== client) {
      return;
    }
    const next = codexMcpListToInventory(data);
    const toolsChanged = [];
    for (const [name, entry] of next) {
      const prev = this._mcpInventory.get(name);
      if (prev && codexMcpToolsChanged(prev, entry)) {
        toolsChanged.push(name);
      }
    }
    for (const [name, entry] of this._mcpInventory) {
      if (!next.has(name) && entry.state.kind !== McpServerStatus.Ready) {
        next.set(name, entry);
      }
    }
    this._mcpInventory.clear();
    for (const [name, entry] of next) {
      this._mcpInventory.set(name, entry);
    }
    this._logService.info(`[Codex] MCP inventory refreshed: ${this._mcpInventory.size === 0 ? "(none)" : [...this._mcpInventory].map(([name, entry]) => `${name} [${entry.state.kind}, ${entry.tools.length} tool(s)]`).join(", ")}`);
    this._applyMcpInventoryToSessions();
    for (const name of toolsChanged) {
      this._fireMcpToolsListChanged(name);
    }
  }
  /**
   * Handles a `mcpServer/startupStatus/updated` notification. `ready`
   * triggers a full inventory refresh (to pull the now-loaded tools);
   * other transitions update the cached state in place so the UI sees the
   * server settle into starting/error/stopped promptly.
   */
  _handleMcpStartupStatus(client, name, status, error) {
    if (this._connection.kind === "ready" && this._connection.client !== client) {
      return;
    }
    this._logService.info(`[Codex] MCP server '${name}' startup status: ${status}${error ? ` (${error})` : ""}`);
    if (status === "ready") {
      void this._refreshMcpInventory(client);
      return;
    }
    if (status === "failed" && codexStartupErrorNeedsAuth(error)) {
      const url = this._mcpServerUrlForName(name);
      const normalized = url !== void 0 ? normalizeCodexMcpResourceUrl(url) : void 0;
      if (url !== void 0 && normalized !== void 0) {
        if (this._mcpAuthTokens.delete(normalized)) {
          this._logService.info(`[Codex] MCP server '${name}' rejected the stored token; clearing it to allow re-authentication`);
        }
        void this._surfaceMcpAuthRequired(client, name, url, error);
        return;
      }
    }
    this._setMcpServerState(name, translateCodexMcpStartupState(status, error));
  }
  /** Upserts a server's lifecycle state in the inventory (preserving cached tools) and republishes. */
  _setMcpServerState(name, state) {
    const prev = this._mcpInventory.get(name);
    this._mcpInventory.set(name, {
      state,
      tools: prev?.tools ?? [],
      resources: prev?.resources ?? [],
      resourceTemplates: prev?.resourceTemplates ?? []
    });
    this._applyMcpInventoryToSessions();
  }
  /**
   * Surfaces an auth-gated http MCP server as {@link McpServerStatus.AuthRequired}
   * so the workbench runs the *same* OAuth sign-in it uses for the Copilot
   * agent. codex's `failed` notification carries no RFC 9728 metadata, and the
   * workbench's `resolveMcpServerAuthentication` needs the resource's
   * `authorization_servers` to know where to sign in — so we discover the
   * Protected Resource Metadata (`<url>/.well-known/oauth-protected-resource`)
   * here, mirroring the discovery the Copilot SDK does internally. On
   * discovery failure we still surface `AuthRequired` with bare metadata (the
   * server genuinely needs auth); the one-click sign-in just can't complete
   * without the authorization server, which is logged.
   */
  async _surfaceMcpAuthRequired(client, name, url, error) {
    let resource = { resource: url, resource_name: name };
    let requiredScopes;
    try {
      const discovered = await raceTimeout(fetchResourceMetadata(url, void 0), 15e3);
      if (discovered) {
        resource = discovered.metadata;
        requiredScopes = discovered.metadata.scopes_supported;
        this._logService.info(`[Codex] discovered OAuth metadata for MCP server '${name}': authorization_servers=[${(discovered.metadata.authorization_servers ?? []).join(", ")}]`);
      } else {
        this._logService.warn(`[Codex] timed out discovering OAuth metadata for MCP server '${name}' at ${url}; the Authenticate action may not be able to complete`);
      }
    } catch (err) {
      this._logService.warn(`[Codex] failed to discover OAuth metadata for MCP server '${name}' at ${url}; the Authenticate action may not be able to complete: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (this._connection.kind === "ready" && this._connection.client !== client) {
      return;
    }
    const normalizedServer = normalizeCodexMcpResourceUrl(url);
    const normalizedResource = normalizeCodexMcpResourceUrl(resource.resource) ?? normalizedServer;
    if (normalizedServer !== void 0 && normalizedResource !== void 0) {
      const servers = this._mcpAuthServerUrlsByResource.get(normalizedResource) ?? /* @__PURE__ */ new Set();
      servers.add(normalizedServer);
      this._mcpAuthServerUrlsByResource.set(normalizedResource, servers);
    }
    this._logService.info(`[Codex] MCP server '${name}' requires authentication for ${url}`);
    this._setMcpServerState(name, {
      kind: McpServerStatus.AuthRequired,
      reason: McpAuthRequiredReason.Required,
      resource,
      requiredScopes: requiredScopes && requiredScopes.length > 0 ? requiredScopes : void 0,
      description: error ?? void 0
    });
  }
  /**
   * Broadcasts `notifications/tools/list_changed` for `serverName` on every
   * session whose channel for that server is currently ready. Clients
   * refetch `tools/list` in response.
   */
  _fireMcpToolsListChanged(serverName) {
    for (const session of this._sessions.values()) {
      const channel = session.mcpController?.channelForServer(serverName);
      if (channel) {
        this._onMcpNotification.fire({ channel, method: "notifications/tools/list_changed" });
      }
    }
  }
  /**
   * Ensures the session has a materialized codex thread and returns its id.
   * MCP tool calls (`mcpServer/tool/call`) are thread-scoped, so a call
   * arriving before the first turn lazily starts the thread.
   */
  async _ensureThreadId(session) {
    await this._materializeIfNeeded(session, false);
    if (session.threadId === void 0) {
      throw new Error(`Cannot run MCP tool: codex session ${session.sessionId} is not materialized`);
    }
    return session.threadId;
  }
  async shutdown() {
    this._disposeConnection();
    for (const s of this._sessions.values()) {
      s.pendingCommandApprovals.denyAll("decline");
      s.pendingClientToolCalls.rejectAll(new CancellationError());
      s.pendingUserInputs.rejectAll(new CancellationError());
      s.mcpController?.dispose();
    }
    this._sessions.clear();
    this._sessionIdByThreadId.clear();
    this._mcpInventory.clear();
  }
  resolveSessionConfig(params) {
    const values = codexSessionConfigSchema.validateOrDefault(params.config, codexSessionConfigDefaults);
    const schema = codexVisibleSessionConfigSchema.toProtocol();
    const resolvedValues = {
      ...params.config,
      [SessionConfigKey.Mode]: values[SessionConfigKey.Mode]
    };
    delete resolvedValues[CodexSessionConfigKey.PermissionsPreset];
    delete resolvedValues[CodexSessionConfigKey.ApprovalPolicy];
    delete resolvedValues[CodexSessionConfigKey.SandboxMode];
    Object.assign(resolvedValues, migrateCodexPermissionValues(params.config, {
      approvalPolicy: codexSessionConfigDefaults[CodexSessionConfigKey.ApprovalPolicy],
      sandboxMode: codexSessionConfigDefaults[CodexSessionConfigKey.SandboxMode]
    }));
    return Promise.resolve({ values: resolvedValues, schema });
  }
  async sessionConfigCompletions(params) {
    if (params.property !== CodexSessionConfigKey.AdditionalDirectories) {
      return { items: [] };
    }
    const query = params.query?.trim();
    if (!query) {
      return { items: [] };
    }
    const workingDirectory = params.workingDirectory?.fsPath;
    const resolved = isAbsolute(query) ? query : resolve(workingDirectory ?? process.cwd(), query);
    const parent = query.endsWith(sep) ? resolved : dirname(resolved);
    const prefix = query.endsWith(sep) ? "" : basename(resolved).toLowerCase();
    try {
      const entries = await fs.promises.readdir(parent, { withFileTypes: true });
      return {
        items: entries.filter((entry) => entry.isDirectory() && entry.name.toLowerCase().startsWith(prefix)).slice(0, 50).map((entry) => {
          const value = join(parent, entry.name);
          return { value, label: entry.name, description: value };
        })
      };
    } catch {
      return { items: [] };
    }
  }
  // #endregion
  _fire(sessionUri, action) {
    this._onDidSessionProgress.fire({ kind: "action", resource: isChatAction(action) ? URI.parse(buildDefaultChatUri(sessionUri)) : sessionUri, action });
  }
  dispose() {
    this._disposeConnection();
    for (const s of this._sessions.values()) {
      s.pendingCommandApprovals.denyAll("decline");
      s.pendingClientToolCalls.rejectAll(new CancellationError());
      s.pendingUserInputs.rejectAll(new CancellationError());
      s.mcpController?.dispose();
    }
    for (const subagent of this._subagentsByThreadId.values()) {
      subagent.session.pendingCommandApprovals.denyAll("decline");
    }
    this._subagentsByThreadId.clear();
    this._sessions.clear();
    this._sessionIdByThreadId.clear();
    this._mcpInventory.clear();
    super.dispose();
  }
};
CodexAgent = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, ICopilotApiService),
  __decorateParam(2, ICodexProxyService),
  __decorateParam(3, IAgentConfigurationService),
  __decorateParam(4, IAgentHostGitHubEndpointService),
  __decorateParam(5, IAgentSdkDownloader),
  __decorateParam(6, IProductService),
  __decorateParam(7, IAgentPluginManager),
  __decorateParam(8, IFileService),
  __decorateParam(9, INativeEnvironmentService),
  __decorateParam(10, IInstantiationService)
], CodexAgent);
function parseBinaryArgs(json) {
  if (!json) {
    return [];
  }
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}
function codexPackageSuffix(platform, arch) {
  if (platform !== "linux" && platform !== "darwin" && platform !== "win32" || arch !== "x64" && arch !== "arm64") {
    return void 0;
  }
  return `${platform}-${arch}`;
}
function codexBinaryTriple(sdkTarget) {
  switch (sdkTarget) {
    case "linux-x64":
      return "x86_64-unknown-linux-musl";
    case "linux-arm64":
      return "aarch64-unknown-linux-musl";
    case "darwin-x64":
      return "x86_64-apple-darwin";
    case "darwin-arm64":
      return "aarch64-apple-darwin";
    case "win32-x64":
      return "x86_64-pc-windows-msvc";
    case "win32-arm64":
      return "aarch64-pc-windows-msvc";
    default:
      return void 0;
  }
}
async function resolveCodexDevSdkRoot(resolvePackageJsonPath = defaultResolveCodexPackageJsonPath) {
  try {
    const pkgJson = await resolvePackageJsonPath();
    return dirname(dirname(dirname(dirname(pkgJson))));
  } catch {
    return void 0;
  }
}
async function defaultResolveCodexPackageJsonPath() {
  const { createRequire } = await import("node:module");
  return createRequire(import.meta.url).resolve("@openai/codex/package.json");
}
export {
  CodexAgent,
  CodexSdkPackage,
  codexBinaryTriple,
  codexPackageSuffix,
  resolveCodexDevSdkRoot
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NvZGV4L2NvZGV4QWdlbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBzcGF3biwgdHlwZSBDaGlsZFByb2Nlc3NXaXRob3V0TnVsbFN0cmVhbXMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IHJhY2VUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZmV0Y2hSZXNvdXJjZU1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2F1dGguanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgdHlwZSBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSwgaXNBYnNvbHV0ZSwgam9pbiwgbm9ybWFsaXplLCByZXNvbHZlLCBzZXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlU2NoZW1hLCBwbGF0Zm9ybVJvb3RTY2hlbWEsIHBsYXRmb3JtU2Vzc2lvblNjaGVtYSwgc2NoZW1hUHJvcGVydHksIEFnZW50SG9zdENvZGV4TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSwgQWdlbnRIb3N0TWNwU2VydmVyc0NvbmZpZ0tleSwgdHlwZSBJU2NoZW1hUHJvcGVydHksIHR5cGUgU2Vzc2lvbk1vZGUgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB7IGNyZWF0ZVByaWNpbmdNZXRhRnJvbUJpbGxpbmcsIG5vcm1hbGl6ZUNBUElCaWxsaW5nIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50TW9kZWxQcmljaW5nLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvbmZpZ0tleSwgYWdlbnRIb3N0Q3VzdG9taXphdGlvbkNvbmZpZ1NjaGVtYSwgdHlwZSBDb2RleFVzYWdlU291cmNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEN1c3RvbWl6YXRpb25Db25maWcuanMnO1xuaW1wb3J0IHsgZ2V0UmVhc29uaW5nRWZmb3J0RGVzY3JpcHRpb24sIGdldFJlYXNvbmluZ0VmZm9ydExhYmVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL3JlYXNvbmluZ0VmZm9ydC5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb2RleEFnZW50QmluYXJ5QXJnc0VudlZhciwgQWdlbnRIb3N0Q29kZXhBZ2VudENvZGV4SG9tZUVudlZhciwgQWdlbnRIb3N0Q29kZXhBZ2VudFNka1Jvb3RFbnZWYXIsIEFnZW50U2Vzc2lvbiwgQWdlbnRTaWduYWwsIENPREVYX0FHRU5UX1BST1ZJREVSX0lELCBJQWN0aXZlQ2xpZW50LCBJQWdlbnQsIElBZ2VudENoYXRzLCBJQWdlbnRDcmVhdGVDaGF0Rm9ya1NvdXJjZSwgSUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCwgSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMsIElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcsIElBZ2VudENyZWF0ZVNlc3Npb25SZXN1bHQsIElBZ2VudERlc2NyaXB0b3IsIElBZ2VudE1hdGVyaWFsaXplU2Vzc2lvbkV2ZW50LCBJQWdlbnRNb2RlbEluZm8sIElBZ2VudFJlc29sdmVTZXNzaW9uQ29uZmlnUGFyYW1zLCBJQWdlbnRTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNQYXJhbXMsIElBZ2VudFNlc3Npb25NZXRhZGF0YSwgSU1jcE5vdGlmaWNhdGlvbiwgdHlwZSBBZ2VudFByb3ZpZGVyLCB0eXBlIEF1dGhlbnRpY2F0ZVBhcmFtcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBBSFBfQVVUSF9SRVFVSVJFRCwgUHJvdG9jb2xFcnJvciB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgaXNDaGF0QWN0aW9uLCB0eXBlIFNlc3Npb25BY3Rpb24sIHR5cGUgQ2hhdEFjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IENvbmZpZ1NjaGVtYSwgTW9kZWxTZWxlY3Rpb24sIFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEsIFRvb2xEZWZpbml0aW9uLCBBZ2VudFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0LCBTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNSZXN1bHQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQXV0aFJlcXVpcmVkUmVhc29uLCB0eXBlIEF1dGhSZXF1aXJlZFBhcmFtcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tb24vbm90aWZpY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBidWlsZERlZmF1bHRDaGF0VXJpLCBwYXJzZUNoYXRVcmksIHR5cGUgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbiwgdHlwZSBEaXJlY3RvcnlDdXN0b21pemF0aW9uLCB0eXBlIE1lc3NhZ2VBdHRhY2htZW50LCB0eXBlIFBlbmRpbmdNZXNzYWdlLCB0eXBlIENoYXRJbnB1dEFuc3dlciwgQ2hhdElucHV0UmVzcG9uc2VLaW5kLCB0eXBlIFBvbGljeVN0YXRlLCB0eXBlIFRvb2xDYWxsUmVzdWx0LCBUb29sUmVzdWx0Q29udGVudFR5cGUsIHR5cGUgVHVybiwgUmVzcG9uc2VQYXJ0S2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRTZXJ2ZXJUb29sSG9zdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZlclRvb2xzLmpzJztcbmltcG9ydCB7IEFjdGl2ZUNsaWVudFRvb2xTZXQgfSBmcm9tICcuLi9hY3RpdmVDbGllbnRTdGF0ZS5qcyc7XG5pbXBvcnQgeyBNY3BDdXN0b21pemF0aW9uQ29udHJvbGxlciB9IGZyb20gJy4uL3NoYXJlZC9tY3BDdXN0b21pemF0aW9uQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBidWlsZENvZGV4TWNwUmVhZFJlc3VsdCwgY29kZXhNY3BMaXN0VG9JbnZlbnRvcnksIGNvZGV4TWNwU2VydmVyc0Zyb21Db25maWcsIGNvZGV4TWNwVG9vbHNDaGFuZ2VkLCBjb2RleFN0YXJ0dXBFcnJvck5lZWRzQXV0aCwgaW5qZWN0Q29kZXhNY3BBdXRoVG9rZW5zLCBpbnZlbnRvcnlUb1Nka1NlcnZlcnMsIG5vcm1hbGl6ZUNvZGV4TWNwUmVzb3VyY2VVcmwsIHRyYW5zbGF0ZUNvZGV4TWNwU3RhcnR1cFN0YXRlLCB0eXBlIElDb2RleE1jcFNlcnZlckNvbmZpZ0pzb24sIHR5cGUgSUNvZGV4TWNwU2VydmVyRW50cnkgfSBmcm9tICcuL2NvZGV4TWNwU2VydmVycy5qcyc7XG5pbXBvcnQgeyBjb2RleEhvb2tzVG9Db250YWluZXJzLCBjb2RleFNraWxsc1RvQ29udGFpbmVycyB9IGZyb20gJy4vY29kZXhDdXN0b21pemF0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RleENsaWVudEN1c3RvbWl6YXRpb25TdG9yZSwgY29kZXhNY3BTZXJ2ZXJzRnJvbVBsdWdpbnMsIGNvZGV4U2tpbGxSb290c0Zyb21QbHVnaW5zLCB0eXBlIElDb2RleENsaWVudFBsdWdpbiB9IGZyb20gJy4vY29kZXhDbGllbnRDdXN0b21pemF0aW9ucy5qcyc7XG5pbXBvcnQgeyBidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCwgY2FuY2VsbGVkRWxpY2l0YXRpb25SZXNwb25zZSwgZGVjbGluZWRFbGljaXRhdGlvblJlc3BvbnNlLCBlbGljaXRhdGlvblJlc3BvbnNlRnJvbUFuc3dlcnMgfSBmcm9tICcuL2NvZGV4RWxpY2l0YXRpb25NYXBwZXIuanMnO1xuaW1wb3J0IHsgTWNwQXV0aFJlcXVpcmVkUmVhc29uLCBNY3BTZXJ2ZXJTdGF0dXMsIHR5cGUgQWhwTWNwVWlIb3N0Q2FwYWJpbGl0aWVzLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgTWNwU2VydmVyU3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtc2Vzc2lvbi9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luTWFuYWdlciwgdHlwZSBJU3luY2VkQ3VzdG9taXphdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFBsdWdpbk1hbmFnZXIuanMnO1xuaW1wb3J0IHsgcGFyc2VQbHVnaW4gfSBmcm9tICcuLi8uLi8uLi9hZ2VudFBsdWdpbnMvY29tbW9uL3BsdWdpblBhcnNlcnMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSB9IGZyb20gJy4uL2FnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29waWxvdEFwaVNlcnZpY2UgfSBmcm9tICcuLi9zaGFyZWQvY29waWxvdEFwaVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZXh0cmFjdEZvcndhcmRlZEVycm9ySW5mbyB9IGZyb20gJy4uL3NoYXJlZC9mb3J3YXJkZWRDaGF0RXJyb3IuanMnO1xuaW1wb3J0IHsgSUFnZW50U2RrRG93bmxvYWRlciwgSUFnZW50U2RrUGFja2FnZSB9IGZyb20gJy4uL2FnZW50U2RrRG93bmxvYWRlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3BlbmRpbmdSZXF1ZXN0UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29kZXhBcHBTZXJ2ZXJDbGllbnQsIEpzb25ScGNFcnJvciwgdHJhbnNwb3J0RnJvbUNoaWxkUHJvY2VzcywgdHlwZSBJQ29kZXhBcHBTZXJ2ZXJDbGllbnQsIHR5cGUgU2VydmVyUmVxdWVzdEhhbmRsZXJSZXN1bHQgfSBmcm9tICcuL2NvZGV4QXBwU2VydmVyQ2xpZW50LmpzJztcbmltcG9ydCB7IElDb2RleFByb3h5U2VydmljZSwgdHlwZSBJQ29kZXhQcm94eUhhbmRsZSB9IGZyb20gJy4vY29kZXhQcm94eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUsIGV4dHJhY3RVc2VySW5wdXRUZXh0LCBtYXBBZ2VudE1lc3NhZ2VEZWx0YSwgbWFwQ29tbWFuZEV4ZWN1dGlvbk91dHB1dERlbHRhLCBtYXBGaWxlQ2hhbmdlT3V0cHV0RGVsdGEsIG1hcEZpbGVDaGFuZ2VQYXRjaFVwZGF0ZWQsIG1hcEl0ZW1Db21wbGV0ZWQsIG1hcEl0ZW1TdGFydGVkLCBtYXBNY3BUb29sQ2FsbFByb2dyZXNzLCBtYXBSZWFzb25pbmdTdW1tYXJ5UGFydEFkZGVkLCBtYXBSZWFzb25pbmdTdW1tYXJ5VGV4dERlbHRhLCBtYXBSZWFzb25pbmdUZXh0RGVsdGEsIG1hcFRva2VuVXNhZ2VVcGRhdGVkLCBtYXBUdXJuQ29tcGxldGVkLCBtYXBUdXJuU3RhcnRlZCwgcmVzZXRDb2RleFR1cm5NYXBTdGF0ZSwgdHlwZSBJQ29kZXhTZXNzaW9uTWFwU3RhdGUgfSBmcm9tICcuL2NvZGV4TWFwQXBwU2VydmVyRXZlbnRzLmpzJztcbmltcG9ydCB7IHVud3JhcFNoZWxsSW52b2NhdGlvbiB9IGZyb20gJy4vY29kZXhTaGVsbENvbW1hbmQuanMnO1xuaW1wb3J0IHsgcGxhbkZvcmtlZFR1cm5JZE1hcCwgcmVzb2x2ZUZvcmtCb3VuZGFyeSB9IGZyb20gJy4vY29kZXhGb3JrUGxhbi5qcyc7XG5pbXBvcnQgeyByZXNvbHZlQ29kZXhJbnB1dCB9IGZyb20gJy4vY29kZXhQcm9tcHRSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBidWlsZFVzZXJJbnB1dFJlcXVlc3QsIGVtcHR5VXNlcklucHV0UmVzcG9uc2UsIHVzZXJJbnB1dFJlc3BvbnNlRnJvbUFuc3dlcnMgfSBmcm9tICcuL2NvZGV4VXNlcklucHV0TWFwcGVyLmpzJztcbmltcG9ydCB7IHJlcGxheVRocmVhZFRvVHVybnMgfSBmcm9tICcuL2NvZGV4UmVwbGF5TWFwcGVyLmpzJztcbmltcG9ydCB7IENvZGV4U2Vzc2lvbk1ldGFkYXRhU3RvcmUgfSBmcm9tICcuL2NvZGV4U2Vzc2lvbk1ldGFkYXRhU3RvcmUuanMnO1xuaW1wb3J0IHsgYnVpbGRDb2RleExhdW5jaENvbmZpZywgYnVpbGRDb2RleFJlc3VtZVBhcmFtcywgaXNDb2RleFRocmVhZFByb3ZpZGVyQ29tcGF0aWJsZSB9IGZyb20gJy4vY29kZXhMYXVuY2hDb25maWcuanMnO1xuaW1wb3J0IHsgY29kZXhBY2NvdW50U3RhdGVGb3JVc2FnZVNvdXJjZSwgY29kZXhBY2NvdW50U3RhdGVGcm9tUmVzcG9uc2UsIGNvZGV4UHJvdGVjdGVkUmVzb3VyY2VzRm9yVXNhZ2VTb3VyY2UsIHJlc29sdmVDb2RleFVzYWdlU291cmNlQWZ0ZXJBY2NvdW50UmVhZCwgdHlwZSBJQ29kZXhBY2NvdW50U3RhdGUgfSBmcm9tICcuL2NvZGV4QWNjb3VudFN0YXRlLmpzJztcbmltcG9ydCB7IENvZGV4U2Vzc2lvbkNvbmZpZ0tleSwgQ09ERVhfREVGQVVMVF9QRVJNSVNTSU9OU19QUkVTRVQsIENPREVYX1BFUk1JU1NJT05TX1BSRVNFVFMsIGNvbGxhYm9yYXRpb25Nb2RlS2luZCwgbWlncmF0ZUNvZGV4UGVybWlzc2lvblZhbHVlcywgbmFycm93QWRkaXRpb25hbERpcmVjdG9yaWVzLCBuYXJyb3dCb29sZWFuLCBuYXJyb3dQZXJzb25hbGl0eSwgbmFycm93UmVhc29uaW5nRWZmb3J0LCBuYXJyb3dSZWFzb25pbmdTdW1tYXJ5LCBuYXJyb3dXZWJTZWFyY2hNb2RlLCByZXNvbHZlQ29kZXhQZXJtaXNzaW9ucywgdHlwZSBDb2RleEFwcHJvdmFsUG9saWN5LCB0eXBlIENvZGV4UGVybWlzc2lvbnNQcmVzZXQsIHR5cGUgSUNvZGV4UmVzb2x2ZWRQZXJtaXNzaW9ucyB9IGZyb20gJy4vY29kZXhTZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgdHlwZSB7IFJlYXNvbmluZ0VmZm9ydCB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL1JlYXNvbmluZ0VmZm9ydC5qcyc7XG5pbXBvcnQgdHlwZSB7IFJlYXNvbmluZ1N1bW1hcnkgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC9SZWFzb25pbmdTdW1tYXJ5LmpzJztcbmltcG9ydCB0eXBlIHsgUGVyc29uYWxpdHkgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC9QZXJzb25hbGl0eS5qcyc7XG5pbXBvcnQgdHlwZSB7IFdlYlNlYXJjaE1vZGUgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC9XZWJTZWFyY2hNb2RlLmpzJztcbmltcG9ydCB0eXBlIHsgU2FuZGJveE1vZGUgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9TYW5kYm94TW9kZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFNhbmRib3hQb2xpY3kgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9TYW5kYm94UG9saWN5LmpzJztcbmltcG9ydCB0eXBlIHsgQ29tbWFuZEV4ZWN1dGlvbkFwcHJvdmFsRGVjaXNpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9Db21tYW5kRXhlY3V0aW9uQXBwcm92YWxEZWNpc2lvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IENvbW1hbmRFeGVjdXRpb25SZXF1ZXN0QXBwcm92YWxQYXJhbXMgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9Db21tYW5kRXhlY3V0aW9uUmVxdWVzdEFwcHJvdmFsUGFyYW1zLmpzJztcbmltcG9ydCB0eXBlIHsgQ29tbWFuZEV4ZWN1dGlvblJlcXVlc3RBcHByb3ZhbFJlc3BvbnNlIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvQ29tbWFuZEV4ZWN1dGlvblJlcXVlc3RBcHByb3ZhbFJlc3BvbnNlLmpzJztcbmltcG9ydCB0eXBlIHsgRmlsZUNoYW5nZUFwcHJvdmFsRGVjaXNpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9GaWxlQ2hhbmdlQXBwcm92YWxEZWNpc2lvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IEZpbGVDaGFuZ2VSZXF1ZXN0QXBwcm92YWxQYXJhbXMgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9GaWxlQ2hhbmdlUmVxdWVzdEFwcHJvdmFsUGFyYW1zLmpzJztcbmltcG9ydCB0eXBlIHsgRmlsZUNoYW5nZVJlcXVlc3RBcHByb3ZhbFJlc3BvbnNlIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvRmlsZUNoYW5nZVJlcXVlc3RBcHByb3ZhbFJlc3BvbnNlLmpzJztcbmltcG9ydCB0eXBlIHsgUGVybWlzc2lvbnNSZXF1ZXN0QXBwcm92YWxQYXJhbXMgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9QZXJtaXNzaW9uc1JlcXVlc3RBcHByb3ZhbFBhcmFtcy5qcyc7XG5pbXBvcnQgdHlwZSB7IFBlcm1pc3Npb25zUmVxdWVzdEFwcHJvdmFsUmVzcG9uc2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9QZXJtaXNzaW9uc1JlcXVlc3RBcHByb3ZhbFJlc3BvbnNlLmpzJztcbmltcG9ydCB0eXBlIHsgRHluYW1pY1Rvb2xTcGVjIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvRHluYW1pY1Rvb2xTcGVjLmpzJztcbmltcG9ydCB0eXBlIHsgRHluYW1pY1Rvb2xDYWxsUGFyYW1zIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvRHluYW1pY1Rvb2xDYWxsUGFyYW1zLmpzJztcbmltcG9ydCB0eXBlIHsgRHluYW1pY1Rvb2xDYWxsUmVzcG9uc2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9EeW5hbWljVG9vbENhbGxSZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IER5bmFtaWNUb29sQ2FsbE91dHB1dENvbnRlbnRJdGVtIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvRHluYW1pY1Rvb2xDYWxsT3V0cHV0Q29udGVudEl0ZW0uanMnO1xuaW1wb3J0IHR5cGUgeyBUb29sUmVxdWVzdFVzZXJJbnB1dFBhcmFtcyB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL1Rvb2xSZXF1ZXN0VXNlcklucHV0UGFyYW1zLmpzJztcbmltcG9ydCB0eXBlIHsgVG9vbFJlcXVlc3RVc2VySW5wdXRRdWVzdGlvbiB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL1Rvb2xSZXF1ZXN0VXNlcklucHV0UXVlc3Rpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBUb29sUmVxdWVzdFVzZXJJbnB1dFJlc3BvbnNlIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvVG9vbFJlcXVlc3RVc2VySW5wdXRSZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IEpzb25WYWx1ZSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3NlcmRlX2pzb24vSnNvblZhbHVlLmpzJztcbmltcG9ydCB0eXBlIHsgR2V0QWNjb3VudFJlc3BvbnNlIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvR2V0QWNjb3VudFJlc3BvbnNlLmpzJztcbmltcG9ydCB0eXBlIHsgTW9kZWxMaXN0UmVzcG9uc2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9Nb2RlbExpc3RSZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFRocmVhZCB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL1RocmVhZC5qcyc7XG5pbXBvcnQgdHlwZSB7IFRocmVhZExpc3RSZXNwb25zZSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL1RocmVhZExpc3RSZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFRocmVhZFJlYWRSZXNwb25zZSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL1RocmVhZFJlYWRSZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFRocmVhZEZvcmtSZXNwb25zZSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL1RocmVhZEZvcmtSZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFRocmVhZFN0YXJ0UmVzcG9uc2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9UaHJlYWRTdGFydFJlc3BvbnNlLmpzJztcbmltcG9ydCB0eXBlIHsgVGhyZWFkUmVzdW1lUmVzcG9uc2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9UaHJlYWRSZXN1bWVSZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFR1cm5Db21wbGV0ZWROb3RpZmljYXRpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9UdXJuQ29tcGxldGVkTm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgVHVyblN0YXJ0ZWROb3RpZmljYXRpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9UdXJuU3RhcnRlZE5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IEl0ZW1TdGFydGVkTm90aWZpY2F0aW9uIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvSXRlbVN0YXJ0ZWROb3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBJdGVtQ29tcGxldGVkTm90aWZpY2F0aW9uIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvSXRlbUNvbXBsZXRlZE5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IFR1cm5TdGFydFBhcmFtcyB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL1R1cm5TdGFydFBhcmFtcy5qcyc7XG5pbXBvcnQgdHlwZSB7IFVzZXJJbnB1dCB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL1VzZXJJbnB1dC5qcyc7XG5pbXBvcnQgdHlwZSB7IExpc3RNY3BTZXJ2ZXJTdGF0dXNSZXNwb25zZSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0xpc3RNY3BTZXJ2ZXJTdGF0dXNSZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IE1jcFNlcnZlclRvb2xDYWxsUmVzcG9uc2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9NY3BTZXJ2ZXJUb29sQ2FsbFJlc3BvbnNlLmpzJztcbmltcG9ydCB0eXBlIHsgTWNwUmVzb3VyY2VSZWFkUmVzcG9uc2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9NY3BSZXNvdXJjZVJlYWRSZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IE1jcFNlcnZlclN0YXJ0dXBTdGF0ZSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL01jcFNlcnZlclN0YXJ0dXBTdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IE1jcFNlcnZlckVsaWNpdGF0aW9uUmVxdWVzdFBhcmFtcyB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL01jcFNlcnZlckVsaWNpdGF0aW9uUmVxdWVzdFBhcmFtcy5qcyc7XG5pbXBvcnQgdHlwZSB7IE1jcFNlcnZlckVsaWNpdGF0aW9uUmVxdWVzdFJlc3BvbnNlIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvTWNwU2VydmVyRWxpY2l0YXRpb25SZXF1ZXN0UmVzcG9uc2UuanMnO1xuaW1wb3J0IHR5cGUgeyBTa2lsbHNMaXN0UmVzcG9uc2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9Ta2lsbHNMaXN0UmVzcG9uc2UuanMnO1xuaW1wb3J0IHR5cGUgeyBIb29rc0xpc3RSZXNwb25zZSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0hvb2tzTGlzdFJlc3BvbnNlLmpzJztcbmltcG9ydCB0eXBlIHsgSXRlbUd1YXJkaWFuQXBwcm92YWxSZXZpZXdDb21wbGV0ZWROb3RpZmljYXRpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9JdGVtR3VhcmRpYW5BcHByb3ZhbFJldmlld0NvbXBsZXRlZE5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IEd1YXJkaWFuV2FybmluZ05vdGlmaWNhdGlvbiB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0d1YXJkaWFuV2FybmluZ05vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IFRocmVhZEFwcHJvdmVHdWFyZGlhbkRlbmllZEFjdGlvblJlc3BvbnNlIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvVGhyZWFkQXBwcm92ZUd1YXJkaWFuRGVuaWVkQWN0aW9uUmVzcG9uc2UuanMnO1xuaW1wb3J0IHR5cGUgeyBDb25maWdSZWFkUmVzcG9uc2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9Db25maWdSZWFkUmVzcG9uc2UuanMnO1xuaW1wb3J0IHR5cGUgeyBDb25maWdXcml0ZVJlc3BvbnNlIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvQ29uZmlnV3JpdGVSZXNwb25zZS5qcyc7XG5pbXBvcnQgeyBmb3JtYXRHdWFyZGlhbkRlbmlhbE5vdGlmaWNhdGlvbiwgc3VtbWFyaXplR3VhcmRpYW5SZXZpZXdBY3Rpb24sIHRvR3VhcmRpYW5Bc3Nlc3NtZW50RXZlbnRKc29uIH0gZnJvbSAnLi9jb2RleEd1YXJkaWFuUmV2aWV3LmpzJztcblxuY29uc3QgQ0xJRU5UX0lORk8gPSB7XG5cdG5hbWU6ICd2c2NvZGVfYWdlbnRfaG9zdCcsXG5cdHRpdGxlOiAnVlMgQ29kZSBBZ2VudCBIb3N0Jyxcblx0Ly8gVGhlIGNvZGV4IGBjbGllbnRJbmZvLnZlcnNpb25gIGlzIGluZm9ybWF0aW9uYWwuIEhhcmRjb2RlZCB0byBhXG5cdC8vIG5vbi1lbXB0eSBwbGFjZWhvbGRlcjsgYnVtcGluZyBpdCBpc24ndCByZXF1aXJlZCB3aGVuIG91ciBjb2RlXG5cdC8vIGNoYW5nZXMuXG5cdHZlcnNpb246ICcwLjEuMCcsXG59O1xuXG5jb25zdCBDT0RFWF9USElOS0lOR19MRVZFTF9LRVkgPSAndGhpbmtpbmdMZXZlbCc7XG5cbi8qKlxuICogVXNlci1hZ2VudCBwcmVmaXggYXBwbGllZCB0byB0aGUgQ29kZXggYWdlbnQncyBvdXRib3VuZCBDQVBJIGNhbGxzIChlLmcuIHRoZVxuICogbW9kZWwtbGlzdCBmZXRjaCkgc28gdGhlIHRyYWZmaWMgaXMgaWRlbnRpZmlhYmxlIHNlcnZlci1zaWRlLiBNaXJyb3JzXG4gKiBgY2xhdWRlQWdlbnQudHNgIGFuZCB0aGUgYHZzY29kZV9jb2RleGAgcHJlZml4IHVzZWQgYnkgYGNvZGV4UHJveHlTZXJ2aWNlLnRzYFxuICogYW5kIGBvYWlMYW5ndWFnZU1vZGVsU2VydmVyLnRzYC5cbiAqL1xuY29uc3QgVVNFUl9BR0VOVF9QUkVGSVggPSAndnNjb2RlX2NvZGV4JztcblxuY29uc3QgQ09ERVhfUkVBU09OSU5HX0VGRk9SVFM6IHJlYWRvbmx5IFJlYXNvbmluZ0VmZm9ydFtdID0gWydtaW5pbWFsJywgJ2xvdycsICdtZWRpdW0nLCAnaGlnaCddO1xuXG4vKipcbiAqIE1DUCBBcHAgY2FwYWJpbGl0aWVzIGFkdmVydGlzZWQgb24gZXZlcnkgY29kZXggTUNQIHNlcnZlci4gTWlycm9yc1xuICoge0BsaW5rIERFRkFVTFRfTUNQX0FQUF9DQVBBQklMSVRJRVN9IGJ1dCBvbWl0cyBgc2FtcGxpbmdgOiBjb2RleCBvd25zXG4gKiB0aGUgbW9kZWwgY29ubmVjdGlvbiAodGhyb3VnaCB0aGUgYHZzY29kZS1wcm94eWAgcHJvdmlkZXIpIGFuZCBleHBvc2VzXG4gKiBubyBhcHAtc2VydmVyIFJQQyBmb3IgQXBwLWluaXRpYXRlZCBgc2FtcGxpbmcvY3JlYXRlTWVzc2FnZWAsIHNvIHRoZVxuICogaG9zdCBjYW5ub3Qgc2VydmUgdGhhdCBjYXBhYmlsaXR5IGZvciBjb2RleC5cbiAqL1xuY29uc3QgQ09ERVhfTUNQX0FQUF9DQVBBQklMSVRJRVM6IEFocE1jcFVpSG9zdENhcGFiaWxpdGllcyA9IHtcblx0c2VydmVyVG9vbHM6IHsgbGlzdENoYW5nZWQ6IHRydWUgfSxcblx0c2VydmVyUmVzb3VyY2VzOiB7fSxcbn07XG5cbi8qKlxuICogQ29kZXggc3VyZmFjZXMgYW4gTUNQIHRvb2wtY2FsbCBhcHByb3ZhbCBhcyBhIGByZXF1ZXN0X3VzZXJfaW5wdXRgXG4gKiBxdWVzdGlvbiB3aG9zZSBpZCBpcyBgbWNwX3Rvb2xfY2FsbF9hcHByb3ZhbF88Y2FsbElkPmAgKHRoZSBgPGNhbGxJZD5gXG4gKiBtYXRjaGVzIHRoZSBgbWNwVG9vbENhbGxgIGl0ZW0gaWQpLiBUaGUgaG9zdCBpbnRlcmNlcHRzIHRoZXNlIGFuZCByZW5kZXJzXG4gKiB0aGVtIG9uIHRoZSBub3JtYWwgdG9vbC1hcHByb3ZhbCBjYXJkIGluc3RlYWQgb2YgYSBjaGF0LWlucHV0IHF1ZXN0aW9uO1xuICogc2VlIHtAbGluayBDb2RleEFnZW50Ll9oYW5kbGVNY3BUb29sQXBwcm92YWxWaWFDYXJkfS5cbiAqXG4gKiBDb2RleCBkZWNvZGVzIHRoZSBhbnN3ZXIgc3RyaW5nIGJhY2sgaW50byBhIGRlY2lzaW9uOiBgQWxsb3dgIGFjY2VwdHMgdGhlXG4gKiBjYWxsLCB0aGUgc3ludGhldGljIGBfX2NvZGV4X21jcF9kZWNsaW5lX19gIHJlamVjdHMgaXQgKGFueXRoaW5nIGVsc2UgaXNcbiAqIHRyZWF0ZWQgYXMgYSBjYW5jZWwpLiBUaGVzZSBtaXJyb3IgdGhlIGNvbnN0YW50cyBpbiBjb2RleFxuICogYGNvcmUvc3JjL21jcF90b29sX2NhbGwucnNgLlxuICovXG5jb25zdCBNQ1BfVE9PTF9BUFBST1ZBTF9RVUVTVElPTl9JRF9QUkVGSVggPSAnbWNwX3Rvb2xfY2FsbF9hcHByb3ZhbF8nO1xuY29uc3QgTUNQX1RPT0xfQVBQUk9WQUxfQU5TV0VSX0FMTE9XID0gJ0FsbG93JztcbmNvbnN0IE1DUF9UT09MX0FQUFJPVkFMX0FOU1dFUl9ERUNMSU5FID0gJ19fY29kZXhfbWNwX2RlY2xpbmVfXyc7XG5cbi8qKlxuICogYHN1cHBvcnRlZF9lbmRwb2ludHNgIHZhbHVlIChvbiBhIENvcGlsb3QgQ0FQSSB7QGxpbmsgQ0NBTW9kZWx9KSB0aGF0IG1hcmtzXG4gKiBhIG1vZGVsIGFzIHJlYWNoYWJsZSB0aHJvdWdoIENBUEkncyBPcGVuQUktc2hhcGVkIFJlc3BvbnNlcyBlbmRwb2ludC4gQ29kZXhcbiAqIG9ubHkgZHJpdmVzIG1vZGVscyB2aWEgdGhpcyBlbmRwb2ludCAodGhlIGB2c2NvZGUtcHJveHlgIHByb3ZpZGVyIHVzZXNcbiAqIGB3aXJlX2FwaT1cInJlc3BvbnNlc1wiYCksIHNvIHRoZSBtb2RlbCBwaWNrZXIgaXMgZmlsdGVyZWQgdG8gbW9kZWxzIHRoYXRcbiAqIGFkdmVydGlzZSBpdC4gQ29uZmlybWVkIGFnYWluc3QgdGhlIGxpdmUgQ0FQSSBjYXRhbG9nOiBncHQtNS54IC8gZ3B0LTUqLWNvZGV4XG4gKiAvIG1haS1jb2RlIGNhcnJ5IGAvcmVzcG9uc2VzYDsgQW50aHJvcGljIG1vZGVscyBjYXJyeSBgL3YxL21lc3NhZ2VzYCBhbmRcbiAqIGNoYXQtb25seSBtb2RlbHMgY2FycnkgYC9jaGF0L2NvbXBsZXRpb25zYCAobmVpdGhlciBpcyB1c2FibGUgYnkgY29kZXgpLlxuICovXG5jb25zdCBDT0RFWF9SRVNQT05TRVNfRU5EUE9JTlQgPSAnL3Jlc3BvbnNlcyc7XG5cbi8qKlxuICogQ29kZXgncyBBZ2VudCBNb2RlIHNjaGVtYSwgZGVyaXZlZCBmcm9tIHRoZSBwbGF0Zm9ybS1nZW5lcmljIE1vZGUgc2NoZW1hIGJ1dFxuICogd2l0aCBcIkF1dG9waWxvdFwiIHJlbW92ZWQuIENvZGV4IGhhcyBvbmx5IHR3byBuYXRpdmUgY29sbGFib3JhdGlvbiBtb2RlcyBcdTIwMTRcbiAqIGBwbGFuYCBhbmQgYGRlZmF1bHRgIChzZWUge0BsaW5rIE1vZGVLaW5kfSkgXHUyMDE0IHNvIFwiQXV0b3BpbG90XCIgd291bGQgbWFwIHRvXG4gKiBgZGVmYXVsdGAsIGlkZW50aWNhbCB0byBcIkludGVyYWN0aXZlXCIsIGFuZCBvZmZlcmluZyBpdCBpbiB0aGUgcGlja2VyIHdvdWxkIGJlXG4gKiBhIG5vLW9wIGR1cGxpY2F0ZS4gTGFiZWxzIGFuZCBkZXNjcmlwdGlvbnMgYXJlIHNsaWNlZCBieSBpbmRleCBzbyB0aGV5IHN0YXlcbiAqIGluIHN5bmMgd2l0aCB0aGUgcGxhdGZvcm0gc2NoZW1hLlxuICovXG5mdW5jdGlvbiBjcmVhdGVDb2RleE1vZGVTY2hlbWEoKTogSVNjaGVtYVByb3BlcnR5PFNlc3Npb25Nb2RlPiB7XG5cdGNvbnN0IGJhc2UgPSBwbGF0Zm9ybVNlc3Npb25TY2hlbWEuZGVmaW5pdGlvbltTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdLnByb3RvY29sO1xuXHRjb25zdCBrZXB0ID0gKGJhc2UuZW51bSA/PyBbXSkuZmxhdE1hcCgodmFsdWUsIGluZGV4KSA9PiB2YWx1ZSA9PT0gJ2F1dG9waWxvdCcgPyBbXSA6IFtpbmRleF0pO1xuXHRyZXR1cm4gc2NoZW1hUHJvcGVydHk8U2Vzc2lvbk1vZGU+KHtcblx0XHQuLi5iYXNlLFxuXHRcdGVudW06IGtlcHQubWFwKGluZGV4ID0+IGJhc2UuZW51bSFbaW5kZXhdKSxcblx0XHRlbnVtTGFiZWxzOiBiYXNlLmVudW1MYWJlbHMgJiYga2VwdC5tYXAoaW5kZXggPT4gYmFzZS5lbnVtTGFiZWxzIVtpbmRleF0pLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IGJhc2UuZW51bURlc2NyaXB0aW9ucyAmJiBrZXB0Lm1hcChpbmRleCA9PiBiYXNlLmVudW1EZXNjcmlwdGlvbnMhW2luZGV4XSksXG5cdH0pO1xufVxuXG5jb25zdCBjb2RleFNlc3Npb25Db25maWdTY2hlbWEgPSBjcmVhdGVTY2hlbWEoe1xuXHRbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zUHJlc2V0XTogc2NoZW1hUHJvcGVydHk8Q29kZXhQZXJtaXNzaW9uc1ByZXNldD4oe1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5wZXJtaXNzaW9uc1ByZXNldCcsIFwiQXBwcm92YWxzXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5wZXJtaXNzaW9uc1ByZXNldERlc2NyaXB0aW9uJywgXCJIb3cgbXVjaCBDb2RleCBjYW4gZG8gb24gaXRzIG93biBiZWZvcmUgYXNraW5nIGZvciBhcHByb3ZhbC5cIiksXG5cdFx0ZW51bTogWy4uLkNPREVYX1BFUk1JU1NJT05TX1BSRVNFVFNdLFxuXHRcdGVudW1MYWJlbHM6IFtcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25zUHJlc2V0LmRlZmF1bHQnLCBcIkRlZmF1bHQgUGVybWlzc2lvbnNcIiksXG5cdFx0XHRsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5wZXJtaXNzaW9uc1ByZXNldC5hdXRvUmV2aWV3JywgXCJBdXRvLVJldmlld1wiKSxcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25zUHJlc2V0LmZ1bGxBY2Nlc3MnLCBcIkZ1bGwgQWNjZXNzXCIpLFxuXHRcdF0sXG5cdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcucGVybWlzc2lvbnNQcmVzZXQuZGVmYXVsdERlc2NyaXB0aW9uJywgXCJDb2RleCBjYW4gcmVhZCBhbmQgZWRpdCBmaWxlcyBpbiB0aGUgd29ya3NwYWNlIGFuZCBydW4gcm91dGluZSBsb2NhbCBjb21tYW5kcy4gSXQgYXNrcyBiZWZvcmUgdXNpbmcgdGhlIGludGVybmV0IG9yIGdvaW5nIGJleW9uZCB0aGUgd29ya3NwYWNlLlwiKSxcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25zUHJlc2V0LmF1dG9SZXZpZXdEZXNjcmlwdGlvbicsIFwiU2FtZSB3b3Jrc3BhY2UgYWNjZXNzIGFzIERlZmF1bHQsIGJ1dCBhcHByb3ZhbCByZXF1ZXN0cyBhcmUgcm91dGVkIHRocm91Z2ggdGhlIGF1dG8tcmV2aWV3ZXIgaW5zdGVhZCBvZiBwcm9tcHRpbmcgeW91LlwiKSxcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25zUHJlc2V0LmZ1bGxBY2Nlc3NEZXNjcmlwdGlvbicsIFwiQ29kZXggY2FuIGVkaXQgZmlsZXMgb3V0c2lkZSB0aGUgd29ya3NwYWNlIGFuZCB1c2UgdGhlIGludGVybmV0IHdpdGhvdXQgYXNraW5nLiBVc2Ugb25seSB3aGVuIHlvdSB3YW50IGZ1bGwgbWFjaGluZSBhY2Nlc3MuXCIpLFxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogQ09ERVhfREVGQVVMVF9QRVJNSVNTSU9OU19QUkVTRVQsXG5cdFx0c2Vzc2lvbk11dGFibGU6IHRydWUsXG5cdH0pLFxuXHRbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LkFwcHJvdmFsUG9saWN5XTogc2NoZW1hUHJvcGVydHk8Q29kZXhBcHByb3ZhbFBvbGljeT4oe1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5hcHByb3ZhbFBvbGljeScsIFwiQXBwcm92YWxzXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5hcHByb3ZhbFBvbGljeURlc2NyaXB0aW9uJywgXCJIb3cgQ29kZXggcmVxdWVzdHMgYXBwcm92YWwgZm9yIHRvb2wgY2FsbHMuXCIpLFxuXHRcdGVudW06IFsnbmV2ZXInLCAnb24tcmVxdWVzdCcsICdvbi1mYWlsdXJlJywgJ3VudHJ1c3RlZCddLFxuXHRcdGVudW1MYWJlbHM6IFtcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLmFwcHJvdmFsUG9saWN5Lm5ldmVyJywgXCJObyBFc2NhbGF0aW9uc1wiKSxcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLmFwcHJvdmFsUG9saWN5Lm9uUmVxdWVzdCcsIFwiQXNrIFdoZW4gTmVlZGVkXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcuYXBwcm92YWxQb2xpY3kub25GYWlsdXJlJywgXCJBc2sgb24gRmFpbHVyZVwiKSxcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLmFwcHJvdmFsUG9saWN5LnVudHJ1c3RlZCcsIFwiQXNrIE1vcmUgT2Z0ZW5cIiksXG5cdFx0XSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5hcHByb3ZhbFBvbGljeS5uZXZlckRlc2NyaXB0aW9uJywgXCJOZXZlciBhc2sgZm9yIGVsZXZhdGVkIHBlcm1pc3Npb247IGNvbW1hbmRzIHRoYXQgY2Fubm90IHJ1biBpbiB0aGUgc2FuZGJveCBhcmUgcmVqZWN0ZWQuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcuYXBwcm92YWxQb2xpY3kub25SZXF1ZXN0RGVzY3JpcHRpb24nLCBcIkFzayBvbmx5IHdoZW4gQ29kZXggZGV0ZXJtaW5lcyBhIGNvbW1hbmQgbmVlZHMgZWxldmF0ZWQgcGVybWlzc2lvbi5cIiksXG5cdFx0XHRsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5hcHByb3ZhbFBvbGljeS5vbkZhaWx1cmVEZXNjcmlwdGlvbicsIFwiVHJ5IGNvbW1hbmRzIGluIHRoZSBzYW5kYm94IGZpcnN0LCB0aGVuIGFzayB0byByZXRyeSB3aXRoIGVsZXZhdGVkIHBlcm1pc3Npb24gaWYgdGhlIHNhbmRib3ggYmxvY2tzIHRoZW0uXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcuYXBwcm92YWxQb2xpY3kudW50cnVzdGVkRGVzY3JpcHRpb24nLCBcIkFzayBiZWZvcmUgbW9yZSBjb21tYW5kIGNhdGVnb3JpZXMgc28geW91IGNhbiByZXZpZXcgYWN0aW9ucyBtb3JlIGNsb3NlbHkuXCIpLFxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogJ29uLXJlcXVlc3QnLFxuXHRcdHNlc3Npb25NdXRhYmxlOiB0cnVlLFxuXHR9KSxcblx0W0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5TYW5kYm94TW9kZV06IHNjaGVtYVByb3BlcnR5PFNhbmRib3hNb2RlPih7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnNhbmRib3hNb2RlJywgXCJTYW5kYm94XCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5zYW5kYm94TW9kZURlc2NyaXB0aW9uJywgXCJGaWxlc3lzdGVtIGFuZCBuZXR3b3JrIHJlc3RyaWN0aW9ucyBhcHBsaWVkIHRvIHRvb2wgY2FsbHMuXCIpLFxuXHRcdGVudW06IFsncmVhZC1vbmx5JywgJ3dvcmtzcGFjZS13cml0ZScsICdkYW5nZXItZnVsbC1hY2Nlc3MnXSxcblx0XHRlbnVtTGFiZWxzOiBbXG5cdFx0XHRsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5zYW5kYm94TW9kZS5yZWFkT25seScsIFwiUmVhZC1Pbmx5XCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcuc2FuZGJveE1vZGUud29ya3NwYWNlV3JpdGUnLCBcIldvcmtzcGFjZSBXcml0ZVwiKSxcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnNhbmRib3hNb2RlLmRhbmdlckZ1bGxBY2Nlc3MnLCBcIkZ1bGwgQWNjZXNzIChEYW5nZXJvdXMpXCIpLFxuXHRcdF0sXG5cdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcuc2FuZGJveE1vZGUucmVhZE9ubHlEZXNjcmlwdGlvbicsIFwiVG9vbCBjYWxscyBjYW4gcmVhZCB0aGUgd29ya3NwYWNlIGJ1dCBjYW5ub3QgbW9kaWZ5IGZpbGVzLlwiKSxcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnNhbmRib3hNb2RlLndvcmtzcGFjZVdyaXRlRGVzY3JpcHRpb24nLCBcIlRvb2wgY2FsbHMgY2FuIHJlYWQgYW5kIHdyaXRlIHdpdGhpbiB0aGUgd29ya3NwYWNlOyBuZXR3b3JrIGlzIGNvbnRyb2xsZWQgc2VwYXJhdGVseS5cIiksXG5cdFx0XHRsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5zYW5kYm94TW9kZS5kYW5nZXJGdWxsQWNjZXNzRGVzY3JpcHRpb24nLCBcIlRvb2wgY2FsbHMgaGF2ZSB1bnJlc3RyaWN0ZWQgZGlzayBhbmQgbmV0d29yayBhY2Nlc3MuXCIpLFxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogJ3dvcmtzcGFjZS13cml0ZScsXG5cdFx0c2Vzc2lvbk11dGFibGU6IHRydWUsXG5cdH0pLFxuXHRbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LldlYlNlYXJjaE1vZGVdOiBzY2hlbWFQcm9wZXJ0eTxXZWJTZWFyY2hNb2RlPih7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLndlYlNlYXJjaE1vZGUnLCBcIldlYiBTZWFyY2hcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLndlYlNlYXJjaE1vZGVEZXNjcmlwdGlvbicsIFwiV2ViLXNlYXJjaCB0b29sIGF2YWlsYWJpbGl0eSBmb3IgdGhlIG1vZGVsLlwiKSxcblx0XHRlbnVtOiBbJ2Rpc2FibGVkJywgJ2NhY2hlZCcsICdsaXZlJ10sXG5cdFx0ZW51bUxhYmVsczogW1xuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcud2ViU2VhcmNoTW9kZS5kaXNhYmxlZCcsIFwiRGlzYWJsZWRcIiksXG5cdFx0XHRsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy53ZWJTZWFyY2hNb2RlLmNhY2hlZCcsIFwiQ2FjaGVkIE9ubHlcIiksXG5cdFx0XHRsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy53ZWJTZWFyY2hNb2RlLmxpdmUnLCBcIkxpdmVcIiksXG5cdFx0XSxcblx0XHRkZWZhdWx0OiAnZGlzYWJsZWQnLFxuXHRcdHNlc3Npb25NdXRhYmxlOiBmYWxzZSxcblx0fSksXG5cdFtDb2RleFNlc3Npb25Db25maWdLZXkuTW9kZWxSZWFzb25pbmdFZmZvcnRdOiBzY2hlbWFQcm9wZXJ0eTxSZWFzb25pbmdFZmZvcnQ+KHtcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcubW9kZWxSZWFzb25pbmdFZmZvcnQnLCBcIlJlYXNvbmluZyBFZmZvcnRcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLm1vZGVsUmVhc29uaW5nRWZmb3J0RGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIGhvdyBtdWNoIHJlYXNvbmluZyBlZmZvcnQgQ29kZXggdXNlcy5cIiksXG5cdFx0ZW51bTogWy4uLkNPREVYX1JFQVNPTklOR19FRkZPUlRTXSxcblx0XHRlbnVtTGFiZWxzOiBDT0RFWF9SRUFTT05JTkdfRUZGT1JUUy5tYXAoZ2V0UmVhc29uaW5nRWZmb3J0TGFiZWwpLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IENPREVYX1JFQVNPTklOR19FRkZPUlRTLm1hcChlZmZvcnQgPT4gZ2V0UmVhc29uaW5nRWZmb3J0RGVzY3JpcHRpb24oZWZmb3J0KSA/PyAnJyksXG5cdFx0ZGVmYXVsdDogJ21lZGl1bScsXG5cdFx0c2Vzc2lvbk11dGFibGU6IHRydWUsXG5cdH0pLFxuXHRbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXTogY3JlYXRlQ29kZXhNb2RlU2NoZW1hKCksXG5cdFtDb2RleFNlc3Npb25Db25maWdLZXkuUGVyc29uYWxpdHldOiBzY2hlbWFQcm9wZXJ0eTxQZXJzb25hbGl0eT4oe1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5wZXJzb25hbGl0eScsIFwiUGVyc29uYWxpdHlcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnBlcnNvbmFsaXR5RGVzY3JpcHRpb24nLCBcIlRvbmUgQ29kZXggdXNlcyB3aGVuIGNvbW11bmljYXRpbmcuXCIpLFxuXHRcdGVudW06IFsnbm9uZScsICdmcmllbmRseScsICdwcmFnbWF0aWMnXSxcblx0XHRlbnVtTGFiZWxzOiBbXG5cdFx0XHRsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5wZXJzb25hbGl0eS5ub25lJywgXCJEZWZhdWx0XCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcucGVyc29uYWxpdHkuZnJpZW5kbHknLCBcIkZyaWVuZGx5XCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcucGVyc29uYWxpdHkucHJhZ21hdGljJywgXCJQcmFnbWF0aWNcIiksXG5cdFx0XSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5wZXJzb25hbGl0eS5ub25lRGVzY3JpcHRpb24nLCBcIlVzZSBDb2RleCdzIGJ1aWx0LWluIGRlZmF1bHQgdG9uZS5cIiksXG5cdFx0XHRsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5wZXJzb25hbGl0eS5mcmllbmRseURlc2NyaXB0aW9uJywgXCJXYXJtZXIsIG1vcmUgY29udmVyc2F0aW9uYWwgdG9uZS5cIiksXG5cdFx0XHRsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5wZXJzb25hbGl0eS5wcmFnbWF0aWNEZXNjcmlwdGlvbicsIFwiVGVyc2UsIG5vLW5vbnNlbnNlIHRvbmUgZm9jdXNlZCBvbiBhY3Rpb25zLlwiKSxcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdub25lJyxcblx0XHRzZXNzaW9uTXV0YWJsZTogdHJ1ZSxcblx0fSksXG5cdFtDb2RleFNlc3Npb25Db25maWdLZXkuUmVhc29uaW5nU3VtbWFyeV06IHNjaGVtYVByb3BlcnR5PFJlYXNvbmluZ1N1bW1hcnk+KHtcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcucmVhc29uaW5nU3VtbWFyeScsIFwiUmVhc29uaW5nIFN1bW1hcnlcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnJlYXNvbmluZ1N1bW1hcnlEZXNjcmlwdGlvbicsIFwiSG93IENvZGV4IHN1bW1hcml6ZXMgaXRzIHJlYXNvbmluZyBpbiB0aGUgcmVzcG9uc2Ugc3RyZWFtLlwiKSxcblx0XHRlbnVtOiBbJ2F1dG8nLCAnY29uY2lzZScsICdkZXRhaWxlZCcsICdub25lJ10sXG5cdFx0ZW51bUxhYmVsczogW1xuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcucmVhc29uaW5nU3VtbWFyeS5hdXRvJywgXCJBdXRvXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcucmVhc29uaW5nU3VtbWFyeS5jb25jaXNlJywgXCJDb25jaXNlXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcucmVhc29uaW5nU3VtbWFyeS5kZXRhaWxlZCcsIFwiRGV0YWlsZWRcIiksXG5cdFx0XHRsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5yZWFzb25pbmdTdW1tYXJ5Lm5vbmUnLCBcIk5vbmVcIiksXG5cdFx0XSxcblx0XHRkZWZhdWx0OiAnYXV0bycsXG5cdFx0c2Vzc2lvbk11dGFibGU6IHRydWUsXG5cdH0pLFxuXHRbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LkFkZGl0aW9uYWxEaXJlY3Rvcmllc106IHNjaGVtYVByb3BlcnR5PHN0cmluZ1tdPih7XG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcuYWRkaXRpb25hbERpcmVjdG9yaWVzJywgXCJBZGRpdGlvbmFsIFdyaXRhYmxlIERpcmVjdG9yaWVzXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5hZGRpdGlvbmFsRGlyZWN0b3JpZXNEZXNjcmlwdGlvbicsIFwiQWJzb2x1dGUgcGF0aHMgdGhlIHNhbmRib3ggaXMgYWxsb3dlZCB0byB3cml0ZSB0bywgaW4gYWRkaXRpb24gdG8gdGhlIHdvcmtzcGFjZS4gT25seSBhcHBsaWVzIHdoZW4gU2FuZGJveCBpcyBXb3Jrc3BhY2UgV3JpdGUuXCIpLFxuXHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogbG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcuYWRkaXRpb25hbERpcmVjdG9yaWVzLml0ZW0nLCBcIkRpcmVjdG9yeVwiKSB9LFxuXHRcdGVudW1EeW5hbWljOiB0cnVlLFxuXHRcdGRlZmF1bHQ6IFtdLFxuXHRcdHNlc3Npb25NdXRhYmxlOiB0cnVlLFxuXHR9KSxcblx0W0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5OZXR3b3JrQWNjZXNzRW5hYmxlZF06IHNjaGVtYVByb3BlcnR5PGJvb2xlYW4+KHtcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLm5ldHdvcmtBY2Nlc3NFbmFibGVkJywgXCJOZXR3b3JrXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5uZXR3b3JrQWNjZXNzRW5hYmxlZERlc2NyaXB0aW9uJywgXCJBbGxvdyBzYW5kYm94ZWQgdG9vbCBjYWxscyB0byBtYWtlIG91dGJvdW5kIG5ldHdvcmsgcmVxdWVzdHMuIE9ubHkgYXBwbGllcyB3aGVuIFNhbmRib3ggaXMgV29ya3NwYWNlIFdyaXRlLlwiKSxcblx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRzZXNzaW9uTXV0YWJsZTogdHJ1ZSxcblx0fSksXG5cdFtTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zXTogcGxhdGZvcm1TZXNzaW9uU2NoZW1hLmRlZmluaXRpb25bU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc10sXG59KTtcblxuY29uc3QgY29kZXhWaXNpYmxlU2Vzc2lvbkNvbmZpZ1NjaGVtYSA9IGNyZWF0ZVNjaGVtYSh7XG5cdFtTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdOiBjb2RleFNlc3Npb25Db25maWdTY2hlbWEuZGVmaW5pdGlvbltTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdLFxuXHRbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zUHJlc2V0XTogY29kZXhTZXNzaW9uQ29uZmlnU2NoZW1hLmRlZmluaXRpb25bQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zUHJlc2V0XSxcblx0W1Nlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNdOiBwbGF0Zm9ybVNlc3Npb25TY2hlbWEuZGVmaW5pdGlvbltTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zXSxcbn0pO1xuXG5pbnRlcmZhY2UgSUNvZGV4U2Vzc2lvbkNvbmZpZ0RlZmF1bHRzIHtcblx0cmVhZG9ubHkgW0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc1ByZXNldF06IENvZGV4UGVybWlzc2lvbnNQcmVzZXQ7XG5cdHJlYWRvbmx5IFtDb2RleFNlc3Npb25Db25maWdLZXkuQXBwcm92YWxQb2xpY3ldOiBDb2RleEFwcHJvdmFsUG9saWN5O1xuXHRyZWFkb25seSBbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlNhbmRib3hNb2RlXTogU2FuZGJveE1vZGU7XG5cdHJlYWRvbmx5IFtDb2RleFNlc3Npb25Db25maWdLZXkuV2ViU2VhcmNoTW9kZV06IFdlYlNlYXJjaE1vZGU7XG5cdHJlYWRvbmx5IFtDb2RleFNlc3Npb25Db25maWdLZXkuTW9kZWxSZWFzb25pbmdFZmZvcnRdOiBSZWFzb25pbmdFZmZvcnQ7XG5cdHJlYWRvbmx5IFtDb2RleFNlc3Npb25Db25maWdLZXkuQWRkaXRpb25hbERpcmVjdG9yaWVzXTogc3RyaW5nW107XG5cdHJlYWRvbmx5IFtDb2RleFNlc3Npb25Db25maWdLZXkuTmV0d29ya0FjY2Vzc0VuYWJsZWRdOiBib29sZWFuO1xuXHRyZWFkb25seSBbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXTogU2Vzc2lvbk1vZGU7XG5cdHJlYWRvbmx5IFtDb2RleFNlc3Npb25Db25maWdLZXkuUGVyc29uYWxpdHldOiBQZXJzb25hbGl0eTtcblx0cmVhZG9ubHkgW0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5SZWFzb25pbmdTdW1tYXJ5XTogUmVhc29uaW5nU3VtbWFyeTtcbn1cblxuY29uc3QgY29kZXhTZXNzaW9uQ29uZmlnRGVmYXVsdHM6IElDb2RleFNlc3Npb25Db25maWdEZWZhdWx0cyA9IHtcblx0W0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc1ByZXNldF06IENPREVYX0RFRkFVTFRfUEVSTUlTU0lPTlNfUFJFU0VULFxuXHRbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LkFwcHJvdmFsUG9saWN5XTogJ29uLXJlcXVlc3QnLFxuXHRbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlNhbmRib3hNb2RlXTogJ3dvcmtzcGFjZS13cml0ZScsXG5cdFtDb2RleFNlc3Npb25Db25maWdLZXkuV2ViU2VhcmNoTW9kZV06ICdkaXNhYmxlZCcsXG5cdFtDb2RleFNlc3Npb25Db25maWdLZXkuTW9kZWxSZWFzb25pbmdFZmZvcnRdOiAnbWVkaXVtJyxcblx0W0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5BZGRpdGlvbmFsRGlyZWN0b3JpZXNdOiBbXSxcblx0W0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5OZXR3b3JrQWNjZXNzRW5hYmxlZF06IGZhbHNlLFxuXHRbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXTogJ2ludGVyYWN0aXZlJyxcblx0W0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5QZXJzb25hbGl0eV06ICdub25lJyxcblx0W0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5SZWFzb25pbmdTdW1tYXJ5XTogJ2F1dG8nLFxufTtcblxuZnVuY3Rpb24gZGlzdGluY3RBYnNvbHV0ZVBhdGhzKHBhdGhzOiByZWFkb25seSBzdHJpbmdbXSk6IHN0cmluZ1tdIHtcblx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgcGF0aCBvZiBwYXRocykge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemUocGF0aCk7XG5cdFx0Y29uc3Qga2V5ID0gZmlsZXN5c3RlbVBhdGhDb21wYXJpc29uS2V5KG5vcm1hbGl6ZWQpO1xuXHRcdGlmIChrZXkgJiYgIXNlZW4uaGFzKGtleSkpIHtcblx0XHRcdHNlZW4uYWRkKGtleSk7XG5cdFx0XHRyZXN1bHQucHVzaChub3JtYWxpemVkKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gZGlzdGluY3RXb3JraW5nRGlyZWN0b3JpZXMoZGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkKTogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQge1xuXHRpZiAoIWRpcmVjdG9yaWVzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IHJlc3VsdDogVVJJW10gPSBbXTtcblx0Zm9yIChjb25zdCBkaXJlY3Rvcnkgb2YgZGlyZWN0b3JpZXMpIHtcblx0XHRjb25zdCBwYXRoID0gbm9ybWFsaXplKGRpcmVjdG9yeS5mc1BhdGgpO1xuXHRcdGNvbnN0IGtleSA9IGZpbGVzeXN0ZW1QYXRoQ29tcGFyaXNvbktleShwYXRoKTtcblx0XHRpZiAoa2V5ICYmICFzZWVuLmhhcyhrZXkpKSB7XG5cdFx0XHRzZWVuLmFkZChrZXkpO1xuXHRcdFx0cmVzdWx0LnB1c2goZGlyZWN0b3J5KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdC5sZW5ndGggPiAwID8gcmVzdWx0IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBmaWxlc3lzdGVtUGF0aENvbXBhcmlzb25LZXkocGF0aDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFpc0Fic29sdXRlKHBhdGgpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCByZXNvdXJjZSA9IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLnJlbW92ZVRyYWlsaW5nUGF0aFNlcGFyYXRvcihVUkkuZmlsZShwYXRoKSk7XG5cdHJldHVybiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5nZXRDb21wYXJpc29uS2V5KHJlc291cmNlKTtcbn1cblxuY29uc3QgQ29kZXhQcmV3YXJtVHRsTXMgPSA2MF8wMDA7XG5cbi8qKlxuICogUGVyLXNlc3Npb24gYm9va2tlZXBpbmcuIFRoZSBjb2RleCB0aHJlYWQgaXMgb3duZWQgYnkgdGhlIHNoYXJlZFxuICogY29ubmVjdGlvbiBpbiB7QGxpbmsgQ29kZXhBZ2VudH07IHRoaXMgc3RydWN0IG9ubHkgdHJhY2tzIHdoYXQgdGhlXG4gKiBgSUFnZW50YCBzdXJmYWNlIG5lZWRzLlxuICovXG4vKiogUmVzb2x2ZWQgdXNlci1pbnB1dCBhbnN3ZXIgY2FwdHVyZWQgZnJvbSB0aGUgY2xpZW50J3MgYGNoYXQvaW5wdXRDb21wbGV0ZWRgLiAqL1xuaW50ZXJmYWNlIElDb2RleFVzZXJJbnB1dFJlc3VsdCB7XG5cdHJlYWRvbmx5IHJlc3BvbnNlOiBDaGF0SW5wdXRSZXNwb25zZUtpbmQ7XG5cdHJlYWRvbmx5IGFuc3dlcnM/OiBSZWNvcmQ8c3RyaW5nLCBDaGF0SW5wdXRBbnN3ZXI+O1xufVxuXG5pbnRlcmZhY2UgSUNvZGV4U2Vzc2lvbiB7XG5cdC8qKiBDYWxsZXItZmFjaW5nIHNlc3Npb24gaWQgdXNlZCBpbiB0aGUgYGNvZGV4Oi88aWQ+YCBVUkk7IG1heSBkaWZmZXIgZnJvbSB0aGUgY29kZXggdGhyZWFkIGlkLiAqL1xuXHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZztcblx0LyoqXG5cdCAqIENvZGV4IGFwcC1zZXJ2ZXIgdGhyZWFkIGlkIHVzZWQgaW4gSlNPTi1SUEMgYHRocmVhZC8qYCBhbmQgYHR1cm4vKmAgY2FsbHMuXG5cdCAqIFVuZGVmaW5lZCB1bnRpbCB0aGUgc2Vzc2lvbiBoYXMgYmVlbiBtYXRlcmlhbGl6ZWQgKGZpcnN0IGBzZW5kTWVzc2FnZWBcblx0ICogdHJpZ2dlcnMgYHRocmVhZC9zdGFydGApLiBEZWNvdXBsaW5nIG1hdGVyaWFsaXphdGlvbiBmcm9tXG5cdCAqIGBjcmVhdGVTZXNzaW9uYCBtaXJyb3JzIHRoZSBDbGF1ZGUgaGFybmVzcydzIHByb3Zpc2lvbmFsL21hdGVyaWFsaXplXG5cdCAqIHNwbGl0IGFuZCBhdm9pZHMgc3Bhd25pbmcgYW4gb3JwaGFuIGNvZGV4IHRocmVhZCB3aGVuIHRoZSB3b3JrYmVuY2hcblx0ICogcmViaW5kcyBhIHByb3Zpc2lvbmFsIFVSSSBhZnRlciBhIGNoaXAtc2VsZWN0aW9uLlxuXHQgKi9cblx0dGhyZWFkSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc2Vzc2lvblVyaTogVVJJO1xuXHQvKipcblx0ICogRWZmZWN0aXZlIHdvcmtpbmcgZGlyZWN0b3J5LiBTdGFydHMgYXMgdGhlIGZvbGRlciB0aGUgY2xpZW50IHBhc3NlZCB0b1xuXHQgKiB7QGxpbmsgQ29kZXhBZ2VudC5jcmVhdGVTZXNzaW9ufTsgYXQgZmlyc3QgbWF0ZXJpYWxpemF0aW9uIGl0IGlzIHJlcGxhY2VkXG5cdCAqIHdpdGggdGhlIGhvc3QtcmVzb2x2ZWQgd29ya2luZyBkaXJlY3RvcnkgKHRoZSBpc29sYXRlZCB3b3JrdHJlZSBmb3Jcblx0ICogd29ya3RyZWUtaXNvbGF0aW9uIHNlc3Npb25zKSBiZWZvcmUgYHRocmVhZC9zdGFydGAgbG9ja3MgdGhlIGNvZGV4XG5cdCAqIHN1YnByb2Nlc3MgYGN3ZGAuIFdoZW4gdGhlIGNsaWVudCBzdXBwbGllcyBub25lIChlLmcuIGFuIGVkaXRvciB3aW5kb3dcblx0ICogd2l0aCBubyB3b3Jrc3BhY2UgZm9sZGVyIG9wZW4pLCBhIG1hbmFnZWQgdGVtcCBmb2xkZXIgaXMgbGF6aWx5IGNyZWF0ZWRcblx0ICogYXMgYSBmYWxsYmFjayBhdCBtYXRlcmlhbGl6ZSB0aW1lICh0cmFja2VkIGJ5XG5cdCAqIHtAbGluayBtYW5hZ2VkV29ya2luZ0RpcmVjdG9yeX0gZm9yIGNsZWFudXApLiBNdXRhYmxlIHNvIGJvdGggdGhlXG5cdCAqIHdvcmt0cmVlIHN3YXAgYW5kIHRoZSBsYXp5IGFzc2lnbm1lbnQgY2FuIGhhcHBlbiBhZnRlciB0aGUgcHJvdmlzaW9uYWxcblx0ICogYGNyZWF0ZVNlc3Npb25gLlxuXHQgKi9cblx0d29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogVGhlIGZ1bGwgcmVzb2x2ZWQgd29ya2luZy1kaXJlY3Rvcnkgc2V0IGhhbmRlZCB0byB0aGUgZmlyc3Qgc2VuZCAoaW5kZXggMFxuXHQgKiA9IHRoZSBwcm9jZXNzIHJvb3QsIG1pcnJvcmVkIGluIHtAbGluayB3b3JraW5nRGlyZWN0b3J5fTsgdGhlIHRhaWwgY2Fycmllc1xuXHQgKiBhbnkgYWRkaXRpb25hbCBzZXNzaW9uIHJvb3RzKS4gUG9wdWxhdGVkIG9ubHkgd2hlbiB0aGUgaG9zdC1vd25lZCBzZW5kIGhvb2tcblx0ICogc3VwcGxpZWQgYSBzZXQsIHNvIHRoZSBtYXRlcmlhbGl6YXRpb24gcmVjZWlwdCBjYW4gcmVjb3JkIHRoZSBsb3NzbGVzcyBzZXQ7XG5cdCAqIGB1bmRlZmluZWRgIG9uIHRoZSByZXN1bWUvcmVzdG9yZSBwYXRoICh0aGUgcmVjZWlwdCB0aGVuIGVtaXRzIHRoZSBzaW5ndWxhclxuXHQgKiBgd29ya2luZ0RpcmVjdG9yeWApLlxuXHQgKi9cblx0d29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW107XG5cdHJlYWRvbmx5IG11bHRpUm9vdEVuYWJsZWQ6IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTZXQgdG8gdGhlIHRlbXAgZm9sZGVyIGNyZWF0ZWQgZm9yIHRoaXMgc2Vzc2lvbiB3aGVuIG5vIHdvcmtpbmdcblx0ICogZGlyZWN0b3J5IHdhcyBzdXBwbGllZCwgc28ge0BsaW5rIENvZGV4QWdlbnQuZGlzcG9zZVNlc3Npb259IGNhbiByZW1vdmVcblx0ICogaXQuIGB1bmRlZmluZWRgIHdoZW4gdGhlIGNsaWVudCBzdXBwbGllZCBhIHdvcmtpbmcgZGlyZWN0b3J5LlxuXHQgKi9cblx0bWFuYWdlZFdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgbWFwU3RhdGU6IElDb2RleFNlc3Npb25NYXBTdGF0ZTtcblx0LyoqXG5cdCAqIFBoYXNlIDQ6IHBhcmtlZCBkZWZlcnJlZHMgZm9yIGBpdGVtL2NvbW1hbmRFeGVjdXRpb24vcmVxdWVzdEFwcHJvdmFsYCxcblx0ICoga2V5ZWQgYnkgdGhlIGhvc3Qtc2lkZSB0b29sQ2FsbElkLiBSZXNvbHZlZCBieVxuXHQgKiB7QGxpbmsgQ29kZXhBZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uUmVxdWVzdH0uXG5cdCAqL1xuXHRyZWFkb25seSBwZW5kaW5nQ29tbWFuZEFwcHJvdmFsczogUGVuZGluZ1JlcXVlc3RSZWdpc3RyeTxDb21tYW5kRXhlY3V0aW9uQXBwcm92YWxEZWNpc2lvbj47XG5cdC8qKlxuXHQgKiBQZXItc2Vzc2lvbiBzZXQgb2YgXCJhY2NlcHQgZm9yIHNlc3Npb25cIiBkZWNpc2lvbnMuIFdoZW4gdGhlIHVzZXJcblx0ICogcGlja3MgQWNjZXB0LWZvci1TZXNzaW9uIGluIGEgcHJldmlvdXMgYXBwcm92YWwsIHN1YnNlcXVlbnRcblx0ICogYXBwcm92YWwgcmVxdWVzdHMgb24gdGhlIHNhbWUgc2Vzc2lvbiByZXNvbHZlIGF1dG9tYXRpY2FsbHkuXG5cdCAqL1xuXHRyZWFkb25seSBhY2NlcHRlZEZvclNlc3Npb246IFNldDxzdHJpbmc+O1xuXHQvKipcblx0ICogR3VhcmRpYW4gKGF1dG8tcmV2aWV3KSBgcmV2aWV3SWRgcyB0aGF0IGhhdmUgYWxyZWFkeSBiZWVuIHN1cmZhY2VkIHRvXG5cdCAqIHRoZSB1c2VyIGFzIGEgZGVuaWVkLWFjdGlvbiBhcHByb3ZhbCBjYXJkLiBHdWFyZHMgYWdhaW5zdCBhY3RpbmcgdHdpY2Vcblx0ICogb24gdGhlIHNhbWUgcmV2aWV3IGlmIHRoZSBjb21wbGV0ZWQgbm90aWZpY2F0aW9uIGlzIHJlZGVsaXZlcmVkLlxuXHQgKi9cblx0cmVhZG9ubHkgaGFuZGxlZEd1YXJkaWFuUmV2aWV3czogU2V0PHN0cmluZz47XG5cdC8qKlxuXHQgKiBIb3N0LXNpZGUgdG9vbENhbGxJZHMgb2YgdGhlIHN5bnRoZXRpYyBcIkFwcHJvdmUgYW55d2F5XCIgY2FyZHMgY3JlYXRlZCBmb3Jcblx0ICogZ3VhcmRpYW4gKGF1dG8tcmV2aWV3KSBkZW5pYWxzIHRoYXQgYXJlIHN0aWxsIGF3YWl0aW5nIGEgdXNlciBkZWNpc2lvbi5cblx0ICogVW5saWtlIGNvZGV4J3MgYmxvY2tpbmcgY29tbWFuZCBhcHByb3ZhbHMsIHRoZXNlIGNhcmRzIGxpdmUgaW5zaWRlIHRoZVxuXHQgKiBhY3RpdmUgdHVybiBidXQgY29kZXggZG9lcyAqbm90KiB3YWl0IG9uIHRoZW0gXHUyMDE0IHNvIHdoZW4gdGhlIHR1cm4gZW5kc1xuXHQgKiAob2Z0ZW4gdmlhIHRoZSBhdXRvLXJldmlldyBjaXJjdWl0LWJyZWFrZXIgaW50ZXJydXB0KSB0aGUgcmVkdWNlciBjYW5jZWxzXG5cdCAqIHRoZSBjYXJkLiBXZSB1c2UgdGhpcyBzZXQgdG8gdW53aW5kIHRoZSBwYXJrZWQgZGVmZXJyZWQgb24gdHVybiBlbmQgc28gdGhlXG5cdCAqIHN1c3BlbmRlZCB7QGxpbmsgQ29kZXhBZ2VudC5faGFuZGxlR3VhcmRpYW5SZXZpZXdDb21wbGV0ZWR9IGZyYW1lIGRvZXNuJ3Rcblx0ICogbGVhay5cblx0ICovXG5cdHJlYWRvbmx5IHBlbmRpbmdHdWFyZGlhblJldmlld0NhcmRzOiBTZXQ8c3RyaW5nPjtcblx0LyoqXG5cdCAqIFN0ZWVyaW5nIG1lc3NhZ2VzIGhhbmRlZCB0byBjb2RleCB2aWEgYHR1cm4vc3RlZXJgIHRoYXQgYXJlIGF3YWl0aW5nXG5cdCAqIHRoZSBtYXRjaGluZyBgdXNlck1lc3NhZ2VgIGl0ZW0gZWNobywgd2hpY2ggcHJvbW90ZXMgdGhlbSBpbnRvIHRoZWlyXG5cdCAqIG93biB2aXNpYmxlIHR1cm4uIEtleWVkIGJ5IHtAbGluayBQZW5kaW5nTWVzc2FnZS5pZH0uIERyYWluZWQgKHdpdGggYVxuXHQgKiBgc3RlZXJpbmdfY29uc3VtZWRgIHNpZ25hbCkgb24gdHVybiBjb21wbGV0aW9uLCBhYm9ydCwgZGlzcG9zZSwgb3IgYVxuXHQgKiBgdHVybi9zdGVlcmAgcmVqZWN0aW9uIHNvIHRoZSBjaGF0IFVJJ3MgcGVuZGluZyBidWJibGUgbmV2ZXIgc3RpY2tzLlxuXHQgKi9cblx0cmVhZG9ubHkgcGVuZGluZ1N0ZWVyaW5nRmxpcHM6IE1hcDxzdHJpbmcsIFBlbmRpbmdNZXNzYWdlPjtcblx0LyoqXG5cdCAqIENsaWVudC1wcm92aWRlZCB0b29sIGRlZmluaXRpb25zIGZvciB0aGlzIHNlc3Npb24sIGtleWVkIGJ5IHRoZVxuXHQgKiBjb250cmlidXRpbmcgd29ya2JlbmNoIGNsaWVudC4gVGhlIG1lcmdlZCBzZXQgaXMgcmVnaXN0ZXJlZCB3aXRoIGNvZGV4XG5cdCAqIGFzIGBkeW5hbWljVG9vbHNgIGF0IGB0aHJlYWQvc3RhcnRgLiBFbXB0eSB1bnRpbCB0aGUgZmlyc3QgYWN0aXZlIGNsaWVudFxuXHQgKiBzZXRzIGl0cyB0b29scy5cblx0ICovXG5cdHJlYWRvbmx5IGNsaWVudFRvb2xTZXQ6IEFjdGl2ZUNsaWVudFRvb2xTZXQ7XG5cdC8qKlxuXHQgKiBQYXJrZWQgZGVmZXJyZWRzIGZvciBpbi1mbGlnaHQgY2xpZW50LXRvb2wgY2FsbHMgKGNvZGV4XG5cdCAqIGBpdGVtL3Rvb2wvY2FsbGApLCBrZXllZCBieSB0aGUgaG9zdC1zaWRlIHRvb2xDYWxsSWQuIFJlc29sdmVkIGJ5XG5cdCAqIHtAbGluayBDb2RleEFnZW50Lm9uQ2xpZW50VG9vbENhbGxDb21wbGV0ZX0uXG5cdCAqL1xuXHRyZWFkb25seSBwZW5kaW5nQ2xpZW50VG9vbENhbGxzOiBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PFRvb2xDYWxsUmVzdWx0Pjtcblx0LyoqXG5cdCAqIFBhcmtlZCBkZWZlcnJlZHMgZm9yIGluLWZsaWdodCB1c2VyLWlucHV0IHJlcXVlc3RzIChjb2RleFxuXHQgKiBgaXRlbS90b29sL3JlcXVlc3RVc2VySW5wdXRgLCBpLmUuIHRoZSBtb2RlbCdzIGBhc2tfdXNlcmApLCBrZXllZCBieSBhXG5cdCAqIGhvc3QtZ2VuZXJhdGVkIHJlcXVlc3RJZC4gUmVzb2x2ZWQgYnlcblx0ICoge0BsaW5rIENvZGV4QWdlbnQucmVzcG9uZFRvVXNlcklucHV0UmVxdWVzdH0uXG5cdCAqL1xuXHRyZWFkb25seSBwZW5kaW5nVXNlcklucHV0czogUGVuZGluZ1JlcXVlc3RSZWdpc3RyeTxJQ29kZXhVc2VySW5wdXRSZXN1bHQ+O1xuXHQvKipcblx0ICogU2lnbmF0dXJlIG9mIHRoZSB7QGxpbmsgY2xpZW50VG9vbHN9IHRoZSBjb2RleCB0aHJlYWQgd2FzIHN0YXJ0ZWRcblx0ICogd2l0aC4gQ29kZXggb25seSBhY2NlcHRzIGBkeW5hbWljVG9vbHNgIGF0IGB0aHJlYWQvc3RhcnRgLCBzbyBpZiB0aGVcblx0ICogdG9vbHMgY2hhbmdlIGJlZm9yZSB0aGUgZmlyc3QgdHVybiAoZS5nLiB0aGUgcHJld2FybWVkIHRocmVhZCBzdGFydGVkXG5cdCAqIGJlZm9yZSB7QGxpbmsgc2V0Q2xpZW50VG9vbHN9IGFycml2ZWQpIHRoZSB0aHJlYWQgaXMgcmVzdGFydGVkIHRvIHBpY2tcblx0ICogdGhlbSB1cC4gYHVuZGVmaW5lZGAgdW50aWwgbWF0ZXJpYWxpemVkLlxuXHQgKi9cblx0bWF0ZXJpYWxpemVkVG9vbHNTaWc6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIFNpZ25hdHVyZSBvZiB0aGUgYG1jcF9zZXJ2ZXJzYCAocm9vdCBjb25maWcgKyBjbGllbnQgcGx1Z2lucykgdGhlIGNvZGV4XG5cdCAqIHRocmVhZCB3YXMgc3RhcnRlZCB3aXRoLiBDb2RleCBvbmx5IGFjY2VwdHMgYGNvbmZpZy5tY3Bfc2VydmVyc2AgYXRcblx0ICogYHRocmVhZC9zdGFydGAsIHNvIGlmIHRoZSBzZXQgY2hhbmdlcyBiZWZvcmUgdGhlIGZpcnN0IHR1cm4gdGhlIHRocmVhZCBpc1xuXHQgKiByZXN0YXJ0ZWQgdG8gcGljayB0aGVtIHVwLiBgdW5kZWZpbmVkYCB1bnRpbCBtYXRlcmlhbGl6ZWQuXG5cdCAqL1xuXHRtYXRlcmlhbGl6ZWRNY3BTaWc6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIFRydWUgb25jZSBhIHR1cm4gaGFzIGJlZW4gc3RhcnRlZCBvbiB0aGUgKG1hdGVyaWFsaXplZCkgdGhyZWFkLiAqL1xuXHRmaXJzdFR1cm5TZW50OiBib29sZWFuO1xuXHRtb2RlbDogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQ7XG5cdC8qKiBXb3JrYmVuY2gtZmFjaW5nIHR1cm4gaWQgZm9yIHRoZSBhY3RpdmUgdHVybi4gKi9cblx0Y3VycmVudFR1cm5JZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKiogTG9jYWwgbW9ub3RvbmljIHRpbWVyIGZvciB0aGUgYWN0aXZlIHdvcmtiZW5jaC1mYWNpbmcgdHVybi4gKi9cblx0dHVyblN0b3BXYXRjaDogU3RvcFdhdGNoIHwgdW5kZWZpbmVkO1xuXHQvKiogQ29kZXggYXBwLXNlcnZlciB0dXJuIGlkIGZvciB0aGUgYWN0aXZlIHR1cm4uICovXG5cdGN1cnJlbnRBcHBUdXJuSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIENvZGV4IGFwcC1zZXJ2ZXIgdHVybiBpZCAtPiB3b3JrYmVuY2gtZmFjaW5nIHR1cm4gaWQuICovXG5cdHJlYWRvbmx5IGhvc3RUdXJuSWRCeUFwcFR1cm5JZDogTWFwPHN0cmluZywgc3RyaW5nPjtcblx0LyoqXG5cdCAqIFdvcmtiZW5jaC1mYWNpbmcgdHVybiBpZCAtPiBjb2RleCBhcHAtc2VydmVyIHR1cm4gaWQsIHJldGFpbmVkIGFjcm9zc1xuXHQgKiB0dXJuIGNvbXBsZXRpb24gc28ge0BsaW5rIENvZGV4QWdlbnQudHJ1bmNhdGVTZXNzaW9ufSBjYW4gdHJhbnNsYXRlIGFcblx0ICogbGl2ZSBob3N0IHR1cm4gaWQgdG8gYSBgdGhyZWFkL3JvbGxiYWNrYCB0YXJnZXQuXG5cdCAqL1xuXHRyZWFkb25seSBjb2RleFR1cm5JZEJ5SG9zdFR1cm5JZDogTWFwPHN0cmluZywgc3RyaW5nPjtcblx0LyoqIFNldCB3aGVuIHRoaXMgc2Vzc2lvbiB3YXMgcmVzdG9yZWQgKFBoYXNlIDMpIGFuZCBuZWVkcyBgdGhyZWFkL3Jlc3VtZWAgYmVmb3JlIHRoZSBmaXJzdCBgdHVybi9zdGFydGAuICovXG5cdG5lZWRzUmVzdW1lOiBib29sZWFuO1xuXHQvKiogTW9zdCByZWNlbnQgdXNlciBwcm9tcHQgc2VudCBvbiB0aGlzIHNlc3Npb24gXHUyMDE0IHVzZWQgYXMgZmFsbGJhY2sgdXNlck1lc3NhZ2UgdGV4dCBpbiBgdHVybi9zdGFydGVkYC4gKi9cblx0bGFzdFByb21wdFRleHQ6IHN0cmluZztcblx0LyoqIFRydWUgb25jZSB0aGUgd29ya2JlbmNoIGhhcyBkaXNwb3NlZCB0aGlzIHNlc3Npb24uIEd1YXJkcyBiYWNrZ3JvdW5kIHByZXdhcm0gY29udGludWF0aW9ucy4gKi9cblx0ZGlzcG9zZWQ6IGJvb2xlYW47XG5cdC8qKiBJbi1mbGlnaHQgYmFja2dyb3VuZCBvciBmb3JlZ3JvdW5kIG1hdGVyaWFsaXphdGlvbiwgc2hhcmVkIGFjcm9zcyBjYWxsZXJzLiAqL1xuXHRtYXRlcmlhbGl6ZVByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdC8qKiBXaGV0aGVyIHRoZSB3b3JrYmVuY2gtZmFjaW5nIG1hdGVyaWFsaXplIGV2ZW50IGhhcyBiZWVuIGVtaXR0ZWQuICovXG5cdG1hdGVyaWFsaXplZEV2ZW50RmlyZWQ6IGJvb2xlYW47XG5cdC8qKiBUVEwgdGltZXIgZm9yIGEgbWF0ZXJpYWxpemVkLWJ1dC11bnVzZWQgcHJld2FybWVkIHRocmVhZC4gKi9cblx0cHJld2FybVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IHVuZGVmaW5lZDtcblx0LyoqIFRydWUgb25jZSB0aGUgcHJld2FybWVkIHNlc3Npb24gaGFzIGJlZW4gY2xhaW1lZCBieSBhIHVzZXIgdHVybi4gKi9cblx0cHJld2FybUNsYWltZWQ6IGJvb2xlYW47XG5cdC8qKiBUcnVlIG9uY2UgdGhlIGFnZW50IGhvc3QncyBzZXJ2ZXIgdG9vbHMgaGF2ZSBiZWVuIGFkdmVydGlzZWQgb24gdGhpcyBzZXNzaW9uLiAqL1xuXHRzZXJ2ZXJUb29sc0FkdmVydGlzZWQ6IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBQZXItc2Vzc2lvbiBNQ1AgY3VzdG9taXphdGlvbiBzdXJmYWNlLiBDcmVhdGVkIGxhemlseSB0aGUgZmlyc3QgdGltZVxuXHQgKiB0aGUgc2Vzc2lvbiBuZWVkcyB0byBzdXJmYWNlIGNvZGV4J3MgTUNQIHNlcnZlcnMgKGVpdGhlciB2aWFcblx0ICoge0BsaW5rIENvZGV4QWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zfSBvciB3aGVuIHRoZSBjb25uZWN0aW9uJ3Ncblx0ICogTUNQIGludmVudG9yeSBpcyBhcHBsaWVkKS4gRGlzcG9zZWQgd2hlbiB0aGUgc2Vzc2lvbiBpcyByZW1vdmVkLlxuXHQgKi9cblx0bWNwQ29udHJvbGxlcjogTWNwQ3VzdG9taXphdGlvbkNvbnRyb2xsZXIgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBTdG9yZSBvZiBjbGllbnQtcHVzaGVkIChcIk9wZW4gUGx1Z2luXCIpIGN1c3RvbWl6YXRpb25zIHN5bmNlZCB0byB0aGlzXG5cdCAqIHNlc3Npb24uIFRoZWlyIE1DUCBzZXJ2ZXJzIGFyZSBhdHRhY2hlZCBwZXItdGhyZWFkIGF0IGB0aHJlYWQvc3RhcnRgXG5cdCAqIGFuZCB0aGVpciBza2lsbHMgZmVlZCBjb2RleCdzIHByb2Nlc3MtZ2xvYmFsIGBza2lsbHMvZXh0cmFSb290cy9zZXRgLlxuXHQgKi9cblx0cmVhZG9ubHkgY2xpZW50Q3VzdG9taXphdGlvbnM6IENvZGV4Q2xpZW50Q3VzdG9taXphdGlvblN0b3JlO1xufVxuXG50eXBlIElDb2RleFNlc3Npb25SZWFkID0gVGhyZWFkUmVhZFJlc3BvbnNlICYge1xuXHRyZWFkb25seSBwZXJzaXN0ZWRXb3JraW5nRGlyZWN0b3JpZXM/OiByZWFkb25seSBVUklbXTtcbn07XG5cbi8qKlxuICogQSBsaXZlIENvZGV4IGNvbGxhYi1hZ2VudCAoc3ViYWdlbnQpIGNoaWxkIHRocmVhZC4gQ29kZXggcnVucyBlYWNoIHNwYXduZWRcbiAqIHN1YmFnZW50IGFzIGl0cyBPV04gYXBwLXNlcnZlciB0aHJlYWQgdGhhdCBlbWl0cyBhIGZ1bGwgaXRlbS90dXJuIGV2ZW50XG4gKiBzdHJlYW0gKGB0dXJuL3N0YXJ0ZWRgLCBgaXRlbS8qYCwgYHR1cm4vY29tcGxldGVkYCkgdW5kZXIgdGhlIGNoaWxkIHRocmVhZFxuICogaWQgXHUyMDE0IGl0IGlzIE5PVCBmbGF0dGVuZWQgb250byB0aGUgcGFyZW50IHRocmVhZC4gV2UgcmVuZGVyIHRoYXQgc3RyZWFtIGluIGFcbiAqIHJlYWQtb25seSBwZWVyIGNoYXQgKHRoZSBcImFnZW50IHRlYW1cIiBwYXR0ZXJuLCBtaXJyb3JpbmcgQ29waWxvdC9DbGF1ZGUpIGJ5XG4gKiByb3V0aW5nIHRoZSBjaGlsZCB0aHJlYWQncyBub3RpZmljYXRpb25zIHRocm91Z2ggdGhlIHNoYXJlZCBtYXBwZXJzIHdpdGggYW5cbiAqIGlzb2xhdGVkIHtAbGluayBJQ29kZXhTZXNzaW9ufSBhbmQgZmlyaW5nIGVhY2ggcmVzdWx0aW5nIGFjdGlvbiB0YWdnZWQgd2l0aFxuICogdGhlIHBhcmVudCBgc3Bhd25BZ2VudGAgdG9vbCBjYWxsIGFzIGl0cyBgcGFyZW50VG9vbENhbGxJZGAsIHNvIHRoZSBzaGFyZWRcbiAqIG9yY2hlc3RyYXRvciAoe0BsaW5rIEFnZW50U2lkZUVmZmVjdHN9KSBsYW5kcyB0aGVtIGluIHRoZSBzdWJhZ2VudCBjaGF0LlxuICovXG5pbnRlcmZhY2UgSUNvZGV4U3ViYWdlbnQge1xuXHQvKiogQ2FsbGVyLWZhY2luZyBzZXNzaW9uSWQgb2YgdGhlIHBhcmVudCBzZXNzaW9uIHRoYXQgc3Bhd25lZCB0aGlzIHN1YmFnZW50LiAqL1xuXHRyZWFkb25seSBwYXJlbnRTZXNzaW9uSWQ6IHN0cmluZztcblx0LyoqIEhvc3Qtc2lkZSB0b29sQ2FsbElkIG9mIHRoZSBwYXJlbnQgYHNwYXduQWdlbnRgIGNvbGxhYiB0b29sIGNhbGwgKHJvdXRpbmcga2V5KS4gKi9cblx0cmVhZG9ubHkgdG9vbENhbGxJZDogc3RyaW5nO1xuXHQvKipcblx0ICogSXNvbGF0ZWQgc2Vzc2lvbiB1c2VkIHRvIHJ1biB0aGUgc2hhcmVkIGV2ZW50IG1hcHBlcnMgZm9yIHRoZSBjaGlsZFxuXHQgKiB0aHJlYWQuIFNoYXJlcyB0aGUgcGFyZW50J3MgYHNlc3Npb25VcmlgIGFuZCBgYWNjZXB0ZWRGb3JTZXNzaW9uYCBtZW1vIHNvXG5cdCAqIHNpZGUgZWZmZWN0cyB0YXJnZXQgdGhlIHBhcmVudCdzIHdvcmtpbmcgdHJlZSBhbmQgdGhlIGFjY2VwdC1mb3Itc2Vzc2lvblxuXHQgKiBkZWNpc2lvbiBzcGFucyBwYXJlbnQgKyBzdWJhZ2VudHMsIGJ1dCBrZWVwcyBpdHMgb3duIG1hcC90dXJuIHN0YXRlLlxuXHQgKi9cblx0cmVhZG9ubHkgc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbjtcbn1cblxuLyoqXG4gKiBDb25uZWN0aW9uIHN0YXRlIG1hY2hpbmUuIFRoZSBjb2RleCBwcm9jZXNzIGlzIHNwYXduZWQgbGF6aWx5IG9uIGZpcnN0XG4gKiBuZWVkIChEZWNpc2lvbiA2KSBhbmQgc3RheXMgYWxpdmUgZm9yIHRoZSBhZ2VudCdzIGxpZmV0aW1lLlxuICovXG50eXBlIENvbm5lY3Rpb25TdGF0ZSA9XG5cdHwgeyByZWFkb25seSBraW5kOiAnaWRsZScgfVxuXHR8IHsgcmVhZG9ubHkga2luZDogJ3N0YXJ0aW5nJzsgcmVhZG9ubHkgcHJvbWlzZTogUHJvbWlzZTxJQ29ubmVjdGlvblJlYWR5PiB9XG5cdHwgKHsgcmVhZG9ubHkga2luZDogJ3JlYWR5JyB9ICYgSUNvbm5lY3Rpb25SZWFkeSk7XG5cbmludGVyZmFjZSBJQ29ubmVjdGlvblJlYWR5IHtcblx0cmVhZG9ubHkgY2xpZW50OiBJQ29kZXhBcHBTZXJ2ZXJDbGllbnQ7XG5cdHJlYWRvbmx5IHVzYWdlU291cmNlOiBDb2RleFVzYWdlU291cmNlO1xuXHRyZWFkb25seSBwcm94eUhhbmRsZT86IElDb2RleFByb3h5SGFuZGxlO1xuXHRyZWFkb25seSBjaGlsZDogQ2hpbGRQcm9jZXNzV2l0aG91dE51bGxTdHJlYW1zO1xufVxuXG4vKipcbiAqIGBJQWdlbnRgIGltcGxlbWVudGF0aW9uIGJhY2tlZCBieSBgY29kZXggYXBwLXNlcnZlcmAuXG4gKlxuICogUGhhc2UgMiBzdXJmYWNlOiBjcmVhdGVTZXNzaW9uIChibG9ja3Mgb24gYHRocmVhZC9zdGFydGApLCBzZW5kTWVzc2FnZVxuICogKG9uZSBgdHVybi9zdGFydGAsIHN0cmVhbXMgYGFnZW50TWVzc2FnZWAgZGVsdGFzKSwgc2V0UGVuZGluZ01lc3NhZ2VzXG4gKiAoc3RlZXJpbmcgdmlhIGB0dXJuL3N0ZWVyYCksIGFib3J0U2Vzc2lvbiAoYHR1cm4vaW50ZXJydXB0YCksXG4gKiBkaXNwb3NlU2Vzc2lvbiAoYHRocmVhZC91bnN1YnNjcmliZWAsIG5vIHByb2Nlc3Mga2lsbCkuXG4gKlxuICogRGVjaXNpb25zIDMgKHNoYXJlZCBwcm9jZXNzKSwgNiAobGF6eSBzcGF3biksIDcgKHNlc3Npb24gaWQgPT0gdGhyZWFkSWQpLFxuICogMTAgKG5vIGN3ZCBcdTIxOTIgcmVqZWN0KSwgMTUgKGNhbmNlbCwga2VlcCBzdHJlYW1lZCBjb250ZW50KSwgMTYgKHN0ZWVyaW5nKSxcbiAqIDE3IChhdHRhY2htZW50cyksIDE4IChhcGlrZXkgYXV0aCkuXG4gKi9cblxuLyoqXG4gKiBgQG9wZW5haS9jb2RleGAgZGlzdHJpYnV0aW9uIGRlc2NyaXB0b3IuIExpdmVzIGluIHRoaXMgZmlsZSBiZWNhdXNlIGl0XG4gKiBlbmNvZGVzIENvZGV4LXNwZWNpZmljIGtub3dsZWRnZSBcdTIwMTQgdGhlIGVudi12YXIgbmFtZSBhbmQgdGhlIGZhY3QgdGhhdFxuICogQ29kZXgncyBMaW51eCBiaW5hcmllcyBhcmUgc3RhdGljYWxseSBtdXNsLWxpbmtlZCBhbmQgc2hpcCBhcyBhIHNpbmdsZVxuICogYGxpbnV4LSpgIFNLVSByZWdhcmRsZXNzIG9mIGhvc3QgbGliYy5cbiAqL1xuZXhwb3J0IGNvbnN0IENvZGV4U2RrUGFja2FnZTogSUFnZW50U2RrUGFja2FnZSA9IHtcblx0aWQ6ICdjb2RleCcsXG5cdGRpc3BsYXlOYW1lOiAnQ29kZXgnLFxuXHRkZXZPdmVycmlkZUVudlZhcjogQWdlbnRIb3N0Q29kZXhBZ2VudFNka1Jvb3RFbnZWYXIsXG5cdGhhc1NlcGFyYXRlTXVzbExpbnV4UGFja2FnZTogZmFsc2UsXG59O1xuXG4vKipcbiAqIENvbnZlcnQgYSB3b3JrYmVuY2gge0BsaW5rIFRvb2xDYWxsUmVzdWx0fSBpbnRvIHRoZSBjb2RleFxuICoge0BsaW5rIER5bmFtaWNUb29sQ2FsbFJlc3BvbnNlfSByZXR1cm5lZCBmb3IgYW4gYGl0ZW0vdG9vbC9jYWxsYCByZXF1ZXN0LlxuICogVGV4dCBjb250ZW50IG1hcHMgdG8gYGlucHV0VGV4dGA7IHdoZW4gdGhlcmUgaXMgbm8gdGV4dCBjb250ZW50IHRoZVxuICogdG9vbCdzIHBhc3QtdGVuc2Ugc3VtbWFyeSBpcyB1c2VkIHNvIGNvZGV4IG5ldmVyIHJlY2VpdmVzIGFuIGVtcHR5IGJvZHkuXG4gKi9cbmZ1bmN0aW9uIGR5bmFtaWNUb29sUmVzcG9uc2VGcm9tUmVzdWx0KHJlc3VsdDogVG9vbENhbGxSZXN1bHQpOiBEeW5hbWljVG9vbENhbGxSZXNwb25zZSB7XG5cdGNvbnN0IGNvbnRlbnRJdGVtczogRHluYW1pY1Rvb2xDYWxsT3V0cHV0Q29udGVudEl0ZW1bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGMgb2YgcmVzdWx0LmNvbnRlbnQgPz8gW10pIHtcblx0XHRpZiAoYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCkge1xuXHRcdFx0Y29udGVudEl0ZW1zLnB1c2goeyB0eXBlOiAnaW5wdXRUZXh0JywgdGV4dDogYy50ZXh0IH0pO1xuXHRcdH1cblx0fVxuXHRpZiAoY29udGVudEl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdC8vIENvZGV4IHJlamVjdHMgYW4gZW1wdHkgdG9vbCBib2R5LCBzbyBhbHdheXMgc2VuZCBhIG5vbi1lbXB0eVxuXHRcdC8vIGBpbnB1dFRleHRgOiBwcmVmZXIgdGhlIHRvb2wncyBwYXN0LXRlbnNlIHN1bW1hcnksIG90aGVyd2lzZSBhXG5cdFx0Ly8gZ2VuZXJpYyBjb21wbGV0aW9uIG1hcmtlciBrZXllZCBvZmYgc3VjY2Vzcy5cblx0XHRjb25zdCBzdW1tYXJ5ID0gdHlwZW9mIHJlc3VsdC5wYXN0VGVuc2VNZXNzYWdlID09PSAnc3RyaW5nJyAmJiByZXN1bHQucGFzdFRlbnNlTWVzc2FnZS5sZW5ndGggPiAwXG5cdFx0XHQ/IHJlc3VsdC5wYXN0VGVuc2VNZXNzYWdlXG5cdFx0XHQ6IChyZXN1bHQuc3VjY2VzcyA/ICdUb29sIGNvbXBsZXRlZCB3aXRoIG5vIG91dHB1dC4nIDogJ1Rvb2wgZmFpbGVkIHdpdGggbm8gb3V0cHV0LicpO1xuXHRcdGNvbnRlbnRJdGVtcy5wdXNoKHsgdHlwZTogJ2lucHV0VGV4dCcsIHRleHQ6IHN1bW1hcnkgfSk7XG5cdH1cblx0cmV0dXJuIHsgY29udGVudEl0ZW1zLCBzdWNjZXNzOiByZXN1bHQuc3VjY2VzcyB9O1xufVxuXG5mdW5jdGlvbiB0b29sc1NpZ25hdHVyZSh0b29sczogcmVhZG9ubHkgVG9vbERlZmluaXRpb25bXSB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdGlmICghdG9vbHMgfHwgdG9vbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cdHJldHVybiB0b29sc1xuXHRcdC5tYXAodCA9PiBgJHt0Lm5hbWV9XFx1MDAwMCR7dC5kZXNjcmlwdGlvbiA/PyAnJ31cXHUwMDAwJHtKU09OLnN0cmluZ2lmeSh0LmlucHV0U2NoZW1hID8/IG51bGwpfWApXG5cdFx0LnNvcnQoKVxuXHRcdC5qb2luKCdcXHUwMDAxJyk7XG59XG5cbi8qKlxuICogU3RhYmxlIHNpZ25hdHVyZSBvZiB0aGUgYG1jcF9zZXJ2ZXJzYCBvYmplY3QgYSB0aHJlYWQgd2FzIHN0YXJ0ZWQgd2l0aCwgdXNlZFxuICogdG8gZGV0ZWN0IHdoZW4gdGhlIG1lcmdlZCAocm9vdCBjb25maWcgKyBjbGllbnQgcGx1Z2luKSBNQ1Agc2V0IGNoYW5nZWQgc29cbiAqIHRoZSB0aHJlYWQgY2FuIGJlIHJlc3RhcnRlZCBiZWZvcmUgaXRzIGZpcnN0IHR1cm4gdG8gcGljayB1cCB0aGUgbmV3IHNlcnZlcnMuXG4gKi9cbmZ1bmN0aW9uIG1jcFNlcnZlcnNTaWduYXR1cmUoc2VydmVyczogUmVjb3JkPHN0cmluZywgSUNvZGV4TWNwU2VydmVyQ29uZmlnSnNvbj4pOiBzdHJpbmcge1xuXHRjb25zdCBuYW1lcyA9IE9iamVjdC5rZXlzKHNlcnZlcnMpLnNvcnQoKTtcblx0cmV0dXJuIG5hbWVzLm1hcChuYW1lID0+IGAke25hbWV9XFx1MDAwMCR7SlNPTi5zdHJpbmdpZnkoc2VydmVyc1tuYW1lXSl9YCkuam9pbignXFx1MDAwMScpO1xufVxuXG4vKipcbiAqIENvZGV4IGFjdGl2ZS1jbGllbnQgaGFuZGxlLiBXcml0ZXMgZmxvdyBpbnRvIHRoZSBvd25pbmcgc2Vzc2lvbidzXG4gKiB7QGxpbmsgQWN0aXZlQ2xpZW50VG9vbFNldH0gKHRvb2xzKSBhbmQgaXRzIHtAbGluayBDb2RleENsaWVudEN1c3RvbWl6YXRpb25TdG9yZX1cbiAqIChjdXN0b21pemF0aW9ucyk7IHRoZSBzZXNzaW9uIGlzIHJlc29sdmVkIGxhemlseSBzbyB3cml0ZXMgdGhhdCBhcnJpdmUgYmVmb3JlXG4gKiAob3IgYWZ0ZXIpIHRoZSBzZXNzaW9uIGV4aXN0cyBhcmUgZ3JhY2VmdWxseSBkcm9wcGVkLCBtYXRjaGluZyB0aGUgcHJpb3JcbiAqIGBzZXRDbGllbnRUb29sc2AgZWFybHktcmV0dXJuIGJlaGF2aW9yLiBBc3NpZ25pbmcgYGN1c3RvbWl6YXRpb25zYCBjYWNoZXMgdGhlXG4gKiBpbnB1dHMgKHNvIHRoZSBnZXR0ZXIgZWNob2VzIHRoZW0pIGFuZCBraWNrcyBvZmYgdGhlIGFnZW50J3MgYXN5bmMgc3luYy5cbiAqL1xuY2xhc3MgQ29kZXhBY3RpdmVDbGllbnRIYW5kbGUgaW1wbGVtZW50cyBJQWN0aXZlQ2xpZW50IHtcblx0cHJpdmF0ZSBfY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldFNlc3Npb246ICgpID0+IElDb2RleFNlc3Npb24gfCB1bmRlZmluZWQsXG5cdFx0cmVhZG9ubHkgY2xpZW50SWQ6IHN0cmluZyxcblx0XHRyZWFkb25seSBkaXNwbGF5TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uVG9vbHNTZXQ6ICh0b29sczogcmVhZG9ubHkgVG9vbERlZmluaXRpb25bXSkgPT4gdm9pZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zeW5jQ3VzdG9taXphdGlvbnM6IChjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdKSA9PiB2b2lkLFxuXHQpIHsgfVxuXG5cdGdldCB0b29scygpOiByZWFkb25seSBUb29sRGVmaW5pdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0U2Vzc2lvbigpPy5jbGllbnRUb29sU2V0LmdldCh0aGlzLmNsaWVudElkKSA/PyBbXTtcblx0fVxuXHRzZXQgdG9vbHModG9vbHM6IHJlYWRvbmx5IFRvb2xEZWZpbml0aW9uW10pIHtcblx0XHR0aGlzLl9nZXRTZXNzaW9uKCk/LmNsaWVudFRvb2xTZXQuc2V0KHRoaXMuY2xpZW50SWQsIHRvb2xzKTtcblx0XHR0aGlzLl9vblRvb2xzU2V0KHRvb2xzKTtcblx0fVxuXG5cdGdldCBjdXN0b21pemF0aW9ucygpOiByZWFkb25seSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9jdXN0b21pemF0aW9ucztcblx0fVxuXHRzZXQgY3VzdG9taXphdGlvbnMoY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSkge1xuXHRcdHRoaXMuX2N1c3RvbWl6YXRpb25zID0gY3VzdG9taXphdGlvbnM7XG5cdFx0dGhpcy5fc3luY0N1c3RvbWl6YXRpb25zKGN1c3RvbWl6YXRpb25zKTtcblx0fVxufVxuXG4vKipcbiAqIE1hcCBhIHJlc29sdmVkIGFwcHJvdmFsIGRlY2lzaW9uIHRvIHRoZSB7QGxpbmsgRmlsZUNoYW5nZUFwcHJvdmFsRGVjaXNpb259XG4gKiBzdWJzZXQuIFRoZSBob3N0J3MgYm9vbGVhbiByZXNwb25zZSBvbmx5IHlpZWxkcyBgYWNjZXB0YC9gZGVjbGluZWA7IHRoZVxuICogY29tbWFuZC1vbmx5IGFtZW5kbWVudCB2YXJpYW50cyBhcmUgdHJlYXRlZCBhcyBhIGRlY2xpbmUgZm9yIGZpbGUgY2hhbmdlcy5cbiAqL1xuZnVuY3Rpb24gbmFycm93RmlsZUNoYW5nZURlY2lzaW9uKGRlY2lzaW9uOiBDb21tYW5kRXhlY3V0aW9uQXBwcm92YWxEZWNpc2lvbik6IEZpbGVDaGFuZ2VBcHByb3ZhbERlY2lzaW9uIHtcblx0c3dpdGNoIChkZWNpc2lvbikge1xuXHRcdGNhc2UgJ2FjY2VwdCc6XG5cdFx0Y2FzZSAnYWNjZXB0Rm9yU2Vzc2lvbic6XG5cdFx0Y2FzZSAnZGVjbGluZSc6XG5cdFx0Y2FzZSAnY2FuY2VsJzpcblx0XHRcdHJldHVybiBkZWNpc2lvbjtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuICdkZWNsaW5lJztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29kZXhBZ2VudCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWdlbnQge1xuXG5cdHJlYWRvbmx5IGlkOiBBZ2VudFByb3ZpZGVyID0gQ09ERVhfQUdFTlRfUFJPVklERVJfSUQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZXNzaW9uUHJvZ3Jlc3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxBZ2VudFNpZ25hbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2Vzc2lvblByb2dyZXNzID0gdGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRNYXRlcmlhbGl6ZVNlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQWdlbnRNYXRlcmlhbGl6ZVNlc3Npb25FdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTWF0ZXJpYWxpemVTZXNzaW9uID0gdGhpcy5fb25EaWRNYXRlcmlhbGl6ZVNlc3Npb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1aXJlQXV0aCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE9taXQ8QXV0aFJlcXVpcmVkUGFyYW1zLCAnY2hhbm5lbCc+PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1aXJlQXV0aCA9IHRoaXMuX29uRGlkUmVxdWlyZUF1dGguZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25NY3BOb3RpZmljYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTWNwTm90aWZpY2F0aW9uPigpKTtcblx0cmVhZG9ubHkgb25NY3BOb3RpZmljYXRpb24gPSB0aGlzLl9vbk1jcE5vdGlmaWNhdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50TW9kZWxJbmZvW10+KHRoaXMsIFtdKTtcblx0cmVhZG9ubHkgbW9kZWxzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQWdlbnRNb2RlbEluZm9bXT4gPSB0aGlzLl9tb2RlbHM7XG5cdHByaXZhdGUgX29wZW5BSUFjY291bnRTdGF0ZTogSUNvZGV4QWNjb3VudFN0YXRlID0geyB1c2FnZVNvdXJjZTogJ29wZW5haScsIHN0YXR1czogJ3NpZ25lZE91dCcgfTtcblx0cHJpdmF0ZSBfcHJvdmlkZXJDb25maWd1cmF0aW9uVmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRwcml2YXRlIF9wcm92aWRlckNvbmZpZ3VyYXRpb25Xcml0ZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRwcml2YXRlIF9wcm92aWRlckNvbmZpZ3VyYXRpb25SZWFkeSA9IGZhbHNlO1xuXHRwcml2YXRlIF9wcm92aWRlckNvbmZpZ3VyYXRpb25SZWZyZXNoOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBLZXllZCBieSBjYWxsZXItZmFjaW5nIHNlc3Npb25JZCAodGhlIFVSSSBob3N0KS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgSUNvZGV4U2Vzc2lvbj4oKTtcblx0LyoqIEludmVyc2UgbWFwOiBjb2RleCB0aHJlYWRJZCBcdTIxOTIgY2FsbGVyLWZhY2luZyBzZXNzaW9uSWQsIGZvciByb3V0aW5nIGNvZGV4IG5vdGlmaWNhdGlvbnMgYmFjayB0byBzZXNzaW9ucy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbklkQnlUaHJlYWRJZCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdC8qKlxuXHQgKiBMaXZlIHN1YmFnZW50IChjb2xsYWItYWdlbnQpIGNoaWxkIHRocmVhZHMsIGtleWVkIGJ5IHRoZSBjaGlsZCBjb2RleFxuXHQgKiB0aHJlYWQgaWQuIFBvcHVsYXRlZCB3aGVuIGEgcGFyZW50IHNlc3Npb24ncyBgc3Bhd25BZ2VudGAgY29sbGFiIHRvb2xcblx0ICogY2FsbCBjb21wbGV0ZXMgKGNhcnJ5aW5nIHRoZSBjaGlsZCBgcmVjZWl2ZXJUaHJlYWRJZHNgKTsgdGhlIGNoaWxkJ3Ncblx0ICogc3Vic2VxdWVudCBgdHVybi8qYCBhbmQgYGl0ZW0vKmAgbm90aWZpY2F0aW9ucyByb3V0ZSBoZXJlIGluc3RlYWQgb2Zcblx0ICoge0BsaW5rIF9zZXNzaW9uSWRCeVRocmVhZElkfS4gUmVtb3ZlZCBvbiB0aGUgY2hpbGQncyBgdHVybi9jb21wbGV0ZWRgLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc3ViYWdlbnRzQnlUaHJlYWRJZCA9IG5ldyBNYXA8c3RyaW5nLCBJQ29kZXhTdWJhZ2VudD4oKTtcblx0LyoqXG5cdCAqIENvbm5lY3Rpb24tZ2xvYmFsIE1DUCBzZXJ2ZXIgaW52ZW50b3J5IHJlcG9ydGVkIGJ5IHRoZSBjb2RleFxuXHQgKiBhcHAtc2VydmVyIChgbWNwU2VydmVyU3RhdHVzL2xpc3RgICsgYG1jcFNlcnZlci9zdGFydHVwU3RhdHVzL3VwZGF0ZWRgKS5cblx0ICogQ29kZXggb3ducyBNQ1Agc2VydmVycyBhdCB0aGUgcHJvY2VzcyBsZXZlbCBcdTIwMTQgc2hhcmVkIGFjcm9zcyBldmVyeVxuXHQgKiB0aHJlYWQgXHUyMDE0IHNvIHRoZSBpbnZlbnRvcnkgbGl2ZXMgb24gdGhlIGFnZW50IGFuZCBpcyBtaXJyb3JlZCBvbnRvIGVhY2hcblx0ICogc2Vzc2lvbidzIHtAbGluayBJQ29kZXhTZXNzaW9uLm1jcENvbnRyb2xsZXJ9LiBLZXllZCBieSBzZXJ2ZXIgbmFtZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX21jcEludmVudG9yeSA9IG5ldyBNYXA8c3RyaW5nLCBJQ29kZXhNY3BTZXJ2ZXJFbnRyeT4oKTtcblx0LyoqXG5cdCAqIE9BdXRoIGJlYXJlciB0b2tlbnMgYWNxdWlyZWQgZm9yIGF1dGgtZ2F0ZWQgaHR0cCBNQ1Agc2VydmVycywga2V5ZWQgYnlcblx0ICogdGhlIHNlcnZlcidzIHtAbGluayBub3JtYWxpemVDb2RleE1jcFJlc291cmNlVXJsIHwgbm9ybWFsaXplZCBVUkx9LlxuXHQgKiBQb3B1bGF0ZWQgYnkge0BsaW5rIGhhbmRsZUF1dGhlbnRpY2F0aW9uVG9rZW59IGFmdGVyIHRoZSB3b3JrYmVuY2hcblx0ICogY29tcGxldGVzIHRoZSBzaWduLWluLCB0aGVuIGluamVjdGVkIGludG8gdGhlIHBlci10aHJlYWQgYGh0dHBfaGVhZGVyc2Bcblx0ICogYnkge0BsaW5rIF9idWlsZFNlc3Npb25NY3BTZXJ2ZXJzfS4gUHJvY2Vzcy1nbG9iYWw6IGEgdG9rZW4gZm9yIGEgZ2l2ZW5cblx0ICogc2VydmVyIFVSTCBhcHBsaWVzIHRvIGV2ZXJ5IHNlc3Npb24vdGhyZWFkIHRoYXQgdXNlcyBpdCAoY29kZXggcnVucyBvbmVcblx0ICogc2hhcmVkIGFwcC1zZXJ2ZXIpLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbWNwQXV0aFRva2VucyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdC8qKlxuXHQgKiBBc3NvY2lhdGlvbiBmcm9tIGEgbm9ybWFsaXplZCBPQXV0aCBgcmVzb3VyY2VgICh3aGF0IHRoZSB3b3JrYmVuY2hcblx0ICogYXV0aGVudGljYXRlcykgdG8gdGhlIG5vcm1hbGl6ZWQgTUNQIHNlcnZlciBVUkwocykgaXQgdW5sb2Nrcy4gUkZDIDk3Mjhcblx0ICogZGlzY292ZXJ5IGNhbiByZXR1cm4gYSBgcmVzb3VyY2VgIHRoYXQgZGlmZmVycyBmcm9tIHRoZSBjb25maWd1cmVkIHNlcnZlclxuXHQgKiBVUkwgKGUuZy4gcm9vdCBgaHR0cHM6Ly9ob3N0L2AgZm9yIGEgYGh0dHBzOi8vaG9zdC9tY3BgIGVuZHBvaW50KSwgc28gdGhlXG5cdCAqIHRva2VuIHRoZSB3b3JrYmVuY2ggcHVzaGVzIGJhY2sgaXMga2V5ZWQgYnkgdGhlIHJlc291cmNlLCBub3QgdGhlIHNlcnZlclxuXHQgKiBVUkwuIFJlY29yZGVkIGluIHtAbGluayBfc3VyZmFjZU1jcEF1dGhSZXF1aXJlZH0gYXQgZGlzY292ZXJ5IHRpbWUgYW5kXG5cdCAqIHJlYWQgYnkge0BsaW5rIGhhbmRsZUF1dGhlbnRpY2F0aW9uVG9rZW59IHRvIHJvdXRlIHRoZSB0b2tlbiB0byB0aGUgcmlnaHRcblx0ICogc2VydmVyKHMpLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbWNwQXV0aFNlcnZlclVybHNCeVJlc291cmNlID0gbmV3IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PigpO1xuXHRwcml2YXRlIF9naXRodWJUb2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF91c2FnZVNvdXJjZTogQ29kZXhVc2FnZVNvdXJjZTtcblx0cHJpdmF0ZSBfcGVuZGluZ1VzYWdlU291cmNlOiBDb2RleFVzYWdlU291cmNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb25uZWN0aW9uOiBDb25uZWN0aW9uU3RhdGUgPSB7IGtpbmQ6ICdpZGxlJyB9O1xuXHRwcml2YXRlIF9jb25uZWN0aW9uR2VuZXJhdGlvbiA9IDA7XG5cdHByaXZhdGUgX21vZGVsc1JlZnJlc2hQcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF91c2FnZVNvdXJjZVZhbGlkYXRpb24gPSBQcm9taXNlLnJlc29sdmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbWV0YWRhdGFTdG9yZTogQ29kZXhTZXNzaW9uTWV0YWRhdGFTdG9yZTtcblxuXHQvKipcblx0ICogVGhlIGFnZW50IGhvc3QncyBzZXJ2ZXItdG9vbCBob3N0IChmZWVkYmFjayBcImNvbW1lbnRzXCIgdG9kYXksIG1vcmUgaW4gdGhlXG5cdCAqIGZ1dHVyZSkuIFNlcnZlciB0b29scyBleGVjdXRlIGluLXByb2Nlc3MgYWdhaW5zdCB0aGUgc2Vzc2lvbidzIG93biBzdGF0ZVxuXHQgKiBcdTIwMTQgdW5saWtlIGNsaWVudCB0b29scywgd2hpY2ggcm91bmQtdHJpcCB0byB0aGUgd29ya2JlbmNoLiBgdW5kZWZpbmVkYFxuXHQgKiB1bnRpbCB7QGxpbmsgc2V0U2VydmVyVG9vbEhvc3R9IGlzIGNhbGxlZCBkdXJpbmcgcmVnaXN0cmF0aW9uOyByZW1haW5zXG5cdCAqIGB1bmRlZmluZWRgIGluIHRlc3QgLyBzdGFuZGFsb25lIGNvbnN0cnVjdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX3NlcnZlclRvb2xIb3N0OiBJQWdlbnRTZXJ2ZXJUb29sSG9zdCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb3BpbG90QXBpU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb3BpbG90QXBpU2VydmljZTogSUNvcGlsb3RBcGlTZXJ2aWNlLFxuXHRcdEBJQ29kZXhQcm94eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29kZXhQcm94eVNlcnZpY2U6IElDb2RleFByb3h5U2VydmljZSxcblx0XHRASUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2dpdEh1YkVuZHBvaW50U2VydmljZTogSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSxcblx0XHRASUFnZW50U2RrRG93bmxvYWRlciBwcml2YXRlIHJlYWRvbmx5IF9hZ2VudFNka0Rvd25sb2FkZXI6IElBZ2VudFNka0Rvd25sb2FkZXIsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQWdlbnRQbHVnaW5NYW5hZ2VyIHByaXZhdGUgcmVhZG9ubHkgX3BsdWdpbk1hbmFnZXI6IElBZ2VudFBsdWdpbk1hbmFnZXIsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbWV0YWRhdGFTdG9yZSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGV4U2Vzc2lvbk1ldGFkYXRhU3RvcmUpO1xuXHRcdHRoaXMuX3VzYWdlU291cmNlID0gdGhpcy5fcmVzb2x2ZVVzYWdlU291cmNlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRSb290Q29uZmlnQ2hhbmdlKCgpID0+IHtcblx0XHRcdGNvbnN0IG5leHQgPSB0aGlzLl9yZXNvbHZlVXNhZ2VTb3VyY2UoKTtcblx0XHRcdGlmIChuZXh0ICE9PSB0aGlzLl91c2FnZVNvdXJjZSkge1xuXHRcdFx0XHR0aGlzLl9yZXF1ZXN0VXNhZ2VTb3VyY2VDaGFuZ2UobmV4dCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nVXNhZ2VTb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9xdWV1ZVByb3ZpZGVyQ29uZmlndXJhdGlvbldyaXRlKCk7XG5cdFx0fSkpO1xuXHRcdHZvaWQgdGhpcy5fcmVmcmVzaFByb3ZpZGVyQ29uZmlndXJhdGlvbigpO1xuXHRcdGlmICh0aGlzLl91c2FnZVNvdXJjZSA9PT0gJ29wZW5haScpIHtcblx0XHRcdHRoaXMuX3VzYWdlU291cmNlVmFsaWRhdGlvbiA9IHRoaXMuX3ZhbGlkYXRlT3BlbkFJVXNhZ2VTb3VyY2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF92YWxpZGF0ZU9wZW5BSVVzYWdlU291cmNlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBhY2NvdW50OiBJQ29kZXhBY2NvdW50U3RhdGU7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLl9lbnN1cmVDb25uZWN0aW9uKHRydWUpO1xuXHRcdFx0YWNjb3VudCA9IGF3YWl0IHRoaXMuX3JlZnJlc2hBY2NvdW50KGNvbm5lY3Rpb24uY2xpZW50LCBmYWxzZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICh0aGlzLl91c2FnZVNvdXJjZSAhPT0gJ29wZW5haScpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcblx0XHRcdHRoaXMuX3NldE9wZW5BSUFjY291bnRTdGF0ZSh7IHVzYWdlU291cmNlOiAnb3BlbmFpJywgc3RhdHVzOiAnZXJyb3InLCBlcnJvcjogbWVzc2FnZSB9LCBmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl91c2FnZVNvdXJjZSAhPT0gJ29wZW5haScpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc291cmNlID0gcmVzb2x2ZUNvZGV4VXNhZ2VTb3VyY2VBZnRlckFjY291bnRSZWFkKHRoaXMuX3VzYWdlU291cmNlLCBhY2NvdW50KTtcblx0XHRpZiAoc291cmNlID09PSAnY29waWxvdCcpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnW0NvZGV4XSBPcGVuQUkgaXMgc2lnbmVkIG91dDsgZmFsbGluZyBiYWNrIHRvIEdpdEh1YiBDb3BpbG90Jyk7XG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVSb290Q29uZmlnKHsgW0FnZW50SG9zdENvbmZpZ0tleS5Db2RleFVzYWdlU291cmNlXTogc291cmNlIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoYWNjb3VudC5zdGF0dXMgPT09ICdzaWduZWRJbicpIHtcblx0XHRcdHRoaXMuX3F1ZXVlTW9kZWxSZWZyZXNoKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0T3BlbkFJQWNjb3VudFN0YXRlKHN0YXRlOiBJQ29kZXhBY2NvdW50U3RhdGUsIF9wdWJsaXNoID0gdHJ1ZSk6IHZvaWQge1xuXHRcdHRoaXMuX29wZW5BSUFjY291bnRTdGF0ZSA9IHN0YXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZVVzYWdlU291cmNlKCk6IENvZGV4VXNhZ2VTb3VyY2Uge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUoYWdlbnRIb3N0Q3VzdG9taXphdGlvbkNvbmZpZ1NjaGVtYSwgQWdlbnRIb3N0Q29uZmlnS2V5LkNvZGV4VXNhZ2VTb3VyY2UpID8/ICdjb3BpbG90Jztcblx0fVxuXG5cdHByaXZhdGUgX3JlcXVlc3RVc2FnZVNvdXJjZUNoYW5nZShzb3VyY2U6IENvZGV4VXNhZ2VTb3VyY2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faGFzQWN0aXZlVHVybnMoKSkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1VzYWdlU291cmNlID0gc291cmNlO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIERlZmVycmluZyB1c2FnZSBzb3VyY2UgY2hhbmdlIHRvICcke3NvdXJjZX0nIHVudGlsIGFjdGl2ZSB0dXJucyBmaW5pc2hgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHNvdXJjZSA9PT0gJ29wZW5haScpIHtcblx0XHRcdHRoaXMuX2FwcGx5VXNhZ2VTb3VyY2VDaGFuZ2Uoc291cmNlLCBmYWxzZSwgZmFsc2UpO1xuXHRcdFx0dGhpcy5fdXNhZ2VTb3VyY2VWYWxpZGF0aW9uID0gdGhpcy5fdmFsaWRhdGVPcGVuQUlVc2FnZVNvdXJjZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9hcHBseVVzYWdlU291cmNlQ2hhbmdlKHNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseVVzYWdlU291cmNlQ2hhbmdlKHNvdXJjZTogQ29kZXhVc2FnZVNvdXJjZSwgX3B1Ymxpc2hBY2NvdW50ID0gdHJ1ZSwgcmVmcmVzaE1vZGVscyA9IHRydWUpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91c1NvdXJjZSA9IHRoaXMuX3VzYWdlU291cmNlO1xuXHRcdHRoaXMuX3BlbmRpbmdVc2FnZVNvdXJjZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl91c2FnZVNvdXJjZSA9IHNvdXJjZTtcblx0XHR0aGlzLl9kaXNwb3NlQ29ubmVjdGlvbigpO1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLl9zZXNzaW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0dGhpcy5fcmVzZXRTZXNzaW9uRm9yVXNhZ2VTb3VyY2VDaGFuZ2Uoc2Vzc2lvbiwgc291cmNlLCBwcmV2aW91c1NvdXJjZSk7XG5cdFx0fVxuXHRcdHRoaXMuX3N1YmFnZW50c0J5VGhyZWFkSWQuY2xlYXIoKTtcblx0XHR0aGlzLl9tb2RlbHMuc2V0KFtdLCB1bmRlZmluZWQpO1xuXHRcdGlmICghcmVmcmVzaE1vZGVscykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoc291cmNlID09PSAnb3BlbmFpJykge1xuXHRcdFx0dGhpcy5fcXVldWVNb2RlbFJlZnJlc2goKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2dpdGh1YlRva2VuKSB7XG5cdFx0XHR0aGlzLl9xdWV1ZU1vZGVsUmVmcmVzaCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vbkRpZFJlcXVpcmVBdXRoLmZpcmUoeyByZXNvdXJjZTogdGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldENvcGlsb3RSZXNvdXJjZSgpLnJlc291cmNlLCByZWFzb246IEF1dGhSZXF1aXJlZFJlYXNvbi5SZXF1aXJlZCB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXNldFNlc3Npb25Gb3JVc2FnZVNvdXJjZUNoYW5nZShzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLCBzb3VyY2U6IENvZGV4VXNhZ2VTb3VyY2UsIHByZXZpb3VzU291cmNlPzogQ29kZXhVc2FnZVNvdXJjZSk6IHZvaWQge1xuXHRcdGlmIChzZXNzaW9uLnRocmVhZElkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXg6JHtzZXNzaW9uLnNlc3Npb25JZH1dIHJlcGxhY2luZyAke3ByZXZpb3VzU291cmNlID8/ICdpbmNvbXBhdGlibGUtcHJvdmlkZXInfSB0aHJlYWQgJHtzZXNzaW9uLnRocmVhZElkfSB3aXRoIGEgZnJlc2ggJHtzb3VyY2V9IHRocmVhZGApO1xuXHRcdHRoaXMuX3Nlc3Npb25JZEJ5VGhyZWFkSWQuZGVsZXRlKHNlc3Npb24udGhyZWFkSWQpO1xuXHRcdHNlc3Npb24udGhyZWFkSWQgPSB1bmRlZmluZWQ7XG5cdFx0c2Vzc2lvbi5tYXRlcmlhbGl6ZVByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0c2Vzc2lvbi5tYXRlcmlhbGl6ZWRUb29sc1NpZyA9IHVuZGVmaW5lZDtcblx0XHRzZXNzaW9uLm1hdGVyaWFsaXplZE1jcFNpZyA9IHVuZGVmaW5lZDtcblx0XHRzZXNzaW9uLm5lZWRzUmVzdW1lID0gZmFsc2U7XG5cdFx0c2Vzc2lvbi5ob3N0VHVybklkQnlBcHBUdXJuSWQuY2xlYXIoKTtcblx0XHRzZXNzaW9uLmNvZGV4VHVybklkQnlIb3N0VHVybklkLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9oYXNBY3RpdmVUdXJucygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX3Nlc3Npb25zLnZhbHVlcygpXS5zb21lKHNlc3Npb24gPT4gc2Vzc2lvbi5jdXJyZW50VHVybklkICE9PSB1bmRlZmluZWQpXG5cdFx0XHR8fCBbLi4udGhpcy5fc3ViYWdlbnRzQnlUaHJlYWRJZC52YWx1ZXMoKV0uc29tZShzdWJhZ2VudCA9PiBzdWJhZ2VudC5zZXNzaW9uLmN1cnJlbnRUdXJuSWQgIT09IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseVBlbmRpbmdVc2FnZVNvdXJjZUlmSWRsZSgpOiB2b2lkIHtcblx0XHRjb25zdCBwZW5kaW5nVXNhZ2VTb3VyY2UgPSB0aGlzLl9wZW5kaW5nVXNhZ2VTb3VyY2U7XG5cdFx0aWYgKHBlbmRpbmdVc2FnZVNvdXJjZSAmJiAhdGhpcy5faGFzQWN0aXZlVHVybnMoKSkge1xuXHRcdFx0dGhpcy5fYXBwbHlVc2FnZVNvdXJjZUNoYW5nZShwZW5kaW5nVXNhZ2VTb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdC8vICNyZWdpb24gQXV0aFxuXG5cdGdldFByb3RlY3RlZFJlc291cmNlcygpOiBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhW10ge1xuXHRcdHJldHVybiBjb2RleFByb3RlY3RlZFJlc291cmNlc0ZvclVzYWdlU291cmNlKFxuXHRcdFx0dGhpcy5fdXNhZ2VTb3VyY2UsXG5cdFx0XHR0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0Q29waWxvdFJlc291cmNlKCksXG5cdFx0XHR0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0UmVwb1Jlc291cmNlKCksXG5cdFx0KTtcblx0fVxuXG5cdGFzeW5jIGF1dGhlbnRpY2F0ZShyZXNvdXJjZTogc3RyaW5nLCB0b2tlbjogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHJlc291cmNlID09PSB0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0UmVwb1Jlc291cmNlKCkucmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAocmVzb3VyY2UgIT09IHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5nZXRDb3BpbG90UmVzb3VyY2UoKS5yZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBjaGFuZ2VkID0gdGhpcy5fZ2l0aHViVG9rZW4gIT09IHRva2VuO1xuXHRcdHRoaXMuX2dpdGh1YlRva2VuID0gdG9rZW47XG5cdFx0aWYgKHRoaXMuX3VzYWdlU291cmNlID09PSAnb3BlbmFpJykge1xuXHRcdFx0dm9pZCB0aGlzLl9yZWZyZXNoUHJvdmlkZXJDb25maWd1cmF0aW9uKCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKGNoYW5nZWQgJiYgdGhpcy5fY29ubmVjdGlvbi5raW5kID09PSAncmVhZHknICYmIHRoaXMuX2Nvbm5lY3Rpb24ucHJveHlIYW5kbGUpIHtcblx0XHRcdC8vIENvZGV4IHN0YXlzIHJ1bm5pbmcgXHUyMDE0IHByb3h5IHJlYWRzIHRoZSBuZXcgdG9rZW4gZnJvbSBpdHNcblx0XHRcdC8vIG93biBjZWxsIG9uIHRoZSBuZXh0IHJlcXVlc3QgKERlY2lzaW9uIDQpLlxuXHRcdFx0dGhpcy5fY29ubmVjdGlvbi5wcm94eUhhbmRsZS5zZXRUb2tlbih0b2tlbik7XG5cdFx0XHR0aGlzLl9xdWV1ZU1vZGVsUmVmcmVzaCgpO1xuXHRcdH0gZWxzZSBpZiAoY2hhbmdlZCkge1xuXHRcdFx0Ly8gRGVmZXIgbW9kZWwgcmVmcmVzaCB1bnRpbCB0aGUgY29ubmVjdGlvbiBjb21lcyB1cC5cblx0XHRcdHRoaXMuX3F1ZXVlTW9kZWxSZWZyZXNoKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnW0NvZGV4XSBBdXRoIHRva2VuIHVwZGF0ZWQnKTtcblx0XHR2b2lkIHRoaXMuX3JlZnJlc2hQcm92aWRlckNvbmZpZ3VyYXRpb24oKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWNlaXZlcyBhIGJlYXJlciB0b2tlbiB0aGUgd29ya2JlbmNoIGFjcXVpcmVkIGZvciBhIHByb3RlY3RlZCByZXNvdXJjZVxuXHQgKiAodGhlIGBhdXRoZW50aWNhdGVgIGNvbW1hbmQgaXMgZmFubmVkIG91dCB0byBldmVyeSBhZ2VudCkuIElmIHRoZVxuXHQgKiByZXNvdXJjZSBtYXBzIHRvIG9uZSBvciBtb3JlIGNvbmZpZ3VyZWQgYXV0aC1nYXRlZCBodHRwIE1DUCBzZXJ2ZXJzXG5cdCAqICh2aWEgdGhlIGFzc29jaWF0aW9uIHJlY29yZGVkIGF0IGRpc2NvdmVyeSB0aW1lLCBvciBhIGRpcmVjdCBVUkwgbWF0Y2gpLFxuXHQgKiBzdG9yZSB0aGUgdG9rZW4gcGVyIHNlcnZlciBVUkwgKHNvIHtAbGluayBfYnVpbGRTZXNzaW9uTWNwU2VydmVyc30gaW5qZWN0c1xuXHQgKiBpdCkgYW5kIHJlY29ubmVjdCB0aGUgYWZmZWN0ZWQgdGhyZWFkcyBzbyBjb2RleCBwaWNrcyBpdCB1cC4gVGhpcyBpcyB0aGVcblx0ICogY29kZXggZW5kIG9mIHRoZSAqc2FtZSogT0F1dGggbWVjaGFuaXNtIHRoZSBDb3BpbG90IGFnZW50IHVzZXM6IHRoZVxuXHQgKiB3b3JrYmVuY2ggZG9lcyB0aGUgc2lnbi1pbiwgdGhlIGFnZW50IGluamVjdHMgdGhlIHJlc3VsdGluZyBiZWFyZXIuXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGUgdG9rZW4gd2FzIGNvbnN1bWVkIGJ5IGFuIE1DUCBzZXJ2ZXIgKHRoZSBHaXRIdWIgYWdlbnRcblx0ICogdG9rZW4gZmxvd3MgdGhyb3VnaCB7QGxpbmsgYXV0aGVudGljYXRlfSBpbnN0ZWFkKS5cblx0ICovXG5cdGFzeW5jIGhhbmRsZUF1dGhlbnRpY2F0aW9uVG9rZW4ocGFyYW1zOiBBdXRoZW50aWNhdGVQYXJhbXMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBub3JtYWxpemVkUmVzb3VyY2UgPSBub3JtYWxpemVDb2RleE1jcFJlc291cmNlVXJsKHBhcmFtcy5yZXNvdXJjZSk7XG5cdFx0aWYgKG5vcm1hbGl6ZWRSZXNvdXJjZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIFRoZSB3b3JrYmVuY2ggYXV0aGVudGljYXRlcyB0aGUgT0F1dGggYHJlc291cmNlYCwgd2hpY2ggUkZDIDk3Mjhcblx0XHQvLyBkaXNjb3ZlcnkgbWF5IHJlcG9ydCBhcyBkaWZmZXJlbnQgZnJvbSB0aGUgY29uZmlndXJlZCBzZXJ2ZXIgVVJMLlxuXHRcdC8vIFJlc29sdmUgdGhlIHNlcnZlciBVUkwocykgdGhpcyByZXNvdXJjZSB1bmxvY2tzOiB0aGUgYXNzb2NpYXRpb25cblx0XHQvLyByZWNvcmRlZCBhdCBkaXNjb3ZlcnkgdGltZSwgcGx1cyBhIGRpcmVjdCBtYXRjaCB3aGVuIHRoZSByZXNvdXJjZSBJU1xuXHRcdC8vIGEgY29uZmlndXJlZCBzZXJ2ZXIgVVJMIChkaXNjb3ZlcnkgcmV0dXJuZWQgdGhlIFVSTCB1bmNoYW5nZWQsIG9yIHdhc1xuXHRcdC8vIHNraXBwZWQpLlxuXHRcdGNvbnN0IHNlcnZlclVybHMgPSBuZXcgU2V0KHRoaXMuX21jcEF1dGhTZXJ2ZXJVcmxzQnlSZXNvdXJjZS5nZXQobm9ybWFsaXplZFJlc291cmNlKSA/PyBbXSk7XG5cdFx0aWYgKHRoaXMuX2lzQ29uZmlndXJlZEh0dHBTZXJ2ZXJVcmwobm9ybWFsaXplZFJlc291cmNlKSkge1xuXHRcdFx0c2VydmVyVXJscy5hZGQobm9ybWFsaXplZFJlc291cmNlKTtcblx0XHR9XG5cdFx0aWYgKHNlcnZlclVybHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3Qgc2VydmVyVXJsIG9mIHNlcnZlclVybHMpIHtcblx0XHRcdGlmICh0aGlzLl9tY3BBdXRoVG9rZW5zLmdldChzZXJ2ZXJVcmwpICE9PSBwYXJhbXMudG9rZW4pIHtcblx0XHRcdFx0dGhpcy5fbWNwQXV0aFRva2Vucy5zZXQoc2VydmVyVXJsLCBwYXJhbXMudG9rZW4pO1xuXHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCFjaGFuZ2VkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIHN0b3JlZCBNQ1AgYXV0aCB0b2tlbiBmb3IgJHtwYXJhbXMucmVzb3VyY2V9OyByZWNvbm5lY3RpbmcgYWZmZWN0ZWQgc2Vzc2lvbnNgKTtcblx0XHRhd2FpdCB0aGlzLl9yZWNvbm5lY3RTZXNzaW9uc0Zvck1jcEF1dGgoc2VydmVyVXJscyk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKiogV2hldGhlciBgbm9ybWFsaXplZFVybGAgaXMgYSBjdXJyZW50bHktY29uZmlndXJlZCBodHRwIE1DUCBzZXJ2ZXIgKHJvb3QgY29uZmlnIG9yIGFueSBzZXNzaW9uJ3MgY2xpZW50IHBsdWdpbnMpLiAqL1xuXHRwcml2YXRlIF9pc0NvbmZpZ3VyZWRIdHRwU2VydmVyVXJsKG5vcm1hbGl6ZWRVcmw6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmIChPYmplY3QudmFsdWVzKGNvZGV4TWNwU2VydmVyc0Zyb21Db25maWcodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKHBsYXRmb3JtUm9vdFNjaGVtYSwgQWdlbnRIb3N0TWNwU2VydmVyc0NvbmZpZ0tleSkpKVxuXHRcdFx0LnNvbWUoc2VydmVyID0+IHNlcnZlci51cmwgIT09IHVuZGVmaW5lZCAmJiBub3JtYWxpemVDb2RleE1jcFJlc291cmNlVXJsKHNlcnZlci51cmwpID09PSBub3JtYWxpemVkVXJsKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBbLi4udGhpcy5fc2Vzc2lvbnMudmFsdWVzKCldLnNvbWUoc2Vzc2lvbiA9PlxuXHRcdFx0Wy4uLnRoaXMuX2h0dHBNY3BTZXJ2ZXJVcmxzKHNlc3Npb24pLnZhbHVlcygpXS5pbmNsdWRlcyhub3JtYWxpemVkVXJsKSxcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlY29ubmVjdHMgZXZlcnkgbWF0ZXJpYWxpemVkIHNlc3Npb24gd2hvc2UgbWVyZ2VkIE1DUCBzZXJ2ZXJzIGluY2x1ZGUgb25lXG5cdCAqIG9mIGBub3JtYWxpemVkVXJsc2Agc28gY29kZXggcmUtcmVhZHMgYGNvbmZpZy5tY3Bfc2VydmVyc2Agd2l0aCB0aGVcblx0ICogaW5qZWN0ZWQgYEF1dGhvcml6YXRpb25gIGhlYWRlci4gQSB0aHJlYWQgdGhhdCBoYXMgbm90IHlldCBjb21taXR0ZWQgYVxuXHQgKiB0dXJuIGlzIHJlc3RhcnRlZCAoYHRocmVhZC9zdGFydGAsIGxvc3NsZXNzKTsgb25lIHdpdGggaGlzdG9yeSBpcyByZXN1bWVkXG5cdCAqIChgdGhyZWFkL3Jlc3VtZWAgY2FycmllcyB0aGUgc2FtZSBgY29uZmlnYCBmaWVsZCwgbG9hZGluZyBoaXN0b3J5IGZyb20gdGhlXG5cdCAqIHJvbGxvdXQpIG9uIGl0cyBuZXh0IHR1cm4gdmlhIHtAbGluayBJQ29kZXhTZXNzaW9uLm5lZWRzUmVzdW1lfS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3JlY29ubmVjdFNlc3Npb25zRm9yTWNwQXV0aChub3JtYWxpemVkVXJsczogUmVhZG9ubHlTZXQ8c3RyaW5nPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLl9zZXNzaW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHNlc3Npb24uZGlzcG9zZWQgfHwgc2Vzc2lvbi50aHJlYWRJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFbLi4udGhpcy5faHR0cE1jcFNlcnZlclVybHMoc2Vzc2lvbikudmFsdWVzKCldLnNvbWUodXJsID0+IG5vcm1hbGl6ZWRVcmxzLmhhcyh1cmwpKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICghc2Vzc2lvbi5maXJzdFR1cm5TZW50KSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fcmVzdGFydFRocmVhZFdpdGhDdXJyZW50VG9vbHMoc2Vzc2lvbik7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4OiR7c2Vzc2lvbi5zZXNzaW9uSWR9XSByZWNvbm5lY3QgYWZ0ZXIgTUNQIGF1dGggZmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gQSB0aHJlYWQgd2l0aCBoaXN0b3J5IGlzIHJlc3VtZWQgKHdpdGggdGhlIGN1cnJlbnQgY29uZmlnKSBvblxuXHRcdFx0XHQvLyBpdHMgbmV4dCB0dXJuIHJhdGhlciB0aGFuIHJlc3RhcnRlZCwgc28gbm90aGluZyBpcyBsb3N0LlxuXHRcdFx0XHRzZXNzaW9uLm5lZWRzUmVzdW1lID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICoge0BsaW5rIElBZ2VudC5yZWZyZXNoTW9kZWxzfS4gQ29hbGVzY2VzIG9udG8gYW4gaW4tZmxpZ2h0IHJlZnJlc2ggXHUyMDE0IGZyb21cblx0ICogYW4gYWNjb3VudC91c2FnZS1zb3VyY2UgY2hhbmdlIG9yIGFuIGVhcmxpZXIgdGljayBcdTIwMTQgcmF0aGVyIHRoYW4gaXNzdWluZyBhXG5cdCAqIHNlY29uZCBlbnVtZXJhdGlvbiwgYW5kIG5ldmVyIHJlamVjdHM6IHtAbGluayBfcmVmcmVzaE1vZGVsc30gbG9ncyBhbmRcblx0ICogYXBwbGllcyBpdHMgb3duIHN0YWxlLXdyaXRlIGd1YXJkcyBvbiBmYWlsdXJlLlxuXHQgKi9cblx0cmVmcmVzaE1vZGVscygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxzUmVmcmVzaFByb21pc2UgPz8gdGhpcy5fcXVldWVNb2RlbFJlZnJlc2goKTtcblx0fVxuXG5cdHByaXZhdGUgX3F1ZXVlTW9kZWxSZWZyZXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlZnJlc2hQcm9taXNlID0gdGhpcy5fcmVmcmVzaE1vZGVscygpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX21vZGVsc1JlZnJlc2hQcm9taXNlID09PSByZWZyZXNoUHJvbWlzZSkge1xuXHRcdFx0XHR0aGlzLl9tb2RlbHNSZWZyZXNoUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl9tb2RlbHNSZWZyZXNoUHJvbWlzZSA9IHJlZnJlc2hQcm9taXNlO1xuXHRcdHJldHVybiByZWZyZXNoUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZUF1dGhlbnRpY2F0ZWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fdXNhZ2VTb3VyY2UgPT09ICdvcGVuYWknKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB0b2tlbiA9IHRoaXMuX2dpdGh1YlRva2VuO1xuXHRcdGlmICghdG9rZW4pIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKFxuXHRcdFx0XHRBSFBfQVVUSF9SRVFVSVJFRCxcblx0XHRcdFx0J0F1dGhlbnRpY2F0aW9uIGlzIHJlcXVpcmVkIHRvIHVzZSBDb2RleCcsXG5cdFx0XHRcdHRoaXMuZ2V0UHJvdGVjdGVkUmVzb3VyY2VzKCksXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdG9rZW47XG5cdH1cblxuXHRwcml2YXRlIF9kZWZhdWx0TW9kZWwoKTogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1vZGVscyA9IHRoaXMuX21vZGVscy5nZXQoKTtcblx0XHRjb25zdCBjaG9zZW4gPSBtb2RlbHNbMF07XG5cdFx0cmV0dXJuIGNob3NlbiA/IHsgaWQ6IGNob3Nlbi5pZCB9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3VwcG9ydGVkTW9kZWxPclVuZGVmaW5lZChtb2RlbDogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQpOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKG1vZGVsICYmIHRoaXMuX21vZGVscy5nZXQoKS5zb21lKG0gPT4gbS5pZCA9PT0gbW9kZWwuaWQpKSB7XG5cdFx0XHRyZXR1cm4gbW9kZWw7XG5cdFx0fVxuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIElnbm9yaW5nIHVua25vd24gbW9kZWwgJyR7bW9kZWwuaWR9J2ApO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGVmYXVsdE1vZGVsKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlTW9kZWwoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IFByb21pc2U8TW9kZWxTZWxlY3Rpb24+IHtcblx0XHQvLyBFbnN1cmUgdGhlIGNhdGFsb2cgaXMgcG9wdWxhdGVkIGJlZm9yZSB2YWxpZGF0aW5nIHRoZSBzZWxlY3Rpb24gc28gYVxuXHRcdC8vIG1vZGVsIHBpY2tlZCBiZWZvcmUgbW9kZWxzIGZpbmlzaGVkIGxvYWRpbmcgaXNuJ3QgZHJvcHBlZC5cblx0XHRpZiAodGhpcy5fbW9kZWxzLmdldCgpLmxlbmd0aCA9PT0gMCAmJiB0aGlzLl9tb2RlbHNSZWZyZXNoUHJvbWlzZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fbW9kZWxzUmVmcmVzaFByb21pc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHNlbGVjdGVkID0gdGhpcy5fc3VwcG9ydGVkTW9kZWxPclVuZGVmaW5lZChzZXNzaW9uLm1vZGVsKTtcblx0XHRpZiAoc2VsZWN0ZWQpIHtcblx0XHRcdHNlc3Npb24ubW9kZWwgPSBzZWxlY3RlZDtcblx0XHRcdHJldHVybiBzZWxlY3RlZDtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdDb2RleCBoYXMgbm8gYXZhaWxhYmxlIG1vZGVscy4nKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVJlYXNvbmluZ0VmZm9ydENvbmZpZ1NjaGVtYSgpOiBDb25maWdTY2hlbWEge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0W0NPREVYX1RISU5LSU5HX0xFVkVMX0tFWV06IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NvZGV4Lm1vZGVsVGhpbmtpbmdMZXZlbC50aXRsZScsIFwiVGhpbmtpbmcgTGV2ZWxcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb2RleC5tb2RlbFRoaW5raW5nTGV2ZWwuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIGhvdyBtdWNoIHJlYXNvbmluZyBlZmZvcnQgQ29kZXggdXNlcy5cIiksXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ21lZGl1bScsXG5cdFx0XHRcdFx0ZW51bTogWy4uLkNPREVYX1JFQVNPTklOR19FRkZPUlRTXSxcblx0XHRcdFx0XHRlbnVtTGFiZWxzOiBDT0RFWF9SRUFTT05JTkdfRUZGT1JUUy5tYXAoZ2V0UmVhc29uaW5nRWZmb3J0TGFiZWwpLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IENPREVYX1JFQVNPTklOR19FRkZPUlRTLm1hcChlZmZvcnQgPT4gZ2V0UmVhc29uaW5nRWZmb3J0RGVzY3JpcHRpb24oZWZmb3J0KSA/PyAnJyksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSZWFzb25pbmdFZmZvcnQoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IFJlYXNvbmluZ0VmZm9ydCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbW9kZWxDb25maWdFZmZvcnQgPSBuYXJyb3dSZWFzb25pbmdFZmZvcnQoc2Vzc2lvbi5tb2RlbD8uY29uZmlnPy5bQ09ERVhfVEhJTktJTkdfTEVWRUxfS0VZXSk7XG5cdFx0aWYgKG1vZGVsQ29uZmlnRWZmb3J0KSB7XG5cdFx0XHRyZXR1cm4gbW9kZWxDb25maWdFZmZvcnQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFNlc3Npb25Db25maWdWYWx1ZXMoc2Vzc2lvbi5zZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdHJldHVybiBuYXJyb3dSZWFzb25pbmdFZmZvcnQoY29uZmlnPy5bQ29kZXhTZXNzaW9uQ29uZmlnS2V5Lk1vZGVsUmVhc29uaW5nRWZmb3J0XSkgPz8gY29kZXhTZXNzaW9uQ29uZmlnRGVmYXVsdHNbQ29kZXhTZXNzaW9uQ29uZmlnS2V5Lk1vZGVsUmVhc29uaW5nRWZmb3J0XTtcblx0fVxuXG5cdHByaXZhdGUgX3JlYWRTZXNzaW9uQ29uZmlnKHNlc3Npb246IElDb2RleFNlc3Npb24pOiBSZXR1cm5UeXBlPHR5cGVvZiBjb2RleFNlc3Npb25Db25maWdTY2hlbWEudmFsaWRhdGVPckRlZmF1bHQ+IHtcblx0XHRyZXR1cm4gY29kZXhTZXNzaW9uQ29uZmlnU2NoZW1hLnZhbGlkYXRlT3JEZWZhdWx0KFxuXHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlcyhzZXNzaW9uLnNlc3Npb25VcmkudG9TdHJpbmcoKSksXG5cdFx0XHRjb2RleFNlc3Npb25Db25maWdEZWZhdWx0cyxcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgdGhlIENvZGV4IHNlY3VyaXR5IGF4ZXMgKGFwcHJvdmFsIHBvbGljeSwgc2FuZGJveCwgcmV2aWV3ZXIpIGZvciBhXG5cdCAqIGxpdmUgb3IgcmVzdG9yZWQgc2Vzc2lvbiBmcm9tIGl0cyBSQVcgcGVyc2lzdGVkIGNvbmZpZyB2YWx1ZXMuXG5cdCAqXG5cdCAqIFRoZSByYXcgdmFsdWVzIGFyZSBub3JtYWxpemVkIHRocm91Z2gge0BsaW5rIG1pZ3JhdGVDb2RleFBlcm1pc3Npb25WYWx1ZXN9XG5cdCAqICh0aGUgc2FtZSBtaWdyYXRpb24gdGhlIHJlc3RvcmUgcGF0aCBhcHBsaWVzKSBiZWZvcmUgcmVzb2x2aW5nLCBzbyB0aGVcblx0ICogYXhlcyB3ZSBzZW5kIHRvIHRoZSBhcHAtc2VydmVyIGFsd2F5cyBtYXRjaCB0aGUgcHJlc2V0IHRoZSBcIkFwcHJvdmFsc1wiIGNoaXBcblx0ICogZGlzcGxheXMuIFRoaXMgbWF0dGVycyBmb3IgdHdvIGxlZ2FjeSBzaGFwZXM6XG5cdCAqIC0gYSBzZXNzaW9uIHRoYXQgcGVyc2lzdGVkIG9ubHkgYHNhbmRib3hNb2RlID0gJ3JlYWQtb25seSdgIGlzIHByZXNlcnZlZFxuXHQgKiAgIHZlcmJhdGltLCBzbyBpdCBpcyBOT1Qgc2lsZW50bHkgZXNjYWxhdGVkIGJhY2sgdG8gYHdvcmtzcGFjZS13cml0ZWAgb25cblx0ICogICByZXN1bWUgKHRoZSBjaGlwIG92ZXItcHJvbWlzZXMsIGJ1dCB0aGUgc2Vzc2lvbiBzdGF5cyBtb3JlIGxvY2tlZCBkb3duKTtcblx0ICogLSBhIHNlc3Npb24gdGhhdCBwZXJzaXN0ZWQgYGFwcHJvdmFsUG9saWN5ID0gJ25ldmVyJ2AgKyBgd29ya3NwYWNlLXdyaXRlYFxuXHQgKiAgICh3aGljaCB0aGUgY2hpcCByZW5kZXJzIGFzIFwiRGVmYXVsdCBQZXJtaXNzaW9uc1wiKSBpcyBzbmFwcGVkIG9udG8gdGhlXG5cdCAqICAgYGRlZmF1bHRgIHByZXNldCdzIGBvbi1yZXF1ZXN0YCBwb2xpY3kgc28gaXQgYWN0dWFsbHkgcHJvbXB0cywgaW5zdGVhZCBvZlxuXHQgKiAgIHJ1bm5pbmcgY29tbWFuZHMgdW5wcm9tcHRlZCB3aGlsZSB0aGUgY2hpcCBjbGFpbXMgaXQgd291bGQgYXNrLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZVNlc3Npb25QZXJtaXNzaW9ucyhzZXNzaW9uOiBJQ29kZXhTZXNzaW9uKTogSUNvZGV4UmVzb2x2ZWRQZXJtaXNzaW9ucyB7XG5cdFx0Y29uc3QgcmF3VmFsdWVzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlcyhzZXNzaW9uLnNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgZGVmYXVsdHMgPSB7XG5cdFx0XHRhcHByb3ZhbFBvbGljeTogY29kZXhTZXNzaW9uQ29uZmlnRGVmYXVsdHNbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LkFwcHJvdmFsUG9saWN5XSxcblx0XHRcdHNhbmRib3hNb2RlOiBjb2RleFNlc3Npb25Db25maWdEZWZhdWx0c1tDb2RleFNlc3Npb25Db25maWdLZXkuU2FuZGJveE1vZGVdLFxuXHRcdH07XG5cdFx0cmV0dXJuIHJlc29sdmVDb2RleFBlcm1pc3Npb25zKG1pZ3JhdGVDb2RleFBlcm1pc3Npb25WYWx1ZXMocmF3VmFsdWVzLCBkZWZhdWx0cyksIGRlZmF1bHRzKTtcblx0fVxuXG5cdHByaXZhdGUgX3NhbmRib3hQb2xpY3koc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgY29uZmlnOiBSZXR1cm5UeXBlPHR5cGVvZiBjb2RleFNlc3Npb25Db25maWdTY2hlbWEudmFsaWRhdGVPckRlZmF1bHQ+LCBtb2RlOiBTYW5kYm94TW9kZSk6IFNhbmRib3hQb2xpY3kge1xuXHRcdGlmIChtb2RlID09PSAnZGFuZ2VyLWZ1bGwtYWNjZXNzJykge1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogJ2RhbmdlckZ1bGxBY2Nlc3MnIH07XG5cdFx0fVxuXHRcdGNvbnN0IG5ldHdvcmtBY2Nlc3MgPSBuYXJyb3dCb29sZWFuKGNvbmZpZ1tDb2RleFNlc3Npb25Db25maWdLZXkuTmV0d29ya0FjY2Vzc0VuYWJsZWRdKSA/PyBjb2RleFNlc3Npb25Db25maWdEZWZhdWx0c1tDb2RleFNlc3Npb25Db25maWdLZXkuTmV0d29ya0FjY2Vzc0VuYWJsZWRdO1xuXHRcdGlmIChtb2RlID09PSAncmVhZC1vbmx5Jykge1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogJ3JlYWRPbmx5JywgbmV0d29ya0FjY2VzczogZmFsc2UgfTtcblx0XHR9XG5cdFx0Y29uc3QgYWRkaXRpb25hbERpcmVjdG9yaWVzID0gbmFycm93QWRkaXRpb25hbERpcmVjdG9yaWVzKGNvbmZpZ1tDb2RleFNlc3Npb25Db25maWdLZXkuQWRkaXRpb25hbERpcmVjdG9yaWVzXSkgPz8gW107XG5cdFx0Y29uc3Qgd3JpdGFibGVSb290cyA9IHRoaXMuX2lzTXVsdGlSb290QWN0aXZlKHNlc3Npb24pXG5cdFx0XHQ/IGRpc3RpbmN0QWJzb2x1dGVQYXRocyhbXG5cdFx0XHRcdC4uLnRoaXMuX3J1bnRpbWVXb3Jrc3BhY2VSb290cyhzZXNzaW9uKSxcblx0XHRcdFx0Li4uYWRkaXRpb25hbERpcmVjdG9yaWVzLFxuXHRcdFx0XSlcblx0XHRcdDogW1xuXHRcdFx0XHQuLi4oc2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5ID8gW3Nlc3Npb24ud29ya2luZ0RpcmVjdG9yeS5mc1BhdGhdIDogW10pLFxuXHRcdFx0XHQuLi5hZGRpdGlvbmFsRGlyZWN0b3JpZXMsXG5cdFx0XHRdO1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnd29ya3NwYWNlV3JpdGUnLFxuXHRcdFx0d3JpdGFibGVSb290cyxcblx0XHRcdG5ldHdvcmtBY2Nlc3MsXG5cdFx0XHRleGNsdWRlVG1wZGlyRW52VmFyOiBmYWxzZSxcblx0XHRcdGV4Y2x1ZGVTbGFzaFRtcDogZmFsc2UsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3R1cm5TdGFydE9wdGlvbnMoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgbW9kZWxJZDogc3RyaW5nKTogUGljazxUdXJuU3RhcnRQYXJhbXMsICdhcHByb3ZhbFBvbGljeScgfCAnc2FuZGJveFBvbGljeScgfCAnYXBwcm92YWxzUmV2aWV3ZXInIHwgJ2VmZm9ydCcgfCAncnVudGltZVdvcmtzcGFjZVJvb3RzJyB8ICdwZXJzb25hbGl0eScgfCAnc3VtbWFyeScgfCAnY29sbGFib3JhdGlvbk1vZGUnPiB7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fcmVhZFNlc3Npb25Db25maWcoc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBhcHByb3ZhbFBvbGljeSwgc2FuZGJveE1vZGUsIGFwcHJvdmFsc1Jldmlld2VyIH0gPSB0aGlzLl9yZXNvbHZlU2Vzc2lvblBlcm1pc3Npb25zKHNlc3Npb24pO1xuXHRcdGNvbnN0IHNhbmRib3hQb2xpY3kgPSB0aGlzLl9zYW5kYm94UG9saWN5KHNlc3Npb24sIGNvbmZpZywgc2FuZGJveE1vZGUpO1xuXHRcdGNvbnN0IHJ1bnRpbWVXb3Jrc3BhY2VSb290cyA9IHRoaXMuX2lzTXVsdGlSb290QWN0aXZlKHNlc3Npb24pXG5cdFx0XHQ/IHRoaXMuX3J1bnRpbWVXb3Jrc3BhY2VSb290cyhzZXNzaW9uKVxuXHRcdFx0OiAoc2FuZGJveFBvbGljeS50eXBlID09PSAnd29ya3NwYWNlV3JpdGUnID8gc2FuZGJveFBvbGljeS53cml0YWJsZVJvb3RzIDogdW5kZWZpbmVkKTtcblx0XHRjb25zdCBlZmZvcnQgPSB0aGlzLl9nZXRSZWFzb25pbmdFZmZvcnQoc2Vzc2lvbik7XG5cdFx0Y29uc3QgcGVyc29uYWxpdHkgPSBuYXJyb3dQZXJzb25hbGl0eShjb25maWdbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlBlcnNvbmFsaXR5XSkgPz8gY29kZXhTZXNzaW9uQ29uZmlnRGVmYXVsdHNbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlBlcnNvbmFsaXR5XTtcblx0XHRjb25zdCBzdW1tYXJ5ID0gbmFycm93UmVhc29uaW5nU3VtbWFyeShjb25maWdbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlJlYXNvbmluZ1N1bW1hcnldKSA/PyBjb2RleFNlc3Npb25Db25maWdEZWZhdWx0c1tDb2RleFNlc3Npb25Db25maWdLZXkuUmVhc29uaW5nU3VtbWFyeV07XG5cdFx0Ly8gTWFwIHRoZSBwbGF0Zm9ybS1nZW5lcmljIEFnZW50IE1vZGUgdG8gY29kZXgncyBuYXRpdmUgY29sbGFib3JhdGlvblxuXHRcdC8vIG1vZGUuIEFsd2F5cyBzZW5kIGl0IChldmVuIGZvciBgZGVmYXVsdGApIHNvIHN3aXRjaGluZyBQbGFuIFx1MjE5MiBJbnRlcmFjdGl2ZVxuXHRcdC8vIHJlc2V0cyB0aGUgc3RpY2t5IHRocmVhZCBtb2RlLiBgY29sbGFib3JhdGlvbk1vZGUuc2V0dGluZ3NgIGNhcnJpZXMgdGhlXG5cdFx0Ly8gbW9kZWwgKyBlZmZvcnQgYmVjYXVzZSBjb2RleCB0cmVhdHMgaXQgYXMgYXV0aG9yaXRhdGl2ZSBvdmVyIHRoZVxuXHRcdC8vIHRvcC1sZXZlbCBmaWVsZHMgd2hlbiBhIGNvbGxhYm9yYXRpb24gbW9kZSBpcyBzZXQuXG5cdFx0Y29uc3QgbW9kZSA9IGNvbGxhYm9yYXRpb25Nb2RlS2luZChjb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXSk7XG5cdFx0Y29uc3QgY29sbGFib3JhdGlvbk1vZGU6IFR1cm5TdGFydFBhcmFtc1snY29sbGFib3JhdGlvbk1vZGUnXSA9IHtcblx0XHRcdG1vZGUsXG5cdFx0XHRzZXR0aW5nczogeyBtb2RlbDogbW9kZWxJZCwgcmVhc29uaW5nX2VmZm9ydDogZWZmb3J0ID8/IG51bGwsIGRldmVsb3Blcl9pbnN0cnVjdGlvbnM6IG51bGwgfSxcblx0XHR9O1xuXHRcdHJldHVybiB7XG5cdFx0XHRhcHByb3ZhbFBvbGljeSxcblx0XHRcdHNhbmRib3hQb2xpY3ksXG5cdFx0XHRhcHByb3ZhbHNSZXZpZXdlcixcblx0XHRcdGVmZm9ydCxcblx0XHRcdHBlcnNvbmFsaXR5LFxuXHRcdFx0c3VtbWFyeSxcblx0XHRcdGNvbGxhYm9yYXRpb25Nb2RlLFxuXHRcdFx0Li4uKHJ1bnRpbWVXb3Jrc3BhY2VSb290cyA/IHsgcnVudGltZVdvcmtzcGFjZVJvb3RzIH0gOiB7fSksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3J1bnRpbWVXb3Jrc3BhY2VSb290cyhzZXNzaW9uOiBJQ29kZXhTZXNzaW9uKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IHNlc3Npb24ud29ya2luZ0RpcmVjdG9yaWVzXG5cdFx0XHQ/PyAoc2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5ID8gW3Nlc3Npb24ud29ya2luZ0RpcmVjdG9yeV0gOiBbXSk7XG5cdFx0cmV0dXJuIGRpc3RpbmN0QWJzb2x1dGVQYXRocyh3b3JraW5nRGlyZWN0b3JpZXMubWFwKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkuZnNQYXRoKSk7XG5cdH1cblxuXHRwcml2YXRlIF9pc011bHRpUm9vdEFjdGl2ZShzZXNzaW9uOiBJQ29kZXhTZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHNlc3Npb24ubXVsdGlSb290RW5hYmxlZCAmJiAoc2Vzc2lvbi53b3JraW5nRGlyZWN0b3JpZXM/Lmxlbmd0aCA/PyAwKSA+IDE7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWZyZXNoTW9kZWxzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHVzYWdlU291cmNlID0gdGhpcy5fdXNhZ2VTb3VyY2U7XG5cdFx0aWYgKHVzYWdlU291cmNlID09PSAnb3BlbmFpJykge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVmcmVzaE9wZW5BSU1vZGVscygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0b2tlbiA9IHRoaXMuX2dpdGh1YlRva2VuO1xuXHRcdGlmICghdG9rZW4pIHtcblx0XHRcdHRoaXMuX21vZGVscy5zZXQoW10sIHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB1c2VyQWdlbnQgPSBgJHtVU0VSX0FHRU5UX1BSRUZJWH0vJHt0aGlzLl9wcm9kdWN0U2VydmljZS52ZXJzaW9ufWA7XG5cdFx0XHRjb25zdCBhbGwgPSBhd2FpdCB0aGlzLl9jb3BpbG90QXBpU2VydmljZS5tb2RlbHModG9rZW4sIHsgaGVhZGVyczogeyAnVXNlci1BZ2VudCc6IHVzZXJBZ2VudCB9LCBzdXBwcmVzc0ludGVncmF0aW9uSWQ6IHRydWUgfSk7XG5cdFx0XHRpZiAodGhpcy5fdXNhZ2VTb3VyY2UgIT09IHVzYWdlU291cmNlIHx8IHRoaXMuX2dpdGh1YlRva2VuICE9PSB0b2tlbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb25maWdTY2hlbWEgPSB0aGlzLl9jcmVhdGVSZWFzb25pbmdFZmZvcnRDb25maWdTY2hlbWEoKTtcblx0XHRcdC8vIENvZGV4IHRhbGtzIHRvIGV2ZXJ5IG1vZGVsIHRocm91Z2ggdGhlIGB2c2NvZGUtcHJveHlgIGN1c3RvbSBtb2RlbFxuXHRcdFx0Ly8gcHJvdmlkZXIgd2l0aCBgd2lyZV9hcGk9XCJyZXNwb25zZXNcImAgKHNlZSBDb2RleFByb3h5U2VydmljZSksIHNvIGl0XG5cdFx0XHQvLyBjYW4gb25seSBkcml2ZSBtb2RlbHMgdGhhdCBleHBvc2UgQ29waWxvdCBDQVBJJ3MgT3BlbkFJLXNoYXBlZFxuXHRcdFx0Ly8gUmVzcG9uc2VzIGVuZHBvaW50LiBGaWx0ZXIgdGhlIGNhdGFsb2cgdG8gdGhvc2UgYWR2ZXJ0aXNpbmdcblx0XHRcdC8vIGAvcmVzcG9uc2VzYCBpbiBgc3VwcG9ydGVkX2VuZHBvaW50c2AgKHRoaXMgZHJvcHMgQW50aHJvcGljXG5cdFx0XHQvLyBgL3YxL21lc3NhZ2VzYCBhbmQgY2hhdC1jb21wbGV0aW9ucy1vbmx5IG1vZGVscywgd2hpY2ggY29kZXggY2Fubm90XG5cdFx0XHQvLyB1c2UpLiBUaGUgY2hvc2VuIGlkIGlzIGZvcndhcmRlZCBzdHJhaWdodCB0aHJvdWdoOyBDQVBJIHJlbWFpbnMgdGhlXG5cdFx0XHQvLyBhdXRob3JpdHkgb24gd2hhdCB0aGUgdG9rZW4gbWF5IGFjdHVhbGx5IHVzZS5cblx0XHRcdGNvbnN0IG1vZGVscyA9IGFsbFxuXHRcdFx0XHQuZmlsdGVyKG0gPT4gbS5zdXBwb3J0ZWRfZW5kcG9pbnRzPy5pbmNsdWRlcyhDT0RFWF9SRVNQT05TRVNfRU5EUE9JTlQpKVxuXHRcdFx0XHQuc29ydCgoYSwgYikgPT4gTnVtYmVyKGIuaXNfY2hhdF9kZWZhdWx0KSAtIE51bWJlcihhLmlzX2NoYXRfZGVmYXVsdCkpXG5cdFx0XHRcdC5tYXAoKG0pOiBJQWdlbnRNb2RlbEluZm8gPT4gKHtcblx0XHRcdFx0XHRwcm92aWRlcjogdGhpcy5pZCxcblx0XHRcdFx0XHRpZDogbS5pZCxcblx0XHRcdFx0XHRuYW1lOiBtLm5hbWUgPz8gbS5pZCxcblx0XHRcdFx0XHRtYXhDb250ZXh0V2luZG93OiBtLmNhcGFiaWxpdGllcz8ubGltaXRzPy5tYXhfY29udGV4dF93aW5kb3dfdG9rZW5zLFxuXHRcdFx0XHRcdG1heE91dHB1dFRva2VuczogbS5jYXBhYmlsaXRpZXM/LmxpbWl0cz8ubWF4X291dHB1dF90b2tlbnMsXG5cdFx0XHRcdFx0bWF4UHJvbXB0VG9rZW5zOiBtLmNhcGFiaWxpdGllcz8ubGltaXRzPy5tYXhfcHJvbXB0X3Rva2Vucyxcblx0XHRcdFx0XHRzdXBwb3J0c1Zpc2lvbjogISFtLmNhcGFiaWxpdGllcz8uc3VwcG9ydHM/LnZpc2lvbixcblx0XHRcdFx0XHRjb25maWdTY2hlbWEsXG5cdFx0XHRcdFx0cG9saWN5U3RhdGU6IG0ucG9saWN5Py5zdGF0ZSBhcyBQb2xpY3lTdGF0ZSB8IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogY3JlYXRlUHJpY2luZ01ldGFGcm9tQmlsbGluZyhcblx0XHRcdFx0XHRcdG5vcm1hbGl6ZUNBUElCaWxsaW5nKG0uYmlsbGluZyksXG5cdFx0XHRcdFx0XHR0eXBlb2YgbS5tb2RlbF9waWNrZXJfcHJpY2VfY2F0ZWdvcnkgPT09ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdD8gbS5tb2RlbF9waWNrZXJfcHJpY2VfY2F0ZWdvcnlcblx0XHRcdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fbW9kZWxzLnNldChtb2RlbHMsIHVuZGVmaW5lZCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gRmFpbGVkIHRvIHJlZnJlc2ggbW9kZWxzOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdC8vIEtlZXAgdGhlIGxhc3Qga25vd24tZ29vZCBjYXRhbG9nLiBVc2FnZS1zb3VyY2UgY2hhbmdlcyBjbGVhciB0aGVcblx0XHRcdC8vIGxpc3QgaW4gYF9hcHBseVVzYWdlU291cmNlQ2hhbmdlYDsgYSB0cmFuc2llbnQgcGVyaW9kaWMgZmFpbHVyZVxuXHRcdFx0Ly8gbXVzdCBub3QgbWFrZSBldmVyeSBtb2RlbCBkaXNhcHBlYXIuXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaE9wZW5BSU1vZGVscygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHRoaXMuX2Vuc3VyZUNvbm5lY3Rpb24oKTtcblx0XHRcdGlmIChjb25uZWN0aW9uLnVzYWdlU291cmNlICE9PSAnb3BlbmFpJykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkYXRhID0gW10gYXMgTW9kZWxMaXN0UmVzcG9uc2VbJ2RhdGEnXTtcblx0XHRcdGxldCBjdXJzb3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdFx0ZG8ge1xuXHRcdFx0XHRjb25zdCByZXNwb25zZTogTW9kZWxMaXN0UmVzcG9uc2UgPSBhd2FpdCBjb25uZWN0aW9uLmNsaWVudC5yZXF1ZXN0PCdtb2RlbC9saXN0JywgTW9kZWxMaXN0UmVzcG9uc2U+KCdtb2RlbC9saXN0JywgeyBjdXJzb3IsIGxpbWl0OiAxMDAsIGluY2x1ZGVIaWRkZW46IGZhbHNlIH0pO1xuXHRcdFx0XHRkYXRhLnB1c2goLi4ucmVzcG9uc2UuZGF0YSk7XG5cdFx0XHRcdGN1cnNvciA9IHJlc3BvbnNlLm5leHRDdXJzb3I7XG5cdFx0XHR9IHdoaWxlIChjdXJzb3IgIT09IG51bGwpO1xuXHRcdFx0Y29uc3QgY29uZmlnU2NoZW1hID0gdGhpcy5fY3JlYXRlUmVhc29uaW5nRWZmb3J0Q29uZmlnU2NoZW1hKCk7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBkYXRhXG5cdFx0XHRcdC5zb3J0KChsZWZ0LCByaWdodCkgPT4gTnVtYmVyKHJpZ2h0LmlzRGVmYXVsdCkgLSBOdW1iZXIobGVmdC5pc0RlZmF1bHQpKVxuXHRcdFx0XHQubWFwKChtb2RlbCk6IElBZ2VudE1vZGVsSW5mbyA9PiAoe1xuXHRcdFx0XHRcdHByb3ZpZGVyOiB0aGlzLmlkLFxuXHRcdFx0XHRcdGlkOiBtb2RlbC5tb2RlbCxcblx0XHRcdFx0XHRuYW1lOiBtb2RlbC5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRzdXBwb3J0c1Zpc2lvbjogbW9kZWwuaW5wdXRNb2RhbGl0aWVzLmluY2x1ZGVzKCdpbWFnZScpLFxuXHRcdFx0XHRcdGNvbmZpZ1NjaGVtYSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0aWYgKHRoaXMuX3VzYWdlU291cmNlID09PSAnb3BlbmFpJykge1xuXHRcdFx0XHR0aGlzLl9tb2RlbHMuc2V0KG1vZGVscywgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSBGYWlsZWQgdG8gcmVmcmVzaCBPcGVuQUkgbW9kZWxzOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdC8vIEtlZXAgdGhlIGxhc3Qga25vd24tZ29vZCBjYXRhbG9nLiBVc2FnZS1zb3VyY2UgY2hhbmdlcyBjbGVhciB0aGVcblx0XHRcdC8vIGxpc3QgaW4gYF9hcHBseVVzYWdlU291cmNlQ2hhbmdlYDsgYSB0cmFuc2llbnQgcGVyaW9kaWMgZmFpbHVyZVxuXHRcdFx0Ly8gbXVzdCBub3QgbWFrZSBldmVyeSBtb2RlbCBkaXNhcHBlYXIuXG5cdFx0fVxuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gQ29ubmVjdGlvbiBsaWZlY3ljbGVcblxuXHQvKipcblx0ICogTGF6aWx5IHNwYXduIHRoZSBjb2RleCBhcHAtc2VydmVyLCBpbml0aWFsaXplIHRoZSBjb25uZWN0aW9uLFxuXHQgKiBhdXRoZW50aWNhdGUgdmlhIGFwaUtleSwgYW5kIHJldHVybiB0aGUgcmVhZHkgY29ubmVjdGlvbi4gSWRlbXBvdGVudFxuXHQgKiBcdTIwMTQgY29uY3VycmVudCBjYWxsZXJzIHNoYXJlIHRoZSBzYW1lIHByb21pc2UuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9lbnN1cmVDb25uZWN0aW9uKHNraXBVc2FnZVNvdXJjZVZhbGlkYXRpb24gPSBmYWxzZSk6IFByb21pc2U8SUNvbm5lY3Rpb25SZWFkeT4ge1xuXHRcdGlmICh0aGlzLl9jb25uZWN0aW9uLmtpbmQgPT09ICdyZWFkeScpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5fY29ubmVjdGlvbik7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jb25uZWN0aW9uLmtpbmQgPT09ICdzdGFydGluZycpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jb25uZWN0aW9uLnByb21pc2U7XG5cdFx0fVxuXHRcdGlmICghc2tpcFVzYWdlU291cmNlVmFsaWRhdGlvbiAmJiB0aGlzLl91c2FnZVNvdXJjZSA9PT0gJ29wZW5haScpIHtcblx0XHRcdGxldCB2YWxpZGF0aW9uID0gdGhpcy5fdXNhZ2VTb3VyY2VWYWxpZGF0aW9uO1xuXHRcdFx0YXdhaXQgdmFsaWRhdGlvbjtcblx0XHRcdHdoaWxlICh2YWxpZGF0aW9uICE9PSB0aGlzLl91c2FnZVNvdXJjZVZhbGlkYXRpb24pIHtcblx0XHRcdFx0dmFsaWRhdGlvbiA9IHRoaXMuX3VzYWdlU291cmNlVmFsaWRhdGlvbjtcblx0XHRcdFx0YXdhaXQgdmFsaWRhdGlvbjtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgdG9rZW4gPSB0aGlzLl9lbnN1cmVBdXRoZW50aWNhdGVkKCk7XG5cdFx0Y29uc3QgdXNhZ2VTb3VyY2UgPSB0aGlzLl91c2FnZVNvdXJjZTtcblx0XHRjb25zdCBnZW5lcmF0aW9uID0gdGhpcy5fY29ubmVjdGlvbkdlbmVyYXRpb247XG5cdFx0Y29uc3Qgc3RhcnRQcm9taXNlID0gdGhpcy5fc3RhcnRDb25uZWN0aW9uKHVzYWdlU291cmNlLCB0b2tlbik7XG5cdFx0Y29uc3QgcHJvbWlzZSA9IHN0YXJ0UHJvbWlzZS50aGVuKHJlYWR5ID0+IHtcblx0XHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLl9jb25uZWN0aW9uR2VuZXJhdGlvbiB8fCB1c2FnZVNvdXJjZSAhPT0gdGhpcy5fdXNhZ2VTb3VyY2UpIHtcblx0XHRcdFx0cmVhZHkuY2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVhZHkucHJveHlIYW5kbGU/LmRpc3Bvc2UoKTtcblx0XHRcdFx0dHJ5IHsgcmVhZHkuY2hpbGQua2lsbCgnU0lHS0lMTCcpOyB9IGNhdGNoIHsgLyogYWxyZWFkeSBkZWFkICovIH1cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb2RleCB1c2FnZSBzb3VyY2UgY2hhbmdlZCB3aGlsZSBhcHAtc2VydmVyIHdhcyBzdGFydGluZycpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29ubmVjdGlvbiA9IHsga2luZDogJ3JlYWR5JywgLi4ucmVhZHkgfTtcblx0XHRcdHJldHVybiByZWFkeTtcblx0XHR9KS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0aWYgKGdlbmVyYXRpb24gPT09IHRoaXMuX2Nvbm5lY3Rpb25HZW5lcmF0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb24gPSB7IGtpbmQ6ICdpZGxlJyB9O1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH0pO1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb24gPSB7IGtpbmQ6ICdzdGFydGluZycsIHByb21pc2UgfTtcblx0XHRyZXR1cm4gcHJvbWlzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSBDb2RleCBTREsgcm9vdCBcdTIwMTQgdGhlIGRpcmVjdG9yeSB3aG9zZVxuXHQgKiBgbm9kZV9tb2R1bGVzL0BvcGVuYWkvY29kZXgtPHRhcmdldD4vXHUyMDI2YCBob2xkcyB0aGUgbmF0aXZlIGJpbmFyeS5cblx0ICpcblx0ICogTWlycm9ycyB0aGUgdGhyZWUtdGllciByZXNvbHV0aW9uIGluIGBDbGF1ZGVBZ2VudFNka1NlcnZpY2UuX2xvYWRTZGtgOlxuXHQgKiAgIDEuIGRldiBvdmVycmlkZSAvIHByb2R1Y3QgZG93bmxvYWQsIHZpYSB0aGUgZG93bmxvYWRlciwgd2hlbiB0aGUgU0RLXG5cdCAqICAgICAgYGlzQXZhaWxhYmxlYCAoZW52IG92ZXJyaWRlIHx8IGBwcm9kdWN0LmFnZW50U2Rrcy5jb2RleGApO1xuXHQgKiAgIDIuIGRldiBmYWxsYmFjayB0byB0aGlzIHJlcG8ncyBgbm9kZV9tb2R1bGVzYCwgd2hlcmUgYEBvcGVuYWkvY29kZXhgXG5cdCAqICAgICAgYW5kIGl0cyBwZXItaG9zdCBiaW5hcnkgcGFja2FnZSBhcmUgZGV2RGVwZW5kZW5jaWVzIFx1MjAxNCB0aGlzIGlzIHdoYXRcblx0ICogICAgICBsZXRzIHJ1bm5pbmctZnJvbS1zb3VyY2UgKGFuZCBkZXYgc21va2UgdGVzdHMpIHNwYXduIENvZGV4IHdpdGhvdXRcblx0ICogICAgICBhbiBlbnYtdmFyIG92ZXJyaWRlLlxuXHQgKlxuXHQgKiBgaXNBdmFpbGFibGVgIGlzIGFscmVhZHkgZmFsc2UgaW4gZGV2LCBzbyBpdCBkaXNjcmltaW5hdGVzIHRoZSB0d29cblx0ICogd2l0aG91dCBpbmplY3RpbmcgYElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2VgLiBXaGVuIG5laXRoZXIgcGF0aFxuXHQgKiByZXNvbHZlcyB3ZSBkZWZlciB0byB0aGUgZG93bmxvYWRlciBzbyBjYWxsZXJzIGdldCBpdHMgYWN0aW9uYWJsZVxuXHQgKiBcIm5vdCBjb25maWd1cmVkXCIgZGlhZ25vc3RpYy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVTZGtSb290KCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0aWYgKHRoaXMuX2FnZW50U2RrRG93bmxvYWRlci5pc0F2YWlsYWJsZShDb2RleFNka1BhY2thZ2UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWdlbnRTZGtEb3dubG9hZGVyLmxvYWRTZGtSb290KENvZGV4U2RrUGFja2FnZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fVxuXHRcdGNvbnN0IGRldlJvb3QgPSBhd2FpdCByZXNvbHZlQ29kZXhEZXZTZGtSb290KCk7XG5cdFx0aWYgKGRldlJvb3QpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSByZXNvbHZpbmcgU0RLIGZyb20gcmVwbyBub2RlX21vZHVsZXMgKGRldiBmYWxsYmFjayk6ICR7ZGV2Um9vdH1gKTtcblx0XHRcdHJldHVybiBkZXZSb290O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYWdlbnRTZGtEb3dubG9hZGVyLmxvYWRTZGtSb290KENvZGV4U2RrUGFja2FnZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zdGFydENvbm5lY3Rpb24odXNhZ2VTb3VyY2U6IENvZGV4VXNhZ2VTb3VyY2UsIHRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPElDb25uZWN0aW9uUmVhZHk+IHtcblx0XHQvLyBSZXNvbHZlIHRoZSBDb2RleCBTREsgcm9vdDogZGV2IG92ZXJyaWRlIC8gcHJvZHVjdCBkb3dubG9hZCB2aWEgdGhlXG5cdFx0Ly8gZG93bmxvYWRlciwgb3IgdGhpcyByZXBvJ3MgYG5vZGVfbW9kdWxlc2AgaW4gYSBzb3VyY2UgY2hlY2tvdXQgKHNlZVxuXHRcdC8vIGBfcmVzb2x2ZVNka1Jvb3RgKS4gV2Ugc3Bhd24gdGhlIG5hdGl2ZSBjb2RleCBiaW5hcnkgaW5zaWRlIHRoZVxuXHRcdC8vIHBsYXRmb3JtIHBhY2thZ2UgZGlyZWN0bHkgKHRoZSBzYW1lIHNoYXBlIHRoZSBKUyBzaGltIGF0XG5cdFx0Ly8gYG5vZGVfbW9kdWxlcy9Ab3BlbmFpL2NvZGV4L2Jpbi9jb2RleC5qc2Agd291bGQgcmVzb2x2ZSB0bykgXHUyMDE0IGdvaW5nXG5cdFx0Ly8gdGhyb3VnaCB0aGUgc2hpbSBhZGRzIGEgbGF1bmNoZXIgaG9wIGFuZCBmb3JjZXMgYW5cblx0XHQvLyBgRUxFQ1RST05fUlVOX0FTX05PREVgIHJvdW5kLXRyaXAgd2hlbiB0aGUgYWdlbnQgaG9zdCBydW5zIGFzIGFuXG5cdFx0Ly8gRWxlY3Ryb24gdXRpbGl0eSBwcm9jZXNzLlxuXHRcdGNvbnN0IHJvb3QgPSBhd2FpdCB0aGlzLl9yZXNvbHZlU2RrUm9vdCgpO1xuXHRcdGNvbnN0IGNvZGV4VGFyZ2V0ID0gY29kZXhQYWNrYWdlU3VmZml4KHByb2Nlc3MucGxhdGZvcm0sIHByb2Nlc3MuYXJjaCk7XG5cdFx0aWYgKCFjb2RleFRhcmdldCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDb2RleDogdW5zdXBwb3J0ZWQgcGxhdGZvcm0gJHtwcm9jZXNzLnBsYXRmb3JtfS0ke3Byb2Nlc3MuYXJjaH1gKTtcblx0XHR9XG5cdFx0Y29uc3QgdHJpcGxlID0gY29kZXhCaW5hcnlUcmlwbGUoY29kZXhUYXJnZXQpO1xuXHRcdGlmICghdHJpcGxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvZGV4OiBubyBiaW5hcnkgdHJpcGxlIGtub3duIGZvciBzZGtUYXJnZXQgJyR7Y29kZXhUYXJnZXR9J2ApO1xuXHRcdH1cblx0XHRjb25zdCBiaW5hcnlOYW1lID0gcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyA/ICdjb2RleC5leGUnIDogJ2NvZGV4Jztcblx0XHRjb25zdCBiaW5hcnlQYXRoID0gam9pbihyb290LCAnbm9kZV9tb2R1bGVzJywgYEBvcGVuYWkvY29kZXgtJHtjb2RleFRhcmdldH1gLCAndmVuZG9yJywgdHJpcGxlLCAnYmluJywgYmluYXJ5TmFtZSk7XG5cdFx0dHJ5IHtcblx0XHRcdGZzLmFjY2Vzc1N5bmMoYmluYXJ5UGF0aCwgZnMuY29uc3RhbnRzLlhfT0spO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDb2RleCBiaW5hcnkgbm90IGV4ZWN1dGFibGU6ICR7YmluYXJ5UGF0aH0gKCR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfSlgKTtcblx0XHR9XG5cblx0XHRsZXQgcHJveHlIYW5kbGU6IElDb2RleFByb3h5SGFuZGxlIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh1c2FnZVNvdXJjZSA9PT0gJ2NvcGlsb3QnKSB7XG5cdFx0XHRpZiAoIXRva2VuKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ29kZXggQ29waWxvdCBsYXVuY2ggcmVxdWlyZXMgYSBHaXRIdWIgdG9rZW4nKTtcblx0XHRcdH1cblx0XHRcdHByb3h5SGFuZGxlID0gYXdhaXQgdGhpcy5fY29kZXhQcm94eVNlcnZpY2Uuc3RhcnQodG9rZW4pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dHJhQXJncyA9IHBhcnNlQmluYXJ5QXJncyhwcm9jZXNzLmVudltBZ2VudEhvc3RDb2RleEFnZW50QmluYXJ5QXJnc0VudlZhcl0pO1xuXHRcdGNvbnN0IGxhdW5jaENvbmZpZyA9IGJ1aWxkQ29kZXhMYXVuY2hDb25maWcodXNhZ2VTb3VyY2UsIHByb2Nlc3MuZW52LCBwcm94eUhhbmRsZSwgZXh0cmFBcmdzKTtcblx0XHRjb25zdCBlbnYgPSBsYXVuY2hDb25maWcuZW52O1xuXHRcdGNvbnN0IHVzZXJDb2RleEhvbWUgPSBwcm9jZXNzLmVudltBZ2VudEhvc3RDb2RleEFnZW50Q29kZXhIb21lRW52VmFyXTtcblx0XHRpZiAodXNlckNvZGV4SG9tZSkge1xuXHRcdFx0ZW52LkNPREVYX0hPTUUgPSB1c2VyQ29kZXhIb21lO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFyZ3MgPSBbLi4ubGF1bmNoQ29uZmlnLmFyZ3NdO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIHNwYXduaW5nIHVzYWdlU291cmNlPSR7dXNhZ2VTb3VyY2V9IHByb3h5PSR7cHJveHlIYW5kbGUgPyAnZW5hYmxlZCcgOiAnZGlzYWJsZWQnfSAke2JpbmFyeVBhdGh9ICR7YXJncy5qb2luKCcgJyl9YCk7XG5cdFx0Y29uc3QgY2hpbGQgPSBzcGF3bihiaW5hcnlQYXRoLCBhcmdzLCB7IGVudiwgc3RkaW86IFsncGlwZScsICdwaXBlJywgJ3BpcGUnXSB9KTtcblxuXHRcdC8vIFN1cmZhY2Ugc3RkZXJyIHRvIHRoZSBsb2cgY2hhbm5lbCBcdTIwMTQgY29kZXggd3JpdGVzIHVzZWZ1bCBzdGFydHVwXG5cdFx0Ly8gZGlhZ25vc3RpY3MgdGhlcmUuIE1pcnJvciBDbGF1ZGUncyBwYXR0ZXJuLlxuXHRcdGNoaWxkLnN0ZGVyci5zZXRFbmNvZGluZygndXRmOCcpO1xuXHRcdGNoaWxkLnN0ZGVyci5vbignZGF0YScsIGNodW5rID0+IHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4IHN0ZGVycl0gJHtTdHJpbmcoY2h1bmspLnRyaW1FbmQoKX1gKSk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQgPSB0cmFuc3BvcnRGcm9tQ2hpbGRQcm9jZXNzKGNoaWxkKTtcblx0XHRjb25zdCBjbGllbnQgPSBuZXcgQ29kZXhBcHBTZXJ2ZXJDbGllbnQodHJhbnNwb3J0LCAobGV2ZWwsIG1zZykgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhDbGllbnQgJHtsZXZlbH1dICR7bXNnfWApO1xuXHRcdH0pO1xuXG5cdFx0Ly8gVGVhciBldmVyeXRoaW5nIGRvd24gaWYgdGhlIGNoaWxkIGRpZXMgb24gaXRzIG93bi5cblx0XHRjbGllbnQub25FeGl0KGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIGFwcC1zZXJ2ZXIgZXhpdGVkIGNvZGU9JHtlLmNvZGV9IHNpZ25hbD0ke2Uuc2lnbmFsfWApO1xuXHRcdFx0dGhpcy5faGFuZGxlQ29ubmVjdGlvbkxvc3QoKTtcblx0XHR9KTtcblx0XHRjbGllbnQub25UcmFuc3BvcnRFcnJvcihlcnIgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0NvZGV4XSB0cmFuc3BvcnQgZXJyb3I6ICR7ZXJyLm1lc3NhZ2V9YCk7XG5cdFx0XHR0aGlzLl9oYW5kbGVDb25uZWN0aW9uTG9zdCgpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSBoYW5kc2hha2UuIEZhaWx1cmUgaGVyZSBpcyBmYXRhbCBmb3IgdGhlIGNvbm5lY3Rpb24uXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGNsaWVudC5yZXF1ZXN0PCdpbml0aWFsaXplJz4oJ2luaXRpYWxpemUnLCB7XG5cdFx0XHRcdGNsaWVudEluZm86IENMSUVOVF9JTkZPLFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgZXhwZXJpbWVudGFsQXBpOiB0cnVlLCByZXF1ZXN0QXR0ZXN0YXRpb246IGZhbHNlLCBvcHRPdXROb3RpZmljYXRpb25NZXRob2RzOiBudWxsIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNsaWVudC5ub3RpZnk8J2luaXRpYWxpemVkJz4oJ2luaXRpYWxpemVkJywgdW5kZWZpbmVkIGFzIG5ldmVyKTtcblx0XHRcdC8vIFdpdGggYHJlcXVpcmVzX29wZW5haV9hdXRoID0gZmFsc2VgIG9uIHRoZSBwcm94eSBwcm92aWRlcixcblx0XHRcdC8vIGNvZGV4IGRvZXMgbm90IHJlcXVpcmUgYSBzZXBhcmF0ZSBsb2dpbiBzdGVwIFx1MjAxNCB0aGUgcHJveHlcblx0XHRcdC8vIG5vbmNlIGlzIHJlYWQgZnJvbSBPUEVOQUlfQVBJX0tFWSBieSB0aGUgcHJvdmlkZXIncyBlbnZfa2V5LlxuXHRcdFx0aWYgKHVzZXJDb2RleEhvbWUgJiYgcHJveHlIYW5kbGUpIHtcblx0XHRcdFx0Ly8gVXNlci1wcm92aWRlZCBDT0RFWF9IT01FIG1heSB0YXJnZXQgYSBwcm92aWRlciB0aGF0XG5cdFx0XHRcdC8vIHN0aWxsIHJlcXVpcmVzIGF1dGg7IHByZXNlcnZlIHRoZSBhcGlLZXkgbG9naW4gcGF0aC5cblx0XHRcdFx0YXdhaXQgY2xpZW50LnJlcXVlc3Q8J2FjY291bnQvbG9naW4vc3RhcnQnPignYWNjb3VudC9sb2dpbi9zdGFydCcsIHtcblx0XHRcdFx0XHR0eXBlOiAnYXBpS2V5Jyxcblx0XHRcdFx0XHRhcGlLZXk6IHByb3h5SGFuZGxlLm5vbmNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGlmICh1c2FnZVNvdXJjZSA9PT0gJ29wZW5haScpIHtcblx0XHRcdFx0dm9pZCB0aGlzLl9yZWZyZXNoQWNjb3VudChjbGllbnQpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdHByb3h5SGFuZGxlPy5kaXNwb3NlKCk7XG5cdFx0XHR0cnkgeyBjaGlsZC5raWxsKCdTSUdLSUxMJyk7IH0gY2F0Y2ggeyAvKiBhbHJlYWR5IGRlYWQgKi8gfVxuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblxuXHRcdC8vIFdpcmUgZ2xvYmFsIG5vdGlmaWNhdGlvbiBcdTIxOTIgU2Vzc2lvbkFjdGlvbiBkaXNwYXRjaC5cblx0XHR0aGlzLl9yZWdpc3Rlcklnbm9yZWROb3RpZmljYXRpb25zKGNsaWVudCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpZW50Lm9uTm90aWZpY2F0aW9uKCdhY2NvdW50L2xvZ2luL2NvbXBsZXRlZCcsICgpID0+IHsgLyogc2lnbi1pbiBpcyBtYW5hZ2VkIG91dHNpZGUgVlMgQ29kZSAqLyB9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpZW50Lm9uTm90aWZpY2F0aW9uKCdhY2NvdW50L3VwZGF0ZWQnLCAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fdXNhZ2VTb3VyY2UgPT09ICdvcGVuYWknICYmIHRoaXMuX2Nvbm5lY3Rpb24ua2luZCA9PT0gJ3JlYWR5JyAmJiB0aGlzLl9jb25uZWN0aW9uLmNsaWVudCA9PT0gY2xpZW50KSB7XG5cdFx0XHRcdHZvaWQgdGhpcy5fcmVmcmVzaEFjY291bnQoY2xpZW50KTtcblx0XHRcdFx0dGhpcy5fcXVldWVNb2RlbFJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpZW50Lm9uTm90aWZpY2F0aW9uKCd0dXJuL3N0YXJ0ZWQnLCBwYXJhbXMgPT4gdGhpcy5fZGlzcGF0Y2hCeVRocmVhZChwYXJhbXMudGhyZWFkSWQsIHMgPT4gdGhpcy5faGFuZGxlVHVyblN0YXJ0ZWROb3RpZmljYXRpb24ocywgcGFyYW1zKSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjbGllbnQub25Ob3RpZmljYXRpb24oJ2l0ZW0vc3RhcnRlZCcsIHBhcmFtcyA9PiB0aGlzLl9kaXNwYXRjaEJ5VGhyZWFkKHBhcmFtcy50aHJlYWRJZCwgcyA9PiB0aGlzLl9oYW5kbGVJdGVtU3RhcnRlZChzLCBwYXJhbXMpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWVudC5vbk5vdGlmaWNhdGlvbignaXRlbS9hZ2VudE1lc3NhZ2UvZGVsdGEnLCBwYXJhbXMgPT4gdGhpcy5fZGlzcGF0Y2hCeVRocmVhZChwYXJhbXMudGhyZWFkSWQsIHMgPT4gbWFwQWdlbnRNZXNzYWdlRGVsdGEocy5tYXBTdGF0ZSwgdGhpcy5fd2l0aEhvc3RUdXJuSWQocywgcGFyYW1zKSkpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpZW50Lm9uTm90aWZpY2F0aW9uKCdpdGVtL2NvbW1hbmRFeGVjdXRpb24vb3V0cHV0RGVsdGEnLCBwYXJhbXMgPT4gdGhpcy5fZGlzcGF0Y2hCeVRocmVhZChwYXJhbXMudGhyZWFkSWQsIHMgPT4gbWFwQ29tbWFuZEV4ZWN1dGlvbk91dHB1dERlbHRhKHMubWFwU3RhdGUsIHRoaXMuX3dpdGhIb3N0VHVybklkKHMsIHBhcmFtcykpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWVudC5vbk5vdGlmaWNhdGlvbignaXRlbS9maWxlQ2hhbmdlL3BhdGNoVXBkYXRlZCcsIHBhcmFtcyA9PiB0aGlzLl9kaXNwYXRjaEJ5VGhyZWFkKHBhcmFtcy50aHJlYWRJZCwgcyA9PiBtYXBGaWxlQ2hhbmdlUGF0Y2hVcGRhdGVkKHMubWFwU3RhdGUsIHRoaXMuX3dpdGhIb3N0VHVybklkKHMsIHBhcmFtcykpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWVudC5vbk5vdGlmaWNhdGlvbignaXRlbS9maWxlQ2hhbmdlL291dHB1dERlbHRhJywgcGFyYW1zID0+IHRoaXMuX2Rpc3BhdGNoQnlUaHJlYWQocGFyYW1zLnRocmVhZElkLCBzID0+IG1hcEZpbGVDaGFuZ2VPdXRwdXREZWx0YShzLm1hcFN0YXRlLCB0aGlzLl93aXRoSG9zdFR1cm5JZChzLCBwYXJhbXMpKSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjbGllbnQub25Ob3RpZmljYXRpb24oJ2l0ZW0vbWNwVG9vbENhbGwvcHJvZ3Jlc3MnLCBwYXJhbXMgPT4gdGhpcy5fZGlzcGF0Y2hCeVRocmVhZChwYXJhbXMudGhyZWFkSWQsIHMgPT4gbWFwTWNwVG9vbENhbGxQcm9ncmVzcyhzLm1hcFN0YXRlLCB0aGlzLl93aXRoSG9zdFR1cm5JZChzLCBwYXJhbXMpKSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjbGllbnQub25Ob3RpZmljYXRpb24oJ2l0ZW0vcmVhc29uaW5nL3N1bW1hcnlQYXJ0QWRkZWQnLCBwYXJhbXMgPT4gdGhpcy5fZGlzcGF0Y2hCeVRocmVhZChwYXJhbXMudGhyZWFkSWQsIHMgPT4gbWFwUmVhc29uaW5nU3VtbWFyeVBhcnRBZGRlZChzLm1hcFN0YXRlLCB0aGlzLl93aXRoSG9zdFR1cm5JZChzLCBwYXJhbXMpKSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjbGllbnQub25Ob3RpZmljYXRpb24oJ2l0ZW0vcmVhc29uaW5nL3N1bW1hcnlUZXh0RGVsdGEnLCBwYXJhbXMgPT4gdGhpcy5fZGlzcGF0Y2hCeVRocmVhZChwYXJhbXMudGhyZWFkSWQsIHMgPT4gbWFwUmVhc29uaW5nU3VtbWFyeVRleHREZWx0YShzLm1hcFN0YXRlLCB0aGlzLl93aXRoSG9zdFR1cm5JZChzLCBwYXJhbXMpKSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjbGllbnQub25Ob3RpZmljYXRpb24oJ2l0ZW0vcmVhc29uaW5nL3RleHREZWx0YScsIHBhcmFtcyA9PiB0aGlzLl9kaXNwYXRjaEJ5VGhyZWFkKHBhcmFtcy50aHJlYWRJZCwgcyA9PiBtYXBSZWFzb25pbmdUZXh0RGVsdGEocy5tYXBTdGF0ZSwgdGhpcy5fd2l0aEhvc3RUdXJuSWQocywgcGFyYW1zKSkpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpZW50Lm9uTm90aWZpY2F0aW9uKCd0aHJlYWQvdG9rZW5Vc2FnZS91cGRhdGVkJywgcGFyYW1zID0+IHRoaXMuX2Rpc3BhdGNoQnlUaHJlYWQocGFyYW1zLnRocmVhZElkLCBzID0+IG1hcFRva2VuVXNhZ2VVcGRhdGVkKHRoaXMuX3dpdGhIb3N0VHVybklkKHMsIHBhcmFtcykpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWVudC5vbk5vdGlmaWNhdGlvbignaXRlbS9jb21wbGV0ZWQnLCBwYXJhbXMgPT4gdGhpcy5fZGlzcGF0Y2hJdGVtQ29tcGxldGVkKHBhcmFtcykpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjbGllbnQub25Ob3RpZmljYXRpb24oJ3R1cm4vY29tcGxldGVkJywgcGFyYW1zID0+IHRoaXMuX2Rpc3BhdGNoVHVybkNvbXBsZXRlZChwYXJhbXMpKSk7XG5cdFx0Ly8gQXV0by1yZXZpZXcgKGd1YXJkaWFuKSBzdXJmYWNpbmcuIFRoZSBndWFyZGlhbiB3YXJuaW5nIGlzIHNob3duIGFzIGFcblx0XHQvLyBzeXN0ZW0gbm90aWZpY2F0aW9uOyBhIGNvbXBsZXRlZCAqZGVuaWVkKiByZXZpZXcgaXMgdHVybmVkIGludG8gYVxuXHRcdC8vIHJldHJvYWN0aXZlIFwiQXBwcm92ZSBhbnl3YXlcIiB0b29sLWNhbGwgY2FyZC4gVGhlIHJldmlldyBsaWZlY3ljbGUgaXNcblx0XHQvLyBub24tYmxvY2tpbmcgKGNvZGV4IGRvZXMgbm90IHdhaXQgb24gdXMpLCBzbyB0aGUgY29tcGxldGVkIGhhbmRsZXIgaXNcblx0XHQvLyBhc3luYyBhbmQgcmVzb2x2ZXMgaXRzIHNlc3Npb24gZGlyZWN0bHkgcmF0aGVyIHRoYW4gdmlhIF9kaXNwYXRjaEJ5VGhyZWFkLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWVudC5vbk5vdGlmaWNhdGlvbignZ3VhcmRpYW5XYXJuaW5nJywgcGFyYW1zID0+IHRoaXMuX2Rpc3BhdGNoQnlUaHJlYWQocGFyYW1zLnRocmVhZElkLCBzID0+IHRoaXMuX2hhbmRsZUd1YXJkaWFuV2FybmluZyhzLCBwYXJhbXMpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWVudC5vbk5vdGlmaWNhdGlvbignaXRlbS9hdXRvQXBwcm92YWxSZXZpZXcvY29tcGxldGVkJywgcGFyYW1zID0+IHsgdm9pZCB0aGlzLl9oYW5kbGVHdWFyZGlhblJldmlld0NvbXBsZXRlZChjbGllbnQsIHBhcmFtcyk7IH0pKTtcblxuXHRcdC8vIE1DUCBzZXJ2ZXIgbGlmZWN5Y2xlLiBDb2RleCBvd25zIE1DUCBzZXJ2ZXJzIGF0IHRoZSBwcm9jZXNzIGxldmVsXG5cdFx0Ly8gKHNoYXJlZCBhY3Jvc3MgdGhyZWFkcyk7IHN1cmZhY2UgdGhlbSB0byBBSFAgY2xpZW50cyBhcyBwZXItc2Vzc2lvblxuXHRcdC8vIGN1c3RvbWl6YXRpb25zICsgYW4gYG1jcDovL2Agc2lkZSBjaGFubmVsLiBUaGUgc3RhcnR1cCBub3RpZmljYXRpb25cblx0XHQvLyBkcml2ZXMgc3RhdGUgdHJhbnNpdGlvbnM7IGByZWFkeWAgdHJpZ2dlcnMgYSBmdWxsIGludmVudG9yeSByZWZyZXNoXG5cdFx0Ly8gc28gdGhlIGZyZXNobHktbG9hZGVkIHRvb2xzIGJlY29tZSBhdmFpbGFibGUuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpZW50Lm9uTm90aWZpY2F0aW9uKCdtY3BTZXJ2ZXIvc3RhcnR1cFN0YXR1cy91cGRhdGVkJywgcGFyYW1zID0+IHRoaXMuX2hhbmRsZU1jcFN0YXJ0dXBTdGF0dXMoY2xpZW50LCBwYXJhbXMubmFtZSwgcGFyYW1zLnN0YXR1cywgcGFyYW1zLmVycm9yKSkpO1xuXG5cdFx0Ly8gUGhhc2UgNDogY29tbWFuZC1leGVjdXRpb24gYXBwcm92YWwgcmVxdWVzdHMuIFBhcmsgb24gYVxuXHRcdC8vIHBlci1zZXNzaW9uIGRlZmVycmVkLCBlbWl0IGBDaGF0VG9vbENhbGxSZWFkeWAgaW4gdGhlXG5cdFx0Ly8gUGVuZGluZ0NvbmZpcm1hdGlvbiBzdGF0ZSwgYW5kIGFuc3dlciBjb2RleCB3aGVuIHRoZSB1c2VyXG5cdFx0Ly8gKG9yIGFjY2VwdC1mb3Itc2Vzc2lvbiBtZW1vaXphdGlvbikgZGVjaWRlcy5cblx0XHR0aGlzLl9yZWdpc3RlcihjbGllbnQub25SZXF1ZXN0PCdpdGVtL2NvbW1hbmRFeGVjdXRpb24vcmVxdWVzdEFwcHJvdmFsJz4oXG5cdFx0XHQnaXRlbS9jb21tYW5kRXhlY3V0aW9uL3JlcXVlc3RBcHByb3ZhbCcsXG5cdFx0XHRwYXJhbXMgPT4gdGhpcy5faGFuZGxlQ29tbWFuZEFwcHJvdmFsUmVxdWVzdFJwYyhwYXJhbXMpLFxuXHRcdCkpO1xuXG5cdFx0Ly8gRmlsZS1jaGFuZ2UgYW5kIHBlcm1pc3Npb24tZXNjYWxhdGlvbiBhcHByb3ZhbCByZXF1ZXN0cyAocmFpc2VkIGluXG5cdFx0Ly8gbm9uLWBkYW5nZXItZnVsbC1hY2Nlc3NgIHNhbmRib3hlcyAvIG9uIHRoZSBvbi1yZXF1ZXN0IGFwcHJvdmFsXG5cdFx0Ly8gcG9saWN5KS4gU3VyZmFjZSB0aGVtIHRocm91Z2ggdGhlIHNhbWUgcGVuZGluZy1jb25maXJtYXRpb24gZmxvdy5cblx0XHR0aGlzLl9yZWdpc3RlcihjbGllbnQub25SZXF1ZXN0PCdpdGVtL2ZpbGVDaGFuZ2UvcmVxdWVzdEFwcHJvdmFsJz4oXG5cdFx0XHQnaXRlbS9maWxlQ2hhbmdlL3JlcXVlc3RBcHByb3ZhbCcsXG5cdFx0XHRwYXJhbXMgPT4gdGhpcy5faGFuZGxlRmlsZUNoYW5nZUFwcHJvdmFsUmVxdWVzdFJwYyhwYXJhbXMpLFxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWVudC5vblJlcXVlc3Q8J2l0ZW0vcGVybWlzc2lvbnMvcmVxdWVzdEFwcHJvdmFsJz4oXG5cdFx0XHQnaXRlbS9wZXJtaXNzaW9ucy9yZXF1ZXN0QXBwcm92YWwnLFxuXHRcdFx0cGFyYW1zID0+IHRoaXMuX2hhbmRsZVBlcm1pc3Npb25zQXBwcm92YWxSZXF1ZXN0UnBjKHBhcmFtcyksXG5cdFx0KSk7XG5cblx0XHQvLyBDbGllbnQtcHJvdmlkZWQgKGR5bmFtaWMpIHRvb2wgZXhlY3V0aW9uIHJlcXVlc3RzLiBDb2RleCBhc2tzIHRoZVxuXHRcdC8vIGhvc3QgdG8gcnVuIGEgdG9vbCByZWdpc3RlcmVkIHZpYSBgdGhyZWFkL3N0YXJ0LmR5bmFtaWNUb29sc2A7IHdlXG5cdFx0Ly8gcm91dGUgdGhlIGNhbGwgdG8gdGhlIG93bmluZyB3b3JrYmVuY2ggY2xpZW50IGFuZCBhbnN3ZXIgd2l0aCBpdHNcblx0XHQvLyByZXN1bHQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpZW50Lm9uUmVxdWVzdDwnaXRlbS90b29sL2NhbGwnPihcblx0XHRcdCdpdGVtL3Rvb2wvY2FsbCcsXG5cdFx0XHRwYXJhbXMgPT4gdGhpcy5faGFuZGxlRHluYW1pY1Rvb2xDYWxsUnBjKHBhcmFtcyksXG5cdFx0KSk7XG5cblx0XHQvLyBVc2VyLWlucHV0IHJlcXVlc3RzICh0aGUgbW9kZWwncyBgYXNrX3VzZXJgKS4gU3VyZmFjZSB0aGUgcXVlc3Rpb25zXG5cdFx0Ly8gYXMgYSBjaGF0IGlucHV0IHJlcXVlc3QgYW5kIGFuc3dlciBjb2RleCB3aXRoIHRoZSB1c2VyJ3MgcmVzcG9uc2UuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpZW50Lm9uUmVxdWVzdDwnaXRlbS90b29sL3JlcXVlc3RVc2VySW5wdXQnPihcblx0XHRcdCdpdGVtL3Rvb2wvcmVxdWVzdFVzZXJJbnB1dCcsXG5cdFx0XHRwYXJhbXMgPT4gdGhpcy5faGFuZGxlVXNlcklucHV0UmVxdWVzdFJwYyhwYXJhbXMpLFxuXHRcdCkpO1xuXG5cdFx0Ly8gTUNQIGVsaWNpdGF0aW9uIHJlcXVlc3RzLiBBbiBNQ1Agc2VydmVyIChyZWxheWVkIGJ5IGNvZGV4KSBhc2tzIHRoZVxuXHRcdC8vIHVzZXIgZm9yIHN0cnVjdHVyZWQgaW5wdXQgbWlkLXRvb2wtY2FsbC4gU3VyZmFjZSBpdCB0aHJvdWdoIHRoZSBzYW1lXG5cdFx0Ly8gY2hhdC1pbnB1dCBmbG93IGFzIGBhc2tfdXNlcmAgYW5kIGFuc3dlciBjb2RleCB3aXRoIGFjY2VwdC9kZWNsaW5lL2NhbmNlbC5cblx0XHR0aGlzLl9yZWdpc3RlcihjbGllbnQub25SZXF1ZXN0PCdtY3BTZXJ2ZXIvZWxpY2l0YXRpb24vcmVxdWVzdCc+KFxuXHRcdFx0J21jcFNlcnZlci9lbGljaXRhdGlvbi9yZXF1ZXN0Jyxcblx0XHRcdHBhcmFtcyA9PiB0aGlzLl9oYW5kbGVFbGljaXRhdGlvblJlcXVlc3RScGMocGFyYW1zKSxcblx0XHQpKTtcblxuXHRcdC8vIFNlZWQgdGhlIE1DUCBzZXJ2ZXIgaW52ZW50b3J5IGZyb20gdGhlIGZyZXNobHktY29ubmVjdGVkIGFwcC1zZXJ2ZXIuXG5cdFx0Ly8gQmVzdC1lZmZvcnQgYW5kIGZpcmUtYW5kLWZvcmdldDogZmFpbHVyZXMgbGVhdmUgdGhlIGludmVudG9yeSBlbXB0eVxuXHRcdC8vIHVudGlsIHRoZSBuZXh0IGBtY3BTZXJ2ZXIvc3RhcnR1cFN0YXR1cy91cGRhdGVkYCBub3RpZmljYXRpb24uXG5cdFx0dm9pZCB0aGlzLl9yZWZyZXNoTWNwSW52ZW50b3J5KGNsaWVudCk7XG5cblx0XHRyZXR1cm4geyBjbGllbnQsIHVzYWdlU291cmNlLCBwcm94eUhhbmRsZSwgY2hpbGQgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZHMgdGhlIGBtY3Bfc2VydmVyc2Agb2JqZWN0IGZvciBhIHNlc3Npb24ncyBgdGhyZWFkL3N0YXJ0LmNvbmZpZ2A6XG5cdCAqIHRoZSB3b3JrYmVuY2gncyByb290IGBtY3BTZXJ2ZXJzYCBjb25maWcgbWVyZ2VkIHdpdGggdGhlIHNlc3Npb24nc1xuXHQgKiBlbmFibGVkIGNsaWVudC1wbHVnaW4gTUNQIHNlcnZlcnMuIFBhc3NpbmcgdGhlbSBwZXItdGhyZWFkIChyYXRoZXIgdGhhblxuXHQgKiBhcyBwcm9jZXNzLWdsb2JhbCBgLWNgIHNwYXduIG92ZXJyaWRlcykgbWVhbnMgZWFjaCBuZXcgc2Vzc2lvbiBwaWNrcyB1cFxuXHQgKiB0aGUgY3VycmVudCByb290IGNvbmZpZyB3aXRob3V0IHJlc3RhcnRpbmcgdGhlIHNoYXJlZCBhcHAtc2VydmVyLCBhbmQgaXRcblx0ICogbWVyZ2VzIHdpdGggKGxlYXZlcyBpbnRhY3QpIHRoZSB1c2VyJ3MgZ2xvYmFsIGB+Ly5jb2RleC9jb25maWcudG9tbGAuXG5cdCAqIENsaWVudC1wbHVnaW4gc2VydmVycyB3aW4gYSBuYW1lIGNvbGxpc2lvbiB3aXRoIHRoZSByb290IGNvbmZpZy4gQW55XG5cdCAqIE9BdXRoIGJlYXJlciB0b2tlbiBhY3F1aXJlZCBmb3IgYW4gYXV0aC1nYXRlZCBodHRwIHNlcnZlciAoc2VlXG5cdCAqIHtAbGluayBoYW5kbGVBdXRoZW50aWNhdGlvblRva2VufSkgaXMgaW5qZWN0ZWQgYXMgYW4gYEF1dGhvcml6YXRpb25gXG5cdCAqIGhlYWRlciBzbyBjb2RleCBjb25uZWN0cyBhdXRoZW50aWNhdGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfYnVpbGRTZXNzaW9uTWNwU2VydmVycyhzZXNzaW9uOiBJQ29kZXhTZXNzaW9uKTogUmVjb3JkPHN0cmluZywgSUNvZGV4TWNwU2VydmVyQ29uZmlnSnNvbj4ge1xuXHRcdGNvbnN0IHJvb3QgPSBjb2RleE1jcFNlcnZlcnNGcm9tQ29uZmlnKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdE1jcFNlcnZlcnNDb25maWdLZXkpKTtcblx0XHRjb25zdCBjbGllbnRQbHVnaW5zID0gY29kZXhNY3BTZXJ2ZXJzRnJvbVBsdWdpbnMoc2Vzc2lvbi5jbGllbnRDdXN0b21pemF0aW9ucy5lbmFibGVkUGx1Z2lucygpKTtcblx0XHRyZXR1cm4gaW5qZWN0Q29kZXhNY3BBdXRoVG9rZW5zKHsgLi4ucm9vdCwgLi4uY2xpZW50UGx1Z2lucyB9LCB0aGlzLl9tY3BBdXRoVG9rZW5zKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgbm9ybWFsaXplZCBVUkxzIG9mIGV2ZXJ5IGNvbmZpZ3VyZWQgaHR0cCBNQ1Agc2VydmVyIChyb290IGNvbmZpZyArXG5cdCAqIHRoZSBzZXNzaW9uJ3MgY2xpZW50IHBsdWdpbnMpLCBrZXllZCBieSBzZXJ2ZXIgbmFtZS4gVXNlZCB0byAoYSkgc3VyZmFjZVxuXHQgKiBhbiBhdXRoLXJlcXVpcmVkIHNlcnZlcidzIHJlc291cmNlIGZvciB0aGUgd29ya2JlbmNoIHNpZ24taW4gYW5kIChiKVxuXHQgKiBtYXRjaCBhIHdvcmtiZW5jaC1hY3F1aXJlZCB0b2tlbiBiYWNrIHRvIHRoZSBzZXJ2ZXIocykgaXQgdW5sb2Nrcy5cblx0ICogQ29tcHV0ZWQgZnJvbSBhIHRva2VuLWZyZWUgYnVpbGQgc28gdGhlIFVSTHMgYXJlIHRoZSBiYXJlIHNlcnZlciBVUkxzLlxuXHQgKi9cblx0cHJpdmF0ZSBfaHR0cE1jcFNlcnZlclVybHMoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IE1hcDxzdHJpbmcsIHN0cmluZz4ge1xuXHRcdGNvbnN0IHJvb3QgPSBjb2RleE1jcFNlcnZlcnNGcm9tQ29uZmlnKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdE1jcFNlcnZlcnNDb25maWdLZXkpKTtcblx0XHRjb25zdCBjbGllbnRQbHVnaW5zID0gY29kZXhNY3BTZXJ2ZXJzRnJvbVBsdWdpbnMoc2Vzc2lvbi5jbGllbnRDdXN0b21pemF0aW9ucy5lbmFibGVkUGx1Z2lucygpKTtcblx0XHRjb25zdCB1cmxzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IFtuYW1lLCBzZXJ2ZXJdIG9mIE9iamVjdC5lbnRyaWVzKHsgLi4ucm9vdCwgLi4uY2xpZW50UGx1Z2lucyB9KSkge1xuXHRcdFx0Y29uc3Qgbm9ybWFsaXplZCA9IHNlcnZlci51cmwgIT09IHVuZGVmaW5lZCA/IG5vcm1hbGl6ZUNvZGV4TWNwUmVzb3VyY2VVcmwoc2VydmVyLnVybCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAobm9ybWFsaXplZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHVybHMuc2V0KG5hbWUsIG5vcm1hbGl6ZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdXJscztcblx0fVxuXG5cdC8qKiBUaGUgYmFyZSAodW4tbm9ybWFsaXplZCkgVVJMIG9mIGEgY29uZmlndXJlZCBodHRwIE1DUCBzZXJ2ZXIgYnkgbmFtZSwgYWNyb3NzIGFsbCBzZXNzaW9ucy4gKi9cblx0cHJpdmF0ZSBfbWNwU2VydmVyVXJsRm9yTmFtZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJvb3QgPSBjb2RleE1jcFNlcnZlcnNGcm9tQ29uZmlnKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdE1jcFNlcnZlcnNDb25maWdLZXkpKTtcblx0XHRpZiAocm9vdFtuYW1lXT8udXJsICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiByb290W25hbWVdLnVybDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRjb25zdCBmcm9tUGx1Z2lucyA9IGNvZGV4TWNwU2VydmVyc0Zyb21QbHVnaW5zKHNlc3Npb24uY2xpZW50Q3VzdG9taXphdGlvbnMuZW5hYmxlZFBsdWdpbnMoKSk7XG5cdFx0XHRpZiAoZnJvbVBsdWdpbnNbbmFtZV0/LnVybCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBmcm9tUGx1Z2luc1tuYW1lXS51cmw7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogTWFwIHRoZSBzZXNzaW9uJ3MgdG9vbHMgaW50byBjb2RleCBgZHluYW1pY1Rvb2xzYCBzcGVjczogdGhlIGFnZW50IGhvc3Qnc1xuXHQgKiBzZXJ2ZXIgdG9vbHMgKGV4ZWN1dGVkIGluLXByb2Nlc3MpIHBsdXMgdGhlIHdvcmtiZW5jaCBjbGllbnQncyB0b29sc1xuXHQgKiAocm91bmQtdHJpcHBlZCB0byB0aGUgY2xpZW50KS4gQm90aCBhcmUgcmVnaXN0ZXJlZCB3aXRoIGNvZGV4IHRoZSBzYW1lXG5cdCAqIHdheSBcdTIwMTQgYXQgYHRocmVhZC9zdGFydGAgXHUyMDE0IGFuZCBkaXNwYXRjaGVkIGFwYXJ0IGluXG5cdCAqIHtAbGluayBfaGFuZGxlRHluYW1pY1Rvb2xDYWxsUnBjfSBieSBuYW1lLlxuXHQgKi9cblx0cHJpdmF0ZSBfYnVpbGREeW5hbWljVG9vbHMoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IER5bmFtaWNUb29sU3BlY1tdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXJ2ZXJUb29scyA9IHRoaXMuX3NlcnZlclRvb2xIb3N0Py5kZWZpbml0aW9ucyA/PyBbXTtcblx0XHRjb25zdCBjbGllbnRUb29scyA9IHNlc3Npb24uY2xpZW50VG9vbFNldC5tZXJnZWQoKTtcblx0XHQvLyBTZXJ2ZXIgdG9vbHMgZmlyc3Q7IGEgc2VydmVyIHRvb2wgbmFtZSBzaGFkb3dzIGEgY29sbGlkaW5nIGNsaWVudCB0b29sXG5cdFx0Ly8gKHRoZSBhZ2VudCBob3N0IG93bnMgdGhvc2UgbmFtZXMpIGFuZCBtYXRjaGVzIHRoZSByb3V0aW5nIG9yZGVyIGJlbG93LlxuXHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBhbGw6IFRvb2xEZWZpbml0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHQgb2YgWy4uLnNlcnZlclRvb2xzLCAuLi5jbGllbnRUb29sc10pIHtcblx0XHRcdGlmIChzZWVuLmhhcyh0Lm5hbWUpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0c2Vlbi5hZGQodC5uYW1lKTtcblx0XHRcdGFsbC5wdXNoKHQpO1xuXHRcdH1cblx0XHRpZiAoYWxsLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIGFsbC5tYXAodCA9PiAoe1xuXHRcdFx0dHlwZTogJ2Z1bmN0aW9uJyBhcyBjb25zdCxcblx0XHRcdG5hbWU6IHQubmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiB0LmRlc2NyaXB0aW9uID8/ICcnLFxuXHRcdFx0aW5wdXRTY2hlbWE6ICh0LmlucHV0U2NoZW1hID8/IHsgdHlwZTogJ29iamVjdCcgfSkgYXMgSnNvblZhbHVlLFxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUR5bmFtaWNUb29sQ2FsbFJwYyhwYXJhbXM6IER5bmFtaWNUb29sQ2FsbFBhcmFtcyk6IFByb21pc2U8U2VydmVyUmVxdWVzdEhhbmRsZXJSZXN1bHQ8RHluYW1pY1Rvb2xDYWxsUmVzcG9uc2U+PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gdGhpcy5fc2Vzc2lvbklkQnlUaHJlYWRJZC5nZXQocGFyYW1zLnRocmVhZElkKTtcblx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbklkID8gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4geyByZXN1bHQ6IHRoaXMuX3Rvb2xGYWlsdXJlKGBDb2RleCB0b29sIGNhbGwgZm9yIHVua25vd24gdGhyZWFkICR7cGFyYW1zLnRocmVhZElkfWApIH07XG5cdFx0fVxuXHRcdC8vIFNlcnZlciB0b29scyBhcmUgZXhlY3V0ZWQgaW4tcHJvY2VzcyBhZ2FpbnN0IHRoZSBzZXNzaW9uJ3Mgb3duIHN0YXRlXG5cdFx0Ly8gKG5vIHdvcmtiZW5jaCByb3VuZC10cmlwKS4gV2UgcmVnaXN0ZXIgdGhlbSB1bmRlciB0aGVpciBiYXJlIG5hbWUsIHNvXG5cdFx0Ly8gY29kZXggY2FsbHMgYmFjayB3aXRoIGBuYW1lc3BhY2UgPT09IG51bGxgLiBEaXNwYXRjaCB0aGVtIGhlcmUgYmVmb3JlXG5cdFx0Ly8gdGhlIGNsaWVudC10b29sIHBhdGggYmVsb3cuXG5cdFx0Y29uc3QgaG9zdCA9IHRoaXMuX3NlcnZlclRvb2xIb3N0O1xuXHRcdGlmIChob3N0ICYmIHBhcmFtcy5uYW1lc3BhY2UgPT09IG51bGwgJiYgaG9zdC50b29sTmFtZXMuaW5jbHVkZXMocGFyYW1zLnRvb2wpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gaG9zdC5leGVjdXRlVG9vbChzZXNzaW9uLnNlc3Npb25VcmkudG9TdHJpbmcoKSwgcGFyYW1zLnRvb2wsIHBhcmFtcy5hcmd1bWVudHMpO1xuXHRcdFx0XHRyZXR1cm4geyByZXN1bHQ6IHsgY29udGVudEl0ZW1zOiBbeyB0eXBlOiAnaW5wdXRUZXh0JywgdGV4dDogYXdhaXQgdGV4dCB9XSwgc3VjY2VzczogdHJ1ZSB9IH07XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0cmV0dXJuIHsgcmVzdWx0OiB0aGlzLl90b29sRmFpbHVyZShgU2VydmVyIHRvb2wgJHtwYXJhbXMudG9vbH0gZmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKSB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBgaXRlbS9zdGFydGVkYCBmb3IgdGhlIGBkeW5hbWljVG9vbENhbGxgIChpZCA9PT0gY2FsbElkKSBpcyBkZWxpdmVyZWRcblx0XHQvLyBiZWZvcmUgdGhpcyByZXF1ZXN0IGFuZCBzZWVkcyB0aGUgaG9zdCB0b29sQ2FsbElkICsgQ2hhdFRvb2xDYWxsUmVhZHlcblx0XHQvLyB0aGUgb3duaW5nIGNsaWVudCByZWFjdHMgdG8uIExvb2sgaXQgdXAgc28gdGhlIGNsaWVudCdzIGNvbXBsZXRpb25cblx0XHQvLyAoa2V5ZWQgYnkgdGhhdCB0b29sQ2FsbElkKSByZXNvbHZlcyB0aGlzIHJlcXVlc3QuXG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IHNlc3Npb24ubWFwU3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KHBhcmFtcy5jYWxsSWQpPy50b29sQ2FsbElkO1xuXHRcdGlmICh0b29sQ2FsbElkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB7IHJlc3VsdDogdGhpcy5fdG9vbEZhaWx1cmUoYE5vIHBlbmRpbmcgY2xpZW50IHRvb2wgY2FsbCBmb3IgJHtwYXJhbXMudG9vbH0gKGNhbGxJZCAke3BhcmFtcy5jYWxsSWR9KWApIH07XG5cdFx0fVxuXHRcdGlmIChzZXNzaW9uLmNsaWVudFRvb2xTZXQuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHsgcmVzdWx0OiB0aGlzLl90b29sRmFpbHVyZShgTm8gY2xpZW50IGF2YWlsYWJsZSB0byBydW4gJHtwYXJhbXMudG9vbH1gKSB9O1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Ly8gYHJlZ2lzdGVyYCBjb25zdW1lcyBhbnkgcmVzdWx0IHRoZSBjbGllbnQgYWxyZWFkeSBkZWxpdmVyZWQgKHRoZVxuXHRcdFx0Ly8gZGlzcGxheSBwYXRoIGVtaXRzIENoYXRUb29sQ2FsbFJlYWR5IGJlZm9yZSB0aGlzIHJlcXVlc3QsIHNvIHRoZVxuXHRcdFx0Ly8gY29tcGxldGlvbiBjYW4gcmFjZSBhaGVhZCBcdTIwMTQgUGVuZGluZ1JlcXVlc3RSZWdpc3RyeSBidWZmZXJzIGl0KS5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlc3Npb24ucGVuZGluZ0NsaWVudFRvb2xDYWxscy5yZWdpc3Rlcih0b29sQ2FsbElkKTtcblx0XHRcdHJldHVybiB7IHJlc3VsdDogZHluYW1pY1Rvb2xSZXNwb25zZUZyb21SZXN1bHQocmVzdWx0KSB9O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKGVyciBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKSB7XG5cdFx0XHRcdHJldHVybiB7IHJlc3VsdDogdGhpcy5fdG9vbEZhaWx1cmUoYENsaWVudCB0b29sICR7cGFyYW1zLnRvb2x9IHdhcyBjYW5jZWxsZWRgKSB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgcmVzdWx0OiB0aGlzLl90b29sRmFpbHVyZShgQ2xpZW50IHRvb2wgJHtwYXJhbXMudG9vbH0gZmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKSB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Rvb2xGYWlsdXJlKG1lc3NhZ2U6IHN0cmluZyk6IER5bmFtaWNUb29sQ2FsbFJlc3BvbnNlIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gZHluYW1pYyB0b29sIGNhbGwgZmFpbGVkOiAke21lc3NhZ2V9YCk7XG5cdFx0cmV0dXJuIHsgY29udGVudEl0ZW1zOiBbeyB0eXBlOiAnaW5wdXRUZXh0JywgdGV4dDogbWVzc2FnZSB9XSwgc3VjY2VzczogZmFsc2UgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVVzZXJJbnB1dFJlcXVlc3RScGMocGFyYW1zOiBUb29sUmVxdWVzdFVzZXJJbnB1dFBhcmFtcyk6IFByb21pc2U8U2VydmVyUmVxdWVzdEhhbmRsZXJSZXN1bHQ8VG9vbFJlcXVlc3RVc2VySW5wdXRSZXNwb25zZT4+IHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLl9zZXNzaW9uSWRCeVRocmVhZElkLmdldChwYXJhbXMudGhyZWFkSWQpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uSWQgPyB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybiB7IHJlc3VsdDogZW1wdHlVc2VySW5wdXRSZXNwb25zZShwYXJhbXMucXVlc3Rpb25zKSB9O1xuXHRcdH1cblx0XHRpZiAoIXNlc3Npb24uY3VycmVudFR1cm5JZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIHVzZXIgaW5wdXQgcmVxdWVzdCB3aXRob3V0IGFuIGFjdGl2ZSB0dXJuIGZvciB0aHJlYWRJZD0ke3BhcmFtcy50aHJlYWRJZH07IHJldHVybmluZyBlbXB0eSBhbnN3ZXJzYCk7XG5cdFx0XHRyZXR1cm4geyByZXN1bHQ6IGVtcHR5VXNlcklucHV0UmVzcG9uc2UocGFyYW1zLnF1ZXN0aW9ucykgfTtcblx0XHR9XG5cdFx0Ly8gTUNQIHRvb2wtY2FsbCBhcHByb3ZhbHMgYXJyaXZlIGFzIGEgc2luZ2xlIGByZXF1ZXN0X3VzZXJfaW5wdXRgXG5cdFx0Ly8gcXVlc3Rpb24gaWQnZCBgbWNwX3Rvb2xfY2FsbF9hcHByb3ZhbF88Y2FsbElkPmAuIFJlbmRlciB0aGVtIG9uIHRoZVxuXHRcdC8vIG5vcm1hbCB0b29sLWFwcHJvdmFsIGNhcmQgKG1pcnJvcmluZyBzaGVsbC9maWxlIGFwcHJvdmFscykgaW5zdGVhZCBvZlxuXHRcdC8vIGEgY2hhdC1pbnB1dCBxdWVzdGlvbiwgd2hlbiB0aGUgb3JpZ2luYXRpbmcgYG1jcFRvb2xDYWxsYCBpdGVtJ3MgaG9zdFxuXHRcdC8vIHRvb2wgY2FsbCBpcyBrbm93bi4gRmFsbHMgdGhyb3VnaCB0byB0aGUgY2hhdC1pbnB1dCBwYXRoIG90aGVyd2lzZS5cblx0XHRjb25zdCBhcHByb3ZhbFF1ZXN0aW9uID0gcGFyYW1zLnF1ZXN0aW9ucy5sZW5ndGggPT09IDEgJiYgcGFyYW1zLnF1ZXN0aW9uc1swXS5pZC5zdGFydHNXaXRoKE1DUF9UT09MX0FQUFJPVkFMX1FVRVNUSU9OX0lEX1BSRUZJWClcblx0XHRcdD8gcGFyYW1zLnF1ZXN0aW9uc1swXVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0aWYgKGFwcHJvdmFsUXVlc3Rpb24pIHtcblx0XHRcdGNvbnN0IGNhbGxJZCA9IGFwcHJvdmFsUXVlc3Rpb24uaWQuc2xpY2UoTUNQX1RPT0xfQVBQUk9WQUxfUVVFU1RJT05fSURfUFJFRklYLmxlbmd0aCk7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHNlc3Npb24ubWFwU3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KGNhbGxJZCk7XG5cdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2hhbmRsZU1jcFRvb2xBcHByb3ZhbFZpYUNhcmQoc2Vzc2lvbiwgYXBwcm92YWxRdWVzdGlvbiwgZW50cnkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCByZXF1ZXN0SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gYnVpbGRVc2VySW5wdXRSZXF1ZXN0KHJlcXVlc3RJZCwgcGFyYW1zLnF1ZXN0aW9ucyk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlc3Npb24ucGVuZGluZ1VzZXJJbnB1dHMucmVnaXN0ZXJBbmRGaXJlKHJlcXVlc3RJZCwgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9maXJlKHNlc3Npb24uc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dFJlcXVlc3RlZCwgcmVxdWVzdCB9KTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHsgcmVzdWx0OiB1c2VySW5wdXRSZXNwb25zZUZyb21BbnN3ZXJzKHBhcmFtcy5xdWVzdGlvbnMsIHJlc3VsdC5yZXNwb25zZSwgcmVzdWx0LmFuc3dlcnMpIH07XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBTZXNzaW9uIGRpc3Bvc2VkIC8gY29ubmVjdGlvbiBsb3N0IHdoaWxlIGF3YWl0aW5nOyBhbnN3ZXIgY29kZXhcblx0XHRcdC8vIHdpdGggZW1wdHkgYW5zd2VycyBzbyB0aGUgdHVybiB1bndpbmRzIGluc3RlYWQgb2YgaGFuZ2luZy5cblx0XHRcdHJldHVybiB7IHJlc3VsdDogZW1wdHlVc2VySW5wdXRSZXNwb25zZShwYXJhbXMucXVlc3Rpb25zKSB9O1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXJzIGFuIE1DUCB0b29sLWNhbGwgYXBwcm92YWwgb24gdGhlIG5vcm1hbCB0b29sLWFwcHJvdmFsIGNhcmRcblx0ICogKGEgcGVuZGluZy1jb25maXJtYXRpb24gYENoYXRUb29sQ2FsbFJlYWR5YCBvbiB0aGUgb3JpZ2luYXRpbmdcblx0ICogYG1jcFRvb2xDYWxsYCBob3N0IHRvb2wgY2FsbCkgcmF0aGVyIHRoYW4gYXMgYSBjaGF0LWlucHV0IHF1ZXN0aW9uLlxuXHQgKiBUaGUgdXNlcidzIEFsbG93L0RlbnkgZGVjaXNpb24gaXMgbWFwcGVkIGJhY2sgdG8gdGhlIGFuc3dlciBzdHJpbmdcblx0ICogY29kZXggZXhwZWN0cyAoYEFsbG93YCAvIGBfX2NvZGV4X21jcF9kZWNsaW5lX19gKS4gTWlycm9ycyB0aGUgc2hlbGxcblx0ICogY29tbWFuZCBhcHByb3ZhbCBmbG93ICh7QGxpbmsgQ29kZXhBZ2VudC5faGFuZGxlQ29tbWFuZEFwcHJvdmFsUmVxdWVzdH0pLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlTWNwVG9vbEFwcHJvdmFsVmlhQ2FyZChcblx0XHRzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLFxuXHRcdHF1ZXN0aW9uOiBUb29sUmVxdWVzdFVzZXJJbnB1dFF1ZXN0aW9uLFxuXHRcdGVudHJ5OiB7IHJlYWRvbmx5IHRvb2xDYWxsSWQ6IHN0cmluZzsgcmVhZG9ubHkgdHVybklkOiBzdHJpbmcgfSxcblx0KTogUHJvbWlzZTx7IHJlYWRvbmx5IHJlc3VsdDogVG9vbFJlcXVlc3RVc2VySW5wdXRSZXNwb25zZSB9PiB7XG5cdFx0Y29uc3QgY29uZmlybWF0aW9uVGl0bGUgPSBxdWVzdGlvbi5xdWVzdGlvbiB8fCBxdWVzdGlvbi5oZWFkZXIgfHwgJ1J1biBNQ1AgdG9vbCc7XG5cdFx0bGV0IGRlY2lzaW9uOiBDb21tYW5kRXhlY3V0aW9uQXBwcm92YWxEZWNpc2lvbjtcblx0XHR0cnkge1xuXHRcdFx0ZGVjaXNpb24gPSBhd2FpdCBzZXNzaW9uLnBlbmRpbmdDb21tYW5kQXBwcm92YWxzLnJlZ2lzdGVyQW5kRmlyZShlbnRyeS50b29sQ2FsbElkLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvbi5zZXNzaW9uVXJpLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0XHR0dXJuSWQ6IGVudHJ5LnR1cm5JZCxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiBlbnRyeS50b29sQ2FsbElkLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBjb25maXJtYXRpb25UaXRsZSxcblx0XHRcdFx0XHR0b29sSW5wdXQ6IGNvbmZpcm1hdGlvblRpdGxlLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gU2Vzc2lvbiBkaXNwb3NlZCAvIGNvbm5lY3Rpb24gbG9zdCB3aGlsZSBhd2FpdGluZzsgZGVjbGluZSBzbyB0aGVcblx0XHRcdC8vIGNvZGV4LXNpZGUgTUNQIHRvb2wgY2FsbCB1bndpbmRzIGluc3RlYWQgb2YgaGFuZ2luZy5cblx0XHRcdGRlY2lzaW9uID0gJ2RlY2xpbmUnO1xuXHRcdH1cblx0XHRjb25zdCBhbGxvdyA9IGRlY2lzaW9uID09PSAnYWNjZXB0JyB8fCBkZWNpc2lvbiA9PT0gJ2FjY2VwdEZvclNlc3Npb24nO1xuXHRcdGNvbnN0IGFuc3dlciA9IGFsbG93ID8gTUNQX1RPT0xfQVBQUk9WQUxfQU5TV0VSX0FMTE9XIDogTUNQX1RPT0xfQVBQUk9WQUxfQU5TV0VSX0RFQ0xJTkU7XG5cdFx0cmV0dXJuIHsgcmVzdWx0OiB7IGFuc3dlcnM6IHsgW3F1ZXN0aW9uLmlkXTogeyBhbnN3ZXJzOiBbYW5zd2VyXSB9IH0gfSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlRWxpY2l0YXRpb25SZXF1ZXN0UnBjKHBhcmFtczogTWNwU2VydmVyRWxpY2l0YXRpb25SZXF1ZXN0UGFyYW1zKTogUHJvbWlzZTxTZXJ2ZXJSZXF1ZXN0SGFuZGxlclJlc3VsdDxNY3BTZXJ2ZXJFbGljaXRhdGlvblJlcXVlc3RSZXNwb25zZT4+IHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLl9zZXNzaW9uSWRCeVRocmVhZElkLmdldChwYXJhbXMudGhyZWFkSWQpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uSWQgPyB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gZWxpY2l0YXRpb24gcmVxdWVzdCB0aHJlYWRJZD0ke3BhcmFtcy50aHJlYWRJZH0gbW9kZT0ke3BhcmFtcy5tb2RlfSBzZXJ2ZXI9JHtwYXJhbXMuc2VydmVyTmFtZX0gc2Vzc2lvbj0ke3Nlc3Npb24gPyBzZXNzaW9uLnNlc3Npb25JZCA6ICdOT05FJ31gKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSBlbGljaXRhdGlvbiByZXF1ZXN0IGZvciB1bmtub3duIHRocmVhZElkPSR7cGFyYW1zLnRocmVhZElkfTsgZGVjbGluaW5nYCk7XG5cdFx0XHRyZXR1cm4geyByZXN1bHQ6IGRlY2xpbmVkRWxpY2l0YXRpb25SZXNwb25zZSgpIH07XG5cdFx0fVxuXHRcdGlmICghc2Vzc2lvbi5jdXJyZW50VHVybklkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gZWxpY2l0YXRpb24gcmVxdWVzdCB3aXRob3V0IGFuIGFjdGl2ZSB0dXJuIGZvciB0aHJlYWRJZD0ke3BhcmFtcy50aHJlYWRJZH07IGRlY2xpbmluZ2ApO1xuXHRcdFx0cmV0dXJuIHsgcmVzdWx0OiBkZWNsaW5lZEVsaWNpdGF0aW9uUmVzcG9uc2UoKSB9O1xuXHRcdH1cblx0XHRjb25zdCByZXF1ZXN0SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gYnVpbGRFbGljaXRhdGlvblJlcXVlc3QocmVxdWVzdElkLCBwYXJhbXMpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXNzaW9uLnBlbmRpbmdVc2VySW5wdXRzLnJlZ2lzdGVyQW5kRmlyZShyZXF1ZXN0SWQsICgpID0+IHtcblx0XHRcdFx0dGhpcy5fZmlyZShzZXNzaW9uLnNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0SW5wdXRSZXF1ZXN0ZWQsIHJlcXVlc3QgfSk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSBlbGljaXRhdGlvbiByZXNvbHZlZCByZXF1ZXN0SWQ9JHtyZXF1ZXN0SWR9IHJlc3BvbnNlPSR7cmVzdWx0LnJlc3BvbnNlfWApO1xuXHRcdFx0cmV0dXJuIHsgcmVzdWx0OiBlbGljaXRhdGlvblJlc3BvbnNlRnJvbUFuc3dlcnMocGFyYW1zLCByZXN1bHQucmVzcG9uc2UsIHJlc3VsdC5hbnN3ZXJzKSB9O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gU2Vzc2lvbiBkaXNwb3NlZCAvIGNvbm5lY3Rpb24gbG9zdCB3aGlsZSBhd2FpdGluZzsgY2FuY2VsIHRoZVxuXHRcdFx0Ly8gZWxpY2l0YXRpb24gc28gdGhlIE1DUCBzZXJ2ZXIncyByZXF1ZXN0IHVud2luZHMuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gZWxpY2l0YXRpb24gY2FuY2VsbGVkIHJlcXVlc3RJZD0ke3JlcXVlc3RJZH06ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0cmV0dXJuIHsgcmVzdWx0OiBjYW5jZWxsZWRFbGljaXRhdGlvblJlc3BvbnNlKCkgfTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9ob3N0VHVybklkKHNlc3Npb246IElDb2RleFNlc3Npb24sIGFwcFR1cm5JZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gc2Vzc2lvbi5ob3N0VHVybklkQnlBcHBUdXJuSWQuZ2V0KGFwcFR1cm5JZCkgPz8gYXBwVHVybklkO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2l0aEhvc3RUdXJuSWQ8VCBleHRlbmRzIHsgcmVhZG9ubHkgdHVybklkOiBzdHJpbmcgfT4oc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgcGFyYW1zOiBUKTogVCB7XG5cdFx0Y29uc3QgdHVybklkID0gdGhpcy5faG9zdFR1cm5JZChzZXNzaW9uLCBwYXJhbXMudHVybklkKTtcblx0XHRyZXR1cm4gdHVybklkID09PSBwYXJhbXMudHVybklkID8gcGFyYW1zIDogeyAuLi5wYXJhbXMsIHR1cm5JZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfd2l0aEhvc3RUdXJuPFQgZXh0ZW5kcyB7IHJlYWRvbmx5IHR1cm46IHsgcmVhZG9ubHkgaWQ6IHN0cmluZyB9IH0+KHNlc3Npb246IElDb2RleFNlc3Npb24sIHBhcmFtczogVCk6IFQge1xuXHRcdGNvbnN0IGFwcFR1cm5JZCA9IHBhcmFtcy50dXJuLmlkO1xuXHRcdGNvbnN0IGhvc3RUdXJuSWQgPSBzZXNzaW9uLmN1cnJlbnRUdXJuSWQgPz8gdGhpcy5faG9zdFR1cm5JZChzZXNzaW9uLCBhcHBUdXJuSWQpO1xuXHRcdHNlc3Npb24uaG9zdFR1cm5JZEJ5QXBwVHVybklkLnNldChhcHBUdXJuSWQsIGhvc3RUdXJuSWQpO1xuXHRcdHNlc3Npb24uY3VycmVudEFwcFR1cm5JZCA9IGFwcFR1cm5JZDtcblx0XHRyZXR1cm4gaG9zdFR1cm5JZCA9PT0gYXBwVHVybklkID8gcGFyYW1zIDogeyAuLi5wYXJhbXMsIHR1cm46IHsgLi4ucGFyYW1zLnR1cm4sIGlkOiBob3N0VHVybklkIH0gfTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVR1cm5TdGFydGVkTm90aWZpY2F0aW9uKHNlc3Npb246IElDb2RleFNlc3Npb24sIHBhcmFtczogVHVyblN0YXJ0ZWROb3RpZmljYXRpb24pOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRcdC8vIFRoZSB3b3JrYmVuY2ggYWxyZWFkeSBkaXNwYXRjaGVkIHRoZSBjYW5vbmljYWwgdHVybiBzdGFydCBiZWZvcmUgc2VuZE1lc3NhZ2UuXG5cdFx0Ly8gQ29kZXgncyBldmVudCBvbmx5IGVzdGFibGlzaGVzIGFwcC1zZXJ2ZXIgdHVybiBpZCBjb3JyZWxhdGlvbiBmb3IgbGF0ZXIgaXRlbXMuXG5cdFx0bWFwVHVyblN0YXJ0ZWQoc2Vzc2lvbi5tYXBTdGF0ZSwgdGhpcy5fd2l0aEhvc3RUdXJuKHNlc3Npb24sIHBhcmFtcyksIHNlc3Npb24ubGFzdFByb21wdFRleHQpO1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVR1cm5Db21wbGV0ZWROb3RpZmljYXRpb24oc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgcGFyYW1zOiBUdXJuQ29tcGxldGVkTm90aWZpY2F0aW9uKTogKFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uKVtdIHtcblx0XHRjb25zdCBhcHBUdXJuSWQgPSBwYXJhbXMudHVybi5pZDtcblx0XHRjb25zdCBob3N0VHVybklkID0gdGhpcy5faG9zdFR1cm5JZChzZXNzaW9uLCBhcHBUdXJuSWQpO1xuXHRcdGNvbnN0IG91dCA9IG1hcFR1cm5Db21wbGV0ZWQoc2Vzc2lvbi5tYXBTdGF0ZSwgdGhpcy5fd2l0aEhvc3RUdXJuKHNlc3Npb24sIHBhcmFtcyksIHRoaXMuX2NsZWFyVHVyblN0b3BXYXRjaChzZXNzaW9uKSk7XG5cdFx0Ly8gUmVtZW1iZXIgd2hpY2ggY29kZXggKGFwcC1zZXJ2ZXIpIHR1cm4gZWFjaCB3b3JrYmVuY2ggdHVybiBtYXBzIHRvIHNvXG5cdFx0Ly8gdHJ1bmNhdGVTZXNzaW9uIGNhbiB0cmFuc2xhdGUgYSBob3N0IHR1cm4gaWQgdG8gYSB0aHJlYWQgcm9sbGJhY2sgZXZlblxuXHRcdC8vIGFmdGVyIHRoZSBsaXZlIGNvcnJlbGF0aW9uIGJlbG93IGlzIGNsZWFyZWQuXG5cdFx0c2Vzc2lvbi5jb2RleFR1cm5JZEJ5SG9zdFR1cm5JZC5zZXQoaG9zdFR1cm5JZCwgYXBwVHVybklkKTtcblx0XHQvLyBDb2RleCByZXBvcnRzIGFwcC1zZXJ2ZXIgdHVybiBpZHMsIHdoaWxlIHRoZSB3b3JrYmVuY2ggb3ducyBob3N0IHR1cm4gaWRzLlxuXHRcdC8vIENsZWFyIHRoZSBjb3JyZWxhdGlvbiBhZnRlciBjb21wbGV0aW9uIHNvIGxhdGVyIHR1cm5zIGNhbm5vdCByZXVzZSBzdGFsZSBpZHMuXG5cdFx0aWYgKHNlc3Npb24uY3VycmVudEFwcFR1cm5JZCA9PT0gYXBwVHVybklkIHx8IHNlc3Npb24uY3VycmVudFR1cm5JZCA9PT0gaG9zdFR1cm5JZCkge1xuXHRcdFx0c2Vzc2lvbi5jdXJyZW50VHVybklkID0gdW5kZWZpbmVkO1xuXHRcdFx0c2Vzc2lvbi5jdXJyZW50QXBwVHVybklkID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRzZXNzaW9uLmhvc3RUdXJuSWRCeUFwcFR1cm5JZC5kZWxldGUoYXBwVHVybklkKTtcblx0XHQvLyBBbnkgc3RlZXJpbmcgc3RpbGwgYnVmZmVyZWQgd2FzIG5ldmVyIGVjaG9lZCBhcyBhIGB1c2VyTWVzc2FnZWBcblx0XHQvLyBpdGVtOyBjbGVhciB0aGUgcGVuZGluZyBidWJibGUgbm93IHRoYXQgdGhlIHR1cm4gaXMgb3Zlci5cblx0XHR0aGlzLl9kcmFpblBlbmRpbmdTdGVlcmluZyhzZXNzaW9uKTtcblx0XHQvLyBVbndpbmQgYW55IHN0aWxsLXBlbmRpbmcgXCJBcHByb3ZlIGFueXdheVwiIGd1YXJkaWFuIGNhcmRzLiBjb2RleCBkb2VzIG5vdFxuXHRcdC8vIGJsb2NrIG9uIHRoZW0sIHNvIHRoZSByZWR1Y2VyIGNhbmNlbHMgdGhlIGNhcmQgd2hlbiB0aGUgdHVybiBlbmRzOyBoZXJlXG5cdFx0Ly8gd2UgcmVzb2x2ZSB0aGUgcGFya2VkIGRlZmVycmVkIChgY2FuY2VsYCkgc28gdGhlIHN1c3BlbmRlZFxuXHRcdC8vIHtAbGluayBfaGFuZGxlR3VhcmRpYW5SZXZpZXdDb21wbGV0ZWR9IGZyYW1lIHVud2luZHMgaW5zdGVhZCBvZiBsZWFraW5nXG5cdFx0Ly8gdW50aWwgc2Vzc2lvbiBkaXNwb3NlLiBUaGUgZHVyYWJsZSBkZW5pYWwgbm90aWZpY2F0aW9uIGFscmVhZHkgZW1pdHRlZFxuXHRcdC8vIHJlbWFpbnMgaW4gdGhlIHRyYW5zY3JpcHQuXG5cdFx0aWYgKHNlc3Npb24ucGVuZGluZ0d1YXJkaWFuUmV2aWV3Q2FyZHMuc2l6ZSA+IDApIHtcblx0XHRcdGZvciAoY29uc3QgZ3VhcmRpYW5Ub29sQ2FsbElkIG9mIFsuLi5zZXNzaW9uLnBlbmRpbmdHdWFyZGlhblJldmlld0NhcmRzXSkge1xuXHRcdFx0XHRzZXNzaW9uLnBlbmRpbmdDb21tYW5kQXBwcm92YWxzLnJlc3BvbmQoZ3VhcmRpYW5Ub29sQ2FsbElkLCAnY2FuY2VsJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBvdXQ7XG5cdH1cblxuXHQvKipcblx0ICogRGlzcGF0Y2ggYSBjb2RleCBgaXRlbS9zdGFydGVkYCBub3RpZmljYXRpb24uIGB1c2VyTWVzc2FnZWAgaXRlbXMgYXJlXG5cdCAqIGludGVyY2VwdGVkIGhlcmUgKHJhdGhlciB0aGFuIGluIHRoZSBwdXJlIG1hcHBlcikgYmVjYXVzZSBzdGVlcmluZ1xuXHQgKiBwcm9tb3Rpb24gbmVlZHMgdGhlIGFnZW50J3MgcGVyLXNlc3Npb24gdHVybi1jb3JyZWxhdGlvbiBzdGF0ZTsgYWxsXG5cdCAqIG90aGVyIGl0ZW0ga2luZHMgZGVmZXIgdG8ge0BsaW5rIG1hcEl0ZW1TdGFydGVkfS5cblx0ICovXG5cdHByaXZhdGUgX2hhbmRsZUl0ZW1TdGFydGVkKHNlc3Npb246IElDb2RleFNlc3Npb24sIHBhcmFtczogSXRlbVN0YXJ0ZWROb3RpZmljYXRpb24pOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRcdGlmIChwYXJhbXMuaXRlbS50eXBlID09PSAndXNlck1lc3NhZ2UnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlU3RlZXJlZFVzZXJNZXNzYWdlKHNlc3Npb24sIHBhcmFtcy5pdGVtLmNvbnRlbnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gbWFwSXRlbVN0YXJ0ZWQoc2Vzc2lvbi5tYXBTdGF0ZSwgdGhpcy5fd2l0aEhvc3RUdXJuSWQoc2Vzc2lvbiwgcGFyYW1zKSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29kZXggZWNob2VzIGV2ZXJ5IHVzZXIgbWVzc2FnZSBcdTIwMTQgdGhlIHR1cm4gb3BlbmVyIChhbHJlYWR5IHNob3duIGJ5XG5cdCAqIHRoZSB3b3JrYmVuY2ggYmVmb3JlIGBzZW5kTWVzc2FnZWApIGFuZCBhbnkgc3RlZXJlZCBpbnB1dCBcdTIwMTQgYXMgYVxuXHQgKiBgdXNlck1lc3NhZ2VgIGl0ZW0uIE9ubHkgc3RlZXJlZCBpbnB1dCBpcyBidWZmZXJlZCBpblxuXHQgKiB7QGxpbmsgSUNvZGV4U2Vzc2lvbi5wZW5kaW5nU3RlZXJpbmdGbGlwc307IGEgYnVmZmVyZWQgbWF0Y2ggaXNcblx0ICogcHJvbW90ZWQgaW50byBpdHMgb3duIHZpc2libGUgdHVybiBhbmQgZXZlcnl0aGluZyBlbHNlIGlzIGRyb3BwZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9oYW5kbGVTdGVlcmVkVXNlck1lc3NhZ2Uoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgY29udGVudDogcmVhZG9ubHkgVXNlcklucHV0W10pOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRcdGNvbnN0IHRleHQgPSBleHRyYWN0VXNlcklucHV0VGV4dChjb250ZW50KTtcblx0XHRjb25zdCBzdGVlcmluZyA9IHRoaXMuX3Rha2VNYXRjaGluZ1BlbmRpbmdTdGVlcmluZyhzZXNzaW9uLCB0ZXh0KTtcblx0XHRpZiAoIXN0ZWVyaW5nKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9iZWdpblN0ZWVyaW5nVHVybihzZXNzaW9uLCBzdGVlcmluZyk7XG5cdH1cblxuXHQvKipcblx0ICogUG9wIHRoZSBidWZmZXJlZCBzdGVlcmluZyBtZXNzYWdlIHdob3NlIHRleHQgbWF0Y2hlcyB0aGUgZWNob2VkXG5cdCAqIGB1c2VyTWVzc2FnZWAgY29udGVudC4gTWF0Y2hpbmcgYnkgY29udGVudCAobm90IEZJRk8pIGtlZXBzIHRoZVxuXHQgKiBtYXBwaW5nIGNvcnJlY3Qgd2hlbiBzZXZlcmFsIHN0ZWVyaW5nIG1lc3NhZ2VzIHdpdGggZGlmZmVyZW50IHRleHRzXG5cdCAqIGFyZSBpbiBmbGlnaHQuXG5cdCAqL1xuXHRwcml2YXRlIF90YWtlTWF0Y2hpbmdQZW5kaW5nU3RlZXJpbmcoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgdGV4dDogc3RyaW5nKTogUGVuZGluZ01lc3NhZ2UgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgW2lkLCBtc2ddIG9mIHNlc3Npb24ucGVuZGluZ1N0ZWVyaW5nRmxpcHMpIHtcblx0XHRcdGlmIChtc2cubWVzc2FnZS50ZXh0ID09PSB0ZXh0KSB7XG5cdFx0XHRcdHNlc3Npb24ucGVuZGluZ1N0ZWVyaW5nRmxpcHMuZGVsZXRlKGlkKTtcblx0XHRcdFx0cmV0dXJuIG1zZztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcm9tb3RlIGEgc3RlZXJlZCBtZXNzYWdlIGludG8gaXRzIG93biBwcm90b2NvbCB0dXJuOiBjb21wbGV0ZSB0aGVcblx0ICogaW4tZmxpZ2h0IHR1cm4gKHNvIGl0cyByZXNwb25zZSBwYXJ0cyBzZXR0bGUgaW50byBoaXN0b3J5KSBhbmQgb3BlbiBhXG5cdCAqIGZyZXNoIHR1cm4gd2hvc2UgdXNlciBtZXNzYWdlIGlzIHRoZSBzdGVlcmluZyBjb250ZW50LiBUaGVcblx0ICogYHF1ZXVlZE1lc3NhZ2VJZGAgY2xlYXJzIHRoZSBjb3JyZXNwb25kaW5nIHBlbmRpbmcgc3RlZXJpbmcgYnViYmxlLlxuXHQgKiBTdWJzZXF1ZW50IGNvZGV4IGl0ZW1zIGZvciB0aGUgc2FtZSBhcHAtc2VydmVyIHR1cm4gYXJlIHJlLW1hcHBlZCB0b1xuXHQgKiB0aGUgbmV3IGhvc3QgdHVybiBpZCBzbyB0aGUgc3RlZXJpbmcgcmVzcG9uc2UgbGFuZHMgdGhlcmUuXG5cdCAqL1xuXHRwcml2YXRlIF9iZWdpblN0ZWVyaW5nVHVybihzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLCBzdGVlcmluZzogUGVuZGluZ01lc3NhZ2UpOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRcdGNvbnN0IGFjdGlvbnM6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSA9IFtdO1xuXHRcdGNvbnN0IGFwcFR1cm5JZCA9IHNlc3Npb24uY3VycmVudEFwcFR1cm5JZDtcblx0XHRjb25zdCBwcmV2aW91c0hvc3RUdXJuSWQgPSBzZXNzaW9uLmN1cnJlbnRUdXJuSWQgPz8gKGFwcFR1cm5JZCA/IHRoaXMuX2hvc3RUdXJuSWQoc2Vzc2lvbiwgYXBwVHVybklkKSA6IHVuZGVmaW5lZCk7XG5cdFx0aWYgKHByZXZpb3VzSG9zdFR1cm5JZCkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6IHByZXZpb3VzSG9zdFR1cm5JZCwgZHVyYXRpb246IHRoaXMuX2NsZWFyVHVyblN0b3BXYXRjaChzZXNzaW9uKSB9KTtcblx0XHR9XG5cdFx0Y29uc3QgbmV3SG9zdFR1cm5JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGlmIChhcHBUdXJuSWQpIHtcblx0XHRcdHNlc3Npb24uaG9zdFR1cm5JZEJ5QXBwVHVybklkLnNldChhcHBUdXJuSWQsIG5ld0hvc3RUdXJuSWQpO1xuXHRcdH1cblx0XHRzZXNzaW9uLmN1cnJlbnRUdXJuSWQgPSBuZXdIb3N0VHVybklkO1xuXHRcdHJlc2V0Q29kZXhUdXJuTWFwU3RhdGUoc2Vzc2lvbi5tYXBTdGF0ZSk7XG5cdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiBuZXdIb3N0VHVybklkLFxuXHRcdFx0c3RhcnRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRtZXNzYWdlOiBzdGVlcmluZy5tZXNzYWdlLFxuXHRcdFx0cXVldWVkTWVzc2FnZUlkOiBzdGVlcmluZy5pZCxcblx0XHR9KTtcblx0XHR0aGlzLl9zdGFydFR1cm5TdG9wV2F0Y2goc2Vzc2lvbik7XG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cblxuXHQvKipcblx0ICogQ2xlYXIgYW55IHN0ZWVyaW5nIG1lc3NhZ2VzIHN0aWxsIGJ1ZmZlcmVkIChuZXZlciBlY2hvZWQgYnkgY29kZXgpXG5cdCAqIGFuZCBmaXJlIGBzdGVlcmluZ19jb25zdW1lZGAgZm9yIGVhY2ggc28gdGhlIGNoYXQgVUkgcmVtb3ZlcyB0aGVcblx0ICogbGluZ2VyaW5nIHBlbmRpbmcgYnViYmxlLiBDYWxsZWQgb24gdHVybiBjb21wbGV0aW9uLCBhYm9ydCwgZGlzcG9zZSxcblx0ICogYW5kIGNvbm5lY3Rpb24gbG9zcy5cblx0ICovXG5cdHByaXZhdGUgX2RyYWluUGVuZGluZ1N0ZWVyaW5nKHNlc3Npb246IElDb2RleFNlc3Npb24pOiB2b2lkIHtcblx0XHRpZiAoc2Vzc2lvbi5wZW5kaW5nU3RlZXJpbmdGbGlwcy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGlkcyA9IFsuLi5zZXNzaW9uLnBlbmRpbmdTdGVlcmluZ0ZsaXBzLmtleXMoKV07XG5cdFx0c2Vzc2lvbi5wZW5kaW5nU3RlZXJpbmdGbGlwcy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG5cdFx0XHR0aGlzLl9maXJlU3RlZXJpbmdDb25zdW1lZChzZXNzaW9uLCBpZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmlyZVN0ZWVyaW5nQ29uc3VtZWQoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUoeyBraW5kOiAnc3RlZXJpbmdfY29uc3VtZWQnLCBjaGF0OiBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uLnNlc3Npb25VcmkpKSwgaWQgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3Rlcklnbm9yZWROb3RpZmljYXRpb25zKGNsaWVudDogSUNvZGV4QXBwU2VydmVyQ2xpZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgaWdub3JlZCA9IFtcblx0XHRcdCd0aHJlYWQvc3RhcnRlZCcsIC8vIHRocmVhZC9zdGFydCByZXNwb25zZSBpcyBhdXRob3JpdGF0aXZlIGZvciBzZXNzaW9uIG1hdGVyaWFsaXphdGlvbi5cblx0XHRcdCd0aHJlYWQvc3RhdHVzL2NoYW5nZWQnLCAvLyBDb2RleCB0aHJlYWQgc3RhdHVzIGlzIG5vdCBzdXJmYWNlZCBpbiBBZ2VudCBIb3N0IHN0YXRlIHlldC5cblx0XHRcdCd0aHJlYWQvc2V0dGluZ3MvdXBkYXRlZCcsIC8vIFZTIENvZGUgb3ducyBzZXNzaW9uIGNvbmZpZzsgQ29kZXggc2V0dGluZ3MgZWNob2VzIGFyZSBub3QgY29uc3VtZWQgeWV0LlxuXHRcdFx0J3RocmVhZC9nb2FsL3VwZGF0ZWQnLCAvLyBHb2FscyBhcmUgbm90IHN1cmZhY2VkIGluIHRoZSBBZ2VudCBIb3N0IFVJIHlldC5cblx0XHRcdCd0aHJlYWQvZ29hbC9jbGVhcmVkJywgLy8gR29hbHMgYXJlIG5vdCBzdXJmYWNlZCBpbiB0aGUgQWdlbnQgSG9zdCBVSSB5ZXQuXG5cdFx0XHQnYWNjb3VudC9yYXRlTGltaXRzL3VwZGF0ZWQnLCAvLyBSYXRlLWxpbWl0IFVJL3N0YXRlIGlzIG5vdCBpbXBsZW1lbnRlZCB5ZXQuXG5cdFx0XHQncmVtb3RlQ29udHJvbC9zdGF0dXMvY2hhbmdlZCcsIC8vIFJlbW90ZS1jb250cm9sIHN0YXRlIGlzIG5vdCBwYXJ0IG9mIHRoZSBWUyBDb2RlIGludGVncmF0aW9uLlxuXHRcdFx0J3NlcnZlclJlcXVlc3QvcmVzb2x2ZWQnLCAvLyBXZSByZXNvbHZlIHJlcXVlc3RzIHRocm91Z2ggSlNPTi1SUEMgcmVzcG9uc2VzLCBzbyB0aGlzIGVjaG8gaXMgaW5mb3JtYXRpb25hbC5cblx0XHRcdCdpdGVtL2F1dG9BcHByb3ZhbFJldmlldy9zdGFydGVkJywgLy8gSW5mb3JtYXRpb25hbDsgdGhlIGNvbXBsZXRlZCBub3RpZmljYXRpb24gZHJpdmVzIHRoZSBkZW5pZWQtYWN0aW9uIGNhcmQuXG5cdFx0XSBhcyBjb25zdDtcblx0XHRmb3IgKGNvbnN0IG1ldGhvZCBvZiBpZ25vcmVkKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihjbGllbnQub25Ob3RpZmljYXRpb24obWV0aG9kLCAoKSA9PiB7IC8qIGludGVudGlvbmFsbHkgaWdub3JlZCAqLyB9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaEFjY291bnQoY2xpZW50OiBJQ29kZXhBcHBTZXJ2ZXJDbGllbnQsIHB1Ymxpc2ggPSB0cnVlKTogUHJvbWlzZTxJQ29kZXhBY2NvdW50U3RhdGU+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjbGllbnQucmVxdWVzdDwnYWNjb3VudC9yZWFkJywgR2V0QWNjb3VudFJlc3BvbnNlPignYWNjb3VudC9yZWFkJywgeyByZWZyZXNoVG9rZW46IGZhbHNlIH0pO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBjb2RleEFjY291bnRTdGF0ZUZyb21SZXNwb25zZShyZXNwb25zZSk7XG5cdFx0XHR0aGlzLl9zZXRPcGVuQUlBY2NvdW50U3RhdGUoc3RhdGUsIHB1Ymxpc2gpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIGFjY291bnQvcmVhZCBhY2NvdW50VHlwZT0ke3Jlc3BvbnNlLmFjY291bnQ/LnR5cGUgPz8gJ25vbmUnfSByZXF1aXJlc09wZW5haUF1dGg9JHtyZXNwb25zZS5yZXF1aXJlc09wZW5haUF1dGh9JHtzdGF0ZS5wbGFuVHlwZSA/IGAgcGxhblR5cGU9JHtzdGF0ZS5wbGFuVHlwZX1gIDogJyd9YCk7XG5cdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIGFjY291bnQvcmVhZCBmYWlsZWQ6ICR7bWVzc2FnZX1gKTtcblx0XHRcdGNvbnN0IHN0YXRlOiBJQ29kZXhBY2NvdW50U3RhdGUgPSB7IHVzYWdlU291cmNlOiAnb3BlbmFpJywgc3RhdHVzOiAnZXJyb3InLCBlcnJvcjogbWVzc2FnZSB9O1xuXHRcdFx0dGhpcy5fc2V0T3BlbkFJQWNjb3VudFN0YXRlKHN0YXRlLCBwdWJsaXNoKTtcblx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWFkUHJvdmlkZXJDb25maWd1cmF0aW9uKCk6IFByb21pc2U8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgdGhpcy5fZW5zdXJlQ29ubmVjdGlvbigpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY29ubmVjdGlvbi5jbGllbnQucmVxdWVzdDwnY29uZmlnL3JlYWQnLCBDb25maWdSZWFkUmVzcG9uc2U+KCdjb25maWcvcmVhZCcsIHsgaW5jbHVkZUxheWVyczogdHJ1ZSB9KTtcblx0XHRjb25zdCB1c2VyTGF5ZXIgPSByZXNwb25zZS5sYXllcnM/LmZpbmQobGF5ZXIgPT4gbGF5ZXIubmFtZS50eXBlID09PSAndXNlcicgJiYgbGF5ZXIubmFtZS5wcm9maWxlID09PSBudWxsKSA/PyByZXNwb25zZS5sYXllcnM/LmZpbmQobGF5ZXIgPT4gbGF5ZXIubmFtZS50eXBlID09PSAndXNlcicpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IHVzZXJMYXllcj8uY29uZmlnICYmIHR5cGVvZiB1c2VyTGF5ZXIuY29uZmlnID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheSh1c2VyTGF5ZXIuY29uZmlnKSA/IHVzZXJMYXllci5jb25maWcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gOiB7fTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0J2NvZGV4LnBlcnNvbmFsaXR5JzogdGhpcy5fcmVhZENvbmZpZ3VyYXRpb25WYWx1ZShjb25maWcsICdwZXJzb25hbGl0eScpID8/ICdkZWZhdWx0Jyxcblx0XHRcdCdjb2RleC5hdXRvUmV2aWV3UG9saWN5JzogdGhpcy5fcmVhZENvbmZpZ3VyYXRpb25WYWx1ZShjb25maWcsICdhdXRvX3Jldmlldy5wb2xpY3knKSA/PyAnJyxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfd3JpdGVQcm92aWRlckNvbmZpZ3VyYXRpb24oa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHRoaXMuX2Vuc3VyZUNvbm5lY3Rpb24oKTtcblx0XHRhd2FpdCBjb25uZWN0aW9uLmNsaWVudC5yZXF1ZXN0PCdjb25maWcvYmF0Y2hXcml0ZScsIENvbmZpZ1dyaXRlUmVzcG9uc2U+KCdjb25maWcvYmF0Y2hXcml0ZScsIHtcblx0XHRcdGVkaXRzOiBrZXkgPT09ICdjb2RleC5hdXRvUmV2aWV3UG9saWN5JyAmJiB2YWx1ZSA9PT0gJydcblx0XHRcdFx0PyBbeyBrZXlQYXRoOiAnYXV0b19yZXZpZXcnLCB2YWx1ZTogbnVsbCwgbWVyZ2VTdHJhdGVneTogJ3JlcGxhY2UnIH1dXG5cdFx0XHRcdDoga2V5ID09PSAnY29kZXgucGVyc29uYWxpdHknICYmIHZhbHVlID09PSAnZGVmYXVsdCdcblx0XHRcdFx0XHQ/IFt7IGtleVBhdGg6ICdwZXJzb25hbGl0eScsIHZhbHVlOiBudWxsLCBtZXJnZVN0cmF0ZWd5OiAncmVwbGFjZScgfV1cblx0XHRcdFx0XHQ6IFt7IGtleVBhdGg6IGtleSA9PT0gJ2NvZGV4LnBlcnNvbmFsaXR5JyA/ICdwZXJzb25hbGl0eScgOiAnYXV0b19yZXZpZXcucG9saWN5JywgdmFsdWU6IHZhbHVlIGFzIHN0cmluZywgbWVyZ2VTdHJhdGVneTogJ3JlcGxhY2UnIH1dLFxuXHRcdFx0ZXhwZWN0ZWRWZXJzaW9uOiBudWxsLFxuXHRcdFx0cmVsb2FkVXNlckNvbmZpZzogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hQcm92aWRlckNvbmZpZ3VyYXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVyQ29uZmlndXJhdGlvblJlZnJlc2ggPz89IChhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9wcm92aWRlckNvbmZpZ3VyYXRpb25WYWx1ZXMgPSBhd2FpdCB0aGlzLl9yZWFkUHJvdmlkZXJDb25maWd1cmF0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVyQ29uZmlndXJhdGlvblJlYWR5ID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh0aGlzLl9wcm92aWRlckNvbmZpZ3VyYXRpb25WYWx1ZXMpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIEZhaWxlZCB0byByZWFkIGNvbmZpZy50b21sOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVyQ29uZmlndXJhdGlvblJlZnJlc2ggPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkoKTtcblx0fVxuXG5cdHByaXZhdGUgX3F1ZXVlUHJvdmlkZXJDb25maWd1cmF0aW9uV3JpdGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9wcm92aWRlckNvbmZpZ3VyYXRpb25SZWFkeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB2YWx1ZXMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290Q29uZmlnVmFsdWVzPy4oKSA/PyB7fTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBbJ2NvZGV4LnBlcnNvbmFsaXR5JywgJ2NvZGV4LmF1dG9SZXZpZXdQb2xpY3knXSkge1xuXHRcdFx0aWYgKHZhbHVlc1trZXldID09PSB0aGlzLl9wcm92aWRlckNvbmZpZ3VyYXRpb25WYWx1ZXNba2V5XSkgeyBjb250aW51ZTsgfVxuXHRcdFx0Y29uc3QgdmFsdWUgPSB2YWx1ZXNba2V5XTtcblx0XHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7IGNvbnRpbnVlOyB9XG5cdFx0XHR0aGlzLl9wcm92aWRlckNvbmZpZ3VyYXRpb25Xcml0ZSA9IHRoaXMuX3Byb3ZpZGVyQ29uZmlndXJhdGlvbldyaXRlLnRoZW4oYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fcHJvdmlkZXJDb25maWd1cmF0aW9uVmFsdWVzW2tleV0gPT09IHZhbHVlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3dyaXRlUHJvdmlkZXJDb25maWd1cmF0aW9uKGtleSwgdmFsdWUpO1xuXHRcdFx0XHR0aGlzLl9wcm92aWRlckNvbmZpZ3VyYXRpb25WYWx1ZXNba2V5XSA9IHZhbHVlO1xuXHRcdFx0fSkuY2F0Y2goZXJyb3IgPT4gdGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0NvZGV4XSBGYWlsZWQgdG8gdXBkYXRlIGNvbmZpZy50b21sOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVhZENvbmZpZ3VyYXRpb25WYWx1ZShjb25maWc6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBrZXlQYXRoOiBzdHJpbmcpOiB1bmtub3duIHtcblx0XHRsZXQgdmFsdWU6IHVua25vd24gPSBjb25maWc7XG5cdFx0Zm9yIChjb25zdCBzZWdtZW50IG9mIGtleVBhdGguc3BsaXQoJy4nKSkge1xuXHRcdFx0aWYgKCF2YWx1ZSB8fCBBcnJheS5pc0FycmF5KHZhbHVlKSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR2YWx1ZSA9ICh2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbc2VnbWVudF07XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3BhdGNoQnlUaHJlYWQodGhyZWFkSWQ6IHN0cmluZywgbWFwRm46IChzOiBJQ29kZXhTZXNzaW9uKSA9PiBSZXR1cm5UeXBlPHR5cGVvZiBtYXBUdXJuU3RhcnRlZD4pOiB2b2lkIHtcblx0XHQvLyBDb2xsYWItYWdlbnQgKHN1YmFnZW50KSBjaGlsZCB0aHJlYWRzIGVtaXQgdGhlaXIgb3duIGZ1bGwgZXZlbnRcblx0XHQvLyBzdHJlYW07IHJvdXRlIHRoZW0gdG8gdGhlIGlzb2xhdGVkIHN1YmFnZW50IHNlc3Npb24gYW5kIGZpcmUgZWFjaFxuXHRcdC8vIGFjdGlvbiB0YWdnZWQgd2l0aCB0aGUgcGFyZW50IGBzcGF3bkFnZW50YCB0b29sIGNhbGwgc28gdGhlIHNoYXJlZFxuXHRcdC8vIG9yY2hlc3RyYXRvciBsYW5kcyB0aGVtIGluIHRoZSByZWFkLW9ubHkgcGVlciBjaGF0LlxuXHRcdGNvbnN0IHN1YmFnZW50ID0gdGhpcy5fc3ViYWdlbnRzQnlUaHJlYWRJZC5nZXQodGhyZWFkSWQpO1xuXHRcdGlmIChzdWJhZ2VudCkge1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IG1hcEZuKHN1YmFnZW50LnNlc3Npb24pO1xuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0XHR0aGlzLl9maXJlU3ViYWdlbnQoc3ViYWdlbnQsIGFjdGlvbik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHRoaXMuX3Nlc3Npb25JZEJ5VGhyZWFkSWQuZ2V0KHRocmVhZElkKTtcblx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbklkID8gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHQvLyBVc3VhbGx5IGFuIHVuY2xhaW1lZCBwcmV3YXJtOyBpZ25vcmUuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29kZXhdIElnbm9yaW5nIG5vdGlmaWNhdGlvbiBmb3IgdW50cmFja2VkIHRocmVhZElkPSR7dGhyZWFkSWR9OyBsaWtlbHkgdW5jbGFpbWVkIHByZXdhcm1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcEZuKHNlc3Npb24pO1xuXHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvbi5zZXNzaW9uVXJpLCBhY3Rpb24pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBgaXRlbS9jb21wbGV0ZWRgIGRpc3BhdGNoLiBJbiBhZGRpdGlvbiB0byB0aGUgbm9ybWFsIHBlci10aHJlYWQgbWFwcGluZyxcblx0ICogYSBwYXJlbnQgc2Vzc2lvbidzIGNvbXBsZXRlZCBgc3Bhd25BZ2VudGAgY29sbGFiIHRvb2wgY2FsbCBub3cgY2Fycmllc1xuXHQgKiB0aGUgY2hpbGQgYHJlY2VpdmVyVGhyZWFkSWRzYCwgc28gd2UgcmVnaXN0ZXIgZWFjaCBzcGF3bmVkIHN1YmFnZW50IGFuZFxuXHQgKiBlbWl0IGEgYHN1YmFnZW50X3N0YXJ0ZWRgIHNpZ25hbCAoYmVmb3JlIG1hcHBpbmcgdGhlIGNvbXBsZXRpb24sIHNvIHRoZVxuXHQgKiBzaGFyZWQgb3JjaGVzdHJhdG9yIGhhcyBhdHRhY2hlZCB0aGUgc3ViYWdlbnQtY2hhdCBibG9jayB0byB0aGUgcGFyZW50XG5cdCAqIHRvb2wgY2FsbCBieSB0aGUgdGltZSBpdCBjb21wbGV0ZXMpLlxuXHQgKi9cblx0cHJpdmF0ZSBfZGlzcGF0Y2hJdGVtQ29tcGxldGVkKHBhcmFtczogSXRlbUNvbXBsZXRlZE5vdGlmaWNhdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IHN1YmFnZW50ID0gdGhpcy5fc3ViYWdlbnRzQnlUaHJlYWRJZC5nZXQocGFyYW1zLnRocmVhZElkKTtcblx0XHRpZiAoc3ViYWdlbnQpIHtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBtYXBJdGVtQ29tcGxldGVkKHN1YmFnZW50LnNlc3Npb24ubWFwU3RhdGUsIHRoaXMuX3dpdGhIb3N0VHVybklkKHN1YmFnZW50LnNlc3Npb24sIHBhcmFtcykpO1xuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0XHR0aGlzLl9maXJlU3ViYWdlbnQoc3ViYWdlbnQsIGFjdGlvbik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHRoaXMuX3Nlc3Npb25JZEJ5VGhyZWFkSWQuZ2V0KHBhcmFtcy50aHJlYWRJZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25JZCA/IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpIDogdW5kZWZpbmVkO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvZGV4XSBJZ25vcmluZyBpdGVtL2NvbXBsZXRlZCBmb3IgdW50cmFja2VkIHRocmVhZElkPSR7cGFyYW1zLnRocmVhZElkfTsgbGlrZWx5IHVuY2xhaW1lZCBwcmV3YXJtYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIERldGVjdCBzdWJhZ2VudCBzcGF3bnMgQkVGT1JFIG1hcHBpbmcgdGhlIGNvbXBsZXRpb246IHRoZSBob3N0XG5cdFx0Ly8gdG9vbENhbGxJZCBsaXZlcyBpbiB0aGUgcGFyZW50J3MgaXRlbVRvVG9vbENhbGwgbWFwICh3aGljaCB0aGUgbWFwcGVyXG5cdFx0Ly8gbWF5IGNsZWFyKSwgYW5kIGZpcmluZyBgc3ViYWdlbnRfc3RhcnRlZGAgZmlyc3QgbGV0cyB0aGUgb3JjaGVzdHJhdG9yXG5cdFx0Ly8gYXR0YWNoIHRoZSByZWFkLW9ubHktY2hhdCBibG9jayB0byB0aGUgc3RpbGwtb3BlbiBwYXJlbnQgdG9vbCBjYWxsLlxuXHRcdHRoaXMuX21heWJlUmVnaXN0ZXJTdWJhZ2VudHMoc2Vzc2lvbiwgcGFyYW1zKTtcblx0XHRjb25zdCBhY3Rpb25zID0gbWFwSXRlbUNvbXBsZXRlZChzZXNzaW9uLm1hcFN0YXRlLCB0aGlzLl93aXRoSG9zdFR1cm5JZChzZXNzaW9uLCBwYXJhbXMpKTtcblx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG5cdFx0XHR0aGlzLl9maXJlKHNlc3Npb24uc2Vzc2lvblVyaSwgYWN0aW9uKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogYHR1cm4vY29tcGxldGVkYCBkaXNwYXRjaC4gRm9yIGEgc3ViYWdlbnQgY2hpbGQgdGhyZWFkLCByb3V0ZSB0aGUgdHVybidzXG5cdCAqIGZsdXNoL29ycGhhbiBhY3Rpb25zIHRvIHRoZSBwZWVyIGNoYXQgYnV0IHN1cHByZXNzIGl0cyBgQ2hhdFR1cm5Db21wbGV0ZWBcblx0ICogXHUyMDE0IHRoZSBjaGlsZCBjaGF0J3MgdHVybiBpcyBjbG9zZWQgY2xlYW5seSAod2l0aG91dCB0aGUgcGFyZW50J3Ncblx0ICogY2hlY2twb2ludC9jaGFuZ2VzZXQvdGl0bGUgc2lkZSBlZmZlY3RzKSBieSB0aGUgYHN1YmFnZW50X2NvbXBsZXRlZGBcblx0ICogc2lnbmFsLCB3aGljaCBhbHNvIHRlYXJzIGRvd24gdGhlIGNoaWxkLXRocmVhZCB0cmFja2luZy5cblx0ICovXG5cdHByaXZhdGUgX2Rpc3BhdGNoVHVybkNvbXBsZXRlZChwYXJhbXM6IFR1cm5Db21wbGV0ZWROb3RpZmljYXRpb24pOiB2b2lkIHtcblx0XHRjb25zdCBzdWJhZ2VudCA9IHRoaXMuX3N1YmFnZW50c0J5VGhyZWFkSWQuZ2V0KHBhcmFtcy50aHJlYWRJZCk7XG5cdFx0aWYgKHN1YmFnZW50KSB7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gdGhpcy5faGFuZGxlVHVybkNvbXBsZXRlZE5vdGlmaWNhdGlvbihzdWJhZ2VudC5zZXNzaW9uLCBwYXJhbXMpO1xuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2ZpcmVTdWJhZ2VudChzdWJhZ2VudCwgYWN0aW9uKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3N1YmFnZW50c0J5VGhyZWFkSWQuZGVsZXRlKHBhcmFtcy50aHJlYWRJZCk7XG5cdFx0XHRzdWJhZ2VudC5zZXNzaW9uLnBlbmRpbmdDb21tYW5kQXBwcm92YWxzLmRlbnlBbGwoJ2RlY2xpbmUnKTtcblx0XHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUoe1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnRfY29tcGxldGVkJyxcblx0XHRcdFx0Y2hhdDogVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc3ViYWdlbnQuc2Vzc2lvbi5zZXNzaW9uVXJpKSksXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IHN1YmFnZW50LnRvb2xDYWxsSWQsXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX2FwcGx5UGVuZGluZ1VzYWdlU291cmNlSWZJZGxlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Rpc3BhdGNoQnlUaHJlYWQocGFyYW1zLnRocmVhZElkLCBzID0+IHRoaXMuX2hhbmRsZVR1cm5Db21wbGV0ZWROb3RpZmljYXRpb24ocywgcGFyYW1zKSk7XG5cdFx0dGhpcy5fYXBwbHlQZW5kaW5nVXNhZ2VTb3VyY2VJZklkbGUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGVuIGEgcGFyZW50IHNlc3Npb24ncyBgc3Bhd25BZ2VudGAgY29sbGFiIHRvb2wgY2FsbCBjb21wbGV0ZXMgaXRcblx0ICogY2FycmllcyB0aGUgY2hpbGQgdGhyZWFkIGlkKHMpIGluIGByZWNlaXZlclRocmVhZElkc2AuIFJlZ2lzdGVyIGFuXG5cdCAqIGlzb2xhdGVkIHN1YmFnZW50IHNlc3Npb24gZm9yIGVhY2ggbmV3IGNoaWxkIHRocmVhZCBhbmQgZW1pdCBhXG5cdCAqIGBzdWJhZ2VudF9zdGFydGVkYCBzaWduYWwgc28gdGhlIHNoYXJlZCBvcmNoZXN0cmF0b3Igb3BlbnMgdGhlIHJlYWQtb25seVxuXHQgKiBwZWVyIGNoYXQgYW5kIGF0dGFjaGVzIGl0cyBkaXNjb3ZlcnkgYmxvY2sgdG8gdGhlIHBhcmVudCB0b29sIGNhbGwuXG5cdCAqL1xuXHRwcml2YXRlIF9tYXliZVJlZ2lzdGVyU3ViYWdlbnRzKHNlc3Npb246IElDb2RleFNlc3Npb24sIHBhcmFtczogSXRlbUNvbXBsZXRlZE5vdGlmaWNhdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGl0ZW0gPSBwYXJhbXMuaXRlbTtcblx0XHRpZiAoaXRlbS50eXBlICE9PSAnY29sbGFiQWdlbnRUb29sQ2FsbCcgfHwgaXRlbS50b29sICE9PSAnc3Bhd25BZ2VudCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZW50cnkgPSBzZXNzaW9uLm1hcFN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldChpdGVtLmlkKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHBhcmVudENoYXQgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uLnNlc3Npb25VcmkpKTtcblx0XHRjb25zdCBtb2RlbCA9IGl0ZW0ubW9kZWwgfHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHRhc2tEZXNjcmlwdGlvbiA9IGl0ZW0ucHJvbXB0IHx8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IGNoaWxkVGhyZWFkSWQgb2YgaXRlbS5yZWNlaXZlclRocmVhZElkcykge1xuXHRcdFx0aWYgKHRoaXMuX3N1YmFnZW50c0J5VGhyZWFkSWQuaGFzKGNoaWxkVGhyZWFkSWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3ViU2Vzc2lvbiA9IHRoaXMuX2NyZWF0ZVN1YmFnZW50U2Vzc2lvbihzZXNzaW9uLCBjaGlsZFRocmVhZElkKTtcblx0XHRcdHRoaXMuX3N1YmFnZW50c0J5VGhyZWFkSWQuc2V0KGNoaWxkVGhyZWFkSWQsIHtcblx0XHRcdFx0cGFyZW50U2Vzc2lvbklkOiBzZXNzaW9uLnNlc3Npb25JZCxcblx0XHRcdFx0dG9vbENhbGxJZDogZW50cnkudG9vbENhbGxJZCxcblx0XHRcdFx0c2Vzc2lvbjogc3ViU2Vzc2lvbixcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZmlyZSh7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJyxcblx0XHRcdFx0Y2hhdDogcGFyZW50Q2hhdCxcblx0XHRcdFx0dG9vbENhbGxJZDogZW50cnkudG9vbENhbGxJZCxcblx0XHRcdFx0YWdlbnROYW1lOiBtb2RlbCA/PyAnY29kZXgnLFxuXHRcdFx0XHRhZ2VudERpc3BsYXlOYW1lOiBtb2RlbCA/PyAnU3ViYWdlbnQnLFxuXHRcdFx0XHR0YXNrRGVzY3JpcHRpb24sXG5cdFx0XHRcdC8vIENvZGV4IHN1cmZhY2VzIHRoZSBmdWxsIGRlbGVnYXRlZCBpbnN0cnVjdGlvbiBhcyBgaXRlbS5wcm9tcHRgLlxuXHRcdFx0XHR0YXNrUHJvbXB0OiB0eXBlb2YgaXRlbS5wcm9tcHQgPT09ICdzdHJpbmcnICYmIGl0ZW0ucHJvbXB0Lmxlbmd0aCA+IDAgPyBpdGVtLnByb21wdCA6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvZGV4OiR7c2Vzc2lvbi5zZXNzaW9uSWR9XSBzdWJhZ2VudCBzcGF3bmVkIHRocmVhZD0ke2NoaWxkVGhyZWFkSWR9IHRvb2xDYWxsPSR7ZW50cnkudG9vbENhbGxJZH0gbW9kZWw9JHttb2RlbCA/PyAnKGRlZmF1bHQpJ31gKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGQgYW4gaXNvbGF0ZWQge0BsaW5rIElDb2RleFNlc3Npb259IHVzZWQgdG8gcnVuIHRoZSBzaGFyZWQgZXZlbnRcblx0ICogbWFwcGVycyBmb3IgYSBzdWJhZ2VudCBjaGlsZCB0aHJlYWQuIEl0IHNoYXJlcyB0aGUgcGFyZW50J3MgYHNlc3Npb25VcmlgXG5cdCAqIChzbyBzaWRlIGVmZmVjdHMgdGFyZ2V0IHRoZSBwYXJlbnQncyB3b3JraW5nIHRyZWUgYW5kIHRoZSBmaXJlZCBhY3Rpb25zXG5cdCAqIHJlc29sdmUgdG8gdGhlIHBhcmVudCBjaGF0IGNoYW5uZWwpIGFuZCBgYWNjZXB0ZWRGb3JTZXNzaW9uYCBtZW1vIChzbyB0aGVcblx0ICogYWNjZXB0LWZvci1zZXNzaW9uIGRlY2lzaW9uIHNwYW5zIHBhcmVudCArIHN1YmFnZW50cyksIGJ1dCBoYXMgaXRzIG93blxuXHQgKiBmcmVzaCBtYXAvdHVybiBzdGF0ZSBhbmQgYXBwcm92YWwgcmVnaXN0cnkgc28gdGhlIGNoaWxkJ3MgZXZlbnRzIGRvbid0XG5cdCAqIGNvbGxpZGUgd2l0aCB0aGUgcGFyZW50J3MuXG5cdCAqL1xuXHRwcml2YXRlIF9jcmVhdGVTdWJhZ2VudFNlc3Npb24ocGFyZW50OiBJQ29kZXhTZXNzaW9uLCBjaGlsZFRocmVhZElkOiBzdHJpbmcpOiBJQ29kZXhTZXNzaW9uIHtcblx0XHRjb25zdCBjbGllbnRUb29sU2V0ID0gbmV3IEFjdGl2ZUNsaWVudFRvb2xTZXQoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2Vzc2lvbklkOiBwYXJlbnQuc2Vzc2lvbklkLFxuXHRcdFx0dGhyZWFkSWQ6IGNoaWxkVGhyZWFkSWQsXG5cdFx0XHRzZXNzaW9uVXJpOiBwYXJlbnQuc2Vzc2lvblVyaSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHBhcmVudC53b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBwYXJlbnQud29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdFx0bXVsdGlSb290RW5hYmxlZDogcGFyZW50Lm11bHRpUm9vdEVuYWJsZWQsXG5cdFx0XHRtYW5hZ2VkV29ya2luZ0RpcmVjdG9yeTogdW5kZWZpbmVkLFxuXHRcdFx0bWFwU3RhdGU6IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKG5ldyBTZXQodGhpcy5fc2VydmVyVG9vbEhvc3Q/LnRvb2xOYW1lcyA/PyBbXSksIGNsaWVudFRvb2xTZXQpLFxuXHRcdFx0cGVuZGluZ0NvbW1hbmRBcHByb3ZhbHM6IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PENvbW1hbmRFeGVjdXRpb25BcHByb3ZhbERlY2lzaW9uPigpLFxuXHRcdFx0YWNjZXB0ZWRGb3JTZXNzaW9uOiBwYXJlbnQuYWNjZXB0ZWRGb3JTZXNzaW9uLFxuXHRcdFx0aGFuZGxlZEd1YXJkaWFuUmV2aWV3czogbmV3IFNldDxzdHJpbmc+KCksXG5cdFx0XHRwZW5kaW5nR3VhcmRpYW5SZXZpZXdDYXJkczogbmV3IFNldDxzdHJpbmc+KCksXG5cdFx0XHRwZW5kaW5nU3RlZXJpbmdGbGlwczogbmV3IE1hcDxzdHJpbmcsIFBlbmRpbmdNZXNzYWdlPigpLFxuXHRcdFx0Y2xpZW50VG9vbFNldCxcblx0XHRcdHBlbmRpbmdDbGllbnRUb29sQ2FsbHM6IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PFRvb2xDYWxsUmVzdWx0PigpLFxuXHRcdFx0cGVuZGluZ1VzZXJJbnB1dHM6IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PElDb2RleFVzZXJJbnB1dFJlc3VsdD4oKSxcblx0XHRcdG1hdGVyaWFsaXplZFRvb2xzU2lnOiB1bmRlZmluZWQsXG5cdFx0XHRtYXRlcmlhbGl6ZWRNY3BTaWc6IHVuZGVmaW5lZCxcblx0XHRcdGZpcnN0VHVyblNlbnQ6IHRydWUsXG5cdFx0XHRtb2RlbDogcGFyZW50Lm1vZGVsLFxuXHRcdFx0Y3VycmVudFR1cm5JZDogdW5kZWZpbmVkLFxuXHRcdFx0dHVyblN0b3BXYXRjaDogdW5kZWZpbmVkLFxuXHRcdFx0Y3VycmVudEFwcFR1cm5JZDogdW5kZWZpbmVkLFxuXHRcdFx0aG9zdFR1cm5JZEJ5QXBwVHVybklkOiBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpLFxuXHRcdFx0Y29kZXhUdXJuSWRCeUhvc3RUdXJuSWQ6IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCksXG5cdFx0XHRuZWVkc1Jlc3VtZTogZmFsc2UsXG5cdFx0XHRsYXN0UHJvbXB0VGV4dDogJycsXG5cdFx0XHRkaXNwb3NlZDogZmFsc2UsXG5cdFx0XHRtYXRlcmlhbGl6ZVByb21pc2U6IHVuZGVmaW5lZCxcblx0XHRcdG1hdGVyaWFsaXplZEV2ZW50RmlyZWQ6IHRydWUsXG5cdFx0XHRwcmV3YXJtVGltZXI6IHVuZGVmaW5lZCxcblx0XHRcdHByZXdhcm1DbGFpbWVkOiB0cnVlLFxuXHRcdFx0c2VydmVyVG9vbHNBZHZlcnRpc2VkOiB0cnVlLFxuXHRcdFx0bWNwQ29udHJvbGxlcjogdW5kZWZpbmVkLFxuXHRcdFx0Y2xpZW50Q3VzdG9taXphdGlvbnM6IG5ldyBDb2RleENsaWVudEN1c3RvbWl6YXRpb25TdG9yZSgpLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogRmlyZSBhIHN1YmFnZW50IGFjdGlvbiB0YWdnZWQgd2l0aCB0aGUgcGFyZW50IGBzcGF3bkFnZW50YCB0b29sIGNhbGwuXG5cdCAqIFRoZSBgcmVzb3VyY2VgIGlzIHRoZSBQQVJFTlQgY2hhdCBjaGFubmVsICh0aGUga2V5IHRoZSBzdWJhZ2VudCBjaGF0IGlzXG5cdCAqIHJlZ2lzdGVyZWQgdW5kZXIgaW4gdGhlIG9yY2hlc3RyYXRvcik7IGBwYXJlbnRUb29sQ2FsbElkYCByb3V0ZXMgdGhlXG5cdCAqIGFjdGlvbiBpbnRvIHRoZSBjaGlsZCdzIHJlYWQtb25seSBwZWVyIGNoYXQuXG5cdCAqL1xuXHRwcml2YXRlIF9maXJlU3ViYWdlbnQoc3ViYWdlbnQ6IElDb2RleFN1YmFnZW50LCBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZmlyZSh7XG5cdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzdWJhZ2VudC5zZXNzaW9uLnNlc3Npb25VcmkpKSxcblx0XHRcdGFjdGlvbixcblx0XHRcdHBhcmVudFRvb2xDYWxsSWQ6IHN1YmFnZW50LnRvb2xDYWxsSWQsXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUGhhc2UgNDogaGFuZGxlIGBpdGVtL2NvbW1hbmRFeGVjdXRpb24vcmVxdWVzdEFwcHJvdmFsYCBmcm9tXG5cdCAqIGNvZGV4LiBMb29rIHVwIHRoZSBob3N0LXNpZGUgdG9vbCBjYWxsIGZvciB0aGUgaXRlbSwgZW1pdCBhXG5cdCAqIGBDaGF0VG9vbENhbGxSZWFkeWAgaW4gUGVuZGluZ0NvbmZpcm1hdGlvbiwgcGFyayBvbiBhIGRlZmVycmVkXG5cdCAqIGtleWVkIGJ5IHRvb2xDYWxsSWQsIGFuZCByZXNvbHZlIHdoZW4gdGhlIHVzZXIgKG9yIHRoZVxuXHQgKiBhY2NlcHQtZm9yLXNlc3Npb24gbWVtbykgZGVjaWRlcy4gVW5rbm93biBzZXNzaW9ucyAvIGl0ZW1zXG5cdCAqIGRlY2xpbmUgc2lsZW50bHkgc28gY29kZXggc3RvcHMgYmxvY2tpbmcuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVDb21tYW5kQXBwcm92YWxSZXF1ZXN0UnBjKHBhcmFtczogQ29tbWFuZEV4ZWN1dGlvblJlcXVlc3RBcHByb3ZhbFBhcmFtcyk6IFByb21pc2U8eyByZWFkb25seSByZXN1bHQ6IENvbW1hbmRFeGVjdXRpb25SZXF1ZXN0QXBwcm92YWxSZXNwb25zZSB9PiB7XG5cdFx0Ly8gVGhlIHJlcXVlc3QgaGFuZGxlciBtdXN0IHJldHVybiBDb2RleCdzIEpTT04tUlBDIHJlc3VsdCB3cmFwcGVyOyBrZWVwXG5cdFx0Ly8gdGhlIGFwcHJvdmFsIG1ldGhvZCBiZWxvdyBmb2N1c2VkIG9uIHRoZSBob3N0LXNpZGUgcGVybWlzc2lvbiBkZWNpc2lvbi5cblx0XHRjb25zdCBkZWNpc2lvbiA9IGF3YWl0IHRoaXMuX2hhbmRsZUNvbW1hbmRBcHByb3ZhbFJlcXVlc3QocGFyYW1zKTtcblx0XHRyZXR1cm4geyByZXN1bHQ6IHsgZGVjaXNpb24gfSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlQ29tbWFuZEFwcHJvdmFsUmVxdWVzdChwYXJhbXM6IHtcblx0XHRyZWFkb25seSB0aHJlYWRJZDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHR1cm5JZDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGl0ZW1JZDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGNvbW1hbmQ/OiBzdHJpbmcgfCBudWxsO1xuXHRcdHJlYWRvbmx5IHJlYXNvbj86IHN0cmluZyB8IG51bGw7XG5cdH0pOiBQcm9taXNlPENvbW1hbmRFeGVjdXRpb25BcHByb3ZhbERlY2lzaW9uPiB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fcmVzb2x2ZUFwcHJvdmFsVGFyZ2V0KHBhcmFtcy50aHJlYWRJZCk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSBjb21tYW5kRXhlY3V0aW9uL3JlcXVlc3RBcHByb3ZhbCBmb3IgdW5rbm93biB0aHJlYWRJZD0ke3BhcmFtcy50aHJlYWRJZH07IGRlY2xpbmluZ2ApO1xuXHRcdFx0cmV0dXJuICdkZWNsaW5lJztcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRhcmdldC5zZXNzaW9uO1xuXHRcdGNvbnN0IGVudHJ5ID0gc2Vzc2lvbi5tYXBTdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQocGFyYW1zLml0ZW1JZCk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXg6JHtzZXNzaW9uLnNlc3Npb25JZH1dIGNvbW1hbmRFeGVjdXRpb24vcmVxdWVzdEFwcHJvdmFsIGZvciB1bmtub3duIGl0ZW1JZD0ke3BhcmFtcy5pdGVtSWR9OyBkZWNsaW5pbmdgKTtcblx0XHRcdHJldHVybiAnZGVjbGluZSc7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbW1hbmQgPSBwYXJhbXMuY29tbWFuZCA/PyAnJztcblx0XHQvLyBQZWVsIHRoZSBPUyBzaGVsbCB3cmFwcGVyIChgL2Jpbi96c2ggLWxjICdcdTIwMjYnYCkgb2ZmIGZvciBkaXNwbGF5IHNvIHRoZVxuXHRcdC8vIGFwcHJvdmFsIGNhcmQgbWF0Y2hlcyB0aGUgdGVybWluYWwgcGlsbCwgYnV0IGtlZXAgdGhlIHJhdyBjb21tYW5kIGFzXG5cdFx0Ly8gdGhlIGFjY2VwdC1mb3Itc2Vzc2lvbiBtZW1vIGtleSBzbyBpdCBzdGF5cyBieXRlLWlkZW50aWNhbCB0byB3aGF0XG5cdFx0Ly8gQ29kZXggcmUtc2VuZHMgb24gdGhlIG5leHQgcmVxdWVzdCBmb3IgdGhlIHNhbWUgY29tbWFuZC5cblx0XHRjb25zdCBkaXNwbGF5Q29tbWFuZCA9IHVud3JhcFNoZWxsSW52b2NhdGlvbihjb21tYW5kKTtcblx0XHQvLyBBY2NlcHQtZm9yLXNlc3Npb24gbWVtbzogaWYgdGhlIHVzZXIgcHJldmlvdXNseSBhY2NlcHRlZCB0aGlzXG5cdFx0Ly8gZXhhY3QgY29tbWFuZCBmb3IgdGhlIHNlc3Npb24sIGF1dG8tYWNjZXB0IHdpdGhvdXQgcHJvbXB0aW5nLlxuXHRcdGlmIChjb21tYW5kICYmIHNlc3Npb24uYWNjZXB0ZWRGb3JTZXNzaW9uLmhhcyhjb21tYW5kKSkge1xuXHRcdFx0cmV0dXJuICdhY2NlcHRGb3JTZXNzaW9uJztcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlybWF0aW9uVGl0bGUgPSBwYXJhbXMucmVhc29uID8/ICdSdW4gc2hlbGwgY29tbWFuZCc7XG5cdFx0Ly8gQXRvbWljYWxseSByZWdpc3RlciB0aGUgZGVmZXJyZWQgYW5kIGZpcmUgdGhlXG5cdFx0Ly8gUGVuZGluZ0NvbmZpcm1hdGlvbiBzaWduYWwgc28gYSBzeW5jaHJvbm91cyByZXNwb25kZXIgY2FuJ3Rcblx0XHQvLyBtaXNzIHRoZSByZWdpc3RyYXRpb24uXG5cdFx0Y29uc3QgZGVjaXNpb24gPSBhd2FpdCBzZXNzaW9uLnBlbmRpbmdDb21tYW5kQXBwcm92YWxzLnJlZ2lzdGVyQW5kRmlyZShlbnRyeS50b29sQ2FsbElkLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9maXJlQXBwcm92YWwodGFyZ2V0LCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogZW50cnkudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBlbnRyeS50b29sQ2FsbElkLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogZGlzcGxheUNvbW1hbmQsXG5cdFx0XHRcdHRvb2xJbnB1dDogZGlzcGxheUNvbW1hbmQsXG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0Ly8gVHJhY2sgYWNjZXB0LWZvci1zZXNzaW9uIGRlY2lzaW9ucyBmb3IgdGhlIG5leHQgcmVxdWVzdC5cblx0XHRpZiAoZGVjaXNpb24gPT09ICdhY2NlcHRGb3JTZXNzaW9uJyAmJiBjb21tYW5kKSB7XG5cdFx0XHRzZXNzaW9uLmFjY2VwdGVkRm9yU2Vzc2lvbi5hZGQoY29tbWFuZCk7XG5cdFx0fVxuXHRcdHJldHVybiBkZWNpc2lvbjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUZpbGVDaGFuZ2VBcHByb3ZhbFJlcXVlc3RScGMocGFyYW1zOiBGaWxlQ2hhbmdlUmVxdWVzdEFwcHJvdmFsUGFyYW1zKTogUHJvbWlzZTx7IHJlYWRvbmx5IHJlc3VsdDogRmlsZUNoYW5nZVJlcXVlc3RBcHByb3ZhbFJlc3BvbnNlIH0+IHtcblx0XHRjb25zdCBkZWNpc2lvbiA9IGF3YWl0IHRoaXMuX3JlcXVlc3RJdGVtQXBwcm92YWwocGFyYW1zLnRocmVhZElkLCBwYXJhbXMuaXRlbUlkLCBwYXJhbXMucmVhc29uID8/ICdBcHBseSBmaWxlIGNoYW5nZXMnKTtcblx0XHRyZXR1cm4geyByZXN1bHQ6IHsgZGVjaXNpb246IG5hcnJvd0ZpbGVDaGFuZ2VEZWNpc2lvbihkZWNpc2lvbikgfSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlUGVybWlzc2lvbnNBcHByb3ZhbFJlcXVlc3RScGMocGFyYW1zOiBQZXJtaXNzaW9uc1JlcXVlc3RBcHByb3ZhbFBhcmFtcyk6IFByb21pc2U8eyByZWFkb25seSByZXN1bHQ6IFBlcm1pc3Npb25zUmVxdWVzdEFwcHJvdmFsUmVzcG9uc2UgfT4ge1xuXHRcdGNvbnN0IGRlY2lzaW9uID0gYXdhaXQgdGhpcy5fcmVxdWVzdEl0ZW1BcHByb3ZhbChwYXJhbXMudGhyZWFkSWQsIHBhcmFtcy5pdGVtSWQsIHBhcmFtcy5yZWFzb24gPz8gJ0dyYW50IGVsZXZhdGVkIHBlcm1pc3Npb25zJyk7XG5cdFx0Y29uc3QgZ3JhbnRlZCA9IGRlY2lzaW9uID09PSAnYWNjZXB0JyB8fCBkZWNpc2lvbiA9PT0gJ2FjY2VwdEZvclNlc3Npb24nO1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0Ly8gR3JhbnQgZXhhY3RseSB3aGF0IHdhcyByZXF1ZXN0ZWQgb24gYWNjZXB0OyBub3RoaW5nIG9uIGRlY2xpbmUuXG5cdFx0XHRcdHBlcm1pc3Npb25zOiBncmFudGVkXG5cdFx0XHRcdFx0PyB7IG5ldHdvcms6IHBhcmFtcy5wZXJtaXNzaW9ucy5uZXR3b3JrID8/IHVuZGVmaW5lZCwgZmlsZVN5c3RlbTogcGFyYW1zLnBlcm1pc3Npb25zLmZpbGVTeXN0ZW0gPz8gdW5kZWZpbmVkIH1cblx0XHRcdFx0XHQ6IHt9LFxuXHRcdFx0XHRzY29wZTogZGVjaXNpb24gPT09ICdhY2NlcHRGb3JTZXNzaW9uJyA/ICdzZXNzaW9uJyA6ICd0dXJuJyxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaGFyZWQgYXBwcm92YWwgZmxvdyBmb3IgaXRlbS1zY29wZWQgYHJlcXVlc3RBcHByb3ZhbGAgcmVxdWVzdHMgdGhhdFxuXHQgKiBkb24ndCBjYXJyeSB0aGVpciBvd24gY29tbWFuZCBzdHJpbmc6IGxvb2sgdXAgdGhlIGhvc3QgdG9vbCBjYWxsIGZvclxuXHQgKiB0aGUgaXRlbSwgZmlyZSBhIHBlbmRpbmctY29uZmlybWF0aW9uIGBDaGF0VG9vbENhbGxSZWFkeWAsIGFuZCByZXNvbHZlXG5cdCAqIHdoZW4gdGhlIHVzZXIgKHZpYSB7QGxpbmsgcmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3R9KSBkZWNpZGVzLiBEZWNsaW5lc1xuXHQgKiBpZiB0aGUgc2Vzc2lvbiBvciBpdGVtIGlzIHVua25vd24uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXF1ZXN0SXRlbUFwcHJvdmFsKHRocmVhZElkOiBzdHJpbmcsIGl0ZW1JZDogc3RyaW5nLCBjb25maXJtYXRpb25UaXRsZTogc3RyaW5nKTogUHJvbWlzZTxDb21tYW5kRXhlY3V0aW9uQXBwcm92YWxEZWNpc2lvbj4ge1xuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3Jlc29sdmVBcHByb3ZhbFRhcmdldCh0aHJlYWRJZCk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSBhcHByb3ZhbCByZXF1ZXN0IGZvciB1bmtub3duIHRocmVhZElkPSR7dGhyZWFkSWR9OyBkZWNsaW5pbmdgKTtcblx0XHRcdHJldHVybiAnZGVjbGluZSc7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb24gPSB0YXJnZXQuc2Vzc2lvbjtcblx0XHRjb25zdCBlbnRyeSA9IHNlc3Npb24ubWFwU3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KGl0ZW1JZCk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXg6JHtzZXNzaW9uLnNlc3Npb25JZH1dIGFwcHJvdmFsIHJlcXVlc3QgZm9yIHVua25vd24gaXRlbUlkPSR7aXRlbUlkfTsgZGVjbGluaW5nYCk7XG5cdFx0XHRyZXR1cm4gJ2RlY2xpbmUnO1xuXHRcdH1cblx0XHRyZXR1cm4gc2Vzc2lvbi5wZW5kaW5nQ29tbWFuZEFwcHJvdmFscy5yZWdpc3RlckFuZEZpcmUoZW50cnkudG9vbENhbGxJZCwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fZmlyZUFwcHJvdmFsKHRhcmdldCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6IGVudHJ5LnR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZDogZW50cnkudG9vbENhbGxJZCxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGNvbmZpcm1hdGlvblRpdGxlLFxuXHRcdFx0XHR0b29sSW5wdXQ6IGNvbmZpcm1hdGlvblRpdGxlLFxuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgdGhlIHtAbGluayBJQ29kZXhTZXNzaW9ufSB0aGF0IG93bnMgYSBjb2RleCB0aHJlYWQgZm9yIGFuXG5cdCAqIGFwcHJvdmFsIHJlcXVlc3QsIHBsdXMgdGhlIHN1YmFnZW50IHdyYXBwZXIgd2hlbiB0aGUgdGhyZWFkIGlzIGFcblx0ICogY29sbGFiLWFnZW50IGNoaWxkLiBBIHN1YmFnZW50IHRvb2wgY2FsbCdzIHBlbmRpbmctY29uZmlybWF0aW9uXG5cdCAqIGBDaGF0VG9vbENhbGxSZWFkeWAgbXVzdCBiZSBmaXJlZCB3aXRoIHRoZSBwYXJlbnQgYHNwYXduQWdlbnRgIHRvb2wgY2FsbFxuXHQgKiBhcyBpdHMgYHBhcmVudFRvb2xDYWxsSWRgICh2aWEge0BsaW5rIF9maXJlQXBwcm92YWx9KSBzbyBpdCBsYW5kcyBpbiB0aGVcblx0ICogY2hpbGQncyByZWFkLW9ubHkgcGVlciBjaGF0IFx1MjAxNCB3aGVyZSB0aGUgbWF0Y2hpbmcgYENoYXRUb29sQ2FsbFN0YXJ0YFxuXHQgKiBsaXZlcyBcdTIwMTQgaW5zdGVhZCBvZiBvbiB0aGUgcGFyZW50IHNlc3Npb24uXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlQXBwcm92YWxUYXJnZXQodGhyZWFkSWQ6IHN0cmluZyk6IHsgcmVhZG9ubHkgc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbjsgcmVhZG9ubHkgc3ViYWdlbnQ/OiBJQ29kZXhTdWJhZ2VudCB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzdWJhZ2VudCA9IHRoaXMuX3N1YmFnZW50c0J5VGhyZWFkSWQuZ2V0KHRocmVhZElkKTtcblx0XHRpZiAoc3ViYWdlbnQpIHtcblx0XHRcdHJldHVybiB7IHNlc3Npb246IHN1YmFnZW50LnNlc3Npb24sIHN1YmFnZW50IH07XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHRoaXMuX3Nlc3Npb25JZEJ5VGhyZWFkSWQuZ2V0KHRocmVhZElkKTtcblx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbklkID8gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCkgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHNlc3Npb24gPyB7IHNlc3Npb24gfSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKiBGaXJlIGFuIGFwcHJvdmFsIGFjdGlvbiB0byB0aGUgcGFyZW50IHNlc3Npb24gb3IgdGhlIHN1YmFnZW50IHBlZXIgY2hhdC4gKi9cblx0cHJpdmF0ZSBfZmlyZUFwcHJvdmFsKHRhcmdldDogeyByZWFkb25seSBzZXNzaW9uOiBJQ29kZXhTZXNzaW9uOyByZWFkb25seSBzdWJhZ2VudD86IElDb2RleFN1YmFnZW50IH0sIGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pOiB2b2lkIHtcblx0XHRpZiAodGFyZ2V0LnN1YmFnZW50KSB7XG5cdFx0XHR0aGlzLl9maXJlU3ViYWdlbnQodGFyZ2V0LnN1YmFnZW50LCBhY3Rpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9maXJlKHRhcmdldC5zZXNzaW9uLnNlc3Npb25VcmksIGFjdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlR3VhcmRpYW5XYXJuaW5nKHNlc3Npb246IElDb2RleFNlc3Npb24sIHBhcmFtczogR3VhcmRpYW5XYXJuaW5nTm90aWZpY2F0aW9uKTogQ2hhdEFjdGlvbltdIHtcblx0XHRjb25zdCB0dXJuSWQgPSBzZXNzaW9uLmN1cnJlbnRUdXJuSWQ7XG5cdFx0aWYgKHR1cm5JZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29kZXg6JHtzZXNzaW9uLnNlc3Npb25JZH1dIGd1YXJkaWFuV2FybmluZyB3aXRob3V0IGFjdGl2ZSB0dXJuOyBpZ25vcmluZ2ApO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHBhcnQ6IHtcblx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5TeXN0ZW1Ob3RpZmljYXRpb24sXG5cdFx0XHRcdGNvbnRlbnQ6IHBhcmFtcy5tZXNzYWdlLFxuXHRcdFx0fSxcblx0XHR9XTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUd1YXJkaWFuUmV2aWV3Q29tcGxldGVkKGNsaWVudDogSUNvZGV4QXBwU2VydmVyQ2xpZW50LCBwYXJhbXM6IEl0ZW1HdWFyZGlhbkFwcHJvdmFsUmV2aWV3Q29tcGxldGVkTm90aWZpY2F0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gdGhpcy5fc2Vzc2lvbklkQnlUaHJlYWRJZC5nZXQocGFyYW1zLnRocmVhZElkKTtcblx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbklkID8gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29kZXhdIGF1dG9BcHByb3ZhbFJldmlldy9jb21wbGV0ZWQgZm9yIHVua25vd24gdGhyZWFkSWQ9JHtwYXJhbXMudGhyZWFkSWR9OyBpZ25vcmluZ2ApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAocGFyYW1zLnJldmlldy5zdGF0dXMgIT09ICdkZW5pZWQnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChzZXNzaW9uLmhhbmRsZWRHdWFyZGlhblJldmlld3MuaGFzKHBhcmFtcy5yZXZpZXdJZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQmluZCB0aGUgZGVuaWFsIHN1cmZhY2luZyB0byB0aGUgcmV2aWV3J3MgT1dOIHR1cm4gKG1hcHBlZCBhcHBcdTIxOTJob3N0KSxcblx0XHQvLyBub3Qgd2hhdGV2ZXIgdHVybiBoYXBwZW5zIHRvIGJlIGN1cnJlbnQuIEFuIGBhdXRvQXBwcm92YWxSZXZpZXcvY29tcGxldGVkYFxuXHRcdC8vIHRoYXQgYXJyaXZlcyBvdXQgb2Ygb3JkZXIgXHUyMDE0IGFmdGVyIGl0cyB0dXJuIGVuZGVkLCBvciBvbmNlIGEgbGF0ZXIgdHVybiBpc1xuXHRcdC8vIGFjdGl2ZSBcdTIwMTQgbXVzdCBub3QgbWlzLWF0dHJpYnV0ZSB0aGUgbm90aWNlL2NhcmQgdG8gYSBkaWZmZXJlbnQgdHVybiwgbm9yXG5cdFx0Ly8gYXBwbHkgdGhpcyByZXZpZXcncyBzdGFsZSBhY3Rpb24gYWdhaW5zdCBpdC4gV2hlbiB0aGUgcmV2aWV3J3MgdHVybiBpcyBub1xuXHRcdC8vIGxvbmdlciB0aGUgYWN0aXZlIHR1cm4gdGhlcmUgaXMgbm90aGluZyBsZWZ0IHRvIGFwcHJvdmUgd2l0aGluIGl0LCBzbyBpZ25vcmUuXG5cdFx0Y29uc3QgdHVybklkID0gdGhpcy5faG9zdFR1cm5JZChzZXNzaW9uLCBwYXJhbXMudHVybklkKTtcblx0XHRpZiAoc2Vzc2lvbi5jdXJyZW50VHVybklkICE9PSB0dXJuSWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb2RleDoke3Nlc3Npb25JZH1dIGF1dG9BcHByb3ZhbFJldmlldy9jb21wbGV0ZWQgZm9yIG5vbi1jdXJyZW50IHR1cm4gJHt0dXJuSWR9IChjdXJyZW50PSR7c2Vzc2lvbi5jdXJyZW50VHVybklkID8/ICcobm9uZSknfSk7IGlnbm9yaW5nIHJldmlld0lkPSR7cGFyYW1zLnJldmlld0lkfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHNlc3Npb24uaGFuZGxlZEd1YXJkaWFuUmV2aWV3cy5hZGQocGFyYW1zLnJldmlld0lkKTtcblxuXHRcdGNvbnN0IHN1bW1hcnkgPSBzdW1tYXJpemVHdWFyZGlhblJldmlld0FjdGlvbihwYXJhbXMuYWN0aW9uKTtcblxuXHRcdC8vIER1cmFibGUgcmVjb3JkOiBhIE1hcmtkb3duIHJlc3BvbnNlIHBhcnQgc3Vydml2ZXMgdHVybiBjb21wbGV0aW9uIEFORCBpc1xuXHRcdC8vIHJlbmRlcmVkIGJ5IHRoZSBsaXZlIHN0cmVhbWluZyBwYXRoICh1bmxpa2UgYSBzeXN0ZW0tbm90aWZpY2F0aW9uIHBhcnQsXG5cdFx0Ly8gd2hpY2ggdGhlIHdvcmtiZW5jaCBtYXBzIHRvIGEgdHJhbnNpZW50IHByb2dyZXNzIG1lc3NhZ2UgYW5kIG5ldmVyIGVtaXRzXG5cdFx0Ly8gbWlkLXR1cm4pLiBUaGUgYXV0by1yZXZpZXcgY2lyY3VpdC1icmVha2VyIGludGVycnVwdHMgdGhlIHR1cm4gYWZ0ZXJcblx0XHQvLyByZXBlYXRlZCBkZW5pYWxzIFx1MjAxNCBjYW5jZWxsaW5nIHRoZSB0b29sLWNhbGwgY2FyZCBiZWxvdyBcdTIwMTQgc28gd2l0aG91dCB0aGlzXG5cdFx0Ly8gdGhlIHVzZXIgY291bGQgYmUgbGVmdCB3aXRoIG5vIGZlZWRiYWNrIGF0IGFsbC4gU3VyZmFjaW5nIHRoZSByZXZpZXdlclxuXHRcdC8vIHJhdGlvbmFsZSBoZXJlIG1pcnJvcnMgdGhlIG1hbnVhbC1hcHByb3ZhbCBmZWVkYmFjayB0aGUgRGVmYXVsdFxuXHRcdC8vIHBlcm1pc3Npb25zIHByZXNldCBwcm92aWRlcy5cblx0XHR0aGlzLl9maXJlKHNlc3Npb24uc2Vzc2lvblVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LFxuXHRcdFx0dHVybklkLFxuXHRcdFx0cGFydDoge1xuXHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLFxuXHRcdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRcdGNvbnRlbnQ6IGZvcm1hdEd1YXJkaWFuRGVuaWFsTm90aWZpY2F0aW9uKHN1bW1hcnksIHBhcmFtcy5yZXZpZXcucmF0aW9uYWxlKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHQvLyBCZXN0LWVmZm9ydCBpbi10dXJuIG92ZXJyaWRlOiB3aGlsZSB0aGUgdHVybiBpcyBzdGlsbCBydW5uaW5nIChiZWZvcmUgdGhlXG5cdFx0Ly8gY2lyY3VpdC1icmVha2VyIGludGVycnVwdCkgdGhlIG1vZGVsIGtlZXBzIHRyeWluZyBzYWZlciBwYXRocywgc29cblx0XHQvLyBhcHByb3ZpbmcgaGVyZSBsZXRzIGNvZGV4IHJldHJ5IHRoZSBleGFjdCBkZW5pZWQgYWN0aW9uLiBjb2RleCBkb2VzIG5vdFxuXHRcdC8vIGJsb2NrIG9uIHRoaXMgY2FyZCwgc28gaWYgdGhlIHR1cm4gZW5kcyBmaXJzdCB0aGUgcmVkdWNlciBjYW5jZWxzIGl0IGFuZFxuXHRcdC8vIHtAbGluayBfaGFuZGxlVHVybkNvbXBsZXRlZE5vdGlmaWNhdGlvbn0gdW53aW5kcyB0aGUgcGFya2VkIGRlZmVycmVkLlxuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBpbnZvY2F0aW9uTWVzc2FnZSA9IHN1bW1hcnkuZGV0YWlsIHx8IHN1bW1hcnkudGl0bGU7XG5cdFx0Y29uc3QgY29uZmlybWF0aW9uVGl0bGUgPSAnQXBwcm92ZSBhbnl3YXknO1xuXHRcdC8vIERlbGliZXJhdGVseSByZW5kZXIgdGhpcyBhcyBhIFBMQUlOIGNvbmZpcm1hdGlvbiBjYXJkLCBOT1QgYSB0ZXJtaW5hbFxuXHRcdC8vIHBpbGw6IHRoZSBkZW5pZWQgYWN0aW9uIGFscmVhZHkgYXBwZWFycyBhcyBpdHMgcmVhbCBjb21tYW5kRXhlY3V0aW9uXG5cdFx0Ly8gdGVybWluYWwgYm94IChzdHJlYW1lZCBieSB0aGUgYXBwLXNlcnZlcikgYW5kIGFnYWluIGluIHRoZSBkZW5pYWxcblx0XHQvLyBibG9ja3F1b3RlIGFib3ZlLiBUYWdnaW5nIHRoZSBjYXJkIHdpdGggYSB0ZXJtaW5hbCBgdG9vbEtpbmRgICsgYVxuXHRcdC8vIGB0b29sSW5wdXRgIHdvdWxkIG1ha2UgdGhlIGFkYXB0ZXIgZHJhdyBhICpzZWNvbmQqIHRlcm1pbmFsIGJveCBmb3IgdGhlXG5cdFx0Ly8gc2FtZSBjb21tYW5kIChzZWUgc3RhdGVUb1Byb2dyZXNzQWRhcHRlciBgc2hvdWxkUmVuZGVyQXNUZXJtaW5hbGApLFxuXHRcdC8vIHdoaWNoIGlzIHRoZSBkdXBsaWNhdGUgdGhlIHVzZXIgcmVwb3J0ZWQuIE9taXR0aW5nIGJvdGgga2VlcHMgdGhlIGNhcmRcblx0XHQvLyB0byBqdXN0IGl0cyB0aXRsZS9tZXNzYWdlICsgXCJBcHByb3ZlIGFueXdheVwiIGJ1dHRvbi4gVGhlIGJ1dHRvbiBzdGlsbFxuXHRcdC8vIHdvcmtzIGJlY2F1c2UgdGhlIHJlZHVjZXIga2V5cyBQZW5kaW5nQ29uZmlybWF0aW9uIG9mZiBjb25maXJtYXRpb25UaXRsZVxuXHRcdC8vICh3aXRoIGBjb25maXJtZWRgIHVuc2V0KSwgaW5kZXBlbmRlbnQgb2YgdG9vbElucHV0L21ldGEuXG5cdFx0c2Vzc2lvbi5wZW5kaW5nR3VhcmRpYW5SZXZpZXdDYXJkcy5hZGQodG9vbENhbGxJZCk7XG5cdFx0bGV0IGRlY2lzaW9uOiBDb21tYW5kRXhlY3V0aW9uQXBwcm92YWxEZWNpc2lvbjtcblx0XHR0cnkge1xuXHRcdFx0ZGVjaXNpb24gPSBhd2FpdCBzZXNzaW9uLnBlbmRpbmdDb21tYW5kQXBwcm92YWxzLnJlZ2lzdGVyQW5kRmlyZSh0b29sQ2FsbElkLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvbi5zZXNzaW9uVXJpLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0XHR0b29sTmFtZTogJ2F1dG9fcmV2aWV3X2RlbmllZCcsXG5cdFx0XHRcdFx0ZGlzcGxheU5hbWU6IHN1bW1hcnkudGl0bGUsXG5cdFx0XHRcdFx0aW50ZW50aW9uOiBpbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvbi5zZXNzaW9uVXJpLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIFRoZSBwYXJrZWQgYXBwcm92YWwgd2FzIHJlamVjdGVkIChzZXNzaW9uIGRpc3Bvc2UgLyBjYW5jZWxsYXRpb24pO1xuXHRcdFx0Ly8gdGhlcmUgaXMgbm8gY2FyZCBsaWZlY3ljbGUgbGVmdCB0byBmaW5hbGl6ZS5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb2RleDoke3Nlc3Npb25JZH1dIGd1YXJkaWFuIGFwcHJvdmFsIGNhbmNlbGxlZCBmb3IgcmV2aWV3SWQ9JHtwYXJhbXMucmV2aWV3SWR9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c2Vzc2lvbi5wZW5kaW5nR3VhcmRpYW5SZXZpZXdDYXJkcy5kZWxldGUodG9vbENhbGxJZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGRlY2lzaW9uICE9PSAnYWNjZXB0JyAmJiBkZWNpc2lvbiAhPT0gJ2FjY2VwdEZvclNlc3Npb24nKSB7XG5cdFx0XHQvLyBEZWNsaW5lZCwgY2FuY2VsbGVkLCBvciB1bndvdW5kIGJ5IHR1cm4gY29tcGxldGlvbjogdGhlIGFjdGlvbiBzdGF5c1xuXHRcdFx0Ly8gYmxvY2tlZCBieSBjb2RleC4gV2hlbiB0aGUgdXNlciBkZWNsaW5lZCwgdGhlIFVJIGFscmVhZHkgdHJhbnNpdGlvbmVkXG5cdFx0XHQvLyB0aGUgY2FyZCBvZmYgdGhlIENoYXRUb29sQ2FsbENvbmZpcm1lZCBpdCBkaXNwYXRjaGVkOyB3aGVuIHRoZSB0dXJuXG5cdFx0XHQvLyBlbmRlZCwgdGhlIHJlZHVjZXIgY2FuY2VsbGVkIGl0LiBFaXRoZXIgd2F5IHRoZXJlIGlzIG5vdGhpbmcgdG8gc2VuZC5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgdHVybiBlbmRlZCBiZXR3ZWVuIHRoZSB1c2VyJ3MgYXBwcm92YWwgYW5kIGhlcmUsIHRoZSBjYXJkIHdhc1xuXHRcdC8vIGFscmVhZHkgY2FuY2VsbGVkIGJ5IHRoZSByZWR1Y2VyIGFuZCBjb2RleCBpcyBubyBsb25nZXIgd2FpdGluZyBvbiB0aGlzXG5cdFx0Ly8gYWN0aW9uIHdpdGhpbiB0aGUgdHVybiBcdTIwMTQgc2tpcCB0aGUgcm91bmQtdHJpcC5cblx0XHRpZiAoc2Vzc2lvbi5jdXJyZW50VHVybklkICE9PSB0dXJuSWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb2RleDoke3Nlc3Npb25JZH1dIHR1cm4gZW5kZWQgYmVmb3JlIGd1YXJkaWFuIGFwcHJvdmFsIGNvdWxkIGJlIGFwcGxpZWQgZm9yIHJldmlld0lkPSR7cGFyYW1zLnJldmlld0lkfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBjbGllbnQucmVxdWVzdDwndGhyZWFkL2FwcHJvdmVHdWFyZGlhbkRlbmllZEFjdGlvbicsIFRocmVhZEFwcHJvdmVHdWFyZGlhbkRlbmllZEFjdGlvblJlc3BvbnNlPigndGhyZWFkL2FwcHJvdmVHdWFyZGlhbkRlbmllZEFjdGlvbicsIHtcblx0XHRcdFx0dGhyZWFkSWQ6IHBhcmFtcy50aHJlYWRJZCxcblx0XHRcdFx0ZXZlbnQ6IHRvR3VhcmRpYW5Bc3Nlc3NtZW50RXZlbnRKc29uKHBhcmFtcyksXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvbi5zZXNzaW9uVXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnQXBwcm92ZWQgYW55d2F5Jyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gVGhlIHVzZXIgYXBwcm92ZWQgYnV0IHRoZSBhcHAtc2VydmVyIHJlamVjdGVkIHRoZSByb3VuZC10cmlwOyBmaW5hbGl6ZVxuXHRcdFx0Ly8gdGhlIGNhcmQgYXMgZmFpbGVkIHNvIGl0IGRvZXMgbm90IGhhbmcgaW4gdGhlIHJ1bm5pbmcgc3RhdGUgZm9yZXZlci5cblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleDoke3Nlc3Npb25JZH1dIGFwcHJvdmVHdWFyZGlhbkRlbmllZEFjdGlvbiBmYWlsZWQgZm9yIHJldmlld0lkPSR7cGFyYW1zLnJldmlld0lkfTogJHttZXNzYWdlfWApO1xuXHRcdFx0dGhpcy5fZmlyZShzZXNzaW9uLnNlc3Npb25VcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnQXBwcm92YWwgZmFpbGVkJyxcblx0XHRcdFx0XHRlcnJvcjogeyBtZXNzYWdlIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVDb25uZWN0aW9uTG9zdCgpOiB2b2lkIHtcblx0XHRjb25zdCBjb25uID0gdGhpcy5fY29ubmVjdGlvbjtcblx0XHRpZiAoY29ubi5raW5kICE9PSAncmVhZHknKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Nvbm5lY3Rpb24gPSB7IGtpbmQ6ICdpZGxlJyB9O1xuXHRcdC8vIE5vdGlmeSBldmVyeSBrbm93biBzZXNzaW9uIHdpdGggYSBzaW5nbGUgQ2hhdEVycm9yICsgY29tcGxldGVcblx0XHQvLyBwYWlyIHNvIHRoZSBVSSBzdXJmYWNlcyBcImFnZW50IGRpc2Nvbm5lY3RlZFwiIGNsZWFubHkuXG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHQvLyBVbnBhcmsgYW55IHBlbmRpbmcgYXBwcm92YWxzIHNvIGF3YWl0ZXJzIHVud2luZC5cblx0XHRcdHNlc3Npb24ucGVuZGluZ0NvbW1hbmRBcHByb3ZhbHMuZGVueUFsbCgnZGVjbGluZScpO1xuXHRcdFx0Ly8gUmVqZWN0IGluLWZsaWdodCBjbGllbnQgdG9vbCBjYWxscyBzbyB0aGVpciBoYW5kbGVycyB1bndpbmQuXG5cdFx0XHRzZXNzaW9uLnBlbmRpbmdDbGllbnRUb29sQ2FsbHMucmVqZWN0QWxsKG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHRcdHNlc3Npb24ucGVuZGluZ1VzZXJJbnB1dHMucmVqZWN0QWxsKG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHRcdC8vIENsZWFyIGFueSBidWZmZXJlZCBzdGVlcmluZyBzbyBpdHMgcGVuZGluZyBidWJibGUgZG9lc24ndCBsZWFrLlxuXHRcdFx0dGhpcy5fZHJhaW5QZW5kaW5nU3RlZXJpbmcoc2Vzc2lvbik7XG5cdFx0XHRjb25zdCB0dXJuSWQgPSBzZXNzaW9uLmN1cnJlbnRUdXJuSWQ7XG5cdFx0XHRjb25zdCBhcHBUdXJuSWQgPSBzZXNzaW9uLmN1cnJlbnRBcHBUdXJuSWQ7XG5cdFx0XHRzZXNzaW9uLmN1cnJlbnRUdXJuSWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRzZXNzaW9uLmN1cnJlbnRBcHBUdXJuSWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoYXBwVHVybklkKSB7XG5cdFx0XHRcdHNlc3Npb24uaG9zdFR1cm5JZEJ5QXBwVHVybklkLmRlbGV0ZShhcHBUdXJuSWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR1cm5JZCkge1xuXHRcdFx0XHRjb25zdCBkdXJhdGlvbiA9IHRoaXMuX2NsZWFyVHVyblN0b3BXYXRjaChzZXNzaW9uKTtcblx0XHRcdFx0dGhpcy5fZmlyZShzZXNzaW9uLnNlc3Npb25VcmksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRFcnJvcixcblx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0ZHVyYXRpb24sXG5cdFx0XHRcdFx0ZXJyb3I6IHsgZXJyb3JUeXBlOiAnQ29kZXhEaXNjb25uZWN0ZWQnLCBtZXNzYWdlOiAnQ29kZXggYXBwLXNlcnZlciBkaXNjb25uZWN0ZWQ7IHNlc3Npb24gbXVzdCByZXN0YXJ0LicgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvbi5zZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkLCBkdXJhdGlvbiB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzdWJhZ2VudCBvZiB0aGlzLl9zdWJhZ2VudHNCeVRocmVhZElkLnZhbHVlcygpKSB7XG5cdFx0XHRzdWJhZ2VudC5zZXNzaW9uLnBlbmRpbmdDb21tYW5kQXBwcm92YWxzLmRlbnlBbGwoJ2RlY2xpbmUnKTtcblx0XHRcdHN1YmFnZW50LnNlc3Npb24ucGVuZGluZ0NsaWVudFRvb2xDYWxscy5yZWplY3RBbGwobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdFx0c3ViYWdlbnQuc2Vzc2lvbi5wZW5kaW5nVXNlcklucHV0cy5yZWplY3RBbGwobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdFx0c3ViYWdlbnQuc2Vzc2lvbi5jdXJyZW50VHVybklkID0gdW5kZWZpbmVkO1xuXHRcdFx0c3ViYWdlbnQuc2Vzc2lvbi5jdXJyZW50QXBwVHVybklkID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9zdWJhZ2VudHNCeVRocmVhZElkLmNsZWFyKCk7XG5cdFx0dGhpcy5fYXBwbHlQZW5kaW5nVXNhZ2VTb3VyY2VJZklkbGUoKTtcblx0XHQvLyBSZWxlYXNlIHJlc291cmNlcy4gVGhlIHByb3h5IGhhbmRsZSBpcyByZWZjb3VudGVkIGFuZCBkcm9wc1xuXHRcdC8vIHRoZSB1bmRlcmx5aW5nIHNlcnZlciBvbmNlIGV2ZXJ5b25lIHJlbGVhc2VzLlxuXHRcdHRyeSB7XG5cdFx0XHRjb25uLmNsaWVudC5kaXNwb3NlKCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQ29kZXhdIEZhaWxlZCB0byBkaXNwb3NlIGFwcC1zZXJ2ZXIgY2xpZW50IGFmdGVyIGNvbm5lY3Rpb24gbG9zdDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25uLnByb3h5SGFuZGxlPy5kaXNwb3NlKCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQ29kZXhdIEZhaWxlZCB0byBkaXNwb3NlIHByb3h5IGhhbmRsZSBhZnRlciBjb25uZWN0aW9uIGxvc3Q6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VDb25uZWN0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLl9jb25uZWN0aW9uO1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb25HZW5lcmF0aW9uKys7XG5cdFx0dGhpcy5fY29ubmVjdGlvbiA9IHsga2luZDogJ2lkbGUnIH07XG5cdFx0aWYgKGNvbm5lY3Rpb24ua2luZCAhPT0gJ3JlYWR5Jykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkgeyBjb25uZWN0aW9uLmNsaWVudC5kaXNwb3NlKCk7IH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXHRcdHRyeSB7IGNvbm5lY3Rpb24ucHJveHlIYW5kbGU/LmRpc3Bvc2UoKTsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0dHJ5IHsgY29ubmVjdGlvbi5jaGlsZC5raWxsKCdTSUdLSUxMJyk7IH0gY2F0Y2ggeyAvKiBhbHJlYWR5IGRlYWQgKi8gfVxuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gSUFnZW50IG1ldGhvZHNcblxuXHRnZXREZXNjcmlwdG9yKCk6IElBZ2VudERlc2NyaXB0b3Ige1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcm92aWRlcjogdGhpcy5pZCxcblx0XHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgnY29kZXhBZ2VudC5kaXNwbGF5TmFtZScsIFwiQ29kZXhcIiksXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5fdXNhZ2VTb3VyY2UgPT09ICdvcGVuYWknXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NvZGV4QWdlbnQuZGVzY3JpcHRpb24ub3BlbmFpJywgXCJDb2RleCBhZ2VudCB1c2luZyB5b3VyIE9wZW5BSSBhY2NvdW50XCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NvZGV4QWdlbnQuZGVzY3JpcHRpb24uY29waWxvdCcsIFwiQ29kZXggYWdlbnQgdXNpbmcgR2l0SHViIENvcGlsb3RcIiksXG5cdFx0XHQuLi4odGhpcy5faXNNdWx0aVJvb3RFbmFibGVkKCkgPyB7IGNhcGFiaWxpdGllczogeyBtdWx0aXBsZVdvcmtpbmdEaXJlY3RvcmllczogeyBpbW11dGFibGVQcmltYXJ5OiB0cnVlIH0gfSB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9pc011bHRpUm9vdEVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdENvZGV4TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSkgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9zZXNzaW9uVXJpRnJvbUNoYXQoY2hhdDogVVJJKTogVVJJIHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNoYXRVcmkoY2hhdCk7XG5cdFx0cmV0dXJuIHBhcnNlZCA/IFVSSS5wYXJzZShwYXJzZWQuc2Vzc2lvbikgOiBjaGF0O1xuXHR9XG5cblx0Ly8gLS0tLSBDaGF0IHN1cmZhY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdC8vXG5cdC8vIENoYXQtYWRkcmVzc2VkIGFkb3B0aW9uIG9mIHRoZSB7QGxpbmsgSUFnZW50fSBzdXJmYWNlIGludHJvZHVjZWRcblx0Ly8gaW4gZ2F0ZSBHLUMxLiBDb2RleCBpcyBhIFNJTkdMRS1DSEFUIGhhcm5lc3M6IGEgc2Vzc2lvbiBvd25zIGV4YWN0bHkgb25lXG5cdC8vIChkZWZhdWx0KSBjaGF0IGFkZHJlc3NlZCBieSBpdHMgZGVmYXVsdCBjaGF0IGNoYW5uZWwgVVJJLCBzbyB0aGVcblx0Ly8gY2hhdCBtZXRob2RzIHNpbXBseSByb3V0ZSB0byB0aGUgZXhpc3Rpbmcgc2Vzc2lvbi1hZGRyZXNzZWRcblx0Ly8gaW1wbGVtZW50YXRpb25zLiBUaGUgbGVnYWN5IGAoc2Vzc2lvbiwgY2hhdD8pYCBtZXRob2RzIGJlbG93IGFyZSBrZXB0IGFzIGFcblx0Ly8gY29tcGF0IHNoaW0gKHJlbW92ZWQgY2VudHJhbGx5IGluIGdhdGUgRy1DMikgYW5kIGJvdGggc3VyZmFjZXMgY29leGlzdC5cblxuXHQvKipcblx0ICogVGhlIGNoYXQtYWRkcmVzc2VkIG9wZXJhdGlvbiBzdXJmYWNlIGZvciB0aGUgY2hhdHMgd2l0aGluIGEgc2Vzc2lvbi5cblx0ICogQ29kZXggaXMgc2luZ2xlLWNoYXQ6IHBlZXItY2hhdCBvcGVyYXRpb25zXG5cdCAqICh7QGxpbmsgSUFnZW50Q2hhdHMuY3JlYXRlQ2hhdH0ve0BsaW5rIElBZ2VudENoYXRzLmZvcmt9KVxuXHQgKiBhcmUgdW5zdXBwb3J0ZWQgYW5kIHRocm93LCBtaXJyb3JpbmcgdG9kYXkncyBiZWhhdmlvciB3aGVyZSBDb2RleCBvbWl0c1xuXHQgKiBgY3JlYXRlQ2hhdGAgKHRoZSBvcmNoZXN0cmF0b3IgcmVqZWN0ZWQgbXVsdGktY2hhdCBmb3IgQ29kZXgpLiBUaGVcblx0ICogcmVtYWluaW5nIG1ldGhvZHMgYWRkcmVzcyB0aGUgc2Vzc2lvbidzIHNpbmdsZSBkZWZhdWx0IGNoYXQsIHdob3NlXG5cdCAqIFVSSSBpcyB0aGUgZGV0ZXJtaW5pc3RpYyBkZWZhdWx0IGNoYXQgY2hhbm5lbCBVUkkuXG5cdCAqL1xuXHRyZWFkb25seSBjaGF0czogSUFnZW50Q2hhdHMgPSB7XG5cdFx0Y3JlYXRlQ2hhdDogKF9jaGF0OiBVUkksIF9vcHRpb25zPzogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMpOiBQcm9taXNlPElBZ2VudENyZWF0ZUNoYXRSZXN1bHQgfCB2b2lkPiA9PiB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvZGV4IGFnZW50IGRvZXMgbm90IHN1cHBvcnQgbXVsdGlwbGUgY2hhdHMnKTtcblx0XHR9LFxuXHRcdGZvcms6IChfY2hhdDogVVJJLCBfc291cmNlOiBJQWdlbnRDcmVhdGVDaGF0Rm9ya1NvdXJjZSwgX29wdGlvbnM/OiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyk6IFByb21pc2U8SUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCB8IHZvaWQ+ID0+IHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ29kZXggYWdlbnQgZG9lcyBub3Qgc3VwcG9ydCBjaGF0IGZvcmtpbmcnKTtcblx0XHR9LFxuXHRcdGRpc3Bvc2VDaGF0OiAoX2NoYXQ6IFVSSSk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0Ly8gQ29kZXggaGFzIG5vIGFkZGl0aW9uYWwgKHBlZXIpIGNoYXRzIHRvIGRpc3Bvc2U7IHRoZVxuXHRcdFx0Ly8gZGVmYXVsdCBjaGF0IGxpdmVzIGFuZCBkaWVzIHdpdGggaXRzIHNlc3Npb24uXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fSxcblx0XHRzZW5kTWVzc2FnZTogKGNoYXQ6IFVSSSwgcHJvbXB0OiBzdHJpbmcsIHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQsIGF0dGFjaG1lbnRzPzogcmVhZG9ubHkgTWVzc2FnZUF0dGFjaG1lbnRbXSwgdHVybklkPzogc3RyaW5nLCBfc2VuZGVyQ2xpZW50SWQ/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9zZW5kTWVzc2FnZShjaGF0LCBwcm9tcHQsIGF0dGFjaG1lbnRzLCB0dXJuSWQsIHdvcmtpbmdEaXJlY3Rvcmllcyk7XG5cdFx0fSxcblx0XHRhYm9ydDogKGNoYXQ6IFVSSSk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2Fib3J0KGNoYXQpO1xuXHRcdH0sXG5cdFx0Y2hhbmdlTW9kZWw6IChjaGF0OiBVUkksIG1vZGVsOiBNb2RlbFNlbGVjdGlvbik6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NoYW5nZU1vZGVsKGNoYXQsIG1vZGVsKTtcblx0XHR9LFxuXHRcdGNoYW5nZUFnZW50OiAoX2NoYXQ6IFVSSSwgX2FnZW50OiBBZ2VudFNlbGVjdGlvbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0Ly8gQ29kZXggZG9lcyBub3Qgc3VwcG9ydCBzZWxlY3RpbmcgYSBjdXN0b20gYWdlbnQuXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fSxcblx0XHRnZXRNZXNzYWdlczogKGNoYXQ6IFVSSSk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRTZXNzaW9uTWVzc2FnZXMoY2hhdCk7XG5cdFx0fSxcblx0fTtcblxuXHRhc3luYyBjcmVhdGVTZXNzaW9uKGNvbmZpZzogSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZyA9IHt9KTogUHJvbWlzZTxJQWdlbnRDcmVhdGVTZXNzaW9uUmVzdWx0PiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXggREVCVUddIGNyZWF0ZVNlc3Npb24gdXNhZ2VTb3VyY2U9JHt0aGlzLl91c2FnZVNvdXJjZX0gYWNjb3VudFN0YXR1cz0ke2NvZGV4QWNjb3VudFN0YXRlRm9yVXNhZ2VTb3VyY2UodGhpcy5fdXNhZ2VTb3VyY2UsIHRoaXMuX29wZW5BSUFjY291bnRTdGF0ZSkuc3RhdHVzfSBzZXNzaW9uPSR7Y29uZmlnLnNlc3Npb24/LnRvU3RyaW5nKCkgPz8gJyhub25lKSd9IG1vZGVsPSR7Y29uZmlnLm1vZGVsPy5pZCA/PyAnKG5vbmUpJ30gY3dkPSR7Y29uZmlnLndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdPy50b1N0cmluZygpID8/ICcobm9uZSknfWApO1xuXHRcdGxldCB2YWxpZGF0aW9uID0gdGhpcy5fdXNhZ2VTb3VyY2VWYWxpZGF0aW9uO1xuXHRcdGF3YWl0IHZhbGlkYXRpb247XG5cdFx0d2hpbGUgKHZhbGlkYXRpb24gIT09IHRoaXMuX3VzYWdlU291cmNlVmFsaWRhdGlvbikge1xuXHRcdFx0dmFsaWRhdGlvbiA9IHRoaXMuX3VzYWdlU291cmNlVmFsaWRhdGlvbjtcblx0XHRcdGF3YWl0IHZhbGlkYXRpb247XG5cdFx0fVxuXHRcdHRoaXMuX2Vuc3VyZUF1dGhlbnRpY2F0ZWQoKTtcblx0XHRpZiAoY29uZmlnLmZvcmspIHtcblx0XHRcdHJldHVybiB0aGlzLl9mb3JrU2Vzc2lvbihjb25maWcsIGNvbmZpZy5mb3JrKTtcblx0XHR9XG5cdFx0Ly8gQ29kZXggcmVxdWlyZXMgYSB3b3JraW5nIGRpcmVjdG9yeSB0byBzdGFydCBhIHRocmVhZCwgYnV0IHRoZSBjbGllbnRcblx0XHQvLyBtYXkgbm90IGhhdmUgb25lIHRvIGdpdmUgKGUuZy4gYW4gZWRpdG9yIHdpbmRvdyB3aXRoIG5vIHdvcmtzcGFjZVxuXHRcdC8vIGZvbGRlciBvcGVuKS4gUmF0aGVyIHRoYW4gcmVqZWN0IHNlc3Npb24gY3JlYXRpb24gXHUyMDE0IHdoaWNoIHdvdWxkIGJyZWFrXG5cdFx0Ly8gYm90aCB0aGUgc2Vzc2lvbiBhbmQgdGhlIGZpcnN0LXVzZSBTREsgZG93bmxvYWQgcHJvZ3Jlc3Mgbm90aWZpY2F0aW9uXG5cdFx0Ly8gdGhhdCBrZXlzIG9mZiBhIHN1Y2Nlc3NmdWwgYGNyZWF0ZVNlc3Npb25gIFx1MjAxNCBkZWZlcjogYSBtYW5hZ2VkIHRlbXBcblx0XHQvLyBmb2xkZXIgaXMgY3JlYXRlZCBsYXppbHkgYXQgbWF0ZXJpYWxpemUgdGltZSAoc2VlIGBfbWF0ZXJpYWxpemVgKS5cblxuXHRcdC8vIFByb3Zpc2lvbmFsIC8gbGF6eSBtYXRlcmlhbGl6ZS4gV2UgRE9OJ1QgY2FsbCBgdGhyZWFkL3N0YXJ0YCBoZXJlXG5cdFx0Ly8gYmVjYXVzZSB0aGUgd29ya2JlbmNoIG1heSByZWJpbmQgdGhpcyBVUkkgdG8gYSBmcmVzaCBvbmUgd2hlbiB0aGVcblx0XHQvLyB1c2VyIGNoYW5nZXMgYSBjaGlwIHNlbGVjdGlvbiwgYW5kIHdlJ2Qgb3RoZXJ3aXNlIGxlYWsgYW5cblx0XHQvLyBvcnBoYW4gY29kZXggdGhyZWFkIHBlciByZWJpbmQuIFRoZSBhY3R1YWwgYHRocmVhZC9zdGFydGAgaGFwcGVuc1xuXHRcdC8vIG9uIHRoZSBmaXJzdCBgc2VuZE1lc3NhZ2VgIChvciBgZ2V0U2Vzc2lvbk1ldGFkYXRhYCBmb3IgcmVzdG9yZSkuXG5cdFx0Y29uc3QgZWZmZWN0aXZlTW9kZWwgPSB0aGlzLl9zdXBwb3J0ZWRNb2RlbE9yVW5kZWZpbmVkKGNvbmZpZy5tb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gY29uZmlnLnNlc3Npb24gPyBBZ2VudFNlc3Npb24uaWQoY29uZmlnLnNlc3Npb24pIDogZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGNvbmZpZy5zZXNzaW9uID8/IEFnZW50U2Vzc2lvbi51cmkodGhpcy5pZCwgc2Vzc2lvbklkKTtcblx0XHRjb25zdCBtdWx0aVJvb3RFbmFibGVkID0gdGhpcy5faXNNdWx0aVJvb3RFbmFibGVkKCk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yaWVzID0gbXVsdGlSb290RW5hYmxlZCAmJiAoY29uZmlnLndvcmtpbmdEaXJlY3Rvcmllcz8ubGVuZ3RoID8/IDApID4gMVxuXHRcdFx0PyBkaXN0aW5jdFdvcmtpbmdEaXJlY3Rvcmllcyhjb25maWcud29ya2luZ0RpcmVjdG9yaWVzKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHQvLyBJZiB0aGUgd29ya2JlbmNoIGlzIHJlYmluZGluZyB0aGlzIFVSSSAoY3JlYXRlU2Vzc2lvbiBhcnJpdmluZ1xuXHRcdC8vIGFmdGVyIGEgcHJldmlvdXMgZGlzcG9zZSBmb3IgdGhlIHNhbWUgaWQpLCByZXVzZSB0aGUgZXhpc3Rpbmdcblx0XHQvLyBlbnRyeSBzbyB3ZSBkb24ndCBsb3NlIGFjY3VtdWxhdGVkIHN0YXRlLlxuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRleGlzdGluZy5tb2RlbCA9IGVmZmVjdGl2ZU1vZGVsID8/IGV4aXN0aW5nLm1vZGVsO1xuXHRcdFx0Y29uc3QgY3dkID0gZXhpc3Rpbmcud29ya2luZ0RpcmVjdG9yeSA/PyBjb25maWcud29ya2luZ0RpcmVjdG9yaWVzPy5bMF07XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzZXNzaW9uOiBzZXNzaW9uVXJpLFxuXHRcdFx0XHRyZXNvbHZlZFdvcmtpbmdEaXJlY3Rvcnk6IGN3ZCxcblx0XHRcdFx0cHJvdmlzaW9uYWw6IGV4aXN0aW5nLnRocmVhZElkID09PSB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGNsaWVudFRvb2xTZXQgPSBuZXcgQWN0aXZlQ2xpZW50VG9vbFNldCgpO1xuXHRcdGNvbnN0IHNlc3Npb246IElDb2RleFNlc3Npb24gPSB7XG5cdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHR0aHJlYWRJZDogdW5kZWZpbmVkLFxuXHRcdFx0c2Vzc2lvblVyaSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IGNvbmZpZy53b3JraW5nRGlyZWN0b3JpZXM/LlswXSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHRcdG11bHRpUm9vdEVuYWJsZWQsXG5cdFx0XHRtYW5hZ2VkV29ya2luZ0RpcmVjdG9yeTogdW5kZWZpbmVkLFxuXHRcdFx0bWFwU3RhdGU6IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKG5ldyBTZXQodGhpcy5fc2VydmVyVG9vbEhvc3Q/LnRvb2xOYW1lcyA/PyBbXSksIGNsaWVudFRvb2xTZXQpLFxuXHRcdFx0cGVuZGluZ0NvbW1hbmRBcHByb3ZhbHM6IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PENvbW1hbmRFeGVjdXRpb25BcHByb3ZhbERlY2lzaW9uPigpLFxuXHRcdFx0YWNjZXB0ZWRGb3JTZXNzaW9uOiBuZXcgU2V0PHN0cmluZz4oKSxcblx0XHRcdGhhbmRsZWRHdWFyZGlhblJldmlld3M6IG5ldyBTZXQ8c3RyaW5nPigpLFxuXHRcdFx0cGVuZGluZ0d1YXJkaWFuUmV2aWV3Q2FyZHM6IG5ldyBTZXQ8c3RyaW5nPigpLFxuXHRcdFx0cGVuZGluZ1N0ZWVyaW5nRmxpcHM6IG5ldyBNYXA8c3RyaW5nLCBQZW5kaW5nTWVzc2FnZT4oKSxcblx0XHRcdGNsaWVudFRvb2xTZXQsXG5cdFx0XHRwZW5kaW5nQ2xpZW50VG9vbENhbGxzOiBuZXcgUGVuZGluZ1JlcXVlc3RSZWdpc3RyeTxUb29sQ2FsbFJlc3VsdD4oKSxcblx0XHRcdHBlbmRpbmdVc2VySW5wdXRzOiBuZXcgUGVuZGluZ1JlcXVlc3RSZWdpc3RyeTxJQ29kZXhVc2VySW5wdXRSZXN1bHQ+KCksXG5cdFx0XHRtYXRlcmlhbGl6ZWRUb29sc1NpZzogdW5kZWZpbmVkLFxuXHRcdFx0bWF0ZXJpYWxpemVkTWNwU2lnOiB1bmRlZmluZWQsXG5cdFx0XHRmaXJzdFR1cm5TZW50OiBmYWxzZSxcblx0XHRcdG1vZGVsOiBlZmZlY3RpdmVNb2RlbCxcblx0XHRcdGN1cnJlbnRUdXJuSWQ6IHVuZGVmaW5lZCxcblx0XHRcdHR1cm5TdG9wV2F0Y2g6IHVuZGVmaW5lZCxcblx0XHRcdGN1cnJlbnRBcHBUdXJuSWQ6IHVuZGVmaW5lZCxcblx0XHRcdGhvc3RUdXJuSWRCeUFwcFR1cm5JZDogbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKSxcblx0XHRcdGNvZGV4VHVybklkQnlIb3N0VHVybklkOiBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpLFxuXHRcdFx0bmVlZHNSZXN1bWU6IGZhbHNlLFxuXHRcdFx0bGFzdFByb21wdFRleHQ6ICcnLFxuXHRcdFx0ZGlzcG9zZWQ6IGZhbHNlLFxuXHRcdFx0bWF0ZXJpYWxpemVQcm9taXNlOiB1bmRlZmluZWQsXG5cdFx0XHRtYXRlcmlhbGl6ZWRFdmVudEZpcmVkOiBmYWxzZSxcblx0XHRcdHByZXdhcm1UaW1lcjogdW5kZWZpbmVkLFxuXHRcdFx0cHJld2FybUNsYWltZWQ6IGZhbHNlLFxuXHRcdFx0c2VydmVyVG9vbHNBZHZlcnRpc2VkOiBmYWxzZSxcblx0XHRcdG1jcENvbnRyb2xsZXI6IHVuZGVmaW5lZCxcblx0XHRcdGNsaWVudEN1c3RvbWl6YXRpb25zOiBuZXcgQ29kZXhDbGllbnRDdXN0b21pemF0aW9uU3RvcmUoKSxcblx0XHR9O1xuXHRcdHRoaXMuX3Nlc3Npb25zLnNldChzZXNzaW9uSWQsIHNlc3Npb24pO1xuXHRcdHRoaXMuX3NjaGVkdWxlUHJld2FybShzZXNzaW9uKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2Vzc2lvbjogc2Vzc2lvblVyaSxcblx0XHRcdHJlc29sdmVkV29ya2luZ0RpcmVjdG9yeTogY29uZmlnLndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdLFxuXHRcdFx0cHJvdmlzaW9uYWw6IHRydWUsXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZCBhbiB7QGxpbmsgSUNvZGV4U2Vzc2lvbn0gZW50cnkgZm9yIGEgdGhyZWFkIHRoYXQgYWxyZWFkeSBleGlzdHMgb25cblx0ICogdGhlIGFwcC1zZXJ2ZXIgKGEgcmVzdG9yZWQgc2Vzc2lvbiBvciBhIGZyZXNobHkgZm9ya2VkIG9uZSkuIFN1Y2ggYVxuXHQgKiBzZXNzaW9uIHNraXBzIG1hdGVyaWFsaXphdGlvbiBcdTIwMTQgaXRzIGZpcnN0IHtAbGluayBfc2VuZE1lc3NhZ2V9IGlzc3VlcyBhXG5cdCAqIGB0aHJlYWQvcmVzdW1lYCAoYG5lZWRzUmVzdW1lOiB0cnVlYCkgXHUyMDE0IHNvIHRoZSBwcmV3YXJtL2ZpcnN0LXR1cm4gZmxhZ3Ncblx0ICogYXJlIHByZS1zZXQgdG8gdGhlaXIgcG9zdC1tYXRlcmlhbGl6YXRpb24gdmFsdWVzLlxuXHQgKi9cblx0cHJpdmF0ZSBfY3JlYXRlUmVzdW1lZFNlc3Npb25FbnRyeShzZXNzaW9uSWQ6IHN0cmluZywgdGhyZWFkSWQ6IHN0cmluZywgc2Vzc2lvblVyaTogVVJJLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsIG1vZGVsOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCwgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW10sIG11bHRpUm9vdEVuYWJsZWQ/OiBib29sZWFuKTogSUNvZGV4U2Vzc2lvbiB7XG5cdFx0Y29uc3QgY2xpZW50VG9vbFNldCA9IG5ldyBBY3RpdmVDbGllbnRUb29sU2V0KCk7XG5cdFx0Y29uc3QgZWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yaWVzID0gZGlzdGluY3RXb3JraW5nRGlyZWN0b3JpZXMod29ya2luZ0RpcmVjdG9yaWVzKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0dGhyZWFkSWQsXG5cdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogZWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdFx0bXVsdGlSb290RW5hYmxlZDogbXVsdGlSb290RW5hYmxlZCA/PyAoZWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yaWVzPy5sZW5ndGggPz8gMCkgPiAxLFxuXHRcdFx0bWFuYWdlZFdvcmtpbmdEaXJlY3Rvcnk6IHVuZGVmaW5lZCxcblx0XHRcdG1hcFN0YXRlOiBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZShuZXcgU2V0KHRoaXMuX3NlcnZlclRvb2xIb3N0Py50b29sTmFtZXMgPz8gW10pLCBjbGllbnRUb29sU2V0KSxcblx0XHRcdHBlbmRpbmdDb21tYW5kQXBwcm92YWxzOiBuZXcgUGVuZGluZ1JlcXVlc3RSZWdpc3RyeTxDb21tYW5kRXhlY3V0aW9uQXBwcm92YWxEZWNpc2lvbj4oKSxcblx0XHRcdGFjY2VwdGVkRm9yU2Vzc2lvbjogbmV3IFNldDxzdHJpbmc+KCksXG5cdFx0XHRoYW5kbGVkR3VhcmRpYW5SZXZpZXdzOiBuZXcgU2V0PHN0cmluZz4oKSxcblx0XHRcdHBlbmRpbmdHdWFyZGlhblJldmlld0NhcmRzOiBuZXcgU2V0PHN0cmluZz4oKSxcblx0XHRcdHBlbmRpbmdTdGVlcmluZ0ZsaXBzOiBuZXcgTWFwPHN0cmluZywgUGVuZGluZ01lc3NhZ2U+KCksXG5cdFx0XHRjbGllbnRUb29sU2V0LFxuXHRcdFx0cGVuZGluZ0NsaWVudFRvb2xDYWxsczogbmV3IFBlbmRpbmdSZXF1ZXN0UmVnaXN0cnk8VG9vbENhbGxSZXN1bHQ+KCksXG5cdFx0XHRwZW5kaW5nVXNlcklucHV0czogbmV3IFBlbmRpbmdSZXF1ZXN0UmVnaXN0cnk8SUNvZGV4VXNlcklucHV0UmVzdWx0PigpLFxuXHRcdFx0bWF0ZXJpYWxpemVkVG9vbHNTaWc6IHVuZGVmaW5lZCxcblx0XHRcdG1hdGVyaWFsaXplZE1jcFNpZzogdW5kZWZpbmVkLFxuXHRcdFx0Zmlyc3RUdXJuU2VudDogdHJ1ZSxcblx0XHRcdG1vZGVsLFxuXHRcdFx0Y3VycmVudFR1cm5JZDogdW5kZWZpbmVkLFxuXHRcdFx0dHVyblN0b3BXYXRjaDogdW5kZWZpbmVkLFxuXHRcdFx0Y3VycmVudEFwcFR1cm5JZDogdW5kZWZpbmVkLFxuXHRcdFx0aG9zdFR1cm5JZEJ5QXBwVHVybklkOiBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpLFxuXHRcdFx0Y29kZXhUdXJuSWRCeUhvc3RUdXJuSWQ6IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCksXG5cdFx0XHRuZWVkc1Jlc3VtZTogdHJ1ZSxcblx0XHRcdGxhc3RQcm9tcHRUZXh0OiAnJyxcblx0XHRcdGRpc3Bvc2VkOiBmYWxzZSxcblx0XHRcdG1hdGVyaWFsaXplUHJvbWlzZTogdW5kZWZpbmVkLFxuXHRcdFx0bWF0ZXJpYWxpemVkRXZlbnRGaXJlZDogdHJ1ZSxcblx0XHRcdHByZXdhcm1UaW1lcjogdW5kZWZpbmVkLFxuXHRcdFx0cHJld2FybUNsYWltZWQ6IHRydWUsXG5cdFx0XHRzZXJ2ZXJUb29sc0FkdmVydGlzZWQ6IGZhbHNlLFxuXHRcdFx0bWNwQ29udHJvbGxlcjogdW5kZWZpbmVkLFxuXHRcdFx0Y2xpZW50Q3VzdG9taXphdGlvbnM6IG5ldyBDb2RleENsaWVudEN1c3RvbWl6YXRpb25TdG9yZSgpLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogRm9yayBhbiBleGlzdGluZyBjb2RleCBzZXNzaW9uIGF0IGEgdHVybiBpbnRvIGEgYnJhbmQtbmV3IHNlc3Npb24uXG5cdCAqXG5cdCAqIENvZGV4IGlzIHNpbmdsZS1jaGF0LCBzbyB0aGUgd29ya2JlbmNoIHJvdXRlcyB0aGUgXCJmb3JrIGNvbnZlcnNhdGlvblwiXG5cdCAqIGdlc3R1cmUgaGVyZSAodmlhIHtAbGluayBBZ2VudEhvc3RTZXNzaW9uSGFuZGxlcn0pIGluc3RlYWQgb2YgbWludGluZyBhXG5cdCAqIHBlZXIgY2hhdC4gV2UgYHRocmVhZC9mb3JrYCB0aGUgc291cmNlIHRocmVhZCBcdTIwMTQgd2hpY2ggY29waWVzIGl0cyBmdWxsXG5cdCAqIGhpc3RvcnkgXHUyMDE0IHRoZW4gYHRocmVhZC9yb2xsYmFja2AgdGhlIHRyYWlsaW5nIHR1cm5zIHNvIHRoZSBmb3JrIHJldGFpbnNcblx0ICogb25seSB0aGUgdHVybnMgdXAgdG8gYW5kIGluY2x1ZGluZyBgZm9yay50dXJuSWRgLiBUaGUgZm9ya2VkIHRocmVhZCBpc1xuXHQgKiByZWdpc3RlcmVkIGFzIGEgcmVzdW1hYmxlIHNlc3Npb24gKGl0cyBmaXJzdCBzZW5kIGlzc3VlcyBhXG5cdCAqIGB0aHJlYWQvcmVzdW1lYCkga2V5ZWQgYnkgaXRzIG5ldyB0aHJlYWQgaWQsIHByZXNlcnZpbmcgdGhlIENvZGV4XG5cdCAqIGNvbnZlbnRpb24gdGhhdCBhIHNlc3Npb24gaWQgZXF1YWxzIGl0cyB0aHJlYWQgaWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9mb3JrU2Vzc2lvbihjb25maWc6IElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcsIGZvcms6IE5vbk51bGxhYmxlPElBZ2VudENyZWF0ZVNlc3Npb25Db25maWdbJ2ZvcmsnXT4pOiBQcm9taXNlPElBZ2VudENyZWF0ZVNlc3Npb25SZXN1bHQ+IHtcblx0XHRjb25zdCBzb3VyY2VSZWFkID0gYXdhaXQgdGhpcy5fcmVhZFNlc3Npb24oZm9yay5zZXNzaW9uKTtcblx0XHRpZiAoIXNvdXJjZVJlYWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGZvcmsgY29kZXggc2Vzc2lvbiAke2Zvcmsuc2Vzc2lvbi50b1N0cmluZygpfTogc291cmNlIHRocmVhZCBjb3VsZCBub3QgYmUgcmVhZGApO1xuXHRcdH1cblx0XHRjb25zdCBzb3VyY2VUaHJlYWRJZCA9IHNvdXJjZVJlYWQudGhyZWFkLmlkO1xuXHRcdGNvbnN0IHNvdXJjZVR1cm5zID0gc291cmNlUmVhZC50aHJlYWQudHVybnMgPz8gW107XG5cdFx0Y29uc3Qgc291cmNlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChBZ2VudFNlc3Npb24uaWQoZm9yay5zZXNzaW9uKSk7XG5cdFx0Y29uc3Qgc291cmNlUHJpbWFyeSA9IHNvdXJjZVJlYWQudGhyZWFkLmN3ZCA/IFVSSS5maWxlKHNvdXJjZVJlYWQudGhyZWFkLmN3ZCkgOiBjb25maWcud29ya2luZ0RpcmVjdG9yaWVzPy5bMF07XG5cdFx0Y29uc3Qgc291cmNlU3RvcmVkV29ya2luZ0RpcmVjdG9yaWVzID0gc291cmNlU2Vzc2lvbj8ud29ya2luZ0RpcmVjdG9yaWVzID8/IHNvdXJjZVJlYWQucGVyc2lzdGVkV29ya2luZ0RpcmVjdG9yaWVzO1xuXHRcdGNvbnN0IGluaGVyaXRlZFdvcmtpbmdEaXJlY3RvcmllcyA9IHNvdXJjZVByaW1hcnlcblx0XHRcdD8gZGlzdGluY3RXb3JraW5nRGlyZWN0b3JpZXMoW3NvdXJjZVByaW1hcnksIC4uLihzb3VyY2VTdG9yZWRXb3JraW5nRGlyZWN0b3JpZXM/LnNsaWNlKDEpID8/IFtdKV0pXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBtdWx0aVJvb3RFbmFibGVkID0gc291cmNlU2Vzc2lvbj8ubXVsdGlSb290RW5hYmxlZCA/PyAoaW5oZXJpdGVkV29ya2luZ0RpcmVjdG9yaWVzPy5sZW5ndGggPz8gMCkgPiAxO1xuXHRcdGNvbnN0IHJ1bnRpbWVXb3Jrc3BhY2VSb290cyA9IG11bHRpUm9vdEVuYWJsZWQgJiYgaW5oZXJpdGVkV29ya2luZ0RpcmVjdG9yaWVzICYmIGluaGVyaXRlZFdvcmtpbmdEaXJlY3Rvcmllcy5sZW5ndGggPiAxXG5cdFx0XHQ/IGRpc3RpbmN0QWJzb2x1dGVQYXRocyhpbmhlcml0ZWRXb3JraW5nRGlyZWN0b3JpZXMubWFwKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkuZnNQYXRoKSlcblx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gUmVzb2x2ZSBob3cgbWFueSB0cmFpbGluZyB0dXJucyB0byBkcm9wIHNvIHRoZSBmb3JrIGtlZXBzIHR1cm5zIHVwIHRvXG5cdFx0Ly8gYW5kIGluY2x1ZGluZyBgZm9yay50dXJuSWRgLiBBIGxpdmUgc291cmNlIG1hcHMgaG9zdCB0dXJuIGlkcyB0byBjb2RleFxuXHRcdC8vIHR1cm4gaWRzOyBhIHJlc3RvcmVkIHNvdXJjZSBhbHJlYWR5IHVzZXMgY29kZXggaWRzLiBGYWxsIGJhY2sgdG8gdGhlXG5cdFx0Ly8gY2FsbGVyLXN1cHBsaWVkIGB0dXJuSW5kZXhgIHdoZW4gdGhlIGlkIGNhbid0IGJlIHJlc29sdmVkLlxuXHRcdGNvbnN0IGNvZGV4VHVybklkID0gc291cmNlU2Vzc2lvbj8uY29kZXhUdXJuSWRCeUhvc3RUdXJuSWQuZ2V0KGZvcmsudHVybklkKSA/PyBmb3JrLnR1cm5JZDtcblx0XHQvLyBSZWplY3QgYW4gdW5yZXNvbHZhYmxlIGZvcmsgYm91bmRhcnkgcmF0aGVyIHRoYW4gc2lsZW50bHkga2VlcGluZyB0aGVcblx0XHQvLyBmdWxsIGhpc3Rvcnk6IGlmIG5laXRoZXIgdGhlIG1hcHBlZCBjb2RleCB0dXJuIGlkIG5vciB0aGUgY2FsbGVyJ3Ncblx0XHQvLyBgdHVybkluZGV4YCBsYW5kcyBpbnNpZGUgdGhlIHNvdXJjZSB0dXJucywgYSBgbnVtVHVybnNUb0Ryb3BgIG9mIDAgd291bGRcblx0XHQvLyBicmFuY2ggZnJvbSB0aGUgd3JvbmcgcG9pbnQgKHRoZSB0aXAgaW5zdGVhZCBvZiB0aGUgcmVxdWVzdGVkIHR1cm4pLlxuXHRcdGNvbnN0IGJvdW5kYXJ5ID0gcmVzb2x2ZUZvcmtCb3VuZGFyeShzb3VyY2VUdXJucy5tYXAodCA9PiB0LmlkKSwgY29kZXhUdXJuSWQsIGZvcmsudHVybkluZGV4KTtcblx0XHRpZiAoIWJvdW5kYXJ5LnJlc29sdmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBmb3JrIGNvZGV4IHNlc3Npb24gJHtzb3VyY2VUaHJlYWRJZH06IHVuYWJsZSB0byByZXNvbHZlIGZvcmsgYm91bmRhcnkgZm9yIHR1cm4gJHtmb3JrLnR1cm5JZH0gKHR1cm5JbmRleD0ke2ZvcmsudHVybkluZGV4fSwgdHVybnM9JHtzb3VyY2VUdXJucy5sZW5ndGh9KWApO1xuXHRcdH1cblx0XHRjb25zdCB7IGtlZXBUaHJvdWdoSW5kZXgsIG51bVR1cm5zVG9Ecm9wIH0gPSBib3VuZGFyeTtcblxuXHRcdGNvbnN0IGNvbm4gPSBhd2FpdCB0aGlzLl9lbnN1cmVDb25uZWN0aW9uKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9zdXBwb3J0ZWRNb2RlbE9yVW5kZWZpbmVkKGNvbmZpZy5tb2RlbCk7XG5cdFx0Ly8gSW5oZXJpdCB0aGUgc291cmNlIHNlc3Npb24ncyBlZmZlY3RpdmUgcGVybWlzc2lvbnMgc28gZm9ya2luZyBhblxuXHRcdC8vIGF1dG8tcmV2aWV3IC8gZnVsbC1hY2Nlc3MgLyByZWFkLW9ubHkgc2Vzc2lvbiBkb2Vzbid0IHNpbGVudGx5IHJlc2V0IHRoZVxuXHRcdC8vIGZvcmsgYmFjayB0byB0aGUgRGVmYXVsdCBwcmVzZXQuIEZvcmsgY2FsbGVycyB0eXBpY2FsbHkgcGFzcyBhbiBlbXB0eVxuXHRcdC8vIGBjb25maWcuY29uZmlnYDsgYW55IGV4cGxpY2l0IG92ZXJyaWRlIHRoZXJlIHN0aWxsIHdpbnMuXG5cdFx0Y29uc3Qgc291cmNlQ29uZmlnVmFsdWVzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlcyhmb3JrLnNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgZm9ya0RlZmF1bHRzID0ge1xuXHRcdFx0YXBwcm92YWxQb2xpY3k6IGNvZGV4U2Vzc2lvbkNvbmZpZ0RlZmF1bHRzW0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5BcHByb3ZhbFBvbGljeV0sXG5cdFx0XHRzYW5kYm94TW9kZTogY29kZXhTZXNzaW9uQ29uZmlnRGVmYXVsdHNbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlNhbmRib3hNb2RlXSxcblx0XHR9O1xuXHRcdGNvbnN0IHsgYXBwcm92YWxQb2xpY3ksIHNhbmRib3hNb2RlLCBhcHByb3ZhbHNSZXZpZXdlciB9ID0gcmVzb2x2ZUNvZGV4UGVybWlzc2lvbnMoXG5cdFx0XHRtaWdyYXRlQ29kZXhQZXJtaXNzaW9uVmFsdWVzKHsgLi4uc291cmNlQ29uZmlnVmFsdWVzLCAuLi5jb25maWcuY29uZmlnIH0sIGZvcmtEZWZhdWx0cyksXG5cdFx0XHRmb3JrRGVmYXVsdHMsXG5cdFx0KTtcblx0XHRjb25zdCBmb3JrUmVzdWx0ID0gYXdhaXQgY29ubi5jbGllbnQucmVxdWVzdDwndGhyZWFkL2ZvcmsnLCBUaHJlYWRGb3JrUmVzcG9uc2U+KCd0aHJlYWQvZm9yaycsIHtcblx0XHRcdHRocmVhZElkOiBzb3VyY2VUaHJlYWRJZCxcblx0XHRcdC4uLihydW50aW1lV29ya3NwYWNlUm9vdHM/Lmxlbmd0aCA/IHtcblx0XHRcdFx0Y3dkOiBydW50aW1lV29ya3NwYWNlUm9vdHNbMF0sXG5cdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290cyxcblx0XHRcdH0gOiB7fSksXG5cdFx0XHQuLi4obW9kZWwgPyB7IG1vZGVsOiBtb2RlbC5pZCB9IDoge30pLFxuXHRcdFx0YXBwcm92YWxQb2xpY3ksXG5cdFx0XHRzYW5kYm94OiBzYW5kYm94TW9kZSxcblx0XHRcdGFwcHJvdmFsc1Jldmlld2VyLFxuXHRcdH0pO1xuXHRcdGNvbnN0IG5ld1RocmVhZElkID0gZm9ya1Jlc3VsdC50aHJlYWQuaWQ7XG5cblx0XHQvLyBUaGUgZm9yayBjb3BpZXMgdGhlIGZ1bGwgc291cmNlIGhpc3Rvcnk7IGRyb3AgdGhlIHRyYWlsaW5nIHR1cm5zIHNvXG5cdFx0Ly8gdGhlIG5ldyB0aHJlYWQgZW5kcyBhdCB0aGUgcmVxdWVzdGVkIGZvcmsgcG9pbnQuIEEgZmFpbGVkIHJvbGxiYWNrXG5cdFx0Ly8gd291bGQgbGVhdmUgdGhlIGZvcmsgY2FycnlpbmcgdGhlIHZlcnkgdHVybnMgdGhlIHVzZXIgYXNrZWQgdG8gYnJhbmNoXG5cdFx0Ly8gYXdheSBmcm9tLCBzbyB0cmVhdCBpdCBhcyBhIGhhcmQgZmFpbHVyZTogYXJjaGl2ZSB0aGUgb3JwaGFuZWQgZm9ya1xuXHRcdC8vIGFuZCByZWplY3QgcmF0aGVyIHRoYW4gcmV0dXJuaW5nIGEgc2Vzc2lvbiB3aXRoIHRoZSB3cm9uZyBoaXN0b3J5LlxuXHRcdGlmIChudW1UdXJuc1RvRHJvcCA+IDApIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGNvbm4uY2xpZW50LnJlcXVlc3Q8J3RocmVhZC9yb2xsYmFjayc+KCd0aHJlYWQvcm9sbGJhY2snLCB7IHRocmVhZElkOiBuZXdUaHJlYWRJZCwgbnVtVHVybnM6IG51bVR1cm5zVG9Ecm9wIH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4OiR7bmV3VGhyZWFkSWR9XSBmb3JrIHJvbGxiYWNrIGZhaWxlZCAobnVtVHVybnM9JHtudW1UdXJuc1RvRHJvcH0pOyBkaXNjYXJkaW5nIGZvcms6ICR7bWVzc2FnZX1gKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBjb25uLmNsaWVudC5yZXF1ZXN0PCd0aHJlYWQvYXJjaGl2ZSc+KCd0aHJlYWQvYXJjaGl2ZScsIHsgdGhyZWFkSWQ6IG5ld1RocmVhZElkIH0pO1xuXHRcdFx0XHR9IGNhdGNoIChhcmNoaXZlRXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXg6JHtuZXdUaHJlYWRJZH1dIGZhaWxlZCB0byBhcmNoaXZlIG9ycGhhbmVkIGZvcmsgYWZ0ZXIgcm9sbGJhY2sgZmFpbHVyZTogJHthcmNoaXZlRXJyIGluc3RhbmNlb2YgRXJyb3IgPyBhcmNoaXZlRXJyLm1lc3NhZ2UgOiBTdHJpbmcoYXJjaGl2ZUVycil9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZm9yayBjb2RleCBzZXNzaW9uICR7c291cmNlVGhyZWFkSWR9OiBjb3VsZCBub3Qgcm9sbCBiYWNrIGZvcmtlZCB0aHJlYWQgJHtuZXdUaHJlYWRJZH0gdG8gdGhlIHJlcXVlc3RlZCB0dXJuICgke21lc3NhZ2V9KWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENvZGV4IGNvbnZlbnRpb24gKERlY2lzaW9uIDcpOiBzZXNzaW9uIGlkID09IHRocmVhZCBpZCwgc28gYSByZXN0b3JlXG5cdFx0Ly8gcm91bmQtdHJpcHMgdGhyb3VnaCBgZ2V0U2Vzc2lvbk1ldGFkYXRhYC5cblx0XHRjb25zdCBuZXdTZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSh0aGlzLmlkLCBuZXdUaHJlYWRJZCk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IGZvcmtSZXN1bHQuY3dkXG5cdFx0XHQ/IFVSSS5maWxlKGZvcmtSZXN1bHQuY3dkKVxuXHRcdFx0OiAoc291cmNlUmVhZC50aHJlYWQuY3dkID8gVVJJLmZpbGUoc291cmNlUmVhZC50aHJlYWQuY3dkKSA6IGNvbmZpZy53b3JraW5nRGlyZWN0b3JpZXM/LlswXSk7XG5cdFx0Y29uc3QgZm9ya1dvcmtpbmdEaXJlY3RvcmllcyA9IG11bHRpUm9vdEVuYWJsZWRcblx0XHRcdD8gZGlzdGluY3RXb3JraW5nRGlyZWN0b3JpZXMoXG5cdFx0XHRcdGZvcmtSZXN1bHQucnVudGltZVdvcmtzcGFjZVJvb3RzPy5sZW5ndGhcblx0XHRcdFx0XHQ/IGZvcmtSZXN1bHQucnVudGltZVdvcmtzcGFjZVJvb3RzLm1hcChwYXRoID0+IFVSSS5maWxlKHBhdGgpKVxuXHRcdFx0XHRcdDogaW5oZXJpdGVkV29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdFx0KVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fY3JlYXRlUmVzdW1lZFNlc3Npb25FbnRyeShuZXdUaHJlYWRJZCwgbmV3VGhyZWFkSWQsIG5ld1Nlc3Npb25VcmksIHdvcmtpbmdEaXJlY3RvcnksIG1vZGVsLCBmb3JrV29ya2luZ0RpcmVjdG9yaWVzLCBtdWx0aVJvb3RFbmFibGVkKTtcblx0XHR0aGlzLl9zZXNzaW9ucy5zZXQobmV3VGhyZWFkSWQsIHNlc3Npb24pO1xuXHRcdHRoaXMuX3Nlc3Npb25JZEJ5VGhyZWFkSWQuc2V0KG5ld1RocmVhZElkLCBuZXdUaHJlYWRJZCk7XG5cdFx0Ly8gRm9ya2VkIHRocmVhZHMgc2tpcCBtYXRlcmlhbGl6YXRpb24gKHRoZSB0aHJlYWQgYWxyZWFkeSBleGlzdHMpLCBzb1xuXHRcdC8vIGFkdmVydGlzZSB0aGUgc2VydmVyIHRvb2xzIGhlcmUgZm9yIGNsaWVudC1zaWRlIHBhcml0eS5cblx0XHRpZiAoIXNlc3Npb24uc2VydmVyVG9vbHNBZHZlcnRpc2VkICYmIHRoaXMuX3NlcnZlclRvb2xIb3N0KSB7XG5cdFx0XHRzZXNzaW9uLnNlcnZlclRvb2xzQWR2ZXJ0aXNlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9zZXJ2ZXJUb29sSG9zdC5hZHZlcnRpc2Uoc2Vzc2lvbi5zZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdH1cblx0XHR0aGlzLl9wZXJzaXN0TWF0ZXJpYWxpemVkU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdC8vIFNlZWQgdGhlIGhvc3RcdTIxOTJjb2RleCB0dXJuLWlkIG1hcCBmb3IgdGhlIGNvcGllZCB0dXJucyBzbyBhIGxhdGVyXG5cdFx0Ly8gZWRpdC90cnVuY2F0ZSBvZiBhbiBpbmhlcml0ZWQgdHVybiBjYW4gcmVzb2x2ZSBpdHMgYXBwLXNlcnZlciB0dXJuIGlkLlxuXHRcdC8vIFdpdGhvdXQgdGhpcywgYHRydW5jYXRlU2Vzc2lvbmAgY2FuJ3QgbWFwIHRoZSBob3N0IGlkIGFuZCBza2lwcyB0aGVcblx0XHQvLyByb2xsYmFjay4gYHRocmVhZC9mb3JrYCBtYXkgcmVnZW5lcmF0ZSB0dXJuIGlkcywgc28gcmVhZCB0aGUgZm9ya2VkXG5cdFx0Ly8gdGhyZWFkJ3MgYXV0aG9yaXRhdGl2ZSBrZXB0IHR1cm5zIGFuZCBwYWlyIHRoZW0sIGluIG9yZGVyLCB3aXRoIHRoZSBuZXdcblx0XHQvLyBob3N0IHR1cm4gaWRzIGZyb20gYGZvcmsudHVybklkTWFwcGluZ2AuIEJlc3QtZWZmb3J0OiBhIGZhaWxlZCByZWFkIGp1c3Rcblx0XHQvLyBsZWF2ZXMgdGhlIG1hcCB1bnNlZWRlZCAoc2FtZSBhcyBiZWZvcmUpLCBuZXZlciBibG9ja2luZyB0aGUgZm9yay5cblx0XHRpZiAoZm9yay50dXJuSWRNYXBwaW5nICYmIGZvcmsudHVybklkTWFwcGluZy5zaXplID4gMCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZm9ya2VkUmVhZCA9IGF3YWl0IHRoaXMuX3JlYWRTZXNzaW9uKG5ld1Nlc3Npb25VcmkpO1xuXHRcdFx0XHRjb25zdCBmb3JrZWRUdXJucyA9IGZvcmtlZFJlYWQ/LnRocmVhZC50dXJucyA/PyBbXTtcblx0XHRcdFx0Y29uc3QgZW50cmllcyA9IHBsYW5Gb3JrZWRUdXJuSWRNYXAoXG5cdFx0XHRcdFx0c291cmNlVHVybnMubWFwKHQgPT4gdC5pZCksXG5cdFx0XHRcdFx0Zm9ya2VkVHVybnMubWFwKHQgPT4gdC5pZCksXG5cdFx0XHRcdFx0a2VlcFRocm91Z2hJbmRleCxcblx0XHRcdFx0XHRzb3VyY2VTZXNzaW9uPy5ob3N0VHVybklkQnlBcHBUdXJuSWQsXG5cdFx0XHRcdFx0Zm9yay50dXJuSWRNYXBwaW5nLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtob3N0VHVybklkLCBmb3JrZWRDb2RleFR1cm5JZF0gb2YgZW50cmllcykge1xuXHRcdFx0XHRcdHNlc3Npb24uY29kZXhUdXJuSWRCeUhvc3RUdXJuSWQuc2V0KGhvc3RUdXJuSWQsIGZvcmtlZENvZGV4VHVybklkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4OiR7bmV3VGhyZWFkSWR9XSBmYWlsZWQgdG8gc2VlZCBmb3JrZWQgdHVybi1pZCBtYXA6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSBmb3JrZWQgc2Vzc2lvbiAke3NvdXJjZVRocmVhZElkfSBcdTIxOTIgJHtuZXdUaHJlYWRJZH0gKGtlcHQgJHtzb3VyY2VUdXJucy5sZW5ndGggLSBudW1UdXJuc1RvRHJvcH0vJHtzb3VyY2VUdXJucy5sZW5ndGh9IHR1cm5zKWApO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXNzaW9uOiBuZXdTZXNzaW9uVXJpLFxuXHRcdFx0cmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5OiB3b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0cHJvdmlzaW9uYWw6IGZhbHNlLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogTGF6aWx5IHN0YXJ0IChvciByZXN1bWUpIGEgY29kZXggdGhyZWFkIGZvciBgc2Vzc2lvbmAuIElkZW1wb3RlbnQ6XG5cdCAqIGlmIGB0aHJlYWRJZGAgaXMgYWxyZWFkeSBwb3B1bGF0ZWQsIGp1c3QgcmV0dXJucy4gQ2FsbGVkIGZyb21cblx0ICogYHNlbmRNZXNzYWdlYCBiZWZvcmUgdGhlIGZpcnN0IGB0dXJuL3N0YXJ0YC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX21hdGVyaWFsaXplSWZOZWVkZWQoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgZmlyZU1hdGVyaWFsaXplZEV2ZW50ID0gdHJ1ZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChzZXNzaW9uLmRpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChzZXNzaW9uLnRocmVhZElkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmIChmaXJlTWF0ZXJpYWxpemVkRXZlbnQpIHtcblx0XHRcdFx0dGhpcy5fZmlyZU1hdGVyaWFsaXplZChzZXNzaW9uKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHNlc3Npb24ubWF0ZXJpYWxpemVQcm9taXNlKSB7XG5cdFx0XHRhd2FpdCBzZXNzaW9uLm1hdGVyaWFsaXplUHJvbWlzZTtcblx0XHRcdGlmIChmaXJlTWF0ZXJpYWxpemVkRXZlbnQpIHtcblx0XHRcdFx0dGhpcy5fZmlyZU1hdGVyaWFsaXplZChzZXNzaW9uKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0c2Vzc2lvbi5tYXRlcmlhbGl6ZVByb21pc2UgPSB0aGlzLl9tYXRlcmlhbGl6ZShzZXNzaW9uKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdHNlc3Npb24ubWF0ZXJpYWxpemVQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHRcdGF3YWl0IHNlc3Npb24ubWF0ZXJpYWxpemVQcm9taXNlO1xuXHRcdGlmIChmaXJlTWF0ZXJpYWxpemVkRXZlbnQpIHtcblx0XHRcdHRoaXMuX2ZpcmVNYXRlcmlhbGl6ZWQoc2Vzc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbWF0ZXJpYWxpemUoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChzZXNzaW9uLmRpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghc2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHQvLyBObyB3b3JraW5nIGRpcmVjdG9yeSB3YXMgc3VwcGxpZWQgKGUuZy4gYW4gZWRpdG9yIHdpbmRvdyB3aXRoIG5vXG5cdFx0XHQvLyB3b3Jrc3BhY2UgZm9sZGVyIG9wZW4pLiBDb2RleCByZXF1aXJlcyBvbmUsIHNvIGNyZWF0ZSBhIG1hbmFnZWRcblx0XHRcdC8vIHBlci1zZXNzaW9uIHRlbXAgZm9sZGVyIGFuZCByZW1lbWJlciBpdCBmb3IgY2xlYW51cCBvbiBkaXNwb3NlLlxuXHRcdFx0Y29uc3QgZGlyID0gam9pbihvcy50bXBkaXIoKSwgJ3ZzY29kZS1hZ2VudC1jb2RleCcsIHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRcdGF3YWl0IGZzLnByb21pc2VzLm1rZGlyKGRpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRzZXNzaW9uLndvcmtpbmdEaXJlY3RvcnkgPSBVUkkuZmlsZShkaXIpO1xuXHRcdFx0c2Vzc2lvbi5tYW5hZ2VkV29ya2luZ0RpcmVjdG9yeSA9IHNlc3Npb24ud29ya2luZ0RpcmVjdG9yeTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSBubyB3b3JraW5nIGRpcmVjdG9yeSBzdXBwbGllZCBmb3Igc2Vzc2lvbj0ke3Nlc3Npb24uc2Vzc2lvblVyaS50b1N0cmluZygpfTsgdXNpbmcgbWFuYWdlZCB0ZW1wIGZvbGRlciAke2Rpcn1gKTtcblx0XHR9XG5cdFx0Y29uc3QgY29ubiA9IGF3YWl0IHRoaXMuX2Vuc3VyZUNvbm5lY3Rpb24oKTtcblx0XHRjb25zdCBjb25maWcgPSB0aGlzLl9yZWFkU2Vzc2lvbkNvbmZpZyhzZXNzaW9uKTtcblx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVNb2RlbChzZXNzaW9uKTtcblx0XHRjb25zdCB7IGFwcHJvdmFsUG9saWN5LCBzYW5kYm94TW9kZSwgYXBwcm92YWxzUmV2aWV3ZXIgfSA9IHRoaXMuX3Jlc29sdmVTZXNzaW9uUGVybWlzc2lvbnMoc2Vzc2lvbik7XG5cdFx0Ly8gQXR0YWNoIHRoZSBzZXNzaW9uJ3MgTUNQIHNlcnZlcnMgcGVyLXRocmVhZCAodmVyaWZpZWQ6IGNvZGV4IHN0YXJ0c1xuXHRcdC8vIHRoZW0gZm9yIHRoaXMgdGhyZWFkIG9ubHkpOiB0aGUgd29ya2JlbmNoJ3Mgcm9vdCBgbWNwU2VydmVyc2AgY29uZmlnXG5cdFx0Ly8gbWVyZ2VkIHdpdGggdGhpcyBzZXNzaW9uJ3MgZW5hYmxlZCBjbGllbnQtcGx1Z2luIHNlcnZlcnMuIFBhc3NpbmcgdGhlbVxuXHRcdC8vIHBlci10aHJlYWQgbWVhbnMgYSBuZXcgc2Vzc2lvbiBhbHdheXMgcmVmbGVjdHMgdGhlIGN1cnJlbnQgcm9vdCBjb25maWcuXG5cdFx0Y29uc3QgbWNwU2VydmVycyA9IHRoaXMuX2J1aWxkU2Vzc2lvbk1jcFNlcnZlcnMoc2Vzc2lvbik7XG5cdFx0Y29uc3QgdGhyZWFkQ29uZmlnOiBSZWNvcmQ8c3RyaW5nLCBKc29uVmFsdWU+ID0ge1xuXHRcdFx0d2ViX3NlYXJjaDogbmFycm93V2ViU2VhcmNoTW9kZShjb25maWdbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LldlYlNlYXJjaE1vZGVdKSA/PyBjb2RleFNlc3Npb25Db25maWdEZWZhdWx0c1tDb2RleFNlc3Npb25Db25maWdLZXkuV2ViU2VhcmNoTW9kZV0sXG5cdFx0fTtcblx0XHRjb25zdCBtY3BTZXJ2ZXJOYW1lcyA9IE9iamVjdC5rZXlzKG1jcFNlcnZlcnMpO1xuXHRcdGlmIChtY3BTZXJ2ZXJOYW1lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aHJlYWRDb25maWcubWNwX3NlcnZlcnMgPSBtY3BTZXJ2ZXJzIGFzIEpzb25WYWx1ZTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSB0aHJlYWQvc3RhcnQgZm9yIHNlc3Npb249JHtzZXNzaW9uLnNlc3Npb25VcmkudG9TdHJpbmcoKX0gd2l0aCAke21jcFNlcnZlck5hbWVzLmxlbmd0aH0gTUNQIHNlcnZlcihzKTogJHttY3BTZXJ2ZXJOYW1lcy5qb2luKCcsICcpfWApO1xuXHRcdH1cblx0XHRjb25zdCBtdWx0aVJvb3RBY3RpdmUgPSB0aGlzLl9pc011bHRpUm9vdEFjdGl2ZShzZXNzaW9uKTtcblx0XHRjb25zdCBydW50aW1lV29ya3NwYWNlUm9vdHMgPSBtdWx0aVJvb3RBY3RpdmUgPyB0aGlzLl9ydW50aW1lV29ya3NwYWNlUm9vdHMoc2Vzc2lvbikgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc3RhcnRSZXN1bHQgPSBhd2FpdCBjb25uLmNsaWVudC5yZXF1ZXN0PCd0aHJlYWQvc3RhcnQnLCBUaHJlYWRTdGFydFJlc3BvbnNlPigndGhyZWFkL3N0YXJ0Jywge1xuXHRcdFx0Y3dkOiBzZXNzaW9uLndvcmtpbmdEaXJlY3RvcnkuZnNQYXRoLFxuXHRcdFx0Li4uKHJ1bnRpbWVXb3Jrc3BhY2VSb290cz8ubGVuZ3RoID8geyBydW50aW1lV29ya3NwYWNlUm9vdHMgfSA6IHt9KSxcblx0XHRcdG1vZGVsOiBtb2RlbC5pZCxcblx0XHRcdGFwcHJvdmFsUG9saWN5LFxuXHRcdFx0c2FuZGJveDogc2FuZGJveE1vZGUsXG5cdFx0XHRhcHByb3ZhbHNSZXZpZXdlcixcblx0XHRcdGNvbmZpZzogdGhyZWFkQ29uZmlnLFxuXHRcdFx0ZHluYW1pY1Rvb2xzOiB0aGlzLl9idWlsZER5bmFtaWNUb29scyhzZXNzaW9uKSxcblx0XHR9KTtcblx0XHRjb25zdCB0aHJlYWRJZCA9IHN0YXJ0UmVzdWx0LnRocmVhZC5pZDtcblx0XHRpZiAobXVsdGlSb290QWN0aXZlICYmICFzZXNzaW9uLndvcmtpbmdEaXJlY3RvcmllcyAmJiBzdGFydFJlc3VsdC5ydW50aW1lV29ya3NwYWNlUm9vdHM/Lmxlbmd0aCkge1xuXHRcdFx0c2Vzc2lvbi53b3JraW5nRGlyZWN0b3JpZXMgPSBzdGFydFJlc3VsdC5ydW50aW1lV29ya3NwYWNlUm9vdHMubWFwKHBhdGggPT4gVVJJLmZpbGUocGF0aCkpO1xuXHRcdFx0c2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5ID0gc2Vzc2lvbi53b3JraW5nRGlyZWN0b3JpZXNbMF07XG5cdFx0fVxuXHRcdGlmIChzZXNzaW9uLmRpc3Bvc2VkKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBjb25uLmNsaWVudC5yZXF1ZXN0PCd0aHJlYWQvdW5zdWJzY3JpYmUnPigndGhyZWFkL3Vuc3Vic2NyaWJlJywgeyB0aHJlYWRJZCB9KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleDoke3RocmVhZElkfV0gdGhyZWFkL3Vuc3Vic2NyaWJlIGFmdGVyIGRpc3Bvc2VkIHByZXdhcm0gZmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0c2Vzc2lvbi50aHJlYWRJZCA9IHRocmVhZElkO1xuXHRcdHNlc3Npb24ubWF0ZXJpYWxpemVkTWNwU2lnID0gbWNwU2VydmVyc1NpZ25hdHVyZShtY3BTZXJ2ZXJzKTtcblx0XHRzZXNzaW9uLm1hdGVyaWFsaXplZFRvb2xzU2lnID0gdG9vbHNTaWduYXR1cmUoc2Vzc2lvbi5jbGllbnRUb29sU2V0Lm1lcmdlZCgpKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleCBERUJVR10gbWF0ZXJpYWxpemVkIHNlc3Npb249JHtzZXNzaW9uLnNlc3Npb25VcmkudG9TdHJpbmcoKX0gdGhyZWFkSWQ9JHtzZXNzaW9uLnRocmVhZElkfWApO1xuXHRcdHRoaXMuX3Nlc3Npb25JZEJ5VGhyZWFkSWQuc2V0KHNlc3Npb24udGhyZWFkSWQsIHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHQvLyBBZHZlcnRpc2UgdGhlIGFnZW50IGhvc3QncyBzZXJ2ZXIgdG9vbHMgb24gdGhpcyBzZXNzaW9uIHNvIGNsaWVudHMgc2VlXG5cdFx0Ly8gdGhlbSBhcyBzZXJ2ZXItcHJvdmlkZWQuIEV4ZWN1dGlvbiBoYXBwZW5zIGluLXByb2Nlc3MgdmlhXG5cdFx0Ly8gYF9oYW5kbGVEeW5hbWljVG9vbENhbGxScGNgOyB0aGUgdG9vbHMgd2VyZSByZWdpc3RlcmVkIHdpdGggY29kZXggaW5cblx0XHQvLyB0aGUgYGR5bmFtaWNUb29sc2Agb2YgdGhlIGB0aHJlYWQvc3RhcnRgIGFib3ZlLlxuXHRcdGlmICghc2Vzc2lvbi5zZXJ2ZXJUb29sc0FkdmVydGlzZWQgJiYgdGhpcy5fc2VydmVyVG9vbEhvc3QpIHtcblx0XHRcdHNlc3Npb24uc2VydmVyVG9vbHNBZHZlcnRpc2VkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3NlcnZlclRvb2xIb3N0LmFkdmVydGlzZShzZXNzaW9uLnNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0fVxuXHRcdC8vIFN1cmZhY2UgdGhlIHNraWxscy9ob29rcyBjb2RleCBsb2FkZWQgZm9yIHRoaXMgd29ya2luZyBkaXJlY3RvcnkgKGZyb21cblx0XHQvLyBgLmFnZW50c2AvYC5jb2RleGApIGluIHRoZSBDdXN0b21pemF0aW9ucyB2aWV3IG5vdyB0aGF0IHRoZSBjb25uZWN0aW9uXG5cdFx0Ly8gaXMgcmVhZHkgYW5kIHRoZSBjd2QgaXMga25vd24uIEJlc3QtZWZmb3J0IGFuZCBmaXJlLWFuZC1mb3JnZXQuXG5cdFx0dm9pZCB0aGlzLl9yZWZyZXNoU2tpbGxIb29rQ3VzdG9taXphdGlvbnMoc2Vzc2lvbik7XG5cdFx0Ly8gUmUtYXBwbHkgdGhlIGNsaWVudC1wbHVnaW4gc2tpbGwgcm9vdHMgYWdhaW5zdCB0aGUgbm93LXJlYWR5XG5cdFx0Ly8gY29ubmVjdGlvbiAodGhleSBtYXkgaGF2ZSBiZWVuIHN5bmNlZCBiZWZvcmUgaXQgY2FtZSB1cCkuXG5cdFx0dm9pZCB0aGlzLl9yZWZyZXNoU2tpbGxFeHRyYVJvb3RzKCk7XG5cdH1cblxuXHQvKipcblx0ICogVGVhciBkb3duIHRoZSBjdXJyZW50IGNvZGV4IHRocmVhZCBhbmQgc3RhcnQgYSBmcmVzaCBvbmUgc28gdGhlXG5cdCAqIHNlc3Npb24ncyBjdXJyZW50IGNsaWVudCB0b29scyBhcmUgcmVnaXN0ZXJlZCBhcyBgZHluYW1pY1Rvb2xzYC5cblx0ICogT25seSBzYWZlIGJlZm9yZSBhbnkgdHVybiBoYXMgY29tbWl0dGVkIGhpc3Rvcnkgb24gdGhlIHRocmVhZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc3RhcnRUaHJlYWRXaXRoQ3VycmVudFRvb2xzKHNlc3Npb246IElDb2RleFNlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25uID0gdGhpcy5fY29ubmVjdGlvbjtcblx0XHRjb25zdCBvbGRUaHJlYWRJZCA9IHNlc3Npb24udGhyZWFkSWQ7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXg6JHtzZXNzaW9uLnNlc3Npb25JZH1dIHJlc3RhcnRpbmcgdGhyZWFkICR7b2xkVGhyZWFkSWR9IHRvIGFwcGx5IGNsaWVudCB0b29scyBbJHtzZXNzaW9uLmNsaWVudFRvb2xTZXQubWVyZ2VkKCkubWFwKHQgPT4gdC5uYW1lKS5qb2luKCcsICcpIHx8ICcobm9uZSknfV1gKTtcblx0XHRpZiAoY29ubi5raW5kID09PSAncmVhZHknICYmIG9sZFRocmVhZElkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25JZEJ5VGhyZWFkSWQuZGVsZXRlKG9sZFRocmVhZElkKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGNvbm4uY2xpZW50LnJlcXVlc3Q8J3RocmVhZC91bnN1YnNjcmliZSc+KCd0aHJlYWQvdW5zdWJzY3JpYmUnLCB7IHRocmVhZElkOiBvbGRUaHJlYWRJZCB9KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleDoke29sZFRocmVhZElkfV0gdGhyZWFkL3Vuc3Vic2NyaWJlIGR1cmluZyB0b29sIHJlc3RhcnQgZmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0c2Vzc2lvbi50aHJlYWRJZCA9IHVuZGVmaW5lZDtcblx0XHRzZXNzaW9uLm1hdGVyaWFsaXplUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRhd2FpdCB0aGlzLl9tYXRlcmlhbGl6ZUlmTmVlZGVkKHNlc3Npb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmlyZU1hdGVyaWFsaXplZChzZXNzaW9uOiBJQ29kZXhTZXNzaW9uKTogdm9pZCB7XG5cdFx0aWYgKHNlc3Npb24uZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHNlc3Npb24ubWF0ZXJpYWxpemVkRXZlbnRGaXJlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzZXNzaW9uLm1hdGVyaWFsaXplZEV2ZW50RmlyZWQgPSB0cnVlO1xuXHRcdC8vIEVtaXQgdGhlIHJlc29sdmVkIHNldCAoaW5kZXggMCA9IHByb2Nlc3Mgcm9vdCk7IHRoZSBob3N0IHByZXNlcnZlcyB0aGVcblx0XHQvLyBzZXNzaW9uIHNldCdzIHRhaWwgdmlhIGFuIGluZGV4LTAgcmVwbGFjZW1lbnQuXG5cdFx0dGhpcy5fb25EaWRNYXRlcmlhbGl6ZVNlc3Npb24uZmlyZSh7XG5cdFx0XHRzZXNzaW9uOiBzZXNzaW9uLnNlc3Npb25VcmksXG5cdFx0XHRwcm9qZWN0OiB1bmRlZmluZWQsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IHNlc3Npb24ud29ya2luZ0RpcmVjdG9yaWVzID8/IChzZXNzaW9uLndvcmtpbmdEaXJlY3RvcnkgPyBbc2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5XSA6IHVuZGVmaW5lZCksXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zY2hlZHVsZVByZXdhcm0oc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IHZvaWQge1xuXHRcdGlmICghc2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIERlZmVyIHByZXdhcm0gd2hpbGUgdGhlIGhvc3QgaGFzIG5vdCBmaW5hbGl6ZWQgdGhlIHdvcmtpbmcgZGlyZWN0b3J5XG5cdFx0Ly8gKGEgZnJlc2ggd29ya3RyZWUgc2Vzc2lvbiB3aG9zZSB3b3JrdHJlZSBpcyBjcmVhdGVkIG9uIHRoZSBmaXJzdCBzZW5kKS5cblx0XHQvLyBQcmV3YXJtaW5nIHdvdWxkIG90aGVyd2lzZSBtYXRlcmlhbGl6ZSBhIHRocmVhZCBpbiB0aGUgcGlja2VkIGZvbGRlclxuXHRcdC8vIGJlZm9yZSB0aGUgd29ya3RyZWUgZXhpc3RzLlxuXHRcdGlmICh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5pc1dvcmtpbmdEaXJlY3RvcnlQZW5kaW5nKHNlc3Npb24uc2Vzc2lvblVyaS50b1N0cmluZygpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR2b2lkIChhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBQcmV3YXJtIGlzIGEgYmFja2dyb3VuZCBsYXRlbmN5IG9wdGltaXphdGlvbiwgbm90IGEgdXNlciBhY3Rpb24sXG5cdFx0XHQvLyBzbyBpdCBtdXN0IE5PVCB0cmlnZ2VyIGEgY29sZCBTREsgZG93bmxvYWQuIFdoZW4gdGhlIFNESyBpc24ndFxuXHRcdFx0Ly8gbG9jYWwgeWV0LCBza2lwIHByZXdhcm07IHRoZSBmaXJzdCBgc2VuZE1lc3NhZ2VgIG1hdGVyaWFsaXplcyB0aGVcblx0XHRcdC8vIHRocmVhZCBhbmQgZmlyZXMgdGhlIChob3N0LWxldmVsIHByb2dyZXNzLXJlcG9ydGVkKSBkb3dubG9hZCB0aGVuLlxuXHRcdFx0aWYgKCEoYXdhaXQgdGhpcy5fYWdlbnRTZGtEb3dubG9hZGVyLmlzU2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZChDb2RleFNka1BhY2thZ2UpKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gU0RLIG5vdCBkb3dubG9hZGVkIHlldDsgc2tpcHBpbmcgcHJld2FybSBmb3Igc2Vzc2lvbj0ke3Nlc3Npb24uc2Vzc2lvblVyaS50b1N0cmluZygpfSB1bnRpbCBhIG1lc3NhZ2UgdHJpZ2dlcnMgdGhlIGRvd25sb2FkYCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX21hdGVyaWFsaXplSWZOZWVkZWQoc2Vzc2lvbiwgZmFsc2UpO1xuXHRcdFx0aWYgKHNlc3Npb24ucHJld2FybUNsYWltZWQgfHwgc2Vzc2lvbi50aHJlYWRJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSBwcmV3YXJtIHJlYWR5IHNlc3Npb249JHtzZXNzaW9uLnNlc3Npb25VcmkudG9TdHJpbmcoKX0gdGhyZWFkSWQ9JHtzZXNzaW9uLnRocmVhZElkfWApO1xuXHRcdFx0Y29uc3QgcHJld2FybVRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHZvaWQgdGhpcy5fZXhwaXJlUHJld2FybShzZXNzaW9uKTtcblx0XHRcdH0sIENvZGV4UHJld2FybVR0bE1zKTtcblx0XHRcdHNlc3Npb24ucHJld2FybVRpbWVyID0gcHJld2FybVRpbWVyO1xuXHRcdH0pKCkuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSBwcmV3YXJtIGZhaWxlZCBzZXNzaW9uPSR7c2Vzc2lvbi5zZXNzaW9uVXJpLnRvU3RyaW5nKCl9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2V4cGlyZVByZXdhcm0oc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChzZXNzaW9uLmRpc3Bvc2VkIHx8IHNlc3Npb24ucHJld2FybUNsYWltZWQgfHwgc2Vzc2lvbi50aHJlYWRJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRocmVhZElkID0gc2Vzc2lvbi50aHJlYWRJZDtcblx0XHRzZXNzaW9uLnRocmVhZElkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3Nlc3Npb25JZEJ5VGhyZWFkSWQuZGVsZXRlKHRocmVhZElkKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29ubiA9IGF3YWl0IHRoaXMuX2Vuc3VyZUNvbm5lY3Rpb24oKTtcblx0XHRcdGF3YWl0IGNvbm4uY2xpZW50LnJlcXVlc3Q8J3RocmVhZC91bnN1YnNjcmliZSc+KCd0aHJlYWQvdW5zdWJzY3JpYmUnLCB7IHRocmVhZElkIH0pO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIHByZXdhcm0gVFRMIGV2aWN0aW9uIHNlc3Npb249JHtzZXNzaW9uLnNlc3Npb25VcmkudG9TdHJpbmcoKX0gdGhyZWFkSWQ9JHt0aHJlYWRJZH1gKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSBwcmV3YXJtIFRUTCBldmljdGlvbiBmYWlsZWQgc2Vzc2lvbj0ke3Nlc3Npb24uc2Vzc2lvblVyaS50b1N0cmluZygpfSB0aHJlYWRJZD0ke3RocmVhZElkfTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcGVyc2lzdE1hdGVyaWFsaXplZFNlc3Npb24oc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IHZvaWQge1xuXHRcdGlmIChzZXNzaW9uLmRpc3Bvc2VkIHx8ICFzZXNzaW9uLnRocmVhZElkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFBlcnNpc3Qgb25seSBvbmNlIHRoZSBwcmV3YXJtZWQgdGhyZWFkIGlzIGNsYWltZWQgYnkgYSB0dXJuLiBUaGlzXG5cdFx0Ly8gYXZvaWRzIHJlc3RvcmluZyBhbiBleHBpcmVkLCBuZXZlci11c2VkIHByZXdhcm0gYXMgYSBsaXZlIHNlc3Npb24uXG5cdFx0Y29uc3QgbXVsdGlSb290QWN0aXZlID0gdGhpcy5faXNNdWx0aVJvb3RBY3RpdmUoc2Vzc2lvbik7XG5cdFx0Y29uc3QgZmllbGRzID0ge1xuXHRcdFx0dGhyZWFkSWQ6IHNlc3Npb24udGhyZWFkSWQsXG5cdFx0XHRjd2Q6IHNlc3Npb24ud29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdG1vZGVsSWQ6IHNlc3Npb24ubW9kZWw/LmlkLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBtdWx0aVJvb3RBY3RpdmUgPyBzZXNzaW9uLndvcmtpbmdEaXJlY3RvcmllcyA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdHZvaWQgdGhpcy5fbWV0YWRhdGFTdG9yZS53cml0ZShzZXNzaW9uLnNlc3Npb25VcmksIGZpZWxkcyk7XG5cdFx0aWYgKG11bHRpUm9vdEFjdGl2ZSkge1xuXHRcdFx0Y29uc3QgY2Fub25pY2FsU2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkodGhpcy5pZCwgc2Vzc2lvbi50aHJlYWRJZCk7XG5cdFx0XHRpZiAoIWlzRXF1YWwoc2Vzc2lvbi5zZXNzaW9uVXJpLCBjYW5vbmljYWxTZXNzaW9uVXJpKSkge1xuXHRcdFx0XHR2b2lkIHRoaXMuX21ldGFkYXRhU3RvcmUud3JpdGUoY2Fub25pY2FsU2Vzc2lvblVyaSwgZmllbGRzKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jbGFpbVByZXdhcm0oc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IHZvaWQge1xuXHRcdHNlc3Npb24ucHJld2FybUNsYWltZWQgPSB0cnVlO1xuXHRcdGlmIChzZXNzaW9uLnByZXdhcm1UaW1lcikge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHNlc3Npb24ucHJld2FybVRpbWVyKTtcblx0XHRcdHNlc3Npb24ucHJld2FybVRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Fkb3B0V29ya2luZ0RpcmVjdG9yeUJlZm9yZVNlbmQoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF3b3JraW5nRGlyZWN0b3J5IHx8IGlzRXF1YWwoc2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5LCB3b3JraW5nRGlyZWN0b3J5KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbi5wcmV3YXJtQ2xhaW1lZCkge1xuXHRcdFx0aWYgKHNlc3Npb24udGhyZWFkSWQgPT09IHVuZGVmaW5lZCAmJiAhc2Vzc2lvbi5tYXRlcmlhbGl6ZVByb21pc2UpIHtcblx0XHRcdFx0c2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5ID0gd29ya2luZ0RpcmVjdG9yeTtcblx0XHRcdFx0aWYgKHRoaXMuX2lzTXVsdGlSb290QWN0aXZlKHNlc3Npb24pKSB7XG5cdFx0XHRcdFx0c2Vzc2lvbi53b3JraW5nRGlyZWN0b3JpZXMgPSBkaXN0aW5jdFdvcmtpbmdEaXJlY3RvcmllcyhbXG5cdFx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0XHRcdFx0Li4uKHNlc3Npb24ud29ya2luZ0RpcmVjdG9yaWVzPy5zbGljZSgxKSA/PyBbXSksXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jbGFpbVByZXdhcm0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgbWF0ZXJpYWxpemVQcm9taXNlID0gc2Vzc2lvbi5tYXRlcmlhbGl6ZVByb21pc2U7XG5cdFx0aWYgKG1hdGVyaWFsaXplUHJvbWlzZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgbWF0ZXJpYWxpemVQcm9taXNlO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSBzdGFsZSBwcmV3YXJtIGZhaWxlZCBiZWZvcmUgd29ya2luZyBkaXJlY3RvcnkgY2hhbmdlZCBmb3Igc2Vzc2lvbj0ke3Nlc3Npb24uc2Vzc2lvblVyaS50b1N0cmluZygpfTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGhyZWFkSWQgPSBzZXNzaW9uLnRocmVhZElkO1xuXHRcdGlmICh0aHJlYWRJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRzZXNzaW9uLnRocmVhZElkID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbklkQnlUaHJlYWRJZC5kZWxldGUodGhyZWFkSWQpO1xuXHRcdFx0Y29uc3QgY29ubiA9IHRoaXMuX2Nvbm5lY3Rpb247XG5cdFx0XHRpZiAoY29ubi5raW5kID09PSAncmVhZHknKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgY29ubi5jbGllbnQucmVxdWVzdDwndGhyZWFkL3Vuc3Vic2NyaWJlJz4oJ3RocmVhZC91bnN1YnNjcmliZScsIHsgdGhyZWFkSWQgfSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSBzdGFsZSBwcmV3YXJtIHVuc3Vic2NyaWJlIGZhaWxlZCBzZXNzaW9uPSR7c2Vzc2lvbi5zZXNzaW9uVXJpLnRvU3RyaW5nKCl9IHRocmVhZElkPSR7dGhyZWFkSWR9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRzZXNzaW9uLndvcmtpbmdEaXJlY3RvcnkgPSB3b3JraW5nRGlyZWN0b3J5O1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RhcnRUdXJuU3RvcFdhdGNoKHNlc3Npb246IElDb2RleFNlc3Npb24pOiBTdG9wV2F0Y2gge1xuXHRcdGNvbnN0IHN0b3BXYXRjaCA9IFN0b3BXYXRjaC5jcmVhdGUoZmFsc2UpO1xuXHRcdHNlc3Npb24udHVyblN0b3BXYXRjaCA9IHN0b3BXYXRjaDtcblx0XHRyZXR1cm4gc3RvcFdhdGNoO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJUdXJuU3RvcFdhdGNoKHNlc3Npb246IElDb2RleFNlc3Npb24pOiBudW1iZXIge1xuXHRcdGNvbnN0IGVsYXBzZWQgPSBzZXNzaW9uLnR1cm5TdG9wV2F0Y2g/LmVsYXBzZWQoKTtcblx0XHRzZXNzaW9uLnR1cm5TdG9wV2F0Y2ggPSB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHR5cGVvZiBlbGFwc2VkID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUoZWxhcHNlZCkgPyBNYXRoLm1heCgwLCBlbGFwc2VkKSA6IDA7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZW5kTWVzc2FnZShjaGF0OiBVUkksIHByb21wdDogc3RyaW5nLCBhdHRhY2htZW50cz86IHJlYWRvbmx5IE1lc3NhZ2VBdHRhY2htZW50W10sIHR1cm5JZD86IHN0cmluZywgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gdGhpcy5fc2Vzc2lvblVyaUZyb21DaGF0KGNoYXQpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4IERFQlVHXSBzZW5kTWVzc2FnZSBzZXNzaW9uPSR7c2Vzc2lvblVyaS50b1N0cmluZygpfSBwcm9tcHQ9JHtKU09OLnN0cmluZ2lmeShwcm9tcHQpLnNsaWNlKDAsIDYwKX1gKTtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDb2RleCBzZXNzaW9uIG5vdCBmb3VuZDogJHtzZXNzaW9uVXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHRcdC8vIFRoZSBob3N0IGhhbmRzIHVzIHRoZSByZXNvbHZlZCB3b3JraW5nIGRpcmVjdG9yaWVzIChpbmRleCAwID0gdGhlIHByb2Nlc3Ncblx0XHQvLyByb290KSBvbiB0aGUgZmlyc3Qgc2VuZDsgYWRvcHQgaW5kZXggMCBhcyB0aGUgY29kZXggc3VicHJvY2VzcyBjd2QgYmVmb3JlXG5cdFx0Ly8gbWF0ZXJpYWxpemUgbG9ja3MgaXQuIFRoZSBhZ2VudCBzdGF5cyB1bmF3YXJlIG9mIHdvcmt0cmVlcy5cblx0XHRhd2FpdCB0aGlzLl9hZG9wdFdvcmtpbmdEaXJlY3RvcnlCZWZvcmVTZW5kKHNlc3Npb24sIHdvcmtpbmdEaXJlY3Rvcmllcz8uWzBdKTtcblx0XHQvLyBSZWNvcmQgdGhlIGZ1bGwgc2V0IGZvciB0aGUgbWF0ZXJpYWxpemF0aW9uIHJlY2VpcHQgT1VUU0lERSB0aGUgYWRvcHRpb25cblx0XHQvLyBwYXRoOiBhIHByZXdhcm0gbWF5IGhhdmUgYWxyZWFkeSBtYXRlcmlhbGl6ZWQgdGhlIHRocmVhZCwgeWV0IHRoZSByZWNlaXB0XG5cdFx0Ly8gaXMgZmlyZWQgb24gdGhpcyBmaXJzdCBzZW5kIGFuZCBtdXN0IHN0aWxsIGNhcnJ5IHRoZSByZXNvbHZlZCBzZXQuIE9ubHlcblx0XHQvLyBhc3NpZ24gd2hlbiB0aGUgc2VuZCBzdXBwbGllZCBvbmUsIHNvIHRoZSByZXN1bWUgcGF0aCBrZWVwcyBlbWl0dGluZyB0aGVcblx0XHQvLyBzaW5ndWxhciB3b3JraW5nIGRpcmVjdG9yeS5cblx0XHRpZiAod29ya2luZ0RpcmVjdG9yaWVzKSB7XG5cdFx0XHRzZXNzaW9uLndvcmtpbmdEaXJlY3RvcmllcyA9IHNlc3Npb24ubXVsdGlSb290RW5hYmxlZCAmJiB3b3JraW5nRGlyZWN0b3JpZXMubGVuZ3RoID4gMVxuXHRcdFx0XHQ/IGRpc3RpbmN0V29ya2luZ0RpcmVjdG9yaWVzKFtcblx0XHRcdFx0XHRzZXNzaW9uLndvcmtpbmdEaXJlY3RvcnkgPz8gd29ya2luZ0RpcmVjdG9yaWVzWzBdLFxuXHRcdFx0XHRcdC4uLndvcmtpbmdEaXJlY3Rvcmllcy5zbGljZSgxKSxcblx0XHRcdFx0XSlcblx0XHRcdFx0OiB3b3JraW5nRGlyZWN0b3JpZXM7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbm4gPSBhd2FpdCB0aGlzLl9lbnN1cmVDb25uZWN0aW9uKCk7XG5cdFx0Y29uc3QgZWZmZWN0aXZlVHVybklkID0gdHVybklkID8/IGdlbmVyYXRlVXVpZCgpO1xuXG5cdFx0Ly8gTWF0ZXJpYWxpemUgY29kZXggdGhyZWFkIG9uIGZpcnN0IHNlbmQgKHByb3Zpc2lvbmFsIFx1MjE5MiBsaXZlKS5cblx0XHQvLyBgX21hdGVyaWFsaXplSWZOZWVkZWRgIGlzIGlkZW1wb3RlbnQuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2NsYWltUHJld2FybShzZXNzaW9uKTtcblx0XHRcdGF3YWl0IHRoaXMuX21hdGVyaWFsaXplSWZOZWVkZWQoc2Vzc2lvbik7XG5cdFx0XHR0aGlzLl9wZXJzaXN0TWF0ZXJpYWxpemVkU2Vzc2lvbihzZXNzaW9uKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQ29kZXg6JHtzZXNzaW9uSWR9XSBtYXRlcmlhbGl6ZSBmYWlsZWQ6ICR7bWVzc2FnZX1gKTtcblx0XHRcdGNvbnN0IGR1cmF0aW9uID0gdGhpcy5fY2xlYXJUdXJuU3RvcFdhdGNoKHNlc3Npb24pO1xuXHRcdFx0dGhpcy5fZmlyZShzZXNzaW9uVXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdEVycm9yLFxuXHRcdFx0XHR0dXJuSWQ6IGVmZmVjdGl2ZVR1cm5JZCxcblx0XHRcdFx0ZHVyYXRpb24sXG5cdFx0XHRcdGVycm9yOiB7IGVycm9yVHlwZTogJ0NvZGV4TWF0ZXJpYWxpemVGYWlsZWQnLCBtZXNzYWdlIH0sXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogZWZmZWN0aXZlVHVybklkLCBkdXJhdGlvbiB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQ29kZXggcmVnaXN0ZXJzIGNsaWVudCB0b29scyBhbmQgTUNQIHNlcnZlcnMgb25seSBhdCBgdGhyZWFkL3N0YXJ0YC5cblx0XHQvLyBJZiB0aGUgdGhyZWFkIHdhcyBwcmV3YXJtZWQgKG9yIG90aGVyd2lzZSBzdGFydGVkKSBiZWZvcmUgdGhlIGN1cnJlbnRcblx0XHQvLyBjbGllbnQgdG9vbHMgLyBNQ1Agc2VydmVycyB3ZXJlIGtub3duLCByZXN0YXJ0IGl0IG5vdyBcdTIwMTQgYmVmb3JlIGFueVxuXHRcdC8vIHR1cm4gY29tbWl0cyBoaXN0b3J5LCBzbyBub3RoaW5nIGlzIGxvc3QgXHUyMDE0IHNvIHRoZSB0b29scyBsYW5kIGluXG5cdFx0Ly8gYGR5bmFtaWNUb29sc2AgYW5kIHRoZSBzZXJ2ZXJzIGluIGBjb25maWcubWNwX3NlcnZlcnNgLlxuXHRcdGNvbnN0IHRvb2xzQ2hhbmdlZCA9IHRvb2xzU2lnbmF0dXJlKHNlc3Npb24uY2xpZW50VG9vbFNldC5tZXJnZWQoKSkgIT09IHNlc3Npb24ubWF0ZXJpYWxpemVkVG9vbHNTaWc7XG5cdFx0Y29uc3QgbWNwQ2hhbmdlZCA9IG1jcFNlcnZlcnNTaWduYXR1cmUodGhpcy5fYnVpbGRTZXNzaW9uTWNwU2VydmVycyhzZXNzaW9uKSkgIT09IHNlc3Npb24ubWF0ZXJpYWxpemVkTWNwU2lnO1xuXHRcdGlmICghc2Vzc2lvbi5maXJzdFR1cm5TZW50ICYmICFzZXNzaW9uLm5lZWRzUmVzdW1lICYmICh0b29sc0NoYW5nZWQgfHwgbWNwQ2hhbmdlZCkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Jlc3RhcnRUaHJlYWRXaXRoQ3VycmVudFRvb2xzKHNlc3Npb24pO1xuXHRcdFx0XHR0aGlzLl9wZXJzaXN0TWF0ZXJpYWxpemVkU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQ29kZXg6JHtzZXNzaW9uSWR9XSB0b29sIHJlLW1hdGVyaWFsaXplIGZhaWxlZDogJHttZXNzYWdlfWApO1xuXHRcdFx0XHRjb25zdCBkdXJhdGlvbiA9IHRoaXMuX2NsZWFyVHVyblN0b3BXYXRjaChzZXNzaW9uKTtcblx0XHRcdFx0dGhpcy5fZmlyZShzZXNzaW9uVXJpLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0RXJyb3IsXG5cdFx0XHRcdFx0dHVybklkOiBlZmZlY3RpdmVUdXJuSWQsXG5cdFx0XHRcdFx0ZHVyYXRpb24sXG5cdFx0XHRcdFx0ZXJyb3I6IHsgZXJyb3JUeXBlOiAnQ29kZXhNYXRlcmlhbGl6ZUZhaWxlZCcsIG1lc3NhZ2UgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogZWZmZWN0aXZlVHVybklkLCBkdXJhdGlvbiB9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCB0aHJlYWRJZCA9IHNlc3Npb24udGhyZWFkSWQhO1xuXHRcdGlmIChzZXNzaW9uLm5lZWRzUmVzdW1lKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyBDYXJyeSB0aGUgY3VycmVudCBNQ1Agc2VydmVycyAod2l0aCBhbnkgaW5qZWN0ZWQgYXV0aCB0b2tlbilcblx0XHRcdFx0Ly8gc28gYSByZXN1bWVkIHRocmVhZCByZWNvbm5lY3RzIGF1dGgtZ2F0ZWQgc2VydmVycywgbWF0Y2hpbmdcblx0XHRcdFx0Ly8gdGhlIGNvbmZpZyBhIGZyZXNoIGB0aHJlYWQvc3RhcnRgIHdvdWxkIGFwcGx5LlxuXHRcdFx0XHRjb25zdCBtY3BTZXJ2ZXJzID0gdGhpcy5fYnVpbGRTZXNzaW9uTWNwU2VydmVycyhzZXNzaW9uKTtcblx0XHRcdFx0Y29uc3QgbXVsdGlSb290QWN0aXZlID0gdGhpcy5faXNNdWx0aVJvb3RBY3RpdmUoc2Vzc2lvbik7XG5cdFx0XHRcdGNvbnN0IHJ1bnRpbWVXb3Jrc3BhY2VSb290cyA9IG11bHRpUm9vdEFjdGl2ZSA/IHRoaXMuX3J1bnRpbWVXb3Jrc3BhY2VSb290cyhzZXNzaW9uKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgcmVzdW1lUmVzdWx0ID0gYXdhaXQgY29ubi5jbGllbnQucmVxdWVzdDwndGhyZWFkL3Jlc3VtZScsIFRocmVhZFJlc3VtZVJlc3BvbnNlPihcblx0XHRcdFx0XHQndGhyZWFkL3Jlc3VtZScsXG5cdFx0XHRcdFx0YnVpbGRDb2RleFJlc3VtZVBhcmFtcyh0aGlzLl91c2FnZVNvdXJjZSwgdGhyZWFkSWQsIG1jcFNlcnZlcnMsIHJ1bnRpbWVXb3Jrc3BhY2VSb290cyksXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGlmIChtdWx0aVJvb3RBY3RpdmUgJiYgIXNlc3Npb24ud29ya2luZ0RpcmVjdG9yaWVzICYmIHJlc3VtZVJlc3VsdC5ydW50aW1lV29ya3NwYWNlUm9vdHM/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdHNlc3Npb24ud29ya2luZ0RpcmVjdG9yaWVzID0gcmVzdW1lUmVzdWx0LnJ1bnRpbWVXb3Jrc3BhY2VSb290cy5tYXAocGF0aCA9PiBVUkkuZmlsZShwYXRoKSk7XG5cdFx0XHRcdFx0c2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5ID0gc2Vzc2lvbi53b3JraW5nRGlyZWN0b3JpZXNbMF07XG5cdFx0XHRcdH1cblx0XHRcdFx0c2Vzc2lvbi5tYXRlcmlhbGl6ZWRNY3BTaWcgPSBtY3BTZXJ2ZXJzU2lnbmF0dXJlKG1jcFNlcnZlcnMpO1xuXHRcdFx0XHRzZXNzaW9uLm5lZWRzUmVzdW1lID0gZmFsc2U7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0Y29uc3QgZHVyYXRpb24gPSB0aGlzLl9jbGVhclR1cm5TdG9wV2F0Y2goc2Vzc2lvbik7XG5cdFx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvblVyaSwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdEVycm9yLFxuXHRcdFx0XHRcdHR1cm5JZDogZWZmZWN0aXZlVHVybklkLFxuXHRcdFx0XHRcdGR1cmF0aW9uLFxuXHRcdFx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdFx0XHRlcnJvclR5cGU6ICdDb2RleFJlc3VtZUZhaWxlZCcsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVyciksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogZWZmZWN0aXZlVHVybklkLCBkdXJhdGlvbiB9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHsgaW5wdXQsIGNsZWFudXBQYXRocyB9ID0gcmVzb2x2ZUNvZGV4SW5wdXQocHJvbXB0LCBhdHRhY2htZW50cyk7XG5cdFx0Ly8gQnVmZmVyIHRoZSBwcm9tcHQgdGV4dCBmb3IgYHR1cm4vc3RhcnRlZGAncyB1c2VyTWVzc2FnZSBmYWxsYmFjay5cblx0XHRzZXNzaW9uLmxhc3RQcm9tcHRUZXh0ID0gcHJvbXB0O1xuXHRcdHNlc3Npb24uY3VycmVudFR1cm5JZCA9IGVmZmVjdGl2ZVR1cm5JZDtcblx0XHR0aGlzLl9zdGFydFR1cm5TdG9wV2F0Y2goc2Vzc2lvbik7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5fcmVzb2x2ZU1vZGVsKHNlc3Npb24pO1xuXHRcdFx0Y29uc3QgdHVybk9wdGlvbnMgPSB0aGlzLl90dXJuU3RhcnRPcHRpb25zKHNlc3Npb24sIG1vZGVsLmlkKTtcblx0XHRcdGF3YWl0IGNvbm4uY2xpZW50LnJlcXVlc3Q8J3R1cm4vc3RhcnQnPigndHVybi9zdGFydCcsIHtcblx0XHRcdFx0dGhyZWFkSWQsXG5cdFx0XHRcdGlucHV0OiBpbnB1dC5zbGljZSgpLFxuXHRcdFx0XHRtb2RlbDogbW9kZWwuaWQsXG5cdFx0XHRcdC4uLnR1cm5PcHRpb25zLFxuXHRcdFx0fSk7XG5cdFx0XHQvLyBUaGUgdGhyZWFkIG5vdyBoYXMgY29tbWl0dGVkIGhpc3Rvcnk7IGNsaWVudCB0b29scyBhcmUgbG9ja2VkIHRvXG5cdFx0XHQvLyB3aGF0IHdhcyByZWdpc3RlcmVkIGF0IGB0aHJlYWQvc3RhcnRgIGFuZCB3b24ndCBiZSByZS1hcHBsaWVkLlxuXHRcdFx0c2Vzc2lvbi5maXJzdFR1cm5TZW50ID0gdHJ1ZTtcblx0XHRcdC8vIFdlIGRvbid0IGF3YWl0IHR1cm4gY29tcGxldGlvbiBoZXJlIFx1MjAxNCB0aGUgbm90aWZpY2F0aW9uXG5cdFx0XHQvLyBzdHJlYW0gZW1pdHMgQ2hhdFR1cm5Db21wbGV0ZSBhc3luY2hyb25vdXNseS5cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChlcnIgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcikge1xuXHRcdFx0XHR0aGlzLl9maXJlKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCwgdHVybklkOiBlZmZlY3RpdmVUdXJuSWQsIGR1cmF0aW9uOiB0aGlzLl9jbGVhclR1cm5TdG9wV2F0Y2goc2Vzc2lvbikgfSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQ29kZXg6JHtzZXNzaW9uSWR9XSB0dXJuL3N0YXJ0IGVycm9yOiAke21lc3NhZ2V9YCk7XG5cdFx0XHRjb25zdCBkdXJhdGlvbiA9IHRoaXMuX2NsZWFyVHVyblN0b3BXYXRjaChzZXNzaW9uKTtcblx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvblVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRFcnJvcixcblx0XHRcdFx0dHVybklkOiBlZmZlY3RpdmVUdXJuSWQsXG5cdFx0XHRcdGR1cmF0aW9uLFxuXHRcdFx0XHRlcnJvcjogeyBlcnJvclR5cGU6ICdDb2RleFR1cm5FcnJvcicsIC4uLmV4dHJhY3RGb3J3YXJkZWRFcnJvckluZm8obWVzc2FnZSkgfSxcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fZmlyZShzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiBlZmZlY3RpdmVUdXJuSWQsIGR1cmF0aW9uIH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHQvLyBCZXN0LWVmZm9ydCB0ZW1wLWZpbGUgY2xlYW51cC4gSW1hZ2Utb24tbG9jYWxJbWFnZSB3aWxsIGJlXG5cdFx0XHQvLyByZS1yZWFkIGJ5IGNvZGV4IHN5bmNocm9ub3VzbHkgZHVyaW5nIHRoZSB0dXJuIHNvIHRoaXMgaXNcblx0XHRcdC8vIHNhZmUgdG8gZGVmZXIgc2xpZ2h0bHk7IHdlIGRlbGV0ZSBhZnRlciBhIGdlbmVyb3VzIGdyYWNlLlxuXHRcdFx0aWYgKGNsZWFudXBQYXRocy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcCBvZiBjbGVhbnVwUGF0aHMpIHtcblx0XHRcdFx0XHRcdHRyeSB7IGZzLnVubGlua1N5bmMocCk7IH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgMzBfMDAwKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRzZXRQZW5kaW5nTWVzc2FnZXMoY2hhdDogVVJJLCBzdGVlcmluZ01lc3NhZ2U6IFBlbmRpbmdNZXNzYWdlIHwgdW5kZWZpbmVkLCBfcXVldWVkTWVzc2FnZXM6IHJlYWRvbmx5IFBlbmRpbmdNZXNzYWdlW10pOiB2b2lkIHtcblx0XHQvLyBRdWV1ZWQgbWVzc2FnZXMgYXJlIGNvbnN1bWVkIHNlcnZlci1zaWRlIChBZ2VudFNpZGVFZmZlY3RzIGRyaXZlcyBhXG5cdFx0Ly8gZnJlc2ggdHVybiBwZXIgYGlkbGVgKTsgb25seSB0aGUgc2luZ2xlIHN0ZWVyaW5nIG1lc3NhZ2UgcmVhY2hlcyB0aGVcblx0XHQvLyBhZ2VudCBmb3IgbWlkLXR1cm4gaW5qZWN0aW9uLlxuXHRcdGlmICghc3RlZXJpbmdNZXNzYWdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIENvZGV4IGlzIHNpbmdsZS1jaGF0OiBhIHNlc3Npb24gb3ducyBleGFjdGx5IG9uZSAoZGVmYXVsdCkgY2hhdCwgc29cblx0XHQvLyB0aGUgYWRkcmVzc2VkIGNoYXQgY2hhbm5lbCBhbHdheXMgcmVzb2x2ZXMgdG8gaXRzIG93bmluZyBzZXNzaW9uLlxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSB0aGlzLl9zZXNzaW9uVXJpRnJvbUNoYXQoY2hhdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gYF9zeW5jUGVuZGluZ01lc3NhZ2VzYCByZS1zZW5kcyB0aGUgY3VycmVudCBzdGVlcmluZyBtZXNzYWdlIG9uIGV2ZXJ5XG5cdFx0Ly8gcGVuZGluZy1zdGF0ZSBjaGFuZ2U7IGlnbm9yZSBhIHN0ZWVyaW5nIG1lc3NhZ2UgYWxyZWFkeSBpbiBmbGlnaHQuXG5cdFx0aWYgKHNlc3Npb24ucGVuZGluZ1N0ZWVyaW5nRmxpcHMuaGFzKHN0ZWVyaW5nTWVzc2FnZS5pZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYXBwVHVybklkID0gc2Vzc2lvbi5jdXJyZW50QXBwVHVybklkO1xuXHRcdGNvbnN0IGNvbm4gPSB0aGlzLl9jb25uZWN0aW9uO1xuXHRcdGNvbnN0IHRleHQgPSBzdGVlcmluZ01lc3NhZ2UubWVzc2FnZS50ZXh0O1xuXHRcdGNvbnN0IGhhc0NvbnRlbnQgPSB0ZXh0Lmxlbmd0aCA+IDAgfHwgKHN0ZWVyaW5nTWVzc2FnZS5tZXNzYWdlLmF0dGFjaG1lbnRzPy5sZW5ndGggPz8gMCkgPiAwO1xuXHRcdC8vIFN0ZWVyaW5nIG9ubHkgbWFrZXMgc2Vuc2UgbWlkLXR1cm4uIFdpdGhvdXQgYW4gYWN0aXZlIGNvZGV4IHR1cm4sIGFcblx0XHQvLyByZWFkeSBjb25uZWN0aW9uLCBhIHRocmVhZCwgb3IgYW55IGNvbnRlbnQgd2UgY2Fubm90IHN0ZWVyIFx1MjAxNCBjbGVhclxuXHRcdC8vIHRoZSBwZW5kaW5nIGJ1YmJsZSBzbyBpdCBkb2Vzbid0IHN0aWNrICh0aGUgbW9kZWwgbmV2ZXIgc2F3IGl0KS5cblx0XHRpZiAoIWFwcFR1cm5JZCB8fCBjb25uLmtpbmQgIT09ICdyZWFkeScgfHwgc2Vzc2lvbi50aHJlYWRJZCA9PT0gdW5kZWZpbmVkIHx8ICFoYXNDb250ZW50KSB7XG5cdFx0XHR0aGlzLl9maXJlU3RlZXJpbmdDb25zdW1lZChzZXNzaW9uLCBzdGVlcmluZ01lc3NhZ2UuaWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB7IGlucHV0IH0gPSByZXNvbHZlQ29kZXhJbnB1dCh0ZXh0LCBzdGVlcmluZ01lc3NhZ2UubWVzc2FnZS5hdHRhY2htZW50cyk7XG5cdFx0Y29uc3QgdGhyZWFkSWQgPSBzZXNzaW9uLnRocmVhZElkO1xuXHRcdC8vIEJ1ZmZlciBzbyB0aGUgY29kZXggYHVzZXJNZXNzYWdlYCBlY2hvIGNhbiBwcm9tb3RlIHRoaXMgaW50byBhXG5cdFx0Ly8gdmlzaWJsZSB0dXJuIChzZWUge0BsaW5rIF9oYW5kbGVTdGVlcmVkVXNlck1lc3NhZ2V9KS5cblx0XHRzZXNzaW9uLnBlbmRpbmdTdGVlcmluZ0ZsaXBzLnNldChzdGVlcmluZ01lc3NhZ2UuaWQsIHN0ZWVyaW5nTWVzc2FnZSk7XG5cdFx0dm9pZCBjb25uLmNsaWVudC5yZXF1ZXN0PCd0dXJuL3N0ZWVyJz4oJ3R1cm4vc3RlZXInLCB7XG5cdFx0XHR0aHJlYWRJZCxcblx0XHRcdGlucHV0OiBpbnB1dC5zbGljZSgpLFxuXHRcdFx0ZXhwZWN0ZWRUdXJuSWQ6IGFwcFR1cm5JZCxcblx0XHR9KS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0Ly8gU3RlZXIgcmVqZWN0ZWQgKGNvbW1vbmx5IGFuIGBleHBlY3RlZFR1cm5JZGAgbWlzbWF0Y2ggYmVjYXVzZSB0aGVcblx0XHRcdC8vIHR1cm4ganVzdCBjb21wbGV0ZWQpLiBEcm9wIHRoZSBidWZmZXJlZCBlbnRyeSBhbmQgY2xlYXIgdGhlXG5cdFx0XHQvLyBwZW5kaW5nIGJ1YmJsZSBzbyBpdCBkb2Vzbid0IHN0aWNrLlxuXHRcdFx0aWYgKHNlc3Npb24ucGVuZGluZ1N0ZWVyaW5nRmxpcHMuZGVsZXRlKHN0ZWVyaW5nTWVzc2FnZS5pZCkpIHtcblx0XHRcdFx0dGhpcy5fZmlyZVN0ZWVyaW5nQ29uc3VtZWQoc2Vzc2lvbiwgc3RlZXJpbmdNZXNzYWdlLmlkKTtcblx0XHRcdH1cblx0XHRcdGlmIChlcnIgaW5zdGFuY2VvZiBKc29uUnBjRXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXg6JHtzZXNzaW9uSWR9XSB0dXJuL3N0ZWVyIHNraXBwZWQ6ICR7ZXJyLm1lc3NhZ2V9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4OiR7c2Vzc2lvbklkfV0gdHVybi9zdGVlciBmYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYWJvcnQoY2hhdDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IHRoaXMuX3Nlc3Npb25VcmlGcm9tQ2hhdChjaGF0KTtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBDbGVhciBhbnkgc3RlZXJpbmcgYnVmZmVyZWQgZm9yIHRoZSB0dXJuIHdlJ3JlIGFib3J0aW5nIHNvIGl0c1xuXHRcdC8vIHBlbmRpbmcgYnViYmxlIGRvZXNuJ3Qgb3V0bGl2ZSB0aGUgdHVybi5cblx0XHR0aGlzLl9kcmFpblBlbmRpbmdTdGVlcmluZyhzZXNzaW9uKTtcblx0XHRpZiAoIXNlc3Npb24uY3VycmVudEFwcFR1cm5JZCB8fCBzZXNzaW9uLnRocmVhZElkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGhyZWFkSWQgPSBzZXNzaW9uLnRocmVhZElkO1xuXHRcdGNvbnN0IGNvbm4gPSB0aGlzLl9jb25uZWN0aW9uO1xuXHRcdGlmIChjb25uLmtpbmQgIT09ICdyZWFkeScpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGNvbm4uY2xpZW50LnJlcXVlc3Q8J3R1cm4vaW50ZXJydXB0Jz4oJ3R1cm4vaW50ZXJydXB0Jywge1xuXHRcdFx0XHR0aHJlYWRJZCxcblx0XHRcdFx0dHVybklkOiBzZXNzaW9uLmN1cnJlbnRBcHBUdXJuSWQsXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4OiR7c2Vzc2lvbklkfV0gdHVybi9pbnRlcnJ1cHQgZmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBkaXNwb3NlU2Vzc2lvbihzZXNzaW9uVXJpOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleCBERUJVR10gZGlzcG9zZVNlc3Npb24gc2Vzc2lvbj0ke3Nlc3Npb25VcmkudG9TdHJpbmcoKX1gKTtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl90ZWFyZG93blNlc3Npb25Jbk1lbW9yeShzZXNzaW9uLCBzZXNzaW9uSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE5vbi1kZXN0cnVjdGl2ZSBjb3VudGVycGFydCB0byB7QGxpbmsgZGlzcG9zZVNlc3Npb259OiByZWxlYXNlcyB0aGVcblx0ICogc2Vzc2lvbidzIGluLW1lbW9yeSByZXNvdXJjZXMgYnV0IGtlZXBzIGl0cyBjb2RleCB0aHJlYWQgcmVzdW1hYmxlIFx1MjAxNCB0aGVcblx0ICogb24tZGlzayByb2xsb3V0IGlzIHByZXNlcnZlZCBhbmQgdGhlIHNoYXJlZCBjb2RleCBwcm9jZXNzIHN0YXlzIGFsaXZlLCBzb1xuXHQgKiB0aGUgc2Vzc2lvbiB0cmFuc3BhcmVudGx5IHJlc3VtZXMgb24gdGhlIG5leHQgYWNjZXNzLiBVc2VkIGJ5IGlkbGUtc2Vzc2lvblxuXHQgKiBldmljdGlvbiB0byBib3VuZCBtZW1vcnkgaW4gbG9uZy1saXZlZCBob3N0IHByb2Nlc3Nlcy5cblx0ICpcblx0ICogTm8tb3BzIGZvciBzZXNzaW9ucyB0aGF0IGhhdmUgbm90aGluZyBkdXJhYmxlIHRvIHJlc3VtZSBmcm9tIChwcm92aXNpb25hbFxuXHQgKiBzZXNzaW9ucyB3aG9zZSBjb2RleCB0aHJlYWQgd2FzIG5ldmVyIHN0YXJ0ZWQpIGFuZCBmb3Igc2Vzc2lvbnMgd2l0aCBhXG5cdCAqIHR1cm4gaW4gZmxpZ2h0IFx1MjAxNCBgdGhyZWFkL3Vuc3Vic2NyaWJlYCBtaWQtdHVybiB3b3VsZCBkcm9wIGxpdmUgcHJvZ3Jlc3MuXG5cdCAqL1xuXHRhc3luYyByZWxlYXNlU2Vzc2lvbihzZXNzaW9uVXJpOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBQcm92aXNpb25hbCBzZXNzaW9ucyBoYXZlIG5vIGNvZGV4IHRocmVhZCBvbiBkaXNrIHRvIHJlc3VtZSBmcm9tO1xuXHRcdC8vIHJlbGVhc2luZyB0aGVtIHdvdWxkIGxvc2UgdGhlaXIgaW4tbWVtb3J5IHN0YXRlLiBMZWF2ZSB0aGVtIGluIHBsYWNlLlxuXHRcdGlmIChzZXNzaW9uLnRocmVhZElkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gRGVmZW5zaXZlIGFjdGl2ZS10dXJuIGd1YXJkOiB0aGUgb3JjaGVzdHJhdG9yIGFscmVhZHkgc2tpcHMgZXZpY3Rpb25cblx0XHQvLyB3aGlsZSBhIHR1cm4gaXMgYWN0aXZlLCBidXQgb25lIGNvdWxkIGhhdmUgc3RhcnRlZCBiZXR3ZWVuIHRoYXQgY2hlY2tcblx0XHQvLyBhbmQgdGhpcyBjYWxsLlxuXHRcdGlmIChzZXNzaW9uLmN1cnJlbnRUdXJuSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleDoke3Nlc3Npb24udGhyZWFkSWR9XSBSZWxlYXNpbmcgaWRsZSBzZXNzaW9uIGZyb20gbWVtb3J5IChkdXJhYmxlIHN0YXRlIHByZXNlcnZlZClgKTtcblx0XHRhd2FpdCB0aGlzLl90ZWFyZG93blNlc3Npb25Jbk1lbW9yeShzZXNzaW9uLCBzZXNzaW9uSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNoYXJlZCBpbi1tZW1vcnkgdGVhcmRvd24gZm9yIGEgY29kZXggc2Vzc2lvbjogZHJvcHMgdGhlIHRyYWNrZWQgZW50cnksXG5cdCAqIGRpc3Bvc2VzIGl0cyBNQ1AgY29udHJvbGxlciwgdW5wYXJrcyBwZW5kaW5nIGFwcHJvdmFscyAvIGNsaWVudCB0b29sIGNhbGxzXG5cdCAqIC8gdXNlciBpbnB1dHMsIGFuZCB1bnN1YnNjcmliZXMgdGhlIGNvZGV4IHRocmVhZCAoYHRocmVhZC91bnN1YnNjcmliZWApLlxuXHQgKiBOb24tZGVzdHJ1Y3RpdmUgXHUyMDE0IHRoZSBjb2RleCB0aHJlYWQncyBvbi1kaXNrIHJvbGxvdXQgaXMgcHJlc2VydmVkLCBzbyB0aGVcblx0ICogc2Vzc2lvbiBjYW4gYmUgcmVzdW1lZCBsYXRlci4gU2hhcmVkIGJ5IHtAbGluayBkaXNwb3NlU2Vzc2lvbn0gKHdoaWNoIHRoZVxuXHQgKiBvcmNoZXN0cmF0b3IgcGFpcnMgd2l0aCBkdXJhYmxlIGRlbGV0aW9uKSBhbmQgdGhlIG5vbi1kZXN0cnVjdGl2ZVxuXHQgKiB7QGxpbmsgcmVsZWFzZVNlc3Npb259LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfdGVhcmRvd25TZXNzaW9uSW5NZW1vcnkoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRzZXNzaW9uLmRpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9jbGFpbVByZXdhcm0oc2Vzc2lvbik7XG5cdFx0dGhpcy5fc2Vzc2lvbnMuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0c2Vzc2lvbi5tY3BDb250cm9sbGVyPy5kaXNwb3NlKCk7XG5cdFx0Ly8gSWYgdGhlIHNlc3Npb24gY29udHJpYnV0ZWQgY2xpZW50LXBsdWdpbiBza2lsbHMsIGRyb3AgdGhlbSBmcm9tIHRoZVxuXHRcdC8vIHByb2Nlc3MtZ2xvYmFsIHNraWxsLXJvb3QgdW5pb24gbm93IHRoYXQgaXQgaXMgZ29uZS5cblx0XHRpZiAoIXNlc3Npb24uY2xpZW50Q3VzdG9taXphdGlvbnMuaXNFbXB0eSgpKSB7XG5cdFx0XHR2b2lkIHRoaXMuX3JlZnJlc2hTa2lsbEV4dHJhUm9vdHMoKTtcblx0XHR9XG5cdFx0Ly8gUmVtb3ZlIHRoZSBtYW5hZ2VkIHRlbXAgZm9sZGVyIGNyZWF0ZWQgZm9yIGEgc2Vzc2lvbiB0aGF0IGhhZCBub1xuXHRcdC8vIGNsaWVudC1zdXBwbGllZCB3b3JraW5nIGRpcmVjdG9yeS4gQmVzdC1lZmZvcnQ7IHRoZSBPUyB0ZW1wIGRpciBpc1xuXHRcdC8vIHJlY2xhaW1lZCBhbnl3YXksIGJ1dCBjbGVhbiB1cCBwcm9hY3RpdmVseSBzbyBpdCBkb2Vzbid0IGFjY3VtdWxhdGUuXG5cdFx0aWYgKHNlc3Npb24ubWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdGNvbnN0IGRpciA9IHNlc3Npb24ubWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoO1xuXHRcdFx0ZnMucHJvbWlzZXMucm0oZGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIGZhaWxlZCB0byByZW1vdmUgbWFuYWdlZCB0ZW1wIGZvbGRlciAke2Rpcn06ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGlmIChzZXNzaW9uLnRocmVhZElkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25JZEJ5VGhyZWFkSWQuZGVsZXRlKHNlc3Npb24udGhyZWFkSWQpO1xuXHRcdH1cblx0XHQvLyBVbnBhcmsgYW55IHBlbmRpbmcgYXBwcm92YWxzIHNvIGNvZGV4IGRvZXNuJ3QgZGVhZGxvY2sgd2FpdGluZ1xuXHRcdC8vIG9uIGEgcmVzcG9uc2Ugd2Ugd2lsbCBuZXZlciBkZWxpdmVyLlxuXHRcdHNlc3Npb24ucGVuZGluZ0NvbW1hbmRBcHByb3ZhbHMuZGVueUFsbCgnZGVjbGluZScpO1xuXHRcdC8vIFJlamVjdCBhbnkgaW4tZmxpZ2h0IGNsaWVudCB0b29sIGNhbGxzIHNvIHRoZWlyIGBpdGVtL3Rvb2wvY2FsbGBcblx0XHQvLyBoYW5kbGVycyB1bndpbmQgaW5zdGVhZCBvZiBhd2FpdGluZyBhIHJlc3BvbnNlIHRoYXQgd29uJ3QgYXJyaXZlLlxuXHRcdHNlc3Npb24ucGVuZGluZ0NsaWVudFRvb2xDYWxscy5yZWplY3RBbGwobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdHNlc3Npb24ucGVuZGluZ1VzZXJJbnB1dHMucmVqZWN0QWxsKG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHQvLyBDbGVhciBhbnkgYnVmZmVyZWQgc3RlZXJpbmcgc28gaXRzIHBlbmRpbmcgYnViYmxlIGRvZXNuJ3QgbGVhay5cblx0XHR0aGlzLl9kcmFpblBlbmRpbmdTdGVlcmluZyhzZXNzaW9uKTtcblx0XHQvLyBUZWFyIGRvd24gYW55IGxpdmUgc3ViYWdlbnQgY2hpbGQgdGhyZWFkcyBzcGF3bmVkIGJ5IHRoaXMgc2Vzc2lvbiBzb1xuXHRcdC8vIHRoZWlyIHBhcmtlZCBhcHByb3ZhbHMgdW53aW5kIGFuZCB0aGVpciB0cmFja2luZyBkb2Vzbid0IGxlYWsuIFRoZVxuXHRcdC8vIG9yY2hlc3RyYXRvciBjbG9zZXMgdGhlIHBlZXIgY2hhdHMgYXMgcGFydCBvZiBzZXNzaW9uIHRlYXJkb3duLlxuXHRcdGZvciAoY29uc3QgW2NoaWxkVGhyZWFkSWQsIHN1YmFnZW50XSBvZiB0aGlzLl9zdWJhZ2VudHNCeVRocmVhZElkKSB7XG5cdFx0XHRpZiAoc3ViYWdlbnQucGFyZW50U2Vzc2lvbklkID09PSBzZXNzaW9uSWQpIHtcblx0XHRcdFx0c3ViYWdlbnQuc2Vzc2lvbi5wZW5kaW5nQ29tbWFuZEFwcHJvdmFscy5kZW55QWxsKCdkZWNsaW5lJyk7XG5cdFx0XHRcdHRoaXMuX3N1YmFnZW50c0J5VGhyZWFkSWQuZGVsZXRlKGNoaWxkVGhyZWFkSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBjb25uID0gdGhpcy5fY29ubmVjdGlvbjtcblx0XHRpZiAoY29ubi5raW5kID09PSAncmVhZHknICYmIHNlc3Npb24udGhyZWFkSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgdGhyZWFkSWQgPSBzZXNzaW9uLnRocmVhZElkO1xuXHRcdFx0Ly8gYHRocmVhZC91bnN1YnNjcmliZWAgaXMgdGhlIGNvZGV4LW5hdGl2ZSB3YXkgdG8gcmVsZWFzZSBhXG5cdFx0XHQvLyBzZXNzaW9uLiBDb2RleCBldmljdHMgYWZ0ZXIgaXRzIDMwLW1pbnV0ZSBpZGxlIGdyYWNlLlxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgY29ubi5jbGllbnQucmVxdWVzdDwndGhyZWFkL3Vuc3Vic2NyaWJlJz4oJ3RocmVhZC91bnN1YnNjcmliZScsIHsgdGhyZWFkSWQgfSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXg6JHt0aHJlYWRJZH1dIHRocmVhZC91bnN1YnNjcmliZSBmYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NoYW5nZU1vZGVsKGNoYXQ6IFVSSSwgbW9kZWw6IE1vZGVsU2VsZWN0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IHRoaXMuX3Nlc3Npb25VcmlGcm9tQ2hhdChjaGF0KTtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uVXJpKSk7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdGNvbnN0IHN1cHBvcnRlZCA9IHRoaXMuX3N1cHBvcnRlZE1vZGVsT3JVbmRlZmluZWQobW9kZWwpO1xuXHRcdFx0aWYgKHN1cHBvcnRlZCkge1xuXHRcdFx0XHRzZXNzaW9uLm1vZGVsID0gc3VwcG9ydGVkO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHRydW5jYXRlU2Vzc2lvbihzZXNzaW9uVXJpOiBVUkksIHR1cm5JZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIENvZGV4IHJvbGxzIGJhY2sgYnkgYSBjb3VudCBvZiB0cmFpbGluZyB0dXJucy4gUmVzb2x2ZSBob3cgbWFueSB0dXJuc1xuXHRcdC8vIGZvbGxvdyBgdHVybklkYCAob3IgYWxsIG9mIHRoZW0gd2hlbiBvbWl0dGVkKSBmcm9tIHRoZSBwZXJzaXN0ZWRcblx0XHQvLyB0aHJlYWQsIHdob3NlIHR1cm4gaWRzIG1hdGNoIHRoZSB3b3JrYmVuY2gncyByZXN0b3JlZCB0dXJuIGlkc1xuXHRcdC8vIChzZWUge0BsaW5rIHJlcGxheVRocmVhZFRvVHVybnN9KS4gVW5rbm93biBpZHMgbm8tb3AgdG8gYXZvaWQgZGF0YSBsb3NzLlxuXHRcdGNvbnN0IHJlYWQgPSBhd2FpdCB0aGlzLl9yZWFkU2Vzc2lvbihzZXNzaW9uVXJpKTtcblx0XHRpZiAoIXJlYWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdHVybnMgPSByZWFkLnRocmVhZC50dXJucyA/PyBbXTtcblx0XHRpZiAodHVybnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBudW1UdXJuczogbnVtYmVyO1xuXHRcdGlmICh0dXJuSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0bnVtVHVybnMgPSB0dXJucy5sZW5ndGg7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEEgbGl2ZSBzZXNzaW9uJ3Mgd29ya2JlbmNoIHR1cm4gaWQgbWFwcyB0byBhIGNvZGV4IHR1cm4gaWQ7IGFcblx0XHRcdC8vIHJlc3RvcmVkIHNlc3Npb24gYWxyZWFkeSB1c2VzIGNvZGV4IHR1cm4gaWRzLCBzbyBmYWxsIGJhY2sgdG8gdGhlXG5cdFx0XHQvLyBpZCBhcy1pcyBvbiBhIG1pc3MuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uVXJpKSk7XG5cdFx0XHRjb25zdCBjb2RleFR1cm5JZCA9IHNlc3Npb24/LmNvZGV4VHVybklkQnlIb3N0VHVybklkLmdldCh0dXJuSWQpID8/IHR1cm5JZDtcblx0XHRcdGNvbnN0IGluZGV4ID0gdHVybnMuZmluZEluZGV4KHQgPT4gdC5pZCA9PT0gY29kZXhUdXJuSWQpO1xuXHRcdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gdHJ1bmNhdGVTZXNzaW9uOiB0dXJuSWQgJHt0dXJuSWR9IG5vdCBmb3VuZCBpbiB0aHJlYWQgJHtyZWFkLnRocmVhZC5pZH07IHNraXBwaW5nYCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdG51bVR1cm5zID0gdHVybnMubGVuZ3RoIC0gKGluZGV4ICsgMSk7XG5cdFx0fVxuXHRcdGlmIChudW1UdXJucyA8PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb25uID0gYXdhaXQgdGhpcy5fZW5zdXJlQ29ubmVjdGlvbigpO1xuXHRcdFx0YXdhaXQgY29ubi5jbGllbnQucmVxdWVzdDwndGhyZWFkL3JvbGxiYWNrJz4oJ3RocmVhZC9yb2xsYmFjaycsIHsgdGhyZWFkSWQ6IHJlYWQudGhyZWFkLmlkLCBudW1UdXJucyB9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4OiR7cmVhZC50aHJlYWQuaWR9XSB0aHJlYWQvcm9sbGJhY2sgZmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBvbkFyY2hpdmVkQ2hhbmdlZChzZXNzaW9uVXJpOiBVUkksIGlzQXJjaGl2ZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0aHJlYWRJZCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVUaHJlYWRJZChzZXNzaW9uVXJpKTtcblx0XHRpZiAodGhyZWFkSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb25uID0gdGhpcy5fY29ubmVjdGlvbjtcblx0XHRpZiAoY29ubi5raW5kICE9PSAncmVhZHknKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRpZiAoaXNBcmNoaXZlZCkge1xuXHRcdFx0XHRhd2FpdCBjb25uLmNsaWVudC5yZXF1ZXN0PCd0aHJlYWQvYXJjaGl2ZSc+KCd0aHJlYWQvYXJjaGl2ZScsIHsgdGhyZWFkSWQgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCBjb25uLmNsaWVudC5yZXF1ZXN0PCd0aHJlYWQvdW5hcmNoaXZlJz4oJ3RocmVhZC91bmFyY2hpdmUnLCB7IHRocmVhZElkIH0pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXg6JHt0aHJlYWRJZH1dIHRocmVhZC8ke2lzQXJjaGl2ZWQgPyAnYXJjaGl2ZScgOiAndW5hcmNoaXZlJ30gZmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHR9XG5cdH1cblxuXHQvKiogUmVzb2x2ZSB0aGUgY29kZXggdGhyZWFkIGlkIGZvciBhIHNlc3Npb246IGluLW1lbW9yeSBcdTIxOTIgcGVyc2lzdGVkIG92ZXJsYXkuICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVUaHJlYWRJZChzZXNzaW9uVXJpOiBVUkkpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uVXJpKSk7XG5cdFx0aWYgKGV4aXN0aW5nPy50aHJlYWRJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3RpbmcudGhyZWFkSWQ7XG5cdFx0fVxuXHRcdGNvbnN0IG92ZXJsYXkgPSBhd2FpdCB0aGlzLl9tZXRhZGF0YVN0b3JlLnJlYWQoc2Vzc2lvblVyaSk7XG5cdFx0cmV0dXJuIG92ZXJsYXkudGhyZWFkSWQ7XG5cdH1cblxuXHRyZXNwb25kVG9QZXJtaXNzaW9uUmVxdWVzdChyZXF1ZXN0SWQ6IHN0cmluZywgYXBwcm92ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHQvLyBgcmVxdWVzdElkYCBpcyB0aGUgaG9zdC1zaWRlIHRvb2xDYWxsSWQ7IGl0ZXJhdGUgc2Vzc2lvbnMgKGluY2x1ZGluZ1xuXHRcdC8vIGxpdmUgc3ViYWdlbnQgY2hpbGQgc2Vzc2lvbnMsIHdob3NlIGNvbW1hbmQgYXBwcm92YWxzIGxpdmUgb24gdGhlaXJcblx0XHQvLyBvd24gcmVnaXN0cnkpIGFuZCByZXNvbHZlIHRoZSBmaXJzdCBtYXRjaC4gTWlycm9ycyBDbGF1ZGUvQ29waWxvdC5cblx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdC4uLnRoaXMuX3Nlc3Npb25zLnZhbHVlcygpLFxuXHRcdFx0Li4uWy4uLnRoaXMuX3N1YmFnZW50c0J5VGhyZWFkSWQudmFsdWVzKCldLm1hcChzID0+IHMuc2Vzc2lvbiksXG5cdFx0XTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdGlmIChzZXNzaW9uLnBlbmRpbmdDb21tYW5kQXBwcm92YWxzLnJlc3BvbmQocmVxdWVzdElkLCBhcHByb3ZlZCA/ICdhY2NlcHQnIDogJ2RlY2xpbmUnKSkge1xuXHRcdFx0XHRpZiAoIWFwcHJvdmVkKSB7XG5cdFx0XHRcdFx0Ly8gUmVtZW1iZXIgdGhlIGRlY2xpbmUgc28gdGhlIHRvb2wncyBgaXRlbS9jb21wbGV0ZWRgICh3aGljaFxuXHRcdFx0XHRcdC8vIGNvZGV4IHJlcG9ydHMgYXMgYSBnZW5lcmljIGZhaWx1cmUpIG1hcHMgdG8gYHVzZXJDYW5jZWxsZWRgLlxuXHRcdFx0XHRcdHNlc3Npb24ubWFwU3RhdGUuZGVjbGluZWRUb29sQ2FsbHMuYWRkKHJlcXVlc3RJZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gcmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3Q6IHVua25vd24gcmVxdWVzdElkPSR7cmVxdWVzdElkfWApO1xuXHR9XG5cblx0cmVzcG9uZFRvVXNlcklucHV0UmVxdWVzdChyZXF1ZXN0SWQ6IHN0cmluZywgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZCwgYW5zd2Vycz86IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4pOiB2b2lkIHtcblx0XHQvLyBgcmVxdWVzdElkYCB3YXMgbWludGVkIHBlciByZXF1ZXN0OyBmaW5kIHRoZSBvd25pbmcgc2Vzc2lvbiBhbmRcblx0XHQvLyByZXNvbHZlIGl0cyBwYXJrZWQgZGVmZXJyZWQuIE1pcnJvcnMgcmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3QuXG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoc2Vzc2lvbi5wZW5kaW5nVXNlcklucHV0cy5yZXNwb25kKHJlcXVlc3RJZCwgeyByZXNwb25zZSwgYW5zd2VycyB9KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSByZXNwb25kVG9Vc2VySW5wdXRSZXF1ZXN0OiB1bmtub3duIHJlcXVlc3RJZD0ke3JlcXVlc3RJZH1gKTtcblx0fVxuXG5cdGdldFNlc3Npb25NZXNzYWdlcyhjaGF0OiBVUkkpOiBQcm9taXNlPHJlYWRvbmx5IFR1cm5bXT4ge1xuXHRcdHJldHVybiB0aGlzLl9yZWFkU2Vzc2lvbih0aGlzLl9zZXNzaW9uVXJpRnJvbUNoYXQoY2hhdCkpLnRoZW4ocmVhZCA9PiByZWFkID8gcmVwbGF5VGhyZWFkVG9UdXJucyhyZWFkLnRocmVhZCkgOiBbXSk7XG5cdH1cblxuXHRhc3luYyBnZXRTZXNzaW9uTWV0YWRhdGEoc2Vzc2lvbjogVVJJKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uTWV0YWRhdGEgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0Y29uc3QgcmVhZCA9IGF3YWl0IHRoaXMuX3JlYWRTZXNzaW9uKHNlc3Npb24pO1xuXHRcdGlmICghcmVhZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIHNlc3Npb24gaW4gb3VyIG1hcCBzbyBzdWJzZXF1ZW50IHNlbmRNZXNzYWdlIHRyaWdnZXJzXG5cdFx0Ly8gdGhyZWFkL3Jlc3VtZSAoRGVjaXNpb24gOCkuIFRoZSB0aHJlYWRJZCBjYW1lIGZyb20gdGhlIG1ldGFkYXRhXG5cdFx0Ly8gb3ZlcmxheSBvciBmcm9tIGB0aHJlYWQvbGlzdGAgKHdoZW4gdGhlIHNlc3Npb24gd2FzIG1hdGVyaWFsaXplZFxuXHRcdC8vIGluIGEgcHJpb3IgcHJvY2Vzcyk7IGBfcmVhZFNlc3Npb25gIHJldHVybnMgdGhlIHJlc29sdmVkIGlkLlxuXHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5fd2l0aFdvcmtpbmdEaXJlY3Rvcmllcyhcblx0XHRcdHRoaXMuX3RocmVhZFRvTWV0YWRhdGEocmVhZC50aHJlYWQsIHNlc3Npb24pLFxuXHRcdFx0cmVhZC5wZXJzaXN0ZWRXb3JraW5nRGlyZWN0b3JpZXMsXG5cdFx0KTtcblx0XHRpZiAoIXRoaXMuX3Nlc3Npb25zLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gcmVhZC50aHJlYWQuY3dkID8gVVJJLmZpbGUocmVhZC50aHJlYWQuY3dkKSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHRocmVhZElkID0gcmVhZC50aHJlYWQuaWQ7XG5cdFx0XHRjb25zdCByZXN0b3JlZCA9IHRoaXMuX2NyZWF0ZVJlc3VtZWRTZXNzaW9uRW50cnkoc2Vzc2lvbklkLCB0aHJlYWRJZCwgc2Vzc2lvbiwgd29ya2luZ0RpcmVjdG9yeSwgdW5kZWZpbmVkLCBtZXRhZGF0YS53b3JraW5nRGlyZWN0b3JpZXMpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KHNlc3Npb25JZCwgcmVzdG9yZWQpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbklkQnlUaHJlYWRJZC5zZXQodGhyZWFkSWQsIHNlc3Npb25JZCk7XG5cdFx0XHRpZiAoIWlzQ29kZXhUaHJlYWRQcm92aWRlckNvbXBhdGlibGUodGhpcy5fdXNhZ2VTb3VyY2UsIHJlYWQudGhyZWFkLm1vZGVsUHJvdmlkZXIpKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc2V0U2Vzc2lvbkZvclVzYWdlU291cmNlQ2hhbmdlKHJlc3RvcmVkLCB0aGlzLl91c2FnZVNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBDb21wYXRpYmxlIHJlc3RvcmVkIHRocmVhZHMgc2tpcCBtYXRlcmlhbGl6YXRpb24gYmVjYXVzZSB0aGUgdGhyZWFkXG5cdFx0XHQvLyBhbHJlYWR5IGV4aXN0cy4gSW5jb21wYXRpYmxlIG9uZXMgcmVtYXRlcmlhbGl6ZSBvbiB0aGUgbmV4dCBzZW5kLlxuXHRcdFx0Ly8gRWl0aGVyIHdheSwgYWR2ZXJ0aXNlIHNlcnZlciB0b29scyBub3cgZm9yIGNsaWVudC1zaWRlIHBhcml0eS5cblx0XHRcdGlmICghcmVzdG9yZWQuc2VydmVyVG9vbHNBZHZlcnRpc2VkICYmIHRoaXMuX3NlcnZlclRvb2xIb3N0KSB7XG5cdFx0XHRcdHJlc3RvcmVkLnNlcnZlclRvb2xzQWR2ZXJ0aXNlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX3NlcnZlclRvb2xIb3N0LmFkdmVydGlzZShyZXN0b3JlZC5zZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbWV0YWRhdGE7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWFkU2Vzc2lvbihzZXNzaW9uOiBVUkkpOiBQcm9taXNlPElDb2RleFNlc3Npb25SZWFkIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gUmVzb2x2ZSB0aGUgY29kZXggdGhyZWFkIGlkIGZvciB0aGlzIHNlc3Npb24gVVJJLiBSZXNvbHV0aW9uXG5cdFx0Ly8gb3JkZXI6IGluLW1lbW9yeSBzZXNzaW9uIFx1MjE5MiBwZXJzaXN0ZWQgbWV0YWRhdGEgb3ZlcmxheSBcdTIxOTIgVVJJIGhvc3Rcblx0XHQvLyAoZm9yIHNlc3Npb25zIG1hdGVyaWFsaXplZCBpbiBhIHByaW9yIHByb2Nlc3Mgd2hlcmUgc2Vzc2lvbklkXG5cdFx0Ly8gZXF1YWxzIHRocmVhZElkIGJ5IGNvbnZlbnRpb24pLlxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGxldCB0aHJlYWRJZCA9IGV4aXN0aW5nPy50aHJlYWRJZDtcblx0XHRsZXQgcGVyc2lzdGVkV29ya2luZ0RpcmVjdG9yaWVzID0gZXhpc3Rpbmc/LndvcmtpbmdEaXJlY3Rvcmllcztcblx0XHRpZiAodGhyZWFkSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3Qgb3ZlcmxheSA9IGF3YWl0IHRoaXMuX21ldGFkYXRhU3RvcmUucmVhZChzZXNzaW9uKTtcblx0XHRcdHRocmVhZElkID0gb3ZlcmxheS50aHJlYWRJZCA/PyBzZXNzaW9uSWQ7XG5cdFx0XHRwZXJzaXN0ZWRXb3JraW5nRGlyZWN0b3JpZXMgPSBvdmVybGF5LndvcmtpbmdEaXJlY3Rvcmllcztcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbm4gPSBhd2FpdCB0aGlzLl9lbnN1cmVDb25uZWN0aW9uKCk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGNvbm4uY2xpZW50LnJlcXVlc3Q8J3RocmVhZC9yZWFkJywgVGhyZWFkUmVhZFJlc3BvbnNlPigndGhyZWFkL3JlYWQnLCB7XG5cdFx0XHRcdHRocmVhZElkLFxuXHRcdFx0XHRpbmNsdWRlVHVybnM6IHRydWUsXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB7IC4uLnJlc3BvbnNlLCBwZXJzaXN0ZWRXb3JraW5nRGlyZWN0b3JpZXMgfTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG5cdFx0XHQvLyBgdGhyZWFkIG5vdCBsb2FkZWRgIGlzIGFwcC1zZXJ2ZXIncyBleHBlY3RlZCByZXNwb25zZSBmb3IgYW55XG5cdFx0XHQvLyB0aHJlYWQgd2UgaGF2ZSBub3QgeWV0IHJlc3VtZWQgaW4gdGhpcyBwcm9jZXNzOyBzZW5kTWVzc2FnZSdzXG5cdFx0XHQvLyBgdGhyZWFkL3Jlc3VtZWAgcGF0aCB3aWxsIGhhbmRsZSBpdC4gTG9nIGF0IGluZm8gbGV2ZWwuXG5cdFx0XHRpZiAoL3RocmVhZCBub3QgbG9hZGVkL2kudGVzdChtZXNzYWdlKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleDoke3RocmVhZElkfV0gdGhyZWFkL3JlYWQ6IG5vdCBsb2FkZWQgeWV0ICh3aWxsIHJlc3VtZSBvbiBmaXJzdCBzZW5kKWApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXg6JHt0aHJlYWRJZH1dIHRocmVhZC9yZWFkIGZhaWxlZDogJHttZXNzYWdlfWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBsaXN0U2Vzc2lvbnMoKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXT4ge1xuXHRcdC8vIFJlamVjdCByYXRoZXIgdGhhbiByZXBvcnRpbmcgYW4gZW1wdHkgbGlzdCB3aGlsZSB0aGUgR2l0SHViIHRva2VuIGlzXG5cdFx0Ly8gc3RpbGwgbGFuZGluZzogdGhlIHdvcmtiZW5jaCB0cmVhdHMgYSBzdWNjZXNzZnVsIGxpc3RpbmcgYXMgdGhlXG5cdFx0Ly8gYXV0aG9yaXRhdGl2ZSBzZXNzaW9uIHNldCBhbmQgd291bGQgZXZpY3QgXHUyMDE0IGFuZCBwZXJtYW5lbnRseSB1bnBpbiBhbmRcblx0XHQvLyB1bmdyb3VwIFx1MjAxNCBldmVyeSBDb2RleCBzZXNzaW9uLiBBIHJlamVjdGlvbiBpbnN0ZWFkIGxlYXZlcyB0aGUgY2FjaGVkXG5cdFx0Ly8gbGlzdCBpbnRhY3QgYW5kIHNlbGYtaGVhbHMgdGhyb3VnaCB0aGUgY2FsbGVyJ3MgYmFja29mZiByZXRyeS5cblx0XHR0aGlzLl9lbnN1cmVBdXRoZW50aWNhdGVkKCk7XG5cdFx0Ly8gRG9uJ3QgY29ubmVjdCAoYW5kIHRyaWdnZXIgYSBjb2xkIFNESyBkb3dubG9hZCkganVzdCB0byBsaXN0IHRocmVhZHNcblx0XHQvLyBhdCBzdGFydHVwLiBXaGVuIHRoZSBTREsgaXNuJ3QgbG9jYWwgeWV0LCBzdXJmYWNlIGFuIGVtcHR5IGxpc3Q7IHRoZVxuXHRcdC8vIGRvd25sb2FkIGZpcmVzICh3aXRoIGhvc3QtbGV2ZWwgcHJvZ3Jlc3MpIG9uY2UgdGhlIHVzZXIgc3RhcnRzIGFcblx0XHQvLyBzZXNzaW9uLCBhbmQgdGhlIG5leHQgYGxpc3RTZXNzaW9uc2AgXHUyMDE0IGRyaXZlbiBieSB0aGUgcmVuZGVyZXInc1xuXHRcdC8vIHBvc3QtdHVybiByZWZyZXNoIFx1MjAxNCByZXR1cm5zIHRoZSBmdWxsIGxpc3QuXG5cdFx0aWYgKCEoYXdhaXQgdGhpcy5fYWdlbnRTZGtEb3dubG9hZGVyLmlzU2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZChDb2RleFNka1BhY2thZ2UpKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKCdbQ29kZXhdIFNESyBub3QgZG93bmxvYWRlZCB5ZXQ7IGRlZmVycmluZyB0aHJlYWQvbGlzdCB1bnRpbCBhIHNlc3Npb24gdHJpZ2dlcnMgdGhlIGRvd25sb2FkJyk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb25uID0gYXdhaXQgdGhpcy5fZW5zdXJlQ29ubmVjdGlvbigpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjb25uLmNsaWVudC5yZXF1ZXN0PCd0aHJlYWQvbGlzdCcsIFRocmVhZExpc3RSZXNwb25zZT4oJ3RocmVhZC9saXN0Jywge1xuXHRcdFx0XHRsaW1pdDogMjAwLFxuXHRcdFx0fSk7XG5cdFx0XHQvLyBNYXAgcGVyc2lzdGVkIHRocmVhZHMgYmFjayB0byB0aGUgVVJJIHRoZSB3b3JrYmVuY2ggYWxyZWFkeVxuXHRcdFx0Ly8ga25vd3MgdGhlbSBieS4gQWZ0ZXIgYF9tYXRlcmlhbGl6ZUlmTmVlZGVkYCBydW5zLCB0aGUgY29kZXhcblx0XHRcdC8vIHRocmVhZCBpcyBwZXJzaXN0ZWQgdG8gZGlzayB1bmRlciBpdHMgdGhyZWFkIGlkIGJ1dCB0aGVcblx0XHRcdC8vIHdvcmtiZW5jaC9zdGF0ZS1tYW5hZ2VyIGtleWVkIHRoZSBzZXNzaW9uIGJ5IGl0cyBwcm92aXNpb25hbFxuXHRcdFx0Ly8gVVJJIChgY29kZXg6Lzxwcm92aXNpb25hbC11dWlkPmApLiBJZiB3ZSByZXR1cm5lZCBhIGZyZXNoXG5cdFx0XHQvLyBgY29kZXg6Lzx0aHJlYWRJZD5gIFVSSSBoZXJlLCBgX3JlZnJlc2hTZXNzaW9uc2Agd291bGQgdHJlYXRcblx0XHRcdC8vIHRoZSBwcm92aXNpb25hbCBVUkkgYXMgbWlzc2luZyBhbmQgZXZpY3QgdGhlIGxpdmUgc2Vzc2lvblxuXHRcdFx0Ly8gdGhlIHVzZXIgaXMgYWN0aXZlbHkgdmlld2luZy5cblx0XHRcdGNvbnN0IGxpdmVVcmlCeVRocmVhZElkID0gbmV3IE1hcDxzdHJpbmcsIFVSST4oKTtcblx0XHRcdGZvciAoY29uc3QgcyBvZiB0aGlzLl9zZXNzaW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0XHRpZiAocy50aHJlYWRJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0bGl2ZVVyaUJ5VGhyZWFkSWQuc2V0KHMudGhyZWFkSWQsIHMuc2Vzc2lvblVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXNwb25zZS5kYXRhLm1hcCh0aHJlYWQgPT4ge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gbGl2ZVVyaUJ5VGhyZWFkSWQuZ2V0KHRocmVhZC5pZCkgPz8gQWdlbnRTZXNzaW9uLnVyaSh0aGlzLmlkLCB0aHJlYWQuaWQpO1xuXHRcdFx0XHRjb25zdCBsaXZlV29ya2luZ0RpcmVjdG9yaWVzID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uVXJpKSk/LndvcmtpbmdEaXJlY3Rvcmllcztcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3dpdGhXb3JraW5nRGlyZWN0b3JpZXModGhpcy5fdGhyZWFkVG9NZXRhZGF0YSh0aHJlYWQsIHNlc3Npb25VcmkpLCBsaXZlV29ya2luZ0RpcmVjdG9yaWVzKTtcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIHRocmVhZC9saXN0IGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdGhyZWFkVG9NZXRhZGF0YSh0aHJlYWQ6IFRocmVhZCwgc2Vzc2lvblVyaTogVVJJKTogSUFnZW50U2Vzc2lvbk1ldGFkYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2Vzc2lvbjogc2Vzc2lvblVyaSxcblx0XHRcdC8vIENvZGV4IHJldHVybnMgVW5peCBzZWNvbmRzOyB0aGUgYWdlbnQgaG9zdCBleHBlY3RzIG1zLlxuXHRcdFx0c3RhcnRUaW1lOiAodGhyZWFkLmNyZWF0ZWRBdCA/PyAwKSAqIDEwMDAsXG5cdFx0XHRtb2RpZmllZFRpbWU6ICh0aHJlYWQudXBkYXRlZEF0ID8/IHRocmVhZC5jcmVhdGVkQXQgPz8gMCkgKiAxMDAwLFxuXHRcdFx0c3VtbWFyeTogdGhyZWFkLm5hbWUgPz8gdGhyZWFkLnByZXZpZXcgPz8gdW5kZWZpbmVkLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiB0aHJlYWQuY3dkID8gW1VSSS5maWxlKHRocmVhZC5jd2QpXSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfd2l0aFdvcmtpbmdEaXJlY3RvcmllcyhtZXRhZGF0YTogSUFnZW50U2Vzc2lvbk1ldGFkYXRhLCBzdG9yZWRXb3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkKTogSUFnZW50U2Vzc2lvbk1ldGFkYXRhIHtcblx0XHRjb25zdCBwcmltYXJ5ID0gbWV0YWRhdGEud29ya2luZ0RpcmVjdG9yaWVzPy5bMF07XG5cdFx0aWYgKCFwcmltYXJ5IHx8ICFzdG9yZWRXb3JraW5nRGlyZWN0b3JpZXMgfHwgc3RvcmVkV29ya2luZ0RpcmVjdG9yaWVzLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRyZXR1cm4gbWV0YWRhdGE7XG5cdFx0fVxuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IGRpc3RpbmN0V29ya2luZ0RpcmVjdG9yaWVzKFtcblx0XHRcdHByaW1hcnksXG5cdFx0XHQuLi5zdG9yZWRXb3JraW5nRGlyZWN0b3JpZXMuc2xpY2UoMSksXG5cdFx0XSk7XG5cdFx0cmV0dXJuIHdvcmtpbmdEaXJlY3RvcmllcyAmJiB3b3JraW5nRGlyZWN0b3JpZXMubGVuZ3RoID4gMVxuXHRcdFx0PyB7IC4uLm1ldGFkYXRhLCB3b3JraW5nRGlyZWN0b3JpZXMgfVxuXHRcdFx0OiBtZXRhZGF0YTtcblx0fVxuXG5cdHNldFNlcnZlclRvb2xIb3N0KGhvc3Q6IElBZ2VudFNlcnZlclRvb2xIb3N0KTogdm9pZCB7XG5cdFx0dGhpcy5fc2VydmVyVG9vbEhvc3QgPSBob3N0O1xuXHR9XG5cblx0Z2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoc2Vzc2lvbjogVVJJLCBjbGllbnQ6IHsgcmVhZG9ubHkgY2xpZW50SWQ6IHN0cmluZzsgcmVhZG9ubHkgZGlzcGxheU5hbWU/OiBzdHJpbmcgfSk6IElBY3RpdmVDbGllbnQge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRyZXR1cm4gbmV3IENvZGV4QWN0aXZlQ2xpZW50SGFuZGxlKFxuXHRcdFx0KCkgPT4gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCksXG5cdFx0XHRjbGllbnQuY2xpZW50SWQsXG5cdFx0XHRjbGllbnQuZGlzcGxheU5hbWUsXG5cdFx0XHR0b29scyA9PiB0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleDoke3Nlc3Npb25JZH1dIGFjdGl2ZSBjbGllbnQgJHtjbGllbnQuY2xpZW50SWR9IHRvb2xzPVske3Rvb2xzLm1hcCh0ID0+IHQubmFtZSkuam9pbignLCAnKSB8fCAnKG5vbmUpJ31dYCksXG5cdFx0XHRjdXN0b21pemF0aW9ucyA9PiB7IHZvaWQgdGhpcy5fc3luY0NsaWVudEN1c3RvbWl6YXRpb25zKHNlc3Npb24sIGNsaWVudC5jbGllbnRJZCwgWy4uLmN1c3RvbWl6YXRpb25zXSk7IH0sXG5cdFx0KTtcblx0fVxuXG5cdHJlbW92ZUFjdGl2ZUNsaWVudChzZXNzaW9uOiBVUkksIGNsaWVudElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0Y29uc3Qgc2VzcyA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdHNlc3M/LmNsaWVudFRvb2xTZXQuZGVsZXRlKGNsaWVudElkKTtcblx0XHRpZiAoc2Vzcz8uY2xpZW50Q3VzdG9taXphdGlvbnMucmVtb3ZlQ2xpZW50KGNsaWVudElkKSkge1xuXHRcdFx0Ly8gQSBkZXBhcnRpbmcgY2xpZW50J3Mgc2tpbGxzIG1heSBkcm9wIG91dCBvZiB0aGUgcHJvY2Vzcy1nbG9iYWwgdW5pb24uXG5cdFx0XHR2b2lkIHRoaXMuX3JlZnJlc2hTa2lsbEV4dHJhUm9vdHMoKTtcblx0XHR9XG5cdH1cblxuXHRvbkNsaWVudFRvb2xDYWxsQ29tcGxldGUoc2Vzc2lvbjogVVJJLCBfY2hhdDogVVJJLCB0b29sQ2FsbElkOiBzdHJpbmcsIHJlc3VsdDogVG9vbENhbGxSZXN1bHQpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0Y29uc3Qgc2VzcyA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdC8vIGBBZ2VudFNpZGVFZmZlY3RzYCBmb3J3YXJkcyBldmVyeSBgQ2hhdFRvb2xDYWxsQ29tcGxldGVgIGVudmVsb3BlXG5cdFx0Ly8gKGluY2x1ZGluZyBjb2RleC1vd25lZCB0b29scyBsaWtlIHNoZWxsKTsgYSBtaXNzIGlzIHRoZSBleHBlY3RlZCBwYXRoLlxuXHRcdHNlc3M/LnBlbmRpbmdDbGllbnRUb29sQ2FsbHMucmVzcG9uZE9yQnVmZmVyKHRvb2xDYWxsSWQsIHJlc3VsdCk7XG5cdH1cblxuXHQvLyAtLS0tIENsaWVudC1wdXNoZWQgcGx1Z2luIGN1c3RvbWl6YXRpb25zIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogTWF0ZXJpYWxpemUgKyBwYXJzZSBhIGNsaWVudCdzIHB1c2hlZCBwbHVnaW4gY3VzdG9taXphdGlvbnMgYW5kIHN0b3JlXG5cdCAqIHRoZW0gb24gdGhlIHNlc3Npb24uIE1pcnJvcnMgdGhlIENsYXVkZSBjbGllbnQtcGx1Z2luIHBhdGg6IHRoZSBzaGFyZWRcblx0ICoge0BsaW5rIElBZ2VudFBsdWdpbk1hbmFnZXJ9IGNvcGllcyBlYWNoIHBsdWdpbiB0byBsb2NhbCBkaXNrIChub25jZVxuXHQgKiBjYWNoZWQpLCB3ZSBwYXJzZSB0aGUgcmVzdWx0aW5nIGRpcmVjdG9yeSBpbnRvIGl0c1xuXHQgKiB7QGxpbmsgSVBhcnNlZFBsdWdpbiB8IGNvbXBvbmVudHN9LCBwdWJsaXNoIHRoZSBjdXN0b21pemF0aW9uIHN1cmZhY2UsXG5cdCAqIGFuZCByZWZyZXNoIHRoZSBwcm9jZXNzLWdsb2JhbCBza2lsbCByb290cy4gTUNQIHNlcnZlcnMgYXJlIGF0dGFjaGVkXG5cdCAqIHBlci10aHJlYWQgYXQgdGhlIG5leHQge0BsaW5rIF9tYXRlcmlhbGl6ZX0uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9zeW5jQ2xpZW50Q3VzdG9taXphdGlvbnMoc2Vzc2lvblVyaTogVVJJLCBjbGllbnRJZDogc3RyaW5nLCBjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChBZ2VudFNlc3Npb24uaWQoc2Vzc2lvblVyaSkpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzeW5jZWQgPSBhd2FpdCB0aGlzLl9wbHVnaW5NYW5hZ2VyLnN5bmNDdXN0b21pemF0aW9ucyhcblx0XHRcdGNsaWVudElkLFxuXHRcdFx0Wy4uLmN1c3RvbWl6YXRpb25zXSxcblx0XHRcdHN0YXR1cyA9PiB0aGlzLl9maXJlKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQsIGN1c3RvbWl6YXRpb246IHN0YXR1cyB9KSxcblx0XHQpO1xuXHRcdGlmIChzZXNzaW9uLmRpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHBsdWdpbnMgPSBhd2FpdCBQcm9taXNlLmFsbChzeW5jZWQubWFwKGl0ZW0gPT4gdGhpcy5fcGFyc2VDbGllbnRQbHVnaW4oc2Vzc2lvbiwgaXRlbSkpKTtcblx0XHRpZiAoc2Vzc2lvbi5kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzZXNzaW9uLmNsaWVudEN1c3RvbWl6YXRpb25zLnNldENsaWVudChjbGllbnRJZCwgcGx1Z2lucyk7XG5cdFx0dGhpcy5fcHVibGlzaENsaWVudEN1c3RvbWl6YXRpb25zKHNlc3Npb24pO1xuXHRcdGF3YWl0IHRoaXMuX3JlZnJlc2hTa2lsbEV4dHJhUm9vdHMoKTtcblx0fVxuXG5cdC8qKiBQYXJzZSBvbmUgc3luY2VkIHBsdWdpbiBkaXJlY3RvcnkgaW50byBpdHMgY29tcG9uZW50cyAoYmVzdC1lZmZvcnQpLiAqL1xuXHRwcml2YXRlIGFzeW5jIF9wYXJzZUNsaWVudFBsdWdpbihzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLCBzeW5jZWQ6IElTeW5jZWRDdXN0b21pemF0aW9uKTogUHJvbWlzZTxJQ29kZXhDbGllbnRQbHVnaW4+IHtcblx0XHRpZiAoIXN5bmNlZC5wbHVnaW5EaXIpIHtcblx0XHRcdHJldHVybiB7IHN5bmNlZCwgcGFyc2VkOiB1bmRlZmluZWQgfTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IGF3YWl0IHBhcnNlUGx1Z2luKHN5bmNlZC5wbHVnaW5EaXIsIHRoaXMuX2ZpbGVTZXJ2aWNlLCBzZXNzaW9uLndvcmtpbmdEaXJlY3RvcnksIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS51c2VySG9tZSwgc3luY2VkLnBsdWdpbkRpcik7XG5cdFx0XHRyZXR1cm4geyBzeW5jZWQsIHBhcnNlZCB9O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIGZhaWxlZCB0byBwYXJzZSBjbGllbnQgcGx1Z2luICR7c3luY2VkLmN1c3RvbWl6YXRpb24udXJpfTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHRyZXR1cm4geyBzeW5jZWQsIHBhcnNlZDogdW5kZWZpbmVkIH07XG5cdFx0fVxuXHR9XG5cblx0LyoqIFB1Ymxpc2ggdGhlIHNlc3Npb24ncyBjbGllbnQtcGx1Z2luIGN1c3RvbWl6YXRpb25zIGFzIHVwc2VydCBhY3Rpb25zLiAqL1xuXHRwcml2YXRlIF9wdWJsaXNoQ2xpZW50Q3VzdG9taXphdGlvbnMoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgY3VzdG9taXphdGlvbiBvZiBzZXNzaW9uLmNsaWVudEN1c3RvbWl6YXRpb25zLnRvQ3VzdG9taXphdGlvbnMoKSkge1xuXHRcdFx0dGhpcy5fZmlyZShzZXNzaW9uLnNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQsIGN1c3RvbWl6YXRpb24gfSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlY29tcHV0ZSB0aGUgcHJvY2Vzcy1nbG9iYWwgc2tpbGwgcm9vdHMgZnJvbSBldmVyeSBsaXZlIHNlc3Npb24nc1xuXHQgKiBlbmFibGVkIGNsaWVudCBwbHVnaW5zIGFuZCBwdXNoIHRoZW0gdG8gY29kZXggdmlhIGBza2lsbHMvZXh0cmFSb290cy9zZXRgLlxuXHQgKiBjb2RleCdzIGV4dHJhIHNraWxsIHJvb3RzIGFyZSBhIHNpbmdsZSBzaGFyZWQgbGlzdCAodGhlcmUgaXMgbm8gcGVyLXRocmVhZFxuXHQgKiBlcXVpdmFsZW50KSwgc28gd2Ugc2VuZCB0aGUgdW5pb24gYWNyb3NzIGFsbCBzZXNzaW9ucyBcdTIwMTQgd2hpY2ggbWF0Y2hlcyB0aGVcblx0ICogZ2xvYmFsIG5hdHVyZSBvZiBjbGllbnQgcGx1Z2luIGNob2ljZXMuIE5vLW9wIHdoZW4gdGhlIGNvbm5lY3Rpb24gaXMgbm90XG5cdCAqIHJlYWR5OyB0aGUgbmV4dCB7QGxpbmsgX21hdGVyaWFsaXplfSByZS1hcHBsaWVzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaFNraWxsRXh0cmFSb290cygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fY29ubmVjdGlvbi5raW5kICE9PSAncmVhZHknKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHBsdWdpbnM6IElDb2RleENsaWVudFBsdWdpbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoIXNlc3Npb24uZGlzcG9zZWQpIHtcblx0XHRcdFx0cGx1Z2lucy5wdXNoKC4uLnNlc3Npb24uY2xpZW50Q3VzdG9taXphdGlvbnMuZW5hYmxlZFBsdWdpbnMoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHJvb3RzID0gY29kZXhTa2lsbFJvb3RzRnJvbVBsdWdpbnMocGx1Z2lucyk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX2Nvbm5lY3Rpb24uY2xpZW50LnJlcXVlc3Q8J3NraWxscy9leHRyYVJvb3RzL3NldCc+KCdza2lsbHMvZXh0cmFSb290cy9zZXQnLCB7IGV4dHJhUm9vdHM6IHJvb3RzIH0pO1xuXHRcdFx0aWYgKHJvb3RzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIGFwcGxpZWQgJHtyb290cy5sZW5ndGh9IGNsaWVudC1wbHVnaW4gc2tpbGwgcm9vdChzKWApO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIHNraWxscy9leHRyYVJvb3RzL3NldCBmYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0gTUNQIHNlcnZlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBTdXJmYWNlcyBjb2RleCdzIE1DUCBzZXJ2ZXJzIHRvIEFIUCBjbGllbnRzIGFzIHBlci1zZXNzaW9uXG5cdCAqIGN1c3RvbWl6YXRpb25zLiBDb2RleCBoYXMgbm8gcGx1Z2luL2RpcmVjdG9yeSBjdXN0b21pemF0aW9uIGxheWVyLCBzb1xuXHQgKiBldmVyeSBzZXJ2ZXIgaXMgYSBiYXJlIHRvcC1sZXZlbCB7QGxpbmsgTWNwU2VydmVyQ3VzdG9taXphdGlvbn0uIFRoZVxuXHQgKiByZXR1cm5lZCBzbmFwc2hvdCByZWZsZWN0cyB0aGUgY3VycmVudCBjb25uZWN0aW9uLWdsb2JhbCBpbnZlbnRvcnk7XG5cdCAqIHN1YnNlcXVlbnQgbGlmZWN5Y2xlIHRyYW5zaXRpb25zIGFycml2ZSBhcyBjdXN0b21pemF0aW9uIGFjdGlvbnNcblx0ICogZW1pdHRlZCBieSB0aGUgc2Vzc2lvbidzIHtAbGluayBNY3BDdXN0b21pemF0aW9uQ29udHJvbGxlcn0uXG5cdCAqL1xuXHRhc3luYyBnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoc2Vzc2lvblVyaTogVVJJKTogUHJvbWlzZTxyZWFkb25seSBDdXN0b21pemF0aW9uW10+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uVXJpKSk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLl9nZXRPckNyZWF0ZU1jcENvbnRyb2xsZXIoc2Vzc2lvbik7XG5cdFx0Y29udHJvbGxlci5hcHBseUFsbChpbnZlbnRvcnlUb1Nka1NlcnZlcnModGhpcy5fbWNwSW52ZW50b3J5KSk7XG5cdFx0dGhpcy5fcmVmcmVzaE1jcEN1c3RvbWl6YXRpb25JZHMoc2Vzc2lvbiwgY29udHJvbGxlcik7XG5cdFx0Ly8gQXBwZW5kIHRoZSBza2lsbHMvaG9va3MgY29kZXggbG9hZGVkIGZvciB0aGlzIHNlc3Npb24ncyB3b3JraW5nXG5cdFx0Ly8gZGlyZWN0b3J5IChiZXN0LWVmZm9ydDsgZW1wdHkgdW50aWwgdGhlIGFwcC1zZXJ2ZXIgY29ubmVjdGlvbiBpc1xuXHRcdC8vIHJlYWR5LCBhZnRlciB3aGljaCBgX3JlZnJlc2hTa2lsbEhvb2tDdXN0b21pemF0aW9uc2AgcHVzaGVzIHVwZGF0ZXMpLlxuXHRcdGNvbnN0IHNraWxsSG9va0NvbnRhaW5lcnMgPSBhd2FpdCB0aGlzLl9mZXRjaFNraWxsSG9va0NvbnRhaW5lcnMoc2Vzc2lvbik7XG5cdFx0Ly8gQ2xpZW50LXB1c2hlZCAoXCJPcGVuIFBsdWdpblwiKSBjdXN0b21pemF0aW9ucyBmaXJzdCAodGhleSBjYXJyeSB0aGVcblx0XHQvLyB1c2VyJ3MgZW5hYmxlbWVudCBvdmVybGF5KSwgdGhlbiBjb2RleCdzIGRpc2NvdmVyZWQgTUNQIHNlcnZlcnMgYW5kXG5cdFx0Ly8gdGhlIGAuYWdlbnRzYC9gLmNvZGV4YCBza2lsbHMvaG9va3MuXG5cdFx0cmV0dXJuIFtcblx0XHRcdC4uLnNlc3Npb24uY2xpZW50Q3VzdG9taXphdGlvbnMudG9DdXN0b21pemF0aW9ucygpLFxuXHRcdFx0Li4uY29udHJvbGxlci50b3BMZXZlbEN1c3RvbWl6YXRpb25zKCksXG5cdFx0XHQuLi5za2lsbEhvb2tDb250YWluZXJzLFxuXHRcdF07XG5cdH1cblxuXHQvKipcblx0ICogRmV0Y2hlcyB0aGUgc2tpbGxzIGFuZCBob29rcyBjb2RleCBoYXMgbG9hZGVkIGZvciBgc2Vzc2lvbmAncyB3b3JraW5nXG5cdCAqIGRpcmVjdG9yeSAoYHNraWxscy9saXN0YCArIGBob29rcy9saXN0YCwgYm90aCBjd2Qtc2NvcGVkKSBhbmQgcHJvamVjdHNcblx0ICogdGhlbSBpbnRvIHtAbGluayBEaXJlY3RvcnlDdXN0b21pemF0aW9ufSBjb250YWluZXJzLiBCZXN0LWVmZm9ydDogcmV0dXJuc1xuXHQgKiBhbiBlbXB0eSBhcnJheSB3aGVuIG5vIGNvbm5lY3Rpb24gaXMgcmVhZHksIG5vIHdvcmtpbmcgZGlyZWN0b3J5IGlzIGtub3duLFxuXHQgKiBvciB0aGUgYXBwLXNlcnZlciByZWplY3RzIHRoZSByZXF1ZXN0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZmV0Y2hTa2lsbEhvb2tDb250YWluZXJzKHNlc3Npb246IElDb2RleFNlc3Npb24pOiBQcm9taXNlPERpcmVjdG9yeUN1c3RvbWl6YXRpb25bXT4ge1xuXHRcdGlmICh0aGlzLl9jb25uZWN0aW9uLmtpbmQgIT09ICdyZWFkeScgfHwgIXNlc3Npb24ud29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBjd2QgPSBzZXNzaW9uLndvcmtpbmdEaXJlY3RvcnkuZnNQYXRoO1xuXHRcdGNvbnN0IGNsaWVudCA9IHRoaXMuX2Nvbm5lY3Rpb24uY2xpZW50O1xuXHRcdGNvbnN0IFtza2lsbHMsIGhvb2tzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGNsaWVudC5yZXF1ZXN0PCdza2lsbHMvbGlzdCcsIFNraWxsc0xpc3RSZXNwb25zZT4oJ3NraWxscy9saXN0JywgeyBjd2RzOiBbY3dkXSB9KVxuXHRcdFx0XHQuY2F0Y2goZXJyID0+IHsgdGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIHNraWxscy9saXN0IGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7IHJldHVybiB1bmRlZmluZWQ7IH0pLFxuXHRcdFx0Y2xpZW50LnJlcXVlc3Q8J2hvb2tzL2xpc3QnLCBIb29rc0xpc3RSZXNwb25zZT4oJ2hvb2tzL2xpc3QnLCB7IGN3ZHM6IFtjd2RdIH0pXG5cdFx0XHRcdC5jYXRjaChlcnIgPT4geyB0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gaG9va3MvbGlzdCBmYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApOyByZXR1cm4gdW5kZWZpbmVkOyB9KSxcblx0XHRdKTtcblx0XHRyZXR1cm4gWy4uLmNvZGV4U2tpbGxzVG9Db250YWluZXJzKHNraWxscyksIC4uLmNvZGV4SG9va3NUb0NvbnRhaW5lcnMoaG9va3MpXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1mZXRjaGVzIHRoaXMgc2Vzc2lvbidzIHNraWxsL2hvb2sgY3VzdG9taXphdGlvbnMgYW5kIHVwc2VydHMgZWFjaFxuXHQgKiBjb250YWluZXIgaW50byBzZXNzaW9uIHN0YXRlIHZpYSB7QGxpbmsgQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWR9LlxuXHQgKiBDYWxsZWQgYWZ0ZXIgbWF0ZXJpYWxpemF0aW9uICh3aGVuIHRoZSBjb25uZWN0aW9uIGlzIHJlYWR5IGFuZCB0aGUgY3dkIGlzXG5cdCAqIGtub3duKSBzbyB0aGUgd29ya2JlbmNoIEN1c3RvbWl6YXRpb25zIHN1cmZhY2UgcmVmbGVjdHMgd2hhdCBjb2RleCBsb2FkZWRcblx0ICogZnJvbSB0aGUgd29ya2luZyBkaXJlY3RvcnkncyBgLmFnZW50c2AvYC5jb2RleGAgZm9sZGVycy4gVXBzZXJ0cyAoa2V5ZWQgYnlcblx0ICogY3VzdG9taXphdGlvbiBpZCkgbGVhdmUgdGhlIE1DUCBjdXN0b21pemF0aW9ucyB1bnRvdWNoZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZWZyZXNoU2tpbGxIb29rQ3VzdG9taXphdGlvbnMoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChzZXNzaW9uLmRpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRhaW5lcnMgPSBhd2FpdCB0aGlzLl9mZXRjaFNraWxsSG9va0NvbnRhaW5lcnMoc2Vzc2lvbik7XG5cdFx0aWYgKHNlc3Npb24uZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjb250YWluZXIgb2YgY29udGFpbmVycykge1xuXHRcdFx0dGhpcy5fZmlyZShzZXNzaW9uLnNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQsIGN1c3RvbWl6YXRpb246IGNvbnRhaW5lciB9KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUm91dGVzIGFuIE1DUCByZXF1ZXN0IHJlY2VpdmVkIG9uIHRoaXMgc2Vzc2lvbidzIGBtY3A6Ly9gIHNpZGUgY2hhbm5lbFxuXHQgKiB0byBjb2RleC4gUmVhZC1vbmx5IG1ldGhvZHMgKGB0b29scy9saXN0YCwgYHJlc291cmNlcy9saXN0YCxcblx0ICogYHJlc291cmNlcy90ZW1wbGF0ZXMvbGlzdGApIGFyZSBhbnN3ZXJlZCBmcm9tIHRoZSBjYWNoZWQgaW52ZW50b3J5O1xuXHQgKiBgdG9vbHMvY2FsbGAgYW5kIGByZXNvdXJjZXMvcmVhZGAgcm91bmQtdHJpcCB0byB0aGUgYXBwLXNlcnZlciB3aXRoIHRoZVxuXHQgKiBzZXNzaW9uJ3MgdGhyZWFkIGlkLiBVbmtub3duIHNlcnZlcnMgLyBtZXRob2RzIHJlamVjdCB3aXRoXG5cdCAqIGBNZXRob2Qgbm90IGZvdW5kYCBzbyB0aGUgcHJvdG9jb2wgc2VydmVyIG1hcHMgdGhlbSB0byBKU09OLVJQQ1xuXHQgKiBgLTMyNjAxYC5cblx0ICovXG5cdGFzeW5jIGhhbmRsZU1jcFJlcXVlc3Qoc2Vzc2lvblVyaTogVVJJLCBzZXJ2ZXJOYW1lOiBzdHJpbmcsIG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTWV0aG9kIG5vdCBmb3VuZDogbm8gYWN0aXZlIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fbWNwSW52ZW50b3J5LmdldChzZXJ2ZXJOYW1lKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1ldGhvZCBub3QgZm91bmQ6IHVua25vd24gTUNQIHNlcnZlciAnJHtzZXJ2ZXJOYW1lfSdgKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVhZCA9IGJ1aWxkQ29kZXhNY3BSZWFkUmVzdWx0KG1ldGhvZCwgZW50cnkpO1xuXHRcdGlmIChyZWFkLmhhbmRsZWQpIHtcblx0XHRcdHJldHVybiByZWFkLnJlc3VsdDtcblx0XHR9XG5cdFx0c3dpdGNoIChtZXRob2QpIHtcblx0XHRcdGNhc2UgJ3Rvb2xzL2NhbGwnOiB7XG5cdFx0XHRcdGNvbnN0IHRvb2wgPSBwYXJhbXMgJiYgdHlwZW9mIHBhcmFtc1snbmFtZSddID09PSAnc3RyaW5nJyA/IHBhcmFtc1snbmFtZSddIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoIXRvb2wpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYHRvb2xzL2NhbGwgbWlzc2luZyAnbmFtZScgcGFyYW1ldGVyYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdGhyZWFkSWQgPSBhd2FpdCB0aGlzLl9lbnN1cmVUaHJlYWRJZChzZXNzaW9uKTtcblx0XHRcdFx0Y29uc3QgY29ubiA9IGF3YWl0IHRoaXMuX2Vuc3VyZUNvbm5lY3Rpb24oKTtcblx0XHRcdFx0cmV0dXJuIGNvbm4uY2xpZW50LnJlcXVlc3Q8J21jcFNlcnZlci90b29sL2NhbGwnLCBNY3BTZXJ2ZXJUb29sQ2FsbFJlc3BvbnNlPignbWNwU2VydmVyL3Rvb2wvY2FsbCcsIHtcblx0XHRcdFx0XHR0aHJlYWRJZCxcblx0XHRcdFx0XHRzZXJ2ZXI6IHNlcnZlck5hbWUsXG5cdFx0XHRcdFx0dG9vbCxcblx0XHRcdFx0XHRhcmd1bWVudHM6IChwYXJhbXMgPyBwYXJhbXNbJ2FyZ3VtZW50cyddIDogdW5kZWZpbmVkKSBhcyBKc29uVmFsdWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAncmVzb3VyY2VzL3JlYWQnOiB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IHBhcmFtcyAmJiB0eXBlb2YgcGFyYW1zWyd1cmknXSA9PT0gJ3N0cmluZycgPyBwYXJhbXNbJ3VyaSddIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoIXVyaSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgcmVzb3VyY2VzL3JlYWQgbWlzc2luZyAndXJpJyBwYXJhbWV0ZXJgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB0aHJlYWRJZCA9IGF3YWl0IHRoaXMuX2Vuc3VyZVRocmVhZElkKHNlc3Npb24pO1xuXHRcdFx0XHRjb25zdCBjb25uID0gYXdhaXQgdGhpcy5fZW5zdXJlQ29ubmVjdGlvbigpO1xuXHRcdFx0XHRyZXR1cm4gY29ubi5jbGllbnQucmVxdWVzdDwnbWNwU2VydmVyL3Jlc291cmNlL3JlYWQnLCBNY3BSZXNvdXJjZVJlYWRSZXNwb25zZT4oJ21jcFNlcnZlci9yZXNvdXJjZS9yZWFkJywge1xuXHRcdFx0XHRcdHRocmVhZElkLFxuXHRcdFx0XHRcdHNlcnZlcjogc2VydmVyTmFtZSxcblx0XHRcdFx0XHR1cmksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNZXRob2Qgbm90IGZvdW5kOiAke21ldGhvZH1gKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzdGFydE1jcFNlcnZlcihzZXNzaW9uVXJpOiBVUkksIGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uVXJpKSk7XG5cdFx0Y29uc3Qgc2VydmVyTmFtZSA9IHNlc3Npb24gPyB0aGlzLl9yZXNvbHZlTWNwU2VydmVyTmFtZShzZXNzaW9uLCBpZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFzZXNzaW9uIHx8ICFzZXJ2ZXJOYW1lKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gQ2Fubm90IHN0YXJ0IHVua25vd24gTUNQIHNlcnZlciBjdXN0b21pemF0aW9uICR7aWR9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvbm4gPSBhd2FpdCB0aGlzLl9lbnN1cmVDb25uZWN0aW9uKCk7XG5cdFx0YXdhaXQgY29ubi5jbGllbnQucmVxdWVzdDwnY29uZmlnL21jcFNlcnZlci9yZWxvYWQnPignY29uZmlnL21jcFNlcnZlci9yZWxvYWQnLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRoaXMuX3JlZnJlc2hNY3BJbnZlbnRvcnkoY29ubi5jbGllbnQpO1xuXHR9XG5cblx0YXN5bmMgc3RvcE1jcFNlcnZlcihzZXNzaW9uVXJpOiBVUkksIGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uVXJpKSk7XG5cdFx0Y29uc3Qgc2VydmVyTmFtZSA9IHNlc3Npb24gPyB0aGlzLl9yZXNvbHZlTWNwU2VydmVyTmFtZShzZXNzaW9uLCBpZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFzZXNzaW9uIHx8ICFzZXJ2ZXJOYW1lKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gQ2Fubm90IHN0b3AgdW5rbm93biBNQ1Agc2VydmVyIGN1c3RvbWl6YXRpb24gJHtpZH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gVE9ETzogV2lyZSB0aGlzIHdoZW4gQ29kZXggZXhwb3NlcyBhIHR5cGVkIE1DUCBzZXJ2ZXIgc3RvcCByZXF1ZXN0LlxuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZU1jcFNlcnZlck5hbWUoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgaWQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMuX2dldE9yQ3JlYXRlTWNwQ29udHJvbGxlcihzZXNzaW9uKTtcblx0XHRjb250cm9sbGVyLmFwcGx5QWxsKGludmVudG9yeVRvU2RrU2VydmVycyh0aGlzLl9tY3BJbnZlbnRvcnkpKTtcblx0XHR0aGlzLl9yZWZyZXNoTWNwQ3VzdG9taXphdGlvbklkcyhzZXNzaW9uLCBjb250cm9sbGVyKTtcblx0XHRyZXR1cm4gY29udHJvbGxlci5zZXJ2ZXJOYW1lRm9yQ3VzdG9taXphdGlvbklkKGlkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMYXppbHkgY3JlYXRlIHRoZSBwZXItc2Vzc2lvbiB7QGxpbmsgTWNwQ3VzdG9taXphdGlvbkNvbnRyb2xsZXJ9LiBOb3Rcblx0ICogcmVnaXN0ZXJlZCBvbiB0aGUgYWdlbnQgKHNlc3Npb25zIGNvbWUgYW5kIGdvKSBcdTIwMTQgZGlzcG9zZWQgZXhwbGljaXRseVxuXHQgKiB3aGVuIHRoZSBzZXNzaW9uIGlzIHJlbW92ZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRPckNyZWF0ZU1jcENvbnRyb2xsZXIoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IE1jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyIHtcblx0XHRpZiAoIXNlc3Npb24ubWNwQ29udHJvbGxlcikge1xuXHRcdFx0c2Vzc2lvbi5tY3BDb250cm9sbGVyID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwQ3VzdG9taXphdGlvbkNvbnRyb2xsZXIsIHtcblx0XHRcdFx0cHJvdmlkZXJJZDogdGhpcy5pZCxcblx0XHRcdFx0c2Vzc2lvbklkOiBzZXNzaW9uLnNlc3Npb25JZCxcblx0XHRcdFx0c2Vzc2lvblVyaTogc2Vzc2lvbi5zZXNzaW9uVXJpLFxuXHRcdFx0XHRyZXNvbHZlQ2hpbGRJZDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRlbWl0OiBhY3Rpb24gPT4gdGhpcy5fZmlyZShzZXNzaW9uLnNlc3Npb25VcmksIGFjdGlvbiksXG5cdFx0XHRcdGNhcGFiaWxpdGllczogQ09ERVhfTUNQX0FQUF9DQVBBQklMSVRJRVMsXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHNlc3Npb24ubWNwQ29udHJvbGxlcjtcblx0fVxuXG5cdC8qKiBNaXJyb3JzIHRoZSBjb25uZWN0aW9uLWdsb2JhbCBpbnZlbnRvcnkgb250byBldmVyeSBsaXZlIHNlc3Npb24uICovXG5cdHByaXZhdGUgX2FwcGx5TWNwSW52ZW50b3J5VG9TZXNzaW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBzZXJ2ZXJzID0gaW52ZW50b3J5VG9TZGtTZXJ2ZXJzKHRoaXMuX21jcEludmVudG9yeSk7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoc2Vzc2lvbi5kaXNwb3NlZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLl9nZXRPckNyZWF0ZU1jcENvbnRyb2xsZXIoc2Vzc2lvbik7XG5cdFx0XHRjb250cm9sbGVyLmFwcGx5QWxsKHNlcnZlcnMpO1xuXHRcdFx0dGhpcy5fcmVmcmVzaE1jcEN1c3RvbWl6YXRpb25JZHMoc2Vzc2lvbiwgY29udHJvbGxlcik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlZnJlc2hlcyB0aGUgc2Vzc2lvbidzIG1hcHBlciBzbmFwc2hvdCBvZiBzZXJ2ZXIgbmFtZSBcdTIxOTIgY3VzdG9taXphdGlvbiBpZFxuXHQgKiAocmVhZCB3aGVuIHN0YW1waW5nIHRoZSBNQ1AgY29udHJpYnV0b3Igb24gdG9vbCBjYWxscykuIFBsYWluIGRhdGEsIG93bmVkXG5cdCAqIGhlcmUgXHUyMDE0IHRoZSBtYXBwZXIgbmV2ZXIgcmVhY2hlcyBiYWNrIGludG8gdGhlIGNvbnRyb2xsZXIuIE11c3QgcnVuIG9uIGV2ZXJ5XG5cdCAqIGludmVudG9yeSBjaGFuZ2UgYmVjYXVzZSBNQ1Agc2VydmVycyBhcmUgZGlzY292ZXJlZCBhc3luY2hyb25vdXNseSwgYWZ0ZXIgYVxuXHQgKiBzZXNzaW9uIChhbmQgcG9zc2libHkgaXRzIGZpcnN0IHRvb2wgY2FsbCkgYWxyZWFkeSBleGlzdHMuXG5cdCAqL1xuXHRwcml2YXRlIF9yZWZyZXNoTWNwQ3VzdG9taXphdGlvbklkcyhzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLCBjb250cm9sbGVyOiBNY3BDdXN0b21pemF0aW9uQ29udHJvbGxlcik6IHZvaWQge1xuXHRcdGNvbnN0IGlkcyA9IHNlc3Npb24ubWFwU3RhdGUubWNwQ3VzdG9taXphdGlvbklkcztcblx0XHRpZHMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IHNlcnZlck5hbWUgb2YgdGhpcy5fbWNwSW52ZW50b3J5LmtleXMoKSkge1xuXHRcdFx0Y29uc3QgaWQgPSBjb250cm9sbGVyLmN1c3RvbWl6YXRpb25JZEZvclNlcnZlcihzZXJ2ZXJOYW1lKTtcblx0XHRcdGlmIChpZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlkcy5zZXQoc2VydmVyTmFtZSwgaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1yZWFkcyB0aGUgZnVsbCBNQ1AgaW52ZW50b3J5IGZyb20gdGhlIGFwcC1zZXJ2ZXIgKHBhZ2luYXRlZCkgYW5kXG5cdCAqIHJlLXB1Ymxpc2hlcyBpdCB0byBldmVyeSBzZXNzaW9uLiBGaXJlcyBgbm90aWZpY2F0aW9ucy90b29scy9saXN0X2NoYW5nZWRgXG5cdCAqIG9uIGVhY2ggcmVhZHkgY2hhbm5lbCB3aG9zZSB0b29sIHNldCBjaGFuZ2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaE1jcEludmVudG9yeShjbGllbnQ6IElDb2RleEFwcFNlcnZlckNsaWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBkYXRhOiBMaXN0TWNwU2VydmVyU3RhdHVzUmVzcG9uc2VbJ2RhdGEnXSA9IFtdO1xuXHRcdHRyeSB7XG5cdFx0XHRsZXQgY3Vyc29yOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkID0gbnVsbDtcblx0XHRcdGRvIHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2U6IExpc3RNY3BTZXJ2ZXJTdGF0dXNSZXNwb25zZSA9IGF3YWl0IGNsaWVudC5yZXF1ZXN0PCdtY3BTZXJ2ZXJTdGF0dXMvbGlzdCcsIExpc3RNY3BTZXJ2ZXJTdGF0dXNSZXNwb25zZT4oJ21jcFNlcnZlclN0YXR1cy9saXN0JywgeyBjdXJzb3IsIGRldGFpbDogJ2Z1bGwnIH0pO1xuXHRcdFx0XHRkYXRhID0gZGF0YS5jb25jYXQocmVzcG9uc2UuZGF0YSk7XG5cdFx0XHRcdGN1cnNvciA9IHJlc3BvbnNlLm5leHRDdXJzb3I7XG5cdFx0XHR9IHdoaWxlIChjdXJzb3IpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIEZhaWxlZCB0byBsaXN0IE1DUCBzZXJ2ZXJzOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gRHJvcCB0aGUgcmVzdWx0IGlmIHRoZSBjb25uZWN0aW9uIHdhcyByZXBsYWNlZCB3aGlsZSB3ZSB3ZXJlIGxpc3RpbmcuXG5cdFx0aWYgKHRoaXMuX2Nvbm5lY3Rpb24ua2luZCA9PT0gJ3JlYWR5JyAmJiB0aGlzLl9jb25uZWN0aW9uLmNsaWVudCAhPT0gY2xpZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG5leHQgPSBjb2RleE1jcExpc3RUb0ludmVudG9yeShkYXRhKTtcblx0XHRjb25zdCB0b29sc0NoYW5nZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBbbmFtZSwgZW50cnldIG9mIG5leHQpIHtcblx0XHRcdGNvbnN0IHByZXYgPSB0aGlzLl9tY3BJbnZlbnRvcnkuZ2V0KG5hbWUpO1xuXHRcdFx0aWYgKHByZXYgJiYgY29kZXhNY3BUb29sc0NoYW5nZWQocHJldiwgZW50cnkpKSB7XG5cdFx0XHRcdHRvb2xzQ2hhbmdlZC5wdXNoKG5hbWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IFtuYW1lLCBlbnRyeV0gb2YgdGhpcy5fbWNwSW52ZW50b3J5KSB7XG5cdFx0XHRpZiAoIW5leHQuaGFzKG5hbWUpICYmIGVudHJ5LnN0YXRlLmtpbmQgIT09IE1jcFNlcnZlclN0YXR1cy5SZWFkeSkge1xuXHRcdFx0XHRuZXh0LnNldChuYW1lLCBlbnRyeSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX21jcEludmVudG9yeS5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgW25hbWUsIGVudHJ5XSBvZiBuZXh0KSB7XG5cdFx0XHR0aGlzLl9tY3BJbnZlbnRvcnkuc2V0KG5hbWUsIGVudHJ5KTtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIE1DUCBpbnZlbnRvcnkgcmVmcmVzaGVkOiAke3RoaXMuX21jcEludmVudG9yeS5zaXplID09PSAwID8gJyhub25lKScgOiBbLi4udGhpcy5fbWNwSW52ZW50b3J5XS5tYXAoKFtuYW1lLCBlbnRyeV0pID0+IGAke25hbWV9IFske2VudHJ5LnN0YXRlLmtpbmR9LCAke2VudHJ5LnRvb2xzLmxlbmd0aH0gdG9vbChzKV1gKS5qb2luKCcsICcpfWApO1xuXHRcdHRoaXMuX2FwcGx5TWNwSW52ZW50b3J5VG9TZXNzaW9ucygpO1xuXHRcdGZvciAoY29uc3QgbmFtZSBvZiB0b29sc0NoYW5nZWQpIHtcblx0XHRcdHRoaXMuX2ZpcmVNY3BUb29sc0xpc3RDaGFuZ2VkKG5hbWUpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIGEgYG1jcFNlcnZlci9zdGFydHVwU3RhdHVzL3VwZGF0ZWRgIG5vdGlmaWNhdGlvbi4gYHJlYWR5YFxuXHQgKiB0cmlnZ2VycyBhIGZ1bGwgaW52ZW50b3J5IHJlZnJlc2ggKHRvIHB1bGwgdGhlIG5vdy1sb2FkZWQgdG9vbHMpO1xuXHQgKiBvdGhlciB0cmFuc2l0aW9ucyB1cGRhdGUgdGhlIGNhY2hlZCBzdGF0ZSBpbiBwbGFjZSBzbyB0aGUgVUkgc2VlcyB0aGVcblx0ICogc2VydmVyIHNldHRsZSBpbnRvIHN0YXJ0aW5nL2Vycm9yL3N0b3BwZWQgcHJvbXB0bHkuXG5cdCAqL1xuXHRwcml2YXRlIF9oYW5kbGVNY3BTdGFydHVwU3RhdHVzKGNsaWVudDogSUNvZGV4QXBwU2VydmVyQ2xpZW50LCBuYW1lOiBzdHJpbmcsIHN0YXR1czogTWNwU2VydmVyU3RhcnR1cFN0YXRlLCBlcnJvcjogc3RyaW5nIHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb25uZWN0aW9uLmtpbmQgPT09ICdyZWFkeScgJiYgdGhpcy5fY29ubmVjdGlvbi5jbGllbnQgIT09IGNsaWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gTUNQIHNlcnZlciAnJHtuYW1lfScgc3RhcnR1cCBzdGF0dXM6ICR7c3RhdHVzfSR7ZXJyb3IgPyBgICgke2Vycm9yfSlgIDogJyd9YCk7XG5cdFx0aWYgKHN0YXR1cyA9PT0gJ3JlYWR5Jykge1xuXHRcdFx0dm9pZCB0aGlzLl9yZWZyZXNoTWNwSW52ZW50b3J5KGNsaWVudCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEFuIGF1dGgtZ2F0ZWQgaHR0cCBzZXJ2ZXIgd2hvc2Ugc2lnbi1pbiB3ZSBjYW4gZHJpdmU6IGRpc2NvdmVyIGl0c1xuXHRcdC8vIE9BdXRoIG1ldGFkYXRhIGFzeW5jaHJvbm91c2x5IChjb2RleCdzIGZhaWx1cmUgbm90aWZpY2F0aW9uIG9taXRzIGl0KVxuXHRcdC8vIGFuZCB0aGVuIHN1cmZhY2UgYEF1dGhSZXF1aXJlZGAuIFRoZSBzZXJ2ZXIgc3RheXMgaW4gaXRzIGN1cnJlbnRcblx0XHQvLyAoc3RhcnRpbmcpIHN0YXRlIHVudGlsIGRpc2NvdmVyeSByZXNvbHZlcy5cblx0XHRpZiAoc3RhdHVzID09PSAnZmFpbGVkJyAmJiBjb2RleFN0YXJ0dXBFcnJvck5lZWRzQXV0aChlcnJvcikpIHtcblx0XHRcdGNvbnN0IHVybCA9IHRoaXMuX21jcFNlcnZlclVybEZvck5hbWUobmFtZSk7XG5cdFx0XHRjb25zdCBub3JtYWxpemVkID0gdXJsICE9PSB1bmRlZmluZWQgPyBub3JtYWxpemVDb2RleE1jcFJlc291cmNlVXJsKHVybCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodXJsICE9PSB1bmRlZmluZWQgJiYgbm9ybWFsaXplZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdC8vIEEgdG9rZW4gd2UgYWxyZWFkeSBpbmplY3RlZCB3YXMgcmVqZWN0ZWQgKGV4cGlyZWQvcmV2b2tlZC9cblx0XHRcdFx0Ly8gaW5zdWZmaWNpZW50IHNjb3BlcykuIERyb3AgaXQgc28gdGhlIHVzZXIgaXMgcmUtcHJvbXB0ZWRcblx0XHRcdFx0Ly8gaW5zdGVhZCBvZiBnZXR0aW5nIHN0dWNrIG9uIGEgdGVybWluYWwgZXJyb3Igd2l0aCBubyB3YXkgdG9cblx0XHRcdFx0Ly8gcmUtYXV0aGVudGljYXRlLlxuXHRcdFx0XHRpZiAodGhpcy5fbWNwQXV0aFRva2Vucy5kZWxldGUobm9ybWFsaXplZCkpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gTUNQIHNlcnZlciAnJHtuYW1lfScgcmVqZWN0ZWQgdGhlIHN0b3JlZCB0b2tlbjsgY2xlYXJpbmcgaXQgdG8gYWxsb3cgcmUtYXV0aGVudGljYXRpb25gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR2b2lkIHRoaXMuX3N1cmZhY2VNY3BBdXRoUmVxdWlyZWQoY2xpZW50LCBuYW1lLCB1cmwsIGVycm9yKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9zZXRNY3BTZXJ2ZXJTdGF0ZShuYW1lLCB0cmFuc2xhdGVDb2RleE1jcFN0YXJ0dXBTdGF0ZShzdGF0dXMsIGVycm9yKSk7XG5cdH1cblxuXHQvKiogVXBzZXJ0cyBhIHNlcnZlcidzIGxpZmVjeWNsZSBzdGF0ZSBpbiB0aGUgaW52ZW50b3J5IChwcmVzZXJ2aW5nIGNhY2hlZCB0b29scykgYW5kIHJlcHVibGlzaGVzLiAqL1xuXHRwcml2YXRlIF9zZXRNY3BTZXJ2ZXJTdGF0ZShuYW1lOiBzdHJpbmcsIHN0YXRlOiBNY3BTZXJ2ZXJTdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IHByZXYgPSB0aGlzLl9tY3BJbnZlbnRvcnkuZ2V0KG5hbWUpO1xuXHRcdHRoaXMuX21jcEludmVudG9yeS5zZXQobmFtZSwge1xuXHRcdFx0c3RhdGUsXG5cdFx0XHR0b29sczogcHJldj8udG9vbHMgPz8gW10sXG5cdFx0XHRyZXNvdXJjZXM6IHByZXY/LnJlc291cmNlcyA/PyBbXSxcblx0XHRcdHJlc291cmNlVGVtcGxhdGVzOiBwcmV2Py5yZXNvdXJjZVRlbXBsYXRlcyA/PyBbXSxcblx0XHR9KTtcblx0XHR0aGlzLl9hcHBseU1jcEludmVudG9yeVRvU2Vzc2lvbnMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdXJmYWNlcyBhbiBhdXRoLWdhdGVkIGh0dHAgTUNQIHNlcnZlciBhcyB7QGxpbmsgTWNwU2VydmVyU3RhdHVzLkF1dGhSZXF1aXJlZH1cblx0ICogc28gdGhlIHdvcmtiZW5jaCBydW5zIHRoZSAqc2FtZSogT0F1dGggc2lnbi1pbiBpdCB1c2VzIGZvciB0aGUgQ29waWxvdFxuXHQgKiBhZ2VudC4gY29kZXgncyBgZmFpbGVkYCBub3RpZmljYXRpb24gY2FycmllcyBubyBSRkMgOTcyOCBtZXRhZGF0YSwgYW5kIHRoZVxuXHQgKiB3b3JrYmVuY2gncyBgcmVzb2x2ZU1jcFNlcnZlckF1dGhlbnRpY2F0aW9uYCBuZWVkcyB0aGUgcmVzb3VyY2Unc1xuXHQgKiBgYXV0aG9yaXphdGlvbl9zZXJ2ZXJzYCB0byBrbm93IHdoZXJlIHRvIHNpZ24gaW4gXHUyMDE0IHNvIHdlIGRpc2NvdmVyIHRoZVxuXHQgKiBQcm90ZWN0ZWQgUmVzb3VyY2UgTWV0YWRhdGEgKGA8dXJsPi8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2VgKVxuXHQgKiBoZXJlLCBtaXJyb3JpbmcgdGhlIGRpc2NvdmVyeSB0aGUgQ29waWxvdCBTREsgZG9lcyBpbnRlcm5hbGx5LiBPblxuXHQgKiBkaXNjb3ZlcnkgZmFpbHVyZSB3ZSBzdGlsbCBzdXJmYWNlIGBBdXRoUmVxdWlyZWRgIHdpdGggYmFyZSBtZXRhZGF0YSAodGhlXG5cdCAqIHNlcnZlciBnZW51aW5lbHkgbmVlZHMgYXV0aCk7IHRoZSBvbmUtY2xpY2sgc2lnbi1pbiBqdXN0IGNhbid0IGNvbXBsZXRlXG5cdCAqIHdpdGhvdXQgdGhlIGF1dGhvcml6YXRpb24gc2VydmVyLCB3aGljaCBpcyBsb2dnZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9zdXJmYWNlTWNwQXV0aFJlcXVpcmVkKGNsaWVudDogSUNvZGV4QXBwU2VydmVyQ2xpZW50LCBuYW1lOiBzdHJpbmcsIHVybDogc3RyaW5nLCBlcnJvcjogc3RyaW5nIHwgbnVsbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCByZXNvdXJjZTogUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSA9IHsgcmVzb3VyY2U6IHVybCwgcmVzb3VyY2VfbmFtZTogbmFtZSB9O1xuXHRcdGxldCByZXF1aXJlZFNjb3Blczogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRpc2NvdmVyZWQgPSBhd2FpdCByYWNlVGltZW91dChmZXRjaFJlc291cmNlTWV0YWRhdGEodXJsLCB1bmRlZmluZWQpLCAxNV8wMDApO1xuXHRcdFx0aWYgKGRpc2NvdmVyZWQpIHtcblx0XHRcdFx0cmVzb3VyY2UgPSBkaXNjb3ZlcmVkLm1ldGFkYXRhO1xuXHRcdFx0XHRyZXF1aXJlZFNjb3BlcyA9IGRpc2NvdmVyZWQubWV0YWRhdGEuc2NvcGVzX3N1cHBvcnRlZDtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIGRpc2NvdmVyZWQgT0F1dGggbWV0YWRhdGEgZm9yIE1DUCBzZXJ2ZXIgJyR7bmFtZX0nOiBhdXRob3JpemF0aW9uX3NlcnZlcnM9WyR7KGRpc2NvdmVyZWQubWV0YWRhdGEuYXV0aG9yaXphdGlvbl9zZXJ2ZXJzID8/IFtdKS5qb2luKCcsICcpfV1gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSB0aW1lZCBvdXQgZGlzY292ZXJpbmcgT0F1dGggbWV0YWRhdGEgZm9yIE1DUCBzZXJ2ZXIgJyR7bmFtZX0nIGF0ICR7dXJsfTsgdGhlIEF1dGhlbnRpY2F0ZSBhY3Rpb24gbWF5IG5vdCBiZSBhYmxlIHRvIGNvbXBsZXRlYCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gZmFpbGVkIHRvIGRpc2NvdmVyIE9BdXRoIG1ldGFkYXRhIGZvciBNQ1Agc2VydmVyICcke25hbWV9JyBhdCAke3VybH07IHRoZSBBdXRoZW50aWNhdGUgYWN0aW9uIG1heSBub3QgYmUgYWJsZSB0byBjb21wbGV0ZTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fVxuXHRcdC8vIERyb3AgdGhlIHJlc3VsdCBpZiB0aGUgY29ubmVjdGlvbiB3YXMgcmVwbGFjZWQgd2hpbGUgZGlzY292ZXJpbmcuXG5cdFx0aWYgKHRoaXMuX2Nvbm5lY3Rpb24ua2luZCA9PT0gJ3JlYWR5JyAmJiB0aGlzLl9jb25uZWN0aW9uLmNsaWVudCAhPT0gY2xpZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFJlY29yZCB3aGljaCBzZXJ2ZXIgVVJMIHRoaXMgT0F1dGggcmVzb3VyY2UgdW5sb2NrczogZGlzY292ZXJ5IGNhblxuXHRcdC8vIHJldHVybiBhIGByZXNvdXJjZWAgdGhhdCBkaWZmZXJzIGZyb20gdGhlIGNvbmZpZ3VyZWQgc2VydmVyIFVSTCwgYW5kXG5cdFx0Ly8gdGhlIHRva2VuIHRoZSB3b3JrYmVuY2ggbGF0ZXIgcHVzaGVzIGJhY2sgaXMga2V5ZWQgYnkgdGhhdCByZXNvdXJjZS5cblx0XHRjb25zdCBub3JtYWxpemVkU2VydmVyID0gbm9ybWFsaXplQ29kZXhNY3BSZXNvdXJjZVVybCh1cmwpO1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRSZXNvdXJjZSA9IG5vcm1hbGl6ZUNvZGV4TWNwUmVzb3VyY2VVcmwocmVzb3VyY2UucmVzb3VyY2UpID8/IG5vcm1hbGl6ZWRTZXJ2ZXI7XG5cdFx0aWYgKG5vcm1hbGl6ZWRTZXJ2ZXIgIT09IHVuZGVmaW5lZCAmJiBub3JtYWxpemVkUmVzb3VyY2UgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3Qgc2VydmVycyA9IHRoaXMuX21jcEF1dGhTZXJ2ZXJVcmxzQnlSZXNvdXJjZS5nZXQobm9ybWFsaXplZFJlc291cmNlKSA/PyBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdHNlcnZlcnMuYWRkKG5vcm1hbGl6ZWRTZXJ2ZXIpO1xuXHRcdFx0dGhpcy5fbWNwQXV0aFNlcnZlclVybHNCeVJlc291cmNlLnNldChub3JtYWxpemVkUmVzb3VyY2UsIHNlcnZlcnMpO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gTUNQIHNlcnZlciAnJHtuYW1lfScgcmVxdWlyZXMgYXV0aGVudGljYXRpb24gZm9yICR7dXJsfWApO1xuXHRcdHRoaXMuX3NldE1jcFNlcnZlclN0YXRlKG5hbWUsIHtcblx0XHRcdGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWQsXG5cdFx0XHRyZWFzb246IE1jcEF1dGhSZXF1aXJlZFJlYXNvbi5SZXF1aXJlZCxcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0cmVxdWlyZWRTY29wZXM6IHJlcXVpcmVkU2NvcGVzICYmIHJlcXVpcmVkU2NvcGVzLmxlbmd0aCA+IDAgPyByZXF1aXJlZFNjb3BlcyA6IHVuZGVmaW5lZCxcblx0XHRcdGRlc2NyaXB0aW9uOiBlcnJvciA/PyB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQnJvYWRjYXN0cyBgbm90aWZpY2F0aW9ucy90b29scy9saXN0X2NoYW5nZWRgIGZvciBgc2VydmVyTmFtZWAgb24gZXZlcnlcblx0ICogc2Vzc2lvbiB3aG9zZSBjaGFubmVsIGZvciB0aGF0IHNlcnZlciBpcyBjdXJyZW50bHkgcmVhZHkuIENsaWVudHNcblx0ICogcmVmZXRjaCBgdG9vbHMvbGlzdGAgaW4gcmVzcG9uc2UuXG5cdCAqL1xuXHRwcml2YXRlIF9maXJlTWNwVG9vbHNMaXN0Q2hhbmdlZChzZXJ2ZXJOYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5fc2Vzc2lvbnMudmFsdWVzKCkpIHtcblx0XHRcdGNvbnN0IGNoYW5uZWwgPSBzZXNzaW9uLm1jcENvbnRyb2xsZXI/LmNoYW5uZWxGb3JTZXJ2ZXIoc2VydmVyTmFtZSk7XG5cdFx0XHRpZiAoY2hhbm5lbCkge1xuXHRcdFx0XHR0aGlzLl9vbk1jcE5vdGlmaWNhdGlvbi5maXJlKHsgY2hhbm5lbCwgbWV0aG9kOiAnbm90aWZpY2F0aW9ucy90b29scy9saXN0X2NoYW5nZWQnIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBFbnN1cmVzIHRoZSBzZXNzaW9uIGhhcyBhIG1hdGVyaWFsaXplZCBjb2RleCB0aHJlYWQgYW5kIHJldHVybnMgaXRzIGlkLlxuXHQgKiBNQ1AgdG9vbCBjYWxscyAoYG1jcFNlcnZlci90b29sL2NhbGxgKSBhcmUgdGhyZWFkLXNjb3BlZCwgc28gYSBjYWxsXG5cdCAqIGFycml2aW5nIGJlZm9yZSB0aGUgZmlyc3QgdHVybiBsYXppbHkgc3RhcnRzIHRoZSB0aHJlYWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9lbnN1cmVUaHJlYWRJZChzZXNzaW9uOiBJQ29kZXhTZXNzaW9uKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRhd2FpdCB0aGlzLl9tYXRlcmlhbGl6ZUlmTmVlZGVkKHNlc3Npb24sIGZhbHNlKTtcblx0XHRpZiAoc2Vzc2lvbi50aHJlYWRJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBydW4gTUNQIHRvb2w6IGNvZGV4IHNlc3Npb24gJHtzZXNzaW9uLnNlc3Npb25JZH0gaXMgbm90IG1hdGVyaWFsaXplZGApO1xuXHRcdH1cblx0XHRyZXR1cm4gc2Vzc2lvbi50aHJlYWRJZDtcblx0fVxuXG5cdGFzeW5jIHNodXRkb3duKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2Rpc3Bvc2VDb25uZWN0aW9uKCk7XG5cdFx0Zm9yIChjb25zdCBzIG9mIHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRzLnBlbmRpbmdDb21tYW5kQXBwcm92YWxzLmRlbnlBbGwoJ2RlY2xpbmUnKTtcblx0XHRcdHMucGVuZGluZ0NsaWVudFRvb2xDYWxscy5yZWplY3RBbGwobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdFx0cy5wZW5kaW5nVXNlcklucHV0cy5yZWplY3RBbGwobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdFx0cy5tY3BDb250cm9sbGVyPy5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3Nlc3Npb25zLmNsZWFyKCk7XG5cdFx0dGhpcy5fc2Vzc2lvbklkQnlUaHJlYWRJZC5jbGVhcigpO1xuXHRcdHRoaXMuX21jcEludmVudG9yeS5jbGVhcigpO1xuXHR9XG5cblx0cmVzb2x2ZVNlc3Npb25Db25maWcocGFyYW1zOiBJQWdlbnRSZXNvbHZlU2Vzc2lvbkNvbmZpZ1BhcmFtcyk6IFByb21pc2U8UmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ+IHtcblx0XHRjb25zdCB2YWx1ZXMgPSBjb2RleFNlc3Npb25Db25maWdTY2hlbWEudmFsaWRhdGVPckRlZmF1bHQocGFyYW1zLmNvbmZpZywgY29kZXhTZXNzaW9uQ29uZmlnRGVmYXVsdHMpO1xuXHRcdGNvbnN0IHNjaGVtYSA9IGNvZGV4VmlzaWJsZVNlc3Npb25Db25maWdTY2hlbWEudG9Qcm90b2NvbCgpO1xuXHRcdC8vIFByZXNlcnZlIGV2ZXJ5IHZhbHVlIHRoZSBjYWxsZXIgcHJldmlvdXNseSBwZXJzaXN0ZWQuIFRoaXMgcmV0dXJuXG5cdFx0Ly8gUkVQTEFDRVMgdGhlIHN0b3JlZCBzZXNzaW9uIGNvbmZpZyBvbiByZXN0b3JlIChzZWVcblx0XHQvLyBgQWdlbnRTZXJ2aWNlLl9yZXNvbHZlQ3JlYXRlZFNlc3Npb25Db25maWdgKSwgc28gY2hlcnJ5LXBpY2tpbmcgb25seVxuXHRcdC8vIHRoZSB2aXNpYmxlIGtleXMgaGVyZSB3b3VsZCByZXNldCBhbGwgdGhlIG90aGVycyAocmVhc29uaW5nIGVmZm9ydCxcblx0XHQvLyBwZXJzb25hbGl0eSwgc2FuZGJveCBheGVzLCBcdTIwMjYpIGJhY2sgdG8gdGhlaXIgZGVmYXVsdHMgb24gcmVzdW1lLlxuXHRcdGNvbnN0IHJlc29sdmVkVmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHtcblx0XHRcdC4uLnBhcmFtcy5jb25maWcsXG5cdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXTogdmFsdWVzW1Nlc3Npb25Db25maWdLZXkuTW9kZV0sXG5cdFx0fTtcblx0XHQvLyBNaWdyYXRlIHRoZSBwZXJtaXNzaW9uIGF4ZXMgb2ZmIHRoZSByYXcgY29uZmlnLiBgdmFsaWRhdGVPckRlZmF1bHRgXG5cdFx0Ly8gYWx3YXlzIG1hdGVyaWFsaXplcyBgcGVybWlzc2lvbnNQcmVzZXQ9J2RlZmF1bHQnYCwgYnV0IGJsaW5kbHkgc3RvcmluZ1xuXHRcdC8vIHRoYXQgd291bGQgc2lsZW50bHkgZXNjYWxhdGUgYSBsZWdhY3kgc2Vzc2lvbiB0aGF0IHBlcnNpc3RlZCBvbmx5IHRoZVxuXHRcdC8vIGluZGl2aWR1YWwgYHNhbmRib3hNb2RlYC9gYXBwcm92YWxQb2xpY3lgIGF4ZXMgKGUuZy4gYHJlYWQtb25seWApIFx1MjAxNFxuXHRcdC8vIGByZXNvbHZlQ29kZXhQZXJtaXNzaW9uc2AgY2hlY2tzIHRoZSBwcmVzZXQgZmlyc3QuIERyb3AgYWxsIHRocmVlXG5cdFx0Ly8gcGVybWlzc2lvbiBrZXlzLCB0aGVuIHJlLWFwcGx5IG9ubHkgdGhlIG9uZXMgdGhlIG1pZ3JhdGlvbiBkZWNpZGVzIGFyZVxuXHRcdC8vIHNhZmUgKGFuIGV4cGxpY2l0IG9yIGV4YWN0bHktZXF1aXZhbGVudCBwcmVzZXQsIGVsc2UgdGhlIHJhdyBheGVzKS5cblx0XHRkZWxldGUgcmVzb2x2ZWRWYWx1ZXNbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zUHJlc2V0XTtcblx0XHRkZWxldGUgcmVzb2x2ZWRWYWx1ZXNbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LkFwcHJvdmFsUG9saWN5XTtcblx0XHRkZWxldGUgcmVzb2x2ZWRWYWx1ZXNbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlNhbmRib3hNb2RlXTtcblx0XHRPYmplY3QuYXNzaWduKHJlc29sdmVkVmFsdWVzLCBtaWdyYXRlQ29kZXhQZXJtaXNzaW9uVmFsdWVzKHBhcmFtcy5jb25maWcsIHtcblx0XHRcdGFwcHJvdmFsUG9saWN5OiBjb2RleFNlc3Npb25Db25maWdEZWZhdWx0c1tDb2RleFNlc3Npb25Db25maWdLZXkuQXBwcm92YWxQb2xpY3ldLFxuXHRcdFx0c2FuZGJveE1vZGU6IGNvZGV4U2Vzc2lvbkNvbmZpZ0RlZmF1bHRzW0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5TYW5kYm94TW9kZV0sXG5cdFx0fSkpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyB2YWx1ZXM6IHJlc29sdmVkVmFsdWVzLCBzY2hlbWEgfSk7XG5cdH1cblxuXHRhc3luYyBzZXNzaW9uQ29uZmlnQ29tcGxldGlvbnMocGFyYW1zOiBJQWdlbnRTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNQYXJhbXMpOiBQcm9taXNlPFNlc3Npb25Db25maWdDb21wbGV0aW9uc1Jlc3VsdD4ge1xuXHRcdGlmIChwYXJhbXMucHJvcGVydHkgIT09IENvZGV4U2Vzc2lvbkNvbmZpZ0tleS5BZGRpdGlvbmFsRGlyZWN0b3JpZXMpIHtcblx0XHRcdHJldHVybiB7IGl0ZW1zOiBbXSB9O1xuXHRcdH1cblx0XHRjb25zdCBxdWVyeSA9IHBhcmFtcy5xdWVyeT8udHJpbSgpO1xuXHRcdGlmICghcXVlcnkpIHtcblx0XHRcdHJldHVybiB7IGl0ZW1zOiBbXSB9O1xuXHRcdH1cblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gcGFyYW1zLndvcmtpbmdEaXJlY3Rvcnk/LmZzUGF0aDtcblx0XHRjb25zdCByZXNvbHZlZCA9IGlzQWJzb2x1dGUocXVlcnkpXG5cdFx0XHQ/IHF1ZXJ5XG5cdFx0XHQ6IHJlc29sdmUod29ya2luZ0RpcmVjdG9yeSA/PyBwcm9jZXNzLmN3ZCgpLCBxdWVyeSk7XG5cdFx0Y29uc3QgcGFyZW50ID0gcXVlcnkuZW5kc1dpdGgoc2VwKSA/IHJlc29sdmVkIDogZGlybmFtZShyZXNvbHZlZCk7XG5cdFx0Y29uc3QgcHJlZml4ID0gcXVlcnkuZW5kc1dpdGgoc2VwKSA/ICcnIDogYmFzZW5hbWUocmVzb2x2ZWQpLnRvTG93ZXJDYXNlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGVudHJpZXMgPSBhd2FpdCBmcy5wcm9taXNlcy5yZWFkZGlyKHBhcmVudCwgeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aXRlbXM6IGVudHJpZXNcblx0XHRcdFx0XHQuZmlsdGVyKGVudHJ5ID0+IGVudHJ5LmlzRGlyZWN0b3J5KCkgJiYgZW50cnkubmFtZS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgocHJlZml4KSlcblx0XHRcdFx0XHQuc2xpY2UoMCwgNTApXG5cdFx0XHRcdFx0Lm1hcChlbnRyeSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IGpvaW4ocGFyZW50LCBlbnRyeS5uYW1lKTtcblx0XHRcdFx0XHRcdHJldHVybiB7IHZhbHVlLCBsYWJlbDogZW50cnkubmFtZSwgZGVzY3JpcHRpb246IHZhbHVlIH07XG5cdFx0XHRcdFx0fSksXG5cdFx0XHR9O1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHsgaXRlbXM6IFtdIH07XG5cdFx0fVxuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgX2ZpcmUoc2Vzc2lvblVyaTogVVJJLCBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZmlyZSh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogaXNDaGF0QWN0aW9uKGFjdGlvbikgPyBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSkgOiBzZXNzaW9uVXJpLCBhY3Rpb24gfSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2VDb25uZWN0aW9uKCk7XG5cdFx0Zm9yIChjb25zdCBzIG9mIHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRzLnBlbmRpbmdDb21tYW5kQXBwcm92YWxzLmRlbnlBbGwoJ2RlY2xpbmUnKTtcblx0XHRcdHMucGVuZGluZ0NsaWVudFRvb2xDYWxscy5yZWplY3RBbGwobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdFx0cy5wZW5kaW5nVXNlcklucHV0cy5yZWplY3RBbGwobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdFx0cy5tY3BDb250cm9sbGVyPy5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgc3ViYWdlbnQgb2YgdGhpcy5fc3ViYWdlbnRzQnlUaHJlYWRJZC52YWx1ZXMoKSkge1xuXHRcdFx0c3ViYWdlbnQuc2Vzc2lvbi5wZW5kaW5nQ29tbWFuZEFwcHJvdmFscy5kZW55QWxsKCdkZWNsaW5lJyk7XG5cdFx0fVxuXHRcdHRoaXMuX3N1YmFnZW50c0J5VGhyZWFkSWQuY2xlYXIoKTtcblx0XHR0aGlzLl9zZXNzaW9ucy5jbGVhcigpO1xuXHRcdHRoaXMuX3Nlc3Npb25JZEJ5VGhyZWFkSWQuY2xlYXIoKTtcblx0XHR0aGlzLl9tY3BJbnZlbnRvcnkuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcGFyc2VCaW5hcnlBcmdzKGpzb246IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZ1tdIHtcblx0aWYgKCFqc29uKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdHRyeSB7XG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShqc29uKTtcblx0XHRyZXR1cm4gQXJyYXkuaXNBcnJheShwYXJzZWQpID8gcGFyc2VkLmZpbHRlcigodik6IHYgaXMgc3RyaW5nID0+IHR5cGVvZiB2ID09PSAnc3RyaW5nJykgOiBbXTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG59XG5cbi8qKlxuICogVGhlIHN1ZmZpeCBDb2RleCB1c2VzIGZvciBpdHMgcGxhdGZvcm0gYG9wdGlvbmFsRGVwZW5kZW5jaWVzYCBwYWNrYWdlc1xuICogKGBAb3BlbmFpL2NvZGV4LSR7c3VmZml4fWApLiBDb2RleCdzIExpbnV4IGJpbmFyaWVzIGFyZSBzdGF0aWNhbGx5XG4gKiBtdXNsLWxpbmtlZCBhbmQgc2hpcCB1bmRlciB0aGUgc2FtZSBgbGludXgtPGFyY2g+YCBwYWNrYWdlIHJlZ2FyZGxlc3Mgb2ZcbiAqIGhvc3QgbGliYywgc28gdGhpcyBuZXZlciByZXR1cm5zIGEgYC1tdXNsYCBzdWZmaXguXG4gKlxuICogUmV0dXJucyB1bmRlZmluZWQgZm9yIHVuc3VwcG9ydGVkIGAocGxhdGZvcm0sIGFyY2gpYCBjb21iaW5hdGlvbnMgXHUyMDE0IHRoZVxuICogY2FsbGVyIHN1cmZhY2VzIHRoZSBlcnJvci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvZGV4UGFja2FnZVN1ZmZpeChwbGF0Zm9ybTogTm9kZUpTLlBsYXRmb3JtLCBhcmNoOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoKHBsYXRmb3JtICE9PSAnbGludXgnICYmIHBsYXRmb3JtICE9PSAnZGFyd2luJyAmJiBwbGF0Zm9ybSAhPT0gJ3dpbjMyJykgfHxcblx0XHQoYXJjaCAhPT0gJ3g2NCcgJiYgYXJjaCAhPT0gJ2FybTY0JykpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBgJHtwbGF0Zm9ybX0tJHthcmNofWA7XG59XG5cbi8qKlxuICogTWlycm9ycyB0aGUgdHJpcGxlIHRhYmxlIGluc2lkZSBgQG9wZW5haS9jb2RleC9iaW4vY29kZXguanNgIHNvIHdlIGNhbiBzcGF3blxuICogdGhlIG5hdGl2ZSBiaW5hcnkgYXQgYHZlbmRvci88dHJpcGxlPi9iaW4vY29kZXhgIGRpcmVjdGx5IHdpdGhvdXQgZ29pbmdcbiAqIHRocm91Z2ggdGhlIEpTIHNoaW0gbGF1bmNoZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb2RleEJpbmFyeVRyaXBsZShzZGtUYXJnZXQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHN3aXRjaCAoc2RrVGFyZ2V0KSB7XG5cdFx0Y2FzZSAnbGludXgteDY0JzogcmV0dXJuICd4ODZfNjQtdW5rbm93bi1saW51eC1tdXNsJztcblx0XHRjYXNlICdsaW51eC1hcm02NCc6IHJldHVybiAnYWFyY2g2NC11bmtub3duLWxpbnV4LW11c2wnO1xuXHRcdGNhc2UgJ2Rhcndpbi14NjQnOiByZXR1cm4gJ3g4Nl82NC1hcHBsZS1kYXJ3aW4nO1xuXHRcdGNhc2UgJ2Rhcndpbi1hcm02NCc6IHJldHVybiAnYWFyY2g2NC1hcHBsZS1kYXJ3aW4nO1xuXHRcdGNhc2UgJ3dpbjMyLXg2NCc6IHJldHVybiAneDg2XzY0LXBjLXdpbmRvd3MtbXN2Yyc7XG5cdFx0Y2FzZSAnd2luMzItYXJtNjQnOiByZXR1cm4gJ2FhcmNoNjQtcGMtd2luZG93cy1tc3ZjJztcblx0XHRkZWZhdWx0OiByZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogTG9jYXRlIHRoZSBTREsgcm9vdCBmb3IgdGhlIGRldiAocnVubmluZy1mcm9tLXNvdXJjZSkgZmFsbGJhY2sgYnkgcmVzb2x2aW5nXG4gKiBgQG9wZW5haS9jb2RleGAgXHUyMDE0IGEgZGV2RGVwZW5kZW5jeSBpbiBzb3VyY2UgY2hlY2tvdXRzIFx1MjAxNCBvdXQgb2YgdGhpcyByZXBvJ3NcbiAqIGBub2RlX21vZHVsZXNgLiBSZXR1cm5zIHRoZSBkaXJlY3RvcnkgdGhhdCAqY29udGFpbnMqIHRoYXQgYG5vZGVfbW9kdWxlc2BcbiAqIChpLmUuIHRoZSB2YWx1ZSBgX3N0YXJ0Q29ubmVjdGlvbmAgam9pbnMgYG5vZGVfbW9kdWxlcy9Ab3BlbmFpL2NvZGV4LTx0YXJnZXQ+YFxuICogb250byksIG9yIHVuZGVmaW5lZCB3aGVuIHRoZSBwYWNrYWdlIGNhbid0IGJlIHJlc29sdmVkIChlLmcuIGEgYnVpbHQgcHJvZHVjdFxuICogd2hlcmUgaXQgaXNuJ3Qgc2hpcHBlZCkuIGBAb3BlbmFpL2NvZGV4YCBkZWNsYXJlcyBubyBgZXhwb3J0c2AgbWFwLCBzbyBpdHNcbiAqIGBwYWNrYWdlLmpzb25gIGlzIHJlc29sdmFibGUuXG4gKlxuICogYHJlc29sdmVQYWNrYWdlSnNvblBhdGhgIGlzIGEgc2VhbSBmb3IgdGVzdHM7IHByb2R1Y3Rpb24gcmVzb2x2ZXMgdGhlIHBhdGhcbiAqIHZpYSB7QGxpbmsgZGVmYXVsdFJlc29sdmVDb2RleFBhY2thZ2VKc29uUGF0aH0uXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXNvbHZlQ29kZXhEZXZTZGtSb290KFxuXHRyZXNvbHZlUGFja2FnZUpzb25QYXRoOiAoKSA9PiBzdHJpbmcgfCBQcm9taXNlPHN0cmluZz4gPSBkZWZhdWx0UmVzb2x2ZUNvZGV4UGFja2FnZUpzb25QYXRoLFxuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0dHJ5IHtcblx0XHRjb25zdCBwa2dKc29uID0gYXdhaXQgcmVzb2x2ZVBhY2thZ2VKc29uUGF0aCgpO1xuXHRcdC8vIDxyb290Pi9ub2RlX21vZHVsZXMvQG9wZW5haS9jb2RleC9wYWNrYWdlLmpzb24gXHUyMTkyIDxyb290PlxuXHRcdHJldHVybiBkaXJuYW1lKGRpcm5hbWUoZGlybmFtZShkaXJuYW1lKHBrZ0pzb24pKSkpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRlZmF1bHRSZXNvbHZlQ29kZXhQYWNrYWdlSnNvblBhdGgoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0Ly8gRHluYW1pYyBpbXBvcnQgb2YgYG5vZGU6bW9kdWxlYCAobm90IGEgc3RhdGljIHRvcC1sZXZlbCBpbXBvcnQpOiB0aGVcblx0Ly8gdW5pdC10ZXN0IGVsZWN0cm9uIHJlbmRlcmVyIHRoYXQgbG9hZHMgdGhpcyBtb2R1bGUgZm9yXG5cdC8vIGBjb2RleFBhY2thZ2VQYXRocy50ZXN0YCBjYW5ub3QgZmV0Y2ggYSBzdGF0aWMgYG5vZGU6bW9kdWxlYCBpbXBvcnQsIHNvXG5cdC8vIHRoZSBzaWJsaW5nIFdTTC9TU0ggaG9zdCBzZXJ2aWNlcyByZXNvbHZlIGBjcmVhdGVSZXF1aXJlYCB0aGUgc2FtZSB3YXlcblx0Ly8gZm9yIHRoZSBzYW1lIHJlYXNvbi5cblx0Y29uc3QgeyBjcmVhdGVSZXF1aXJlIH0gPSBhd2FpdCBpbXBvcnQoJ25vZGU6bW9kdWxlJyk7XG5cdHJldHVybiBjcmVhdGVSZXF1aXJlKGltcG9ydC5tZXRhLnVybCkucmVzb2x2ZSgnQG9wZW5haS9jb2RleC9wYWNrYWdlLmpzb24nKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7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
