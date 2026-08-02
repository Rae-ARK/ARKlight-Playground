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
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Disposable, DisposableMap, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { autorun, constObservable, observableFromEvent, observableValue, transaction } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IChatService, convertLegacyChatSessionTiming } from "../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { SessionType } from "../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { SessionStatus, toSessionId, SESSION_WORKSPACE_GROUP_LOCAL, ChatInteractivity } from "../../../../services/sessions/common/session.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel, isChatPermissionLevel } from "../../../../../workbench/contrib/chat/common/constants.js";
import { basename, dirname, isEqual } from "../../../../../base/common/resources.js";
import { isBuiltinChatMode } from "../../../../../workbench/contrib/chat/common/chatModes.js";
import { IGitService } from "../../../../../workbench/contrib/git/common/gitService.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ILanguageModelsService } from "../../../../../workbench/contrib/chat/common/languageModels.js";
import { getRegisteredLanguageModels, resolveModelIdentifierFromLanguageModels } from "../../../../../workbench/contrib/chat/common/modelSelection.js";
import { ILanguageModelToolsService } from "../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js";
import { createChangesets } from "../../copilotChatSessions/browser/copilotChatSessionsChangesets.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
const LocalSessionType = {
  id: "local",
  label: localize("localSession", "Local"),
  icon: Codicon.vm
};
const LOCAL_SESSION_ENABLED_SETTING = "sessions.chat.localAgent.enabled";
const LOCAL_PROVIDER_ID = "local-chat";
const STORAGE_KEY_SESSIONS = "sessions.localChat.sessions";
const STORAGE_KEY_MIGRATED = "sessions.localChat.migrated";
function buildChat(session) {
  return {
    resource: session.resource,
    createdAt: session.createdAt,
    title: session.title,
    updatedAt: session.updatedAt,
    status: session.status,
    changes: session.changes,
    checkpoints: session.checkpoints,
    modelId: session.modelId,
    mode: session.mode,
    isArchived: session.isArchived,
    isRead: session.isRead,
    interactivity: constObservable(ChatInteractivity.Full),
    description: session.description,
    lastTurnEnd: session.lastTurnEnd
  };
}
let LocalSession = class extends Disposable {
  constructor(detail, workspace, providerId, gitService, chatService, fileService) {
    super();
    this.gitService = gitService;
    this.chatService = chatService;
    this.fileService = fileService;
    this.sessionType = SessionType.Local;
    this._title = observableValue(this, "");
    this.title = this._title;
    this._updatedAt = observableValue(this, /* @__PURE__ */ new Date());
    this.updatedAt = this._updatedAt;
    this._status = observableValue(this, SessionStatus.Untitled);
    this.status = this._status;
    this._permissionLevel = observableValue(this, ChatPermissionLevel.Default);
    this.permissionLevel = this._permissionLevel;
    this._workspaceData = observableValue(this, void 0);
    this.workspace = this._workspaceData;
    this.checkpoints = constObservable(void 0);
    this._changes = observableValue(this, []);
    this.changes = this._changes;
    this._modelIdObservable = observableValue(this, void 0);
    this.modelId = this._modelIdObservable;
    this._modeObservable = observableValue(this, void 0);
    this.mode = this._modeObservable;
    this.loading = constObservable(false);
    this._isArchived = observableValue(this, false);
    this.isArchived = this._isArchived;
    this._isRead = observableValue(this, true);
    this.isRead = this._isRead;
    this.description = constObservable(void 0);
    this._lastTurnEnd = observableValue(this, void 0);
    this.lastTurnEnd = this._lastTurnEnd;
    this.selectedOptions = /* @__PURE__ */ new Map();
    this._modelTracker = this._register(new MutableDisposable());
    this._wasRequestInProgress = false;
    this.providerId = providerId;
    this.icon = LocalSessionType.icon;
    if (detail) {
      const timing = convertLegacyChatSessionTiming(detail.timing);
      this.resource = detail.sessionResource;
      this.createdAt = new Date(timing.created);
      const lastUpdate = detail.lastMessageDate || timing.lastRequestEnded || timing.lastRequestStarted || timing.created;
      this._title.set(detail.title, void 0);
      this._updatedAt.set(new Date(lastUpdate), void 0);
      this._status.set(detail.isActive ? SessionStatus.InProgress : SessionStatus.Completed, void 0);
      this._lastTurnEnd.set(timing.lastRequestEnded ? new Date(timing.lastRequestEnded) : void 0, void 0);
      if (workspace) {
        this._workspaceData.set(workspace, void 0);
      }
    } else {
      const modelRef = this._register(this.chatService.startNewLocalSession(
        ChatAgentLocation.Chat,
        { debugOwner: "LocalChatSessionsProvider#createNewSession" }
      ));
      if (workspace && workspace.folders.length > 0) {
        modelRef.object.setWorkingDirectory(workspace.folders[0]?.root);
      }
      this.resource = modelRef.object.sessionResource;
      this.createdAt = /* @__PURE__ */ new Date();
      if (workspace) {
        this._workspaceData.set(workspace, void 0);
        this._resolveGitState(workspace);
      }
    }
    this.sessionId = toSessionId(providerId, this.resource);
    this.mainChat = observableValue(this, buildChat(this));
  }
  get parentResource() {
    return this._parentResource;
  }
  setParentResource(resource) {
    this._parentResource = resource;
  }
  get selectedModelId() {
    return this._modelId;
  }
  get chatMode() {
    return this._mode;
  }
  /**
   * Creates a session from persisted chat history.
   */
  static fromHistory(detail, providerId, workspace, instantiationService) {
    return instantiationService.createInstance(LocalSession, detail, workspace, providerId);
  }
  async _resolveGitState(workspace) {
    const repoUri = workspace.folders[0]?.root;
    if (!repoUri) {
      return;
    }
    try {
      const repo = await this.gitService.openRepository(repoUri);
      if (!repo) {
        return;
      }
      const folder = workspace.folders[0];
      const baseGitRepo = folder.gitRepository ?? {
        uri: folder.root,
        workTreeUri: void 0,
        baseBranchName: void 0,
        gitHubInfo: constObservable(void 0)
      };
      let diffVersion = 0;
      this._register(autorun((reader) => {
        const state = repo.state.read(reader);
        const head = state.HEAD;
        const branchName = head?.commit ? head.name : void 0;
        const upstreamBranchName = head?.upstream ? `${head.upstream.remote}/${head.upstream.name}` : void 0;
        const uncommittedChanges = state.workingTreeChanges.length + state.untrackedChanges.length + state.indexChanges.length;
        this._workspaceData.set({
          ...workspace,
          folders: [{
            ...folder,
            gitRepository: {
              ...baseGitRepo,
              branchName,
              upstreamBranchName,
              uncommittedChanges
            }
          }]
        }, void 0);
        const allStateChanges = [...state.workingTreeChanges, ...state.untrackedChanges, ...state.indexChanges];
        const version = ++diffVersion;
        repo.diffBetweenWithStats2("HEAD").then(async (diffChanges) => {
          if (this._store.isDisposed || version !== diffVersion) {
            return;
          }
          const trackedUris = new Set(diffChanges.map((el) => el.uri.toString()));
          const changes = diffChanges.map((el) => ({
            uri: el.uri,
            originalUri: el.originalUri,
            modifiedUri: el.modifiedUri ?? el.uri,
            insertions: el.insertions,
            deletions: el.deletions
          }));
          const untrackedFiles = allStateChanges.filter((el) => !trackedUris.has(el.uri.toString()));
          const lineCountPromises = untrackedFiles.map(async (el) => {
            let insertions = 0;
            try {
              const stat = await this.fileService.stat(el.uri);
              if (!stat.isDirectory) {
                const content = await this.fileService.readFile(el.uri);
                const text = content.value.toString();
                insertions = text.length > 0 ? text.split("\n").length : 0;
              }
            } catch {
            }
            return {
              uri: el.uri,
              originalUri: void 0,
              modifiedUri: el.modifiedUri ?? el.uri,
              insertions,
              deletions: 0
            };
          });
          const untrackedChanges = await Promise.all(lineCountPromises);
          if (this._store.isDisposed || version !== diffVersion) {
            return;
          }
          changes.push(...untrackedChanges);
          this._changes.set(changes, void 0);
        }, () => {
          if (this._store.isDisposed || version !== diffVersion) {
            return;
          }
          this._changes.set(allStateChanges.map((el) => ({
            uri: el.uri,
            originalUri: el.originalUri,
            modifiedUri: el.modifiedUri ?? el.uri,
            insertions: 0,
            deletions: 0
          })), void 0);
        });
      }));
    } catch {
    }
  }
  setPermissionLevel(level) {
    this._permissionLevel.set(level, void 0);
  }
  setModelId(modelId) {
    this._modelId = modelId;
    this._modelIdObservable.set(modelId, void 0);
  }
  setTitle(title) {
    this._title.set(title, void 0);
  }
  setUpdatedAt(date) {
    this._updatedAt.set(date, void 0);
  }
  setStatus(status) {
    this._status.set(status, void 0);
  }
  setArchived(archived) {
    this._isArchived.set(archived, void 0);
  }
  setRead(isRead) {
    this._isRead.set(isRead, void 0);
  }
  /**
   * Subscribe to live updates from the given chat model. Subsequent calls
   * replace any prior subscription. Disposed automatically with the session.
   */
  trackModel(model, onChange) {
    this._modelTracker.value = autorun((reader) => {
      const inProgress = model.requestInProgress.read(reader);
      this._status.set(inProgress ? SessionStatus.InProgress : SessionStatus.Completed, void 0);
      if (this._wasRequestInProgress && !inProgress) {
        this._isRead.set(false, void 0);
      }
      this._wasRequestInProgress = inProgress;
      onChange();
    });
  }
  setMode(mode) {
    this._mode = mode;
    if (mode) {
      this._modeObservable.set({ id: mode.id, kind: mode.kind }, void 0);
    } else {
      this._modeObservable.set(void 0, void 0);
    }
  }
  /**
   * Update this session from a persisted history detail.
   */
  updateFromHistory(detail) {
    const timing = convertLegacyChatSessionTiming(detail.timing);
    const lastUpdate = detail.lastMessageDate || timing.lastRequestEnded || timing.lastRequestStarted || timing.created;
    transaction((tx) => {
      this._title.set(detail.title, tx);
      this._updatedAt.set(new Date(lastUpdate), tx);
      this._status.set(detail.isActive ? SessionStatus.InProgress : SessionStatus.Completed, tx);
      this._lastTurnEnd.set(timing.lastRequestEnded ? new Date(timing.lastRequestEnded) : void 0, tx);
    });
  }
};
LocalSession = __decorateClass([
  __decorateParam(3, IGitService),
  __decorateParam(4, IChatService),
  __decorateParam(5, IFileService)
], LocalSession);
let LocalChatSessionsProvider = class extends Disposable {
  constructor(chatService, instantiationService, languageModelsService, toolsService, configurationService, labelService, logService, storageService, dialogService) {
    super();
    this.chatService = chatService;
    this.instantiationService = instantiationService;
    this.languageModelsService = languageModelsService;
    this.toolsService = toolsService;
    this.configurationService = configurationService;
    this.labelService = labelService;
    this.logService = logService;
    this.storageService = storageService;
    this.dialogService = dialogService;
    this.id = LOCAL_PROVIDER_ID;
    this.label = localize("localChatSessionsProvider", "Copilot Chat");
    this.icon = Codicon.vm;
    this.order = 0;
    this.browseActions = [];
    this.supportsLocalWorkspaces = true;
    this.sessionTypes = [LocalSessionType];
    this.onDidChangeSessionTypes = Event.None;
    this._onDidChangeSessions = this._register(new Emitter());
    this.onDidChangeSessions = this._onDidChangeSessions.event;
    /** Cache of sessions, keyed by resource URI string. Holds every chat (primary and children). */
    this._sessionCache = /* @__PURE__ */ new Map();
    /** Aggregated multi-chat session wrappers, keyed by group (primary) session id. */
    this._sessionGroupCache = /* @__PURE__ */ new Map();
    /** Fires when the set of chats in a group changes (chat added or removed). */
    this._onDidChangeGroupMembership = this._register(new Emitter());
    this._newSessions = this._register(new DisposableMap());
    this._register(this.chatService.onDidSubmitRequest((e) => {
      const session = this._sessionCache.get(e.chatSessionResource.toString());
      if (session) {
        this._syncSessionFromModel(session);
      }
    }));
    this._migrateFromHistory().finally(() => {
      this._loadPersistedSessions();
    });
  }
  /**
   * One-time migration that imports existing local chat sessions from
   * {@link IChatService.getLocalSessionHistory} into our own persisted
   * storage. Only sessions with a working directory are migrated, since
   * a working directory is mandatory for {@link LocalSession}. Sessions
   * that are already in our storage are skipped.
   */
  async _migrateFromHistory() {
    if (this.storageService.getBoolean(STORAGE_KEY_MIGRATED, StorageScope.PROFILE, false)) {
      return;
    }
    try {
      const history = await this.chatService.getLocalSessionHistory();
      const sessions = this._readStoredSessions();
      const existingKeys = new Set(sessions.map((s) => URI.revive(s.uri).toString()));
      let changed = false;
      for (const detail of history) {
        if (!detail.workingDirectory) {
          continue;
        }
        const key = detail.sessionResource.toString();
        if (existingKeys.has(key)) {
          continue;
        }
        const timing = convertLegacyChatSessionTiming(detail.timing);
        const lastUpdate = detail.lastMessageDate || timing.lastRequestEnded || timing.lastRequestStarted || timing.created;
        sessions.push({
          uri: detail.sessionResource.toJSON(),
          title: detail.title,
          createdAt: timing.created,
          lastMessageDate: lastUpdate,
          workingDirectory: detail.workingDirectory.toJSON()
        });
        changed = true;
      }
      if (changed) {
        this._writeStoredSessions(sessions);
      }
      this.storageService.store(STORAGE_KEY_MIGRATED, true, StorageScope.PROFILE, StorageTarget.MACHINE);
    } catch (e) {
      this.logService.error("[LocalChatSessionsProvider] Failed to migrate local chat history", e);
    }
  }
  /**
   * Reads current title/timing from the live chat model, updates the
   * cached session, persists changes, and sets up reactive tracking
   * so subsequent status changes propagate automatically.
   */
  _syncSessionFromModel(session) {
    const model = this.chatService.getSession(session.resource);
    if (!model) {
      return;
    }
    session.trackModel(model, () => {
      const timing = model.timing;
      const lastUpdate = timing.lastRequestEnded ?? timing.lastRequestStarted ?? timing.created;
      session.setTitle(model.title);
      session.setUpdatedAt(new Date(lastUpdate));
      this._updateStoredSession(session);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(session)] });
    });
  }
  // -- Session types --
  getSessionTypes(_workspaceUri) {
    return [LocalSessionType];
  }
  // -- Sessions --
  getSessions() {
    const sessions = [];
    for (const session of this._sessionCache.values()) {
      if (session.parentResource) {
        continue;
      }
      sessions.push(this._toISession(session));
    }
    return sessions;
  }
  /**
   * Loads sessions from our own persisted storage. No calls to
   * {@link IChatService} are needed — all metadata is stored inline.
   *
   * All chats are loaded into the cache first so that the chat hierarchy
   * (children referencing their primary via `parentUri`) can be resolved.
   * A child whose primary is missing from storage is treated as a primary
   * (its `parentResource` is left unset) so it is never lost.
   */
  _loadPersistedSessions() {
    const storedSessions = this._readStoredSessions();
    if (storedSessions.length === 0) {
      return;
    }
    const storedKeys = new Set(storedSessions.map((s) => URI.revive(s.uri).toString()));
    const loaded = [];
    for (const stored of storedSessions) {
      const uri = URI.revive(stored.uri);
      const key = uri.toString();
      if (this._sessionCache.has(key)) {
        continue;
      }
      const workingDirectory = URI.revive(stored.workingDirectory);
      const detail = {
        sessionResource: uri,
        title: stored.title,
        lastMessageDate: stored.lastMessageDate,
        timing: { created: stored.createdAt, lastRequestStarted: void 0, lastRequestEnded: stored.lastMessageDate },
        isActive: false,
        lastResponseState: 0,
        workingDirectory
      };
      const workspace = this.resolveWorkspace(workingDirectory);
      const session = LocalSession.fromHistory(detail, this.id, workspace, this.instantiationService);
      if (stored.archived) {
        session.setArchived(true);
      }
      session.setRead(stored.isRead ?? false);
      if (stored.parentUri) {
        const parentUri = URI.revive(stored.parentUri);
        if (storedKeys.has(parentUri.toString())) {
          session.setParentResource(parentUri);
        }
      }
      this._sessionCache.set(key, session);
      loaded.push(session);
    }
    const added = [];
    for (const session of loaded) {
      if (session.parentResource) {
        continue;
      }
      added.push(this._toISession(session));
    }
    if (added.length > 0) {
      this._onDidChangeSessions.fire({ added, removed: [], changed: [] });
    }
  }
  // -- Storage helpers --
  _readStoredSessions() {
    const raw = this.storageService.get(STORAGE_KEY_SESSIONS, StorageScope.PROFILE);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  _addStoredSession(session) {
    const sessions = this._readStoredSessions();
    const key = session.resource.toString();
    if (sessions.some((s) => URI.revive(s.uri).toString() === key)) {
      return;
    }
    const workingDirectory = session.workspace.get()?.folders[0]?.root;
    if (!workingDirectory) {
      this.logService.warn(`[LocalChatSessionsProvider] Cannot persist session ${key} \u2014 no working directory`);
      return;
    }
    sessions.push({
      uri: session.resource.toJSON(),
      title: session.title.get(),
      createdAt: session.createdAt.getTime(),
      lastMessageDate: session.updatedAt.get().getTime(),
      workingDirectory: workingDirectory.toJSON(),
      parentUri: session.parentResource?.toJSON()
    });
    this._writeStoredSessions(sessions);
  }
  _updateStoredSession(session) {
    const sessions = this._readStoredSessions();
    const key = session.resource.toString();
    const idx = sessions.findIndex((s) => URI.revive(s.uri).toString() === key);
    if (idx >= 0) {
      sessions[idx] = {
        ...sessions[idx],
        title: session.title.get(),
        lastMessageDate: session.updatedAt.get().getTime(),
        archived: session.isArchived.get(),
        isRead: session.isRead.get()
      };
      this._writeStoredSessions(sessions);
    }
  }
  _removeStoredSession(resource) {
    const sessions = this._readStoredSessions();
    const key = resource.toString();
    const filtered = sessions.filter((s) => URI.revive(s.uri).toString() !== key);
    if (filtered.length !== sessions.length) {
      this._writeStoredSessions(filtered);
    }
  }
  _writeStoredSessions(sessions) {
    this.storageService.store(
      STORAGE_KEY_SESSIONS,
      JSON.stringify(sessions),
      StorageScope.PROFILE,
      StorageTarget.MACHINE
    );
  }
  // -- Workspace --
  resolveWorkspace(uri) {
    if (uri.scheme !== Schemas.file) {
      return void 0;
    }
    const folder = {
      root: uri,
      workingDirectory: uri,
      name: basename(uri),
      description: void 0,
      gitRepository: void 0
    };
    return {
      uri,
      label: basename(uri),
      description: this.labelService.getUriLabel(dirname(uri), { relative: false }),
      group: SESSION_WORKSPACE_GROUP_LOCAL,
      icon: Codicon.folder,
      folders: [folder],
      requiresWorkspaceTrust: true,
      isVirtualWorkspace: false
    };
  }
  // -- Session Lifecycle --
  createNewSession(workspaceUri, sessionTypeId) {
    if (sessionTypeId !== LocalSessionType.id) {
      throw new Error(`Unsupported session type '${sessionTypeId}' for local provider`);
    }
    const workspace = this.resolveWorkspace(workspaceUri);
    if (!workspace) {
      throw new Error(`Cannot resolve workspace for URI: ${workspaceUri.toString()}`);
    }
    const session = this.instantiationService.createInstance(LocalSession, void 0, workspace, this.id);
    session.setPermissionLevel(this._defaultPermissionLevel());
    this._newSessions.set(session.sessionId, session);
    return this._toISession(session);
  }
  createQuickChat(_sessionTypeId) {
    throw new Error("LocalChatSessionsProvider does not support quick chats");
  }
  deleteNewSession(sessionId) {
    if (this._newSessions.has(sessionId)) {
      this._newSessions.deleteAndDispose(sessionId);
    }
  }
  get onDidChangeModels() {
    return Event.signal(this.languageModelsService.onDidChangeLanguageModels);
  }
  getModelsSnapshot(_sessionId, desiredModelId) {
    const allModels = getRegisteredLanguageModels(this.languageModelsService);
    const models = allModels.filter((model) => !model.metadata.targetChatSessionType && model.metadata.isUserSelectable);
    return {
      models,
      desiredModelResolution: resolveModelIdentifierFromLanguageModels(models, desiredModelId, this.languageModelsService, allModels),
      modelTarget: void 0
    };
  }
  getModelPickerOptions(_sessionId) {
    return {
      useGroupedModelPicker: true,
      showFeatured: true,
      showUnavailableFeatured: false,
      showManageModelsAction: true
    };
  }
  setModel(sessionId, modelId) {
    const newSession = this._newSessions.get(sessionId);
    if (newSession) {
      newSession.setModelId(modelId);
    }
  }
  // -- Session Actions --
  async archiveSession(sessionId) {
    const session = this._findSession(sessionId);
    if (session) {
      session.setArchived(true);
      this._updateStoredSession(session);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(session)] });
    }
  }
  async unarchiveSession(sessionId) {
    const session = this._findSession(sessionId);
    if (session) {
      session.setArchived(false);
      this._updateStoredSession(session);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(session)] });
    }
  }
  async setSessionReadState(sessionId, isRead) {
    const session = this._findSession(sessionId);
    if (!session) {
      return;
    }
    const primary = this._resolvePrimary(session);
    let changed = false;
    for (const chat of this._getGroupChats(primary)) {
      if (chat.isRead.get() !== isRead) {
        chat.setRead(isRead);
        this._updateStoredSession(chat);
        changed = true;
      }
    }
    if (changed) {
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(primary)] });
    }
  }
  async deleteSession(sessionId) {
    const session = this._findSession(sessionId);
    if (!session) {
      return;
    }
    const primary = this._resolvePrimary(session);
    const group = this._getGroupChats(primary);
    const groupISession = this._toISession(primary);
    for (const chat of group) {
      await this.chatService.removeHistoryEntry(chat.resource);
      this._sessionCache.delete(chat.resource.toString());
      this._removeStoredSession(chat.resource);
      chat.dispose();
    }
    this._sessionGroupCache.delete(primary.sessionId);
    if (this._newSessions.has(sessionId)) {
      this._newSessions.deleteAndDispose(sessionId);
    }
    this._onDidChangeSessions.fire({ added: [], removed: [groupISession], changed: [] });
  }
  async deleteSessions(sessionIds) {
    for (const sessionId of sessionIds) {
      await this.deleteSession(sessionId);
    }
  }
  async deleteChat(sessionId, chatUri, options) {
    const primary = this._findSession(sessionId);
    if (!primary || primary.parentResource) {
      return false;
    }
    const group = this._getGroupChats(primary);
    const target = group.find((chat) => isEqual(chat.resource, chatUri));
    if (!target) {
      return false;
    }
    if (group.length <= 1 || isEqual(target.resource, primary.resource)) {
      await this.deleteSession(sessionId);
      return true;
    }
    if (!options?.skipConfirmation) {
      const confirmed = await this.dialogService.confirm({
        message: localize("deleteChat.confirm", "Are you sure you want to delete this chat?"),
        detail: localize("deleteChat.detail", "This action cannot be undone."),
        primaryButton: localize("deleteChat.delete", "Delete")
      });
      if (!confirmed.confirmed) {
        return false;
      }
    }
    await this.chatService.removeHistoryEntry(target.resource);
    this._sessionCache.delete(target.resource.toString());
    this._removeStoredSession(target.resource);
    target.dispose();
    this._onDidChangeGroupMembership.fire({ groupKey: primary.sessionId });
    this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(primary)] });
    return true;
  }
  async forkChat(sessionId, _sourceChat, _turnId) {
    throw new Error(`Session '${sessionId}' does not support forking into a chat`);
  }
  async createSideChat(sessionId, _sourceChat, _turnId, _selection) {
    throw new Error(`Session '${sessionId}' does not support side chats`);
  }
  async renameChat(_sessionId, chatUri, title) {
    this.chatService.setSessionTitle(chatUri, title);
    const session = this._findSessionByResource(chatUri);
    if (session) {
      session.setTitle(title);
      this._updateStoredSession(session);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(session)] });
    }
  }
  async renameSession(sessionId, title) {
    const session = this._findSession(sessionId);
    if (session) {
      await this.renameChat(sessionId, session.resource, title);
    }
  }
  async createNewChat(sessionId, _prompt) {
    const currentNewSession = this._newSessions.get(sessionId);
    if (currentNewSession) {
      const session = currentNewSession;
      const chat = buildChat(session);
      session.mainChat.set(chat, void 0);
      return chat;
    }
    const primary = this._findSession(sessionId);
    if (primary && !primary.parentResource) {
      return this._createNewSubsequentChat(primary);
    }
    throw new Error(`Session '${sessionId}' not found or is not the current new session`);
  }
  /**
   * Creates a subsequent chat within an existing multi-chat session. The new
   * chat is linked to the primary chat via {@link LocalSession.parentResource}
   * and added to the cache so it appears in the session's `chats` group. It is
   * not persisted until its first {@link sendRequest} succeeds.
   */
  _createNewSubsequentChat(primary) {
    const workspace = primary.workspace.get();
    if (!workspace) {
      throw new Error("Cannot create a new chat \u2014 primary session has no workspace");
    }
    const child = this.instantiationService.createInstance(LocalSession, void 0, workspace, this.id);
    child.setParentResource(primary.resource);
    child.setPermissionLevel(this._defaultPermissionLevel());
    child.setModelId(primary.modelId.get());
    child.setTitle(localize("newChat", "New Chat"));
    this._sessionCache.set(child.resource.toString(), child);
    this._onDidChangeGroupMembership.fire({ groupKey: primary.sessionId });
    this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(primary)] });
    return buildChat(child);
  }
  // -- Send Request --
  async sendRequest(sessionId, chatResource, options) {
    const newSession = this._newSessions.get(sessionId);
    if (newSession) {
      if (chatResource.toString() !== newSession.resource.toString()) {
        throw new Error(`Chat resource ${chatResource.toString()} does not match session resource ${newSession.resource.toString()}`);
      }
      return this._sendFirstChat(newSession, chatResource, options);
    }
    const primary = this._findSession(sessionId);
    const child = this._sessionCache.get(chatResource.toString());
    if (primary && !primary.parentResource && child && child.parentResource && isEqual(child.parentResource, primary.resource)) {
      return this._sendChildChat(primary, child, chatResource, options);
    }
    throw new Error(`Session '${sessionId}' not found`);
  }
  async _sendFirstChat(newSession, chatResource, options) {
    newSession.setTitle(options.query.split("\n")[0].substring(0, 100) || localize("newSession", "New Session"));
    newSession.setStatus(SessionStatus.InProgress);
    const newISession = this._toISession(newSession);
    this._onDidChangeSessions.fire({ added: [newISession], removed: [], changed: [] });
    this.logService.debug(`[LocalChatSessionsProvider] Sending request for session ${newSession.sessionId}`);
    const result = await this._dispatchSend(newSession, chatResource, options);
    if (result.kind === "rejected") {
      this._newSessions.deleteAndLeak(newSession.sessionId);
      this._sessionGroupCache.delete(newSession.sessionId);
      this._onDidChangeSessions.fire({ added: [], removed: [newISession], changed: [] });
      newSession.dispose();
      throw new Error(`[LocalChatSessionsProvider] sendRequest rejected: ${result.reason}`);
    }
    this._sessionCache.set(newSession.resource.toString(), newSession);
    this._addStoredSession(newSession);
    this._newSessions.deleteAndLeak(newSession.sessionId);
    if (result.kind === "sent") {
      this._syncSessionFromModel(newSession);
      result.data.responseCompletePromise.then(() => {
        newSession.setStatus(SessionStatus.Completed);
      }, (error) => {
        this.logService.error(`[LocalChatSessionsProvider] Response failed for session ${newSession.sessionId}:`, error);
        newSession.setStatus(SessionStatus.Completed);
        this._updateStoredSession(newSession);
        this._onDidChangeSessions.fire({ added: [], removed: [], changed: [newISession] });
      });
    }
    this._onDidChangeSessions.fire({ added: [], removed: [], changed: [newISession] });
    return newISession;
  }
  async _sendChildChat(primary, child, chatResource, options) {
    child.setTitle(options.query.split("\n")[0].substring(0, 100) || localize("newChat", "New Chat"));
    child.setStatus(SessionStatus.InProgress);
    const groupISession = this._toISession(primary);
    this._onDidChangeSessions.fire({ added: [], removed: [], changed: [groupISession] });
    this.logService.debug(`[LocalChatSessionsProvider] Sending request for chat ${child.sessionId} in session ${primary.sessionId}`);
    const result = await this._dispatchSend(child, chatResource, options);
    if (result.kind === "rejected") {
      this._sessionCache.delete(child.resource.toString());
      this._onDidChangeGroupMembership.fire({ groupKey: primary.sessionId });
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [groupISession] });
      child.dispose();
      throw new Error(`[LocalChatSessionsProvider] sendRequest rejected: ${result.reason}`);
    }
    this._addStoredSession(child);
    if (result.kind === "sent") {
      result.data.responseCompletePromise.then(() => {
        child.setStatus(SessionStatus.Completed);
        this._syncSessionFromModel(child);
      }, (error) => {
        this.logService.error(`[LocalChatSessionsProvider] Response failed for chat ${child.sessionId}:`, error);
        child.setStatus(SessionStatus.Completed);
        this._updateStoredSession(child);
        this._onDidChangeSessions.fire({ added: [], removed: [], changed: [groupISession] });
      });
    }
    this._onDidChangeSessions.fire({ added: [], removed: [], changed: [groupISession] });
    return groupISession;
  }
  /**
   * Applies pre-send configuration to the chat model and dispatches the
   * request to {@link IChatService}. Returns the raw send result; commit and
   * rollback bookkeeping is left to the caller.
   */
  async _dispatchSend(session, chatResource, options) {
    const { query, attachedContext } = options;
    const modeKind = session.chatMode?.kind ?? ChatModeKind.Agent;
    const modeIsBuiltin = session.chatMode ? isBuiltinChatMode(session.chatMode) : true;
    const rawModeInstructions = session.chatMode?.modeInstructions?.get();
    const modeInstructions = rawModeInstructions ? {
      name: session.chatMode.name.get(),
      content: rawModeInstructions.content,
      toolReferences: this.toolsService.toToolReferences(rawModeInstructions.toolReferences),
      metadata: rawModeInstructions.metadata
    } : void 0;
    const permissionLevel = session.permissionLevel.get();
    const sendOptions = {
      location: ChatAgentLocation.Chat,
      userSelectedModelId: session.selectedModelId,
      modeInfo: {
        kind: modeKind,
        isBuiltin: modeIsBuiltin,
        modeInstructions,
        telemetryModeId: modeIsBuiltin ? modeKind : "custom",
        applyCodeBlockSuggestionId: void 0,
        permissionLevel
      },
      attachedContext
    };
    const modelRef = await this._updateChatSessionState(chatResource, session);
    try {
      return await this.chatService.sendRequest(chatResource, query, sendOptions);
    } finally {
      modelRef?.dispose();
    }
  }
  // -- Private helpers --
  dispose() {
    for (const session of this._sessionCache.values()) {
      session.dispose();
    }
    this._sessionCache.clear();
    this._sessionGroupCache.clear();
    super.dispose();
  }
  /**
   * Resolves the initial permission level for a brand-new session from
   * `chat.permissions.default`, clamped to `Default` when enterprise policy
   * disables global auto-approval.
   */
  _defaultPermissionLevel() {
    const policyRestricted = this.configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue === false;
    if (policyRestricted) {
      return ChatPermissionLevel.Default;
    }
    const level = this.configurationService.getValue(ChatConfiguration.DefaultPermissionLevel);
    return isChatPermissionLevel(level) ? level : ChatPermissionLevel.Default;
  }
  /**
   * Updates the chat model state (model, mode, permission level) before sending.
   */
  async _updateChatSessionState(resource, session) {
    const modelRef = await this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
    if (!modelRef) {
      return void 0;
    }
    const model = modelRef.object;
    if (session.selectedModelId) {
      const languageModel = this.languageModelsService.lookupLanguageModel(session.selectedModelId);
      if (languageModel) {
        model.inputModel.setState({ selectedModel: { identifier: session.selectedModelId, metadata: languageModel } });
      }
    }
    if (session.chatMode) {
      model.inputModel.setState({ mode: { id: session.chatMode.id, kind: session.chatMode.kind } });
    }
    const permissionLevel = session.permissionLevel.get();
    if (permissionLevel) {
      model.inputModel.setState({ permissionLevel });
    }
    return modelRef;
  }
  _findSession(sessionId) {
    const newSession = this._newSessions.get(sessionId);
    if (newSession) {
      return newSession;
    }
    for (const session of this._sessionCache.values()) {
      if (session.sessionId === sessionId) {
        return session;
      }
    }
    return void 0;
  }
  _findSessionByResource(resource) {
    const cached = this._sessionCache.get(resource.toString());
    if (cached) {
      return cached;
    }
    for (const session of this._newSessions.values()) {
      if (session.resource.toString() === resource.toString()) {
        return session;
      }
    }
    return void 0;
  }
  /** Resolves the primary (parent) chat of a session's group. */
  _resolvePrimary(session) {
    if (session.parentResource) {
      return this._sessionCache.get(session.parentResource.toString()) ?? session;
    }
    return session;
  }
  /** Returns the primary chat followed by its children, ordered by creation time. */
  _getGroupChats(primary) {
    const children = [];
    for (const session of this._sessionCache.values()) {
      if (session.parentResource && isEqual(session.parentResource, primary.resource)) {
        children.push(session);
      }
    }
    children.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return [primary, ...children];
  }
  _toISession(session) {
    const primary = this._resolvePrimary(session);
    const cached = this._sessionGroupCache.get(primary.sessionId);
    if (cached) {
      return cached;
    }
    const groupISession = this._buildGroupISession(primary);
    this._sessionGroupCache.set(primary.sessionId, groupISession);
    return groupISession;
  }
  /**
   * Wraps a primary {@link LocalSession} and its child chats into an
   * aggregated {@link ISession}. The `chats` observable re-derives whenever
   * group membership changes; per-chat state flows through each chat's own
   * observables captured by {@link buildChat}.
   */
  _buildGroupISession(primary) {
    const groupKey = primary.sessionId;
    const chatsObs = observableFromEvent(
      this,
      Event.filter(this._onDidChangeGroupMembership.event, (e) => e.groupKey === groupKey),
      () => this._getGroupChats(primary).map(buildChat)
    );
    const changesets = createChangesets(primary.sessionType, primary.workspace, chatsObs, this.instantiationService);
    return {
      sessionId: primary.sessionId,
      resource: primary.resource,
      providerId: primary.providerId,
      sessionType: primary.sessionType,
      icon: primary.icon,
      createdAt: primary.createdAt,
      workspace: primary.workspace,
      title: primary.title,
      updatedAt: chatsObs.map((chats, reader) => this._latestDate(chats, (c) => c.updatedAt.read(reader)) ?? primary.updatedAt.read(reader)),
      status: chatsObs.map((chats, reader) => this._aggregateStatus(chats, reader)),
      changesets,
      changes: primary.changes,
      modelId: primary.modelId,
      mode: primary.mode,
      loading: primary.loading,
      isArchived: primary.isArchived,
      isRead: chatsObs.map((chats, reader) => chats.every((c) => c.isRead.read(reader))),
      description: primary.description,
      lastTurnEnd: chatsObs.map((chats, reader) => this._latestDate(chats, (c) => c.lastTurnEnd.read(reader))),
      chats: chatsObs,
      mainChat: primary.mainChat,
      capabilities: constObservable({
        supportsMultipleChats: true,
        supportsRename: true,
        supportsDelete: true
      })
    };
  }
  _latestDate(chats, getter) {
    let latest;
    for (const chat of chats) {
      const date = getter(chat);
      if (date && (!latest || date > latest)) {
        latest = date;
      }
    }
    return latest;
  }
  _aggregateStatus(chats, reader) {
    for (const chat of chats) {
      if (chat.status.read(reader) === SessionStatus.NeedsInput) {
        return SessionStatus.NeedsInput;
      }
    }
    for (const chat of chats) {
      if (chat.status.read(reader) === SessionStatus.InProgress) {
        return SessionStatus.InProgress;
      }
    }
    return chats[0].status.read(reader);
  }
};
LocalChatSessionsProvider = __decorateClass([
  __decorateParam(0, IChatService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILanguageModelsService),
  __decorateParam(3, ILanguageModelToolsService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IDialogService)
], LocalChatSessionsProvider);
export {
  LOCAL_PROVIDER_ID,
  LOCAL_SESSION_ENABLED_SETTING,
  LocalChatSessionsProvider,
  LocalSessionType
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2xvY2FsQ2hhdFNlc3Npb25zL2Jyb3dzZXIvbG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGNvbnN0T2JzZXJ2YWJsZSwgSU9ic2VydmFibGUsIElSZWFkZXIsIElTZXR0YWJsZU9ic2VydmFibGUsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UsIElDaGF0U2VuZFJlcXVlc3RPcHRpb25zLCBJQ2hhdERldGFpbCwgY29udmVydExlZ2FjeUNoYXRTZXNzaW9uVGltaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uRmlsZUNoYW5nZTIsIElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbSwgU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uLCBJQ2hhdCwgSVNlc3Npb25HaXRSZXBvc2l0b3J5LCBJU2Vzc2lvbkZvbGRlciwgSVNlc3Npb25Xb3Jrc3BhY2UsIElTaWRlQ2hhdFNlbGVjdGlvbiwgU2Vzc2lvblN0YXR1cywgSVNlc3Npb25UeXBlLCBJU2Vzc2lvbkZpbGVDaGFuZ2UsIHRvU2Vzc2lvbklkLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9MT0NBTCwgSUNoYXRDaGVja3BvaW50cywgQ2hhdEludGVyYWN0aXZpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCwgQ2hhdFBlcm1pc3Npb25MZXZlbCwgaXNDaGF0UGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElEZWxldGVDaGF0T3B0aW9ucywgSVNlbmRSZXF1ZXN0T3B0aW9ucywgSVNlc3Npb25DaGFuZ2VFdmVudCwgSVNlc3Npb25Nb2RlbFBpY2tlck9wdGlvbnMsIElTZXNzaW9uTW9kZWxzU25hcHNob3QsIElTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgaXNCdWlsdGluQ2hhdE1vZGUsIElDaGF0TW9kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IElHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvZ2l0L2NvbW1vbi9naXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBnZXRSZWdpc3RlcmVkTGFuZ3VhZ2VNb2RlbHMsIHJlc29sdmVNb2RlbElkZW50aWZpZXJGcm9tTGFuZ3VhZ2VNb2RlbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbFNlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ2hhbmdlc2V0cyB9IGZyb20gJy4uLy4uL2NvcGlsb3RDaGF0U2Vzc2lvbnMvYnJvd3Nlci9jb3BpbG90Q2hhdFNlc3Npb25zQ2hhbmdlc2V0cy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5cbi8qKiBMb2NhbCBzZXNzaW9uIHR5cGUgXHUyMDE0IGluLXByb2Nlc3MgVlMgQ29kZSBjaGF0LCBubyBiYWNrZ3JvdW5kIGFnZW50IG9yIHdvcmt0cmVlLiAqL1xuZXhwb3J0IGNvbnN0IExvY2FsU2Vzc2lvblR5cGU6IElTZXNzaW9uVHlwZSA9IHtcblx0aWQ6ICdsb2NhbCcsXG5cdGxhYmVsOiBsb2NhbGl6ZSgnbG9jYWxTZXNzaW9uJywgXCJMb2NhbFwiKSxcblx0aWNvbjogQ29kaWNvbi52bSxcbn07XG5cbi8qKiBTZXR0aW5nIGtleSBjb250cm9sbGluZyB3aGV0aGVyIExvY2FsIFZTIENvZGUgY2hhdCBzZXNzaW9ucyBhcmUgYXZhaWxhYmxlIGluIHRoZSBBZ2VudHMgYXBwLiAqL1xuZXhwb3J0IGNvbnN0IExPQ0FMX1NFU1NJT05fRU5BQkxFRF9TRVRUSU5HID0gJ3Nlc3Npb25zLmNoYXQubG9jYWxBZ2VudC5lbmFibGVkJztcblxuZXhwb3J0IGNvbnN0IExPQ0FMX1BST1ZJREVSX0lEID0gJ2xvY2FsLWNoYXQnO1xuY29uc3QgU1RPUkFHRV9LRVlfU0VTU0lPTlMgPSAnc2Vzc2lvbnMubG9jYWxDaGF0LnNlc3Npb25zJztcbmNvbnN0IFNUT1JBR0VfS0VZX01JR1JBVEVEID0gJ3Nlc3Npb25zLmxvY2FsQ2hhdC5taWdyYXRlZCc7XG5cbmludGVyZmFjZSBJU3RvcmVkTG9jYWxTZXNzaW9uIHtcblx0cmVhZG9ubHkgdXJpOiBVcmlDb21wb25lbnRzO1xuXHRyZWFkb25seSB0aXRsZTogc3RyaW5nO1xuXHRyZWFkb25seSBjcmVhdGVkQXQ6IG51bWJlcjtcblx0cmVhZG9ubHkgbGFzdE1lc3NhZ2VEYXRlOiBudW1iZXI7XG5cdHJlYWRvbmx5IHdvcmtpbmdEaXJlY3Rvcnk6IFVyaUNvbXBvbmVudHM7XG5cdHJlYWRvbmx5IGFyY2hpdmVkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNSZWFkPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFJlc291cmNlIG9mIHRoZSBwcmltYXJ5IChwYXJlbnQpIGNoYXQgd2hlbiB0aGlzIGVudHJ5IGlzIGEgc3Vic2VxdWVudFxuXHQgKiBjaGF0IGluIGEgbXVsdGktY2hhdCBzZXNzaW9uLiBgdW5kZWZpbmVkYC9hYnNlbnQgZm9yIHByaW1hcnkgY2hhdHMuXG5cdCAqIFRoaXMgaXMgaG93IHRoZSBjaGF0IGhpZXJhcmNoeSBpcyBwZXJzaXN0ZWQgaW4gdGhlIHByb3ZpZGVyIG1ldGFkYXRhLlxuXHQgKi9cblx0cmVhZG9ubHkgcGFyZW50VXJpPzogVXJpQ29tcG9uZW50cztcbn1cblxuLyoqXG4gKiBCdWlsZHMgYW4ge0BsaW5rIElDaGF0fSBzbmFwc2hvdCBmcm9tIGEge0BsaW5rIExvY2FsU2Vzc2lvbn0uXG4gKi9cbmZ1bmN0aW9uIGJ1aWxkQ2hhdChzZXNzaW9uOiBMb2NhbFNlc3Npb24pOiBJQ2hhdCB7XG5cdHJldHVybiB7XG5cdFx0cmVzb3VyY2U6IHNlc3Npb24ucmVzb3VyY2UsXG5cdFx0Y3JlYXRlZEF0OiBzZXNzaW9uLmNyZWF0ZWRBdCxcblx0XHR0aXRsZTogc2Vzc2lvbi50aXRsZSxcblx0XHR1cGRhdGVkQXQ6IHNlc3Npb24udXBkYXRlZEF0LFxuXHRcdHN0YXR1czogc2Vzc2lvbi5zdGF0dXMsXG5cdFx0Y2hhbmdlczogc2Vzc2lvbi5jaGFuZ2VzLFxuXHRcdGNoZWNrcG9pbnRzOiBzZXNzaW9uLmNoZWNrcG9pbnRzLFxuXHRcdG1vZGVsSWQ6IHNlc3Npb24ubW9kZWxJZCxcblx0XHRtb2RlOiBzZXNzaW9uLm1vZGUsXG5cdFx0aXNBcmNoaXZlZDogc2Vzc2lvbi5pc0FyY2hpdmVkLFxuXHRcdGlzUmVhZDogc2Vzc2lvbi5pc1JlYWQsXG5cdFx0aW50ZXJhY3Rpdml0eTogY29uc3RPYnNlcnZhYmxlKENoYXRJbnRlcmFjdGl2aXR5LkZ1bGwpLFxuXHRcdGRlc2NyaXB0aW9uOiBzZXNzaW9uLmRlc2NyaXB0aW9uLFxuXHRcdGxhc3RUdXJuRW5kOiBzZXNzaW9uLmxhc3RUdXJuRW5kLFxuXHR9O1xufVxuXG4vKipcbiAqIEEgbG9jYWwgY2hhdCBzZXNzaW9uLiBNYW5hZ2VzIG9ic2VydmFibGUgc3RhdGUgYW5kIHByb3ZpZGVzIG11dGF0aW9uXG4gKiBtZXRob2RzIHVzZWQgYnkgdGhlIHByb3ZpZGVyLlxuICpcbiAqIENvbnN0cnVjdGVkIGluIHR3byB3YXlzOlxuICogLSAqKk5ldyBzZXNzaW9uKiogKGBkZXRhaWxgIGlzIGB1bmRlZmluZWRgKTogY3JlYXRlcyBhIGZyZXNoIGNoYXQgbW9kZWxcbiAqICAgdGhyb3VnaCB7QGxpbmsgSUNoYXRTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9ufSBhbmQgcmVzb2x2ZXMgZ2l0IHN0YXRlLlxuICogLSAqKkhpc3Rvcnkgc2Vzc2lvbioqIChgZGV0YWlsYCBpcyBwcm92aWRlZCk6IHJlc3RvcmVzIGZyb20gYSBwZXJzaXN0ZWRcbiAqICAge0BsaW5rIElDaGF0RGV0YWlsfSB3aXRob3V0IG93bmluZyBhIGNoYXQgbW9kZWwgcmVmZXJlbmNlLlxuICovXG5jbGFzcyBMb2NhbFNlc3Npb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uVHlwZSA9IFNlc3Npb25UeXBlLkxvY2FsO1xuXHRyZWFkb25seSBpY29uOiBUaGVtZUljb247XG5cdHJlYWRvbmx5IGNyZWF0ZWRBdDogRGF0ZTtcblxuXHQvKipcblx0ICogUmVzb3VyY2Ugb2YgdGhlIHByaW1hcnkgKHBhcmVudCkgY2hhdCB3aGVuIHRoaXMgc2Vzc2lvbiBpcyBhIHN1YnNlcXVlbnRcblx0ICogY2hhdCBpbiBhIG11bHRpLWNoYXQgZ3JvdXAuIGB1bmRlZmluZWRgIGZvciBwcmltYXJ5IGNoYXRzLlxuXHQgKi9cblx0cHJpdmF0ZSBfcGFyZW50UmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0Z2V0IHBhcmVudFJlc291cmNlKCk6IFVSSSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9wYXJlbnRSZXNvdXJjZTsgfVxuXHRzZXRQYXJlbnRSZXNvdXJjZShyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogdm9pZCB7IHRoaXMuX3BhcmVudFJlc291cmNlID0gcmVzb3VyY2U7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF90aXRsZSA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCAnJyk7XG5cdHJlYWRvbmx5IHRpdGxlOiBJT2JzZXJ2YWJsZTxzdHJpbmc+ID0gdGhpcy5fdGl0bGU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdXBkYXRlZEF0ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIG5ldyBEYXRlKCkpO1xuXHRyZWFkb25seSB1cGRhdGVkQXQ6IElPYnNlcnZhYmxlPERhdGU+ID0gdGhpcy5fdXBkYXRlZEF0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXR1cyA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKTtcblx0cmVhZG9ubHkgc3RhdHVzOiBJT2JzZXJ2YWJsZTxTZXNzaW9uU3RhdHVzPiA9IHRoaXMuX3N0YXR1cztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wZXJtaXNzaW9uTGV2ZWwgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0KTtcblx0cmVhZG9ubHkgcGVybWlzc2lvbkxldmVsOiBJT2JzZXJ2YWJsZTxDaGF0UGVybWlzc2lvbkxldmVsPiA9IHRoaXMuX3Blcm1pc3Npb25MZXZlbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VEYXRhID0gb2JzZXJ2YWJsZVZhbHVlPElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRyZWFkb25seSB3b3Jrc3BhY2U6IElPYnNlcnZhYmxlPElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkPiA9IHRoaXMuX3dvcmtzcGFjZURhdGE7XG5cblx0cmVhZG9ubHkgY2hlY2twb2ludHM6IElPYnNlcnZhYmxlPElDaGF0Q2hlY2twb2ludHMgfCB1bmRlZmluZWQ+ID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2hhbmdlcyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT4odGhpcywgW10pO1xuXHRyZWFkb25seSBjaGFuZ2VzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT4gPSB0aGlzLl9jaGFuZ2VzO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsSWRPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgbW9kZWxJZDogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPiA9IHRoaXMuX21vZGVsSWRPYnNlcnZhYmxlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlPHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IG1vZGU6IElPYnNlcnZhYmxlPHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+ID0gdGhpcy5fbW9kZU9ic2VydmFibGU7XG5cblx0cmVhZG9ubHkgbG9hZGluZzogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzQXJjaGl2ZWQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRyZWFkb25seSBpc0FyY2hpdmVkOiBJT2JzZXJ2YWJsZTxib29sZWFuPiA9IHRoaXMuX2lzQXJjaGl2ZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzUmVhZCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB0cnVlKTtcblx0cmVhZG9ubHkgaXNSZWFkOiBJT2JzZXJ2YWJsZTxib29sZWFuPiA9IHRoaXMuX2lzUmVhZDtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IElPYnNlcnZhYmxlPElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZD4gPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXN0VHVybkVuZCA9IG9ic2VydmFibGVWYWx1ZTxEYXRlIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRyZWFkb25seSBsYXN0VHVybkVuZDogSU9ic2VydmFibGU8RGF0ZSB8IHVuZGVmaW5lZD4gPSB0aGlzLl9sYXN0VHVybkVuZDtcblxuXHRyZWFkb25seSBtYWluQ2hhdDogSVNldHRhYmxlT2JzZXJ2YWJsZTxJQ2hhdD47XG5cblx0Ly8gLS0gUHJlLXNlbmQgY29uZmlndXJhdGlvbiAtLVxuXG5cdHByaXZhdGUgX21vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbW9kZTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IHNlbGVjdGVkT3B0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0+KCk7XG5cblx0Z2V0IHNlbGVjdGVkTW9kZWxJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fbW9kZWxJZDsgfVxuXHRnZXQgY2hhdE1vZGUoKTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX21vZGU7IH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIHNlc3Npb24gZnJvbSBwZXJzaXN0ZWQgY2hhdCBoaXN0b3J5LlxuXHQgKi9cblx0c3RhdGljIGZyb21IaXN0b3J5KFxuXHRcdGRldGFpbDogSUNoYXREZXRhaWwsXG5cdFx0cHJvdmlkZXJJZDogc3RyaW5nLFxuXHRcdHdvcmtzcGFjZTogSVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQsXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KTogTG9jYWxTZXNzaW9uIHtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxTZXNzaW9uLCBkZXRhaWwsIHdvcmtzcGFjZSwgcHJvdmlkZXJJZCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRkZXRhaWw6IElDaGF0RGV0YWlsIHwgdW5kZWZpbmVkLFxuXHRcdHdvcmtzcGFjZTogSVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQsXG5cdFx0cHJvdmlkZXJJZDogc3RyaW5nLFxuXHRcdEBJR2l0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGdpdFNlcnZpY2U6IElHaXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5wcm92aWRlcklkID0gcHJvdmlkZXJJZDtcblx0XHR0aGlzLmljb24gPSBMb2NhbFNlc3Npb25UeXBlLmljb247XG5cblx0XHRpZiAoZGV0YWlsKSB7XG5cdFx0XHQvLyBIaXN0b3J5IHNlc3Npb24gXHUyMDE0IHJlc3RvcmUgZnJvbSBwZXJzaXN0ZWQgZGF0YVxuXHRcdFx0Y29uc3QgdGltaW5nID0gY29udmVydExlZ2FjeUNoYXRTZXNzaW9uVGltaW5nKGRldGFpbC50aW1pbmcpO1xuXHRcdFx0dGhpcy5yZXNvdXJjZSA9IGRldGFpbC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHR0aGlzLmNyZWF0ZWRBdCA9IG5ldyBEYXRlKHRpbWluZy5jcmVhdGVkKTtcblxuXHRcdFx0Y29uc3QgbGFzdFVwZGF0ZSA9IGRldGFpbC5sYXN0TWVzc2FnZURhdGUgfHwgdGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQgfHwgdGltaW5nLmxhc3RSZXF1ZXN0U3RhcnRlZCB8fCB0aW1pbmcuY3JlYXRlZDtcblx0XHRcdHRoaXMuX3RpdGxlLnNldChkZXRhaWwudGl0bGUsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl91cGRhdGVkQXQuc2V0KG5ldyBEYXRlKGxhc3RVcGRhdGUpLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fc3RhdHVzLnNldChkZXRhaWwuaXNBY3RpdmUgPyBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MgOiBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX2xhc3RUdXJuRW5kLnNldCh0aW1pbmcubGFzdFJlcXVlc3RFbmRlZCA/IG5ldyBEYXRlKHRpbWluZy5sYXN0UmVxdWVzdEVuZGVkKSA6IHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblxuXHRcdFx0aWYgKHdvcmtzcGFjZSkge1xuXHRcdFx0XHR0aGlzLl93b3Jrc3BhY2VEYXRhLnNldCh3b3Jrc3BhY2UsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIE5ldyBzZXNzaW9uIFx1MjAxNCBjcmVhdGUgYSBmcmVzaCBjaGF0IG1vZGVsXG5cdFx0XHRjb25zdCBtb2RlbFJlZiA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oXG5cdFx0XHRcdENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdHsgZGVidWdPd25lcjogJ0xvY2FsQ2hhdFNlc3Npb25zUHJvdmlkZXIjY3JlYXRlTmV3U2Vzc2lvbicgfSxcblx0XHRcdCkpO1xuXHRcdFx0aWYgKHdvcmtzcGFjZSAmJiB3b3Jrc3BhY2UuZm9sZGVycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdG1vZGVsUmVmLm9iamVjdC5zZXRXb3JraW5nRGlyZWN0b3J5KHdvcmtzcGFjZS5mb2xkZXJzWzBdPy5yb290KTtcblx0XHRcdH1cblx0XHRcdHRoaXMucmVzb3VyY2UgPSBtb2RlbFJlZi5vYmplY3Quc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0dGhpcy5jcmVhdGVkQXQgPSBuZXcgRGF0ZSgpO1xuXG5cdFx0XHRpZiAod29ya3NwYWNlKSB7XG5cdFx0XHRcdHRoaXMuX3dvcmtzcGFjZURhdGEuc2V0KHdvcmtzcGFjZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5fcmVzb2x2ZUdpdFN0YXRlKHdvcmtzcGFjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXNzaW9uSWQgPSB0b1Nlc3Npb25JZChwcm92aWRlcklkLCB0aGlzLnJlc291cmNlKTtcblx0XHR0aGlzLm1haW5DaGF0ID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0Pih0aGlzLCBidWlsZENoYXQodGhpcykpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUdpdFN0YXRlKHdvcmtzcGFjZTogSVNlc3Npb25Xb3Jrc3BhY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXBvVXJpID0gd29ya3NwYWNlLmZvbGRlcnNbMF0/LnJvb3Q7XG5cdFx0aWYgKCFyZXBvVXJpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlcG8gPSBhd2FpdCB0aGlzLmdpdFNlcnZpY2Uub3BlblJlcG9zaXRvcnkocmVwb1VyaSk7XG5cdFx0XHRpZiAoIXJlcG8pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmb2xkZXIgPSB3b3Jrc3BhY2UuZm9sZGVyc1swXTtcblx0XHRcdGNvbnN0IGJhc2VHaXRSZXBvOiBJU2Vzc2lvbkdpdFJlcG9zaXRvcnkgPSBmb2xkZXIuZ2l0UmVwb3NpdG9yeSA/PyB7XG5cdFx0XHRcdHVyaTogZm9sZGVyLnJvb3QsXG5cdFx0XHRcdHdvcmtUcmVlVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRcdGJhc2VCcmFuY2hOYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdGdpdEh1YkluZm86IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gTW9ub3RvbmljYWxseSBpbmNyZWFzaW5nIHZlcnNpb24gdXNlZCB0byBkaXNjYXJkIHN0YWxlIGRpZmYgcmVzdWx0cy5cblx0XHRcdGxldCBkaWZmVmVyc2lvbiA9IDA7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4oKHJlYWRlcikgPT4ge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHJlcG8uc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBoZWFkID0gc3RhdGUuSEVBRDtcblx0XHRcdFx0Y29uc3QgYnJhbmNoTmFtZSA9IGhlYWQ/LmNvbW1pdCA/IGhlYWQubmFtZSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgdXBzdHJlYW1CcmFuY2hOYW1lID0gaGVhZD8udXBzdHJlYW1cblx0XHRcdFx0XHQ/IGAke2hlYWQudXBzdHJlYW0ucmVtb3RlfS8ke2hlYWQudXBzdHJlYW0ubmFtZX1gXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHVuY29tbWl0dGVkQ2hhbmdlcyA9IHN0YXRlLndvcmtpbmdUcmVlQ2hhbmdlcy5sZW5ndGggKyBzdGF0ZS51bnRyYWNrZWRDaGFuZ2VzLmxlbmd0aCArIHN0YXRlLmluZGV4Q2hhbmdlcy5sZW5ndGg7XG5cblx0XHRcdFx0dGhpcy5fd29ya3NwYWNlRGF0YS5zZXQoe1xuXHRcdFx0XHRcdC4uLndvcmtzcGFjZSxcblx0XHRcdFx0XHRmb2xkZXJzOiBbe1xuXHRcdFx0XHRcdFx0Li4uZm9sZGVyLFxuXHRcdFx0XHRcdFx0Z2l0UmVwb3NpdG9yeToge1xuXHRcdFx0XHRcdFx0XHQuLi5iYXNlR2l0UmVwbyxcblx0XHRcdFx0XHRcdFx0YnJhbmNoTmFtZSxcblx0XHRcdFx0XHRcdFx0dXBzdHJlYW1CcmFuY2hOYW1lLFxuXHRcdFx0XHRcdFx0XHR1bmNvbW1pdHRlZENoYW5nZXMsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9LCB1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGNvbnN0IGFsbFN0YXRlQ2hhbmdlcyA9IFsuLi5zdGF0ZS53b3JraW5nVHJlZUNoYW5nZXMsIC4uLnN0YXRlLnVudHJhY2tlZENoYW5nZXMsIC4uLnN0YXRlLmluZGV4Q2hhbmdlc107XG5cblx0XHRcdFx0Y29uc3QgdmVyc2lvbiA9ICsrZGlmZlZlcnNpb247XG5cdFx0XHRcdHJlcG8uZGlmZkJldHdlZW5XaXRoU3RhdHMyKCdIRUFEJykudGhlbihhc3luYyBkaWZmQ2hhbmdlcyA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgfHwgdmVyc2lvbiAhPT0gZGlmZlZlcnNpb24pIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgdHJhY2tlZFVyaXMgPSBuZXcgU2V0KGRpZmZDaGFuZ2VzLm1hcChlbCA9PiBlbC51cmkudG9TdHJpbmcoKSkpO1xuXHRcdFx0XHRcdGNvbnN0IGNoYW5nZXM6IElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyW10gPSBkaWZmQ2hhbmdlcy5tYXAoZWwgPT4gKHtcblx0XHRcdFx0XHRcdHVyaTogZWwudXJpLFxuXHRcdFx0XHRcdFx0b3JpZ2luYWxVcmk6IGVsLm9yaWdpbmFsVXJpLFxuXHRcdFx0XHRcdFx0bW9kaWZpZWRVcmk6IGVsLm1vZGlmaWVkVXJpID8/IGVsLnVyaSxcblx0XHRcdFx0XHRcdGluc2VydGlvbnM6IGVsLmluc2VydGlvbnMsXG5cdFx0XHRcdFx0XHRkZWxldGlvbnM6IGVsLmRlbGV0aW9ucyxcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0Y29uc3QgdW50cmFja2VkRmlsZXMgPSBhbGxTdGF0ZUNoYW5nZXMuZmlsdGVyKGVsID0+ICF0cmFja2VkVXJpcy5oYXMoZWwudXJpLnRvU3RyaW5nKCkpKTtcblx0XHRcdFx0XHRjb25zdCBsaW5lQ291bnRQcm9taXNlcyA9IHVudHJhY2tlZEZpbGVzLm1hcChhc3luYyBlbCA9PiB7XG5cdFx0XHRcdFx0XHRsZXQgaW5zZXJ0aW9ucyA9IDA7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5zdGF0KGVsLnVyaSk7XG5cdFx0XHRcdFx0XHRcdGlmICghc3RhdC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKGVsLnVyaSk7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgdGV4dCA9IGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdFx0XHRcdFx0XHRpbnNlcnRpb25zID0gdGV4dC5sZW5ndGggPiAwID8gdGV4dC5zcGxpdCgnXFxuJykubGVuZ3RoIDogMDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHRcdC8vIEZpbGUgbWF5IGhhdmUgYmVlbiBkZWxldGVkIGJldHdlZW4gc3RhdGUgc25hcHNob3QgYW5kIHJlYWRcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdHVyaTogZWwudXJpLFxuXHRcdFx0XHRcdFx0XHRvcmlnaW5hbFVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRtb2RpZmllZFVyaTogZWwubW9kaWZpZWRVcmkgPz8gZWwudXJpLFxuXHRcdFx0XHRcdFx0XHRpbnNlcnRpb25zLFxuXHRcdFx0XHRcdFx0XHRkZWxldGlvbnM6IDAsXG5cdFx0XHRcdFx0XHR9IHNhdGlzZmllcyBJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMjtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRjb25zdCB1bnRyYWNrZWRDaGFuZ2VzID0gYXdhaXQgUHJvbWlzZS5hbGwobGluZUNvdW50UHJvbWlzZXMpO1xuXHRcdFx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkIHx8IHZlcnNpb24gIT09IGRpZmZWZXJzaW9uKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNoYW5nZXMucHVzaCguLi51bnRyYWNrZWRDaGFuZ2VzKTtcblx0XHRcdFx0XHR0aGlzLl9jaGFuZ2VzLnNldChjaGFuZ2VzLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9LCAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgfHwgdmVyc2lvbiAhPT0gZGlmZlZlcnNpb24pIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fY2hhbmdlcy5zZXQoYWxsU3RhdGVDaGFuZ2VzLm1hcDxJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMj4oZWwgPT4gKHtcblx0XHRcdFx0XHRcdHVyaTogZWwudXJpLFxuXHRcdFx0XHRcdFx0b3JpZ2luYWxVcmk6IGVsLm9yaWdpbmFsVXJpLFxuXHRcdFx0XHRcdFx0bW9kaWZpZWRVcmk6IGVsLm1vZGlmaWVkVXJpID8/IGVsLnVyaSxcblx0XHRcdFx0XHRcdGluc2VydGlvbnM6IDAsXG5cdFx0XHRcdFx0XHRkZWxldGlvbnM6IDAsXG5cdFx0XHRcdFx0fSkpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIE5vIGdpdCByZXBvc2l0b3J5IGF2YWlsYWJsZSBcdTIwMTQgd29ya3NwYWNlIHN0YXlzIGFzLWlzXG5cdFx0fVxuXHR9XG5cblx0c2V0UGVybWlzc2lvbkxldmVsKGxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVybWlzc2lvbkxldmVsLnNldChsZXZlbCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldE1vZGVsSWQobW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxJZCA9IG1vZGVsSWQ7XG5cdFx0dGhpcy5fbW9kZWxJZE9ic2VydmFibGUuc2V0KG1vZGVsSWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRUaXRsZSh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdGl0bGUuc2V0KHRpdGxlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0VXBkYXRlZEF0KGRhdGU6IERhdGUpOiB2b2lkIHtcblx0XHR0aGlzLl91cGRhdGVkQXQuc2V0KGRhdGUsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRTdGF0dXMoc3RhdHVzOiBTZXNzaW9uU3RhdHVzKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RhdHVzLnNldChzdGF0dXMsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRBcmNoaXZlZChhcmNoaXZlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2lzQXJjaGl2ZWQuc2V0KGFyY2hpdmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0UmVhZChpc1JlYWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9pc1JlYWQuc2V0KGlzUmVhZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIF93YXNSZXF1ZXN0SW5Qcm9ncmVzcyA9IGZhbHNlO1xuXG5cdC8qKlxuXHQgKiBTdWJzY3JpYmUgdG8gbGl2ZSB1cGRhdGVzIGZyb20gdGhlIGdpdmVuIGNoYXQgbW9kZWwuIFN1YnNlcXVlbnQgY2FsbHNcblx0ICogcmVwbGFjZSBhbnkgcHJpb3Igc3Vic2NyaXB0aW9uLiBEaXNwb3NlZCBhdXRvbWF0aWNhbGx5IHdpdGggdGhlIHNlc3Npb24uXG5cdCAqL1xuXHR0cmFja01vZGVsKG1vZGVsOiBJQ2hhdE1vZGVsLCBvbkNoYW5nZTogKCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsVHJhY2tlci52YWx1ZSA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGluUHJvZ3Jlc3MgPSBtb2RlbC5yZXF1ZXN0SW5Qcm9ncmVzcy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9zdGF0dXMuc2V0KGluUHJvZ3Jlc3MgPyBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MgOiBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgdW5kZWZpbmVkKTtcblx0XHRcdC8vIEEgY29tcGxldGVkIHR1cm4gKGluLXByb2dyZXNzIFx1MjE5MiBpZGxlKSBtYXJrcyB0aGUgc2Vzc2lvbiB1bnJlYWQuXG5cdFx0XHRpZiAodGhpcy5fd2FzUmVxdWVzdEluUHJvZ3Jlc3MgJiYgIWluUHJvZ3Jlc3MpIHtcblx0XHRcdFx0dGhpcy5faXNSZWFkLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3dhc1JlcXVlc3RJblByb2dyZXNzID0gaW5Qcm9ncmVzcztcblx0XHRcdG9uQ2hhbmdlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRzZXRNb2RlKG1vZGU6IElDaGF0TW9kZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGUgPSBtb2RlO1xuXHRcdGlmIChtb2RlKSB7XG5cdFx0XHR0aGlzLl9tb2RlT2JzZXJ2YWJsZS5zZXQoeyBpZDogbW9kZS5pZCwga2luZDogbW9kZS5raW5kIH0sIHVuZGVmaW5lZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX21vZGVPYnNlcnZhYmxlLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZSB0aGlzIHNlc3Npb24gZnJvbSBhIHBlcnNpc3RlZCBoaXN0b3J5IGRldGFpbC5cblx0ICovXG5cdHVwZGF0ZUZyb21IaXN0b3J5KGRldGFpbDogSUNoYXREZXRhaWwpOiB2b2lkIHtcblx0XHRjb25zdCB0aW1pbmcgPSBjb252ZXJ0TGVnYWN5Q2hhdFNlc3Npb25UaW1pbmcoZGV0YWlsLnRpbWluZyk7XG5cdFx0Y29uc3QgbGFzdFVwZGF0ZSA9IGRldGFpbC5sYXN0TWVzc2FnZURhdGUgfHwgdGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQgfHwgdGltaW5nLmxhc3RSZXF1ZXN0U3RhcnRlZCB8fCB0aW1pbmcuY3JlYXRlZDtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLl90aXRsZS5zZXQoZGV0YWlsLnRpdGxlLCB0eCk7XG5cdFx0XHR0aGlzLl91cGRhdGVkQXQuc2V0KG5ldyBEYXRlKGxhc3RVcGRhdGUpLCB0eCk7XG5cdFx0XHR0aGlzLl9zdGF0dXMuc2V0KGRldGFpbC5pc0FjdGl2ZSA/IFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyA6IFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCB0eCk7XG5cdFx0XHR0aGlzLl9sYXN0VHVybkVuZC5zZXQodGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQgPyBuZXcgRGF0ZSh0aW1pbmcubGFzdFJlcXVlc3RFbmRlZCkgOiB1bmRlZmluZWQsIHR4KTtcblx0XHR9KTtcblx0fVxufVxuXG4vKipcbiAqIFNlc3Npb25zIHByb3ZpZGVyIHRoYXQgd3JhcHMgbG9jYWwgaW4tcHJvY2VzcyBjaGF0IHNlc3Npb25zXG4gKiAodXNpbmcge0BsaW5rIElDaGF0U2VydmljZX0gZGlyZWN0bHkpIGludG8gdGhlIHtAbGluayBJU2Vzc2lvbnNQcm92aWRlcn0gaW50ZXJmYWNlLlxuICovXG5leHBvcnQgY2xhc3MgTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2Vzc2lvbnNQcm92aWRlciB7XG5cblx0cmVhZG9ubHkgaWQgPSBMT0NBTF9QUk9WSURFUl9JRDtcblx0cmVhZG9ubHkgbGFiZWwgPSBsb2NhbGl6ZSgnbG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcicsIFwiQ29waWxvdCBDaGF0XCIpO1xuXHRyZWFkb25seSBpY29uID0gQ29kaWNvbi52bTtcblx0cmVhZG9ubHkgb3JkZXIgPSAwO1xuXHRyZWFkb25seSBicm93c2VBY3Rpb25zOiByZWFkb25seSBbXSA9IFtdO1xuXHRyZWFkb25seSBzdXBwb3J0c0xvY2FsV29ya3NwYWNlcyA9IHRydWU7XG5cblx0cmVhZG9ubHkgc2Vzc2lvblR5cGVzOiByZWFkb25seSBJU2Vzc2lvblR5cGVbXSA9IFtMb2NhbFNlc3Npb25UeXBlXTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uVHlwZXM6IEV2ZW50PHZvaWQ+ID0gRXZlbnQuTm9uZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlc3Npb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNlc3Npb25DaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IEV2ZW50PElTZXNzaW9uQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5ldmVudDtcblxuXHQvKiogQ2FjaGUgb2Ygc2Vzc2lvbnMsIGtleWVkIGJ5IHJlc291cmNlIFVSSSBzdHJpbmcuIEhvbGRzIGV2ZXJ5IGNoYXQgKHByaW1hcnkgYW5kIGNoaWxkcmVuKS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIExvY2FsU2Vzc2lvbj4oKTtcblxuXHQvKiogQWdncmVnYXRlZCBtdWx0aS1jaGF0IHNlc3Npb24gd3JhcHBlcnMsIGtleWVkIGJ5IGdyb3VwIChwcmltYXJ5KSBzZXNzaW9uIGlkLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uR3JvdXBDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBJU2Vzc2lvbj4oKTtcblxuXHQvKiogRmlyZXMgd2hlbiB0aGUgc2V0IG9mIGNoYXRzIGluIGEgZ3JvdXAgY2hhbmdlcyAoY2hhdCBhZGRlZCBvciByZW1vdmVkKS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VHcm91cE1lbWJlcnNoaXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGdyb3VwS2V5OiBzdHJpbmcgfT4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbmV3U2Vzc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIExvY2FsU2Vzc2lvbj4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFRyYWNrIHJlcXVlc3RzIG9uIG91ciBzZXNzaW9ucyB0byB1cGRhdGUgbGFzdCBtZXNzYWdlIGRhdGUsXG5cdFx0Ly8gdGl0bGUsIGFuZCBwZXJzaXN0ZWQgbWV0YWRhdGEgd2hlbiB0aGUgY2hhdCB3aWRnZXQgc2VuZHNcblx0XHQvLyBzdWJzZXF1ZW50IG1lc3NhZ2VzIGRpcmVjdGx5IChub3QgdmlhIG91ciBzZW5kUmVxdWVzdCkuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0U2VydmljZS5vbkRpZFN1Ym1pdFJlcXVlc3QoZSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChlLmNoYXRTZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHR0aGlzLl9zeW5jU2Vzc2lvbkZyb21Nb2RlbChzZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBPbmUtdGltZSBtaWdyYXRpb246IGltcG9ydCBleGlzdGluZyBsb2NhbCBjaGF0IGhpc3RvcnkgaW50byBvdXIgc3RvcmFnZVxuXHRcdHRoaXMuX21pZ3JhdGVGcm9tSGlzdG9yeSgpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0Ly8gTG9hZCBwZXJzaXN0ZWQgbG9jYWwgc2Vzc2lvbnMgb24gaW5pdGlhbGl6YXRpb25cblx0XHRcdHRoaXMuX2xvYWRQZXJzaXN0ZWRTZXNzaW9ucygpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIE9uZS10aW1lIG1pZ3JhdGlvbiB0aGF0IGltcG9ydHMgZXhpc3RpbmcgbG9jYWwgY2hhdCBzZXNzaW9ucyBmcm9tXG5cdCAqIHtAbGluayBJQ2hhdFNlcnZpY2UuZ2V0TG9jYWxTZXNzaW9uSGlzdG9yeX0gaW50byBvdXIgb3duIHBlcnNpc3RlZFxuXHQgKiBzdG9yYWdlLiBPbmx5IHNlc3Npb25zIHdpdGggYSB3b3JraW5nIGRpcmVjdG9yeSBhcmUgbWlncmF0ZWQsIHNpbmNlXG5cdCAqIGEgd29ya2luZyBkaXJlY3RvcnkgaXMgbWFuZGF0b3J5IGZvciB7QGxpbmsgTG9jYWxTZXNzaW9ufS4gU2Vzc2lvbnNcblx0ICogdGhhdCBhcmUgYWxyZWFkeSBpbiBvdXIgc3RvcmFnZSBhcmUgc2tpcHBlZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX21pZ3JhdGVGcm9tSGlzdG9yeSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKFNUT1JBR0VfS0VZX01JR1JBVEVELCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgZmFsc2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGhpc3RvcnkgPSBhd2FpdCB0aGlzLmNoYXRTZXJ2aWNlLmdldExvY2FsU2Vzc2lvbkhpc3RvcnkoKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gdGhpcy5fcmVhZFN0b3JlZFNlc3Npb25zKCk7XG5cdFx0XHRjb25zdCBleGlzdGluZ0tleXMgPSBuZXcgU2V0KHNlc3Npb25zLm1hcChzID0+IFVSSS5yZXZpdmUocy51cmkpLnRvU3RyaW5nKCkpKTtcblx0XHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cblx0XHRcdGZvciAoY29uc3QgZGV0YWlsIG9mIGhpc3RvcnkpIHtcblx0XHRcdFx0aWYgKCFkZXRhaWwud29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGtleSA9IGRldGFpbC5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdFx0aWYgKGV4aXN0aW5nS2V5cy5oYXMoa2V5KSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHRpbWluZyA9IGNvbnZlcnRMZWdhY3lDaGF0U2Vzc2lvblRpbWluZyhkZXRhaWwudGltaW5nKTtcblx0XHRcdFx0Y29uc3QgbGFzdFVwZGF0ZSA9IGRldGFpbC5sYXN0TWVzc2FnZURhdGUgfHwgdGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQgfHwgdGltaW5nLmxhc3RSZXF1ZXN0U3RhcnRlZCB8fCB0aW1pbmcuY3JlYXRlZDtcblx0XHRcdFx0c2Vzc2lvbnMucHVzaCh7XG5cdFx0XHRcdFx0dXJpOiBkZXRhaWwuc2Vzc2lvblJlc291cmNlLnRvSlNPTigpLFxuXHRcdFx0XHRcdHRpdGxlOiBkZXRhaWwudGl0bGUsXG5cdFx0XHRcdFx0Y3JlYXRlZEF0OiB0aW1pbmcuY3JlYXRlZCxcblx0XHRcdFx0XHRsYXN0TWVzc2FnZURhdGU6IGxhc3RVcGRhdGUsXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogZGV0YWlsLndvcmtpbmdEaXJlY3RvcnkudG9KU09OKCksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5fd3JpdGVTdG9yZWRTZXNzaW9ucyhzZXNzaW9ucyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFNUT1JBR0VfS0VZX01JR1JBVEVELCB0cnVlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tMb2NhbENoYXRTZXNzaW9uc1Byb3ZpZGVyXSBGYWlsZWQgdG8gbWlncmF0ZSBsb2NhbCBjaGF0IGhpc3RvcnknLCBlKTtcblx0XHRcdC8vIERvIG5vdCBtYXJrIG1pZ3JhdGlvbiBjb21wbGV0ZSBvbiBmYWlsdXJlIHNvIGl0IGNhbiBiZSByZXRyaWVkIG5leHQgdGltZS5cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVhZHMgY3VycmVudCB0aXRsZS90aW1pbmcgZnJvbSB0aGUgbGl2ZSBjaGF0IG1vZGVsLCB1cGRhdGVzIHRoZVxuXHQgKiBjYWNoZWQgc2Vzc2lvbiwgcGVyc2lzdHMgY2hhbmdlcywgYW5kIHNldHMgdXAgcmVhY3RpdmUgdHJhY2tpbmdcblx0ICogc28gc3Vic2VxdWVudCBzdGF0dXMgY2hhbmdlcyBwcm9wYWdhdGUgYXV0b21hdGljYWxseS5cblx0ICovXG5cdHByaXZhdGUgX3N5bmNTZXNzaW9uRnJvbU1vZGVsKHNlc3Npb246IExvY2FsU2Vzc2lvbik6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0c2Vzc2lvbi50cmFja01vZGVsKG1vZGVsLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0aW1pbmcgPSBtb2RlbC50aW1pbmc7XG5cdFx0XHRjb25zdCBsYXN0VXBkYXRlID0gdGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQgPz8gdGltaW5nLmxhc3RSZXF1ZXN0U3RhcnRlZCA/PyB0aW1pbmcuY3JlYXRlZDtcblx0XHRcdHNlc3Npb24uc2V0VGl0bGUobW9kZWwudGl0bGUpO1xuXHRcdFx0c2Vzc2lvbi5zZXRVcGRhdGVkQXQobmV3IERhdGUobGFzdFVwZGF0ZSkpO1xuXHRcdFx0dGhpcy5fdXBkYXRlU3RvcmVkU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFt0aGlzLl90b0lTZXNzaW9uKHNlc3Npb24pXSB9KTtcblx0XHR9KTtcblx0fVxuXG5cdC8vIC0tIFNlc3Npb24gdHlwZXMgLS1cblxuXHRnZXRTZXNzaW9uVHlwZXMoX3dvcmtzcGFjZVVyaTogVVJJKTogSVNlc3Npb25UeXBlW10ge1xuXHRcdHJldHVybiBbTG9jYWxTZXNzaW9uVHlwZV07XG5cdH1cblxuXHQvLyAtLSBTZXNzaW9ucyAtLVxuXG5cdGdldFNlc3Npb25zKCk6IElTZXNzaW9uW10ge1xuXHRcdC8vIE9ubHkgcHJpbWFyeSBjaGF0cyBzdXJmYWNlIGFzIHNlc3Npb25zOyBjaGlsZHJlbiBhcmUgYWdncmVnYXRlZCBpbnRvXG5cdFx0Ly8gdGhlaXIgcHJpbWFyeSdzIGdyb3VwLlxuXHRcdGNvbnN0IHNlc3Npb25zOiBJU2Vzc2lvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3Nlc3Npb25DYWNoZS52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHNlc3Npb24ucGFyZW50UmVzb3VyY2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRzZXNzaW9ucy5wdXNoKHRoaXMuX3RvSVNlc3Npb24oc2Vzc2lvbikpO1xuXHRcdH1cblx0XHRyZXR1cm4gc2Vzc2lvbnM7XG5cdH1cblxuXHQvKipcblx0ICogTG9hZHMgc2Vzc2lvbnMgZnJvbSBvdXIgb3duIHBlcnNpc3RlZCBzdG9yYWdlLiBObyBjYWxscyB0b1xuXHQgKiB7QGxpbmsgSUNoYXRTZXJ2aWNlfSBhcmUgbmVlZGVkIFx1MjAxNCBhbGwgbWV0YWRhdGEgaXMgc3RvcmVkIGlubGluZS5cblx0ICpcblx0ICogQWxsIGNoYXRzIGFyZSBsb2FkZWQgaW50byB0aGUgY2FjaGUgZmlyc3Qgc28gdGhhdCB0aGUgY2hhdCBoaWVyYXJjaHlcblx0ICogKGNoaWxkcmVuIHJlZmVyZW5jaW5nIHRoZWlyIHByaW1hcnkgdmlhIGBwYXJlbnRVcmlgKSBjYW4gYmUgcmVzb2x2ZWQuXG5cdCAqIEEgY2hpbGQgd2hvc2UgcHJpbWFyeSBpcyBtaXNzaW5nIGZyb20gc3RvcmFnZSBpcyB0cmVhdGVkIGFzIGEgcHJpbWFyeVxuXHQgKiAoaXRzIGBwYXJlbnRSZXNvdXJjZWAgaXMgbGVmdCB1bnNldCkgc28gaXQgaXMgbmV2ZXIgbG9zdC5cblx0ICovXG5cdHByaXZhdGUgX2xvYWRQZXJzaXN0ZWRTZXNzaW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZWRTZXNzaW9ucyA9IHRoaXMuX3JlYWRTdG9yZWRTZXNzaW9ucygpO1xuXHRcdGlmIChzdG9yZWRTZXNzaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdG9yZWRLZXlzID0gbmV3IFNldChzdG9yZWRTZXNzaW9ucy5tYXAocyA9PiBVUkkucmV2aXZlKHMudXJpKS50b1N0cmluZygpKSk7XG5cdFx0Y29uc3QgbG9hZGVkOiBMb2NhbFNlc3Npb25bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBzdG9yZWQgb2Ygc3RvcmVkU2Vzc2lvbnMpIHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5yZXZpdmUoc3RvcmVkLnVyaSk7XG5cdFx0XHRjb25zdCBrZXkgPSB1cmkudG9TdHJpbmcoKTtcblx0XHRcdGlmICh0aGlzLl9zZXNzaW9uQ2FjaGUuaGFzKGtleSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkucmV2aXZlKHN0b3JlZC53b3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdGNvbnN0IGRldGFpbDogSUNoYXREZXRhaWwgPSB7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogdXJpLFxuXHRcdFx0XHR0aXRsZTogc3RvcmVkLnRpdGxlLFxuXHRcdFx0XHRsYXN0TWVzc2FnZURhdGU6IHN0b3JlZC5sYXN0TWVzc2FnZURhdGUsXG5cdFx0XHRcdHRpbWluZzogeyBjcmVhdGVkOiBzdG9yZWQuY3JlYXRlZEF0LCBsYXN0UmVxdWVzdFN0YXJ0ZWQ6IHVuZGVmaW5lZCwgbGFzdFJlcXVlc3RFbmRlZDogc3RvcmVkLmxhc3RNZXNzYWdlRGF0ZSB9LFxuXHRcdFx0XHRpc0FjdGl2ZTogZmFsc2UsXG5cdFx0XHRcdGxhc3RSZXNwb25zZVN0YXRlOiAwIC8qIFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZSAqLyxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMucmVzb2x2ZVdvcmtzcGFjZSh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBMb2NhbFNlc3Npb24uZnJvbUhpc3RvcnkoZGV0YWlsLCB0aGlzLmlkLCB3b3Jrc3BhY2UsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0aWYgKHN0b3JlZC5hcmNoaXZlZCkge1xuXHRcdFx0XHRzZXNzaW9uLnNldEFyY2hpdmVkKHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRW50cmllcyBwZXJzaXN0ZWQgYmVmb3JlIGBpc1JlYWRgIGV4aXN0ZWQgZGVmYXVsdCB0byB1bnJlYWQsIHNvIHRoZVxuXHRcdFx0Ly8gYWRkaXRpdmUgbWlncmF0aW9uIGNhbiBwcm9tb3RlIGdlbnVpbmVseS1yZWFkIGxlZ2FjeSBzZXNzaW9ucy5cblx0XHRcdHNlc3Npb24uc2V0UmVhZChzdG9yZWQuaXNSZWFkID8/IGZhbHNlKTtcblx0XHRcdC8vIE9ubHkgaG9ub3VyIHRoZSBwYXJlbnQgbGluayB3aGVuIHRoZSBwcmltYXJ5IGlzIGFsc28gcHJlc2VudCBpblxuXHRcdFx0Ly8gc3RvcmFnZTsgb3RoZXJ3aXNlIHByb21vdGUgdGhpcyBvcnBoYW4gY2hpbGQgdG8gYSBwcmltYXJ5LlxuXHRcdFx0aWYgKHN0b3JlZC5wYXJlbnRVcmkpIHtcblx0XHRcdFx0Y29uc3QgcGFyZW50VXJpID0gVVJJLnJldml2ZShzdG9yZWQucGFyZW50VXJpKTtcblx0XHRcdFx0aWYgKHN0b3JlZEtleXMuaGFzKHBhcmVudFVyaS50b1N0cmluZygpKSkge1xuXHRcdFx0XHRcdHNlc3Npb24uc2V0UGFyZW50UmVzb3VyY2UocGFyZW50VXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLnNldChrZXksIHNlc3Npb24pO1xuXHRcdFx0bG9hZGVkLnB1c2goc2Vzc2lvbik7XG5cdFx0fVxuXG5cdFx0Ly8gRmlyZSBgYWRkZWRgIG9ubHkgZm9yIHNlc3Npb25zIHRoYXQgc3VyZmFjZSBpbiBgZ2V0U2Vzc2lvbnMoKWAuXG5cdFx0Y29uc3QgYWRkZWQ6IElTZXNzaW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgbG9hZGVkKSB7XG5cdFx0XHRpZiAoc2Vzc2lvbi5wYXJlbnRSZXNvdXJjZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGFkZGVkLnB1c2godGhpcy5fdG9JU2Vzc2lvbihzZXNzaW9uKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGFkZGVkLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW10gfSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0gU3RvcmFnZSBoZWxwZXJzIC0tXG5cblx0cHJpdmF0ZSBfcmVhZFN0b3JlZFNlc3Npb25zKCk6IElTdG9yZWRMb2NhbFNlc3Npb25bXSB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoU1RPUkFHRV9LRVlfU0VTU0lPTlMsIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRpZiAoIXJhdykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkocGFyc2VkKSA/IHBhcnNlZCA6IFtdO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FkZFN0b3JlZFNlc3Npb24oc2Vzc2lvbjogTG9jYWxTZXNzaW9uKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSB0aGlzLl9yZWFkU3RvcmVkU2Vzc2lvbnMoKTtcblx0XHRjb25zdCBrZXkgPSBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0aWYgKHNlc3Npb25zLnNvbWUocyA9PiBVUkkucmV2aXZlKHMudXJpKS50b1N0cmluZygpID09PSBrZXkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKT8uZm9sZGVyc1swXT8ucm9vdDtcblx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcl0gQ2Fubm90IHBlcnNpc3Qgc2Vzc2lvbiAke2tleX0gXHUyMDE0IG5vIHdvcmtpbmcgZGlyZWN0b3J5YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNlc3Npb25zLnB1c2goe1xuXHRcdFx0dXJpOiBzZXNzaW9uLnJlc291cmNlLnRvSlNPTigpLFxuXHRcdFx0dGl0bGU6IHNlc3Npb24udGl0bGUuZ2V0KCksXG5cdFx0XHRjcmVhdGVkQXQ6IHNlc3Npb24uY3JlYXRlZEF0LmdldFRpbWUoKSxcblx0XHRcdGxhc3RNZXNzYWdlRGF0ZTogc2Vzc2lvbi51cGRhdGVkQXQuZ2V0KCkuZ2V0VGltZSgpLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogd29ya2luZ0RpcmVjdG9yeS50b0pTT04oKSxcblx0XHRcdHBhcmVudFVyaTogc2Vzc2lvbi5wYXJlbnRSZXNvdXJjZT8udG9KU09OKCksXG5cdFx0fSk7XG5cdFx0dGhpcy5fd3JpdGVTdG9yZWRTZXNzaW9ucyhzZXNzaW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTdG9yZWRTZXNzaW9uKHNlc3Npb246IExvY2FsU2Vzc2lvbik6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25zID0gdGhpcy5fcmVhZFN0b3JlZFNlc3Npb25zKCk7XG5cdFx0Y29uc3Qga2V5ID0gc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGlkeCA9IHNlc3Npb25zLmZpbmRJbmRleChzID0+IFVSSS5yZXZpdmUocy51cmkpLnRvU3RyaW5nKCkgPT09IGtleSk7XG5cdFx0aWYgKGlkeCA+PSAwKSB7XG5cdFx0XHRzZXNzaW9uc1tpZHhdID0ge1xuXHRcdFx0XHQuLi5zZXNzaW9uc1tpZHhdLFxuXHRcdFx0XHR0aXRsZTogc2Vzc2lvbi50aXRsZS5nZXQoKSxcblx0XHRcdFx0bGFzdE1lc3NhZ2VEYXRlOiBzZXNzaW9uLnVwZGF0ZWRBdC5nZXQoKS5nZXRUaW1lKCksXG5cdFx0XHRcdGFyY2hpdmVkOiBzZXNzaW9uLmlzQXJjaGl2ZWQuZ2V0KCksXG5cdFx0XHRcdGlzUmVhZDogc2Vzc2lvbi5pc1JlYWQuZ2V0KCksXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fd3JpdGVTdG9yZWRTZXNzaW9ucyhzZXNzaW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlU3RvcmVkU2Vzc2lvbihyZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSB0aGlzLl9yZWFkU3RvcmVkU2Vzc2lvbnMoKTtcblx0XHRjb25zdCBrZXkgPSByZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGZpbHRlcmVkID0gc2Vzc2lvbnMuZmlsdGVyKHMgPT4gVVJJLnJldml2ZShzLnVyaSkudG9TdHJpbmcoKSAhPT0ga2V5KTtcblx0XHRpZiAoZmlsdGVyZWQubGVuZ3RoICE9PSBzZXNzaW9ucy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX3dyaXRlU3RvcmVkU2Vzc2lvbnMoZmlsdGVyZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3dyaXRlU3RvcmVkU2Vzc2lvbnMoc2Vzc2lvbnM6IElTdG9yZWRMb2NhbFNlc3Npb25bXSk6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoXG5cdFx0XHRTVE9SQUdFX0tFWV9TRVNTSU9OUyxcblx0XHRcdEpTT04uc3RyaW5naWZ5KHNlc3Npb25zKSxcblx0XHRcdFN0b3JhZ2VTY29wZS5QUk9GSUxFLFxuXHRcdFx0U3RvcmFnZVRhcmdldC5NQUNISU5FLFxuXHRcdCk7XG5cdH1cblxuXHQvLyAtLSBXb3Jrc3BhY2UgLS1cblxuXHRyZXNvbHZlV29ya3NwYWNlKHVyaTogVVJJKTogSVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQge1xuXHRcdGlmICh1cmkuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGZvbGRlcjogSVNlc3Npb25Gb2xkZXIgPSB7XG5cdFx0XHRyb290OiB1cmksXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB1cmksXG5cdFx0XHRuYW1lOiBiYXNlbmFtZSh1cmkpLFxuXHRcdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdGdpdFJlcG9zaXRvcnk6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdHJldHVybiB7XG5cdFx0XHR1cmksXG5cdFx0XHRsYWJlbDogYmFzZW5hbWUodXJpKSxcblx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChkaXJuYW1lKHVyaSksIHsgcmVsYXRpdmU6IGZhbHNlIH0pLFxuXHRcdFx0Z3JvdXA6IFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5mb2xkZXIsXG5cdFx0XHRmb2xkZXJzOiBbZm9sZGVyXSxcblx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IHRydWUsXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdH07XG5cdH1cblxuXHQvLyAtLSBTZXNzaW9uIExpZmVjeWNsZSAtLVxuXG5cdGNyZWF0ZU5ld1Nlc3Npb24od29ya3NwYWNlVXJpOiBVUkksIHNlc3Npb25UeXBlSWQ6IHN0cmluZyk6IElTZXNzaW9uIHtcblx0XHRpZiAoc2Vzc2lvblR5cGVJZCAhPT0gTG9jYWxTZXNzaW9uVHlwZS5pZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBzZXNzaW9uIHR5cGUgJyR7c2Vzc2lvblR5cGVJZH0nIGZvciBsb2NhbCBwcm92aWRlcmApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMucmVzb2x2ZVdvcmtzcGFjZSh3b3Jrc3BhY2VVcmkpO1xuXHRcdGlmICghd29ya3NwYWNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCByZXNvbHZlIHdvcmtzcGFjZSBmb3IgVVJJOiAke3dvcmtzcGFjZVVyaS50b1N0cmluZygpfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsU2Vzc2lvbiwgdW5kZWZpbmVkLCB3b3Jrc3BhY2UsIHRoaXMuaWQpO1xuXHRcdHNlc3Npb24uc2V0UGVybWlzc2lvbkxldmVsKHRoaXMuX2RlZmF1bHRQZXJtaXNzaW9uTGV2ZWwoKSk7XG5cdFx0dGhpcy5fbmV3U2Vzc2lvbnMuc2V0KHNlc3Npb24uc2Vzc2lvbklkLCBzZXNzaW9uKTtcblx0XHRyZXR1cm4gdGhpcy5fdG9JU2Vzc2lvbihzZXNzaW9uKTtcblx0fVxuXG5cdGNyZWF0ZVF1aWNrQ2hhdChfc2Vzc2lvblR5cGVJZDogc3RyaW5nKTogSVNlc3Npb24ge1xuXHRcdC8vIFRoaXMgcHJvdmlkZXIgaXMgd29ya3NwYWNlLWJvdW5kIGFuZCBkb2VzIG5vdCBhZHZlcnRpc2Vcblx0XHQvLyBgc3VwcG9ydHNRdWlja0NoYXRzYDsgY2FsbGVycyBtdXN0IGdhdGUgb24gdGhhdCBjYXBhYmlsaXR5LlxuXHRcdHRocm93IG5ldyBFcnJvcignTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlciBkb2VzIG5vdCBzdXBwb3J0IHF1aWNrIGNoYXRzJyk7XG5cdH1cblxuXHRkZWxldGVOZXdTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX25ld1Nlc3Npb25zLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHR0aGlzLl9uZXdTZXNzaW9ucy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25JZCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlTW9kZWxzKCk6IEV2ZW50PHZvaWQ+IHtcblx0XHRyZXR1cm4gRXZlbnQuc2lnbmFsKHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMpO1xuXHR9XG5cblx0Z2V0TW9kZWxzU25hcHNob3QoX3Nlc3Npb25JZDogc3RyaW5nLCBkZXNpcmVkTW9kZWxJZD86IHN0cmluZyk6IElTZXNzaW9uTW9kZWxzU25hcHNob3Qge1xuXHRcdC8vIExvY2FsIChpbi1wcm9jZXNzIFZTIENvZGUgY2hhdCkgc2Vzc2lvbnMgdXNlIGdlbmVyYWwtcHVycG9zZSBtb2RlbHNcblx0XHQvLyAodGhvc2Ugd2l0aG91dCBhIGB0YXJnZXRDaGF0U2Vzc2lvblR5cGVgKSB0aGF0IGFyZSB1c2VyLXNlbGVjdGFibGUgXHUyMDE0XG5cdFx0Ly8gbm8gZXh0ZW5zaW9uIHJlZ2lzdGVycyBtb2RlbHMgc3BlY2lmaWNhbGx5IHRhcmdldGluZyB0aGUgJ2xvY2FsJ1xuXHRcdC8vIHNlc3Npb24gdHlwZS5cblx0XHRjb25zdCBhbGxNb2RlbHMgPSBnZXRSZWdpc3RlcmVkTGFuZ3VhZ2VNb2RlbHModGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UpO1xuXHRcdGNvbnN0IG1vZGVscyA9IGFsbE1vZGVscy5maWx0ZXIobW9kZWwgPT4gIW1vZGVsLm1ldGFkYXRhLnRhcmdldENoYXRTZXNzaW9uVHlwZSAmJiBtb2RlbC5tZXRhZGF0YS5pc1VzZXJTZWxlY3RhYmxlKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bW9kZWxzLFxuXHRcdFx0ZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjogcmVzb2x2ZU1vZGVsSWRlbnRpZmllckZyb21MYW5ndWFnZU1vZGVscyhtb2RlbHMsIGRlc2lyZWRNb2RlbElkLCB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZSwgYWxsTW9kZWxzKSxcblx0XHRcdG1vZGVsVGFyZ2V0OiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxuXG5cdGdldE1vZGVsUGlja2VyT3B0aW9ucyhfc2Vzc2lvbklkOiBzdHJpbmcpOiBJU2Vzc2lvbk1vZGVsUGlja2VyT3B0aW9ucyB7XG5cdFx0Ly8gTG9jYWwgKGluLXByb2Nlc3MgVlMgQ29kZSBjaGF0KSBzZXNzaW9ucyBvZmZlciB0aGUgXCJNYW5hZ2UgTW9kZWxzXCJcblx0XHQvLyBhY3Rpb24gc28gdXNlcnMgY2FuIGNvbmZpZ3VyZSB0aGUgZ2VuZXJhbC1wdXJwb3NlIG1vZGVsIHNldC5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dXNlR3JvdXBlZE1vZGVsUGlja2VyOiB0cnVlLFxuXHRcdFx0c2hvd0ZlYXR1cmVkOiB0cnVlLFxuXHRcdFx0c2hvd1VuYXZhaWxhYmxlRmVhdHVyZWQ6IGZhbHNlLFxuXHRcdFx0c2hvd01hbmFnZU1vZGVsc0FjdGlvbjogdHJ1ZSxcblx0XHR9O1xuXHR9XG5cblx0c2V0TW9kZWwoc2Vzc2lvbklkOiBzdHJpbmcsIG1vZGVsSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9uZXdTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAobmV3U2Vzc2lvbikge1xuXHRcdFx0bmV3U2Vzc2lvbi5zZXRNb2RlbElkKG1vZGVsSWQpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tIFNlc3Npb24gQWN0aW9ucyAtLVxuXG5cdGFzeW5jIGFyY2hpdmVTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2ZpbmRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdHNlc3Npb24uc2V0QXJjaGl2ZWQodHJ1ZSk7XG5cdFx0XHR0aGlzLl91cGRhdGVTdG9yZWRTZXNzaW9uKHNlc3Npb24pO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW3RoaXMuX3RvSVNlc3Npb24oc2Vzc2lvbildIH0pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHVuYXJjaGl2ZVNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fZmluZFNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0c2Vzc2lvbi5zZXRBcmNoaXZlZChmYWxzZSk7XG5cdFx0XHR0aGlzLl91cGRhdGVTdG9yZWRTZXNzaW9uKHNlc3Npb24pO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW3RoaXMuX3RvSVNlc3Npb24oc2Vzc2lvbildIH0pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNldFNlc3Npb25SZWFkU3RhdGUoc2Vzc2lvbklkOiBzdHJpbmcsIGlzUmVhZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9maW5kU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBBIGdyb3VwJ3MgcmVhZCBzdGF0ZSBhZ2dyZWdhdGVzIGFjcm9zcyBldmVyeSBjaGF0LCBzbyB1cGRhdGUgdGhlbSBhbGwuXG5cdFx0Y29uc3QgcHJpbWFyeSA9IHRoaXMuX3Jlc29sdmVQcmltYXJ5KHNlc3Npb24pO1xuXHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBjaGF0IG9mIHRoaXMuX2dldEdyb3VwQ2hhdHMocHJpbWFyeSkpIHtcblx0XHRcdGlmIChjaGF0LmlzUmVhZC5nZXQoKSAhPT0gaXNSZWFkKSB7XG5cdFx0XHRcdGNoYXQuc2V0UmVhZChpc1JlYWQpO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVTdG9yZWRTZXNzaW9uKGNoYXQpO1xuXHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFt0aGlzLl90b0lTZXNzaW9uKHByaW1hcnkpXSB9KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBkZWxldGVTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2ZpbmRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVzb2x2ZSB0aGUgZ3JvdXA6IGRlbGV0aW5nIGEgc2Vzc2lvbiByZW1vdmVzIGl0cyBwcmltYXJ5IGNoYXQgYW5kXG5cdFx0Ly8gYWxsIGNoaWxkIGNoYXRzLiBJZiBhIGNoaWxkIGlkIHdhcyBwYXNzZWQsIHJlc29sdmUgdG8gaXRzIHByaW1hcnkuXG5cdFx0Y29uc3QgcHJpbWFyeSA9IHRoaXMuX3Jlc29sdmVQcmltYXJ5KHNlc3Npb24pO1xuXHRcdGNvbnN0IGdyb3VwID0gdGhpcy5fZ2V0R3JvdXBDaGF0cyhwcmltYXJ5KTtcblxuXHRcdGNvbnN0IGdyb3VwSVNlc3Npb24gPSB0aGlzLl90b0lTZXNzaW9uKHByaW1hcnkpO1xuXG5cdFx0Zm9yIChjb25zdCBjaGF0IG9mIGdyb3VwKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNoYXRTZXJ2aWNlLnJlbW92ZUhpc3RvcnlFbnRyeShjaGF0LnJlc291cmNlKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25DYWNoZS5kZWxldGUoY2hhdC5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdHRoaXMuX3JlbW92ZVN0b3JlZFNlc3Npb24oY2hhdC5yZXNvdXJjZSk7XG5cdFx0XHRjaGF0LmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9zZXNzaW9uR3JvdXBDYWNoZS5kZWxldGUocHJpbWFyeS5zZXNzaW9uSWQpO1xuXHRcdGlmICh0aGlzLl9uZXdTZXNzaW9ucy5oYXMoc2Vzc2lvbklkKSkge1xuXHRcdFx0dGhpcy5fbmV3U2Vzc2lvbnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uSWQpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtncm91cElTZXNzaW9uXSwgY2hhbmdlZDogW10gfSk7XG5cdH1cblxuXHRhc3luYyBkZWxldGVTZXNzaW9ucyhzZXNzaW9uSWRzOiByZWFkb25seSBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbklkIG9mIHNlc3Npb25JZHMpIHtcblx0XHRcdGF3YWl0IHRoaXMuZGVsZXRlU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGRlbGV0ZUNoYXQoc2Vzc2lvbklkOiBzdHJpbmcsIGNoYXRVcmk6IFVSSSwgb3B0aW9ucz86IElEZWxldGVDaGF0T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHByaW1hcnkgPSB0aGlzLl9maW5kU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGlmICghcHJpbWFyeSB8fCBwcmltYXJ5LnBhcmVudFJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLl9nZXRHcm91cENoYXRzKHByaW1hcnkpO1xuXHRcdGNvbnN0IHRhcmdldCA9IGdyb3VwLmZpbmQoY2hhdCA9PiBpc0VxdWFsKGNoYXQucmVzb3VyY2UsIGNoYXRVcmkpKTtcblxuXHRcdC8vIFVua25vd24gY2hhdCAoZS5nLiBhIHN0YWxlIG9yIGluY29ycmVjdCBVUkkpOiBkbyBub3RoaW5nIHJhdGhlciB0aGFuXG5cdFx0Ly8gcmlzayB3aXBpbmcgdGhlIHdob2xlIHNlc3Npb24uXG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBEZWxldGluZyB0aGUgb25seSBjaGF0IG9yIHRoZSBwcmltYXJ5IGNoYXQgcmVtb3ZlcyB0aGUgd2hvbGUgc2Vzc2lvblxuXHRcdC8vIChhbmQgYW55IGNoaWxkcmVuKS5cblx0XHRpZiAoZ3JvdXAubGVuZ3RoIDw9IDEgfHwgaXNFcXVhbCh0YXJnZXQucmVzb3VyY2UsIHByaW1hcnkucmVzb3VyY2UpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIENvbmZpcm0gYmVmb3JlIGRlbGV0aW5nIGEgc3ViIGNoYXQgZnJvbSBhIG11bHRpLWNoYXQgc2Vzc2lvbiwgdW5sZXNzIHRoZVxuXHRcdC8vIGNhbGxlciBvcHRlZCBvdXQgKGUuZy4gZGlzY2FyZGluZyBhIHRyYW5zaWVudCB1bnRpdGxlZCBkcmFmdCkuXG5cdFx0aWYgKCFvcHRpb25zPy5za2lwQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRjb25zdCBjb25maXJtZWQgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdkZWxldGVDaGF0LmNvbmZpcm0nLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBkZWxldGUgdGhpcyBjaGF0P1wiKSxcblx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnZGVsZXRlQ2hhdC5kZXRhaWwnLCBcIlRoaXMgYWN0aW9uIGNhbm5vdCBiZSB1bmRvbmUuXCIpLFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgnZGVsZXRlQ2hhdC5kZWxldGUnLCBcIkRlbGV0ZVwiKVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoIWNvbmZpcm1lZC5jb25maXJtZWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuY2hhdFNlcnZpY2UucmVtb3ZlSGlzdG9yeUVudHJ5KHRhcmdldC5yZXNvdXJjZSk7XG5cdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLmRlbGV0ZSh0YXJnZXQucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0dGhpcy5fcmVtb3ZlU3RvcmVkU2Vzc2lvbih0YXJnZXQucmVzb3VyY2UpO1xuXHRcdHRhcmdldC5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUdyb3VwTWVtYmVyc2hpcC5maXJlKHsgZ3JvdXBLZXk6IHByaW1hcnkuc2Vzc2lvbklkIH0pO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFt0aGlzLl90b0lTZXNzaW9uKHByaW1hcnkpXSB9KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIGZvcmtDaGF0KHNlc3Npb25JZDogc3RyaW5nLCBfc291cmNlQ2hhdDogVVJJLCBfdHVybklkOiBzdHJpbmcpOiBQcm9taXNlPElDaGF0PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBTZXNzaW9uICcke3Nlc3Npb25JZH0nIGRvZXMgbm90IHN1cHBvcnQgZm9ya2luZyBpbnRvIGEgY2hhdGApO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlU2lkZUNoYXQoc2Vzc2lvbklkOiBzdHJpbmcsIF9zb3VyY2VDaGF0OiBVUkksIF90dXJuSWQ6IHN0cmluZywgX3NlbGVjdGlvbj86IElTaWRlQ2hhdFNlbGVjdGlvbik6IFByb21pc2U8SUNoYXQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJyR7c2Vzc2lvbklkfScgZG9lcyBub3Qgc3VwcG9ydCBzaWRlIGNoYXRzYCk7XG5cdH1cblxuXHRhc3luYyByZW5hbWVDaGF0KF9zZXNzaW9uSWQ6IHN0cmluZywgY2hhdFVyaTogVVJJLCB0aXRsZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jaGF0U2VydmljZS5zZXRTZXNzaW9uVGl0bGUoY2hhdFVyaSwgdGl0bGUpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9maW5kU2Vzc2lvbkJ5UmVzb3VyY2UoY2hhdFVyaSk7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdHNlc3Npb24uc2V0VGl0bGUodGl0bGUpO1xuXHRcdFx0dGhpcy5fdXBkYXRlU3RvcmVkU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFt0aGlzLl90b0lTZXNzaW9uKHNlc3Npb24pXSB9KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZW5hbWVTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nLCB0aXRsZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2ZpbmRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdGF3YWl0IHRoaXMucmVuYW1lQ2hhdChzZXNzaW9uSWQsIHNlc3Npb24ucmVzb3VyY2UsIHRpdGxlKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjcmVhdGVOZXdDaGF0KHNlc3Npb25JZDogc3RyaW5nLCBfcHJvbXB0Pzogc3RyaW5nKTogUHJvbWlzZTxJQ2hhdD4ge1xuXHRcdGNvbnN0IGN1cnJlbnROZXdTZXNzaW9uID0gdGhpcy5fbmV3U2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKGN1cnJlbnROZXdTZXNzaW9uKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gY3VycmVudE5ld1Nlc3Npb247XG5cdFx0XHRjb25zdCBjaGF0ID0gYnVpbGRDaGF0KHNlc3Npb24pO1xuXHRcdFx0c2Vzc2lvbi5tYWluQ2hhdC5zZXQoY2hhdCwgdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybiBjaGF0O1xuXHRcdH1cblxuXHRcdGNvbnN0IHByaW1hcnkgPSB0aGlzLl9maW5kU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGlmIChwcmltYXJ5ICYmICFwcmltYXJ5LnBhcmVudFJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlTmV3U3Vic2VxdWVudENoYXQocHJpbWFyeSk7XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKGBTZXNzaW9uICcke3Nlc3Npb25JZH0nIG5vdCBmb3VuZCBvciBpcyBub3QgdGhlIGN1cnJlbnQgbmV3IHNlc3Npb25gKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgc3Vic2VxdWVudCBjaGF0IHdpdGhpbiBhbiBleGlzdGluZyBtdWx0aS1jaGF0IHNlc3Npb24uIFRoZSBuZXdcblx0ICogY2hhdCBpcyBsaW5rZWQgdG8gdGhlIHByaW1hcnkgY2hhdCB2aWEge0BsaW5rIExvY2FsU2Vzc2lvbi5wYXJlbnRSZXNvdXJjZX1cblx0ICogYW5kIGFkZGVkIHRvIHRoZSBjYWNoZSBzbyBpdCBhcHBlYXJzIGluIHRoZSBzZXNzaW9uJ3MgYGNoYXRzYCBncm91cC4gSXQgaXNcblx0ICogbm90IHBlcnNpc3RlZCB1bnRpbCBpdHMgZmlyc3Qge0BsaW5rIHNlbmRSZXF1ZXN0fSBzdWNjZWVkcy5cblx0ICovXG5cdHByaXZhdGUgX2NyZWF0ZU5ld1N1YnNlcXVlbnRDaGF0KHByaW1hcnk6IExvY2FsU2Vzc2lvbik6IElDaGF0IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBwcmltYXJ5LndvcmtzcGFjZS5nZXQoKTtcblx0XHRpZiAoIXdvcmtzcGFjZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgY3JlYXRlIGEgbmV3IGNoYXQgXHUyMDE0IHByaW1hcnkgc2Vzc2lvbiBoYXMgbm8gd29ya3NwYWNlJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hpbGQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsU2Vzc2lvbiwgdW5kZWZpbmVkLCB3b3Jrc3BhY2UsIHRoaXMuaWQpO1xuXHRcdGNoaWxkLnNldFBhcmVudFJlc291cmNlKHByaW1hcnkucmVzb3VyY2UpO1xuXHRcdGNoaWxkLnNldFBlcm1pc3Npb25MZXZlbCh0aGlzLl9kZWZhdWx0UGVybWlzc2lvbkxldmVsKCkpO1xuXHRcdGNoaWxkLnNldE1vZGVsSWQocHJpbWFyeS5tb2RlbElkLmdldCgpKTtcblx0XHRjaGlsZC5zZXRUaXRsZShsb2NhbGl6ZSgnbmV3Q2hhdCcsIFwiTmV3IENoYXRcIikpO1xuXG5cdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLnNldChjaGlsZC5yZXNvdXJjZS50b1N0cmluZygpLCBjaGlsZCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VHcm91cE1lbWJlcnNoaXAuZmlyZSh7IGdyb3VwS2V5OiBwcmltYXJ5LnNlc3Npb25JZCB9KTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbdGhpcy5fdG9JU2Vzc2lvbihwcmltYXJ5KV0gfSk7XG5cblx0XHRyZXR1cm4gYnVpbGRDaGF0KGNoaWxkKTtcblx0fVxuXG5cdC8vIC0tIFNlbmQgUmVxdWVzdCAtLVxuXG5cdGFzeW5jIHNlbmRSZXF1ZXN0KHNlc3Npb25JZDogc3RyaW5nLCBjaGF0UmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHQvLyBGaXJzdCBjaGF0IG9mIGEgYnJhbmQtbmV3IHNlc3Npb24uXG5cdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IHRoaXMuX25ld1Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmIChuZXdTZXNzaW9uKSB7XG5cdFx0XHRpZiAoY2hhdFJlc291cmNlLnRvU3RyaW5nKCkgIT09IG5ld1Nlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENoYXQgcmVzb3VyY2UgJHtjaGF0UmVzb3VyY2UudG9TdHJpbmcoKX0gZG9lcyBub3QgbWF0Y2ggc2Vzc2lvbiByZXNvdXJjZSAke25ld1Nlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl9zZW5kRmlyc3RDaGF0KG5ld1Nlc3Npb24sIGNoYXRSZXNvdXJjZSwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Ly8gU3Vic2VxdWVudCBjaGF0IGluIGFuIGV4aXN0aW5nIG11bHRpLWNoYXQgc2Vzc2lvbi4gVGhlIG1hbmFnZW1lbnRcblx0XHQvLyBzZXJ2aWNlIHNlbmRzIHdpdGggdGhlIGdyb3VwIChwcmltYXJ5KSBzZXNzaW9uIGlkIGFuZCB0aGUgY2hpbGQnc1xuXHRcdC8vIGNoYXQgcmVzb3VyY2UuXG5cdFx0Y29uc3QgcHJpbWFyeSA9IHRoaXMuX2ZpbmRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY2hpbGQgPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KGNoYXRSZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRpZiAocHJpbWFyeSAmJiAhcHJpbWFyeS5wYXJlbnRSZXNvdXJjZSAmJiBjaGlsZCAmJiBjaGlsZC5wYXJlbnRSZXNvdXJjZSAmJiBpc0VxdWFsKGNoaWxkLnBhcmVudFJlc291cmNlLCBwcmltYXJ5LnJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NlbmRDaGlsZENoYXQocHJpbWFyeSwgY2hpbGQsIGNoYXRSZXNvdXJjZSwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKGBTZXNzaW9uICcke3Nlc3Npb25JZH0nIG5vdCBmb3VuZGApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2VuZEZpcnN0Q2hhdChuZXdTZXNzaW9uOiBMb2NhbFNlc3Npb24sIGNoYXRSZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxJU2Vzc2lvbj4ge1xuXHRcdG5ld1Nlc3Npb24uc2V0VGl0bGUob3B0aW9ucy5xdWVyeS5zcGxpdCgnXFxuJylbMF0uc3Vic3RyaW5nKDAsIDEwMCkgfHwgbG9jYWxpemUoJ25ld1Nlc3Npb24nLCBcIk5ldyBTZXNzaW9uXCIpKTtcblx0XHRuZXdTZXNzaW9uLnNldFN0YXR1cyhTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXG5cdFx0Y29uc3QgbmV3SVNlc3Npb24gPSB0aGlzLl90b0lTZXNzaW9uKG5ld1Nlc3Npb24pO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbbmV3SVNlc3Npb25dLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW10gfSk7XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtMb2NhbENoYXRTZXNzaW9uc1Byb3ZpZGVyXSBTZW5kaW5nIHJlcXVlc3QgZm9yIHNlc3Npb24gJHtuZXdTZXNzaW9uLnNlc3Npb25JZH1gKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2Rpc3BhdGNoU2VuZChuZXdTZXNzaW9uLCBjaGF0UmVzb3VyY2UsIG9wdGlvbnMpO1xuXHRcdGlmIChyZXN1bHQua2luZCA9PT0gJ3JlamVjdGVkJykge1xuXHRcdFx0dGhpcy5fbmV3U2Vzc2lvbnMuZGVsZXRlQW5kTGVhayhuZXdTZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uR3JvdXBDYWNoZS5kZWxldGUobmV3U2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbbmV3SVNlc3Npb25dLCBjaGFuZ2VkOiBbXSB9KTtcblx0XHRcdG5ld1Nlc3Npb24uZGlzcG9zZSgpO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcl0gc2VuZFJlcXVlc3QgcmVqZWN0ZWQ6ICR7cmVzdWx0LnJlYXNvbn1gKTtcblx0XHR9XG5cblx0XHQvLyBQdXQgdGhlIG5ldyBzZXNzaW9uIGludG8gdGhlIGNhY2hlIGFuZCBwZXJzaXN0IGl0cyBVUkkuXG5cdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLnNldChuZXdTZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksIG5ld1Nlc3Npb24pO1xuXHRcdHRoaXMuX2FkZFN0b3JlZFNlc3Npb24obmV3U2Vzc2lvbik7XG5cdFx0dGhpcy5fbmV3U2Vzc2lvbnMuZGVsZXRlQW5kTGVhayhuZXdTZXNzaW9uLnNlc3Npb25JZCk7XG5cblx0XHQvLyBUcmFjayB0aGUgbGl2ZSBtb2RlbCBub3csIHdoaWxlIHRoZSBmaXJzdCB0dXJuIGlzIHN0aWxsIGluIHByb2dyZXNzLFxuXHRcdC8vIHNvIGEgYmFja2dyb3VuZCBjb21wbGV0aW9uL2Vycm9yIG1hcmtzIHRoZSBzZXNzaW9uIHVucmVhZCBldmVuIGlmIHRoZVxuXHRcdC8vIHVzZXIgbmF2aWdhdGVzIGF3YXkgYmVmb3JlIGl0IHNldHRsZXMuXG5cdFx0aWYgKHJlc3VsdC5raW5kID09PSAnc2VudCcpIHtcblx0XHRcdHRoaXMuX3N5bmNTZXNzaW9uRnJvbU1vZGVsKG5ld1Nlc3Npb24pO1xuXHRcdFx0cmVzdWx0LmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2UudGhlbigoKSA9PiB7XG5cdFx0XHRcdG5ld1Nlc3Npb24uc2V0U3RhdHVzKFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKTtcblx0XHRcdH0sIGVycm9yID0+IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcl0gUmVzcG9uc2UgZmFpbGVkIGZvciBzZXNzaW9uICR7bmV3U2Vzc2lvbi5zZXNzaW9uSWR9OmAsIGVycm9yKTtcblx0XHRcdFx0bmV3U2Vzc2lvbi5zZXRTdGF0dXMoU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVTdG9yZWRTZXNzaW9uKG5ld1Nlc3Npb24pO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbbmV3SVNlc3Npb25dIH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW25ld0lTZXNzaW9uXSB9KTtcblx0XHRyZXR1cm4gbmV3SVNlc3Npb247XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZW5kQ2hpbGRDaGF0KHByaW1hcnk6IExvY2FsU2Vzc2lvbiwgY2hpbGQ6IExvY2FsU2Vzc2lvbiwgY2hhdFJlc291cmNlOiBVUkksIG9wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPElTZXNzaW9uPiB7XG5cdFx0Y2hpbGQuc2V0VGl0bGUob3B0aW9ucy5xdWVyeS5zcGxpdCgnXFxuJylbMF0uc3Vic3RyaW5nKDAsIDEwMCkgfHwgbG9jYWxpemUoJ25ld0NoYXQnLCBcIk5ldyBDaGF0XCIpKTtcblx0XHRjaGlsZC5zZXRTdGF0dXMoU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKTtcblxuXHRcdGNvbnN0IGdyb3VwSVNlc3Npb24gPSB0aGlzLl90b0lTZXNzaW9uKHByaW1hcnkpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtncm91cElTZXNzaW9uXSB9KTtcblxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW0xvY2FsQ2hhdFNlc3Npb25zUHJvdmlkZXJdIFNlbmRpbmcgcmVxdWVzdCBmb3IgY2hhdCAke2NoaWxkLnNlc3Npb25JZH0gaW4gc2Vzc2lvbiAke3ByaW1hcnkuc2Vzc2lvbklkfWApO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fZGlzcGF0Y2hTZW5kKGNoaWxkLCBjaGF0UmVzb3VyY2UsIG9wdGlvbnMpO1xuXHRcdGlmIChyZXN1bHQua2luZCA9PT0gJ3JlamVjdGVkJykge1xuXHRcdFx0Ly8gUm9sbCBiYWNrIHRoZSB1bnNlbnQgY2hpbGQgc28gaXQgZG9lcyBub3QgbGluZ2VyIGluIHRoZSBncm91cC5cblx0XHRcdHRoaXMuX3Nlc3Npb25DYWNoZS5kZWxldGUoY2hpbGQucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUdyb3VwTWVtYmVyc2hpcC5maXJlKHsgZ3JvdXBLZXk6IHByaW1hcnkuc2Vzc2lvbklkIH0pO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW2dyb3VwSVNlc3Npb25dIH0pO1xuXHRcdFx0Y2hpbGQuZGlzcG9zZSgpO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcl0gc2VuZFJlcXVlc3QgcmVqZWN0ZWQ6ICR7cmVzdWx0LnJlYXNvbn1gKTtcblx0XHR9XG5cblx0XHQvLyBQZXJzaXN0IHRoZSBub3ctY29tbWl0dGVkIGNoaWxkIGNoYXQgd2l0aCBpdHMgcGFyZW50IGxpbmsuXG5cdFx0dGhpcy5fYWRkU3RvcmVkU2Vzc2lvbihjaGlsZCk7XG5cblx0XHRpZiAocmVzdWx0LmtpbmQgPT09ICdzZW50Jykge1xuXHRcdFx0cmVzdWx0LmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2UudGhlbigoKSA9PiB7XG5cdFx0XHRcdGNoaWxkLnNldFN0YXR1cyhTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCk7XG5cdFx0XHRcdHRoaXMuX3N5bmNTZXNzaW9uRnJvbU1vZGVsKGNoaWxkKTtcblx0XHRcdH0sIGVycm9yID0+IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbTG9jYWxDaGF0U2Vzc2lvbnNQcm92aWRlcl0gUmVzcG9uc2UgZmFpbGVkIGZvciBjaGF0ICR7Y2hpbGQuc2Vzc2lvbklkfTpgLCBlcnJvcik7XG5cdFx0XHRcdGNoaWxkLnNldFN0YXR1cyhTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVN0b3JlZFNlc3Npb24oY2hpbGQpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbZ3JvdXBJU2Vzc2lvbl0gfSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbZ3JvdXBJU2Vzc2lvbl0gfSk7XG5cdFx0cmV0dXJuIGdyb3VwSVNlc3Npb247XG5cdH1cblxuXHQvKipcblx0ICogQXBwbGllcyBwcmUtc2VuZCBjb25maWd1cmF0aW9uIHRvIHRoZSBjaGF0IG1vZGVsIGFuZCBkaXNwYXRjaGVzIHRoZVxuXHQgKiByZXF1ZXN0IHRvIHtAbGluayBJQ2hhdFNlcnZpY2V9LiBSZXR1cm5zIHRoZSByYXcgc2VuZCByZXN1bHQ7IGNvbW1pdCBhbmRcblx0ICogcm9sbGJhY2sgYm9va2tlZXBpbmcgaXMgbGVmdCB0byB0aGUgY2FsbGVyLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZGlzcGF0Y2hTZW5kKHNlc3Npb246IExvY2FsU2Vzc2lvbiwgY2hhdFJlc291cmNlOiBVUkksIG9wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMpOiBSZXR1cm5UeXBlPElDaGF0U2VydmljZVsnc2VuZFJlcXVlc3QnXT4ge1xuXHRcdGNvbnN0IHsgcXVlcnksIGF0dGFjaGVkQ29udGV4dCB9ID0gb3B0aW9ucztcblxuXHRcdC8vIFJlc29sdmUgbW9kZVxuXHRcdGNvbnN0IG1vZGVLaW5kID0gc2Vzc2lvbi5jaGF0TW9kZT8ua2luZCA/PyBDaGF0TW9kZUtpbmQuQWdlbnQ7XG5cdFx0Y29uc3QgbW9kZUlzQnVpbHRpbiA9IHNlc3Npb24uY2hhdE1vZGUgPyBpc0J1aWx0aW5DaGF0TW9kZShzZXNzaW9uLmNoYXRNb2RlKSA6IHRydWU7XG5cblx0XHRjb25zdCByYXdNb2RlSW5zdHJ1Y3Rpb25zID0gc2Vzc2lvbi5jaGF0TW9kZT8ubW9kZUluc3RydWN0aW9ucz8uZ2V0KCk7XG5cdFx0Y29uc3QgbW9kZUluc3RydWN0aW9ucyA9IHJhd01vZGVJbnN0cnVjdGlvbnMgPyB7XG5cdFx0XHRuYW1lOiBzZXNzaW9uLmNoYXRNb2RlIS5uYW1lLmdldCgpLFxuXHRcdFx0Y29udGVudDogcmF3TW9kZUluc3RydWN0aW9ucy5jb250ZW50LFxuXHRcdFx0dG9vbFJlZmVyZW5jZXM6IHRoaXMudG9vbHNTZXJ2aWNlLnRvVG9vbFJlZmVyZW5jZXMocmF3TW9kZUluc3RydWN0aW9ucy50b29sUmVmZXJlbmNlcyksXG5cdFx0XHRtZXRhZGF0YTogcmF3TW9kZUluc3RydWN0aW9ucy5tZXRhZGF0YSxcblx0XHR9IDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgcGVybWlzc2lvbkxldmVsID0gc2Vzc2lvbi5wZXJtaXNzaW9uTGV2ZWwuZ2V0KCk7XG5cblx0XHRjb25zdCBzZW5kT3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHVzZXJTZWxlY3RlZE1vZGVsSWQ6IHNlc3Npb24uc2VsZWN0ZWRNb2RlbElkLFxuXHRcdFx0bW9kZUluZm86IHtcblx0XHRcdFx0a2luZDogbW9kZUtpbmQsXG5cdFx0XHRcdGlzQnVpbHRpbjogbW9kZUlzQnVpbHRpbixcblx0XHRcdFx0bW9kZUluc3RydWN0aW9ucyxcblx0XHRcdFx0dGVsZW1ldHJ5TW9kZUlkOiBtb2RlSXNCdWlsdGluID8gbW9kZUtpbmQgOiAnY3VzdG9tJyxcblx0XHRcdFx0YXBwbHlDb2RlQmxvY2tTdWdnZXN0aW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGVybWlzc2lvbkxldmVsLFxuXHRcdFx0fSxcblx0XHRcdGF0dGFjaGVkQ29udGV4dCxcblx0XHR9O1xuXG5cdFx0Ly8gU2V0IG1vZGVsL21vZGUvcGVybWlzc2lvbiBzdGF0ZSBvbiB0aGUgY2hhdCBtb2RlbCBiZWZvcmUgc2VuZGluZ1xuXHRcdGNvbnN0IG1vZGVsUmVmID0gYXdhaXQgdGhpcy5fdXBkYXRlQ2hhdFNlc3Npb25TdGF0ZShjaGF0UmVzb3VyY2UsIHNlc3Npb24pO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5jaGF0U2VydmljZS5zZW5kUmVxdWVzdChjaGF0UmVzb3VyY2UsIHF1ZXJ5LCBzZW5kT3B0aW9ucyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdG1vZGVsUmVmPy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0gUHJpdmF0ZSBoZWxwZXJzIC0tXG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5fc2Vzc2lvbkNhY2hlLnZhbHVlcygpKSB7XG5cdFx0XHRzZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLmNsZWFyKCk7XG5cdFx0dGhpcy5fc2Vzc2lvbkdyb3VwQ2FjaGUuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgdGhlIGluaXRpYWwgcGVybWlzc2lvbiBsZXZlbCBmb3IgYSBicmFuZC1uZXcgc2Vzc2lvbiBmcm9tXG5cdCAqIGBjaGF0LnBlcm1pc3Npb25zLmRlZmF1bHRgLCBjbGFtcGVkIHRvIGBEZWZhdWx0YCB3aGVuIGVudGVycHJpc2UgcG9saWN5XG5cdCAqIGRpc2FibGVzIGdsb2JhbCBhdXRvLWFwcHJvdmFsLlxuXHQgKi9cblx0cHJpdmF0ZSBfZGVmYXVsdFBlcm1pc3Npb25MZXZlbCgpOiBDaGF0UGVybWlzc2lvbkxldmVsIHtcblx0XHRjb25zdCBwb2xpY3lSZXN0cmljdGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlKS5wb2xpY3lWYWx1ZSA9PT0gZmFsc2U7XG5cdFx0aWYgKHBvbGljeVJlc3RyaWN0ZWQpIHtcblx0XHRcdHJldHVybiBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQ7XG5cdFx0fVxuXHRcdGNvbnN0IGxldmVsID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRQZXJtaXNzaW9uTGV2ZWwpO1xuXHRcdHJldHVybiBpc0NoYXRQZXJtaXNzaW9uTGV2ZWwobGV2ZWwpID8gbGV2ZWwgOiBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgY2hhdCBtb2RlbCBzdGF0ZSAobW9kZWwsIG1vZGUsIHBlcm1pc3Npb24gbGV2ZWwpIGJlZm9yZSBzZW5kaW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlQ2hhdFNlc3Npb25TdGF0ZShyZXNvdXJjZTogVVJJLCBzZXNzaW9uOiBMb2NhbFNlc3Npb24pOiBQcm9taXNlPHsgZGlzcG9zZSgpOiB2b2lkIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBtb2RlbFJlZiA9IGF3YWl0IHRoaXMuY2hhdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24ocmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmICghbW9kZWxSZWYpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsID0gbW9kZWxSZWYub2JqZWN0O1xuXHRcdGlmIChzZXNzaW9uLnNlbGVjdGVkTW9kZWxJZCkge1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbCA9IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwoc2Vzc2lvbi5zZWxlY3RlZE1vZGVsSWQpO1xuXHRcdFx0aWYgKGxhbmd1YWdlTW9kZWwpIHtcblx0XHRcdFx0bW9kZWwuaW5wdXRNb2RlbC5zZXRTdGF0ZSh7IHNlbGVjdGVkTW9kZWw6IHsgaWRlbnRpZmllcjogc2Vzc2lvbi5zZWxlY3RlZE1vZGVsSWQsIG1ldGFkYXRhOiBsYW5ndWFnZU1vZGVsIH0gfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChzZXNzaW9uLmNoYXRNb2RlKSB7XG5cdFx0XHRtb2RlbC5pbnB1dE1vZGVsLnNldFN0YXRlKHsgbW9kZTogeyBpZDogc2Vzc2lvbi5jaGF0TW9kZS5pZCwga2luZDogc2Vzc2lvbi5jaGF0TW9kZS5raW5kIH0gfSk7XG5cdFx0fVxuXHRcdGNvbnN0IHBlcm1pc3Npb25MZXZlbCA9IHNlc3Npb24ucGVybWlzc2lvbkxldmVsLmdldCgpO1xuXHRcdGlmIChwZXJtaXNzaW9uTGV2ZWwpIHtcblx0XHRcdG1vZGVsLmlucHV0TW9kZWwuc2V0U3RhdGUoeyBwZXJtaXNzaW9uTGV2ZWwgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBtb2RlbFJlZjtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogTG9jYWxTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBuZXdTZXNzaW9uID0gdGhpcy5fbmV3U2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKG5ld1Nlc3Npb24pIHtcblx0XHRcdHJldHVybiBuZXdTZXNzaW9uO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5fc2Vzc2lvbkNhY2hlLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoc2Vzc2lvbi5zZXNzaW9uSWQgPT09IHNlc3Npb25JZCkge1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRTZXNzaW9uQnlSZXNvdXJjZShyZXNvdXJjZTogVVJJKTogTG9jYWxTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGlmIChjYWNoZWQpIHtcblx0XHRcdHJldHVybiBjYWNoZWQ7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLl9uZXdTZXNzaW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKiBSZXNvbHZlcyB0aGUgcHJpbWFyeSAocGFyZW50KSBjaGF0IG9mIGEgc2Vzc2lvbidzIGdyb3VwLiAqL1xuXHRwcml2YXRlIF9yZXNvbHZlUHJpbWFyeShzZXNzaW9uOiBMb2NhbFNlc3Npb24pOiBMb2NhbFNlc3Npb24ge1xuXHRcdGlmIChzZXNzaW9uLnBhcmVudFJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChzZXNzaW9uLnBhcmVudFJlc291cmNlLnRvU3RyaW5nKCkpID8/IHNlc3Npb247XG5cdFx0fVxuXHRcdHJldHVybiBzZXNzaW9uO1xuXHR9XG5cblx0LyoqIFJldHVybnMgdGhlIHByaW1hcnkgY2hhdCBmb2xsb3dlZCBieSBpdHMgY2hpbGRyZW4sIG9yZGVyZWQgYnkgY3JlYXRpb24gdGltZS4gKi9cblx0cHJpdmF0ZSBfZ2V0R3JvdXBDaGF0cyhwcmltYXJ5OiBMb2NhbFNlc3Npb24pOiBMb2NhbFNlc3Npb25bXSB7XG5cdFx0Y29uc3QgY2hpbGRyZW46IExvY2FsU2Vzc2lvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3Nlc3Npb25DYWNoZS52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHNlc3Npb24ucGFyZW50UmVzb3VyY2UgJiYgaXNFcXVhbChzZXNzaW9uLnBhcmVudFJlc291cmNlLCBwcmltYXJ5LnJlc291cmNlKSkge1xuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKHNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjaGlsZHJlbi5zb3J0KChhLCBiKSA9PiBhLmNyZWF0ZWRBdC5nZXRUaW1lKCkgLSBiLmNyZWF0ZWRBdC5nZXRUaW1lKCkpO1xuXHRcdHJldHVybiBbcHJpbWFyeSwgLi4uY2hpbGRyZW5dO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9JU2Vzc2lvbihzZXNzaW9uOiBMb2NhbFNlc3Npb24pOiBJU2Vzc2lvbiB7XG5cdFx0Y29uc3QgcHJpbWFyeSA9IHRoaXMuX3Jlc29sdmVQcmltYXJ5KHNlc3Npb24pO1xuXG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fc2Vzc2lvbkdyb3VwQ2FjaGUuZ2V0KHByaW1hcnkuc2Vzc2lvbklkKTtcblx0XHRpZiAoY2FjaGVkKSB7XG5cdFx0XHRyZXR1cm4gY2FjaGVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdyb3VwSVNlc3Npb24gPSB0aGlzLl9idWlsZEdyb3VwSVNlc3Npb24ocHJpbWFyeSk7XG5cdFx0dGhpcy5fc2Vzc2lvbkdyb3VwQ2FjaGUuc2V0KHByaW1hcnkuc2Vzc2lvbklkLCBncm91cElTZXNzaW9uKTtcblx0XHRyZXR1cm4gZ3JvdXBJU2Vzc2lvbjtcblx0fVxuXG5cdC8qKlxuXHQgKiBXcmFwcyBhIHByaW1hcnkge0BsaW5rIExvY2FsU2Vzc2lvbn0gYW5kIGl0cyBjaGlsZCBjaGF0cyBpbnRvIGFuXG5cdCAqIGFnZ3JlZ2F0ZWQge0BsaW5rIElTZXNzaW9ufS4gVGhlIGBjaGF0c2Agb2JzZXJ2YWJsZSByZS1kZXJpdmVzIHdoZW5ldmVyXG5cdCAqIGdyb3VwIG1lbWJlcnNoaXAgY2hhbmdlczsgcGVyLWNoYXQgc3RhdGUgZmxvd3MgdGhyb3VnaCBlYWNoIGNoYXQncyBvd25cblx0ICogb2JzZXJ2YWJsZXMgY2FwdHVyZWQgYnkge0BsaW5rIGJ1aWxkQ2hhdH0uXG5cdCAqL1xuXHRwcml2YXRlIF9idWlsZEdyb3VwSVNlc3Npb24ocHJpbWFyeTogTG9jYWxTZXNzaW9uKTogSVNlc3Npb24ge1xuXHRcdGNvbnN0IGdyb3VwS2V5ID0gcHJpbWFyeS5zZXNzaW9uSWQ7XG5cblx0XHRjb25zdCBjaGF0c09iczogSU9ic2VydmFibGU8cmVhZG9ubHkgSUNoYXRbXT4gPSBvYnNlcnZhYmxlRnJvbUV2ZW50KFxuXHRcdFx0dGhpcyxcblx0XHRcdEV2ZW50LmZpbHRlcih0aGlzLl9vbkRpZENoYW5nZUdyb3VwTWVtYmVyc2hpcC5ldmVudCwgZSA9PiBlLmdyb3VwS2V5ID09PSBncm91cEtleSksXG5cdFx0XHQoKSA9PiB0aGlzLl9nZXRHcm91cENoYXRzKHByaW1hcnkpLm1hcChidWlsZENoYXQpLFxuXHRcdCk7XG5cblx0XHRjb25zdCBjaGFuZ2VzZXRzID0gY3JlYXRlQ2hhbmdlc2V0cyhwcmltYXJ5LnNlc3Npb25UeXBlLCBwcmltYXJ5LndvcmtzcGFjZSwgY2hhdHNPYnMsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlc3Npb25JZDogcHJpbWFyeS5zZXNzaW9uSWQsXG5cdFx0XHRyZXNvdXJjZTogcHJpbWFyeS5yZXNvdXJjZSxcblx0XHRcdHByb3ZpZGVySWQ6IHByaW1hcnkucHJvdmlkZXJJZCxcblx0XHRcdHNlc3Npb25UeXBlOiBwcmltYXJ5LnNlc3Npb25UeXBlLFxuXHRcdFx0aWNvbjogcHJpbWFyeS5pY29uLFxuXHRcdFx0Y3JlYXRlZEF0OiBwcmltYXJ5LmNyZWF0ZWRBdCxcblx0XHRcdHdvcmtzcGFjZTogcHJpbWFyeS53b3Jrc3BhY2UsXG5cdFx0XHR0aXRsZTogcHJpbWFyeS50aXRsZSxcblx0XHRcdHVwZGF0ZWRBdDogY2hhdHNPYnMubWFwKChjaGF0cywgcmVhZGVyKSA9PiB0aGlzLl9sYXRlc3REYXRlKGNoYXRzLCBjID0+IGMudXBkYXRlZEF0LnJlYWQocmVhZGVyKSkgPz8gcHJpbWFyeS51cGRhdGVkQXQucmVhZChyZWFkZXIpKSxcblx0XHRcdHN0YXR1czogY2hhdHNPYnMubWFwKChjaGF0cywgcmVhZGVyKSA9PiB0aGlzLl9hZ2dyZWdhdGVTdGF0dXMoY2hhdHMsIHJlYWRlcikpLFxuXHRcdFx0Y2hhbmdlc2V0cyxcblx0XHRcdGNoYW5nZXM6IHByaW1hcnkuY2hhbmdlcyxcblx0XHRcdG1vZGVsSWQ6IHByaW1hcnkubW9kZWxJZCxcblx0XHRcdG1vZGU6IHByaW1hcnkubW9kZSxcblx0XHRcdGxvYWRpbmc6IHByaW1hcnkubG9hZGluZyxcblx0XHRcdGlzQXJjaGl2ZWQ6IHByaW1hcnkuaXNBcmNoaXZlZCxcblx0XHRcdGlzUmVhZDogY2hhdHNPYnMubWFwKChjaGF0cywgcmVhZGVyKSA9PiBjaGF0cy5ldmVyeShjID0+IGMuaXNSZWFkLnJlYWQocmVhZGVyKSkpLFxuXHRcdFx0ZGVzY3JpcHRpb246IHByaW1hcnkuZGVzY3JpcHRpb24sXG5cdFx0XHRsYXN0VHVybkVuZDogY2hhdHNPYnMubWFwKChjaGF0cywgcmVhZGVyKSA9PiB0aGlzLl9sYXRlc3REYXRlKGNoYXRzLCBjID0+IGMubGFzdFR1cm5FbmQucmVhZChyZWFkZXIpKSksXG5cdFx0XHRjaGF0czogY2hhdHNPYnMsXG5cdFx0XHRtYWluQ2hhdDogcHJpbWFyeS5tYWluQ2hhdCxcblx0XHRcdGNhcGFiaWxpdGllczogY29uc3RPYnNlcnZhYmxlKHtcblx0XHRcdFx0c3VwcG9ydHNNdWx0aXBsZUNoYXRzOiB0cnVlLFxuXHRcdFx0XHRzdXBwb3J0c1JlbmFtZTogdHJ1ZSxcblx0XHRcdFx0c3VwcG9ydHNEZWxldGU6IHRydWUsXG5cdFx0XHR9KSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF0ZXN0RGF0ZShjaGF0czogcmVhZG9ubHkgSUNoYXRbXSwgZ2V0dGVyOiAoY2hhdDogSUNoYXQpID0+IERhdGUgfCB1bmRlZmluZWQpOiBEYXRlIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgbGF0ZXN0OiBEYXRlIHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBjaGF0cykge1xuXHRcdFx0Y29uc3QgZGF0ZSA9IGdldHRlcihjaGF0KTtcblx0XHRcdGlmIChkYXRlICYmICghbGF0ZXN0IHx8IGRhdGUgPiBsYXRlc3QpKSB7XG5cdFx0XHRcdGxhdGVzdCA9IGRhdGU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBsYXRlc3Q7XG5cdH1cblxuXHRwcml2YXRlIF9hZ2dyZWdhdGVTdGF0dXMoY2hhdHM6IHJlYWRvbmx5IElDaGF0W10sIHJlYWRlcjogSVJlYWRlcik6IFNlc3Npb25TdGF0dXMge1xuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBjaGF0cykge1xuXHRcdFx0aWYgKGNoYXQuc3RhdHVzLnJlYWQocmVhZGVyKSA9PT0gU2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0KSB7XG5cdFx0XHRcdHJldHVybiBTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBjaGF0cykge1xuXHRcdFx0aWYgKGNoYXQuc3RhdHVzLnJlYWQocmVhZGVyKSA9PT0gU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKSB7XG5cdFx0XHRcdHJldHVybiBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3M7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjaGF0c1swXS5zdGF0dXMucmVhZChyZWFkZXIpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksZUFBZSx5QkFBeUI7QUFDN0QsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxpQkFB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
