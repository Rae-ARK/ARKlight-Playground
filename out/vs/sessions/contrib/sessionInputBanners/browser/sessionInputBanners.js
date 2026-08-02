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
import * as dom from "../../../../base/browser/dom.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { autorun, derived, observableSignalFromEvent, observableValue } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { SessionStatus } from "../../../services/sessions/common/session.js";
import { IGitHubService } from "../../github/browser/githubService.js";
import { GitHubCheckStatus } from "../../github/common/types.js";
import { FIX_CI_CHECKS_COMMAND_ID, getFailedChecks, REVEAL_CI_CHECKS_COMMAND_ID } from "../../changes/browser/checksActions.js";
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedbackService } from "../../agentFeedback/browser/agentFeedbackService.js";
import { SessionInputBannerWidget } from "./sessionInputBannerWidget.js";
const STORAGE_KEY_CI_DISMISSED = "sessions.inputBanners.ci.dismissed";
const STORAGE_KEY_COMMENTS_DISMISSED = "sessions.inputBanners.comments.dismissed";
const REVIEWABLE_KINDS = /* @__PURE__ */ new Set([AgentFeedbackKind.PRReview, AgentFeedbackKind.AgentReview]);
let SessionInputBanners = class extends Disposable {
  constructor(sessionsService, gitHubService, feedbackService, commandService, storageService, instantiationService, logService) {
    super();
    this.sessionsService = sessionsService;
    this.gitHubService = gitHubService;
    this.feedbackService = feedbackService;
    this.commandService = commandService;
    this.storageService = storageService;
    this.instantiationService = instantiationService;
    this.logService = logService;
    this._ciContent = this._register(new MutableDisposable());
    this._commentsContent = this._register(new MutableDisposable());
    this._active = observableValue(this, false);
    this._debugData = observableValue(this, void 0);
    this._ciDismissed = observableValue(this, /* @__PURE__ */ new Set());
    this._commentsDismissed = observableValue(this, /* @__PURE__ */ new Set());
    /**
     * The session whose banners should be shown, or undefined when inactive or
     * while the session/chat is still in progress. Banners only surface once the
     * session has completed so they don't distract from a running agent.
     */
    this._session = derived(this, (reader) => {
      if (!this._active.read(reader)) {
        return void 0;
      }
      const session = this.sessionsService.activeSession.read(reader);
      if (!session || session.status.read(reader) !== SessionStatus.Completed) {
        return void 0;
      }
      return session;
    });
    this._ciState = derived(this, (reader) => {
      const debugData = this._debugData.read(reader);
      if (debugData) {
        return debugData.ciFailed > 0 ? { sessionId: "debug", failed: debugData.ciFailed, completed: debugData.ciFailed, pending: debugData.ciPending, debug: true } : void 0;
      }
      const session = this._session.read(reader);
      if (!session || this._ciDismissed.read(reader).has(session.sessionId)) {
        return void 0;
      }
      const ciModel = this.gitHubService.activeSessionPullRequestCIObs.read(reader);
      if (!ciModel) {
        return void 0;
      }
      if (ciModel.fixRequested.read(reader)) {
        return void 0;
      }
      const checks = ciModel.checks.read(reader);
      const failed = getFailedChecks(checks).length;
      if (failed === 0) {
        return void 0;
      }
      const completed = checks.filter((check) => check.status === GitHubCheckStatus.Completed).length;
      const pending = checks.length - completed;
      return { sessionId: session.sessionId, failed, completed, pending };
    });
    this._commentsState = derived(this, (reader) => {
      const debugData = this._debugData.read(reader);
      if (debugData) {
        const count = debugData.prFeedback + debugData.agentFeedback;
        if (count === 0) {
          return void 0;
        }
        const kind2 = debugData.prFeedback > 0 && debugData.agentFeedback > 0 ? "mixed" : debugData.prFeedback > 0 ? "pr" : "agent";
        return { sessionId: "debug", sessionResource: URI.from({ scheme: "session-chat-pills-debug", path: "/feedback" }), count, kind: kind2, firstCommentId: "debug", debug: true };
      }
      const session = this._session.read(reader);
      if (!session || this._commentsDismissed.read(reader).has(session.sessionId)) {
        return void 0;
      }
      this._feedbackChanged.read(reader);
      const created = this.feedbackService.getFeedback(session.resource).filter((item) => item.state === AgentFeedbackState.Created && REVIEWABLE_KINDS.has(item.kind));
      if (created.length === 0) {
        return void 0;
      }
      const allPR = created.every((item) => item.kind === AgentFeedbackKind.PRReview);
      const allAgent = created.every((item) => item.kind === AgentFeedbackKind.AgentReview);
      const kind = allPR ? "pr" : allAgent ? "agent" : "mixed";
      return { sessionId: session.sessionId, sessionResource: session.resource, count: created.length, kind, firstCommentId: created[0].id };
    });
    this.domNode = dom.$(".session-input-banners");
    this._ciSlot = dom.append(this.domNode, dom.$(".session-input-banner-slot"));
    this._commentsSlot = dom.append(this.domNode, dom.$(".session-input-banner-slot"));
    this._feedbackChanged = observableSignalFromEvent(this, this.feedbackService.onDidChangeFeedback);
    this._ciDismissed.set(this._readDismissed(STORAGE_KEY_CI_DISMISSED), void 0);
    this._commentsDismissed.set(this._readDismissed(STORAGE_KEY_COMMENTS_DISMISSED), void 0);
    this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, STORAGE_KEY_CI_DISMISSED, this._store)(() => {
      this._ciDismissed.set(this._readDismissed(STORAGE_KEY_CI_DISMISSED), void 0);
    }));
    this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, STORAGE_KEY_COMMENTS_DISMISSED, this._store)(() => {
      this._commentsDismissed.set(this._readDismissed(STORAGE_KEY_COMMENTS_DISMISSED), void 0);
    }));
    this._register(autorun((reader) => this._renderCIBanner(this._ciState.read(reader))));
    this._register(autorun((reader) => this._renderCommentsBanner(this._commentsState.read(reader))));
  }
  /** Marks whether the owning chat view is the active session. */
  setActive(active) {
    this._active.set(active, void 0);
  }
  setDebugData(data) {
    this._debugData.set(data, void 0);
  }
  _renderCIBanner(state) {
    const store = this._ciContent.value = new DisposableStore();
    dom.clearNode(this._ciSlot);
    if (!state) {
      return;
    }
    const failedText = state.completed === 1 ? localize("ci.oneCheckFailed", "1 check failed") : localize("ci.checksFailed", "{0} out of {1} checks failed", state.failed, state.completed);
    const text = state.pending > 0 ? localize("ci.checksFailedPending", "{0}, {1} pending", failedText, state.pending) : failedText;
    this._renderBanner(this._ciSlot, store, {
      icon: Codicon.warning,
      accent: true,
      text,
      ariaLabel: text,
      dismissTooltip: localize("ci.dismiss", "Hide for this session"),
      actions: [
        {
          label: localize("ci.fixChecks", "Fix Checks"),
          primary: true,
          run: () => state.debug ? void 0 : this._executeCommand(FIX_CI_CHECKS_COMMAND_ID)
        },
        {
          label: localize("ci.revealChecks", "Reveal"),
          run: () => {
            if (!state.debug) {
              void this._executeCommand(REVEAL_CI_CHECKS_COMMAND_ID);
            }
          }
        }
      ],
      dismiss: () => {
        if (!state.debug) {
          this._dismiss(STORAGE_KEY_CI_DISMISSED, this._ciDismissed, state.sessionId);
        }
      }
    });
  }
  _renderCommentsBanner(state) {
    const store = this._commentsContent.value = new DisposableStore();
    dom.clearNode(this._commentsSlot);
    if (!state) {
      return;
    }
    const text = this._commentsBannerText(state.kind, state.count);
    this._renderBanner(this._commentsSlot, store, {
      icon: Codicon.commentDiscussion,
      accent: false,
      text,
      ariaLabel: text,
      dismissTooltip: localize("comments.dismiss", "Hide for this session"),
      actions: [
        {
          label: localize("comments.address", "Address Comments"),
          primary: true,
          run: () => state.debug ? void 0 : this._addressComments(state.sessionResource).catch((err) => this.logService.error("[SessionInputBanners] Failed to address comments", err))
        },
        {
          label: localize("comments.reveal", "Reveal"),
          run: () => {
            if (!state.debug) {
              this._revealComment(state.sessionResource, state.firstCommentId);
            }
          }
        }
      ],
      dismiss: () => {
        if (!state.debug) {
          this._dismiss(STORAGE_KEY_COMMENTS_DISMISSED, this._commentsDismissed, state.sessionId);
        }
      }
    });
  }
  _renderBanner(container, store, banner) {
    const widget = store.add(this.instantiationService.createInstance(SessionInputBannerWidget, banner));
    container.appendChild(widget.domNode);
  }
  _commentsBannerText(kind, count) {
    switch (kind) {
      case "pr":
        return count === 1 ? localize("comments.pr.one", "1 PR comment") : localize("comments.pr.many", "{0} PR comments", count);
      case "agent":
        return count === 1 ? localize("comments.agent.one", "1 agent comment") : localize("comments.agent.many", "{0} agent comments", count);
      case "mixed":
        return count === 1 ? localize("comments.one", "1 comment") : localize("comments.many", "{0} comments", count);
    }
  }
  async _executeCommand(commandId) {
    try {
      await this.commandService.executeCommand(commandId);
    } catch (err) {
      this.logService.error("[SessionInputBanners] command failed", commandId, err);
    }
  }
  async _addressComments(sessionResource) {
    const created = this.feedbackService.getFeedback(sessionResource).filter((item) => item.state === AgentFeedbackState.Created && REVIEWABLE_KINDS.has(item.kind));
    for (const item of created) {
      this.feedbackService.acceptFeedback(sessionResource, item.id);
    }
    const submitted = await this.feedbackService.submitFeedback(sessionResource);
    if (!submitted) {
      this.logService.error("[SessionInputBanners] Failed to submit feedback for session", sessionResource.toString());
    }
  }
  _revealComment(sessionResource, commentId) {
    this.feedbackService.revealFeedback(sessionResource, commentId).catch((err) => this.logService.error("[SessionInputBanners] Failed to reveal comment", err));
  }
  _dismiss(storageKey, observable, sessionId) {
    const next = new Set(observable.get());
    next.add(sessionId);
    this.storageService.store(storageKey, JSON.stringify([...next]), StorageScope.PROFILE, StorageTarget.USER);
    observable.set(next, void 0);
  }
  _readDismissed(storageKey) {
    const raw = this.storageService.get(storageKey, StorageScope.PROFILE);
    if (!raw) {
      return /* @__PURE__ */ new Set();
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed.filter((id) => typeof id === "string")) : /* @__PURE__ */ new Set();
    } catch {
      return /* @__PURE__ */ new Set();
    }
  }
};
SessionInputBanners = __decorateClass([
  __decorateParam(0, ISessionsService),
  __decorateParam(1, IGitHubService),
  __decorateParam(2, IAgentFeedbackService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ILogService)
], SessionInputBanners);
export {
  SessionInputBanners
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbklucHV0QmFubmVycy9icm93c2VyL3Nlc3Npb25JbnB1dEJhbm5lcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCwgSU9ic2VydmFibGUsIElTZXR0YWJsZU9ic2VydmFibGUsIG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJR2l0SHViU2VydmljZSB9IGZyb20gJy4uLy4uL2dpdGh1Yi9icm93c2VyL2dpdGh1YlNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2l0SHViQ2hlY2tTdGF0dXMgfSBmcm9tICcuLi8uLi9naXRodWIvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IEZJWF9DSV9DSEVDS1NfQ09NTUFORF9JRCwgZ2V0RmFpbGVkQ2hlY2tzLCBSRVZFQUxfQ0lfQ0hFQ0tTX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi9jaGFuZ2VzL2Jyb3dzZXIvY2hlY2tzQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBZ2VudEZlZWRiYWNrS2luZCwgQWdlbnRGZWVkYmFja1N0YXRlLCBJQWdlbnRGZWVkYmFja1NlcnZpY2UgfSBmcm9tICcuLi8uLi9hZ2VudEZlZWRiYWNrL2Jyb3dzZXIvYWdlbnRGZWVkYmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJU2Vzc2lvbkNoYXRQaWxsc0RlYnVnRGF0YSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9zZXNzaW9uQ2hhdElucHV0VG9vbGJhckRlYnVnLmpzJztcbmltcG9ydCB7IElTZXNzaW9uSW5wdXRCYW5uZXIsIFNlc3Npb25JbnB1dEJhbm5lcldpZGdldCB9IGZyb20gJy4vc2Vzc2lvbklucHV0QmFubmVyV2lkZ2V0LmpzJztcblxuLyoqIFBlcnNpc3RlZCBzZXQgb2Ygc2Vzc2lvbiBpZHMgd2hvc2UgQ0kgYmFubmVyIHRoZSB1c2VyIGRpc21pc3NlZC4gKi9cbmNvbnN0IFNUT1JBR0VfS0VZX0NJX0RJU01JU1NFRCA9ICdzZXNzaW9ucy5pbnB1dEJhbm5lcnMuY2kuZGlzbWlzc2VkJztcbi8qKiBQZXJzaXN0ZWQgc2V0IG9mIHNlc3Npb24gaWRzIHdob3NlIGNvbW1lbnRzIGJhbm5lciB0aGUgdXNlciBkaXNtaXNzZWQuICovXG5jb25zdCBTVE9SQUdFX0tFWV9DT01NRU5UU19ESVNNSVNTRUQgPSAnc2Vzc2lvbnMuaW5wdXRCYW5uZXJzLmNvbW1lbnRzLmRpc21pc3NlZCc7XG5cbi8qKlxuICogRmVlZGJhY2sga2luZHMgdGhhdCBvcmlnaW5hdGUgZnJvbSBhIHJldmlldyB0aGUgdXNlciB0cmlhZ2VzIChhIHB1bGwgcmVxdWVzdFxuICogcmV2aWV3IG9yIGFuIGluLXByb2R1Y3QgY29kZSByZXZpZXcpLCBtYXRjaGluZyB0aGUgY29tbWVudHMgc3VyZmFjZWQgdG8gdGhlXG4gKiBhZ2VudCB2aWEgdGhlIGB2aWV3VW5yZXZpZXdlZENvbW1lbnRzYCB0b29sLlxuICovXG5jb25zdCBSRVZJRVdBQkxFX0tJTkRTOiBSZWFkb25seVNldDxBZ2VudEZlZWRiYWNrS2luZD4gPSBuZXcgU2V0KFtBZ2VudEZlZWRiYWNrS2luZC5QUlJldmlldywgQWdlbnRGZWVkYmFja0tpbmQuQWdlbnRSZXZpZXddKTtcblxuaW50ZXJmYWNlIElDSUJhbm5lclN0YXRlIHtcblx0cmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZhaWxlZDogbnVtYmVyO1xuXHQvKiogTnVtYmVyIG9mIGNoZWNrcyB0aGF0IGhhdmUgY29tcGxldGVkIChzdWNjZWVkZWQgb3IgZmFpbGVkKS4gKi9cblx0cmVhZG9ubHkgY29tcGxldGVkOiBudW1iZXI7XG5cdC8qKiBOdW1iZXIgb2YgY2hlY2tzIHN0aWxsIHJ1bm5pbmcgb3IgcXVldWVkLiAqL1xuXHRyZWFkb25seSBwZW5kaW5nOiBudW1iZXI7XG5cdHJlYWRvbmx5IGRlYnVnPzogdHJ1ZTtcbn1cblxuaW50ZXJmYWNlIElDb21tZW50c0Jhbm5lclN0YXRlIHtcblx0cmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBjb3VudDogbnVtYmVyO1xuXHQvKiogV2hldGhlciBhbGwgY291bnRlZCBjb21tZW50cyBhcmUgUFIgcmV2aWV3cywgYWxsIGFyZSBhZ2VudCByZXZpZXdzLCBvciBtaXhlZC4gKi9cblx0cmVhZG9ubHkga2luZDogJ3ByJyB8ICdhZ2VudCcgfCAnbWl4ZWQnO1xuXHRyZWFkb25seSBmaXJzdENvbW1lbnRJZDogc3RyaW5nO1xuXHRyZWFkb25seSBkZWJ1Zz86IHRydWU7XG59XG5cbi8qKlxuICogSG9zdHMgdGhlIGJhbm5lcnMgdGhhdCByZW5kZXIgZGlyZWN0bHkgYWJvdmUgdGhlIGFjdGl2ZSBzZXNzaW9uJ3MgY2hhdCBpbnB1dDpcbiAqIGEgQ0kgZmFpbHVyZXMgYmFubmVyIGFuZCBhIGNyZWF0ZWQtY29tbWVudHMgYmFubmVyLiBFYWNoIGJhbm5lciBjYW4gYmVcbiAqIHBlcm1hbmVudGx5IGRpc21pc3NlZCBwZXIgc2Vzc2lvbi5cbiAqXG4gKiBUaGUgaG9zdCBpcyBvd25lZCBieSB0aGUgc2Vzc2lvbidzIGNoYXQgdmlldyBhbmQgb25seSBzaG93cyBjb250ZW50IHdoaWxlXG4gKiB0aGF0IHZpZXcgaXMgdGhlIGFjdGl2ZSBzZXNzaW9uIChkcml2ZW4gdmlhIHtAbGluayBzZXRBY3RpdmV9KTsgdGhlIENJIG1vZGVsXG4gKiBhbmQgZmVlZGJhY2sgYXJlIHJlYWQgZm9yIHRoZSBhY3RpdmUgc2Vzc2lvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIFNlc3Npb25JbnB1dEJhbm5lcnMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jaVNsb3Q6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tZW50c1Nsb3Q6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NpQ29udGVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tZW50c0NvbnRlbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmUgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4odGhpcywgZmFsc2UpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWJ1Z0RhdGEgPSBvYnNlcnZhYmxlVmFsdWU8SVNlc3Npb25DaGF0UGlsbHNEZWJ1Z0RhdGEgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2lEaXNtaXNzZWQgPSBvYnNlcnZhYmxlVmFsdWU8UmVhZG9ubHlTZXQ8c3RyaW5nPj4odGhpcywgbmV3IFNldCgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWVudHNEaXNtaXNzZWQgPSBvYnNlcnZhYmxlVmFsdWU8UmVhZG9ubHlTZXQ8c3RyaW5nPj4odGhpcywgbmV3IFNldCgpKTtcblxuXHRwcml2YXRlIF9mZWVkYmFja0NoYW5nZWQhOiBJT2JzZXJ2YWJsZTx2b2lkPjtcblxuXHQvKipcblx0ICogVGhlIHNlc3Npb24gd2hvc2UgYmFubmVycyBzaG91bGQgYmUgc2hvd24sIG9yIHVuZGVmaW5lZCB3aGVuIGluYWN0aXZlIG9yXG5cdCAqIHdoaWxlIHRoZSBzZXNzaW9uL2NoYXQgaXMgc3RpbGwgaW4gcHJvZ3Jlc3MuIEJhbm5lcnMgb25seSBzdXJmYWNlIG9uY2UgdGhlXG5cdCAqIHNlc3Npb24gaGFzIGNvbXBsZXRlZCBzbyB0aGV5IGRvbid0IGRpc3RyYWN0IGZyb20gYSBydW5uaW5nIGFnZW50LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbiA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRpZiAoIXRoaXMuX2FjdGl2ZS5yZWFkKHJlYWRlcikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXNlc3Npb24gfHwgc2Vzc2lvbi5zdGF0dXMucmVhZChyZWFkZXIpICE9PSBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NpU3RhdGU6IElPYnNlcnZhYmxlPElDSUJhbm5lclN0YXRlIHwgdW5kZWZpbmVkPiA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCBkZWJ1Z0RhdGEgPSB0aGlzLl9kZWJ1Z0RhdGEucmVhZChyZWFkZXIpO1xuXHRcdGlmIChkZWJ1Z0RhdGEpIHtcblx0XHRcdHJldHVybiBkZWJ1Z0RhdGEuY2lGYWlsZWQgPiAwXG5cdFx0XHRcdD8geyBzZXNzaW9uSWQ6ICdkZWJ1ZycsIGZhaWxlZDogZGVidWdEYXRhLmNpRmFpbGVkLCBjb21wbGV0ZWQ6IGRlYnVnRGF0YS5jaUZhaWxlZCwgcGVuZGluZzogZGVidWdEYXRhLmNpUGVuZGluZywgZGVidWc6IHRydWUgfVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdGlmICghc2Vzc2lvbiB8fCB0aGlzLl9jaURpc21pc3NlZC5yZWFkKHJlYWRlcikuaGFzKHNlc3Npb24uc2Vzc2lvbklkKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgY2lNb2RlbCA9IHRoaXMuZ2l0SHViU2VydmljZS5hY3RpdmVTZXNzaW9uUHVsbFJlcXVlc3RDSU9icy5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFjaU1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBPbmNlIHRoZSB1c2VyIGhhcyByZXF1ZXN0ZWQgYSBDSSBmaXggZm9yIHRoZSBjdXJyZW50IFBSIGhlYWQgY29tbWl0LFxuXHRcdC8vIGhpZGUgdGhlIGVudGlyZSBiYW5uZXIgdW50aWwgYSBuZXcgY29tbWl0IGxhbmRzIG9uIHRoZSBQUi5cblx0XHRpZiAoY2lNb2RlbC5maXhSZXF1ZXN0ZWQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBjaGVja3MgPSBjaU1vZGVsLmNoZWNrcy5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgZmFpbGVkID0gZ2V0RmFpbGVkQ2hlY2tzKGNoZWNrcykubGVuZ3RoO1xuXHRcdGlmIChmYWlsZWQgPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbXBsZXRlZCA9IGNoZWNrcy5maWx0ZXIoY2hlY2sgPT4gY2hlY2suc3RhdHVzID09PSBHaXRIdWJDaGVja1N0YXR1cy5Db21wbGV0ZWQpLmxlbmd0aDtcblx0XHRjb25zdCBwZW5kaW5nID0gY2hlY2tzLmxlbmd0aCAtIGNvbXBsZXRlZDtcblx0XHRyZXR1cm4geyBzZXNzaW9uSWQ6IHNlc3Npb24uc2Vzc2lvbklkLCBmYWlsZWQsIGNvbXBsZXRlZCwgcGVuZGluZyB9O1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tZW50c1N0YXRlOiBJT2JzZXJ2YWJsZTxJQ29tbWVudHNCYW5uZXJTdGF0ZSB8IHVuZGVmaW5lZD4gPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgZGVidWdEYXRhID0gdGhpcy5fZGVidWdEYXRhLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoZGVidWdEYXRhKSB7XG5cdFx0XHRjb25zdCBjb3VudCA9IGRlYnVnRGF0YS5wckZlZWRiYWNrICsgZGVidWdEYXRhLmFnZW50RmVlZGJhY2s7XG5cdFx0XHRpZiAoY291bnQgPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGtpbmQgPSBkZWJ1Z0RhdGEucHJGZWVkYmFjayA+IDAgJiYgZGVidWdEYXRhLmFnZW50RmVlZGJhY2sgPiAwXG5cdFx0XHRcdD8gJ21peGVkJ1xuXHRcdFx0XHQ6IGRlYnVnRGF0YS5wckZlZWRiYWNrID4gMCA/ICdwcicgOiAnYWdlbnQnO1xuXHRcdFx0cmV0dXJuIHsgc2Vzc2lvbklkOiAnZGVidWcnLCBzZXNzaW9uUmVzb3VyY2U6IFVSSS5mcm9tKHsgc2NoZW1lOiAnc2Vzc2lvbi1jaGF0LXBpbGxzLWRlYnVnJywgcGF0aDogJy9mZWVkYmFjaycgfSksIGNvdW50LCBraW5kLCBmaXJzdENvbW1lbnRJZDogJ2RlYnVnJywgZGVidWc6IHRydWUgfTtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdGlmICghc2Vzc2lvbiB8fCB0aGlzLl9jb21tZW50c0Rpc21pc3NlZC5yZWFkKHJlYWRlcikuaGFzKHNlc3Npb24uc2Vzc2lvbklkKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fZmVlZGJhY2tDaGFuZ2VkLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBjcmVhdGVkID0gdGhpcy5mZWVkYmFja1NlcnZpY2UuZ2V0RmVlZGJhY2soc2Vzc2lvbi5yZXNvdXJjZSlcblx0XHRcdC5maWx0ZXIoaXRlbSA9PiBpdGVtLnN0YXRlID09PSBBZ2VudEZlZWRiYWNrU3RhdGUuQ3JlYXRlZCAmJiBSRVZJRVdBQkxFX0tJTkRTLmhhcyhpdGVtLmtpbmQpKTtcblx0XHRpZiAoY3JlYXRlZC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGFsbFBSID0gY3JlYXRlZC5ldmVyeShpdGVtID0+IGl0ZW0ua2luZCA9PT0gQWdlbnRGZWVkYmFja0tpbmQuUFJSZXZpZXcpO1xuXHRcdGNvbnN0IGFsbEFnZW50ID0gY3JlYXRlZC5ldmVyeShpdGVtID0+IGl0ZW0ua2luZCA9PT0gQWdlbnRGZWVkYmFja0tpbmQuQWdlbnRSZXZpZXcpO1xuXHRcdGNvbnN0IGtpbmQgPSBhbGxQUiA/ICdwcicgOiBhbGxBZ2VudCA/ICdhZ2VudCcgOiAnbWl4ZWQnO1xuXHRcdHJldHVybiB7IHNlc3Npb25JZDogc2Vzc2lvbi5zZXNzaW9uSWQsIHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbi5yZXNvdXJjZSwgY291bnQ6IGNyZWF0ZWQubGVuZ3RoLCBraW5kLCBmaXJzdENvbW1lbnRJZDogY3JlYXRlZFswXS5pZCB9O1xuXHR9KTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASUdpdEh1YlNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBnaXRIdWJTZXJ2aWNlOiBJR2l0SHViU2VydmljZSxcblx0XHRASUFnZW50RmVlZGJhY2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmVlZGJhY2tTZXJ2aWNlOiBJQWdlbnRGZWVkYmFja1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBkb20uJCgnLnNlc3Npb24taW5wdXQtYmFubmVycycpO1xuXHRcdHRoaXMuX2NpU2xvdCA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBkb20uJCgnLnNlc3Npb24taW5wdXQtYmFubmVyLXNsb3QnKSk7XG5cdFx0dGhpcy5fY29tbWVudHNTbG90ID0gZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGUsIGRvbS4kKCcuc2Vzc2lvbi1pbnB1dC1iYW5uZXItc2xvdCcpKTtcblxuXHRcdHRoaXMuX2ZlZWRiYWNrQ2hhbmdlZCA9IG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQodGhpcywgdGhpcy5mZWVkYmFja1NlcnZpY2Uub25EaWRDaGFuZ2VGZWVkYmFjayk7XG5cblx0XHQvLyBMb2FkIHBlcnNpc3RlZCBkaXNtaXNzYWwgc3RhdGUgYW5kIGtlZXAgaXQgaW4gc3luYyB3aXRoIG90aGVyIHdpbmRvd3MvcHJvZmlsZXMuXG5cdFx0dGhpcy5fY2lEaXNtaXNzZWQuc2V0KHRoaXMuX3JlYWREaXNtaXNzZWQoU1RPUkFHRV9LRVlfQ0lfRElTTUlTU0VEKSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9jb21tZW50c0Rpc21pc3NlZC5zZXQodGhpcy5fcmVhZERpc21pc3NlZChTVE9SQUdFX0tFWV9DT01NRU5UU19ESVNNSVNTRUQpLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuUFJPRklMRSwgU1RPUkFHRV9LRVlfQ0lfRElTTUlTU0VELCB0aGlzLl9zdG9yZSkoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY2lEaXNtaXNzZWQuc2V0KHRoaXMuX3JlYWREaXNtaXNzZWQoU1RPUkFHRV9LRVlfQ0lfRElTTUlTU0VEKSwgdW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTVE9SQUdFX0tFWV9DT01NRU5UU19ESVNNSVNTRUQsIHRoaXMuX3N0b3JlKSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb21tZW50c0Rpc21pc3NlZC5zZXQodGhpcy5fcmVhZERpc21pc3NlZChTVE9SQUdFX0tFWV9DT01NRU5UU19ESVNNSVNTRUQpLCB1bmRlZmluZWQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHRoaXMuX3JlbmRlckNJQmFubmVyKHRoaXMuX2NpU3RhdGUucmVhZChyZWFkZXIpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHRoaXMuX3JlbmRlckNvbW1lbnRzQmFubmVyKHRoaXMuX2NvbW1lbnRzU3RhdGUucmVhZChyZWFkZXIpKSkpO1xuXHR9XG5cblx0LyoqIE1hcmtzIHdoZXRoZXIgdGhlIG93bmluZyBjaGF0IHZpZXcgaXMgdGhlIGFjdGl2ZSBzZXNzaW9uLiAqL1xuXHRzZXRBY3RpdmUoYWN0aXZlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZlLnNldChhY3RpdmUsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXREZWJ1Z0RhdGEoZGF0YTogSVNlc3Npb25DaGF0UGlsbHNEZWJ1Z0RhdGEgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9kZWJ1Z0RhdGEuc2V0KGRhdGEsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJDSUJhbm5lcihzdGF0ZTogSUNJQmFubmVyU3RhdGUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZSA9IHRoaXMuX2NpQ29udGVudC52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuX2NpU2xvdCk7XG5cdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZhaWxlZFRleHQgPSBzdGF0ZS5jb21wbGV0ZWQgPT09IDFcblx0XHRcdD8gbG9jYWxpemUoJ2NpLm9uZUNoZWNrRmFpbGVkJywgXCIxIGNoZWNrIGZhaWxlZFwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2kuY2hlY2tzRmFpbGVkJywgXCJ7MH0gb3V0IG9mIHsxfSBjaGVja3MgZmFpbGVkXCIsIHN0YXRlLmZhaWxlZCwgc3RhdGUuY29tcGxldGVkKTtcblx0XHRjb25zdCB0ZXh0ID0gc3RhdGUucGVuZGluZyA+IDBcblx0XHRcdD8gbG9jYWxpemUoJ2NpLmNoZWNrc0ZhaWxlZFBlbmRpbmcnLCBcInswfSwgezF9IHBlbmRpbmdcIiwgZmFpbGVkVGV4dCwgc3RhdGUucGVuZGluZylcblx0XHRcdDogZmFpbGVkVGV4dDtcblxuXHRcdHRoaXMuX3JlbmRlckJhbm5lcih0aGlzLl9jaVNsb3QsIHN0b3JlLCB7XG5cdFx0XHRpY29uOiBDb2RpY29uLndhcm5pbmcsXG5cdFx0XHRhY2NlbnQ6IHRydWUsXG5cdFx0XHR0ZXh0LFxuXHRcdFx0YXJpYUxhYmVsOiB0ZXh0LFxuXHRcdFx0ZGlzbWlzc1Rvb2x0aXA6IGxvY2FsaXplKCdjaS5kaXNtaXNzJywgXCJIaWRlIGZvciB0aGlzIHNlc3Npb25cIiksXG5cdFx0XHRhY3Rpb25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NpLmZpeENoZWNrcycsIFwiRml4IENoZWNrc1wiKSxcblx0XHRcdFx0XHRwcmltYXJ5OiB0cnVlLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gc3RhdGUuZGVidWcgPyB1bmRlZmluZWQgOiB0aGlzLl9leGVjdXRlQ29tbWFuZChGSVhfQ0lfQ0hFQ0tTX0NPTU1BTkRfSUQpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaS5yZXZlYWxDaGVja3MnLCBcIlJldmVhbFwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHsgaWYgKCFzdGF0ZS5kZWJ1ZykgeyB2b2lkIHRoaXMuX2V4ZWN1dGVDb21tYW5kKFJFVkVBTF9DSV9DSEVDS1NfQ09NTUFORF9JRCk7IH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0XHRkaXNtaXNzOiAoKSA9PiB7IGlmICghc3RhdGUuZGVidWcpIHsgdGhpcy5fZGlzbWlzcyhTVE9SQUdFX0tFWV9DSV9ESVNNSVNTRUQsIHRoaXMuX2NpRGlzbWlzc2VkLCBzdGF0ZS5zZXNzaW9uSWQpOyB9IH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJDb21tZW50c0Jhbm5lcihzdGF0ZTogSUNvbW1lbnRzQmFubmVyU3RhdGUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZSA9IHRoaXMuX2NvbW1lbnRzQ29udGVudC52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuX2NvbW1lbnRzU2xvdCk7XG5cdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRleHQgPSB0aGlzLl9jb21tZW50c0Jhbm5lclRleHQoc3RhdGUua2luZCwgc3RhdGUuY291bnQpO1xuXG5cdFx0dGhpcy5fcmVuZGVyQmFubmVyKHRoaXMuX2NvbW1lbnRzU2xvdCwgc3RvcmUsIHtcblx0XHRcdGljb246IENvZGljb24uY29tbWVudERpc2N1c3Npb24sXG5cdFx0XHRhY2NlbnQ6IGZhbHNlLFxuXHRcdFx0dGV4dCxcblx0XHRcdGFyaWFMYWJlbDogdGV4dCxcblx0XHRcdGRpc21pc3NUb29sdGlwOiBsb2NhbGl6ZSgnY29tbWVudHMuZGlzbWlzcycsIFwiSGlkZSBmb3IgdGhpcyBzZXNzaW9uXCIpLFxuXHRcdFx0YWN0aW9uczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjb21tZW50cy5hZGRyZXNzJywgXCJBZGRyZXNzIENvbW1lbnRzXCIpLFxuXHRcdFx0XHRcdHByaW1hcnk6IHRydWUsXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBzdGF0ZS5kZWJ1ZyA/IHVuZGVmaW5lZCA6IHRoaXMuX2FkZHJlc3NDb21tZW50cyhzdGF0ZS5zZXNzaW9uUmVzb3VyY2UpLmNhdGNoKGVyciA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tTZXNzaW9uSW5wdXRCYW5uZXJzXSBGYWlsZWQgdG8gYWRkcmVzcyBjb21tZW50cycsIGVycikpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjb21tZW50cy5yZXZlYWwnLCBcIlJldmVhbFwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHsgaWYgKCFzdGF0ZS5kZWJ1ZykgeyB0aGlzLl9yZXZlYWxDb21tZW50KHN0YXRlLnNlc3Npb25SZXNvdXJjZSwgc3RhdGUuZmlyc3RDb21tZW50SWQpOyB9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0ZGlzbWlzczogKCkgPT4geyBpZiAoIXN0YXRlLmRlYnVnKSB7IHRoaXMuX2Rpc21pc3MoU1RPUkFHRV9LRVlfQ09NTUVOVFNfRElTTUlTU0VELCB0aGlzLl9jb21tZW50c0Rpc21pc3NlZCwgc3RhdGUuc2Vzc2lvbklkKTsgfSB9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyQmFubmVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsIGJhbm5lcjogSVNlc3Npb25JbnB1dEJhbm5lcik6IHZvaWQge1xuXHRcdGNvbnN0IHdpZGdldCA9IHN0b3JlLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25JbnB1dEJhbm5lcldpZGdldCwgYmFubmVyKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHdpZGdldC5kb21Ob2RlKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbW1lbnRzQmFubmVyVGV4dChraW5kOiAncHInIHwgJ2FnZW50JyB8ICdtaXhlZCcsIGNvdW50OiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAoa2luZCkge1xuXHRcdFx0Y2FzZSAncHInOlxuXHRcdFx0XHRyZXR1cm4gY291bnQgPT09IDFcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjb21tZW50cy5wci5vbmUnLCBcIjEgUFIgY29tbWVudFwiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2NvbW1lbnRzLnByLm1hbnknLCBcInswfSBQUiBjb21tZW50c1wiLCBjb3VudCk7XG5cdFx0XHRjYXNlICdhZ2VudCc6XG5cdFx0XHRcdHJldHVybiBjb3VudCA9PT0gMVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NvbW1lbnRzLmFnZW50Lm9uZScsIFwiMSBhZ2VudCBjb21tZW50XCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY29tbWVudHMuYWdlbnQubWFueScsIFwiezB9IGFnZW50IGNvbW1lbnRzXCIsIGNvdW50KTtcblx0XHRcdGNhc2UgJ21peGVkJzpcblx0XHRcdFx0cmV0dXJuIGNvdW50ID09PSAxXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY29tbWVudHMub25lJywgXCIxIGNvbW1lbnRcIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjb21tZW50cy5tYW55JywgXCJ7MH0gY29tbWVudHNcIiwgY291bnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2V4ZWN1dGVDb21tYW5kKGNvbW1hbmRJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZElkKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW1Nlc3Npb25JbnB1dEJhbm5lcnNdIGNvbW1hbmQgZmFpbGVkJywgY29tbWFuZElkLCBlcnIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FkZHJlc3NDb21tZW50cyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIEFjY2VwdCB0aGUgcmV2aWV3YWJsZSBjb21tZW50cyBzdXJmYWNlZCBpbiB0aGUgYmFubmVyIHNvIHRoZXkgYmVjb21lXG5cdFx0Ly8gYXR0YWNoYWJsZSBmZWVkYmFjaywgdGhlbiBzdWJtaXQgdGhlbSB0byB0aGUgYWdlbnQuIFRoaXMgbWlycm9ycyB0aGVcblx0XHQvLyBhZ2VudCBmZWVkYmFjayBlZGl0b3Igb3ZlcmxheSdzIFN1Ym1pdCBidXR0b246IHJhdGhlciB0aGFuIHNlbmRpbmcgYVxuXHRcdC8vIGJhcmUgYC9hY3Qtb24tZmVlZGJhY2tgIGNvbW1hbmQsIHRoZSBhY2NlcHRlZCBmZWVkYmFjayBpdGVtcyBhcmVcblx0XHQvLyBhdHRhY2hlZCB0byB0aGUgcmVxdWVzdCBzbyB0aGUgYWdlbnQgcmVjZWl2ZXMgdGhlIGNvbW1lbnRzLlxuXHRcdGNvbnN0IGNyZWF0ZWQgPSB0aGlzLmZlZWRiYWNrU2VydmljZS5nZXRGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2UpXG5cdFx0XHQuZmlsdGVyKGl0ZW0gPT4gaXRlbS5zdGF0ZSA9PT0gQWdlbnRGZWVkYmFja1N0YXRlLkNyZWF0ZWQgJiYgUkVWSUVXQUJMRV9LSU5EUy5oYXMoaXRlbS5raW5kKSk7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGNyZWF0ZWQpIHtcblx0XHRcdHRoaXMuZmVlZGJhY2tTZXJ2aWNlLmFjY2VwdEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZSwgaXRlbS5pZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3VibWl0dGVkID0gYXdhaXQgdGhpcy5mZWVkYmFja1NlcnZpY2Uuc3VibWl0RmVlZGJhY2soc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXN1Ym1pdHRlZCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbU2Vzc2lvbklucHV0QmFubmVyc10gRmFpbGVkIHRvIHN1Ym1pdCBmZWVkYmFjayBmb3Igc2Vzc2lvbicsIHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXZlYWxDb21tZW50KHNlc3Npb25SZXNvdXJjZTogVVJJLCBjb21tZW50SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuZmVlZGJhY2tTZXJ2aWNlLnJldmVhbEZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZSwgY29tbWVudElkKS5jYXRjaChlcnIgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbU2Vzc2lvbklucHV0QmFubmVyc10gRmFpbGVkIHRvIHJldmVhbCBjb21tZW50JywgZXJyKSk7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNtaXNzKHN0b3JhZ2VLZXk6IHN0cmluZywgb2JzZXJ2YWJsZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxSZWFkb25seVNldDxzdHJpbmc+Piwgc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBuZXh0ID0gbmV3IFNldChvYnNlcnZhYmxlLmdldCgpKTtcblx0XHRuZXh0LmFkZChzZXNzaW9uSWQpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkoWy4uLm5leHRdKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0b2JzZXJ2YWJsZS5zZXQobmV4dCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlYWREaXNtaXNzZWQoc3RvcmFnZUtleTogc3RyaW5nKTogUmVhZG9ubHlTZXQ8c3RyaW5nPiB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoc3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdGlmICghcmF3KSB7XG5cdFx0XHRyZXR1cm4gbmV3IFNldCgpO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkocGFyc2VkKSA/IG5ldyBTZXQocGFyc2VkLmZpbHRlcigoaWQpOiBpZCBpcyBzdHJpbmcgPT4gdHlwZW9mIGlkID09PSAnc3RyaW5nJykpIDogbmV3IFNldCgpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIG5ldyBTZXQoKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksaUJBQWlCLHlCQUF5QjtBQUMvRCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxTQUFTLFNBQTJDLDJCQUEyQix1QkFBdUI7QUFDL0csU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FB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
