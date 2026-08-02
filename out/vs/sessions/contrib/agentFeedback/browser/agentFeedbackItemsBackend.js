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
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ActionType } from "../../../../platform/agentHost/common/state/protocol/common/actions.js";
import { StateComponents } from "../../../../platform/agentHost/common/state/sessionState.js";
import { FEEDBACK_ANNOTATION_META_KEY, readFeedbackAnnotationMeta } from "../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js";
import { isAgentHostProviderId } from "../../../common/agentHostSessionsProvider.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { ISessionsProvidersService } from "../../../services/sessions/browser/sessionsProvidersService.js";
import { AgentFeedbackKind, AgentFeedbackState } from "./agentFeedbackModel.js";
function orderFeedbackItems(items) {
  const fileOrder = /* @__PURE__ */ new Map();
  for (const item of items) {
    const key = item.resourceUri.toString();
    if (!fileOrder.has(key)) {
      fileOrder.set(key, fileOrder.size);
    }
  }
  return items.slice().sort((a, b) => {
    const fa = fileOrder.get(a.resourceUri.toString());
    const fb = fileOrder.get(b.resourceUri.toString());
    if (fa !== fb) {
      return fa - fb;
    }
    return a.range.startLineNumber - b.range.startLineNumber;
  });
}
class InMemoryAgentFeedbackItemsBackend extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidChangeItems = this._register(new Emitter());
    this.onDidChangeItems = this._onDidChangeItems.event;
    /** sessionResource → feedback items (insertion order; display order applied on read) */
    this._bySession = /* @__PURE__ */ new Map();
    this._sessionResourceByKey = /* @__PURE__ */ new Map();
  }
  getItems(sessionResource) {
    return orderFeedbackItems(this._bySession.get(sessionResource.toString()) ?? []);
  }
  hasLoaded(_sessionResource) {
    return true;
  }
  upsert(feedback) {
    const key = feedback.sessionResource.toString();
    let items = this._bySession.get(key);
    if (!items) {
      items = [];
      this._bySession.set(key, items);
      this._sessionResourceByKey.set(key, feedback.sessionResource);
    }
    const idx = items.findIndex((f) => f.id === feedback.id);
    if (idx >= 0) {
      items[idx] = feedback;
    } else {
      items.push(feedback);
    }
    this._onDidChangeItems.fire(feedback.sessionResource);
  }
  remove(sessionResource, feedbackId) {
    const key = sessionResource.toString();
    const items = this._bySession.get(key);
    if (!items) {
      return;
    }
    const idx = items.findIndex((f) => f.id === feedbackId);
    if (idx < 0) {
      return;
    }
    items.splice(idx, 1);
    if (!items.length) {
      this._bySession.delete(key);
      this._sessionResourceByKey.delete(key);
    }
    this._onDidChangeItems.fire(sessionResource);
  }
  clear(sessionResource) {
    const key = sessionResource.toString();
    if (this._bySession.delete(key)) {
      this._sessionResourceByKey.delete(key);
      this._onDidChangeItems.fire(sessionResource);
    }
  }
  getSessionsWithItems() {
    return [...this._sessionResourceByKey.values()];
  }
}
const KIND_FROM_VALUE = {
  user: AgentFeedbackKind.UserReview,
  codeReview: AgentFeedbackKind.AgentReview,
  prReview: AgentFeedbackKind.PRReview
};
const STATE_FROM_VALUE = {
  created: AgentFeedbackState.Created,
  accepted: AgentFeedbackState.Accepted,
  submitted: AgentFeedbackState.Submitted,
  resolved: AgentFeedbackState.Resolved
};
function asCodeReviewSuggestion(suggestion) {
  if (suggestion && typeof suggestion === "object" && Array.isArray(suggestion.edits)) {
    return suggestion;
  }
  return void 0;
}
function readFeedbackMeta(annotation) {
  const base = readFeedbackAnnotationMeta(annotation);
  if (!base) {
    return void 0;
  }
  return {
    kind: KIND_FROM_VALUE[base.kind],
    state: STATE_FROM_VALUE[base.state],
    sessionResource: base.sessionResource,
    suggestion: asCodeReviewSuggestion(base.suggestion),
    codeSelection: base.codeSelection,
    diffHunks: base.diffHunks,
    sourcePRReviewCommentId: base.sourcePRReviewCommentId,
    pendingAgentReveal: base.pendingAgentReveal
  };
}
function toTextRange(range) {
  return {
    start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
    end: { line: range.endLineNumber - 1, character: range.endColumn - 1 }
  };
}
function fromTextRange(range) {
  if (!range) {
    return { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
  }
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1
  };
}
function entryText(text) {
  return typeof text === "string" ? text : text.markdown;
}
function feedbackToAnnotation(feedback) {
  const entries = [{ id: `${feedback.id}:0`, text: feedback.text }];
  for (let i = 0; i < (feedback.replies?.length ?? 0); i++) {
    entries.push({ id: `${feedback.id}:r${i}`, text: feedback.replies[i] });
  }
  const meta = {
    kind: feedback.kind,
    state: feedback.state,
    sessionResource: feedback.sessionResource.toString(),
    suggestion: feedback.suggestion,
    codeSelection: feedback.codeSelection,
    diffHunks: feedback.diffHunks,
    sourcePRReviewCommentId: feedback.sourcePRReviewCommentId,
    pendingAgentReveal: feedback.pendingAgentReveal
  };
  return {
    id: feedback.id,
    turnId: "",
    resource: feedback.resourceUri.toString(),
    range: toTextRange(feedback.range),
    resolved: feedback.state === AgentFeedbackState.Resolved,
    entries,
    _meta: { [FEEDBACK_ANNOTATION_META_KEY]: meta }
  };
}
function annotationToFeedback(annotation, sessionResource) {
  const entries = annotation.entries ?? [];
  const meta = readFeedbackMeta(annotation);
  if (!meta || !entries.length) {
    return void 0;
  }
  const replies = entries.slice(1).map((e) => entryText(e.text));
  return {
    id: annotation.id,
    text: entryText(entries[0].text),
    resourceUri: URI.parse(annotation.resource),
    range: fromTextRange(annotation.range),
    sessionResource,
    suggestion: meta?.suggestion,
    codeSelection: meta?.codeSelection,
    diffHunks: meta?.diffHunks,
    kind: meta?.kind ?? AgentFeedbackKind.UserReview,
    sourcePRReviewCommentId: meta?.sourcePRReviewCommentId,
    replies: replies.length ? replies : void 0,
    state: annotation.resolved ? AgentFeedbackState.Resolved : meta?.state ?? AgentFeedbackState.Accepted,
    pendingAgentReveal: meta?.pendingAgentReveal
  };
}
let AnnotationsAgentFeedbackItemsBackend = class extends Disposable {
  constructor(_sessionsManagementService, _sessionsProvidersService) {
    super();
    this._sessionsManagementService = _sessionsManagementService;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._onDidChangeItems = this._register(new Emitter());
    this.onDidChangeItems = this._onDidChangeItems.event;
    this._channels = this._register(new DisposableMap());
    this._channelBySession = /* @__PURE__ */ new Map();
    this._sessionResourceByKey = /* @__PURE__ */ new Map();
    /** Local cache so reads work before the first snapshot arrives. */
    this._cacheBySession = /* @__PURE__ */ new Map();
    /**
     * Signature of the feedback set we last fired {@link onDidChangeItems} for,
     * per session. The annotations channel is shared and may carry non-feedback
     * annotations; comparing signatures means churn from those does not fire a
     * spurious feedback-items change (which would bump recency / navigation).
     */
    this._signatureBySession = /* @__PURE__ */ new Map();
    /**
     * Sessions whose annotations snapshot has been received. Used to fire
     * {@link onDidChangeItems} exactly once when loading completes (even when the
     * loaded feedback set is empty), so consumers that seed feedback can wait for
     * the authoritative set before acting.
     */
    this._loadedBySession = /* @__PURE__ */ new Set();
    this._register(this._sessionsManagementService.onDidDeleteSession((session) => this._releaseChannel(session.resource)));
  }
  getItems(sessionResource) {
    const channel = this._ensureChannel(sessionResource);
    if (channel && this._hasSnapshot(channel.subscription)) {
      return orderFeedbackItems(this._decode(channel.subscription, sessionResource));
    }
    return orderFeedbackItems(this._cacheBySession.get(sessionResource.toString()) ?? []);
  }
  hasLoaded(sessionResource) {
    const channel = this._ensureChannel(sessionResource);
    return channel ? this._hasSnapshot(channel.subscription) : false;
  }
  upsert(feedback) {
    const channel = this._ensureChannel(feedback.sessionResource);
    this._cacheUpsert(feedback);
    if (!channel) {
      this._onDidChangeItems.fire(feedback.sessionResource);
      return;
    }
    channel.connection.dispatch(channel.annotationsUri.toString(), {
      type: ActionType.AnnotationsSet,
      annotation: feedbackToAnnotation(feedback)
    });
    if (!this._hasSnapshot(channel.subscription)) {
      this._onDidChangeItems.fire(feedback.sessionResource);
    }
  }
  remove(sessionResource, feedbackId) {
    const channel = this._ensureChannel(sessionResource);
    this._cacheRemove(sessionResource, feedbackId);
    if (!channel) {
      this._onDidChangeItems.fire(sessionResource);
      return;
    }
    channel.connection.dispatch(channel.annotationsUri.toString(), {
      type: ActionType.AnnotationsRemoved,
      annotationId: feedbackId
    });
    if (!this._hasSnapshot(channel.subscription)) {
      this._onDidChangeItems.fire(sessionResource);
    }
  }
  clear(sessionResource) {
    const items = this.getItems(sessionResource);
    const channel = this._ensureChannel(sessionResource);
    this._cacheBySession.delete(sessionResource.toString());
    if (channel) {
      for (const item of items) {
        channel.connection.dispatch(channel.annotationsUri.toString(), {
          type: ActionType.AnnotationsRemoved,
          annotationId: item.id
        });
      }
    }
    this._onDidChangeItems.fire(sessionResource);
  }
  getSessionsWithItems() {
    const result = [];
    for (const resource of this._sessionResourceByKey.values()) {
      if (this.getItems(resource).length > 0) {
        result.push(resource);
      }
    }
    return result;
  }
  /**
   * Returns the annotations channel URI backing the given session's feedback,
   * or `undefined` when the session is not an agent-host session (or no channel
   * could be resolved). Each feedback item id is an annotation id on this
   * channel, so callers can reference specific comments by id.
   */
  getAnnotationsChannelResource(sessionResource) {
    return this._ensureChannel(sessionResource)?.annotationsUri;
  }
  _hasSnapshot(subscription) {
    const value = subscription.value;
    return value !== void 0 && !(value instanceof Error);
  }
  _decode(subscription, sessionResource) {
    const value = subscription.value;
    if (!value || value instanceof Error) {
      return [];
    }
    const items = [];
    for (const annotation of value.annotations) {
      const feedback = annotationToFeedback(annotation, sessionResource);
      if (feedback) {
        items.push(feedback);
      }
    }
    return items;
  }
  /**
   * Fire {@link onDidChangeItems} only when the session's feedback set actually
   * changed. The annotations channel is generic and may carry annotations from
   * other features; without this guard their churn would bump feedback recency
   * ordering and navigation even though no feedback changed.
   */
  _onAnnotationsChange(sessionResource) {
    const key = sessionResource.toString();
    const channel = this._channelBySession.get(key);
    if (!channel) {
      return;
    }
    if (this._hasSnapshot(channel.subscription) && !this._loadedBySession.has(key)) {
      this._loadedBySession.add(key);
      this._signatureBySession.set(key, this._feedbackSignature(channel.subscription));
      this._onDidChangeItems.fire(sessionResource);
      return;
    }
    const signature = this._feedbackSignature(channel.subscription);
    if (this._signatureBySession.get(key) === signature) {
      return;
    }
    this._signatureBySession.set(key, signature);
    this._onDidChangeItems.fire(sessionResource);
  }
  /**
   * A stable signature of the feedback-bearing annotations in the
   * subscription's current snapshot (sorted by id). Excludes annotations
   * without feedback metadata so unrelated annotation activity on the shared
   * channel is ignored.
   */
  _feedbackSignature(subscription) {
    const value = subscription.value;
    if (!value || value instanceof Error) {
      return "";
    }
    const feedback = value.annotations.map((annotation) => ({ annotation, meta: readFeedbackMeta(annotation) })).filter(({ annotation, meta }) => meta !== void 0 && (annotation.entries?.length ?? 0) > 0).map(({ annotation, meta }) => ({
      id: annotation.id,
      resource: annotation.resource,
      range: annotation.range,
      resolved: annotation.resolved,
      entries: annotation.entries,
      meta
    })).sort((a, b) => a.id.localeCompare(b.id));
    return JSON.stringify(feedback);
  }
  _cacheUpsert(feedback) {
    const key = feedback.sessionResource.toString();
    let items = this._cacheBySession.get(key);
    if (!items) {
      items = [];
      this._cacheBySession.set(key, items);
    }
    const idx = items.findIndex((f) => f.id === feedback.id);
    if (idx >= 0) {
      items[idx] = feedback;
    } else {
      items.push(feedback);
    }
  }
  _cacheRemove(sessionResource, feedbackId) {
    const key = sessionResource.toString();
    const items = this._cacheBySession.get(key);
    if (!items) {
      return;
    }
    const idx = items.findIndex((f) => f.id === feedbackId);
    if (idx >= 0) {
      items.splice(idx, 1);
    }
  }
  _releaseChannel(sessionResource) {
    const key = sessionResource.toString();
    this._channels.deleteAndDispose(key);
    this._channelBySession.delete(key);
    this._sessionResourceByKey.delete(key);
    this._cacheBySession.delete(key);
    this._signatureBySession.delete(key);
    this._loadedBySession.delete(key);
  }
  _ensureChannel(sessionResource) {
    const key = sessionResource.toString();
    const existing = this._channelBySession.get(key);
    if (existing) {
      return existing;
    }
    const session = this._sessionsManagementService.getSession(sessionResource);
    if (!session || !isAgentHostProviderId(session.providerId)) {
      return void 0;
    }
    const provider = this._sessionsProvidersService.getProvider(session.providerId);
    if (!provider?.getFeedbackAnnotationsChannel) {
      return void 0;
    }
    const resolved = provider.getFeedbackAnnotationsChannel(session.sessionId);
    if (!resolved) {
      return void 0;
    }
    const store = new DisposableStore();
    const ref = store.add(resolved.connection.getSubscription(StateComponents.Annotations, resolved.annotationsUri, AnnotationsAgentFeedbackItemsBackend.OWNER));
    const channel = {
      connection: resolved.connection,
      annotationsUri: resolved.annotationsUri,
      subscription: ref.object
    };
    this._signatureBySession.set(key, this._feedbackSignature(ref.object));
    if (this._hasSnapshot(ref.object)) {
      this._loadedBySession.add(key);
    }
    store.add(ref.object.onDidChange(() => this._onAnnotationsChange(sessionResource)));
    this._channels.set(key, store);
    this._channelBySession.set(key, channel);
    this._sessionResourceByKey.set(key, sessionResource);
    return channel;
  }
};
AnnotationsAgentFeedbackItemsBackend.OWNER = "AnnotationsAgentFeedbackItemsBackend";
AnnotationsAgentFeedbackItemsBackend = __decorateClass([
  __decorateParam(0, ISessionsManagementService),
  __decorateParam(1, ISessionsProvidersService)
], AnnotationsAgentFeedbackItemsBackend);
export {
  AnnotationsAgentFeedbackItemsBackend,
  InMemoryAgentFeedbackItemsBackend,
  orderFeedbackItems
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYWdlbnRGZWVkYmFjay9icm93c2VyL2FnZW50RmVlZGJhY2tJdGVtc0JhY2tlbmQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElBZ2VudENvbm5lY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTdWJzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL2FnZW50U3Vic2NyaXB0aW9uLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEFubm90YXRpb24sIEFubm90YXRpb25FbnRyeSwgQW5ub3RhdGlvbnNTdGF0ZSwgU3RhdGVDb21wb25lbnRzLCBTdHJpbmdPck1hcmtkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgVGV4dFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tb24vc3RhdGUuanMnO1xuaW1wb3J0IHsgRkVFREJBQ0tfQU5OT1RBVElPTl9NRVRBX0tFWSwgcmVhZEZlZWRiYWNrQW5ub3RhdGlvbk1ldGEsIHR5cGUgQWdlbnRGZWVkYmFja0tpbmRWYWx1ZSwgdHlwZSBBZ2VudEZlZWRiYWNrU3RhdGVWYWx1ZSwgdHlwZSBJRmVlZGJhY2tBbm5vdGF0aW9uTWV0YSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vbWV0YS9hZ2VudEZlZWRiYWNrQW5ub3RhdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvZGVSZXZpZXdTdWdnZXN0aW9uIH0gZnJvbSAnLi4vLi4vY29kZVJldmlldy9icm93c2VyL2NvZGVSZXZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLCBpc0FnZW50SG9zdFByb3ZpZGVySWQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50RmVlZGJhY2tLaW5kLCBBZ2VudEZlZWRiYWNrU3RhdGUsIElBZ2VudEZlZWRiYWNrIH0gZnJvbSAnLi9hZ2VudEZlZWRiYWNrTW9kZWwuanMnO1xuXG4vLyAtLS0gQmFja2VuZCBpbnRlcmZhY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBTdG9yYWdlIHN0cmF0ZWd5IGZvciB0aGUgcGVyLXNlc3Npb24gZmVlZGJhY2sgaXRlbSBsaXN0IHVzZWQgYnlcbiAqIHtAbGluayBJQWdlbnRGZWVkYmFja1NlcnZpY2V9LiBBIGJhY2tlbmQgb3ducyBPTkxZIHRoZSBsaXN0IG9mIGZlZWRiYWNrXG4gKiBpdGVtcyBrZXllZCBieSBzZXNzaW9uOyBhbGwgZXZlbnRzLCB0ZWxlbWV0cnksIG5hdmlnYXRpb24gYW5jaG9ycywgcmVjZW5jeVxuICogb3JkZXJpbmcgYW5kIHN1Ym1pdCBiZWhhdmlvciBsaXZlIGluIHRoZSBzZXJ2aWNlLlxuICpcbiAqIHtAbGluayBvbkRpZENoYW5nZUl0ZW1zfSBmaXJlcyB3aGVuZXZlciB0aGUgaXRlbXMgZm9yIGEgc2Vzc2lvbiBjaGFuZ2UsXG4gKiB3aGV0aGVyIGR1ZSB0byBhIGxvY2FsIG11dGF0aW9uIG9yIChmb3IgdGhlIGFubm90YXRpb25zLWJhY2tlZFxuICogaW1wbGVtZW50YXRpb24pIGFuIGV4dGVybmFsbHktZHJpdmVuIHVwZGF0ZSBhcnJpdmluZyBvdmVyIHRoZSBwcm90b2NvbC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRGZWVkYmFja0l0ZW1zQmFja2VuZCB7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSXRlbXM6IEV2ZW50PFVSST47XG5cblx0LyoqIFJldHVybnMgdGhlIGZlZWRiYWNrIGl0ZW1zIGZvciBhIHNlc3Npb24gaW4gc3RhYmxlIGRpc3BsYXkgb3JkZXIuICovXG5cdGdldEl0ZW1zKHNlc3Npb25SZXNvdXJjZTogVVJJKTogcmVhZG9ubHkgSUFnZW50RmVlZGJhY2tbXTtcblxuXHQvKipcblx0ICogV2hldGhlciB7QGxpbmsgZ2V0SXRlbXN9IHJlZmxlY3RzIHRoZSBhdXRob3JpdGF0aXZlIGl0ZW0gc2V0IGZvciB0aGVcblx0ICogc2Vzc2lvbi4gRm9yIHRoZSBpbi1tZW1vcnkgYmFja2VuZCB0aGlzIGlzIGFsd2F5cyBgdHJ1ZWA7IGZvciB0aGVcblx0ICogYW5ub3RhdGlvbnMtYmFja2VkIGJhY2tlbmQgaXQgaXMgYGZhbHNlYCB1bnRpbCB0aGUgc2Vzc2lvbidzIGFubm90YXRpb25zXG5cdCAqIHNuYXBzaG90IGhhcyBiZWVuIHJlY2VpdmVkLCBzbyBjYWxsZXJzIHRoYXQgc2VlZCBpdGVtcyAoZS5nLiBtaXJyb3JpbmcgUFJcblx0ICogcmV2aWV3IGNvbW1lbnRzKSBjYW4gYXZvaWQgYWN0aW5nIG9uIGEgdHJhbnNpZW50bHktZW1wdHkgbGlzdC5cblx0ICovXG5cdGhhc0xvYWRlZChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW47XG5cblx0LyoqIEFkZHMgYSBuZXcgZmVlZGJhY2sgaXRlbSBvciByZXBsYWNlcyBhbiBleGlzdGluZyBvbmUgd2l0aCB0aGUgc2FtZSBpZC4gKi9cblx0dXBzZXJ0KGZlZWRiYWNrOiBJQWdlbnRGZWVkYmFjayk6IHZvaWQ7XG5cblx0LyoqIFJlbW92ZXMgYSBzaW5nbGUgZmVlZGJhY2sgaXRlbS4gKi9cblx0cmVtb3ZlKHNlc3Npb25SZXNvdXJjZTogVVJJLCBmZWVkYmFja0lkOiBzdHJpbmcpOiB2b2lkO1xuXG5cdC8qKiBSZW1vdmVzIGFsbCBmZWVkYmFjayBpdGVtcyBmb3IgYSBzZXNzaW9uLiAqL1xuXHRjbGVhcihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQ7XG5cblx0LyoqIFJldHVybnMgdGhlIHNlc3Npb24gcmVzb3VyY2VzIHRoYXQgY3VycmVudGx5IGhvbGQgYXQgbGVhc3Qgb25lIGl0ZW0uICovXG5cdGdldFNlc3Npb25zV2l0aEl0ZW1zKCk6IFVSSVtdO1xufVxuXG4vLyAtLS0gT3JkZXJpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBPcmRlcnMgZmVlZGJhY2sgaXRlbXMgZm9yIGRpc3BsYXk6IGZpbGVzIGFyZSBncm91cGVkIGJ5IHRoZSBvcmRlciBpbiB3aGljaFxuICogdGhleSBmaXJzdCBhcHBlYXIgaW4ge0BsaW5rIGl0ZW1zfSwgYW5kIHdpdGhpbiBhIGZpbGUgaXRlbXMgYXJlIHNvcnRlZCBieVxuICoge0BsaW5rIElBZ2VudEZlZWRiYWNrLnJhbmdlfSBzdGFydCBsaW5lLiBVc2VzIGEgc3RhYmxlIHNvcnQgc28gaXRlbXMgc2hhcmluZ1xuICogYSBmaWxlIGFuZCBzdGFydCBsaW5lIGtlZXAgdGhlaXIgcmVsYXRpdmUgb3JkZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvcmRlckZlZWRiYWNrSXRlbXMoaXRlbXM6IHJlYWRvbmx5IElBZ2VudEZlZWRiYWNrW10pOiBJQWdlbnRGZWVkYmFja1tdIHtcblx0Y29uc3QgZmlsZU9yZGVyID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0Y29uc3Qga2V5ID0gaXRlbS5yZXNvdXJjZVVyaS50b1N0cmluZygpO1xuXHRcdGlmICghZmlsZU9yZGVyLmhhcyhrZXkpKSB7XG5cdFx0XHRmaWxlT3JkZXIuc2V0KGtleSwgZmlsZU9yZGVyLnNpemUpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gaXRlbXMuc2xpY2UoKS5zb3J0KChhLCBiKSA9PiB7XG5cdFx0Y29uc3QgZmEgPSBmaWxlT3JkZXIuZ2V0KGEucmVzb3VyY2VVcmkudG9TdHJpbmcoKSkhO1xuXHRcdGNvbnN0IGZiID0gZmlsZU9yZGVyLmdldChiLnJlc291cmNlVXJpLnRvU3RyaW5nKCkpITtcblx0XHRpZiAoZmEgIT09IGZiKSB7XG5cdFx0XHRyZXR1cm4gZmEgLSBmYjtcblx0XHR9XG5cdFx0cmV0dXJuIGEucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gYi5yYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdH0pO1xufVxuXG4vLyAtLS0gSW4tbWVtb3J5IGJhY2tlbmQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBDbGllbnQtc2lkZSwgaW4tbWVtb3J5IGZlZWRiYWNrIHN0b3JlIHVzZWQgZm9yIGV2ZXJ5IG5vbi1hZ2VudC1ob3N0XG4gKiBwcm92aWRlci4gU3RhdGUgaXMgbm90IHBlcnNpc3RlZCBhbmQgaXMgY2xlYXJlZCBvbiBzZXNzaW9uIGNsb3NlLlxuICovXG5leHBvcnQgY2xhc3MgSW5NZW1vcnlBZ2VudEZlZWRiYWNrSXRlbXNCYWNrZW5kIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudEZlZWRiYWNrSXRlbXNCYWNrZW5kIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUl0ZW1zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VVJJPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VJdGVtcyA9IHRoaXMuX29uRGlkQ2hhbmdlSXRlbXMuZXZlbnQ7XG5cblx0LyoqIHNlc3Npb25SZXNvdXJjZSBcdTIxOTIgZmVlZGJhY2sgaXRlbXMgKGluc2VydGlvbiBvcmRlcjsgZGlzcGxheSBvcmRlciBhcHBsaWVkIG9uIHJlYWQpICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2J5U2Vzc2lvbiA9IG5ldyBNYXA8c3RyaW5nLCBJQWdlbnRGZWVkYmFja1tdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uUmVzb3VyY2VCeUtleSA9IG5ldyBNYXA8c3RyaW5nLCBVUkk+KCk7XG5cblx0Z2V0SXRlbXMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiByZWFkb25seSBJQWdlbnRGZWVkYmFja1tdIHtcblx0XHRyZXR1cm4gb3JkZXJGZWVkYmFja0l0ZW1zKHRoaXMuX2J5U2Vzc2lvbi5nZXQoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpID8/IFtdKTtcblx0fVxuXG5cdGhhc0xvYWRlZChfc2Vzc2lvblJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHQvLyBJbi1tZW1vcnkgc3RhdGUgaXMgYWx3YXlzIGF1dGhvcml0YXRpdmU7IHRoZXJlIGlzIG5vdGhpbmcgdG8gYXdhaXQuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHR1cHNlcnQoZmVlZGJhY2s6IElBZ2VudEZlZWRiYWNrKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gZmVlZGJhY2suc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0bGV0IGl0ZW1zID0gdGhpcy5fYnlTZXNzaW9uLmdldChrZXkpO1xuXHRcdGlmICghaXRlbXMpIHtcblx0XHRcdGl0ZW1zID0gW107XG5cdFx0XHR0aGlzLl9ieVNlc3Npb24uc2V0KGtleSwgaXRlbXMpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlQnlLZXkuc2V0KGtleSwgZmVlZGJhY2suc2Vzc2lvblJlc291cmNlKTtcblx0XHR9XG5cdFx0Y29uc3QgaWR4ID0gaXRlbXMuZmluZEluZGV4KGYgPT4gZi5pZCA9PT0gZmVlZGJhY2suaWQpO1xuXHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0aXRlbXNbaWR4XSA9IGZlZWRiYWNrO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpdGVtcy5wdXNoKGZlZWRiYWNrKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJdGVtcy5maXJlKGZlZWRiYWNrLnNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRyZW1vdmUoc2Vzc2lvblJlc291cmNlOiBVUkksIGZlZWRiYWNrSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5fYnlTZXNzaW9uLmdldChrZXkpO1xuXHRcdGlmICghaXRlbXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaWR4ID0gaXRlbXMuZmluZEluZGV4KGYgPT4gZi5pZCA9PT0gZmVlZGJhY2tJZCk7XG5cdFx0aWYgKGlkeCA8IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aXRlbXMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0aWYgKCFpdGVtcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX2J5U2Vzc2lvbi5kZWxldGUoa2V5KTtcblx0XHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZUJ5S2V5LmRlbGV0ZShrZXkpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1zLmZpcmUoc2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdGNsZWFyKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0aWYgKHRoaXMuX2J5U2Vzc2lvbi5kZWxldGUoa2V5KSkge1xuXHRcdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlQnlLZXkuZGVsZXRlKGtleSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1zLmZpcmUoc2Vzc2lvblJlc291cmNlKTtcblx0XHR9XG5cdH1cblxuXHRnZXRTZXNzaW9uc1dpdGhJdGVtcygpOiBVUklbXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9zZXNzaW9uUmVzb3VyY2VCeUtleS52YWx1ZXMoKV07XG5cdH1cbn1cblxuLy8gLS0tIEFubm90YXRpb25zLWJhY2tlZCBiYWNrZW5kIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogQ2xpZW50LXNpZGUgdHlwZWQgdmlldyBvZiBhIGZlZWRiYWNrIGFubm90YXRpb24ncyBgX21ldGFgLCByZXNvbHZlZCBmcm9tIHRoZVxuICogc2hhcmVkIHdpcmUgc2hhcGU6IHtAbGluayBraW5kfS97QGxpbmsgc3RhdGV9IGFzIHRoZSBjbGllbnQgZW51bXMgYW5kXG4gKiB7QGxpbmsgc3VnZ2VzdGlvbn0gYXMgdGhlIGNvbmNyZXRlIHtAbGluayBJQ29kZVJldmlld1N1Z2dlc3Rpb259ICh0aGUgc2hhcmVkXG4gKiByZWFkZXIgdmFsaWRhdGVzIGl0IG9ubHkgYXMgb3BhcXVlIGRhdGEsIHNpbmNlIGl0cyBzaGFwZSBsaXZlcyBpbiB0aGlzIGxheWVyKS5cbiAqL1xuaW50ZXJmYWNlIElGZWVkYmFja01ldGFWaWV3IHtcblx0cmVhZG9ubHkga2luZDogQWdlbnRGZWVkYmFja0tpbmQ7XG5cdHJlYWRvbmx5IHN0YXRlOiBBZ2VudEZlZWRiYWNrU3RhdGU7XG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogc3RyaW5nO1xuXHRyZWFkb25seSBzdWdnZXN0aW9uPzogSUNvZGVSZXZpZXdTdWdnZXN0aW9uO1xuXHRyZWFkb25seSBjb2RlU2VsZWN0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBkaWZmSHVua3M/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNvdXJjZVBSUmV2aWV3Q29tbWVudElkPzogc3RyaW5nO1xuXHRyZWFkb25seSBwZW5kaW5nQWdlbnRSZXZlYWw/OiBib29sZWFuO1xufVxuXG5jb25zdCBLSU5EX0ZST01fVkFMVUU6IFJlY29yZDxBZ2VudEZlZWRiYWNrS2luZFZhbHVlLCBBZ2VudEZlZWRiYWNrS2luZD4gPSB7XG5cdHVzZXI6IEFnZW50RmVlZGJhY2tLaW5kLlVzZXJSZXZpZXcsXG5cdGNvZGVSZXZpZXc6IEFnZW50RmVlZGJhY2tLaW5kLkFnZW50UmV2aWV3LFxuXHRwclJldmlldzogQWdlbnRGZWVkYmFja0tpbmQuUFJSZXZpZXcsXG59O1xuXG5jb25zdCBTVEFURV9GUk9NX1ZBTFVFOiBSZWNvcmQ8QWdlbnRGZWVkYmFja1N0YXRlVmFsdWUsIEFnZW50RmVlZGJhY2tTdGF0ZT4gPSB7XG5cdGNyZWF0ZWQ6IEFnZW50RmVlZGJhY2tTdGF0ZS5DcmVhdGVkLFxuXHRhY2NlcHRlZDogQWdlbnRGZWVkYmFja1N0YXRlLkFjY2VwdGVkLFxuXHRzdWJtaXR0ZWQ6IEFnZW50RmVlZGJhY2tTdGF0ZS5TdWJtaXR0ZWQsXG5cdHJlc29sdmVkOiBBZ2VudEZlZWRiYWNrU3RhdGUuUmVzb2x2ZWQsXG59O1xuXG5mdW5jdGlvbiBhc0NvZGVSZXZpZXdTdWdnZXN0aW9uKHN1Z2dlc3Rpb246IHVua25vd24pOiBJQ29kZVJldmlld1N1Z2dlc3Rpb24gfCB1bmRlZmluZWQge1xuXHQvLyBgc3VnZ2VzdGlvbmAgaXMgb3BhcXVlIGNsaWVudC1vbmx5IGRhdGEgdGhpcyBiYWNrZW5kIGl0c2VsZiBzZXJpYWxpemVkIGZyb21cblx0Ly8gYW4gYElDb2RlUmV2aWV3U3VnZ2VzdGlvbmA7IHZhbGlkYXRlIHRoZSBzaGFwZSB3ZSBkZXBlbmQgb24gKGFuIGBlZGl0c2Bcblx0Ly8gYXJyYXkpIGFuZCB0cnVzdCB0aGUgcm91bmQtdHJpcHBlZCBjb250ZW50cy5cblx0aWYgKHN1Z2dlc3Rpb24gJiYgdHlwZW9mIHN1Z2dlc3Rpb24gPT09ICdvYmplY3QnICYmIEFycmF5LmlzQXJyYXkoKHN1Z2dlc3Rpb24gYXMgeyBlZGl0cz86IHVua25vd24gfSkuZWRpdHMpKSB7XG5cdFx0cmV0dXJuIHN1Z2dlc3Rpb24gYXMgSUNvZGVSZXZpZXdTdWdnZXN0aW9uO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogUmVzb2x2ZXMgdGhlIHNoYXJlZCBmZWVkYmFjayBgX21ldGFgICh2YWxpZGF0ZWQgYnlcbiAqIHtAbGluayByZWFkRmVlZGJhY2tBbm5vdGF0aW9uTWV0YX0pIGludG8gdGhlIGNsaWVudC10eXBlZFxuICoge0BsaW5rIElGZWVkYmFja01ldGFWaWV3fSwgcmV0dXJuaW5nIGB1bmRlZmluZWRgIGZvciBhbm5vdGF0aW9ucyB0aGF0IGFyZW4ndFxuICogZmVlZGJhY2sgaXRlbXMuXG4gKi9cbmZ1bmN0aW9uIHJlYWRGZWVkYmFja01ldGEoYW5ub3RhdGlvbjogQW5ub3RhdGlvbik6IElGZWVkYmFja01ldGFWaWV3IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgYmFzZSA9IHJlYWRGZWVkYmFja0Fubm90YXRpb25NZXRhKGFubm90YXRpb24pO1xuXHRpZiAoIWJhc2UpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7XG5cdFx0a2luZDogS0lORF9GUk9NX1ZBTFVFW2Jhc2Uua2luZF0sXG5cdFx0c3RhdGU6IFNUQVRFX0ZST01fVkFMVUVbYmFzZS5zdGF0ZV0sXG5cdFx0c2Vzc2lvblJlc291cmNlOiBiYXNlLnNlc3Npb25SZXNvdXJjZSxcblx0XHRzdWdnZXN0aW9uOiBhc0NvZGVSZXZpZXdTdWdnZXN0aW9uKGJhc2Uuc3VnZ2VzdGlvbiksXG5cdFx0Y29kZVNlbGVjdGlvbjogYmFzZS5jb2RlU2VsZWN0aW9uLFxuXHRcdGRpZmZIdW5rczogYmFzZS5kaWZmSHVua3MsXG5cdFx0c291cmNlUFJSZXZpZXdDb21tZW50SWQ6IGJhc2Uuc291cmNlUFJSZXZpZXdDb21tZW50SWQsXG5cdFx0cGVuZGluZ0FnZW50UmV2ZWFsOiBiYXNlLnBlbmRpbmdBZ2VudFJldmVhbCxcblx0fTtcbn1cblxuZnVuY3Rpb24gdG9UZXh0UmFuZ2UocmFuZ2U6IElSYW5nZSk6IFRleHRSYW5nZSB7XG5cdHJldHVybiB7XG5cdFx0c3RhcnQ6IHsgbGluZTogcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gMSwgY2hhcmFjdGVyOiByYW5nZS5zdGFydENvbHVtbiAtIDEgfSxcblx0XHRlbmQ6IHsgbGluZTogcmFuZ2UuZW5kTGluZU51bWJlciAtIDEsIGNoYXJhY3RlcjogcmFuZ2UuZW5kQ29sdW1uIC0gMSB9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBmcm9tVGV4dFJhbmdlKHJhbmdlOiBUZXh0UmFuZ2UgfCB1bmRlZmluZWQpOiBJUmFuZ2Uge1xuXHRpZiAoIXJhbmdlKSB7XG5cdFx0cmV0dXJuIHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiAxIH07XG5cdH1cblx0cmV0dXJuIHtcblx0XHRzdGFydExpbmVOdW1iZXI6IHJhbmdlLnN0YXJ0LmxpbmUgKyAxLFxuXHRcdHN0YXJ0Q29sdW1uOiByYW5nZS5zdGFydC5jaGFyYWN0ZXIgKyAxLFxuXHRcdGVuZExpbmVOdW1iZXI6IHJhbmdlLmVuZC5saW5lICsgMSxcblx0XHRlbmRDb2x1bW46IHJhbmdlLmVuZC5jaGFyYWN0ZXIgKyAxLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBlbnRyeVRleHQodGV4dDogU3RyaW5nT3JNYXJrZG93bik6IHN0cmluZyB7XG5cdHJldHVybiB0eXBlb2YgdGV4dCA9PT0gJ3N0cmluZycgPyB0ZXh0IDogdGV4dC5tYXJrZG93bjtcbn1cblxuZnVuY3Rpb24gZmVlZGJhY2tUb0Fubm90YXRpb24oZmVlZGJhY2s6IElBZ2VudEZlZWRiYWNrKTogQW5ub3RhdGlvbiB7XG5cdGNvbnN0IGVudHJpZXM6IEFubm90YXRpb25FbnRyeVtdID0gW3sgaWQ6IGAke2ZlZWRiYWNrLmlkfTowYCwgdGV4dDogZmVlZGJhY2sudGV4dCB9XTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCAoZmVlZGJhY2sucmVwbGllcz8ubGVuZ3RoID8/IDApOyBpKyspIHtcblx0XHRlbnRyaWVzLnB1c2goeyBpZDogYCR7ZmVlZGJhY2suaWR9OnIke2l9YCwgdGV4dDogZmVlZGJhY2sucmVwbGllcyFbaV0gfSk7XG5cdH1cblx0Y29uc3QgbWV0YTogSUZlZWRiYWNrQW5ub3RhdGlvbk1ldGEgPSB7XG5cdFx0a2luZDogZmVlZGJhY2sua2luZCxcblx0XHRzdGF0ZTogZmVlZGJhY2suc3RhdGUsXG5cdFx0c2Vzc2lvblJlc291cmNlOiBmZWVkYmFjay5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRzdWdnZXN0aW9uOiBmZWVkYmFjay5zdWdnZXN0aW9uLFxuXHRcdGNvZGVTZWxlY3Rpb246IGZlZWRiYWNrLmNvZGVTZWxlY3Rpb24sXG5cdFx0ZGlmZkh1bmtzOiBmZWVkYmFjay5kaWZmSHVua3MsXG5cdFx0c291cmNlUFJSZXZpZXdDb21tZW50SWQ6IGZlZWRiYWNrLnNvdXJjZVBSUmV2aWV3Q29tbWVudElkLFxuXHRcdHBlbmRpbmdBZ2VudFJldmVhbDogZmVlZGJhY2sucGVuZGluZ0FnZW50UmV2ZWFsLFxuXHR9O1xuXHRyZXR1cm4ge1xuXHRcdGlkOiBmZWVkYmFjay5pZCxcblx0XHR0dXJuSWQ6ICcnLFxuXHRcdHJlc291cmNlOiBmZWVkYmFjay5yZXNvdXJjZVVyaS50b1N0cmluZygpLFxuXHRcdHJhbmdlOiB0b1RleHRSYW5nZShmZWVkYmFjay5yYW5nZSksXG5cdFx0cmVzb2x2ZWQ6IGZlZWRiYWNrLnN0YXRlID09PSBBZ2VudEZlZWRiYWNrU3RhdGUuUmVzb2x2ZWQsXG5cdFx0ZW50cmllcyxcblx0XHRfbWV0YTogeyBbRkVFREJBQ0tfQU5OT1RBVElPTl9NRVRBX0tFWV06IG1ldGEgfSxcblx0fTtcbn1cblxuZnVuY3Rpb24gYW5ub3RhdGlvblRvRmVlZGJhY2soYW5ub3RhdGlvbjogQW5ub3RhdGlvbiwgc2Vzc2lvblJlc291cmNlOiBVUkkpOiBJQWdlbnRGZWVkYmFjayB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGVudHJpZXMgPSBhbm5vdGF0aW9uLmVudHJpZXMgPz8gW107XG5cdGNvbnN0IG1ldGEgPSByZWFkRmVlZGJhY2tNZXRhKGFubm90YXRpb24pO1xuXHQvLyBUaGUgYW5ub3RhdGlvbnMgY2hhbm5lbCBpcyBnZW5lcmljIGFuZCBtYXkgY2FycnkgYW5ub3RhdGlvbnMgcHJvZHVjZWQgYnlcblx0Ly8gb3RoZXIgZmVhdHVyZXMuIE9ubHkgYW5ub3RhdGlvbnMgdGhhdCBjYXJyeSBmZWVkYmFjayBtZXRhZGF0YSBhcmUgZmVlZGJhY2tcblx0Ly8gaXRlbXM7IGV2ZXJ5dGhpbmcgZWxzZSBpcyBpZ25vcmVkIHNvIGZlZWRiYWNrIG5ldmVyIHN1cmZhY2VzIG9yIG11dGF0ZXNcblx0Ly8gdW5yZWxhdGVkIGFubm90YXRpb25zLlxuXHRpZiAoIW1ldGEgfHwgIWVudHJpZXMubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCByZXBsaWVzID0gZW50cmllcy5zbGljZSgxKS5tYXAoZSA9PiBlbnRyeVRleHQoZS50ZXh0KSk7XG5cdHJldHVybiB7XG5cdFx0aWQ6IGFubm90YXRpb24uaWQsXG5cdFx0dGV4dDogZW50cnlUZXh0KGVudHJpZXNbMF0udGV4dCksXG5cdFx0cmVzb3VyY2VVcmk6IFVSSS5wYXJzZShhbm5vdGF0aW9uLnJlc291cmNlKSxcblx0XHRyYW5nZTogZnJvbVRleHRSYW5nZShhbm5vdGF0aW9uLnJhbmdlKSxcblx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0c3VnZ2VzdGlvbjogbWV0YT8uc3VnZ2VzdGlvbixcblx0XHRjb2RlU2VsZWN0aW9uOiBtZXRhPy5jb2RlU2VsZWN0aW9uLFxuXHRcdGRpZmZIdW5rczogbWV0YT8uZGlmZkh1bmtzLFxuXHRcdGtpbmQ6IG1ldGE/LmtpbmQgPz8gQWdlbnRGZWVkYmFja0tpbmQuVXNlclJldmlldyxcblx0XHRzb3VyY2VQUlJldmlld0NvbW1lbnRJZDogbWV0YT8uc291cmNlUFJSZXZpZXdDb21tZW50SWQsXG5cdFx0cmVwbGllczogcmVwbGllcy5sZW5ndGggPyByZXBsaWVzIDogdW5kZWZpbmVkLFxuXHRcdHN0YXRlOiBhbm5vdGF0aW9uLnJlc29sdmVkID8gQWdlbnRGZWVkYmFja1N0YXRlLlJlc29sdmVkIDogKG1ldGE/LnN0YXRlID8/IEFnZW50RmVlZGJhY2tTdGF0ZS5BY2NlcHRlZCksXG5cdFx0cGVuZGluZ0FnZW50UmV2ZWFsOiBtZXRhPy5wZW5kaW5nQWdlbnRSZXZlYWwsXG5cdH07XG59XG5cbmludGVyZmFjZSBJVHJhY2tlZENoYW5uZWwge1xuXHRyZWFkb25seSBjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uO1xuXHRyZWFkb25seSBhbm5vdGF0aW9uc1VyaTogVVJJO1xuXHRyZWFkb25seSBzdWJzY3JpcHRpb246IElBZ2VudFN1YnNjcmlwdGlvbjxBbm5vdGF0aW9uc1N0YXRlPjtcbn1cblxuLyoqXG4gKiBGZWVkYmFjayBzdG9yZSBiYWNrZWQgYnkgdGhlIGFnZW50IGhvc3QncyBhbm5vdGF0aW9ucyBjaGFubmVsLiBGZWVkYmFja1xuICogaXRlbXMgcm91bmQtdHJpcCBhcyB7QGxpbmsgQW5ub3RhdGlvbn1zIG9uIGA8c2Vzc2lvbj4vYW5ub3RhdGlvbnNgLCBtdXRhdGVkXG4gKiB2aWEgdGhlIGBhbm5vdGF0aW9ucy9zZXRgIHVwc2VydCAoYW5kIGBhbm5vdGF0aW9ucy9yZW1vdmVkYCkgYWN0aW9ucywgd2l0aFxuICogZmVlZGJhY2sgc2VtYW50aWNzIGNhcnJpZWQgaW4ge0BsaW5rIEFubm90YXRpb24uX21ldGF9LlxuICpcbiAqIEEgcGVyLXNlc3Npb24gc3Vic2NyaXB0aW9uIGlzIGFjcXVpcmVkIGxhemlseSBhbmQgaGVsZCBmb3IgdGhlIGJhY2tlbmQnc1xuICogbGlmZXRpbWUgc28gcmVhZHMgYXJlIHN5bmNocm9ub3VzIGFuZCBzZXJ2ZXItZHJpdmVuIGNoYW5nZXMgc3VyZmFjZSB2aWFcbiAqIHtAbGluayBvbkRpZENoYW5nZUl0ZW1zfS4gQSBsb2NhbCBjYWNoZSBiYWNrcyByZWFkcyBiZWZvcmUgdGhlIGZpcnN0XG4gKiBzbmFwc2hvdCBhcnJpdmVzLlxuICovXG5leHBvcnQgY2xhc3MgQW5ub3RhdGlvbnNBZ2VudEZlZWRiYWNrSXRlbXNCYWNrZW5kIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudEZlZWRiYWNrSXRlbXNCYWNrZW5kIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBPV05FUiA9ICdBbm5vdGF0aW9uc0FnZW50RmVlZGJhY2tJdGVtc0JhY2tlbmQnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSXRlbXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVUkk+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUl0ZW1zID0gdGhpcy5fb25EaWRDaGFuZ2VJdGVtcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGFubmVscyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgRGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhbm5lbEJ5U2Vzc2lvbiA9IG5ldyBNYXA8c3RyaW5nLCBJVHJhY2tlZENoYW5uZWw+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25SZXNvdXJjZUJ5S2V5ID0gbmV3IE1hcDxzdHJpbmcsIFVSST4oKTtcblx0LyoqIExvY2FsIGNhY2hlIHNvIHJlYWRzIHdvcmsgYmVmb3JlIHRoZSBmaXJzdCBzbmFwc2hvdCBhcnJpdmVzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZUJ5U2Vzc2lvbiA9IG5ldyBNYXA8c3RyaW5nLCBJQWdlbnRGZWVkYmFja1tdPigpO1xuXHQvKipcblx0ICogU2lnbmF0dXJlIG9mIHRoZSBmZWVkYmFjayBzZXQgd2UgbGFzdCBmaXJlZCB7QGxpbmsgb25EaWRDaGFuZ2VJdGVtc30gZm9yLFxuXHQgKiBwZXIgc2Vzc2lvbi4gVGhlIGFubm90YXRpb25zIGNoYW5uZWwgaXMgc2hhcmVkIGFuZCBtYXkgY2Fycnkgbm9uLWZlZWRiYWNrXG5cdCAqIGFubm90YXRpb25zOyBjb21wYXJpbmcgc2lnbmF0dXJlcyBtZWFucyBjaHVybiBmcm9tIHRob3NlIGRvZXMgbm90IGZpcmUgYVxuXHQgKiBzcHVyaW91cyBmZWVkYmFjay1pdGVtcyBjaGFuZ2UgKHdoaWNoIHdvdWxkIGJ1bXAgcmVjZW5jeSAvIG5hdmlnYXRpb24pLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2lnbmF0dXJlQnlTZXNzaW9uID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0LyoqXG5cdCAqIFNlc3Npb25zIHdob3NlIGFubm90YXRpb25zIHNuYXBzaG90IGhhcyBiZWVuIHJlY2VpdmVkLiBVc2VkIHRvIGZpcmVcblx0ICoge0BsaW5rIG9uRGlkQ2hhbmdlSXRlbXN9IGV4YWN0bHkgb25jZSB3aGVuIGxvYWRpbmcgY29tcGxldGVzIChldmVuIHdoZW4gdGhlXG5cdCAqIGxvYWRlZCBmZWVkYmFjayBzZXQgaXMgZW1wdHkpLCBzbyBjb25zdW1lcnMgdGhhdCBzZWVkIGZlZWRiYWNrIGNhbiB3YWl0IGZvclxuXHQgKiB0aGUgYXV0aG9yaXRhdGl2ZSBzZXQgYmVmb3JlIGFjdGluZy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvYWRlZEJ5U2Vzc2lvbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U6IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBSZWxlYXNlIGEgc2Vzc2lvbidzIGFubm90YXRpb25zIHN1YnNjcmlwdGlvbiB3aGVuIHRoZSBzZXNzaW9uIGlzXG5cdFx0Ly8gcGVybWFuZW50bHkgZGVsZXRlZC4gT3RoZXJ3aXNlIHRoZSBwZXItc2Vzc2lvbiB3aXJlIHN1YnNjcmlwdGlvblxuXHRcdC8vIGFjcXVpcmVkIGxhemlseSBpbiBgX2Vuc3VyZUNoYW5uZWxgIHdvdWxkIGJlIGhlbGQgZm9yIHRoZSBsaWZldGltZSBvZlxuXHRcdC8vIHRoaXMgKHNpbmdsZXRvbi1vd25lZCkgYmFja2VuZC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkRGVsZXRlU2Vzc2lvbihzZXNzaW9uID0+IHRoaXMuX3JlbGVhc2VDaGFubmVsKHNlc3Npb24ucmVzb3VyY2UpKSk7XG5cdH1cblxuXHRnZXRJdGVtcyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHJlYWRvbmx5IElBZ2VudEZlZWRiYWNrW10ge1xuXHRcdGNvbnN0IGNoYW5uZWwgPSB0aGlzLl9lbnN1cmVDaGFubmVsKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKGNoYW5uZWwgJiYgdGhpcy5faGFzU25hcHNob3QoY2hhbm5lbC5zdWJzY3JpcHRpb24pKSB7XG5cdFx0XHRyZXR1cm4gb3JkZXJGZWVkYmFja0l0ZW1zKHRoaXMuX2RlY29kZShjaGFubmVsLnN1YnNjcmlwdGlvbiwgc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0fVxuXHRcdHJldHVybiBvcmRlckZlZWRiYWNrSXRlbXModGhpcy5fY2FjaGVCeVNlc3Npb24uZ2V0KHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSA/PyBbXSk7XG5cdH1cblxuXHRoYXNMb2FkZWQoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHQvLyBPbmx5IGF1dGhvcml0YXRpdmUgb25jZSB0aGUgc2Vzc2lvbidzIGFubm90YXRpb25zIHNuYXBzaG90IGhhcyBiZWVuXG5cdFx0Ly8gcmVjZWl2ZWQ7IHVudGlsIHRoZW4gYGdldEl0ZW1zYCBmYWxscyBiYWNrIHRvIHRoZSAocG9zc2libHkgZW1wdHkpXG5cdFx0Ly8gbG9jYWwgY2FjaGUgYW5kIG11c3Qgbm90IGJlIHRyZWF0ZWQgYXMgdGhlIGZ1bGwgaXRlbSBzZXQuXG5cdFx0Y29uc3QgY2hhbm5lbCA9IHRoaXMuX2Vuc3VyZUNoYW5uZWwoc2Vzc2lvblJlc291cmNlKTtcblx0XHRyZXR1cm4gY2hhbm5lbCA/IHRoaXMuX2hhc1NuYXBzaG90KGNoYW5uZWwuc3Vic2NyaXB0aW9uKSA6IGZhbHNlO1xuXHR9XG5cblx0dXBzZXJ0KGZlZWRiYWNrOiBJQWdlbnRGZWVkYmFjayk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYW5uZWwgPSB0aGlzLl9lbnN1cmVDaGFubmVsKGZlZWRiYWNrLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5fY2FjaGVVcHNlcnQoZmVlZGJhY2spO1xuXHRcdGlmICghY2hhbm5lbCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VJdGVtcy5maXJlKGZlZWRiYWNrLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNoYW5uZWwuY29ubmVjdGlvbi5kaXNwYXRjaChjaGFubmVsLmFubm90YXRpb25zVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQW5ub3RhdGlvbnNTZXQsXG5cdFx0XHRhbm5vdGF0aW9uOiBmZWVkYmFja1RvQW5ub3RhdGlvbihmZWVkYmFjayksXG5cdFx0fSk7XG5cdFx0aWYgKCF0aGlzLl9oYXNTbmFwc2hvdChjaGFubmVsLnN1YnNjcmlwdGlvbikpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbXMuZmlyZShmZWVkYmFjay5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdHJlbW92ZShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgZmVlZGJhY2tJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhbm5lbCA9IHRoaXMuX2Vuc3VyZUNoYW5uZWwoc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLl9jYWNoZVJlbW92ZShzZXNzaW9uUmVzb3VyY2UsIGZlZWRiYWNrSWQpO1xuXHRcdGlmICghY2hhbm5lbCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VJdGVtcy5maXJlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNoYW5uZWwuY29ubmVjdGlvbi5kaXNwYXRjaChjaGFubmVsLmFubm90YXRpb25zVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQW5ub3RhdGlvbnNSZW1vdmVkLFxuXHRcdFx0YW5ub3RhdGlvbklkOiBmZWVkYmFja0lkLFxuXHRcdH0pO1xuXHRcdGlmICghdGhpcy5faGFzU25hcHNob3QoY2hhbm5lbC5zdWJzY3JpcHRpb24pKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1zLmZpcmUoc2Vzc2lvblJlc291cmNlKTtcblx0XHR9XG5cdH1cblxuXHRjbGVhcihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5nZXRJdGVtcyhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGNoYW5uZWwgPSB0aGlzLl9lbnN1cmVDaGFubmVsKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5fY2FjaGVCeVNlc3Npb24uZGVsZXRlKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRpZiAoY2hhbm5lbCkge1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRcdGNoYW5uZWwuY29ubmVjdGlvbi5kaXNwYXRjaChjaGFubmVsLmFubm90YXRpb25zVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkFubm90YXRpb25zUmVtb3ZlZCxcblx0XHRcdFx0XHRhbm5vdGF0aW9uSWQ6IGl0ZW0uaWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1zLmZpcmUoc2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdGdldFNlc3Npb25zV2l0aEl0ZW1zKCk6IFVSSVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFVSSVtdID0gW107XG5cdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiB0aGlzLl9zZXNzaW9uUmVzb3VyY2VCeUtleS52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHRoaXMuZ2V0SXRlbXMocmVzb3VyY2UpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gocmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGFubm90YXRpb25zIGNoYW5uZWwgVVJJIGJhY2tpbmcgdGhlIGdpdmVuIHNlc3Npb24ncyBmZWVkYmFjayxcblx0ICogb3IgYHVuZGVmaW5lZGAgd2hlbiB0aGUgc2Vzc2lvbiBpcyBub3QgYW4gYWdlbnQtaG9zdCBzZXNzaW9uIChvciBubyBjaGFubmVsXG5cdCAqIGNvdWxkIGJlIHJlc29sdmVkKS4gRWFjaCBmZWVkYmFjayBpdGVtIGlkIGlzIGFuIGFubm90YXRpb24gaWQgb24gdGhpc1xuXHQgKiBjaGFubmVsLCBzbyBjYWxsZXJzIGNhbiByZWZlcmVuY2Ugc3BlY2lmaWMgY29tbWVudHMgYnkgaWQuXG5cdCAqL1xuXHRnZXRBbm5vdGF0aW9uc0NoYW5uZWxSZXNvdXJjZShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2Vuc3VyZUNoYW5uZWwoc2Vzc2lvblJlc291cmNlKT8uYW5ub3RhdGlvbnNVcmk7XG5cdH1cblxuXHRwcml2YXRlIF9oYXNTbmFwc2hvdChzdWJzY3JpcHRpb246IElBZ2VudFN1YnNjcmlwdGlvbjxBbm5vdGF0aW9uc1N0YXRlPik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHZhbHVlID0gc3Vic2NyaXB0aW9uLnZhbHVlO1xuXHRcdHJldHVybiB2YWx1ZSAhPT0gdW5kZWZpbmVkICYmICEodmFsdWUgaW5zdGFuY2VvZiBFcnJvcik7XG5cdH1cblxuXHRwcml2YXRlIF9kZWNvZGUoc3Vic2NyaXB0aW9uOiBJQWdlbnRTdWJzY3JpcHRpb248QW5ub3RhdGlvbnNTdGF0ZT4sIHNlc3Npb25SZXNvdXJjZTogVVJJKTogSUFnZW50RmVlZGJhY2tbXSB7XG5cdFx0Y29uc3QgdmFsdWUgPSBzdWJzY3JpcHRpb24udmFsdWU7XG5cdFx0aWYgKCF2YWx1ZSB8fCB2YWx1ZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGl0ZW1zOiBJQWdlbnRGZWVkYmFja1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBhbm5vdGF0aW9uIG9mIHZhbHVlLmFubm90YXRpb25zKSB7XG5cdFx0XHRjb25zdCBmZWVkYmFjayA9IGFubm90YXRpb25Ub0ZlZWRiYWNrKGFubm90YXRpb24sIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoZmVlZGJhY2spIHtcblx0XHRcdFx0aXRlbXMucHVzaChmZWVkYmFjayk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBpdGVtcztcblx0fVxuXG5cdC8qKlxuXHQgKiBGaXJlIHtAbGluayBvbkRpZENoYW5nZUl0ZW1zfSBvbmx5IHdoZW4gdGhlIHNlc3Npb24ncyBmZWVkYmFjayBzZXQgYWN0dWFsbHlcblx0ICogY2hhbmdlZC4gVGhlIGFubm90YXRpb25zIGNoYW5uZWwgaXMgZ2VuZXJpYyBhbmQgbWF5IGNhcnJ5IGFubm90YXRpb25zIGZyb21cblx0ICogb3RoZXIgZmVhdHVyZXM7IHdpdGhvdXQgdGhpcyBndWFyZCB0aGVpciBjaHVybiB3b3VsZCBidW1wIGZlZWRiYWNrIHJlY2VuY3lcblx0ICogb3JkZXJpbmcgYW5kIG5hdmlnYXRpb24gZXZlbiB0aG91Z2ggbm8gZmVlZGJhY2sgY2hhbmdlZC5cblx0ICovXG5cdHByaXZhdGUgX29uQW5ub3RhdGlvbnNDaGFuZ2Uoc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRjb25zdCBjaGFubmVsID0gdGhpcy5fY2hhbm5lbEJ5U2Vzc2lvbi5nZXQoa2V5KTtcblx0XHRpZiAoIWNoYW5uZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gRmlyZSBvbmNlIHdoZW4gdGhlIHNuYXBzaG90IGZpcnN0IGFycml2ZXMgc28gY29uc3VtZXJzIGxlYXJuIHRoYXQgdGhlXG5cdFx0Ly8gZmVlZGJhY2sgc2V0IGlzIG5vdyBhdXRob3JpdGF0aXZlLCBldmVuIGlmIGl0IGlzIGVtcHR5IChhbmQgdGh1cyBoYXNcblx0XHQvLyB0aGUgc2FtZSBcdTIwMTQgZW1wdHkgXHUyMDE0IHNpZ25hdHVyZSBhcyBiZWZvcmUgbG9hZGluZykuXG5cdFx0aWYgKHRoaXMuX2hhc1NuYXBzaG90KGNoYW5uZWwuc3Vic2NyaXB0aW9uKSAmJiAhdGhpcy5fbG9hZGVkQnlTZXNzaW9uLmhhcyhrZXkpKSB7XG5cdFx0XHR0aGlzLl9sb2FkZWRCeVNlc3Npb24uYWRkKGtleSk7XG5cdFx0XHR0aGlzLl9zaWduYXR1cmVCeVNlc3Npb24uc2V0KGtleSwgdGhpcy5fZmVlZGJhY2tTaWduYXR1cmUoY2hhbm5lbC5zdWJzY3JpcHRpb24pKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbXMuZmlyZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzaWduYXR1cmUgPSB0aGlzLl9mZWVkYmFja1NpZ25hdHVyZShjaGFubmVsLnN1YnNjcmlwdGlvbik7XG5cdFx0aWYgKHRoaXMuX3NpZ25hdHVyZUJ5U2Vzc2lvbi5nZXQoa2V5KSA9PT0gc2lnbmF0dXJlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3NpZ25hdHVyZUJ5U2Vzc2lvbi5zZXQoa2V5LCBzaWduYXR1cmUpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbXMuZmlyZShzZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgc3RhYmxlIHNpZ25hdHVyZSBvZiB0aGUgZmVlZGJhY2stYmVhcmluZyBhbm5vdGF0aW9ucyBpbiB0aGVcblx0ICogc3Vic2NyaXB0aW9uJ3MgY3VycmVudCBzbmFwc2hvdCAoc29ydGVkIGJ5IGlkKS4gRXhjbHVkZXMgYW5ub3RhdGlvbnNcblx0ICogd2l0aG91dCBmZWVkYmFjayBtZXRhZGF0YSBzbyB1bnJlbGF0ZWQgYW5ub3RhdGlvbiBhY3Rpdml0eSBvbiB0aGUgc2hhcmVkXG5cdCAqIGNoYW5uZWwgaXMgaWdub3JlZC5cblx0ICovXG5cdHByaXZhdGUgX2ZlZWRiYWNrU2lnbmF0dXJlKHN1YnNjcmlwdGlvbjogSUFnZW50U3Vic2NyaXB0aW9uPEFubm90YXRpb25zU3RhdGU+KTogc3RyaW5nIHtcblx0XHRjb25zdCB2YWx1ZSA9IHN1YnNjcmlwdGlvbi52YWx1ZTtcblx0XHRpZiAoIXZhbHVlIHx8IHZhbHVlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0Y29uc3QgZmVlZGJhY2sgPSB2YWx1ZS5hbm5vdGF0aW9uc1xuXHRcdFx0Lm1hcChhbm5vdGF0aW9uID0+ICh7IGFubm90YXRpb24sIG1ldGE6IHJlYWRGZWVkYmFja01ldGEoYW5ub3RhdGlvbikgfSkpXG5cdFx0XHQuZmlsdGVyKCh7IGFubm90YXRpb24sIG1ldGEgfSkgPT4gbWV0YSAhPT0gdW5kZWZpbmVkICYmIChhbm5vdGF0aW9uLmVudHJpZXM/Lmxlbmd0aCA/PyAwKSA+IDApXG5cdFx0XHQubWFwKCh7IGFubm90YXRpb24sIG1ldGEgfSkgPT4gKHtcblx0XHRcdFx0aWQ6IGFubm90YXRpb24uaWQsXG5cdFx0XHRcdHJlc291cmNlOiBhbm5vdGF0aW9uLnJlc291cmNlLFxuXHRcdFx0XHRyYW5nZTogYW5ub3RhdGlvbi5yYW5nZSxcblx0XHRcdFx0cmVzb2x2ZWQ6IGFubm90YXRpb24ucmVzb2x2ZWQsXG5cdFx0XHRcdGVudHJpZXM6IGFubm90YXRpb24uZW50cmllcyxcblx0XHRcdFx0bWV0YSxcblx0XHRcdH0pKVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSk7XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KGZlZWRiYWNrKTtcblx0fVxuXG5cdHByaXZhdGUgX2NhY2hlVXBzZXJ0KGZlZWRiYWNrOiBJQWdlbnRGZWVkYmFjayk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IGZlZWRiYWNrLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGxldCBpdGVtcyA9IHRoaXMuX2NhY2hlQnlTZXNzaW9uLmdldChrZXkpO1xuXHRcdGlmICghaXRlbXMpIHtcblx0XHRcdGl0ZW1zID0gW107XG5cdFx0XHR0aGlzLl9jYWNoZUJ5U2Vzc2lvbi5zZXQoa2V5LCBpdGVtcyk7XG5cdFx0fVxuXHRcdGNvbnN0IGlkeCA9IGl0ZW1zLmZpbmRJbmRleChmID0+IGYuaWQgPT09IGZlZWRiYWNrLmlkKTtcblx0XHRpZiAoaWR4ID49IDApIHtcblx0XHRcdGl0ZW1zW2lkeF0gPSBmZWVkYmFjaztcblx0XHR9IGVsc2Uge1xuXHRcdFx0aXRlbXMucHVzaChmZWVkYmFjayk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2FjaGVSZW1vdmUoc2Vzc2lvblJlc291cmNlOiBVUkksIGZlZWRiYWNrSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5fY2FjaGVCeVNlc3Npb24uZ2V0KGtleSk7XG5cdFx0aWYgKCFpdGVtcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpZHggPSBpdGVtcy5maW5kSW5kZXgoZiA9PiBmLmlkID09PSBmZWVkYmFja0lkKTtcblx0XHRpZiAoaWR4ID49IDApIHtcblx0XHRcdGl0ZW1zLnNwbGljZShpZHgsIDEpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbGVhc2VDaGFubmVsKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0dGhpcy5fY2hhbm5lbHMuZGVsZXRlQW5kRGlzcG9zZShrZXkpO1xuXHRcdHRoaXMuX2NoYW5uZWxCeVNlc3Npb24uZGVsZXRlKGtleSk7XG5cdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlQnlLZXkuZGVsZXRlKGtleSk7XG5cdFx0dGhpcy5fY2FjaGVCeVNlc3Npb24uZGVsZXRlKGtleSk7XG5cdFx0dGhpcy5fc2lnbmF0dXJlQnlTZXNzaW9uLmRlbGV0ZShrZXkpO1xuXHRcdHRoaXMuX2xvYWRlZEJ5U2Vzc2lvbi5kZWxldGUoa2V5KTtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZUNoYW5uZWwoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBJVHJhY2tlZENoYW5uZWwgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGtleSA9IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fY2hhbm5lbEJ5U2Vzc2lvbi5nZXQoa2V5KTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFzZXNzaW9uIHx8ICFpc0FnZW50SG9zdFByb3ZpZGVySWQoc2Vzc2lvbi5wcm92aWRlcklkKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXI8SUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXI+KHNlc3Npb24ucHJvdmlkZXJJZCk7XG5cdFx0aWYgKCFwcm92aWRlcj8uZ2V0RmVlZGJhY2tBbm5vdGF0aW9uc0NoYW5uZWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc29sdmVkID0gcHJvdmlkZXIuZ2V0RmVlZGJhY2tBbm5vdGF0aW9uc0NoYW5uZWwoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGlmICghcmVzb2x2ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcmVmID0gc3RvcmUuYWRkKHJlc29sdmVkLmNvbm5lY3Rpb24uZ2V0U3Vic2NyaXB0aW9uKFN0YXRlQ29tcG9uZW50cy5Bbm5vdGF0aW9ucywgcmVzb2x2ZWQuYW5ub3RhdGlvbnNVcmksIEFubm90YXRpb25zQWdlbnRGZWVkYmFja0l0ZW1zQmFja2VuZC5PV05FUikpO1xuXHRcdGNvbnN0IGNoYW5uZWw6IElUcmFja2VkQ2hhbm5lbCA9IHtcblx0XHRcdGNvbm5lY3Rpb246IHJlc29sdmVkLmNvbm5lY3Rpb24sXG5cdFx0XHRhbm5vdGF0aW9uc1VyaTogcmVzb2x2ZWQuYW5ub3RhdGlvbnNVcmksXG5cdFx0XHRzdWJzY3JpcHRpb246IHJlZi5vYmplY3QsXG5cdFx0fTtcblx0XHR0aGlzLl9zaWduYXR1cmVCeVNlc3Npb24uc2V0KGtleSwgdGhpcy5fZmVlZGJhY2tTaWduYXR1cmUocmVmLm9iamVjdCkpO1xuXHRcdGlmICh0aGlzLl9oYXNTbmFwc2hvdChyZWYub2JqZWN0KSkge1xuXHRcdFx0dGhpcy5fbG9hZGVkQnlTZXNzaW9uLmFkZChrZXkpO1xuXHRcdH1cblx0XHRzdG9yZS5hZGQocmVmLm9iamVjdC5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl9vbkFubm90YXRpb25zQ2hhbmdlKHNlc3Npb25SZXNvdXJjZSkpKTtcblxuXHRcdHRoaXMuX2NoYW5uZWxzLnNldChrZXksIHN0b3JlKTtcblx0XHR0aGlzLl9jaGFubmVsQnlTZXNzaW9uLnNldChrZXksIGNoYW5uZWwpO1xuXHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZUJ5S2V5LnNldChrZXksIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0cmV0dXJuIGNoYW5uZWw7XG5c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
