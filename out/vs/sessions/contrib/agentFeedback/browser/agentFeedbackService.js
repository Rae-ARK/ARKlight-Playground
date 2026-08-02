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
import { Emitter, Event } from "../../../../base/common/event.js";
import { DeferredPromise, raceTimeout } from "../../../../base/common/async.js";
import { createSingleCallFunction } from "../../../../base/common/functional.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { derived, runOnChange } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { isEqual, isEqualOrParent } from "../../../../base/common/resources.js";
import { Schemas } from "../../../../base/common/network.js";
import { IChatEditingService } from "../../../../workbench/contrib/chat/common/editing/chatEditingService.js";
import { isIChatSessionFileChange2 } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { editingEntriesContainResource } from "../../../../workbench/contrib/chat/browser/sessionResourceMatching.js";
import { changeMatchesResource, getActiveResourceCandidates } from "./agentFeedbackEditorUtils.js";
import { IEditorService } from "../../../../workbench/services/editor/common/editorService.js";
import { IChatWidgetService } from "../../../../workbench/contrib/chat/browser/chat.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { SessionStatus } from "../../../services/sessions/common/session.js";
import { isAgentHostProviderId } from "../../../common/agentHostSessionsProvider.js";
import { AnnotationsAgentFeedbackItemsBackend, InMemoryAgentFeedbackItemsBackend } from "./agentFeedbackItemsBackend.js";
import { ATTACHMENT_ID_PREFIX, createAgentFeedbackVariableEntry } from "./agentFeedbackAttachmentEntry.js";
import { AgentFeedbackKind, AgentFeedbackState } from "./agentFeedbackModel.js";
import { SessionEditorCommentSource, toSessionEditorCommentId } from "./sessionEditorComments.js";
const AGENT_FEEDBACK_NEW_SESSION_RESOURCE = URI.from({ scheme: "agent-feedback", path: "/new-session" });
const WIDGET_LOAD_TIMEOUT_MS = 1e4;
async function whenWidgetForSession(chatWidgetService, sessionResource, timeoutMs = WIDGET_LOAD_TIMEOUT_MS) {
  const existing = chatWidgetService.getWidgetBySessionResource(sessionResource);
  if (existing) {
    return existing;
  }
  const store = new DisposableStore();
  try {
    const loaded = new Promise((resolve) => {
      const check = () => {
        const widget = chatWidgetService.getWidgetBySessionResource(sessionResource);
        if (widget) {
          resolve(widget);
        }
      };
      const observe = (candidate) => store.add(candidate.onDidChangeViewModel(check));
      chatWidgetService.getAllWidgets().forEach(observe);
      store.add(chatWidgetService.onDidAddWidget((added) => {
        observe(added);
        check();
      }));
      check();
    });
    return await raceTimeout(loaded, timeoutMs);
  } finally {
    store.dispose();
  }
}
const IAgentFeedbackService = createDecorator("agentFeedbackService");
function workspaceFoldersKey(workspace) {
  return workspace?.folders.map((folder) => folder.root.toString()).join(",");
}
let AgentFeedbackService = class extends Disposable {
  constructor(_chatEditingService, _sessionsManagementService, _sessionsService, _editorService, _chatWidgetService, _logService, _instantiationService) {
    super();
    this._chatEditingService = _chatEditingService;
    this._sessionsManagementService = _sessionsManagementService;
    this._sessionsService = _sessionsService;
    this._editorService = _editorService;
    this._chatWidgetService = _chatWidgetService;
    this._logService = _logService;
    this._instantiationService = _instantiationService;
    this._onDidChangeFeedback = this._store.add(new Emitter());
    this.onDidChangeFeedback = this._onDidChangeFeedback.event;
    this._onDidChangeNavigation = this._store.add(new Emitter());
    this.onDidChangeNavigation = this._onDidChangeNavigation.event;
    this._onDidRevealSessionComment = this._store.add(new Emitter());
    this.onDidRevealSessionComment = this._onDidRevealSessionComment.event;
    this._onDidChangeFeedbackScope = this._store.add(new Emitter());
    this.onDidChangeFeedbackScope = this._onDidChangeFeedbackScope.event;
    this._onDidAddFeedback = this._store.add(new Emitter());
    this.onDidAddFeedback = this._onDidAddFeedback.event;
    this._onDidConvertFeedback = this._store.add(new Emitter());
    this.onDidConvertFeedback = this._onDidConvertFeedback.event;
    this._onDidAddReply = this._store.add(new Emitter());
    this.onDidAddReply = this._onDidAddReply.event;
    this._onDidSubmitFeedback = this._store.add(new Emitter());
    this.onDidSubmitFeedback = this._onDidSubmitFeedback.event;
    /** sessionResource → recency sequence (set on every feedback change) */
    this._sessionUpdatedOrder = /* @__PURE__ */ new Map();
    this._sessionUpdatedSequence = 0;
    this._navigationAnchorBySession = /* @__PURE__ */ new Map();
    /** fileResource → sessionResource active when the editor for that file was first seen */
    this._fileToSession = new ResourceMap();
    this._explicitResourceScopes = new ResourceMap();
    /** In-memory store used for every non-agent-host provider. */
    this._inMemoryBackend = this._register(new InMemoryAgentFeedbackItemsBackend());
    this._register(this._inMemoryBackend.onDidChangeItems((resource) => this._handleBackendChange(resource)));
    this._register(this._editorService.onDidVisibleEditorsChange(() => this._trackVisibleEditorResources()));
    this._trackVisibleEditorResources();
    this.activeFeedbackSessionResource = derived(this, (reader) => {
      const activeSession = this._sessionsService.activeSession.read(reader);
      return !activeSession || !activeSession.isCreated.read(reader) ? AGENT_FEEDBACK_NEW_SESSION_RESOURCE : activeSession.resource;
    });
    const feedbackScopeKey = derived(this, (reader) => {
      const scope = this.activeFeedbackSessionResource.read(reader).toString();
      const workspace = this._sessionsService.activeSession.read(reader)?.workspace.read(reader);
      return `${scope}|${workspaceFoldersKey(workspace) ?? ""}`;
    });
    this._register(runOnChange(feedbackScopeKey, () => this._onDidChangeFeedbackScope.fire()));
    this._newSessionWorkspaceKey = derived(this, (reader) => {
      const activeSession = this._sessionsService.activeSession.read(reader);
      if (!activeSession || activeSession.isCreated.read(reader)) {
        return void 0;
      }
      return workspaceFoldersKey(activeSession.workspace.read(reader));
    });
    this._register(runOnChange(this._newSessionWorkspaceKey, (key) => {
      if (key === void 0) {
        return;
      }
      if (this._boundNewSessionWorkspaceKey !== void 0 && this._boundNewSessionWorkspaceKey !== key) {
        this.clearFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE);
      }
      this._rebindNewSessionWorkspace();
    }));
  }
  /**
   * The shared new-session comments belong to the workspace of the draft they
   * were written for. An empty set releases the binding so the next draft can
   * adopt its own workspace instead of being measured against a stale one.
   */
  _rebindNewSessionWorkspace() {
    if (!this.getFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE).length) {
      this._boundNewSessionWorkspaceKey = void 0;
      return;
    }
    const key = this._newSessionWorkspaceKey.get();
    if (key !== void 0) {
      this._boundNewSessionWorkspaceKey = key;
    }
  }
  /** Resolves the storage backend that owns feedback for the given session. */
  _backendForSession(sessionResource) {
    if (this._isAgentHostSession(sessionResource)) {
      return this._getAnnotationsBackend();
    }
    return this._inMemoryBackend;
  }
  _getAnnotationsBackend() {
    if (!this._annotationsBackend) {
      this._annotationsBackend = this._register(this._instantiationService.createInstance(AnnotationsAgentFeedbackItemsBackend));
      this._register(this._annotationsBackend.onDidChangeItems((resource) => this._handleBackendChange(resource)));
    }
    return this._annotationsBackend;
  }
  _backends() {
    return this._annotationsBackend ? [this._inMemoryBackend, this._annotationsBackend] : [this._inMemoryBackend];
  }
  /**
   * Centralized handler for backend item changes (local mutations and
   * server-driven updates). Maintains recency ordering and re-broadcasts the
   * generic feedback / navigation change events.
   */
  _handleBackendChange(sessionResource) {
    const key = sessionResource.toString();
    const feedbackItems = this._backendForSession(sessionResource).getItems(sessionResource);
    if (feedbackItems.length) {
      this._sessionUpdatedOrder.set(key, ++this._sessionUpdatedSequence);
    } else {
      this._sessionUpdatedOrder.delete(key);
    }
    this._onDidChangeFeedback.fire({ sessionResource, feedbackItems });
    this._onDidChangeNavigation.fire(sessionResource);
    if (isEqual(sessionResource, AGENT_FEEDBACK_NEW_SESSION_RESOURCE)) {
      this._rebindNewSessionWorkspace();
    }
  }
  _trackVisibleEditorResources() {
    const activeSession = this._sessionsService.activeSession.get();
    if (!activeSession) {
      return;
    }
    for (const pane of this._editorService.visibleEditorPanes) {
      for (const candidate of getActiveResourceCandidates(pane.input)) {
        this._fileToSession.set(candidate, activeSession.resource);
      }
    }
  }
  getSessionForFile(resourceUri) {
    const sessionResource = this._fileToSession.get(resourceUri) ?? this._sessionsService.activeSession.get()?.resource;
    if (!sessionResource) {
      return void 0;
    }
    const session = this._sessionsManagementService.getSession(sessionResource);
    if (!session || session.status.get() === SessionStatus.Untitled) {
      return void 0;
    }
    if (!this._isFileInSessionScope(session, resourceUri)) {
      return void 0;
    }
    return session;
  }
  getFeedbackSessionResource(resourceUri) {
    const explicitScope = this._explicitResourceScopes.get(resourceUri);
    if (explicitScope) {
      return explicitScope;
    }
    if (resourceUri.scheme === Schemas.outputChannel) {
      return void 0;
    }
    const activeSession = this._sessionsService.activeSession.get();
    if (!activeSession || !activeSession.isCreated.get()) {
      if (activeSession && !this._isFileInSessionScope(activeSession, resourceUri)) {
        return void 0;
      }
      return AGENT_FEEDBACK_NEW_SESSION_RESOURCE;
    }
    return this.getSessionForFile(resourceUri)?.resource;
  }
  registerFeedbackResourceScope(resourceUri, sessionResource) {
    this._explicitResourceScopes.set(resourceUri, sessionResource);
    this._onDidChangeFeedbackScope.fire();
    return {
      dispose: () => {
        if (isEqual(this._explicitResourceScopes.get(resourceUri), sessionResource)) {
          this._explicitResourceScopes.delete(resourceUri);
          this._onDidChangeFeedbackScope.fire();
        }
      }
    };
  }
  /**
   * Whether the given file belongs to the session and is therefore eligible
   * for agent feedback. This keeps the feedback affordances scoped to the
   * session's own files and excludes editors that merely happen to be open
   * while the session is active (e.g. user settings opened from the user
   * data directory, or the Output view which is not backed by a real file).
   */
  _isFileInSessionScope(session, resourceUri) {
    if (resourceUri.scheme === Schemas.outputChannel) {
      return false;
    }
    if (session.changes.get().some((change) => changeMatchesResource(change, resourceUri))) {
      return true;
    }
    const workspace = session.workspace.get();
    if (!workspace) {
      return true;
    }
    return workspace.folders.some((folder) => isEqualOrParent(resourceUri, folder.root) || isEqualOrParent(resourceUri, folder.workingDirectory));
  }
  addFeedback(sessionResource, resourceUri, range, text, suggestion, context, sourcePRReviewCommentId, kind = AgentFeedbackKind.UserReview, state = AgentFeedbackState.Accepted) {
    const backend = this._backendForSession(sessionResource);
    const effectiveKind = sourcePRReviewCommentId ? AgentFeedbackKind.PRReview : kind;
    const feedback = {
      id: generateUuid(),
      text,
      resourceUri,
      range,
      sessionResource,
      suggestion,
      codeSelection: context?.codeSelection,
      diffHunks: context?.diffHunks,
      kind: effectiveKind,
      sourcePRReviewCommentId,
      state
    };
    const resourceStr = resourceUri.toString();
    const hasExistingForFile = backend.getItems(sessionResource).some((f) => f.resourceUri.toString() === resourceStr);
    backend.upsert(feedback);
    if (state === AgentFeedbackState.Accepted) {
      if (effectiveKind === AgentFeedbackKind.UserReview) {
        this._onDidAddFeedback.fire({ sessionResource, feedback, hasExistingFeedbackForFile: hasExistingForFile });
      } else {
        this._onDidConvertFeedback.fire({ sessionResource, feedback, kind: effectiveKind, hasExistingFeedbackForFile: hasExistingForFile });
      }
    }
    return feedback;
  }
  acceptFeedback(sessionResource, feedbackId, options) {
    const backend = this._backendForSession(sessionResource);
    const feedbackItems = backend.getItems(sessionResource);
    const existing = feedbackItems.find((f) => f.id === feedbackId);
    if (!existing || existing.state !== AgentFeedbackState.Created) {
      return;
    }
    const accepted = {
      ...existing,
      state: AgentFeedbackState.Accepted,
      ...options?.revealToAgent ? { pendingAgentReveal: true } : {}
    };
    backend.upsert(accepted);
    if (accepted.kind !== AgentFeedbackKind.UserReview) {
      const resourceStr = accepted.resourceUri.toString();
      const hasExistingFeedbackForFile = feedbackItems.some((f) => f.id !== accepted.id && f.resourceUri.toString() === resourceStr);
      this._onDidConvertFeedback.fire({ sessionResource, feedback: accepted, kind: accepted.kind, hasExistingFeedbackForFile });
    }
  }
  removeFeedback(sessionResource, feedbackId) {
    const key = sessionResource.toString();
    if (this._navigationAnchorBySession.get(key) === feedbackId) {
      this._navigationAnchorBySession.delete(key);
    }
    this._backendForSession(sessionResource).remove(sessionResource, feedbackId);
  }
  updateFeedback(sessionResource, feedbackId, newText) {
    const backend = this._backendForSession(sessionResource);
    const existing = backend.getItems(sessionResource).find((f) => f.id === feedbackId);
    if (!existing) {
      return;
    }
    backend.upsert({ ...existing, text: newText });
  }
  setFeedbackResolved(sessionResource, feedbackId, resolved) {
    const backend = this._backendForSession(sessionResource);
    const nextState = resolved ? AgentFeedbackState.Resolved : AgentFeedbackState.Submitted;
    const existing = backend.getItems(sessionResource).find((f) => f.id === feedbackId);
    if (existing && existing.state !== nextState) {
      backend.upsert({ ...existing, state: nextState });
    }
  }
  addReply(sessionResource, feedbackId, replyText) {
    const backend = this._backendForSession(sessionResource);
    const existing = backend.getItems(sessionResource).find((f) => f.id === feedbackId);
    if (!existing) {
      return;
    }
    const newReplies = [...existing.replies ?? [], replyText];
    const updated = { ...existing, replies: newReplies };
    backend.upsert(updated);
    this._onDidAddReply.fire({ sessionResource, feedback: updated, replyCount: newReplies.length });
  }
  getFeedback(sessionResource) {
    return this._backendForSession(sessionResource).getItems(sessionResource);
  }
  hasLoadedFeedback(sessionResource) {
    return this._backendForSession(sessionResource).hasLoaded(sessionResource);
  }
  getMostRecentSessionForResource(resourceUri) {
    let bestSession;
    let bestSequence = -1;
    for (const backend of this._backends()) {
      for (const candidate of backend.getSessionsWithItems()) {
        const feedbackItems = backend.getItems(candidate);
        if (!feedbackItems.length) {
          continue;
        }
        if (!this._sessionContainsResource(candidate, resourceUri, feedbackItems)) {
          continue;
        }
        const sequence = this._sessionUpdatedOrder.get(candidate.toString()) ?? 0;
        if (sequence > bestSequence) {
          bestSession = candidate;
          bestSequence = sequence;
        }
      }
    }
    return bestSession;
  }
  _sessionContainsResource(sessionResource, resourceUri, feedbackItems) {
    if (feedbackItems.some((item) => isEqual(item.resourceUri, resourceUri))) {
      return true;
    }
    for (const editingSession of this._chatEditingService.editingSessionsObs.get()) {
      if (!isEqual(editingSession.chatSessionResource, sessionResource)) {
        continue;
      }
      if (editingEntriesContainResource(editingSession.entries.get(), resourceUri)) {
        return true;
      }
    }
    const session = this._sessionsManagementService.getSession(sessionResource);
    if (!session) {
      return false;
    }
    const changes = session.changes.get();
    if (changes.some((change) => changeMatchesResource(change, resourceUri))) {
      return true;
    }
    return false;
  }
  async revealFeedback(sessionResource, feedbackId) {
    const feedback = this.getFeedback(sessionResource).find((f) => f.id === feedbackId);
    if (!feedback) {
      return;
    }
    await this.revealSessionComment(sessionResource, toSessionEditorCommentId(SessionEditorCommentSource.AgentFeedback, feedbackId), feedback.resourceUri, feedback.range);
  }
  async revealSessionComment(sessionResource, commentId, resourceUri, range) {
    const selection = { startLineNumber: range.startLineNumber, startColumn: range.startColumn };
    const sessionData = this._sessionsManagementService.getSession(sessionResource);
    const sessionChange = this._getSessionChange(resourceUri, sessionData?.changes.get());
    if (sessionChange?.isDeletion && sessionChange.originalUri) {
      await this._editorService.openEditor({
        resource: sessionChange.originalUri,
        options: {
          modal: {},
          preserveFocus: false,
          revealIfVisible: true,
          selection
        }
      });
    } else if (sessionChange?.originalUri) {
      await this._editorService.openEditor({
        original: { resource: sessionChange.originalUri },
        modified: { resource: sessionChange.modifiedUri },
        options: {
          modal: {},
          preserveFocus: false,
          revealIfVisible: true,
          selection
        }
      });
    } else {
      await this._editorService.openEditor({
        resource: sessionChange?.modifiedUri ?? resourceUri,
        options: {
          modal: {},
          preserveFocus: false,
          revealIfVisible: true,
          selection
        }
      });
    }
    this.setNavigationAnchor(sessionResource, commentId);
    this._onDidRevealSessionComment.fire({ sessionResource, commentId, resourceUri });
  }
  _getSessionChange(resourceUri, changes) {
    if (!(changes instanceof Array)) {
      return void 0;
    }
    const matchingChange = changes.find((change) => changeMatchesResource(change, resourceUri));
    if (!matchingChange) {
      return void 0;
    }
    if (isIChatSessionFileChange2(matchingChange)) {
      return {
        originalUri: matchingChange.originalUri,
        modifiedUri: matchingChange.modifiedUri ?? matchingChange.uri,
        isDeletion: matchingChange.modifiedUri === void 0
      };
    }
    return {
      originalUri: matchingChange.originalUri,
      modifiedUri: matchingChange.modifiedUri,
      isDeletion: false
    };
  }
  getNextFeedback(sessionResource, next) {
    return this.getNextNavigableItem(sessionResource, this.getFeedback(sessionResource), next);
  }
  getNextNavigableItem(sessionResource, items, next) {
    const key = sessionResource.toString();
    if (!items.length) {
      this._navigationAnchorBySession.delete(key);
      return void 0;
    }
    const anchorId = this._navigationAnchorBySession.get(key);
    let anchorIndex = anchorId ? items.findIndex((item2) => item2.id === anchorId) : -1;
    if (anchorIndex < 0 && !next) {
      anchorIndex = 0;
    }
    const nextIndex = next ? (anchorIndex + 1) % items.length : (anchorIndex - 1 + items.length) % items.length;
    const item = items[nextIndex];
    this.setNavigationAnchor(sessionResource, item.id);
    return item;
  }
  setNavigationAnchor(sessionResource, itemId) {
    const key = sessionResource.toString();
    if (itemId) {
      this._navigationAnchorBySession.set(key, itemId);
    } else {
      this._navigationAnchorBySession.delete(key);
    }
    this._onDidChangeNavigation.fire(sessionResource);
  }
  getNavigationBearing(sessionResource, items = this.getFeedback(sessionResource)) {
    const key = sessionResource.toString();
    const anchorId = this._navigationAnchorBySession.get(key);
    const activeIdx = anchorId ? items.findIndex((item) => item.id === anchorId) : -1;
    return { activeIdx, totalCount: items.length };
  }
  clearFeedback(sessionResource) {
    const key = sessionResource.toString();
    this._sessionUpdatedOrder.delete(key);
    this._navigationAnchorBySession.delete(key);
    this._backendForSession(sessionResource).clear(sessionResource);
  }
  async addFeedbackAndSubmit(sessionResource, resourceUri, range, text, suggestion, context, sourcePRReviewCommentId, kind) {
    this.addFeedback(sessionResource, resourceUri, range, text, suggestion, context, sourcePRReviewCommentId, kind);
    if (isEqual(sessionResource, AGENT_FEEDBACK_NEW_SESSION_RESOURCE)) {
      await this.submitFeedback(sessionResource);
      return;
    }
    if (!this._isAgentHostSession(sessionResource)) {
      const widget = await whenWidgetForSession(this._chatWidgetService, sessionResource);
      if (widget) {
        const attachmentId = ATTACHMENT_ID_PREFIX + sessionResource.toString();
        const hasAttachment = () => widget.attachmentModel.attachments.some((a) => a.id === attachmentId);
        if (!hasAttachment()) {
          await Event.toPromise(
            Event.filter(widget.attachmentModel.onDidChange, () => hasAttachment())
          );
        }
      } else {
        this._logService.error("[AgentFeedback] addFeedbackAndSubmit: no chat widget found for session, feedback may not be submitted correctly", sessionResource.toString());
      }
    }
    await this.submitFeedback(sessionResource);
  }
  _isAgentHostSession(sessionResource) {
    const session = this._sessionsManagementService.getSession(sessionResource);
    return session ? isAgentHostProviderId(session.providerId) : false;
  }
  async submitFeedback(sessionResource) {
    if (isEqual(sessionResource, AGENT_FEEDBACK_NEW_SESSION_RESOURCE)) {
      if (!this.getFeedback(sessionResource).some((item) => item.state === AgentFeedbackState.Accepted)) {
        return false;
      }
      return this._sessionsService.submitNewSessionInput();
    }
    const widget = await whenWidgetForSession(this._chatWidgetService, sessionResource);
    if (!widget) {
      this._logService.error("[AgentFeedback] submitFeedback: no chat widget found for session", sessionResource.toString());
      return false;
    }
    if (this._isAgentHostSession(sessionResource)) {
      const acceptedItems = this.getFeedback(sessionResource).filter((item) => item.state === AgentFeedbackState.Accepted);
      const attachmentId = ATTACHMENT_ID_PREFIX + sessionResource.toString();
      if (acceptedItems.length) {
        const annotationsResource = this._getAnnotationsBackend().getAnnotationsChannelResource(sessionResource);
        widget.attachmentModel.delete(attachmentId);
        widget.attachmentModel.addContext(createAgentFeedbackVariableEntry(sessionResource, acceptedItems, annotationsResource));
      }
      return this._sendActOnFeedbackRequest(widget, sessionResource, () => widget.attachmentModel.delete(attachmentId));
    }
    return this._sendActOnFeedbackRequest(widget, sessionResource);
  }
  /**
   * Sends the `/act-on-feedback` request and marks the accepted feedback as
   * submitted as soon as the request has been accepted by the chat widget.
   * The request is queued when the agent is still working on another request,
   * in which case awaiting {@link IChatWidget.acceptInput} would only resolve
   * once that queued request eventually runs — the feedback items must move to
   * the submitted state right away.
   */
  _sendActOnFeedbackRequest(widget, sessionResource, cleanup) {
    const submitted = new DeferredPromise();
    const cleanupOnce = cleanup && createSingleCallFunction(cleanup);
    widget.acceptInput("/act-on-feedback", {
      onRequestAccepted: () => {
        cleanupOnce?.();
        this.markFeedbackSubmitted(sessionResource);
        submitted.complete(true);
      }
    }).then(() => {
      cleanupOnce?.();
      submitted.complete(false);
    }, (err) => {
      this._logService.error("[AgentFeedback] Failed to submit feedback", err);
      cleanupOnce?.();
      submitted.complete(false);
    });
    return submitted.p;
  }
  markFeedbackSubmitted(sessionResource) {
    const backend = this._backendForSession(sessionResource);
    const feedbackItems = backend.getItems(sessionResource);
    const submittedState = this._isAgentHostSession(sessionResource) ? AgentFeedbackState.Submitted : AgentFeedbackState.Resolved;
    let userCount = 0;
    let codeReviewCount = 0;
    let prReviewCount = 0;
    let replyCount = 0;
    const submitted = [];
    for (const item of feedbackItems) {
      if (item.state !== AgentFeedbackState.Accepted) {
        continue;
      }
      switch (item.kind) {
        case AgentFeedbackKind.UserReview:
          userCount++;
          break;
        case AgentFeedbackKind.AgentReview:
          codeReviewCount++;
          break;
        case AgentFeedbackKind.PRReview:
          prReviewCount++;
          break;
      }
      replyCount += item.replies?.length ?? 0;
      submitted.push({ ...item, state: submittedState });
    }
    if (!submitted.length) {
      return;
    }
    for (const item of submitted) {
      backend.upsert(item);
    }
    this._onDidSubmitFeedback.fire({
      sessionResource,
      totalCount: userCount + codeReviewCount + prReviewCount,
      userCount,
      codeReviewCount,
      prReviewCount,
      replyCount
    });
  }
};
AgentFeedbackService = __decorateClass([
  __decorateParam(0, IChatEditingService),
  __decorateParam(1, ISessionsManagementService),
  __decorateParam(2, ISessionsService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IChatWidgetService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IInstantiationService)
], AgentFeedbackService);
export {
  AGENT_FEEDBACK_NEW_SESSION_RESOURCE,
  AgentFeedbackKind,
  AgentFeedbackService,
  AgentFeedbackState,
  IAgentFeedbackService,
  whenWidgetForSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYWdlbnRGZWVkYmFjay9icm93c2VyL2FnZW50RmVlZGJhY2tTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIHJhY2VUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgY3JlYXRlU2luZ2xlQ2FsbEZ1bmN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZnVuY3Rpb25hbC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGRlcml2ZWQsIElPYnNlcnZhYmxlLCBydW5PbkNoYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IsIElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsLCBpc0VxdWFsT3JQYXJlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzSUNoYXRTZXNzaW9uRmlsZUNoYW5nZTIgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZWRpdGluZ0VudHJpZXNDb250YWluUmVzb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvc2Vzc2lvblJlc291cmNlTWF0Y2hpbmcuanMnO1xuaW1wb3J0IHsgY2hhbmdlTWF0Y2hlc1Jlc291cmNlLCBnZXRBY3RpdmVSZXNvdXJjZUNhbmRpZGF0ZXMsIElBZ2VudEZlZWRiYWNrQ29udGV4dCB9IGZyb20gJy4vYWdlbnRGZWVkYmFja0VkaXRvclV0aWxzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQ29kZVJldmlld1N1Z2dlc3Rpb24gfSBmcm9tICcuLi8uLi9jb2RlUmV2aWV3L2Jyb3dzZXIvY29kZVJldmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24sIElTZXNzaW9uRmlsZUNoYW5nZSwgSVNlc3Npb25Xb3Jrc3BhY2UsIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBpc0FnZW50SG9zdFByb3ZpZGVySWQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBBbm5vdGF0aW9uc0FnZW50RmVlZGJhY2tJdGVtc0JhY2tlbmQsIElBZ2VudEZlZWRiYWNrSXRlbXNCYWNrZW5kLCBJbk1lbW9yeUFnZW50RmVlZGJhY2tJdGVtc0JhY2tlbmQgfSBmcm9tICcuL2FnZW50RmVlZGJhY2tJdGVtc0JhY2tlbmQuanMnO1xuaW1wb3J0IHsgQVRUQUNITUVOVF9JRF9QUkVGSVgsIGNyZWF0ZUFnZW50RmVlZGJhY2tWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi9hZ2VudEZlZWRiYWNrQXR0YWNobWVudEVudHJ5LmpzJztcbmltcG9ydCB7IEFnZW50RmVlZGJhY2tLaW5kLCBBZ2VudEZlZWRiYWNrU3RhdGUsIHR5cGUgSUFnZW50RmVlZGJhY2sgfSBmcm9tICcuL2FnZW50RmVlZGJhY2tNb2RlbC5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uRWRpdG9yQ29tbWVudFNvdXJjZSwgdG9TZXNzaW9uRWRpdG9yQ29tbWVudElkIH0gZnJvbSAnLi9zZXNzaW9uRWRpdG9yQ29tbWVudHMuanMnO1xuXG4vLyAtLS0gVHlwZXMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLy8gVGhlIGNvcmUgZmVlZGJhY2sgbW9kZWwgKGBJQWdlbnRGZWVkYmFja2AgYW5kIHRoZSBgQWdlbnRGZWVkYmFja0tpbmRgIC9cbi8vIGBBZ2VudEZlZWRiYWNrU3RhdGVgIGVudW1zKSBsaXZlcyBpbiBgYWdlbnRGZWVkYmFja01vZGVsLnRzYCBzbyB0aGUgc3RvcmFnZVxuLy8gYmFja2VuZHMgY2FuIGRlcGVuZCBvbiBpdCB3aXRob3V0IGEgZGVwZW5kZW5jeSBjeWNsZSBiYWNrIHRocm91Z2ggdGhpc1xuLy8gc2VydmljZS4gUmUtZXhwb3J0ZWQgaGVyZSBmb3IgY29uc3VtZXJzIHRoYXQgaW1wb3J0IHRoZXNlIHR5cGVzIGZyb20gdGhlXG4vLyBzZXJ2aWNlLlxuZXhwb3J0IHsgQWdlbnRGZWVkYmFja0tpbmQsIEFnZW50RmVlZGJhY2tTdGF0ZSwgdHlwZSBJQWdlbnRGZWVkYmFjayB9O1xuXG4vKiogU2hhcmVkIGZlZWRiYWNrIHNjb3BlIGZvciBldmVyeSB1bmRlZmluZWQgb3IgdW5jcmVhdGVkIGFjdGl2ZSBzZXNzaW9uLiAqL1xuZXhwb3J0IGNvbnN0IEFHRU5UX0ZFRURCQUNLX05FV19TRVNTSU9OX1JFU09VUkNFID0gVVJJLmZyb20oeyBzY2hlbWU6ICdhZ2VudC1mZWVkYmFjaycsIHBhdGg6ICcvbmV3LXNlc3Npb24nIH0pO1xuXG4vKipcbiAqIEhvdyBsb25nIHN1Ym1pdHRpbmcgZmVlZGJhY2sgd2FpdHMgZm9yIHRoZSBzZXNzaW9uJ3MgY2hhdCBtb2RlbCB0byBiZSBsb2FkZWQgaW50byBhIGNoYXQgd2lkZ2V0XG4gKiBiZWZvcmUgZ2l2aW5nIHVwLlxuICovXG5jb25zdCBXSURHRVRfTE9BRF9USU1FT1VUX01TID0gMTBfMDAwO1xuXG4vKipcbiAqIFJlc29sdmVzIHRoZSBjaGF0IHdpZGdldCB0aGF0IGhhcyB0aGUgc2Vzc2lvbiBsb2FkZWQsIHdhaXRpbmcgZm9yIGl0IHRvIGFwcGVhciB3aGVuIHRoZSBzZXNzaW9uJ3NcbiAqIG1vZGVsIGhhcyBub3QgYmVlbiBsb2FkZWQgaW50byBhIHdpZGdldCB5ZXQuXG4gKlxuICogRmVlZGJhY2sgY2FuIGJlIHN1Ym1pdHRlZCAoZS5nLiBmcm9tIHRoZSBDaGFuZ2VzIGVkaXRvciBvciB0aGUgY29tbWVudHMgaW5wdXQgYmFubmVyKSB3aGlsZSB0aGVcbiAqIHNlc3Npb24gaXMgc3RpbGwgYmVpbmcgcmVzdG9yZWQgaW50byBpdHMgY2hhdCB3aWRnZXQuIGBnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZWAgbWF0Y2hlcyBvbiB0aGVcbiAqIHdpZGdldCdzICpsb2FkZWQqIHZpZXcgbW9kZWwsIHNvIGl0IHJldHVybnMgYHVuZGVmaW5lZGAgdW50aWwgdGhlIG1vZGVsIGFycml2ZXMgXHUyMDE0IHN1Ym1pdHRpbmcgdGhlblxuICogd291bGQgc2lsZW50bHkgZHJvcCB0aGUgZmVlZGJhY2suIFJlc29sdmVzIGB1bmRlZmluZWRgIGlmIG5vIHdpZGdldCBsb2FkcyB0aGUgc2Vzc2lvbiBpbiB0aW1lLlxuICpcbiAqIEV4cG9ydGVkIGZvciB0ZXN0cy5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdoZW5XaWRnZXRGb3JTZXNzaW9uKGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsIHNlc3Npb25SZXNvdXJjZTogVVJJLCB0aW1lb3V0TXM6IG51bWJlciA9IFdJREdFVF9MT0FEX1RJTUVPVVRfTVMpOiBQcm9taXNlPElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IGV4aXN0aW5nID0gY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlKTtcblx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHR9XG5cblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHRyeSB7XG5cdFx0Y29uc3QgbG9hZGVkID0gbmV3IFByb21pc2U8SUNoYXRXaWRnZXQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgY2hlY2sgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHdpZGdldCA9IGNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGlmICh3aWRnZXQpIHtcblx0XHRcdFx0XHRyZXNvbHZlKHdpZGdldCk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IG9ic2VydmUgPSAoY2FuZGlkYXRlOiBJQ2hhdFdpZGdldCkgPT4gc3RvcmUuYWRkKGNhbmRpZGF0ZS5vbkRpZENoYW5nZVZpZXdNb2RlbChjaGVjaykpO1xuXG5cdFx0XHRjaGF0V2lkZ2V0U2VydmljZS5nZXRBbGxXaWRnZXRzKCkuZm9yRWFjaChvYnNlcnZlKTtcblx0XHRcdHN0b3JlLmFkZChjaGF0V2lkZ2V0U2VydmljZS5vbkRpZEFkZFdpZGdldChhZGRlZCA9PiB7XG5cdFx0XHRcdG9ic2VydmUoYWRkZWQpO1xuXHRcdFx0XHRjaGVjaygpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBBIHdpZGdldCBtYXkgaGF2ZSBsb2FkZWQgdGhlIHNlc3Npb24gd2hpbGUgdGhlIGxpc3RlbmVycyB3ZXJlIGJlaW5nIHdpcmVkIHVwLlxuXHRcdFx0Y2hlY2soKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBhd2FpdCByYWNlVGltZW91dChsb2FkZWQsIHRpbWVvdXRNcyk7XG5cdH0gZmluYWxseSB7XG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5hdmlnYWJsZVNlc3Npb25Db21tZW50IHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcbn1cblxuLyoqIE9wdGlvbnMgZm9yIHtAbGluayBJQWdlbnRGZWVkYmFja1NlcnZpY2UuYWNjZXB0RmVlZGJhY2t9LiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWNjZXB0RmVlZGJhY2tPcHRpb25zIHtcblx0LyoqXG5cdCAqIEZsYWcgdGhlIGFjY2VwdGVkIGl0ZW0gYXMgcGVuZGluZyByZXZlYWwgdG8gdGhlIGFnZW50IHNvIHRoZVxuXHQgKiBgdmlld1VucmV2aWV3ZWRDb21tZW50c2Agc2VydmVyIHRvb2wgcmV0dXJucyBpdCAoYW5kIG9ubHkgdGhlIGl0ZW1zXG5cdCAqIHJldmVhbGVkIGluIHRoZSBzYW1lIGludm9jYXRpb24pLlxuXHQgKi9cblx0cmVhZG9ubHkgcmV2ZWFsVG9BZ2VudD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50RmVlZGJhY2tDaGFuZ2VFdmVudCB7XG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBmZWVkYmFja0l0ZW1zOiByZWFkb25seSBJQWdlbnRGZWVkYmFja1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEZlZWRiYWNrTmF2aWdhdGlvbkJlYXJpbmcge1xuXHRyZWFkb25seSBhY3RpdmVJZHg6IG51bWJlcjtcblx0cmVhZG9ubHkgdG90YWxDb3VudDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEZlZWRiYWNrQ29tbWVudFJldmVhbEV2ZW50IHtcblx0cmVhZG9ubHkgc2Vzc2lvblJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IGNvbW1lbnRJZDogc3RyaW5nO1xuXHRyZWFkb25seSByZXNvdXJjZVVyaTogVVJJO1xufVxuXG4vKiogRmlyZWQgd2hlbiBhIGJyYW5kLW5ldyBhZ2VudCBmZWVkYmFjayBpdGVtIGlzIGFkZGVkIGJ5IHRoZSB1c2VyLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRGZWVkYmFja0FkZGVkRXZlbnQge1xuXHRyZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgZmVlZGJhY2s6IElBZ2VudEZlZWRiYWNrO1xuXHRyZWFkb25seSBoYXNFeGlzdGluZ0ZlZWRiYWNrRm9yRmlsZTogYm9vbGVhbjtcbn1cblxuLyoqIEZpcmVkIHdoZW4gYW4gZXhpc3RpbmcgUFIvY29kZS1yZXZpZXcgY29tbWVudCBpcyBjb252ZXJ0ZWQgaW50byBhZ2VudCBmZWVkYmFjay4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50RmVlZGJhY2tDb252ZXJ0ZWRFdmVudCB7XG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBmZWVkYmFjazogSUFnZW50RmVlZGJhY2s7XG5cdHJlYWRvbmx5IGtpbmQ6IEFnZW50RmVlZGJhY2tLaW5kLkFnZW50UmV2aWV3IHwgQWdlbnRGZWVkYmFja0tpbmQuUFJSZXZpZXc7XG5cdHJlYWRvbmx5IGhhc0V4aXN0aW5nRmVlZGJhY2tGb3JGaWxlOiBib29sZWFuO1xufVxuXG4vKiogRmlyZWQgd2hlbiBhIHJlcGx5IGlzIGFwcGVuZGVkIHRvIGFuIGV4aXN0aW5nIGZlZWRiYWNrIHRocmVhZC4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50RmVlZGJhY2tSZXBseUFkZGVkRXZlbnQge1xuXHRyZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgZmVlZGJhY2s6IElBZ2VudEZlZWRiYWNrO1xuXHRyZWFkb25seSByZXBseUNvdW50OiBudW1iZXI7XG59XG5cbi8qKiBGaXJlZCB3aGVuIGZlZWRiYWNrIGl0ZW1zIGFyZSBzdWJtaXR0ZWQgdG8gdGhlIGFnZW50IGZvciBhY3Rpb24uICovXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEZlZWRiYWNrU3VibWl0dGVkRXZlbnQge1xuXHRyZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgdG90YWxDb3VudDogbnVtYmVyO1xuXHRyZWFkb25seSB1c2VyQ291bnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgY29kZVJldmlld0NvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IHByUmV2aWV3Q291bnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgcmVwbHlDb3VudDogbnVtYmVyO1xufVxuXG4vLyAtLS0gU2VydmljZSBJbnRlcmZhY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGNvbnN0IElBZ2VudEZlZWRiYWNrU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQWdlbnRGZWVkYmFja1NlcnZpY2U+KCdhZ2VudEZlZWRiYWNrU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEZlZWRiYWNrU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUZlZWRiYWNrOiBFdmVudDxJQWdlbnRGZWVkYmFja0NoYW5nZUV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VOYXZpZ2F0aW9uOiBFdmVudDxVUkk+O1xuXHRyZWFkb25seSBvbkRpZFJldmVhbFNlc3Npb25Db21tZW50OiBFdmVudDxJQWdlbnRGZWVkYmFja0NvbW1lbnRSZXZlYWxFdmVudD47XG5cdC8qKiBGaXJlZCB3aGVuIHtAbGluayBnZXRGZWVkYmFja1Nlc3Npb25SZXNvdXJjZX0gbWF5IHJlc29sdmUgZGlmZmVyZW50bHkuICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmVlZGJhY2tTY29wZTogRXZlbnQ8dm9pZD47XG5cblx0LyoqXG5cdCAqIFRoZSBmZWVkYmFjayBzY29wZSBvZiB0aGUgYWN0aXZlIHNlc3Npb24gdmlldzogdGhlIGFjdGl2ZSBzZXNzaW9uIGl0c2VsZixcblx0ICogb3Ige0BsaW5rIEFHRU5UX0ZFRURCQUNLX05FV19TRVNTSU9OX1JFU09VUkNFfSB3aGlsZSBpdCBpcyB1bmRlZmluZWQgb3Jcblx0ICogdW5jcmVhdGVkLiBVbmxpa2Uge0BsaW5rIGdldEZlZWRiYWNrU2Vzc2lvblJlc291cmNlfSB0aGlzIGlzIG5vdFxuXHQgKiBmaWxlLXNjb3BlZCwgc28gaXQgYWx3YXlzIHJlc29sdmVzIHRvIGEgc2NvcGUuXG5cdCAqL1xuXHRyZWFkb25seSBhY3RpdmVGZWVkYmFja1Nlc3Npb25SZXNvdXJjZTogSU9ic2VydmFibGU8VVJJPjtcblxuXHQvKiogRmlyZWQgd2hlbiBhIG5ldyB1c2VyLWF1dGhvcmVkIGZlZWRiYWNrIGl0ZW0gaXMgYWRkZWQuICovXG5cdHJlYWRvbmx5IG9uRGlkQWRkRmVlZGJhY2s6IEV2ZW50PElBZ2VudEZlZWRiYWNrQWRkZWRFdmVudD47XG5cdC8qKiBGaXJlZCB3aGVuIGFuIGV4dGVybmFsIHJldmlldyBjb21tZW50IGlzIGNvbnZlcnRlZCBpbnRvIGFnZW50IGZlZWRiYWNrLiAqL1xuXHRyZWFkb25seSBvbkRpZENvbnZlcnRGZWVkYmFjazogRXZlbnQ8SUFnZW50RmVlZGJhY2tDb252ZXJ0ZWRFdmVudD47XG5cdC8qKiBGaXJlZCB3aGVuIGEgcmVwbHkgaXMgYXBwZW5kZWQgdG8gYW4gZXhpc3RpbmcgZmVlZGJhY2sgdGhyZWFkLiAqL1xuXHRyZWFkb25seSBvbkRpZEFkZFJlcGx5OiBFdmVudDxJQWdlbnRGZWVkYmFja1JlcGx5QWRkZWRFdmVudD47XG5cdC8qKiBGaXJlZCB3aGVuIGZlZWRiYWNrIGl0ZW1zIGFyZSBzdWJtaXR0ZWQgdG8gdGhlIGFnZW50LiAqL1xuXHRyZWFkb25seSBvbkRpZFN1Ym1pdEZlZWRiYWNrOiBFdmVudDxJQWdlbnRGZWVkYmFja1N1Ym1pdHRlZEV2ZW50PjtcblxuXHQvKipcblx0ICogQWRkIGEgZmVlZGJhY2sgaXRlbSBmb3IgdGhlIGdpdmVuIHNlc3Npb24uIHtAbGluayBraW5kfSAoZGVmYXVsdHMgdG9cblx0ICoge0BsaW5rIEFnZW50RmVlZGJhY2tLaW5kLlVzZXJSZXZpZXd9KSBjbGFzc2lmaWVzIHRoZSBvcmlnaW4gb2YgdGhlXG5cdCAqIGZlZWRiYWNrLiB7QGxpbmsgc3RhdGV9IChkZWZhdWx0c1xuXHQgKiB0byB7QGxpbmsgQWdlbnRGZWVkYmFja1N0YXRlLkFjY2VwdGVkfSkgc2V0cyB0aGUgaW5pdGlhbCBsaWZlY3ljbGUgc3RhdGVcblx0ICogYW5kIHNlbGVjdHMgd2hpY2ggbGlmZWN5Y2xlIGV2ZW50IGlzIGZpcmVkLlxuXHQgKi9cblx0YWRkRmVlZGJhY2soc2Vzc2lvblJlc291cmNlOiBVUkksIHJlc291cmNlVXJpOiBVUkksIHJhbmdlOiBJUmFuZ2UsIHRleHQ6IHN0cmluZywgc3VnZ2VzdGlvbj86IElDb2RlUmV2aWV3U3VnZ2VzdGlvbiwgY29udGV4dD86IElBZ2VudEZlZWRiYWNrQ29udGV4dCwgc291cmNlUFJSZXZpZXdDb21tZW50SWQ/OiBzdHJpbmcsIGtpbmQ/OiBBZ2VudEZlZWRiYWNrS2luZCwgc3RhdGU/OiBBZ2VudEZlZWRiYWNrU3RhdGUpOiBJQWdlbnRGZWVkYmFjaztcblxuXHQvKipcblx0ICogQWNjZXB0IGEgZmVlZGJhY2sgaXRlbSB0aGF0IGlzIGN1cnJlbnRseSBpbiB0aGVcblx0ICoge0BsaW5rIEFnZW50RmVlZGJhY2tTdGF0ZS5DcmVhdGVkfSBzdGF0ZSwgdHJhbnNpdGlvbmluZyBpdCB0b1xuXHQgKiB7QGxpbmsgQWdlbnRGZWVkYmFja1N0YXRlLkFjY2VwdGVkfSBzbyBpdCBiZWNvbWVzIHN1Ym1pdHRhYmxlIGFuZCBpc1xuXHQgKiBhdHRhY2hlZCB0byB0aGUgY2hhdCBpbnB1dC5cblx0ICpcblx0ICogV2hlbiB7QGxpbmsgSUFjY2VwdEZlZWRiYWNrT3B0aW9ucy5yZXZlYWxUb0FnZW50fSBpcyBzZXQsIHRoZSBpdGVtIGlzXG5cdCAqIGFkZGl0aW9uYWxseSBmbGFnZ2VkIGFzIHBlbmRpbmcgcmV2ZWFsIHRvIHRoZSBhZ2VudCBzbyB0aGVcblx0ICogYHZpZXdVbnJldmlld2VkQ29tbWVudHNgIHNlcnZlciB0b29sIHJldHVybnMgZXhhY3RseSB0aGUgY29tbWVudHMgdGhlIHVzZXJcblx0ICogY2hvc2UgdG8gcmV2ZWFsIGZvciB0aGF0IGludm9jYXRpb24uXG5cdCAqL1xuXHRhY2NlcHRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgZmVlZGJhY2tJZDogc3RyaW5nLCBvcHRpb25zPzogSUFjY2VwdEZlZWRiYWNrT3B0aW9ucyk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFJlbW92ZSBhIHNpbmdsZSBmZWVkYmFjayBpdGVtLlxuXHQgKi9cblx0cmVtb3ZlRmVlZGJhY2soc2Vzc2lvblJlc291cmNlOiBVUkksIGZlZWRiYWNrSWQ6IHN0cmluZyk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFVwZGF0ZSB0aGUgdGV4dCBvZiBhbiBleGlzdGluZyBmZWVkYmFjayBpdGVtLlxuXHQgKi9cblx0dXBkYXRlRmVlZGJhY2soc2Vzc2lvblJlc291cmNlOiBVUkksIGZlZWRiYWNrSWQ6IHN0cmluZywgbmV3VGV4dDogc3RyaW5nKTogdm9pZDtcblxuXHQvKipcblx0ICogTWFyayBhbiBleGlzdGluZyBmZWVkYmFjayBpdGVtIGFzIHJlc29sdmVkLiBSZXNvbHZpbmcgbW92ZXMgdGhlIGl0ZW0gdG9cblx0ICoge0BsaW5rIEFnZW50RmVlZGJhY2tTdGF0ZS5SZXNvbHZlZH07IHVuLXJlc29sdmluZyByZXR1cm5zIGl0IHRvXG5cdCAqIHtAbGluayBBZ2VudEZlZWRiYWNrU3RhdGUuU3VibWl0dGVkfS5cblx0ICovXG5cdHNldEZlZWRiYWNrUmVzb2x2ZWQoc2Vzc2lvblJlc291cmNlOiBVUkksIGZlZWRiYWNrSWQ6IHN0cmluZywgcmVzb2x2ZWQ6IGJvb2xlYW4pOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBBcHBlbmQgYSByZXBseSB0byBhbiBleGlzdGluZyBmZWVkYmFjayBpdGVtLCBtYWtpbmcgaXQgcGFydCBvZiB0aGUgc2FtZVxuXHQgKiBjb21tZW50IHRocmVhZC5cblx0ICovXG5cdGFkZFJlcGx5KHNlc3Npb25SZXNvdXJjZTogVVJJLCBmZWVkYmFja0lkOiBzdHJpbmcsIHJlcGx5VGV4dDogc3RyaW5nKTogdm9pZDtcblxuXHQvKipcblx0ICogR2V0IGFsbCBmZWVkYmFjayBpdGVtcyBmb3IgYSBzZXNzaW9uLlxuXHQgKi9cblx0Z2V0RmVlZGJhY2soc2Vzc2lvblJlc291cmNlOiBVUkkpOiByZWFkb25seSBJQWdlbnRGZWVkYmFja1tdO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHtAbGluayBnZXRGZWVkYmFja30gcmVmbGVjdHMgdGhlIGF1dGhvcml0YXRpdmUgaXRlbSBzZXQgZm9yIHRoZVxuXHQgKiBzZXNzaW9uLiBGb3IgYWdlbnQtaG9zdCBzZXNzaW9ucyB0aGlzIGlzIGBmYWxzZWAgdW50aWwgdGhlIHNlc3Npb24nc1xuXHQgKiBhbm5vdGF0aW9ucyBzbmFwc2hvdCBoYXMgYmVlbiByZWNlaXZlZDsgZm9yIG90aGVyIHNlc3Npb25zIGl0IGlzIGFsd2F5c1xuXHQgKiBgdHJ1ZWAuIENhbGxlcnMgdGhhdCBzZWVkIGZlZWRiYWNrIGZyb20gYW5vdGhlciBzb3VyY2UgbXVzdCB3YWl0IGZvciB0aGlzXG5cdCAqIHRvIGF2b2lkIGFjdGluZyBvbiBhIHRyYW5zaWVudGx5LWVtcHR5IGxpc3QuXG5cdCAqL1xuXHRoYXNMb2FkZWRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgdGhlIHNlc3Npb24gdGhhdCBvd25zIHRoZSBnaXZlbiBmaWxlIHJlc291cmNlLiBSZXR1cm5zIHRoZVxuXHQgKiBzZXNzaW9uIHRoYXQgd2FzIGFjdGl2ZSB3aGVuIHRoZSBmaWxlJ3MgZWRpdG9yIHdhcyBmaXJzdCBvcGVuZWQ7IGlmIHRoZVxuXHQgKiBmaWxlIGhhcyBuZXZlciBiZWVuIHRyYWNrZWQsIGZhbGxzIGJhY2sgdG8gdGhlIGN1cnJlbnRseSBhY3RpdmUgc2Vzc2lvbi5cblx0ICogUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIHRoZSBmaWxlIGlzIG5vdCBpbiBzY29wZSBmb3IgdGhlIHNlc3Npb24gKGUuZy5cblx0ICogdGhlIE91dHB1dCB2aWV3IG9yIGZpbGVzIG91dHNpZGUgdGhlIHNlc3Npb24ncyB3b3Jrc3BhY2UgZm9sZGVycykuXG5cdCAqL1xuXHRnZXRTZXNzaW9uRm9yRmlsZShyZXNvdXJjZVVyaTogVVJJKTogSVNlc3Npb24gfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgdGhlIGZlZWRiYWNrIHNjb3BlIHNob3duIGZvciBhIGZpbGUgaW4gdGhlIGN1cnJlbnQgc2Vzc2lvbiB2aWV3LCBvclxuXHQgKiBgdW5kZWZpbmVkYCB3aGVuIHRoZSBmaWxlIGlzIG91dCBvZiBzY29wZS5cblx0ICovXG5cdGdldEZlZWRiYWNrU2Vzc2lvblJlc291cmNlKHJlc291cmNlVXJpOiBVUkkpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHJlZ2lzdGVyRmVlZGJhY2tSZXNvdXJjZVNjb3BlKHJlc291cmNlVXJpOiBVUkksIHNlc3Npb25SZXNvdXJjZTogVVJJKTogSURpc3Bvc2FibGU7XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgdGhlIG1vc3QgcmVjZW50bHkgdXBkYXRlZCBzZXNzaW9uIHRoYXQgaGFzIGZlZWRiYWNrIGZvciBhIGdpdmVuIHJlc291cmNlLlxuXHQgKi9cblx0Z2V0TW9zdFJlY2VudFNlc3Npb25Gb3JSZXNvdXJjZShyZXNvdXJjZVVyaTogVVJJKTogVVJJIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBTZXQgdGhlIG5hdmlnYXRpb24gYW5jaG9yIHRvIGEgc3BlY2lmaWMgZmVlZGJhY2sgaXRlbSwgb3BlbiBpdHMgZWRpdG9yLCBhbmQgZmlyZSBhIG5hdmlnYXRpb24gZXZlbnQuXG5cdCAqL1xuXHRyZXZlYWxGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgZmVlZGJhY2tJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogT3BlbiBhbiBlZGl0b3IgZm9yIHRoZSBnaXZlbiBzZXNzaW9uIGNvbW1lbnQgKGZlZWRiYWNrIG9yIGNvZGUtcmV2aWV3KSBhdCBpdHMgcmFuZ2Vcblx0ICogYW5kIHNldCBpdCBhcyB0aGUgbmF2aWdhdGlvbiBhbmNob3IuXG5cdCAqL1xuXHRyZXZlYWxTZXNzaW9uQ29tbWVudChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgY29tbWVudElkOiBzdHJpbmcsIHJlc291cmNlVXJpOiBVUkksIHJhbmdlOiBJUmFuZ2UpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBOYXZpZ2F0ZSB0byBuZXh0L3ByZXZpb3VzIGZlZWRiYWNrIGl0ZW0gaW4gYSBzZXNzaW9uLlxuXHQgKi9cblx0Z2V0TmV4dEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZTogVVJJLCBuZXh0OiBib29sZWFuKTogSUFnZW50RmVlZGJhY2sgfCB1bmRlZmluZWQ7XG5cdGdldE5leHROYXZpZ2FibGVJdGVtPFQgZXh0ZW5kcyBJTmF2aWdhYmxlU2Vzc2lvbkNvbW1lbnQ+KHNlc3Npb25SZXNvdXJjZTogVVJJLCBpdGVtczogcmVhZG9ubHkgVFtdLCBuZXh0OiBib29sZWFuKTogVCB8IHVuZGVmaW5lZDtcblx0c2V0TmF2aWdhdGlvbkFuY2hvcihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgaXRlbUlkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGN1cnJlbnQgbmF2aWdhdGlvbiBiZWFyaW5ncyBmb3IgYSBzZXNzaW9uLlxuXHQgKi9cblx0Z2V0TmF2aWdhdGlvbkJlYXJpbmcoc2Vzc2lvblJlc291cmNlOiBVUkksIGl0ZW1zPzogcmVhZG9ubHkgSU5hdmlnYWJsZVNlc3Npb25Db21tZW50W10pOiBJQWdlbnRGZWVkYmFja05hdmlnYXRpb25CZWFyaW5nO1xuXG5cdC8qKlxuXHQgKiBDbGVhciBhbGwgZmVlZGJhY2sgaXRlbXMgZm9yIGEgc2Vzc2lvbiAoZS5nLiwgYWZ0ZXIgc2VuZGluZykuXG5cdCAqL1xuXHRjbGVhckZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZDtcblxuXHQvKipcblx0ICogTWFyayBhbGwgYWNjZXB0ZWQgZmVlZGJhY2sgaXRlbXMgZm9yIHRoZSBzZXNzaW9uIGFzIHN1Ym1pdHRlZCwgZmlyaW5nXG5cdCAqIHtAbGluayBvbkRpZFN1Ym1pdEZlZWRiYWNrfSB3aXRoIHRoZSBwZXIta2luZCBjb3VudHMgb2YgdGhlIGl0ZW1zIHRoYXRcblx0ICogd2VyZSBzdWJtaXR0ZWQuIEFnZW50LWhvc3Qgc2Vzc2lvbnMgbW92ZSB0aGUgaXRlbXMgdG9cblx0ICoge0BsaW5rIEFnZW50RmVlZGJhY2tTdGF0ZS5TdWJtaXR0ZWR9IHNvIHRoZXkgc3RheSB2aXNpYmxlIHVudGlsIHRoZSBhZ2VudFxuXHQgKiByZXNvbHZlcyB0aGVtOyBvdGhlciBwcm92aWRlcnMgaGF2ZSBubyBzdWNoIGFnZW50IGxvb3AsIHNvIHRoZSBpdGVtcyBtb3ZlXG5cdCAqIHN0cmFpZ2h0IHRvIHtAbGluayBBZ2VudEZlZWRiYWNrU3RhdGUuUmVzb2x2ZWR9LiBOby1vcCB3aGVuIHRoZXJlIGFyZSBub1xuXHQgKiBhY2NlcHRlZCBpdGVtcy5cblx0ICovXG5cdG1hcmtGZWVkYmFja1N1Ym1pdHRlZChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFN1Ym1pdCB0aGUgY3VycmVudGx5IGFjY3VtdWxhdGVkIGFjY2VwdGVkIGZlZWRiYWNrIGZvciB0aGUgc2Vzc2lvbiB0byB0aGVcblx0ICogYWdlbnQgYW5kIG1hcmsgdGhvc2UgaXRlbXMgYXMgc3VibWl0dGVkLiBXYWl0cyBmb3IgdGhlIHNlc3Npb24ncyBjaGF0IG1vZGVsIHRvIGJlIGxvYWRlZFxuXHQgKiBpbnRvIGEgY2hhdCB3aWRnZXQsIHRoZW4gcmVzb2x2ZXMgb25jZSB0aGUgcmVxdWVzdCBoYXMgYmVlbiBhY2NlcHRlZCBieSB0aGF0IHdpZGdldCBcdTIwMTQgd2hpY2gsXG5cdCAqIHdoaWxlIGFub3RoZXIgcmVxdWVzdCBpcyBpbiBwcm9ncmVzcywgbWVhbnMgaXQgd2FzIHF1ZXVlZCByYXRoZXIgdGhhbiBzZW50LiBSZXR1cm5zIHdoZXRoZXJcblx0ICogdGhlIGZlZWRiYWNrIHdhcyBzdWJtaXR0ZWQuXG5cdCAqL1xuXHRzdWJtaXRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj47XG5cblx0LyoqXG5cdCAqIEFkZCBhIGZlZWRiYWNrIGl0ZW0gYW5kIHRoZW4gc3VibWl0IHRoZSBmZWVkYmFjay4gV2FpdHMgZm9yIHRoZVxuXHQgKiBhdHRhY2htZW50IHRvIGJlIHVwZGF0ZWQgaW4gdGhlIGNoYXQgd2lkZ2V0IGJlZm9yZSBzdWJtaXR0aW5nLlxuXHQgKi9cblx0YWRkRmVlZGJhY2tBbmRTdWJtaXQoc2Vzc2lvblJlc291cmNlOiBVUkksIHJlc291cmNlVXJpOiBVUkksIHJhbmdlOiBJUmFuZ2UsIHRleHQ6IHN0cmluZywgc3VnZ2VzdGlvbj86IElDb2RlUmV2aWV3U3VnZ2VzdGlvbiwgY29udGV4dD86IElBZ2VudEZlZWRiYWNrQ29udGV4dCwgc291cmNlUFJSZXZpZXdDb21tZW50SWQ/OiBzdHJpbmcsIGtpbmQ/OiBBZ2VudEZlZWRiYWNrS2luZCk6IFByb21pc2U8dm9pZD47XG59XG5cbi8vIC0tLSBJbXBsZW1lbnRhdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKiogU3RhYmxlIGlkZW50aXR5IG9mIGEgc2Vzc2lvbidzIHdvcmtzcGFjZSwgb3IgYHVuZGVmaW5lZGAgd2hlbiBpdCBoYXMgbm9uZSAoeWV0KS4gKi9cbmZ1bmN0aW9uIHdvcmtzcGFjZUZvbGRlcnNLZXkod29ya3NwYWNlOiBJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB3b3Jrc3BhY2U/LmZvbGRlcnMubWFwKGZvbGRlciA9PiBmb2xkZXIucm9vdC50b1N0cmluZygpKS5qb2luKCcsJyk7XG59XG5cbmV4cG9ydCBjbGFzcyBBZ2VudEZlZWRiYWNrU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWdlbnRGZWVkYmFja1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRmVlZGJhY2sgPSB0aGlzLl9zdG9yZS5hZGQobmV3IEVtaXR0ZXI8SUFnZW50RmVlZGJhY2tDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmVlZGJhY2sgPSB0aGlzLl9vbkRpZENoYW5nZUZlZWRiYWNrLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU5hdmlnYXRpb24gPSB0aGlzLl9zdG9yZS5hZGQobmV3IEVtaXR0ZXI8VVJJPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VOYXZpZ2F0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VOYXZpZ2F0aW9uLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJldmVhbFNlc3Npb25Db21tZW50ID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElBZ2VudEZlZWRiYWNrQ29tbWVudFJldmVhbEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXZlYWxTZXNzaW9uQ29tbWVudCA9IHRoaXMuX29uRGlkUmV2ZWFsU2Vzc2lvbkNvbW1lbnQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRmVlZGJhY2tTY29wZSA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGZWVkYmFja1Njb3BlID0gdGhpcy5fb25EaWRDaGFuZ2VGZWVkYmFja1Njb3BlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFkZEZlZWRiYWNrID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElBZ2VudEZlZWRiYWNrQWRkZWRFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWRkRmVlZGJhY2sgPSB0aGlzLl9vbkRpZEFkZEZlZWRiYWNrLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENvbnZlcnRGZWVkYmFjayA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRW1pdHRlcjxJQWdlbnRGZWVkYmFja0NvbnZlcnRlZEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDb252ZXJ0RmVlZGJhY2sgPSB0aGlzLl9vbkRpZENvbnZlcnRGZWVkYmFjay5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBZGRSZXBseSA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRW1pdHRlcjxJQWdlbnRGZWVkYmFja1JlcGx5QWRkZWRFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWRkUmVwbHkgPSB0aGlzLl9vbkRpZEFkZFJlcGx5LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFN1Ym1pdEZlZWRiYWNrID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElBZ2VudEZlZWRiYWNrU3VibWl0dGVkRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFN1Ym1pdEZlZWRiYWNrID0gdGhpcy5fb25EaWRTdWJtaXRGZWVkYmFjay5ldmVudDtcblxuXHRyZWFkb25seSBhY3RpdmVGZWVkYmFja1Nlc3Npb25SZXNvdXJjZTogSU9ic2VydmFibGU8VVJJPjtcblxuXHQvKiogc2Vzc2lvblJlc291cmNlIFx1MjE5MiByZWNlbmN5IHNlcXVlbmNlIChzZXQgb24gZXZlcnkgZmVlZGJhY2sgY2hhbmdlKSAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uVXBkYXRlZE9yZGVyID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0cHJpdmF0ZSBfc2Vzc2lvblVwZGF0ZWRTZXF1ZW5jZSA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgX25hdmlnYXRpb25BbmNob3JCeVNlc3Npb24gPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdC8qKiBmaWxlUmVzb3VyY2UgXHUyMTkyIHNlc3Npb25SZXNvdXJjZSBhY3RpdmUgd2hlbiB0aGUgZWRpdG9yIGZvciB0aGF0IGZpbGUgd2FzIGZpcnN0IHNlZW4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZmlsZVRvU2Vzc2lvbiA9IG5ldyBSZXNvdXJjZU1hcDxVUkk+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4cGxpY2l0UmVzb3VyY2VTY29wZXMgPSBuZXcgUmVzb3VyY2VNYXA8VVJJPigpO1xuXG5cdC8qKiBXb3Jrc3BhY2UgdGhlIHNoYXJlZCBuZXctc2Vzc2lvbiBjb21tZW50cyBhcmUgYm91bmQgdG87IGB1bmRlZmluZWRgIHdoZW4gdGhlcmUgYXJlIG5vbmUuICovXG5cdHByaXZhdGUgX2JvdW5kTmV3U2Vzc2lvbldvcmtzcGFjZUtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBXb3Jrc3BhY2Ugb2YgdGhlIGRyYWZ0IHRoZSBuZXctc2Vzc2lvbiBzY29wZSBjdXJyZW50bHkgdGFyZ2V0cy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbmV3U2Vzc2lvbldvcmtzcGFjZUtleTogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblxuXHQvKiogSW4tbWVtb3J5IHN0b3JlIHVzZWQgZm9yIGV2ZXJ5IG5vbi1hZ2VudC1ob3N0IHByb3ZpZGVyLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbk1lbW9yeUJhY2tlbmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgSW5NZW1vcnlBZ2VudEZlZWRiYWNrSXRlbXNCYWNrZW5kKCkpO1xuXHQvKiogQW5ub3RhdGlvbnMtY2hhbm5lbC1iYWNrZWQgc3RvcmUgZm9yIGFnZW50LWhvc3Qgc2Vzc2lvbnM7IGNyZWF0ZWQgbGF6aWx5LiAqL1xuXHRwcml2YXRlIF9hbm5vdGF0aW9uc0JhY2tlbmQ6IEFubm90YXRpb25zQWdlbnRGZWVkYmFja0l0ZW1zQmFja2VuZCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRFZGl0aW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0RWRpdGluZ1NlcnZpY2U6IElDaGF0RWRpdGluZ1NlcnZpY2UsXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbk1lbW9yeUJhY2tlbmQub25EaWRDaGFuZ2VJdGVtcyhyZXNvdXJjZSA9PiB0aGlzLl9oYW5kbGVCYWNrZW5kQ2hhbmdlKHJlc291cmNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvclNlcnZpY2Uub25EaWRWaXNpYmxlRWRpdG9yc0NoYW5nZSgoKSA9PiB0aGlzLl90cmFja1Zpc2libGVFZGl0b3JSZXNvdXJjZXMoKSkpO1xuXHRcdHRoaXMuX3RyYWNrVmlzaWJsZUVkaXRvclJlc291cmNlcygpO1xuXG5cdFx0dGhpcy5hY3RpdmVGZWVkYmFja1Nlc3Npb25SZXNvdXJjZSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gIWFjdGl2ZVNlc3Npb24gfHwgIWFjdGl2ZVNlc3Npb24uaXNDcmVhdGVkLnJlYWQocmVhZGVyKVxuXHRcdFx0XHQ/IEFHRU5UX0ZFRURCQUNLX05FV19TRVNTSU9OX1JFU09VUkNFXG5cdFx0XHRcdDogYWN0aXZlU2Vzc2lvbi5yZXNvdXJjZTtcblx0XHR9KTtcblxuXHRcdC8vIERlbGliZXJhdGVseSBrZXllZCBvbiB0aGUgc2NvcGUgYW5kIGl0cyB3b3Jrc3BhY2UgZm9sZGVycyBvbmx5OiB0aGVcblx0XHQvLyBzZXNzaW9uJ3MgY2hhbmdlcyBhbHNvIGZlZWQgYGdldEZlZWRiYWNrU2Vzc2lvblJlc291cmNlYCwgYnV0IHRoZXkgY2h1cm5cblx0XHQvLyBjb25zdGFudGx5IHdoaWxlIGFuIGFnZW50IGVkaXRzIGFuZCByZS1icm9hZGNhc3RpbmcgdGhhdCB3b3VsZCByZWJ1aWxkXG5cdFx0Ly8gZXZlcnkgY29tbWVudCB3aWRnZXQgb24gZWFjaCB0aWNrLlxuXHRcdGNvbnN0IGZlZWRiYWNrU2NvcGVLZXkgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzY29wZSA9IHRoaXMuYWN0aXZlRmVlZGJhY2tTZXNzaW9uUmVzb3VyY2UucmVhZChyZWFkZXIpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik/LndvcmtzcGFjZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gYCR7c2NvcGV9fCR7d29ya3NwYWNlRm9sZGVyc0tleSh3b3Jrc3BhY2UpID8/ICcnfWA7XG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocnVuT25DaGFuZ2UoZmVlZGJhY2tTY29wZUtleSwgKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VGZWVkYmFja1Njb3BlLmZpcmUoKSkpO1xuXG5cdFx0Ly8gYHVuZGVmaW5lZGAgbWVhbnMgdGhlIG5ldy1zZXNzaW9uIHNjb3BlIGlzIGRvcm1hbnQgKGEgY3JlYXRlZCBzZXNzaW9uIGlzXG5cdFx0Ly8gYWN0aXZlKSBvciB0aGUgZHJhZnQncyB3b3Jrc3BhY2UgaGFzIG5vdCByZXNvbHZlZCB5ZXQuIE5laXRoZXIgaXMgYVxuXHRcdC8vIHdvcmtzcGFjZSBjaGFuZ2UsIHNvIHRoZSBjb21tZW50cyBzdGF5IGJvdW5kIHRvIHRoZSBsYXN0IGtub3duIG9uZSBhbmQgYVxuXHRcdC8vIGRyYWZ0IHN3YXAgKHdoaWNoIGJyaWVmbHkgZHJvcHMgdGhlIHdvcmtzcGFjZSkgZG9lcyBub3QgZGlzY2FyZCB0aGVtLlxuXHRcdHRoaXMuX25ld1Nlc3Npb25Xb3Jrc3BhY2VLZXkgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFhY3RpdmVTZXNzaW9uIHx8IGFjdGl2ZVNlc3Npb24uaXNDcmVhdGVkLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHdvcmtzcGFjZUZvbGRlcnNLZXkoYWN0aXZlU2Vzc2lvbi53b3Jrc3BhY2UucmVhZChyZWFkZXIpKTtcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3RlcihydW5PbkNoYW5nZSh0aGlzLl9uZXdTZXNzaW9uV29ya3NwYWNlS2V5LCBrZXkgPT4ge1xuXHRcdFx0aWYgKGtleSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9ib3VuZE5ld1Nlc3Npb25Xb3Jrc3BhY2VLZXkgIT09IHVuZGVmaW5lZCAmJiB0aGlzLl9ib3VuZE5ld1Nlc3Npb25Xb3Jrc3BhY2VLZXkgIT09IGtleSkge1xuXHRcdFx0XHR0aGlzLmNsZWFyRmVlZGJhY2soQUdFTlRfRkVFREJBQ0tfTkVXX1NFU1NJT05fUkVTT1VSQ0UpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQ29tbWVudHMgd3JpdHRlbiBiZWZvcmUgYW55IHdvcmtzcGFjZSB3YXMgcGlja2VkIGFkb3B0IHRoaXMgc2VsZWN0aW9uLlxuXHRcdFx0dGhpcy5fcmViaW5kTmV3U2Vzc2lvbldvcmtzcGFjZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgc2hhcmVkIG5ldy1zZXNzaW9uIGNvbW1lbnRzIGJlbG9uZyB0byB0aGUgd29ya3NwYWNlIG9mIHRoZSBkcmFmdCB0aGV5XG5cdCAqIHdlcmUgd3JpdHRlbiBmb3IuIEFuIGVtcHR5IHNldCByZWxlYXNlcyB0aGUgYmluZGluZyBzbyB0aGUgbmV4dCBkcmFmdCBjYW5cblx0ICogYWRvcHQgaXRzIG93biB3b3Jrc3BhY2UgaW5zdGVhZCBvZiBiZWluZyBtZWFzdXJlZCBhZ2FpbnN0IGEgc3RhbGUgb25lLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmViaW5kTmV3U2Vzc2lvbldvcmtzcGFjZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZ2V0RmVlZGJhY2soQUdFTlRfRkVFREJBQ0tfTkVXX1NFU1NJT05fUkVTT1VSQ0UpLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fYm91bmROZXdTZXNzaW9uV29ya3NwYWNlS2V5ID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBrZXkgPSB0aGlzLl9uZXdTZXNzaW9uV29ya3NwYWNlS2V5LmdldCgpO1xuXHRcdGlmIChrZXkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fYm91bmROZXdTZXNzaW9uV29ya3NwYWNlS2V5ID0ga2V5O1xuXHRcdH1cblx0fVxuXG5cdC8qKiBSZXNvbHZlcyB0aGUgc3RvcmFnZSBiYWNrZW5kIHRoYXQgb3ducyBmZWVkYmFjayBmb3IgdGhlIGdpdmVuIHNlc3Npb24uICovXG5cdHByaXZhdGUgX2JhY2tlbmRGb3JTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKTogSUFnZW50RmVlZGJhY2tJdGVtc0JhY2tlbmQge1xuXHRcdGlmICh0aGlzLl9pc0FnZW50SG9zdFNlc3Npb24oc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dldEFubm90YXRpb25zQmFja2VuZCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5faW5NZW1vcnlCYWNrZW5kO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QW5ub3RhdGlvbnNCYWNrZW5kKCk6IEFubm90YXRpb25zQWdlbnRGZWVkYmFja0l0ZW1zQmFja2VuZCB7XG5cdFx0aWYgKCF0aGlzLl9hbm5vdGF0aW9uc0JhY2tlbmQpIHtcblx0XHRcdHRoaXMuX2Fubm90YXRpb25zQmFja2VuZCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFubm90YXRpb25zQWdlbnRGZWVkYmFja0l0ZW1zQmFja2VuZCkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYW5ub3RhdGlvbnNCYWNrZW5kLm9uRGlkQ2hhbmdlSXRlbXMocmVzb3VyY2UgPT4gdGhpcy5faGFuZGxlQmFja2VuZENoYW5nZShyZXNvdXJjZSkpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2Fubm90YXRpb25zQmFja2VuZDtcblx0fVxuXG5cdHByaXZhdGUgX2JhY2tlbmRzKCk6IHJlYWRvbmx5IElBZ2VudEZlZWRiYWNrSXRlbXNCYWNrZW5kW10ge1xuXHRcdHJldHVybiB0aGlzLl9hbm5vdGF0aW9uc0JhY2tlbmQgPyBbdGhpcy5faW5NZW1vcnlCYWNrZW5kLCB0aGlzLl9hbm5vdGF0aW9uc0JhY2tlbmRdIDogW3RoaXMuX2luTWVtb3J5QmFja2VuZF07XG5cdH1cblxuXHQvKipcblx0ICogQ2VudHJhbGl6ZWQgaGFuZGxlciBmb3IgYmFja2VuZCBpdGVtIGNoYW5nZXMgKGxvY2FsIG11dGF0aW9ucyBhbmRcblx0ICogc2VydmVyLWRyaXZlbiB1cGRhdGVzKS4gTWFpbnRhaW5zIHJlY2VuY3kgb3JkZXJpbmcgYW5kIHJlLWJyb2FkY2FzdHMgdGhlXG5cdCAqIGdlbmVyaWMgZmVlZGJhY2sgLyBuYXZpZ2F0aW9uIGNoYW5nZSBldmVudHMuXG5cdCAqL1xuXHRwcml2YXRlIF9oYW5kbGVCYWNrZW5kQ2hhbmdlKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZmVlZGJhY2tJdGVtcyA9IHRoaXMuX2JhY2tlbmRGb3JTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkuZ2V0SXRlbXMoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoZmVlZGJhY2tJdGVtcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25VcGRhdGVkT3JkZXIuc2V0KGtleSwgKyt0aGlzLl9zZXNzaW9uVXBkYXRlZFNlcXVlbmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2Vzc2lvblVwZGF0ZWRPcmRlci5kZWxldGUoa2V5KTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VGZWVkYmFjay5maXJlKHsgc2Vzc2lvblJlc291cmNlLCBmZWVkYmFja0l0ZW1zIH0pO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTmF2aWdhdGlvbi5maXJlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKGlzRXF1YWwoc2Vzc2lvblJlc291cmNlLCBBR0VOVF9GRUVEQkFDS19ORVdfU0VTU0lPTl9SRVNPVVJDRSkpIHtcblx0XHRcdHRoaXMuX3JlYmluZE5ld1Nlc3Npb25Xb3Jrc3BhY2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90cmFja1Zpc2libGVFZGl0b3JSZXNvdXJjZXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGlmICghYWN0aXZlU2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcGFuZSBvZiB0aGlzLl9lZGl0b3JTZXJ2aWNlLnZpc2libGVFZGl0b3JQYW5lcykge1xuXHRcdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgZ2V0QWN0aXZlUmVzb3VyY2VDYW5kaWRhdGVzKHBhbmUuaW5wdXQpKSB7XG5cdFx0XHRcdHRoaXMuX2ZpbGVUb1Nlc3Npb24uc2V0KGNhbmRpZGF0ZSwgYWN0aXZlU2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0U2Vzc2lvbkZvckZpbGUocmVzb3VyY2VVcmk6IFVSSSk6IElTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl9maWxlVG9TZXNzaW9uLmdldChyZXNvdXJjZVVyaSkgPz8gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnJlc291cmNlO1xuXHRcdGlmICghc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFzZXNzaW9uIHx8IHNlc3Npb24uc3RhdHVzLmdldCgpID09PSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2lzRmlsZUluU2Vzc2lvblNjb3BlKHNlc3Npb24sIHJlc291cmNlVXJpKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHRnZXRGZWVkYmFja1Nlc3Npb25SZXNvdXJjZShyZXNvdXJjZVVyaTogVVJJKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBleHBsaWNpdFNjb3BlID0gdGhpcy5fZXhwbGljaXRSZXNvdXJjZVNjb3Blcy5nZXQocmVzb3VyY2VVcmkpO1xuXHRcdGlmIChleHBsaWNpdFNjb3BlKSB7XG5cdFx0XHRyZXR1cm4gZXhwbGljaXRTY29wZTtcblx0XHR9XG5cdFx0aWYgKHJlc291cmNlVXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5vdXRwdXRDaGFubmVsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoIWFjdGl2ZVNlc3Npb24gfHwgIWFjdGl2ZVNlc3Npb24uaXNDcmVhdGVkLmdldCgpKSB7XG5cdFx0XHQvLyBBIGRyYWZ0IHRoYXQgYWxyZWFkeSBoYXMgYSB3b3Jrc3BhY2Ugc2NvcGVzIGl0cyBjb21tZW50cyB0aGUgc2FtZVxuXHRcdFx0Ly8gd2F5IGEgY3JlYXRlZCBzZXNzaW9uIGRvZXM7IGEgZHJhZnQgd2l0aG91dCBvbmUgKG5vdGhpbmcgcGlja2VkXG5cdFx0XHQvLyB5ZXQpIGhhcyBub3RoaW5nIHRvIHNjb3BlIGFnYWluc3QsIHNvIGFsbG93IGFueSBmaWxlLlxuXHRcdFx0aWYgKGFjdGl2ZVNlc3Npb24gJiYgIXRoaXMuX2lzRmlsZUluU2Vzc2lvblNjb3BlKGFjdGl2ZVNlc3Npb24sIHJlc291cmNlVXJpKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIEFHRU5UX0ZFRURCQUNLX05FV19TRVNTSU9OX1JFU09VUkNFO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmdldFNlc3Npb25Gb3JGaWxlKHJlc291cmNlVXJpKT8ucmVzb3VyY2U7XG5cdH1cblxuXHRyZWdpc3RlckZlZWRiYWNrUmVzb3VyY2VTY29wZShyZXNvdXJjZVVyaTogVVJJLCBzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9leHBsaWNpdFJlc291cmNlU2NvcGVzLnNldChyZXNvdXJjZVVyaSwgc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUZlZWRiYWNrU2NvcGUuZmlyZSgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGlmIChpc0VxdWFsKHRoaXMuX2V4cGxpY2l0UmVzb3VyY2VTY29wZXMuZ2V0KHJlc291cmNlVXJpKSwgc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRcdHRoaXMuX2V4cGxpY2l0UmVzb3VyY2VTY29wZXMuZGVsZXRlKHJlc291cmNlVXJpKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUZlZWRiYWNrU2NvcGUuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgZ2l2ZW4gZmlsZSBiZWxvbmdzIHRvIHRoZSBzZXNzaW9uIGFuZCBpcyB0aGVyZWZvcmUgZWxpZ2libGVcblx0ICogZm9yIGFnZW50IGZlZWRiYWNrLiBUaGlzIGtlZXBzIHRoZSBmZWVkYmFjayBhZmZvcmRhbmNlcyBzY29wZWQgdG8gdGhlXG5cdCAqIHNlc3Npb24ncyBvd24gZmlsZXMgYW5kIGV4Y2x1ZGVzIGVkaXRvcnMgdGhhdCBtZXJlbHkgaGFwcGVuIHRvIGJlIG9wZW5cblx0ICogd2hpbGUgdGhlIHNlc3Npb24gaXMgYWN0aXZlIChlLmcuIHVzZXIgc2V0dGluZ3Mgb3BlbmVkIGZyb20gdGhlIHVzZXJcblx0ICogZGF0YSBkaXJlY3RvcnksIG9yIHRoZSBPdXRwdXQgdmlldyB3aGljaCBpcyBub3QgYmFja2VkIGJ5IGEgcmVhbCBmaWxlKS5cblx0ICovXG5cdHByaXZhdGUgX2lzRmlsZUluU2Vzc2lvblNjb3BlKHNlc3Npb246IElTZXNzaW9uLCByZXNvdXJjZVVyaTogVVJJKTogYm9vbGVhbiB7XG5cdFx0Ly8gVGhlIE91dHB1dCB2aWV3IHJlbmRlcnMgaW50byBhIGNvZGUgZWRpdG9yIGJ1dCBpcyBub3QgYSByZWFsIGZpbGUgdGhlXG5cdFx0Ly8gdXNlciBjYW4gZ2l2ZSBmZWVkYmFjayBvbiwgc28gYWx3YXlzIGV4Y2x1ZGUgaXQuXG5cdFx0aWYgKHJlc291cmNlVXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5vdXRwdXRDaGFubmVsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gRmlsZXMgdGhhdCBhcmUgcGFydCBvZiB0aGUgc2Vzc2lvbidzIGNoYW5nZXMgYXJlIGFsd2F5cyBpbiBzY29wZSxcblx0XHQvLyByZWdhcmRsZXNzIG9mIHdoZXJlIHRoZXkgbGl2ZSBvbiBkaXNrLlxuXHRcdGlmIChzZXNzaW9uLmNoYW5nZXMuZ2V0KCkuc29tZShjaGFuZ2UgPT4gY2hhbmdlTWF0Y2hlc1Jlc291cmNlKGNoYW5nZSwgcmVzb3VyY2VVcmkpKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIHRoZSBmaWxlIG11c3QgbGl2ZSB3aXRoaW4gb25lIG9mIHRoZSBzZXNzaW9uJ3Mgd29ya3NwYWNlXG5cdFx0Ly8gZm9sZGVycy4gV2hlbiB0aGUgc2Vzc2lvbiBoYXMgbm8gd29ya3NwYWNlIGluZm9ybWF0aW9uIHdlIGNhbm5vdCBtYWtlXG5cdFx0Ly8gdGhhdCBkZXRlcm1pbmF0aW9uLCBzbyBmYWxsIGJhY2sgdG8gYWxsb3dpbmcgdGhlIGZpbGUuXG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gc2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCk7XG5cdFx0aWYgKCF3b3Jrc3BhY2UpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gd29ya3NwYWNlLmZvbGRlcnMuc29tZShmb2xkZXIgPT5cblx0XHRcdGlzRXF1YWxPclBhcmVudChyZXNvdXJjZVVyaSwgZm9sZGVyLnJvb3QpIHx8IGlzRXF1YWxPclBhcmVudChyZXNvdXJjZVVyaSwgZm9sZGVyLndvcmtpbmdEaXJlY3RvcnkpKTtcblx0fVxuXG5cdGFkZEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZTogVVJJLCByZXNvdXJjZVVyaTogVVJJLCByYW5nZTogSVJhbmdlLCB0ZXh0OiBzdHJpbmcsIHN1Z2dlc3Rpb24/OiBJQ29kZVJldmlld1N1Z2dlc3Rpb24sIGNvbnRleHQ/OiBJQWdlbnRGZWVkYmFja0NvbnRleHQsIHNvdXJjZVBSUmV2aWV3Q29tbWVudElkPzogc3RyaW5nLCBraW5kOiBBZ2VudEZlZWRiYWNrS2luZCA9IEFnZW50RmVlZGJhY2tLaW5kLlVzZXJSZXZpZXcsIHN0YXRlOiBBZ2VudEZlZWRiYWNrU3RhdGUgPSBBZ2VudEZlZWRiYWNrU3RhdGUuQWNjZXB0ZWQpOiBJQWdlbnRGZWVkYmFjayB7XG5cdFx0Y29uc3QgYmFja2VuZCA9IHRoaXMuX2JhY2tlbmRGb3JTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHQvLyBBIHNvdXJjZVBSUmV2aWV3Q29tbWVudElkIGltcGxpZXMgdGhlIGZlZWRiYWNrIG9yaWdpbmF0ZWQgZnJvbSBhIFBSIHJldmlldy5cblx0XHRjb25zdCBlZmZlY3RpdmVLaW5kOiBBZ2VudEZlZWRiYWNrS2luZCA9IHNvdXJjZVBSUmV2aWV3Q29tbWVudElkID8gQWdlbnRGZWVkYmFja0tpbmQuUFJSZXZpZXcgOiBraW5kO1xuXG5cdFx0Y29uc3QgZmVlZGJhY2s6IElBZ2VudEZlZWRiYWNrID0ge1xuXHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0dGV4dCxcblx0XHRcdHJlc291cmNlVXJpLFxuXHRcdFx0cmFuZ2UsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRzdWdnZXN0aW9uLFxuXHRcdFx0Y29kZVNlbGVjdGlvbjogY29udGV4dD8uY29kZVNlbGVjdGlvbixcblx0XHRcdGRpZmZIdW5rczogY29udGV4dD8uZGlmZkh1bmtzLFxuXHRcdFx0a2luZDogZWZmZWN0aXZlS2luZCxcblx0XHRcdHNvdXJjZVBSUmV2aWV3Q29tbWVudElkLFxuXHRcdFx0c3RhdGUsXG5cdFx0fTtcblxuXHRcdC8vIENvbXB1dGUgZmlsZS1leGlzdGVuY2UgKGZvciB0ZWxlbWV0cnkpIGJlZm9yZSB0aGUgaXRlbSBpcyBzdG9yZWQuXG5cdFx0Y29uc3QgcmVzb3VyY2VTdHIgPSByZXNvdXJjZVVyaS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGhhc0V4aXN0aW5nRm9yRmlsZSA9IGJhY2tlbmQuZ2V0SXRlbXMoc2Vzc2lvblJlc291cmNlKS5zb21lKGYgPT4gZi5yZXNvdXJjZVVyaS50b1N0cmluZygpID09PSByZXNvdXJjZVN0cik7XG5cblx0XHRiYWNrZW5kLnVwc2VydChmZWVkYmFjayk7XG5cblx0XHQvLyBDcmVhdGVkIGl0ZW1zIGFyZSBhZGRlZCBieSBhIHN5c3RlbSBhbmQgYXJlIG5vdCB5ZXQgdXNlci1hY2NlcHRlZCwgc29cblx0XHQvLyB0aGV5IGRvIG5vdCBjb250cmlidXRlIGFkZC9jb252ZXJ0IHRlbGVtZXRyeSB1bnRpbCBhY2NlcHRhbmNlLlxuXHRcdGlmIChzdGF0ZSA9PT0gQWdlbnRGZWVkYmFja1N0YXRlLkFjY2VwdGVkKSB7XG5cdFx0XHRpZiAoZWZmZWN0aXZlS2luZCA9PT0gQWdlbnRGZWVkYmFja0tpbmQuVXNlclJldmlldykge1xuXHRcdFx0XHR0aGlzLl9vbkRpZEFkZEZlZWRiYWNrLmZpcmUoeyBzZXNzaW9uUmVzb3VyY2UsIGZlZWRiYWNrLCBoYXNFeGlzdGluZ0ZlZWRiYWNrRm9yRmlsZTogaGFzRXhpc3RpbmdGb3JGaWxlIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDb252ZXJ0RmVlZGJhY2suZmlyZSh7IHNlc3Npb25SZXNvdXJjZSwgZmVlZGJhY2ssIGtpbmQ6IGVmZmVjdGl2ZUtpbmQsIGhhc0V4aXN0aW5nRmVlZGJhY2tGb3JGaWxlOiBoYXNFeGlzdGluZ0ZvckZpbGUgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZlZWRiYWNrO1xuXHR9XG5cblx0YWNjZXB0RmVlZGJhY2soc2Vzc2lvblJlc291cmNlOiBVUkksIGZlZWRiYWNrSWQ6IHN0cmluZywgb3B0aW9ucz86IElBY2NlcHRGZWVkYmFja09wdGlvbnMpOiB2b2lkIHtcblx0XHRjb25zdCBiYWNrZW5kID0gdGhpcy5fYmFja2VuZEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBmZWVkYmFja0l0ZW1zID0gYmFja2VuZC5nZXRJdGVtcyhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gZmVlZGJhY2tJdGVtcy5maW5kKGYgPT4gZi5pZCA9PT0gZmVlZGJhY2tJZCk7XG5cdFx0aWYgKCFleGlzdGluZyB8fCBleGlzdGluZy5zdGF0ZSAhPT0gQWdlbnRGZWVkYmFja1N0YXRlLkNyZWF0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhY2NlcHRlZDogSUFnZW50RmVlZGJhY2sgPSB7XG5cdFx0XHQuLi5leGlzdGluZyxcblx0XHRcdHN0YXRlOiBBZ2VudEZlZWRiYWNrU3RhdGUuQWNjZXB0ZWQsXG5cdFx0XHQuLi4ob3B0aW9ucz8ucmV2ZWFsVG9BZ2VudCA/IHsgcGVuZGluZ0FnZW50UmV2ZWFsOiB0cnVlIH0gOiB7fSksXG5cdFx0fTtcblx0XHRiYWNrZW5kLnVwc2VydChhY2NlcHRlZCk7XG5cblx0XHRpZiAoYWNjZXB0ZWQua2luZCAhPT0gQWdlbnRGZWVkYmFja0tpbmQuVXNlclJldmlldykge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VTdHIgPSBhY2NlcHRlZC5yZXNvdXJjZVVyaS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgaGFzRXhpc3RpbmdGZWVkYmFja0ZvckZpbGUgPSBmZWVkYmFja0l0ZW1zLnNvbWUoZiA9PiBmLmlkICE9PSBhY2NlcHRlZC5pZCAmJiBmLnJlc291cmNlVXJpLnRvU3RyaW5nKCkgPT09IHJlc291cmNlU3RyKTtcblx0XHRcdHRoaXMuX29uRGlkQ29udmVydEZlZWRiYWNrLmZpcmUoeyBzZXNzaW9uUmVzb3VyY2UsIGZlZWRiYWNrOiBhY2NlcHRlZCwga2luZDogYWNjZXB0ZWQua2luZCwgaGFzRXhpc3RpbmdGZWVkYmFja0ZvckZpbGUgfSk7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlRmVlZGJhY2soc2Vzc2lvblJlc291cmNlOiBVUkksIGZlZWRiYWNrSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGlmICh0aGlzLl9uYXZpZ2F0aW9uQW5jaG9yQnlTZXNzaW9uLmdldChrZXkpID09PSBmZWVkYmFja0lkKSB7XG5cdFx0XHR0aGlzLl9uYXZpZ2F0aW9uQW5jaG9yQnlTZXNzaW9uLmRlbGV0ZShrZXkpO1xuXHRcdH1cblx0XHR0aGlzLl9iYWNrZW5kRm9yU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpLnJlbW92ZShzZXNzaW9uUmVzb3VyY2UsIGZlZWRiYWNrSWQpO1xuXHR9XG5cblx0dXBkYXRlRmVlZGJhY2soc2Vzc2lvblJlc291cmNlOiBVUkksIGZlZWRiYWNrSWQ6IHN0cmluZywgbmV3VGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgYmFja2VuZCA9IHRoaXMuX2JhY2tlbmRGb3JTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBiYWNrZW5kLmdldEl0ZW1zKHNlc3Npb25SZXNvdXJjZSkuZmluZChmID0+IGYuaWQgPT09IGZlZWRiYWNrSWQpO1xuXHRcdGlmICghZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YmFja2VuZC51cHNlcnQoeyAuLi5leGlzdGluZywgdGV4dDogbmV3VGV4dCB9KTtcblx0fVxuXG5cdHNldEZlZWRiYWNrUmVzb2x2ZWQoc2Vzc2lvblJlc291cmNlOiBVUkksIGZlZWRiYWNrSWQ6IHN0cmluZywgcmVzb2x2ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBiYWNrZW5kID0gdGhpcy5fYmFja2VuZEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHQvLyBVbi1yZXNvbHZpbmcgcmV0dXJucyB0aGUgaXRlbSB0byB0aGUgc3VibWl0dGVkIHN0YXRlLlxuXHRcdGNvbnN0IG5leHRTdGF0ZSA9IHJlc29sdmVkID8gQWdlbnRGZWVkYmFja1N0YXRlLlJlc29sdmVkIDogQWdlbnRGZWVkYmFja1N0YXRlLlN1Ym1pdHRlZDtcblx0XHRjb25zdCBleGlzdGluZyA9IGJhY2tlbmQuZ2V0SXRlbXMoc2Vzc2lvblJlc291cmNlKS5maW5kKGYgPT4gZi5pZCA9PT0gZmVlZGJhY2tJZCk7XG5cdFx0aWYgKGV4aXN0aW5nICYmIGV4aXN0aW5nLnN0YXRlICE9PSBuZXh0U3RhdGUpIHtcblx0XHRcdGJhY2tlbmQudXBzZXJ0KHsgLi4uZXhpc3RpbmcsIHN0YXRlOiBuZXh0U3RhdGUgfSk7XG5cdFx0fVxuXHR9XG5cblx0YWRkUmVwbHkoc2Vzc2lvblJlc291cmNlOiBVUkksIGZlZWRiYWNrSWQ6IHN0cmluZywgcmVwbHlUZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBiYWNrZW5kID0gdGhpcy5fYmFja2VuZEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBleGlzdGluZyA9IGJhY2tlbmQuZ2V0SXRlbXMoc2Vzc2lvblJlc291cmNlKS5maW5kKGYgPT4gZi5pZCA9PT0gZmVlZGJhY2tJZCk7XG5cdFx0aWYgKCFleGlzdGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld1JlcGxpZXMgPSBbLi4uKGV4aXN0aW5nLnJlcGxpZXMgPz8gW10pLCByZXBseVRleHRdO1xuXHRcdGNvbnN0IHVwZGF0ZWQ6IElBZ2VudEZlZWRiYWNrID0geyAuLi5leGlzdGluZywgcmVwbGllczogbmV3UmVwbGllcyB9O1xuXHRcdGJhY2tlbmQudXBzZXJ0KHVwZGF0ZWQpO1xuXHRcdHRoaXMuX29uRGlkQWRkUmVwbHkuZmlyZSh7IHNlc3Npb25SZXNvdXJjZSwgZmVlZGJhY2s6IHVwZGF0ZWQsIHJlcGx5Q291bnQ6IG5ld1JlcGxpZXMubGVuZ3RoIH0pO1xuXHR9XG5cblx0Z2V0RmVlZGJhY2soc2Vzc2lvblJlc291cmNlOiBVUkkpOiByZWFkb25seSBJQWdlbnRGZWVkYmFja1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fYmFja2VuZEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlKS5nZXRJdGVtcyhzZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0aGFzTG9hZGVkRmVlZGJhY2soc2Vzc2lvblJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYmFja2VuZEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlKS5oYXNMb2FkZWQoc2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdGdldE1vc3RSZWNlbnRTZXNzaW9uRm9yUmVzb3VyY2UocmVzb3VyY2VVcmk6IFVSSSk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IGJlc3RTZXNzaW9uOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGJlc3RTZXF1ZW5jZSA9IC0xO1xuXG5cdFx0Zm9yIChjb25zdCBiYWNrZW5kIG9mIHRoaXMuX2JhY2tlbmRzKCkpIHtcblx0XHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGJhY2tlbmQuZ2V0U2Vzc2lvbnNXaXRoSXRlbXMoKSkge1xuXHRcdFx0XHRjb25zdCBmZWVkYmFja0l0ZW1zID0gYmFja2VuZC5nZXRJdGVtcyhjYW5kaWRhdGUpO1xuXHRcdFx0XHRpZiAoIWZlZWRiYWNrSXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIXRoaXMuX3Nlc3Npb25Db250YWluc1Jlc291cmNlKGNhbmRpZGF0ZSwgcmVzb3VyY2VVcmksIGZlZWRiYWNrSXRlbXMpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzZXF1ZW5jZSA9IHRoaXMuX3Nlc3Npb25VcGRhdGVkT3JkZXIuZ2V0KGNhbmRpZGF0ZS50b1N0cmluZygpKSA/PyAwO1xuXHRcdFx0XHRpZiAoc2VxdWVuY2UgPiBiZXN0U2VxdWVuY2UpIHtcblx0XHRcdFx0XHRiZXN0U2Vzc2lvbiA9IGNhbmRpZGF0ZTtcblx0XHRcdFx0XHRiZXN0U2VxdWVuY2UgPSBzZXF1ZW5jZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBiZXN0U2Vzc2lvbjtcblx0fVxuXG5cdHByaXZhdGUgX3Nlc3Npb25Db250YWluc1Jlc291cmNlKHNlc3Npb25SZXNvdXJjZTogVVJJLCByZXNvdXJjZVVyaTogVVJJLCBmZWVkYmFja0l0ZW1zOiByZWFkb25seSBJQWdlbnRGZWVkYmFja1tdKTogYm9vbGVhbiB7XG5cdFx0aWYgKGZlZWRiYWNrSXRlbXMuc29tZShpdGVtID0+IGlzRXF1YWwoaXRlbS5yZXNvdXJjZVVyaSwgcmVzb3VyY2VVcmkpKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBlZGl0aW5nU2Vzc2lvbiBvZiB0aGlzLl9jaGF0RWRpdGluZ1NlcnZpY2UuZWRpdGluZ1Nlc3Npb25zT2JzLmdldCgpKSB7XG5cdFx0XHRpZiAoIWlzRXF1YWwoZWRpdGluZ1Nlc3Npb24uY2hhdFNlc3Npb25SZXNvdXJjZSwgc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVkaXRpbmdFbnRyaWVzQ29udGFpblJlc291cmNlKGVkaXRpbmdTZXNzaW9uLmVudHJpZXMuZ2V0KCksIHJlc291cmNlVXJpKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhbmdlcyA9IHNlc3Npb24uY2hhbmdlcy5nZXQoKTtcblx0XHRpZiAoY2hhbmdlcy5zb21lKGNoYW5nZSA9PiBjaGFuZ2VNYXRjaGVzUmVzb3VyY2UoY2hhbmdlLCByZXNvdXJjZVVyaSkpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRhc3luYyByZXZlYWxGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgZmVlZGJhY2tJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZmVlZGJhY2sgPSB0aGlzLmdldEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZSkuZmluZChmID0+IGYuaWQgPT09IGZlZWRiYWNrSWQpO1xuXHRcdGlmICghZmVlZGJhY2spIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQW5jaG9yIHVzaW5nIHRoZSBzZXNzaW9uLWVkaXRvci1jb21tZW50IGlkIChub3QgdGhlIHJhdyBmZWVkYmFjayBpZCkgc28gdGhlIGVkaXRvciB3aWRnZXQgY29udHJpYnV0aW9uIG1hdGNoZXMgdGhlIGFjdGl2ZSBpdGVtIGFuZCBleHBhbmRzIGl0cyB3aWRnZXQuXG5cdFx0YXdhaXQgdGhpcy5yZXZlYWxTZXNzaW9uQ29tbWVudChzZXNzaW9uUmVzb3VyY2UsIHRvU2Vzc2lvbkVkaXRvckNvbW1lbnRJZChTZXNzaW9uRWRpdG9yQ29tbWVudFNvdXJjZS5BZ2VudEZlZWRiYWNrLCBmZWVkYmFja0lkKSwgZmVlZGJhY2sucmVzb3VyY2VVcmksIGZlZWRiYWNrLnJhbmdlKTtcblx0fVxuXG5cdGFzeW5jIHJldmVhbFNlc3Npb25Db21tZW50KHNlc3Npb25SZXNvdXJjZTogVVJJLCBjb21tZW50SWQ6IHN0cmluZywgcmVzb3VyY2VVcmk6IFVSSSwgcmFuZ2U6IElSYW5nZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHsgc3RhcnRMaW5lTnVtYmVyOiByYW5nZS5zdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uOiByYW5nZS5zdGFydENvbHVtbiB9O1xuXHRcdGNvbnN0IHNlc3Npb25EYXRhID0gdGhpcy5fc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNoYW5nZSA9IHRoaXMuX2dldFNlc3Npb25DaGFuZ2UocmVzb3VyY2VVcmksIHNlc3Npb25EYXRhPy5jaGFuZ2VzLmdldCgpKTtcblxuXHRcdGlmIChzZXNzaW9uQ2hhbmdlPy5pc0RlbGV0aW9uICYmIHNlc3Npb25DaGFuZ2Uub3JpZ2luYWxVcmkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uQ2hhbmdlLm9yaWdpbmFsVXJpLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0bW9kYWw6IHt9LFxuXHRcdFx0XHRcdHByZXNlcnZlRm9jdXM6IGZhbHNlLFxuXHRcdFx0XHRcdHJldmVhbElmVmlzaWJsZTogdHJ1ZSxcblx0XHRcdFx0XHRzZWxlY3Rpb24sXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBpZiAoc2Vzc2lvbkNoYW5nZT8ub3JpZ2luYWxVcmkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBzZXNzaW9uQ2hhbmdlLm9yaWdpbmFsVXJpIH0sXG5cdFx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBzZXNzaW9uQ2hhbmdlLm1vZGlmaWVkVXJpIH0sXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRtb2RhbDoge30sXG5cdFx0XHRcdFx0cHJlc2VydmVGb2N1czogZmFsc2UsXG5cdFx0XHRcdFx0cmV2ZWFsSWZWaXNpYmxlOiB0cnVlLFxuXHRcdFx0XHRcdHNlbGVjdGlvbixcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uQ2hhbmdlPy5tb2RpZmllZFVyaSA/PyByZXNvdXJjZVVyaSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdG1vZGFsOiB7fSxcblx0XHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiBmYWxzZSxcblx0XHRcdFx0XHRyZXZlYWxJZlZpc2libGU6IHRydWUsXG5cdFx0XHRcdFx0c2VsZWN0aW9uLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLnNldE5hdmlnYXRpb25BbmNob3Ioc2Vzc2lvblJlc291cmNlLCBjb21tZW50SWQpO1xuXHRcdHRoaXMuX29uRGlkUmV2ZWFsU2Vzc2lvbkNvbW1lbnQuZmlyZSh7IHNlc3Npb25SZXNvdXJjZSwgY29tbWVudElkLCByZXNvdXJjZVVyaSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNlc3Npb25DaGFuZ2UocmVzb3VyY2VVcmk6IFVSSSwgY2hhbmdlczogcmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW10gfCB1bmRlZmluZWQpOiB7IG9yaWdpbmFsVXJpPzogVVJJOyBtb2RpZmllZFVyaTogVVJJOyBpc0RlbGV0aW9uOiBib29sZWFuIH0gfCB1bmRlZmluZWQge1xuXHRcdGlmICghKGNoYW5nZXMgaW5zdGFuY2VvZiBBcnJheSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWF0Y2hpbmdDaGFuZ2UgPSBjaGFuZ2VzLmZpbmQoY2hhbmdlID0+IGNoYW5nZU1hdGNoZXNSZXNvdXJjZShjaGFuZ2UsIHJlc291cmNlVXJpKSk7XG5cdFx0aWYgKCFtYXRjaGluZ0NoYW5nZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoaXNJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMihtYXRjaGluZ0NoYW5nZSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG9yaWdpbmFsVXJpOiBtYXRjaGluZ0NoYW5nZS5vcmlnaW5hbFVyaSxcblx0XHRcdFx0bW9kaWZpZWRVcmk6IG1hdGNoaW5nQ2hhbmdlLm1vZGlmaWVkVXJpID8/IG1hdGNoaW5nQ2hhbmdlLnVyaSxcblx0XHRcdFx0aXNEZWxldGlvbjogbWF0Y2hpbmdDaGFuZ2UubW9kaWZpZWRVcmkgPT09IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG9yaWdpbmFsVXJpOiBtYXRjaGluZ0NoYW5nZS5vcmlnaW5hbFVyaSxcblx0XHRcdG1vZGlmaWVkVXJpOiBtYXRjaGluZ0NoYW5nZS5tb2RpZmllZFVyaSxcblx0XHRcdGlzRGVsZXRpb246IGZhbHNlLFxuXHRcdH07XG5cdH1cblxuXHRnZXROZXh0RmVlZGJhY2soc2Vzc2lvblJlc291cmNlOiBVUkksIG5leHQ6IGJvb2xlYW4pOiBJQWdlbnRGZWVkYmFjayB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0TmV4dE5hdmlnYWJsZUl0ZW0oc2Vzc2lvblJlc291cmNlLCB0aGlzLmdldEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZSksIG5leHQpO1xuXHR9XG5cblx0Z2V0TmV4dE5hdmlnYWJsZUl0ZW08VCBleHRlbmRzIElOYXZpZ2FibGVTZXNzaW9uQ29tbWVudD4oc2Vzc2lvblJlc291cmNlOiBVUkksIGl0ZW1zOiByZWFkb25seSBUW10sIG5leHQ6IGJvb2xlYW4pOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBrZXkgPSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRpZiAoIWl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fbmF2aWdhdGlvbkFuY2hvckJ5U2Vzc2lvbi5kZWxldGUoa2V5KTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYW5jaG9ySWQgPSB0aGlzLl9uYXZpZ2F0aW9uQW5jaG9yQnlTZXNzaW9uLmdldChrZXkpO1xuXHRcdGxldCBhbmNob3JJbmRleCA9IGFuY2hvcklkID8gaXRlbXMuZmluZEluZGV4KGl0ZW0gPT4gaXRlbS5pZCA9PT0gYW5jaG9ySWQpIDogLTE7XG5cblx0XHRpZiAoYW5jaG9ySW5kZXggPCAwICYmICFuZXh0KSB7XG5cdFx0XHRhbmNob3JJbmRleCA9IDA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV4dEluZGV4ID0gbmV4dFxuXHRcdFx0PyAoYW5jaG9ySW5kZXggKyAxKSAlIGl0ZW1zLmxlbmd0aFxuXHRcdFx0OiAoYW5jaG9ySW5kZXggLSAxICsgaXRlbXMubGVuZ3RoKSAlIGl0ZW1zLmxlbmd0aDtcblxuXHRcdGNvbnN0IGl0ZW0gPSBpdGVtc1tuZXh0SW5kZXhdO1xuXHRcdHRoaXMuc2V0TmF2aWdhdGlvbkFuY2hvcihzZXNzaW9uUmVzb3VyY2UsIGl0ZW0uaWQpO1xuXHRcdHJldHVybiBpdGVtO1xuXHR9XG5cblx0c2V0TmF2aWdhdGlvbkFuY2hvcihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgaXRlbUlkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRpZiAoaXRlbUlkKSB7XG5cdFx0XHR0aGlzLl9uYXZpZ2F0aW9uQW5jaG9yQnlTZXNzaW9uLnNldChrZXksIGl0ZW1JZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX25hdmlnYXRpb25BbmNob3JCeVNlc3Npb24uZGVsZXRlKGtleSk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTmF2aWdhdGlvbi5maXJlKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRnZXROYXZpZ2F0aW9uQmVhcmluZyhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgaXRlbXM6IHJlYWRvbmx5IElOYXZpZ2FibGVTZXNzaW9uQ29tbWVudFtdID0gdGhpcy5nZXRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2UpKTogSUFnZW50RmVlZGJhY2tOYXZpZ2F0aW9uQmVhcmluZyB7XG5cdFx0Y29uc3Qga2V5ID0gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgYW5jaG9ySWQgPSB0aGlzLl9uYXZpZ2F0aW9uQW5jaG9yQnlTZXNzaW9uLmdldChrZXkpO1xuXHRcdGNvbnN0IGFjdGl2ZUlkeCA9IGFuY2hvcklkID8gaXRlbXMuZmluZEluZGV4KGl0ZW0gPT4gaXRlbS5pZCA9PT0gYW5jaG9ySWQpIDogLTE7XG5cdFx0cmV0dXJuIHsgYWN0aXZlSWR4LCB0b3RhbENvdW50OiBpdGVtcy5sZW5ndGggfTtcblx0fVxuXG5cdGNsZWFyRmVlZGJhY2soc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHR0aGlzLl9zZXNzaW9uVXBkYXRlZE9yZGVyLmRlbGV0ZShrZXkpO1xuXHRcdHRoaXMuX25hdmlnYXRpb25BbmNob3JCeVNlc3Npb24uZGVsZXRlKGtleSk7XG5cdFx0dGhpcy5fYmFja2VuZEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlKS5jbGVhcihzZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0YXN5bmMgYWRkRmVlZGJhY2tBbmRTdWJtaXQoc2Vzc2lvblJlc291cmNlOiBVUkksIHJlc291cmNlVXJpOiBVUkksIHJhbmdlOiBJUmFuZ2UsIHRleHQ6IHN0cmluZywgc3VnZ2VzdGlvbj86IElDb2RlUmV2aWV3U3VnZ2VzdGlvbiwgY29udGV4dD86IElBZ2VudEZlZWRiYWNrQ29udGV4dCwgc291cmNlUFJSZXZpZXdDb21tZW50SWQ/OiBzdHJpbmcsIGtpbmQ/OiBBZ2VudEZlZWRiYWNrS2luZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuYWRkRmVlZGJhY2soc2Vzc2lvblJlc291cmNlLCByZXNvdXJjZVVyaSwgcmFuZ2UsIHRleHQsIHN1Z2dlc3Rpb24sIGNvbnRleHQsIHNvdXJjZVBSUmV2aWV3Q29tbWVudElkLCBraW5kKTtcblx0XHRpZiAoaXNFcXVhbChzZXNzaW9uUmVzb3VyY2UsIEFHRU5UX0ZFRURCQUNLX05FV19TRVNTSU9OX1JFU09VUkNFKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5zdWJtaXRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5faXNBZ2VudEhvc3RTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdC8vIFdhaXQgZm9yIHRoZSBhdHRhY2htZW50IGNvbnRyaWJ1dGlvbiB0byB1cGRhdGUgdGhlIGNoYXQgd2lkZ2V0J3MgYXR0YWNobWVudCBtb2RlbFxuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gYXdhaXQgd2hlbldpZGdldEZvclNlc3Npb24odGhpcy5fY2hhdFdpZGdldFNlcnZpY2UsIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAod2lkZ2V0KSB7XG5cdFx0XHRcdGNvbnN0IGF0dGFjaG1lbnRJZCA9IEFUVEFDSE1FTlRfSURfUFJFRklYICsgc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGNvbnN0IGhhc0F0dGFjaG1lbnQgPSAoKSA9PiB3aWRnZXQuYXR0YWNobWVudE1vZGVsLmF0dGFjaG1lbnRzLnNvbWUoYSA9PiBhLmlkID09PSBhdHRhY2htZW50SWQpO1xuXG5cdFx0XHRcdGlmICghaGFzQXR0YWNobWVudCgpKSB7XG5cdFx0XHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKFxuXHRcdFx0XHRcdFx0RXZlbnQuZmlsdGVyKHdpZGdldC5hdHRhY2htZW50TW9kZWwub25EaWRDaGFuZ2UsICgpID0+IGhhc0F0dGFjaG1lbnQoKSlcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdbQWdlbnRGZWVkYmFja10gYWRkRmVlZGJhY2tBbmRTdWJtaXQ6IG5vIGNoYXQgd2lkZ2V0IGZvdW5kIGZvciBzZXNzaW9uLCBmZWVkYmFjayBtYXkgbm90IGJlIHN1Ym1pdHRlZCBjb3JyZWN0bHknLCBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5zdWJtaXRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNBZ2VudEhvc3RTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHJldHVybiBzZXNzaW9uID8gaXNBZ2VudEhvc3RQcm92aWRlcklkKHNlc3Npb24ucHJvdmlkZXJJZCkgOiBmYWxzZTtcblx0fVxuXG5cdGFzeW5jIHN1Ym1pdEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKGlzRXF1YWwoc2Vzc2lvblJlc291cmNlLCBBR0VOVF9GRUVEQkFDS19ORVdfU0VTU0lPTl9SRVNPVVJDRSkpIHtcblx0XHRcdGlmICghdGhpcy5nZXRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2UpLnNvbWUoaXRlbSA9PiBpdGVtLnN0YXRlID09PSBBZ2VudEZlZWRiYWNrU3RhdGUuQWNjZXB0ZWQpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl9zZXNzaW9uc1NlcnZpY2Uuc3VibWl0TmV3U2Vzc2lvbklucHV0KCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYXdhaXQgd2hlbldpZGdldEZvclNlc3Npb24odGhpcy5fY2hhdFdpZGdldFNlcnZpY2UsIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tBZ2VudEZlZWRiYWNrXSBzdWJtaXRGZWVkYmFjazogbm8gY2hhdCB3aWRnZXQgZm91bmQgZm9yIHNlc3Npb24nLCBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gQWdlbnQtaG9zdCBzZXNzaW9ucyBkb24ndCBrZWVwIGEgcmVhY3RpdmUgZmVlZGJhY2sgYXR0YWNobWVudCBpbiB0aGVcblx0XHQvLyBjaGF0IGlucHV0ICh0aGVpciBmZWVkYmFjayBsaXZlcyBpbiB0aGUgYW5ub3RhdGlvbnMgYmFja2VuZCBhbmQgaXNcblx0XHQvLyBzdWJtaXR0ZWQgdmlhIHRoZSBcIlN1Ym1pdCBGZWVkYmFja1wiIGJ1dHRvbikuIEF0dGFjaCB0aGUgYWNjZXB0ZWRcblx0XHQvLyBpdGVtcyBcdTIwMTQgd2hpY2ggYXJlIGFib3V0IHRvIGJlY29tZSBzdWJtaXR0ZWQgXHUyMDE0IHRvIHRoaXMgc2luZ2xlIHJlcXVlc3Rcblx0XHQvLyBzbyB0aGUgYWdlbnQgcmVjZWl2ZXMgdGhlIGNvbW1lbnRzLCB0aGVuIHJlbW92ZSB0aGUgdHJhbnNpZW50XG5cdFx0Ly8gYXR0YWNobWVudCBhZ2FpbiBvbmNlIHRoZSByZXF1ZXN0IGhhcyBiZWVuIGFjY2VwdGVkLlxuXHRcdGlmICh0aGlzLl9pc0FnZW50SG9zdFNlc3Npb24oc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0Y29uc3QgYWNjZXB0ZWRJdGVtcyA9IHRoaXMuZ2V0RmVlZGJhY2soc2Vzc2lvblJlc291cmNlKS5maWx0ZXIoaXRlbSA9PiBpdGVtLnN0YXRlID09PSBBZ2VudEZlZWRiYWNrU3RhdGUuQWNjZXB0ZWQpO1xuXHRcdFx0Y29uc3QgYXR0YWNobWVudElkID0gQVRUQUNITUVOVF9JRF9QUkVGSVggKyBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdGlmIChhY2NlcHRlZEl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBhbm5vdGF0aW9uc1Jlc291cmNlID0gdGhpcy5fZ2V0QW5ub3RhdGlvbnNCYWNrZW5kKCkuZ2V0QW5ub3RhdGlvbnNDaGFubmVsUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5kZWxldGUoYXR0YWNobWVudElkKTtcblx0XHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KGNyZWF0ZUFnZW50RmVlZGJhY2tWYXJpYWJsZUVudHJ5KHNlc3Npb25SZXNvdXJjZSwgYWNjZXB0ZWRJdGVtcywgYW5ub3RhdGlvbnNSZXNvdXJjZSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5fc2VuZEFjdE9uRmVlZGJhY2tSZXF1ZXN0KHdpZGdldCwgc2Vzc2lvblJlc291cmNlLCAoKSA9PiB3aWRnZXQuYXR0YWNobWVudE1vZGVsLmRlbGV0ZShhdHRhY2htZW50SWQpKTtcblx0XHR9XG5cblx0XHQvLyBGb3Igbm9uLWFnZW50LWhvc3Qgc2Vzc2lvbnMgdGhlIHJlYWN0aXZlIGF0dGFjaG1lbnQgY29udHJpYnV0aW9uIGFsc29cblx0XHQvLyBtYXJrcyBzdWJtaXNzaW9uIG9uIHNlbmQ7IG1hcmtpbmcgZnJvbSB0aGUgaGVscGVyIGlzIGlkZW1wb3RlbnQgYW5kXG5cdFx0Ly8gY292ZXJzIHNlc3Npb25zIHdpdGhvdXQgdGhhdCBjb250cmlidXRpb24uXG5cdFx0cmV0dXJuIHRoaXMuX3NlbmRBY3RPbkZlZWRiYWNrUmVxdWVzdCh3aWRnZXQsIHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHQvKipcblx0ICogU2VuZHMgdGhlIGAvYWN0LW9uLWZlZWRiYWNrYCByZXF1ZXN0IGFuZCBtYXJrcyB0aGUgYWNjZXB0ZWQgZmVlZGJhY2sgYXNcblx0ICogc3VibWl0dGVkIGFzIHNvb24gYXMgdGhlIHJlcXVlc3QgaGFzIGJlZW4gYWNjZXB0ZWQgYnkgdGhlIGNoYXQgd2lkZ2V0LlxuXHQgKiBUaGUgcmVxdWVzdCBpcyBxdWV1ZWQgd2hlbiB0aGUgYWdlbnQgaXMgc3RpbGwgd29ya2luZyBvbiBhbm90aGVyIHJlcXVlc3QsXG5cdCAqIGluIHdoaWNoIGNhc2UgYXdhaXRpbmcge0BsaW5rIElDaGF0V2lkZ2V0LmFjY2VwdElucHV0fSB3b3VsZCBvbmx5IHJlc29sdmVcblx0ICogb25jZSB0aGF0IHF1ZXVlZCByZXF1ZXN0IGV2ZW50dWFsbHkgcnVucyBcdTIwMTQgdGhlIGZlZWRiYWNrIGl0ZW1zIG11c3QgbW92ZSB0b1xuXHQgKiB0aGUgc3VibWl0dGVkIHN0YXRlIHJpZ2h0IGF3YXkuXG5cdCAqL1xuXHRwcml2YXRlIF9zZW5kQWN0T25GZWVkYmFja1JlcXVlc3Qod2lkZ2V0OiBJQ2hhdFdpZGdldCwgc2Vzc2lvblJlc291cmNlOiBVUkksIGNsZWFudXA/OiAoKSA9PiB2b2lkKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3Qgc3VibWl0dGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTxib29sZWFuPigpO1xuXHRcdGNvbnN0IGNsZWFudXBPbmNlID0gY2xlYW51cCAmJiBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24oY2xlYW51cCk7XG5cblx0XHR3aWRnZXQuYWNjZXB0SW5wdXQoJy9hY3Qtb24tZmVlZGJhY2snLCB7XG5cdFx0XHRvblJlcXVlc3RBY2NlcHRlZDogKCkgPT4ge1xuXHRcdFx0XHRjbGVhbnVwT25jZT8uKCk7XG5cdFx0XHRcdHRoaXMubWFya0ZlZWRiYWNrU3VibWl0dGVkKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdHN1Ym1pdHRlZC5jb21wbGV0ZSh0cnVlKTtcblx0XHRcdH1cblx0XHR9KS50aGVuKCgpID0+IHtcblx0XHRcdGNsZWFudXBPbmNlPy4oKTtcblx0XHRcdHN1Ym1pdHRlZC5jb21wbGV0ZShmYWxzZSk7XG5cdFx0fSwgZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tBZ2VudEZlZWRiYWNrXSBGYWlsZWQgdG8gc3VibWl0IGZlZWRiYWNrJywgZXJyKTtcblx0XHRcdGNsZWFudXBPbmNlPy4oKTtcblx0XHRcdHN1Ym1pdHRlZC5jb21wbGV0ZShmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gc3VibWl0dGVkLnA7XG5cdH1cblxuXHRtYXJrRmVlZGJhY2tTdWJtaXR0ZWQoc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBiYWNrZW5kID0gdGhpcy5fYmFja2VuZEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBmZWVkYmFja0l0ZW1zID0gYmFja2VuZC5nZXRJdGVtcyhzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0Ly8gQWdlbnQtaG9zdCBzZXNzaW9ucyBoYW5kIHRoZSBmZWVkYmFjayB0byBhbiBhZ2VudCB0aGF0IHJlc29sdmVzIGVhY2hcblx0XHQvLyBjb21tZW50ICh2aWEgdGhlIHJlc29sdmVDb21tZW50cyB0b29sKSBvbmNlIGl0IGhhcyBhY3RlZCBvbiBpdCwgc28gdGhlXG5cdFx0Ly8gaXRlbXMgc3RheSB2aXNpYmxlIGluIHRoZSBzdWJtaXR0ZWQgc3RhdGUgdW50aWwgdGhlbi4gT3RoZXIgcHJvdmlkZXJzXG5cdFx0Ly8gaGF2ZSBubyBzdWNoIGFnZW50IGxvb3AsIHNvIHN1Ym1pdHRpbmcgcmVzb2x2ZXMgdGhlIGNvbW1lbnRzIGRpcmVjdGx5XG5cdFx0Ly8gdG8gaGlkZSB0aGVtIGZyb20gdGhlIFVJLlxuXHRcdGNvbnN0IHN1Ym1pdHRlZFN0YXRlID0gdGhpcy5faXNBZ2VudEhvc3RTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSlcblx0XHRcdD8gQWdlbnRGZWVkYmFja1N0YXRlLlN1Ym1pdHRlZFxuXHRcdFx0OiBBZ2VudEZlZWRiYWNrU3RhdGUuUmVzb2x2ZWQ7XG5cblx0XHRsZXQgdXNlckNvdW50ID0gMDtcblx0XHRsZXQgY29kZVJldmlld0NvdW50ID0gMDtcblx0XHRsZXQgcHJSZXZpZXdDb3VudCA9IDA7XG5cdFx0bGV0IHJlcGx5Q291bnQgPSAwO1xuXHRcdGNvbnN0IHN1Ym1pdHRlZDogSUFnZW50RmVlZGJhY2tbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBmZWVkYmFja0l0ZW1zKSB7XG5cdFx0XHRpZiAoaXRlbS5zdGF0ZSAhPT0gQWdlbnRGZWVkYmFja1N0YXRlLkFjY2VwdGVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0c3dpdGNoIChpdGVtLmtpbmQpIHtcblx0XHRcdFx0Y2FzZSBBZ2VudEZlZWRiYWNrS2luZC5Vc2VyUmV2aWV3OiB1c2VyQ291bnQrKzsgYnJlYWs7XG5cdFx0XHRcdGNhc2UgQWdlbnRGZWVkYmFja0tpbmQuQWdlbnRSZXZpZXc6IGNvZGVSZXZpZXdDb3VudCsrOyBicmVhaztcblx0XHRcdFx0Y2FzZSBBZ2VudEZlZWRiYWNrS2luZC5QUlJldmlldzogcHJSZXZpZXdDb3VudCsrOyBicmVhaztcblx0XHRcdH1cblx0XHRcdHJlcGx5Q291bnQgKz0gaXRlbS5yZXBsaWVzPy5sZW5ndGggPz8gMDtcblx0XHRcdHN1Ym1pdHRlZC5wdXNoKHsgLi4uaXRlbSwgc3RhdGU6IHN1Ym1pdHRlZFN0YXRlIH0pO1xuXHRcdH1cblxuXHRcdGlmICghc3VibWl0dGVkLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBzdWJtaXR0ZWQpIHtcblx0XHRcdGJhY2tlbmQudXBzZXJ0KGl0ZW0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkU3VibWl0RmVlZGJhY2suZmlyZSh7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHR0b3RhbENvdW50OiB1c2VyQ291bnQgKyBjb2RlUmV2aWV3Q291bnQgKyBwclJldmlld0NvdW50LFxuXHRcdFx0dXNlckNvdW50LFxuXHRcdFx0Y29kZVJldmlld0NvdW50LFxuXHRcdFx0cHJSZXZpZXdDb3VudCxcblx0XHRcdHJlcGx5Q291bnQsXG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxpQkFBaUIsbUJBQW1CO0FBQzdDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsWUFBWSx1QkFBb0M7QUFDekQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxTQUFzQixtQkFBbUI7QUFDbEQsU0FBUyxXQUFXO0FBRXBCLFNBQVMsaUJBQWlCLDZCQUE2QjtBQUN2RCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFNBQVMsdUJBQXVCO0FBQ3pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHVCQUF1QixtQ0FBMEQ7QUFDMUYsU0FBUyxzQkFBc0I7QUFDL0IsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsbUJBQW1CO0FBRTVCLFNBQTBELHFCQUFxQjtBQUMvRSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNDQUFrRSx5Q0FBeUM7QUFDcEgsU0FBUyxzQkFBc0Isd0NBQXdDO0FBQ3ZFLFNBQVMsbUJBQW1CLDBCQUErQztBQUMzRSxTQUFTLDRCQUE0QixnQ0FBZ0M7QUFZOUQsTUFBTSxzQ0FBc0MsSUFBSSxLQUFLLEVBQUUsUUFBUSxrQkFBa0IsTUFBTSxlQUFlLENBQUM7QUFNOUcs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
