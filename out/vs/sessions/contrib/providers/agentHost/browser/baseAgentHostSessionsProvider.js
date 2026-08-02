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
import { disposableTimeout, raceCancellationError } from "../../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { arrayEquals, structuralEquals } from "../../../../../base/common/equals.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { equals } from "../../../../../base/common/objects.js";
import { constObservable, derived, derivedOpts, observableValueOpts, subtransaction, transaction, waitForState, autorun, observableValue } from "../../../../../base/common/observable.js";
import { isEqual, isEqualOrParent, relativePath } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { localize } from "../../../../../nls.js";
import { AgentSession } from "../../../../../platform/agentHost/common/agentService.js";
import { buildAnnotationsUri } from "../../../../../platform/agentHost/common/annotationsUri.js";
import { parseGitHubIssueUrl } from "../../../../../platform/agentHost/common/githubIssueReferences.js";
import { getEffectiveAgents } from "../../../../../platform/agentHost/common/customAgents.js";
import { KNOWN_MODE_VALUES, SessionConfigKey } from "../../../../../platform/agentHost/common/sessionConfigKeys.js";
import { migrateLegacyAutopilotConfig } from "../../../../../platform/agentHost/common/agentHostSchema.js";
import { ChatInteractivity as ProtocolChatInteractivity, ChatOriginKind as ProtocolChatOriginKind, CustomizationType, SessionStatus as ProtocolSessionStatus } from "../../../../../platform/agentHost/common/state/protocol/state.js";
import { ActionType, isChatAction, isSessionAction, NotificationType } from "../../../../../platform/agentHost/common/state/sessionActions.js";
import { buildChatUri, buildDefaultChatUri, isDefaultChatUri, isSessionStatusArchived, isSessionStatusRead, parseChatUri, readSessionGitHubState, readSessionGitState, readSessionWorkspaceless, ROOT_STATE_URI, StateComponents, withSessionStatusFlag, withSessionWorkspaceless } from "../../../../../platform/agentHost/common/state/sessionState.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IWorkspaceTrustManagementService } from "../../../../../platform/workspace/common/workspaceTrust.js";
import { AgentHostDownloadProgress } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostDownloadProgress.js";
import { IAgentHostActiveClientService } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js";
import { IChatWidgetService } from "../../../../../workbench/contrib/chat/browser/chat.js";
import { ChatMode } from "../../../../../workbench/contrib/chat/common/chatModes.js";
import { IChatService } from "../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { IChatSessionsService } from "../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel, getChatPermissionLevelFromDefaultConfiguration, isChatPermissionLevel } from "../../../../../workbench/contrib/chat/common/constants.js";
import { isAutoApprovePolicyRestricted, normalizeSessionConfigValue } from "../../../../../workbench/contrib/chat/common/agentHostConfigPolicy.js";
import { ILanguageModelsService } from "../../../../../workbench/contrib/chat/common/languageModels.js";
import { getRegisteredLanguageModels, resolveConfiguredModel, resolveModelIdentifier, resolveModelIdentifierFromLanguageModels } from "../../../../../workbench/contrib/chat/common/modelSelection.js";
import { buildMutableConfigSchema, resolvedConfigsEqual } from "../../../../common/agentHostSessionsProvider.js";
import { agentHostSessionWorkspaceKey } from "../../../../common/agentHostSessionWorkspace.js";
import { isSessionConfigComplete } from "../../../../common/sessionConfig.js";
import { ChatInteractivity, ChatOriginKind, DEFAULT_CHAT_CAPABILITIES, effectiveChatInteractivity, sessionFileChangesEqual, SessionStatus, toSessionId } from "../../../../services/sessions/common/session.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { IGitHubService } from "../../../github/browser/githubService.js";
import { computeSessionPullRequestIcon } from "../../../github/browser/pullRequestIconStatus.js";
import { IPullRequestIconCache } from "../../../github/browser/pullRequestIconCache.js";
import { mapProtocolStatus } from "./agentHostDiffs.js";
import { createChangesets } from "./agentHostSessionChangesets.js";
import { createSessionOutputObs } from "./agentHostSessionFiles.js";
const STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES = "sessions.agentHost.sessionConfigPicker.selectedValues";
const UNSAFE_SESSION_CONFIG_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
const SEEDED_CONFIG_SCHEMA_KEYS = [SessionConfigKey.Isolation, SessionConfigKey.Branch];
const WORKTREE_ISOLATION_VALUE = "worktree";
function isWorktreeIsolation(values) {
  return values?.[SessionConfigKey.Isolation] === WORKTREE_ISOLATION_VALUE;
}
const CACHED_SESSIONS_MAX_PER_HOST = 100;
const SESSION_STATUS_FLAG_MASK = ProtocolSessionStatus.IsRead | ProtocolSessionStatus.IsArchived;
function serializeMetadata(meta) {
  return {
    session: meta.session.toString(),
    startTime: meta.startTime,
    modifiedTime: meta.modifiedTime,
    summary: meta.summary,
    workingDirectory: meta.workingDirectories?.[0]?.toString(),
    status: meta.status !== void 0 ? meta.status & SESSION_STATUS_FLAG_MASK : void 0,
    project: meta.project ? { uri: meta.project.uri.toString(), displayName: meta.project.displayName } : void 0,
    workspaceless: readSessionWorkspaceless(meta._meta) || void 0
  };
}
function deserializeMetadata(raw) {
  try {
    return {
      session: URI.parse(raw.session),
      startTime: raw.startTime,
      modifiedTime: raw.modifiedTime,
      summary: raw.summary,
      workingDirectories: raw.workingDirectory ? [URI.parse(raw.workingDirectory)] : void 0,
      status: deserializeStatus(raw),
      project: raw.project ? { uri: URI.parse(raw.project.uri), displayName: raw.project.displayName } : void 0,
      ...raw.workspaceless ? { _meta: withSessionWorkspaceless(void 0, true) } : {}
    };
  } catch {
    return void 0;
  }
}
function deserializeStatus(raw) {
  const legacyArchived = raw.isArchived ?? raw.isDone;
  if (raw.isRead === void 0 && legacyArchived === void 0) {
    return raw.status !== void 0 ? raw.status & SESSION_STATUS_FLAG_MASK : void 0;
  }
  let status = (raw.status ?? ProtocolSessionStatus.Idle) & SESSION_STATUS_FLAG_MASK;
  if (raw.isRead !== void 0) {
    status = withSessionStatusFlag(status, ProtocolSessionStatus.IsRead, raw.isRead);
  }
  if (legacyArchived !== void 0) {
    status = withSessionStatusFlag(status, ProtocolSessionStatus.IsArchived, legacyArchived);
  }
  return status;
}
function isRememberedSessionConfigKey(property) {
  return property !== SessionConfigKey.Branch && !UNSAFE_SESSION_CONFIG_KEYS.has(property);
}
function normalizeAutoApproveValue(value, policyRestricted) {
  const normalized = getChatPermissionLevelFromDefaultConfiguration(value) ?? (isChatPermissionLevel(value) ? value : void 0);
  if (!normalized) {
    return void 0;
  }
  if (policyRestricted && normalized !== ChatPermissionLevel.Default) {
    return ChatPermissionLevel.Default;
  }
  return normalized;
}
function isGitHubInfoEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (a === void 0 || b === void 0) {
    return false;
  }
  return a.owner === b.owner && a.repo === b.repo && a.pullRequest?.number === b.pullRequest?.number && a.pullRequest?.icon?.id === b.pullRequest?.icon?.id && a.pullRequest?.baseRefOid === b.pullRequest?.baseRefOid && a.pullRequest?.headRefOid === b.pullRequest?.headRefOid && arrayEquals(a.issues ?? [], b.issues ?? [], (x, y) => x.owner === y.owner && x.repo === y.repo && x.number === y.number);
}
function toGitHubIssueRefs(issueUrls) {
  const refs = [];
  for (const url of issueUrls ?? []) {
    const reference = parseGitHubIssueUrl(url);
    if (reference) {
      refs.push({ ...reference, uri: URI.parse(url) });
    }
  }
  return refs.length > 0 ? refs : void 0;
}
const CopilotCLISessionType = {
  id: "copilotcli",
  label: localize("copilotCLI", "Copilot"),
  icon: Codicon.copilot,
  supportsWorktreeConfiguration: true
};
const WorkspaceSessionKind = {
  isQuickChat: false,
  requiresWorkspace: true,
  get untitledTitle() {
    return localize("new session", "New Session");
  },
  computeWorkspace: (buildWorkspace) => buildWorkspace()
};
const QuickChatSessionKind = {
  isQuickChat: true,
  requiresWorkspace: false,
  get untitledTitle() {
    return localize("new chat", "New Chat");
  },
  computeWorkspace: () => void 0
};
function sessionKind(isQuickChat) {
  return isQuickChat ? QuickChatSessionKind : WorkspaceSessionKind;
}
function toChatInteractivity(interactivity) {
  switch (interactivity) {
    case ProtocolChatInteractivity.ReadOnly:
      return ChatInteractivity.ReadOnly;
    case ProtocolChatInteractivity.Hidden:
      return ChatInteractivity.Hidden;
    default:
      return ChatInteractivity.Full;
  }
}
class AdditionalChat extends Disposable {
  constructor(resource, summary, isNew = false, parentChat, sessionIsArchived = constObservable(false), lastTurnChanges) {
    super();
    const modifiedAt = summary.modifiedAt ? new Date(summary.modifiedAt) : /* @__PURE__ */ new Date();
    this._title = observableValue("chatTitle", summary.title || localize("newChatTab", "New Chat"));
    this._status = observableValue("chatStatus", mapProtocolStatus(summary.status));
    this._updatedAt = observableValue("chatUpdatedAt", modifiedAt);
    this._modelId = observableValue("chatModelId", void 0);
    this._mode = observableValue("chatMode", void 0);
    this._description = observableValue("chatDescription", summary.activity ? new MarkdownString().appendText(summary.activity) : void 0);
    this._lastTurnEnd = observableValue("chatLastTurnEnd", modifiedAt);
    this._interactivity = observableValue("chatInteractivity", toChatInteractivity(summary.interactivity));
    this._isNew = observableValue("chatIsNew", isNew);
    this.chat = {
      resource,
      createdAt: modifiedAt,
      title: this._title,
      updatedAt: this._updatedAt,
      status: derived((reader) => this._isNew.read(reader) ? SessionStatus.Untitled : this._status.read(reader)),
      changes: constObservable([]),
      lastTurnChanges,
      checkpoints: observableValue(this, void 0),
      modelId: this._modelId,
      mode: this._mode,
      isArchived: sessionIsArchived,
      isRead: constObservable(true),
      // An archived session is read-only: force every chat's interactivity to
      // ReadOnly so the chat view hides the composer and gates mutating actions.
      interactivity: derived((reader) => effectiveChatInteractivity(sessionIsArchived.read(reader), this._interactivity.read(reader))),
      description: this._description,
      lastTurnEnd: this._lastTurnEnd,
      origin: summary.origin ? {
        kind: toSessionChatOriginKind(summary.origin.kind),
        parentChat,
        ...summary.origin.kind === ProtocolChatOriginKind.SideChat && summary.origin.selection ? { selection: toSessionSideChatSelection(summary.origin.selection) } : {}
      } : void 0,
      // Subagent (tool-origin) worker chats are transient children and can be
      // neither renamed nor deleted; other peer chats are fully manageable.
      capabilities: constObservable(
        summary.origin?.kind === ProtocolChatOriginKind.Tool ? { canRename: false, canDelete: false } : DEFAULT_CHAT_CAPABILITIES
      )
    };
  }
  update(summary) {
    const modifiedAt = summary.modifiedAt ? new Date(summary.modifiedAt) : this._updatedAt.get();
    transaction((tx) => {
      this._title.set(summary.title || localize("newChatTab", "New Chat"), tx);
      this._status.set(mapProtocolStatus(summary.status), tx);
      this._updatedAt.set(modifiedAt, tx);
      this._description.set(summary.activity ? new MarkdownString().appendText(summary.activity) : void 0, tx);
      this._lastTurnEnd.set(modifiedAt, tx);
      this._interactivity.set(toChatInteractivity(summary.interactivity), tx);
    });
  }
  /** Optimistically update the chat title ahead of the host's `chatUpdated`. */
  setTitle(title) {
    this._title.set(title || localize("newChatTab", "New Chat"), void 0);
  }
  /** Present as `Untitled` until the first request is sent so the view shows the composer. */
  markNew() {
    this._isNew.set(true, void 0);
  }
  /** Clear the `new` presentation after the first request is sent. */
  markSent() {
    this._isNew.set(false, void 0);
  }
  setModelId(modelId) {
    this._modelId.set(modelId, void 0);
  }
  setAgent(agent) {
    this._mode.set(agent ? { id: agent.uri, kind: AGENT_MODE_KIND } : void 0, void 0);
  }
}
function toSessionChatOriginKind(kind) {
  switch (kind) {
    case ChatOriginKind.Tool:
      return ChatOriginKind.Tool;
    case ChatOriginKind.Fork:
      return ChatOriginKind.Fork;
    case ChatOriginKind.SideChat:
      return ChatOriginKind.SideChat;
    default:
      return ChatOriginKind.User;
  }
}
function toSessionSideChatSelection(selection) {
  return {
    text: selection.text,
    ...selection.responsePartId ? { responsePartId: selection.responsePartId } : {}
  };
}
let AgentHostSessionAdapter = class extends Disposable {
  constructor(metadata, providerId, resourceScheme, logicalSessionType, _options, _gitHubService, _sessionsService, _pullRequestIconCache) {
    super();
    this._options = _options;
    this._gitHubService = _gitHubService;
    this._sessionsService = _sessionsService;
    this._pullRequestIconCache = _pullRequestIconCache;
    this.isArchived = observableValue("isArchived", false);
    // Read/unread state is owned by the provider and backed by the agent host
    // protocol's `IsRead` status bit (persisted as session metadata). It is
    // seeded from the session metadata, kept in sync with protocol updates, and
    // mutated via {@link BaseAgentHostSessionsProvider.setSessionReadState}.
    this.isRead = observableValue("isRead", true);
    /**
     * Independent title override for the default chat tab. `undefined` means the
     * default chat inherits the session title; a non-empty value means the user
     * (or host) renamed the default chat independently of the session.
     */
    this._defaultChatTitleOverride = observableValue("defaultChatTitleOverride", void 0);
    /**
     * Independent status override for the default chat tab. `undefined` means the
     * default chat reflects the aggregated session status (the single-chat case,
     * where they are equivalent); a defined value means a multi-chat session, so
     * the default chat shows its own status rather than the session aggregate
     * (which may have been promoted by a running peer chat).
     */
    this._defaultChatStatusOverride = observableValue("defaultChatStatusOverride", void 0);
    /** Whether this session was created with worktree isolation. */
    this._worktreeIsolation = observableValue("worktreeIsolation", false);
    /** Interactivity of the default chat. Driven from the default chat's protocol summary. */
    this._defaultChatInteractivity = observableValue("defaultChatInteractivity", ChatInteractivity.Full);
    /** Additional (non-default) peer chats keyed by chatId. */
    this._additionalChats = this._register(new DisposableMap());
    /** Chat ids that have not yet sent their first request (presented as `Untitled`). */
    this._newChatIds = /* @__PURE__ */ new Set();
    this._changesSummary = observableValueOpts({ equalsFn: structuralEquals }, void 0);
    const rawId = AgentSession.id(metadata.session);
    const agentProvider = AgentSession.provider(metadata.session);
    if (!agentProvider) {
      throw new Error(`Agent session URI has no provider scheme: ${metadata.session.toString()}`);
    }
    this.agentProvider = agentProvider;
    this.backendUri = AgentSession.uri(_options.backendSessionScheme ?? agentProvider, rawId);
    this.resource = URI.from({ scheme: resourceScheme, path: `/${rawId}` });
    this._rawId = rawId;
    this._resourceScheme = resourceScheme;
    this.sessionId = toSessionId(providerId, this.resource);
    this.providerId = providerId;
    this.sessionType = logicalSessionType;
    this._isQuickChat = observableValue("isQuickChat", readSessionWorkspaceless(metadata._meta));
    this.icon = _options.icon;
    this.createdAt = new Date(metadata.startTime);
    this.title = observableValue("title", metadata.summary || `Session ${rawId.substring(0, 8)}`);
    this.updatedAt = observableValue("updatedAt", new Date(metadata.modifiedTime));
    this.modelSelection = void 0;
    this.status = observableValue("status", metadata.status !== void 0 ? mapProtocolStatus(metadata.status) : SessionStatus.Completed);
    this.modelId = observableValue("modelId", void 0);
    this.mode = observableValue("mode", void 0);
    this.lastTurnEnd = observableValue("lastTurnEnd", metadata.modifiedTime ? new Date(metadata.modifiedTime) : void 0);
    this._activity = observableValue("activity", metadata.activity);
    this._project = metadata.project;
    this._workingDirectories = metadata.workingDirectories;
    this._meta = metadata._meta;
    this._metaObs = observableValue("agentHostSessionMeta", this._meta);
    const baseGitHubInfoObs = derivedOpts({
      equalsFn: isGitHubInfoEqual
    }, (reader) => {
      const meta = this._metaObs.read(reader);
      const state = readSessionGitHubState(meta);
      if (!state) {
        return void 0;
      }
      let owner = state.owner;
      let repo = state.repo;
      let pullRequestNumber;
      if (state.pullRequestUrl) {
        const match = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(state.pullRequestUrl);
        if (match) {
          owner = owner ?? match[1];
          repo = repo ?? match[2];
          pullRequestNumber = Number(match[3]);
        }
      }
      if (!owner || !repo) {
        return void 0;
      }
      return {
        owner,
        repo,
        pullRequest: pullRequestNumber !== void 0 ? {
          number: pullRequestNumber,
          uri: URI.parse(state.pullRequestUrl)
        } : void 0,
        issues: toGitHubIssueRefs(state.issueUrls)
      };
    });
    this.gitHubInfo = derived((reader) => {
      const baseGitHubInfo = baseGitHubInfoObs.read(reader);
      if (!baseGitHubInfo?.pullRequest) {
        return baseGitHubInfo;
      }
      return {
        ...baseGitHubInfo,
        pullRequest: {
          ...baseGitHubInfo.pullRequest,
          icon: computeSessionPullRequestIcon(reader, this._gitHubService, this._pullRequestIconCache, baseGitHubInfo)
        }
      };
    });
    const initialWorkspace = this._computeWorkspace();
    this.workspace = observableValue("workspace", initialWorkspace);
    this.isQuickChat = this._isQuickChat;
    this.worktreePending = derived(this, (reader) => this._worktreeIsolation.read(reader) && !this.workspace.read(reader)?.folders.some((folder) => !!folder.gitRepository?.workTreeUri));
    this.loading = _options.loading;
    this.description = derived((reader) => {
      const status = this.status.read(reader);
      if (status === SessionStatus.InProgress || status === SessionStatus.NeedsInput) {
        const activity = this._activity.read(reader);
        if (activity) {
          return new MarkdownString().appendText(activity);
        }
      }
      return void 0;
    });
    if (isSessionStatusArchived(metadata.status)) {
      this.isArchived.set(true, void 0);
    }
    if (metadata.status !== void 0) {
      this.isRead.set(isSessionStatusRead(metadata.status), void 0);
    }
    this.isActiveSessionObs = derived(this, (reader) => {
      const activeSession = this._sessionsService.activeSession.read(reader);
      return isEqual(activeSession?.resource, this.resource);
    });
    this.setChangesSummary(metadata.changes);
    this.changesets = observableValue(this, void 0);
    this.changes = this._createChangesObs();
    const sessionOutput = createSessionOutputObs(this.backendUri, this._options, this.isActiveSessionObs, this.isArchived, this.workspace);
    this._sessionOutput = sessionOutput;
    this.externalChanges = sessionOutput.externalFiles;
    const mainChat = {
      resource: this.resource,
      createdAt: this.createdAt,
      title: derived(this, (reader) => this._defaultChatTitleOverride.read(reader) ?? this.title.read(reader)),
      updatedAt: this.updatedAt,
      status: derived(this, (reader) => this._defaultChatStatusOverride.read(reader) ?? this.status.read(reader)),
      changes: this.changes,
      lastTurnChanges: sessionOutput.getLastTurnChanges(URI.parse(buildDefaultChatUri(this.backendUri))),
      checkpoints: observableValue(this, void 0),
      modelId: this.modelId,
      mode: this.mode,
      isArchived: this.isArchived,
      isRead: this.isRead,
      // An archived session is read-only: force the default chat's
      // interactivity to ReadOnly so the chat view hides the composer and
      // gates mutating actions.
      interactivity: derived(this, (reader) => effectiveChatInteractivity(this.isArchived.read(reader), this._defaultChatInteractivity.read(reader))),
      description: this.description,
      lastTurnEnd: this.lastTurnEnd
    };
    this._defaultChat = mainChat;
    this._mainChatObs = observableValue(this, mainChat);
    this._chatsObs = observableValue(this, [mainChat]);
    this.mainChat = this._mainChatObs;
    this.chats = this._chatsObs;
    this.capabilities = derivedOpts({ owner: this, equalsFn: structuralEquals }, (reader) => {
      const agentCapabilities = this._options.agentCapabilities.read(reader)?.get(this.agentProvider);
      return {
        supportsMultipleChats: !this.isQuickChat.read(reader) && agentCapabilities?.multipleChats !== void 0,
        supportsFork: agentCapabilities?.multipleChats?.fork ?? false,
        supportsSideChat: agentCapabilities?.multipleChats?.sideChat ?? false,
        supportsRename: true,
        supportsDelete: true
      };
    });
    this._register(autorun((reader) => {
      this.capabilities.read(reader);
      const state = this._lastCatalogState;
      if (state) {
        this._applyChatCatalog(state);
      }
    }));
  }
  /** Session-kind strategy (quick chat vs. workspace), derived from {@link _isQuickChat}. */
  get _kind() {
    return sessionKind(this._isQuickChat.get());
  }
  get changesSummary() {
    return this._changesSummary;
  }
  /**
   * Sets the aggregate change chip. Callers inside a transaction MUST pass it
   * — a `set` without one builds and finishes its own transaction, notifying
   * observers before the enclosing update has applied its remaining fields.
   */
  setChangesSummary(changes, tx) {
    if (!changes) {
      return false;
    }
    const { additions, deletions, files } = changes;
    const currentChangesSummary = this._changesSummary.get();
    if ((currentChangesSummary?.files ?? 0) === (files ?? 0) && (currentChangesSummary?.additions ?? 0) === (additions ?? 0) && (currentChangesSummary?.deletions ?? 0) === (deletions ?? 0)) {
      return false;
    }
    this._changesSummary.set({
      additions: additions ?? 0,
      deletions: deletions ?? 0,
      files: files ?? 0
    }, tx);
    return true;
  }
  /**
   * Reconcile the per-chat catalog from an AHP {@link SessionState}.
   *
   * The default chat (resource == this session's resource) always maps to
   * {@link _defaultChat}. Additional peer chats become their own {@link IChat}
   * whose resource carries the chatId in the URI fragment so the chat view
   * opens a distinct widget that the session handler routes to the matching
   * chat channel.
   *
   * A non-default chat surfaces as a peer tab when the session supports
   * multiple chats (the `copilotcli` case) OR when it is a subagent
   * (tool-origin) chat. Subagent chats are always surfaced as read-only peers
   * — independent of multi-chat support — so the user can review a worker's
   * transcript (the agent-team pattern). Sessions with no surfaced peers
   * degrade to `[defaultChat]`.
   */
  applyChatCatalog(state) {
    this._lastCatalogState = state;
    this._applyChatCatalog(state);
  }
  _applyChatCatalog(state) {
    const defaultChatUri = state.defaultChat?.toString();
    const isDefault = (summary) => defaultChatUri ? summary.resource.toString() === defaultChatUri : isDefaultChatUri(summary.resource);
    const defaultSummary = state.chats.find(isDefault);
    this._defaultChatTitleOverride.set(defaultSummary?.title || void 0, void 0);
    this._defaultChatInteractivity.set(toChatInteractivity(defaultSummary?.interactivity), void 0);
    const surfacesAsPeer = (summary) => !isDefault(summary) && !!parseChatUri(summary.resource)?.chatId && (this.capabilities.get().supportsMultipleChats || summary.origin?.kind === ProtocolChatOriginKind.Tool || summary.origin?.kind === ProtocolChatOriginKind.SideChat);
    if (!state.chats.some(surfacesAsPeer)) {
      this._defaultChatStatusOverride.set(void 0, void 0);
      if (this._additionalChats.size > 0) {
        this._additionalChats.clearAndDisposeAll();
      }
      if (this._chatsObs.get().length !== 1 || this._chatsObs.get()[0] !== this._defaultChat) {
        transaction((tx) => {
          this._chatsObs.set([this._defaultChat], tx);
          this._mainChatObs.set(this._defaultChat, tx);
        });
      }
      return;
    }
    this._defaultChatStatusOverride.set(defaultSummary ? mapProtocolStatus(defaultSummary.status) : void 0, void 0);
    const seen = /* @__PURE__ */ new Set();
    const ordered = [];
    for (const summary of state.chats) {
      if (isDefault(summary)) {
        ordered.push(this._defaultChat);
        continue;
      }
      if (!surfacesAsPeer(summary)) {
        continue;
      }
      const chatId = parseChatUri(summary.resource).chatId;
      seen.add(chatId);
      let entry = this._additionalChats.get(chatId);
      if (!entry) {
        entry = this._createAdditionalChat(chatId, summary);
        this._additionalChats.set(chatId, entry);
      } else {
        entry.update(summary);
      }
      ordered.push(entry.chat);
    }
    for (const chatId of [...this._additionalChats.keys()]) {
      if (!seen.has(chatId)) {
        this._additionalChats.deleteAndDispose(chatId);
      }
    }
    const main = defaultChatUri && ordered.find((c) => isEqual(c.resource, this.resource)) || this._defaultChat;
    transaction((tx) => {
      this._chatsObs.set(ordered.length > 0 ? ordered : [this._defaultChat], tx);
      this._mainChatObs.set(main, tx);
    });
  }
  _createAdditionalChat(chatId, summary) {
    const resource = URI.from({ scheme: this._resourceScheme, path: `/${this._rawId}`, fragment: chatId });
    const lastTurnChanges = this._sessionOutput.getLastTurnChanges(URI.parse(summary.resource));
    return new AdditionalChat(resource, summary, this._newChatIds.has(chatId), this._resolveParentChatResource(summary.origin), this.isArchived, lastTurnChanges);
  }
  /**
   * Maps a protocol parent-chat URI (from a Tool/Fork {@link ChatSummary.origin})
   * to this session's UI chat resource: the default chat maps to the session
   * resource; peer chats carry their chatId in the resource fragment.
   */
  _resolveParentChatResource(origin) {
    const parentUri = origin && (origin.kind === ProtocolChatOriginKind.Tool || origin.kind === ProtocolChatOriginKind.Fork || origin.kind === ProtocolChatOriginKind.SideChat) ? origin.chat : void 0;
    if (!parentUri) {
      return void 0;
    }
    if (isDefaultChatUri(parentUri)) {
      return this.resource;
    }
    const parentChatId = parseChatUri(parentUri)?.chatId;
    return parentChatId ? URI.from({ scheme: this._resourceScheme, path: `/${this._rawId}`, fragment: parentChatId }) : this.resource;
  }
  /** Mark a peer chat new so it shows as `Untitled` until its first request. */
  markChatAsNew(chatId) {
    this._newChatIds.add(chatId);
    this._additionalChats.get(chatId)?.markNew();
  }
  /** Clear the `new` flag after the chat's first request is sent. */
  markChatAsSent(chatId) {
    this._newChatIds.delete(chatId);
    this._additionalChats.get(chatId)?.markSent();
  }
  setChatModelId(chatResource, modelId) {
    const chatId = chatResource.fragment;
    if (chatId) {
      this._getAdditionalChat(chatResource)?.setModelId(modelId);
    } else {
      this.modelId.set(modelId, void 0);
      this.modelSelection = modelId ? this._toModelSelection(modelId) : void 0;
    }
  }
  setChatAgent(chatResource, agent) {
    const chatId = chatResource.fragment;
    if (chatId) {
      this._getAdditionalChat(chatResource)?.setAgent(agent);
    } else {
      this.mode.set(agent ? { id: agent.uri, kind: AGENT_MODE_KIND } : void 0, void 0);
      this._agentBaseDir = agent ? this._workingDirectories?.[0] : void 0;
    }
  }
  /**
   * Reconcile the selected custom-agent URI against the host's current agent
   * list — e.g. the session graduated with an agent picked in the original repo
   * but now runs in an isolated worktree, where the host reports the same agent
   * file under the worktree path.
   *
   * The selection is rebased by matching the agent's repo-relative path against
   * the available agents (which already carry the worktree root) rather than the
   * session's reported working directory. The working directory is unreliable
   * here: the worktree-pathed customizations arrive well before either the
   * `SessionSummary` or `SessionState` working-directory flips to the worktree,
   * so a working-directory-keyed rebase would miss the window and let the picker
   * destructively reset the selection. Deriving the worktree root from the agent
   * list closes that race.
   *
   * Mirrors the agent-host backend's code to rebase by relative path.
   * The re-point is only applied to a URI that actually exists in
   * the supplied agent list, so it never runs ahead of the host reporting the
   * worktree agents (which would otherwise re-introduce the mismatch it fixes).
   */
  reconcileSelectedAgent(agents) {
    const current = this.mode.get();
    if (!current || agents.some((a) => a.uri === current.id)) {
      return;
    }
    const base = this._agentBaseDir;
    if (!base) {
      return;
    }
    const agentUri = URI.parse(current.id);
    if (!isEqualOrParent(agentUri, base)) {
      return;
    }
    const rel = relativePath(base, agentUri);
    if (!rel) {
      return;
    }
    const relocated = this._findRelocatedAgent(agents, agentUri, base, rel);
    if (relocated) {
      this.mode.set({ id: relocated.uri, kind: current.kind }, void 0);
      this._agentBaseDir = relocated.root;
    }
  }
  /**
   * Finds an available agent that is the same repo-relative file as the current
   * selection but rooted under a different directory (its worktree twin).
   *
   * A candidate matches when its path ends with `/<rel>` on a path-segment
   * boundary and the implied root (the candidate path minus that suffix) differs
   * from `base`. The root is re-validated with `relativePath` so only a genuine
   * relocation of the same file is accepted. Returns the matched agent's URI and
   * its derived root, or `undefined` when there is no twin.
   */
  _findRelocatedAgent(agents, agentUri, base, rel) {
    const suffix = `/${rel}`;
    for (const agent of agents) {
      const candidate = URI.parse(agent.uri);
      if (candidate.scheme !== agentUri.scheme || candidate.authority !== agentUri.authority) {
        continue;
      }
      if (!candidate.path.endsWith(suffix) || candidate.path.length === suffix.length) {
        continue;
      }
      const root = candidate.with({ path: candidate.path.slice(0, candidate.path.length - suffix.length) });
      if (isEqual(root, base) || relativePath(root, candidate) !== rel) {
        continue;
      }
      return { uri: agent.uri, root };
    }
    return void 0;
  }
  /**
   * Seed the selected custom agent when a session is resumed (e.g. after a
   * window reload). A freshly loaded adapter starts with `mode === undefined`;
   * the host persists the selection on the default chat's `ChatState.draft.agent`,
   * which the provider reads and mirrors onto `session.mode` here. Guarded to
   * never override a live selection (a Part 1 graduation seed or a user pick),
   * keeping this a resume-only hydration.
   */
  hydrateSelectedAgent(agentUri) {
    if (this.mode.get() !== void 0) {
      return;
    }
    this.setChatAgent(this.resource, { uri: agentUri, name: "" });
  }
  getChatModelId(chatResource) {
    return chatResource.fragment ? this._getAdditionalChat(chatResource)?.chat.modelId.get() : this.modelId.get();
  }
  getChatModelSelection(chatResource) {
    const modelId = this.getChatModelId(chatResource);
    if (modelId) {
      return this._toModelSelection(modelId);
    }
    return chatResource.fragment ? void 0 : this.modelSelection;
  }
  getChatMode(chatResource) {
    return chatResource.fragment ? this._getAdditionalChat(chatResource)?.chat.mode.get() : this.mode.get();
  }
  /** Optimistically set the default chat tab title (independent of the session title). */
  setDefaultChatTitle(title) {
    this._defaultChatTitleOverride.set(title || void 0, void 0);
  }
  /** Optimistically set an additional peer chat's title ahead of the host's `chatUpdated`. */
  setAdditionalChatTitle(chatId, title) {
    this._additionalChats.get(chatId)?.setTitle(title);
  }
  _toModelSelection(modelId) {
    const prefix = `${this._resourceScheme}:`;
    return { id: modelId.startsWith(prefix) ? modelId.substring(prefix.length) : modelId };
  }
  _getAdditionalChat(chatResource) {
    const byFragment = chatResource.fragment ? this._additionalChats.get(chatResource.fragment) : void 0;
    if (byFragment) {
      return byFragment;
    }
    for (const chat of this._additionalChats.values()) {
      if (isEqual(chat.chat.resource, chatResource)) {
        return chat;
      }
    }
    return void 0;
  }
  _createChangesObs() {
    const defaultChangesetObs = derivedOpts({
      equalsFn: (c1, c2) => c1?.id === c2?.id
    }, (reader) => {
      const changesets = this.changesets.read(reader);
      if (!changesets) {
        return void 0;
      }
      return changesets.find((c) => c.isDefault.read(reader) === true);
    });
    const defaultChangesetChangesObs = derived((reader) => {
      const defaultChangeset = defaultChangesetObs.read(reader);
      if (!defaultChangeset) {
        return [];
      }
      return defaultChangeset.changes.read(reader);
    });
    return derivedOpts(
      { equalsFn: sessionFileChangesEqual },
      (reader) => defaultChangesetChangesObs.read(reader) ?? []
    );
  }
  /**
   * Update fields from a refreshed metadata snapshot. Returns `true` iff
   * any user-visible field changed.
   */
  update(metadata) {
    let didChange = false;
    transaction((tx) => {
      const summary = metadata.summary;
      if (summary !== void 0 && summary !== this.title.get()) {
        this.title.set(summary, tx);
        didChange = true;
      }
      if (metadata.status !== void 0) {
        const uiStatus = mapProtocolStatus(metadata.status);
        if (uiStatus !== this.status.get()) {
          this.status.set(uiStatus, tx);
          didChange = true;
        }
      }
      const modifiedTime = metadata.modifiedTime;
      if (this.updatedAt.get().getTime() !== modifiedTime) {
        this.updatedAt.set(new Date(modifiedTime), tx);
        didChange = true;
      }
      const currentLastTurnEndTime = this.lastTurnEnd.get()?.getTime();
      const nextLastTurnEndTime = modifiedTime ? modifiedTime : void 0;
      if (currentLastTurnEndTime !== nextLastTurnEndTime) {
        this.lastTurnEnd.set(nextLastTurnEndTime !== void 0 ? new Date(nextLastTurnEndTime) : void 0, tx);
        didChange = true;
      }
      this._project = metadata.project;
      this._workingDirectories = metadata.workingDirectories;
      if (metadata._meta !== void 0) {
        if (this.setMeta(metadata._meta, tx)) {
          didChange = true;
        }
      } else {
        const workspace = this._computeWorkspace();
        if (agentHostSessionWorkspaceKey(workspace) !== agentHostSessionWorkspaceKey(this.workspace.get())) {
          this.workspace.set(workspace, tx);
          didChange = true;
        }
      }
      if (metadata.status !== void 0) {
        const isArchived = isSessionStatusArchived(metadata.status);
        if (isArchived !== this.isArchived.get()) {
          this.isArchived.set(isArchived, tx);
          didChange = true;
        }
        const isRead = isSessionStatusRead(metadata.status);
        if (isRead !== this.isRead.get()) {
          this.isRead.set(isRead, tx);
          didChange = true;
        }
      }
      if (metadata.changes !== void 0 && this.setChangesSummary(metadata.changes, tx)) {
        didChange = true;
      }
      if (this._activity.get() !== metadata.activity) {
        this._activity.set(metadata.activity, tx);
        didChange = true;
      }
    });
    return didChange;
  }
  /**
   * Sets the activity text from a `SessionSummaryChanged` notification.
   * Returns `true` iff the activity observable changed. Callers inside a
   * transaction MUST pass it — see {@link setChangesSummary}.
   */
  setActivity(activity, tx) {
    if (this._activity.get() !== activity) {
      this._activity.set(activity, tx);
      return true;
    }
    return false;
  }
  /**
   * Apply a `_meta` delta (the shared session-state / session-summary bag,
   * fed from `_applySessionMetaFromState` or a `SessionSummaryChanged`
   * notification), promote the session kind if the delta reports it
   * workspace-less, and rebuild the workspace if the git state changed.
   * Returns `true` iff anything observable changed, so the list regroups a
   * session that became a quick chat without ever having had a workspace.
   *
   * Callers that are already inside a transaction MUST pass it: a plain
   * `transaction()` here would finish (and therefore notify) mid-way through
   * the enclosing one, letting observers of `_meta` / `isQuickChat` /
   * `workspace` read a torn snapshot of the fields the caller has not applied
   * yet.
   */
  setMeta(meta, tx) {
    this._meta = meta;
    let didChange = false;
    subtransaction(tx, (tx2) => {
      this._metaObs.set(this._meta, tx2);
      didChange = this._promoteToQuickChatIfWorkspaceless(tx2);
      const workspace = this._computeWorkspace();
      if (agentHostSessionWorkspaceKey(workspace) !== agentHostSessionWorkspaceKey(this.workspace.get())) {
        this.workspace.set(workspace, tx2);
        didChange = true;
      }
    });
    return didChange;
  }
  /** Records that this session runs with worktree isolation. See {@link worktreePending}. */
  setWorktreeIsolation(isolated) {
    this._worktreeIsolation.set(isolated, void 0);
  }
  /**
   * Heal an adapter born mis-classified because the path that materialized it
   * carried no `_meta` (a stale persisted cache, an older host). One-way: an
   * absent marker means "not included", never "cleared", so a quick chat is
   * never demoted back into a workspace session rooted at its scratch cwd.
   */
  _promoteToQuickChatIfWorkspaceless(tx) {
    if (this._isQuickChat.get() || !readSessionWorkspaceless(this._meta)) {
      return false;
    }
    this._isQuickChat.set(true, tx);
    return true;
  }
  /**
   * Resolves the session workspace. Quick chats stay workspace-less
   * (`undefined`) regardless of any scratch working directory the host
   * assigned; workspace sessions build from project/git metadata.
   */
  _computeWorkspace() {
    return this._kind.computeWorkspace(() => this._options.buildWorkspace(this._project, this._workingDirectories, this.gitHubInfo, readSessionGitState(this._meta)));
  }
  updateChangesets(changesetsMetadata) {
    if (!changesetsMetadata) {
      return;
    }
    const changesets = createChangesets(this.backendUri, this._options, this.isActiveSessionObs, changesetsMetadata);
    this.changesets.set(changesets, void 0);
  }
};
AgentHostSessionAdapter = __decorateClass([
  __decorateParam(5, IGitHubService),
  __decorateParam(6, ISessionsService),
  __decorateParam(7, IPullRequestIconCache)
], AgentHostSessionAdapter);
const AGENT_MODE_KIND = "agent";
function customizationsChanged(previous, state) {
  if (previous.customizations !== state.customizations) {
    return true;
  }
  const previousActiveCustomizations = flattenActiveClientCustomizations(previous);
  const currentActiveCustomizations = flattenActiveClientCustomizations(state);
  return !arrayEquals(previousActiveCustomizations, currentActiveCustomizations, (a, b) => {
    if (a.nonce !== void 0 && a.nonce === b.nonce) {
      return true;
    }
    return a === b;
  });
}
function flattenActiveClientCustomizations(state) {
  const result = [];
  for (const client of state.activeClients) {
    if (client.customizations) {
      result.push(...client.customizations);
    }
  }
  return result;
}
let NewSession = class extends Disposable {
  constructor(ctx, _options, sessionsService) {
    super();
    this._options = _options;
    this._changesets = observableValue(this, void 0);
    this._worktreePending = observableValue(this, false);
    /**
     * Latest resolved config. Replaces what used to live in `_newSessionConfigs`.
     * `undefined` indicates the most recent {@link resolveConfig} failed and no
     * cached values are usable.
     */
    this._config = { schema: { type: "object", properties: {} }, values: {} };
    /**
     * Monotonic counter for in-flight {@link resolveConfig} calls. Each call
     * increments the counter and only writes its result back if its sequence
     * is still the latest one. Bumped on dispose so any pending resolve
     * discards itself.
     */
    this._configRequestSeq = 0;
    this._lifetimeCts = this._register(new CancellationTokenSource());
    /**
     * `onDidChange` listener for {@link _subscription}. Forwards every
     * `SessionState` snapshot to the provider via {@link _onSessionState}
     * so the new session's customizations (and any other state) reach
     * `_lastSessionStates` while the session is still Untitled. Detached
     * in {@link graduate} (handoff) and {@link dispose} (close-without-send).
     */
    this._stateListener = this._register(new MutableDisposable());
    const workspaceUri = ctx.workspace?.folders[0]?.root;
    this._kind = sessionKind(!!ctx.quickChat);
    if (this._kind.requiresWorkspace && !workspaceUri) {
      throw new Error("Workspace has no repository URI");
    }
    this.workspaceUri = workspaceUri;
    this.isQuickChat = this._kind.isQuickChat;
    this.requiresWorkspaceTrust = !!ctx.workspace?.requiresWorkspaceTrust;
    this.agentProvider = ctx.sessionType.id;
    this._providerId = ctx.providerId;
    this._logService = ctx.logService;
    this._onSessionState = ctx.onSessionState;
    this._initialActiveClient = ctx.activeClient;
    const resource = URI.from({ scheme: ctx.resourceScheme, path: `/${generateUuid()}` });
    this._isActiveSessionObs = derived(this, (reader) => isEqual(sessionsService.activeSession.read(reader)?.resource, resource));
    this._backendSessionUri = AgentSession.uri(ctx.backendSessionScheme ?? this.agentProvider, AgentSession.id(resource));
    this._status = observableValue(this, SessionStatus.Untitled);
    this._title = observableValue(this, "");
    const title = this._title;
    const updatedAt = observableValue(this, /* @__PURE__ */ new Date());
    const workspaceObs = observableValue(this, ctx.workspace);
    const changes = observableValueOpts({ owner: this, equalsFn: sessionFileChangesEqual }, []);
    const checkpoints = observableValue(this, void 0);
    this._selectedModelId = void 0;
    this._selectedAgent = void 0;
    this._modelId = observableValue(this, this._selectedModelId);
    const mode = observableValue(this, void 0);
    this._mode = mode;
    const isArchived = observableValue(this, false);
    const isRead = observableValue(this, true);
    const description = observableValue(this, void 0);
    const lastTurnEnd = observableValue(this, void 0);
    this._loading = observableValue(this, true);
    this._isResolvingConfig = observableValue(this, false);
    const createdAt = /* @__PURE__ */ new Date();
    const mainChat = {
      resource,
      createdAt,
      title,
      updatedAt,
      status: this._status,
      changes,
      checkpoints,
      modelId: this._modelId,
      mode,
      isArchived,
      isRead,
      interactivity: constObservable(ChatInteractivity.Full),
      description,
      lastTurnEnd
    };
    this._mainChat = observableValue(this, mainChat);
    const authPending = ctx.authenticationPending;
    const loading = this._loading;
    const chats = this._mainChat.map((c) => [c]);
    this.session = {
      sessionId: `${ctx.providerId}:${resource.toString()}`,
      resource,
      providerId: ctx.providerId,
      sessionType: ctx.sessionType.id,
      icon: ctx.icon,
      createdAt,
      workspace: workspaceObs,
      isQuickChat: constObservable(this._kind.isQuickChat),
      worktreePending: this._worktreePending,
      title,
      updatedAt,
      status: this._status,
      changesets: this._changesets,
      changes,
      modelId: this._modelId,
      mode,
      loading: derived((reader) => loading.read(reader) || authPending.read(reader)),
      isArchived,
      isRead,
      description,
      lastTurnEnd,
      mainChat: this._mainChat,
      chats,
      capabilities: constObservable({ supportsMultipleChats: false, supportsRename: true, supportsDelete: true })
    };
    this.sessionId = this.session.sessionId;
    if (ctx.initialConfigValues || ctx.initialConfigSchema) {
      this._config = {
        schema: { type: "object", properties: { ...ctx.initialConfigSchema } },
        values: { ...ctx.initialConfigValues }
      };
    }
    this._syncWorktreePending();
  }
  /** Re-reads the isolation pick from the cached config into {@link _worktreePending}. */
  _syncWorktreePending() {
    this._worktreePending.set(isWorktreeIsolation(this._config?.values), void 0);
  }
  // -- Picker mutations ----------------------------------------------------
  setSelectedModelId(modelId) {
    this._selectedModelId = modelId;
    this._modelId.set(modelId, void 0);
  }
  getSelectedModelId() {
    return this._selectedModelId;
  }
  clearSelectedModelId() {
    this._selectedModelId = void 0;
  }
  /** Untitled skeleton title used until the first request commits the session. */
  get untitledTitle() {
    return this._kind.untitledTitle;
  }
  setSelectedAgent(agent) {
    this._selectedAgent = agent;
    this._mode.set(agent ? { id: agent.uri, kind: AGENT_MODE_KIND } : void 0, void 0);
  }
  getSelectedAgent() {
    return this._selectedAgent;
  }
  clearSelectedAgent() {
    this._selectedAgent = void 0;
    this._mode.set(void 0, void 0);
  }
  setStatus(status) {
    this._status.set(status, void 0);
  }
  setLoading(loading) {
    this._loading.set(loading, void 0);
  }
  setTitle(title) {
    this._title.set(title, void 0);
  }
  // -- Config --------------------------------------------------------------
  getConfig() {
    return this._config;
  }
  getConfigValues() {
    return this._config?.values;
  }
  /**
   * Optimistically merges a single property into the cached config.
   * Preserves the existing schema so schema-driven pickers don't flash
   * during the async re-resolve. {@link resolveConfig} replaces both
   * schema and values when its response lands.
   */
  setConfigValue(property, value) {
    const current = this._config;
    this._config = {
      schema: current?.schema ?? { type: "object", properties: {} },
      values: { ...current?.values ?? {}, [property]: value }
    };
    this._syncWorktreePending();
  }
  /**
   * `true` while a {@link resolveConfig} round-trip is in flight. See
   * {@link _isResolvingConfig} for why this is distinct from {@link ISession.loading}.
   */
  get isResolvingConfig() {
    return this._isResolvingConfig;
  }
  get cancellationToken() {
    return this._lifetimeCts.token;
  }
  /** Mark a resolve as starting before the optimistic event fires. */
  beginResolveConfigSync() {
    this._isResolvingConfig.set(true, void 0);
  }
  /**
   * Clear the in-flight flag for early-return paths that skip
   * {@link resolveConfig} (e.g. no connection), where the `finally`
   * cleanup never runs.
   */
  endResolveConfigSync() {
    this._isResolvingConfig.set(false, void 0);
  }
  /**
   * Re-resolves the session config against the agent host using the
   * currently cached values. Ignores its own response if a newer call
   * superseded it. Returns `true` if the config was applied (i.e. this
   * call was not stale by the time the response arrived). On failure, the
   * cached config is cleared so {@link getConfig} returns `undefined`.
   * @param strict Rethrow the latest resolution error instead of treating the refresh as best effort.
   */
  async resolveConfig(connection, strict = false) {
    const seq = ++this._configRequestSeq;
    this._isResolvingConfig.set(true, void 0);
    try {
      const result = await connection.resolveSessionConfig({
        provider: this.agentProvider,
        workingDirectory: this.workspaceUri,
        config: this._config?.values
      });
      if (seq !== this._configRequestSeq) {
        return false;
      }
      this._config = result;
      this._syncWorktreePending();
      return true;
    } catch (error) {
      if (seq !== this._configRequestSeq) {
        return false;
      }
      this._config = void 0;
      this._syncWorktreePending();
      if (strict) {
        throw error;
      }
      return true;
    } finally {
      if (seq === this._configRequestSeq) {
        this._isResolvingConfig.set(false, void 0);
      }
    }
  }
  getConfigCompletions(connection, property, query) {
    return connection.sessionConfigCompletions({
      provider: this.agentProvider,
      workingDirectory: this.workspaceUri,
      config: this._config?.values,
      property,
      query
    });
  }
  // -- Backend session lifecycle -------------------------------------------
  /**
   * Eagerly create the session on the agent host so the chat handler can
   * skip its legacy `createSession`-on-first-message round-trip.
   *
   * Wire ordering matters: we must `createSession` *before* opening the
   * subscription. Subscribing first would race the wire send — the server
   * receives the `subscribe` before the `createSession` and rejects it as
   * `AHP_SESSION_NOT_FOUND`, leaving the client subscription in an
   * unrecoverable error state. The session handler would then fall back
   * to its legacy create-and-subscribe path on the user's first send,
   * issuing a duplicate `createSession`.
   *
   * If the user switches workspaces or graduates this session before the
   * `createSession` round-trip completes, this object will have been
   * disposed (and `_backendUri` cleared) — the bail-out check below skips
   * opening a stale subscription.
   *
   * Failures are non-fatal: the legacy first-message path in
   * `AgentHostSessionHandler._invokeAgent` re-issues `createSession` if
   * no session state exists at send time.
   */
  eagerCreate(connection) {
    const backendUri = this._backendSessionUri;
    if (this._backendUri?.toString() === backendUri.toString() || this._subscription) {
      return;
    }
    this._backendUri = backendUri;
    this._connection = connection;
    void (async () => {
      try {
        await connection.createSession({
          provider: this.agentProvider,
          session: backendUri,
          workingDirectories: this.workspaceUri ? [this.workspaceUri] : void 0,
          config: this._config?.values,
          // MCP-style opt-in: offer to receive `progress` for any
          // long-running bring-up (chiefly the lazy first-use SDK
          // download, which fires later at first-message
          // materialization). The host echoes this token on each
          // `progress` frame so `_handleProgress` can correlate it.
          progressToken: generateUuid(),
          ...this._selectedAgent ? { agent: { uri: this._selectedAgent.uri } } : {},
          ...this._initialActiveClient ? { activeClient: this._initialActiveClient } : {}
        });
      } catch (err) {
        this._logService.warn(`[${this._providerId}] Eager createSession failed for ${backendUri.toString()}: ${err}`);
        if (this._backendUri?.toString() === backendUri.toString()) {
          this._backendUri = void 0;
          this._connection = void 0;
        }
        return;
      }
      if (this._backendUri?.toString() !== backendUri.toString()) {
        return;
      }
      const ref = connection.getSubscription(StateComponents.Session, backendUri, "BaseAgentHostSessionsProvider.session");
      this._subscription = ref;
      const onSessionState = this._onSessionState;
      if (onSessionState) {
        const initial = ref.object.value;
        if (initial && !(initial instanceof Error)) {
          this.updateChangesets(initial.changesets);
          onSessionState(this.sessionId, initial);
        }
        this._stateListener.value = ref.object.onDidChange((state) => {
          this.updateChangesets(state.changesets);
          onSessionState(this.sessionId, state);
        });
      }
    })();
  }
  updateChangesets(changesetsMetadata) {
    if (!changesetsMetadata) {
      return;
    }
    const changesets = createChangesets(this._backendSessionUri, this._options, this._isActiveSessionObs, changesetsMetadata);
    this._changesets.set(changesets, void 0);
  }
  /**
   * Release the backend subscription without firing `disposeSession`.
   * Used on the success path in `sendRequest` when the session has
   * graduated into a real running session.
   */
  graduate() {
    this._lifetimeCts.cancel();
    this._stateListener.clear();
    this._subscription?.dispose();
    this._subscription = void 0;
    this._backendUri = void 0;
    this._connection = void 0;
    this._configRequestSeq++;
  }
  dispose() {
    this._lifetimeCts.cancel();
    this._configRequestSeq++;
    const hadListener = !!this._stateListener.value;
    this._stateListener.clear();
    if (hadListener) {
      this._onSessionState?.(this.sessionId, void 0);
    }
    this._subscription?.dispose();
    this._subscription = void 0;
    const oldUri = this._backendUri;
    const connection = this._connection;
    this._backendUri = void 0;
    this._connection = void 0;
    if (oldUri && connection) {
      connection.disposeSession(oldUri).catch((err) => {
        this._logService.warn(`[${this._providerId}] Failed to dispose eager backend session ${oldUri.toString()}: ${err}`);
      });
    }
    super.dispose();
  }
};
NewSession = __decorateClass([
  __decorateParam(2, ISessionsService)
], NewSession);
let BaseAgentHostSessionsProvider = class extends Disposable {
  constructor(_chatSessionsService, _chatService, _chatWidgetService, _languageModelsService, _baseConfigurationService, _logService, _gitHubService, _instantiationService, _sessionsService, _activeClientService, _storageService, _dialogService, _workspaceTrustManagementService) {
    super();
    this._chatSessionsService = _chatSessionsService;
    this._chatService = _chatService;
    this._chatWidgetService = _chatWidgetService;
    this._languageModelsService = _languageModelsService;
    this._baseConfigurationService = _baseConfigurationService;
    this._logService = _logService;
    this._gitHubService = _gitHubService;
    this._instantiationService = _instantiationService;
    this._sessionsService = _sessionsService;
    this._activeClientService = _activeClientService;
    this._storageService = _storageService;
    this._dialogService = _dialogService;
    this._workspaceTrustManagementService = _workspaceTrustManagementService;
    this._sessionTypes = [];
    this._agentCapabilities = observableValue(this, void 0);
    this._onDidChangeSessionTypes = this._register(new Emitter());
    this.onDidChangeSessionTypes = this._onDidChangeSessionTypes.event;
    this._onDidChangeSessions = this._register(new Emitter());
    this.onDidChangeSessions = this._onDidChangeSessions.event;
    this._onDidReplaceSession = this._register(new Emitter());
    this.onDidReplaceSession = this._onDidReplaceSession.event;
    this._onDidChangeSessionConfig = this._register(new Emitter());
    this.onDidChangeSessionConfig = this._onDidChangeSessionConfig.event;
    this._onDidChangeRootConfig = this._register(new Emitter());
    this.onDidChangeRootConfig = this._onDidChangeRootConfig.event;
    this._onDidChangeCustomAgents = this._register(new Emitter());
    this.onDidChangeCustomAgents = this._onDidChangeCustomAgents.event;
    this._onDidChangeCustomizations = this._register(new Emitter());
    this.onDidChangeCustomizations = this._onDidChangeCustomizations.event;
    /**
     * Last-known session state per session ID, seeded from
     * {@link _applySessionStateUpdate}. Holds the snapshot used to extract
     * `customizations` and `activeClient.customizations` for the picker.
     */
    this._lastSessionStates = /* @__PURE__ */ new Map();
    /** Cache of adapted sessions, keyed by raw session ID. */
    this._sessionCache = /* @__PURE__ */ new Map();
    /**
     * Snapshot of the source metadata for each adapter in {@link _sessionCache},
     * keyed by raw session ID. Captured in {@link createAdapter}/{@link updateAdapter}
     * and re-used by {@link _persistCache} to serialize sessions without having to
     * reconstruct every `IAgentSessionMetadata` field from observables.
     */
    this._metaByRawId = /* @__PURE__ */ new Map();
    /**
     * Set when {@link _sessionCache} has changed since the last persist. The
     * actual write happens on the next `onWillSaveState` signal from
     * {@link IStorageService} so that bursts of notifications do not repeatedly
     * re-serialize the whole cache.
     */
    this._cacheDirty = false;
    /**
     * Raw ids of backend sessions that an in-flight {@link _waitForNewSession}
     * has already matched to its send, so a *concurrent* new-session send of
     * the same scheme does not resolve to the same committed session. Each
     * matched id is released by the owning send in its `finally`.
     */
    this._committingSessionRawIds = /* @__PURE__ */ new Set();
    /**
     * Own raw ids ({@link chatResource} path) of currently in-flight
     * new-session sends. A send's committed backend session keeps the eager
     * id it was created with, so {@link _waitForNewSession} matches a send to
     * its OWN id first. The novelty fallback (for flows where the backend
     * assigns a different id) must then never latch onto *another* in-flight
     * send's own session — otherwise two concurrent same-scheme sends racing
     * in a shared download/materialize window would swap sessions (each
     * graduating onto the other's committed session). Populated at send start,
     * cleared in the send's `finally`.
     */
    this._inFlightNewSessionOwnIds = /* @__PURE__ */ new Set();
    /**
     * In-flight new sessions — sessions being composed in the new-chat view
     * before their first message is sent, keyed by `sessionId`. See
     * {@link NewSession} for the encapsulated state and lifecycle.
     *
     * Held as a {@link DisposableMap} so multiple new sessions can be tracked
     * concurrently (e.g. while one is sending in the background and the composer
     * re-seeds a fresh one). Entries are disposed individually when sent
     * ({@link deleteAndDispose}/{@link deleteAndLeak}) or abandoned (via
     * {@link deleteNewSession}), and all remaining entries are cleaned up when
     * the provider itself is disposed.
     */
    this._newSessions = this._register(new DisposableMap());
    /** Full resolved config (schema + values) for running sessions, keyed by session ID. */
    this._runningSessionConfigs = /* @__PURE__ */ new Map();
    this._runningSessionConfigResolveSeq = /* @__PURE__ */ new Map();
    /**
     * Last authoritatively-resolved schemas for {@link SEEDED_CONFIG_SCHEMA_KEYS},
     * seeded into new drafts so their chips survive a workspace/agent switch. Lives
     * on the provider (not the picker) so it outlives toolbar item reconstruction.
     */
    this._cachedConfigSchemas = /* @__PURE__ */ new Map();
    /**
     * Lazy session-state subscriptions used to seed {@link _runningSessionConfigs}
     * for sessions that already exist on the agent host (e.g. created in a prior
     * window). The underlying wire subscription is reference-counted by
     * {@link IAgentConnection.getSubscription}, so when the session handler is
     * also subscribed (i.e. chat content is loaded) no extra wire subscribe is
     * issued. Each entry is released after
     * {@link SESSION_STATE_SUBSCRIPTION_IDLE_MS} of no calls into the keep-alive
     * helper, so the server-side refcount can drop and any idle restored session
     * state can be evicted on the agent host. Keyed by session ID.
     */
    this._sessionStateSubscriptions = this._register(new DisposableMap());
    /**
     * Idle-release timers paired with {@link _sessionStateSubscriptions}. Each
     * call to {@link _keepSessionStateAlive} resets the timer for `sessionId`;
     * when the timer fires, the subscription is disposed and the wire
     * `unsubscribe` flows through {@link IAgentConnection.getSubscription}'s
     * refcount to the agent host.
     */
    this._sessionStateIdleTimers = this._register(new DisposableMap());
    /**
     * Session ids whose views are currently visible in the Agents window. Their
     * state subscription is pinned open (no idle release) so host-driven catalog
     * changes the user did not initiate — most importantly spawned subagent chats
     * ({@link ChatOriginKind.Tool}) — keep flowing into `cached.chats` while the
     * session is on screen. Without this, the idle timer (only refreshed by
     * client-initiated actions/queries) can release the state listener mid-view,
     * so a subagent's `chatAdded` is dropped and its inline "Open Subagent" pill
     * cannot resolve until the session is re-subscribed (e.g. switched away and
     * back). Driven by {@link _syncVisibleSessionStatePins}.
     */
    this._pinnedSessionStates = /* @__PURE__ */ new Set();
    this._cacheInitialized = false;
    /**
     * Backoff timer that retries {@link _refreshSessions} after a failed
     * attempt. A failed initial list (e.g. the agent threw
     * `AHP_AUTH_REQUIRED` because its token wasn't yet effective server-side,
     * or a transient offline/network error) must not leave the session list
     * permanently empty. The timer is armed only on failure and cancelled on
     * the next successful refresh.
     */
    this._sessionRefreshRetry = this._register(new MutableDisposable());
    /** Current backoff delay (ms) for the session-refresh retry. */
    this._sessionRefreshRetryDelay = BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MIN_MS;
    /** True while a {@link _refreshSessions} call is awaiting `listSessions()`. */
    this._sessionRefreshInFlight = false;
    this._downloadProgress = this._register(this._instantiationService.createInstance(AgentHostDownloadProgress));
    this._register(toDisposable(() => {
      for (const cached of this._sessionCache.values()) {
        cached.dispose();
      }
      this._sessionCache.clear();
    }));
    this._register(autorun((reader) => this._syncVisibleSessionStatePins(reader)));
    this._register(autorun((reader) => {
      this._sessionsService.activeSession.read(reader);
      this._syncActiveClient();
    }));
    this._register(this._onDidChangeSessions.event((e) => {
      if (!this._shouldTrackSessionCacheChanges()) {
        return;
      }
      if (e.added.length > 0 || e.removed.length > 0 || e.changed.length > 0) {
        this._cacheDirty = true;
      }
      for (const removed of e.removed) {
        const rawId = this._rawIdFromChatId(removed.sessionId);
        if (rawId) {
          this._metaByRawId.delete(rawId);
        }
      }
    }));
    this._register(this._storageService.onWillSaveState(() => {
      if (this._sessionCacheStorageKey && this._cacheDirty) {
        this._persistCache();
        this._cacheDirty = false;
      }
    }));
  }
  get order() {
    return 0;
  }
  get sessionTypes() {
    return this._sessionTypes;
  }
  /** The in-flight new session with the given id, if any. */
  _getNewSession(sessionId) {
    return this._newSessions.get(sessionId);
  }
  /**
   * Dispose every in-flight new session, firing each one's `disposeSession`
   * sentinel so the eagerly-created backend records are freed. Used when the
   * connection drops and the composed-but-unsent drafts can no longer commit.
   */
  _disposeAllNewSessions() {
    this._newSessions.clearAndDisposeAll();
  }
  deleteNewSession(sessionId) {
    if (this._newSessions.has(sessionId)) {
      this._newSessions.deleteAndDispose(sessionId);
    }
  }
  /**
   * Hook to normalize a session's metadata before it is cached, keyed, or
   * persisted. The default is identity. Subclasses override this when the host
   * addresses sessions under a scheme that differs from the agent provider
   * (e.g. a cloud sandbox host that lists sessions as `ahp-session:/<id>` while
   * its agent provider is `copilot`), so that routing, persistence, and content
   * resolution all agree on a single scheme. Must preserve the raw session id
   * (URI path) so cache keys remain stable.
   */
  _adoptSessionMeta(meta) {
    return meta;
  }
  /**
   * The backend (wire) session URI scheme for a given agent provider. Default is
   * identity (scheme == provider), which holds for every host except the Copilot
   * host used by cloud sandbox, whose sessions are addressed under
   * `ahp-session:/<id>` while the agent provider is `copilot`. Subclasses
   * override this so all backend `AgentSession.uri(...)` reconstructions on the
   * adapter and provider use the host's real scheme. Must be a stable per-provider
   * mapping.
   */
  _backendSessionScheme(agentProvider) {
    return agentProvider;
  }
  /** Build an adapter for the given metadata. */
  createAdapter(meta) {
    const provider = AgentSession.provider(meta.session);
    if (!provider) {
      throw new Error(`Agent session URI has no provider scheme: ${meta.session.toString()}`);
    }
    const resourceScheme = this.resourceSchemeForProvider(provider);
    const options = {
      icon: this.iconForAgentProvider(provider) ?? this.icon,
      loading: this.authenticationPending,
      mapDiffUri: this._diffUriMapper(),
      gitHubService: this._gitHubService,
      instantiationService: this._instantiationService,
      getConnection: () => this.connection,
      agentCapabilities: this._agentCapabilities,
      backendSessionScheme: this._backendSessionScheme(provider),
      ...this._adapterOptions()
    };
    this._metaByRawId.set(AgentSession.id(meta.session), meta);
    return this._instantiationService.createInstance(AgentHostSessionAdapter, meta, this.id, resourceScheme, provider, options);
  }
  updateAdapter(adapter, meta) {
    this._metaByRawId.set(AgentSession.id(meta.session), meta);
    this._cacheDirty = true;
    return adapter.update(meta);
  }
  /**
   * Whether `provider` should be advertised as a session type by this host.
   * Defaults to `true` (advertise everything the host reports). The local
   * provider overrides this to suppress the agent host's Claude when the
   * window prefers the extension-host Claude, mirroring the gate
   * {@link AgentHostContribution} applies to the chat session contribution so
   * the welcome picker doesn't list Claude twice.
   */
  _shouldAdvertiseAgent(_provider) {
    return true;
  }
  _syncRootState(rootState) {
    if (rootState && !(rootState instanceof Error)) {
      this._syncSessionTypesFromRootState(rootState);
      this._syncRootConfigFromRootState(rootState);
      return;
    }
    this._syncAgentCapabilities(void 0);
    if (this._sessionTypes.length > 0) {
      this._sessionTypes = [];
      this._onDidChangeSessionTypes.fire();
    }
    if (this._rootConfig) {
      this._rootConfig = void 0;
      this._onDidChangeRootConfig.fire();
    }
  }
  _syncAgentCapabilities(agents) {
    if (this._lastAgents === agents) {
      return;
    }
    this._lastAgents = agents;
    this._agentCapabilities.set(agents ? new Map(agents.map((agent) => [agent.provider, agent.capabilities])) : void 0, void 0);
    this._onDidChangeCustomAgents.fire();
    this._onDidChangeCustomizations.fire();
  }
  /**
   * Reconcile {@link _sessionTypes} against the agents advertised by the
   * host's root state, firing {@link onDidChangeSessionTypes} only if the
   * id/label set actually changed.
   */
  _syncSessionTypesFromRootState(rootState) {
    this._syncAgentCapabilities(rootState.agents);
    const next = rootState.agents.filter((agent) => this._shouldAdvertiseAgent(agent.provider)).map((agent) => ({
      id: agent.provider,
      supportsWorktreeConfiguration: agent.provider === CopilotCLISessionType.id,
      // The chat session contribution and language models for an agent-host
      // agent are registered under its resource scheme (`agent-host-<provider>`),
      // not the bare provider id, so carry it for availability lookups.
      chatSessionType: this.resourceSchemeForProvider(agent.provider),
      label: this._formatSessionTypeLabel(agent.displayName?.trim() || agent.provider),
      icon: this.iconForAgentProvider(agent.provider) ?? this.icon
    }));
    const prev = this._sessionTypes;
    if (prev.length === next.length && prev.every((t, i) => t.id === next[i].id && t.label === next[i].label)) {
      return;
    }
    this._sessionTypes = next;
    this._onDidChangeSessionTypes.fire();
  }
  /**
   * Returns the {@link ThemeIcon} associated with a known agent provider, or
   * `undefined` when the provider is not recognised.
   */
  iconForAgentProvider(provider) {
    if (provider === CopilotCLISessionType.id) {
      return CopilotCLISessionType.icon;
    }
    if (provider.includes("claude")) {
      return Codicon.claude;
    }
    if (provider === "openai" || provider.includes("codex")) {
      return Codicon.openai;
    }
    return void 0;
  }
  /**
   * Reconcile {@link _rootConfig} against {@link RootState.config}, firing
   * {@link onDidChangeRootConfig} only when schema or values actually change.
   */
  _syncRootConfigFromRootState(rootState) {
    const next = rootState.config;
    const prev = this._rootConfig;
    if (prev === next) {
      return;
    }
    if (!next) {
      this._rootConfig = void 0;
      this._onDidChangeRootConfig.fire();
      return;
    }
    if (prev?.schema === next.schema && equals(prev.values, next.values)) {
      return;
    }
    this._rootConfig = next;
    this._onDidChangeRootConfig.fire();
  }
  /** Optional event fired when the underlying connection is lost; used to short-circuit `_waitForNewSession`. */
  get onConnectionLost() {
    return Event.None;
  }
  /** Maps a working-directory URI from the session summary to a local URI. Default identity; remote overrides to `toAgentHostUri`. */
  mapWorkingDirectoryUri(uri) {
    return uri;
  }
  /** Maps a project URI from the session summary to a local URI. Default identity; remote overrides for `file:` paths. */
  mapProjectUri(uri) {
    return uri;
  }
  // -- Session listing ------------------------------------------------------
  getSessionTypes(_repositoryUri) {
    return [...this.sessionTypes];
  }
  _syncActiveClient() {
    const activeSession = this._sessionsService.activeSession.get();
    if (!activeSession || activeSession.providerId !== this.id) {
      return;
    }
    const rawId = this._rawIdFromChatId(activeSession.sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    const connection = this.connection;
    if (!rawId || !cached || !connection) {
      return;
    }
    const activeClient = this._activeClientService.getActiveClient(
      this.resourceSchemeForProvider(cached.agentProvider),
      connection.clientId
    );
    const existing = this._lastSessionStates.get(cached.sessionId)?.activeClients.find((client) => client.clientId === activeClient.clientId);
    if (equals(existing, activeClient)) {
      return;
    }
    connection.dispatch(AgentSession.uri(cached.agentProvider, rawId).toString(), {
      type: ActionType.SessionActiveClientSet,
      activeClient
    });
  }
  getSessions() {
    this._ensureSessionCache();
    const sessions = [];
    for (const cached of this._sessionCache.values()) {
      if (this._shouldAdvertiseAgent(cached.agentProvider)) {
        sessions.push(cached);
      }
    }
    if (this._pendingSession && this._shouldAdvertiseAgent(this._pendingSession.sessionType)) {
      sessions.push(this._pendingSession);
    }
    return sessions;
  }
  getSessionByResource(resource) {
    for (const newSession of this._newSessions.values()) {
      if (newSession.session.resource.toString() === resource.toString()) {
        return newSession.session;
      }
    }
    if (this._pendingSession?.resource.toString() === resource.toString()) {
      return this._pendingSession;
    }
    this._ensureSessionCache();
    for (const cached of this._sessionCache.values()) {
      if (cached.resource.toString() === resource.toString()) {
        this._keepSessionStateAlive(cached.sessionId);
        return cached;
      }
    }
    return void 0;
  }
  // -- Session lifecycle ----------------------------------------------------
  createNewSession(workspaceUri, sessionTypeId) {
    if (!workspaceUri) {
      throw new Error("Workspace has no repository URI");
    }
    const sessionType = this.sessionTypes.find((t) => t.id === sessionTypeId);
    if (!sessionType) {
      throw new Error(this._noAgentsErrorMessage());
    }
    this._validateBeforeCreate(sessionType);
    const workspace = this.resolveWorkspace(workspaceUri);
    if (!workspace) {
      throw new Error(`Cannot resolve workspace for URI: ${workspaceUri.toString()}`);
    }
    return this._createDraftSession(sessionType, workspace, false);
  }
  createQuickChat(sessionTypeId) {
    const sessionType = this.sessionTypes.find((t) => t.id === sessionTypeId);
    if (!sessionType) {
      throw new Error(this._noAgentsErrorMessage());
    }
    this._validateBeforeCreate(sessionType);
    return this._createDraftSession(sessionType, void 0, true);
  }
  /**
   * Builds, tracks, and eagerly starts a {@link NewSession} draft for the
   * given session type. Shared by {@link createNewSession} (workspace-bound)
   * and {@link createQuickChat} (workspace-less, `quickChat === true`).
   */
  _createDraftSession(sessionType, workspace, quickChat) {
    const connection = this.connection;
    const resourceScheme = this.resourceSchemeForProvider(sessionType.id);
    const newSession = this._instantiationService.createInstance(NewSession, {
      workspace,
      quickChat,
      sessionType,
      providerId: this.id,
      icon: sessionType.icon,
      resourceScheme,
      backendSessionScheme: this._backendSessionScheme(sessionType.id),
      authenticationPending: this.authenticationPending,
      logService: this._logService,
      initialConfigValues: this._initialNewSessionConfig(workspace),
      initialConfigSchema: this._seededConfigSchema(),
      instantiationService: this._instantiationService,
      onSessionState: (id, state) => state === void 0 ? this._handleNewSessionStateGone(id) : this._handleNewSessionStateUpdate(id, state),
      activeClient: connection ? this._activeClientService.getActiveClient(resourceScheme, connection.clientId) : void 0
    }, {
      icon: this.iconForAgentProvider(sessionType.id) ?? this.icon,
      loading: this.authenticationPending,
      mapDiffUri: this._diffUriMapper(),
      gitHubService: this._gitHubService,
      instantiationService: this._instantiationService,
      getConnection: () => this.connection,
      agentCapabilities: this._agentCapabilities,
      ...this._adapterOptions()
    });
    this._newSessions.set(newSession.sessionId, newSession);
    this._onDidChangeSessionConfig.fire(newSession.sessionId);
    if (connection) {
      if (!this.authenticationPending.get()) {
        this._startNewSessionBackend(newSession, connection);
      }
    } else {
      newSession.setLoading(false);
    }
    return newSession.session;
  }
  _resumeNewSessionAfterAuthenticationSettles() {
    const connection = this.connection;
    if (!connection) {
      return;
    }
    for (const newSession of this._newSessions.values()) {
      this._startNewSessionBackend(newSession, connection);
    }
  }
  _startNewSessionBackend(newSession, connection) {
    void this._refreshNewSessionConfig(newSession);
    if (newSession.requiresWorkspaceTrust && newSession.workspaceUri) {
      const workspaceUri = newSession.workspaceUri;
      void (async () => {
        const { trusted } = await this._workspaceTrustManagementService.getUriTrustInfo(workspaceUri);
        if (this._newSessions.get(newSession.sessionId) !== newSession) {
          return;
        }
        if (!trusted) {
          this._logService.trace(`[${this.id}] Skipping eager createSession for untrusted folder ${workspaceUri.toString()}`);
          newSession.setLoading(false);
          return;
        }
        newSession.eagerCreate(connection);
      })();
      return;
    }
    newSession.eagerCreate(connection);
  }
  /**
   * Re-resolve the session config against the agent host and pulse
   * {@link _onDidChangeSessionConfig}. The {@link NewSession} owns its own
   * stale-request guard so back-to-back calls are safe.
   * @param expected Normalized values that must be present after resolution; mismatches and incomplete application reject.
   */
  async _refreshNewSessionConfig(session, expected) {
    const connection = this.connection;
    if (!connection) {
      session.endResolveConfigSync();
      session.setLoading(false);
      this._onDidChangeSessionConfig.fire(session.sessionId);
      if (expected) {
        throw new Error("Cannot set session repository config without an agent host connection.");
      }
      return;
    }
    session.setLoading(true);
    let applied;
    try {
      applied = await session.resolveConfig(connection, !!expected);
    } catch (error) {
      session.setLoading(false);
      this._onDidChangeSessionConfig.fire(session.sessionId);
      throw error;
    }
    if (!applied || this._newSessions.get(session.sessionId) !== session) {
      if (expected) {
        throw new Error("Session repository config was superseded before it could be applied.");
      }
      return;
    }
    const config = session.getConfig();
    this._cacheSeededConfigSchemas(config);
    session.setLoading(config !== void 0 && !isSessionConfigComplete(config));
    this._onDidChangeSessionConfig.fire(session.sessionId);
    for (const [property, value] of Object.entries(expected ?? {})) {
      if (!equals(config?.values[property], value)) {
        throw new Error(`Agent host did not apply session config '${property}'.`);
      }
    }
  }
  /**
   * Snapshot the well-known {@link SEEDED_CONFIG_SCHEMA_KEYS} schemas from an
   * authoritative resolve so the next new draft can render those chips
   * immediately (disabled) instead of blanking. A `undefined` config (failed
   * resolve) leaves the previous cache intact.
   */
  _cacheSeededConfigSchemas(config) {
    if (!config) {
      return;
    }
    for (const key of SEEDED_CONFIG_SCHEMA_KEYS) {
      const schema = config.schema.properties[key];
      if (schema) {
        this._cachedConfigSchemas.set(key, schema);
      } else {
        this._cachedConfigSchemas.delete(key);
      }
    }
  }
  /** Seed schema for a fresh draft, or `undefined` when nothing is cached yet. */
  _seededConfigSchema() {
    if (this._cachedConfigSchemas.size === 0) {
      return void 0;
    }
    const seed = /* @__PURE__ */ Object.create(null);
    for (const [key, schema] of this._cachedConfigSchemas) {
      seed[key] = schema;
    }
    return seed;
  }
  /** Subclass hook for additional pre-create checks (e.g. remote requires connection). */
  _validateBeforeCreate(_sessionType) {
  }
  /** Localized "no agents" error message. Subclasses can override. */
  _noAgentsErrorMessage() {
    return localize("noAgents", "Agent host has not advertised any agents yet.");
  }
  /**
   * Initial session-config values applied to a brand-new agent-host session
   * before its schema is resolved. Values are seeded from portable picks in
   * the profile-scoped remembered session-config map and then normalized
   * against policy/feature constraints.
   *
   * The agent-host defaults are controlled by the single
   * `chat.defaultConfiguration` object setting (with `mode` and
   * `approvals` properties). Per axis the precedence is: enterprise
   * **policy** value > the user's **remembered** last pick > the ordinary
   * configured **setting** value (treated as a plain default) > schema
   * default. So a normal setting behaves as a default that the remembered
   * pick overrides, while an enterprise policy still wins outright. The
   * local-only `chat.permissions.default` setting is intentionally NOT
   * consulted here.
   *
   * If enterprise policy disables global auto-approval
   * (`chat.tools.global.autoApprove` policy value `false`), the approval seed
   * is clamped to `default` so the agent host never starts in an elevated
   * permission level the user is not allowed to pick.
   *
   * The user's `git.branchPrefix` setting (resource-scoped to the workspace's
   * first folder) is seeded into the `worktreeBranchPrefix` slot so the agent
   * host can prepend it to the branch it creates for an isolated worktree.
   */
  _initialNewSessionConfig(workspace) {
    const config = /* @__PURE__ */ Object.create(null);
    const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
    const rememberedValues = this._storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {});
    for (const [property, value] of Object.entries(rememberedValues)) {
      if (typeof value === "string" && isRememberedSessionConfigKey(property)) {
        config[property] = value;
      }
    }
    const remembered = migrateLegacyAutopilotConfig(config);
    const inspected = this._baseConfigurationService.inspect(ChatConfiguration.DefaultConfiguration);
    const policyDefaults = inspected.policyValue;
    const effectiveDefaults = inspected.value;
    const resolvedAutoApprove = normalizeAutoApproveValue(policyDefaults?.approvals, policyRestricted) ?? normalizeAutoApproveValue(remembered[SessionConfigKey.AutoApprove], policyRestricted) ?? normalizeAutoApproveValue(effectiveDefaults?.approvals, policyRestricted);
    if (resolvedAutoApprove) {
      remembered[SessionConfigKey.AutoApprove] = resolvedAutoApprove;
    } else {
      delete remembered[SessionConfigKey.AutoApprove];
    }
    const resolvedMode = [policyDefaults?.mode, remembered[SessionConfigKey.Mode], effectiveDefaults?.mode].find((value) => typeof value === "string" && KNOWN_MODE_VALUES.has(value));
    if (resolvedMode) {
      remembered[SessionConfigKey.Mode] = resolvedMode;
    } else {
      delete remembered[SessionConfigKey.Mode];
    }
    const resource = workspace?.folders[0]?.root;
    const branchPrefix = this._baseConfigurationService.getValue("git.branchPrefix", { resource });
    if (typeof branchPrefix === "string" && branchPrefix.length > 0) {
      remembered[SessionConfigKey.WorktreeBranchPrefix] = branchPrefix;
    }
    const worktreeIncludeFiles = this._baseConfigurationService.getValue("git.worktreeIncludeFiles", { resource });
    if (Array.isArray(worktreeIncludeFiles) && worktreeIncludeFiles.length > 0) {
      remembered[SessionConfigKey.WorktreeIncludeFiles] = worktreeIncludeFiles;
    }
    return Object.keys(remembered).length > 0 ? remembered : void 0;
  }
  // -- Dynamic session config ----------------------------------------------
  getSessionConfig(sessionId) {
    const newSession = this._getNewSession(sessionId);
    if (newSession) {
      return newSession.getConfig();
    }
    this._keepSessionStateAlive(sessionId);
    return this._runningSessionConfigs.get(sessionId);
  }
  /**
   * Observable: `true` while a `resolveSessionConfig` round-trip is in
   * flight. Distinct from `session.loading` (which also covers the
   * required-values-missing state) — pickers gate on this so they stay
   * interactive when the user has to fill in required values.
   */
  isSessionConfigResolving(sessionId) {
    const newSession = this._getNewSession(sessionId);
    return newSession ? newSession.isResolvingConfig : constObservable(false);
  }
  async setSessionConfigValue(sessionId, property, value) {
    const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
    const normalizedValue = normalizeSessionConfigValue(property, value, policyRestricted);
    if (typeof normalizedValue === "string" && isRememberedSessionConfigKey(property)) {
      const rememberedValues = this._storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {});
      const nextRememberedValues = /* @__PURE__ */ Object.create(null);
      for (const [key, rememberedValue] of Object.entries(rememberedValues)) {
        if (typeof rememberedValue === "string" && isRememberedSessionConfigKey(key)) {
          nextRememberedValues[key] = rememberedValue;
        }
      }
      nextRememberedValues[property] = normalizedValue;
      this._storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify(nextRememberedValues), StorageScope.PROFILE, StorageTarget.MACHINE);
    }
    const newSession = this._getNewSession(sessionId);
    if (newSession) {
      if (newSession.isResolvingConfig.get()) {
        return;
      }
      newSession.beginResolveConfigSync();
      newSession.setLoading(true);
      newSession.setConfigValue(property, normalizedValue);
      this._onDidChangeSessionConfig.fire(sessionId);
      await this._refreshNewSessionConfig(newSession);
      return;
    }
    const runningConfig = this._runningSessionConfigs.get(sessionId);
    const connection = this.connection;
    if (!runningConfig || !connection) {
      return;
    }
    const schema = runningConfig.schema.properties[property];
    if (!schema?.sessionMutable) {
      return;
    }
    const nextValues = { ...runningConfig.values, [property]: normalizedValue };
    this._runningSessionConfigs.set(sessionId, {
      ...runningConfig,
      values: nextValues
    });
    this._onDidChangeSessionConfig.fire(sessionId);
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (cached && rawId) {
      const sessionUri = cached.backendUri;
      const action = { type: ActionType.SessionConfigChanged, config: { [property]: normalizedValue } };
      connection.dispatch(sessionUri.toString(), action);
      void this._resolveRunningSessionConfig(sessionId, cached, nextValues);
    }
  }
  async replaceSessionConfig(sessionId, values) {
    const runningConfig = this._runningSessionConfigs.get(sessionId);
    const connection = this.connection;
    if (!runningConfig || !connection) {
      return;
    }
    const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
    const nextValues = {};
    for (const [key, schema] of Object.entries(runningConfig.schema.properties)) {
      const editable = schema.sessionMutable === true && schema.readOnly !== true;
      if (editable) {
        nextValues[key] = normalizeSessionConfigValue(key, values[key], policyRestricted);
      } else if (Object.hasOwn(runningConfig.values, key)) {
        nextValues[key] = runningConfig.values[key];
      }
    }
    if (equals(nextValues, runningConfig.values)) {
      return;
    }
    this._runningSessionConfigs.set(sessionId, {
      ...runningConfig,
      values: nextValues
    });
    this._onDidChangeSessionConfig.fire(sessionId);
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (cached && rawId) {
      const sessionUri = cached.backendUri;
      const action = {
        type: ActionType.SessionConfigChanged,
        config: nextValues,
        replace: true
      };
      connection.dispatch(sessionUri.toString(), action);
      void this._resolveRunningSessionConfig(sessionId, cached, nextValues);
    }
  }
  async _resolveRunningSessionConfig(sessionId, cached, values) {
    const connection = this.connection;
    if (!connection) {
      return;
    }
    const seq = (this._runningSessionConfigResolveSeq.get(sessionId) ?? 0) + 1;
    this._runningSessionConfigResolveSeq.set(sessionId, seq);
    try {
      const resolved = await connection.resolveSessionConfig({
        provider: cached.agentProvider,
        workingDirectory: cached.workspace.get()?.folders[0]?.root,
        config: values
      });
      if (this._runningSessionConfigResolveSeq.get(sessionId) !== seq) {
        return;
      }
      this._runningSessionConfigs.set(sessionId, resolved);
      this._onDidChangeSessionConfig.fire(sessionId);
    } catch (err) {
      this._logService.warn(`[${this.id}] Failed to re-resolve session config for ${sessionId}: ${err}`);
    }
  }
  async getSessionConfigCompletions(sessionId, property, query) {
    const newSession = this._getNewSession(sessionId);
    const connection = this.connection;
    if (!newSession || !connection) {
      return [];
    }
    const result = await newSession.getConfigCompletions(connection, property, query);
    return result.items;
  }
  getCreateSessionConfig(sessionId) {
    return this._getNewSession(sessionId)?.getConfigValues();
  }
  async setIsolationMode(sessionId, mode) {
    const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
    const value = normalizeSessionConfigValue(
      SessionConfigKey.Isolation,
      mode === "workspace" ? "folder" : mode,
      policyRestricted
    );
    await this._setTransientNewSessionConfigValue(sessionId, SessionConfigKey.Isolation, value);
  }
  async setWorktreeBranchTrack(sessionId, enabled) {
    await this._setTransientNewSessionConfigValue(sessionId, SessionConfigKey.WorktreeBranchTrack, enabled);
  }
  async setBranch(sessionId, branch) {
    const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
    const value = normalizeSessionConfigValue(SessionConfigKey.Branch, branch, policyRestricted);
    await this._setTransientNewSessionConfigValue(sessionId, SessionConfigKey.Branch, value);
  }
  async _setTransientNewSessionConfigValue(sessionId, property, value) {
    const newSession = this._getNewSession(sessionId);
    if (!newSession) {
      throw new Error("Cannot configure repository settings after session creation.");
    }
    await waitForState(this.authenticationPending, (pending) => !pending, void 0, newSession.cancellationToken);
    await waitForState(newSession.isResolvingConfig, (resolving) => !resolving, void 0, newSession.cancellationToken);
    if (this._getNewSession(sessionId) !== newSession) {
      throw new Error("Session was disposed before repository configuration could be applied.");
    }
    newSession.beginResolveConfigSync();
    newSession.setLoading(true);
    newSession.setConfigValue(property, value);
    this._onDidChangeSessionConfig.fire(sessionId);
    await this._refreshNewSessionConfig(newSession, { [property]: value });
  }
  clearSessionConfig(sessionId) {
    if (this._newSessions.has(sessionId)) {
      this._newSessions.deleteAndDispose(sessionId);
    }
  }
  // -- Root (agent host) Config --------------------------------------------
  getRootConfig() {
    return this._rootConfig;
  }
  getRootState() {
    const value = this.connection?.rootState.value;
    return value instanceof Error ? void 0 : value;
  }
  mapAgentHostResource(uri) {
    return this.mapWorkingDirectoryUri(uri);
  }
  async authenticate(params) {
    const connection = this.connection;
    if (!connection) {
      return { authenticated: false };
    }
    return connection.authenticate(params);
  }
  async setRootConfigValue(property, value) {
    const current = this._rootConfig;
    const connection = this.connection;
    if (!current || !connection) {
      return;
    }
    if (!current.schema.properties[property]) {
      return;
    }
    this._rootConfig = {
      ...current,
      values: { ...current.values, [property]: value }
    };
    this._onDidChangeRootConfig.fire();
    const action = {
      type: ActionType.RootConfigChanged,
      config: { [property]: value }
    };
    connection.dispatch(ROOT_STATE_URI, action);
  }
  async replaceRootConfig(values) {
    const current = this._rootConfig;
    const connection = this.connection;
    if (!current || !connection) {
      return;
    }
    const nextValues = {};
    for (const [key, value] of Object.entries(values)) {
      if (current.schema.properties[key]) {
        nextValues[key] = value;
      }
    }
    if (equals(nextValues, current.values)) {
      return;
    }
    this._rootConfig = { ...current, values: nextValues };
    this._onDidChangeRootConfig.fire();
    const action = {
      type: ActionType.RootConfigChanged,
      config: nextValues,
      replace: true
    };
    connection.dispatch(ROOT_STATE_URI, action);
  }
  // -- Model selection ------------------------------------------------------
  get onDidChangeModels() {
    return Event.signal(this._languageModelsService.onDidChangeLanguageModels);
  }
  getModelsSnapshot(sessionId, desiredModelId) {
    const resourceScheme = this._resolveSessionResourceScheme(sessionId);
    if (!resourceScheme) {
      return {
        models: [],
        desiredModelResolution: resolveModelIdentifier([], desiredModelId, false),
        modelTarget: void 0
      };
    }
    const allModels = getRegisteredLanguageModels(this._languageModelsService);
    const models = allModels.filter((model) => model.metadata.targetChatSessionType === resourceScheme);
    const desiredModel = desiredModelId ? this._languageModelsService.lookupLanguageModel(desiredModelId) : void 0;
    const resolvedDesiredModelId = desiredModel?.targetChatSessionType && this.resourceSchemeForProvider(desiredModel.targetChatSessionType) === resourceScheme ? `${resourceScheme}:${desiredModel.id}` : desiredModelId;
    return {
      models,
      desiredModelResolution: resolveModelIdentifierFromLanguageModels(models, resolvedDesiredModelId, this._languageModelsService, allModels),
      modelTarget: resourceScheme
    };
  }
  getModelPickerOptions(sessionId) {
    const resourceScheme = this._resolveSessionResourceScheme(sessionId);
    const showAutoModel = !resourceScheme || this._chatSessionsService.supportsAutoModelForSessionType(resourceScheme);
    return {
      useGroupedModelPicker: true,
      showFeatured: true,
      showUnavailableFeatured: true,
      showManageModelsAction: true,
      showAutoModel
    };
  }
  /**
   * Resolve a remembered model selection at send time: when it is conclusively
   * unavailable and the harness supports Auto, return the Auto model identifier
   * (rather than `undefined`, which would leave an already-running chat pinned
   * to its stale backend model) so the request is explicitly reset to Auto.
   */
  _resolveSendModelId(sessionId, selectedModelId) {
    if (!selectedModelId) {
      return selectedModelId;
    }
    const snapshot = this.getModelsSnapshot(sessionId, selectedModelId);
    if (snapshot.desiredModelResolution.kind !== "unavailable") {
      return selectedModelId;
    }
    const resourceScheme = this._resolveSessionResourceScheme(sessionId);
    const supportsAuto = !resourceScheme || this._chatSessionsService.supportsAutoModelForSessionType(resourceScheme);
    if (!supportsAuto) {
      return selectedModelId;
    }
    const autoModelId = resolveConfiguredModel("auto", snapshot.models)?.identifier;
    this._logService.warn(`[${this.id}] Selected model '${selectedModelId}' is unavailable for session '${sessionId}'; falling back to Auto instead of sending an unroutable model.`);
    return autoModelId;
  }
  _resolveSessionResourceScheme(sessionId) {
    const newSession = this._getNewSession(sessionId);
    if (newSession) {
      return newSession.session.resource.scheme;
    }
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    return cached?.resource.scheme;
  }
  setModel(sessionId, modelId) {
    const newSession = this._getNewSession(sessionId);
    if (newSession) {
      newSession.setSelectedModelId(modelId);
      return;
    }
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    const connection = this.connection;
    if (cached && rawId && connection) {
      const chatResource = this._activeChatResource(cached);
      cached.setChatModelId(chatResource, modelId);
      this._updateChatSessionState(chatResource, modelId, cached.getChatMode(chatResource)?.id).catch((err) => this._logService.error(`[${this.id}] Failed to update chat model state for ${chatResource.toString()}`, err));
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
    }
  }
  setAgent(sessionId, agent) {
    const newSession = this._getNewSession(sessionId);
    if (newSession) {
      newSession.setSelectedAgent(agent);
      return;
    }
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    const connection = this.connection;
    if (cached && rawId && connection) {
      const chatResource = this._activeChatResource(cached);
      cached.setChatAgent(chatResource, agent);
      this._updateChatSessionState(chatResource, cached.getChatModelId(chatResource), agent?.uri).catch((err) => this._logService.error(`[${this.id}] Failed to update chat model state for ${chatResource.toString()}`, err));
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
    }
  }
  getCustomAgents(sessionId) {
    const sessionState = this._lastSessionStates.get(sessionId);
    return getEffectiveAgents(sessionState?.customizations);
  }
  getCustomizations(sessionId) {
    const sessionState = this._lastSessionStates.get(sessionId);
    return sessionState?.customizations ?? [];
  }
  getWorkingDirectory(sessionId) {
    const sessionState = this._lastSessionStates.get(sessionId);
    return sessionState?.workingDirectories?.[0];
  }
  getBackendChatResource(chatResource) {
    const sessionResource = chatResource.with({ fragment: "" });
    const state = this._lastSessionStates.get(toSessionId(this.id, sessionResource));
    if (!state) {
      return void 0;
    }
    const chatId = chatResource.fragment || void 0;
    const backendResource = chatId ? state.chats.find((c) => parseChatUri(c.resource)?.chatId === chatId)?.resource : state.defaultChat ?? state.chats.find((c) => isDefaultChatUri(c.resource))?.resource;
    if (!backendResource) {
      return void 0;
    }
    try {
      return URI.parse(backendResource.toString());
    } catch {
      return void 0;
    }
  }
  getWorkingDirectories(sessionId) {
    const sessionState = this._lastSessionStates.get(sessionId);
    return sessionState?.workingDirectories ?? [];
  }
  getMcpServers(sessionId) {
    const sessionState = this._lastSessionStates.get(sessionId);
    if (!sessionState) {
      return [];
    }
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (!cached || !rawId) {
      return [];
    }
    const sessionUri = cached.backendUri;
    return (sessionState.customizations ?? []).flatMap((c) => c.type === CustomizationType.McpServer ? [c] : c.children ? c.children.filter((c2) => c2.type === CustomizationType.McpServer) : []).map((c) => ({
      id: `${sessionUri.authority}/${c.id}`,
      name: c.name,
      enabled: c.enabled,
      status: c.state.kind,
      state: c.state,
      setEnabled: (enabled) => {
        const connection = this.connection;
        if (!connection) {
          return;
        }
        connection.dispatch(sessionUri.toString(), {
          type: ActionType.SessionCustomizationToggled,
          id: c.id,
          enabled
        });
      },
      start: async () => {
        const connection = this.connection;
        if (!connection) {
          return;
        }
        connection.dispatch(sessionUri.toString(), {
          type: ActionType.SessionMcpServerStartRequested,
          id: c.id
        });
      },
      stop: async () => {
        const connection = this.connection;
        if (!connection) {
          return;
        }
        connection.dispatch(sessionUri.toString(), {
          type: ActionType.SessionMcpServerStopRequested,
          id: c.id
        });
      }
    }));
  }
  getFeedbackAnnotationsChannel(sessionId) {
    const connection = this.connection;
    if (!connection) {
      return void 0;
    }
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (!cached || !rawId) {
      return void 0;
    }
    const sessionUri = cached.backendUri;
    const annotationsUri = URI.parse(buildAnnotationsUri(sessionUri.toString()));
    return { connection, annotationsUri };
  }
  // -- Session actions ------------------------------------------------------
  async archiveSession(sessionId) {
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (cached && rawId) {
      cached.isArchived.set(true, void 0);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
      const connection = this.connection;
      if (connection) {
        const sessionUri = cached.backendUri;
        const action = { type: ActionType.SessionIsArchivedChanged, isArchived: true };
        connection.dispatch(sessionUri.toString(), action);
      }
    }
  }
  async unarchiveSession(sessionId) {
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (cached && rawId) {
      cached.isArchived.set(false, void 0);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
      const connection = this.connection;
      if (connection) {
        const sessionUri = cached.backendUri;
        const action = { type: ActionType.SessionIsArchivedChanged, isArchived: false };
        connection.dispatch(sessionUri.toString(), action);
      }
    }
  }
  async setSessionReadState(sessionId, isRead) {
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (cached && rawId && cached.isRead.get() !== isRead) {
      cached.isRead.set(isRead, void 0);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
      const connection = this.connection;
      if (connection) {
        const sessionUri = cached.backendUri;
        const action = { type: ActionType.SessionIsReadChanged, isRead };
        connection.dispatch(sessionUri.toString(), action);
      }
    }
  }
  async deleteSession(sessionId) {
    await this.deleteSessions([sessionId]);
  }
  async deleteSessions(sessionIds) {
    const connection = this.connection;
    if (!connection) {
      return;
    }
    const targets = [];
    for (const sessionId of sessionIds) {
      const rawId = this._rawIdFromChatId(sessionId);
      const cached = rawId ? this._sessionCache.get(rawId) : void 0;
      if (cached && rawId) {
        targets.push({ rawId, sessionId, cached });
      }
    }
    if (targets.length === 0) {
      return;
    }
    for (const { rawId, sessionId, cached } of targets) {
      await connection.disposeSession(cached.backendUri);
      this._sessionCache.delete(rawId);
      this._runningSessionConfigs.delete(sessionId);
      this._runningSessionConfigResolveSeq.delete(sessionId);
    }
    const removed = targets.map((target) => target.cached);
    this._onDidChangeSessions.fire({ added: [], removed, changed: [] });
    for (const cached of removed) {
      cached.dispose();
    }
  }
  async renameChat(sessionId, chatUri, title) {
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    const connection = this.connection;
    if (!cached || !rawId || !connection) {
      return;
    }
    const sessionUri = cached.backendUri;
    const chatId = chatUri.fragment;
    const action = { type: ActionType.SessionTitleChanged, title };
    if (chatId) {
      cached.setAdditionalChatTitle(chatId, title);
      connection.dispatch(buildChatUri(sessionUri, chatId), action);
    } else {
      cached.setDefaultChatTitle(title);
      connection.dispatch(buildDefaultChatUri(sessionUri), action);
    }
    this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
  }
  async renameSession(sessionId, title) {
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    const connection = this.connection;
    if (cached && rawId && connection) {
      cached.title.set(title, void 0);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
      const sessionUri = cached.backendUri;
      const action = { type: ActionType.SessionTitleChanged, title };
      connection.dispatch(sessionUri.toString(), action);
    }
  }
  async deleteChat(sessionId, chatUri, options) {
    const chatId = chatUri.fragment;
    if (!chatId) {
      return false;
    }
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    const connection = this.connection;
    if (!rawId || !cached || !connection) {
      return false;
    }
    const sessionUri = cached.backendUri;
    const ahpChatUri = URI.parse(buildChatUri(sessionUri, chatId));
    if (!options?.skipConfirmation) {
      const confirmed = await this._dialogService.confirm({
        message: localize("deleteChat.confirm", "Are you sure you want to delete this chat?"),
        detail: localize("deleteChat.detail", "This action cannot be undone."),
        primaryButton: localize("deleteChat.delete", "Delete")
      });
      if (!confirmed.confirmed) {
        return false;
      }
    }
    this._keepSessionStateAlive(cached.sessionId);
    await connection.disposeChat(ahpChatUri);
    return true;
  }
  async createNewChat(chatId) {
    const connection = this.connection;
    if (!connection) {
      throw new Error(this._notConnectedSendErrorMessage());
    }
    const newSession = this._getNewSession(chatId);
    if (newSession) {
      await this._chatSessionsService.getOrCreateChatSession(newSession.session.resource, CancellationToken.None);
      return newSession.session.mainChat.get();
    }
    return this._createAdditionalChat(chatId, connection);
  }
  async _createAdditionalChat(chatId, connection) {
    const rawId = this._rawIdFromChatId(chatId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (!rawId || !cached) {
      throw new Error(`Session '${chatId}' not found`);
    }
    if (!cached.capabilities.get().supportsMultipleChats) {
      throw new Error(`Session '${chatId}' does not support multiple chats`);
    }
    const sessionUri = cached.backendUri;
    const newChatId = generateUuid();
    const chatUri = URI.parse(buildChatUri(sessionUri, newChatId));
    const selectedModelId = cached.modelId.get() ?? (cached.modelSelection ? `${cached.resource.scheme}:${cached.modelSelection.id}` : void 0);
    const selectedAgentUri = cached.mode.get()?.id;
    cached.markChatAsNew(newChatId);
    this._keepSessionStateAlive(cached.sessionId);
    await connection.createChat(sessionUri, chatUri, {
      model: cached.modelSelection
    });
    const chat = await waitForState(
      cached.chats.map((chats) => chats.find((c) => c.resource.fragment === newChatId)),
      (c) => !!c
    );
    cached.setChatModelId(chat.resource, selectedModelId);
    cached.setChatAgent(chat.resource, selectedAgentUri ? { uri: selectedAgentUri, name: "" } : void 0);
    await this._chatSessionsService.getOrCreateChatSession(chat.resource, CancellationToken.None);
    await this._updateChatSessionState(chat.resource, selectedModelId, selectedAgentUri);
    return chat;
  }
  async forkChat(sessionId, sourceChat, turnId) {
    const connection = this.connection;
    if (!connection) {
      throw new Error(this._notConnectedSendErrorMessage());
    }
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (!rawId || !cached) {
      throw new Error(`Session '${sessionId}' not found`);
    }
    if (!cached.capabilities.get().supportsMultipleChats) {
      throw new Error(`Session '${sessionId}' does not support multiple chats`);
    }
    const sessionUri = cached.backendUri;
    const newChatId = generateUuid();
    const chatUri = URI.parse(buildChatUri(sessionUri, newChatId));
    const sourceBackendUri = this._resolveBackendSourceChatUri(cached.sessionId, sessionUri, sourceChat);
    this._keepSessionStateAlive(cached.sessionId);
    await connection.createChat(sessionUri, chatUri, {
      model: cached.modelSelection,
      fork: { source: sourceBackendUri, turnId }
    });
    const chat = await waitForState(
      cached.chats.map((chats) => chats.find((c) => c.resource.fragment === newChatId)),
      (c) => !!c
    );
    await this._chatSessionsService.getOrCreateChatSession(chat.resource, CancellationToken.None);
    return chat;
  }
  async createSideChat(sessionId, sourceChat, turnId, selection) {
    const connection = this.connection;
    if (!connection) {
      throw new Error(this._notConnectedSendErrorMessage());
    }
    const rawId = this._rawIdFromChatId(sessionId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (!rawId || !cached) {
      throw new Error(`Session '${sessionId}' not found`);
    }
    if (!cached.capabilities.get().supportsSideChat) {
      throw new Error(`Session '${sessionId}' does not support side chats`);
    }
    const sessionUri = AgentSession.uri(cached.agentProvider, rawId);
    const newChatId = generateUuid();
    const chatUri = URI.parse(buildChatUri(sessionUri, newChatId));
    const sourceBackendUri = this._resolveBackendSourceChatUri(cached.sessionId, sessionUri, sourceChat);
    const selectedModel = cached.getChatModelSelection(sourceChat);
    const selectedModelId = cached.getChatModelId(sourceChat) ?? (selectedModel ? `${cached.resource.scheme}:${selectedModel.id}` : void 0);
    const selectedAgentUri = cached.getChatMode(sourceChat)?.id;
    this._keepSessionStateAlive(cached.sessionId);
    await connection.createChat(sessionUri, chatUri, {
      model: selectedModel,
      sideChat: {
        source: sourceBackendUri,
        turnId,
        ...selection ? { selection } : {}
      }
    });
    const chat = await waitForState(
      cached.chats.map((chats) => chats.find((c) => c.resource.fragment === newChatId)),
      (c) => !!c
    );
    cached.setChatModelId(chat.resource, selectedModelId);
    cached.setChatAgent(chat.resource, selectedAgentUri ? { uri: selectedAgentUri, name: "" } : void 0);
    await this._chatSessionsService.getOrCreateChatSession(chat.resource, CancellationToken.None);
    await this._updateChatSessionState(chat.resource, selectedModelId, selectedAgentUri);
    return chat;
  }
  _resolveBackendSourceChatUri(sessionId, sessionUri, sourceChat) {
    if (sourceChat.fragment) {
      return URI.parse(buildChatUri(sessionUri, sourceChat.fragment));
    }
    const hydratedDefaultChat = this._lastSessionStates.get(sessionId)?.defaultChat;
    return hydratedDefaultChat ? URI.parse(hydratedDefaultChat.toString()) : URI.parse(buildDefaultChatUri(sessionUri));
  }
  async sendRequest(chatId, chatResource, options) {
    const newSession = this._getNewSession(chatId);
    if (newSession) {
      return this._sendNewSessionRequest(newSession, chatId, chatResource, options);
    }
    return this._sendCommittedChatRequest(chatId, chatResource, options);
  }
  /** Send the first request for an already-committed peer chat, then clear its `new` flag. */
  async _sendCommittedChatRequest(chatId, chatResource, options) {
    const rawId = this._rawIdFromChatId(chatId);
    const cached = rawId ? this._sessionCache.get(rawId) : void 0;
    if (!rawId || !cached) {
      throw new Error(`Session '${chatId}' not found`);
    }
    const { query, attachedContext } = options;
    const sessionType = chatResource.scheme;
    const contribution = this._chatSessionsService.getChatSessionContribution(sessionType);
    const selectedModelId = this._resolveSendModelId(chatId, cached.getChatModelId(chatResource));
    const selectedAgentUri = cached.getChatMode(chatResource)?.id;
    const sendOptions = {
      location: ChatAgentLocation.Chat,
      userSelectedModelId: selectedModelId,
      modeInfo: selectedAgentUri ? {
        kind: ChatModeKind.Agent,
        isBuiltin: false,
        modeInstructions: {
          uri: URI.parse(selectedAgentUri),
          name: "",
          content: "",
          toolReferences: []
        },
        telemetryModeId: "custom",
        applyCodeBlockSuggestionId: void 0,
        permissionLevel: void 0
      } : {
        kind: ChatModeKind.Agent,
        isBuiltin: true,
        modeInstructions: void 0,
        telemetryModeId: "agent",
        applyCodeBlockSuggestionId: void 0,
        permissionLevel: void 0
      },
      agentIdSilent: contribution?.type,
      attachedContext
    };
    const modelRef = await this._chatService.acquireOrLoadSession(chatResource, ChatAgentLocation.Chat, CancellationToken.None);
    if (!modelRef) {
      throw new Error(`[${this.id}] Unable to load chat session ${chatResource.toString()}`);
    }
    try {
      this._applyChatSessionState(modelRef, selectedModelId, selectedAgentUri);
      const result = await this._chatService.sendRequest(chatResource, query, sendOptions);
      if (result.kind === "rejected") {
        throw new Error(`[${this.id}] sendRequest rejected: ${result.reason}`);
      }
      this._applyChatSessionState(modelRef, selectedModelId, selectedAgentUri, { clearDraft: true });
    } finally {
      modelRef.dispose();
    }
    cached.markChatAsSent(chatResource.fragment);
    return cached;
  }
  async _updateChatSessionState(chatResource, modelId, agentUri, options) {
    const modelRef = await this._chatService.acquireOrLoadSession(chatResource, ChatAgentLocation.Chat, CancellationToken.None);
    if (!modelRef) {
      return;
    }
    try {
      this._applyChatSessionState(modelRef, modelId, agentUri, options);
    } finally {
      modelRef.dispose();
    }
  }
  _applyChatSessionState(modelRef, modelId, agentUri, options) {
    const inputModel = modelRef.object.inputModel;
    if (!inputModel) {
      return;
    }
    if (modelId) {
      const languageModel = this._languageModelsService.lookupLanguageModel(modelId);
      if (languageModel) {
        inputModel.setState({ selectedModel: { identifier: modelId, metadata: languageModel } });
      }
    }
    inputModel.setState({
      mode: { id: agentUri ?? ChatMode.Agent.id, kind: ChatModeKind.Agent },
      ...options?.clearDraft ? { inputText: "", attachments: [], selections: [] } : {}
    });
  }
  async _sendNewSessionRequest(newSession, chatId, chatResource, options) {
    const connection = this.connection;
    if (!connection) {
      throw new Error(this._notConnectedSendErrorMessage());
    }
    newSession.setStatus(SessionStatus.InProgress);
    const selectedModelId = this._resolveSendModelId(chatId, newSession.getSelectedModelId());
    const selectedAgent = newSession.getSelectedAgent();
    const { query, attachedContext } = options;
    const sessionType = chatResource.scheme;
    const contribution = this._chatSessionsService.getChatSessionContribution(sessionType);
    const sendOptions = {
      location: ChatAgentLocation.Chat,
      userSelectedModelId: selectedModelId,
      modeInfo: selectedAgent ? {
        kind: ChatModeKind.Agent,
        isBuiltin: false,
        modeInstructions: {
          uri: URI.parse(selectedAgent.uri),
          name: "",
          content: "",
          toolReferences: []
        },
        telemetryModeId: "custom",
        applyCodeBlockSuggestionId: void 0,
        permissionLevel: void 0
      } : {
        kind: ChatModeKind.Agent,
        isBuiltin: true,
        modeInstructions: void 0,
        telemetryModeId: "agent",
        applyCodeBlockSuggestionId: void 0,
        permissionLevel: void 0
      },
      agentIdSilent: contribution?.type,
      attachedContext,
      agentHostSessionConfig: this.getCreateSessionConfig(chatId)
    };
    const modelRef = await this._chatService.acquireOrLoadSession(chatResource, ChatAgentLocation.Chat, CancellationToken.None);
    if (modelRef) {
      if (selectedModelId) {
        const languageModel = this._languageModelsService.lookupLanguageModel(selectedModelId);
        if (languageModel) {
          modelRef.object.inputModel.setState({ selectedModel: { identifier: selectedModelId, metadata: languageModel } });
        }
      }
      if (selectedAgent) {
        modelRef.object.inputModel.setState({ mode: { id: selectedAgent.uri, kind: ChatModeKind.Agent } });
      }
      modelRef.dispose();
    }
    this._ensureSessionCache();
    const existingKeys = new Set(this._sessionCache.keys());
    const newSessionRawId = chatResource.path.replace(/^\//, "");
    existingKeys.delete(newSessionRawId);
    this._inFlightNewSessionOwnIds.add(newSessionRawId);
    const result = await this._chatService.sendRequest(chatResource, query, sendOptions);
    if (result.kind === "rejected") {
      throw new Error(`[${this.id}] sendRequest rejected: ${result.reason}`);
    }
    newSession.setStatus(SessionStatus.InProgress);
    newSession.clearSelectedModelId();
    newSession.setTitle(query.split("\n")[0].substring(0, 100) || newSession.untitledTitle);
    const skeleton = newSession.session;
    this._pendingSession = skeleton;
    this._onDidChangeSessions.fire({ added: [skeleton], removed: [], changed: [] });
    let committedRawId;
    try {
      const committedSession = await this._waitForNewSession(existingKeys, chatResource.scheme, newSessionRawId, newSession.cancellationToken);
      if (committedSession) {
        committedRawId = committedSession.resource.path.substring(1);
        this._preserveNewSessionConfig(newSession, committedSession.sessionId);
        if (selectedAgent) {
          const committedRawIdForAgent = this._rawIdFromChatId(committedSession.sessionId);
          const committedAdapter = committedRawIdForAgent ? this._sessionCache.get(committedRawIdForAgent) : void 0;
          committedAdapter?.setChatAgent(committedAdapter.resource, selectedAgent);
        }
        newSession.graduate();
        if (this._newSessions.get(newSession.sessionId) === newSession) {
          this._newSessions.deleteAndDispose(newSession.sessionId);
        }
        this._pendingSession = void 0;
        this._onDidReplaceSession.fire({ from: skeleton, to: committedSession });
        return committedSession;
      }
    } catch {
    } finally {
      if (committedRawId !== void 0) {
        this._committingSessionRawIds.delete(committedRawId);
      }
      this._inFlightNewSessionOwnIds.delete(newSessionRawId);
      this._pendingSession = void 0;
    }
    newSession.graduate();
    if (this._newSessions.get(newSession.sessionId) === newSession) {
      this._newSessions.deleteAndDispose(newSession.sessionId);
    }
    this._onDidChangeSessions.fire({ added: [], removed: [skeleton], changed: [] });
    throw new Error(localize("sessionNotCommitted", "Agent host session was not committed."));
  }
  /** Localized error message when sendRequest is invoked without a connection. Subclasses can override. */
  _notConnectedSendErrorMessage() {
    return localize("notConnectedSend", "Cannot send request: not connected to agent host.");
  }
  // -- Session config plumbing ---------------------------------------------
  /**
   * When a session transitions from untitled (new) to committed (running),
   * carry over the full resolved config (schema + values) so consumers like
   * the session-settings JSONC editor can round-trip non-mutable values
   * (`isolation`, `branch`, …) through a replace dispatch. Mutable-vs-readonly
   * behavior is still driven off the per-property `sessionMutable` flag.
   */
  _preserveNewSessionConfig(newSession, committedSessionId) {
    const config = newSession.getConfig();
    if (config && Object.keys(config.schema.properties).length > 0) {
      this._runningSessionConfigs.set(committedSessionId, {
        schema: { type: "object", properties: { ...config.schema.properties } },
        values: { ...config.values }
      });
    }
    this._applyWorktreeIsolation(committedSessionId, config?.values);
  }
  _rawIdFromChatId(chatId) {
    const prefix = `${this.id}:`;
    const resourceStr = chatId.startsWith(prefix) ? chatId.substring(prefix.length) : chatId;
    try {
      return URI.parse(resourceStr).path.substring(1) || void 0;
    } catch {
      return void 0;
    }
  }
  _activeChatResource(session) {
    const activeSession = this._sessionsService.activeSession.get();
    return activeSession?.sessionId === session.sessionId ? activeSession.activeChat.get().resource : session.resource;
  }
  /**
   * Pin the state subscription of every currently-visible session (so
   * host-driven catalog changes flow into `cached.chats` while it is on
   * screen) and resume the idle-release timer for sessions that have left the
   * viewport. Driven reactively by {@link ISessionsService.visibleSessions}.
   */
  _syncVisibleSessionStatePins(reader) {
    const visible = this._sessionsService.visibleSessions.read(reader);
    const nowVisible = /* @__PURE__ */ new Set();
    for (const session of visible) {
      if (!session) {
        continue;
      }
      for (const cached of this._sessionCache.values()) {
        if (isEqual(cached.resource, session.resource)) {
          nowVisible.add(cached.sessionId);
          break;
        }
      }
    }
    for (const sessionId of nowVisible) {
      this._pinnedSessionStates.add(sessionId);
      this._ensureSessionStateSubscription(sessionId);
      this._sessionStateIdleTimers.deleteAndDispose(sessionId);
    }
    for (const sessionId of [...this._pinnedSessionStates]) {
      if (!nowVisible.has(sessionId)) {
        this._pinnedSessionStates.delete(sessionId);
        this._keepSessionStateAlive(sessionId);
      }
    }
  }
  /**
   * Bump the idle-release timer for `sessionId` and lazily create the
   * underlying subscription if needed. Called from query paths
   * ({@link getSessionByResource}, {@link getSessionConfig}) that depend on
   * `_runningSessionConfigs` / `_meta` being in sync but cannot themselves
   * own a subscription handle.
   */
  _keepSessionStateAlive(sessionId) {
    this._ensureSessionStateSubscription(sessionId);
    if (!this._sessionStateSubscriptions.has(sessionId)) {
      return;
    }
    if (this._pinnedSessionStates.has(sessionId)) {
      this._sessionStateIdleTimers.deleteAndDispose(sessionId);
      return;
    }
    this._sessionStateIdleTimers.set(
      sessionId,
      disposableTimeout(
        () => {
          this._sessionStateIdleTimers.deleteAndDispose(sessionId);
          this._sessionStateSubscriptions.deleteAndDispose(sessionId);
        },
        BaseAgentHostSessionsProvider.SESSION_STATE_SUBSCRIPTION_IDLE_MS
      )
    );
  }
  /**
   * Lazily acquire a session-state subscription for `sessionId` so that
   * `_runningSessionConfigs` is seeded from the AHP `SessionState.config`
   * snapshot. Safe to call repeatedly — no-op once a subscription exists.
   *
   * The subscription is reference-counted by {@link IAgentConnection.getSubscription},
   * so when the session handler is also subscribed (chat content open) this
   * shares the existing wire subscription rather than opening a new one.
   */
  _ensureSessionStateSubscription(sessionId) {
    if (this._sessionStateSubscriptions.has(sessionId)) {
      return;
    }
    const connection = this.connection;
    if (!connection) {
      return;
    }
    const rawId = this._rawIdFromChatId(sessionId);
    if (!rawId) {
      return;
    }
    const cached = this._sessionCache.get(rawId);
    if (!cached) {
      return;
    }
    const sessionUri = cached.backendUri;
    const ref = connection.getSubscription(StateComponents.Session, sessionUri, "BaseAgentHostSessionsProvider.summary");
    const store = new DisposableStore();
    store.add(ref);
    store.add(ref.object.onDidChange((state) => {
      this._applySessionStateUpdate(sessionId, state);
    }));
    this._sessionStateSubscriptions.set(sessionId, store);
    const value = ref.object.value;
    if (value && !(value instanceof Error)) {
      this._applySessionStateUpdate(sessionId, value);
    }
    this._hydrateAgentFromDraft(connection, cached, sessionId, sessionUri, store);
  }
  /**
   * Resume hydration: when a session is (re)loaded and its adapter has no agent
   * selected, restore the persisted selection from the default chat's
   * `ChatState.draft.agent` and mirror it onto `session.mode` (the picker's
   * source of truth).
   *
   * The agent is persisted on the chat channel — the session channel
   * ({@link SessionState}) carries no draft — so we briefly observe the default
   * chat's state until its draft agent arrives. The subscription is shared and
   * ref-counted with the chat session handler (no extra wire cost) and lives for
   * the session-state store's lifetime. Hydration is one-shot: the observer
   * stops as soon as `mode` is set — by us here, or by a concurrent graduation
   * seed or user pick (guarded inside
   * {@link AgentHostSessionAdapter.hydrateSelectedAgent}) — so it neither leaks,
   * overrides a later selection, nor keeps re-running on every chat update.
   */
  _hydrateAgentFromDraft(connection, cached, sessionId, sessionUri, store) {
    if (cached.mode.get() !== void 0) {
      return;
    }
    const lastDefaultChat = this._lastSessionStates.get(sessionId)?.defaultChat;
    const defaultChatUri = lastDefaultChat ? URI.parse(lastDefaultChat.toString()) : URI.parse(buildDefaultChatUri(sessionUri));
    const chatRef = connection.getSubscription(StateComponents.Chat, defaultChatUri, "BaseAgentHostSessionsProvider.draftAgent");
    store.add(chatRef);
    const listener = store.add(new MutableDisposable());
    const tryHydrate = () => {
      if (cached.mode.get() === void 0) {
        const chatState = chatRef.object.value;
        const agentUri = chatState && !(chatState instanceof Error) ? chatState.draft?.agent?.uri : void 0;
        if (agentUri) {
          cached.hydrateSelectedAgent(agentUri);
        }
      }
      if (cached.mode.get() !== void 0) {
        listener.clear();
      }
    };
    listener.value = chatRef.object.onDidChange(() => tryHydrate());
    tryHydrate();
  }
  /**
   * Fan-out for AHP `SessionState` snapshots: keeps both the running
   * session config and the cached adapter's `_meta` (e.g. git state) in
   * sync.
   */
  _applySessionStateUpdate(sessionId, state) {
    const previous = this._lastSessionStates.get(sessionId);
    this._lastSessionStates.set(sessionId, state);
    if (!previous || customizationsChanged(previous, state)) {
      this._reconcileAgentFromState(sessionId, state);
      this._onDidChangeCustomAgents.fire();
      this._onDidChangeCustomizations.fire();
    }
    this._seedRunningConfigFromState(sessionId, state);
    this._applySessionMetaFromState(sessionId, state);
    this._applyChatCatalogFromState(sessionId, state);
    if (!previous) {
      this._applyChangesetsFromState(sessionId, state);
    }
  }
  /**
   * Seed the cached adapter's changeset catalogue from an AHP
   * {@link SessionState}. The catalogue otherwise only flows in via the live
   * `SessionChangesetsChanged` action, which the host emits only when entries
   * are added or removed. On restore (e.g. after a reload) nothing mutates, so
   * that action never fires and the catalogue would stay empty. The restored
   * `SessionState` snapshot carries the persisted `changesets`, so apply it
   * here to surface the catalogue immediately.
   */
  _applyChangesetsFromState(sessionId, state) {
    if (state.changesets === void 0) {
      return;
    }
    const rawId = this._rawIdFromChatId(sessionId);
    if (!rawId) {
      return;
    }
    const cached = this._sessionCache.get(rawId);
    if (!cached) {
      return;
    }
    cached.updateChangesets(state.changesets);
  }
  /**
   * Rebase the cached running adapter's selected agent against the host's agent
   * list from an AHP {@link SessionState}, before the picker is notified. A
   * session that has moved into an isolated worktree keeps its selection instead
   * of resetting to the default once the host starts reporting worktree-pathed
   * agents. See {@link AgentHostSessionAdapter.reconcileSelectedAgent}.
   */
  _reconcileAgentFromState(sessionId, state) {
    const rawId = this._rawIdFromChatId(sessionId);
    if (!rawId) {
      return;
    }
    const cached = this._sessionCache.get(rawId);
    if (!cached) {
      return;
    }
    cached.reconcileSelectedAgent(getEffectiveAgents(state.customizations));
  }
  /**
   * Reconcile the per-chat catalog of the cached running adapter from an AHP
   * {@link SessionState}. The adapter exposes `chats`/`mainChat` as
   * observables, so updating them here is enough for the chat-tab UI to
   * re-render reactively.
   */
  _applyChatCatalogFromState(sessionId, state) {
    const rawId = this._rawIdFromChatId(sessionId);
    if (!rawId) {
      return;
    }
    const cached = this._sessionCache.get(rawId);
    if (!cached) {
      return;
    }
    cached.applyChatCatalog(state);
  }
  /**
   * NewSession variant of {@link _applySessionStateUpdate}: writes the
   * customizations subset (the only one the agent picker reads) and
   * fires `_onDidChangeCustomAgents` when it changes. Skips
   * {@link _seedRunningConfigFromState} (NewSession owns its own config
   * via `NewSession._config`) and {@link _applySessionMetaFromState}
   * (which only applies to cached running sessions).
   */
  _handleNewSessionStateUpdate(sessionId, state) {
    const previous = this._lastSessionStates.get(sessionId);
    this._lastSessionStates.set(sessionId, state);
    if (!previous || customizationsChanged(previous, state)) {
      this._onDidChangeCustomAgents.fire();
      this._onDidChangeCustomizations.fire();
    }
  }
  /**
   * Cleanup sentinel from {@link NewSession.dispose}: drops the cached
   * `_lastSessionStates` entry the new session contributed. Fires
   * `_onDidChangeCustomAgents` so any open picker re-reads and falls
   * back to the empty list rather than rendering stale agents.
   */
  _handleNewSessionStateGone(sessionId) {
    if (this._lastSessionStates.delete(sessionId)) {
      this._onDidChangeCustomAgents.fire();
      this._onDidChangeCustomizations.fire();
    }
  }
  _applySessionMetaFromState(sessionId, state) {
    const rawId = this._rawIdFromChatId(sessionId);
    if (!rawId) {
      return;
    }
    const cached = this._sessionCache.get(rawId);
    if (!cached) {
      return;
    }
    if (cached.setMeta(state._meta)) {
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
    }
  }
  /**
   * Seed {@link _runningSessionConfigs} from the AHP `SessionState.config`
   * snapshot. Keeps the full schema + values (including non-mutable ones)
   * so consumers like the JSONC settings editor can round-trip all values
   * through a replace dispatch. No-op if structurally equal to avoid spurious
   * `onDidChangeSessionConfig` fires.
   */
  _seedRunningConfigFromState(sessionId, state) {
    const stateConfig = state.config;
    if (!stateConfig) {
      return;
    }
    if (Object.keys(stateConfig.schema.properties).length === 0) {
      return;
    }
    const existing = this._runningSessionConfigs.get(sessionId);
    let seeded;
    if (existing && this._runningSessionConfigResolveSeq.has(sessionId)) {
      const values = { ...existing.values };
      for (const key of Object.keys(existing.schema.properties)) {
        if (Object.hasOwn(stateConfig.values, key)) {
          values[key] = stateConfig.values[key];
        }
      }
      seeded = {
        schema: { type: "object", properties: { ...existing.schema.properties } },
        values
      };
    } else {
      seeded = {
        schema: {
          type: "object",
          properties: {
            ...existing?.schema.properties ?? {},
            ...stateConfig.schema.properties
          }
        },
        values: {
          ...existing?.values ?? {},
          ...stateConfig.values
        }
      };
    }
    if (existing && resolvedConfigsEqual(existing, seeded)) {
      return;
    }
    this._runningSessionConfigs.set(sessionId, seeded);
    this._applyWorktreeIsolation(sessionId, seeded.values);
    this._onDidChangeSessionConfig.fire(sessionId);
  }
  /** Mirrors a session's `isolation` pick onto its adapter. See {@link ISession.worktreePending}. */
  _applyWorktreeIsolation(sessionId, values) {
    if (!isWorktreeIsolation(values)) {
      return;
    }
    const rawId = this._rawIdFromChatId(sessionId);
    const adapter = rawId ? this._sessionCache.get(rawId) : void 0;
    adapter?.setWorktreeIsolation(true);
  }
  // -- Session cache management --------------------------------------------
  /**
   * Opt in to persisting {@link _sessionCache} snapshots under `storageKey`.
   * Subclasses call this at the **end** of their constructor — once the
   * identity fields that {@link createAdapter}/{@link resourceSchemeForProvider}/
   * {@link _adapterOptions} depend on are initialized — because the initial
   * hydration builds adapters. This is why the base cannot auto-load in its
   * own constructor. Persisted summaries are hydrated into {@link _sessionCache}
   * immediately so {@link getSessions} returns them before the first
   * `listSessions()` round-trip resolves.
   *
   * `legacyStorageKey`, when given, is removed so stale entries are discarded.
   */
  _enableSessionCachePersistence(storageKey, legacyStorageKey) {
    if (legacyStorageKey) {
      this._storageService.remove(legacyStorageKey, StorageScope.APPLICATION);
    }
    this._sessionCacheStorageKey = storageKey;
    this._loadCachedSessions();
  }
  /**
   * Whether {@link _onDidChangeSessions} events should update the persistence
   * bookkeeping ({@link _cacheDirty} + {@link _metaByRawId}). Default `true`;
   * the remote provider overrides this to suspend tracking while its cached
   * sessions are unpublished (offline), so the on-disk snapshot survives.
   */
  _shouldTrackSessionCacheChanges() {
    return true;
  }
  /** Load persisted session summaries into {@link _sessionCache}. */
  _loadCachedSessions() {
    if (!this._sessionCacheStorageKey) {
      return;
    }
    const parsed = this._storageService.getObject(this._sessionCacheStorageKey, StorageScope.APPLICATION);
    if (!Array.isArray(parsed)) {
      return;
    }
    for (const entry of parsed) {
      const deserialized = deserializeMetadata(entry);
      if (!deserialized) {
        continue;
      }
      const meta = this._adoptSessionMeta(deserialized);
      const rawId = AgentSession.id(meta.session);
      if (this._sessionCache.has(rawId)) {
        continue;
      }
      const cached = this.createAdapter(meta);
      this._sessionCache.set(rawId, cached);
    }
  }
  /**
   * Persist the current {@link _sessionCache} to storage, capping at
   * {@link CACHED_SESSIONS_MAX_PER_HOST} most-recently-modified entries.
   * Mutable fields are read from each adapter's observables and overlaid on
   * top of the original metadata snapshot captured in {@link _metaByRawId}.
   */
  _persistCache() {
    if (!this._sessionCacheStorageKey) {
      return;
    }
    const entries = [];
    for (const [rawId, adapter] of this._sessionCache) {
      const base = this._metaByRawId.get(rawId);
      if (!base) {
        continue;
      }
      entries.push(serializeMetadata({
        ...base,
        summary: adapter.title.get() || base.summary,
        modifiedTime: adapter.updatedAt.get().getTime(),
        status: withSessionStatusFlag(
          withSessionStatusFlag(base.status ?? ProtocolSessionStatus.Idle, ProtocolSessionStatus.IsRead, adapter.isRead.get()),
          ProtocolSessionStatus.IsArchived,
          adapter.isArchived.get()
        ),
        // The adapter's live kind wins over the snapshot: several metadata
        // sources omit `_meta`, and persisting a stale one would resurrect
        // the session as a workspace rooted at the host's scratch cwd.
        ...adapter.isQuickChat.get() ? { _meta: withSessionWorkspaceless(base._meta, true) } : {}
      }));
    }
    if (entries.length === 0) {
      this._storageService.remove(this._sessionCacheStorageKey, StorageScope.APPLICATION);
      return;
    }
    entries.sort((a, b) => b.modifiedTime - a.modifiedTime);
    const limited = entries.slice(0, CACHED_SESSIONS_MAX_PER_HOST);
    this._storageService.store(this._sessionCacheStorageKey, JSON.stringify(limited), StorageScope.APPLICATION, StorageTarget.USER);
  }
  _ensureSessionCache() {
    if (this._cacheInitialized) {
      return;
    }
    if (this._sessionRefreshInFlight || this._sessionRefreshRetry.value) {
      return;
    }
    this._refreshSessions();
  }
  async _refreshSessions(announceExistingAsAdded = false) {
    const connection = this.connection;
    if (!connection) {
      return;
    }
    this._sessionRefreshRetry.clear();
    this._sessionRefreshInFlight = true;
    try {
      const sessions = await connection.listSessions();
      this._cacheInitialized = true;
      this._sessionRefreshRetryDelay = BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MIN_MS;
      const currentKeys = /* @__PURE__ */ new Set();
      const listedAgentProviders = /* @__PURE__ */ new Set();
      const added = [];
      const changed = [];
      for (const rawMeta of sessions) {
        const meta = this._adoptSessionMeta(rawMeta);
        const rawId = AgentSession.id(meta.session);
        currentKeys.add(rawId);
        const agentProvider = AgentSession.provider(meta.session);
        if (agentProvider) {
          listedAgentProviders.add(agentProvider);
        }
        const existing = this._sessionCache.get(rawId);
        if (existing) {
          if (announceExistingAsAdded) {
            added.push(existing);
          }
          if (this.updateAdapter(existing, meta)) {
            changed.push(existing);
          }
        } else {
          const cached = this.createAdapter(meta);
          this._sessionCache.set(rawId, cached);
          added.push(cached);
        }
      }
      const removed = [];
      const pendingRawId = this._pendingSession?.resource.path.replace(/^\//, "");
      const evictUnlistedAgents = listedAgentProviders.size === 0;
      for (const [key, cached] of this._sessionCache) {
        if (!currentKeys.has(key)) {
          if (key === pendingRawId) {
            continue;
          }
          if (!evictUnlistedAgents && !listedAgentProviders.has(cached.agentProvider)) {
            continue;
          }
          this._sessionCache.delete(key);
          this._runningSessionConfigs.delete(cached.sessionId);
          this._runningSessionConfigResolveSeq.delete(cached.sessionId);
          removed.push(cached);
        }
      }
      if (added.length > 0 || removed.length > 0 || changed.length > 0) {
        this._onDidChangeSessions.fire({ added, removed, changed });
      }
      this._syncActiveClient();
      for (const cached of removed) {
        cached.dispose();
      }
    } catch (err) {
      this._logService.trace(`[AgentHostSessionsProvider] listSessions failed; scheduling retry: ${err}`);
      this._scheduleSessionRefreshRetry(announceExistingAsAdded);
    } finally {
      this._sessionRefreshInFlight = false;
    }
  }
  /**
   * Arm a backoff retry of {@link _refreshSessions}. Used after a failed
   * refresh so a transient startup failure self-heals without requiring an
   * unrelated AHP event (a turn completing, a session being added) to force
   * a re-fetch. Cancelled on the next successful refresh.
   */
  _scheduleSessionRefreshRetry(announceExistingAsAdded) {
    const delay = this._sessionRefreshRetryDelay;
    this._sessionRefreshRetryDelay = Math.min(delay * 2, BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MAX_MS);
    this._sessionRefreshRetry.value = disposableTimeout(() => {
      this._refreshSessions(announceExistingAsAdded);
    }, delay);
  }
  /**
   * Cancel any pending session-refresh retry and reset the backoff. Called
   * by subclasses when the connection goes away (the stale timer would
   * otherwise fire against a dead connection and no-op).
   */
  _cancelSessionRefreshRetry() {
    this._sessionRefreshRetry.clear();
    this._sessionRefreshRetryDelay = BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MIN_MS;
  }
  /**
   * Resolve the freshly-committed backend session for an in-flight send.
   *
   * The local agent host runs a single provider whose session cache holds
   * **every** agent-host session type (codex, claude, copilot, …). A send
   * therefore has to identify *its own* new session by both novelty (a raw id
   * not present before the send) **and** type: `expectedScheme` is the
   * `chatResource` scheme (e.g. `agent-host-codex`), so a session of another
   * type that happens to appear mid-send — a slow codex send racing against a
   * restored claude session, say — is never mistaken for this send's commit.
   */
  async _waitForNewSession(existingKeys, expectedScheme, ownRawId, token) {
    const matches = (rawId, scheme) => {
      if (scheme !== expectedScheme || this._committingSessionRawIds.has(rawId)) {
        return false;
      }
      if (rawId === ownRawId) {
        return true;
      }
      return !existingKeys.has(rawId) && !this._inFlightNewSessionOwnIds.has(rawId);
    };
    await this._refreshSessions();
    const scan = () => {
      let fallback;
      for (const cached of this._sessionCache.values()) {
        const rawId = cached.resource.path.substring(1);
        if (!matches(rawId, cached.resource.scheme)) {
          continue;
        }
        if (rawId === ownRawId) {
          return cached;
        }
        fallback ??= cached;
      }
      return fallback;
    };
    const immediate = scan();
    if (immediate) {
      this._committingSessionRawIds.add(immediate.resource.path.substring(1));
      return immediate;
    }
    const waitDisposables = new DisposableStore();
    try {
      const sessionPromise = new Promise((resolve) => {
        waitDisposables.add(this._onDidChangeSessions.event((e) => {
          const exact = e.added.find((s) => s.resource.path.substring(1) === ownRawId && matches(ownRawId, s.resource.scheme));
          const newSession = exact ?? e.added.find((s) => matches(s.resource.path.substring(1), s.resource.scheme));
          if (newSession) {
            this._committingSessionRawIds.add(newSession.resource.path.substring(1));
            resolve(newSession);
          }
        }));
        waitDisposables.add(this.onConnectionLost(() => resolve(void 0)));
      });
      return await raceCancellationError(sessionPromise, token);
    } finally {
      waitDisposables.dispose();
    }
  }
  // -- AHP notification / action handlers ----------------------------------
  /**
   * Wire AHP notification and action listeners on the given connection.
   * Subclasses call this from their constructor (local) or `setConnection`
   * (remote), passing a store that bounds the listeners' lifetime.
   */
  _attachConnectionListeners(connection, store) {
    store.add(connection.onDidNotification((n) => {
      if (n.type === NotificationType.SessionAdded) {
        this._handleSessionAdded(n.summary);
      } else if (n.type === NotificationType.SessionRemoved) {
        this._handleSessionRemoved(n.session);
      } else if (n.type === NotificationType.SessionSummaryChanged) {
        this._handleSessionSummaryChanged(n.session, n.changes);
      } else if (n.type === NotificationType.Progress) {
        this._downloadProgress.handleProgress(n);
      }
    }));
    store.add(connection.onDidAction((e) => {
      if (e.action.type === ActionType.ChatTurnComplete && isChatAction(e.action)) {
        this._refreshSessions();
      } else if (e.action.type === ActionType.SessionTitleChanged && isSessionAction(e.action)) {
        this._handleTitleChanged(e.channel, e.action.title);
      } else if (e.action.type === ActionType.SessionIsArchivedChanged && isSessionAction(e.action)) {
        this._handleIsArchivedChanged(e.channel, e.action.isArchived);
      } else if (e.action.type === ActionType.SessionIsReadChanged && isSessionAction(e.action)) {
        this._handleIsReadChanged(e.channel, e.action.isRead);
      } else if (e.action.type === ActionType.SessionConfigChanged && isSessionAction(e.action)) {
        this._handleConfigChanged(e.channel, e.action.config, e.action.replace === true);
      } else if (e.action.type === ActionType.SessionChangesetsChanged && isSessionAction(e.action)) {
        this._handleChangesetsChanged(e.channel, e.action.changesets);
      } else if (e.action.type === ActionType.SessionMetaChanged && isSessionAction(e.action)) {
        this._handleSessionMetaChanged(e.channel, e.action._meta);
      }
    }));
  }
  _handleSessionAdded(summary) {
    const workingDirs = summary.workingDirectories?.map((d) => this.mapWorkingDirectoryUri(URI.parse(d)));
    const rawMeta = {
      session: URI.parse(summary.resource),
      startTime: Date.parse(summary.createdAt),
      modifiedTime: Date.parse(summary.modifiedAt),
      summary: summary.title,
      activity: summary.activity,
      status: summary.status,
      ...summary.project ? {
        project: {
          displayName: summary.project.displayName,
          uri: this.mapProjectUri(URI.parse(summary.project.uri))
        }
      } : {},
      workingDirectories: workingDirs,
      changes: summary.changes,
      // Carry `_meta` so a new adapter seeds its session-kind from it and an
      // existing one can be promoted by it.
      ...summary._meta !== void 0 ? { _meta: summary._meta } : {}
    };
    const meta = this._adoptSessionMeta(rawMeta);
    const rawId = AgentSession.id(meta.session);
    const existing = this._sessionCache.get(rawId);
    if (existing) {
      if (this.updateAdapter(existing, meta)) {
        this._onDidChangeSessions.fire({ added: [], removed: [], changed: [existing] });
      }
      this._syncActiveClient();
      return;
    }
    const cached = this.createAdapter(meta);
    this._sessionCache.set(rawId, cached);
    this._onDidChangeSessions.fire({ added: [cached], removed: [], changed: [] });
    this._syncActiveClient();
  }
  _handleSessionRemoved(session) {
    const rawId = AgentSession.id(session);
    const cached = this._sessionCache.get(rawId);
    if (cached) {
      this._sessionCache.delete(rawId);
      this._runningSessionConfigs.delete(cached.sessionId);
      this._runningSessionConfigResolveSeq.delete(cached.sessionId);
      this._sessionStateIdleTimers.deleteAndDispose(cached.sessionId);
      this._sessionStateSubscriptions.deleteAndDispose(cached.sessionId);
      this._lastSessionStates.delete(cached.sessionId);
      this._onDidChangeSessions.fire({ added: [], removed: [cached], changed: [] });
      cached.dispose();
    }
  }
  _handleTitleChanged(session, title) {
    const rawId = AgentSession.id(session);
    const cached = this._sessionCache.get(rawId);
    if (cached) {
      cached.title.set(title, void 0);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
    }
  }
  _handleIsArchivedChanged(session, isArchived) {
    const rawId = AgentSession.id(session);
    const cached = this._sessionCache.get(rawId);
    if (cached) {
      cached.isArchived.set(isArchived, void 0);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
    }
  }
  _handleIsReadChanged(session, isRead) {
    const rawId = AgentSession.id(session);
    const cached = this._sessionCache.get(rawId);
    if (cached && cached.isRead.get() !== isRead) {
      cached.isRead.set(isRead, void 0);
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
    }
  }
  _handleSessionSummaryChanged(session, changes) {
    transaction((tx) => {
      const rawId = AgentSession.id(session);
      const cached = this._sessionCache.get(rawId);
      if (!cached) {
        return;
      }
      let didChange = false;
      if (changes.status !== void 0) {
        const uiStatus = mapProtocolStatus(changes.status);
        if (uiStatus !== cached.status.get()) {
          cached.status.set(uiStatus, tx);
          didChange = true;
        }
        const isArchived = !!(changes.status & ProtocolSessionStatus.IsArchived);
        if (isArchived !== cached.isArchived.get()) {
          cached.isArchived.set(isArchived, tx);
          didChange = true;
        }
        const isRead = !!(changes.status & ProtocolSessionStatus.IsRead);
        if (isRead !== cached.isRead.get()) {
          cached.isRead.set(isRead, tx);
          didChange = true;
        }
      }
      if (changes.title !== void 0 && changes.title !== cached.title.get()) {
        cached.title.set(changes.title, tx);
        didChange = true;
      }
      if (changes.changes !== void 0 && cached.setChangesSummary(changes.changes, tx)) {
        didChange = true;
      }
      if (Object.prototype.hasOwnProperty.call(changes, "activity") && cached.setActivity(changes.activity, tx)) {
        didChange = true;
      }
      if (changes._meta !== void 0 && cached.setMeta(changes._meta, tx)) {
        didChange = true;
      }
      if (didChange) {
        this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
      }
    });
  }
  _handleConfigChanged(session, config, replace) {
    const rawId = AgentSession.id(session);
    const cached = this._sessionCache.get(rawId);
    if (!cached) {
      return;
    }
    const sessionId = cached.sessionId;
    const existing = this._runningSessionConfigs.get(sessionId);
    if (existing) {
      this._runningSessionConfigs.set(sessionId, {
        ...existing,
        values: replace ? { ...config } : { ...existing.values, ...config }
      });
    } else {
      this._runningSessionConfigs.set(sessionId, {
        schema: { type: "object", properties: buildMutableConfigSchema(config) },
        values: config
      });
    }
    this._onDidChangeSessionConfig.fire(sessionId);
  }
  _handleChangesetsChanged(session, changesets) {
    const rawId = AgentSession.id(session);
    const cached = this._sessionCache.get(rawId);
    if (cached) {
      cached.updateChangesets(changesets);
    }
  }
  _handleSessionMetaChanged(session, meta) {
    const rawId = AgentSession.id(session);
    const cached = this._sessionCache.get(rawId);
    if (cached?.setMeta(meta)) {
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
    }
  }
  /**
   * Optional URI mapper used when applying diff changes. Subclasses
   * override to translate remote diff URIs into agent-host URIs.
   */
  _diffUriMapper() {
    return void 0;
  }
};
BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MIN_MS = 1e3;
BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MAX_MS = 3e4;
// -- Lazy session-state subscription seeding -----------------------------
/**
 * Idle window before a lazily-created session-state subscription is
 * released. Each call to {@link _keepSessionStateAlive} resets the timer.
 * Long enough to absorb the open→config-picker churn while a session view
 * is active; short enough that closed sessions release within a minute or
 * so, allowing the agent host to evict their cached restored state.
 */
BaseAgentHostSessionsProvider.SESSION_STATE_SUBSCRIPTION_IDLE_MS = 3e4;
BaseAgentHostSessionsProvider = __decorateClass([
  __decorateParam(0, IChatSessionsService),
  __decorateParam(1, IChatService),
  __decorateParam(2, IChatWidgetService),
  __decorateParam(3, ILanguageModelsService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IGitHubService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, ISessionsService),
  __decorateParam(9, IAgentHostActiveClientService),
  __decorateParam(10, IStorageService),
  __decorateParam(11, IDialogService),
  __decorateParam(12, IWorkspaceTrustManagementService)
], BaseAgentHostSessionsProvider);
export {
  AGENT_MODE_KIND,
  AgentHostSessionAdapter,
  BaseAgentHostSessionsProvider,
  CopilotCLISessionType,
  toSessionChatOriginKind
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2FnZW50SG9zdC9icm93c2VyL2Jhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQsIHJhY2VDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgYXJyYXlFcXVhbHMsIHN0cnVjdHVyYWxFcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcXVhbHMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgSVJlZmVyZW5jZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgZGVyaXZlZCwgZGVyaXZlZE9wdHMsIElPYnNlcnZhYmxlLCBJUmVhZGVyLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBJVHJhbnNhY3Rpb24sIG9ic2VydmFibGVWYWx1ZU9wdHMsIHN1YnRyYW5zYWN0aW9uLCB0cmFuc2FjdGlvbiwgd2FpdEZvclN0YXRlLCBhdXRvcnVuLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwsIGlzRXF1YWxPclBhcmVudCwgcmVsYXRpdmVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIEF1dGhlbnRpY2F0ZVBhcmFtcywgQXV0aGVudGljYXRlUmVzdWx0LCBJQWdlbnRDb25uZWN0aW9uLCBJQWdlbnRTZXNzaW9uTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBidWlsZEFubm90YXRpb25zVXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hbm5vdGF0aW9uc1VyaS5qcyc7XG5pbXBvcnQgeyBwYXJzZUdpdEh1Yklzc3VlVXJsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9naXRodWJJc3N1ZVJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgZ2V0RWZmZWN0aXZlQWdlbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9jdXN0b21BZ2VudHMuanMnO1xuaW1wb3J0IHsgS05PV05fTU9ERV9WQUxVRVMsIFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3Nlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IG1pZ3JhdGVMZWdhY3lBdXRvcGlsb3RDb25maWcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudFN1YnNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvYWdlbnRTdWJzY3JpcHRpb24uanMnO1xuaW1wb3J0IHsgUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQsIHR5cGUgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBBZ2VudEN1c3RvbWl6YXRpb24sIENoYW5nZXNTdW1tYXJ5LCBDaGF0SW50ZXJhY3Rpdml0eSBhcyBQcm90b2NvbENoYXRJbnRlcmFjdGl2aXR5LCBDaGF0T3JpZ2luS2luZCBhcyBQcm90b2NvbENoYXRPcmlnaW5LaW5kLCB0eXBlIENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb24sIEN1c3RvbWl6YXRpb24sIEN1c3RvbWl6YXRpb25UeXBlLCBNb2RlbFNlbGVjdGlvbiwgU2Vzc2lvblN0YXR1cyBhcyBQcm90b2NvbFNlc3Npb25TdGF0dXMsIFJvb3RDb25maWdTdGF0ZSwgUm9vdFN0YXRlLCBTZXNzaW9uQWN0aXZlQ2xpZW50LCBTZXNzaW9uU3RhdGUsIFNlc3Npb25TdW1tYXJ5LCB0eXBlIENoYW5nZXNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgaXNDaGF0QWN0aW9uLCBpc1Nlc3Npb25BY3Rpb24sIE5vdGlmaWNhdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IEFnZW50Q2FwYWJpbGl0aWVzLCBBZ2VudEluZm8sIGJ1aWxkQ2hhdFVyaSwgYnVpbGREZWZhdWx0Q2hhdFVyaSwgaXNEZWZhdWx0Q2hhdFVyaSwgaXNTZXNzaW9uU3RhdHVzQXJjaGl2ZWQsIGlzU2Vzc2lvblN0YXR1c1JlYWQsIHBhcnNlQ2hhdFVyaSwgcmVhZFNlc3Npb25HaXRIdWJTdGF0ZSwgcmVhZFNlc3Npb25HaXRTdGF0ZSwgcmVhZFNlc3Npb25Xb3Jrc3BhY2VsZXNzLCBST09UX1NUQVRFX1VSSSwgU2Vzc2lvbk1ldGEsIFN0YXRlQ29tcG9uZW50cywgd2l0aFNlc3Npb25TdGF0dXNGbGFnLCB3aXRoU2Vzc2lvbldvcmtzcGFjZWxlc3MsIHR5cGUgQ2hhdFN1bW1hcnksIHR5cGUgSVNlc3Npb25HaXRTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdERvd25sb2FkUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0RG93bmxvYWRQcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRNb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdE1vZGVzLmpzJztcbmltcG9ydCB7IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zLCBJQ2hhdFNlcnZpY2UsIHR5cGUgSUNoYXRNb2RlbFJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UsIElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyLCBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uLCBDaGF0TW9kZUtpbmQsIENoYXRQZXJtaXNzaW9uTGV2ZWwsIGdldENoYXRQZXJtaXNzaW9uTGV2ZWxGcm9tRGVmYXVsdENvbmZpZ3VyYXRpb24sIGlzQ2hhdFBlcm1pc3Npb25MZXZlbCwgdHlwZSBJQ2hhdERlZmF1bHRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGlzQXV0b0FwcHJvdmVQb2xpY3lSZXN0cmljdGVkLCBub3JtYWxpemVTZXNzaW9uQ29uZmlnVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hZ2VudEhvc3RDb25maWdQb2xpY3kuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IGdldFJlZ2lzdGVyZWRMYW5ndWFnZU1vZGVscywgcmVzb2x2ZUNvbmZpZ3VyZWRNb2RlbCwgcmVzb2x2ZU1vZGVsSWRlbnRpZmllciwgcmVzb2x2ZU1vZGVsSWRlbnRpZmllckZyb21MYW5ndWFnZU1vZGVscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL21vZGVsU2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IGJ1aWxkTXV0YWJsZUNvbmZpZ1NjaGVtYSwgSUFnZW50SG9zdE1jcFNlcnZlciwgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsIHJlc29sdmVkQ29uZmlnc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgYWdlbnRIb3N0U2Vzc2lvbldvcmtzcGFjZUtleSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uV29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGlzU2Vzc2lvbkNvbmZpZ0NvbXBsZXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Nlc3Npb25Db25maWcuanMnO1xuaW1wb3J0IHsgQ2hhdEludGVyYWN0aXZpdHksIENoYXRPcmlnaW5LaW5kLCBERUZBVUxUX0NIQVRfQ0FQQUJJTElUSUVTLCBlZmZlY3RpdmVDaGF0SW50ZXJhY3Rpdml0eSwgSUNoYXQsIElDaGF0Q2FwYWJpbGl0aWVzLCBJR2l0SHViSW5mbywgSUdpdEh1Yklzc3VlUmVmLCBJU2Vzc2lvbiwgSVNlc3Npb25BZ2VudFJlZiwgSVNlc3Npb25DYXBhYmlsaXRpZXMsIElTZXNzaW9uQ2hhbmdlc2V0LCBJU2Vzc2lvbkNoYW5nZXNTdW1tYXJ5LCBJU2Vzc2lvbkZpbGUsIElTZXNzaW9uRmlsZUNoYW5nZSwgSVNlc3Npb25UeXBlLCBJU2Vzc2lvbldvcmtzcGFjZSwgSVNlc3Npb25Xb3Jrc3BhY2VCcm93c2VBY3Rpb24sIElTaWRlQ2hhdFNlbGVjdGlvbiwgc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwsIFNlc3Npb25TdGF0dXMsIHRvU2Vzc2lvbklkIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEZWxldGVDaGF0T3B0aW9ucywgSVNlbmRSZXF1ZXN0T3B0aW9ucywgSVNlc3Npb25DaGFuZ2VFdmVudCwgSVNlc3Npb25Nb2RlbFBpY2tlck9wdGlvbnMsIElTZXNzaW9uTW9kZWxzU25hcHNob3QgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJR2l0SHViU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2dpdGh1Yi9icm93c2VyL2dpdGh1YlNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY29tcHV0ZVNlc3Npb25QdWxsUmVxdWVzdEljb24gfSBmcm9tICcuLi8uLi8uLi9naXRodWIvYnJvd3Nlci9wdWxsUmVxdWVzdEljb25TdGF0dXMuanMnO1xuaW1wb3J0IHsgSVB1bGxSZXF1ZXN0SWNvbkNhY2hlIH0gZnJvbSAnLi4vLi4vLi4vZ2l0aHViL2Jyb3dzZXIvcHVsbFJlcXVlc3RJY29uQ2FjaGUuanMnO1xuaW1wb3J0IHsgbWFwUHJvdG9jb2xTdGF0dXMgfSBmcm9tICcuL2FnZW50SG9zdERpZmZzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNoYW5nZXNldHMgfSBmcm9tICcuL2FnZW50SG9zdFNlc3Npb25DaGFuZ2VzZXRzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVNlc3Npb25PdXRwdXRPYnMsIElTZXNzaW9uT3V0cHV0T2JzIH0gZnJvbSAnLi9hZ2VudEhvc3RTZXNzaW9uRmlsZXMuanMnO1xuXG5jb25zdCBTVE9SQUdFX0tFWV9SRU1FTUJFUkVEX1NFU1NJT05fQ09ORklHX1ZBTFVFUyA9ICdzZXNzaW9ucy5hZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZ1BpY2tlci5zZWxlY3RlZFZhbHVlcyc7XG5jb25zdCBVTlNBRkVfU0VTU0lPTl9DT05GSUdfS0VZUyA9IG5ldyBTZXQoWydfX3Byb3RvX18nLCAnY29uc3RydWN0b3InLCAncHJvdG90eXBlJ10pO1xuXG4vLyBXZWxsLWtub3duIGNvbmZpZyBjaGlwcyB3aG9zZSBsYXN0LXJlc29sdmVkIHNjaGVtYXMgYXJlIGNhY2hlZCBhbmQgc2VlZGVkIGludG9cbi8vIG5ldyBkcmFmdHMsIHNvIHRoZXkgc3RheSB2aXNpYmxlIChkaXNhYmxlZCkgd2hpbGUgYSBkcmFmdCByZS1yZXNvbHZlcyByYXRoZXJcbi8vIHRoYW4gYmxhbmtpbmcgdGhlbiByZWFwcGVhcmluZy5cbmNvbnN0IFNFRURFRF9DT05GSUdfU0NIRU1BX0tFWVMgPSBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb24sIFNlc3Npb25Db25maWdLZXkuQnJhbmNoXSBhcyBjb25zdDtcblxuLyoqXG4gKiB7QGxpbmsgU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb259IHZhbHVlIHRoYXQgcnVucyBhIHNlc3Npb24gaW4gaXRzIG93biBnaXQgd29ya3RyZWUuXG4gKi9cbmNvbnN0IFdPUktUUkVFX0lTT0xBVElPTl9WQUxVRSA9ICd3b3JrdHJlZSc7XG5cbi8qKiBXaGV0aGVyIHRoZSBnaXZlbiBzZXNzaW9uIGNvbmZpZyB2YWx1ZXMgc2VsZWN0IHdvcmt0cmVlIGlzb2xhdGlvbi4gKi9cbmZ1bmN0aW9uIGlzV29ya3RyZWVJc29sYXRpb24odmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gdmFsdWVzPy5bU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dID09PSBXT1JLVFJFRV9JU09MQVRJT05fVkFMVUU7XG59XG5cbi8qKiBNYXhpbXVtIG51bWJlciBvZiBjYWNoZWQgc2Vzc2lvbiBzdW1tYXJpZXMgcGVyc2lzdGVkIHBlciBwcm92aWRlci4gKi9cbmNvbnN0IENBQ0hFRF9TRVNTSU9OU19NQVhfUEVSX0hPU1QgPSAxMDA7XG5cbi8qKlxuICogU2VyaWFsaXplZCBzaGFwZSBvZiBhbiB7QGxpbmsgSUFnZW50U2Vzc2lvbk1ldGFkYXRhfSBzdWl0YWJsZSBmb3JcbiAqIHBlcnNpc3RpbmcgdmlhIHtAbGluayBJU3RvcmFnZVNlcnZpY2V9LiBVUklzIGFyZSBzdG9yZWQgYXMgc3RyaW5nc1xuICogYW5kIGRpZmZzIGFyZSBpbnRlbnRpb25hbGx5IG9taXR0ZWQgKHRoZXkgYXJlIHJlLXBvcHVsYXRlZCB3aGVuIHRoZVxuICogY29ubmVjdGlvbiByZWZyZXNoZXMgc2Vzc2lvbnMpLlxuICovXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRTZXNzaW9uTWV0YWRhdGEge1xuXHRyZWFkb25seSBzZXNzaW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN0YXJ0VGltZTogbnVtYmVyO1xuXHRyZWFkb25seSBtb2RpZmllZFRpbWU6IG51bWJlcjtcblx0cmVhZG9ubHkgc3VtbWFyeT86IHN0cmluZztcblx0cmVhZG9ubHkgd29ya2luZ0RpcmVjdG9yeT86IHN0cmluZztcblx0LyoqIFNlc3Npb24tc2NvcGVkIGZsYWcgYml0cyBvbmx5IFx1MjAxNCBzZWUge0BsaW5rIFNFU1NJT05fU1RBVFVTX0ZMQUdfTUFTS30uICovXG5cdHJlYWRvbmx5IHN0YXR1cz86IFByb3RvY29sU2Vzc2lvblN0YXR1cztcblx0LyoqIEBkZXByZWNhdGVkIFN1cGVyc2VkZWQgYnkgdGhlIGBJc1JlYWRgIGJpdCBvbiB7QGxpbmsgc3RhdHVzfS4gKi9cblx0cmVhZG9ubHkgaXNSZWFkPzogYm9vbGVhbjtcblx0LyoqIEBkZXByZWNhdGVkIFN1cGVyc2VkZWQgYnkgdGhlIGBJc0FyY2hpdmVkYCBiaXQgb24ge0BsaW5rIHN0YXR1c30uICovXG5cdHJlYWRvbmx5IGlzQXJjaGl2ZWQ/OiBib29sZWFuO1xuXHQvKiogQGRlcHJlY2F0ZWQgTGVnYWN5IG5hbWUgZm9yIGBpc0FyY2hpdmVkYC4gKi9cblx0cmVhZG9ubHkgaXNEb25lPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgcHJvamVjdD86IHsgcmVhZG9ubHkgdXJpOiBzdHJpbmc7IHJlYWRvbmx5IGRpc3BsYXlOYW1lOiBzdHJpbmcgfTtcblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHNlc3Npb24gaXMgYSB3b3Jrc3BhY2UtbGVzcyBxdWljayBjaGF0LiBQZXJzaXN0ZWQgYmVjYXVzZSB0aGVcblx0ICogYWRhcHRlciBzZWVkcyBpdHMgc2Vzc2lvbi1raW5kIGZyb20gdGhpcyB0YWcgYXQgY29uc3RydWN0aW9uIChzZWVcblx0ICoge0BsaW5rIEFnZW50SG9zdFNlc3Npb25BZGFwdGVyfSk7IGRyb3BwaW5nIGl0IG9uIHJlc3RvcmUgd291bGQgbGVhayB0aGVcblx0ICogaG9zdCdzIHNjcmF0Y2ggZGlyIGFzIGEgd29ya3NwYWNlIGZvbGRlciB1bnRpbCB0aGUgbmV4dCBsaXN0aW5nIGFycml2ZXMuXG5cdCAqL1xuXHRyZWFkb25seSB3b3Jrc3BhY2VsZXNzPzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBPbmx5IHRoZXNlIGJpdHMgYXJlIGNhY2hlZC4gVGhlIGFjdGl2aXR5IGJpdHMgYXJlIGxpdmUgc3RhdGUsIGFuZCByZXN0b3JpbmcgdGhlbVxuICogd291bGQgc2hvdyBhIHN0YWxlIHNwaW5uZXIgdW50aWwgdGhlIG5leHQgYGxpc3RTZXNzaW9ucygpYCBsYW5kcyBcdTIwMTQgaW5kZWZpbml0ZWx5XG4gKiBmb3IgYW4gdW5yZWFjaGFibGUgcmVtb3RlIGhvc3QsIHdoaWNoIGtlZXBzIHJlcHVibGlzaGluZyBpdHMgY2FjaGVkIHNuYXBzaG90LlxuICovXG5jb25zdCBTRVNTSU9OX1NUQVRVU19GTEFHX01BU0sgPSBQcm90b2NvbFNlc3Npb25TdGF0dXMuSXNSZWFkIHwgUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklzQXJjaGl2ZWQ7XG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZU1ldGFkYXRhKG1ldGE6IElBZ2VudFNlc3Npb25NZXRhZGF0YSk6IElTZXJpYWxpemVkU2Vzc2lvbk1ldGFkYXRhIHtcblx0cmV0dXJuIHtcblx0XHRzZXNzaW9uOiBtZXRhLnNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRzdGFydFRpbWU6IG1ldGEuc3RhcnRUaW1lLFxuXHRcdG1vZGlmaWVkVGltZTogbWV0YS5tb2RpZmllZFRpbWUsXG5cdFx0c3VtbWFyeTogbWV0YS5zdW1tYXJ5LFxuXHRcdHdvcmtpbmdEaXJlY3Rvcnk6IG1ldGEud29ya2luZ0RpcmVjdG9yaWVzPy5bMF0/LnRvU3RyaW5nKCksXG5cdFx0c3RhdHVzOiBtZXRhLnN0YXR1cyAhPT0gdW5kZWZpbmVkID8gbWV0YS5zdGF0dXMgJiBTRVNTSU9OX1NUQVRVU19GTEFHX01BU0sgOiB1bmRlZmluZWQsXG5cdFx0cHJvamVjdDogbWV0YS5wcm9qZWN0ID8geyB1cmk6IG1ldGEucHJvamVjdC51cmkudG9TdHJpbmcoKSwgZGlzcGxheU5hbWU6IG1ldGEucHJvamVjdC5kaXNwbGF5TmFtZSB9IDogdW5kZWZpbmVkLFxuXHRcdHdvcmtzcGFjZWxlc3M6IHJlYWRTZXNzaW9uV29ya3NwYWNlbGVzcyhtZXRhLl9tZXRhKSB8fCB1bmRlZmluZWQsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGRlc2VyaWFsaXplTWV0YWRhdGEocmF3OiBJU2VyaWFsaXplZFNlc3Npb25NZXRhZGF0YSk6IElBZ2VudFNlc3Npb25NZXRhZGF0YSB8IHVuZGVmaW5lZCB7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlc3Npb246IFVSSS5wYXJzZShyYXcuc2Vzc2lvbiksXG5cdFx0XHRzdGFydFRpbWU6IHJhdy5zdGFydFRpbWUsXG5cdFx0XHRtb2RpZmllZFRpbWU6IHJhdy5tb2RpZmllZFRpbWUsXG5cdFx0XHRzdW1tYXJ5OiByYXcuc3VtbWFyeSxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogcmF3LndvcmtpbmdEaXJlY3RvcnkgPyBbVVJJLnBhcnNlKHJhdy53b3JraW5nRGlyZWN0b3J5KV0gOiB1bmRlZmluZWQsXG5cdFx0XHRzdGF0dXM6IGRlc2VyaWFsaXplU3RhdHVzKHJhdyksXG5cdFx0XHRwcm9qZWN0OiByYXcucHJvamVjdCA/IHsgdXJpOiBVUkkucGFyc2UocmF3LnByb2plY3QudXJpKSwgZGlzcGxheU5hbWU6IHJhdy5wcm9qZWN0LmRpc3BsYXlOYW1lIH0gOiB1bmRlZmluZWQsXG5cdFx0XHQuLi4ocmF3LndvcmtzcGFjZWxlc3MgPyB7IF9tZXRhOiB3aXRoU2Vzc2lvbldvcmtzcGFjZWxlc3ModW5kZWZpbmVkLCB0cnVlKSB9IDoge30pLFxuXHRcdH07XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuLyoqIFJlYWRzIHRoZSBjYWNoZWQgZmxhZyBiaXRzLCBmb2xkaW5nIGluIHRoZSBsZWdhY3kgc3RhbmRhbG9uZSBib29sZWFucy4gKi9cbmZ1bmN0aW9uIGRlc2VyaWFsaXplU3RhdHVzKHJhdzogSVNlcmlhbGl6ZWRTZXNzaW9uTWV0YWRhdGEpOiBQcm90b2NvbFNlc3Npb25TdGF0dXMgfCB1bmRlZmluZWQge1xuXHRjb25zdCBsZWdhY3lBcmNoaXZlZCA9IHJhdy5pc0FyY2hpdmVkID8/IHJhdy5pc0RvbmU7XG5cdGlmIChyYXcuaXNSZWFkID09PSB1bmRlZmluZWQgJiYgbGVnYWN5QXJjaGl2ZWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiByYXcuc3RhdHVzICE9PSB1bmRlZmluZWQgPyByYXcuc3RhdHVzICYgU0VTU0lPTl9TVEFUVVNfRkxBR19NQVNLIDogdW5kZWZpbmVkO1xuXHR9XG5cdGxldCBzdGF0dXMgPSAocmF3LnN0YXR1cyA/PyBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSkgJiBTRVNTSU9OX1NUQVRVU19GTEFHX01BU0s7XG5cdGlmIChyYXcuaXNSZWFkICE9PSB1bmRlZmluZWQpIHtcblx0XHRzdGF0dXMgPSB3aXRoU2Vzc2lvblN0YXR1c0ZsYWcoc3RhdHVzLCBQcm90b2NvbFNlc3Npb25TdGF0dXMuSXNSZWFkLCByYXcuaXNSZWFkKTtcblx0fVxuXHRpZiAobGVnYWN5QXJjaGl2ZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdHN0YXR1cyA9IHdpdGhTZXNzaW9uU3RhdHVzRmxhZyhzdGF0dXMsIFByb3RvY29sU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkLCBsZWdhY3lBcmNoaXZlZCk7XG5cdH1cblx0cmV0dXJuIHN0YXR1cztcbn1cblxuZnVuY3Rpb24gaXNSZW1lbWJlcmVkU2Vzc2lvbkNvbmZpZ0tleShwcm9wZXJ0eTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBwcm9wZXJ0eSAhPT0gU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2ggJiYgIVVOU0FGRV9TRVNTSU9OX0NPTkZJR19LRVlTLmhhcyhwcm9wZXJ0eSk7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZUF1dG9BcHByb3ZlVmFsdWUodmFsdWU6IHVua25vd24sIHBvbGljeVJlc3RyaWN0ZWQ6IGJvb2xlYW4pOiBDaGF0UGVybWlzc2lvbkxldmVsIHwgdW5kZWZpbmVkIHtcblx0Ly8gYEtOT1dOX0FVVE9fQVBQUk9WRV9WQUxVRVNgIGlzIGludGVudGlvbmFsbHkgdG9sZXJhbnQgb2YgbGVnYWN5IHZhbHVlc1xuXHQvLyB0aGF0IGFyZSBub3QgcmVhbCBgQ2hhdFBlcm1pc3Npb25MZXZlbGBzLiBWYWxpZGF0ZSBhZ2FpbnN0IHRoZSBlbnVtIGhlcmVcblx0Ly8gc28gdGhpcyBmdW5jdGlvbiBuZXZlciByZXR1cm5zIGEgdmFsdWUgb3V0c2lkZSBpdHMgZGVjbGFyZWQgY29udHJhY3QuXG5cdGNvbnN0IG5vcm1hbGl6ZWQgPSBnZXRDaGF0UGVybWlzc2lvbkxldmVsRnJvbURlZmF1bHRDb25maWd1cmF0aW9uKHZhbHVlKSA/PyAoaXNDaGF0UGVybWlzc2lvbkxldmVsKHZhbHVlKSA/IHZhbHVlIDogdW5kZWZpbmVkKTtcblx0aWYgKCFub3JtYWxpemVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHQvLyBCeXBhc3MgYW5kIChsZWdhY3kpIEF1dG9waWxvdCBhdXRvLWFwcHJvdmUgYXQgbGVhc3Qgc29tZVxuXHQvLyB0b29sIGNhbGxzLCBzbyBjbGFtcCB0aGVtIHRvIERlZmF1bHQgd2hlbiBlbnRlcnByaXNlIHBvbGljeSBkaXNhYmxlc1xuXHQvLyBnbG9iYWwgYXV0by1hcHByb3ZhbC5cblx0aWYgKHBvbGljeVJlc3RyaWN0ZWQgJiYgbm9ybWFsaXplZCAhPT0gQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0KSB7XG5cdFx0cmV0dXJuIENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdDtcblx0fVxuXHRyZXR1cm4gbm9ybWFsaXplZDtcbn1cblxuZnVuY3Rpb24gaXNHaXRIdWJJbmZvRXF1YWwoYTogSUdpdEh1YkluZm8gfCB1bmRlZmluZWQsIGI6IElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGlmIChhID09PSBiKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRpZiAoYSA9PT0gdW5kZWZpbmVkIHx8IGIgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHJldHVybiBhLm93bmVyID09PSBiLm93bmVyICYmXG5cdFx0YS5yZXBvID09PSBiLnJlcG8gJiZcblx0XHRhLnB1bGxSZXF1ZXN0Py5udW1iZXIgPT09IGIucHVsbFJlcXVlc3Q/Lm51bWJlciAmJlxuXHRcdGEucHVsbFJlcXVlc3Q/Lmljb24/LmlkID09PSBiLnB1bGxSZXF1ZXN0Py5pY29uPy5pZCAmJlxuXHRcdGEucHVsbFJlcXVlc3Q/LmJhc2VSZWZPaWQgPT09IGIucHVsbFJlcXVlc3Q/LmJhc2VSZWZPaWQgJiZcblx0XHRhLnB1bGxSZXF1ZXN0Py5oZWFkUmVmT2lkID09PSBiLnB1bGxSZXF1ZXN0Py5oZWFkUmVmT2lkICYmXG5cdFx0YXJyYXlFcXVhbHMoYS5pc3N1ZXMgPz8gW10sIGIuaXNzdWVzID8/IFtdLCAoeCwgeSkgPT4geC5vd25lciA9PT0geS5vd25lciAmJiB4LnJlcG8gPT09IHkucmVwbyAmJiB4Lm51bWJlciA9PT0geS5udW1iZXIpO1xufVxuXG4vKiogTWFwcyB0aGUgR2l0SHViIGlzc3VlIFVSTHMgcmVjb3JkZWQgb24gdGhlIHNlc3Npb24ncyBtZXRhZGF0YSB0byBpc3N1ZSByZWZlcmVuY2VzLiAqL1xuZnVuY3Rpb24gdG9HaXRIdWJJc3N1ZVJlZnMoaXNzdWVVcmxzOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IHJlYWRvbmx5IElHaXRIdWJJc3N1ZVJlZltdIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcmVmczogSUdpdEh1Yklzc3VlUmVmW10gPSBbXTtcblx0Zm9yIChjb25zdCB1cmwgb2YgaXNzdWVVcmxzID8/IFtdKSB7XG5cdFx0Y29uc3QgcmVmZXJlbmNlID0gcGFyc2VHaXRIdWJJc3N1ZVVybCh1cmwpO1xuXHRcdGlmIChyZWZlcmVuY2UpIHtcblx0XHRcdHJlZnMucHVzaCh7IC4uLnJlZmVyZW5jZSwgdXJpOiBVUkkucGFyc2UodXJsKSB9KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlZnMubGVuZ3RoID4gMCA/IHJlZnMgOiB1bmRlZmluZWQ7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEFnZW50SG9zdFNlc3Npb25BZGFwdGVyIFx1MjAxNCBzaGFyZWQgYWRhcHRlciBmb3IgbG9jYWwgYW5kIHJlbW90ZSBzZXNzaW9uc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKiogQ29waWxvdCBDTEkgc2Vzc2lvbiB0eXBlICovXG5leHBvcnQgY29uc3QgQ29waWxvdENMSVNlc3Npb25UeXBlOiBJU2Vzc2lvblR5cGUgPSB7XG5cdGlkOiAnY29waWxvdGNsaScsXG5cdGxhYmVsOiBsb2NhbGl6ZSgnY29waWxvdENMSScsIFwiQ29waWxvdFwiKSxcblx0aWNvbjogQ29kaWNvbi5jb3BpbG90LFxuXHRzdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbjogdHJ1ZSxcbn07XG5cbi8qKlxuICogU3RyYXRlZ3kgdGhhdCBjYXB0dXJlcyB0aGUgcXVpY2stY2hhdCB2cy4gd29ya3NwYWNlIGRpZmZlcmVuY2VzIG9mIGFuXG4gKiBhZ2VudC1ob3N0IHNlc3Npb24gaW4gb25lIHBsYWNlLCBzbyB0aGUgYWRhcHRlciBhbmQgZHJhZnQgY2xhc3NlcyBkZWxlZ2F0ZSB0b1xuICogaXQgaW5zdGVhZCBvZiByZS1icmFuY2hpbmcgb24gYHJlYWRTZXNzaW9uV29ya3NwYWNlbGVzc2AuIERyYWZ0cyBmaXggdGhlaXJcbiAqIGtpbmQgYXQgY29uc3RydWN0aW9uOyBhZGFwdGVycyBzZWxlY3QgaXQgZnJvbSB0aGVpciBtb25vdG9uaWMgcXVpY2stY2hhdFxuICogc3RhdGUsIHNvIGEgcHJvbW90aW9uIHN3YXBzIHRoZSBzdHJhdGVneS5cbiAqL1xuaW50ZXJmYWNlIElBZ2VudEhvc3RTZXNzaW9uS2luZCB7XG5cdHJlYWRvbmx5IGlzUXVpY2tDaGF0OiBib29sZWFuO1xuXHQvKiogV2hldGhlciB0aGUgc2Vzc2lvbiByZXF1aXJlcyBhIHdvcmtzcGFjZS9yZXBvc2l0b3J5IHRvIGJlIGNvbnN0cnVjdGVkLiAqL1xuXHRyZWFkb25seSByZXF1aXJlc1dvcmtzcGFjZTogYm9vbGVhbjtcblx0LyoqIFVudGl0bGVkIHNrZWxldG9uIHRpdGxlIGJlZm9yZSB0aGUgZmlyc3QgcmVxdWVzdCBjb21taXRzIHRoZSBzZXNzaW9uLiAqL1xuXHRyZWFkb25seSB1bnRpdGxlZFRpdGxlOiBzdHJpbmc7XG5cdGNvbXB1dGVXb3Jrc3BhY2UoYnVpbGRXb3Jrc3BhY2U6ICgpID0+IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkKTogSVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ7XG59XG5cbmNvbnN0IFdvcmtzcGFjZVNlc3Npb25LaW5kOiBJQWdlbnRIb3N0U2Vzc2lvbktpbmQgPSB7XG5cdGlzUXVpY2tDaGF0OiBmYWxzZSxcblx0cmVxdWlyZXNXb3Jrc3BhY2U6IHRydWUsXG5cdGdldCB1bnRpdGxlZFRpdGxlKCkgeyByZXR1cm4gbG9jYWxpemUoJ25ldyBzZXNzaW9uJywgXCJOZXcgU2Vzc2lvblwiKTsgfSxcblx0Y29tcHV0ZVdvcmtzcGFjZTogYnVpbGRXb3Jrc3BhY2UgPT4gYnVpbGRXb3Jrc3BhY2UoKSxcbn07XG5cbmNvbnN0IFF1aWNrQ2hhdFNlc3Npb25LaW5kOiBJQWdlbnRIb3N0U2Vzc2lvbktpbmQgPSB7XG5cdGlzUXVpY2tDaGF0OiB0cnVlLFxuXHRyZXF1aXJlc1dvcmtzcGFjZTogZmFsc2UsXG5cdGdldCB1bnRpdGxlZFRpdGxlKCkgeyByZXR1cm4gbG9jYWxpemUoJ25ldyBjaGF0JywgXCJOZXcgQ2hhdFwiKTsgfSxcblx0Y29tcHV0ZVdvcmtzcGFjZTogKCkgPT4gdW5kZWZpbmVkLFxufTtcblxuZnVuY3Rpb24gc2Vzc2lvbktpbmQoaXNRdWlja0NoYXQ6IGJvb2xlYW4pOiBJQWdlbnRIb3N0U2Vzc2lvbktpbmQge1xuXHRyZXR1cm4gaXNRdWlja0NoYXQgPyBRdWlja0NoYXRTZXNzaW9uS2luZCA6IFdvcmtzcGFjZVNlc3Npb25LaW5kO1xufVxuXG4vKipcbiAqIFZhcmlhdGlvbiBwb2ludHMgdGhlIGhvc3QgcHJvdmlkZXIgc3VwcGxpZXMgd2hlbiBidWlsZGluZyBhbiBhZGFwdGVyLlxuICogRGlmZmVyZW5jZXMgYmV0d2VlbiBsb2NhbCBhbmQgcmVtb3RlIHNlc3Npb25zIChpY29uLCBkZXNjcmlwdGlvbiB0ZXh0LFxuICogd29ya3NwYWNlIGJ1aWxkZXIsIG9wdGlvbmFsIFVSSSBtYXBwaW5nKSBmbG93IHRocm91Z2ggdGhpcyBvcHRpb25zIGJhZyBzb1xuICogdGhlIGFkYXB0ZXIgaXRzZWxmIHN0YXlzIGEgc2luZ2xlIGNvbmNyZXRlIGNsYXNzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RBZGFwdGVyT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbjtcblx0LyoqIExvYWRpbmcgb2JzZXJ2YWJsZSB3aXJlZCB0byB0aGUgcHJvdmlkZXIncyBhdXRoZW50aWNhdGlvbi1wZW5kaW5nIHN0YXRlLiAqL1xuXHRyZWFkb25seSBsb2FkaW5nOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0LyoqIEJ1aWxkcyB0aGUgc2Vzc2lvbiB3b3Jrc3BhY2UgZnJvbSBzZXNzaW9uIG1ldGFkYXRhOyBwcm92aWRlci1zcGVjaWZpYyAoaWNvbiwgcHJvdmlkZXJMYWJlbCwgcmVxdWlyZXNXb3Jrc3BhY2VUcnVzdCkuICovXG5cdHJlYWRvbmx5IGJ1aWxkV29ya3NwYWNlOiAocHJvamVjdDogSUFnZW50U2Vzc2lvbk1ldGFkYXRhWydwcm9qZWN0J10sIHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQsIGdpdEh1YkluZm86IElPYnNlcnZhYmxlPElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkPiwgZ2l0U3RhdGU6IElTZXNzaW9uR2l0U3RhdGUgfCB1bmRlZmluZWQpID0+IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkO1xuXHQvKiogT3B0aW9uYWwgVVJJIG1hcHBpbmcgZm9yIGRpZmYgZW50cmllcyAocmVtb3RlIHVzZXMgYHRvQWdlbnRIb3N0VXJpYDsgbG9jYWwgdXNlcyBpZGVudGl0eSkuICovXG5cdHJlYWRvbmx5IG1hcERpZmZVcmk/OiAodXJpOiBVUkkpID0+IFVSSTtcblx0LyoqXG5cdCAqIEdpdEh1YiBzZXJ2aWNlIHVzZWQgdG8gcmVzb2x2ZSB0aGUgcHVsbCByZXF1ZXN0IHRoYXQgdGFyZ2V0cyB0aGVcblx0ICogc2Vzc2lvbidzIGJyYW5jaCBhbmQgcmVmcmVzaCBpdHMgbGl2ZSBzdGF0ZS4gT3B0aW9uYWwgc28gdGVzdHMgLyBob3N0c1xuXHQgKiB3aXRob3V0IGEgd29ya2JlbmNoIEdpdEh1YiBzZXJ2aWNlIHN0aWxsIGNvbnN0cnVjdCBhZGFwdGVyczsgUFJcblx0ICogYWZmb3JkYW5jZXMgc2ltcGx5IHN0YXkgZG9ybWFudCB3aGVuIGFic2VudC5cblx0ICovXG5cdHJlYWRvbmx5IGdpdEh1YlNlcnZpY2U/OiBJR2l0SHViU2VydmljZTtcblx0LyoqXG5cdCAqIEluc3RhbnRpYXRpb24gc2VydmljZSB1c2VkIHRvIGNvbnN0cnVjdCB0aGUgc2Vzc2lvbidzIGNoYW5nZXNldFxuXHQgKiByZXNvbHZlcnMuIFNoYXJlZCB3aXRoIHRoZSBDb3BpbG90IGNoYXQgc2Vzc2lvbnMgcHJvdmlkZXIgc28gYWxsXG5cdCAqIGFnZW50LWhvc3Qgc2Vzc2lvbnMgc3VyZmFjZSB0aGUgc2FtZSBzZXQgb2YgY2hhbmdlc2V0cy5cblx0ICovXG5cdHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBhZ2VudCBjb25uZWN0aW9uIGZvciB0aGUgc2Vzc2lvbiwgaWYgaXQgZXhpc3RzLlxuXHQgKi9cblx0cmVhZG9ubHkgZ2V0Q29ubmVjdGlvbjogKCkgPT4gSUFnZW50Q29ubmVjdGlvbiB8IHVuZGVmaW5lZDtcblx0LyoqIEFnZW50IGNhcGFiaWxpdHkgbG9va3VwIHNoYXJlZCBieSBldmVyeSBhZGFwdGVyIG93bmVkIGJ5IHRoaXMgcHJvdmlkZXIuICovXG5cdHJlYWRvbmx5IGFnZW50Q2FwYWJpbGl0aWVzOiBJT2JzZXJ2YWJsZTxSZWFkb25seU1hcDxzdHJpbmcsIEFnZW50Q2FwYWJpbGl0aWVzIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZD47XG5cdC8qKlxuXHQgKiBUaGUgc2NoZW1lIHRoZSBob3N0IGFkZHJlc3NlcyB0aGlzIHNlc3Npb24gdW5kZXIsIHdoZW4gaXQgZGlmZmVycyBmcm9tIHRoZSBhZ2VudCBwcm92aWRlclxuXHQgKiAoY2xvdWQgc2FuZGJveDogcHJvdmlkZXIgYGNvcGlsb3RgLCBzZXNzaW9ucyBgYWhwLXNlc3Npb246LzxpZD5gKS4gRGVmYXVsdHMgdG8gdGhlIHByb3ZpZGVyLlxuXHQgKi9cblx0cmVhZG9ubHkgYmFja2VuZFNlc3Npb25TY2hlbWU/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogTWFwcyB0aGUgcHJvdG9jb2wge0BsaW5rIFByb3RvY29sQ2hhdEludGVyYWN0aXZpdHl9IHRvIHRoZSBwcm92aWRlci1hZ25vc3RpY1xuICoge0BsaW5rIENoYXRJbnRlcmFjdGl2aXR5fS4gQWJzZW50IGludGVyYWN0aXZpdHkgZGVmYXVsdHMgdG8ge0BsaW5rXG4gKiBDaGF0SW50ZXJhY3Rpdml0eS5GdWxsfSBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eS5cbiAqL1xuZnVuY3Rpb24gdG9DaGF0SW50ZXJhY3Rpdml0eShpbnRlcmFjdGl2aXR5OiBQcm90b2NvbENoYXRJbnRlcmFjdGl2aXR5IHwgdW5kZWZpbmVkKTogQ2hhdEludGVyYWN0aXZpdHkge1xuXHRzd2l0Y2ggKGludGVyYWN0aXZpdHkpIHtcblx0XHRjYXNlIFByb3RvY29sQ2hhdEludGVyYWN0aXZpdHkuUmVhZE9ubHk6XG5cdFx0XHRyZXR1cm4gQ2hhdEludGVyYWN0aXZpdHkuUmVhZE9ubHk7XG5cdFx0Y2FzZSBQcm90b2NvbENoYXRJbnRlcmFjdGl2aXR5LkhpZGRlbjpcblx0XHRcdHJldHVybiBDaGF0SW50ZXJhY3Rpdml0eS5IaWRkZW47XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBDaGF0SW50ZXJhY3Rpdml0eS5GdWxsO1xuXHR9XG59XG5cbi8qKlxuICogQSBub24tZGVmYXVsdCBwZWVyIGNoYXQgd2l0aGluIGFuIHtAbGluayBBZ2VudEhvc3RTZXNzaW9uQWRhcHRlcn0uIEhvbGRzIGl0c1xuICogb3duIG9ic2VydmFibGVzIHNlZWRlZCBmcm9tIHRoZSBwcm90b2NvbCB7QGxpbmsgQ2hhdFN1bW1hcnl9IHNvIHRoZSBjaGF0IHRhYlxuICogcmVuZGVycyB0aGUgY2hhdCdzIG93biB0aXRsZS9zdGF0dXMvYWN0aXZpdHkgaW5kZXBlbmRlbnRseSBvZiB0aGUgYWdncmVnYXRlZFxuICogc2Vzc2lvbi1sZXZlbCBzdGF0ZS4gVGhlIHtAbGluayBJQ2hhdC5yZXNvdXJjZX0gY2FycmllcyB0aGUgY2hhdElkIGluIGl0cyBVUklcbiAqIGZyYWdtZW50IHNvIHRoZSBjaGF0IHZpZXcgb3BlbnMgYSBkaXN0aW5jdCB3aWRnZXQgcGVyIHBlZXIgY2hhdC5cbiAqL1xuY2xhc3MgQWRkaXRpb25hbENoYXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBjaGF0OiBJQ2hhdDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90aXRsZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0dXM6IElTZXR0YWJsZU9ic2VydmFibGU8U2Vzc2lvblN0YXR1cz47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZWRBdDogSVNldHRhYmxlT2JzZXJ2YWJsZTxEYXRlPjtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxJZDogSVNldHRhYmxlT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlOiBJU2V0dGFibGVPYnNlcnZhYmxlPHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZXNjcmlwdGlvbjogSVNldHRhYmxlT2JzZXJ2YWJsZTxJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXN0VHVybkVuZDogSVNldHRhYmxlT2JzZXJ2YWJsZTxEYXRlIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaW50ZXJhY3Rpdml0eTogSVNldHRhYmxlT2JzZXJ2YWJsZTxDaGF0SW50ZXJhY3Rpdml0eT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzTmV3OiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKHJlc291cmNlOiBVUkksIHN1bW1hcnk6IENoYXRTdW1tYXJ5LCBpc05ldzogYm9vbGVhbiA9IGZhbHNlLCBwYXJlbnRDaGF0PzogVVJJLCBzZXNzaW9uSXNBcmNoaXZlZDogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSBjb25zdE9ic2VydmFibGUoZmFsc2UpLCBsYXN0VHVybkNoYW5nZXM/OiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT4pIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IG1vZGlmaWVkQXQgPSBzdW1tYXJ5Lm1vZGlmaWVkQXQgPyBuZXcgRGF0ZShzdW1tYXJ5Lm1vZGlmaWVkQXQpIDogbmV3IERhdGUoKTtcblx0XHR0aGlzLl90aXRsZSA9IG9ic2VydmFibGVWYWx1ZSgnY2hhdFRpdGxlJywgc3VtbWFyeS50aXRsZSB8fCBsb2NhbGl6ZSgnbmV3Q2hhdFRhYicsIFwiTmV3IENoYXRcIikpO1xuXHRcdHRoaXMuX3N0YXR1cyA9IG9ic2VydmFibGVWYWx1ZTxTZXNzaW9uU3RhdHVzPignY2hhdFN0YXR1cycsIG1hcFByb3RvY29sU3RhdHVzKHN1bW1hcnkuc3RhdHVzKSk7XG5cdFx0dGhpcy5fdXBkYXRlZEF0ID0gb2JzZXJ2YWJsZVZhbHVlKCdjaGF0VXBkYXRlZEF0JywgbW9kaWZpZWRBdCk7XG5cdFx0dGhpcy5fbW9kZWxJZCA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KCdjaGF0TW9kZWxJZCcsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fbW9kZSA9IG9ic2VydmFibGVWYWx1ZTx7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IGtpbmQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkPignY2hhdE1vZGUnLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2Rlc2NyaXB0aW9uID0gb2JzZXJ2YWJsZVZhbHVlPElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZD4oJ2NoYXREZXNjcmlwdGlvbicsIHN1bW1hcnkuYWN0aXZpdHkgPyBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KHN1bW1hcnkuYWN0aXZpdHkpIDogdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9sYXN0VHVybkVuZCA9IG9ic2VydmFibGVWYWx1ZTxEYXRlIHwgdW5kZWZpbmVkPignY2hhdExhc3RUdXJuRW5kJywgbW9kaWZpZWRBdCk7XG5cdFx0dGhpcy5faW50ZXJhY3Rpdml0eSA9IG9ic2VydmFibGVWYWx1ZTxDaGF0SW50ZXJhY3Rpdml0eT4oJ2NoYXRJbnRlcmFjdGl2aXR5JywgdG9DaGF0SW50ZXJhY3Rpdml0eShzdW1tYXJ5LmludGVyYWN0aXZpdHkpKTtcblx0XHR0aGlzLl9pc05ldyA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignY2hhdElzTmV3JywgaXNOZXcpO1xuXHRcdHRoaXMuY2hhdCA9IHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0Y3JlYXRlZEF0OiBtb2RpZmllZEF0LFxuXHRcdFx0dGl0bGU6IHRoaXMuX3RpdGxlLFxuXHRcdFx0dXBkYXRlZEF0OiB0aGlzLl91cGRhdGVkQXQsXG5cdFx0XHRzdGF0dXM6IGRlcml2ZWQocmVhZGVyID0+IHRoaXMuX2lzTmV3LnJlYWQocmVhZGVyKSA/IFNlc3Npb25TdGF0dXMuVW50aXRsZWQgOiB0aGlzLl9zdGF0dXMucmVhZChyZWFkZXIpKSxcblx0XHRcdGNoYW5nZXM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0XHRsYXN0VHVybkNoYW5nZXMsXG5cdFx0XHRjaGVja3BvaW50czogb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHVuZGVmaW5lZCksXG5cdFx0XHRtb2RlbElkOiB0aGlzLl9tb2RlbElkLFxuXHRcdFx0bW9kZTogdGhpcy5fbW9kZSxcblx0XHRcdGlzQXJjaGl2ZWQ6IHNlc3Npb25Jc0FyY2hpdmVkLFxuXHRcdFx0aXNSZWFkOiBjb25zdE9ic2VydmFibGUodHJ1ZSksXG5cdFx0XHQvLyBBbiBhcmNoaXZlZCBzZXNzaW9uIGlzIHJlYWQtb25seTogZm9yY2UgZXZlcnkgY2hhdCdzIGludGVyYWN0aXZpdHkgdG9cblx0XHRcdC8vIFJlYWRPbmx5IHNvIHRoZSBjaGF0IHZpZXcgaGlkZXMgdGhlIGNvbXBvc2VyIGFuZCBnYXRlcyBtdXRhdGluZyBhY3Rpb25zLlxuXHRcdFx0aW50ZXJhY3Rpdml0eTogZGVyaXZlZChyZWFkZXIgPT4gZWZmZWN0aXZlQ2hhdEludGVyYWN0aXZpdHkoc2Vzc2lvbklzQXJjaGl2ZWQucmVhZChyZWFkZXIpLCB0aGlzLl9pbnRlcmFjdGl2aXR5LnJlYWQocmVhZGVyKSkpLFxuXHRcdFx0ZGVzY3JpcHRpb246IHRoaXMuX2Rlc2NyaXB0aW9uLFxuXHRcdFx0bGFzdFR1cm5FbmQ6IHRoaXMuX2xhc3RUdXJuRW5kLFxuXHRcdFx0b3JpZ2luOiBzdW1tYXJ5Lm9yaWdpbiA/IHtcblx0XHRcdFx0a2luZDogdG9TZXNzaW9uQ2hhdE9yaWdpbktpbmQoc3VtbWFyeS5vcmlnaW4ua2luZCksXG5cdFx0XHRcdHBhcmVudENoYXQsXG5cdFx0XHRcdC4uLihzdW1tYXJ5Lm9yaWdpbi5raW5kID09PSBQcm90b2NvbENoYXRPcmlnaW5LaW5kLlNpZGVDaGF0ICYmIHN1bW1hcnkub3JpZ2luLnNlbGVjdGlvbiA/IHsgc2VsZWN0aW9uOiB0b1Nlc3Npb25TaWRlQ2hhdFNlbGVjdGlvbihzdW1tYXJ5Lm9yaWdpbi5zZWxlY3Rpb24pIH0gOiB7fSksXG5cdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0Ly8gU3ViYWdlbnQgKHRvb2wtb3JpZ2luKSB3b3JrZXIgY2hhdHMgYXJlIHRyYW5zaWVudCBjaGlsZHJlbiBhbmQgY2FuIGJlXG5cdFx0XHQvLyBuZWl0aGVyIHJlbmFtZWQgbm9yIGRlbGV0ZWQ7IG90aGVyIHBlZXIgY2hhdHMgYXJlIGZ1bGx5IG1hbmFnZWFibGUuXG5cdFx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZTxJQ2hhdENhcGFiaWxpdGllcz4oXG5cdFx0XHRcdHN1bW1hcnkub3JpZ2luPy5raW5kID09PSBQcm90b2NvbENoYXRPcmlnaW5LaW5kLlRvb2xcblx0XHRcdFx0XHQ/IHsgY2FuUmVuYW1lOiBmYWxzZSwgY2FuRGVsZXRlOiBmYWxzZSB9XG5cdFx0XHRcdFx0OiBERUZBVUxUX0NIQVRfQ0FQQUJJTElUSUVTKSxcblx0XHR9O1xuXHR9XG5cblx0dXBkYXRlKHN1bW1hcnk6IENoYXRTdW1tYXJ5KTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kaWZpZWRBdCA9IHN1bW1hcnkubW9kaWZpZWRBdCA/IG5ldyBEYXRlKHN1bW1hcnkubW9kaWZpZWRBdCkgOiB0aGlzLl91cGRhdGVkQXQuZ2V0KCk7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0dGhpcy5fdGl0bGUuc2V0KHN1bW1hcnkudGl0bGUgfHwgbG9jYWxpemUoJ25ld0NoYXRUYWInLCBcIk5ldyBDaGF0XCIpLCB0eCk7XG5cdFx0XHR0aGlzLl9zdGF0dXMuc2V0KG1hcFByb3RvY29sU3RhdHVzKHN1bW1hcnkuc3RhdHVzKSwgdHgpO1xuXHRcdFx0dGhpcy5fdXBkYXRlZEF0LnNldChtb2RpZmllZEF0LCB0eCk7XG5cdFx0XHR0aGlzLl9kZXNjcmlwdGlvbi5zZXQoc3VtbWFyeS5hY3Rpdml0eSA/IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQoc3VtbWFyeS5hY3Rpdml0eSkgOiB1bmRlZmluZWQsIHR4KTtcblx0XHRcdHRoaXMuX2xhc3RUdXJuRW5kLnNldChtb2RpZmllZEF0LCB0eCk7XG5cdFx0XHR0aGlzLl9pbnRlcmFjdGl2aXR5LnNldCh0b0NoYXRJbnRlcmFjdGl2aXR5KHN1bW1hcnkuaW50ZXJhY3Rpdml0eSksIHR4KTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKiBPcHRpbWlzdGljYWxseSB1cGRhdGUgdGhlIGNoYXQgdGl0bGUgYWhlYWQgb2YgdGhlIGhvc3QncyBgY2hhdFVwZGF0ZWRgLiAqL1xuXHRzZXRUaXRsZSh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdGl0bGUuc2V0KHRpdGxlIHx8IGxvY2FsaXplKCduZXdDaGF0VGFiJywgXCJOZXcgQ2hhdFwiKSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKiBQcmVzZW50IGFzIGBVbnRpdGxlZGAgdW50aWwgdGhlIGZpcnN0IHJlcXVlc3QgaXMgc2VudCBzbyB0aGUgdmlldyBzaG93cyB0aGUgY29tcG9zZXIuICovXG5cdG1hcmtOZXcoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNOZXcuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKiogQ2xlYXIgdGhlIGBuZXdgIHByZXNlbnRhdGlvbiBhZnRlciB0aGUgZmlyc3QgcmVxdWVzdCBpcyBzZW50LiAqL1xuXHRtYXJrU2VudCgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc05ldy5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRNb2RlbElkKG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsSWQuc2V0KG1vZGVsSWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRBZ2VudChhZ2VudDogSVNlc3Npb25BZ2VudFJlZiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGUuc2V0KGFnZW50ID8geyBpZDogYWdlbnQudXJpLCBraW5kOiBBR0VOVF9NT0RFX0tJTkQgfSA6IHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxufVxuXG4vKipcbiAqIEFkYXB0cyBhbiB7QGxpbmsgSUFnZW50U2Vzc2lvbk1ldGFkYXRhfSBpbnRvIGFuIHtAbGluayBJU2Vzc2lvbn0gZm9yIHRoZVxuICogc2Vzc2lvbnMgVUkuIEEgc2luZ2xlIGNvbmNyZXRlIGNsYXNzIGZvciBib3RoIGxvY2FsIGFuZCByZW1vdGUgYWdlbnRcbiAqIGhvc3RzIFx1MjAxNCB2YXJpYXRpb24gZmxvd3MgdGhyb3VnaCB7QGxpbmsgSUFnZW50SG9zdEFkYXB0ZXJPcHRpb25zfS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRvU2Vzc2lvbkNoYXRPcmlnaW5LaW5kKGtpbmQ6IHN0cmluZyk6IENoYXRPcmlnaW5LaW5kIHtcblx0c3dpdGNoIChraW5kKSB7XG5cdFx0Y2FzZSBDaGF0T3JpZ2luS2luZC5Ub29sOlxuXHRcdFx0cmV0dXJuIENoYXRPcmlnaW5LaW5kLlRvb2w7XG5cdFx0Y2FzZSBDaGF0T3JpZ2luS2luZC5Gb3JrOlxuXHRcdFx0cmV0dXJuIENoYXRPcmlnaW5LaW5kLkZvcms7XG5cdFx0Y2FzZSBDaGF0T3JpZ2luS2luZC5TaWRlQ2hhdDpcblx0XHRcdHJldHVybiBDaGF0T3JpZ2luS2luZC5TaWRlQ2hhdDtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIENoYXRPcmlnaW5LaW5kLlVzZXI7XG5cdH1cbn1cblxuZnVuY3Rpb24gdG9TZXNzaW9uU2lkZUNoYXRTZWxlY3Rpb24oc2VsZWN0aW9uOiB7IHRleHQ6IHN0cmluZzsgcmVzcG9uc2VQYXJ0SWQ/OiBzdHJpbmcgfSk6IElTaWRlQ2hhdFNlbGVjdGlvbiB7XG5cdHJldHVybiB7XG5cdFx0dGV4dDogc2VsZWN0aW9uLnRleHQsXG5cdFx0Li4uKHNlbGVjdGlvbi5yZXNwb25zZVBhcnRJZCA/IHsgcmVzcG9uc2VQYXJ0SWQ6IHNlbGVjdGlvbi5yZXNwb25zZVBhcnRJZCB9IDoge30pLFxuXHR9O1xufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0U2Vzc2lvbkFkYXB0ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVNlc3Npb24ge1xuXG5cdHJlYWRvbmx5IHNlc3Npb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBwcm92aWRlcklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb25UeXBlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbjtcblx0cmVhZG9ubHkgY3JlYXRlZEF0OiBEYXRlO1xuXHRyZWFkb25seSB3b3Jrc3BhY2U6IElTZXR0YWJsZU9ic2VydmFibGU8SVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBpc1F1aWNrQ2hhdDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdC8qKiBTZWUge0BsaW5rIElTZXNzaW9uLndvcmt0cmVlUGVuZGluZ30uICovXG5cdHJlYWRvbmx5IHdvcmt0cmVlUGVuZGluZzogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IHRpdGxlOiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZz47XG5cdHJlYWRvbmx5IHVwZGF0ZWRBdDogSVNldHRhYmxlT2JzZXJ2YWJsZTxEYXRlPjtcblx0cmVhZG9ubHkgc3RhdHVzOiBJU2V0dGFibGVPYnNlcnZhYmxlPFNlc3Npb25TdGF0dXM+O1xuXHRyZWFkb25seSBjaGFuZ2VzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSAoSUNoYXRTZXNzaW9uRmlsZUNoYW5nZSB8IElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyKVtdPjtcblx0cmVhZG9ubHkgY2hhbmdlc2V0czogSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkNoYW5nZXNldFtdIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgZXh0ZXJuYWxDaGFuZ2VzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVbXT47XG5cdHJlYWRvbmx5IG1vZGVsSWQ6IElTZXR0YWJsZU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0bW9kZWxTZWxlY3Rpb246IE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBtb2RlOiBJU2V0dGFibGVPYnNlcnZhYmxlPHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBsb2FkaW5nOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgaXNBcmNoaXZlZCA9IG9ic2VydmFibGVWYWx1ZSgnaXNBcmNoaXZlZCcsIGZhbHNlKTtcblx0Ly8gUmVhZC91bnJlYWQgc3RhdGUgaXMgb3duZWQgYnkgdGhlIHByb3ZpZGVyIGFuZCBiYWNrZWQgYnkgdGhlIGFnZW50IGhvc3Rcblx0Ly8gcHJvdG9jb2wncyBgSXNSZWFkYCBzdGF0dXMgYml0IChwZXJzaXN0ZWQgYXMgc2Vzc2lvbiBtZXRhZGF0YSkuIEl0IGlzXG5cdC8vIHNlZWRlZCBmcm9tIHRoZSBzZXNzaW9uIG1ldGFkYXRhLCBrZXB0IGluIHN5bmMgd2l0aCBwcm90b2NvbCB1cGRhdGVzLCBhbmRcblx0Ly8gbXV0YXRlZCB2aWEge0BsaW5rIEJhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLnNldFNlc3Npb25SZWFkU3RhdGV9LlxuXHRyZWFkb25seSBpc1JlYWQgPSBvYnNlcnZhYmxlVmFsdWUoJ2lzUmVhZCcsIHRydWUpO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogSU9ic2VydmFibGU8SU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgbGFzdFR1cm5FbmQ6IElTZXR0YWJsZU9ic2VydmFibGU8RGF0ZSB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IGdpdEh1YkluZm86IElPYnNlcnZhYmxlPElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkPjtcblxuXHRyZWFkb25seSBtYWluQ2hhdDogSU9ic2VydmFibGU8SUNoYXQ+O1xuXHRyZWFkb25seSBjaGF0czogSU9ic2VydmFibGU8cmVhZG9ubHkgSUNoYXRbXT47XG5cdC8qKlxuXHQgKiBDYXBhYmlsaXRpZXMgZGVyaXZlZCByZWFjdGl2ZWx5IGZyb20gdGhlIGNvbm5lY3Rpb24ncyByb290IHN0YXRlIHJhdGhlclxuXHQgKiB0aGFuIHNuYXBzaG90dGVkIGF0IGNvbnN0cnVjdGlvbiB0aW1lLiBUaGUgcm9vdCBzdGF0ZSBjYW4gc3RpbGwgYmUgbG9hZGluZ1xuXHQgKiB3aGVuIGFuIGFkYXB0ZXIgaXMgYnVpbHQgKHRoZSBhZ2VudC1ob3N0IHByb2Nlc3MgbWF5IGJlIHN0YXJ0aW5nKSwgaW4gd2hpY2hcblx0ICogY2FzZSB0aGUgYWdlbnQncyBhZHZlcnRpc2VkIGNhcGFiaWxpdGllcyBhcmUgbm90IHlldCBhdmFpbGFibGU7IHRoZSBkZXJpdmVkXG5cdCAqIHJlLWVtaXRzIChhbmQgZHJpdmVzIHRoZSBjaGF0IGNhdGFsb2cgLyBjb250ZXh0IGtleXMpIGFzIHNvb24gYXMgdGhlIHJvb3Rcblx0ICogc3RhdGUgYXJyaXZlcyBpbnN0ZWFkIG9mIGJlaW5nIHBlcm1hbmVudGx5IGZyb3plbiB0byB0aGUgYGZhbHNlYCBkZWZhdWx0cy5cblx0ICogYHN1cHBvcnRzUmVuYW1lYC9gc3VwcG9ydHNEZWxldGVgIGFyZSBhbHdheXMgc3VwcG9ydGVkIGZvciBhZ2VudC1ob3N0XG5cdCAqIHNlc3Npb25zLlxuXHQgKi9cblx0cmVhZG9ubHkgY2FwYWJpbGl0aWVzOiBJT2JzZXJ2YWJsZTxJU2Vzc2lvbkNhcGFiaWxpdGllcz47XG5cblx0LyoqXG5cdCAqIFRoZSBkZWZhdWx0IGNoYXQgKHJlc291cmNlID09IHRoaXMgc2Vzc2lvbidzIHJlc291cmNlKS4gQWx3YXlzIHByZXNlbnQ7XG5cdCAqIGZvciBzaW5nbGUtY2hhdCBzZXNzaW9ucyBpdCBpcyB0aGUgb25seSBjaGF0IGFuZCBgY2hhdHMgPT09IFtpdF1gLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdENoYXQ6IElDaGF0O1xuXHQvKipcblx0ICogVGhlIHNlc3Npb24ncyBsaXZlIG91dHB1dCBvYnNlcnZhYmxlcyAoZXh0ZXJuYWwgZmlsZXMgKyBwZXItY2hhdCBsYXN0LXR1cm5cblx0ICogY2hhbmdlcyksIHBhcnNlZCBvbmNlIGZyb20gdGhlIGFjdGl2ZS1zZXNzaW9uIHN1YnNjcmlwdGlvbnMgYW5kIHNoYXJlZCBieVxuXHQgKiB0aGUgZGVmYXVsdCBjaGF0IGFuZCBldmVyeSBwZWVyIGNoYXQgc28gZWFjaCBjaGF0J3Mgc3RhdHVzIHBpbGxzIHJlZmxlY3Rcblx0ICogdGhhdCBjaGF0J3Mgb3duIGxhc3QgdHVybi5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25PdXRwdXQ6IElTZXNzaW9uT3V0cHV0T2JzO1xuXHQvKipcblx0ICogSW5kZXBlbmRlbnQgdGl0bGUgb3ZlcnJpZGUgZm9yIHRoZSBkZWZhdWx0IGNoYXQgdGFiLiBgdW5kZWZpbmVkYCBtZWFucyB0aGVcblx0ICogZGVmYXVsdCBjaGF0IGluaGVyaXRzIHRoZSBzZXNzaW9uIHRpdGxlOyBhIG5vbi1lbXB0eSB2YWx1ZSBtZWFucyB0aGUgdXNlclxuXHQgKiAob3IgaG9zdCkgcmVuYW1lZCB0aGUgZGVmYXVsdCBjaGF0IGluZGVwZW5kZW50bHkgb2YgdGhlIHNlc3Npb24uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0Q2hhdFRpdGxlT3ZlcnJpZGUgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPignZGVmYXVsdENoYXRUaXRsZU92ZXJyaWRlJywgdW5kZWZpbmVkKTtcblx0LyoqXG5cdCAqIEluZGVwZW5kZW50IHN0YXR1cyBvdmVycmlkZSBmb3IgdGhlIGRlZmF1bHQgY2hhdCB0YWIuIGB1bmRlZmluZWRgIG1lYW5zIHRoZVxuXHQgKiBkZWZhdWx0IGNoYXQgcmVmbGVjdHMgdGhlIGFnZ3JlZ2F0ZWQgc2Vzc2lvbiBzdGF0dXMgKHRoZSBzaW5nbGUtY2hhdCBjYXNlLFxuXHQgKiB3aGVyZSB0aGV5IGFyZSBlcXVpdmFsZW50KTsgYSBkZWZpbmVkIHZhbHVlIG1lYW5zIGEgbXVsdGktY2hhdCBzZXNzaW9uLCBzb1xuXHQgKiB0aGUgZGVmYXVsdCBjaGF0IHNob3dzIGl0cyBvd24gc3RhdHVzIHJhdGhlciB0aGFuIHRoZSBzZXNzaW9uIGFnZ3JlZ2F0ZVxuXHQgKiAod2hpY2ggbWF5IGhhdmUgYmVlbiBwcm9tb3RlZCBieSBhIHJ1bm5pbmcgcGVlciBjaGF0KS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlZmF1bHRDaGF0U3RhdHVzT3ZlcnJpZGUgPSBvYnNlcnZhYmxlVmFsdWU8U2Vzc2lvblN0YXR1cyB8IHVuZGVmaW5lZD4oJ2RlZmF1bHRDaGF0U3RhdHVzT3ZlcnJpZGUnLCB1bmRlZmluZWQpO1xuXHQvKiogV2hldGhlciB0aGlzIHNlc3Npb24gd2FzIGNyZWF0ZWQgd2l0aCB3b3JrdHJlZSBpc29sYXRpb24uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmt0cmVlSXNvbGF0aW9uID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCd3b3JrdHJlZUlzb2xhdGlvbicsIGZhbHNlKTtcblx0LyoqIEludGVyYWN0aXZpdHkgb2YgdGhlIGRlZmF1bHQgY2hhdC4gRHJpdmVuIGZyb20gdGhlIGRlZmF1bHQgY2hhdCdzIHByb3RvY29sIHN1bW1hcnkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlZmF1bHRDaGF0SW50ZXJhY3Rpdml0eSA9IG9ic2VydmFibGVWYWx1ZTxDaGF0SW50ZXJhY3Rpdml0eT4oJ2RlZmF1bHRDaGF0SW50ZXJhY3Rpdml0eScsIENoYXRJbnRlcmFjdGl2aXR5LkZ1bGwpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tYWluQ2hhdE9iczogSVNldHRhYmxlT2JzZXJ2YWJsZTxJQ2hhdD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRzT2JzOiBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IElDaGF0W10+O1xuXHQvKiogQWRkaXRpb25hbCAobm9uLWRlZmF1bHQpIHBlZXIgY2hhdHMga2V5ZWQgYnkgY2hhdElkLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hZGRpdGlvbmFsQ2hhdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIEFkZGl0aW9uYWxDaGF0PigpKTtcblx0LyoqIENoYXQgaWRzIHRoYXQgaGF2ZSBub3QgeWV0IHNlbnQgdGhlaXIgZmlyc3QgcmVxdWVzdCAocHJlc2VudGVkIGFzIGBVbnRpdGxlZGApLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9uZXdDaGF0SWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdC8qKlxuXHQgKiBUaGUgbGFzdCB7QGxpbmsgU2Vzc2lvblN0YXRlfSBhcHBsaWVkIHRvIHRoZSBjaGF0IGNhdGFsb2csIHJldGFpbmVkIHNvIHRoZVxuXHQgKiBjYXRhbG9nIGNhbiBiZSByZS1yZWNvbmNpbGVkIHdoZW4ge0BsaW5rIGNhcGFiaWxpdGllc30gY2hhbmdlIGFmdGVyIHRoZVxuXHQgKiBmYWN0IChzZWUgdGhlIGNhcGFiaWxpdHkgYXV0b3J1biBpbiB0aGUgY29uc3RydWN0b3IpLlxuXHQgKi9cblx0cHJpdmF0ZSBfbGFzdENhdGFsb2dTdGF0ZTogU2Vzc2lvblN0YXRlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yYXdJZDogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZVNjaGVtZTogc3RyaW5nO1xuXG5cdHJlYWRvbmx5IGFnZW50UHJvdmlkZXI6IHN0cmluZztcblx0LyoqXG5cdCAqIFRoaXMgc2Vzc2lvbidzIFVSSSBhcyB0aGUgaG9zdCdzIHJlZ2lzdHJ5IGlzIGtleWVkIGJ5IGl0LCB3aGljaCBtYXkgdXNlIGEgZGlmZmVyZW50IHNjaGVtZVxuXHQgKiB0aGFuIHtAbGluayBhZ2VudFByb3ZpZGVyfSAoY2xvdWQgc2FuZGJveDogcHJvdmlkZXIgYGNvcGlsb3RgLCBiYWNrZW5kIGBhaHAtc2Vzc2lvbjovPGlkPmApLlxuXHQgKiBFdmVyeSBiYWNrZW5kIGNhbGwgbXVzdCBhZGRyZXNzIHRoZSBzZXNzaW9uIGJ5IHRoaXMgVVJJLlxuXHQgKi9cblx0cmVhZG9ubHkgYmFja2VuZFVyaTogVVJJO1xuXG5cdC8vIFJldGFpbmVkIHNvIHdlIGNhbiByZWJ1aWxkIGB3b3Jrc3BhY2VgIHdoZW4gb25seSBgX21ldGFgIGNoYW5nZXMgdmlhXG5cdC8vIGEgYFNlc3Npb25NZXRhQ2hhbmdlZGAgYWN0aW9uIGRpc3BhdGNoZWQgb24gc2Vzc2lvbiBvcGVuICh3aXRob3V0IGEgZnVsbFxuXHQvLyBsaXN0IHJlZnJlc2gpLiBTZWUgYF9hcHBseVNlc3Npb25NZXRhRnJvbVN0YXRlYCAvIGBzZXRNZXRhYC5cblx0cHJpdmF0ZSBfcHJvamVjdDogSUFnZW50U2Vzc2lvbk1ldGFkYXRhWydwcm9qZWN0J107XG5cdHByaXZhdGUgX3dvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQ7XG5cdC8vIFRoZSBkaXJlY3RvcnkgdGhhdCB0aGUgY3VycmVudCBgbW9kZWAgY3VzdG9tLWFnZW50IFVSSSBpcyByb290ZWQgYXQuIFVzZWQgdG9cblx0Ly8gY29tcHV0ZSB0aGUgYWdlbnQncyByZXBvLXJlbGF0aXZlIHBhdGggc28gdGhlIHNlbGVjdGlvbiBjYW4gYmUgcmViYXNlZCBvbnRvXG5cdC8vIGl0cyB3b3JrdHJlZSB0d2luIHdoZW4gdGhlIHNlc3Npb24gcmVsb2NhdGVzIGludG8gYW4gaXNvbGF0ZWQgd29ya3RyZWUgKHNlZVxuXHQvLyBgcmVjb25jaWxlU2VsZWN0ZWRBZ2VudGApLlxuXHRwcml2YXRlIF9hZ2VudEJhc2VEaXI6IFVSSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbWV0YTogU2Vzc2lvbk1ldGEgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoaXMgc2Vzc2lvbiBpcyBhIHdvcmtzcGFjZS1sZXNzIHF1aWNrIGNoYXQuIFNlZWRlZCBmcm9tIHRoZVxuXHQgKiBjb25zdHJ1Y3RvciBtZXRhZGF0YSBhbmQgb25seSBldmVyIHByb21vdGVkIGJ5XG5cdCAqIHtAbGluayBfcHJvbW90ZVRvUXVpY2tDaGF0SWZXb3Jrc3BhY2VsZXNzfS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzUXVpY2tDaGF0OiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHQvKiogU2Vzc2lvbi1raW5kIHN0cmF0ZWd5IChxdWljayBjaGF0IHZzLiB3b3Jrc3BhY2UpLCBkZXJpdmVkIGZyb20ge0BsaW5rIF9pc1F1aWNrQ2hhdH0uICovXG5cdHByaXZhdGUgZ2V0IF9raW5kKCk6IElBZ2VudEhvc3RTZXNzaW9uS2luZCB7IHJldHVybiBzZXNzaW9uS2luZCh0aGlzLl9pc1F1aWNrQ2hhdC5nZXQoKSk7IH1cblx0LyoqXG5cdCAqIE9ic2VydmFibGUgbWlycm9yIG9mIHtAbGluayBfbWV0YX0sIGtlcHQgaW4gc3luYyB3aXRoIGV2ZXJ5IHdyaXRlIHRvXG5cdCAqIGBfbWV0YWAgc28gcmVhY3RpdmUgZGVyaXZhdGlvbnMgKG5vdGFibHkge0BsaW5rIGdpdEh1YkluZm99KSByZS1maXJlXG5cdCAqIHdoZW4gZ2l0IC8gR2l0SHViIHN0YXRlIGFycml2ZXMgKG9yIGNoYW5nZXMpLiBUaGUgaG9zdCB0cmVhdHMgdGhlXG5cdCAqIHNlc3Npb24tc3RhdGUgYW5kIHNlc3Npb24tc3VtbWFyeSBgX21ldGFgIGFzIHRoZSBzYW1lIGJhZywgc28gYm90aCBnaXRcblx0ICogc3RhdGUgYW5kIEdpdEh1YiBzdGF0ZSBsaXZlIGhlcmUuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXRhT2JzOiBJU2V0dGFibGVPYnNlcnZhYmxlPFNlc3Npb25NZXRhIHwgdW5kZWZpbmVkPjtcblxuXHRwcml2YXRlIF9hY3Rpdml0eTogSVNldHRhYmxlT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYW5nZXNTdW1tYXJ5ID0gb2JzZXJ2YWJsZVZhbHVlT3B0czxJU2Vzc2lvbkNoYW5nZXNTdW1tYXJ5IHwgdW5kZWZpbmVkPih7IGVxdWFsc0ZuOiBzdHJ1Y3R1cmFsRXF1YWxzIH0sIHVuZGVmaW5lZCk7XG5cdGdldCBjaGFuZ2VzU3VtbWFyeSgpOiBJT2JzZXJ2YWJsZTxJU2Vzc2lvbkNoYW5nZXNTdW1tYXJ5IHwgdW5kZWZpbmVkPiB7IHJldHVybiB0aGlzLl9jaGFuZ2VzU3VtbWFyeTsgfVxuXHQvKipcblx0ICogU2V0cyB0aGUgYWdncmVnYXRlIGNoYW5nZSBjaGlwLiBDYWxsZXJzIGluc2lkZSBhIHRyYW5zYWN0aW9uIE1VU1QgcGFzcyBpdFxuXHQgKiBcdTIwMTQgYSBgc2V0YCB3aXRob3V0IG9uZSBidWlsZHMgYW5kIGZpbmlzaGVzIGl0cyBvd24gdHJhbnNhY3Rpb24sIG5vdGlmeWluZ1xuXHQgKiBvYnNlcnZlcnMgYmVmb3JlIHRoZSBlbmNsb3NpbmcgdXBkYXRlIGhhcyBhcHBsaWVkIGl0cyByZW1haW5pbmcgZmllbGRzLlxuXHQgKi9cblx0c2V0Q2hhbmdlc1N1bW1hcnkoY2hhbmdlczogQ2hhbmdlc1N1bW1hcnkgfCB1bmRlZmluZWQsIHR4PzogSVRyYW5zYWN0aW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFjaGFuZ2VzKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBhZGRpdGlvbnMsIGRlbGV0aW9ucywgZmlsZXMgfSA9IGNoYW5nZXM7XG5cdFx0Y29uc3QgY3VycmVudENoYW5nZXNTdW1tYXJ5ID0gdGhpcy5fY2hhbmdlc1N1bW1hcnkuZ2V0KCk7XG5cblx0XHRpZiAoXG5cdFx0XHQoY3VycmVudENoYW5nZXNTdW1tYXJ5Py5maWxlcyA/PyAwKSA9PT0gKGZpbGVzID8/IDApICYmXG5cdFx0XHQoY3VycmVudENoYW5nZXNTdW1tYXJ5Py5hZGRpdGlvbnMgPz8gMCkgPT09IChhZGRpdGlvbnMgPz8gMCkgJiZcblx0XHRcdChjdXJyZW50Q2hhbmdlc1N1bW1hcnk/LmRlbGV0aW9ucyA/PyAwKSA9PT0gKGRlbGV0aW9ucyA/PyAwKVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NoYW5nZXNTdW1tYXJ5LnNldCh7XG5cdFx0XHRhZGRpdGlvbnM6IGFkZGl0aW9ucyA/PyAwLFxuXHRcdFx0ZGVsZXRpb25zOiBkZWxldGlvbnMgPz8gMCxcblx0XHRcdGZpbGVzOiBmaWxlcyA/PyAwXG5cdFx0fSwgdHgpO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRyZWFkb25seSBpc0FjdGl2ZVNlc3Npb25PYnM6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1ldGFkYXRhOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEsXG5cdFx0cHJvdmlkZXJJZDogc3RyaW5nLFxuXHRcdHJlc291cmNlU2NoZW1lOiBzdHJpbmcsXG5cdFx0bG9naWNhbFNlc3Npb25UeXBlOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSUFnZW50SG9zdEFkYXB0ZXJPcHRpb25zLFxuXHRcdEBJR2l0SHViU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9naXRIdWJTZXJ2aWNlOiBJR2l0SHViU2VydmljZSxcblx0XHRASVNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElQdWxsUmVxdWVzdEljb25DYWNoZSBwcml2YXRlIHJlYWRvbmx5IF9wdWxsUmVxdWVzdEljb25DYWNoZTogSVB1bGxSZXF1ZXN0SWNvbkNhY2hlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IHJhd0lkID0gQWdlbnRTZXNzaW9uLmlkKG1ldGFkYXRhLnNlc3Npb24pO1xuXHRcdGNvbnN0IGFnZW50UHJvdmlkZXIgPSBBZ2VudFNlc3Npb24ucHJvdmlkZXIobWV0YWRhdGEuc2Vzc2lvbik7XG5cdFx0aWYgKCFhZ2VudFByb3ZpZGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEFnZW50IHNlc3Npb24gVVJJIGhhcyBubyBwcm92aWRlciBzY2hlbWU6ICR7bWV0YWRhdGEuc2Vzc2lvbi50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHR0aGlzLmFnZW50UHJvdmlkZXIgPSBhZ2VudFByb3ZpZGVyO1xuXHRcdHRoaXMuYmFja2VuZFVyaSA9IEFnZW50U2Vzc2lvbi51cmkoX29wdGlvbnMuYmFja2VuZFNlc3Npb25TY2hlbWUgPz8gYWdlbnRQcm92aWRlciwgcmF3SWQpO1xuXHRcdHRoaXMucmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogcmVzb3VyY2VTY2hlbWUsIHBhdGg6IGAvJHtyYXdJZH1gIH0pO1xuXHRcdHRoaXMuX3Jhd0lkID0gcmF3SWQ7XG5cdFx0dGhpcy5fcmVzb3VyY2VTY2hlbWUgPSByZXNvdXJjZVNjaGVtZTtcblx0XHR0aGlzLnNlc3Npb25JZCA9IHRvU2Vzc2lvbklkKHByb3ZpZGVySWQsIHRoaXMucmVzb3VyY2UpO1xuXHRcdHRoaXMucHJvdmlkZXJJZCA9IHByb3ZpZGVySWQ7XG5cdFx0dGhpcy5zZXNzaW9uVHlwZSA9IGxvZ2ljYWxTZXNzaW9uVHlwZTtcblx0XHR0aGlzLl9pc1F1aWNrQ2hhdCA9IG9ic2VydmFibGVWYWx1ZSgnaXNRdWlja0NoYXQnLCByZWFkU2Vzc2lvbldvcmtzcGFjZWxlc3MobWV0YWRhdGEuX21ldGEpKTtcblx0XHR0aGlzLmljb24gPSBfb3B0aW9ucy5pY29uO1xuXHRcdHRoaXMuY3JlYXRlZEF0ID0gbmV3IERhdGUobWV0YWRhdGEuc3RhcnRUaW1lKTtcblx0XHR0aGlzLnRpdGxlID0gb2JzZXJ2YWJsZVZhbHVlKCd0aXRsZScsIG1ldGFkYXRhLnN1bW1hcnkgfHwgYFNlc3Npb24gJHtyYXdJZC5zdWJzdHJpbmcoMCwgOCl9YCk7XG5cdFx0dGhpcy51cGRhdGVkQXQgPSBvYnNlcnZhYmxlVmFsdWUoJ3VwZGF0ZWRBdCcsIG5ldyBEYXRlKG1ldGFkYXRhLm1vZGlmaWVkVGltZSkpO1xuXHRcdHRoaXMubW9kZWxTZWxlY3Rpb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5zdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWU8U2Vzc2lvblN0YXR1cz4oJ3N0YXR1cycsIG1ldGFkYXRhLnN0YXR1cyAhPT0gdW5kZWZpbmVkID8gbWFwUHJvdG9jb2xTdGF0dXMobWV0YWRhdGEuc3RhdHVzKSA6IFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKTtcblx0XHR0aGlzLm1vZGVsSWQgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPignbW9kZWxJZCcsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5tb2RlID0gb2JzZXJ2YWJsZVZhbHVlPHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+KCdtb2RlJywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLmxhc3RUdXJuRW5kID0gb2JzZXJ2YWJsZVZhbHVlKCdsYXN0VHVybkVuZCcsIG1ldGFkYXRhLm1vZGlmaWVkVGltZSA/IG5ldyBEYXRlKG1ldGFkYXRhLm1vZGlmaWVkVGltZSkgOiB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2FjdGl2aXR5ID0gb2JzZXJ2YWJsZVZhbHVlKCdhY3Rpdml0eScsIG1ldGFkYXRhLmFjdGl2aXR5KTtcblx0XHR0aGlzLl9wcm9qZWN0ID0gbWV0YWRhdGEucHJvamVjdDtcblx0XHR0aGlzLl93b3JraW5nRGlyZWN0b3JpZXMgPSBtZXRhZGF0YS53b3JraW5nRGlyZWN0b3JpZXM7XG5cblx0XHR0aGlzLl9tZXRhID0gbWV0YWRhdGEuX21ldGE7XG5cdFx0dGhpcy5fbWV0YU9icyA9IG9ic2VydmFibGVWYWx1ZTxTZXNzaW9uTWV0YSB8IHVuZGVmaW5lZD4oJ2FnZW50SG9zdFNlc3Npb25NZXRhJywgdGhpcy5fbWV0YSk7XG5cblx0XHRjb25zdCBiYXNlR2l0SHViSW5mb09icyA9IGRlcml2ZWRPcHRzPElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkPih7XG5cdFx0XHRlcXVhbHNGbjogaXNHaXRIdWJJbmZvRXF1YWxcblx0XHR9LCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbWV0YSA9IHRoaXMuX21ldGFPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSByZWFkU2Vzc2lvbkdpdEh1YlN0YXRlKG1ldGEpO1xuXHRcdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgb3duZXIgPSBzdGF0ZS5vd25lcjtcblx0XHRcdGxldCByZXBvID0gc3RhdGUucmVwbztcblx0XHRcdGxldCBwdWxsUmVxdWVzdE51bWJlcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAoc3RhdGUucHVsbFJlcXVlc3RVcmwpIHtcblx0XHRcdFx0Ly8gRXh0cmFjdCBwdWxsIHJlcXVlc3QgaW5mb3JtYXRpb24gZnJvbSB0aGUgVVJMXG5cdFx0XHRcdGNvbnN0IG1hdGNoID0gL2dpdGh1YlxcLmNvbVxcLyhbXi9dKylcXC8oW14vXSspXFwvcHVsbFxcLyhcXGQrKS8uZXhlYyhzdGF0ZS5wdWxsUmVxdWVzdFVybCk7XG5cdFx0XHRcdGlmIChtYXRjaCkge1xuXHRcdFx0XHRcdG93bmVyID0gb3duZXIgPz8gbWF0Y2hbMV07XG5cdFx0XHRcdFx0cmVwbyA9IHJlcG8gPz8gbWF0Y2hbMl07XG5cdFx0XHRcdFx0cHVsbFJlcXVlc3ROdW1iZXIgPSBOdW1iZXIobWF0Y2hbM10pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICghb3duZXIgfHwgIXJlcG8pIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0b3duZXIsXG5cdFx0XHRcdHJlcG8sXG5cdFx0XHRcdHB1bGxSZXF1ZXN0OiBwdWxsUmVxdWVzdE51bWJlciAhPT0gdW5kZWZpbmVkID8ge1xuXHRcdFx0XHRcdG51bWJlcjogcHVsbFJlcXVlc3ROdW1iZXIsXG5cdFx0XHRcdFx0dXJpOiBVUkkucGFyc2Uoc3RhdGUucHVsbFJlcXVlc3RVcmwhKSxcblx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0aXNzdWVzOiB0b0dpdEh1Yklzc3VlUmVmcyhzdGF0ZS5pc3N1ZVVybHMpLFxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdHRoaXMuZ2l0SHViSW5mbyA9IGRlcml2ZWQ8SUdpdEh1YkluZm8gfCB1bmRlZmluZWQ+KHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBiYXNlR2l0SHViSW5mbyA9IGJhc2VHaXRIdWJJbmZvT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghYmFzZUdpdEh1YkluZm8/LnB1bGxSZXF1ZXN0KSB7XG5cdFx0XHRcdHJldHVybiBiYXNlR2l0SHViSW5mbztcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4uYmFzZUdpdEh1YkluZm8sXG5cdFx0XHRcdHB1bGxSZXF1ZXN0OiB7XG5cdFx0XHRcdFx0Li4uYmFzZUdpdEh1YkluZm8ucHVsbFJlcXVlc3QsXG5cdFx0XHRcdFx0aWNvbjogY29tcHV0ZVNlc3Npb25QdWxsUmVxdWVzdEljb24ocmVhZGVyLCB0aGlzLl9naXRIdWJTZXJ2aWNlLCB0aGlzLl9wdWxsUmVxdWVzdEljb25DYWNoZSwgYmFzZUdpdEh1YkluZm8pXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHRjb25zdCBpbml0aWFsV29ya3NwYWNlID0gdGhpcy5fY29tcHV0ZVdvcmtzcGFjZSgpO1xuXHRcdHRoaXMud29ya3NwYWNlID0gb2JzZXJ2YWJsZVZhbHVlKCd3b3Jrc3BhY2UnLCBpbml0aWFsV29ya3NwYWNlKTtcblx0XHR0aGlzLmlzUXVpY2tDaGF0ID0gdGhpcy5faXNRdWlja0NoYXQ7XG5cdFx0Ly8gVW50aWwgdGhlIGhvc3QgcmVwb3J0cyB0aGUgd29ya3RyZWUsIHRoZSB3b3Jrc3BhY2UgaXMgc3RpbGwgdGhlIGNoZWNrb3V0IGl0IHdhcyBzdGFydGVkIGZyb20uXG5cdFx0dGhpcy53b3JrdHJlZVBlbmRpbmcgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PlxuXHRcdFx0dGhpcy5fd29ya3RyZWVJc29sYXRpb24ucmVhZChyZWFkZXIpXG5cdFx0XHQmJiAhdGhpcy53b3Jrc3BhY2UucmVhZChyZWFkZXIpPy5mb2xkZXJzLnNvbWUoZm9sZGVyID0+ICEhZm9sZGVyLmdpdFJlcG9zaXRvcnk/LndvcmtUcmVlVXJpKSk7XG5cdFx0dGhpcy5sb2FkaW5nID0gX29wdGlvbnMubG9hZGluZztcblx0XHR0aGlzLmRlc2NyaXB0aW9uID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdHVzID0gdGhpcy5zdGF0dXMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHN0YXR1cyA9PT0gU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzIHx8IHN0YXR1cyA9PT0gU2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0KSB7XG5cdFx0XHRcdGNvbnN0IGFjdGl2aXR5ID0gdGhpcy5fYWN0aXZpdHkucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoYWN0aXZpdHkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kVGV4dChhY3Rpdml0eSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9KTtcblxuXHRcdGlmIChpc1Nlc3Npb25TdGF0dXNBcmNoaXZlZChtZXRhZGF0YS5zdGF0dXMpKSB7XG5cdFx0XHR0aGlzLmlzQXJjaGl2ZWQuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0aWYgKG1ldGFkYXRhLnN0YXR1cyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmlzUmVhZC5zZXQoaXNTZXNzaW9uU3RhdHVzUmVhZChtZXRhZGF0YS5zdGF0dXMpLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdHRoaXMuaXNBY3RpdmVTZXNzaW9uT2JzID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBpc0VxdWFsKGFjdGl2ZVNlc3Npb24/LnJlc291cmNlLCB0aGlzLnJlc291cmNlKTtcblx0XHR9KTtcblxuXHRcdC8vIFNldCB0aGUgY2hhbmdlcyBzdW1tYXJ5IGZyb20gdGhlIGFnZ3JlZ2F0ZS4gV2hpbGUgdGhlIHNlc3Npb24gaXMgYWN0aXZlLFxuXHRcdC8vIHRoZSBjaGFuZ2VzIHN1bW1hcnkgd2lsbCBiZSB1cGRhdGVkIHRocm91Z2ggdGhlIHNlc3Npb24gY2hhbmdlc2V0IGNoYW5nZXMuXG5cdFx0Ly8gQXMgc29vbiBhcyB0aGUgc2Vzc2lvbiBpcyBubyBsb25nZXIgYWN0aXZlLCB0aGUgY2hhbmdlcyBzdW1tYXJ5IHdpbGwgYmVcblx0XHQvLyB1cGRhdGVkIGZyb20gYG1ldGFkYXRhLmNoYW5nZXNgIChtaXJyb3JpbmcgYFNlc3Npb25TdW1tYXJ5LmNoYW5nZXNgKS5cblx0XHR0aGlzLnNldENoYW5nZXNTdW1tYXJ5KG1ldGFkYXRhLmNoYW5nZXMpO1xuXG5cdFx0Ly8gQ2hhbmdlc2V0cyB3aWxsIGJlIHJlc29sdmVkIGFzeW5jaHJvbm91c2x5IHdoZW4gdGhlIHNlc3Npb24gaXMgYWN0aXZlLiBgdW5kZWZpbmVkYFxuXHRcdC8vIG1hcmtzIHRoZSB1bmluaXRpYWxpemVkIHN0YXRlLCBkaXN0aW5jdCBmcm9tIGEgcmVzb2x2ZWQgc2Vzc2lvbiB0aGF0IHNpbXBseSBoYXMgbm9cblx0XHQvLyBjaGFuZ2VzZXRzIChhbiBlbXB0eSBhcnJheSkuXG5cdFx0dGhpcy5jaGFuZ2VzZXRzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElTZXNzaW9uQ2hhbmdlc2V0W10gfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBDcmVhdGUgYW4gb2JzZXJ2YWJsZSBmb3IgdGhlIGNoYW5nZXMgb2YgdGhlIHNlc3Npb24nc1xuXHRcdC8vIGRlZmF1bHQgY2hhbmdlc2V0IChleDogQnJhbmNoIENoYW5nZXMpLiBUaGlzIHdpbGwgYWx3YXlzXG5cdFx0Ly8gdHJhY2sgdGhlIGRlZmF1bHQgY2hhbmdlc2V0IGluZGVwZW5kZW50IG9mIHRoZSBzZWxlY3RlZFxuXHRcdC8vIGNoYW5nZXNldC5cblx0XHR0aGlzLmNoYW5nZXMgPSB0aGlzLl9jcmVhdGVDaGFuZ2VzT2JzKCk7XG5cblx0XHQvLyBGaWxlcyBjcmVhdGVkL2VkaXRlZC9kZWxldGVkIG91dHNpZGUgdGhlIHdvcmtzcGFjZSwgcGx1cyB0aGUgbGFzdCB0dXJuJ3Ncblx0XHQvLyBjaGFuZ2VzLCBwYXJzZWQgZnJvbSB0aGUgY2hhdC1zdGF0ZSB0dXJucy4gQ29tcHV0ZWQgbGF6aWx5IGZyb20gdGhlIHNhbWVcblx0XHQvLyBhY3RpdmUtc2Vzc2lvbiBzdWJzY3JpcHRpb25zIHVzZWQgZm9yIGNoYW5nZXMuXG5cdFx0Y29uc3Qgc2Vzc2lvbk91dHB1dCA9IGNyZWF0ZVNlc3Npb25PdXRwdXRPYnModGhpcy5iYWNrZW5kVXJpLCB0aGlzLl9vcHRpb25zLCB0aGlzLmlzQWN0aXZlU2Vzc2lvbk9icywgdGhpcy5pc0FyY2hpdmVkLCB0aGlzLndvcmtzcGFjZSk7XG5cdFx0dGhpcy5fc2Vzc2lvbk91dHB1dCA9IHNlc3Npb25PdXRwdXQ7XG5cdFx0dGhpcy5leHRlcm5hbENoYW5nZXMgPSBzZXNzaW9uT3V0cHV0LmV4dGVybmFsRmlsZXM7XG5cblx0XHRjb25zdCBtYWluQ2hhdDogSUNoYXQgPSB7XG5cdFx0XHRyZXNvdXJjZTogdGhpcy5yZXNvdXJjZSxcblx0XHRcdGNyZWF0ZWRBdDogdGhpcy5jcmVhdGVkQXQsXG5cdFx0XHR0aXRsZTogZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5fZGVmYXVsdENoYXRUaXRsZU92ZXJyaWRlLnJlYWQocmVhZGVyKSA/PyB0aGlzLnRpdGxlLnJlYWQocmVhZGVyKSksXG5cdFx0XHR1cGRhdGVkQXQ6IHRoaXMudXBkYXRlZEF0LFxuXHRcdFx0c3RhdHVzOiBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLl9kZWZhdWx0Q2hhdFN0YXR1c092ZXJyaWRlLnJlYWQocmVhZGVyKSA/PyB0aGlzLnN0YXR1cy5yZWFkKHJlYWRlcikpLFxuXHRcdFx0Y2hhbmdlczogdGhpcy5jaGFuZ2VzLFxuXHRcdFx0bGFzdFR1cm5DaGFuZ2VzOiBzZXNzaW9uT3V0cHV0LmdldExhc3RUdXJuQ2hhbmdlcyhVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaSh0aGlzLmJhY2tlbmRVcmkpKSksXG5cdFx0XHRjaGVja3BvaW50czogb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHVuZGVmaW5lZCksXG5cdFx0XHRtb2RlbElkOiB0aGlzLm1vZGVsSWQsXG5cdFx0XHRtb2RlOiB0aGlzLm1vZGUsXG5cdFx0XHRpc0FyY2hpdmVkOiB0aGlzLmlzQXJjaGl2ZWQsXG5cdFx0XHRpc1JlYWQ6IHRoaXMuaXNSZWFkLFxuXHRcdFx0Ly8gQW4gYXJjaGl2ZWQgc2Vzc2lvbiBpcyByZWFkLW9ubHk6IGZvcmNlIHRoZSBkZWZhdWx0IGNoYXQnc1xuXHRcdFx0Ly8gaW50ZXJhY3Rpdml0eSB0byBSZWFkT25seSBzbyB0aGUgY2hhdCB2aWV3IGhpZGVzIHRoZSBjb21wb3NlciBhbmRcblx0XHRcdC8vIGdhdGVzIG11dGF0aW5nIGFjdGlvbnMuXG5cdFx0XHRpbnRlcmFjdGl2aXR5OiBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiBlZmZlY3RpdmVDaGF0SW50ZXJhY3Rpdml0eSh0aGlzLmlzQXJjaGl2ZWQucmVhZChyZWFkZXIpLCB0aGlzLl9kZWZhdWx0Q2hhdEludGVyYWN0aXZpdHkucmVhZChyZWFkZXIpKSksXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5kZXNjcmlwdGlvbixcblx0XHRcdGxhc3RUdXJuRW5kOiB0aGlzLmxhc3RUdXJuRW5kLFxuXHRcdH07XG5cdFx0dGhpcy5fZGVmYXVsdENoYXQgPSBtYWluQ2hhdDtcblx0XHR0aGlzLl9tYWluQ2hhdE9icyA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdD4odGhpcywgbWFpbkNoYXQpO1xuXHRcdHRoaXMuX2NoYXRzT2JzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElDaGF0W10+KHRoaXMsIFttYWluQ2hhdF0pO1xuXHRcdHRoaXMubWFpbkNoYXQgPSB0aGlzLl9tYWluQ2hhdE9icztcblx0XHR0aGlzLmNoYXRzID0gdGhpcy5fY2hhdHNPYnM7XG5cblx0XHR0aGlzLmNhcGFiaWxpdGllcyA9IGRlcml2ZWRPcHRzPElTZXNzaW9uQ2FwYWJpbGl0aWVzPih7IG93bmVyOiB0aGlzLCBlcXVhbHNGbjogc3RydWN0dXJhbEVxdWFscyB9LCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnRDYXBhYmlsaXRpZXMgPSB0aGlzLl9vcHRpb25zLmFnZW50Q2FwYWJpbGl0aWVzLnJlYWQocmVhZGVyKT8uZ2V0KHRoaXMuYWdlbnRQcm92aWRlcik7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzdXBwb3J0c011bHRpcGxlQ2hhdHM6ICF0aGlzLmlzUXVpY2tDaGF0LnJlYWQocmVhZGVyKSAmJiAoYWdlbnRDYXBhYmlsaXRpZXM/Lm11bHRpcGxlQ2hhdHMgIT09IHVuZGVmaW5lZCksXG5cdFx0XHRcdHN1cHBvcnRzRm9yazogYWdlbnRDYXBhYmlsaXRpZXM/Lm11bHRpcGxlQ2hhdHM/LmZvcmsgPz8gZmFsc2UsXG5cdFx0XHRcdHN1cHBvcnRzU2lkZUNoYXQ6IGFnZW50Q2FwYWJpbGl0aWVzPy5tdWx0aXBsZUNoYXRzPy5zaWRlQ2hhdCA/PyBmYWxzZSxcblx0XHRcdFx0c3VwcG9ydHNSZW5hbWU6IHRydWUsXG5cdFx0XHRcdHN1cHBvcnRzRGVsZXRlOiB0cnVlLFxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdC8vIFJlLWFwcGx5IHRoZSBjaGF0IGNhdGFsb2cgd2hlbiBhZHZlcnRpc2VkIGNhcGFiaWxpdGllcyBjaGFuZ2UgKGUuZy4gdGhlXG5cdFx0Ly8gYWdlbnQgaG9zdCdzIHJvb3Qgc3RhdGUgYXJyaXZlcyBhZnRlciB0aGUgc2Vzc2lvbidzIGZpcnN0IHN0YXRlIHVwZGF0ZSkuXG5cdFx0Ly8gV2l0aG91dCB0aGlzLCBhIG11bHRpLWNoYXQgc2Vzc2lvbiB3aG9zZSBzdGF0ZSB3YXMgcHJvY2Vzc2VkIHdoaWxlXG5cdFx0Ly8gYHN1cHBvcnRzTXVsdGlwbGVDaGF0c2Agd2FzIHN0aWxsIGBmYWxzZWAgd291bGQgc3RheSBjb2xsYXBzZWQgdG9cblx0XHQvLyBgW2RlZmF1bHRDaGF0XWAgdW50aWwgdGhlIG5leHQgc2Vzc2lvbi1zdGF0ZSB1cGRhdGUuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5jYXBhYmlsaXRpZXMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9sYXN0Q2F0YWxvZ1N0YXRlO1xuXHRcdFx0aWYgKHN0YXRlKSB7XG5cdFx0XHRcdHRoaXMuX2FwcGx5Q2hhdENhdGFsb2coc3RhdGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWNvbmNpbGUgdGhlIHBlci1jaGF0IGNhdGFsb2cgZnJvbSBhbiBBSFAge0BsaW5rIFNlc3Npb25TdGF0ZX0uXG5cdCAqXG5cdCAqIFRoZSBkZWZhdWx0IGNoYXQgKHJlc291cmNlID09IHRoaXMgc2Vzc2lvbidzIHJlc291cmNlKSBhbHdheXMgbWFwcyB0b1xuXHQgKiB7QGxpbmsgX2RlZmF1bHRDaGF0fS4gQWRkaXRpb25hbCBwZWVyIGNoYXRzIGJlY29tZSB0aGVpciBvd24ge0BsaW5rIElDaGF0fVxuXHQgKiB3aG9zZSByZXNvdXJjZSBjYXJyaWVzIHRoZSBjaGF0SWQgaW4gdGhlIFVSSSBmcmFnbWVudCBzbyB0aGUgY2hhdCB2aWV3XG5cdCAqIG9wZW5zIGEgZGlzdGluY3Qgd2lkZ2V0IHRoYXQgdGhlIHNlc3Npb24gaGFuZGxlciByb3V0ZXMgdG8gdGhlIG1hdGNoaW5nXG5cdCAqIGNoYXQgY2hhbm5lbC5cblx0ICpcblx0ICogQSBub24tZGVmYXVsdCBjaGF0IHN1cmZhY2VzIGFzIGEgcGVlciB0YWIgd2hlbiB0aGUgc2Vzc2lvbiBzdXBwb3J0c1xuXHQgKiBtdWx0aXBsZSBjaGF0cyAodGhlIGBjb3BpbG90Y2xpYCBjYXNlKSBPUiB3aGVuIGl0IGlzIGEgc3ViYWdlbnRcblx0ICogKHRvb2wtb3JpZ2luKSBjaGF0LiBTdWJhZ2VudCBjaGF0cyBhcmUgYWx3YXlzIHN1cmZhY2VkIGFzIHJlYWQtb25seSBwZWVyc1xuXHQgKiBcdTIwMTQgaW5kZXBlbmRlbnQgb2YgbXVsdGktY2hhdCBzdXBwb3J0IFx1MjAxNCBzbyB0aGUgdXNlciBjYW4gcmV2aWV3IGEgd29ya2VyJ3Ncblx0ICogdHJhbnNjcmlwdCAodGhlIGFnZW50LXRlYW0gcGF0dGVybikuIFNlc3Npb25zIHdpdGggbm8gc3VyZmFjZWQgcGVlcnNcblx0ICogZGVncmFkZSB0byBgW2RlZmF1bHRDaGF0XWAuXG5cdCAqL1xuXHRhcHBseUNoYXRDYXRhbG9nKHN0YXRlOiBTZXNzaW9uU3RhdGUpOiB2b2lkIHtcblx0XHR0aGlzLl9sYXN0Q2F0YWxvZ1N0YXRlID0gc3RhdGU7XG5cdFx0dGhpcy5fYXBwbHlDaGF0Q2F0YWxvZyhzdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseUNoYXRDYXRhbG9nKHN0YXRlOiBTZXNzaW9uU3RhdGUpOiB2b2lkIHtcblx0XHQvLyBUaGUgZGVmYXVsdCBjaGF0J3MgY2F0YWxvZyB0aXRsZSBkcml2ZXMgaXRzIGluZGVwZW5kZW50IHRhYiB0aXRsZS5cblx0XHQvLyBFbXB0eSBtZWFucyBcImluaGVyaXQgdGhlIHNlc3Npb24gdGl0bGVcIjsgYSBub24tZW1wdHkgdmFsdWUgbWVhbnMgaXQgd2FzXG5cdFx0Ly8gcmVuYW1lZCBpbmRlcGVuZGVudGx5IG9mIHRoZSBzZXNzaW9uLlxuXHRcdGNvbnN0IGRlZmF1bHRDaGF0VXJpID0gc3RhdGUuZGVmYXVsdENoYXQ/LnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgaXNEZWZhdWx0ID0gKHN1bW1hcnk6IENoYXRTdW1tYXJ5KTogYm9vbGVhbiA9PiBkZWZhdWx0Q2hhdFVyaVxuXHRcdFx0PyBzdW1tYXJ5LnJlc291cmNlLnRvU3RyaW5nKCkgPT09IGRlZmF1bHRDaGF0VXJpXG5cdFx0XHQ6IGlzRGVmYXVsdENoYXRVcmkoc3VtbWFyeS5yZXNvdXJjZSk7XG5cdFx0Y29uc3QgZGVmYXVsdFN1bW1hcnkgPSBzdGF0ZS5jaGF0cy5maW5kKGlzRGVmYXVsdCk7XG5cdFx0dGhpcy5fZGVmYXVsdENoYXRUaXRsZU92ZXJyaWRlLnNldChkZWZhdWx0U3VtbWFyeT8udGl0bGUgfHwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2RlZmF1bHRDaGF0SW50ZXJhY3Rpdml0eS5zZXQodG9DaGF0SW50ZXJhY3Rpdml0eShkZWZhdWx0U3VtbWFyeT8uaW50ZXJhY3Rpdml0eSksIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBUb29sLW9yaWdpbiBzdWJhZ2VudHMgYW5kIHVzZXItY3JlYXRlZCBzaWRlIChgL2J0d2ApIGNoYXRzIG11c3QgcmVhY2hcblx0XHQvLyB0aGUgcGVlci1jaGF0IGNhdGFsb2cgZXZlbiB3aGVuIHRoZSBiYWNraW5nIHNlc3Npb24gdHlwZSBpcyBvdGhlcndpc2Vcblx0XHQvLyBzaW5nbGUtY2hhdDsgdGhlIFVJIGxhdGVyIGRlY2lkZXMgd2hldGhlciB0byBzaG93IHRoZW0gYnkgZGVmYXVsdC5cblx0XHRjb25zdCBzdXJmYWNlc0FzUGVlciA9IChzdW1tYXJ5OiBDaGF0U3VtbWFyeSk6IGJvb2xlYW4gPT5cblx0XHRcdCFpc0RlZmF1bHQoc3VtbWFyeSlcblx0XHRcdCYmICEhcGFyc2VDaGF0VXJpKHN1bW1hcnkucmVzb3VyY2UpPy5jaGF0SWRcblx0XHRcdCYmICh0aGlzLmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c011bHRpcGxlQ2hhdHNcblx0XHRcdFx0fHwgc3VtbWFyeS5vcmlnaW4/LmtpbmQgPT09IFByb3RvY29sQ2hhdE9yaWdpbktpbmQuVG9vbFxuXHRcdFx0XHR8fCBzdW1tYXJ5Lm9yaWdpbj8ua2luZCA9PT0gUHJvdG9jb2xDaGF0T3JpZ2luS2luZC5TaWRlQ2hhdCk7XG5cblx0XHRpZiAoIXN0YXRlLmNoYXRzLnNvbWUoc3VyZmFjZXNBc1BlZXIpKSB7XG5cdFx0XHQvLyBTaW5nbGUgdmlzaWJsZSBjaGF0OiB0aGUgZGVmYXVsdCBjaGF0IGlzIHRoZSBzZXNzaW9uLCBzbyBsZXQgaXRcblx0XHRcdC8vIHJlZmxlY3QgdGhlIGFnZ3JlZ2F0ZWQgc2Vzc2lvbiBzdGF0dXMgZGlyZWN0bHkgKGNsZWFyIGFueSBvdmVycmlkZSkuXG5cdFx0XHR0aGlzLl9kZWZhdWx0Q2hhdFN0YXR1c092ZXJyaWRlLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRpZiAodGhpcy5fYWRkaXRpb25hbENoYXRzLnNpemUgPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2FkZGl0aW9uYWxDaGF0cy5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9jaGF0c09icy5nZXQoKS5sZW5ndGggIT09IDEgfHwgdGhpcy5fY2hhdHNPYnMuZ2V0KClbMF0gIT09IHRoaXMuX2RlZmF1bHRDaGF0KSB7XG5cdFx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0XHR0aGlzLl9jaGF0c09icy5zZXQoW3RoaXMuX2RlZmF1bHRDaGF0XSwgdHgpO1xuXHRcdFx0XHRcdHRoaXMuX21haW5DaGF0T2JzLnNldCh0aGlzLl9kZWZhdWx0Q2hhdCwgdHgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBNdWx0aXBsZSBjaGF0czogdGhlIGRlZmF1bHQgY2hhdCBtdXN0IHNob3cgaXRzIG93biBzdGF0dXMsIG5vdCB0aGVcblx0XHQvLyBzZXNzaW9uIGFnZ3JlZ2F0ZSB3aGljaCBtYXkgaGF2ZSBiZWVuIHByb21vdGVkIGJ5IGEgcnVubmluZyBwZWVyIGNoYXQuXG5cdFx0dGhpcy5fZGVmYXVsdENoYXRTdGF0dXNPdmVycmlkZS5zZXQoZGVmYXVsdFN1bW1hcnkgPyBtYXBQcm90b2NvbFN0YXR1cyhkZWZhdWx0U3VtbWFyeS5zdGF0dXMpIDogdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IG9yZGVyZWQ6IElDaGF0W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHN1bW1hcnkgb2Ygc3RhdGUuY2hhdHMpIHtcblx0XHRcdGlmIChpc0RlZmF1bHQoc3VtbWFyeSkpIHtcblx0XHRcdFx0b3JkZXJlZC5wdXNoKHRoaXMuX2RlZmF1bHRDaGF0KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXN1cmZhY2VzQXNQZWVyKHN1bW1hcnkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2hhdElkID0gcGFyc2VDaGF0VXJpKHN1bW1hcnkucmVzb3VyY2UpIS5jaGF0SWQ7XG5cdFx0XHRzZWVuLmFkZChjaGF0SWQpO1xuXHRcdFx0bGV0IGVudHJ5ID0gdGhpcy5fYWRkaXRpb25hbENoYXRzLmdldChjaGF0SWQpO1xuXHRcdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0XHRlbnRyeSA9IHRoaXMuX2NyZWF0ZUFkZGl0aW9uYWxDaGF0KGNoYXRJZCwgc3VtbWFyeSk7XG5cdFx0XHRcdHRoaXMuX2FkZGl0aW9uYWxDaGF0cy5zZXQoY2hhdElkLCBlbnRyeSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbnRyeS51cGRhdGUoc3VtbWFyeSk7XG5cdFx0XHR9XG5cdFx0XHRvcmRlcmVkLnB1c2goZW50cnkuY2hhdCk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBjaGF0SWQgb2YgWy4uLnRoaXMuX2FkZGl0aW9uYWxDaGF0cy5rZXlzKCldKSB7XG5cdFx0XHRpZiAoIXNlZW4uaGFzKGNoYXRJZCkpIHtcblx0XHRcdFx0dGhpcy5fYWRkaXRpb25hbENoYXRzLmRlbGV0ZUFuZERpc3Bvc2UoY2hhdElkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtYWluID0gKGRlZmF1bHRDaGF0VXJpICYmIG9yZGVyZWQuZmluZChjID0+IGlzRXF1YWwoYy5yZXNvdXJjZSwgdGhpcy5yZXNvdXJjZSkpKSB8fCB0aGlzLl9kZWZhdWx0Q2hhdDtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLl9jaGF0c09icy5zZXQob3JkZXJlZC5sZW5ndGggPiAwID8gb3JkZXJlZCA6IFt0aGlzLl9kZWZhdWx0Q2hhdF0sIHR4KTtcblx0XHRcdHRoaXMuX21haW5DaGF0T2JzLnNldChtYWluLCB0eCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVBZGRpdGlvbmFsQ2hhdChjaGF0SWQ6IHN0cmluZywgc3VtbWFyeTogQ2hhdFN1bW1hcnkpOiBBZGRpdGlvbmFsQ2hhdCB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogdGhpcy5fcmVzb3VyY2VTY2hlbWUsIHBhdGg6IGAvJHt0aGlzLl9yYXdJZH1gLCBmcmFnbWVudDogY2hhdElkIH0pO1xuXHRcdGNvbnN0IGxhc3RUdXJuQ2hhbmdlcyA9IHRoaXMuX3Nlc3Npb25PdXRwdXQuZ2V0TGFzdFR1cm5DaGFuZ2VzKFVSSS5wYXJzZShzdW1tYXJ5LnJlc291cmNlKSk7XG5cdFx0cmV0dXJuIG5ldyBBZGRpdGlvbmFsQ2hhdChyZXNvdXJjZSwgc3VtbWFyeSwgdGhpcy5fbmV3Q2hhdElkcy5oYXMoY2hhdElkKSwgdGhpcy5fcmVzb2x2ZVBhcmVudENoYXRSZXNvdXJjZShzdW1tYXJ5Lm9yaWdpbiksIHRoaXMuaXNBcmNoaXZlZCwgbGFzdFR1cm5DaGFuZ2VzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNYXBzIGEgcHJvdG9jb2wgcGFyZW50LWNoYXQgVVJJIChmcm9tIGEgVG9vbC9Gb3JrIHtAbGluayBDaGF0U3VtbWFyeS5vcmlnaW59KVxuXHQgKiB0byB0aGlzIHNlc3Npb24ncyBVSSBjaGF0IHJlc291cmNlOiB0aGUgZGVmYXVsdCBjaGF0IG1hcHMgdG8gdGhlIHNlc3Npb25cblx0ICogcmVzb3VyY2U7IHBlZXIgY2hhdHMgY2FycnkgdGhlaXIgY2hhdElkIGluIHRoZSByZXNvdXJjZSBmcmFnbWVudC5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVQYXJlbnRDaGF0UmVzb3VyY2Uob3JpZ2luOiBDaGF0U3VtbWFyeVsnb3JpZ2luJ10pOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHBhcmVudFVyaSA9IG9yaWdpbiAmJiAoXG5cdFx0XHRvcmlnaW4ua2luZCA9PT0gUHJvdG9jb2xDaGF0T3JpZ2luS2luZC5Ub29sXG5cdFx0XHR8fCBvcmlnaW4ua2luZCA9PT0gUHJvdG9jb2xDaGF0T3JpZ2luS2luZC5Gb3JrXG5cdFx0XHR8fCBvcmlnaW4ua2luZCA9PT0gUHJvdG9jb2xDaGF0T3JpZ2luS2luZC5TaWRlQ2hhdClcblx0XHRcdD8gb3JpZ2luLmNoYXRcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGlmICghcGFyZW50VXJpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoaXNEZWZhdWx0Q2hhdFVyaShwYXJlbnRVcmkpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNvdXJjZTtcblx0XHR9XG5cdFx0Y29uc3QgcGFyZW50Q2hhdElkID0gcGFyc2VDaGF0VXJpKHBhcmVudFVyaSk/LmNoYXRJZDtcblx0XHRyZXR1cm4gcGFyZW50Q2hhdElkXG5cdFx0XHQ/IFVSSS5mcm9tKHsgc2NoZW1lOiB0aGlzLl9yZXNvdXJjZVNjaGVtZSwgcGF0aDogYC8ke3RoaXMuX3Jhd0lkfWAsIGZyYWdtZW50OiBwYXJlbnRDaGF0SWQgfSlcblx0XHRcdDogdGhpcy5yZXNvdXJjZTtcblx0fVxuXG5cdC8qKiBNYXJrIGEgcGVlciBjaGF0IG5ldyBzbyBpdCBzaG93cyBhcyBgVW50aXRsZWRgIHVudGlsIGl0cyBmaXJzdCByZXF1ZXN0LiAqL1xuXHRtYXJrQ2hhdEFzTmV3KGNoYXRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbmV3Q2hhdElkcy5hZGQoY2hhdElkKTtcblx0XHR0aGlzLl9hZGRpdGlvbmFsQ2hhdHMuZ2V0KGNoYXRJZCk/Lm1hcmtOZXcoKTtcblx0fVxuXG5cdC8qKiBDbGVhciB0aGUgYG5ld2AgZmxhZyBhZnRlciB0aGUgY2hhdCdzIGZpcnN0IHJlcXVlc3QgaXMgc2VudC4gKi9cblx0bWFya0NoYXRBc1NlbnQoY2hhdElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9uZXdDaGF0SWRzLmRlbGV0ZShjaGF0SWQpO1xuXHRcdHRoaXMuX2FkZGl0aW9uYWxDaGF0cy5nZXQoY2hhdElkKT8ubWFya1NlbnQoKTtcblx0fVxuXG5cdHNldENoYXRNb2RlbElkKGNoYXRSZXNvdXJjZTogVVJJLCBtb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBjaGF0SWQgPSBjaGF0UmVzb3VyY2UuZnJhZ21lbnQ7XG5cdFx0aWYgKGNoYXRJZCkge1xuXHRcdFx0dGhpcy5fZ2V0QWRkaXRpb25hbENoYXQoY2hhdFJlc291cmNlKT8uc2V0TW9kZWxJZChtb2RlbElkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tb2RlbElkLnNldChtb2RlbElkLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5tb2RlbFNlbGVjdGlvbiA9IG1vZGVsSWQgPyB0aGlzLl90b01vZGVsU2VsZWN0aW9uKG1vZGVsSWQpIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHNldENoYXRBZ2VudChjaGF0UmVzb3VyY2U6IFVSSSwgYWdlbnQ6IElTZXNzaW9uQWdlbnRSZWYgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBjaGF0SWQgPSBjaGF0UmVzb3VyY2UuZnJhZ21lbnQ7XG5cdFx0aWYgKGNoYXRJZCkge1xuXHRcdFx0dGhpcy5fZ2V0QWRkaXRpb25hbENoYXQoY2hhdFJlc291cmNlKT8uc2V0QWdlbnQoYWdlbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm1vZGUuc2V0KGFnZW50ID8geyBpZDogYWdlbnQudXJpLCBraW5kOiBBR0VOVF9NT0RFX0tJTkQgfSA6IHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdC8vIFJlbWVtYmVyIHdoaWNoIHdvcmtpbmcgZGlyZWN0b3J5IHRoZSBhZ2VudCBVUkkgaXMgcm9vdGVkIGF0IHNvIHRoZVxuXHRcdFx0Ly8gc2VsZWN0aW9uIGNhbiBiZSByZWJhc2VkIGlmIHRoZSBzZXNzaW9uIGxhdGVyIHJlbG9jYXRlcyBpbnRvIGEgd29ya3RyZWUuXG5cdFx0XHR0aGlzLl9hZ2VudEJhc2VEaXIgPSBhZ2VudCA/IHRoaXMuX3dvcmtpbmdEaXJlY3Rvcmllcz8uWzBdIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWNvbmNpbGUgdGhlIHNlbGVjdGVkIGN1c3RvbS1hZ2VudCBVUkkgYWdhaW5zdCB0aGUgaG9zdCdzIGN1cnJlbnQgYWdlbnRcblx0ICogbGlzdCBcdTIwMTQgZS5nLiB0aGUgc2Vzc2lvbiBncmFkdWF0ZWQgd2l0aCBhbiBhZ2VudCBwaWNrZWQgaW4gdGhlIG9yaWdpbmFsIHJlcG9cblx0ICogYnV0IG5vdyBydW5zIGluIGFuIGlzb2xhdGVkIHdvcmt0cmVlLCB3aGVyZSB0aGUgaG9zdCByZXBvcnRzIHRoZSBzYW1lIGFnZW50XG5cdCAqIGZpbGUgdW5kZXIgdGhlIHdvcmt0cmVlIHBhdGguXG5cdCAqXG5cdCAqIFRoZSBzZWxlY3Rpb24gaXMgcmViYXNlZCBieSBtYXRjaGluZyB0aGUgYWdlbnQncyByZXBvLXJlbGF0aXZlIHBhdGggYWdhaW5zdFxuXHQgKiB0aGUgYXZhaWxhYmxlIGFnZW50cyAod2hpY2ggYWxyZWFkeSBjYXJyeSB0aGUgd29ya3RyZWUgcm9vdCkgcmF0aGVyIHRoYW4gdGhlXG5cdCAqIHNlc3Npb24ncyByZXBvcnRlZCB3b3JraW5nIGRpcmVjdG9yeS4gVGhlIHdvcmtpbmcgZGlyZWN0b3J5IGlzIHVucmVsaWFibGVcblx0ICogaGVyZTogdGhlIHdvcmt0cmVlLXBhdGhlZCBjdXN0b21pemF0aW9ucyBhcnJpdmUgd2VsbCBiZWZvcmUgZWl0aGVyIHRoZVxuXHQgKiBgU2Vzc2lvblN1bW1hcnlgIG9yIGBTZXNzaW9uU3RhdGVgIHdvcmtpbmctZGlyZWN0b3J5IGZsaXBzIHRvIHRoZSB3b3JrdHJlZSxcblx0ICogc28gYSB3b3JraW5nLWRpcmVjdG9yeS1rZXllZCByZWJhc2Ugd291bGQgbWlzcyB0aGUgd2luZG93IGFuZCBsZXQgdGhlIHBpY2tlclxuXHQgKiBkZXN0cnVjdGl2ZWx5IHJlc2V0IHRoZSBzZWxlY3Rpb24uIERlcml2aW5nIHRoZSB3b3JrdHJlZSByb290IGZyb20gdGhlIGFnZW50XG5cdCAqIGxpc3QgY2xvc2VzIHRoYXQgcmFjZS5cblx0ICpcblx0ICogTWlycm9ycyB0aGUgYWdlbnQtaG9zdCBiYWNrZW5kJ3MgY29kZSB0byByZWJhc2UgYnkgcmVsYXRpdmUgcGF0aC5cblx0ICogVGhlIHJlLXBvaW50IGlzIG9ubHkgYXBwbGllZCB0byBhIFVSSSB0aGF0IGFjdHVhbGx5IGV4aXN0cyBpblxuXHQgKiB0aGUgc3VwcGxpZWQgYWdlbnQgbGlzdCwgc28gaXQgbmV2ZXIgcnVucyBhaGVhZCBvZiB0aGUgaG9zdCByZXBvcnRpbmcgdGhlXG5cdCAqIHdvcmt0cmVlIGFnZW50cyAod2hpY2ggd291bGQgb3RoZXJ3aXNlIHJlLWludHJvZHVjZSB0aGUgbWlzbWF0Y2ggaXQgZml4ZXMpLlxuXHQgKi9cblx0cmVjb25jaWxlU2VsZWN0ZWRBZ2VudChhZ2VudHM6IHJlYWRvbmx5IEFnZW50Q3VzdG9taXphdGlvbltdKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMubW9kZS5nZXQoKTtcblx0XHRpZiAoIWN1cnJlbnQgfHwgYWdlbnRzLnNvbWUoYSA9PiBhLnVyaSA9PT0gY3VycmVudC5pZCkpIHtcblx0XHRcdHJldHVybjsgLy8gbm8gYWdlbnQgc2VsZWN0ZWQsIG9yIHRoZSBzZWxlY3Rpb24gaXMgYWxyZWFkeSB2YWxpZFxuXHRcdH1cblx0XHRjb25zdCBiYXNlID0gdGhpcy5fYWdlbnRCYXNlRGlyO1xuXHRcdGlmICghYmFzZSkge1xuXHRcdFx0cmV0dXJuOyAvLyB1bmtub3duIHJvb3QgZm9yIHRoZSBjdXJyZW50IHNlbGVjdGlvbiBcdTIwMTQgbm90aGluZyB0byByZWJhc2UgYWdhaW5zdFxuXHRcdH1cblx0XHRjb25zdCBhZ2VudFVyaSA9IFVSSS5wYXJzZShjdXJyZW50LmlkKTtcblx0XHRpZiAoIWlzRXF1YWxPclBhcmVudChhZ2VudFVyaSwgYmFzZSkpIHtcblx0XHRcdHJldHVybjsgLy8gYWdlbnQgbGl2ZXMgb3V0c2lkZSB0aGUgcmVwbyAoZS5nLiBhIHVzZXItZ2xvYmFsIGFnZW50KVxuXHRcdH1cblx0XHRjb25zdCByZWwgPSByZWxhdGl2ZVBhdGgoYmFzZSwgYWdlbnRVcmkpO1xuXHRcdGlmICghcmVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlbG9jYXRlZCA9IHRoaXMuX2ZpbmRSZWxvY2F0ZWRBZ2VudChhZ2VudHMsIGFnZW50VXJpLCBiYXNlLCByZWwpO1xuXHRcdGlmIChyZWxvY2F0ZWQpIHtcblx0XHRcdHRoaXMubW9kZS5zZXQoeyBpZDogcmVsb2NhdGVkLnVyaSwga2luZDogY3VycmVudC5raW5kIH0sIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9hZ2VudEJhc2VEaXIgPSByZWxvY2F0ZWQucm9vdDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRmluZHMgYW4gYXZhaWxhYmxlIGFnZW50IHRoYXQgaXMgdGhlIHNhbWUgcmVwby1yZWxhdGl2ZSBmaWxlIGFzIHRoZSBjdXJyZW50XG5cdCAqIHNlbGVjdGlvbiBidXQgcm9vdGVkIHVuZGVyIGEgZGlmZmVyZW50IGRpcmVjdG9yeSAoaXRzIHdvcmt0cmVlIHR3aW4pLlxuXHQgKlxuXHQgKiBBIGNhbmRpZGF0ZSBtYXRjaGVzIHdoZW4gaXRzIHBhdGggZW5kcyB3aXRoIGAvPHJlbD5gIG9uIGEgcGF0aC1zZWdtZW50XG5cdCAqIGJvdW5kYXJ5IGFuZCB0aGUgaW1wbGllZCByb290ICh0aGUgY2FuZGlkYXRlIHBhdGggbWludXMgdGhhdCBzdWZmaXgpIGRpZmZlcnNcblx0ICogZnJvbSBgYmFzZWAuIFRoZSByb290IGlzIHJlLXZhbGlkYXRlZCB3aXRoIGByZWxhdGl2ZVBhdGhgIHNvIG9ubHkgYSBnZW51aW5lXG5cdCAqIHJlbG9jYXRpb24gb2YgdGhlIHNhbWUgZmlsZSBpcyBhY2NlcHRlZC4gUmV0dXJucyB0aGUgbWF0Y2hlZCBhZ2VudCdzIFVSSSBhbmRcblx0ICogaXRzIGRlcml2ZWQgcm9vdCwgb3IgYHVuZGVmaW5lZGAgd2hlbiB0aGVyZSBpcyBubyB0d2luLlxuXHQgKi9cblx0cHJpdmF0ZSBfZmluZFJlbG9jYXRlZEFnZW50KFxuXHRcdGFnZW50czogcmVhZG9ubHkgQWdlbnRDdXN0b21pemF0aW9uW10sXG5cdFx0YWdlbnRVcmk6IFVSSSxcblx0XHRiYXNlOiBVUkksXG5cdFx0cmVsOiBzdHJpbmcsXG5cdCk6IHsgcmVhZG9ubHkgdXJpOiBzdHJpbmc7IHJlYWRvbmx5IHJvb3Q6IFVSSSB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzdWZmaXggPSBgLyR7cmVsfWA7XG5cdFx0Zm9yIChjb25zdCBhZ2VudCBvZiBhZ2VudHMpIHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IFVSSS5wYXJzZShhZ2VudC51cmkpO1xuXHRcdFx0aWYgKGNhbmRpZGF0ZS5zY2hlbWUgIT09IGFnZW50VXJpLnNjaGVtZSB8fCBjYW5kaWRhdGUuYXV0aG9yaXR5ICE9PSBhZ2VudFVyaS5hdXRob3JpdHkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWNhbmRpZGF0ZS5wYXRoLmVuZHNXaXRoKHN1ZmZpeCkgfHwgY2FuZGlkYXRlLnBhdGgubGVuZ3RoID09PSBzdWZmaXgubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBub3QgdGhlIHNhbWUgcmVsYXRpdmUgZmlsZSwgb3IgaXQgc2l0cyBhdCB0aGUgZmlsZXN5c3RlbSByb290XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByb290ID0gY2FuZGlkYXRlLndpdGgoeyBwYXRoOiBjYW5kaWRhdGUucGF0aC5zbGljZSgwLCBjYW5kaWRhdGUucGF0aC5sZW5ndGggLSBzdWZmaXgubGVuZ3RoKSB9KTtcblx0XHRcdGlmIChpc0VxdWFsKHJvb3QsIGJhc2UpIHx8IHJlbGF0aXZlUGF0aChyb290LCBjYW5kaWRhdGUpICE9PSByZWwpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIHNhbWUgcm9vdCAod291bGQgaGF2ZSBtYXRjaGVkIGV4YWN0bHkpLCBvciBub3QgYSBjbGVhbiByZWxvY2F0aW9uXG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyB1cmk6IGFnZW50LnVyaSwgcm9vdCB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlZWQgdGhlIHNlbGVjdGVkIGN1c3RvbSBhZ2VudCB3aGVuIGEgc2Vzc2lvbiBpcyByZXN1bWVkIChlLmcuIGFmdGVyIGFcblx0ICogd2luZG93IHJlbG9hZCkuIEEgZnJlc2hseSBsb2FkZWQgYWRhcHRlciBzdGFydHMgd2l0aCBgbW9kZSA9PT0gdW5kZWZpbmVkYDtcblx0ICogdGhlIGhvc3QgcGVyc2lzdHMgdGhlIHNlbGVjdGlvbiBvbiB0aGUgZGVmYXVsdCBjaGF0J3MgYENoYXRTdGF0ZS5kcmFmdC5hZ2VudGAsXG5cdCAqIHdoaWNoIHRoZSBwcm92aWRlciByZWFkcyBhbmQgbWlycm9ycyBvbnRvIGBzZXNzaW9uLm1vZGVgIGhlcmUuIEd1YXJkZWQgdG9cblx0ICogbmV2ZXIgb3ZlcnJpZGUgYSBsaXZlIHNlbGVjdGlvbiAoYSBQYXJ0IDEgZ3JhZHVhdGlvbiBzZWVkIG9yIGEgdXNlciBwaWNrKSxcblx0ICoga2VlcGluZyB0aGlzIGEgcmVzdW1lLW9ubHkgaHlkcmF0aW9uLlxuXHQgKi9cblx0aHlkcmF0ZVNlbGVjdGVkQWdlbnQoYWdlbnRVcmk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm1vZGUuZ2V0KCkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnNldENoYXRBZ2VudCh0aGlzLnJlc291cmNlLCB7IHVyaTogYWdlbnRVcmksIG5hbWU6ICcnIH0pO1xuXHR9XG5cblx0Z2V0Q2hhdE1vZGVsSWQoY2hhdFJlc291cmNlOiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBjaGF0UmVzb3VyY2UuZnJhZ21lbnRcblx0XHRcdD8gdGhpcy5fZ2V0QWRkaXRpb25hbENoYXQoY2hhdFJlc291cmNlKT8uY2hhdC5tb2RlbElkLmdldCgpXG5cdFx0XHQ6IHRoaXMubW9kZWxJZC5nZXQoKTtcblx0fVxuXG5cdGdldENoYXRNb2RlbFNlbGVjdGlvbihjaGF0UmVzb3VyY2U6IFVSSSk6IE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtb2RlbElkID0gdGhpcy5nZXRDaGF0TW9kZWxJZChjaGF0UmVzb3VyY2UpO1xuXHRcdGlmIChtb2RlbElkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9Nb2RlbFNlbGVjdGlvbihtb2RlbElkKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNoYXRSZXNvdXJjZS5mcmFnbWVudCA/IHVuZGVmaW5lZCA6IHRoaXMubW9kZWxTZWxlY3Rpb247XG5cdH1cblxuXHRnZXRDaGF0TW9kZShjaGF0UmVzb3VyY2U6IFVSSSk6IHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkga2luZDogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBjaGF0UmVzb3VyY2UuZnJhZ21lbnRcblx0XHRcdD8gdGhpcy5fZ2V0QWRkaXRpb25hbENoYXQoY2hhdFJlc291cmNlKT8uY2hhdC5tb2RlLmdldCgpXG5cdFx0XHQ6IHRoaXMubW9kZS5nZXQoKTtcblx0fVxuXG5cdC8qKiBPcHRpbWlzdGljYWxseSBzZXQgdGhlIGRlZmF1bHQgY2hhdCB0YWIgdGl0bGUgKGluZGVwZW5kZW50IG9mIHRoZSBzZXNzaW9uIHRpdGxlKS4gKi9cblx0c2V0RGVmYXVsdENoYXRUaXRsZSh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVmYXVsdENoYXRUaXRsZU92ZXJyaWRlLnNldCh0aXRsZSB8fCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKiogT3B0aW1pc3RpY2FsbHkgc2V0IGFuIGFkZGl0aW9uYWwgcGVlciBjaGF0J3MgdGl0bGUgYWhlYWQgb2YgdGhlIGhvc3QncyBgY2hhdFVwZGF0ZWRgLiAqL1xuXHRzZXRBZGRpdGlvbmFsQ2hhdFRpdGxlKGNoYXRJZDogc3RyaW5nLCB0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fYWRkaXRpb25hbENoYXRzLmdldChjaGF0SWQpPy5zZXRUaXRsZSh0aXRsZSk7XG5cdH1cblxuXHRwcml2YXRlIF90b01vZGVsU2VsZWN0aW9uKG1vZGVsSWQ6IHN0cmluZyk6IE1vZGVsU2VsZWN0aW9uIHtcblx0XHRjb25zdCBwcmVmaXggPSBgJHt0aGlzLl9yZXNvdXJjZVNjaGVtZX06YDtcblx0XHRyZXR1cm4geyBpZDogbW9kZWxJZC5zdGFydHNXaXRoKHByZWZpeCkgPyBtb2RlbElkLnN1YnN0cmluZyhwcmVmaXgubGVuZ3RoKSA6IG1vZGVsSWQgfTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEFkZGl0aW9uYWxDaGF0KGNoYXRSZXNvdXJjZTogVVJJKTogQWRkaXRpb25hbENoYXQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGJ5RnJhZ21lbnQgPSBjaGF0UmVzb3VyY2UuZnJhZ21lbnQgPyB0aGlzLl9hZGRpdGlvbmFsQ2hhdHMuZ2V0KGNoYXRSZXNvdXJjZS5mcmFnbWVudCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGJ5RnJhZ21lbnQpIHtcblx0XHRcdHJldHVybiBieUZyYWdtZW50O1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGNoYXQgb2YgdGhpcy5fYWRkaXRpb25hbENoYXRzLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoaXNFcXVhbChjaGF0LmNoYXQucmVzb3VyY2UsIGNoYXRSZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuIGNoYXQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVDaGFuZ2VzT2JzKCk6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPiB7XG5cdFx0Y29uc3QgZGVmYXVsdENoYW5nZXNldE9icyA9IGRlcml2ZWRPcHRzPElTZXNzaW9uQ2hhbmdlc2V0IHwgdW5kZWZpbmVkPih7XG5cdFx0XHRlcXVhbHNGbjogKGMxLCBjMikgPT4gYzE/LmlkID09PSBjMj8uaWRcblx0XHR9LCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY2hhbmdlc2V0cyA9IHRoaXMuY2hhbmdlc2V0cy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWNoYW5nZXNldHMpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGNoYW5nZXNldHMuZmluZChjID0+IGMuaXNEZWZhdWx0LnJlYWQocmVhZGVyKSA9PT0gdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBkZWZhdWx0Q2hhbmdlc2V0Q2hhbmdlc09icyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRDaGFuZ2VzZXQgPSBkZWZhdWx0Q2hhbmdlc2V0T2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghZGVmYXVsdENoYW5nZXNldCkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZGVmYXVsdENoYW5nZXNldC5jaGFuZ2VzLnJlYWQocmVhZGVyKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBkZXJpdmVkT3B0cyh7IGVxdWFsc0ZuOiBzZXNzaW9uRmlsZUNoYW5nZXNFcXVhbCB9LFxuXHRcdFx0cmVhZGVyID0+IGRlZmF1bHRDaGFuZ2VzZXRDaGFuZ2VzT2JzLnJlYWQocmVhZGVyKSA/PyBbXSk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIGZpZWxkcyBmcm9tIGEgcmVmcmVzaGVkIG1ldGFkYXRhIHNuYXBzaG90LiBSZXR1cm5zIGB0cnVlYCBpZmZcblx0ICogYW55IHVzZXItdmlzaWJsZSBmaWVsZCBjaGFuZ2VkLlxuXHQgKi9cblx0dXBkYXRlKG1ldGFkYXRhOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEpOiBib29sZWFuIHtcblx0XHRsZXQgZGlkQ2hhbmdlID0gZmFsc2U7XG5cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRjb25zdCBzdW1tYXJ5ID0gbWV0YWRhdGEuc3VtbWFyeTtcblx0XHRcdGlmIChzdW1tYXJ5ICE9PSB1bmRlZmluZWQgJiYgc3VtbWFyeSAhPT0gdGhpcy50aXRsZS5nZXQoKSkge1xuXHRcdFx0XHR0aGlzLnRpdGxlLnNldChzdW1tYXJ5LCB0eCk7XG5cdFx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChtZXRhZGF0YS5zdGF0dXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCB1aVN0YXR1cyA9IG1hcFByb3RvY29sU3RhdHVzKG1ldGFkYXRhLnN0YXR1cyk7XG5cdFx0XHRcdGlmICh1aVN0YXR1cyAhPT0gdGhpcy5zdGF0dXMuZ2V0KCkpIHtcblx0XHRcdFx0XHR0aGlzLnN0YXR1cy5zZXQodWlTdGF0dXMsIHR4KTtcblx0XHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vZGlmaWVkVGltZSA9IG1ldGFkYXRhLm1vZGlmaWVkVGltZTtcblx0XHRcdGlmICh0aGlzLnVwZGF0ZWRBdC5nZXQoKS5nZXRUaW1lKCkgIT09IG1vZGlmaWVkVGltZSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZWRBdC5zZXQobmV3IERhdGUobW9kaWZpZWRUaW1lKSwgdHgpO1xuXHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjdXJyZW50TGFzdFR1cm5FbmRUaW1lID0gdGhpcy5sYXN0VHVybkVuZC5nZXQoKT8uZ2V0VGltZSgpO1xuXHRcdFx0Y29uc3QgbmV4dExhc3RUdXJuRW5kVGltZSA9IG1vZGlmaWVkVGltZSA/IG1vZGlmaWVkVGltZSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChjdXJyZW50TGFzdFR1cm5FbmRUaW1lICE9PSBuZXh0TGFzdFR1cm5FbmRUaW1lKSB7XG5cdFx0XHRcdHRoaXMubGFzdFR1cm5FbmQuc2V0KG5leHRMYXN0VHVybkVuZFRpbWUgIT09IHVuZGVmaW5lZCA/IG5ldyBEYXRlKG5leHRMYXN0VHVybkVuZFRpbWUpIDogdW5kZWZpbmVkLCB0eCk7XG5cdFx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3Byb2plY3QgPSBtZXRhZGF0YS5wcm9qZWN0O1xuXHRcdFx0dGhpcy5fd29ya2luZ0RpcmVjdG9yaWVzID0gbWV0YWRhdGEud29ya2luZ0RpcmVjdG9yaWVzO1xuXHRcdFx0Ly8gT25seSB1cGRhdGUgYF9tZXRhYCB3aGVuIHRoZSBzb3VyY2UgYWN0dWFsbHkgcHJvdmlkZXMgb25lIFx1MjAxNCBhblxuXHRcdFx0Ly8gdW5kZWZpbmVkIHZhbHVlIG1lYW5zIFwibm90IGluY2x1ZGVkXCIgKGUuZy4gYSBzdW1tYXJ5IHBhdGggdGhhdFxuXHRcdFx0Ly8gb21pdHMgaXQpLCBub3QgXCJjbGVhcmVkXCIuIFRoZSBhdXRob3JpdGF0aXZlIGdpdC1zdGF0ZSBgX21ldGFgXG5cdFx0XHQvLyBzdGlsbCBmbG93cyB2aWEgYHNldE1ldGFgIGZyb20gYFNlc3Npb25TdGF0ZWAgc3Vic2NyaXB0aW9ucy5cblx0XHRcdC8vXG5cdFx0XHQvLyBgc2V0TWV0YWAgcmVidWlsZHMgdGhlIHdvcmtzcGFjZSBmcm9tIHRoZSBwcm9qZWN0IC8gd29ya2luZ1xuXHRcdFx0Ly8gZGlyZWN0b3JpZXMgYXNzaWduZWQganVzdCBhYm92ZSBwbHVzIHRoZSBpbmNvbWluZyBgX21ldGFgLCBzbyBpdFxuXHRcdFx0Ly8gZnVsbHkgc3Vic3VtZXMgdGhlIHJlYnVpbGQgYmVsb3cgXHUyMDE0IHJ1bm5pbmcgYm90aCB3b3VsZCByZWNvbXB1dGVcblx0XHRcdC8vIHRoZSBzYW1lIHdvcmtzcGFjZSB0d2ljZSBmb3IgZXZlcnkgYF9tZXRhYC1iZWFyaW5nIHJlZnJlc2guIFRoZVxuXHRcdFx0Ly8gZmFsbGJhY2sgaXMgb25seSBmb3Igc25hcHNob3RzIHRoYXQgY2Fycnkgbm8gYF9tZXRhYC5cblx0XHRcdGlmIChtZXRhZGF0YS5fbWV0YSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlmICh0aGlzLnNldE1ldGEobWV0YWRhdGEuX21ldGEsIHR4KSkge1xuXHRcdFx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuX2NvbXB1dGVXb3Jrc3BhY2UoKTtcblx0XHRcdFx0aWYgKGFnZW50SG9zdFNlc3Npb25Xb3Jrc3BhY2VLZXkod29ya3NwYWNlKSAhPT0gYWdlbnRIb3N0U2Vzc2lvbldvcmtzcGFjZUtleSh0aGlzLndvcmtzcGFjZS5nZXQoKSkpIHtcblx0XHRcdFx0XHR0aGlzLndvcmtzcGFjZS5zZXQod29ya3NwYWNlLCB0eCk7XG5cdFx0XHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAobWV0YWRhdGEuc3RhdHVzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgaXNBcmNoaXZlZCA9IGlzU2Vzc2lvblN0YXR1c0FyY2hpdmVkKG1ldGFkYXRhLnN0YXR1cyk7XG5cdFx0XHRcdGlmIChpc0FyY2hpdmVkICE9PSB0aGlzLmlzQXJjaGl2ZWQuZ2V0KCkpIHtcblx0XHRcdFx0XHR0aGlzLmlzQXJjaGl2ZWQuc2V0KGlzQXJjaGl2ZWQsIHR4KTtcblx0XHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaXNSZWFkID0gaXNTZXNzaW9uU3RhdHVzUmVhZChtZXRhZGF0YS5zdGF0dXMpO1xuXHRcdFx0XHRpZiAoaXNSZWFkICE9PSB0aGlzLmlzUmVhZC5nZXQoKSkge1xuXHRcdFx0XHRcdHRoaXMuaXNSZWFkLnNldChpc1JlYWQsIHR4KTtcblx0XHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIGBtZXRhZGF0YS5jaGFuZ2VzYCAoYWdncmVnYXRlKSBkcml2ZXMgdGhlIGNoaXAgYWdncmVnYXRlLlxuXHRcdFx0Ly8gVGhlIGRyb3Bkb3duIGNvbnRlbnQgaXMgYnVpbHQgc2VwYXJhdGVseSB2aWEgYGNyZWF0ZUNoYW5nZXNldHNgLlxuXHRcdFx0aWYgKG1ldGFkYXRhLmNoYW5nZXMgIT09IHVuZGVmaW5lZCAmJiB0aGlzLnNldENoYW5nZXNTdW1tYXJ5KG1ldGFkYXRhLmNoYW5nZXMsIHR4KSkge1xuXHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fYWN0aXZpdHkuZ2V0KCkgIT09IG1ldGFkYXRhLmFjdGl2aXR5KSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2aXR5LnNldChtZXRhZGF0YS5hY3Rpdml0eSwgdHgpO1xuXHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGRpZENoYW5nZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXRzIHRoZSBhY3Rpdml0eSB0ZXh0IGZyb20gYSBgU2Vzc2lvblN1bW1hcnlDaGFuZ2VkYCBub3RpZmljYXRpb24uXG5cdCAqIFJldHVybnMgYHRydWVgIGlmZiB0aGUgYWN0aXZpdHkgb2JzZXJ2YWJsZSBjaGFuZ2VkLiBDYWxsZXJzIGluc2lkZSBhXG5cdCAqIHRyYW5zYWN0aW9uIE1VU1QgcGFzcyBpdCBcdTIwMTQgc2VlIHtAbGluayBzZXRDaGFuZ2VzU3VtbWFyeX0uXG5cdCAqL1xuXHRzZXRBY3Rpdml0eShhY3Rpdml0eTogc3RyaW5nIHwgdW5kZWZpbmVkLCB0eD86IElUcmFuc2FjdGlvbik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9hY3Rpdml0eS5nZXQoKSAhPT0gYWN0aXZpdHkpIHtcblx0XHRcdHRoaXMuX2FjdGl2aXR5LnNldChhY3Rpdml0eSwgdHgpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGx5IGEgYF9tZXRhYCBkZWx0YSAodGhlIHNoYXJlZCBzZXNzaW9uLXN0YXRlIC8gc2Vzc2lvbi1zdW1tYXJ5IGJhZyxcblx0ICogZmVkIGZyb20gYF9hcHBseVNlc3Npb25NZXRhRnJvbVN0YXRlYCBvciBhIGBTZXNzaW9uU3VtbWFyeUNoYW5nZWRgXG5cdCAqIG5vdGlmaWNhdGlvbiksIHByb21vdGUgdGhlIHNlc3Npb24ga2luZCBpZiB0aGUgZGVsdGEgcmVwb3J0cyBpdFxuXHQgKiB3b3Jrc3BhY2UtbGVzcywgYW5kIHJlYnVpbGQgdGhlIHdvcmtzcGFjZSBpZiB0aGUgZ2l0IHN0YXRlIGNoYW5nZWQuXG5cdCAqIFJldHVybnMgYHRydWVgIGlmZiBhbnl0aGluZyBvYnNlcnZhYmxlIGNoYW5nZWQsIHNvIHRoZSBsaXN0IHJlZ3JvdXBzIGFcblx0ICogc2Vzc2lvbiB0aGF0IGJlY2FtZSBhIHF1aWNrIGNoYXQgd2l0aG91dCBldmVyIGhhdmluZyBoYWQgYSB3b3Jrc3BhY2UuXG5cdCAqXG5cdCAqIENhbGxlcnMgdGhhdCBhcmUgYWxyZWFkeSBpbnNpZGUgYSB0cmFuc2FjdGlvbiBNVVNUIHBhc3MgaXQ6IGEgcGxhaW5cblx0ICogYHRyYW5zYWN0aW9uKClgIGhlcmUgd291bGQgZmluaXNoIChhbmQgdGhlcmVmb3JlIG5vdGlmeSkgbWlkLXdheSB0aHJvdWdoXG5cdCAqIHRoZSBlbmNsb3Npbmcgb25lLCBsZXR0aW5nIG9ic2VydmVycyBvZiBgX21ldGFgIC8gYGlzUXVpY2tDaGF0YCAvXG5cdCAqIGB3b3Jrc3BhY2VgIHJlYWQgYSB0b3JuIHNuYXBzaG90IG9mIHRoZSBmaWVsZHMgdGhlIGNhbGxlciBoYXMgbm90IGFwcGxpZWRcblx0ICogeWV0LlxuXHQgKi9cblx0c2V0TWV0YShtZXRhOiBTZXNzaW9uTWV0YSB8IHVuZGVmaW5lZCwgdHg/OiBJVHJhbnNhY3Rpb24pOiBib29sZWFuIHtcblx0XHR0aGlzLl9tZXRhID0gbWV0YTtcblx0XHRsZXQgZGlkQ2hhbmdlID0gZmFsc2U7XG5cdFx0c3VidHJhbnNhY3Rpb24odHgsIHR4ID0+IHtcblx0XHRcdHRoaXMuX21ldGFPYnMuc2V0KHRoaXMuX21ldGEsIHR4KTtcblx0XHRcdGRpZENoYW5nZSA9IHRoaXMuX3Byb21vdGVUb1F1aWNrQ2hhdElmV29ya3NwYWNlbGVzcyh0eCk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLl9jb21wdXRlV29ya3NwYWNlKCk7XG5cdFx0XHRpZiAoYWdlbnRIb3N0U2Vzc2lvbldvcmtzcGFjZUtleSh3b3Jrc3BhY2UpICE9PSBhZ2VudEhvc3RTZXNzaW9uV29ya3NwYWNlS2V5KHRoaXMud29ya3NwYWNlLmdldCgpKSkge1xuXHRcdFx0XHR0aGlzLndvcmtzcGFjZS5zZXQod29ya3NwYWNlLCB0eCk7XG5cdFx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGRpZENoYW5nZTtcblx0fVxuXG5cdC8qKiBSZWNvcmRzIHRoYXQgdGhpcyBzZXNzaW9uIHJ1bnMgd2l0aCB3b3JrdHJlZSBpc29sYXRpb24uIFNlZSB7QGxpbmsgd29ya3RyZWVQZW5kaW5nfS4gKi9cblx0c2V0V29ya3RyZWVJc29sYXRpb24oaXNvbGF0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl93b3JrdHJlZUlzb2xhdGlvbi5zZXQoaXNvbGF0ZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKipcblx0ICogSGVhbCBhbiBhZGFwdGVyIGJvcm4gbWlzLWNsYXNzaWZpZWQgYmVjYXVzZSB0aGUgcGF0aCB0aGF0IG1hdGVyaWFsaXplZCBpdFxuXHQgKiBjYXJyaWVkIG5vIGBfbWV0YWAgKGEgc3RhbGUgcGVyc2lzdGVkIGNhY2hlLCBhbiBvbGRlciBob3N0KS4gT25lLXdheTogYW5cblx0ICogYWJzZW50IG1hcmtlciBtZWFucyBcIm5vdCBpbmNsdWRlZFwiLCBuZXZlciBcImNsZWFyZWRcIiwgc28gYSBxdWljayBjaGF0IGlzXG5cdCAqIG5ldmVyIGRlbW90ZWQgYmFjayBpbnRvIGEgd29ya3NwYWNlIHNlc3Npb24gcm9vdGVkIGF0IGl0cyBzY3JhdGNoIGN3ZC5cblx0ICovXG5cdHByaXZhdGUgX3Byb21vdGVUb1F1aWNrQ2hhdElmV29ya3NwYWNlbGVzcyh0eDogSVRyYW5zYWN0aW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2lzUXVpY2tDaGF0LmdldCgpIHx8ICFyZWFkU2Vzc2lvbldvcmtzcGFjZWxlc3ModGhpcy5fbWV0YSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5faXNRdWlja0NoYXQuc2V0KHRydWUsIHR4KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB0aGUgc2Vzc2lvbiB3b3Jrc3BhY2UuIFF1aWNrIGNoYXRzIHN0YXkgd29ya3NwYWNlLWxlc3Ncblx0ICogKGB1bmRlZmluZWRgKSByZWdhcmRsZXNzIG9mIGFueSBzY3JhdGNoIHdvcmtpbmcgZGlyZWN0b3J5IHRoZSBob3N0XG5cdCAqIGFzc2lnbmVkOyB3b3Jrc3BhY2Ugc2Vzc2lvbnMgYnVpbGQgZnJvbSBwcm9qZWN0L2dpdCBtZXRhZGF0YS5cblx0ICovXG5cdHByaXZhdGUgX2NvbXB1dGVXb3Jrc3BhY2UoKTogSVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9raW5kLmNvbXB1dGVXb3Jrc3BhY2UoKCkgPT4gdGhpcy5fb3B0aW9ucy5idWlsZFdvcmtzcGFjZSh0aGlzLl9wcm9qZWN0LCB0aGlzLl93b3JraW5nRGlyZWN0b3JpZXMsIHRoaXMuZ2l0SHViSW5mbywgcmVhZFNlc3Npb25HaXRTdGF0ZSh0aGlzLl9tZXRhKSkpO1xuXHR9XG5cblx0dXBkYXRlQ2hhbmdlc2V0cyhjaGFuZ2VzZXRzTWV0YWRhdGE6IHJlYWRvbmx5IENoYW5nZXNldFtdIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKCFjaGFuZ2VzZXRzTWV0YWRhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjaGFuZ2VzZXRzID0gY3JlYXRlQ2hhbmdlc2V0cyh0aGlzLmJhY2tlbmRVcmksIHRoaXMuX29wdGlvbnMsIHRoaXMuaXNBY3RpdmVTZXNzaW9uT2JzLCBjaGFuZ2VzZXRzTWV0YWRhdGEpO1xuXG5cdFx0dGhpcy5jaGFuZ2VzZXRzLnNldChjaGFuZ2VzZXRzLCB1bmRlZmluZWQpO1xuXHR9XG59XG5cbi8qKlxuICogYGtpbmRgIGxpdGVyYWwgdXNlZCBvbiBgSVNlc3Npb24ubW9kZWAgd2hlbiB0aGUgbW9kZSBzbG90IGNhcnJpZXMgYVxuICogY3VzdG9tLWFnZW50IHNlbGVjdGlvbi4gVGhlIGBtb2RlLmlkYCBpcyB0aGVuIHRoZSBhZ2VudCdzIFVSSS5cbiAqL1xuZXhwb3J0IGNvbnN0IEFHRU5UX01PREVfS0lORCA9ICdhZ2VudCc7XG5cbmZ1bmN0aW9uIGN1c3RvbWl6YXRpb25zQ2hhbmdlZChwcmV2aW91czogU2Vzc2lvblN0YXRlLCBzdGF0ZTogU2Vzc2lvblN0YXRlKTogYm9vbGVhbiB7XG5cdGlmIChwcmV2aW91cy5jdXN0b21pemF0aW9ucyAhPT0gc3RhdGUuY3VzdG9taXphdGlvbnMpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRjb25zdCBwcmV2aW91c0FjdGl2ZUN1c3RvbWl6YXRpb25zID0gZmxhdHRlbkFjdGl2ZUNsaWVudEN1c3RvbWl6YXRpb25zKHByZXZpb3VzKTtcblx0Y29uc3QgY3VycmVudEFjdGl2ZUN1c3RvbWl6YXRpb25zID0gZmxhdHRlbkFjdGl2ZUNsaWVudEN1c3RvbWl6YXRpb25zKHN0YXRlKTtcblx0cmV0dXJuICFhcnJheUVxdWFscyhwcmV2aW91c0FjdGl2ZUN1c3RvbWl6YXRpb25zLCBjdXJyZW50QWN0aXZlQ3VzdG9taXphdGlvbnMsIChhLCBiKSA9PiB7XG5cdFx0aWYgKGEubm9uY2UgIT09IHVuZGVmaW5lZCAmJiBhLm5vbmNlID09PSBiLm5vbmNlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGEgPT09IGI7XG5cdH0pO1xufVxuXG4vKiogRmxhdHRlbnMgdGhlIGN1c3RvbWl6YXRpb25zIGNvbnRyaWJ1dGVkIGJ5IGV2ZXJ5IGFjdGl2ZSBjbGllbnQgb2YgYSBzZXNzaW9uLiAqL1xuZnVuY3Rpb24gZmxhdHRlbkFjdGl2ZUNsaWVudEN1c3RvbWl6YXRpb25zKHN0YXRlOiBTZXNzaW9uU3RhdGUpOiBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10ge1xuXHRjb25zdCByZXN1bHQ6IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGNsaWVudCBvZiBzdGF0ZS5hY3RpdmVDbGllbnRzKSB7XG5cdFx0aWYgKGNsaWVudC5jdXN0b21pemF0aW9ucykge1xuXHRcdFx0cmVzdWx0LnB1c2goLi4uY2xpZW50LmN1c3RvbWl6YXRpb25zKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gTmV3U2Vzc2lvbiBcdTIwMTQgYnVuZGxlcyB0aGUgaW4tZmxpZ2h0IG5ldy1zZXNzaW9uIHN0YXRlXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogSW5wdXRzIG5lZWRlZCB0byBjb25zdHJ1Y3QgYSB7QGxpbmsgTmV3U2Vzc2lvbn0uXG4gKi9cbmludGVyZmFjZSBJTmV3U2Vzc2lvbkNvbnN0cnVjdGlvbkNvbnRleHQge1xuXHQvKipcblx0ICogV29ya3NwYWNlIHRoZSBzZXNzaW9uIGlzIHNjb3BlZCB0bywgb3IgYHVuZGVmaW5lZGAgZm9yIGEgKipxdWljayBjaGF0Kipcblx0ICogKGEgd29ya3NwYWNlLWxlc3Mgc2Vzc2lvbiBub3QgYm91bmQgdG8gYW55IGZvbGRlcikuIFdoZW4gYHVuZGVmaW5lZGAsXG5cdCAqIHtAbGluayBxdWlja0NoYXR9IG11c3QgYmUgYHRydWVgIGFuZCB0aGUgYmFja2VuZCBzZXNzaW9uIGlzIGNyZWF0ZWQgd2l0aFxuXHQgKiBubyBgd29ya2luZ0RpcmVjdG9yeWAgKHRoZSBob3N0IGFzc2lnbnMgYSB0aHJvd2F3YXkgc2NyYXRjaCBjd2QpLlxuXHQgKi9cblx0cmVhZG9ubHkgd29ya3NwYWNlOiBJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIGB0cnVlYCB3aGVuIHRoaXMgaXMgYSBxdWljayBjaGF0IChzZWUge0BsaW5rIHdvcmtzcGFjZX0pLiBGb3J3YXJkZWQgdG8gdGhlXG5cdCAqIGFnZW50IGhvc3Qgb24gYGNyZWF0ZVNlc3Npb25gIHNvIHRoZSBzZXNzaW9uIGlzIHRhZ2dlZCBhbmQgcm91dGVkIGFzXG5cdCAqIHdvcmtzcGFjZS1sZXNzLlxuXHQgKi9cblx0cmVhZG9ubHkgcXVpY2tDaGF0PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2Vzc2lvblR5cGU6IElTZXNzaW9uVHlwZTtcblx0cmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uOiBUaGVtZUljb247XG5cdHJlYWRvbmx5IHJlc291cmNlU2NoZW1lOiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBUaGUgVVJJIHNjaGVtZSB1c2VkIHRvIHJlY29uc3RydWN0IHRoaXMgZHJhZnQncyBiYWNrZW5kICh3aXJlKSBzZXNzaW9uIFVSSSxcblx0ICogd2hlbiBpdCBkaWZmZXJzIGZyb20gdGhlIGFnZW50IHByb3ZpZGVyICh7QGxpbmsgc2Vzc2lvblR5cGV9LmlkKS4gRGVmYXVsdHMgdG9cblx0ICogdGhlIGFnZW50IHByb3ZpZGVyLiBDbG91ZCBzYW5kYm94IGNyZWF0ZXMgc2Vzc2lvbnMgdW5kZXIgYGFocC1zZXNzaW9uOi88aWQ+YFxuXHQgKiB3aGlsZSB0aGUgYWdlbnQgcHJvdmlkZXIgaXMgYGNvcGlsb3RgOyB0aGUgZWFnZXIgYmFja2VuZCBgY3JlYXRlU2Vzc2lvbmAvXG5cdCAqIHN1YnNjcmliZSBtdXN0IHVzZSB0aGlzIHNjaGVtZSBzbyBpdCBtYXRjaGVzIHRoZSBoYW5kbGVyJ3MgY3JlYXRlIHBhdGguXG5cdCAqL1xuXHRyZWFkb25seSBiYWNrZW5kU2Vzc2lvblNjaGVtZT86IHN0cmluZztcblx0cmVhZG9ubHkgYXV0aGVudGljYXRpb25QZW5kaW5nOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2U7XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBpbml0aWFsIGNvbmZpZyB2YWx1ZXMgdG8gc2VlZCBpbnRvIHRoZSBuZXcgc2Vzc2lvbiBiZWZvcmUgaXRzXG5cdCAqIGZpcnN0IHtAbGluayBOZXdTZXNzaW9uLnJlc29sdmVDb25maWd9IHJvdW5kLXRyaXAuIFVzZWQgdG8gZm9yd2FyZFxuXHQgKiBgY2hhdC5wZXJtaXNzaW9ucy5kZWZhdWx0YCBpbnRvIHRoZSBhZ2VudCBob3N0J3MgYGF1dG9BcHByb3ZlYCBzbG90IGFuZFxuXHQgKiBgZ2l0LmJyYW5jaFByZWZpeGAgaW50byB0aGUgYHdvcmt0cmVlQnJhbmNoUHJlZml4YCBzbG90IHNvIHRoZSB2YWx1ZXMgYXJlXG5cdCAqIHByZXNlbnQgZnJvbSB0aGUgdmVyeSBmaXJzdCBgcmVzb2x2ZUNvbmZpZ2AvYGNyZWF0ZVNlc3Npb25gLlxuXHQgKi9cblx0cmVhZG9ubHkgaW5pdGlhbENvbmZpZ1ZhbHVlcz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHQvKipcblx0ICogT3B0aW9uYWwgcHJvcGVydHkgc2NoZW1hcyB0byBzZWVkIGludG8gdGhlIG5ldyBzZXNzaW9uJ3MgY29uZmlnIGJlZm9yZSBpdHNcblx0ICogZmlyc3Qge0BsaW5rIE5ld1Nlc3Npb24ucmVzb2x2ZUNvbmZpZ30gcm91bmQtdHJpcC4gQ2FycmllZCBvdmVyIGZyb20gdGhlXG5cdCAqIHByb3ZpZGVyJ3MgY2FjaGUgb2Ygd2VsbC1rbm93biBjaGlwcyAoaXNvbGF0aW9uL2JyYW5jaCkgc28gdGhvc2UgY2hpcHMgc3RheVxuXHQgKiB2aXNpYmxlIChkaXNhYmxlZCkgd2hpbGUgdGhlIGRyYWZ0IHJlLXJlc29sdmVzLCBpbnN0ZWFkIG9mIGJsYW5raW5nLlxuXHQgKi9cblx0cmVhZG9ubHkgaW5pdGlhbENvbmZpZ1NjaGVtYT86IFJlY29yZDxzdHJpbmcsIFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYT47XG5cdC8qKlxuXHQgKiBJbnN0YW50aWF0aW9uIHNlcnZpY2UgdXNlZCB0byBjb25zdHJ1Y3QgdGhlIHNlc3Npb24ncyBjaGFuZ2VzZXRcblx0ICogcmVzb2x2ZXJzLCBzbyB0aGUgbmV3LXNlc3Npb24gc2tlbGV0b24gc3VyZmFjZXMgdGhlIHNhbWUgY2hhbmdlc2V0XG5cdCAqIGxpc3QgYXMgdGhlIGNvbW1pdHRlZCBzZXNzaW9uIHRoYXQgcmVwbGFjZXMgaXQuXG5cdCAqL1xuXHRyZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHQvKipcblx0ICogRm9yd2FyZHMgYFNlc3Npb25TdGF0ZWAgc25hcHNob3RzIGZyb20gdGhlIGVhZ2VybHktaGVsZCB3aXJlXG5cdCAqIHN1YnNjcmlwdGlvbiBiYWNrIHRvIHRoZSBwcm92aWRlci4gYHN0YXRlID09PSB1bmRlZmluZWRgIGlzIGFcblx0ICogY2xlYW51cCBzZW50aW5lbCBlbWl0dGVkIGJ5IHtAbGluayBOZXdTZXNzaW9uLmRpc3Bvc2V9IG9uIHRoZVxuXHQgKiBjbG9zZS13aXRob3V0LWdyYWR1YXRpb24gcGF0aCBzbyB0aGUgcHJvdmlkZXIgY2FuIGRyb3AgYW55IGNhY2hlZFxuXHQgKiBlbnRyeSBpdCBhY2N1bXVsYXRlZCBmb3IgdGhpcyBzZXNzaW9uLiBUaGUgZ3JhZHVhdGlvbiBwYXRoIHNraXBzXG5cdCAqIHRoaXMgc2VudGluZWwgYmVjYXVzZSB0aGUgcnVubmluZy1zZXNzaW9uIHN1YnNjcmlwdGlvbiBwaXBlbGluZVxuXHQgKiB0YWtlcyBvdmVyIG93bmVyc2hpcCBvZiB0aGUgc2FtZSBgc2Vzc2lvbklkYCBrZXkuXG5cdCAqL1xuXHRyZWFkb25seSBvblNlc3Npb25TdGF0ZT86IChzZXNzaW9uSWQ6IHN0cmluZywgc3RhdGU6IFNlc3Npb25TdGF0ZSB8IHVuZGVmaW5lZCkgPT4gdm9pZDtcblx0LyoqIEluaXRpYWwgYWN0aXZlLWNsaWVudCBzbmFwc2hvdCBmb3IgdGhlIGVhZ2VyIGBjcmVhdGVTZXNzaW9uYC4gRHJpZnQgaXMgcmVjb25jaWxlZCBieSB0aGUgaGFuZGxlciBiZWZvcmUgdGhlIGZpcnN0IG1lc3NhZ2UuICovXG5cdHJlYWRvbmx5IGFjdGl2ZUNsaWVudD86IFNlc3Npb25BY3RpdmVDbGllbnQ7XG59XG5cbi8qKlxuICogQnVuZGxlcyB0aGUgYXQtbW9zdC1vbmUgaW4tZmxpZ2h0IFwibmV3IHNlc3Npb25cIiBcdTIwMTQgdGhlIHNlc3Npb24gYmVpbmdcbiAqIGNvbXBvc2VkIGluIHRoZSBuZXctY2hhdCB2aWV3IGJlZm9yZSB0aGUgZmlyc3QgbWVzc2FnZSBpcyBzZW50LlxuICpcbiAqIEVuY2Fwc3VsYXRlczpcbiAqICAtIHRoZSBgSVNlc3Npb25gIHNrZWxldG9uICsgaXRzIG9ic2VydmFibGVzIChzdGF0dXMsIG1vZGVsSWQsIGxvYWRpbmcpXG4gKiAgLSB0aGUgdXNlcidzIHNlbGVjdGVkIG1vZGVsIChyZWFkIGJ5IGBzZW5kUmVxdWVzdGApXG4gKiAgLSB0aGUgcmVzb2x2ZWQgc2Vzc2lvbiBjb25maWcgKyBhIHN0YWxlLXJlcXVlc3QgZ3VhcmRcbiAqICAtIHRoZSBlYWdlcmx5IGNyZWF0ZWQgYmFja2VuZCBzZXNzaW9uIChVUkkgKyBzdWJzY3JpcHRpb24pIHRoYXQgbGV0cyB0aGVcbiAqICAgIGNoYXQgaGFuZGxlciBza2lwIGl0cyBsZWdhY3kgYGNyZWF0ZVNlc3Npb25gLW9uLWZpcnN0LW1lc3NhZ2Ugcm91bmQtdHJpcFxuICpcbiAqIExpZmVjeWNsZTpcbiAqICAtIHtAbGluayBlYWdlckNyZWF0ZX0gZmlyZXMgYGNvbm5lY3Rpb24uY3JlYXRlU2Vzc2lvbmAgdGhlbiBvcGVucyBhIHN0YXRlXG4gKiAgICBzdWJzY3JpcHRpb24uIFdpcmUgb3JkZXJpbmcgbWF0dGVycyBcdTIwMTQgc2VlIHRoZSBjb21tZW50IGluIHRoZSBib2R5LlxuICogIC0ge0BsaW5rIGdyYWR1YXRlfSByZWxlYXNlcyB0aGUgc3Vic2NyaXB0aW9uIHdpdGhvdXQgZmlyaW5nXG4gKiAgICBgZGlzcG9zZVNlc3Npb25gOyBjYWxsZWQgd2hlbiB0aGUgc2Vzc2lvbiBzdWNjZXNzZnVsbHkgdHJhbnNpdGlvbnMgaW50b1xuICogICAgYSByZWFsIHJ1bm5pbmcgc2Vzc2lvbiB2aWEgYHNlbmRSZXF1ZXN0YC5cbiAqICAtIHtAbGluayBEaXNwb3NhYmxlLmRpc3Bvc2V9L2BkaXNwb3NlYCByZWxlYXNlcyB0aGUgc3Vic2NyaXB0aW9uICoqYW5kKipcbiAqICAgIGZpcmVzIGBjb25uZWN0aW9uLmRpc3Bvc2VTZXNzaW9uYDsgY2FsbGVkIHdoZW4gdGhlIHVzZXIgYWJhbmRvbnMgdGhlXG4gKiAgICBuZXcgc2Vzc2lvbiAod29ya3NwYWNlIHN3aXRjaCwgc2VuZCBmYWlsdXJlLCBldGMuKS5cbiAqL1xuY2xhc3MgTmV3U2Vzc2lvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IHNlc3Npb246IElTZXNzaW9uO1xuXHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgYWdlbnRQcm92aWRlcjogc3RyaW5nO1xuXHQvKiogVGhpcyBkcmFmdCdzIFVSSSBhcyB0aGUgaG9zdCdzIHJlZ2lzdHJ5IHdvdWxkIGtleSBpdC4gU2VlIHtAbGluayBBZ2VudEhvc3RTZXNzaW9uQWRhcHRlci5iYWNrZW5kVXJpfS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYmFja2VuZFNlc3Npb25Vcmk6IFVSSTtcblx0cmVhZG9ubHkgd29ya3NwYWNlVXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGJvb2xlYW47XG5cdC8qKiBgdHJ1ZWAgd2hlbiB0aGlzIGlzIGEgd29ya3NwYWNlLWxlc3MgcXVpY2sgY2hhdC4gKi9cblx0cmVhZG9ubHkgaXNRdWlja0NoYXQ6IGJvb2xlYW47XG5cdC8qKiBTZXNzaW9uLWtpbmQgc3RyYXRlZ3kgY2hvc2VuIG9uY2UgYXQgY29uc3RydWN0aW9uIChxdWljayBjaGF0IHZzLiB3b3Jrc3BhY2UpLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9raW5kOiBJQWdlbnRIb3N0U2Vzc2lvbktpbmQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdHVzOiBJU2V0dGFibGVPYnNlcnZhYmxlPFNlc3Npb25TdGF0dXM+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aXRsZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbElkOiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGU6IElTZXR0YWJsZU9ic2VydmFibGU8eyByZWFkb25seSBpZDogc3RyaW5nOyByZWFkb25seSBraW5kOiBzdHJpbmcgfSB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYW5nZXNldHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSVNlc3Npb25DaGFuZ2VzZXRbXSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSByZWFkb25seSBfd29ya3RyZWVQZW5kaW5nID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KHRoaXMsIGZhbHNlKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNBY3RpdmVTZXNzaW9uT2JzOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfbG9hZGluZzogSVNldHRhYmxlT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfbWFpbkNoYXQ6IElTZXR0YWJsZU9ic2VydmFibGU8SUNoYXQ+O1xuXHRwcml2YXRlIF9zZWxlY3RlZE1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2VsZWN0ZWRBZ2VudDogSVNlc3Npb25BZ2VudFJlZiB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogTGF0ZXN0IHJlc29sdmVkIGNvbmZpZy4gUmVwbGFjZXMgd2hhdCB1c2VkIHRvIGxpdmUgaW4gYF9uZXdTZXNzaW9uQ29uZmlnc2AuXG5cdCAqIGB1bmRlZmluZWRgIGluZGljYXRlcyB0aGUgbW9zdCByZWNlbnQge0BsaW5rIHJlc29sdmVDb25maWd9IGZhaWxlZCBhbmQgbm9cblx0ICogY2FjaGVkIHZhbHVlcyBhcmUgdXNhYmxlLlxuXHQgKi9cblx0cHJpdmF0ZSBfY29uZmlnOiBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCB8IHVuZGVmaW5lZCA9IHsgc2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LCB2YWx1ZXM6IHt9IH07XG5cblx0LyoqXG5cdCAqIE1vbm90b25pYyBjb3VudGVyIGZvciBpbi1mbGlnaHQge0BsaW5rIHJlc29sdmVDb25maWd9IGNhbGxzLiBFYWNoIGNhbGxcblx0ICogaW5jcmVtZW50cyB0aGUgY291bnRlciBhbmQgb25seSB3cml0ZXMgaXRzIHJlc3VsdCBiYWNrIGlmIGl0cyBzZXF1ZW5jZVxuXHQgKiBpcyBzdGlsbCB0aGUgbGF0ZXN0IG9uZS4gQnVtcGVkIG9uIGRpc3Bvc2Ugc28gYW55IHBlbmRpbmcgcmVzb2x2ZVxuXHQgKiBkaXNjYXJkcyBpdHNlbGYuXG5cdCAqL1xuXHRwcml2YXRlIF9jb25maWdSZXF1ZXN0U2VxID0gMDtcblxuXHQvKipcblx0ICogYHRydWVgIHdoaWxlIGEgYHJlc29sdmVDb25maWdgIHJvdW5kLXRyaXAgaXMgaW4gZmxpZ2h0LiBEaXN0aW5jdCBmcm9tXG5cdCAqIHtAbGluayBJU2Vzc2lvbi5sb2FkaW5nfSB3aGljaCBhbHNvIHN0YXlzIHRydWUgd2hlbiByZXF1aXJlZCBjb25maWdcblx0ICogdmFsdWVzIGFyZSBtaXNzaW5nIFx1MjAxNCBwaWNrZXJzIGdhdGUgb24gdGhpcyBzbyB0aGV5IHN0YXkgaW50ZXJhY3RpdmVcblx0ICogaW4gdGhhdCBzdGF0ZS4gU2V0IHN5bmMgaW4ge0BsaW5rIGJlZ2luUmVzb2x2ZUNvbmZpZ1N5bmN9IHNvIHRoZVxuXHQgKiBvcHRpbWlzdGljIGBvbkRpZENoYW5nZVNlc3Npb25Db25maWdgIHB1bHNlIGFscmVhZHkgZXhwb3NlcyBpdC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzUmVzb2x2aW5nQ29uZmlnOiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saWZldGltZUN0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblxuXHQvKiogQmFja2VuZCBzZXNzaW9uIFVSSSwgc2V0IHRoZSBtb21lbnQge0BsaW5rIGVhZ2VyQ3JlYXRlfSBzdGFydHMuICovXG5cdHByaXZhdGUgX2JhY2tlbmRVcmk6IFVSSSB8IHVuZGVmaW5lZDtcblx0LyoqIENvbm5lY3Rpb24gdXNlZCB0byBjcmVhdGUgdGhlIGJhY2tlbmQgc2Vzc2lvbiwgY2FwdHVyZWQgZm9yIGBkaXNwb3NlU2Vzc2lvbmAgb24gdGVhci1kb3duLiAqL1xuXHRwcml2YXRlIF9jb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHQvKiogSGVsZCBzdGF0ZSBzdWJzY3JpcHRpb24uIFNldCBhZnRlciB0aGUgd2lyZSBgY3JlYXRlU2Vzc2lvbmAgcmVzb2x2ZXMuICovXG5cdHByaXZhdGUgX3N1YnNjcmlwdGlvbjogSVJlZmVyZW5jZTxJQWdlbnRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPj4gfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBgb25EaWRDaGFuZ2VgIGxpc3RlbmVyIGZvciB7QGxpbmsgX3N1YnNjcmlwdGlvbn0uIEZvcndhcmRzIGV2ZXJ5XG5cdCAqIGBTZXNzaW9uU3RhdGVgIHNuYXBzaG90IHRvIHRoZSBwcm92aWRlciB2aWEge0BsaW5rIF9vblNlc3Npb25TdGF0ZX1cblx0ICogc28gdGhlIG5ldyBzZXNzaW9uJ3MgY3VzdG9taXphdGlvbnMgKGFuZCBhbnkgb3RoZXIgc3RhdGUpIHJlYWNoXG5cdCAqIGBfbGFzdFNlc3Npb25TdGF0ZXNgIHdoaWxlIHRoZSBzZXNzaW9uIGlzIHN0aWxsIFVudGl0bGVkLiBEZXRhY2hlZFxuXHQgKiBpbiB7QGxpbmsgZ3JhZHVhdGV9IChoYW5kb2ZmKSBhbmQge0BsaW5rIGRpc3Bvc2V9IChjbG9zZS13aXRob3V0LXNlbmQpLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGVMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25TZXNzaW9uU3RhdGU6ICgoc2Vzc2lvbklkOiBzdHJpbmcsIHN0YXRlOiBTZXNzaW9uU3RhdGUgfCB1bmRlZmluZWQpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luaXRpYWxBY3RpdmVDbGllbnQ6IFNlc3Npb25BY3RpdmVDbGllbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVySWQ6IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjdHg6IElOZXdTZXNzaW9uQ29uc3RydWN0aW9uQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBJQWdlbnRIb3N0QWRhcHRlck9wdGlvbnMsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2Ugc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVVyaSA9IGN0eC53b3Jrc3BhY2U/LmZvbGRlcnNbMF0/LnJvb3Q7XG5cdFx0dGhpcy5fa2luZCA9IHNlc3Npb25LaW5kKCEhY3R4LnF1aWNrQ2hhdCk7XG5cdFx0aWYgKHRoaXMuX2tpbmQucmVxdWlyZXNXb3Jrc3BhY2UgJiYgIXdvcmtzcGFjZVVyaSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdXb3Jrc3BhY2UgaGFzIG5vIHJlcG9zaXRvcnkgVVJJJyk7XG5cdFx0fVxuXHRcdHRoaXMud29ya3NwYWNlVXJpID0gd29ya3NwYWNlVXJpO1xuXHRcdHRoaXMuaXNRdWlja0NoYXQgPSB0aGlzLl9raW5kLmlzUXVpY2tDaGF0O1xuXHRcdHRoaXMucmVxdWlyZXNXb3Jrc3BhY2VUcnVzdCA9ICEhY3R4LndvcmtzcGFjZT8ucmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDtcblx0XHR0aGlzLmFnZW50UHJvdmlkZXIgPSBjdHguc2Vzc2lvblR5cGUuaWQ7XG5cdFx0dGhpcy5fcHJvdmlkZXJJZCA9IGN0eC5wcm92aWRlcklkO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UgPSBjdHgubG9nU2VydmljZTtcblx0XHR0aGlzLl9vblNlc3Npb25TdGF0ZSA9IGN0eC5vblNlc3Npb25TdGF0ZTtcblx0XHR0aGlzLl9pbml0aWFsQWN0aXZlQ2xpZW50ID0gY3R4LmFjdGl2ZUNsaWVudDtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IGN0eC5yZXNvdXJjZVNjaGVtZSwgcGF0aDogYC8ke2dlbmVyYXRlVXVpZCgpfWAgfSk7XG5cdFx0dGhpcy5faXNBY3RpdmVTZXNzaW9uT2JzID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gaXNFcXVhbChzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik/LnJlc291cmNlLCByZXNvdXJjZSkpO1xuXHRcdC8vIERlZmF1bHRzIHRvIHNjaGVtZSA9PSBwcm92aWRlcjsgb25seSBob3N0cyB0aGF0IGFkZHJlc3Mgc2Vzc2lvbnMgdW5kZXIgYSBkaWZmZXJlbnRcblx0XHQvLyBzY2hlbWUgKGNsb3VkIHNhbmRib3g6IHByb3ZpZGVyIGBjb3BpbG90YCwgc2NoZW1lIGBhaHAtc2Vzc2lvbmApIG92ZXJyaWRlIGl0LlxuXHRcdHRoaXMuX2JhY2tlbmRTZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaShjdHguYmFja2VuZFNlc3Npb25TY2hlbWUgPz8gdGhpcy5hZ2VudFByb3ZpZGVyLCBBZ2VudFNlc3Npb24uaWQocmVzb3VyY2UpKTtcblx0XHR0aGlzLl9zdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWU8U2Vzc2lvblN0YXR1cz4odGhpcywgU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCk7XG5cdFx0dGhpcy5fdGl0bGUgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nPih0aGlzLCAnJyk7XG5cdFx0Y29uc3QgdGl0bGUgPSB0aGlzLl90aXRsZTtcblx0XHRjb25zdCB1cGRhdGVkQXQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgbmV3IERhdGUoKSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlT2JzID0gb2JzZXJ2YWJsZVZhbHVlPElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkPih0aGlzLCBjdHgud29ya3NwYWNlKTtcblx0XHRjb25zdCBjaGFuZ2VzID0gb2JzZXJ2YWJsZVZhbHVlT3B0czxyZWFkb25seSAoSUNoYXRTZXNzaW9uRmlsZUNoYW5nZSB8IElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyKVtdPih7IG93bmVyOiB0aGlzLCBlcXVhbHNGbjogc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwgfSwgW10pO1xuXHRcdGNvbnN0IGNoZWNrcG9pbnRzID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fc2VsZWN0ZWRNb2RlbElkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3NlbGVjdGVkQWdlbnQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbW9kZWxJZCA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KHRoaXMsIHRoaXMuX3NlbGVjdGVkTW9kZWxJZCk7XG5cdFx0Y29uc3QgbW9kZSA9IG9ic2VydmFibGVWYWx1ZTx7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IGtpbmQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX21vZGUgPSBtb2RlO1xuXHRcdGNvbnN0IGlzQXJjaGl2ZWQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRcdGNvbnN0IGlzUmVhZCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB0cnVlKTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IG9ic2VydmFibGVWYWx1ZTxJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgbGFzdFR1cm5FbmQgPSBvYnNlcnZhYmxlVmFsdWU8RGF0ZSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9sb2FkaW5nID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHRydWUpO1xuXHRcdHRoaXMuX2lzUmVzb2x2aW5nQ29uZmlnID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0XHRjb25zdCBjcmVhdGVkQXQgPSBuZXcgRGF0ZSgpO1xuXG5cdFx0Y29uc3QgbWFpbkNoYXQ6IElDaGF0ID0ge1xuXHRcdFx0cmVzb3VyY2UsIGNyZWF0ZWRBdCwgdGl0bGUsIHVwZGF0ZWRBdCxcblx0XHRcdHN0YXR1czogdGhpcy5fc3RhdHVzLFxuXHRcdFx0Y2hhbmdlcyxcblx0XHRcdGNoZWNrcG9pbnRzLFxuXHRcdFx0bW9kZWxJZDogdGhpcy5fbW9kZWxJZCxcblx0XHRcdG1vZGUsIGlzQXJjaGl2ZWQsIGlzUmVhZCxcblx0XHRcdGludGVyYWN0aXZpdHk6IGNvbnN0T2JzZXJ2YWJsZShDaGF0SW50ZXJhY3Rpdml0eS5GdWxsKSxcblx0XHRcdGRlc2NyaXB0aW9uLCBsYXN0VHVybkVuZCxcblx0XHR9O1xuXHRcdHRoaXMuX21haW5DaGF0ID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0Pih0aGlzLCBtYWluQ2hhdCk7XG5cdFx0Y29uc3QgYXV0aFBlbmRpbmcgPSBjdHguYXV0aGVudGljYXRpb25QZW5kaW5nO1xuXHRcdGNvbnN0IGxvYWRpbmcgPSB0aGlzLl9sb2FkaW5nO1xuXHRcdGNvbnN0IGNoYXRzID0gdGhpcy5fbWFpbkNoYXQubWFwKGMgPT4gW2NdKTtcblx0XHR0aGlzLnNlc3Npb24gPSB7XG5cdFx0XHRzZXNzaW9uSWQ6IGAke2N0eC5wcm92aWRlcklkfToke3Jlc291cmNlLnRvU3RyaW5nKCl9YCxcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0cHJvdmlkZXJJZDogY3R4LnByb3ZpZGVySWQsXG5cdFx0XHRzZXNzaW9uVHlwZTogY3R4LnNlc3Npb25UeXBlLmlkLFxuXHRcdFx0aWNvbjogY3R4Lmljb24sXG5cdFx0XHRjcmVhdGVkQXQsXG5cdFx0XHR3b3Jrc3BhY2U6IHdvcmtzcGFjZU9icyxcblx0XHRcdGlzUXVpY2tDaGF0OiBjb25zdE9ic2VydmFibGUodGhpcy5fa2luZC5pc1F1aWNrQ2hhdCksXG5cdFx0XHR3b3JrdHJlZVBlbmRpbmc6IHRoaXMuX3dvcmt0cmVlUGVuZGluZyxcblx0XHRcdHRpdGxlLFxuXHRcdFx0dXBkYXRlZEF0LFxuXHRcdFx0c3RhdHVzOiB0aGlzLl9zdGF0dXMsXG5cdFx0XHRjaGFuZ2VzZXRzOiB0aGlzLl9jaGFuZ2VzZXRzLFxuXHRcdFx0Y2hhbmdlcyxcblx0XHRcdG1vZGVsSWQ6IHRoaXMuX21vZGVsSWQsXG5cdFx0XHRtb2RlLFxuXHRcdFx0bG9hZGluZzogZGVyaXZlZChyZWFkZXIgPT4gbG9hZGluZy5yZWFkKHJlYWRlcikgfHwgYXV0aFBlbmRpbmcucmVhZChyZWFkZXIpKSxcblx0XHRcdGlzQXJjaGl2ZWQsXG5cdFx0XHRpc1JlYWQsXG5cdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdGxhc3RUdXJuRW5kLFxuXHRcdFx0bWFpbkNoYXQ6IHRoaXMuX21haW5DaGF0LFxuXHRcdFx0Y2hhdHMsXG5cdFx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UsIHN1cHBvcnRzUmVuYW1lOiB0cnVlLCBzdXBwb3J0c0RlbGV0ZTogdHJ1ZSB9KSxcblx0XHR9O1xuXHRcdHRoaXMuc2Vzc2lvbklkID0gdGhpcy5zZXNzaW9uLnNlc3Npb25JZDtcblxuXHRcdGlmIChjdHguaW5pdGlhbENvbmZpZ1ZhbHVlcyB8fCBjdHguaW5pdGlhbENvbmZpZ1NjaGVtYSkge1xuXHRcdFx0dGhpcy5fY29uZmlnID0ge1xuXHRcdFx0XHRzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHsgLi4uY3R4LmluaXRpYWxDb25maWdTY2hlbWEgfSB9LFxuXHRcdFx0XHR2YWx1ZXM6IHsgLi4uY3R4LmluaXRpYWxDb25maWdWYWx1ZXMgfSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdHRoaXMuX3N5bmNXb3JrdHJlZVBlbmRpbmcoKTtcblx0fVxuXG5cdC8qKiBSZS1yZWFkcyB0aGUgaXNvbGF0aW9uIHBpY2sgZnJvbSB0aGUgY2FjaGVkIGNvbmZpZyBpbnRvIHtAbGluayBfd29ya3RyZWVQZW5kaW5nfS4gKi9cblx0cHJpdmF0ZSBfc3luY1dvcmt0cmVlUGVuZGluZygpOiB2b2lkIHtcblx0XHR0aGlzLl93b3JrdHJlZVBlbmRpbmcuc2V0KGlzV29ya3RyZWVJc29sYXRpb24odGhpcy5fY29uZmlnPy52YWx1ZXMpLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0Ly8gLS0gUGlja2VyIG11dGF0aW9ucyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c2V0U2VsZWN0ZWRNb2RlbElkKG1vZGVsSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbGVjdGVkTW9kZWxJZCA9IG1vZGVsSWQ7XG5cdFx0dGhpcy5fbW9kZWxJZC5zZXQobW9kZWxJZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdGdldFNlbGVjdGVkTW9kZWxJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fc2VsZWN0ZWRNb2RlbElkOyB9XG5cdGNsZWFyU2VsZWN0ZWRNb2RlbElkKCk6IHZvaWQgeyB0aGlzLl9zZWxlY3RlZE1vZGVsSWQgPSB1bmRlZmluZWQ7IH1cblx0LyoqIFVudGl0bGVkIHNrZWxldG9uIHRpdGxlIHVzZWQgdW50aWwgdGhlIGZpcnN0IHJlcXVlc3QgY29tbWl0cyB0aGUgc2Vzc2lvbi4gKi9cblx0Z2V0IHVudGl0bGVkVGl0bGUoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuX2tpbmQudW50aXRsZWRUaXRsZTsgfVxuXHRzZXRTZWxlY3RlZEFnZW50KGFnZW50OiBJU2Vzc2lvbkFnZW50UmVmIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VsZWN0ZWRBZ2VudCA9IGFnZW50O1xuXHRcdHRoaXMuX21vZGUuc2V0KGFnZW50ID8geyBpZDogYWdlbnQudXJpLCBraW5kOiBBR0VOVF9NT0RFX0tJTkQgfSA6IHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdGdldFNlbGVjdGVkQWdlbnQoKTogSVNlc3Npb25BZ2VudFJlZiB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9zZWxlY3RlZEFnZW50OyB9XG5cdGNsZWFyU2VsZWN0ZWRBZ2VudCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zZWxlY3RlZEFnZW50ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX21vZGUuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldFN0YXR1cyhzdGF0dXM6IFNlc3Npb25TdGF0dXMpOiB2b2lkIHsgdGhpcy5fc3RhdHVzLnNldChzdGF0dXMsIHVuZGVmaW5lZCk7IH1cblx0c2V0TG9hZGluZyhsb2FkaW5nOiBib29sZWFuKTogdm9pZCB7IHRoaXMuX2xvYWRpbmcuc2V0KGxvYWRpbmcsIHVuZGVmaW5lZCk7IH1cblx0c2V0VGl0bGUodGl0bGU6IHN0cmluZyk6IHZvaWQgeyB0aGlzLl90aXRsZS5zZXQodGl0bGUsIHVuZGVmaW5lZCk7IH1cblxuXHQvLyAtLSBDb25maWcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRnZXRDb25maWcoKTogUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fY29uZmlnOyB9XG5cdGdldENvbmZpZ1ZhbHVlcygpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9jb25maWc/LnZhbHVlczsgfVxuXG5cdC8qKlxuXHQgKiBPcHRpbWlzdGljYWxseSBtZXJnZXMgYSBzaW5nbGUgcHJvcGVydHkgaW50byB0aGUgY2FjaGVkIGNvbmZpZy5cblx0ICogUHJlc2VydmVzIHRoZSBleGlzdGluZyBzY2hlbWEgc28gc2NoZW1hLWRyaXZlbiBwaWNrZXJzIGRvbid0IGZsYXNoXG5cdCAqIGR1cmluZyB0aGUgYXN5bmMgcmUtcmVzb2x2ZS4ge0BsaW5rIHJlc29sdmVDb25maWd9IHJlcGxhY2VzIGJvdGhcblx0ICogc2NoZW1hIGFuZCB2YWx1ZXMgd2hlbiBpdHMgcmVzcG9uc2UgbGFuZHMuXG5cdCAqL1xuXHRzZXRDb25maWdWYWx1ZShwcm9wZXJ0eTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9jb25maWc7XG5cdFx0dGhpcy5fY29uZmlnID0ge1xuXHRcdFx0c2NoZW1hOiBjdXJyZW50Py5zY2hlbWEgPz8geyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSxcblx0XHRcdHZhbHVlczogeyAuLi4oY3VycmVudD8udmFsdWVzID8/IHt9KSwgW3Byb3BlcnR5XTogdmFsdWUgfSxcblx0XHR9O1xuXHRcdHRoaXMuX3N5bmNXb3JrdHJlZVBlbmRpbmcoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBgdHJ1ZWAgd2hpbGUgYSB7QGxpbmsgcmVzb2x2ZUNvbmZpZ30gcm91bmQtdHJpcCBpcyBpbiBmbGlnaHQuIFNlZVxuXHQgKiB7QGxpbmsgX2lzUmVzb2x2aW5nQ29uZmlnfSBmb3Igd2h5IHRoaXMgaXMgZGlzdGluY3QgZnJvbSB7QGxpbmsgSVNlc3Npb24ubG9hZGluZ30uXG5cdCAqL1xuXHRnZXQgaXNSZXNvbHZpbmdDb25maWcoKTogSU9ic2VydmFibGU8Ym9vbGVhbj4geyByZXR1cm4gdGhpcy5faXNSZXNvbHZpbmdDb25maWc7IH1cblx0Z2V0IGNhbmNlbGxhdGlvblRva2VuKCk6IENhbmNlbGxhdGlvblRva2VuIHsgcmV0dXJuIHRoaXMuX2xpZmV0aW1lQ3RzLnRva2VuOyB9XG5cblx0LyoqIE1hcmsgYSByZXNvbHZlIGFzIHN0YXJ0aW5nIGJlZm9yZSB0aGUgb3B0aW1pc3RpYyBldmVudCBmaXJlcy4gKi9cblx0YmVnaW5SZXNvbHZlQ29uZmlnU3luYygpOiB2b2lkIHtcblx0XHR0aGlzLl9pc1Jlc29sdmluZ0NvbmZpZy5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDbGVhciB0aGUgaW4tZmxpZ2h0IGZsYWcgZm9yIGVhcmx5LXJldHVybiBwYXRocyB0aGF0IHNraXBcblx0ICoge0BsaW5rIHJlc29sdmVDb25maWd9IChlLmcuIG5vIGNvbm5lY3Rpb24pLCB3aGVyZSB0aGUgYGZpbmFsbHlgXG5cdCAqIGNsZWFudXAgbmV2ZXIgcnVucy5cblx0ICovXG5cdGVuZFJlc29sdmVDb25maWdTeW5jKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzUmVzb2x2aW5nQ29uZmlnLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1yZXNvbHZlcyB0aGUgc2Vzc2lvbiBjb25maWcgYWdhaW5zdCB0aGUgYWdlbnQgaG9zdCB1c2luZyB0aGVcblx0ICogY3VycmVudGx5IGNhY2hlZCB2YWx1ZXMuIElnbm9yZXMgaXRzIG93biByZXNwb25zZSBpZiBhIG5ld2VyIGNhbGxcblx0ICogc3VwZXJzZWRlZCBpdC4gUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGNvbmZpZyB3YXMgYXBwbGllZCAoaS5lLiB0aGlzXG5cdCAqIGNhbGwgd2FzIG5vdCBzdGFsZSBieSB0aGUgdGltZSB0aGUgcmVzcG9uc2UgYXJyaXZlZCkuIE9uIGZhaWx1cmUsIHRoZVxuXHQgKiBjYWNoZWQgY29uZmlnIGlzIGNsZWFyZWQgc28ge0BsaW5rIGdldENvbmZpZ30gcmV0dXJucyBgdW5kZWZpbmVkYC5cblx0ICogQHBhcmFtIHN0cmljdCBSZXRocm93IHRoZSBsYXRlc3QgcmVzb2x1dGlvbiBlcnJvciBpbnN0ZWFkIG9mIHRyZWF0aW5nIHRoZSByZWZyZXNoIGFzIGJlc3QgZWZmb3J0LlxuXHQgKi9cblx0YXN5bmMgcmVzb2x2ZUNvbmZpZyhjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uLCBzdHJpY3QgPSBmYWxzZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHNlcSA9ICsrdGhpcy5fY29uZmlnUmVxdWVzdFNlcTtcblx0XHR0aGlzLl9pc1Jlc29sdmluZ0NvbmZpZy5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5yZXNvbHZlU2Vzc2lvbkNvbmZpZyh7XG5cdFx0XHRcdHByb3ZpZGVyOiB0aGlzLmFnZW50UHJvdmlkZXIsXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHRoaXMud29ya3NwYWNlVXJpLFxuXHRcdFx0XHRjb25maWc6IHRoaXMuX2NvbmZpZz8udmFsdWVzLFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoc2VxICE9PSB0aGlzLl9jb25maWdSZXF1ZXN0U2VxKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbmZpZyA9IHJlc3VsdDtcblx0XHRcdHRoaXMuX3N5bmNXb3JrdHJlZVBlbmRpbmcoKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoc2VxICE9PSB0aGlzLl9jb25maWdSZXF1ZXN0U2VxKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbmZpZyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3N5bmNXb3JrdHJlZVBlbmRpbmcoKTtcblx0XHRcdGlmIChzdHJpY3QpIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Ly8gT25seSB0aGUgbGF0ZXN0IHJlcXVlc3Qgb3ducyB0aGUgZmxhZy5cblx0XHRcdGlmIChzZXEgPT09IHRoaXMuX2NvbmZpZ1JlcXVlc3RTZXEpIHtcblx0XHRcdFx0dGhpcy5faXNSZXNvbHZpbmdDb25maWcuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldENvbmZpZ0NvbXBsZXRpb25zKGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIHByb3BlcnR5OiBzdHJpbmcsIHF1ZXJ5OiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gY29ubmVjdGlvbi5zZXNzaW9uQ29uZmlnQ29tcGxldGlvbnMoe1xuXHRcdFx0cHJvdmlkZXI6IHRoaXMuYWdlbnRQcm92aWRlcixcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHRoaXMud29ya3NwYWNlVXJpLFxuXHRcdFx0Y29uZmlnOiB0aGlzLl9jb25maWc/LnZhbHVlcyxcblx0XHRcdHByb3BlcnR5LFxuXHRcdFx0cXVlcnksXG5cdFx0fSk7XG5cdH1cblxuXHQvLyAtLSBCYWNrZW5kIHNlc3Npb24gbGlmZWN5Y2xlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogRWFnZXJseSBjcmVhdGUgdGhlIHNlc3Npb24gb24gdGhlIGFnZW50IGhvc3Qgc28gdGhlIGNoYXQgaGFuZGxlciBjYW5cblx0ICogc2tpcCBpdHMgbGVnYWN5IGBjcmVhdGVTZXNzaW9uYC1vbi1maXJzdC1tZXNzYWdlIHJvdW5kLXRyaXAuXG5cdCAqXG5cdCAqIFdpcmUgb3JkZXJpbmcgbWF0dGVyczogd2UgbXVzdCBgY3JlYXRlU2Vzc2lvbmAgKmJlZm9yZSogb3BlbmluZyB0aGVcblx0ICogc3Vic2NyaXB0aW9uLiBTdWJzY3JpYmluZyBmaXJzdCB3b3VsZCByYWNlIHRoZSB3aXJlIHNlbmQgXHUyMDE0IHRoZSBzZXJ2ZXJcblx0ICogcmVjZWl2ZXMgdGhlIGBzdWJzY3JpYmVgIGJlZm9yZSB0aGUgYGNyZWF0ZVNlc3Npb25gIGFuZCByZWplY3RzIGl0IGFzXG5cdCAqIGBBSFBfU0VTU0lPTl9OT1RfRk9VTkRgLCBsZWF2aW5nIHRoZSBjbGllbnQgc3Vic2NyaXB0aW9uIGluIGFuXG5cdCAqIHVucmVjb3ZlcmFibGUgZXJyb3Igc3RhdGUuIFRoZSBzZXNzaW9uIGhhbmRsZXIgd291bGQgdGhlbiBmYWxsIGJhY2tcblx0ICogdG8gaXRzIGxlZ2FjeSBjcmVhdGUtYW5kLXN1YnNjcmliZSBwYXRoIG9uIHRoZSB1c2VyJ3MgZmlyc3Qgc2VuZCxcblx0ICogaXNzdWluZyBhIGR1cGxpY2F0ZSBgY3JlYXRlU2Vzc2lvbmAuXG5cdCAqXG5cdCAqIElmIHRoZSB1c2VyIHN3aXRjaGVzIHdvcmtzcGFjZXMgb3IgZ3JhZHVhdGVzIHRoaXMgc2Vzc2lvbiBiZWZvcmUgdGhlXG5cdCAqIGBjcmVhdGVTZXNzaW9uYCByb3VuZC10cmlwIGNvbXBsZXRlcywgdGhpcyBvYmplY3Qgd2lsbCBoYXZlIGJlZW5cblx0ICogZGlzcG9zZWQgKGFuZCBgX2JhY2tlbmRVcmlgIGNsZWFyZWQpIFx1MjAxNCB0aGUgYmFpbC1vdXQgY2hlY2sgYmVsb3cgc2tpcHNcblx0ICogb3BlbmluZyBhIHN0YWxlIHN1YnNjcmlwdGlvbi5cblx0ICpcblx0ICogRmFpbHVyZXMgYXJlIG5vbi1mYXRhbDogdGhlIGxlZ2FjeSBmaXJzdC1tZXNzYWdlIHBhdGggaW5cblx0ICogYEFnZW50SG9zdFNlc3Npb25IYW5kbGVyLl9pbnZva2VBZ2VudGAgcmUtaXNzdWVzIGBjcmVhdGVTZXNzaW9uYCBpZlxuXHQgKiBubyBzZXNzaW9uIHN0YXRlIGV4aXN0cyBhdCBzZW5kIHRpbWUuXG5cdCAqL1xuXHRlYWdlckNyZWF0ZShjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgYmFja2VuZFVyaSA9IHRoaXMuX2JhY2tlbmRTZXNzaW9uVXJpO1xuXHRcdGlmICh0aGlzLl9iYWNrZW5kVXJpPy50b1N0cmluZygpID09PSBiYWNrZW5kVXJpLnRvU3RyaW5nKCkgfHwgdGhpcy5fc3Vic2NyaXB0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2JhY2tlbmRVcmkgPSBiYWNrZW5kVXJpO1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb24gPSBjb25uZWN0aW9uO1xuXG5cdFx0dm9pZCAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgY29ubmVjdGlvbi5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0XHRwcm92aWRlcjogdGhpcy5hZ2VudFByb3ZpZGVyLFxuXHRcdFx0XHRcdHNlc3Npb246IGJhY2tlbmRVcmksXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiB0aGlzLndvcmtzcGFjZVVyaSA/IFt0aGlzLndvcmtzcGFjZVVyaV0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlnOiB0aGlzLl9jb25maWc/LnZhbHVlcyxcblx0XHRcdFx0XHQvLyBNQ1Atc3R5bGUgb3B0LWluOiBvZmZlciB0byByZWNlaXZlIGBwcm9ncmVzc2AgZm9yIGFueVxuXHRcdFx0XHRcdC8vIGxvbmctcnVubmluZyBicmluZy11cCAoY2hpZWZseSB0aGUgbGF6eSBmaXJzdC11c2UgU0RLXG5cdFx0XHRcdFx0Ly8gZG93bmxvYWQsIHdoaWNoIGZpcmVzIGxhdGVyIGF0IGZpcnN0LW1lc3NhZ2Vcblx0XHRcdFx0XHQvLyBtYXRlcmlhbGl6YXRpb24pLiBUaGUgaG9zdCBlY2hvZXMgdGhpcyB0b2tlbiBvbiBlYWNoXG5cdFx0XHRcdFx0Ly8gYHByb2dyZXNzYCBmcmFtZSBzbyBgX2hhbmRsZVByb2dyZXNzYCBjYW4gY29ycmVsYXRlIGl0LlxuXHRcdFx0XHRcdHByb2dyZXNzVG9rZW46IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRcdC4uLih0aGlzLl9zZWxlY3RlZEFnZW50ID8geyBhZ2VudDogeyB1cmk6IHRoaXMuX3NlbGVjdGVkQWdlbnQudXJpIH0gfSA6IHt9KSxcblx0XHRcdFx0XHQuLi4odGhpcy5faW5pdGlhbEFjdGl2ZUNsaWVudCA/IHsgYWN0aXZlQ2xpZW50OiB0aGlzLl9pbml0aWFsQWN0aXZlQ2xpZW50IH0gOiB7fSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7dGhpcy5fcHJvdmlkZXJJZH1dIEVhZ2VyIGNyZWF0ZVNlc3Npb24gZmFpbGVkIGZvciAke2JhY2tlbmRVcmkudG9TdHJpbmcoKX06ICR7ZXJyfWApO1xuXHRcdFx0XHQvLyBDbGVhciBiYWNrZW5kIGJvb2trZWVwaW5nIHNvIGEgbGF0ZXIgYGRpc3Bvc2UoKWAgZG9lc24ndFxuXHRcdFx0XHQvLyBmaXJlIGBkaXNwb3NlU2Vzc2lvbmAgZm9yIGEgc2Vzc2lvbiB0aGUgYWdlbnQgaG9zdCBuZXZlclxuXHRcdFx0XHQvLyBjcmVhdGVkLiBPbmx5IGRvIHRoaXMgaWYgd2UncmUgc3RpbGwgdGhlIGN1cnJlbnQgYXR0ZW1wdFxuXHRcdFx0XHQvLyAodGhlIGNhbGxlciBtYXkgaGF2ZSBhbHJlYWR5IG92ZXJ3cml0dGVuIHRoZXNlIGZpZWxkcyBieVxuXHRcdFx0XHQvLyBkaXNwb3NpbmcgdGhpcyBOZXdTZXNzaW9uIGFuZCBjb25zdHJ1Y3RpbmcgYSBuZXcgb25lKS5cblx0XHRcdFx0aWYgKHRoaXMuX2JhY2tlbmRVcmk/LnRvU3RyaW5nKCkgPT09IGJhY2tlbmRVcmkudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRcdHRoaXMuX2JhY2tlbmRVcmkgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5fY29ubmVjdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIEJhaWwgaWYgdGhlIHVzZXIgc3dpdGNoZWQgd29ya3NwYWNlcywgZ3JhZHVhdGVkIHRoaXMgc2Vzc2lvbixcblx0XHRcdC8vIG9yIG90aGVyd2lzZSBkaXNwb3NlZCBpdCB3aGlsZSB0aGUgcm91bmQtdHJpcCB3YXMgaW4gZmxpZ2h0LlxuXHRcdFx0aWYgKHRoaXMuX2JhY2tlbmRVcmk/LnRvU3RyaW5nKCkgIT09IGJhY2tlbmRVcmkudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIEhvbGQgYSBzdGF0ZSBzdWJzY3JpcHRpb24gZm9yIG91ciBsaWZldGltZSBzbyB0aGUgYWdlbnQgaG9zdCdzXG5cdFx0XHQvLyBlbXB0eS1zZXNzaW9uIEdDIHNlZXMgYSBub24temVybyBzdWJzY3JpYmVyIGNvdW50LiBUaGUgc2Vzc2lvblxuXHRcdFx0Ly8gaGFuZGxlciByZWZjb3VudHMgdGhlIHNhbWUgc3Vic2NyaXB0aW9uIHZpYSBgZ2V0U3Vic2NyaXB0aW9uYFxuXHRcdFx0Ly8gd2hlbiBjaGF0IGNvbnRlbnQgb3BlbnMsIHNvIHdoZW4gd2UgcmVsZWFzZSB0aGlzIHJlZiBvblxuXHRcdFx0Ly8gZ3JhZHVhdGlvbiB0aGUgd2lyZS1sZXZlbCByZWZjb3VudCBzdGF5cyBwb3NpdGl2ZS5cblx0XHRcdGNvbnN0IHJlZiA9IGNvbm5lY3Rpb24uZ2V0U3Vic2NyaXB0aW9uKFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCBiYWNrZW5kVXJpLCAnQmFzZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuc2Vzc2lvbicpO1xuXHRcdFx0dGhpcy5fc3Vic2NyaXB0aW9uID0gcmVmO1xuXG5cdFx0XHQvLyBGb3J3YXJkIGBTZXNzaW9uU3RhdGVgIHVwZGF0ZXMgYmFjayB0byB0aGUgcHJvdmlkZXIgc29cblx0XHRcdC8vIGBfbGFzdFNlc3Npb25TdGF0ZXNgIChhbmQgdGhlcmVmb3JlIGBnZXRDdXN0b21BZ2VudHNgKSBiZWNvbWVzXG5cdFx0XHQvLyBwb3B1bGF0ZWQgZm9yIHRoaXMgc3RpbGwtVW50aXRsZWQgc2Vzc2lvbi4gU2VlZCBvbmNlIGZyb20gdGhlXG5cdFx0XHQvLyBjYWNoZWQgdmFsdWUsIHRoZW4gYXR0YWNoIGEgbGlzdGVuZXIgZm9yIHN1YnNlcXVlbnQgZGVsdGFzLlxuXHRcdFx0Y29uc3Qgb25TZXNzaW9uU3RhdGUgPSB0aGlzLl9vblNlc3Npb25TdGF0ZTtcblx0XHRcdGlmIChvblNlc3Npb25TdGF0ZSkge1xuXHRcdFx0XHRjb25zdCBpbml0aWFsID0gcmVmLm9iamVjdC52YWx1ZTtcblx0XHRcdFx0aWYgKGluaXRpYWwgJiYgIShpbml0aWFsIGluc3RhbmNlb2YgRXJyb3IpKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVDaGFuZ2VzZXRzKGluaXRpYWwuY2hhbmdlc2V0cyk7XG5cdFx0XHRcdFx0b25TZXNzaW9uU3RhdGUodGhpcy5zZXNzaW9uSWQsIGluaXRpYWwpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3N0YXRlTGlzdGVuZXIudmFsdWUgPSByZWYub2JqZWN0Lm9uRGlkQ2hhbmdlKHN0YXRlID0+IHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUNoYW5nZXNldHMoc3RhdGUuY2hhbmdlc2V0cyk7XG5cdFx0XHRcdFx0b25TZXNzaW9uU3RhdGUodGhpcy5zZXNzaW9uSWQsIHN0YXRlKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ2hhbmdlc2V0cyhjaGFuZ2VzZXRzTWV0YWRhdGE6IHJlYWRvbmx5IENoYW5nZXNldFtdIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKCFjaGFuZ2VzZXRzTWV0YWRhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjaGFuZ2VzZXRzID0gY3JlYXRlQ2hhbmdlc2V0cyh0aGlzLl9iYWNrZW5kU2Vzc2lvblVyaSwgdGhpcy5fb3B0aW9ucywgdGhpcy5faXNBY3RpdmVTZXNzaW9uT2JzLCBjaGFuZ2VzZXRzTWV0YWRhdGEpO1xuXG5cdFx0dGhpcy5fY2hhbmdlc2V0cy5zZXQoY2hhbmdlc2V0cywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWxlYXNlIHRoZSBiYWNrZW5kIHN1YnNjcmlwdGlvbiB3aXRob3V0IGZpcmluZyBgZGlzcG9zZVNlc3Npb25gLlxuXHQgKiBVc2VkIG9uIHRoZSBzdWNjZXNzIHBhdGggaW4gYHNlbmRSZXF1ZXN0YCB3aGVuIHRoZSBzZXNzaW9uIGhhc1xuXHQgKiBncmFkdWF0ZWQgaW50byBhIHJlYWwgcnVubmluZyBzZXNzaW9uLlxuXHQgKi9cblx0Z3JhZHVhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fbGlmZXRpbWVDdHMuY2FuY2VsKCk7XG5cdFx0Ly8gRGV0YWNoIHRoZSBuZXctc2Vzc2lvbiBsaXN0ZW5lciBCRUZPUkUgcmVsZWFzaW5nIHRoZSBzdWJzY3JpcHRpb24uXG5cdFx0Ly8gQm90aCBjb2RlIHBhdGhzICh0aGlzIG9uZSBhbmQgdGhlIHJ1bm5pbmctc2Vzc2lvbiBwaXBlbGluZSkgd3JpdGVcblx0XHQvLyBgX2xhc3RTZXNzaW9uU3RhdGVzYCB1bmRlciB0aGUgc2FtZSBgc2Vzc2lvbklkYCBrZXksIHNvIGRldGFjaGluZ1xuXHRcdC8vIGhlcmUgaGFuZHMgb3duZXJzaGlwIGNsZWFubHkgdG8gYF9lbnN1cmVTZXNzaW9uU3RhdGVTdWJzY3JpcHRpb25gXG5cdFx0Ly8gd2l0aG91dCBhIHRyYW5zaWVudCBlbXB0eS1yZWFkIHdpbmRvdyBvciBhIGR1cGxpY2F0ZSB3cml0ZXIuXG5cdFx0dGhpcy5fc3RhdGVMaXN0ZW5lci5jbGVhcigpO1xuXHRcdHRoaXMuX3N1YnNjcmlwdGlvbj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3N1YnNjcmlwdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9iYWNrZW5kVXJpID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY29uZmlnUmVxdWVzdFNlcSsrO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9saWZldGltZUN0cy5jYW5jZWwoKTtcblx0XHQvLyBCdW1wIHRoZSBzZXEgc28gYW55IGluLWZsaWdodCByZXNvbHZlQ29uZmlnIGRpc2NhcmRzIGl0c2VsZi5cblx0XHR0aGlzLl9jb25maWdSZXF1ZXN0U2VxKys7XG5cblx0XHQvLyBEZXRhY2ggdGhlIHN0YXRlIGxpc3RlbmVyIEJFRk9SRSBmaXJpbmcgdGhlIGNsZWFudXAgc2VudGluZWwgc29cblx0XHQvLyBhIHJhY2luZyBgb25EaWRDaGFuZ2VgIGNhbm5vdCByZS1wb3B1bGF0ZSBgX2xhc3RTZXNzaW9uU3RhdGVzYFxuXHRcdC8vIGFmdGVyIHdlIGhhdmUgYXNrZWQgdGhlIHByb3ZpZGVyIHRvIGRlbGV0ZSB0aGUgZW50cnkuIFRoZW4gZmlyZVxuXHRcdC8vIHRoZSBzZW50aW5lbCBzbyB0aGUgcHJvdmlkZXIgZHJvcHMgdGhlIGNhY2hlZCBzbmFwc2hvdC4gT25seVxuXHRcdC8vIGZpcmVzIHdoZW4gYSBsaXN0ZW5lciB3YXMgYWN0dWFsbHkgd2lyZWQgKGkuZS4gYGVhZ2VyQ3JlYXRlYFxuXHRcdC8vIHJlYWNoZWQgdGhlIHBvc3QtYGNyZWF0ZVNlc3Npb25gIGJyYW5jaCkuXG5cdFx0Y29uc3QgaGFkTGlzdGVuZXIgPSAhIXRoaXMuX3N0YXRlTGlzdGVuZXIudmFsdWU7XG5cdFx0dGhpcy5fc3RhdGVMaXN0ZW5lci5jbGVhcigpO1xuXHRcdGlmIChoYWRMaXN0ZW5lcikge1xuXHRcdFx0dGhpcy5fb25TZXNzaW9uU3RhdGU/Lih0aGlzLnNlc3Npb25JZCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHR0aGlzLl9zdWJzY3JpcHRpb24/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9zdWJzY3JpcHRpb24gPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBvbGRVcmkgPSB0aGlzLl9iYWNrZW5kVXJpO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLl9jb25uZWN0aW9uO1xuXHRcdHRoaXMuX2JhY2tlbmRVcmkgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY29ubmVjdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRpZiAob2xkVXJpICYmIGNvbm5lY3Rpb24pIHtcblx0XHRcdGNvbm5lY3Rpb24uZGlzcG9zZVNlc3Npb24ob2xkVXJpKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFske3RoaXMuX3Byb3ZpZGVySWR9XSBGYWlsZWQgdG8gZGlzcG9zZSBlYWdlciBiYWNrZW5kIHNlc3Npb24gJHtvbGRVcmkudG9TdHJpbmcoKX06ICR7ZXJyfWApO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBCYXNlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciBcdTIwMTQgc2hhcmVkIGJhc2UgZm9yIGxvY2FsIGFuZCByZW1vdGUgcHJvdmlkZXJzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogU2hhcmVkIGJhc2UgY2xhc3MgZm9yIHRoZSBsb2NhbCBhbmQgcmVtb3RlIGFnZW50IGhvc3Qgc2Vzc2lvbnMgcHJvdmlkZXJzLlxuICpcbiAqIE93bnMgdGhlIHN0cnVjdHVyZXMgYW5kIGZsb3dzIHRoYXQgYXJlIGlkZW50aWNhbCBiZXR3ZWVuIHRoZSB0d286XG4gKiB0aGUgc2Vzc2lvbiBjYWNoZSwgdGhlIG5ldy1zZXNzaW9uL3J1bm5pbmctc2Vzc2lvbiBjb25maWcgcGlja2VyIHN0YXRlLFxuICogdGhlIGxhenkgc2Vzc2lvbi1zdGF0ZSBzdWJzY3JpcHRpb25zLCB0aGUgQUhQIG5vdGlmaWNhdGlvbi9hY3Rpb25cbiAqIGhhbmRsZXJzLCBhbmQgZXZlcnkgY29ubmVjdGlvbi1yb3V0ZWQgbWV0aG9kIChzZXQvZ2V0L2FyY2hpdmUvZGVsZXRlL1xuICogcmVuYW1lL3NldE1vZGVsL3NlbmRSZXF1ZXN0KS5cbiAqXG4gKiBTdWJjbGFzc2VzIHN1cHBseSB0aGUgZ2VudWluZSB2YXJpYXRpb24gcG9pbnRzOiB0aGUgY29ubmVjdGlvblxuICogYWNjZXNzb3IsIHRoZSBhdXRoZW50aWNhdGlvbi1wZW5kaW5nIG9ic2VydmFibGUsIGFuIGFkYXB0ZXIgZmFjdG9yeSxcbiAqIFVSSS1zY2hlbWUgbWFwcGluZyBmb3Igc2Vzc2lvbiBtZXRhZGF0YSwgdGhlIGFnZW50LXByb3ZpZGVyIGxvb2t1cCwgYW5kXG4gKiB0aGUgYnJvd3NlIFVJLlxuICovXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQmFzZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIge1xuXG5cdGFic3RyYWN0IHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdGFic3RyYWN0IHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdGFic3RyYWN0IHJlYWRvbmx5IGljb246IFRoZW1lSWNvbjtcblx0YWJzdHJhY3QgcmVhZG9ubHkgYnJvd3NlQWN0aW9uczogcmVhZG9ubHkgSVNlc3Npb25Xb3Jrc3BhY2VCcm93c2VBY3Rpb25bXTtcblxuXHRnZXQgb3JkZXIoKTogbnVtYmVyIHsgcmV0dXJuIDA7IH1cblxuXHRnZXQgc2Vzc2lvblR5cGVzKCk6IHJlYWRvbmx5IElTZXNzaW9uVHlwZVtdIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb25UeXBlczsgfVxuXHRwcm90ZWN0ZWQgX3Nlc3Npb25UeXBlczogSVNlc3Npb25UeXBlW10gPSBbXTtcblxuXHRwcml2YXRlIF9sYXN0QWdlbnRzOiByZWFkb25seSBBZ2VudEluZm9bXSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfYWdlbnRDYXBhYmlsaXRpZXMgPSBvYnNlcnZhYmxlVmFsdWU8UmVhZG9ubHlNYXA8c3RyaW5nLCBBZ2VudENhcGFiaWxpdGllcyB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlc3Npb25UeXBlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25UeXBlczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25UeXBlcy5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2Vzc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU2Vzc2lvbkNoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uczogRXZlbnQ8SVNlc3Npb25DaGFuZ2VFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRSZXBsYWNlU2Vzc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgZnJvbTogSVNlc3Npb247IHJlYWRvbmx5IHRvOiBJU2Vzc2lvbiB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXBsYWNlU2Vzc2lvbjogRXZlbnQ8eyByZWFkb25seSBmcm9tOiBJU2Vzc2lvbjsgcmVhZG9ubHkgdG86IElTZXNzaW9uIH0+ID0gdGhpcy5fb25EaWRSZXBsYWNlU2Vzc2lvbi5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZyA9IHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZy5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUm9vdENvbmZpZyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJvb3RDb25maWcgPSB0aGlzLl9vbkRpZENoYW5nZVJvb3RDb25maWcuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZUN1c3RvbUFnZW50cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUN1c3RvbUFnZW50cyA9IHRoaXMuX29uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zID0gdGhpcy5fb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucy5ldmVudDtcblx0LyoqIExhc3Qta25vd24gcm9vdCBjb25maWcgc3RhdGUgKHNjaGVtYSArIHZhbHVlcyksIHNlZWRlZCBmcm9tIGBSb290U3RhdGUuY29uZmlnYC4gKi9cblx0cHJvdGVjdGVkIF9yb290Q29uZmlnOiBSb290Q29uZmlnU3RhdGUgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIExhc3Qta25vd24gc2Vzc2lvbiBzdGF0ZSBwZXIgc2Vzc2lvbiBJRCwgc2VlZGVkIGZyb21cblx0ICoge0BsaW5rIF9hcHBseVNlc3Npb25TdGF0ZVVwZGF0ZX0uIEhvbGRzIHRoZSBzbmFwc2hvdCB1c2VkIHRvIGV4dHJhY3Rcblx0ICogYGN1c3RvbWl6YXRpb25zYCBhbmQgYGFjdGl2ZUNsaWVudC5jdXN0b21pemF0aW9uc2AgZm9yIHRoZSBwaWNrZXIuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2xhc3RTZXNzaW9uU3RhdGVzID0gbmV3IE1hcDxzdHJpbmcsIFNlc3Npb25TdGF0ZT4oKTtcblxuXHQvKiogQ2FjaGUgb2YgYWRhcHRlZCBzZXNzaW9ucywga2V5ZWQgYnkgcmF3IHNlc3Npb24gSUQuICovXG5cdHByb3RlY3RlZCByZWFkb25seSBfc2Vzc2lvbkNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIEFnZW50SG9zdFNlc3Npb25BZGFwdGVyPigpO1xuXG5cdC8qKlxuXHQgKiBTdG9yYWdlIGtleSB1bmRlciB3aGljaCB7QGxpbmsgX3Nlc3Npb25DYWNoZX0gc25hcHNob3RzIGFyZSBwZXJzaXN0ZWQsIG9yXG5cdCAqIGB1bmRlZmluZWRgIHdoaWxlIHBlcnNpc3RlbmNlIGlzIGRpc2FibGVkLiBTZXQgdmlhXG5cdCAqIHtAbGluayBfZW5hYmxlU2Vzc2lvbkNhY2hlUGVyc2lzdGVuY2V9LCB3aGljaCBzdWJjbGFzc2VzIGNhbGwgb25jZSB0aGVpclxuXHQgKiBpZGVudGl0eSBmaWVsZHMgYXJlIHJlYWR5LiBXaGVuIGB1bmRlZmluZWRgLCB0aGUgY2FjaGUgaXMgaW4tbWVtb3J5IG9ubHkuXG5cdCAqL1xuXHRwcml2YXRlIF9zZXNzaW9uQ2FjaGVTdG9yYWdlS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFNuYXBzaG90IG9mIHRoZSBzb3VyY2UgbWV0YWRhdGEgZm9yIGVhY2ggYWRhcHRlciBpbiB7QGxpbmsgX3Nlc3Npb25DYWNoZX0sXG5cdCAqIGtleWVkIGJ5IHJhdyBzZXNzaW9uIElELiBDYXB0dXJlZCBpbiB7QGxpbmsgY3JlYXRlQWRhcHRlcn0ve0BsaW5rIHVwZGF0ZUFkYXB0ZXJ9XG5cdCAqIGFuZCByZS11c2VkIGJ5IHtAbGluayBfcGVyc2lzdENhY2hlfSB0byBzZXJpYWxpemUgc2Vzc2lvbnMgd2l0aG91dCBoYXZpbmcgdG9cblx0ICogcmVjb25zdHJ1Y3QgZXZlcnkgYElBZ2VudFNlc3Npb25NZXRhZGF0YWAgZmllbGQgZnJvbSBvYnNlcnZhYmxlcy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX21ldGFCeVJhd0lkID0gbmV3IE1hcDxzdHJpbmcsIElBZ2VudFNlc3Npb25NZXRhZGF0YT4oKTtcblxuXHQvKipcblx0ICogU2V0IHdoZW4ge0BsaW5rIF9zZXNzaW9uQ2FjaGV9IGhhcyBjaGFuZ2VkIHNpbmNlIHRoZSBsYXN0IHBlcnNpc3QuIFRoZVxuXHQgKiBhY3R1YWwgd3JpdGUgaGFwcGVucyBvbiB0aGUgbmV4dCBgb25XaWxsU2F2ZVN0YXRlYCBzaWduYWwgZnJvbVxuXHQgKiB7QGxpbmsgSVN0b3JhZ2VTZXJ2aWNlfSBzbyB0aGF0IGJ1cnN0cyBvZiBub3RpZmljYXRpb25zIGRvIG5vdCByZXBlYXRlZGx5XG5cdCAqIHJlLXNlcmlhbGl6ZSB0aGUgd2hvbGUgY2FjaGUuXG5cdCAqL1xuXHRwcml2YXRlIF9jYWNoZURpcnR5ID0gZmFsc2U7XG5cblx0LyoqXG5cdCAqIFJlbmRlcnMgdGhlIGFnZW50IGhvc3QncyBsYXp5LCBmaXJzdC11c2UgU0RLIGRvd25sb2FkIGFzIGEgbm90aWZpY2F0aW9uXG5cdCAqIHByb2dyZXNzIGJhci4gU2hhcmVkIHdpdGggdGhlIGVkaXRvciB3aW5kb3cgc28gYm90aCBzdXJmYWNlcyByZW5kZXJcblx0ICogZG93bmxvYWQgcHJvZ3Jlc3MgaWRlbnRpY2FsbHkuIEZlZCBieSB0aGUgYE5vdGlmaWNhdGlvblR5cGUuUHJvZ3Jlc3NgXG5cdCAqIGZyYW1lcyByZWNlaXZlZCBpbiB7QGxpbmsgX2F0dGFjaENvbm5lY3Rpb25MaXN0ZW5lcnN9LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZG93bmxvYWRQcm9ncmVzczogQWdlbnRIb3N0RG93bmxvYWRQcm9ncmVzcztcblxuXHQvKipcblx0ICogVGVtcG9yYXJ5IHNlc3Npb24gdGhhdCBoYXMgYmVlbiBzZW50IChmaXJzdCB0dXJuIGRpc3BhdGNoZWQpIGJ1dCBub3QgeWV0XG5cdCAqIGNvbW1pdHRlZCBieSB0aGUgYmFja2VuZCBzZXNzaW9uIGxpc3QuIFNob3duIGluIHRoZSBzZXNzaW9uIGxpc3QgdW50aWwgdGhlXG5cdCAqIHNlcnZlciByZXBvcnRzIHRoZSBiYWNrZW5kIHNlc3Npb24sIGF0IHdoaWNoIHBvaW50IGl0IGlzIHJlcGxhY2VkIHZpYVxuXHQgKiB7QGxpbmsgX29uRGlkUmVwbGFjZVNlc3Npb259LlxuXHQgKi9cblx0cHJvdGVjdGVkIF9wZW5kaW5nU2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFJhdyBpZHMgb2YgYmFja2VuZCBzZXNzaW9ucyB0aGF0IGFuIGluLWZsaWdodCB7QGxpbmsgX3dhaXRGb3JOZXdTZXNzaW9ufVxuXHQgKiBoYXMgYWxyZWFkeSBtYXRjaGVkIHRvIGl0cyBzZW5kLCBzbyBhICpjb25jdXJyZW50KiBuZXctc2Vzc2lvbiBzZW5kIG9mXG5cdCAqIHRoZSBzYW1lIHNjaGVtZSBkb2VzIG5vdCByZXNvbHZlIHRvIHRoZSBzYW1lIGNvbW1pdHRlZCBzZXNzaW9uLiBFYWNoXG5cdCAqIG1hdGNoZWQgaWQgaXMgcmVsZWFzZWQgYnkgdGhlIG93bmluZyBzZW5kIGluIGl0cyBgZmluYWxseWAuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21taXR0aW5nU2Vzc2lvblJhd0lkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdC8qKlxuXHQgKiBPd24gcmF3IGlkcyAoe0BsaW5rIGNoYXRSZXNvdXJjZX0gcGF0aCkgb2YgY3VycmVudGx5IGluLWZsaWdodFxuXHQgKiBuZXctc2Vzc2lvbiBzZW5kcy4gQSBzZW5kJ3MgY29tbWl0dGVkIGJhY2tlbmQgc2Vzc2lvbiBrZWVwcyB0aGUgZWFnZXJcblx0ICogaWQgaXQgd2FzIGNyZWF0ZWQgd2l0aCwgc28ge0BsaW5rIF93YWl0Rm9yTmV3U2Vzc2lvbn0gbWF0Y2hlcyBhIHNlbmQgdG9cblx0ICogaXRzIE9XTiBpZCBmaXJzdC4gVGhlIG5vdmVsdHkgZmFsbGJhY2sgKGZvciBmbG93cyB3aGVyZSB0aGUgYmFja2VuZFxuXHQgKiBhc3NpZ25zIGEgZGlmZmVyZW50IGlkKSBtdXN0IHRoZW4gbmV2ZXIgbGF0Y2ggb250byAqYW5vdGhlciogaW4tZmxpZ2h0XG5cdCAqIHNlbmQncyBvd24gc2Vzc2lvbiBcdTIwMTQgb3RoZXJ3aXNlIHR3byBjb25jdXJyZW50IHNhbWUtc2NoZW1lIHNlbmRzIHJhY2luZ1xuXHQgKiBpbiBhIHNoYXJlZCBkb3dubG9hZC9tYXRlcmlhbGl6ZSB3aW5kb3cgd291bGQgc3dhcCBzZXNzaW9ucyAoZWFjaFxuXHQgKiBncmFkdWF0aW5nIG9udG8gdGhlIG90aGVyJ3MgY29tbWl0dGVkIHNlc3Npb24pLiBQb3B1bGF0ZWQgYXQgc2VuZCBzdGFydCxcblx0ICogY2xlYXJlZCBpbiB0aGUgc2VuZCdzIGBmaW5hbGx5YC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luRmxpZ2h0TmV3U2Vzc2lvbk93bklkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdC8qKlxuXHQgKiBJbi1mbGlnaHQgbmV3IHNlc3Npb25zIFx1MjAxNCBzZXNzaW9ucyBiZWluZyBjb21wb3NlZCBpbiB0aGUgbmV3LWNoYXQgdmlld1xuXHQgKiBiZWZvcmUgdGhlaXIgZmlyc3QgbWVzc2FnZSBpcyBzZW50LCBrZXllZCBieSBgc2Vzc2lvbklkYC4gU2VlXG5cdCAqIHtAbGluayBOZXdTZXNzaW9ufSBmb3IgdGhlIGVuY2Fwc3VsYXRlZCBzdGF0ZSBhbmQgbGlmZWN5Y2xlLlxuXHQgKlxuXHQgKiBIZWxkIGFzIGEge0BsaW5rIERpc3Bvc2FibGVNYXB9IHNvIG11bHRpcGxlIG5ldyBzZXNzaW9ucyBjYW4gYmUgdHJhY2tlZFxuXHQgKiBjb25jdXJyZW50bHkgKGUuZy4gd2hpbGUgb25lIGlzIHNlbmRpbmcgaW4gdGhlIGJhY2tncm91bmQgYW5kIHRoZSBjb21wb3NlclxuXHQgKiByZS1zZWVkcyBhIGZyZXNoIG9uZSkuIEVudHJpZXMgYXJlIGRpc3Bvc2VkIGluZGl2aWR1YWxseSB3aGVuIHNlbnRcblx0ICogKHtAbGluayBkZWxldGVBbmREaXNwb3NlfS97QGxpbmsgZGVsZXRlQW5kTGVha30pIG9yIGFiYW5kb25lZCAodmlhXG5cdCAqIHtAbGluayBkZWxldGVOZXdTZXNzaW9ufSksIGFuZCBhbGwgcmVtYWluaW5nIGVudHJpZXMgYXJlIGNsZWFuZWQgdXAgd2hlblxuXHQgKiB0aGUgcHJvdmlkZXIgaXRzZWxmIGlzIGRpc3Bvc2VkLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbmV3U2Vzc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIE5ld1Nlc3Npb24+KCkpO1xuXG5cdC8qKiBUaGUgaW4tZmxpZ2h0IG5ldyBzZXNzaW9uIHdpdGggdGhlIGdpdmVuIGlkLCBpZiBhbnkuICovXG5cdHByb3RlY3RlZCBfZ2V0TmV3U2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IE5ld1Nlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9uZXdTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNwb3NlIGV2ZXJ5IGluLWZsaWdodCBuZXcgc2Vzc2lvbiwgZmlyaW5nIGVhY2ggb25lJ3MgYGRpc3Bvc2VTZXNzaW9uYFxuXHQgKiBzZW50aW5lbCBzbyB0aGUgZWFnZXJseS1jcmVhdGVkIGJhY2tlbmQgcmVjb3JkcyBhcmUgZnJlZWQuIFVzZWQgd2hlbiB0aGVcblx0ICogY29ubmVjdGlvbiBkcm9wcyBhbmQgdGhlIGNvbXBvc2VkLWJ1dC11bnNlbnQgZHJhZnRzIGNhbiBubyBsb25nZXIgY29tbWl0LlxuXHQgKi9cblx0cHJvdGVjdGVkIF9kaXNwb3NlQWxsTmV3U2Vzc2lvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fbmV3U2Vzc2lvbnMuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cdH1cblxuXHRkZWxldGVOZXdTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX25ld1Nlc3Npb25zLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHR0aGlzLl9uZXdTZXNzaW9ucy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25JZCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIEZ1bGwgcmVzb2x2ZWQgY29uZmlnIChzY2hlbWEgKyB2YWx1ZXMpIGZvciBydW5uaW5nIHNlc3Npb25zLCBrZXllZCBieSBzZXNzaW9uIElELiAqL1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3J1bm5pbmdTZXNzaW9uQ29uZmlncyA9IG5ldyBNYXA8c3RyaW5nLCBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcnVubmluZ1Nlc3Npb25Db25maWdSZXNvbHZlU2VxID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuXHQvKipcblx0ICogTGFzdCBhdXRob3JpdGF0aXZlbHktcmVzb2x2ZWQgc2NoZW1hcyBmb3Ige0BsaW5rIFNFRURFRF9DT05GSUdfU0NIRU1BX0tFWVN9LFxuXHQgKiBzZWVkZWQgaW50byBuZXcgZHJhZnRzIHNvIHRoZWlyIGNoaXBzIHN1cnZpdmUgYSB3b3Jrc3BhY2UvYWdlbnQgc3dpdGNoLiBMaXZlc1xuXHQgKiBvbiB0aGUgcHJvdmlkZXIgKG5vdCB0aGUgcGlja2VyKSBzbyBpdCBvdXRsaXZlcyB0b29sYmFyIGl0ZW0gcmVjb25zdHJ1Y3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZWRDb25maWdTY2hlbWFzID0gbmV3IE1hcDxzdHJpbmcsIFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYT4oKTtcblxuXHQvKipcblx0ICogTGF6eSBzZXNzaW9uLXN0YXRlIHN1YnNjcmlwdGlvbnMgdXNlZCB0byBzZWVkIHtAbGluayBfcnVubmluZ1Nlc3Npb25Db25maWdzfVxuXHQgKiBmb3Igc2Vzc2lvbnMgdGhhdCBhbHJlYWR5IGV4aXN0IG9uIHRoZSBhZ2VudCBob3N0IChlLmcuIGNyZWF0ZWQgaW4gYSBwcmlvclxuXHQgKiB3aW5kb3cpLiBUaGUgdW5kZXJseWluZyB3aXJlIHN1YnNjcmlwdGlvbiBpcyByZWZlcmVuY2UtY291bnRlZCBieVxuXHQgKiB7QGxpbmsgSUFnZW50Q29ubmVjdGlvbi5nZXRTdWJzY3JpcHRpb259LCBzbyB3aGVuIHRoZSBzZXNzaW9uIGhhbmRsZXIgaXNcblx0ICogYWxzbyBzdWJzY3JpYmVkIChpLmUuIGNoYXQgY29udGVudCBpcyBsb2FkZWQpIG5vIGV4dHJhIHdpcmUgc3Vic2NyaWJlIGlzXG5cdCAqIGlzc3VlZC4gRWFjaCBlbnRyeSBpcyByZWxlYXNlZCBhZnRlclxuXHQgKiB7QGxpbmsgU0VTU0lPTl9TVEFURV9TVUJTQ1JJUFRJT05fSURMRV9NU30gb2Ygbm8gY2FsbHMgaW50byB0aGUga2VlcC1hbGl2ZVxuXHQgKiBoZWxwZXIsIHNvIHRoZSBzZXJ2ZXItc2lkZSByZWZjb3VudCBjYW4gZHJvcCBhbmQgYW55IGlkbGUgcmVzdG9yZWQgc2Vzc2lvblxuXHQgKiBzdGF0ZSBjYW4gYmUgZXZpY3RlZCBvbiB0aGUgYWdlbnQgaG9zdC4gS2V5ZWQgYnkgc2Vzc2lvbiBJRC5cblx0ICovXG5cdHByb3RlY3RlZCByZWFkb25seSBfc2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgRGlzcG9zYWJsZVN0b3JlPigpKTtcblxuXHQvKipcblx0ICogSWRsZS1yZWxlYXNlIHRpbWVycyBwYWlyZWQgd2l0aCB7QGxpbmsgX3Nlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbnN9LiBFYWNoXG5cdCAqIGNhbGwgdG8ge0BsaW5rIF9rZWVwU2Vzc2lvblN0YXRlQWxpdmV9IHJlc2V0cyB0aGUgdGltZXIgZm9yIGBzZXNzaW9uSWRgO1xuXHQgKiB3aGVuIHRoZSB0aW1lciBmaXJlcywgdGhlIHN1YnNjcmlwdGlvbiBpcyBkaXNwb3NlZCBhbmQgdGhlIHdpcmVcblx0ICogYHVuc3Vic2NyaWJlYCBmbG93cyB0aHJvdWdoIHtAbGluayBJQWdlbnRDb25uZWN0aW9uLmdldFN1YnNjcmlwdGlvbn0nc1xuXHQgKiByZWZjb3VudCB0byB0aGUgYWdlbnQgaG9zdC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25TdGF0ZUlkbGVUaW1lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPigpKTtcblxuXHQvKipcblx0ICogU2Vzc2lvbiBpZHMgd2hvc2Ugdmlld3MgYXJlIGN1cnJlbnRseSB2aXNpYmxlIGluIHRoZSBBZ2VudHMgd2luZG93LiBUaGVpclxuXHQgKiBzdGF0ZSBzdWJzY3JpcHRpb24gaXMgcGlubmVkIG9wZW4gKG5vIGlkbGUgcmVsZWFzZSkgc28gaG9zdC1kcml2ZW4gY2F0YWxvZ1xuXHQgKiBjaGFuZ2VzIHRoZSB1c2VyIGRpZCBub3QgaW5pdGlhdGUgXHUyMDE0IG1vc3QgaW1wb3J0YW50bHkgc3Bhd25lZCBzdWJhZ2VudCBjaGF0c1xuXHQgKiAoe0BsaW5rIENoYXRPcmlnaW5LaW5kLlRvb2x9KSBcdTIwMTQga2VlcCBmbG93aW5nIGludG8gYGNhY2hlZC5jaGF0c2Agd2hpbGUgdGhlXG5cdCAqIHNlc3Npb24gaXMgb24gc2NyZWVuLiBXaXRob3V0IHRoaXMsIHRoZSBpZGxlIHRpbWVyIChvbmx5IHJlZnJlc2hlZCBieVxuXHQgKiBjbGllbnQtaW5pdGlhdGVkIGFjdGlvbnMvcXVlcmllcykgY2FuIHJlbGVhc2UgdGhlIHN0YXRlIGxpc3RlbmVyIG1pZC12aWV3LFxuXHQgKiBzbyBhIHN1YmFnZW50J3MgYGNoYXRBZGRlZGAgaXMgZHJvcHBlZCBhbmQgaXRzIGlubGluZSBcIk9wZW4gU3ViYWdlbnRcIiBwaWxsXG5cdCAqIGNhbm5vdCByZXNvbHZlIHVudGlsIHRoZSBzZXNzaW9uIGlzIHJlLXN1YnNjcmliZWQgKGUuZy4gc3dpdGNoZWQgYXdheSBhbmRcblx0ICogYmFjaykuIERyaXZlbiBieSB7QGxpbmsgX3N5bmNWaXNpYmxlU2Vzc2lvblN0YXRlUGluc30uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9waW5uZWRTZXNzaW9uU3RhdGVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0cHJvdGVjdGVkIF9jYWNoZUluaXRpYWxpemVkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VTU0lPTl9SRUZSRVNIX1JFVFJZX01JTl9NUyA9IDFfMDAwO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTRVNTSU9OX1JFRlJFU0hfUkVUUllfTUFYX01TID0gMzBfMDAwO1xuXG5cdC8qKlxuXHQgKiBCYWNrb2ZmIHRpbWVyIHRoYXQgcmV0cmllcyB7QGxpbmsgX3JlZnJlc2hTZXNzaW9uc30gYWZ0ZXIgYSBmYWlsZWRcblx0ICogYXR0ZW1wdC4gQSBmYWlsZWQgaW5pdGlhbCBsaXN0IChlLmcuIHRoZSBhZ2VudCB0aHJld1xuXHQgKiBgQUhQX0FVVEhfUkVRVUlSRURgIGJlY2F1c2UgaXRzIHRva2VuIHdhc24ndCB5ZXQgZWZmZWN0aXZlIHNlcnZlci1zaWRlLFxuXHQgKiBvciBhIHRyYW5zaWVudCBvZmZsaW5lL25ldHdvcmsgZXJyb3IpIG11c3Qgbm90IGxlYXZlIHRoZSBzZXNzaW9uIGxpc3Rcblx0ICogcGVybWFuZW50bHkgZW1wdHkuIFRoZSB0aW1lciBpcyBhcm1lZCBvbmx5IG9uIGZhaWx1cmUgYW5kIGNhbmNlbGxlZCBvblxuXHQgKiB0aGUgbmV4dCBzdWNjZXNzZnVsIHJlZnJlc2guXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uUmVmcmVzaFJldHJ5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdC8qKiBDdXJyZW50IGJhY2tvZmYgZGVsYXkgKG1zKSBmb3IgdGhlIHNlc3Npb24tcmVmcmVzaCByZXRyeS4gKi9cblx0cHJpdmF0ZSBfc2Vzc2lvblJlZnJlc2hSZXRyeURlbGF5ID0gQmFzZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuU0VTU0lPTl9SRUZSRVNIX1JFVFJZX01JTl9NUztcblxuXHQvKiogVHJ1ZSB3aGlsZSBhIHtAbGluayBfcmVmcmVzaFNlc3Npb25zfSBjYWxsIGlzIGF3YWl0aW5nIGBsaXN0U2Vzc2lvbnMoKWAuICovXG5cdHByaXZhdGUgX3Nlc3Npb25SZWZyZXNoSW5GbGlnaHQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9jaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2xhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfYmFzZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElHaXRIdWJTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfZ2l0SHViU2VydmljZTogSUdpdEh1YlNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9zZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfYWN0aXZlQ2xpZW50U2VydmljZTogSUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZG93bmxvYWRQcm9ncmVzcyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdERvd25sb2FkUHJvZ3Jlc3MpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBjYWNoZWQgb2YgdGhpcy5fc2Vzc2lvbkNhY2hlLnZhbHVlcygpKSB7XG5cdFx0XHRcdGNhY2hlZC5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zZXNzaW9uQ2FjaGUuY2xlYXIoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBLZWVwIHRoZSBzdGF0ZSBzdWJzY3JpcHRpb24gb2YgZXZlcnkgb24tc2NyZWVuIHNlc3Npb24gcGlubmVkIHNvXG5cdFx0Ly8gaG9zdC1zcGF3bmVkIGNhdGFsb2cgY2hhbmdlcyAoZS5nLiBzdWJhZ2VudHMpIHJlYWNoIGBjYWNoZWQuY2hhdHNgXG5cdFx0Ly8gbGl2ZSwgaW5zdGVhZCBvZiByZWx5aW5nIG9uIHRoZSBpZGxlIHRpbWVyIHRoYXQgb25seSBjbGllbnQgYWN0aW9uc1xuXHRcdC8vIHJlZnJlc2guXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4gdGhpcy5fc3luY1Zpc2libGVTZXNzaW9uU3RhdGVQaW5zKHJlYWRlcikpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9zeW5jQWN0aXZlQ2xpZW50KCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU2Vzc2lvbi1jYWNoZSBwZXJzaXN0ZW5jZS4gVGhlc2UgbGlzdGVuZXJzIGFyZSBpbmVydCB1bnRpbCBhIHN1YmNsYXNzXG5cdFx0Ly8gb3B0cyBpbiB2aWEgYF9lbmFibGVTZXNzaW9uQ2FjaGVQZXJzaXN0ZW5jZWAgKHdoaWNoIHNldHMgdGhlIHN0b3JhZ2Vcblx0XHQvLyBrZXkpLiBUaGV5IGFyZSBzYWZlIHRvIHJlZ2lzdGVyIHVuY29uZGl0aW9uYWxseSBiZWNhdXNlIHRoZXkgb25seSBhY3Rcblx0XHQvLyBhdCBldmVudCB0aW1lIGFuZCByZWFkIHRoZSBrZXkgbGF6aWx5LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZXZlbnQoZSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX3Nob3VsZFRyYWNrU2Vzc2lvbkNhY2hlQ2hhbmdlcygpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFkZGVkLmxlbmd0aCA+IDAgfHwgZS5yZW1vdmVkLmxlbmd0aCA+IDAgfHwgZS5jaGFuZ2VkLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fY2FjaGVEaXJ0eSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHJlbW92ZWQgb2YgZS5yZW1vdmVkKSB7XG5cdFx0XHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHJlbW92ZWQuc2Vzc2lvbklkKTtcblx0XHRcdFx0aWYgKHJhd0lkKSB7XG5cdFx0XHRcdFx0dGhpcy5fbWV0YUJ5UmF3SWQuZGVsZXRlKHJhd0lkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3Nlc3Npb25DYWNoZVN0b3JhZ2VLZXkgJiYgdGhpcy5fY2FjaGVEaXJ0eSkge1xuXHRcdFx0XHR0aGlzLl9wZXJzaXN0Q2FjaGUoKTtcblx0XHRcdFx0dGhpcy5fY2FjaGVEaXJ0eSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vIC0tIFN1YmNsYXNzIGhvb2tzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKiogQ3VycmVudCBjb25uZWN0aW9uIChhbHdheXMgcHJlc2VudCBmb3IgbG9jYWw7IG1heSBiZSB1bmRlZmluZWQgd2hpbGUgZGlzY29ubmVjdGVkIGZvciByZW1vdGUpLiAqL1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0IGNvbm5lY3Rpb24oKTogSUFnZW50Q29ubmVjdGlvbiB8IHVuZGVmaW5lZDtcblxuXHQvKiogUHJvdmlkZXItbGV2ZWwgYXV0aGVudGljYXRpb24tcGVuZGluZyBvYnNlcnZhYmxlIHVzZWQgdG8gZGVyaXZlIGBsb2FkaW5nYCBmb3Igc2Vzc2lvbnMuICovXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXQgYXV0aGVudGljYXRpb25QZW5kaW5nKCk6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdC8qKlxuXHQgKiBTdWJjbGFzcy1zcGVjaWZpYyBwb3J0aW9uIG9mIHRoZSBhZGFwdGVyIG9wdGlvbnMuIEJhc2UgZmlsbHMgaW5cblx0ICogdGhlIGJpdHMgdGhhdCBhcmUgdW5pZm9ybSBhY3Jvc3MgaG9zdHMgKGBpY29uYCwgYGxvYWRpbmdgLFxuXHQgKiBgbWFwRGlmZlVyaWApIGZyb20gdGhlIGNvcnJlc3BvbmRpbmcgaG9va3MuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2FkYXB0ZXJPcHRpb25zKCk6IFBpY2s8SUFnZW50SG9zdEFkYXB0ZXJPcHRpb25zLCAnYnVpbGRXb3Jrc3BhY2UnPjtcblxuXHQvKipcblx0ICogSG9vayB0byBub3JtYWxpemUgYSBzZXNzaW9uJ3MgbWV0YWRhdGEgYmVmb3JlIGl0IGlzIGNhY2hlZCwga2V5ZWQsIG9yXG5cdCAqIHBlcnNpc3RlZC4gVGhlIGRlZmF1bHQgaXMgaWRlbnRpdHkuIFN1YmNsYXNzZXMgb3ZlcnJpZGUgdGhpcyB3aGVuIHRoZSBob3N0XG5cdCAqIGFkZHJlc3NlcyBzZXNzaW9ucyB1bmRlciBhIHNjaGVtZSB0aGF0IGRpZmZlcnMgZnJvbSB0aGUgYWdlbnQgcHJvdmlkZXJcblx0ICogKGUuZy4gYSBjbG91ZCBzYW5kYm94IGhvc3QgdGhhdCBsaXN0cyBzZXNzaW9ucyBhcyBgYWhwLXNlc3Npb246LzxpZD5gIHdoaWxlXG5cdCAqIGl0cyBhZ2VudCBwcm92aWRlciBpcyBgY29waWxvdGApLCBzbyB0aGF0IHJvdXRpbmcsIHBlcnNpc3RlbmNlLCBhbmQgY29udGVudFxuXHQgKiByZXNvbHV0aW9uIGFsbCBhZ3JlZSBvbiBhIHNpbmdsZSBzY2hlbWUuIE11c3QgcHJlc2VydmUgdGhlIHJhdyBzZXNzaW9uIGlkXG5cdCAqIChVUkkgcGF0aCkgc28gY2FjaGUga2V5cyByZW1haW4gc3RhYmxlLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9hZG9wdFNlc3Npb25NZXRhKG1ldGE6IElBZ2VudFNlc3Npb25NZXRhZGF0YSk6IElBZ2VudFNlc3Npb25NZXRhZGF0YSB7XG5cdFx0cmV0dXJuIG1ldGE7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGJhY2tlbmQgKHdpcmUpIHNlc3Npb24gVVJJIHNjaGVtZSBmb3IgYSBnaXZlbiBhZ2VudCBwcm92aWRlci4gRGVmYXVsdCBpc1xuXHQgKiBpZGVudGl0eSAoc2NoZW1lID09IHByb3ZpZGVyKSwgd2hpY2ggaG9sZHMgZm9yIGV2ZXJ5IGhvc3QgZXhjZXB0IHRoZSBDb3BpbG90XG5cdCAqIGhvc3QgdXNlZCBieSBjbG91ZCBzYW5kYm94LCB3aG9zZSBzZXNzaW9ucyBhcmUgYWRkcmVzc2VkIHVuZGVyXG5cdCAqIGBhaHAtc2Vzc2lvbjovPGlkPmAgd2hpbGUgdGhlIGFnZW50IHByb3ZpZGVyIGlzIGBjb3BpbG90YC4gU3ViY2xhc3Nlc1xuXHQgKiBvdmVycmlkZSB0aGlzIHNvIGFsbCBiYWNrZW5kIGBBZ2VudFNlc3Npb24udXJpKC4uLilgIHJlY29uc3RydWN0aW9ucyBvbiB0aGVcblx0ICogYWRhcHRlciBhbmQgcHJvdmlkZXIgdXNlIHRoZSBob3N0J3MgcmVhbCBzY2hlbWUuIE11c3QgYmUgYSBzdGFibGUgcGVyLXByb3ZpZGVyXG5cdCAqIG1hcHBpbmcuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2JhY2tlbmRTZXNzaW9uU2NoZW1lKGFnZW50UHJvdmlkZXI6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGFnZW50UHJvdmlkZXI7XG5cdH1cblxuXHQvKiogQnVpbGQgYW4gYWRhcHRlciBmb3IgdGhlIGdpdmVuIG1ldGFkYXRhLiAqL1xuXHRwcm90ZWN0ZWQgY3JlYXRlQWRhcHRlcihtZXRhOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEpOiBBZ2VudEhvc3RTZXNzaW9uQWRhcHRlciB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBBZ2VudFNlc3Npb24ucHJvdmlkZXIobWV0YS5zZXNzaW9uKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEFnZW50IHNlc3Npb24gVVJJIGhhcyBubyBwcm92aWRlciBzY2hlbWU6ICR7bWV0YS5zZXNzaW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc291cmNlU2NoZW1lID0gdGhpcy5yZXNvdXJjZVNjaGVtZUZvclByb3ZpZGVyKHByb3ZpZGVyKTtcblxuXHRcdGNvbnN0IG9wdGlvbnMgPSB7XG5cdFx0XHRpY29uOiB0aGlzLmljb25Gb3JBZ2VudFByb3ZpZGVyKHByb3ZpZGVyKSA/PyB0aGlzLmljb24sXG5cdFx0XHRsb2FkaW5nOiB0aGlzLmF1dGhlbnRpY2F0aW9uUGVuZGluZyxcblx0XHRcdG1hcERpZmZVcmk6IHRoaXMuX2RpZmZVcmlNYXBwZXIoKSxcblx0XHRcdGdpdEh1YlNlcnZpY2U6IHRoaXMuX2dpdEh1YlNlcnZpY2UsXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZTogdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRnZXRDb25uZWN0aW9uOiAoKSA9PiB0aGlzLmNvbm5lY3Rpb24sXG5cdFx0XHRhZ2VudENhcGFiaWxpdGllczogdGhpcy5fYWdlbnRDYXBhYmlsaXRpZXMsXG5cdFx0XHRiYWNrZW5kU2Vzc2lvblNjaGVtZTogdGhpcy5fYmFja2VuZFNlc3Npb25TY2hlbWUocHJvdmlkZXIpLFxuXHRcdFx0Li4udGhpcy5fYWRhcHRlck9wdGlvbnMoKSxcblx0XHR9IHNhdGlzZmllcyBJQWdlbnRIb3N0QWRhcHRlck9wdGlvbnM7XG5cblx0XHR0aGlzLl9tZXRhQnlSYXdJZC5zZXQoQWdlbnRTZXNzaW9uLmlkKG1ldGEuc2Vzc2lvbiksIG1ldGEpO1xuXHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RTZXNzaW9uQWRhcHRlciwgbWV0YSwgdGhpcy5pZCwgcmVzb3VyY2VTY2hlbWUsIHByb3ZpZGVyLCBvcHRpb25zKTtcblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGVBZGFwdGVyKGFkYXB0ZXI6IEFnZW50SG9zdFNlc3Npb25BZGFwdGVyLCBtZXRhOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEpOiBib29sZWFuIHtcblx0XHR0aGlzLl9tZXRhQnlSYXdJZC5zZXQoQWdlbnRTZXNzaW9uLmlkKG1ldGEuc2Vzc2lvbiksIG1ldGEpO1xuXHRcdHRoaXMuX2NhY2hlRGlydHkgPSB0cnVlO1xuXHRcdHJldHVybiBhZGFwdGVyLnVwZGF0ZShtZXRhKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlcyB0aGUgVVJJIHJlc291cmNlIHNjaGVtZSB1c2VkIHRvIHJvdXRlIHNlc3Npb24gVVJJcyB0byB0aGlzXG5cdCAqIHByb3ZpZGVyJ3MgY29udGVudCBwcm92aWRlciBmb3IgYSBnaXZlbiBhZ2VudCBwcm92aWRlciBuYW1lLiBMb2NhbFxuXHQgKiB1c2VzIGBhZ2VudC1ob3N0LSR7cHJvdmlkZXJ9YDsgcmVtb3RlIHVzZXMgYSBwZXItY29ubmVjdGlvbiBzY2hlbWUuXG5cdCAqXG5cdCAqIFRoZSByZXNvdXJjZSBzY2hlbWUgaXMgaG9zdC1zcGVjaWZpYyBhbmQgZXhpc3RzIHB1cmVseSBmb3IgY29udGVudFxuXHQgKiBwcm92aWRlciByb3V0aW5nLiBUaGUgbG9naWNhbCB7QGxpbmsgSVNlc3Npb24uc2Vzc2lvblR5cGV9IGlzIHRoZVxuXHQgKiBhZ2VudCBwcm92aWRlciBuYW1lIGl0c2VsZiwgc28gdGhlIHNhbWUgYWdlbnQgKGUuZy4gYGNvcGlsb3RjbGlgKVxuXHQgKiBhcHBlYXJzIHVuZGVyIG9uZSBzaGFyZWQgc2Vzc2lvbiB0eXBlIGFjcm9zcyBob3N0cy5cblx0ICovXG5cdHByb3RlY3RlZCBhYnN0cmFjdCByZXNvdXJjZVNjaGVtZUZvclByb3ZpZGVyKHByb3ZpZGVyOiBzdHJpbmcpOiBzdHJpbmc7XG5cblx0LyoqIEZvcm1hdCB0aGUgaHVtYW4tcmVhZGFibGUgbGFiZWwgZm9yIGEgc2Vzc2lvbiB0eXBlIGVudHJ5IChlLmcuIGBDb3BpbG90YCkuICovXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfZm9ybWF0U2Vzc2lvblR5cGVMYWJlbChhZ2VudExhYmVsOiBzdHJpbmcpOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgYHByb3ZpZGVyYCBzaG91bGQgYmUgYWR2ZXJ0aXNlZCBhcyBhIHNlc3Npb24gdHlwZSBieSB0aGlzIGhvc3QuXG5cdCAqIERlZmF1bHRzIHRvIGB0cnVlYCAoYWR2ZXJ0aXNlIGV2ZXJ5dGhpbmcgdGhlIGhvc3QgcmVwb3J0cykuIFRoZSBsb2NhbFxuXHQgKiBwcm92aWRlciBvdmVycmlkZXMgdGhpcyB0byBzdXBwcmVzcyB0aGUgYWdlbnQgaG9zdCdzIENsYXVkZSB3aGVuIHRoZVxuXHQgKiB3aW5kb3cgcHJlZmVycyB0aGUgZXh0ZW5zaW9uLWhvc3QgQ2xhdWRlLCBtaXJyb3JpbmcgdGhlIGdhdGVcblx0ICoge0BsaW5rIEFnZW50SG9zdENvbnRyaWJ1dGlvbn0gYXBwbGllcyB0byB0aGUgY2hhdCBzZXNzaW9uIGNvbnRyaWJ1dGlvbiBzb1xuXHQgKiB0aGUgd2VsY29tZSBwaWNrZXIgZG9lc24ndCBsaXN0IENsYXVkZSB0d2ljZS5cblx0ICovXG5cdHByb3RlY3RlZCBfc2hvdWxkQWR2ZXJ0aXNlQWdlbnQoX3Byb3ZpZGVyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBfc3luY1Jvb3RTdGF0ZShyb290U3RhdGU6IFJvb3RTdGF0ZSB8IEVycm9yIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHJvb3RTdGF0ZSAmJiAhKHJvb3RTdGF0ZSBpbnN0YW5jZW9mIEVycm9yKSkge1xuXHRcdFx0dGhpcy5fc3luY1Nlc3Npb25UeXBlc0Zyb21Sb290U3RhdGUocm9vdFN0YXRlKTtcblx0XHRcdHRoaXMuX3N5bmNSb290Q29uZmlnRnJvbVJvb3RTdGF0ZShyb290U3RhdGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N5bmNBZ2VudENhcGFiaWxpdGllcyh1bmRlZmluZWQpO1xuXHRcdGlmICh0aGlzLl9zZXNzaW9uVHlwZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fc2Vzc2lvblR5cGVzID0gW107XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25UeXBlcy5maXJlKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9yb290Q29uZmlnKSB7XG5cdFx0XHR0aGlzLl9yb290Q29uZmlnID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VSb290Q29uZmlnLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zeW5jQWdlbnRDYXBhYmlsaXRpZXMoYWdlbnRzOiByZWFkb25seSBBZ2VudEluZm9bXSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9sYXN0QWdlbnRzID09PSBhZ2VudHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9sYXN0QWdlbnRzID0gYWdlbnRzO1xuXHRcdHRoaXMuX2FnZW50Q2FwYWJpbGl0aWVzLnNldChhZ2VudHMgPyBuZXcgTWFwKGFnZW50cy5tYXAoYWdlbnQgPT4gW2FnZW50LnByb3ZpZGVyLCBhZ2VudC5jYXBhYmlsaXRpZXNdKSkgOiB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMuZmlyZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnMuZmlyZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlY29uY2lsZSB7QGxpbmsgX3Nlc3Npb25UeXBlc30gYWdhaW5zdCB0aGUgYWdlbnRzIGFkdmVydGlzZWQgYnkgdGhlXG5cdCAqIGhvc3QncyByb290IHN0YXRlLCBmaXJpbmcge0BsaW5rIG9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzfSBvbmx5IGlmIHRoZVxuXHQgKiBpZC9sYWJlbCBzZXQgYWN0dWFsbHkgY2hhbmdlZC5cblx0ICovXG5cdHByb3RlY3RlZCBfc3luY1Nlc3Npb25UeXBlc0Zyb21Sb290U3RhdGUocm9vdFN0YXRlOiBSb290U3RhdGUpOiB2b2lkIHtcblx0XHR0aGlzLl9zeW5jQWdlbnRDYXBhYmlsaXRpZXMocm9vdFN0YXRlLmFnZW50cyk7XG5cdFx0Y29uc3QgbmV4dCA9IHJvb3RTdGF0ZS5hZ2VudHNcblx0XHRcdC5maWx0ZXIoYWdlbnQgPT4gdGhpcy5fc2hvdWxkQWR2ZXJ0aXNlQWdlbnQoYWdlbnQucHJvdmlkZXIpKVxuXHRcdFx0Lm1hcCgoYWdlbnQpOiBJU2Vzc2lvblR5cGUgPT4gKHtcblx0XHRcdFx0aWQ6IGFnZW50LnByb3ZpZGVyLFxuXHRcdFx0XHRzdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbjogYWdlbnQucHJvdmlkZXIgPT09IENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCxcblx0XHRcdFx0Ly8gVGhlIGNoYXQgc2Vzc2lvbiBjb250cmlidXRpb24gYW5kIGxhbmd1YWdlIG1vZGVscyBmb3IgYW4gYWdlbnQtaG9zdFxuXHRcdFx0XHQvLyBhZ2VudCBhcmUgcmVnaXN0ZXJlZCB1bmRlciBpdHMgcmVzb3VyY2Ugc2NoZW1lIChgYWdlbnQtaG9zdC08cHJvdmlkZXI+YCksXG5cdFx0XHRcdC8vIG5vdCB0aGUgYmFyZSBwcm92aWRlciBpZCwgc28gY2FycnkgaXQgZm9yIGF2YWlsYWJpbGl0eSBsb29rdXBzLlxuXHRcdFx0XHRjaGF0U2Vzc2lvblR5cGU6IHRoaXMucmVzb3VyY2VTY2hlbWVGb3JQcm92aWRlcihhZ2VudC5wcm92aWRlciksXG5cdFx0XHRcdGxhYmVsOiB0aGlzLl9mb3JtYXRTZXNzaW9uVHlwZUxhYmVsKGFnZW50LmRpc3BsYXlOYW1lPy50cmltKCkgfHwgYWdlbnQucHJvdmlkZXIpLFxuXHRcdFx0XHRpY29uOiB0aGlzLmljb25Gb3JBZ2VudFByb3ZpZGVyKGFnZW50LnByb3ZpZGVyKSA/PyB0aGlzLmljb24sXG5cdFx0XHR9KSk7XG5cblx0XHRjb25zdCBwcmV2ID0gdGhpcy5fc2Vzc2lvblR5cGVzO1xuXHRcdGlmIChwcmV2Lmxlbmd0aCA9PT0gbmV4dC5sZW5ndGggJiYgcHJldi5ldmVyeSgodCwgaSkgPT4gdC5pZCA9PT0gbmV4dFtpXS5pZCAmJiB0LmxhYmVsID09PSBuZXh0W2ldLmxhYmVsKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zZXNzaW9uVHlwZXMgPSBuZXh0O1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzLmZpcmUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSB7QGxpbmsgVGhlbWVJY29ufSBhc3NvY2lhdGVkIHdpdGggYSBrbm93biBhZ2VudCBwcm92aWRlciwgb3Jcblx0ICogYHVuZGVmaW5lZGAgd2hlbiB0aGUgcHJvdmlkZXIgaXMgbm90IHJlY29nbmlzZWQuXG5cdCAqL1xuXHRwcml2YXRlIGljb25Gb3JBZ2VudFByb3ZpZGVyKHByb3ZpZGVyOiBzdHJpbmcpOiBUaGVtZUljb24gfCB1bmRlZmluZWQge1xuXHRcdGlmIChwcm92aWRlciA9PT0gQ29waWxvdENMSVNlc3Npb25UeXBlLmlkKSB7XG5cdFx0XHRyZXR1cm4gQ29waWxvdENMSVNlc3Npb25UeXBlLmljb247XG5cdFx0fVxuXG5cdFx0aWYgKHByb3ZpZGVyLmluY2x1ZGVzKCdjbGF1ZGUnKSkge1xuXHRcdFx0cmV0dXJuIENvZGljb24uY2xhdWRlO1xuXHRcdH1cblxuXHRcdGlmIChwcm92aWRlciA9PT0gJ29wZW5haScgfHwgcHJvdmlkZXIuaW5jbHVkZXMoJ2NvZGV4JykpIHtcblx0XHRcdHJldHVybiBDb2RpY29uLm9wZW5haTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlY29uY2lsZSB7QGxpbmsgX3Jvb3RDb25maWd9IGFnYWluc3Qge0BsaW5rIFJvb3RTdGF0ZS5jb25maWd9LCBmaXJpbmdcblx0ICoge0BsaW5rIG9uRGlkQ2hhbmdlUm9vdENvbmZpZ30gb25seSB3aGVuIHNjaGVtYSBvciB2YWx1ZXMgYWN0dWFsbHkgY2hhbmdlLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9zeW5jUm9vdENvbmZpZ0Zyb21Sb290U3RhdGUocm9vdFN0YXRlOiBSb290U3RhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBuZXh0ID0gcm9vdFN0YXRlLmNvbmZpZztcblx0XHRjb25zdCBwcmV2ID0gdGhpcy5fcm9vdENvbmZpZztcblx0XHRpZiAocHJldiA9PT0gbmV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIW5leHQpIHtcblx0XHRcdHRoaXMuX3Jvb3RDb25maWcgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVJvb3RDb25maWcuZmlyZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAocHJldj8uc2NoZW1hID09PSBuZXh0LnNjaGVtYSAmJiBlcXVhbHMocHJldi52YWx1ZXMsIG5leHQudmFsdWVzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yb290Q29uZmlnID0gbmV4dDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVJvb3RDb25maWcuZmlyZSgpO1xuXHR9XG5cblx0YWJzdHJhY3QgcmVzb2x2ZVdvcmtzcGFjZShyZXBvc2l0b3J5VXJpOiBVUkkpOiBJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZDtcblxuXHQvKiogT3B0aW9uYWwgZXZlbnQgZmlyZWQgd2hlbiB0aGUgdW5kZXJseWluZyBjb25uZWN0aW9uIGlzIGxvc3Q7IHVzZWQgdG8gc2hvcnQtY2lyY3VpdCBgX3dhaXRGb3JOZXdTZXNzaW9uYC4gKi9cblx0cHJvdGVjdGVkIGdldCBvbkNvbm5lY3Rpb25Mb3N0KCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIEV2ZW50Lk5vbmU7IH1cblxuXHQvKiogTWFwcyBhIHdvcmtpbmctZGlyZWN0b3J5IFVSSSBmcm9tIHRoZSBzZXNzaW9uIHN1bW1hcnkgdG8gYSBsb2NhbCBVUkkuIERlZmF1bHQgaWRlbnRpdHk7IHJlbW90ZSBvdmVycmlkZXMgdG8gYHRvQWdlbnRIb3N0VXJpYC4gKi9cblx0cHJvdGVjdGVkIG1hcFdvcmtpbmdEaXJlY3RvcnlVcmkodXJpOiBVUkkpOiBVUkkgeyByZXR1cm4gdXJpOyB9XG5cblx0LyoqIE1hcHMgYSBwcm9qZWN0IFVSSSBmcm9tIHRoZSBzZXNzaW9uIHN1bW1hcnkgdG8gYSBsb2NhbCBVUkkuIERlZmF1bHQgaWRlbnRpdHk7IHJlbW90ZSBvdmVycmlkZXMgZm9yIGBmaWxlOmAgcGF0aHMuICovXG5cdHByb3RlY3RlZCBtYXBQcm9qZWN0VXJpKHVyaTogVVJJKTogVVJJIHsgcmV0dXJuIHVyaTsgfVxuXG5cdC8vIC0tIFNlc3Npb24gbGlzdGluZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRnZXRTZXNzaW9uVHlwZXMoX3JlcG9zaXRvcnlVcmk6IFVSSSk6IElTZXNzaW9uVHlwZVtdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuc2Vzc2lvblR5cGVzXTtcblx0fVxuXG5cdHByaXZhdGUgX3N5bmNBY3RpdmVDbGllbnQoKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGlmICghYWN0aXZlU2Vzc2lvbiB8fCBhY3RpdmVTZXNzaW9uLnByb3ZpZGVySWQgIT09IHRoaXMuaWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByYXdJZCA9IHRoaXMuX3Jhd0lkRnJvbUNoYXRJZChhY3RpdmVTZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gcmF3SWQgPyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdGlmICghcmF3SWQgfHwgIWNhY2hlZCB8fCAhY29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZUNsaWVudCA9IHRoaXMuX2FjdGl2ZUNsaWVudFNlcnZpY2UuZ2V0QWN0aXZlQ2xpZW50KFxuXHRcdFx0dGhpcy5yZXNvdXJjZVNjaGVtZUZvclByb3ZpZGVyKGNhY2hlZC5hZ2VudFByb3ZpZGVyKSxcblx0XHRcdGNvbm5lY3Rpb24uY2xpZW50SWQsXG5cdFx0KTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2xhc3RTZXNzaW9uU3RhdGVzLmdldChjYWNoZWQuc2Vzc2lvbklkKT8uYWN0aXZlQ2xpZW50cy5maW5kKGNsaWVudCA9PiBjbGllbnQuY2xpZW50SWQgPT09IGFjdGl2ZUNsaWVudC5jbGllbnRJZCk7XG5cdFx0aWYgKGVxdWFscyhleGlzdGluZywgYWN0aXZlQ2xpZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbm5lY3Rpb24uZGlzcGF0Y2goQWdlbnRTZXNzaW9uLnVyaShjYWNoZWQuYWdlbnRQcm92aWRlciwgcmF3SWQpLnRvU3RyaW5nKCksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdGFjdGl2ZUNsaWVudCxcblx0XHR9KTtcblx0fVxuXG5cdGdldFNlc3Npb25zKCk6IElTZXNzaW9uW10ge1xuXHRcdHRoaXMuX2Vuc3VyZVNlc3Npb25DYWNoZSgpO1xuXHRcdC8vIEZpbHRlciBhdCByZWFkIHRpbWUgKHJhdGhlciB0aGFuIGV2aWN0aW5nIGZyb20gdGhlIGNhY2hlKSBzbyBhIGdhdGVcblx0XHQvLyBmbGlwIGlzIGluc3RhbnQgaW4gYm90aCBkaXJlY3Rpb25zOiBoaWRkZW4gc2Vzc2lvbnMgc3RheSBjYWNoZWQgYW5kXG5cdFx0Ly8gcmVhcHBlYXIgaW1tZWRpYXRlbHkgd2hlbiB0aGUgcHJlZmVyZW5jZSBmbGlwcyBiYWNrLiBUaGUgZGVmYXVsdCBnYXRlXG5cdFx0Ly8gYWRtaXRzIGV2ZXJ5dGhpbmc7IG9ubHkgdGhlIGxvY2FsIHByb3ZpZGVyIHN1cHByZXNzZXMgdGhlIGFnZW50IGhvc3Qnc1xuXHRcdC8vIENsYXVkZSB3aGVuIHRoZSB3aW5kb3cgcHJlZmVycyB0aGUgZXh0ZW5zaW9uLWhvc3QgQ2xhdWRlLlxuXHRcdC8vXG5cdFx0Ly8gQm90aCBgYWdlbnRQcm92aWRlcmAgKGNhY2hlZCkgYW5kIGBzZXNzaW9uVHlwZWAgKHBlbmRpbmcpIGNhcnJ5IHRoZVxuXHRcdC8vIGJhcmUgcHJvdmlkZXIgbmFtZSAoZS5nLiBgY2xhdWRlYCksIHdoaWNoIGlzIHdoYXQgdGhlIGdhdGUgZXhwZWN0cyBcdTIwMTRcblx0XHQvLyBOT1QgdGhlIGBhZ2VudC1ob3N0LTxwcm92aWRlcj5gIHJlc291cmNlIHNjaGVtZSBmcm9tXG5cdFx0Ly8gYHJlc291cmNlU2NoZW1lRm9yUHJvdmlkZXJgLiBLZWVwIGl0IHRoYXQgd2F5LlxuXHRcdC8vXG5cdFx0Ly8gU3ViY2xhc3NlcyB3aG9zZSBgX3Nob3VsZEFkdmVydGlzZUFnZW50YCBjYW4gY2hhbmdlIGF0IHJ1bnRpbWUgTVVTVFxuXHRcdC8vIGZpcmUgYG9uRGlkQ2hhbmdlU2Vzc2lvbnNgIHdoZW4gaXQgZG9lcywgc28gY29uc3VtZXJzIHJlLXF1ZXJ5IGFuZFxuXHRcdC8vIHJlLWZpbHRlciAoc2VlIHRoZSBsb2NhbCBwcm92aWRlcidzIGBwcmVmZXJBZ2VudEhvc3RgIGxpc3RlbmVyKS5cblx0XHRjb25zdCBzZXNzaW9uczogSVNlc3Npb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2FjaGVkIG9mIHRoaXMuX3Nlc3Npb25DYWNoZS52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHRoaXMuX3Nob3VsZEFkdmVydGlzZUFnZW50KGNhY2hlZC5hZ2VudFByb3ZpZGVyKSkge1xuXHRcdFx0XHRzZXNzaW9ucy5wdXNoKGNhY2hlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9wZW5kaW5nU2Vzc2lvbiAmJiB0aGlzLl9zaG91bGRBZHZlcnRpc2VBZ2VudCh0aGlzLl9wZW5kaW5nU2Vzc2lvbi5zZXNzaW9uVHlwZSkpIHtcblx0XHRcdHNlc3Npb25zLnB1c2godGhpcy5fcGVuZGluZ1Nlc3Npb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gc2Vzc2lvbnM7XG5cdH1cblxuXHRnZXRTZXNzaW9uQnlSZXNvdXJjZShyZXNvdXJjZTogVVJJKTogSVNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgbmV3U2Vzc2lvbiBvZiB0aGlzLl9uZXdTZXNzaW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKG5ld1Nlc3Npb24uc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRcdHJldHVybiBuZXdTZXNzaW9uLnNlc3Npb247XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdTZXNzaW9uPy5yZXNvdXJjZS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcGVuZGluZ1Nlc3Npb247XG5cdFx0fVxuXG5cdFx0dGhpcy5fZW5zdXJlU2Vzc2lvbkNhY2hlKCk7XG5cdFx0Zm9yIChjb25zdCBjYWNoZWQgb2YgdGhpcy5fc2Vzc2lvbkNhY2hlLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoY2FjaGVkLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0Ly8gT3BlbmluZyBhIHNlc3Npb246IHN1YnNjcmliZSB0byBpdHMgQUhQIHN0YXRlIHNvIHRoYXRcblx0XHRcdFx0Ly8gYF9tZXRhYCAoZS5nLiBsYXp5IGdpdCBzdGF0ZSBjb21wdXRlZCBieSB0aGUgYWdlbnQgaG9zdClcblx0XHRcdFx0Ly8gZmxvd3MgaW50byB0aGUgY2FjaGVkIGFkYXB0ZXIuIFRoZSBrZWVwLWFsaXZlIGhlbHBlciByZXNldHNcblx0XHRcdFx0Ly8gYW4gaWRsZSB0aW1lciBzbyB0aGUgc3Vic2NyaXB0aW9uIGlzIGRyb3BwZWQgb25jZSB0aGUgc2Vzc2lvblxuXHRcdFx0XHQvLyBpcyBubyBsb25nZXIgYmVpbmcgdG91Y2hlZCwgYWxsb3dpbmcgdGhlIGFnZW50IGhvc3QgdG8gZXZpY3Rcblx0XHRcdFx0Ly8gaWRsZSByZXN0b3JlZCBzdGF0ZS5cblx0XHRcdFx0dGhpcy5fa2VlcFNlc3Npb25TdGF0ZUFsaXZlKGNhY2hlZC5zZXNzaW9uSWQpO1xuXHRcdFx0XHRyZXR1cm4gY2FjaGVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyAtLSBTZXNzaW9uIGxpZmVjeWNsZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0Y3JlYXRlTmV3U2Vzc2lvbih3b3Jrc3BhY2VVcmk6IFVSSSwgc2Vzc2lvblR5cGVJZDogc3RyaW5nKTogSVNlc3Npb24ge1xuXHRcdGlmICghd29ya3NwYWNlVXJpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1dvcmtzcGFjZSBoYXMgbm8gcmVwb3NpdG9yeSBVUkknKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IHRoaXMuc2Vzc2lvblR5cGVzLmZpbmQodCA9PiB0LmlkID09PSBzZXNzaW9uVHlwZUlkKTtcblx0XHRpZiAoIXNlc3Npb25UeXBlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IodGhpcy5fbm9BZ2VudHNFcnJvck1lc3NhZ2UoKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdmFsaWRhdGVCZWZvcmVDcmVhdGUoc2Vzc2lvblR5cGUpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5yZXNvbHZlV29ya3NwYWNlKHdvcmtzcGFjZVVyaSk7XG5cdFx0aWYgKCF3b3Jrc3BhY2UpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHJlc29sdmUgd29ya3NwYWNlIGZvciBVUkk6ICR7d29ya3NwYWNlVXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURyYWZ0U2Vzc2lvbihzZXNzaW9uVHlwZSwgd29ya3NwYWNlLCBmYWxzZSk7XG5cdH1cblxuXHRjcmVhdGVRdWlja0NoYXQoc2Vzc2lvblR5cGVJZDogc3RyaW5nKTogSVNlc3Npb24ge1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gdGhpcy5zZXNzaW9uVHlwZXMuZmluZCh0ID0+IHQuaWQgPT09IHNlc3Npb25UeXBlSWQpO1xuXHRcdGlmICghc2Vzc2lvblR5cGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcih0aGlzLl9ub0FnZW50c0Vycm9yTWVzc2FnZSgpKTtcblx0XHR9XG5cblx0XHR0aGlzLl92YWxpZGF0ZUJlZm9yZUNyZWF0ZShzZXNzaW9uVHlwZSk7XG5cblx0XHQvLyBBIHF1aWNrIGNoYXQgaXMgdGhlIHNhbWUgc2Vzc2lvbiB0eXBlIGFzIGEgbm9ybWFsIHNlc3Npb24sIGp1c3Rcblx0XHQvLyB3b3Jrc3BhY2UtbGVzczogbm8gYHJlc29sdmVXb3Jrc3BhY2VgLCBubyBgd29ya2luZ0RpcmVjdG9yeWAuIFRoZVxuXHRcdC8vIGFnZW50IGhvc3QgcnVucyBpdCBpbiBhIHRocm93YXdheSBzY3JhdGNoIGN3ZCBhbmQgdGFncyBpdCB2aWEgdGhlXG5cdFx0Ly8gYHF1aWNrQ2hhdGAgY3JlYXRlIGZsYWcuXG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURyYWZ0U2Vzc2lvbihzZXNzaW9uVHlwZSwgdW5kZWZpbmVkLCB0cnVlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZHMsIHRyYWNrcywgYW5kIGVhZ2VybHkgc3RhcnRzIGEge0BsaW5rIE5ld1Nlc3Npb259IGRyYWZ0IGZvciB0aGVcblx0ICogZ2l2ZW4gc2Vzc2lvbiB0eXBlLiBTaGFyZWQgYnkge0BsaW5rIGNyZWF0ZU5ld1Nlc3Npb259ICh3b3Jrc3BhY2UtYm91bmQpXG5cdCAqIGFuZCB7QGxpbmsgY3JlYXRlUXVpY2tDaGF0fSAod29ya3NwYWNlLWxlc3MsIGBxdWlja0NoYXQgPT09IHRydWVgKS5cblx0ICovXG5cdHByaXZhdGUgX2NyZWF0ZURyYWZ0U2Vzc2lvbihzZXNzaW9uVHlwZTogSVNlc3Npb25UeXBlLCB3b3Jrc3BhY2U6IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkLCBxdWlja0NoYXQ6IGJvb2xlYW4pOiBJU2Vzc2lvbiB7XG5cdFx0Ly8gVGVhci1kb3duIG9mIHN1cGVyc2VkZWQgZHJhZnRzIGlzIGhhbmRsZWQgYnkgdGhlIG1hbmFnZW1lbnQgbGF5ZXJcblx0XHQvLyAoaXQgY2FsbHMgYGRlbGV0ZU5ld1Nlc3Npb25gIG9uIHRoZSBwcmV2aW91cyBwZW5kaW5nIHNlc3Npb24pLiBFYWNoXG5cdFx0Ly8gbmV3IHNlc3Npb24gaXMgdHJhY2tlZCBpbmRlcGVuZGVudGx5IGluIGBfbmV3U2Vzc2lvbnNgIHNvIHNldmVyYWwgY2FuXG5cdFx0Ly8gYmUgaW4gZmxpZ2h0IGF0IG9uY2UgKGUuZy4gb25lIHNlbmRpbmcgaW4gdGhlIGJhY2tncm91bmQgd2hpbGUgdGhlXG5cdFx0Ly8gY29tcG9zZXIgcmUtc2VlZHMgYSBmcmVzaCBkcmFmdCkuXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRjb25zdCByZXNvdXJjZVNjaGVtZSA9IHRoaXMucmVzb3VyY2VTY2hlbWVGb3JQcm92aWRlcihzZXNzaW9uVHlwZS5pZCk7XG5cdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5ld1Nlc3Npb24sIHtcblx0XHRcdHdvcmtzcGFjZSxcblx0XHRcdHF1aWNrQ2hhdCxcblx0XHRcdHNlc3Npb25UeXBlLFxuXHRcdFx0cHJvdmlkZXJJZDogdGhpcy5pZCxcblx0XHRcdGljb246IHNlc3Npb25UeXBlLmljb24sXG5cdFx0XHRyZXNvdXJjZVNjaGVtZSxcblx0XHRcdGJhY2tlbmRTZXNzaW9uU2NoZW1lOiB0aGlzLl9iYWNrZW5kU2Vzc2lvblNjaGVtZShzZXNzaW9uVHlwZS5pZCksXG5cdFx0XHRhdXRoZW50aWNhdGlvblBlbmRpbmc6IHRoaXMuYXV0aGVudGljYXRpb25QZW5kaW5nLFxuXHRcdFx0bG9nU2VydmljZTogdGhpcy5fbG9nU2VydmljZSxcblx0XHRcdGluaXRpYWxDb25maWdWYWx1ZXM6IHRoaXMuX2luaXRpYWxOZXdTZXNzaW9uQ29uZmlnKHdvcmtzcGFjZSksXG5cdFx0XHRpbml0aWFsQ29uZmlnU2NoZW1hOiB0aGlzLl9zZWVkZWRDb25maWdTY2hlbWEoKSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlOiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdG9uU2Vzc2lvblN0YXRlOiAoaWQsIHN0YXRlKSA9PiBzdGF0ZSA9PT0gdW5kZWZpbmVkXG5cdFx0XHRcdD8gdGhpcy5faGFuZGxlTmV3U2Vzc2lvblN0YXRlR29uZShpZClcblx0XHRcdFx0OiB0aGlzLl9oYW5kbGVOZXdTZXNzaW9uU3RhdGVVcGRhdGUoaWQsIHN0YXRlKSxcblx0XHRcdGFjdGl2ZUNsaWVudDogY29ubmVjdGlvblxuXHRcdFx0XHQ/IHRoaXMuX2FjdGl2ZUNsaWVudFNlcnZpY2UuZ2V0QWN0aXZlQ2xpZW50KHJlc291cmNlU2NoZW1lLCBjb25uZWN0aW9uLmNsaWVudElkKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHR9LCB7XG5cdFx0XHRpY29uOiB0aGlzLmljb25Gb3JBZ2VudFByb3ZpZGVyKHNlc3Npb25UeXBlLmlkKSA/PyB0aGlzLmljb24sXG5cdFx0XHRsb2FkaW5nOiB0aGlzLmF1dGhlbnRpY2F0aW9uUGVuZGluZyxcblx0XHRcdG1hcERpZmZVcmk6IHRoaXMuX2RpZmZVcmlNYXBwZXIoKSxcblx0XHRcdGdpdEh1YlNlcnZpY2U6IHRoaXMuX2dpdEh1YlNlcnZpY2UsXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZTogdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRnZXRDb25uZWN0aW9uOiAoKSA9PiB0aGlzLmNvbm5lY3Rpb24sXG5cdFx0XHRhZ2VudENhcGFiaWxpdGllczogdGhpcy5fYWdlbnRDYXBhYmlsaXRpZXMsXG5cdFx0XHQuLi50aGlzLl9hZGFwdGVyT3B0aW9ucygpLFxuXHRcdH0gc2F0aXNmaWVzIElBZ2VudEhvc3RBZGFwdGVyT3B0aW9ucyk7XG5cdFx0dGhpcy5fbmV3U2Vzc2lvbnMuc2V0KG5ld1Nlc3Npb24uc2Vzc2lvbklkLCBuZXdTZXNzaW9uKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25Db25maWcuZmlyZShuZXdTZXNzaW9uLnNlc3Npb25JZCk7XG5cblx0XHQvLyBLaWNrIG9mZiB0aGUgaW5pdGlhbCBjb25maWcgcmVzb2x2ZSBhbmQgdGhlIGVhZ2VyIGJhY2tlbmQgc2Vzc2lvblxuXHRcdC8vIGluIHBhcmFsbGVsIGFmdGVyIGF1dGhlbnRpY2F0aW9uIHNldHRsZXMuIFdoaWxlIGF1dGggaXMgcGVuZGluZyxcblx0XHQvLyBwcm92aWRlcnMgc3VjaCBhcyBDb2RleCByZWplY3QgYm90aCBwYXRocyB3aXRoIEF1dGhSZXF1aXJlZDsgdGhlXG5cdFx0Ly8gc3ViY2xhc3MgY2FsbHMgX3Jlc3VtZU5ld1Nlc3Npb25BZnRlckF1dGhlbnRpY2F0aW9uU2V0dGxlcyB3aGVuIHRoZVxuXHRcdC8vIGZpcnN0IGF1dGggcGFzcyBjb21wbGV0ZXMuXG5cdFx0aWYgKGNvbm5lY3Rpb24pIHtcblx0XHRcdGlmICghdGhpcy5hdXRoZW50aWNhdGlvblBlbmRpbmcuZ2V0KCkpIHtcblx0XHRcdFx0dGhpcy5fc3RhcnROZXdTZXNzaW9uQmFja2VuZChuZXdTZXNzaW9uLCBjb25uZWN0aW9uKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bmV3U2Vzc2lvbi5zZXRMb2FkaW5nKGZhbHNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ld1Nlc3Npb24uc2Vzc2lvbjtcblx0fVxuXG5cdHByb3RlY3RlZCBfcmVzdW1lTmV3U2Vzc2lvbkFmdGVyQXV0aGVudGljYXRpb25TZXR0bGVzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgbmV3U2Vzc2lvbiBvZiB0aGlzLl9uZXdTZXNzaW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0dGhpcy5fc3RhcnROZXdTZXNzaW9uQmFja2VuZChuZXdTZXNzaW9uLCBjb25uZWN0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zdGFydE5ld1Nlc3Npb25CYWNrZW5kKG5ld1Nlc3Npb246IE5ld1Nlc3Npb24sIGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24pOiB2b2lkIHtcblx0XHQvLyBSZXNvbHZpbmcgdGhlIHNlc3Npb24gY29uZmlnIChzY2hlbWEgKyBkZWZhdWx0cyBmb3IgdGhlIHBpY2tlciBjaGlwcylcblx0XHQvLyBpcyBwYXJ0IG9mIHZpZXdpbmcgdGhlIG5ldy1zZXNzaW9uIFVJIGFuZCBzdGF5cyB1bmdhdGVkLlxuXHRcdHZvaWQgdGhpcy5fcmVmcmVzaE5ld1Nlc3Npb25Db25maWcobmV3U2Vzc2lvbik7XG5cblx0XHQvLyBEZWZlbnNlLWluLWRlcHRoOiBuZXZlciBlYWdlcmx5IHNwYXduIGFuIGFnZW50IGJhY2tlbmQgaW4gYW5cblx0XHQvLyB1bnRydXN0ZWQgZm9sZGVyLiBUaGUgaW50ZXJhY3RpdmUgdHJ1c3QgcHJvbXB0IGxpdmVzIGF0IGZvbGRlci1waWNrXG5cdFx0Ly8gdGltZSAobmV3Q2hhdFdpZGdldCkgYW5kIGEgYmFja3N0b3AgcnVucyBvbiBmaXJzdCBTZW5kXG5cdFx0Ly8gKEFnZW50SG9zdFNlc3Npb25IYW5kbGVyKSwgc28gaW4gdGhlIG5vcm1hbCBmbG93IHRoZSBmb2xkZXIgaXNcblx0XHQvLyBhbHJlYWR5IHRydXN0ZWQgaGVyZS4gVGhpcyBndWFyZHMgYWx0ZXJuYXRlIGVudHJ5IHBvaW50cyAoZS5nLlxuXHRcdC8vIGRlbGVnYXRpb24pLiBOby1vcCBmb3IgcHJvdmlkZXJzIHRoYXQgZG9uJ3QgcmVxdWlyZSB0cnVzdCAocmVtb3RlKS5cblx0XHRpZiAobmV3U2Vzc2lvbi5yZXF1aXJlc1dvcmtzcGFjZVRydXN0ICYmIG5ld1Nlc3Npb24ud29ya3NwYWNlVXJpKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VVcmkgPSBuZXdTZXNzaW9uLndvcmtzcGFjZVVyaTtcblx0XHRcdHZvaWQgKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyB0cnVzdGVkIH0gPSBhd2FpdCB0aGlzLl93b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmdldFVyaVRydXN0SW5mbyh3b3Jrc3BhY2VVcmkpO1xuXHRcdFx0XHQvLyBCYWlsIGlmIHRoZSBkcmFmdCB3YXMgYWJhbmRvbmVkL3JlcGxhY2VkIHdoaWxlIHdlIGF3YWl0ZWRcblx0XHRcdFx0Ly8gdHJ1c3QgaW5mbyAoZS5nLiBkZWxldGVOZXdTZXNzaW9uLCBjb25uZWN0aW9uIGRyb3ApIFx1MjAxNCBkb24ndFxuXHRcdFx0XHQvLyBzcGF3biBhIGJhY2tlbmQgc2Vzc2lvbiBmb3IgYSBzdGFsZSBlbnRyeS5cblx0XHRcdFx0aWYgKHRoaXMuX25ld1Nlc3Npb25zLmdldChuZXdTZXNzaW9uLnNlc3Npb25JZCkgIT09IG5ld1Nlc3Npb24pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCF0cnVzdGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgWyR7dGhpcy5pZH1dIFNraXBwaW5nIGVhZ2VyIGNyZWF0ZVNlc3Npb24gZm9yIHVudHJ1c3RlZCBmb2xkZXIgJHt3b3Jrc3BhY2VVcmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0XHRuZXdTZXNzaW9uLnNldExvYWRpbmcoZmFsc2UpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRuZXdTZXNzaW9uLmVhZ2VyQ3JlYXRlKGNvbm5lY3Rpb24pO1xuXHRcdFx0fSkoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bmV3U2Vzc2lvbi5lYWdlckNyZWF0ZShjb25uZWN0aW9uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1yZXNvbHZlIHRoZSBzZXNzaW9uIGNvbmZpZyBhZ2FpbnN0IHRoZSBhZ2VudCBob3N0IGFuZCBwdWxzZVxuXHQgKiB7QGxpbmsgX29uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZ30uIFRoZSB7QGxpbmsgTmV3U2Vzc2lvbn0gb3ducyBpdHMgb3duXG5cdCAqIHN0YWxlLXJlcXVlc3QgZ3VhcmQgc28gYmFjay10by1iYWNrIGNhbGxzIGFyZSBzYWZlLlxuXHQgKiBAcGFyYW0gZXhwZWN0ZWQgTm9ybWFsaXplZCB2YWx1ZXMgdGhhdCBtdXN0IGJlIHByZXNlbnQgYWZ0ZXIgcmVzb2x1dGlvbjsgbWlzbWF0Y2hlcyBhbmQgaW5jb21wbGV0ZSBhcHBsaWNhdGlvbiByZWplY3QuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZWZyZXNoTmV3U2Vzc2lvbkNvbmZpZyhzZXNzaW9uOiBOZXdTZXNzaW9uLCBleHBlY3RlZD86IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHVua25vd24+Pik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHQvLyB7QGxpbmsgcmVzb2x2ZUNvbmZpZ30gKHRoZSBvbmx5IG90aGVyIGNsZWFyIHBhdGgpIGlzIHNraXBwZWRcblx0XHRcdC8vIG9uIHRoaXMgYnJhbmNoLCBzbyBjbGVhciB0aGUgZmxhZyBoZXJlIHRvIGF2b2lkIHN0YWxsaW5nXG5cdFx0XHQvLyB0aGUgcGlja2VyIGZvcmV2ZXIuXG5cdFx0XHRzZXNzaW9uLmVuZFJlc29sdmVDb25maWdTeW5jKCk7XG5cdFx0XHRzZXNzaW9uLnNldExvYWRpbmcoZmFsc2UpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnLmZpcmUoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0aWYgKGV4cGVjdGVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHNldCBzZXNzaW9uIHJlcG9zaXRvcnkgY29uZmlnIHdpdGhvdXQgYW4gYWdlbnQgaG9zdCBjb25uZWN0aW9uLicpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzZXNzaW9uLnNldExvYWRpbmcodHJ1ZSk7XG5cdFx0bGV0IGFwcGxpZWQ6IGJvb2xlYW47XG5cdFx0dHJ5IHtcblx0XHRcdGFwcGxpZWQgPSBhd2FpdCBzZXNzaW9uLnJlc29sdmVDb25maWcoY29ubmVjdGlvbiwgISFleHBlY3RlZCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHNlc3Npb24uc2V0TG9hZGluZyhmYWxzZSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25Db25maWcuZmlyZShzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdFx0Ly8gQmFpbCBpZiBhIG5ld2VyIGNhbGwgc3VwZXJzZWRlZCB1cyBcdTIwMTQgaXRzIG93biBwdWxzZSB3aWxsIHRha2Ugb3Zlci5cblx0XHRpZiAoIWFwcGxpZWQgfHwgdGhpcy5fbmV3U2Vzc2lvbnMuZ2V0KHNlc3Npb24uc2Vzc2lvbklkKSAhPT0gc2Vzc2lvbikge1xuXHRcdFx0aWYgKGV4cGVjdGVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignU2Vzc2lvbiByZXBvc2l0b3J5IGNvbmZpZyB3YXMgc3VwZXJzZWRlZCBiZWZvcmUgaXQgY291bGQgYmUgYXBwbGllZC4nKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlnID0gc2Vzc2lvbi5nZXRDb25maWcoKTtcblx0XHR0aGlzLl9jYWNoZVNlZWRlZENvbmZpZ1NjaGVtYXMoY29uZmlnKTtcblx0XHRzZXNzaW9uLnNldExvYWRpbmcoY29uZmlnICE9PSB1bmRlZmluZWQgJiYgIWlzU2Vzc2lvbkNvbmZpZ0NvbXBsZXRlKGNvbmZpZykpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZy5maXJlKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRmb3IgKGNvbnN0IFtwcm9wZXJ0eSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGV4cGVjdGVkID8/IHt9KSkge1xuXHRcdFx0aWYgKCFlcXVhbHMoY29uZmlnPy52YWx1ZXNbcHJvcGVydHldLCB2YWx1ZSkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBZ2VudCBob3N0IGRpZCBub3QgYXBwbHkgc2Vzc2lvbiBjb25maWcgJyR7cHJvcGVydHl9Jy5gKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU25hcHNob3QgdGhlIHdlbGwta25vd24ge0BsaW5rIFNFRURFRF9DT05GSUdfU0NIRU1BX0tFWVN9IHNjaGVtYXMgZnJvbSBhblxuXHQgKiBhdXRob3JpdGF0aXZlIHJlc29sdmUgc28gdGhlIG5leHQgbmV3IGRyYWZ0IGNhbiByZW5kZXIgdGhvc2UgY2hpcHNcblx0ICogaW1tZWRpYXRlbHkgKGRpc2FibGVkKSBpbnN0ZWFkIG9mIGJsYW5raW5nLiBBIGB1bmRlZmluZWRgIGNvbmZpZyAoZmFpbGVkXG5cdCAqIHJlc29sdmUpIGxlYXZlcyB0aGUgcHJldmlvdXMgY2FjaGUgaW50YWN0LlxuXHQgKi9cblx0cHJpdmF0ZSBfY2FjaGVTZWVkZWRDb25maWdTY2hlbWFzKGNvbmZpZzogUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIWNvbmZpZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGtleSBvZiBTRUVERURfQ09ORklHX1NDSEVNQV9LRVlTKSB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBjb25maWcuc2NoZW1hLnByb3BlcnRpZXNba2V5XTtcblx0XHRcdGlmIChzY2hlbWEpIHtcblx0XHRcdFx0dGhpcy5fY2FjaGVkQ29uZmlnU2NoZW1hcy5zZXQoa2V5LCBzY2hlbWEpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fY2FjaGVkQ29uZmlnU2NoZW1hcy5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKiogU2VlZCBzY2hlbWEgZm9yIGEgZnJlc2ggZHJhZnQsIG9yIGB1bmRlZmluZWRgIHdoZW4gbm90aGluZyBpcyBjYWNoZWQgeWV0LiAqL1xuXHRwcml2YXRlIF9zZWVkZWRDb25maWdTY2hlbWEoKTogUmVjb3JkPHN0cmluZywgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hPiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX2NhY2hlZENvbmZpZ1NjaGVtYXMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2VlZDogUmVjb3JkPHN0cmluZywgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hPiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0Zm9yIChjb25zdCBba2V5LCBzY2hlbWFdIG9mIHRoaXMuX2NhY2hlZENvbmZpZ1NjaGVtYXMpIHtcblx0XHRcdHNlZWRba2V5XSA9IHNjaGVtYTtcblx0XHR9XG5cdFx0cmV0dXJuIHNlZWQ7XG5cdH1cblxuXHQvKiogU3ViY2xhc3MgaG9vayBmb3IgYWRkaXRpb25hbCBwcmUtY3JlYXRlIGNoZWNrcyAoZS5nLiByZW1vdGUgcmVxdWlyZXMgY29ubmVjdGlvbikuICovXG5cdHByb3RlY3RlZCBfdmFsaWRhdGVCZWZvcmVDcmVhdGUoX3Nlc3Npb25UeXBlOiBJU2Vzc2lvblR5cGUpOiB2b2lkIHsgLyogZGVmYXVsdDogbm8tb3AgKi8gfVxuXG5cdC8qKiBMb2NhbGl6ZWQgXCJubyBhZ2VudHNcIiBlcnJvciBtZXNzYWdlLiBTdWJjbGFzc2VzIGNhbiBvdmVycmlkZS4gKi9cblx0cHJvdGVjdGVkIF9ub0FnZW50c0Vycm9yTWVzc2FnZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnbm9BZ2VudHMnLCBcIkFnZW50IGhvc3QgaGFzIG5vdCBhZHZlcnRpc2VkIGFueSBhZ2VudHMgeWV0LlwiKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbml0aWFsIHNlc3Npb24tY29uZmlnIHZhbHVlcyBhcHBsaWVkIHRvIGEgYnJhbmQtbmV3IGFnZW50LWhvc3Qgc2Vzc2lvblxuXHQgKiBiZWZvcmUgaXRzIHNjaGVtYSBpcyByZXNvbHZlZC4gVmFsdWVzIGFyZSBzZWVkZWQgZnJvbSBwb3J0YWJsZSBwaWNrcyBpblxuXHQgKiB0aGUgcHJvZmlsZS1zY29wZWQgcmVtZW1iZXJlZCBzZXNzaW9uLWNvbmZpZyBtYXAgYW5kIHRoZW4gbm9ybWFsaXplZFxuXHQgKiBhZ2FpbnN0IHBvbGljeS9mZWF0dXJlIGNvbnN0cmFpbnRzLlxuXHQgKlxuXHQgKiBUaGUgYWdlbnQtaG9zdCBkZWZhdWx0cyBhcmUgY29udHJvbGxlZCBieSB0aGUgc2luZ2xlXG5cdCAqIGBjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uYCBvYmplY3Qgc2V0dGluZyAod2l0aCBgbW9kZWAgYW5kXG5cdCAqIGBhcHByb3ZhbHNgIHByb3BlcnRpZXMpLiBQZXIgYXhpcyB0aGUgcHJlY2VkZW5jZSBpczogZW50ZXJwcmlzZVxuXHQgKiAqKnBvbGljeSoqIHZhbHVlID4gdGhlIHVzZXIncyAqKnJlbWVtYmVyZWQqKiBsYXN0IHBpY2sgPiB0aGUgb3JkaW5hcnlcblx0ICogY29uZmlndXJlZCAqKnNldHRpbmcqKiB2YWx1ZSAodHJlYXRlZCBhcyBhIHBsYWluIGRlZmF1bHQpID4gc2NoZW1hXG5cdCAqIGRlZmF1bHQuIFNvIGEgbm9ybWFsIHNldHRpbmcgYmVoYXZlcyBhcyBhIGRlZmF1bHQgdGhhdCB0aGUgcmVtZW1iZXJlZFxuXHQgKiBwaWNrIG92ZXJyaWRlcywgd2hpbGUgYW4gZW50ZXJwcmlzZSBwb2xpY3kgc3RpbGwgd2lucyBvdXRyaWdodC4gVGhlXG5cdCAqIGxvY2FsLW9ubHkgYGNoYXQucGVybWlzc2lvbnMuZGVmYXVsdGAgc2V0dGluZyBpcyBpbnRlbnRpb25hbGx5IE5PVFxuXHQgKiBjb25zdWx0ZWQgaGVyZS5cblx0ICpcblx0ICogSWYgZW50ZXJwcmlzZSBwb2xpY3kgZGlzYWJsZXMgZ2xvYmFsIGF1dG8tYXBwcm92YWxcblx0ICogKGBjaGF0LnRvb2xzLmdsb2JhbC5hdXRvQXBwcm92ZWAgcG9saWN5IHZhbHVlIGBmYWxzZWApLCB0aGUgYXBwcm92YWwgc2VlZFxuXHQgKiBpcyBjbGFtcGVkIHRvIGBkZWZhdWx0YCBzbyB0aGUgYWdlbnQgaG9zdCBuZXZlciBzdGFydHMgaW4gYW4gZWxldmF0ZWRcblx0ICogcGVybWlzc2lvbiBsZXZlbCB0aGUgdXNlciBpcyBub3QgYWxsb3dlZCB0byBwaWNrLlxuXHQgKlxuXHQgKiBUaGUgdXNlcidzIGBnaXQuYnJhbmNoUHJlZml4YCBzZXR0aW5nIChyZXNvdXJjZS1zY29wZWQgdG8gdGhlIHdvcmtzcGFjZSdzXG5cdCAqIGZpcnN0IGZvbGRlcikgaXMgc2VlZGVkIGludG8gdGhlIGB3b3JrdHJlZUJyYW5jaFByZWZpeGAgc2xvdCBzbyB0aGUgYWdlbnRcblx0ICogaG9zdCBjYW4gcHJlcGVuZCBpdCB0byB0aGUgYnJhbmNoIGl0IGNyZWF0ZXMgZm9yIGFuIGlzb2xhdGVkIHdvcmt0cmVlLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9pbml0aWFsTmV3U2Vzc2lvbkNvbmZpZyh3b3Jrc3BhY2U/OiBJU2Vzc2lvbldvcmtzcGFjZSk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb25maWcgPSBPYmplY3QuY3JlYXRlKG51bGwpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGNvbnN0IHBvbGljeVJlc3RyaWN0ZWQgPSBpc0F1dG9BcHByb3ZlUG9saWN5UmVzdHJpY3RlZCh0aGlzLl9iYXNlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Ly8gU2VlZCBzZXNzaW9uIGNvbmZpZyB2YWx1ZXMgZnJvbSB0aGUgbGFzdCB1c2VyIHBpY2tzLCBtaWdyYXRpbmcgYW55XG5cdFx0Ly8gbGVnYWN5IGBhdXRvQXBwcm92ZT0nYXV0b3BpbG90J2AgcmVtZW1iZXJlZCB2YWx1ZSBpbnRvIHRoZSBuZXdcblx0XHQvLyBgbW9kZT0nYXV0b3BpbG90J2Agc2hhcGUgYmVmb3JlIHRoZSBwZXItYXhpcyBwcmVjZWRlbmNlIGJlbG93IHJ1bnMuXG5cdFx0Y29uc3QgcmVtZW1iZXJlZFZhbHVlcyA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdDxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4oU1RPUkFHRV9LRVlfUkVNRU1CRVJFRF9TRVNTSU9OX0NPTkZJR19WQUxVRVMsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCB7fSk7XG5cdFx0Zm9yIChjb25zdCBbcHJvcGVydHksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhyZW1lbWJlcmVkVmFsdWVzKSkge1xuXHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgaXNSZW1lbWJlcmVkU2Vzc2lvbkNvbmZpZ0tleShwcm9wZXJ0eSkpIHtcblx0XHRcdFx0Y29uZmlnW3Byb3BlcnR5XSA9IHZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCByZW1lbWJlcmVkID0gbWlncmF0ZUxlZ2FjeUF1dG9waWxvdENvbmZpZyhjb25maWcpO1xuXG5cdFx0Ly8gYGNoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb25gIGNvbnRyb2xzIGJvdGggYXhlcy4gUGVyIGF4aXMgdGhlXG5cdFx0Ly8gcHJlY2VkZW5jZSBpczogZW50ZXJwcmlzZSBwb2xpY3kgPiByZW1lbWJlcmVkIHBpY2sgPiBlZmZlY3RpdmVcblx0XHQvLyBjb25maWd1cmVkIHZhbHVlIChgaW5zcGVjdCgpLnZhbHVlYCwgd2hpY2ggaXMgdGhlIHVzZXIncyBzZXR0aW5nIG9yXG5cdFx0Ly8gdGhlIHNjaGVtYSBkZWZhdWx0KS4gYGluc3BlY3QoKS52YWx1ZWAgaXMgdXNlZCBpbnN0ZWFkIG9mXG5cdFx0Ly8gYGdldFZhbHVlKClgIG9ubHkgc28gdGhlIHBvbGljeSBsYXllciBjYW4gYmUgbGlmdGVkIGFib3ZlIHRoZVxuXHRcdC8vIHJlbWVtYmVyZWQgcGljay5cblx0XHRjb25zdCBpbnNwZWN0ZWQgPSB0aGlzLl9iYXNlQ29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxJQ2hhdERlZmF1bHRDb25maWd1cmF0aW9uPihDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0Q29uZmlndXJhdGlvbik7XG5cdFx0Y29uc3QgcG9saWN5RGVmYXVsdHMgPSBpbnNwZWN0ZWQucG9saWN5VmFsdWU7XG5cdFx0Y29uc3QgZWZmZWN0aXZlRGVmYXVsdHMgPSBpbnNwZWN0ZWQudmFsdWU7XG5cblx0XHQvLyBBcHByb3ZhbCBheGlzOiBwb2xpY3kgPiByZW1lbWJlcmVkID4gZWZmZWN0aXZlLlxuXHRcdGNvbnN0IHJlc29sdmVkQXV0b0FwcHJvdmUgPVxuXHRcdFx0bm9ybWFsaXplQXV0b0FwcHJvdmVWYWx1ZShwb2xpY3lEZWZhdWx0cz8uYXBwcm92YWxzLCBwb2xpY3lSZXN0cmljdGVkKVxuXHRcdFx0Pz8gbm9ybWFsaXplQXV0b0FwcHJvdmVWYWx1ZShyZW1lbWJlcmVkW1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdLCBwb2xpY3lSZXN0cmljdGVkKVxuXHRcdFx0Pz8gbm9ybWFsaXplQXV0b0FwcHJvdmVWYWx1ZShlZmZlY3RpdmVEZWZhdWx0cz8uYXBwcm92YWxzLCBwb2xpY3lSZXN0cmljdGVkKTtcblx0XHRpZiAocmVzb2x2ZWRBdXRvQXBwcm92ZSkge1xuXHRcdFx0cmVtZW1iZXJlZFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXSA9IHJlc29sdmVkQXV0b0FwcHJvdmU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRlbGV0ZSByZW1lbWJlcmVkW1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdO1xuXHRcdH1cblxuXHRcdC8vIE1vZGUgYXhpczogcG9saWN5ID4gcmVtZW1iZXJlZCA+IGVmZmVjdGl2ZS5cblx0XHRjb25zdCByZXNvbHZlZE1vZGUgPSBbcG9saWN5RGVmYXVsdHM/Lm1vZGUsIHJlbWVtYmVyZWRbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXSwgZWZmZWN0aXZlRGVmYXVsdHM/Lm1vZGVdXG5cdFx0XHQuZmluZCgodmFsdWUpOiB2YWx1ZSBpcyBzdHJpbmcgPT4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiBLTk9XTl9NT0RFX1ZBTFVFUy5oYXModmFsdWUpKTtcblx0XHRpZiAocmVzb2x2ZWRNb2RlKSB7XG5cdFx0XHRyZW1lbWJlcmVkW1Nlc3Npb25Db25maWdLZXkuTW9kZV0gPSByZXNvbHZlZE1vZGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRlbGV0ZSByZW1lbWJlcmVkW1Nlc3Npb25Db25maWdLZXkuTW9kZV07XG5cdFx0fVxuXG5cdFx0Ly8gV29ya3RyZWUgYnJhbmNoIHByZWZpeCwgZm9yd2FyZGVkIGZyb20gYGdpdC5icmFuY2hQcmVmaXhgLiBTZWVkZWRcblx0XHQvLyBoZXJlIChyYXRoZXIgdGhhbiByZW1lbWJlcmVkKSBzaW5jZSBpdCBpcyBkZXJpdmVkIGZyb20gYSBzZXR0aW5nLCBub3Rcblx0XHQvLyBhIHVzZXIgcGljazsgYW4gZW1wdHkgdmFsdWUgaXMgb21pdHRlZCBzbyB0aGUgZGVmYXVsdCBicmFuY2ggbmFtaW5nXG5cdFx0Ly8gaXMgcHJlc2VydmVkLlxuXHRcdGNvbnN0IHJlc291cmNlID0gd29ya3NwYWNlPy5mb2xkZXJzWzBdPy5yb290O1xuXHRcdGNvbnN0IGJyYW5jaFByZWZpeCA9IHRoaXMuX2Jhc2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdnaXQuYnJhbmNoUHJlZml4JywgeyByZXNvdXJjZSB9KTtcblx0XHRpZiAodHlwZW9mIGJyYW5jaFByZWZpeCA9PT0gJ3N0cmluZycgJiYgYnJhbmNoUHJlZml4Lmxlbmd0aCA+IDApIHtcblx0XHRcdHJlbWVtYmVyZWRbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFByZWZpeF0gPSBicmFuY2hQcmVmaXg7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya3RyZWVJbmNsdWRlRmlsZXMgPSB0aGlzLl9iYXNlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nW10+KCdnaXQud29ya3RyZWVJbmNsdWRlRmlsZXMnLCB7IHJlc291cmNlIH0pO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KHdvcmt0cmVlSW5jbHVkZUZpbGVzKSAmJiB3b3JrdHJlZUluY2x1ZGVGaWxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZW1lbWJlcmVkW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVJbmNsdWRlRmlsZXNdID0gd29ya3RyZWVJbmNsdWRlRmlsZXM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIE9iamVjdC5rZXlzKHJlbWVtYmVyZWQpLmxlbmd0aCA+IDAgPyByZW1lbWJlcmVkIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Ly8gLS0gRHluYW1pYyBzZXNzaW9uIGNvbmZpZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0Z2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uSWQ6IHN0cmluZyk6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0IHwgdW5kZWZpbmVkIHtcblx0XHQvLyBOZXctc2Vzc2lvbiBjb25maWcgd2lucyAoZHVyaW5nIHByZS1jcmVhdGlvbiBmbG93KS4gT3RoZXJ3aXNlIGxhemlseVxuXHRcdC8vIHN1YnNjcmliZSB0byB0aGUgc2Vzc2lvbidzIHN0YXRlIHNvIHRoZSBydW5uaW5nIHBpY2tlciBjYW4gc2VlZCBpdHNcblx0XHQvLyBzY2hlbWEvdmFsdWVzIGZyb20gdGhlIEFIUCBgU2Vzc2lvblN0YXRlLmNvbmZpZ2Agc25hcHNob3QgZm9yIHNlc3Npb25zXG5cdFx0Ly8gdGhhdCB3ZXJlbid0IGNyZWF0ZWQgaW4gdGhpcyB3aW5kb3cuIEVhY2ggcXVlcnkgYnVtcHMgdGhlIGlkbGUgdGltZXJcblx0XHQvLyBzbyB0aGUgc3Vic2NyaXB0aW9uIHN0YXlzIGFsaXZlIHdoaWxlIHRoZSBwaWNrZXIgKG9yIGFueSBvdGhlciBVSVxuXHRcdC8vIHN1cmZhY2UpIGlzIHJlcGVhdGVkbHkgcmVhZGluZyB0aGUgcnVubmluZyBjb25maWcuXG5cdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IHRoaXMuX2dldE5ld1Nlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRpZiAobmV3U2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIG5ld1Nlc3Npb24uZ2V0Q29uZmlnKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2tlZXBTZXNzaW9uU3RhdGVBbGl2ZShzZXNzaW9uSWQpO1xuXHRcdHJldHVybiB0aGlzLl9ydW5uaW5nU2Vzc2lvbkNvbmZpZ3MuZ2V0KHNlc3Npb25JZCk7XG5cdH1cblxuXHQvKipcblx0ICogT2JzZXJ2YWJsZTogYHRydWVgIHdoaWxlIGEgYHJlc29sdmVTZXNzaW9uQ29uZmlnYCByb3VuZC10cmlwIGlzIGluXG5cdCAqIGZsaWdodC4gRGlzdGluY3QgZnJvbSBgc2Vzc2lvbi5sb2FkaW5nYCAod2hpY2ggYWxzbyBjb3ZlcnMgdGhlXG5cdCAqIHJlcXVpcmVkLXZhbHVlcy1taXNzaW5nIHN0YXRlKSBcdTIwMTQgcGlja2VycyBnYXRlIG9uIHRoaXMgc28gdGhleSBzdGF5XG5cdCAqIGludGVyYWN0aXZlIHdoZW4gdGhlIHVzZXIgaGFzIHRvIGZpbGwgaW4gcmVxdWlyZWQgdmFsdWVzLlxuXHQgKi9cblx0aXNTZXNzaW9uQ29uZmlnUmVzb2x2aW5nKHNlc3Npb25JZDogc3RyaW5nKTogSU9ic2VydmFibGU8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9nZXROZXdTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIG5ld1Nlc3Npb25cblx0XHRcdD8gbmV3U2Vzc2lvbi5pc1Jlc29sdmluZ0NvbmZpZ1xuXHRcdFx0OiBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xuXHR9XG5cblx0YXN5bmMgc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlKHNlc3Npb25JZDogc3RyaW5nLCBwcm9wZXJ0eTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBvbGljeVJlc3RyaWN0ZWQgPSBpc0F1dG9BcHByb3ZlUG9saWN5UmVzdHJpY3RlZCh0aGlzLl9iYXNlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRWYWx1ZSA9IG5vcm1hbGl6ZVNlc3Npb25Db25maWdWYWx1ZShwcm9wZXJ0eSwgdmFsdWUsIHBvbGljeVJlc3RyaWN0ZWQpO1xuXG5cdFx0Ly8gUmVtZW1iZXIgcG9ydGFibGUgY29uZmlnIHBpY2tzIGFjcm9zcyBzZXNzaW9ucy5cblx0XHRpZiAodHlwZW9mIG5vcm1hbGl6ZWRWYWx1ZSA9PT0gJ3N0cmluZycgJiYgaXNSZW1lbWJlcmVkU2Vzc2lvbkNvbmZpZ0tleShwcm9wZXJ0eSkpIHtcblx0XHRcdGNvbnN0IHJlbWVtYmVyZWRWYWx1ZXMgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRPYmplY3Q8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+KFNUT1JBR0VfS0VZX1JFTUVNQkVSRURfU0VTU0lPTl9DT05GSUdfVkFMVUVTLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwge30pO1xuXHRcdFx0Y29uc3QgbmV4dFJlbWVtYmVyZWRWYWx1ZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHJlbWVtYmVyZWRWYWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMocmVtZW1iZXJlZFZhbHVlcykpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiByZW1lbWJlcmVkVmFsdWUgPT09ICdzdHJpbmcnICYmIGlzUmVtZW1iZXJlZFNlc3Npb25Db25maWdLZXkoa2V5KSkge1xuXHRcdFx0XHRcdG5leHRSZW1lbWJlcmVkVmFsdWVzW2tleV0gPSByZW1lbWJlcmVkVmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdG5leHRSZW1lbWJlcmVkVmFsdWVzW3Byb3BlcnR5XSA9IG5vcm1hbGl6ZWRWYWx1ZTtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKFNUT1JBR0VfS0VZX1JFTUVNQkVSRURfU0VTU0lPTl9DT05GSUdfVkFMVUVTLCBKU09OLnN0cmluZ2lmeShuZXh0UmVtZW1iZXJlZFZhbHVlcyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblxuXHRcdC8vIE5ldyBzZXNzaW9uOiByZS1yZXNvbHZlIHRoZSBmdWxsIGNvbmZpZyBzY2hlbWEuIEZsaXAgdGhlXG5cdFx0Ly8gcmVzb2x2aW5nIGZsYWcgYW5kIGBsb2FkaW5nYCAqYmVmb3JlKiBmaXJpbmcgdGhlIGNoYW5nZSBldmVudFxuXHRcdC8vIHNvIHRoZSBmaXJzdCBwaWNrZXIgcmUtcmVuZGVyIGFscmVhZHkgb2JzZXJ2ZXMgdGhlIGluLWZsaWdodFxuXHRcdC8vIHN0YXRlLlxuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9nZXROZXdTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKG5ld1Nlc3Npb24pIHtcblx0XHRcdC8vIERlZmVuc2UtaW4tZGVwdGg6IHBpY2tlcnMgcmVuZGVyIGRpc2FibGVkIGR1cmluZyBhIHJlc29sdmUsXG5cdFx0XHQvLyBidXQga2V5Ym9hcmQgZHJvcGRvd24gYW5kIG1vYmlsZSBzaGVldCBwYXRocyBieXBhc3MgdGhhdC5cblx0XHRcdC8vIERyb3AgdGhlIHNlY29uZCBwaWNrIHNvIGl0IGNhbid0IHJhY2UgdGhlIHNjaGVtYSByZXBsYWNlbWVudC5cblx0XHRcdGlmIChuZXdTZXNzaW9uLmlzUmVzb2x2aW5nQ29uZmlnLmdldCgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdG5ld1Nlc3Npb24uYmVnaW5SZXNvbHZlQ29uZmlnU3luYygpO1xuXHRcdFx0bmV3U2Vzc2lvbi5zZXRMb2FkaW5nKHRydWUpO1xuXHRcdFx0bmV3U2Vzc2lvbi5zZXRDb25maWdWYWx1ZShwcm9wZXJ0eSwgbm9ybWFsaXplZFZhbHVlKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZy5maXJlKHNlc3Npb25JZCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZWZyZXNoTmV3U2Vzc2lvbkNvbmZpZyhuZXdTZXNzaW9uKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSdW5uaW5nIHNlc3Npb246IGRpc3BhdGNoIFNlc3Npb25Db25maWdDaGFuZ2VkIGZvciBzZXNzaW9uTXV0YWJsZSBwcm9wZXJ0aWVzXG5cdFx0Y29uc3QgcnVubmluZ0NvbmZpZyA9IHRoaXMuX3J1bm5pbmdTZXNzaW9uQ29uZmlncy5nZXQoc2Vzc2lvbklkKTtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdGlmICghcnVubmluZ0NvbmZpZyB8fCAhY29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzY2hlbWEgPSBydW5uaW5nQ29uZmlnLnNjaGVtYS5wcm9wZXJ0aWVzW3Byb3BlcnR5XTtcblx0XHRpZiAoIXNjaGVtYT8uc2Vzc2lvbk11dGFibGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgbG9jYWwgY2FjaGUgb3B0aW1pc3RpY2FsbHlcblx0XHRjb25zdCBuZXh0VmFsdWVzID0geyAuLi5ydW5uaW5nQ29uZmlnLnZhbHVlcywgW3Byb3BlcnR5XTogbm9ybWFsaXplZFZhbHVlIH07XG5cdFx0dGhpcy5fcnVubmluZ1Nlc3Npb25Db25maWdzLnNldChzZXNzaW9uSWQsIHtcblx0XHRcdC4uLnJ1bm5pbmdDb25maWcsXG5cdFx0XHR2YWx1ZXM6IG5leHRWYWx1ZXMsXG5cdFx0fSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnLmZpcmUoc2Vzc2lvbklkKTtcblxuXHRcdC8vIERpc3BhdGNoIHRvIHRoZSBhZ2VudCBob3N0XG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoc2Vzc2lvbklkKTtcblx0XHRjb25zdCBjYWNoZWQgPSByYXdJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChjYWNoZWQgJiYgcmF3SWQpIHtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBjYWNoZWQuYmFja2VuZFVyaTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCBhcyBjb25zdCwgY29uZmlnOiB7IFtwcm9wZXJ0eV06IG5vcm1hbGl6ZWRWYWx1ZSB9IH07XG5cdFx0XHRjb25uZWN0aW9uLmRpc3BhdGNoKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblx0XHRcdHZvaWQgdGhpcy5fcmVzb2x2ZVJ1bm5pbmdTZXNzaW9uQ29uZmlnKHNlc3Npb25JZCwgY2FjaGVkLCBuZXh0VmFsdWVzKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZXBsYWNlU2Vzc2lvbkNvbmZpZyhzZXNzaW9uSWQ6IHN0cmluZywgdmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJ1bm5pbmdDb25maWcgPSB0aGlzLl9ydW5uaW5nU2Vzc2lvbkNvbmZpZ3MuZ2V0KHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRpZiAoIXJ1bm5pbmdDb25maWcgfHwgIWNvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBCdWlsZCB0aGUgb3V0Z29pbmcgcGF5bG9hZDogZm9yIGV2ZXJ5IGtub3duIHByb3BlcnR5LCBwcmVmZXIgdGhlXG5cdFx0Ly8gY2FsbGVyLXN1cHBsaWVkIHZhbHVlIGlmIHRoZSBwcm9wZXJ0eSBpcyB1c2VyLWVkaXRhYmxlXG5cdFx0Ly8gKGBzZXNzaW9uTXV0YWJsZTogdHJ1ZWAgYW5kIG5vdCBgcmVhZE9ubHlgKSwgb3RoZXJ3aXNlIGZvcmNlIHRoZVxuXHRcdC8vIGN1cnJlbnQgdmFsdWUgdGhyb3VnaC4gVGhpcyBndWFyYW50ZWVzIHJlcGxhY2Ugc2VtYW50aWNzIG5ldmVyXG5cdFx0Ly8gYWx0ZXIgYSBub24tZWRpdGFibGUgcHJvcGVydHkgZXZlbiBpZiB0aGUgY2FsbGVyIGluY2x1ZGVkIGl0LlxuXHRcdGNvbnN0IHBvbGljeVJlc3RyaWN0ZWQgPSBpc0F1dG9BcHByb3ZlUG9saWN5UmVzdHJpY3RlZCh0aGlzLl9iYXNlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IG5leHRWYWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdFx0Zm9yIChjb25zdCBba2V5LCBzY2hlbWFdIG9mIE9iamVjdC5lbnRyaWVzKHJ1bm5pbmdDb25maWcuc2NoZW1hLnByb3BlcnRpZXMpKSB7XG5cdFx0XHRjb25zdCBlZGl0YWJsZSA9IHNjaGVtYS5zZXNzaW9uTXV0YWJsZSA9PT0gdHJ1ZSAmJiBzY2hlbWEucmVhZE9ubHkgIT09IHRydWU7XG5cdFx0XHRpZiAoZWRpdGFibGUpIHtcblx0XHRcdFx0bmV4dFZhbHVlc1trZXldID0gbm9ybWFsaXplU2Vzc2lvbkNvbmZpZ1ZhbHVlKGtleSwgdmFsdWVzW2tleV0sIHBvbGljeVJlc3RyaWN0ZWQpO1xuXHRcdFx0fSBlbHNlIGlmIChPYmplY3QuaGFzT3duKHJ1bm5pbmdDb25maWcudmFsdWVzLCBrZXkpKSB7XG5cdFx0XHRcdG5leHRWYWx1ZXNba2V5XSA9IHJ1bm5pbmdDb25maWcudmFsdWVzW2tleV07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFVua25vd24ga2V5cyBmcm9tIHRoZSBjYWxsZXIgYXJlIGlnbm9yZWQgKG5vIHNjaGVtYSBlbnRyeSkuXG5cblx0XHQvLyBTa2lwIHRoZSBkaXNwYXRjaCBlbnRpcmVseSB3aGVuIG5vdGhpbmcgbWVhbmluZ2Z1bCBjaGFuZ2VzLlxuXHRcdGlmIChlcXVhbHMobmV4dFZhbHVlcywgcnVubmluZ0NvbmZpZy52YWx1ZXMpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGxvY2FsIGNhY2hlIG9wdGltaXN0aWNhbGx5IChmdWxsIHJlcGxhY2UpLlxuXHRcdHRoaXMuX3J1bm5pbmdTZXNzaW9uQ29uZmlncy5zZXQoc2Vzc2lvbklkLCB7XG5cdFx0XHQuLi5ydW5uaW5nQ29uZmlnLFxuXHRcdFx0dmFsdWVzOiBuZXh0VmFsdWVzLFxuXHRcdH0pO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZy5maXJlKHNlc3Npb25JZCk7XG5cblx0XHQvLyBEaXNwYXRjaCB0byB0aGUgYWdlbnQgaG9zdCB3aXRoIHJlcGxhY2Ugc2VtYW50aWNzLlxuXHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gcmF3SWQgPyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoY2FjaGVkICYmIHJhd0lkKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gY2FjaGVkLmJhY2tlbmRVcmk7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQgYXMgY29uc3QsXG5cdFx0XHRcdGNvbmZpZzogbmV4dFZhbHVlcyxcblx0XHRcdFx0cmVwbGFjZTogdHJ1ZSxcblx0XHRcdH07XG5cdFx0XHRjb25uZWN0aW9uLmRpc3BhdGNoKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblx0XHRcdHZvaWQgdGhpcy5fcmVzb2x2ZVJ1bm5pbmdTZXNzaW9uQ29uZmlnKHNlc3Npb25JZCwgY2FjaGVkLCBuZXh0VmFsdWVzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlUnVubmluZ1Nlc3Npb25Db25maWcoc2Vzc2lvbklkOiBzdHJpbmcsIGNhY2hlZDogQWdlbnRIb3N0U2Vzc2lvbkFkYXB0ZXIsIHZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXEgPSAodGhpcy5fcnVubmluZ1Nlc3Npb25Db25maWdSZXNvbHZlU2VxLmdldChzZXNzaW9uSWQpID8/IDApICsgMTtcblx0XHR0aGlzLl9ydW5uaW5nU2Vzc2lvbkNvbmZpZ1Jlc29sdmVTZXEuc2V0KHNlc3Npb25JZCwgc2VxKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCBjb25uZWN0aW9uLnJlc29sdmVTZXNzaW9uQ29uZmlnKHtcblx0XHRcdFx0cHJvdmlkZXI6IGNhY2hlZC5hZ2VudFByb3ZpZGVyLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBjYWNoZWQud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdPy5yb290LFxuXHRcdFx0XHRjb25maWc6IHZhbHVlcyxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKHRoaXMuX3J1bm5pbmdTZXNzaW9uQ29uZmlnUmVzb2x2ZVNlcS5nZXQoc2Vzc2lvbklkKSAhPT0gc2VxKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3J1bm5pbmdTZXNzaW9uQ29uZmlncy5zZXQoc2Vzc2lvbklkLCByZXNvbHZlZCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25Db25maWcuZmlyZShzZXNzaW9uSWQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbJHt0aGlzLmlkfV0gRmFpbGVkIHRvIHJlLXJlc29sdmUgc2Vzc2lvbiBjb25maWcgZm9yICR7c2Vzc2lvbklkfTogJHtlcnJ9YCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zKHNlc3Npb25JZDogc3RyaW5nLCBwcm9wZXJ0eTogc3RyaW5nLCBxdWVyeT86IHN0cmluZykge1xuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9nZXROZXdTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRpZiAoIW5ld1Nlc3Npb24gfHwgIWNvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbmV3U2Vzc2lvbi5nZXRDb25maWdDb21wbGV0aW9ucyhjb25uZWN0aW9uLCBwcm9wZXJ0eSwgcXVlcnkpO1xuXHRcdHJldHVybiByZXN1bHQuaXRlbXM7XG5cdH1cblxuXHRnZXRDcmVhdGVTZXNzaW9uQ29uZmlnKHNlc3Npb25JZDogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9nZXROZXdTZXNzaW9uKHNlc3Npb25JZCk/LmdldENvbmZpZ1ZhbHVlcygpO1xuXHR9XG5cblx0YXN5bmMgc2V0SXNvbGF0aW9uTW9kZShzZXNzaW9uSWQ6IHN0cmluZywgbW9kZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcG9saWN5UmVzdHJpY3RlZCA9IGlzQXV0b0FwcHJvdmVQb2xpY3lSZXN0cmljdGVkKHRoaXMuX2Jhc2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgdmFsdWUgPSBub3JtYWxpemVTZXNzaW9uQ29uZmlnVmFsdWUoXG5cdFx0XHRTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbixcblx0XHRcdG1vZGUgPT09ICd3b3Jrc3BhY2UnID8gJ2ZvbGRlcicgOiBtb2RlLFxuXHRcdFx0cG9saWN5UmVzdHJpY3RlZCxcblx0XHQpO1xuXHRcdGF3YWl0IHRoaXMuX3NldFRyYW5zaWVudE5ld1Nlc3Npb25Db25maWdWYWx1ZShzZXNzaW9uSWQsIFNlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uLCB2YWx1ZSk7XG5cdH1cblxuXHRhc3luYyBzZXRXb3JrdHJlZUJyYW5jaFRyYWNrKHNlc3Npb25JZDogc3RyaW5nLCBlbmFibGVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fc2V0VHJhbnNpZW50TmV3U2Vzc2lvbkNvbmZpZ1ZhbHVlKHNlc3Npb25JZCwgU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFRyYWNrLCBlbmFibGVkKTtcblx0fVxuXG5cdGFzeW5jIHNldEJyYW5jaChzZXNzaW9uSWQ6IHN0cmluZywgYnJhbmNoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwb2xpY3lSZXN0cmljdGVkID0gaXNBdXRvQXBwcm92ZVBvbGljeVJlc3RyaWN0ZWQodGhpcy5fYmFzZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB2YWx1ZSA9IG5vcm1hbGl6ZVNlc3Npb25Db25maWdWYWx1ZShTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaCwgYnJhbmNoLCBwb2xpY3lSZXN0cmljdGVkKTtcblx0XHRhd2FpdCB0aGlzLl9zZXRUcmFuc2llbnROZXdTZXNzaW9uQ29uZmlnVmFsdWUoc2Vzc2lvbklkLCBTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaCwgdmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2V0VHJhbnNpZW50TmV3U2Vzc2lvbkNvbmZpZ1ZhbHVlKHNlc3Npb25JZDogc3RyaW5nLCBwcm9wZXJ0eTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9nZXROZXdTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0aWYgKCFuZXdTZXNzaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBjb25maWd1cmUgcmVwb3NpdG9yeSBzZXR0aW5ncyBhZnRlciBzZXNzaW9uIGNyZWF0aW9uLicpO1xuXHRcdH1cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUodGhpcy5hdXRoZW50aWNhdGlvblBlbmRpbmcsIHBlbmRpbmcgPT4gIXBlbmRpbmcsIHVuZGVmaW5lZCwgbmV3U2Vzc2lvbi5jYW5jZWxsYXRpb25Ub2tlbik7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKG5ld1Nlc3Npb24uaXNSZXNvbHZpbmdDb25maWcsIHJlc29sdmluZyA9PiAhcmVzb2x2aW5nLCB1bmRlZmluZWQsIG5ld1Nlc3Npb24uY2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRcdGlmICh0aGlzLl9nZXROZXdTZXNzaW9uKHNlc3Npb25JZCkgIT09IG5ld1Nlc3Npb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignU2Vzc2lvbiB3YXMgZGlzcG9zZWQgYmVmb3JlIHJlcG9zaXRvcnkgY29uZmlndXJhdGlvbiBjb3VsZCBiZSBhcHBsaWVkLicpO1xuXHRcdH1cblxuXHRcdG5ld1Nlc3Npb24uYmVnaW5SZXNvbHZlQ29uZmlnU3luYygpO1xuXHRcdG5ld1Nlc3Npb24uc2V0TG9hZGluZyh0cnVlKTtcblx0XHRuZXdTZXNzaW9uLnNldENvbmZpZ1ZhbHVlKHByb3BlcnR5LCB2YWx1ZSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnLmZpcmUoc2Vzc2lvbklkKTtcblx0XHRhd2FpdCB0aGlzLl9yZWZyZXNoTmV3U2Vzc2lvbkNvbmZpZyhuZXdTZXNzaW9uLCB7IFtwcm9wZXJ0eV06IHZhbHVlIH0pO1xuXHR9XG5cblx0Y2xlYXJTZXNzaW9uQ29uZmlnKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX25ld1Nlc3Npb25zLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHR0aGlzLl9uZXdTZXNzaW9ucy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25JZCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0gUm9vdCAoYWdlbnQgaG9zdCkgQ29uZmlnIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0Z2V0Um9vdENvbmZpZygpOiBSb290Q29uZmlnU3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yb290Q29uZmlnO1xuXHR9XG5cblx0Z2V0Um9vdFN0YXRlKCk6IFJvb3RTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLmNvbm5lY3Rpb24/LnJvb3RTdGF0ZS52YWx1ZTtcblx0XHRyZXR1cm4gdmFsdWUgaW5zdGFuY2VvZiBFcnJvciA/IHVuZGVmaW5lZCA6IHZhbHVlO1xuXHR9XG5cblx0bWFwQWdlbnRIb3N0UmVzb3VyY2UodXJpOiBVUkkpOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLm1hcFdvcmtpbmdEaXJlY3RvcnlVcmkodXJpKTtcblx0fVxuXG5cdGFzeW5jIGF1dGhlbnRpY2F0ZShwYXJhbXM6IEF1dGhlbnRpY2F0ZVBhcmFtcyk6IFByb21pc2U8QXV0aGVudGljYXRlUmVzdWx0PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybiB7IGF1dGhlbnRpY2F0ZWQ6IGZhbHNlIH07XG5cdFx0fVxuXHRcdHJldHVybiBjb25uZWN0aW9uLmF1dGhlbnRpY2F0ZShwYXJhbXMpO1xuXHR9XG5cblx0YXN5bmMgc2V0Um9vdENvbmZpZ1ZhbHVlKHByb3BlcnR5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX3Jvb3RDb25maWc7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRpZiAoIWN1cnJlbnQgfHwgIWNvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFjdXJyZW50LnNjaGVtYS5wcm9wZXJ0aWVzW3Byb3BlcnR5XSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE9wdGltaXN0aWNhbGx5IHVwZGF0ZSBsb2NhbCBjYWNoZS5cblx0XHR0aGlzLl9yb290Q29uZmlnID0ge1xuXHRcdFx0Li4uY3VycmVudCxcblx0XHRcdHZhbHVlczogeyAuLi5jdXJyZW50LnZhbHVlcywgW3Byb3BlcnR5XTogdmFsdWUgfSxcblx0XHR9O1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUm9vdENvbmZpZy5maXJlKCk7XG5cblx0XHRjb25zdCBhY3Rpb24gPSB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkIGFzIGNvbnN0LFxuXHRcdFx0Y29uZmlnOiB7IFtwcm9wZXJ0eV06IHZhbHVlIH0sXG5cdFx0fTtcblx0XHRjb25uZWN0aW9uLmRpc3BhdGNoKFJPT1RfU1RBVEVfVVJJLCBhY3Rpb24pO1xuXHR9XG5cblx0YXN5bmMgcmVwbGFjZVJvb3RDb25maWcodmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9yb290Q29uZmlnO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0aWYgKCFjdXJyZW50IHx8ICFjb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRmlsdGVyIHRvIGtub3duIHByb3BlcnRpZXMgc28gd2UgZG9uJ3QgZGlzcGF0Y2ggdmFsdWVzIGZvciBrZXlzIHRoZVxuXHRcdC8vIGhvc3QgZGlkbid0IHB1Ymxpc2ggYSBzY2hlbWEgZm9yLlxuXHRcdGNvbnN0IG5leHRWYWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXModmFsdWVzKSkge1xuXHRcdFx0aWYgKGN1cnJlbnQuc2NoZW1hLnByb3BlcnRpZXNba2V5XSkge1xuXHRcdFx0XHRuZXh0VmFsdWVzW2tleV0gPSB2YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZXF1YWxzKG5leHRWYWx1ZXMsIGN1cnJlbnQudmFsdWVzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Jvb3RDb25maWcgPSB7IC4uLmN1cnJlbnQsIHZhbHVlczogbmV4dFZhbHVlcyB9O1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUm9vdENvbmZpZy5maXJlKCk7XG5cblx0XHRjb25zdCBhY3Rpb24gPSB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkIGFzIGNvbnN0LFxuXHRcdFx0Y29uZmlnOiBuZXh0VmFsdWVzLFxuXHRcdFx0cmVwbGFjZTogdHJ1ZSxcblx0XHR9O1xuXHRcdGNvbm5lY3Rpb24uZGlzcGF0Y2goUk9PVF9TVEFURV9VUkksIGFjdGlvbik7XG5cdH1cblxuXHQvLyAtLSBNb2RlbCBzZWxlY3Rpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0Z2V0IG9uRGlkQ2hhbmdlTW9kZWxzKCk6IEV2ZW50PHZvaWQ+IHtcblx0XHRyZXR1cm4gRXZlbnQuc2lnbmFsKHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzKTtcblx0fVxuXG5cdGdldE1vZGVsc1NuYXBzaG90KHNlc3Npb25JZDogc3RyaW5nLCBkZXNpcmVkTW9kZWxJZD86IHN0cmluZyk6IElTZXNzaW9uTW9kZWxzU25hcHNob3Qge1xuXHRcdC8vIEFnZW50LWhvc3QgbW9kZWxzIGFyZSByZWdpc3RlcmVkIGFnYWluc3QgdGhlIHNlc3Npb24ncyByZXNvdXJjZVxuXHRcdC8vIHNjaGVtZSAodGhlIHBlci1ob3N0L3Blci1hZ2VudCBgdGFyZ2V0Q2hhdFNlc3Npb25UeXBlYCkuIFJlc29sdmUgdGhlXG5cdFx0Ly8gc2NoZW1lIGZyb20gdGhlIHNlc3Npb24gYW5kIHJldHVybiB0aGUgbWF0Y2hpbmcgbGFuZ3VhZ2UgbW9kZWxzLlxuXHRcdGNvbnN0IHJlc291cmNlU2NoZW1lID0gdGhpcy5fcmVzb2x2ZVNlc3Npb25SZXNvdXJjZVNjaGVtZShzZXNzaW9uSWQpO1xuXHRcdGlmICghcmVzb3VyY2VTY2hlbWUpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG1vZGVsczogW10sXG5cdFx0XHRcdGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHJlc29sdmVNb2RlbElkZW50aWZpZXIoW10sIGRlc2lyZWRNb2RlbElkLCBmYWxzZSksXG5cdFx0XHRcdG1vZGVsVGFyZ2V0OiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjb25zdCBhbGxNb2RlbHMgPSBnZXRSZWdpc3RlcmVkTGFuZ3VhZ2VNb2RlbHModGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKTtcblx0XHRjb25zdCBtb2RlbHMgPSBhbGxNb2RlbHMuZmlsdGVyKG1vZGVsID0+IG1vZGVsLm1ldGFkYXRhLnRhcmdldENoYXRTZXNzaW9uVHlwZSA9PT0gcmVzb3VyY2VTY2hlbWUpO1xuXHRcdGNvbnN0IGRlc2lyZWRNb2RlbCA9IGRlc2lyZWRNb2RlbElkID8gdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwoZGVzaXJlZE1vZGVsSWQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlc29sdmVkRGVzaXJlZE1vZGVsSWQgPSBkZXNpcmVkTW9kZWw/LnRhcmdldENoYXRTZXNzaW9uVHlwZSAmJiB0aGlzLnJlc291cmNlU2NoZW1lRm9yUHJvdmlkZXIoZGVzaXJlZE1vZGVsLnRhcmdldENoYXRTZXNzaW9uVHlwZSkgPT09IHJlc291cmNlU2NoZW1lXG5cdFx0XHQ/IGAke3Jlc291cmNlU2NoZW1lfToke2Rlc2lyZWRNb2RlbC5pZH1gXG5cdFx0XHQ6IGRlc2lyZWRNb2RlbElkO1xuXHRcdHJldHVybiB7XG5cdFx0XHRtb2RlbHMsXG5cdFx0XHRkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiByZXNvbHZlTW9kZWxJZGVudGlmaWVyRnJvbUxhbmd1YWdlTW9kZWxzKG1vZGVscywgcmVzb2x2ZWREZXNpcmVkTW9kZWxJZCwgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBhbGxNb2RlbHMpLFxuXHRcdFx0bW9kZWxUYXJnZXQ6IHJlc291cmNlU2NoZW1lLFxuXHRcdH07XG5cdH1cblxuXHRnZXRNb2RlbFBpY2tlck9wdGlvbnMoc2Vzc2lvbklkOiBzdHJpbmcpOiBJU2Vzc2lvbk1vZGVsUGlja2VyT3B0aW9ucyB7XG5cdFx0Ly8gQSBzZXNzaW9uIHR5cGUgdGhhdCByZXF1aXJlcyBhbiBleHBsaWNpdCBtb2RlbCBzZWxlY3Rpb24gY2Fubm90IGZhbGxcblx0XHQvLyBiYWNrIHRvIEF1dG8uIFdoZW4gaXQgaGFzIG5vIG1vZGVscyAoZS5nLiB0aGUgQ2xhdWRlIGFnZW50IGhvc3QgZm9yIGFcblx0XHQvLyBDb3BpbG90IEZyZWUgLyBTdHVkZW50IHVzZXIpLCB0aGUgcGlja2VyIHNob3dzIGEgXCJObyBtb2RlbHMgYXZhaWxhYmxlXCJcblx0XHQvLyBzdGF0ZSBpbnN0ZWFkIG9mIEF1dG8uIEhhcm5lc3NlcyB0aGF0IHN1cHBvcnQgQXV0byAoZS5nLiB0aGUgQ29waWxvdFxuXHRcdC8vIENMSSBhZ2VudCBob3N0KSBrZWVwIHRoZSBBdXRvIGZhbGxiYWNrLiBEZXJpdmUgdGhpcyBmcm9tIHRoZVxuXHRcdC8vIGNvbnRyaWJ1dGlvbidzIGRlY2xhcmF0aXZlIGBzaG93QXV0b01vZGVsYCBmbGFnIChrZXllZCBieSB0aGVcblx0XHQvLyBzZXNzaW9uJ3MgcmVzb3VyY2Ugc2NoZW1lLCB3aGljaCBpcyB0aGUgcmVnaXN0ZXJlZFxuXHRcdC8vIGBhZ2VudC1ob3N0LTxwcm92aWRlcj5gIGNoYXQgc2Vzc2lvbiB0eXBlKSByYXRoZXIgdGhhbiBoYXJkY29kaW5nIG5hbWVzLlxuXHRcdGNvbnN0IHJlc291cmNlU2NoZW1lID0gdGhpcy5fcmVzb2x2ZVNlc3Npb25SZXNvdXJjZVNjaGVtZShzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHNob3dBdXRvTW9kZWwgPSAhcmVzb3VyY2VTY2hlbWUgfHwgdGhpcy5fY2hhdFNlc3Npb25zU2VydmljZS5zdXBwb3J0c0F1dG9Nb2RlbEZvclNlc3Npb25UeXBlKHJlc291cmNlU2NoZW1lKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dXNlR3JvdXBlZE1vZGVsUGlja2VyOiB0cnVlLFxuXHRcdFx0c2hvd0ZlYXR1cmVkOiB0cnVlLFxuXHRcdFx0c2hvd1VuYXZhaWxhYmxlRmVhdHVyZWQ6IHRydWUsXG5cdFx0XHRzaG93TWFuYWdlTW9kZWxzQWN0aW9uOiB0cnVlLFxuXHRcdFx0c2hvd0F1dG9Nb2RlbCxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgYSByZW1lbWJlcmVkIG1vZGVsIHNlbGVjdGlvbiBhdCBzZW5kIHRpbWU6IHdoZW4gaXQgaXMgY29uY2x1c2l2ZWx5XG5cdCAqIHVuYXZhaWxhYmxlIGFuZCB0aGUgaGFybmVzcyBzdXBwb3J0cyBBdXRvLCByZXR1cm4gdGhlIEF1dG8gbW9kZWwgaWRlbnRpZmllclxuXHQgKiAocmF0aGVyIHRoYW4gYHVuZGVmaW5lZGAsIHdoaWNoIHdvdWxkIGxlYXZlIGFuIGFscmVhZHktcnVubmluZyBjaGF0IHBpbm5lZFxuXHQgKiB0byBpdHMgc3RhbGUgYmFja2VuZCBtb2RlbCkgc28gdGhlIHJlcXVlc3QgaXMgZXhwbGljaXRseSByZXNldCB0byBBdXRvLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZVNlbmRNb2RlbElkKHNlc3Npb25JZDogc3RyaW5nLCBzZWxlY3RlZE1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFzZWxlY3RlZE1vZGVsSWQpIHtcblx0XHRcdHJldHVybiBzZWxlY3RlZE1vZGVsSWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNuYXBzaG90ID0gdGhpcy5nZXRNb2RlbHNTbmFwc2hvdChzZXNzaW9uSWQsIHNlbGVjdGVkTW9kZWxJZCk7XG5cdFx0aWYgKHNuYXBzaG90LmRlc2lyZWRNb2RlbFJlc29sdXRpb24ua2luZCAhPT0gJ3VuYXZhaWxhYmxlJykge1xuXHRcdFx0Ly8gQXZhaWxhYmxlLCBwZW5kaW5nIChsaXN0IG5vdCB5ZXQgcG9wdWxhdGVkKSBvciBub3QgcmVxdWVzdGVkOiBrZWVwIHRoZSBzZWxlY3Rpb24uXG5cdFx0XHRyZXR1cm4gc2VsZWN0ZWRNb2RlbElkO1xuXHRcdH1cblx0XHRjb25zdCByZXNvdXJjZVNjaGVtZSA9IHRoaXMuX3Jlc29sdmVTZXNzaW9uUmVzb3VyY2VTY2hlbWUoc2Vzc2lvbklkKTtcblx0XHRjb25zdCBzdXBwb3J0c0F1dG8gPSAhcmVzb3VyY2VTY2hlbWUgfHwgdGhpcy5fY2hhdFNlc3Npb25zU2VydmljZS5zdXBwb3J0c0F1dG9Nb2RlbEZvclNlc3Npb25UeXBlKHJlc291cmNlU2NoZW1lKTtcblx0XHRpZiAoIXN1cHBvcnRzQXV0bykge1xuXHRcdFx0cmV0dXJuIHNlbGVjdGVkTW9kZWxJZDtcblx0XHR9XG5cdFx0Ly8gU2VuZCB0aGUgaGFybmVzcydzIEF1dG8gbW9kZWwgZXhwbGljaXRseS4gUmV0dXJuaW5nIGB1bmRlZmluZWRgIHdvdWxkXG5cdFx0Ly8gb21pdCBgbW9kZWxgIGZyb20gdGhlIHR1cm4sIHdoaWNoIGxlYXZlcyBhbiBhbHJlYWR5LXJ1bm5pbmcgY2hhdCBvbiBpdHNcblx0XHQvLyBzdGFsZSBiYWNrZW5kIHNlbGVjdGlvbiBhbmQgc3RpbGwgZmFpbHMgb24gdGhlIHVucm91dGFibGUgbW9kZWwuXG5cdFx0Y29uc3QgYXV0b01vZGVsSWQgPSByZXNvbHZlQ29uZmlndXJlZE1vZGVsKCdhdXRvJywgc25hcHNob3QubW9kZWxzKT8uaWRlbnRpZmllcjtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFske3RoaXMuaWR9XSBTZWxlY3RlZCBtb2RlbCAnJHtzZWxlY3RlZE1vZGVsSWR9JyBpcyB1bmF2YWlsYWJsZSBmb3Igc2Vzc2lvbiAnJHtzZXNzaW9uSWR9JzsgZmFsbGluZyBiYWNrIHRvIEF1dG8gaW5zdGVhZCBvZiBzZW5kaW5nIGFuIHVucm91dGFibGUgbW9kZWwuYCk7XG5cdFx0cmV0dXJuIGF1dG9Nb2RlbElkO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZVNlc3Npb25SZXNvdXJjZVNjaGVtZShzZXNzaW9uSWQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IHRoaXMuX2dldE5ld1Nlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRpZiAobmV3U2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIG5ld1Nlc3Npb24uc2Vzc2lvbi5yZXNvdXJjZS5zY2hlbWU7XG5cdFx0fVxuXHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gcmF3SWQgPyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gY2FjaGVkPy5yZXNvdXJjZS5zY2hlbWU7XG5cdH1cblxuXHRzZXRNb2RlbChzZXNzaW9uSWQ6IHN0cmluZywgbW9kZWxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IHRoaXMuX2dldE5ld1Nlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRpZiAobmV3U2Vzc2lvbikge1xuXHRcdFx0bmV3U2Vzc2lvbi5zZXRTZWxlY3RlZE1vZGVsSWQobW9kZWxJZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoc2Vzc2lvbklkKTtcblx0XHRjb25zdCBjYWNoZWQgPSByYXdJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0aWYgKGNhY2hlZCAmJiByYXdJZCAmJiBjb25uZWN0aW9uKSB7XG5cdFx0XHRjb25zdCBjaGF0UmVzb3VyY2UgPSB0aGlzLl9hY3RpdmVDaGF0UmVzb3VyY2UoY2FjaGVkKTtcblx0XHRcdGNhY2hlZC5zZXRDaGF0TW9kZWxJZChjaGF0UmVzb3VyY2UsIG1vZGVsSWQpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQ2hhdFNlc3Npb25TdGF0ZShjaGF0UmVzb3VyY2UsIG1vZGVsSWQsIGNhY2hlZC5nZXRDaGF0TW9kZShjaGF0UmVzb3VyY2UpPy5pZCkuY2F0Y2goZXJyID0+IHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFske3RoaXMuaWR9XSBGYWlsZWQgdG8gdXBkYXRlIGNoYXQgbW9kZWwgc3RhdGUgZm9yICR7Y2hhdFJlc291cmNlLnRvU3RyaW5nKCl9YCwgZXJyKSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbY2FjaGVkXSB9KTtcblx0XHR9XG5cdH1cblxuXHRzZXRBZ2VudChzZXNzaW9uSWQ6IHN0cmluZywgYWdlbnQ6IElTZXNzaW9uQWdlbnRSZWYgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBuZXdTZXNzaW9uID0gdGhpcy5fZ2V0TmV3U2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdGlmIChuZXdTZXNzaW9uKSB7XG5cdFx0XHRuZXdTZXNzaW9uLnNldFNlbGVjdGVkQWdlbnQoYWdlbnQpO1xuXHRcdFx0Ly8gVGhlIHNlbGVjdGlvbiBpcyBmb3J3YXJkZWQgdG8gdGhlIGhvc3QgYXQgZmlyc3QtbWVzc2FnZSB0aW1lXG5cdFx0XHQvLyB2aWEgYHNlbmRPcHRpb25zLmFnZW50SG9zdFNlc3Npb25BZ2VudGAgKHNlZSBgc2VuZFJlcXVlc3RgKSxcblx0XHRcdC8vIG1pcnJvcmluZyBob3cgYHVzZXJTZWxlY3RlZE1vZGVsSWRgIGZsb3dzLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gcmF3SWQgPyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdGlmIChjYWNoZWQgJiYgcmF3SWQgJiYgY29ubmVjdGlvbikge1xuXHRcdFx0Y29uc3QgY2hhdFJlc291cmNlID0gdGhpcy5fYWN0aXZlQ2hhdFJlc291cmNlKGNhY2hlZCk7XG5cdFx0XHRjYWNoZWQuc2V0Q2hhdEFnZW50KGNoYXRSZXNvdXJjZSwgYWdlbnQpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQ2hhdFNlc3Npb25TdGF0ZShjaGF0UmVzb3VyY2UsIGNhY2hlZC5nZXRDaGF0TW9kZWxJZChjaGF0UmVzb3VyY2UpLCBhZ2VudD8udXJpKS5jYXRjaChlcnIgPT4gdGhpcy5fbG9nU2VydmljZS5lcnJvcihgWyR7dGhpcy5pZH1dIEZhaWxlZCB0byB1cGRhdGUgY2hhdCBtb2RlbCBzdGF0ZSBmb3IgJHtjaGF0UmVzb3VyY2UudG9TdHJpbmcoKX1gLCBlcnIpKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtjYWNoZWRdIH0pO1xuXHRcdH1cblx0fVxuXG5cdGdldEN1c3RvbUFnZW50cyhzZXNzaW9uSWQ6IHN0cmluZyk6IHJlYWRvbmx5IEFnZW50Q3VzdG9taXphdGlvbltdIHtcblx0XHRjb25zdCBzZXNzaW9uU3RhdGUgPSB0aGlzLl9sYXN0U2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gZ2V0RWZmZWN0aXZlQWdlbnRzKHNlc3Npb25TdGF0ZT8uY3VzdG9taXphdGlvbnMpO1xuXHR9XG5cblx0Z2V0Q3VzdG9taXphdGlvbnMoc2Vzc2lvbklkOiBzdHJpbmcpOiBDdXN0b21pemF0aW9uW10ge1xuXHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IHRoaXMuX2xhc3RTZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uSWQpO1xuXHRcdHJldHVybiBzZXNzaW9uU3RhdGU/LmN1c3RvbWl6YXRpb25zID8/IFtdO1xuXHR9XG5cblx0Z2V0V29ya2luZ0RpcmVjdG9yeShzZXNzaW9uSWQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblN0YXRlID0gdGhpcy5fbGFzdFNlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIHNlc3Npb25TdGF0ZT8ud29ya2luZ0RpcmVjdG9yaWVzPy5bMF07XG5cdH1cblxuXHRnZXRCYWNrZW5kQ2hhdFJlc291cmNlKGNoYXRSZXNvdXJjZTogVVJJKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBUaGUgY2xpZW50IHJlc291cmNlIGlzIGA8c2NoZW1lPjovPHJhd0lkPlsjY2hhdElkXWA7IGRyb3AgdGhlIGZyYWdtZW50IHRvXG5cdFx0Ly8gcmVjb3ZlciB0aGUgc2Vzc2lvbiByZXNvdXJjZSwgd2hvc2UgYHNlc3Npb25JZGAga2V5cyBgX2xhc3RTZXNzaW9uU3RhdGVzYC5cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBjaGF0UmVzb3VyY2Uud2l0aCh7IGZyYWdtZW50OiAnJyB9KTtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX2xhc3RTZXNzaW9uU3RhdGVzLmdldCh0b1Nlc3Npb25JZCh0aGlzLmlkLCBzZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBMb29rIHVwIHRoZSBhdXRob3JpdGF0aXZlIGhvc3Qtc3VwcGxpZWQgYmFja2VuZCBjaGF0IFVSSSByYXRoZXIgdGhhblxuXHRcdC8vIGNvbnN0cnVjdGluZyBvbmU6IGEgcGVlciBjaGF0J3MgY2xpZW50IGZyYWdtZW50IGlzIGV4YWN0bHkgdGhlIGNoYXRJZCBvZlxuXHRcdC8vIGl0cyBgQ2hhdFN1bW1hcnkucmVzb3VyY2VgIChzZWUgYF9jcmVhdGVBZGRpdGlvbmFsQ2hhdGApOyB0aGUgZGVmYXVsdFxuXHRcdC8vIGNoYXQgKG5vIGZyYWdtZW50KSBpcyBgU2Vzc2lvblN0YXRlLmRlZmF1bHRDaGF0YCwgZmFsbGluZyBiYWNrIHRvIHRoZVxuXHRcdC8vIHN1bW1hcnkgZmxhZ2dlZCBieSBgaXNEZWZhdWx0Q2hhdFVyaWAgXHUyMDE0IG1pcnJvcmluZyBgX2FwcGx5Q2hhdENhdGFsb2dgLlxuXHRcdGNvbnN0IGNoYXRJZCA9IGNoYXRSZXNvdXJjZS5mcmFnbWVudCB8fCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYmFja2VuZFJlc291cmNlID0gY2hhdElkXG5cdFx0XHQ/IHN0YXRlLmNoYXRzLmZpbmQoYyA9PiBwYXJzZUNoYXRVcmkoYy5yZXNvdXJjZSk/LmNoYXRJZCA9PT0gY2hhdElkKT8ucmVzb3VyY2Vcblx0XHRcdDogKHN0YXRlLmRlZmF1bHRDaGF0ID8/IHN0YXRlLmNoYXRzLmZpbmQoYyA9PiBpc0RlZmF1bHRDaGF0VXJpKGMucmVzb3VyY2UpKT8ucmVzb3VyY2UpO1xuXHRcdGlmICghYmFja2VuZFJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBUaGUgcmVzb3VyY2UgaXMgaG9zdC1zdXBwbGllZCBhbmQgb25seSBwYXJzZWQgaGVyZSB0byBoYW5kIGJhY2sgYSBVUkk7XG5cdFx0Ly8gYSBtYWxmb3JtZWQgb25lIG11c3Qgbm90IGJyZWFrIHRoZSBkcmFnIGdlc3R1cmUgdGhhdCBhc2tzIGZvciBpdC5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIFVSSS5wYXJzZShiYWNrZW5kUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGdldFdvcmtpbmdEaXJlY3RvcmllcyhzZXNzaW9uSWQ6IHN0cmluZyk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0XHRjb25zdCBzZXNzaW9uU3RhdGUgPSB0aGlzLl9sYXN0U2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gc2Vzc2lvblN0YXRlPy53b3JraW5nRGlyZWN0b3JpZXMgPz8gW107XG5cdH1cblxuXHRnZXRNY3BTZXJ2ZXJzKHNlc3Npb25JZDogc3RyaW5nKTogcmVhZG9ubHkgSUFnZW50SG9zdE1jcFNlcnZlcltdIHtcblx0XHRjb25zdCBzZXNzaW9uU3RhdGUgPSB0aGlzLl9sYXN0U2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIXNlc3Npb25TdGF0ZSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCByYXdJZCA9IHRoaXMuX3Jhd0lkRnJvbUNoYXRJZChzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IGNhY2hlZCA9IHJhd0lkID8gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChyYXdJZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFjYWNoZWQgfHwgIXJhd0lkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBjYWNoZWQuYmFja2VuZFVyaTtcblx0XHRyZXR1cm4gKHNlc3Npb25TdGF0ZS5jdXN0b21pemF0aW9ucyA/PyBbXSlcblx0XHRcdC5mbGF0TWFwKGMgPT4gYy50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXJcblx0XHRcdFx0PyBbY11cblx0XHRcdFx0OiBjLmNoaWxkcmVuXG5cdFx0XHRcdFx0PyBjLmNoaWxkcmVuLmZpbHRlcihjID0+IGMudHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyKVxuXHRcdFx0XHRcdDogW10pXG5cdFx0XHQubWFwKChjKTogSUFnZW50SG9zdE1jcFNlcnZlciA9PiAoe1xuXHRcdFx0XHRpZDogYCR7c2Vzc2lvblVyaS5hdXRob3JpdHl9LyR7Yy5pZH1gLFxuXHRcdFx0XHRuYW1lOiBjLm5hbWUsXG5cdFx0XHRcdGVuYWJsZWQ6IGMuZW5hYmxlZCxcblx0XHRcdFx0c3RhdHVzOiBjLnN0YXRlLmtpbmQsXG5cdFx0XHRcdHN0YXRlOiBjLnN0YXRlLFxuXHRcdFx0XHRzZXRFbmFibGVkOiAoZW5hYmxlZDogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0XHRcdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbm5lY3Rpb24uZGlzcGF0Y2goc2Vzc2lvblVyaS50b1N0cmluZygpLCB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVG9nZ2xlZCxcblx0XHRcdFx0XHRcdGlkOiBjLmlkLFxuXHRcdFx0XHRcdFx0ZW5hYmxlZCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0c3RhcnQ6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdFx0XHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25uZWN0aW9uLmRpc3BhdGNoKHNlc3Npb25VcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RhcnRSZXF1ZXN0ZWQsXG5cdFx0XHRcdFx0XHRpZDogYy5pZCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0c3RvcDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0XHRcdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbm5lY3Rpb24uZGlzcGF0Y2goc2Vzc2lvblVyaS50b1N0cmluZygpLCB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25NY3BTZXJ2ZXJTdG9wUmVxdWVzdGVkLFxuXHRcdFx0XHRcdFx0aWQ6IGMuaWQsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdH1cblxuXHRnZXRGZWVkYmFja0Fubm90YXRpb25zQ2hhbm5lbChzZXNzaW9uSWQ6IHN0cmluZyk6IHsgcmVhZG9ubHkgY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbjsgcmVhZG9ubHkgYW5ub3RhdGlvbnNVcmk6IFVSSSB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoc2Vzc2lvbklkKTtcblx0XHRjb25zdCBjYWNoZWQgPSByYXdJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpIDogdW5kZWZpbmVkO1xuXHRcdGlmICghY2FjaGVkIHx8ICFyYXdJZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGNhY2hlZC5iYWNrZW5kVXJpO1xuXHRcdGNvbnN0IGFubm90YXRpb25zVXJpID0gVVJJLnBhcnNlKGJ1aWxkQW5ub3RhdGlvbnNVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpKSk7XG5cdFx0cmV0dXJuIHsgY29ubmVjdGlvbiwgYW5ub3RhdGlvbnNVcmkgfTtcblx0fVxuXG5cdC8vIC0tIFNlc3Npb24gYWN0aW9ucyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRhc3luYyBhcmNoaXZlU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gcmF3SWQgPyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoY2FjaGVkICYmIHJhd0lkKSB7XG5cdFx0XHRjYWNoZWQuaXNBcmNoaXZlZC5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtjYWNoZWRdIH0pO1xuXHRcdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRcdGlmIChjb25uZWN0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBjYWNoZWQuYmFja2VuZFVyaTtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0geyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Jc0FyY2hpdmVkQ2hhbmdlZCBhcyBjb25zdCwgaXNBcmNoaXZlZDogdHJ1ZSB9O1xuXHRcdFx0XHRjb25uZWN0aW9uLmRpc3BhdGNoKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyB1bmFyY2hpdmVTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoc2Vzc2lvbklkKTtcblx0XHRjb25zdCBjYWNoZWQgPSByYXdJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChjYWNoZWQgJiYgcmF3SWQpIHtcblx0XHRcdGNhY2hlZC5pc0FyY2hpdmVkLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtjYWNoZWRdIH0pO1xuXHRcdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRcdGlmIChjb25uZWN0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBjYWNoZWQuYmFja2VuZFVyaTtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0geyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Jc0FyY2hpdmVkQ2hhbmdlZCBhcyBjb25zdCwgaXNBcmNoaXZlZDogZmFsc2UgfTtcblx0XHRcdFx0Y29ubmVjdGlvbi5kaXNwYXRjaChzZXNzaW9uVXJpLnRvU3RyaW5nKCksIGFjdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc2V0U2Vzc2lvblJlYWRTdGF0ZShzZXNzaW9uSWQ6IHN0cmluZywgaXNSZWFkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoc2Vzc2lvbklkKTtcblx0XHRjb25zdCBjYWNoZWQgPSByYXdJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChjYWNoZWQgJiYgcmF3SWQgJiYgY2FjaGVkLmlzUmVhZC5nZXQoKSAhPT0gaXNSZWFkKSB7XG5cdFx0XHRjYWNoZWQuaXNSZWFkLnNldChpc1JlYWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbY2FjaGVkXSB9KTtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0XHRpZiAoY29ubmVjdGlvbikge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gY2FjaGVkLmJhY2tlbmRVcmk7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNSZWFkQ2hhbmdlZCBhcyBjb25zdCwgaXNSZWFkIH07XG5cdFx0XHRcdGNvbm5lY3Rpb24uZGlzcGF0Y2goc2Vzc2lvblVyaS50b1N0cmluZygpLCBhY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGRlbGV0ZVNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmRlbGV0ZVNlc3Npb25zKFtzZXNzaW9uSWRdKTtcblx0fVxuXG5cdGFzeW5jIGRlbGV0ZVNlc3Npb25zKHNlc3Npb25JZHM6IHJlYWRvbmx5IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGFyZ2V0czogeyByYXdJZDogc3RyaW5nOyBzZXNzaW9uSWQ6IHN0cmluZzsgY2FjaGVkOiBBZ2VudEhvc3RTZXNzaW9uQWRhcHRlciB9W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb25JZCBvZiBzZXNzaW9uSWRzKSB7XG5cdFx0XHRjb25zdCByYXdJZCA9IHRoaXMuX3Jhd0lkRnJvbUNoYXRJZChzZXNzaW9uSWQpO1xuXHRcdFx0Y29uc3QgY2FjaGVkID0gcmF3SWQgPyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChjYWNoZWQgJiYgcmF3SWQpIHtcblx0XHRcdFx0dGFyZ2V0cy5wdXNoKHsgcmF3SWQsIHNlc3Npb25JZCwgY2FjaGVkIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGFyZ2V0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCB7IHJhd0lkLCBzZXNzaW9uSWQsIGNhY2hlZCB9IG9mIHRhcmdldHMpIHtcblx0XHRcdGF3YWl0IGNvbm5lY3Rpb24uZGlzcG9zZVNlc3Npb24oY2FjaGVkLmJhY2tlbmRVcmkpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLmRlbGV0ZShyYXdJZCk7XG5cdFx0XHR0aGlzLl9ydW5uaW5nU2Vzc2lvbkNvbmZpZ3MuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0XHR0aGlzLl9ydW5uaW5nU2Vzc2lvbkNvbmZpZ1Jlc29sdmVTZXEuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlbW92ZWQgPSB0YXJnZXRzLm1hcCh0YXJnZXQgPT4gdGFyZ2V0LmNhY2hlZCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkLCBjaGFuZ2VkOiBbXSB9KTtcblx0XHRmb3IgKGNvbnN0IGNhY2hlZCBvZiByZW1vdmVkKSB7XG5cdFx0XHRjYWNoZWQuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlbmFtZUNoYXQoc2Vzc2lvbklkOiBzdHJpbmcsIGNoYXRVcmk6IFVSSSwgdGl0bGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gcmF3SWQgPyB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdGlmICghY2FjaGVkIHx8ICFyYXdJZCB8fCAhY29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gY2FjaGVkLmJhY2tlbmRVcmk7XG5cdFx0Y29uc3QgY2hhdElkID0gY2hhdFVyaS5mcmFnbWVudDtcblx0XHRjb25zdCBhY3Rpb24gPSB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCBhcyBjb25zdCwgdGl0bGUgfTtcblx0XHRpZiAoY2hhdElkKSB7XG5cdFx0XHQvLyBBZGRpdGlvbmFsIHBlZXIgY2hhdDogcmVuYW1lIG9ubHkgdGhhdCBjaGF0IGJ5IGRpc3BhdGNoaW5nIG9uIGl0c1xuXHRcdFx0Ly8gY2hhdCBjaGFubmVsLiBUaGUgaG9zdCB0cmFuc2xhdGVzIHRoaXMgdG8gYSBwZXItY2hhdCB1cGRhdGUuXG5cdFx0XHRjYWNoZWQuc2V0QWRkaXRpb25hbENoYXRUaXRsZShjaGF0SWQsIHRpdGxlKTtcblx0XHRcdGNvbm5lY3Rpb24uZGlzcGF0Y2goYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksIGNoYXRJZCksIGFjdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIERlZmF1bHQgY2hhdDogcmVuYW1lIHRoZSBkZWZhdWx0IGNoYXQgdGFiIGluZGVwZW5kZW50bHkgb2YgdGhlXG5cdFx0XHQvLyBzZXNzaW9uIHRpdGxlIGJ5IGRpc3BhdGNoaW5nIG9uIHRoZSBkZWZhdWx0IGNoYXQgY2hhbm5lbC5cblx0XHRcdGNhY2hlZC5zZXREZWZhdWx0Q2hhdFRpdGxlKHRpdGxlKTtcblx0XHRcdGNvbm5lY3Rpb24uZGlzcGF0Y2goYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSwgYWN0aW9uKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW2NhY2hlZF0gfSk7XG5cdH1cblxuXHRhc3luYyByZW5hbWVTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nLCB0aXRsZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoc2Vzc2lvbklkKTtcblx0XHRjb25zdCBjYWNoZWQgPSByYXdJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0aWYgKGNhY2hlZCAmJiByYXdJZCAmJiBjb25uZWN0aW9uKSB7XG5cdFx0XHRjYWNoZWQudGl0bGUuc2V0KHRpdGxlLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW2NhY2hlZF0gfSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gY2FjaGVkLmJhY2tlbmRVcmk7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCBhcyBjb25zdCwgdGl0bGUgfTtcblx0XHRcdGNvbm5lY3Rpb24uZGlzcGF0Y2goc2Vzc2lvblVyaS50b1N0cmluZygpLCBhY3Rpb24pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGRlbGV0ZUNoYXQoc2Vzc2lvbklkOiBzdHJpbmcsIGNoYXRVcmk6IFVSSSwgb3B0aW9ucz86IElEZWxldGVDaGF0T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGNoYXRJZCA9IGNoYXRVcmkuZnJhZ21lbnQ7XG5cdFx0aWYgKCFjaGF0SWQpIHtcblx0XHRcdC8vIFRoZSBkZWZhdWx0IGNoYXQgbGl2ZXMgYW5kIGRpZXMgd2l0aCBpdHMgc2Vzc2lvbiBhbmQgY2Fubm90IGJlXG5cdFx0XHQvLyBkZWxldGVkIGluIGlzb2xhdGlvbi5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoc2Vzc2lvbklkKTtcblx0XHRjb25zdCBjYWNoZWQgPSByYXdJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0aWYgKCFyYXdJZCB8fCAhY2FjaGVkIHx8ICFjb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBjYWNoZWQuYmFja2VuZFVyaTtcblx0XHRjb25zdCBhaHBDaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCBjaGF0SWQpKTtcblxuXHRcdGlmICghb3B0aW9ucz8uc2tpcENvbmZpcm1hdGlvbikge1xuXHRcdFx0Y29uc3QgY29uZmlybWVkID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2RlbGV0ZUNoYXQuY29uZmlybScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSB0aGlzIGNoYXQ/XCIpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdkZWxldGVDaGF0LmRldGFpbCcsIFwiVGhpcyBhY3Rpb24gY2Fubm90IGJlIHVuZG9uZS5cIiksXG5cdFx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdkZWxldGVDaGF0LmRlbGV0ZScsIFwiRGVsZXRlXCIpXG5cdFx0XHR9KTtcblx0XHRcdGlmICghY29uZmlybWVkLmNvbmZpcm1lZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gS2VlcCB0aGUgc2Vzc2lvbi1zdGF0ZSBzdWJzY3JpcHRpb24gYWxpdmUgc28gdGhlIGBjaGF0UmVtb3ZlZGAgdGhlXG5cdFx0Ly8gaG9zdCBlbWl0cyBmbG93cyBpbnRvIGBhcHBseUNoYXRDYXRhbG9nYCBhbmQgZHJvcHMgdGhlIGNoYXQgZnJvbVxuXHRcdC8vIGBjYWNoZWQuY2hhdHNgLlxuXHRcdHRoaXMuX2tlZXBTZXNzaW9uU3RhdGVBbGl2ZShjYWNoZWQuc2Vzc2lvbklkKTtcblx0XHRhd2FpdCBjb25uZWN0aW9uLmRpc3Bvc2VDaGF0KGFocENoYXRVcmkpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlTmV3Q2hhdChjaGF0SWQ6IHN0cmluZyk6IFByb21pc2U8SUNoYXQ+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuX25vdENvbm5lY3RlZFNlbmRFcnJvck1lc3NhZ2UoKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IHRoaXMuX2dldE5ld1Nlc3Npb24oY2hhdElkKTtcblx0XHRpZiAobmV3U2Vzc2lvbikge1xuXHRcdFx0Ly8gQ3JlYXRlIHRoZSBjaGF0IHNlc3Npb24gbW9kZWwgc28gdGhlIG1hbmFnZW1lbnQgc2VydmljZSBjYW4gb3BlbiB0aGUgd2lkZ2V0XG5cdFx0XHRhd2FpdCB0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24obmV3U2Vzc2lvbi5zZXNzaW9uLnJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdHJldHVybiBuZXdTZXNzaW9uLnNlc3Npb24ubWFpbkNoYXQuZ2V0KCk7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIHRoaXMgaXMgYW4gYWRkaXRpb25hbCBwZWVyIGNoYXQgaW5zaWRlIGFuIGV4aXN0aW5nIHJ1bm5pbmdcblx0XHQvLyBzZXNzaW9uLiBNaW50IGEgY2xpZW50LWNob3NlbiBjaGF0IFVSSSwgYXNrIHRoZSBob3N0IHRvIGFkZCBpdCB0byB0aGVcblx0XHQvLyBzZXNzaW9uJ3MgY2F0YWxvZywgYW5kIHdhaXQgZm9yIHRoZSBhZGFwdGVyIHRvIHN1cmZhY2UgdGhlIG5ldyBjaGF0LlxuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVBZGRpdGlvbmFsQ2hhdChjaGF0SWQsIGNvbm5lY3Rpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlQWRkaXRpb25hbENoYXQoY2hhdElkOiBzdHJpbmcsIGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24pOiBQcm9taXNlPElDaGF0PiB7XG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoY2hhdElkKTtcblx0XHRjb25zdCBjYWNoZWQgPSByYXdJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpIDogdW5kZWZpbmVkO1xuXHRcdGlmICghcmF3SWQgfHwgIWNhY2hlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBTZXNzaW9uICcke2NoYXRJZH0nIG5vdCBmb3VuZGApO1xuXHRcdH1cblx0XHRpZiAoIWNhY2hlZC5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNNdWx0aXBsZUNoYXRzKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJyR7Y2hhdElkfScgZG9lcyBub3Qgc3VwcG9ydCBtdWx0aXBsZSBjaGF0c2ApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBjYWNoZWQuYmFja2VuZFVyaTtcblx0XHRjb25zdCBuZXdDaGF0SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCBuZXdDaGF0SWQpKTtcblx0XHRjb25zdCBzZWxlY3RlZE1vZGVsSWQgPSBjYWNoZWQubW9kZWxJZC5nZXQoKSA/PyAoY2FjaGVkLm1vZGVsU2VsZWN0aW9uID8gYCR7Y2FjaGVkLnJlc291cmNlLnNjaGVtZX06JHtjYWNoZWQubW9kZWxTZWxlY3Rpb24uaWR9YCA6IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRBZ2VudFVyaSA9IGNhY2hlZC5tb2RlLmdldCgpPy5pZDtcblxuXHRcdC8vIFNob3cgYXMgYFVudGl0bGVkYCB1bnRpbCB0aGUgZmlyc3QgcmVxdWVzdDsgdGhlIGhvc3QgY29tbWl0cyBpdCBiZWxvdy5cblx0XHRjYWNoZWQubWFya0NoYXRBc05ldyhuZXdDaGF0SWQpO1xuXG5cdFx0Ly8gS2VlcCB0aGUgc2Vzc2lvbi1zdGF0ZSBzdWJzY3JpcHRpb24gYWxpdmUgc28gdGhlIGBjaGF0QWRkZWRgIGl0IGVtaXRzXG5cdFx0Ly8gZmxvd3MgaW50byBgX2FwcGx5Q2hhdENhdGFsb2dGcm9tU3RhdGVgIGFuZCB1cGRhdGVzIGBjYWNoZWQuY2hhdHNgLlxuXHRcdHRoaXMuX2tlZXBTZXNzaW9uU3RhdGVBbGl2ZShjYWNoZWQuc2Vzc2lvbklkKTtcblx0XHRhd2FpdCBjb25uZWN0aW9uLmNyZWF0ZUNoYXQoc2Vzc2lvblVyaSwgY2hhdFVyaSwge1xuXHRcdFx0bW9kZWw6IGNhY2hlZC5tb2RlbFNlbGVjdGlvbixcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNoYXQgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoXG5cdFx0XHRjYWNoZWQuY2hhdHMubWFwKGNoYXRzID0+IGNoYXRzLmZpbmQoYyA9PiBjLnJlc291cmNlLmZyYWdtZW50ID09PSBuZXdDaGF0SWQpKSxcblx0XHRcdGMgPT4gISFjLFxuXHRcdCk7XG5cblx0XHRjYWNoZWQuc2V0Q2hhdE1vZGVsSWQoY2hhdC5yZXNvdXJjZSwgc2VsZWN0ZWRNb2RlbElkKTtcblx0XHRjYWNoZWQuc2V0Q2hhdEFnZW50KGNoYXQucmVzb3VyY2UsIHNlbGVjdGVkQWdlbnRVcmkgPyB7IHVyaTogc2VsZWN0ZWRBZ2VudFVyaSwgbmFtZTogJycgfSA6IHVuZGVmaW5lZCk7XG5cblx0XHRhd2FpdCB0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24oY2hhdC5yZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXdhaXQgdGhpcy5fdXBkYXRlQ2hhdFNlc3Npb25TdGF0ZShjaGF0LnJlc291cmNlLCBzZWxlY3RlZE1vZGVsSWQsIHNlbGVjdGVkQWdlbnRVcmkpO1xuXHRcdHJldHVybiBjaGF0O1xuXHR9XG5cblx0YXN5bmMgZm9ya0NoYXQoc2Vzc2lvbklkOiBzdHJpbmcsIHNvdXJjZUNoYXQ6IFVSSSwgdHVybklkOiBzdHJpbmcpOiBQcm9taXNlPElDaGF0PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcih0aGlzLl9ub3RDb25uZWN0ZWRTZW5kRXJyb3JNZXNzYWdlKCkpO1xuXHRcdH1cblx0XHRjb25zdCByYXdJZCA9IHRoaXMuX3Jhd0lkRnJvbUNoYXRJZChzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IGNhY2hlZCA9IHJhd0lkID8gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChyYXdJZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFyYXdJZCB8fCAhY2FjaGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJyR7c2Vzc2lvbklkfScgbm90IGZvdW5kYCk7XG5cdFx0fVxuXHRcdGlmICghY2FjaGVkLmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c011bHRpcGxlQ2hhdHMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiAnJHtzZXNzaW9uSWR9JyBkb2VzIG5vdCBzdXBwb3J0IG11bHRpcGxlIGNoYXRzYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGNhY2hlZC5iYWNrZW5kVXJpO1xuXHRcdGNvbnN0IG5ld0NoYXRJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksIG5ld0NoYXRJZCkpO1xuXHRcdGNvbnN0IHNvdXJjZUJhY2tlbmRVcmkgPSB0aGlzLl9yZXNvbHZlQmFja2VuZFNvdXJjZUNoYXRVcmkoY2FjaGVkLnNlc3Npb25JZCwgc2Vzc2lvblVyaSwgc291cmNlQ2hhdCk7XG5cblx0XHQvLyBLZWVwIHRoZSBzZXNzaW9uLXN0YXRlIHN1YnNjcmlwdGlvbiBhbGl2ZSBzbyB0aGUgYGNoYXRBZGRlZGAgaXQgZW1pdHNcblx0XHQvLyBmbG93cyBpbnRvIGBfYXBwbHlDaGF0Q2F0YWxvZ0Zyb21TdGF0ZWAgYW5kIHVwZGF0ZXMgYGNhY2hlZC5jaGF0c2AuXG5cdFx0dGhpcy5fa2VlcFNlc3Npb25TdGF0ZUFsaXZlKGNhY2hlZC5zZXNzaW9uSWQpO1xuXHRcdGF3YWl0IGNvbm5lY3Rpb24uY3JlYXRlQ2hhdChzZXNzaW9uVXJpLCBjaGF0VXJpLCB7XG5cdFx0XHRtb2RlbDogY2FjaGVkLm1vZGVsU2VsZWN0aW9uLFxuXHRcdFx0Zm9yazogeyBzb3VyY2U6IHNvdXJjZUJhY2tlbmRVcmksIHR1cm5JZCB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY2hhdCA9IGF3YWl0IHdhaXRGb3JTdGF0ZShcblx0XHRcdGNhY2hlZC5jaGF0cy5tYXAoY2hhdHMgPT4gY2hhdHMuZmluZChjID0+IGMucmVzb3VyY2UuZnJhZ21lbnQgPT09IG5ld0NoYXRJZCkpLFxuXHRcdFx0YyA9PiAhIWMsXG5cdFx0KTtcblxuXHRcdGF3YWl0IHRoaXMuX2NoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0T3JDcmVhdGVDaGF0U2Vzc2lvbihjaGF0LnJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRyZXR1cm4gY2hhdDtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVNpZGVDaGF0KHNlc3Npb25JZDogc3RyaW5nLCBzb3VyY2VDaGF0OiBVUkksIHR1cm5JZDogc3RyaW5nLCBzZWxlY3Rpb24/OiBJU2lkZUNoYXRTZWxlY3Rpb24pOiBQcm9taXNlPElDaGF0PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcih0aGlzLl9ub3RDb25uZWN0ZWRTZW5kRXJyb3JNZXNzYWdlKCkpO1xuXHRcdH1cblx0XHRjb25zdCByYXdJZCA9IHRoaXMuX3Jhd0lkRnJvbUNoYXRJZChzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IGNhY2hlZCA9IHJhd0lkID8gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChyYXdJZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFyYXdJZCB8fCAhY2FjaGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJyR7c2Vzc2lvbklkfScgbm90IGZvdW5kYCk7XG5cdFx0fVxuXHRcdGlmICghY2FjaGVkLmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c1NpZGVDaGF0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJyR7c2Vzc2lvbklkfScgZG9lcyBub3Qgc3VwcG9ydCBzaWRlIGNoYXRzYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoY2FjaGVkLmFnZW50UHJvdmlkZXIsIHJhd0lkKTtcblx0XHRjb25zdCBuZXdDaGF0SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCBuZXdDaGF0SWQpKTtcblx0XHRjb25zdCBzb3VyY2VCYWNrZW5kVXJpID0gdGhpcy5fcmVzb2x2ZUJhY2tlbmRTb3VyY2VDaGF0VXJpKGNhY2hlZC5zZXNzaW9uSWQsIHNlc3Npb25VcmksIHNvdXJjZUNoYXQpO1xuXG5cdFx0Ly8gSW5oZXJpdCB0aGUgc291cmNlIGNoYXQncyBvd24gbW9kZWwvYWdlbnQgc2VsZWN0aW9uICh3aGljaCBtYXkgZGlmZmVyXG5cdFx0Ly8gZnJvbSB0aGUgc2Vzc2lvbidzIGRlZmF1bHQpLCBub3QgdGhlIHNlc3Npb24tbGV2ZWwgZmFsbGJhY2suXG5cdFx0Y29uc3Qgc2VsZWN0ZWRNb2RlbCA9IGNhY2hlZC5nZXRDaGF0TW9kZWxTZWxlY3Rpb24oc291cmNlQ2hhdCk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRNb2RlbElkID0gY2FjaGVkLmdldENoYXRNb2RlbElkKHNvdXJjZUNoYXQpXG5cdFx0XHQ/PyAoc2VsZWN0ZWRNb2RlbCA/IGAke2NhY2hlZC5yZXNvdXJjZS5zY2hlbWV9OiR7c2VsZWN0ZWRNb2RlbC5pZH1gIDogdW5kZWZpbmVkKTtcblx0XHRjb25zdCBzZWxlY3RlZEFnZW50VXJpID0gY2FjaGVkLmdldENoYXRNb2RlKHNvdXJjZUNoYXQpPy5pZDtcblxuXHRcdC8vIEtlZXAgdGhlIHNlc3Npb24tc3RhdGUgc3Vic2NyaXB0aW9uIGFsaXZlIHNvIHRoZSBgY2hhdEFkZGVkYCBpdCBlbWl0c1xuXHRcdC8vIGZsb3dzIGludG8gYF9hcHBseUNoYXRDYXRhbG9nRnJvbVN0YXRlYCBhbmQgdXBkYXRlcyBgY2FjaGVkLmNoYXRzYC5cblx0XHR0aGlzLl9rZWVwU2Vzc2lvblN0YXRlQWxpdmUoY2FjaGVkLnNlc3Npb25JZCk7XG5cdFx0YXdhaXQgY29ubmVjdGlvbi5jcmVhdGVDaGF0KHNlc3Npb25VcmksIGNoYXRVcmksIHtcblx0XHRcdG1vZGVsOiBzZWxlY3RlZE1vZGVsLFxuXHRcdFx0c2lkZUNoYXQ6IHtcblx0XHRcdFx0c291cmNlOiBzb3VyY2VCYWNrZW5kVXJpLFxuXHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdC4uLihzZWxlY3Rpb24gPyB7IHNlbGVjdGlvbiB9IDoge30pLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNoYXQgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoXG5cdFx0XHRjYWNoZWQuY2hhdHMubWFwKGNoYXRzID0+IGNoYXRzLmZpbmQoYyA9PiBjLnJlc291cmNlLmZyYWdtZW50ID09PSBuZXdDaGF0SWQpKSxcblx0XHRcdGMgPT4gISFjLFxuXHRcdCk7XG5cblx0XHRjYWNoZWQuc2V0Q2hhdE1vZGVsSWQoY2hhdC5yZXNvdXJjZSwgc2VsZWN0ZWRNb2RlbElkKTtcblx0XHRjYWNoZWQuc2V0Q2hhdEFnZW50KGNoYXQucmVzb3VyY2UsIHNlbGVjdGVkQWdlbnRVcmkgPyB7IHVyaTogc2VsZWN0ZWRBZ2VudFVyaSwgbmFtZTogJycgfSA6IHVuZGVmaW5lZCk7XG5cblx0XHRhd2FpdCB0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9yQ3JlYXRlQ2hhdFNlc3Npb24oY2hhdC5yZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXdhaXQgdGhpcy5fdXBkYXRlQ2hhdFNlc3Npb25TdGF0ZShjaGF0LnJlc291cmNlLCBzZWxlY3RlZE1vZGVsSWQsIHNlbGVjdGVkQWdlbnRVcmkpO1xuXHRcdHJldHVybiBjaGF0O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZUJhY2tlbmRTb3VyY2VDaGF0VXJpKHNlc3Npb25JZDogc3RyaW5nLCBzZXNzaW9uVXJpOiBVUkksIHNvdXJjZUNoYXQ6IFVSSSk6IFVSSSB7XG5cdFx0aWYgKHNvdXJjZUNoYXQuZnJhZ21lbnQpIHtcblx0XHRcdHJldHVybiBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksIHNvdXJjZUNoYXQuZnJhZ21lbnQpKTtcblx0XHR9XG5cdFx0Y29uc3QgaHlkcmF0ZWREZWZhdWx0Q2hhdCA9IHRoaXMuX2xhc3RTZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uSWQpPy5kZWZhdWx0Q2hhdDtcblx0XHRyZXR1cm4gaHlkcmF0ZWREZWZhdWx0Q2hhdCA/IFVSSS5wYXJzZShoeWRyYXRlZERlZmF1bHRDaGF0LnRvU3RyaW5nKCkpIDogVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkpO1xuXHR9XG5cblx0YXN5bmMgc2VuZFJlcXVlc3QoY2hhdElkOiBzdHJpbmcsIGNoYXRSZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxJU2Vzc2lvbj4ge1xuXHRcdGNvbnN0IG5ld1Nlc3Npb24gPSB0aGlzLl9nZXROZXdTZXNzaW9uKGNoYXRJZCk7XG5cdFx0aWYgKG5ld1Nlc3Npb24pIHtcblx0XHRcdHJldHVybiB0aGlzLl9zZW5kTmV3U2Vzc2lvblJlcXVlc3QobmV3U2Vzc2lvbiwgY2hhdElkLCBjaGF0UmVzb3VyY2UsIG9wdGlvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2VuZENvbW1pdHRlZENoYXRSZXF1ZXN0KGNoYXRJZCwgY2hhdFJlc291cmNlLCBvcHRpb25zKTtcblx0fVxuXG5cdC8qKiBTZW5kIHRoZSBmaXJzdCByZXF1ZXN0IGZvciBhbiBhbHJlYWR5LWNvbW1pdHRlZCBwZWVyIGNoYXQsIHRoZW4gY2xlYXIgaXRzIGBuZXdgIGZsYWcuICovXG5cdHByaXZhdGUgYXN5bmMgX3NlbmRDb21taXR0ZWRDaGF0UmVxdWVzdChjaGF0SWQ6IHN0cmluZywgY2hhdFJlc291cmNlOiBVUkksIG9wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPElTZXNzaW9uPiB7XG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoY2hhdElkKTtcblx0XHRjb25zdCBjYWNoZWQgPSByYXdJZCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpIDogdW5kZWZpbmVkO1xuXHRcdGlmICghcmF3SWQgfHwgIWNhY2hlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBTZXNzaW9uICcke2NoYXRJZH0nIG5vdCBmb3VuZGApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgcXVlcnksIGF0dGFjaGVkQ29udGV4dCB9ID0gb3B0aW9ucztcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IGNoYXRSZXNvdXJjZS5zY2hlbWU7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gdGhpcy5fY2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbihzZXNzaW9uVHlwZSk7XG5cblx0XHRjb25zdCBzZWxlY3RlZE1vZGVsSWQgPSB0aGlzLl9yZXNvbHZlU2VuZE1vZGVsSWQoY2hhdElkLCBjYWNoZWQuZ2V0Q2hhdE1vZGVsSWQoY2hhdFJlc291cmNlKSk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRBZ2VudFVyaSA9IGNhY2hlZC5nZXRDaGF0TW9kZShjaGF0UmVzb3VyY2UpPy5pZDtcblxuXHRcdGNvbnN0IHNlbmRPcHRpb25zOiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucyA9IHtcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0dXNlclNlbGVjdGVkTW9kZWxJZDogc2VsZWN0ZWRNb2RlbElkLFxuXHRcdFx0bW9kZUluZm86IHNlbGVjdGVkQWdlbnRVcmkgPyB7XG5cdFx0XHRcdGtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdFx0aXNCdWlsdGluOiBmYWxzZSxcblx0XHRcdFx0bW9kZUluc3RydWN0aW9uczoge1xuXHRcdFx0XHRcdHVyaTogVVJJLnBhcnNlKHNlbGVjdGVkQWdlbnRVcmkpLFxuXHRcdFx0XHRcdG5hbWU6ICcnLFxuXHRcdFx0XHRcdGNvbnRlbnQ6ICcnLFxuXHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dGVsZW1ldHJ5TW9kZUlkOiAnY3VzdG9tJyxcblx0XHRcdFx0YXBwbHlDb2RlQmxvY2tTdWdnZXN0aW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGVybWlzc2lvbkxldmVsOiB1bmRlZmluZWQsXG5cdFx0XHR9IDoge1xuXHRcdFx0XHRraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdGlzQnVpbHRpbjogdHJ1ZSxcblx0XHRcdFx0bW9kZUluc3RydWN0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0XHR0ZWxlbWV0cnlNb2RlSWQ6ICdhZ2VudCcsXG5cdFx0XHRcdGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBlcm1pc3Npb25MZXZlbDogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHRcdGFnZW50SWRTaWxlbnQ6IGNvbnRyaWJ1dGlvbj8udHlwZSxcblx0XHRcdGF0dGFjaGVkQ29udGV4dCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgbW9kZWxSZWYgPSBhd2FpdCB0aGlzLl9jaGF0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihjaGF0UmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmICghbW9kZWxSZWYpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgWyR7dGhpcy5pZH1dIFVuYWJsZSB0byBsb2FkIGNoYXQgc2Vzc2lvbiAke2NoYXRSZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9hcHBseUNoYXRTZXNzaW9uU3RhdGUobW9kZWxSZWYsIHNlbGVjdGVkTW9kZWxJZCwgc2VsZWN0ZWRBZ2VudFVyaSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2NoYXRTZXJ2aWNlLnNlbmRSZXF1ZXN0KGNoYXRSZXNvdXJjZSwgcXVlcnksIHNlbmRPcHRpb25zKTtcblx0XHRcdGlmIChyZXN1bHQua2luZCA9PT0gJ3JlamVjdGVkJykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFske3RoaXMuaWR9XSBzZW5kUmVxdWVzdCByZWplY3RlZDogJHtyZXN1bHQucmVhc29ufWApO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9hcHBseUNoYXRTZXNzaW9uU3RhdGUobW9kZWxSZWYsIHNlbGVjdGVkTW9kZWxJZCwgc2VsZWN0ZWRBZ2VudFVyaSwgeyBjbGVhckRyYWZ0OiB0cnVlIH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRtb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRmlyc3QgcmVxdWVzdCBzZW50OiByZXZlcnQgdG8gdGhlIGhvc3QtcmVwb3J0ZWQgc3RhdHVzLlxuXHRcdGNhY2hlZC5tYXJrQ2hhdEFzU2VudChjaGF0UmVzb3VyY2UuZnJhZ21lbnQpO1xuXG5cdFx0cmV0dXJuIGNhY2hlZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZUNoYXRTZXNzaW9uU3RhdGUoY2hhdFJlc291cmNlOiBVUkksIG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgYWdlbnRVcmk6IHN0cmluZyB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IHsgcmVhZG9ubHkgY2xlYXJEcmFmdD86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1vZGVsUmVmID0gYXdhaXQgdGhpcy5fY2hhdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24oY2hhdFJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRpZiAoIW1vZGVsUmVmKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9hcHBseUNoYXRTZXNzaW9uU3RhdGUobW9kZWxSZWYsIG1vZGVsSWQsIGFnZW50VXJpLCBvcHRpb25zKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0bW9kZWxSZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5Q2hhdFNlc3Npb25TdGF0ZShtb2RlbFJlZjogSUNoYXRNb2RlbFJlZmVyZW5jZSwgbW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBhZ2VudFVyaTogc3RyaW5nIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogeyByZWFkb25seSBjbGVhckRyYWZ0PzogYm9vbGVhbiB9KTogdm9pZCB7XG5cdFx0Y29uc3QgaW5wdXRNb2RlbCA9IG1vZGVsUmVmLm9iamVjdC5pbnB1dE1vZGVsO1xuXHRcdGlmICghaW5wdXRNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAobW9kZWxJZCkge1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbCA9IHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKG1vZGVsSWQpO1xuXHRcdFx0aWYgKGxhbmd1YWdlTW9kZWwpIHtcblx0XHRcdFx0aW5wdXRNb2RlbC5zZXRTdGF0ZSh7IHNlbGVjdGVkTW9kZWw6IHsgaWRlbnRpZmllcjogbW9kZWxJZCwgbWV0YWRhdGE6IGxhbmd1YWdlTW9kZWwgfSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aW5wdXRNb2RlbC5zZXRTdGF0ZSh7XG5cdFx0XHRtb2RlOiB7IGlkOiBhZ2VudFVyaSA/PyBDaGF0TW9kZS5BZ2VudC5pZCwga2luZDogQ2hhdE1vZGVLaW5kLkFnZW50IH0sXG5cdFx0XHQuLi4ob3B0aW9ucz8uY2xlYXJEcmFmdCA/IHsgaW5wdXRUZXh0OiAnJywgYXR0YWNobWVudHM6IFtdLCBzZWxlY3Rpb25zOiBbXSB9IDoge30pLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2VuZE5ld1Nlc3Npb25SZXF1ZXN0KG5ld1Nlc3Npb246IE5ld1Nlc3Npb24sIGNoYXRJZDogc3RyaW5nLCBjaGF0UmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5jb25uZWN0aW9uO1xuXHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHRoaXMuX25vdENvbm5lY3RlZFNlbmRFcnJvck1lc3NhZ2UoKSk7XG5cdFx0fVxuXG5cdFx0bmV3U2Vzc2lvbi5zZXRTdGF0dXMoU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKTtcblx0XHRjb25zdCBzZWxlY3RlZE1vZGVsSWQgPSB0aGlzLl9yZXNvbHZlU2VuZE1vZGVsSWQoY2hhdElkLCBuZXdTZXNzaW9uLmdldFNlbGVjdGVkTW9kZWxJZCgpKTtcblx0XHRjb25zdCBzZWxlY3RlZEFnZW50ID0gbmV3U2Vzc2lvbi5nZXRTZWxlY3RlZEFnZW50KCk7XG5cblx0XHRjb25zdCB7IHF1ZXJ5LCBhdHRhY2hlZENvbnRleHQgfSA9IG9wdGlvbnM7XG5cblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IGNoYXRSZXNvdXJjZS5zY2hlbWU7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gdGhpcy5fY2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbihzZXNzaW9uVHlwZSk7XG5cblx0XHRjb25zdCBzZW5kT3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHVzZXJTZWxlY3RlZE1vZGVsSWQ6IHNlbGVjdGVkTW9kZWxJZCxcblx0XHRcdG1vZGVJbmZvOiBzZWxlY3RlZEFnZW50ID8ge1xuXHRcdFx0XHRraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdGlzQnVpbHRpbjogZmFsc2UsXG5cdFx0XHRcdG1vZGVJbnN0cnVjdGlvbnM6IHtcblx0XHRcdFx0XHR1cmk6IFVSSS5wYXJzZShzZWxlY3RlZEFnZW50LnVyaSksXG5cdFx0XHRcdFx0bmFtZTogJycsXG5cdFx0XHRcdFx0Y29udGVudDogJycsXG5cdFx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFtdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0ZWxlbWV0cnlNb2RlSWQ6ICdjdXN0b20nLFxuXHRcdFx0XHRhcHBseUNvZGVCbG9ja1N1Z2dlc3Rpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwZXJtaXNzaW9uTGV2ZWw6IHVuZGVmaW5lZCxcblx0XHRcdH0gOiB7XG5cdFx0XHRcdGtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdFx0aXNCdWlsdGluOiB0cnVlLFxuXHRcdFx0XHRtb2RlSW5zdHJ1Y3Rpb25zOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRlbGVtZXRyeU1vZGVJZDogJ2FnZW50Jyxcblx0XHRcdFx0YXBwbHlDb2RlQmxvY2tTdWdnZXN0aW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGVybWlzc2lvbkxldmVsOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0YWdlbnRJZFNpbGVudDogY29udHJpYnV0aW9uPy50eXBlLFxuXHRcdFx0YXR0YWNoZWRDb250ZXh0LFxuXHRcdFx0YWdlbnRIb3N0U2Vzc2lvbkNvbmZpZzogdGhpcy5nZXRDcmVhdGVTZXNzaW9uQ29uZmlnKGNoYXRJZCksXG5cdFx0fTtcblxuXHRcdC8vIENoYXQgc2Vzc2lvbiBtb2RlbCB3YXMgYWxyZWFkeSBjcmVhdGVkIGJ5IGNyZWF0ZU5ld0NoYXQgYW5kXG5cdFx0Ly8gdGhlIHdpZGdldCB3YXMgb3BlbmVkIGJ5IHRoZSBtYW5hZ2VtZW50IHNlcnZpY2UuIExvYWQgc2Vzc2lvblxuXHRcdC8vIG1vZGVsIGFuZCBhcHBseSBzZWxlY3RlZCBtb2RlbC5cblx0XHRjb25zdCBtb2RlbFJlZiA9IGF3YWl0IHRoaXMuX2NoYXRTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKGNoYXRSZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0aWYgKG1vZGVsUmVmKSB7XG5cdFx0XHRpZiAoc2VsZWN0ZWRNb2RlbElkKSB7XG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlTW9kZWwgPSB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChzZWxlY3RlZE1vZGVsSWQpO1xuXHRcdFx0XHRpZiAobGFuZ3VhZ2VNb2RlbCkge1xuXHRcdFx0XHRcdG1vZGVsUmVmLm9iamVjdC5pbnB1dE1vZGVsLnNldFN0YXRlKHsgc2VsZWN0ZWRNb2RlbDogeyBpZGVudGlmaWVyOiBzZWxlY3RlZE1vZGVsSWQsIG1ldGFkYXRhOiBsYW5ndWFnZU1vZGVsIH0gfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChzZWxlY3RlZEFnZW50KSB7XG5cdFx0XHRcdC8vIFNlZWQgdGhlIGNoYXQgaW5wdXQncyBtb2RlIHdpdGggdGhlIHBpY2tlZCBjdXN0b20gYWdlbnQgc28gdGhlXG5cdFx0XHRcdC8vIGFnZW50IHBpY2tlciBzaG93cyB0aGUgc2VsZWN0aW9uIGltbWVkaWF0ZWx5LiBXaXRob3V0IHRoaXMgaXRcblx0XHRcdFx0Ly8gd291bGQgb25seSB1cGRhdGUgb25jZSB0aGUgaG9zdCBlY2hvZWQgYFNlc3Npb25BZ2VudENoYW5nZWRgXG5cdFx0XHRcdC8vIGJhY2sgYWZ0ZXIgdGhlIGZpcnN0IHR1cm4uXG5cdFx0XHRcdG1vZGVsUmVmLm9iamVjdC5pbnB1dE1vZGVsLnNldFN0YXRlKHsgbW9kZTogeyBpZDogc2VsZWN0ZWRBZ2VudC51cmksIGtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCB9IH0pO1xuXHRcdFx0fVxuXHRcdFx0bW9kZWxSZWYuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdC8vIENhcHR1cmUgZXhpc3Rpbmcgc2Vzc2lvbiBrZXlzIGJlZm9yZSBzZW5kaW5nIHNvIHdlIGNhbiBkZXRlY3QgdGhlIG5ld1xuXHRcdC8vIGJhY2tlbmQgc2Vzc2lvbi4gTXVzdCBiZSBjYXB0dXJlZCBiZWZvcmUgc2VuZFJlcXVlc3QgYmVjYXVzZSB0aGVcblx0XHQvLyBiYWNrZW5kIHNlc3Npb24gbWF5IGJlIGNyZWF0ZWQgZHVyaW5nIHRoZSBzZW5kIGFuZCBhcnJpdmUgdmlhXG5cdFx0Ly8gbm90aWZpY2F0aW9uIGJlZm9yZSBzZW5kUmVxdWVzdCByZXNvbHZlcy5cblx0XHR0aGlzLl9lbnN1cmVTZXNzaW9uQ2FjaGUoKTtcblx0XHRjb25zdCBleGlzdGluZ0tleXMgPSBuZXcgU2V0KHRoaXMuX3Nlc3Npb25DYWNoZS5rZXlzKCkpO1xuXHRcdC8vIFRoZSBlYWdlcmx5LWNyZWF0ZWQgc2Vzc2lvbiBtYXkgYWxyZWFkeSBiZSBjYWNoZWQgYmVmb3JlIGZpcnN0IHNlbmQuXG5cdFx0Ly8gVHJlYXQgdGhhdCByYXcgaWQgYXMgdGhlIHNlc3Npb24gd2UgYXJlIHdhaXRpbmcgZm9yLCBub3Qgb2xkIHN0YXRlLlxuXHRcdGNvbnN0IG5ld1Nlc3Npb25SYXdJZCA9IGNoYXRSZXNvdXJjZS5wYXRoLnJlcGxhY2UoL15cXC8vLCAnJyk7XG5cdFx0ZXhpc3RpbmdLZXlzLmRlbGV0ZShuZXdTZXNzaW9uUmF3SWQpO1xuXHRcdC8vIFB1Ymxpc2ggdGhpcyBzZW5kJ3Mgb3duIGlkIHNvIGNvbmN1cnJlbnQgc2FtZS1zY2hlbWUgc2VuZHMgZG9uJ3Rcblx0XHQvLyBsYXRjaCBvbnRvIGl0IHZpYSB0aGVpciBub3ZlbHR5IGZhbGxiYWNrICh3aGljaCB3b3VsZCBzd2FwIHNlc3Npb25zKS5cblx0XHR0aGlzLl9pbkZsaWdodE5ld1Nlc3Npb25Pd25JZHMuYWRkKG5ld1Nlc3Npb25SYXdJZCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9jaGF0U2VydmljZS5zZW5kUmVxdWVzdChjaGF0UmVzb3VyY2UsIHF1ZXJ5LCBzZW5kT3B0aW9ucyk7XG5cdFx0aWYgKHJlc3VsdC5raW5kID09PSAncmVqZWN0ZWQnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFske3RoaXMuaWR9XSBzZW5kUmVxdWVzdCByZWplY3RlZDogJHtyZXN1bHQucmVhc29ufWApO1xuXHRcdH1cblxuXHRcdG5ld1Nlc3Npb24uc2V0U3RhdHVzKFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyk7XG5cdFx0bmV3U2Vzc2lvbi5jbGVhclNlbGVjdGVkTW9kZWxJZCgpO1xuXG5cdFx0Ly8gU2VlZCB0aGUgdGl0bGUgZnJvbSB0aGUgZmlyc3QgbGluZSBvZiB0aGUgcXVlcnkgc28gdGhlIG5ldy1zZXNzaW9uXG5cdFx0Ly8gdGFiIHNob3dzIHNvbWV0aGluZyBtZWFuaW5nZnVsIGltbWVkaWF0ZWx5LiBUaGlzIHNrZWxldG9uIGlzIHJlcGxhY2VkXG5cdFx0Ly8gYnkgdGhlIGNvbW1pdHRlZCBBZ2VudEhvc3RTZXNzaW9uIG9uY2UgaXQgYXJyaXZlcy5cblx0XHRuZXdTZXNzaW9uLnNldFRpdGxlKHF1ZXJ5LnNwbGl0KCdcXG4nKVswXS5zdWJzdHJpbmcoMCwgMTAwKSB8fCBuZXdTZXNzaW9uLnVudGl0bGVkVGl0bGUpO1xuXHRcdGNvbnN0IHNrZWxldG9uID0gbmV3U2Vzc2lvbi5zZXNzaW9uO1xuXHRcdHRoaXMuX3BlbmRpbmdTZXNzaW9uID0gc2tlbGV0b247XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtza2VsZXRvbl0sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbXSB9KTtcblxuXHRcdC8vIFJhdyBpZCBjbGFpbWVkIGJ5IF93YWl0Rm9yTmV3U2Vzc2lvbiBmb3IgdGhpcyBzZW5kIChyZWxlYXNlZCBpbiBmaW5hbGx5KS5cblx0XHRsZXQgY29tbWl0dGVkUmF3SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29tbWl0dGVkU2Vzc2lvbiA9IGF3YWl0IHRoaXMuX3dhaXRGb3JOZXdTZXNzaW9uKGV4aXN0aW5nS2V5cywgY2hhdFJlc291cmNlLnNjaGVtZSwgbmV3U2Vzc2lvblJhd0lkLCBuZXdTZXNzaW9uLmNhbmNlbGxhdGlvblRva2VuKTtcblx0XHRcdGlmIChjb21taXR0ZWRTZXNzaW9uKSB7XG5cdFx0XHRcdGNvbW1pdHRlZFJhd0lkID0gY29tbWl0dGVkU2Vzc2lvbi5yZXNvdXJjZS5wYXRoLnN1YnN0cmluZygxKTtcblx0XHRcdFx0dGhpcy5fcHJlc2VydmVOZXdTZXNzaW9uQ29uZmlnKG5ld1Nlc3Npb24sIGNvbW1pdHRlZFNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRcdFx0Ly8gQ2FycnkgdGhlIHBpY2tlZCBjdXN0b20gYWdlbnQgb250byB0aGUgY29tbWl0dGVkIHNlc3Npb24gYmVmb3JlXG5cdFx0XHRcdC8vIHRoZSByZXBsYWNlIGV2ZW50IHNvIHRoZSBhZ2VudCBwaWNrZXIgZG9lc24ndCByZXNldCB0byB0aGVcblx0XHRcdFx0Ly8gZGVmYXVsdCBvbmNlIHRoZSBhY3RpdmUgc2Vzc2lvbiBpcyBzd2FwcGVkICh0aGUgcGlja2VyIG1pcnJvcnNcblx0XHRcdFx0Ly8gYHNlc3Npb24ubW9kZWAsIHdoaWNoIGlzIG90aGVyd2lzZSBgdW5kZWZpbmVkYCBvbiB0aGUgZnJlc2hseVxuXHRcdFx0XHQvLyBjb21taXR0ZWQgYWRhcHRlcikuIFRoZSBob3N0IGFscmVhZHkgcmVjZWl2ZWQgdGhlIGFnZW50IHdpdGggdGhlXG5cdFx0XHRcdC8vIGZpcnN0IHR1cm4gKHNlZSBgc2VuZE9wdGlvbnMubW9kZUluZm9gKSwgc28gdXBkYXRlIG9ubHkgdGhlIGxvY2FsXG5cdFx0XHRcdC8vIG1vZGUgb2JzZXJ2YWJsZSBoZXJlIHJhdGhlciB0aGFuIHJlLW5vdGlmeWluZyBpdCB2aWEgYHNldEFnZW50YC5cblx0XHRcdFx0aWYgKHNlbGVjdGVkQWdlbnQpIHtcblx0XHRcdFx0XHRjb25zdCBjb21taXR0ZWRSYXdJZEZvckFnZW50ID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKGNvbW1pdHRlZFNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRcdFx0XHRjb25zdCBjb21taXR0ZWRBZGFwdGVyID0gY29tbWl0dGVkUmF3SWRGb3JBZ2VudCA/IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQoY29tbWl0dGVkUmF3SWRGb3JBZ2VudCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y29tbWl0dGVkQWRhcHRlcj8uc2V0Q2hhdEFnZW50KGNvbW1pdHRlZEFkYXB0ZXIucmVzb3VyY2UsIHNlbGVjdGVkQWdlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFNlc3Npb24gZ3JhZHVhdGVkOiByZWxlYXNlIHRoZSBlYWdlciBzdWJzY3JpcHRpb24gd2l0aG91dFxuXHRcdFx0XHQvLyBmaXJpbmcgYGRpc3Bvc2VTZXNzaW9uYC4gVGhlIHNlc3Npb24gaGFuZGxlciBoYXMgYWxyZWFkeVxuXHRcdFx0XHQvLyBhY3F1aXJlZCBpdHMgb3duIHN1YnNjcmlwdGlvbiAoY2hhdCB3aWRnZXQgd2FzIG9wZW5lZFxuXHRcdFx0XHQvLyBlYXJsaWVyKSwgc28gdGhlIHdpcmUtbGV2ZWwgcmVmY291bnQgc3RheXMgcG9zaXRpdmUuXG5cdFx0XHRcdG5ld1Nlc3Npb24uZ3JhZHVhdGUoKTtcblx0XHRcdFx0aWYgKHRoaXMuX25ld1Nlc3Npb25zLmdldChuZXdTZXNzaW9uLnNlc3Npb25JZCkgPT09IG5ld1Nlc3Npb24pIHtcblx0XHRcdFx0XHR0aGlzLl9uZXdTZXNzaW9ucy5kZWxldGVBbmREaXNwb3NlKG5ld1Nlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBDbGVhciB0aGUgcGVuZGluZyBzZXNzaW9uIGJlZm9yZSBmaXJpbmcgdGhlIHJlcGxhY2UgZXZlbnQgc29cblx0XHRcdFx0Ly8gdGhhdCBhbnkgc3luY2hyb25vdXMgbGlzdGVuZXIgY2FsbGluZyBnZXRTZXNzaW9ucygpIHNlZXMgb25seVxuXHRcdFx0XHQvLyB0aGUgY29tbWl0dGVkIHNlc3Npb24gYW5kIG5vdCBib3RoLlxuXHRcdFx0XHR0aGlzLl9wZW5kaW5nU2Vzc2lvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fb25EaWRSZXBsYWNlU2Vzc2lvbi5maXJlKHsgZnJvbTogc2tlbGV0b24sIHRvOiBjb21taXR0ZWRTZXNzaW9uIH0pO1xuXHRcdFx0XHRyZXR1cm4gY29tbWl0dGVkU2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIENvbm5lY3Rpb24gbG9zdCBvciB0aW1lb3V0IFx1MjAxNCBmYWxsIHRocm91Z2ggdG8gdGhlIGZhaWx1cmUgY2xlYW51cC5cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Ly8gUmVsZWFzZSB0aGUgY2xhaW0gc28gdW5yZWxhdGVkIGZ1dHVyZSBzZW5kcyBjYW4gbWF0Y2ggdGhpc1xuXHRcdFx0Ly8gc2Vzc2lvbiBpZiBuZWVkZWQ7IGNvbmN1cnJlbnQgaW4tZmxpZ2h0IHNlbmRzIGFscmVhZHkgY2FwdHVyZWRcblx0XHRcdC8vIHRoZWlyIGBleGlzdGluZ0tleXNgIGFuZCB3b24ndCByZXRyb2FjdGl2ZWx5IG1hdGNoIGl0LlxuXHRcdFx0aWYgKGNvbW1pdHRlZFJhd0lkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fY29tbWl0dGluZ1Nlc3Npb25SYXdJZHMuZGVsZXRlKGNvbW1pdHRlZFJhd0lkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2luRmxpZ2h0TmV3U2Vzc2lvbk93bklkcy5kZWxldGUobmV3U2Vzc2lvblJhd0lkKTtcblx0XHRcdC8vIERlZmVuc2l2ZSBjbGVhcjogY292ZXJzIHRoZSBmYWlsdXJlIHBhdGggd2hlcmUgdGhlIHRyeSBibG9ja1xuXHRcdFx0Ly8gbmV2ZXIgcmVhY2hlZCB0aGUgZXhwbGljaXQgY2xlYXIgYWJvdmUuXG5cdFx0XHR0aGlzLl9wZW5kaW5nU2Vzc2lvbiA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBPbiBmYWlsdXJlOiBkcm9wIHRoZSBlYWdlciBzdWJzY3JpcHRpb24gd2l0aG91dCBmaXJpbmdcblx0XHQvLyBgZGlzcG9zZVNlc3Npb25gLiBUaGUgc2VydmVyLXNpZGUgZW1wdHktc2Vzc2lvbiBHQyB3aWxsIGNsZWFuIHVwXG5cdFx0Ly8gdGhlIHByb3Zpc2lvbmFsIHNlc3Npb24gaWYgaXQgcmVtYWluczsgd2UgbGVhbiBvbiB0aGUgR0MgcmF0aGVyXG5cdFx0Ly8gdGhhbiByaXNraW5nIGEgZG91YmxlLWRpc3Bvc2UgcmFjZSBvbiB0cmFuc2llbnQgZmFpbHVyZXMuXG5cdFx0bmV3U2Vzc2lvbi5ncmFkdWF0ZSgpO1xuXHRcdGlmICh0aGlzLl9uZXdTZXNzaW9ucy5nZXQobmV3U2Vzc2lvbi5zZXNzaW9uSWQpID09PSBuZXdTZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9uZXdTZXNzaW9ucy5kZWxldGVBbmREaXNwb3NlKG5ld1Nlc3Npb24uc2Vzc2lvbklkKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbc2tlbGV0b25dLCBjaGFuZ2VkOiBbXSB9KTtcblx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ3Nlc3Npb25Ob3RDb21taXR0ZWQnLCBcIkFnZW50IGhvc3Qgc2Vzc2lvbiB3YXMgbm90IGNvbW1pdHRlZC5cIikpO1xuXHR9XG5cblx0LyoqIExvY2FsaXplZCBlcnJvciBtZXNzYWdlIHdoZW4gc2VuZFJlcXVlc3QgaXMgaW52b2tlZCB3aXRob3V0IGEgY29ubmVjdGlvbi4gU3ViY2xhc3NlcyBjYW4gb3ZlcnJpZGUuICovXG5cdHByb3RlY3RlZCBfbm90Q29ubmVjdGVkU2VuZEVycm9yTWVzc2FnZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnbm90Q29ubmVjdGVkU2VuZCcsIFwiQ2Fubm90IHNlbmQgcmVxdWVzdDogbm90IGNvbm5lY3RlZCB0byBhZ2VudCBob3N0LlwiKTtcblx0fVxuXG5cdC8vIC0tIFNlc3Npb24gY29uZmlnIHBsdW1iaW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBXaGVuIGEgc2Vzc2lvbiB0cmFuc2l0aW9ucyBmcm9tIHVudGl0bGVkIChuZXcpIHRvIGNvbW1pdHRlZCAocnVubmluZyksXG5cdCAqIGNhcnJ5IG92ZXIgdGhlIGZ1bGwgcmVzb2x2ZWQgY29uZmlnIChzY2hlbWEgKyB2YWx1ZXMpIHNvIGNvbnN1bWVycyBsaWtlXG5cdCAqIHRoZSBzZXNzaW9uLXNldHRpbmdzIEpTT05DIGVkaXRvciBjYW4gcm91bmQtdHJpcCBub24tbXV0YWJsZSB2YWx1ZXNcblx0ICogKGBpc29sYXRpb25gLCBgYnJhbmNoYCwgXHUyMDI2KSB0aHJvdWdoIGEgcmVwbGFjZSBkaXNwYXRjaC4gTXV0YWJsZS12cy1yZWFkb25seVxuXHQgKiBiZWhhdmlvciBpcyBzdGlsbCBkcml2ZW4gb2ZmIHRoZSBwZXItcHJvcGVydHkgYHNlc3Npb25NdXRhYmxlYCBmbGFnLlxuXHQgKi9cblx0cHJpdmF0ZSBfcHJlc2VydmVOZXdTZXNzaW9uQ29uZmlnKG5ld1Nlc3Npb246IE5ld1Nlc3Npb24sIGNvbW1pdHRlZFNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3U2Vzc2lvbi5nZXRDb25maWcoKTtcblx0XHRpZiAoY29uZmlnICYmIE9iamVjdC5rZXlzKGNvbmZpZy5zY2hlbWEucHJvcGVydGllcykubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fcnVubmluZ1Nlc3Npb25Db25maWdzLnNldChjb21taXR0ZWRTZXNzaW9uSWQsIHtcblx0XHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7IC4uLmNvbmZpZy5zY2hlbWEucHJvcGVydGllcyB9IH0sXG5cdFx0XHRcdHZhbHVlczogeyAuLi5jb25maWcudmFsdWVzIH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9hcHBseVdvcmt0cmVlSXNvbGF0aW9uKGNvbW1pdHRlZFNlc3Npb25JZCwgY29uZmlnPy52YWx1ZXMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9yYXdJZEZyb21DaGF0SWQoY2hhdElkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHByZWZpeCA9IGAke3RoaXMuaWR9OmA7XG5cdFx0Y29uc3QgcmVzb3VyY2VTdHIgPSBjaGF0SWQuc3RhcnRzV2l0aChwcmVmaXgpID8gY2hhdElkLnN1YnN0cmluZyhwcmVmaXgubGVuZ3RoKSA6IGNoYXRJZDtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIFVSSS5wYXJzZShyZXNvdXJjZVN0cikucGF0aC5zdWJzdHJpbmcoMSkgfHwgdW5kZWZpbmVkO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hY3RpdmVDaGF0UmVzb3VyY2Uoc2Vzc2lvbjogQWdlbnRIb3N0U2Vzc2lvbkFkYXB0ZXIpOiBVUkkge1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRyZXR1cm4gYWN0aXZlU2Vzc2lvbj8uc2Vzc2lvbklkID09PSBzZXNzaW9uLnNlc3Npb25JZCA/IGFjdGl2ZVNlc3Npb24uYWN0aXZlQ2hhdC5nZXQoKS5yZXNvdXJjZSA6IHNlc3Npb24ucmVzb3VyY2U7XG5cdH1cblxuXHQvLyAtLSBMYXp5IHNlc3Npb24tc3RhdGUgc3Vic2NyaXB0aW9uIHNlZWRpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogSWRsZSB3aW5kb3cgYmVmb3JlIGEgbGF6aWx5LWNyZWF0ZWQgc2Vzc2lvbi1zdGF0ZSBzdWJzY3JpcHRpb24gaXNcblx0ICogcmVsZWFzZWQuIEVhY2ggY2FsbCB0byB7QGxpbmsgX2tlZXBTZXNzaW9uU3RhdGVBbGl2ZX0gcmVzZXRzIHRoZSB0aW1lci5cblx0ICogTG9uZyBlbm91Z2ggdG8gYWJzb3JiIHRoZSBvcGVuXHUyMTkyY29uZmlnLXBpY2tlciBjaHVybiB3aGlsZSBhIHNlc3Npb24gdmlld1xuXHQgKiBpcyBhY3RpdmU7IHNob3J0IGVub3VnaCB0aGF0IGNsb3NlZCBzZXNzaW9ucyByZWxlYXNlIHdpdGhpbiBhIG1pbnV0ZSBvclxuXHQgKiBzbywgYWxsb3dpbmcgdGhlIGFnZW50IGhvc3QgdG8gZXZpY3QgdGhlaXIgY2FjaGVkIHJlc3RvcmVkIHN0YXRlLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VTU0lPTl9TVEFURV9TVUJTQ1JJUFRJT05fSURMRV9NUyA9IDMwXzAwMDtcblxuXHQvKipcblx0ICogUGluIHRoZSBzdGF0ZSBzdWJzY3JpcHRpb24gb2YgZXZlcnkgY3VycmVudGx5LXZpc2libGUgc2Vzc2lvbiAoc29cblx0ICogaG9zdC1kcml2ZW4gY2F0YWxvZyBjaGFuZ2VzIGZsb3cgaW50byBgY2FjaGVkLmNoYXRzYCB3aGlsZSBpdCBpcyBvblxuXHQgKiBzY3JlZW4pIGFuZCByZXN1bWUgdGhlIGlkbGUtcmVsZWFzZSB0aW1lciBmb3Igc2Vzc2lvbnMgdGhhdCBoYXZlIGxlZnQgdGhlXG5cdCAqIHZpZXdwb3J0LiBEcml2ZW4gcmVhY3RpdmVseSBieSB7QGxpbmsgSVNlc3Npb25zU2VydmljZS52aXNpYmxlU2Vzc2lvbnN9LlxuXHQgKi9cblx0cHJpdmF0ZSBfc3luY1Zpc2libGVTZXNzaW9uU3RhdGVQaW5zKHJlYWRlcjogSVJlYWRlcik6IHZvaWQge1xuXHRcdGNvbnN0IHZpc2libGUgPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UudmlzaWJsZVNlc3Npb25zLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBub3dWaXNpYmxlID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHZpc2libGUpIHtcblx0XHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgY2FjaGVkIG9mIHRoaXMuX3Nlc3Npb25DYWNoZS52YWx1ZXMoKSkge1xuXHRcdFx0XHRpZiAoaXNFcXVhbChjYWNoZWQucmVzb3VyY2UsIHNlc3Npb24ucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0bm93VmlzaWJsZS5hZGQoY2FjaGVkLnNlc3Npb25JZCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gUGluIHZpc2libGUgc2Vzc2lvbnM6IGhvbGQgdGhlIHN1YnNjcmlwdGlvbiBvcGVuLCBjYW5jZWxsaW5nIGFueSBwZW5kaW5nXG5cdFx0Ly8gaWRsZSByZWxlYXNlLiBBbGwgb3BlcmF0aW9ucyBhcmUgaWRlbXBvdGVudCwgc28gcmUtcnVubmluZyBwZXIgdGljayBhbHNvXG5cdFx0Ly8gcmVjb3ZlcnMgYSBzdWJzY3JpcHRpb24gdGhhdCBjb3VsZCBub3QgYmUgY3JlYXRlZCBlYXJsaWVyIChlLmcuIGEgcmVtb3RlXG5cdFx0Ly8gcHJvdmlkZXIgdGhhdCB3YXMgbW9tZW50YXJpbHkgZGlzY29ubmVjdGVkKS5cblx0XHRmb3IgKGNvbnN0IHNlc3Npb25JZCBvZiBub3dWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLl9waW5uZWRTZXNzaW9uU3RhdGVzLmFkZChzZXNzaW9uSWQpO1xuXHRcdFx0dGhpcy5fZW5zdXJlU2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9uKHNlc3Npb25JZCk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uU3RhdGVJZGxlVGltZXJzLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbklkKTtcblx0XHR9XG5cdFx0Ly8gVW5waW4gc2Vzc2lvbnMgdGhhdCBoYXZlIGxlZnQgdGhlIHZpZXdwb3J0OiByZXN1bWUgdGhlIGlkbGUtcmVsZWFzZVxuXHRcdC8vIHRpbWVyIHNvIHRoZSBhZ2VudCBob3N0IGNhbiBldmVudHVhbGx5IGV2aWN0IHRoZWlyIHJlc3RvcmVkIHN0YXRlLlxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbklkIG9mIFsuLi50aGlzLl9waW5uZWRTZXNzaW9uU3RhdGVzXSkge1xuXHRcdFx0aWYgKCFub3dWaXNpYmxlLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHRcdHRoaXMuX3Bpbm5lZFNlc3Npb25TdGF0ZXMuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0XHRcdHRoaXMuX2tlZXBTZXNzaW9uU3RhdGVBbGl2ZShzZXNzaW9uSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBCdW1wIHRoZSBpZGxlLXJlbGVhc2UgdGltZXIgZm9yIGBzZXNzaW9uSWRgIGFuZCBsYXppbHkgY3JlYXRlIHRoZVxuXHQgKiB1bmRlcmx5aW5nIHN1YnNjcmlwdGlvbiBpZiBuZWVkZWQuIENhbGxlZCBmcm9tIHF1ZXJ5IHBhdGhzXG5cdCAqICh7QGxpbmsgZ2V0U2Vzc2lvbkJ5UmVzb3VyY2V9LCB7QGxpbmsgZ2V0U2Vzc2lvbkNvbmZpZ30pIHRoYXQgZGVwZW5kIG9uXG5cdCAqIGBfcnVubmluZ1Nlc3Npb25Db25maWdzYCAvIGBfbWV0YWAgYmVpbmcgaW4gc3luYyBidXQgY2Fubm90IHRoZW1zZWx2ZXNcblx0ICogb3duIGEgc3Vic2NyaXB0aW9uIGhhbmRsZS5cblx0ICovXG5cdHByaXZhdGUgX2tlZXBTZXNzaW9uU3RhdGVBbGl2ZShzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2Vuc3VyZVNlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbihzZXNzaW9uSWQpO1xuXHRcdGlmICghdGhpcy5fc2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9ucy5oYXMoc2Vzc2lvbklkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBBIHZpc2libGUgc2Vzc2lvbidzIHN1YnNjcmlwdGlvbiBpcyBwaW5uZWQgb3BlbjsgbmV2ZXIgYXJtIHRoZSBpZGxlXG5cdFx0Ly8gcmVsZWFzZSB3aGlsZSBpdCBpcyBvbiBzY3JlZW4uXG5cdFx0aWYgKHRoaXMuX3Bpbm5lZFNlc3Npb25TdGF0ZXMuaGFzKHNlc3Npb25JZCkpIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25TdGF0ZUlkbGVUaW1lcnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uSWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zZXNzaW9uU3RhdGVJZGxlVGltZXJzLnNldChcblx0XHRcdHNlc3Npb25JZCxcblx0XHRcdGRpc3Bvc2FibGVUaW1lb3V0KFxuXHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fc2Vzc2lvblN0YXRlSWRsZVRpbWVycy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0dGhpcy5fc2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9ucy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25JZCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdEJhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLlNFU1NJT05fU1RBVEVfU1VCU0NSSVBUSU9OX0lETEVfTVMsXG5cdFx0XHQpLFxuXHRcdCk7XG5cdH1cblxuXHQvKipcblx0ICogTGF6aWx5IGFjcXVpcmUgYSBzZXNzaW9uLXN0YXRlIHN1YnNjcmlwdGlvbiBmb3IgYHNlc3Npb25JZGAgc28gdGhhdFxuXHQgKiBgX3J1bm5pbmdTZXNzaW9uQ29uZmlnc2AgaXMgc2VlZGVkIGZyb20gdGhlIEFIUCBgU2Vzc2lvblN0YXRlLmNvbmZpZ2Bcblx0ICogc25hcHNob3QuIFNhZmUgdG8gY2FsbCByZXBlYXRlZGx5IFx1MjAxNCBuby1vcCBvbmNlIGEgc3Vic2NyaXB0aW9uIGV4aXN0cy5cblx0ICpcblx0ICogVGhlIHN1YnNjcmlwdGlvbiBpcyByZWZlcmVuY2UtY291bnRlZCBieSB7QGxpbmsgSUFnZW50Q29ubmVjdGlvbi5nZXRTdWJzY3JpcHRpb259LFxuXHQgKiBzbyB3aGVuIHRoZSBzZXNzaW9uIGhhbmRsZXIgaXMgYWxzbyBzdWJzY3JpYmVkIChjaGF0IGNvbnRlbnQgb3BlbikgdGhpc1xuXHQgKiBzaGFyZXMgdGhlIGV4aXN0aW5nIHdpcmUgc3Vic2NyaXB0aW9uIHJhdGhlciB0aGFuIG9wZW5pbmcgYSBuZXcgb25lLlxuXHQgKi9cblx0cHJpdmF0ZSBfZW5zdXJlU2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9uKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Nlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbnMuaGFzKHNlc3Npb25JZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuY29ubmVjdGlvbjtcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIXJhd0lkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpO1xuXHRcdGlmICghY2FjaGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBjYWNoZWQuYmFja2VuZFVyaTtcblx0XHRjb25zdCByZWYgPSBjb25uZWN0aW9uLmdldFN1YnNjcmlwdGlvbihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgc2Vzc2lvblVyaSwgJ0Jhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLnN1bW1hcnknKTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQocmVmKTtcblx0XHRzdG9yZS5hZGQocmVmLm9iamVjdC5vbkRpZENoYW5nZShzdGF0ZSA9PiB7XG5cdFx0XHR0aGlzLl9hcHBseVNlc3Npb25TdGF0ZVVwZGF0ZShzZXNzaW9uSWQsIHN0YXRlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fc2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9ucy5zZXQoc2Vzc2lvbklkLCBzdG9yZSk7XG5cblx0XHRjb25zdCB2YWx1ZSA9IHJlZi5vYmplY3QudmFsdWU7XG5cdFx0aWYgKHZhbHVlICYmICEodmFsdWUgaW5zdGFuY2VvZiBFcnJvcikpIHtcblx0XHRcdHRoaXMuX2FwcGx5U2Vzc2lvblN0YXRlVXBkYXRlKHNlc3Npb25JZCwgdmFsdWUpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2h5ZHJhdGVBZ2VudEZyb21EcmFmdChjb25uZWN0aW9uLCBjYWNoZWQsIHNlc3Npb25JZCwgc2Vzc2lvblVyaSwgc3RvcmUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc3VtZSBoeWRyYXRpb246IHdoZW4gYSBzZXNzaW9uIGlzIChyZSlsb2FkZWQgYW5kIGl0cyBhZGFwdGVyIGhhcyBubyBhZ2VudFxuXHQgKiBzZWxlY3RlZCwgcmVzdG9yZSB0aGUgcGVyc2lzdGVkIHNlbGVjdGlvbiBmcm9tIHRoZSBkZWZhdWx0IGNoYXQnc1xuXHQgKiBgQ2hhdFN0YXRlLmRyYWZ0LmFnZW50YCBhbmQgbWlycm9yIGl0IG9udG8gYHNlc3Npb24ubW9kZWAgKHRoZSBwaWNrZXInc1xuXHQgKiBzb3VyY2Ugb2YgdHJ1dGgpLlxuXHQgKlxuXHQgKiBUaGUgYWdlbnQgaXMgcGVyc2lzdGVkIG9uIHRoZSBjaGF0IGNoYW5uZWwgXHUyMDE0IHRoZSBzZXNzaW9uIGNoYW5uZWxcblx0ICogKHtAbGluayBTZXNzaW9uU3RhdGV9KSBjYXJyaWVzIG5vIGRyYWZ0IFx1MjAxNCBzbyB3ZSBicmllZmx5IG9ic2VydmUgdGhlIGRlZmF1bHRcblx0ICogY2hhdCdzIHN0YXRlIHVudGlsIGl0cyBkcmFmdCBhZ2VudCBhcnJpdmVzLiBUaGUgc3Vic2NyaXB0aW9uIGlzIHNoYXJlZCBhbmRcblx0ICogcmVmLWNvdW50ZWQgd2l0aCB0aGUgY2hhdCBzZXNzaW9uIGhhbmRsZXIgKG5vIGV4dHJhIHdpcmUgY29zdCkgYW5kIGxpdmVzIGZvclxuXHQgKiB0aGUgc2Vzc2lvbi1zdGF0ZSBzdG9yZSdzIGxpZmV0aW1lLiBIeWRyYXRpb24gaXMgb25lLXNob3Q6IHRoZSBvYnNlcnZlclxuXHQgKiBzdG9wcyBhcyBzb29uIGFzIGBtb2RlYCBpcyBzZXQgXHUyMDE0IGJ5IHVzIGhlcmUsIG9yIGJ5IGEgY29uY3VycmVudCBncmFkdWF0aW9uXG5cdCAqIHNlZWQgb3IgdXNlciBwaWNrIChndWFyZGVkIGluc2lkZVxuXHQgKiB7QGxpbmsgQWdlbnRIb3N0U2Vzc2lvbkFkYXB0ZXIuaHlkcmF0ZVNlbGVjdGVkQWdlbnR9KSBcdTIwMTQgc28gaXQgbmVpdGhlciBsZWFrcyxcblx0ICogb3ZlcnJpZGVzIGEgbGF0ZXIgc2VsZWN0aW9uLCBub3Iga2VlcHMgcmUtcnVubmluZyBvbiBldmVyeSBjaGF0IHVwZGF0ZS5cblx0ICovXG5cdHByaXZhdGUgX2h5ZHJhdGVBZ2VudEZyb21EcmFmdChjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uLCBjYWNoZWQ6IEFnZW50SG9zdFNlc3Npb25BZGFwdGVyLCBzZXNzaW9uSWQ6IHN0cmluZywgc2Vzc2lvblVyaTogVVJJLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdFx0aWYgKGNhY2hlZC5tb2RlLmdldCgpICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGFzdERlZmF1bHRDaGF0ID0gdGhpcy5fbGFzdFNlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb25JZCk/LmRlZmF1bHRDaGF0O1xuXHRcdGNvbnN0IGRlZmF1bHRDaGF0VXJpID0gbGFzdERlZmF1bHRDaGF0ID8gVVJJLnBhcnNlKGxhc3REZWZhdWx0Q2hhdC50b1N0cmluZygpKSA6IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpKTtcblx0XHRjb25zdCBjaGF0UmVmID0gY29ubmVjdGlvbi5nZXRTdWJzY3JpcHRpb24oU3RhdGVDb21wb25lbnRzLkNoYXQsIGRlZmF1bHRDaGF0VXJpLCAnQmFzZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuZHJhZnRBZ2VudCcpO1xuXHRcdHN0b3JlLmFkZChjaGF0UmVmKTtcblx0XHRjb25zdCBsaXN0ZW5lciA9IHN0b3JlLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0Y29uc3QgdHJ5SHlkcmF0ZSA9ICgpID0+IHtcblx0XHRcdGlmIChjYWNoZWQubW9kZS5nZXQoKSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IGNoYXRTdGF0ZSA9IGNoYXRSZWYub2JqZWN0LnZhbHVlO1xuXHRcdFx0XHRjb25zdCBhZ2VudFVyaSA9IGNoYXRTdGF0ZSAmJiAhKGNoYXRTdGF0ZSBpbnN0YW5jZW9mIEVycm9yKSA/IGNoYXRTdGF0ZS5kcmFmdD8uYWdlbnQ/LnVyaSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGFnZW50VXJpKSB7XG5cdFx0XHRcdFx0Y2FjaGVkLmh5ZHJhdGVTZWxlY3RlZEFnZW50KGFnZW50VXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGNhY2hlZC5tb2RlLmdldCgpICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0bGlzdGVuZXIuY2xlYXIoKTsgLy8gaHlkcmF0aW9uIGlzIG9uZS1zaG90OyBzdG9wIG9ic2VydmluZ1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0bGlzdGVuZXIudmFsdWUgPSBjaGF0UmVmLm9iamVjdC5vbkRpZENoYW5nZSgoKSA9PiB0cnlIeWRyYXRlKCkpO1xuXHRcdHRyeUh5ZHJhdGUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGYW4tb3V0IGZvciBBSFAgYFNlc3Npb25TdGF0ZWAgc25hcHNob3RzOiBrZWVwcyBib3RoIHRoZSBydW5uaW5nXG5cdCAqIHNlc3Npb24gY29uZmlnIGFuZCB0aGUgY2FjaGVkIGFkYXB0ZXIncyBgX21ldGFgIChlLmcuIGdpdCBzdGF0ZSkgaW5cblx0ICogc3luYy5cblx0ICovXG5cdHByaXZhdGUgX2FwcGx5U2Vzc2lvblN0YXRlVXBkYXRlKHNlc3Npb25JZDogc3RyaW5nLCBzdGF0ZTogU2Vzc2lvblN0YXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLl9sYXN0U2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbklkKTtcblx0XHR0aGlzLl9sYXN0U2Vzc2lvblN0YXRlcy5zZXQoc2Vzc2lvbklkLCBzdGF0ZSk7XG5cdFx0Ly8gT25seSBmaXJlIHdoZW4gdGhlIGlucHV0cyB0byBgZ2V0Q3VzdG9tQWdlbnRzYCBhY3R1YWxseSBjaGFuZ2UuXG5cdFx0Ly8gYFNlc3Npb25TdGF0ZWAgdXBkYXRlcyBmaXJlIGZvciBldmVyeSB0dXJuLXN0YXR1cyAvIGFjdGl2aXR5IC8gbWV0YVxuXHRcdC8vIGNoYW5nZSB0b28gXHUyMDE0IGZpcmluZyBvbiBhbGwgb2YgdGhlbSBjYXVzZWQgZXhjZXNzaXZlIHBpY2tlclxuXHRcdC8vIHJlY29tcHV0ZXMgKGFuZCBhIGZlZWRiYWNrIGxvb3Agd2l0aCBgc2V0QWdlbnRgKS5cblx0XHRpZiAoIXByZXZpb3VzIHx8IGN1c3RvbWl6YXRpb25zQ2hhbmdlZChwcmV2aW91cywgc3RhdGUpKSB7XG5cdFx0XHR0aGlzLl9yZWNvbmNpbGVBZ2VudEZyb21TdGF0ZShzZXNzaW9uSWQsIHN0YXRlKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzLmZpcmUoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnMuZmlyZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9zZWVkUnVubmluZ0NvbmZpZ0Zyb21TdGF0ZShzZXNzaW9uSWQsIHN0YXRlKTtcblx0XHR0aGlzLl9hcHBseVNlc3Npb25NZXRhRnJvbVN0YXRlKHNlc3Npb25JZCwgc3RhdGUpO1xuXHRcdHRoaXMuX2FwcGx5Q2hhdENhdGFsb2dGcm9tU3RhdGUoc2Vzc2lvbklkLCBzdGF0ZSk7XG5cblx0XHRpZiAoIXByZXZpb3VzKSB7XG5cdFx0XHQvLyBUaGlzIGlzIHRoZSBmaXJzdCB0aW1lIHdlJ3ZlIHNlZW4gdGhpcyBzZXNzaW9uIGFuZCB0aGUgaW5pdGlhbFxuXHRcdFx0Ly8gbGlzdCBvZiBjaGFuZ2VzZXRzIGFyZSBpbmNsdWRlZCBpbiB0aGUgc3RhdGUsIHNvIHdlIHVzZSB0aGF0IHRvXG5cdFx0XHQvLyBpbml0aWFsaXplIHRoZSBjaGFuZ2VzZXQgY2F0YWxvZ3VlLnYgU3Vic2VxdWVudCB1cGRhdGVzIHdpbGwgYmVcblx0XHRcdC8vIGhhbmRsZWQgYnkgaGFuZGxpbmcgdGhlIEFjdGlvblR5cGUuU2Vzc2lvbkNoYW5nZXNldHNDaGFuZ2VkXG5cdFx0XHQvLyBhY3Rpb24uXG5cdFx0XHR0aGlzLl9hcHBseUNoYW5nZXNldHNGcm9tU3RhdGUoc2Vzc2lvbklkLCBzdGF0ZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNlZWQgdGhlIGNhY2hlZCBhZGFwdGVyJ3MgY2hhbmdlc2V0IGNhdGFsb2d1ZSBmcm9tIGFuIEFIUFxuXHQgKiB7QGxpbmsgU2Vzc2lvblN0YXRlfS4gVGhlIGNhdGFsb2d1ZSBvdGhlcndpc2Ugb25seSBmbG93cyBpbiB2aWEgdGhlIGxpdmVcblx0ICogYFNlc3Npb25DaGFuZ2VzZXRzQ2hhbmdlZGAgYWN0aW9uLCB3aGljaCB0aGUgaG9zdCBlbWl0cyBvbmx5IHdoZW4gZW50cmllc1xuXHQgKiBhcmUgYWRkZWQgb3IgcmVtb3ZlZC4gT24gcmVzdG9yZSAoZS5nLiBhZnRlciBhIHJlbG9hZCkgbm90aGluZyBtdXRhdGVzLCBzb1xuXHQgKiB0aGF0IGFjdGlvbiBuZXZlciBmaXJlcyBhbmQgdGhlIGNhdGFsb2d1ZSB3b3VsZCBzdGF5IGVtcHR5LiBUaGUgcmVzdG9yZWRcblx0ICogYFNlc3Npb25TdGF0ZWAgc25hcHNob3QgY2FycmllcyB0aGUgcGVyc2lzdGVkIGBjaGFuZ2VzZXRzYCwgc28gYXBwbHkgaXRcblx0ICogaGVyZSB0byBzdXJmYWNlIHRoZSBjYXRhbG9ndWUgaW1tZWRpYXRlbHkuXG5cdCAqL1xuXHRwcml2YXRlIF9hcHBseUNoYW5nZXNldHNGcm9tU3RhdGUoc2Vzc2lvbklkOiBzdHJpbmcsIHN0YXRlOiBTZXNzaW9uU3RhdGUpOiB2b2lkIHtcblx0XHRpZiAoc3RhdGUuY2hhbmdlc2V0cyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHNlc3Npb25JZCk7XG5cdFx0aWYgKCFyYXdJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKTtcblx0XHRpZiAoIWNhY2hlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjYWNoZWQudXBkYXRlQ2hhbmdlc2V0cyhzdGF0ZS5jaGFuZ2VzZXRzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWJhc2UgdGhlIGNhY2hlZCBydW5uaW5nIGFkYXB0ZXIncyBzZWxlY3RlZCBhZ2VudCBhZ2FpbnN0IHRoZSBob3N0J3MgYWdlbnRcblx0ICogbGlzdCBmcm9tIGFuIEFIUCB7QGxpbmsgU2Vzc2lvblN0YXRlfSwgYmVmb3JlIHRoZSBwaWNrZXIgaXMgbm90aWZpZWQuIEFcblx0ICogc2Vzc2lvbiB0aGF0IGhhcyBtb3ZlZCBpbnRvIGFuIGlzb2xhdGVkIHdvcmt0cmVlIGtlZXBzIGl0cyBzZWxlY3Rpb24gaW5zdGVhZFxuXHQgKiBvZiByZXNldHRpbmcgdG8gdGhlIGRlZmF1bHQgb25jZSB0aGUgaG9zdCBzdGFydHMgcmVwb3J0aW5nIHdvcmt0cmVlLXBhdGhlZFxuXHQgKiBhZ2VudHMuIFNlZSB7QGxpbmsgQWdlbnRIb3N0U2Vzc2lvbkFkYXB0ZXIucmVjb25jaWxlU2VsZWN0ZWRBZ2VudH0uXG5cdCAqL1xuXHRwcml2YXRlIF9yZWNvbmNpbGVBZ2VudEZyb21TdGF0ZShzZXNzaW9uSWQ6IHN0cmluZywgc3RhdGU6IFNlc3Npb25TdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHNlc3Npb25JZCk7XG5cdFx0aWYgKCFyYXdJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKTtcblx0XHRpZiAoIWNhY2hlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjYWNoZWQucmVjb25jaWxlU2VsZWN0ZWRBZ2VudChnZXRFZmZlY3RpdmVBZ2VudHMoc3RhdGUuY3VzdG9taXphdGlvbnMpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWNvbmNpbGUgdGhlIHBlci1jaGF0IGNhdGFsb2cgb2YgdGhlIGNhY2hlZCBydW5uaW5nIGFkYXB0ZXIgZnJvbSBhbiBBSFBcblx0ICoge0BsaW5rIFNlc3Npb25TdGF0ZX0uIFRoZSBhZGFwdGVyIGV4cG9zZXMgYGNoYXRzYC9gbWFpbkNoYXRgIGFzXG5cdCAqIG9ic2VydmFibGVzLCBzbyB1cGRhdGluZyB0aGVtIGhlcmUgaXMgZW5vdWdoIGZvciB0aGUgY2hhdC10YWIgVUkgdG9cblx0ICogcmUtcmVuZGVyIHJlYWN0aXZlbHkuXG5cdCAqL1xuXHRwcml2YXRlIF9hcHBseUNoYXRDYXRhbG9nRnJvbVN0YXRlKHNlc3Npb25JZDogc3RyaW5nLCBzdGF0ZTogU2Vzc2lvblN0YXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3SWQgPSB0aGlzLl9yYXdJZEZyb21DaGF0SWQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIXJhd0lkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpO1xuXHRcdGlmICghY2FjaGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNhY2hlZC5hcHBseUNoYXRDYXRhbG9nKHN0YXRlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBOZXdTZXNzaW9uIHZhcmlhbnQgb2Yge0BsaW5rIF9hcHBseVNlc3Npb25TdGF0ZVVwZGF0ZX06IHdyaXRlcyB0aGVcblx0ICogY3VzdG9taXphdGlvbnMgc3Vic2V0ICh0aGUgb25seSBvbmUgdGhlIGFnZW50IHBpY2tlciByZWFkcykgYW5kXG5cdCAqIGZpcmVzIGBfb25EaWRDaGFuZ2VDdXN0b21BZ2VudHNgIHdoZW4gaXQgY2hhbmdlcy4gU2tpcHNcblx0ICoge0BsaW5rIF9zZWVkUnVubmluZ0NvbmZpZ0Zyb21TdGF0ZX0gKE5ld1Nlc3Npb24gb3ducyBpdHMgb3duIGNvbmZpZ1xuXHQgKiB2aWEgYE5ld1Nlc3Npb24uX2NvbmZpZ2ApIGFuZCB7QGxpbmsgX2FwcGx5U2Vzc2lvbk1ldGFGcm9tU3RhdGV9XG5cdCAqICh3aGljaCBvbmx5IGFwcGxpZXMgdG8gY2FjaGVkIHJ1bm5pbmcgc2Vzc2lvbnMpLlxuXHQgKi9cblx0cHJpdmF0ZSBfaGFuZGxlTmV3U2Vzc2lvblN0YXRlVXBkYXRlKHNlc3Npb25JZDogc3RyaW5nLCBzdGF0ZTogU2Vzc2lvblN0YXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLl9sYXN0U2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbklkKTtcblx0XHR0aGlzLl9sYXN0U2Vzc2lvblN0YXRlcy5zZXQoc2Vzc2lvbklkLCBzdGF0ZSk7XG5cdFx0aWYgKCFwcmV2aW91cyB8fCBjdXN0b21pemF0aW9uc0NoYW5nZWQocHJldmlvdXMsIHN0YXRlKSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMuZmlyZSgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucy5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENsZWFudXAgc2VudGluZWwgZnJvbSB7QGxpbmsgTmV3U2Vzc2lvbi5kaXNwb3NlfTogZHJvcHMgdGhlIGNhY2hlZFxuXHQgKiBgX2xhc3RTZXNzaW9uU3RhdGVzYCBlbnRyeSB0aGUgbmV3IHNlc3Npb24gY29udHJpYnV0ZWQuIEZpcmVzXG5cdCAqIGBfb25EaWRDaGFuZ2VDdXN0b21BZ2VudHNgIHNvIGFueSBvcGVuIHBpY2tlciByZS1yZWFkcyBhbmQgZmFsbHNcblx0ICogYmFjayB0byB0aGUgZW1wdHkgbGlzdCByYXRoZXIgdGhhbiByZW5kZXJpbmcgc3RhbGUgYWdlbnRzLlxuXHQgKi9cblx0cHJpdmF0ZSBfaGFuZGxlTmV3U2Vzc2lvblN0YXRlR29uZShzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9sYXN0U2Vzc2lvblN0YXRlcy5kZWxldGUoc2Vzc2lvbklkKSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMuZmlyZSgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucy5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlTZXNzaW9uTWV0YUZyb21TdGF0ZShzZXNzaW9uSWQ6IHN0cmluZywgc3RhdGU6IFNlc3Npb25TdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHNlc3Npb25JZCk7XG5cdFx0aWYgKCFyYXdJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKTtcblx0XHRpZiAoIWNhY2hlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChjYWNoZWQuc2V0TWV0YShzdGF0ZS5fbWV0YSkpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtjYWNoZWRdIH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTZWVkIHtAbGluayBfcnVubmluZ1Nlc3Npb25Db25maWdzfSBmcm9tIHRoZSBBSFAgYFNlc3Npb25TdGF0ZS5jb25maWdgXG5cdCAqIHNuYXBzaG90LiBLZWVwcyB0aGUgZnVsbCBzY2hlbWEgKyB2YWx1ZXMgKGluY2x1ZGluZyBub24tbXV0YWJsZSBvbmVzKVxuXHQgKiBzbyBjb25zdW1lcnMgbGlrZSB0aGUgSlNPTkMgc2V0dGluZ3MgZWRpdG9yIGNhbiByb3VuZC10cmlwIGFsbCB2YWx1ZXNcblx0ICogdGhyb3VnaCBhIHJlcGxhY2UgZGlzcGF0Y2guIE5vLW9wIGlmIHN0cnVjdHVyYWxseSBlcXVhbCB0byBhdm9pZCBzcHVyaW91c1xuXHQgKiBgb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnYCBmaXJlcy5cblx0ICovXG5cdHByaXZhdGUgX3NlZWRSdW5uaW5nQ29uZmlnRnJvbVN0YXRlKHNlc3Npb25JZDogc3RyaW5nLCBzdGF0ZTogU2Vzc2lvblN0YXRlKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGVDb25maWcgPSBzdGF0ZS5jb25maWc7XG5cdFx0aWYgKCFzdGF0ZUNvbmZpZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoT2JqZWN0LmtleXMoc3RhdGVDb25maWcuc2NoZW1hLnByb3BlcnRpZXMpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3J1bm5pbmdTZXNzaW9uQ29uZmlncy5nZXQoc2Vzc2lvbklkKTtcblx0XHRsZXQgc2VlZGVkOiBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdDtcblx0XHRpZiAoZXhpc3RpbmcgJiYgdGhpcy5fcnVubmluZ1Nlc3Npb25Db25maWdSZXNvbHZlU2VxLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHRjb25zdCB2YWx1ZXMgPSB7IC4uLmV4aXN0aW5nLnZhbHVlcyB9O1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoZXhpc3Rpbmcuc2NoZW1hLnByb3BlcnRpZXMpKSB7XG5cdFx0XHRcdGlmIChPYmplY3QuaGFzT3duKHN0YXRlQ29uZmlnLnZhbHVlcywga2V5KSkge1xuXHRcdFx0XHRcdHZhbHVlc1trZXldID0gc3RhdGVDb25maWcudmFsdWVzW2tleV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHNlZWRlZCA9IHtcblx0XHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7IC4uLmV4aXN0aW5nLnNjaGVtYS5wcm9wZXJ0aWVzIH0gfSxcblx0XHRcdFx0dmFsdWVzLFxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2VlZGVkID0ge1xuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHQuLi4oZXhpc3Rpbmc/LnNjaGVtYS5wcm9wZXJ0aWVzID8/IHt9KSxcblx0XHRcdFx0XHRcdC4uLnN0YXRlQ29uZmlnLnNjaGVtYS5wcm9wZXJ0aWVzLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHZhbHVlczoge1xuXHRcdFx0XHRcdC4uLihleGlzdGluZz8udmFsdWVzID8/IHt9KSxcblx0XHRcdFx0XHQuLi5zdGF0ZUNvbmZpZy52YWx1ZXMsXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRpZiAoZXhpc3RpbmcgJiYgcmVzb2x2ZWRDb25maWdzRXF1YWwoZXhpc3RpbmcsIHNlZWRlZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcnVubmluZ1Nlc3Npb25Db25maWdzLnNldChzZXNzaW9uSWQsIHNlZWRlZCk7XG5cdFx0dGhpcy5fYXBwbHlXb3JrdHJlZUlzb2xhdGlvbihzZXNzaW9uSWQsIHNlZWRlZC52YWx1ZXMpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZy5maXJlKHNlc3Npb25JZCk7XG5cdH1cblxuXHQvKiogTWlycm9ycyBhIHNlc3Npb24ncyBgaXNvbGF0aW9uYCBwaWNrIG9udG8gaXRzIGFkYXB0ZXIuIFNlZSB7QGxpbmsgSVNlc3Npb24ud29ya3RyZWVQZW5kaW5nfS4gKi9cblx0cHJpdmF0ZSBfYXBwbHlXb3JrdHJlZUlzb2xhdGlvbihzZXNzaW9uSWQ6IHN0cmluZywgdmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghaXNXb3JrdHJlZUlzb2xhdGlvbih2YWx1ZXMpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJhd0lkID0gdGhpcy5fcmF3SWRGcm9tQ2hhdElkKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgYWRhcHRlciA9IHJhd0lkID8gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChyYXdJZCkgOiB1bmRlZmluZWQ7XG5cdFx0YWRhcHRlcj8uc2V0V29ya3RyZWVJc29sYXRpb24odHJ1ZSk7XG5cdH1cblxuXHQvLyAtLSBTZXNzaW9uIGNhY2hlIG1hbmFnZW1lbnQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogT3B0IGluIHRvIHBlcnNpc3Rpbmcge0BsaW5rIF9zZXNzaW9uQ2FjaGV9IHNuYXBzaG90cyB1bmRlciBgc3RvcmFnZUtleWAuXG5cdCAqIFN1YmNsYXNzZXMgY2FsbCB0aGlzIGF0IHRoZSAqKmVuZCoqIG9mIHRoZWlyIGNvbnN0cnVjdG9yIFx1MjAxNCBvbmNlIHRoZVxuXHQgKiBpZGVudGl0eSBmaWVsZHMgdGhhdCB7QGxpbmsgY3JlYXRlQWRhcHRlcn0ve0BsaW5rIHJlc291cmNlU2NoZW1lRm9yUHJvdmlkZXJ9L1xuXHQgKiB7QGxpbmsgX2FkYXB0ZXJPcHRpb25zfSBkZXBlbmQgb24gYXJlIGluaXRpYWxpemVkIFx1MjAxNCBiZWNhdXNlIHRoZSBpbml0aWFsXG5cdCAqIGh5ZHJhdGlvbiBidWlsZHMgYWRhcHRlcnMuIFRoaXMgaXMgd2h5IHRoZSBiYXNlIGNhbm5vdCBhdXRvLWxvYWQgaW4gaXRzXG5cdCAqIG93biBjb25zdHJ1Y3Rvci4gUGVyc2lzdGVkIHN1bW1hcmllcyBhcmUgaHlkcmF0ZWQgaW50byB7QGxpbmsgX3Nlc3Npb25DYWNoZX1cblx0ICogaW1tZWRpYXRlbHkgc28ge0BsaW5rIGdldFNlc3Npb25zfSByZXR1cm5zIHRoZW0gYmVmb3JlIHRoZSBmaXJzdFxuXHQgKiBgbGlzdFNlc3Npb25zKClgIHJvdW5kLXRyaXAgcmVzb2x2ZXMuXG5cdCAqXG5cdCAqIGBsZWdhY3lTdG9yYWdlS2V5YCwgd2hlbiBnaXZlbiwgaXMgcmVtb3ZlZCBzbyBzdGFsZSBlbnRyaWVzIGFyZSBkaXNjYXJkZWQuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2VuYWJsZVNlc3Npb25DYWNoZVBlcnNpc3RlbmNlKHN0b3JhZ2VLZXk6IHN0cmluZywgbGVnYWN5U3RvcmFnZUtleT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChsZWdhY3lTdG9yYWdlS2V5KSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUobGVnYWN5U3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHR9XG5cdFx0dGhpcy5fc2Vzc2lvbkNhY2hlU3RvcmFnZUtleSA9IHN0b3JhZ2VLZXk7XG5cdFx0dGhpcy5fbG9hZENhY2hlZFNlc3Npb25zKCk7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB7QGxpbmsgX29uRGlkQ2hhbmdlU2Vzc2lvbnN9IGV2ZW50cyBzaG91bGQgdXBkYXRlIHRoZSBwZXJzaXN0ZW5jZVxuXHQgKiBib29ra2VlcGluZyAoe0BsaW5rIF9jYWNoZURpcnR5fSArIHtAbGluayBfbWV0YUJ5UmF3SWR9KS4gRGVmYXVsdCBgdHJ1ZWA7XG5cdCAqIHRoZSByZW1vdGUgcHJvdmlkZXIgb3ZlcnJpZGVzIHRoaXMgdG8gc3VzcGVuZCB0cmFja2luZyB3aGlsZSBpdHMgY2FjaGVkXG5cdCAqIHNlc3Npb25zIGFyZSB1bnB1Ymxpc2hlZCAob2ZmbGluZSksIHNvIHRoZSBvbi1kaXNrIHNuYXBzaG90IHN1cnZpdmVzLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9zaG91bGRUcmFja1Nlc3Npb25DYWNoZUNoYW5nZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKiogTG9hZCBwZXJzaXN0ZWQgc2Vzc2lvbiBzdW1tYXJpZXMgaW50byB7QGxpbmsgX3Nlc3Npb25DYWNoZX0uICovXG5cdHByaXZhdGUgX2xvYWRDYWNoZWRTZXNzaW9ucygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Nlc3Npb25DYWNoZVN0b3JhZ2VLZXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcGFyc2VkID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0T2JqZWN0KHRoaXMuX3Nlc3Npb25DYWNoZVN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHBhcnNlZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBwYXJzZWQgYXMgcmVhZG9ubHkgSVNlcmlhbGl6ZWRTZXNzaW9uTWV0YWRhdGFbXSkge1xuXHRcdFx0Y29uc3QgZGVzZXJpYWxpemVkID0gZGVzZXJpYWxpemVNZXRhZGF0YShlbnRyeSk7XG5cdFx0XHRpZiAoIWRlc2VyaWFsaXplZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1ldGEgPSB0aGlzLl9hZG9wdFNlc3Npb25NZXRhKGRlc2VyaWFsaXplZCk7XG5cdFx0XHRjb25zdCByYXdJZCA9IEFnZW50U2Vzc2lvbi5pZChtZXRhLnNlc3Npb24pO1xuXHRcdFx0aWYgKHRoaXMuX3Nlc3Npb25DYWNoZS5oYXMocmF3SWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5jcmVhdGVBZGFwdGVyKG1ldGEpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLnNldChyYXdJZCwgY2FjaGVkKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUGVyc2lzdCB0aGUgY3VycmVudCB7QGxpbmsgX3Nlc3Npb25DYWNoZX0gdG8gc3RvcmFnZSwgY2FwcGluZyBhdFxuXHQgKiB7QGxpbmsgQ0FDSEVEX1NFU1NJT05TX01BWF9QRVJfSE9TVH0gbW9zdC1yZWNlbnRseS1tb2RpZmllZCBlbnRyaWVzLlxuXHQgKiBNdXRhYmxlIGZpZWxkcyBhcmUgcmVhZCBmcm9tIGVhY2ggYWRhcHRlcidzIG9ic2VydmFibGVzIGFuZCBvdmVybGFpZCBvblxuXHQgKiB0b3Agb2YgdGhlIG9yaWdpbmFsIG1ldGFkYXRhIHNuYXBzaG90IGNhcHR1cmVkIGluIHtAbGluayBfbWV0YUJ5UmF3SWR9LlxuXHQgKi9cblx0cHJpdmF0ZSBfcGVyc2lzdENhY2hlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2Vzc2lvbkNhY2hlU3RvcmFnZUtleSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlbnRyaWVzOiBJU2VyaWFsaXplZFNlc3Npb25NZXRhZGF0YVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbcmF3SWQsIGFkYXB0ZXJdIG9mIHRoaXMuX3Nlc3Npb25DYWNoZSkge1xuXHRcdFx0Y29uc3QgYmFzZSA9IHRoaXMuX21ldGFCeVJhd0lkLmdldChyYXdJZCk7XG5cdFx0XHRpZiAoIWJhc2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRlbnRyaWVzLnB1c2goc2VyaWFsaXplTWV0YWRhdGEoe1xuXHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRzdW1tYXJ5OiBhZGFwdGVyLnRpdGxlLmdldCgpIHx8IGJhc2Uuc3VtbWFyeSxcblx0XHRcdFx0bW9kaWZpZWRUaW1lOiBhZGFwdGVyLnVwZGF0ZWRBdC5nZXQoKS5nZXRUaW1lKCksXG5cdFx0XHRcdHN0YXR1czogd2l0aFNlc3Npb25TdGF0dXNGbGFnKFxuXHRcdFx0XHRcdHdpdGhTZXNzaW9uU3RhdHVzRmxhZyhiYXNlLnN0YXR1cyA/PyBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSwgUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklzUmVhZCwgYWRhcHRlci5pc1JlYWQuZ2V0KCkpLFxuXHRcdFx0XHRcdFByb3RvY29sU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkLFxuXHRcdFx0XHRcdGFkYXB0ZXIuaXNBcmNoaXZlZC5nZXQoKSksXG5cdFx0XHRcdC8vIFRoZSBhZGFwdGVyJ3MgbGl2ZSBraW5kIHdpbnMgb3ZlciB0aGUgc25hcHNob3Q6IHNldmVyYWwgbWV0YWRhdGFcblx0XHRcdFx0Ly8gc291cmNlcyBvbWl0IGBfbWV0YWAsIGFuZCBwZXJzaXN0aW5nIGEgc3RhbGUgb25lIHdvdWxkIHJlc3VycmVjdFxuXHRcdFx0XHQvLyB0aGUgc2Vzc2lvbiBhcyBhIHdvcmtzcGFjZSByb290ZWQgYXQgdGhlIGhvc3QncyBzY3JhdGNoIGN3ZC5cblx0XHRcdFx0Li4uKGFkYXB0ZXIuaXNRdWlja0NoYXQuZ2V0KCkgPyB7IF9tZXRhOiB3aXRoU2Vzc2lvbldvcmtzcGFjZWxlc3MoYmFzZS5fbWV0YSwgdHJ1ZSkgfSA6IHt9KSxcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0aWYgKGVudHJpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUodGhpcy5fc2Vzc2lvbkNhY2hlU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZW50cmllcy5zb3J0KChhLCBiKSA9PiBiLm1vZGlmaWVkVGltZSAtIGEubW9kaWZpZWRUaW1lKTtcblx0XHRjb25zdCBsaW1pdGVkID0gZW50cmllcy5zbGljZSgwLCBDQUNIRURfU0VTU0lPTlNfTUFYX1BFUl9IT1NUKTtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZSh0aGlzLl9zZXNzaW9uQ2FjaGVTdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShsaW1pdGVkKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9lbnN1cmVTZXNzaW9uQ2FjaGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NhY2hlSW5pdGlhbGl6ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gYF9yZWZyZXNoU2Vzc2lvbnNgIG93bnMgYF9jYWNoZUluaXRpYWxpemVkYCBcdTIwMTQgaXQgZmxpcHMgaXQgdG8gYHRydWVgXG5cdFx0Ly8gb25seSBvbmNlIGBsaXN0U2Vzc2lvbnMoKWAgYWN0dWFsbHkgcmV0dXJucy4gQSBjYWxsIHRoYXQgcmFjZXNcblx0XHQvLyBiZWZvcmUgdGhlIGNvbm5lY3Rpb24vYXV0aCBpcyByZWFkeSB3aWxsIGZhaWwgYW5kIGFybSBhIHJldHJ5XG5cdFx0Ly8gcmF0aGVyIHRoYW4gcGVybWFuZW50bHkgcGlubmluZyBhbiBlbXB0eSBjYWNoZS4gRG9uJ3QgbGF1bmNoIGEgbmV3XG5cdFx0Ly8gcmVmcmVzaCB3aGlsZSBvbmUgaXMgYWxyZWFkeSBpbiBmbGlnaHQgb3IgYSBiYWNrb2ZmIHJldHJ5IGlzIGFscmVhZHlcblx0XHQvLyBzY2hlZHVsZWQgXHUyMDE0IG90aGVyd2lzZSBldmVyeSBzeW5jaHJvbm91cyBgZ2V0U2Vzc2lvbnMoKWAgZHVyaW5nIHRoZVxuXHRcdC8vIGZhaWx1cmUgd2luZG93IHdvdWxkIGhhbW1lciB0aGUgYWdlbnQvYXV0aCBwYXRoIGFuZCBieXBhc3MgdGhlXG5cdFx0Ly8gYmFja29mZi5cblx0XHRpZiAodGhpcy5fc2Vzc2lvblJlZnJlc2hJbkZsaWdodCB8fCB0aGlzLl9zZXNzaW9uUmVmcmVzaFJldHJ5LnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3JlZnJlc2hTZXNzaW9ucygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9yZWZyZXNoU2Vzc2lvbnMoYW5ub3VuY2VFeGlzdGluZ0FzQWRkZWQgPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLmNvbm5lY3Rpb247XG5cdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIENhbmNlbCBhbnkgcGVuZGluZyByZXRyeTsgdGhpcyBhdHRlbXB0IHN1cGVyc2VkZXMgaXQuXG5cdFx0dGhpcy5fc2Vzc2lvblJlZnJlc2hSZXRyeS5jbGVhcigpO1xuXHRcdHRoaXMuX3Nlc3Npb25SZWZyZXNoSW5GbGlnaHQgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGNvbm5lY3Rpb24ubGlzdFNlc3Npb25zKCk7XG5cdFx0XHQvLyBBIHN1Y2Nlc3NmdWwgcmV0dXJuIChldmVuIGFuIGVtcHR5IGxpc3QpIG1lYW5zIHRoZSBjYWNoZSBpc1xuXHRcdFx0Ly8gYXV0aG9yaXRhdGl2ZS4gTWFyayBpdCBpbml0aWFsaXplZCBhbmQgcmVzZXQgdGhlIGJhY2tvZmYuXG5cdFx0XHR0aGlzLl9jYWNoZUluaXRpYWxpemVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3Nlc3Npb25SZWZyZXNoUmV0cnlEZWxheSA9IEJhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLlNFU1NJT05fUkVGUkVTSF9SRVRSWV9NSU5fTVM7XG5cdFx0XHRjb25zdCBjdXJyZW50S2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Y29uc3QgbGlzdGVkQWdlbnRQcm92aWRlcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGNvbnN0IGFkZGVkOiBJU2Vzc2lvbltdID0gW107XG5cdFx0XHRjb25zdCBjaGFuZ2VkOiBJU2Vzc2lvbltdID0gW107XG5cblx0XHRcdGZvciAoY29uc3QgcmF3TWV0YSBvZiBzZXNzaW9ucykge1xuXHRcdFx0XHRjb25zdCBtZXRhID0gdGhpcy5fYWRvcHRTZXNzaW9uTWV0YShyYXdNZXRhKTtcblx0XHRcdFx0Y29uc3QgcmF3SWQgPSBBZ2VudFNlc3Npb24uaWQobWV0YS5zZXNzaW9uKTtcblx0XHRcdFx0Y3VycmVudEtleXMuYWRkKHJhd0lkKTtcblx0XHRcdFx0Y29uc3QgYWdlbnRQcm92aWRlciA9IEFnZW50U2Vzc2lvbi5wcm92aWRlcihtZXRhLnNlc3Npb24pO1xuXHRcdFx0XHRpZiAoYWdlbnRQcm92aWRlcikge1xuXHRcdFx0XHRcdGxpc3RlZEFnZW50UHJvdmlkZXJzLmFkZChhZ2VudFByb3ZpZGVyKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChyYXdJZCk7XG5cdFx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHRcdGlmIChhbm5vdW5jZUV4aXN0aW5nQXNBZGRlZCkge1xuXHRcdFx0XHRcdFx0YWRkZWQucHVzaChleGlzdGluZyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0aGlzLnVwZGF0ZUFkYXB0ZXIoZXhpc3RpbmcsIG1ldGEpKSB7XG5cdFx0XHRcdFx0XHRjaGFuZ2VkLnB1c2goZXhpc3RpbmcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLmNyZWF0ZUFkYXB0ZXIobWV0YSk7XG5cdFx0XHRcdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLnNldChyYXdJZCwgY2FjaGVkKTtcblx0XHRcdFx0XHRhZGRlZC5wdXNoKGNhY2hlZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVtb3ZlZDogSVNlc3Npb25bXSA9IFtdO1xuXHRcdFx0Ly8gU29tZSBob3N0cyBicmllZmx5IG9taXQgdGhlIGp1c3Qtc2VudCBlYWdlciBzZXNzaW9uIGZyb20gbGlzdFNlc3Npb25zLlxuXHRcdFx0Ly8gS2VlcCB0aGUgcGVuZGluZyBzZXNzaW9uIHZpc2libGUgdW50aWwgc2VuZFJlcXVlc3QgZ3JhZHVhdGVzIGl0LlxuXHRcdFx0Y29uc3QgcGVuZGluZ1Jhd0lkID0gdGhpcy5fcGVuZGluZ1Nlc3Npb24/LnJlc291cmNlLnBhdGgucmVwbGFjZSgvXlxcLy8sICcnKTtcblx0XHRcdC8vIFRoZSBob3N0IGFnZ3JlZ2F0ZXMgb25lIGxpc3RpbmcgYWNyb3NzIGFsbCBvZiBpdHMgYWdlbnRzLCBhbmQgYW5cblx0XHRcdC8vIGFnZW50IHRoYXQgY2Fubm90IGVudW1lcmF0ZSB5ZXQgKGl0cyBTREsgaXMgbm90IGRvd25sb2FkZWQpIGNhblxuXHRcdFx0Ly8gY29udHJpYnV0ZSBhbiBlbXB0eSBsaXN0IHJhdGhlciB0aGFuIGZhaWxpbmcuIFdoZW4gb3RoZXIgYWdlbnRzXG5cdFx0XHQvLyBkaWQgYW5zd2VyLCBhIG5hbWVzcGFjZSB3aXRoIG5vIHJvdyBhdCBhbGwgaXMgdGhlcmVmb3JlICp1bmtub3duKlxuXHRcdFx0Ly8gcmF0aGVyIHRoYW4gZW1wdHksIGFuZCBldmljdGluZyBpdCB3b3VsZCBiZSBhIHNpbGVudCBkYXRhIGxvc3MgXHUyMDE0XG5cdFx0XHQvLyBgcmVtb3ZlZGAgZGlzY2FyZHMgdGhlIHVzZXIncyBwaW5zIGFuZCBncm91cCBtZW1iZXJzaGlwLiBBIHdob2xseVxuXHRcdFx0Ly8gZW1wdHkgbGlzdGluZyBrZWVwcyB0aGUgYXV0aG9yaXRhdGl2ZS1lbXB0eSBjb250cmFjdCwgc2luY2UgYW5cblx0XHRcdC8vIGFnZW50IHRoYXQgY2Fubm90IGFuc3dlciBhdCBhbGwgcmVqZWN0cyAoYW5kIHdlIG5ldmVyIGdldCBoZXJlKS5cblx0XHRcdC8vIFJlYWwgZGVsZXRpb25zIHN0aWxsIGFycml2ZSB0aHJvdWdoIGBkZWxldGVTZXNzaW9uc2AgYW5kIHRoZVxuXHRcdFx0Ly8gYHNlc3Npb25SZW1vdmVkYCBub3RpZmljYXRpb24uXG5cdFx0XHRjb25zdCBldmljdFVubGlzdGVkQWdlbnRzID0gbGlzdGVkQWdlbnRQcm92aWRlcnMuc2l6ZSA9PT0gMDtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgY2FjaGVkXSBvZiB0aGlzLl9zZXNzaW9uQ2FjaGUpIHtcblx0XHRcdFx0aWYgKCFjdXJyZW50S2V5cy5oYXMoa2V5KSkge1xuXHRcdFx0XHRcdGlmIChrZXkgPT09IHBlbmRpbmdSYXdJZCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghZXZpY3RVbmxpc3RlZEFnZW50cyAmJiAhbGlzdGVkQWdlbnRQcm92aWRlcnMuaGFzKGNhY2hlZC5hZ2VudFByb3ZpZGVyKSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25DYWNoZS5kZWxldGUoa2V5KTtcblx0XHRcdFx0XHR0aGlzLl9ydW5uaW5nU2Vzc2lvbkNvbmZpZ3MuZGVsZXRlKGNhY2hlZC5zZXNzaW9uSWQpO1xuXHRcdFx0XHRcdHRoaXMuX3J1bm5pbmdTZXNzaW9uQ29uZmlnUmVzb2x2ZVNlcS5kZWxldGUoY2FjaGVkLnNlc3Npb25JZCk7XG5cdFx0XHRcdFx0cmVtb3ZlZC5wdXNoKGNhY2hlZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGFkZGVkLmxlbmd0aCA+IDAgfHwgcmVtb3ZlZC5sZW5ndGggPiAwIHx8IGNoYW5nZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZCwgcmVtb3ZlZCwgY2hhbmdlZCB9KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3N5bmNBY3RpdmVDbGllbnQoKTtcblx0XHRcdGZvciAoY29uc3QgY2FjaGVkIG9mIHJlbW92ZWQpIHtcblx0XHRcdFx0KGNhY2hlZCBhcyBBZ2VudEhvc3RTZXNzaW9uQWRhcHRlcikuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gVGhlIGNvbm5lY3Rpb24gLyBhZ2VudCBtYXkgbm90IGJlIHJlYWR5IHlldCBcdTIwMTQgZS5nLiB0aGUgYWdlbnRcblx0XHRcdC8vIHRocm93cyBgQUhQX0FVVEhfUkVRVUlSRURgIHVudGlsIGl0cyB0b2tlbiBpcyBlZmZlY3RpdmVcblx0XHRcdC8vIHNlcnZlci1zaWRlLCBvciB0aGVyZSdzIGEgdHJhbnNpZW50IG9mZmxpbmUvbmV0d29yayBlcnJvci4gV2Vcblx0XHRcdC8vIG11c3QgTk9UIG1hcmsgdGhlIGNhY2hlIGluaXRpYWxpemVkICh0aGF0IHdvdWxkIGNvbmZsYXRlIGFcblx0XHRcdC8vIGZhaWx1cmUgd2l0aCBhIGdlbnVpbmVseS1lbXB0eSBzdWNjZXNzIGFuZCBuZXZlciByZWNvdmVyKSwgYW5kXG5cdFx0XHQvLyB3ZSBkZWxpYmVyYXRlbHkgZG8gTk9UIHBvcCBhIHNpZ24taW4gZGlhbG9nIGp1c3QgdG8gcmVuZGVyIHRoZVxuXHRcdFx0Ly8gbGlzdC4gSW5zdGVhZCwgcmV0cnkgc2lsZW50bHkgaW4gdGhlIGJhY2tncm91bmQgd2l0aCBiYWNrb2ZmLlxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXJdIGxpc3RTZXNzaW9ucyBmYWlsZWQ7IHNjaGVkdWxpbmcgcmV0cnk6ICR7ZXJyfWApO1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVTZXNzaW9uUmVmcmVzaFJldHJ5KGFubm91bmNlRXhpc3RpbmdBc0FkZGVkKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fc2Vzc2lvblJlZnJlc2hJbkZsaWdodCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBcm0gYSBiYWNrb2ZmIHJldHJ5IG9mIHtAbGluayBfcmVmcmVzaFNlc3Npb25zfS4gVXNlZCBhZnRlciBhIGZhaWxlZFxuXHQgKiByZWZyZXNoIHNvIGEgdHJhbnNpZW50IHN0YXJ0dXAgZmFpbHVyZSBzZWxmLWhlYWxzIHdpdGhvdXQgcmVxdWlyaW5nIGFuXG5cdCAqIHVucmVsYXRlZCBBSFAgZXZlbnQgKGEgdHVybiBjb21wbGV0aW5nLCBhIHNlc3Npb24gYmVpbmcgYWRkZWQpIHRvIGZvcmNlXG5cdCAqIGEgcmUtZmV0Y2guIENhbmNlbGxlZCBvbiB0aGUgbmV4dCBzdWNjZXNzZnVsIHJlZnJlc2guXG5cdCAqL1xuXHRwcml2YXRlIF9zY2hlZHVsZVNlc3Npb25SZWZyZXNoUmV0cnkoYW5ub3VuY2VFeGlzdGluZ0FzQWRkZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBkZWxheSA9IHRoaXMuX3Nlc3Npb25SZWZyZXNoUmV0cnlEZWxheTtcblx0XHR0aGlzLl9zZXNzaW9uUmVmcmVzaFJldHJ5RGVsYXkgPSBNYXRoLm1pbihkZWxheSAqIDIsIEJhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLlNFU1NJT05fUkVGUkVTSF9SRVRSWV9NQVhfTVMpO1xuXHRcdHRoaXMuX3Nlc3Npb25SZWZyZXNoUmV0cnkudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZWZyZXNoU2Vzc2lvbnMoYW5ub3VuY2VFeGlzdGluZ0FzQWRkZWQpO1xuXHRcdH0sIGRlbGF5KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYW5jZWwgYW55IHBlbmRpbmcgc2Vzc2lvbi1yZWZyZXNoIHJldHJ5IGFuZCByZXNldCB0aGUgYmFja29mZi4gQ2FsbGVkXG5cdCAqIGJ5IHN1YmNsYXNzZXMgd2hlbiB0aGUgY29ubmVjdGlvbiBnb2VzIGF3YXkgKHRoZSBzdGFsZSB0aW1lciB3b3VsZFxuXHQgKiBvdGhlcndpc2UgZmlyZSBhZ2FpbnN0IGEgZGVhZCBjb25uZWN0aW9uIGFuZCBuby1vcCkuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2NhbmNlbFNlc3Npb25SZWZyZXNoUmV0cnkoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvblJlZnJlc2hSZXRyeS5jbGVhcigpO1xuXHRcdHRoaXMuX3Nlc3Npb25SZWZyZXNoUmV0cnlEZWxheSA9IEJhc2VBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLlNFU1NJT05fUkVGUkVTSF9SRVRSWV9NSU5fTVM7XG5cdH1cblxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSBmcmVzaGx5LWNvbW1pdHRlZCBiYWNrZW5kIHNlc3Npb24gZm9yIGFuIGluLWZsaWdodCBzZW5kLlxuXHQgKlxuXHQgKiBUaGUgbG9jYWwgYWdlbnQgaG9zdCBydW5zIGEgc2luZ2xlIHByb3ZpZGVyIHdob3NlIHNlc3Npb24gY2FjaGUgaG9sZHNcblx0ICogKipldmVyeSoqIGFnZW50LWhvc3Qgc2Vzc2lvbiB0eXBlIChjb2RleCwgY2xhdWRlLCBjb3BpbG90LCBcdTIwMjYpLiBBIHNlbmRcblx0ICogdGhlcmVmb3JlIGhhcyB0byBpZGVudGlmeSAqaXRzIG93biogbmV3IHNlc3Npb24gYnkgYm90aCBub3ZlbHR5IChhIHJhdyBpZFxuXHQgKiBub3QgcHJlc2VudCBiZWZvcmUgdGhlIHNlbmQpICoqYW5kKiogdHlwZTogYGV4cGVjdGVkU2NoZW1lYCBpcyB0aGVcblx0ICogYGNoYXRSZXNvdXJjZWAgc2NoZW1lIChlLmcuIGBhZ2VudC1ob3N0LWNvZGV4YCksIHNvIGEgc2Vzc2lvbiBvZiBhbm90aGVyXG5cdCAqIHR5cGUgdGhhdCBoYXBwZW5zIHRvIGFwcGVhciBtaWQtc2VuZCBcdTIwMTQgYSBzbG93IGNvZGV4IHNlbmQgcmFjaW5nIGFnYWluc3QgYVxuXHQgKiByZXN0b3JlZCBjbGF1ZGUgc2Vzc2lvbiwgc2F5IFx1MjAxNCBpcyBuZXZlciBtaXN0YWtlbiBmb3IgdGhpcyBzZW5kJ3MgY29tbWl0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfd2FpdEZvck5ld1Nlc3Npb24oZXhpc3RpbmdLZXlzOiBTZXQ8c3RyaW5nPiwgZXhwZWN0ZWRTY2hlbWU6IHN0cmluZywgb3duUmF3SWQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIEEgY2FuZGlkYXRlIGJhY2tlbmQgc2Vzc2lvbiBjb21taXRzIFRISVMgc2VuZCB3aGVuIGl0IGlzIHVuY2xhaW1lZCxcblx0XHQvLyBvZiB0aGUgZXhwZWN0ZWQgdHlwZSwgYW5kIGVpdGhlciAoYSkgY2FycmllcyB0aGlzIHNlbmQncyBvd24gaWQgXHUyMDE0IHRoZVxuXHRcdC8vIGVhZ2VyL2NvbW1pdHRlZCBpZCBpcyBwcmVzZXJ2ZWQsIHNvIHRoaXMgaXMgdGhlIGV4YWN0IG1hdGNoIFx1MjAxNCBvclxuXHRcdC8vIChiKSBpcyBhIG5vdmVsIHNlc3Npb24gdGhhdCBpcyBub3QgYW5vdGhlciBpbi1mbGlnaHQgc2VuZCdzIG93blxuXHRcdC8vIHNlc3Npb24gKHRoZSBub3ZlbHR5IGZhbGxiYWNrIGNvdmVycyBiYWNrZW5kcyB0aGF0IGFzc2lnbiBhIGZyZXNoXG5cdFx0Ly8gaWQsIHdpdGhvdXQgbGV0dGluZyB0d28gY29uY3VycmVudCBzYW1lLXNjaGVtZSBzZW5kcyBzd2FwIHNlc3Npb25zKS5cblx0XHRjb25zdCBtYXRjaGVzID0gKHJhd0lkOiBzdHJpbmcsIHNjaGVtZTogc3RyaW5nKTogYm9vbGVhbiA9PiB7XG5cdFx0XHRpZiAoc2NoZW1lICE9PSBleHBlY3RlZFNjaGVtZSB8fCB0aGlzLl9jb21taXR0aW5nU2Vzc2lvblJhd0lkcy5oYXMocmF3SWQpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChyYXdJZCA9PT0gb3duUmF3SWQpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gIWV4aXN0aW5nS2V5cy5oYXMocmF3SWQpICYmICF0aGlzLl9pbkZsaWdodE5ld1Nlc3Npb25Pd25JZHMuaGFzKHJhd0lkKTtcblx0XHR9O1xuXG5cdFx0YXdhaXQgdGhpcy5fcmVmcmVzaFNlc3Npb25zKCk7XG5cdFx0Ly8gUHJlZmVyIHRoaXMgc2VuZCdzIG93biBpZDsgZmFsbCBiYWNrIHRvIGFueSBhY2NlcHRhYmxlIG5vdmVsIHNlc3Npb24uXG5cdFx0Y29uc3Qgc2NhbiA9ICgpOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRsZXQgZmFsbGJhY2s6IElTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChjb25zdCBjYWNoZWQgb2YgdGhpcy5fc2Vzc2lvbkNhY2hlLnZhbHVlcygpKSB7XG5cdFx0XHRcdGNvbnN0IHJhd0lkID0gY2FjaGVkLnJlc291cmNlLnBhdGguc3Vic3RyaW5nKDEpO1xuXHRcdFx0XHRpZiAoIW1hdGNoZXMocmF3SWQsIGNhY2hlZC5yZXNvdXJjZS5zY2hlbWUpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHJhd0lkID09PSBvd25SYXdJZCkge1xuXHRcdFx0XHRcdHJldHVybiBjYWNoZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZmFsbGJhY2sgPz89IGNhY2hlZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxsYmFjaztcblx0XHR9O1xuXHRcdGNvbnN0IGltbWVkaWF0ZSA9IHNjYW4oKTtcblx0XHRpZiAoaW1tZWRpYXRlKSB7XG5cdFx0XHR0aGlzLl9jb21taXR0aW5nU2Vzc2lvblJhd0lkcy5hZGQoaW1tZWRpYXRlLnJlc291cmNlLnBhdGguc3Vic3RyaW5nKDEpKTtcblx0XHRcdHJldHVybiBpbW1lZGlhdGU7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2FpdERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uUHJvbWlzZSA9IG5ldyBQcm9taXNlPElTZXNzaW9uIHwgdW5kZWZpbmVkPigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0XHR3YWl0RGlzcG9zYWJsZXMuYWRkKHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZXZlbnQoZSA9PiB7XG5cdFx0XHRcdFx0Ly8gUHJlZmVyIHRoaXMgc2VuZCdzIG93biBpZCB3aXRoaW4gdGhlIGJhdGNoIGJlZm9yZSBmYWxsaW5nXG5cdFx0XHRcdFx0Ly8gYmFjayB0byBhbiBhY2NlcHRhYmxlIG5vdmVsIHNlc3Npb24uXG5cdFx0XHRcdFx0Y29uc3QgZXhhY3QgPSBlLmFkZGVkLmZpbmQocyA9PiBzLnJlc291cmNlLnBhdGguc3Vic3RyaW5nKDEpID09PSBvd25SYXdJZCAmJiBtYXRjaGVzKG93blJhd0lkLCBzLnJlc291cmNlLnNjaGVtZSkpO1xuXHRcdFx0XHRcdGNvbnN0IG5ld1Nlc3Npb24gPSBleGFjdCA/PyBlLmFkZGVkLmZpbmQocyA9PiBtYXRjaGVzKHMucmVzb3VyY2UucGF0aC5zdWJzdHJpbmcoMSksIHMucmVzb3VyY2Uuc2NoZW1lKSk7XG5cdFx0XHRcdFx0aWYgKG5ld1Nlc3Npb24pIHtcblx0XHRcdFx0XHRcdHRoaXMuX2NvbW1pdHRpbmdTZXNzaW9uUmF3SWRzLmFkZChuZXdTZXNzaW9uLnJlc291cmNlLnBhdGguc3Vic3RyaW5nKDEpKTtcblx0XHRcdFx0XHRcdHJlc29sdmUobmV3U2Vzc2lvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHdhaXREaXNwb3NhYmxlcy5hZGQodGhpcy5vbkNvbm5lY3Rpb25Mb3N0KCgpID0+IHJlc29sdmUodW5kZWZpbmVkKSkpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKHNlc3Npb25Qcm9taXNlLCB0b2tlbik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHdhaXREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0gQUhQIG5vdGlmaWNhdGlvbiAvIGFjdGlvbiBoYW5kbGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIFdpcmUgQUhQIG5vdGlmaWNhdGlvbiBhbmQgYWN0aW9uIGxpc3RlbmVycyBvbiB0aGUgZ2l2ZW4gY29ubmVjdGlvbi5cblx0ICogU3ViY2xhc3NlcyBjYWxsIHRoaXMgZnJvbSB0aGVpciBjb25zdHJ1Y3RvciAobG9jYWwpIG9yIGBzZXRDb25uZWN0aW9uYFxuXHQgKiAocmVtb3RlKSwgcGFzc2luZyBhIHN0b3JlIHRoYXQgYm91bmRzIHRoZSBsaXN0ZW5lcnMnIGxpZmV0aW1lLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9hdHRhY2hDb25uZWN0aW9uTGlzdGVuZXJzKGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHRzdG9yZS5hZGQoY29ubmVjdGlvbi5vbkRpZE5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdGlmIChuLnR5cGUgPT09IE5vdGlmaWNhdGlvblR5cGUuU2Vzc2lvbkFkZGVkKSB7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZVNlc3Npb25BZGRlZChuLnN1bW1hcnkpO1xuXHRcdFx0fSBlbHNlIGlmIChuLnR5cGUgPT09IE5vdGlmaWNhdGlvblR5cGUuU2Vzc2lvblJlbW92ZWQpIHtcblx0XHRcdFx0dGhpcy5faGFuZGxlU2Vzc2lvblJlbW92ZWQobi5zZXNzaW9uKTtcblx0XHRcdH0gZWxzZSBpZiAobi50eXBlID09PSBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25TdW1tYXJ5Q2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVTZXNzaW9uU3VtbWFyeUNoYW5nZWQobi5zZXNzaW9uLCBuLmNoYW5nZXMpO1xuXHRcdFx0fSBlbHNlIGlmIChuLnR5cGUgPT09IE5vdGlmaWNhdGlvblR5cGUuUHJvZ3Jlc3MpIHtcblx0XHRcdFx0dGhpcy5fZG93bmxvYWRQcm9ncmVzcy5oYW5kbGVQcm9ncmVzcyhuKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRzdG9yZS5hZGQoY29ubmVjdGlvbi5vbkRpZEFjdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUgJiYgaXNDaGF0QWN0aW9uKGUuYWN0aW9uKSkge1xuXHRcdFx0XHR0aGlzLl9yZWZyZXNoU2Vzc2lvbnMoKTtcblx0XHRcdH0gZWxzZSBpZiAoZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkICYmIGlzU2Vzc2lvbkFjdGlvbihlLmFjdGlvbikpIHtcblx0XHRcdFx0dGhpcy5faGFuZGxlVGl0bGVDaGFuZ2VkKGUuY2hhbm5lbCwgZS5hY3Rpb24udGl0bGUpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25Jc0FyY2hpdmVkQ2hhbmdlZCAmJiBpc1Nlc3Npb25BY3Rpb24oZS5hY3Rpb24pKSB7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZUlzQXJjaGl2ZWRDaGFuZ2VkKGUuY2hhbm5lbCwgZS5hY3Rpb24uaXNBcmNoaXZlZCk7XG5cdFx0XHR9IGVsc2UgaWYgKGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbklzUmVhZENoYW5nZWQgJiYgaXNTZXNzaW9uQWN0aW9uKGUuYWN0aW9uKSkge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVJc1JlYWRDaGFuZ2VkKGUuY2hhbm5lbCwgZS5hY3Rpb24uaXNSZWFkKTtcblx0XHRcdH0gZWxzZSBpZiAoZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCAmJiBpc1Nlc3Npb25BY3Rpb24oZS5hY3Rpb24pKSB7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZUNvbmZpZ0NoYW5nZWQoZS5jaGFubmVsLCBlLmFjdGlvbi5jb25maWcsIGUuYWN0aW9uLnJlcGxhY2UgPT09IHRydWUpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DaGFuZ2VzZXRzQ2hhbmdlZCAmJiBpc1Nlc3Npb25BY3Rpb24oZS5hY3Rpb24pKSB7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZUNoYW5nZXNldHNDaGFuZ2VkKGUuY2hhbm5lbCwgZS5hY3Rpb24uY2hhbmdlc2V0cyk7XG5cdFx0XHR9IGVsc2UgaWYgKGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbk1ldGFDaGFuZ2VkICYmIGlzU2Vzc2lvbkFjdGlvbihlLmFjdGlvbikpIHtcblx0XHRcdFx0dGhpcy5faGFuZGxlU2Vzc2lvbk1ldGFDaGFuZ2VkKGUuY2hhbm5lbCwgZS5hY3Rpb24uX21ldGEpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVNlc3Npb25BZGRlZChzdW1tYXJ5OiBTZXNzaW9uU3VtbWFyeSk6IHZvaWQge1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJzID0gc3VtbWFyeS53b3JraW5nRGlyZWN0b3JpZXM/Lm1hcChkID0+IHRoaXMubWFwV29ya2luZ0RpcmVjdG9yeVVyaShVUkkucGFyc2UoZCkpKTtcblx0XHRjb25zdCByYXdNZXRhOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEgPSB7XG5cdFx0XHRzZXNzaW9uOiBVUkkucGFyc2Uoc3VtbWFyeS5yZXNvdXJjZSksXG5cdFx0XHRzdGFydFRpbWU6IERhdGUucGFyc2Uoc3VtbWFyeS5jcmVhdGVkQXQpLFxuXHRcdFx0bW9kaWZpZWRUaW1lOiBEYXRlLnBhcnNlKHN1bW1hcnkubW9kaWZpZWRBdCksXG5cdFx0XHRzdW1tYXJ5OiBzdW1tYXJ5LnRpdGxlLFxuXHRcdFx0YWN0aXZpdHk6IHN1bW1hcnkuYWN0aXZpdHksXG5cdFx0XHRzdGF0dXM6IHN1bW1hcnkuc3RhdHVzLFxuXHRcdFx0Li4uKHN1bW1hcnkucHJvamVjdCA/IHtcblx0XHRcdFx0cHJvamVjdDoge1xuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiBzdW1tYXJ5LnByb2plY3QuZGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0dXJpOiB0aGlzLm1hcFByb2plY3RVcmkoVVJJLnBhcnNlKHN1bW1hcnkucHJvamVjdC51cmkpKVxuXHRcdFx0XHR9XG5cdFx0XHR9IDoge30pLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlycyxcblx0XHRcdGNoYW5nZXM6IHN1bW1hcnkuY2hhbmdlcyxcblx0XHRcdC8vIENhcnJ5IGBfbWV0YWAgc28gYSBuZXcgYWRhcHRlciBzZWVkcyBpdHMgc2Vzc2lvbi1raW5kIGZyb20gaXQgYW5kIGFuXG5cdFx0XHQvLyBleGlzdGluZyBvbmUgY2FuIGJlIHByb21vdGVkIGJ5IGl0LlxuXHRcdFx0Li4uKHN1bW1hcnkuX21ldGEgIT09IHVuZGVmaW5lZCA/IHsgX21ldGE6IHN1bW1hcnkuX21ldGEgfSA6IHt9KSxcblx0XHR9O1xuXG5cdFx0Ly8gQWRvcHQgYmVmb3JlIGRlcml2aW5nIHRoZSBjYWNoZSBrZXkgc28gYSBob3N0IHRoYXQgYWRkcmVzc2VzIHNlc3Npb25zIHVuZGVyIGEgZGlmZmVyZW50XG5cdFx0Ly8gc2NoZW1lIHJvdXRlcyB0byB0aGUgYWdlbnQgcHJvdmlkZXIsIGFzIHRoZSByZWZyZXNoIGFuZCBwZXJzaXN0ZW5jZSBwYXRocyBkby5cblx0XHRjb25zdCBtZXRhID0gdGhpcy5fYWRvcHRTZXNzaW9uTWV0YShyYXdNZXRhKTtcblx0XHRjb25zdCByYXdJZCA9IEFnZW50U2Vzc2lvbi5pZChtZXRhLnNlc3Npb24pO1xuXG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdGlmICh0aGlzLnVwZGF0ZUFkYXB0ZXIoZXhpc3RpbmcsIG1ldGEpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtleGlzdGluZ10gfSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zeW5jQWN0aXZlQ2xpZW50KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5jcmVhdGVBZGFwdGVyKG1ldGEpO1xuXHRcdHRoaXMuX3Nlc3Npb25DYWNoZS5zZXQocmF3SWQsIGNhY2hlZCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtjYWNoZWRdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW10gfSk7XG5cdFx0dGhpcy5fc3luY0FjdGl2ZUNsaWVudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlU2Vzc2lvblJlbW92ZWQoc2Vzc2lvbjogVVJJIHwgc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3SWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChyYXdJZCk7XG5cdFx0aWYgKGNhY2hlZCkge1xuXHRcdFx0dGhpcy5fc2Vzc2lvbkNhY2hlLmRlbGV0ZShyYXdJZCk7XG5cdFx0XHR0aGlzLl9ydW5uaW5nU2Vzc2lvbkNvbmZpZ3MuZGVsZXRlKGNhY2hlZC5zZXNzaW9uSWQpO1xuXHRcdFx0dGhpcy5fcnVubmluZ1Nlc3Npb25Db25maWdSZXNvbHZlU2VxLmRlbGV0ZShjYWNoZWQuc2Vzc2lvbklkKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25TdGF0ZUlkbGVUaW1lcnMuZGVsZXRlQW5kRGlzcG9zZShjYWNoZWQuc2Vzc2lvbklkKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbnMuZGVsZXRlQW5kRGlzcG9zZShjYWNoZWQuc2Vzc2lvbklkKTtcblx0XHRcdHRoaXMuX2xhc3RTZXNzaW9uU3RhdGVzLmRlbGV0ZShjYWNoZWQuc2Vzc2lvbklkKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW2NhY2hlZF0sIGNoYW5nZWQ6IFtdIH0pO1xuXHRcdFx0Y2FjaGVkLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVUaXRsZUNoYW5nZWQoc2Vzc2lvbjogc3RyaW5nLCB0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3SWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChyYXdJZCk7XG5cdFx0aWYgKGNhY2hlZCkge1xuXHRcdFx0Y2FjaGVkLnRpdGxlLnNldCh0aXRsZSwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtjYWNoZWRdIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUlzQXJjaGl2ZWRDaGFuZ2VkKHNlc3Npb246IHN0cmluZywgaXNBcmNoaXZlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHJhd0lkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpO1xuXHRcdGlmIChjYWNoZWQpIHtcblx0XHRcdGNhY2hlZC5pc0FyY2hpdmVkLnNldChpc0FyY2hpdmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW2NhY2hlZF0gfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlSXNSZWFkQ2hhbmdlZChzZXNzaW9uOiBzdHJpbmcsIGlzUmVhZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHJhd0lkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpO1xuXHRcdGlmIChjYWNoZWQgJiYgY2FjaGVkLmlzUmVhZC5nZXQoKSAhPT0gaXNSZWFkKSB7XG5cdFx0XHRjYWNoZWQuaXNSZWFkLnNldChpc1JlYWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbY2FjaGVkXSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVTZXNzaW9uU3VtbWFyeUNoYW5nZWQoc2Vzc2lvbjogc3RyaW5nLCBjaGFuZ2VzOiBQYXJ0aWFsPFNlc3Npb25TdW1tYXJ5Pik6IHZvaWQge1xuXHRcdHRyYW5zYWN0aW9uKCh0eCkgPT4ge1xuXHRcdFx0Y29uc3QgcmF3SWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9zZXNzaW9uQ2FjaGUuZ2V0KHJhd0lkKTtcblx0XHRcdGlmICghY2FjaGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGRpZENoYW5nZSA9IGZhbHNlO1xuXG5cdFx0XHRpZiAoY2hhbmdlcy5zdGF0dXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCB1aVN0YXR1cyA9IG1hcFByb3RvY29sU3RhdHVzKGNoYW5nZXMuc3RhdHVzKTtcblx0XHRcdFx0aWYgKHVpU3RhdHVzICE9PSBjYWNoZWQuc3RhdHVzLmdldCgpKSB7XG5cdFx0XHRcdFx0Y2FjaGVkLnN0YXR1cy5zZXQodWlTdGF0dXMsIHR4KTtcblx0XHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaXNBcmNoaXZlZCA9ICEhKGNoYW5nZXMuc3RhdHVzICYgUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklzQXJjaGl2ZWQpO1xuXHRcdFx0XHRpZiAoaXNBcmNoaXZlZCAhPT0gY2FjaGVkLmlzQXJjaGl2ZWQuZ2V0KCkpIHtcblx0XHRcdFx0XHRjYWNoZWQuaXNBcmNoaXZlZC5zZXQoaXNBcmNoaXZlZCwgdHgpO1xuXHRcdFx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBpc1JlYWQgPSAhIShjaGFuZ2VzLnN0YXR1cyAmIFByb3RvY29sU2Vzc2lvblN0YXR1cy5Jc1JlYWQpO1xuXHRcdFx0XHRpZiAoaXNSZWFkICE9PSBjYWNoZWQuaXNSZWFkLmdldCgpKSB7XG5cdFx0XHRcdFx0Y2FjaGVkLmlzUmVhZC5zZXQoaXNSZWFkLCB0eCk7XG5cdFx0XHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2hhbmdlcy50aXRsZSAhPT0gdW5kZWZpbmVkICYmIGNoYW5nZXMudGl0bGUgIT09IGNhY2hlZC50aXRsZS5nZXQoKSkge1xuXHRcdFx0XHRjYWNoZWQudGl0bGUuc2V0KGNoYW5nZXMudGl0bGUsIHR4KTtcblx0XHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gYGNoYW5nZXMuY2hhbmdlc2AgY2FycmllcyB0aGUgY2hpcCBhZ2dyZWdhdGUuIFRoZSBjYXRhbG9ndWVcblx0XHRcdC8vIGl0c2VsZiAobGFiZWwgLyBVUkkgdGVtcGxhdGUgLyBgY2hhbmdlS2luZGApIGFycml2ZXMgdmlhIHRoZVxuXHRcdFx0Ly8gYFNlc3Npb25DaGFuZ2VzZXRzQ2hhbmdlZGAgYWN0aW9uLCBoYW5kbGVkIGJ5XG5cdFx0XHQvLyBgX2hhbmRsZUNoYW5nZXNldHNDaGFuZ2VkYC5cblx0XHRcdGlmIChjaGFuZ2VzLmNoYW5nZXMgIT09IHVuZGVmaW5lZCAmJiBjYWNoZWQuc2V0Q2hhbmdlc1N1bW1hcnkoY2hhbmdlcy5jaGFuZ2VzLCB0eCkpIHtcblx0XHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChjaGFuZ2VzLCAnYWN0aXZpdHknKSAmJiBjYWNoZWQuc2V0QWN0aXZpdHkoY2hhbmdlcy5hY3Rpdml0eSwgdHgpKSB7XG5cdFx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGFuZ2VzLl9tZXRhICE9PSB1bmRlZmluZWQgJiYgY2FjaGVkLnNldE1ldGEoY2hhbmdlcy5fbWV0YSwgdHgpKSB7XG5cdFx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChkaWRDaGFuZ2UpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW2NhY2hlZF0gfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVDb25maWdDaGFuZ2VkKHNlc3Npb246IHN0cmluZywgY29uZmlnOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgcmVwbGFjZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHJhd0lkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpO1xuXHRcdGlmICghY2FjaGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IGNhY2hlZC5zZXNzaW9uSWQ7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9ydW5uaW5nU2Vzc2lvbkNvbmZpZ3MuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHR0aGlzLl9ydW5uaW5nU2Vzc2lvbkNvbmZpZ3Muc2V0KHNlc3Npb25JZCwge1xuXHRcdFx0XHQuLi5leGlzdGluZyxcblx0XHRcdFx0dmFsdWVzOiByZXBsYWNlID8geyAuLi5jb25maWcgfSA6IHsgLi4uZXhpc3RpbmcudmFsdWVzLCAuLi5jb25maWcgfSxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBTZXNzaW9uIHdhcyByZXN0b3JlZCAoZS5nLiBhZnRlciByZWxvYWQpIFx1MjAxNCBjcmVhdGUgYSBtaW5pbWFsXG5cdFx0XHQvLyBjb25maWcgZW50cnkgZnJvbSB0aGUgY2hhbmdlZCB2YWx1ZXMgc28gdGhlIHBpY2tlciBjYW4gcmVuZGVyLlxuXHRcdFx0Ly8gYHJlcGxhY2VgIHZzIG1lcmdlIGlzIG1vb3QgaGVyZSAobm8gZXhpc3RpbmcgdmFsdWVzIHRvIG1lcmdlIHdpdGgpLlxuXHRcdFx0dGhpcy5fcnVubmluZ1Nlc3Npb25Db25maWdzLnNldChzZXNzaW9uSWQsIHtcblx0XHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiBidWlsZE11dGFibGVDb25maWdTY2hlbWEoY29uZmlnKSB9LFxuXHRcdFx0XHR2YWx1ZXM6IGNvbmZpZyxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25Db25maWcuZmlyZShzZXNzaW9uSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlQ2hhbmdlc2V0c0NoYW5nZWQoc2Vzc2lvbjogc3RyaW5nLCBjaGFuZ2VzZXRzOiByZWFkb25seSBDaGFuZ2VzZXRbXSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHJhd0lkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3Nlc3Npb25DYWNoZS5nZXQocmF3SWQpO1xuXHRcdGlmIChjYWNoZWQpIHtcblx0XHRcdGNhY2hlZC51cGRhdGVDaGFuZ2VzZXRzKGNoYW5nZXNldHMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVNlc3Npb25NZXRhQ2hhbmdlZChzZXNzaW9uOiBzdHJpbmcsIG1ldGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3SWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fc2Vzc2lvbkNhY2hlLmdldChyYXdJZCk7XG5cdFx0aWYgKGNhY2hlZD8uc2V0TWV0YShtZXRhKSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW2NhY2hlZF0gfSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE9wdGlvbmFsIFVSSSBtYXBwZXIgdXNlZCB3aGVuIGFwcGx5aW5nIGRpZmYgY2hhbmdlcy4gU3ViY2xhc3Nlc1xuXHQgKiBvdmVycmlkZSB0byB0cmFuc2xhdGUgcmVtb3RlIGRpZmYgVVJJcyBpbnRvIGFnZW50LWhvc3QgVVJJcy5cblx0ICovXG5cdHByb3RlY3RlZCBfZGlmZlVyaU1hcHBlcigpOiAoKHVyaTogVVJJKSA9PiBVUkkpIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG1CQUFtQiw2QkFBNkI7QUFDekQsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWEsd0JBQXdCO0FBQzlDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQTBCLHNCQUFzQjtBQUNoRCxTQUFT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
