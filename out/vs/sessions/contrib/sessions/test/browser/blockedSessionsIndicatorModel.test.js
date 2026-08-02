import assert from "assert";
import { autorun, constObservable, observableValue, transaction } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { AgentSessionApprovalKind, agentSessionApprovalId } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js";
import { BlockedSessionReason } from "../../../blockedSessions/browser/blockedSessions.js";
import { BlockedSessionsIndicatorModel, RequiresInputKind } from "../../browser/blockedSessionsIndicatorModel.js";
suite("BlockedSessionsIndicatorModel", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createModel(options) {
    const blockedModel = new TestBlockedSessions();
    const approvalModel = new TestApprovalModel();
    const ciFixModel = new TestCIFixModel();
    const sessionsService = new TestSessionsService();
    const productService = { quality: options?.quality ?? "insider" };
    const instantiationService = new class extends mock() {
    }();
    const model = store.add(new BlockedSessionsIndicatorModel(
      approvalModel,
      blockedModel,
      ciFixModel,
      sessionsService,
      instantiationService,
      productService
    ));
    store.add(autorun((reader) => {
      model.blockedSessions.read(reader);
    }));
    return { model, blockedModel, approvalModel, ciFixModel, sessionsService };
  }
  function blockedIds(model) {
    return model.blockedSessions.get().map((entry) => entry.session.sessionId);
  }
  test("excludes visible sessions from the blocked set", () => {
    const { model, blockedModel, sessionsService } = createModel();
    const s1 = new TestSession("s1");
    const s2 = new TestSession("s2");
    blockedModel.setBlocked([needsInput(s1), needsInput(s2)]);
    sessionsService.setVisible([s1]);
    assert.deepStrictEqual(blockedIds(model), ["s2"]);
  });
  test("excludes sessions whose CI fix is being submitted", () => {
    const { model, blockedModel, ciFixModel } = createModel();
    const s1 = new TestSession("s1");
    const s2 = new TestSession("s2");
    blockedModel.setBlocked([failingCI(s1), failingCI(s2)]);
    assert.deepStrictEqual(blockedIds(model), ["s1", "s2"]);
    ciFixModel.setHidden(["s1"]);
    assert.deepStrictEqual(blockedIds(model), ["s2"]);
  });
  test("blinks when a new, not-yet-visible session becomes blocked", () => {
    const { model, blockedModel } = createModel();
    blockedModel.setBlocked([needsInput(new TestSession("s1"))]);
    assert.strictEqual(model.consumePendingBlink(), true);
  });
  test("does not blink when a new block is already visible", () => {
    const { model, blockedModel, sessionsService } = createModel();
    const s1 = new TestSession("s1");
    sessionsService.setVisible([s1]);
    blockedModel.setBlocked([needsInput(s1)]);
    assert.strictEqual(model.consumePendingBlink(), false);
  });
  test("acknowledges a blocked session when it becomes visible", () => {
    const { model, blockedModel, sessionsService } = createModel();
    const s1 = new TestSession("s1");
    blockedModel.setBlocked([needsInput(s1)]);
    assert.strictEqual(model.consumePendingBlink(), true);
    sessionsService.setVisible([s1]);
    assert.deepStrictEqual({ blocked: blockedIds(model), blink: model.consumePendingBlink() }, { blocked: [], blink: false });
    sessionsService.setVisible([]);
    assert.deepStrictEqual({ blocked: blockedIds(model), blink: model.consumePendingBlink() }, { blocked: [], blink: false });
  });
  test("keeps an approval acknowledged when its chat model reloads", () => {
    const { model, blockedModel, approvalModel, sessionsService } = createModel();
    const s1 = new TestSession("s1");
    approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal, /* @__PURE__ */ new Date(1e3), "tool-call-1"));
    blockedModel.setBlocked([needsInput(s1)]);
    sessionsService.setVisible([s1]);
    sessionsService.setVisible([]);
    approvalModel.setApproval(s1.resource, void 0);
    approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal, /* @__PURE__ */ new Date(2e3), "tool-call-1"));
    const afterReload = blockedIds(model);
    approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal, /* @__PURE__ */ new Date(3e3), "tool-call-2"));
    assert.deepStrictEqual({ afterReload, afterNewApproval: blockedIds(model) }, { afterReload: [], afterNewApproval: ["s1"] });
  });
  test("blinks again when an additional, not-yet-visible session becomes blocked", () => {
    const { model, blockedModel } = createModel();
    const s1 = new TestSession("s1");
    const s2 = new TestSession("s2");
    blockedModel.setBlocked([needsInput(s1)]);
    assert.strictEqual(model.consumePendingBlink(), true);
    blockedModel.setBlocked([needsInput(s1), needsInput(s2)]);
    assert.strictEqual(model.consumePendingBlink(), true);
  });
  test("does not blink when a queued block becomes visible before the blink plays", () => {
    const { model, blockedModel, sessionsService } = createModel();
    const s1 = new TestSession("s1");
    blockedModel.setBlocked([needsInput(s1)]);
    sessionsService.setVisible([s1]);
    assert.strictEqual(model.consumePendingBlink(), false);
  });
  test("does not blink when a queued block becomes visible then remains acknowledged", () => {
    const { model, blockedModel, sessionsService } = createModel();
    const s1 = new TestSession("s1");
    blockedModel.setBlocked([needsInput(s1)]);
    sessionsService.setVisible([s1]);
    sessionsService.setVisible([]);
    assert.deepStrictEqual({ blocked: blockedIds(model), blink: model.consumePendingBlink() }, { blocked: [], blink: false });
  });
  test("does not blink when a queued block unblocks before the blink plays", () => {
    const { model, blockedModel } = createModel();
    const s1 = new TestSession("s1");
    blockedModel.setBlocked([needsInput(s1)]);
    blockedModel.setBlocked([]);
    assert.strictEqual(model.consumePendingBlink(), false);
  });
  test("consumePendingBlink clears the pending blink", () => {
    const { model, blockedModel } = createModel();
    blockedModel.setBlocked([needsInput(new TestSession("s1"))]);
    assert.deepStrictEqual([model.consumePendingBlink(), model.consumePendingBlink()], [true, false]);
  });
  test("reports a homogeneous requires-input kind", () => {
    const { model, blockedModel, approvalModel } = createModel();
    const s1 = new TestSession("s1");
    const s2 = new TestSession("s2");
    approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal));
    approvalModel.setApproval(s2.resource, approval(AgentSessionApprovalKind.Terminal));
    blockedModel.setBlocked([needsInput(s1), needsInput(s2)]);
    assert.strictEqual(model.requiresInputKind.get(), RequiresInputKind.TerminalApproval);
  });
  test("reports no kind for a mix of reasons", () => {
    const { model, blockedModel, approvalModel } = createModel();
    const s1 = new TestSession("s1");
    const s2 = new TestSession("s2");
    approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal));
    approvalModel.setApproval(s2.resource, approval(AgentSessionApprovalKind.Question));
    blockedModel.setBlocked([needsInput(s1), needsInput(s2)]);
    assert.strictEqual(model.requiresInputKind.get(), void 0);
  });
  test("classifies failing-CI reason", () => {
    const { model, blockedModel } = createModel();
    const ci = new TestSession("ci");
    blockedModel.setBlocked([failingCI(ci)]);
    assert.strictEqual(model.requiresInputKind.get(), RequiresInputKind.FailingCI);
  });
  test("builds the requires-input label per kind and count", () => {
    const { model } = createModel();
    assert.deepStrictEqual({
      terminalOne: model.getRequiresInputLabel(1, RequiresInputKind.TerminalApproval),
      terminalMany: model.getRequiresInputLabel(3, RequiresInputKind.TerminalApproval),
      questionOne: model.getRequiresInputLabel(1, RequiresInputKind.Question),
      failingCIMany: model.getRequiresInputLabel(2, RequiresInputKind.FailingCI),
      genericOne: model.getRequiresInputLabel(1, void 0),
      genericMany: model.getRequiresInputLabel(4, void 0)
    }, {
      terminalOne: "1 session requires terminal approval",
      terminalMany: "3 sessions require terminal approval",
      questionOne: "1 session has a question",
      failingCIMany: "2 sessions are failing CI",
      genericOne: "1 session requires input",
      genericMany: "4 sessions require input"
    });
  });
  test("dismissing an approval hides the session until a distinct approval appears", () => {
    const { model, blockedModel, approvalModel } = createModel();
    const s1 = new TestSession("s1");
    const first = approval(AgentSessionApprovalKind.Terminal, /* @__PURE__ */ new Date(1e3));
    approvalModel.setApproval(s1.resource, first);
    blockedModel.setBlocked([needsInput(s1)]);
    assert.deepStrictEqual(blockedIds(model), ["s1"]);
    model.dismissApproval({ session: s1, approvalId: agentSessionApprovalId(first) });
    assert.deepStrictEqual(blockedIds(model), []);
    approvalModel.setApproval(s1.resource, approval(AgentSessionApprovalKind.Terminal, /* @__PURE__ */ new Date(2e3)));
    assert.deepStrictEqual(blockedIds(model), ["s1"]);
  });
  test("ignores the current input-needed occurrence until the session blocks again", () => {
    const { model, blockedModel } = createModel();
    const s1 = new TestSession("s1");
    blockedModel.setBlocked([needsInput(s1)]);
    model.ignoreSession(s1);
    assert.deepStrictEqual(blockedIds(model), []);
    blockedModel.setBlocked([]);
    blockedModel.setBlocked([needsInput(s1)]);
    assert.deepStrictEqual(blockedIds(model), ["s1"]);
  });
  test("ignores only the current CI failure occurrence", () => {
    const { model, blockedModel } = createModel();
    const s1 = new TestSession("s1");
    blockedModel.setBlocked([failingCI(s1, "sha1")]);
    model.ignoreSession(s1);
    assert.deepStrictEqual(blockedIds(model), []);
    blockedModel.setBlocked([failingCI(s1, "sha2")]);
    assert.deepStrictEqual(blockedIds(model), ["s1"]);
  });
  test("ignores all currently surfaced blocked sessions", () => {
    const { model, blockedModel } = createModel();
    const input = new TestSession("input");
    const ci = new TestSession("ci");
    blockedModel.setBlocked([needsInput(input), failingCI(ci, "sha1")]);
    model.ignoreAllSessions();
    const ignored = blockedIds(model);
    blockedModel.setBlocked([]);
    blockedModel.setBlocked([needsInput(input), failingCI(ci, "sha2")]);
    assert.deepStrictEqual({ ignored, afterNewOccurrences: blockedIds(model) }, { ignored: [], afterNewOccurrences: ["input", "ci"] });
  });
  test("reports nothing and never blinks when disabled (stable quality)", () => {
    const { model, blockedModel } = createModel({ quality: "stable" });
    blockedModel.setBlocked([needsInput(new TestSession("s1"))]);
    assert.deepStrictEqual({ blocked: blockedIds(model), blink: model.consumePendingBlink() }, { blocked: [], blink: false });
  });
});
function needsInput(session) {
  return { session, reason: BlockedSessionReason.NeedsInput, occurrenceId: BlockedSessionReason.NeedsInput };
}
function failingCI(session, headSha = "sha") {
  return { session, reason: BlockedSessionReason.FailingCI, occurrenceId: `${BlockedSessionReason.FailingCI}:${headSha}` };
}
function approval(kind, since = /* @__PURE__ */ new Date(), approvalId = `${kind}:${since.getTime()}`) {
  return { approvalId, kind, label: "npm run build", languageId: void 0, since, confirm: () => {
  } };
}
class TestSession {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.resource = URI.parse(`test-session:/${sessionId}`);
    this.chats = constObservable([{ resource: this.resource }]);
  }
}
class TestBlockedSessions {
  constructor() {
    this.blockedSessionsWithReasons = observableValue("withReasons", []);
    this.blockedSessions = observableValue("blocked", []);
  }
  setBlocked(blocked) {
    transaction((tx) => {
      this.blockedSessionsWithReasons.set(blocked, tx);
      this.blockedSessions.set(blocked.map((entry) => entry.session), tx);
    });
  }
}
class TestApprovalModel {
  constructor() {
    this._approvals = /* @__PURE__ */ new Map();
  }
  getApproval(resource) {
    return this._obs(resource.toString());
  }
  setApproval(resource, info) {
    this._obs(resource.toString()).set(info, void 0);
  }
  _obs(key) {
    let obs = this._approvals.get(key);
    if (!obs) {
      obs = observableValue(`approval.${key}`, void 0);
      this._approvals.set(key, obs);
    }
    return obs;
  }
}
class TestCIFixModel {
  constructor() {
    this.hiddenSessions = observableValue("ciFixHidden", /* @__PURE__ */ new Set());
  }
  setHidden(sessionIds) {
    this.hiddenSessions.set(new Set(sessionIds), void 0);
  }
}
class TestSessionsService {
  constructor() {
    this.visibleSessions = observableValue("visible", []);
  }
  setVisible(sessions) {
    this.visibleSessions.set(sessions, void 0);
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvdGVzdC9icm93c2VyL2Jsb2NrZWRTZXNzaW9uc0luZGljYXRvck1vZGVsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIElPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kLCBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsLCBhZ2VudFNlc3Npb25BcHByb3ZhbElkLCBJQWdlbnRTZXNzaW9uQXBwcm92YWxJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQmxvY2tlZFNlc3Npb25SZWFzb24sIEJsb2NrZWRTZXNzaW9ucywgSUJsb2NrZWRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vYmxvY2tlZFNlc3Npb25zL2Jyb3dzZXIvYmxvY2tlZFNlc3Npb25zLmpzJztcbmltcG9ydCB7IEJsb2NrZWRTZXNzaW9uc0NJRml4TW9kZWwgfSBmcm9tICcuLi8uLi9icm93c2VyL2Jsb2NrZWRTZXNzaW9uc0NJRml4TW9kZWwuanMnO1xuaW1wb3J0IHsgQmxvY2tlZFNlc3Npb25zSW5kaWNhdG9yTW9kZWwsIFJlcXVpcmVzSW5wdXRLaW5kIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9ibG9ja2VkU2Vzc2lvbnNJbmRpY2F0b3JNb2RlbC5qcyc7XG5cbnN1aXRlKCdCbG9ja2VkU2Vzc2lvbnNJbmRpY2F0b3JNb2RlbCcsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vZGVsKG9wdGlvbnM/OiB7IHF1YWxpdHk/OiBzdHJpbmcgfSk6IHtcblx0XHRtb2RlbDogQmxvY2tlZFNlc3Npb25zSW5kaWNhdG9yTW9kZWw7XG5cdFx0YmxvY2tlZE1vZGVsOiBUZXN0QmxvY2tlZFNlc3Npb25zO1xuXHRcdGFwcHJvdmFsTW9kZWw6IFRlc3RBcHByb3ZhbE1vZGVsO1xuXHRcdGNpRml4TW9kZWw6IFRlc3RDSUZpeE1vZGVsO1xuXHRcdHNlc3Npb25zU2VydmljZTogVGVzdFNlc3Npb25zU2VydmljZTtcblx0fSB7XG5cdFx0Y29uc3QgYmxvY2tlZE1vZGVsID0gbmV3IFRlc3RCbG9ja2VkU2Vzc2lvbnMoKTtcblx0XHRjb25zdCBhcHByb3ZhbE1vZGVsID0gbmV3IFRlc3RBcHByb3ZhbE1vZGVsKCk7XG5cdFx0Y29uc3QgY2lGaXhNb2RlbCA9IG5ldyBUZXN0Q0lGaXhNb2RlbCgpO1xuXHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IG5ldyBUZXN0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSB7IHF1YWxpdHk6IG9wdGlvbnM/LnF1YWxpdHkgPz8gJ2luc2lkZXInIH0gYXMgdW5rbm93biBhcyBJUHJvZHVjdFNlcnZpY2U7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElJbnN0YW50aWF0aW9uU2VydmljZT4oKSB7IH0oKTtcblx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChuZXcgQmxvY2tlZFNlc3Npb25zSW5kaWNhdG9yTW9kZWwoXG5cdFx0XHRhcHByb3ZhbE1vZGVsIGFzIHVua25vd24gYXMgQWdlbnRTZXNzaW9uQXBwcm92YWxNb2RlbCxcblx0XHRcdGJsb2NrZWRNb2RlbCBhcyB1bmtub3duIGFzIEJsb2NrZWRTZXNzaW9ucyxcblx0XHRcdGNpRml4TW9kZWwgYXMgdW5rbm93biBhcyBCbG9ja2VkU2Vzc2lvbnNDSUZpeE1vZGVsLFxuXHRcdFx0c2Vzc2lvbnNTZXJ2aWNlIGFzIHVua25vd24gYXMgSVNlc3Npb25zU2VydmljZSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0cHJvZHVjdFNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0Ly8gS2VlcCB0aGUgZGVyaXZlZCBsaXZlIHNvIGl0IHJlY29tcHV0ZXMgb24gdmlzaWJpbGl0eS9kaXNtaXNzYWwgY2hhbmdlcy5cblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4geyBtb2RlbC5ibG9ja2VkU2Vzc2lvbnMucmVhZChyZWFkZXIpOyB9KSk7XG5cdFx0cmV0dXJuIHsgbW9kZWwsIGJsb2NrZWRNb2RlbCwgYXBwcm92YWxNb2RlbCwgY2lGaXhNb2RlbCwgc2Vzc2lvbnNTZXJ2aWNlIH07XG5cdH1cblxuXHRmdW5jdGlvbiBibG9ja2VkSWRzKG1vZGVsOiBCbG9ja2VkU2Vzc2lvbnNJbmRpY2F0b3JNb2RlbCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gbW9kZWwuYmxvY2tlZFNlc3Npb25zLmdldCgpLm1hcChlbnRyeSA9PiBlbnRyeS5zZXNzaW9uLnNlc3Npb25JZCk7XG5cdH1cblxuXHR0ZXN0KCdleGNsdWRlcyB2aXNpYmxlIHNlc3Npb25zIGZyb20gdGhlIGJsb2NrZWQgc2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbW9kZWwsIGJsb2NrZWRNb2RlbCwgc2Vzc2lvbnNTZXJ2aWNlIH0gPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHMxID0gbmV3IFRlc3RTZXNzaW9uKCdzMScpO1xuXHRcdGNvbnN0IHMyID0gbmV3IFRlc3RTZXNzaW9uKCdzMicpO1xuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtuZWVkc0lucHV0KHMxKSwgbmVlZHNJbnB1dChzMildKTtcblx0XHRzZXNzaW9uc1NlcnZpY2Uuc2V0VmlzaWJsZShbczFdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJsb2NrZWRJZHMobW9kZWwpLCBbJ3MyJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdleGNsdWRlcyBzZXNzaW9ucyB3aG9zZSBDSSBmaXggaXMgYmVpbmcgc3VibWl0dGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbW9kZWwsIGJsb2NrZWRNb2RlbCwgY2lGaXhNb2RlbCB9ID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBzMSA9IG5ldyBUZXN0U2Vzc2lvbignczEnKTtcblx0XHRjb25zdCBzMiA9IG5ldyBUZXN0U2Vzc2lvbignczInKTtcblx0XHRibG9ja2VkTW9kZWwuc2V0QmxvY2tlZChbZmFpbGluZ0NJKHMxKSwgZmFpbGluZ0NJKHMyKV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYmxvY2tlZElkcyhtb2RlbCksIFsnczEnLCAnczInXSk7XG5cdFx0Y2lGaXhNb2RlbC5zZXRIaWRkZW4oWydzMSddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJsb2NrZWRJZHMobW9kZWwpLCBbJ3MyJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdibGlua3Mgd2hlbiBhIG5ldywgbm90LXlldC12aXNpYmxlIHNlc3Npb24gYmVjb21lcyBibG9ja2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbW9kZWwsIGJsb2NrZWRNb2RlbCB9ID0gY3JlYXRlTW9kZWwoKTtcblx0XHRibG9ja2VkTW9kZWwuc2V0QmxvY2tlZChbbmVlZHNJbnB1dChuZXcgVGVzdFNlc3Npb24oJ3MxJykpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmNvbnN1bWVQZW5kaW5nQmxpbmsoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGJsaW5rIHdoZW4gYSBuZXcgYmxvY2sgaXMgYWxyZWFkeSB2aXNpYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbW9kZWwsIGJsb2NrZWRNb2RlbCwgc2Vzc2lvbnNTZXJ2aWNlIH0gPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHMxID0gbmV3IFRlc3RTZXNzaW9uKCdzMScpO1xuXHRcdHNlc3Npb25zU2VydmljZS5zZXRWaXNpYmxlKFtzMV0pO1xuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtuZWVkc0lucHV0KHMxKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jb25zdW1lUGVuZGluZ0JsaW5rKCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnYWNrbm93bGVkZ2VzIGEgYmxvY2tlZCBzZXNzaW9uIHdoZW4gaXQgYmVjb21lcyB2aXNpYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbW9kZWwsIGJsb2NrZWRNb2RlbCwgc2Vzc2lvbnNTZXJ2aWNlIH0gPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHMxID0gbmV3IFRlc3RTZXNzaW9uKCdzMScpO1xuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtuZWVkc0lucHV0KHMxKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jb25zdW1lUGVuZGluZ0JsaW5rKCksIHRydWUpO1xuXG5cdFx0c2Vzc2lvbnNTZXJ2aWNlLnNldFZpc2libGUoW3MxXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGJsb2NrZWQ6IGJsb2NrZWRJZHMobW9kZWwpLCBibGluazogbW9kZWwuY29uc3VtZVBlbmRpbmdCbGluaygpIH0sIHsgYmxvY2tlZDogW10sIGJsaW5rOiBmYWxzZSB9KTtcblxuXHRcdHNlc3Npb25zU2VydmljZS5zZXRWaXNpYmxlKFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYmxvY2tlZDogYmxvY2tlZElkcyhtb2RlbCksIGJsaW5rOiBtb2RlbC5jb25zdW1lUGVuZGluZ0JsaW5rKCkgfSwgeyBibG9ja2VkOiBbXSwgYmxpbms6IGZhbHNlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBhbiBhcHByb3ZhbCBhY2tub3dsZWRnZWQgd2hlbiBpdHMgY2hhdCBtb2RlbCByZWxvYWRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbW9kZWwsIGJsb2NrZWRNb2RlbCwgYXBwcm92YWxNb2RlbCwgc2Vzc2lvbnNTZXJ2aWNlIH0gPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHMxID0gbmV3IFRlc3RTZXNzaW9uKCdzMScpO1xuXHRcdGFwcHJvdmFsTW9kZWwuc2V0QXBwcm92YWwoczEucmVzb3VyY2UsIGFwcHJvdmFsKEFnZW50U2Vzc2lvbkFwcHJvdmFsS2luZC5UZXJtaW5hbCwgbmV3IERhdGUoMTAwMCksICd0b29sLWNhbGwtMScpKTtcblx0XHRibG9ja2VkTW9kZWwuc2V0QmxvY2tlZChbbmVlZHNJbnB1dChzMSldKTtcblx0XHRzZXNzaW9uc1NlcnZpY2Uuc2V0VmlzaWJsZShbczFdKTtcblx0XHRzZXNzaW9uc1NlcnZpY2Uuc2V0VmlzaWJsZShbXSk7XG5cblx0XHRhcHByb3ZhbE1vZGVsLnNldEFwcHJvdmFsKHMxLnJlc291cmNlLCB1bmRlZmluZWQpO1xuXHRcdGFwcHJvdmFsTW9kZWwuc2V0QXBwcm92YWwoczEucmVzb3VyY2UsIGFwcHJvdmFsKEFnZW50U2Vzc2lvbkFwcHJvdmFsS2luZC5UZXJtaW5hbCwgbmV3IERhdGUoMjAwMCksICd0b29sLWNhbGwtMScpKTtcblx0XHRjb25zdCBhZnRlclJlbG9hZCA9IGJsb2NrZWRJZHMobW9kZWwpO1xuXHRcdGFwcHJvdmFsTW9kZWwuc2V0QXBwcm92YWwoczEucmVzb3VyY2UsIGFwcHJvdmFsKEFnZW50U2Vzc2lvbkFwcHJvdmFsS2luZC5UZXJtaW5hbCwgbmV3IERhdGUoMzAwMCksICd0b29sLWNhbGwtMicpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhZnRlclJlbG9hZCwgYWZ0ZXJOZXdBcHByb3ZhbDogYmxvY2tlZElkcyhtb2RlbCkgfSwgeyBhZnRlclJlbG9hZDogW10sIGFmdGVyTmV3QXBwcm92YWw6IFsnczEnXSB9KTtcblx0fSk7XG5cblx0dGVzdCgnYmxpbmtzIGFnYWluIHdoZW4gYW4gYWRkaXRpb25hbCwgbm90LXlldC12aXNpYmxlIHNlc3Npb24gYmVjb21lcyBibG9ja2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbW9kZWwsIGJsb2NrZWRNb2RlbCB9ID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBzMSA9IG5ldyBUZXN0U2Vzc2lvbignczEnKTtcblx0XHRjb25zdCBzMiA9IG5ldyBUZXN0U2Vzc2lvbignczInKTtcblx0XHRibG9ja2VkTW9kZWwuc2V0QmxvY2tlZChbbmVlZHNJbnB1dChzMSldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY29uc3VtZVBlbmRpbmdCbGluaygpLCB0cnVlKTtcblx0XHRibG9ja2VkTW9kZWwuc2V0QmxvY2tlZChbbmVlZHNJbnB1dChzMSksIG5lZWRzSW5wdXQoczIpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmNvbnN1bWVQZW5kaW5nQmxpbmsoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGJsaW5rIHdoZW4gYSBxdWV1ZWQgYmxvY2sgYmVjb21lcyB2aXNpYmxlIGJlZm9yZSB0aGUgYmxpbmsgcGxheXMnLCAoKSA9PiB7XG5cdFx0Ly8gU2ltdWxhdGVzIGEgYmxpbmsgcXVldWVkIHdoaWxlIHRoZSBwaWxsIGlzIHN1cHByZXNzZWQgKGUuZy4gdGhlIHRyYW5zaWVudFxuXHRcdC8vIFwiQXBwcm92ZWQgTiBzZXNzaW9uc1wiIHN0YXRlKTogaWYgdGhlIHNlc3Npb24gYmVjb21lcyB2aXNpYmxlIGJlZm9yZSB0aGUgcGlsbFxuXHRcdC8vIHNob3dzLCB0aGUgcXVldWVkIGJsaW5rIG11c3Qgbm90IGZpcmUgb24gdGhlIGxhdGVyIHJlbmRlci5cblx0XHRjb25zdCB7IG1vZGVsLCBibG9ja2VkTW9kZWwsIHNlc3Npb25zU2VydmljZSB9ID0gY3JlYXRlTW9kZWwoKTtcblx0XHRjb25zdCBzMSA9IG5ldyBUZXN0U2Vzc2lvbignczEnKTtcblx0XHRibG9ja2VkTW9kZWwuc2V0QmxvY2tlZChbbmVlZHNJbnB1dChzMSldKTtcblx0XHQvLyBCbGluayBpcyBxdWV1ZWQgYnV0IE5PVCBjb25zdW1lZCB5ZXQgKHBpbGwgc3VwcHJlc3NlZCk7IHRoZSBzZXNzaW9uIHRoZW5cblx0XHQvLyBiZWNvbWVzIHZpc2libGUgYmVmb3JlIHRoZSBwaWxsIHJlbmRlcnMuXG5cdFx0c2Vzc2lvbnNTZXJ2aWNlLnNldFZpc2libGUoW3MxXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmNvbnN1bWVQZW5kaW5nQmxpbmsoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBibGluayB3aGVuIGEgcXVldWVkIGJsb2NrIGJlY29tZXMgdmlzaWJsZSB0aGVuIHJlbWFpbnMgYWNrbm93bGVkZ2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbW9kZWwsIGJsb2NrZWRNb2RlbCwgc2Vzc2lvbnNTZXJ2aWNlIH0gPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHMxID0gbmV3IFRlc3RTZXNzaW9uKCdzMScpO1xuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtuZWVkc0lucHV0KHMxKV0pO1xuXHRcdHNlc3Npb25zU2VydmljZS5zZXRWaXNpYmxlKFtzMV0pO1xuXHRcdHNlc3Npb25zU2VydmljZS5zZXRWaXNpYmxlKFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYmxvY2tlZDogYmxvY2tlZElkcyhtb2RlbCksIGJsaW5rOiBtb2RlbC5jb25zdW1lUGVuZGluZ0JsaW5rKCkgfSwgeyBibG9ja2VkOiBbXSwgYmxpbms6IGZhbHNlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBibGluayB3aGVuIGEgcXVldWVkIGJsb2NrIHVuYmxvY2tzIGJlZm9yZSB0aGUgYmxpbmsgcGxheXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBtb2RlbCwgYmxvY2tlZE1vZGVsIH0gPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHMxID0gbmV3IFRlc3RTZXNzaW9uKCdzMScpO1xuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtuZWVkc0lucHV0KHMxKV0pO1xuXHRcdC8vIFRoZSBzZXNzaW9uIHN0b3BzIGJlaW5nIGJsb2NrZWQgYmVmb3JlIHRoZSBxdWV1ZWQgYmxpbmsgaXMgY29uc3VtZWQuXG5cdFx0YmxvY2tlZE1vZGVsLnNldEJsb2NrZWQoW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jb25zdW1lUGVuZGluZ0JsaW5rKCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY29uc3VtZVBlbmRpbmdCbGluayBjbGVhcnMgdGhlIHBlbmRpbmcgYmxpbmsnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBtb2RlbCwgYmxvY2tlZE1vZGVsIH0gPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtuZWVkc0lucHV0KG5ldyBUZXN0U2Vzc2lvbignczEnKSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFttb2RlbC5jb25zdW1lUGVuZGluZ0JsaW5rKCksIG1vZGVsLmNvbnN1bWVQZW5kaW5nQmxpbmsoKV0sIFt0cnVlLCBmYWxzZV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBvcnRzIGEgaG9tb2dlbmVvdXMgcmVxdWlyZXMtaW5wdXQga2luZCcsICgpID0+IHtcblx0XHRjb25zdCB7IG1vZGVsLCBibG9ja2VkTW9kZWwsIGFwcHJvdmFsTW9kZWwgfSA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgczEgPSBuZXcgVGVzdFNlc3Npb24oJ3MxJyk7XG5cdFx0Y29uc3QgczIgPSBuZXcgVGVzdFNlc3Npb24oJ3MyJyk7XG5cdFx0YXBwcm92YWxNb2RlbC5zZXRBcHByb3ZhbChzMS5yZXNvdXJjZSwgYXBwcm92YWwoQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kLlRlcm1pbmFsKSk7XG5cdFx0YXBwcm92YWxNb2RlbC5zZXRBcHByb3ZhbChzMi5yZXNvdXJjZSwgYXBwcm92YWwoQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kLlRlcm1pbmFsKSk7XG5cdFx0YmxvY2tlZE1vZGVsLnNldEJsb2NrZWQoW25lZWRzSW5wdXQoczEpLCBuZWVkc0lucHV0KHMyKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5yZXF1aXJlc0lucHV0S2luZC5nZXQoKSwgUmVxdWlyZXNJbnB1dEtpbmQuVGVybWluYWxBcHByb3ZhbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgbm8ga2luZCBmb3IgYSBtaXggb2YgcmVhc29ucycsICgpID0+IHtcblx0XHRjb25zdCB7IG1vZGVsLCBibG9ja2VkTW9kZWwsIGFwcHJvdmFsTW9kZWwgfSA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgczEgPSBuZXcgVGVzdFNlc3Npb24oJ3MxJyk7XG5cdFx0Y29uc3QgczIgPSBuZXcgVGVzdFNlc3Npb24oJ3MyJyk7XG5cdFx0YXBwcm92YWxNb2RlbC5zZXRBcHByb3ZhbChzMS5yZXNvdXJjZSwgYXBwcm92YWwoQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kLlRlcm1pbmFsKSk7XG5cdFx0YXBwcm92YWxNb2RlbC5zZXRBcHByb3ZhbChzMi5yZXNvdXJjZSwgYXBwcm92YWwoQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kLlF1ZXN0aW9uKSk7XG5cdFx0YmxvY2tlZE1vZGVsLnNldEJsb2NrZWQoW25lZWRzSW5wdXQoczEpLCBuZWVkc0lucHV0KHMyKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5yZXF1aXJlc0lucHV0S2luZC5nZXQoKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY2xhc3NpZmllcyBmYWlsaW5nLUNJIHJlYXNvbicsICgpID0+IHtcblx0XHRjb25zdCB7IG1vZGVsLCBibG9ja2VkTW9kZWwgfSA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgY2kgPSBuZXcgVGVzdFNlc3Npb24oJ2NpJyk7XG5cdFx0YmxvY2tlZE1vZGVsLnNldEJsb2NrZWQoW2ZhaWxpbmdDSShjaSldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwucmVxdWlyZXNJbnB1dEtpbmQuZ2V0KCksIFJlcXVpcmVzSW5wdXRLaW5kLkZhaWxpbmdDSSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1aWxkcyB0aGUgcmVxdWlyZXMtaW5wdXQgbGFiZWwgcGVyIGtpbmQgYW5kIGNvdW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbW9kZWwgfSA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0ZXJtaW5hbE9uZTogbW9kZWwuZ2V0UmVxdWlyZXNJbnB1dExhYmVsKDEsIFJlcXVpcmVzSW5wdXRLaW5kLlRlcm1pbmFsQXBwcm92YWwpLFxuXHRcdFx0dGVybWluYWxNYW55OiBtb2RlbC5nZXRSZXF1aXJlc0lucHV0TGFiZWwoMywgUmVxdWlyZXNJbnB1dEtpbmQuVGVybWluYWxBcHByb3ZhbCksXG5cdFx0XHRxdWVzdGlvbk9uZTogbW9kZWwuZ2V0UmVxdWlyZXNJbnB1dExhYmVsKDEsIFJlcXVpcmVzSW5wdXRLaW5kLlF1ZXN0aW9uKSxcblx0XHRcdGZhaWxpbmdDSU1hbnk6IG1vZGVsLmdldFJlcXVpcmVzSW5wdXRMYWJlbCgyLCBSZXF1aXJlc0lucHV0S2luZC5GYWlsaW5nQ0kpLFxuXHRcdFx0Z2VuZXJpY09uZTogbW9kZWwuZ2V0UmVxdWlyZXNJbnB1dExhYmVsKDEsIHVuZGVmaW5lZCksXG5cdFx0XHRnZW5lcmljTWFueTogbW9kZWwuZ2V0UmVxdWlyZXNJbnB1dExhYmVsKDQsIHVuZGVmaW5lZCksXG5cdFx0fSwge1xuXHRcdFx0dGVybWluYWxPbmU6ICcxIHNlc3Npb24gcmVxdWlyZXMgdGVybWluYWwgYXBwcm92YWwnLFxuXHRcdFx0dGVybWluYWxNYW55OiAnMyBzZXNzaW9ucyByZXF1aXJlIHRlcm1pbmFsIGFwcHJvdmFsJyxcblx0XHRcdHF1ZXN0aW9uT25lOiAnMSBzZXNzaW9uIGhhcyBhIHF1ZXN0aW9uJyxcblx0XHRcdGZhaWxpbmdDSU1hbnk6ICcyIHNlc3Npb25zIGFyZSBmYWlsaW5nIENJJyxcblx0XHRcdGdlbmVyaWNPbmU6ICcxIHNlc3Npb24gcmVxdWlyZXMgaW5wdXQnLFxuXHRcdFx0Z2VuZXJpY01hbnk6ICc0IHNlc3Npb25zIHJlcXVpcmUgaW5wdXQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNtaXNzaW5nIGFuIGFwcHJvdmFsIGhpZGVzIHRoZSBzZXNzaW9uIHVudGlsIGEgZGlzdGluY3QgYXBwcm92YWwgYXBwZWFycycsICgpID0+IHtcblx0XHRjb25zdCB7IG1vZGVsLCBibG9ja2VkTW9kZWwsIGFwcHJvdmFsTW9kZWwgfSA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgczEgPSBuZXcgVGVzdFNlc3Npb24oJ3MxJyk7XG5cdFx0Y29uc3QgZmlyc3QgPSBhcHByb3ZhbChBZ2VudFNlc3Npb25BcHByb3ZhbEtpbmQuVGVybWluYWwsIG5ldyBEYXRlKDEwMDApKTtcblx0XHRhcHByb3ZhbE1vZGVsLnNldEFwcHJvdmFsKHMxLnJlc291cmNlLCBmaXJzdCk7XG5cdFx0YmxvY2tlZE1vZGVsLnNldEJsb2NrZWQoW25lZWRzSW5wdXQoczEpXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChibG9ja2VkSWRzKG1vZGVsKSwgWydzMSddKTtcblxuXHRcdC8vIFRoZSB1c2VyIGFsbG93cyB0aGUgcGVuZGluZyBhcHByb3ZhbCBcdTIwMTQgdGhlIHNlc3Npb24gZHJvcHMgb3V0IGltbWVkaWF0ZWx5LlxuXHRcdG1vZGVsLmRpc21pc3NBcHByb3ZhbCh7IHNlc3Npb246IHMxIGFzIHVua25vd24gYXMgSVNlc3Npb24sIGFwcHJvdmFsSWQ6IGFnZW50U2Vzc2lvbkFwcHJvdmFsSWQoZmlyc3QpIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYmxvY2tlZElkcyhtb2RlbCksIFtdKTtcblxuXHRcdC8vIEEgbmV3LCBkaXN0aW5jdCBhcHByb3ZhbCByZS1zdXJmYWNlcyB0aGUgc2Vzc2lvbi5cblx0XHRhcHByb3ZhbE1vZGVsLnNldEFwcHJvdmFsKHMxLnJlc291cmNlLCBhcHByb3ZhbChBZ2VudFNlc3Npb25BcHByb3ZhbEtpbmQuVGVybWluYWwsIG5ldyBEYXRlKDIwMDApKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChibG9ja2VkSWRzKG1vZGVsKSwgWydzMSddKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyB0aGUgY3VycmVudCBpbnB1dC1uZWVkZWQgb2NjdXJyZW5jZSB1bnRpbCB0aGUgc2Vzc2lvbiBibG9ja3MgYWdhaW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBtb2RlbCwgYmxvY2tlZE1vZGVsIH0gPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHMxID0gbmV3IFRlc3RTZXNzaW9uKCdzMScpO1xuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtuZWVkc0lucHV0KHMxKV0pO1xuXHRcdG1vZGVsLmlnbm9yZVNlc3Npb24oczEgYXMgdW5rbm93biBhcyBJU2Vzc2lvbik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChibG9ja2VkSWRzKG1vZGVsKSwgW10pO1xuXG5cdFx0YmxvY2tlZE1vZGVsLnNldEJsb2NrZWQoW10pO1xuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtuZWVkc0lucHV0KHMxKV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYmxvY2tlZElkcyhtb2RlbCksIFsnczEnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgb25seSB0aGUgY3VycmVudCBDSSBmYWlsdXJlIG9jY3VycmVuY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBtb2RlbCwgYmxvY2tlZE1vZGVsIH0gPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IHMxID0gbmV3IFRlc3RTZXNzaW9uKCdzMScpO1xuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtmYWlsaW5nQ0koczEsICdzaGExJyldKTtcblx0XHRtb2RlbC5pZ25vcmVTZXNzaW9uKHMxIGFzIHVua25vd24gYXMgSVNlc3Npb24pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYmxvY2tlZElkcyhtb2RlbCksIFtdKTtcblxuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtmYWlsaW5nQ0koczEsICdzaGEyJyldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJsb2NrZWRJZHMobW9kZWwpLCBbJ3MxJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIGFsbCBjdXJyZW50bHkgc3VyZmFjZWQgYmxvY2tlZCBzZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCB7IG1vZGVsLCBibG9ja2VkTW9kZWwgfSA9IGNyZWF0ZU1vZGVsKCk7XG5cdFx0Y29uc3QgaW5wdXQgPSBuZXcgVGVzdFNlc3Npb24oJ2lucHV0Jyk7XG5cdFx0Y29uc3QgY2kgPSBuZXcgVGVzdFNlc3Npb24oJ2NpJyk7XG5cdFx0YmxvY2tlZE1vZGVsLnNldEJsb2NrZWQoW25lZWRzSW5wdXQoaW5wdXQpLCBmYWlsaW5nQ0koY2ksICdzaGExJyldKTtcblx0XHRtb2RlbC5pZ25vcmVBbGxTZXNzaW9ucygpO1xuXHRcdGNvbnN0IGlnbm9yZWQgPSBibG9ja2VkSWRzKG1vZGVsKTtcblxuXHRcdGJsb2NrZWRNb2RlbC5zZXRCbG9ja2VkKFtdKTtcblx0XHRibG9ja2VkTW9kZWwuc2V0QmxvY2tlZChbbmVlZHNJbnB1dChpbnB1dCksIGZhaWxpbmdDSShjaSwgJ3NoYTInKV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGlnbm9yZWQsIGFmdGVyTmV3T2NjdXJyZW5jZXM6IGJsb2NrZWRJZHMobW9kZWwpIH0sIHsgaWdub3JlZDogW10sIGFmdGVyTmV3T2NjdXJyZW5jZXM6IFsnaW5wdXQnLCAnY2knXSB9KTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBub3RoaW5nIGFuZCBuZXZlciBibGlua3Mgd2hlbiBkaXNhYmxlZCAoc3RhYmxlIHF1YWxpdHkpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgbW9kZWwsIGJsb2NrZWRNb2RlbCB9ID0gY3JlYXRlTW9kZWwoeyBxdWFsaXR5OiAnc3RhYmxlJyB9KTtcblx0XHRibG9ja2VkTW9kZWwuc2V0QmxvY2tlZChbbmVlZHNJbnB1dChuZXcgVGVzdFNlc3Npb24oJ3MxJykpXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGJsb2NrZWQ6IGJsb2NrZWRJZHMobW9kZWwpLCBibGluazogbW9kZWwuY29uc3VtZVBlbmRpbmdCbGluaygpIH0sIHsgYmxvY2tlZDogW10sIGJsaW5rOiBmYWxzZSB9KTtcblx0fSk7XG59KTtcblxuZnVuY3Rpb24gbmVlZHNJbnB1dChzZXNzaW9uOiBUZXN0U2Vzc2lvbik6IElCbG9ja2VkU2Vzc2lvbiB7XG5cdHJldHVybiB7IHNlc3Npb246IHNlc3Npb24gYXMgdW5rbm93biBhcyBJU2Vzc2lvbiwgcmVhc29uOiBCbG9ja2VkU2Vzc2lvblJlYXNvbi5OZWVkc0lucHV0LCBvY2N1cnJlbmNlSWQ6IEJsb2NrZWRTZXNzaW9uUmVhc29uLk5lZWRzSW5wdXQgfTtcbn1cblxuZnVuY3Rpb24gZmFpbGluZ0NJKHNlc3Npb246IFRlc3RTZXNzaW9uLCBoZWFkU2hhOiBzdHJpbmcgPSAnc2hhJyk6IElCbG9ja2VkU2Vzc2lvbiB7XG5cdHJldHVybiB7IHNlc3Npb246IHNlc3Npb24gYXMgdW5rbm93biBhcyBJU2Vzc2lvbiwgcmVhc29uOiBCbG9ja2VkU2Vzc2lvblJlYXNvbi5GYWlsaW5nQ0ksIG9jY3VycmVuY2VJZDogYCR7QmxvY2tlZFNlc3Npb25SZWFzb24uRmFpbGluZ0NJfToke2hlYWRTaGF9YCB9O1xufVxuXG5mdW5jdGlvbiBhcHByb3ZhbChraW5kOiBBZ2VudFNlc3Npb25BcHByb3ZhbEtpbmQsIHNpbmNlOiBEYXRlID0gbmV3IERhdGUoKSwgYXBwcm92YWxJZDogc3RyaW5nID0gYCR7a2luZH06JHtzaW5jZS5nZXRUaW1lKCl9YCk6IElBZ2VudFNlc3Npb25BcHByb3ZhbEluZm8ge1xuXHRyZXR1cm4geyBhcHByb3ZhbElkLCBraW5kLCBsYWJlbDogJ25wbSBydW4gYnVpbGQnLCBsYW5ndWFnZUlkOiB1bmRlZmluZWQsIHNpbmNlLCBjb25maXJtOiAoKSA9PiB7IH0gfTtcbn1cblxuY2xhc3MgVGVzdFNlc3Npb24ge1xuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBjaGF0czogSU9ic2VydmFibGU8cmVhZG9ubHkgeyByZWFkb25seSByZXNvdXJjZTogVVJJIH1bXT47XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmcpIHtcblx0XHR0aGlzLnJlc291cmNlID0gVVJJLnBhcnNlKGB0ZXN0LXNlc3Npb246LyR7c2Vzc2lvbklkfWApO1xuXHRcdHRoaXMuY2hhdHMgPSBjb25zdE9ic2VydmFibGUoW3sgcmVzb3VyY2U6IHRoaXMucmVzb3VyY2UgfV0pO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RCbG9ja2VkU2Vzc2lvbnMge1xuXHRyZWFkb25seSBibG9ja2VkU2Vzc2lvbnNXaXRoUmVhc29ucyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQmxvY2tlZFNlc3Npb25bXT4oJ3dpdGhSZWFzb25zJywgW10pO1xuXHRyZWFkb25seSBibG9ja2VkU2Vzc2lvbnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSVNlc3Npb25bXT4oJ2Jsb2NrZWQnLCBbXSk7XG5cblx0c2V0QmxvY2tlZChibG9ja2VkOiByZWFkb25seSBJQmxvY2tlZFNlc3Npb25bXSk6IHZvaWQge1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRoaXMuYmxvY2tlZFNlc3Npb25zV2l0aFJlYXNvbnMuc2V0KGJsb2NrZWQsIHR4KTtcblx0XHRcdHRoaXMuYmxvY2tlZFNlc3Npb25zLnNldChibG9ja2VkLm1hcChlbnRyeSA9PiBlbnRyeS5zZXNzaW9uKSwgdHgpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RBcHByb3ZhbE1vZGVsIHtcblx0cHJpdmF0ZSByZWFkb25seSBfYXBwcm92YWxzID0gbmV3IE1hcDxzdHJpbmcsIElTZXR0YWJsZU9ic2VydmFibGU8SUFnZW50U2Vzc2lvbkFwcHJvdmFsSW5mbyB8IHVuZGVmaW5lZD4+KCk7XG5cblx0Z2V0QXBwcm92YWwocmVzb3VyY2U6IFVSSSk6IElPYnNlcnZhYmxlPElBZ2VudFNlc3Npb25BcHByb3ZhbEluZm8gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb2JzKHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0c2V0QXBwcm92YWwocmVzb3VyY2U6IFVSSSwgaW5mbzogSUFnZW50U2Vzc2lvbkFwcHJvdmFsSW5mbyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX29icyhyZXNvdXJjZS50b1N0cmluZygpKS5zZXQoaW5mbywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX29icyhrZXk6IHN0cmluZyk6IElTZXR0YWJsZU9ic2VydmFibGU8SUFnZW50U2Vzc2lvbkFwcHJvdmFsSW5mbyB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBvYnMgPSB0aGlzLl9hcHByb3ZhbHMuZ2V0KGtleSk7XG5cdFx0aWYgKCFvYnMpIHtcblx0XHRcdG9icyA9IG9ic2VydmFibGVWYWx1ZTxJQWdlbnRTZXNzaW9uQXBwcm92YWxJbmZvIHwgdW5kZWZpbmVkPihgYXBwcm92YWwuJHtrZXl9YCwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX2FwcHJvdmFscy5zZXQoa2V5LCBvYnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gb2JzO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RDSUZpeE1vZGVsIHtcblx0cmVhZG9ubHkgaGlkZGVuU2Vzc2lvbnMgPSBvYnNlcnZhYmxlVmFsdWU8UmVhZG9ubHlTZXQ8c3RyaW5nPj4oJ2NpRml4SGlkZGVuJywgbmV3IFNldCgpKTtcblxuXHRzZXRIaWRkZW4oc2Vzc2lvbklkczogcmVhZG9ubHkgc3RyaW5nW10pOiB2b2lkIHtcblx0XHR0aGlzLmhpZGRlblNlc3Npb25zLnNldChuZXcgU2V0KHNlc3Npb25JZHMpLCB1bmRlZmluZWQpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RTZXNzaW9uc1NlcnZpY2Uge1xuXHRyZWFkb25seSB2aXNpYmxlU2Vzc2lvbnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgKElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKVtdPigndmlzaWJsZScsIFtdKTtcblxuXHRzZXRWaXNpYmxlKHNlc3Npb25zOiByZWFkb25seSBUZXN0U2Vzc2lvbltdKTogdm9pZCB7XG5cdFx0dGhpcy52aXNpYmxlU2Vzc2lvbnMuc2V0KHNlc3Npb25zIGFzIHVua25vd24gYXMgcmVhZG9ubHkgSUFjdGl2ZVNlc3Npb25bXSwgdW5kZWZpbmVkKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsU0FBUyxpQkFBbUQsaUJBQWlCLG1CQUFtQjtBQUN6RyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBR3hELFNBQVMsMEJBQXFELDhCQUF5RDtBQUl2SCxTQUFTLDRCQUE4RDtBQUV2RSxTQUFTLCtCQUErQix5QkFBeUI7QUFFakUsTUFBTSxpQ0FBaUMsTUFBTTtBQUU1QyxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELFdBQVMsWUFBWSxTQU1uQjtBQUNELFVBQU0sZUFBZSxJQUFJLG9CQUFvQjtBQUM3QyxVQUFNLGdCQUFnQixJQUFJLGtCQUFrQjtBQUM1QyxVQUFNLGFBQWEsSUFBSSxlQUFlO0FBQ3RDLFVBQU0sa0JBQWtCLElBQUks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
