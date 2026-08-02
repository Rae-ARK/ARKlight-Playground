import assert from "assert";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { IDialogService } from "../../../../../../../platform/dialogs/common/dialogs.js";
import { TestDialogService } from "../../../../../../../platform/dialogs/test/common/testDialogService.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { IPlanReviewFeedbackService, PlanReviewFeedbackService } from "../../../../browser/planReviewFeedback/planReviewFeedbackService.js";
import { ChatPlanReviewPart } from "../../../../browser/widget/chatContentParts/chatPlanReviewPart.js";
import { ChatPlanReviewData } from "../../../../common/model/chatProgressTypes/chatPlanReviewData.js";
import { IUserInteractionService, MockUserInteractionService } from "../../../../../../../platform/userInteraction/browser/userInteractionService.js";
import { IEditorService } from "../../../../../../services/editor/common/editorService.js";
import sinon from "sinon";
import { ITextFileService } from "../../../../../../services/textfile/common/textfiles.js";
import { DeferredPromise } from "../../../../../../../base/common/async.js";
import { AgentEditorCommentsBridge, IAgentEditorCommentsBridge } from "../../../../../../services/agentEditorComments/common/agentEditorComments.js";
import { Emitter, Event as VSCodeEvent } from "../../../../../../../base/common/event.js";
function createMockReview(overrides) {
  return {
    kind: "planReview",
    title: "Review Plan",
    content: "# Plan\n- step 1\n- step 2",
    actions: [{ label: "Autopilot", default: true }],
    canProvideFeedback: false,
    ...overrides
  };
}
function createMockReviewWithPlan(overrides) {
  return createMockReview({
    canProvideFeedback: true,
    planUri: URI.parse("file:///plan.md").toJSON(),
    ...overrides
  });
}
function createMockContext() {
  return {
    element: { sessionResource: URI.parse("test://session/1") }
  };
}
function getFooterButtons(widget) {
  const container = widget.domNode.querySelector(".chat-plan-review-footer .chat-buttons");
  return container ? Array.from(container.querySelectorAll(".monaco-button")) : [];
}
function getInlineButtons(widget) {
  const container = widget.domNode.querySelector(".chat-plan-review-inline-actions");
  return container ? Array.from(container.querySelectorAll(".monaco-button")) : [];
}
function getReviewButton(widget) {
  return widget.domNode.querySelector(".chat-plan-review-review-button");
}
function getFeedbackSection(widget) {
  return widget.domNode.querySelector(".chat-plan-review-feedback");
}
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
suite("ChatPlanReviewPart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let widget;
  let lastSubmitResult;
  let submitCount = 0;
  let lastFeedbackService;
  let lastEditorService;
  let lastTextFileService;
  let lastCommentsBridge;
  function createWidget(review, dialogService, onSubmit) {
    const instantiationService = workbenchInstantiationService(void 0, store);
    const commentsBridge = store.add(new AgentEditorCommentsBridge());
    const feedbackService = store.add(new PlanReviewFeedbackService(commentsBridge));
    instantiationService.stub(IAgentEditorCommentsBridge, commentsBridge);
    instantiationService.stub(IPlanReviewFeedbackService, feedbackService);
    instantiationService.stub(IUserInteractionService, new MockUserInteractionService());
    lastFeedbackService = feedbackService;
    lastEditorService = instantiationService.get(IEditorService);
    lastTextFileService = instantiationService.get(ITextFileService);
    lastCommentsBridge = commentsBridge;
    if (dialogService) {
      instantiationService.stub(IDialogService, dialogService);
    }
    const options = {
      onSubmit: (result) => {
        lastSubmitResult = result;
        submitCount++;
        onSubmit?.();
      }
    };
    widget = store.add(instantiationService.createInstance(ChatPlanReviewPart, review, createMockContext(), options));
    mainWindow.document.body.appendChild(widget.domNode);
    return widget;
  }
  teardown(() => {
    if (widget?.domNode?.parentNode) {
      widget.domNode.parentNode.removeChild(widget.domNode);
    }
    lastSubmitResult = void 0;
    submitCount = 0;
    lastFeedbackService = void 0;
    lastEditorService = void 0;
    lastTextFileService = void 0;
    lastCommentsBridge = void 0;
    sinon.restore();
  });
  suite("Basic rendering", () => {
    test("renders container with proper structure", () => {
      createWidget(createMockReview());
      assert.ok(widget.domNode.classList.contains("chat-plan-review-container"));
      assert.ok(widget.domNode.querySelector(".chat-plan-review-title"));
      assert.ok(widget.domNode.querySelector(".chat-plan-review-body"));
      assert.ok(widget.domNode.querySelector(".chat-plan-review-footer"));
    });
    test("displays the review title", () => {
      createWidget(createMockReview({ title: "My Plan Title" }));
      const label = widget.domNode.querySelector(".chat-plan-review-title-label");
      assert.strictEqual(label?.textContent, "My Plan Title");
    });
    test("renders markdown content in the body", () => {
      createWidget(createMockReview({ content: "**bold text**" }));
      const body = widget.domNode.querySelector(".chat-plan-review-body");
      assert.ok(body);
      assert.ok(body?.querySelector(".rendered-markdown"));
    });
    test("renders approve and reject buttons in footer", () => {
      createWidget(createMockReview());
      const buttons = getFooterButtons(widget);
      assert.ok(buttons.length >= 2, "should have at least approve and reject buttons");
      assert.ok(buttons.some((b) => b.textContent?.includes("Autopilot")), "should have approve button");
      assert.ok(buttons.some((b) => b.textContent?.includes("Reject")), "should have reject button");
    });
    test("hides feedback section initially when canProvideFeedback and planUri are both set", () => {
      createWidget(createMockReviewWithPlan());
      const feedbackSection = getFeedbackSection(widget);
      assert.ok(feedbackSection);
      assert.strictEqual(feedbackSection.style.display, "none");
    });
    test("shows feedback section by default when canProvideFeedback is true and there is no planUri", () => {
      createWidget(createMockReview({ canProvideFeedback: true }));
      const feedbackSection = getFeedbackSection(widget);
      assert.ok(feedbackSection);
      assert.notStrictEqual(feedbackSection.style.display, "none");
    });
    test("renders Review button when planUri is provided", () => {
      createWidget(createMockReviewWithPlan());
      const reviewButton = getReviewButton(widget);
      assert.ok(reviewButton, "Review button should exist");
    });
    test("does not render Review button when planUri is absent", () => {
      createWidget(createMockReview({ canProvideFeedback: true }));
      assert.strictEqual(getReviewButton(widget), null, "Review button should not exist without planUri");
    });
    test("does not render Provide Feedback footer button (legacy entry removed)", () => {
      createWidget(createMockReviewWithPlan());
      const buttons = getFooterButtons(widget);
      assert.ok(!buttons.some((b) => b.textContent?.includes("Provide Feedback")), "should not have legacy Provide Feedback button");
    });
  });
  suite("Submit results", () => {
    test("clicking approve submits action with label and rejected=false", () => {
      createWidget(createMockReview({ actions: [{ label: "Go", default: true }] }));
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Go"));
      assert.ok(approveButton);
      approveButton.click();
      assert.deepStrictEqual(lastSubmitResult, { action: "Go", rejected: false });
    });
    test("clicking reject submits rejected=true", () => {
      createWidget(createMockReview());
      const rejectButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Reject"));
      assert.ok(rejectButton);
      rejectButton.click();
      assert.deepStrictEqual(lastSubmitResult, { rejected: true });
    });
    test("double-click does not submit twice", () => {
      let submitCount2 = 0;
      const instantiationService = workbenchInstantiationService(void 0, store);
      const options = {
        onSubmit: () => {
          submitCount2++;
        }
      };
      widget = store.add(instantiationService.createInstance(
        ChatPlanReviewPart,
        createMockReview(),
        createMockContext(),
        options
      ));
      mainWindow.document.body.appendChild(widget.domNode);
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Autopilot"));
      approveButton.click();
      approveButton.click();
      assert.strictEqual(submitCount2, 1);
    });
    test("buttons are removed after submission", () => {
      createWidget(createMockReview());
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Autopilot"));
      approveButton.click();
      assert.ok(widget.domNode.classList.contains("chat-plan-review-used"));
      assert.strictEqual(getFooterButtons(widget).length, 0, "footer buttons should be cleared");
    });
  });
  suite("Feedback mode", () => {
    test("clicking Review button opens the plan editor and shows Submit Feedback button", async () => {
      createWidget(createMockReviewWithPlan());
      const openEditorSpy = sinon.spy(lastEditorService, "openEditor");
      const reviewButton = getReviewButton(widget);
      reviewButton.click();
      await tick();
      assert.strictEqual(openEditorSpy.calledOnce, true, "plan file should open in an editor");
      const editorInput = openEditorSpy.firstCall.args[0];
      assert.strictEqual(editorInput.resource?.toString(), "file:///plan.md");
      assert.strictEqual(editorInput.options?.pinned, true);
      const feedbackSection = getFeedbackSection(widget);
      assert.notStrictEqual(feedbackSection.style.display, "none", "feedback section should be visible");
      const buttons = getFooterButtons(widget);
      assert.ok(buttons.some((b) => b.textContent?.includes("Submit Feedback")), "should have Submit Feedback button");
      assert.ok(buttons.some((b) => b.textContent?.includes("Reject")), "should still have Reject button");
      assert.ok(!buttons.some((b) => b.textContent?.includes("Autopilot")), "approve button should be hidden");
    });
    test("reject button remains visible in feedback mode", async () => {
      createWidget(createMockReviewWithPlan());
      getReviewButton(widget).click();
      await tick();
      const buttons = getFooterButtons(widget);
      assert.ok(buttons.some((b) => b.textContent?.includes("Reject")), "reject button should still be visible");
    });
    test("clicking Review button opens feedback section and shows Submit Feedback button", async () => {
      createWidget(createMockReviewWithPlan());
      const reviewButton = getReviewButton(widget);
      reviewButton.click();
      await tick();
      const feedbackSection = getFeedbackSection(widget);
      assert.notStrictEqual(feedbackSection.style.display, "none", "feedback section should be visible");
      const buttons = getFooterButtons(widget);
      assert.ok(buttons.some((b) => b.textContent?.includes("Submit Feedback")), "should have Submit Feedback button");
      assert.ok(buttons.some((b) => b.textContent?.includes("Reject")), "should still have Reject button");
      assert.ok(!buttons.some((b) => b.textContent?.includes("Autopilot")), "approve button should be hidden");
    });
    test("reject button remains visible in feedback mode", async () => {
      createWidget(createMockReviewWithPlan());
      getReviewButton(widget).click();
      await tick();
      const buttons = getFooterButtons(widget);
      assert.ok(buttons.some((b) => b.textContent?.includes("Reject")), "reject button should still be visible");
    });
    test("clicking Review button opens feedback section and shows Submit Feedback button", async () => {
      createWidget(createMockReviewWithPlan());
      const reviewButton = getReviewButton(widget);
      reviewButton.click();
      await tick();
      const feedbackSection = getFeedbackSection(widget);
      assert.notStrictEqual(feedbackSection.style.display, "none", "feedback section should be visible");
      const buttons = getFooterButtons(widget);
      assert.ok(buttons.some((b) => b.textContent?.includes("Submit Feedback")), "should have Submit Feedback button");
      assert.ok(buttons.some((b) => b.textContent?.includes("Reject")), "should still have Reject button");
      assert.ok(!buttons.some((b) => b.textContent?.includes("Autopilot")), "approve button should be hidden");
    });
    test("reject button remains visible in feedback mode", async () => {
      createWidget(createMockReviewWithPlan());
      getReviewButton(widget).click();
      await tick();
      const buttons = getFooterButtons(widget);
      assert.ok(buttons.some((b) => b.textContent?.includes("Reject")), "reject button should still be visible");
    });
    test("clicking Review while in feedback mode reopens the plan editor", async () => {
      createWidget(createMockReviewWithPlan());
      const openEditorSpy = sinon.spy(lastEditorService, "openEditor");
      const reviewButton = getReviewButton(widget);
      reviewButton.click();
      await tick();
      reviewButton.click();
      await tick();
      const feedbackSection = getFeedbackSection(widget);
      assert.notStrictEqual(feedbackSection.style.display, "none", "feedback section should remain visible");
      assert.strictEqual(openEditorSpy.callCount, 2, "each click should reveal the plan editor");
    });
    test("approving with textarea content sends approval + feedback", () => {
      createWidget(createMockReview({ canProvideFeedback: true }));
      const textarea = widget.domNode.querySelector(".chat-plan-review-feedback-textarea");
      assert.ok(textarea);
      textarea.value = "Please also add tests";
      textarea.dispatchEvent(new Event("input"));
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Autopilot"));
      assert.ok(approveButton, "Approve button should be available even with canProvideFeedback");
      approveButton.click();
      assert.deepStrictEqual(lastSubmitResult, {
        action: "Autopilot",
        rejected: false,
        feedback: "Please also add tests",
        feedbackOverall: "Please also add tests"
      });
    });
    test("rejecting with textarea content sends rejection + feedback", () => {
      createWidget(createMockReview({ canProvideFeedback: true }));
      const textarea = widget.domNode.querySelector(".chat-plan-review-feedback-textarea");
      textarea.value = "Not the right approach";
      textarea.dispatchEvent(new Event("input"));
      const rejectButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Reject"));
      assert.ok(rejectButton);
      rejectButton.click();
      assert.deepStrictEqual(lastSubmitResult, {
        rejected: true,
        feedback: "Not the right approach",
        feedbackOverall: "Not the right approach"
      });
    });
    test("submit is disabled when feedback textarea is empty and no inline comments", async () => {
      createWidget(createMockReviewWithPlan());
      getReviewButton(widget).click();
      await tick();
      const submitButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Submit Feedback"));
      assert.ok(submitButton);
      assert.ok(submitButton.classList.contains("disabled"), "Submit Feedback should be disabled when nothing to submit");
    });
  });
  suite("Inline comments list", () => {
    test("renders comments list and updates Submit Feedback count when service has items", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      getReviewButton(widget).click();
      await tick();
      const service = lastFeedbackService;
      const planUri = URI.revive(review.planUri);
      service.addFeedback(planUri, 5, 1, "Fix this step");
      service.addFeedback(planUri, 12, 1, "Reword this");
      const rows = widget.domNode.querySelectorAll(".chat-plan-review-comment-row");
      assert.strictEqual(rows.length, 2, "should render one row per inline comment");
      const submitButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Submit Feedback"));
      assert.ok(submitButton);
      assert.ok((submitButton.textContent ?? "").includes("(2)"), "Submit label should reflect inline count");
    });
    test("live comments from the Markdown editor update the widget", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      getReviewButton(widget).click();
      await tick();
      const planUri = URI.revive(review.planUri);
      const changed = store.add(new Emitter());
      const comments = [{
        id: "live-comment",
        resource: planUri,
        range: {
          startLineNumber: 5,
          startColumn: 1,
          endLineNumber: 5,
          endColumn: 10
        },
        body: "New live comment"
      }];
      store.add(lastCommentsBridge.registerProvider({
        priority: 100,
        onDidChangeComments: changed.event,
        onDidRevealComment: VSCodeEvent.None,
        acceptsComments: () => true,
        getComments: () => comments,
        addComment: () => {
        },
        deleteComment: () => {
        }
      }));
      changed.fire();
      assert.deepStrictEqual({
        rows: widget.domNode.querySelectorAll(".chat-plan-review-comment-row").length,
        submitLabel: getFooterButtons(widget).find((button) => button.textContent?.includes("Submit Feedback"))?.textContent
      }, {
        rows: 1,
        submitLabel: "Submit Feedback (1)"
      });
    });
    test("reveals a related comment in its own resource", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      getReviewButton(widget).click();
      await tick();
      const planUri = URI.revive(review.planUri);
      const relatedUri = URI.parse("file:///related.ts");
      const changed = store.add(new Emitter());
      store.add(lastCommentsBridge.registerProvider({
        priority: 100,
        onDidChangeComments: changed.event,
        onDidRevealComment: VSCodeEvent.None,
        acceptsComments: () => true,
        getComments: () => [{
          id: "related-comment",
          resource: relatedUri,
          range: { startLineNumber: 7, startColumn: 3, endLineNumber: 7, endColumn: 8 },
          body: "Update this source"
        }],
        addComment: () => {
        },
        deleteComment: () => {
        }
      }));
      changed.fire();
      const openEditorSpy = sinon.spy(lastEditorService, "openEditor");
      widget.domNode.querySelector(".chat-plan-review-comment-reveal").click();
      await tick();
      const editorInput = openEditorSpy.lastCall.args[0];
      assert.deepStrictEqual({
        resource: editorInput.resource?.toString(),
        override: editorInput.options?.override,
        selection: editorInput.options?.selection,
        planResource: planUri.toString()
      }, {
        resource: relatedUri.toString(),
        override: void 0,
        selection: { startLineNumber: 7, startColumn: 3 },
        planResource: planUri.toString()
      });
    });
    test("inline comments alone are enough to enable Submit Feedback", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      getReviewButton(widget).click();
      await tick();
      const service = lastFeedbackService;
      const planUri = URI.revive(review.planUri);
      service.addFeedback(planUri, 1, 1, "Hi");
      const submitButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Submit Feedback"));
      assert.ok(submitButton);
      assert.ok(!submitButton.classList.contains("disabled"), "Submit Feedback should be enabled with one inline comment");
    });
    test("editor toolbar feedback submission updates the original plan widget", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review, void 0, () => widget.dispose());
      const service = lastFeedbackService;
      const planUri = URI.revive(review.planUri);
      service.addFeedback(planUri, 5, 1, "Fix this step");
      let commentsChanged = 0;
      store.add(lastCommentsBridge.onDidChangeComments(() => commentsChanged++));
      const didSubmit = await service.submitAllFeedback(planUri);
      assert.deepStrictEqual({
        submitResult: lastSubmitResult,
        didSubmit,
        commentsChanged,
        remainingComments: lastCommentsBridge.getComments(planUri)
      }, {
        submitResult: {
          rejected: false,
          feedback: "Inline comments on `plan.md`:\n- **Line 5:** Fix this step",
          feedbackOverall: void 0,
          feedbackInlineMarkdown: "Inline comments on `plan.md`:\n- **Line 5:** Fix this step"
        },
        didSubmit: true,
        commentsChanged: 2,
        remainingComments: []
      });
      assert.ok(widget.domNode.classList.contains("chat-plan-review-used"));
    });
    test("editor toolbar submits an overall comment without inline comments", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      const textarea = widget.domNode.querySelector(".chat-plan-review-feedback-textarea");
      textarea.value = "Please simplify the rollout";
      textarea.dispatchEvent(new Event("input"));
      await lastFeedbackService.submitAllFeedback(URI.revive(review.planUri));
      assert.deepStrictEqual(lastSubmitResult, {
        rejected: false,
        feedback: "Please simplify the rollout",
        feedbackOverall: "Please simplify the rollout",
        feedbackInlineMarkdown: void 0
      });
    });
    test("comments added while the plan save is pending remain unsubmitted", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      const planUri = URI.revive(review.planUri);
      const changed = store.add(new Emitter());
      const comments = [{
        id: "submitted",
        resource: planUri,
        range: { startLineNumber: 5, startColumn: 1, endLineNumber: 5, endColumn: 2 },
        body: "Submit this"
      }];
      store.add(lastCommentsBridge.registerProvider({
        priority: 100,
        onDidChangeComments: changed.event,
        onDidRevealComment: VSCodeEvent.None,
        acceptsComments: () => true,
        getComments: () => comments,
        addComment: () => {
        },
        deleteComment: (_resource, id) => {
          const index = comments.findIndex((comment) => comment.id === id);
          if (index !== -1) {
            comments.splice(index, 1);
          }
        }
      }));
      changed.fire();
      const saveDeferred = new DeferredPromise();
      sinon.stub(lastTextFileService, "isDirty").returns(true);
      sinon.stub(lastTextFileService, "save").returns(saveDeferred.p);
      const submitButton = getFooterButtons(widget).find((button) => button.textContent?.includes("Submit Feedback"));
      submitButton.click();
      comments.push({
        id: "added-during-save",
        resource: planUri,
        range: { startLineNumber: 8, startColumn: 1, endLineNumber: 8, endColumn: 2 },
        body: "Keep this"
      });
      changed.fire();
      saveDeferred.complete(planUri);
      await tick();
      assert.deepStrictEqual({
        submittedFeedback: lastSubmitResult?.feedback,
        remainingCommentIds: lastCommentsBridge.getComments(planUri, true).map((comment) => comment.id)
      }, {
        submittedFeedback: "Inline comments on `plan.md`:\n- **Line 5:** Submit this",
        remainingCommentIds: ["added-during-save"]
      });
    });
    test("inline comments auto-promote into review mode even before Review button is clicked", () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      assert.strictEqual(getFeedbackSection(widget).style.display, "none");
      const service = lastFeedbackService;
      const planUri = URI.revive(review.planUri);
      service.addFeedback(planUri, 1, 1, "Surprise comment");
      assert.notStrictEqual(getFeedbackSection(widget).style.display, "none", "section should auto-open when comments arrive");
    });
    test("per-row remove button removes only that comment from the service", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      getReviewButton(widget).click();
      await tick();
      const service = lastFeedbackService;
      const planUri = URI.revive(review.planUri);
      service.addFeedback(planUri, 5, 1, "Fix this");
      service.addFeedback(planUri, 12, 1, "Reword");
      service.addFeedback(planUri, 20, 1, "Add detail");
      const removeButtons = widget.domNode.querySelectorAll(".chat-plan-review-comment-remove");
      assert.strictEqual(removeButtons.length, 3, "should render one remove button per row");
      removeButtons[1].click();
      const remaining = service.getFeedback(planUri);
      assert.deepStrictEqual(remaining.map((i) => i.text), ["Fix this", "Add detail"], "middle comment should be removed");
    });
    test("Clear All button is hidden when there are no inline comments", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      getReviewButton(widget).click();
      await tick();
      const clearAll = widget.domNode.querySelector(".chat-plan-review-feedback-clear-all");
      assert.ok(clearAll, "Clear All button should be in the DOM");
      assert.strictEqual(clearAll.style.display, "none", "Clear All should be hidden when list is empty");
    });
    test("Clear All button removes all inline comments after confirmation", async () => {
      const review = createMockReviewWithPlan();
      const dialogService = new TestDialogService({ confirmed: true });
      createWidget(review, dialogService);
      getReviewButton(widget).click();
      await tick();
      const service = lastFeedbackService;
      const planUri = URI.revive(review.planUri);
      service.addFeedback(planUri, 1, 1, "a");
      service.addFeedback(planUri, 2, 1, "b");
      const clearAll = widget.domNode.querySelector(".chat-plan-review-feedback-clear-all");
      assert.ok(clearAll, "Clear All button should be present");
      assert.notStrictEqual(clearAll.style.display, "none", "Clear All should be visible when list has items");
      clearAll.click();
      await tick();
      assert.strictEqual(service.getFeedback(planUri).length, 0, "all comments should be cleared");
    });
    test("Clear All cancellation keeps inline comments intact", async () => {
      const review = createMockReviewWithPlan();
      const dialogService = new TestDialogService({ confirmed: false });
      createWidget(review, dialogService);
      getReviewButton(widget).click();
      await tick();
      const service = lastFeedbackService;
      const planUri = URI.revive(review.planUri);
      service.addFeedback(planUri, 1, 1, "a");
      service.addFeedback(planUri, 2, 1, "b");
      const clearAll = widget.domNode.querySelector(".chat-plan-review-feedback-clear-all");
      clearAll.click();
      await tick();
      assert.strictEqual(service.getFeedback(planUri).length, 2, "comments should be untouched when user cancels");
    });
  });
  suite("Collapsed state", () => {
    test("toggles collapsed state via chevron button", () => {
      createWidget(createMockReview());
      const collapseButton = widget.domNode.querySelector(".chat-plan-review-title-icon-button:last-child");
      assert.ok(collapseButton);
      assert.strictEqual(collapseButton.getAttribute("aria-expanded"), "true");
      collapseButton.click();
      assert.ok(widget.domNode.classList.contains("chat-plan-review-collapsed"));
      assert.strictEqual(collapseButton.getAttribute("aria-expanded"), "false");
      collapseButton.click();
      assert.ok(!widget.domNode.classList.contains("chat-plan-review-collapsed"));
      assert.strictEqual(collapseButton.getAttribute("aria-expanded"), "true");
    });
    test("collapsed view shows inline actions and hides footer", () => {
      createWidget(createMockReview());
      const collapseButton = widget.domNode.querySelector(".chat-plan-review-title-icon-button:last-child");
      collapseButton.click();
      const inlineButtons = getInlineButtons(widget);
      assert.ok(inlineButtons.length > 0, "should have inline action buttons when collapsed");
      const footerButtons = getFooterButtons(widget);
      assert.strictEqual(footerButtons.length, 0, "footer buttons should be empty when collapsed");
    });
    test("collapsed view does not show reject button", () => {
      createWidget(createMockReview());
      const collapseButton = widget.domNode.querySelector(".chat-plan-review-title-icon-button:last-child");
      collapseButton.click();
      const inlineButtons = getInlineButtons(widget);
      assert.ok(!inlineButtons.some((b) => b.textContent?.includes("Reject")), "reject should be omitted in collapsed view");
    });
    test("collapsing preserves feedback mode and inline buttons keep Submit Feedback", async () => {
      createWidget(createMockReviewWithPlan());
      getReviewButton(widget).click();
      await tick();
      const collapseButton = widget.domNode.querySelector(".chat-plan-review-title-icon-button:last-child");
      collapseButton.click();
      const inlineButtons = getInlineButtons(widget);
      assert.ok(inlineButtons.some((b) => b.textContent?.includes("Submit Feedback")), "inline action should be Submit Feedback when feedback mode is active");
      collapseButton.click();
      const footerButtons = getFooterButtons(widget);
      assert.ok(footerButtons.some((b) => b.textContent?.includes("Submit Feedback")), "submit feedback button should remain after expand");
      assert.ok(!footerButtons.some((b) => b.textContent?.includes("Autopilot")), "approve should still be hidden in feedback mode");
    });
    test("a comment added while collapsed is reflected in the inline action", async () => {
      const review = createMockReviewWithPlan();
      createWidget(review);
      const collapseButton = widget.domNode.querySelector(".chat-plan-review-title-icon-button:last-child");
      collapseButton.click();
      lastFeedbackService.addFeedback(URI.revive(review.planUri), 3, 1, "Clarify this step");
      await tick();
      const submitButton = getInlineButtons(widget).find((button) => button.textContent?.includes("Submit Feedback"));
      assert.ok(submitButton?.textContent?.includes("(1)"), "collapsed widget should show the pending comment count");
    });
    test("restores draft collapsed state from ChatPlanReviewData", () => {
      const data = new ChatPlanReviewData("Title", "Content", [{ label: "Go", default: true }], false);
      data.draftCollapsed = true;
      createWidget(data);
      assert.ok(widget.domNode.classList.contains("chat-plan-review-collapsed"));
    });
  });
  suite("Multiple actions", () => {
    test("persists edited plan content before submission", async () => {
      const planUri = URI.parse("file:///plan.md");
      const review = new ChatPlanReviewData(
        "Review Plan",
        "# Original plan",
        [{ id: "approve", label: "Approve", default: true }],
        true,
        planUri.toJSON()
      );
      createWidget(review);
      sinon.stub(lastTextFileService, "isDirty").returns(true);
      sinon.stub(lastTextFileService, "save").resolves(planUri);
      sinon.stub(lastTextFileService, "read").resolves({
        resource: planUri,
        name: "plan.md",
        size: 13,
        mtime: 1,
        ctime: 1,
        etag: "1",
        readonly: false,
        locked: false,
        executable: false,
        encoding: "utf8",
        value: "# Edited plan"
      });
      getFooterButtons(widget).find((button) => button.textContent?.includes("Approve")).click();
      await tick();
      assert.deepStrictEqual({
        content: review.content,
        serializedContent: review.toJSON().content
      }, {
        content: "# Edited plan",
        serializedContent: "# Edited plan"
      });
    });
    test("concurrent approval attempts submit only once", async () => {
      const review = createMockReviewWithPlan({
        actions: [{ id: "approve", label: "Approve", default: true }]
      });
      createWidget(review);
      const saveDeferred = new DeferredPromise();
      sinon.stub(lastTextFileService, "isDirty").returns(true);
      const saveStub = sinon.stub(lastTextFileService, "save").returns(saveDeferred.p);
      const approveButton = getFooterButtons(widget).find((button) => button.textContent?.includes("Approve"));
      approveButton.click();
      approveButton.click();
      assert.strictEqual(saveStub.callCount, 1);
      saveDeferred.complete(URI.revive(review.planUri));
      await tick();
      assert.deepStrictEqual(lastSubmitResult, { action: "Approve", actionId: "approve", rejected: false });
      assert.strictEqual(submitCount, 1);
    });
    test("renders dropdown when multiple actions exist", () => {
      const actions = [
        { label: "Autopilot", default: true },
        { label: "Interactive" }
      ];
      createWidget(createMockReview({ actions }));
      const dropdown = widget.domNode.querySelector(".monaco-button-dropdown");
      assert.ok(dropdown, "should render a button-with-dropdown for multiple actions");
    });
    test("renders plain button when single action exists", () => {
      createWidget(createMockReview({ actions: [{ label: "Go", default: true }] }));
      const dropdown = widget.domNode.querySelector(".monaco-button-dropdown");
      assert.strictEqual(dropdown, null, "should not render dropdown for a single action");
    });
    test("emits actionId for the default action when clicked", () => {
      createWidget(createMockReview({
        actions: [{ id: "approve", label: "Approve", default: true }]
      }));
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Approve"));
      assert.ok(approveButton);
      approveButton.click();
      assert.deepStrictEqual(lastSubmitResult, { action: "Approve", actionId: "approve", rejected: false });
    });
    test("emits actionId for a non-default dropdown action when chosen", () => {
      const actions = [
        { id: "approve", label: "Approve", default: true },
        { id: "approveBypass", label: "Approve & Bypass Permissions" }
      ];
      createWidget(createMockReview({ actions }));
      const dropdown = widget.domNode.querySelector(".monaco-button-dropdown");
      assert.ok(dropdown);
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Approve") && !b.textContent?.includes("Bypass"));
      assert.ok(approveButton);
      approveButton.click();
      assert.deepStrictEqual(lastSubmitResult, { action: "Approve", actionId: "approve", rejected: false });
    });
    test("emits actionId when bypass action is the default", () => {
      createWidget(createMockReview({
        actions: [
          { id: "approveBypass", label: "Approve & Bypass Permissions", default: true },
          { id: "approve", label: "Approve" }
        ]
      }));
      const bypassButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Bypass"));
      assert.ok(bypassButton);
      bypassButton.click();
      assert.deepStrictEqual(lastSubmitResult, { action: "Approve & Bypass Permissions", actionId: "approveBypass", rejected: false });
    });
    test("omits actionId when the action has no id", () => {
      createWidget(createMockReview({ actions: [{ label: "Go", default: true }] }));
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Go"));
      approveButton.click();
      assert.deepStrictEqual(lastSubmitResult, { action: "Go", rejected: false });
    });
  });
  suite("Autopilot confirmation dialog", () => {
    test("shows confirmation dialog for autopilot permission level and proceeds on confirm", async () => {
      createWidget(createMockReview({
        actions: [{ label: "Autopilot", default: true, permissionLevel: "autopilot" }]
      }));
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Autopilot"));
      approveButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.deepStrictEqual(lastSubmitResult, { action: "Autopilot", rejected: false });
    });
    test("cancels autopilot when dialog is dismissed", async () => {
      const dialogService = new TestDialogService(void 0, { result: false });
      createWidget(createMockReview({
        actions: [{ label: "Autopilot", default: true, permissionLevel: "autopilot" }]
      }), dialogService);
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Autopilot"));
      approveButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.strictEqual(lastSubmitResult, void 0, "should not submit when dialog is cancelled");
      assert.ok(!widget.domNode.classList.contains("chat-plan-review-used"), "should not mark as used");
    });
    test("no confirmation dialog for actions without permissionLevel", () => {
      createWidget(createMockReview({
        actions: [{ label: "Interactive", default: true }]
      }));
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Interactive"));
      approveButton.click();
      assert.deepStrictEqual(lastSubmitResult, { action: "Interactive", rejected: false });
    });
  });
  suite("Used / submitted state", () => {
    test("marks widget as used when review.isUsed is true", () => {
      createWidget(createMockReview({ isUsed: true }));
      assert.ok(widget.domNode.classList.contains("chat-plan-review-used"));
    });
    test("disables feedback textarea after submission", () => {
      createWidget(createMockReview({ canProvideFeedback: true }));
      const textarea = widget.domNode.querySelector(".chat-plan-review-feedback-textarea");
      textarea.value = "some feedback";
      textarea.dispatchEvent(new Event("input"));
      const approveButton = getFooterButtons(widget).find((b) => b.textContent?.includes("Autopilot"));
      assert.ok(approveButton, "Approve button should be available");
      approveButton.click();
      assert.strictEqual(textarea.disabled, true, "textarea should be disabled after submission");
    });
    test("dismiss disposes the active plan registration", () => {
      const review = new ChatPlanReviewData(
        "Review Plan",
        "# Plan",
        [{ label: "Go", default: true }],
        true,
        URI.parse("file:///plan.md").toJSON()
      );
      createWidget(review);
      const planUri = URI.revive(review.planUri);
      assert.strictEqual(lastFeedbackService.isActivePlanReview(planUri), true);
      review.dismiss();
      assert.deepStrictEqual({
        active: lastFeedbackService.isActivePlanReview(planUri),
        used: widget.domNode.classList.contains("chat-plan-review-used"),
        buttonCount: getFooterButtons(widget).length
      }, {
        active: false,
        used: true,
        buttonCount: 0
      });
    });
  });
  suite("hasSameContent", () => {
    test("returns false for different kind", () => {
      createWidget(createMockReview());
      const other = { kind: "disabledClaudeHooks" };
      assert.strictEqual(widget.hasSameContent(other, [], {}), false);
    });
    test("returns true for same resolveId", () => {
      createWidget(createMockReview({ resolveId: "abc-123" }));
      const other = createMockReview({ resolveId: "abc-123" });
      assert.strictEqual(widget.hasSameContent(other, [], {}), true);
    });
    test("returns false for different resolveId", () => {
      createWidget(createMockReview({ resolveId: "abc-123" }));
      const other = createMockReview({ resolveId: "def-456" });
      assert.strictEqual(widget.hasSameContent(other, [], {}), false);
    });
    test("returns false when isUsed mismatch", () => {
      createWidget(createMockReview({ isUsed: false }));
      const other = createMockReview({ isUsed: true });
      assert.strictEqual(widget.hasSameContent(other, [], {}), false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRQbGFuUmV2aWV3UGFydC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFRlc3REaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy90ZXN0L2NvbW1vbi90ZXN0RGlhbG9nU2VydmljZS5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSVBsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UsIFBsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BsYW5SZXZpZXdGZWVkYmFjay9wbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRQbGFuUmV2aWV3UGFydCwgSUNoYXRQbGFuUmV2aWV3UGFydE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRQbGFuUmV2aWV3UGFydC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFBsYW5BcHByb3ZhbEFjdGlvbiwgSUNoYXRQbGFuUmV2aWV3LCBJQ2hhdFBsYW5SZXZpZXdSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRSZW5kZXJlckNvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0UGxhblJldmlld0RhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFBsYW5SZXZpZXdEYXRhLmpzJztcbmltcG9ydCB7IElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlLCBNb2NrVXNlckludGVyYWN0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJJbnRlcmFjdGlvbi9icm93c2VyL3VzZXJJbnRlcmFjdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHNpbm9uIGZyb20gJ3Npbm9uJztcbmltcG9ydCB7IElSZXNvdXJjZUVkaXRvcklucHV0LCBJVGV4dEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVDb250ZW50LCBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBBZ2VudEVkaXRvckNvbW1lbnRzQnJpZGdlLCBJQWdlbnRFZGl0b3JDb21tZW50LCBJQWdlbnRFZGl0b3JDb21tZW50c0JyaWRnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2FnZW50RWRpdG9yQ29tbWVudHMvY29tbW9uL2FnZW50RWRpdG9yQ29tbWVudHMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgYXMgVlNDb2RlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tSZXZpZXcob3ZlcnJpZGVzPzogUGFydGlhbDxJQ2hhdFBsYW5SZXZpZXc+KTogSUNoYXRQbGFuUmV2aWV3IHtcblx0cmV0dXJuIHtcblx0XHRraW5kOiAncGxhblJldmlldycsXG5cdFx0dGl0bGU6ICdSZXZpZXcgUGxhbicsXG5cdFx0Y29udGVudDogJyMgUGxhblxcbi0gc3RlcCAxXFxuLSBzdGVwIDInLFxuXHRcdGFjdGlvbnM6IFt7IGxhYmVsOiAnQXV0b3BpbG90JywgZGVmYXVsdDogdHJ1ZSB9XSxcblx0XHRjYW5Qcm92aWRlRmVlZGJhY2s6IGZhbHNlLFxuXHRcdC4uLm92ZXJyaWRlcyxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTW9ja1Jldmlld1dpdGhQbGFuKG92ZXJyaWRlcz86IFBhcnRpYWw8SUNoYXRQbGFuUmV2aWV3Pik6IElDaGF0UGxhblJldmlldyB7XG5cdHJldHVybiBjcmVhdGVNb2NrUmV2aWV3KHtcblx0XHRjYW5Qcm92aWRlRmVlZGJhY2s6IHRydWUsXG5cdFx0cGxhblVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3BsYW4ubWQnKS50b0pTT04oKSxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH0pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrQ29udGV4dCgpOiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCB7XG5cdHJldHVybiB7XG5cdFx0ZWxlbWVudDogeyBzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vMScpIH0sXG5cdH0gYXMgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQ7XG59XG5cbi8qKiBRdWVyeSBhbGwgYC5tb25hY28tYnV0dG9uYCBlbGVtZW50cyBpbnNpZGUgdGhlIGZvb3RlciBgLmNoYXQtYnV0dG9uc2AgY29udGFpbmVyLiAqL1xuZnVuY3Rpb24gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQ6IENoYXRQbGFuUmV2aWV3UGFydCk6IEhUTUxFbGVtZW50W10ge1xuXHRjb25zdCBjb250YWluZXIgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wbGFuLXJldmlldy1mb290ZXIgLmNoYXQtYnV0dG9ucycpO1xuXHRyZXR1cm4gY29udGFpbmVyID8gQXJyYXkuZnJvbShjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLm1vbmFjby1idXR0b24nKSkgOiBbXTtcbn1cblxuLyoqIFF1ZXJ5IGFsbCBgLm1vbmFjby1idXR0b25gIGVsZW1lbnRzIGluc2lkZSB0aGUgaW5saW5lLWFjdGlvbnMgY29udGFpbmVyIChjb2xsYXBzZWQgdGl0bGUgYmFyKS4gKi9cbmZ1bmN0aW9uIGdldElubGluZUJ1dHRvbnMod2lkZ2V0OiBDaGF0UGxhblJldmlld1BhcnQpOiBIVE1MRWxlbWVudFtdIHtcblx0Y29uc3QgY29udGFpbmVyID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcGxhbi1yZXZpZXctaW5saW5lLWFjdGlvbnMnKTtcblx0cmV0dXJuIGNvbnRhaW5lciA/IEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb25hY28tYnV0dG9uJykpIDogW107XG59XG5cbmZ1bmN0aW9uIGdldFJldmlld0J1dHRvbih3aWRnZXQ6IENoYXRQbGFuUmV2aWV3UGFydCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG5cdHJldHVybiB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wbGFuLXJldmlldy1yZXZpZXctYnV0dG9uJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xufVxuXG5mdW5jdGlvbiBnZXRGZWVkYmFja1NlY3Rpb24od2lkZ2V0OiBDaGF0UGxhblJldmlld1BhcnQpOiBIVE1MRWxlbWVudCB7XG5cdHJldHVybiB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wbGFuLXJldmlldy1mZWVkYmFjaycpIGFzIEhUTUxFbGVtZW50O1xufVxuXG5mdW5jdGlvbiB0aWNrKCk6IFByb21pc2U8dm9pZD4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcbn1cblxuc3VpdGUoJ0NoYXRQbGFuUmV2aWV3UGFydCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgd2lkZ2V0OiBDaGF0UGxhblJldmlld1BhcnQ7XG5cdGxldCBsYXN0U3VibWl0UmVzdWx0OiBJQ2hhdFBsYW5SZXZpZXdSZXN1bHQgfCB1bmRlZmluZWQ7XG5cdGxldCBzdWJtaXRDb3VudCA9IDA7XG5cdGxldCBsYXN0RmVlZGJhY2tTZXJ2aWNlOiBJUGxhblJldmlld0ZlZWRiYWNrU2VydmljZSB8IHVuZGVmaW5lZDtcblx0bGV0IGxhc3RFZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSB8IHVuZGVmaW5lZDtcblx0bGV0IGxhc3RUZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cdGxldCBsYXN0Q29tbWVudHNCcmlkZ2U6IEFnZW50RWRpdG9yQ29tbWVudHNCcmlkZ2UgfCB1bmRlZmluZWQ7XG5cblx0ZnVuY3Rpb24gY3JlYXRlV2lkZ2V0KHJldmlldzogSUNoYXRQbGFuUmV2aWV3LCBkaWFsb2dTZXJ2aWNlPzogVGVzdERpYWxvZ1NlcnZpY2UsIG9uU3VibWl0PzogKCkgPT4gdm9pZCk6IENoYXRQbGFuUmV2aWV3UGFydCB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0XHRjb25zdCBjb21tZW50c0JyaWRnZSA9IHN0b3JlLmFkZChuZXcgQWdlbnRFZGl0b3JDb21tZW50c0JyaWRnZSgpKTtcblx0XHRjb25zdCBmZWVkYmFja1NlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFBsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UoY29tbWVudHNCcmlkZ2UpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEVkaXRvckNvbW1lbnRzQnJpZGdlLCBjb21tZW50c0JyaWRnZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUGxhblJldmlld0ZlZWRiYWNrU2VydmljZSwgZmVlZGJhY2tTZXJ2aWNlKTsgaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckludGVyYWN0aW9uU2VydmljZSwgbmV3IE1vY2tVc2VySW50ZXJhY3Rpb25TZXJ2aWNlKCkpO1xuXG5cdFx0bGFzdEZlZWRiYWNrU2VydmljZSA9IGZlZWRiYWNrU2VydmljZTtcblx0XHRsYXN0RWRpdG9yU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0bGFzdFRleHRGaWxlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVGV4dEZpbGVTZXJ2aWNlKTtcblx0XHRsYXN0Q29tbWVudHNCcmlkZ2UgPSBjb21tZW50c0JyaWRnZTtcblx0XHRpZiAoZGlhbG9nU2VydmljZSkge1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlhbG9nU2VydmljZSwgZGlhbG9nU2VydmljZSk7XG5cdFx0fVxuXHRcdGNvbnN0IG9wdGlvbnM6IElDaGF0UGxhblJldmlld1BhcnRPcHRpb25zID0ge1xuXHRcdFx0b25TdWJtaXQ6IHJlc3VsdCA9PiB7XG5cdFx0XHRcdGxhc3RTdWJtaXRSZXN1bHQgPSByZXN1bHQ7XG5cdFx0XHRcdHN1Ym1pdENvdW50Kys7XG5cdFx0XHRcdG9uU3VibWl0Py4oKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHdpZGdldCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UGxhblJldmlld1BhcnQsIHJldmlldywgY3JlYXRlTW9ja0NvbnRleHQoKSwgb3B0aW9ucykpO1xuXHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh3aWRnZXQuZG9tTm9kZSk7XG5cdFx0cmV0dXJuIHdpZGdldDtcblx0fVxuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRpZiAod2lkZ2V0Py5kb21Ob2RlPy5wYXJlbnROb2RlKSB7XG5cdFx0XHR3aWRnZXQuZG9tTm9kZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHdpZGdldC5kb21Ob2RlKTtcblx0XHR9XG5cdFx0bGFzdFN1Ym1pdFJlc3VsdCA9IHVuZGVmaW5lZDtcblx0XHRzdWJtaXRDb3VudCA9IDA7XG5cdFx0bGFzdEZlZWRiYWNrU2VydmljZSA9IHVuZGVmaW5lZDtcblx0XHRsYXN0RWRpdG9yU2VydmljZSA9IHVuZGVmaW5lZDtcblx0XHRsYXN0VGV4dEZpbGVTZXJ2aWNlID0gdW5kZWZpbmVkO1xuXHRcdGxhc3RDb21tZW50c0JyaWRnZSA9IHVuZGVmaW5lZDtcblx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdCYXNpYyByZW5kZXJpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmVuZGVycyBjb250YWluZXIgd2l0aCBwcm9wZXIgc3RydWN0dXJlJywgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXcoKSk7XG5cblx0XHRcdGFzc2VydC5vayh3aWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtcGxhbi1yZXZpZXctY29udGFpbmVyJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXBsYW4tcmV2aWV3LXRpdGxlJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXBsYW4tcmV2aWV3LWJvZHknKSk7XG5cdFx0XHRhc3NlcnQub2sod2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcGxhbi1yZXZpZXctZm9vdGVyJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcGxheXMgdGhlIHJldmlldyB0aXRsZScsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgdGl0bGU6ICdNeSBQbGFuIFRpdGxlJyB9KSk7XG5cblx0XHRcdGNvbnN0IGxhYmVsID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcGxhbi1yZXZpZXctdGl0bGUtbGFiZWwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbD8udGV4dENvbnRlbnQsICdNeSBQbGFuIFRpdGxlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5kZXJzIG1hcmtkb3duIGNvbnRlbnQgaW4gdGhlIGJvZHknLCAoKSA9PiB7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY3JlYXRlTW9ja1Jldmlldyh7IGNvbnRlbnQ6ICcqKmJvbGQgdGV4dCoqJyB9KSk7XG5cblx0XHRcdGNvbnN0IGJvZHkgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wbGFuLXJldmlldy1ib2R5Jyk7XG5cdFx0XHRhc3NlcnQub2soYm9keSk7XG5cdFx0XHRhc3NlcnQub2soYm9keT8ucXVlcnlTZWxlY3RvcignLnJlbmRlcmVkLW1hcmtkb3duJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVycyBhcHByb3ZlIGFuZCByZWplY3QgYnV0dG9ucyBpbiBmb290ZXInLCAoKSA9PiB7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY3JlYXRlTW9ja1JldmlldygpKTtcblxuXHRcdFx0Y29uc3QgYnV0dG9ucyA9IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b25zLmxlbmd0aCA+PSAyLCAnc2hvdWxkIGhhdmUgYXQgbGVhc3QgYXBwcm92ZSBhbmQgcmVqZWN0IGJ1dHRvbnMnKTtcblx0XHRcdGFzc2VydC5vayhidXR0b25zLnNvbWUoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnQXV0b3BpbG90JykpLCAnc2hvdWxkIGhhdmUgYXBwcm92ZSBidXR0b24nKTtcblx0XHRcdGFzc2VydC5vayhidXR0b25zLnNvbWUoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnUmVqZWN0JykpLCAnc2hvdWxkIGhhdmUgcmVqZWN0IGJ1dHRvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGlkZXMgZmVlZGJhY2sgc2VjdGlvbiBpbml0aWFsbHkgd2hlbiBjYW5Qcm92aWRlRmVlZGJhY2sgYW5kIHBsYW5VcmkgYXJlIGJvdGggc2V0JywgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXdXaXRoUGxhbigpKTtcblxuXHRcdFx0Y29uc3QgZmVlZGJhY2tTZWN0aW9uID0gZ2V0RmVlZGJhY2tTZWN0aW9uKHdpZGdldCk7XG5cdFx0XHRhc3NlcnQub2soZmVlZGJhY2tTZWN0aW9uKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZWVkYmFja1NlY3Rpb24uc3R5bGUuZGlzcGxheSwgJ25vbmUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3dzIGZlZWRiYWNrIHNlY3Rpb24gYnkgZGVmYXVsdCB3aGVuIGNhblByb3ZpZGVGZWVkYmFjayBpcyB0cnVlIGFuZCB0aGVyZSBpcyBubyBwbGFuVXJpJywgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXcoeyBjYW5Qcm92aWRlRmVlZGJhY2s6IHRydWUgfSkpO1xuXG5cdFx0XHRjb25zdCBmZWVkYmFja1NlY3Rpb24gPSBnZXRGZWVkYmFja1NlY3Rpb24od2lkZ2V0KTtcblx0XHRcdGFzc2VydC5vayhmZWVkYmFja1NlY3Rpb24pO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGZlZWRiYWNrU2VjdGlvbi5zdHlsZS5kaXNwbGF5LCAnbm9uZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVycyBSZXZpZXcgYnV0dG9uIHdoZW4gcGxhblVyaSBpcyBwcm92aWRlZCcsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKSk7XG5cblx0XHRcdGNvbnN0IHJldmlld0J1dHRvbiA9IGdldFJldmlld0J1dHRvbih3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJldmlld0J1dHRvbiwgJ1JldmlldyBidXR0b24gc2hvdWxkIGV4aXN0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCByZW5kZXIgUmV2aWV3IGJ1dHRvbiB3aGVuIHBsYW5VcmkgaXMgYWJzZW50JywgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXcoeyBjYW5Qcm92aWRlRmVlZGJhY2s6IHRydWUgfSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UmV2aWV3QnV0dG9uKHdpZGdldCksIG51bGwsICdSZXZpZXcgYnV0dG9uIHNob3VsZCBub3QgZXhpc3Qgd2l0aG91dCBwbGFuVXJpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCByZW5kZXIgUHJvdmlkZSBGZWVkYmFjayBmb290ZXIgYnV0dG9uIChsZWdhY3kgZW50cnkgcmVtb3ZlZCknLCAoKSA9PiB7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY3JlYXRlTW9ja1Jldmlld1dpdGhQbGFuKCkpO1xuXG5cdFx0XHRjb25zdCBidXR0b25zID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFidXR0b25zLnNvbWUoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnUHJvdmlkZSBGZWVkYmFjaycpKSwgJ3Nob3VsZCBub3QgaGF2ZSBsZWdhY3kgUHJvdmlkZSBGZWVkYmFjayBidXR0b24nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1N1Ym1pdCByZXN1bHRzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2NsaWNraW5nIGFwcHJvdmUgc3VibWl0cyBhY3Rpb24gd2l0aCBsYWJlbCBhbmQgcmVqZWN0ZWQ9ZmFsc2UnLCAoKSA9PiB7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY3JlYXRlTW9ja1Jldmlldyh7IGFjdGlvbnM6IFt7IGxhYmVsOiAnR28nLCBkZWZhdWx0OiB0cnVlIH1dIH0pKTtcblxuXHRcdFx0Y29uc3QgYXBwcm92ZUJ1dHRvbiA9IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KS5maW5kKGIgPT4gYi50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ0dvJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFwcHJvdmVCdXR0b24pO1xuXHRcdFx0YXBwcm92ZUJ1dHRvbiEuY2xpY2soKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3VibWl0UmVzdWx0LCB7IGFjdGlvbjogJ0dvJywgcmVqZWN0ZWQ6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xpY2tpbmcgcmVqZWN0IHN1Ym1pdHMgcmVqZWN0ZWQ9dHJ1ZScsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KCkpO1xuXG5cdFx0XHRjb25zdCByZWplY3RCdXR0b24gPSBnZXRGb290ZXJCdXR0b25zKHdpZGdldCkuZmluZChiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdSZWplY3QnKSk7XG5cdFx0XHRhc3NlcnQub2socmVqZWN0QnV0dG9uKTtcblx0XHRcdHJlamVjdEJ1dHRvbiEuY2xpY2soKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3VibWl0UmVzdWx0LCB7IHJlamVjdGVkOiB0cnVlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG91YmxlLWNsaWNrIGRvZXMgbm90IHN1Ym1pdCB0d2ljZScsICgpID0+IHtcblx0XHRcdGxldCBzdWJtaXRDb3VudCA9IDA7XG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXHRcdFx0Y29uc3Qgb3B0aW9uczogSUNoYXRQbGFuUmV2aWV3UGFydE9wdGlvbnMgPSB7XG5cdFx0XHRcdG9uU3VibWl0OiAoKSA9PiB7IHN1Ym1pdENvdW50Kys7IH1cblx0XHRcdH07XG5cdFx0XHR3aWRnZXQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRQbGFuUmV2aWV3UGFydCxcblx0XHRcdFx0Y3JlYXRlTW9ja1JldmlldygpLFxuXHRcdFx0XHRjcmVhdGVNb2NrQ29udGV4dCgpLFxuXHRcdFx0XHRvcHRpb25zXG5cdFx0XHQpKTtcblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh3aWRnZXQuZG9tTm9kZSk7XG5cblx0XHRcdGNvbnN0IGFwcHJvdmVCdXR0b24gPSBnZXRGb290ZXJCdXR0b25zKHdpZGdldCkuZmluZChiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdBdXRvcGlsb3QnKSk7XG5cdFx0XHRhcHByb3ZlQnV0dG9uIS5jbGljaygpO1xuXHRcdFx0YXBwcm92ZUJ1dHRvbiEuY2xpY2soKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Ym1pdENvdW50LCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2J1dHRvbnMgYXJlIHJlbW92ZWQgYWZ0ZXIgc3VibWlzc2lvbicsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KCkpO1xuXG5cdFx0XHRjb25zdCBhcHByb3ZlQnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnQXV0b3BpbG90JykpO1xuXHRcdFx0YXBwcm92ZUJ1dHRvbiEuY2xpY2soKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1wbGFuLXJldmlldy11c2VkJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KS5sZW5ndGgsIDAsICdmb290ZXIgYnV0dG9ucyBzaG91bGQgYmUgY2xlYXJlZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnRmVlZGJhY2sgbW9kZScsICgpID0+IHtcblx0XHR0ZXN0KCdjbGlja2luZyBSZXZpZXcgYnV0dG9uIG9wZW5zIHRoZSBwbGFuIGVkaXRvciBhbmQgc2hvd3MgU3VibWl0IEZlZWRiYWNrIGJ1dHRvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKSk7XG5cdFx0XHRjb25zdCBvcGVuRWRpdG9yU3B5ID0gc2lub24uc3B5KGxhc3RFZGl0b3JTZXJ2aWNlISwgJ29wZW5FZGl0b3InKTtcblxuXHRcdFx0Y29uc3QgcmV2aWV3QnV0dG9uID0gZ2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhO1xuXHRcdFx0cmV2aWV3QnV0dG9uLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcGVuRWRpdG9yU3B5LmNhbGxlZE9uY2UsIHRydWUsICdwbGFuIGZpbGUgc2hvdWxkIG9wZW4gaW4gYW4gZWRpdG9yJyk7XG5cdFx0XHRjb25zdCBlZGl0b3JJbnB1dCA9IG9wZW5FZGl0b3JTcHkuZmlyc3RDYWxsLmFyZ3NbMF0gYXMgSVJlc291cmNlRWRpdG9ySW5wdXQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9ySW5wdXQucmVzb3VyY2U/LnRvU3RyaW5nKCksICdmaWxlOi8vL3BsYW4ubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3JJbnB1dC5vcHRpb25zPy5waW5uZWQsIHRydWUpO1xuXG5cdFx0XHQvLyBGZWVkYmFjayBzZWN0aW9uIHNob3VsZCBub3cgYmUgdmlzaWJsZS5cblx0XHRcdGNvbnN0IGZlZWRiYWNrU2VjdGlvbiA9IGdldEZlZWRiYWNrU2VjdGlvbih3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGZlZWRiYWNrU2VjdGlvbi5zdHlsZS5kaXNwbGF5LCAnbm9uZScsICdmZWVkYmFjayBzZWN0aW9uIHNob3VsZCBiZSB2aXNpYmxlJyk7XG5cblx0XHRcdC8vIEZvb3RlciBzaG91bGQgaGF2ZSBTdWJtaXQgRmVlZGJhY2sgKyBSZWplY3QgKG5vIGFwcHJvdmUsIG5vIFByb3ZpZGUgRmVlZGJhY2spLlxuXHRcdFx0Y29uc3QgYnV0dG9ucyA9IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b25zLnNvbWUoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnU3VibWl0IEZlZWRiYWNrJykpLCAnc2hvdWxkIGhhdmUgU3VibWl0IEZlZWRiYWNrIGJ1dHRvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbnMuc29tZShiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdSZWplY3QnKSksICdzaG91bGQgc3RpbGwgaGF2ZSBSZWplY3QgYnV0dG9uJyk7XG5cdFx0XHRhc3NlcnQub2soIWJ1dHRvbnMuc29tZShiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdBdXRvcGlsb3QnKSksICdhcHByb3ZlIGJ1dHRvbiBzaG91bGQgYmUgaGlkZGVuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3QgYnV0dG9uIHJlbWFpbnMgdmlzaWJsZSBpbiBmZWVkYmFjayBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXdXaXRoUGxhbigpKTtcblxuXHRcdFx0Z2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbnMgPSBnZXRGb290ZXJCdXR0b25zKHdpZGdldCk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9ucy5zb21lKGIgPT4gYi50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ1JlamVjdCcpKSwgJ3JlamVjdCBidXR0b24gc2hvdWxkIHN0aWxsIGJlIHZpc2libGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NsaWNraW5nIFJldmlldyBidXR0b24gb3BlbnMgZmVlZGJhY2sgc2VjdGlvbiBhbmQgc2hvd3MgU3VibWl0IEZlZWRiYWNrIGJ1dHRvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKSk7XG5cblx0XHRcdGNvbnN0IHJldmlld0J1dHRvbiA9IGdldFJldmlld0J1dHRvbih3aWRnZXQpITtcblx0XHRcdHJldmlld0J1dHRvbi5jbGljaygpO1xuXHRcdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0XHQvLyBGZWVkYmFjayBzZWN0aW9uIHNob3VsZCBub3cgYmUgdmlzaWJsZS5cblx0XHRcdGNvbnN0IGZlZWRiYWNrU2VjdGlvbiA9IGdldEZlZWRiYWNrU2VjdGlvbih3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGZlZWRiYWNrU2VjdGlvbi5zdHlsZS5kaXNwbGF5LCAnbm9uZScsICdmZWVkYmFjayBzZWN0aW9uIHNob3VsZCBiZSB2aXNpYmxlJyk7XG5cblx0XHRcdC8vIEZvb3RlciBzaG91bGQgaGF2ZSBTdWJtaXQgRmVlZGJhY2sgKyBSZWplY3QgKG5vIGFwcHJvdmUsIG5vIFByb3ZpZGUgRmVlZGJhY2spLlxuXHRcdFx0Y29uc3QgYnV0dG9ucyA9IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b25zLnNvbWUoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnU3VibWl0IEZlZWRiYWNrJykpLCAnc2hvdWxkIGhhdmUgU3VibWl0IEZlZWRiYWNrIGJ1dHRvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbnMuc29tZShiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdSZWplY3QnKSksICdzaG91bGQgc3RpbGwgaGF2ZSBSZWplY3QgYnV0dG9uJyk7XG5cdFx0XHRhc3NlcnQub2soIWJ1dHRvbnMuc29tZShiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdBdXRvcGlsb3QnKSksICdhcHByb3ZlIGJ1dHRvbiBzaG91bGQgYmUgaGlkZGVuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3QgYnV0dG9uIHJlbWFpbnMgdmlzaWJsZSBpbiBmZWVkYmFjayBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXdXaXRoUGxhbigpKTtcblxuXHRcdFx0Z2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbnMgPSBnZXRGb290ZXJCdXR0b25zKHdpZGdldCk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9ucy5zb21lKGIgPT4gYi50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ1JlamVjdCcpKSwgJ3JlamVjdCBidXR0b24gc2hvdWxkIHN0aWxsIGJlIHZpc2libGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NsaWNraW5nIFJldmlldyBidXR0b24gb3BlbnMgZmVlZGJhY2sgc2VjdGlvbiBhbmQgc2hvd3MgU3VibWl0IEZlZWRiYWNrIGJ1dHRvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKSk7XG5cblx0XHRcdGNvbnN0IHJldmlld0J1dHRvbiA9IGdldFJldmlld0J1dHRvbih3aWRnZXQpITtcblx0XHRcdHJldmlld0J1dHRvbi5jbGljaygpO1xuXHRcdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0XHQvLyBGZWVkYmFjayBzZWN0aW9uIHNob3VsZCBub3cgYmUgdmlzaWJsZS5cblx0XHRcdGNvbnN0IGZlZWRiYWNrU2VjdGlvbiA9IGdldEZlZWRiYWNrU2VjdGlvbih3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGZlZWRiYWNrU2VjdGlvbi5zdHlsZS5kaXNwbGF5LCAnbm9uZScsICdmZWVkYmFjayBzZWN0aW9uIHNob3VsZCBiZSB2aXNpYmxlJyk7XG5cblx0XHRcdC8vIEZvb3RlciBzaG91bGQgaGF2ZSBTdWJtaXQgRmVlZGJhY2sgKyBSZWplY3QgKG5vIGFwcHJvdmUsIG5vIFByb3ZpZGUgRmVlZGJhY2spLlxuXHRcdFx0Y29uc3QgYnV0dG9ucyA9IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KTtcblx0XHRcdGFzc2VydC5vayhidXR0b25zLnNvbWUoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnU3VibWl0IEZlZWRiYWNrJykpLCAnc2hvdWxkIGhhdmUgU3VibWl0IEZlZWRiYWNrIGJ1dHRvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ1dHRvbnMuc29tZShiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdSZWplY3QnKSksICdzaG91bGQgc3RpbGwgaGF2ZSBSZWplY3QgYnV0dG9uJyk7XG5cdFx0XHRhc3NlcnQub2soIWJ1dHRvbnMuc29tZShiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdBdXRvcGlsb3QnKSksICdhcHByb3ZlIGJ1dHRvbiBzaG91bGQgYmUgaGlkZGVuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3QgYnV0dG9uIHJlbWFpbnMgdmlzaWJsZSBpbiBmZWVkYmFjayBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXdXaXRoUGxhbigpKTtcblxuXHRcdFx0Z2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbnMgPSBnZXRGb290ZXJCdXR0b25zKHdpZGdldCk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9ucy5zb21lKGIgPT4gYi50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ1JlamVjdCcpKSwgJ3JlamVjdCBidXR0b24gc2hvdWxkIHN0aWxsIGJlIHZpc2libGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NsaWNraW5nIFJldmlldyB3aGlsZSBpbiBmZWVkYmFjayBtb2RlIHJlb3BlbnMgdGhlIHBsYW4gZWRpdG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXdXaXRoUGxhbigpKTtcblx0XHRcdGNvbnN0IG9wZW5FZGl0b3JTcHkgPSBzaW5vbi5zcHkobGFzdEVkaXRvclNlcnZpY2UhLCAnb3BlbkVkaXRvcicpO1xuXG5cdFx0XHRjb25zdCByZXZpZXdCdXR0b24gPSBnZXRSZXZpZXdCdXR0b24od2lkZ2V0KSE7XG5cdFx0XHRyZXZpZXdCdXR0b24uY2xpY2soKTtcblx0XHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdFx0cmV2aWV3QnV0dG9uLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IGZlZWRiYWNrU2VjdGlvbiA9IGdldEZlZWRiYWNrU2VjdGlvbih3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGZlZWRiYWNrU2VjdGlvbi5zdHlsZS5kaXNwbGF5LCAnbm9uZScsICdmZWVkYmFjayBzZWN0aW9uIHNob3VsZCByZW1haW4gdmlzaWJsZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZW5FZGl0b3JTcHkuY2FsbENvdW50LCAyLCAnZWFjaCBjbGljayBzaG91bGQgcmV2ZWFsIHRoZSBwbGFuIGVkaXRvcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXBwcm92aW5nIHdpdGggdGV4dGFyZWEgY29udGVudCBzZW5kcyBhcHByb3ZhbCArIGZlZWRiYWNrJywgKCkgPT4ge1xuXHRcdFx0Ly8gY2FuUHJvdmlkZUZlZWRiYWNrIHdpdGhvdXQgcGxhblVyaSBzaG93cyB0aGUgdGV4dGFyZWEgYWxvbmdzaWRlXG5cdFx0XHQvLyB0aGUgcmVndWxhciBBcHByb3ZlL1JlamVjdCBidXR0b25zOyB0eXBlZCBmZWVkYmFjayByaWRlcyBhbG9uZ1xuXHRcdFx0Ly8gd2l0aCB3aGljaGV2ZXIgYWN0aW9uIHRoZSB1c2VyIHBpY2tzLlxuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXcoeyBjYW5Qcm92aWRlRmVlZGJhY2s6IHRydWUgfSkpO1xuXG5cdFx0XHRjb25zdCB0ZXh0YXJlYSA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXBsYW4tcmV2aWV3LWZlZWRiYWNrLXRleHRhcmVhJykgYXMgSFRNTFRleHRBcmVhRWxlbWVudDtcblx0XHRcdGFzc2VydC5vayh0ZXh0YXJlYSk7XG5cdFx0XHR0ZXh0YXJlYS52YWx1ZSA9ICdQbGVhc2UgYWxzbyBhZGQgdGVzdHMnO1xuXHRcdFx0dGV4dGFyZWEuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JykpO1xuXG5cdFx0XHRjb25zdCBhcHByb3ZlQnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnQXV0b3BpbG90JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFwcHJvdmVCdXR0b24sICdBcHByb3ZlIGJ1dHRvbiBzaG91bGQgYmUgYXZhaWxhYmxlIGV2ZW4gd2l0aCBjYW5Qcm92aWRlRmVlZGJhY2snKTtcblx0XHRcdGFwcHJvdmVCdXR0b24hLmNsaWNrKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN1Ym1pdFJlc3VsdCwge1xuXHRcdFx0XHRhY3Rpb246ICdBdXRvcGlsb3QnLFxuXHRcdFx0XHRyZWplY3RlZDogZmFsc2UsXG5cdFx0XHRcdGZlZWRiYWNrOiAnUGxlYXNlIGFsc28gYWRkIHRlc3RzJyxcblx0XHRcdFx0ZmVlZGJhY2tPdmVyYWxsOiAnUGxlYXNlIGFsc28gYWRkIHRlc3RzJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0aW5nIHdpdGggdGV4dGFyZWEgY29udGVudCBzZW5kcyByZWplY3Rpb24gKyBmZWVkYmFjaycsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgY2FuUHJvdmlkZUZlZWRiYWNrOiB0cnVlIH0pKTtcblxuXHRcdFx0Y29uc3QgdGV4dGFyZWEgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wbGFuLXJldmlldy1mZWVkYmFjay10ZXh0YXJlYScpIGFzIEhUTUxUZXh0QXJlYUVsZW1lbnQ7XG5cdFx0XHR0ZXh0YXJlYS52YWx1ZSA9ICdOb3QgdGhlIHJpZ2h0IGFwcHJvYWNoJztcblx0XHRcdHRleHRhcmVhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcpKTtcblxuXHRcdFx0Y29uc3QgcmVqZWN0QnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnUmVqZWN0JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlamVjdEJ1dHRvbik7XG5cdFx0XHRyZWplY3RCdXR0b24hLmNsaWNrKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN1Ym1pdFJlc3VsdCwge1xuXHRcdFx0XHRyZWplY3RlZDogdHJ1ZSxcblx0XHRcdFx0ZmVlZGJhY2s6ICdOb3QgdGhlIHJpZ2h0IGFwcHJvYWNoJyxcblx0XHRcdFx0ZmVlZGJhY2tPdmVyYWxsOiAnTm90IHRoZSByaWdodCBhcHByb2FjaCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1Ym1pdCBpcyBkaXNhYmxlZCB3aGVuIGZlZWRiYWNrIHRleHRhcmVhIGlzIGVtcHR5IGFuZCBubyBpbmxpbmUgY29tbWVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY3JlYXRlTW9ja1Jldmlld1dpdGhQbGFuKCkpO1xuXG5cdFx0XHRnZXRSZXZpZXdCdXR0b24od2lkZ2V0KSEuY2xpY2soKTtcblx0XHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdFx0Y29uc3Qgc3VibWl0QnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnU3VibWl0IEZlZWRiYWNrJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1Ym1pdEJ1dHRvbik7XG5cdFx0XHRhc3NlcnQub2soc3VibWl0QnV0dG9uIS5jbGFzc0xpc3QuY29udGFpbnMoJ2Rpc2FibGVkJyksICdTdWJtaXQgRmVlZGJhY2sgc2hvdWxkIGJlIGRpc2FibGVkIHdoZW4gbm90aGluZyB0byBzdWJtaXQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0lubGluZSBjb21tZW50cyBsaXN0JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JlbmRlcnMgY29tbWVudHMgbGlzdCBhbmQgdXBkYXRlcyBTdWJtaXQgRmVlZGJhY2sgY291bnQgd2hlbiBzZXJ2aWNlIGhhcyBpdGVtcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJldmlldyA9IGNyZWF0ZU1vY2tSZXZpZXdXaXRoUGxhbigpO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KHJldmlldyk7XG5cblx0XHRcdC8vIEVudGVyIGZlZWRiYWNrIG1vZGUgc28gdGhlIGZlZWRiYWNrIHNlY3Rpb24gaXMgdmlzaWJsZS5cblx0XHRcdGdldFJldmlld0J1dHRvbih3aWRnZXQpIS5jbGljaygpO1xuXHRcdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbGFzdEZlZWRiYWNrU2VydmljZSE7XG5cdFx0XHRjb25zdCBwbGFuVXJpID0gVVJJLnJldml2ZShyZXZpZXcucGxhblVyaSEpO1xuXHRcdFx0c2VydmljZS5hZGRGZWVkYmFjayhwbGFuVXJpLCA1LCAxLCAnRml4IHRoaXMgc3RlcCcpO1xuXHRcdFx0c2VydmljZS5hZGRGZWVkYmFjayhwbGFuVXJpLCAxMiwgMSwgJ1Jld29yZCB0aGlzJyk7XG5cblx0XHRcdGNvbnN0IHJvd3MgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1wbGFuLXJldmlldy1jb21tZW50LXJvdycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvd3MubGVuZ3RoLCAyLCAnc2hvdWxkIHJlbmRlciBvbmUgcm93IHBlciBpbmxpbmUgY29tbWVudCcpO1xuXG5cdFx0XHRjb25zdCBzdWJtaXRCdXR0b24gPSBnZXRGb290ZXJCdXR0b25zKHdpZGdldCkuZmluZChiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdTdWJtaXQgRmVlZGJhY2snKSk7XG5cdFx0XHRhc3NlcnQub2soc3VibWl0QnV0dG9uKTtcblx0XHRcdGFzc2VydC5vaygoc3VibWl0QnV0dG9uIS50ZXh0Q29udGVudCA/PyAnJykuaW5jbHVkZXMoJygyKScpLCAnU3VibWl0IGxhYmVsIHNob3VsZCByZWZsZWN0IGlubGluZSBjb3VudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGl2ZSBjb21tZW50cyBmcm9tIHRoZSBNYXJrZG93biBlZGl0b3IgdXBkYXRlIHRoZSB3aWRnZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXZpZXcgPSBjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKTtcblx0XHRcdGNyZWF0ZVdpZGdldChyZXZpZXcpO1xuXHRcdFx0Z2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpISk7XG5cdFx0XHRjb25zdCBjaGFuZ2VkID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdFx0Y29uc3QgY29tbWVudHMgPSBbe1xuXHRcdFx0XHRpZDogJ2xpdmUtY29tbWVudCcsXG5cdFx0XHRcdHJlc291cmNlOiBwbGFuVXJpLFxuXHRcdFx0XHRyYW5nZToge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogNSxcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiA1LFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMTAsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGJvZHk6ICdOZXcgbGl2ZSBjb21tZW50Jyxcblx0XHRcdH1dO1xuXHRcdFx0c3RvcmUuYWRkKGxhc3RDb21tZW50c0JyaWRnZSEucmVnaXN0ZXJQcm92aWRlcih7XG5cdFx0XHRcdHByaW9yaXR5OiAxMDAsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlQ29tbWVudHM6IGNoYW5nZWQuZXZlbnQsXG5cdFx0XHRcdG9uRGlkUmV2ZWFsQ29tbWVudDogVlNDb2RlRXZlbnQuTm9uZSxcblx0XHRcdFx0YWNjZXB0c0NvbW1lbnRzOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRnZXRDb21tZW50czogKCkgPT4gY29tbWVudHMsXG5cdFx0XHRcdGFkZENvbW1lbnQ6ICgpID0+IHsgfSxcblx0XHRcdFx0ZGVsZXRlQ29tbWVudDogKCkgPT4geyB9LFxuXHRcdFx0fSkpO1xuXHRcdFx0Y2hhbmdlZC5maXJlKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyb3dzOiB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1wbGFuLXJldmlldy1jb21tZW50LXJvdycpLmxlbmd0aCxcblx0XHRcdFx0c3VibWl0TGFiZWw6IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KS5maW5kKGJ1dHRvbiA9PiBidXR0b24udGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdTdWJtaXQgRmVlZGJhY2snKSk/LnRleHRDb250ZW50LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyb3dzOiAxLFxuXHRcdFx0XHRzdWJtaXRMYWJlbDogJ1N1Ym1pdCBGZWVkYmFjayAoMSknLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXZlYWxzIGEgcmVsYXRlZCBjb21tZW50IGluIGl0cyBvd24gcmVzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXZpZXcgPSBjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKTtcblx0XHRcdGNyZWF0ZVdpZGdldChyZXZpZXcpO1xuXHRcdFx0Z2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpISk7XG5cdFx0XHRjb25zdCByZWxhdGVkVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3JlbGF0ZWQudHMnKTtcblx0XHRcdGNvbnN0IGNoYW5nZWQgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0XHRzdG9yZS5hZGQobGFzdENvbW1lbnRzQnJpZGdlIS5yZWdpc3RlclByb3ZpZGVyKHtcblx0XHRcdFx0cHJpb3JpdHk6IDEwMCxcblx0XHRcdFx0b25EaWRDaGFuZ2VDb21tZW50czogY2hhbmdlZC5ldmVudCxcblx0XHRcdFx0b25EaWRSZXZlYWxDb21tZW50OiBWU0NvZGVFdmVudC5Ob25lLFxuXHRcdFx0XHRhY2NlcHRzQ29tbWVudHM6ICgpID0+IHRydWUsXG5cdFx0XHRcdGdldENvbW1lbnRzOiAoKSA9PiBbe1xuXHRcdFx0XHRcdGlkOiAncmVsYXRlZC1jb21tZW50Jyxcblx0XHRcdFx0XHRyZXNvdXJjZTogcmVsYXRlZFVyaSxcblx0XHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDcsIHN0YXJ0Q29sdW1uOiAzLCBlbmRMaW5lTnVtYmVyOiA3LCBlbmRDb2x1bW46IDggfSxcblx0XHRcdFx0XHRib2R5OiAnVXBkYXRlIHRoaXMgc291cmNlJyxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdGFkZENvbW1lbnQ6ICgpID0+IHsgfSxcblx0XHRcdFx0ZGVsZXRlQ29tbWVudDogKCkgPT4geyB9LFxuXHRcdFx0fSkpO1xuXHRcdFx0Y2hhbmdlZC5maXJlKCk7XG5cdFx0XHRjb25zdCBvcGVuRWRpdG9yU3B5ID0gc2lub24uc3B5KGxhc3RFZGl0b3JTZXJ2aWNlISwgJ29wZW5FZGl0b3InKTtcblxuXHRcdFx0KHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXBsYW4tcmV2aWV3LWNvbW1lbnQtcmV2ZWFsJykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQpLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IGVkaXRvcklucHV0ID0gb3BlbkVkaXRvclNweS5sYXN0Q2FsbC5hcmdzWzBdIGFzIElSZXNvdXJjZUVkaXRvcklucHV0O1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlc291cmNlOiBlZGl0b3JJbnB1dC5yZXNvdXJjZT8udG9TdHJpbmcoKSxcblx0XHRcdFx0b3ZlcnJpZGU6IGVkaXRvcklucHV0Lm9wdGlvbnM/Lm92ZXJyaWRlLFxuXHRcdFx0XHRzZWxlY3Rpb246IChlZGl0b3JJbnB1dC5vcHRpb25zIGFzIElUZXh0RWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk/LnNlbGVjdGlvbixcblx0XHRcdFx0cGxhblJlc291cmNlOiBwbGFuVXJpLnRvU3RyaW5nKCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlc291cmNlOiByZWxhdGVkVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdG92ZXJyaWRlOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNlbGVjdGlvbjogeyBzdGFydExpbmVOdW1iZXI6IDcsIHN0YXJ0Q29sdW1uOiAzIH0sXG5cdFx0XHRcdHBsYW5SZXNvdXJjZTogcGxhblVyaS50b1N0cmluZygpLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmxpbmUgY29tbWVudHMgYWxvbmUgYXJlIGVub3VnaCB0byBlbmFibGUgU3VibWl0IEZlZWRiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmV2aWV3ID0gY3JlYXRlTW9ja1Jldmlld1dpdGhQbGFuKCk7XG5cdFx0XHRjcmVhdGVXaWRnZXQocmV2aWV3KTtcblxuXHRcdFx0Z2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBsYXN0RmVlZGJhY2tTZXJ2aWNlITtcblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpISk7XG5cdFx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDEsIDEsICdIaScpO1xuXG5cdFx0XHRjb25zdCBzdWJtaXRCdXR0b24gPSBnZXRGb290ZXJCdXR0b25zKHdpZGdldCkuZmluZChiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdTdWJtaXQgRmVlZGJhY2snKSk7XG5cdFx0XHRhc3NlcnQub2soc3VibWl0QnV0dG9uKTtcblx0XHRcdGFzc2VydC5vayghc3VibWl0QnV0dG9uIS5jbGFzc0xpc3QuY29udGFpbnMoJ2Rpc2FibGVkJyksICdTdWJtaXQgRmVlZGJhY2sgc2hvdWxkIGJlIGVuYWJsZWQgd2l0aCBvbmUgaW5saW5lIGNvbW1lbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VkaXRvciB0b29sYmFyIGZlZWRiYWNrIHN1Ym1pc3Npb24gdXBkYXRlcyB0aGUgb3JpZ2luYWwgcGxhbiB3aWRnZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXZpZXcgPSBjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKTtcblx0XHRcdGNyZWF0ZVdpZGdldChyZXZpZXcsIHVuZGVmaW5lZCwgKCkgPT4gd2lkZ2V0LmRpc3Bvc2UoKSk7XG5cblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBsYXN0RmVlZGJhY2tTZXJ2aWNlITtcblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpISk7XG5cdFx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDUsIDEsICdGaXggdGhpcyBzdGVwJyk7XG5cdFx0XHRsZXQgY29tbWVudHNDaGFuZ2VkID0gMDtcblx0XHRcdHN0b3JlLmFkZChsYXN0Q29tbWVudHNCcmlkZ2UhLm9uRGlkQ2hhbmdlQ29tbWVudHMoKCkgPT4gY29tbWVudHNDaGFuZ2VkKyspKTtcblxuXHRcdFx0Y29uc3QgZGlkU3VibWl0ID0gYXdhaXQgc2VydmljZS5zdWJtaXRBbGxGZWVkYmFjayhwbGFuVXJpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN1Ym1pdFJlc3VsdDogbGFzdFN1Ym1pdFJlc3VsdCxcblx0XHRcdFx0ZGlkU3VibWl0LFxuXHRcdFx0XHRjb21tZW50c0NoYW5nZWQsXG5cdFx0XHRcdHJlbWFpbmluZ0NvbW1lbnRzOiBsYXN0Q29tbWVudHNCcmlkZ2UhLmdldENvbW1lbnRzKHBsYW5VcmkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdWJtaXRSZXN1bHQ6IHtcblx0XHRcdFx0XHRyZWplY3RlZDogZmFsc2UsXG5cdFx0XHRcdFx0ZmVlZGJhY2s6ICdJbmxpbmUgY29tbWVudHMgb24gYHBsYW4ubWRgOlxcbi0gKipMaW5lIDU6KiogRml4IHRoaXMgc3RlcCcsXG5cdFx0XHRcdFx0ZmVlZGJhY2tPdmVyYWxsOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZmVlZGJhY2tJbmxpbmVNYXJrZG93bjogJ0lubGluZSBjb21tZW50cyBvbiBgcGxhbi5tZGA6XFxuLSAqKkxpbmUgNToqKiBGaXggdGhpcyBzdGVwJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlkU3VibWl0OiB0cnVlLFxuXHRcdFx0XHRjb21tZW50c0NoYW5nZWQ6IDIsXG5cdFx0XHRcdHJlbWFpbmluZ0NvbW1lbnRzOiBbXSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1wbGFuLXJldmlldy11c2VkJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZWRpdG9yIHRvb2xiYXIgc3VibWl0cyBhbiBvdmVyYWxsIGNvbW1lbnQgd2l0aG91dCBpbmxpbmUgY29tbWVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXZpZXcgPSBjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKTtcblx0XHRcdGNyZWF0ZVdpZGdldChyZXZpZXcpO1xuXG5cdFx0XHRjb25zdCB0ZXh0YXJlYSA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXBsYW4tcmV2aWV3LWZlZWRiYWNrLXRleHRhcmVhJykgYXMgSFRNTFRleHRBcmVhRWxlbWVudDtcblx0XHRcdHRleHRhcmVhLnZhbHVlID0gJ1BsZWFzZSBzaW1wbGlmeSB0aGUgcm9sbG91dCc7XG5cdFx0XHR0ZXh0YXJlYS5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnaW5wdXQnKSk7XG5cblx0XHRcdGF3YWl0IGxhc3RGZWVkYmFja1NlcnZpY2UhLnN1Ym1pdEFsbEZlZWRiYWNrKFVSSS5yZXZpdmUocmV2aWV3LnBsYW5VcmkhKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN1Ym1pdFJlc3VsdCwge1xuXHRcdFx0XHRyZWplY3RlZDogZmFsc2UsXG5cdFx0XHRcdGZlZWRiYWNrOiAnUGxlYXNlIHNpbXBsaWZ5IHRoZSByb2xsb3V0Jyxcblx0XHRcdFx0ZmVlZGJhY2tPdmVyYWxsOiAnUGxlYXNlIHNpbXBsaWZ5IHRoZSByb2xsb3V0Jyxcblx0XHRcdFx0ZmVlZGJhY2tJbmxpbmVNYXJrZG93bjogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21tZW50cyBhZGRlZCB3aGlsZSB0aGUgcGxhbiBzYXZlIGlzIHBlbmRpbmcgcmVtYWluIHVuc3VibWl0dGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmV2aWV3ID0gY3JlYXRlTW9ja1Jldmlld1dpdGhQbGFuKCk7XG5cdFx0XHRjcmVhdGVXaWRnZXQocmV2aWV3KTtcblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpISk7XG5cdFx0XHRjb25zdCBjaGFuZ2VkID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdFx0Y29uc3QgY29tbWVudHM6IElBZ2VudEVkaXRvckNvbW1lbnRbXSA9IFt7XG5cdFx0XHRcdGlkOiAnc3VibWl0dGVkJyxcblx0XHRcdFx0cmVzb3VyY2U6IHBsYW5VcmksXG5cdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogNSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDUsIGVuZENvbHVtbjogMiB9LFxuXHRcdFx0XHRib2R5OiAnU3VibWl0IHRoaXMnLFxuXHRcdFx0fV07XG5cdFx0XHRzdG9yZS5hZGQobGFzdENvbW1lbnRzQnJpZGdlIS5yZWdpc3RlclByb3ZpZGVyKHtcblx0XHRcdFx0cHJpb3JpdHk6IDEwMCxcblx0XHRcdFx0b25EaWRDaGFuZ2VDb21tZW50czogY2hhbmdlZC5ldmVudCxcblx0XHRcdFx0b25EaWRSZXZlYWxDb21tZW50OiBWU0NvZGVFdmVudC5Ob25lLFxuXHRcdFx0XHRhY2NlcHRzQ29tbWVudHM6ICgpID0+IHRydWUsXG5cdFx0XHRcdGdldENvbW1lbnRzOiAoKSA9PiBjb21tZW50cyxcblx0XHRcdFx0YWRkQ29tbWVudDogKCkgPT4geyB9LFxuXHRcdFx0XHRkZWxldGVDb21tZW50OiAoX3Jlc291cmNlLCBpZCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gY29tbWVudHMuZmluZEluZGV4KGNvbW1lbnQgPT4gY29tbWVudC5pZCA9PT0gaWQpO1xuXHRcdFx0XHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdGNvbW1lbnRzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdFx0Y2hhbmdlZC5maXJlKCk7XG5cdFx0XHRjb25zdCBzYXZlRGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4oKTtcblx0XHRcdHNpbm9uLnN0dWIobGFzdFRleHRGaWxlU2VydmljZSEsICdpc0RpcnR5JykucmV0dXJucyh0cnVlKTtcblx0XHRcdHNpbm9uLnN0dWIobGFzdFRleHRGaWxlU2VydmljZSEsICdzYXZlJykucmV0dXJucyhzYXZlRGVmZXJyZWQucCk7XG5cblx0XHRcdGNvbnN0IHN1Ym1pdEJ1dHRvbiA9IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KS5maW5kKGJ1dHRvbiA9PiBidXR0b24udGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdTdWJtaXQgRmVlZGJhY2snKSkhO1xuXHRcdFx0c3VibWl0QnV0dG9uLmNsaWNrKCk7XG5cdFx0XHRjb21tZW50cy5wdXNoKHtcblx0XHRcdFx0aWQ6ICdhZGRlZC1kdXJpbmctc2F2ZScsXG5cdFx0XHRcdHJlc291cmNlOiBwbGFuVXJpLFxuXHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDgsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiA4LCBlbmRDb2x1bW46IDIgfSxcblx0XHRcdFx0Ym9keTogJ0tlZXAgdGhpcycsXG5cdFx0XHR9KTtcblx0XHRcdGNoYW5nZWQuZmlyZSgpO1xuXHRcdFx0c2F2ZURlZmVycmVkLmNvbXBsZXRlKHBsYW5VcmkpO1xuXHRcdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c3VibWl0dGVkRmVlZGJhY2s6IGxhc3RTdWJtaXRSZXN1bHQ/LmZlZWRiYWNrLFxuXHRcdFx0XHRyZW1haW5pbmdDb21tZW50SWRzOiBsYXN0Q29tbWVudHNCcmlkZ2UhLmdldENvbW1lbnRzKHBsYW5VcmksIHRydWUpLm1hcChjb21tZW50ID0+IGNvbW1lbnQuaWQpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdWJtaXR0ZWRGZWVkYmFjazogJ0lubGluZSBjb21tZW50cyBvbiBgcGxhbi5tZGA6XFxuLSAqKkxpbmUgNToqKiBTdWJtaXQgdGhpcycsXG5cdFx0XHRcdHJlbWFpbmluZ0NvbW1lbnRJZHM6IFsnYWRkZWQtZHVyaW5nLXNhdmUnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5saW5lIGNvbW1lbnRzIGF1dG8tcHJvbW90ZSBpbnRvIHJldmlldyBtb2RlIGV2ZW4gYmVmb3JlIFJldmlldyBidXR0b24gaXMgY2xpY2tlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJldmlldyA9IGNyZWF0ZU1vY2tSZXZpZXdXaXRoUGxhbigpO1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KHJldmlldyk7XG5cblx0XHRcdC8vIFNlY3Rpb24gc3RhcnRzIGhpZGRlbiB3aGVuIHBsYW5VcmkgaXMgcHJlc2VudC5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRGZWVkYmFja1NlY3Rpb24od2lkZ2V0KS5zdHlsZS5kaXNwbGF5LCAnbm9uZScpO1xuXG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbGFzdEZlZWRiYWNrU2VydmljZSE7XG5cdFx0XHRjb25zdCBwbGFuVXJpID0gVVJJLnJldml2ZShyZXZpZXcucGxhblVyaSEpO1xuXHRcdFx0c2VydmljZS5hZGRGZWVkYmFjayhwbGFuVXJpLCAxLCAxLCAnU3VycHJpc2UgY29tbWVudCcpO1xuXG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoZ2V0RmVlZGJhY2tTZWN0aW9uKHdpZGdldCkuc3R5bGUuZGlzcGxheSwgJ25vbmUnLCAnc2VjdGlvbiBzaG91bGQgYXV0by1vcGVuIHdoZW4gY29tbWVudHMgYXJyaXZlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwZXItcm93IHJlbW92ZSBidXR0b24gcmVtb3ZlcyBvbmx5IHRoYXQgY29tbWVudCBmcm9tIHRoZSBzZXJ2aWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmV2aWV3ID0gY3JlYXRlTW9ja1Jldmlld1dpdGhQbGFuKCk7XG5cdFx0XHRjcmVhdGVXaWRnZXQocmV2aWV3KTtcblxuXHRcdFx0Z2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBsYXN0RmVlZGJhY2tTZXJ2aWNlITtcblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpISk7XG5cdFx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDUsIDEsICdGaXggdGhpcycpO1xuXHRcdFx0c2VydmljZS5hZGRGZWVkYmFjayhwbGFuVXJpLCAxMiwgMSwgJ1Jld29yZCcpO1xuXHRcdFx0c2VydmljZS5hZGRGZWVkYmFjayhwbGFuVXJpLCAyMCwgMSwgJ0FkZCBkZXRhaWwnKTtcblxuXHRcdFx0Y29uc3QgcmVtb3ZlQnV0dG9ucyA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LXBsYW4tcmV2aWV3LWNvbW1lbnQtcmVtb3ZlJykgYXMgTm9kZUxpc3RPZjxIVE1MRWxlbWVudD47XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3ZlQnV0dG9ucy5sZW5ndGgsIDMsICdzaG91bGQgcmVuZGVyIG9uZSByZW1vdmUgYnV0dG9uIHBlciByb3cnKTtcblxuXHRcdFx0Ly8gUmVtb3ZlIHRoZSBtaWRkbGUgb25lLlxuXHRcdFx0cmVtb3ZlQnV0dG9uc1sxXS5jbGljaygpO1xuXG5cdFx0XHRjb25zdCByZW1haW5pbmcgPSBzZXJ2aWNlLmdldEZlZWRiYWNrKHBsYW5VcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZW1haW5pbmcubWFwKGkgPT4gaS50ZXh0KSwgWydGaXggdGhpcycsICdBZGQgZGV0YWlsJ10sICdtaWRkbGUgY29tbWVudCBzaG91bGQgYmUgcmVtb3ZlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xlYXIgQWxsIGJ1dHRvbiBpcyBoaWRkZW4gd2hlbiB0aGVyZSBhcmUgbm8gaW5saW5lIGNvbW1lbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmV2aWV3ID0gY3JlYXRlTW9ja1Jldmlld1dpdGhQbGFuKCk7XG5cdFx0XHRjcmVhdGVXaWRnZXQocmV2aWV3KTtcblxuXHRcdFx0Z2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IGNsZWFyQWxsID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcGxhbi1yZXZpZXctZmVlZGJhY2stY2xlYXItYWxsJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQub2soY2xlYXJBbGwsICdDbGVhciBBbGwgYnV0dG9uIHNob3VsZCBiZSBpbiB0aGUgRE9NJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYXJBbGwuc3R5bGUuZGlzcGxheSwgJ25vbmUnLCAnQ2xlYXIgQWxsIHNob3VsZCBiZSBoaWRkZW4gd2hlbiBsaXN0IGlzIGVtcHR5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDbGVhciBBbGwgYnV0dG9uIHJlbW92ZXMgYWxsIGlubGluZSBjb21tZW50cyBhZnRlciBjb25maXJtYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXZpZXcgPSBjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oKTtcblx0XHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBuZXcgVGVzdERpYWxvZ1NlcnZpY2UoeyBjb25maXJtZWQ6IHRydWUgfSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQocmV2aWV3LCBkaWFsb2dTZXJ2aWNlKTtcblxuXHRcdFx0Z2V0UmV2aWV3QnV0dG9uKHdpZGdldCkhLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBsYXN0RmVlZGJhY2tTZXJ2aWNlITtcblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpISk7XG5cdFx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDEsIDEsICdhJyk7XG5cdFx0XHRzZXJ2aWNlLmFkZEZlZWRiYWNrKHBsYW5VcmksIDIsIDEsICdiJyk7XG5cblx0XHRcdGNvbnN0IGNsZWFyQWxsID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtcGxhbi1yZXZpZXctZmVlZGJhY2stY2xlYXItYWxsJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQub2soY2xlYXJBbGwsICdDbGVhciBBbGwgYnV0dG9uIHNob3VsZCBiZSBwcmVzZW50Jyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoY2xlYXJBbGwuc3R5bGUuZGlzcGxheSwgJ25vbmUnLCAnQ2xlYXIgQWxsIHNob3VsZCBiZSB2aXNpYmxlIHdoZW4gbGlzdCBoYXMgaXRlbXMnKTtcblx0XHRcdGNsZWFyQWxsLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEZlZWRiYWNrKHBsYW5VcmkpLmxlbmd0aCwgMCwgJ2FsbCBjb21tZW50cyBzaG91bGQgYmUgY2xlYXJlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xlYXIgQWxsIGNhbmNlbGxhdGlvbiBrZWVwcyBpbmxpbmUgY29tbWVudHMgaW50YWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmV2aWV3ID0gY3JlYXRlTW9ja1Jldmlld1dpdGhQbGFuKCk7XG5cdFx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gbmV3IFRlc3REaWFsb2dTZXJ2aWNlKHsgY29uZmlybWVkOiBmYWxzZSB9KTtcblx0XHRcdGNyZWF0ZVdpZGdldChyZXZpZXcsIGRpYWxvZ1NlcnZpY2UpO1xuXG5cdFx0XHRnZXRSZXZpZXdCdXR0b24od2lkZ2V0KSEuY2xpY2soKTtcblx0XHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGxhc3RGZWVkYmFja1NlcnZpY2UhO1xuXHRcdFx0Y29uc3QgcGxhblVyaSA9IFVSSS5yZXZpdmUocmV2aWV3LnBsYW5VcmkhKTtcblx0XHRcdHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgMSwgMSwgJ2EnKTtcblx0XHRcdHNlcnZpY2UuYWRkRmVlZGJhY2socGxhblVyaSwgMiwgMSwgJ2InKTtcblxuXHRcdFx0Y29uc3QgY2xlYXJBbGwgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wbGFuLXJldmlldy1mZWVkYmFjay1jbGVhci1hbGwnKSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGNsZWFyQWxsLmNsaWNrKCk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEZlZWRiYWNrKHBsYW5VcmkpLmxlbmd0aCwgMiwgJ2NvbW1lbnRzIHNob3VsZCBiZSB1bnRvdWNoZWQgd2hlbiB1c2VyIGNhbmNlbHMnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0NvbGxhcHNlZCBzdGF0ZScsICgpID0+IHtcblx0XHR0ZXN0KCd0b2dnbGVzIGNvbGxhcHNlZCBzdGF0ZSB2aWEgY2hldnJvbiBidXR0b24nLCAoKSA9PiB7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY3JlYXRlTW9ja1JldmlldygpKTtcblxuXHRcdFx0Y29uc3QgY29sbGFwc2VCdXR0b24gPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wbGFuLXJldmlldy10aXRsZS1pY29uLWJ1dHRvbjpsYXN0LWNoaWxkJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQub2soY29sbGFwc2VCdXR0b24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbGxhcHNlQnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpLCAndHJ1ZScpO1xuXG5cdFx0XHRjb2xsYXBzZUJ1dHRvbi5jbGljaygpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1wbGFuLXJldmlldy1jb2xsYXBzZWQnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sbGFwc2VCdXR0b24uZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJyksICdmYWxzZScpO1xuXG5cdFx0XHRjb2xsYXBzZUJ1dHRvbi5jbGljaygpO1xuXHRcdFx0YXNzZXJ0Lm9rKCF3aWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtcGxhbi1yZXZpZXctY29sbGFwc2VkJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbGxhcHNlQnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpLCAndHJ1ZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29sbGFwc2VkIHZpZXcgc2hvd3MgaW5saW5lIGFjdGlvbnMgYW5kIGhpZGVzIGZvb3RlcicsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KCkpO1xuXG5cdFx0XHRjb25zdCBjb2xsYXBzZUJ1dHRvbiA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXBsYW4tcmV2aWV3LXRpdGxlLWljb24tYnV0dG9uOmxhc3QtY2hpbGQnKSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGNvbGxhcHNlQnV0dG9uLmNsaWNrKCk7XG5cblx0XHRcdGNvbnN0IGlubGluZUJ1dHRvbnMgPSBnZXRJbmxpbmVCdXR0b25zKHdpZGdldCk7XG5cdFx0XHRhc3NlcnQub2soaW5saW5lQnV0dG9ucy5sZW5ndGggPiAwLCAnc2hvdWxkIGhhdmUgaW5saW5lIGFjdGlvbiBidXR0b25zIHdoZW4gY29sbGFwc2VkJyk7XG5cblx0XHRcdGNvbnN0IGZvb3RlckJ1dHRvbnMgPSBnZXRGb290ZXJCdXR0b25zKHdpZGdldCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9vdGVyQnV0dG9ucy5sZW5ndGgsIDAsICdmb290ZXIgYnV0dG9ucyBzaG91bGQgYmUgZW1wdHkgd2hlbiBjb2xsYXBzZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbGxhcHNlZCB2aWV3IGRvZXMgbm90IHNob3cgcmVqZWN0IGJ1dHRvbicsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KCkpO1xuXG5cdFx0XHRjb25zdCBjb2xsYXBzZUJ1dHRvbiA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXBsYW4tcmV2aWV3LXRpdGxlLWljb24tYnV0dG9uOmxhc3QtY2hpbGQnKSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGNvbGxhcHNlQnV0dG9uLmNsaWNrKCk7XG5cblx0XHRcdGNvbnN0IGlubGluZUJ1dHRvbnMgPSBnZXRJbmxpbmVCdXR0b25zKHdpZGdldCk7XG5cdFx0XHRhc3NlcnQub2soIWlubGluZUJ1dHRvbnMuc29tZShiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdSZWplY3QnKSksICdyZWplY3Qgc2hvdWxkIGJlIG9taXR0ZWQgaW4gY29sbGFwc2VkIHZpZXcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbGxhcHNpbmcgcHJlc2VydmVzIGZlZWRiYWNrIG1vZGUgYW5kIGlubGluZSBidXR0b25zIGtlZXAgU3VibWl0IEZlZWRiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXdXaXRoUGxhbigpKTtcblxuXHRcdFx0Ly8gRW50ZXIgZmVlZGJhY2sgbW9kZSB2aWEgdGhlIFJldmlldyBidXR0b24uXG5cdFx0XHRnZXRSZXZpZXdCdXR0b24od2lkZ2V0KSEuY2xpY2soKTtcblx0XHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdFx0Ly8gTm93IGNvbGxhcHNlLlxuXHRcdFx0Y29uc3QgY29sbGFwc2VCdXR0b24gPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wbGFuLXJldmlldy10aXRsZS1pY29uLWJ1dHRvbjpsYXN0LWNoaWxkJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRjb2xsYXBzZUJ1dHRvbi5jbGljaygpO1xuXG5cdFx0XHQvLyBJbmxpbmUgYWN0aW9uIHNob3VsZCBiZSBTdWJtaXQgRmVlZGJhY2sgKHByZXNlcnZlcyB0aGUgbW9kZSkuXG5cdFx0XHRjb25zdCBpbmxpbmVCdXR0b25zID0gZ2V0SW5saW5lQnV0dG9ucyh3aWRnZXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGlubGluZUJ1dHRvbnMuc29tZShiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdTdWJtaXQgRmVlZGJhY2snKSksICdpbmxpbmUgYWN0aW9uIHNob3VsZCBiZSBTdWJtaXQgRmVlZGJhY2sgd2hlbiBmZWVkYmFjayBtb2RlIGlzIGFjdGl2ZScpO1xuXG5cdFx0XHQvLyBFeHBhbmQgYWdhaW4gXHUyMDE0IHN0aWxsIGluIGZlZWRiYWNrIG1vZGUuXG5cdFx0XHRjb2xsYXBzZUJ1dHRvbi5jbGljaygpO1xuXHRcdFx0Y29uc3QgZm9vdGVyQnV0dG9ucyA9IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KTtcblx0XHRcdGFzc2VydC5vayhmb290ZXJCdXR0b25zLnNvbWUoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnU3VibWl0IEZlZWRiYWNrJykpLCAnc3VibWl0IGZlZWRiYWNrIGJ1dHRvbiBzaG91bGQgcmVtYWluIGFmdGVyIGV4cGFuZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFmb290ZXJCdXR0b25zLnNvbWUoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnQXV0b3BpbG90JykpLCAnYXBwcm92ZSBzaG91bGQgc3RpbGwgYmUgaGlkZGVuIGluIGZlZWRiYWNrIG1vZGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2EgY29tbWVudCBhZGRlZCB3aGlsZSBjb2xsYXBzZWQgaXMgcmVmbGVjdGVkIGluIHRoZSBpbmxpbmUgYWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmV2aWV3ID0gY3JlYXRlTW9ja1Jldmlld1dpdGhQbGFuKCk7XG5cdFx0XHRjcmVhdGVXaWRnZXQocmV2aWV3KTtcblxuXHRcdFx0Y29uc3QgY29sbGFwc2VCdXR0b24gPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wbGFuLXJldmlldy10aXRsZS1pY29uLWJ1dHRvbjpsYXN0LWNoaWxkJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRjb2xsYXBzZUJ1dHRvbi5jbGljaygpO1xuXG5cdFx0XHRsYXN0RmVlZGJhY2tTZXJ2aWNlIS5hZGRGZWVkYmFjayhVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpISksIDMsIDEsICdDbGFyaWZ5IHRoaXMgc3RlcCcpO1xuXHRcdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0XHRjb25zdCBzdWJtaXRCdXR0b24gPSBnZXRJbmxpbmVCdXR0b25zKHdpZGdldCkuZmluZChidXR0b24gPT4gYnV0dG9uLnRleHRDb250ZW50Py5pbmNsdWRlcygnU3VibWl0IEZlZWRiYWNrJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1Ym1pdEJ1dHRvbj8udGV4dENvbnRlbnQ/LmluY2x1ZGVzKCcoMSknKSwgJ2NvbGxhcHNlZCB3aWRnZXQgc2hvdWxkIHNob3cgdGhlIHBlbmRpbmcgY29tbWVudCBjb3VudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzdG9yZXMgZHJhZnQgY29sbGFwc2VkIHN0YXRlIGZyb20gQ2hhdFBsYW5SZXZpZXdEYXRhJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGF0YSA9IG5ldyBDaGF0UGxhblJldmlld0RhdGEoJ1RpdGxlJywgJ0NvbnRlbnQnLCBbeyBsYWJlbDogJ0dvJywgZGVmYXVsdDogdHJ1ZSB9XSwgZmFsc2UpO1xuXHRcdFx0ZGF0YS5kcmFmdENvbGxhcHNlZCA9IHRydWU7XG5cdFx0XHRjcmVhdGVXaWRnZXQoZGF0YSk7XG5cblx0XHRcdGFzc2VydC5vayh3aWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtcGxhbi1yZXZpZXctY29sbGFwc2VkJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTXVsdGlwbGUgYWN0aW9ucycsICgpID0+IHtcblx0XHR0ZXN0KCdwZXJzaXN0cyBlZGl0ZWQgcGxhbiBjb250ZW50IGJlZm9yZSBzdWJtaXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGxhblVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9wbGFuLm1kJyk7XG5cdFx0XHRjb25zdCByZXZpZXcgPSBuZXcgQ2hhdFBsYW5SZXZpZXdEYXRhKFxuXHRcdFx0XHQnUmV2aWV3IFBsYW4nLFxuXHRcdFx0XHQnIyBPcmlnaW5hbCBwbGFuJyxcblx0XHRcdFx0W3sgaWQ6ICdhcHByb3ZlJywgbGFiZWw6ICdBcHByb3ZlJywgZGVmYXVsdDogdHJ1ZSB9XSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0cGxhblVyaS50b0pTT04oKSxcblx0XHRcdCk7XG5cdFx0XHRjcmVhdGVXaWRnZXQocmV2aWV3KTtcblx0XHRcdHNpbm9uLnN0dWIobGFzdFRleHRGaWxlU2VydmljZSEsICdpc0RpcnR5JykucmV0dXJucyh0cnVlKTtcblx0XHRcdHNpbm9uLnN0dWIobGFzdFRleHRGaWxlU2VydmljZSEsICdzYXZlJykucmVzb2x2ZXMocGxhblVyaSk7XG5cdFx0XHRzaW5vbi5zdHViKGxhc3RUZXh0RmlsZVNlcnZpY2UhLCAncmVhZCcpLnJlc29sdmVzKHtcblx0XHRcdFx0cmVzb3VyY2U6IHBsYW5VcmksXG5cdFx0XHRcdG5hbWU6ICdwbGFuLm1kJyxcblx0XHRcdFx0c2l6ZTogMTMsXG5cdFx0XHRcdG10aW1lOiAxLFxuXHRcdFx0XHRjdGltZTogMSxcblx0XHRcdFx0ZXRhZzogJzEnLFxuXHRcdFx0XHRyZWFkb25seTogZmFsc2UsXG5cdFx0XHRcdGxvY2tlZDogZmFsc2UsXG5cdFx0XHRcdGV4ZWN1dGFibGU6IGZhbHNlLFxuXHRcdFx0XHRlbmNvZGluZzogJ3V0ZjgnLFxuXHRcdFx0XHR2YWx1ZTogJyMgRWRpdGVkIHBsYW4nLFxuXHRcdFx0fSBzYXRpc2ZpZXMgSVRleHRGaWxlQ29udGVudCk7XG5cblx0XHRcdGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KS5maW5kKGJ1dHRvbiA9PiBidXR0b24udGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdBcHByb3ZlJykpIS5jbGljaygpO1xuXHRcdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y29udGVudDogcmV2aWV3LmNvbnRlbnQsXG5cdFx0XHRcdHNlcmlhbGl6ZWRDb250ZW50OiByZXZpZXcudG9KU09OKCkuY29udGVudCxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29udGVudDogJyMgRWRpdGVkIHBsYW4nLFxuXHRcdFx0XHRzZXJpYWxpemVkQ29udGVudDogJyMgRWRpdGVkIHBsYW4nLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb25jdXJyZW50IGFwcHJvdmFsIGF0dGVtcHRzIHN1Ym1pdCBvbmx5IG9uY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXZpZXcgPSBjcmVhdGVNb2NrUmV2aWV3V2l0aFBsYW4oe1xuXHRcdFx0XHRhY3Rpb25zOiBbeyBpZDogJ2FwcHJvdmUnLCBsYWJlbDogJ0FwcHJvdmUnLCBkZWZhdWx0OiB0cnVlIH1dLFxuXHRcdFx0fSk7XG5cdFx0XHRjcmVhdGVXaWRnZXQocmV2aWV3KTtcblxuXHRcdFx0Y29uc3Qgc2F2ZURlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+KCk7XG5cdFx0XHRzaW5vbi5zdHViKGxhc3RUZXh0RmlsZVNlcnZpY2UhLCAnaXNEaXJ0eScpLnJldHVybnModHJ1ZSk7XG5cdFx0XHRjb25zdCBzYXZlU3R1YiA9IHNpbm9uLnN0dWIobGFzdFRleHRGaWxlU2VydmljZSEsICdzYXZlJykucmV0dXJucyhzYXZlRGVmZXJyZWQucCk7XG5cdFx0XHRjb25zdCBhcHByb3ZlQnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYnV0dG9uID0+IGJ1dHRvbi50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ0FwcHJvdmUnKSkhO1xuXG5cdFx0XHRhcHByb3ZlQnV0dG9uLmNsaWNrKCk7XG5cdFx0XHRhcHByb3ZlQnV0dG9uLmNsaWNrKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2F2ZVN0dWIuY2FsbENvdW50LCAxKTtcblxuXHRcdFx0c2F2ZURlZmVycmVkLmNvbXBsZXRlKFVSSS5yZXZpdmUocmV2aWV3LnBsYW5VcmkhKSk7XG5cdFx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN1Ym1pdFJlc3VsdCwgeyBhY3Rpb246ICdBcHByb3ZlJywgYWN0aW9uSWQ6ICdhcHByb3ZlJywgcmVqZWN0ZWQ6IGZhbHNlIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Ym1pdENvdW50LCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgZHJvcGRvd24gd2hlbiBtdWx0aXBsZSBhY3Rpb25zIGV4aXN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9uczogSUNoYXRQbGFuQXBwcm92YWxBY3Rpb25bXSA9IFtcblx0XHRcdFx0eyBsYWJlbDogJ0F1dG9waWxvdCcsIGRlZmF1bHQ6IHRydWUgfSxcblx0XHRcdFx0eyBsYWJlbDogJ0ludGVyYWN0aXZlJyB9LFxuXHRcdFx0XTtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgYWN0aW9ucyB9KSk7XG5cblx0XHRcdGNvbnN0IGRyb3Bkb3duID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLm1vbmFjby1idXR0b24tZHJvcGRvd24nKTtcblx0XHRcdGFzc2VydC5vayhkcm9wZG93biwgJ3Nob3VsZCByZW5kZXIgYSBidXR0b24td2l0aC1kcm9wZG93biBmb3IgbXVsdGlwbGUgYWN0aW9ucycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVycyBwbGFpbiBidXR0b24gd2hlbiBzaW5nbGUgYWN0aW9uIGV4aXN0cycsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgYWN0aW9uczogW3sgbGFiZWw6ICdHbycsIGRlZmF1bHQ6IHRydWUgfV0gfSkpO1xuXG5cdFx0XHRjb25zdCBkcm9wZG93biA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYnV0dG9uLWRyb3Bkb3duJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZHJvcGRvd24sIG51bGwsICdzaG91bGQgbm90IHJlbmRlciBkcm9wZG93biBmb3IgYSBzaW5nbGUgYWN0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbWl0cyBhY3Rpb25JZCBmb3IgdGhlIGRlZmF1bHQgYWN0aW9uIHdoZW4gY2xpY2tlZCcsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHtcblx0XHRcdFx0YWN0aW9uczogW3sgaWQ6ICdhcHByb3ZlJywgbGFiZWw6ICdBcHByb3ZlJywgZGVmYXVsdDogdHJ1ZSB9XVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBhcHByb3ZlQnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnQXBwcm92ZScpKTtcblx0XHRcdGFzc2VydC5vayhhcHByb3ZlQnV0dG9uKTtcblx0XHRcdGFwcHJvdmVCdXR0b24hLmNsaWNrKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN1Ym1pdFJlc3VsdCwgeyBhY3Rpb246ICdBcHByb3ZlJywgYWN0aW9uSWQ6ICdhcHByb3ZlJywgcmVqZWN0ZWQ6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1pdHMgYWN0aW9uSWQgZm9yIGEgbm9uLWRlZmF1bHQgZHJvcGRvd24gYWN0aW9uIHdoZW4gY2hvc2VuJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9uczogSUNoYXRQbGFuQXBwcm92YWxBY3Rpb25bXSA9IFtcblx0XHRcdFx0eyBpZDogJ2FwcHJvdmUnLCBsYWJlbDogJ0FwcHJvdmUnLCBkZWZhdWx0OiB0cnVlIH0sXG5cdFx0XHRcdHsgaWQ6ICdhcHByb3ZlQnlwYXNzJywgbGFiZWw6ICdBcHByb3ZlICYgQnlwYXNzIFBlcm1pc3Npb25zJyB9LFxuXHRcdFx0XTtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgYWN0aW9ucyB9KSk7XG5cblx0XHRcdC8vIFRoZSBkcm9wZG93biB3cmFwcyBub24tZGVmYXVsdCBhY3Rpb25zIGluIHZzY29kZSBBY3Rpb25zOyByYXRoZXJcblx0XHRcdC8vIHRoYW4gZHJpdmluZyB0aGUgZHJvcGRvd24gVUksIGludm9rZSB0aGUgYWN0aW9uIGRpcmVjdGx5IHRoZSB3YXlcblx0XHRcdC8vIHRoZSBkcm9wZG93biBtZW51IGl0ZW0gd291bGQuXG5cdFx0XHQvLyBGaW5kIHRoZSByZW5kZXJlZCBkcm9wZG93biBidXR0b24uXG5cdFx0XHRjb25zdCBkcm9wZG93biA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tYnV0dG9uLWRyb3Bkb3duJyk7XG5cdFx0XHRhc3NlcnQub2soZHJvcGRvd24pO1xuXG5cdFx0XHQvLyBSZWFjaCBpbnRvIHRoZSB3aWRnZXQgdmlhIGl0cyBwdWJsaWMgc3VibWl0IHBhdGg6IGNsaWNrIHRoZVxuXHRcdFx0Ly8gcHJpbWFyeSBhcHByb3ZlIGFuZCB2ZXJpZnkgdGhlIGRlZmF1bHQgZW1pdHMgaXRzIGlkLCB0aGVuIGNoZWNrXG5cdFx0XHQvLyB0aGF0IHN1Ym1pdHRpbmcgdGhlIGJ5cGFzcyBhY3Rpb24gcHJvZHVjZXMgaXRzIG93biBpZCBieVxuXHRcdFx0Ly8gcmUtY3JlYXRpbmcgd2l0aCBieXBhc3MgYXMgdGhlIGRlZmF1bHQuXG5cdFx0XHRjb25zdCBhcHByb3ZlQnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnQXBwcm92ZScpICYmICFiLnRleHRDb250ZW50Py5pbmNsdWRlcygnQnlwYXNzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFwcHJvdmVCdXR0b24pO1xuXHRcdFx0YXBwcm92ZUJ1dHRvbiEuY2xpY2soKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN1Ym1pdFJlc3VsdCwgeyBhY3Rpb246ICdBcHByb3ZlJywgYWN0aW9uSWQ6ICdhcHByb3ZlJywgcmVqZWN0ZWQ6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1pdHMgYWN0aW9uSWQgd2hlbiBieXBhc3MgYWN0aW9uIGlzIHRoZSBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXcoe1xuXHRcdFx0XHRhY3Rpb25zOiBbXG5cdFx0XHRcdFx0eyBpZDogJ2FwcHJvdmVCeXBhc3MnLCBsYWJlbDogJ0FwcHJvdmUgJiBCeXBhc3MgUGVybWlzc2lvbnMnLCBkZWZhdWx0OiB0cnVlIH0sXG5cdFx0XHRcdFx0eyBpZDogJ2FwcHJvdmUnLCBsYWJlbDogJ0FwcHJvdmUnIH0sXG5cdFx0XHRcdF1cblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgYnlwYXNzQnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnQnlwYXNzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGJ5cGFzc0J1dHRvbik7XG5cdFx0XHRieXBhc3NCdXR0b24hLmNsaWNrKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFzdFN1Ym1pdFJlc3VsdCwgeyBhY3Rpb246ICdBcHByb3ZlICYgQnlwYXNzIFBlcm1pc3Npb25zJywgYWN0aW9uSWQ6ICdhcHByb3ZlQnlwYXNzJywgcmVqZWN0ZWQ6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb21pdHMgYWN0aW9uSWQgd2hlbiB0aGUgYWN0aW9uIGhhcyBubyBpZCcsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgYWN0aW9uczogW3sgbGFiZWw6ICdHbycsIGRlZmF1bHQ6IHRydWUgfV0gfSkpO1xuXG5cdFx0XHRjb25zdCBhcHByb3ZlQnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnR28nKSk7XG5cdFx0XHRhcHByb3ZlQnV0dG9uIS5jbGljaygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhc3RTdWJtaXRSZXN1bHQsIHsgYWN0aW9uOiAnR28nLCByZWplY3RlZDogZmFsc2UgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBdXRvcGlsb3QgY29uZmlybWF0aW9uIGRpYWxvZycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG93cyBjb25maXJtYXRpb24gZGlhbG9nIGZvciBhdXRvcGlsb3QgcGVybWlzc2lvbiBsZXZlbCBhbmQgcHJvY2VlZHMgb24gY29uZmlybScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIERlZmF1bHQgVGVzdERpYWxvZ1NlcnZpY2UgcnVucyB0aGUgZmlyc3QgYnV0dG9uIChFbmFibGUgXHUyMTkyIHRydWUpXG5cdFx0XHRjcmVhdGVXaWRnZXQoY3JlYXRlTW9ja1Jldmlldyh7XG5cdFx0XHRcdGFjdGlvbnM6IFt7IGxhYmVsOiAnQXV0b3BpbG90JywgZGVmYXVsdDogdHJ1ZSwgcGVybWlzc2lvbkxldmVsOiAnYXV0b3BpbG90JyB9XVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBhcHByb3ZlQnV0dG9uID0gZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmZpbmQoYiA9PiBiLnRleHRDb250ZW50Py5pbmNsdWRlcygnQXV0b3BpbG90JykpO1xuXHRcdFx0YXBwcm92ZUJ1dHRvbiEuY2xpY2soKTtcblxuXHRcdFx0Ly8gV2FpdCBmb3IgdGhlIGFzeW5jIGRpYWxvZyB0byByZXNvbHZlXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhc3RTdWJtaXRSZXN1bHQsIHsgYWN0aW9uOiAnQXV0b3BpbG90JywgcmVqZWN0ZWQ6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FuY2VscyBhdXRvcGlsb3Qgd2hlbiBkaWFsb2cgaXMgZGlzbWlzc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IG5ldyBUZXN0RGlhbG9nU2VydmljZSh1bmRlZmluZWQsIHsgcmVzdWx0OiBmYWxzZSB9KTtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHtcblx0XHRcdFx0YWN0aW9uczogW3sgbGFiZWw6ICdBdXRvcGlsb3QnLCBkZWZhdWx0OiB0cnVlLCBwZXJtaXNzaW9uTGV2ZWw6ICdhdXRvcGlsb3QnIH1dXG5cdFx0XHR9KSwgZGlhbG9nU2VydmljZSk7XG5cblx0XHRcdGNvbnN0IGFwcHJvdmVCdXR0b24gPSBnZXRGb290ZXJCdXR0b25zKHdpZGdldCkuZmluZChiID0+IGIudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdBdXRvcGlsb3QnKSk7XG5cdFx0XHRhcHByb3ZlQnV0dG9uIS5jbGljaygpO1xuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdFN1Ym1pdFJlc3VsdCwgdW5kZWZpbmVkLCAnc2hvdWxkIG5vdCBzdWJtaXQgd2hlbiBkaWFsb2cgaXMgY2FuY2VsbGVkJyk7XG5cdFx0XHRhc3NlcnQub2soIXdpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1wbGFuLXJldmlldy11c2VkJyksICdzaG91bGQgbm90IG1hcmsgYXMgdXNlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm8gY29uZmlybWF0aW9uIGRpYWxvZyBmb3IgYWN0aW9ucyB3aXRob3V0IHBlcm1pc3Npb25MZXZlbCcsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHtcblx0XHRcdFx0YWN0aW9uczogW3sgbGFiZWw6ICdJbnRlcmFjdGl2ZScsIGRlZmF1bHQ6IHRydWUgfV1cblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgYXBwcm92ZUJ1dHRvbiA9IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KS5maW5kKGIgPT4gYi50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ0ludGVyYWN0aXZlJykpO1xuXHRcdFx0YXBwcm92ZUJ1dHRvbiEuY2xpY2soKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsYXN0U3VibWl0UmVzdWx0LCB7IGFjdGlvbjogJ0ludGVyYWN0aXZlJywgcmVqZWN0ZWQ6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnVXNlZCAvIHN1Ym1pdHRlZCBzdGF0ZScsICgpID0+IHtcblx0XHR0ZXN0KCdtYXJrcyB3aWRnZXQgYXMgdXNlZCB3aGVuIHJldmlldy5pc1VzZWQgaXMgdHJ1ZScsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgaXNVc2VkOiB0cnVlIH0pKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHdpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1wbGFuLXJldmlldy11c2VkJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzYWJsZXMgZmVlZGJhY2sgdGV4dGFyZWEgYWZ0ZXIgc3VibWlzc2lvbicsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgY2FuUHJvdmlkZUZlZWRiYWNrOiB0cnVlIH0pKTtcblxuXHRcdFx0Ly8gSW4gdGhlIG5vLXBsYW5VcmkgdGV4dGFyZWEgbW9kZSB0aGUgdGV4dGFyZWEgc2l0cyBhbG9uZ3NpZGUgdGhlXG5cdFx0XHQvLyByZWd1bGFyIEFwcHJvdmUvUmVqZWN0IGJ1dHRvbnM7IHN1Ym1pdCBieSBjbGlja2luZyBBcHByb3ZlLlxuXHRcdFx0Y29uc3QgdGV4dGFyZWEgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1wbGFuLXJldmlldy1mZWVkYmFjay10ZXh0YXJlYScpIGFzIEhUTUxUZXh0QXJlYUVsZW1lbnQ7XG5cdFx0XHR0ZXh0YXJlYS52YWx1ZSA9ICdzb21lIGZlZWRiYWNrJztcblx0XHRcdHRleHRhcmVhLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcpKTtcblxuXHRcdFx0Y29uc3QgYXBwcm92ZUJ1dHRvbiA9IGdldEZvb3RlckJ1dHRvbnMod2lkZ2V0KS5maW5kKGIgPT4gYi50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ0F1dG9waWxvdCcpKTtcblx0XHRcdGFzc2VydC5vayhhcHByb3ZlQnV0dG9uLCAnQXBwcm92ZSBidXR0b24gc2hvdWxkIGJlIGF2YWlsYWJsZScpO1xuXHRcdFx0YXBwcm92ZUJ1dHRvbiEuY2xpY2soKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRhcmVhLmRpc2FibGVkLCB0cnVlLCAndGV4dGFyZWEgc2hvdWxkIGJlIGRpc2FibGVkIGFmdGVyIHN1Ym1pc3Npb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc21pc3MgZGlzcG9zZXMgdGhlIGFjdGl2ZSBwbGFuIHJlZ2lzdHJhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJldmlldyA9IG5ldyBDaGF0UGxhblJldmlld0RhdGEoXG5cdFx0XHRcdCdSZXZpZXcgUGxhbicsXG5cdFx0XHRcdCcjIFBsYW4nLFxuXHRcdFx0XHRbeyBsYWJlbDogJ0dvJywgZGVmYXVsdDogdHJ1ZSB9XSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0VVJJLnBhcnNlKCdmaWxlOi8vL3BsYW4ubWQnKS50b0pTT04oKSxcblx0XHRcdCk7XG5cdFx0XHRjcmVhdGVXaWRnZXQocmV2aWV3KTtcblx0XHRcdGNvbnN0IHBsYW5VcmkgPSBVUkkucmV2aXZlKHJldmlldy5wbGFuVXJpISk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEZlZWRiYWNrU2VydmljZSEuaXNBY3RpdmVQbGFuUmV2aWV3KHBsYW5VcmkpLCB0cnVlKTtcblxuXHRcdFx0cmV2aWV3LmRpc21pc3MoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGFjdGl2ZTogbGFzdEZlZWRiYWNrU2VydmljZSEuaXNBY3RpdmVQbGFuUmV2aWV3KHBsYW5VcmkpLFxuXHRcdFx0XHR1c2VkOiB3aWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtcGxhbi1yZXZpZXctdXNlZCcpLFxuXHRcdFx0XHRidXR0b25Db3VudDogZ2V0Rm9vdGVyQnV0dG9ucyh3aWRnZXQpLmxlbmd0aCxcblx0XHRcdH0sIHtcblx0XHRcdFx0YWN0aXZlOiBmYWxzZSxcblx0XHRcdFx0dXNlZDogdHJ1ZSxcblx0XHRcdFx0YnV0dG9uQ291bnQ6IDAsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2hhc1NhbWVDb250ZW50JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIGRpZmZlcmVudCBraW5kJywgKCkgPT4ge1xuXHRcdFx0Y3JlYXRlV2lkZ2V0KGNyZWF0ZU1vY2tSZXZpZXcoKSk7XG5cdFx0XHRjb25zdCBvdGhlcjogSUNoYXRSZW5kZXJlckNvbnRlbnQgPSB7IGtpbmQ6ICdkaXNhYmxlZENsYXVkZUhvb2tzJyB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpZGdldC5oYXNTYW1lQ29udGVudChvdGhlciwgW10sIHt9IGFzIG5ldmVyKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB0cnVlIGZvciBzYW1lIHJlc29sdmVJZCcsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgcmVzb2x2ZUlkOiAnYWJjLTEyMycgfSkpO1xuXHRcdFx0Y29uc3Qgb3RoZXIgPSBjcmVhdGVNb2NrUmV2aWV3KHsgcmVzb2x2ZUlkOiAnYWJjLTEyMycgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0Lmhhc1NhbWVDb250ZW50KG90aGVyLCBbXSwge30gYXMgbmV2ZXIpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIGRpZmZlcmVudCByZXNvbHZlSWQnLCAoKSA9PiB7XG5cdFx0XHRjcmVhdGVXaWRnZXQoY3JlYXRlTW9ja1Jldmlldyh7IHJlc29sdmVJZDogJ2FiYy0xMjMnIH0pKTtcblx0XHRcdGNvbnN0IG90aGVyID0gY3JlYXRlTW9ja1Jldmlldyh7IHJlc29sdmVJZDogJ2RlZi00NTYnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpZGdldC5oYXNTYW1lQ29udGVudChvdGhlciwgW10sIHt9IGFzIG5ldmVyKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSB3aGVuIGlzVXNlZCBtaXNtYXRjaCcsICgpID0+IHtcblx0XHRcdGNyZWF0ZVdpZGdldChjcmVhdGVNb2NrUmV2aWV3KHsgaXNVc2VkOiBmYWxzZSB9KSk7XG5cdFx0XHRjb25zdCBvdGhlciA9IGNyZWF0ZU1vY2tSZXZpZXcoeyBpc1VzZWQ6IHRydWUgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0Lmhhc1NhbWVDb250ZW50KG90aGVyLCBbXSwge30gYXMgbmV2ZXIpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsNEJBQTRCLGlDQUFpQztBQUN0RSxTQUFTLDBCQUFzRDtBQUkvRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHlCQUF5QixrQ0FBa0M7QUFDcEUsU0FBUyxzQkFBc0I7QUFDL0IsT0FBTyxXQUFXO0FBRWxCLFNBQTJCLHdCQUF3QjtBQUNuRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUFnRCxrQ0FBa0M7QUFDM0YsU0FBUyxTQUFTLFNBQVMsbUJBQW1CO0FBRTlDLFNBQVMsaUJBQWlCLFdBQXVEO0FBQ2hGLFNBQU87QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxJQUNQLFNBQVM7QUFBQSxJQUNULFNBQVMsQ0FB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
