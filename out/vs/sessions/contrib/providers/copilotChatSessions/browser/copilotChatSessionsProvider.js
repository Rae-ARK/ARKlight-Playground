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
import { raceCancellationError, raceTimeout } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { CancellationError } from "../../../../../base/common/errors.js";
import { MarkdownString, markdownStringEqual } from "../../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, DisposableMap, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { autorun, constObservable, derived, derivedOpts, observableFromPromise, observableSignal, observableValue, observableValueOpts, runOnChange, transaction } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { getAgentSessionPullRequestUri } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js";
import { getRepositoryName } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsViewer.js";
import { IAgentSessionsService } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js";
import { AgentSessionProviders } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js";
import { IChatService } from "../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { ChatSessionStatus, IChatSessionsService, SessionType } from "../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { SessionStatus, GITHUB_REMOTE_FILE_SCHEME, sessionFileChangesEqual, gitHubInfoEqual, sessionWorkspaceEqual, toSessionId, SESSION_WORKSPACE_GROUP_LOCAL, ChatInteractivity } from "../../../../services/sessions/common/session.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel, isChatPermissionLevel } from "../../../../../workbench/contrib/chat/common/constants.js";
import { basename, dirname, isEqual } from "../../../../../base/common/resources.js";
import { ILanguageModelToolsService } from "../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js";
import { ChatMode, IChatModeService, isBuiltinChatMode } from "../../../../../workbench/contrib/chat/common/chatModes.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { ILanguageModelsService } from "../../../../../workbench/contrib/chat/common/languageModels.js";
import { getRegisteredLanguageModels, resolveModelIdentifier, resolveModelIdentifierFromLanguageModels } from "../../../../../workbench/contrib/chat/common/modelSelection.js";
import { IGitService } from "../../../../../workbench/contrib/git/common/gitService.js";
import { IContextKeyService, ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { SessionConfigKey } from "../../../../../platform/agentHost/common/sessionConfigKeys.js";
import { ClaudePreferAgentHostAgentsSettingId } from "../../../../../platform/agentHost/common/agentService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IGitHubService } from "../../../github/browser/githubService.js";
import { computePullRequestIcon } from "../../../github/common/types.js";
import { computeSessionPullRequestIcon } from "../../../github/browser/pullRequestIconStatus.js";
import { IPullRequestIconCache } from "../../../github/browser/pullRequestIconCache.js";
import { structuralEquals } from "../../../../../base/common/equals.js";
import { CopilotCLISessionType } from "../../agentHost/browser/baseAgentHostSessionsProvider.js";
import { createChangesets } from "./copilotChatSessionsChangesets.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { IAgentHostEnablementService } from "../../../../../platform/agentHost/common/agentHostEnablementService.js";
const ClaudeCodeSessionType = {
  id: "claude-code",
  label: localize("claudeCode", "Claude"),
  icon: Codicon.claude
};
const CopilotCloudSessionType = {
  id: "copilot-cloud-agent",
  label: localize("copilotCloud", "Cloud"),
  icon: Codicon.cloud
};
const SESSION_WORKSPACE_GROUP_GITHUB = localize("sessionWorkspaceGroup.github", "GitHub");
const STORAGE_KEY_ISOLATION_MODE = "sessions.isolationPicker.selectedMode";
const OPEN_REPO_COMMAND = "github.copilot.chat.cloudSessions.openRepository";
const COPILOT_PROVIDER_ID = "default-copilot";
const COPILOT_MULTI_CHAT_SETTING = "sessions.github.copilot.multiChatSessions";
const CLAUDE_CODE_ENABLED_SETTING = "sessions.chat.claudeAgent.enabled";
const REPOSITORY_OPTION_ID = "repository";
const PARENT_SESSION_OPTION_ID = "parentSessionId";
const BRANCH_OPTION_ID = "branch";
const ISOLATION_OPTION_ID = "isolation";
const AGENT_OPTION_ID = "agent";
function isNewSession(session) {
  return session instanceof CopilotCLISession || session instanceof RemoteNewSession || session instanceof ClaudeCodeNewSession;
}
function buildChatFromSession(chat, resource) {
  return {
    resource: resource ?? chat.resource,
    createdAt: chat.createdAt,
    title: chat.title,
    updatedAt: chat.updatedAt,
    status: chat.status,
    changes: chat.changes,
    checkpoints: chat.checkpoints,
    modelId: chat.modelId,
    mode: chat.mode,
    isArchived: chat.isArchived,
    isRead: chat.isRead,
    interactivity: constObservable(ChatInteractivity.Full),
    description: chat.description,
    lastTurnEnd: chat.lastTurnEnd
  };
}
function setIfChanged(observable, value, tx, equals = Object.is) {
  if (equals(observable.get(), value)) {
    return false;
  }
  observable.set(value, tx, void 0);
  return true;
}
function dateEquals(a, b) {
  return a?.getTime() === b?.getTime();
}
function markdownStringEquals(a, b) {
  return a === b || !!a && !!b && markdownStringEqual(a, b);
}
let CopilotCLISession = class extends Disposable {
  constructor(resource, sessionWorkspace, providerId, chatSessionsService, gitService, gitHubService, pullRequestIconCache, storageService, configurationService) {
    super();
    this.resource = resource;
    this.sessionWorkspace = sessionWorkspace;
    this.chatSessionsService = chatSessionsService;
    this.gitService = gitService;
    this.gitHubService = gitHubService;
    this.pullRequestIconCache = pullRequestIconCache;
    this.storageService = storageService;
    this.configurationService = configurationService;
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
    this._branchObservable = observableValue(this, void 0);
    this.branch = this._branchObservable;
    this._isolationModeObservable = observableValue(this, "worktree");
    this.isolationMode = this._isolationModeObservable;
    this._modelIdObservable = observableValue(this, void 0);
    this.modelId = this._modelIdObservable;
    this._modeObservable = observableValue(this, void 0);
    this.mode = this._modeObservable;
    this._loading = observableValue(this, true);
    this.loading = this._loading;
    this._hasGitRepository = observableValue(this, false);
    this.hasGitRepository = this._hasGitRepository;
    this._isArchived = observableValue(this, false);
    this.isArchived = this._isArchived;
    this.isRead = observableValue(this, true);
    this.lastTurnEnd = observableValue(this, void 0);
    this.gitHubInfo = observableValue(this, void 0);
    this._loadBranchesCts = this._register(new MutableDisposable());
    // -- Branch state --
    this._branches = observableValue(this, []);
    this.branches = this._branches;
    this.target = AgentSessionProviders.Background;
    this.selectedOptions = /* @__PURE__ */ new Map();
    this.sessionId = toSessionId(providerId, resource);
    this.providerId = providerId;
    this.sessionType = AgentSessionProviders.Background;
    this.icon = CopilotCLISessionType.icon;
    this.createdAt = /* @__PURE__ */ new Date();
    const repoUri = sessionWorkspace.folders[0]?.root;
    if (repoUri) {
      this._repoUri = repoUri;
      this.setOption(REPOSITORY_OPTION_ID, repoUri.fsPath);
    }
    this._workspaceData.set(sessionWorkspace, void 0);
    const storedMode = storageService.get(STORAGE_KEY_ISOLATION_MODE, StorageScope.PROFILE);
    const initialMode = storedMode === "workspace" ? "workspace" : "worktree";
    this._isolationMode = initialMode;
    this._isolationModeObservable.set(initialMode, void 0);
    this.setOption(ISOLATION_OPTION_ID, initialMode);
    this._resolveGitRepository();
    this._description = observableValue(this, void 0);
    this.description = this._description;
    this._changes = observableValueOpts({ owner: this, equalsFn: sessionFileChangesEqual }, []);
    this.changes = this._changes;
    this._checkpoints = observableValueOpts({ owner: this, equalsFn: structuralEquals }, void 0);
    this.checkpoints = this._checkpoints;
    this.mainChat = observableValue(this, buildChatFromSession(this));
  }
  get selectedModelId() {
    return this._modelId;
  }
  get chatMode() {
    return this._mode;
  }
  get query() {
    return this._query;
  }
  get attachedContext() {
    return this._attachedContext;
  }
  get gitRepository() {
    return this._gitRepository;
  }
  get disabled() {
    if (!this._repoUri) {
      return true;
    }
    if (this._isolationMode === "worktree" && !this._branch) {
      return true;
    }
    return false;
  }
  async _resolveGitRepository() {
    const repoUri = this.sessionWorkspace.folders[0]?.root;
    if (repoUri) {
      try {
        this._gitRepository = await this.gitService.openRepository(repoUri);
        if (!this._gitRepository) {
          this.setIsolationMode("workspace");
        } else if (!this._gitRepository.state.get().HEAD?.commit) {
          this.setIsolationMode("workspace");
        }
      } catch {
        this.setIsolationMode("workspace");
      }
    }
    const gitRepository = this._gitRepository;
    if (gitRepository) {
      this._register(autorun((reader) => {
        this._hasGitRepository.set(!!gitRepository.state.read(reader).HEAD?.commit, void 0);
      }));
      this._loadBranches(gitRepository);
      const currentBranchName = derived((reader) => {
        const state = gitRepository.state.read(reader);
        return state?.HEAD?.commit ? state.HEAD.name : void 0;
      });
      this._register(autorun((reader) => {
        const isolationMode = this.isolationMode.read(reader);
        if (isolationMode === "worktree") {
          return;
        }
        const currentBranch = currentBranchName.read(reader);
        this.setBranch(currentBranch ?? this._defaultBranch);
      }));
    }
    this._loading.set(false, void 0);
  }
  _loadBranches(repo) {
    this._loadBranchesCts.value?.cancel();
    const cts = this._loadBranchesCts.value = new CancellationTokenSource();
    repo.getRefs({ pattern: "refs/heads" }, cts.token).then((refs) => {
      if (cts.token.isCancellationRequested) {
        return;
      }
      const hasHeadCommit = !!repo.state.get().HEAD?.commit;
      const branches = refs.map((r) => r.name).filter((name) => !!name).filter((name) => !name.includes(CopilotCLISession.COPILOT_WORKTREE_PATTERN));
      const defaultBranch = hasHeadCommit ? branches.find((b) => b === "main") ?? branches.find((b) => b === "master") ?? branches.find((b) => b === repo.state.get().HEAD?.name) ?? branches[0] : void 0;
      this._defaultBranch = defaultBranch;
      transaction((tx) => {
        this._branches.set(branches, tx);
      });
      if (defaultBranch && !this._branch) {
        this.setBranch(defaultBranch);
      }
    }).catch(() => {
      if (!cts.token.isCancellationRequested) {
        transaction((tx) => {
          this._branches.set([], tx);
        });
      }
    });
  }
  setIsolationMode(mode) {
    if (this._isolationMode !== mode) {
      this._isolationMode = mode;
      this._isolationModeObservable.set(mode, void 0);
      this.setOption(ISOLATION_OPTION_ID, mode);
      this.storageService.store(STORAGE_KEY_ISOLATION_MODE, mode, StorageScope.PROFILE, StorageTarget.MACHINE);
      if (mode === "workspace") {
        const head = this._gitRepository?.state.get().HEAD;
        const currentBranch = head?.commit ? head.name : void 0;
        this.setBranch(currentBranch ?? this._defaultBranch);
      } else {
        this.setBranch(this._defaultBranch);
      }
    }
  }
  setBranch(branch) {
    if (this._branch !== branch) {
      this._branch = branch;
      this._branchObservable.set(branch, void 0);
      this.setOption(BRANCH_OPTION_ID, branch ?? "");
    }
  }
  setModelId(modelId) {
    this._modelId = modelId;
    this._modelIdObservable.set(modelId, void 0);
  }
  setModeById(modeId, modeKind) {
    this._modeObservable.set({ id: modeId, kind: modeKind }, void 0);
  }
  setPermissionLevel(level) {
    this._permissionLevel.set(level, void 0);
  }
  setTitle(title) {
    this._title.set(title, void 0);
  }
  setStatus(status) {
    this._status.set(status, void 0);
  }
  setArchived(archived) {
    this._isArchived.set(archived, void 0);
  }
  setMode(mode) {
    if (this._mode?.id !== mode?.id) {
      this._mode = mode;
      const modeName = mode?.isBuiltin ? void 0 : mode?.name.get();
      this.setOption(AGENT_OPTION_ID, modeName ?? "");
    }
  }
  getAgentHostSessionConfig() {
    const config = {
      [SessionConfigKey.Isolation]: this._isolationMode === "worktree" ? "worktree" : "folder"
    };
    if (this._isolationMode === "worktree" && this._branch) {
      config[SessionConfigKey.Branch] = this._branch;
      const branchPrefix = this.configurationService.getValue("git.branchPrefix", { resource: this._repoUri });
      if (typeof branchPrefix === "string" && branchPrefix.length > 0) {
        config[SessionConfigKey.WorktreeBranchPrefix] = branchPrefix;
      }
      const worktreeIncludeFiles = this.configurationService.getValue("git.worktreeIncludeFiles", { resource: this._repoUri });
      if (Array.isArray(worktreeIncludeFiles) && worktreeIncludeFiles.length > 0) {
        config[SessionConfigKey.WorktreeIncludeFiles] = worktreeIncludeFiles;
      }
    }
    return config;
  }
  setOption(optionId, value) {
    if (typeof value === "string") {
      this.selectedOptions.set(optionId, { id: value, name: value });
    } else {
      this.selectedOptions.set(optionId, value);
    }
    this.chatSessionsService.setSessionOption(this.resource, optionId, value);
  }
  update(agentSession) {
    transaction((tx) => {
      const session = new AgentSessionAdapter(agentSession, this.providerId, this.gitHubService, this.pullRequestIconCache);
      this._workspaceData.set(session.workspace.get(), tx);
      this._title.set(session.title.get(), tx);
      this._status.set(session.status.get(), tx);
      this._updatedAt.set(session.updatedAt.get(), tx);
      this._changes.set(session.changes.get(), tx);
      this._checkpoints.set(session.checkpoints.get(), tx);
      this._description.set(session.description.get(), tx);
    });
  }
};
CopilotCLISession.COPILOT_WORKTREE_PATTERN = "copilot-worktree-";
CopilotCLISession = __decorateClass([
  __decorateParam(3, IChatSessionsService),
  __decorateParam(4, IGitService),
  __decorateParam(5, IGitHubService),
  __decorateParam(6, IPullRequestIconCache),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IConfigurationService)
], CopilotCLISession);
function isModelOptionGroup(group) {
  if (group.id === "models") {
    return true;
  }
  const nameLower = group.name.toLowerCase();
  return nameLower === "model" || nameLower === "models";
}
function isRepositoriesOptionGroup(group) {
  return group.id === "repositories";
}
let RemoteNewSession = class extends Disposable {
  constructor(resource, sessionWorkspace, target, providerId, chatSessionsService, contextKeyService) {
    super();
    this.resource = resource;
    this.sessionWorkspace = sessionWorkspace;
    this.target = target;
    this.chatSessionsService = chatSessionsService;
    this.contextKeyService = contextKeyService;
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
    this.changes = observableValueOpts({ owner: this, equalsFn: sessionFileChangesEqual }, []);
    this.checkpoints = constObservable(void 0);
    this._modelIdObservable = observableValue(this, void 0);
    this.modelId = this._modelIdObservable;
    this.mode = observableValue(this, void 0);
    this.loading = observableValue(this, false);
    this._isArchived = observableValue(this, false);
    this.isArchived = this._isArchived;
    this.isRead = observableValue(this, true);
    this.description = constObservable(void 0);
    this.lastTurnEnd = constObservable(void 0);
    this.gitHubInfo = constObservable(void 0);
    this.branch = constObservable(void 0);
    this.isolationMode = constObservable(void 0);
    this.branches = constObservable([]);
    this._hasGitRepo = observableValue(this, false);
    this.hasGitRepo = this._hasGitRepo;
    this._onDidChangeOptionGroups = this._register(new Emitter());
    this.onDidChangeOptionGroups = this._onDidChangeOptionGroups.event;
    this.selectedOptions = /* @__PURE__ */ new Map();
    this._whenClauseKeys = /* @__PURE__ */ new Set();
    this.sessionId = toSessionId(providerId, resource);
    this.providerId = providerId;
    this.sessionType = target;
    this.icon = CopilotCloudSessionType.icon;
    this.createdAt = /* @__PURE__ */ new Date();
    this._updateWhenClauseKeys();
    this._register(this.chatSessionsService.onDidChangeOptionGroups(() => {
      this._updateWhenClauseKeys();
      this._onDidChangeOptionGroups.fire();
    }));
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (this._whenClauseKeys.size > 0 && e.affectsSome(this._whenClauseKeys)) {
        this._onDidChangeOptionGroups.fire();
      }
    }));
    this._workspaceData.set(sessionWorkspace, void 0);
    this._repoUri = sessionWorkspace.folders[0]?.root;
    if (this._repoUri) {
      const id = this._repoUri.path.substring(1);
      this.setOption("repositories", { id, name: id });
    }
    this.mainChat = observableValue(this, buildChatFromSession(this));
  }
  get project() {
    return this._project;
  }
  get selectedModelId() {
    return this._modelId;
  }
  get chatMode() {
    return void 0;
  }
  get query() {
    return this._query;
  }
  get attachedContext() {
    return this._attachedContext;
  }
  get disabled() {
    return !this._repoUri && !this.selectedOptions.has("repositories");
  }
  setPermissionLevel(level) {
    throw new Error("Method not implemented.");
  }
  // -- New session configuration methods --
  setIsolationMode(_mode) {
  }
  setBranch(_branch) {
  }
  setModelId(modelId) {
    this._modelId = modelId;
  }
  setTitle(title) {
    this._title.set(title, void 0);
  }
  setStatus(status) {
    this._status.set(status, void 0);
  }
  setArchived(archived) {
    this._isArchived.set(archived, void 0);
  }
  setMode(_mode) {
  }
  setOption(optionId, value) {
    if (typeof value !== "string") {
      this.selectedOptions.set(optionId, value);
    }
    this.chatSessionsService.setSessionOption(this.resource, optionId, value);
  }
  // --- Option group accessors ---
  getModelOptionsSnapshot() {
    const groups = this._getOptionGroups();
    if (!groups) {
      return { modelOption: void 0, isResolved: false };
    }
    const group = groups.find((g) => isModelOptionGroup(g));
    if (!group) {
      return { modelOption: void 0, isResolved: true };
    }
    return { modelOption: { group, value: this._getValueForGroup(group) }, isResolved: true };
  }
  getOtherOptionGroups() {
    const groups = this._getOptionGroups();
    if (!groups) {
      return [];
    }
    return groups.filter((g) => !isModelOptionGroup(g) && !isRepositoriesOptionGroup(g) && this._isOptionGroupVisible(g)).map((g) => ({ group: g, value: this._getValueForGroup(g) }));
  }
  getOptionValue(groupId) {
    return this.selectedOptions.get(groupId);
  }
  setOptionValue(groupId, value) {
    this.setOption(groupId, value);
  }
  // --- Internals ---
  _getOptionGroups() {
    return this.chatSessionsService.getOptionGroupsForSessionType(this.target);
  }
  _isOptionGroupVisible(group) {
    if (!group.when) {
      return true;
    }
    const expr = ContextKeyExpr.deserialize(group.when);
    return !expr || this.contextKeyService.contextMatchesRules(expr);
  }
  _updateWhenClauseKeys() {
    this._whenClauseKeys.clear();
    const groups = this._getOptionGroups();
    if (!groups) {
      return;
    }
    for (const group of groups) {
      if (group.when) {
        const expr = ContextKeyExpr.deserialize(group.when);
        if (expr) {
          for (const key of expr.keys()) {
            this._whenClauseKeys.add(key);
          }
        }
      }
    }
  }
  _getValueForGroup(group) {
    const selected = this.selectedOptions.get(group.id);
    if (selected) {
      return selected;
    }
    const sessionOption = this.chatSessionsService.getSessionOption(this.resource, group.id);
    if (sessionOption && typeof sessionOption !== "string") {
      return sessionOption;
    }
    if (typeof sessionOption === "string") {
      const item = group.items.find((i) => i.id === sessionOption.trim());
      if (item) {
        return item;
      }
    }
    return group.items.find((i) => i.default === true) ?? group.items[0];
  }
  update(_session) {
  }
};
RemoteNewSession = __decorateClass([
  __decorateParam(4, IChatSessionsService),
  __decorateParam(5, IContextKeyService)
], RemoteNewSession);
class ClaudeCodeNewSession extends Disposable {
  constructor(resource, sessionWorkspace, providerId) {
    super();
    this.resource = resource;
    this.sessionWorkspace = sessionWorkspace;
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
    this.changes = observableValueOpts({ owner: this, equalsFn: sessionFileChangesEqual }, []);
    this.checkpoints = constObservable(void 0);
    this._modelIdObservable = observableValue(this, void 0);
    this.modelId = this._modelIdObservable;
    this._modeObservable = observableValue(this, void 0);
    this.mode = this._modeObservable;
    this.loading = observableValue(this, false);
    this._isArchived = observableValue(this, false);
    this.isArchived = this._isArchived;
    this.isRead = observableValue(this, true);
    this.description = constObservable(void 0);
    this.lastTurnEnd = constObservable(void 0);
    this.gitHubInfo = constObservable(void 0);
    this.branch = constObservable(void 0);
    this.isolationMode = constObservable(void 0);
    this.branches = constObservable([]);
    this.target = AgentSessionProviders.Claude;
    this.selectedOptions = /* @__PURE__ */ new Map();
    this.sessionId = toSessionId(providerId, resource);
    this.providerId = providerId;
    this.sessionType = AgentSessionProviders.Claude;
    this.icon = ClaudeCodeSessionType.icon;
    this.createdAt = /* @__PURE__ */ new Date();
    this._workspaceData.set(sessionWorkspace, void 0);
    this.mainChat = observableValue(this, buildChatFromSession(this));
  }
  get selectedModelId() {
    return this._modelId;
  }
  get chatMode() {
    return this._mode;
  }
  get query() {
    return void 0;
  }
  get attachedContext() {
    return void 0;
  }
  get disabled() {
    return false;
  }
  setOption(optionId, value) {
    if (typeof value === "string") {
      this.selectedOptions.set(optionId, { id: value, name: value });
    } else {
      this.selectedOptions.set(optionId, value);
    }
  }
  setPermissionLevel(level) {
    this._permissionLevel.set(level, void 0);
  }
  setIsolationMode(_mode) {
  }
  setBranch(_branch) {
  }
  setModelId(modelId) {
    this._modelId = modelId;
    this._modelIdObservable.set(modelId, void 0);
  }
  setTitle(title) {
    this._title.set(title, void 0);
  }
  setStatus(status) {
    this._status.set(status, void 0);
  }
  setArchived(archived) {
    this._isArchived.set(archived, void 0);
  }
  setMode(mode) {
    this._mode = mode;
    if (mode) {
      this._modeObservable.set({ id: mode.id, kind: mode.kind }, void 0);
    } else {
      this._modeObservable.set(void 0, void 0);
    }
  }
  update(_session) {
  }
}
function toSessionStatus(status) {
  switch (status) {
    case ChatSessionStatus.InProgress:
      return SessionStatus.InProgress;
    case ChatSessionStatus.NeedsInput:
      return SessionStatus.NeedsInput;
    case ChatSessionStatus.Completed:
      return SessionStatus.Completed;
    case ChatSessionStatus.Failed:
      return SessionStatus.Error;
  }
}
function githubRemoteRepoLabel(uri) {
  if (uri.scheme !== GITHUB_REMOTE_FILE_SCHEME) {
    return void 0;
  }
  const parts = uri.path.replace(/^\//, "").split("/");
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : void 0;
}
class AgentSessionAdapter {
  constructor(session, providerId, _gitHubService, _pullRequestIconCache) {
    this._gitHubService = _gitHubService;
    this._pullRequestIconCache = _pullRequestIconCache;
    this._pullRequestNumberCache = /* @__PURE__ */ new Map();
    this.permissionLevel = constObservable(ChatPermissionLevel.Default);
    this.branch = constObservable(void 0);
    this.isolationMode = constObservable(void 0);
    this.branches = constObservable([]);
    this.sessionId = toSessionId(providerId, session.resource);
    this.resource = session.resource;
    this.providerId = providerId;
    this.sessionType = session.providerType;
    this.icon = this._getSessionTypeIcon(session);
    this.createdAt = new Date(session.timing.created);
    this._baseGitHubInfo = observableValue(this, this._extractGitHubInfo(session));
    this._pullRequestBranch = observableValue(this, this._extractPullRequestBranch(session));
    this._pullRequestNumberFromBranch = derived(this, (reader) => {
      const base = this._baseGitHubInfo.read(reader);
      const branch = this._pullRequestBranch.read(reader);
      if (base?.pullRequest || !base || !branch) {
        return void 0;
      }
      return this._pullRequestNumberForBranch(base.owner, base.repo, branch);
    });
    this.gitHubInfo = derived(this, (reader) => {
      let info = this._baseGitHubInfo.read(reader);
      if (!info) {
        return void 0;
      }
      if (!info.pullRequest) {
        const pullRequestNumber = this._pullRequestNumberFromBranch.read(reader)?.read(reader).value;
        if (pullRequestNumber === void 0) {
          return info;
        }
        info = {
          ...info,
          pullRequest: {
            number: pullRequestNumber,
            uri: URI.parse(`https://github.com/${info.owner}/${info.repo}/pull/${pullRequestNumber}`)
          }
        };
      }
      const pullRequest = info.pullRequest;
      if (!pullRequest) {
        return info;
      }
      if (pullRequest.uri.authority.toLowerCase() !== "github.com") {
        return info;
      }
      return {
        ...info,
        pullRequest: {
          ...pullRequest,
          icon: computeSessionPullRequestIcon(reader, this._gitHubService, this._pullRequestIconCache, info)
        }
      };
    });
    this._workspace = observableValue(this, this._buildWorkspace(session));
    this.workspace = this._workspace;
    this._title = observableValue(this, session.label);
    this.title = this._title;
    const updatedTime = session.timing.lastRequestEnded ?? session.timing.lastRequestStarted ?? session.timing.created;
    this._updatedAt = observableValue(this, new Date(updatedTime));
    this.updatedAt = this._updatedAt;
    this._status = observableValue(this, toSessionStatus(session.status));
    this.status = this._status;
    this._changes = observableValueOpts({ owner: this, equalsFn: sessionFileChangesEqual }, this._extractChanges(session));
    this.changes = this._changes;
    this._checkpoints = observableValueOpts({ owner: this, equalsFn: structuralEquals }, this._extractCheckpoints(session));
    this.checkpoints = this._checkpoints;
    this._modelId = observableValue(this, void 0);
    this.modelId = this._modelId;
    this.mode = observableValue(this, void 0);
    this.loading = observableValue(this, false);
    this._isArchived = observableValue(this, session.isArchived());
    this.isArchived = this._isArchived;
    this._isRead = observableValue(this, session.isRead());
    this.isRead = this._isRead;
    this._description = observableValue(this, this._extractDescription(session));
    this.description = this._description;
    this._lastTurnEnd = observableValue(this, session.timing.lastRequestEnded ? new Date(session.timing.lastRequestEnded) : void 0);
    this.lastTurnEnd = this._lastTurnEnd;
    this.mainChat = observableValue(this, buildChatFromSession(this));
  }
  setPermissionLevel(level) {
    throw new Error("Method not implemented.");
  }
  setBranch(branch) {
    throw new Error("Method not implemented.");
  }
  setIsolationMode(mode) {
    throw new Error("Method not implemented.");
  }
  setModelId(modelId) {
    this._modelId.set(modelId, void 0);
  }
  setMode(chatMode) {
    throw new Error("Method not implemented.");
  }
  /**
   * Update reactive properties from a refreshed agent session.
   */
  update(session) {
    let changed = false;
    transaction((tx) => {
      const gitHubInfo = this._extractGitHubInfo(session);
      const pullRequestBranch = this._extractPullRequestBranch(session);
      changed = setIfChanged(this._title, session.label, tx) || changed;
      changed = setIfChanged(this._workspace, this._buildWorkspace(session), tx, sessionWorkspaceEqual) || changed;
      const updatedTime = session.timing.lastRequestEnded ?? session.timing.lastRequestStarted ?? session.timing.created;
      changed = setIfChanged(this._updatedAt, new Date(updatedTime), tx, dateEquals) || changed;
      changed = setIfChanged(this._status, toSessionStatus(session.status), tx) || changed;
      changed = setIfChanged(this._changes, this._extractChanges(session), tx, sessionFileChangesEqual) || changed;
      changed = setIfChanged(this._checkpoints, this._extractCheckpoints(session), tx, structuralEquals) || changed;
      changed = setIfChanged(this._isArchived, session.isArchived(), tx) || changed;
      changed = setIfChanged(this._isRead, session.isRead(), tx) || changed;
      changed = setIfChanged(this._description, this._extractDescription(session), tx, markdownStringEquals) || changed;
      changed = setIfChanged(this._lastTurnEnd, session.timing.lastRequestEnded ? new Date(session.timing.lastRequestEnded) : void 0, tx, dateEquals) || changed;
      changed = setIfChanged(this._baseGitHubInfo, gitHubInfo, tx, gitHubInfoEqual) || changed;
      changed = setIfChanged(this._pullRequestBranch, pullRequestBranch, tx) || changed;
    });
    return changed;
  }
  _pullRequestNumberForBranch(owner, repo, branch) {
    const key = `${owner}/${repo}@${branch}`;
    const cached = this._pullRequestNumberCache.get(key);
    if (cached) {
      return cached;
    }
    const lookup = this._gitHubService.findPullRequestNumberByHeadBranch(owner, repo, branch);
    const observable = observableFromPromise(lookup);
    this._pullRequestNumberCache.set(key, observable);
    lookup.then((pullRequestNumber) => {
      if (pullRequestNumber === void 0 && this._pullRequestNumberCache.get(key) === observable) {
        this._pullRequestNumberCache.delete(key);
      }
    });
    return observable;
  }
  _getSessionTypeIcon(session) {
    switch (session.providerType) {
      case AgentSessionProviders.Background:
        return CopilotCLISessionType.icon;
      case AgentSessionProviders.Cloud:
        return CopilotCloudSessionType.icon;
      case AgentSessionProviders.Claude:
        return ClaudeCodeSessionType.icon;
      default:
        return session.icon;
    }
  }
  _extractDescription(session) {
    if (!session.description) {
      return void 0;
    }
    return typeof session.description === "string" ? new MarkdownString(session.description) : session.description;
  }
  _extractGitHubInfo(session) {
    const metadata = session.metadata;
    if (!metadata) {
      return void 0;
    }
    const pullRequestUri = this._extractPullRequestUri(session);
    const pullRequestIdentity = pullRequestUri ? this._extractPullRequestIdentity(pullRequestUri) : void 0;
    const { owner, repo } = pullRequestIdentity ?? this._extractOwnerRepo(session);
    if (!owner || !repo) {
      return void 0;
    }
    if (!pullRequestUri || !pullRequestIdentity) {
      return { owner, repo };
    }
    const icon = this._extractPullRequestStateIcon(session);
    const baseRefOid = typeof metadata.baseRefOid === "string" ? metadata.baseRefOid : void 0;
    const headRefOid = typeof metadata.headRefOid === "string" ? metadata.headRefOid : void 0;
    return {
      owner,
      repo,
      pullRequest: {
        number: pullRequestIdentity.number,
        uri: pullRequestUri,
        icon,
        baseRefOid,
        headRefOid
      }
    };
  }
  _extractPullRequestBranch(session) {
    if (session.providerType !== AgentSessionProviders.Cloud) {
      return void 0;
    }
    if (typeof session.metadata?.host === "string" && session.metadata.host.toLowerCase() !== "github.com") {
      return void 0;
    }
    return typeof session.metadata?.branch === "string" ? session.metadata.branch : void 0;
  }
  _extractPullRequestIdentity(pullRequestUri) {
    const match = /^\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/pull\/(?<number>\d+)\/?$/.exec(pullRequestUri.path);
    if (!match?.groups) {
      return void 0;
    }
    return {
      owner: decodeURIComponent(match.groups.owner),
      repo: decodeURIComponent(match.groups.repo),
      number: parseInt(match.groups.number, 10)
    };
  }
  _extractOwnerRepo(session) {
    const metadata = session.metadata;
    if (!metadata) {
      return { owner: void 0, repo: void 0 };
    }
    if (typeof metadata.owner === "string" && typeof metadata.name === "string") {
      return { owner: metadata.owner, repo: metadata.name };
    }
    if (typeof metadata.repositoryNwo === "string") {
      const parts = metadata.repositoryNwo.split("/");
      if (parts.length === 2) {
        return { owner: parts[0], repo: parts[1] };
      }
    }
    const repoUri = this._buildWorkspace(session)?.folders[0]?.root;
    if (repoUri && repoUri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
      const parts = repoUri.path.split("/").filter(Boolean);
      if (parts.length >= 2) {
        return { owner: decodeURIComponent(parts[0]), repo: decodeURIComponent(parts[1]) };
      }
    }
    return { owner: void 0, repo: void 0 };
  }
  _extractPullRequestStateIcon(session) {
    const metadata = session.metadata;
    const state = metadata?.pullRequestState;
    if (typeof state === "string") {
      return computePullRequestIcon(state);
    }
    return void 0;
  }
  _extractPullRequestUri(session) {
    return getAgentSessionPullRequestUri(session);
  }
  _extractChanges(session) {
    if (!session.changes) {
      return [];
    }
    if (Array.isArray(session.changes)) {
      return session.changes;
    }
    const summary = session.changes;
    if (summary.insertions > 0 || summary.deletions > 0) {
      return [{
        modifiedUri: URI.parse("summary://changes"),
        insertions: summary.insertions,
        deletions: summary.deletions
      }];
    }
    return [];
  }
  _extractCheckpoints(session) {
    const metadata = session.metadata;
    if (typeof metadata?.firstCheckpointRef !== "string" || typeof metadata?.lastCheckpointRef !== "string") {
      return void 0;
    }
    return {
      firstCheckpointRef: metadata.firstCheckpointRef,
      lastCheckpointRef: metadata.lastCheckpointRef
    };
  }
  _buildWorkspace(session) {
    const {
      repoUri,
      worktreeUri,
      branchName,
      baseBranchName,
      baseBranchProtected,
      hasGitHubRemote,
      upstreamBranchName,
      incomingChanges,
      outgoingChanges,
      uncommittedChanges,
      hasGitOperationInProgress
    } = this._extractRepositoryFromMetadata(session);
    const repoUriResolved = repoUri ?? URI.parse("unknown:///");
    const gitRepository = {
      uri: repoUriResolved,
      workTreeUri: worktreeUri,
      branchName,
      baseBranchName,
      baseBranchProtected,
      hasGitHubRemote,
      upstreamBranchName,
      incomingChanges,
      outgoingChanges,
      uncommittedChanges,
      hasGitOperationInProgress,
      gitHubInfo: this.gitHubInfo
    };
    const folder = {
      root: repoUriResolved,
      workingDirectory: worktreeUri ?? repoUriResolved,
      name: basename(repoUriResolved),
      description: branchName,
      gitRepository
    };
    return {
      uri: repoUriResolved,
      label: githubRemoteRepoLabel(repoUriResolved) ?? getRepositoryName(session) ?? basename(repoUriResolved),
      icon: repoUri?.scheme === GITHUB_REMOTE_FILE_SCHEME ? Codicon.repo : Codicon.folder,
      group: repoUri?.scheme === GITHUB_REMOTE_FILE_SCHEME ? SESSION_WORKSPACE_GROUP_GITHUB : SESSION_WORKSPACE_GROUP_LOCAL,
      folders: [folder],
      requiresWorkspaceTrust: session.providerType !== AgentSessionProviders.Cloud,
      isVirtualWorkspace: session.providerType === AgentSessionProviders.Cloud
    };
  }
  /**
   * Extract repository/worktree information from session metadata.
   * Mirrors the logic in sessionsManagementService.getRepositoryFromMetadata().
   */
  _extractRepositoryFromMetadata(session) {
    const metadata = session.metadata;
    if (!metadata) {
      return {};
    }
    if (session.providerType === AgentSessionProviders.Cloud) {
      if (typeof metadata.owner !== "string" || typeof metadata.name !== "string") {
        return {};
      }
      const branch = typeof metadata.branch === "string" ? metadata.branch : "HEAD";
      const repositoryUri = URI.from({
        scheme: GITHUB_REMOTE_FILE_SCHEME,
        authority: "github",
        path: `/${metadata.owner}/${metadata.name}/${encodeURIComponent(branch)}`
      });
      return { repoUri: repositoryUri };
    }
    const repoUri = typeof metadata?.repositoryPath === "string" ? URI.file(metadata.repositoryPath) : void 0;
    const worktreeUri = typeof metadata?.worktreePath === "string" ? URI.file(metadata.worktreePath) : void 0;
    return {
      repoUri,
      worktreeUri,
      branchName: metadata?.branchName,
      baseBranchName: metadata?.baseBranchName,
      baseBranchProtected: metadata?.baseBranchProtected,
      hasGitHubRemote: metadata?.hasGitHubRemote,
      upstreamBranchName: metadata?.upstreamBranchName,
      incomingChanges: metadata?.incomingChanges,
      outgoingChanges: metadata?.outgoingChanges,
      uncommittedChanges: metadata?.uncommittedChanges,
      hasGitOperationInProgress: metadata?.hasGitOperationInProgress
    };
  }
}
let CopilotChatSessionsProvider = class extends Disposable {
  constructor(agentSessionsService, chatService, chatSessionsService, dialogService, commandService, instantiationService, languageModelsService, toolsService, configurationService, agentHostEnablementService, logService, gitHubService, pullRequestIconCache, labelService, chatModeService, uriIdentityService) {
    super();
    this.agentSessionsService = agentSessionsService;
    this.chatService = chatService;
    this.chatSessionsService = chatSessionsService;
    this.dialogService = dialogService;
    this.commandService = commandService;
    this.instantiationService = instantiationService;
    this.languageModelsService = languageModelsService;
    this.toolsService = toolsService;
    this.configurationService = configurationService;
    this.agentHostEnablementService = agentHostEnablementService;
    this.logService = logService;
    this.gitHubService = gitHubService;
    this.pullRequestIconCache = pullRequestIconCache;
    this.labelService = labelService;
    this.chatModeService = chatModeService;
    this.uriIdentityService = uriIdentityService;
    this.id = COPILOT_PROVIDER_ID;
    this.label = localize("copilotChatSessionsProvider", "Copilot Chat");
    this.icon = Codicon.copilot;
    this.order = 0;
    this._onDidChangeSessionTypes = this._register(new Emitter());
    this.onDidChangeSessionTypes = this._onDidChangeSessionTypes.event;
    this._onDidChangeSessions = this._register(new Emitter());
    this.onDidChangeSessions = this._onDidChangeSessions.event;
    this._onDidReplaceSession = this._register(new Emitter());
    this.onDidReplaceSession = this._onDidReplaceSession.event;
    /** Cache of adapted sessions, keyed by resource URI string. */
    this._sessionCache = /* @__PURE__ */ new Map();
    /**
     * Resources of committed sessions that are currently in-flight (i.e.
     * between {@link _sendFirstChat} entering the send and the replace
     * event firing). Protected from spurious removal by
     * {@link _refreshSessionCache} so that a concurrent model re-resolve
     * cannot transiently drop them.
     */
    this._inFlightCommits = /* @__PURE__ */ new Set();
    /** Cache of ISession wrappers, keyed by session group ID. */
    this._sessionGroupCache = /* @__PURE__ */ new Map();
    /**
     * Emitter fired when the set of chats in a group changes,
     * used to update the chats observable in `_chatToSession`.
     */
    this._onDidGroupMembershipChange = this._register(new Emitter());
    /**
     * Per-group signals, keyed by `sessionId`, that invalidate a single group's
     * chats observable. A group's chats derived observes only its own signal, so a
     * membership change recomputes just the affected group rather than every observed
     * group.
     */
    this._groupMembershipSignals = /* @__PURE__ */ new Map();
    this.supportsLocalWorkspaces = true;
    // -- Session Lifecycle --
    this._newSessions = this._register(new DisposableMap());
    this._multiChatEnabled = this.configurationService.getValue(COPILOT_MULTI_CHAT_SETTING) ?? true;
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      const affectsSessionTypes = e.affectsConfiguration(CLAUDE_CODE_ENABLED_SETTING) || e.affectsConfiguration(ClaudePreferAgentHostAgentsSettingId) || e.affectsConfiguration(ChatConfiguration.CopilotCliHideExtensionHostAgents);
      if (!affectsSessionTypes) {
        return;
      }
      this._onDidChangeSessionTypes.fire();
      this._refreshSessionCache();
    }));
    this._register(runOnChange(this.agentHostEnablementService.enabled, (enabled) => {
      if (enabled) {
        this._onDidChangeSessionTypes.fire();
        this._refreshSessionCache();
      }
    }));
    this.browseActions = [
      {
        label: localize("repositories", "Repositories"),
        group: SESSION_WORKSPACE_GROUP_GITHUB,
        icon: Codicon.library,
        providerId: this.id,
        run: () => this._browseForRepo()
      }
    ];
    this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
      this._refreshSessionCache();
    }));
    this._registerGroupMembershipFanOut();
  }
  get sessionTypes() {
    const types = [];
    if (this._isCopilotCliAvailable()) {
      types.push(CopilotCLISessionType);
    }
    types.push(CopilotCloudSessionType);
    if (this._isClaudeAvailable()) {
      types.push(ClaudeCodeSessionType);
    }
    return types;
  }
  /**
   * A single subscription to `_onDidGroupMembershipChange` that fans each event out
   * to the affected group's own signal. Subscribing exactly once (instead of once per
   * session) keeps the emitter's listener count constant regardless of how many
   * sessions exist — the per-session subscriptions previously leaked listeners as
   * sessions accumulated.
   */
  _registerGroupMembershipFanOut() {
    this._register(this._onDidGroupMembershipChange.event((e) => {
      this._groupMembershipSignals.get(e.sessionId)?.trigger(void 0, void 0);
    }));
  }
  /**
   * Claude is offered by this (Copilot Chat sessions) provider only when the
   * underlying `claudeAgent.enabled` setting is on AND the user has not opted
   * the agent-host implementation in via `chat.agents.claude.preferAgentHost`.
   * When the latter is true, the agent host registers Claude itself and this
   * provider stays out of the way so the picker shows a single entry. Stepping
   * aside only makes sense when the agent host is enabled to register Claude in
   * its place, so the preference is not respected unless `chat.agentHost.enabled`
   * is also on.
   */
  _isClaudeAvailable() {
    const claudeEnabled = this.configurationService.getValue(CLAUDE_CODE_ENABLED_SETTING) ?? false;
    if (!claudeEnabled) {
      return false;
    }
    const preferAgentHost = this.configurationService.getValue(ClaudePreferAgentHostAgentsSettingId) ?? false;
    if (this.agentHostEnablementService.enabled.get() && preferAgentHost) {
      return false;
    }
    return true;
  }
  /**
   * The Extension Host Copilot CLI is offered by this provider unless the user
   * has hidden it via `chat.agents.copilotCli.hideExtensionHost`, in which case
   * the Agents window picker only surfaces the Agent Host Copilot CLI entry.
   * Hiding it only makes sense when the agent host is enabled to surface the
   * Agent Host Copilot CLI in its place, so the setting is not respected unless
   * `chat.agentHost.enabled` is also on.
   */
  _isCopilotCliAvailable() {
    const hideExtensionHost = this.configurationService.getValue(ChatConfiguration.CopilotCliHideExtensionHostAgents) ?? false;
    if (this.agentHostEnablementService.enabled.get() && hideExtensionHost) {
      return false;
    }
    return true;
  }
  // -- Sessions --
  getSessionTypes(workspaceUri) {
    if (workspaceUri.scheme === GITHUB_REMOTE_FILE_SCHEME || workspaceUri.scheme === SessionType.CopilotCloud) {
      return [CopilotCloudSessionType];
    }
    const types = [];
    if (this._isCopilotCliAvailable()) {
      types.push(CopilotCLISessionType);
    }
    if (this._isClaudeAvailable()) {
      types.push(ClaudeCodeSessionType);
    }
    return types;
  }
  getSessions() {
    this._ensureSessionCache();
    if (!this._isMultiChatEnabled()) {
      return Array.from(this._sessionCache.values()).map((chat) => this._chatToSession(chat));
    }
    const allChats = Array.from(this._sessionCache.values()).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const seen = /* @__PURE__ */ new Set();
    const sessions = [];
    for (const chat of allChats) {
      const groupId = this._getGroupIdForChat(chat);
      if (!seen.has(groupId)) {
        seen.add(groupId);
        sessions.push(this._chatToSession(chat));
      }
    }
    return sessions;
  }
  /**
   * Clear the tracked new session with the given session's id, but only if
   * the map still holds exactly that instance. Async flows (commit wait,
   * cache population) may complete after the entry was already replaced or
   * removed — acting unconditionally would dispose an unrelated session.
   *
   * @param session The session that initiated the async flow.
   * @param leak When `true` use {@link DisposableMap.deleteAndLeak}
   *             (the session is still referenced elsewhere, e.g. the session
   *             cache); otherwise use {@link DisposableMap.deleteAndDispose}.
   */
  _clearCurrentNewSessionIfMatch(session, leak) {
    if (this._newSessions.get(session.sessionId) === session) {
      if (leak) {
        this._newSessions.deleteAndLeak(session.sessionId);
      } else {
        this._newSessions.deleteAndDispose(session.sessionId);
      }
    }
  }
  deleteNewSession(sessionId) {
    if (this._newSessions.has(sessionId)) {
      this._newSessions.deleteAndDispose(sessionId);
    }
  }
  getSession(sessionId) {
    const newSession = this._newSessions.get(sessionId);
    if (newSession) {
      return newSession;
    }
    return this._findChatSession(sessionId);
  }
  createNewSession(workspaceUri, sessionTypeId) {
    const workspace = this.resolveWorkspace(workspaceUri);
    if (!workspace) {
      throw new Error(`Cannot resolve workspace for URI: ${workspaceUri.toString()}`);
    }
    if (workspaceUri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
      if (sessionTypeId !== CopilotCloudSessionType.id) {
        throw new Error("Only Copilot Cloud sessions can be created for GitHub repositories");
      }
      const resource2 = URI.from({ scheme: AgentSessionProviders.Cloud, path: `/untitled-${generateUuid()}` });
      const session2 = this.instantiationService.createInstance(RemoteNewSession, resource2, workspace, AgentSessionProviders.Cloud, this.id);
      this._newSessions.set(session2.sessionId, session2);
      return this._chatToSession(session2);
    }
    if (sessionTypeId === ClaudeCodeSessionType.id) {
      const resource2 = URI.from({ scheme: AgentSessionProviders.Claude, path: `/untitled-${generateUuid()}` });
      const session2 = this.instantiationService.createInstance(ClaudeCodeNewSession, resource2, workspace, this.id);
      this._newSessions.set(session2.sessionId, session2);
      return this._chatToSession(session2);
    }
    if (sessionTypeId !== CopilotCLISessionType.id) {
      throw new Error(`Unsupported session type '${sessionTypeId}' for local workspaces`);
    }
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: `/untitled-${generateUuid()}` });
    const session = this.instantiationService.createInstance(CopilotCLISession, resource, workspace, this.id);
    session.setPermissionLevel(this._defaultPermissionLevel());
    this._newSessions.set(session.sessionId, session);
    return this._chatToSession(session);
  }
  createQuickChat(_sessionTypeId) {
    throw new Error("CopilotChatSessionsProvider does not support quick chats");
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
  get onDidChangeModels() {
    return Event.signal(Event.any(
      this.languageModelsService.onDidChangeLanguageModels,
      this.chatSessionsService.onDidChangeOptionGroups
    ));
  }
  getModelsSnapshot(sessionId, desiredModelId) {
    const session = this.getSession(sessionId);
    if (session instanceof RemoteNewSession) {
      const { modelOption, isResolved } = session.getModelOptionsSnapshot();
      const models2 = modelOption?.group.items.map((item) => this._toSyntheticModel(item)) ?? [];
      return { models: models2, desiredModelResolution: resolveModelIdentifier(models2, desiredModelId, isResolved), modelTarget: session.sessionType };
    }
    const sessionType = session?.sessionType;
    if (!sessionType) {
      return { models: [], desiredModelResolution: resolveModelIdentifier([], desiredModelId, false), modelTarget: void 0 };
    }
    const allModels = getRegisteredLanguageModels(this.languageModelsService);
    const models = allModels.filter((model) => model.metadata.targetChatSessionType === sessionType);
    return {
      models,
      desiredModelResolution: resolveModelIdentifierFromLanguageModels(models, desiredModelId, this.languageModelsService, allModels),
      modelTarget: sessionType
    };
  }
  getModelPickerOptions(sessionId) {
    const sessionType = this.getSession(sessionId)?.sessionType;
    const showAutoModel = !sessionType || this.chatSessionsService.supportsAutoModelForSessionType(sessionType);
    return {
      useGroupedModelPicker: true,
      showFeatured: true,
      showUnavailableFeatured: false,
      showManageModelsAction: false,
      showAutoModel
    };
  }
  _toSyntheticModel(item) {
    const modelMetadata = item.modelMetadata;
    return {
      identifier: item.id,
      metadata: {
        extension: new ExtensionIdentifier(""),
        name: modelMetadata?.name ?? item.name,
        id: modelMetadata?.id ?? item.id,
        vendor: modelMetadata?.vendor ?? "",
        version: modelMetadata?.version ?? "",
        family: modelMetadata?.family ?? "",
        tooltip: modelMetadata?.tooltip ?? item.tooltip,
        pricing: modelMetadata?.pricing,
        multiplierNumeric: modelMetadata?.multiplierNumeric,
        inputCost: modelMetadata?.inputCost,
        outputCost: modelMetadata?.outputCost,
        cacheCost: modelMetadata?.cacheCost,
        cacheWriteCost: modelMetadata?.cacheWriteCost,
        longContextInputCost: modelMetadata?.longContextInputCost,
        longContextOutputCost: modelMetadata?.longContextOutputCost,
        longContextCacheCost: modelMetadata?.longContextCacheCost,
        longContextCacheWriteCost: modelMetadata?.longContextCacheWriteCost,
        priceCategory: modelMetadata?.priceCategory,
        promo: modelMetadata?.promo,
        maxInputTokens: modelMetadata?.maxInputTokens ?? 0,
        maxOutputTokens: modelMetadata?.maxOutputTokens ?? 0,
        capabilities: modelMetadata?.capabilities ? {
          vision: modelMetadata.capabilities.vision,
          toolCalling: modelMetadata.capabilities.toolCalling
        } : void 0,
        isUserSelectable: true,
        isDefaultForLocation: {}
      }
    };
  }
  setModel(sessionId, modelId) {
    const newSession = this._newSessions.get(sessionId);
    if (newSession) {
      newSession.setModelId(modelId);
      if (newSession instanceof RemoteNewSession) {
        const { modelOption } = newSession.getModelOptionsSnapshot();
        const item = modelOption?.group.items.find((i) => i.id === modelId);
        if (item) {
          newSession.setOptionValue(modelOption.group.id, item);
        }
      }
      return;
    }
    this._ensureSessionCache();
    this._findChatSession(sessionId)?.setModelId(modelId);
  }
  setMode(sessionId, modeId) {
    const setSessionMode = (session2) => {
      let mode;
      switch (modeId) {
        case ChatModeKind.Agent:
          mode = ChatMode.Agent;
          break;
        case ChatModeKind.Edit:
          mode = ChatMode.Edit;
          break;
        case ChatModeKind.Ask:
          mode = ChatMode.Ask;
          break;
        default: {
          const modes = this.chatModeService.createModes(session2.resource);
          try {
            mode = modes.findModeById(modeId) ?? modes.findModeByName(modeId);
          } finally {
            modes.dispose();
          }
          break;
        }
      }
      if (mode) {
        session2.setMode(mode);
      }
    };
    const newSession = this._newSessions.get(sessionId);
    if (newSession) {
      setSessionMode(newSession);
      return;
    }
    this._ensureSessionCache();
    const session = this._findChatSession(sessionId);
    if (session) {
      setSessionMode(session);
    }
  }
  setPermissionLevel(sessionId, level) {
    const newSession = this._newSessions.get(sessionId);
    if (newSession) {
      if (isChatPermissionLevel(level)) {
        newSession.setPermissionLevel(level);
      }
      return;
    }
    this._ensureSessionCache();
    const session = this._findChatSession(sessionId);
    if (session && isChatPermissionLevel(level)) {
      session.setPermissionLevel(level);
    }
  }
  async setIsolationMode(sessionId, mode) {
    if (mode !== "worktree" && mode !== "workspace") {
      return;
    }
    const newSession = this._newSessions.get(sessionId);
    if (newSession) {
      newSession.setIsolationMode(mode);
      return;
    }
    this._ensureSessionCache();
    this._findChatSession(sessionId)?.setIsolationMode(mode);
  }
  async setBranch(sessionId, branch) {
    const newSession = this._newSessions.get(sessionId);
    if (newSession) {
      newSession.setBranch(branch);
      return;
    }
    this._ensureSessionCache();
    this._findChatSession(sessionId)?.setBranch(branch);
  }
  // -- Session Actions --
  async archiveSession(sessionId) {
    const chatSession = this._findChatSession(sessionId);
    if (chatSession && isNewSession(chatSession)) {
      chatSession.setArchived(true);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(chatSession)] });
      return;
    }
    const agentSession = this._findAgentSession(sessionId);
    if (agentSession) {
      agentSession.setArchived(true);
    }
  }
  async unarchiveSession(sessionId) {
    const chatSession = this._findChatSession(sessionId);
    if (chatSession && isNewSession(chatSession)) {
      chatSession.setArchived(false);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(chatSession)] });
      return;
    }
    const agentSession = this._findAgentSession(sessionId);
    if (agentSession) {
      agentSession.setArchived(false);
    }
  }
  async setSessionReadState(sessionId, isRead) {
    const chatIds = this._getChatIdsInGroup(sessionId);
    const targetIds = chatIds.length > 0 ? chatIds : [sessionId];
    for (const chatId of targetIds) {
      const agentSession = this._findAgentSession(chatId);
      if (agentSession && agentSession.isRead() !== isRead) {
        agentSession.setRead(isRead);
      }
    }
  }
  async deleteSession(sessionId) {
    const chatIds = this._getChatIdsInGroup(sessionId);
    const allChatIds = /* @__PURE__ */ new Set([sessionId, ...chatIds]);
    const agentSessions = [];
    for (const chatId of allChatIds) {
      const agentSession = this._findAgentSession(chatId);
      if (agentSession) {
        agentSessions.push(agentSession);
      }
    }
    if (agentSessions.length === 0) {
      this._cleanupTempSession(sessionId);
      return;
    }
    await this._deleteAgentSessions(agentSessions);
    this._sessionGroupCache.delete(sessionId);
    this._refreshSessionCache();
  }
  async deleteSessions(sessionIds) {
    for (const sessionId of sessionIds) {
      await this.deleteSession(sessionId);
    }
  }
  async renameChat(sessionId, chatUri, title) {
    const agentSession = this.agentSessionsService.getSession(chatUri);
    if (agentSession?.providerType === CopilotCLISessionType.id) {
      await this.commandService.executeCommand("github.copilot.cli.sessions.setTitle", { resource: chatUri }, title);
      return;
    }
    if (agentSession?.providerType === AgentSessionProviders.Claude) {
      await this.commandService.executeCommand("github.copilot.claude.sessions.rename", { resource: chatUri }, title);
      return;
    }
    throw new Error("Renaming is not supported for this session type");
  }
  async renameSession(sessionId, title) {
    const session = this._findSession(sessionId);
    if (session) {
      await this.renameChat(sessionId, session.mainChat.get().resource, title);
    }
  }
  async deleteChat(sessionId, chatUri, options) {
    const session = this._findSession(sessionId);
    if (!session?.capabilities.get().supportsMultipleChats) {
      throw new Error("Deleting individual chats is not supported when multi-chat is disabled");
    }
    const chatIds = this._getChatIdsInGroup(sessionId);
    const chatId = chatIds.find((id) => {
      const chat = this._sessionCache.get(this._localIdFromchatId(id));
      return chat && chat.resource.toString() === chatUri.toString();
    });
    if (!chatId) {
      return false;
    }
    if (chatIds.length <= 1) {
      await this.deleteSession(sessionId);
      return true;
    }
    const agentSession = this._findAgentSession(chatId);
    if (agentSession) {
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
      await this._deleteAgentSessions([agentSession]);
    } else {
      const chat = this._findChatSession(chatId);
      if (chat) {
        const key = chat.resource.toString();
        this._sessionCache.delete(key);
        this._invalidateGroupingCaches();
        if (this._newSessions.has(chatId)) {
          this._newSessions.deleteAndDispose(chatId);
        }
      }
      this._sessionGroupCache.delete(sessionId);
      this._onDidGroupMembershipChange.fire({ sessionId });
      const remainingChatIds = this._getChatIdsInGroup(sessionId);
      const primaryChatId = remainingChatIds[0];
      const primaryChat = primaryChatId ? this._sessionCache.get(this._localIdFromchatId(primaryChatId)) : void 0;
      if (primaryChat) {
        this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(primaryChat)] });
      }
    }
    return true;
  }
  async _deleteAgentSessions(agentSessions) {
    const cliSessionItems = [];
    for (const agentSession of agentSessions) {
      if (agentSession.providerType === CopilotCLISessionType.id) {
        cliSessionItems.push({ resource: agentSession.resource, label: agentSession.label });
      } else {
        await this.chatService.removeHistoryEntry(agentSession.resource);
      }
    }
    if (cliSessionItems.length > 0) {
      await this.commandService.executeCommand("agents.github.copilot.cli.deleteSessions", cliSessionItems, { skipConfirmation: true });
    }
  }
  async forkChat(sessionId, _sourceChat, _turnId) {
    throw new Error(`Session '${sessionId}' does not support forking into a chat`);
  }
  async createSideChat(sessionId, _sourceChat, _turnId, _selection) {
    throw new Error(`Session '${sessionId}' does not support side chats`);
  }
  async createNewChat(sessionId, prompt) {
    const currentNewSession = this._newSessions.get(sessionId);
    if (currentNewSession) {
      const session = currentNewSession;
      let newChat;
      if (session instanceof ClaudeCodeNewSession) {
        const newItem = await this.chatSessionsService.createNewChatSessionItem(
          session.target,
          { prompt: prompt ?? "", initialSessionOptions: session.selectedOptions.size > 0 ? session.selectedOptions : void 0, untitledResource: session.resource },
          CancellationToken.None
        );
        if (!newItem) {
          throw new Error("[CopilotChatSessionsProvider] Failed to create Claude session item");
        }
        (await this._createChatSession(newItem.resource, session)).dispose();
        newChat = this._toChat(session, newItem.resource);
      } else {
        (await this._createChatSession(session.resource, session)).dispose();
        newChat = this._toChat(session);
      }
      session.mainChat.set(newChat, void 0);
      return newChat;
    }
    if (!this._isMultiChatEnabled()) {
      throw new Error(`[CopilotChatSessionsProvider] Session '${sessionId}' does not support multiple chats`);
    }
    return this._createNewSubsequentChat(sessionId);
  }
  async _createNewSubsequentChat(sessionId) {
    const chatIds = this._getChatIdsInGroup(sessionId);
    const firstChatId = chatIds[0] ?? sessionId;
    const chat = this._sessionCache.get(this._localIdFromchatId(firstChatId));
    if (!chat) {
      throw new Error(`Session '${sessionId}' not found`);
    }
    if (chat.sessionType !== CopilotCLISessionType.id) {
      throw new Error("Multiple chats per session is only supported for Copilot CLI sessions");
    }
    const workspace = chat.workspace.get();
    if (!workspace) {
      throw new Error("Chat session has no associated workspace");
    }
    const folder = workspace.folders[0];
    if (!folder) {
      throw new Error("Workspace has no folder");
    }
    const newWorkspace = this.resolveWorkspace(folder.workingDirectory);
    if (!newWorkspace) {
      throw new Error(`Cannot resolve workspace for working directory URI: ${folder.workingDirectory.toString()}`);
    }
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: `/untitled-${generateUuid()}` });
    const session = this.instantiationService.createInstance(CopilotCLISession, resource, newWorkspace, this.id);
    session.setModelId(chat.modelId.get());
    session.setIsolationMode("workspace");
    session.setOption(PARENT_SESSION_OPTION_ID, chat.resource.path.slice(1));
    session.setPermissionLevel(this._defaultPermissionLevel());
    session.setTitle(localize("new chat", "New Chat"));
    this._newSessions.set(session.sessionId, session);
    (await this._createChatSession(session.resource, session)).dispose();
    this._sessionCache.set(session.resource.toString(), session);
    this._invalidateGroupingCaches();
    this._sessionGroupCache.delete(sessionId);
    this._onDidGroupMembershipChange.fire({ sessionId });
    this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(session)] });
    return this._toChat(session);
  }
  async sendRequest(sessionId, chatResource, options) {
    const newSession = this._newSessions.get(sessionId);
    if (newSession) {
      if (!this.uriIdentityService.extUri.isEqual(newSession.mainChat.get().resource, chatResource)) {
        throw new Error("Chat resource does not match the main chat of the current new session");
      }
      return this._sendFirstChat(newSession, chatResource, options);
    }
    const session = this._findSession(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found`);
    }
    if (!session.capabilities.get().supportsMultipleChats) {
      throw new Error("Multiple chats per session is not supported");
    }
    if (!session.chats.get().some((chat) => this.uriIdentityService.extUri.isEqual(chat.resource, chatResource))) {
      throw new Error(`Chat '${chatResource.toString()}' does not belong to session '${sessionId}'`);
    }
    const key = chatResource.toString();
    const chatSession = this._sessionCache.get(key);
    if (!chatSession || !(chatSession instanceof CopilotCLISession)) {
      throw new Error(`Chat '${chatResource.toString()}' not found in session '${sessionId}'`);
    }
    return this._sendExistingChat(sessionId, chatSession, options);
  }
  async _sendFirstChat(session, chatResource, options) {
    const { query, attachedContext } = options;
    session.setTitle((options.title || query.split("\n")[0]).substring(0, 100) || localize("new session", "New Session"));
    session.setStatus(SessionStatus.InProgress);
    this._sessionCache.set(session.resource.toString(), session);
    this._invalidateGroupingCaches();
    const resourceChangesOnCommit = session instanceof CopilotCLISession || session instanceof RemoteNewSession;
    const committedKey = !resourceChangesOnCommit ? chatResource.toString() : void 0;
    if (committedKey) {
      this._inFlightCommits.add(committedKey);
    }
    const newSession = this._chatToSession(session);
    this._onDidChangeSessions.fire({ added: [newSession], removed: [], changed: [] });
    const contribution = this.chatSessionsService.getChatSessionContribution(session.target);
    const modeKind = session.chatMode?.kind ?? ChatModeKind.Agent;
    const modeIsBuiltin = session.chatMode ? isBuiltinChatMode(session.chatMode) : true;
    const modeId = modeIsBuiltin ? modeKind : "custom";
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
        telemetryModeId: modeId,
        applyCodeBlockSuggestionId: void 0,
        permissionLevel
      },
      agentIdSilent: contribution?.type,
      attachedContext,
      agentHostSessionConfig: session instanceof CopilotCLISession ? session.getAgentHostSessionConfig() : void 0
    };
    const ref = await this._updateChatSessionState(chatResource, session, sendOptions.modeInfo?.permissionLevel);
    this.logService.debug(`[CopilotChatSessionsProvider] Sending first chat for session ${session.sessionId} with options:`, {
      userSelectedModelId: sendOptions.userSelectedModelId
    });
    try {
      const result = await this.chatService.sendRequest(chatResource, query, sendOptions);
      if (result.kind === "rejected") {
        this._sessionCache.delete(session.resource.toString());
        this._invalidateGroupingCaches();
        this._sessionGroupCache.delete(session.sessionId);
        this._clearCurrentNewSessionIfMatch(
          session,
          /* leak */
          true
        );
        this._onDidChangeSessions.fire({ added: [], removed: [newSession], changed: [] });
        session.dispose();
        throw new Error(`[DefaultCopilotProvider] sendRequest rejected: ${result.reason}`);
      }
      const cts = new CancellationTokenSource();
      const responseCompletePromise = result.kind === "sent" ? result.data.responseCompletePromise : void 0;
      const responseCreatedPromise = result.kind === "sent" ? result.data.responseCreatedPromise : void 0;
      responseCreatedPromise?.then((r) => {
        if (r?.isCanceled) {
          cts.cancel();
        }
      });
      try {
        let committedResource = chatResource;
        if (resourceChangesOnCommit) {
          committedResource = await this._waitForCommittedSession(session.resource, responseCompletePromise, responseCreatedPromise, { deferred: session instanceof RemoteNewSession });
          this._inFlightCommits.add(committedResource.toString());
        }
        try {
          const committedChat = await this._waitForSessionInCache(committedResource, cts.token);
          this._sessionCache.delete(session.resource.toString());
          this._clearCurrentNewSessionIfMatch(session);
          const committedSession = this._chatToSession(committedChat);
          this._sessionGroupCache.delete(session.sessionId);
          this._onDidReplaceSession.fire({ from: newSession, to: committedSession });
          return committedSession;
        } finally {
          this._inFlightCommits.delete(committedResource.toString());
        }
      } catch (error) {
        this._clearCurrentNewSessionIfMatch(
          session,
          /* leak */
          true
        );
        if (error instanceof CancellationError) {
          session.setStatus(SessionStatus.Completed);
          this._onDidChangeSessions.fire({ added: [], removed: [], changed: [newSession] });
          return newSession;
        }
        this._sessionCache.delete(session.resource.toString());
        this._invalidateGroupingCaches();
        this._sessionGroupCache.delete(session.sessionId);
        this._onDidChangeSessions.fire({ added: [], removed: [this._chatToSession(session)], changed: [] });
        session.dispose();
        throw error;
      } finally {
        cts.dispose();
      }
    } catch (error) {
      this.logService.error(`[CopilotChatSessionsProvider] Failed to send first chat for session ${session.sessionId}:`, error);
      throw error;
    } finally {
      if (committedKey) {
        this._inFlightCommits.delete(committedKey);
      }
      ref?.dispose();
    }
  }
  async _createChatSession(resource, session, permissionLevel) {
    await this.chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
    return this._updateChatSessionState(resource, session, permissionLevel);
  }
  async _updateChatSessionState(resource, session, permissionLevel) {
    const modelRef = await this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
    if (!modelRef) {
      return Disposable.None;
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
    if (session.selectedOptions.size > 0) {
      this.chatSessionsService.updateSessionOptions(resource, session.selectedOptions);
    }
    if (permissionLevel) {
      model.inputModel.setState({ permissionLevel });
    }
    return modelRef;
  }
  /**
   * Sends a request for an existing chat session that is already registered
   * in the cache.
   */
  async _sendExistingChat(sessionId, newChatSession, options) {
    newChatSession.setStatus(SessionStatus.InProgress);
    const key = newChatSession.resource.toString();
    this._sessionGroupCache.delete(sessionId);
    this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(newChatSession)] });
    const { query, attachedContext } = options;
    const contribution = this.chatSessionsService.getChatSessionContribution(newChatSession.target);
    const sendOptions = {
      location: ChatAgentLocation.Chat,
      userSelectedModelId: newChatSession.selectedModelId,
      modeInfo: {
        kind: ChatModeKind.Agent,
        isBuiltin: true,
        modeInstructions: void 0,
        telemetryModeId: "agent",
        applyCodeBlockSuggestionId: void 0,
        permissionLevel: newChatSession.permissionLevel.get()
      },
      agentIdSilent: contribution?.type,
      attachedContext,
      agentHostSessionConfig: newChatSession.getAgentHostSessionConfig()
    };
    const ref = await this._updateChatSessionState(newChatSession.resource, newChatSession);
    try {
      const result = await this.chatService.sendRequest(newChatSession.resource, query, sendOptions);
      if (result.kind === "rejected") {
        this._sessionCache.delete(key);
        this._invalidateGroupingCaches();
        throw new Error(`[DefaultCopilotProvider] sendRequest rejected: ${result.reason}`);
      }
      const responseCompletePromise = result.kind === "sent" ? result.data.responseCompletePromise : void 0;
      const responseCreatedPromise = result.kind === "sent" ? result.data.responseCreatedPromise : void 0;
      try {
        const committedResource = await this._waitForCommittedSession(newChatSession.resource, responseCompletePromise, responseCreatedPromise);
        const committedChat = await this._waitForSessionInCache(committedResource);
        this._sessionCache.delete(key);
        this._invalidateGroupingCaches();
        this._clearCurrentNewSessionIfMatch(newChatSession);
        this._sessionGroupCache.delete(sessionId);
        this._onDidGroupMembershipChange.fire({ sessionId });
        const updatedSession = this._chatToSession(committedChat);
        this._onDidChangeSessions.fire({ added: [], removed: [], changed: [updatedSession] });
        return updatedSession;
      } catch (error) {
        this._clearCurrentNewSessionIfMatch(
          newChatSession,
          /* leak */
          true
        );
        if (error instanceof CancellationError) {
          newChatSession.setStatus(SessionStatus.Completed);
          this._sessionGroupCache.delete(sessionId);
          const updatedSession = this._chatToSession(newChatSession);
          this._onDidChangeSessions.fire({ added: [], removed: [], changed: [updatedSession] });
          return updatedSession;
        }
        this._sessionCache.delete(key);
        this._invalidateGroupingCaches();
        this._sessionGroupCache.delete(sessionId);
        newChatSession.dispose();
        const parentChatIds = this._getChatIdsInGroup(sessionId);
        const parentChatId = parentChatIds[0];
        const parentChat = parentChatId ? this._sessionCache.get(this._localIdFromchatId(parentChatId)) : void 0;
        if (parentChat) {
          this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(parentChat)] });
        }
        throw error;
      }
    } finally {
      ref.dispose();
    }
  }
  /**
   * Waits for the committed (real) URI for a session by listening to the
   * {@link IChatSessionsService.onDidCommitSession} event.
   *
   * By default the wait is bounded by response completion: if the response
   * finishes before the commit event, we fall through to a short safety
   * timeout. Cloud sessions instead pass {@link IWaitForCommitOptions.deferred}
   * because their commit is delayed by a confirmation round-trip and network
   * delegation — response completion fires early (at the confirmation) and is
   * not a signal that the commit won't come — so they skip the response race
   * and use a longer timeout.
   */
  async _waitForCommittedSession(untitledResource, responseCompletePromise, responseCreatedPromise, options) {
    const timeoutMs = options?.deferred ? 5 * 6e4 : 5e3;
    const disposables = new DisposableStore();
    try {
      const commitPromise = new Promise((resolve) => {
        disposables.add(this.chatSessionsService.onDidCommitSession((e) => {
          if (isEqual(e.original, untitledResource)) {
            resolve(e.committed);
          }
        }));
      });
      if (!options?.deferred && responseCompletePromise) {
        const committed = await Promise.race([
          commitPromise.then((uri) => ({ committed: true, uri })),
          responseCompletePromise.then(() => ({ committed: false }))
        ]);
        if (committed.committed) {
          return committed.uri;
        }
      }
      const candidates = [
        raceTimeout(commitPromise, timeoutMs).then((uri) => uri ? { kind: "commit", uri } : { kind: "timeout" })
      ];
      if (responseCreatedPromise) {
        candidates.push(responseCreatedPromise.then((r) => r?.isCanceled ? { kind: "cancelled" } : new Promise(() => {
        })));
      }
      const outcome = await Promise.race(candidates);
      if (outcome.kind === "commit") {
        return outcome.uri;
      }
      if (outcome.kind === "cancelled") {
        throw new CancellationError();
      }
      const response = responseCreatedPromise ? await responseCreatedPromise : void 0;
      if (response?.isCanceled) {
        throw new CancellationError();
      }
      throw new Error("Timed out waiting for session commit");
    } finally {
      disposables.dispose();
    }
  }
  /**
   * Waits for an {@link AgentSessionAdapter} with the given resource to appear
   * in the session cache (populated by {@link _refreshSessionCache}).
   * Only called once during session initialisation (after the commit event),
   * so the timeout has no performance impact on steady-state operations.
   */
  async _waitForSessionInCache(resource, token) {
    const key = resource.toString();
    const existing = this._sessionCache.get(key);
    if (existing instanceof AgentSessionAdapter) {
      return existing;
    }
    const disposables = new DisposableStore();
    try {
      const sessionPromise = new Promise((resolve) => {
        disposables.add(this.onDidChangeSessions((e) => {
          const cached = this._sessionCache.get(key);
          if (cached instanceof AgentSessionAdapter) {
            resolve(cached);
          }
        }));
      });
      const result = await raceTimeout(
        token ? raceCancellationError(sessionPromise, token) : sessionPromise,
        3e4
      );
      if (!result) {
        throw new Error("Timed out waiting for committed session in cache");
      }
      return result;
    } finally {
      disposables.dispose();
    }
  }
  // -- Private --
  async _browseForRepo() {
    const repoId = await this.commandService.executeCommand(OPEN_REPO_COMMAND);
    if (repoId) {
      const uri = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: "github", path: `/${repoId}/HEAD` });
      const folder = {
        root: uri,
        workingDirectory: uri,
        name: basename(uri),
        description: void 0,
        gitRepository: void 0
      };
      return {
        uri,
        label: this._labelFromUri(uri),
        icon: this._iconFromUri(uri),
        group: SESSION_WORKSPACE_GROUP_GITHUB,
        folders: [folder],
        requiresWorkspaceTrust: false,
        isVirtualWorkspace: true
      };
    }
    return void 0;
  }
  resolveWorkspace(uri) {
    if (uri.scheme !== Schemas.file && uri.scheme !== GITHUB_REMOTE_FILE_SCHEME) {
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
      label: this._labelFromUri(uri),
      description: this._descriptionFromUri(uri),
      group: uri.scheme === GITHUB_REMOTE_FILE_SCHEME ? SESSION_WORKSPACE_GROUP_GITHUB : SESSION_WORKSPACE_GROUP_LOCAL,
      icon: this._iconFromUri(uri),
      folders: [folder],
      requiresWorkspaceTrust: uri.scheme !== GITHUB_REMOTE_FILE_SCHEME,
      isVirtualWorkspace: uri.scheme === GITHUB_REMOTE_FILE_SCHEME
    };
  }
  _labelFromUri(uri) {
    return githubRemoteRepoLabel(uri) ?? basename(uri);
  }
  _descriptionFromUri(uri) {
    if (uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
      const parts = uri.path.substring(1).split("/");
      return parts.length >= 2 ? parts[0] : void 0;
    }
    return this.labelService.getUriLabel(dirname(uri), { relative: false });
  }
  _iconFromUri(uri) {
    if (uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
      return Codicon.repo;
    }
    return Codicon.folder;
  }
  _ensureSessionCache() {
    if (this._sessionCache.size > 0) {
      return;
    }
    this._refreshSessionCache();
  }
  _invalidateGroupingCaches() {
    this._chatByRawSessionIdCache = void 0;
    this._groupIdByChatIdCache = void 0;
    this._chatIdsByGroupIdCache = void 0;
  }
  _ensureGroupingCaches() {
    if (this._chatByRawSessionIdCache && this._groupIdByChatIdCache && this._chatIdsByGroupIdCache) {
      return;
    }
    const chats = Array.from(this._sessionCache.values());
    const chatByRawSessionId = /* @__PURE__ */ new Map();
    for (const chat of chats) {
      chatByRawSessionId.set(chat.resource.path.slice(1), chat);
    }
    const groupIdByChatId = /* @__PURE__ */ new Map();
    const chatsByGroupId = /* @__PURE__ */ new Map();
    const resolveGroupId = (chat) => {
      const cachedGroupId = groupIdByChatId.get(chat.sessionId);
      if (cachedGroupId) {
        return cachedGroupId;
      }
      const trail = [];
      const seen = /* @__PURE__ */ new Set();
      let current = chat;
      for (let depth = 0; depth < 100; depth++) {
        const currentCachedGroupId = groupIdByChatId.get(current.sessionId);
        if (currentCachedGroupId) {
          for (const trailChat of trail) {
            groupIdByChatId.set(trailChat.sessionId, currentCachedGroupId);
          }
          return currentCachedGroupId;
        }
        if (seen.has(current.sessionId)) {
          for (const trailChat of trail) {
            groupIdByChatId.set(trailChat.sessionId, current.sessionId);
          }
          return current.sessionId;
        }
        trail.push(current);
        seen.add(current.sessionId);
        const parentRawSessionId = this._getDirectParentRawSessionId(current);
        if (!parentRawSessionId) {
          for (const trailChat of trail) {
            groupIdByChatId.set(trailChat.sessionId, current.sessionId);
          }
          return current.sessionId;
        }
        const parentChat = chatByRawSessionId.get(parentRawSessionId);
        if (!parentChat) {
          const syntheticGroupId = this._getSyntheticGroupId(parentRawSessionId);
          for (const trailChat of trail) {
            groupIdByChatId.set(trailChat.sessionId, syntheticGroupId);
          }
          return syntheticGroupId;
        }
        current = parentChat;
      }
      groupIdByChatId.set(chat.sessionId, chat.sessionId);
      return chat.sessionId;
    };
    for (const chat of chats) {
      const groupId = resolveGroupId(chat);
      const groupChats = chatsByGroupId.get(groupId) ?? [];
      groupChats.push(chat);
      chatsByGroupId.set(groupId, groupChats);
    }
    const chatIdsByGroupId = /* @__PURE__ */ new Map();
    for (const [groupId, groupChats] of chatsByGroupId) {
      groupChats.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      chatIdsByGroupId.set(groupId, groupChats.map((chat) => chat.sessionId));
    }
    this._chatByRawSessionIdCache = chatByRawSessionId;
    this._groupIdByChatIdCache = groupIdByChatId;
    this._chatIdsByGroupIdCache = chatIdsByGroupId;
  }
  /**
   * Cleans up a temp session (one that hasn't been committed) from the cache.
   * Used when delete/archive is invoked on a session that is still pending
   * commit (e.g. was stopped before the agent created a worktree).
   */
  _cleanupTempSession(sessionId) {
    const chatSession = this._findChatSession(sessionId);
    if (!chatSession) {
      return;
    }
    const key = chatSession.resource.toString();
    this._sessionCache.delete(key);
    this._invalidateGroupingCaches();
    this._sessionGroupCache.delete(chatSession.sessionId);
    if (this._newSessions.has(chatSession.sessionId)) {
      this._newSessions.deleteAndLeak(chatSession.sessionId);
    }
    const removedSession = this._chatToSession(chatSession);
    this._sessionGroupCache.delete(chatSession.sessionId);
    this._onDidChangeSessions.fire({ added: [], removed: [removedSession], changed: [] });
    if (isNewSession(chatSession)) {
      chatSession.dispose();
    }
  }
  _refreshSessionCache() {
    const currentKeys = /* @__PURE__ */ new Set();
    const addedData = [];
    const changedData = [];
    const sessionsToMarkUnread = [];
    let cacheChanged = false;
    for (const session of this.agentSessionsService.model.sessions) {
      if (session.providerType !== AgentSessionProviders.Background && session.providerType !== AgentSessionProviders.Cloud && session.providerType !== AgentSessionProviders.Claude) {
        continue;
      }
      if (session.providerType === AgentSessionProviders.Claude && !this._isClaudeAvailable()) {
        continue;
      }
      const key = session.resource.toString();
      currentKeys.add(key);
      const existing = this._sessionCache.get(key);
      if (existing) {
        const previousStatus = existing.status.get();
        if (existing.update(session)) {
          changedData.push(existing);
        }
        const currentStatus = existing.status.get();
        if (previousStatus === SessionStatus.InProgress && currentStatus !== SessionStatus.InProgress && currentStatus !== SessionStatus.Untitled && existing.isRead.get()) {
          sessionsToMarkUnread.push(session);
        }
      } else {
        const adapter = new AgentSessionAdapter(session, this.id, this.gitHubService, this.pullRequestIconCache);
        this._sessionCache.set(key, adapter);
        addedData.push(adapter);
        cacheChanged = true;
      }
    }
    const removedData = [];
    for (const [key, adapter] of this._sessionCache) {
      if (!currentKeys.has(key) && adapter instanceof AgentSessionAdapter && !this._inFlightCommits.has(key)) {
        removedData.push(adapter);
        cacheChanged = true;
      }
    }
    let removedGroupIds;
    if (removedData.length > 0 && this._isMultiChatEnabled()) {
      removedGroupIds = /* @__PURE__ */ new Map();
      for (const removed of removedData) {
        removedGroupIds.set(removed, this._getGroupIdForChat(removed));
      }
    }
    for (const removed of removedData) {
      this._sessionCache.delete(removed.resource.toString());
    }
    if (cacheChanged) {
      this._invalidateGroupingCaches();
    }
    if (addedData.length > 0 || removedData.length > 0 || changedData.length > 0) {
      if (this._isMultiChatEnabled()) {
        this._refreshSessionCacheMultiChat(addedData, removedData, changedData, removedGroupIds);
      } else {
        this._onDidChangeSessions.fire({
          added: addedData.map((d) => this._chatToSession(d)),
          removed: removedData.map((d) => this._chatToSession(d)),
          changed: changedData.map((d) => this._chatToSession(d))
        });
      }
    }
    for (const session of sessionsToMarkUnread) {
      session.setRead(false);
    }
  }
  _refreshSessionCacheMultiChat(addedData, removedData, changedData, removedGroupIds) {
    const trulyRemovedSessions = [];
    const changedSessionIds = /* @__PURE__ */ new Set();
    for (const removed of removedData) {
      const sessionId = removedGroupIds.get(removed);
      const remainingChatIds = this._getChatIdsInGroup(sessionId);
      if (remainingChatIds.length > 0) {
        this._sessionGroupCache.delete(sessionId);
        this._onDidGroupMembershipChange.fire({ sessionId });
        if (!changedSessionIds.has(sessionId)) {
          changedSessionIds.add(sessionId);
          const primaryChat = this._sessionCache.get(this._localIdFromchatId(remainingChatIds[0]));
          if (primaryChat) {
            changedData.push(primaryChat);
          }
        }
      } else {
        this._sessionGroupCache.delete(sessionId);
        trulyRemovedSessions.push({ chat: removed, groupId: sessionId });
      }
    }
    const newSessions = [];
    for (const added of addedData) {
      const groupId = this._getGroupIdForChat(added);
      const groupChatIds = this._getChatIdsInGroup(groupId);
      if (groupChatIds.length > 1) {
        this._sessionGroupCache.delete(groupId);
        this._onDidGroupMembershipChange.fire({ sessionId: groupId });
        if (!changedSessionIds.has(groupId)) {
          changedSessionIds.add(groupId);
          changedData.push(added);
        }
      } else {
        newSessions.push(added);
      }
    }
    const seenChanged = /* @__PURE__ */ new Set();
    const deduplicatedChanged = [];
    for (const d of changedData) {
      const groupId = this._getGroupIdForChat(d);
      if (!seenChanged.has(groupId)) {
        seenChanged.add(groupId);
        deduplicatedChanged.push(d);
      }
    }
    this._onDidChangeSessions.fire({
      added: newSessions.map((d) => this._chatToSession(d)),
      removed: trulyRemovedSessions.map(({ chat, groupId }) => {
        const session = this._sessionGroupCache.get(groupId);
        this._sessionGroupCache.delete(groupId);
        return session ?? this._chatToSession(chat);
      }),
      changed: deduplicatedChanged.map((d) => this._chatToSession(d))
    });
  }
  _findChatSession(chatId) {
    const directMatch = this._sessionCache.get(this._localIdFromchatId(chatId));
    if (directMatch) {
      return directMatch;
    }
    const groupChatIds = this._getChatIdsInGroup(chatId);
    const firstChatId = groupChatIds[0];
    return firstChatId ? this._sessionCache.get(this._localIdFromchatId(firstChatId)) : void 0;
  }
  _findAgentSession(chatId) {
    const adapter = this._findChatSession(chatId);
    if (!adapter) {
      return void 0;
    }
    return this.agentSessionsService.getSession(adapter.resource);
  }
  /**
   * Returns the group ID for a given chat.
   * Grouping is derived from `sessionParentId` in metadata (for committed sessions)
   * or from `PARENT_SESSION_OPTION_ID` in selected options (for uncommitted sessions).
   * If the root chat is not loaded, a synthetic provider-scoped group ID is used.
   */
  _getGroupIdForChat(chat) {
    this._ensureGroupingCaches();
    return this._groupIdByChatIdCache?.get(chat.sessionId) ?? chat.sessionId;
  }
  /**
   * Returns all chat IDs that belong to the given group,
   * ordered by creation time (root session first).
   */
  _getChatIdsInGroup(groupId) {
    this._ensureGroupingCaches();
    return this._chatIdsByGroupIdCache?.get(groupId) ?? [];
  }
  _getDirectParentRawSessionId(chat) {
    const agentSession = this.agentSessionsService.getSession(chat.resource);
    const sessionParentId = agentSession?.metadata?.sessionParentId;
    if (typeof sessionParentId === "string" && sessionParentId.length > 0) {
      return sessionParentId;
    }
    if (isNewSession(chat)) {
      const parentOption = chat.selectedOptions.get(PARENT_SESSION_OPTION_ID);
      if (parentOption?.id) {
        return parentOption.id;
      }
    }
    return void 0;
  }
  _getSyntheticGroupId(rawSessionId) {
    return `${this.id}:group:${rawSessionId}`;
  }
  _findSession(sessionId) {
    return this._sessionGroupCache.get(sessionId);
  }
  _localIdFromchatId(chatId) {
    const prefix = `${this.id}:`;
    return chatId.startsWith(prefix) ? chatId.substring(prefix.length) : chatId;
  }
  /**
   * Get (creating on first use) the membership signal for a group, keyed by
   * `sessionId`. The group's chats observable observes this signal so a membership
   * change recomputes only the affected group; the single fan-out subscription in
   * `_groupMembershipSubscription` triggers it.
   */
  _getGroupMembershipSignal(sessionId) {
    let signal = this._groupMembershipSignals.get(sessionId);
    if (!signal) {
      signal = observableSignal(this);
      this._groupMembershipSignals.set(sessionId, signal);
    }
    return signal;
  }
  /**
   * Structural equality for a group's chat list keyed on each chat's resource.
   * `_toChat` returns a fresh wrapper on every recompute, so identity comparison
   * would always differ; comparing resources lets a recompute that produced the
   * same set of chats avoid propagating downstream. Uses the URI identity comparer
   * so scheme-specific path casing and normalization are handled consistently.
   */
  _chatArraysEqual(a, b) {
    if (a === b) {
      return true;
    }
    if (!a || !b || a.length !== b.length) {
      return false;
    }
    return a.every((chat, i) => this.uriIdentityService.extUri.isEqual(chat.resource, b[i].resource));
  }
  /**
   * Wraps a primary {@link ICopilotChatSession} and its sibling chats into an {@link ISession}.
   * When multi-chat is enabled, the `chats` observable is derived from `sessionParentId`
   * metadata and updates when group membership changes.
   * When disabled, each session has exactly one chat.
   */
  _chatToSession(chat) {
    if (!this._isMultiChatEnabled()) {
      return this._chatToSingleChatSession(chat);
    }
    const sessionId = this._getGroupIdForChat(chat);
    const cached = this._sessionGroupCache.get(sessionId);
    if (cached) {
      return cached;
    }
    const mainChatIds = this._getChatIdsInGroup(sessionId);
    const firstChatId = mainChatIds[0];
    const primaryChat = firstChatId ? this._sessionCache.get(this._localIdFromchatId(firstChatId)) ?? chat : chat;
    const mainChat = primaryChat.mainChat;
    const membershipSignal = this._getGroupMembershipSignal(sessionId);
    const groupChatsObs = derivedOpts({
      owner: this,
      equalsFn: (a, b) => this._chatArraysEqual(a, b)
    }, (reader) => {
      membershipSignal.read(reader);
      const chatIds = this._getChatIdsInGroup(sessionId);
      if (chatIds.length === 0) {
        return void 0;
      }
      const resolved = [];
      for (const id of chatIds) {
        const c = this._sessionCache.get(this._localIdFromchatId(id));
        if (c) {
          resolved.push(c);
        }
      }
      if (resolved.length === 0) {
        return void 0;
      }
      return resolved.map((c) => this._toChat(c));
    });
    const chatsObs = derived((reader) => {
      const groupChats = groupChatsObs.read(reader);
      return groupChats ?? [mainChat.read(reader)];
    });
    const session = {
      sessionId,
      resource: primaryChat.resource,
      providerId: primaryChat.providerId,
      sessionType: primaryChat.sessionType,
      icon: primaryChat.icon,
      createdAt: primaryChat.createdAt,
      workspace: primaryChat.workspace,
      hasGitRepository: primaryChat.hasGitRepository,
      title: primaryChat.title,
      updatedAt: chatsObs.map((chats, reader) => this._latestDate(chats, (c) => c.updatedAt.read(reader))),
      status: chatsObs.map((chats, reader) => this._aggregateStatus(chats, reader)),
      changesets: this._createChangesets(primaryChat.sessionType, primaryChat.workspace, chatsObs),
      changes: primaryChat.changes,
      modelId: primaryChat.modelId,
      mode: primaryChat.mode,
      loading: primaryChat.loading,
      isArchived: primaryChat.isArchived,
      isRead: chatsObs.map((chats, reader) => chats.every((c) => c.isRead.read(reader))),
      description: primaryChat.description,
      lastTurnEnd: chatsObs.map((chats, reader) => this._latestDate(chats, (c) => c.lastTurnEnd.read(reader))),
      chats: chatsObs,
      mainChat,
      capabilities: constObservable({
        supportsMultipleChats: primaryChat.sessionType === CopilotCLISessionType.id && this._isMultiChatEnabled(),
        supportsRename: this._sessionTypeSupportsRename(primaryChat.sessionType),
        supportsDelete: this._sessionTypeSupportsDelete(primaryChat.sessionType),
        // Cloud-agent sessions run worktreeCreated tasks server-side during
        // environment provisioning, so the agents-window dispatcher must
        // not re-run them. CLI / local sessions don't.
        runsWorktreeCreatedTasks: primaryChat.sessionType === CopilotCloudSessionType.id
      })
    };
    this._sessionGroupCache.set(sessionId, session);
    return session;
  }
  _chatToSingleChatSession(chat) {
    const mainChat = chat.mainChat;
    const chatsObs = mainChat.map((c) => [c]);
    const changesets = this._createChangesets(chat.sessionType, chat.workspace, chatsObs);
    return {
      sessionId: chat.sessionId,
      resource: chat.resource,
      providerId: chat.providerId,
      sessionType: chat.sessionType,
      icon: chat.icon,
      createdAt: chat.createdAt,
      workspace: chat.workspace,
      hasGitRepository: chat.hasGitRepository,
      title: chat.title,
      updatedAt: chat.updatedAt,
      status: chat.status,
      changesets,
      changes: chat.changes,
      modelId: chat.modelId,
      mode: chat.mode,
      loading: chat.loading,
      isArchived: chat.isArchived,
      isRead: chat.isRead,
      description: chat.description,
      lastTurnEnd: chat.lastTurnEnd,
      chats: chatsObs,
      mainChat,
      capabilities: constObservable({
        supportsMultipleChats: false,
        supportsRename: this._sessionTypeSupportsRename(chat.sessionType),
        supportsDelete: this._sessionTypeSupportsDelete(chat.sessionType),
        runsWorktreeCreatedTasks: chat.sessionType === CopilotCloudSessionType.id
      })
    };
  }
  /**
   * Whether {@link renameChat} can rename a session of the given type. Only
   * the CopilotCLI and Claude backends expose a rename command; others throw.
   */
  _sessionTypeSupportsRename(sessionType) {
    return sessionType === CopilotCLISessionType.id || sessionType === AgentSessionProviders.Claude;
  }
  _sessionTypeSupportsDelete(sessionType) {
    return sessionType === CopilotCLISessionType.id;
  }
  _toChat(chat, resource, interactivity = ChatInteractivity.Full) {
    return {
      resource: resource ?? chat.resource,
      createdAt: chat.createdAt,
      title: chat.title,
      updatedAt: chat.updatedAt,
      status: chat.status,
      changes: chat.changes,
      checkpoints: chat.checkpoints,
      modelId: chat.modelId,
      mode: chat.mode,
      isArchived: chat.isArchived,
      isRead: chat.isRead,
      interactivity: constObservable(interactivity),
      description: chat.description,
      lastTurnEnd: chat.lastTurnEnd
    };
  }
  _createChangesets(sessionType, workspaceObs, chatsObs) {
    return createChangesets(sessionType, workspaceObs, chatsObs, this.instantiationService);
  }
  _latestDate(chats, getter) {
    let latest;
    for (const chat of chats) {
      const d = getter(chat);
      if (d && (!latest || d > latest)) {
        latest = d;
      }
    }
    return latest;
  }
  _aggregateStatus(chats, reader) {
    for (const c of chats) {
      if (c.status.read(reader) === SessionStatus.NeedsInput) {
        return SessionStatus.NeedsInput;
      }
    }
    for (const c of chats) {
      if (c.status.read(reader) === SessionStatus.InProgress) {
        return SessionStatus.InProgress;
      }
    }
    return chats[0].status.read(reader);
  }
  _isMultiChatEnabled() {
    return this._multiChatEnabled;
  }
};
CopilotChatSessionsProvider = __decorateClass([
  __decorateParam(0, IAgentSessionsService),
  __decorateParam(1, IChatService),
  __decorateParam(2, IChatSessionsService),
  __decorateParam(3, IDialogService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ILanguageModelsService),
  __decorateParam(7, ILanguageModelToolsService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IAgentHostEnablementService),
  __decorateParam(10, ILogService),
  __decorateParam(11, IGitHubService),
  __decorateParam(12, IPullRequestIconCache),
  __decorateParam(13, ILabelService),
  __decorateParam(14, IChatModeService),
  __decorateParam(15, IUriIdentityService)
], CopilotChatSessionsProvider);
export {
  CLAUDE_CODE_ENABLED_SETTING,
  COPILOT_MULTI_CHAT_SETTING,
  COPILOT_PROVIDER_ID,
  ClaudeCodeSessionType,
  CopilotChatSessionsProvider,
  CopilotCloudSessionType,
  RemoteNewSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2NvcGlsb3RDaGF0U2Vzc2lvbnMvYnJvd3Nlci9jb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHJhY2VDYW5jZWxsYXRpb25FcnJvciwgcmFjZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZywgbWFya2Rvd25TdHJpbmdFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGNvbnN0T2JzZXJ2YWJsZSwgZGVyaXZlZCwgZGVyaXZlZE9wdHMsIElPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZVNpZ25hbCwgSVJlYWRlciwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgSVRyYW5zYWN0aW9uLCBvYnNlcnZhYmxlRnJvbVByb21pc2UsIG9ic2VydmFibGVTaWduYWwsIG9ic2VydmFibGVWYWx1ZSwgb2JzZXJ2YWJsZVZhbHVlT3B0cywgcnVuT25DaGFuZ2UsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRBZ2VudFNlc3Npb25QdWxsUmVxdWVzdFVyaSwgSUFnZW50U2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBnZXRSZXBvc2l0b3J5TmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNWaWV3ZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLCBBZ2VudFNlc3Npb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSwgSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25TdGF0dXMsIElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwLCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0sIFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbiwgSUNoYXQsIElTZXNzaW9uR2l0UmVwb3NpdG9yeSwgSVNlc3Npb25Gb2xkZXIsIElTZXNzaW9uV29ya3NwYWNlLCBJU2lkZUNoYXRTZWxlY3Rpb24sIFNlc3Npb25TdGF0dXMsIEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUsIElHaXRIdWJJbmZvLCBJU2Vzc2lvblR5cGUsIElTZXNzaW9uV29ya3NwYWNlQnJvd3NlQWN0aW9uLCBJU2Vzc2lvbkZpbGVDaGFuZ2UsIHNlc3Npb25GaWxlQ2hhbmdlc0VxdWFsLCBnaXRIdWJJbmZvRXF1YWwsIHNlc3Npb25Xb3Jrc3BhY2VFcXVhbCwgdG9TZXNzaW9uSWQsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMLCBJU2Vzc2lvbkNoYW5nZXNldCwgSUNoYXRDaGVja3BvaW50cywgQ2hhdEludGVyYWN0aXZpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCwgQ2hhdFBlcm1pc3Npb25MZXZlbCwgaXNDaGF0UGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElEZWxldGVDaGF0T3B0aW9ucywgSVNlbmRSZXF1ZXN0T3B0aW9ucywgSVNlc3Npb25DaGFuZ2VFdmVudCwgSVNlc3Npb25Nb2RlbFBpY2tlck9wdGlvbnMsIElTZXNzaW9uTW9kZWxzU25hcHNob3QsIElTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25PcHRpb25Hcm91cCB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9uZXdTZXNzaW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZSwgSUNoYXRNb2RlLCBJQ2hhdE1vZGVTZXJ2aWNlLCBpc0J1aWx0aW5DaGF0TW9kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBnZXRSZWdpc3RlcmVkTGFuZ3VhZ2VNb2RlbHMsIHJlc29sdmVNb2RlbElkZW50aWZpZXIsIHJlc29sdmVNb2RlbElkZW50aWZpZXJGcm9tTGFuZ3VhZ2VNb2RlbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbFNlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJR2l0U2VydmljZSwgSUdpdFJlcG9zaXRvcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9naXQvY29tbW9uL2dpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlLCBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHsgQ2xhdWRlUHJlZmVyQWdlbnRIb3N0QWdlbnRzU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElHaXRIdWJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZ2l0aHViL2Jyb3dzZXIvZ2l0aHViU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjb21wdXRlUHVsbFJlcXVlc3RJY29uLCBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vZ2l0aHViL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBjb21wdXRlU2Vzc2lvblB1bGxSZXF1ZXN0SWNvbiB9IGZyb20gJy4uLy4uLy4uL2dpdGh1Yi9icm93c2VyL3B1bGxSZXF1ZXN0SWNvblN0YXR1cy5qcyc7XG5pbXBvcnQgeyBJUHVsbFJlcXVlc3RJY29uQ2FjaGUgfSBmcm9tICcuLi8uLi8uLi9naXRodWIvYnJvd3Nlci9wdWxsUmVxdWVzdEljb25DYWNoZS5qcyc7XG5pbXBvcnQgeyBzdHJ1Y3R1cmFsRXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IENvcGlsb3RDTElTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2FnZW50SG9zdC9icm93c2VyL2Jhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNoYW5nZXNldHMgfSBmcm9tICcuL2NvcGlsb3RDaGF0U2Vzc2lvbnNDaGFuZ2VzZXRzLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5qcyc7XG5cbi8qKiBDbGF1ZGUgQ29kZSBzZXNzaW9uIHR5cGUgXHUyMDE0IGxvY2FsIGFnZW50IHBvd2VyZWQgYnkgQ2xhdWRlLiAqL1xuZXhwb3J0IGNvbnN0IENsYXVkZUNvZGVTZXNzaW9uVHlwZTogSVNlc3Npb25UeXBlID0ge1xuXHRpZDogJ2NsYXVkZS1jb2RlJyxcblx0bGFiZWw6IGxvY2FsaXplKCdjbGF1ZGVDb2RlJywgXCJDbGF1ZGVcIiksXG5cdGljb246IENvZGljb24uY2xhdWRlLFxufTtcblxuLyoqIENvcGlsb3QgQ2xvdWQgc2Vzc2lvbiB0eXBlIC0gY2xvdWQtaG9zdGVkIGFnZW50LiAqL1xuZXhwb3J0IGNvbnN0IENvcGlsb3RDbG91ZFNlc3Npb25UeXBlOiBJU2Vzc2lvblR5cGUgPSB7XG5cdGlkOiAnY29waWxvdC1jbG91ZC1hZ2VudCcsXG5cdGxhYmVsOiBsb2NhbGl6ZSgnY29waWxvdENsb3VkJywgXCJDbG91ZFwiKSxcblx0aWNvbjogQ29kaWNvbi5jbG91ZCxcbn07XG5cbmNvbnN0IFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0dJVEhVQiA9IGxvY2FsaXplKCdzZXNzaW9uV29ya3NwYWNlR3JvdXAuZ2l0aHViJywgXCJHaXRIdWJcIik7XG5jb25zdCBTVE9SQUdFX0tFWV9JU09MQVRJT05fTU9ERSA9ICdzZXNzaW9ucy5pc29sYXRpb25QaWNrZXIuc2VsZWN0ZWRNb2RlJztcblxuZXhwb3J0IHR5cGUgSXNvbGF0aW9uTW9kZSA9ICd3b3JrdHJlZScgfCAnd29ya3NwYWNlJztcblxuZXhwb3J0IGludGVyZmFjZSBJQ29waWxvdENoYXRTZXNzaW9uIHtcblx0LyoqIEdsb2JhbGx5IHVuaXF1ZSBzZXNzaW9uIElEIChgcHJvdmlkZXJJZDpsb2NhbElkYCkuICovXG5cdHJlYWRvbmx5IHNlc3Npb25JZDogc3RyaW5nO1xuXHQvKiogUmVzb3VyY2UgVVJJIGlkZW50aWZ5aW5nIHRoaXMgc2Vzc2lvbi4gKi9cblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcblx0LyoqIElEIG9mIHRoZSBwcm92aWRlciB0aGF0IG93bnMgdGhpcyBzZXNzaW9uLiAqL1xuXHRyZWFkb25seSBwcm92aWRlcklkOiBzdHJpbmc7XG5cdC8qKiBTZXNzaW9uIHR5cGUgSUQgKGUuZy4sICdjb3BpbG90LWNsaScsICdjb3BpbG90LWNsb3VkJywgJ2xvY2FsJykuICovXG5cdHJlYWRvbmx5IHNlc3Npb25UeXBlOiB0eXBlb2YgU2Vzc2lvblR5cGVba2V5b2YgdHlwZW9mIFNlc3Npb25UeXBlXSB8IHN0cmluZztcblx0LyoqIEljb24gZm9yIHRoaXMgc2Vzc2lvbi4gKi9cblx0cmVhZG9ubHkgaWNvbjogVGhlbWVJY29uO1xuXHQvKiogV2hlbiB0aGUgc2Vzc2lvbiB3YXMgY3JlYXRlZC4gKi9cblx0cmVhZG9ubHkgY3JlYXRlZEF0OiBEYXRlO1xuXHQvKiogV29ya3NwYWNlIHRoaXMgc2Vzc2lvbiBvcGVyYXRlcyBvbi4gKi9cblx0cmVhZG9ubHkgd29ya3NwYWNlOiBJT2JzZXJ2YWJsZTxJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZD47XG5cblx0Ly8gUmVhY3RpdmUgcHJvcGVydGllc1xuXG5cdC8qKiBTZXNzaW9uIGRpc3BsYXkgdGl0bGUgKGNoYW5nZXMgd2hlbiBhdXRvLXRpdGxlZCBvciByZW5hbWVkKS4gKi9cblx0cmVhZG9ubHkgdGl0bGU6IElPYnNlcnZhYmxlPHN0cmluZz47XG5cdC8qKiBXaGVuIHRoZSBzZXNzaW9uIHdhcyBsYXN0IHVwZGF0ZWQuICovXG5cdHJlYWRvbmx5IHVwZGF0ZWRBdDogSU9ic2VydmFibGU8RGF0ZT47XG5cdC8qKiBDdXJyZW50IHNlc3Npb24gc3RhdHVzLiAqL1xuXHRyZWFkb25seSBzdGF0dXM6IElPYnNlcnZhYmxlPFNlc3Npb25TdGF0dXM+O1xuXHQvKiogRmlsZSBjaGFuZ2VzIHByb2R1Y2VkIGJ5IHRoZSBzZXNzaW9uLiAqL1xuXHRyZWFkb25seSBjaGFuZ2VzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT47XG5cdC8qKiBDdXJyZW50bHkgc2VsZWN0ZWQgbW9kZWwgaWRlbnRpZmllci4gKi9cblx0cmVhZG9ubHkgbW9kZWxJZDogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0LyoqIEN1cnJlbnRseSBzZWxlY3RlZCBtb2RlIGlkZW50aWZpZXIgYW5kIGtpbmQuICovXG5cdHJlYWRvbmx5IG1vZGU6IElPYnNlcnZhYmxlPHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+O1xuXHQvKiogV2hldGhlciB0aGUgc2Vzc2lvbiBpcyBzdGlsbCBpbml0aWFsaXppbmcgKGUuZy4sIHJlc29sdmluZyBnaXQgcmVwb3NpdG9yeSkuICovXG5cdHJlYWRvbmx5IGxvYWRpbmc6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHQvKiogV2hldGhlciB0aGUgc2Vzc2lvbidzIHJlcG9zaXRvcnkgc3VwcG9ydHMgd29ya3RyZWUtYmFja2VkIG9wZXJhdGlvbnMuICovXG5cdHJlYWRvbmx5IGhhc0dpdFJlcG9zaXRvcnk/OiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0LyoqIFdoZXRoZXIgdGhlIHNlc3Npb24gaXMgYXJjaGl2ZWQuICovXG5cdHJlYWRvbmx5IGlzQXJjaGl2ZWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHQvKiogV2hldGhlciB0aGUgc2Vzc2lvbiBoYXMgYmVlbiByZWFkLiAqL1xuXHRyZWFkb25seSBpc1JlYWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHQvKiogU3RhdHVzIGRlc2NyaXB0aW9uIHNob3duIHdoaWxlIHRoZSBzZXNzaW9uIGlzIGFjdGl2ZSAoZS5nLiwgY3VycmVudCBhZ2VudCBhY3Rpb24pLiAqL1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogSU9ic2VydmFibGU8SU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0LyoqIFRpbWVzdGFtcCBvZiB3aGVuIHRoZSBsYXN0IGFnZW50IHR1cm4gZW5kZWQsIGlmIGFueS4gKi9cblx0cmVhZG9ubHkgbGFzdFR1cm5FbmQ6IElPYnNlcnZhYmxlPERhdGUgfCB1bmRlZmluZWQ+O1xuXHQvKiogR2l0SHViIGluZm9ybWF0aW9uIGFzc29jaWF0ZWQgd2l0aCB0aGlzIHNlc3Npb24sIGlmIGFueS4gKi9cblx0cmVhZG9ubHkgZ2l0SHViSW5mbzogSU9ic2VydmFibGU8SUdpdEh1YkluZm8gfCB1bmRlZmluZWQ+O1xuXHQvKiogQ2hlY2twb2ludHMgYXNzb2NpYXRlZCB3aXRoIHRoaXMgc2Vzc2lvbiwgaWYgYW55LiAqL1xuXHRyZWFkb25seSBjaGVja3BvaW50czogSU9ic2VydmFibGU8SUNoYXRDaGVja3BvaW50cyB8IHVuZGVmaW5lZD47XG5cblx0cmVhZG9ubHkgcGVybWlzc2lvbkxldmVsOiBJT2JzZXJ2YWJsZTxDaGF0UGVybWlzc2lvbkxldmVsPjtcblx0c2V0UGVybWlzc2lvbkxldmVsKGxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsKTogdm9pZDtcblxuXHRyZWFkb25seSBicmFuY2g6IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHNldEJyYW5jaChicmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cblx0cmVhZG9ubHkgaXNvbGF0aW9uTW9kZTogSU9ic2VydmFibGU8SXNvbGF0aW9uTW9kZSB8IHVuZGVmaW5lZD47XG5cdHNldElzb2xhdGlvbk1vZGUobW9kZTogSXNvbGF0aW9uTW9kZSk6IHZvaWQ7XG5cblx0c2V0TW9kZWxJZChtb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkO1xuXHRzZXRNb2RlKGNoYXRNb2RlOiBJQ2hhdE1vZGUgfCB1bmRlZmluZWQpOiB2b2lkO1xuXHRzZXRPcHRpb24/KG9wdGlvbklkOiBzdHJpbmcsIHZhbHVlOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0gfCBzdHJpbmcpOiB2b2lkO1xuXG5cdHJlYWRvbmx5IGdpdFJlcG9zaXRvcnk/OiBJR2l0UmVwb3NpdG9yeTtcblx0cmVhZG9ubHkgYnJhbmNoZXM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IHN0cmluZ1tdPjtcblxuXHQvKipcblx0ICogU2V0dGFibGUgb2JzZXJ2YWJsZSBob2xkaW5nIHRoZSB7QGxpbmsgSUNoYXR9IHJlcHJlc2VudGF0aW9uIG9mIHRoaXMgY2hhdC5cblx0ICogRm9yIGNvbW1pdHRlZCBjaGF0cywgdGhlIHZhbHVlIGlzIHN0YWJsZS4gRm9yIG5ldyBzZXNzaW9ucywgdGhlIHByb3ZpZGVyXG5cdCAqIHJlcGxhY2VzIHRoZSBpbml0aWFsIHZhbHVlIHZpYSB7QGxpbmsgY3JlYXRlTmV3Q2hhdH0gb25jZSB0aGUgcmVhbCBiYWNrZW5kXG5cdCAqIHJlc291cmNlIGlzIGtub3duIChlLmcuLCBDbGF1ZGUgYXNzaWducyBhIG5ldyByZXNvdXJjZSBvbiBjb21taXQpLlxuXHQgKi9cblx0cmVhZG9ubHkgbWFpbkNoYXQ6IElTZXR0YWJsZU9ic2VydmFibGU8SUNoYXQ+O1xufVxuXG5jb25zdCBPUEVOX1JFUE9fQ09NTUFORCA9ICdnaXRodWIuY29waWxvdC5jaGF0LmNsb3VkU2Vzc2lvbnMub3BlblJlcG9zaXRvcnknO1xuXG4vKiogUHJvdmlkZXIgSUQgZm9yIHRoZSBDb3BpbG90IENoYXQgU2Vzc2lvbnMgcHJvdmlkZXIuICovXG5leHBvcnQgY29uc3QgQ09QSUxPVF9QUk9WSURFUl9JRCA9ICdkZWZhdWx0LWNvcGlsb3QnO1xuXG4vKiogU2V0dGluZyBrZXkgY29udHJvbGxpbmcgd2hldGhlciB0aGUgQ29waWxvdCBwcm92aWRlciBzdXBwb3J0cyBtdWx0aXBsZSBjaGF0cyBwZXIgc2Vzc2lvbi4gKi9cbmV4cG9ydCBjb25zdCBDT1BJTE9UX01VTFRJX0NIQVRfU0VUVElORyA9ICdzZXNzaW9ucy5naXRodWIuY29waWxvdC5tdWx0aUNoYXRTZXNzaW9ucyc7XG5cbi8qKiBTZXR0aW5nIGtleSBjb250cm9sbGluZyB3aGV0aGVyIENsYXVkZSBhZ2VudCBzZXNzaW9ucyBhcmUgYXZhaWxhYmxlLiAqL1xuZXhwb3J0IGNvbnN0IENMQVVERV9DT0RFX0VOQUJMRURfU0VUVElORyA9ICdzZXNzaW9ucy5jaGF0LmNsYXVkZUFnZW50LmVuYWJsZWQnO1xuXG5jb25zdCBSRVBPU0lUT1JZX09QVElPTl9JRCA9ICdyZXBvc2l0b3J5JztcbmNvbnN0IFBBUkVOVF9TRVNTSU9OX09QVElPTl9JRCA9ICdwYXJlbnRTZXNzaW9uSWQnO1xuY29uc3QgQlJBTkNIX09QVElPTl9JRCA9ICdicmFuY2gnO1xuY29uc3QgSVNPTEFUSU9OX09QVElPTl9JRCA9ICdpc29sYXRpb24nO1xuY29uc3QgQUdFTlRfT1BUSU9OX0lEID0gJ2FnZW50JztcblxudHlwZSBOZXdTZXNzaW9uID0gQ29waWxvdENMSVNlc3Npb24gfCBSZW1vdGVOZXdTZXNzaW9uIHwgQ2xhdWRlQ29kZU5ld1Nlc3Npb247XG5cbmZ1bmN0aW9uIGlzTmV3U2Vzc2lvbihzZXNzaW9uOiBJQ29waWxvdENoYXRTZXNzaW9uKTogc2Vzc2lvbiBpcyBOZXdTZXNzaW9uIHtcblx0cmV0dXJuIHNlc3Npb24gaW5zdGFuY2VvZiBDb3BpbG90Q0xJU2Vzc2lvbiB8fCBzZXNzaW9uIGluc3RhbmNlb2YgUmVtb3RlTmV3U2Vzc2lvbiB8fCBzZXNzaW9uIGluc3RhbmNlb2YgQ2xhdWRlQ29kZU5ld1Nlc3Npb247XG59XG5cbi8qKlxuICogQnVpbGRzIGFuIHtAbGluayBJQ2hhdH0gc25hcHNob3QgZnJvbSBhbiB7QGxpbmsgSUNvcGlsb3RDaGF0U2Vzc2lvbn0uIFVzZWQgdG9cbiAqIHNlZWQgdGhlIGNoYXQncyBvd24gYG1haW5DaGF0YCBvYnNlcnZhYmxlLiBBbiBvcHRpb25hbCBgcmVzb3VyY2VgIG92ZXJyaWRlIGlzXG4gKiBzdXBwb3J0ZWQgZm9yIGNhc2VzIHdoZXJlIHRoZSBjaGF0IHJlc291cmNlIGRpZmZlcnMgZnJvbSB0aGUgc2Vzc2lvbiByZXNvdXJjZVxuICogKGUuZy4gQ2xhdWRlIGNvbW1pdHMgYSBuZXcgcmVzb3VyY2UgYXQgc2VuZCB0aW1lKS5cbiAqL1xuZnVuY3Rpb24gYnVpbGRDaGF0RnJvbVNlc3Npb24oY2hhdDogT21pdDxJQ29waWxvdENoYXRTZXNzaW9uLCAnbWFpbkNoYXQnPiwgcmVzb3VyY2U/OiBVUkkpOiBJQ2hhdCB7XG5cdHJldHVybiB7XG5cdFx0cmVzb3VyY2U6IHJlc291cmNlID8/IGNoYXQucmVzb3VyY2UsXG5cdFx0Y3JlYXRlZEF0OiBjaGF0LmNyZWF0ZWRBdCxcblx0XHR0aXRsZTogY2hhdC50aXRsZSxcblx0XHR1cGRhdGVkQXQ6IGNoYXQudXBkYXRlZEF0LFxuXHRcdHN0YXR1czogY2hhdC5zdGF0dXMsXG5cdFx0Y2hhbmdlczogY2hhdC5jaGFuZ2VzLFxuXHRcdGNoZWNrcG9pbnRzOiBjaGF0LmNoZWNrcG9pbnRzLFxuXHRcdG1vZGVsSWQ6IGNoYXQubW9kZWxJZCxcblx0XHRtb2RlOiBjaGF0Lm1vZGUsXG5cdFx0aXNBcmNoaXZlZDogY2hhdC5pc0FyY2hpdmVkLFxuXHRcdGlzUmVhZDogY2hhdC5pc1JlYWQsXG5cdFx0aW50ZXJhY3Rpdml0eTogY29uc3RPYnNlcnZhYmxlKENoYXRJbnRlcmFjdGl2aXR5LkZ1bGwpLFxuXHRcdGRlc2NyaXB0aW9uOiBjaGF0LmRlc2NyaXB0aW9uLFxuXHRcdGxhc3RUdXJuRW5kOiBjaGF0Lmxhc3RUdXJuRW5kLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBzZXRJZkNoYW5nZWQ8VD4ob2JzZXJ2YWJsZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxUPiwgdmFsdWU6IFQsIHR4OiBJVHJhbnNhY3Rpb24sIGVxdWFsczogKGE6IFQsIGI6IFQpID0+IGJvb2xlYW4gPSBPYmplY3QuaXMpOiBib29sZWFuIHtcblx0aWYgKGVxdWFscyhvYnNlcnZhYmxlLmdldCgpLCB2YWx1ZSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0b2JzZXJ2YWJsZS5zZXQodmFsdWUsIHR4LCB1bmRlZmluZWQpO1xuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gZGF0ZUVxdWFscyhhOiBEYXRlIHwgdW5kZWZpbmVkLCBiOiBEYXRlIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdHJldHVybiBhPy5nZXRUaW1lKCkgPT09IGI/LmdldFRpbWUoKTtcbn1cblxuZnVuY3Rpb24gbWFya2Rvd25TdHJpbmdFcXVhbHMoYTogSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkLCBiOiBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIGEgPT09IGIgfHwgISFhICYmICEhYiAmJiBtYXJrZG93blN0cmluZ0VxdWFsKGEsIGIpO1xufVxuXG4vKipcbiAqIExvY2FsIG5ldyBzZXNzaW9uIGZvciBCYWNrZ3JvdW5kIGFnZW50IHNlc3Npb25zLlxuICogSW1wbGVtZW50cyB7QGxpbmsgSUNvcGlsb3RDaGF0U2Vzc2lvbn0gKHNlc3Npb24gZmFjYWRlKSBhbmQgcHJvdmlkZXNcbiAqIHByZS1zZW5kIGNvbmZpZ3VyYXRpb24gbWV0aG9kcyBmb3IgdGhlIG5ldy1zZXNzaW9uIGZsb3cuXG4gKi9cbmNsYXNzIENvcGlsb3RDTElTZXNzaW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb3BpbG90Q2hhdFNlc3Npb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBDT1BJTE9UX1dPUktUUkVFX1BBVFRFUk4gPSAnY29waWxvdC13b3JrdHJlZS0nO1xuXG5cdC8vIC0tIElTZXNzaW9uRGF0YSBmaWVsZHMgLS1cblxuXHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uVHlwZTogdHlwZW9mIFNlc3Npb25UeXBlLkNvcGlsb3RDTEk7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbjtcblx0cmVhZG9ubHkgY3JlYXRlZEF0OiBEYXRlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpdGxlID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsICcnKTtcblx0cmVhZG9ubHkgdGl0bGU6IElPYnNlcnZhYmxlPHN0cmluZz4gPSB0aGlzLl90aXRsZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kZXNjcmlwdGlvbjogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZD4+O1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogSU9ic2VydmFibGU8SU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF91cGRhdGVkQXQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgbmV3IERhdGUoKSk7XG5cdHJlYWRvbmx5IHVwZGF0ZWRBdDogSU9ic2VydmFibGU8RGF0ZT4gPSB0aGlzLl91cGRhdGVkQXQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXHRyZWFkb25seSBzdGF0dXM6IElPYnNlcnZhYmxlPFNlc3Npb25TdGF0dXM+ID0gdGhpcy5fc3RhdHVzO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Blcm1pc3Npb25MZXZlbCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQpO1xuXHRyZWFkb25seSBwZXJtaXNzaW9uTGV2ZWw6IElPYnNlcnZhYmxlPENoYXRQZXJtaXNzaW9uTGV2ZWw+ID0gdGhpcy5fcGVybWlzc2lvbkxldmVsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZURhdGEgPSBvYnNlcnZhYmxlVmFsdWU8SVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IHdvcmtzcGFjZTogSU9ic2VydmFibGU8SVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ+ID0gdGhpcy5fd29ya3NwYWNlRGF0YTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9icmFuY2hPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgYnJhbmNoOiBJT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+ID0gdGhpcy5fYnJhbmNoT2JzZXJ2YWJsZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pc29sYXRpb25Nb2RlT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZTxJc29sYXRpb25Nb2RlIHwgdW5kZWZpbmVkPih0aGlzLCAnd29ya3RyZWUnKTtcblx0cmVhZG9ubHkgaXNvbGF0aW9uTW9kZTogSU9ic2VydmFibGU8SXNvbGF0aW9uTW9kZSB8IHVuZGVmaW5lZD4gPSB0aGlzLl9pc29sYXRpb25Nb2RlT2JzZXJ2YWJsZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbElkT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IG1vZGVsSWQ6IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4gPSB0aGlzLl9tb2RlbElkT2JzZXJ2YWJsZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZTx7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IGtpbmQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRyZWFkb25seSBtb2RlOiBJT2JzZXJ2YWJsZTx7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IGtpbmQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkPiA9IHRoaXMuX21vZGVPYnNlcnZhYmxlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvYWRpbmcgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdHJ1ZSk7XG5cdHJlYWRvbmx5IGxvYWRpbmc6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gdGhpcy5fbG9hZGluZztcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzR2l0UmVwb3NpdG9yeSA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cdHJlYWRvbmx5IGhhc0dpdFJlcG9zaXRvcnk6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gdGhpcy5faGFzR2l0UmVwb3NpdG9yeTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGFuZ2VzOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW10+Pjtcblx0cmVhZG9ubHkgY2hhbmdlczogSU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW10+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoZWNrcG9pbnRzOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWVPcHRzPElDaGF0Q2hlY2twb2ludHMgfCB1bmRlZmluZWQ+Pjtcblx0cmVhZG9ubHkgY2hlY2twb2ludHM6IElPYnNlcnZhYmxlPElDaGF0Q2hlY2twb2ludHMgfCB1bmRlZmluZWQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzQXJjaGl2ZWQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRyZWFkb25seSBpc0FyY2hpdmVkOiBJT2JzZXJ2YWJsZTxib29sZWFuPiA9IHRoaXMuX2lzQXJjaGl2ZWQ7XG5cdHJlYWRvbmx5IGlzUmVhZDogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdHJ1ZSk7XG5cdHJlYWRvbmx5IGxhc3RUdXJuRW5kOiBJT2JzZXJ2YWJsZTxEYXRlIHwgdW5kZWZpbmVkPiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB1bmRlZmluZWQpO1xuXHRyZWFkb25seSBnaXRIdWJJbmZvOiBJT2JzZXJ2YWJsZTxJR2l0SHViSW5mbyB8IHVuZGVmaW5lZD4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdW5kZWZpbmVkKTtcblxuXHRwcml2YXRlIF9naXRSZXBvc2l0b3J5OiBJR2l0UmVwb3NpdG9yeSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfbG9hZEJyYW5jaGVzQ3RzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPENhbmNlbGxhdGlvblRva2VuU291cmNlPigpKTtcblxuXHQvLyAtLSBCcmFuY2ggc3RhdGUgLS1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9icmFuY2hlcyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBzdHJpbmdbXT4odGhpcywgW10pO1xuXHRyZWFkb25seSBicmFuY2hlczogSU9ic2VydmFibGU8cmVhZG9ubHkgc3RyaW5nW10+ID0gdGhpcy5fYnJhbmNoZXM7XG5cblx0cmVhZG9ubHkgbWFpbkNoYXQ6IElTZXR0YWJsZU9ic2VydmFibGU8SUNoYXQ+O1xuXG5cdHByaXZhdGUgX2RlZmF1bHRCcmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvLyAtLSBOZXcgc2Vzc2lvbiBjb25maWd1cmF0aW9uIGZpZWxkcyAtLVxuXG5cdHByaXZhdGUgX3JlcG9Vcmk6IFVSSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNvbGF0aW9uTW9kZTogSXNvbGF0aW9uTW9kZTtcblx0cHJpdmF0ZSBfYnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX21vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbW9kZTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9xdWVyeTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hdHRhY2hlZENvbnRleHQ6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSB8IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSB0YXJnZXQgPSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZDtcblx0cmVhZG9ubHkgc2VsZWN0ZWRPcHRpb25zID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbT4oKTtcblxuXHRnZXQgc2VsZWN0ZWRNb2RlbElkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9tb2RlbElkOyB9XG5cdGdldCBjaGF0TW9kZSgpOiBJQ2hhdE1vZGUgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fbW9kZTsgfVxuXHRnZXQgcXVlcnkoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3F1ZXJ5OyB9XG5cdGdldCBhdHRhY2hlZENvbnRleHQoKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2F0dGFjaGVkQ29udGV4dDsgfVxuXHRnZXQgZ2l0UmVwb3NpdG9yeSgpOiBJR2l0UmVwb3NpdG9yeSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9naXRSZXBvc2l0b3J5OyB9XG5cdGdldCBkaXNhYmxlZCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX3JlcG9VcmkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faXNvbGF0aW9uTW9kZSA9PT0gJ3dvcmt0cmVlJyAmJiAhdGhpcy5fYnJhbmNoKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSSxcblx0XHRyZWFkb25seSBzZXNzaW9uV29ya3NwYWNlOiBJU2Vzc2lvbldvcmtzcGFjZSxcblx0XHRwcm92aWRlcklkOiBzdHJpbmcsXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElHaXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZ2l0U2VydmljZTogSUdpdFNlcnZpY2UsXG5cdFx0QElHaXRIdWJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZ2l0SHViU2VydmljZTogSUdpdEh1YlNlcnZpY2UsXG5cdFx0QElQdWxsUmVxdWVzdEljb25DYWNoZSBwcml2YXRlIHJlYWRvbmx5IHB1bGxSZXF1ZXN0SWNvbkNhY2hlOiBJUHVsbFJlcXVlc3RJY29uQ2FjaGUsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5zZXNzaW9uSWQgPSB0b1Nlc3Npb25JZChwcm92aWRlcklkLCByZXNvdXJjZSk7XG5cdFx0dGhpcy5wcm92aWRlcklkID0gcHJvdmlkZXJJZDtcblx0XHR0aGlzLnNlc3Npb25UeXBlID0gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQ7XG5cdFx0dGhpcy5pY29uID0gQ29waWxvdENMSVNlc3Npb25UeXBlLmljb247XG5cdFx0dGhpcy5jcmVhdGVkQXQgPSBuZXcgRGF0ZSgpO1xuXG5cdFx0Y29uc3QgcmVwb1VyaSA9IHNlc3Npb25Xb3Jrc3BhY2UuZm9sZGVyc1swXT8ucm9vdDtcblx0XHRpZiAocmVwb1VyaSkge1xuXHRcdFx0dGhpcy5fcmVwb1VyaSA9IHJlcG9Vcmk7XG5cdFx0XHR0aGlzLnNldE9wdGlvbihSRVBPU0lUT1JZX09QVElPTl9JRCwgcmVwb1VyaS5mc1BhdGgpO1xuXHRcdH1cblxuXHRcdC8vIFNldCBJU2Vzc2lvbkRhdGEgd29ya3NwYWNlIG9ic2VydmFibGVcblx0XHR0aGlzLl93b3Jrc3BhY2VEYXRhLnNldChzZXNzaW9uV29ya3NwYWNlLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3Qgc3RvcmVkTW9kZSA9IHN0b3JhZ2VTZXJ2aWNlLmdldChTVE9SQUdFX0tFWV9JU09MQVRJT05fTU9ERSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdGNvbnN0IGluaXRpYWxNb2RlOiBJc29sYXRpb25Nb2RlID0gc3RvcmVkTW9kZSA9PT0gJ3dvcmtzcGFjZScgPyAnd29ya3NwYWNlJyA6ICd3b3JrdHJlZSc7XG5cdFx0dGhpcy5faXNvbGF0aW9uTW9kZSA9IGluaXRpYWxNb2RlO1xuXHRcdHRoaXMuX2lzb2xhdGlvbk1vZGVPYnNlcnZhYmxlLnNldChpbml0aWFsTW9kZSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLnNldE9wdGlvbihJU09MQVRJT05fT1BUSU9OX0lELCBpbml0aWFsTW9kZSk7XG5cblx0XHQvLyBSZXNvbHZlIGdpdCByZXBvc2l0b3J5IGFzeW5jaHJvbm91c2x5XG5cdFx0dGhpcy5fcmVzb2x2ZUdpdFJlcG9zaXRvcnkoKTtcblxuXHRcdHRoaXMuX2Rlc2NyaXB0aW9uID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5kZXNjcmlwdGlvbiA9IHRoaXMuX2Rlc2NyaXB0aW9uO1xuXG5cblx0XHR0aGlzLl9jaGFuZ2VzID0gb2JzZXJ2YWJsZVZhbHVlT3B0czxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT4oeyBvd25lcjogdGhpcywgZXF1YWxzRm46IHNlc3Npb25GaWxlQ2hhbmdlc0VxdWFsIH0sIFtdKTtcblx0XHR0aGlzLmNoYW5nZXMgPSB0aGlzLl9jaGFuZ2VzO1xuXG5cdFx0dGhpcy5fY2hlY2twb2ludHMgPSBvYnNlcnZhYmxlVmFsdWVPcHRzPElDaGF0Q2hlY2twb2ludHMgfCB1bmRlZmluZWQ+KHsgb3duZXI6IHRoaXMsIGVxdWFsc0ZuOiBzdHJ1Y3R1cmFsRXF1YWxzIH0sIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5jaGVja3BvaW50cyA9IHRoaXMuX2NoZWNrcG9pbnRzO1xuXG5cdFx0dGhpcy5tYWluQ2hhdCA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdD4odGhpcywgYnVpbGRDaGF0RnJvbVNlc3Npb24odGhpcykpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUdpdFJlcG9zaXRvcnkoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVwb1VyaSA9IHRoaXMuc2Vzc2lvbldvcmtzcGFjZS5mb2xkZXJzWzBdPy5yb290O1xuXHRcdGlmIChyZXBvVXJpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9naXRSZXBvc2l0b3J5ID0gYXdhaXQgdGhpcy5naXRTZXJ2aWNlLm9wZW5SZXBvc2l0b3J5KHJlcG9VcmkpO1xuXHRcdFx0XHRpZiAoIXRoaXMuX2dpdFJlcG9zaXRvcnkpIHtcblx0XHRcdFx0XHR0aGlzLnNldElzb2xhdGlvbk1vZGUoJ3dvcmtzcGFjZScpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCF0aGlzLl9naXRSZXBvc2l0b3J5LnN0YXRlLmdldCgpLkhFQUQ/LmNvbW1pdCkge1xuXHRcdFx0XHRcdC8vIEVtcHR5IHJlcG9zaXRvcmllcyBoYXZlIG5vIEhFQUQgY29tbWl0IGFuZCBjYW5ub3QgcnVuIHdvcmt0cmVlIGlzb2xhdGlvbi5cblx0XHRcdFx0XHR0aGlzLnNldElzb2xhdGlvbk1vZGUoJ3dvcmtzcGFjZScpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gTm8gZ2l0IHJlcG9zaXRvcnkgYXZhaWxhYmxlXG5cdFx0XHRcdHRoaXMuc2V0SXNvbGF0aW9uTW9kZSgnd29ya3NwYWNlJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGdpdFJlcG9zaXRvcnkgPSB0aGlzLl9naXRSZXBvc2l0b3J5O1xuXHRcdGlmIChnaXRSZXBvc2l0b3J5KSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdHRoaXMuX2hhc0dpdFJlcG9zaXRvcnkuc2V0KCEhZ2l0UmVwb3NpdG9yeS5zdGF0ZS5yZWFkKHJlYWRlcikuSEVBRD8uY29tbWl0LCB1bmRlZmluZWQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fbG9hZEJyYW5jaGVzKGdpdFJlcG9zaXRvcnkpO1xuXG5cdFx0XHQvLyBBdXRvbWF0aWNhbGx5IHVwZGF0ZSB0aGUgc2VsZWN0ZWQgYnJhbmNoIHdoZW4gdGhlIHJlcG9zaXRvcnlcblx0XHRcdC8vIHN0YXRlIGNoYW5nZXMuIFRoaXMgaXMgZG9uZSBvbmx5IGZvciB0aGUgRm9sZGVyIHNlc3Npb25zLlxuXHRcdFx0Y29uc3QgY3VycmVudEJyYW5jaE5hbWUgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gZ2l0UmVwb3NpdG9yeS5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHJldHVybiBzdGF0ZT8uSEVBRD8uY29tbWl0ID8gc3RhdGUuSEVBRC5uYW1lIDogdW5kZWZpbmVkO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgaXNvbGF0aW9uTW9kZSA9IHRoaXMuaXNvbGF0aW9uTW9kZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChpc29sYXRpb25Nb2RlID09PSAnd29ya3RyZWUnKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY3VycmVudEJyYW5jaCA9IGN1cnJlbnRCcmFuY2hOYW1lLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0dGhpcy5zZXRCcmFuY2goY3VycmVudEJyYW5jaCA/PyB0aGlzLl9kZWZhdWx0QnJhbmNoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0dGhpcy5fbG9hZGluZy5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF9sb2FkQnJhbmNoZXMocmVwbzogSUdpdFJlcG9zaXRvcnkpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2FkQnJhbmNoZXNDdHMudmFsdWU/LmNhbmNlbCgpO1xuXHRcdGNvbnN0IGN0cyA9IHRoaXMuX2xvYWRCcmFuY2hlc0N0cy52YWx1ZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0cmVwby5nZXRSZWZzKHsgcGF0dGVybjogJ3JlZnMvaGVhZHMnIH0sIGN0cy50b2tlbikudGhlbihyZWZzID0+IHtcblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaGFzSGVhZENvbW1pdCA9ICEhcmVwby5zdGF0ZS5nZXQoKS5IRUFEPy5jb21taXQ7XG5cdFx0XHRjb25zdCBicmFuY2hlcyA9IHJlZnNcblx0XHRcdFx0Lm1hcChyID0+IHIubmFtZSlcblx0XHRcdFx0LmZpbHRlcigobmFtZSk6IG5hbWUgaXMgc3RyaW5nID0+ICEhbmFtZSlcblx0XHRcdFx0LmZpbHRlcihuYW1lID0+ICFuYW1lLmluY2x1ZGVzKENvcGlsb3RDTElTZXNzaW9uLkNPUElMT1RfV09SS1RSRUVfUEFUVEVSTikpO1xuXG5cdFx0XHRjb25zdCBkZWZhdWx0QnJhbmNoID0gaGFzSGVhZENvbW1pdFxuXHRcdFx0XHQ/IChicmFuY2hlcy5maW5kKGIgPT4gYiA9PT0gJ21haW4nKVxuXHRcdFx0XHRcdD8/IGJyYW5jaGVzLmZpbmQoYiA9PiBiID09PSAnbWFzdGVyJylcblx0XHRcdFx0XHQ/PyBicmFuY2hlcy5maW5kKGIgPT4gYiA9PT0gcmVwby5zdGF0ZS5nZXQoKS5IRUFEPy5uYW1lKVxuXHRcdFx0XHRcdD8/IGJyYW5jaGVzWzBdKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdFx0dGhpcy5fZGVmYXVsdEJyYW5jaCA9IGRlZmF1bHRCcmFuY2g7XG5cblx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0dGhpcy5fYnJhbmNoZXMuc2V0KGJyYW5jaGVzLCB0eCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKGRlZmF1bHRCcmFuY2ggJiYgIXRoaXMuX2JyYW5jaCkge1xuXHRcdFx0XHR0aGlzLnNldEJyYW5jaChkZWZhdWx0QnJhbmNoKTtcblx0XHRcdH1cblx0XHR9KS5jYXRjaCgoKSA9PiB7XG5cdFx0XHRpZiAoIWN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fYnJhbmNoZXMuc2V0KFtdLCB0eCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0c2V0SXNvbGF0aW9uTW9kZShtb2RlOiBJc29sYXRpb25Nb2RlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzb2xhdGlvbk1vZGUgIT09IG1vZGUpIHtcblx0XHRcdHRoaXMuX2lzb2xhdGlvbk1vZGUgPSBtb2RlO1xuXHRcdFx0dGhpcy5faXNvbGF0aW9uTW9kZU9ic2VydmFibGUuc2V0KG1vZGUsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLnNldE9wdGlvbihJU09MQVRJT05fT1BUSU9OX0lELCBtb2RlKTtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU1RPUkFHRV9LRVlfSVNPTEFUSU9OX01PREUsIG1vZGUsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0XHRpZiAobW9kZSA9PT0gJ3dvcmtzcGFjZScpIHtcblx0XHRcdFx0Ly8gV2hlbiBzd2l0Y2hpbmcgdG8gd29ya3NwYWNlIG1vZGUsIHVwZGF0ZSB0aGUgYnJhbmNoXG5cdFx0XHRcdC8vIHNlbGVjdGlvbiB0byByZWZsZWN0IHRoZSBjdXJyZW50IGJyYW5jaCBhcyB0aGF0IGlzXG5cdFx0XHRcdC8vIHdoYXQgd2lsbCBiZSB1c2VkIGZvciB0aGUgZm9sZGVyIHNlc3Npb25cblx0XHRcdFx0Y29uc3QgaGVhZCA9IHRoaXMuX2dpdFJlcG9zaXRvcnk/LnN0YXRlLmdldCgpLkhFQUQ7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRCcmFuY2ggPSBoZWFkPy5jb21taXQgPyBoZWFkLm5hbWUgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuc2V0QnJhbmNoKGN1cnJlbnRCcmFuY2ggPz8gdGhpcy5fZGVmYXVsdEJyYW5jaCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnNldEJyYW5jaCh0aGlzLl9kZWZhdWx0QnJhbmNoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRzZXRCcmFuY2goYnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYnJhbmNoICE9PSBicmFuY2gpIHtcblx0XHRcdHRoaXMuX2JyYW5jaCA9IGJyYW5jaDtcblx0XHRcdHRoaXMuX2JyYW5jaE9ic2VydmFibGUuc2V0KGJyYW5jaCwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuc2V0T3B0aW9uKEJSQU5DSF9PUFRJT05fSUQsIGJyYW5jaCA/PyAnJyk7XG5cdFx0fVxuXHR9XG5cblx0c2V0TW9kZWxJZChtb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlbElkID0gbW9kZWxJZDtcblx0XHR0aGlzLl9tb2RlbElkT2JzZXJ2YWJsZS5zZXQobW9kZWxJZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldE1vZGVCeUlkKG1vZGVJZDogc3RyaW5nLCBtb2RlS2luZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZU9ic2VydmFibGUuc2V0KHsgaWQ6IG1vZGVJZCwga2luZDogbW9kZUtpbmQgfSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldFBlcm1pc3Npb25MZXZlbChsZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbCk6IHZvaWQge1xuXHRcdHRoaXMuX3Blcm1pc3Npb25MZXZlbC5zZXQobGV2ZWwsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRUaXRsZSh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdGl0bGUuc2V0KHRpdGxlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0U3RhdHVzKHN0YXR1czogU2Vzc2lvblN0YXR1cyk6IHZvaWQge1xuXHRcdHRoaXMuX3N0YXR1cy5zZXQoc3RhdHVzLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0QXJjaGl2ZWQoYXJjaGl2ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9pc0FyY2hpdmVkLnNldChhcmNoaXZlZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldE1vZGUobW9kZTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX21vZGU/LmlkICE9PSBtb2RlPy5pZCkge1xuXHRcdFx0dGhpcy5fbW9kZSA9IG1vZGU7XG5cdFx0XHRjb25zdCBtb2RlTmFtZSA9IG1vZGU/LmlzQnVpbHRpbiA/IHVuZGVmaW5lZCA6IG1vZGU/Lm5hbWUuZ2V0KCk7XG5cdFx0XHR0aGlzLnNldE9wdGlvbihBR0VOVF9PUFRJT05fSUQsIG1vZGVOYW1lID8/ICcnKTtcblx0XHR9XG5cdH1cblxuXHRnZXRBZ2VudEhvc3RTZXNzaW9uQ29uZmlnKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcblx0XHRjb25zdCBjb25maWc6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge1xuXHRcdFx0W1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTogdGhpcy5faXNvbGF0aW9uTW9kZSA9PT0gJ3dvcmt0cmVlJyA/ICd3b3JrdHJlZScgOiAnZm9sZGVyJyxcblx0XHR9O1xuXHRcdGlmICh0aGlzLl9pc29sYXRpb25Nb2RlID09PSAnd29ya3RyZWUnICYmIHRoaXMuX2JyYW5jaCkge1xuXHRcdFx0Y29uZmlnW1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXSA9IHRoaXMuX2JyYW5jaDtcblxuXHRcdFx0Ly8gRm9yd2FyZCB0aGUgdXNlcidzIGBnaXQuYnJhbmNoUHJlZml4YCAocmVzb3VyY2Utc2NvcGVkIHRvIHRoZVxuXHRcdFx0Ly8gcmVwb3NpdG9yeSkgc28gdGhlIGFnZW50IGhvc3QgcHJlcGVuZHMgaXQgdG8gdGhlIHdvcmt0cmVlIGJyYW5jaFxuXHRcdFx0Ly8gaXQgY3JlYXRlcy4gT21pdCB3aGVuIHVuc2V0L2VtcHR5IHRvIHByZXNlcnZlIHRoZSBkZWZhdWx0IG5hbWluZy5cblx0XHRcdGNvbnN0IGJyYW5jaFByZWZpeCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignZ2l0LmJyYW5jaFByZWZpeCcsIHsgcmVzb3VyY2U6IHRoaXMuX3JlcG9VcmkgfSk7XG5cdFx0XHRpZiAodHlwZW9mIGJyYW5jaFByZWZpeCA9PT0gJ3N0cmluZycgJiYgYnJhbmNoUHJlZml4Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uZmlnW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hQcmVmaXhdID0gYnJhbmNoUHJlZml4O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB3b3JrdHJlZUluY2x1ZGVGaWxlcyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nW10+KCdnaXQud29ya3RyZWVJbmNsdWRlRmlsZXMnLCB7IHJlc291cmNlOiB0aGlzLl9yZXBvVXJpIH0pO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkod29ya3RyZWVJbmNsdWRlRmlsZXMpICYmIHdvcmt0cmVlSW5jbHVkZUZpbGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uZmlnW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVJbmNsdWRlRmlsZXNdID0gd29ya3RyZWVJbmNsdWRlRmlsZXM7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb25maWc7XG5cdH1cblxuXHRzZXRPcHRpb24ob3B0aW9uSWQ6IHN0cmluZywgdmFsdWU6IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbSB8IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLnNlbGVjdGVkT3B0aW9ucy5zZXQob3B0aW9uSWQsIHsgaWQ6IHZhbHVlLCBuYW1lOiB2YWx1ZSB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZWxlY3RlZE9wdGlvbnMuc2V0KG9wdGlvbklkLCB2YWx1ZSk7XG5cdFx0fVxuXHRcdHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5zZXRTZXNzaW9uT3B0aW9uKHRoaXMucmVzb3VyY2UsIG9wdGlvbklkLCB2YWx1ZSk7XG5cdH1cblxuXHR1cGRhdGUoYWdlbnRTZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogdm9pZCB7XG5cdFx0dHJhbnNhY3Rpb24oKHR4KSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gbmV3IEFnZW50U2Vzc2lvbkFkYXB0ZXIoYWdlbnRTZXNzaW9uLCB0aGlzLnByb3ZpZGVySWQsIHRoaXMuZ2l0SHViU2VydmljZSwgdGhpcy5wdWxsUmVxdWVzdEljb25DYWNoZSk7XG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VEYXRhLnNldChzZXNzaW9uLndvcmtzcGFjZS5nZXQoKSwgdHgpO1xuXHRcdFx0dGhpcy5fdGl0bGUuc2V0KHNlc3Npb24udGl0bGUuZ2V0KCksIHR4KTtcblx0XHRcdHRoaXMuX3N0YXR1cy5zZXQoc2Vzc2lvbi5zdGF0dXMuZ2V0KCksIHR4KTtcblx0XHRcdHRoaXMuX3VwZGF0ZWRBdC5zZXQoc2Vzc2lvbi51cGRhdGVkQXQuZ2V0KCksIHR4KTtcblx0XHRcdHRoaXMuX2NoYW5nZXMuc2V0KHNlc3Npb24uY2hhbmdlcy5nZXQoKSwgdHgpO1xuXHRcdFx0dGhpcy5fY2hlY2twb2ludHMuc2V0KHNlc3Npb24uY2hlY2twb2ludHMuZ2V0KCksIHR4KTtcblx0XHRcdHRoaXMuX2Rlc2NyaXB0aW9uLnNldChzZXNzaW9uLmRlc2NyaXB0aW9uLmdldCgpLCB0eCk7XG5cdFx0fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNNb2RlbE9wdGlvbkdyb3VwKGdyb3VwOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwKTogYm9vbGVhbiB7XG5cdGlmIChncm91cC5pZCA9PT0gJ21vZGVscycpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRjb25zdCBuYW1lTG93ZXIgPSBncm91cC5uYW1lLnRvTG93ZXJDYXNlKCk7XG5cdHJldHVybiBuYW1lTG93ZXIgPT09ICdtb2RlbCcgfHwgbmFtZUxvd2VyID09PSAnbW9kZWxzJztcbn1cblxuZnVuY3Rpb24gaXNSZXBvc2l0b3JpZXNPcHRpb25Hcm91cChncm91cDogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZ3JvdXAuaWQgPT09ICdyZXBvc2l0b3JpZXMnO1xufVxuXG4vKipcbiAqIFJlbW90ZSBuZXcgc2Vzc2lvbiBmb3IgQ2xvdWQgYWdlbnQgc2Vzc2lvbnMuXG4gKiBJbXBsZW1lbnRzIHtAbGluayBJQ29waWxvdENoYXRTZXNzaW9ufSAoc2Vzc2lvbiBmYWNhZGUpIGFuZCBwcm92aWRlc1xuICogcHJlLXNlbmQgY29uZmlndXJhdGlvbiBtZXRob2RzIGZvciB0aGUgbmV3LXNlc3Npb24gZmxvdy5cbiAqL1xuZXhwb3J0IGNsYXNzIFJlbW90ZU5ld1Nlc3Npb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNvcGlsb3RDaGF0U2Vzc2lvbiB7XG5cblx0Ly8gLS0gSVNlc3Npb25EYXRhIGZpZWxkcyAtLVxuXG5cdHJlYWRvbmx5IHNlc3Npb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSBwcm92aWRlcklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb25UeXBlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbjtcblx0cmVhZG9ubHkgY3JlYXRlZEF0OiBEYXRlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpdGxlID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsICcnKTtcblx0cmVhZG9ubHkgdGl0bGU6IElPYnNlcnZhYmxlPHN0cmluZz4gPSB0aGlzLl90aXRsZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF91cGRhdGVkQXQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgbmV3IERhdGUoKSk7XG5cdHJlYWRvbmx5IHVwZGF0ZWRBdDogSU9ic2VydmFibGU8RGF0ZT4gPSB0aGlzLl91cGRhdGVkQXQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXHRyZWFkb25seSBzdGF0dXM6IElPYnNlcnZhYmxlPFNlc3Npb25TdGF0dXM+ID0gdGhpcy5fc3RhdHVzO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Blcm1pc3Npb25MZXZlbCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQpO1xuXHRyZWFkb25seSBwZXJtaXNzaW9uTGV2ZWw6IElPYnNlcnZhYmxlPENoYXRQZXJtaXNzaW9uTGV2ZWw+ID0gdGhpcy5fcGVybWlzc2lvbkxldmVsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZURhdGEgPSBvYnNlcnZhYmxlVmFsdWU8SVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IHdvcmtzcGFjZTogSU9ic2VydmFibGU8SVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ+ID0gdGhpcy5fd29ya3NwYWNlRGF0YTtcblxuXHRyZWFkb25seSBjaGFuZ2VzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT4gPSBvYnNlcnZhYmxlVmFsdWVPcHRzPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPih7IG93bmVyOiB0aGlzLCBlcXVhbHNGbjogc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwgfSwgW10pO1xuXG5cdHJlYWRvbmx5IGNoZWNrcG9pbnRzOiBJT2JzZXJ2YWJsZTxJQ2hhdENoZWNrcG9pbnRzIHwgdW5kZWZpbmVkPiA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsSWRPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgbW9kZWxJZDogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPiA9IHRoaXMuX21vZGVsSWRPYnNlcnZhYmxlO1xuXG5cdHJlYWRvbmx5IG1vZGU6IElPYnNlcnZhYmxlPHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHVuZGVmaW5lZCk7XG5cblx0cmVhZG9ubHkgbG9hZGluZzogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzQXJjaGl2ZWQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRyZWFkb25seSBpc0FyY2hpdmVkOiBJT2JzZXJ2YWJsZTxib29sZWFuPiA9IHRoaXMuX2lzQXJjaGl2ZWQ7XG5cdHJlYWRvbmx5IGlzUmVhZDogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdHJ1ZSk7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBJT2JzZXJ2YWJsZTxJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ+ID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IGxhc3RUdXJuRW5kOiBJT2JzZXJ2YWJsZTxEYXRlIHwgdW5kZWZpbmVkPiA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRyZWFkb25seSBnaXRIdWJJbmZvOiBJT2JzZXJ2YWJsZTxJR2l0SHViSW5mbyB8IHVuZGVmaW5lZD4gPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgYnJhbmNoOiBJT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+ID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IGlzb2xhdGlvbk1vZGU6IElPYnNlcnZhYmxlPElzb2xhdGlvbk1vZGUgfCB1bmRlZmluZWQ+ID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IGJyYW5jaGVzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBzdHJpbmdbXT4gPSBjb25zdE9ic2VydmFibGUoW10pO1xuXHRyZWFkb25seSBnaXRSZXBvc2l0b3J5PzogSUdpdFJlcG9zaXRvcnkgfCB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgbWFpbkNoYXQ6IElTZXR0YWJsZU9ic2VydmFibGU8SUNoYXQ+O1xuXG5cdHJlYWRvbmx5IF9oYXNHaXRSZXBvID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0cmVhZG9ubHkgaGFzR2l0UmVwbzogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSB0aGlzLl9oYXNHaXRSZXBvO1xuXG5cdC8vIC0tIE5ldyBzZXNzaW9uIGNvbmZpZ3VyYXRpb24gZmllbGRzIC0tXG5cblx0cHJpdmF0ZSBfcmVwb1VyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wcm9qZWN0OiBJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9xdWVyeTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hdHRhY2hlZENvbnRleHQ6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU9wdGlvbkdyb3VwcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU9wdGlvbkdyb3VwczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZU9wdGlvbkdyb3Vwcy5ldmVudDtcblxuXHRyZWFkb25seSBzZWxlY3RlZE9wdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtPigpO1xuXG5cdGdldCBwcm9qZWN0KCk6IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3Byb2plY3Q7IH1cblx0Z2V0IHNlbGVjdGVkTW9kZWxJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fbW9kZWxJZDsgfVxuXHRnZXQgY2hhdE1vZGUoKTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRnZXQgcXVlcnkoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3F1ZXJ5OyB9XG5cdGdldCBhdHRhY2hlZENvbnRleHQoKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2F0dGFjaGVkQ29udGV4dDsgfVxuXHRnZXQgZGlzYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLl9yZXBvVXJpICYmICF0aGlzLnNlbGVjdGVkT3B0aW9ucy5oYXMoJ3JlcG9zaXRvcmllcycpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2hlbkNsYXVzZUtleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSByZXNvdXJjZTogVVJJLFxuXHRcdHJlYWRvbmx5IHNlc3Npb25Xb3Jrc3BhY2U6IElTZXNzaW9uV29ya3NwYWNlLFxuXHRcdHJlYWRvbmx5IHRhcmdldDogQWdlbnRTZXNzaW9uVGFyZ2V0LFxuXHRcdHByb3ZpZGVySWQ6IHN0cmluZyxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnNlc3Npb25JZCA9IHRvU2Vzc2lvbklkKHByb3ZpZGVySWQsIHJlc291cmNlKTtcblx0XHR0aGlzLnByb3ZpZGVySWQgPSBwcm92aWRlcklkO1xuXHRcdHRoaXMuc2Vzc2lvblR5cGUgPSB0YXJnZXQ7XG5cdFx0dGhpcy5pY29uID0gQ29waWxvdENsb3VkU2Vzc2lvblR5cGUuaWNvbjtcblx0XHR0aGlzLmNyZWF0ZWRBdCA9IG5ldyBEYXRlKCk7XG5cblx0XHR0aGlzLl91cGRhdGVXaGVuQ2xhdXNlS2V5cygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5vbkRpZENoYW5nZU9wdGlvbkdyb3VwcygoKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVXaGVuQ2xhdXNlS2V5cygpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VPcHRpb25Hcm91cHMuZmlyZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmICh0aGlzLl93aGVuQ2xhdXNlS2V5cy5zaXplID4gMCAmJiBlLmFmZmVjdHNTb21lKHRoaXMuX3doZW5DbGF1c2VLZXlzKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZU9wdGlvbkdyb3Vwcy5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU2V0IHdvcmtzcGFjZSBkYXRhXG5cdFx0dGhpcy5fd29ya3NwYWNlRGF0YS5zZXQoc2Vzc2lvbldvcmtzcGFjZSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9yZXBvVXJpID0gc2Vzc2lvbldvcmtzcGFjZS5mb2xkZXJzWzBdPy5yb290O1xuXHRcdGlmICh0aGlzLl9yZXBvVXJpKSB7XG5cdFx0XHRjb25zdCBpZCA9IHRoaXMuX3JlcG9VcmkucGF0aC5zdWJzdHJpbmcoMSk7XG5cdFx0XHR0aGlzLnNldE9wdGlvbigncmVwb3NpdG9yaWVzJywgeyBpZCwgbmFtZTogaWQgfSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5tYWluQ2hhdCA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdD4odGhpcywgYnVpbGRDaGF0RnJvbVNlc3Npb24odGhpcykpO1xuXHR9XG5cdHNldFBlcm1pc3Npb25MZXZlbChsZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbCk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdC8vIC0tIE5ldyBzZXNzaW9uIGNvbmZpZ3VyYXRpb24gbWV0aG9kcyAtLVxuXG5cdHNldElzb2xhdGlvbk1vZGUoX21vZGU6IElzb2xhdGlvbk1vZGUpOiB2b2lkIHtcblx0XHQvLyBOby1vcCBmb3IgcmVtb3RlIHNlc3Npb25zXG5cdH1cblxuXHRzZXRCcmFuY2goX2JyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Ly8gTm8tb3AgZm9yIHJlbW90ZSBzZXNzaW9uc1xuXHR9XG5cblx0c2V0TW9kZWxJZChtb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlbElkID0gbW9kZWxJZDtcblx0fVxuXG5cdHNldFRpdGxlKHRpdGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl90aXRsZS5zZXQodGl0bGUsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRTdGF0dXMoc3RhdHVzOiBTZXNzaW9uU3RhdHVzKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RhdHVzLnNldChzdGF0dXMsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRBcmNoaXZlZChhcmNoaXZlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2lzQXJjaGl2ZWQuc2V0KGFyY2hpdmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0TW9kZShfbW9kZTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Ly8gSW50ZW50aW9uYWxseSBhIG5vLW9wOiByZW1vdGUgc2Vzc2lvbnMgZG8gbm90IHN1cHBvcnQgY2xpZW50LXNpZGUgbW9kZSBzZWxlY3Rpb24uXG5cdH1cblxuXHRzZXRPcHRpb24ob3B0aW9uSWQ6IHN0cmluZywgdmFsdWU6IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbSB8IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLnNlbGVjdGVkT3B0aW9ucy5zZXQob3B0aW9uSWQsIHZhbHVlKTtcblx0XHR9XG5cdFx0dGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLnNldFNlc3Npb25PcHRpb24odGhpcy5yZXNvdXJjZSwgb3B0aW9uSWQsIHZhbHVlKTtcblx0fVxuXG5cdC8vIC0tLSBPcHRpb24gZ3JvdXAgYWNjZXNzb3JzIC0tLVxuXG5cdGdldE1vZGVsT3B0aW9uc1NuYXBzaG90KCk6IHsgcmVhZG9ubHkgbW9kZWxPcHRpb246IElTZXNzaW9uT3B0aW9uR3JvdXAgfCB1bmRlZmluZWQ7IHJlYWRvbmx5IGlzUmVzb2x2ZWQ6IGJvb2xlYW4gfSB7XG5cdFx0Y29uc3QgZ3JvdXBzID0gdGhpcy5fZ2V0T3B0aW9uR3JvdXBzKCk7XG5cdFx0aWYgKCFncm91cHMpIHtcblx0XHRcdHJldHVybiB7IG1vZGVsT3B0aW9uOiB1bmRlZmluZWQsIGlzUmVzb2x2ZWQ6IGZhbHNlIH07XG5cdFx0fVxuXHRcdGNvbnN0IGdyb3VwID0gZ3JvdXBzLmZpbmQoZyA9PiBpc01vZGVsT3B0aW9uR3JvdXAoZykpO1xuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdHJldHVybiB7IG1vZGVsT3B0aW9uOiB1bmRlZmluZWQsIGlzUmVzb2x2ZWQ6IHRydWUgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgbW9kZWxPcHRpb246IHsgZ3JvdXAsIHZhbHVlOiB0aGlzLl9nZXRWYWx1ZUZvckdyb3VwKGdyb3VwKSB9LCBpc1Jlc29sdmVkOiB0cnVlIH07XG5cdH1cblxuXHRnZXRPdGhlck9wdGlvbkdyb3VwcygpOiBJU2Vzc2lvbk9wdGlvbkdyb3VwW10ge1xuXHRcdGNvbnN0IGdyb3VwcyA9IHRoaXMuX2dldE9wdGlvbkdyb3VwcygpO1xuXHRcdGlmICghZ3JvdXBzKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiBncm91cHNcblx0XHRcdC5maWx0ZXIoZyA9PiAhaXNNb2RlbE9wdGlvbkdyb3VwKGcpICYmICFpc1JlcG9zaXRvcmllc09wdGlvbkdyb3VwKGcpICYmIHRoaXMuX2lzT3B0aW9uR3JvdXBWaXNpYmxlKGcpKVxuXHRcdFx0Lm1hcChnID0+ICh7IGdyb3VwOiBnLCB2YWx1ZTogdGhpcy5fZ2V0VmFsdWVGb3JHcm91cChnKSB9KSk7XG5cdH1cblxuXHRnZXRPcHRpb25WYWx1ZShncm91cElkOiBzdHJpbmcpOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnNlbGVjdGVkT3B0aW9ucy5nZXQoZ3JvdXBJZCk7XG5cdH1cblxuXHRzZXRPcHRpb25WYWx1ZShncm91cElkOiBzdHJpbmcsIHZhbHVlOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0pOiB2b2lkIHtcblx0XHR0aGlzLnNldE9wdGlvbihncm91cElkLCB2YWx1ZSk7XG5cdH1cblxuXHQvLyAtLS0gSW50ZXJuYWxzIC0tLVxuXG5cdHByaXZhdGUgX2dldE9wdGlvbkdyb3VwcygpOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwW10gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0T3B0aW9uR3JvdXBzRm9yU2Vzc2lvblR5cGUodGhpcy50YXJnZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNPcHRpb25Hcm91cFZpc2libGUoZ3JvdXA6IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXApOiBib29sZWFuIHtcblx0XHRpZiAoIWdyb3VwLndoZW4pIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBleHByID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoZ3JvdXAud2hlbik7XG5cdFx0cmV0dXJuICFleHByIHx8IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhleHByKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVdoZW5DbGF1c2VLZXlzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3doZW5DbGF1c2VLZXlzLmNsZWFyKCk7XG5cdFx0Y29uc3QgZ3JvdXBzID0gdGhpcy5fZ2V0T3B0aW9uR3JvdXBzKCk7XG5cdFx0aWYgKCFncm91cHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcblx0XHRcdGlmIChncm91cC53aGVuKSB7XG5cdFx0XHRcdGNvbnN0IGV4cHIgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShncm91cC53aGVuKTtcblx0XHRcdFx0aWYgKGV4cHIpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBleHByLmtleXMoKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fd2hlbkNsYXVzZUtleXMuYWRkKGtleSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VmFsdWVGb3JHcm91cChncm91cDogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cCk6IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2VsZWN0ZWQgPSB0aGlzLnNlbGVjdGVkT3B0aW9ucy5nZXQoZ3JvdXAuaWQpO1xuXHRcdGlmIChzZWxlY3RlZCkge1xuXHRcdFx0cmV0dXJuIHNlbGVjdGVkO1xuXHRcdH1cblx0XHQvLyBDaGVjayBmb3IgZXh0ZW5zaW9uLXNldCBzZXNzaW9uIG9wdGlvblxuXHRcdGNvbnN0IHNlc3Npb25PcHRpb24gPSB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbih0aGlzLnJlc291cmNlLCBncm91cC5pZCk7XG5cdFx0aWYgKHNlc3Npb25PcHRpb24gJiYgdHlwZW9mIHNlc3Npb25PcHRpb24gIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gc2Vzc2lvbk9wdGlvbjtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBzZXNzaW9uT3B0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0Y29uc3QgaXRlbSA9IGdyb3VwLml0ZW1zLmZpbmQoaSA9PiBpLmlkID09PSBzZXNzaW9uT3B0aW9uLnRyaW0oKSk7XG5cdFx0XHRpZiAoaXRlbSkge1xuXHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gRGVmYXVsdCB0byBmaXJzdCBpdGVtIG1hcmtlZCBhcyBkZWZhdWx0LCBvciBmaXJzdCBpdGVtXG5cdFx0cmV0dXJuIGdyb3VwLml0ZW1zLmZpbmQoaSA9PiBpLmRlZmF1bHQgPT09IHRydWUpID8/IGdyb3VwLml0ZW1zWzBdO1xuXHR9XG5cblx0dXBkYXRlKF9zZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogdm9pZCB7IH1cbn1cblxuLyoqXG4gKiBOZXcgc2Vzc2lvbiBmb3IgQ2xhdWRlIGFnZW50IHNlc3Npb25zLlxuICogSW1wbGVtZW50cyB7QGxpbmsgSUNvcGlsb3RDaGF0U2Vzc2lvbn0gKHNlc3Npb24gZmFjYWRlKSBhbmQgcHJvdmlkZXNcbiAqIHByZS1zZW5kIGNvbmZpZ3VyYXRpb24gbWV0aG9kcyBmb3IgdGhlIG5ldy1zZXNzaW9uIGZsb3cuXG4gKiBTaW1wbGVyIHRoYW4ge0BsaW5rIENvcGlsb3RDTElTZXNzaW9ufSBiZWNhdXNlIHRoZSBDbGF1ZGUgYWdlbnQgbWFuYWdlc1xuICogaXRzIG93biB3b3JrdHJlZXMgYW5kIGJyYW5jaGVzIGF0IHJ1bnRpbWUuXG4gKi9cbmNsYXNzIENsYXVkZUNvZGVOZXdTZXNzaW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb3BpbG90Q2hhdFNlc3Npb24ge1xuXG5cdC8vIC0tIElTZXNzaW9uRGF0YSBmaWVsZHMgLS1cblxuXHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uVHlwZTogdHlwZW9mIFNlc3Npb25UeXBlLkNsYXVkZUNvZGU7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbjtcblx0cmVhZG9ubHkgY3JlYXRlZEF0OiBEYXRlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpdGxlID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsICcnKTtcblx0cmVhZG9ubHkgdGl0bGU6IElPYnNlcnZhYmxlPHN0cmluZz4gPSB0aGlzLl90aXRsZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF91cGRhdGVkQXQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgbmV3IERhdGUoKSk7XG5cdHJlYWRvbmx5IHVwZGF0ZWRBdDogSU9ic2VydmFibGU8RGF0ZT4gPSB0aGlzLl91cGRhdGVkQXQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXHRyZWFkb25seSBzdGF0dXM6IElPYnNlcnZhYmxlPFNlc3Npb25TdGF0dXM+ID0gdGhpcy5fc3RhdHVzO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Blcm1pc3Npb25MZXZlbCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQpO1xuXHRyZWFkb25seSBwZXJtaXNzaW9uTGV2ZWw6IElPYnNlcnZhYmxlPENoYXRQZXJtaXNzaW9uTGV2ZWw+ID0gdGhpcy5fcGVybWlzc2lvbkxldmVsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZURhdGEgPSBvYnNlcnZhYmxlVmFsdWU8SVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IHdvcmtzcGFjZTogSU9ic2VydmFibGU8SVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ+ID0gdGhpcy5fd29ya3NwYWNlRGF0YTtcblxuXHRyZWFkb25seSBjaGFuZ2VzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT4gPSBvYnNlcnZhYmxlVmFsdWVPcHRzPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPih7IG93bmVyOiB0aGlzLCBlcXVhbHNGbjogc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwgfSwgW10pO1xuXHRyZWFkb25seSBjaGVja3BvaW50czogSU9ic2VydmFibGU8SUNoYXRDaGVja3BvaW50cyB8IHVuZGVmaW5lZD4gPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbElkT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IG1vZGVsSWQ6IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4gPSB0aGlzLl9tb2RlbElkT2JzZXJ2YWJsZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZTx7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IGtpbmQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRyZWFkb25seSBtb2RlOiBJT2JzZXJ2YWJsZTx7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IGtpbmQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkPiA9IHRoaXMuX21vZGVPYnNlcnZhYmxlO1xuXG5cdHJlYWRvbmx5IGxvYWRpbmc6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0FyY2hpdmVkID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0cmVhZG9ubHkgaXNBcmNoaXZlZDogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSB0aGlzLl9pc0FyY2hpdmVkO1xuXHRyZWFkb25seSBpc1JlYWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHRydWUpO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogSU9ic2VydmFibGU8SU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkPiA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRyZWFkb25seSBsYXN0VHVybkVuZDogSU9ic2VydmFibGU8RGF0ZSB8IHVuZGVmaW5lZD4gPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgZ2l0SHViSW5mbzogSU9ic2VydmFibGU8SUdpdEh1YkluZm8gfCB1bmRlZmluZWQ+ID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IGJyYW5jaDogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPiA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRyZWFkb25seSBpc29sYXRpb25Nb2RlOiBJT2JzZXJ2YWJsZTxJc29sYXRpb25Nb2RlIHwgdW5kZWZpbmVkPiA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRyZWFkb25seSBicmFuY2hlczogSU9ic2VydmFibGU8cmVhZG9ubHkgc3RyaW5nW10+ID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0cmVhZG9ubHkgZ2l0UmVwb3NpdG9yeT86IElHaXRSZXBvc2l0b3J5IHwgdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG1haW5DaGF0OiBJU2V0dGFibGVPYnNlcnZhYmxlPElDaGF0PjtcblxuXHQvLyAtLSBOZXcgc2Vzc2lvbiBjb25maWd1cmF0aW9uIGZpZWxkcyAtLVxuXG5cdHByaXZhdGUgX21vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbW9kZTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IHRhcmdldCA9IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbGF1ZGU7XG5cdHJlYWRvbmx5IHNlbGVjdGVkT3B0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0+KCk7XG5cblx0Z2V0IHNlbGVjdGVkTW9kZWxJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fbW9kZWxJZDsgfVxuXHRnZXQgY2hhdE1vZGUoKTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX21vZGU7IH1cblx0Z2V0IHF1ZXJ5KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0Z2V0IGF0dGFjaGVkQ29udGV4dCgpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGdldCBkaXNhYmxlZCgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSSxcblx0XHRyZWFkb25seSBzZXNzaW9uV29ya3NwYWNlOiBJU2Vzc2lvbldvcmtzcGFjZSxcblx0XHRwcm92aWRlcklkOiBzdHJpbmcsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5zZXNzaW9uSWQgPSB0b1Nlc3Npb25JZChwcm92aWRlcklkLCByZXNvdXJjZSk7XG5cdFx0dGhpcy5wcm92aWRlcklkID0gcHJvdmlkZXJJZDtcblx0XHR0aGlzLnNlc3Npb25UeXBlID0gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsYXVkZTtcblx0XHR0aGlzLmljb24gPSBDbGF1ZGVDb2RlU2Vzc2lvblR5cGUuaWNvbjtcblx0XHR0aGlzLmNyZWF0ZWRBdCA9IG5ldyBEYXRlKCk7XG5cblx0XHR0aGlzLl93b3Jrc3BhY2VEYXRhLnNldChzZXNzaW9uV29ya3NwYWNlLCB1bmRlZmluZWQpO1xuXG5cdFx0dGhpcy5tYWluQ2hhdCA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdD4odGhpcywgYnVpbGRDaGF0RnJvbVNlc3Npb24odGhpcykpO1xuXHR9XG5cblx0c2V0T3B0aW9uKG9wdGlvbklkOiBzdHJpbmcsIHZhbHVlOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0gfCBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5zZWxlY3RlZE9wdGlvbnMuc2V0KG9wdGlvbklkLCB7IGlkOiB2YWx1ZSwgbmFtZTogdmFsdWUgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2VsZWN0ZWRPcHRpb25zLnNldChvcHRpb25JZCwgdmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdHNldFBlcm1pc3Npb25MZXZlbChsZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbCk6IHZvaWQge1xuXHRcdHRoaXMuX3Blcm1pc3Npb25MZXZlbC5zZXQobGV2ZWwsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRJc29sYXRpb25Nb2RlKF9tb2RlOiBJc29sYXRpb25Nb2RlKTogdm9pZCB7XG5cdFx0Ly8gTm8tb3AgXHUyMDE0IENsYXVkZSBhZ2VudCBtYW5hZ2VzIGl0cyBvd24gd29ya3RyZWVzXG5cdH1cblxuXHRzZXRCcmFuY2goX2JyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Ly8gTm8tb3AgXHUyMDE0IENsYXVkZSBhZ2VudCBtYW5hZ2VzIGJyYW5jaGVzIGF0IHJ1bnRpbWVcblx0fVxuXG5cdHNldE1vZGVsSWQobW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxJZCA9IG1vZGVsSWQ7XG5cdFx0dGhpcy5fbW9kZWxJZE9ic2VydmFibGUuc2V0KG1vZGVsSWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRUaXRsZSh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdGl0bGUuc2V0KHRpdGxlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0U3RhdHVzKHN0YXR1czogU2Vzc2lvblN0YXR1cyk6IHZvaWQge1xuXHRcdHRoaXMuX3N0YXR1cy5zZXQoc3RhdHVzLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0QXJjaGl2ZWQoYXJjaGl2ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9pc0FyY2hpdmVkLnNldChhcmNoaXZlZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldE1vZGUobW9kZTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZSA9IG1vZGU7XG5cdFx0aWYgKG1vZGUpIHtcblx0XHRcdHRoaXMuX21vZGVPYnNlcnZhYmxlLnNldCh7IGlkOiBtb2RlLmlkLCBraW5kOiBtb2RlLmtpbmQgfSwgdW5kZWZpbmVkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbW9kZU9ic2VydmFibGUuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHR1cGRhdGUoX3Nlc3Npb246IElBZ2VudFNlc3Npb24pOiB2b2lkIHsgfVxufVxuXG4vKipcbiAqIE1hcHMgdGhlIGV4aXN0aW5nIHtAbGluayBDaGF0U2Vzc2lvblN0YXR1c30gdG8gdGhlIG5ldyB7QGxpbmsgU2Vzc2lvblN0YXR1c30uXG4gKi9cbmZ1bmN0aW9uIHRvU2Vzc2lvblN0YXR1cyhzdGF0dXM6IENoYXRTZXNzaW9uU3RhdHVzKTogU2Vzc2lvblN0YXR1cyB7XG5cdHN3aXRjaCAoc3RhdHVzKSB7XG5cdFx0Y2FzZSBDaGF0U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzOlxuXHRcdFx0cmV0dXJuIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcztcblx0XHRjYXNlIENoYXRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQ6XG5cdFx0XHRyZXR1cm4gU2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0O1xuXHRcdGNhc2UgQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkOlxuXHRcdFx0cmV0dXJuIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkO1xuXHRcdGNhc2UgQ2hhdFNlc3Npb25TdGF0dXMuRmFpbGVkOlxuXHRcdFx0cmV0dXJuIFNlc3Npb25TdGF0dXMuRXJyb3I7XG5cdH1cbn1cblxuLyoqXG4gKiBEaXNwbGF5IGxhYmVsIGZvciBhIGBnaXRodWItcmVtb3RlLWZpbGU6Ly9gIHJlcG8gVVJJLCBpbiBgb3duZXIvcmVwb2AgZm9ybS4gUmV0dXJuc1xuICogYHVuZGVmaW5lZGAgZm9yIG5vbi1HaXRIdWIgVVJJcyBzbyBjYWxsZXJzIGNhbiBmYWxsIGJhY2suIFVzZWQgYnkgYm90aCB0aGUgbmV3LXNlc3Npb25cbiAqIHdvcmtzcGFjZSAoe0BsaW5rIENvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlci5yZXNvbHZlV29ya3NwYWNlfSkgYW5kIHRoZSBjb21taXR0ZWRcbiAqIHNlc3Npb24gYWRhcHRlciAoe0BsaW5rIEFnZW50U2Vzc2lvbkFkYXB0ZXIuX2J1aWxkV29ya3NwYWNlfSkgc28gYSBjbG91ZCBzZXNzaW9uIGdyb3Vwc1xuICogdW5kZXIgdGhlIHNhbWUgYG93bmVyL3JlcG9gIGxhYmVsIGJlZm9yZSBhbmQgYWZ0ZXIgY29tbWl0LlxuICogVE9ETzogYXQgc29tZSBwb2ludCB0aGlzIHNob3VsZCBiZSBzdGFuZGFyZGl6ZWQgYW5kIGluIHRoZSBzYW1lIGxpc3QgYXMgYWxsIHNlc3Npb25zLlxuICogRG9pbmcgaXQgdGhpcyB3YXkgZm9yIG5vdyBqdXN0IHRvIGtlZXAgc3VwcG9ydGluZyB0aGUgbmV3IGNoYXQgYnV0dG9uIGZyb20gdGhlIGdyb3VwLlxuICovXG5mdW5jdGlvbiBnaXRodWJSZW1vdGVSZXBvTGFiZWwodXJpOiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAodXJpLnNjaGVtZSAhPT0gR0lUSFVCX1JFTU9URV9GSUxFX1NDSEVNRSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Ly8gUGF0aCBpcyBgLzxvd25lcj4vPHJlcG8+Wy88cmVmPlx1MjAyNl1gOyB0YWtlIHRoZSBmaXJzdCB0d28gc2VnbWVudHMuXG5cdGNvbnN0IHBhcnRzID0gdXJpLnBhdGgucmVwbGFjZSgvXlxcLy8sICcnKS5zcGxpdCgnLycpO1xuXHRyZXR1cm4gcGFydHMubGVuZ3RoID49IDIgPyBgJHtwYXJ0c1swXX0vJHtwYXJ0c1sxXX1gIDogdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEFkYXB0cyBhbiBleGlzdGluZyB7QGxpbmsgSUFnZW50U2Vzc2lvbn0gZnJvbSB0aGUgY2hhdCBsYXllciBpbnRvIHRoZSBuZXcge0BsaW5rIElDb3BpbG90Q2hhdFNlc3Npb259IGZhY2FkZS5cbiAqL1xuY2xhc3MgQWdlbnRTZXNzaW9uQWRhcHRlciBpbXBsZW1lbnRzIElDb3BpbG90Q2hhdFNlc3Npb24ge1xuXG5cdHJlYWRvbmx5IHNlc3Npb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBwcm92aWRlcklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb25UeXBlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbjtcblx0cmVhZG9ubHkgY3JlYXRlZEF0OiBEYXRlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZTogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IHdvcmtzcGFjZTogSU9ic2VydmFibGU8SVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpdGxlOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nPj47XG5cdHJlYWRvbmx5IHRpdGxlOiBJT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZWRBdDogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPERhdGU+Pjtcblx0cmVhZG9ubHkgdXBkYXRlZEF0OiBJT2JzZXJ2YWJsZTxEYXRlPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0dXM6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxTZXNzaW9uU3RhdHVzPj47XG5cdHJlYWRvbmx5IHN0YXR1czogSU9ic2VydmFibGU8U2Vzc2lvblN0YXR1cz47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2hhbmdlczogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPj47XG5cdHJlYWRvbmx5IGNoYW5nZXM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGVja3BvaW50czogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlT3B0czxJQ2hhdENoZWNrcG9pbnRzIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IGNoZWNrcG9pbnRzOiBJT2JzZXJ2YWJsZTxJQ2hhdENoZWNrcG9pbnRzIHwgdW5kZWZpbmVkPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbElkOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IG1vZGVsSWQ6IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IG1vZGU6IElPYnNlcnZhYmxlPHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBsb2FkaW5nOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0FyY2hpdmVkOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4+O1xuXHRyZWFkb25seSBpc0FyY2hpdmVkOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pc1JlYWQ6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxib29sZWFuPj47XG5cdHJlYWRvbmx5IGlzUmVhZDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGVzY3JpcHRpb246IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ+Pjtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IElPYnNlcnZhYmxlPElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGFzdFR1cm5FbmQ6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxEYXRlIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IGxhc3RUdXJuRW5kOiBJT2JzZXJ2YWJsZTxEYXRlIHwgdW5kZWZpbmVkPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9iYXNlR2l0SHViSW5mbzogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkPj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3B1bGxSZXF1ZXN0QnJhbmNoOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3B1bGxSZXF1ZXN0TnVtYmVyRnJvbUJyYW5jaDogSU9ic2VydmFibGU8SU9ic2VydmFibGU8eyByZWFkb25seSB2YWx1ZT86IG51bWJlciB8IHVuZGVmaW5lZCB9PiB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3B1bGxSZXF1ZXN0TnVtYmVyQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgSU9ic2VydmFibGU8eyByZWFkb25seSB2YWx1ZT86IG51bWJlciB8IHVuZGVmaW5lZCB9Pj4oKTtcblx0cmVhZG9ubHkgZ2l0SHViSW5mbzogSU9ic2VydmFibGU8SUdpdEh1YkluZm8gfCB1bmRlZmluZWQ+O1xuXG5cdHJlYWRvbmx5IHBlcm1pc3Npb25MZXZlbDogSU9ic2VydmFibGU8Q2hhdFBlcm1pc3Npb25MZXZlbD4gPSBjb25zdE9ic2VydmFibGUoQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0KTtcblx0cmVhZG9ubHkgYnJhbmNoOiBJT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+ID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IGlzb2xhdGlvbk1vZGU6IElPYnNlcnZhYmxlPElzb2xhdGlvbk1vZGUgfCB1bmRlZmluZWQ+ID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IGdpdFJlcG9zaXRvcnk/OiBJR2l0UmVwb3NpdG9yeSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgYnJhbmNoZXM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IHN0cmluZ1tdPiA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cblx0cmVhZG9ubHkgbWFpbkNoYXQ6IElTZXR0YWJsZU9ic2VydmFibGU8SUNoYXQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHNlc3Npb246IElBZ2VudFNlc3Npb24sXG5cdFx0cHJvdmlkZXJJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dpdEh1YlNlcnZpY2U6IElHaXRIdWJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3B1bGxSZXF1ZXN0SWNvbkNhY2hlOiBJUHVsbFJlcXVlc3RJY29uQ2FjaGUsXG5cdCkge1xuXHRcdHRoaXMuc2Vzc2lvbklkID0gdG9TZXNzaW9uSWQocHJvdmlkZXJJZCwgc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0dGhpcy5yZXNvdXJjZSA9IHNlc3Npb24ucmVzb3VyY2U7XG5cdFx0dGhpcy5wcm92aWRlcklkID0gcHJvdmlkZXJJZDtcblx0XHR0aGlzLnNlc3Npb25UeXBlID0gc2Vzc2lvbi5wcm92aWRlclR5cGU7XG5cdFx0dGhpcy5pY29uID0gdGhpcy5fZ2V0U2Vzc2lvblR5cGVJY29uKHNlc3Npb24pO1xuXHRcdHRoaXMuY3JlYXRlZEF0ID0gbmV3IERhdGUoc2Vzc2lvbi50aW1pbmcuY3JlYXRlZCk7XG5cblx0XHR0aGlzLl9iYXNlR2l0SHViSW5mbyA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB0aGlzLl9leHRyYWN0R2l0SHViSW5mbyhzZXNzaW9uKSk7XG5cdFx0dGhpcy5fcHVsbFJlcXVlc3RCcmFuY2ggPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdGhpcy5fZXh0cmFjdFB1bGxSZXF1ZXN0QnJhbmNoKHNlc3Npb24pKTtcblx0XHR0aGlzLl9wdWxsUmVxdWVzdE51bWJlckZyb21CcmFuY2ggPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBiYXNlID0gdGhpcy5fYmFzZUdpdEh1YkluZm8ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYnJhbmNoID0gdGhpcy5fcHVsbFJlcXVlc3RCcmFuY2gucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGJhc2U/LnB1bGxSZXF1ZXN0IHx8ICFiYXNlIHx8ICFicmFuY2gpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl9wdWxsUmVxdWVzdE51bWJlckZvckJyYW5jaChiYXNlLm93bmVyLCBiYXNlLnJlcG8sIGJyYW5jaCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5naXRIdWJJbmZvID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0bGV0IGluZm8gPSB0aGlzLl9iYXNlR2l0SHViSW5mby5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWluZm8pIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFpbmZvLnB1bGxSZXF1ZXN0KSB7XG5cdFx0XHRcdGNvbnN0IHB1bGxSZXF1ZXN0TnVtYmVyID0gdGhpcy5fcHVsbFJlcXVlc3ROdW1iZXJGcm9tQnJhbmNoLnJlYWQocmVhZGVyKT8ucmVhZChyZWFkZXIpLnZhbHVlO1xuXHRcdFx0XHRpZiAocHVsbFJlcXVlc3ROdW1iZXIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJldHVybiBpbmZvO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGluZm8gPSB7XG5cdFx0XHRcdFx0Li4uaW5mbyxcblx0XHRcdFx0XHRwdWxsUmVxdWVzdDoge1xuXHRcdFx0XHRcdFx0bnVtYmVyOiBwdWxsUmVxdWVzdE51bWJlcixcblx0XHRcdFx0XHRcdHVyaTogVVJJLnBhcnNlKGBodHRwczovL2dpdGh1Yi5jb20vJHtpbmZvLm93bmVyfS8ke2luZm8ucmVwb30vcHVsbC8ke3B1bGxSZXF1ZXN0TnVtYmVyfWApLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHVsbFJlcXVlc3QgPSBpbmZvLnB1bGxSZXF1ZXN0O1xuXHRcdFx0aWYgKCFwdWxsUmVxdWVzdCkge1xuXHRcdFx0XHRyZXR1cm4gaW5mbztcblx0XHRcdH1cblx0XHRcdGlmIChwdWxsUmVxdWVzdC51cmkuYXV0aG9yaXR5LnRvTG93ZXJDYXNlKCkgIT09ICdnaXRodWIuY29tJykge1xuXHRcdFx0XHRyZXR1cm4gaW5mbztcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLmluZm8sXG5cdFx0XHRcdHB1bGxSZXF1ZXN0OiB7XG5cdFx0XHRcdFx0Li4ucHVsbFJlcXVlc3QsXG5cdFx0XHRcdFx0aWNvbjogY29tcHV0ZVNlc3Npb25QdWxsUmVxdWVzdEljb24ocmVhZGVyLCB0aGlzLl9naXRIdWJTZXJ2aWNlLCB0aGlzLl9wdWxsUmVxdWVzdEljb25DYWNoZSwgaW5mbylcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3dvcmtzcGFjZSA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB0aGlzLl9idWlsZFdvcmtzcGFjZShzZXNzaW9uKSk7XG5cdFx0dGhpcy53b3Jrc3BhY2UgPSB0aGlzLl93b3Jrc3BhY2U7XG5cblx0XHR0aGlzLl90aXRsZSA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBzZXNzaW9uLmxhYmVsKTtcblx0XHR0aGlzLnRpdGxlID0gdGhpcy5fdGl0bGU7XG5cblx0XHRjb25zdCB1cGRhdGVkVGltZSA9IHNlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQgPz8gc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RTdGFydGVkID8/IHNlc3Npb24udGltaW5nLmNyZWF0ZWQ7XG5cdFx0dGhpcy5fdXBkYXRlZEF0ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIG5ldyBEYXRlKHVwZGF0ZWRUaW1lKSk7XG5cdFx0dGhpcy51cGRhdGVkQXQgPSB0aGlzLl91cGRhdGVkQXQ7XG5cblx0XHR0aGlzLl9zdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdG9TZXNzaW9uU3RhdHVzKHNlc3Npb24uc3RhdHVzKSk7XG5cdFx0dGhpcy5zdGF0dXMgPSB0aGlzLl9zdGF0dXM7XG5cblx0XHR0aGlzLl9jaGFuZ2VzID0gb2JzZXJ2YWJsZVZhbHVlT3B0czxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT4oeyBvd25lcjogdGhpcywgZXF1YWxzRm46IHNlc3Npb25GaWxlQ2hhbmdlc0VxdWFsIH0sIHRoaXMuX2V4dHJhY3RDaGFuZ2VzKHNlc3Npb24pKTtcblx0XHR0aGlzLmNoYW5nZXMgPSB0aGlzLl9jaGFuZ2VzO1xuXG5cdFx0dGhpcy5fY2hlY2twb2ludHMgPSBvYnNlcnZhYmxlVmFsdWVPcHRzPElDaGF0Q2hlY2twb2ludHMgfCB1bmRlZmluZWQ+KHsgb3duZXI6IHRoaXMsIGVxdWFsc0ZuOiBzdHJ1Y3R1cmFsRXF1YWxzIH0sIHRoaXMuX2V4dHJhY3RDaGVja3BvaW50cyhzZXNzaW9uKSk7XG5cdFx0dGhpcy5jaGVja3BvaW50cyA9IHRoaXMuX2NoZWNrcG9pbnRzO1xuXG5cdFx0dGhpcy5fbW9kZWxJZCA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5tb2RlbElkID0gdGhpcy5fbW9kZWxJZDtcblx0XHR0aGlzLm1vZGUgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLmxvYWRpbmcgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXG5cdFx0dGhpcy5faXNBcmNoaXZlZCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBzZXNzaW9uLmlzQXJjaGl2ZWQoKSk7XG5cdFx0dGhpcy5pc0FyY2hpdmVkID0gdGhpcy5faXNBcmNoaXZlZDtcblx0XHR0aGlzLl9pc1JlYWQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgc2Vzc2lvbi5pc1JlYWQoKSk7XG5cdFx0dGhpcy5pc1JlYWQgPSB0aGlzLl9pc1JlYWQ7XG5cdFx0dGhpcy5fZGVzY3JpcHRpb24gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdGhpcy5fZXh0cmFjdERlc2NyaXB0aW9uKHNlc3Npb24pKTtcblx0XHR0aGlzLmRlc2NyaXB0aW9uID0gdGhpcy5fZGVzY3JpcHRpb247XG5cdFx0dGhpcy5fbGFzdFR1cm5FbmQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RFbmRlZCA/IG5ldyBEYXRlKHNlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQpIDogdW5kZWZpbmVkKTtcblx0XHR0aGlzLmxhc3RUdXJuRW5kID0gdGhpcy5fbGFzdFR1cm5FbmQ7XG5cblx0XHR0aGlzLm1haW5DaGF0ID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0Pih0aGlzLCBidWlsZENoYXRGcm9tU2Vzc2lvbih0aGlzKSk7XG5cdH1cblxuXHRzZXRQZXJtaXNzaW9uTGV2ZWwobGV2ZWw6IENoYXRQZXJtaXNzaW9uTGV2ZWwpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0c2V0QnJhbmNoKGJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdHNldElzb2xhdGlvbk1vZGUobW9kZTogSXNvbGF0aW9uTW9kZSk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRzZXRNb2RlbElkKG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsSWQuc2V0KG1vZGVsSWQsIHVuZGVmaW5lZCk7XG5cdH1cblx0c2V0TW9kZShjaGF0TW9kZTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZSByZWFjdGl2ZSBwcm9wZXJ0aWVzIGZyb20gYSByZWZyZXNoZWQgYWdlbnQgc2Vzc2lvbi5cblx0ICovXG5cdHVwZGF0ZShzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogYm9vbGVhbiB7XG5cdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRjb25zdCBnaXRIdWJJbmZvID0gdGhpcy5fZXh0cmFjdEdpdEh1YkluZm8oc2Vzc2lvbik7XG5cdFx0XHRjb25zdCBwdWxsUmVxdWVzdEJyYW5jaCA9IHRoaXMuX2V4dHJhY3RQdWxsUmVxdWVzdEJyYW5jaChzZXNzaW9uKTtcblx0XHRcdGNoYW5nZWQgPSBzZXRJZkNoYW5nZWQodGhpcy5fdGl0bGUsIHNlc3Npb24ubGFiZWwsIHR4KSB8fCBjaGFuZ2VkO1xuXHRcdFx0Y2hhbmdlZCA9IHNldElmQ2hhbmdlZCh0aGlzLl93b3Jrc3BhY2UsIHRoaXMuX2J1aWxkV29ya3NwYWNlKHNlc3Npb24pLCB0eCwgc2Vzc2lvbldvcmtzcGFjZUVxdWFsKSB8fCBjaGFuZ2VkO1xuXHRcdFx0Y29uc3QgdXBkYXRlZFRpbWUgPSBzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdEVuZGVkID8/IHNlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0U3RhcnRlZCA/PyBzZXNzaW9uLnRpbWluZy5jcmVhdGVkO1xuXHRcdFx0Y2hhbmdlZCA9IHNldElmQ2hhbmdlZCh0aGlzLl91cGRhdGVkQXQsIG5ldyBEYXRlKHVwZGF0ZWRUaW1lKSwgdHgsIGRhdGVFcXVhbHMpIHx8IGNoYW5nZWQ7XG5cdFx0XHRjaGFuZ2VkID0gc2V0SWZDaGFuZ2VkKHRoaXMuX3N0YXR1cywgdG9TZXNzaW9uU3RhdHVzKHNlc3Npb24uc3RhdHVzKSwgdHgpIHx8IGNoYW5nZWQ7XG5cdFx0XHRjaGFuZ2VkID0gc2V0SWZDaGFuZ2VkKHRoaXMuX2NoYW5nZXMsIHRoaXMuX2V4dHJhY3RDaGFuZ2VzKHNlc3Npb24pLCB0eCwgc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwpIHx8IGNoYW5nZWQ7XG5cdFx0XHRjaGFuZ2VkID0gc2V0SWZDaGFuZ2VkKHRoaXMuX2NoZWNrcG9pbnRzLCB0aGlzLl9leHRyYWN0Q2hlY2twb2ludHMoc2Vzc2lvbiksIHR4LCBzdHJ1Y3R1cmFsRXF1YWxzKSB8fCBjaGFuZ2VkO1xuXHRcdFx0Y2hhbmdlZCA9IHNldElmQ2hhbmdlZCh0aGlzLl9pc0FyY2hpdmVkLCBzZXNzaW9uLmlzQXJjaGl2ZWQoKSwgdHgpIHx8IGNoYW5nZWQ7XG5cdFx0XHRjaGFuZ2VkID0gc2V0SWZDaGFuZ2VkKHRoaXMuX2lzUmVhZCwgc2Vzc2lvbi5pc1JlYWQoKSwgdHgpIHx8IGNoYW5nZWQ7XG5cdFx0XHRjaGFuZ2VkID0gc2V0SWZDaGFuZ2VkKHRoaXMuX2Rlc2NyaXB0aW9uLCB0aGlzLl9leHRyYWN0RGVzY3JpcHRpb24oc2Vzc2lvbiksIHR4LCBtYXJrZG93blN0cmluZ0VxdWFscykgfHwgY2hhbmdlZDtcblx0XHRcdGNoYW5nZWQgPSBzZXRJZkNoYW5nZWQodGhpcy5fbGFzdFR1cm5FbmQsIHNlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQgPyBuZXcgRGF0ZShzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdEVuZGVkKSA6IHVuZGVmaW5lZCwgdHgsIGRhdGVFcXVhbHMpIHx8IGNoYW5nZWQ7XG5cdFx0XHRjaGFuZ2VkID0gc2V0SWZDaGFuZ2VkKHRoaXMuX2Jhc2VHaXRIdWJJbmZvLCBnaXRIdWJJbmZvLCB0eCwgZ2l0SHViSW5mb0VxdWFsKSB8fCBjaGFuZ2VkO1xuXHRcdFx0Y2hhbmdlZCA9IHNldElmQ2hhbmdlZCh0aGlzLl9wdWxsUmVxdWVzdEJyYW5jaCwgcHVsbFJlcXVlc3RCcmFuY2gsIHR4KSB8fCBjaGFuZ2VkO1xuXHRcdH0pO1xuXHRcdHJldHVybiBjaGFuZ2VkO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHVsbFJlcXVlc3ROdW1iZXJGb3JCcmFuY2gob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nLCBicmFuY2g6IHN0cmluZyk6IElPYnNlcnZhYmxlPHsgcmVhZG9ubHkgdmFsdWU/OiBudW1iZXIgfCB1bmRlZmluZWQgfT4ge1xuXHRcdGNvbnN0IGtleSA9IGAke293bmVyfS8ke3JlcG99QCR7YnJhbmNofWA7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fcHVsbFJlcXVlc3ROdW1iZXJDYWNoZS5nZXQoa2V5KTtcblx0XHRpZiAoY2FjaGVkKSB7XG5cdFx0XHRyZXR1cm4gY2FjaGVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvb2t1cCA9IHRoaXMuX2dpdEh1YlNlcnZpY2UuZmluZFB1bGxSZXF1ZXN0TnVtYmVyQnlIZWFkQnJhbmNoKG93bmVyLCByZXBvLCBicmFuY2gpO1xuXHRcdGNvbnN0IG9ic2VydmFibGUgPSBvYnNlcnZhYmxlRnJvbVByb21pc2UobG9va3VwKTtcblx0XHR0aGlzLl9wdWxsUmVxdWVzdE51bWJlckNhY2hlLnNldChrZXksIG9ic2VydmFibGUpO1xuXHRcdGxvb2t1cC50aGVuKHB1bGxSZXF1ZXN0TnVtYmVyID0+IHtcblx0XHRcdGlmIChwdWxsUmVxdWVzdE51bWJlciA9PT0gdW5kZWZpbmVkICYmIHRoaXMuX3B1bGxSZXF1ZXN0TnVtYmVyQ2FjaGUuZ2V0KGtleSkgPT09IG9ic2VydmFibGUpIHtcblx0XHRcdFx0dGhpcy5fcHVsbFJlcXVlc3ROdW1iZXJDYWNoZS5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gb2JzZXJ2YWJsZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNlc3Npb25UeXBlSWNvbihzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogVGhlbWVJY29uIHtcblx0XHRzd2l0Y2ggKHNlc3Npb24ucHJvdmlkZXJUeXBlKSB7XG5cdFx0XHRjYXNlIEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kOlxuXHRcdFx0XHRyZXR1cm4gQ29waWxvdENMSVNlc3Npb25UeXBlLmljb247XG5cdFx0XHRjYXNlIEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZDpcblx0XHRcdFx0cmV0dXJuIENvcGlsb3RDbG91ZFNlc3Npb25UeXBlLmljb247XG5cdFx0XHRjYXNlIEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbGF1ZGU6XG5cdFx0XHRcdHJldHVybiBDbGF1ZGVDb2RlU2Vzc2lvblR5cGUuaWNvbjtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uLmljb247XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZXh0cmFjdERlc2NyaXB0aW9uKHNlc3Npb246IElBZ2VudFNlc3Npb24pOiBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghc2Vzc2lvbi5kZXNjcmlwdGlvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHR5cGVvZiBzZXNzaW9uLmRlc2NyaXB0aW9uID09PSAnc3RyaW5nJyA/IG5ldyBNYXJrZG93blN0cmluZyhzZXNzaW9uLmRlc2NyaXB0aW9uKSA6IHNlc3Npb24uZGVzY3JpcHRpb247XG5cdH1cblxuXHRwcml2YXRlIF9leHRyYWN0R2l0SHViSW5mbyhzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogSUdpdEh1YkluZm8gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gc2Vzc2lvbi5tZXRhZGF0YTtcblx0XHRpZiAoIW1ldGFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHB1bGxSZXF1ZXN0VXJpID0gdGhpcy5fZXh0cmFjdFB1bGxSZXF1ZXN0VXJpKHNlc3Npb24pO1xuXHRcdGNvbnN0IHB1bGxSZXF1ZXN0SWRlbnRpdHkgPSBwdWxsUmVxdWVzdFVyaSA/IHRoaXMuX2V4dHJhY3RQdWxsUmVxdWVzdElkZW50aXR5KHB1bGxSZXF1ZXN0VXJpKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCB7IG93bmVyLCByZXBvIH0gPSBwdWxsUmVxdWVzdElkZW50aXR5ID8/IHRoaXMuX2V4dHJhY3RPd25lclJlcG8oc2Vzc2lvbik7XG5cdFx0aWYgKCFvd25lciB8fCAhcmVwbykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIXB1bGxSZXF1ZXN0VXJpIHx8ICFwdWxsUmVxdWVzdElkZW50aXR5KSB7XG5cdFx0XHRyZXR1cm4geyBvd25lciwgcmVwbyB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGljb24gPSB0aGlzLl9leHRyYWN0UHVsbFJlcXVlc3RTdGF0ZUljb24oc2Vzc2lvbik7XG5cblx0XHRjb25zdCBiYXNlUmVmT2lkID0gdHlwZW9mIG1ldGFkYXRhLmJhc2VSZWZPaWQgPT09ICdzdHJpbmcnID8gbWV0YWRhdGEuYmFzZVJlZk9pZCA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBoZWFkUmVmT2lkID0gdHlwZW9mIG1ldGFkYXRhLmhlYWRSZWZPaWQgPT09ICdzdHJpbmcnID8gbWV0YWRhdGEuaGVhZFJlZk9pZCA6IHVuZGVmaW5lZDtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRvd25lcixcblx0XHRcdHJlcG8sXG5cdFx0XHRwdWxsUmVxdWVzdDoge1xuXHRcdFx0XHRudW1iZXI6IHB1bGxSZXF1ZXN0SWRlbnRpdHkubnVtYmVyLFxuXHRcdFx0XHR1cmk6IHB1bGxSZXF1ZXN0VXJpLFxuXHRcdFx0XHRpY29uLFxuXHRcdFx0XHRiYXNlUmVmT2lkLFxuXHRcdFx0XHRoZWFkUmVmT2lkXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2V4dHJhY3RQdWxsUmVxdWVzdEJyYW5jaChzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoc2Vzc2lvbi5wcm92aWRlclR5cGUgIT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBzZXNzaW9uLm1ldGFkYXRhPy5ob3N0ID09PSAnc3RyaW5nJyAmJiBzZXNzaW9uLm1ldGFkYXRhLmhvc3QudG9Mb3dlckNhc2UoKSAhPT0gJ2dpdGh1Yi5jb20nKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdHlwZW9mIHNlc3Npb24ubWV0YWRhdGE/LmJyYW5jaCA9PT0gJ3N0cmluZycgPyBzZXNzaW9uLm1ldGFkYXRhLmJyYW5jaCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2V4dHJhY3RQdWxsUmVxdWVzdElkZW50aXR5KHB1bGxSZXF1ZXN0VXJpOiBVUkkpOiB7IHJlYWRvbmx5IG93bmVyOiBzdHJpbmc7IHJlYWRvbmx5IHJlcG86IHN0cmluZzsgcmVhZG9ubHkgbnVtYmVyOiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbWF0Y2ggPSAvXlxcLyg/PG93bmVyPlteL10rKVxcLyg/PHJlcG8+W14vXSspXFwvcHVsbFxcLyg/PG51bWJlcj5cXGQrKVxcLz8kLy5leGVjKHB1bGxSZXF1ZXN0VXJpLnBhdGgpO1xuXHRcdGlmICghbWF0Y2g/Lmdyb3Vwcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdG93bmVyOiBkZWNvZGVVUklDb21wb25lbnQobWF0Y2guZ3JvdXBzLm93bmVyKSxcblx0XHRcdHJlcG86IGRlY29kZVVSSUNvbXBvbmVudChtYXRjaC5ncm91cHMucmVwbyksXG5cdFx0XHRudW1iZXI6IHBhcnNlSW50KG1hdGNoLmdyb3Vwcy5udW1iZXIsIDEwKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZXh0cmFjdE93bmVyUmVwbyhzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogeyBvd25lcjogc3RyaW5nIHwgdW5kZWZpbmVkOyByZXBvOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSBzZXNzaW9uLm1ldGFkYXRhO1xuXHRcdGlmICghbWV0YWRhdGEpIHtcblx0XHRcdHJldHVybiB7IG93bmVyOiB1bmRlZmluZWQsIHJlcG86IHVuZGVmaW5lZCB9O1xuXHRcdH1cblxuXHRcdC8vIERpcmVjdCBvd25lciArIG5hbWUgZmllbGRzXG5cdFx0aWYgKHR5cGVvZiBtZXRhZGF0YS5vd25lciA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIG1ldGFkYXRhLm5hbWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4geyBvd25lcjogbWV0YWRhdGEub3duZXIsIHJlcG86IG1ldGFkYXRhLm5hbWUgfTtcblx0XHR9XG5cblx0XHQvLyByZXBvc2l0b3J5TndvOiBcIm93bmVyL3JlcG9cIlxuXHRcdGlmICh0eXBlb2YgbWV0YWRhdGEucmVwb3NpdG9yeU53byA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbnN0IHBhcnRzID0gKG1ldGFkYXRhLnJlcG9zaXRvcnlOd28gYXMgc3RyaW5nKS5zcGxpdCgnLycpO1xuXHRcdFx0aWYgKHBhcnRzLmxlbmd0aCA9PT0gMikge1xuXHRcdFx0XHRyZXR1cm4geyBvd25lcjogcGFydHNbMF0sIHJlcG86IHBhcnRzWzFdIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUGFyc2UgZnJvbSB3b3Jrc3BhY2UgcmVwb3NpdG9yeSBVUkkgKGNsb3VkIHNlc3Npb25zKVxuXHRcdGNvbnN0IHJlcG9VcmkgPSB0aGlzLl9idWlsZFdvcmtzcGFjZShzZXNzaW9uKT8uZm9sZGVyc1swXT8ucm9vdDtcblx0XHRpZiAocmVwb1VyaSAmJiByZXBvVXJpLnNjaGVtZSA9PT0gR0lUSFVCX1JFTU9URV9GSUxFX1NDSEVNRSkge1xuXHRcdFx0Y29uc3QgcGFydHMgPSByZXBvVXJpLnBhdGguc3BsaXQoJy8nKS5maWx0ZXIoQm9vbGVhbik7XG5cdFx0XHRpZiAocGFydHMubGVuZ3RoID49IDIpIHtcblx0XHRcdFx0cmV0dXJuIHsgb3duZXI6IGRlY29kZVVSSUNvbXBvbmVudChwYXJ0c1swXSksIHJlcG86IGRlY29kZVVSSUNvbXBvbmVudChwYXJ0c1sxXSkgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBvd25lcjogdW5kZWZpbmVkLCByZXBvOiB1bmRlZmluZWQgfTtcblx0fVxuXG5cdHByaXZhdGUgX2V4dHJhY3RQdWxsUmVxdWVzdFN0YXRlSWNvbihzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogVGhlbWVJY29uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtZXRhZGF0YSA9IHNlc3Npb24ubWV0YWRhdGE7XG5cdFx0Y29uc3Qgc3RhdGUgPSBtZXRhZGF0YT8ucHVsbFJlcXVlc3RTdGF0ZTtcblx0XHRpZiAodHlwZW9mIHN0YXRlID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIGNvbXB1dGVQdWxsUmVxdWVzdEljb24oc3RhdGUgYXMgR2l0SHViUHVsbFJlcXVlc3RTdGF0ZSB8ICdkcmFmdCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXh0cmFjdFB1bGxSZXF1ZXN0VXJpKHNlc3Npb246IElBZ2VudFNlc3Npb24pOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBnZXRBZ2VudFNlc3Npb25QdWxsUmVxdWVzdFVyaShzZXNzaW9uKTtcblx0fVxuXG5cdHByaXZhdGUgX2V4dHJhY3RDaGFuZ2VzKHNlc3Npb246IElBZ2VudFNlc3Npb24pOiByZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXSB7XG5cdFx0aWYgKCFzZXNzaW9uLmNoYW5nZXMpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoc2Vzc2lvbi5jaGFuZ2VzKSkge1xuXHRcdFx0cmV0dXJuIHNlc3Npb24uY2hhbmdlcyBhcyBJU2Vzc2lvbkZpbGVDaGFuZ2VbXTtcblx0XHR9XG5cdFx0Ly8gU3VtbWFyeSBvYmplY3QgXHUyMDE0IGNyZWF0ZSBhIHN5bnRoZXRpYyBlbnRyeSBmb3IgdG90YWwgaW5zZXJ0aW9ucy9kZWxldGlvbnNcblx0XHRjb25zdCBzdW1tYXJ5ID0gc2Vzc2lvbi5jaGFuZ2VzIGFzIHsgcmVhZG9ubHkgZmlsZXM6IG51bWJlcjsgcmVhZG9ubHkgaW5zZXJ0aW9uczogbnVtYmVyOyByZWFkb25seSBkZWxldGlvbnM6IG51bWJlciB9O1xuXHRcdGlmIChzdW1tYXJ5Lmluc2VydGlvbnMgPiAwIHx8IHN1bW1hcnkuZGVsZXRpb25zID4gMCkge1xuXHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdG1vZGlmaWVkVXJpOiBVUkkucGFyc2UoJ3N1bW1hcnk6Ly9jaGFuZ2VzJyksXG5cdFx0XHRcdGluc2VydGlvbnM6IHN1bW1hcnkuaW5zZXJ0aW9ucyxcblx0XHRcdFx0ZGVsZXRpb25zOiBzdW1tYXJ5LmRlbGV0aW9ucyxcblx0XHRcdH1dO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcml2YXRlIF9leHRyYWN0Q2hlY2twb2ludHMoc2Vzc2lvbjogSUFnZW50U2Vzc2lvbik6IElDaGF0Q2hlY2twb2ludHMgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gc2Vzc2lvbi5tZXRhZGF0YTtcblx0XHRpZiAodHlwZW9mIG1ldGFkYXRhPy5maXJzdENoZWNrcG9pbnRSZWYgIT09ICdzdHJpbmcnIHx8IHR5cGVvZiBtZXRhZGF0YT8ubGFzdENoZWNrcG9pbnRSZWYgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRmaXJzdENoZWNrcG9pbnRSZWY6IG1ldGFkYXRhLmZpcnN0Q2hlY2twb2ludFJlZixcblx0XHRcdGxhc3RDaGVja3BvaW50UmVmOiBtZXRhZGF0YS5sYXN0Q2hlY2twb2ludFJlZixcblx0XHR9IHNhdGlzZmllcyBJQ2hhdENoZWNrcG9pbnRzO1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRXb3Jrc3BhY2Uoc2Vzc2lvbjogSUFnZW50U2Vzc2lvbik6IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB7XG5cdFx0XHRyZXBvVXJpLFxuXHRcdFx0d29ya3RyZWVVcmksXG5cdFx0XHRicmFuY2hOYW1lLFxuXHRcdFx0YmFzZUJyYW5jaE5hbWUsXG5cdFx0XHRiYXNlQnJhbmNoUHJvdGVjdGVkLFxuXHRcdFx0aGFzR2l0SHViUmVtb3RlLFxuXHRcdFx0dXBzdHJlYW1CcmFuY2hOYW1lLFxuXHRcdFx0aW5jb21pbmdDaGFuZ2VzLFxuXHRcdFx0b3V0Z29pbmdDaGFuZ2VzLFxuXHRcdFx0dW5jb21taXR0ZWRDaGFuZ2VzLFxuXHRcdFx0aGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzc1xuXHRcdH0gPSB0aGlzLl9leHRyYWN0UmVwb3NpdG9yeUZyb21NZXRhZGF0YShzZXNzaW9uKTtcblxuXHRcdGNvbnN0IHJlcG9VcmlSZXNvbHZlZCA9IHJlcG9VcmkgPz8gVVJJLnBhcnNlKCd1bmtub3duOi8vLycpO1xuXG5cdFx0Y29uc3QgZ2l0UmVwb3NpdG9yeTogSVNlc3Npb25HaXRSZXBvc2l0b3J5ID0ge1xuXHRcdFx0dXJpOiByZXBvVXJpUmVzb2x2ZWQsXG5cdFx0XHR3b3JrVHJlZVVyaTogd29ya3RyZWVVcmksXG5cdFx0XHRicmFuY2hOYW1lLFxuXHRcdFx0YmFzZUJyYW5jaE5hbWUsXG5cdFx0XHRiYXNlQnJhbmNoUHJvdGVjdGVkLFxuXHRcdFx0aGFzR2l0SHViUmVtb3RlLFxuXHRcdFx0dXBzdHJlYW1CcmFuY2hOYW1lLFxuXHRcdFx0aW5jb21pbmdDaGFuZ2VzLFxuXHRcdFx0b3V0Z29pbmdDaGFuZ2VzLFxuXHRcdFx0dW5jb21taXR0ZWRDaGFuZ2VzLFxuXHRcdFx0aGFzR2l0T3BlcmF0aW9uSW5Qcm9ncmVzcyxcblx0XHRcdGdpdEh1YkluZm86IHRoaXMuZ2l0SHViSW5mbyxcblx0XHR9O1xuXG5cdFx0Y29uc3QgZm9sZGVyOiBJU2Vzc2lvbkZvbGRlciA9IHtcblx0XHRcdHJvb3Q6IHJlcG9VcmlSZXNvbHZlZCxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHdvcmt0cmVlVXJpID8/IHJlcG9VcmlSZXNvbHZlZCxcblx0XHRcdG5hbWU6IGJhc2VuYW1lKHJlcG9VcmlSZXNvbHZlZCksXG5cdFx0XHRkZXNjcmlwdGlvbjogYnJhbmNoTmFtZSxcblx0XHRcdGdpdFJlcG9zaXRvcnksXG5cdFx0fTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHR1cmk6IHJlcG9VcmlSZXNvbHZlZCxcblx0XHRcdGxhYmVsOiBnaXRodWJSZW1vdGVSZXBvTGFiZWwocmVwb1VyaVJlc29sdmVkKSA/PyBnZXRSZXBvc2l0b3J5TmFtZShzZXNzaW9uKSA/PyBiYXNlbmFtZShyZXBvVXJpUmVzb2x2ZWQpLFxuXHRcdFx0aWNvbjogcmVwb1VyaT8uc2NoZW1lID09PSBHSVRIVUJfUkVNT1RFX0ZJTEVfU0NIRU1FID8gQ29kaWNvbi5yZXBvIDogQ29kaWNvbi5mb2xkZXIsXG5cdFx0XHRncm91cDogcmVwb1VyaT8uc2NoZW1lID09PSBHSVRIVUJfUkVNT1RFX0ZJTEVfU0NIRU1FID8gU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfR0lUSFVCIDogU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUwsXG5cdFx0XHRmb2xkZXJzOiBbZm9sZGVyXSxcblx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IHNlc3Npb24ucHJvdmlkZXJUeXBlICE9PSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQsXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IHNlc3Npb24ucHJvdmlkZXJUeXBlID09PSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQsXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFeHRyYWN0IHJlcG9zaXRvcnkvd29ya3RyZWUgaW5mb3JtYXRpb24gZnJvbSBzZXNzaW9uIG1ldGFkYXRhLlxuXHQgKiBNaXJyb3JzIHRoZSBsb2dpYyBpbiBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFJlcG9zaXRvcnlGcm9tTWV0YWRhdGEoKS5cblx0ICovXG5cdHByaXZhdGUgX2V4dHJhY3RSZXBvc2l0b3J5RnJvbU1ldGFkYXRhKHNlc3Npb246IElBZ2VudFNlc3Npb24pOiB7XG5cdFx0cmVhZG9ubHkgcmVwb1VyaT86IFVSSTtcblx0XHRyZWFkb25seSB3b3JrdHJlZVVyaT86IFVSSTtcblx0XHRyZWFkb25seSBicmFuY2hOYW1lPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGJhc2VCcmFuY2hOYW1lPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGJhc2VCcmFuY2hQcm90ZWN0ZWQ/OiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IGhhc0dpdEh1YlJlbW90ZT86IGJvb2xlYW47XG5cdFx0cmVhZG9ubHkgdXBzdHJlYW1CcmFuY2hOYW1lPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGluY29taW5nQ2hhbmdlcz86IG51bWJlcjtcblx0XHRyZWFkb25seSBvdXRnb2luZ0NoYW5nZXM/OiBudW1iZXI7XG5cdFx0cmVhZG9ubHkgdW5jb21taXR0ZWRDaGFuZ2VzPzogbnVtYmVyO1xuXHRcdHJlYWRvbmx5IGhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3M/OiBib29sZWFuO1xuXHR9IHtcblx0XHRjb25zdCBtZXRhZGF0YSA9IHNlc3Npb24ubWV0YWRhdGE7XG5cdFx0aWYgKCFtZXRhZGF0YSkge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblxuXHRcdGlmIChzZXNzaW9uLnByb3ZpZGVyVHlwZSA9PT0gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkKSB7XG5cdFx0XHRpZiAodHlwZW9mIG1ldGFkYXRhLm93bmVyICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgbWV0YWRhdGEubmFtZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYnJhbmNoID0gdHlwZW9mIG1ldGFkYXRhLmJyYW5jaCA9PT0gJ3N0cmluZycgPyBtZXRhZGF0YS5icmFuY2ggOiAnSEVBRCc7XG5cdFx0XHRjb25zdCByZXBvc2l0b3J5VXJpID0gVVJJLmZyb20oe1xuXHRcdFx0XHRzY2hlbWU6IEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUsXG5cdFx0XHRcdGF1dGhvcml0eTogJ2dpdGh1YicsXG5cdFx0XHRcdHBhdGg6IGAvJHttZXRhZGF0YS5vd25lcn0vJHttZXRhZGF0YS5uYW1lfS8ke2VuY29kZVVSSUNvbXBvbmVudChicmFuY2gpfWBcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHsgcmVwb1VyaTogcmVwb3NpdG9yeVVyaSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcG9VcmkgPSB0eXBlb2YgbWV0YWRhdGE/LnJlcG9zaXRvcnlQYXRoID09PSAnc3RyaW5nJ1xuXHRcdFx0PyBVUkkuZmlsZShtZXRhZGF0YS5yZXBvc2l0b3J5UGF0aClcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHdvcmt0cmVlVXJpID0gdHlwZW9mIG1ldGFkYXRhPy53b3JrdHJlZVBhdGggPT09ICdzdHJpbmcnXG5cdFx0XHQ/IFVSSS5maWxlKG1ldGFkYXRhLndvcmt0cmVlUGF0aClcblx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlcG9VcmksXG5cdFx0XHR3b3JrdHJlZVVyaSxcblx0XHRcdGJyYW5jaE5hbWU6IG1ldGFkYXRhPy5icmFuY2hOYW1lIGFzIHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRcdGJhc2VCcmFuY2hOYW1lOiBtZXRhZGF0YT8uYmFzZUJyYW5jaE5hbWUgYXMgc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdFx0YmFzZUJyYW5jaFByb3RlY3RlZDogbWV0YWRhdGE/LmJhc2VCcmFuY2hQcm90ZWN0ZWQgYXMgYm9vbGVhbiB8IHVuZGVmaW5lZCxcblx0XHRcdGhhc0dpdEh1YlJlbW90ZTogbWV0YWRhdGE/Lmhhc0dpdEh1YlJlbW90ZSBhcyBib29sZWFuIHwgdW5kZWZpbmVkLFxuXHRcdFx0dXBzdHJlYW1CcmFuY2hOYW1lOiBtZXRhZGF0YT8udXBzdHJlYW1CcmFuY2hOYW1lIGFzIHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRcdGluY29taW5nQ2hhbmdlczogbWV0YWRhdGE/LmluY29taW5nQ2hhbmdlcyBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG5cdFx0XHRvdXRnb2luZ0NoYW5nZXM6IG1ldGFkYXRhPy5vdXRnb2luZ0NoYW5nZXMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdFx0dW5jb21taXR0ZWRDaGFuZ2VzOiBtZXRhZGF0YT8udW5jb21taXR0ZWRDaGFuZ2VzIGFzIG51bWJlciB8IHVuZGVmaW5lZCxcblx0XHRcdGhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3M6IG1ldGFkYXRhPy5oYXNHaXRPcGVyYXRpb25JblByb2dyZXNzIGFzIGJvb2xlYW4gfCB1bmRlZmluZWRcblx0XHR9O1xuXHR9XG59XG5cbi8qKlxuICogRGVmYXVsdCBzZXNzaW9ucyBwcm92aWRlciBmb3IgQ29waWxvdCBDTEksIENsb3VkLCBDbGF1ZGUsIGFuZCBMb2NhbCBzZXNzaW9uIHR5cGVzLlxuICogV3JhcHMgdGhlIGV4aXN0aW5nIHNlc3Npb24gaW5mcmFzdHJ1Y3R1cmUgaW50byB0aGUgZXh0ZW5zaWJsZSBwcm92aWRlciBtb2RlbC5cbiAqL1xuZXhwb3J0IGNsYXNzIENvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2Vzc2lvbnNQcm92aWRlciB7XG5cblx0cmVhZG9ubHkgaWQgPSBDT1BJTE9UX1BST1ZJREVSX0lEO1xuXHRyZWFkb25seSBsYWJlbCA9IGxvY2FsaXplKCdjb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXInLCBcIkNvcGlsb3QgQ2hhdFwiKTtcblx0cmVhZG9ubHkgaWNvbiA9IENvZGljb24uY29waWxvdDtcblx0cmVhZG9ubHkgb3JkZXIgPSAwO1xuXG5cdGdldCBzZXNzaW9uVHlwZXMoKTogcmVhZG9ubHkgSVNlc3Npb25UeXBlW10ge1xuXHRcdGNvbnN0IHR5cGVzOiBJU2Vzc2lvblR5cGVbXSA9IFtdO1xuXHRcdGlmICh0aGlzLl9pc0NvcGlsb3RDbGlBdmFpbGFibGUoKSkge1xuXHRcdFx0dHlwZXMucHVzaChDb3BpbG90Q0xJU2Vzc2lvblR5cGUpO1xuXHRcdH1cblx0XHR0eXBlcy5wdXNoKENvcGlsb3RDbG91ZFNlc3Npb25UeXBlKTtcblx0XHRpZiAodGhpcy5faXNDbGF1ZGVBdmFpbGFibGUoKSkge1xuXHRcdFx0dHlwZXMucHVzaChDbGF1ZGVDb2RlU2Vzc2lvblR5cGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHlwZXM7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlc3Npb25UeXBlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25UeXBlczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25UeXBlcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlc3Npb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNlc3Npb25DaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IEV2ZW50PElTZXNzaW9uQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcGxhY2VTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZWFkb25seSBmcm9tOiBJU2Vzc2lvbjsgcmVhZG9ubHkgdG86IElTZXNzaW9uIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcGxhY2VTZXNzaW9uOiBFdmVudDx7IHJlYWRvbmx5IGZyb206IElTZXNzaW9uOyByZWFkb25seSB0bzogSVNlc3Npb24gfT4gPSB0aGlzLl9vbkRpZFJlcGxhY2VTZXNzaW9uLmV2ZW50O1xuXG5cdC8qKiBDYWNoZSBvZiBhZGFwdGVkIHNlc3Npb25zLCBrZXllZCBieSByZXNvdXJjZSBVUkkgc3RyaW5nLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgQWdlbnRTZXNzaW9uQWRhcHRlciB8IENvcGlsb3RDTElTZXNzaW9uIHwgUmVtb3RlTmV3U2Vzc2lvbiB8IENsYXVkZUNvZGVOZXdTZXNzaW9uPigpO1xuXG5cdC8qKlxuXHQgKiBSZXNvdXJjZXMgb2YgY29tbWl0dGVkIHNlc3Npb25zIHRoYXQgYXJlIGN1cnJlbnRseSBpbi1mbGlnaHQgKGkuZS5cblx0ICogYmV0d2VlbiB7QGxpbmsgX3NlbmRGaXJzdENoYXR9IGVudGVyaW5nIHRoZSBzZW5kIGFuZCB0aGUgcmVwbGFjZVxuXHQgKiBldmVudCBmaXJpbmcpLiBQcm90ZWN0ZWQgZnJvbSBzcHVyaW91cyByZW1vdmFsIGJ5XG5cdCAqIHtAbGluayBfcmVmcmVzaFNlc3Npb25DYWNoZX0gc28gdGhhdCBhIGNvbmN1cnJlbnQgbW9kZWwgcmUtcmVzb2x2ZVxuXHQgKiBjYW5ub3QgdHJhbnNpZW50bHkgZHJvcCB0aGVtLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfaW5GbGlnaHRDb21taXRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0LyoqIENhY2hlIG9mIElTZXNzaW9uIHdyYXBwZXJzLCBrZXllZCBieSBzZXNzaW9uIGdyb3VwIElELiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uR3JvdXBDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBJU2Vzc2lvbj4oKTtcblxuXHQvKiogQ2FjaGUgb2YgY2hhdHMga2V5ZWQgYnkgcmF3IHNlc3Npb24gSUQgKHJlc291cmNlIHBhdGggd2l0aG91dCBsZWFkaW5nIHNsYXNoKS4gKi9cblx0cHJpdmF0ZSBfY2hhdEJ5UmF3U2Vzc2lvbklkQ2FjaGU6IE1hcDxzdHJpbmcsIElDb3BpbG90Q2hhdFNlc3Npb24+IHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBDYWNoZSBvZiBkZXJpdmVkIGdyb3VwIElEcyBrZXllZCBieSBjaGF0IElELiAqL1xuXHRwcml2YXRlIF9ncm91cElkQnlDaGF0SWRDYWNoZTogTWFwPHN0cmluZywgc3RyaW5nPiB8IHVuZGVmaW5lZDtcblxuXHQvKiogQ2FjaGUgb2Ygc29ydGVkIGNoYXQgSURzIGtleWVkIGJ5IGdyb3VwIElELiAqL1xuXHRwcml2YXRlIF9jaGF0SWRzQnlHcm91cElkQ2FjaGU6IE1hcDxzdHJpbmcsIHN0cmluZ1tdPiB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogRW1pdHRlciBmaXJlZCB3aGVuIHRoZSBzZXQgb2YgY2hhdHMgaW4gYSBncm91cCBjaGFuZ2VzLFxuXHQgKiB1c2VkIHRvIHVwZGF0ZSB0aGUgY2hhdHMgb2JzZXJ2YWJsZSBpbiBgX2NoYXRUb1Nlc3Npb25gLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRHcm91cE1lbWJlcnNoaXBDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHNlc3Npb25JZDogc3RyaW5nIH0+KCkpO1xuXG5cdC8qKlxuXHQgKiBQZXItZ3JvdXAgc2lnbmFscywga2V5ZWQgYnkgYHNlc3Npb25JZGAsIHRoYXQgaW52YWxpZGF0ZSBhIHNpbmdsZSBncm91cCdzXG5cdCAqIGNoYXRzIG9ic2VydmFibGUuIEEgZ3JvdXAncyBjaGF0cyBkZXJpdmVkIG9ic2VydmVzIG9ubHkgaXRzIG93biBzaWduYWwsIHNvIGFcblx0ICogbWVtYmVyc2hpcCBjaGFuZ2UgcmVjb21wdXRlcyBqdXN0IHRoZSBhZmZlY3RlZCBncm91cCByYXRoZXIgdGhhbiBldmVyeSBvYnNlcnZlZFxuXHQgKiBncm91cC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2dyb3VwTWVtYmVyc2hpcFNpZ25hbHMgPSBuZXcgTWFwPHN0cmluZywgSU9ic2VydmFibGVTaWduYWw8dm9pZD4+KCk7XG5cblx0LyoqXG5cdCAqIEEgc2luZ2xlIHN1YnNjcmlwdGlvbiB0byBgX29uRGlkR3JvdXBNZW1iZXJzaGlwQ2hhbmdlYCB0aGF0IGZhbnMgZWFjaCBldmVudCBvdXRcblx0ICogdG8gdGhlIGFmZmVjdGVkIGdyb3VwJ3Mgb3duIHNpZ25hbC4gU3Vic2NyaWJpbmcgZXhhY3RseSBvbmNlIChpbnN0ZWFkIG9mIG9uY2UgcGVyXG5cdCAqIHNlc3Npb24pIGtlZXBzIHRoZSBlbWl0dGVyJ3MgbGlzdGVuZXIgY291bnQgY29uc3RhbnQgcmVnYXJkbGVzcyBvZiBob3cgbWFueVxuXHQgKiBzZXNzaW9ucyBleGlzdCBcdTIwMTQgdGhlIHBlci1zZXNzaW9uIHN1YnNjcmlwdGlvbnMgcHJldmlvdXNseSBsZWFrZWQgbGlzdGVuZXJzIGFzXG5cdCAqIHNlc3Npb25zIGFjY3VtdWxhdGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVnaXN0ZXJHcm91cE1lbWJlcnNoaXBGYW5PdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fb25EaWRHcm91cE1lbWJlcnNoaXBDaGFuZ2UuZXZlbnQoZSA9PiB7XG5cdFx0XHR0aGlzLl9ncm91cE1lbWJlcnNoaXBTaWduYWxzLmdldChlLnNlc3Npb25JZCk/LnRyaWdnZXIodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX211bHRpQ2hhdEVuYWJsZWQ6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIENsYXVkZSBpcyBvZmZlcmVkIGJ5IHRoaXMgKENvcGlsb3QgQ2hhdCBzZXNzaW9ucykgcHJvdmlkZXIgb25seSB3aGVuIHRoZVxuXHQgKiB1bmRlcmx5aW5nIGBjbGF1ZGVBZ2VudC5lbmFibGVkYCBzZXR0aW5nIGlzIG9uIEFORCB0aGUgdXNlciBoYXMgbm90IG9wdGVkXG5cdCAqIHRoZSBhZ2VudC1ob3N0IGltcGxlbWVudGF0aW9uIGluIHZpYSBgY2hhdC5hZ2VudHMuY2xhdWRlLnByZWZlckFnZW50SG9zdGAuXG5cdCAqIFdoZW4gdGhlIGxhdHRlciBpcyB0cnVlLCB0aGUgYWdlbnQgaG9zdCByZWdpc3RlcnMgQ2xhdWRlIGl0c2VsZiBhbmQgdGhpc1xuXHQgKiBwcm92aWRlciBzdGF5cyBvdXQgb2YgdGhlIHdheSBzbyB0aGUgcGlja2VyIHNob3dzIGEgc2luZ2xlIGVudHJ5LiBTdGVwcGluZ1xuXHQgKiBhc2lkZSBvbmx5IG1ha2VzIHNlbnNlIHdoZW4gdGhlIGFnZW50IGhvc3QgaXMgZW5hYmxlZCB0byByZWdpc3RlciBDbGF1ZGUgaW5cblx0ICogaXRzIHBsYWNlLCBzbyB0aGUgcHJlZmVyZW5jZSBpcyBub3QgcmVzcGVjdGVkIHVubGVzcyBgY2hhdC5hZ2VudEhvc3QuZW5hYmxlZGBcblx0ICogaXMgYWxzbyBvbi5cblx0ICovXG5cdHByaXZhdGUgX2lzQ2xhdWRlQXZhaWxhYmxlKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNsYXVkZUVuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENMQVVERV9DT0RFX0VOQUJMRURfU0VUVElORykgPz8gZmFsc2U7XG5cdFx0aWYgKCFjbGF1ZGVFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHByZWZlckFnZW50SG9zdCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2xhdWRlUHJlZmVyQWdlbnRIb3N0QWdlbnRzU2V0dGluZ0lkKSA/PyBmYWxzZTtcblx0XHRpZiAodGhpcy5hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5lbmFibGVkLmdldCgpICYmIHByZWZlckFnZW50SG9zdCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgRXh0ZW5zaW9uIEhvc3QgQ29waWxvdCBDTEkgaXMgb2ZmZXJlZCBieSB0aGlzIHByb3ZpZGVyIHVubGVzcyB0aGUgdXNlclxuXHQgKiBoYXMgaGlkZGVuIGl0IHZpYSBgY2hhdC5hZ2VudHMuY29waWxvdENsaS5oaWRlRXh0ZW5zaW9uSG9zdGAsIGluIHdoaWNoIGNhc2Vcblx0ICogdGhlIEFnZW50cyB3aW5kb3cgcGlja2VyIG9ubHkgc3VyZmFjZXMgdGhlIEFnZW50IEhvc3QgQ29waWxvdCBDTEkgZW50cnkuXG5cdCAqIEhpZGluZyBpdCBvbmx5IG1ha2VzIHNlbnNlIHdoZW4gdGhlIGFnZW50IGhvc3QgaXMgZW5hYmxlZCB0byBzdXJmYWNlIHRoZVxuXHQgKiBBZ2VudCBIb3N0IENvcGlsb3QgQ0xJIGluIGl0cyBwbGFjZSwgc28gdGhlIHNldHRpbmcgaXMgbm90IHJlc3BlY3RlZCB1bmxlc3Ncblx0ICogYGNoYXQuYWdlbnRIb3N0LmVuYWJsZWRgIGlzIGFsc28gb24uXG5cdCAqL1xuXHRwcml2YXRlIF9pc0NvcGlsb3RDbGlBdmFpbGFibGUoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaGlkZUV4dGVuc2lvbkhvc3QgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkNvcGlsb3RDbGlIaWRlRXh0ZW5zaW9uSG9zdEFnZW50cykgPz8gZmFsc2U7XG5cdFx0aWYgKHRoaXMuYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuZW5hYmxlZC5nZXQoKSAmJiBoaWRlRXh0ZW5zaW9uSG9zdCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHJlYWRvbmx5IGJyb3dzZUFjdGlvbnM6IHJlYWRvbmx5IElTZXNzaW9uV29ya3NwYWNlQnJvd3NlQWN0aW9uW107XG5cdHJlYWRvbmx5IHN1cHBvcnRzTG9jYWxXb3Jrc3BhY2VzID0gdHJ1ZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFnZW50U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRTZXNzaW9uc1NlcnZpY2U6IElBZ2VudFNlc3Npb25zU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0b29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudEhvc3RFbmFibGVtZW50U2VydmljZTogSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJR2l0SHViU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGdpdEh1YlNlcnZpY2U6IElHaXRIdWJTZXJ2aWNlLFxuXHRcdEBJUHVsbFJlcXVlc3RJY29uQ2FjaGUgcHJpdmF0ZSByZWFkb25seSBwdWxsUmVxdWVzdEljb25DYWNoZTogSVB1bGxSZXF1ZXN0SWNvbkNhY2hlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJQ2hhdE1vZGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdE1vZGVTZXJ2aWNlOiBJQ2hhdE1vZGVTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fbXVsdGlDaGF0RW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ09QSUxPVF9NVUxUSV9DSEFUX1NFVFRJTkcpID8/IHRydWU7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGNvbnN0IGFmZmVjdHNTZXNzaW9uVHlwZXMgPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKENMQVVERV9DT0RFX0VOQUJMRURfU0VUVElORylcblx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDbGF1ZGVQcmVmZXJBZ2VudEhvc3RBZ2VudHNTZXR0aW5nSWQpXG5cdFx0XHRcdHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uQ29waWxvdENsaUhpZGVFeHRlbnNpb25Ib3N0QWdlbnRzKTtcblx0XHRcdGlmICghYWZmZWN0c1Nlc3Npb25UeXBlcykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25UeXBlcy5maXJlKCk7XG5cdFx0XHR0aGlzLl9yZWZyZXNoU2Vzc2lvbkNhY2hlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJ1bk9uQ2hhbmdlKHRoaXMuYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuZW5hYmxlZCwgZW5hYmxlZCA9PiB7XG5cdFx0XHRpZiAoZW5hYmxlZCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25UeXBlcy5maXJlKCk7XG5cdFx0XHRcdHRoaXMuX3JlZnJlc2hTZXNzaW9uQ2FjaGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmJyb3dzZUFjdGlvbnMgPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVwb3NpdG9yaWVzJywgXCJSZXBvc2l0b3JpZXNcIiksXG5cdFx0XHRcdGdyb3VwOiBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9HSVRIVUIsXG5cdFx0XHRcdGljb246IENvZGljb24ubGlicmFyeSxcblx0XHRcdFx0cHJvdmlkZXJJZDogdGhpcy5pZCxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLl9icm93c2VGb3JSZXBvKCksXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHQvLyBGb3J3YXJkIHNlc3Npb24gY2hhbmdlcyBmcm9tIHRoZSB1bmRlcmx5aW5nIG1vZGVsXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHtcblx0XHRcdHRoaXMuX3JlZnJlc2hTZXNzaW9uQ2FjaGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlckdyb3VwTWVtYmVyc2hpcEZhbk91dCgpO1xuXHR9XG5cblx0Ly8gLS0gU2Vzc2lvbnMgLS1cblxuXHRnZXRTZXNzaW9uVHlwZXMod29ya3NwYWNlVXJpOiBVUkkpOiBJU2Vzc2lvblR5cGVbXSB7XG5cdFx0aWYgKHdvcmtzcGFjZVVyaS5zY2hlbWUgPT09IEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUgfHwgd29ya3NwYWNlVXJpLnNjaGVtZSA9PT0gU2Vzc2lvblR5cGUuQ29waWxvdENsb3VkKSB7XG5cdFx0XHRyZXR1cm4gW0NvcGlsb3RDbG91ZFNlc3Npb25UeXBlXTtcblx0XHR9XG5cdFx0Y29uc3QgdHlwZXM6IElTZXNzaW9uVHlwZVtdID0gW107XG5cdFx0aWYgKHRoaXMuX2lzQ29waWxvdENsaUF2YWlsYWJsZSgpKSB7XG5cdFx0XHR0eXBlcy5wdXNoKENvcGlsb3RDTElTZXNzaW9uVHlwZSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9pc0NsYXVkZUF2YWlsYWJsZSgpKSB7XG5cdFx0XHR0eXBlcy5wdXNoKENsYXVkZUNvZGVTZXNzaW9uVHlwZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0eXBlcztcblx0fVxuXG5cdGdldFNlc3Npb25zKCk6IElTZXNzaW9uW10ge1xuXHRcdHRoaXMuX2Vuc3VyZVNlc3Npb25DYWNoZSgpO1xuXG5cdFx0aWYgKCF0aGlzLl9pc011bHRpQ2hhdEVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fc2Vzc2lvbkNhY2hlLnZhbHVlcygpKS5tYXAoY2hhdCA9PiB0aGlzLl9jaGF0VG9TZXNzaW9uKGNoYXQpKTtcblx0XHR9XG5cblx0XHRjb25zdCBhbGxDaGF0cyA9IEFycmF5LmZyb20odGhpcy5fc2Vzc2lvbkNhY2hlLnZhbHVlcygpKS5zb3J0KChhLCBiKSA9PiBhLmNyZWF0ZWRBdC5nZXRUaW1lKCkgLSBiLmNyZWF0ZWRBdC5nZXRUaW1lKCkpO1xuXG5cdFx0Ly8gR3JvdXAgY2hhdHMgdXNpbmcgc2Vzc2lvblBhcmVudElkIGZyb20gbWV0YWRhdGFcblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnM6IElTZXNzaW9uW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBhbGxDaGF0cykge1xuXHRcdFx0Y29uc3QgZ3JvdXBJZCA9IHRoaXMuX2dldEdyb3VwSWRGb3JDaGF0KGNoYXQpO1xuXHRcdFx0aWYgKCFzZWVuLmhhcyhncm91cElkKSkge1xuXHRcdFx0XHRzZWVuLmFkZChncm91cElkKTtcblx0XHRcdFx0c2Vzc2lvbnMucHVzaCh0aGlzLl9jaGF0VG9TZXNzaW9uKGNoYXQpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHNlc3Npb25zO1xuXHR9XG5cblx0Ly8gLS0gU2Vzc2lvbiBMaWZlY3ljbGUgLS1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9uZXdTZXNzaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgTmV3U2Vzc2lvbj4oKSk7XG5cblx0LyoqXG5cdCAqIENsZWFyIHRoZSB0cmFja2VkIG5ldyBzZXNzaW9uIHdpdGggdGhlIGdpdmVuIHNlc3Npb24ncyBpZCwgYnV0IG9ubHkgaWZcblx0ICogdGhlIG1hcCBzdGlsbCBob2xkcyBleGFjdGx5IHRoYXQgaW5zdGFuY2UuIEFzeW5jIGZsb3dzIChjb21taXQgd2FpdCxcblx0ICogY2FjaGUgcG9wdWxhdGlvbikgbWF5IGNvbXBsZXRlIGFmdGVyIHRoZSBlbnRyeSB3YXMgYWxyZWFkeSByZXBsYWNlZCBvclxuXHQgKiByZW1vdmVkIFx1MjAxNCBhY3RpbmcgdW5jb25kaXRpb25hbGx5IHdvdWxkIGRpc3Bvc2UgYW4gdW5yZWxhdGVkIHNlc3Npb24uXG5cdCAqXG5cdCAqIEBwYXJhbSBzZXNzaW9uIFRoZSBzZXNzaW9uIHRoYXQgaW5pdGlhdGVkIHRoZSBhc3luYyBmbG93LlxuXHQgKiBAcGFyYW0gbGVhayBXaGVuIGB0cnVlYCB1c2Uge0BsaW5rIERpc3Bvc2FibGVNYXAuZGVsZXRlQW5kTGVha31cblx0ICogICAgICAgICAgICAgKHRoZSBzZXNzaW9uIGlzIHN0aWxsIHJlZmVyZW5jZWQgZWxzZXdoZXJlLCBlLmcuIHRoZSBzZXNzaW9uXG5cdCAqICAgICAgICAgICAgIGNhY2hlKTsgb3RoZXJ3aXNlIHVzZSB7QGxpbmsgRGlzcG9zYWJsZU1hcC5kZWxldGVBbmREaXNwb3NlfS5cblx0ICovXG5cdHByaXZhdGUgX2NsZWFyQ3VycmVudE5ld1Nlc3Npb25JZk1hdGNoKHNlc3Npb246IE5ld1Nlc3Npb24sIGxlYWs/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX25ld1Nlc3Npb25zLmdldChzZXNzaW9uLnNlc3Npb25JZCkgPT09IHNlc3Npb24pIHtcblx0XHRcdGlmIChsZWFrKSB7XG5cdFx0XHRcdHRoaXMuX25ld1Nlc3Npb25zLmRlbGV0ZUFuZExlYWsoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbmV3U2Vzc2lvbnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZGVsZXRlTmV3U2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9uZXdTZXNzaW9ucy5oYXMoc2Vzc2lvbklkKSkge1xuXHRcdFx0dGhpcy5fbmV3U2Vzc2lvbnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uSWQpO1xuXHRcdH1cblx0fVxuXG5cdGdldFNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBJQ29waWxvdENoYXRTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBuZXdTZXNzaW9uID0gdGhpcy5fbmV3U2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKG5ld1Nlc3Npb24pIHtcblx0XHRcdHJldHVybiBuZXdTZXNzaW9uO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZmluZENoYXRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdH1cblxuXHRjcmVhdGVOZXdTZXNzaW9uKHdvcmtzcGFjZVVyaTogVVJJLCBzZXNzaW9uVHlwZUlkOiBzdHJpbmcpOiBJU2Vzc2lvbiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5yZXNvbHZlV29ya3NwYWNlKHdvcmtzcGFjZVVyaSk7XG5cdFx0aWYgKCF3b3Jrc3BhY2UpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHJlc29sdmUgd29ya3NwYWNlIGZvciBVUkk6ICR7d29ya3NwYWNlVXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHdvcmtzcGFjZVVyaS5zY2hlbWUgPT09IEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUpIHtcblx0XHRcdGlmIChzZXNzaW9uVHlwZUlkICE9PSBDb3BpbG90Q2xvdWRTZXNzaW9uVHlwZS5pZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ09ubHkgQ29waWxvdCBDbG91ZCBzZXNzaW9ucyBjYW4gYmUgY3JlYXRlZCBmb3IgR2l0SHViIHJlcG9zaXRvcmllcycpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLCBwYXRoOiBgL3VudGl0bGVkLSR7Z2VuZXJhdGVVdWlkKCl9YCB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbW90ZU5ld1Nlc3Npb24sIHJlc291cmNlLCB3b3Jrc3BhY2UsIEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCwgdGhpcy5pZCk7XG5cdFx0XHR0aGlzLl9uZXdTZXNzaW9ucy5zZXQoc2Vzc2lvbi5zZXNzaW9uSWQsIHNlc3Npb24pO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NoYXRUb1Nlc3Npb24oc2Vzc2lvbik7XG5cdFx0fVxuXG5cdFx0aWYgKHNlc3Npb25UeXBlSWQgPT09IENsYXVkZUNvZGVTZXNzaW9uVHlwZS5pZCkge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsYXVkZSwgcGF0aDogYC91bnRpdGxlZC0ke2dlbmVyYXRlVXVpZCgpfWAgfSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDbGF1ZGVDb2RlTmV3U2Vzc2lvbiwgcmVzb3VyY2UsIHdvcmtzcGFjZSwgdGhpcy5pZCk7XG5cdFx0XHR0aGlzLl9uZXdTZXNzaW9ucy5zZXQoc2Vzc2lvbi5zZXNzaW9uSWQsIHNlc3Npb24pO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NoYXRUb1Nlc3Npb24oc2Vzc2lvbik7XG5cdFx0fVxuXG5cdFx0aWYgKHNlc3Npb25UeXBlSWQgIT09IENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBzZXNzaW9uIHR5cGUgJyR7c2Vzc2lvblR5cGVJZH0nIGZvciBsb2NhbCB3b3Jrc3BhY2VzYCk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiBgL3VudGl0bGVkLSR7Z2VuZXJhdGVVdWlkKCl9YCB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb3BpbG90Q0xJU2Vzc2lvbiwgcmVzb3VyY2UsIHdvcmtzcGFjZSwgdGhpcy5pZCk7XG5cdFx0c2Vzc2lvbi5zZXRQZXJtaXNzaW9uTGV2ZWwodGhpcy5fZGVmYXVsdFBlcm1pc3Npb25MZXZlbCgpKTtcblx0XHR0aGlzLl9uZXdTZXNzaW9ucy5zZXQoc2Vzc2lvbi5zZXNzaW9uSWQsIHNlc3Npb24pO1xuXHRcdHJldHVybiB0aGlzLl9jaGF0VG9TZXNzaW9uKHNlc3Npb24pO1xuXHR9XG5cblx0Y3JlYXRlUXVpY2tDaGF0KF9zZXNzaW9uVHlwZUlkOiBzdHJpbmcpOiBJU2Vzc2lvbiB7XG5cdFx0Ly8gVGhpcyBwcm92aWRlciBpcyB3b3Jrc3BhY2UtYm91bmQgYW5kIGRvZXMgbm90IGFkdmVydGlzZVxuXHRcdC8vIGBzdXBwb3J0c1F1aWNrQ2hhdHNgOyBjYWxsZXJzIG11c3QgZ2F0ZSBvbiB0aGF0IGNhcGFiaWxpdHkuXG5cdFx0dGhyb3cgbmV3IEVycm9yKCdDb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXIgZG9lcyBub3Qgc3VwcG9ydCBxdWljayBjaGF0cycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBpbml0aWFsIHBlcm1pc3Npb24gbGV2ZWwgZm9yIGEgYnJhbmQtbmV3IHNlc3Npb24gZnJvbVxuXHQgKiBgY2hhdC5wZXJtaXNzaW9ucy5kZWZhdWx0YCwgY2xhbXBlZCB0byBgRGVmYXVsdGAgd2hlbiBlbnRlcnByaXNlIHBvbGljeVxuXHQgKiBkaXNhYmxlcyBnbG9iYWwgYXV0by1hcHByb3ZhbC5cblx0ICovXG5cdHByaXZhdGUgX2RlZmF1bHRQZXJtaXNzaW9uTGV2ZWwoKTogQ2hhdFBlcm1pc3Npb25MZXZlbCB7XG5cdFx0Y29uc3QgcG9saWN5UmVzdHJpY3RlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5HbG9iYWxBdXRvQXBwcm92ZSkucG9saWN5VmFsdWUgPT09IGZhbHNlO1xuXHRcdGlmIChwb2xpY3lSZXN0cmljdGVkKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0O1xuXHRcdH1cblx0XHRjb25zdCBsZXZlbCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0UGVybWlzc2lvbkxldmVsKTtcblx0XHRyZXR1cm4gaXNDaGF0UGVybWlzc2lvbkxldmVsKGxldmVsKSA/IGxldmVsIDogQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0O1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlTW9kZWxzKCk6IEV2ZW50PHZvaWQ+IHtcblx0XHQvLyBNb2RlbHMgY2FuIGNoYW5nZSBiZWNhdXNlIGxhbmd1YWdlIG1vZGVscyBhcmUgKHVuKXJlZ2lzdGVyZWQgb3IgYmVjYXVzZVxuXHRcdC8vIHRoZSBleHRlbnNpb24gaG9zdCB1cGRhdGVzIGEgY2xvdWQgc2Vzc2lvbidzIGBtb2RlbHNgIG9wdGlvbiBncm91cC5cblx0XHRyZXR1cm4gRXZlbnQuc2lnbmFsKEV2ZW50LmFueShcblx0XHRcdHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMsXG5cdFx0XHR0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VPcHRpb25Hcm91cHNcblx0XHQpKTtcblx0fVxuXG5cdGdldE1vZGVsc1NuYXBzaG90KHNlc3Npb25JZDogc3RyaW5nLCBkZXNpcmVkTW9kZWxJZD86IHN0cmluZyk6IElTZXNzaW9uTW9kZWxzU25hcHNob3Qge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmdldFNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRpZiAoc2Vzc2lvbiBpbnN0YW5jZW9mIFJlbW90ZU5ld1Nlc3Npb24pIHtcblx0XHRcdC8vIENsb3VkIHNlc3Npb25zOiBtb2RlbHMgY29tZSBmcm9tIHRoZSBleHRlbnNpb24taG9zdCBgbW9kZWxzYCBvcHRpb25cblx0XHRcdC8vIGdyb3VwIHJhdGhlciB0aGFuIGZyb20gcmVnaXN0ZXJlZCBsYW5ndWFnZSBtb2RlbHMuIFN5bnRoZXNpemVcblx0XHRcdC8vIGxhbmd1YWdlLW1vZGVsIG1ldGFkYXRhIGZyb20gZWFjaCBvcHRpb24gaXRlbSBzbyB0aGUgc2hhcmVkIG1vZGVsXG5cdFx0XHQvLyBwaWNrZXIgd2lkZ2V0IGNhbiByZW5kZXIgdGhlbSBsaWtlIHJlZ3VsYXIgbGFuZ3VhZ2UgbW9kZWxzLlxuXHRcdFx0Y29uc3QgeyBtb2RlbE9wdGlvbiwgaXNSZXNvbHZlZCB9ID0gc2Vzc2lvbi5nZXRNb2RlbE9wdGlvbnNTbmFwc2hvdCgpO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gbW9kZWxPcHRpb24/Lmdyb3VwLml0ZW1zLm1hcCgoaXRlbSk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciA9PiB0aGlzLl90b1N5bnRoZXRpY01vZGVsKGl0ZW0pKSA/PyBbXTtcblx0XHRcdC8vIENsb3VkIG1vZGVsIHJlYWRpbmVzcyBjb21lcyBmcm9tIHRoZSBleHRlbnNpb24taG9zdCBvcHRpb24gZ3JvdXAsIG5vdCBsYW5ndWFnZS1tb2RlbCB2ZW5kb3JzLlxuXHRcdFx0cmV0dXJuIHsgbW9kZWxzLCBkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiByZXNvbHZlTW9kZWxJZGVudGlmaWVyKG1vZGVscywgZGVzaXJlZE1vZGVsSWQsIGlzUmVzb2x2ZWQpLCBtb2RlbFRhcmdldDogc2Vzc2lvbi5zZXNzaW9uVHlwZSB9O1xuXHRcdH1cblxuXHRcdC8vIENMSSAvIENsYXVkZSBzZXNzaW9uczogbGFuZ3VhZ2UgbW9kZWxzIHJlZ2lzdGVyZWQgYWdhaW5zdCB0aGUgc2Vzc2lvbidzXG5cdFx0Ly8gYHRhcmdldENoYXRTZXNzaW9uVHlwZWAuXG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSBzZXNzaW9uPy5zZXNzaW9uVHlwZTtcblx0XHRpZiAoIXNlc3Npb25UeXBlKSB7XG5cdFx0XHRyZXR1cm4geyBtb2RlbHM6IFtdLCBkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiByZXNvbHZlTW9kZWxJZGVudGlmaWVyKFtdLCBkZXNpcmVkTW9kZWxJZCwgZmFsc2UpLCBtb2RlbFRhcmdldDogdW5kZWZpbmVkIH07XG5cdFx0fVxuXHRcdGNvbnN0IGFsbE1vZGVscyA9IGdldFJlZ2lzdGVyZWRMYW5ndWFnZU1vZGVscyh0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZSk7XG5cdFx0Y29uc3QgbW9kZWxzID0gYWxsTW9kZWxzLmZpbHRlcihtb2RlbCA9PiBtb2RlbC5tZXRhZGF0YS50YXJnZXRDaGF0U2Vzc2lvblR5cGUgPT09IHNlc3Npb25UeXBlKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bW9kZWxzLFxuXHRcdFx0ZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjogcmVzb2x2ZU1vZGVsSWRlbnRpZmllckZyb21MYW5ndWFnZU1vZGVscyhtb2RlbHMsIGRlc2lyZWRNb2RlbElkLCB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZSwgYWxsTW9kZWxzKSxcblx0XHRcdG1vZGVsVGFyZ2V0OiBzZXNzaW9uVHlwZSxcblx0XHR9O1xuXHR9XG5cblx0Z2V0TW9kZWxQaWNrZXJPcHRpb25zKHNlc3Npb25JZDogc3RyaW5nKTogSVNlc3Npb25Nb2RlbFBpY2tlck9wdGlvbnMge1xuXHRcdC8vIEEgc2Vzc2lvbiB0eXBlIHRoYXQgcmVxdWlyZXMgYW4gZXhwbGljaXQgbW9kZWwgc2VsZWN0aW9uIGNhbm5vdCBmYWxsXG5cdFx0Ly8gYmFjayB0byBBdXRvLiBXaGVuIGl0IGhhcyBubyBtb2RlbHMgKGUuZy4gdGhlIENsYXVkZSBhZ2VudCBmb3IgYVxuXHRcdC8vIENvcGlsb3QgRnJlZSAvIFN0dWRlbnQgdXNlciksIHRoZSBwaWNrZXIgc2hvd3MgYSBcIk5vIG1vZGVscyBhdmFpbGFibGVcIlxuXHRcdC8vIHN0YXRlIGluc3RlYWQgb2YgQXV0by4gSGFybmVzc2VzIHRoYXQgc3VwcG9ydCBBdXRvIChlLmcuIHRoZSBDb3BpbG90XG5cdFx0Ly8gQ0xJIGFnZW50KSBrZWVwIHRoZSBBdXRvIGZhbGxiYWNrLiBEZXJpdmUgdGhpcyBmcm9tIHRoZSBjb250cmlidXRpb24nc1xuXHRcdC8vIGRlY2xhcmF0aXZlIGBzaG93QXV0b01vZGVsYCBmbGFnIHJhdGhlciB0aGFuIGhhcmRjb2Rpbmdcblx0XHQvLyBzZXNzaW9uLXR5cGUgbmFtZXMuXG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSB0aGlzLmdldFNlc3Npb24oc2Vzc2lvbklkKT8uc2Vzc2lvblR5cGU7XG5cdFx0Y29uc3Qgc2hvd0F1dG9Nb2RlbCA9ICFzZXNzaW9uVHlwZSB8fCB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uuc3VwcG9ydHNBdXRvTW9kZWxGb3JTZXNzaW9uVHlwZShzZXNzaW9uVHlwZSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVzZUdyb3VwZWRNb2RlbFBpY2tlcjogdHJ1ZSxcblx0XHRcdHNob3dGZWF0dXJlZDogdHJ1ZSxcblx0XHRcdHNob3dVbmF2YWlsYWJsZUZlYXR1cmVkOiBmYWxzZSxcblx0XHRcdHNob3dNYW5hZ2VNb2RlbHNBY3Rpb246IGZhbHNlLFxuXHRcdFx0c2hvd0F1dG9Nb2RlbCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9TeW50aGV0aWNNb2RlbChpdGVtOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0pOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIge1xuXHRcdGNvbnN0IG1vZGVsTWV0YWRhdGEgPSBpdGVtLm1vZGVsTWV0YWRhdGE7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkZW50aWZpZXI6IGl0ZW0uaWQsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCcnKSxcblx0XHRcdFx0bmFtZTogbW9kZWxNZXRhZGF0YT8ubmFtZSA/PyBpdGVtLm5hbWUsXG5cdFx0XHRcdGlkOiBtb2RlbE1ldGFkYXRhPy5pZCA/PyBpdGVtLmlkLFxuXHRcdFx0XHR2ZW5kb3I6IG1vZGVsTWV0YWRhdGE/LnZlbmRvciA/PyAnJyxcblx0XHRcdFx0dmVyc2lvbjogbW9kZWxNZXRhZGF0YT8udmVyc2lvbiA/PyAnJyxcblx0XHRcdFx0ZmFtaWx5OiBtb2RlbE1ldGFkYXRhPy5mYW1pbHkgPz8gJycsXG5cdFx0XHRcdHRvb2x0aXA6IG1vZGVsTWV0YWRhdGE/LnRvb2x0aXAgPz8gaXRlbS50b29sdGlwLFxuXHRcdFx0XHRwcmljaW5nOiBtb2RlbE1ldGFkYXRhPy5wcmljaW5nLFxuXHRcdFx0XHRtdWx0aXBsaWVyTnVtZXJpYzogbW9kZWxNZXRhZGF0YT8ubXVsdGlwbGllck51bWVyaWMsXG5cdFx0XHRcdGlucHV0Q29zdDogbW9kZWxNZXRhZGF0YT8uaW5wdXRDb3N0LFxuXHRcdFx0XHRvdXRwdXRDb3N0OiBtb2RlbE1ldGFkYXRhPy5vdXRwdXRDb3N0LFxuXHRcdFx0XHRjYWNoZUNvc3Q6IG1vZGVsTWV0YWRhdGE/LmNhY2hlQ29zdCxcblx0XHRcdFx0Y2FjaGVXcml0ZUNvc3Q6IG1vZGVsTWV0YWRhdGE/LmNhY2hlV3JpdGVDb3N0LFxuXHRcdFx0XHRsb25nQ29udGV4dElucHV0Q29zdDogbW9kZWxNZXRhZGF0YT8ubG9uZ0NvbnRleHRJbnB1dENvc3QsXG5cdFx0XHRcdGxvbmdDb250ZXh0T3V0cHV0Q29zdDogbW9kZWxNZXRhZGF0YT8ubG9uZ0NvbnRleHRPdXRwdXRDb3N0LFxuXHRcdFx0XHRsb25nQ29udGV4dENhY2hlQ29zdDogbW9kZWxNZXRhZGF0YT8ubG9uZ0NvbnRleHRDYWNoZUNvc3QsXG5cdFx0XHRcdGxvbmdDb250ZXh0Q2FjaGVXcml0ZUNvc3Q6IG1vZGVsTWV0YWRhdGE/LmxvbmdDb250ZXh0Q2FjaGVXcml0ZUNvc3QsXG5cdFx0XHRcdHByaWNlQ2F0ZWdvcnk6IG1vZGVsTWV0YWRhdGE/LnByaWNlQ2F0ZWdvcnksXG5cdFx0XHRcdHByb21vOiBtb2RlbE1ldGFkYXRhPy5wcm9tbyxcblx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IG1vZGVsTWV0YWRhdGE/Lm1heElucHV0VG9rZW5zID8/IDAsXG5cdFx0XHRcdG1heE91dHB1dFRva2VuczogbW9kZWxNZXRhZGF0YT8ubWF4T3V0cHV0VG9rZW5zID8/IDAsXG5cdFx0XHRcdGNhcGFiaWxpdGllczogbW9kZWxNZXRhZGF0YT8uY2FwYWJpbGl0aWVzID8ge1xuXHRcdFx0XHRcdHZpc2lvbjogbW9kZWxNZXRhZGF0YS5jYXBhYmlsaXRpZXMudmlzaW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsaW5nOiBtb2RlbE1ldGFkYXRhLmNhcGFiaWxpdGllcy50b29sQ2FsbGluZyxcblx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0aXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSxcblx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0c2V0TW9kZWwoc2Vzc2lvbklkOiBzdHJpbmcsIG1vZGVsSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9uZXdTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAobmV3U2Vzc2lvbikge1xuXHRcdFx0bmV3U2Vzc2lvbi5zZXRNb2RlbElkKG1vZGVsSWQpO1xuXHRcdFx0Ly8gQ2xvdWQgc2Vzc2lvbnMgYWRkaXRpb25hbGx5IHBlcnNpc3QgdGhlIHNlbGVjdGlvbiBhcyB0aGUgdmFsdWUgb2Zcblx0XHRcdC8vIHRoZSBgbW9kZWxzYCBvcHRpb24gZ3JvdXAgc28gdGhlIGV4dGVuc2lvbiBob3N0IGhvbm91cnMgaXQuXG5cdFx0XHRpZiAobmV3U2Vzc2lvbiBpbnN0YW5jZW9mIFJlbW90ZU5ld1Nlc3Npb24pIHtcblx0XHRcdFx0Y29uc3QgeyBtb2RlbE9wdGlvbiB9ID0gbmV3U2Vzc2lvbi5nZXRNb2RlbE9wdGlvbnNTbmFwc2hvdCgpO1xuXHRcdFx0XHRjb25zdCBpdGVtID0gbW9kZWxPcHRpb24/Lmdyb3VwLml0ZW1zLmZpbmQoaSA9PiBpLmlkID09PSBtb2RlbElkKTtcblx0XHRcdFx0aWYgKGl0ZW0pIHtcblx0XHRcdFx0XHRuZXdTZXNzaW9uLnNldE9wdGlvblZhbHVlKG1vZGVsT3B0aW9uIS5ncm91cC5pZCwgaXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9lbnN1cmVTZXNzaW9uQ2FjaGUoKTtcblx0XHR0aGlzLl9maW5kQ2hhdFNlc3Npb24oc2Vzc2lvbklkKT8uc2V0TW9kZWxJZChtb2RlbElkKTtcblx0fVxuXG5cdHNldE1vZGUoc2Vzc2lvbklkOiBzdHJpbmcsIG1vZGVJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2V0U2Vzc2lvbk1vZGUgPSAoc2Vzc2lvbjogSUNvcGlsb3RDaGF0U2Vzc2lvbik6IHZvaWQgPT4ge1xuXHRcdFx0bGV0IG1vZGU6IElDaGF0TW9kZSB8IHVuZGVmaW5lZDtcblx0XHRcdHN3aXRjaCAobW9kZUlkKSB7XG5cdFx0XHRcdGNhc2UgQ2hhdE1vZGVLaW5kLkFnZW50OlxuXHRcdFx0XHRcdG1vZGUgPSBDaGF0TW9kZS5BZ2VudDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDaGF0TW9kZUtpbmQuRWRpdDpcblx0XHRcdFx0XHRtb2RlID0gQ2hhdE1vZGUuRWRpdDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDaGF0TW9kZUtpbmQuQXNrOlxuXHRcdFx0XHRcdG1vZGUgPSBDaGF0TW9kZS5Bc2s7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlcyA9IHRoaXMuY2hhdE1vZGVTZXJ2aWNlLmNyZWF0ZU1vZGVzKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRtb2RlID0gbW9kZXMuZmluZE1vZGVCeUlkKG1vZGVJZCkgPz8gbW9kZXMuZmluZE1vZGVCeU5hbWUobW9kZUlkKTtcblx0XHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdFx0bW9kZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAobW9kZSkge1xuXHRcdFx0XHRzZXNzaW9uLnNldE1vZGUobW9kZSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9uZXdTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAobmV3U2Vzc2lvbikge1xuXHRcdFx0c2V0U2Vzc2lvbk1vZGUobmV3U2Vzc2lvbik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZW5zdXJlU2Vzc2lvbkNhY2hlKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2ZpbmRDaGF0U2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRzZXRTZXNzaW9uTW9kZShzZXNzaW9uKTtcblx0XHR9XG5cdH1cblxuXHRzZXRQZXJtaXNzaW9uTGV2ZWwoc2Vzc2lvbklkOiBzdHJpbmcsIGxldmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBuZXdTZXNzaW9uID0gdGhpcy5fbmV3U2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKG5ld1Nlc3Npb24pIHtcblx0XHRcdGlmIChpc0NoYXRQZXJtaXNzaW9uTGV2ZWwobGV2ZWwpKSB7XG5cdFx0XHRcdG5ld1Nlc3Npb24uc2V0UGVybWlzc2lvbkxldmVsKGxldmVsKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9lbnN1cmVTZXNzaW9uQ2FjaGUoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fZmluZENoYXRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKHNlc3Npb24gJiYgaXNDaGF0UGVybWlzc2lvbkxldmVsKGxldmVsKSkge1xuXHRcdFx0c2Vzc2lvbi5zZXRQZXJtaXNzaW9uTGV2ZWwobGV2ZWwpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNldElzb2xhdGlvbk1vZGUoc2Vzc2lvbklkOiBzdHJpbmcsIG1vZGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChtb2RlICE9PSAnd29ya3RyZWUnICYmIG1vZGUgIT09ICd3b3Jrc3BhY2UnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9uZXdTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAobmV3U2Vzc2lvbikge1xuXHRcdFx0bmV3U2Vzc2lvbi5zZXRJc29sYXRpb25Nb2RlKG1vZGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2Vuc3VyZVNlc3Npb25DYWNoZSgpO1xuXHRcdHRoaXMuX2ZpbmRDaGF0U2Vzc2lvbihzZXNzaW9uSWQpPy5zZXRJc29sYXRpb25Nb2RlKG1vZGUpO1xuXHR9XG5cblx0YXN5bmMgc2V0QnJhbmNoKHNlc3Npb25JZDogc3RyaW5nLCBicmFuY2g6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9uZXdTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAobmV3U2Vzc2lvbikge1xuXHRcdFx0bmV3U2Vzc2lvbi5zZXRCcmFuY2goYnJhbmNoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9lbnN1cmVTZXNzaW9uQ2FjaGUoKTtcblx0XHR0aGlzLl9maW5kQ2hhdFNlc3Npb24oc2Vzc2lvbklkKT8uc2V0QnJhbmNoKGJyYW5jaCk7XG5cdH1cblxuXHQvLyAtLSBTZXNzaW9uIEFjdGlvbnMgLS1cblxuXHRhc3luYyBhcmNoaXZlU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFVuY29tbWl0dGVkIChORVcpIHNlc3Npb25zIFx1MjAxNCBpbmNsdWRpbmcgdGhvc2UgdGhhdCB3ZXJlIGNhbmNlbGxlZCBtaWQtZmxpZ2h0IFx1MjAxNFxuXHRcdC8vIG11c3QgYmUgYXJjaGl2ZWQgdmlhIHRoZWlyIGNoYXQtYWRhcHRlciBkaXJlY3RseS4gVGhlaXIgYWdlbnQtaG9zdCBlbnRyeVxuXHRcdC8vIChpZiBhbnksIGZyb20gYGdldE9yQ3JlYXRlQ2hhdFNlc3Npb25gKSBoYXMgcHJvdmlkZXJUeXBlIGBMb2NhbGAsIHdoaWNoXG5cdFx0Ly8gaXMgZmlsdGVyZWQgb3V0IGJ5IGBfcmVmcmVzaFNlc3Npb25DYWNoZWAsIHNvIGNoYW5nZXMgbWFkZSB0aHJvdWdoXG5cdFx0Ly8gYGFnZW50U2Vzc2lvbi5zZXRBcmNoaXZlZCh0cnVlKWAgd291bGQgbmV2ZXIgcHJvcGFnYXRlIHRvIHRoZSBjaGF0XG5cdFx0Ly8gYWRhcHRlcidzIGBfaXNBcmNoaXZlZGAgb2JzZXJ2YWJsZS4gVGhlIHJlc3VsdCB3b3VsZCBiZSBhIG5vLW9wIHRpY2tcblx0XHQvLyBpbiB0aGUgVUkgZXZlbiB0aG91Z2ggdGhlIGFnZW50LWhvc3QgbW9kZWwgdGhpbmtzIHRoZSBzZXNzaW9uIGlzIGFyY2hpdmVkLlxuXHRcdGNvbnN0IGNoYXRTZXNzaW9uID0gdGhpcy5fZmluZENoYXRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKGNoYXRTZXNzaW9uICYmIGlzTmV3U2Vzc2lvbihjaGF0U2Vzc2lvbikpIHtcblx0XHRcdGNoYXRTZXNzaW9uLnNldEFyY2hpdmVkKHRydWUpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW3RoaXMuX2NoYXRUb1Nlc3Npb24oY2hhdFNlc3Npb24pXSB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhZ2VudFNlc3Npb24gPSB0aGlzLl9maW5kQWdlbnRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKGFnZW50U2Vzc2lvbikge1xuXHRcdFx0YWdlbnRTZXNzaW9uLnNldEFyY2hpdmVkKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHVuYXJjaGl2ZVNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBTZWUgYGFyY2hpdmVTZXNzaW9uYCBmb3Igd2h5IE5FVyBzZXNzaW9ucyB0YWtlIGEgc2VwYXJhdGUgcGF0aC5cblx0XHRjb25zdCBjaGF0U2Vzc2lvbiA9IHRoaXMuX2ZpbmRDaGF0U2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGlmIChjaGF0U2Vzc2lvbiAmJiBpc05ld1Nlc3Npb24oY2hhdFNlc3Npb24pKSB7XG5cdFx0XHRjaGF0U2Vzc2lvbi5zZXRBcmNoaXZlZChmYWxzZSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbdGhpcy5fY2hhdFRvU2Vzc2lvbihjaGF0U2Vzc2lvbildIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFnZW50U2Vzc2lvbiA9IHRoaXMuX2ZpbmRBZ2VudFNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRpZiAoYWdlbnRTZXNzaW9uKSB7XG5cdFx0XHRhZ2VudFNlc3Npb24uc2V0QXJjaGl2ZWQoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNldFNlc3Npb25SZWFkU3RhdGUoc2Vzc2lvbklkOiBzdHJpbmcsIGlzUmVhZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIEEgZ3JvdXBlZCBzZXNzaW9uJ3MgcmVhZCBzdGF0ZSBhZ2dyZWdhdGVzIGFjcm9zcyBhbGwgaXRzIGNoYXRzLCBzb1xuXHRcdC8vIHVwZGF0ZSBldmVyeSBjaGF0IGluIHRoZSBncm91cDsgZmFsbCBiYWNrIHRvIHRoZSBpZCBpdHNlbGYgd2hlbiB0aGVcblx0XHQvLyBzZXNzaW9uIGlzIHVuZ3JvdXBlZC5cblx0XHRjb25zdCBjaGF0SWRzID0gdGhpcy5fZ2V0Q2hhdElkc0luR3JvdXAoc2Vzc2lvbklkKTtcblx0XHRjb25zdCB0YXJnZXRJZHMgPSBjaGF0SWRzLmxlbmd0aCA+IDAgPyBjaGF0SWRzIDogW3Nlc3Npb25JZF07XG5cdFx0Zm9yIChjb25zdCBjaGF0SWQgb2YgdGFyZ2V0SWRzKSB7XG5cdFx0XHRjb25zdCBhZ2VudFNlc3Npb24gPSB0aGlzLl9maW5kQWdlbnRTZXNzaW9uKGNoYXRJZCk7XG5cdFx0XHRpZiAoYWdlbnRTZXNzaW9uICYmIGFnZW50U2Vzc2lvbi5pc1JlYWQoKSAhPT0gaXNSZWFkKSB7XG5cdFx0XHRcdGFnZW50U2Vzc2lvbi5zZXRSZWFkKGlzUmVhZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZGVsZXRlU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYXRJZHMgPSB0aGlzLl9nZXRDaGF0SWRzSW5Hcm91cChzZXNzaW9uSWQpO1xuXG5cdFx0Ly8gQ29sbGVjdCBhbGwgYWdlbnQgc2Vzc2lvbnMgdG8gZGVsZXRlIChwcmltYXJ5ICsgZ3JvdXAgbWVtYmVycylcblx0XHRjb25zdCBhbGxDaGF0SWRzID0gbmV3IFNldChbc2Vzc2lvbklkLCAuLi5jaGF0SWRzXSk7XG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uczogSUFnZW50U2Vzc2lvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBjaGF0SWQgb2YgYWxsQ2hhdElkcykge1xuXHRcdFx0Y29uc3QgYWdlbnRTZXNzaW9uID0gdGhpcy5fZmluZEFnZW50U2Vzc2lvbihjaGF0SWQpO1xuXHRcdFx0aWYgKGFnZW50U2Vzc2lvbikge1xuXHRcdFx0XHRhZ2VudFNlc3Npb25zLnB1c2goYWdlbnRTZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoYWdlbnRTZXNzaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIFRlbXAgc2Vzc2lvbiB0aGF0IGhhc24ndCBiZWVuIGNvbW1pdHRlZCBcdTIwMTQgcmVtb3ZlIGl0IGRpcmVjdGx5XG5cdFx0XHR0aGlzLl9jbGVhbnVwVGVtcFNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl9kZWxldGVBZ2VudFNlc3Npb25zKGFnZW50U2Vzc2lvbnMpO1xuXG5cdFx0dGhpcy5fc2Vzc2lvbkdyb3VwQ2FjaGUuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0dGhpcy5fcmVmcmVzaFNlc3Npb25DYWNoZSgpO1xuXHR9XG5cblx0YXN5bmMgZGVsZXRlU2Vzc2lvbnMoc2Vzc2lvbklkczogcmVhZG9ubHkgc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb25JZCBvZiBzZXNzaW9uSWRzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZW5hbWVDaGF0KHNlc3Npb25JZDogc3RyaW5nLCBjaGF0VXJpOiBVUkksIHRpdGxlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhZ2VudFNlc3Npb24gPSB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb24oY2hhdFVyaSk7XG5cdFx0aWYgKGFnZW50U2Vzc2lvbj8ucHJvdmlkZXJUeXBlID09PSBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2dpdGh1Yi5jb3BpbG90LmNsaS5zZXNzaW9ucy5zZXRUaXRsZScsIHsgcmVzb3VyY2U6IGNoYXRVcmkgfSwgdGl0bGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoYWdlbnRTZXNzaW9uPy5wcm92aWRlclR5cGUgPT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbGF1ZGUpIHtcblx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2dpdGh1Yi5jb3BpbG90LmNsYXVkZS5zZXNzaW9ucy5yZW5hbWUnLCB7IHJlc291cmNlOiBjaGF0VXJpIH0sIHRpdGxlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdSZW5hbWluZyBpcyBub3Qgc3VwcG9ydGVkIGZvciB0aGlzIHNlc3Npb24gdHlwZScpO1xuXHR9XG5cblx0YXN5bmMgcmVuYW1lU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZywgdGl0bGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9maW5kU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnJlbmFtZUNoYXQoc2Vzc2lvbklkLCBzZXNzaW9uLm1haW5DaGF0LmdldCgpLnJlc291cmNlLCB0aXRsZSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZGVsZXRlQ2hhdChzZXNzaW9uSWQ6IHN0cmluZywgY2hhdFVyaTogVVJJLCBvcHRpb25zPzogSURlbGV0ZUNoYXRPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2ZpbmRTZXNzaW9uKHNlc3Npb25JZCk7XG5cblx0XHRpZiAoIXNlc3Npb24/LmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c011bHRpcGxlQ2hhdHMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRGVsZXRpbmcgaW5kaXZpZHVhbCBjaGF0cyBpcyBub3Qgc3VwcG9ydGVkIHdoZW4gbXVsdGktY2hhdCBpcyBkaXNhYmxlZCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXRJZHMgPSB0aGlzLl9nZXRDaGF0SWRzSW5Hcm91cChzZXNzaW9uSWQpO1xuXG5cdFx0Ly8gRmluZCB0aGUgY2hhdCBtYXRjaGluZyB0aGUgVVJJIGZpcnN0LCBiZWZvcmUgZGVjaWRpbmcgd2hldGhlciB0b1xuXHRcdC8vIGRlbGV0ZSB0aGUgZW50aXJlIHNlc3Npb24uIFRoaXMgcHJldmVudHMgYWNjaWRlbnRhbGx5IGRlbGV0aW5nIHRoZVxuXHRcdC8vIHdob2xlIHNlc3Npb24gd2hlbiB0aGUgZ3JvdXBpbmcgY2FjaGUgaXMgc3RhbGUgYW5kIGNoYXRJZHMgZG9lc24ndFxuXHRcdC8vIGluY2x1ZGUgdGhlIGNoYXQgYmVpbmcgY2xvc2VkLlxuXHRcdGNvbnN0IGNoYXRJZCA9IGNoYXRJZHMuZmluZChpZCA9PiB7XG5cdFx0XHRjb25zdCBjaGF0ID0gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldCh0aGlzLl9sb2NhbElkRnJvbWNoYXRJZChpZCkpO1xuXHRcdFx0cmV0dXJuIGNoYXQgJiYgY2hhdC5yZXNvdXJjZS50b1N0cmluZygpID09PSBjaGF0VXJpLnRvU3RyaW5nKCk7XG5cdFx0fSk7XG5cdFx0aWYgKCFjaGF0SWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoY2hhdElkcy5sZW5ndGggPD0gMSkge1xuXHRcdFx0Ly8gVGhpcyBpcyB0aGUgb25seSBjaGF0IGluIHRoZSBzZXNzaW9uIFx1MjAxNCBkZWxldGUgdGhlIGVudGlyZSBzZXNzaW9uXG5cdFx0XHRhd2FpdCB0aGlzLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIERlbGV0ZSB0aGUgdW5kZXJseWluZyBhZ2VudCBzZXNzaW9uIGZpcnN0LlxuXHRcdC8vIF9yZWZyZXNoU2Vzc2lvbkNhY2hlTXVsdGlDaGF0IGhhbmRsZXMgdGhlIHJlbW92ZWQgY2hhdCBncmFjZWZ1bGx5OlxuXHRcdC8vIGl0IGRldGVjdHMgdGhlIGNoYXQgYmVsb25ncyB0byBhIGdyb3VwIHdpdGggcmVtYWluaW5nIHNpYmxpbmdzIGFuZFxuXHRcdC8vIGZpcmVzIGEgY2hhbmdlZCBldmVudCBvbiB0aGUgcGFyZW50IHNlc3Npb24gaW5zdGVhZCBvZiBhIHJlbW92ZWQgZXZlbnQuXG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uID0gdGhpcy5fZmluZEFnZW50U2Vzc2lvbihjaGF0SWQpO1xuXHRcdGlmIChhZ2VudFNlc3Npb24pIHtcblx0XHRcdC8vIENvbmZpcm0gZGVsZXRpb24sIHVubGVzcyB0aGUgY2FsbGVyIG9wdGVkIG91dCAoZS5nLiBkaXNjYXJkaW5nIGFcblx0XHRcdC8vIHRyYW5zaWVudCB1bnRpdGxlZCBkcmFmdCkuXG5cdFx0XHRpZiAoIW9wdGlvbnM/LnNraXBDb25maXJtYXRpb24pIHtcblx0XHRcdFx0Y29uc3QgY29uZmlybWVkID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdkZWxldGVDaGF0LmNvbmZpcm0nLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBkZWxldGUgdGhpcyBjaGF0P1wiKSxcblx0XHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdkZWxldGVDaGF0LmRldGFpbCcsIFwiVGhpcyBhY3Rpb24gY2Fubm90IGJlIHVuZG9uZS5cIiksXG5cdFx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoJ2RlbGV0ZUNoYXQuZGVsZXRlJywgXCJEZWxldGVcIilcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICghY29uZmlybWVkLmNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB0aGlzLl9kZWxldGVBZ2VudFNlc3Npb25zKFthZ2VudFNlc3Npb25dKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVW50aXRsZWQgY2hhdCAobm90IHlldCBjb21taXR0ZWQpIC0gY2xlYW4gdXAgZGlyZWN0bHlcblx0XHRcdGNvbnN0IGNoYXQgPSB0aGlzLl9maW5kQ2hhdFNlc3Npb24oY2hhdElkKTtcblx0XHRcdGlmIChjaGF0KSB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IGNoYXQucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR0aGlzLl9pbnZhbGlkYXRlR3JvdXBpbmdDYWNoZXMoKTtcblx0XHRcdFx0aWYgKHRoaXMuX25ld1Nlc3Npb25zLmhhcyhjaGF0SWQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbmV3U2Vzc2lvbnMuZGVsZXRlQW5kRGlzcG9zZShjaGF0SWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zZXNzaW9uR3JvdXBDYWNoZS5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHRcdHRoaXMuX29uRGlkR3JvdXBNZW1iZXJzaGlwQ2hhbmdlLmZpcmUoeyBzZXNzaW9uSWQgfSk7XG5cdFx0XHRjb25zdCByZW1haW5pbmdDaGF0SWRzID0gdGhpcy5fZ2V0Q2hhdElkc0luR3JvdXAoc2Vzc2lvbklkKTtcblx0XHRcdGNvbnN0IHByaW1hcnlDaGF0SWQgPSByZW1haW5pbmdDaGF0SWRzWzBdO1xuXHRcdFx0Y29uc3QgcHJpbWFyeUNoYXQgPSBwcmltYXJ5Q2hhdElkID8gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldCh0aGlzLl9sb2NhbElkRnJvbWNoYXRJZChwcmltYXJ5Q2hhdElkKSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAocHJpbWFyeUNoYXQpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW3RoaXMuX2NoYXRUb1Nlc3Npb24ocHJpbWFyeUNoYXQpXSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kZWxldGVBZ2VudFNlc3Npb25zKGFnZW50U2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNsaVNlc3Npb25JdGVtczogeyByZXNvdXJjZTogVVJJOyBsYWJlbDogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgYWdlbnRTZXNzaW9uIG9mIGFnZW50U2Vzc2lvbnMpIHtcblx0XHRcdGlmIChhZ2VudFNlc3Npb24ucHJvdmlkZXJUeXBlID09PSBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQpIHtcblx0XHRcdFx0Y2xpU2Vzc2lvbkl0ZW1zLnB1c2goeyByZXNvdXJjZTogYWdlbnRTZXNzaW9uLnJlc291cmNlLCBsYWJlbDogYWdlbnRTZXNzaW9uLmxhYmVsIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5jaGF0U2VydmljZS5yZW1vdmVIaXN0b3J5RW50cnkoYWdlbnRTZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNsaVNlc3Npb25JdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdhZ2VudHMuZ2l0aHViLmNvcGlsb3QuY2xpLmRlbGV0ZVNlc3Npb25zJywgY2xpU2Vzc2lvbkl0ZW1zLCB7IHNraXBDb25maXJtYXRpb246IHRydWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZm9ya0NoYXQoc2Vzc2lvbklkOiBzdHJpbmcsIF9zb3VyY2VDaGF0OiBVUkksIF90dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8SUNoYXQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJyR7c2Vzc2lvbklkfScgZG9lcyBub3Qgc3VwcG9ydCBmb3JraW5nIGludG8gYSBjaGF0YCk7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVTaWRlQ2hhdChzZXNzaW9uSWQ6IHN0cmluZywgX3NvdXJjZUNoYXQ6IFVSSSwgX3R1cm5JZDogc3RyaW5nLCBfc2VsZWN0aW9uPzogSVNpZGVDaGF0U2VsZWN0aW9uKTogUHJvbWlzZTxJQ2hhdD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiAnJHtzZXNzaW9uSWR9JyBkb2VzIG5vdCBzdXBwb3J0IHNpZGUgY2hhdHNgKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZU5ld0NoYXQoc2Vzc2lvbklkOiBzdHJpbmcsIHByb21wdD86IHN0cmluZyk6IFByb21pc2U8SUNoYXQ+IHtcblx0XHRjb25zdCBjdXJyZW50TmV3U2Vzc2lvbiA9IHRoaXMuX25ld1Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmIChjdXJyZW50TmV3U2Vzc2lvbikge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGN1cnJlbnROZXdTZXNzaW9uO1xuXHRcdFx0bGV0IG5ld0NoYXQ6IElDaGF0O1xuXHRcdFx0Ly8gbmV3IHNlc3Npb25cblx0XHRcdGlmIChzZXNzaW9uIGluc3RhbmNlb2YgQ2xhdWRlQ29kZU5ld1Nlc3Npb24pIHtcblx0XHRcdFx0Y29uc3QgbmV3SXRlbSA9IGF3YWl0IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5jcmVhdGVOZXdDaGF0U2Vzc2lvbkl0ZW0oXG5cdFx0XHRcdFx0c2Vzc2lvbi50YXJnZXQsXG5cdFx0XHRcdFx0eyBwcm9tcHQ6IHByb21wdCA/PyAnJywgaW5pdGlhbFNlc3Npb25PcHRpb25zOiBzZXNzaW9uLnNlbGVjdGVkT3B0aW9ucy5zaXplID4gMCA/IHNlc3Npb24uc2VsZWN0ZWRPcHRpb25zIDogdW5kZWZpbmVkLCB1bnRpdGxlZFJlc291cmNlOiBzZXNzaW9uLnJlc291cmNlIH0sXG5cdFx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdFx0KTtcblx0XHRcdFx0aWYgKCFuZXdJdGVtKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdbQ29waWxvdENoYXRTZXNzaW9uc1Byb3ZpZGVyXSBGYWlsZWQgdG8gY3JlYXRlIENsYXVkZSBzZXNzaW9uIGl0ZW0nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQoYXdhaXQgdGhpcy5fY3JlYXRlQ2hhdFNlc3Npb24obmV3SXRlbS5yZXNvdXJjZSwgc2Vzc2lvbikpLmRpc3Bvc2UoKTtcblx0XHRcdFx0bmV3Q2hhdCA9IHRoaXMuX3RvQ2hhdChzZXNzaW9uLCBuZXdJdGVtLnJlc291cmNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdChhd2FpdCB0aGlzLl9jcmVhdGVDaGF0U2Vzc2lvbihzZXNzaW9uLnJlc291cmNlLCBzZXNzaW9uKSkuZGlzcG9zZSgpO1xuXHRcdFx0XHRuZXdDaGF0ID0gdGhpcy5fdG9DaGF0KHNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdFx0c2Vzc2lvbi5tYWluQ2hhdC5zZXQobmV3Q2hhdCwgdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybiBuZXdDaGF0O1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5faXNNdWx0aUNoYXRFbmFibGVkKCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW0NvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlcl0gU2Vzc2lvbiAnJHtzZXNzaW9uSWR9JyBkb2VzIG5vdCBzdXBwb3J0IG11bHRpcGxlIGNoYXRzYCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZU5ld1N1YnNlcXVlbnRDaGF0KHNlc3Npb25JZCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVOZXdTdWJzZXF1ZW50Q2hhdChzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8SUNoYXQ+IHtcblx0XHQvLyBGaW5kIHRoZSBwcmltYXJ5IGNoYXQgZm9yIHRoaXMgc2Vzc2lvblxuXHRcdGNvbnN0IGNoYXRJZHMgPSB0aGlzLl9nZXRDaGF0SWRzSW5Hcm91cChzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IGZpcnN0Q2hhdElkID0gY2hhdElkc1swXSA/PyBzZXNzaW9uSWQ7XG5cdFx0Y29uc3QgY2hhdCA9IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQodGhpcy5fbG9jYWxJZEZyb21jaGF0SWQoZmlyc3RDaGF0SWQpKTtcblx0XHRpZiAoIWNoYXQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiAnJHtzZXNzaW9uSWR9JyBub3QgZm91bmRgKTtcblx0XHR9XG5cblx0XHRpZiAoY2hhdC5zZXNzaW9uVHlwZSAhPT0gQ29waWxvdENMSVNlc3Npb25UeXBlLmlkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ011bHRpcGxlIGNoYXRzIHBlciBzZXNzaW9uIGlzIG9ubHkgc3VwcG9ydGVkIGZvciBDb3BpbG90IENMSSBzZXNzaW9ucycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNoYXQud29ya3NwYWNlLmdldCgpO1xuXHRcdGlmICghd29ya3NwYWNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NoYXQgc2Vzc2lvbiBoYXMgbm8gYXNzb2NpYXRlZCB3b3Jrc3BhY2UnKTtcblx0XHR9XG5cblx0XHRjb25zdCBmb2xkZXIgPSB3b3Jrc3BhY2UuZm9sZGVyc1swXTtcblx0XHRpZiAoIWZvbGRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdXb3Jrc3BhY2UgaGFzIG5vIGZvbGRlcicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld1dvcmtzcGFjZSA9IHRoaXMucmVzb2x2ZVdvcmtzcGFjZShmb2xkZXIud29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0aWYgKCFuZXdXb3Jrc3BhY2UpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHJlc29sdmUgd29ya3NwYWNlIGZvciB3b3JraW5nIGRpcmVjdG9yeSBVUkk6ICR7Zm9sZGVyLndvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogYC91bnRpdGxlZC0ke2dlbmVyYXRlVXVpZCgpfWAgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29waWxvdENMSVNlc3Npb24sIHJlc291cmNlLCBuZXdXb3Jrc3BhY2UsIHRoaXMuaWQpO1xuXHRcdHNlc3Npb24uc2V0TW9kZWxJZChjaGF0Lm1vZGVsSWQuZ2V0KCkpO1xuXHRcdHNlc3Npb24uc2V0SXNvbGF0aW9uTW9kZSgnd29ya3NwYWNlJyk7XG5cdFx0c2Vzc2lvbi5zZXRPcHRpb24oUEFSRU5UX1NFU1NJT05fT1BUSU9OX0lELCBjaGF0LnJlc291cmNlLnBhdGguc2xpY2UoMSkpO1xuXHRcdHNlc3Npb24uc2V0UGVybWlzc2lvbkxldmVsKHRoaXMuX2RlZmF1bHRQZXJtaXNzaW9uTGV2ZWwoKSk7XG5cdFx0c2Vzc2lvbi5zZXRUaXRsZShsb2NhbGl6ZSgnbmV3IGNoYXQnLCBcIk5ldyBDaGF0XCIpKTtcblx0XHR0aGlzLl9uZXdTZXNzaW9ucy5zZXQoc2Vzc2lvbi5zZXNzaW9uSWQsIHNlc3Npb24pO1xuXG5cdFx0KGF3YWl0IHRoaXMuX2NyZWF0ZUNoYXRTZXNzaW9uKHNlc3Npb24ucmVzb3VyY2UsIHNlc3Npb24pKS5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl9zZXNzaW9uQ2FjaGUuc2V0KHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSwgc2Vzc2lvbik7XG5cdFx0dGhpcy5faW52YWxpZGF0ZUdyb3VwaW5nQ2FjaGVzKCk7XG5cdFx0dGhpcy5fc2Vzc2lvbkdyb3VwQ2FjaGUuZGVsZXRlKHNlc3Npb25JZCk7XG5cblx0XHR0aGlzLl9vbkRpZEdyb3VwTWVtYmVyc2hpcENoYW5nZS5maXJlKHsgc2Vzc2lvbklkIH0pO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFt0aGlzLl9jaGF0VG9TZXNzaW9uKHNlc3Npb24pXSB9KTtcblxuXHRcdHJldHVybiB0aGlzLl90b0NoYXQoc2Vzc2lvbik7XG5cdH1cblxuXHRhc3luYyBzZW5kUmVxdWVzdChzZXNzaW9uSWQ6IHN0cmluZywgY2hhdFJlc291cmNlOiBVUkksIG9wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPElTZXNzaW9uPiB7XG5cdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IHRoaXMuX25ld1Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmIChuZXdTZXNzaW9uKSB7XG5cdFx0XHRpZiAoIXRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKG5ld1Nlc3Npb24ubWFpbkNoYXQuZ2V0KCkucmVzb3VyY2UsIGNoYXRSZXNvdXJjZSkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDaGF0IHJlc291cmNlIGRvZXMgbm90IG1hdGNoIHRoZSBtYWluIGNoYXQgb2YgdGhlIGN1cnJlbnQgbmV3IHNlc3Npb24nKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl9zZW5kRmlyc3RDaGF0KG5ld1Nlc3Npb24sIGNoYXRSZXNvdXJjZSwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2ZpbmRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJyR7c2Vzc2lvbklkfScgbm90IGZvdW5kYCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFzZXNzaW9uLmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c011bHRpcGxlQ2hhdHMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTXVsdGlwbGUgY2hhdHMgcGVyIHNlc3Npb24gaXMgbm90IHN1cHBvcnRlZCcpO1xuXHRcdH1cblxuXHRcdGlmICghc2Vzc2lvbi5jaGF0cy5nZXQoKS5zb21lKGNoYXQgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoY2hhdC5yZXNvdXJjZSwgY2hhdFJlc291cmNlKSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2hhdCAnJHtjaGF0UmVzb3VyY2UudG9TdHJpbmcoKX0nIGRvZXMgbm90IGJlbG9uZyB0byBzZXNzaW9uICcke3Nlc3Npb25JZH0nYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2V5ID0gY2hhdFJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb24gPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KGtleSk7XG5cdFx0aWYgKCFjaGF0U2Vzc2lvbiB8fCAhKGNoYXRTZXNzaW9uIGluc3RhbmNlb2YgQ29waWxvdENMSVNlc3Npb24pKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENoYXQgJyR7Y2hhdFJlc291cmNlLnRvU3RyaW5nKCl9JyBub3QgZm91bmQgaW4gc2Vzc2lvbiAnJHtzZXNzaW9uSWR9J2ApO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9zZW5kRXhpc3RpbmdDaGF0KHNlc3Npb25JZCwgY2hhdFNlc3Npb24sIG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2VuZEZpcnN0Q2hhdChzZXNzaW9uOiBDb3BpbG90Q0xJU2Vzc2lvbiB8IFJlbW90ZU5ld1Nlc3Npb24gfCBDbGF1ZGVDb2RlTmV3U2Vzc2lvbiwgY2hhdFJlc291cmNlOiBVUkksIG9wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPElTZXNzaW9uPiB7XG5cblx0XHRjb25zdCB7IHF1ZXJ5LCBhdHRhY2hlZENvbnRleHQgfSA9IG9wdGlvbnM7XG5cblx0XHRzZXNzaW9uLnNldFRpdGxlKChvcHRpb25zLnRpdGxlIHx8IHF1ZXJ5LnNwbGl0KCdcXG4nKVswXSkuc3Vic3RyaW5nKDAsIDEwMCkgfHwgbG9jYWxpemUoJ25ldyBzZXNzaW9uJywgXCJOZXcgU2Vzc2lvblwiKSk7XG5cdFx0c2Vzc2lvbi5zZXRTdGF0dXMoU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKTtcblx0XHR0aGlzLl9zZXNzaW9uQ2FjaGUuc2V0KHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSwgc2Vzc2lvbik7XG5cdFx0dGhpcy5faW52YWxpZGF0ZUdyb3VwaW5nQ2FjaGVzKCk7XG5cblx0XHQvLyBDTEkgYW5kIGNsb3VkIHNlc3Npb25zIHN3YXAgdGhlaXIgcmVzb3VyY2UgbWlkLXJlcXVlc3QgKHVudGl0bGVkIFx1MjE5MiByZWFsKSxcblx0XHQvLyBzbyB0aGVpciBjb21taXR0ZWQgcmVzb3VyY2UgaXMgdW5rbm93biB1cC1mcm9udC4gQ2xhdWRlIGNvbW1pdHMgYmVmb3JlXG5cdFx0Ly8gYHNlbmRSZXF1ZXN0YCwgc28gYGNoYXRSZXNvdXJjZWAgaXMgYWxyZWFkeSBjb21taXR0ZWQgXHUyMDE0IHByb3RlY3QgaXQgZnJvbSBhXG5cdFx0Ly8gc3B1cmlvdXMgYF9yZWZyZXNoU2Vzc2lvbkNhY2hlYCByZW1vdmFsIHdoaWxlIHRoZSBzZW5kIGlzIGluLWZsaWdodC5cblx0XHRjb25zdCByZXNvdXJjZUNoYW5nZXNPbkNvbW1pdCA9IHNlc3Npb24gaW5zdGFuY2VvZiBDb3BpbG90Q0xJU2Vzc2lvbiB8fCBzZXNzaW9uIGluc3RhbmNlb2YgUmVtb3RlTmV3U2Vzc2lvbjtcblx0XHRjb25zdCBjb21taXR0ZWRLZXkgPSAhcmVzb3VyY2VDaGFuZ2VzT25Db21taXRcblx0XHRcdD8gY2hhdFJlc291cmNlLnRvU3RyaW5nKClcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGlmIChjb21taXR0ZWRLZXkpIHtcblx0XHRcdHRoaXMuX2luRmxpZ2h0Q29tbWl0cy5hZGQoY29tbWl0dGVkS2V5KTtcblx0XHR9XG5cblx0XHQvLyBBZGQgdGhlIG5ldyBzZXNzaW9uIHRvIHRoZSBzZXNzaW9ucyBtb2RlbCBpbW1lZGlhdGVseSBzbyBpdCBhcHBlYXJzIGluIHRoZSBzZXNzaW9ucyBsaXN0XG5cdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IHRoaXMuX2NoYXRUb1Nlc3Npb24oc2Vzc2lvbik7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtuZXdTZXNzaW9uXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtdIH0pO1xuXG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldENoYXRTZXNzaW9uQ29udHJpYnV0aW9uKHNlc3Npb24udGFyZ2V0KTtcblxuXHRcdC8vIFJlc29sdmUgbW9kZVxuXHRcdGNvbnN0IG1vZGVLaW5kID0gc2Vzc2lvbi5jaGF0TW9kZT8ua2luZCA/PyBDaGF0TW9kZUtpbmQuQWdlbnQ7XG5cdFx0Y29uc3QgbW9kZUlzQnVpbHRpbiA9IHNlc3Npb24uY2hhdE1vZGUgPyBpc0J1aWx0aW5DaGF0TW9kZShzZXNzaW9uLmNoYXRNb2RlKSA6IHRydWU7XG5cdFx0Y29uc3QgbW9kZUlkOiAnYXNrJyB8ICdhZ2VudCcgfCAnZWRpdCcgfCAnY3VzdG9tJyB8IHVuZGVmaW5lZCA9IG1vZGVJc0J1aWx0aW4gPyBtb2RlS2luZCA6ICdjdXN0b20nO1xuXG5cdFx0Y29uc3QgcmF3TW9kZUluc3RydWN0aW9ucyA9IHNlc3Npb24uY2hhdE1vZGU/Lm1vZGVJbnN0cnVjdGlvbnM/LmdldCgpO1xuXHRcdGNvbnN0IG1vZGVJbnN0cnVjdGlvbnMgPSByYXdNb2RlSW5zdHJ1Y3Rpb25zID8ge1xuXHRcdFx0bmFtZTogc2Vzc2lvbi5jaGF0TW9kZSEubmFtZS5nZXQoKSxcblx0XHRcdGNvbnRlbnQ6IHJhd01vZGVJbnN0cnVjdGlvbnMuY29udGVudCxcblx0XHRcdHRvb2xSZWZlcmVuY2VzOiB0aGlzLnRvb2xzU2VydmljZS50b1Rvb2xSZWZlcmVuY2VzKHJhd01vZGVJbnN0cnVjdGlvbnMudG9vbFJlZmVyZW5jZXMpLFxuXHRcdFx0bWV0YWRhdGE6IHJhd01vZGVJbnN0cnVjdGlvbnMubWV0YWRhdGEsXG5cdFx0fSA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHBlcm1pc3Npb25MZXZlbCA9IHNlc3Npb24ucGVybWlzc2lvbkxldmVsLmdldCgpO1xuXG5cdFx0Y29uc3Qgc2VuZE9wdGlvbnM6IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zID0ge1xuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHR1c2VyU2VsZWN0ZWRNb2RlbElkOiBzZXNzaW9uLnNlbGVjdGVkTW9kZWxJZCxcblx0XHRcdG1vZGVJbmZvOiB7XG5cdFx0XHRcdGtpbmQ6IG1vZGVLaW5kLFxuXHRcdFx0XHRpc0J1aWx0aW46IG1vZGVJc0J1aWx0aW4sXG5cdFx0XHRcdG1vZGVJbnN0cnVjdGlvbnMsXG5cdFx0XHRcdHRlbGVtZXRyeU1vZGVJZDogbW9kZUlkLFxuXHRcdFx0XHRhcHBseUNvZGVCbG9ja1N1Z2dlc3Rpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwZXJtaXNzaW9uTGV2ZWwsXG5cdFx0XHR9LFxuXHRcdFx0YWdlbnRJZFNpbGVudDogY29udHJpYnV0aW9uPy50eXBlLFxuXHRcdFx0YXR0YWNoZWRDb250ZXh0LFxuXHRcdFx0YWdlbnRIb3N0U2Vzc2lvbkNvbmZpZzogc2Vzc2lvbiBpbnN0YW5jZW9mIENvcGlsb3RDTElTZXNzaW9uID8gc2Vzc2lvbi5nZXRBZ2VudEhvc3RTZXNzaW9uQ29uZmlnKCkgOiB1bmRlZmluZWQsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX3VwZGF0ZUNoYXRTZXNzaW9uU3RhdGUoY2hhdFJlc291cmNlLCBzZXNzaW9uLCBzZW5kT3B0aW9ucy5tb2RlSW5mbz8ucGVybWlzc2lvbkxldmVsKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtDb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXJdIFNlbmRpbmcgZmlyc3QgY2hhdCBmb3Igc2Vzc2lvbiAke3Nlc3Npb24uc2Vzc2lvbklkfSB3aXRoIG9wdGlvbnM6YCwge1xuXHRcdFx0dXNlclNlbGVjdGVkTW9kZWxJZDogc2VuZE9wdGlvbnMudXNlclNlbGVjdGVkTW9kZWxJZCxcblx0XHR9KTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jaGF0U2VydmljZS5zZW5kUmVxdWVzdChjaGF0UmVzb3VyY2UsIHF1ZXJ5LCBzZW5kT3B0aW9ucyk7XG5cdFx0XHRpZiAocmVzdWx0LmtpbmQgPT09ICdyZWplY3RlZCcpIHtcblx0XHRcdFx0Ly8gQ2xlYW4gdXAgdGhlIHRlbXAgc2Vzc2lvbiB0aGF0IHdhcyBhZGRlZCB0byB0aGUgY2FjaGUgYW5kXG5cdFx0XHRcdC8vIGRpc3BhdGNoZWQgYXMgYGFkZGVkYCBhYm92ZSwgc28gdGhlIFVJIGRvZXNuJ3Qga2VlcCBzaG93aW5nXG5cdFx0XHRcdC8vIGEgc3R1Y2sgSW5Qcm9ncmVzcyBzZXNzaW9uIHRoYXQgd2lsbCBuZXZlciBtYWtlIHByb2dyZXNzLlxuXHRcdFx0XHR0aGlzLl9zZXNzaW9uQ2FjaGUuZGVsZXRlKHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdHRoaXMuX2ludmFsaWRhdGVHcm91cGluZ0NhY2hlcygpO1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uR3JvdXBDYWNoZS5kZWxldGUoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0XHR0aGlzLl9jbGVhckN1cnJlbnROZXdTZXNzaW9uSWZNYXRjaChzZXNzaW9uLCAvKiBsZWFrICovIHRydWUpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtuZXdTZXNzaW9uXSwgY2hhbmdlZDogW10gfSk7XG5cdFx0XHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtEZWZhdWx0Q29waWxvdFByb3ZpZGVyXSBzZW5kUmVxdWVzdCByZWplY3RlZDogJHtyZXN1bHQucmVhc29ufWApO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRXh0cmFjdCBwcm9taXNlcyB0byBkZXRlY3QgY2FuY2VsbGF0aW9uIHZzIG5vcm1hbCBjb21wbGV0aW9uXG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlQ29tcGxldGVQcm9taXNlID0gcmVzdWx0LmtpbmQgPT09ICdzZW50JyA/IHJlc3VsdC5kYXRhLnJlc3BvbnNlQ29tcGxldGVQcm9taXNlIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2VDcmVhdGVkUHJvbWlzZSA9IHJlc3VsdC5raW5kID09PSAnc2VudCcgPyByZXN1bHQuZGF0YS5yZXNwb25zZUNyZWF0ZWRQcm9taXNlIDogdW5kZWZpbmVkO1xuXHRcdFx0cmVzcG9uc2VDcmVhdGVkUHJvbWlzZT8udGhlbihyID0+IHtcblx0XHRcdFx0aWYgKHI/LmlzQ2FuY2VsZWQpIHtcblx0XHRcdFx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRsZXQgY29tbWl0dGVkUmVzb3VyY2UgPSBjaGF0UmVzb3VyY2U7XG5cdFx0XHRcdGlmIChyZXNvdXJjZUNoYW5nZXNPbkNvbW1pdCkge1xuXHRcdFx0XHRcdC8vIExlYXJuIHRoZSBjb21taXR0ZWQgcmVzb3VyY2UgKHVudGl0bGVkIFx1MjE5MiByZWFsKSBmcm9tIHRoZSBjb21taXRcblx0XHRcdFx0XHQvLyBldmVudCwgdGhlbiBwcm90ZWN0IGl0IG5vdyB0aGF0IHdlIGtub3cgaXQuIENsb3VkIHNlc3Npb25zIGRlZmVyXG5cdFx0XHRcdFx0Ly8gdGhlaXIgY29tbWl0IGJlaGluZCBhIGNvbmZpcm1hdGlvbiArIG5ldHdvcmsgZGVsZWdhdGlvbi5cblx0XHRcdFx0XHRjb21taXR0ZWRSZXNvdXJjZSA9IGF3YWl0IHRoaXMuX3dhaXRGb3JDb21taXR0ZWRTZXNzaW9uKHNlc3Npb24ucmVzb3VyY2UsIHJlc3BvbnNlQ29tcGxldGVQcm9taXNlLCByZXNwb25zZUNyZWF0ZWRQcm9taXNlLCB7IGRlZmVycmVkOiBzZXNzaW9uIGluc3RhbmNlb2YgUmVtb3RlTmV3U2Vzc2lvbiB9KTtcblx0XHRcdFx0XHR0aGlzLl9pbkZsaWdodENvbW1pdHMuYWRkKGNvbW1pdHRlZFJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHQvLyBXYWl0IGZvciBfcmVmcmVzaFNlc3Npb25DYWNoZSB0byBwb3B1bGF0ZSB0aGUgY29tbWl0dGVkIGFkYXB0ZXJcblx0XHRcdFx0XHRjb25zdCBjb21taXR0ZWRDaGF0ID0gYXdhaXQgdGhpcy5fd2FpdEZvclNlc3Npb25JbkNhY2hlKGNvbW1pdHRlZFJlc291cmNlLCBjdHMudG9rZW4pO1xuXHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25DYWNoZS5kZWxldGUoc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0XHR0aGlzLl9jbGVhckN1cnJlbnROZXdTZXNzaW9uSWZNYXRjaChzZXNzaW9uKTtcblxuXHRcdFx0XHRcdGNvbnN0IGNvbW1pdHRlZFNlc3Npb24gPSB0aGlzLl9jaGF0VG9TZXNzaW9uKGNvbW1pdHRlZENoYXQpO1xuXHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25Hcm91cENhY2hlLmRlbGV0ZShzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZXBsYWNlU2Vzc2lvbi5maXJlKHsgZnJvbTogbmV3U2Vzc2lvbiwgdG86IGNvbW1pdHRlZFNlc3Npb24gfSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gY29tbWl0dGVkU2Vzc2lvbjtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHR0aGlzLl9pbkZsaWdodENvbW1pdHMuZGVsZXRlKGNvbW1pdHRlZFJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLl9jbGVhckN1cnJlbnROZXdTZXNzaW9uSWZNYXRjaChzZXNzaW9uLCAvKiBsZWFrICovIHRydWUpO1xuXG5cdFx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKSB7XG5cdFx0XHRcdFx0c2Vzc2lvbi5zZXRTdGF0dXMoU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtuZXdTZXNzaW9uXSB9KTtcblx0XHRcdFx0XHRyZXR1cm4gbmV3U2Vzc2lvbjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFVuZXhwZWN0ZWQgZXJyb3IgXHUyMDE0IGNsZWFuIHVwIHRoZSB0ZW1wIHNlc3Npb24gZW50aXJlbHlcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLmRlbGV0ZShzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR0aGlzLl9pbnZhbGlkYXRlR3JvdXBpbmdDYWNoZXMoKTtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbkdyb3VwQ2FjaGUuZGVsZXRlKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbdGhpcy5fY2hhdFRvU2Vzc2lvbihzZXNzaW9uKV0sIGNoYW5nZWQ6IFtdIH0pO1xuXHRcdFx0XHRzZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtDb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXJdIEZhaWxlZCB0byBzZW5kIGZpcnN0IGNoYXQgZm9yIHNlc3Npb24gJHtzZXNzaW9uLnNlc3Npb25JZH06YCwgZXJyb3IpO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmIChjb21taXR0ZWRLZXkpIHtcblx0XHRcdFx0dGhpcy5faW5GbGlnaHRDb21taXRzLmRlbGV0ZShjb21taXR0ZWRLZXkpO1xuXHRcdFx0fVxuXHRcdFx0cmVmPy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlQ2hhdFNlc3Npb24ocmVzb3VyY2U6IFVSSSwgc2Vzc2lvbjogTmV3U2Vzc2lvbiwgcGVybWlzc2lvbkxldmVsPzogQ2hhdFBlcm1pc3Npb25MZXZlbCk6IFByb21pc2U8SURpc3Bvc2FibGU+IHtcblx0XHRhd2FpdCB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0T3JDcmVhdGVDaGF0U2Vzc2lvbihyZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0cmV0dXJuIHRoaXMuX3VwZGF0ZUNoYXRTZXNzaW9uU3RhdGUocmVzb3VyY2UsIHNlc3Npb24sIHBlcm1pc3Npb25MZXZlbCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVDaGF0U2Vzc2lvblN0YXRlKHJlc291cmNlOiBVUkksIHNlc3Npb246IE5ld1Nlc3Npb24sIHBlcm1pc3Npb25MZXZlbD86IENoYXRQZXJtaXNzaW9uTGV2ZWwpOiBQcm9taXNlPElEaXNwb3NhYmxlPiB7XG5cdFx0Y29uc3QgbW9kZWxSZWYgPSBhd2FpdCB0aGlzLmNoYXRTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKHJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRpZiAoIW1vZGVsUmVmKSB7XG5cdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IG1vZGVsUmVmLm9iamVjdDtcblx0XHRpZiAoc2Vzc2lvbi5zZWxlY3RlZE1vZGVsSWQpIHtcblx0XHRcdGNvbnN0IGxhbmd1YWdlTW9kZWwgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKHNlc3Npb24uc2VsZWN0ZWRNb2RlbElkKTtcblx0XHRcdGlmIChsYW5ndWFnZU1vZGVsKSB7XG5cdFx0XHRcdG1vZGVsLmlucHV0TW9kZWwuc2V0U3RhdGUoeyBzZWxlY3RlZE1vZGVsOiB7IGlkZW50aWZpZXI6IHNlc3Npb24uc2VsZWN0ZWRNb2RlbElkLCBtZXRhZGF0YTogbGFuZ3VhZ2VNb2RlbCB9IH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbi5jaGF0TW9kZSkge1xuXHRcdFx0bW9kZWwuaW5wdXRNb2RlbC5zZXRTdGF0ZSh7IG1vZGU6IHsgaWQ6IHNlc3Npb24uY2hhdE1vZGUuaWQsIGtpbmQ6IHNlc3Npb24uY2hhdE1vZGUua2luZCB9IH0pO1xuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbi5zZWxlY3RlZE9wdGlvbnMuc2l6ZSA+IDApIHtcblx0XHRcdHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS51cGRhdGVTZXNzaW9uT3B0aW9ucyhyZXNvdXJjZSwgc2Vzc2lvbi5zZWxlY3RlZE9wdGlvbnMpO1xuXHRcdH1cblx0XHRpZiAocGVybWlzc2lvbkxldmVsKSB7XG5cdFx0XHRtb2RlbC5pbnB1dE1vZGVsLnNldFN0YXRlKHsgcGVybWlzc2lvbkxldmVsIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gbW9kZWxSZWY7XG5cdH1cblxuXHQvKipcblx0ICogU2VuZHMgYSByZXF1ZXN0IGZvciBhbiBleGlzdGluZyBjaGF0IHNlc3Npb24gdGhhdCBpcyBhbHJlYWR5IHJlZ2lzdGVyZWRcblx0ICogaW4gdGhlIGNhY2hlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfc2VuZEV4aXN0aW5nQ2hhdChzZXNzaW9uSWQ6IHN0cmluZywgbmV3Q2hhdFNlc3Npb246IENvcGlsb3RDTElTZXNzaW9uLCBvcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxJU2Vzc2lvbj4ge1xuXHRcdC8vIE1hcmsgYXMgaW4gcHJvZ3Jlc3Mgbm93IHRoYXQgd2UncmUgc2VuZGluZ1xuXHRcdG5ld0NoYXRTZXNzaW9uLnNldFN0YXR1cyhTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXHRcdGNvbnN0IGtleSA9IG5ld0NoYXRTZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCk7XG5cblx0XHQvLyBJbnZhbGlkYXRlIHRoZSBzZXNzaW9uIGdyb3VwIGNhY2hlIHNvIGl0IHJlYnVpbGRzIHdpdGggdGhlIG5ldyBjaGF0XG5cdFx0dGhpcy5fc2Vzc2lvbkdyb3VwQ2FjaGUuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW3RoaXMuX2NoYXRUb1Nlc3Npb24obmV3Q2hhdFNlc3Npb24pXSB9KTtcblxuXHRcdGNvbnN0IHsgcXVlcnksIGF0dGFjaGVkQ29udGV4dCB9ID0gb3B0aW9ucztcblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbihuZXdDaGF0U2Vzc2lvbi50YXJnZXQpO1xuXG5cdFx0Y29uc3Qgc2VuZE9wdGlvbnM6IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zID0ge1xuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHR1c2VyU2VsZWN0ZWRNb2RlbElkOiBuZXdDaGF0U2Vzc2lvbi5zZWxlY3RlZE1vZGVsSWQsXG5cdFx0XHRtb2RlSW5mbzoge1xuXHRcdFx0XHRraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdGlzQnVpbHRpbjogdHJ1ZSxcblx0XHRcdFx0bW9kZUluc3RydWN0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0XHR0ZWxlbWV0cnlNb2RlSWQ6ICdhZ2VudCcsXG5cdFx0XHRcdGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBlcm1pc3Npb25MZXZlbDogbmV3Q2hhdFNlc3Npb24ucGVybWlzc2lvbkxldmVsLmdldCgpLFxuXHRcdFx0fSxcblx0XHRcdGFnZW50SWRTaWxlbnQ6IGNvbnRyaWJ1dGlvbj8udHlwZSxcblx0XHRcdGF0dGFjaGVkQ29udGV4dCxcblx0XHRcdGFnZW50SG9zdFNlc3Npb25Db25maWc6IG5ld0NoYXRTZXNzaW9uLmdldEFnZW50SG9zdFNlc3Npb25Db25maWcoKSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fdXBkYXRlQ2hhdFNlc3Npb25TdGF0ZShuZXdDaGF0U2Vzc2lvbi5yZXNvdXJjZSwgbmV3Q2hhdFNlc3Npb24pO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBTZW5kIHJlcXVlc3Rcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY2hhdFNlcnZpY2Uuc2VuZFJlcXVlc3QobmV3Q2hhdFNlc3Npb24ucmVzb3VyY2UsIHF1ZXJ5LCBzZW5kT3B0aW9ucyk7XG5cdFx0XHRpZiAocmVzdWx0LmtpbmQgPT09ICdyZWplY3RlZCcpIHtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR0aGlzLl9pbnZhbGlkYXRlR3JvdXBpbmdDYWNoZXMoKTtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbRGVmYXVsdENvcGlsb3RQcm92aWRlcl0gc2VuZFJlcXVlc3QgcmVqZWN0ZWQ6ICR7cmVzdWx0LnJlYXNvbn1gKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRXh0cmFjdCBwcm9taXNlcyB0byBkZXRlY3QgY2FuY2VsbGF0aW9uIHZzIG5vcm1hbCBjb21wbGV0aW9uXG5cdFx0XHRjb25zdCByZXNwb25zZUNvbXBsZXRlUHJvbWlzZSA9IHJlc3VsdC5raW5kID09PSAnc2VudCdcblx0XHRcdFx0PyByZXN1bHQuZGF0YS5yZXNwb25zZUNvbXBsZXRlUHJvbWlzZVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHJlc3BvbnNlQ3JlYXRlZFByb21pc2UgPSByZXN1bHQua2luZCA9PT0gJ3NlbnQnXG5cdFx0XHRcdD8gcmVzdWx0LmRhdGEucmVzcG9uc2VDcmVhdGVkUHJvbWlzZVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Ly8gV2FpdCBmb3IgdGhlIHNlc3Npb24gdG8gYmUgY29tbWl0dGVkXG5cdFx0XHRcdGNvbnN0IGNvbW1pdHRlZFJlc291cmNlID0gYXdhaXQgdGhpcy5fd2FpdEZvckNvbW1pdHRlZFNlc3Npb24obmV3Q2hhdFNlc3Npb24ucmVzb3VyY2UsIHJlc3BvbnNlQ29tcGxldGVQcm9taXNlLCByZXNwb25zZUNyZWF0ZWRQcm9taXNlKTtcblxuXHRcdFx0XHRjb25zdCBjb21taXR0ZWRDaGF0ID0gYXdhaXQgdGhpcy5fd2FpdEZvclNlc3Npb25JbkNhY2hlKGNvbW1pdHRlZFJlc291cmNlKTtcblxuXHRcdFx0XHQvLyBDbGVhbiB1cCB0ZW1wXG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25DYWNoZS5kZWxldGUoa2V5KTtcblx0XHRcdFx0dGhpcy5faW52YWxpZGF0ZUdyb3VwaW5nQ2FjaGVzKCk7XG5cdFx0XHRcdHRoaXMuX2NsZWFyQ3VycmVudE5ld1Nlc3Npb25JZk1hdGNoKG5ld0NoYXRTZXNzaW9uKTtcblxuXHRcdFx0XHQvLyBJbnZhbGlkYXRlIHRoZSBzZXNzaW9uIGdyb3VwIGNhY2hlIHNvIGl0IHJlYnVpbGRzIHdpdGggdGhlIGNvbW1pdHRlZCBjaGF0XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25Hcm91cENhY2hlLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZEdyb3VwTWVtYmVyc2hpcENoYW5nZS5maXJlKHsgc2Vzc2lvbklkIH0pO1xuXHRcdFx0XHRjb25zdCB1cGRhdGVkU2Vzc2lvbiA9IHRoaXMuX2NoYXRUb1Nlc3Npb24oY29tbWl0dGVkQ2hhdCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFt1cGRhdGVkU2Vzc2lvbl0gfSk7XG5cblx0XHRcdFx0cmV0dXJuIHVwZGF0ZWRTZXNzaW9uO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fY2xlYXJDdXJyZW50TmV3U2Vzc2lvbklmTWF0Y2gobmV3Q2hhdFNlc3Npb24sIC8qIGxlYWsgKi8gdHJ1ZSk7XG5cblx0XHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IpIHtcblx0XHRcdFx0XHQvLyBDYW5jZWxsZWQgYmVmb3JlIGNvbW1pdCBcdTIwMTQga2VlcCB0aGUgY2hhdCBpbiB0aGUgZ3JvdXAgc28gdGhlXG5cdFx0XHRcdFx0Ly8gdXNlciBjYW4gcmV2aWV3IHRoZSBjb250ZW50IHRoZSBhZ2VudCBwcm9kdWNlZC5cblx0XHRcdFx0XHRuZXdDaGF0U2Vzc2lvbi5zZXRTdGF0dXMoU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpO1xuXHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25Hcm91cENhY2hlLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdFx0XHRcdGNvbnN0IHVwZGF0ZWRTZXNzaW9uID0gdGhpcy5fY2hhdFRvU2Vzc2lvbihuZXdDaGF0U2Vzc2lvbik7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW3VwZGF0ZWRTZXNzaW9uXSB9KTtcblx0XHRcdFx0XHRyZXR1cm4gdXBkYXRlZFNlc3Npb247XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBVbmV4cGVjdGVkIGVycm9yIFx1MjAxNCBjbGVhbiB1cCBvbiBlcnJvciwgZmlyZSBjaGFuZ2VkIG9uIHRoZSBwYXJlbnQgc2Vzc2lvbiBncm91cFxuXHRcdFx0XHR0aGlzLl9zZXNzaW9uQ2FjaGUuZGVsZXRlKGtleSk7XG5cdFx0XHRcdHRoaXMuX2ludmFsaWRhdGVHcm91cGluZ0NhY2hlcygpO1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uR3JvdXBDYWNoZS5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHRcdFx0bmV3Q2hhdFNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdFx0XHQvLyBGaW5kIHRoZSBwYXJlbnQgc2Vzc2lvbidzIHByaW1hcnkgY2hhdCB0byBmaXJlIGEgdmFsaWQgY2hhbmdlZCBldmVudFxuXHRcdFx0XHRjb25zdCBwYXJlbnRDaGF0SWRzID0gdGhpcy5fZ2V0Q2hhdElkc0luR3JvdXAoc2Vzc2lvbklkKTtcblx0XHRcdFx0Y29uc3QgcGFyZW50Q2hhdElkID0gcGFyZW50Q2hhdElkc1swXTtcblx0XHRcdFx0Y29uc3QgcGFyZW50Q2hhdCA9IHBhcmVudENoYXRJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQodGhpcy5fbG9jYWxJZEZyb21jaGF0SWQocGFyZW50Q2hhdElkKSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChwYXJlbnRDaGF0KSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW3RoaXMuX2NoYXRUb1Nlc3Npb24ocGFyZW50Q2hhdCldIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBXYWl0cyBmb3IgdGhlIGNvbW1pdHRlZCAocmVhbCkgVVJJIGZvciBhIHNlc3Npb24gYnkgbGlzdGVuaW5nIHRvIHRoZVxuXHQgKiB7QGxpbmsgSUNoYXRTZXNzaW9uc1NlcnZpY2Uub25EaWRDb21taXRTZXNzaW9ufSBldmVudC5cblx0ICpcblx0ICogQnkgZGVmYXVsdCB0aGUgd2FpdCBpcyBib3VuZGVkIGJ5IHJlc3BvbnNlIGNvbXBsZXRpb246IGlmIHRoZSByZXNwb25zZVxuXHQgKiBmaW5pc2hlcyBiZWZvcmUgdGhlIGNvbW1pdCBldmVudCwgd2UgZmFsbCB0aHJvdWdoIHRvIGEgc2hvcnQgc2FmZXR5XG5cdCAqIHRpbWVvdXQuIENsb3VkIHNlc3Npb25zIGluc3RlYWQgcGFzcyB7QGxpbmsgSVdhaXRGb3JDb21taXRPcHRpb25zLmRlZmVycmVkfVxuXHQgKiBiZWNhdXNlIHRoZWlyIGNvbW1pdCBpcyBkZWxheWVkIGJ5IGEgY29uZmlybWF0aW9uIHJvdW5kLXRyaXAgYW5kIG5ldHdvcmtcblx0ICogZGVsZWdhdGlvbiBcdTIwMTQgcmVzcG9uc2UgY29tcGxldGlvbiBmaXJlcyBlYXJseSAoYXQgdGhlIGNvbmZpcm1hdGlvbikgYW5kIGlzXG5cdCAqIG5vdCBhIHNpZ25hbCB0aGF0IHRoZSBjb21taXQgd29uJ3QgY29tZSBcdTIwMTQgc28gdGhleSBza2lwIHRoZSByZXNwb25zZSByYWNlXG5cdCAqIGFuZCB1c2UgYSBsb25nZXIgdGltZW91dC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3dhaXRGb3JDb21taXR0ZWRTZXNzaW9uKFxuXHRcdHVudGl0bGVkUmVzb3VyY2U6IFVSSSxcblx0XHRyZXNwb25zZUNvbXBsZXRlUHJvbWlzZT86IFByb21pc2U8dm9pZD4sXG5cdFx0cmVzcG9uc2VDcmVhdGVkUHJvbWlzZT86IFByb21pc2U8SUNoYXRSZXNwb25zZU1vZGVsPixcblx0XHRvcHRpb25zPzogeyBkZWZlcnJlZD86IGJvb2xlYW4gfSxcblx0KTogUHJvbWlzZTxVUkk+IHtcblx0XHRjb25zdCB0aW1lb3V0TXMgPSBvcHRpb25zPy5kZWZlcnJlZCA/IDUgKiA2MF8wMDAgOiA1XzAwMDtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29tbWl0UHJvbWlzZSA9IG5ldyBQcm9taXNlPFVSST4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uub25EaWRDb21taXRTZXNzaW9uKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChpc0VxdWFsKGUub3JpZ2luYWwsIHVudGl0bGVkUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKGUuY29tbWl0dGVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoIW9wdGlvbnM/LmRlZmVycmVkICYmIHJlc3BvbnNlQ29tcGxldGVQcm9taXNlKSB7XG5cdFx0XHRcdC8vIFJhY2UgdGhlIGNvbW1pdCBldmVudCBhZ2FpbnN0IHRoZSByZXNwb25zZSBjb21wbGV0aW5nLlxuXHRcdFx0XHRjb25zdCBjb21taXR0ZWQgPSBhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0XHRcdGNvbW1pdFByb21pc2UudGhlbih1cmkgPT4gKHsgY29tbWl0dGVkOiB0cnVlIGFzIGNvbnN0LCB1cmkgfSkpLFxuXHRcdFx0XHRcdHJlc3BvbnNlQ29tcGxldGVQcm9taXNlLnRoZW4oKCkgPT4gKHsgY29tbWl0dGVkOiBmYWxzZSBhcyBjb25zdCB9KSksXG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdGlmIChjb21taXR0ZWQuY29tbWl0dGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNvbW1pdHRlZC51cmk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZXNwb25zZSBmaW5pc2hlZCBiZWZvcmUgdGhlIGNvbW1pdCBldmVudCBhcnJpdmVkLlxuXHRcdFx0XHQvLyBUaGUgY29tbWl0IG1heSBzdGlsbCBiZSBpbi1mbGlnaHQgXHUyMDE0IHRoZSBhZ2VudCBjb3VsZCBoYXZlXG5cdFx0XHRcdC8vIGluaXRpYXRlZCB0aGUgd29ya3RyZWUgYmVmb3JlIHRoZSB1c2VyIGNhbmNlbGxlZCwgYW5kIHRoZVxuXHRcdFx0XHQvLyBhc3luYyBJUEMgY2hhaW4gaGFzbid0IGRlbGl2ZXJlZCB0aGUgZXZlbnQgeWV0LiBGYWxsIHRocm91Z2hcblx0XHRcdFx0Ly8gdG8gdGhlIHNhZmV0eSB0aW1lb3V0IHRvIGdpdmUgaXQgYSBjaGFuY2UgdG8gYXJyaXZlLlxuXHRcdFx0fVxuXG5cdFx0XHQvLyBSYWNlIGNvbW1pdCBhZ2FpbnN0IGEgc2FmZXR5IHRpbWVvdXQuIElmIGEgcmVzcG9uc2UtY3JlYXRlZFxuXHRcdFx0Ly8gcHJvbWlzZSBpcyBhdmFpbGFibGUsIGFsc28gcmFjZSBpdCBzbyB3ZSBjYW4gZGV0ZWN0XG5cdFx0XHQvLyBjYW5jZWxsYXRpb24gaW1tZWRpYXRlbHkgaW5zdGVhZCBvZiB3YWl0aW5nIGZvciB0aGUgdGltZW91dC5cblx0XHRcdGNvbnN0IGNhbmRpZGF0ZXM6IFByb21pc2U8eyBraW5kOiAnY29tbWl0JzsgdXJpOiBVUkkgfSB8IHsga2luZDogJ3RpbWVvdXQnIH0gfCB7IGtpbmQ6ICdjYW5jZWxsZWQnIH0+W10gPSBbXG5cdFx0XHRcdHJhY2VUaW1lb3V0KGNvbW1pdFByb21pc2UsIHRpbWVvdXRNcykudGhlbih1cmkgPT4gdXJpID8geyBraW5kOiAnY29tbWl0JyBhcyBjb25zdCwgdXJpIH0gOiB7IGtpbmQ6ICd0aW1lb3V0JyBhcyBjb25zdCB9KSxcblx0XHRcdF07XG5cdFx0XHRpZiAocmVzcG9uc2VDcmVhdGVkUHJvbWlzZSkge1xuXHRcdFx0XHRjYW5kaWRhdGVzLnB1c2gocmVzcG9uc2VDcmVhdGVkUHJvbWlzZS50aGVuKHIgPT4gcj8uaXNDYW5jZWxlZCA/IHsga2luZDogJ2NhbmNlbGxlZCcgYXMgY29uc3QgfSA6IG5ldyBQcm9taXNlPG5ldmVyPigoKSA9PiB7IC8qIG5ldmVyIHJlc29sdmVzICovIH0pKSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBvdXRjb21lID0gYXdhaXQgUHJvbWlzZS5yYWNlKGNhbmRpZGF0ZXMpO1xuXHRcdFx0aWYgKG91dGNvbWUua2luZCA9PT0gJ2NvbW1pdCcpIHtcblx0XHRcdFx0cmV0dXJuIG91dGNvbWUudXJpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG91dGNvbWUua2luZCA9PT0gJ2NhbmNlbGxlZCcpIHtcblx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBUaW1lZCBvdXQgXHUyMDE0IGxhc3QtcmVzb3J0IGNoZWNrIGZvciBjYW5jZWxsYXRpb25cblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gcmVzcG9uc2VDcmVhdGVkUHJvbWlzZSA/IGF3YWl0IHJlc3BvbnNlQ3JlYXRlZFByb21pc2UgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAocmVzcG9uc2U/LmlzQ2FuY2VsZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RpbWVkIG91dCB3YWl0aW5nIGZvciBzZXNzaW9uIGNvbW1pdCcpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFdhaXRzIGZvciBhbiB7QGxpbmsgQWdlbnRTZXNzaW9uQWRhcHRlcn0gd2l0aCB0aGUgZ2l2ZW4gcmVzb3VyY2UgdG8gYXBwZWFyXG5cdCAqIGluIHRoZSBzZXNzaW9uIGNhY2hlIChwb3B1bGF0ZWQgYnkge0BsaW5rIF9yZWZyZXNoU2Vzc2lvbkNhY2hlfSkuXG5cdCAqIE9ubHkgY2FsbGVkIG9uY2UgZHVyaW5nIHNlc3Npb24gaW5pdGlhbGlzYXRpb24gKGFmdGVyIHRoZSBjb21taXQgZXZlbnQpLFxuXHQgKiBzbyB0aGUgdGltZW91dCBoYXMgbm8gcGVyZm9ybWFuY2UgaW1wYWN0IG9uIHN0ZWFkeS1zdGF0ZSBvcGVyYXRpb25zLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfd2FpdEZvclNlc3Npb25JbkNhY2hlKHJlc291cmNlOiBVUkksIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEFnZW50U2Vzc2lvbkFkYXB0ZXI+IHtcblx0XHRjb25zdCBrZXkgPSByZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChrZXkpO1xuXHRcdGlmIChleGlzdGluZyBpbnN0YW5jZW9mIEFnZW50U2Vzc2lvbkFkYXB0ZXIpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblByb21pc2UgPSBuZXcgUHJvbWlzZTxBZ2VudFNlc3Npb25BZGFwdGVyPihyZXNvbHZlID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IHtcblx0XHRcdFx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KGtleSk7XG5cdFx0XHRcdFx0aWYgKGNhY2hlZCBpbnN0YW5jZW9mIEFnZW50U2Vzc2lvbkFkYXB0ZXIpIHtcblx0XHRcdFx0XHRcdHJlc29sdmUoY2FjaGVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUaGUgYWRhcHRlciBub3JtYWxseSBhcHBlYXJzIHdpdGhpbiBhIGZldyBodW5kcmVkIG1zIG9mIHRoZSBjb21taXRcblx0XHRcdC8vIGV2ZW50IHZpYSBfcmVmcmVzaFNlc3Npb25DYWNoZSwgYnV0IHRoZSByZWZyZXNoIGlzIGdhdGVkIG9uIHRoZVxuXHRcdFx0Ly8gdW5kZXJseWluZyBwcm92aWRlcidzIGBwcm92aWRlQ2hhdFNlc3Npb25JdGVtc2AgY2FsbC4gU29tZSBsZWdhY3lcblx0XHRcdC8vIHByb3ZpZGVycyAobm90YWJseSBDb3BpbG90IENMSSdzIFYxIGNvbnRyaWJ1dGlvbikgc2NhbiBkaXNrIGZvclxuXHRcdFx0Ly8gc2Vzc2lvbiBtZXRhZGF0YSBvbiBldmVyeSByZWZyZXNoIGFuZCBjYW4gdGFrZSAxMCsgc2Vjb25kcyB3aGVuXG5cdFx0XHQvLyB0aGUgb24tZGlzayBzZXNzaW9uIGxpc3QgaXMgbGFyZ2Ugb3IgY29sZC4gSWYgd2UgZ2l2ZSB1cCB0b29cblx0XHRcdC8vIGVhcmx5IHRoZSBjaGF0IHdpZGdldCBuZXZlciBnZXRzIHJlLWJvdW5kIGZyb20gdGhlIHVudGl0bGVkIFVSSVxuXHRcdFx0Ly8gdG8gdGhlIGNvbW1pdHRlZCBTREsgc2Vzc2lvbiBVUkksIHNvIGEgZm9sbG93LXVwIG1lc3NhZ2Ugd291bGRcblx0XHRcdC8vIHNwYXduIGEgYnJhbmQgbmV3IFNESyBzZXNzaW9uIGluc3RlYWQgb2YgY29udGludWluZyB0aGUgZXhpc3Rpbmdcblx0XHRcdC8vIG9uZS4gVXNlIGEgZ2VuZXJvdXMgdGltZW91dCB0aGF0IGNvdmVycyB0aGUgc2xvd2VzdCByZWFsaXN0aWNcblx0XHRcdC8vIHJlZnJlc2ggd2hpbGUgc3RpbGwgZmFpbGluZyBsb3VkbHkgaWYgc29tZXRoaW5nIGlzIGdlbnVpbmVseVxuXHRcdFx0Ly8gc3R1Y2suXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByYWNlVGltZW91dChcblx0XHRcdFx0dG9rZW4gPyByYWNlQ2FuY2VsbGF0aW9uRXJyb3Ioc2Vzc2lvblByb21pc2UsIHRva2VuKSA6IHNlc3Npb25Qcm9taXNlLFxuXHRcdFx0XHQzMF8wMDAsXG5cdFx0XHQpO1xuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUaW1lZCBvdXQgd2FpdGluZyBmb3IgY29tbWl0dGVkIHNlc3Npb24gaW4gY2FjaGUnKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLSBQcml2YXRlIC0tXG5cblx0cHJpdmF0ZSBhc3luYyBfYnJvd3NlRm9yUmVwbygpOiBQcm9taXNlPElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVwb0lkID0gYXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxzdHJpbmc+KE9QRU5fUkVQT19DT01NQU5EKTtcblx0XHRpZiAocmVwb0lkKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogR0lUSFVCX1JFTU9URV9GSUxFX1NDSEVNRSwgYXV0aG9yaXR5OiAnZ2l0aHViJywgcGF0aDogYC8ke3JlcG9JZH0vSEVBRGAgfSk7XG5cdFx0XHRjb25zdCBmb2xkZXI6IElTZXNzaW9uRm9sZGVyID0ge1xuXHRcdFx0XHRyb290OiB1cmksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHVyaSxcblx0XHRcdFx0bmFtZTogYmFzZW5hbWUodXJpKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0Z2l0UmVwb3NpdG9yeTogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0bGFiZWw6IHRoaXMuX2xhYmVsRnJvbVVyaSh1cmkpLFxuXHRcdFx0XHRpY29uOiB0aGlzLl9pY29uRnJvbVVyaSh1cmkpLFxuXHRcdFx0XHRncm91cDogU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfR0lUSFVCLFxuXHRcdFx0XHRmb2xkZXJzOiBbZm9sZGVyXSxcblx0XHRcdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0XHRcdGlzVmlydHVhbFdvcmtzcGFjZTogdHJ1ZSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZXNvbHZlV29ya3NwYWNlKHVyaTogVVJJKTogSVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQge1xuXHRcdGlmICh1cmkuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUgJiYgdXJpLnNjaGVtZSAhPT0gR0lUSFVCX1JFTU9URV9GSUxFX1NDSEVNRSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZm9sZGVyOiBJU2Vzc2lvbkZvbGRlciA9IHtcblx0XHRcdHJvb3Q6IHVyaSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHVyaSxcblx0XHRcdG5hbWU6IGJhc2VuYW1lKHVyaSksXG5cdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0Z2l0UmVwb3NpdG9yeTogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVyaTogdXJpLFxuXHRcdFx0bGFiZWw6IHRoaXMuX2xhYmVsRnJvbVVyaSh1cmkpLFxuXHRcdFx0ZGVzY3JpcHRpb246IHRoaXMuX2Rlc2NyaXB0aW9uRnJvbVVyaSh1cmkpLFxuXHRcdFx0Z3JvdXA6IHVyaS5zY2hlbWUgPT09IEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUgPyBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9HSVRIVUIgOiBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9MT0NBTCxcblx0XHRcdGljb246IHRoaXMuX2ljb25Gcm9tVXJpKHVyaSksXG5cdFx0XHRmb2xkZXJzOiBbZm9sZGVyXSxcblx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IHVyaS5zY2hlbWUgIT09IEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUsXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IHVyaS5zY2hlbWUgPT09IEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2xhYmVsRnJvbVVyaSh1cmk6IFVSSSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGdpdGh1YlJlbW90ZVJlcG9MYWJlbCh1cmkpID8/IGJhc2VuYW1lKHVyaSk7XG5cdH1cblxuXHRwcml2YXRlIF9kZXNjcmlwdGlvbkZyb21VcmkodXJpOiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh1cmkuc2NoZW1lID09PSBHSVRIVUJfUkVNT1RFX0ZJTEVfU0NIRU1FKSB7XG5cdFx0XHQvLyBGb3IgR2l0SHViIFVSSXMgdGhlIHBhdGggaXMgXCIvPG93bmVyPi88cmVwbz5cIiwgcmV0dXJuIHRoZSBvd25lciBhcyBkZXNjcmlwdGlvblxuXHRcdFx0Y29uc3QgcGFydHMgPSB1cmkucGF0aC5zdWJzdHJpbmcoMSkuc3BsaXQoJy8nKTtcblx0XHRcdHJldHVybiBwYXJ0cy5sZW5ndGggPj0gMiA/IHBhcnRzWzBdIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBGb3IgbG9jYWwgZmlsZSBVUklzLCByZXR1cm4gdGhlIHRpbGRpZmllZCBwYXJlbnQgZGlyZWN0b3J5IHBhdGhcblx0XHRyZXR1cm4gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZGlybmFtZSh1cmkpLCB7IHJlbGF0aXZlOiBmYWxzZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2ljb25Gcm9tVXJpKHVyaTogVVJJKTogVGhlbWVJY29uIHtcblx0XHRpZiAodXJpLnNjaGVtZSA9PT0gR0lUSFVCX1JFTU9URV9GSUxFX1NDSEVNRSkge1xuXHRcdFx0cmV0dXJuIENvZGljb24ucmVwbztcblx0XHR9XG5cdFx0cmV0dXJuIENvZGljb24uZm9sZGVyO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlU2Vzc2lvbkNhY2hlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zZXNzaW9uQ2FjaGUuc2l6ZSA+IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcmVmcmVzaFNlc3Npb25DYWNoZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW52YWxpZGF0ZUdyb3VwaW5nQ2FjaGVzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NoYXRCeVJhd1Nlc3Npb25JZENhY2hlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2dyb3VwSWRCeUNoYXRJZENhY2hlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2NoYXRJZHNCeUdyb3VwSWRDYWNoZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZUdyb3VwaW5nQ2FjaGVzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jaGF0QnlSYXdTZXNzaW9uSWRDYWNoZSAmJiB0aGlzLl9ncm91cElkQnlDaGF0SWRDYWNoZSAmJiB0aGlzLl9jaGF0SWRzQnlHcm91cElkQ2FjaGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjaGF0cyA9IEFycmF5LmZyb20odGhpcy5fc2Vzc2lvbkNhY2hlLnZhbHVlcygpKTtcblx0XHRjb25zdCBjaGF0QnlSYXdTZXNzaW9uSWQgPSBuZXcgTWFwPHN0cmluZywgSUNvcGlsb3RDaGF0U2Vzc2lvbj4oKTtcblx0XHRmb3IgKGNvbnN0IGNoYXQgb2YgY2hhdHMpIHtcblx0XHRcdGNoYXRCeVJhd1Nlc3Npb25JZC5zZXQoY2hhdC5yZXNvdXJjZS5wYXRoLnNsaWNlKDEpLCBjaGF0KTtcblx0XHR9XG5cblx0XHRjb25zdCBncm91cElkQnlDaGF0SWQgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGNvbnN0IGNoYXRzQnlHcm91cElkID0gbmV3IE1hcDxzdHJpbmcsIElDb3BpbG90Q2hhdFNlc3Npb25bXT4oKTtcblxuXHRcdGNvbnN0IHJlc29sdmVHcm91cElkID0gKGNoYXQ6IElDb3BpbG90Q2hhdFNlc3Npb24pOiBzdHJpbmcgPT4ge1xuXHRcdFx0Y29uc3QgY2FjaGVkR3JvdXBJZCA9IGdyb3VwSWRCeUNoYXRJZC5nZXQoY2hhdC5zZXNzaW9uSWQpO1xuXHRcdFx0aWYgKGNhY2hlZEdyb3VwSWQpIHtcblx0XHRcdFx0cmV0dXJuIGNhY2hlZEdyb3VwSWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRyYWlsOiBJQ29waWxvdENoYXRTZXNzaW9uW10gPSBbXTtcblx0XHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGxldCBjdXJyZW50OiBJQ29waWxvdENoYXRTZXNzaW9uID0gY2hhdDtcblxuXHRcdFx0Zm9yIChsZXQgZGVwdGggPSAwOyBkZXB0aCA8IDEwMDsgZGVwdGgrKykge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50Q2FjaGVkR3JvdXBJZCA9IGdyb3VwSWRCeUNoYXRJZC5nZXQoY3VycmVudC5zZXNzaW9uSWQpO1xuXHRcdFx0XHRpZiAoY3VycmVudENhY2hlZEdyb3VwSWQpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHRyYWlsQ2hhdCBvZiB0cmFpbCkge1xuXHRcdFx0XHRcdFx0Z3JvdXBJZEJ5Q2hhdElkLnNldCh0cmFpbENoYXQuc2Vzc2lvbklkLCBjdXJyZW50Q2FjaGVkR3JvdXBJZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBjdXJyZW50Q2FjaGVkR3JvdXBJZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChzZWVuLmhhcyhjdXJyZW50LnNlc3Npb25JZCkpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHRyYWlsQ2hhdCBvZiB0cmFpbCkge1xuXHRcdFx0XHRcdFx0Z3JvdXBJZEJ5Q2hhdElkLnNldCh0cmFpbENoYXQuc2Vzc2lvbklkLCBjdXJyZW50LnNlc3Npb25JZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBjdXJyZW50LnNlc3Npb25JZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRyYWlsLnB1c2goY3VycmVudCk7XG5cdFx0XHRcdHNlZW4uYWRkKGN1cnJlbnQuc2Vzc2lvbklkKTtcblxuXHRcdFx0XHRjb25zdCBwYXJlbnRSYXdTZXNzaW9uSWQgPSB0aGlzLl9nZXREaXJlY3RQYXJlbnRSYXdTZXNzaW9uSWQoY3VycmVudCk7XG5cdFx0XHRcdGlmICghcGFyZW50UmF3U2Vzc2lvbklkKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB0cmFpbENoYXQgb2YgdHJhaWwpIHtcblx0XHRcdFx0XHRcdGdyb3VwSWRCeUNoYXRJZC5zZXQodHJhaWxDaGF0LnNlc3Npb25JZCwgY3VycmVudC5zZXNzaW9uSWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gY3VycmVudC5zZXNzaW9uSWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBwYXJlbnRDaGF0ID0gY2hhdEJ5UmF3U2Vzc2lvbklkLmdldChwYXJlbnRSYXdTZXNzaW9uSWQpO1xuXHRcdFx0XHRpZiAoIXBhcmVudENoYXQpIHtcblx0XHRcdFx0XHRjb25zdCBzeW50aGV0aWNHcm91cElkID0gdGhpcy5fZ2V0U3ludGhldGljR3JvdXBJZChwYXJlbnRSYXdTZXNzaW9uSWQpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgdHJhaWxDaGF0IG9mIHRyYWlsKSB7XG5cdFx0XHRcdFx0XHRncm91cElkQnlDaGF0SWQuc2V0KHRyYWlsQ2hhdC5zZXNzaW9uSWQsIHN5bnRoZXRpY0dyb3VwSWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gc3ludGhldGljR3JvdXBJZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGN1cnJlbnQgPSBwYXJlbnRDaGF0O1xuXHRcdFx0fVxuXG5cdFx0XHRncm91cElkQnlDaGF0SWQuc2V0KGNoYXQuc2Vzc2lvbklkLCBjaGF0LnNlc3Npb25JZCk7XG5cdFx0XHRyZXR1cm4gY2hhdC5zZXNzaW9uSWQ7XG5cdFx0fTtcblxuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBjaGF0cykge1xuXHRcdFx0Y29uc3QgZ3JvdXBJZCA9IHJlc29sdmVHcm91cElkKGNoYXQpO1xuXHRcdFx0Y29uc3QgZ3JvdXBDaGF0cyA9IGNoYXRzQnlHcm91cElkLmdldChncm91cElkKSA/PyBbXTtcblx0XHRcdGdyb3VwQ2hhdHMucHVzaChjaGF0KTtcblx0XHRcdGNoYXRzQnlHcm91cElkLnNldChncm91cElkLCBncm91cENoYXRzKTtcblx0XHR9XG5cblx0XHRjb25zdCBjaGF0SWRzQnlHcm91cElkID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZ1tdPigpO1xuXHRcdGZvciAoY29uc3QgW2dyb3VwSWQsIGdyb3VwQ2hhdHNdIG9mIGNoYXRzQnlHcm91cElkKSB7XG5cdFx0XHRncm91cENoYXRzLnNvcnQoKGEsIGIpID0+IGEuY3JlYXRlZEF0LmdldFRpbWUoKSAtIGIuY3JlYXRlZEF0LmdldFRpbWUoKSk7XG5cdFx0XHRjaGF0SWRzQnlHcm91cElkLnNldChncm91cElkLCBncm91cENoYXRzLm1hcChjaGF0ID0+IGNoYXQuc2Vzc2lvbklkKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY2hhdEJ5UmF3U2Vzc2lvbklkQ2FjaGUgPSBjaGF0QnlSYXdTZXNzaW9uSWQ7XG5cdFx0dGhpcy5fZ3JvdXBJZEJ5Q2hhdElkQ2FjaGUgPSBncm91cElkQnlDaGF0SWQ7XG5cdFx0dGhpcy5fY2hhdElkc0J5R3JvdXBJZENhY2hlID0gY2hhdElkc0J5R3JvdXBJZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDbGVhbnMgdXAgYSB0ZW1wIHNlc3Npb24gKG9uZSB0aGF0IGhhc24ndCBiZWVuIGNvbW1pdHRlZCkgZnJvbSB0aGUgY2FjaGUuXG5cdCAqIFVzZWQgd2hlbiBkZWxldGUvYXJjaGl2ZSBpcyBpbnZva2VkIG9uIGEgc2Vzc2lvbiB0aGF0IGlzIHN0aWxsIHBlbmRpbmdcblx0ICogY29tbWl0IChlLmcuIHdhcyBzdG9wcGVkIGJlZm9yZSB0aGUgYWdlbnQgY3JlYXRlZCBhIHdvcmt0cmVlKS5cblx0ICovXG5cdHByaXZhdGUgX2NsZWFudXBUZW1wU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uID0gdGhpcy5fZmluZENoYXRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKCFjaGF0U2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGtleSA9IGNoYXRTZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLmRlbGV0ZShrZXkpO1xuXHRcdHRoaXMuX2ludmFsaWRhdGVHcm91cGluZ0NhY2hlcygpO1xuXHRcdHRoaXMuX3Nlc3Npb25Hcm91cENhY2hlLmRlbGV0ZShjaGF0U2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGlmICh0aGlzLl9uZXdTZXNzaW9ucy5oYXMoY2hhdFNlc3Npb24uc2Vzc2lvbklkKSkge1xuXHRcdFx0dGhpcy5fbmV3U2Vzc2lvbnMuZGVsZXRlQW5kTGVhayhjaGF0U2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdH1cblx0XHRjb25zdCByZW1vdmVkU2Vzc2lvbiA9IHRoaXMuX2NoYXRUb1Nlc3Npb24oY2hhdFNlc3Npb24pO1xuXHRcdHRoaXMuX3Nlc3Npb25Hcm91cENhY2hlLmRlbGV0ZShjaGF0U2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW3JlbW92ZWRTZXNzaW9uXSwgY2hhbmdlZDogW10gfSk7XG5cdFx0aWYgKGlzTmV3U2Vzc2lvbihjaGF0U2Vzc2lvbikpIHtcblx0XHRcdGNoYXRTZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoU2Vzc2lvbkNhY2hlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnRLZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgYWRkZWREYXRhOiBJQ29waWxvdENoYXRTZXNzaW9uW10gPSBbXTtcblx0XHRjb25zdCBjaGFuZ2VkRGF0YTogSUNvcGlsb3RDaGF0U2Vzc2lvbltdID0gW107XG5cdFx0Ly8gVW5kZXJseWluZyBhZ2VudCBzZXNzaW9ucyB3aG9zZSB0dXJuIGp1c3QgY29tcGxldGVkIGFuZCBzaG91bGQgYmUgbWFya2VkXG5cdFx0Ly8gdW5yZWFkLiBQcm9jZXNzZWQgYWZ0ZXIgdGhlIGxvb3Agc28gYHNldFJlYWRgIGRvZXMgbm90IHJlLWVudGVyIG1pZC1pdGVyYXRpb24uXG5cdFx0Y29uc3Qgc2Vzc2lvbnNUb01hcmtVbnJlYWQ6IElBZ2VudFNlc3Npb25bXSA9IFtdO1xuXHRcdGxldCBjYWNoZUNoYW5nZWQgPSBmYWxzZTtcblxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnNlc3Npb25zKSB7XG5cdFx0XHRpZiAoc2Vzc2lvbi5wcm92aWRlclR5cGUgIT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kXG5cdFx0XHRcdCYmIHNlc3Npb24ucHJvdmlkZXJUeXBlICE9PSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWRcblx0XHRcdFx0JiYgc2Vzc2lvbi5wcm92aWRlclR5cGUgIT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbGF1ZGUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzZXNzaW9uLnByb3ZpZGVyVHlwZSA9PT0gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsYXVkZSAmJiAhdGhpcy5faXNDbGF1ZGVBdmFpbGFibGUoKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qga2V5ID0gc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0Y3VycmVudEtleXMuYWRkKGtleSk7XG5cblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChrZXkpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzU3RhdHVzID0gZXhpc3Rpbmcuc3RhdHVzLmdldCgpO1xuXHRcdFx0XHRpZiAoZXhpc3RpbmcudXBkYXRlKHNlc3Npb24pKSB7XG5cdFx0XHRcdFx0Y2hhbmdlZERhdGEucHVzaChleGlzdGluZyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQSBjb21wbGV0ZWQgdHVybiAoSW5Qcm9ncmVzcyBcdTIxOTIgdGVybWluYWwpIG1hcmtzIHRoZSBzZXNzaW9uXG5cdFx0XHRcdC8vIHVucmVhZC4gQ29waWxvdCByZWFkIHN0YXRlIGlzIG93bmVkIGJ5IHRoZSBhZ2VudCBzZXNzaW9uIG1vZGVsLFxuXHRcdFx0XHQvLyBzbyByb3V0ZSB0aHJvdWdoIGBzZXRSZWFkKGZhbHNlKWA7IHRoZSBhZGFwdGVyIG1pcnJvcnMgaXQgYmFjay5cblx0XHRcdFx0Y29uc3QgY3VycmVudFN0YXR1cyA9IGV4aXN0aW5nLnN0YXR1cy5nZXQoKTtcblx0XHRcdFx0aWYgKHByZXZpb3VzU3RhdHVzID09PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3Ncblx0XHRcdFx0XHQmJiBjdXJyZW50U3RhdHVzICE9PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3Ncblx0XHRcdFx0XHQmJiBjdXJyZW50U3RhdHVzICE9PSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkXG5cdFx0XHRcdFx0JiYgZXhpc3RpbmcuaXNSZWFkLmdldCgpKSB7XG5cdFx0XHRcdFx0c2Vzc2lvbnNUb01hcmtVbnJlYWQucHVzaChzZXNzaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZ2VudFNlc3Npb25BZGFwdGVyKHNlc3Npb24sIHRoaXMuaWQsIHRoaXMuZ2l0SHViU2VydmljZSwgdGhpcy5wdWxsUmVxdWVzdEljb25DYWNoZSk7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25DYWNoZS5zZXQoa2V5LCBhZGFwdGVyKTtcblx0XHRcdFx0YWRkZWREYXRhLnB1c2goYWRhcHRlcik7XG5cdFx0XHRcdGNhY2hlQ2hhbmdlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVtb3ZlZERhdGE6IElDb3BpbG90Q2hhdFNlc3Npb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW2tleSwgYWRhcHRlcl0gb2YgdGhpcy5fc2Vzc2lvbkNhY2hlKSB7XG5cdFx0XHRpZiAoIWN1cnJlbnRLZXlzLmhhcyhrZXkpICYmIGFkYXB0ZXIgaW5zdGFuY2VvZiBBZ2VudFNlc3Npb25BZGFwdGVyICYmICF0aGlzLl9pbkZsaWdodENvbW1pdHMuaGFzKGtleSkpIHtcblx0XHRcdFx0cmVtb3ZlZERhdGEucHVzaChhZGFwdGVyKTtcblx0XHRcdFx0Y2FjaGVDaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZXNvbHZlIGdyb3VwIElEcyBmb3IgcmVtb3ZlZCBzZXNzaW9ucyBCRUZPUkUgcmVtb3ZpbmcgdGhlbSBmcm9tIHRoZVxuXHRcdC8vIGNhY2hlIGFuZCBpbnZhbGlkYXRpbmcgZ3JvdXBpbmcgY2FjaGVzLCBzbyB0aGF0IGNoaWxkIHNlc3Npb25zIGFyZVxuXHRcdC8vIGNvcnJlY3RseSBtYXBwZWQgdG8gdGhlaXIgcGFyZW50IGdyb3VwLlxuXHRcdGxldCByZW1vdmVkR3JvdXBJZHM6IE1hcDxJQ29waWxvdENoYXRTZXNzaW9uLCBzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHRcdGlmIChyZW1vdmVkRGF0YS5sZW5ndGggPiAwICYmIHRoaXMuX2lzTXVsdGlDaGF0RW5hYmxlZCgpKSB7XG5cdFx0XHRyZW1vdmVkR3JvdXBJZHMgPSBuZXcgTWFwKCk7XG5cdFx0XHRmb3IgKGNvbnN0IHJlbW92ZWQgb2YgcmVtb3ZlZERhdGEpIHtcblx0XHRcdFx0cmVtb3ZlZEdyb3VwSWRzLnNldChyZW1vdmVkLCB0aGlzLl9nZXRHcm91cElkRm9yQ2hhdChyZW1vdmVkKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTm93IHJlbW92ZSBmcm9tIGNhY2hlIGFuZCBpbnZhbGlkYXRlIGdyb3VwaW5nIGNhY2hlc1xuXHRcdGZvciAoY29uc3QgcmVtb3ZlZCBvZiByZW1vdmVkRGF0YSkge1xuXHRcdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLmRlbGV0ZShyZW1vdmVkLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdH1cblxuXHRcdGlmIChjYWNoZUNoYW5nZWQpIHtcblx0XHRcdHRoaXMuX2ludmFsaWRhdGVHcm91cGluZ0NhY2hlcygpO1xuXHRcdH1cblxuXHRcdGlmIChhZGRlZERhdGEubGVuZ3RoID4gMCB8fCByZW1vdmVkRGF0YS5sZW5ndGggPiAwIHx8IGNoYW5nZWREYXRhLmxlbmd0aCA+IDApIHtcblx0XHRcdGlmICh0aGlzLl9pc011bHRpQ2hhdEVuYWJsZWQoKSkge1xuXHRcdFx0XHR0aGlzLl9yZWZyZXNoU2Vzc2lvbkNhY2hlTXVsdGlDaGF0KGFkZGVkRGF0YSwgcmVtb3ZlZERhdGEsIGNoYW5nZWREYXRhLCByZW1vdmVkR3JvdXBJZHMhKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7XG5cdFx0XHRcdFx0YWRkZWQ6IGFkZGVkRGF0YS5tYXAoZCA9PiB0aGlzLl9jaGF0VG9TZXNzaW9uKGQpKSxcblx0XHRcdFx0XHRyZW1vdmVkOiByZW1vdmVkRGF0YS5tYXAoZCA9PiB0aGlzLl9jaGF0VG9TZXNzaW9uKGQpKSxcblx0XHRcdFx0XHRjaGFuZ2VkOiBjaGFuZ2VkRGF0YS5tYXAoZCA9PiB0aGlzLl9jaGF0VG9TZXNzaW9uKGQpKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTWFyayBjb21wbGV0ZWQtdHVybiBzZXNzaW9ucyB1bnJlYWQgYWZ0ZXIgdGhlIGNoYW5nZSBldmVudHMgYWJvdmUgKGFuZFxuXHRcdC8vIG91dHNpZGUgdGhlIGl0ZXJhdGlvbikgc28gdGhlIG1vZGVsJ3MgY2hhbmdlIGV2ZW50IHJlLWVudGVycyBjbGVhbmx5LlxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9uc1RvTWFya1VucmVhZCkge1xuXHRcdFx0c2Vzc2lvbi5zZXRSZWFkKGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoU2Vzc2lvbkNhY2hlTXVsdGlDaGF0KFxuXHRcdGFkZGVkRGF0YTogSUNvcGlsb3RDaGF0U2Vzc2lvbltdLFxuXHRcdHJlbW92ZWREYXRhOiBJQ29waWxvdENoYXRTZXNzaW9uW10sXG5cdFx0Y2hhbmdlZERhdGE6IElDb3BpbG90Q2hhdFNlc3Npb25bXSxcblx0XHRyZW1vdmVkR3JvdXBJZHM6IE1hcDxJQ29waWxvdENoYXRTZXNzaW9uLCBzdHJpbmc+LFxuXHQpOiB2b2lkIHtcblxuXHRcdC8vIEhhbmRsZSByZW1vdmVkIGNoYXRzOiBpZiBhIHJlbW92ZWQgY2hhdCBiZWxvbmdzIHRvIGEgZ3JvdXAgd2l0aFxuXHRcdC8vIHJlbWFpbmluZyBzaWJsaW5ncywgdHJlYXQgaXQgYXMgYSBjaGFuZ2VkIGV2ZW50IG9uIHRoZSBwYXJlbnQgc2Vzc2lvblxuXHRcdC8vIGluc3RlYWQgb2YgYSByZW1vdmVkIHNlc3Npb24uXG5cdFx0Y29uc3QgdHJ1bHlSZW1vdmVkU2Vzc2lvbnM6IHsgY2hhdDogSUNvcGlsb3RDaGF0U2Vzc2lvbjsgZ3JvdXBJZDogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGNoYW5nZWRTZXNzaW9uSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCByZW1vdmVkIG9mIHJlbW92ZWREYXRhKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSByZW1vdmVkR3JvdXBJZHMuZ2V0KHJlbW92ZWQpITtcblxuXHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIGdyb3VwIHN0aWxsIGhhcyBjaGF0cyBhZnRlciByZW1vdmFsXG5cdFx0XHRjb25zdCByZW1haW5pbmdDaGF0SWRzID0gdGhpcy5fZ2V0Q2hhdElkc0luR3JvdXAoc2Vzc2lvbklkKTtcblx0XHRcdGlmIChyZW1haW5pbmdDaGF0SWRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Ly8gR3JvdXAgc3RpbGwgaGFzIG90aGVyIGNoYXRzIFx1MjAxNCBpbnZhbGlkYXRlIGNhY2hlIGFuZCB0cmVhdCBhcyBjaGFuZ2VkXG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25Hcm91cENhY2hlLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZEdyb3VwTWVtYmVyc2hpcENoYW5nZS5maXJlKHsgc2Vzc2lvbklkIH0pO1xuXHRcdFx0XHRpZiAoIWNoYW5nZWRTZXNzaW9uSWRzLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHRcdFx0Y2hhbmdlZFNlc3Npb25JZHMuYWRkKHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0Y29uc3QgcHJpbWFyeUNoYXQgPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHRoaXMuX2xvY2FsSWRGcm9tY2hhdElkKHJlbWFpbmluZ0NoYXRJZHNbMF0pKTtcblx0XHRcdFx0XHRpZiAocHJpbWFyeUNoYXQpIHtcblx0XHRcdFx0XHRcdGNoYW5nZWREYXRhLnB1c2gocHJpbWFyeUNoYXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbkdyb3VwQ2FjaGUuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0XHRcdHRydWx5UmVtb3ZlZFNlc3Npb25zLnB1c2goeyBjaGF0OiByZW1vdmVkLCBncm91cElkOiBzZXNzaW9uSWQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2VwYXJhdGUgdHJ1bHkgbmV3IHNlc3Npb25zIGZyb20gY2hhdHMgYWRkZWQgdG8gZXhpc3RpbmcgZ3JvdXBzLlxuXHRcdC8vIEdyb3VwaW5nIGlzIGRlcml2ZWQgZnJvbSBzZXNzaW9uUGFyZW50SWQgaW4gbWV0YWRhdGEuXG5cdFx0Y29uc3QgbmV3U2Vzc2lvbnM6IElDb3BpbG90Q2hhdFNlc3Npb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgYWRkZWQgb2YgYWRkZWREYXRhKSB7XG5cdFx0XHRjb25zdCBncm91cElkID0gdGhpcy5fZ2V0R3JvdXBJZEZvckNoYXQoYWRkZWQpO1xuXHRcdFx0Y29uc3QgZ3JvdXBDaGF0SWRzID0gdGhpcy5fZ2V0Q2hhdElkc0luR3JvdXAoZ3JvdXBJZCk7XG5cdFx0XHRpZiAoZ3JvdXBDaGF0SWRzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0Ly8gVGhpcyBjaGF0IGJlbG9uZ3MgdG8gYW4gZXhpc3Rpbmcgc2Vzc2lvbiBncm91cCBcdTIwMTQgdHJlYXQgYXMgY2hhbmdlZFxuXHRcdFx0XHR0aGlzLl9zZXNzaW9uR3JvdXBDYWNoZS5kZWxldGUoZ3JvdXBJZCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkR3JvdXBNZW1iZXJzaGlwQ2hhbmdlLmZpcmUoeyBzZXNzaW9uSWQ6IGdyb3VwSWQgfSk7XG5cdFx0XHRcdGlmICghY2hhbmdlZFNlc3Npb25JZHMuaGFzKGdyb3VwSWQpKSB7XG5cdFx0XHRcdFx0Y2hhbmdlZFNlc3Npb25JZHMuYWRkKGdyb3VwSWQpO1xuXHRcdFx0XHRcdGNoYW5nZWREYXRhLnB1c2goYWRkZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRuZXdTZXNzaW9ucy5wdXNoKGFkZGVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEZWR1cGxpY2F0ZSBjaGFuZ2VkIHNlc3Npb25zIGJ5IGdyb3VwIElEXG5cdFx0Y29uc3Qgc2VlbkNoYW5nZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBkZWR1cGxpY2F0ZWRDaGFuZ2VkOiBJQ29waWxvdENoYXRTZXNzaW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGQgb2YgY2hhbmdlZERhdGEpIHtcblx0XHRcdGNvbnN0IGdyb3VwSWQgPSB0aGlzLl9nZXRHcm91cElkRm9yQ2hhdChkKTtcblx0XHRcdGlmICghc2VlbkNoYW5nZWQuaGFzKGdyb3VwSWQpKSB7XG5cdFx0XHRcdHNlZW5DaGFuZ2VkLmFkZChncm91cElkKTtcblx0XHRcdFx0ZGVkdXBsaWNhdGVkQ2hhbmdlZC5wdXNoKGQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7XG5cdFx0XHRhZGRlZDogbmV3U2Vzc2lvbnMubWFwKGQgPT4gdGhpcy5fY2hhdFRvU2Vzc2lvbihkKSksXG5cdFx0XHRyZW1vdmVkOiB0cnVseVJlbW92ZWRTZXNzaW9ucy5tYXAoKHsgY2hhdCwgZ3JvdXBJZCB9KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uR3JvdXBDYWNoZS5nZXQoZ3JvdXBJZCk7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25Hcm91cENhY2hlLmRlbGV0ZShncm91cElkKTtcblx0XHRcdFx0cmV0dXJuIHNlc3Npb24gPz8gdGhpcy5fY2hhdFRvU2Vzc2lvbihjaGF0KTtcblx0XHRcdH0pLFxuXHRcdFx0Y2hhbmdlZDogZGVkdXBsaWNhdGVkQ2hhbmdlZC5tYXAoZCA9PiB0aGlzLl9jaGF0VG9TZXNzaW9uKGQpKSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRDaGF0U2Vzc2lvbihjaGF0SWQ6IHN0cmluZyk6IElDb3BpbG90Q2hhdFNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGRpcmVjdE1hdGNoID0gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldCh0aGlzLl9sb2NhbElkRnJvbWNoYXRJZChjaGF0SWQpKTtcblx0XHRpZiAoZGlyZWN0TWF0Y2gpIHtcblx0XHRcdHJldHVybiBkaXJlY3RNYXRjaDtcblx0XHR9XG5cblx0XHRjb25zdCBncm91cENoYXRJZHMgPSB0aGlzLl9nZXRDaGF0SWRzSW5Hcm91cChjaGF0SWQpO1xuXHRcdGNvbnN0IGZpcnN0Q2hhdElkID0gZ3JvdXBDaGF0SWRzWzBdO1xuXHRcdHJldHVybiBmaXJzdENoYXRJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQodGhpcy5fbG9jYWxJZEZyb21jaGF0SWQoZmlyc3RDaGF0SWQpKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRBZ2VudFNlc3Npb24oY2hhdElkOiBzdHJpbmcpOiBJQWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhZGFwdGVyID0gdGhpcy5fZmluZENoYXRTZXNzaW9uKGNoYXRJZCk7XG5cdFx0aWYgKCFhZGFwdGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uKGFkYXB0ZXIucmVzb3VyY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGdyb3VwIElEIGZvciBhIGdpdmVuIGNoYXQuXG5cdCAqIEdyb3VwaW5nIGlzIGRlcml2ZWQgZnJvbSBgc2Vzc2lvblBhcmVudElkYCBpbiBtZXRhZGF0YSAoZm9yIGNvbW1pdHRlZCBzZXNzaW9ucylcblx0ICogb3IgZnJvbSBgUEFSRU5UX1NFU1NJT05fT1BUSU9OX0lEYCBpbiBzZWxlY3RlZCBvcHRpb25zIChmb3IgdW5jb21taXR0ZWQgc2Vzc2lvbnMpLlxuXHQgKiBJZiB0aGUgcm9vdCBjaGF0IGlzIG5vdCBsb2FkZWQsIGEgc3ludGhldGljIHByb3ZpZGVyLXNjb3BlZCBncm91cCBJRCBpcyB1c2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0R3JvdXBJZEZvckNoYXQoY2hhdDogSUNvcGlsb3RDaGF0U2Vzc2lvbik6IHN0cmluZyB7XG5cdFx0dGhpcy5fZW5zdXJlR3JvdXBpbmdDYWNoZXMoKTtcblx0XHRyZXR1cm4gdGhpcy5fZ3JvdXBJZEJ5Q2hhdElkQ2FjaGU/LmdldChjaGF0LnNlc3Npb25JZCkgPz8gY2hhdC5zZXNzaW9uSWQ7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhbGwgY2hhdCBJRHMgdGhhdCBiZWxvbmcgdG8gdGhlIGdpdmVuIGdyb3VwLFxuXHQgKiBvcmRlcmVkIGJ5IGNyZWF0aW9uIHRpbWUgKHJvb3Qgc2Vzc2lvbiBmaXJzdCkuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRDaGF0SWRzSW5Hcm91cChncm91cElkOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdFx0dGhpcy5fZW5zdXJlR3JvdXBpbmdDYWNoZXMoKTtcblx0XHRyZXR1cm4gdGhpcy5fY2hhdElkc0J5R3JvdXBJZENhY2hlPy5nZXQoZ3JvdXBJZCkgPz8gW107XG5cdH1cblxuXHRwcml2YXRlIF9nZXREaXJlY3RQYXJlbnRSYXdTZXNzaW9uSWQoY2hhdDogSUNvcGlsb3RDaGF0U2Vzc2lvbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uKGNoYXQucmVzb3VyY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25QYXJlbnRJZCA9IGFnZW50U2Vzc2lvbj8ubWV0YWRhdGE/LnNlc3Npb25QYXJlbnRJZDtcblx0XHRpZiAodHlwZW9mIHNlc3Npb25QYXJlbnRJZCA9PT0gJ3N0cmluZycgJiYgc2Vzc2lvblBhcmVudElkLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiBzZXNzaW9uUGFyZW50SWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGlzTmV3U2Vzc2lvbihjaGF0KSkge1xuXHRcdFx0Y29uc3QgcGFyZW50T3B0aW9uID0gY2hhdC5zZWxlY3RlZE9wdGlvbnMuZ2V0KFBBUkVOVF9TRVNTSU9OX09QVElPTl9JRCk7XG5cdFx0XHRpZiAocGFyZW50T3B0aW9uPy5pZCkge1xuXHRcdFx0XHRyZXR1cm4gcGFyZW50T3B0aW9uLmlkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTeW50aGV0aWNHcm91cElkKHJhd1Nlc3Npb25JZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dGhpcy5pZH06Z3JvdXA6JHtyYXdTZXNzaW9uSWR9YDtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogSVNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uR3JvdXBDYWNoZS5nZXQoc2Vzc2lvbklkKTtcblx0fVxuXG5cdHByaXZhdGUgX2xvY2FsSWRGcm9tY2hhdElkKGNoYXRJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBwcmVmaXggPSBgJHt0aGlzLmlkfTpgO1xuXHRcdHJldHVybiBjaGF0SWQuc3RhcnRzV2l0aChwcmVmaXgpID8gY2hhdElkLnN1YnN0cmluZyhwcmVmaXgubGVuZ3RoKSA6IGNoYXRJZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgKGNyZWF0aW5nIG9uIGZpcnN0IHVzZSkgdGhlIG1lbWJlcnNoaXAgc2lnbmFsIGZvciBhIGdyb3VwLCBrZXllZCBieVxuXHQgKiBgc2Vzc2lvbklkYC4gVGhlIGdyb3VwJ3MgY2hhdHMgb2JzZXJ2YWJsZSBvYnNlcnZlcyB0aGlzIHNpZ25hbCBzbyBhIG1lbWJlcnNoaXBcblx0ICogY2hhbmdlIHJlY29tcHV0ZXMgb25seSB0aGUgYWZmZWN0ZWQgZ3JvdXA7IHRoZSBzaW5nbGUgZmFuLW91dCBzdWJzY3JpcHRpb24gaW5cblx0ICogYF9ncm91cE1lbWJlcnNoaXBTdWJzY3JpcHRpb25gIHRyaWdnZXJzIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0R3JvdXBNZW1iZXJzaGlwU2lnbmFsKHNlc3Npb25JZDogc3RyaW5nKTogSU9ic2VydmFibGVTaWduYWw8dm9pZD4ge1xuXHRcdGxldCBzaWduYWwgPSB0aGlzLl9ncm91cE1lbWJlcnNoaXBTaWduYWxzLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmICghc2lnbmFsKSB7XG5cdFx0XHRzaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsPHZvaWQ+KHRoaXMpO1xuXHRcdFx0dGhpcy5fZ3JvdXBNZW1iZXJzaGlwU2lnbmFscy5zZXQoc2Vzc2lvbklkLCBzaWduYWwpO1xuXHRcdH1cblx0XHRyZXR1cm4gc2lnbmFsO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0cnVjdHVyYWwgZXF1YWxpdHkgZm9yIGEgZ3JvdXAncyBjaGF0IGxpc3Qga2V5ZWQgb24gZWFjaCBjaGF0J3MgcmVzb3VyY2UuXG5cdCAqIGBfdG9DaGF0YCByZXR1cm5zIGEgZnJlc2ggd3JhcHBlciBvbiBldmVyeSByZWNvbXB1dGUsIHNvIGlkZW50aXR5IGNvbXBhcmlzb25cblx0ICogd291bGQgYWx3YXlzIGRpZmZlcjsgY29tcGFyaW5nIHJlc291cmNlcyBsZXRzIGEgcmVjb21wdXRlIHRoYXQgcHJvZHVjZWQgdGhlXG5cdCAqIHNhbWUgc2V0IG9mIGNoYXRzIGF2b2lkIHByb3BhZ2F0aW5nIGRvd25zdHJlYW0uIFVzZXMgdGhlIFVSSSBpZGVudGl0eSBjb21wYXJlclxuXHQgKiBzbyBzY2hlbWUtc3BlY2lmaWMgcGF0aCBjYXNpbmcgYW5kIG5vcm1hbGl6YXRpb24gYXJlIGhhbmRsZWQgY29uc2lzdGVudGx5LlxuXHQgKi9cblx0cHJpdmF0ZSBfY2hhdEFycmF5c0VxdWFsKGE6IHJlYWRvbmx5IElDaGF0W10gfCB1bmRlZmluZWQsIGI6IHJlYWRvbmx5IElDaGF0W10gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoYSA9PT0gYikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghYSB8fCAhYiB8fCBhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIGEuZXZlcnkoKGNoYXQsIGkpID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGNoYXQucmVzb3VyY2UsIGJbaV0ucmVzb3VyY2UpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXcmFwcyBhIHByaW1hcnkge0BsaW5rIElDb3BpbG90Q2hhdFNlc3Npb259IGFuZCBpdHMgc2libGluZyBjaGF0cyBpbnRvIGFuIHtAbGluayBJU2Vzc2lvbn0uXG5cdCAqIFdoZW4gbXVsdGktY2hhdCBpcyBlbmFibGVkLCB0aGUgYGNoYXRzYCBvYnNlcnZhYmxlIGlzIGRlcml2ZWQgZnJvbSBgc2Vzc2lvblBhcmVudElkYFxuXHQgKiBtZXRhZGF0YSBhbmQgdXBkYXRlcyB3aGVuIGdyb3VwIG1lbWJlcnNoaXAgY2hhbmdlcy5cblx0ICogV2hlbiBkaXNhYmxlZCwgZWFjaCBzZXNzaW9uIGhhcyBleGFjdGx5IG9uZSBjaGF0LlxuXHQgKi9cblx0cHJpdmF0ZSBfY2hhdFRvU2Vzc2lvbihjaGF0OiBJQ29waWxvdENoYXRTZXNzaW9uKTogSVNlc3Npb24ge1xuXHRcdGlmICghdGhpcy5faXNNdWx0aUNoYXRFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jaGF0VG9TaW5nbGVDaGF0U2Vzc2lvbihjaGF0KTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLl9nZXRHcm91cElkRm9yQ2hhdChjaGF0KTtcblxuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3Nlc3Npb25Hcm91cENhY2hlLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmIChjYWNoZWQpIHtcblx0XHRcdHJldHVybiBjYWNoZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzb2x2ZSB0aGUgbWFpbiAoZmlyc3QpIGNoYXQgaW4gdGhlIGdyb3VwIFx1MjAxNCBzZXNzaW9uLWxldmVsIHByb3BlcnRpZXMgY29tZSBmcm9tIGl0XG5cdFx0Y29uc3QgbWFpbkNoYXRJZHMgPSB0aGlzLl9nZXRDaGF0SWRzSW5Hcm91cChzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IGZpcnN0Q2hhdElkID0gbWFpbkNoYXRJZHNbMF07XG5cdFx0Y29uc3QgcHJpbWFyeUNoYXQ6IElDb3BpbG90Q2hhdFNlc3Npb24gPSBmaXJzdENoYXRJZFxuXHRcdFx0PyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHRoaXMuX2xvY2FsSWRGcm9tY2hhdElkKGZpcnN0Q2hhdElkKSkgPz8gY2hhdFxuXHRcdFx0OiBjaGF0O1xuXG5cdFx0Ly8gVGhlIHByaW1hcnkgY2hhdCBvd25zIHRoZSBzZXR0YWJsZSBgbWFpbkNoYXRgIG9ic2VydmFibGUuIFdoZW4gYGNyZWF0ZU5ld0NoYXRgXG5cdFx0Ly8gY29tbWl0cyBhIG5ldyBzZXNzaW9uLCBpdCB1cGRhdGVzIGBwcmltYXJ5Q2hhdC5tYWluQ2hhdGAgc28gdGhlIHdyYXBwaW5nIElTZXNzaW9uXG5cdFx0Ly8gcmVmbGVjdHMgdGhlIHJlYWwgYmFja2VuZCByZXNvdXJjZSB3aXRob3V0IHJlYnVpbGRpbmcgdGhlIGNhY2hlZCB3cmFwcGVyLlxuXHRcdGNvbnN0IG1haW5DaGF0ID0gcHJpbWFyeUNoYXQubWFpbkNoYXQ7XG5cblx0XHRjb25zdCBtZW1iZXJzaGlwU2lnbmFsID0gdGhpcy5fZ2V0R3JvdXBNZW1iZXJzaGlwU2lnbmFsKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgZ3JvdXBDaGF0c09icyA9IGRlcml2ZWRPcHRzPHJlYWRvbmx5IElDaGF0W10gfCB1bmRlZmluZWQ+KHtcblx0XHRcdG93bmVyOiB0aGlzLFxuXHRcdFx0ZXF1YWxzRm46IChhLCBiKSA9PiB0aGlzLl9jaGF0QXJyYXlzRXF1YWwoYSwgYiksXG5cdFx0fSwgcmVhZGVyID0+IHtcblx0XHRcdC8vIFJlY29tcHV0ZSB0aGlzIGdyb3VwJ3MgY2hhdHMgb25seSB3aGVuIGl0cyBvd24gbWVtYmVyc2hpcCBzaWduYWwgdGlja3MuXG5cdFx0XHQvLyBBIHNpbmdsZSBwcm92aWRlci13aWRlIGxpc3RlbmVyIG9uIGBfb25EaWRHcm91cE1lbWJlcnNoaXBDaGFuZ2VgIGZhbnMgb3V0XG5cdFx0XHQvLyB0byBwZXItZ3JvdXAgc2lnbmFscyAoc2VlIGBfZ3JvdXBNZW1iZXJzaGlwU3Vic2NyaXB0aW9uYCksIHNvIHRoZSBlbWl0dGVyJ3Ncblx0XHRcdC8vIGxpc3RlbmVyIGNvdW50IHN0YXlzIGNvbnN0YW50IHdoaWxlIGludmFsaWRhdGlvbiByZW1haW5zIHRhcmdldGVkIHRvIHRoZVxuXHRcdFx0Ly8gYWZmZWN0ZWQgZ3JvdXAuIFRoZSBgZXF1YWxzRm5gIHRoZW4gc3RvcHMgYSByZWNvbXB1dGUgdGhhdCBwcm9kdWNlZCB0aGVcblx0XHRcdC8vIHNhbWUgY2hhdCBzZXQgZnJvbSBwcm9wYWdhdGluZyBkb3duc3RyZWFtLlxuXHRcdFx0bWVtYmVyc2hpcFNpZ25hbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBjaGF0SWRzID0gdGhpcy5fZ2V0Q2hhdElkc0luR3JvdXAoc2Vzc2lvbklkKTtcblx0XHRcdGlmIChjaGF0SWRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzb2x2ZWQ6IElDb3BpbG90Q2hhdFNlc3Npb25bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBjaGF0SWRzKSB7XG5cdFx0XHRcdGNvbnN0IGMgPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHRoaXMuX2xvY2FsSWRGcm9tY2hhdElkKGlkKSk7XG5cdFx0XHRcdGlmIChjKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZWQucHVzaChjKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc29sdmVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc29sdmVkLm1hcChjID0+IHRoaXMuX3RvQ2hhdChjKSk7XG5cdFx0fSk7XG5cblx0XHQvLyBXaGVuIHRoZSBncm91cCBoYXMgbm8gcmVzb2x2ZWQgY2hhdHMgKHR5cGljYWwgZm9yIGEgbmV3IHNlc3Npb24gYmVmb3JlXG5cdFx0Ly8gY29tbWl0KSwgZmFsbCBiYWNrIHRvIHRoZSBzZXR0YWJsZSBgbWFpbkNoYXRgIHNvIGl0IHN0YXlzIGluIHN5bmMgYWZ0ZXJcblx0XHQvLyBgY3JlYXRlTmV3Q2hhdGAgc3dhcHMgaXQuXG5cdFx0Y29uc3QgY2hhdHNPYnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElDaGF0W10+ID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZ3JvdXBDaGF0cyA9IGdyb3VwQ2hhdHNPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIGdyb3VwQ2hhdHMgPz8gW21haW5DaGF0LnJlYWQocmVhZGVyKV07XG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbjogSVNlc3Npb24gPSB7XG5cdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHRyZXNvdXJjZTogcHJpbWFyeUNoYXQucmVzb3VyY2UsXG5cdFx0XHRwcm92aWRlcklkOiBwcmltYXJ5Q2hhdC5wcm92aWRlcklkLFxuXHRcdFx0c2Vzc2lvblR5cGU6IHByaW1hcnlDaGF0LnNlc3Npb25UeXBlLFxuXHRcdFx0aWNvbjogcHJpbWFyeUNoYXQuaWNvbixcblx0XHRcdGNyZWF0ZWRBdDogcHJpbWFyeUNoYXQuY3JlYXRlZEF0LFxuXHRcdFx0d29ya3NwYWNlOiBwcmltYXJ5Q2hhdC53b3Jrc3BhY2UsXG5cdFx0XHRoYXNHaXRSZXBvc2l0b3J5OiBwcmltYXJ5Q2hhdC5oYXNHaXRSZXBvc2l0b3J5LFxuXHRcdFx0dGl0bGU6IHByaW1hcnlDaGF0LnRpdGxlLFxuXHRcdFx0dXBkYXRlZEF0OiBjaGF0c09icy5tYXAoKGNoYXRzLCByZWFkZXIpID0+IHRoaXMuX2xhdGVzdERhdGUoY2hhdHMsIGMgPT4gYy51cGRhdGVkQXQucmVhZChyZWFkZXIpKSEpLFxuXHRcdFx0c3RhdHVzOiBjaGF0c09icy5tYXAoKGNoYXRzLCByZWFkZXIpID0+IHRoaXMuX2FnZ3JlZ2F0ZVN0YXR1cyhjaGF0cywgcmVhZGVyKSksXG5cdFx0XHRjaGFuZ2VzZXRzOiB0aGlzLl9jcmVhdGVDaGFuZ2VzZXRzKHByaW1hcnlDaGF0LnNlc3Npb25UeXBlLCBwcmltYXJ5Q2hhdC53b3Jrc3BhY2UsIGNoYXRzT2JzKSxcblx0XHRcdGNoYW5nZXM6IHByaW1hcnlDaGF0LmNoYW5nZXMsXG5cdFx0XHRtb2RlbElkOiBwcmltYXJ5Q2hhdC5tb2RlbElkLFxuXHRcdFx0bW9kZTogcHJpbWFyeUNoYXQubW9kZSxcblx0XHRcdGxvYWRpbmc6IHByaW1hcnlDaGF0LmxvYWRpbmcsXG5cdFx0XHRpc0FyY2hpdmVkOiBwcmltYXJ5Q2hhdC5pc0FyY2hpdmVkLFxuXHRcdFx0aXNSZWFkOiBjaGF0c09icy5tYXAoKGNoYXRzLCByZWFkZXIpID0+IGNoYXRzLmV2ZXJ5KGMgPT4gYy5pc1JlYWQucmVhZChyZWFkZXIpKSksXG5cdFx0XHRkZXNjcmlwdGlvbjogcHJpbWFyeUNoYXQuZGVzY3JpcHRpb24sXG5cdFx0XHRsYXN0VHVybkVuZDogY2hhdHNPYnMubWFwKChjaGF0cywgcmVhZGVyKSA9PiB0aGlzLl9sYXRlc3REYXRlKGNoYXRzLCBjID0+IGMubGFzdFR1cm5FbmQucmVhZChyZWFkZXIpKSksXG5cdFx0XHRjaGF0czogY2hhdHNPYnMsXG5cdFx0XHRtYWluQ2hhdCxcblx0XHRcdGNhcGFiaWxpdGllczogY29uc3RPYnNlcnZhYmxlKHtcblx0XHRcdFx0c3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBwcmltYXJ5Q2hhdC5zZXNzaW9uVHlwZSA9PT0gQ29waWxvdENMSVNlc3Npb25UeXBlLmlkICYmIHRoaXMuX2lzTXVsdGlDaGF0RW5hYmxlZCgpLFxuXHRcdFx0XHRzdXBwb3J0c1JlbmFtZTogdGhpcy5fc2Vzc2lvblR5cGVTdXBwb3J0c1JlbmFtZShwcmltYXJ5Q2hhdC5zZXNzaW9uVHlwZSksXG5cdFx0XHRcdHN1cHBvcnRzRGVsZXRlOiB0aGlzLl9zZXNzaW9uVHlwZVN1cHBvcnRzRGVsZXRlKHByaW1hcnlDaGF0LnNlc3Npb25UeXBlKSxcblx0XHRcdFx0Ly8gQ2xvdWQtYWdlbnQgc2Vzc2lvbnMgcnVuIHdvcmt0cmVlQ3JlYXRlZCB0YXNrcyBzZXJ2ZXItc2lkZSBkdXJpbmdcblx0XHRcdFx0Ly8gZW52aXJvbm1lbnQgcHJvdmlzaW9uaW5nLCBzbyB0aGUgYWdlbnRzLXdpbmRvdyBkaXNwYXRjaGVyIG11c3Rcblx0XHRcdFx0Ly8gbm90IHJlLXJ1biB0aGVtLiBDTEkgLyBsb2NhbCBzZXNzaW9ucyBkb24ndC5cblx0XHRcdFx0cnVuc1dvcmt0cmVlQ3JlYXRlZFRhc2tzOiBwcmltYXJ5Q2hhdC5zZXNzaW9uVHlwZSA9PT0gQ29waWxvdENsb3VkU2Vzc2lvblR5cGUuaWQsXG5cdFx0XHR9KSxcblx0XHR9O1xuXHRcdHRoaXMuX3Nlc3Npb25Hcm91cENhY2hlLnNldChzZXNzaW9uSWQsIHNlc3Npb24pO1xuXHRcdHJldHVybiBzZXNzaW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2hhdFRvU2luZ2xlQ2hhdFNlc3Npb24oY2hhdDogSUNvcGlsb3RDaGF0U2Vzc2lvbik6IElTZXNzaW9uIHtcblx0XHRjb25zdCBtYWluQ2hhdCA9IGNoYXQubWFpbkNoYXQ7XG5cdFx0Y29uc3QgY2hhdHNPYnMgPSBtYWluQ2hhdC5tYXAoYyA9PiBbY10gYXMgcmVhZG9ubHkgSUNoYXRbXSk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0cyA9IHRoaXMuX2NyZWF0ZUNoYW5nZXNldHMoY2hhdC5zZXNzaW9uVHlwZSwgY2hhdC53b3Jrc3BhY2UsIGNoYXRzT2JzKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRzZXNzaW9uSWQ6IGNoYXQuc2Vzc2lvbklkLFxuXHRcdFx0cmVzb3VyY2U6IGNoYXQucmVzb3VyY2UsXG5cdFx0XHRwcm92aWRlcklkOiBjaGF0LnByb3ZpZGVySWQsXG5cdFx0XHRzZXNzaW9uVHlwZTogY2hhdC5zZXNzaW9uVHlwZSxcblx0XHRcdGljb246IGNoYXQuaWNvbixcblx0XHRcdGNyZWF0ZWRBdDogY2hhdC5jcmVhdGVkQXQsXG5cdFx0XHR3b3Jrc3BhY2U6IGNoYXQud29ya3NwYWNlLFxuXHRcdFx0aGFzR2l0UmVwb3NpdG9yeTogY2hhdC5oYXNHaXRSZXBvc2l0b3J5LFxuXHRcdFx0dGl0bGU6IGNoYXQudGl0bGUsXG5cdFx0XHR1cGRhdGVkQXQ6IGNoYXQudXBkYXRlZEF0LFxuXHRcdFx0c3RhdHVzOiBjaGF0LnN0YXR1cyxcblx0XHRcdGNoYW5nZXNldHMsXG5cdFx0XHRjaGFuZ2VzOiBjaGF0LmNoYW5nZXMsXG5cdFx0XHRtb2RlbElkOiBjaGF0Lm1vZGVsSWQsXG5cdFx0XHRtb2RlOiBjaGF0Lm1vZGUsXG5cdFx0XHRsb2FkaW5nOiBjaGF0LmxvYWRpbmcsXG5cdFx0XHRpc0FyY2hpdmVkOiBjaGF0LmlzQXJjaGl2ZWQsXG5cdFx0XHRpc1JlYWQ6IGNoYXQuaXNSZWFkLFxuXHRcdFx0ZGVzY3JpcHRpb246IGNoYXQuZGVzY3JpcHRpb24sXG5cdFx0XHRsYXN0VHVybkVuZDogY2hhdC5sYXN0VHVybkVuZCxcblx0XHRcdGNoYXRzOiBjaGF0c09icyxcblx0XHRcdG1haW5DaGF0LFxuXHRcdFx0Y2FwYWJpbGl0aWVzOiBjb25zdE9ic2VydmFibGUoe1xuXHRcdFx0XHRzdXBwb3J0c011bHRpcGxlQ2hhdHM6IGZhbHNlLFxuXHRcdFx0XHRzdXBwb3J0c1JlbmFtZTogdGhpcy5fc2Vzc2lvblR5cGVTdXBwb3J0c1JlbmFtZShjaGF0LnNlc3Npb25UeXBlKSxcblx0XHRcdFx0c3VwcG9ydHNEZWxldGU6IHRoaXMuX3Nlc3Npb25UeXBlU3VwcG9ydHNEZWxldGUoY2hhdC5zZXNzaW9uVHlwZSksXG5cdFx0XHRcdHJ1bnNXb3JrdHJlZUNyZWF0ZWRUYXNrczogY2hhdC5zZXNzaW9uVHlwZSA9PT0gQ29waWxvdENsb3VkU2Vzc2lvblR5cGUuaWQsXG5cdFx0XHR9KSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIge0BsaW5rIHJlbmFtZUNoYXR9IGNhbiByZW5hbWUgYSBzZXNzaW9uIG9mIHRoZSBnaXZlbiB0eXBlLiBPbmx5XG5cdCAqIHRoZSBDb3BpbG90Q0xJIGFuZCBDbGF1ZGUgYmFja2VuZHMgZXhwb3NlIGEgcmVuYW1lIGNvbW1hbmQ7IG90aGVycyB0aHJvdy5cblx0ICovXG5cdHByaXZhdGUgX3Nlc3Npb25UeXBlU3VwcG9ydHNSZW5hbWUoc2Vzc2lvblR5cGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBzZXNzaW9uVHlwZSA9PT0gQ29waWxvdENMSVNlc3Npb25UeXBlLmlkIHx8IHNlc3Npb25UeXBlID09PSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xhdWRlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2Vzc2lvblR5cGVTdXBwb3J0c0RlbGV0ZShzZXNzaW9uVHlwZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHNlc3Npb25UeXBlID09PSBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQ7XG5cdH1cblxuXHRwcml2YXRlIF90b0NoYXQoY2hhdDogSUNvcGlsb3RDaGF0U2Vzc2lvbiwgcmVzb3VyY2U/OiBVUkksIGludGVyYWN0aXZpdHk6IENoYXRJbnRlcmFjdGl2aXR5ID0gQ2hhdEludGVyYWN0aXZpdHkuRnVsbCk6IElDaGF0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2U6IHJlc291cmNlID8/IGNoYXQucmVzb3VyY2UsXG5cdFx0XHRjcmVhdGVkQXQ6IGNoYXQuY3JlYXRlZEF0LFxuXHRcdFx0dGl0bGU6IGNoYXQudGl0bGUsXG5cdFx0XHR1cGRhdGVkQXQ6IGNoYXQudXBkYXRlZEF0LFxuXHRcdFx0c3RhdHVzOiBjaGF0LnN0YXR1cyxcblx0XHRcdGNoYW5nZXM6IGNoYXQuY2hhbmdlcyxcblx0XHRcdGNoZWNrcG9pbnRzOiBjaGF0LmNoZWNrcG9pbnRzLFxuXHRcdFx0bW9kZWxJZDogY2hhdC5tb2RlbElkLFxuXHRcdFx0bW9kZTogY2hhdC5tb2RlLFxuXHRcdFx0aXNBcmNoaXZlZDogY2hhdC5pc0FyY2hpdmVkLFxuXHRcdFx0aXNSZWFkOiBjaGF0LmlzUmVhZCxcblx0XHRcdGludGVyYWN0aXZpdHk6IGNvbnN0T2JzZXJ2YWJsZShpbnRlcmFjdGl2aXR5KSxcblx0XHRcdGRlc2NyaXB0aW9uOiBjaGF0LmRlc2NyaXB0aW9uLFxuXHRcdFx0bGFzdFR1cm5FbmQ6IGNoYXQubGFzdFR1cm5FbmQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUNoYW5nZXNldHMoc2Vzc2lvblR5cGU6IHN0cmluZywgd29ya3NwYWNlT2JzOiBJT2JzZXJ2YWJsZTxJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZD4sIGNoYXRzT2JzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQ2hhdFtdPik6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uQ2hhbmdlc2V0W10+IHtcblx0XHRyZXR1cm4gY3JlYXRlQ2hhbmdlc2V0cyhzZXNzaW9uVHlwZSwgd29ya3NwYWNlT2JzLCBjaGF0c09icywgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIF9sYXRlc3REYXRlKGNoYXRzOiByZWFkb25seSBJQ2hhdFtdLCBnZXR0ZXI6IChjaGF0OiBJQ2hhdCkgPT4gRGF0ZSB8IHVuZGVmaW5lZCk6IERhdGUgfCB1bmRlZmluZWQge1xuXHRcdGxldCBsYXRlc3Q6IERhdGUgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCBjaGF0IG9mIGNoYXRzKSB7XG5cdFx0XHRjb25zdCBkID0gZ2V0dGVyKGNoYXQpO1xuXHRcdFx0aWYgKGQgJiYgKCFsYXRlc3QgfHwgZCA+IGxhdGVzdCkpIHtcblx0XHRcdFx0bGF0ZXN0ID0gZDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGxhdGVzdDtcblx0fVxuXG5cdHByaXZhdGUgX2FnZ3JlZ2F0ZVN0YXR1cyhjaGF0czogcmVhZG9ubHkgSUNoYXRbXSwgcmVhZGVyOiBJUmVhZGVyKTogU2Vzc2lvblN0YXR1cyB7XG5cdFx0Zm9yIChjb25zdCBjIG9mIGNoYXRzKSB7XG5cdFx0XHRpZiAoYy5zdGF0dXMucmVhZChyZWFkZXIpID09PSBTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQpIHtcblx0XHRcdFx0cmV0dXJuIFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dDtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjIG9mIGNoYXRzKSB7XG5cdFx0XHRpZiAoYy5zdGF0dXMucmVhZChyZWFkZXIpID09PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpIHtcblx0XHRcdFx0cmV0dXJuIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNoYXRzWzBdLnN0YXR1cy5yZWFkKHJlYWRlcik7XG5cdH1cblxuXHRwcml2YXRlIF9pc011bHRpQ2hhdEVuYWJsZWQoKTogYm9vbGVhbiB7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WTtBQUN2RCxlQUFPLGNBQWM7QUFBQSxNQUN0QjtBQUFBLElBQ0Q7QUFDQSxlQUFXLEtBQUssT0FBTztBQUN0QixVQUFJLEVBQUUsT0FBTyxLQUFLLE1BQU0sTUFBTSxjQUFjLFlBQVk7QUFDdkQsZUFBTyxjQUFjO0FBQUEsTUFDdEI7QUFBQSxJQUNEO0FBQ0EsV0FBTyxNQUFNLENBQUMsRUFBRSxPQUFPLEtBQUssTUFBTTtBQUFBLEVBQ25DO0FBQUEsRUFFUSxzQkFBK0I7QUFDdEMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUNEO0FBaDFEYSw4QkFBTjtBQUFBLEVBMkhKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0ExSVU7IiwKICAibmFtZXMiOiBbInJlc291cmNlIiwgInNlc3Npb24iLCAibW9kZWxzIl0KfQo=
