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
import { SequencerByKey } from "../../../../../../base/common/async.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../../../../base/common/map.js";
import { equals } from "../../../../../../base/common/objects.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { IAgentHostService } from "../../../../../../platform/agentHost/common/agentService.js";
import { KNOWN_MODE_VALUES, SessionConfigKey } from "../../../../../../platform/agentHost/common/sessionConfigKeys.js";
import { migrateLegacyAutopilotConfig } from "../../../../../../platform/agentHost/common/agentHostSchema.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/protocol/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { InstantiationType, registerSingleton } from "../../../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
import { ChatConfiguration, getChatPermissionLevelFromDefaultConfiguration } from "../../../common/constants.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { IAgentHostNewSessionFolderService, computeWorkingDirectories } from "./agentHostNewSessionFolderService.js";
import { IAgentHostImportConversationStore } from "./agentHostImportConversationStore.js";
const IAgentHostUntitledProvisionalSessionService = createDecorator("agentHostUntitledProvisionalSessionService");
let AgentHostUntitledProvisionalSessionService = class extends Disposable {
  constructor(_agentHostService, _logService, chatService, _configurationService, _environmentService, _newSessionFolderService, _workspaceContextService, _workspaceTrustManagementService, _importConversationStore) {
    super();
    this._agentHostService = _agentHostService;
    this._logService = _logService;
    this._configurationService = _configurationService;
    this._environmentService = _environmentService;
    this._newSessionFolderService = _newSessionFolderService;
    this._workspaceContextService = _workspaceContextService;
    this._workspaceTrustManagementService = _workspaceTrustManagementService;
    this._importConversationStore = _importConversationStore;
    this._entries = new ResourceMap();
    this._pending = new ResourceMap();
    this._resolvedConfigs = new ResourceMap();
    this._resolvedConfigRequestSeq = new ResourceMap();
    // URIs that were the source of a successful `tryRebind`. The chat widget
    // briefly reattaches to the old untitled URI before its viewModel switches
    // to the new real URI; without this tombstone the picker would call
    // `getOrCreate` again and spin up an orphan provisional session on the agent.
    this._rebound = new ResourceSet();
    this._sequencer = new SequencerByKey();
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._register(chatService.onDidDisposeSession((e) => {
      for (const sessionResource of e.sessionResources) {
        if (this._entries.has(sessionResource)) {
          void this.disposeSession(sessionResource);
        }
        this._resolvedConfigs.delete(sessionResource);
        this._resolvedConfigRequestSeq.delete(sessionResource);
        this._rebound.delete(sessionResource);
      }
    }));
    this._register(this._newSessionFolderService.onDidChangeFolder((sessionResource) => {
      const folder = this._newSessionFolderService.getFolder(sessionResource);
      if (folder && this._entries.has(sessionResource)) {
        void this._changeWorkingDirectory(sessionResource, folder);
      }
    }));
  }
  get(sessionResource) {
    return this._entries.get(sessionResource)?.backendSession;
  }
  _computeWorkingDirectories(primary, provider) {
    return computeWorkingDirectories(primary, this._workspaceContextService.getWorkspace().folders.map((folder) => folder.uri), this._agentHostService.rootState.value, provider);
  }
  getInitialSessionConfig() {
    return this._getInitialConfig();
  }
  async waitForPending(sessionResource) {
    const inflight = this._pending.get(sessionResource);
    if (inflight) {
      await inflight;
    }
    return this.get(sessionResource);
  }
  getOrCreate(sessionResource, provider, workingDirectory) {
    const existing = this.get(sessionResource);
    if (existing) {
      return Promise.resolve(existing);
    }
    if (this._rebound.has(sessionResource)) {
      return Promise.resolve(void 0);
    }
    const inflight = this._pending.get(sessionResource);
    if (inflight) {
      return inflight;
    }
    const work = this._sequencer.queue(sessionResource.toString(), async () => {
      const settled = this.get(sessionResource);
      if (settled) {
        return settled;
      }
      if (!await this._isTargetFolderTrusted(workingDirectory)) {
        return void 0;
      }
      const backendSession = this._toBackendUri(sessionResource, provider);
      const initialConfig = this._getInitialConfig();
      try {
        const created = await this._agentHostService.createSession({
          provider,
          session: backendSession,
          workingDirectories: this._computeWorkingDirectories(workingDirectory, provider),
          config: initialConfig,
          progressToken: generateUuid()
        });
        this._entries.set(sessionResource, { backendSession: created, config: { ...initialConfig ?? {} }, workingDirectory });
        this._onDidChange.fire(sessionResource);
        return created;
      } catch (err) {
        this._logService.warn(`[AgentHostProvisional] Failed to create provisional session for ${sessionResource.toString()}: ${err instanceof Error ? err.message : String(err)}`);
        return void 0;
      }
    });
    this._pending.set(sessionResource, work);
    work.finally(() => {
      if (this._pending.get(sessionResource) === work) {
        this._pending.delete(sessionResource);
      }
    });
    return work;
  }
  /**
   * Whether the folder the provisional agent would run in is trusted. When a
   * working directory is known (it may be a standalone folder outside the
   * open workspace, e.g. a per-session folder), gate on that folder's trust;
   * otherwise fall back to whole-workspace trust.
   */
  async _isTargetFolderTrusted(workingDirectory) {
    if (workingDirectory) {
      const { trusted } = await this._workspaceTrustManagementService.getUriTrustInfo(workingDirectory);
      return trusted;
    }
    return this._workspaceTrustManagementService.isWorkspaceTrusted();
  }
  async tryRebind(oldSessionResource, newSessionResource, provider, workingDirectory) {
    const alreadyBound = this.get(newSessionResource);
    if (alreadyBound) {
      return alreadyBound;
    }
    await this.waitForPending(oldSessionResource);
    const oldEntry = this._entries.get(oldSessionResource);
    if (!oldEntry) {
      return void 0;
    }
    const config = oldEntry.config;
    const newBackendSession = this._toBackendUri(newSessionResource, provider);
    const imported = this._importConversationStore.take(newSessionResource);
    let created;
    try {
      created = await this._agentHostService.createSession({
        provider,
        session: newBackendSession,
        workingDirectories: this._computeWorkingDirectories(workingDirectory, provider),
        config,
        ...imported ? { model: imported.model, importConversation: { turns: imported.turns, model: imported.model } } : {},
        progressToken: generateUuid()
      });
    } catch (err) {
      this._logService.warn(`[AgentHostProvisional] Failed to create rebound provisional: ${err instanceof Error ? err.message : String(err)}`);
      return void 0;
    }
    this._entries.set(newSessionResource, { backendSession: created, config: { ...config }, workingDirectory, resolvedConfig: oldEntry.resolvedConfig });
    this._entries.delete(oldSessionResource);
    this._resolvedConfigs.delete(oldSessionResource);
    this._resolvedConfigRequestSeq.delete(oldSessionResource);
    this._rebound.add(oldSessionResource);
    this._onDidChange.fire(newSessionResource);
    this._agentHostService.disposeSession(oldEntry.backendSession).catch((err) => {
      this._logService.warn(`[AgentHostProvisional] Failed to dispose temporary provisional ${oldEntry.backendSession.toString()}: ${err instanceof Error ? err.message : String(err)}`);
    });
    return created;
  }
  /**
   * Recreate the provisional backend session for `sessionResource` at a new
   * working directory, preserving the user's config choices. A created
   * session's cwd is immutable, so the only way to honor a folder change is to
   * dispose and recreate. Reuses the same deterministic backend URI so the
   * chat-resource-to-backend mapping stays stable. Sequencer-queued so it
   * settles in order with config-chip changes for the same resource.
   */
  _changeWorkingDirectory(sessionResource, newWorkingDirectory) {
    return this._sequencer.queue(sessionResource.toString(), async () => {
      const entry = this._entries.get(sessionResource);
      if (!entry) {
        return;
      }
      if (entry.workingDirectory?.toString() === newWorkingDirectory.toString()) {
        return;
      }
      const provider = entry.backendSession.scheme;
      const config = { ...entry.config };
      try {
        await this._agentHostService.disposeSession(entry.backendSession);
      } catch (err) {
        this._logService.warn(`[AgentHostProvisional] Failed to dispose provisional before cwd change ${entry.backendSession.toString()}: ${err instanceof Error ? err.message : String(err)}`);
      }
      let created;
      try {
        created = await this._agentHostService.createSession({
          provider,
          session: entry.backendSession,
          workingDirectories: this._computeWorkingDirectories(newWorkingDirectory, provider),
          config,
          progressToken: generateUuid()
        });
      } catch (err) {
        this._logService.warn(`[AgentHostProvisional] Failed to recreate provisional at new cwd: ${err instanceof Error ? err.message : String(err)}`);
        this._entries.delete(sessionResource);
        this._onDidChange.fire(sessionResource);
        return;
      }
      this._entries.set(sessionResource, { backendSession: created, config, workingDirectory: newWorkingDirectory, resolvedConfig: entry.resolvedConfig });
      try {
        const resolved = await this._agentHostService.resolveSessionConfig({
          provider,
          workingDirectory: newWorkingDirectory,
          config: { ...config }
        });
        const current = this._entries.get(sessionResource);
        if (current && current.backendSession.toString() === created.toString()) {
          current.config = { ...current.config, ...resolved.values };
          current.resolvedConfig = resolved;
        }
      } catch (err) {
        this._logService.warn(`[AgentHostProvisional] schema re-resolve after cwd change failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      this._onDidChange.fire(sessionResource);
    });
  }
  async disposeSession(sessionResource) {
    await this.waitForPending(sessionResource);
    const entry = this._entries.get(sessionResource);
    this._resolvedConfigs.delete(sessionResource);
    this._resolvedConfigRequestSeq.delete(sessionResource);
    if (!entry) {
      return;
    }
    this._entries.delete(sessionResource);
    this._onDidChange.fire(sessionResource);
    try {
      await this._agentHostService.disposeSession(entry.backendSession);
    } catch (err) {
      this._logService.warn(`[AgentHostProvisional] Failed to dispose provisional ${entry.backendSession.toString()}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  dispose() {
    for (const [, entry] of this._entries) {
      this._agentHostService.disposeSession(entry.backendSession).catch(() => {
      });
    }
    this._entries.clear();
    this._pending.clear();
    this._resolvedConfigs.clear();
    this._resolvedConfigRequestSeq.clear();
    this._rebound.clear();
    super.dispose();
  }
  /**
   * Convert the chat-input UI session URI (`agent-host-PROVIDER:/<id>`)
   * to the agent-host backend URI (`PROVIDER:/<id>`).
   */
  _toBackendUri(sessionResource, provider) {
    const rawId = sessionResource.path.replace(/^\//, "");
    return URI.from({ scheme: provider, path: `/${rawId}` });
  }
  getResolvedConfig(sessionResource) {
    return this._entries.get(sessionResource)?.resolvedConfig ?? this._resolvedConfigs.get(sessionResource);
  }
  async refreshResolvedConfig(sessionResource, provider, workingDirectory, config) {
    const seq = (this._resolvedConfigRequestSeq.get(sessionResource) ?? 0) + 1;
    this._resolvedConfigRequestSeq.set(sessionResource, seq);
    try {
      const resolved = await this._agentHostService.resolveSessionConfig({
        provider,
        workingDirectory,
        config
      });
      if (this._resolvedConfigRequestSeq.get(sessionResource) !== seq) {
        return;
      }
      const entry = this._entries.get(sessionResource);
      if (entry) {
        entry.config = { ...entry.config, ...resolved.values };
        entry.resolvedConfig = resolved;
      } else {
        this._resolvedConfigs.set(sessionResource, resolved);
      }
      this._onDidChange.fire(sessionResource);
    } catch (err) {
      this._logService.warn(`[AgentHostProvisional] schema re-resolve failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  async applyConfigChange(sessionResource, provider, workingDirectory, partial) {
    const preExisting = this._entries.get(sessionResource);
    if (preExisting) {
      Object.assign(preExisting.config, partial);
      if (preExisting.resolvedConfig) {
        preExisting.resolvedConfig = {
          ...preExisting.resolvedConfig,
          values: { ...preExisting.resolvedConfig.values, ...partial }
        };
      }
    }
    const backend = await this.getOrCreate(sessionResource, provider, workingDirectory);
    if (!backend) {
      return void 0;
    }
    if (!preExisting) {
      const entry = this._entries.get(sessionResource);
      if (entry) {
        Object.assign(entry.config, partial);
      }
    }
    this._agentHostService.dispatch(backend.toString(), {
      type: ActionType.SessionConfigChanged,
      config: partial
    });
    return this._sequencer.queue(sessionResource.toString(), async () => {
      const current = this._entries.get(sessionResource);
      if (!current) {
        return backend;
      }
      try {
        const resolved = await this._agentHostService.resolveSessionConfig({
          provider,
          workingDirectory,
          config: { ...current.config }
        });
        const stillCurrent = this._entries.get(sessionResource);
        if (stillCurrent === current) {
          const resolvedValues = { ...resolved.values };
          const mergedConfig = { ...stillCurrent.config, ...resolvedValues };
          const configChanged = !equals(stillCurrent.config, mergedConfig);
          const resolvedChanged = !equals(stillCurrent.resolvedConfig, resolved);
          if (configChanged || resolvedChanged) {
            stillCurrent.config = mergedConfig;
            stillCurrent.resolvedConfig = resolved;
            this._onDidChange.fire(sessionResource);
          }
        }
      } catch (err) {
        this._logService.warn(`[AgentHostProvisional] schema re-resolve failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      return backend;
    });
  }
  /**
   * Workbench-side initial config seed sent at `createSession` time so the
   * agent's own server-side defaults don't fill `state.config.values` for
   * keys the workbench wants to control. Without this, the merge filter in
   * `agentHostSessionHandler` sees those agent defaults as "user-set" and
   * drops the workbench defaults.
   *
   * - `isolation`: workbench has no isolation picker, so always `'folder'`.
   * - `mode` / `autoApprove`: seeded from the single
   *   `chat.defaultConfiguration` object setting (`mode` and
   *   `approvals` properties). The approval seed is clamped to `'default'`
   *   when the `chat.tools.global.autoApprove` policy is off. The local-only
   *   `chat.permissions.default` setting is NOT used.
   *
   * Skipped entirely in the Agents window, where the sessions provider
   * supplies config via `request.agentHostSessionConfig` instead.
   */
  _getInitialConfig() {
    if (this._environmentService.isSessionsWindow) {
      return void 0;
    }
    const config = { [SessionConfigKey.Isolation]: "folder" };
    const configuredDefaults = this._configurationService.getValue(ChatConfiguration.DefaultConfiguration);
    const policyValue = this._configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue;
    const configuredApprovals = getChatPermissionLevelFromDefaultConfiguration(configuredDefaults?.approvals);
    if (configuredApprovals) {
      const policyRestricted = policyValue === false;
      config[SessionConfigKey.AutoApprove] = policyRestricted && configuredApprovals !== "default" ? "default" : configuredApprovals;
    }
    const configuredMode = configuredDefaults?.mode;
    if (typeof configuredMode === "string" && KNOWN_MODE_VALUES.has(configuredMode)) {
      config[SessionConfigKey.Mode] = configuredMode;
    }
    return migrateLegacyAutopilotConfig(config);
  }
};
AgentHostUntitledProvisionalSessionService = __decorateClass([
  __decorateParam(0, IAgentHostService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IChatService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IWorkbenchEnvironmentService),
  __decorateParam(5, IAgentHostNewSessionFolderService),
  __decorateParam(6, IWorkspaceContextService),
  __decorateParam(7, IWorkspaceTrustManagementService),
  __decorateParam(8, IAgentHostImportConversationStore)
], AgentHostUntitledProvisionalSessionService);
registerSingleton(
  IAgentHostUntitledProvisionalSessionService,
  AgentHostUntitledProvisionalSessionService,
  InstantiationType.Delayed
);
export {
  AgentHostUntitledProvisionalSessionService,
  IAgentHostUntitledProvisionalSessionService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vKipcbiAqIExNIGVkaXRpbmcgbWFwIGZvciB1bnRpdGxlZCBhZ2VudC1ob3N0IGNoYXQgc2Vzc2lvbnMuXG4gKlxuICogVGhpcyBzZXJ2aWNlIGV4aXN0cyBzbyBzZXNzaW9uLWNvbmZpZyBjaGlwIGNob2ljZXMgbWFkZSBiZWZvcmUgZmlyc3QgU2VuZFxuICogcmVhY2ggdGhlIGJhY2tlbmQgYFNlc3Npb25TdGF0ZS5jb25maWcudmFsdWVzYC4gRG8gbm90IHNpbXBsaWZ5IHRoaXMgaW50byBhXG4gKiBkaXJlY3QgcGlja2VyLW9ubHkgY2FjaGU6IHRoZSBhZ2VudCByZWFkcyBjb25maWcgdGhyb3VnaCB0aGUgYmFja2VuZCBzdGF0ZVxuICogd2hlbiBhIHByb3Zpc2lvbmFsIHNlc3Npb24gbWF0ZXJpYWxpemVzLlxuICpcbiAqIFJlc291cmNlIGlkZW50aXRpZXM6XG4gKiAtIGNoYXQgVUkgcmVzb3VyY2U6IGBhZ2VudC1ob3N0LVBST1ZJREVSOi91bnRpdGxlZC08dXVpZD5gIGJlZm9yZSBmaXJzdCBTZW5kLlxuICogLSBiYWNrZW5kIHJlc291cmNlOiBgUFJPVklERVI6L3VudGl0bGVkLTx1dWlkPmAgZm9yIHRoZSBwcm92aXNpb25hbCBzdGF0ZS5cbiAqIC0gcmVhbCBjaGF0IHJlc291cmNlOiBgYWdlbnQtaG9zdC1QUk9WSURFUjovPHV1aWQ+YCBhZnRlclxuICogICBgY2hhdFNlcnZpY2VJbXBsLmFjY2VwdElucHV0YCBjYWxscyBgY3JlYXRlTmV3Q2hhdFNlc3Npb25JdGVtYC5cbiAqIC0gcmVhbCBiYWNrZW5kIHJlc291cmNlOiBgUFJPVklERVI6Lzx1dWlkPmAgYWZ0ZXIgYHRyeVJlYmluZGAuXG4gKlxuICogUmVxdWlyZWQgZmxvdzpcbiAqIDEuIGBBZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXJgIGNhbGxzIGBnZXRPckNyZWF0ZSh1bnRpdGxlZCwgcHJvdmlkZXIsIGN3ZClgLlxuICogICAgVGhpcyBjcmVhdGVzIGEgYmFja2VuZCBwcm92aXNpb25hbCBzZXNzaW9uIHNvIGBTZXNzaW9uQ29uZmlnQ2hhbmdlZGBcbiAqICAgIGFjdGlvbnMgaGF2ZSBhIHJlZHVjZXItb3duZWQgYFNlc3Npb25TdGF0ZWAgdG8gdXBkYXRlLlxuICogMi4gT24gZmlyc3QgU2VuZCwgYEFnZW50SG9zdFNlc3Npb25MaXN0Q29udHJvbGxlci5uZXdDaGF0U2Vzc2lvbkl0ZW1gXG4gKiAgICByZWNlaXZlcyBib3RoIGByZXF1ZXN0LnVudGl0bGVkUmVzb3VyY2VgIGFuZCB0aGUgbmV3bHkgZ2VuZXJhdGVkIHJlYWxcbiAqICAgIHJlc291cmNlLiBJdCBtdXN0IGNhbGwgYHRyeVJlYmluZGAgYmVmb3JlIHRoZSBoYW5kbGVyIGludm9rZXMgdGhlIGFnZW50LlxuICogMy4gYHRyeVJlYmluZGAgc25hcHNob3RzIGBzdGF0ZS5jb25maWcudmFsdWVzYCBmcm9tIHRoZSB1bnRpdGxlZCBiYWNrZW5kXG4gKiAgICBwcm92aXNpb25hbCwgY3JlYXRlcyBhIG5ldyBwcm92aXNpb25hbCBmb3IgdGhlIHJlYWwgYmFja2VuZCByZXNvdXJjZSB3aXRoXG4gKiAgICB0aGF0IGNvbmZpZywgc3dhcHMgYF9lbnRyaWVzYCwgZmlyZXMgYG9uRGlkQ2hhbmdlYCBmb3IgYm90aCByZXNvdXJjZXMsXG4gKiAgICB0aGVuIGJlc3QtZWZmb3J0IGRpc3Bvc2VzIHRoZSB1bnRpdGxlZCBiYWNrZW5kIHByb3Zpc2lvbmFsLlxuICogNC4gYEFnZW50SG9zdFNlc3Npb25IYW5kbGVyLl9pbnZva2VBZ2VudGAgY2FsbHMgYGdldChyZWFsUmVzb3VyY2UpYC4gV2hlbiBhXG4gKiAgICByZWJvdW5kIHByb3Zpc2lvbmFsIGV4aXN0cywgaXQgdGFrZXMgYSByZWZjb3VudGVkIHN1YnNjcmlwdGlvbiBvbiB0aGF0XG4gKiAgICBiYWNrZW5kIHN0YXRlIHVwIGZyb250IHNvIHRoZSByZXN0IG9mIHRoZSBoYW5kbGVyIG9ic2VydmVzIHRoZSBwcmVzZXJ2ZWRcbiAqICAgIGBzdGF0ZS5jb25maWcudmFsdWVzYCBpbnN0ZWFkIG9mIGEgZnJlc2hseSBjcmVhdGVkIGVtcHR5IHNlc3Npb24uIFRoZVxuICogICAgZWFnZXItc3RhdGUgYnJhbmNoIHRoZW4gc2tpcHMgYF9jcmVhdGVBbmRTdWJzY3JpYmVgOyB0aGUgYWdlbnRcbiAqICAgIG1hdGVyaWFsaXplcyB0aGUgcHJvdmlzaW9uYWwgYW5kIHJlYWRzIHRoZSBwcmVzZXJ2ZWQgY29uZmlnIHZhbHVlcy5cbiAqXG4gKiBJbnZhcmlhbnRzIHRvIHByZXNlcnZlOlxuICogLSBgX2VudHJpZXNgIGlzIGtleWVkIGJ5IGNoYXQgVUkgcmVzb3VyY2VzIGFuZCBzdG9yZXMgYmFja2VuZCByZXNvdXJjZXMuXG4gKiAtIGBnZXRPckNyZWF0ZWAgaXMgc2VyaWFsaXplZCBwZXIgY2hhdCBVSSByZXNvdXJjZTsgY2hpcCBpbnN0YW5jZXMgbWF5IHJhY2UuXG4gKiAtIGB0cnlSZWJpbmRgIGlzIGJlc3QtZWZmb3J0LiBGYWlsdXJlIG11c3QgZGVncmFkZSB0byB0aGUgaGFuZGxlcidzIG5vcm1hbFxuICogICBjcmVhdGUgcGF0aCByYXRoZXIgdGhhbiBibG9ja2luZyBTZW5kLlxuICogLSBBYmFuZG9uZWQgdW50aXRsZWQgY2hhdHMgbXVzdCBkaXNwb3NlIHRoZWlyIGJhY2tlbmQgcHJvdmlzaW9uYWwgc3RhdGUgd2hlblxuICogICBgSUNoYXRTZXJ2aWNlLm9uRGlkRGlzcG9zZVNlc3Npb25gIHJlcG9ydHMgdGhlIGNoYXQgVUkgcmVzb3VyY2UuXG4gKiAtIENhbGxlcnMgb3duIHByb3ZpZGVyIGFuZCB3b3JraW5nLWRpcmVjdG9yeSBjb25zaXN0ZW5jeS4gRGVyaXZlIHRoZW0gZnJvbVxuICogICB0aGUgY2hhdCByZXNvdXJjZS9zZXNzaW9uIHR5cGUgYW5kIGFjdGl2ZSB3b3Jrc3BhY2UgaW4gdGhlIHNhbWUgd2F5IG9uXG4gKiAgIGNyZWF0ZSBhbmQgcmViaW5kLlxuICovXG5cbmltcG9ydCB7IFNlcXVlbmNlckJ5S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwLCBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgS05PV05fTU9ERV9WQUxVRVMsIFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3Nlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IG1pZ3JhdGVMZWdhY3lBdXRvcGlsb3RDb25maWcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9hY3Rpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uLCBnZXRDaGF0UGVybWlzc2lvbkxldmVsRnJvbURlZmF1bHRDb25maWd1cmF0aW9uLCB0eXBlIElDaGF0RGVmYXVsdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UsIGNvbXB1dGVXb3JraW5nRGlyZWN0b3JpZXMgfSBmcm9tICcuL2FnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZSB9IGZyb20gJy4vYWdlbnRIb3N0SW1wb3J0Q29udmVyc2F0aW9uU3RvcmUuanMnO1xuXG5leHBvcnQgY29uc3QgSUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSA9XG5cdGNyZWF0ZURlY29yYXRvcjxJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlPignYWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlJyk7XG5cbi8qKlxuICogTE0gY29udHJhY3Q6IG1haW50YWluIG9uZSBiYWNrZW5kIHByb3Zpc2lvbmFsIHNlc3Npb24gcGVyIHVudGl0bGVkIGNoYXQgVUlcbiAqIHJlc291cmNlLCBhbmQgYnJpZGdlIGl0IHRvIHRoZSByZWFsIGNoYXQgVUkgcmVzb3VyY2UgYmVmb3JlIHRoZSBmaXJzdCBhZ2VudFxuICogaW52b2NhdGlvbi4gVGhlIGNvbnRyYWN0IGlzIGFib3V0IGJhY2tlbmQgYFNlc3Npb25TdGF0ZS5jb25maWcudmFsdWVzYCwgbm90XG4gKiBVSSByZW5kZXJpbmcgc3RhdGUuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogRmlyZXMgZm9yIHRoZSBjaGF0IFVJIHJlc291cmNlIHdob3NlIGJhY2tlbmQgcHJvdmlzaW9uYWwgbWFwcGluZyBjaGFuZ2VkLlxuXHQgKiBQaWNrZXIgbGlzdGVuZXJzIG11c3QgcmUtcmVhZCB7QGxpbmsgZ2V0fSBhbmQgYXR0YWNoIHRvIHRoZSByZXR1cm5lZFxuXHQgKiBiYWNrZW5kIFVSSSwgaWYgYW55LlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PFVSST47XG5cblx0LyoqXG5cdCAqIFJlYWQgdGhlIGJhY2tlbmQgcHJvdmlzaW9uYWwgVVJJIGN1cnJlbnRseSBtYXBwZWQgZnJvbSBgc2Vzc2lvblJlc291cmNlYC5cblx0ICogUmV0dXJucyBgdW5kZWZpbmVkYCBmb3IgcmVzb3VyY2VzIHRoYXQgaGF2ZSBub3QgYmVlbiBwcm92aXNpb25lZCBvciB3ZXJlXG5cdCAqIGFscmVhZHkgZGlzcG9zZWQvcmVib3VuZCBhd2F5LlxuXHQgKi9cblx0Z2V0KHNlc3Npb25SZXNvdXJjZTogVVJJKTogVVJJIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBJbml0aWFsIGNvbmZpZyB0aGUgZWRpdG9yIHdpbmRvdyBhcHBsaWVzIHRvIGV2ZXJ5IG5ldyBBZ2VudCBIb3N0IHNlc3Npb24uXG5cdCAqIFJldHVybnMgYHVuZGVmaW5lZGAgaW4gdGhlIEFnZW50cyB3aW5kb3csIHdoZXJlIHRoZSBzZXNzaW9ucyBwcm92aWRlciBvd25zXG5cdCAqIHRoZSBpbml0aWFsIGNvbmZpZyBzdXBwbGllZCBvbiB0aGUgcmVxdWVzdC5cblx0ICovXG5cdGdldEluaXRpYWxTZXNzaW9uQ29uZmlnKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBFbnN1cmUgYSBiYWNrZW5kIHByb3Zpc2lvbmFsIGV4aXN0cyBmb3IgYW4gdW50aXRsZWQgY2hhdCBVSSByZXNvdXJjZS5cblx0ICogTXVsdGlwbGUgcGlja2VyIGNoaXBzIG1heSBjYWxsIHRoaXMgY29uY3VycmVudGx5OyBpbXBsZW1lbnRhdGlvbiBtdXN0IGtlZXBcblx0ICogb25lIGNyZWF0ZSBpbiBmbGlnaHQgcGVyIHJlc291cmNlIGFuZCByZXR1cm4gdGhlIHNhbWUgYmFja2VuZCBVUkkuXG5cdCAqL1xuXHRnZXRPckNyZWF0ZShcblx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRwcm92aWRlcjogc3RyaW5nLFxuXHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCxcblx0KTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+O1xuXG5cdC8qKlxuXHQgKiBXYWl0IGZvciBhIHBlbmRpbmcge0BsaW5rIGdldE9yQ3JlYXRlfSBmb3IgYHNlc3Npb25SZXNvdXJjZWAsIHRoZW4gcmV0dXJuXG5cdCAqIHRoZSBjdXJyZW50IG1hcHBpbmcuIFVzZSB0aGlzIGJlZm9yZSByZWFkaW5nL2Rpc2NhcmRpbmcgYSByZXNvdXJjZSB0aGF0IG1heVxuXHQgKiBzdGlsbCBiZSByYWNpbmcgd2l0aCBwaWNrZXItdHJpZ2dlcmVkIHByb3Zpc2lvbmFsIGNyZWF0aW9uLlxuXHQgKi9cblx0d2FpdEZvclBlbmRpbmcoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD47XG5cblx0LyoqXG5cdCAqIEFwcGx5IGEgcGFydGlhbCBjb25maWcgY2hhbmdlIHRvIHRoZSBiYWNrZW5kIHByb3Zpc2lvbmFsIGZvciBhbiB1bnRpdGxlZFxuXHQgKiBjaGF0IFVJIHJlc291cmNlLiBVcGRhdGVzIHRoZSB3b3JrYmVuY2gtb3duZWQgY29uZmlnIGNhY2hlIHN5bmNocm9ub3VzbHlcblx0ICogKHNvIGEgc3Vic2VxdWVudCB7QGxpbmsgdHJ5UmViaW5kfSBzZWVzIHRoZSBsYXRlc3QgdmFsdWVzIHdpdGhvdXQgYVxuXHQgKiBzZXJ2ZXIgcm91bmR0cmlwKSwgY3JlYXRlcyB0aGUgcHJvdmlzaW9uYWwgaWYgbmVlZGVkLCB0aGVuIGRpc3BhdGNoZXNcblx0ICogYFNlc3Npb25Db25maWdDaGFuZ2VkYCBvbiB0aGUgYmFja2VuZCBzbyB0aGUgYWdlbnQgYW5kIG90aGVyIGNsaWVudHNcblx0ICogcGljayB1cCB0aGUgY2hhbmdlLiBSZXR1cm5zIHRoZSBiYWNrZW5kIFVSSSBvbiBzdWNjZXNzLlxuXHQgKi9cblx0YXBwbHlDb25maWdDaGFuZ2UoXG5cdFx0c2Vzc2lvblJlc291cmNlOiBVUkksXG5cdFx0cHJvdmlkZXI6IHN0cmluZyxcblx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0cGFydGlhbDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG5cdCk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPjtcblxuXHQvKipcblx0ICogQnJpZGdlIHRoZSB1bnRpdGxlZCBjaGF0IFVJIHJlc291cmNlIHRvIHRoZSByZWFsIGNoYXQgVUkgcmVzb3VyY2UgY3JlYXRlZFxuXHQgKiBmb3IgZmlyc3QgU2VuZC4gTXVzdCBjb3B5IGBzdGF0ZS5jb25maWcudmFsdWVzYCBmcm9tIHRoZSBvbGQgYmFja2VuZFxuXHQgKiBwcm92aXNpb25hbCBpbnRvIHRoZSBuZXcgYmFja2VuZCBwcm92aXNpb25hbCBiZWZvcmUgdGhlIGhhbmRsZXIgaW52b2tlcyB0aGVcblx0ICogYWdlbnQuIE5vLW9wIHdoZW4gbm8gb2xkIG1hcHBpbmcgZXhpc3RzOyBpZGVtcG90ZW50IHdoZW4gdGhlIG5ldyBtYXBwaW5nIGlzXG5cdCAqIGFscmVhZHkgcHJlc2VudC5cblx0ICovXG5cdHRyeVJlYmluZChcblx0XHRvbGRTZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRuZXdTZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRwcm92aWRlcjogc3RyaW5nLFxuXHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCxcblx0KTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+O1xuXG5cdC8qKlxuXHQgKiBEaXNwb3NlIGFuZCBmb3JnZXQgdGhlIGJhY2tlbmQgcHJvdmlzaW9uYWwgbWFwcGVkIGZyb20gYHNlc3Npb25SZXNvdXJjZWAuXG5cdCAqIFNhZmUgYWZ0ZXIgYSBzdWNjZXNzZnVsIHJlYmluZCBiZWNhdXNlIHRoZSBvbGQgbWFwcGluZyBpcyBhbHJlYWR5IGdvbmUuXG5cdCAqL1xuXHRkaXNwb3NlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIExhdGVzdCB3b3JrYmVuY2gtc2lkZSByZS1yZXNvbHZlZCBjb25maWcgKHNjaGVtYSArIHZhbHVlcykgZm9yIGEgY2hhdFxuXHQgKiBzZXNzaW9uLCBpZiBhbnkuIFBvcHVsYXRlZCBhZnRlciBhIHZhbHVlIGNoYW5nZSBzbyBkZXBlbmRlbnQgcHJvcGVydGllc1xuXHQgKiByZWZyZXNoIHdpdGhvdXQgYSBwcm90b2NvbC1sZXZlbCBzY2hlbWEtdXBkYXRlIGNoYW5uZWwuXG5cdCAqXG5cdCAqIEJvdGggdGhlIHNjaGVtYSBhbmQgdGhlIHZhbHVlcyBtYXR0ZXI6IGByZXNvbHZlU2Vzc2lvbkNvbmZpZ2AgcnVuc1xuXHQgKiBgdmFsaWRhdGVPckRlZmF1bHRgLCB3aGljaCBjYW4gY2xhbXAgbm93LWludmFsaWQgdmFsdWVzIG9yIGluamVjdFxuXHQgKiBkZXJpdmVkIGRlZmF1bHRzIHRoZSBjb25zdW1lciBzaG91bGQgcHJlZmVyIG92ZXIgYHN0YXRlLmNvbmZpZy52YWx1ZXNgLlxuXHQgKi9cblx0Z2V0UmVzb2x2ZWRDb25maWcoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUmUtcmVzb2x2ZSBjb25maWcgZm9yIGFuIGFscmVhZHktY3JlYXRlZCBjaGF0IHNlc3Npb24gYW5kIGNhY2hlIHRoZVxuXHQgKiBzY2hlbWEvdmFsdWVzIG92ZXJsYXkgcmV0dXJuZWQgYnkgdGhlIHByb3ZpZGVyLlxuXHQgKi9cblx0cmVmcmVzaFJlc29sdmVkQ29uZmlnKFxuXHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLFxuXHRcdHByb3ZpZGVyOiBzdHJpbmcsXG5cdFx0d29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQsXG5cdCk6IFByb21pc2U8dm9pZD47XG59XG5cbmludGVyZmFjZSBJRW50cnkge1xuXHRyZWFkb25seSBiYWNrZW5kU2Vzc2lvbjogVVJJO1xuXHQvKipcblx0ICogV29ya2JlbmNoLW93bmVkIHNuYXBzaG90IG9mIHNlc3Npb24tY29uZmlnIHZhbHVlcyBmb3IgdGhpcyBwcm92aXNpb25hbC5cblx0ICogU2VlZGVkIGZyb20ge0BsaW5rIF9nZXRJbml0aWFsQ29uZmlnfSBhdCBjcmVhdGUgdGltZSBhbmQgbXV0YXRlZFxuXHQgKiBzeW5jaHJvbm91c2x5IGJ5IHtAbGluayBhcHBseUNvbmZpZ0NoYW5nZX0gc28ge0BsaW5rIHRyeVJlYmluZH0gY2FuIHJlYWRcblx0ICogdGhlIGxhdGVzdCB2YWx1ZXMgd2l0aG91dCB3YWl0aW5nIGZvciB0aGUgYWdlbnQgdG8gZWNobyB0aGVtIGJhY2sgdGhyb3VnaFxuXHQgKiBgc3RhdGUuY29uZmlnLnZhbHVlc2AuXG5cdCAqL1xuXHRjb25maWc6IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHQvKipcblx0ICogV29ya2luZyBkaXJlY3RvcnkgdGhlIHByb3Zpc2lvbmFsIGJhY2tlbmQgc2Vzc2lvbiB3YXMgY3JlYXRlZCB3aXRoLiBBXG5cdCAqIGNyZWF0ZWQgc2Vzc2lvbidzIGN3ZCBpcyBpbW11dGFibGUsIHNvIHdoZW4gdGhlIHVzZXIgcGlja3MgYSBkaWZmZXJlbnRcblx0ICogZm9sZGVyIHRoZSBlbnRyeSBpcyByZWNyZWF0ZWQ7IHRoaXMgbGV0cyBhIGZvbGRlciBjaGFuZ2Ugbm8tb3Agd2hlbiB0aGVcblx0ICogY3dkIGlzIHVuY2hhbmdlZC5cblx0ICovXG5cdHdvcmtpbmdEaXJlY3Rvcnk/OiBVUkk7XG5cdC8qKlxuXHQgKiBMYXRlc3QgcmUtcmVzb2x2ZWQgY29uZmlnIChzY2hlbWEgKyB2YWx1ZXMpIGZvciB0aGlzIHByb3Zpc2lvbmFsLCBzZXRcblx0ICogYnkge0BsaW5rIGFwcGx5Q29uZmlnQ2hhbmdlfSBhZnRlciBlYWNoIHZhbHVlIGNoYW5nZS4gQ2xlYXJlZCB3aGVuIHRoZVxuXHQgKiBlbnRyeSBpcyByZWJvdW5kIG9yIGRpc3Bvc2VkLlxuXHQgKi9cblx0cmVzb2x2ZWRDb25maWc/OiBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdDtcbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZW50cmllcyA9IG5ldyBSZXNvdXJjZU1hcDxJRW50cnk+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmcgPSBuZXcgUmVzb3VyY2VNYXA8UHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlZENvbmZpZ3MgPSBuZXcgUmVzb3VyY2VNYXA8UmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc29sdmVkQ29uZmlnUmVxdWVzdFNlcSA9IG5ldyBSZXNvdXJjZU1hcDxudW1iZXI+KCk7XG5cdC8vIFVSSXMgdGhhdCB3ZXJlIHRoZSBzb3VyY2Ugb2YgYSBzdWNjZXNzZnVsIGB0cnlSZWJpbmRgLiBUaGUgY2hhdCB3aWRnZXRcblx0Ly8gYnJpZWZseSByZWF0dGFjaGVzIHRvIHRoZSBvbGQgdW50aXRsZWQgVVJJIGJlZm9yZSBpdHMgdmlld01vZGVsIHN3aXRjaGVzXG5cdC8vIHRvIHRoZSBuZXcgcmVhbCBVUkk7IHdpdGhvdXQgdGhpcyB0b21ic3RvbmUgdGhlIHBpY2tlciB3b3VsZCBjYWxsXG5cdC8vIGBnZXRPckNyZWF0ZWAgYWdhaW4gYW5kIHNwaW4gdXAgYW4gb3JwaGFuIHByb3Zpc2lvbmFsIHNlc3Npb24gb24gdGhlIGFnZW50LlxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWJvdW5kID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXJCeUtleTxzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VVJJPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFnZW50SG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRIb3N0U2VydmljZTogSUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbmV3U2Vzc2lvbkZvbGRlclNlcnZpY2U6IElBZ2VudEhvc3ROZXdTZXNzaW9uRm9sZGVyU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0SW1wb3J0Q29udmVyc2F0aW9uU3RvcmUgcHJpdmF0ZSByZWFkb25seSBfaW1wb3J0Q29udmVyc2F0aW9uU3RvcmU6IElBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIERyb3AgcHJvdmlzaW9uYWwgc2Vzc2lvbnMgd2hlbiB0aGUgY2hhdCBpbmZyYSBkaXNwb3NlcyB0aGVpclxuXHRcdC8vIGNoYXQtaW5wdXQgc2Vzc2lvbiByZXNvdXJjZSAoZS5nLiB0aGUgdXNlciBjbG9zZXMgdGhlIHdpZGdldFxuXHRcdC8vIHdpdGhvdXQgZXZlciBzZW5kaW5nIGEgbWVzc2FnZSkuIFdpdGhvdXQgdGhpcywgdW50aXRsZWQgY2hhdHMgdGhlXG5cdFx0Ly8gdXNlciBvcGVucyBhbmQgYWJhbmRvbnMgbGVhayBpbi1tZW1vcnkgc3RhdGUtbWFuYWdlciBlbnRyaWVzIG9uXG5cdFx0Ly8gdGhlIGFnZW50IGhvc3QuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2hhdFNlcnZpY2Uub25EaWREaXNwb3NlU2Vzc2lvbihlID0+IHtcblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvblJlc291cmNlIG9mIGUuc2Vzc2lvblJlc291cmNlcykge1xuXHRcdFx0XHRpZiAodGhpcy5fZW50cmllcy5oYXMoc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRcdHZvaWQgdGhpcy5kaXNwb3NlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3Jlc29sdmVkQ29uZmlncy5kZWxldGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0dGhpcy5fcmVzb2x2ZWRDb25maWdSZXF1ZXN0U2VxLmRlbGV0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHQvLyBEcm9wIGFueSB0b21ic3RvbmUgZm9yIHRoZSBhYmFuZG9uZWQgdW50aXRsZWQgVVJJIHNvIHRoZVxuXHRcdFx0XHQvLyBzZXQgZG9lc24ndCBncm93IHVuYm91bmRlZCBhY3Jvc3MgdGhlIHdvcmtiZW5jaCBsaWZldGltZS5cblx0XHRcdFx0dGhpcy5fcmVib3VuZC5kZWxldGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBBIHNlc3Npb24ncyB3b3JraW5nIGRpcmVjdG9yeSBpcyBmaXhlZCBhdCBjcmVhdGlvbiB0aW1lLiBXaGVuIHRoZSB1c2VyXG5cdFx0Ly8gcGlja3MgYSBkaWZmZXJlbnQgZm9sZGVyIGZvciBhIG5vdC15ZXQtc3RhcnRlZCBzZXNzaW9uIHRoYXQgYWxyZWFkeSBoYXNcblx0XHQvLyBhIHByb3Zpc2lvbmFsIGJhY2tlbmQgc2Vzc2lvbiAoYnVpbHQgdXAgYnkgY29uZmlnIGNoaXBzKSwgcmVjcmVhdGUgdGhhdFxuXHRcdC8vIHByb3Zpc2lvbmFsIGF0IHRoZSBuZXcgY3dkIHNvIGNoaXAgc2NoZW1hcyByZXNvbHZlIGFnYWluc3QgaXQuIFRoZVxuXHRcdC8vIHNlcnZpY2Ugb3ducyB0aGlzIHJlYWN0aW9uIHNvIGNvbmN1cnJlbnQgY2hpcCBpbnN0YW5jZXMgZG9uJ3QgcmFjZS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9uZXdTZXNzaW9uRm9sZGVyU2VydmljZS5vbkRpZENoYW5nZUZvbGRlcihzZXNzaW9uUmVzb3VyY2UgPT4ge1xuXHRcdFx0Y29uc3QgZm9sZGVyID0gdGhpcy5fbmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UuZ2V0Rm9sZGVyKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoZm9sZGVyICYmIHRoaXMuX2VudHJpZXMuaGFzKHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0dm9pZCB0aGlzLl9jaGFuZ2VXb3JraW5nRGlyZWN0b3J5KHNlc3Npb25SZXNvdXJjZSwgZm9sZGVyKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRnZXQoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9lbnRyaWVzLmdldChzZXNzaW9uUmVzb3VyY2UpPy5iYWNrZW5kU2Vzc2lvbjtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVXb3JraW5nRGlyZWN0b3JpZXMocHJpbWFyeTogVVJJIHwgdW5kZWZpbmVkLCBwcm92aWRlcjogc3RyaW5nKTogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBjb21wdXRlV29ya2luZ0RpcmVjdG9yaWVzKHByaW1hcnksIHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubWFwKGZvbGRlciA9PiBmb2xkZXIudXJpKSwgdGhpcy5fYWdlbnRIb3N0U2VydmljZS5yb290U3RhdGUudmFsdWUsIHByb3ZpZGVyKTtcblx0fVxuXG5cdGdldEluaXRpYWxTZXNzaW9uQ29uZmlnKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0SW5pdGlhbENvbmZpZygpO1xuXHR9XG5cblx0YXN5bmMgd2FpdEZvclBlbmRpbmcoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGluZmxpZ2h0ID0gdGhpcy5fcGVuZGluZy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoaW5mbGlnaHQpIHtcblx0XHRcdGF3YWl0IGluZmxpZ2h0O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdGdldE9yQ3JlYXRlKFxuXHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLFxuXHRcdHByb3ZpZGVyOiBzdHJpbmcsXG5cdFx0d29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLFxuXHQpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZXhpc3RpbmcpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fcmVib3VuZC5oYXMoc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRjb25zdCBpbmZsaWdodCA9IHRoaXMuX3BlbmRpbmcuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKGluZmxpZ2h0KSB7XG5cdFx0XHRyZXR1cm4gaW5mbGlnaHQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29yayA9IHRoaXMuX3NlcXVlbmNlci5xdWV1ZShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gUmUtY2hlY2sgaW5zaWRlIHRoZSBzZXF1ZW5jZXIgXHUyMDE0IGFub3RoZXIgY2FsbGVyIG1heSBoYXZlIHJhY2VkXG5cdFx0XHQvLyB1cyBhbmQgcG9wdWxhdGVkIHRoZSBlbnRyeSB3aGlsZSB3ZSB3ZXJlIHF1ZXVlZC5cblx0XHRcdGNvbnN0IHNldHRsZWQgPSB0aGlzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKHNldHRsZWQpIHtcblx0XHRcdFx0cmV0dXJuIHNldHRsZWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBEb24ndCBlYWdlcmx5IHNwYXduIGEgcHJvdmlzaW9uYWwgYmFja2VuZCBzZXNzaW9uIGluIGFuXG5cdFx0XHQvLyB1bnRydXN0ZWQgdGFyZ2V0IGZvbGRlciBcdTIwMTQgdGhhdCB3b3VsZCBzdGFydCBhbiBhZ2VudCBpbiB0aGVcblx0XHRcdC8vIGZvbGRlciBiZWZvcmUgdGhlIHVzZXIgaGFzIG9wdGVkIGluLiBUaGlzIHByZS13YXJtIGlzIGEgc2lsZW50XG5cdFx0XHQvLyBvcHRpbWl6YXRpb247IHRydXN0IGlzIHJlcXVlc3RlZCBpbnRlcmFjdGl2ZWx5IG9uIGZpcnN0IFNlbmRcblx0XHRcdC8vIChzZWUgQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIpLlxuXHRcdFx0aWYgKCFhd2FpdCB0aGlzLl9pc1RhcmdldEZvbGRlclRydXN0ZWQod29ya2luZ0RpcmVjdG9yeSkpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gdGhpcy5fdG9CYWNrZW5kVXJpKHNlc3Npb25SZXNvdXJjZSwgcHJvdmlkZXIpO1xuXHRcdFx0Y29uc3QgaW5pdGlhbENvbmZpZyA9IHRoaXMuX2dldEluaXRpYWxDb25maWcoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0XHRcdHNlc3Npb246IGJhY2tlbmRTZXNzaW9uLFxuXHRcdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogdGhpcy5fY29tcHV0ZVdvcmtpbmdEaXJlY3Rvcmllcyh3b3JraW5nRGlyZWN0b3J5LCBwcm92aWRlciksXG5cdFx0XHRcdFx0Y29uZmlnOiBpbml0aWFsQ29uZmlnLFxuXHRcdFx0XHRcdHByb2dyZXNzVG9rZW46IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy5fZW50cmllcy5zZXQoc2Vzc2lvblJlc291cmNlLCB7IGJhY2tlbmRTZXNzaW9uOiBjcmVhdGVkLCBjb25maWc6IHsgLi4uKGluaXRpYWxDb25maWcgPz8ge30pIH0sIHdvcmtpbmdEaXJlY3RvcnkgfSk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0cmV0dXJuIGNyZWF0ZWQ7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0UHJvdmlzaW9uYWxdIEZhaWxlZCB0byBjcmVhdGUgcHJvdmlzaW9uYWwgc2Vzc2lvbiBmb3IgJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX06ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX3BlbmRpbmcuc2V0KHNlc3Npb25SZXNvdXJjZSwgd29yayk7XG5cdFx0d29yay5maW5hbGx5KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9wZW5kaW5nLmdldChzZXNzaW9uUmVzb3VyY2UpID09PSB3b3JrKSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmcuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHdvcms7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgZm9sZGVyIHRoZSBwcm92aXNpb25hbCBhZ2VudCB3b3VsZCBydW4gaW4gaXMgdHJ1c3RlZC4gV2hlbiBhXG5cdCAqIHdvcmtpbmcgZGlyZWN0b3J5IGlzIGtub3duIChpdCBtYXkgYmUgYSBzdGFuZGFsb25lIGZvbGRlciBvdXRzaWRlIHRoZVxuXHQgKiBvcGVuIHdvcmtzcGFjZSwgZS5nLiBhIHBlci1zZXNzaW9uIGZvbGRlciksIGdhdGUgb24gdGhhdCBmb2xkZXIncyB0cnVzdDtcblx0ICogb3RoZXJ3aXNlIGZhbGwgYmFjayB0byB3aG9sZS13b3Jrc3BhY2UgdHJ1c3QuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9pc1RhcmdldEZvbGRlclRydXN0ZWQod29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdGNvbnN0IHsgdHJ1c3RlZCB9ID0gYXdhaXQgdGhpcy5fd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5nZXRVcmlUcnVzdEluZm8od29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRyZXR1cm4gdHJ1c3RlZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCk7XG5cdH1cblxuXHRhc3luYyB0cnlSZWJpbmQoXG5cdFx0b2xkU2Vzc2lvblJlc291cmNlOiBVUkksXG5cdFx0bmV3U2Vzc2lvblJlc291cmNlOiBVUkksXG5cdFx0cHJvdmlkZXI6IHN0cmluZyxcblx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsXG5cdCk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gSWYgdGhlIG5ldyByZXNvdXJjZSBhbHJlYWR5IGhhcyBhIHByb3Zpc2lvbmFsIChlLmcuIHRyeVJlYmluZCB3YXNcblx0XHQvLyBjYWxsZWQgdHdpY2UpLCBzaG9ydC1jaXJjdWl0LlxuXHRcdGNvbnN0IGFscmVhZHlCb3VuZCA9IHRoaXMuZ2V0KG5ld1Nlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKGFscmVhZHlCb3VuZCkge1xuXHRcdFx0cmV0dXJuIGFscmVhZHlCb3VuZDtcblx0XHR9XG5cblx0XHQvLyBNYWtlIHN1cmUgYW55IGluLWZsaWdodCBjcmVhdGUgZm9yIHRoZSBvbGQgcmVzb3VyY2Ugc2V0dGxlcyBiZWZvcmVcblx0XHQvLyB3ZSByZWFkIGl0cyBzdGF0ZSBcdTIwMTQgb3RoZXJ3aXNlIHdlIG1heSBub3Qgc2VlIHRoZSB1c2VyJ3MgbW9zdFxuXHRcdC8vIHJlY2VudCBkaXNwYXRjaC5cblx0XHRhd2FpdCB0aGlzLndhaXRGb3JQZW5kaW5nKG9sZFNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRjb25zdCBvbGRFbnRyeSA9IHRoaXMuX2VudHJpZXMuZ2V0KG9sZFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFvbGRFbnRyeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBUaGUgd29ya2JlbmNoIG93bnMgdGhlIHNvdXJjZSBvZiB0cnV0aCBmb3IgcHJvdmlzaW9uYWwgY29uZmlnOiBpdFxuXHRcdC8vIHdhcyBzZWVkZWQgYnkgYF9nZXRJbml0aWFsQ29uZmlnKClgIGF0IGNyZWF0ZSB0aW1lIGFuZCB1cGRhdGVkXG5cdFx0Ly8gc3luY2hyb25vdXNseSBieSBgYXBwbHlDb25maWdDaGFuZ2VgIGZvciBhbnkgcGlja2VyIGNoaXAgY2hhbmdlcy5cblx0XHQvLyBSZWFkIHN0cmFpZ2h0IGZyb20gdGhlIGVudHJ5OyBkbyBOT1Qgcm91bmQtdHJpcCB0aHJvdWdoIHRoZSBhZ2VudCdzXG5cdFx0Ly8gYHN0YXRlLmNvbmZpZy52YWx1ZXNgLCB3aGljaCBsYWdzIGJlaGluZCBieSBhIHNlcnZlciBlY2hvLlxuXHRcdGNvbnN0IGNvbmZpZyA9IG9sZEVudHJ5LmNvbmZpZztcblx0XHRjb25zdCBuZXdCYWNrZW5kU2Vzc2lvbiA9IHRoaXMuX3RvQmFja2VuZFVyaShuZXdTZXNzaW9uUmVzb3VyY2UsIHByb3ZpZGVyKTtcblxuXHRcdC8vIElmIGEgY29udmVyc2F0aW9uIHdhcyBpbXBvcnRlZCAoXCJDb250aW51ZSBpblx1MjAyNlwiKSBpbnRvIHRoaXMgc2Vzc2lvbiwgc2VlZFxuXHRcdC8vIGl0IGFzIHJlYWwgZWRpdGFibGUgaGlzdG9yeSBvbiB0aGUgcmVib3VuZCAocmVhbCkgc2Vzc2lvbi4gVGhlIHN0YXNoIHdhc1xuXHRcdC8vIG1vdmVkIGZyb20gdGhlIHVudGl0bGVkIHJlc291cmNlIHRvIGBuZXdTZXNzaW9uUmVzb3VyY2VgIGF0IGdyYWR1YXRpb24uXG5cdFx0Ly8gQ2FycnkgdGhlIHNvdXJjZSBzZXNzaW9uJ3MgbW9kZWwgc28gdGhlIGltcG9ydGVkIHNlc3Npb24gcmVzdW1lcyBvbiB0aGVcblx0XHQvLyBzYW1lIG1vZGVsIGluc3RlYWQgb2YgdGhlIGhvc3QgZGVmYXVsdCAodGhlIG5vcm1hbCBwZXItdHVybiBtb2RlbCBwYXRoXG5cdFx0Ly8gaXMgc2tpcHBlZCBmb3IgaW1wb3J0cywgd2hpY2ggbWF0ZXJpYWxpemUgZWFnZXJseSBhdCBjcmVhdGUgdGltZSkuXG5cdFx0Y29uc3QgaW1wb3J0ZWQgPSB0aGlzLl9pbXBvcnRDb252ZXJzYXRpb25TdG9yZS50YWtlKG5ld1Nlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRsZXQgY3JlYXRlZDogVVJJO1xuXHRcdHRyeSB7XG5cdFx0XHRjcmVhdGVkID0gYXdhaXQgdGhpcy5fYWdlbnRIb3N0U2VydmljZS5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cHJvdmlkZXIsXG5cdFx0XHRcdHNlc3Npb246IG5ld0JhY2tlbmRTZXNzaW9uLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IHRoaXMuX2NvbXB1dGVXb3JraW5nRGlyZWN0b3JpZXMod29ya2luZ0RpcmVjdG9yeSwgcHJvdmlkZXIpLFxuXHRcdFx0XHRjb25maWcsXG5cdFx0XHRcdC4uLihpbXBvcnRlZCA/IHsgbW9kZWw6IGltcG9ydGVkLm1vZGVsLCBpbXBvcnRDb252ZXJzYXRpb246IHsgdHVybnM6IGltcG9ydGVkLnR1cm5zLCBtb2RlbDogaW1wb3J0ZWQubW9kZWwgfSB9IDoge30pLFxuXHRcdFx0XHRwcm9ncmVzc1Rva2VuOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0UHJvdmlzaW9uYWxdIEZhaWxlZCB0byBjcmVhdGUgcmVib3VuZCBwcm92aXNpb25hbDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIEF0b21pY2FsbHkgc3dhcCBlbnRyaWVzOiBpbnNlcnQgdGhlIG5ldyBlbnRyeSwgZHJvcCB0aGUgb2xkIG9uZS5cblx0XHQvLyBPcmRlciBtYXR0ZXJzIFx1MjAxNCB0aGUgb2xkIGVudHJ5J3MgYGRpc3Bvc2VgIGJlbG93IG11c3Qgbm90IHJhY2Ugd2l0aFxuXHRcdC8vIHRoZSBwaWNrZXIncyBgb25EaWRDaGFuZ2VgIHJlLXJlbmRlciByZWFkaW5nIHRoZSBuZXcgZW50cnkuXG5cdFx0dGhpcy5fZW50cmllcy5zZXQobmV3U2Vzc2lvblJlc291cmNlLCB7IGJhY2tlbmRTZXNzaW9uOiBjcmVhdGVkLCBjb25maWc6IHsgLi4uY29uZmlnIH0sIHdvcmtpbmdEaXJlY3RvcnksIHJlc29sdmVkQ29uZmlnOiBvbGRFbnRyeS5yZXNvbHZlZENvbmZpZyB9KTtcblx0XHR0aGlzLl9lbnRyaWVzLmRlbGV0ZShvbGRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRoaXMuX3Jlc29sdmVkQ29uZmlncy5kZWxldGUob2xkU2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLl9yZXNvbHZlZENvbmZpZ1JlcXVlc3RTZXEuZGVsZXRlKG9sZFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5fcmVib3VuZC5hZGQob2xkU2Vzc2lvblJlc291cmNlKTtcblx0XHQvLyBPbmx5IG5vdGlmeSBmb3IgdGhlIG5ldyByZXNvdXJjZS4gRmlyaW5nIGZvciBgb2xkU2Vzc2lvblJlc291cmNlYFxuXHRcdC8vIHdvdWxkIHJhY2UgdGhlIGNoYXQgd2lkZ2V0J3MgYG9uRGlkQ2hhbmdlVmlld01vZGVsYDogdGhlIHBpY2tlciBpc1xuXHRcdC8vIHN0aWxsIGJvdW5kIHRvIHRoZSBvbGQgVVJJIGFuZCB3b3VsZCByZS1lbnRlciBgZ2V0T3JDcmVhdGVgLFxuXHRcdC8vIHNwaW5uaW5nIHVwIGFuIG9ycGhhbiBwcm92aXNpb25hbCBzZXNzaW9uIG9uIHRoZSBhZ2VudC5cblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKG5ld1Nlc3Npb25SZXNvdXJjZSk7XG5cblx0XHQvLyBEaXNwb3NlIHRoZSB0ZW1wb3JhcnkgcHJvdmlzaW9uYWwuIEJlc3QtZWZmb3J0OyB0aGUgYWdlbnQgdHJlYXRzXG5cdFx0Ly8gaXQgYXMgYW4gaW4tbWVtb3J5IGRyb3AgKG5vIFNESy93b3JrdHJlZSB0byB0ZWFyIGRvd24pLlxuXHRcdHRoaXMuX2FnZW50SG9zdFNlcnZpY2UuZGlzcG9zZVNlc3Npb24ob2xkRW50cnkuYmFja2VuZFNlc3Npb24pLmNhdGNoKGVyciA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RQcm92aXNpb25hbF0gRmFpbGVkIHRvIGRpc3Bvc2UgdGVtcG9yYXJ5IHByb3Zpc2lvbmFsICR7b2xkRW50cnkuYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKX06ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGNyZWF0ZWQ7XG5cdH1cblxuXHQvKipcblx0ICogUmVjcmVhdGUgdGhlIHByb3Zpc2lvbmFsIGJhY2tlbmQgc2Vzc2lvbiBmb3IgYHNlc3Npb25SZXNvdXJjZWAgYXQgYSBuZXdcblx0ICogd29ya2luZyBkaXJlY3RvcnksIHByZXNlcnZpbmcgdGhlIHVzZXIncyBjb25maWcgY2hvaWNlcy4gQSBjcmVhdGVkXG5cdCAqIHNlc3Npb24ncyBjd2QgaXMgaW1tdXRhYmxlLCBzbyB0aGUgb25seSB3YXkgdG8gaG9ub3IgYSBmb2xkZXIgY2hhbmdlIGlzIHRvXG5cdCAqIGRpc3Bvc2UgYW5kIHJlY3JlYXRlLiBSZXVzZXMgdGhlIHNhbWUgZGV0ZXJtaW5pc3RpYyBiYWNrZW5kIFVSSSBzbyB0aGVcblx0ICogY2hhdC1yZXNvdXJjZS10by1iYWNrZW5kIG1hcHBpbmcgc3RheXMgc3RhYmxlLiBTZXF1ZW5jZXItcXVldWVkIHNvIGl0XG5cdCAqIHNldHRsZXMgaW4gb3JkZXIgd2l0aCBjb25maWctY2hpcCBjaGFuZ2VzIGZvciB0aGUgc2FtZSByZXNvdXJjZS5cblx0ICovXG5cdHByaXZhdGUgX2NoYW5nZVdvcmtpbmdEaXJlY3Rvcnkoc2Vzc2lvblJlc291cmNlOiBVUkksIG5ld1dvcmtpbmdEaXJlY3Rvcnk6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9zZXF1ZW5jZXIucXVldWUoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZW50cmllcy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmICghZW50cnkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVudHJ5LndvcmtpbmdEaXJlY3Rvcnk/LnRvU3RyaW5nKCkgPT09IG5ld1dvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBSZWFkIHRoZSBzdHJpcHBlZCBiYWNrZW5kIHByb3ZpZGVyIHNjaGVtZSAoZS5nLiBgY29waWxvdGApLCBub3Rcblx0XHRcdC8vIHRoZSBmdWxsIGBhZ2VudC1ob3N0LSpgIGNoYXQtcmVzb3VyY2Ugc2NoZW1lLlxuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBlbnRyeS5iYWNrZW5kU2Vzc2lvbi5zY2hlbWU7XG5cdFx0XHRjb25zdCBjb25maWcgPSB7IC4uLmVudHJ5LmNvbmZpZyB9O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fYWdlbnRIb3N0U2VydmljZS5kaXNwb3NlU2Vzc2lvbihlbnRyeS5iYWNrZW5kU2Vzc2lvbik7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0UHJvdmlzaW9uYWxdIEZhaWxlZCB0byBkaXNwb3NlIHByb3Zpc2lvbmFsIGJlZm9yZSBjd2QgY2hhbmdlICR7ZW50cnkuYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKX06ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGNyZWF0ZWQ6IFVSSTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNyZWF0ZWQgPSBhd2FpdCB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0XHRcdHNlc3Npb246IGVudHJ5LmJhY2tlbmRTZXNzaW9uLFxuXHRcdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogdGhpcy5fY29tcHV0ZVdvcmtpbmdEaXJlY3RvcmllcyhuZXdXb3JraW5nRGlyZWN0b3J5LCBwcm92aWRlciksXG5cdFx0XHRcdFx0Y29uZmlnLFxuXHRcdFx0XHRcdHByb2dyZXNzVG9rZW46IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RQcm92aXNpb25hbF0gRmFpbGVkIHRvIHJlY3JlYXRlIHByb3Zpc2lvbmFsIGF0IG5ldyBjd2Q6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0XHQvLyBUaGUgb2xkIHByb3Zpc2lvbmFsIGlzIGdvbmU7IGRyb3AgdGhlIGVudHJ5IHNvIHRoZSBuZXh0XG5cdFx0XHRcdC8vIGdldE9yQ3JlYXRlIHJlYnVpbGRzIGl0IGZyb20gc2NyYXRjaC5cblx0XHRcdFx0dGhpcy5fZW50cmllcy5kZWxldGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9lbnRyaWVzLnNldChzZXNzaW9uUmVzb3VyY2UsIHsgYmFja2VuZFNlc3Npb246IGNyZWF0ZWQsIGNvbmZpZywgd29ya2luZ0RpcmVjdG9yeTogbmV3V29ya2luZ0RpcmVjdG9yeSwgcmVzb2x2ZWRDb25maWc6IGVudHJ5LnJlc29sdmVkQ29uZmlnIH0pO1xuXHRcdFx0Ly8gUmUtcmVzb2x2ZSBjb25maWcgYWdhaW5zdCB0aGUgbmV3IGN3ZCBzbyBjaGlwIHNjaGVtYXMgcmVmcmVzaC5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgdGhpcy5fYWdlbnRIb3N0U2VydmljZS5yZXNvbHZlU2Vzc2lvbkNvbmZpZyh7XG5cdFx0XHRcdFx0cHJvdmlkZXIsXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogbmV3V29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdFx0XHRjb25maWc6IHsgLi4uY29uZmlnIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fZW50cmllcy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0aWYgKGN1cnJlbnQgJiYgY3VycmVudC5iYWNrZW5kU2Vzc2lvbi50b1N0cmluZygpID09PSBjcmVhdGVkLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHRjdXJyZW50LmNvbmZpZyA9IHsgLi4uY3VycmVudC5jb25maWcsIC4uLnJlc29sdmVkLnZhbHVlcyB9O1xuXHRcdFx0XHRcdGN1cnJlbnQucmVzb2x2ZWRDb25maWcgPSByZXNvbHZlZDtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFByb3Zpc2lvbmFsXSBzY2hlbWEgcmUtcmVzb2x2ZSBhZnRlciBjd2QgY2hhbmdlIGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBkaXNwb3NlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMud2FpdEZvclBlbmRpbmcoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2VudHJpZXMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5fcmVzb2x2ZWRDb25maWdzLmRlbGV0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRoaXMuX3Jlc29sdmVkQ29uZmlnUmVxdWVzdFNlcS5kZWxldGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2VudHJpZXMuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLmRpc3Bvc2VTZXNzaW9uKGVudHJ5LmJhY2tlbmRTZXNzaW9uKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFByb3Zpc2lvbmFsXSBGYWlsZWQgdG8gZGlzcG9zZSBwcm92aXNpb25hbCAke2VudHJ5LmJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCl9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdC8vIEZpcmUtYW5kLWZvcmdldCBjbGVhbnVwIGZvciBhbnkgcHJvdmlzaW9uYWxzIHN0aWxsIHRyYWNrZWQuIEF2b2lkXG5cdFx0Ly8gYXdhaXRpbmcgaW4gYGRpc3Bvc2UoKWAgdG8ga2VlcCB3b3JrYmVuY2ggdGVhcmRvd24gc3luY2hyb25vdXMuXG5cdFx0Zm9yIChjb25zdCBbLCBlbnRyeV0gb2YgdGhpcy5fZW50cmllcykge1xuXHRcdFx0dGhpcy5fYWdlbnRIb3N0U2VydmljZS5kaXNwb3NlU2Vzc2lvbihlbnRyeS5iYWNrZW5kU2Vzc2lvbikuY2F0Y2goKCkgPT4geyAvKiBzd2FsbG93IG9uIHNodXRkb3duICovIH0pO1xuXHRcdH1cblx0XHR0aGlzLl9lbnRyaWVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcGVuZGluZy5jbGVhcigpO1xuXHRcdHRoaXMuX3Jlc29sdmVkQ29uZmlncy5jbGVhcigpO1xuXHRcdHRoaXMuX3Jlc29sdmVkQ29uZmlnUmVxdWVzdFNlcS5jbGVhcigpO1xuXHRcdHRoaXMuX3JlYm91bmQuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydCB0aGUgY2hhdC1pbnB1dCBVSSBzZXNzaW9uIFVSSSAoYGFnZW50LWhvc3QtUFJPVklERVI6LzxpZD5gKVxuXHQgKiB0byB0aGUgYWdlbnQtaG9zdCBiYWNrZW5kIFVSSSAoYFBST1ZJREVSOi88aWQ+YCkuXG5cdCAqL1xuXHRwcml2YXRlIF90b0JhY2tlbmRVcmkoc2Vzc2lvblJlc291cmNlOiBVUkksIHByb3ZpZGVyOiBzdHJpbmcpOiBVUkkge1xuXHRcdGNvbnN0IHJhd0lkID0gc2Vzc2lvblJlc291cmNlLnBhdGgucmVwbGFjZSgvXlxcLy8sICcnKTtcblx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6IHByb3ZpZGVyLCBwYXRoOiBgLyR7cmF3SWR9YCB9KTtcblx0fVxuXG5cdGdldFJlc29sdmVkQ29uZmlnKHNlc3Npb25SZXNvdXJjZTogVVJJKTogUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9lbnRyaWVzLmdldChzZXNzaW9uUmVzb3VyY2UpPy5yZXNvbHZlZENvbmZpZyA/PyB0aGlzLl9yZXNvbHZlZENvbmZpZ3MuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRhc3luYyByZWZyZXNoUmVzb2x2ZWRDb25maWcoXG5cdFx0c2Vzc2lvblJlc291cmNlOiBVUkksXG5cdFx0cHJvdmlkZXI6IHN0cmluZyxcblx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0Y29uZmlnOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCxcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VxID0gKHRoaXMuX3Jlc29sdmVkQ29uZmlnUmVxdWVzdFNlcS5nZXQoc2Vzc2lvblJlc291cmNlKSA/PyAwKSArIDE7XG5cdFx0dGhpcy5fcmVzb2x2ZWRDb25maWdSZXF1ZXN0U2VxLnNldChzZXNzaW9uUmVzb3VyY2UsIHNlcSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgdGhpcy5fYWdlbnRIb3N0U2VydmljZS5yZXNvbHZlU2Vzc2lvbkNvbmZpZyh7XG5cdFx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0XHRjb25maWcsXG5cdFx0XHR9KTtcblx0XHRcdGlmICh0aGlzLl9yZXNvbHZlZENvbmZpZ1JlcXVlc3RTZXEuZ2V0KHNlc3Npb25SZXNvdXJjZSkgIT09IHNlcSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2VudHJpZXMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0ZW50cnkuY29uZmlnID0geyAuLi5lbnRyeS5jb25maWcsIC4uLnJlc29sdmVkLnZhbHVlcyB9O1xuXHRcdFx0XHRlbnRyeS5yZXNvbHZlZENvbmZpZyA9IHJlc29sdmVkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fcmVzb2x2ZWRDb25maWdzLnNldChzZXNzaW9uUmVzb3VyY2UsIHJlc29sdmVkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoc2Vzc2lvblJlc291cmNlKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFByb3Zpc2lvbmFsXSBzY2hlbWEgcmUtcmVzb2x2ZSBmYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGFwcGx5Q29uZmlnQ2hhbmdlKFxuXHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLFxuXHRcdHByb3ZpZGVyOiBzdHJpbmcsXG5cdFx0d29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdHBhcnRpYWw6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LFxuXHQpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIFNZTkNIUk9OT1VTIHByZS1hd2FpdCBtdXRhdGlvbjogYSBgdHJ5UmViaW5kYCByYWNpbmcgZHVyaW5nXG5cdFx0Ly8gYGdldE9yQ3JlYXRlYCBvbmx5IGF3YWl0cyBgX3BlbmRpbmdgIChub3QgdGhpcyBzZXJ2aWNlJ3Ncblx0XHQvLyBgX3NlcXVlbmNlcmApLCBzbyB0aGUgcmVib3VuZCBlbnRyeSBtdXN0IG9ic2VydmUgdGhlIGxhdGVzdFxuXHRcdC8vIGBlbnRyeS5jb25maWdgIGV2ZW4gaWYgdGhlIHVzZXIgY2xpY2tzIFNlbmQgdGhlIHZlcnkgbmV4dCB0aWNrLlxuXHRcdGNvbnN0IHByZUV4aXN0aW5nID0gdGhpcy5fZW50cmllcy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAocHJlRXhpc3RpbmcpIHtcblx0XHRcdE9iamVjdC5hc3NpZ24ocHJlRXhpc3RpbmcuY29uZmlnLCBwYXJ0aWFsKTtcblx0XHRcdC8vIEtlZXAgb3ZlcmxheSB2YWx1ZXMgaW4gc3luYyB3aXRoIHRoZSBjYWNoZSBzbyB0aGUgcGlja2VyICh3aGljaFxuXHRcdFx0Ly8gcHJlZmVycyBgb3ZlcmxheS52YWx1ZXNgKSBkb2Vzbid0IHJlbmRlciBhIHN0YWxlIHZhbHVlIGR1cmluZyB0aGVcblx0XHRcdC8vIHJlLXJlc29sdmUgcm91bmQtdHJpcC4gU2NoZW1hIGlzIGxlZnQgYXMtaXM7IHRoZSBxdWV1ZWQgcmVzb2x2ZVxuXHRcdFx0Ly8gcmVwbGFjZXMgYm90aCBhdG9taWNhbGx5IGJlbG93LlxuXHRcdFx0aWYgKHByZUV4aXN0aW5nLnJlc29sdmVkQ29uZmlnKSB7XG5cdFx0XHRcdHByZUV4aXN0aW5nLnJlc29sdmVkQ29uZmlnID0ge1xuXHRcdFx0XHRcdC4uLnByZUV4aXN0aW5nLnJlc29sdmVkQ29uZmlnLFxuXHRcdFx0XHRcdHZhbHVlczogeyAuLi5wcmVFeGlzdGluZy5yZXNvbHZlZENvbmZpZy52YWx1ZXMsIC4uLnBhcnRpYWwgfSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgYmFja2VuZCA9IGF3YWl0IHRoaXMuZ2V0T3JDcmVhdGUoc2Vzc2lvblJlc291cmNlLCBwcm92aWRlciwgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0aWYgKCFiYWNrZW5kKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIXByZUV4aXN0aW5nKSB7XG5cdFx0XHQvLyBGcmVzaCBlbnRyeSBqdXN0IGNyZWF0ZWQgYnkgZ2V0T3JDcmVhdGU7IGFwcGx5IHBhcnRpYWwgb24gdG9wLlxuXHRcdFx0Ly8gTm8gYHJlc29sdmVkQ29uZmlnYCBleGlzdHMgeWV0IG9uIGEgbmV3bHktY3JlYXRlZCBlbnRyeSwgc29cblx0XHRcdC8vIHRoZXJlJ3Mgbm90aGluZyB0byBtZXJnZSBpbnRvLlxuXHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9lbnRyaWVzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdE9iamVjdC5hc3NpZ24oZW50cnkuY29uZmlnLCBwYXJ0aWFsKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaChiYWNrZW5kLnRvU3RyaW5nKCksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHBhcnRpYWwsXG5cdFx0fSk7XG5cblx0XHQvLyBTZXF1ZW5jZSBPTkxZIHRoZSByZS1yZXNvbHZlIHNvIHJhY2luZyBjaGlwIGNsaWNrcyBzZXR0bGUgaW4gb3JkZXJcblx0XHQvLyAoZS5nLiB3b3JrdHJlZSBcdTIxOTIgZm9sZGVyIGlzc3VlZCBiZWZvcmUgdGhlIGZpcnN0IHJlc29sdmUgcmV0dXJucykuXG5cdFx0cmV0dXJuIHRoaXMuX3NlcXVlbmNlci5xdWV1ZShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX2VudHJpZXMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoIWN1cnJlbnQpIHtcblx0XHRcdFx0cmV0dXJuIGJhY2tlbmQ7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHRoaXMuX2FnZW50SG9zdFNlcnZpY2UucmVzb2x2ZVNlc3Npb25Db25maWcoe1xuXHRcdFx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0XHRcdHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdFx0Y29uZmlnOiB7IC4uLmN1cnJlbnQuY29uZmlnIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBzdGlsbEN1cnJlbnQgPSB0aGlzLl9lbnRyaWVzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoc3RpbGxDdXJyZW50ID09PSBjdXJyZW50KSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRWYWx1ZXMgPSB7IC4uLnJlc29sdmVkLnZhbHVlcyB9O1xuXHRcdFx0XHRcdC8vIE1lcmdlIHJlc29sdmVkIHZhbHVlcyBpbnRvIGVudHJ5LmNvbmZpZyBzbyBhIGxhdGVyIGB0cnlSZWJpbmRgXG5cdFx0XHRcdFx0Ly8gbWF0ZXJpYWxpemVzIHRoZSBiYWNrZW5kIHNlc3Npb24gd2l0aCB0aGUgdmFsaWRhdGVkIGNvbmZpZ3VyYXRpb25cblx0XHRcdFx0XHQvLyB0aGUgVUkgaXMgZGlzcGxheWluZy4gTWVyZ2UgKG5vdCByZXBsYWNlKSBzbyBhbnkga2V5cyB0aGUgc2NoZW1hXG5cdFx0XHRcdFx0Ly8gZG9lc24ndCBrbm93IGFib3V0IHN1cnZpdmUuXG5cdFx0XHRcdFx0Y29uc3QgbWVyZ2VkQ29uZmlnID0geyAuLi5zdGlsbEN1cnJlbnQuY29uZmlnLCAuLi5yZXNvbHZlZFZhbHVlcyB9O1xuXHRcdFx0XHRcdGNvbnN0IGNvbmZpZ0NoYW5nZWQgPSAhZXF1YWxzKHN0aWxsQ3VycmVudC5jb25maWcsIG1lcmdlZENvbmZpZyk7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRDaGFuZ2VkID0gIWVxdWFscyhzdGlsbEN1cnJlbnQucmVzb2x2ZWRDb25maWcsIHJlc29sdmVkKTtcblx0XHRcdFx0XHRpZiAoY29uZmlnQ2hhbmdlZCB8fCByZXNvbHZlZENoYW5nZWQpIHtcblx0XHRcdFx0XHRcdHN0aWxsQ3VycmVudC5jb25maWcgPSBtZXJnZWRDb25maWc7XG5cdFx0XHRcdFx0XHRzdGlsbEN1cnJlbnQucmVzb2x2ZWRDb25maWcgPSByZXNvbHZlZDtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RQcm92aXNpb25hbF0gc2NoZW1hIHJlLXJlc29sdmUgZmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBiYWNrZW5kO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdvcmtiZW5jaC1zaWRlIGluaXRpYWwgY29uZmlnIHNlZWQgc2VudCBhdCBgY3JlYXRlU2Vzc2lvbmAgdGltZSBzbyB0aGVcblx0ICogYWdlbnQncyBvd24gc2VydmVyLXNpZGUgZGVmYXVsdHMgZG9uJ3QgZmlsbCBgc3RhdGUuY29uZmlnLnZhbHVlc2AgZm9yXG5cdCAqIGtleXMgdGhlIHdvcmtiZW5jaCB3YW50cyB0byBjb250cm9sLiBXaXRob3V0IHRoaXMsIHRoZSBtZXJnZSBmaWx0ZXIgaW5cblx0ICogYGFnZW50SG9zdFNlc3Npb25IYW5kbGVyYCBzZWVzIHRob3NlIGFnZW50IGRlZmF1bHRzIGFzIFwidXNlci1zZXRcIiBhbmRcblx0ICogZHJvcHMgdGhlIHdvcmtiZW5jaCBkZWZhdWx0cy5cblx0ICpcblx0ICogLSBgaXNvbGF0aW9uYDogd29ya2JlbmNoIGhhcyBubyBpc29sYXRpb24gcGlja2VyLCBzbyBhbHdheXMgYCdmb2xkZXInYC5cblx0ICogLSBgbW9kZWAgLyBgYXV0b0FwcHJvdmVgOiBzZWVkZWQgZnJvbSB0aGUgc2luZ2xlXG5cdCAqICAgYGNoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb25gIG9iamVjdCBzZXR0aW5nIChgbW9kZWAgYW5kXG5cdCAqICAgYGFwcHJvdmFsc2AgcHJvcGVydGllcykuIFRoZSBhcHByb3ZhbCBzZWVkIGlzIGNsYW1wZWQgdG8gYCdkZWZhdWx0J2Bcblx0ICogICB3aGVuIHRoZSBgY2hhdC50b29scy5nbG9iYWwuYXV0b0FwcHJvdmVgIHBvbGljeSBpcyBvZmYuIFRoZSBsb2NhbC1vbmx5XG5cdCAqICAgYGNoYXQucGVybWlzc2lvbnMuZGVmYXVsdGAgc2V0dGluZyBpcyBOT1QgdXNlZC5cblx0ICpcblx0ICogU2tpcHBlZCBlbnRpcmVseSBpbiB0aGUgQWdlbnRzIHdpbmRvdywgd2hlcmUgdGhlIHNlc3Npb25zIHByb3ZpZGVyXG5cdCAqIHN1cHBsaWVzIGNvbmZpZyB2aWEgYHJlcXVlc3QuYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ2AgaW5zdGVhZC5cblx0ICovXG5cdHByaXZhdGUgX2dldEluaXRpYWxDb25maWcoKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlnOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHsgW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTogJ2ZvbGRlcicgfTtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyZWREZWZhdWx0cyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElDaGF0RGVmYXVsdENvbmZpZ3VyYXRpb24+KENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRDb25maWd1cmF0aW9uKTtcblx0XHRjb25zdCBwb2xpY3lWYWx1ZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uR2xvYmFsQXV0b0FwcHJvdmUpLnBvbGljeVZhbHVlO1xuXG5cdFx0Y29uc3QgY29uZmlndXJlZEFwcHJvdmFscyA9IGdldENoYXRQZXJtaXNzaW9uTGV2ZWxGcm9tRGVmYXVsdENvbmZpZ3VyYXRpb24oY29uZmlndXJlZERlZmF1bHRzPy5hcHByb3ZhbHMpO1xuXHRcdGlmIChjb25maWd1cmVkQXBwcm92YWxzKSB7XG5cdFx0XHRjb25zdCBwb2xpY3lSZXN0cmljdGVkID0gcG9saWN5VmFsdWUgPT09IGZhbHNlO1xuXHRcdFx0Ly8gQnlwYXNzIGFuZCAobGVnYWN5KSBBdXRvcGlsb3QgYXV0by1hcHByb3ZlIGF0IGxlYXN0IHNvbWUgdG9vbFxuXHRcdFx0Ly8gY2FsbHMsIHNvIGNsYW1wIGFueXRoaW5nIGJ1dCBEZWZhdWx0IHVuZGVyIHBvbGljeS5cblx0XHRcdGNvbmZpZ1tTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXSA9IHBvbGljeVJlc3RyaWN0ZWQgJiYgY29uZmlndXJlZEFwcHJvdmFscyAhPT0gJ2RlZmF1bHQnID8gJ2RlZmF1bHQnIDogY29uZmlndXJlZEFwcHJvdmFscztcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWd1cmVkTW9kZSA9IGNvbmZpZ3VyZWREZWZhdWx0cz8ubW9kZTtcblx0XHRpZiAodHlwZW9mIGNvbmZpZ3VyZWRNb2RlID09PSAnc3RyaW5nJyAmJiBLTk9XTl9NT0RFX1ZBTFVFUy5oYXMoY29uZmlndXJlZE1vZGUpKSB7XG5cdFx0XHRjb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXSA9IGNvbmZpZ3VyZWRNb2RlO1xuXHRcdH1cblxuXHRcdHJldHVybiBtaWdyYXRlTGVnYWN5QXV0b3BpbG90Q29uZmlnKGNvbmZpZyk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oXG5cdElBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2UsXG5cdEFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSxcblx0SW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCxcbik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQWtEQSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsYUFBYSxtQkFBbUI7QUFDekMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1CQUFtQix3QkFBd0I7QUFDcEQsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsbUJBQW1CLHNEQUFzRjtBQUNsSCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1DQUFtQyxpQ0FBaUM7QUFDN0UsU0FBUyx5Q0FBeUM7QUFFM0MsTUFBTSw4Q0FDWixnQkFBNkQsNENBQTRDO0FBcUluRyxJQUFNLDZDQUFOLGNBQXlELFdBQWtFO0FBQUEsRUFnQmpJLFlBQ3FDLG1CQUNOLGFBQ2hCLGFBQzBCLHVCQUNPLHFCQUNLLDBCQUNULDBCQUNRLGtDQUNDLDBCQUNuRDtBQUNELFVBQU07QUFWOEI7QUFDTjtBQUVVO0FBQ087QUFDSztBQUNUO0FBQ1E7QUFDQztBQXRCckQsU0FBaUIsV0FBVyxJQUFJLFlBQW9CO0FBQ3BELFNBQWlCLFdBQVcsSUFBSSxZQUFzQztBQUN0RSxTQUFpQixtQkFBbUIs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
