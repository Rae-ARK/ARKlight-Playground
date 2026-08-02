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
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { isWeb } from "../../../../../base/common/platform.js";
import { basename, dirname } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { agentHostUri } from "../../../../../platform/agentHost/common/agentHostFileSystemProvider.js";
import { AGENT_HOST_SCHEME, agentHostAuthority, fromAgentHostUri, toAgentHostUri } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { AgentSession } from "../../../../../platform/agentHost/common/agentService.js";
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IDialogService, IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IWorkspaceTrustManagementService } from "../../../../../platform/workspace/common/workspaceTrust.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { IAgentHostActiveClientService } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js";
import { IChatWidgetService } from "../../../../../workbench/contrib/chat/browser/chat.js";
import { IChatService } from "../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { IChatSessionsService } from "../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ILanguageModelsService } from "../../../../../workbench/contrib/chat/common/languageModels.js";
import { buildAgentHostSessionWorkspace, readBranchProtectionPatterns } from "../../../../common/agentHostSessionWorkspace.js";
import { SESSION_WORKSPACE_GROUP_REMOTE } from "../../../../services/sessions/common/session.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { IGitHubService } from "../../../github/browser/githubService.js";
import { BaseAgentHostSessionsProvider } from "../../agentHost/browser/baseAgentHostSessionsProvider.js";
import { remoteAgentHostSessionTypeId } from "../../../../../platform/agentHost/common/agentHostSessionType.js";
const CACHED_SESSIONS_STORAGE_PREFIX = "remoteAgentHost.cachedSessions.v2.";
const CACHED_SESSIONS_STORAGE_PREFIX_LEGACY = "remoteAgentHost.cachedSessions.";
function toLocalProjectUri(uri, connectionAuthority) {
  return uri.scheme === Schemas.file ? toAgentHostUri(uri, connectionAuthority) : uri;
}
let RemoteAgentHostSessionsProvider = class extends BaseAgentHostSessionsProvider {
  constructor(config, _fileDialogService, _notificationService, storageService, chatSessionsService, chatService, chatWidgetService, languageModelsService, _remoteAgentHostService, _labelService, _configurationService, logService, gitHubService, instantiationService, sessionsService, activeClientService, dialogService, workspaceTrustManagementService) {
    super(chatSessionsService, chatService, chatWidgetService, languageModelsService, _configurationService, logService, gitHubService, instantiationService, sessionsService, activeClientService, storageService, dialogService, workspaceTrustManagementService);
    this._fileDialogService = _fileDialogService;
    this._notificationService = _notificationService;
    this._remoteAgentHostService = _remoteAgentHostService;
    this._labelService = _labelService;
    this._configurationService = _configurationService;
    this.icon = Codicon.remote;
    this._connectionStatus = observableValue("connectionStatus", RemoteAgentHostConnectionStatus.disconnected);
    this.connectionStatus = this._connectionStatus;
    /**
     * `true` while we are still resolving and pushing tokens for the host's
     * `protectedResources`. Defaults to `true` so that sessions surface as
     * loading until the first authentication pass settles.
     */
    this._authenticationPending = observableValue("authenticationPending", true);
    this._authenticationSettled = false;
    this._onDidDisconnect = this._register(new Emitter());
    this._connectionListeners = this._register(new DisposableStore());
    /**
     * When `true`, the provider has been marked unreachable and sessions are
     * hidden from {@link getSessions}, even though {@link _sessionCache} and
     * persistent storage are retained. Cleared when a new connection is wired
     * up in {@link setConnection}, at which point the cached entries are
     * re-announced so the UI can repopulate.
     */
    this._unpublished = false;
    this._connectionAuthority = agentHostAuthority(config.address);
    this._connectOnDemand = config.connectOnDemand;
    this._disconnectOnDemand = config.disconnectOnDemand;
    this._sessionSchemeAlias = config.sessionSchemeAlias;
    this.onDidReportConnectProgress = config.onDidReportConnectProgress;
    this.canConnectOnDemand = !!config.connectOnDemand;
    const displayName = config.name || config.address;
    this.id = `agenthost-${this._connectionAuthority}`;
    this.label = displayName;
    this.remoteAddress = config.address;
    this._storageKey = `${CACHED_SESSIONS_STORAGE_PREFIX}${this._connectionAuthority}`;
    this.browseActions = [{
      label: localize("folders", "Folders"),
      description: displayName,
      group: SESSION_WORKSPACE_GROUP_REMOTE,
      icon: Codicon.remote,
      providerId: this.id,
      run: () => this._browseForFolder(),
      listFolders: (query, token) => this._listRemoteFolders(query, token)
    }];
    this._enableSessionCachePersistence(this._storageKey, `${CACHED_SESSIONS_STORAGE_PREFIX_LEGACY}${this._connectionAuthority}`);
  }
  get onConnectionLost() {
    return this._onDidDisconnect.event;
  }
  /**
   * Overridable seam so tests can exercise both the web and non-web
   * branches of the label/description gating without depending on the
   * ambient {@link isWeb} constant (the browser test runner always
   * reports `isWeb === true`).
   */
  get isWebPlatform() {
    return isWeb;
  }
  // -- BaseAgentHostSessionsProvider hooks ---------------------------------
  get connection() {
    return this._connection;
  }
  get authenticationPending() {
    return this._authenticationPending;
  }
  /**
   * Suspend cache-change tracking while sessions are unpublished (offline) so
   * the on-disk snapshot survives an unreachable host. See
   * {@link unpublishCachedSessions}.
   */
  _shouldTrackSessionCacheChanges() {
    return !this._unpublished;
  }
  _adapterOptions() {
    const web = this.isWebPlatform;
    return {
      buildWorkspace: (project, workingDirectories, gitHubInfo, gitState) => {
        const primary = workingDirectories?.[0];
        const uriForDescription = project?.uri ?? primary;
        const description = uriForDescription ? this._labelService.getUriLabel(dirname(uriForDescription), { relative: false }) : void 0;
        const branchProtectionPatterns = readBranchProtectionPatterns(this._configurationService, primary ?? project?.uri);
        return RemoteAgentHostSessionsProvider.buildWorkspace(project, workingDirectories, web ? void 0 : this.label, gitHubInfo, gitState, description, branchProtectionPatterns);
      }
    };
  }
  resourceSchemeForProvider(provider) {
    return remoteAgentHostSessionTypeId(this._connectionAuthority, provider);
  }
  getSessions() {
    return this._unpublished ? [] : super.getSessions();
  }
  mapWorkingDirectoryUri(uri) {
    return toAgentHostUri(uri, this._connectionAuthority);
  }
  mapProjectUri(uri) {
    return toLocalProjectUri(uri, this._connectionAuthority);
  }
  _diffUriMapper() {
    return (uri) => toAgentHostUri(uri, this._connectionAuthority);
  }
  _validateBeforeCreate(_sessionType) {
    if (!this._connection) {
      throw new Error(localize("notConnectedSession", "Cannot create session: not connected to remote agent host '{0}'.", this.label));
    }
  }
  _noAgentsErrorMessage() {
    return localize("noAgents", "Remote agent host '{0}' has not advertised any agents yet.", this.label);
  }
  _notConnectedSendErrorMessage() {
    return localize("notConnectedSend", "Cannot send request: not connected to remote agent host '{0}'.", this.label);
  }
  // -- Connection lifecycle ------------------------------------------------
  /**
   * Establish (or re-establish) the connection for this host on demand.
   * Tunnel-backed providers use their relay hook; other providers fall
   * back to the generic remote agent host reconnect path.
   */
  async connect() {
    if (this._connectOnDemand) {
      await this._connectOnDemand();
      return;
    }
    this._remoteAgentHostService.reconnect(this.remoteAddress);
  }
  /**
   * Tear down the active connection for this host. Tunnel-backed providers
   * use their relay hook; other providers fall back to the generic remote
   * agent host disconnect path. Cached sessions are hidden from the UI so
   * the sessions list reflects the disconnected state; the persisted cache
   * is retained so sessions can be restored on reconnect.
   */
  async disconnect() {
    this.unpublishCachedSessions();
    if (this._disconnectOnDemand) {
      await this._disconnectOnDemand();
      return;
    }
    await this._remoteAgentHostService.removeRemoteAgentHost(this.remoteAddress);
  }
  /** Update the connection status for this provider. */
  setConnectionStatus(status) {
    this._connectionStatus.set(status, void 0);
  }
  /**
   * Seed discovered session summaries into the cache so they surface in the
   * sessions list **before** a connection is established (lazy discovery). Each
   * summary becomes a cached adapter keyed by its raw session id; entries that
   * already exist (e.g. from a prior live `listSessions()` or persistence) are
   * left untouched so the live refresh stays authoritative. Opening a seeded
   * session triggers `connectOnDemand` via the async activation registry, after
   * which `_refreshSessions` reconciles the seed with the host's real state.
   */
  seedSessions(metas) {
    const added = [];
    for (const rawMeta of metas) {
      const meta = this._adoptSessionMeta(rawMeta);
      const rawId = AgentSession.id(meta.session);
      if (this._sessionCache.has(rawId)) {
        continue;
      }
      const adapter = this.createAdapter(meta);
      this._sessionCache.set(rawId, adapter);
      added.push(adapter);
    }
    if (added.length > 0) {
      this._onDidChangeSessions.fire({ added, removed: [], changed: [] });
    }
  }
  /**
   * Map a host-reported session URI onto the UI scheme, so the session routes to the agent's
   * content provider. The raw id is preserved, so cache keys are unaffected.
   */
  _adoptSessionMeta(meta) {
    const alias = this._sessionSchemeAlias;
    if (!alias || meta.session.scheme !== alias.backend) {
      return meta;
    }
    return { ...meta, session: meta.session.with({ scheme: alias.ui }) };
  }
  /**
   * Inverse of {@link _adoptSessionMeta}: map the UI scheme back to the one the host's session
   * registry is keyed by, so backend calls address the URI the host knows.
   */
  _backendSessionScheme(agentProvider) {
    const alias = this._sessionSchemeAlias;
    return alias && agentProvider === alias.ui ? alias.backend : agentProvider;
  }
  setAuthenticationPending(pending) {
    if (this._authenticationSettled) {
      return;
    }
    if (!pending) {
      this._authenticationSettled = true;
    }
    this._authenticationPending.set(pending, void 0);
    if (!pending) {
      this._resumeNewSessionAfterAuthenticationSettles();
    }
  }
  /**
   * Wire a live connection to this provider, enabling session operations and folder browsing.
   */
  setConnection(connection, defaultDirectory) {
    if (this._connection === connection && this._defaultDirectory === defaultDirectory) {
      return;
    }
    const wasUnpublished = this._unpublished;
    this._connectionListeners.clear();
    this._sessionStateSubscriptions.clearAndDisposeAll();
    this._connection = connection;
    this._defaultDirectory = defaultDirectory;
    this._unpublished = false;
    this._syncRootState(connection.rootState.value);
    this._connectionListeners.add(connection.rootState.onDidChange(() => {
      this._syncRootState(connection.rootState.value);
    }));
    if (connection.rootState.onDidError) {
      this._connectionListeners.add(connection.rootState.onDidError((error) => {
        this._syncRootState(error);
      }));
    }
    this._attachConnectionListeners(connection, this._connectionListeners);
    this._refreshSessions(wasUnpublished);
  }
  /**
   * Clear the connection, e.g. when the remote host disconnects.
   * Retains the provider registration so it remains visible in the UI,
   * and **preserves** the cached session list so previously loaded
   * sessions stay visible while we're offline. Callers that know the
   * host is unreachable should follow up with {@link unpublishCachedSessions}.
   */
  clearConnection() {
    this._connectionListeners.clear();
    this._sessionStateSubscriptions.clearAndDisposeAll();
    this._onDidDisconnect.fire();
    this._connection = void 0;
    this._defaultDirectory = void 0;
    this._disposeAllNewSessions();
    this._syncRootState(void 0);
    if (this._pendingSession) {
      const pending = this._pendingSession;
      this._pendingSession = void 0;
      this._onDidChangeSessions.fire({ added: [], removed: [pending], changed: [] });
    }
    this._cacheInitialized = false;
    this._cancelSessionRefreshRetry();
  }
  /**
   * Hide cached sessions from the UI without discarding them. Called by the
   * host-tracking contributions when they determine the remote host is
   * unreachable (tunnel offline or SSH reconnect failed). The in-memory
   * cache and persisted storage are left intact so the sessions can be
   * restored if the host comes back online in this session, or on the next
   * launch. The next {@link setConnection} call re-announces the cached
   * entries.
   */
  unpublishCachedSessions() {
    if (this._unpublished) {
      return;
    }
    this._unpublished = true;
    if (this._sessionCache.size > 0) {
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [] });
    }
  }
  // -- Session-type sync ---------------------------------------------------
  _formatSessionTypeLabel(agentLabel) {
    if (this.isWebPlatform) {
      return agentLabel;
    }
    return `${agentLabel} [${this.label}]`;
  }
  // -- Workspaces ----------------------------------------------------------
  static buildWorkspace(project, workingDirectories, providerLabel, gitHubInfo, gitState, description, branchProtectionPatterns) {
    return buildAgentHostSessionWorkspace(project, workingDirectories, { providerLabel, fallbackIcon: Codicon.remote, requiresWorkspaceTrust: true, description, branchProtectionPatterns, group: SESSION_WORKSPACE_GROUP_REMOTE }, gitHubInfo, gitState);
  }
  _buildWorkspaceFromUri(uri) {
    const folderName = basename(uri) || uri.path;
    return {
      uri,
      label: this.isWebPlatform ? folderName : `${folderName} [${this.label}]`,
      description: this._labelService.getUriLabel(dirname(uri), { relative: false }),
      group: SESSION_WORKSPACE_GROUP_REMOTE,
      icon: Codicon.remote,
      folders: [{
        root: uri,
        workingDirectory: uri,
        name: folderName,
        description: void 0,
        gitRepository: { uri, workTreeUri: void 0, baseBranchName: void 0, gitHubInfo: constObservable(void 0) }
      }],
      requiresWorkspaceTrust: true,
      isVirtualWorkspace: false
    };
  }
  resolveWorkspace(repositoryUri) {
    if (repositoryUri.scheme !== AGENT_HOST_SCHEME) {
      return void 0;
    }
    if (repositoryUri.authority !== this._connectionAuthority) {
      return void 0;
    }
    return this._buildWorkspaceFromUri(repositoryUri);
  }
  // -- Browse --------------------------------------------------------------
  async _browseForFolder() {
    if (!this._connection && this._connectOnDemand) {
      try {
        await this._connectOnDemand();
      } catch (err) {
        this._notificationService.error(localize("connectFailed", "Failed to connect to remote agent host '{0}': {1}", this.label, err instanceof Error ? err.message : String(err)));
        return void 0;
      }
    }
    if (!this._connection) {
      this._notificationService.error(localize("notConnected", "Unable to connect to remote agent host '{0}'.", this.label));
      return void 0;
    }
    const defaultUri = agentHostUri(this._connectionAuthority, this._defaultDirectory ?? "/");
    try {
      const selected = await this._fileDialogService.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: localize("selectRemoteFolder", "Select Folder on {0}", this.label),
        availableFileSystems: [AGENT_HOST_SCHEME],
        defaultUri
      });
      if (selected?.[0]) {
        return this._buildWorkspaceFromUri(selected[0]);
      }
    } catch {
    }
    return void 0;
  }
  /**
   * Enumerate subdirectories below {@link _defaultDirectory}, filtered
   * by a case-insensitive substring query. Backs the inline folder
   * list rendered by the mobile workspace picker sheet so users can
   * pick a folder without opening a separate file-dialog.
   *
   * The query supports light path navigation: a `/` in the query is
   * treated as a path delimiter, listing children of `<default>/<prefix>`
   * and matching the part after the last slash. So typing `projects/`
   * drills into the `projects` directory, and `projects/foo` lists
   * children of `projects` whose name contains `foo`.
   *
   * Hidden directories (those starting with `.`) are omitted, results
   * are sorted by name, and the cancellation token is honored before
   * and after the network round-trip so stale queries don't surface
   * after the user has typed more characters.
   */
  async _listRemoteFolders(query, token) {
    if (!this._connection && this._connectOnDemand) {
      try {
        await this._connectOnDemand();
      } catch {
        return [];
      }
    }
    if (!this._connection || token.isCancellationRequested) {
      return [];
    }
    const rootAgentHostUri = agentHostUri(this._connectionAuthority, this._defaultDirectory ?? "/");
    const trimmed = query.trim();
    const lastSlash = trimmed.lastIndexOf("/");
    let listingAgentHostUri = rootAgentHostUri;
    let filter = trimmed;
    if (lastSlash >= 0) {
      const subPath = trimmed.slice(0, lastSlash).replace(/^\/+|\/+$/g, "");
      filter = trimmed.slice(lastSlash + 1);
      if (subPath) {
        listingAgentHostUri = URI.joinPath(rootAgentHostUri, subPath);
      }
    }
    const listingOriginalUri = fromAgentHostUri(listingAgentHostUri);
    let entries;
    try {
      const result = await this._connection.resourceList(listingOriginalUri);
      entries = result.entries;
    } catch {
      return [];
    }
    if (token.isCancellationRequested) {
      return [];
    }
    const lowerFilter = filter.toLocaleLowerCase();
    const folders = [];
    for (const entry of entries) {
      if (entry.type !== "directory") {
        continue;
      }
      if (entry.name.startsWith(".")) {
        continue;
      }
      if (lowerFilter && !entry.name.toLocaleLowerCase().includes(lowerFilter)) {
        continue;
      }
      const childUri = URI.joinPath(listingAgentHostUri, entry.name);
      folders.push({ ...this._buildWorkspaceFromUri(childUri), icon: Codicon.folder });
    }
    folders.sort((a, b) => a.label.localeCompare(b.label));
    return folders;
  }
};
RemoteAgentHostSessionsProvider = __decorateClass([
  __decorateParam(1, IFileDialogService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IChatSessionsService),
  __decorateParam(5, IChatService),
  __decorateParam(6, IChatWidgetService),
  __decorateParam(7, ILanguageModelsService),
  __decorateParam(8, IRemoteAgentHostService),
  __decorateParam(9, ILabelService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, ILogService),
  __decorateParam(12, IGitHubService),
  __decorateParam(13, IInstantiationService),
  __decorateParam(14, ISessionsService),
  __decorateParam(15, IAgentHostActiveClientService),
  __decorateParam(16, IDialogService),
  __decorateParam(17, IWorkspaceTrustManagementService)
], RemoteAgentHostSessionsProvider);
export {
  RemoteAgentHostSessionsProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL3JlbW90ZUFnZW50SG9zdC9icm93c2VyL3JlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgYWdlbnRIb3N0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9TQ0hFTUUsIGFnZW50SG9zdEF1dGhvcml0eSwgZnJvbUFnZW50SG9zdFVyaSwgdG9BZ2VudEhvc3RVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIHR5cGUgSUFnZW50Q29ubmVjdGlvbiwgdHlwZSBJQWdlbnRTZXNzaW9uTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSwgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElTZXNzaW9uR2l0U3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlLCBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDb25uZWN0UHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBidWlsZEFnZW50SG9zdFNlc3Npb25Xb3Jrc3BhY2UsIHJlYWRCcmFuY2hQcm90ZWN0aW9uUGF0dGVybnMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbldvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJR2l0SHViSW5mbywgSVNlc3Npb24sIElTZXNzaW9uVHlwZSwgSVNlc3Npb25Xb3Jrc3BhY2UsIElTZXNzaW9uV29ya3NwYWNlQnJvd3NlQWN0aW9uLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9SRU1PVEUgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUdpdEh1YlNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9naXRodWIvYnJvd3Nlci9naXRodWJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEJhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vYWdlbnRIb3N0L2Jyb3dzZXIvYmFzZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgcmVtb3RlQWdlbnRIb3N0U2Vzc2lvblR5cGVJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0U2Vzc2lvblR5cGUuanMnO1xuXG4vKiogU3RvcmFnZSBrZXkgcHJlZml4IGZvciBjYWNoZWQgc2Vzc2lvbiBzdW1tYXJpZXMsIHBlciByZW1vdGUgYWRkcmVzcy4gKi9cbmNvbnN0IENBQ0hFRF9TRVNTSU9OU19TVE9SQUdFX1BSRUZJWCA9ICdyZW1vdGVBZ2VudEhvc3QuY2FjaGVkU2Vzc2lvbnMudjIuJztcbi8vIFRPRE9Ac2FuZHkwODEgUmVtb3ZlIHRoaXMgbGVnYWN5IGNhY2hlLWtleSBjbGVhbnVwIGFmdGVyIDIwMjYtMTAtMTQuXG5jb25zdCBDQUNIRURfU0VTU0lPTlNfU1RPUkFHRV9QUkVGSVhfTEVHQUNZID0gJ3JlbW90ZUFnZW50SG9zdC5jYWNoZWRTZXNzaW9ucy4nO1xuXG5mdW5jdGlvbiB0b0xvY2FsUHJvamVjdFVyaSh1cmk6IFVSSSwgY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nKTogVVJJIHtcblx0cmV0dXJuIHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSA/IHRvQWdlbnRIb3N0VXJpKHVyaSwgY29ubmVjdGlvbkF1dGhvcml0eSkgOiB1cmk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXJDb25maWcge1xuXHRyZWFkb25seSBhZGRyZXNzOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0LyoqIE9wdGlvbmFsIGhvb2sgdG8gZXN0YWJsaXNoIGEgY29ubmVjdGlvbiBvbiBkZW1hbmQgKGUuZy4gdHVubmVsIHJlbGF5KS4gKi9cblx0cmVhZG9ubHkgY29ubmVjdE9uRGVtYW5kPzogKCkgPT4gUHJvbWlzZTx2b2lkPjtcblx0LyoqIE9wdGlvbmFsIGhvb2sgdG8gdGVhciBkb3duIHRoZSBhY3RpdmUgY29ubmVjdGlvbiBvbiBkZW1hbmQgKGUuZy4gdHVubmVsIHJlbGF5KS4gKi9cblx0cmVhZG9ubHkgZGlzY29ubmVjdE9uRGVtYW5kPzogKCkgPT4gUHJvbWlzZTx2b2lkPjtcblx0LyoqIE9wdGlvbmFsIHByb2dyZXNzIG1lc3NhZ2VzIGR1cmluZyBvbi1kZW1hbmQgY29ubmVjdC4gKi9cblx0cmVhZG9ubHkgb25EaWRSZXBvcnRDb25uZWN0UHJvZ3Jlc3M/OiBFdmVudDxJQWdlbnRIb3N0Q29ubmVjdFByb2dyZXNzPjtcblx0LyoqXG5cdCAqIFNldCB3aGVuIHRoZSBob3N0IGFkZHJlc3NlcyBzZXNzaW9ucyB1bmRlciBhIHNjaGVtZSB0aGF0IGRpZmZlcnMgZnJvbSBpdHMgYWdlbnQgcHJvdmlkZXIsIGFzXG5cdCAqIHRoZSBjbG91ZCBzYW5kYm94IGhvc3QgZG9lcyAoc2Vzc2lvbnMgYXJlIGBhaHAtc2Vzc2lvbjovPGlkPmAgd2hpbGUgdGhlIGFnZW50IGlzIGBjb3BpbG90YCkuXG5cdCAqIFRoZSBwcm92aWRlciBkZXJpdmVzIGJvdGggZGlyZWN0aW9ucyBmcm9tIHRoaXMgcGFpciwgc28gdGhleSBjYW5ub3QgZHJpZnQgYXBhcnQuXG5cdCAqL1xuXHRyZWFkb25seSBzZXNzaW9uU2NoZW1lQWxpYXM/OiBJU2Vzc2lvblNjaGVtZUFsaWFzO1xufVxuXG4vKipcbiAqIFRoZSB0d28gbmFtZXMgYSBzZXNzaW9uIGdvZXMgYnkgd2hlbiB0aGUgaG9zdCdzIHNlc3Npb24gc2NoZW1lIGRpZmZlcnMgZnJvbSBpdHMgYWdlbnQgcHJvdmlkZXIuXG4gKiBUaGUgcmF3IHNlc3Npb24gaWQgaXMgc2hhcmVkLCBzbyBvbmx5IHRoZSBzY2hlbWUgaXMgdHJhbnNsYXRlZC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvblNjaGVtZUFsaWFzIHtcblx0LyoqIFNjaGVtZSB0aGUgVUkgcm91dGVzIGJ5IFx1MjAxNCB0aGUgYWdlbnQgcHJvdmlkZXIgKGUuZy4gYGNvcGlsb3RgKS4gKi9cblx0cmVhZG9ubHkgdWk6IHN0cmluZztcblx0LyoqIFNjaGVtZSB0aGUgaG9zdCdzIHNlc3Npb24gcmVnaXN0cnkgaXMga2V5ZWQgYnkgKGUuZy4gYGFocC1zZXNzaW9uYCkuICovXG5cdHJlYWRvbmx5IGJhY2tlbmQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiBTZXNzaW9ucyBwcm92aWRlciBmb3IgYSByZW1vdGUgYWdlbnQgaG9zdCBjb25uZWN0aW9uLiBBIHRoaW4gc3ViY2xhc3Mgb2ZcbiAqIHtAbGluayBCYXNlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcn0gdGhhdCBhZGRzIHRoZSBjb25uZWN0aW9uLWxpZmVjeWNsZVxuICogc3VyZmFjZSAoYHNldENvbm5lY3Rpb25gL2BjbGVhckNvbm5lY3Rpb25gKSwgc3RpY2t5IGF1dGhlbnRpY2F0aW9uLXBlbmRpbmdcbiAqIHRyYWNraW5nLCB0aGUgd2VsbC1rbm93biBzZXNzaW9uLXR5cGUgbWFwcGluZywgYW5kIGEgcmVtb3RlIGZvbGRlciBwaWNrZXIuXG4gKlxuICogKipVUkkvSUQgc2NoZW1lOioqXG4gKiAtICoqcmF3SWQqKiAtIHVuaXF1ZSBzZXNzaW9uIGlkZW50aWZpZXIgKGUuZy4gYGFiYzEyM2ApLCB1c2VkIGFzIHRoZSBjYWNoZSBrZXkuXG4gKiAtICoqcmVzb3VyY2UqKiAtIGB7cmVzb3VyY2VTY2hlbWV9Oi8vL3tyYXdJZH1gLiBUaGUgc2NoZW1lIGlzIHRoZSB1bmlxdWVcbiAqICAgcGVyLWNvbm5lY3Rpb24gaWQgYW5kIHJvdXRlcyB0aGUgY2hhdCBzZXJ2aWNlIHRvIHRoZSBjb3JyZWN0XG4gKiAgIHtAbGluayBBZ2VudEhvc3RTZXNzaW9uSGFuZGxlcn0uXG4gKiAtICoqc2Vzc2lvblR5cGUqKiAtIHRoZSBsb2dpY2FsIHNlc3Npb24gdHlwZSAoZS5nLiBgY29waWxvdGNsaWAgZm9yIGNvcGlsb3RcbiAqICAgYWdlbnRzLCBvciB0aGUgcGVyLWNvbm5lY3Rpb24gaWQgZm9yIG90aGVyIGFnZW50cykuIERpc3RpbmN0IGZyb20gdGhlXG4gKiAgIHJlc291cmNlIHNjaGVtZS5cbiAqIC0gKipzZXNzaW9uSWQqKiAtIGB7cHJvdmlkZXJJZH06e3Jlc291cmNlfWAgLSB0aGUgcHJvdmlkZXItc2NvcGVkIElEIHVzZWQgYnlcbiAqICAge0BsaW5rIElTZXNzaW9uc1Byb3ZpZGVyfSBtZXRob2RzLlxuICogLSBQcm90b2NvbCBvcGVyYXRpb25zIChlLmcuIGBkaXNwb3NlU2Vzc2lvbmApIHVzZSB0aGUgY2Fub25pY2FsIGFnZW50XG4gKiAgIHNlc3Npb24gVVJJIChgY29waWxvdDovLy9hYmMxMjNgKSwgcmVjb25zdHJ1Y3RlZCB2aWEgYEFnZW50U2Vzc2lvbi51cmlgLlxuICovXG5leHBvcnQgY2xhc3MgUmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciBleHRlbmRzIEJhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblxuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uOiBUaGVtZUljb24gPSBDb2RpY29uLnJlbW90ZTtcblx0cmVhZG9ubHkgcmVtb3RlQWRkcmVzczogc3RyaW5nO1xuXHRyZWFkb25seSBicm93c2VBY3Rpb25zOiByZWFkb25seSBJU2Vzc2lvbldvcmtzcGFjZUJyb3dzZUFjdGlvbltdO1xuXHRyZWFkb25seSBjYW5Db25uZWN0T25EZW1hbmQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG9uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzOiBFdmVudDxJQWdlbnRIb3N0Q29ubmVjdFByb2dyZXNzPiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0aW9uU3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlPFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXM+KCdjb25uZWN0aW9uU3RhdHVzJywgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5kaXNjb25uZWN0ZWQpO1xuXHRyZWFkb25seSBjb25uZWN0aW9uU3RhdHVzOiBJT2JzZXJ2YWJsZTxSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzPiA9IHRoaXMuX2Nvbm5lY3Rpb25TdGF0dXM7XG5cblx0LyoqXG5cdCAqIGB0cnVlYCB3aGlsZSB3ZSBhcmUgc3RpbGwgcmVzb2x2aW5nIGFuZCBwdXNoaW5nIHRva2VucyBmb3IgdGhlIGhvc3Qnc1xuXHQgKiBgcHJvdGVjdGVkUmVzb3VyY2VzYC4gRGVmYXVsdHMgdG8gYHRydWVgIHNvIHRoYXQgc2Vzc2lvbnMgc3VyZmFjZSBhc1xuXHQgKiBsb2FkaW5nIHVudGlsIHRoZSBmaXJzdCBhdXRoZW50aWNhdGlvbiBwYXNzIHNldHRsZXMuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hdXRoZW50aWNhdGlvblBlbmRpbmcgPSBvYnNlcnZhYmxlVmFsdWUoJ2F1dGhlbnRpY2F0aW9uUGVuZGluZycsIHRydWUpO1xuXHRwcml2YXRlIF9hdXRoZW50aWNhdGlvblNldHRsZWQgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc2Nvbm5lY3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldCBvbkNvbm5lY3Rpb25Mb3N0KCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkRGlzY29ubmVjdC5ldmVudDsgfVxuXG5cdC8qKlxuXHQgKiBPdmVycmlkYWJsZSBzZWFtIHNvIHRlc3RzIGNhbiBleGVyY2lzZSBib3RoIHRoZSB3ZWIgYW5kIG5vbi13ZWJcblx0ICogYnJhbmNoZXMgb2YgdGhlIGxhYmVsL2Rlc2NyaXB0aW9uIGdhdGluZyB3aXRob3V0IGRlcGVuZGluZyBvbiB0aGVcblx0ICogYW1iaWVudCB7QGxpbmsgaXNXZWJ9IGNvbnN0YW50ICh0aGUgYnJvd3NlciB0ZXN0IHJ1bm5lciBhbHdheXNcblx0ICogcmVwb3J0cyBgaXNXZWIgPT09IHRydWVgKS5cblx0ICovXG5cdHByb3RlY3RlZCBnZXQgaXNXZWJQbGF0Zm9ybSgpOiBib29sZWFuIHsgcmV0dXJuIGlzV2ViOyB9XG5cblx0cHJpdmF0ZSBfY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGVmYXVsdERpcmVjdG9yeTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0aW9uTGlzdGVuZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0T25EZW1hbmQ6ICgoKSA9PiBQcm9taXNlPHZvaWQ+KSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzY29ubmVjdE9uRGVtYW5kOiAoKCkgPT4gUHJvbWlzZTx2b2lkPikgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25TY2hlbWVBbGlhczogSVNlc3Npb25TY2hlbWVBbGlhcyB8IHVuZGVmaW5lZDtcblx0LyoqIFN0b3JhZ2Uga2V5IHVzZWQgZm9yIHBlcnNpc3Rpbmcge0BsaW5rIF9zZXNzaW9uQ2FjaGV9IHNuYXBzaG90cy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZUtleTogc3RyaW5nO1xuXHQvKipcblx0ICogV2hlbiBgdHJ1ZWAsIHRoZSBwcm92aWRlciBoYXMgYmVlbiBtYXJrZWQgdW5yZWFjaGFibGUgYW5kIHNlc3Npb25zIGFyZVxuXHQgKiBoaWRkZW4gZnJvbSB7QGxpbmsgZ2V0U2Vzc2lvbnN9LCBldmVuIHRob3VnaCB7QGxpbmsgX3Nlc3Npb25DYWNoZX0gYW5kXG5cdCAqIHBlcnNpc3RlbnQgc3RvcmFnZSBhcmUgcmV0YWluZWQuIENsZWFyZWQgd2hlbiBhIG5ldyBjb25uZWN0aW9uIGlzIHdpcmVkXG5cdCAqIHVwIGluIHtAbGluayBzZXRDb25uZWN0aW9ufSwgYXQgd2hpY2ggcG9pbnQgdGhlIGNhY2hlZCBlbnRyaWVzIGFyZVxuXHQgKiByZS1hbm5vdW5jZWQgc28gdGhlIFVJIGNhbiByZXBvcHVsYXRlLlxuXHQgKi9cblx0cHJpdmF0ZSBfdW5wdWJsaXNoZWQgPSBmYWxzZTtcblxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbmZpZzogSVJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXJDb25maWcsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlOiBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUdpdEh1YlNlcnZpY2UgZ2l0SHViU2VydmljZTogSUdpdEh1YlNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UgYWN0aXZlQ2xpZW50U2VydmljZTogSUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY2hhdFNlc3Npb25zU2VydmljZSwgY2hhdFNlcnZpY2UsIGNoYXRXaWRnZXRTZXJ2aWNlLCBsYW5ndWFnZU1vZGVsc1NlcnZpY2UsIF9jb25maWd1cmF0aW9uU2VydmljZSwgbG9nU2VydmljZSwgZ2l0SHViU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHNlc3Npb25zU2VydmljZSwgYWN0aXZlQ2xpZW50U2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGRpYWxvZ1NlcnZpY2UsIHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fY29ubmVjdGlvbkF1dGhvcml0eSA9IGFnZW50SG9zdEF1dGhvcml0eShjb25maWcuYWRkcmVzcyk7XG5cdFx0dGhpcy5fY29ubmVjdE9uRGVtYW5kID0gY29uZmlnLmNvbm5lY3RPbkRlbWFuZDtcblx0XHR0aGlzLl9kaXNjb25uZWN0T25EZW1hbmQgPSBjb25maWcuZGlzY29ubmVjdE9uRGVtYW5kO1xuXHRcdHRoaXMuX3Nlc3Npb25TY2hlbWVBbGlhcyA9IGNvbmZpZy5zZXNzaW9uU2NoZW1lQWxpYXM7XG5cdFx0dGhpcy5vbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzcyA9IGNvbmZpZy5vbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzcztcblx0XHR0aGlzLmNhbkNvbm5lY3RPbkRlbWFuZCA9ICEhY29uZmlnLmNvbm5lY3RPbkRlbWFuZDtcblx0XHRjb25zdCBkaXNwbGF5TmFtZSA9IGNvbmZpZy5uYW1lIHx8IGNvbmZpZy5hZGRyZXNzO1xuXG5cdFx0dGhpcy5pZCA9IGBhZ2VudGhvc3QtJHt0aGlzLl9jb25uZWN0aW9uQXV0aG9yaXR5fWA7XG5cdFx0dGhpcy5sYWJlbCA9IGRpc3BsYXlOYW1lO1xuXHRcdHRoaXMucmVtb3RlQWRkcmVzcyA9IGNvbmZpZy5hZGRyZXNzO1xuXHRcdHRoaXMuX3N0b3JhZ2VLZXkgPSBgJHtDQUNIRURfU0VTU0lPTlNfU1RPUkFHRV9QUkVGSVh9JHt0aGlzLl9jb25uZWN0aW9uQXV0aG9yaXR5fWA7XG5cblx0XHR0aGlzLmJyb3dzZUFjdGlvbnMgPSBbe1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdmb2xkZXJzJywgXCJGb2xkZXJzXCIpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGRpc3BsYXlOYW1lLFxuXHRcdFx0Z3JvdXA6IFNFU1NJT05fV09SS1NQQUNFX0dST1VQX1JFTU9URSxcblx0XHRcdGljb246IENvZGljb24ucmVtb3RlLFxuXHRcdFx0cHJvdmlkZXJJZDogdGhpcy5pZCxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5fYnJvd3NlRm9yRm9sZGVyKCksXG5cdFx0XHRsaXN0Rm9sZGVyczogKHF1ZXJ5LCB0b2tlbikgPT4gdGhpcy5fbGlzdFJlbW90ZUZvbGRlcnMocXVlcnksIHRva2VuKSxcblx0XHR9XTtcblxuXHRcdHRoaXMuX2VuYWJsZVNlc3Npb25DYWNoZVBlcnNpc3RlbmNlKHRoaXMuX3N0b3JhZ2VLZXksIGAke0NBQ0hFRF9TRVNTSU9OU19TVE9SQUdFX1BSRUZJWF9MRUdBQ1l9JHt0aGlzLl9jb25uZWN0aW9uQXV0aG9yaXR5fWApO1xuXHR9XG5cblx0Ly8gLS0gQmFzZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIgaG9va3MgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJvdGVjdGVkIGdldCBjb25uZWN0aW9uKCk6IElBZ2VudENvbm5lY3Rpb24gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fY29ubmVjdGlvbjsgfVxuXG5cdHByb3RlY3RlZCBnZXQgYXV0aGVudGljYXRpb25QZW5kaW5nKCk6IElPYnNlcnZhYmxlPGJvb2xlYW4+IHsgcmV0dXJuIHRoaXMuX2F1dGhlbnRpY2F0aW9uUGVuZGluZzsgfVxuXG5cdC8qKlxuXHQgKiBTdXNwZW5kIGNhY2hlLWNoYW5nZSB0cmFja2luZyB3aGlsZSBzZXNzaW9ucyBhcmUgdW5wdWJsaXNoZWQgKG9mZmxpbmUpIHNvXG5cdCAqIHRoZSBvbi1kaXNrIHNuYXBzaG90IHN1cnZpdmVzIGFuIHVucmVhY2hhYmxlIGhvc3QuIFNlZVxuXHQgKiB7QGxpbmsgdW5wdWJsaXNoQ2FjaGVkU2Vzc2lvbnN9LlxuXHQgKi9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9zaG91bGRUcmFja1Nlc3Npb25DYWNoZUNoYW5nZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLl91bnB1Ymxpc2hlZDtcblx0fVxuXG5cdHByb3RlY3RlZCBfYWRhcHRlck9wdGlvbnMoKSB7XG5cdFx0Y29uc3Qgd2ViID0gdGhpcy5pc1dlYlBsYXRmb3JtO1xuXHRcdHJldHVybiB7XG5cdFx0XHRidWlsZFdvcmtzcGFjZTogKHByb2plY3Q6IElBZ2VudFNlc3Npb25NZXRhZGF0YVsncHJvamVjdCddLCB3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkLCBnaXRIdWJJbmZvOiBJT2JzZXJ2YWJsZTxJR2l0SHViSW5mbyB8IHVuZGVmaW5lZD4sIGdpdFN0YXRlOiBJU2Vzc2lvbkdpdFN0YXRlIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHByaW1hcnkgPSB3b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0XHRcdFx0Y29uc3QgdXJpRm9yRGVzY3JpcHRpb24gPSBwcm9qZWN0Py51cmkgPz8gcHJpbWFyeTtcblx0XHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSB1cmlGb3JEZXNjcmlwdGlvbiA/IHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChkaXJuYW1lKHVyaUZvckRlc2NyaXB0aW9uKSwgeyByZWxhdGl2ZTogZmFsc2UgfSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IGJyYW5jaFByb3RlY3Rpb25QYXR0ZXJucyA9IHJlYWRCcmFuY2hQcm90ZWN0aW9uUGF0dGVybnModGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHByaW1hcnkgPz8gcHJvamVjdD8udXJpKTtcblx0XHRcdFx0cmV0dXJuIFJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuYnVpbGRXb3Jrc3BhY2UocHJvamVjdCwgd29ya2luZ0RpcmVjdG9yaWVzLCB3ZWIgPyB1bmRlZmluZWQgOiB0aGlzLmxhYmVsLCBnaXRIdWJJbmZvLCBnaXRTdGF0ZSwgZGVzY3JpcHRpb24sIGJyYW5jaFByb3RlY3Rpb25QYXR0ZXJucyk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVzb3VyY2VTY2hlbWVGb3JQcm92aWRlcihwcm92aWRlcjogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gcmVtb3RlQWdlbnRIb3N0U2Vzc2lvblR5cGVJZCh0aGlzLl9jb25uZWN0aW9uQXV0aG9yaXR5LCBwcm92aWRlcik7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5fdW5wdWJsaXNoZWQgPyBbXSA6IHN1cGVyLmdldFNlc3Npb25zKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbWFwV29ya2luZ0RpcmVjdG9yeVVyaSh1cmk6IFVSSSk6IFVSSSB7XG5cdFx0cmV0dXJuIHRvQWdlbnRIb3N0VXJpKHVyaSwgdGhpcy5fY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbWFwUHJvamVjdFVyaSh1cmk6IFVSSSk6IFVSSSB7XG5cdFx0cmV0dXJuIHRvTG9jYWxQcm9qZWN0VXJpKHVyaSwgdGhpcy5fY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2RpZmZVcmlNYXBwZXIoKTogKHVyaTogVVJJKSA9PiBVUkkge1xuXHRcdHJldHVybiB1cmkgPT4gdG9BZ2VudEhvc3RVcmkodXJpLCB0aGlzLl9jb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfdmFsaWRhdGVCZWZvcmVDcmVhdGUoX3Nlc3Npb25UeXBlOiBJU2Vzc2lvblR5cGUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2Nvbm5lY3Rpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnbm90Q29ubmVjdGVkU2Vzc2lvbicsIFwiQ2Fubm90IGNyZWF0ZSBzZXNzaW9uOiBub3QgY29ubmVjdGVkIHRvIHJlbW90ZSBhZ2VudCBob3N0ICd7MH0nLlwiLCB0aGlzLmxhYmVsKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9ub0FnZW50c0Vycm9yTWVzc2FnZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnbm9BZ2VudHMnLCBcIlJlbW90ZSBhZ2VudCBob3N0ICd7MH0nIGhhcyBub3QgYWR2ZXJ0aXNlZCBhbnkgYWdlbnRzIHlldC5cIiwgdGhpcy5sYWJlbCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX25vdENvbm5lY3RlZFNlbmRFcnJvck1lc3NhZ2UoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ25vdENvbm5lY3RlZFNlbmQnLCBcIkNhbm5vdCBzZW5kIHJlcXVlc3Q6IG5vdCBjb25uZWN0ZWQgdG8gcmVtb3RlIGFnZW50IGhvc3QgJ3swfScuXCIsIHRoaXMubGFiZWwpO1xuXHR9XG5cblx0Ly8gLS0gQ29ubmVjdGlvbiBsaWZlY3ljbGUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIEVzdGFibGlzaCAob3IgcmUtZXN0YWJsaXNoKSB0aGUgY29ubmVjdGlvbiBmb3IgdGhpcyBob3N0IG9uIGRlbWFuZC5cblx0ICogVHVubmVsLWJhY2tlZCBwcm92aWRlcnMgdXNlIHRoZWlyIHJlbGF5IGhvb2s7IG90aGVyIHByb3ZpZGVycyBmYWxsXG5cdCAqIGJhY2sgdG8gdGhlIGdlbmVyaWMgcmVtb3RlIGFnZW50IGhvc3QgcmVjb25uZWN0IHBhdGguXG5cdCAqL1xuXHRhc3luYyBjb25uZWN0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9jb25uZWN0T25EZW1hbmQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2Nvbm5lY3RPbkRlbWFuZCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLnJlY29ubmVjdCh0aGlzLnJlbW90ZUFkZHJlc3MpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlYXIgZG93biB0aGUgYWN0aXZlIGNvbm5lY3Rpb24gZm9yIHRoaXMgaG9zdC4gVHVubmVsLWJhY2tlZCBwcm92aWRlcnNcblx0ICogdXNlIHRoZWlyIHJlbGF5IGhvb2s7IG90aGVyIHByb3ZpZGVycyBmYWxsIGJhY2sgdG8gdGhlIGdlbmVyaWMgcmVtb3RlXG5cdCAqIGFnZW50IGhvc3QgZGlzY29ubmVjdCBwYXRoLiBDYWNoZWQgc2Vzc2lvbnMgYXJlIGhpZGRlbiBmcm9tIHRoZSBVSSBzb1xuXHQgKiB0aGUgc2Vzc2lvbnMgbGlzdCByZWZsZWN0cyB0aGUgZGlzY29ubmVjdGVkIHN0YXRlOyB0aGUgcGVyc2lzdGVkIGNhY2hlXG5cdCAqIGlzIHJldGFpbmVkIHNvIHNlc3Npb25zIGNhbiBiZSByZXN0b3JlZCBvbiByZWNvbm5lY3QuXG5cdCAqL1xuXHRhc3luYyBkaXNjb25uZWN0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudW5wdWJsaXNoQ2FjaGVkU2Vzc2lvbnMoKTtcblx0XHRpZiAodGhpcy5fZGlzY29ubmVjdE9uRGVtYW5kKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9kaXNjb25uZWN0T25EZW1hbmQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5yZW1vdmVSZW1vdGVBZ2VudEhvc3QodGhpcy5yZW1vdGVBZGRyZXNzKTtcblx0fVxuXG5cdC8qKiBVcGRhdGUgdGhlIGNvbm5lY3Rpb24gc3RhdHVzIGZvciB0aGlzIHByb3ZpZGVyLiAqL1xuXHRzZXRDb25uZWN0aW9uU3RhdHVzKHN0YXR1czogUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cyk6IHZvaWQge1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb25TdGF0dXMuc2V0KHN0YXR1cywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZWVkIGRpc2NvdmVyZWQgc2Vzc2lvbiBzdW1tYXJpZXMgaW50byB0aGUgY2FjaGUgc28gdGhleSBzdXJmYWNlIGluIHRoZVxuXHQgKiBzZXNzaW9ucyBsaXN0ICoqYmVmb3JlKiogYSBjb25uZWN0aW9uIGlzIGVzdGFibGlzaGVkIChsYXp5IGRpc2NvdmVyeSkuIEVhY2hcblx0ICogc3VtbWFyeSBiZWNvbWVzIGEgY2FjaGVkIGFkYXB0ZXIga2V5ZWQgYnkgaXRzIHJhdyBzZXNzaW9uIGlkOyBlbnRyaWVzIHRoYXRcblx0ICogYWxyZWFkeSBleGlzdCAoZS5nLiBmcm9tIGEgcHJpb3IgbGl2ZSBgbGlzdFNlc3Npb25zKClgIG9yIHBlcnNpc3RlbmNlKSBhcmVcblx0ICogbGVmdCB1bnRvdWNoZWQgc28gdGhlIGxpdmUgcmVmcmVzaCBzdGF5cyBhdXRob3JpdGF0aXZlLiBPcGVuaW5nIGEgc2VlZGVkXG5cdCAqIHNlc3Npb24gdHJpZ2dlcnMgYGNvbm5lY3RPbkRlbWFuZGAgdmlhIHRoZSBhc3luYyBhY3RpdmF0aW9uIHJlZ2lzdHJ5LCBhZnRlclxuXHQgKiB3aGljaCBgX3JlZnJlc2hTZXNzaW9uc2AgcmVjb25jaWxlcyB0aGUgc2VlZCB3aXRoIHRoZSBob3N0J3MgcmVhbCBzdGF0ZS5cblx0ICovXG5cdHNlZWRTZXNzaW9ucyhtZXRhczogcmVhZG9ubHkgSUFnZW50U2Vzc2lvbk1ldGFkYXRhW10pOiB2b2lkIHtcblx0XHRjb25zdCBhZGRlZDogSVNlc3Npb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmF3TWV0YSBvZiBtZXRhcykge1xuXHRcdFx0Y29uc3QgbWV0YSA9IHRoaXMuX2Fkb3B0U2Vzc2lvbk1ldGEocmF3TWV0YSk7XG5cdFx0XHRjb25zdCByYXdJZCA9IEFnZW50U2Vzc2lvbi5pZChtZXRhLnNlc3Npb24pO1xuXHRcdFx0aWYgKHRoaXMuX3Nlc3Npb25DYWNoZS5oYXMocmF3SWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWRhcHRlciA9IHRoaXMuY3JlYXRlQWRhcHRlcihtZXRhKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25DYWNoZS5zZXQocmF3SWQsIGFkYXB0ZXIpO1xuXHRcdFx0YWRkZWQucHVzaChhZGFwdGVyKTtcblx0XHR9XG5cdFx0aWYgKGFkZGVkLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW10gfSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE1hcCBhIGhvc3QtcmVwb3J0ZWQgc2Vzc2lvbiBVUkkgb250byB0aGUgVUkgc2NoZW1lLCBzbyB0aGUgc2Vzc2lvbiByb3V0ZXMgdG8gdGhlIGFnZW50J3Ncblx0ICogY29udGVudCBwcm92aWRlci4gVGhlIHJhdyBpZCBpcyBwcmVzZXJ2ZWQsIHNvIGNhY2hlIGtleXMgYXJlIHVuYWZmZWN0ZWQuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2Fkb3B0U2Vzc2lvbk1ldGEobWV0YTogSUFnZW50U2Vzc2lvbk1ldGFkYXRhKTogSUFnZW50U2Vzc2lvbk1ldGFkYXRhIHtcblx0XHRjb25zdCBhbGlhcyA9IHRoaXMuX3Nlc3Npb25TY2hlbWVBbGlhcztcblx0XHRpZiAoIWFsaWFzIHx8IG1ldGEuc2Vzc2lvbi5zY2hlbWUgIT09IGFsaWFzLmJhY2tlbmQpIHtcblx0XHRcdHJldHVybiBtZXRhO1xuXHRcdH1cblx0XHRyZXR1cm4geyAuLi5tZXRhLCBzZXNzaW9uOiBtZXRhLnNlc3Npb24ud2l0aCh7IHNjaGVtZTogYWxpYXMudWkgfSkgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbnZlcnNlIG9mIHtAbGluayBfYWRvcHRTZXNzaW9uTWV0YX06IG1hcCB0aGUgVUkgc2NoZW1lIGJhY2sgdG8gdGhlIG9uZSB0aGUgaG9zdCdzIHNlc3Npb25cblx0ICogcmVnaXN0cnkgaXMga2V5ZWQgYnksIHNvIGJhY2tlbmQgY2FsbHMgYWRkcmVzcyB0aGUgVVJJIHRoZSBob3N0IGtub3dzLlxuXHQgKi9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9iYWNrZW5kU2Vzc2lvblNjaGVtZShhZ2VudFByb3ZpZGVyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGFsaWFzID0gdGhpcy5fc2Vzc2lvblNjaGVtZUFsaWFzO1xuXHRcdHJldHVybiBhbGlhcyAmJiBhZ2VudFByb3ZpZGVyID09PSBhbGlhcy51aSA/IGFsaWFzLmJhY2tlbmQgOiBhZ2VudFByb3ZpZGVyO1xuXHR9XG5cblx0c2V0QXV0aGVudGljYXRpb25QZW5kaW5nKHBlbmRpbmc6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHQvLyBTdGlja3k6IG9uY2UgdGhlIGZpcnN0IGF1dGhlbnRpY2F0aW9uIHBhc3Mgc2V0dGxlcywgbmV2ZXIgc3VyZmFjZVxuXHRcdC8vIHBlbmRpbmcgYWdhaW4uIFN1YnNlcXVlbnQgcmUtYXV0aHMgaGFwcGVuIHNpbGVudGx5IGluIHRoZSBiYWNrZ3JvdW5kLlxuXHRcdGlmICh0aGlzLl9hdXRoZW50aWNhdGlvblNldHRsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFwZW5kaW5nKSB7XG5cdFx0XHR0aGlzLl9hdXRoZW50aWNhdGlvblNldHRsZWQgPSB0cnVlO1xuXHRcdH1cblx0XHR0aGlzLl9hdXRoZW50aWNhdGlvblBlbmRpbmcuc2V0KHBlbmRpbmcsIHVuZGVmaW5lZCk7XG5cdFx0aWYgKCFwZW5kaW5nKSB7XG5cdFx0XHR0aGlzLl9yZXN1bWVOZXdTZXNzaW9uQWZ0ZXJBdXRoZW50aWNhdGlvblNldHRsZXMoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogV2lyZSBhIGxpdmUgY29ubmVjdGlvbiB0byB0aGlzIHByb3ZpZGVyLCBlbmFibGluZyBzZXNzaW9uIG9wZXJhdGlvbnMgYW5kIGZvbGRlciBicm93c2luZy5cblx0ICovXG5cdHNldENvbm5lY3Rpb24oY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbiwgZGVmYXVsdERpcmVjdG9yeT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb25uZWN0aW9uID09PSBjb25uZWN0aW9uICYmIHRoaXMuX2RlZmF1bHREaXJlY3RvcnkgPT09IGRlZmF1bHREaXJlY3RvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3YXNVbnB1Ymxpc2hlZCA9IHRoaXMuX3VucHVibGlzaGVkO1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb25MaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHR0aGlzLl9zZXNzaW9uU3RhdGVTdWJzY3JpcHRpb25zLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb24gPSBjb25uZWN0aW9uO1xuXHRcdHRoaXMuX2RlZmF1bHREaXJlY3RvcnkgPSBkZWZhdWx0RGlyZWN0b3J5O1xuXHRcdHRoaXMuX3VucHVibGlzaGVkID0gZmFsc2U7XG5cblx0XHR0aGlzLl9zeW5jUm9vdFN0YXRlKGNvbm5lY3Rpb24ucm9vdFN0YXRlLnZhbHVlKTtcblx0XHR0aGlzLl9jb25uZWN0aW9uTGlzdGVuZXJzLmFkZChjb25uZWN0aW9uLnJvb3RTdGF0ZS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9zeW5jUm9vdFN0YXRlKGNvbm5lY3Rpb24ucm9vdFN0YXRlLnZhbHVlKTtcblx0XHR9KSk7XG5cdFx0aWYgKGNvbm5lY3Rpb24ucm9vdFN0YXRlLm9uRGlkRXJyb3IpIHtcblx0XHRcdHRoaXMuX2Nvbm5lY3Rpb25MaXN0ZW5lcnMuYWRkKGNvbm5lY3Rpb24ucm9vdFN0YXRlLm9uRGlkRXJyb3IoZXJyb3IgPT4ge1xuXHRcdFx0XHR0aGlzLl9zeW5jUm9vdFN0YXRlKGVycm9yKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9hdHRhY2hDb25uZWN0aW9uTGlzdGVuZXJzKGNvbm5lY3Rpb24sIHRoaXMuX2Nvbm5lY3Rpb25MaXN0ZW5lcnMpO1xuXG5cdFx0Ly8gQWx3YXlzIHJlZnJlc2ggc2Vzc2lvbnMgd2hlbiBhIGNvbm5lY3Rpb24gaXMgKHJlKWVzdGFibGlzaGVkLlxuXHRcdC8vIGBfcmVmcmVzaFNlc3Npb25zYCBvd25zIGBfY2FjaGVJbml0aWFsaXplZGAgKHNldCBvbiBhIHN1Y2Nlc3NmdWxcblx0XHQvLyBsaXN0KSBhbmQgYXJtcyBhIGJhY2tvZmYgcmV0cnkgaWYgdGhlIGZpcnN0IGF0dGVtcHQgZmFpbHMuXG5cdFx0dGhpcy5fcmVmcmVzaFNlc3Npb25zKHdhc1VucHVibGlzaGVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDbGVhciB0aGUgY29ubmVjdGlvbiwgZS5nLiB3aGVuIHRoZSByZW1vdGUgaG9zdCBkaXNjb25uZWN0cy5cblx0ICogUmV0YWlucyB0aGUgcHJvdmlkZXIgcmVnaXN0cmF0aW9uIHNvIGl0IHJlbWFpbnMgdmlzaWJsZSBpbiB0aGUgVUksXG5cdCAqIGFuZCAqKnByZXNlcnZlcyoqIHRoZSBjYWNoZWQgc2Vzc2lvbiBsaXN0IHNvIHByZXZpb3VzbHkgbG9hZGVkXG5cdCAqIHNlc3Npb25zIHN0YXkgdmlzaWJsZSB3aGlsZSB3ZSdyZSBvZmZsaW5lLiBDYWxsZXJzIHRoYXQga25vdyB0aGVcblx0ICogaG9zdCBpcyB1bnJlYWNoYWJsZSBzaG91bGQgZm9sbG93IHVwIHdpdGgge0BsaW5rIHVucHVibGlzaENhY2hlZFNlc3Npb25zfS5cblx0ICovXG5cdGNsZWFyQ29ubmVjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9jb25uZWN0aW9uTGlzdGVuZXJzLmNsZWFyKCk7XG5cdFx0dGhpcy5fc2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9ucy5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblx0XHR0aGlzLl9vbkRpZERpc2Nvbm5lY3QuZmlyZSgpO1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZGVmYXVsdERpcmVjdG9yeSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9kaXNwb3NlQWxsTmV3U2Vzc2lvbnMoKTtcblx0XHR0aGlzLl9zeW5jUm9vdFN0YXRlKHVuZGVmaW5lZCk7XG5cblx0XHQvLyBEcm9wIG9ubHkgdGhlIHRyYW5zaWVudCBwZW5kaW5nL2RyYWZ0IHNlc3Npb247IGtlZXAgdGhlIHBlcnNpc3RlZFxuXHRcdC8vIGNhY2hlIHNvIHRoZSB3b3Jrc3BhY2UgcGlja2VyIGtlZXBzIHNob3dpbmcgb2ZmbGluZSBzZXNzaW9ucy5cblx0XHRpZiAodGhpcy5fcGVuZGluZ1Nlc3Npb24pIHtcblx0XHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nU2Vzc2lvbjtcblx0XHRcdHRoaXMuX3BlbmRpbmdTZXNzaW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbcGVuZGluZ10sIGNoYW5nZWQ6IFtdIH0pO1xuXHRcdH1cblxuXHRcdC8vIFJlc2V0IHRoZSBpbi1tZW1vcnkgY2FjaGUtaW5pdGlhbGl6ZWQgZmxhZyBzbyBhIGZyZXNoIGNvbm5lY3Rpb25cblx0XHQvLyB0cmlnZ2VycyBhIGZ1bGwgbGlzdCByZWZyZXNoICh3aGljaCB3aWxsIHJlY29uY2lsZSBhZ2FpbnN0IHRoZVxuXHRcdC8vIHBlcnNpc3RlZCBlbnRyaWVzIHdlIGtlZXAgb24gZGlzaykuXG5cdFx0dGhpcy5fY2FjaGVJbml0aWFsaXplZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2NhbmNlbFNlc3Npb25SZWZyZXNoUmV0cnkoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIaWRlIGNhY2hlZCBzZXNzaW9ucyBmcm9tIHRoZSBVSSB3aXRob3V0IGRpc2NhcmRpbmcgdGhlbS4gQ2FsbGVkIGJ5IHRoZVxuXHQgKiBob3N0LXRyYWNraW5nIGNvbnRyaWJ1dGlvbnMgd2hlbiB0aGV5IGRldGVybWluZSB0aGUgcmVtb3RlIGhvc3QgaXNcblx0ICogdW5yZWFjaGFibGUgKHR1bm5lbCBvZmZsaW5lIG9yIFNTSCByZWNvbm5lY3QgZmFpbGVkKS4gVGhlIGluLW1lbW9yeVxuXHQgKiBjYWNoZSBhbmQgcGVyc2lzdGVkIHN0b3JhZ2UgYXJlIGxlZnQgaW50YWN0IHNvIHRoZSBzZXNzaW9ucyBjYW4gYmVcblx0ICogcmVzdG9yZWQgaWYgdGhlIGhvc3QgY29tZXMgYmFjayBvbmxpbmUgaW4gdGhpcyBzZXNzaW9uLCBvciBvbiB0aGUgbmV4dFxuXHQgKiBsYXVuY2guIFRoZSBuZXh0IHtAbGluayBzZXRDb25uZWN0aW9ufSBjYWxsIHJlLWFubm91bmNlcyB0aGUgY2FjaGVkXG5cdCAqIGVudHJpZXMuXG5cdCAqL1xuXHR1bnB1Ymxpc2hDYWNoZWRTZXNzaW9ucygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdW5wdWJsaXNoZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdW5wdWJsaXNoZWQgPSB0cnVlO1xuXHRcdGlmICh0aGlzLl9zZXNzaW9uQ2FjaGUuc2l6ZSA+IDApIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtdIH0pO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tIFNlc3Npb24tdHlwZSBzeW5jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByb3RlY3RlZCBfZm9ybWF0U2Vzc2lvblR5cGVMYWJlbChhZ2VudExhYmVsOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdC8vIEluIHdlYiAodnNjb2RlLmRldi9hZ2VudHMpIHRoZSB3b3JrYmVuY2ggaXMgYWxyZWFkeSBzY29wZWQgdG8gYVxuXHRcdC8vIHNpbmdsZSBob3N0IHZpYSB0aGUgaG9zdCBwaWNrZXIsIHNvIHRoZXJlJ3Mgbm8gbmVlZCB0byBkaXNhbWJpZ3VhdGVcblx0XHQvLyB0aGUgc2Vzc2lvbi10eXBlIGxhYmVsIHdpdGggdGhlIGhvc3QgbmFtZS5cblx0XHRpZiAodGhpcy5pc1dlYlBsYXRmb3JtKSB7XG5cdFx0XHRyZXR1cm4gYWdlbnRMYWJlbDtcblx0XHR9XG5cdFx0cmV0dXJuIGAke2FnZW50TGFiZWx9IFske3RoaXMubGFiZWx9XWA7XG5cdH1cblxuXHQvLyAtLSBXb3Jrc3BhY2VzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdGF0aWMgYnVpbGRXb3Jrc3BhY2UocHJvamVjdDogSUFnZW50U2Vzc2lvbk1ldGFkYXRhWydwcm9qZWN0J10sIHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQsIHByb3ZpZGVyTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgZ2l0SHViSW5mbzogSU9ic2VydmFibGU8SUdpdEh1YkluZm8gfCB1bmRlZmluZWQ+LCBnaXRTdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSB8IHVuZGVmaW5lZCwgZGVzY3JpcHRpb24/OiBzdHJpbmcsIGJyYW5jaFByb3RlY3Rpb25QYXR0ZXJucz86IHJlYWRvbmx5IHN0cmluZ1tdKTogSVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBidWlsZEFnZW50SG9zdFNlc3Npb25Xb3Jrc3BhY2UocHJvamVjdCwgd29ya2luZ0RpcmVjdG9yaWVzLCB7IHByb3ZpZGVyTGFiZWwsIGZhbGxiYWNrSWNvbjogQ29kaWNvbi5yZW1vdGUsIHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IHRydWUsIGRlc2NyaXB0aW9uLCBicmFuY2hQcm90ZWN0aW9uUGF0dGVybnMsIGdyb3VwOiBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9SRU1PVEUgfSwgZ2l0SHViSW5mbywgZ2l0U3RhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRXb3Jrc3BhY2VGcm9tVXJpKHVyaTogVVJJKTogSVNlc3Npb25Xb3Jrc3BhY2Uge1xuXHRcdGNvbnN0IGZvbGRlck5hbWUgPSBiYXNlbmFtZSh1cmkpIHx8IHVyaS5wYXRoO1xuXHRcdHJldHVybiB7XG5cdFx0XHR1cmksXG5cdFx0XHRsYWJlbDogdGhpcy5pc1dlYlBsYXRmb3JtID8gZm9sZGVyTmFtZSA6IGAke2ZvbGRlck5hbWV9IFske3RoaXMubGFiZWx9XWAsXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGRpcm5hbWUodXJpKSwgeyByZWxhdGl2ZTogZmFsc2UgfSksXG5cdFx0XHRncm91cDogU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfUkVNT1RFLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5yZW1vdGUsXG5cdFx0XHRmb2xkZXJzOiBbe1xuXHRcdFx0XHRyb290OiB1cmksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHVyaSxcblx0XHRcdFx0bmFtZTogZm9sZGVyTmFtZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0Z2l0UmVwb3NpdG9yeTogeyB1cmksIHdvcmtUcmVlVXJpOiB1bmRlZmluZWQsIGJhc2VCcmFuY2hOYW1lOiB1bmRlZmluZWQsIGdpdEh1YkluZm86IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpIH0sXG5cdFx0XHR9XSxcblx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IHRydWUsXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdH07XG5cdH1cblxuXHRyZXNvbHZlV29ya3NwYWNlKHJlcG9zaXRvcnlVcmk6IFVSSSk6IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAocmVwb3NpdG9yeVVyaS5zY2hlbWUgIT09IEFHRU5UX0hPU1RfU0NIRU1FKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBPbmx5IGNsYWltIFVSSXMgdGhhdCBiZWxvbmcgdG8gKnRoaXMqIGNvbm5lY3Rpb24uIFdpdGhvdXQgdGhpc1xuXHRcdC8vIGNoZWNrLCBldmVyeSBhZ2VudC1ob3N0IHByb3ZpZGVyIG1hdGNoZXMgZXZlcnkgYWdlbnQtaG9zdCBVUklcblx0XHQvLyBhbmQgdGhlIHdvcmtzcGFjZSBwaWNrZXIncyBmaXJzdC1tYXRjaC13aW5zIGxvb2t1cCBhdHRyaWJ1dGVzXG5cdFx0Ly8gdGhlIGZvbGRlciB0byB3aGljaGV2ZXIgcHJvdmlkZXIgaXMgaXRlcmF0ZWQgZmlyc3QgXHUyMDE0IHNvIGEgZm9sZGVyXG5cdFx0Ly8gcGlja2VkIGZyb20gV1NMIGVuZHMgdXAgbGFiZWxsZWQgd2l0aCBhbm90aGVyIGhvc3QncyBuYW1lLlxuXHRcdGlmIChyZXBvc2l0b3J5VXJpLmF1dGhvcml0eSAhPT0gdGhpcy5fY29ubmVjdGlvbkF1dGhvcml0eSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2J1aWxkV29ya3NwYWNlRnJvbVVyaShyZXBvc2l0b3J5VXJpKTtcblx0fVxuXG5cdC8vIC0tIEJyb3dzZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgYXN5bmMgX2Jyb3dzZUZvckZvbGRlcigpOiBQcm9taXNlPElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gRXN0YWJsaXNoIGNvbm5lY3Rpb24gb24gZGVtYW5kIGlmIGEgaG9vayBpcyBwcm92aWRlZCAoZS5nLiB0dW5uZWwgcmVsYXkpXG5cdFx0aWYgKCF0aGlzLl9jb25uZWN0aW9uICYmIHRoaXMuX2Nvbm5lY3RPbkRlbWFuZCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY29ubmVjdE9uRGVtYW5kKCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnY29ubmVjdEZhaWxlZCcsIFwiRmFpbGVkIHRvIGNvbm5lY3QgdG8gcmVtb3RlIGFnZW50IGhvc3QgJ3swfSc6IHsxfVwiLCB0aGlzLmxhYmVsLCBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycikpKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2Nvbm5lY3Rpb24pIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ25vdENvbm5lY3RlZCcsIFwiVW5hYmxlIHRvIGNvbm5lY3QgdG8gcmVtb3RlIGFnZW50IGhvc3QgJ3swfScuXCIsIHRoaXMubGFiZWwpKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVmYXVsdFVyaSA9IGFnZW50SG9zdFVyaSh0aGlzLl9jb25uZWN0aW9uQXV0aG9yaXR5LCB0aGlzLl9kZWZhdWx0RGlyZWN0b3J5ID8/ICcvJyk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWQgPSBhd2FpdCB0aGlzLl9maWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHRcdGNhblNlbGVjdEZpbGVzOiBmYWxzZSxcblx0XHRcdFx0Y2FuU2VsZWN0Rm9sZGVyczogdHJ1ZSxcblx0XHRcdFx0Y2FuU2VsZWN0TWFueTogZmFsc2UsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2VsZWN0UmVtb3RlRm9sZGVyJywgXCJTZWxlY3QgRm9sZGVyIG9uIHswfVwiLCB0aGlzLmxhYmVsKSxcblx0XHRcdFx0YXZhaWxhYmxlRmlsZVN5c3RlbXM6IFtBR0VOVF9IT1NUX1NDSEVNRV0sXG5cdFx0XHRcdGRlZmF1bHRVcmksXG5cdFx0XHR9KTtcblx0XHRcdGlmIChzZWxlY3RlZD8uWzBdKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9idWlsZFdvcmtzcGFjZUZyb21Vcmkoc2VsZWN0ZWRbMF0pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gZGlhbG9nIHdhcyBjYW5jZWxsZWQgb3IgZmFpbGVkXG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogRW51bWVyYXRlIHN1YmRpcmVjdG9yaWVzIGJlbG93IHtAbGluayBfZGVmYXVsdERpcmVjdG9yeX0sIGZpbHRlcmVkXG5cdCAqIGJ5IGEgY2FzZS1pbnNlbnNpdGl2ZSBzdWJzdHJpbmcgcXVlcnkuIEJhY2tzIHRoZSBpbmxpbmUgZm9sZGVyXG5cdCAqIGxpc3QgcmVuZGVyZWQgYnkgdGhlIG1vYmlsZSB3b3Jrc3BhY2UgcGlja2VyIHNoZWV0IHNvIHVzZXJzIGNhblxuXHQgKiBwaWNrIGEgZm9sZGVyIHdpdGhvdXQgb3BlbmluZyBhIHNlcGFyYXRlIGZpbGUtZGlhbG9nLlxuXHQgKlxuXHQgKiBUaGUgcXVlcnkgc3VwcG9ydHMgbGlnaHQgcGF0aCBuYXZpZ2F0aW9uOiBhIGAvYCBpbiB0aGUgcXVlcnkgaXNcblx0ICogdHJlYXRlZCBhcyBhIHBhdGggZGVsaW1pdGVyLCBsaXN0aW5nIGNoaWxkcmVuIG9mIGA8ZGVmYXVsdD4vPHByZWZpeD5gXG5cdCAqIGFuZCBtYXRjaGluZyB0aGUgcGFydCBhZnRlciB0aGUgbGFzdCBzbGFzaC4gU28gdHlwaW5nIGBwcm9qZWN0cy9gXG5cdCAqIGRyaWxscyBpbnRvIHRoZSBgcHJvamVjdHNgIGRpcmVjdG9yeSwgYW5kIGBwcm9qZWN0cy9mb29gIGxpc3RzXG5cdCAqIGNoaWxkcmVuIG9mIGBwcm9qZWN0c2Agd2hvc2UgbmFtZSBjb250YWlucyBgZm9vYC5cblx0ICpcblx0ICogSGlkZGVuIGRpcmVjdG9yaWVzICh0aG9zZSBzdGFydGluZyB3aXRoIGAuYCkgYXJlIG9taXR0ZWQsIHJlc3VsdHNcblx0ICogYXJlIHNvcnRlZCBieSBuYW1lLCBhbmQgdGhlIGNhbmNlbGxhdGlvbiB0b2tlbiBpcyBob25vcmVkIGJlZm9yZVxuXHQgKiBhbmQgYWZ0ZXIgdGhlIG5ldHdvcmsgcm91bmQtdHJpcCBzbyBzdGFsZSBxdWVyaWVzIGRvbid0IHN1cmZhY2Vcblx0ICogYWZ0ZXIgdGhlIHVzZXIgaGFzIHR5cGVkIG1vcmUgY2hhcmFjdGVycy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2xpc3RSZW1vdGVGb2xkZXJzKHF1ZXJ5OiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8cmVhZG9ubHkgSVNlc3Npb25Xb3Jrc3BhY2VbXT4ge1xuXHRcdC8vIEVzdGFibGlzaCBhIGNvbm5lY3Rpb24gb24gZGVtYW5kIGlmIGEgaG9vayBpcyBhdmFpbGFibGU7IGlmIGl0XG5cdFx0Ly8gZmFpbHMgb3IgaXMgdW5hdmFpbGFibGUsIHJldHVybiBlbXB0eSBzbyB0aGUgc2hlZXQgcmVuZGVycyBhblxuXHRcdC8vIGVtcHR5IHJlc3VsdCByYXRoZXIgdGhhbiB0aHJvd2luZy5cblx0XHRpZiAoIXRoaXMuX2Nvbm5lY3Rpb24gJiYgdGhpcy5fY29ubmVjdE9uRGVtYW5kKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9jb25uZWN0T25EZW1hbmQoKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fY29ubmVjdGlvbiB8fCB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJvb3RBZ2VudEhvc3RVcmkgPSBhZ2VudEhvc3RVcmkodGhpcy5fY29ubmVjdGlvbkF1dGhvcml0eSwgdGhpcy5fZGVmYXVsdERpcmVjdG9yeSA/PyAnLycpO1xuXG5cdFx0Ly8gUGFyc2UgcGF0aCBuYXZpZ2F0aW9uIG91dCBvZiB0aGUgcXVlcnkuIEFueXRoaW5nIGJlZm9yZSB0aGVcblx0XHQvLyBsYXN0IGAvYCBpcyBhIHJlbGF0aXZlIGRpcmVjdG9yeSB3ZSBkZXNjZW5kIGludG87IHRoZSBwYXJ0XG5cdFx0Ly8gYWZ0ZXIgaXMgdGhlIGZpbHRlciB3ZSBhcHBseSB0byB0aGF0IGRpcmVjdG9yeSdzIGNoaWxkcmVuLlxuXHRcdGNvbnN0IHRyaW1tZWQgPSBxdWVyeS50cmltKCk7XG5cdFx0Y29uc3QgbGFzdFNsYXNoID0gdHJpbW1lZC5sYXN0SW5kZXhPZignLycpO1xuXHRcdGxldCBsaXN0aW5nQWdlbnRIb3N0VXJpID0gcm9vdEFnZW50SG9zdFVyaTtcblx0XHRsZXQgZmlsdGVyID0gdHJpbW1lZDtcblx0XHRpZiAobGFzdFNsYXNoID49IDApIHtcblx0XHRcdGNvbnN0IHN1YlBhdGggPSB0cmltbWVkLnNsaWNlKDAsIGxhc3RTbGFzaCkucmVwbGFjZSgvXlxcLyt8XFwvKyQvZywgJycpO1xuXHRcdFx0ZmlsdGVyID0gdHJpbW1lZC5zbGljZShsYXN0U2xhc2ggKyAxKTtcblx0XHRcdGlmIChzdWJQYXRoKSB7XG5cdFx0XHRcdGxpc3RpbmdBZ2VudEhvc3RVcmkgPSBVUkkuam9pblBhdGgocm9vdEFnZW50SG9zdFVyaSwgc3ViUGF0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGxpc3RpbmdPcmlnaW5hbFVyaSA9IGZyb21BZ2VudEhvc3RVcmkobGlzdGluZ0FnZW50SG9zdFVyaSk7XG5cblx0XHRsZXQgZW50cmllcztcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fY29ubmVjdGlvbi5yZXNvdXJjZUxpc3QobGlzdGluZ09yaWdpbmFsVXJpKTtcblx0XHRcdGVudHJpZXMgPSByZXN1bHQuZW50cmllcztcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG93ZXJGaWx0ZXIgPSBmaWx0ZXIudG9Mb2NhbGVMb3dlckNhc2UoKTtcblx0XHRjb25zdCBmb2xkZXJzOiBJU2Vzc2lvbldvcmtzcGFjZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRpZiAoZW50cnkudHlwZSAhPT0gJ2RpcmVjdG9yeScpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZW50cnkubmFtZS5zdGFydHNXaXRoKCcuJykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAobG93ZXJGaWx0ZXIgJiYgIWVudHJ5Lm5hbWUudG9Mb2NhbGVMb3dlckNhc2UoKS5pbmNsdWRlcyhsb3dlckZpbHRlcikpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjaGlsZFVyaSA9IFVSSS5qb2luUGF0aChsaXN0aW5nQWdlbnRIb3N0VXJpLCBlbnRyeS5uYW1lKTtcblx0XHRcdC8vIFVzZSBhIGZvbGRlciBpY29uIGZvciBpbmxpbmUgbGlzdCByb3dzIFx1MjAxNCBgQ29kaWNvbi5yZW1vdGVgXG5cdFx0XHQvLyBpcyB0aGUgcmlnaHQgY2hvaWNlIGZvciB0aGUgaG9zdC1sZXZlbCBicm93c2UgYWN0aW9uLFxuXHRcdFx0Ly8gYnV0IHBlci1mb2xkZXIgcm93cyByZWFkIGJldHRlciBhcyBmb2xkZXIgZ2x5cGhzLlxuXHRcdFx0Zm9sZGVycy5wdXNoKHsgLi4udGhpcy5fYnVpbGRXb3Jrc3BhY2VGcm9tVXJpKGNoaWxkVXJpKSwgaWNvbjogQ29kaWNvbi5mb2xkZXIgfSk7XG5cdFx0fVxuXHRcdGZvbGRlcnMuc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKTtcblx0XHRyZXR1cm4gZm9sZGVycztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBOEIsdUJBQXVCO0FBQzlELFNBQVMsYUFBYTtBQUN0QixTQUFTLFVBQVUsZUFBZTtBQUVsQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0I7QUFD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
