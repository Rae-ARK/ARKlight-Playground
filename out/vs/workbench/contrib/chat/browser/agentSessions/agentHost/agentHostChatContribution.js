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
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Event } from "../../../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { mark } from "../../../../../../base/common/performance.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { localize } from "../../../../../../nls.js";
import { affectsAgentHostProviderPreference, IAgentHostService, shouldSurfaceLocalAgentHostProvider } from "../../../../../../platform/agentHost/common/agentService.js";
import { IAgentHostEnablementService } from "../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { LOCAL_AGENT_HOST_AUTHORITY } from "../../../../../../platform/agentHost/common/agentHostUri.js";
import { NotificationType } from "../../../../../../platform/agentHost/common/state/sessionActions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IDefaultAccountService } from "../../../../../../platform/defaultAccount/common/defaultAccount.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { IAgentHostFileSystemService } from "../../../../../services/agentHost/common/agentHostFileSystemService.js";
import { IAuthenticationService } from "../../../../../services/authentication/common/authentication.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
import { ChatSessionsExtensions, IChatSessionsService, isLocalAgentHostTarget } from "../../../common/chatSessionsService.js";
import { ICustomizationHarnessService } from "../../../common/customizationHarnessService.js";
import { ILanguageModelsService } from "../../../common/languageModels.js";
import { Target } from "../../../common/promptSyntax/promptTypes.js";
import { AgentCustomizationItemProvider } from "./agentCustomizationItemProvider.js";
import { AgentHostDownloadProgress } from "./agentHostDownloadProgress.js";
import { authenticateProtectedResources, AgentHostAuthTokenCache, resolveAuthenticationInteractively } from "./agentHostAuth.js";
import { AgentHostLanguageModelProvider, agentHostProviderSupportsAutoModel } from "./agentHostLanguageModelProvider.js";
import { AgentHostSessionHandler } from "./agentHostSessionHandler.js";
import { AgentHostPromptCacheNotification } from "./agentHostPromptCacheNotification.js";
import { IAgentHostActiveClientService } from "./agentHostActiveClientService.js";
import { AICustomizationManagementSection } from "../../../common/aiCustomizationWorkspaceService.js";
const LOCAL_AGENT_HOST_SESSION_TYPE_PREFIX = "agent-host-";
Registry.as(ChatSessionsExtensions.AsyncActivation).register({
  matchSessionType: (sessionType) => isLocalAgentHostTarget(sessionType),
  waitForActivation: waitForLocalAgentHostActivation
});
async function waitForLocalAgentHostActivation(accessor, sessionType) {
  const agentHostEnablementService = accessor.get(IAgentHostEnablementService);
  const agentHostService = accessor.get(IAgentHostService);
  const configurationService = accessor.get(IConfigurationService);
  const environmentService = accessor.get(IWorkbenchEnvironmentService);
  if (!agentHostEnablementService.enabled.get()) {
    return false;
  }
  const provider = getLocalAgentHostProviderForSessionType(sessionType);
  if (!provider) {
    return false;
  }
  while (true) {
    const rootState = agentHostService.rootState.value;
    if (rootState instanceof Error) {
      return false;
    }
    if (rootState) {
      return rootState.agents.some((agent) => agent.provider === provider && shouldSurfaceLocalAgentHostProvider(agent.provider, configurationService, environmentService.isSessionsWindow));
    }
    const changed = await Promise.race([
      Event.toPromise(agentHostService.rootState.onDidChange).then(() => true),
      Event.toPromise(agentHostService.onAgentHostExit).then(() => false)
    ]);
    if (!changed) {
      return false;
    }
  }
}
function getLocalAgentHostProviderForSessionType(sessionType) {
  if (!isLocalAgentHostTarget(sessionType) || !sessionType.startsWith(LOCAL_AGENT_HOST_SESSION_TYPE_PREFIX)) {
    return void 0;
  }
  return sessionType.slice(LOCAL_AGENT_HOST_SESSION_TYPE_PREFIX.length) || void 0;
}
import { AgentHostSessionHandler as AgentHostSessionHandler2 } from "./agentHostSessionHandler.js";
let AgentHostContribution = class extends Disposable {
  constructor(_agentHostService, _chatSessionsService, _defaultAccountService, _authenticationService, _logService, _languageModelsService, _instantiationService, _agentHostFileSystemService, _configurationService, _customizationHarnessService, environmentService, _activeClientService, agentHostEnablementService) {
    super();
    this._agentHostService = _agentHostService;
    this._chatSessionsService = _chatSessionsService;
    this._defaultAccountService = _defaultAccountService;
    this._authenticationService = _authenticationService;
    this._logService = _logService;
    this._languageModelsService = _languageModelsService;
    this._instantiationService = _instantiationService;
    this._agentHostFileSystemService = _agentHostFileSystemService;
    this._configurationService = _configurationService;
    this._customizationHarnessService = _customizationHarnessService;
    this._activeClientService = _activeClientService;
    this._agentRegistrations = this._register(new DisposableMap());
    /** Model providers keyed by agent provider, for pushing model updates. */
    this._modelProviders = /* @__PURE__ */ new Map();
    /** Dedupes redundant `authenticate` RPCs when the resolved token hasn't changed. */
    this._authTokenCache = new AgentHostAuthTokenCache();
    this._initialized = false;
    this._didStartInitialAuthentication = false;
    this._isSessionsWindow = environmentService.isSessionsWindow;
    this._enableSmokeTestDriver = !!environmentService.enableSmokeTestDriver;
    this._register(autorun((reader) => {
      if (agentHostEnablementService.enabled.read(reader)) {
        this._initialize();
      }
    }));
  }
  _initialize() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    this._promptCacheNotification = this._register(this._instantiationService.createInstance(AgentHostPromptCacheNotification));
    this._register(this._agentHostFileSystemService.registerAuthority(LOCAL_AGENT_HOST_AUTHORITY, this._agentHostService));
    this._register(this._agentHostService.rootState.onDidChange((rootState) => {
      this._handleRootStateChange(rootState);
    }));
    this._register(this._agentHostService.onAgentHostStart(() => {
      this._authTokenCache.clear();
    }));
    if (!this._isSessionsWindow) {
      const downloadProgress = this._register(this._instantiationService.createInstance(AgentHostDownloadProgress));
      this._register(this._agentHostService.onDidNotification((n) => {
        if (n.type === NotificationType.Progress) {
          downloadProgress.handleProgress(n);
        }
      }));
    }
    const initialRootState = this._agentHostService.rootState.value;
    if (initialRootState && !(initialRootState instanceof Error)) {
      this._handleRootStateChange(initialRootState);
    }
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (!affectsAgentHostProviderPreference(e, this._isSessionsWindow)) {
        return;
      }
      const current = this._agentHostService.rootState.value;
      if (current && !(current instanceof Error)) {
        this._handleRootStateChange(current);
      }
    }));
  }
  _shouldRegisterAgent(provider) {
    return shouldSurfaceLocalAgentHostProvider(provider, this._configurationService, this._isSessionsWindow);
  }
  _handleRootStateChange(rootState) {
    const allowed = rootState.agents.filter((a) => this._shouldRegisterAgent(a.provider));
    const incoming = new Set(allowed.map((a) => a.provider));
    for (const [provider] of this._agentRegistrations) {
      if (!incoming.has(provider)) {
        this._agentRegistrations.deleteAndDispose(provider);
        this._modelProviders.delete(provider);
      }
    }
    this._authenticateWithServer(allowed).catch(() => {
    });
    for (const agent of allowed) {
      if (!this._agentRegistrations.has(agent.provider)) {
        this._registerAgent(agent);
      } else {
        const modelProvider = this._modelProviders.get(agent.provider);
        modelProvider?.updateModels(agent.models);
      }
    }
  }
  _registerAgent(agent) {
    const store = new DisposableStore();
    this._agentRegistrations.set(agent.provider, store);
    const sessionType = `agent-host-${agent.provider}`;
    const agentId = sessionType;
    const vendor = sessionType;
    const ahService = this._agentHostService;
    store.add(this._chatSessionsService.registerChatSessionContribution({
      type: sessionType,
      name: agentId,
      displayName: agent.displayName,
      description: agent.description,
      customAgentTarget: this._isSessionsWindow ? void 0 : Target.GitHubCopilot,
      canDelegate: true,
      requiresCustomModels: true,
      supportsAutoModel: agentHostProviderSupportsAutoModel(agent.provider),
      requiresCopilotSignIn: true,
      agentHostProviderId: agent.provider,
      supportsDelegation: true,
      capabilities: {
        supportsCheckpoints: true,
        supportsPromptAttachments: true,
        supportsImageAttachments: true,
        get terminalCommandPrefix() {
          return ahService.initializeResult.get()?.terminalCommandPrefix;
        }
      }
    }));
    const agentRegistration = store.add(this._activeClientService.registerForAgent(sessionType));
    const syncProvider = agentRegistration.syncProvider;
    const itemProvider = store.add(this._instantiationService.createInstance(
      AgentCustomizationItemProvider,
      "local",
      void 0,
      (syncedUri) => agentRegistration.bundler.getOrigin(syncedUri)
    ));
    store.add(this._customizationHarnessService.registerExternalHarness({
      id: sessionType,
      label: localize("agentHostHarnessLabel.local", "{0} [Agent Host]", agent.displayName),
      icon: ThemeIcon.fromId(Codicon.server.id),
      // The Tools section is surfaced for the Copilot CLI agent host only.
      hiddenSections: agent.provider === "copilotcli" ? [AICustomizationManagementSection.Prompts] : [AICustomizationManagementSection.Tools, AICustomizationManagementSection.Prompts],
      hideGenerateButton: true,
      syncProvider,
      itemProvider
    }));
    const sessionHandler = store.add(this._instantiationService.createInstance(AgentHostSessionHandler, {
      provider: agent.provider,
      agentId,
      sessionType,
      fullName: agent.displayName,
      description: agent.description,
      connection: this._agentHostService,
      connectionAuthority: LOCAL_AGENT_HOST_AUTHORITY,
      resolveAuthentication: (resources) => this._resolveAuthenticationInteractively(resources),
      promptCacheNotification: this._promptCacheNotification
    }));
    store.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, sessionHandler));
    const vendorDescriptor = { vendor, displayName: agent.displayName, configuration: void 0, managementCommand: void 0, when: void 0 };
    this._languageModelsService.deltaLanguageModelChatProviderDescriptors([vendorDescriptor], []);
    store.add(toDisposable(() => this._languageModelsService.deltaLanguageModelChatProviderDescriptors([], [vendorDescriptor])));
    const modelProvider = store.add(new AgentHostLanguageModelProvider(sessionType, vendor));
    this._modelProviders.set(agent.provider, modelProvider);
    store.add(toDisposable(() => this._modelProviders.delete(agent.provider)));
    store.add(this._languageModelsService.registerLanguageModelProvider(vendor, modelProvider));
    modelProvider.updateModels(agent.models);
    store.add(this._defaultAccountService.onDidChangeDefaultAccount(() => {
      const agents = this._getRootAgents();
      this._authenticateWithServer(agents).catch(() => {
      });
    }));
    store.add(this._authenticationService.onDidChangeSessions(() => {
      const agents = this._getRootAgents();
      this._authenticateWithServer(agents).catch(() => {
      });
    }));
  }
  _getRootAgents() {
    const rootState = this._agentHostService.rootState.value;
    const agents = rootState && !(rootState instanceof Error) ? rootState.agents : [];
    return agents.filter((a) => this._shouldRegisterAgent(a.provider));
  }
  /**
   * Authenticate using protectedResources from agent info in root state.
   * Resolves tokens via the standard VS Code authentication service.
   */
  async _authenticateWithServer(agents) {
    const isInitialAuthentication = agents.length > 0 && !this._didStartInitialAuthentication;
    if (isInitialAuthentication) {
      this._didStartInitialAuthentication = true;
      mark("code/agentHost/willAuthenticate");
    }
    this._agentHostService.setAuthenticationPending(true);
    try {
      const testToken = this._getScenarioAutomationToken();
      if (testToken !== void 0) {
        await this._seedTestToken(agents, testToken);
        return;
      }
      await this._instantiationService.invokeFunction(authenticateProtectedResources, agents, {
        authTokenCache: this._authTokenCache,
        logPrefix: "[AgentHost]",
        authenticate: (request) => this._agentHostService.authenticate(request)
      });
    } catch (err) {
      this._logService.error("[AgentHost] Failed to authenticate with server", err);
    } finally {
      this._agentHostService.setAuthenticationPending(false);
      if (isInitialAuthentication) {
        mark("code/agentHost/didAuthenticate");
      }
    }
  }
  /**
   * Interactively prompt the user to authenticate when the server requires it.
   * Uses protectedResources from root state, resolves the auth provider,
   * creates a session (which triggers the login UI), and pushes the token
   * to the server. Returns true if authentication succeeded.
   */
  async _resolveAuthenticationInteractively(protectedResources) {
    const testToken = this._getScenarioAutomationToken();
    if (testToken !== void 0) {
      for (const resource of protectedResources) {
        await this._authTokenCache.authenticate(
          resource.resource,
          resource.scopes_supported,
          testToken,
          () => this._agentHostService.authenticate({ resource: resource.resource, token: testToken })
        );
      }
      return protectedResources.length > 0;
    }
    return this._instantiationService.invokeFunction(resolveAuthenticationInteractively, protectedResources, {
      authTokenCache: this._authTokenCache,
      logPrefix: "[AgentHost]",
      authenticate: (request) => this._agentHostService.authenticate(request)
    });
  }
  async _seedTestToken(agents, token) {
    for (const agent of agents) {
      for (const resource of agent.protectedResources ?? []) {
        await this._authTokenCache.authenticate(
          resource.resource,
          resource.scopes_supported,
          token,
          () => this._agentHostService.authenticate({ resource: resource.resource, token })
        );
      }
    }
  }
  _getScenarioAutomationToken() {
    if (!this._enableSmokeTestDriver) {
      return void 0;
    }
    const token = this._configurationService.getValue("chat.agentHost.unsafeTestToken");
    return typeof token === "string" && token.length > 0 ? token : void 0;
  }
};
AgentHostContribution.ID = "workbench.contrib.agentHostContribution";
AgentHostContribution = __decorateClass([
  __decorateParam(0, IAgentHostService),
  __decorateParam(1, IChatSessionsService),
  __decorateParam(2, IDefaultAccountService),
  __decorateParam(3, IAuthenticationService),
  __decorateParam(4, ILogService),
  __decorateParam(5, ILanguageModelsService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IAgentHostFileSystemService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, ICustomizationHarnessService),
  __decorateParam(10, IWorkbenchEnvironmentService),
  __decorateParam(11, IAgentHostActiveClientService),
  __decorateParam(12, IAgentHostEnablementService)
], AgentHostContribution);
export {
  AgentHostContribution,
  AgentHostSessionHandler2 as AgentHostSessionHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RDaGF0Q29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbWFyayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBhZmZlY3RzQWdlbnRIb3N0UHJvdmlkZXJQcmVmZXJlbmNlLCBJQWdlbnRIb3N0U2VydmljZSwgc2hvdWxkU3VyZmFjZUxvY2FsQWdlbnRIb3N0UHJvdmlkZXIsIHR5cGUgQWdlbnRQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTE9DQUxfQUdFTlRfSE9TVF9BVVRIT1JJVFkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyB0eXBlIFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IE5vdGlmaWNhdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IHR5cGUgQWdlbnRJbmZvLCB0eXBlIFJvb3RTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RlZmF1bHRBY2NvdW50L2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RGaWxlU3lzdGVtU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvbnNFeHRlbnNpb25zLCBJQXN5bmNDaGF0U2Vzc2lvbkFjdGl2YXRpb25SZWdpc3RyeSwgSUNoYXRTZXNzaW9uc1NlcnZpY2UsIGlzTG9jYWxBZ2VudEhvc3RUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IFRhcmdldCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgQWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyIH0gZnJvbSAnLi9hZ2VudEN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0RG93bmxvYWRQcm9ncmVzcyB9IGZyb20gJy4vYWdlbnRIb3N0RG93bmxvYWRQcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBhdXRoZW50aWNhdGVQcm90ZWN0ZWRSZXNvdXJjZXMsIEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlLCByZXNvbHZlQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZWx5IH0gZnJvbSAnLi9hZ2VudEhvc3RBdXRoLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdExhbmd1YWdlTW9kZWxQcm92aWRlciwgYWdlbnRIb3N0UHJvdmlkZXJTdXBwb3J0c0F1dG9Nb2RlbCB9IGZyb20gJy4vYWdlbnRIb3N0TGFuZ3VhZ2VNb2RlbFByb3ZpZGVyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFNlc3Npb25IYW5kbGVyIH0gZnJvbSAnLi9hZ2VudEhvc3RTZXNzaW9uSGFuZGxlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RQcm9tcHRDYWNoZU5vdGlmaWNhdGlvbiB9IGZyb20gJy4vYWdlbnRIb3N0UHJvbXB0Q2FjaGVOb3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5cbmNvbnN0IExPQ0FMX0FHRU5UX0hPU1RfU0VTU0lPTl9UWVBFX1BSRUZJWCA9ICdhZ2VudC1ob3N0LSc7XG5cblJlZ2lzdHJ5LmFzPElBc3luY0NoYXRTZXNzaW9uQWN0aXZhdGlvblJlZ2lzdHJ5PihDaGF0U2Vzc2lvbnNFeHRlbnNpb25zLkFzeW5jQWN0aXZhdGlvbikucmVnaXN0ZXIoe1xuXHRtYXRjaFNlc3Npb25UeXBlOiBzZXNzaW9uVHlwZSA9PiBpc0xvY2FsQWdlbnRIb3N0VGFyZ2V0KHNlc3Npb25UeXBlKSxcblx0d2FpdEZvckFjdGl2YXRpb246IHdhaXRGb3JMb2NhbEFnZW50SG9zdEFjdGl2YXRpb24sXG59KTtcblxuYXN5bmMgZnVuY3Rpb24gd2FpdEZvckxvY2FsQWdlbnRIb3N0QWN0aXZhdGlvbihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2Vzc2lvblR5cGU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRjb25zdCBhZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UpO1xuXHRjb25zdCBhZ2VudEhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBZ2VudEhvc3RTZXJ2aWNlKTtcblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRpZiAoIWFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmVuYWJsZWQuZ2V0KCkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdCBwcm92aWRlciA9IGdldExvY2FsQWdlbnRIb3N0UHJvdmlkZXJGb3JTZXNzaW9uVHlwZShzZXNzaW9uVHlwZSk7XG5cdGlmICghcHJvdmlkZXIpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHR3aGlsZSAodHJ1ZSkge1xuXHRcdGNvbnN0IHJvb3RTdGF0ZSA9IGFnZW50SG9zdFNlcnZpY2Uucm9vdFN0YXRlLnZhbHVlO1xuXHRcdGlmIChyb290U3RhdGUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAocm9vdFN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gcm9vdFN0YXRlLmFnZW50cy5zb21lKGFnZW50ID0+IGFnZW50LnByb3ZpZGVyID09PSBwcm92aWRlciAmJiBzaG91bGRTdXJmYWNlTG9jYWxBZ2VudEhvc3RQcm92aWRlcihhZ2VudC5wcm92aWRlciwgY29uZmlndXJhdGlvblNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhbmdlZCA9IGF3YWl0IFByb21pc2UucmFjZShbXG5cdFx0XHRFdmVudC50b1Byb21pc2UoYWdlbnRIb3N0U2VydmljZS5yb290U3RhdGUub25EaWRDaGFuZ2UpLnRoZW4oKCkgPT4gdHJ1ZSksXG5cdFx0XHRFdmVudC50b1Byb21pc2UoYWdlbnRIb3N0U2VydmljZS5vbkFnZW50SG9zdEV4aXQpLnRoZW4oKCkgPT4gZmFsc2UpLFxuXHRcdF0pO1xuXHRcdGlmICghY2hhbmdlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBnZXRMb2NhbEFnZW50SG9zdFByb3ZpZGVyRm9yU2Vzc2lvblR5cGUoc2Vzc2lvblR5cGU6IHN0cmluZyk6IEFnZW50UHJvdmlkZXIgfCB1bmRlZmluZWQge1xuXHRpZiAoIWlzTG9jYWxBZ2VudEhvc3RUYXJnZXQoc2Vzc2lvblR5cGUpIHx8ICFzZXNzaW9uVHlwZS5zdGFydHNXaXRoKExPQ0FMX0FHRU5UX0hPU1RfU0VTU0lPTl9UWVBFX1BSRUZJWCkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBzZXNzaW9uVHlwZS5zbGljZShMT0NBTF9BR0VOVF9IT1NUX1NFU1NJT05fVFlQRV9QUkVGSVgubGVuZ3RoKSB8fCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCB7IEFnZW50SG9zdFNlc3Npb25IYW5kbGVyIH0gZnJvbSAnLi9hZ2VudEhvc3RTZXNzaW9uSGFuZGxlci5qcyc7XG5cbi8qKlxuICogRGlzY292ZXJzIGF2YWlsYWJsZSBhZ2VudHMgZnJvbSB0aGUgYWdlbnQgaG9zdCBwcm9jZXNzIGFuZCBkeW5hbWljYWxseVxuICogcmVnaXN0ZXJzIGVhY2ggb25lIGFzIGEgY2hhdCBzZXNzaW9uIHR5cGUgd2l0aCBpdHMgb3duIHNlc3Npb24gaGFuZGxlcixcbiAqIGN1c3RvbWl6YXRpb24gaGFybmVzcywgYW5kIGxhbmd1YWdlIG1vZGVsIHByb3ZpZGVyLlxuICpcbiAqIEdhdGVkIG9uIHRoZSBgY2hhdC5hZ2VudEhvc3QuZW5hYmxlZGAgc2V0dGluZy5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50SG9zdENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuYWdlbnRIb3N0Q29udHJpYnV0aW9uJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hZ2VudFJlZ2lzdHJhdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxBZ2VudFByb3ZpZGVyLCBEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHQvKiogTW9kZWwgcHJvdmlkZXJzIGtleWVkIGJ5IGFnZW50IHByb3ZpZGVyLCBmb3IgcHVzaGluZyBtb2RlbCB1cGRhdGVzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFByb3ZpZGVycyA9IG5ldyBNYXA8QWdlbnRQcm92aWRlciwgQWdlbnRIb3N0TGFuZ3VhZ2VNb2RlbFByb3ZpZGVyPigpO1xuXG5cdC8qKiBEZWR1cGVzIHJlZHVuZGFudCBgYXV0aGVudGljYXRlYCBSUENzIHdoZW4gdGhlIHJlc29sdmVkIHRva2VuIGhhc24ndCBjaGFuZ2VkLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hdXRoVG9rZW5DYWNoZSA9IG5ldyBBZ2VudEhvc3RBdXRoVG9rZW5DYWNoZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzU2Vzc2lvbnNXaW5kb3c6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VuYWJsZVNtb2tlVGVzdERyaXZlcjogYm9vbGVhbjtcblx0cHJpdmF0ZSBfaW5pdGlhbGl6ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfZGlkU3RhcnRJbml0aWFsQXV0aGVudGljYXRpb24gPSBmYWxzZTtcblx0cHJpdmF0ZSBfcHJvbXB0Q2FjaGVOb3RpZmljYXRpb246IEFnZW50SG9zdFByb21wdENhY2hlTm90aWZpY2F0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWdlbnRIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hZ2VudEhvc3RTZXJ2aWNlOiBJQWdlbnRIb3N0U2VydmljZSxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElEZWZhdWx0QWNjb3VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdEFjY291bnRTZXJ2aWNlOiBJRGVmYXVsdEFjY291bnRTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUFnZW50SG9zdEZpbGVTeXN0ZW1TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdEZpbGVTeXN0ZW1TZXJ2aWNlOiBJQWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZTogSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUNsaWVudFNlcnZpY2U6IElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UgYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2U6IElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9pc1Nlc3Npb25zV2luZG93ID0gZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3c7XG5cdFx0dGhpcy5fZW5hYmxlU21va2VUZXN0RHJpdmVyID0gISFlbnZpcm9ubWVudFNlcnZpY2UuZW5hYmxlU21va2VUZXN0RHJpdmVyO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0aWYgKGFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmVuYWJsZWQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHRoaXMuX2luaXRpYWxpemUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9pbml0aWFsaXplKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pbml0aWFsaXplZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pbml0aWFsaXplZCA9IHRydWU7XG5cdFx0dGhpcy5fcHJvbXB0Q2FjaGVOb3RpZmljYXRpb24gPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RQcm9tcHRDYWNoZU5vdGlmaWNhdGlvbikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2FnZW50SG9zdEZpbGVTeXN0ZW1TZXJ2aWNlLnJlZ2lzdGVyQXV0aG9yaXR5KExPQ0FMX0FHRU5UX0hPU1RfQVVUSE9SSVRZLCB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlKSk7XG5cblx0XHQvLyBSZWFjdCB0byByb290IHN0YXRlIGNoYW5nZXMgKGFnZW50IGRpc2NvdmVyeSAvIHJlbW92YWwpXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYWdlbnRIb3N0U2VydmljZS5yb290U3RhdGUub25EaWRDaGFuZ2Uocm9vdFN0YXRlID0+IHtcblx0XHRcdHRoaXMuX2hhbmRsZVJvb3RTdGF0ZUNoYW5nZShyb290U3RhdGUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIENsZWFyIHRoZSBhdXRoIGNhY2hlIHdoZW5ldmVyIHRoZSBsb2NhbCBhZ2VudCBob3N0IChyZSlzdGFydHMgc28gdGhlXG5cdFx0Ly8gZmlyc3QgcG9zdC1yZXN0YXJ0IGF1dGhlbnRpY2F0ZSBSUEMgaXMgbmV2ZXIgc2tpcHBlZCBhcyBcInVuY2hhbmdlZFwiLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2FnZW50SG9zdFNlcnZpY2Uub25BZ2VudEhvc3RTdGFydCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9hdXRoVG9rZW5DYWNoZS5jbGVhcigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFN1cmZhY2UgdGhlIGFnZW50IGhvc3QncyBsYXp5LCBmaXJzdC11c2UgU0RLIGRvd25sb2FkIGFzIGEgcHJvZ3Jlc3Ncblx0XHQvLyBub3RpZmljYXRpb24uIFRoZSBBZ2VudHMgd2luZG93IHJlbmRlcnMgdGhpcyB2aWEgaXRzIG93biBzZXNzaW9uc1xuXHRcdC8vIHByb3ZpZGVyIChgQmFzZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXJgKSwgc28gb25seSB3aXJlIGl0IHVwIGhlcmVcblx0XHQvLyBmb3IgcmVndWxhciBlZGl0b3Igd2luZG93cyB0byBhdm9pZCBkdXBsaWNhdGUgbm90aWZpY2F0aW9ucyAodGhpc1xuXHRcdC8vIGNvbnRyaWJ1dGlvbiBydW5zIGluIGJvdGggd2luZG93cykuIFRoZSBtYXRjaGluZyBgY3JlYXRlU2Vzc2lvbmBcblx0XHQvLyBvcHQtaW4gKGBwcm9ncmVzc1Rva2VuYCkgbGl2ZXMgaW4gdGhlIGVkaXRvci13aW5kb3cgc2Vzc2lvbiBoYW5kbGVycy5cblx0XHRpZiAoIXRoaXMuX2lzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdGNvbnN0IGRvd25sb2FkUHJvZ3Jlc3MgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3REb3dubG9hZFByb2dyZXNzKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLm9uRGlkTm90aWZpY2F0aW9uKG4gPT4ge1xuXHRcdFx0XHRpZiAobi50eXBlID09PSBOb3RpZmljYXRpb25UeXBlLlByb2dyZXNzKSB7XG5cdFx0XHRcdFx0ZG93bmxvYWRQcm9ncmVzcy5oYW5kbGVQcm9ncmVzcyhuKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIFByb2Nlc3MgaW5pdGlhbCByb290IHN0YXRlIGlmIGFscmVhZHkgYXZhaWxhYmxlXG5cdFx0Y29uc3QgaW5pdGlhbFJvb3RTdGF0ZSA9IHRoaXMuX2FnZW50SG9zdFNlcnZpY2Uucm9vdFN0YXRlLnZhbHVlO1xuXHRcdGlmIChpbml0aWFsUm9vdFN0YXRlICYmICEoaW5pdGlhbFJvb3RTdGF0ZSBpbnN0YW5jZW9mIEVycm9yKSkge1xuXHRcdFx0dGhpcy5faGFuZGxlUm9vdFN0YXRlQ2hhbmdlKGluaXRpYWxSb290U3RhdGUpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmICghYWZmZWN0c0FnZW50SG9zdFByb3ZpZGVyUHJlZmVyZW5jZShlLCB0aGlzLl9pc1Nlc3Npb25zV2luZG93KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fYWdlbnRIb3N0U2VydmljZS5yb290U3RhdGUudmFsdWU7XG5cdFx0XHRpZiAoY3VycmVudCAmJiAhKGN1cnJlbnQgaW5zdGFuY2VvZiBFcnJvcikpIHtcblx0XHRcdFx0dGhpcy5faGFuZGxlUm9vdFN0YXRlQ2hhbmdlKGN1cnJlbnQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZFJlZ2lzdGVyQWdlbnQocHJvdmlkZXI6IEFnZW50UHJvdmlkZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gc2hvdWxkU3VyZmFjZUxvY2FsQWdlbnRIb3N0UHJvdmlkZXIocHJvdmlkZXIsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9pc1Nlc3Npb25zV2luZG93KTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVJvb3RTdGF0ZUNoYW5nZShyb290U3RhdGU6IFJvb3RTdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGFsbG93ZWQgPSByb290U3RhdGUuYWdlbnRzLmZpbHRlcihhID0+IHRoaXMuX3Nob3VsZFJlZ2lzdGVyQWdlbnQoYS5wcm92aWRlcikpO1xuXHRcdGNvbnN0IGluY29taW5nID0gbmV3IFNldChhbGxvd2VkLm1hcChhID0+IGEucHJvdmlkZXIpKTtcblxuXHRcdC8vIFJlbW92ZSBhZ2VudHMgdGhhdCBhcmUgbm8gbG9uZ2VyIHByZXNlbnQgT1Igbm8gbG9uZ2VyIGFsbG93ZWRcblx0XHRmb3IgKGNvbnN0IFtwcm92aWRlcl0gb2YgdGhpcy5fYWdlbnRSZWdpc3RyYXRpb25zKSB7XG5cdFx0XHRpZiAoIWluY29taW5nLmhhcyhwcm92aWRlcikpIHtcblx0XHRcdFx0dGhpcy5fYWdlbnRSZWdpc3RyYXRpb25zLmRlbGV0ZUFuZERpc3Bvc2UocHJvdmlkZXIpO1xuXHRcdFx0XHR0aGlzLl9tb2RlbFByb3ZpZGVycy5kZWxldGUocHJvdmlkZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEF1dGhlbnRpY2F0ZSB1c2luZyBwcm90ZWN0ZWRSZXNvdXJjZXMgZnJvbSBhZ2VudCBpbmZvLiBPbmx5IGF1dGggdGhlXG5cdFx0Ly8gYWxsb3dlZCBhZ2VudHMgc28gYSBzdXBwcmVzc2VkIHByb3ZpZGVyIChlLmcuIEVILXByZWZlcnJlZCBDbGF1ZGUgaW5cblx0XHQvLyB0aGlzIHdpbmRvdykgZG9lc24ndCB0cmlnZ2VyIHRva2VuIHJlc29sdXRpb24gd29yayBmb3IgYW5cblx0XHQvLyBpbXBsZW1lbnRhdGlvbiB3ZSdyZSBub3QgZ29pbmcgdG8gYnJpZGdlLlxuXHRcdHRoaXMuX2F1dGhlbnRpY2F0ZVdpdGhTZXJ2ZXIoYWxsb3dlZClcblx0XHRcdC5jYXRjaCgoKSA9PiB7IC8qIGJlc3QtZWZmb3J0ICovIH0pO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgbmV3IGFnZW50cyBhbmQgcHVzaCBtb2RlbCB1cGRhdGVzIHRvIGV4aXN0aW5nIG9uZXNcblx0XHRmb3IgKGNvbnN0IGFnZW50IG9mIGFsbG93ZWQpIHtcblx0XHRcdGlmICghdGhpcy5fYWdlbnRSZWdpc3RyYXRpb25zLmhhcyhhZ2VudC5wcm92aWRlcikpIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXJBZ2VudChhZ2VudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBQdXNoIHVwZGF0ZWQgbW9kZWxzIHRvIGV4aXN0aW5nIG1vZGVsIHByb3ZpZGVyXG5cdFx0XHRcdGNvbnN0IG1vZGVsUHJvdmlkZXIgPSB0aGlzLl9tb2RlbFByb3ZpZGVycy5nZXQoYWdlbnQucHJvdmlkZXIpO1xuXHRcdFx0XHRtb2RlbFByb3ZpZGVyPy51cGRhdGVNb2RlbHMoYWdlbnQubW9kZWxzKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckFnZW50KGFnZW50OiBBZ2VudEluZm8pOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9hZ2VudFJlZ2lzdHJhdGlvbnMuc2V0KGFnZW50LnByb3ZpZGVyLCBzdG9yZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSBgYWdlbnQtaG9zdC0ke2FnZW50LnByb3ZpZGVyfWA7XG5cdFx0Y29uc3QgYWdlbnRJZCA9IHNlc3Npb25UeXBlO1xuXHRcdGNvbnN0IHZlbmRvciA9IHNlc3Npb25UeXBlO1xuXHRcdGNvbnN0IGFoU2VydmljZSA9IHRoaXMuX2FnZW50SG9zdFNlcnZpY2U7XG5cblx0XHQvLyBDaGF0IHNlc3Npb24gY29udHJpYnV0aW9uLlxuXHRcdC8vIEtlZXAgdGhlIGRlbGVnYXRpb24gcGlja2VyIGF2YWlsYWJsZSBmb3IgbG9jYWwgYWdlbnQgaG9zdCBzZXNzaW9ucyBpblxuXHRcdC8vIGJvdGggVlMgQ29kZSBhbmQgdGhlIEFnZW50cyBhcHAgc28gdXNlcnMgY2FuIGhhbmQgb2ZmIChjb250aW51ZSkgdGhlaXJcblx0XHQvLyBjb252ZXJzYXRpb24gdG8gYW55IG90aGVyIGFnZW50IGhvc3Qgc2Vzc2lvbiBvciByZW1vdGUgdGFyZ2V0LlxuXHRcdHN0b3JlLmFkZCh0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250cmlidXRpb24oe1xuXHRcdFx0dHlwZTogc2Vzc2lvblR5cGUsXG5cdFx0XHRuYW1lOiBhZ2VudElkLFxuXHRcdFx0ZGlzcGxheU5hbWU6IGFnZW50LmRpc3BsYXlOYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IGFnZW50LmRlc2NyaXB0aW9uLFxuXHRcdFx0Y3VzdG9tQWdlbnRUYXJnZXQ6IHRoaXMuX2lzU2Vzc2lvbnNXaW5kb3cgPyB1bmRlZmluZWQgOiBUYXJnZXQuR2l0SHViQ29waWxvdCxcblx0XHRcdGNhbkRlbGVnYXRlOiB0cnVlLFxuXHRcdFx0cmVxdWlyZXNDdXN0b21Nb2RlbHM6IHRydWUsXG5cdFx0XHRzdXBwb3J0c0F1dG9Nb2RlbDogYWdlbnRIb3N0UHJvdmlkZXJTdXBwb3J0c0F1dG9Nb2RlbChhZ2VudC5wcm92aWRlciksXG5cdFx0XHRyZXF1aXJlc0NvcGlsb3RTaWduSW46IHRydWUsXG5cdFx0XHRhZ2VudEhvc3RQcm92aWRlcklkOiBhZ2VudC5wcm92aWRlcixcblx0XHRcdHN1cHBvcnRzRGVsZWdhdGlvbjogdHJ1ZSxcblx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHRzdXBwb3J0c0NoZWNrcG9pbnRzOiB0cnVlLFxuXHRcdFx0XHRzdXBwb3J0c1Byb21wdEF0dGFjaG1lbnRzOiB0cnVlLFxuXHRcdFx0XHRzdXBwb3J0c0ltYWdlQXR0YWNobWVudHM6IHRydWUsXG5cdFx0XHRcdGdldCB0ZXJtaW5hbENvbW1hbmRQcmVmaXgoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGFoU2VydmljZS5pbml0aWFsaXplUmVzdWx0LmdldCgpPy50ZXJtaW5hbENvbW1hbmRQcmVmaXg7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWdlbnRSZWdpc3RyYXRpb24gPSBzdG9yZS5hZGQodGhpcy5fYWN0aXZlQ2xpZW50U2VydmljZS5yZWdpc3RlckZvckFnZW50KHNlc3Npb25UeXBlKSk7XG5cdFx0Y29uc3Qgc3luY1Byb3ZpZGVyID0gYWdlbnRSZWdpc3RyYXRpb24uc3luY1Byb3ZpZGVyO1xuXG5cdFx0Y29uc3QgaXRlbVByb3ZpZGVyID0gc3RvcmUuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50Q3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlciwgJ2xvY2FsJywgdW5kZWZpbmVkLFxuXHRcdFx0c3luY2VkVXJpID0+IGFnZW50UmVnaXN0cmF0aW9uLmJ1bmRsZXIuZ2V0T3JpZ2luKHN5bmNlZFVyaSkpKTtcblx0XHQvLyBgW0FnZW50IEhvc3RdYCBzdWZmaXggZGlzYW1iaWd1YXRlcyBmcm9tIHRoZSBleHRlbnNpb24taG9zdCBDb3BpbG90IENMSSBoYXJuZXNzLCB3aGljaCB1c2VzIHRoZSBzYW1lIGRpc3BsYXlOYW1lLlxuXHRcdHN0b3JlLmFkZCh0aGlzLl9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UucmVnaXN0ZXJFeHRlcm5hbEhhcm5lc3Moe1xuXHRcdFx0aWQ6IHNlc3Npb25UeXBlLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZ2VudEhvc3RIYXJuZXNzTGFiZWwubG9jYWwnLCBcInswfSBbQWdlbnQgSG9zdF1cIiwgYWdlbnQuZGlzcGxheU5hbWUpLFxuXHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLnNlcnZlci5pZCksXG5cdFx0XHQvLyBUaGUgVG9vbHMgc2VjdGlvbiBpcyBzdXJmYWNlZCBmb3IgdGhlIENvcGlsb3QgQ0xJIGFnZW50IGhvc3Qgb25seS5cblx0XHRcdGhpZGRlblNlY3Rpb25zOiBhZ2VudC5wcm92aWRlciA9PT0gJ2NvcGlsb3RjbGknID8gW0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlByb21wdHNdIDogW0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlRvb2xzLCBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Qcm9tcHRzXSxcblx0XHRcdGhpZGVHZW5lcmF0ZUJ1dHRvbjogdHJ1ZSxcblx0XHRcdHN5bmNQcm92aWRlcixcblx0XHRcdGl0ZW1Qcm92aWRlcixcblx0XHR9KSk7XG5cblx0XHQvLyBTZXNzaW9uIGhhbmRsZXJcblx0XHRjb25zdCBzZXNzaW9uSGFuZGxlciA9IHN0b3JlLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RTZXNzaW9uSGFuZGxlciwge1xuXHRcdFx0cHJvdmlkZXI6IGFnZW50LnByb3ZpZGVyLFxuXHRcdFx0YWdlbnRJZCxcblx0XHRcdHNlc3Npb25UeXBlLFxuXHRcdFx0ZnVsbE5hbWU6IGFnZW50LmRpc3BsYXlOYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IGFnZW50LmRlc2NyaXB0aW9uLFxuXHRcdFx0Y29ubmVjdGlvbjogdGhpcy5fYWdlbnRIb3N0U2VydmljZSxcblx0XHRcdGNvbm5lY3Rpb25BdXRob3JpdHk6IExPQ0FMX0FHRU5UX0hPU1RfQVVUSE9SSVRZLFxuXHRcdFx0cmVzb2x2ZUF1dGhlbnRpY2F0aW9uOiAocmVzb3VyY2VzKSA9PiB0aGlzLl9yZXNvbHZlQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZWx5KHJlc291cmNlcyksXG5cdFx0XHRwcm9tcHRDYWNoZU5vdGlmaWNhdGlvbjogdGhpcy5fcHJvbXB0Q2FjaGVOb3RpZmljYXRpb24sXG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZCh0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoc2Vzc2lvblR5cGUsIHNlc3Npb25IYW5kbGVyKSk7XG5cblx0XHQvLyBMYW5ndWFnZSBtb2RlbCBwcm92aWRlci5cblx0XHQvLyBPcmRlciBtYXR0ZXJzOiBgdXBkYXRlTW9kZWxzYCBtdXN0IGJlIGNhbGxlZCBhZnRlclxuXHRcdC8vIGByZWdpc3Rlckxhbmd1YWdlTW9kZWxQcm92aWRlcmAgc28gdGhlIGluaXRpYWwgYG9uRGlkQ2hhbmdlYCBpcyBvYnNlcnZlZC5cblx0XHRjb25zdCB2ZW5kb3JEZXNjcmlwdG9yID0geyB2ZW5kb3IsIGRpc3BsYXlOYW1lOiBhZ2VudC5kaXNwbGF5TmFtZSwgY29uZmlndXJhdGlvbjogdW5kZWZpbmVkLCBtYW5hZ2VtZW50Q29tbWFuZDogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQgfTtcblx0XHR0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZGVsdGFMYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyRGVzY3JpcHRvcnMoW3ZlbmRvckRlc2NyaXB0b3JdLCBbXSk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZGVsdGFMYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyRGVzY3JpcHRvcnMoW10sIFt2ZW5kb3JEZXNjcmlwdG9yXSkpKTtcblx0XHRjb25zdCBtb2RlbFByb3ZpZGVyID0gc3RvcmUuYWRkKG5ldyBBZ2VudEhvc3RMYW5ndWFnZU1vZGVsUHJvdmlkZXIoc2Vzc2lvblR5cGUsIHZlbmRvcikpO1xuXHRcdHRoaXMuX21vZGVsUHJvdmlkZXJzLnNldChhZ2VudC5wcm92aWRlciwgbW9kZWxQcm92aWRlcik7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9tb2RlbFByb3ZpZGVycy5kZWxldGUoYWdlbnQucHJvdmlkZXIpKSk7XG5cdFx0c3RvcmUuYWRkKHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlTW9kZWxQcm92aWRlcih2ZW5kb3IsIG1vZGVsUHJvdmlkZXIpKTtcblx0XHRtb2RlbFByb3ZpZGVyLnVwZGF0ZU1vZGVscyhhZ2VudC5tb2RlbHMpO1xuXG5cdFx0Ly8gUmUtYXV0aGVudGljYXRlIHdoZW4gY3JlZGVudGlhbHMgY2hhbmdlXG5cdFx0c3RvcmUuYWRkKHRoaXMuX2RlZmF1bHRBY2NvdW50U2VydmljZS5vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50KCgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50cyA9IHRoaXMuX2dldFJvb3RBZ2VudHMoKTtcblx0XHRcdHRoaXMuX2F1dGhlbnRpY2F0ZVdpdGhTZXJ2ZXIoYWdlbnRzKS5jYXRjaCgoKSA9PiB7IC8qIGJlc3QtZWZmb3J0ICovIH0pO1xuXHRcdH0pKTtcblx0XHRzdG9yZS5hZGQodGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnRzID0gdGhpcy5fZ2V0Um9vdEFnZW50cygpO1xuXHRcdFx0dGhpcy5fYXV0aGVudGljYXRlV2l0aFNlcnZlcihhZ2VudHMpLmNhdGNoKCgpID0+IHsgLyogYmVzdC1lZmZvcnQgKi8gfSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Um9vdEFnZW50cygpOiByZWFkb25seSBBZ2VudEluZm9bXSB7XG5cdFx0Y29uc3Qgcm9vdFN0YXRlID0gdGhpcy5fYWdlbnRIb3N0U2VydmljZS5yb290U3RhdGUudmFsdWU7XG5cdFx0Y29uc3QgYWdlbnRzID0gKHJvb3RTdGF0ZSAmJiAhKHJvb3RTdGF0ZSBpbnN0YW5jZW9mIEVycm9yKSkgPyByb290U3RhdGUuYWdlbnRzIDogW107XG5cdFx0cmV0dXJuIGFnZW50cy5maWx0ZXIoYSA9PiB0aGlzLl9zaG91bGRSZWdpc3RlckFnZW50KGEucHJvdmlkZXIpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBdXRoZW50aWNhdGUgdXNpbmcgcHJvdGVjdGVkUmVzb3VyY2VzIGZyb20gYWdlbnQgaW5mbyBpbiByb290IHN0YXRlLlxuXHQgKiBSZXNvbHZlcyB0b2tlbnMgdmlhIHRoZSBzdGFuZGFyZCBWUyBDb2RlIGF1dGhlbnRpY2F0aW9uIHNlcnZpY2UuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9hdXRoZW50aWNhdGVXaXRoU2VydmVyKGFnZW50czogcmVhZG9ubHkgQWdlbnRJbmZvW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpc0luaXRpYWxBdXRoZW50aWNhdGlvbiA9IGFnZW50cy5sZW5ndGggPiAwICYmICF0aGlzLl9kaWRTdGFydEluaXRpYWxBdXRoZW50aWNhdGlvbjtcblx0XHRpZiAoaXNJbml0aWFsQXV0aGVudGljYXRpb24pIHtcblx0XHRcdHRoaXMuX2RpZFN0YXJ0SW5pdGlhbEF1dGhlbnRpY2F0aW9uID0gdHJ1ZTtcblx0XHRcdG1hcmsoJ2NvZGUvYWdlbnRIb3N0L3dpbGxBdXRoZW50aWNhdGUnKTtcblx0XHR9XG5cdFx0dGhpcy5fYWdlbnRIb3N0U2VydmljZS5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcodHJ1ZSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRlc3RUb2tlbiA9IHRoaXMuX2dldFNjZW5hcmlvQXV0b21hdGlvblRva2VuKCk7XG5cdFx0XHRpZiAodGVzdFRva2VuICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fc2VlZFRlc3RUb2tlbihhZ2VudHMsIHRlc3RUb2tlbik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGF1dGhlbnRpY2F0ZVByb3RlY3RlZFJlc291cmNlcywgYWdlbnRzLCB7XG5cdFx0XHRcdGF1dGhUb2tlbkNhY2hlOiB0aGlzLl9hdXRoVG9rZW5DYWNoZSxcblx0XHRcdFx0bG9nUHJlZml4OiAnW0FnZW50SG9zdF0nLFxuXHRcdFx0XHRhdXRoZW50aWNhdGU6IHJlcXVlc3QgPT4gdGhpcy5fYWdlbnRIb3N0U2VydmljZS5hdXRoZW50aWNhdGUocmVxdWVzdCksXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tBZ2VudEhvc3RdIEZhaWxlZCB0byBhdXRoZW50aWNhdGUgd2l0aCBzZXJ2ZXInLCBlcnIpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLnNldEF1dGhlbnRpY2F0aW9uUGVuZGluZyhmYWxzZSk7XG5cdFx0XHRpZiAoaXNJbml0aWFsQXV0aGVudGljYXRpb24pIHtcblx0XHRcdFx0bWFyaygnY29kZS9hZ2VudEhvc3QvZGlkQXV0aGVudGljYXRlJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEludGVyYWN0aXZlbHkgcHJvbXB0IHRoZSB1c2VyIHRvIGF1dGhlbnRpY2F0ZSB3aGVuIHRoZSBzZXJ2ZXIgcmVxdWlyZXMgaXQuXG5cdCAqIFVzZXMgcHJvdGVjdGVkUmVzb3VyY2VzIGZyb20gcm9vdCBzdGF0ZSwgcmVzb2x2ZXMgdGhlIGF1dGggcHJvdmlkZXIsXG5cdCAqIGNyZWF0ZXMgYSBzZXNzaW9uICh3aGljaCB0cmlnZ2VycyB0aGUgbG9naW4gVUkpLCBhbmQgcHVzaGVzIHRoZSB0b2tlblxuXHQgKiB0byB0aGUgc2VydmVyLiBSZXR1cm5zIHRydWUgaWYgYXV0aGVudGljYXRpb24gc3VjY2VlZGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUF1dGhlbnRpY2F0aW9uSW50ZXJhY3RpdmVseShwcm90ZWN0ZWRSZXNvdXJjZXM6IFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGFbXSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHRlc3RUb2tlbiA9IHRoaXMuX2dldFNjZW5hcmlvQXV0b21hdGlvblRva2VuKCk7XG5cdFx0aWYgKHRlc3RUb2tlbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHByb3RlY3RlZFJlc291cmNlcykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9hdXRoVG9rZW5DYWNoZS5hdXRoZW50aWNhdGUoXG5cdFx0XHRcdFx0cmVzb3VyY2UucmVzb3VyY2UsXG5cdFx0XHRcdFx0cmVzb3VyY2Uuc2NvcGVzX3N1cHBvcnRlZCxcblx0XHRcdFx0XHR0ZXN0VG9rZW4sXG5cdFx0XHRcdFx0KCkgPT4gdGhpcy5fYWdlbnRIb3N0U2VydmljZS5hdXRoZW50aWNhdGUoeyByZXNvdXJjZTogcmVzb3VyY2UucmVzb3VyY2UsIHRva2VuOiB0ZXN0VG9rZW4gfSksXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcHJvdGVjdGVkUmVzb3VyY2VzLmxlbmd0aCA+IDA7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihyZXNvbHZlQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZWx5LCBwcm90ZWN0ZWRSZXNvdXJjZXMsIHtcblx0XHRcdGF1dGhUb2tlbkNhY2hlOiB0aGlzLl9hdXRoVG9rZW5DYWNoZSxcblx0XHRcdGxvZ1ByZWZpeDogJ1tBZ2VudEhvc3RdJyxcblx0XHRcdGF1dGhlbnRpY2F0ZTogcmVxdWVzdCA9PiB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLmF1dGhlbnRpY2F0ZShyZXF1ZXN0KSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NlZWRUZXN0VG9rZW4oYWdlbnRzOiByZWFkb25seSBBZ2VudEluZm9bXSwgdG9rZW46IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvciAoY29uc3QgYWdlbnQgb2YgYWdlbnRzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIGFnZW50LnByb3RlY3RlZFJlc291cmNlcyA/PyBbXSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9hdXRoVG9rZW5DYWNoZS5hdXRoZW50aWNhdGUoXG5cdFx0XHRcdFx0cmVzb3VyY2UucmVzb3VyY2UsXG5cdFx0XHRcdFx0cmVzb3VyY2Uuc2NvcGVzX3N1cHBvcnRlZCxcblx0XHRcdFx0XHR0b2tlbixcblx0XHRcdFx0XHQoKSA9PiB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLmF1dGhlbnRpY2F0ZSh7IHJlc291cmNlOiByZXNvdXJjZS5yZXNvdXJjZSwgdG9rZW4gfSksXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2NlbmFyaW9BdXRvbWF0aW9uVG9rZW4oKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBTbW9rZS10ZXN0IGVzY2FwZSBoYXRjaC5cblx0XHRpZiAoIXRoaXMuX2VuYWJsZVNtb2tlVGVzdERyaXZlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdG9rZW4gPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnY2hhdC5hZ2VudEhvc3QudW5zYWZlVGVzdFRva2VuJyk7XG5cdFx0cmV0dXJuIHR5cGVvZiB0b2tlbiA9PT0gJ3N0cmluZycgJiYgdG9rZW4ubGVuZ3RoID4gMCA/IHRva2VuIDogdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZLGVBQWUsaUJBQWlCLG9CQUFvQjtBQUN6RSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0NBQW9DLG1CQUFtQiwyQ0FBK0Q7QUFDL0gsU0FB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QUFBQSxJQUM3RSxVQUFFO0FBQ0QsV0FBSyxrQkFBa0IseUJBQXlCLEtBQUs7QUFDckQsVUFBSSx5QkFBeUI7QUFDNUIsYUFBSyxnQ0FBZ0M7QUFBQSxNQUN0QztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRQSxNQUFjLG9DQUFvQyxvQkFBbUU7QUFDcEgsVUFBTSxZQUFZLEtBQUssNEJBQTRCO0FBQ25ELFFBQUksY0FBYyxRQUFXO0FBQzVCLGlCQUFXLFlBQVksb0JBQW9CO0FBQzFDLGNBQU0sS0FBSyxnQkFBZ0I7QUFBQSxVQUMxQixTQUFTO0FBQUEsVUFDVCxTQUFTO0FBQUEsVUFDVDtBQUFBLFVBQ0EsTUFBTSxLQUFLLGtCQUFrQixhQUFhLEVBQUUsVUFBVSxTQUFTLFVBQVUsT0FBTyxVQUFVLENBQUM7QUFBQSxRQUM1RjtBQUFBLE1BQ0Q7QUFDQSxhQUFPLG1CQUFtQixTQUFTO0FBQUEsSUFDcEM7QUFDQSxXQUFPLEtBQUssc0JBQXNCLGVBQWUsb0NBQW9DLG9CQUFvQjtBQUFBLE1BQ3hHLGdCQUFnQixLQUFLO0FBQUEsTUFDckIsV0FBVztBQUFBLE1BQ1gsY0FBYyxhQUFXLEtBQUssa0JBQWtCLGFBQWEsT0FBTztBQUFBLElBQ3JFLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLGVBQWUsUUFBOEIsT0FBOEI7QUFDeEYsZUFBVyxTQUFTLFFBQVE7QUFDM0IsaUJBQVcsWUFBWSxNQUFNLHNCQUFzQixDQUFDLEdBQUc7QUFDdEQsY0FBTSxLQUFLLGdCQUFnQjtBQUFBLFVBQzFCLFNBQVM7QUFBQSxVQUNULFNBQVM7QUFBQSxVQUNUO0FBQUEsVUFDQSxNQUFNLEtBQUssa0JBQWtCLGFBQWEsRUFBRSxVQUFVLFNBQVMsVUFBVSxNQUFNLENBQUM7QUFBQSxRQUNqRjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsOEJBQWtEO0FBRXpELFFBQUksQ0FBQyxLQUFLLHdCQUF3QjtBQUNqQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sUUFBUSxLQUFLLHNCQUFzQixTQUFTLGdDQUFnQztBQUNsRixXQUFPLE9BQU8sVUFBVSxZQUFZLE1BQU0sU0FBUyxJQUFJLFFBQVE7QUFBQSxFQUNoRTtBQUNEO0FBOVNhLHNCQUVJLEtBQUs7QUFGVCx3QkFBTjtBQUFBLEVBa0JKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0E5QlU7IiwKICAibmFtZXMiOiBbIkFnZW50SG9zdFNlc3Npb25IYW5kbGVyIl0KfQo=
