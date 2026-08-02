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
import { coalesce } from "../../../../base/common/arrays.js";
import { Schemas } from "../../../../base/common/network.js";
import { IFileService } from "../../../files/common/files.js";
import { ILogService, LogLevel } from "../../../log/common/log.js";
import { CopilotCliConfigKey, applyModelFamilyAlias, copilotCliConfigSchema, normalizeToolSearchDeferThreshold } from "../../common/copilotCliConfig.js";
import { agentHostModelSupportsToolSearch, CLIENT_TOOL_SEARCH_REFERENCE_NAME } from "./toolSearchDeferral.js";
import { AgentHostSessionSyncEnabledConfigKey, platformRootSchema } from "../../common/agentHostSchema.js";
import { AgentHostSandboxConfigKey, sandboxConfigSchema } from "../../common/sandboxConfigSchema.js";
import { IAgentConfigurationService } from "../agentConfigurationService.js";
import { IAgentHostTerminalManager } from "../agentHostTerminalManager.js";
import { IByokLmBridgeRegistry } from "../byokLmBridgeRegistry.js";
import { IByokLmProxyService } from "./byokLmProxyService.js";
import { CopilotSessionWrapper } from "./copilotSessionWrapper.js";
import { createShellTools } from "./copilotShellTools.js";
import { toSdkHooks, toSdkInstructionDirectories, toSdkMcpServers, toSdkMcpServersFromConfigMap, toSdkSessionCustomAgents, toSdkSkillDirectories } from "./copilotPluginConverters.js";
import { buildSandboxConfigForSdk } from "./sandboxConfigForSdk.js";
import { agentHostPromptRegistry } from "./prompts/promptRegistry.js";
import { describeSystemMessageConfig } from "./prompts/systemMessage.js";
import "./prompts/allPrompts.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
const ThinkingLevelConfigKey = "thinkingLevel";
const ContextSizeConfigKey = "contextSize";
const ContextTierConfigKey = "contextTier";
const ReasoningEfforts = ["low", "medium", "high", "xhigh"];
const ContextTiers = ["default", "long_context"];
const AGENT_HOST_COPILOT_CLIENT_NAME = "vscode-agent-host";
function clientToolNamesFromSnapshot(snapshot) {
  return new Set(snapshot.tools.map((tool) => tool.name));
}
function isCopilotReasoningEffort(value) {
  return ReasoningEfforts.some((reasoningEffort) => reasoningEffort === value);
}
function isContextTier(value) {
  return ContextTiers.some((contextTier) => contextTier === value);
}
function getCopilotSdkErrorCode(err) {
  if (typeof err !== "object" || err === null) {
    return void 0;
  }
  const code = Object.getOwnPropertyDescriptor(err, "code")?.value;
  return typeof code === "number" ? code : void 0;
}
function getErrorMessage(err) {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "object" && err !== null) {
    const message = Object.getOwnPropertyDescriptor(err, "message")?.value;
    if (typeof message === "string") {
      return message;
    }
  }
  return String(err);
}
function shouldCreateEmptySessionAfterResumeError(err) {
  if (getCopilotSdkErrorCode(err) !== -32603) {
    return false;
  }
  const message = getErrorMessage(err);
  return !/\b(corrupt|corrupted|invalid|validation|schema|must be|parse|malformed|unexpected token)\b/i.test(message);
}
function isCustomAgentNotFoundError(err) {
  return getCopilotSdkErrorCode(err) === -32603 && /\bCustom agent '.+' not found\b/i.test(getErrorMessage(err));
}
function getCopilotReasoningEffort(model, effortOverride) {
  if (isCopilotReasoningEffort(effortOverride)) {
    return effortOverride;
  }
  const thinkingLevel = model?.config?.[ThinkingLevelConfigKey];
  return isCopilotReasoningEffort(thinkingLevel) ? thinkingLevel : void 0;
}
function resolveCopilotReasoningEffort(model, configurationService, logService, sessionId) {
  const rawOverride = configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.ReasoningEffortOverride);
  const override = rawOverride ? rawOverride : void 0;
  if (override !== void 0) {
    if (isCopilotReasoningEffort(override)) {
      logService.info(`[Copilot:${sessionId}] Applying reasoning-effort override '${override}'`);
    } else {
      logService.warn(`[Copilot:${sessionId}] Ignoring invalid reasoning-effort override '${override}'; expected one of [${ReasoningEfforts.join(", ")}]`);
    }
  }
  return getCopilotReasoningEffort(model, override);
}
function getCopilotContextTier(model, longContextWindow, freeLongContext) {
  const legacyTier = model?.config?.[ContextTierConfigKey];
  if (isContextTier(legacyTier)) {
    return legacyTier;
  }
  const contextSize = model?.config?.[ContextSizeConfigKey];
  if (contextSize === void 0) {
    return freeLongContext ? "long_context" : void 0;
  }
  const selectedWindow = Number(contextSize);
  if (!Number.isFinite(selectedWindow) || typeof longContextWindow !== "number") {
    return void 0;
  }
  return selectedWindow >= longContextWindow ? "long_context" : "default";
}
async function resolveByokSessionConfig(sessionId, bridgeRegistry, startProxy, logService) {
  let byokModels;
  try {
    byokModels = [...bridgeRegistry.getModels()];
  } catch (err) {
    logService.warn(`[Copilot:${sessionId}] Failed to enumerate BYOK models from renderer bridges`, err);
    return {};
  }
  if (byokModels.length === 0) {
    return {};
  }
  const seenSelectionIds = /* @__PURE__ */ new Set();
  byokModels = byokModels.filter((m) => {
    const selectionId = `${m.vendor}/${m.id}`;
    if (seenSelectionIds.has(selectionId)) {
      return false;
    }
    seenSelectionIds.add(selectionId);
    return true;
  });
  let handle;
  try {
    handle = await startProxy();
  } catch (err) {
    logService.warn(`[Copilot:${sessionId}] Failed to start BYOK loopback proxy`, err);
    return {};
  }
  const providers = [...new Set(byokModels.map((m) => m.vendor))].map((vendor) => ({
    name: vendor,
    type: "openai",
    wireApi: "responses",
    baseUrl: handle.providerBaseUrl(vendor),
    bearerToken: `${handle.nonce}.${sessionId}`
  }));
  const models = byokModels.map((m) => ({
    id: m.id,
    provider: m.vendor,
    ...m.name !== void 0 ? { name: m.name } : {},
    ...m.maxContextWindowTokens !== void 0 ? { maxContextWindowTokens: m.maxContextWindowTokens } : {}
  }));
  logService.info(`[Copilot:${sessionId}] Wired ${models.length} BYOK model(s) across ${providers.length} provider(s) via loopback proxy ${handle.baseUrl}`);
  return { providers, models };
}
let CopilotSessionLauncher = class {
  constructor(_configurationService, _terminalManager, _logService, _fileService, _byokLmProxyService, _byokLmBridgeRegistry) {
    this._configurationService = _configurationService;
    this._terminalManager = _terminalManager;
    this._logService = _logService;
    this._fileService = _fileService;
    this._byokLmProxyService = _byokLmProxyService;
    this._byokLmBridgeRegistry = _byokLmBridgeRegistry;
  }
  async launch(plan, runtime) {
    const config = await this._buildSessionConfig(plan, runtime);
    const sandboxConfig = this._computeSandboxConfig();
    if (plan.kind === "create") {
      return this._createSession(plan, config, sandboxConfig);
    }
    let fallbackPlan = plan;
    let fallbackConfig = config;
    try {
      const stopWatch = new StopWatch();
      this._logService.trace(`[Copilot:${plan.sessionId}] Calling SDK resumeSession...`);
      const raw = await plan.client.resumeSession(plan.sessionId, config);
      this._logService.trace(`[Copilot:${plan.sessionId}] SDK resumeSession succeeded after ${stopWatch.elapsed()}ms`);
      await this._applySandboxConfig(raw, sandboxConfig, plan.sessionId);
      return new CopilotSessionWrapper(raw);
    } catch (err) {
      let resumeError = err;
      const errCode = getCopilotSdkErrorCode(resumeError);
      const errMsg = getErrorMessage(resumeError);
      this._logService.warn(`[Copilot:${plan.sessionId}] SDK resumeSession failed: code=${errCode}, message=${errMsg}`);
      if (plan.resolvedAgentName && isCustomAgentNotFoundError(resumeError)) {
        fallbackPlan = { ...plan, resolvedAgentName: void 0 };
        fallbackConfig = { ...config, agent: void 0 };
        this._logService.warn(`[Copilot:${plan.sessionId}] Stored custom agent '${plan.resolvedAgentName}' was not found; retrying resume without a custom agent`);
        try {
          const raw = await fallbackPlan.client.resumeSession(fallbackPlan.sessionId, fallbackConfig);
          await this._applySandboxConfig(raw, sandboxConfig, plan.sessionId);
          return new CopilotSessionWrapper(raw);
        } catch (retryErr) {
          resumeError = retryErr;
          this._logService.warn(`[Copilot:${plan.sessionId}] SDK resumeSession without custom agent failed: code=${getCopilotSdkErrorCode(retryErr)}, message=${getErrorMessage(retryErr)}`);
        }
      }
      if (!shouldCreateEmptySessionAfterResumeError(resumeError)) {
        throw resumeError;
      }
      this._logService.warn(`[Copilot:${plan.sessionId}] Resume failed (code=-32603), falling back to createSession with same ID`);
      const wrapper = await this._createSession({
        ...fallbackPlan,
        kind: "create",
        model: fallbackPlan.fallback.model,
        longContextWindow: fallbackPlan.fallback.longContextWindow,
        freeLongContext: fallbackPlan.fallback.freeLongContext
      }, fallbackConfig, sandboxConfig);
      this._logService.info(`[Copilot:${plan.sessionId}] Fallback createSession succeeded`);
      return wrapper;
    }
  }
  async _createSession(plan, config, sandboxConfig) {
    const raw = await plan.client.createSession({
      ...config,
      sessionId: plan.sessionId,
      streaming: true,
      model: plan.model?.id,
      reasoningEffort: resolveCopilotReasoningEffort(plan.model, this._configurationService, this._logService, plan.sessionId),
      contextTier: getCopilotContextTier(plan.model, plan.longContextWindow, plan.freeLongContext),
      ...plan.resolvedAgentName ? { agent: plan.resolvedAgentName } : {},
      workingDirectory: plan.workingDirectory?.fsPath
    });
    await this._applySandboxConfig(raw, sandboxConfig, plan.sessionId);
    return new CopilotSessionWrapper(raw);
  }
  /**
   * Compute the SDK-shaped sandbox policy to push to the runtime for the
   * SDK's built-in shell tool.
   *
   * Returns `undefined` when {@link CopilotCliConfigKey.EnableCustomTerminalTool}
   * is ON — in that case the AgentHost provides its own shell tools, which
   * wrap commands via the host terminal sandbox engine, so no SDK-side
   * sandbox policy is needed. Otherwise the policy is derived from the
   * host's `sandbox` config bag (forwarded from the workbench's
   * `chat.agent.sandbox.*` settings), mirroring what
   * `buildSandboxConfigForCLI` does for the Copilot extension's CLI path.
   */
  _computeSandboxConfig() {
    const enableCustomTerminalTool = this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.EnableCustomTerminalTool) === true;
    if (enableCustomTerminalTool) {
      return void 0;
    }
    return buildSandboxConfigForSdk(process.platform, this._configurationService.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox));
  }
  /**
   * Forward the SDK-shaped sandbox policy to the runtime via
   * `session.options.update`, immediately after the session is created or
   * resumed. `SessionUpdateOptionsParams.sandboxConfig` is now typed by the
   * SDK (as `SandboxConfig`), and our {@link ISdkSandboxConfig} shape is
   * structurally assignable to it, so we forward it directly.
   *
   * No-op when {@link _computeSandboxConfig} returned `undefined` (custom
   * terminal tool enabled, or the host sandbox config evaluates to disabled).
   */
  async _applySandboxConfig(session, sandboxConfig, sessionId) {
    if (!sandboxConfig) {
      return;
    }
    try {
      await session.rpc.options.update({ sandboxConfig });
      this._logService.info(`[Copilot:${sessionId}] Applied SDK sandboxConfig via session.options.update`);
    } catch (err) {
      this._logService.warn(`[Copilot:${sessionId}] Failed to apply SDK sandboxConfig`, err);
    }
  }
  /**
   * Launcher-bound wrapper over {@link resolveByokSessionConfig}: supplies the
   * active bridge registry and a `startProxy` thunk that memoizes the single
   * shared proxy handle for this launcher (started lazily on first use).
   */
  _resolveByokSessionConfig(sessionId) {
    return resolveByokSessionConfig(sessionId, this._byokLmBridgeRegistry, () => {
      if (!this._byokProxyHandle) {
        this._byokProxyHandle = this._byokLmProxyService.start();
      }
      return this._byokProxyHandle;
    }, this._logService);
  }
  /**
   * Release the memoized BYOK loopback proxy handle (if any) and clear it so
   * the next session launch mints a fresh nonce. Idempotent.
   *
   * **Ownership invariant.** The caller MUST stop the Copilot client/runtime
   * subprocess before invoking this: disposing the handle drops the proxy's
   * refcount and may rebind it on a different port/nonce, so a still-running
   * subprocess would silently lose its endpoint — see {@link IByokLmProxyHandle}.
   * Invoked from `CopilotAgent._stopClient` / `CopilotAgent.shutdown` after the
   * client has stopped.
   */
  async disposeByokProxyHandle() {
    const handle = this._byokProxyHandle;
    this._byokProxyHandle = void 0;
    if (!handle) {
      return;
    }
    try {
      (await handle).dispose();
    } catch {
    }
  }
  async _buildSessionConfig(plan, runtime) {
    const plugins = plan.snapshot.plugins;
    const byok = await this._resolveByokSessionConfig(plan.sessionId);
    const enableCustomTerminalTool = this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.EnableCustomTerminalTool) === true;
    let shellTools = [];
    if (enableCustomTerminalTool) {
      if (!plan.shellManager) {
        throw new Error(`ShellManager is required to launch Copilot session '${plan.sessionId}'`);
      }
      shellTools = await createShellTools(plan.shellManager, this._terminalManager, this._logService, (request) => runtime.requestUnsandboxedCommandConfirmation(request));
    }
    const pluginsWithoutDirs = plugins.filter((p) => !p.pluginDir || p.pluginDir.scheme !== Schemas.file);
    const customAgents = await toSdkSessionCustomAgents(plugins, plan.resolvedAgentName, this._fileService);
    const skillDirectories = toSdkSkillDirectories(pluginsWithoutDirs.flatMap((p) => p.skills));
    const instructionDirectories = toSdkInstructionDirectories(plugins.flatMap((p) => p.instructions));
    const model = plan.kind === "create" ? plan.model : plan.fallback.model;
    const clientToolNames = clientToolNamesFromSnapshot(plan.snapshot);
    const effectiveModel = applyModelFamilyAlias(model, this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.ModelCapabilityOverrides));
    if (model && effectiveModel !== model) {
      this._logService.info(`[Copilot:${plan.sessionId}] Model capability override: routing prompt for '${model.id}' as family '${effectiveModel?.id}'`);
    }
    const toolSearchActive = this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.ToolSearchEnabled) === true && agentHostModelSupportsToolSearch(effectiveModel?.id) && clientToolNames.has(CLIENT_TOOL_SEARCH_REFERENCE_NAME);
    const toolSearchDeferThreshold = normalizeToolSearchDeferThreshold(this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.ToolSearchDeferThreshold));
    const promptContext = {
      getSetting: (key) => this._configurationService.getRootValue(copilotCliConfigSchema, key),
      hasClientTool: (name) => clientToolNames.has(name),
      workspaceless: plan.workspaceless === true,
      toolSearchActive
    };
    const systemMessage = agentHostPromptRegistry.resolveSystemMessageConfig(effectiveModel, promptContext);
    this._logService.info(`[Copilot:${plan.sessionId}] Resolved system message: ${describeSystemMessageConfig(systemMessage)}`);
    if (this._logService.getLevel() <= LogLevel.Trace) {
      this._logService.trace(`[Copilot:${plan.sessionId}] System message config: ${JSON.stringify(systemMessage, (_key, value) => typeof value === "function" ? "[transform fn]" : value)}`);
    }
    return {
      ...byok,
      clientName: AGENT_HOST_COPILOT_CLIENT_NAME,
      enableMcpApps: true,
      enableFileHooks: true,
      enableConfigDiscovery: true,
      requestExtensions: false,
      // force-disable copilot extension management tools (otherwise enabled in experimental mode)
      onPermissionRequest: (request) => runtime.handlePermissionRequest(request),
      onUserInputRequest: (request, invocation) => runtime.handleUserInputRequest(request, invocation),
      onElicitationRequest: (context) => runtime.handleElicitationRequest(context),
      onMcpAuthRequest: (request, context) => runtime.handleMcpAuthRequest(request, context),
      hooks: toSdkHooks(pluginsWithoutDirs.flatMap((p) => p.hooks), {
        onPreToolUse: (input) => runtime.handlePreToolUse(input),
        onPostToolUse: (input) => runtime.handlePostToolUse(input)
      }),
      mcpServers: { ...toSdkMcpServersFromConfigMap(plan.snapshot.mcpServers), ...toSdkMcpServers(pluginsWithoutDirs.flatMap((p) => p.mcpServers)) },
      onExitPlanModeRequest: (request, invocation) => runtime.handleExitPlanModeRequest(request, invocation),
      workingDirectory: plan.workingDirectory?.fsPath,
      customAgents,
      agent: plan.resolvedAgentName,
      skillDirectories,
      instructionDirectories,
      systemMessage,
      toolSearch: toolSearchActive ? { enabled: true, deferThreshold: toolSearchDeferThreshold } : { enabled: false },
      pluginDirectories: coalesce(plugins.map((p) => p.pluginDir)).filter((d) => d.scheme === Schemas.file).map((d) => d.fsPath),
      tools: [...shellTools, ...runtime.createClientSdkTools(), ...runtime.createServerSdkTools()],
      // Pass the GitHub token at the session level. The SDK's
      // client-level `gitHubToken` authenticates the CLI process,
      // but each session also needs its own token resolved into a
      // GitHub identity (login, Copilot plan, endpoints) to drive
      // model routing and quota — without this the session
      // errors with "Session was not created with authentication
      // info or custom provider" on first send. See #318693.
      gitHubToken: plan.githubToken,
      // Enable infinite sessions so the SDK provisions a workspace
      // directory (containing `plan.md`, `checkpoints/`, `files/`).
      // The workspace is required for plan mode to work — without
      // it, `rpc.plan.read()` returns `path: null` and the SDK
      // never emits `exit_plan_mode.requested`.
      infiniteSessions: { enabled: true },
      // Per-session remote export: the client-level `--remote` flag
      // (enableRemoteSessions) enables the CLI capability, but each
      // session must opt in via `remoteSession` to actually export
      // events. Without this, sessions default to "off".
      remoteSession: this._configurationService.getRootValue(platformRootSchema, AgentHostSessionSyncEnabledConfigKey) === true ? "export" : void 0,
      enableManagedSettings: true
    };
  }
};
CopilotSessionLauncher = __decorateClass([
  __decorateParam(0, IAgentConfigurationService),
  __decorateParam(1, IAgentHostTerminalManager),
  __decorateParam(2, ILogService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IByokLmProxyService),
  __decorateParam(5, IByokLmBridgeRegistry)
], CopilotSessionLauncher);
export {
  ContextSizeConfigKey,
  ContextTierConfigKey,
  CopilotSessionLauncher,
  ThinkingLevelConfigKey,
  clientToolNamesFromSnapshot,
  getCopilotContextTier,
  getCopilotReasoningEffort,
  isCopilotReasoningEffort,
  resolveByokSessionConfig,
  resolveCopilotReasoningEffort
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NvcGlsb3QvY29waWxvdFNlc3Npb25MYXVuY2hlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgQ29waWxvdENsaWVudCwgRXhpdFBsYW5Nb2RlUmVxdWVzdCwgRXhpdFBsYW5Nb2RlUmVzdWx0LCBOYW1lZFByb3ZpZGVyQ29uZmlnLCBQZXJtaXNzaW9uUmVxdWVzdFJlc3VsdCwgUHJvdmlkZXJNb2RlbENvbmZpZywgUmVzdW1lU2Vzc2lvbkNvbmZpZywgU2Vzc2lvbkNvbmZpZywgVG9vbCB9IGZyb20gJ0BnaXRodWIvY29waWxvdC1zZGsnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDb3BpbG90Q2xpQ29uZmlnS2V5LCBhcHBseU1vZGVsRmFtaWx5QWxpYXMsIGNvcGlsb3RDbGlDb25maWdTY2hlbWEsIG5vcm1hbGl6ZVRvb2xTZWFyY2hEZWZlclRocmVzaG9sZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3BpbG90Q2xpQ29uZmlnLmpzJztcbmltcG9ydCB7IGFnZW50SG9zdE1vZGVsU3VwcG9ydHNUb29sU2VhcmNoLCBDTElFTlRfVE9PTF9TRUFSQ0hfUkVGRVJFTkNFX05BTUUgfSBmcm9tICcuL3Rvb2xTZWFyY2hEZWZlcnJhbC5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTZXNzaW9uU3luY0VuYWJsZWRDb25maWdLZXksIHBsYXRmb3JtUm9vdFNjaGVtYSwgdHlwZSBBZ2VudEhvc3RNY3BTZXJ2ZXJzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTYW5kYm94Q29uZmlnS2V5LCBzYW5kYm94Q29uZmlnU2NoZW1hIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NhbmRib3hDb25maWdTY2hlbWEuanMnO1xuaW1wb3J0IHsgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIgfSBmcm9tICcuLi9hZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIuanMnO1xuaW1wb3J0IHsgSUJ5b2tMbUJyaWRnZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vYnlva0xtQnJpZGdlUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUJ5b2tMbVByb3h5U2VydmljZSwgdHlwZSBJQnlva0xtUHJveHlIYW5kbGUgfSBmcm9tICcuL2J5b2tMbVByb3h5U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElCeW9rTG1Nb2RlbEluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Qnlva0xtLmpzJztcbmltcG9ydCB0eXBlIHsgTW9kZWxTZWxlY3Rpb24sIFRvb2xEZWZpbml0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgQWN0aXZlQ2xpZW50VG9vbFNldCB9IGZyb20gJy4uL2FjdGl2ZUNsaWVudFN0YXRlLmpzJztcbmltcG9ydCB7IENvcGlsb3RTZXNzaW9uV3JhcHBlciB9IGZyb20gJy4vY29waWxvdFNlc3Npb25XcmFwcGVyLmpzJztcbmltcG9ydCB7IFNoZWxsTWFuYWdlciwgY3JlYXRlU2hlbGxUb29scywgdHlwZSBJVW5zYW5kYm94ZWRDb21tYW5kQ29uZmlybWF0aW9uUmVxdWVzdCB9IGZyb20gJy4vY29waWxvdFNoZWxsVG9vbHMuanMnO1xuaW1wb3J0IHsgdG9TZGtIb29rcywgdG9TZGtJbnN0cnVjdGlvbkRpcmVjdG9yaWVzLCB0b1Nka01jcFNlcnZlcnMsIHRvU2RrTWNwU2VydmVyc0Zyb21Db25maWdNYXAsIHRvU2RrU2Vzc2lvbkN1c3RvbUFnZW50cywgdG9TZGtTa2lsbERpcmVjdG9yaWVzIH0gZnJvbSAnLi9jb3BpbG90UGx1Z2luQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBidWlsZFNhbmRib3hDb25maWdGb3JTZGssIHR5cGUgSVNka1NhbmRib3hDb25maWcgfSBmcm9tICcuL3NhbmRib3hDb25maWdGb3JTZGsuanMnO1xuaW1wb3J0IHR5cGUgeyBJVHlwZWRQZXJtaXNzaW9uUmVxdWVzdCB9IGZyb20gJy4vY29waWxvdFRvb2xEaXNwbGF5LmpzJztcbmltcG9ydCB0eXBlIHsgSUNvcGlsb3RQbHVnaW5JbmZvIH0gZnJvbSAnLi9jb3BpbG90QWdlbnQuanMnO1xuaW1wb3J0IHsgYWdlbnRIb3N0UHJvbXB0UmVnaXN0cnksIHR5cGUgSUFnZW50SG9zdFByb21wdENvbnRleHQgfSBmcm9tICcuL3Byb21wdHMvcHJvbXB0UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgZGVzY3JpYmVTeXN0ZW1NZXNzYWdlQ29uZmlnIH0gZnJvbSAnLi9wcm9tcHRzL3N5c3RlbU1lc3NhZ2UuanMnO1xuaW1wb3J0ICcuL3Byb21wdHMvYWxsUHJvbXB0cy5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuXG5leHBvcnQgY29uc3QgVGhpbmtpbmdMZXZlbENvbmZpZ0tleSA9ICd0aGlua2luZ0xldmVsJztcbi8qKlxuICogQ29uZmlnIGtleSBmb3IgdGhlIG51bWVyaWMgXCJDb250ZXh0IFNpemVcIiBzZWxlY3Rpb24gKGEgY29udGV4dC13aW5kb3cgdG9rZW4gY291bnQpLiBNYXBwZWQgdG8gdGhlXG4gKiBTREsncyB0d28tdmFsdWVkIHtAbGluayBTZXNzaW9uQ29uZmlnLmNvbnRleHRUaWVyfSBieSB7QGxpbmsgZ2V0Q29waWxvdENvbnRleHRUaWVyfS5cbiAqL1xuZXhwb3J0IGNvbnN0IENvbnRleHRTaXplQ29uZmlnS2V5ID0gJ2NvbnRleHRTaXplJztcbi8qKlxuICogQGRlcHJlY2F0ZWQgTGVnYWN5IGNvbmZpZyBrZXkgdGhhdCBzdG9yZWQgdGhlIHJlc29sdmVkIHRpZXIgc3RyaW5nIChgJ2RlZmF1bHQnYCAvIGAnbG9uZ19jb250ZXh0J2ApXG4gKiBkaXJlY3RseS4gUmVwbGFjZWQgYnkgdGhlIG51bWVyaWMge0BsaW5rIENvbnRleHRTaXplQ29uZmlnS2V5fTsgc3RpbGwgcmVhZCBmcm9tIHBlcnNpc3RlZCBzZXNzaW9uc1xuICogZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkuXG4gKi9cbmV4cG9ydCBjb25zdCBDb250ZXh0VGllckNvbmZpZ0tleSA9ICdjb250ZXh0VGllcic7XG5cbmNvbnN0IFJlYXNvbmluZ0VmZm9ydHMgPSBbJ2xvdycsICdtZWRpdW0nLCAnaGlnaCcsICd4aGlnaCddIGFzIGNvbnN0O1xudHlwZSBSZWFzb25pbmdFZmZvcnQgPSBOb25OdWxsYWJsZTxTZXNzaW9uQ29uZmlnWydyZWFzb25pbmdFZmZvcnQnXT47XG5cbmNvbnN0IENvbnRleHRUaWVycyA9IFsnZGVmYXVsdCcsICdsb25nX2NvbnRleHQnXSBhcyBjb25zdDtcbnR5cGUgQ29udGV4dFRpZXIgPSBOb25OdWxsYWJsZTxTZXNzaW9uQ29uZmlnWydjb250ZXh0VGllciddPjtcbmNvbnN0IEFHRU5UX0hPU1RfQ09QSUxPVF9DTElFTlRfTkFNRSA9ICd2c2NvZGUtYWdlbnQtaG9zdCc7XG5cbnR5cGUgVXNlcklucHV0SGFuZGxlciA9IE5vbk51bGxhYmxlPFNlc3Npb25Db25maWdbJ29uVXNlcklucHV0UmVxdWVzdCddPjtcbnR5cGUgVXNlcklucHV0UmVxdWVzdCA9IFBhcmFtZXRlcnM8VXNlcklucHV0SGFuZGxlcj5bMF07XG50eXBlIFVzZXJJbnB1dEludm9jYXRpb24gPSBQYXJhbWV0ZXJzPFVzZXJJbnB1dEhhbmRsZXI+WzFdO1xudHlwZSBVc2VySW5wdXRSZXNwb25zZSA9IEF3YWl0ZWQ8UmV0dXJuVHlwZTxVc2VySW5wdXRIYW5kbGVyPj47XG50eXBlIEVsaWNpdGF0aW9uSGFuZGxlciA9IE5vbk51bGxhYmxlPFNlc3Npb25Db25maWdbJ29uRWxpY2l0YXRpb25SZXF1ZXN0J10+O1xudHlwZSBFbGljaXRhdGlvbkNvbnRleHQgPSBQYXJhbWV0ZXJzPEVsaWNpdGF0aW9uSGFuZGxlcj5bMF07XG50eXBlIEVsaWNpdGF0aW9uUmVzdWx0ID0gQXdhaXRlZDxSZXR1cm5UeXBlPEVsaWNpdGF0aW9uSGFuZGxlcj4+O1xudHlwZSBNY3BBdXRoSGFuZGxlciA9IE5vbk51bGxhYmxlPFNlc3Npb25Db25maWdbJ29uTWNwQXV0aFJlcXVlc3QnXT47XG50eXBlIE1jcEF1dGhSZXF1ZXN0ID0gUGFyYW1ldGVyczxNY3BBdXRoSGFuZGxlcj5bMF07XG50eXBlIE1jcEF1dGhDb250ZXh0ID0gUGFyYW1ldGVyczxNY3BBdXRoSGFuZGxlcj5bMV07XG50eXBlIE1jcEF1dGhSZXNwb25zZSA9IEF3YWl0ZWQ8UmV0dXJuVHlwZTxNY3BBdXRoSGFuZGxlcj4+O1xudHlwZSBTZXNzaW9uSG9va3MgPSBOb25OdWxsYWJsZTxTZXNzaW9uQ29uZmlnWydob29rcyddPjtcbnR5cGUgUHJlVG9vbFVzZUhvb2tJbnB1dCA9IFBhcmFtZXRlcnM8Tm9uTnVsbGFibGU8U2Vzc2lvbkhvb2tzWydvblByZVRvb2xVc2UnXT4+WzBdO1xudHlwZSBQb3N0VG9vbFVzZUhvb2tJbnB1dCA9IFBhcmFtZXRlcnM8Tm9uTnVsbGFibGU8U2Vzc2lvbkhvb2tzWydvblBvc3RUb29sVXNlJ10+PlswXTtcbnR5cGUgQ29waWxvdFNlc3Npb25MYXVuY2hDb25maWcgPSBSZXN1bWVTZXNzaW9uQ29uZmlnICYge1xuXHRyZWFkb25seSBwbHVnaW5EaXJlY3Rvcmllcz86IHN0cmluZ1tdO1xuXHRyZWFkb25seSByZW1vdGVTZXNzaW9uPzogJ2V4cG9ydCc7XG59O1xuXG4vKipcbiAqIEltbXV0YWJsZSBzbmFwc2hvdCBvZiB0aGUgYWN0aXZlIGNsaWVudCdzIHN0cnVjdHVyYWwgY29udHJpYnV0aW9ucyBhdFxuICogc2Vzc2lvbiBjcmVhdGlvbiB0aW1lLiBVc2VkIHRvIGRldGVjdCB3aGVuIHRoZSBzZXNzaW9uIG5lZWRzIHRvIGJlXG4gKiByZWZyZXNoZWQuIFJvb3QgTUNQIHNlcnZlcnMgcGFydGljaXBhdGUgaW4gcmVzdGFydCBkZXRlY3Rpb24gYmVjYXVzZSB0aGV5XG4gKiBhcmUgbWVyZ2VkIGludG8gdGhlIFNESyBzZXNzaW9uIGNvbmZpZy4gVGhlIG93bmluZyBgY2xpZW50SWRgcyBhcmVcbiAqIGRlbGliZXJhdGVseSBOT1QgcGFydCBvZiB0aGlzIHNuYXBzaG90OiBjbGllbnQgaWRlbnRpdHkgaXMgdHJhY2tlZCBsaXZlIHZpYVxuICoge0BsaW5rIEFjdGl2ZUNsaWVudFRvb2xTZXR9IHNvIGEgd2luZG93XG4gKiByZWxvYWQgKG5ldyBgY2xpZW50SWRgLCBpZGVudGljYWwgdG9vbHMvcGx1Z2lucykgZG9lcyBub3QgZm9yY2UgYSByZXN0YXJ0LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBY3RpdmVDbGllbnRTbmFwc2hvdCB7XG5cdHJlYWRvbmx5IHRvb2xzOiByZWFkb25seSBUb29sRGVmaW5pdGlvbltdO1xuXHRyZWFkb25seSBwbHVnaW5zOiByZWFkb25seSBJQ29waWxvdFBsdWdpbkluZm9bXTtcblx0cmVhZG9ubHkgbWNwU2VydmVyczogQWdlbnRIb3N0TWNwU2VydmVycztcbn1cblxuLyoqXG4gKiBUaGUgc2V0IG9mIGNsaWVudC10b29sIG5hbWVzIHRoZSBhZ2VudCBzZWVzIGZvciBhIHNuYXBzaG90IFx1MjAxNCBlYWNoIHRvb2wnc1xuICogYFRvb2xEZWZpbml0aW9uLm5hbWVgICh0aGUgY2FtZWxDYXNlIGB0b29sUmVmZXJlbmNlTmFtZWApLiBVc2VkIGJvdGggdG8gZ2F0ZVxuICogdG9vbC1zcGVjaWZpYyBwcm9tcHQgc2VjdGlvbnMgYXQgbGF1bmNoIGFuZCB0byByb3V0ZSBjbGllbnQgdG9vbCBjYWxscyBkdXJpbmdcbiAqIHRoZSBzZXNzaW9uLCBzbyB0aGUgdHdvIHN0YXkgZGVyaXZlZCBmcm9tIG9uZSBkZWZpbml0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2xpZW50VG9vbE5hbWVzRnJvbVNuYXBzaG90KHNuYXBzaG90OiBJQWN0aXZlQ2xpZW50U25hcHNob3QpOiBSZWFkb25seVNldDxzdHJpbmc+IHtcblx0cmV0dXJuIG5ldyBTZXQoc25hcHNob3QudG9vbHMubWFwKHRvb2wgPT4gdG9vbC5uYW1lKSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvcGlsb3RTZXNzaW9uUnVudGltZSB7XG5cdGhhbmRsZVBlcm1pc3Npb25SZXF1ZXN0KHJlcXVlc3Q6IElUeXBlZFBlcm1pc3Npb25SZXF1ZXN0KTogUHJvbWlzZTxQZXJtaXNzaW9uUmVxdWVzdFJlc3VsdD47XG5cdGhhbmRsZUV4aXRQbGFuTW9kZVJlcXVlc3QocmVxdWVzdDogRXhpdFBsYW5Nb2RlUmVxdWVzdCwgaW52b2NhdGlvbjogeyBzZXNzaW9uSWQ6IHN0cmluZyB9KTogUHJvbWlzZTxFeGl0UGxhbk1vZGVSZXN1bHQ+O1xuXHRoYW5kbGVVc2VySW5wdXRSZXF1ZXN0KHJlcXVlc3Q6IFVzZXJJbnB1dFJlcXVlc3QsIGludm9jYXRpb246IFVzZXJJbnB1dEludm9jYXRpb24pOiBQcm9taXNlPFVzZXJJbnB1dFJlc3BvbnNlPjtcblx0aGFuZGxlRWxpY2l0YXRpb25SZXF1ZXN0KGNvbnRleHQ6IEVsaWNpdGF0aW9uQ29udGV4dCk6IFByb21pc2U8RWxpY2l0YXRpb25SZXN1bHQ+O1xuXHRoYW5kbGVNY3BBdXRoUmVxdWVzdChyZXF1ZXN0OiBNY3BBdXRoUmVxdWVzdCwgY29udGV4dDogTWNwQXV0aENvbnRleHQpOiBQcm9taXNlPE1jcEF1dGhSZXNwb25zZT47XG5cdHJlcXVlc3RVbnNhbmRib3hlZENvbW1hbmRDb25maXJtYXRpb24ocmVxdWVzdDogSVVuc2FuZGJveGVkQ29tbWFuZENvbmZpcm1hdGlvblJlcXVlc3QpOiBQcm9taXNlPGJvb2xlYW4+O1xuXHRoYW5kbGVQcmVUb29sVXNlKGlucHV0OiBQcmVUb29sVXNlSG9va0lucHV0KTogUHJvbWlzZTx2b2lkPjtcblx0aGFuZGxlUG9zdFRvb2xVc2UoaW5wdXQ6IFBvc3RUb29sVXNlSG9va0lucHV0KTogUHJvbWlzZTx2b2lkPjtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0Y3JlYXRlQ2xpZW50U2RrVG9vbHMoKTogVG9vbDxhbnk+W107XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdGNyZWF0ZVNlcnZlclNka1Rvb2xzKCk6IFRvb2w8YW55PltdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb3BpbG90U2Vzc2lvbkxhdW5jaGVyIHtcblx0LyoqXG5cdCAqIENyZWF0ZXMgYW4gdW5vd25lZCBTREsgc2Vzc2lvbiB3cmFwcGVyLiBUaGUgY2FsbGVyIGlzIHJlc3BvbnNpYmxlIGZvclxuXHQgKiByZWdpc3RlcmluZyBvciBkaXNwb3NpbmcgdGhlIHJldHVybmVkIHdyYXBwZXIuXG5cdCAqL1xuXHRsYXVuY2gocGxhbjogQ29waWxvdFNlc3Npb25MYXVuY2hQbGFuLCBydW50aW1lOiBJQ29waWxvdFNlc3Npb25SdW50aW1lKTogUHJvbWlzZTxDb3BpbG90U2Vzc2lvbldyYXBwZXI+O1xufVxuXG50eXBlIENvcGlsb3RTZXNzaW9uQ2xpZW50ID0gUGljazxDb3BpbG90Q2xpZW50LCAnY3JlYXRlU2Vzc2lvbicgfCAncmVzdW1lU2Vzc2lvbic+O1xuXG5pbnRlcmZhY2UgSUNvcGlsb3RTZXNzaW9uTGF1bmNoQmFzZSB7XG5cdHJlYWRvbmx5IGNsaWVudDogQ29waWxvdFNlc3Npb25DbGllbnQ7XG5cdHJlYWRvbmx5IHNlc3Npb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSB3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBUaGUgYWRkaXRpb25hbCB3b3JraW5nIGRpcmVjdG9yaWVzIGJleW9uZCB0aGUgcHJpbWFyeSBwcm9jZXNzIHJvb3Rcblx0ICogKHtAbGluayB3b3JraW5nRGlyZWN0b3J5fSA9IGluZGV4IDApLiBUaGVzZSBhcmUgdGhlIHBlZXIgcm9vdHMgb2YgYVxuXHQgKiBtdWx0aS1yb290IHNlc3Npb24ncyBvcmRlcmVkIHNldCBcdTIwMTQgdGhlIGRpcmVjdG9yaWVzIHRoZSBhZ2VudCBzaG91bGQgYmVcblx0ICogZ3JhbnRlZCB0b29sIGFjY2VzcyB0byBpbiBhZGRpdGlvbiB0byBpdHMgcHJvY2VzcyBjd2QuIEVtcHR5IChvciBhYnNlbnQpXG5cdCAqIGZvciBhIHNpbmdsZS1yb290IHNlc3Npb24uIFBhc3NlZCB0aHJvdWdoIHNvIHRoZSBTREsgY2FuIHJlZ2lzdGVyIHRoZW0gYXNcblx0ICogZXh0cmEgYWNjZXNzaWJsZSByb290cyBvbmNlIHRoYXQgc3VyZmFjZSBpcyBhdmFpbGFibGU7IHRoZSBwcm9jZXNzIHN0aWxsXG5cdCAqIGxhdW5jaGVzIGluIHtAbGluayB3b3JraW5nRGlyZWN0b3J5fS5cblx0ICovXG5cdHJlYWRvbmx5IGFkZGl0aW9uYWxEaXJlY3Rvcmllcz86IHJlYWRvbmx5IFVSSVtdO1xuXHRyZWFkb25seSByZXNvbHZlZEFnZW50TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBzbmFwc2hvdDogSUFjdGl2ZUNsaWVudFNuYXBzaG90O1xuXHQvKipcblx0ICogTGl2ZSwgbG9uZy1saXZlZCByZWdpc3RyeSBvZiBldmVyeSBhY3RpdmUgY2xpZW50J3MgdG9vbCBjb250cmlidXRpb25zLlxuXHQgKiBSZWFkIGF0IHRvb2wtY2FsbCBzdGFtcCB0aW1lIHNvIGEgd2luZG93IHJlbG9hZCAobmV3IGBjbGllbnRJZGAsXG5cdCAqIGlkZW50aWNhbCB0b29scykgc3RhbXBzIHN1YnNlcXVlbnQgY2xpZW50IHRvb2wgY2FsbHMgd2l0aCB0aGUgY3VycmVudFxuXHQgKiBvd25pbmcgaWQgcmF0aGVyIHRoYW4gdGhlIG9uZSBmcm96ZW4gaW50byB7QGxpbmsgc25hcHNob3R9IGF0IGNyZWF0aW9uLFxuXHQgKiBhbmQgc28gYSB0b29sIGNhbGwgaXMgYXR0cmlidXRlZCB0byB3aGljaGV2ZXIgY2xpZW50IGNvbnRyaWJ1dGVkIGl0LlxuXHQgKi9cblx0cmVhZG9ubHkgYWN0aXZlQ2xpZW50VG9vbFNldDogQWN0aXZlQ2xpZW50VG9vbFNldDtcblx0cmVhZG9ubHkgc2hlbGxNYW5hZ2VyOiBTaGVsbE1hbmFnZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGdpdGh1YlRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhpcyBpcyBhIHdvcmtzcGFjZS1sZXNzIHNlc3Npb24uIFRocmVhZGVkIGludG8gdGhlXG5cdCAqIHByb21wdCBjb250ZXh0IHNvIHRoZSByZXNvbHZlZCBzeXN0ZW0gbWVzc2FnZSBnZXRzIHRoZSBzY3JhdGNoL3JlcG9sZXNzXG5cdCAqIHZhcmlhbnQuIE5hbWVkIHRvIG1hdGNoIHRoZSBgd29ya3NwYWNlbGVzc2AgbWFya2VyIHVzZWQgdGhyb3VnaG91dCB0aGUgQUhcblx0ICogbGF5ZXIgKHNlc3Npb24gYF9tZXRhYCwgc3RvcmVkIG1ldGFkYXRhKSB0aGF0IHRoaXMgdmFsdWUgZmxvd3MgZnJvbS5cblx0ICovXG5cdHJlYWRvbmx5IHdvcmtzcGFjZWxlc3M/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb3BpbG90Q3JlYXRlU2Vzc2lvbkxhdW5jaFBsYW4gZXh0ZW5kcyBJQ29waWxvdFNlc3Npb25MYXVuY2hCYXNlIHtcblx0cmVhZG9ubHkga2luZDogJ2NyZWF0ZSc7XG5cdHJlYWRvbmx5IG1vZGVsOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgbG9uZ0NvbnRleHRXaW5kb3c/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGZyZWVMb25nQ29udGV4dD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvcGlsb3RSZXN1bWVTZXNzaW9uTGF1bmNoUGxhbiBleHRlbmRzIElDb3BpbG90U2Vzc2lvbkxhdW5jaEJhc2Uge1xuXHRyZWFkb25seSBraW5kOiAncmVzdW1lJztcblx0cmVhZG9ubHkgd29ya2luZ0RpcmVjdG9yeTogVVJJO1xuXHRyZWFkb25seSBmYWxsYmFjazoge1xuXHRcdHJlYWRvbmx5IG1vZGVsOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRyZWFkb25seSBsb25nQ29udGV4dFdpbmRvdz86IG51bWJlcjtcblx0XHRyZWFkb25seSBmcmVlTG9uZ0NvbnRleHQ/OiBib29sZWFuO1xuXHR9O1xufVxuXG5leHBvcnQgdHlwZSBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW4gPSBJQ29waWxvdENyZWF0ZVNlc3Npb25MYXVuY2hQbGFuIHwgSUNvcGlsb3RSZXN1bWVTZXNzaW9uTGF1bmNoUGxhbjtcblxuZXhwb3J0IGZ1bmN0aW9uIGlzQ29waWxvdFJlYXNvbmluZ0VmZm9ydCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFJlYXNvbmluZ0VmZm9ydCB7XG5cdHJldHVybiBSZWFzb25pbmdFZmZvcnRzLnNvbWUocmVhc29uaW5nRWZmb3J0ID0+IHJlYXNvbmluZ0VmZm9ydCA9PT0gdmFsdWUpO1xufVxuXG5mdW5jdGlvbiBpc0NvbnRleHRUaWVyKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgQ29udGV4dFRpZXIge1xuXHRyZXR1cm4gQ29udGV4dFRpZXJzLnNvbWUoY29udGV4dFRpZXIgPT4gY29udGV4dFRpZXIgPT09IHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gZ2V0Q29waWxvdFNka0Vycm9yQ29kZShlcnI6IHVua25vd24pOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRpZiAodHlwZW9mIGVyciAhPT0gJ29iamVjdCcgfHwgZXJyID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBjb2RlID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihlcnIsICdjb2RlJyk/LnZhbHVlO1xuXHRyZXR1cm4gdHlwZW9mIGNvZGUgPT09ICdudW1iZXInID8gY29kZSA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZ2V0RXJyb3JNZXNzYWdlKGVycjogdW5rbm93bik6IHN0cmluZyB7XG5cdGlmIChlcnIgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdHJldHVybiBlcnIubWVzc2FnZTtcblx0fVxuXHRpZiAodHlwZW9mIGVyciA9PT0gJ29iamVjdCcgJiYgZXJyICE9PSBudWxsKSB7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoZXJyLCAnbWVzc2FnZScpPy52YWx1ZTtcblx0XHRpZiAodHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gbWVzc2FnZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIFN0cmluZyhlcnIpO1xufVxuXG4vKipcbiAqIERlY2lkZSB3aGV0aGVyIGEgQ29waWxvdCBTREsgYHJlc3VtZVNlc3Npb25gIGZhaWx1cmUgc2hvdWxkIGZhbGwgYmFjayB0b1xuICogYGNyZWF0ZVNlc3Npb24oeyBzZXNzaW9uSWQgfSlgLiBXZSB3YW50IHRvIHByZXNlcnZlIHRoZSBvcmlnaW5hbFxuICogcmVjb3ZlcnkgZm9yIGVtcHR5IC8gdHJ1bmNhdGVkIHNlc3Npb25zIChlLmcuIGFmdGVyIHRoZSB1c2VyIGludm9rZWRcbiAqIFwiU3RhcnQgT3ZlclwiLCB3aGljaCBjYWxscyBgdHJ1bmNhdGVTZXNzaW9uYCBhbmQgbGVhdmVzIHRoZSBvbi1kaXNrXG4gKiBzZXNzaW9uIHdpdGggemVybyBldmVudHMgLSB0aGUgU0RLIHRoZW4gcmVmdXNlcyB0byByZXN1bWUgaXQpLCBidXQgd2VcbiAqIG11c3QgTk9UIHNpbGVudGx5IHN3YWxsb3cgY29ycnVwdGlvbiAvIHNjaGVtYS12YWxpZGF0aW9uIC8gcGFyc2VcbiAqIGZhaWx1cmVzOiB0aG9zZSBzaG91bGQgc3VyZmFjZSBzbyB0aGUgdXNlciBzZWVzIHRoZSByZWFsIGVycm9yIGFuZCB0aGVcbiAqIG9yaWdpbmFsIHNlc3Npb24gY29udGVudHMgYXJlIG5vdCBtYXNrZWQgYnkgYSBmcmVzaCBlbXB0eSBzZXNzaW9uLlxuICpcbiAqIEhldXJpc3RpYzogYW55IGAtMzI2MDNgIEludGVybmFsIEVycm9yIGlzIHRyZWF0ZWQgYXMgdGhlIGVtcHR5LXNlc3Npb25cbiAqIGNhc2UgVU5MRVNTIHRoZSBtZXNzYWdlIGNsZWFybHkgaW5kaWNhdGVzIGNvcnJ1cHRpb24sIHNjaGVtYVxuICogdmFsaWRhdGlvbiwgcGFyc2UgZmFpbHVyZSwgb3IgbWFsZm9ybWVkIGlucHV0LlxuICovXG5mdW5jdGlvbiBzaG91bGRDcmVhdGVFbXB0eVNlc3Npb25BZnRlclJlc3VtZUVycm9yKGVycjogdW5rbm93bik6IGJvb2xlYW4ge1xuXHRpZiAoZ2V0Q29waWxvdFNka0Vycm9yQ29kZShlcnIpICE9PSAtMzI2MDMpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdCBtZXNzYWdlID0gZ2V0RXJyb3JNZXNzYWdlKGVycik7XG5cdHJldHVybiAhL1xcYihjb3JydXB0fGNvcnJ1cHRlZHxpbnZhbGlkfHZhbGlkYXRpb258c2NoZW1hfG11c3QgYmV8cGFyc2V8bWFsZm9ybWVkfHVuZXhwZWN0ZWQgdG9rZW4pXFxiL2kudGVzdChtZXNzYWdlKTtcbn1cblxuZnVuY3Rpb24gaXNDdXN0b21BZ2VudE5vdEZvdW5kRXJyb3IoZXJyOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdHJldHVybiBnZXRDb3BpbG90U2RrRXJyb3JDb2RlKGVycikgPT09IC0zMjYwMyAmJiAvXFxiQ3VzdG9tIGFnZW50ICcuKycgbm90IGZvdW5kXFxiL2kudGVzdChnZXRFcnJvck1lc3NhZ2UoZXJyKSk7XG59XG5cbi8qKlxuICogUmVzb2x2ZXMgdGhlIHJlYXNvbmluZyBlZmZvcnQ6IGEgcmVjb2duaXplZCBvdmVycmlkZSBsZXZlbCB3aW5zIG92ZXIgdGhlXG4gKiBtb2RlbCBwaWNrZXIncyB0aGlua2luZyBsZXZlbDsgYW4gdW5yZWNvZ25pemVkIG92ZXJyaWRlIGlzIGlnbm9yZWQgKGRlZ3JhZGVzXG4gKiB0byB0aGUgcGlja2VyKS4gVmFsaWRhdGlvbiBpcyBhZ2FpbnN0IHRoZSBrbm93biBlZmZvcnQgbGV2ZWxzIG9ubHkgXHUyMDE0IHRoZVxuICogY2FsbGVyL29wZXJhdG9yIGlzIHJlc3BvbnNpYmxlIGZvciBjaG9vc2luZyBhIGxldmVsIHRoZSBtb2RlbCBzdXBwb3J0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldENvcGlsb3RSZWFzb25pbmdFZmZvcnQobW9kZWw6IE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkLCBlZmZvcnRPdmVycmlkZT86IHN0cmluZyk6IFNlc3Npb25Db25maWdbJ3JlYXNvbmluZ0VmZm9ydCddIHtcblx0aWYgKGlzQ29waWxvdFJlYXNvbmluZ0VmZm9ydChlZmZvcnRPdmVycmlkZSkpIHtcblx0XHRyZXR1cm4gZWZmb3J0T3ZlcnJpZGU7XG5cdH1cblx0Y29uc3QgdGhpbmtpbmdMZXZlbCA9IG1vZGVsPy5jb25maWc/LltUaGlua2luZ0xldmVsQ29uZmlnS2V5XTtcblx0cmV0dXJuIGlzQ29waWxvdFJlYXNvbmluZ0VmZm9ydCh0aGlua2luZ0xldmVsKSA/IHRoaW5raW5nTGV2ZWwgOiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogUmVzb2x2ZXMgdGhlIHJlYXNvbmluZyBlZmZvcnQsIGFwcGx5aW5nIHRoZSBob3N0LWxldmVsIG92ZXJyaWRlIGFuZCBsb2dnaW5nXG4gKiB3aGV0aGVyIGl0IGFwcGxpZWQuIFNoYXJlZCBieSB0aGUgbGF1bmNoZXIgKGNyZWF0ZSkgYW5kXG4gKiBgQ29waWxvdEFnZW50Ll9jaGFuZ2VNb2RlbGAgKG1pZC1zZXNzaW9uIG1vZGVsIGNoYW5nZSkgZm9yIGNvbnNpc3RlbmN5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUNvcGlsb3RSZWFzb25pbmdFZmZvcnQobW9kZWw6IE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkLCBjb25maWd1cmF0aW9uU2VydmljZTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLCBzZXNzaW9uSWQ6IHN0cmluZyk6IFNlc3Npb25Db25maWdbJ3JlYXNvbmluZ0VmZm9ydCddIHtcblx0Y29uc3QgcmF3T3ZlcnJpZGUgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUoY29waWxvdENsaUNvbmZpZ1NjaGVtYSwgQ29waWxvdENsaUNvbmZpZ0tleS5SZWFzb25pbmdFZmZvcnRPdmVycmlkZSk7XG5cdC8vICcnIGlzIHRoZSBzY2hlbWEncyB1bnNldCBtYXJrZXIsIHNvIGFuIHVuc2V0IG92ZXJyaWRlIHJlYWRzIGFzIGB1bmRlZmluZWRgLlxuXHRjb25zdCBvdmVycmlkZSA9IHJhd092ZXJyaWRlID8gcmF3T3ZlcnJpZGUgOiB1bmRlZmluZWQ7XG5cdGlmIChvdmVycmlkZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0aWYgKGlzQ29waWxvdFJlYXNvbmluZ0VmZm9ydChvdmVycmlkZSkpIHtcblx0XHRcdGxvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBBcHBseWluZyByZWFzb25pbmctZWZmb3J0IG92ZXJyaWRlICcke292ZXJyaWRlfSdgKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIElnbm9yaW5nIGludmFsaWQgcmVhc29uaW5nLWVmZm9ydCBvdmVycmlkZSAnJHtvdmVycmlkZX0nOyBleHBlY3RlZCBvbmUgb2YgWyR7UmVhc29uaW5nRWZmb3J0cy5qb2luKCcsICcpfV1gKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGdldENvcGlsb3RSZWFzb25pbmdFZmZvcnQobW9kZWwsIG92ZXJyaWRlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvcGlsb3RDb250ZXh0VGllcihtb2RlbDogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQsIGxvbmdDb250ZXh0V2luZG93PzogbnVtYmVyLCBmcmVlTG9uZ0NvbnRleHQ/OiBib29sZWFuKTogU2Vzc2lvbkNvbmZpZ1snY29udGV4dFRpZXInXSB7XG5cdC8vIExlZ2FjeSBwZXJzaXN0ZWQgc2VsZWN0aW9ucyBzdG9yZWQgdGhlIHJlc29sdmVkIHRpZXIgc3RyaW5nIGRpcmVjdGx5IHVuZGVyIHRoZSBkZXByZWNhdGVkIGtleS5cblx0Y29uc3QgbGVnYWN5VGllciA9IG1vZGVsPy5jb25maWc/LltDb250ZXh0VGllckNvbmZpZ0tleV07XG5cdGlmIChpc0NvbnRleHRUaWVyKGxlZ2FjeVRpZXIpKSB7XG5cdFx0cmV0dXJuIGxlZ2FjeVRpZXI7XG5cdH1cblx0Ly8gVGhlIFwiQ29udGV4dCBTaXplXCIgcGlja2VyIGV4cG9zZXMgbnVtZXJpYyB0b2tlbi1jb3VudCBlbnVtIHZhbHVlcywgc28gYSBjdXJyZW50IHNlbGVjdGlvbiBhcnJpdmVzXG5cdC8vIHVuZGVyIGBjb250ZXh0U2l6ZWAgYXMgYSB0b2tlbiBjb3VudC4gTWFwIGl0IHRvIHRoZSBTREsncyB0d28tdmFsdWVkIHRpZXIgdXNpbmcgdGhlIG1vZGVsJ3Ncblx0Ly8gbG9uZy1jb250ZXh0IHdpbmRvdzogb25seSBhIHNlbGVjdGlvbiB0aGF0IHJlYWNoZXMgdGhhdCB3aW5kb3cgb3B0cyBpbnRvIGBsb25nX2NvbnRleHRgLiBXaXRob3V0XG5cdC8vIHRoZSB3aW5kb3cgKG1vZGVsIGV4cG9zZXMgbm8gcGlja2VyLCBvciB0aGUgbW9kZWwgbGlzdCBpc24ndCBsb2FkZWQpIGxlYXZlIHRoZSBTREsgb24gaXRzIGRlZmF1bHRcblx0Ly8gdGllci5cblx0Y29uc3QgY29udGV4dFNpemUgPSBtb2RlbD8uY29uZmlnPy5bQ29udGV4dFNpemVDb25maWdLZXldO1xuXHRpZiAoY29udGV4dFNpemUgPT09IHVuZGVmaW5lZCkge1xuXHRcdC8vIFdoZW4gdGhlIG1vZGVsJ3MgbG9uZy1jb250ZXh0IHRpZXIgY29zdHMgdGhlIHNhbWUgYXMgdGhlIGRlZmF1bHQgdGllcixcblx0XHQvLyBhbHdheXMgb3B0IGludG8gbG9uZ19jb250ZXh0IFx1MjAxNCBubyBwaWNrZXIgaXMgc2hvd24gYW5kIHRoZSB1c2VyIGdldHMgdGhlXG5cdFx0Ly8gbGFyZ2VyIHdpbmRvdyBmb3IgZnJlZS5cblx0XHRyZXR1cm4gZnJlZUxvbmdDb250ZXh0ID8gJ2xvbmdfY29udGV4dCcgOiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgc2VsZWN0ZWRXaW5kb3cgPSBOdW1iZXIoY29udGV4dFNpemUpO1xuXHRpZiAoIU51bWJlci5pc0Zpbml0ZShzZWxlY3RlZFdpbmRvdykgfHwgdHlwZW9mIGxvbmdDb250ZXh0V2luZG93ICE9PSAnbnVtYmVyJykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHNlbGVjdGVkV2luZG93ID49IGxvbmdDb250ZXh0V2luZG93ID8gJ2xvbmdfY29udGV4dCcgOiAnZGVmYXVsdCc7XG59XG5cbi8qKlxuICogUmVzb2x2ZSB0aGUgQllPSyBwcm92aWRlci9tb2RlbCBzZXNzaW9uIGNvbmZpZyBmb3IgYHNlc3Npb25JZGAgZnJvbSB0aGVcbiAqIHJlbmRlcmVyJ3MgYWN0aXZlIGJyaWRnZS4gUmV0dXJucyBlbXB0eSBcdTIwMTQgdGhlIHNlc3Npb24gbGF1bmNoZXMgd2l0aG91dCBCWU9LXG4gKiBtb2RlbHMgXHUyMDE0IHdoZW4gQllPSyBpcyBnYXRlZCBvZmYgKG5vIGFjdGl2ZSBicmlkZ2UpLCB3aGVuIHRoZSByZW5kZXJlciByZXBvcnRzXG4gKiBubyBCWU9LIG1vZGVscywgb3Igd2hlbiBlbnVtZXJhdGlvbiBmYWlsczsgYHN0YXJ0UHJveHlgIGlzIGludm9rZWQgb25seSBvbmNlXG4gKiBhdCBsZWFzdCBvbmUgbW9kZWwgaXMgcHJlc2VudC5cbiAqXG4gKiBFYWNoIHZlbmRvciBtYXBzIHRvIG9uZSBgdHlwZTogJ29wZW5haSdgIC8gYHdpcmVBcGk6ICdyZXNwb25zZXMnYCBwcm92aWRlclxuICogd2hvc2UgYGJhc2VVcmxgIHBvaW50cyBhdCB0aGUgcHJveHkgYW5kIGF1dGhlbnRpY2F0ZXMgd2l0aCB0aGUgc2Vzc2lvbi1zY29wZWRcbiAqIGBCZWFyZXIgPG5vbmNlPi48c2Vzc2lvbklkPmA7IGVhY2ggbW9kZWwgaXMgc3VyZmFjZWQgdW5kZXIgdGhlXG4gKiBwcm92aWRlci1xdWFsaWZpZWQgc2VsZWN0aW9uIGlkIGB2ZW5kb3IvaWRgLCBtYXRjaGluZyB3aGF0IHRoZSByZW5kZXJlcidzXG4gKiBgQWdlbnRIb3N0Qnlva0xtSGFuZGxlcmAgcmVzb2x2ZXMuXG4gKlxuICogRXh0cmFjdGVkIGZyb20ge0BsaW5rIENvcGlsb3RTZXNzaW9uTGF1bmNoZXJ9IHNvIHRoZSBzeW50aGVzaXMgYW5kIGdhdGluZyBhcmVcbiAqIHVuaXQtdGVzdGFibGUgd2l0aG91dCBpbnN0YW50aWF0aW5nIHRoZSBsYXVuY2hlcjsgdGhlIGxhdW5jaGVyIHBhc3NlcyBhXG4gKiBgc3RhcnRQcm94eWAgdGh1bmsgdGhhdCBtZW1vaXplcyB0aGUgc2luZ2xlIHNoYXJlZCBwcm94eSBoYW5kbGUuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXNvbHZlQnlva1Nlc3Npb25Db25maWcoXG5cdHNlc3Npb25JZDogc3RyaW5nLFxuXHRicmlkZ2VSZWdpc3RyeTogSUJ5b2tMbUJyaWRnZVJlZ2lzdHJ5LFxuXHRzdGFydFByb3h5OiAoKSA9PiBQcm9taXNlPElCeW9rTG1Qcm94eUhhbmRsZT4sXG5cdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuKTogUHJvbWlzZTx7IHByb3ZpZGVycz86IE5hbWVkUHJvdmlkZXJDb25maWdbXTsgbW9kZWxzPzogUHJvdmlkZXJNb2RlbENvbmZpZ1tdIH0+IHtcblx0Ly8gU3VyZmFjZSB0aGUgc2VydmluZyB3aW5kb3cncyBCWU9LIG1vZGVscy4gVGhlIHJlZ2lzdHJ5IGRvZXMgbm90IHVuaW9uXG5cdC8vIHdpbmRvd3MnIG1vZGVsIHNldHMgXHUyMDE0IGFsbCBzZXJ2aW5nIHdpbmRvd3MgZXhwb3NlIHRoZSBzYW1lIHNldCwgc28gaXQgcGlja3Ncblx0Ly8gb25lIChzZWUgYElCeW9rTG1CcmlkZ2VSZWdpc3RyeWApIGFuZCB0aGUgcHJveHkgcm91dGVzIGluZmVyZW5jZSB0aGVyZS5cblx0bGV0IGJ5b2tNb2RlbHM6IElCeW9rTG1Nb2RlbEluZm9bXTtcblx0dHJ5IHtcblx0XHRieW9rTW9kZWxzID0gWy4uLmJyaWRnZVJlZ2lzdHJ5LmdldE1vZGVscygpXTtcblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0bG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIEZhaWxlZCB0byBlbnVtZXJhdGUgQllPSyBtb2RlbHMgZnJvbSByZW5kZXJlciBicmlkZ2VzYCwgZXJyKTtcblx0XHRyZXR1cm4ge307XG5cdH1cblx0aWYgKGJ5b2tNb2RlbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cdC8vIERlZHVwbGljYXRlIGJ5IHNlbGVjdGlvbiBpZCAoYHZlbmRvci9pZGApLiBUaGUgc2FtZSBCWU9LIG1vZGVsIGNhbiBiZVxuXHQvLyByZXBvcnRlZCBtb3JlIHRoYW4gb25jZSBcdTIwMTQgZS5nLiB3aGVuIHR3byByZW5kZXJlciBicmlkZ2VzIGFyZSB0cmFuc2llbnRseVxuXHQvLyBzZXJ2aW5nIGR1cmluZyBhIHdpbmRvdyBoYW5kLW9mZiAoY29udGludWluZyBhIGNoYXQgaW50byBhIG5ldyBzZXNzaW9uKSBcdTIwMTRcblx0Ly8gYW5kIHRoZSBydW50aW1lIHJlamVjdHMgYSBzZXNzaW9uIGNvbmZpZyB3aXRoIGR1cGxpY2F0ZSBCWU9LIG1vZGVsXG5cdC8vIHNlbGVjdGlvbiBpZHMgKFwiRHVwbGljYXRlIEJZT0sgbW9kZWwgc2VsZWN0aW9uIGlkIC4uLlwiKS5cblx0Y29uc3Qgc2VlblNlbGVjdGlvbklkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRieW9rTW9kZWxzID0gYnlva01vZGVscy5maWx0ZXIobSA9PiB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uSWQgPSBgJHttLnZlbmRvcn0vJHttLmlkfWA7XG5cdFx0aWYgKHNlZW5TZWxlY3Rpb25JZHMuaGFzKHNlbGVjdGlvbklkKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRzZWVuU2VsZWN0aW9uSWRzLmFkZChzZWxlY3Rpb25JZCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH0pO1xuXHQvLyBgc3RhcnRQcm94eWAgYmluZHMgYSBsb2NhbCBsb29wYmFjayBsaXN0ZW5lciBcdTIwMTQgdW5saWtlbHkgdG8gZmFpbCwgYnV0IGl0XG5cdC8vIG11c3QgbmV2ZXIgYnJlYWsgc2Vzc2lvbiBtYXRlcmlhbGl6YXRpb24gKHdoaWNoIGZpcmVzIHRoZSBjcm9zcy13aW5kb3dcblx0Ly8gYHNlc3Npb25BZGRlZGAgYnJvYWRjYXN0KS4gRGVncmFkZSB0byBubyBCWU9LIGNvbmZpZyBvbiBmYWlsdXJlLlxuXHRsZXQgaGFuZGxlOiBJQnlva0xtUHJveHlIYW5kbGU7XG5cdHRyeSB7XG5cdFx0aGFuZGxlID0gYXdhaXQgc3RhcnRQcm94eSgpO1xuXHR9IGNhdGNoIChlcnIpIHtcblx0XHRsb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gRmFpbGVkIHRvIHN0YXJ0IEJZT0sgbG9vcGJhY2sgcHJveHlgLCBlcnIpO1xuXHRcdHJldHVybiB7fTtcblx0fVxuXHRjb25zdCBwcm92aWRlcnM6IE5hbWVkUHJvdmlkZXJDb25maWdbXSA9IFsuLi5uZXcgU2V0KGJ5b2tNb2RlbHMubWFwKG0gPT4gbS52ZW5kb3IpKV0ubWFwKHZlbmRvciA9PiAoe1xuXHRcdG5hbWU6IHZlbmRvcixcblx0XHR0eXBlOiAnb3BlbmFpJyxcblx0XHR3aXJlQXBpOiAncmVzcG9uc2VzJyxcblx0XHRiYXNlVXJsOiBoYW5kbGUucHJvdmlkZXJCYXNlVXJsKHZlbmRvciksXG5cdFx0YmVhcmVyVG9rZW46IGAke2hhbmRsZS5ub25jZX0uJHtzZXNzaW9uSWR9YCxcblx0fSkpO1xuXHRjb25zdCBtb2RlbHM6IFByb3ZpZGVyTW9kZWxDb25maWdbXSA9IGJ5b2tNb2RlbHMubWFwKG0gPT4gKHtcblx0XHRpZDogbS5pZCxcblx0XHRwcm92aWRlcjogbS52ZW5kb3IsXG5cdFx0Li4uKG0ubmFtZSAhPT0gdW5kZWZpbmVkID8geyBuYW1lOiBtLm5hbWUgfSA6IHt9KSxcblx0XHQuLi4obS5tYXhDb250ZXh0V2luZG93VG9rZW5zICE9PSB1bmRlZmluZWQgPyB7IG1heENvbnRleHRXaW5kb3dUb2tlbnM6IG0ubWF4Q29udGV4dFdpbmRvd1Rva2VucyB9IDoge30pLFxuXHR9KSk7XG5cdGxvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBXaXJlZCAke21vZGVscy5sZW5ndGh9IEJZT0sgbW9kZWwocykgYWNyb3NzICR7cHJvdmlkZXJzLmxlbmd0aH0gcHJvdmlkZXIocykgdmlhIGxvb3BiYWNrIHByb3h5ICR7aGFuZGxlLmJhc2VVcmx9YCk7XG5cdHJldHVybiB7IHByb3ZpZGVycywgbW9kZWxzIH07XG59XG5cbmV4cG9ydCBjbGFzcyBDb3BpbG90U2Vzc2lvbkxhdW5jaGVyIGltcGxlbWVudHMgSUNvcGlsb3RTZXNzaW9uTGF1bmNoZXIge1xuXG5cdC8qKlxuXHQgKiBNZW1vaXplZCBoYW5kbGUgZm9yIHRoZSBzaW5nbGUgc2hhcmVkIEJZT0sgbG9vcGJhY2sgcHJveHksIHN0YXJ0ZWQgbGF6aWx5XG5cdCAqIG9uIHRoZSBmaXJzdCBzZXNzaW9uIGxhdW5jaCB0aGF0IHN1cmZhY2VzIEJZT0sgbW9kZWxzIChzZWVcblx0ICoge0BsaW5rIF9yZXNvbHZlQnlva1Nlc3Npb25Db25maWd9KS4gSGVsZCBhcyBhIHByb21pc2Ugc28gY29uY3VycmVudFxuXHQgKiBsYXVuY2hlcyBzaGFyZSBvbmUgYmluZC4gUmVsZWFzZWQgYW5kIGNsZWFyZWQgYnlcblx0ICoge0BsaW5rIGRpc3Bvc2VCeW9rUHJveHlIYW5kbGV9IHdoZW4gdGhlIG93bmluZyBDb3BpbG90IGNsaWVudC9ydW50aW1lIGlzXG5cdCAqIHN0b3BwZWQsIHNvIHRoZSBuZXh0IHN0YXJ0IG1pbnRzIGEgZnJlc2ggbm9uY2UuXG5cdCAqL1xuXHRwcml2YXRlIF9ieW9rUHJveHlIYW5kbGU6IFByb21pc2U8SUJ5b2tMbVByb3h5SGFuZGxlPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsTWFuYWdlcjogSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcixcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJQnlva0xtUHJveHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2J5b2tMbVByb3h5U2VydmljZTogSUJ5b2tMbVByb3h5U2VydmljZSxcblx0XHRASUJ5b2tMbUJyaWRnZVJlZ2lzdHJ5IHByaXZhdGUgcmVhZG9ubHkgX2J5b2tMbUJyaWRnZVJlZ2lzdHJ5OiBJQnlva0xtQnJpZGdlUmVnaXN0cnksXG5cdCkgeyB9XG5cblx0YXN5bmMgbGF1bmNoKHBsYW46IENvcGlsb3RTZXNzaW9uTGF1bmNoUGxhbiwgcnVudGltZTogSUNvcGlsb3RTZXNzaW9uUnVudGltZSk6IFByb21pc2U8Q29waWxvdFNlc3Npb25XcmFwcGVyPiB7XG5cdFx0Y29uc3QgY29uZmlnID0gYXdhaXQgdGhpcy5fYnVpbGRTZXNzaW9uQ29uZmlnKHBsYW4sIHJ1bnRpbWUpO1xuXHRcdGNvbnN0IHNhbmRib3hDb25maWcgPSB0aGlzLl9jb21wdXRlU2FuZGJveENvbmZpZygpO1xuXHRcdGlmIChwbGFuLmtpbmQgPT09ICdjcmVhdGUnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlU2Vzc2lvbihwbGFuLCBjb25maWcsIHNhbmRib3hDb25maWcpO1xuXHRcdH1cblxuXHRcdGxldCBmYWxsYmFja1BsYW4gPSBwbGFuO1xuXHRcdGxldCBmYWxsYmFja0NvbmZpZyA9IGNvbmZpZztcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc3RvcFdhdGNoID0gbmV3IFN0b3BXYXRjaCgpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtwbGFuLnNlc3Npb25JZH1dIENhbGxpbmcgU0RLIHJlc3VtZVNlc3Npb24uLi5gKTtcblx0XHRcdGNvbnN0IHJhdyA9IGF3YWl0IHBsYW4uY2xpZW50LnJlc3VtZVNlc3Npb24ocGxhbi5zZXNzaW9uSWQsIGNvbmZpZyk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3BsYW4uc2Vzc2lvbklkfV0gU0RLIHJlc3VtZVNlc3Npb24gc3VjY2VlZGVkIGFmdGVyICR7c3RvcFdhdGNoLmVsYXBzZWQoKX1tc2ApO1xuXHRcdFx0YXdhaXQgdGhpcy5fYXBwbHlTYW5kYm94Q29uZmlnKHJhdywgc2FuZGJveENvbmZpZywgcGxhbi5zZXNzaW9uSWQpO1xuXHRcdFx0cmV0dXJuIG5ldyBDb3BpbG90U2Vzc2lvbldyYXBwZXIocmF3KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGxldCByZXN1bWVFcnJvciA9IGVycjtcblx0XHRcdGNvbnN0IGVyckNvZGUgPSBnZXRDb3BpbG90U2RrRXJyb3JDb2RlKHJlc3VtZUVycm9yKTtcblx0XHRcdGNvbnN0IGVyck1zZyA9IGdldEVycm9yTWVzc2FnZShyZXN1bWVFcnJvcik7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7cGxhbi5zZXNzaW9uSWR9XSBTREsgcmVzdW1lU2Vzc2lvbiBmYWlsZWQ6IGNvZGU9JHtlcnJDb2RlfSwgbWVzc2FnZT0ke2Vyck1zZ31gKTtcblx0XHRcdGlmIChwbGFuLnJlc29sdmVkQWdlbnROYW1lICYmIGlzQ3VzdG9tQWdlbnROb3RGb3VuZEVycm9yKHJlc3VtZUVycm9yKSkge1xuXHRcdFx0XHRmYWxsYmFja1BsYW4gPSB7IC4uLnBsYW4sIHJlc29sdmVkQWdlbnROYW1lOiB1bmRlZmluZWQgfTtcblx0XHRcdFx0ZmFsbGJhY2tDb25maWcgPSB7IC4uLmNvbmZpZywgYWdlbnQ6IHVuZGVmaW5lZCB9O1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7cGxhbi5zZXNzaW9uSWR9XSBTdG9yZWQgY3VzdG9tIGFnZW50ICcke3BsYW4ucmVzb2x2ZWRBZ2VudE5hbWV9JyB3YXMgbm90IGZvdW5kOyByZXRyeWluZyByZXN1bWUgd2l0aG91dCBhIGN1c3RvbSBhZ2VudGApO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHJhdyA9IGF3YWl0IGZhbGxiYWNrUGxhbi5jbGllbnQucmVzdW1lU2Vzc2lvbihmYWxsYmFja1BsYW4uc2Vzc2lvbklkLCBmYWxsYmFja0NvbmZpZyk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fYXBwbHlTYW5kYm94Q29uZmlnKHJhdywgc2FuZGJveENvbmZpZywgcGxhbi5zZXNzaW9uSWQpO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgQ29waWxvdFNlc3Npb25XcmFwcGVyKHJhdyk7XG5cdFx0XHRcdH0gY2F0Y2ggKHJldHJ5RXJyKSB7XG5cdFx0XHRcdFx0cmVzdW1lRXJyb3IgPSByZXRyeUVycjtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7cGxhbi5zZXNzaW9uSWR9XSBTREsgcmVzdW1lU2Vzc2lvbiB3aXRob3V0IGN1c3RvbSBhZ2VudCBmYWlsZWQ6IGNvZGU9JHtnZXRDb3BpbG90U2RrRXJyb3JDb2RlKHJldHJ5RXJyKX0sIG1lc3NhZ2U9JHtnZXRFcnJvck1lc3NhZ2UocmV0cnlFcnIpfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBUaGUgU0RLIGZhaWxzIHRvIHJlc3VtZSBzZXNzaW9ucyB0aGF0IGhhdmUgbm8gbWVzc2FnZXMuXG5cdFx0XHQvLyBGYWxsIGJhY2sgdG8gY3JlYXRpbmcgYSBuZXcgc2Vzc2lvbiB3aXRoIHRoZSBzYW1lIElELFxuXHRcdFx0Ly8gc2VlZGluZyBtb2RlbCAmIHdvcmtpbmcgZGlyZWN0b3J5IGZyb20gc3RvcmVkIG1ldGFkYXRhLlxuXHRcdFx0aWYgKCFzaG91bGRDcmVhdGVFbXB0eVNlc3Npb25BZnRlclJlc3VtZUVycm9yKHJlc3VtZUVycm9yKSkge1xuXHRcdFx0XHR0aHJvdyByZXN1bWVFcnJvcjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3BsYW4uc2Vzc2lvbklkfV0gUmVzdW1lIGZhaWxlZCAoY29kZT0tMzI2MDMpLCBmYWxsaW5nIGJhY2sgdG8gY3JlYXRlU2Vzc2lvbiB3aXRoIHNhbWUgSURgKTtcblx0XHRcdGNvbnN0IHdyYXBwZXIgPSBhd2FpdCB0aGlzLl9jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0Li4uZmFsbGJhY2tQbGFuLFxuXHRcdFx0XHRraW5kOiAnY3JlYXRlJyxcblx0XHRcdFx0bW9kZWw6IGZhbGxiYWNrUGxhbi5mYWxsYmFjay5tb2RlbCxcblx0XHRcdFx0bG9uZ0NvbnRleHRXaW5kb3c6IGZhbGxiYWNrUGxhbi5mYWxsYmFjay5sb25nQ29udGV4dFdpbmRvdyxcblx0XHRcdFx0ZnJlZUxvbmdDb250ZXh0OiBmYWxsYmFja1BsYW4uZmFsbGJhY2suZnJlZUxvbmdDb250ZXh0LFxuXHRcdFx0fSwgZmFsbGJhY2tDb25maWcsIHNhbmRib3hDb25maWcpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3BsYW4uc2Vzc2lvbklkfV0gRmFsbGJhY2sgY3JlYXRlU2Vzc2lvbiBzdWNjZWVkZWRgKTtcblx0XHRcdHJldHVybiB3cmFwcGVyO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZVNlc3Npb24ocGxhbjogSUNvcGlsb3RDcmVhdGVTZXNzaW9uTGF1bmNoUGxhbiwgY29uZmlnOiBDb3BpbG90U2Vzc2lvbkxhdW5jaENvbmZpZywgc2FuZGJveENvbmZpZzogSVNka1NhbmRib3hDb25maWcgfCB1bmRlZmluZWQpOiBQcm9taXNlPENvcGlsb3RTZXNzaW9uV3JhcHBlcj4ge1xuXHRcdGNvbnN0IHJhdyA9IGF3YWl0IHBsYW4uY2xpZW50LmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0Li4uY29uZmlnLFxuXHRcdFx0c2Vzc2lvbklkOiBwbGFuLnNlc3Npb25JZCxcblx0XHRcdHN0cmVhbWluZzogdHJ1ZSxcblx0XHRcdG1vZGVsOiBwbGFuLm1vZGVsPy5pZCxcblx0XHRcdHJlYXNvbmluZ0VmZm9ydDogcmVzb2x2ZUNvcGlsb3RSZWFzb25pbmdFZmZvcnQocGxhbi5tb2RlbCwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX2xvZ1NlcnZpY2UsIHBsYW4uc2Vzc2lvbklkKSxcblx0XHRcdGNvbnRleHRUaWVyOiBnZXRDb3BpbG90Q29udGV4dFRpZXIocGxhbi5tb2RlbCwgcGxhbi5sb25nQ29udGV4dFdpbmRvdywgcGxhbi5mcmVlTG9uZ0NvbnRleHQpLFxuXHRcdFx0Li4uKHBsYW4ucmVzb2x2ZWRBZ2VudE5hbWUgPyB7IGFnZW50OiBwbGFuLnJlc29sdmVkQWdlbnROYW1lIH0gOiB7fSksXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBwbGFuLndvcmtpbmdEaXJlY3Rvcnk/LmZzUGF0aCxcblx0XHR9KTtcblx0XHRhd2FpdCB0aGlzLl9hcHBseVNhbmRib3hDb25maWcocmF3LCBzYW5kYm94Q29uZmlnLCBwbGFuLnNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIG5ldyBDb3BpbG90U2Vzc2lvbldyYXBwZXIocmF3KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlIHRoZSBTREstc2hhcGVkIHNhbmRib3ggcG9saWN5IHRvIHB1c2ggdG8gdGhlIHJ1bnRpbWUgZm9yIHRoZVxuXHQgKiBTREsncyBidWlsdC1pbiBzaGVsbCB0b29sLlxuXHQgKlxuXHQgKiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4ge0BsaW5rIENvcGlsb3RDbGlDb25maWdLZXkuRW5hYmxlQ3VzdG9tVGVybWluYWxUb29sfVxuXHQgKiBpcyBPTiBcdTIwMTQgaW4gdGhhdCBjYXNlIHRoZSBBZ2VudEhvc3QgcHJvdmlkZXMgaXRzIG93biBzaGVsbCB0b29scywgd2hpY2hcblx0ICogd3JhcCBjb21tYW5kcyB2aWEgdGhlIGhvc3QgdGVybWluYWwgc2FuZGJveCBlbmdpbmUsIHNvIG5vIFNESy1zaWRlXG5cdCAqIHNhbmRib3ggcG9saWN5IGlzIG5lZWRlZC4gT3RoZXJ3aXNlIHRoZSBwb2xpY3kgaXMgZGVyaXZlZCBmcm9tIHRoZVxuXHQgKiBob3N0J3MgYHNhbmRib3hgIGNvbmZpZyBiYWcgKGZvcndhcmRlZCBmcm9tIHRoZSB3b3JrYmVuY2gnc1xuXHQgKiBgY2hhdC5hZ2VudC5zYW5kYm94LipgIHNldHRpbmdzKSwgbWlycm9yaW5nIHdoYXRcblx0ICogYGJ1aWxkU2FuZGJveENvbmZpZ0ZvckNMSWAgZG9lcyBmb3IgdGhlIENvcGlsb3QgZXh0ZW5zaW9uJ3MgQ0xJIHBhdGguXG5cdCAqL1xuXHRwcml2YXRlIF9jb21wdXRlU2FuZGJveENvbmZpZygpOiBJU2RrU2FuZGJveENvbmZpZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZW5hYmxlQ3VzdG9tVGVybWluYWxUb29sID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKGNvcGlsb3RDbGlDb25maWdTY2hlbWEsIENvcGlsb3RDbGlDb25maWdLZXkuRW5hYmxlQ3VzdG9tVGVybWluYWxUb29sKSA9PT0gdHJ1ZTtcblx0XHRpZiAoZW5hYmxlQ3VzdG9tVGVybWluYWxUb29sKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gYnVpbGRTYW5kYm94Q29uZmlnRm9yU2RrKHByb2Nlc3MucGxhdGZvcm0sIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShzYW5kYm94Q29uZmlnU2NoZW1hLCBBZ2VudEhvc3RTYW5kYm94Q29uZmlnS2V5LlNhbmRib3gpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGb3J3YXJkIHRoZSBTREstc2hhcGVkIHNhbmRib3ggcG9saWN5IHRvIHRoZSBydW50aW1lIHZpYVxuXHQgKiBgc2Vzc2lvbi5vcHRpb25zLnVwZGF0ZWAsIGltbWVkaWF0ZWx5IGFmdGVyIHRoZSBzZXNzaW9uIGlzIGNyZWF0ZWQgb3Jcblx0ICogcmVzdW1lZC4gYFNlc3Npb25VcGRhdGVPcHRpb25zUGFyYW1zLnNhbmRib3hDb25maWdgIGlzIG5vdyB0eXBlZCBieSB0aGVcblx0ICogU0RLIChhcyBgU2FuZGJveENvbmZpZ2ApLCBhbmQgb3VyIHtAbGluayBJU2RrU2FuZGJveENvbmZpZ30gc2hhcGUgaXNcblx0ICogc3RydWN0dXJhbGx5IGFzc2lnbmFibGUgdG8gaXQsIHNvIHdlIGZvcndhcmQgaXQgZGlyZWN0bHkuXG5cdCAqXG5cdCAqIE5vLW9wIHdoZW4ge0BsaW5rIF9jb21wdXRlU2FuZGJveENvbmZpZ30gcmV0dXJuZWQgYHVuZGVmaW5lZGAgKGN1c3RvbVxuXHQgKiB0ZXJtaW5hbCB0b29sIGVuYWJsZWQsIG9yIHRoZSBob3N0IHNhbmRib3ggY29uZmlnIGV2YWx1YXRlcyB0byBkaXNhYmxlZCkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9hcHBseVNhbmRib3hDb25maWcoc2Vzc2lvbjogQ29waWxvdFNlc3Npb25XcmFwcGVyWydzZXNzaW9uJ10sIHNhbmRib3hDb25maWc6IElTZGtTYW5kYm94Q29uZmlnIHwgdW5kZWZpbmVkLCBzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghc2FuZGJveENvbmZpZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2Vzc2lvbi5ycGMub3B0aW9ucy51cGRhdGUoeyBzYW5kYm94Q29uZmlnIH0pO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIEFwcGxpZWQgU0RLIHNhbmRib3hDb25maWcgdmlhIHNlc3Npb24ub3B0aW9ucy51cGRhdGVgKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBGYWlsZWQgdG8gYXBwbHkgU0RLIHNhbmRib3hDb25maWdgLCBlcnIpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBMYXVuY2hlci1ib3VuZCB3cmFwcGVyIG92ZXIge0BsaW5rIHJlc29sdmVCeW9rU2Vzc2lvbkNvbmZpZ306IHN1cHBsaWVzIHRoZVxuXHQgKiBhY3RpdmUgYnJpZGdlIHJlZ2lzdHJ5IGFuZCBhIGBzdGFydFByb3h5YCB0aHVuayB0aGF0IG1lbW9pemVzIHRoZSBzaW5nbGVcblx0ICogc2hhcmVkIHByb3h5IGhhbmRsZSBmb3IgdGhpcyBsYXVuY2hlciAoc3RhcnRlZCBsYXppbHkgb24gZmlyc3QgdXNlKS5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVCeW9rU2Vzc2lvbkNvbmZpZyhzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8eyBwcm92aWRlcnM/OiBOYW1lZFByb3ZpZGVyQ29uZmlnW107IG1vZGVscz86IFByb3ZpZGVyTW9kZWxDb25maWdbXSB9PiB7XG5cdFx0cmV0dXJuIHJlc29sdmVCeW9rU2Vzc2lvbkNvbmZpZyhzZXNzaW9uSWQsIHRoaXMuX2J5b2tMbUJyaWRnZVJlZ2lzdHJ5LCAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2J5b2tQcm94eUhhbmRsZSkge1xuXHRcdFx0XHR0aGlzLl9ieW9rUHJveHlIYW5kbGUgPSB0aGlzLl9ieW9rTG1Qcm94eVNlcnZpY2Uuc3RhcnQoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl9ieW9rUHJveHlIYW5kbGU7XG5cdFx0fSwgdGhpcy5fbG9nU2VydmljZSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVsZWFzZSB0aGUgbWVtb2l6ZWQgQllPSyBsb29wYmFjayBwcm94eSBoYW5kbGUgKGlmIGFueSkgYW5kIGNsZWFyIGl0IHNvXG5cdCAqIHRoZSBuZXh0IHNlc3Npb24gbGF1bmNoIG1pbnRzIGEgZnJlc2ggbm9uY2UuIElkZW1wb3RlbnQuXG5cdCAqXG5cdCAqICoqT3duZXJzaGlwIGludmFyaWFudC4qKiBUaGUgY2FsbGVyIE1VU1Qgc3RvcCB0aGUgQ29waWxvdCBjbGllbnQvcnVudGltZVxuXHQgKiBzdWJwcm9jZXNzIGJlZm9yZSBpbnZva2luZyB0aGlzOiBkaXNwb3NpbmcgdGhlIGhhbmRsZSBkcm9wcyB0aGUgcHJveHknc1xuXHQgKiByZWZjb3VudCBhbmQgbWF5IHJlYmluZCBpdCBvbiBhIGRpZmZlcmVudCBwb3J0L25vbmNlLCBzbyBhIHN0aWxsLXJ1bm5pbmdcblx0ICogc3VicHJvY2VzcyB3b3VsZCBzaWxlbnRseSBsb3NlIGl0cyBlbmRwb2ludCBcdTIwMTQgc2VlIHtAbGluayBJQnlva0xtUHJveHlIYW5kbGV9LlxuXHQgKiBJbnZva2VkIGZyb20gYENvcGlsb3RBZ2VudC5fc3RvcENsaWVudGAgLyBgQ29waWxvdEFnZW50LnNodXRkb3duYCBhZnRlciB0aGVcblx0ICogY2xpZW50IGhhcyBzdG9wcGVkLlxuXHQgKi9cblx0YXN5bmMgZGlzcG9zZUJ5b2tQcm94eUhhbmRsZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9ieW9rUHJveHlIYW5kbGU7XG5cdFx0dGhpcy5fYnlva1Byb3h5SGFuZGxlID0gdW5kZWZpbmVkO1xuXHRcdGlmICghaGFuZGxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHQoYXdhaXQgaGFuZGxlKS5kaXNwb3NlKCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBUaGUgbGF6eSBgc3RhcnQoKWAgcmVqZWN0ZWQ7IHRoZXJlIGlzIG5vdGhpbmcgdG8gcmVsZWFzZS5cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9idWlsZFNlc3Npb25Db25maWcocGxhbjogQ29waWxvdFNlc3Npb25MYXVuY2hQbGFuLCBydW50aW1lOiBJQ29waWxvdFNlc3Npb25SdW50aW1lKTogUHJvbWlzZTxDb3BpbG90U2Vzc2lvbkxhdW5jaENvbmZpZz4ge1xuXHRcdGNvbnN0IHBsdWdpbnMgPSBwbGFuLnNuYXBzaG90LnBsdWdpbnM7XG5cdFx0Ly8gU3ludGhlc2l6ZSBCWU9LIHByb3ZpZGVyL21vZGVsIGNvbmZpZyAoZW1wdHkgd2hlbiBCWU9LIGlzIGdhdGVkIG9mZiBvciB0aGVcblx0XHQvLyByZW5kZXJlciByZXBvcnRzIG5vIEJZT0sgbW9kZWxzKSwgbWVyZ2VkIGludG8gdGhlIHJldHVybmVkIGNvbmZpZyBzbyBib3RoXG5cdFx0Ly8gY3JlYXRlU2Vzc2lvbiBhbmQgcmVzdW1lU2Vzc2lvbiBhZHZlcnRpc2UgdGhlIG1vZGVscyB0byB0aGUgcnVudGltZS5cblx0XHRjb25zdCBieW9rID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUJ5b2tTZXNzaW9uQ29uZmlnKHBsYW4uc2Vzc2lvbklkKTtcblx0XHRjb25zdCBlbmFibGVDdXN0b21UZXJtaW5hbFRvb2wgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUoY29waWxvdENsaUNvbmZpZ1NjaGVtYSwgQ29waWxvdENsaUNvbmZpZ0tleS5FbmFibGVDdXN0b21UZXJtaW5hbFRvb2wpID09PSB0cnVlO1xuXHRcdGxldCBzaGVsbFRvb2xzOiBBd2FpdGVkPFJldHVyblR5cGU8dHlwZW9mIGNyZWF0ZVNoZWxsVG9vbHM+PiA9IFtdO1xuXHRcdGlmIChlbmFibGVDdXN0b21UZXJtaW5hbFRvb2wpIHtcblx0XHRcdGlmICghcGxhbi5zaGVsbE1hbmFnZXIpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBTaGVsbE1hbmFnZXIgaXMgcmVxdWlyZWQgdG8gbGF1bmNoIENvcGlsb3Qgc2Vzc2lvbiAnJHtwbGFuLnNlc3Npb25JZH0nYCk7XG5cdFx0XHR9XG5cdFx0XHRzaGVsbFRvb2xzID0gYXdhaXQgY3JlYXRlU2hlbGxUb29scyhwbGFuLnNoZWxsTWFuYWdlciwgdGhpcy5fdGVybWluYWxNYW5hZ2VyLCB0aGlzLl9sb2dTZXJ2aWNlLCByZXF1ZXN0ID0+IHJ1bnRpbWUucmVxdWVzdFVuc2FuZGJveGVkQ29tbWFuZENvbmZpcm1hdGlvbihyZXF1ZXN0KSk7XG5cdFx0fVxuXHRcdC8vIFJlbHkgb24gdGhlIFNESyB0byBkaXNjb3ZlciBtb3N0IGFnZW50cy9za2lsbHMvZXRjLiBmcm9tIGBwbHVnaW5EaXJlY3Rvcmllc2Bcblx0XHQvLyBpbnN0ZWFkIG9mIGZlZWRpbmcgdGhlbSBleHBsaWNpdGx5LCB0byBhdm9pZCBkdXBsaWNhdGVzLiBDdXN0b20gYWdlbnRzIGFyZSB0aGVcblx0XHQvLyBleGNlcHRpb246IHRoZSBTREsgdmFsaWRhdGVzIHRoZSBzZXNzaW9uLXN0YXJ0IGBhZ2VudDpgIGFnYWluc3QgYGN1c3RvbUFnZW50c2Bcblx0XHQvLyBieSBuYW1lLCBzbyB0aGUgc2VsZWN0ZWQgYWdlbnQgaXMgZm9yY2UtaW5jbHVkZWQgKHNlZSBgdG9TZGtTZXNzaW9uQ3VzdG9tQWdlbnRzYCkuXG5cdFx0Y29uc3QgcGx1Z2luc1dpdGhvdXREaXJzID0gcGx1Z2lucy5maWx0ZXIocCA9PiAhcC5wbHVnaW5EaXIgfHwgcC5wbHVnaW5EaXIuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUpO1xuXHRcdGNvbnN0IGN1c3RvbUFnZW50cyA9IGF3YWl0IHRvU2RrU2Vzc2lvbkN1c3RvbUFnZW50cyhwbHVnaW5zLCBwbGFuLnJlc29sdmVkQWdlbnROYW1lLCB0aGlzLl9maWxlU2VydmljZSk7XG5cdFx0Y29uc3Qgc2tpbGxEaXJlY3RvcmllcyA9IHRvU2RrU2tpbGxEaXJlY3RvcmllcyhwbHVnaW5zV2l0aG91dERpcnMuZmxhdE1hcChwID0+IHAuc2tpbGxzKSk7XG5cdFx0Y29uc3QgaW5zdHJ1Y3Rpb25EaXJlY3RvcmllcyA9IHRvU2RrSW5zdHJ1Y3Rpb25EaXJlY3RvcmllcyhwbHVnaW5zLmZsYXRNYXAocCA9PiBwLmluc3RydWN0aW9ucykpO1xuXHRcdGNvbnN0IG1vZGVsID0gcGxhbi5raW5kID09PSAnY3JlYXRlJyA/IHBsYW4ubW9kZWwgOiBwbGFuLmZhbGxiYWNrLm1vZGVsO1xuXHRcdGNvbnN0IGNsaWVudFRvb2xOYW1lcyA9IGNsaWVudFRvb2xOYW1lc0Zyb21TbmFwc2hvdChwbGFuLnNuYXBzaG90KTtcblx0XHQvLyBQcm9tcHQgcm91dGluZyBhbmQgY2FwYWJpbGl0eSBkZWNpc2lvbnMgdXNlIHRoZSBmYW1pbHktYWxpYXNlZFxuXHRcdC8vIHNlbGVjdGlvbjsgdGhlIHdpcmUgbW9kZWwgaWQgaW4gX2NyZWF0ZVNlc3Npb24gY29tZXMgZnJvbSBwbGFuLm1vZGVsXG5cdFx0Ly8gYW5kIGlzIHVuYWZmZWN0ZWQuXG5cdFx0Y29uc3QgZWZmZWN0aXZlTW9kZWwgPSBhcHBseU1vZGVsRmFtaWx5QWxpYXMobW9kZWwsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShjb3BpbG90Q2xpQ29uZmlnU2NoZW1hLCBDb3BpbG90Q2xpQ29uZmlnS2V5Lk1vZGVsQ2FwYWJpbGl0eU92ZXJyaWRlcykpO1xuXHRcdGlmIChtb2RlbCAmJiBlZmZlY3RpdmVNb2RlbCAhPT0gbW9kZWwpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtwbGFuLnNlc3Npb25JZH1dIE1vZGVsIGNhcGFiaWxpdHkgb3ZlcnJpZGU6IHJvdXRpbmcgcHJvbXB0IGZvciAnJHttb2RlbC5pZH0nIGFzIGZhbWlseSAnJHtlZmZlY3RpdmVNb2RlbD8uaWR9J2ApO1xuXHRcdH1cblx0XHRjb25zdCB0b29sU2VhcmNoQWN0aXZlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKGNvcGlsb3RDbGlDb25maWdTY2hlbWEsIENvcGlsb3RDbGlDb25maWdLZXkuVG9vbFNlYXJjaEVuYWJsZWQpID09PSB0cnVlXG5cdFx0XHQmJiBhZ2VudEhvc3RNb2RlbFN1cHBvcnRzVG9vbFNlYXJjaChlZmZlY3RpdmVNb2RlbD8uaWQpXG5cdFx0XHQmJiBjbGllbnRUb29sTmFtZXMuaGFzKENMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRSk7XG5cdFx0Y29uc3QgdG9vbFNlYXJjaERlZmVyVGhyZXNob2xkID0gbm9ybWFsaXplVG9vbFNlYXJjaERlZmVyVGhyZXNob2xkKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShjb3BpbG90Q2xpQ29uZmlnU2NoZW1hLCBDb3BpbG90Q2xpQ29uZmlnS2V5LlRvb2xTZWFyY2hEZWZlclRocmVzaG9sZCkpO1xuXHRcdGNvbnN0IHByb21wdENvbnRleHQ6IElBZ2VudEhvc3RQcm9tcHRDb250ZXh0ID0ge1xuXHRcdFx0Z2V0U2V0dGluZzoga2V5ID0+IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShjb3BpbG90Q2xpQ29uZmlnU2NoZW1hLCBrZXkpLFxuXHRcdFx0aGFzQ2xpZW50VG9vbDogbmFtZSA9PiBjbGllbnRUb29sTmFtZXMuaGFzKG5hbWUpLFxuXHRcdFx0d29ya3NwYWNlbGVzczogcGxhbi53b3Jrc3BhY2VsZXNzID09PSB0cnVlLFxuXHRcdFx0dG9vbFNlYXJjaEFjdGl2ZSxcblx0XHR9O1xuXHRcdC8vIFJlc29sdmVkIG9uY2UgcGVyIChyZSlsYXVuY2ggXHUyMDE0IHRoZSBTREsgaGFzIG5vIG1pZC1zZXNzaW9uIHN5c3RlbS1tZXNzYWdlXG5cdFx0Ly8gdXBkYXRlLCBzbyB0aGlzIHJlZmxlY3RzIHRoZSBtb2RlbC90b29scy9zZXR0aW5ncyBhdCBsYXVuY2ggdGltZS4gTG9nIGFcblx0XHQvLyBzdW1tYXJ5IGF0IGluZm8gZm9yIHByb21wdCBvYnNlcnZhYmlsaXR5OyB0aGUgZnVsbCBjb25maWcgYXQgdHJhY2UuXG5cdFx0Y29uc3Qgc3lzdGVtTWVzc2FnZSA9IGFnZW50SG9zdFByb21wdFJlZ2lzdHJ5LnJlc29sdmVTeXN0ZW1NZXNzYWdlQ29uZmlnKGVmZmVjdGl2ZU1vZGVsLCBwcm9tcHRDb250ZXh0KTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7cGxhbi5zZXNzaW9uSWR9XSBSZXNvbHZlZCBzeXN0ZW0gbWVzc2FnZTogJHtkZXNjcmliZVN5c3RlbU1lc3NhZ2VDb25maWcoc3lzdGVtTWVzc2FnZSl9YCk7XG5cdFx0aWYgKHRoaXMuX2xvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSA8PSBMb2dMZXZlbC5UcmFjZSkge1xuXHRcdFx0Ly8gR3VhcmRlZDogYSBgcmVwbGFjZWAtbW9kZSBwcm9tcHQncyBjb250ZW50IGNhbiBiZSBtdWx0aXBsZSBLQiwgc28gb25seVxuXHRcdFx0Ly8gc2VyaWFsaXplIGl0IHdoZW4gdHJhY2Ugb3V0cHV0IGlzIGFjdHVhbGx5IGVtaXR0ZWQuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3BsYW4uc2Vzc2lvbklkfV0gU3lzdGVtIG1lc3NhZ2UgY29uZmlnOiAke0pTT04uc3RyaW5naWZ5KHN5c3RlbU1lc3NhZ2UsIChfa2V5LCB2YWx1ZSkgPT4gdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nID8gJ1t0cmFuc2Zvcm0gZm5dJyA6IHZhbHVlKX1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmJ5b2ssXG5cdFx0XHRjbGllbnROYW1lOiBBR0VOVF9IT1NUX0NPUElMT1RfQ0xJRU5UX05BTUUsXG5cdFx0XHRlbmFibGVNY3BBcHBzOiB0cnVlLFxuXHRcdFx0ZW5hYmxlRmlsZUhvb2tzOiB0cnVlLFxuXHRcdFx0ZW5hYmxlQ29uZmlnRGlzY292ZXJ5OiB0cnVlLFxuXHRcdFx0cmVxdWVzdEV4dGVuc2lvbnM6IGZhbHNlLCAvLyBmb3JjZS1kaXNhYmxlIGNvcGlsb3QgZXh0ZW5zaW9uIG1hbmFnZW1lbnQgdG9vbHMgKG90aGVyd2lzZSBlbmFibGVkIGluIGV4cGVyaW1lbnRhbCBtb2RlKVxuXHRcdFx0b25QZXJtaXNzaW9uUmVxdWVzdDogcmVxdWVzdCA9PiBydW50aW1lLmhhbmRsZVBlcm1pc3Npb25SZXF1ZXN0KHJlcXVlc3QpLFxuXHRcdFx0b25Vc2VySW5wdXRSZXF1ZXN0OiAocmVxdWVzdCwgaW52b2NhdGlvbikgPT4gcnVudGltZS5oYW5kbGVVc2VySW5wdXRSZXF1ZXN0KHJlcXVlc3QsIGludm9jYXRpb24pLFxuXHRcdFx0b25FbGljaXRhdGlvblJlcXVlc3Q6IGNvbnRleHQgPT4gcnVudGltZS5oYW5kbGVFbGljaXRhdGlvblJlcXVlc3QoY29udGV4dCksXG5cdFx0XHRvbk1jcEF1dGhSZXF1ZXN0OiAocmVxdWVzdCwgY29udGV4dCkgPT4gcnVudGltZS5oYW5kbGVNY3BBdXRoUmVxdWVzdChyZXF1ZXN0LCBjb250ZXh0KSxcblx0XHRcdGhvb2tzOiB0b1Nka0hvb2tzKHBsdWdpbnNXaXRob3V0RGlycy5mbGF0TWFwKHAgPT4gcC5ob29rcyksIHtcblx0XHRcdFx0b25QcmVUb29sVXNlOiBpbnB1dCA9PiBydW50aW1lLmhhbmRsZVByZVRvb2xVc2UoaW5wdXQpLFxuXHRcdFx0XHRvblBvc3RUb29sVXNlOiBpbnB1dCA9PiBydW50aW1lLmhhbmRsZVBvc3RUb29sVXNlKGlucHV0KSxcblx0XHRcdH0pLFxuXHRcdFx0bWNwU2VydmVyczogeyAuLi50b1Nka01jcFNlcnZlcnNGcm9tQ29uZmlnTWFwKHBsYW4uc25hcHNob3QubWNwU2VydmVycyksIC4uLnRvU2RrTWNwU2VydmVycyhwbHVnaW5zV2l0aG91dERpcnMuZmxhdE1hcChwID0+IHAubWNwU2VydmVycykpIH0sXG5cdFx0XHRvbkV4aXRQbGFuTW9kZVJlcXVlc3Q6IChyZXF1ZXN0LCBpbnZvY2F0aW9uKSA9PiBydW50aW1lLmhhbmRsZUV4aXRQbGFuTW9kZVJlcXVlc3QocmVxdWVzdCwgaW52b2NhdGlvbiksXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBwbGFuLndvcmtpbmdEaXJlY3Rvcnk/LmZzUGF0aCxcblx0XHRcdGN1c3RvbUFnZW50cyxcblx0XHRcdGFnZW50OiBwbGFuLnJlc29sdmVkQWdlbnROYW1lLFxuXHRcdFx0c2tpbGxEaXJlY3Rvcmllcyxcblx0XHRcdGluc3RydWN0aW9uRGlyZWN0b3JpZXMsXG5cdFx0XHRzeXN0ZW1NZXNzYWdlLFxuXHRcdFx0dG9vbFNlYXJjaDogdG9vbFNlYXJjaEFjdGl2ZSA/IHsgZW5hYmxlZDogdHJ1ZSwgZGVmZXJUaHJlc2hvbGQ6IHRvb2xTZWFyY2hEZWZlclRocmVzaG9sZCB9IDogeyBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0cGx1Z2luRGlyZWN0b3JpZXM6IGNvYWxlc2NlKHBsdWdpbnMubWFwKHAgPT4gcC5wbHVnaW5EaXIpKVxuXHRcdFx0XHQuZmlsdGVyKGQgPT4gZC5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkubWFwKGQgPT4gZC5mc1BhdGgpLFxuXHRcdFx0dG9vbHM6IFsuLi5zaGVsbFRvb2xzLCAuLi5ydW50aW1lLmNyZWF0ZUNsaWVudFNka1Rvb2xzKCksIC4uLnJ1bnRpbWUuY3JlYXRlU2VydmVyU2RrVG9vbHMoKV0sXG5cdFx0XHQvLyBQYXNzIHRoZSBHaXRIdWIgdG9rZW4gYXQgdGhlIHNlc3Npb24gbGV2ZWwuIFRoZSBTREsnc1xuXHRcdFx0Ly8gY2xpZW50LWxldmVsIGBnaXRIdWJUb2tlbmAgYXV0aGVudGljYXRlcyB0aGUgQ0xJIHByb2Nlc3MsXG5cdFx0XHQvLyBidXQgZWFjaCBzZXNzaW9uIGFsc28gbmVlZHMgaXRzIG93biB0b2tlbiByZXNvbHZlZCBpbnRvIGFcblx0XHRcdC8vIEdpdEh1YiBpZGVudGl0eSAobG9naW4sIENvcGlsb3QgcGxhbiwgZW5kcG9pbnRzKSB0byBkcml2ZVxuXHRcdFx0Ly8gbW9kZWwgcm91dGluZyBhbmQgcXVvdGEgXHUyMDE0IHdpdGhvdXQgdGhpcyB0aGUgc2Vzc2lvblxuXHRcdFx0Ly8gZXJyb3JzIHdpdGggXCJTZXNzaW9uIHdhcyBub3QgY3JlYXRlZCB3aXRoIGF1dGhlbnRpY2F0aW9uXG5cdFx0XHQvLyBpbmZvIG9yIGN1c3RvbSBwcm92aWRlclwiIG9uIGZpcnN0IHNlbmQuIFNlZSAjMzE4NjkzLlxuXHRcdFx0Z2l0SHViVG9rZW46IHBsYW4uZ2l0aHViVG9rZW4sXG5cdFx0XHQvLyBFbmFibGUgaW5maW5pdGUgc2Vzc2lvbnMgc28gdGhlIFNESyBwcm92aXNpb25zIGEgd29ya3NwYWNlXG5cdFx0XHQvLyBkaXJlY3RvcnkgKGNvbnRhaW5pbmcgYHBsYW4ubWRgLCBgY2hlY2twb2ludHMvYCwgYGZpbGVzL2ApLlxuXHRcdFx0Ly8gVGhlIHdvcmtzcGFjZSBpcyByZXF1aXJlZCBmb3IgcGxhbiBtb2RlIHRvIHdvcmsgXHUyMDE0IHdpdGhvdXRcblx0XHRcdC8vIGl0LCBgcnBjLnBsYW4ucmVhZCgpYCByZXR1cm5zIGBwYXRoOiBudWxsYCBhbmQgdGhlIFNES1xuXHRcdFx0Ly8gbmV2ZXIgZW1pdHMgYGV4aXRfcGxhbl9tb2RlLnJlcXVlc3RlZGAuXG5cdFx0XHRpbmZpbml0ZVNlc3Npb25zOiB7IGVuYWJsZWQ6IHRydWUgfSxcblx0XHRcdC8vIFBlci1zZXNzaW9uIHJlbW90ZSBleHBvcnQ6IHRoZSBjbGllbnQtbGV2ZWwgYC0tcmVtb3RlYCBmbGFnXG5cdFx0XHQvLyAoZW5hYmxlUmVtb3RlU2Vzc2lvbnMpIGVuYWJsZXMgdGhlIENMSSBjYXBhYmlsaXR5LCBidXQgZWFjaFxuXHRcdFx0Ly8gc2Vzc2lvbiBtdXN0IG9wdCBpbiB2aWEgYHJlbW90ZVNlc3Npb25gIHRvIGFjdHVhbGx5IGV4cG9ydFxuXHRcdFx0Ly8gZXZlbnRzLiBXaXRob3V0IHRoaXMsIHNlc3Npb25zIGRlZmF1bHQgdG8gXCJvZmZcIi5cblx0XHRcdHJlbW90ZVNlc3Npb246IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdFNlc3Npb25TeW5jRW5hYmxlZENvbmZpZ0tleSkgPT09IHRydWUgPyAnZXhwb3J0JyA6IHVuZGVmaW5lZCxcblx0XHRcdGVuYWJsZU1hbmFnZWRTZXR0aW5nczogdHJ1ZSxcblx0XHR9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUV4QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGFBQWEsZ0JBQWdCO0FBQ3RDLFNBQVMscUJBQXFCLHVCQUF1Qix3QkFBd0IseUNBQXlDO0FBQ3RILFNBQVMsa0NBQWtDLHlDQUF5QztBQUNwRixTQUFTLHNDQUFzQywwQkFB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
