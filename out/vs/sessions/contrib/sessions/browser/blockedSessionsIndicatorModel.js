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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { autorun, derived, observableValue } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { AgentSessionApprovalKind, AgentSessionApprovalModel, agentSessionApprovalId } from "../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { BlockedSessionReason, BlockedSessions } from "../../blockedSessions/browser/blockedSessions.js";
import { BlockedSessionsCIFixModel } from "./blockedSessionsCIFixModel.js";
import { getFirstApprovalAcrossChats } from "./views/sessionsList.js";
var RequiresInputKind = /* @__PURE__ */ ((RequiresInputKind2) => {
  RequiresInputKind2[RequiresInputKind2["TerminalApproval"] = 0] = "TerminalApproval";
  RequiresInputKind2[RequiresInputKind2["Question"] = 1] = "Question";
  RequiresInputKind2[RequiresInputKind2["FailingCI"] = 2] = "FailingCI";
  return RequiresInputKind2;
})(RequiresInputKind || {});
let BlockedSessionsIndicatorModel = class extends Disposable {
  constructor(approvalModel, blockedSessions, ciFixModel, _sessionsService, instantiationService, productService) {
    super();
    this._sessionsService = _sessionsService;
    /** Current blocked occurrences the user has already acknowledged, keyed by session id. */
    this._ignoredBlockOccurrences = observableValue("ignoredBlockOccurrences", /* @__PURE__ */ new Map());
    /**
     * Latest blocked occurrence per session, independent of visibility. Used so the
     * attention blink only fires for a genuinely new input request or CI failure.
     */
    this._lastBlockedOccurrences = /* @__PURE__ */ new Map();
    /**
     * Not-yet-visible blocked occurrences whose attention blink has not played yet.
     */
    this._pendingBlinkOccurrences = /* @__PURE__ */ new Map();
    this._onDidRequestBlink = this._register(new Emitter());
    /**
     * Fires when a genuinely new, not-yet-visible session becomes blocked and the
     * indicator should play its attention blink. Consumers should re-render and
     * call {@link consumePendingBlink}.
     */
    this.onDidRequestBlink = this._onDidRequestBlink.event;
    this._approvalModel = approvalModel ?? this._register(instantiationService.createInstance(AgentSessionApprovalModel));
    this._blockedSessionsModel = blockedSessions ?? this._register(instantiationService.createInstance(BlockedSessions));
    this._ciFixModel = ciFixModel ?? this._register(instantiationService.createInstance(BlockedSessionsCIFixModel));
    const enabled = productService.quality !== "stable";
    this.blockedSessions = derived(this, (reader) => {
      if (!enabled) {
        return [];
      }
      const visibleSessionIds = /* @__PURE__ */ new Set();
      for (const session of this._sessionsService.visibleSessions.read(reader)) {
        if (session) {
          visibleSessionIds.add(session.sessionId);
        }
      }
      const ignoredOccurrences = this._ignoredBlockOccurrences.read(reader);
      const ciFixHidden = this._ciFixModel.hiddenSessions.read(reader);
      return this._blockedSessionsModel.blockedSessionsWithReasons.read(reader).filter((blocked) => !visibleSessionIds.has(blocked.session.sessionId) && !ciFixHidden.has(blocked.session.sessionId) && !this._isBlockIgnored(blocked, ignoredOccurrences, reader));
    });
    this.requiresInputKind = derived(this, (reader) => {
      const blocked = this.blockedSessions.read(reader);
      if (blocked.length === 0) {
        return void 0;
      }
      let common;
      let hasCommon = false;
      for (const entry of blocked) {
        const kind = this._kindOf(entry, reader);
        if (kind === void 0) {
          return void 0;
        }
        if (!hasCommon) {
          common = kind;
          hasCommon = true;
        } else if (common !== kind) {
          return void 0;
        }
      }
      return common;
    });
    this._register(autorun((reader) => {
      if (!enabled) {
        return;
      }
      const blockedSessions2 = this._blockedSessionsModel.blockedSessionsWithReasons.read(reader);
      const blockedById = new Map(blockedSessions2.map((entry) => [entry.session.sessionId, entry]));
      const visibleSessionIds = new Set(this._sessionsService.visibleSessions.read(reader).filter((session) => session !== void 0).map((session) => session.sessionId));
      const ignoredOccurrences = this._ignoredBlockOccurrences.read(reader);
      const next = new Map(ignoredOccurrences);
      let changed = false;
      for (const [sessionId, ignoredOccurrence] of ignoredOccurrences) {
        const blockedSession = blockedById.get(sessionId);
        if (!blockedSession || this._getBlockOccurrenceId(blockedSession, reader, ignoredOccurrence) !== ignoredOccurrence) {
          next.delete(sessionId);
          changed = true;
        }
      }
      for (const blockedSession of blockedById.values()) {
        if (!visibleSessionIds.has(blockedSession.session.sessionId)) {
          continue;
        }
        const occurrenceId = this._getBlockOccurrenceId(blockedSession, reader, next.get(blockedSession.session.sessionId));
        if (next.get(blockedSession.session.sessionId) !== occurrenceId) {
          next.set(blockedSession.session.sessionId, occurrenceId);
          changed = true;
        }
      }
      if (changed) {
        this._ignoredBlockOccurrences.set(next, void 0);
      }
    }));
    this._register(autorun((reader) => {
      if (!enabled) {
        return;
      }
      const ignoredOccurrences = this._ignoredBlockOccurrences.read(reader);
      const modelBlocked = this._blockedSessionsModel.blockedSessionsWithReasons.read(reader);
      const currentOccurrences = new Map(modelBlocked.map((blocked) => [
        blocked.session.sessionId,
        this._getBlockOccurrenceId(blocked, reader, ignoredOccurrences.get(blocked.session.sessionId))
      ]));
      const previousOccurrences = this._lastBlockedOccurrences;
      this._lastBlockedOccurrences = currentOccurrences;
      const visibleSessionIds = /* @__PURE__ */ new Set();
      for (const session of this._sessionsService.visibleSessions.read(reader)) {
        if (session) {
          visibleSessionIds.add(session.sessionId);
        }
      }
      for (const [sessionId, occurrenceId] of this._pendingBlinkOccurrences) {
        if (currentOccurrences.get(sessionId) !== occurrenceId || visibleSessionIds.has(sessionId)) {
          this._pendingBlinkOccurrences.delete(sessionId);
        }
      }
      let queued = false;
      for (const blocked of modelBlocked) {
        const sessionId = blocked.session.sessionId;
        const occurrenceId = currentOccurrences.get(sessionId);
        if (previousOccurrences.get(sessionId) !== occurrenceId && !visibleSessionIds.has(sessionId)) {
          this._pendingBlinkOccurrences.set(sessionId, occurrenceId);
          queued = true;
        }
      }
      if (queued) {
        this._onDidRequestBlink.fire();
      }
    }));
  }
  /** The approval model, shared with the dropdown list so both agree on each session's pending action. */
  get approvalModel() {
    return this._approvalModel;
  }
  /** The CI-fix model, shared with the dropdown list so the fix action and the hide-while-fixing agree. */
  get ciFixModel() {
    return this._ciFixModel;
  }
  /**
   * Whether a fresh attention blink is pending. Returns `true` only when a session
   * queued as newly blocked is still in the surfaced (visible-filtered) blocked set,
   * so a blink queued while the pill was suppressed can't fire for a session that has
   * since become visible or unblocked. The pending queue is cleared as it is read so
   * a subsequent render won't replay the animation.
   */
  consumePendingBlink() {
    if (this._pendingBlinkOccurrences.size === 0) {
      return false;
    }
    const ignoredOccurrences = this._ignoredBlockOccurrences.get();
    const surfacedOccurrences = new Map(this.blockedSessions.get().map((blocked) => [
      blocked.session.sessionId,
      this._getBlockOccurrenceId(blocked, void 0, ignoredOccurrences.get(blocked.session.sessionId))
    ]));
    let shouldBlink = false;
    for (const [sessionId, occurrenceId] of this._pendingBlinkOccurrences) {
      if (surfacedOccurrences.get(sessionId) === occurrenceId) {
        shouldBlink = true;
        break;
      }
    }
    this._pendingBlinkOccurrences.clear();
    return shouldBlink;
  }
  /** Ignore this session's current blocked occurrence. */
  ignoreSession(session) {
    const blocked = this._blockedSessionsModel.blockedSessionsWithReasons.get().find((entry) => entry.session.sessionId === session.sessionId);
    if (!blocked) {
      return;
    }
    this._ignoreOccurrence(blocked, this._getBlockOccurrenceId(blocked, void 0, this._ignoredBlockOccurrences.get().get(session.sessionId)));
  }
  /** Ignore every blocked occurrence currently surfaced by the indicator. */
  ignoreAllSessions() {
    const blockedSessions = this.blockedSessions.get();
    if (blockedSessions.length === 0) {
      return;
    }
    const next = new Map(this._ignoredBlockOccurrences.get());
    for (const blocked of blockedSessions) {
      next.set(blocked.session.sessionId, this._getBlockOccurrenceId(blocked, void 0, next.get(blocked.session.sessionId)));
    }
    this._ignoredBlockOccurrences.set(next, void 0);
  }
  /**
   * Remember that the user allowed this exact approval so the session drops out of
   * the blocked set immediately.
   */
  dismissApproval(approved) {
    const blocked = this._blockedSessionsModel.blockedSessionsWithReasons.get().find((entry) => entry.session.sessionId === approved.session.sessionId);
    if (!blocked || blocked.reason !== BlockedSessionReason.NeedsInput) {
      return;
    }
    this._ignoreOccurrence(blocked, this._approvalOccurrenceId(blocked, approved.approvalId));
  }
  /**
   * Build the requires-input pill label. A homogeneous set of blocked sessions
   * gets a specific, more actionable message; a mix (or an unclassified session)
   * falls back to the generic "N sessions require input".
   */
  getRequiresInputLabel(count, kind) {
    switch (kind) {
      case 0 /* TerminalApproval */:
        return count === 1 ? localize("oneSessionTerminalApproval", "1 session requires terminal approval") : localize("nSessionsTerminalApproval", "{0} sessions require terminal approval", count);
      case 1 /* Question */:
        return count === 1 ? localize("oneSessionQuestion", "1 session has a question") : localize("nSessionsQuestion", "{0} sessions have questions", count);
      case 2 /* FailingCI */:
        return count === 1 ? localize("oneSessionFailingCI", "1 session is failing CI") : localize("nSessionsFailingCI", "{0} sessions are failing CI", count);
      default:
        return count === 1 ? localize("oneSessionRequiresInput", "1 session requires input") : localize("nSessionsRequireInput", "{0} sessions require input", count);
    }
  }
  _ignoreOccurrence(blocked, occurrenceId) {
    const next = new Map(this._ignoredBlockOccurrences.get());
    next.set(blocked.session.sessionId, occurrenceId);
    this._ignoredBlockOccurrences.set(next, void 0);
  }
  _isBlockIgnored(blocked, ignoredOccurrences, reader) {
    const ignoredOccurrence = ignoredOccurrences.get(blocked.session.sessionId);
    return ignoredOccurrence !== void 0 && this._getBlockOccurrenceId(blocked, reader, ignoredOccurrence) === ignoredOccurrence;
  }
  _getBlockOccurrenceId(blocked, reader, ignoredOccurrence) {
    if (blocked.reason !== BlockedSessionReason.NeedsInput) {
      return blocked.occurrenceId;
    }
    const approval = getFirstApprovalAcrossChats(this._approvalModel, blocked.session, reader);
    if (approval) {
      return this._approvalOccurrenceId(blocked, agentSessionApprovalId(approval));
    }
    const approvalPrefix = this._approvalOccurrenceId(blocked, "");
    return ignoredOccurrence?.startsWith(approvalPrefix) ? ignoredOccurrence : blocked.occurrenceId;
  }
  _approvalOccurrenceId(blocked, approvalId) {
    return `${blocked.occurrenceId}:approval:${approvalId}`;
  }
  /**
   * Classify a single blocked session into a specific requires-input kind, or
   * `undefined` when it can't be classified (which forces the generic message).
   */
  _kindOf(blocked, reader) {
    switch (blocked.reason) {
      case BlockedSessionReason.FailingCI:
        return 2 /* FailingCI */;
      case BlockedSessionReason.NeedsInput: {
        const approval = getFirstApprovalAcrossChats(this._approvalModel, blocked.session, reader);
        switch (approval?.kind) {
          case AgentSessionApprovalKind.Terminal:
            return 0 /* TerminalApproval */;
          case AgentSessionApprovalKind.Question:
            return 1 /* Question */;
          default:
            return void 0;
        }
      }
      default:
        return void 0;
    }
  }
};
BlockedSessionsIndicatorModel = __decorateClass([
  __decorateParam(3, ISessionsService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IProductService)
], BlockedSessionsIndicatorModel);
export {
  BlockedSessionsIndicatorModel,
  RequiresInputKind
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvYnJvd3Nlci9ibG9ja2VkU2Vzc2lvbnNJbmRpY2F0b3JNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgSVJlYWRlciwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbkFwcHJvdmFsS2luZCwgQWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbCwgYWdlbnRTZXNzaW9uQXBwcm92YWxJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgQmxvY2tlZFNlc3Npb25SZWFzb24sIEJsb2NrZWRTZXNzaW9ucywgSUJsb2NrZWRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vYmxvY2tlZFNlc3Npb25zL2Jyb3dzZXIvYmxvY2tlZFNlc3Npb25zLmpzJztcbmltcG9ydCB7IEJsb2NrZWRTZXNzaW9uc0NJRml4TW9kZWwgfSBmcm9tICcuL2Jsb2NrZWRTZXNzaW9uc0NJRml4TW9kZWwuanMnO1xuaW1wb3J0IHsgZ2V0Rmlyc3RBcHByb3ZhbEFjcm9zc0NoYXRzLCBJQXBwcm92ZWRTZXNzaW9uIH0gZnJvbSAnLi92aWV3cy9zZXNzaW9uc0xpc3QuanMnO1xuXG4vKipcbiAqIFRoZSBzcGVjaWZpYyByZWFzb24gYSBob21vZ2VuZW91cyBzZXQgb2YgYmxvY2tlZCBzZXNzaW9ucyBuZWVkcyBhdHRlbnRpb24sXG4gKiB1c2VkIHRvIHJlbmRlciBhIG1vcmUgaGVscGZ1bCByZXF1aXJlcy1pbnB1dCBtZXNzYWdlLiBgdW5kZWZpbmVkYCAoYSBtaXggb2ZcbiAqIHJlYXNvbnMsIG9yIGFuIGluZGV0ZXJtaW5hdGUgb25lKSBmYWxscyBiYWNrIHRvIHRoZSBnZW5lcmljIG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBlbnVtIFJlcXVpcmVzSW5wdXRLaW5kIHtcblx0LyoqIEFsbCBzZXNzaW9ucyBhcmUgd2FpdGluZyB0byBydW4gYSB0ZXJtaW5hbCBjb21tYW5kLiAqL1xuXHRUZXJtaW5hbEFwcHJvdmFsLFxuXHQvKiogQWxsIHNlc3Npb25zIGFyZSBhc2tpbmcgdGhlIHVzZXIgYSBxdWVzdGlvbi4gKi9cblx0UXVlc3Rpb24sXG5cdC8qKiBBbGwgc2Vzc2lvbnMgaGF2ZSBmYWlsaW5nIENJIGNoZWNrcy4gKi9cblx0RmFpbGluZ0NJLFxufVxuXG4vKipcbiAqIE1vZGVsIGJlaGluZCB0aGUgc2Vzc2lvbnMgdGl0bGUgYmFyJ3MgXCJOIHNlc3Npb25zIHJlcXVpcmUgaW5wdXRcIiBpbmRpY2F0b3IuXG4gKlxuICogSXQgcmVmaW5lcyB0aGUgcmF3IHtAbGluayBCbG9ja2VkU2Vzc2lvbnN9IHNldCBpbnRvIHdoYXQgdGhlIHRpdGxlIGJhciBzaG91bGRcbiAqIGFjdHVhbGx5IHN1cmZhY2U6IHZpc2libGUgYW5kIGV4cGxpY2l0bHkgaWdub3JlZCBvY2N1cnJlbmNlcyBhcmUgYWNrbm93bGVkZ2VkLFxuICogYXBwcm92YWxzIGFyZSBkaXNtaXNzZWQgb3B0aW1pc3RpY2FsbHksIGFuZCBsYXRlciBvY2N1cnJlbmNlcyBzdXJmYWNlIGFnYWluLlxuICpcbiAqIEJsaW5rIGRldGVjdGlvbiBrZXlzIG9mZiBibG9ja2VkIG9jY3VycmVuY2VzLCBzbyBuYXZpZ2F0aW9uIGNhbiBhY2tub3dsZWRnZSBhXG4gKiBibG9jayBidXQgbmV2ZXIgY3JlYXRlcyBvbmUuXG4gKlxuICogVGhlIERPTSByZW5kZXJpbmcgb2YgdGhlIGluZGljYXRvciBsaXZlcyBpbiB0aGUgdGl0bGUgYmFyIHdpZGdldDsgdGhpcyBjbGFzcyBpc1xuICogRE9NLWZyZWUgc28gaXQgY2FuIGJlIHVuaXQgdGVzdGVkIGluIGlzb2xhdGlvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIEJsb2NrZWRTZXNzaW9uc0luZGljYXRvck1vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0LyoqIENvbXB1dGVzIHRoZSByYXcgc2V0IG9mIGJsb2NrZWQgc2Vzc2lvbnMgKG5lZWRzIGlucHV0IC8gZmFpbGluZyBDSSkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Jsb2NrZWRTZXNzaW9uc01vZGVsOiBCbG9ja2VkU2Vzc2lvbnM7XG5cblx0LyoqIFRyYWNrcyBwZW5kaW5nIHRvb2wgYXBwcm92YWxzIHBlciBjaGF0OyBkaXN0aW5ndWlzaGVzIHRlcm1pbmFsIHZzIHF1ZXN0aW9uLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hcHByb3ZhbE1vZGVsOiBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsO1xuXG5cdC8qKiBUaGUgYXBwcm92YWwgbW9kZWwsIHNoYXJlZCB3aXRoIHRoZSBkcm9wZG93biBsaXN0IHNvIGJvdGggYWdyZWUgb24gZWFjaCBzZXNzaW9uJ3MgcGVuZGluZyBhY3Rpb24uICovXG5cdGdldCBhcHByb3ZhbE1vZGVsKCk6IEFnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwge1xuXHRcdHJldHVybiB0aGlzLl9hcHByb3ZhbE1vZGVsO1xuXHR9XG5cblx0LyoqIERyaXZlcyB0aGUgcGVyLXNlc3Npb24gXCJGaXggQ0lcIiByb3c7IHNoYXJlZCB3aXRoIHRoZSBkcm9wZG93biBsaXN0LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaUZpeE1vZGVsOiBCbG9ja2VkU2Vzc2lvbnNDSUZpeE1vZGVsO1xuXG5cdC8qKiBUaGUgQ0ktZml4IG1vZGVsLCBzaGFyZWQgd2l0aCB0aGUgZHJvcGRvd24gbGlzdCBzbyB0aGUgZml4IGFjdGlvbiBhbmQgdGhlIGhpZGUtd2hpbGUtZml4aW5nIGFncmVlLiAqL1xuXHRnZXQgY2lGaXhNb2RlbCgpOiBCbG9ja2VkU2Vzc2lvbnNDSUZpeE1vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy5fY2lGaXhNb2RlbDtcblx0fVxuXG5cdC8qKiBDdXJyZW50IGJsb2NrZWQgb2NjdXJyZW5jZXMgdGhlIHVzZXIgaGFzIGFscmVhZHkgYWNrbm93bGVkZ2VkLCBrZXllZCBieSBzZXNzaW9uIGlkLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pZ25vcmVkQmxvY2tPY2N1cnJlbmNlcyA9IG9ic2VydmFibGVWYWx1ZTxSZWFkb25seU1hcDxzdHJpbmcsIHN0cmluZz4+KCdpZ25vcmVkQmxvY2tPY2N1cnJlbmNlcycsIG5ldyBNYXAoKSk7XG5cblx0LyoqXG5cdCAqIEJsb2NrZWQgc2Vzc2lvbnMgdGhhdCBhcmUgbm90IHZpc2libGUsIGlnbm9yZWQsIGJlaW5nIGZpeGVkLCBvciBhbHJlYWR5IGFwcHJvdmVkLlxuXHQgKiBWaXNpYmxlIGJsb2NrZWQgb2NjdXJyZW5jZXMgc3RheSBhY2tub3dsZWRnZWQgYWZ0ZXIgdGhlIHVzZXIgbmF2aWdhdGVzIGF3YXkuXG5cdCAqL1xuXHRyZWFkb25seSBibG9ja2VkU2Vzc2lvbnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElCbG9ja2VkU2Vzc2lvbltdPjtcblxuXHQvKipcblx0ICogVGhlIGhvbW9nZW5lb3VzIHJlYXNvbiB0aGUgYmxvY2tlZCBzZXNzaW9ucyBuZWVkIGF0dGVudGlvbiAoYWxsIHRlcm1pbmFsXG5cdCAqIGFwcHJvdmFscywgYWxsIGZhaWxpbmcgQ0ksIGV0Yy4pLCBvciBgdW5kZWZpbmVkYCB3aGVuIHRoZXkgYXJlIGEgbWl4IFx1MjAxNCB3aGljaFxuXHQgKiBkcml2ZXMgd2hldGhlciBhIHNwZWNpZmljIG9yIHRoZSBnZW5lcmljIHJlcXVpcmVzLWlucHV0IG1lc3NhZ2UgaXMgc2hvd24uXG5cdCAqL1xuXHRyZWFkb25seSByZXF1aXJlc0lucHV0S2luZDogSU9ic2VydmFibGU8UmVxdWlyZXNJbnB1dEtpbmQgfCB1bmRlZmluZWQ+O1xuXG5cdC8qKlxuXHQgKiBMYXRlc3QgYmxvY2tlZCBvY2N1cnJlbmNlIHBlciBzZXNzaW9uLCBpbmRlcGVuZGVudCBvZiB2aXNpYmlsaXR5LiBVc2VkIHNvIHRoZVxuXHQgKiBhdHRlbnRpb24gYmxpbmsgb25seSBmaXJlcyBmb3IgYSBnZW51aW5lbHkgbmV3IGlucHV0IHJlcXVlc3Qgb3IgQ0kgZmFpbHVyZS5cblx0ICovXG5cdHByaXZhdGUgX2xhc3RCbG9ja2VkT2NjdXJyZW5jZXM6IFJlYWRvbmx5TWFwPHN0cmluZywgc3RyaW5nPiA9IG5ldyBNYXAoKTtcblxuXHQvKipcblx0ICogTm90LXlldC12aXNpYmxlIGJsb2NrZWQgb2NjdXJyZW5jZXMgd2hvc2UgYXR0ZW50aW9uIGJsaW5rIGhhcyBub3QgcGxheWVkIHlldC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdCbGlua09jY3VycmVuY2VzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RCbGluayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHQvKipcblx0ICogRmlyZXMgd2hlbiBhIGdlbnVpbmVseSBuZXcsIG5vdC15ZXQtdmlzaWJsZSBzZXNzaW9uIGJlY29tZXMgYmxvY2tlZCBhbmQgdGhlXG5cdCAqIGluZGljYXRvciBzaG91bGQgcGxheSBpdHMgYXR0ZW50aW9uIGJsaW5rLiBDb25zdW1lcnMgc2hvdWxkIHJlLXJlbmRlciBhbmRcblx0ICogY2FsbCB7QGxpbmsgY29uc3VtZVBlbmRpbmdCbGlua30uXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RCbGluazogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZFJlcXVlc3RCbGluay5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhcHByb3ZhbE1vZGVsOiBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsIHwgdW5kZWZpbmVkLFxuXHRcdGJsb2NrZWRTZXNzaW9uczogQmxvY2tlZFNlc3Npb25zIHwgdW5kZWZpbmVkLFxuXHRcdGNpRml4TW9kZWw6IEJsb2NrZWRTZXNzaW9uc0NJRml4TW9kZWwgfCB1bmRlZmluZWQsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBUaGUgbW9kZWwgb3ducyB0aGUgYXBwcm92YWwgbW9kZWwsIGJsb2NrZWQtc2Vzc2lvbnMgbW9kZWwgYW5kIENJLWZpeCBtb2RlbDtcblx0XHQvLyB0aGUgb3B0aW9uYWwgcGFyYW1ldGVycyBhcmUgdGVzdCBzZWFtcyBzbyBmaXh0dXJlcy90ZXN0cyBjYW4gc3VwcGx5IHByZXNldFxuXHRcdC8vIGluc3RhbmNlcyAob25seSByZWdpc3RlciBcdTIwMTQgYW5kIHRodXMgZGlzcG9zZSBcdTIwMTQgdGhlIG9uZXMgd2UgY3JlYXRlZCBvdXJzZWx2ZXMpLlxuXHRcdHRoaXMuX2FwcHJvdmFsTW9kZWwgPSBhcHByb3ZhbE1vZGVsID8/IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwpKTtcblx0XHR0aGlzLl9ibG9ja2VkU2Vzc2lvbnNNb2RlbCA9IGJsb2NrZWRTZXNzaW9ucyA/PyB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCbG9ja2VkU2Vzc2lvbnMpKTtcblx0XHR0aGlzLl9jaUZpeE1vZGVsID0gY2lGaXhNb2RlbCA/PyB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCbG9ja2VkU2Vzc2lvbnNDSUZpeE1vZGVsKSk7XG5cblx0XHQvLyBUaGUgYmxvY2tlZC1zZXNzaW9ucyBmZWF0dXJlIGlzIG9ubHkgZW5hYmxlZCBvdXRzaWRlIG9mIHN0YWJsZSBidWlsZHMuXG5cdFx0Y29uc3QgZW5hYmxlZCA9IHByb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgIT09ICdzdGFibGUnO1xuXG5cdFx0Ly8gQSBzZXNzaW9uIHRoYXQgaXMgY3VycmVudGx5IHZpc2libGUgb24gc2NyZWVuIGlzIG5vdCB0cmVhdGVkIGFzIGJsb2NrZWQ6XG5cdFx0Ly8gZXhjbHVkZSB2aXNpYmxlIHNlc3Npb25zIGZyb20gdGhlIHJlcXVpcmVzLWlucHV0IGluZGljYXRvciBhbmQgdGhlIGRyb3Bkb3duLlxuXHRcdHRoaXMuYmxvY2tlZFNlc3Npb25zID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0aWYgKCFlbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHZpc2libGVTZXNzaW9uSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLnZpc2libGVTZXNzaW9ucy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdFx0XHR2aXNpYmxlU2Vzc2lvbklkcy5hZGQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpZ25vcmVkT2NjdXJyZW5jZXMgPSB0aGlzLl9pZ25vcmVkQmxvY2tPY2N1cnJlbmNlcy5yZWFkKHJlYWRlcik7XG5cdFx0XHQvLyBTZXNzaW9ucyB3aG9zZSBDSSBmaXggaXMgYmVpbmcgc3VibWl0dGVkIGluIHRoZSBiYWNrZ3JvdW5kIGFyZSBoaWRkZW5cblx0XHRcdC8vIGltbWVkaWF0ZWx5IChiZWZvcmUgdGhlaXIgc3RhdHVzIGZsaXBzIHRvIGluLXByb2dyZXNzKSBzbyB0aGUgcm93XG5cdFx0XHQvLyBkaXNhcHBlYXJzIHRoZSBtb21lbnQgdGhlIHVzZXIgY2xpY2tzIFwiRml4IENJXCIuXG5cdFx0XHRjb25zdCBjaUZpeEhpZGRlbiA9IHRoaXMuX2NpRml4TW9kZWwuaGlkZGVuU2Vzc2lvbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2Jsb2NrZWRTZXNzaW9uc01vZGVsLmJsb2NrZWRTZXNzaW9uc1dpdGhSZWFzb25zLnJlYWQocmVhZGVyKVxuXHRcdFx0XHQuZmlsdGVyKGJsb2NrZWQgPT4gIXZpc2libGVTZXNzaW9uSWRzLmhhcyhibG9ja2VkLnNlc3Npb24uc2Vzc2lvbklkKVxuXHRcdFx0XHRcdCYmICFjaUZpeEhpZGRlbi5oYXMoYmxvY2tlZC5zZXNzaW9uLnNlc3Npb25JZClcblx0XHRcdFx0XHQmJiAhdGhpcy5faXNCbG9ja0lnbm9yZWQoYmxvY2tlZCwgaWdub3JlZE9jY3VycmVuY2VzLCByZWFkZXIpKTtcblx0XHR9KTtcblxuXHRcdC8vIFRoZSBob21vZ2VuZW91cyByZWFzb24gYWNyb3NzIGFsbCBibG9ja2VkIHNlc3Npb25zIChvciBgdW5kZWZpbmVkYCBmb3IgYVxuXHRcdC8vIG1peCksIHJlZmluaW5nIGBOZWVkc0lucHV0YCBpbnRvIHRlcm1pbmFsLWFwcHJvdmFsIHZzIHF1ZXN0aW9uIHZpYSB0aGVcblx0XHQvLyBhcHByb3ZhbCBtb2RlbC4gRHJpdmVzIHRoZSBzcGVjaWZpYyByZXF1aXJlcy1pbnB1dCBtZXNzYWdlLlxuXHRcdHRoaXMucmVxdWlyZXNJbnB1dEtpbmQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBibG9ja2VkID0gdGhpcy5ibG9ja2VkU2Vzc2lvbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGJsb2NrZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRsZXQgY29tbW9uOiBSZXF1aXJlc0lucHV0S2luZCB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBoYXNDb21tb24gPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgYmxvY2tlZCkge1xuXHRcdFx0XHRjb25zdCBraW5kID0gdGhpcy5fa2luZE9mKGVudHJ5LCByZWFkZXIpO1xuXHRcdFx0XHRpZiAoa2luZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWhhc0NvbW1vbikge1xuXHRcdFx0XHRcdGNvbW1vbiA9IGtpbmQ7XG5cdFx0XHRcdFx0aGFzQ29tbW9uID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIGlmIChjb21tb24gIT09IGtpbmQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY29tbW9uO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQSB2aXNpYmxlIGJsb2NrZWQgc2Vzc2lvbiBoYXMgYmVlbiBhY2tub3dsZWRnZWQuIEtlZXAgdGhhdCBvY2N1cnJlbmNlXG5cdFx0Ly8gaWdub3JlZCBhZnRlciBuYXZpZ2F0aW9uLCBhbmQgY2xlYXIgc3RhbGUgaWdub3JlcyB3aGVuIGEgbmV3IGJsb2NrIGFwcGVhcnMuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0aWYgKCFlbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJsb2NrZWRTZXNzaW9ucyA9IHRoaXMuX2Jsb2NrZWRTZXNzaW9uc01vZGVsLmJsb2NrZWRTZXNzaW9uc1dpdGhSZWFzb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGJsb2NrZWRCeUlkID0gbmV3IE1hcChibG9ja2VkU2Vzc2lvbnMubWFwKGVudHJ5ID0+IFtlbnRyeS5zZXNzaW9uLnNlc3Npb25JZCwgZW50cnldIGFzIGNvbnN0KSk7XG5cdFx0XHRjb25zdCB2aXNpYmxlU2Vzc2lvbklkcyA9IG5ldyBTZXQodGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLnZpc2libGVTZXNzaW9ucy5yZWFkKHJlYWRlcikuZmlsdGVyKHNlc3Npb24gPT4gc2Vzc2lvbiAhPT0gdW5kZWZpbmVkKS5tYXAoc2Vzc2lvbiA9PiBzZXNzaW9uLnNlc3Npb25JZCkpO1xuXHRcdFx0Y29uc3QgaWdub3JlZE9jY3VycmVuY2VzID0gdGhpcy5faWdub3JlZEJsb2NrT2NjdXJyZW5jZXMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgbmV4dCA9IG5ldyBNYXAoaWdub3JlZE9jY3VycmVuY2VzKTtcblx0XHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cblx0XHRcdGZvciAoY29uc3QgW3Nlc3Npb25JZCwgaWdub3JlZE9jY3VycmVuY2VdIG9mIGlnbm9yZWRPY2N1cnJlbmNlcykge1xuXHRcdFx0XHRjb25zdCBibG9ja2VkU2Vzc2lvbiA9IGJsb2NrZWRCeUlkLmdldChzZXNzaW9uSWQpO1xuXHRcdFx0XHRpZiAoIWJsb2NrZWRTZXNzaW9uIHx8IHRoaXMuX2dldEJsb2NrT2NjdXJyZW5jZUlkKGJsb2NrZWRTZXNzaW9uLCByZWFkZXIsIGlnbm9yZWRPY2N1cnJlbmNlKSAhPT0gaWdub3JlZE9jY3VycmVuY2UpIHtcblx0XHRcdFx0XHRuZXh0LmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgYmxvY2tlZFNlc3Npb24gb2YgYmxvY2tlZEJ5SWQudmFsdWVzKCkpIHtcblx0XHRcdFx0aWYgKCF2aXNpYmxlU2Vzc2lvbklkcy5oYXMoYmxvY2tlZFNlc3Npb24uc2Vzc2lvbi5zZXNzaW9uSWQpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgb2NjdXJyZW5jZUlkID0gdGhpcy5fZ2V0QmxvY2tPY2N1cnJlbmNlSWQoYmxvY2tlZFNlc3Npb24sIHJlYWRlciwgbmV4dC5nZXQoYmxvY2tlZFNlc3Npb24uc2Vzc2lvbi5zZXNzaW9uSWQpKTtcblx0XHRcdFx0aWYgKG5leHQuZ2V0KGJsb2NrZWRTZXNzaW9uLnNlc3Npb24uc2Vzc2lvbklkKSAhPT0gb2NjdXJyZW5jZUlkKSB7XG5cdFx0XHRcdFx0bmV4dC5zZXQoYmxvY2tlZFNlc3Npb24uc2Vzc2lvbi5zZXNzaW9uSWQsIG9jY3VycmVuY2VJZCk7XG5cdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5faWdub3JlZEJsb2NrT2NjdXJyZW5jZXMuc2V0KG5leHQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRHJpdmUgdGhlIGF0dGVudGlvbiBibGluay4gR2F0ZWQgb24gYSBibG9ja2VkLXNldCBkaWZmLCBzbyBhIHZpc2liaWxpdHktb25seVxuXHRcdC8vIGNoYW5nZSBjYW4gb25seSBldmVyIGRyb3AgYSBwZW5kaW5nIGJsaW5rLCBuZXZlciBzdGFydCBvbmUuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0aWYgKCFlbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlnbm9yZWRPY2N1cnJlbmNlcyA9IHRoaXMuX2lnbm9yZWRCbG9ja09jY3VycmVuY2VzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IG1vZGVsQmxvY2tlZCA9IHRoaXMuX2Jsb2NrZWRTZXNzaW9uc01vZGVsLmJsb2NrZWRTZXNzaW9uc1dpdGhSZWFzb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGN1cnJlbnRPY2N1cnJlbmNlcyA9IG5ldyBNYXAobW9kZWxCbG9ja2VkLm1hcChibG9ja2VkID0+IFtcblx0XHRcdFx0YmxvY2tlZC5zZXNzaW9uLnNlc3Npb25JZCxcblx0XHRcdFx0dGhpcy5fZ2V0QmxvY2tPY2N1cnJlbmNlSWQoYmxvY2tlZCwgcmVhZGVyLCBpZ25vcmVkT2NjdXJyZW5jZXMuZ2V0KGJsb2NrZWQuc2Vzc2lvbi5zZXNzaW9uSWQpKSxcblx0XHRcdF0gYXMgY29uc3QpKTtcblx0XHRcdGNvbnN0IHByZXZpb3VzT2NjdXJyZW5jZXMgPSB0aGlzLl9sYXN0QmxvY2tlZE9jY3VycmVuY2VzO1xuXHRcdFx0dGhpcy5fbGFzdEJsb2NrZWRPY2N1cnJlbmNlcyA9IGN1cnJlbnRPY2N1cnJlbmNlcztcblxuXHRcdFx0Y29uc3QgdmlzaWJsZVNlc3Npb25JZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLl9zZXNzaW9uc1NlcnZpY2UudmlzaWJsZVNlc3Npb25zLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHRcdHZpc2libGVTZXNzaW9uSWRzLmFkZChzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gRHJvcCBxdWV1ZWQgYmxpbmtzIGZvciBzZXNzaW9ucyB0aGF0IHVuYmxvY2tlZCBvciB0aGF0IHRoZSB1c2VyIGNhbiBub3cgc2VlLlxuXHRcdFx0Zm9yIChjb25zdCBbc2Vzc2lvbklkLCBvY2N1cnJlbmNlSWRdIG9mIHRoaXMuX3BlbmRpbmdCbGlua09jY3VycmVuY2VzKSB7XG5cdFx0XHRcdGlmIChjdXJyZW50T2NjdXJyZW5jZXMuZ2V0KHNlc3Npb25JZCkgIT09IG9jY3VycmVuY2VJZCB8fCB2aXNpYmxlU2Vzc2lvbklkcy5oYXMoc2Vzc2lvbklkKSkge1xuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdCbGlua09jY3VycmVuY2VzLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIE9ubHkgYSBnZW51aW5lbHkgbmV3IGJsb2NrIHRoZSB1c2VyIGNhbm5vdCBhbHJlYWR5IHNlZSBxdWV1ZXMgYSBibGluay5cblx0XHRcdGxldCBxdWV1ZWQgPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3QgYmxvY2tlZCBvZiBtb2RlbEJsb2NrZWQpIHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gYmxvY2tlZC5zZXNzaW9uLnNlc3Npb25JZDtcblx0XHRcdFx0Y29uc3Qgb2NjdXJyZW5jZUlkID0gY3VycmVudE9jY3VycmVuY2VzLmdldChzZXNzaW9uSWQpITtcblx0XHRcdFx0aWYgKHByZXZpb3VzT2NjdXJyZW5jZXMuZ2V0KHNlc3Npb25JZCkgIT09IG9jY3VycmVuY2VJZCAmJiAhdmlzaWJsZVNlc3Npb25JZHMuaGFzKHNlc3Npb25JZCkpIHtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nQmxpbmtPY2N1cnJlbmNlcy5zZXQoc2Vzc2lvbklkLCBvY2N1cnJlbmNlSWQpO1xuXHRcdFx0XHRcdHF1ZXVlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChxdWV1ZWQpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRSZXF1ZXN0QmxpbmsuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIGEgZnJlc2ggYXR0ZW50aW9uIGJsaW5rIGlzIHBlbmRpbmcuIFJldHVybnMgYHRydWVgIG9ubHkgd2hlbiBhIHNlc3Npb25cblx0ICogcXVldWVkIGFzIG5ld2x5IGJsb2NrZWQgaXMgc3RpbGwgaW4gdGhlIHN1cmZhY2VkICh2aXNpYmxlLWZpbHRlcmVkKSBibG9ja2VkIHNldCxcblx0ICogc28gYSBibGluayBxdWV1ZWQgd2hpbGUgdGhlIHBpbGwgd2FzIHN1cHByZXNzZWQgY2FuJ3QgZmlyZSBmb3IgYSBzZXNzaW9uIHRoYXQgaGFzXG5cdCAqIHNpbmNlIGJlY29tZSB2aXNpYmxlIG9yIHVuYmxvY2tlZC4gVGhlIHBlbmRpbmcgcXVldWUgaXMgY2xlYXJlZCBhcyBpdCBpcyByZWFkIHNvXG5cdCAqIGEgc3Vic2VxdWVudCByZW5kZXIgd29uJ3QgcmVwbGF5IHRoZSBhbmltYXRpb24uXG5cdCAqL1xuXHRjb25zdW1lUGVuZGluZ0JsaW5rKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nQmxpbmtPY2N1cnJlbmNlcy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGlnbm9yZWRPY2N1cnJlbmNlcyA9IHRoaXMuX2lnbm9yZWRCbG9ja09jY3VycmVuY2VzLmdldCgpO1xuXHRcdGNvbnN0IHN1cmZhY2VkT2NjdXJyZW5jZXMgPSBuZXcgTWFwKHRoaXMuYmxvY2tlZFNlc3Npb25zLmdldCgpLm1hcChibG9ja2VkID0+IFtcblx0XHRcdGJsb2NrZWQuc2Vzc2lvbi5zZXNzaW9uSWQsXG5cdFx0XHR0aGlzLl9nZXRCbG9ja09jY3VycmVuY2VJZChibG9ja2VkLCB1bmRlZmluZWQsIGlnbm9yZWRPY2N1cnJlbmNlcy5nZXQoYmxvY2tlZC5zZXNzaW9uLnNlc3Npb25JZCkpLFxuXHRcdF0gYXMgY29uc3QpKTtcblx0XHRsZXQgc2hvdWxkQmxpbmsgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IFtzZXNzaW9uSWQsIG9jY3VycmVuY2VJZF0gb2YgdGhpcy5fcGVuZGluZ0JsaW5rT2NjdXJyZW5jZXMpIHtcblx0XHRcdGlmIChzdXJmYWNlZE9jY3VycmVuY2VzLmdldChzZXNzaW9uSWQpID09PSBvY2N1cnJlbmNlSWQpIHtcblx0XHRcdFx0c2hvdWxkQmxpbmsgPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ0JsaW5rT2NjdXJyZW5jZXMuY2xlYXIoKTtcblx0XHRyZXR1cm4gc2hvdWxkQmxpbms7XG5cdH1cblxuXHQvKiogSWdub3JlIHRoaXMgc2Vzc2lvbidzIGN1cnJlbnQgYmxvY2tlZCBvY2N1cnJlbmNlLiAqL1xuXHRpZ25vcmVTZXNzaW9uKHNlc3Npb246IElTZXNzaW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgYmxvY2tlZCA9IHRoaXMuX2Jsb2NrZWRTZXNzaW9uc01vZGVsLmJsb2NrZWRTZXNzaW9uc1dpdGhSZWFzb25zLmdldCgpLmZpbmQoZW50cnkgPT4gZW50cnkuc2Vzc2lvbi5zZXNzaW9uSWQgPT09IHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRpZiAoIWJsb2NrZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faWdub3JlT2NjdXJyZW5jZShibG9ja2VkLCB0aGlzLl9nZXRCbG9ja09jY3VycmVuY2VJZChibG9ja2VkLCB1bmRlZmluZWQsIHRoaXMuX2lnbm9yZWRCbG9ja09jY3VycmVuY2VzLmdldCgpLmdldChzZXNzaW9uLnNlc3Npb25JZCkpKTtcblx0fVxuXG5cdC8qKiBJZ25vcmUgZXZlcnkgYmxvY2tlZCBvY2N1cnJlbmNlIGN1cnJlbnRseSBzdXJmYWNlZCBieSB0aGUgaW5kaWNhdG9yLiAqL1xuXHRpZ25vcmVBbGxTZXNzaW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBibG9ja2VkU2Vzc2lvbnMgPSB0aGlzLmJsb2NrZWRTZXNzaW9ucy5nZXQoKTtcblx0XHRpZiAoYmxvY2tlZFNlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBuZXh0ID0gbmV3IE1hcCh0aGlzLl9pZ25vcmVkQmxvY2tPY2N1cnJlbmNlcy5nZXQoKSk7XG5cdFx0Zm9yIChjb25zdCBibG9ja2VkIG9mIGJsb2NrZWRTZXNzaW9ucykge1xuXHRcdFx0bmV4dC5zZXQoYmxvY2tlZC5zZXNzaW9uLnNlc3Npb25JZCwgdGhpcy5fZ2V0QmxvY2tPY2N1cnJlbmNlSWQoYmxvY2tlZCwgdW5kZWZpbmVkLCBuZXh0LmdldChibG9ja2VkLnNlc3Npb24uc2Vzc2lvbklkKSkpO1xuXHRcdH1cblx0XHR0aGlzLl9pZ25vcmVkQmxvY2tPY2N1cnJlbmNlcy5zZXQobmV4dCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1lbWJlciB0aGF0IHRoZSB1c2VyIGFsbG93ZWQgdGhpcyBleGFjdCBhcHByb3ZhbCBzbyB0aGUgc2Vzc2lvbiBkcm9wcyBvdXQgb2Zcblx0ICogdGhlIGJsb2NrZWQgc2V0IGltbWVkaWF0ZWx5LlxuXHQgKi9cblx0ZGlzbWlzc0FwcHJvdmFsKGFwcHJvdmVkOiBJQXBwcm92ZWRTZXNzaW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgYmxvY2tlZCA9IHRoaXMuX2Jsb2NrZWRTZXNzaW9uc01vZGVsLmJsb2NrZWRTZXNzaW9uc1dpdGhSZWFzb25zLmdldCgpLmZpbmQoZW50cnkgPT4gZW50cnkuc2Vzc2lvbi5zZXNzaW9uSWQgPT09IGFwcHJvdmVkLnNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRpZiAoIWJsb2NrZWQgfHwgYmxvY2tlZC5yZWFzb24gIT09IEJsb2NrZWRTZXNzaW9uUmVhc29uLk5lZWRzSW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faWdub3JlT2NjdXJyZW5jZShibG9ja2VkLCB0aGlzLl9hcHByb3ZhbE9jY3VycmVuY2VJZChibG9ja2VkLCBhcHByb3ZlZC5hcHByb3ZhbElkKSk7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGQgdGhlIHJlcXVpcmVzLWlucHV0IHBpbGwgbGFiZWwuIEEgaG9tb2dlbmVvdXMgc2V0IG9mIGJsb2NrZWQgc2Vzc2lvbnNcblx0ICogZ2V0cyBhIHNwZWNpZmljLCBtb3JlIGFjdGlvbmFibGUgbWVzc2FnZTsgYSBtaXggKG9yIGFuIHVuY2xhc3NpZmllZCBzZXNzaW9uKVxuXHQgKiBmYWxscyBiYWNrIHRvIHRoZSBnZW5lcmljIFwiTiBzZXNzaW9ucyByZXF1aXJlIGlucHV0XCIuXG5cdCAqL1xuXHRnZXRSZXF1aXJlc0lucHV0TGFiZWwoY291bnQ6IG51bWJlciwga2luZDogUmVxdWlyZXNJbnB1dEtpbmQgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAoa2luZCkge1xuXHRcdFx0Y2FzZSBSZXF1aXJlc0lucHV0S2luZC5UZXJtaW5hbEFwcHJvdmFsOlxuXHRcdFx0XHRyZXR1cm4gY291bnQgPT09IDFcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdvbmVTZXNzaW9uVGVybWluYWxBcHByb3ZhbCcsIFwiMSBzZXNzaW9uIHJlcXVpcmVzIHRlcm1pbmFsIGFwcHJvdmFsXCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnblNlc3Npb25zVGVybWluYWxBcHByb3ZhbCcsIFwiezB9IHNlc3Npb25zIHJlcXVpcmUgdGVybWluYWwgYXBwcm92YWxcIiwgY291bnQpO1xuXHRcdFx0Y2FzZSBSZXF1aXJlc0lucHV0S2luZC5RdWVzdGlvbjpcblx0XHRcdFx0cmV0dXJuIGNvdW50ID09PSAxXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnb25lU2Vzc2lvblF1ZXN0aW9uJywgXCIxIHNlc3Npb24gaGFzIGEgcXVlc3Rpb25cIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCduU2Vzc2lvbnNRdWVzdGlvbicsIFwiezB9IHNlc3Npb25zIGhhdmUgcXVlc3Rpb25zXCIsIGNvdW50KTtcblx0XHRcdGNhc2UgUmVxdWlyZXNJbnB1dEtpbmQuRmFpbGluZ0NJOlxuXHRcdFx0XHRyZXR1cm4gY291bnQgPT09IDFcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdvbmVTZXNzaW9uRmFpbGluZ0NJJywgXCIxIHNlc3Npb24gaXMgZmFpbGluZyBDSVwiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ25TZXNzaW9uc0ZhaWxpbmdDSScsIFwiezB9IHNlc3Npb25zIGFyZSBmYWlsaW5nIENJXCIsIGNvdW50KTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBjb3VudCA9PT0gMVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ29uZVNlc3Npb25SZXF1aXJlc0lucHV0JywgXCIxIHNlc3Npb24gcmVxdWlyZXMgaW5wdXRcIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCduU2Vzc2lvbnNSZXF1aXJlSW5wdXQnLCBcInswfSBzZXNzaW9ucyByZXF1aXJlIGlucHV0XCIsIGNvdW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pZ25vcmVPY2N1cnJlbmNlKGJsb2NrZWQ6IElCbG9ja2VkU2Vzc2lvbiwgb2NjdXJyZW5jZUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBuZXh0ID0gbmV3IE1hcCh0aGlzLl9pZ25vcmVkQmxvY2tPY2N1cnJlbmNlcy5nZXQoKSk7XG5cdFx0bmV4dC5zZXQoYmxvY2tlZC5zZXNzaW9uLnNlc3Npb25JZCwgb2NjdXJyZW5jZUlkKTtcblx0XHR0aGlzLl9pZ25vcmVkQmxvY2tPY2N1cnJlbmNlcy5zZXQobmV4dCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzQmxvY2tJZ25vcmVkKGJsb2NrZWQ6IElCbG9ja2VkU2Vzc2lvbiwgaWdub3JlZE9jY3VycmVuY2VzOiBSZWFkb25seU1hcDxzdHJpbmcsIHN0cmluZz4sIHJlYWRlcjogSVJlYWRlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGlnbm9yZWRPY2N1cnJlbmNlID0gaWdub3JlZE9jY3VycmVuY2VzLmdldChibG9ja2VkLnNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gaWdub3JlZE9jY3VycmVuY2UgIT09IHVuZGVmaW5lZCAmJiB0aGlzLl9nZXRCbG9ja09jY3VycmVuY2VJZChibG9ja2VkLCByZWFkZXIsIGlnbm9yZWRPY2N1cnJlbmNlKSA9PT0gaWdub3JlZE9jY3VycmVuY2U7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRCbG9ja09jY3VycmVuY2VJZChibG9ja2VkOiBJQmxvY2tlZFNlc3Npb24sIHJlYWRlcjogSVJlYWRlciB8IHVuZGVmaW5lZCwgaWdub3JlZE9jY3VycmVuY2U/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmIChibG9ja2VkLnJlYXNvbiAhPT0gQmxvY2tlZFNlc3Npb25SZWFzb24uTmVlZHNJbnB1dCkge1xuXHRcdFx0cmV0dXJuIGJsb2NrZWQub2NjdXJyZW5jZUlkO1xuXHRcdH1cblx0XHRjb25zdCBhcHByb3ZhbCA9IGdldEZpcnN0QXBwcm92YWxBY3Jvc3NDaGF0cyh0aGlzLl9hcHByb3ZhbE1vZGVsLCBibG9ja2VkLnNlc3Npb24sIHJlYWRlcik7XG5cdFx0aWYgKGFwcHJvdmFsKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYXBwcm92YWxPY2N1cnJlbmNlSWQoYmxvY2tlZCwgYWdlbnRTZXNzaW9uQXBwcm92YWxJZChhcHByb3ZhbCkpO1xuXHRcdH1cblx0XHRjb25zdCBhcHByb3ZhbFByZWZpeCA9IHRoaXMuX2FwcHJvdmFsT2NjdXJyZW5jZUlkKGJsb2NrZWQsICcnKTtcblx0XHRyZXR1cm4gaWdub3JlZE9jY3VycmVuY2U/LnN0YXJ0c1dpdGgoYXBwcm92YWxQcmVmaXgpID8gaWdub3JlZE9jY3VycmVuY2UgOiBibG9ja2VkLm9jY3VycmVuY2VJZDtcblx0fVxuXG5cdHByaXZhdGUgX2FwcHJvdmFsT2NjdXJyZW5jZUlkKGJsb2NrZWQ6IElCbG9ja2VkU2Vzc2lvbiwgYXBwcm92YWxJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7YmxvY2tlZC5vY2N1cnJlbmNlSWR9OmFwcHJvdmFsOiR7YXBwcm92YWxJZH1gO1xuXHR9XG5cblx0LyoqXG5cdCAqIENsYXNzaWZ5IGEgc2luZ2xlIGJsb2NrZWQgc2Vzc2lvbiBpbnRvIGEgc3BlY2lmaWMgcmVxdWlyZXMtaW5wdXQga2luZCwgb3Jcblx0ICogYHVuZGVmaW5lZGAgd2hlbiBpdCBjYW4ndCBiZSBjbGFzc2lmaWVkICh3aGljaCBmb3JjZXMgdGhlIGdlbmVyaWMgbWVzc2FnZSkuXG5cdCAqL1xuXHRwcml2YXRlIF9raW5kT2YoYmxvY2tlZDogSUJsb2NrZWRTZXNzaW9uLCByZWFkZXI6IElSZWFkZXIpOiBSZXF1aXJlc0lucHV0S2luZCB8IHVuZGVmaW5lZCB7XG5cdFx0c3dpdGNoIChibG9ja2VkLnJlYXNvbikge1xuXHRcdFx0Y2FzZSBCbG9ja2VkU2Vzc2lvblJlYXNvbi5GYWlsaW5nQ0k6XG5cdFx0XHRcdHJldHVybiBSZXF1aXJlc0lucHV0S2luZC5GYWlsaW5nQ0k7XG5cdFx0XHRjYXNlIEJsb2NrZWRTZXNzaW9uUmVhc29uLk5lZWRzSW5wdXQ6IHtcblx0XHRcdFx0Y29uc3QgYXBwcm92YWwgPSBnZXRGaXJzdEFwcHJvdmFsQWNyb3NzQ2hhdHModGhpcy5fYXBwcm92YWxNb2RlbCwgYmxvY2tlZC5zZXNzaW9uLCByZWFkZXIpO1xuXHRcdFx0XHRzd2l0Y2ggKGFwcHJvdmFsPy5raW5kKSB7XG5cdFx0XHRcdFx0Y2FzZSBBZ2VudFNlc3Npb25BcHByb3ZhbEtpbmQuVGVybWluYWw6XG5cdFx0XHRcdFx0XHRyZXR1cm4gUmVxdWlyZXNJbnB1dEtpbmQuVGVybWluYWxBcHByb3ZhbDtcblx0XHRcdFx0XHRjYXNlIEFnZW50U2Vzc2lvbkFwcHJvdmFsS2luZC5RdWVzdGlvbjpcblx0XHRcdFx0XHRcdHJldHVybiBSZXF1aXJlc0lucHV0S2luZC5RdWVzdGlvbjtcblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFNBQVMsU0FBK0IsdUJBQXVCO0FBQ3hFLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCLDJCQUEyQiw4QkFBOEI7QUFDNUYsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxzQkFBc0IsdUJBQXdDO0FBQ3ZFLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsbUNBQXFEO0FBT3ZELElBQVcsb0JBQVgsa0JBQVdBLHVCQUFYO0FBRU4sRUFBQUEsc0NBQUE7QUFFQSxFQUFBQSxzQ0FBQTtBQUVBLEVBQUFBLHNDQUFBO0FBTmlCLFNBQUFBO0FBQUEsR0FBQTtBQXNCWCxJQUFNLGdDQUFOLGNBQTRDLFdBQVc7QUFBQSxFQXdEN0QsWUFDQyxlQUNBLGlC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
