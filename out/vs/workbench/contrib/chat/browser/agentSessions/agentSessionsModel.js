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
import { ThrottledDelayer } from "../../../../../base/common/async.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableMap } from "../../../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../../../base/common/map.js";
import { MarshalledId } from "../../../../../base/common/marshallingIds.js";
import { safeStringify } from "../../../../../base/common/objects.js";
import { derived, observableSignalFromEvent } from "../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService, LogLevel } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService } from "../../../../../platform/workspace/common/workspaceTrust.js";
import { IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { Extensions, IOutputService } from "../../../../services/output/common/output.js";
import { ChatSessionStatus as AgentSessionStatus, IChatSessionsService, isSessionInProgressStatus } from "../../common/chatSessionsService.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
import { IChatWidgetService } from "../chat.js";
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderIcon, getAgentSessionProviderName, isAgentHostTarget, isBuiltInAgentSessionProvider } from "./agentSessions.js";
import { ChatSessionStatus, isSessionInProgressStatus as isSessionInProgressStatus2 } from "../../common/chatSessionsService.js";
function hasValidDiff(changes) {
  if (!changes) {
    return false;
  }
  if (changes instanceof Array) {
    return changes.length > 0;
  }
  return changes.files > 0 || changes.insertions > 0 || changes.deletions > 0;
}
function getAgentChangesSummary(changes) {
  if (!changes) {
    return;
  }
  if (!(changes instanceof Array)) {
    return changes;
  }
  let insertions = 0;
  let deletions = 0;
  for (const change of changes) {
    insertions += change.insertions;
    deletions += change.deletions;
  }
  return { files: changes.length, insertions, deletions };
}
function isLocalAgentSessionItem(session) {
  return session.providerType === AgentSessionProviders.Local;
}
function getAgentSessionPullRequestUri(session) {
  const metadata = session.metadata;
  if (!metadata) {
    return void 0;
  }
  const url = metadata.pullRequestUrl;
  if (typeof url === "string" && url) {
    try {
      return URI.parse(url);
    } catch {
    }
  }
  const prNumber = metadata.pullRequestNumber;
  const owner = metadata.owner;
  const name = metadata.name;
  if (typeof prNumber === "number" && typeof owner === "string" && owner && typeof name === "string" && name) {
    return URI.parse(`https://github.com/${owner}/${name}/pull/${prNumber}`);
  }
  return void 0;
}
function getAgentSessionPullRequestContextValue(session) {
  return getAgentSessionPullRequestUri(session) ? "available" : "none";
}
function isAgentHostAgentSessionItem(session) {
  return isAgentHostTarget(session.providerType);
}
function isAgentSession(obj) {
  const session = obj;
  return URI.isUri(session?.resource) && typeof session.isArchived === "function" && typeof session.setArchived === "function" && typeof session.isPinned === "function" && typeof session.setPinned === "function" && typeof session.isRead === "function" && typeof session.isMarkedUnread === "function" && typeof session.setRead === "function";
}
function isAgentSessionsModel(obj) {
  const sessionsModel = obj;
  return Array.isArray(sessionsModel?.sessions) && typeof sessionsModel?.getSession === "function";
}
function countUnreadSessions(sessions) {
  let unread = 0;
  for (const session of sessions) {
    if (!session.isArchived() && session.status === AgentSessionStatus.Completed && !session.isRead()) {
      unread++;
    }
  }
  return unread;
}
var AgentSessionSection = /* @__PURE__ */ ((AgentSessionSection2) => {
  AgentSessionSection2["Pinned"] = "pinned";
  AgentSessionSection2["Today"] = "today";
  AgentSessionSection2["Yesterday"] = "yesterday";
  AgentSessionSection2["Week"] = "week";
  AgentSessionSection2["Older"] = "older";
  AgentSessionSection2["Archived"] = "archived";
  AgentSessionSection2["More"] = "more";
  AgentSessionSection2["Repository"] = "repository";
  return AgentSessionSection2;
})(AgentSessionSection || {});
function isAgentSessionSection(obj) {
  const candidate = obj;
  return typeof candidate.section === "string" && Array.isArray(candidate.sessions);
}
function isAgentSessionShowMore(obj) {
  return obj?.showMore === true;
}
function isAgentSessionShowLess(obj) {
  return obj?.showLess === true;
}
function isMarshalledAgentSessionContext(thing) {
  if (typeof thing === "object" && thing !== null) {
    const candidate = thing;
    return candidate.$mid === MarshalledId.AgentSessionContext && typeof candidate.session === "object" && candidate.session !== null;
  }
  return false;
}
const agentSessionsOutputChannelId = "agentSessionsOutput";
const agentSessionsOutputChannelLabel = localize("agentSessionsOutput", "Agent Sessions");
function statusToString(status) {
  switch (status) {
    case AgentSessionStatus.Failed:
      return "Failed";
    case AgentSessionStatus.Completed:
      return "Completed";
    case AgentSessionStatus.InProgress:
      return "InProgress";
    case AgentSessionStatus.NeedsInput:
      return "NeedsInput";
    default:
      return `Unknown(${status})`;
  }
}
let AgentSessionsLogger = class extends Disposable {
  constructor(getSessionsData, logService, outputService, chatEntitlementService) {
    super();
    this.getSessionsData = getSessionsData;
    this.logService = logService;
    this.outputService = outputService;
    this.chatEntitlementService = chatEntitlementService;
    this.isChannelRegistered = false;
    this.updateChannelRegistration();
    this.registerListeners();
  }
  updateChannelRegistration() {
    const chatDisabled = this.chatEntitlementService.sentiment.hidden;
    if (chatDisabled && this.isChannelRegistered) {
      Registry.as(Extensions.OutputChannels).removeChannel(agentSessionsOutputChannelId);
      this.isChannelRegistered = false;
    } else if (!chatDisabled && !this.isChannelRegistered) {
      Registry.as(Extensions.OutputChannels).registerChannel({
        id: agentSessionsOutputChannelId,
        label: agentSessionsOutputChannelLabel,
        log: false
      });
      this.isChannelRegistered = true;
    }
  }
  registerListeners() {
    this._register(this.logService.onDidChangeLogLevel((level) => {
      if (level === LogLevel.Trace) {
        this.logAllStatsIfTrace("Log level changed to trace");
      }
    }));
    this._register(this.chatEntitlementService.onDidChangeSentiment(() => {
      this.updateChannelRegistration();
    }));
  }
  logIfTrace(msg) {
    if (this.logService.getLevel() !== LogLevel.Trace) {
      return;
    }
    this.trace(`[Agent Sessions] ${msg}`);
  }
  logAllStatsIfTrace(reason) {
    if (this.logService.getLevel() !== LogLevel.Trace) {
      return;
    }
    this.logAllSessions(reason);
    this.logSessionStates();
  }
  logAllSessions(reason) {
    const { sessions, sessionStates } = this.getSessionsData();
    const lines = [];
    lines.push(`=== Agent Sessions (${reason}) ===`);
    let count = 0;
    for (const session of sessions) {
      count++;
      const state = sessionStates.get(session.resource);
      lines.push(`--- Session: ${session.label} ---`);
      lines.push(`  Resource: ${session.resource.toString()}`);
      lines.push(`  Provider Type: ${session.providerType}`);
      lines.push(`  Provider Label: ${session.providerLabel}`);
      lines.push(`  Status: ${statusToString(session.status)}`);
      lines.push(`  Icon: ${session.icon.id}`);
      if (session.description) {
        lines.push(`  Description: ${typeof session.description === "string" ? session.description : session.description.value}`);
      }
      if (session.badge) {
        lines.push(`  Badge: ${typeof session.badge === "string" ? session.badge : session.badge.value}`);
      }
      if (session.tooltip) {
        lines.push(`  Tooltip: ${typeof session.tooltip === "string" ? session.tooltip : session.tooltip.value}`);
      }
      lines.push(`  Timing:`);
      lines.push(`    Created: ${session.timing.created ? new Date(session.timing.created).toISOString() : "N/A"}`);
      lines.push(`    Last Request Started: ${session.timing.lastRequestStarted ? new Date(session.timing.lastRequestStarted).toISOString() : "N/A"}`);
      lines.push(`    Last Request Ended: ${session.timing.lastRequestEnded ? new Date(session.timing.lastRequestEnded).toISOString() : "N/A"}`);
      if (session.changes) {
        const summary = getAgentChangesSummary(session.changes);
        if (summary) {
          lines.push(`  Changes: ${summary.files} files, +${summary.insertions} -${summary.deletions}`);
        }
      }
      if (session.metadata && Object.keys(session.metadata).length > 0) {
        lines.push(`  Metadata:`);
        for (const [key, value] of Object.entries(session.metadata)) {
          const renderedValue = typeof value === "string" ? value : safeStringify(value);
          lines.push(`    ${key}: ${renderedValue}`);
        }
      }
      lines.push(`  State:`);
      lines.push(`    Archived (provider): ${session.archived ?? "N/A"}`);
      lines.push(`    Archived (computed): ${session.isArchived()}`);
      lines.push(`    Archived (stored): ${state?.archived ?? "N/A"}`);
      lines.push(`    Pinned: ${session.isPinned()}`);
      lines.push(`    Pinned (stored): ${state?.pinned ?? "N/A"}`);
      lines.push(`    Read: ${session.isRead()}`);
      lines.push(`    Read date (stored): ${state?.read ? new Date(state.read).toISOString() : "N/A"}`);
      lines.push("");
    }
    lines.unshift(`Total sessions: ${count}`, "");
    lines.push(`=== End Agent Sessions ===`);
    this.trace(lines.join("\n"));
  }
  logSessionStates() {
    const { sessionStates } = this.getSessionsData();
    const lines = [];
    lines.push(`=== Session States ===`);
    lines.push(`Total stored states: ${sessionStates.size}`);
    lines.push("");
    for (const [resource, state] of sessionStates) {
      lines.push(`URI: ${resource.toString()}`);
      lines.push(`  Archived: ${state.archived}`);
      lines.push(`  Pinned: ${state.pinned}`);
      lines.push(`  Read: ${state.read ? new Date(state.read).toISOString() : "0 (unread)"}`);
      lines.push("");
    }
    lines.push(`=== End Session States ===`);
    this.trace(lines.join("\n"));
  }
  trace(msg) {
    const channel = this.outputService.getChannel(agentSessionsOutputChannelId);
    if (!channel) {
      return;
    }
    channel.append(`${msg}
`);
  }
};
AgentSessionsLogger = __decorateClass([
  __decorateParam(1, ILogService),
  __decorateParam(2, IOutputService),
  __decorateParam(3, IChatEntitlementService)
], AgentSessionsLogger);
let AgentSessionsModel = class extends Disposable {
  constructor(chatSessionsService, lifecycleService, instantiationService, storageService, productService, chatWidgetService, workspaceContextService, workspaceTrustManagementService, chatEntitlementService) {
    super();
    this.chatSessionsService = chatSessionsService;
    this.lifecycleService = lifecycleService;
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.productService = productService;
    this.chatWidgetService = chatWidgetService;
    this.workspaceContextService = workspaceContextService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.chatEntitlementService = chatEntitlementService;
    this._onWillResolve = this._register(new Emitter());
    this.onWillResolve = this._onWillResolve.event;
    this._onDidResolve = this._register(new Emitter());
    this.onDidResolve = this._onDidResolve.event;
    this._onDidChangeSessions = this._register(new Emitter());
    this.onDidChangeSessions = this._onDidChangeSessions.event;
    this._onDidChangeSessionArchivedState = this._register(new Emitter());
    this.onDidChangeSessionArchivedState = this._onDidChangeSessionArchivedState.event;
    this._resolved = false;
    this.resolvers = this._register(new DisposableMap());
    this._sessionObservables = new ResourceMap();
    this._resolvedResources = new ResourceSet();
    this.explicitlyMarkedUnreadSessions = new ResourceSet();
    this.migratedReadResources = new ResourceSet();
    this._sessions = new ResourceMap();
    this.cache = this.instantiationService.createInstance(AgentSessionsCache);
    for (const data of this.cache.loadCachedSessions()) {
      const session = this.toAgentSession(data);
      this._sessions.set(session.resource, session);
    }
    this.sessionStates = this.cache.loadSessionStates();
    this.logger = this._register(this.instantiationService.createInstance(
      AgentSessionsLogger,
      () => ({
        sessions: this._sessions.values(),
        sessionStates: this.sessionStates
      })
    ));
    this.logger.logAllStatsIfTrace("Loaded cached sessions");
    this.readDateBaseline = this.resolveReadDateBaseline();
    this.loadMigratedReadResources();
    this.registerListeners();
  }
  get resolved() {
    return this._resolved;
  }
  get sessions() {
    return Array.from(this._sessions.values());
  }
  registerListeners() {
    this._register(this.chatSessionsService.onDidChangeItemsProviders(({ chatSessionType }) => this.resolve(chatSessionType)));
    this._register(this.chatSessionsService.onDidChangeAvailability(() => this.resolve(void 0)));
    this._register(this.chatSessionsService.onDidChangeSessionItems((delta) => {
      const changedChatSessionTypes = /* @__PURE__ */ new Set();
      for (const resource of delta.addedOrUpdated ?? []) {
        changedChatSessionTypes.add(getChatSessionType(resource.resource));
      }
      for (const resource of delta.removed ?? []) {
        changedChatSessionTypes.add(getChatSessionType(resource));
      }
      for (const chatSessionType of changedChatSessionTypes) {
        this.resolveProvider(chatSessionType, {
          refreshProvider: false
          /* skip because we react on an event already */
        });
      }
    }));
    this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.resolve(void 0)));
    this._register(this.workspaceTrustManagementService.onDidChangeTrust(() => this.resolve(void 0)));
    this._register(this.storageService.onWillSaveState(() => {
      this.cache.saveCachedSessions(Array.from(this._sessions.values()));
      this.cache.saveSessionStates(this.sessionStates);
    }));
  }
  getSession(resource) {
    return this._sessions.get(resource);
  }
  observeSession(resource) {
    if (!this._resolvedResources.has(resource)) {
      this._resolvedResources.add(resource);
      const sessionType = getChatSessionType(resource);
      this.chatSessionsService.resolveChatSessionItem(sessionType, resource, CancellationToken.None).catch((error) => this.logger.logIfTrace(`observeSession: resolve failed for ${resource.toString()}: ${error instanceof Error ? error.message : String(error)}`));
    }
    let observable = this._sessionObservables.get(resource);
    if (!observable) {
      this._changedSignal ??= observableSignalFromEvent("agentSessionsChanged", this.onDidChangeSessions);
      const signal = this._changedSignal;
      observable = derived((reader) => {
        signal.read(reader);
        return this._sessions.get(resource);
      });
      this._sessionObservables.set(resource, observable);
    }
    return observable;
  }
  async resolve(provider) {
    const providers = Array.isArray(provider) ? provider : provider !== void 0 ? [provider] : this.chatSessionsService.getRegisteredChatSessionItemProviders();
    await Promise.all(providers.map((provider2) => this.resolveProvider(provider2, { refreshProvider: true })));
  }
  resolveProvider(provider, options) {
    if (this.chatEntitlementService.sentiment.hidden) {
      return Promise.resolve();
    }
    let resolver = this.resolvers.get(provider);
    if (!resolver) {
      resolver = new ThrottledDelayer(500);
      this.resolvers.set(provider, resolver);
    }
    return resolver.trigger(async (token) => {
      if (token.isCancellationRequested || this.lifecycleService.willShutdown) {
        return;
      }
      try {
        this._onWillResolve.fire(provider);
        return await this.doResolveProvider(provider, options, token);
      } catch (error) {
        this.logger.logIfTrace(`Error resolving sessions for provider ${provider}: ${error instanceof Error ? error.stack : String(error)}`);
      } finally {
        this._onDidResolve.fire(provider);
      }
    });
  }
  async doResolveProvider(provider, options, token) {
    if (options.refreshProvider) {
      await this.chatSessionsService.refreshChatSessionItems([provider], token);
      for (const resource of [...this._resolvedResources]) {
        if (getChatSessionType(resource) === provider) {
          this._resolvedResources.delete(resource);
          if (this._sessionObservables.has(resource)) {
            this.observeSession(resource);
          }
        }
      }
    }
    const mapSessionContributionToType = /* @__PURE__ */ new Map();
    for (const contribution of this.chatSessionsService.getAllChatSessionContributions()) {
      mapSessionContributionToType.set(contribution.type, contribution);
    }
    const sessions = new ResourceMap();
    for await (const { chatSessionType, items: providerSessions } of this.chatSessionsService.getChatSessionItems([provider], token)) {
      if (token.isCancellationRequested) {
        return;
      }
      for (const session of providerSessions) {
        let icon;
        let providerLabel;
        const agentSessionProvider = getAgentSessionProvider(chatSessionType);
        if (agentSessionProvider !== void 0) {
          providerLabel = getAgentSessionProviderName(agentSessionProvider);
          icon = getAgentSessionProviderIcon(agentSessionProvider);
        } else {
          providerLabel = mapSessionContributionToType.get(chatSessionType)?.name ?? chatSessionType;
          icon = session.iconPath ?? Codicon.terminal;
        }
        const changes = session.changes;
        const normalizedChanges = changes && !(changes instanceof Array) ? { files: changes.files, insertions: changes.insertions, deletions: changes.deletions } : changes;
        const shouldKeepOpenSessionRead = session.isRead === false && this.chatSessionsService.canSetChatSessionItemRead(session.resource) && !this.explicitlyMarkedUnreadSessions.has(session.resource) && !!this.chatWidgetService.getWidgetBySessionResource(session.resource);
        if (shouldKeepOpenSessionRead) {
          this.chatSessionsService.setChatSessionItemRead(session.resource, true);
        }
        if (session.isRead) {
          this.explicitlyMarkedUnreadSessions.delete(session.resource);
        }
        sessions.set(session.resource, this.toAgentSession({
          providerType: chatSessionType,
          providerLabel,
          resource: session.resource,
          label: session.label.split("\n")[0],
          // protect against weird multi-line labels that break our layout
          description: session.description,
          icon,
          badge: session.badge,
          tooltip: session.tooltip,
          status: session.status ?? AgentSessionStatus.Completed,
          archived: session.archived,
          providerIsRead: shouldKeepOpenSessionRead ? true : session.isRead,
          timing: session.timing,
          changes: normalizedChanges,
          metadata: session.metadata,
          legacyResource: session.legacyResource
        }));
      }
    }
    for (const [, session] of this._sessions) {
      if (session.providerType !== provider && !sessions.has(session.resource) && (isBuiltInAgentSessionProvider(session.providerType) || mapSessionContributionToType.has(session.providerType))) {
        sessions.set(session.resource, session);
      }
    }
    for (const resource of this.explicitlyMarkedUnreadSessions) {
      if (!sessions.has(resource)) {
        this.explicitlyMarkedUnreadSessions.delete(resource);
      }
    }
    const sessionsWithChangedArchivedState = [];
    for (const [, session] of sessions) {
      const previousSession = this._sessions.get(session.resource);
      if (previousSession && this.isArchived(previousSession) !== this.isArchived(session)) {
        sessionsWithChangedArchivedState.push(session);
      }
    }
    this._sessions = sessions;
    this._resolved = true;
    this.migrateReadStateToProvider(sessions.values());
    this.logger.logAllStatsIfTrace("Sessions resolved from providers");
    for (const session of sessionsWithChangedArchivedState) {
      this._onDidChangeSessionArchivedState.fire(session);
    }
    this._onDidChangeSessions.fire();
  }
  toAgentSession(data) {
    return {
      ...data,
      isArchived: () => this.isArchived(data),
      setArchived: (archived) => this.setArchived(data, archived),
      isPinned: () => this.isPinned(data),
      setPinned: (pinned) => this.setPinned(data, pinned),
      isRead: () => this.isRead(data),
      isMarkedUnread: () => this.isMarkedUnread(data),
      setRead: (read) => this.setRead(data, read)
    };
  }
  /**
   * Resolve the state entry for a session, honoring a one-way migration from
   * {@link IAgentSessionData.legacyResource} when no entry yet exists for the
   * session's current resource. Adopts the legacy entry forward (copies it onto
   * the current resource key and removes the legacy entry). Returns undefined if
   * neither a current nor a legacy entry exists.
   */
  resolveStateEntry(session) {
    const own = this.sessionStates.get(session.resource);
    if (own !== void 0) {
      return own;
    }
    const legacy = session.legacyResource;
    if (!legacy) {
      return void 0;
    }
    if (legacy.scheme !== session.resource.scheme || legacy.toString() === session.resource.toString()) {
      return void 0;
    }
    const prev = this.sessionStates.get(legacy);
    if (prev === void 0) {
      return void 0;
    }
    this.sessionStates.set(session.resource, { ...prev });
    this.sessionStates.delete(legacy);
    return this.sessionStates.get(session.resource);
  }
  isArchived(session) {
    if (this.chatSessionsService.canSetChatSessionItemArchived(session.resource)) {
      return Boolean(session.archived);
    }
    return this.resolveStateEntry(session)?.archived ?? Boolean(session.archived);
  }
  setArchived(session, archived) {
    if (archived) {
      this.setRead(session, true);
    }
    if (archived === this.isArchived(session)) {
      return;
    }
    if (this.chatSessionsService.canSetChatSessionItemArchived(session.resource)) {
      this.chatSessionsService.setChatSessionItemArchived(session.resource, archived);
      return;
    }
    const state = this.resolveStateEntry(session) ?? {};
    this.sessionStates.set(session.resource, { ...state, archived });
    const agentSession = this._sessions.get(session.resource);
    if (agentSession) {
      this._onDidChangeSessionArchivedState.fire(agentSession);
    }
    this._onDidChangeSessions.fire();
  }
  isPinned(session) {
    return this.resolveStateEntry(session)?.pinned ?? false;
  }
  setPinned(session, pinned) {
    if (pinned === this.isPinned(session)) {
      return;
    }
    const state = this.resolveStateEntry(session) ?? {};
    this.sessionStates.set(session.resource, { ...state, pinned });
    this._onDidChangeSessions.fire();
  }
  isMarkedUnread(session) {
    if (this.ownsReadState(session)) {
      return !this.isRead(session);
    }
    return this.resolveStateEntry(session)?.read === AgentSessionsModel.UNREAD_MARKER;
  }
  /**
   * Whether the session's provider owns read state. When it does the value is
   * shared with every other client on the same backend (the agent window, or
   * another window on the same agent host), so the local heuristics below must
   * not second-guess it.
   */
  ownsReadState(session) {
    return this.chatSessionsService.canSetChatSessionItemRead(session.resource);
  }
  isRead(session) {
    if (this.isArchived(session)) {
      return true;
    }
    if (this.ownsReadState(session)) {
      return session.providerIsRead ?? true;
    }
    const storedReadDate = this.resolveStateEntry(session)?.read;
    if (storedReadDate === AgentSessionsModel.UNREAD_MARKER) {
      return false;
    }
    if (this.localReadDateCoversActivity(session, storedReadDate)) {
      return true;
    }
    return !!this.chatWidgetService.getWidgetBySessionResource(session.resource);
  }
  /**
   * Whether the locally-stored read timestamp covers the session's last
   * activity. Falls back to the read-date baseline when nothing is stored.
   */
  localReadDateCoversActivity(session, storedReadDate) {
    const readDate = Math.max(storedReadDate ?? 0, this.readDateBaseline);
    return readDate >= this.sessionTimeForReadStateTracking(session) - AgentSessionsModel.READ_GRACE_WINDOW;
  }
  sessionTimeForReadStateTracking(session) {
    return session.timing.lastRequestEnded ?? session.timing.created;
  }
  setRead(session, read, skipEvent) {
    if (this.ownsReadState(session)) {
      if (read) {
        this.explicitlyMarkedUnreadSessions.delete(session.resource);
      } else {
        this.explicitlyMarkedUnreadSessions.add(session.resource);
      }
      if (read === (session.providerIsRead ?? true)) {
        return;
      }
      this.chatSessionsService.setChatSessionItemRead(session.resource, read);
      return;
    }
    const state = this.resolveStateEntry(session) ?? {};
    let newRead;
    if (read) {
      newRead = Math.max(Date.now(), this.sessionTimeForReadStateTracking(session));
      if (typeof state.read === "number" && state.read >= newRead) {
        return;
      }
    } else {
      newRead = AgentSessionsModel.UNREAD_MARKER;
      if (state.read === AgentSessionsModel.UNREAD_MARKER) {
        return;
      }
    }
    this.sessionStates.set(session.resource, { ...state, read: newRead });
    if (!skipEvent) {
      this._onDidChangeSessions.fire();
    }
  }
  /**
   * One-time hand-off of locally-tracked read state to providers that own it,
   * so sessions read before the provider took ownership don't all resurface as
   * unread. Only ever promotes to read, and runs at most once per session so a
   * later "Mark as Unread" is not undone on the next refresh.
   *
   * The ledger is application-scoped even though the local state it hands off
   * is per-workspace: the provider-owned state it writes to is global, so a
   * second workspace that can see the same session (an empty window lists them
   * all) must not migrate it again and re-promote a deliberate "Mark as Unread".
   */
  migrateReadStateToProvider(sessions) {
    let changed = false;
    for (const session of sessions) {
      if (this.migratedReadResources.has(session.resource) || !this.ownsReadState(session)) {
        continue;
      }
      if (session.providerIsRead === void 0) {
        continue;
      }
      this.migratedReadResources.add(session.resource);
      changed = true;
      if (session.providerIsRead) {
        continue;
      }
      const storedReadDate = this.resolveStateEntry(session)?.read;
      if (storedReadDate === AgentSessionsModel.UNREAD_MARKER) {
        continue;
      }
      if (this.localReadDateCoversActivity(session, storedReadDate)) {
        this.chatSessionsService.setChatSessionItemRead(session.resource, true);
      }
    }
    if (changed) {
      this.storageService.store(
        AgentSessionsModel.READ_MIGRATION_DONE_KEY,
        JSON.stringify(Array.from(this.migratedReadResources).map((resource) => resource.toString())),
        StorageScope.APPLICATION,
        StorageTarget.MACHINE
      );
    }
  }
  loadMigratedReadResources() {
    const raw = this.storageService.get(AgentSessionsModel.READ_MIGRATION_DONE_KEY, StorageScope.APPLICATION);
    if (!raw) {
      return;
    }
    try {
      for (const entry of JSON.parse(raw)) {
        this.migratedReadResources.add(URI.parse(entry));
      }
    } catch {
    }
  }
  resolveReadDateBaseline() {
    let readDateBaseline = this.storageService.getNumber(AgentSessionsModel.READ_DATE_BASELINE_KEY, StorageScope.WORKSPACE, 0);
    if (readDateBaseline > 0) {
      return readDateBaseline;
    }
    readDateBaseline = this.productService.quality === "stable" ? Date.now() - 7 * 24 * 60 * 60 * 1e3 : Date.now();
    this.storageService.store(AgentSessionsModel.READ_DATE_BASELINE_KEY, readDateBaseline, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    return readDateBaseline;
  }
  //#endregion
};
//#region States
AgentSessionsModel.UNREAD_MARKER = -1;
/** Grace window absorbing a click away from a session just before it finishes. */
AgentSessionsModel.READ_GRACE_WINDOW = 2e3;
AgentSessionsModel.READ_MIGRATION_DONE_KEY = "agentSessions.providerReadMigration";
AgentSessionsModel.READ_DATE_BASELINE_KEY = "agentSessions.readDateBaseline2";
AgentSessionsModel = __decorateClass([
  __decorateParam(0, IChatSessionsService),
  __decorateParam(1, ILifecycleService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IProductService),
  __decorateParam(5, IChatWidgetService),
  __decorateParam(6, IWorkspaceContextService),
  __decorateParam(7, IWorkspaceTrustManagementService),
  __decorateParam(8, IChatEntitlementService)
], AgentSessionsModel);
let AgentSessionsCache = class {
  constructor(storageService) {
    this.storageService = storageService;
  }
  //#region Sessions
  saveCachedSessions(sessions) {
    const serialized = sessions.map((session) => ({
      providerType: session.providerType,
      providerLabel: session.providerLabel,
      resource: session.resource.toString(),
      icon: session.icon.id,
      label: session.label,
      description: session.description,
      badge: session.badge,
      tooltip: session.tooltip,
      status: isSessionInProgressStatus(session.status) ? AgentSessionStatus.Completed : session.status,
      // never cache sessions as in progress, this needs to be live state
      archived: session.archived,
      isRead: session.providerIsRead,
      timing: session.timing,
      changes: session.changes,
      metadata: session.metadata,
      legacyResource: session.legacyResource?.toString()
    }));
    this.storageService.store(AgentSessionsCache.SESSIONS_STORAGE_KEY, safeStringify(serialized), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  loadCachedSessions() {
    const sessionsCache = this.storageService.get(AgentSessionsCache.SESSIONS_STORAGE_KEY, StorageScope.WORKSPACE);
    if (!sessionsCache) {
      return [];
    }
    try {
      const cached = JSON.parse(sessionsCache);
      return cached.map((session) => ({
        providerType: session.providerType,
        providerLabel: session.providerLabel,
        resource: typeof session.resource === "string" ? URI.parse(session.resource) : URI.revive(session.resource),
        icon: ThemeIcon.fromId(session.icon),
        label: session.label,
        description: session.description,
        badge: session.badge,
        tooltip: session.tooltip,
        status: session.status,
        archived: session.archived,
        providerIsRead: session.isRead,
        timing: {
          created: session.timing.created ?? 0,
          lastRequestStarted: session.timing.lastRequestStarted,
          lastRequestEnded: session.timing.lastRequestEnded
        },
        changes: Array.isArray(session.changes) ? session.changes.map((change) => ({
          modifiedUri: URI.revive(change.modifiedUri),
          originalUri: change.originalUri ? URI.revive(change.originalUri) : void 0,
          insertions: change.insertions,
          deletions: change.deletions
        })) : session.changes,
        metadata: session.metadata,
        legacyResource: session.legacyResource ? URI.parse(session.legacyResource) : void 0
      }));
    } catch {
      return [];
    }
  }
  //#endregion
  //#region States
  saveSessionStates(states) {
    const serialized = Array.from(states.entries()).map(([resource, state]) => ({
      resource: resource.toString(),
      archived: state.archived,
      pinned: state.pinned,
      read: state.read
    }));
    this.storageService.store(AgentSessionsCache.STATE_STORAGE_KEY, JSON.stringify(serialized), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  loadSessionStates() {
    const states = new ResourceMap();
    const statesCache = this.storageService.get(AgentSessionsCache.STATE_STORAGE_KEY, StorageScope.WORKSPACE);
    if (!statesCache) {
      return states;
    }
    try {
      const cached = JSON.parse(statesCache);
      for (const entry of cached) {
        states.set(typeof entry.resource === "string" ? URI.parse(entry.resource) : URI.revive(entry.resource), {
          archived: entry.archived,
          pinned: entry.pinned,
          read: entry.read
        });
      }
    } catch {
    }
    return states;
  }
  //#endregion
};
AgentSessionsCache.SESSIONS_STORAGE_KEY = "agentSessions.model.cache";
AgentSessionsCache.STATE_STORAGE_KEY = "agentSessions.state.cache";
AgentSessionsCache = __decorateClass([
  __decorateParam(0, IStorageService)
], AgentSessionsCache);
export {
  AgentSessionSection,
  ChatSessionStatus as AgentSessionStatus,
  AgentSessionsModel,
  countUnreadSessions,
  getAgentChangesSummary,
  getAgentSessionPullRequestContextValue,
  getAgentSessionPullRequestUri,
  hasValidDiff,
  isAgentHostAgentSessionItem,
  isAgentSession,
  isAgentSessionSection,
  isAgentSessionShowLess,
  isAgentSessionShowMore,
  isAgentSessionsModel,
  isLocalAgentSessionItem,
  isMarshalledAgentSessionContext,
  isSessionInProgressStatus2 as isSessionInProgressStatus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFRocm90dGxlZERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwLCBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQgeyBzYWZlU3RyaW5naWZ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBMb2dMZXZlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSU91dHB1dENoYW5uZWxSZWdpc3RyeSwgSU91dHB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9vdXRwdXQvY29tbW9uL291dHB1dC5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvblN0YXR1cyBhcyBBZ2VudFNlc3Npb25TdGF0dXMsIElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UsIElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyLCBJQ2hhdFNlc3Npb25JdGVtLCBJQ2hhdFNlc3Npb25zU2VydmljZSwgaXNTZXNzaW9uSW5Qcm9ncmVzc1N0YXR1cywgUmVzb2x2ZWRDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLCBnZXRBZ2VudFNlc3Npb25Qcm92aWRlciwgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJJY29uLCBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUsIGlzQWdlbnRIb3N0VGFyZ2V0LCBpc0J1aWx0SW5BZ2VudFNlc3Npb25Qcm92aWRlciB9IGZyb20gJy4vYWdlbnRTZXNzaW9ucy5qcyc7XG5cbi8vI3JlZ2lvbiBJbnRlcmZhY2VzLCBUeXBlc1xuXG5leHBvcnQgeyBDaGF0U2Vzc2lvblN0YXR1cyBhcyBBZ2VudFNlc3Npb25TdGF0dXMsIGlzU2Vzc2lvbkluUHJvZ3Jlc3NTdGF0dXMgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50U2Vzc2lvbnNNb2RlbCB7XG5cblx0cmVhZG9ubHkgb25XaWxsUmVzb2x2ZTogRXZlbnQ8c3RyaW5nIC8qIHByb3ZpZGVyICovPjtcblx0cmVhZG9ubHkgb25EaWRSZXNvbHZlOiBFdmVudDxzdHJpbmcgLyogcHJvdmlkZXIgKi8+O1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25BcmNoaXZlZFN0YXRlOiBFdmVudDxJQWdlbnRTZXNzaW9uPjtcblxuXHRyZWFkb25seSByZXNvbHZlZDogYm9vbGVhbjtcblxuXHRyZWFkb25seSBzZXNzaW9uczogSUFnZW50U2Vzc2lvbltdO1xuXHRnZXRTZXNzaW9uKHJlc291cmNlOiBVUkkpOiBJQWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGFuIG9ic2VydmFibGUgdGhhdCBlbWl0cyB0aGUgbGF0ZXN0IHtAbGluayBJQWdlbnRTZXNzaW9ufSBmb3IgdGhlXG5cdCAqIGdpdmVuIHJlc291cmNlIChvciBgdW5kZWZpbmVkYCBpZiBubyBzZXNzaW9uIGlzIGN1cnJlbnRseSBrbm93bikuXG5cdCAqXG5cdCAqIFRoZSBvYnNlcnZhYmxlIHVwZGF0ZXMgd2hlbmV2ZXIgdGhlIHVuZGVybHlpbmcgc2Vzc2lvbiBjb2xsZWN0aW9uIGNoYW5nZXMuXG5cdCAqIFRoZSBmaXJzdCBjYWxsIGZvciBhIGdpdmVuIHJlc291cmNlIGxhemlseSB0cmlnZ2Vyc1xuXHQgKiB7QGxpbmsgSUNoYXRTZXNzaW9uc1NlcnZpY2UucmVzb2x2ZUNoYXRTZXNzaW9uSXRlbX0gc28gY29uc3VtZXJzIHJlYWRpbmdcblx0ICogbGF6eSBwcm9wZXJ0aWVzIChlLmcuIGBjaGFuZ2VzYCkgc2VlIGZyZXNoIHZhbHVlcyBvbmNlIHRoZSBwcm92aWRlciBoYXNcblx0ICogcmVzb2x2ZWQgdGhlbS4gSW4tZmxpZ2h0IHJlc29sdmVzIGFyZSBkZWR1cGxpY2F0ZWQgYnkgdGhlIGNoYXQgc2Vzc2lvbnNcblx0ICogc2VydmljZS5cblx0ICovXG5cdG9ic2VydmVTZXNzaW9uKHJlc291cmNlOiBVUkkpOiBJT2JzZXJ2YWJsZTxJQWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkPjtcblxuXHRyZXNvbHZlKHByb3ZpZGVyOiBzdHJpbmcgfCBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD47XG59XG5cbmludGVyZmFjZSBJQWdlbnRTZXNzaW9uRGF0YSBleHRlbmRzIE9taXQ8SUNoYXRTZXNzaW9uSXRlbSwgJ2FyY2hpdmVkJyB8ICdpY29uUGF0aCcgfCAnaXNSZWFkJz4ge1xuXG5cdHJlYWRvbmx5IHByb3ZpZGVyVHlwZTogc3RyaW5nO1xuXHRyZWFkb25seSBwcm92aWRlckxhYmVsOiBzdHJpbmc7XG5cblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcblxuXHRyZWFkb25seSBzdGF0dXM6IEFnZW50U2Vzc2lvblN0YXR1cztcblxuXHRyZWFkb25seSB0b29sdGlwPzogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nO1xuXG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nO1xuXHRyZWFkb25seSBiYWRnZT86IHN0cmluZyB8IElNYXJrZG93blN0cmluZztcblx0cmVhZG9ubHkgaWNvbjogVGhlbWVJY29uO1xuXG5cdHJlYWRvbmx5IHRpbWluZzogSUNoYXRTZXNzaW9uSXRlbVsndGltaW5nJ107XG5cblx0cmVhZG9ubHkgY2hhbmdlcz86IElDaGF0U2Vzc2lvbkl0ZW1bJ2NoYW5nZXMnXTtcbn1cblxuLyoqXG4gKiBDaGVja3MgaWYgdGhlIHByb3ZpZGVkIGNoYW5nZXMgb2JqZWN0IHJlcHJlc2VudHMgdmFsaWQgZGlmZiBpbmZvcm1hdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhhc1ZhbGlkRGlmZihjaGFuZ2VzOiBJQWdlbnRTZXNzaW9uWydjaGFuZ2VzJ10pOiBib29sZWFuIHtcblx0aWYgKCFjaGFuZ2VzKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKGNoYW5nZXMgaW5zdGFuY2VvZiBBcnJheSkge1xuXHRcdHJldHVybiBjaGFuZ2VzLmxlbmd0aCA+IDA7XG5cdH1cblxuXHRyZXR1cm4gY2hhbmdlcy5maWxlcyA+IDAgfHwgY2hhbmdlcy5pbnNlcnRpb25zID4gMCB8fCBjaGFuZ2VzLmRlbGV0aW9ucyA+IDA7XG59XG5cbi8qKlxuICogR2V0cyBhIHN1bW1hcnkgb2YgYWdlbnQgc2Vzc2lvbiBjaGFuZ2VzLCBjb252ZXJ0aW5nIGZyb20gYXJyYXkgZm9ybWF0IHRvIG9iamVjdCBmb3JtYXQgaWYgbmVlZGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0QWdlbnRDaGFuZ2VzU3VtbWFyeShjaGFuZ2VzOiBJQWdlbnRTZXNzaW9uWydjaGFuZ2VzJ10pIHtcblx0aWYgKCFjaGFuZ2VzKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKCEoY2hhbmdlcyBpbnN0YW5jZW9mIEFycmF5KSkge1xuXHRcdHJldHVybiBjaGFuZ2VzO1xuXHR9XG5cblx0bGV0IGluc2VydGlvbnMgPSAwO1xuXHRsZXQgZGVsZXRpb25zID0gMDtcblx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgY2hhbmdlcykge1xuXHRcdGluc2VydGlvbnMgKz0gY2hhbmdlLmluc2VydGlvbnM7XG5cdFx0ZGVsZXRpb25zICs9IGNoYW5nZS5kZWxldGlvbnM7XG5cdH1cblxuXHRyZXR1cm4geyBmaWxlczogY2hhbmdlcy5sZW5ndGgsIGluc2VydGlvbnMsIGRlbGV0aW9ucyB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudFNlc3Npb24gZXh0ZW5kcyBJQWdlbnRTZXNzaW9uRGF0YSB7XG5cdGlzQXJjaGl2ZWQoKTogYm9vbGVhbjtcblx0c2V0QXJjaGl2ZWQoYXJjaGl2ZWQ6IGJvb2xlYW4pOiB2b2lkO1xuXG5cdGlzUGlubmVkKCk6IGJvb2xlYW47XG5cdHNldFBpbm5lZChwaW5uZWQ6IGJvb2xlYW4pOiB2b2lkO1xuXG5cdGlzUmVhZCgpOiBib29sZWFuO1xuXHRpc01hcmtlZFVucmVhZCgpOiBib29sZWFuO1xuXHRzZXRSZWFkKHJlYWQ6IGJvb2xlYW4pOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgSUludGVybmFsQWdlbnRTZXNzaW9uRGF0YSBleHRlbmRzIElBZ2VudFNlc3Npb25EYXRhIHtcblxuXHQvKipcblx0ICogVGhlIGBhcmNoaXZlZGAgcHJvcGVydHkgaXMgcHJvdmlkZWQgYnkgdGhlIHNlc3Npb24gcHJvdmlkZXJcblx0ICogYW5kIHdpbGwgYmUgdXNlZCBhcyB0aGUgaW5pdGlhbCB2YWx1ZSBpZiB0aGUgdXNlciBoYXMgbm90XG5cdCAqIGNoYW5nZWQgdGhlIGFyY2hpdmVkIHN0YXRlIGZvciB0aGUgc2Vzc2lvbiBwcmV2aW91c2x5LiBJdFxuXHQgKiBpcyBrZXB0IGludGVybmFsIHRvIG5vdCBleHBvc2UgaXQgcHVibGljbHkuIFVzZSBgaXNBcmNoaXZlZCgpYFxuXHQgKiBhbmQgYHNldEFyY2hpdmVkKClgIG1ldGhvZHMgaW5zdGVhZC5cblx0ICovXG5cdHJlYWRvbmx5IGFyY2hpdmVkOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBSZWFkIHN0YXRlIGFzIHJlcG9ydGVkIGJ5IHRoZSBzZXNzaW9uJ3MgcHJvdmlkZXIsIGF1dGhvcml0YXRpdmUgZm9yXG5cdCAqIHByb3ZpZGVycyB0aGF0IG93biBpdCAoc2VlIHtAbGluayBvd25zUmVhZFN0YXRlfSkuIEtlcHQgaW50ZXJuYWwgXHUyMDE0IHVzZVxuXHQgKiBgaXNSZWFkKClgIC8gYHNldFJlYWQoKWAuXG5cdCAqL1xuXHRyZWFkb25seSBwcm92aWRlcklzUmVhZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIElJbnRlcm5hbEFnZW50U2Vzc2lvbiBleHRlbmRzIElBZ2VudFNlc3Npb24sIElJbnRlcm5hbEFnZW50U2Vzc2lvbkRhdGEgeyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0xvY2FsQWdlbnRTZXNzaW9uSXRlbShzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogYm9vbGVhbiB7XG5cdHJldHVybiBzZXNzaW9uLnByb3ZpZGVyVHlwZSA9PT0gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsO1xufVxuXG4vKipcbiAqIFJlc29sdmVzIHRoZSBwdWxsIHJlcXVlc3QgYXNzb2NpYXRlZCB3aXRoIGFuIGFnZW50IHNlc3Npb24gZnJvbSBpdHMgcHJvdmlkZXIgbWV0YWRhdGEsXG4gKiBwcmVmZXJyaW5nIGFuIGV4cGxpY2l0IGBwdWxsUmVxdWVzdFVybGAgYW5kIGZhbGxpbmcgYmFjayB0byBgcHVsbFJlcXVlc3ROdW1iZXJgIGNvbWJpbmVkXG4gKiB3aXRoIGBvd25lcmAvYG5hbWVgLiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gdGhlIHNlc3Npb24gaGFzIG5vIGFzc29jaWF0ZWQgcHVsbCByZXF1ZXN0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0QWdlbnRTZXNzaW9uUHVsbFJlcXVlc3RVcmkoc2Vzc2lvbjogUGljazxJQWdlbnRTZXNzaW9uLCAnbWV0YWRhdGEnPik6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG1ldGFkYXRhID0gc2Vzc2lvbi5tZXRhZGF0YTtcblx0aWYgKCFtZXRhZGF0YSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCB1cmwgPSBtZXRhZGF0YS5wdWxsUmVxdWVzdFVybDtcblx0aWYgKHR5cGVvZiB1cmwgPT09ICdzdHJpbmcnICYmIHVybCkge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gVVJJLnBhcnNlKHVybCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBGYWxsIHRocm91Z2ggdG8gdGhlIG51bWJlciBiYXNlZCBsb29rdXAgYmVsb3cuXG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgcHJOdW1iZXIgPSBtZXRhZGF0YS5wdWxsUmVxdWVzdE51bWJlcjtcblx0Y29uc3Qgb3duZXIgPSBtZXRhZGF0YS5vd25lcjtcblx0Y29uc3QgbmFtZSA9IG1ldGFkYXRhLm5hbWU7XG5cdGlmICh0eXBlb2YgcHJOdW1iZXIgPT09ICdudW1iZXInICYmIHR5cGVvZiBvd25lciA9PT0gJ3N0cmluZycgJiYgb3duZXIgJiYgdHlwZW9mIG5hbWUgPT09ICdzdHJpbmcnICYmIG5hbWUpIHtcblx0XHRyZXR1cm4gVVJJLnBhcnNlKGBodHRwczovL2dpdGh1Yi5jb20vJHtvd25lcn0vJHtuYW1lfS9wdWxsLyR7cHJOdW1iZXJ9YCk7XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFRoZSB2YWx1ZSBmb3IgdGhlIGBjaGF0U2Vzc2lvblB1bGxSZXF1ZXN0YCBjb250ZXh0IGtleSBmb3IgYSBzZXNzaW9uLiBOZXZlciByZXR1cm5zIGFuXG4gKiBcInVua25vd25cIiB2YWx1ZTogY2FsbGVycyBoZXJlIGFsd2F5cyBoYXZlIHRoZSBzZXNzaW9uJ3MgbWV0YWRhdGEgaW4gaGFuZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEFnZW50U2Vzc2lvblB1bGxSZXF1ZXN0Q29udGV4dFZhbHVlKHNlc3Npb246IFBpY2s8SUFnZW50U2Vzc2lvbiwgJ21ldGFkYXRhJz4pOiAnYXZhaWxhYmxlJyB8ICdub25lJyB7XG5cdHJldHVybiBnZXRBZ2VudFNlc3Npb25QdWxsUmVxdWVzdFVyaShzZXNzaW9uKSA/ICdhdmFpbGFibGUnIDogJ25vbmUnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNBZ2VudEhvc3RBZ2VudFNlc3Npb25JdGVtKHNlc3Npb246IElBZ2VudFNlc3Npb24pOiBib29sZWFuIHtcblx0cmV0dXJuIGlzQWdlbnRIb3N0VGFyZ2V0KHNlc3Npb24ucHJvdmlkZXJUeXBlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQWdlbnRTZXNzaW9uKG9iajogdW5rbm93bik6IG9iaiBpcyBJQWdlbnRTZXNzaW9uIHtcblx0Y29uc3Qgc2Vzc2lvbiA9IG9iaiBhcyBJQWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXG5cdHJldHVybiBVUkkuaXNVcmkoc2Vzc2lvbj8ucmVzb3VyY2UpXG5cdFx0JiYgdHlwZW9mIHNlc3Npb24uaXNBcmNoaXZlZCA9PT0gJ2Z1bmN0aW9uJ1xuXHRcdCYmIHR5cGVvZiBzZXNzaW9uLnNldEFyY2hpdmVkID09PSAnZnVuY3Rpb24nXG5cdFx0JiYgdHlwZW9mIHNlc3Npb24uaXNQaW5uZWQgPT09ICdmdW5jdGlvbidcblx0XHQmJiB0eXBlb2Ygc2Vzc2lvbi5zZXRQaW5uZWQgPT09ICdmdW5jdGlvbidcblx0XHQmJiB0eXBlb2Ygc2Vzc2lvbi5pc1JlYWQgPT09ICdmdW5jdGlvbidcblx0XHQmJiB0eXBlb2Ygc2Vzc2lvbi5pc01hcmtlZFVucmVhZCA9PT0gJ2Z1bmN0aW9uJ1xuXHRcdCYmIHR5cGVvZiBzZXNzaW9uLnNldFJlYWQgPT09ICdmdW5jdGlvbic7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0FnZW50U2Vzc2lvbnNNb2RlbChvYmo6IHVua25vd24pOiBvYmogaXMgSUFnZW50U2Vzc2lvbnNNb2RlbCB7XG5cdGNvbnN0IHNlc3Npb25zTW9kZWwgPSBvYmogYXMgSUFnZW50U2Vzc2lvbnNNb2RlbCB8IHVuZGVmaW5lZDtcblxuXHRyZXR1cm4gQXJyYXkuaXNBcnJheShzZXNzaW9uc01vZGVsPy5zZXNzaW9ucykgJiYgdHlwZW9mIHNlc3Npb25zTW9kZWw/LmdldFNlc3Npb24gPT09ICdmdW5jdGlvbic7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb3VudFVucmVhZFNlc3Npb25zKHNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW10pOiBudW1iZXIge1xuXHRsZXQgdW5yZWFkID0gMDtcblx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0aWYgKCFzZXNzaW9uLmlzQXJjaGl2ZWQoKSAmJiBzZXNzaW9uLnN0YXR1cyA9PT0gQWdlbnRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCAmJiAhc2Vzc2lvbi5pc1JlYWQoKSkge1xuXHRcdFx0dW5yZWFkKys7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bnJlYWQ7XG59XG5cbmludGVyZmFjZSBJQWdlbnRTZXNzaW9uU3RhdGUge1xuXHRyZWFkb25seSBhcmNoaXZlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHBpbm5lZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHJlYWQ/OiBudW1iZXIgLyogbGFzdCBkYXRlIHR1cm5lZCByZWFkICovO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBBZ2VudFNlc3Npb25TZWN0aW9uIHtcblxuXHQvLyBQaW5uZWQgR3JvdXBpbmdcblx0UGlubmVkID0gJ3Bpbm5lZCcsXG5cblx0Ly8gRGF0ZSBHcm91cGluZ1xuXHRUb2RheSA9ICd0b2RheScsXG5cdFllc3RlcmRheSA9ICd5ZXN0ZXJkYXknLFxuXHRXZWVrID0gJ3dlZWsnLFxuXHRPbGRlciA9ICdvbGRlcicsXG5cdEFyY2hpdmVkID0gJ2FyY2hpdmVkJyxcblxuXHQvLyBDYXBwZWQgR3JvdXBpbmdcblx0TW9yZSA9ICdtb3JlJyxcblxuXHQvLyBSZXBvc2l0b3J5IEdyb3VwaW5nXG5cdFJlcG9zaXRvcnkgPSAncmVwb3NpdG9yeScsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50U2Vzc2lvblNlY3Rpb24ge1xuXHRyZWFkb25seSBzZWN0aW9uOiBBZ2VudFNlc3Npb25TZWN0aW9uO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uczogSUFnZW50U2Vzc2lvbltdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNBZ2VudFNlc3Npb25TZWN0aW9uKG9iajogdW5rbm93bik6IG9iaiBpcyBJQWdlbnRTZXNzaW9uU2VjdGlvbiB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IG9iaiBhcyBJQWdlbnRTZXNzaW9uU2VjdGlvbjtcblxuXHRyZXR1cm4gdHlwZW9mIGNhbmRpZGF0ZS5zZWN0aW9uID09PSAnc3RyaW5nJyAmJiBBcnJheS5pc0FycmF5KGNhbmRpZGF0ZS5zZXNzaW9ucyk7XG59XG5cbi8qKlxuICogQSBcIlNob3cgTiBNb3JlLi4uXCIgaXRlbSB0aGF0IGFwcGVhcnMgYXMgdGhlIGxhc3QgY2hpbGRcbiAqIG9mIGEgY2FwcGVkIHJlcG9zaXRvcnkgZ3JvdXAgc2VjdGlvbi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRTZXNzaW9uU2hvd01vcmUge1xuXHRyZWFkb25seSBzaG93TW9yZTogdHJ1ZTtcblx0cmVhZG9ubHkgc2VjdGlvbkxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlbWFpbmluZ0NvdW50OiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0FnZW50U2Vzc2lvblNob3dNb3JlKG9iajogdW5rbm93bik6IG9iaiBpcyBJQWdlbnRTZXNzaW9uU2hvd01vcmUge1xuXHRyZXR1cm4gKG9iaiBhcyBJQWdlbnRTZXNzaW9uU2hvd01vcmUpPy5zaG93TW9yZSA9PT0gdHJ1ZTtcbn1cblxuLyoqXG4gKiBBIFwiU2hvdyBsZXNzXCIgaXRlbSB0aGF0IGFwcGVhcnMgYXMgdGhlIGxhc3QgY2hpbGRcbiAqIG9mIGFuIGV4cGFuZGVkIHJlcG9zaXRvcnkgZ3JvdXAgc2VjdGlvbiB0byBhbGxvdyBjb2xsYXBzaW5nIGJhY2suXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50U2Vzc2lvblNob3dMZXNzIHtcblx0cmVhZG9ubHkgc2hvd0xlc3M6IHRydWU7XG5cdHJlYWRvbmx5IHNlY3Rpb25MYWJlbDogc3RyaW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNBZ2VudFNlc3Npb25TaG93TGVzcyhvYmo6IHVua25vd24pOiBvYmogaXMgSUFnZW50U2Vzc2lvblNob3dMZXNzIHtcblx0cmV0dXJuIChvYmogYXMgSUFnZW50U2Vzc2lvblNob3dMZXNzKT8uc2hvd0xlc3MgPT09IHRydWU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1hcnNoYWxsZWRBZ2VudFNlc3Npb25Db250ZXh0IHtcblx0cmVhZG9ubHkgJG1pZDogTWFyc2hhbGxlZElkLkFnZW50U2Vzc2lvbkNvbnRleHQ7XG5cblx0cmVhZG9ubHkgc2Vzc2lvbjogSUFnZW50U2Vzc2lvbjtcblx0cmVhZG9ubHkgc2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXTsgLy8gc3VwcG9ydCBmb3IgbXVsdGktc2VsZWN0aW9uXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc01hcnNoYWxsZWRBZ2VudFNlc3Npb25Db250ZXh0KHRoaW5nOiB1bmtub3duKTogdGhpbmcgaXMgSU1hcnNoYWxsZWRBZ2VudFNlc3Npb25Db250ZXh0IHtcblx0aWYgKHR5cGVvZiB0aGluZyA9PT0gJ29iamVjdCcgJiYgdGhpbmcgIT09IG51bGwpIHtcblx0XHRjb25zdCBjYW5kaWRhdGUgPSB0aGluZyBhcyBJTWFyc2hhbGxlZEFnZW50U2Vzc2lvbkNvbnRleHQ7XG5cdFx0cmV0dXJuIGNhbmRpZGF0ZS4kbWlkID09PSBNYXJzaGFsbGVkSWQuQWdlbnRTZXNzaW9uQ29udGV4dCAmJiB0eXBlb2YgY2FuZGlkYXRlLnNlc3Npb24gPT09ICdvYmplY3QnICYmIGNhbmRpZGF0ZS5zZXNzaW9uICE9PSBudWxsO1xuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFNlc3Npb25zIExvZ2dlclxuXG5jb25zdCBhZ2VudFNlc3Npb25zT3V0cHV0Q2hhbm5lbElkID0gJ2FnZW50U2Vzc2lvbnNPdXRwdXQnO1xuY29uc3QgYWdlbnRTZXNzaW9uc091dHB1dENoYW5uZWxMYWJlbCA9IGxvY2FsaXplKCdhZ2VudFNlc3Npb25zT3V0cHV0JywgXCJBZ2VudCBTZXNzaW9uc1wiKTtcblxuZnVuY3Rpb24gc3RhdHVzVG9TdHJpbmcoc3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXMpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKHN0YXR1cykge1xuXHRcdGNhc2UgQWdlbnRTZXNzaW9uU3RhdHVzLkZhaWxlZDogcmV0dXJuICdGYWlsZWQnO1xuXHRcdGNhc2UgQWdlbnRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZDogcmV0dXJuICdDb21wbGV0ZWQnO1xuXHRcdGNhc2UgQWdlbnRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3M6IHJldHVybiAnSW5Qcm9ncmVzcyc7XG5cdFx0Y2FzZSBBZ2VudFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dDogcmV0dXJuICdOZWVkc0lucHV0Jztcblx0XHRkZWZhdWx0OiByZXR1cm4gYFVua25vd24oJHtzdGF0dXN9KWA7XG5cdH1cbn1cblxuY2xhc3MgQWdlbnRTZXNzaW9uc0xvZ2dlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgaXNDaGFubmVsUmVnaXN0ZXJlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZ2V0U2Vzc2lvbnNEYXRhOiAoKSA9PiB7XG5cdFx0XHRzZXNzaW9uczogSXRlcmFibGU8SUludGVybmFsQWdlbnRTZXNzaW9uPjtcblx0XHRcdHNlc3Npb25TdGF0ZXM6IFJlc291cmNlTWFwPElBZ2VudFNlc3Npb25TdGF0ZT47XG5cdFx0fSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASU91dHB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvdXRwdXRTZXJ2aWNlOiBJT3V0cHV0U2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy51cGRhdGVDaGFubmVsUmVnaXN0cmF0aW9uKCk7XG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDaGFubmVsUmVnaXN0cmF0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYXREaXNhYmxlZCA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuaGlkZGVuO1xuXG5cdFx0aWYgKGNoYXREaXNhYmxlZCAmJiB0aGlzLmlzQ2hhbm5lbFJlZ2lzdGVyZWQpIHtcblx0XHRcdFJlZ2lzdHJ5LmFzPElPdXRwdXRDaGFubmVsUmVnaXN0cnk+KEV4dGVuc2lvbnMuT3V0cHV0Q2hhbm5lbHMpLnJlbW92ZUNoYW5uZWwoYWdlbnRTZXNzaW9uc091dHB1dENoYW5uZWxJZCk7XG5cdFx0XHR0aGlzLmlzQ2hhbm5lbFJlZ2lzdGVyZWQgPSBmYWxzZTtcblx0XHR9IGVsc2UgaWYgKCFjaGF0RGlzYWJsZWQgJiYgIXRoaXMuaXNDaGFubmVsUmVnaXN0ZXJlZCkge1xuXHRcdFx0UmVnaXN0cnkuYXM8SU91dHB1dENoYW5uZWxSZWdpc3RyeT4oRXh0ZW5zaW9ucy5PdXRwdXRDaGFubmVscykucmVnaXN0ZXJDaGFubmVsKHtcblx0XHRcdFx0aWQ6IGFnZW50U2Vzc2lvbnNPdXRwdXRDaGFubmVsSWQsXG5cdFx0XHRcdGxhYmVsOiBhZ2VudFNlc3Npb25zT3V0cHV0Q2hhbm5lbExhYmVsLFxuXHRcdFx0XHRsb2c6IGZhbHNlXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuaXNDaGFubmVsUmVnaXN0ZXJlZCA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxvZ1NlcnZpY2Uub25EaWRDaGFuZ2VMb2dMZXZlbChsZXZlbCA9PiB7XG5cdFx0XHRpZiAobGV2ZWwgPT09IExvZ0xldmVsLlRyYWNlKSB7XG5cdFx0XHRcdHRoaXMubG9nQWxsU3RhdHNJZlRyYWNlKCdMb2cgbGV2ZWwgY2hhbmdlZCB0byB0cmFjZScpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVNlbnRpbWVudCgoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZUNoYW5uZWxSZWdpc3RyYXRpb24oKTtcblx0XHR9KSk7XG5cdH1cblxuXHRsb2dJZlRyYWNlKG1zZzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubG9nU2VydmljZS5nZXRMZXZlbCgpICE9PSBMb2dMZXZlbC5UcmFjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudHJhY2UoYFtBZ2VudCBTZXNzaW9uc10gJHttc2d9YCk7XG5cdH1cblxuXHRsb2dBbGxTdGF0c0lmVHJhY2UocmVhc29uOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5sb2dTZXJ2aWNlLmdldExldmVsKCkgIT09IExvZ0xldmVsLlRyYWNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dBbGxTZXNzaW9ucyhyZWFzb24pO1xuXHRcdHRoaXMubG9nU2Vzc2lvblN0YXRlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBsb2dBbGxTZXNzaW9ucyhyZWFzb246IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHsgc2Vzc2lvbnMsIHNlc3Npb25TdGF0ZXMgfSA9IHRoaXMuZ2V0U2Vzc2lvbnNEYXRhKCk7XG5cblx0XHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblx0XHRsaW5lcy5wdXNoKGA9PT0gQWdlbnQgU2Vzc2lvbnMgKCR7cmVhc29ufSkgPT09YCk7XG5cblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdFx0Y291bnQrKztcblx0XHRcdGNvbnN0IHN0YXRlID0gc2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cblx0XHRcdGxpbmVzLnB1c2goYC0tLSBTZXNzaW9uOiAke3Nlc3Npb24ubGFiZWx9IC0tLWApO1xuXHRcdFx0bGluZXMucHVzaChgICBSZXNvdXJjZTogJHtzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRsaW5lcy5wdXNoKGAgIFByb3ZpZGVyIFR5cGU6ICR7c2Vzc2lvbi5wcm92aWRlclR5cGV9YCk7XG5cdFx0XHRsaW5lcy5wdXNoKGAgIFByb3ZpZGVyIExhYmVsOiAke3Nlc3Npb24ucHJvdmlkZXJMYWJlbH1gKTtcblx0XHRcdGxpbmVzLnB1c2goYCAgU3RhdHVzOiAke3N0YXR1c1RvU3RyaW5nKHNlc3Npb24uc3RhdHVzKX1gKTtcblx0XHRcdGxpbmVzLnB1c2goYCAgSWNvbjogJHtzZXNzaW9uLmljb24uaWR9YCk7XG5cblx0XHRcdGlmIChzZXNzaW9uLmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2goYCAgRGVzY3JpcHRpb246ICR7dHlwZW9mIHNlc3Npb24uZGVzY3JpcHRpb24gPT09ICdzdHJpbmcnID8gc2Vzc2lvbi5kZXNjcmlwdGlvbiA6IHNlc3Npb24uZGVzY3JpcHRpb24udmFsdWV9YCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2Vzc2lvbi5iYWRnZSkge1xuXHRcdFx0XHRsaW5lcy5wdXNoKGAgIEJhZGdlOiAke3R5cGVvZiBzZXNzaW9uLmJhZGdlID09PSAnc3RyaW5nJyA/IHNlc3Npb24uYmFkZ2UgOiBzZXNzaW9uLmJhZGdlLnZhbHVlfWApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNlc3Npb24udG9vbHRpcCkge1xuXHRcdFx0XHRsaW5lcy5wdXNoKGAgIFRvb2x0aXA6ICR7dHlwZW9mIHNlc3Npb24udG9vbHRpcCA9PT0gJ3N0cmluZycgPyBzZXNzaW9uLnRvb2x0aXAgOiBzZXNzaW9uLnRvb2x0aXAudmFsdWV9YCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRpbWluZyBpbmZvXG5cdFx0XHRsaW5lcy5wdXNoKGAgIFRpbWluZzpgKTtcblx0XHRcdGxpbmVzLnB1c2goYCAgICBDcmVhdGVkOiAke3Nlc3Npb24udGltaW5nLmNyZWF0ZWQgPyBuZXcgRGF0ZShzZXNzaW9uLnRpbWluZy5jcmVhdGVkKS50b0lTT1N0cmluZygpIDogJ04vQSd9YCk7XG5cdFx0XHRsaW5lcy5wdXNoKGAgICAgTGFzdCBSZXF1ZXN0IFN0YXJ0ZWQ6ICR7c2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RTdGFydGVkID8gbmV3IERhdGUoc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RTdGFydGVkKS50b0lTT1N0cmluZygpIDogJ04vQSd9YCk7XG5cdFx0XHRsaW5lcy5wdXNoKGAgICAgTGFzdCBSZXF1ZXN0IEVuZGVkOiAke3Nlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQgPyBuZXcgRGF0ZShzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdEVuZGVkKS50b0lTT1N0cmluZygpIDogJ04vQSd9YCk7XG5cblx0XHRcdC8vIENoYW5nZXMgaW5mb1xuXHRcdFx0aWYgKHNlc3Npb24uY2hhbmdlcykge1xuXHRcdFx0XHRjb25zdCBzdW1tYXJ5ID0gZ2V0QWdlbnRDaGFuZ2VzU3VtbWFyeShzZXNzaW9uLmNoYW5nZXMpO1xuXHRcdFx0XHRpZiAoc3VtbWFyeSkge1xuXHRcdFx0XHRcdGxpbmVzLnB1c2goYCAgQ2hhbmdlczogJHtzdW1tYXJ5LmZpbGVzfSBmaWxlcywgKyR7c3VtbWFyeS5pbnNlcnRpb25zfSAtJHtzdW1tYXJ5LmRlbGV0aW9uc31gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBNZXRhZGF0YVxuXHRcdFx0aWYgKHNlc3Npb24ubWV0YWRhdGEgJiYgT2JqZWN0LmtleXMoc2Vzc2lvbi5tZXRhZGF0YSkubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRsaW5lcy5wdXNoKGAgIE1ldGFkYXRhOmApO1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhzZXNzaW9uLm1ldGFkYXRhKSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlbmRlcmVkVmFsdWUgPSB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUgOiBzYWZlU3RyaW5naWZ5KHZhbHVlKTtcblx0XHRcdFx0XHRsaW5lcy5wdXNoKGAgICAgJHtrZXl9OiAke3JlbmRlcmVkVmFsdWV9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gT3VyIHN0YXRlIChyZWFkL3VucmVhZCwgYXJjaGl2ZWQpXG5cdFx0XHRsaW5lcy5wdXNoKGAgIFN0YXRlOmApO1xuXHRcdFx0bGluZXMucHVzaChgICAgIEFyY2hpdmVkIChwcm92aWRlcik6ICR7c2Vzc2lvbi5hcmNoaXZlZCA/PyAnTi9BJ31gKTtcblx0XHRcdGxpbmVzLnB1c2goYCAgICBBcmNoaXZlZCAoY29tcHV0ZWQpOiAke3Nlc3Npb24uaXNBcmNoaXZlZCgpfWApO1xuXHRcdFx0bGluZXMucHVzaChgICAgIEFyY2hpdmVkIChzdG9yZWQpOiAke3N0YXRlPy5hcmNoaXZlZCA/PyAnTi9BJ31gKTtcblx0XHRcdGxpbmVzLnB1c2goYCAgICBQaW5uZWQ6ICR7c2Vzc2lvbi5pc1Bpbm5lZCgpfWApO1xuXHRcdFx0bGluZXMucHVzaChgICAgIFBpbm5lZCAoc3RvcmVkKTogJHtzdGF0ZT8ucGlubmVkID8/ICdOL0EnfWApO1xuXHRcdFx0bGluZXMucHVzaChgICAgIFJlYWQ6ICR7c2Vzc2lvbi5pc1JlYWQoKX1gKTtcblx0XHRcdGxpbmVzLnB1c2goYCAgICBSZWFkIGRhdGUgKHN0b3JlZCk6ICR7c3RhdGU/LnJlYWQgPyBuZXcgRGF0ZShzdGF0ZS5yZWFkKS50b0lTT1N0cmluZygpIDogJ04vQSd9YCk7XG5cblx0XHRcdGxpbmVzLnB1c2goJycpO1xuXHRcdH1cblxuXHRcdGxpbmVzLnVuc2hpZnQoYFRvdGFsIHNlc3Npb25zOiAke2NvdW50fWAsICcnKTtcblxuXHRcdGxpbmVzLnB1c2goYD09PSBFbmQgQWdlbnQgU2Vzc2lvbnMgPT09YCk7XG5cblx0XHR0aGlzLnRyYWNlKGxpbmVzLmpvaW4oJ1xcbicpKTtcblx0fVxuXG5cdHByaXZhdGUgbG9nU2Vzc2lvblN0YXRlcygpOiB2b2lkIHtcblx0XHRjb25zdCB7IHNlc3Npb25TdGF0ZXMgfSA9IHRoaXMuZ2V0U2Vzc2lvbnNEYXRhKCk7XG5cblx0XHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblx0XHRsaW5lcy5wdXNoKGA9PT0gU2Vzc2lvbiBTdGF0ZXMgPT09YCk7XG5cdFx0bGluZXMucHVzaChgVG90YWwgc3RvcmVkIHN0YXRlczogJHtzZXNzaW9uU3RhdGVzLnNpemV9YCk7XG5cdFx0bGluZXMucHVzaCgnJyk7XG5cblx0XHRmb3IgKGNvbnN0IFtyZXNvdXJjZSwgc3RhdGVdIG9mIHNlc3Npb25TdGF0ZXMpIHtcblx0XHRcdGxpbmVzLnB1c2goYFVSSTogJHtyZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdFx0bGluZXMucHVzaChgICBBcmNoaXZlZDogJHtzdGF0ZS5hcmNoaXZlZH1gKTtcblx0XHRcdGxpbmVzLnB1c2goYCAgUGlubmVkOiAke3N0YXRlLnBpbm5lZH1gKTtcblx0XHRcdGxpbmVzLnB1c2goYCAgUmVhZDogJHtzdGF0ZS5yZWFkID8gbmV3IERhdGUoc3RhdGUucmVhZCkudG9JU09TdHJpbmcoKSA6ICcwICh1bnJlYWQpJ31gKTtcblx0XHRcdGxpbmVzLnB1c2goJycpO1xuXHRcdH1cblxuXHRcdGxpbmVzLnB1c2goYD09PSBFbmQgU2Vzc2lvbiBTdGF0ZXMgPT09YCk7XG5cblx0XHR0aGlzLnRyYWNlKGxpbmVzLmpvaW4oJ1xcbicpKTtcblx0fVxuXG5cdHByaXZhdGUgdHJhY2UobXNnOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjaGFubmVsID0gdGhpcy5vdXRwdXRTZXJ2aWNlLmdldENoYW5uZWwoYWdlbnRTZXNzaW9uc091dHB1dENoYW5uZWxJZCk7XG5cdFx0aWYgKCFjaGFubmVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y2hhbm5lbC5hcHBlbmQoYCR7bXNnfVxcbmApO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG5leHBvcnQgY2xhc3MgQWdlbnRTZXNzaW9uc01vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudFNlc3Npb25zTW9kZWwge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbFJlc29sdmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbldpbGxSZXNvbHZlID0gdGhpcy5fb25XaWxsUmVzb2x2ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlc29sdmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlc29sdmUgPSB0aGlzLl9vbkRpZFJlc29sdmUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZXNzaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlc3Npb25BcmNoaXZlZFN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUFnZW50U2Vzc2lvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbkFyY2hpdmVkU3RhdGUgPSB0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25BcmNoaXZlZFN0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgX3Jlc29sdmVkID0gZmFsc2U7XG5cdGdldCByZXNvbHZlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX3Jlc29sdmVkOyB9XG5cblx0cHJpdmF0ZSBfc2Vzc2lvbnM6IFJlc291cmNlTWFwPElJbnRlcm5hbEFnZW50U2Vzc2lvbj47XG5cdGdldCBzZXNzaW9ucygpOiBJQWdlbnRTZXNzaW9uW10geyByZXR1cm4gQXJyYXkuZnJvbSh0aGlzLl9zZXNzaW9ucy52YWx1ZXMoKSk7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlc29sdmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgVGhyb3R0bGVkRGVsYXllcjx2b2lkPj4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjYWNoZTogQWdlbnRTZXNzaW9uc0NhY2hlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGxvZ2dlcjogQWdlbnRTZXNzaW9uc0xvZ2dlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3Nlc3Npb25zID0gbmV3IFJlc291cmNlTWFwPElJbnRlcm5hbEFnZW50U2Vzc2lvbj4oKTtcblxuXHRcdHRoaXMuY2FjaGUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNDYWNoZSk7XG5cdFx0Zm9yIChjb25zdCBkYXRhIG9mIHRoaXMuY2FjaGUubG9hZENhY2hlZFNlc3Npb25zKCkpIHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnRvQWdlbnRTZXNzaW9uKGRhdGEpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KHNlc3Npb24ucmVzb3VyY2UsIHNlc3Npb24pO1xuXHRcdH1cblx0XHR0aGlzLnNlc3Npb25TdGF0ZXMgPSB0aGlzLmNhY2hlLmxvYWRTZXNzaW9uU3RhdGVzKCk7XG5cblx0XHR0aGlzLmxvZ2dlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRBZ2VudFNlc3Npb25zTG9nZ2VyLFxuXHRcdFx0KCkgPT4gKHtcblx0XHRcdFx0c2Vzc2lvbnM6IHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpLFxuXHRcdFx0XHRzZXNzaW9uU3RhdGVzOiB0aGlzLnNlc3Npb25TdGF0ZXMsXG5cdFx0XHR9KVxuXHRcdCkpO1xuXHRcdHRoaXMubG9nZ2VyLmxvZ0FsbFN0YXRzSWZUcmFjZSgnTG9hZGVkIGNhY2hlZCBzZXNzaW9ucycpO1xuXG5cdFx0dGhpcy5yZWFkRGF0ZUJhc2VsaW5lID0gdGhpcy5yZXNvbHZlUmVhZERhdGVCYXNlbGluZSgpOyAvLyB3ZSB1c2UgdGhpcyB0byBhY2NvdW50IGZvciBidWdmaXhlcyBpbiB0aGUgcmVhZC91bnJlYWQgdHJhY2tpbmdcblx0XHR0aGlzLmxvYWRNaWdyYXRlZFJlYWRSZXNvdXJjZXMoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBTZXNzaW9ucyB1cGRhdGVzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlSXRlbXNQcm92aWRlcnMoKHsgY2hhdFNlc3Npb25UeXBlIH0pID0+IHRoaXMucmVzb2x2ZShjaGF0U2Vzc2lvblR5cGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlQXZhaWxhYmlsaXR5KCgpID0+IHRoaXMucmVzb2x2ZSh1bmRlZmluZWQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbkl0ZW1zKChkZWx0YSkgPT4ge1xuXHRcdFx0Y29uc3QgY2hhbmdlZENoYXRTZXNzaW9uVHlwZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiBkZWx0YS5hZGRlZE9yVXBkYXRlZCA/PyBbXSkge1xuXHRcdFx0XHRjaGFuZ2VkQ2hhdFNlc3Npb25UeXBlcy5hZGQoZ2V0Q2hhdFNlc3Npb25UeXBlKHJlc291cmNlLnJlc291cmNlKSk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgZGVsdGEucmVtb3ZlZCA/PyBbXSkge1xuXHRcdFx0XHRjaGFuZ2VkQ2hhdFNlc3Npb25UeXBlcy5hZGQoZ2V0Q2hhdFNlc3Npb25UeXBlKHJlc291cmNlKSk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgY2hhdFNlc3Npb25UeXBlIG9mIGNoYW5nZWRDaGF0U2Vzc2lvblR5cGVzKSB7XG5cdFx0XHRcdHRoaXMucmVzb2x2ZVByb3ZpZGVyKGNoYXRTZXNzaW9uVHlwZSwgeyByZWZyZXNoUHJvdmlkZXI6IGZhbHNlIC8qIHNraXAgYmVjYXVzZSB3ZSByZWFjdCBvbiBhbiBldmVudCBhbHJlYWR5ICovIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycygoKSA9PiB0aGlzLnJlc29sdmUodW5kZWZpbmVkKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVRydXN0KCgpID0+IHRoaXMucmVzb2x2ZSh1bmRlZmluZWQpKSk7XG5cblx0XHQvLyBTdGF0ZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKCgpID0+IHtcblx0XHRcdHRoaXMuY2FjaGUuc2F2ZUNhY2hlZFNlc3Npb25zKEFycmF5LmZyb20odGhpcy5fc2Vzc2lvbnMudmFsdWVzKCkpKTtcblx0XHRcdHRoaXMuY2FjaGUuc2F2ZVNlc3Npb25TdGF0ZXModGhpcy5zZXNzaW9uU3RhdGVzKTtcblx0XHR9KSk7XG5cdH1cblxuXHRnZXRTZXNzaW9uKHJlc291cmNlOiBVUkkpOiBJQWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbnMuZ2V0KHJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgX2NoYW5nZWRTaWduYWw6IElPYnNlcnZhYmxlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uT2JzZXJ2YWJsZXMgPSBuZXcgUmVzb3VyY2VNYXA8SU9ic2VydmFibGU8SUFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZD4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc29sdmVkUmVzb3VyY2VzID0gbmV3IFJlc291cmNlU2V0KCk7XG5cblx0b2JzZXJ2ZVNlc3Npb24ocmVzb3VyY2U6IFVSSSk6IElPYnNlcnZhYmxlPElBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBUcmlnZ2VyIHJlc29sdmUgaWYgbm90IHlldCByZXNvbHZlZCBmb3IgdGhpcyByZXNvdXJjZSAob3IgaWZcblx0XHQvLyB0aGUgZ3VhcmQgd2FzIGNsZWFyZWQgYWZ0ZXIgYSBwcm92aWRlciByZWZyZXNoKS4gVGhpcyBpc1xuXHRcdC8vIHNlcGFyYXRlZCBmcm9tIHRoZSBvYnNlcnZhYmxlIGNhY2hlIHNvIHRoYXQgcmUtY2FsbHMgYWZ0ZXIgYVxuXHRcdC8vIHJlZnJlc2ggcmUtdHJpZ2dlciB0aGUgcmVzb2x2ZSBSUEMgZXZlbiB0aG91Z2ggdGhlIG9ic2VydmFibGVcblx0XHQvLyBhbHJlYWR5IGV4aXN0cy5cblx0XHRpZiAoIXRoaXMuX3Jlc29sdmVkUmVzb3VyY2VzLmhhcyhyZXNvdXJjZSkpIHtcblx0XHRcdHRoaXMuX3Jlc29sdmVkUmVzb3VyY2VzLmFkZChyZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IGdldENoYXRTZXNzaW9uVHlwZShyZXNvdXJjZSk7XG5cdFx0XHR0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UucmVzb2x2ZUNoYXRTZXNzaW9uSXRlbShzZXNzaW9uVHlwZSwgcmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpXG5cdFx0XHRcdC5jYXRjaChlcnJvciA9PiB0aGlzLmxvZ2dlci5sb2dJZlRyYWNlKGBvYnNlcnZlU2Vzc2lvbjogcmVzb2x2ZSBmYWlsZWQgZm9yICR7cmVzb3VyY2UudG9TdHJpbmcoKX06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApKTtcblx0XHR9XG5cblx0XHRsZXQgb2JzZXJ2YWJsZSA9IHRoaXMuX3Nlc3Npb25PYnNlcnZhYmxlcy5nZXQocmVzb3VyY2UpO1xuXHRcdGlmICghb2JzZXJ2YWJsZSkge1xuXHRcdFx0dGhpcy5fY2hhbmdlZFNpZ25hbCA/Pz0gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCgnYWdlbnRTZXNzaW9uc0NoYW5nZWQnLCB0aGlzLm9uRGlkQ2hhbmdlU2Vzc2lvbnMpO1xuXHRcdFx0Y29uc3Qgc2lnbmFsID0gdGhpcy5fY2hhbmdlZFNpZ25hbDtcblx0XHRcdG9ic2VydmFibGUgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRcdHNpZ25hbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9zZXNzaW9ucy5nZXQocmVzb3VyY2UpO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uT2JzZXJ2YWJsZXMuc2V0KHJlc291cmNlLCBvYnNlcnZhYmxlKTtcblx0XHR9XG5cdFx0cmV0dXJuIG9ic2VydmFibGU7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlKHByb3ZpZGVyOiBzdHJpbmcgfCBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVycyA9IEFycmF5LmlzQXJyYXkocHJvdmlkZXIpXG5cdFx0XHQ/IHByb3ZpZGVyXG5cdFx0XHQ6IHByb3ZpZGVyICE9PSB1bmRlZmluZWRcblx0XHRcdFx0PyBbcHJvdmlkZXJdXG5cdFx0XHRcdDogdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldFJlZ2lzdGVyZWRDaGF0U2Vzc2lvbkl0ZW1Qcm92aWRlcnMoKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKHByb3ZpZGVycy5tYXAocHJvdmlkZXIgPT4gdGhpcy5yZXNvbHZlUHJvdmlkZXIocHJvdmlkZXIsIHsgcmVmcmVzaFByb3ZpZGVyOiB0cnVlIH0pKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVQcm92aWRlcihwcm92aWRlcjogc3RyaW5nLCBvcHRpb25zOiB7IHJlZnJlc2hQcm92aWRlcjogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuaGlkZGVuKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7IC8vIGRvbid0IHJlc29sdmUgaWYgQUkgZmVhdHVyZXMgYXJlIGRpc2FibGVkXG5cdFx0fVxuXG5cdFx0bGV0IHJlc29sdmVyID0gdGhpcy5yZXNvbHZlcnMuZ2V0KHByb3ZpZGVyKTtcblx0XHRpZiAoIXJlc29sdmVyKSB7XG5cdFx0XHRyZXNvbHZlciA9IG5ldyBUaHJvdHRsZWREZWxheWVyPHZvaWQ+KDUwMCk7XG5cdFx0XHR0aGlzLnJlc29sdmVycy5zZXQocHJvdmlkZXIsIHJlc29sdmVyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzb2x2ZXIudHJpZ2dlcihhc3luYyB0b2tlbiA9PiB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgdGhpcy5saWZlY3ljbGVTZXJ2aWNlLndpbGxTaHV0ZG93bikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX29uV2lsbFJlc29sdmUuZmlyZShwcm92aWRlcik7XG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmRvUmVzb2x2ZVByb3ZpZGVyKHByb3ZpZGVyLCBvcHRpb25zLCB0b2tlbik7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ2dlci5sb2dJZlRyYWNlKGBFcnJvciByZXNvbHZpbmcgc2Vzc2lvbnMgZm9yIHByb3ZpZGVyICR7cHJvdmlkZXJ9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5zdGFjayA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFJlc29sdmUuZmlyZShwcm92aWRlcik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUmVzb2x2ZVByb3ZpZGVyKHByb3ZpZGVyOiBzdHJpbmcsIG9wdGlvbnM6IHsgcmVmcmVzaFByb3ZpZGVyOiBib29sZWFuIH0sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChvcHRpb25zLnJlZnJlc2hQcm92aWRlcikge1xuXHRcdFx0YXdhaXQgdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZnJlc2hDaGF0U2Vzc2lvbkl0ZW1zKFtwcm92aWRlcl0sIHRva2VuKTtcblxuXHRcdFx0Ly8gQ2xlYXIgdGhlIHJlc29sdmUtb25jZSBndWFyZCBmb3Igc2Vzc2lvbnMgYmVsb25naW5nIHRvIHRoaXNcblx0XHRcdC8vIHByb3ZpZGVyIGFuZCByZS10cmlnZ2VyIHJlc29sdmUgZm9yIGFueSB0aGF0IHdlcmUgcHJldmlvdXNseVxuXHRcdFx0Ly8gb2JzZXJ2ZWQuIFRoaXMgaXMgbmVjZXNzYXJ5IGJlY2F1c2UgdGhlIHJlZnJlc2ggcmV0dXJucyBpdGVtc1xuXHRcdFx0Ly8gd2l0aCBsYXp5IHByb3BlcnRpZXMgKGUuZy4gY2hhbmdlczogdW5kZWZpbmVkKSB0aGF0IG5lZWQgYVxuXHRcdFx0Ly8gZnJlc2ggcmVzb2x2ZSBSUEMuIFJlLWNhbGxpbmcgb2JzZXJ2ZVNlc3Npb24oKSBmb3IgcmVzb3VyY2VzXG5cdFx0XHQvLyBhbHJlYWR5IGluIF9zZXNzaW9uT2JzZXJ2YWJsZXMgaXMgY2hlYXAgKHRoZSBvYnNlcnZhYmxlIGlzXG5cdFx0XHQvLyBjYWNoZWQpIGFuZCBvbmx5IGZpcmVzIHRoZSBSUEMgc2lkZS1lZmZlY3QuXG5cdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIFsuLi50aGlzLl9yZXNvbHZlZFJlc291cmNlc10pIHtcblx0XHRcdFx0aWYgKGdldENoYXRTZXNzaW9uVHlwZShyZXNvdXJjZSkgPT09IHByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVzb2x2ZWRSZXNvdXJjZXMuZGVsZXRlKHJlc291cmNlKTtcblx0XHRcdFx0XHRpZiAodGhpcy5fc2Vzc2lvbk9ic2VydmFibGVzLmhhcyhyZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdHRoaXMub2JzZXJ2ZVNlc3Npb24ocmVzb3VyY2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1hcFNlc3Npb25Db250cmlidXRpb25Ub1R5cGUgPSBuZXcgTWFwPHN0cmluZywgUmVzb2x2ZWRDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludD4oKTtcblx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zKCkpIHtcblx0XHRcdG1hcFNlc3Npb25Db250cmlidXRpb25Ub1R5cGUuc2V0KGNvbnRyaWJ1dGlvbi50eXBlLCBjb250cmlidXRpb24pO1xuXHRcdH1cblxuXHRcdC8vIFBoYXNlIDE6IEZldGNoIG5ldyBpdGVtcyBmb3IgdGhpcyBwcm92aWRlciAoYXN5bmMsIG1heSBpbnRlcmxlYXZlIHdpdGggb3RoZXIgcHJvdmlkZXJzKVxuXHRcdGNvbnN0IHNlc3Npb25zID0gbmV3IFJlc291cmNlTWFwPElJbnRlcm5hbEFnZW50U2Vzc2lvbj4oKTtcblx0XHRmb3IgYXdhaXQgKGNvbnN0IHsgY2hhdFNlc3Npb25UeXBlLCBpdGVtczogcHJvdmlkZXJTZXNzaW9ucyB9IG9mIHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0U2Vzc2lvbkl0ZW1zKFtwcm92aWRlcl0sIHRva2VuKSkge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHByb3ZpZGVyU2Vzc2lvbnMpIHtcblx0XHRcdFx0bGV0IGljb246IFRoZW1lSWNvbjtcblx0XHRcdFx0bGV0IHByb3ZpZGVyTGFiZWw6IHN0cmluZztcblx0XHRcdFx0Y29uc3QgYWdlbnRTZXNzaW9uUHJvdmlkZXIgPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlcihjaGF0U2Vzc2lvblR5cGUpO1xuXHRcdFx0XHRpZiAoYWdlbnRTZXNzaW9uUHJvdmlkZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHByb3ZpZGVyTGFiZWwgPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUoYWdlbnRTZXNzaW9uUHJvdmlkZXIpO1xuXHRcdFx0XHRcdGljb24gPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckljb24oYWdlbnRTZXNzaW9uUHJvdmlkZXIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHByb3ZpZGVyTGFiZWwgPSBtYXBTZXNzaW9uQ29udHJpYnV0aW9uVG9UeXBlLmdldChjaGF0U2Vzc2lvblR5cGUpPy5uYW1lID8/IGNoYXRTZXNzaW9uVHlwZTtcblx0XHRcdFx0XHRpY29uID0gc2Vzc2lvbi5pY29uUGF0aCA/PyBDb2RpY29uLnRlcm1pbmFsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY2hhbmdlcyA9IHNlc3Npb24uY2hhbmdlcztcblx0XHRcdFx0Y29uc3Qgbm9ybWFsaXplZENoYW5nZXMgPSBjaGFuZ2VzICYmICEoY2hhbmdlcyBpbnN0YW5jZW9mIEFycmF5KVxuXHRcdFx0XHRcdD8geyBmaWxlczogY2hhbmdlcy5maWxlcywgaW5zZXJ0aW9uczogY2hhbmdlcy5pbnNlcnRpb25zLCBkZWxldGlvbnM6IGNoYW5nZXMuZGVsZXRpb25zIH1cblx0XHRcdFx0XHQ6IGNoYW5nZXM7XG5cdFx0XHRcdGNvbnN0IHNob3VsZEtlZXBPcGVuU2Vzc2lvblJlYWQgPSBzZXNzaW9uLmlzUmVhZCA9PT0gZmFsc2Vcblx0XHRcdFx0XHQmJiB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuY2FuU2V0Q2hhdFNlc3Npb25JdGVtUmVhZChzZXNzaW9uLnJlc291cmNlKVxuXHRcdFx0XHRcdCYmICF0aGlzLmV4cGxpY2l0bHlNYXJrZWRVbnJlYWRTZXNzaW9ucy5oYXMoc2Vzc2lvbi5yZXNvdXJjZSlcblx0XHRcdFx0XHQmJiAhIXRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2Uoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChzaG91bGRLZWVwT3BlblNlc3Npb25SZWFkKSB7XG5cdFx0XHRcdFx0dGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLnNldENoYXRTZXNzaW9uSXRlbVJlYWQoc2Vzc2lvbi5yZXNvdXJjZSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHNlc3Npb24uaXNSZWFkKSB7XG5cdFx0XHRcdFx0dGhpcy5leHBsaWNpdGx5TWFya2VkVW5yZWFkU2Vzc2lvbnMuZGVsZXRlKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2Vzc2lvbnMuc2V0KHNlc3Npb24ucmVzb3VyY2UsIHRoaXMudG9BZ2VudFNlc3Npb24oe1xuXHRcdFx0XHRcdHByb3ZpZGVyVHlwZTogY2hhdFNlc3Npb25UeXBlLFxuXHRcdFx0XHRcdHByb3ZpZGVyTGFiZWwsXG5cdFx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb24ucmVzb3VyY2UsXG5cdFx0XHRcdFx0bGFiZWw6IHNlc3Npb24ubGFiZWwuc3BsaXQoJ1xcbicpWzBdLCAvLyBwcm90ZWN0IGFnYWluc3Qgd2VpcmQgbXVsdGktbGluZSBsYWJlbHMgdGhhdCBicmVhayBvdXIgbGF5b3V0XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHNlc3Npb24uZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0aWNvbixcblx0XHRcdFx0XHRiYWRnZTogc2Vzc2lvbi5iYWRnZSxcblx0XHRcdFx0XHR0b29sdGlwOiBzZXNzaW9uLnRvb2x0aXAsXG5cdFx0XHRcdFx0c3RhdHVzOiBzZXNzaW9uLnN0YXR1cyA/PyBBZ2VudFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRcdGFyY2hpdmVkOiBzZXNzaW9uLmFyY2hpdmVkLFxuXHRcdFx0XHRcdHByb3ZpZGVySXNSZWFkOiBzaG91bGRLZWVwT3BlblNlc3Npb25SZWFkID8gdHJ1ZSA6IHNlc3Npb24uaXNSZWFkLFxuXHRcdFx0XHRcdHRpbWluZzogc2Vzc2lvbi50aW1pbmcsXG5cdFx0XHRcdFx0Y2hhbmdlczogbm9ybWFsaXplZENoYW5nZXMsXG5cdFx0XHRcdFx0bWV0YWRhdGE6IHNlc3Npb24ubWV0YWRhdGEsXG5cdFx0XHRcdFx0bGVnYWN5UmVzb3VyY2U6IHNlc3Npb24ubGVnYWN5UmVzb3VyY2UsXG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBQaGFzZSAyOiBBdG9taWNhbGx5IHVwZGF0ZSBzZXNzaW9ucyAoc3luYyAtIHJlYWRzIGxhdGVzdCB0aGlzLl9zZXNzaW9uc1xuXHRcdC8vIHNvIGNvbmN1cnJlbnQgdXBkYXRlSXRlbXMgY2FsbHMgZm9yIG90aGVyIHByb3ZpZGVycyBkb24ndCBsb3NlIGRhdGEpXG5cblx0XHRmb3IgKGNvbnN0IFssIHNlc3Npb25dIG9mIHRoaXMuX3Nlc3Npb25zKSB7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdHNlc3Npb24ucHJvdmlkZXJUeXBlICE9PSBwcm92aWRlciAmJlxuXHRcdFx0XHQhc2Vzc2lvbnMuaGFzKHNlc3Npb24ucmVzb3VyY2UpICYmXG5cdFx0XHRcdChpc0J1aWx0SW5BZ2VudFNlc3Npb25Qcm92aWRlcihzZXNzaW9uLnByb3ZpZGVyVHlwZSkgfHwgbWFwU2Vzc2lvbkNvbnRyaWJ1dGlvblRvVHlwZS5oYXMoc2Vzc2lvbi5wcm92aWRlclR5cGUpKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHNlc3Npb25zLnNldChzZXNzaW9uLnJlc291cmNlLCBzZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiB0aGlzLmV4cGxpY2l0bHlNYXJrZWRVbnJlYWRTZXNzaW9ucykge1xuXHRcdFx0aWYgKCFzZXNzaW9ucy5oYXMocmVzb3VyY2UpKSB7XG5cdFx0XHRcdHRoaXMuZXhwbGljaXRseU1hcmtlZFVucmVhZFNlc3Npb25zLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbnNXaXRoQ2hhbmdlZEFyY2hpdmVkU3RhdGU6IElJbnRlcm5hbEFnZW50U2Vzc2lvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBbLCBzZXNzaW9uXSBvZiBzZXNzaW9ucykge1xuXHRcdFx0Y29uc3QgcHJldmlvdXNTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0aWYgKHByZXZpb3VzU2Vzc2lvbiAmJiB0aGlzLmlzQXJjaGl2ZWQocHJldmlvdXNTZXNzaW9uKSAhPT0gdGhpcy5pc0FyY2hpdmVkKHNlc3Npb24pKSB7XG5cdFx0XHRcdHNlc3Npb25zV2l0aENoYW5nZWRBcmNoaXZlZFN0YXRlLnB1c2goc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2Vzc2lvbnMgPSBzZXNzaW9ucztcblx0XHR0aGlzLl9yZXNvbHZlZCA9IHRydWU7XG5cblx0XHR0aGlzLm1pZ3JhdGVSZWFkU3RhdGVUb1Byb3ZpZGVyKHNlc3Npb25zLnZhbHVlcygpKTtcblxuXHRcdHRoaXMubG9nZ2VyLmxvZ0FsbFN0YXRzSWZUcmFjZSgnU2Vzc2lvbnMgcmVzb2x2ZWQgZnJvbSBwcm92aWRlcnMnKTtcblxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9uc1dpdGhDaGFuZ2VkQXJjaGl2ZWRTdGF0ZSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uQXJjaGl2ZWRTdGF0ZS5maXJlKHNlc3Npb24pO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgdG9BZ2VudFNlc3Npb24oZGF0YTogSUludGVybmFsQWdlbnRTZXNzaW9uRGF0YSk6IElJbnRlcm5hbEFnZW50U2Vzc2lvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmRhdGEsXG5cdFx0XHRpc0FyY2hpdmVkOiAoKSA9PiB0aGlzLmlzQXJjaGl2ZWQoZGF0YSksXG5cdFx0XHRzZXRBcmNoaXZlZDogKGFyY2hpdmVkOiBib29sZWFuKSA9PiB0aGlzLnNldEFyY2hpdmVkKGRhdGEsIGFyY2hpdmVkKSxcblx0XHRcdGlzUGlubmVkOiAoKSA9PiB0aGlzLmlzUGlubmVkKGRhdGEpLFxuXHRcdFx0c2V0UGlubmVkOiAocGlubmVkOiBib29sZWFuKSA9PiB0aGlzLnNldFBpbm5lZChkYXRhLCBwaW5uZWQpLFxuXHRcdFx0aXNSZWFkOiAoKSA9PiB0aGlzLmlzUmVhZChkYXRhKSxcblx0XHRcdGlzTWFya2VkVW5yZWFkOiAoKSA9PiB0aGlzLmlzTWFya2VkVW5yZWFkKGRhdGEpLFxuXHRcdFx0c2V0UmVhZDogKHJlYWQ6IGJvb2xlYW4pID0+IHRoaXMuc2V0UmVhZChkYXRhLCByZWFkKSxcblx0XHR9O1xuXHR9XG5cblx0Ly8jcmVnaW9uIFN0YXRlc1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFVOUkVBRF9NQVJLRVIgPSAtMTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25TdGF0ZXM6IFJlc291cmNlTWFwPElBZ2VudFNlc3Npb25TdGF0ZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgZXhwbGljaXRseU1hcmtlZFVucmVhZFNlc3Npb25zID0gbmV3IFJlc291cmNlU2V0KCk7XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgdGhlIHN0YXRlIGVudHJ5IGZvciBhIHNlc3Npb24sIGhvbm9yaW5nIGEgb25lLXdheSBtaWdyYXRpb24gZnJvbVxuXHQgKiB7QGxpbmsgSUFnZW50U2Vzc2lvbkRhdGEubGVnYWN5UmVzb3VyY2V9IHdoZW4gbm8gZW50cnkgeWV0IGV4aXN0cyBmb3IgdGhlXG5cdCAqIHNlc3Npb24ncyBjdXJyZW50IHJlc291cmNlLiBBZG9wdHMgdGhlIGxlZ2FjeSBlbnRyeSBmb3J3YXJkIChjb3BpZXMgaXQgb250b1xuXHQgKiB0aGUgY3VycmVudCByZXNvdXJjZSBrZXkgYW5kIHJlbW92ZXMgdGhlIGxlZ2FjeSBlbnRyeSkuIFJldHVybnMgdW5kZWZpbmVkIGlmXG5cdCAqIG5laXRoZXIgYSBjdXJyZW50IG5vciBhIGxlZ2FjeSBlbnRyeSBleGlzdHMuXG5cdCAqL1xuXHRwcml2YXRlIHJlc29sdmVTdGF0ZUVudHJ5KHNlc3Npb246IElJbnRlcm5hbEFnZW50U2Vzc2lvbkRhdGEpOiBJQWdlbnRTZXNzaW9uU3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG93biA9IHRoaXMuc2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0aWYgKG93biAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gb3duO1xuXHRcdH1cblx0XHRjb25zdCBsZWdhY3kgPSBzZXNzaW9uLmxlZ2FjeVJlc291cmNlO1xuXHRcdGlmICghbGVnYWN5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBDcm9zcy1zY2hlbWUgYW5kIHNlbGYtcmVmZXJlbnRpYWwgbWFwcGluZ3MgYXJlIHJlamVjdGVkIGRlZmVuc2l2ZWx5LlxuXHRcdGlmIChsZWdhY3kuc2NoZW1lICE9PSBzZXNzaW9uLnJlc291cmNlLnNjaGVtZSB8fCBsZWdhY3kudG9TdHJpbmcoKSA9PT0gc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwcmV2ID0gdGhpcy5zZXNzaW9uU3RhdGVzLmdldChsZWdhY3kpO1xuXHRcdGlmIChwcmV2ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuc2Vzc2lvblN0YXRlcy5zZXQoc2Vzc2lvbi5yZXNvdXJjZSwgeyAuLi5wcmV2IH0pO1xuXHRcdHRoaXMuc2Vzc2lvblN0YXRlcy5kZWxldGUobGVnYWN5KTtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uLnJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgaXNBcmNoaXZlZChzZXNzaW9uOiBJSW50ZXJuYWxBZ2VudFNlc3Npb25EYXRhKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5jYW5TZXRDaGF0U2Vzc2lvbkl0ZW1BcmNoaXZlZChzZXNzaW9uLnJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIEJvb2xlYW4oc2Vzc2lvbi5hcmNoaXZlZCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnJlc29sdmVTdGF0ZUVudHJ5KHNlc3Npb24pPy5hcmNoaXZlZCA/PyBCb29sZWFuKHNlc3Npb24uYXJjaGl2ZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRBcmNoaXZlZChzZXNzaW9uOiBJSW50ZXJuYWxBZ2VudFNlc3Npb25EYXRhLCBhcmNoaXZlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChhcmNoaXZlZCkge1xuXHRcdFx0dGhpcy5zZXRSZWFkKHNlc3Npb24sIHRydWUpOyAvLyBtYXJrIGFzIHJlYWQgd2hlbiBhcmNoaXZpbmdcblx0XHR9XG5cblx0XHRpZiAoYXJjaGl2ZWQgPT09IHRoaXMuaXNBcmNoaXZlZChzZXNzaW9uKSkge1xuXHRcdFx0cmV0dXJuOyAvLyBubyBjaGFuZ2Vcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmNhblNldENoYXRTZXNzaW9uSXRlbUFyY2hpdmVkKHNlc3Npb24ucmVzb3VyY2UpKSB7XG5cdFx0XHR0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uuc2V0Q2hhdFNlc3Npb25JdGVtQXJjaGl2ZWQoc2Vzc2lvbi5yZXNvdXJjZSwgYXJjaGl2ZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5yZXNvbHZlU3RhdGVFbnRyeShzZXNzaW9uKSA/PyB7fTtcblx0XHR0aGlzLnNlc3Npb25TdGF0ZXMuc2V0KHNlc3Npb24ucmVzb3VyY2UsIHsgLi4uc3RhdGUsIGFyY2hpdmVkIH0pO1xuXG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGlmIChhZ2VudFNlc3Npb24pIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbkFyY2hpdmVkU3RhdGUuZmlyZShhZ2VudFNlc3Npb24pO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1Bpbm5lZChzZXNzaW9uOiBJSW50ZXJuYWxBZ2VudFNlc3Npb25EYXRhKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucmVzb2x2ZVN0YXRlRW50cnkoc2Vzc2lvbik/LnBpbm5lZCA/PyBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgc2V0UGlubmVkKHNlc3Npb246IElJbnRlcm5hbEFnZW50U2Vzc2lvbkRhdGEsIHBpbm5lZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChwaW5uZWQgPT09IHRoaXMuaXNQaW5uZWQoc2Vzc2lvbikpIHtcblx0XHRcdHJldHVybjsgLy8gbm8gY2hhbmdlXG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnJlc29sdmVTdGF0ZUVudHJ5KHNlc3Npb24pID8/IHt9O1xuXHRcdHRoaXMuc2Vzc2lvblN0YXRlcy5zZXQoc2Vzc2lvbi5yZXNvdXJjZSwgeyAuLi5zdGF0ZSwgcGlubmVkIH0pO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIGlzTWFya2VkVW5yZWFkKHNlc3Npb246IElJbnRlcm5hbEFnZW50U2Vzc2lvbkRhdGEpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5vd25zUmVhZFN0YXRlKHNlc3Npb24pKSB7XG5cdFx0XHRyZXR1cm4gIXRoaXMuaXNSZWFkKHNlc3Npb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnJlc29sdmVTdGF0ZUVudHJ5KHNlc3Npb24pPy5yZWFkID09PSBBZ2VudFNlc3Npb25zTW9kZWwuVU5SRUFEX01BUktFUjtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBzZXNzaW9uJ3MgcHJvdmlkZXIgb3ducyByZWFkIHN0YXRlLiBXaGVuIGl0IGRvZXMgdGhlIHZhbHVlIGlzXG5cdCAqIHNoYXJlZCB3aXRoIGV2ZXJ5IG90aGVyIGNsaWVudCBvbiB0aGUgc2FtZSBiYWNrZW5kICh0aGUgYWdlbnQgd2luZG93LCBvclxuXHQgKiBhbm90aGVyIHdpbmRvdyBvbiB0aGUgc2FtZSBhZ2VudCBob3N0KSwgc28gdGhlIGxvY2FsIGhldXJpc3RpY3MgYmVsb3cgbXVzdFxuXHQgKiBub3Qgc2Vjb25kLWd1ZXNzIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBvd25zUmVhZFN0YXRlKHNlc3Npb246IElJbnRlcm5hbEFnZW50U2Vzc2lvbkRhdGEpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmNhblNldENoYXRTZXNzaW9uSXRlbVJlYWQoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIGlzUmVhZChzZXNzaW9uOiBJSW50ZXJuYWxBZ2VudFNlc3Npb25EYXRhKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuaXNBcmNoaXZlZChzZXNzaW9uKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIGFyY2hpdmVkIHNlc3Npb25zIGFyZSBhbHdheXMgcmVhZFxuXHRcdH1cblxuXHRcdGlmICh0aGlzLm93bnNSZWFkU3RhdGUoc2Vzc2lvbikpIHtcblx0XHRcdC8vIE5vdCB5ZXQgcmVwb3J0ZWQgKGUuZy4ganVzdCBjcmVhdGVkIGluIHRoaXMgd2luZG93KTogdHJlYXQgYXMgcmVhZC5cblx0XHRcdHJldHVybiBzZXNzaW9uLnByb3ZpZGVySXNSZWFkID8/IHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RvcmVkUmVhZERhdGUgPSB0aGlzLnJlc29sdmVTdGF0ZUVudHJ5KHNlc3Npb24pPy5yZWFkO1xuXHRcdGlmIChzdG9yZWRSZWFkRGF0ZSA9PT0gQWdlbnRTZXNzaW9uc01vZGVsLlVOUkVBRF9NQVJLRVIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5sb2NhbFJlYWREYXRlQ292ZXJzQWN0aXZpdHkoc2Vzc2lvbiwgc3RvcmVkUmVhZERhdGUpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBOZXZlciBjb25zaWRlciBhIHNlc3Npb24gYXMgdW5yZWFkIGlmIGl0cyBjb25uZWN0ZWQgdG8gYSB3aWRnZXRcblx0XHRyZXR1cm4gISF0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHNlc3Npb24ucmVzb3VyY2UpO1xuXHR9XG5cblx0LyoqIEdyYWNlIHdpbmRvdyBhYnNvcmJpbmcgYSBjbGljayBhd2F5IGZyb20gYSBzZXNzaW9uIGp1c3QgYmVmb3JlIGl0IGZpbmlzaGVzLiAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBSRUFEX0dSQUNFX1dJTkRPVyA9IDIwMDA7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGxvY2FsbHktc3RvcmVkIHJlYWQgdGltZXN0YW1wIGNvdmVycyB0aGUgc2Vzc2lvbidzIGxhc3Rcblx0ICogYWN0aXZpdHkuIEZhbGxzIGJhY2sgdG8gdGhlIHJlYWQtZGF0ZSBiYXNlbGluZSB3aGVuIG5vdGhpbmcgaXMgc3RvcmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBsb2NhbFJlYWREYXRlQ292ZXJzQWN0aXZpdHkoc2Vzc2lvbjogSUludGVybmFsQWdlbnRTZXNzaW9uRGF0YSwgc3RvcmVkUmVhZERhdGU6IG51bWJlciB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHJlYWREYXRlID0gTWF0aC5tYXgoc3RvcmVkUmVhZERhdGUgPz8gMCwgdGhpcy5yZWFkRGF0ZUJhc2VsaW5lKTtcblx0XHRyZXR1cm4gcmVhZERhdGUgPj0gdGhpcy5zZXNzaW9uVGltZUZvclJlYWRTdGF0ZVRyYWNraW5nKHNlc3Npb24pIC0gQWdlbnRTZXNzaW9uc01vZGVsLlJFQURfR1JBQ0VfV0lORE9XO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXNzaW9uVGltZUZvclJlYWRTdGF0ZVRyYWNraW5nKHNlc3Npb246IElJbnRlcm5hbEFnZW50U2Vzc2lvbkRhdGEpOiBudW1iZXIge1xuXHRcdHJldHVybiBzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdEVuZGVkID8/IHNlc3Npb24udGltaW5nLmNyZWF0ZWQ7XG5cdH1cblxuXHRwcml2YXRlIHNldFJlYWQoc2Vzc2lvbjogSUludGVybmFsQWdlbnRTZXNzaW9uRGF0YSwgcmVhZDogYm9vbGVhbiwgc2tpcEV2ZW50PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLm93bnNSZWFkU3RhdGUoc2Vzc2lvbikpIHtcblx0XHRcdGlmIChyZWFkKSB7XG5cdFx0XHRcdHRoaXMuZXhwbGljaXRseU1hcmtlZFVucmVhZFNlc3Npb25zLmRlbGV0ZShzZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZXhwbGljaXRseU1hcmtlZFVucmVhZFNlc3Npb25zLmFkZChzZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdH1cblx0XHRcdGlmIChyZWFkID09PSAoc2Vzc2lvbi5wcm92aWRlcklzUmVhZCA/PyB0cnVlKSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIG5vIGNoYW5nZVxuXHRcdFx0fVxuXHRcdFx0Ly8gVGhlIHByb3ZpZGVyIGVjaG9lcyB0aGUgdmFsdWUgYmFjayB0aHJvdWdoIGEgc2Vzc2lvbi1pdGVtIGNoYW5nZVxuXHRcdFx0Ly8gZXZlbnQsIHNvIHRoZXJlIGlzIG5vIGxvY2FsIHN0YXRlIHRvIHdyaXRlIGFuZCBubyBldmVudCB0byBmaXJlLlxuXHRcdFx0dGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLnNldENoYXRTZXNzaW9uSXRlbVJlYWQoc2Vzc2lvbi5yZXNvdXJjZSwgcmVhZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQWRvcHQgYW55IGxlZ2FjeSBzdGF0ZSBmb3J3YXJkIGZpcnN0IHNvIHdlIGRvbid0IGVzdGFibGlzaCBhbiBvd24gZW50cnlcblx0XHQvLyB1bmRlciB0aGUgY3VycmVudCByZXNvdXJjZSBhbmQgb3JwaGFuIHRoZSBsZWdhY3kgb25lLlxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5yZXNvbHZlU3RhdGVFbnRyeShzZXNzaW9uKSA/PyB7fTtcblxuXHRcdGxldCBuZXdSZWFkOiBudW1iZXI7XG5cdFx0aWYgKHJlYWQpIHtcblx0XHRcdG5ld1JlYWQgPSBNYXRoLm1heChEYXRlLm5vdygpLCB0aGlzLnNlc3Npb25UaW1lRm9yUmVhZFN0YXRlVHJhY2tpbmcoc2Vzc2lvbikpO1xuXG5cdFx0XHRpZiAodHlwZW9mIHN0YXRlLnJlYWQgPT09ICdudW1iZXInICYmIHN0YXRlLnJlYWQgPj0gbmV3UmVhZCkge1xuXHRcdFx0XHRyZXR1cm47IC8vIGFscmVhZHkgcmVhZCB3aXRoIGEgc3VmZmljaWVudCB0aW1lc3RhbXBcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bmV3UmVhZCA9IEFnZW50U2Vzc2lvbnNNb2RlbC5VTlJFQURfTUFSS0VSO1xuXHRcdFx0aWYgKHN0YXRlLnJlYWQgPT09IEFnZW50U2Vzc2lvbnNNb2RlbC5VTlJFQURfTUFSS0VSKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gYWxyZWFkeSB1bnJlYWRcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnNlc3Npb25TdGF0ZXMuc2V0KHNlc3Npb24ucmVzb3VyY2UsIHsgLi4uc3RhdGUsIHJlYWQ6IG5ld1JlYWQgfSk7XG5cblx0XHRpZiAoIXNraXBFdmVudCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVBRF9NSUdSQVRJT05fRE9ORV9LRVkgPSAnYWdlbnRTZXNzaW9ucy5wcm92aWRlclJlYWRNaWdyYXRpb24nO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbWlncmF0ZWRSZWFkUmVzb3VyY2VzID0gbmV3IFJlc291cmNlU2V0KCk7XG5cblx0LyoqXG5cdCAqIE9uZS10aW1lIGhhbmQtb2ZmIG9mIGxvY2FsbHktdHJhY2tlZCByZWFkIHN0YXRlIHRvIHByb3ZpZGVycyB0aGF0IG93biBpdCxcblx0ICogc28gc2Vzc2lvbnMgcmVhZCBiZWZvcmUgdGhlIHByb3ZpZGVyIHRvb2sgb3duZXJzaGlwIGRvbid0IGFsbCByZXN1cmZhY2UgYXNcblx0ICogdW5yZWFkLiBPbmx5IGV2ZXIgcHJvbW90ZXMgdG8gcmVhZCwgYW5kIHJ1bnMgYXQgbW9zdCBvbmNlIHBlciBzZXNzaW9uIHNvIGFcblx0ICogbGF0ZXIgXCJNYXJrIGFzIFVucmVhZFwiIGlzIG5vdCB1bmRvbmUgb24gdGhlIG5leHQgcmVmcmVzaC5cblx0ICpcblx0ICogVGhlIGxlZGdlciBpcyBhcHBsaWNhdGlvbi1zY29wZWQgZXZlbiB0aG91Z2ggdGhlIGxvY2FsIHN0YXRlIGl0IGhhbmRzIG9mZlxuXHQgKiBpcyBwZXItd29ya3NwYWNlOiB0aGUgcHJvdmlkZXItb3duZWQgc3RhdGUgaXQgd3JpdGVzIHRvIGlzIGdsb2JhbCwgc28gYVxuXHQgKiBzZWNvbmQgd29ya3NwYWNlIHRoYXQgY2FuIHNlZSB0aGUgc2FtZSBzZXNzaW9uIChhbiBlbXB0eSB3aW5kb3cgbGlzdHMgdGhlbVxuXHQgKiBhbGwpIG11c3Qgbm90IG1pZ3JhdGUgaXQgYWdhaW4gYW5kIHJlLXByb21vdGUgYSBkZWxpYmVyYXRlIFwiTWFyayBhcyBVbnJlYWRcIi5cblx0ICovXG5cdHByaXZhdGUgbWlncmF0ZVJlYWRTdGF0ZVRvUHJvdmlkZXIoc2Vzc2lvbnM6IEl0ZXJhYmxlPElJbnRlcm5hbEFnZW50U2Vzc2lvbkRhdGE+KTogdm9pZCB7XG5cdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdGlmICh0aGlzLm1pZ3JhdGVkUmVhZFJlc291cmNlcy5oYXMoc2Vzc2lvbi5yZXNvdXJjZSkgfHwgIXRoaXMub3duc1JlYWRTdGF0ZShzZXNzaW9uKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTm90IHJlcG9ydGVkIHlldCAoZS5nLiBjYXJyaWVkIG92ZXIgZnJvbSBhIGNhY2hlIHByZWRhdGluZyB0aGlzXG5cdFx0XHQvLyBmaWVsZCkuIENvbnN1bWluZyB0aGUgb25lLXNob3QgZmxhZyBub3cgd291bGQgZHJvcCB0aGUgaGFuZC1vZmYgd2hlblxuXHRcdFx0Ly8gdGhlIHJlYWwgdmFsdWUgYXJyaXZlcy5cblx0XHRcdGlmIChzZXNzaW9uLnByb3ZpZGVySXNSZWFkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMubWlncmF0ZWRSZWFkUmVzb3VyY2VzLmFkZChzZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXG5cdFx0XHRpZiAoc2Vzc2lvbi5wcm92aWRlcklzUmVhZCkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gYWxyZWFkeSByZWFkIG9uIHRoZSBiYWNrZW5kIFx1MjAxNCBub3RoaW5nIHRvIGhhbmQgb2ZmXG5cdFx0XHR9XG5cblx0XHRcdC8vIGBpc1JlYWQoKWAgY2FuJ3QgYmUgdXNlZCBoZXJlIFx1MjAxNCBpdCBhbHJlYWR5IGRlZmVycyB0byB0aGUgcHJvdmlkZXIuXG5cdFx0XHRjb25zdCBzdG9yZWRSZWFkRGF0ZSA9IHRoaXMucmVzb2x2ZVN0YXRlRW50cnkoc2Vzc2lvbik/LnJlYWQ7XG5cdFx0XHRpZiAoc3RvcmVkUmVhZERhdGUgPT09IEFnZW50U2Vzc2lvbnNNb2RlbC5VTlJFQURfTUFSS0VSKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBleHBsaWNpdGx5IG1hcmtlZCB1bnJlYWQgbG9jYWxseSBcdTIwMTQgbGVhdmUgaXQgdW5yZWFkXG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5sb2NhbFJlYWREYXRlQ292ZXJzQWN0aXZpdHkoc2Vzc2lvbiwgc3RvcmVkUmVhZERhdGUpKSB7XG5cdFx0XHRcdHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5zZXRDaGF0U2Vzc2lvbkl0ZW1SZWFkKHNlc3Npb24ucmVzb3VyY2UsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFxuXHRcdFx0XHRBZ2VudFNlc3Npb25zTW9kZWwuUkVBRF9NSUdSQVRJT05fRE9ORV9LRVksXG5cdFx0XHRcdEpTT04uc3RyaW5naWZ5KEFycmF5LmZyb20odGhpcy5taWdyYXRlZFJlYWRSZXNvdXJjZXMpLm1hcChyZXNvdXJjZSA9PiByZXNvdXJjZS50b1N0cmluZygpKSksXG5cdFx0XHRcdFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTixcblx0XHRcdFx0U3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGxvYWRNaWdyYXRlZFJlYWRSZXNvdXJjZXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoQWdlbnRTZXNzaW9uc01vZGVsLlJFQURfTUlHUkFUSU9OX0RPTkVfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmICghcmF3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIEpTT04ucGFyc2UocmF3KSBhcyBzdHJpbmdbXSkge1xuXHRcdFx0XHR0aGlzLm1pZ3JhdGVkUmVhZFJlc291cmNlcy5hZGQoVVJJLnBhcnNlKGVudHJ5KSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBJZ25vcmUgYSBjb3JydXB0IGVudHJ5OiB0aGUgd29yc3QgY2FzZSBpcyByZS1ydW5uaW5nIGFuIGFkZGl0aXZlIG1pZ3JhdGlvbi5cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBSRUFEX0RBVEVfQkFTRUxJTkVfS0VZID0gJ2FnZW50U2Vzc2lvbnMucmVhZERhdGVCYXNlbGluZTInO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVhZERhdGVCYXNlbGluZTogbnVtYmVyO1xuXG5cdHByaXZhdGUgcmVzb2x2ZVJlYWREYXRlQmFzZWxpbmUoKTogbnVtYmVyIHtcblx0XHRsZXQgcmVhZERhdGVCYXNlbGluZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0TnVtYmVyKEFnZW50U2Vzc2lvbnNNb2RlbC5SRUFEX0RBVEVfQkFTRUxJTkVfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCAwKTtcblx0XHRpZiAocmVhZERhdGVCYXNlbGluZSA+IDApIHtcblx0XHRcdHJldHVybiByZWFkRGF0ZUJhc2VsaW5lOyAvLyBhbHJlYWR5IHJlc29sdmVkXG5cdFx0fVxuXG5cdFx0Ly8gRm9yIHN0YWJsZSwgcHJlc2VydmUgdW5yZWFkIHN0YXRlIGZvciBzZXNzaW9ucyBmcm9tIHRoZSBsYXN0IDcgZGF5c1xuXHRcdC8vIEZvciBvdGhlciBxdWFsaXRpZXMsIG1hcmsgYWxsIHNlc3Npb25zIGFzIHJlYWRcblx0XHRyZWFkRGF0ZUJhc2VsaW5lID0gdGhpcy5wcm9kdWN0U2VydmljZS5xdWFsaXR5ID09PSAnc3RhYmxlJ1xuXHRcdFx0PyBEYXRlLm5vdygpIC0gKDcgKiAyNCAqIDYwICogNjAgKiAxMDAwKVxuXHRcdFx0OiBEYXRlLm5vdygpO1xuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShBZ2VudFNlc3Npb25zTW9kZWwuUkVBRF9EQVRFX0JBU0VMSU5FX0tFWSwgcmVhZERhdGVCYXNlbGluZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdHJldHVybiByZWFkRGF0ZUJhc2VsaW5lO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG59XG5cbi8vI3JlZ2lvbiBTZXNzaW9ucyBDYWNoZVxuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRBZ2VudFNlc3Npb24ge1xuXG5cdHJlYWRvbmx5IHByb3ZpZGVyVHlwZTogc3RyaW5nO1xuXHRyZWFkb25seSBwcm92aWRlckxhYmVsOiBzdHJpbmc7XG5cblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMgLyogb2xkIHNoYXBlICovIHwgc3RyaW5nIC8qIG5ldyBzaGFwZSB0aGF0IGlzIG1vcmUgY29tcGFjdCAqLztcblxuXHRyZWFkb25seSBzdGF0dXM6IEFnZW50U2Vzc2lvblN0YXR1cztcblxuXHRyZWFkb25seSB0b29sdGlwPzogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nO1xuXG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nO1xuXHRyZWFkb25seSBiYWRnZT86IHN0cmluZyB8IElNYXJrZG93blN0cmluZztcblx0cmVhZG9ubHkgaWNvbjogc3RyaW5nO1xuXG5cdHJlYWRvbmx5IGFyY2hpdmVkOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGlzUmVhZD86IGJvb2xlYW47XG5cblx0cmVhZG9ubHkgbWV0YWRhdGE6IHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9IHwgdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGxlZ2FjeVJlc291cmNlPzogc3RyaW5nO1xuXG5cdHJlYWRvbmx5IHRpbWluZzoge1xuXHRcdHJlYWRvbmx5IGNyZWF0ZWQ6IG51bWJlcjtcblx0XHRyZWFkb25seSBsYXN0UmVxdWVzdFN0YXJ0ZWQ/OiBudW1iZXI7XG5cdFx0cmVhZG9ubHkgbGFzdFJlcXVlc3RFbmRlZD86IG51bWJlcjtcblx0fTtcblxuXHRyZWFkb25seSBjaGFuZ2VzPzogcmVhZG9ubHkgSUNoYXRTZXNzaW9uRmlsZUNoYW5nZVtdIHwgcmVhZG9ubHkgSUNoYXRTZXNzaW9uRmlsZUNoYW5nZTJbXSB8IHtcblx0XHRyZWFkb25seSBmaWxlczogbnVtYmVyO1xuXHRcdHJlYWRvbmx5IGluc2VydGlvbnM6IG51bWJlcjtcblx0XHRyZWFkb25seSBkZWxldGlvbnM6IG51bWJlcjtcblx0fTtcbn1cblxuaW50ZXJmYWNlIElTZXJpYWxpemVkQWdlbnRTZXNzaW9uU3RhdGUgZXh0ZW5kcyBJQWdlbnRTZXNzaW9uU3RhdGUge1xuXHRyZWFkb25seSByZXNvdXJjZTogVXJpQ29tcG9uZW50cyAvKiBvbGQgc2hhcGUgKi8gfCBzdHJpbmcgLyogbmV3IHNoYXBlIHRoYXQgaXMgbW9yZSBjb21wYWN0ICovO1xufVxuXG5jbGFzcyBBZ2VudFNlc3Npb25zQ2FjaGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNFU1NJT05TX1NUT1JBR0VfS0VZID0gJ2FnZW50U2Vzc2lvbnMubW9kZWwuY2FjaGUnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTVEFURV9TVE9SQUdFX0tFWSA9ICdhZ2VudFNlc3Npb25zLnN0YXRlLmNhY2hlJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZVxuXHQpIHsgfVxuXG5cdC8vI3JlZ2lvbiBTZXNzaW9uc1xuXG5cdHNhdmVDYWNoZWRTZXNzaW9ucyhzZXNzaW9uczogSUludGVybmFsQWdlbnRTZXNzaW9uRGF0YVtdKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VyaWFsaXplZDogSVNlcmlhbGl6ZWRBZ2VudFNlc3Npb25bXSA9IHNlc3Npb25zLm1hcChzZXNzaW9uID0+ICh7XG5cdFx0XHRwcm92aWRlclR5cGU6IHNlc3Npb24ucHJvdmlkZXJUeXBlLFxuXHRcdFx0cHJvdmlkZXJMYWJlbDogc2Vzc2lvbi5wcm92aWRlckxhYmVsLFxuXG5cdFx0XHRyZXNvdXJjZTogc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpLFxuXG5cdFx0XHRpY29uOiBzZXNzaW9uLmljb24uaWQsXG5cdFx0XHRsYWJlbDogc2Vzc2lvbi5sYWJlbCxcblx0XHRcdGRlc2NyaXB0aW9uOiBzZXNzaW9uLmRlc2NyaXB0aW9uLFxuXHRcdFx0YmFkZ2U6IHNlc3Npb24uYmFkZ2UsXG5cdFx0XHR0b29sdGlwOiBzZXNzaW9uLnRvb2x0aXAsXG5cblx0XHRcdHN0YXR1czogaXNTZXNzaW9uSW5Qcm9ncmVzc1N0YXR1cyhzZXNzaW9uLnN0YXR1cykgPyBBZ2VudFNlc3Npb25TdGF0dXMuQ29tcGxldGVkIDogc2Vzc2lvbi5zdGF0dXMsIC8vIG5ldmVyIGNhY2hlIHNlc3Npb25zIGFzIGluIHByb2dyZXNzLCB0aGlzIG5lZWRzIHRvIGJlIGxpdmUgc3RhdGVcblx0XHRcdGFyY2hpdmVkOiBzZXNzaW9uLmFyY2hpdmVkLFxuXHRcdFx0aXNSZWFkOiBzZXNzaW9uLnByb3ZpZGVySXNSZWFkLFxuXG5cdFx0XHR0aW1pbmc6IHNlc3Npb24udGltaW5nLFxuXG5cdFx0XHRjaGFuZ2VzOiBzZXNzaW9uLmNoYW5nZXMsXG5cdFx0XHRtZXRhZGF0YTogc2Vzc2lvbi5tZXRhZGF0YSxcblx0XHRcdGxlZ2FjeVJlc291cmNlOiBzZXNzaW9uLmxlZ2FjeVJlc291cmNlPy50b1N0cmluZygpXG5cdFx0fSBzYXRpc2ZpZXMgSVNlcmlhbGl6ZWRBZ2VudFNlc3Npb24pKTtcblxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQWdlbnRTZXNzaW9uc0NhY2hlLlNFU1NJT05TX1NUT1JBR0VfS0VZLCBzYWZlU3RyaW5naWZ5KHNlcmlhbGl6ZWQpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0bG9hZENhY2hlZFNlc3Npb25zKCk6IElJbnRlcm5hbEFnZW50U2Vzc2lvbkRhdGFbXSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNDYWNoZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEFnZW50U2Vzc2lvbnNDYWNoZS5TRVNTSU9OU19TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0aWYgKCFzZXNzaW9uc0NhY2hlKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNhY2hlZCA9IEpTT04ucGFyc2Uoc2Vzc2lvbnNDYWNoZSkgYXMgSVNlcmlhbGl6ZWRBZ2VudFNlc3Npb25bXTtcblx0XHRcdHJldHVybiBjYWNoZWQubWFwKChzZXNzaW9uKTogSUludGVybmFsQWdlbnRTZXNzaW9uRGF0YSA9PiAoe1xuXHRcdFx0XHRwcm92aWRlclR5cGU6IHNlc3Npb24ucHJvdmlkZXJUeXBlLFxuXHRcdFx0XHRwcm92aWRlckxhYmVsOiBzZXNzaW9uLnByb3ZpZGVyTGFiZWwsXG5cblx0XHRcdFx0cmVzb3VyY2U6IHR5cGVvZiBzZXNzaW9uLnJlc291cmNlID09PSAnc3RyaW5nJyA/IFVSSS5wYXJzZShzZXNzaW9uLnJlc291cmNlKSA6IFVSSS5yZXZpdmUoc2Vzc2lvbi5yZXNvdXJjZSksXG5cblx0XHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZChzZXNzaW9uLmljb24pLFxuXHRcdFx0XHRsYWJlbDogc2Vzc2lvbi5sYWJlbCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHNlc3Npb24uZGVzY3JpcHRpb24sXG5cdFx0XHRcdGJhZGdlOiBzZXNzaW9uLmJhZGdlLFxuXHRcdFx0XHR0b29sdGlwOiBzZXNzaW9uLnRvb2x0aXAsXG5cblx0XHRcdFx0c3RhdHVzOiBzZXNzaW9uLnN0YXR1cyxcblx0XHRcdFx0YXJjaGl2ZWQ6IHNlc3Npb24uYXJjaGl2ZWQsXG5cdFx0XHRcdHByb3ZpZGVySXNSZWFkOiBzZXNzaW9uLmlzUmVhZCxcblxuXHRcdFx0XHR0aW1pbmc6IHtcblx0XHRcdFx0XHRjcmVhdGVkOiBzZXNzaW9uLnRpbWluZy5jcmVhdGVkID8/IDAsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdFN0YXJ0ZWQsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RFbmRlZDogc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RFbmRlZCxcblx0XHRcdFx0fSxcblxuXHRcdFx0XHRjaGFuZ2VzOiBBcnJheS5pc0FycmF5KHNlc3Npb24uY2hhbmdlcykgPyBzZXNzaW9uLmNoYW5nZXMubWFwKChjaGFuZ2U6IElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UpID0+ICh7XG5cdFx0XHRcdFx0bW9kaWZpZWRVcmk6IFVSSS5yZXZpdmUoY2hhbmdlLm1vZGlmaWVkVXJpKSxcblx0XHRcdFx0XHRvcmlnaW5hbFVyaTogY2hhbmdlLm9yaWdpbmFsVXJpID8gVVJJLnJldml2ZShjaGFuZ2Uub3JpZ2luYWxVcmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGluc2VydGlvbnM6IGNoYW5nZS5pbnNlcnRpb25zLFxuXHRcdFx0XHRcdGRlbGV0aW9uczogY2hhbmdlLmRlbGV0aW9ucyxcblx0XHRcdFx0fSkpIDogc2Vzc2lvbi5jaGFuZ2VzLFxuXHRcdFx0XHRtZXRhZGF0YTogc2Vzc2lvbi5tZXRhZGF0YSxcblx0XHRcdFx0bGVnYWN5UmVzb3VyY2U6IHNlc3Npb24ubGVnYWN5UmVzb3VyY2UgPyBVUkkucGFyc2Uoc2Vzc2lvbi5sZWdhY3lSZXNvdXJjZSkgOiB1bmRlZmluZWQsXG5cdFx0XHR9KSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gW107IC8vIGludmFsaWQgZGF0YSBpbiBzdG9yYWdlLCBmYWxsYmFjayB0byBlbXB0eSBzZXNzaW9ucyBsaXN0XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFN0YXRlc1xuXG5cdHNhdmVTZXNzaW9uU3RhdGVzKHN0YXRlczogUmVzb3VyY2VNYXA8SUFnZW50U2Vzc2lvblN0YXRlPik6IHZvaWQge1xuXHRcdGNvbnN0IHNlcmlhbGl6ZWQ6IElTZXJpYWxpemVkQWdlbnRTZXNzaW9uU3RhdGVbXSA9IEFycmF5LmZyb20oc3RhdGVzLmVudHJpZXMoKSkubWFwKChbcmVzb3VyY2UsIHN0YXRlXSkgPT4gKHtcblx0XHRcdHJlc291cmNlOiByZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0YXJjaGl2ZWQ6IHN0YXRlLmFyY2hpdmVkLFxuXHRcdFx0cGlubmVkOiBzdGF0ZS5waW5uZWQsXG5cdFx0XHRyZWFkOiBzdGF0ZS5yZWFkXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShBZ2VudFNlc3Npb25zQ2FjaGUuU1RBVEVfU1RPUkFHRV9LRVksIEpTT04uc3RyaW5naWZ5KHNlcmlhbGl6ZWQpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0bG9hZFNlc3Npb25TdGF0ZXMoKTogUmVzb3VyY2VNYXA8SUFnZW50U2Vzc2lvblN0YXRlPiB7XG5cdFx0Y29uc3Qgc3RhdGVzID0gbmV3IFJlc291cmNlTWFwPElBZ2VudFNlc3Npb25TdGF0ZT4oKTtcblxuXHRcdGNvbnN0IHN0YXRlc0NhY2hlID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoQWdlbnRTZXNzaW9uc0NhY2hlLlNUQVRFX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRpZiAoIXN0YXRlc0NhY2hlKSB7XG5cdFx0XHRyZXR1cm4gc3RhdGVzO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjYWNoZWQgPSBKU09OLnBhcnNlKHN0YXRlc0NhY2hlKSBhcyBJU2VyaWFsaXplZEFnZW50U2Vzc2lvblN0YXRlW107XG5cblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgY2FjaGVkKSB7XG5cdFx0XHRcdHN0YXRlcy5zZXQodHlwZW9mIGVudHJ5LnJlc291cmNlID09PSAnc3RyaW5nJyA/IFVSSS5wYXJzZShlbnRyeS5yZXNvdXJjZSkgOiBVUkkucmV2aXZlKGVudHJ5LnJlc291cmNlKSwge1xuXHRcdFx0XHRcdGFyY2hpdmVkOiBlbnRyeS5hcmNoaXZlZCxcblx0XHRcdFx0XHRwaW5uZWQ6IGVudHJ5LnBpbm5lZCxcblx0XHRcdFx0XHRyZWFkOiBlbnRyeS5yZWFkXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gaW52YWxpZCBkYXRhIGluIHN0b3JhZ2UsIGZhbGxiYWNrIHRvIGVtcHR5IHN0YXRlc1xuXHRcdH1cblxuXHRcdHJldHVybiBzdGF0ZXM7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQXNCO0FBRS9CLFNBQVMsWUFBWSxxQkFBcUI7QUFDMUMsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLFNBQXNCLGlDQUFpQztBQUNoRSxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQTBCO0FBQ25DLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsYUFBYSxnQkFBZ0I7QUFDdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0I7QUFD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QW9DO0FBQUEsVUFDbEcsYUFBYSxJQUFJLE9BQU8sT0FBTyxXQUFXO0FBQUEsVUFDMUMsYUFBYSxPQUFPLGNBQWMsSUFBSSxPQUFPLE9BQU8sV0FBVyxJQUFJO0FBQUEsVUFDbkUsWUFBWSxPQUFPO0FBQUEsVUFDbkIsV0FBVyxPQUFPO0FBQUEsUUFDbkIsRUFBRSxJQUFJLFFBQVE7QUFBQSxRQUNkLFVBQVUsUUFBUTtBQUFBLFFBQ2xCLGdCQUFnQixRQUFRLGlCQUFpQixJQUFJLE1BQU0sUUFBUSxjQUFjLElBQUk7QUFBQSxNQUM5RSxFQUFFO0FBQUEsSUFDSCxRQUFRO0FBQ1AsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUEsRUFNQSxrQkFBa0IsUUFBK0M7QUFDaEUsVUFBTSxhQUE2QyxNQUFNLEtBQUssT0FBTyxRQUFRLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxVQUFVLEtBQUssT0FBTztBQUFBLE1BQzNHLFVBQVUsU0FBUyxTQUFTO0FBQUEsTUFDNUIsVUFBVSxNQUFNO0FBQUEsTUFDaEIsUUFBUSxNQUFNO0FBQUEsTUFDZCxNQUFNLE1BQU07QUFBQSxJQUNiLEVBQUU7QUFFRixTQUFLLGVBQWUsTUFBTSxtQkFBbUIsbUJBQW1CLEtBQUssVUFBVSxVQUFVLEdBQUcsYUFBYSxXQUFXLGNBQWMsT0FBTztBQUFBLEVBQzFJO0FBQUEsRUFFQSxvQkFBcUQ7QUFDcEQsVUFBTSxTQUFTLElBQUksWUFBZ0M7QUFFbkQsVUFBTSxjQUFjLEtBQUssZUFBZSxJQUFJLG1CQUFtQixtQkFBbUIsYUFBYSxTQUFTO0FBQ3hHLFFBQUksQ0FBQyxhQUFhO0FBQ2pCLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSTtBQUNILFlBQU0sU0FBUyxLQUFLLE1BQU0sV0FBVztBQUVyQyxpQkFBVyxTQUFTLFFBQVE7QUFDM0IsZUFBTyxJQUFJLE9BQU8sTUFBTSxhQUFhLFdBQVcsSUFBSSxNQUFNLE1BQU0sUUFBUSxJQUFJLElBQUksT0FBTyxNQUFNLFFBQVEsR0FBRztBQUFBLFVBQ3ZHLFVBQVUsTUFBTTtBQUFBLFVBQ2hCLFFBQVEsTUFBTTtBQUFBLFVBQ2QsTUFBTSxNQUFNO0FBQUEsUUFDYixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsUUFBUTtBQUFBLElBRVI7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBR0Q7QUEzSE0sbUJBRW1CLHVCQUF1QjtBQUYxQyxtQkFHbUIsb0JBQW9CO0FBSHZDLHFCQUFOO0FBQUEsRUFNRztBQUFBLEdBTkc7IiwKICAibmFtZXMiOiBbImlzU2Vzc2lvbkluUHJvZ3Jlc3NTdGF0dXMiLCAiQWdlbnRTZXNzaW9uU2VjdGlvbiIsICJwcm92aWRlciJdCn0K
