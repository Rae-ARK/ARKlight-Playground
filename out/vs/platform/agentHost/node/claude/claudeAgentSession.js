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
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../base/common/resources.js";
import { INativeEnvironmentService } from "../../../environment/common/environment.js";
import { IFileService } from "../../../files/common/files.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { ILogService } from "../../../log/common/log.js";
import { IAgentConfigurationService } from "../agentConfigurationService.js";
import { toRuntimeEffortLevel, resolveClaudeEffort } from "../../common/claudeModelConfig.js";
import { PendingRequestRegistry } from "../../common/pendingRequestRegistry.js";
import { ISessionDataService } from "../../common/sessionDataService.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { ChatInputResponseKind, ToolCallContributorKind } from "../../common/state/protocol/state.js";
import { isDefaultChatUri } from "../../common/state/sessionState.js";
import { IClaudeAgentSdkService } from "./claudeAgentSdkService.js";
import { buildClientMcpServers, buildOptions } from "./claudeSdkOptions.js";
import { toSdkModelId } from "./claudeModelId.js";
import { buildServerToolMcpServer, CLAUDE_SERVER_TOOL_MCP_SERVER_NAME, serverToolAllowList } from "./claudeServerToolMcpServer.js";
import { convertToolCallResult } from "./clientTools/claudeClientToolResult.js";
import { readClaudePermissionMode } from "./claudeSessionPermissionMode.js";
import { SessionClientToolsDiff } from "./clientTools/claudeSessionClientToolsModel.js";
import { SessionClientCustomizationsDiff } from "./customizations/claudeSessionClientCustomizationsModel.js";
import { ClaudeCustomizationWatcher, buildDiscoveredCustomizations, resolveClaudeAgentName } from "./customizations/claudeSessionCustomizationDiscovery.js";
import { applyMcpServerEnablement, findMcpChildId, findMcpServerName, getEffectiveMcpServerCustomizations } from "../shared/mcpCustomizationController.js";
import { scanClaudeHooks } from "./customizations/scan/claudeHookScan.js";
import { scanClaudeMcpServers } from "./customizations/scan/claudeMcpScan.js";
import { IAgentHostStateManager } from "../agentHostStateManager.js";
import { scanClaudeRules } from "./customizations/scan/claudeRuleScan.js";
import { discoverClaudeMultiRootCustomizations } from "./customizations/claudeMultiRootCustomizationDiscovery.js";
import { resolvePromptToContentBlocks } from "./claudePromptResolver.js";
import { ClaudeSdkPipeline } from "./claudeSdkPipeline.js";
import { SubagentRegistry } from "./claudeSubagentRegistry.js";
function resolveCurrentPermissionMode(configurationService, sessionUri, permissionModeFallback) {
  return readClaudePermissionMode(configurationService, sessionUri) ?? permissionModeFallback;
}
function sameWorkingDirectories(a, b) {
  if (!a || !b) {
    return a === b;
  }
  if (a.length !== b.length) {
    return false;
  }
  return a.every((directory, index) => isEqual(directory, b[index]));
}
let ClaudeAgentSession = class extends Disposable {
  constructor(sessionId, sessionUri, chatChannelUri, workspace, project, model, agent, config, abortController, _pendingClientToolCalls, toolDiff, _permissionModeFallback, _metadataStore, additionalDirectories, _instantiationService, _configurationService, _stateManager, _sdkService, _sessionDataService, _logService, _fileService, _environmentService) {
    super();
    this.sessionId = sessionId;
    this.sessionUri = sessionUri;
    this.chatChannelUri = chatChannelUri;
    this.workspace = workspace;
    this._pendingClientToolCalls = _pendingClientToolCalls;
    this._permissionModeFallback = _permissionModeFallback;
    this._metadataStore = _metadataStore;
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._stateManager = _stateManager;
    this._sdkService = _sdkService;
    this._sessionDataService = _sessionDataService;
    this._logService = _logService;
    this._fileService = _fileService;
    this._environmentService = _environmentService;
    this._customizationWatcher = this._register(new MutableDisposable());
    /**
     * Phase 12 — per-session registry of Task tool calls that spawn
     * subagents (`SubagentSpawn` records keyed by `tool_use_id`, plus a
     * reverse index from inner `tool_use_id` to its parent Task). Owned
     * here so the registry dies with the session; consumers in the live
     * mapper (`ClaudeSdkMessageRouter` / `claudeMapSessionEvents` /
     * `claudeSubagentSignals`) and the `canUseTool` bridge read from
     * the same instance via the session.
     */
    this.subagents = this._register(new SubagentRegistry());
    /**
     * Phase 7 / S3.2. Tool-permission deferreds parked inside
     * {@link Options.canUseTool}. Keyed by SDK `tool_use_id`.
     */
    this._pendingPermissions = new PendingRequestRegistry();
    /**
     * Phase 7 / S3.2. User-input deferreds parked for interactive tools
     * (`AskUserQuestion`, `ExitPlanMode`). Keyed by `ChatInputRequest.id`.
     */
    this._pendingUserInputs = new PendingRequestRegistry();
    /**
     * Phase 11 — per-session **client-pushed** synced customization
     * snapshot + enablement map. Owns the workbench-supplied
     * {@link ISyncedCustomization} list, the per-URI enablement bits,
     * and the dirty flag drained at the next {@link send} pre-flight.
     * Exists from `createProvisional` onward so client-side reads /
     * toggles work uniformly before and after materialize.
     *
     * Server-side (SDK-discovered) customizations are NOT stored here
     * — they're fetched on demand from the live `Query` in
     * {@link getSessionCustomizations}.
     *
     * See {@link SessionClientCustomizationsDiff}.
     */
    this.clientCustomizationsDiff = this._register(new SessionClientCustomizationsDiff());
    this._onDidSessionProgress = this._register(new Emitter());
    this.onDidSessionProgress = this._onDidSessionProgress.event;
    /**
     * Real Copilot credits (in nano-AIU) billed by CAPI for the current
     * turn, summed across every `/v1/messages` request the SDK made
     * (including subagents). Fed by {@link recordTurnCredits} from the
     * proxy's `onDidReportCredits`, reset at the start of each {@link send},
     * and attached to the turn's `ChatUsage` signal by
     * {@link _enrichSignalWithCredits}. Unlike the SDK's `total_cost_usd`
     * (an Anthropic-list-price estimate), this is what CAPI actually bills.
     */
    this._currentTurnNanoAiu = 0;
    /**
     * Transport the session materialized under (Phase 19). Defaults to `proxy`
     * until {@link materialize} resolves it from {@link IMaterializeContext}.
     * Gates {@link _enrichSignalWithCredits} so native turns never carry a
     * Copilot credits overlay (the proxy is the only credit source).
     */
    this._transportKind = "proxy";
    // #endregion
    // #region Phase 11 — customizations / plugins
    /**
     * Merged fire-and-forget signal that this session's customization
     * surface changed. Fires from three sources:
     *
     * 1. Client-side writes (`adoptClientCustomizations`) — via the
     *    {@link SessionClientCustomizationsDiff} observable wired up in the
     *    constructor.
     * 2. Materialize completes — surfaces the server-side
     *    (SDK-discovered) tier to the workbench for the first time.
     * 3. The send() pre-flight rebind completes — the rebuilt SDK's
     *    resolved set may have changed.
     *
     * Drives a workbench refetch of {@link getSessionCustomizations}.
     * Does NOT itself trigger any SDK action — the dirty bit on
     * {@link SessionClientCustomizationsDiff} drives plugin rebinds,
     * and only flips on client-side writes.
     */
    this._onDidCustomizationsChange = this._register(new Emitter());
    this.onDidCustomizationsChange = this._onDidCustomizationsChange.event;
    /** Snapshot of the last {@link getSessionCustomizations} result, read by {@link _enrichSignalWithMcpContributor}. */
    this._lastCustomizations = [];
    this._chatChannelUri = chatChannelUri;
    this.project = project;
    this._provisionalModel = model;
    this._provisionalAgent = agent;
    this.provisionalConfig = config;
    this.abortController = abortController;
    this._additionalDirectories = additionalDirectories;
    this.toolDiff = this._register(toolDiff);
    this._register(this.clientCustomizationsDiff.onDidChange(() => this._onDidCustomizationsChange.fire()));
    this._watchCustomizations(this.workingDirectories);
  }
  /**
   * URI under which this chat's per-chat resources (its session database,
   * metadata overlay, config scope and server-tool advertisement) are keyed.
   * The default chat uses the real session URI; an additional peer chat uses
   * its own `ahp-chat` channel URI so its chat state stays isolated
   * from the default chat's. `sessionUri` always remains the real session URI
   * and `chatChannelUri` always the chat channel — they are never overloaded.
   */
  get _storageUri() {
    return isDefaultChatUri(this._chatChannelUri) ? this.sessionUri : this._chatChannelUri;
  }
  get _sessionCustomizations() {
    return this._stateManager.getSessionState(this.sessionUri.toString())?.customizations ?? [];
  }
  /**
   * The actual directory work is done in. Defaults to {@link workspace} until
   * the host hands the session a resolved working directory (e.g. an isolated
   * worktree) at {@link materialize} time. `undefined` only when the session is
   * workspace-less and has no resolved directory yet.
   */
  get workingDirectory() {
    return this._workingDirectory ?? this.workspace;
  }
  /**
   * The full ordered working-directory set (index 0 = primary, 1..N =
   * {@link _additionalDirectories}). `undefined` only when the session has no
   * resolved primary yet (workspace-less, pre-materialize).
   */
  get workingDirectories() {
    const primary = this.workingDirectory;
    return primary ? [primary, ...this._additionalDirectories] : void 0;
  }
  /** Exposed for the materializer's MCP-server build closure. */
  get pendingClientToolCalls() {
    return this._pendingClientToolCalls;
  }
  /** Snapshot of permission-mode fallback used when live read is undefined. */
  get permissionModeFallback() {
    return this._permissionModeFallback;
  }
  static createProvisional(sessionId, sessionUri, chatChannelUri, workspace, project, model, agent, config, pendingClientToolCalls, permissionModeFallback, metadataStore, instantiationService, additionalDirectories = []) {
    return instantiationService.createInstance(
      ClaudeAgentSession,
      sessionId,
      sessionUri,
      chatChannelUri,
      workspace,
      project,
      model,
      agent,
      config,
      new AbortController(),
      pendingClientToolCalls,
      new SessionClientToolsDiff(),
      permissionModeFallback,
      metadataStore,
      additionalDirectories
    );
  }
  /**
   * Accumulate proxy-reported billed credits for the in-flight turn.
   * Called from {@link ClaudeAgent} for every proxy `onDidReportCredits`
   * routed to this session. Ignores non-positive / non-finite values.
   */
  recordTurnCredits(totalNanoAiu) {
    if (Number.isFinite(totalNanoAiu) && totalNanoAiu > 0) {
      this._currentTurnNanoAiu += totalNanoAiu;
    }
  }
  /**
   * Inject the turn's accumulated Copilot credits into its `ChatUsage`
   * signal as `_meta.copilotUsage.totalNanoAiu` — the well-known key the
   * workbench prefers over `_meta.cost` when rendering per-turn credits.
   * All other signals pass through untouched.
   */
  _enrichSignalWithCredits(signal) {
    if (this._transportKind !== "proxy" || signal.kind !== "action" || signal.action.type !== ActionType.ChatUsage || this._currentTurnNanoAiu <= 0) {
      return signal;
    }
    const usage = signal.action.usage;
    return {
      ...signal,
      action: {
        ...signal.action,
        usage: {
          ...usage,
          _meta: {
            ...usage._meta,
            copilotUsage: { totalNanoAiu: this._currentTurnNanoAiu }
          }
        }
      }
    };
  }
  /**
   * Stamps the MCP {@link ToolCallContributor} onto a `ChatToolCallStart` for
   * an external `mcp__<server>__<tool>` call, resolved from this session's
   * cached customization snapshot. Owned here because the session owns the
   * customization data; the stream mapper stays free of it. (The in-process
   * `mcp__client__` server already carries a Client contributor from the mapper.)
   */
  _enrichSignalWithMcpContributor(signal) {
    if (signal.kind !== "action" || signal.action.type !== ActionType.ChatToolCallStart || signal.action.contributor !== void 0) {
      return signal;
    }
    const toolName = signal.action.toolName;
    if (!toolName.startsWith("mcp__")) {
      return signal;
    }
    const serverName = toolName.split("__")[1];
    const customizationId = serverName ? findMcpChildId(this._lastCustomizations, serverName) : void 0;
    if (customizationId === void 0) {
      return signal;
    }
    return { ...signal, action: { ...signal.action, contributor: { kind: ToolCallContributorKind.MCP, customizationId } } };
  }
  _watchCustomizations(directories) {
    const store = new DisposableStore();
    const watcher = store.add(new ClaudeCustomizationWatcher(
      directories,
      this._environmentService.userHome,
      this._fileService,
      this._logService
    ));
    store.add(watcher.onDidChange(() => this._onDidCustomizationsChange.fire()));
    this._customizationWatcher.value = store;
  }
  /**
   * In-place truncation to `turnId` ("Restore Checkpoint"): prune the
   * per-turn DB rows (file edits, checkpoint refs) past the boundary AND
   * stage the SDK resume anchor that the next rebuild applies via
   * `Options.resumeSessionAt`. These two halves are one invariant — pruning
   * without staging the anchor would drop DB rows while the SDK still
   * replays the truncated turns; staging without pruning would leave stale
   * rows — so they live behind a single call rather than two the caller
   * could half-invoke. The prune runs first because it is the fallible half:
   * a DB failure then rejects without leaving an anchor staged for the next
   * turn. `turnId` is the protocol turn id (DB key); `resumeAnchorUuid` is
   * the SDK assistant-message uuid the agent resolved for it.
   */
  async truncateToTurn(turnId, resumeAnchorUuid) {
    await this._withDatabase((db) => db.deleteTurnsAfter(turnId));
    this._pendingResumeSessionAt = resumeAnchorUuid;
  }
  /** Prunes all per-turn DB rows (remove-all truncation). */
  async pruneAllTurns() {
    await this._withDatabase((db) => db.deleteAllTurns());
  }
  /**
   * Runs `fn` against a short-lived, ref-counted session DB handle so the
   * write is safe regardless of the pipeline's own dbRef lifecycle (the
   * ref-count keeps the shared DB alive; disposing only decrements).
   */
  async _withDatabase(fn) {
    const ref = this._sessionDataService.openDatabase(this._storageUri);
    try {
      await fn(ref.object);
    } finally {
      ref.dispose();
    }
  }
  /**
   * Bring the session up: build SDK `Options`, start the SDK, open the
   * session-scoped DB ref, construct the pipeline, and attach the
   * rematerializer used for yield-restart (e.g. after a client-tool
   * snapshot change). Idempotent on re-call: extra calls throw rather
   * than silently re-materialize.
   *
   * If the supplied {@link IMaterializeContext.proxyHandle}'s underlying
   * `abortController` fires while `sdk.startup()` is in flight, the SDK
   * unwinds via the controller; if `startup` resolves anyway, the
   * `WarmQuery` is asyncDisposed and a {@link CancellationError} is
   * thrown (Q8 belt-and-suspenders).
   */
  async materialize(ctx) {
    if (this._pipeline) {
      throw new Error("ClaudeAgentSession is already materialized");
    }
    const previousWorkingDirectories = this.workingDirectories;
    const resolvedPrimary = ctx.workingDirectories?.[0] ?? ctx.workingDirectory;
    if (resolvedPrimary && !isEqual(resolvedPrimary, this.workingDirectory)) {
      this._workingDirectory = resolvedPrimary;
    }
    if (ctx.workingDirectories && ctx.workingDirectories.length > 0) {
      this._additionalDirectories = ctx.workingDirectories.slice(1);
    }
    const currentWorkingDirectories = this.workingDirectories;
    if (!sameWorkingDirectories(previousWorkingDirectories, currentWorkingDirectories)) {
      this._watchCustomizations(currentWorkingDirectories);
    }
    if (!this.workingDirectory) {
      throw new Error(`Cannot materialize Claude session ${this.sessionId}: workingDirectory is required`);
    }
    this._transportKind = ctx.transport.kind;
    const permissionMode = readClaudePermissionMode(this._configurationService, this._storageUri) ?? this._permissionModeFallback;
    const { mcpServers, allowedTools } = await this._buildStartupToolWiring(ctx.serverToolHost);
    const agentName = await resolveClaudeAgentName(this._provisionalAgent, this._fileService, this._logService, this.sessionId);
    const options = await buildOptions(
      {
        sessionId: this.sessionId,
        workingDirectory: this.workingDirectory,
        additionalDirectories: this._additionalDirectories,
        model: this._provisionalModel,
        abortController: this.abortController,
        permissionMode,
        canUseTool: ctx.canUseTool,
        onElicitation: ctx.onElicitation,
        isResume: ctx.isResume,
        resumeSessionAt: this._pendingResumeSessionAt,
        mcpServers,
        allowedTools,
        plugins: this.clientCustomizationsDiff.consume(this._desiredClientPluginPaths()),
        agent: agentName
      },
      ctx.transport,
      (data) => this._logService.error(`[Claude SDK stderr] ${data}`)
    );
    this._logService.info(`[Claude] session ${this.sessionId}: enableFileCheckpointing=${options.enableFileCheckpointing} isResume=${ctx.isResume}`);
    const warm = await this._sdkService.startup({ options });
    if (this.abortController.signal.aborted) {
      await warm[Symbol.asyncDispose]();
      throw new CancellationError();
    }
    const dbRef = this._sessionDataService.openDatabase(this._storageUri);
    let pipeline;
    try {
      pipeline = this._register(this._instantiationService.createInstance(
        ClaudeSdkPipeline,
        this.sessionId,
        this.sessionUri,
        this._chatChannelUri,
        warm,
        this.abortController,
        dbRef,
        this.subagents,
        (toolName) => this.toolDiff.model.ownerOf(toolName)
      ));
    } catch (err) {
      dbRef.dispose();
      await warm[Symbol.asyncDispose]();
      throw err;
    }
    this._register(pipeline.onDidProduceSignal((s) => this._onDidSessionProgress.fire(this._enrichSignalWithMcpContributor(this._enrichSignalWithCredits(s)))));
    this._pipeline = pipeline;
    this._pendingResumeSessionAt = void 0;
    pipeline.seedCurrentConfig(
      toSdkModelId(this._provisionalModel?.id),
      toRuntimeEffortLevel(resolveClaudeEffort(this._provisionalModel)),
      permissionMode
    );
    if (!ctx.isResume) {
      try {
        await this._metadataStore.write(this._storageUri, {
          customizationDirectory: this.workingDirectory,
          model: this._provisionalModel,
          permissionMode,
          transport: ctx.transport.kind,
          // Persist the full ordered set so a cold resume / remove-all /
          // fork can recover the tail (the SDK catalog only stores `cwd`).
          // Only meaningful when there is a tail; single-root sessions
          // leave it absent so absence reads as single-root.
          ...this._additionalDirectories.length > 0 && this.workingDirectories ? { workingDirectories: this.workingDirectories } : {}
        });
      } catch (err) {
        this._logService.error(`[Claude] Failed to persist customization directory; aborting materialize`, err);
        throw err;
      }
    }
    if (this.abortController.signal.aborted) {
      throw new CancellationError();
    }
    pipeline.attachRematerializer(async (_reason) => {
      const liveMode = readClaudePermissionMode(this._configurationService, this._storageUri) ?? this._permissionModeFallback;
      try {
        const { mcpServers: rebuildMcp, allowedTools: rebuildAllowedTools } = await this._buildStartupToolWiring(ctx.serverToolHost);
        const rebuildAgentName = await resolveClaudeAgentName(this._provisionalAgent, this._fileService, this._logService, this.sessionId);
        const rebuildAbort = new AbortController();
        const rebuildOptions = await buildOptions(
          {
            sessionId: this.sessionId,
            workingDirectory: this.workingDirectory,
            additionalDirectories: this._additionalDirectories,
            model: this._provisionalModel,
            abortController: rebuildAbort,
            permissionMode: liveMode,
            canUseTool: ctx.canUseTool,
            onElicitation: ctx.onElicitation,
            isResume: true,
            resumeSessionAt: this._pendingResumeSessionAt,
            mcpServers: rebuildMcp,
            allowedTools: rebuildAllowedTools,
            plugins: this.clientCustomizationsDiff.consume(this._desiredClientPluginPaths()),
            agent: rebuildAgentName
          },
          ctx.transport,
          (data) => this._logService.error(`[Claude SDK stderr] ${data}`)
        );
        this._logService.info(`[Claude] session ${this.sessionId}: resume rebuild agent=${rebuildOptions.agent ?? "(none)"}`);
        const rebuildWarm = await this._sdkService.startup({ options: rebuildOptions });
        this._pendingResumeSessionAt = void 0;
        return { warm: rebuildWarm, abortController: rebuildAbort };
      } catch (err) {
        this.toolDiff.markDirty();
        this.clientCustomizationsDiff.markDirty();
        throw err;
      }
    });
    await this._reconcileMcpServerEnablement();
    ctx.serverToolHost?.advertise(this._storageUri.toString());
    this._onDidCustomizationsChange.fire();
  }
  /**
   * Build the SDK tool wiring shared by the initial materialize and every
   * yield-restart rematerialize: the in-process MCP servers plus the
   * auto-approve allow-list.
   *
   * The MCP servers are the workbench client tools (which round-trip to the
   * workbench) plus, when a server-tool host is wired, the agent host's own
   * server tools (executed in-process). `mcpServers` is `undefined` when
   * neither is present so `Options.mcpServers` is omitted entirely and the
   * SDK keeps its default; `allowedTools` carries the SDK-prefixed server tool
   * names (so they auto-approve without prompting) and is `undefined` when no
   * server-tool host is wired.
   *
   * Keeping both in one place ensures the two startup paths can never drift,
   * and that a newly registered server tool is wired everywhere at once.
   */
  async _buildStartupToolWiring(serverToolHost) {
    const clientServers = await buildClientMcpServers(this.toolDiff, this._pendingClientToolCalls, this._sdkService);
    const serverToolServer = serverToolHost ? await buildServerToolMcpServer(serverToolHost, this._storageUri.toString(), this._sdkService) : void 0;
    const mcpServers = !clientServers && !serverToolServer ? void 0 : {
      ...clientServers ?? {},
      ...serverToolServer ? { [CLAUDE_SERVER_TOOL_MCP_SERVER_NAME]: serverToolServer } : {}
    };
    const autoApproveToolNames = serverToolHost ? serverToolHost.toolNames.filter((name) => !serverToolHost.requiresConfirmation(name)) : void 0;
    return { mcpServers, allowedTools: autoApproveToolNames ? serverToolAllowList(autoApproveToolNames) : void 0 };
  }
  /** True once {@link materialize} has installed the SDK pipeline. */
  get isPipelineReady() {
    return this._pipeline !== void 0;
  }
  /**
   * Whether this chat currently has a turn in flight or queued. False when
   * provisional (no pipeline) or idle between turns. Used by non-destructive
   * idle release to avoid disconnecting mid-turn.
   */
  get hasActiveTurn() {
    return this._pipeline?.hasActiveTurn ?? false;
  }
  /** Pre-materialize model selection accessor (read by materializer to build Options). */
  get provisionalModel() {
    return this._provisionalModel;
  }
  _requirePipeline() {
    if (!this._pipeline) {
      throw new Error("ClaudeAgentSession is not materialized");
    }
    return this._pipeline;
  }
  get isResumed() {
    return this._requirePipeline().isResumed;
  }
  /**
   * Abort the live SDK subprocess and await its full teardown so the
   * session id is released. No-op when the session was never materialized
   * (no subprocess to stop). Used by remove-all truncation before it
   * recreates a fresh session under the same id — the CLI keeps the id
   * locked until the old subprocess exits.
   */
  async shutdownLiveQuery() {
    await this._pipeline?.shutdownAndWait();
  }
  /**
   * Seed the pipeline's current + applied config cache from
   * materialize-time `Options`. The SDK already starts with these
   * values, so the cache prevents a redundant first `setModel` /
   * `applyFlagSettings` call.
   */
  seedBijectiveState(state) {
    this._requirePipeline().seedCurrentConfig(state.model, state.effort, state.permissionMode);
  }
  attachRematerializer(rematerializer) {
    this._requirePipeline().attachRematerializer(rematerializer);
  }
  /**
   * Send a user prompt. Performs the per-turn pre-flight before
   * yielding to the pipeline:
   *
   * - If {@link toolDiff} or {@link clientCustomizationsDiff} reports the
   *   live `Query` is out of sync with the workbench's view, yield-restart
   *   so the SDK picks up the new `Options.mcpServers` / `Options.plugins`.
   *   `Query.reloadPlugins()` cannot help here — the SDK's plugin URI set
   *   is captured at startup, so any add / remove / nonce-bump must go
   *   through a full rebuild. The rebind itself re-applies the live
   *   `permissionMode` via the rematerializer.
   * - Otherwise forward the live `permissionMode` to the bound `Query` so
   *   a `SessionConfigChanged` action that arrived between turns wins.
   *   The pipeline's bijective cache dedupes a no-op `setPermissionMode`,
   *   so this is free when nothing changed.
   *
   * Model / effort are not threaded through here — the pipeline's current
   * model / effort (set eagerly via {@link setModel}) is whatever
   * the SDK has been told.
   */
  async send(prompt, turnId) {
    const pipeline = this._requirePipeline();
    this._currentTurnNanoAiu = 0;
    if (this.toolDiff.hasDifference || this.clientCustomizationsDiff.hasDifferenceFrom(this._desiredClientPluginPaths()) || this._pendingResumeSessionAt !== void 0) {
      await this._rebindForSyncedState();
    } else {
      await pipeline.setPermissionMode(resolveCurrentPermissionMode(this._configurationService, this._storageUri, this._permissionModeFallback));
    }
    await this._reconcileMcpServerEnablement();
    return pipeline.send(prompt, turnId);
  }
  /**
   * Single yield-restart that covers both client-tool and
   * customization divergence in one trip. Drains the parked
   * client-tool MCP handlers (same as the original tool-only
   * rebind), then triggers the pipeline rebind — the rematerializer
   * reads `toolDiff` and reducer-backed client plugin paths while
   * building the new `Options`, so the bit on each diff clears in
   * lockstep with the SDK actually receiving the new values. Fires
   * `_onDidCustomizationsChange` afterwards so the workbench
   * refetches `getSessionCustomizations` and picks up any newly
   * resolved server-side entries from the rebuilt `Query`.
   */
  async _rebindForSyncedState() {
    this._pendingClientToolCalls.rejectAll(new CancellationError());
    await this._requirePipeline().rebindForRestart();
    this._onDidCustomizationsChange.fire();
  }
  /**
   * Cancel the in-flight SDK turn. Mirrors the production reference;
   * see {@link ClaudeSdkPipeline.abort}. Also denies any parked
   * permission / user-input requests so the SDK's `canUseTool`
   * callback (and any interactive tool waiting on user input) unwinds
   * with a deny / cancel result instead of leaving stale UI behind.
   */
  abort() {
    this._pendingPermissions.denyAll(false);
    this._pendingUserInputs.denyAll({ response: ChatInputResponseKind.Cancel });
    this._requirePipeline().abort();
  }
  /**
   * Eagerly apply a model change and persist the new selection. Safe to
   * call before or after materialize:
   *
   * - Pre-materialize: stash the model on the session so the first SDK
   *   startup picks it up via `Options.model` / `Options.effort`.
   * - Post-materialize: queue the change on the pipeline; the SDK
   *   applies it on the NEXT user request via
   *   `Query.setModel` / `Query.applyFlagSettings`. `'max'` flows through
   *   unchanged — see {@link toRuntimeEffortLevel}.
   *
   * In both cases the new model is persisted to the per-session
   * metadata overlay so a later resume sees the user's choice.
   */
  async setModel(model) {
    this._provisionalModel = model;
    if (this._pipeline) {
      await this._pipeline.setModel(toSdkModelId(model.id));
      await this._pipeline.setEffort(toRuntimeEffortLevel(resolveClaudeEffort(model)));
    }
    await this._metadataStore.write(this._storageUri, { model });
  }
  /**
   * Pre-materialize custom-agent selection accessor.
   */
  get provisionalAgent() {
    return this._provisionalAgent;
  }
  /**
   * Change (or clear with `undefined`) the selected custom agent for this
   * session. The SDK captures `Options.agent` at startup with no
   * working runtime control (`applyFlagSettings({ agent })` exists on
   * the SDK surface but doesn't actually swap the live agent), so
   * post-materialize calls flip {@link clientCustomizationsDiff}
   * dirty and the next `send()` pre-flight rebinds with the new agent
   * baked into the rebuilt `Query`. Persisted to the per-session
   * metadata overlay so a resume picks up the choice.
   */
  async setAgent(agent) {
    if (this._provisionalAgent === agent) {
      return;
    }
    this._provisionalAgent = agent;
    if (this._pipeline) {
      this.clientCustomizationsDiff.markDirty();
    }
    await this._metadataStore.write(this._storageUri, { agent: agent ?? null });
  }
  /**
   * Inject a steering message. Builds the `priority: 'now'`
   * {@link SDKUserMessage} and hands it to the pipeline; the pipeline
   * inherits the parent's turnId (CONTEXT.md M10) and fires
   * `steering_consumed` when the SDK accepts it. No-op if the pipeline
   * is aborted.
   */
  injectSteering(steeringMessage) {
    const pipeline = this._requirePipeline();
    if (pipeline.isAborted) {
      return;
    }
    const contentBlocks = resolvePromptToContentBlocks(
      steeringMessage.message.text,
      steeringMessage.message.attachments
    );
    const sdkMessage = {
      type: "user",
      message: { role: "user", content: contentBlocks },
      session_id: this.sessionId,
      parent_tool_use_id: null,
      priority: "now",
      // Reuse the protocol PendingMessage.id as the SDK uuid — same
      // pattern as `ClaudeAgent.sendMessage` reusing turnId. The SDK's
      // `uuid` field is typed as a branded UUID, but the cast at the
      // boundary is the convention for both code paths.
      uuid: steeringMessage.id
    };
    pipeline.injectSteering(sdkMessage, steeringMessage.id);
  }
  /** Live permission-mode change. Forwards to the pipeline; the pipeline remembers it for re-application after a rebind. */
  setPermissionMode(mode) {
    return this._requirePipeline().setPermissionMode(mode);
  }
  // #region Phase 7 / S3.2 — pending state
  /**
   * Atomically register a pending-permission deferred and fire the
   * `pending_confirmation` signal. The SDK is blocked on the returned
   * promise inside its `canUseTool` callback until
   * {@link respondToPermissionRequest} resolves it. Resolves with
   * `false` if the pipeline is aborted.
   */
  requestPermission(args) {
    if (!this._pipeline || this._pipeline.isAborted) {
      return Promise.resolve(false);
    }
    return this._pendingPermissions.registerAndFire(args.toolUseID, () => {
      this._onDidSessionProgress.fire({
        kind: "pending_confirmation",
        chat: this._chatChannelUri,
        state: args.state,
        permissionKind: args.permissionKind,
        ...args.permissionPath !== void 0 ? { permissionPath: args.permissionPath } : {},
        ...args.parentToolCallId !== void 0 ? { parentToolCallId: args.parentToolCallId } : {}
      });
    });
  }
  respondToPermissionRequest(requestId, approved) {
    return this._pendingPermissions.respond(requestId, approved);
  }
  /**
   * Fire a {@link ActionType.ChatInputRequested} action and park on
   * a deferred until {@link respondToUserInputRequest} resolves it.
   * Resolves with `{ response: Cancel }` if the pipeline is aborted.
   */
  requestUserInput(request, parentToolCallId) {
    if (!this._pipeline || this._pipeline.isAborted || !this._pipeline.hasActiveTurn) {
      return Promise.resolve({ response: ChatInputResponseKind.Cancel });
    }
    return this._pendingUserInputs.registerAndFire(request.id, () => {
      this._onDidSessionProgress.fire({
        kind: "action",
        resource: this._chatChannelUri,
        action: {
          type: ActionType.ChatInputRequested,
          request
        },
        ...parentToolCallId !== void 0 ? { parentToolCallId } : {}
      });
    });
  }
  respondToUserInputRequest(requestId, response, answers) {
    return this._pendingUserInputs.respond(requestId, { response, answers });
  }
  // #endregion
  // #region Phase 10 — client tools
  /** Replace a client's registered tools (full replacement). */
  setClientTools(clientId, tools) {
    this.toolDiff.model.setTools(clientId, tools);
  }
  /** This client's registered tools (empty when absent). */
  getClientTools(clientId) {
    return this.toolDiff.model.getTools(clientId);
  }
  /** Remove a client's tool contribution from this session. */
  removeClientTools(clientId) {
    this.toolDiff.model.removeClient(clientId);
  }
  /** Remove a client's customization contribution from this session. */
  removeClientCustomizations(clientId) {
    this.clientCustomizationsDiff.model.removeClient(clientId);
  }
  /**
   * Resolve a parked client-tool MCP handler with the workbench-supplied
   * result. Returns `true` if a matching deferred was found and settled.
   * Unknown ids are a benign no-op — `agentSideEffects.ts` forwards every
   * `ChatToolCallComplete` envelope, so SDK-owned tool completions land
   * here too and must NOT throw.
   */
  completeClientToolCall(toolCallId, result) {
    const converted = convertToolCallResult(result, toolCallId);
    return this._pendingClientToolCalls.respond(toolCallId, converted);
  }
  /**
   * Drive a yield-restart so the SDK picks up the new client-tool set
   * on its next user request. Public entry point for callers that need
   * to force a tool-only rebind; internal pre-flight goes through
   * {@link _rebindForSyncedState}.
   */
  async rebindForClientTools() {
    await this._rebindForSyncedState();
  }
  /**
   * Adopt the result of a global {@link IAgentPluginManager.syncCustomizations}
   * pass (**client-pushed** path). The agent owns the manager (it's
   * a process-wide singleton with a shared on-disk cache) and pushes
   * the resulting snapshot down here. Flips the client-side dirty bit
   * so the next {@link send} pre-flight reloads SDK plugins.
   */
  adoptClientCustomizations(clientId, synced) {
    this.clientCustomizationsDiff.model.setSyncedCustomizations(clientId, synced);
  }
  /**
   * Snapshot of the **client-pushed** customizations on this session.
   * Does NOT include server-side (SDK-discovered) entries — use
   * {@link getSessionCustomizations} for the merged view.
   */
  getClientCustomizations() {
    return this.clientCustomizationsDiff.model.state.get().synced;
  }
  /**
   * Project the union of (a) **client-pushed** customizations and
   * (b) the **server-side** (SDK-discovered) view (commands / agents
   * / MCP servers, including those the SDK discovered on its own
   * from `~/.claude/**`) onto the protocol's
   * {@link Customization} surface, with reducer-backed enablement
   * applied to client-pushed entries.
   *
   * Pre-materialize sessions return only the client-pushed projection
   * — the SDK side has no Query to query yet. A failure to read the
   * SDK snapshot is warn-logged and the client-pushed projection is
   * still returned, so a transient SDK hiccup doesn't blank the UI.
   */
  async getSessionCustomizations() {
    const { synced } = this.clientCustomizationsDiff.model.state.get();
    const userHome = this._environmentService.userHome;
    const [multiRoot, rules, mcpServers, hooks] = await Promise.all([
      discoverClaudeMultiRootCustomizations(this.workingDirectories, userHome, this._fileService, this._logService),
      scanClaudeRules(this.workingDirectory, userHome, this._fileService),
      scanClaudeMcpServers(this.workingDirectory, userHome, this._fileService),
      scanClaudeHooks(this.workingDirectory, userHome, this._fileService)
    ]);
    let sdk;
    if (this._pipeline) {
      try {
        sdk = await this._pipeline.snapshotResolvedCustomizations();
      } catch (err) {
        this._logService.warn(`[Claude:${this.sessionId}] snapshotResolvedCustomizations failed`, err);
      }
    }
    const discoveredCustomizations = buildDiscoveredCustomizations([...multiRoot.discovered, ...rules], mcpServers, hooks, multiRoot.nativePlugins, multiRoot.workingDirectories, userHome, sdk);
    const state = this._sessionCustomizations;
    const desiredById = new Map(state.map((customization) => [customization.id, customization.enabled]));
    const result = synced.map((item) => ({
      ...item.customization,
      enabled: desiredById.get(item.customization.id) ?? item.customization.enabled
    }));
    result.push(...discoveredCustomizations);
    const projected = applyMcpServerEnablement(result, state);
    this._lastCustomizations = projected;
    return projected;
  }
  async _reconcileMcpServerEnablement() {
    const pipeline = this._requirePipeline();
    const state = this._sessionCustomizations;
    const desired = new Map(getEffectiveMcpServerCustomizations(state).map((server) => [server.name, server.enabled]));
    if (desired.size === 0) {
      return;
    }
    if (!await pipeline.reconcileMcpServerEnablement(desired)) {
      throw new Error(`Claude SDK cannot reconcile MCP server enablement`);
    }
  }
  _desiredClientPluginPaths() {
    const state = this._sessionCustomizations;
    const desiredById = new Map(state.map((customization) => [customization.id, customization.enabled]));
    const paths = [];
    for (const synced of this.clientCustomizationsDiff.model.state.get().synced) {
      if (synced.pluginDir && (desiredById.get(synced.customization.id) ?? synced.customization.enabled) !== false) {
        paths.push(synced.pluginDir);
      }
    }
    return paths;
  }
  async startMcpServer(id) {
    const serverName = await this._resolveMcpServerName(id);
    if (!serverName) {
      this._logService.warn(`[Claude:${this.sessionId}] Cannot start unknown MCP server customization ${id}`);
      return;
    }
    const handled = await this._requirePipeline().startMcpServer(serverName);
    if (!handled) {
      await this._rebindForSyncedState();
    }
    this._onDidCustomizationsChange.fire();
  }
  async stopMcpServer(id) {
    const serverName = await this._resolveMcpServerName(id);
    if (!serverName) {
      this._logService.warn(`[Claude:${this.sessionId}] Cannot stop unknown MCP server customization ${id}`);
      return;
    }
    const handled = await this._requirePipeline().stopMcpServer(serverName);
    if (!handled) {
      this._logService.warn(`[Claude:${this.sessionId}] MCP server stop is not supported by the current SDK`);
      return;
    }
    this._onDidCustomizationsChange.fire();
  }
  async _resolveMcpServerName(id) {
    return findMcpServerName(this._lastCustomizations, id) ?? findMcpServerName(await this.getSessionCustomizations(), id);
  }
  // #endregion
  dispose() {
    this._pendingPermissions.denyAll(false);
    this._pendingUserInputs.denyAll({ response: ChatInputResponseKind.Cancel });
    this._pendingClientToolCalls.rejectAll(new CancellationError());
    super.dispose();
  }
};
ClaudeAgentSession = __decorateClass([
  __decorateParam(14, IInstantiationService),
  __decorateParam(15, IAgentConfigurationService),
  __decorateParam(16, IAgentHostStateManager),
  __decorateParam(17, IClaudeAgentSdkService),
  __decorateParam(18, ISessionDataService),
  __decorateParam(19, ILogService),
  __decorateParam(20, IFileService),
  __decorateParam(21, INativeEnvironmentService)
], ClaudeAgentSession);
export {
  ClaudeAgentSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NsYXVkZS9jbGF1ZGVBZ2VudFNlc3Npb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IE1jcFNka1NlcnZlckNvbmZpZ1dpdGhJbnN0YW5jZSwgT25FbGljaXRhdGlvbiwgT3B0aW9ucywgUGVybWlzc2lvbk1vZGUsIFNES1VzZXJNZXNzYWdlIH0gZnJvbSAnQGFudGhyb3BpYy1haS9jbGF1ZGUtYWdlbnQtc2RrJztcbmltcG9ydCB0eXBlIHsgQ2FsbFRvb2xSZXN1bHQgfSBmcm9tICdAbW9kZWxjb250ZXh0cHJvdG9jb2wvc2RrL3R5cGVzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTeW5jZWRDdXN0b21pemF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50UGx1Z2luTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVQZXJtaXNzaW9uTW9kZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jbGF1ZGVTZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVSdW50aW1lRWZmb3J0TGV2ZWwsIHRvUnVudGltZUVmZm9ydExldmVsLCByZXNvbHZlQ2xhdWRlRWZmb3J0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2NsYXVkZU1vZGVsQ29uZmlnLmpzJztcbmltcG9ydCB7IEFnZW50U2lnbmFsLCBJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50U2VydmVyVG9vbEhvc3QgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2ZXJUb29scy5qcyc7XG5pbXBvcnQgeyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3BlbmRpbmdSZXF1ZXN0UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25EYXRhYmFzZSwgSVNlc3Npb25EYXRhU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uRGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBQZW5kaW5nTWVzc2FnZSwgQ2hhdElucHV0QW5zd2VyLCBDaGF0SW5wdXRSZXF1ZXN0LCBDaGF0SW5wdXRSZXNwb25zZUtpbmQsIFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLCBUb29sQ2FsbFBlbmRpbmdDb25maXJtYXRpb25TdGF0ZSwgdHlwZSBBZ2VudFNlbGVjdGlvbiwgdHlwZSBNb2RlbFNlbGVjdGlvbiwgdHlwZSBUb29sRGVmaW5pdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBpc0RlZmF1bHRDaGF0VXJpLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgVG9vbENhbGxSZXN1bHQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElDbGF1ZGVBZ2VudFNka1NlcnZpY2UgfSBmcm9tICcuL2NsYXVkZUFnZW50U2RrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBidWlsZENsaWVudE1jcFNlcnZlcnMsIGJ1aWxkT3B0aW9ucyB9IGZyb20gJy4vY2xhdWRlU2RrT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyB0b1Nka01vZGVsSWQgfSBmcm9tICcuL2NsYXVkZU1vZGVsSWQuanMnO1xuaW1wb3J0IHsgYnVpbGRTZXJ2ZXJUb29sTWNwU2VydmVyLCBDTEFVREVfU0VSVkVSX1RPT0xfTUNQX1NFUlZFUl9OQU1FLCBzZXJ2ZXJUb29sQWxsb3dMaXN0IH0gZnJvbSAnLi9jbGF1ZGVTZXJ2ZXJUb29sTWNwU2VydmVyLmpzJztcbmltcG9ydCB7IENsYXVkZVNlc3Npb25NZXRhZGF0YVN0b3JlIH0gZnJvbSAnLi9jbGF1ZGVTZXNzaW9uTWV0YWRhdGFTdG9yZS5qcyc7XG5pbXBvcnQgeyBjb252ZXJ0VG9vbENhbGxSZXN1bHQgfSBmcm9tICcuL2NsaWVudFRvb2xzL2NsYXVkZUNsaWVudFRvb2xSZXN1bHQuanMnO1xuaW1wb3J0IHsgcmVhZENsYXVkZVBlcm1pc3Npb25Nb2RlIH0gZnJvbSAnLi9jbGF1ZGVTZXNzaW9uUGVybWlzc2lvbk1vZGUuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNsaWVudFRvb2xzRGlmZiB9IGZyb20gJy4vY2xpZW50VG9vbHMvY2xhdWRlU2Vzc2lvbkNsaWVudFRvb2xzTW9kZWwuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNsaWVudEN1c3RvbWl6YXRpb25zRGlmZiB9IGZyb20gJy4vY3VzdG9taXphdGlvbnMvY2xhdWRlU2Vzc2lvbkNsaWVudEN1c3RvbWl6YXRpb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgQ2xhdWRlQ3VzdG9taXphdGlvbldhdGNoZXIsIGJ1aWxkRGlzY292ZXJlZEN1c3RvbWl6YXRpb25zLCByZXNvbHZlQ2xhdWRlQWdlbnROYW1lIH0gZnJvbSAnLi9jdXN0b21pemF0aW9ucy9jbGF1ZGVTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeS5qcyc7XG5pbXBvcnQgeyBhcHBseU1jcFNlcnZlckVuYWJsZW1lbnQsIGZpbmRNY3BDaGlsZElkLCBmaW5kTWNwU2VydmVyTmFtZSwgZ2V0RWZmZWN0aXZlTWNwU2VydmVyQ3VzdG9taXphdGlvbnMgfSBmcm9tICcuLi9zaGFyZWQvbWNwQ3VzdG9taXphdGlvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgc2NhbkNsYXVkZUhvb2tzIH0gZnJvbSAnLi9jdXN0b21pemF0aW9ucy9zY2FuL2NsYXVkZUhvb2tTY2FuLmpzJztcbmltcG9ydCB7IHNjYW5DbGF1ZGVNY3BTZXJ2ZXJzIH0gZnJvbSAnLi9jdXN0b21pemF0aW9ucy9zY2FuL2NsYXVkZU1jcFNjYW4uanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLCBJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB7IHNjYW5DbGF1ZGVSdWxlcyB9IGZyb20gJy4vY3VzdG9taXphdGlvbnMvc2Nhbi9jbGF1ZGVSdWxlU2Nhbi5qcyc7XG5pbXBvcnQgeyBkaXNjb3ZlckNsYXVkZU11bHRpUm9vdEN1c3RvbWl6YXRpb25zIH0gZnJvbSAnLi9jdXN0b21pemF0aW9ucy9jbGF1ZGVNdWx0aVJvb3RDdXN0b21pemF0aW9uRGlzY292ZXJ5LmpzJztcbmltcG9ydCB7IHJlc29sdmVQcm9tcHRUb0NvbnRlbnRCbG9ja3MgfSBmcm9tICcuL2NsYXVkZVByb21wdFJlc29sdmVyLmpzJztcbmltcG9ydCB0eXBlIHsgQ2xhdWRlVHJhbnNwb3J0IH0gZnJvbSAnLi9jbGF1ZGVQcm94eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2xhdWRlU2RrUGlwZWxpbmUsIElSZW1hdGVyaWFsaXplciwgdHlwZSBJU2RrUmVzb2x2ZWRDdXN0b21pemF0aW9ucyB9IGZyb20gJy4vY2xhdWRlU2RrUGlwZWxpbmUuanMnO1xuaW1wb3J0IHsgU3ViYWdlbnRSZWdpc3RyeSB9IGZyb20gJy4vY2xhdWRlU3ViYWdlbnRSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVQZXJtaXNzaW9uS2luZCB9IGZyb20gJy4vY2xhdWRlVG9vbERpc3BsYXkuanMnO1xuXG4vLyBSZS1leHBvcnQgZm9yIGNhbGxlcnMgdGhhdCBpbXBvcnQgSVJlbWF0ZXJpYWxpemVyIGZyb20gdGhlIHNlc3Npb24uXG5leHBvcnQgdHlwZSB7IElSZW1hdGVyaWFsaXplciB9IGZyb20gJy4vY2xhdWRlU2RrUGlwZWxpbmUuanMnO1xuXG4vKipcbiAqIElucHV0cyB0byB7QGxpbmsgQ2xhdWRlQWdlbnRTZXNzaW9uLm1hdGVyaWFsaXplfS4gQ2FycmllcyB0aGVcbiAqIGFnZW50LXN1cHBsaWVkIGRlcGVuZGVuY2llcyB0aGF0IHRoZSBzZXNzaW9uIGl0c2VsZiBkb2VzIG5vdCBvd25cbiAqIChwcm94eSBhdXRoLCB0aGUgYGNhblVzZVRvb2xgIGNsb3N1cmUgdGhhdCBicmlkZ2VzIGJhY2sgdG8gdGhlXG4gKiBhZ2VudCdzIHBlci1zZXNzaW9uIGxvb2t1cCwgYW5kIHRoZSByZXN1bWUtdnMtZnJlc2ggZGlzY3JpbWluYXRvcikuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSU1hdGVyaWFsaXplQ29udGV4dCB7XG5cdHJlYWRvbmx5IHRyYW5zcG9ydDogQ2xhdWRlVHJhbnNwb3J0O1xuXHRyZWFkb25seSBjYW5Vc2VUb29sOiBOb25OdWxsYWJsZTxPcHRpb25zWydjYW5Vc2VUb29sJ10+O1xuXHRyZWFkb25seSBvbkVsaWNpdGF0aW9uOiBPbkVsaWNpdGF0aW9uO1xuXHRyZWFkb25seSBpc1Jlc3VtZTogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFdvcmtpbmcgZGlyZWN0b3J5IHRoZSBob3N0IHJlc29sdmVkIGZvciB0aGlzIHNlc3Npb24ncyBmaXJzdCBzZW5kIChlLmcuIGFuXG5cdCAqIGlzb2xhdGVkIHdvcmt0cmVlKS4gV2hlbiBwcmVzZW50IGl0IGJlY29tZXMgdGhlIHNlc3Npb24nc1xuXHQgKiB7QGxpbmsgQ2xhdWRlQWdlbnRTZXNzaW9uLndvcmtpbmdEaXJlY3Rvcnl9LCBvdmVycmlkaW5nIHRoZVxuXHQgKiB7QGxpbmsgQ2xhdWRlQWdlbnRTZXNzaW9uLndvcmtzcGFjZX0gdGhlIHNlc3Npb24gd2FzIGJhc2VkIG9uLiBPbWl0dGVkIHdoZW5cblx0ICogdGhlIHNlc3Npb24gd29ya3MgZGlyZWN0bHkgaW4gaXRzIGB3b3Jrc3BhY2VgIChmb2xkZXIgLyB3b3Jrc3BhY2UtbGVzcykuXG5cdCAqL1xuXHRyZWFkb25seSB3b3JraW5nRGlyZWN0b3J5PzogVVJJO1xuXHQvKipcblx0ICogVGhlIGZ1bGwgb3JkZXJlZCB3b3JraW5nLWRpcmVjdG9yeSBzZXQgdGhlIGhvc3QgcmVzb2x2ZWQgZm9yIHRoaXMgc2Vzc2lvbidzXG5cdCAqIGZpcnN0IHNlbmQgKGluZGV4IDAgPSB0aGUgcmVzb2x2ZWQgcHJvY2VzcyByb290LCBlLmcuIGEgd29ya3RyZWU7IDEuLk4gPVxuXHQgKiBhZGRpdGlvbmFsIGRpcmVjdG9yaWVzKS4gV2hlbiBwcmVzZW50IGl0IHJlcGxhY2VzIGJvdGggdGhlIHByaW1hcnlcblx0ICogKHtAbGluayB3b3JraW5nRGlyZWN0b3J5fSkgYW5kIHRoZSBzZXNzaW9uJ3MgYWRkaXRpb25hbC1kaXJlY3RvcnkgdGFpbC5cblx0ICogVGFrZXMgcHJlY2VkZW5jZSBvdmVyIHtAbGluayB3b3JraW5nRGlyZWN0b3J5fTsgdGhlIGxhdHRlciBpcyBrZXB0IGZvclxuXHQgKiBzaW5nbGUtcm9vdCBjYWxsZXJzIHRoYXQgb25seSByZXNvbHZlIHRoZSBwcmltYXJ5LiBPbWl0dGVkIHdoZW4gdGhlIGhvc3Rcblx0ICogZGlkIG5vdCByZXNvbHZlIGEgc2V0IChmb2xkZXIgLyB3b3Jrc3BhY2UtbGVzcyBzaW5nbGUtcm9vdCBzZXNzaW9ucykuXG5cdCAqL1xuXHRyZWFkb25seSB3b3JraW5nRGlyZWN0b3JpZXM/OiByZWFkb25seSBVUklbXTtcblx0LyoqXG5cdCAqIEFnZW50IGhvc3QncyBzZXJ2ZXItdG9vbCBob3N0LiBXaGVuIHByZXNlbnQsIHRoZSBzZXNzaW9uIGV4cG9zZXMgdGhlXG5cdCAqIGFnZW50IGhvc3QncyBzZXJ2ZXIgdG9vbHMgKGZlZWRiYWNrIFwiY29tbWVudHNcIiB0b2RheSwgbW9yZSBpbiB0aGUgZnV0dXJlKVxuXHQgKiBhcyBhbiBpbi1wcm9jZXNzIE1DUCBzZXJ2ZXIgYW5kIGFkdmVydGlzZXMgdGhlbSBhcyBzZXJ2ZXIgdG9vbHMuIE9taXR0ZWRcblx0ICogYnkgcHJvdmlkZXJzIHRoYXQgZG9uJ3Qgc3VwcG9ydCBzZXJ2ZXItc2lkZSB0b29scy5cblx0ICovXG5cdHJlYWRvbmx5IHNlcnZlclRvb2xIb3N0PzogSUFnZW50U2VydmVyVG9vbEhvc3Q7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVDdXJyZW50UGVybWlzc2lvbk1vZGUoXG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSxcblx0c2Vzc2lvblVyaTogVVJJLFxuXHRwZXJtaXNzaW9uTW9kZUZhbGxiYWNrOiBDbGF1ZGVQZXJtaXNzaW9uTW9kZSxcbik6IENsYXVkZVBlcm1pc3Npb25Nb2RlIHtcblx0cmV0dXJuIHJlYWRDbGF1ZGVQZXJtaXNzaW9uTW9kZShjb25maWd1cmF0aW9uU2VydmljZSwgc2Vzc2lvblVyaSkgPz8gcGVybWlzc2lvbk1vZGVGYWxsYmFjaztcbn1cblxuZnVuY3Rpb24gc2FtZVdvcmtpbmdEaXJlY3RvcmllcyhhOiByZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZCwgYjogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0aWYgKCFhIHx8ICFiKSB7XG5cdFx0cmV0dXJuIGEgPT09IGI7XG5cdH1cblx0aWYgKGEubGVuZ3RoICE9PSBiLmxlbmd0aCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gYS5ldmVyeSgoZGlyZWN0b3J5LCBpbmRleCkgPT4gaXNFcXVhbChkaXJlY3RvcnksIGJbaW5kZXhdKSk7XG59XG5cbi8qKlxuICogUGVyLXNlc3Npb24gY29vcmRpbmF0b3IuIE93bnM6XG4gKiAgIFx1MjAyMiBQZXItc2Vzc2lvbiBpZGVudGl0eSAoc2Vzc2lvbklkIC8gc2Vzc2lvblVyaSAvIHdvcmtzcGFjZSAvXG4gKiAgICAgd29ya2luZ0RpcmVjdG9yeSkuXG4gKiAgIFx1MjAyMiBUaGUge0BsaW5rIENsYXVkZVNka1BpcGVsaW5lfSB0aGF0IGRyaXZlcyB0aGUgU0RLIFF1ZXJ5IGxpZmVjeWNsZVxuICogICAgIGFuZCBlbWl0cyBldmVyeSB7QGxpbmsgQWdlbnRTaWduYWx9IGZvciB0aGlzIHNlc3Npb24gKHJvdXRlci1cbiAqICAgICBtYXBwZWQgcGVyLW1lc3NhZ2Ugc2lnbmFscyBwbHVzIGBDaGF0VHVybkNvbXBsZXRlYCBhbmRcbiAqICAgICBgc3RlZXJpbmdfY29uc3VtZWRgKS5cbiAqICAgXHUyMDIyIFBlbmRpbmctcGVybWlzc2lvbiBhbmQgcGVuZGluZy11c2VyLWlucHV0IHJlZ2lzdHJpZXMgKFBoYXNlIDcpLFxuICogICAgIHN1cmZhY2VkIHZpYSBgcmVxdWVzdFBlcm1pc3Npb25gIC8gYHJlcXVlc3RVc2VySW5wdXRgLlxuICovXG5leHBvcnQgY2xhc3MgQ2xhdWRlQWdlbnRTZXNzaW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfcGlwZWxpbmU6IENsYXVkZVNka1BpcGVsaW5lIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0Q2hhbm5lbFVyaTogVVJJO1xuXG5cdC8qKlxuXHQgKiBVUkkgdW5kZXIgd2hpY2ggdGhpcyBjaGF0J3MgcGVyLWNoYXQgcmVzb3VyY2VzIChpdHMgc2Vzc2lvbiBkYXRhYmFzZSxcblx0ICogbWV0YWRhdGEgb3ZlcmxheSwgY29uZmlnIHNjb3BlIGFuZCBzZXJ2ZXItdG9vbCBhZHZlcnRpc2VtZW50KSBhcmUga2V5ZWQuXG5cdCAqIFRoZSBkZWZhdWx0IGNoYXQgdXNlcyB0aGUgcmVhbCBzZXNzaW9uIFVSSTsgYW4gYWRkaXRpb25hbCBwZWVyIGNoYXQgdXNlc1xuXHQgKiBpdHMgb3duIGBhaHAtY2hhdGAgY2hhbm5lbCBVUkkgc28gaXRzIGNoYXQgc3RhdGUgc3RheXMgaXNvbGF0ZWRcblx0ICogZnJvbSB0aGUgZGVmYXVsdCBjaGF0J3MuIGBzZXNzaW9uVXJpYCBhbHdheXMgcmVtYWlucyB0aGUgcmVhbCBzZXNzaW9uIFVSSVxuXHQgKiBhbmQgYGNoYXRDaGFubmVsVXJpYCBhbHdheXMgdGhlIGNoYXQgY2hhbm5lbCBcdTIwMTQgdGhleSBhcmUgbmV2ZXIgb3ZlcmxvYWRlZC5cblx0ICovXG5cdHByaXZhdGUgZ2V0IF9zdG9yYWdlVXJpKCk6IFVSSSB7XG5cdFx0cmV0dXJuIGlzRGVmYXVsdENoYXRVcmkodGhpcy5fY2hhdENoYW5uZWxVcmkpID8gdGhpcy5zZXNzaW9uVXJpIDogdGhpcy5fY2hhdENoYW5uZWxVcmk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfc2Vzc2lvbkN1c3RvbWl6YXRpb25zKCk6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUodGhpcy5zZXNzaW9uVXJpLnRvU3RyaW5nKCkpPy5jdXN0b21pemF0aW9ucyA/PyBbXTtcblx0fVxuXG5cdC8qKiBQcmUtbWF0ZXJpYWxpemUgbW9kZWwgc2VsZWN0aW9uLiBNdXRhYmxlOyBmbG93cyBpbnRvIGBPcHRpb25zLm1vZGVsYCBvbiBmaXJzdCBpbnN0YWxsUGlwZWxpbmUuICovXG5cdHByaXZhdGUgX3Byb3Zpc2lvbmFsTW9kZWw6IE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogUHJlLW1hdGVyaWFsaXplIGN1c3RvbS1hZ2VudCBzZWxlY3Rpb24uIE11dGFibGU7IGZsb3dzIGludG9cblx0ICogYE9wdGlvbnMuYWdlbnRgIChyZXNvbHZlZCB0byB0aGUgU0RLIGFnZW50IG5hbWUpIG9uIG1hdGVyaWFsaXplXG5cdCAqIGFuZCBvbiBldmVyeSByZW1hdGVyaWFsaXplciBjYWxsLiBNaWQtc2Vzc2lvbiBjaGFuZ2VzIHZpYVxuXHQgKiB7QGxpbmsgc2V0QWdlbnR9IGZsaXAge0BsaW5rIGNsaWVudEN1c3RvbWl6YXRpb25zRGlmZn0gZGlydHkgc28gdGhlXG5cdCAqIG5leHQgYHNlbmQoKWAgcmViaW5kcyBhbmQgdGhlIG5ldyBhZ2VudCByZWFjaGVzIHRoZSBTREsgb24gdGhlXG5cdCAqIHJlYnVpbHQgYFF1ZXJ5YC4gVGhlIFNESydzIGBPcHRpb25zLmFnZW50YCBpcyBjYXB0dXJlZCBhdCBzdGFydHVwXG5cdCAqIFx1MjAxNCB0aGVyZSBpcyBubyBydW50aW1lIGNvbnRyb2wtcGxhbmUgZXF1aXZhbGVudC5cblx0ICovXG5cdHByaXZhdGUgX3Byb3Zpc2lvbmFsQWdlbnQ6IEFnZW50U2VsZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHQvKiogUHJlLW1hdGVyaWFsaXplIGBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnLmNvbmZpZ2AgYmFnLiBSZWFkIGF0IG1hdGVyaWFsaXplIHRpbWUuICovXG5cdHJlYWRvbmx5IHByb3Zpc2lvbmFsQ29uZmlnOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZDtcblx0LyoqIFJlc29sdmVkIHByb2plY3QgbWV0YWRhdGEgY2FwdHVyZWQgYXQgY3JlYXRlIHRpbWUgKGlmIGFueSkuICovXG5cdHJlYWRvbmx5IHByb2plY3Q6IElBZ2VudFNlc3Npb25Qcm9qZWN0SW5mbyB8IHVuZGVmaW5lZDtcblx0LyoqIEFsd2F5cy1wcmVzZW50IGFib3J0IGNvbnRyb2xsZXI7IHdpcmVkIGludG8gYE9wdGlvbnMuYWJvcnRDb250cm9sbGVyYCBhdCBtYXRlcmlhbGl6ZSB0aW1lLiAqL1xuXHRyZWFkb25seSBhYm9ydENvbnRyb2xsZXI6IEFib3J0Q29udHJvbGxlcjtcblxuXHQvKipcblx0ICogVGhlIGFjdHVhbCBkaXJlY3Rvcnkgd29yayBpcyBkb25lIGluLiBEZWZhdWx0cyB0byB7QGxpbmsgd29ya3NwYWNlfSB1bnRpbFxuXHQgKiB0aGUgaG9zdCBoYW5kcyB0aGUgc2Vzc2lvbiBhIHJlc29sdmVkIHdvcmtpbmcgZGlyZWN0b3J5IChlLmcuIGFuIGlzb2xhdGVkXG5cdCAqIHdvcmt0cmVlKSBhdCB7QGxpbmsgbWF0ZXJpYWxpemV9IHRpbWUuIGB1bmRlZmluZWRgIG9ubHkgd2hlbiB0aGUgc2Vzc2lvbiBpc1xuXHQgKiB3b3Jrc3BhY2UtbGVzcyBhbmQgaGFzIG5vIHJlc29sdmVkIGRpcmVjdG9yeSB5ZXQuXG5cdCAqL1xuXHRnZXQgd29ya2luZ0RpcmVjdG9yeSgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl93b3JraW5nRGlyZWN0b3J5ID8/IHRoaXMud29ya3NwYWNlO1xuXHR9XG5cdHByaXZhdGUgX3dvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogVGhlIGFkZGl0aW9uYWwgKG5vbi1wcmltYXJ5KSB3b3JraW5nIGRpcmVjdG9yaWVzIHRoaXMgc2Vzc2lvbidzIGFnZW50IGlzXG5cdCAqIGdyYW50ZWQgdG9vbCBhY2Nlc3MgdG8sIGluIG9yZGVyICh0aGV5IGZvbGxvdyBpbmRleCAwID0gdGhlIHByaW1hcnlcblx0ICoge0BsaW5rIHdvcmtpbmdEaXJlY3Rvcnl9KS4gQSB3b3JrdHJlZSByZW1hcCBvbmx5IHJlcGxhY2VzIHRoZSBwcmltYXJ5LCBzb1xuXHQgKiB0aGlzIHRhaWwgaXMgc3RhYmxlIGZyb20gY3JlYXRpb24gYW5kIGlzIHByZXNlcnZlZCBhY3Jvc3MgZXZlcnkgU0RLXG5cdCAqIChyZSltYXRlcmlhbGl6YXRpb24uIEVtcHR5IGZvciBzaW5nbGUtcm9vdCBzZXNzaW9ucy5cblx0ICovXG5cdHByaXZhdGUgX2FkZGl0aW9uYWxEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW107XG5cblx0LyoqXG5cdCAqIFRoZSBmdWxsIG9yZGVyZWQgd29ya2luZy1kaXJlY3Rvcnkgc2V0IChpbmRleCAwID0gcHJpbWFyeSwgMS4uTiA9XG5cdCAqIHtAbGluayBfYWRkaXRpb25hbERpcmVjdG9yaWVzfSkuIGB1bmRlZmluZWRgIG9ubHkgd2hlbiB0aGUgc2Vzc2lvbiBoYXMgbm9cblx0ICogcmVzb2x2ZWQgcHJpbWFyeSB5ZXQgKHdvcmtzcGFjZS1sZXNzLCBwcmUtbWF0ZXJpYWxpemUpLlxuXHQgKi9cblx0Z2V0IHdvcmtpbmdEaXJlY3RvcmllcygpOiByZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcHJpbWFyeSA9IHRoaXMud29ya2luZ0RpcmVjdG9yeTtcblx0XHRyZXR1cm4gcHJpbWFyeSA/IFtwcmltYXJ5LCAuLi50aGlzLl9hZGRpdGlvbmFsRGlyZWN0b3JpZXNdIDogdW5kZWZpbmVkO1xuXHR9XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1c3RvbWl6YXRpb25XYXRjaGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cblx0LyoqIEV4cG9zZWQgZm9yIHRoZSBtYXRlcmlhbGl6ZXIncyBNQ1Atc2VydmVyIGJ1aWxkIGNsb3N1cmUuICovXG5cdGdldCBwZW5kaW5nQ2xpZW50VG9vbENhbGxzKCk6IFBlbmRpbmdSZXF1ZXN0UmVnaXN0cnk8Q2FsbFRvb2xSZXN1bHQ+IHsgcmV0dXJuIHRoaXMuX3BlbmRpbmdDbGllbnRUb29sQ2FsbHM7IH1cblx0LyoqIFNuYXBzaG90IG9mIHBlcm1pc3Npb24tbW9kZSBmYWxsYmFjayB1c2VkIHdoZW4gbGl2ZSByZWFkIGlzIHVuZGVmaW5lZC4gKi9cblx0Z2V0IHBlcm1pc3Npb25Nb2RlRmFsbGJhY2soKTogQ2xhdWRlUGVybWlzc2lvbk1vZGUgeyByZXR1cm4gdGhpcy5fcGVybWlzc2lvbk1vZGVGYWxsYmFjazsgfVxuXG5cdHN0YXRpYyBjcmVhdGVQcm92aXNpb25hbChcblx0XHRzZXNzaW9uSWQ6IHN0cmluZyxcblx0XHRzZXNzaW9uVXJpOiBVUkksXG5cdFx0Y2hhdENoYW5uZWxVcmk6IFVSSSxcblx0XHR3b3Jrc3BhY2U6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRwcm9qZWN0OiBJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfCB1bmRlZmluZWQsXG5cdFx0bW9kZWw6IE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkLFxuXHRcdGFnZW50OiBBZ2VudFNlbGVjdGlvbiB8IHVuZGVmaW5lZCxcblx0XHRjb25maWc6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkLFxuXHRcdHBlbmRpbmdDbGllbnRUb29sQ2FsbHM6IFBlbmRpbmdSZXF1ZXN0UmVnaXN0cnk8Q2FsbFRvb2xSZXN1bHQ+LFxuXHRcdHBlcm1pc3Npb25Nb2RlRmFsbGJhY2s6IENsYXVkZVBlcm1pc3Npb25Nb2RlLFxuXHRcdG1ldGFkYXRhU3RvcmU6IENsYXVkZVNlc3Npb25NZXRhZGF0YVN0b3JlLFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0YWRkaXRpb25hbERpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSA9IFtdLFxuXHQpOiBDbGF1ZGVBZ2VudFNlc3Npb24ge1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENsYXVkZUFnZW50U2Vzc2lvbixcblx0XHRcdHNlc3Npb25JZCxcblx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHRjaGF0Q2hhbm5lbFVyaSxcblx0XHRcdHdvcmtzcGFjZSxcblx0XHRcdHByb2plY3QsXG5cdFx0XHRtb2RlbCxcblx0XHRcdGFnZW50LFxuXHRcdFx0Y29uZmlnLFxuXHRcdFx0bmV3IEFib3J0Q29udHJvbGxlcigpLFxuXHRcdFx0cGVuZGluZ0NsaWVudFRvb2xDYWxscyxcblx0XHRcdG5ldyBTZXNzaW9uQ2xpZW50VG9vbHNEaWZmKCksXG5cdFx0XHRwZXJtaXNzaW9uTW9kZUZhbGxiYWNrLFxuXHRcdFx0bWV0YWRhdGFTdG9yZSxcblx0XHRcdGFkZGl0aW9uYWxEaXJlY3Rvcmllcyxcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBoYXNlIDEyIFx1MjAxNCBwZXItc2Vzc2lvbiByZWdpc3RyeSBvZiBUYXNrIHRvb2wgY2FsbHMgdGhhdCBzcGF3blxuXHQgKiBzdWJhZ2VudHMgKGBTdWJhZ2VudFNwYXduYCByZWNvcmRzIGtleWVkIGJ5IGB0b29sX3VzZV9pZGAsIHBsdXMgYVxuXHQgKiByZXZlcnNlIGluZGV4IGZyb20gaW5uZXIgYHRvb2xfdXNlX2lkYCB0byBpdHMgcGFyZW50IFRhc2spLiBPd25lZFxuXHQgKiBoZXJlIHNvIHRoZSByZWdpc3RyeSBkaWVzIHdpdGggdGhlIHNlc3Npb247IGNvbnN1bWVycyBpbiB0aGUgbGl2ZVxuXHQgKiBtYXBwZXIgKGBDbGF1ZGVTZGtNZXNzYWdlUm91dGVyYCAvIGBjbGF1ZGVNYXBTZXNzaW9uRXZlbnRzYCAvXG5cdCAqIGBjbGF1ZGVTdWJhZ2VudFNpZ25hbHNgKSBhbmQgdGhlIGBjYW5Vc2VUb29sYCBicmlkZ2UgcmVhZCBmcm9tXG5cdCAqIHRoZSBzYW1lIGluc3RhbmNlIHZpYSB0aGUgc2Vzc2lvbi5cblx0ICovXG5cdHJlYWRvbmx5IHN1YmFnZW50czogU3ViYWdlbnRSZWdpc3RyeSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTdWJhZ2VudFJlZ2lzdHJ5KCkpO1xuXG5cdC8qKlxuXHQgKiBQaGFzZSA3IC8gUzMuMi4gVG9vbC1wZXJtaXNzaW9uIGRlZmVycmVkcyBwYXJrZWQgaW5zaWRlXG5cdCAqIHtAbGluayBPcHRpb25zLmNhblVzZVRvb2x9LiBLZXllZCBieSBTREsgYHRvb2xfdXNlX2lkYC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdQZXJtaXNzaW9ucyA9IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PGJvb2xlYW4+KCk7XG5cblx0LyoqXG5cdCAqIFBoYXNlIDcgLyBTMy4yLiBVc2VyLWlucHV0IGRlZmVycmVkcyBwYXJrZWQgZm9yIGludGVyYWN0aXZlIHRvb2xzXG5cdCAqIChgQXNrVXNlclF1ZXN0aW9uYCwgYEV4aXRQbGFuTW9kZWApLiBLZXllZCBieSBgQ2hhdElucHV0UmVxdWVzdC5pZGAuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nVXNlcklucHV0cyA9IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PHsgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZDsgYW5zd2Vycz86IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4gfT4oKTtcblxuXHQvKipcblx0ICogUGhhc2UgMTAgXHUyMDE0IG93bnMgdGhlIHdvcmtiZW5jaC1yZWdpc3RlcmVkIGNsaWVudC10b29sIHNuYXBzaG90XG5cdCAqICh2aWEge0BsaW5rIFNlc3Npb25DbGllbnRUb29sc0RpZmYubW9kZWx9KSBwbHVzIHRoZVxuXHQgKiBcImNoYW5nZWQgc2luY2UgbGFzdCBzdWNjZXNzZnVsIGJ1aWxkXCIgZGlydHkgYml0LiBSZWFkIGJ5IHRoZVxuXHQgKiBhZ2VudCdzIHNlbmRNZXNzYWdlIGRpZmYgY2hlY2s7IHVzZWQgYnkgdGhlIG1hdGVyaWFsaXplIC9cblx0ICogcmVtYXRlcmlhbGl6ZXIgZmxvdyB0byBwaW4gdGhlIFNESyBidWlsZCBhZ2FpbnN0IGEgc3BlY2lmaWNcblx0ICogc25hcHNob3QuIFNlZSB7QGxpbmsgU2Vzc2lvbkNsaWVudFRvb2xzRGlmZn0gZm9yIHRoZSBDNiByYWNlXG5cdCAqIHNlbWFudGljcyB0aGlzIGNvbGxhYm9yYXRvciBlbmZvcmNlcy5cblx0ICovXG5cdHJlYWRvbmx5IHRvb2xEaWZmOiBTZXNzaW9uQ2xpZW50VG9vbHNEaWZmO1xuXG5cdC8qKlxuXHQgKiBQaGFzZSAxMSBcdTIwMTQgcGVyLXNlc3Npb24gKipjbGllbnQtcHVzaGVkKiogc3luY2VkIGN1c3RvbWl6YXRpb25cblx0ICogc25hcHNob3QgKyBlbmFibGVtZW50IG1hcC4gT3ducyB0aGUgd29ya2JlbmNoLXN1cHBsaWVkXG5cdCAqIHtAbGluayBJU3luY2VkQ3VzdG9taXphdGlvbn0gbGlzdCwgdGhlIHBlci1VUkkgZW5hYmxlbWVudCBiaXRzLFxuXHQgKiBhbmQgdGhlIGRpcnR5IGZsYWcgZHJhaW5lZCBhdCB0aGUgbmV4dCB7QGxpbmsgc2VuZH0gcHJlLWZsaWdodC5cblx0ICogRXhpc3RzIGZyb20gYGNyZWF0ZVByb3Zpc2lvbmFsYCBvbndhcmQgc28gY2xpZW50LXNpZGUgcmVhZHMgL1xuXHQgKiB0b2dnbGVzIHdvcmsgdW5pZm9ybWx5IGJlZm9yZSBhbmQgYWZ0ZXIgbWF0ZXJpYWxpemUuXG5cdCAqXG5cdCAqIFNlcnZlci1zaWRlIChTREstZGlzY292ZXJlZCkgY3VzdG9taXphdGlvbnMgYXJlIE5PVCBzdG9yZWQgaGVyZVxuXHQgKiBcdTIwMTQgdGhleSdyZSBmZXRjaGVkIG9uIGRlbWFuZCBmcm9tIHRoZSBsaXZlIGBRdWVyeWAgaW5cblx0ICoge0BsaW5rIGdldFNlc3Npb25DdXN0b21pemF0aW9uc30uXG5cdCAqXG5cdCAqIFNlZSB7QGxpbmsgU2Vzc2lvbkNsaWVudEN1c3RvbWl6YXRpb25zRGlmZn0uXG5cdCAqL1xuXHRyZWFkb25seSBjbGllbnRDdXN0b21pemF0aW9uc0RpZmY6IFNlc3Npb25DbGllbnRDdXN0b21pemF0aW9uc0RpZmYgPSB0aGlzLl9yZWdpc3RlcihuZXcgU2Vzc2lvbkNsaWVudEN1c3RvbWl6YXRpb25zRGlmZigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNlc3Npb25Qcm9ncmVzcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEFnZW50U2lnbmFsPigpKTtcblx0cmVhZG9ubHkgb25EaWRTZXNzaW9uUHJvZ3Jlc3M6IEV2ZW50PEFnZW50U2lnbmFsPiA9IHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBSZWFsIENvcGlsb3QgY3JlZGl0cyAoaW4gbmFuby1BSVUpIGJpbGxlZCBieSBDQVBJIGZvciB0aGUgY3VycmVudFxuXHQgKiB0dXJuLCBzdW1tZWQgYWNyb3NzIGV2ZXJ5IGAvdjEvbWVzc2FnZXNgIHJlcXVlc3QgdGhlIFNESyBtYWRlXG5cdCAqIChpbmNsdWRpbmcgc3ViYWdlbnRzKS4gRmVkIGJ5IHtAbGluayByZWNvcmRUdXJuQ3JlZGl0c30gZnJvbSB0aGVcblx0ICogcHJveHkncyBgb25EaWRSZXBvcnRDcmVkaXRzYCwgcmVzZXQgYXQgdGhlIHN0YXJ0IG9mIGVhY2gge0BsaW5rIHNlbmR9LFxuXHQgKiBhbmQgYXR0YWNoZWQgdG8gdGhlIHR1cm4ncyBgQ2hhdFVzYWdlYCBzaWduYWwgYnlcblx0ICoge0BsaW5rIF9lbnJpY2hTaWduYWxXaXRoQ3JlZGl0c30uIFVubGlrZSB0aGUgU0RLJ3MgYHRvdGFsX2Nvc3RfdXNkYFxuXHQgKiAoYW4gQW50aHJvcGljLWxpc3QtcHJpY2UgZXN0aW1hdGUpLCB0aGlzIGlzIHdoYXQgQ0FQSSBhY3R1YWxseSBiaWxscy5cblx0ICovXG5cdHByaXZhdGUgX2N1cnJlbnRUdXJuTmFub0FpdSA9IDA7XG5cblx0LyoqXG5cdCAqIFRyYW5zcG9ydCB0aGUgc2Vzc2lvbiBtYXRlcmlhbGl6ZWQgdW5kZXIgKFBoYXNlIDE5KS4gRGVmYXVsdHMgdG8gYHByb3h5YFxuXHQgKiB1bnRpbCB7QGxpbmsgbWF0ZXJpYWxpemV9IHJlc29sdmVzIGl0IGZyb20ge0BsaW5rIElNYXRlcmlhbGl6ZUNvbnRleHR9LlxuXHQgKiBHYXRlcyB7QGxpbmsgX2VucmljaFNpZ25hbFdpdGhDcmVkaXRzfSBzbyBuYXRpdmUgdHVybnMgbmV2ZXIgY2FycnkgYVxuXHQgKiBDb3BpbG90IGNyZWRpdHMgb3ZlcmxheSAodGhlIHByb3h5IGlzIHRoZSBvbmx5IGNyZWRpdCBzb3VyY2UpLlxuXHQgKi9cblx0cHJpdmF0ZSBfdHJhbnNwb3J0S2luZDogQ2xhdWRlVHJhbnNwb3J0WydraW5kJ10gPSAncHJveHknO1xuXG5cdC8qKlxuXHQgKiBBY2N1bXVsYXRlIHByb3h5LXJlcG9ydGVkIGJpbGxlZCBjcmVkaXRzIGZvciB0aGUgaW4tZmxpZ2h0IHR1cm4uXG5cdCAqIENhbGxlZCBmcm9tIHtAbGluayBDbGF1ZGVBZ2VudH0gZm9yIGV2ZXJ5IHByb3h5IGBvbkRpZFJlcG9ydENyZWRpdHNgXG5cdCAqIHJvdXRlZCB0byB0aGlzIHNlc3Npb24uIElnbm9yZXMgbm9uLXBvc2l0aXZlIC8gbm9uLWZpbml0ZSB2YWx1ZXMuXG5cdCAqL1xuXHRyZWNvcmRUdXJuQ3JlZGl0cyh0b3RhbE5hbm9BaXU6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmIChOdW1iZXIuaXNGaW5pdGUodG90YWxOYW5vQWl1KSAmJiB0b3RhbE5hbm9BaXUgPiAwKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50VHVybk5hbm9BaXUgKz0gdG90YWxOYW5vQWl1O1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBJbmplY3QgdGhlIHR1cm4ncyBhY2N1bXVsYXRlZCBDb3BpbG90IGNyZWRpdHMgaW50byBpdHMgYENoYXRVc2FnZWBcblx0ICogc2lnbmFsIGFzIGBfbWV0YS5jb3BpbG90VXNhZ2UudG90YWxOYW5vQWl1YCBcdTIwMTQgdGhlIHdlbGwta25vd24ga2V5IHRoZVxuXHQgKiB3b3JrYmVuY2ggcHJlZmVycyBvdmVyIGBfbWV0YS5jb3N0YCB3aGVuIHJlbmRlcmluZyBwZXItdHVybiBjcmVkaXRzLlxuXHQgKiBBbGwgb3RoZXIgc2lnbmFscyBwYXNzIHRocm91Z2ggdW50b3VjaGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfZW5yaWNoU2lnbmFsV2l0aENyZWRpdHMoc2lnbmFsOiBBZ2VudFNpZ25hbCk6IEFnZW50U2lnbmFsIHtcblx0XHRpZiAodGhpcy5fdHJhbnNwb3J0S2luZCAhPT0gJ3Byb3h5JyB8fCBzaWduYWwua2luZCAhPT0gJ2FjdGlvbicgfHwgc2lnbmFsLmFjdGlvbi50eXBlICE9PSBBY3Rpb25UeXBlLkNoYXRVc2FnZSB8fCB0aGlzLl9jdXJyZW50VHVybk5hbm9BaXUgPD0gMCkge1xuXHRcdFx0cmV0dXJuIHNpZ25hbDtcblx0XHR9XG5cdFx0Y29uc3QgdXNhZ2UgPSBzaWduYWwuYWN0aW9uLnVzYWdlO1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5zaWduYWwsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0Li4uc2lnbmFsLmFjdGlvbixcblx0XHRcdFx0dXNhZ2U6IHtcblx0XHRcdFx0XHQuLi51c2FnZSxcblx0XHRcdFx0XHRfbWV0YToge1xuXHRcdFx0XHRcdFx0Li4udXNhZ2UuX21ldGEsXG5cdFx0XHRcdFx0XHRjb3BpbG90VXNhZ2U6IHsgdG90YWxOYW5vQWl1OiB0aGlzLl9jdXJyZW50VHVybk5hbm9BaXUgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0YW1wcyB0aGUgTUNQIHtAbGluayBUb29sQ2FsbENvbnRyaWJ1dG9yfSBvbnRvIGEgYENoYXRUb29sQ2FsbFN0YXJ0YCBmb3Jcblx0ICogYW4gZXh0ZXJuYWwgYG1jcF9fPHNlcnZlcj5fXzx0b29sPmAgY2FsbCwgcmVzb2x2ZWQgZnJvbSB0aGlzIHNlc3Npb24nc1xuXHQgKiBjYWNoZWQgY3VzdG9taXphdGlvbiBzbmFwc2hvdC4gT3duZWQgaGVyZSBiZWNhdXNlIHRoZSBzZXNzaW9uIG93bnMgdGhlXG5cdCAqIGN1c3RvbWl6YXRpb24gZGF0YTsgdGhlIHN0cmVhbSBtYXBwZXIgc3RheXMgZnJlZSBvZiBpdC4gKFRoZSBpbi1wcm9jZXNzXG5cdCAqIGBtY3BfX2NsaWVudF9fYCBzZXJ2ZXIgYWxyZWFkeSBjYXJyaWVzIGEgQ2xpZW50IGNvbnRyaWJ1dG9yIGZyb20gdGhlIG1hcHBlci4pXG5cdCAqL1xuXHRwcml2YXRlIF9lbnJpY2hTaWduYWxXaXRoTWNwQ29udHJpYnV0b3Ioc2lnbmFsOiBBZ2VudFNpZ25hbCk6IEFnZW50U2lnbmFsIHtcblx0XHRpZiAoc2lnbmFsLmtpbmQgIT09ICdhY3Rpb24nIHx8IHNpZ25hbC5hY3Rpb24udHlwZSAhPT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCB8fCBzaWduYWwuYWN0aW9uLmNvbnRyaWJ1dG9yICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBzaWduYWw7XG5cdFx0fVxuXHRcdGNvbnN0IHRvb2xOYW1lID0gc2lnbmFsLmFjdGlvbi50b29sTmFtZTtcblx0XHRpZiAoIXRvb2xOYW1lLnN0YXJ0c1dpdGgoJ21jcF9fJykpIHtcblx0XHRcdHJldHVybiBzaWduYWw7XG5cdFx0fVxuXHRcdGNvbnN0IHNlcnZlck5hbWUgPSB0b29sTmFtZS5zcGxpdCgnX18nKVsxXTtcblx0XHRjb25zdCBjdXN0b21pemF0aW9uSWQgPSBzZXJ2ZXJOYW1lID8gZmluZE1jcENoaWxkSWQodGhpcy5fbGFzdEN1c3RvbWl6YXRpb25zLCBzZXJ2ZXJOYW1lKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoY3VzdG9taXphdGlvbklkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBzaWduYWw7XG5cdFx0fVxuXHRcdHJldHVybiB7IC4uLnNpZ25hbCwgYWN0aW9uOiB7IC4uLnNpZ25hbC5hY3Rpb24sIGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLk1DUCwgY3VzdG9taXphdGlvbklkIH0gfSB9O1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgc2Vzc2lvblVyaTogVVJJLFxuXHRcdHJlYWRvbmx5IGNoYXRDaGFubmVsVXJpOiBVUkksXG5cdFx0cmVhZG9ubHkgd29ya3NwYWNlOiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0cHJvamVjdDogSUFnZW50U2Vzc2lvblByb2plY3RJbmZvIHwgdW5kZWZpbmVkLFxuXHRcdG1vZGVsOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCxcblx0XHRhZ2VudDogQWdlbnRTZWxlY3Rpb24gfCB1bmRlZmluZWQsXG5cdFx0Y29uZmlnOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCxcblx0XHRhYm9ydENvbnRyb2xsZXI6IEFib3J0Q29udHJvbGxlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nQ2xpZW50VG9vbENhbGxzOiBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PENhbGxUb29sUmVzdWx0Pixcblx0XHR0b29sRGlmZjogU2Vzc2lvbkNsaWVudFRvb2xzRGlmZixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wZXJtaXNzaW9uTW9kZUZhbGxiYWNrOiBDbGF1ZGVQZXJtaXNzaW9uTW9kZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tZXRhZGF0YVN0b3JlOiBDbGF1ZGVTZXNzaW9uTWV0YWRhdGFTdG9yZSxcblx0XHRhZGRpdGlvbmFsRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLFxuXHRcdEBJQ2xhdWRlQWdlbnRTZGtTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nka1NlcnZpY2U6IElDbGF1ZGVBZ2VudFNka1NlcnZpY2UsXG5cdFx0QElTZXNzaW9uRGF0YVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkRhdGFTZXJ2aWNlOiBJU2Vzc2lvbkRhdGFTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NoYXRDaGFubmVsVXJpID0gY2hhdENoYW5uZWxVcmk7XG5cdFx0dGhpcy5wcm9qZWN0ID0gcHJvamVjdDtcblx0XHR0aGlzLl9wcm92aXNpb25hbE1vZGVsID0gbW9kZWw7XG5cdFx0dGhpcy5fcHJvdmlzaW9uYWxBZ2VudCA9IGFnZW50O1xuXHRcdHRoaXMucHJvdmlzaW9uYWxDb25maWcgPSBjb25maWc7XG5cdFx0dGhpcy5hYm9ydENvbnRyb2xsZXIgPSBhYm9ydENvbnRyb2xsZXI7XG5cdFx0dGhpcy5fYWRkaXRpb25hbERpcmVjdG9yaWVzID0gYWRkaXRpb25hbERpcmVjdG9yaWVzO1xuXHRcdHRoaXMudG9vbERpZmYgPSB0aGlzLl9yZWdpc3Rlcih0b29sRGlmZik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jbGllbnRDdXN0b21pemF0aW9uc0RpZmYub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fb25EaWRDdXN0b21pemF0aW9uc0NoYW5nZS5maXJlKCkpKTtcblxuXHRcdHRoaXMuX3dhdGNoQ3VzdG9taXphdGlvbnModGhpcy53b3JraW5nRGlyZWN0b3JpZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2F0Y2hDdXN0b21pemF0aW9ucyhkaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCB3YXRjaGVyID0gc3RvcmUuYWRkKG5ldyBDbGF1ZGVDdXN0b21pemF0aW9uV2F0Y2hlcihcblx0XHRcdGRpcmVjdG9yaWVzLFxuXHRcdFx0dGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJIb21lLFxuXHRcdFx0dGhpcy5fZmlsZVNlcnZpY2UsXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLFxuXHRcdCkpO1xuXHRcdHN0b3JlLmFkZCh3YXRjaGVyLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX29uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UuZmlyZSgpKSk7XG5cdFx0dGhpcy5fY3VzdG9taXphdGlvbldhdGNoZXIudmFsdWUgPSBzdG9yZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPbmUtc2hvdCBTREsgYXNzaXN0YW50LW1lc3NhZ2UgdXVpZCB0aGF0IHRoZSBuZXh0IG1hdGVyaWFsaXplIC8gcmVidWlsZFxuXHQgKiByZXN1bWVzICp1cCB0byBhbmQgaW5jbHVkaW5nKiAodGhlIFNESydzIGBPcHRpb25zLnJlc3VtZVNlc3Npb25BdGApLlxuXHQgKiBTdGFnZWQgYnkge0BsaW5rIHRydW5jYXRlVG9UdXJufTsgcmVhZCBieSB0aGUgbmV4dCBidWlsZCBhbmQgY2xlYXJlZFxuXHQgKiBvbmx5IG9uY2UgdGhhdCBidWlsZCAqc3VjY2VlZHMqIChzbyBhIHRocm93biAvIGNhbmNlbGxlZCByZWJ1aWxkIGtlZXBzXG5cdCAqIHRoZSBhbmNob3Igc3RhZ2VkIGFuZCB0aGUgbmV4dCBzZW5kIHJldHJpZXMgdGhlIHRydW5jYXRpb24gcmF0aGVyIHRoYW5cblx0ICogc2lsZW50bHkgcHJvY2VlZGluZyB3aXRob3V0IGl0IGFuZCB1bmRvaW5nIHRoZSBjaGVja3BvaW50IHJlc3RvcmUpLlxuXHQgKi9cblx0cHJpdmF0ZSBfcGVuZGluZ1Jlc3VtZVNlc3Npb25BdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBJbi1wbGFjZSB0cnVuY2F0aW9uIHRvIGB0dXJuSWRgIChcIlJlc3RvcmUgQ2hlY2twb2ludFwiKTogcHJ1bmUgdGhlXG5cdCAqIHBlci10dXJuIERCIHJvd3MgKGZpbGUgZWRpdHMsIGNoZWNrcG9pbnQgcmVmcykgcGFzdCB0aGUgYm91bmRhcnkgQU5EXG5cdCAqIHN0YWdlIHRoZSBTREsgcmVzdW1lIGFuY2hvciB0aGF0IHRoZSBuZXh0IHJlYnVpbGQgYXBwbGllcyB2aWFcblx0ICogYE9wdGlvbnMucmVzdW1lU2Vzc2lvbkF0YC4gVGhlc2UgdHdvIGhhbHZlcyBhcmUgb25lIGludmFyaWFudCBcdTIwMTQgcHJ1bmluZ1xuXHQgKiB3aXRob3V0IHN0YWdpbmcgdGhlIGFuY2hvciB3b3VsZCBkcm9wIERCIHJvd3Mgd2hpbGUgdGhlIFNESyBzdGlsbFxuXHQgKiByZXBsYXlzIHRoZSB0cnVuY2F0ZWQgdHVybnM7IHN0YWdpbmcgd2l0aG91dCBwcnVuaW5nIHdvdWxkIGxlYXZlIHN0YWxlXG5cdCAqIHJvd3MgXHUyMDE0IHNvIHRoZXkgbGl2ZSBiZWhpbmQgYSBzaW5nbGUgY2FsbCByYXRoZXIgdGhhbiB0d28gdGhlIGNhbGxlclxuXHQgKiBjb3VsZCBoYWxmLWludm9rZS4gVGhlIHBydW5lIHJ1bnMgZmlyc3QgYmVjYXVzZSBpdCBpcyB0aGUgZmFsbGlibGUgaGFsZjpcblx0ICogYSBEQiBmYWlsdXJlIHRoZW4gcmVqZWN0cyB3aXRob3V0IGxlYXZpbmcgYW4gYW5jaG9yIHN0YWdlZCBmb3IgdGhlIG5leHRcblx0ICogdHVybi4gYHR1cm5JZGAgaXMgdGhlIHByb3RvY29sIHR1cm4gaWQgKERCIGtleSk7IGByZXN1bWVBbmNob3JVdWlkYCBpc1xuXHQgKiB0aGUgU0RLIGFzc2lzdGFudC1tZXNzYWdlIHV1aWQgdGhlIGFnZW50IHJlc29sdmVkIGZvciBpdC5cblx0ICovXG5cdGFzeW5jIHRydW5jYXRlVG9UdXJuKHR1cm5JZDogc3RyaW5nLCByZXN1bWVBbmNob3JVdWlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl93aXRoRGF0YWJhc2UoZGIgPT4gZGIuZGVsZXRlVHVybnNBZnRlcih0dXJuSWQpKTtcblx0XHR0aGlzLl9wZW5kaW5nUmVzdW1lU2Vzc2lvbkF0ID0gcmVzdW1lQW5jaG9yVXVpZDtcblx0fVxuXG5cdC8qKiBQcnVuZXMgYWxsIHBlci10dXJuIERCIHJvd3MgKHJlbW92ZS1hbGwgdHJ1bmNhdGlvbikuICovXG5cdGFzeW5jIHBydW5lQWxsVHVybnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fd2l0aERhdGFiYXNlKGRiID0+IGRiLmRlbGV0ZUFsbFR1cm5zKCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJ1bnMgYGZuYCBhZ2FpbnN0IGEgc2hvcnQtbGl2ZWQsIHJlZi1jb3VudGVkIHNlc3Npb24gREIgaGFuZGxlIHNvIHRoZVxuXHQgKiB3cml0ZSBpcyBzYWZlIHJlZ2FyZGxlc3Mgb2YgdGhlIHBpcGVsaW5lJ3Mgb3duIGRiUmVmIGxpZmVjeWNsZSAodGhlXG5cdCAqIHJlZi1jb3VudCBrZWVwcyB0aGUgc2hhcmVkIERCIGFsaXZlOyBkaXNwb3Npbmcgb25seSBkZWNyZW1lbnRzKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3dpdGhEYXRhYmFzZShmbjogKGRiOiBJU2Vzc2lvbkRhdGFiYXNlKSA9PiBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVmID0gdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLm9wZW5EYXRhYmFzZSh0aGlzLl9zdG9yYWdlVXJpKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZm4ocmVmLm9iamVjdCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEJyaW5nIHRoZSBzZXNzaW9uIHVwOiBidWlsZCBTREsgYE9wdGlvbnNgLCBzdGFydCB0aGUgU0RLLCBvcGVuIHRoZVxuXHQgKiBzZXNzaW9uLXNjb3BlZCBEQiByZWYsIGNvbnN0cnVjdCB0aGUgcGlwZWxpbmUsIGFuZCBhdHRhY2ggdGhlXG5cdCAqIHJlbWF0ZXJpYWxpemVyIHVzZWQgZm9yIHlpZWxkLXJlc3RhcnQgKGUuZy4gYWZ0ZXIgYSBjbGllbnQtdG9vbFxuXHQgKiBzbmFwc2hvdCBjaGFuZ2UpLiBJZGVtcG90ZW50IG9uIHJlLWNhbGw6IGV4dHJhIGNhbGxzIHRocm93IHJhdGhlclxuXHQgKiB0aGFuIHNpbGVudGx5IHJlLW1hdGVyaWFsaXplLlxuXHQgKlxuXHQgKiBJZiB0aGUgc3VwcGxpZWQge0BsaW5rIElNYXRlcmlhbGl6ZUNvbnRleHQucHJveHlIYW5kbGV9J3MgdW5kZXJseWluZ1xuXHQgKiBgYWJvcnRDb250cm9sbGVyYCBmaXJlcyB3aGlsZSBgc2RrLnN0YXJ0dXAoKWAgaXMgaW4gZmxpZ2h0LCB0aGUgU0RLXG5cdCAqIHVud2luZHMgdmlhIHRoZSBjb250cm9sbGVyOyBpZiBgc3RhcnR1cGAgcmVzb2x2ZXMgYW55d2F5LCB0aGVcblx0ICogYFdhcm1RdWVyeWAgaXMgYXN5bmNEaXNwb3NlZCBhbmQgYSB7QGxpbmsgQ2FuY2VsbGF0aW9uRXJyb3J9IGlzXG5cdCAqIHRocm93biAoUTggYmVsdC1hbmQtc3VzcGVuZGVycykuXG5cdCAqL1xuXHRhc3luYyBtYXRlcmlhbGl6ZShjdHg6IElNYXRlcmlhbGl6ZUNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fcGlwZWxpbmUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2xhdWRlQWdlbnRTZXNzaW9uIGlzIGFscmVhZHkgbWF0ZXJpYWxpemVkJyk7XG5cdFx0fVxuXHRcdC8vIEFkb3B0IHRoZSBob3N0LXJlc29sdmVkIHdvcmtpbmcgZGlyZWN0b3J5IChlLmcuIGFuIGlzb2xhdGVkIHdvcmt0cmVlKVxuXHRcdC8vIGJlZm9yZSBpdCdzIHJlYWQgYmVsb3c7IGZhbGxzIGJhY2sgdG8gdGhlIHNlc3Npb24ncyBgd29ya3NwYWNlYCB3aGVuIHRoZVxuXHRcdC8vIGhvc3QgZGlkbid0IHJlc29sdmUgYSBkZWRpY2F0ZWQgZGlyZWN0b3J5LiBUaGUgcGx1cmFsXG5cdFx0Ly8gYHdvcmtpbmdEaXJlY3Rvcmllc2AgKGluZGV4IDAgPSByZXNvbHZlZCBwcmltYXJ5LCAxLi5OID0gYWRkaXRpb25hbFxuXHRcdC8vIHJvb3RzKSB0YWtlcyBwcmVjZWRlbmNlIGFuZCBhbHNvIHJlZnJlc2hlcyB0aGUgYWRkaXRpb25hbC1kaXJlY3Rvcnlcblx0XHQvLyB0YWlsOyB0aGUgc2luZ3VsYXIgYHdvcmtpbmdEaXJlY3RvcnlgIHN0YXlzIHN1cHBvcnRlZCBmb3Igc2luZ2xlLXJvb3Rcblx0XHQvLyBjYWxsZXJzIHRoYXQgb25seSByZXNvbHZlIHRoZSBwcmltYXJ5LlxuXHRcdGNvbnN0IHByZXZpb3VzV29ya2luZ0RpcmVjdG9yaWVzID0gdGhpcy53b3JraW5nRGlyZWN0b3JpZXM7XG5cdFx0Y29uc3QgcmVzb2x2ZWRQcmltYXJ5ID0gY3R4LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdID8/IGN0eC53b3JraW5nRGlyZWN0b3J5O1xuXHRcdGlmIChyZXNvbHZlZFByaW1hcnkgJiYgIWlzRXF1YWwocmVzb2x2ZWRQcmltYXJ5LCB0aGlzLndvcmtpbmdEaXJlY3RvcnkpKSB7XG5cdFx0XHR0aGlzLl93b3JraW5nRGlyZWN0b3J5ID0gcmVzb2x2ZWRQcmltYXJ5O1xuXHRcdH1cblx0XHRpZiAoY3R4LndvcmtpbmdEaXJlY3RvcmllcyAmJiBjdHgud29ya2luZ0RpcmVjdG9yaWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX2FkZGl0aW9uYWxEaXJlY3RvcmllcyA9IGN0eC53b3JraW5nRGlyZWN0b3JpZXMuc2xpY2UoMSk7XG5cdFx0fVxuXHRcdGNvbnN0IGN1cnJlbnRXb3JraW5nRGlyZWN0b3JpZXMgPSB0aGlzLndvcmtpbmdEaXJlY3Rvcmllcztcblx0XHRpZiAoIXNhbWVXb3JraW5nRGlyZWN0b3JpZXMocHJldmlvdXNXb3JraW5nRGlyZWN0b3JpZXMsIGN1cnJlbnRXb3JraW5nRGlyZWN0b3JpZXMpKSB7XG5cdFx0XHR0aGlzLl93YXRjaEN1c3RvbWl6YXRpb25zKGN1cnJlbnRXb3JraW5nRGlyZWN0b3JpZXMpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMud29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgbWF0ZXJpYWxpemUgQ2xhdWRlIHNlc3Npb24gJHt0aGlzLnNlc3Npb25JZH06IHdvcmtpbmdEaXJlY3RvcnkgaXMgcmVxdWlyZWRgKTtcblx0XHR9XG5cdFx0dGhpcy5fdHJhbnNwb3J0S2luZCA9IGN0eC50cmFuc3BvcnQua2luZDtcblxuXHRcdGNvbnN0IHBlcm1pc3Npb25Nb2RlID0gcmVhZENsYXVkZVBlcm1pc3Npb25Nb2RlKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9zdG9yYWdlVXJpKSA/PyB0aGlzLl9wZXJtaXNzaW9uTW9kZUZhbGxiYWNrO1xuXHRcdGNvbnN0IHsgbWNwU2VydmVycywgYWxsb3dlZFRvb2xzIH0gPSBhd2FpdCB0aGlzLl9idWlsZFN0YXJ0dXBUb29sV2lyaW5nKGN0eC5zZXJ2ZXJUb29sSG9zdCk7XG5cdFx0Y29uc3QgYWdlbnROYW1lID0gYXdhaXQgcmVzb2x2ZUNsYXVkZUFnZW50TmFtZSh0aGlzLl9wcm92aXNpb25hbEFnZW50LCB0aGlzLl9maWxlU2VydmljZSwgdGhpcy5fbG9nU2VydmljZSwgdGhpcy5zZXNzaW9uSWQpO1xuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGF3YWl0IGJ1aWxkT3B0aW9ucyhcblx0XHRcdHtcblx0XHRcdFx0c2Vzc2lvbklkOiB0aGlzLnNlc3Npb25JZCxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogdGhpcy53b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0XHRhZGRpdGlvbmFsRGlyZWN0b3JpZXM6IHRoaXMuX2FkZGl0aW9uYWxEaXJlY3Rvcmllcyxcblx0XHRcdFx0bW9kZWw6IHRoaXMuX3Byb3Zpc2lvbmFsTW9kZWwsXG5cdFx0XHRcdGFib3J0Q29udHJvbGxlcjogdGhpcy5hYm9ydENvbnRyb2xsZXIsXG5cdFx0XHRcdHBlcm1pc3Npb25Nb2RlLFxuXHRcdFx0XHRjYW5Vc2VUb29sOiBjdHguY2FuVXNlVG9vbCxcblx0XHRcdFx0b25FbGljaXRhdGlvbjogY3R4Lm9uRWxpY2l0YXRpb24sXG5cdFx0XHRcdGlzUmVzdW1lOiBjdHguaXNSZXN1bWUsXG5cdFx0XHRcdHJlc3VtZVNlc3Npb25BdDogdGhpcy5fcGVuZGluZ1Jlc3VtZVNlc3Npb25BdCxcblx0XHRcdFx0bWNwU2VydmVycyxcblx0XHRcdFx0YWxsb3dlZFRvb2xzLFxuXHRcdFx0XHRwbHVnaW5zOiB0aGlzLmNsaWVudEN1c3RvbWl6YXRpb25zRGlmZi5jb25zdW1lKHRoaXMuX2Rlc2lyZWRDbGllbnRQbHVnaW5QYXRocygpKSxcblx0XHRcdFx0YWdlbnQ6IGFnZW50TmFtZSxcblx0XHRcdH0sXG5cdFx0XHRjdHgudHJhbnNwb3J0LFxuXHRcdFx0ZGF0YSA9PiB0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQ2xhdWRlIFNESyBzdGRlcnJdICR7ZGF0YX1gKSxcblx0XHQpO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ2xhdWRlXSBzZXNzaW9uICR7dGhpcy5zZXNzaW9uSWR9OiBlbmFibGVGaWxlQ2hlY2twb2ludGluZz0ke29wdGlvbnMuZW5hYmxlRmlsZUNoZWNrcG9pbnRpbmd9IGlzUmVzdW1lPSR7Y3R4LmlzUmVzdW1lfWApO1xuXG5cdFx0Y29uc3Qgd2FybSA9IGF3YWl0IHRoaXMuX3Nka1NlcnZpY2Uuc3RhcnR1cCh7IG9wdGlvbnMgfSk7XG5cblx0XHRpZiAodGhpcy5hYm9ydENvbnRyb2xsZXIuc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdGF3YWl0IHdhcm1bU3ltYm9sLmFzeW5jRGlzcG9zZV0oKTtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRiUmVmID0gdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLm9wZW5EYXRhYmFzZSh0aGlzLl9zdG9yYWdlVXJpKTtcblx0XHRsZXQgcGlwZWxpbmU6IENsYXVkZVNka1BpcGVsaW5lO1xuXHRcdHRyeSB7XG5cdFx0XHRwaXBlbGluZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDbGF1ZGVTZGtQaXBlbGluZSxcblx0XHRcdFx0dGhpcy5zZXNzaW9uSWQsXG5cdFx0XHRcdHRoaXMuc2Vzc2lvblVyaSxcblx0XHRcdFx0dGhpcy5fY2hhdENoYW5uZWxVcmksXG5cdFx0XHRcdHdhcm0sXG5cdFx0XHRcdHRoaXMuYWJvcnRDb250cm9sbGVyLFxuXHRcdFx0XHRkYlJlZixcblx0XHRcdFx0dGhpcy5zdWJhZ2VudHMsXG5cdFx0XHRcdCh0b29sTmFtZTogc3RyaW5nKSA9PiB0aGlzLnRvb2xEaWZmLm1vZGVsLm93bmVyT2YodG9vbE5hbWUpLFxuXHRcdFx0KSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRkYlJlZi5kaXNwb3NlKCk7XG5cdFx0XHRhd2FpdCB3YXJtW1N5bWJvbC5hc3luY0Rpc3Bvc2VdKCk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHBpcGVsaW5lLm9uRGlkUHJvZHVjZVNpZ25hbChzID0+IHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUodGhpcy5fZW5yaWNoU2lnbmFsV2l0aE1jcENvbnRyaWJ1dG9yKHRoaXMuX2VucmljaFNpZ25hbFdpdGhDcmVkaXRzKHMpKSkpKTtcblx0XHR0aGlzLl9waXBlbGluZSA9IHBpcGVsaW5lO1xuXHRcdC8vIFRoZSBtYXRlcmlhbGl6ZSBzdWNjZWVkZWQgd2l0aCB0aGUgc3RhZ2VkIGFuY2hvciBhcHBsaWVkIHRvIGBPcHRpb25zYFxuXHRcdC8vIFx1MjAxNCBjbGVhciBpdCBub3cgc28gaXQgaXNuJ3QgcmUtYXBwbGllZC4gQSB0aHJvdyBiZWZvcmUgdGhpcyBwb2ludCAoZS5nLlxuXHRcdC8vIGBzdGFydHVwYCAvIHBpcGVsaW5lLWNyZWF0ZSkgbGVhdmVzIGl0IHN0YWdlZCBmb3IgdGhlIG5leHQgcmV0cnkuXG5cdFx0dGhpcy5fcGVuZGluZ1Jlc3VtZVNlc3Npb25BdCA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIFNlZWQgdGhlIHBpcGVsaW5lJ3MgYmlqZWN0aXZlIGNvbmZpZyBjYWNoZSBzbyBhIHJlYnVpbGQgcmUtYXBwbGllc1xuXHRcdC8vIHRoZSB1c2VyJ3MgbGFzdC1jaG9zZW4gbW9kZWwgLyBlZmZvcnQgd2l0aG91dCBsb3NpbmcgdGhlIHBpY2tlclxuXHRcdC8vIGNvbmZpZy4gUmVhZCBwcm92aXNpb25hbCBzdGF0ZSBkaXJlY3RseSBvZmYgdGhlIHNlc3Npb24uXG5cdFx0cGlwZWxpbmUuc2VlZEN1cnJlbnRDb25maWcoXG5cdFx0XHR0b1Nka01vZGVsSWQodGhpcy5fcHJvdmlzaW9uYWxNb2RlbD8uaWQpLFxuXHRcdFx0dG9SdW50aW1lRWZmb3J0TGV2ZWwocmVzb2x2ZUNsYXVkZUVmZm9ydCh0aGlzLl9wcm92aXNpb25hbE1vZGVsKSksXG5cdFx0XHRwZXJtaXNzaW9uTW9kZSxcblx0XHQpO1xuXG5cdFx0Ly8gRnJlc2ggc2Vzc2lvbnMgcGVyc2lzdCB0aGVpciBjdXN0b21pemF0aW9uLWRpcmVjdG9yeSAvIG1vZGVsIC9cblx0XHQvLyBwZXJtaXNzaW9uTW9kZSBvdmVybGF5IHNvIGEgbGF0ZXIgcmVzdW1lIHJlLXJlYWRzIHRoZW0uIFJlc3VtZVxuXHRcdC8vIHNlc3Npb25zIHNraXAgdGhlIHdyaXRlIGJlY2F1c2UgdGhleSBSRUFEIGZyb20gdGhlIG92ZXJsYXlcblx0XHQvLyB1cHN0cmVhbSBhbmQgd291bGQgb3RoZXJ3aXNlIG92ZXJ3cml0ZSB0aGVpciBzb3VyY2UuXG5cdFx0aWYgKCFjdHguaXNSZXN1bWUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX21ldGFkYXRhU3RvcmUud3JpdGUodGhpcy5fc3RvcmFnZVVyaSwge1xuXHRcdFx0XHRcdGN1c3RvbWl6YXRpb25EaXJlY3Rvcnk6IHRoaXMud29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdFx0XHRtb2RlbDogdGhpcy5fcHJvdmlzaW9uYWxNb2RlbCxcblx0XHRcdFx0XHRwZXJtaXNzaW9uTW9kZSxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IGN0eC50cmFuc3BvcnQua2luZCxcblx0XHRcdFx0XHQvLyBQZXJzaXN0IHRoZSBmdWxsIG9yZGVyZWQgc2V0IHNvIGEgY29sZCByZXN1bWUgLyByZW1vdmUtYWxsIC9cblx0XHRcdFx0XHQvLyBmb3JrIGNhbiByZWNvdmVyIHRoZSB0YWlsICh0aGUgU0RLIGNhdGFsb2cgb25seSBzdG9yZXMgYGN3ZGApLlxuXHRcdFx0XHRcdC8vIE9ubHkgbWVhbmluZ2Z1bCB3aGVuIHRoZXJlIGlzIGEgdGFpbDsgc2luZ2xlLXJvb3Qgc2Vzc2lvbnNcblx0XHRcdFx0XHQvLyBsZWF2ZSBpdCBhYnNlbnQgc28gYWJzZW5jZSByZWFkcyBhcyBzaW5nbGUtcm9vdC5cblx0XHRcdFx0XHQuLi4odGhpcy5fYWRkaXRpb25hbERpcmVjdG9yaWVzLmxlbmd0aCA+IDAgJiYgdGhpcy53b3JraW5nRGlyZWN0b3JpZXMgPyB7IHdvcmtpbmdEaXJlY3RvcmllczogdGhpcy53b3JraW5nRGlyZWN0b3JpZXMgfSA6IHt9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0NsYXVkZV0gRmFpbGVkIHRvIHBlcnNpc3QgY3VzdG9taXphdGlvbiBkaXJlY3Rvcnk7IGFib3J0aW5nIG1hdGVyaWFsaXplYCwgZXJyKTtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZpbmFsIHByZS1jb21taXQgYWJvcnQgZ2F0ZS4gVGhlIGZpcnN0IGdhdGUgYWJvdmUgY2F1Z2h0IGFib3J0c1xuXHRcdC8vIHRoYXQgbGFuZGVkIHdoaWxlIGBzZGsuc3RhcnR1cCgpYCB3YXMgaW4gZmxpZ2h0OyB0aGlzIG9uZSBjYXRjaGVzXG5cdFx0Ly8gYWJvcnRzIHRoYXQgbGFuZGVkIGR1cmluZyB0aGUgbWV0YWRhdGEgd3JpdGUgKGEgc2VwYXJhdGUgYXN5bmNcblx0XHQvLyBib3VuZGFyeSkuIFdpdGhvdXQgaXQsIGEgcmFjaW5nIGBkaXNwb3NlU2Vzc2lvbmAgY291bGQgY29tcGxldGVcblx0XHQvLyBiZWZvcmUgdGhpcyBtZXRob2QgcmV0dXJucyBhbmQgbGVhdmUgdGhlIHBpcGVsaW5lIGxpdmUuXG5cdFx0aWYgKHRoaXMuYWJvcnRDb250cm9sbGVyLnNpZ25hbC5hYm9ydGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cblx0XHRwaXBlbGluZS5hdHRhY2hSZW1hdGVyaWFsaXplcihhc3luYyAoX3JlYXNvbikgPT4ge1xuXHRcdFx0Y29uc3QgbGl2ZU1vZGUgPSByZWFkQ2xhdWRlUGVybWlzc2lvbk1vZGUodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX3N0b3JhZ2VVcmkpID8/IHRoaXMuX3Blcm1pc3Npb25Nb2RlRmFsbGJhY2s7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB7IG1jcFNlcnZlcnM6IHJlYnVpbGRNY3AsIGFsbG93ZWRUb29sczogcmVidWlsZEFsbG93ZWRUb29scyB9ID0gYXdhaXQgdGhpcy5fYnVpbGRTdGFydHVwVG9vbFdpcmluZyhjdHguc2VydmVyVG9vbEhvc3QpO1xuXHRcdFx0XHRjb25zdCByZWJ1aWxkQWdlbnROYW1lID0gYXdhaXQgcmVzb2x2ZUNsYXVkZUFnZW50TmFtZSh0aGlzLl9wcm92aXNpb25hbEFnZW50LCB0aGlzLl9maWxlU2VydmljZSwgdGhpcy5fbG9nU2VydmljZSwgdGhpcy5zZXNzaW9uSWQpO1xuXHRcdFx0XHRjb25zdCByZWJ1aWxkQWJvcnQgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cdFx0XHRcdGNvbnN0IHJlYnVpbGRPcHRpb25zID0gYXdhaXQgYnVpbGRPcHRpb25zKFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHNlc3Npb25JZDogdGhpcy5zZXNzaW9uSWQsXG5cdFx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB0aGlzLndvcmtpbmdEaXJlY3RvcnkhLFxuXHRcdFx0XHRcdFx0YWRkaXRpb25hbERpcmVjdG9yaWVzOiB0aGlzLl9hZGRpdGlvbmFsRGlyZWN0b3JpZXMsXG5cdFx0XHRcdFx0XHRtb2RlbDogdGhpcy5fcHJvdmlzaW9uYWxNb2RlbCxcblx0XHRcdFx0XHRcdGFib3J0Q29udHJvbGxlcjogcmVidWlsZEFib3J0LFxuXHRcdFx0XHRcdFx0cGVybWlzc2lvbk1vZGU6IGxpdmVNb2RlLFxuXHRcdFx0XHRcdFx0Y2FuVXNlVG9vbDogY3R4LmNhblVzZVRvb2wsXG5cdFx0XHRcdFx0XHRvbkVsaWNpdGF0aW9uOiBjdHgub25FbGljaXRhdGlvbixcblx0XHRcdFx0XHRcdGlzUmVzdW1lOiB0cnVlLFxuXHRcdFx0XHRcdFx0cmVzdW1lU2Vzc2lvbkF0OiB0aGlzLl9wZW5kaW5nUmVzdW1lU2Vzc2lvbkF0LFxuXHRcdFx0XHRcdFx0bWNwU2VydmVyczogcmVidWlsZE1jcCxcblx0XHRcdFx0XHRcdGFsbG93ZWRUb29sczogcmVidWlsZEFsbG93ZWRUb29scyxcblx0XHRcdFx0XHRcdHBsdWdpbnM6IHRoaXMuY2xpZW50Q3VzdG9taXphdGlvbnNEaWZmLmNvbnN1bWUodGhpcy5fZGVzaXJlZENsaWVudFBsdWdpblBhdGhzKCkpLFxuXHRcdFx0XHRcdFx0YWdlbnQ6IHJlYnVpbGRBZ2VudE5hbWUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRjdHgudHJhbnNwb3J0LFxuXHRcdFx0XHRcdGRhdGEgPT4gdGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0NsYXVkZSBTREsgc3RkZXJyXSAke2RhdGF9YCksXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NsYXVkZV0gc2Vzc2lvbiAke3RoaXMuc2Vzc2lvbklkfTogcmVzdW1lIHJlYnVpbGQgYWdlbnQ9JHtyZWJ1aWxkT3B0aW9ucy5hZ2VudCA/PyAnKG5vbmUpJ31gKTtcblx0XHRcdFx0Y29uc3QgcmVidWlsZFdhcm0gPSBhd2FpdCB0aGlzLl9zZGtTZXJ2aWNlLnN0YXJ0dXAoeyBvcHRpb25zOiByZWJ1aWxkT3B0aW9ucyB9KTtcblx0XHRcdFx0Ly8gUmVidWlsZCBzdWNjZWVkZWQgd2l0aCB0aGUgYW5jaG9yIGFwcGxpZWQgXHUyMDE0IGNsZWFyIGl0IHNvIGl0XG5cdFx0XHRcdC8vIGlzbid0IHJlLWFwcGxpZWQuIEEgdGhyb3cgYWJvdmUga2VlcHMgaXQgc3RhZ2VkIChoYW5kbGVkIGluIHRoZVxuXHRcdFx0XHQvLyBjYXRjaCBhbG9uZ3NpZGUgdGhlIHRvb2wvY3VzdG9taXphdGlvbiBkaWZmcykgc28gdGhlIG5leHQgc2VuZFxuXHRcdFx0XHQvLyByZXRyaWVzIHRoZSB0cnVuY2F0aW9uIGluc3RlYWQgb2YgZHJvcHBpbmcgdGhlIHJlc3RvcmUuXG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdSZXN1bWVTZXNzaW9uQXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHJldHVybiB7IHdhcm06IHJlYnVpbGRXYXJtLCBhYm9ydENvbnRyb2xsZXI6IHJlYnVpbGRBYm9ydCB9O1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMudG9vbERpZmYubWFya0RpcnR5KCk7XG5cdFx0XHRcdHRoaXMuY2xpZW50Q3VzdG9taXphdGlvbnNEaWZmLm1hcmtEaXJ0eSgpO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0YXdhaXQgdGhpcy5fcmVjb25jaWxlTWNwU2VydmVyRW5hYmxlbWVudCgpO1xuXG5cdFx0Ly8gQWR2ZXJ0aXNlIHRoZSBhZ2VudCBob3N0J3Mgc2VydmVyIHRvb2xzIG9uIHRoaXMgc2Vzc2lvbiBzbyB0aGUgY2xpZW50XG5cdFx0Ly8gc2VlcyB0aGVtIGFzIHNlcnZlci1wcm92aWRlZC4gRXhlY3V0aW9uIGhhcHBlbnMgaW4tcHJvY2VzcyB2aWEgdGhlXG5cdFx0Ly8gc2VydmVyLXRvb2wgTUNQIHNlcnZlciBidWlsdCBpbiBgX2J1aWxkU3RhcnR1cFRvb2xXaXJpbmdgLlxuXHRcdGN0eC5zZXJ2ZXJUb29sSG9zdD8uYWR2ZXJ0aXNlKHRoaXMuX3N0b3JhZ2VVcmkudG9TdHJpbmcoKSk7XG5cblx0XHQvLyBTdXJmYWNlIHRoZSBTREstcmVzb2x2ZWQgY3VzdG9taXphdGlvbiB0aWVyIHRvIHRoZSB3b3JrYmVuY2guXG5cdFx0Ly8gUHJlLW1hdGVyaWFsaXplLCBnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMgcmV0dXJucyBvbmx5IHRoZVxuXHRcdC8vIGNsaWVudC1wdXNoZWQgc2xpY2U7IGZpcmluZyBoZXJlIHByb21wdHMgdGhlIHdvcmtiZW5jaCB0byByZWZldGNoXG5cdFx0Ly8gYW5kIHBpY2sgdXAgdGhlIGJ1bmRsZWQgYERpc2NvdmVyZWQgaW4gQ2xhdWRlYCBlbnRyeS5cblx0XHR0aGlzLl9vbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlLmZpcmUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZCB0aGUgU0RLIHRvb2wgd2lyaW5nIHNoYXJlZCBieSB0aGUgaW5pdGlhbCBtYXRlcmlhbGl6ZSBhbmQgZXZlcnlcblx0ICogeWllbGQtcmVzdGFydCByZW1hdGVyaWFsaXplOiB0aGUgaW4tcHJvY2VzcyBNQ1Agc2VydmVycyBwbHVzIHRoZVxuXHQgKiBhdXRvLWFwcHJvdmUgYWxsb3ctbGlzdC5cblx0ICpcblx0ICogVGhlIE1DUCBzZXJ2ZXJzIGFyZSB0aGUgd29ya2JlbmNoIGNsaWVudCB0b29scyAod2hpY2ggcm91bmQtdHJpcCB0byB0aGVcblx0ICogd29ya2JlbmNoKSBwbHVzLCB3aGVuIGEgc2VydmVyLXRvb2wgaG9zdCBpcyB3aXJlZCwgdGhlIGFnZW50IGhvc3QncyBvd25cblx0ICogc2VydmVyIHRvb2xzIChleGVjdXRlZCBpbi1wcm9jZXNzKS4gYG1jcFNlcnZlcnNgIGlzIGB1bmRlZmluZWRgIHdoZW5cblx0ICogbmVpdGhlciBpcyBwcmVzZW50IHNvIGBPcHRpb25zLm1jcFNlcnZlcnNgIGlzIG9taXR0ZWQgZW50aXJlbHkgYW5kIHRoZVxuXHQgKiBTREsga2VlcHMgaXRzIGRlZmF1bHQ7IGBhbGxvd2VkVG9vbHNgIGNhcnJpZXMgdGhlIFNESy1wcmVmaXhlZCBzZXJ2ZXIgdG9vbFxuXHQgKiBuYW1lcyAoc28gdGhleSBhdXRvLWFwcHJvdmUgd2l0aG91dCBwcm9tcHRpbmcpIGFuZCBpcyBgdW5kZWZpbmVkYCB3aGVuIG5vXG5cdCAqIHNlcnZlci10b29sIGhvc3QgaXMgd2lyZWQuXG5cdCAqXG5cdCAqIEtlZXBpbmcgYm90aCBpbiBvbmUgcGxhY2UgZW5zdXJlcyB0aGUgdHdvIHN0YXJ0dXAgcGF0aHMgY2FuIG5ldmVyIGRyaWZ0LFxuXHQgKiBhbmQgdGhhdCBhIG5ld2x5IHJlZ2lzdGVyZWQgc2VydmVyIHRvb2wgaXMgd2lyZWQgZXZlcnl3aGVyZSBhdCBvbmNlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfYnVpbGRTdGFydHVwVG9vbFdpcmluZyhcblx0XHRzZXJ2ZXJUb29sSG9zdDogSUFnZW50U2VydmVyVG9vbEhvc3QgfCB1bmRlZmluZWQsXG5cdCk6IFByb21pc2U8eyBtY3BTZXJ2ZXJzOiBSZWNvcmQ8c3RyaW5nLCBNY3BTZGtTZXJ2ZXJDb25maWdXaXRoSW5zdGFuY2U+IHwgdW5kZWZpbmVkOyBhbGxvd2VkVG9vbHM6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkIH0+IHtcblx0XHRjb25zdCBjbGllbnRTZXJ2ZXJzID0gYXdhaXQgYnVpbGRDbGllbnRNY3BTZXJ2ZXJzKHRoaXMudG9vbERpZmYsIHRoaXMuX3BlbmRpbmdDbGllbnRUb29sQ2FsbHMsIHRoaXMuX3Nka1NlcnZpY2UpO1xuXHRcdGNvbnN0IHNlcnZlclRvb2xTZXJ2ZXIgPSBzZXJ2ZXJUb29sSG9zdFxuXHRcdFx0PyBhd2FpdCBidWlsZFNlcnZlclRvb2xNY3BTZXJ2ZXIoc2VydmVyVG9vbEhvc3QsIHRoaXMuX3N0b3JhZ2VVcmkudG9TdHJpbmcoKSwgdGhpcy5fc2RrU2VydmljZSlcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG1jcFNlcnZlcnMgPSAoIWNsaWVudFNlcnZlcnMgJiYgIXNlcnZlclRvb2xTZXJ2ZXIpXG5cdFx0XHQ/IHVuZGVmaW5lZFxuXHRcdFx0OiB7XG5cdFx0XHRcdC4uLihjbGllbnRTZXJ2ZXJzID8/IHt9KSxcblx0XHRcdFx0Li4uKHNlcnZlclRvb2xTZXJ2ZXIgPyB7IFtDTEFVREVfU0VSVkVSX1RPT0xfTUNQX1NFUlZFUl9OQU1FXTogc2VydmVyVG9vbFNlcnZlciB9IDoge30pLFxuXHRcdFx0fTtcblx0XHQvLyBFeGNsdWRlIHNlcnZlciB0b29scyB0aGF0IHJlcXVpcmUgdXNlciBjb25maXJtYXRpb24gZnJvbSB0aGVcblx0XHQvLyBhdXRvLWFwcHJvdmUgYWxsb3ctbGlzdCBzbyB0aGUgU0RLIHN1cmZhY2VzIHRoZW0gdmlhIGBjYW5Vc2VUb29sYFxuXHRcdC8vICh0aGUgaG9zdCB0aGVuIHJlbmRlcnMgYSBjdXN0b20gY29uZmlybWF0aW9uKSBpbnN0ZWFkIG9mIHJ1bm5pbmcgdGhlbVxuXHRcdC8vIHNpbGVudGx5LlxuXHRcdGNvbnN0IGF1dG9BcHByb3ZlVG9vbE5hbWVzID0gc2VydmVyVG9vbEhvc3Rcblx0XHRcdD8gc2VydmVyVG9vbEhvc3QudG9vbE5hbWVzLmZpbHRlcihuYW1lID0+ICFzZXJ2ZXJUb29sSG9zdC5yZXF1aXJlc0NvbmZpcm1hdGlvbihuYW1lKSlcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiB7IG1jcFNlcnZlcnMsIGFsbG93ZWRUb29sczogYXV0b0FwcHJvdmVUb29sTmFtZXMgPyBzZXJ2ZXJUb29sQWxsb3dMaXN0KGF1dG9BcHByb3ZlVG9vbE5hbWVzKSA6IHVuZGVmaW5lZCB9O1xuXHR9XG5cblx0LyoqIFRydWUgb25jZSB7QGxpbmsgbWF0ZXJpYWxpemV9IGhhcyBpbnN0YWxsZWQgdGhlIFNESyBwaXBlbGluZS4gKi9cblx0Z2V0IGlzUGlwZWxpbmVSZWFkeSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX3BpcGVsaW5lICE9PSB1bmRlZmluZWQ7IH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGlzIGNoYXQgY3VycmVudGx5IGhhcyBhIHR1cm4gaW4gZmxpZ2h0IG9yIHF1ZXVlZC4gRmFsc2Ugd2hlblxuXHQgKiBwcm92aXNpb25hbCAobm8gcGlwZWxpbmUpIG9yIGlkbGUgYmV0d2VlbiB0dXJucy4gVXNlZCBieSBub24tZGVzdHJ1Y3RpdmVcblx0ICogaWRsZSByZWxlYXNlIHRvIGF2b2lkIGRpc2Nvbm5lY3RpbmcgbWlkLXR1cm4uXG5cdCAqL1xuXHRnZXQgaGFzQWN0aXZlVHVybigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX3BpcGVsaW5lPy5oYXNBY3RpdmVUdXJuID8/IGZhbHNlOyB9XG5cblx0LyoqIFByZS1tYXRlcmlhbGl6ZSBtb2RlbCBzZWxlY3Rpb24gYWNjZXNzb3IgKHJlYWQgYnkgbWF0ZXJpYWxpemVyIHRvIGJ1aWxkIE9wdGlvbnMpLiAqL1xuXHRnZXQgcHJvdmlzaW9uYWxNb2RlbCgpOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9wcm92aXNpb25hbE1vZGVsOyB9XG5cblx0cHJpdmF0ZSBfcmVxdWlyZVBpcGVsaW5lKCk6IENsYXVkZVNka1BpcGVsaW5lIHtcblx0XHRpZiAoIXRoaXMuX3BpcGVsaW5lKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NsYXVkZUFnZW50U2Vzc2lvbiBpcyBub3QgbWF0ZXJpYWxpemVkJyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9waXBlbGluZTtcblx0fVxuXG5cdGdldCBpc1Jlc3VtZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9yZXF1aXJlUGlwZWxpbmUoKS5pc1Jlc3VtZWQ7IH1cblxuXHQvKipcblx0ICogQWJvcnQgdGhlIGxpdmUgU0RLIHN1YnByb2Nlc3MgYW5kIGF3YWl0IGl0cyBmdWxsIHRlYXJkb3duIHNvIHRoZVxuXHQgKiBzZXNzaW9uIGlkIGlzIHJlbGVhc2VkLiBOby1vcCB3aGVuIHRoZSBzZXNzaW9uIHdhcyBuZXZlciBtYXRlcmlhbGl6ZWRcblx0ICogKG5vIHN1YnByb2Nlc3MgdG8gc3RvcCkuIFVzZWQgYnkgcmVtb3ZlLWFsbCB0cnVuY2F0aW9uIGJlZm9yZSBpdFxuXHQgKiByZWNyZWF0ZXMgYSBmcmVzaCBzZXNzaW9uIHVuZGVyIHRoZSBzYW1lIGlkIFx1MjAxNCB0aGUgQ0xJIGtlZXBzIHRoZSBpZFxuXHQgKiBsb2NrZWQgdW50aWwgdGhlIG9sZCBzdWJwcm9jZXNzIGV4aXRzLlxuXHQgKi9cblx0YXN5bmMgc2h1dGRvd25MaXZlUXVlcnkoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcGlwZWxpbmU/LnNodXRkb3duQW5kV2FpdCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlZWQgdGhlIHBpcGVsaW5lJ3MgY3VycmVudCArIGFwcGxpZWQgY29uZmlnIGNhY2hlIGZyb21cblx0ICogbWF0ZXJpYWxpemUtdGltZSBgT3B0aW9uc2AuIFRoZSBTREsgYWxyZWFkeSBzdGFydHMgd2l0aCB0aGVzZVxuXHQgKiB2YWx1ZXMsIHNvIHRoZSBjYWNoZSBwcmV2ZW50cyBhIHJlZHVuZGFudCBmaXJzdCBgc2V0TW9kZWxgIC9cblx0ICogYGFwcGx5RmxhZ1NldHRpbmdzYCBjYWxsLlxuXHQgKi9cblx0c2VlZEJpamVjdGl2ZVN0YXRlKHN0YXRlOiB7IG1vZGVsPzogc3RyaW5nOyBlZmZvcnQ/OiBDbGF1ZGVSdW50aW1lRWZmb3J0TGV2ZWw7IHBlcm1pc3Npb25Nb2RlPzogUGVybWlzc2lvbk1vZGUgfSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlcXVpcmVQaXBlbGluZSgpLnNlZWRDdXJyZW50Q29uZmlnKHN0YXRlLm1vZGVsLCBzdGF0ZS5lZmZvcnQsIHN0YXRlLnBlcm1pc3Npb25Nb2RlKTtcblx0fVxuXG5cdGF0dGFjaFJlbWF0ZXJpYWxpemVyKHJlbWF0ZXJpYWxpemVyOiBJUmVtYXRlcmlhbGl6ZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXF1aXJlUGlwZWxpbmUoKS5hdHRhY2hSZW1hdGVyaWFsaXplcihyZW1hdGVyaWFsaXplcik7XG5cdH1cblxuXHQvKipcblx0ICogU2VuZCBhIHVzZXIgcHJvbXB0LiBQZXJmb3JtcyB0aGUgcGVyLXR1cm4gcHJlLWZsaWdodCBiZWZvcmVcblx0ICogeWllbGRpbmcgdG8gdGhlIHBpcGVsaW5lOlxuXHQgKlxuXHQgKiAtIElmIHtAbGluayB0b29sRGlmZn0gb3Ige0BsaW5rIGNsaWVudEN1c3RvbWl6YXRpb25zRGlmZn0gcmVwb3J0cyB0aGVcblx0ICogICBsaXZlIGBRdWVyeWAgaXMgb3V0IG9mIHN5bmMgd2l0aCB0aGUgd29ya2JlbmNoJ3MgdmlldywgeWllbGQtcmVzdGFydFxuXHQgKiAgIHNvIHRoZSBTREsgcGlja3MgdXAgdGhlIG5ldyBgT3B0aW9ucy5tY3BTZXJ2ZXJzYCAvIGBPcHRpb25zLnBsdWdpbnNgLlxuXHQgKiAgIGBRdWVyeS5yZWxvYWRQbHVnaW5zKClgIGNhbm5vdCBoZWxwIGhlcmUgXHUyMDE0IHRoZSBTREsncyBwbHVnaW4gVVJJIHNldFxuXHQgKiAgIGlzIGNhcHR1cmVkIGF0IHN0YXJ0dXAsIHNvIGFueSBhZGQgLyByZW1vdmUgLyBub25jZS1idW1wIG11c3QgZ29cblx0ICogICB0aHJvdWdoIGEgZnVsbCByZWJ1aWxkLiBUaGUgcmViaW5kIGl0c2VsZiByZS1hcHBsaWVzIHRoZSBsaXZlXG5cdCAqICAgYHBlcm1pc3Npb25Nb2RlYCB2aWEgdGhlIHJlbWF0ZXJpYWxpemVyLlxuXHQgKiAtIE90aGVyd2lzZSBmb3J3YXJkIHRoZSBsaXZlIGBwZXJtaXNzaW9uTW9kZWAgdG8gdGhlIGJvdW5kIGBRdWVyeWAgc29cblx0ICogICBhIGBTZXNzaW9uQ29uZmlnQ2hhbmdlZGAgYWN0aW9uIHRoYXQgYXJyaXZlZCBiZXR3ZWVuIHR1cm5zIHdpbnMuXG5cdCAqICAgVGhlIHBpcGVsaW5lJ3MgYmlqZWN0aXZlIGNhY2hlIGRlZHVwZXMgYSBuby1vcCBgc2V0UGVybWlzc2lvbk1vZGVgLFxuXHQgKiAgIHNvIHRoaXMgaXMgZnJlZSB3aGVuIG5vdGhpbmcgY2hhbmdlZC5cblx0ICpcblx0ICogTW9kZWwgLyBlZmZvcnQgYXJlIG5vdCB0aHJlYWRlZCB0aHJvdWdoIGhlcmUgXHUyMDE0IHRoZSBwaXBlbGluZSdzIGN1cnJlbnRcblx0ICogbW9kZWwgLyBlZmZvcnQgKHNldCBlYWdlcmx5IHZpYSB7QGxpbmsgc2V0TW9kZWx9KSBpcyB3aGF0ZXZlclxuXHQgKiB0aGUgU0RLIGhhcyBiZWVuIHRvbGQuXG5cdCAqL1xuXHRhc3luYyBzZW5kKHByb21wdDogU0RLVXNlck1lc3NhZ2UsIHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcGlwZWxpbmUgPSB0aGlzLl9yZXF1aXJlUGlwZWxpbmUoKTtcblx0XHQvLyBOZXcgdHVybjogcmVzZXQgdGhlIHBlci10dXJuIGNyZWRpdCBhY2N1bXVsYXRvciBzbyBwcm94eSByZXBvcnRzXG5cdFx0Ly8gZm9yIHRoaXMgdHVybidzIGAvdjEvbWVzc2FnZXNgIGNhbGxzIHN1bSBmcm9tIHplcm8uXG5cdFx0dGhpcy5fY3VycmVudFR1cm5OYW5vQWl1ID0gMDtcblx0XHRpZiAodGhpcy50b29sRGlmZi5oYXNEaWZmZXJlbmNlIHx8IHRoaXMuY2xpZW50Q3VzdG9taXphdGlvbnNEaWZmLmhhc0RpZmZlcmVuY2VGcm9tKHRoaXMuX2Rlc2lyZWRDbGllbnRQbHVnaW5QYXRocygpKSB8fCB0aGlzLl9wZW5kaW5nUmVzdW1lU2Vzc2lvbkF0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3JlYmluZEZvclN5bmNlZFN0YXRlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHBpcGVsaW5lLnNldFBlcm1pc3Npb25Nb2RlKHJlc29sdmVDdXJyZW50UGVybWlzc2lvbk1vZGUodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX3N0b3JhZ2VVcmksIHRoaXMuX3Blcm1pc3Npb25Nb2RlRmFsbGJhY2spKTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fcmVjb25jaWxlTWNwU2VydmVyRW5hYmxlbWVudCgpO1xuXHRcdHJldHVybiBwaXBlbGluZS5zZW5kKHByb21wdCwgdHVybklkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaW5nbGUgeWllbGQtcmVzdGFydCB0aGF0IGNvdmVycyBib3RoIGNsaWVudC10b29sIGFuZFxuXHQgKiBjdXN0b21pemF0aW9uIGRpdmVyZ2VuY2UgaW4gb25lIHRyaXAuIERyYWlucyB0aGUgcGFya2VkXG5cdCAqIGNsaWVudC10b29sIE1DUCBoYW5kbGVycyAoc2FtZSBhcyB0aGUgb3JpZ2luYWwgdG9vbC1vbmx5XG5cdCAqIHJlYmluZCksIHRoZW4gdHJpZ2dlcnMgdGhlIHBpcGVsaW5lIHJlYmluZCBcdTIwMTQgdGhlIHJlbWF0ZXJpYWxpemVyXG5cdCAqIHJlYWRzIGB0b29sRGlmZmAgYW5kIHJlZHVjZXItYmFja2VkIGNsaWVudCBwbHVnaW4gcGF0aHMgd2hpbGVcblx0ICogYnVpbGRpbmcgdGhlIG5ldyBgT3B0aW9uc2AsIHNvIHRoZSBiaXQgb24gZWFjaCBkaWZmIGNsZWFycyBpblxuXHQgKiBsb2Nrc3RlcCB3aXRoIHRoZSBTREsgYWN0dWFsbHkgcmVjZWl2aW5nIHRoZSBuZXcgdmFsdWVzLiBGaXJlc1xuXHQgKiBgX29uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2VgIGFmdGVyd2FyZHMgc28gdGhlIHdvcmtiZW5jaFxuXHQgKiByZWZldGNoZXMgYGdldFNlc3Npb25DdXN0b21pemF0aW9uc2AgYW5kIHBpY2tzIHVwIGFueSBuZXdseVxuXHQgKiByZXNvbHZlZCBzZXJ2ZXItc2lkZSBlbnRyaWVzIGZyb20gdGhlIHJlYnVpbHQgYFF1ZXJ5YC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3JlYmluZEZvclN5bmNlZFN0YXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3BlbmRpbmdDbGllbnRUb29sQ2FsbHMucmVqZWN0QWxsKG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHRhd2FpdCB0aGlzLl9yZXF1aXJlUGlwZWxpbmUoKS5yZWJpbmRGb3JSZXN0YXJ0KCk7XG5cdFx0dGhpcy5fb25EaWRDdXN0b21pemF0aW9uc0NoYW5nZS5maXJlKCk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FuY2VsIHRoZSBpbi1mbGlnaHQgU0RLIHR1cm4uIE1pcnJvcnMgdGhlIHByb2R1Y3Rpb24gcmVmZXJlbmNlO1xuXHQgKiBzZWUge0BsaW5rIENsYXVkZVNka1BpcGVsaW5lLmFib3J0fS4gQWxzbyBkZW5pZXMgYW55IHBhcmtlZFxuXHQgKiBwZXJtaXNzaW9uIC8gdXNlci1pbnB1dCByZXF1ZXN0cyBzbyB0aGUgU0RLJ3MgYGNhblVzZVRvb2xgXG5cdCAqIGNhbGxiYWNrIChhbmQgYW55IGludGVyYWN0aXZlIHRvb2wgd2FpdGluZyBvbiB1c2VyIGlucHV0KSB1bndpbmRzXG5cdCAqIHdpdGggYSBkZW55IC8gY2FuY2VsIHJlc3VsdCBpbnN0ZWFkIG9mIGxlYXZpbmcgc3RhbGUgVUkgYmVoaW5kLlxuXHQgKi9cblx0YWJvcnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLmRlbnlBbGwoZmFsc2UpO1xuXHRcdHRoaXMuX3BlbmRpbmdVc2VySW5wdXRzLmRlbnlBbGwoeyByZXNwb25zZTogQ2hhdElucHV0UmVzcG9uc2VLaW5kLkNhbmNlbCB9KTtcblx0XHR0aGlzLl9yZXF1aXJlUGlwZWxpbmUoKS5hYm9ydCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVhZ2VybHkgYXBwbHkgYSBtb2RlbCBjaGFuZ2UgYW5kIHBlcnNpc3QgdGhlIG5ldyBzZWxlY3Rpb24uIFNhZmUgdG9cblx0ICogY2FsbCBiZWZvcmUgb3IgYWZ0ZXIgbWF0ZXJpYWxpemU6XG5cdCAqXG5cdCAqIC0gUHJlLW1hdGVyaWFsaXplOiBzdGFzaCB0aGUgbW9kZWwgb24gdGhlIHNlc3Npb24gc28gdGhlIGZpcnN0IFNES1xuXHQgKiAgIHN0YXJ0dXAgcGlja3MgaXQgdXAgdmlhIGBPcHRpb25zLm1vZGVsYCAvIGBPcHRpb25zLmVmZm9ydGAuXG5cdCAqIC0gUG9zdC1tYXRlcmlhbGl6ZTogcXVldWUgdGhlIGNoYW5nZSBvbiB0aGUgcGlwZWxpbmU7IHRoZSBTREtcblx0ICogICBhcHBsaWVzIGl0IG9uIHRoZSBORVhUIHVzZXIgcmVxdWVzdCB2aWFcblx0ICogICBgUXVlcnkuc2V0TW9kZWxgIC8gYFF1ZXJ5LmFwcGx5RmxhZ1NldHRpbmdzYC4gYCdtYXgnYCBmbG93cyB0aHJvdWdoXG5cdCAqICAgdW5jaGFuZ2VkIFx1MjAxNCBzZWUge0BsaW5rIHRvUnVudGltZUVmZm9ydExldmVsfS5cblx0ICpcblx0ICogSW4gYm90aCBjYXNlcyB0aGUgbmV3IG1vZGVsIGlzIHBlcnNpc3RlZCB0byB0aGUgcGVyLXNlc3Npb25cblx0ICogbWV0YWRhdGEgb3ZlcmxheSBzbyBhIGxhdGVyIHJlc3VtZSBzZWVzIHRoZSB1c2VyJ3MgY2hvaWNlLlxuXHQgKi9cblx0YXN5bmMgc2V0TW9kZWwobW9kZWw6IE1vZGVsU2VsZWN0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fcHJvdmlzaW9uYWxNb2RlbCA9IG1vZGVsO1xuXHRcdGlmICh0aGlzLl9waXBlbGluZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcGlwZWxpbmUuc2V0TW9kZWwodG9TZGtNb2RlbElkKG1vZGVsLmlkKSk7XG5cdFx0XHQvLyBBbHdheXMgcHVzaCB0aGUgcmVzb2x2ZWQgZWZmb3J0LCBpbmNsdWRpbmcgYHVuZGVmaW5lZGAuIFN3aXRjaGluZ1xuXHRcdFx0Ly8gdG8gYSBtb2RlbCB0aGF0IGRvZXMgbm90IHN1cHBvcnQgcmVhc29uaW5nIGVmZm9ydCAoZS5nLiBIYWlrdSlcblx0XHRcdC8vIHJlc29sdmVzIHRvIGB1bmRlZmluZWRgLCB3aGljaCBtdXN0IGFjdGl2ZWx5IENMRUFSIGFueSBlZmZvcnQgdGhlXG5cdFx0XHQvLyBTREsgaXMgc3RpbGwgYXBwbHlpbmcgZnJvbSBhIHByaW9yIGVmZm9ydC1jYXBhYmxlIG1vZGVsIFx1MjAxNCBvdGhlcndpc2Vcblx0XHRcdC8vIHRoZSBuZXh0IHR1cm4gcmVwbGF5cyBlLmcuIGAnaGlnaCdgIG9udG8gSGFpa3UgYW5kIHRoZSBBUEkgNDAwc1xuXHRcdFx0Ly8gKGBvdXRwdXRfY29uZmlnLmVmZm9ydCAuLi4gZG9lcyBub3Qgc3VwcG9ydCByZWFzb25pbmcgZWZmb3J0YCkuXG5cdFx0XHRhd2FpdCB0aGlzLl9waXBlbGluZS5zZXRFZmZvcnQodG9SdW50aW1lRWZmb3J0TGV2ZWwocmVzb2x2ZUNsYXVkZUVmZm9ydChtb2RlbCkpKTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fbWV0YWRhdGFTdG9yZS53cml0ZSh0aGlzLl9zdG9yYWdlVXJpLCB7IG1vZGVsIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFByZS1tYXRlcmlhbGl6ZSBjdXN0b20tYWdlbnQgc2VsZWN0aW9uIGFjY2Vzc29yLlxuXHQgKi9cblx0Z2V0IHByb3Zpc2lvbmFsQWdlbnQoKTogQWdlbnRTZWxlY3Rpb24gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fcHJvdmlzaW9uYWxBZ2VudDsgfVxuXG5cdC8qKlxuXHQgKiBDaGFuZ2UgKG9yIGNsZWFyIHdpdGggYHVuZGVmaW5lZGApIHRoZSBzZWxlY3RlZCBjdXN0b20gYWdlbnQgZm9yIHRoaXNcblx0ICogc2Vzc2lvbi4gVGhlIFNESyBjYXB0dXJlcyBgT3B0aW9ucy5hZ2VudGAgYXQgc3RhcnR1cCB3aXRoIG5vXG5cdCAqIHdvcmtpbmcgcnVudGltZSBjb250cm9sIChgYXBwbHlGbGFnU2V0dGluZ3MoeyBhZ2VudCB9KWAgZXhpc3RzIG9uXG5cdCAqIHRoZSBTREsgc3VyZmFjZSBidXQgZG9lc24ndCBhY3R1YWxseSBzd2FwIHRoZSBsaXZlIGFnZW50KSwgc29cblx0ICogcG9zdC1tYXRlcmlhbGl6ZSBjYWxscyBmbGlwIHtAbGluayBjbGllbnRDdXN0b21pemF0aW9uc0RpZmZ9XG5cdCAqIGRpcnR5IGFuZCB0aGUgbmV4dCBgc2VuZCgpYCBwcmUtZmxpZ2h0IHJlYmluZHMgd2l0aCB0aGUgbmV3IGFnZW50XG5cdCAqIGJha2VkIGludG8gdGhlIHJlYnVpbHQgYFF1ZXJ5YC4gUGVyc2lzdGVkIHRvIHRoZSBwZXItc2Vzc2lvblxuXHQgKiBtZXRhZGF0YSBvdmVybGF5IHNvIGEgcmVzdW1lIHBpY2tzIHVwIHRoZSBjaG9pY2UuXG5cdCAqL1xuXHRhc3luYyBzZXRBZ2VudChhZ2VudDogQWdlbnRTZWxlY3Rpb24gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fcHJvdmlzaW9uYWxBZ2VudCA9PT0gYWdlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcHJvdmlzaW9uYWxBZ2VudCA9IGFnZW50O1xuXHRcdGlmICh0aGlzLl9waXBlbGluZSkge1xuXHRcdFx0Ly8gRm9yY2UgYSByZWJpbmQgb24gdGhlIG5leHQgc2VuZCgpOyB0aGUgU0RLIGhhcyBubyB3b3JraW5nXG5cdFx0XHQvLyBydW50aW1lIGhvb2sgdG8gc3dhcCB0aGUgYWdlbnQgaW4gcGxhY2UuXG5cdFx0XHR0aGlzLmNsaWVudEN1c3RvbWl6YXRpb25zRGlmZi5tYXJrRGlydHkoKTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fbWV0YWRhdGFTdG9yZS53cml0ZSh0aGlzLl9zdG9yYWdlVXJpLCB7IGFnZW50OiBhZ2VudCA/PyBudWxsIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEluamVjdCBhIHN0ZWVyaW5nIG1lc3NhZ2UuIEJ1aWxkcyB0aGUgYHByaW9yaXR5OiAnbm93J2Bcblx0ICoge0BsaW5rIFNES1VzZXJNZXNzYWdlfSBhbmQgaGFuZHMgaXQgdG8gdGhlIHBpcGVsaW5lOyB0aGUgcGlwZWxpbmVcblx0ICogaW5oZXJpdHMgdGhlIHBhcmVudCdzIHR1cm5JZCAoQ09OVEVYVC5tZCBNMTApIGFuZCBmaXJlc1xuXHQgKiBgc3RlZXJpbmdfY29uc3VtZWRgIHdoZW4gdGhlIFNESyBhY2NlcHRzIGl0LiBOby1vcCBpZiB0aGUgcGlwZWxpbmVcblx0ICogaXMgYWJvcnRlZC5cblx0ICovXG5cdGluamVjdFN0ZWVyaW5nKHN0ZWVyaW5nTWVzc2FnZTogUGVuZGluZ01lc3NhZ2UpOiB2b2lkIHtcblx0XHRjb25zdCBwaXBlbGluZSA9IHRoaXMuX3JlcXVpcmVQaXBlbGluZSgpO1xuXHRcdGlmIChwaXBlbGluZS5pc0Fib3J0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29udGVudEJsb2NrcyA9IHJlc29sdmVQcm9tcHRUb0NvbnRlbnRCbG9ja3MoXG5cdFx0XHRzdGVlcmluZ01lc3NhZ2UubWVzc2FnZS50ZXh0LFxuXHRcdFx0c3RlZXJpbmdNZXNzYWdlLm1lc3NhZ2UuYXR0YWNobWVudHMsXG5cdFx0KTtcblx0XHRjb25zdCBzZGtNZXNzYWdlOiBTREtVc2VyTWVzc2FnZSA9IHtcblx0XHRcdHR5cGU6ICd1c2VyJyxcblx0XHRcdG1lc3NhZ2U6IHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiBjb250ZW50QmxvY2tzIH0sXG5cdFx0XHRzZXNzaW9uX2lkOiB0aGlzLnNlc3Npb25JZCxcblx0XHRcdHBhcmVudF90b29sX3VzZV9pZDogbnVsbCxcblx0XHRcdHByaW9yaXR5OiAnbm93Jyxcblx0XHRcdC8vIFJldXNlIHRoZSBwcm90b2NvbCBQZW5kaW5nTWVzc2FnZS5pZCBhcyB0aGUgU0RLIHV1aWQgXHUyMDE0IHNhbWVcblx0XHRcdC8vIHBhdHRlcm4gYXMgYENsYXVkZUFnZW50LnNlbmRNZXNzYWdlYCByZXVzaW5nIHR1cm5JZC4gVGhlIFNESydzXG5cdFx0XHQvLyBgdXVpZGAgZmllbGQgaXMgdHlwZWQgYXMgYSBicmFuZGVkIFVVSUQsIGJ1dCB0aGUgY2FzdCBhdCB0aGVcblx0XHRcdC8vIGJvdW5kYXJ5IGlzIHRoZSBjb252ZW50aW9uIGZvciBib3RoIGNvZGUgcGF0aHMuXG5cdFx0XHR1dWlkOiBzdGVlcmluZ01lc3NhZ2UuaWQgYXMgYCR7c3RyaW5nfS0ke3N0cmluZ30tJHtzdHJpbmd9LSR7c3RyaW5nfS0ke3N0cmluZ31gLFxuXHRcdH07XG5cdFx0cGlwZWxpbmUuaW5qZWN0U3RlZXJpbmcoc2RrTWVzc2FnZSwgc3RlZXJpbmdNZXNzYWdlLmlkKTtcblx0fVxuXG5cdC8qKiBMaXZlIHBlcm1pc3Npb24tbW9kZSBjaGFuZ2UuIEZvcndhcmRzIHRvIHRoZSBwaXBlbGluZTsgdGhlIHBpcGVsaW5lIHJlbWVtYmVycyBpdCBmb3IgcmUtYXBwbGljYXRpb24gYWZ0ZXIgYSByZWJpbmQuICovXG5cdHNldFBlcm1pc3Npb25Nb2RlKG1vZGU6IFBlcm1pc3Npb25Nb2RlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVpcmVQaXBlbGluZSgpLnNldFBlcm1pc3Npb25Nb2RlKG1vZGUpO1xuXHR9XG5cblx0Ly8gI3JlZ2lvbiBQaGFzZSA3IC8gUzMuMiBcdTIwMTQgcGVuZGluZyBzdGF0ZVxuXG5cdC8qKlxuXHQgKiBBdG9taWNhbGx5IHJlZ2lzdGVyIGEgcGVuZGluZy1wZXJtaXNzaW9uIGRlZmVycmVkIGFuZCBmaXJlIHRoZVxuXHQgKiBgcGVuZGluZ19jb25maXJtYXRpb25gIHNpZ25hbC4gVGhlIFNESyBpcyBibG9ja2VkIG9uIHRoZSByZXR1cm5lZFxuXHQgKiBwcm9taXNlIGluc2lkZSBpdHMgYGNhblVzZVRvb2xgIGNhbGxiYWNrIHVudGlsXG5cdCAqIHtAbGluayByZXNwb25kVG9QZXJtaXNzaW9uUmVxdWVzdH0gcmVzb2x2ZXMgaXQuIFJlc29sdmVzIHdpdGhcblx0ICogYGZhbHNlYCBpZiB0aGUgcGlwZWxpbmUgaXMgYWJvcnRlZC5cblx0ICovXG5cdHJlcXVlc3RQZXJtaXNzaW9uKGFyZ3M6IHtcblx0XHRyZWFkb25seSB0b29sVXNlSUQ6IHN0cmluZztcblx0XHRyZWFkb25seSBzdGF0ZTogVG9vbENhbGxQZW5kaW5nQ29uZmlybWF0aW9uU3RhdGU7XG5cdFx0cmVhZG9ubHkgcGVybWlzc2lvbktpbmQ6IENsYXVkZVBlcm1pc3Npb25LaW5kO1xuXHRcdHJlYWRvbmx5IHBlcm1pc3Npb25QYXRoPzogc3RyaW5nO1xuXHRcdC8qKiBQaGFzZSAxMiBzdGVwIDUgXHUyMDE0IHdoZW4gdGhlIGNvbmZpcm1hdGlvbiBiZWxvbmdzIHRvIGEgc3ViYWdlbnQgY29udGV4dCwgcm91dGUgaXQgdG8gdGhlIHN1YmFnZW50IHNlc3Npb24uICovXG5cdFx0cmVhZG9ubHkgcGFyZW50VG9vbENhbGxJZD86IHN0cmluZztcblx0fSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghdGhpcy5fcGlwZWxpbmUgfHwgdGhpcy5fcGlwZWxpbmUuaXNBYm9ydGVkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3BlbmRpbmdQZXJtaXNzaW9ucy5yZWdpc3RlckFuZEZpcmUoYXJncy50b29sVXNlSUQsICgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUoe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLFxuXHRcdFx0XHRjaGF0OiB0aGlzLl9jaGF0Q2hhbm5lbFVyaSxcblx0XHRcdFx0c3RhdGU6IGFyZ3Muc3RhdGUsXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiBhcmdzLnBlcm1pc3Npb25LaW5kLFxuXHRcdFx0XHQuLi4oYXJncy5wZXJtaXNzaW9uUGF0aCAhPT0gdW5kZWZpbmVkID8geyBwZXJtaXNzaW9uUGF0aDogYXJncy5wZXJtaXNzaW9uUGF0aCB9IDoge30pLFxuXHRcdFx0XHQuLi4oYXJncy5wYXJlbnRUb29sQ2FsbElkICE9PSB1bmRlZmluZWQgPyB7IHBhcmVudFRvb2xDYWxsSWQ6IGFyZ3MucGFyZW50VG9vbENhbGxJZCB9IDoge30pLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRyZXNwb25kVG9QZXJtaXNzaW9uUmVxdWVzdChyZXF1ZXN0SWQ6IHN0cmluZywgYXBwcm92ZWQ6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLnJlc3BvbmQocmVxdWVzdElkLCBhcHByb3ZlZCk7XG5cdH1cblxuXHQvKipcblx0ICogRmlyZSBhIHtAbGluayBBY3Rpb25UeXBlLkNoYXRJbnB1dFJlcXVlc3RlZH0gYWN0aW9uIGFuZCBwYXJrIG9uXG5cdCAqIGEgZGVmZXJyZWQgdW50aWwge0BsaW5rIHJlc3BvbmRUb1VzZXJJbnB1dFJlcXVlc3R9IHJlc29sdmVzIGl0LlxuXHQgKiBSZXNvbHZlcyB3aXRoIGB7IHJlc3BvbnNlOiBDYW5jZWwgfWAgaWYgdGhlIHBpcGVsaW5lIGlzIGFib3J0ZWQuXG5cdCAqL1xuXHRyZXF1ZXN0VXNlcklucHV0KHJlcXVlc3Q6IENoYXRJbnB1dFJlcXVlc3QsIHBhcmVudFRvb2xDYWxsSWQ/OiBzdHJpbmcpOiBQcm9taXNlPHsgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZDsgYW5zd2Vycz86IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4gfT4ge1xuXHRcdGlmICghdGhpcy5fcGlwZWxpbmUgfHwgdGhpcy5fcGlwZWxpbmUuaXNBYm9ydGVkIHx8ICF0aGlzLl9waXBlbGluZS5oYXNBY3RpdmVUdXJuKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZC5DYW5jZWwgfSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wZW5kaW5nVXNlcklucHV0cy5yZWdpc3RlckFuZEZpcmUocmVxdWVzdC5pZCwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZmlyZSh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0XHRyZXNvdXJjZTogdGhpcy5fY2hhdENoYW5uZWxVcmksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0UmVxdWVzdGVkLFxuXHRcdFx0XHRcdHJlcXVlc3QsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdC4uLihwYXJlbnRUb29sQ2FsbElkICE9PSB1bmRlZmluZWQgPyB7IHBhcmVudFRvb2xDYWxsSWQgfSA6IHt9KSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cmVzcG9uZFRvVXNlcklucHV0UmVxdWVzdChcblx0XHRyZXF1ZXN0SWQ6IHN0cmluZyxcblx0XHRyZXNwb25zZTogQ2hhdElucHV0UmVzcG9uc2VLaW5kLFxuXHRcdGFuc3dlcnM/OiBSZWNvcmQ8c3RyaW5nLCBDaGF0SW5wdXRBbnN3ZXI+LFxuXHQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcGVuZGluZ1VzZXJJbnB1dHMucmVzcG9uZChyZXF1ZXN0SWQsIHsgcmVzcG9uc2UsIGFuc3dlcnMgfSk7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBQaGFzZSAxMCBcdTIwMTQgY2xpZW50IHRvb2xzXG5cblx0LyoqIFJlcGxhY2UgYSBjbGllbnQncyByZWdpc3RlcmVkIHRvb2xzIChmdWxsIHJlcGxhY2VtZW50KS4gKi9cblx0c2V0Q2xpZW50VG9vbHMoY2xpZW50SWQ6IHN0cmluZywgdG9vbHM6IHJlYWRvbmx5IFRvb2xEZWZpbml0aW9uW10pOiB2b2lkIHtcblx0XHR0aGlzLnRvb2xEaWZmLm1vZGVsLnNldFRvb2xzKGNsaWVudElkLCB0b29scyk7XG5cdH1cblxuXHQvKiogVGhpcyBjbGllbnQncyByZWdpc3RlcmVkIHRvb2xzIChlbXB0eSB3aGVuIGFic2VudCkuICovXG5cdGdldENsaWVudFRvb2xzKGNsaWVudElkOiBzdHJpbmcpOiByZWFkb25seSBUb29sRGVmaW5pdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy50b29sRGlmZi5tb2RlbC5nZXRUb29scyhjbGllbnRJZCk7XG5cdH1cblxuXHQvKiogUmVtb3ZlIGEgY2xpZW50J3MgdG9vbCBjb250cmlidXRpb24gZnJvbSB0aGlzIHNlc3Npb24uICovXG5cdHJlbW92ZUNsaWVudFRvb2xzKGNsaWVudElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnRvb2xEaWZmLm1vZGVsLnJlbW92ZUNsaWVudChjbGllbnRJZCk7XG5cdH1cblxuXHQvKiogUmVtb3ZlIGEgY2xpZW50J3MgY3VzdG9taXphdGlvbiBjb250cmlidXRpb24gZnJvbSB0aGlzIHNlc3Npb24uICovXG5cdHJlbW92ZUNsaWVudEN1c3RvbWl6YXRpb25zKGNsaWVudElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmNsaWVudEN1c3RvbWl6YXRpb25zRGlmZi5tb2RlbC5yZW1vdmVDbGllbnQoY2xpZW50SWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgYSBwYXJrZWQgY2xpZW50LXRvb2wgTUNQIGhhbmRsZXIgd2l0aCB0aGUgd29ya2JlbmNoLXN1cHBsaWVkXG5cdCAqIHJlc3VsdC4gUmV0dXJucyBgdHJ1ZWAgaWYgYSBtYXRjaGluZyBkZWZlcnJlZCB3YXMgZm91bmQgYW5kIHNldHRsZWQuXG5cdCAqIFVua25vd24gaWRzIGFyZSBhIGJlbmlnbiBuby1vcCBcdTIwMTQgYGFnZW50U2lkZUVmZmVjdHMudHNgIGZvcndhcmRzIGV2ZXJ5XG5cdCAqIGBDaGF0VG9vbENhbGxDb21wbGV0ZWAgZW52ZWxvcGUsIHNvIFNESy1vd25lZCB0b29sIGNvbXBsZXRpb25zIGxhbmRcblx0ICogaGVyZSB0b28gYW5kIG11c3QgTk9UIHRocm93LlxuXHQgKi9cblx0Y29tcGxldGVDbGllbnRUb29sQ2FsbCh0b29sQ2FsbElkOiBzdHJpbmcsIHJlc3VsdDogVG9vbENhbGxSZXN1bHQpOiBib29sZWFuIHtcblx0XHRjb25zdCBjb252ZXJ0ZWQgPSBjb252ZXJ0VG9vbENhbGxSZXN1bHQocmVzdWx0LCB0b29sQ2FsbElkKTtcblx0XHRyZXR1cm4gdGhpcy5fcGVuZGluZ0NsaWVudFRvb2xDYWxscy5yZXNwb25kKHRvb2xDYWxsSWQsIGNvbnZlcnRlZCk7XG5cdH1cblxuXHQvKipcblx0ICogRHJpdmUgYSB5aWVsZC1yZXN0YXJ0IHNvIHRoZSBTREsgcGlja3MgdXAgdGhlIG5ldyBjbGllbnQtdG9vbCBzZXRcblx0ICogb24gaXRzIG5leHQgdXNlciByZXF1ZXN0LiBQdWJsaWMgZW50cnkgcG9pbnQgZm9yIGNhbGxlcnMgdGhhdCBuZWVkXG5cdCAqIHRvIGZvcmNlIGEgdG9vbC1vbmx5IHJlYmluZDsgaW50ZXJuYWwgcHJlLWZsaWdodCBnb2VzIHRocm91Z2hcblx0ICoge0BsaW5rIF9yZWJpbmRGb3JTeW5jZWRTdGF0ZX0uXG5cdCAqL1xuXHRhc3luYyByZWJpbmRGb3JDbGllbnRUb29scygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9yZWJpbmRGb3JTeW5jZWRTdGF0ZSgpO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gUGhhc2UgMTEgXHUyMDE0IGN1c3RvbWl6YXRpb25zIC8gcGx1Z2luc1xuXG5cdC8qKlxuXHQgKiBNZXJnZWQgZmlyZS1hbmQtZm9yZ2V0IHNpZ25hbCB0aGF0IHRoaXMgc2Vzc2lvbidzIGN1c3RvbWl6YXRpb25cblx0ICogc3VyZmFjZSBjaGFuZ2VkLiBGaXJlcyBmcm9tIHRocmVlIHNvdXJjZXM6XG5cdCAqXG5cdCAqIDEuIENsaWVudC1zaWRlIHdyaXRlcyAoYGFkb3B0Q2xpZW50Q3VzdG9taXphdGlvbnNgKSBcdTIwMTQgdmlhIHRoZVxuXHQgKiAgICB7QGxpbmsgU2Vzc2lvbkNsaWVudEN1c3RvbWl6YXRpb25zRGlmZn0gb2JzZXJ2YWJsZSB3aXJlZCB1cCBpbiB0aGVcblx0ICogICAgY29uc3RydWN0b3IuXG5cdCAqIDIuIE1hdGVyaWFsaXplIGNvbXBsZXRlcyBcdTIwMTQgc3VyZmFjZXMgdGhlIHNlcnZlci1zaWRlXG5cdCAqICAgIChTREstZGlzY292ZXJlZCkgdGllciB0byB0aGUgd29ya2JlbmNoIGZvciB0aGUgZmlyc3QgdGltZS5cblx0ICogMy4gVGhlIHNlbmQoKSBwcmUtZmxpZ2h0IHJlYmluZCBjb21wbGV0ZXMgXHUyMDE0IHRoZSByZWJ1aWx0IFNESydzXG5cdCAqICAgIHJlc29sdmVkIHNldCBtYXkgaGF2ZSBjaGFuZ2VkLlxuXHQgKlxuXHQgKiBEcml2ZXMgYSB3b3JrYmVuY2ggcmVmZXRjaCBvZiB7QGxpbmsgZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zfS5cblx0ICogRG9lcyBOT1QgaXRzZWxmIHRyaWdnZXIgYW55IFNESyBhY3Rpb24gXHUyMDE0IHRoZSBkaXJ0eSBiaXQgb25cblx0ICoge0BsaW5rIFNlc3Npb25DbGllbnRDdXN0b21pemF0aW9uc0RpZmZ9IGRyaXZlcyBwbHVnaW4gcmViaW5kcyxcblx0ICogYW5kIG9ubHkgZmxpcHMgb24gY2xpZW50LXNpZGUgd3JpdGVzLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDdXN0b21pemF0aW9uc0NoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIEFkb3B0IHRoZSByZXN1bHQgb2YgYSBnbG9iYWwge0BsaW5rIElBZ2VudFBsdWdpbk1hbmFnZXIuc3luY0N1c3RvbWl6YXRpb25zfVxuXHQgKiBwYXNzICgqKmNsaWVudC1wdXNoZWQqKiBwYXRoKS4gVGhlIGFnZW50IG93bnMgdGhlIG1hbmFnZXIgKGl0J3Ncblx0ICogYSBwcm9jZXNzLXdpZGUgc2luZ2xldG9uIHdpdGggYSBzaGFyZWQgb24tZGlzayBjYWNoZSkgYW5kIHB1c2hlc1xuXHQgKiB0aGUgcmVzdWx0aW5nIHNuYXBzaG90IGRvd24gaGVyZS4gRmxpcHMgdGhlIGNsaWVudC1zaWRlIGRpcnR5IGJpdFxuXHQgKiBzbyB0aGUgbmV4dCB7QGxpbmsgc2VuZH0gcHJlLWZsaWdodCByZWxvYWRzIFNESyBwbHVnaW5zLlxuXHQgKi9cblx0YWRvcHRDbGllbnRDdXN0b21pemF0aW9ucyhjbGllbnRJZDogc3RyaW5nLCBzeW5jZWQ6IHJlYWRvbmx5IElTeW5jZWRDdXN0b21pemF0aW9uW10pOiB2b2lkIHtcblx0XHR0aGlzLmNsaWVudEN1c3RvbWl6YXRpb25zRGlmZi5tb2RlbC5zZXRTeW5jZWRDdXN0b21pemF0aW9ucyhjbGllbnRJZCwgc3luY2VkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTbmFwc2hvdCBvZiB0aGUgKipjbGllbnQtcHVzaGVkKiogY3VzdG9taXphdGlvbnMgb24gdGhpcyBzZXNzaW9uLlxuXHQgKiBEb2VzIE5PVCBpbmNsdWRlIHNlcnZlci1zaWRlIChTREstZGlzY292ZXJlZCkgZW50cmllcyBcdTIwMTQgdXNlXG5cdCAqIHtAbGluayBnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnN9IGZvciB0aGUgbWVyZ2VkIHZpZXcuXG5cdCAqL1xuXHRnZXRDbGllbnRDdXN0b21pemF0aW9ucygpOiByZWFkb25seSBJU3luY2VkQ3VzdG9taXphdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5jbGllbnRDdXN0b21pemF0aW9uc0RpZmYubW9kZWwuc3RhdGUuZ2V0KCkuc3luY2VkO1xuXHR9XG5cblx0LyoqIFNuYXBzaG90IG9mIHRoZSBsYXN0IHtAbGluayBnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnN9IHJlc3VsdCwgcmVhZCBieSB7QGxpbmsgX2VucmljaFNpZ25hbFdpdGhNY3BDb250cmlidXRvcn0uICovXG5cdHByaXZhdGUgX2xhc3RDdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdID0gW107XG5cblx0LyoqXG5cdCAqIFByb2plY3QgdGhlIHVuaW9uIG9mIChhKSAqKmNsaWVudC1wdXNoZWQqKiBjdXN0b21pemF0aW9ucyBhbmRcblx0ICogKGIpIHRoZSAqKnNlcnZlci1zaWRlKiogKFNESy1kaXNjb3ZlcmVkKSB2aWV3IChjb21tYW5kcyAvIGFnZW50c1xuXHQgKiAvIE1DUCBzZXJ2ZXJzLCBpbmNsdWRpbmcgdGhvc2UgdGhlIFNESyBkaXNjb3ZlcmVkIG9uIGl0cyBvd25cblx0ICogZnJvbSBgfi8uY2xhdWRlLyoqYCkgb250byB0aGUgcHJvdG9jb2wnc1xuXHQgKiB7QGxpbmsgQ3VzdG9taXphdGlvbn0gc3VyZmFjZSwgd2l0aCByZWR1Y2VyLWJhY2tlZCBlbmFibGVtZW50XG5cdCAqIGFwcGxpZWQgdG8gY2xpZW50LXB1c2hlZCBlbnRyaWVzLlxuXHQgKlxuXHQgKiBQcmUtbWF0ZXJpYWxpemUgc2Vzc2lvbnMgcmV0dXJuIG9ubHkgdGhlIGNsaWVudC1wdXNoZWQgcHJvamVjdGlvblxuXHQgKiBcdTIwMTQgdGhlIFNESyBzaWRlIGhhcyBubyBRdWVyeSB0byBxdWVyeSB5ZXQuIEEgZmFpbHVyZSB0byByZWFkIHRoZVxuXHQgKiBTREsgc25hcHNob3QgaXMgd2Fybi1sb2dnZWQgYW5kIHRoZSBjbGllbnQtcHVzaGVkIHByb2plY3Rpb24gaXNcblx0ICogc3RpbGwgcmV0dXJuZWQsIHNvIGEgdHJhbnNpZW50IFNESyBoaWNjdXAgZG9lc24ndCBibGFuayB0aGUgVUkuXG5cdCAqL1xuXHRhc3luYyBnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoKTogUHJvbWlzZTxyZWFkb25seSBDdXN0b21pemF0aW9uW10+IHtcblx0XHRjb25zdCB7IHN5bmNlZCB9ID0gdGhpcy5jbGllbnRDdXN0b21pemF0aW9uc0RpZmYubW9kZWwuc3RhdGUuZ2V0KCk7XG5cdFx0Y29uc3QgdXNlckhvbWUgPSB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UudXNlckhvbWU7XG5cdFx0Y29uc3QgW211bHRpUm9vdCwgcnVsZXMsIG1jcFNlcnZlcnMsIGhvb2tzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGRpc2NvdmVyQ2xhdWRlTXVsdGlSb290Q3VzdG9taXphdGlvbnModGhpcy53b3JraW5nRGlyZWN0b3JpZXMsIHVzZXJIb21lLCB0aGlzLl9maWxlU2VydmljZSwgdGhpcy5fbG9nU2VydmljZSksXG5cdFx0XHRzY2FuQ2xhdWRlUnVsZXModGhpcy53b3JraW5nRGlyZWN0b3J5LCB1c2VySG9tZSwgdGhpcy5fZmlsZVNlcnZpY2UpLFxuXHRcdFx0c2NhbkNsYXVkZU1jcFNlcnZlcnModGhpcy53b3JraW5nRGlyZWN0b3J5LCB1c2VySG9tZSwgdGhpcy5fZmlsZVNlcnZpY2UpLFxuXHRcdFx0c2NhbkNsYXVkZUhvb2tzKHRoaXMud29ya2luZ0RpcmVjdG9yeSwgdXNlckhvbWUsIHRoaXMuX2ZpbGVTZXJ2aWNlKSxcblx0XHRdKTtcblxuXHRcdC8vIFBvc3QtbWF0ZXJpYWxpemUsIHRoZSBsaXZlIFNESyBzbmFwc2hvdCBmaWx0ZXJzIHRoZSBkaXNrIHNldCBkb3duIHRvXG5cdFx0Ly8gd2hhdCB0aGUgc2Vzc2lvbiBhY3R1YWxseSBsb2FkZWQgKGFuZCBzdXJmYWNlcyBTREstb25seSBpdGVtcyBhc1xuXHRcdC8vIG5vbi1lZGl0YWJsZSkuIFByZS1tYXRlcmlhbGl6ZSB0aGVyZSBpcyBubyBRdWVyeSwgc28gdGhlIGZ1bGwgZGlza1xuXHRcdC8vIHNldCBpcyBzaG93bi4gQSB0cmFuc2llbnQgU0RLIHJlYWQgZmFpbHVyZSBsZWF2ZXMgYHNka2AgdW5kZWZpbmVkLFxuXHRcdC8vIGZhbGxpbmcgYmFjayB0byB0aGUgdW5maWx0ZXJlZCBkaXNrIHNldCByYXRoZXIgdGhhbiBibGFua2luZyB0aGUgVUkuXG5cdFx0bGV0IHNkazogSVNka1Jlc29sdmVkQ3VzdG9taXphdGlvbnMgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuX3BpcGVsaW5lKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzZGsgPSBhd2FpdCB0aGlzLl9waXBlbGluZS5zbmFwc2hvdFJlc29sdmVkQ3VzdG9taXphdGlvbnMoKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGU6JHt0aGlzLnNlc3Npb25JZH1dIHNuYXBzaG90UmVzb2x2ZWRDdXN0b21pemF0aW9ucyBmYWlsZWRgLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGBidWlsZERpc2NvdmVyZWRDdXN0b21pemF0aW9uc2AgYWxzbyBmb2xkcyBpbiB0aGUgcmVhZC1vbmx5IFwiQnVpbHQtaW5cIlxuXHRcdC8vIHN1cmZhY2luZyAoY3VyYXRlZCBwcmUtbWF0ZXJpYWxpemUsIFNESy1kZXJpdmVkIHBvc3QtbWF0ZXJpYWxpemUpIGZvclxuXHRcdC8vIGJvdGggYWdlbnRzIGFuZCBza2lsbHMsIHNvIHRoZSBTREstdnMtY3VyYXRlZCBkZWNpc2lvbiBsaXZlcyBpbiBvbmUgcGxhY2UuXG5cdFx0Y29uc3QgZGlzY292ZXJlZEN1c3RvbWl6YXRpb25zID0gYnVpbGREaXNjb3ZlcmVkQ3VzdG9taXphdGlvbnMoWy4uLm11bHRpUm9vdC5kaXNjb3ZlcmVkLCAuLi5ydWxlc10sIG1jcFNlcnZlcnMsIGhvb2tzLCBtdWx0aVJvb3QubmF0aXZlUGx1Z2lucywgbXVsdGlSb290LndvcmtpbmdEaXJlY3RvcmllcywgdXNlckhvbWUsIHNkayk7XG5cblx0XHQvLyBGaW5hbCBwcm9qZWN0aW9uOiB0aGUgY2xpZW50LXB1c2hlZCB0aWVyIGZpcnN0LCB0aGVuIHRoZSBkaXNjb3ZlcmVkXG5cdFx0Ly8gdGllciwgd2l0aCBzZXNzaW9uIE1DUCBlbmFibGVtZW50IGFwcGxpZWQgdG8gYm90aC5cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3Nlc3Npb25DdXN0b21pemF0aW9ucztcblx0XHRjb25zdCBkZXNpcmVkQnlJZCA9IG5ldyBNYXAoc3RhdGUubWFwKGN1c3RvbWl6YXRpb24gPT4gW2N1c3RvbWl6YXRpb24uaWQsIGN1c3RvbWl6YXRpb24uZW5hYmxlZF0pKTtcblx0XHRjb25zdCByZXN1bHQ6IEN1c3RvbWl6YXRpb25bXSA9IHN5bmNlZC5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0Li4uaXRlbS5jdXN0b21pemF0aW9uLFxuXHRcdFx0ZW5hYmxlZDogZGVzaXJlZEJ5SWQuZ2V0KGl0ZW0uY3VzdG9taXphdGlvbi5pZCkgPz8gaXRlbS5jdXN0b21pemF0aW9uLmVuYWJsZWQsXG5cdFx0fSkpO1xuXHRcdHJlc3VsdC5wdXNoKC4uLmRpc2NvdmVyZWRDdXN0b21pemF0aW9ucyk7XG5cdFx0Ly8gQ2FjaGUgZm9yIHRoZSBNQ1AtY29udHJpYnV0b3Igc2lnbmFsIGVucmljaG1lbnQgKHNlZVxuXHRcdC8vIHtAbGluayBfZW5yaWNoU2lnbmFsV2l0aE1jcENvbnRyaWJ1dG9yfSkuXG5cdFx0Y29uc3QgcHJvamVjdGVkID0gYXBwbHlNY3BTZXJ2ZXJFbmFibGVtZW50KHJlc3VsdCwgc3RhdGUpO1xuXHRcdHRoaXMuX2xhc3RDdXN0b21pemF0aW9ucyA9IHByb2plY3RlZDtcblx0XHRyZXR1cm4gcHJvamVjdGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVjb25jaWxlTWNwU2VydmVyRW5hYmxlbWVudCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwaXBlbGluZSA9IHRoaXMuX3JlcXVpcmVQaXBlbGluZSgpO1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc2Vzc2lvbkN1c3RvbWl6YXRpb25zO1xuXHRcdGNvbnN0IGRlc2lyZWQgPSBuZXcgTWFwKGdldEVmZmVjdGl2ZU1jcFNlcnZlckN1c3RvbWl6YXRpb25zKHN0YXRlKS5tYXAoc2VydmVyID0+IFtzZXJ2ZXIubmFtZSwgc2VydmVyLmVuYWJsZWRdKSk7XG5cdFx0aWYgKGRlc2lyZWQuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghYXdhaXQgcGlwZWxpbmUucmVjb25jaWxlTWNwU2VydmVyRW5hYmxlbWVudChkZXNpcmVkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDbGF1ZGUgU0RLIGNhbm5vdCByZWNvbmNpbGUgTUNQIHNlcnZlciBlbmFibGVtZW50YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGVzaXJlZENsaWVudFBsdWdpblBhdGhzKCk6IHJlYWRvbmx5IFVSSVtdIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3Nlc3Npb25DdXN0b21pemF0aW9ucztcblx0XHRjb25zdCBkZXNpcmVkQnlJZCA9IG5ldyBNYXAoc3RhdGUubWFwKGN1c3RvbWl6YXRpb24gPT4gW2N1c3RvbWl6YXRpb24uaWQsIGN1c3RvbWl6YXRpb24uZW5hYmxlZF0pKTtcblx0XHRjb25zdCBwYXRoczogVVJJW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHN5bmNlZCBvZiB0aGlzLmNsaWVudEN1c3RvbWl6YXRpb25zRGlmZi5tb2RlbC5zdGF0ZS5nZXQoKS5zeW5jZWQpIHtcblx0XHRcdGlmIChzeW5jZWQucGx1Z2luRGlyICYmIChkZXNpcmVkQnlJZC5nZXQoc3luY2VkLmN1c3RvbWl6YXRpb24uaWQpID8/IHN5bmNlZC5jdXN0b21pemF0aW9uLmVuYWJsZWQpICE9PSBmYWxzZSkge1xuXHRcdFx0XHRwYXRocy5wdXNoKHN5bmNlZC5wbHVnaW5EaXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcGF0aHM7XG5cdH1cblxuXHRhc3luYyBzdGFydE1jcFNlcnZlcihpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VydmVyTmFtZSA9IGF3YWl0IHRoaXMuX3Jlc29sdmVNY3BTZXJ2ZXJOYW1lKGlkKTtcblx0XHRpZiAoIXNlcnZlck5hbWUpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZToke3RoaXMuc2Vzc2lvbklkfV0gQ2Fubm90IHN0YXJ0IHVua25vd24gTUNQIHNlcnZlciBjdXN0b21pemF0aW9uICR7aWR9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGhhbmRsZWQgPSBhd2FpdCB0aGlzLl9yZXF1aXJlUGlwZWxpbmUoKS5zdGFydE1jcFNlcnZlcihzZXJ2ZXJOYW1lKTtcblx0XHRpZiAoIWhhbmRsZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3JlYmluZEZvclN5bmNlZFN0YXRlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UuZmlyZSgpO1xuXHR9XG5cblx0YXN5bmMgc3RvcE1jcFNlcnZlcihpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VydmVyTmFtZSA9IGF3YWl0IHRoaXMuX3Jlc29sdmVNY3BTZXJ2ZXJOYW1lKGlkKTtcblx0XHRpZiAoIXNlcnZlck5hbWUpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZToke3RoaXMuc2Vzc2lvbklkfV0gQ2Fubm90IHN0b3AgdW5rbm93biBNQ1Agc2VydmVyIGN1c3RvbWl6YXRpb24gJHtpZH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaGFuZGxlZCA9IGF3YWl0IHRoaXMuX3JlcXVpcmVQaXBlbGluZSgpLnN0b3BNY3BTZXJ2ZXIoc2VydmVyTmFtZSk7XG5cdFx0aWYgKCFoYW5kbGVkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGU6JHt0aGlzLnNlc3Npb25JZH1dIE1DUCBzZXJ2ZXIgc3RvcCBpcyBub3Qgc3VwcG9ydGVkIGJ5IHRoZSBjdXJyZW50IFNES2ApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVNY3BTZXJ2ZXJOYW1lKGlkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiBmaW5kTWNwU2VydmVyTmFtZSh0aGlzLl9sYXN0Q3VzdG9taXphdGlvbnMsIGlkKSA/PyBmaW5kTWNwU2VydmVyTmFtZShhd2FpdCB0aGlzLmdldFNlc3Npb25DdXN0b21pemF0aW9ucygpLCBpZCk7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyBSZXNvbHZlIHBhcmtlZCBkZWZlcnJlZHMgYmVmb3JlIHRlYXJpbmcgdGhlIHBpcGVsaW5lIGRvd24gc28gdGhlXG5cdFx0Ly8gU0RLJ3MgY2FuVXNlVG9vbCBjYWxsYmFjayB1bndpbmRzIHdpdGggYSBkZW55IGFuZCB0aGUgbG9vcCBleGl0cy5cblx0XHR0aGlzLl9wZW5kaW5nUGVybWlzc2lvbnMuZGVueUFsbChmYWxzZSk7XG5cdFx0dGhpcy5fcGVuZGluZ1VzZXJJbnB1dHMuZGVueUFsbCh7IHJlc3BvbnNlOiBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQ2FuY2VsIH0pO1xuXHRcdHRoaXMuX3BlbmRpbmdDbGllbnRUb29sQ2FsbHMucmVqZWN0QWxsKG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBT0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFzQjtBQUMvQixTQUFT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
