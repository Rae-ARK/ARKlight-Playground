import assert from "assert";
import { observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { VoiceToolDispatchService } from "../../../browser/voiceClient/voiceToolDispatchService.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../common/chatService/chatService.js";
import { ChatPlanReviewData } from "../../../common/model/chatProgressTypes/chatPlanReviewData.js";
import { ChatQuestionCarouselData } from "../../../common/model/chatProgressTypes/chatQuestionCarouselData.js";
import { AskQuestionsToolId } from "../../../common/tools/builtinTools/askQuestionsTool.js";
import { derivePendingId } from "../../../common/voiceClient/voiceClientService.js";
suite("VoiceToolDispatchService - respondToSession", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const sessionResource = URI.parse("agent-session://test/one");
  const requestId = "req-1";
  function serviceFor(part) {
    const model = new class extends mock() {
      getRequests() {
        return [{ id: requestId, response: { response: { value: [part] } } }];
      }
    }();
    const agentSessionsService = new class extends mock() {
      get model() {
        return { sessions: [{ isArchived: () => false, resource: sessionResource }] };
      }
    }();
    const chatService = new class extends mock() {
      getSession() {
        return model;
      }
      notifyQuestionCarouselAnswer() {
      }
    }();
    return new VoiceToolDispatchService(
      agentSessionsService,
      chatService,
      new class extends mock() {
      }()
    );
  }
  function approvalCall(part, type) {
    return {
      name: "respond_to_session",
      args: {
        coding_session_id: sessionResource.toString(),
        request_id: requestId,
        pending_id: derivePendingId(requestId, part),
        response: { type }
      }
    };
  }
  function carousel(allowSkip = false) {
    return new ChatQuestionCarouselData([{
      id: "region",
      type: "singleSelect",
      title: "Region",
      message: "Which region should this deploy to?",
      options: [
        { id: "west", label: "West US", value: "westus" },
        { id: "east", label: "East US", value: "eastus" }
      ]
    }], allowSkip, "resolve-1");
  }
  function answerCall(part, response) {
    return {
      name: "respond_to_session",
      args: {
        coding_session_id: sessionResource.toString(),
        request_id: requestId,
        pending_id: derivePendingId(requestId, part),
        response
      }
    };
  }
  test("a spoken answer submits the form", async () => {
    const part = carousel();
    const call = answerCall(part, { type: "answer", answers: [{ question_id: "region", value: "eastus" }] });
    const result = await serviceFor(part).respondToSession(call);
    const answers = { region: { selectedValue: "eastus" } };
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(part.isUsed, true);
    assert.deepStrictEqual(part.data, answers);
    assert.deepStrictEqual(await part.completion.p, { answers });
  });
  test("a value the form does not offer leaves it untouched", async () => {
    const part = carousel();
    const call = answerCall(part, { type: "answer", answers: [{ question_id: "region", value: "West US" }] });
    const result = await serviceFor(part).respondToSession(call);
    assert.deepStrictEqual(result, { ok: false, reason: "invalid_answer" });
    assert.strictEqual(part.isUsed, void 0);
  });
  test("an approval spoken at a question form is refused rather than applied", async () => {
    const part = carousel();
    const result = await serviceFor(part).respondToSession(approvalCall(part, "approve"));
    assert.deepStrictEqual(result, { ok: false, reason: "unsupported" });
    assert.strictEqual(part.isUsed, void 0);
  });
  test("an approval spoken at the ask-questions tool is refused rather than applied", async () => {
    const confirmations = [];
    const part = new class extends mock() {
      constructor() {
        super(...arguments);
        this.kind = "toolInvocation";
        this.toolId = AskQuestionsToolId;
        this.state = observableValue("state", {
          type: IChatToolInvocation.StateKind.WaitingForConfirmation,
          parameters: { questions: [{ question: "Which region?", options: [{ label: "West US" }] }] },
          confirmationMessages: {
            title: "Answer questions?",
            message: "The questionnaire is open."
          },
          confirm: (reason) => confirmations.push(reason.type)
        });
      }
    }();
    const result = await serviceFor(part).respondToSession(approvalCall(part, "approve"));
    assert.deepStrictEqual({ result, confirmations }, {
      result: { ok: false, reason: "unsupported" },
      confirmations: []
    });
  });
  test("tool and plan confirmations remain voice-approvable", async () => {
    const confirmations = [];
    const tool = new class extends mock() {
      constructor() {
        super(...arguments);
        this.kind = "toolInvocation";
        this.toolId = "testTool";
        this.state = observableValue("state", {
          type: IChatToolInvocation.StateKind.WaitingForConfirmation,
          parameters: {},
          confirmationMessages: {
            title: "Run the build?",
            message: "Runs the visible build task."
          },
          confirm: (reason) => confirmations.push(reason.type)
        });
      }
    }();
    const plan = new ChatPlanReviewData("Review plan", "Plan body", [
      { id: "implement", label: "Implement Plan", default: true }
    ], true);
    const toolResult = await serviceFor(tool).respondToSession(approvalCall(tool, "approve"));
    const planResult = await serviceFor(plan).respondToSession(approvalCall(plan, "approve"));
    assert.deepStrictEqual({
      toolResult,
      confirmations,
      planResult,
      planData: plan.data,
      planCompletion: await plan.completion.p
    }, {
      toolResult: { ok: true },
      confirmations: [ToolConfirmKind.UserAction],
      planResult: { ok: true },
      planData: {
        action: "Implement Plan",
        actionId: "implement",
        rejected: false
      },
      planCompletion: {
        action: "Implement Plan",
        actionId: "implement",
        rejected: false
      }
    });
  });
  test("a skip is refused when the form forbids it", async () => {
    const part = carousel();
    const result = await serviceFor(part).respondToSession(answerCall(part, { type: "skip" }));
    assert.deepStrictEqual(result, { ok: false, reason: "stale_pending" });
    assert.strictEqual(part.isUsed, void 0);
  });
  test("a skip submits an unanswered form when the form allows it", async () => {
    const part = carousel(true);
    const result = await serviceFor(part).respondToSession(answerCall(part, { type: "skip" }));
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(part.isUsed, true);
  });
  test("an answer is refused once the form has been used", async () => {
    const part = carousel();
    part.dismiss({ region: { selectedValue: "westus" } });
    const call = answerCall(part, { type: "answer", answers: [{ question_id: "region", value: "eastus" }] });
    const result = await serviceFor(part).respondToSession(call);
    assert.deepStrictEqual(result, { ok: false, reason: "stale_pending" });
    assert.deepStrictEqual(part.data, { region: { selectedValue: "westus" } });
  });
  test("refuses an answer that leaves a required question blank", async () => {
    const part = new ChatQuestionCarouselData([
      { id: "region", type: "singleSelect", title: "Region", options: [{ id: "west", label: "West US", value: "westus" }] },
      { id: "tier", type: "singleSelect", title: "Tier", required: true, options: [{ id: "std", label: "Standard", value: "standard" }] }
    ], true, "resolve-1");
    const call = answerCall(part, { type: "answer", answers: [{ question_id: "region", value: "westus" }] });
    assert.deepStrictEqual(await serviceFor(part).respondToSession(call), { ok: false, reason: "invalid_answer" });
    assert.strictEqual(part.isUsed, void 0);
  });
  test("skipping may leave a required question blank", async () => {
    const part = new ChatQuestionCarouselData([
      { id: "tier", type: "singleSelect", title: "Tier", required: true, options: [{ id: "std", label: "Standard", value: "standard" }] }
    ], true, "resolve-1");
    assert.deepStrictEqual(await serviceFor(part).respondToSession(answerCall(part, { type: "skip" })), { ok: true });
  });
  test("refuses a malformed answers field rather than reading it as empty", async () => {
    const part = carousel(true);
    const result = await serviceFor(part).respondToSession(answerCall(part, { type: "skip", answers: "westus" }));
    assert.deepStrictEqual(result, { ok: false, reason: "invalid_answer" });
    assert.strictEqual(part.isUsed, void 0);
  });
  test("refuses an unresolvable carousel without marking it answered", async () => {
    const part = {
      kind: "questionCarousel",
      questions: [{ id: "region", type: "singleSelect", title: "Region", options: [{ id: "west", label: "West US", value: "westus" }] }],
      isUsed: false,
      data: void 0
    };
    const result = await serviceFor(part).respondToSession(
      answerCall(part, { type: "answer", answers: [{ question_id: "region", value: "westus" }] })
    );
    assert.deepStrictEqual(result, { ok: false, reason: "unsupported" });
    assert.strictEqual(part.isUsed, false);
    assert.strictEqual(part.data, void 0);
  });
  test("refuses an id minted for a part that has since been replaced", async () => {
    const published = carousel();
    const call = answerCall(published, { type: "answer", answers: [{ question_id: "region", value: "eastus" }] });
    const replacement = carousel();
    const result = await serviceFor(replacement).respondToSession(call);
    assert.deepStrictEqual(result, { ok: false, reason: "stale_pending" });
    assert.strictEqual(replacement.isUsed, void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlVG9vbERpc3BhdGNoU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc01vZGVsLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBWb2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlVG9vbERpc3BhdGNoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFF1ZXN0aW9uQW5zd2VycywgSUNoYXRTZXJ2aWNlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFBsYW5SZXZpZXdEYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRQbGFuUmV2aWV3RGF0YS5qcyc7XG5pbXBvcnQgeyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXNrUXVlc3Rpb25zVG9vbElkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9hc2tRdWVzdGlvbnNUb29sLmpzJztcbmltcG9ydCB7IGRlcml2ZVBlbmRpbmdJZCwgSVZvaWNlVG9vbENhbGwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdm9pY2VDbGllbnQvdm9pY2VDbGllbnRTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ1ZvaWNlVG9vbERpc3BhdGNoU2VydmljZSAtIHJlc3BvbmRUb1Nlc3Npb24nLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnYWdlbnQtc2Vzc2lvbjovL3Rlc3Qvb25lJyk7XG5cdGNvbnN0IHJlcXVlc3RJZCA9ICdyZXEtMSc7XG5cblx0ZnVuY3Rpb24gc2VydmljZUZvcihwYXJ0OiBvYmplY3QpOiBWb2ljZVRvb2xEaXNwYXRjaFNlcnZpY2Uge1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdE1vZGVsPigpIHtcblx0XHRcdG92ZXJyaWRlIGdldFJlcXVlc3RzKCkge1xuXHRcdFx0XHRyZXR1cm4gW3sgaWQ6IHJlcXVlc3RJZCwgcmVzcG9uc2U6IHsgcmVzcG9uc2U6IHsgdmFsdWU6IFtwYXJ0XSB9IH0gfV0gYXMgdW5rbm93biBhcyBSZXR1cm5UeXBlPElDaGF0TW9kZWxbJ2dldFJlcXVlc3RzJ10+O1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uc1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXQgbW9kZWwoKTogSUFnZW50U2Vzc2lvbnNNb2RlbCB7XG5cdFx0XHRcdHJldHVybiB7IHNlc3Npb25zOiBbeyBpc0FyY2hpdmVkOiAoKSA9PiBmYWxzZSwgcmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZSB9XSB9IGFzIElBZ2VudFNlc3Npb25zTW9kZWw7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBjaGF0U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb24oKSB7XG5cdFx0XHRcdHJldHVybiBtb2RlbCBhcyBJQ2hhdE1vZGVsO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgbm90aWZ5UXVlc3Rpb25DYXJvdXNlbEFuc3dlcigpIHsgfVxuXHRcdH07XG5cdFx0cmV0dXJuIG5ldyBWb2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UoXG5cdFx0XHRhZ2VudFNlc3Npb25zU2VydmljZSxcblx0XHRcdGNoYXRTZXJ2aWNlLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZT4oKSB7IH0sXG5cdFx0KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFwcHJvdmFsQ2FsbChwYXJ0OiBvYmplY3QsIHR5cGU6ICdhcHByb3ZlJyB8ICdyZWplY3QnKTogSVZvaWNlVG9vbENhbGwge1xuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiAncmVzcG9uZF90b19zZXNzaW9uJyxcblx0XHRcdGFyZ3M6IHtcblx0XHRcdFx0Y29kaW5nX3Nlc3Npb25faWQ6IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRyZXF1ZXN0X2lkOiByZXF1ZXN0SWQsXG5cdFx0XHRcdHBlbmRpbmdfaWQ6IGRlcml2ZVBlbmRpbmdJZChyZXF1ZXN0SWQsIHBhcnQpLFxuXHRcdFx0XHRyZXNwb25zZTogeyB0eXBlIH0sXG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJVm9pY2VUb29sQ2FsbDtcblx0fVxuXG5cdGZ1bmN0aW9uIGNhcm91c2VsKGFsbG93U2tpcCA9IGZhbHNlKTogQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhIHtcblx0XHRyZXR1cm4gbmV3IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YShbe1xuXHRcdFx0aWQ6ICdyZWdpb24nLFxuXHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHR0aXRsZTogJ1JlZ2lvbicsXG5cdFx0XHRtZXNzYWdlOiAnV2hpY2ggcmVnaW9uIHNob3VsZCB0aGlzIGRlcGxveSB0bz8nLFxuXHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHR7IGlkOiAnd2VzdCcsIGxhYmVsOiAnV2VzdCBVUycsIHZhbHVlOiAnd2VzdHVzJyB9LFxuXHRcdFx0XHR7IGlkOiAnZWFzdCcsIGxhYmVsOiAnRWFzdCBVUycsIHZhbHVlOiAnZWFzdHVzJyB9LFxuXHRcdFx0XSxcblx0XHR9XSwgYWxsb3dTa2lwLCAncmVzb2x2ZS0xJyk7XG5cdH1cblxuXHRmdW5jdGlvbiBhbnN3ZXJDYWxsKHBhcnQ6IG9iamVjdCwgcmVzcG9uc2U6IG9iamVjdCk6IElWb2ljZVRvb2xDYWxsIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogJ3Jlc3BvbmRfdG9fc2Vzc2lvbicsXG5cdFx0XHRhcmdzOiB7XG5cdFx0XHRcdGNvZGluZ19zZXNzaW9uX2lkOiBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0cmVxdWVzdF9pZDogcmVxdWVzdElkLFxuXHRcdFx0XHRwZW5kaW5nX2lkOiBkZXJpdmVQZW5kaW5nSWQocmVxdWVzdElkLCBwYXJ0KSxcblx0XHRcdFx0cmVzcG9uc2UsXG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJVm9pY2VUb29sQ2FsbDtcblx0fVxuXG5cdC8vIFRoZSByZXBvcnRlZCBidWc6IGEgc3Bva2VuIGFuc3dlciBsZWZ0IHRoZSBmb3JtIG9uIHNjcmVlbiwgdW5hbnN3ZXJlZC5cblxuXHR0ZXN0KCdhIHNwb2tlbiBhbnN3ZXIgc3VibWl0cyB0aGUgZm9ybScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJ0ID0gY2Fyb3VzZWwoKTtcblx0XHRjb25zdCBjYWxsID0gYW5zd2VyQ2FsbChwYXJ0LCB7IHR5cGU6ICdhbnN3ZXInLCBhbnN3ZXJzOiBbeyBxdWVzdGlvbl9pZDogJ3JlZ2lvbicsIHZhbHVlOiAnZWFzdHVzJyB9XSB9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2VGb3IocGFydCkucmVzcG9uZFRvU2Vzc2lvbihjYWxsKTtcblxuXHRcdGNvbnN0IGFuc3dlcnM6IElDaGF0UXVlc3Rpb25BbnN3ZXJzID0geyByZWdpb246IHsgc2VsZWN0ZWRWYWx1ZTogJ2Vhc3R1cycgfSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IG9rOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmlzVXNlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0LmRhdGEsIGFuc3dlcnMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgcGFydC5jb21wbGV0aW9uLnAsIHsgYW5zd2VycyB9KTtcblx0fSk7XG5cblx0dGVzdCgnYSB2YWx1ZSB0aGUgZm9ybSBkb2VzIG5vdCBvZmZlciBsZWF2ZXMgaXQgdW50b3VjaGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoZSBiYWNrZW5kIHJlc29sdmVzIG9yZGluYWxzIGFnYWluc3QgaXRzIG93biBtaXJyb3IsIHNvIGFuIHVubWF0Y2hlZFxuXHRcdC8vIHZhbHVlIG1lYW5zIHRoYXQgbWlycm9yIHdhcyBzdGFsZS4gQW5zd2VyaW5nIHdpdGggYSBndWVzcyB3b3VsZCBzdWJtaXRcblx0XHQvLyBzb21ldGhpbmcgdGhlIHVzZXIgbmV2ZXIgY2hvc2UuXG5cdFx0Y29uc3QgcGFydCA9IGNhcm91c2VsKCk7XG5cdFx0Y29uc3QgY2FsbCA9IGFuc3dlckNhbGwocGFydCwgeyB0eXBlOiAnYW5zd2VyJywgYW5zd2VyczogW3sgcXVlc3Rpb25faWQ6ICdyZWdpb24nLCB2YWx1ZTogJ1dlc3QgVVMnIH1dIH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZUZvcihwYXJ0KS5yZXNwb25kVG9TZXNzaW9uKGNhbGwpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgb2s6IGZhbHNlLCByZWFzb246ICdpbnZhbGlkX2Fuc3dlcicgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuaXNVc2VkLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhbiBhcHByb3ZhbCBzcG9rZW4gYXQgYSBxdWVzdGlvbiBmb3JtIGlzIHJlZnVzZWQgcmF0aGVyIHRoYW4gYXBwbGllZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJ0ID0gY2Fyb3VzZWwoKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2VGb3IocGFydCkucmVzcG9uZFRvU2Vzc2lvbihhcHByb3ZhbENhbGwocGFydCwgJ2FwcHJvdmUnKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBvazogZmFsc2UsIHJlYXNvbjogJ3Vuc3VwcG9ydGVkJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5pc1VzZWQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FuIGFwcHJvdmFsIHNwb2tlbiBhdCB0aGUgYXNrLXF1ZXN0aW9ucyB0b29sIGlzIHJlZnVzZWQgcmF0aGVyIHRoYW4gYXBwbGllZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maXJtYXRpb25zOiBUb29sQ29uZmlybUtpbmRbXSA9IFtdO1xuXHRcdGNvbnN0IHBhcnQgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0VG9vbEludm9jYXRpb24+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkga2luZCA9ICd0b29sSW52b2NhdGlvbicgYXMgY29uc3Q7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSB0b29sSWQgPSBBc2tRdWVzdGlvbnNUb29sSWQ7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBzdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlPignc3RhdGUnLCB7XG5cdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgcXVlc3Rpb25zOiBbeyBxdWVzdGlvbjogJ1doaWNoIHJlZ2lvbj8nLCBvcHRpb25zOiBbeyBsYWJlbDogJ1dlc3QgVVMnIH1dIH1dIH0sXG5cdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB7XG5cdFx0XHRcdFx0dGl0bGU6ICdBbnN3ZXIgcXVlc3Rpb25zPycsXG5cdFx0XHRcdFx0bWVzc2FnZTogJ1RoZSBxdWVzdGlvbm5haXJlIGlzIG9wZW4uJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29uZmlybTogcmVhc29uID0+IGNvbmZpcm1hdGlvbnMucHVzaChyZWFzb24udHlwZSksXG5cdFx0XHR9KTtcblx0XHR9KCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlRm9yKHBhcnQpLnJlc3BvbmRUb1Nlc3Npb24oYXBwcm92YWxDYWxsKHBhcnQsICdhcHByb3ZlJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJlc3VsdCwgY29uZmlybWF0aW9ucyB9LCB7XG5cdFx0XHRyZXN1bHQ6IHsgb2s6IGZhbHNlLCByZWFzb246ICd1bnN1cHBvcnRlZCcgfSxcblx0XHRcdGNvbmZpcm1hdGlvbnM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0b29sIGFuZCBwbGFuIGNvbmZpcm1hdGlvbnMgcmVtYWluIHZvaWNlLWFwcHJvdmFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlybWF0aW9uczogVG9vbENvbmZpcm1LaW5kW10gPSBbXTtcblx0XHRjb25zdCB0b29sID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFRvb2xJbnZvY2F0aW9uPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGtpbmQgPSAndG9vbEludm9jYXRpb24nIGFzIGNvbnN0O1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdG9vbElkID0gJ3Rlc3RUb29sJztcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0VG9vbEludm9jYXRpb24uU3RhdGU+KCdzdGF0ZScsIHtcblx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbixcblx0XHRcdFx0cGFyYW1ldGVyczoge30sXG5cdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB7XG5cdFx0XHRcdFx0dGl0bGU6ICdSdW4gdGhlIGJ1aWxkPycsXG5cdFx0XHRcdFx0bWVzc2FnZTogJ1J1bnMgdGhlIHZpc2libGUgYnVpbGQgdGFzay4nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb25maXJtOiByZWFzb24gPT4gY29uZmlybWF0aW9ucy5wdXNoKHJlYXNvbi50eXBlKSxcblx0XHRcdH0pO1xuXHRcdH0oKTtcblx0XHRjb25zdCBwbGFuID0gbmV3IENoYXRQbGFuUmV2aWV3RGF0YSgnUmV2aWV3IHBsYW4nLCAnUGxhbiBib2R5JywgW1xuXHRcdFx0eyBpZDogJ2ltcGxlbWVudCcsIGxhYmVsOiAnSW1wbGVtZW50IFBsYW4nLCBkZWZhdWx0OiB0cnVlIH0sXG5cdFx0XSwgdHJ1ZSk7XG5cblx0XHRjb25zdCB0b29sUmVzdWx0ID0gYXdhaXQgc2VydmljZUZvcih0b29sKS5yZXNwb25kVG9TZXNzaW9uKGFwcHJvdmFsQ2FsbCh0b29sLCAnYXBwcm92ZScpKTtcblx0XHRjb25zdCBwbGFuUmVzdWx0ID0gYXdhaXQgc2VydmljZUZvcihwbGFuKS5yZXNwb25kVG9TZXNzaW9uKGFwcHJvdmFsQ2FsbChwbGFuLCAnYXBwcm92ZScpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dG9vbFJlc3VsdCxcblx0XHRcdGNvbmZpcm1hdGlvbnMsXG5cdFx0XHRwbGFuUmVzdWx0LFxuXHRcdFx0cGxhbkRhdGE6IHBsYW4uZGF0YSxcblx0XHRcdHBsYW5Db21wbGV0aW9uOiBhd2FpdCBwbGFuLmNvbXBsZXRpb24ucCxcblx0XHR9LCB7XG5cdFx0XHR0b29sUmVzdWx0OiB7IG9rOiB0cnVlIH0sXG5cdFx0XHRjb25maXJtYXRpb25zOiBbVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb25dLFxuXHRcdFx0cGxhblJlc3VsdDogeyBvazogdHJ1ZSB9LFxuXHRcdFx0cGxhbkRhdGE6IHtcblx0XHRcdFx0YWN0aW9uOiAnSW1wbGVtZW50IFBsYW4nLFxuXHRcdFx0XHRhY3Rpb25JZDogJ2ltcGxlbWVudCcsXG5cdFx0XHRcdHJlamVjdGVkOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XHRwbGFuQ29tcGxldGlvbjoge1xuXHRcdFx0XHRhY3Rpb246ICdJbXBsZW1lbnQgUGxhbicsXG5cdFx0XHRcdGFjdGlvbklkOiAnaW1wbGVtZW50Jyxcblx0XHRcdFx0cmVqZWN0ZWQ6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBza2lwIGlzIHJlZnVzZWQgd2hlbiB0aGUgZm9ybSBmb3JiaWRzIGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnQgPSBjYXJvdXNlbCgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZUZvcihwYXJ0KS5yZXNwb25kVG9TZXNzaW9uKGFuc3dlckNhbGwocGFydCwgeyB0eXBlOiAnc2tpcCcgfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgb2s6IGZhbHNlLCByZWFzb246ICdzdGFsZV9wZW5kaW5nJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5pc1VzZWQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Egc2tpcCBzdWJtaXRzIGFuIHVuYW5zd2VyZWQgZm9ybSB3aGVuIHRoZSBmb3JtIGFsbG93cyBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJ0ID0gY2Fyb3VzZWwodHJ1ZSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlRm9yKHBhcnQpLnJlc3BvbmRUb1Nlc3Npb24oYW5zd2VyQ2FsbChwYXJ0LCB7IHR5cGU6ICdza2lwJyB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBvazogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5pc1VzZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdhbiBhbnN3ZXIgaXMgcmVmdXNlZCBvbmNlIHRoZSBmb3JtIGhhcyBiZWVuIHVzZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydCA9IGNhcm91c2VsKCk7XG5cdFx0cGFydC5kaXNtaXNzKHsgcmVnaW9uOiB7IHNlbGVjdGVkVmFsdWU6ICd3ZXN0dXMnIH0gfSk7XG5cdFx0Y29uc3QgY2FsbCA9IGFuc3dlckNhbGwocGFydCwgeyB0eXBlOiAnYW5zd2VyJywgYW5zd2VyczogW3sgcXVlc3Rpb25faWQ6ICdyZWdpb24nLCB2YWx1ZTogJ2Vhc3R1cycgfV0gfSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlRm9yKHBhcnQpLnJlc3BvbmRUb1Nlc3Npb24oY2FsbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBvazogZmFsc2UsIHJlYXNvbjogJ3N0YWxlX3BlbmRpbmcnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFydC5kYXRhLCB7IHJlZ2lvbjogeyBzZWxlY3RlZFZhbHVlOiAnd2VzdHVzJyB9IH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZ1c2VzIGFuIGFuc3dlciB0aGF0IGxlYXZlcyBhIHJlcXVpcmVkIHF1ZXN0aW9uIGJsYW5rJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoZSB3aWRnZXQgd2lsbCBub3Qgc3VibWl0IHRoaXMgZm9ybTsgbmVpdGhlciBtYXkgYSBzcG9rZW4gYW5zd2VyLlxuXHRcdGNvbnN0IHBhcnQgPSBuZXcgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhKFtcblx0XHRcdHsgaWQ6ICdyZWdpb24nLCB0eXBlOiAnc2luZ2xlU2VsZWN0JywgdGl0bGU6ICdSZWdpb24nLCBvcHRpb25zOiBbeyBpZDogJ3dlc3QnLCBsYWJlbDogJ1dlc3QgVVMnLCB2YWx1ZTogJ3dlc3R1cycgfV0gfSxcblx0XHRcdHsgaWQ6ICd0aWVyJywgdHlwZTogJ3NpbmdsZVNlbGVjdCcsIHRpdGxlOiAnVGllcicsIHJlcXVpcmVkOiB0cnVlLCBvcHRpb25zOiBbeyBpZDogJ3N0ZCcsIGxhYmVsOiAnU3RhbmRhcmQnLCB2YWx1ZTogJ3N0YW5kYXJkJyB9XSB9LFxuXHRcdF0sIHRydWUsICdyZXNvbHZlLTEnKTtcblx0XHRjb25zdCBjYWxsID0gYW5zd2VyQ2FsbChwYXJ0LCB7IHR5cGU6ICdhbnN3ZXInLCBhbnN3ZXJzOiBbeyBxdWVzdGlvbl9pZDogJ3JlZ2lvbicsIHZhbHVlOiAnd2VzdHVzJyB9XSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZUZvcihwYXJ0KS5yZXNwb25kVG9TZXNzaW9uKGNhbGwpLCB7IG9rOiBmYWxzZSwgcmVhc29uOiAnaW52YWxpZF9hbnN3ZXInIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmlzVXNlZCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHBpbmcgbWF5IGxlYXZlIGEgcmVxdWlyZWQgcXVlc3Rpb24gYmxhbmsnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2tpcCBpcyB0aGUgdXNlciBkZWNsaW5pbmcgdGhlIGZvcm0sIG5vdCBhbiBpbmNvbXBsZXRlIHN1Ym1pc3Npb24uXG5cdFx0Y29uc3QgcGFydCA9IG5ldyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEoW1xuXHRcdFx0eyBpZDogJ3RpZXInLCB0eXBlOiAnc2luZ2xlU2VsZWN0JywgdGl0bGU6ICdUaWVyJywgcmVxdWlyZWQ6IHRydWUsIG9wdGlvbnM6IFt7IGlkOiAnc3RkJywgbGFiZWw6ICdTdGFuZGFyZCcsIHZhbHVlOiAnc3RhbmRhcmQnIH1dIH0sXG5cdFx0XSwgdHJ1ZSwgJ3Jlc29sdmUtMScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlRm9yKHBhcnQpLnJlc3BvbmRUb1Nlc3Npb24oYW5zd2VyQ2FsbChwYXJ0LCB7IHR5cGU6ICdza2lwJyB9KSksIHsgb2s6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnVzZXMgYSBtYWxmb3JtZWQgYW5zd2VycyBmaWVsZCByYXRoZXIgdGhhbiByZWFkaW5nIGl0IGFzIGVtcHR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIENvZXJjaW5nIGEgcHJlc2VudCBub24tYXJyYXkgdG8gZW1wdHkgd291bGQgbGV0IGEgc2tpcCBzdWNjZWVkIHdoaWxlXG5cdFx0Ly8gc2lsZW50bHkgZGlzY2FyZGluZyB3aGF0ZXZlciB0aGUgY2FsbCBhY3R1YWxseSBjYXJyaWVkLlxuXHRcdGNvbnN0IHBhcnQgPSBjYXJvdXNlbCh0cnVlKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2VGb3IocGFydCkucmVzcG9uZFRvU2Vzc2lvbihhbnN3ZXJDYWxsKHBhcnQsIHsgdHlwZTogJ3NraXAnLCBhbnN3ZXJzOiAnd2VzdHVzJyB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBvazogZmFsc2UsIHJlYXNvbjogJ2ludmFsaWRfYW5zd2VyJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5pc1VzZWQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnVzZXMgYW4gdW5yZXNvbHZhYmxlIGNhcm91c2VsIHdpdGhvdXQgbWFya2luZyBpdCBhbnN3ZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBBIHBsYWluIGNhcm91c2VsIHdpdGggbm8gZGVmZXJyZWQgY29tcGxldGlvbiBhbmQgbm8gcmVzb2x2ZSBpZCBoYXNcblx0XHQvLyBub3doZXJlIHRvIHB1dCBhbiBhbnN3ZXIuIE11dGF0aW5nIGl0IGZpcnN0IHdvdWxkIGxlYXZlIHRoZSBmb3JtXG5cdFx0Ly8gYW5zd2VyZWQgb24gc2NyZWVuIHdoaWxlIHRoZSBhc3Npc3RhbnQgcmVwb3J0cyB0aGF0IGl0IGRpZCBub3QgbGFuZC5cblx0XHRjb25zdCBwYXJ0ID0ge1xuXHRcdFx0a2luZDogJ3F1ZXN0aW9uQ2Fyb3VzZWwnLFxuXHRcdFx0cXVlc3Rpb25zOiBbeyBpZDogJ3JlZ2lvbicsIHR5cGU6ICdzaW5nbGVTZWxlY3QnLCB0aXRsZTogJ1JlZ2lvbicsIG9wdGlvbnM6IFt7IGlkOiAnd2VzdCcsIGxhYmVsOiAnV2VzdCBVUycsIHZhbHVlOiAnd2VzdHVzJyB9XSB9XSxcblx0XHRcdGlzVXNlZDogZmFsc2UsXG5cdFx0XHRkYXRhOiB1bmRlZmluZWQgYXMgSUNoYXRRdWVzdGlvbkFuc3dlcnMgfCB1bmRlZmluZWQsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2VGb3IocGFydCkucmVzcG9uZFRvU2Vzc2lvbihcblx0XHRcdGFuc3dlckNhbGwocGFydCwgeyB0eXBlOiAnYW5zd2VyJywgYW5zd2VyczogW3sgcXVlc3Rpb25faWQ6ICdyZWdpb24nLCB2YWx1ZTogJ3dlc3R1cycgfV0gfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgb2s6IGZhbHNlLCByZWFzb246ICd1bnN1cHBvcnRlZCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuaXNVc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZGF0YSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmVmdXNlcyBhbiBpZCBtaW50ZWQgZm9yIGEgcGFydCB0aGF0IGhhcyBzaW5jZSBiZWVuIHJlcGxhY2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEEgcGVuZGluZyBpZCBpcyBhbiBpZGVudGl0eSwgbm90IGEgcG9zaXRpb24uIGBSZXNwb25zZS5jbGVhcmAgYW5kXG5cdFx0Ly8gYGNsZWFyVG9QcmV2aW91c1Rvb2xJbnZvY2F0aW9uYCBzcGxpY2UgdGhlIHBhcnQgbGlzdCwgc28gYSBwb3NpdGlvbiB0aGVcblx0XHQvLyBiYWNrZW5kIHdhcyB0b2xkIGFib3V0IGNhbiBlbmQgdXAgb2NjdXBpZWQgYnkgYSBkaWZmZXJlbnQgZm9ybSwgYW5kXG5cdFx0Ly8gYW5zd2VyaW5nICp0aGF0KiBhbnN3ZXJzIHNvbWV0aGluZyB0aGUgdXNlciB3YXMgbmV2ZXIgc2hvd24uXG5cdFx0Y29uc3QgcHVibGlzaGVkID0gY2Fyb3VzZWwoKTtcblx0XHRjb25zdCBjYWxsID0gYW5zd2VyQ2FsbChwdWJsaXNoZWQsIHsgdHlwZTogJ2Fuc3dlcicsIGFuc3dlcnM6IFt7IHF1ZXN0aW9uX2lkOiAncmVnaW9uJywgdmFsdWU6ICdlYXN0dXMnIH1dIH0pO1xuXHRcdGNvbnN0IHJlcGxhY2VtZW50ID0gY2Fyb3VzZWwoKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2VGb3IocmVwbGFjZW1lbnQpLnJlc3BvbmRUb1Nlc3Npb24oY2FsbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBvazogZmFsc2UsIHJlYXNvbjogJ3N0YWxlX3BlbmRpbmcnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXBsYWNlbWVudC5pc1VzZWQsIHVuZGVmaW5lZCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUd4RCxTQUFTLGdDQUFnQztBQUN6QyxTQUE2QyxxQkFBcUIsdUJBQXVCO0FBRXpGLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsdUJBQXVDO0FBRWhELE1BQU0sK0NBQStDLE1BQU07QUFDMUQsMENBQXdDO0FBRXhDLFFBQU0sa0JB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
