import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { FEEDBACK_ANNOTATION_META_KEY } from "../../common/meta/agentFeedbackAnnotations.js";
import { ActionType } from "../../common/state/protocol/common/actions.js";
import { SessionStatus, buildChatUri } from "../../common/state/sessionState.js";
import { buildAnnotationsUri } from "../../common/annotationsUri.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { AgentServerToolHost } from "../../node/shared/agentServerToolHost.js";
import {
  addCommentToolName,
  applyFeedbackTool,
  deleteCommentsToolName,
  feedbackServerToolDefinitions,
  feedbackServerToolGroup,
  feedbackToolRequiresConfirmation,
  listCommentsToolName,
  resolveCommentsToolName,
  viewUnreviewedCommentsToolName
} from "../../node/shared/agentFeedbackServerTools.js";
suite("AgentFeedbackServerTools", () => {
  const sessionResource = "copilot:/test-session";
  const fileUri = "file:///workspace/app.ts";
  function annotation(id, state, resolved = false, text = "comment", kind = "codeReview", pendingAgentReveal = false) {
    return {
      id,
      turnId: "",
      resource: fileUri,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
      resolved,
      entries: [{ id: `${id}:0`, text }],
      _meta: { [FEEDBACK_ANNOTATION_META_KEY]: { kind, state, sessionResource, ...pendingAgentReveal ? { pendingAgentReveal: true } : {} } }
    };
  }
  function stateWith(...annotations) {
    return { annotations };
  }
  test("addComment produces an AnnotationsSet in the created state with a converted range", () => {
    const outcome = applyFeedbackTool(stateWith(), sessionResource, addCommentToolName, {
      resourceUri: fileUri,
      range: { startLineNumber: 3, startColumn: 2, endLineNumber: 3, endColumn: 10 },
      text: "please rename"
    });
    assert.strictEqual(outcome.result, "Comment added.");
    assert.strictEqual(outcome.actions.length, 1);
    const action = outcome.actions[0];
    assert.strictEqual(action.type, ActionType.AnnotationsSet);
    const set = action;
    assert.deepStrictEqual(set.annotation.range, { start: { line: 2, character: 1 }, end: { line: 2, character: 9 } });
    assert.strictEqual(set.annotation.entries.length, 1);
    assert.strictEqual(set.annotation.entries[0].text, "please rename");
    assert.deepStrictEqual(set.annotation._meta?.[FEEDBACK_ANNOTATION_META_KEY], { kind: "codeReview", state: "created", sessionResource });
  });
  test("listComments hides created items and serializes the rest", () => {
    const state = stateWith(
      annotation("a", "created", false, "hidden"),
      annotation("b", "accepted", false, "visible")
    );
    const outcome = applyFeedbackTool(state, sessionResource, listCommentsToolName, {});
    assert.strictEqual(outcome.actions.length, 0);
    assert.deepStrictEqual(JSON.parse(outcome.result), {
      comments: [{
        id: "b",
        resourceUri: fileUri,
        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 },
        text: "visible",
        kind: "codeReview",
        resolved: false
      }],
      note: "There is 1 code review comment which the user has not reviewed yet. If the user wants you to tackle them, call the `viewUnreviewedComments` tool to view them."
    });
  });
  test("deleteComments removes listable items and reports unknown ids", () => {
    const state = stateWith(
      annotation("a", "accepted"),
      annotation("b", "created")
    );
    const outcome = applyFeedbackTool(state, sessionResource, deleteCommentsToolName, { commentIds: ["a", "b", "missing"] });
    assert.deepStrictEqual(outcome.actions, [{ type: ActionType.AnnotationsRemoved, annotationId: "a" }]);
    const parsed = JSON.parse(outcome.result);
    assert.deepStrictEqual(parsed.deletedCommentIds, ["a"]);
    assert.deepStrictEqual(parsed.notFoundCommentIds, ["b", "missing"]);
    assert.deepStrictEqual(parsed.remainingComments, []);
  });
  test("resolveComments marks items resolved via AnnotationsSet", () => {
    const state = stateWith(annotation("a", "accepted"));
    const outcome = applyFeedbackTool(state, sessionResource, resolveCommentsToolName, { commentIds: ["a"] });
    assert.strictEqual(outcome.actions.length, 1);
    const set = outcome.actions[0];
    assert.strictEqual(set.type, ActionType.AnnotationsSet);
    assert.strictEqual(set.annotation.resolved, true);
    assert.deepStrictEqual(set.annotation._meta?.[FEEDBACK_ANNOTATION_META_KEY], { kind: "codeReview", state: "resolved", sessionResource });
    const parsed = JSON.parse(outcome.result);
    assert.deepStrictEqual(parsed.updatedCommentIds, ["a"]);
    assert.strictEqual(parsed.resolved, true);
  });
  test("resolveComments with resolved=false re-opens the item", () => {
    const state = stateWith(annotation("a", "resolved", true));
    const outcome = applyFeedbackTool(state, sessionResource, resolveCommentsToolName, { commentIds: ["a"], resolved: false });
    const set = outcome.actions[0];
    assert.strictEqual(set.annotation.resolved, false);
    assert.deepStrictEqual(set.annotation._meta?.[FEEDBACK_ANNOTATION_META_KEY], { kind: "codeReview", state: "submitted", sessionResource });
  });
  test("unknown tool name throws", () => {
    assert.throws(() => applyFeedbackTool(stateWith(), sessionResource, "nope", {}), /Unknown feedback server tool/);
  });
  test("listComments adds no note when there are no unreviewed reviewable comments", () => {
    const state = stateWith(annotation("a", "accepted", false, "visible"));
    const outcome = applyFeedbackTool(state, sessionResource, listCommentsToolName, {});
    assert.strictEqual(JSON.parse(outcome.result).note, void 0);
  });
  test("listComments note counts created PR and code-review comments per kind", () => {
    const state = stateWith(
      annotation("pr1", "created", false, "pr a", "prReview"),
      annotation("pr2", "created", false, "pr b", "prReview"),
      annotation("cr1", "created", false, "cr a", "codeReview"),
      // user-authored created comments are not "reviewable" and never counted
      annotation("u1", "created", false, "user", "user"),
      annotation("done", "accepted", false, "already reviewed", "prReview")
    );
    const outcome = applyFeedbackTool(state, sessionResource, listCommentsToolName, {});
    assert.strictEqual(
      JSON.parse(outcome.result).note,
      "There are 2 pull request comments and 1 code review comment which the user has not reviewed yet. If the user wants you to tackle them, call the `viewUnreviewedComments` tool to view them."
    );
  });
  test("viewUnreviewedComments returns the comments flagged for reveal and clears the flag", () => {
    const state = stateWith(
      annotation("pr1", "created", false, "still hidden", "prReview"),
      annotation("pr2", "accepted", false, "revealed pr", "prReview", true),
      annotation("cr1", "accepted", false, "revealed code review", "codeReview", true),
      // previously-accepted reviewable comment without the flag -> excluded
      annotation("pr3", "accepted", false, "old accepted pr", "prReview"),
      // user-authored comment is not reviewable -> excluded even when flagged
      annotation("u1", "accepted", false, "user comment", "user", true)
    );
    const outcome = applyFeedbackTool(state, sessionResource, viewUnreviewedCommentsToolName, {});
    const clearedIds = outcome.actions.map((a) => a.annotation.id);
    const clearedFlags = outcome.actions.map((a) => a.annotation._meta?.[FEEDBACK_ANNOTATION_META_KEY]);
    assert.deepStrictEqual({
      returnedIds: JSON.parse(outcome.result).comments.map((c) => c.id),
      clearedIds,
      flagsCleared: clearedFlags.every((meta) => meta.pendingAgentReveal === void 0)
    }, {
      returnedIds: ["pr2", "cr1"],
      clearedIds: ["pr2", "cr1"],
      flagsCleared: true
    });
  });
  test("viewUnreviewedComments requires confirmation; the read/mutate tools do not", () => {
    assert.deepStrictEqual({
      view: feedbackToolRequiresConfirmation(viewUnreviewedCommentsToolName),
      list: feedbackToolRequiresConfirmation(listCommentsToolName),
      add: feedbackToolRequiresConfirmation(addCommentToolName),
      del: feedbackToolRequiresConfirmation(deleteCommentsToolName),
      resolve: feedbackToolRequiresConfirmation(resolveCommentsToolName)
    }, {
      view: true,
      list: false,
      add: false,
      del: false,
      resolve: false
    });
  });
  test("addComment rejects invalid arguments", () => {
    assert.throws(() => applyFeedbackTool(stateWith(), sessionResource, addCommentToolName, { resourceUri: fileUri, text: "x" }), /range must be an object/);
    assert.throws(() => applyFeedbackTool(stateWith(), sessionResource, addCommentToolName, { resourceUri: "", range: {}, text: "x" }), /resourceUri must be a non-empty string/);
  });
  test("ignores annotations that do not carry feedback metadata", () => {
    const foreign = {
      id: "foreign",
      turnId: "",
      resource: fileUri,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
      resolved: false,
      entries: [{ id: "foreign:0", text: "not feedback" }]
    };
    const state = stateWith(foreign, annotation("a", "accepted", false, "real feedback"));
    const listed = applyFeedbackTool(state, sessionResource, listCommentsToolName, {});
    const deleted = applyFeedbackTool(state, sessionResource, deleteCommentsToolName, { commentIds: ["foreign"] });
    const resolved = applyFeedbackTool(state, sessionResource, resolveCommentsToolName, { commentIds: ["foreign"] });
    assert.deepStrictEqual({
      listedIds: JSON.parse(listed.result).comments.map((c) => c.id),
      deleteActions: deleted.actions,
      deleteNotFound: JSON.parse(deleted.result).notFoundCommentIds,
      resolveActions: resolved.actions,
      resolveNotFound: JSON.parse(resolved.result).notFoundCommentIds
    }, {
      listedIds: ["a"],
      deleteActions: [],
      deleteNotFound: ["foreign"],
      resolveActions: [],
      resolveNotFound: ["foreign"]
    });
  });
  suite("AgentServerToolHost", () => {
    let disposables;
    let manager;
    let host;
    function makeSummary() {
      return {
        resource: sessionResource,
        provider: "copilot",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    setup(() => {
      disposables = new DisposableStore();
      manager = disposables.add(new AgentHostStateManager(new NullLogService()));
      host = new AgentServerToolHost(manager, [feedbackServerToolGroup]);
    });
    teardown(() => disposables.dispose());
    test("executeTool round-trips a comment into the annotation state", () => {
      host.executeTool(sessionResource, addCommentToolName, {
        resourceUri: fileUri,
        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 },
        text: "hello"
      });
      const snapshot = manager.getSnapshot(buildAnnotationsUri(sessionResource));
      const state = snapshot.state;
      assert.strictEqual(state.annotations.length, 1);
      assert.strictEqual(state.annotations[0].entries[0].text, "hello");
    });
    test("executeTool stores comments on the main session when invoked from a chat URI", () => {
      const chatUri = buildChatUri(sessionResource, "peer-chat-1");
      host.executeTool(chatUri, addCommentToolName, {
        resourceUri: fileUri,
        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 },
        text: "from a peer chat"
      });
      assert.strictEqual(manager.getSnapshot(buildAnnotationsUri(chatUri)), void 0);
      const state = manager.getSnapshot(buildAnnotationsUri(sessionResource)).state;
      assert.strictEqual(state.annotations.length, 1);
      const meta = state.annotations[0]._meta?.[FEEDBACK_ANNOTATION_META_KEY];
      assert.deepStrictEqual({
        text: state.annotations[0].entries[0].text,
        sessionResource: meta.sessionResource
      }, {
        text: "from a peer chat",
        sessionResource
      });
    });
    test("advertise publishes the server tools as server tools", () => {
      manager.createSession(makeSummary());
      host.advertise(sessionResource);
      const state = manager.getSessionState(sessionResource);
      assert.deepStrictEqual(state?.serverTools, feedbackServerToolDefinitions);
    });
    test("requiresConfirmation reflects the owning group", () => {
      assert.deepStrictEqual({
        view: host.requiresConfirmation(viewUnreviewedCommentsToolName),
        list: host.requiresConfirmation(listCommentsToolName),
        unknown: host.requiresConfirmation("nope")
      }, {
        view: true,
        list: false,
        unknown: false
      });
    });
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRGZWVkYmFja1NlcnZlclRvb2xzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEZFRURCQUNLX0FOTk9UQVRJT05fTUVUQV9LRVkgfSBmcm9tICcuLi8uLi9jb21tb24vbWV0YS9hZ2VudEZlZWRiYWNrQW5ub3RhdGlvbnMuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBbm5vdGF0aW9uLCBBbm5vdGF0aW9uc1N0YXRlLCBTZXNzaW9uU3RhdHVzLCBTZXNzaW9uU3VtbWFyeSwgYnVpbGRDaGF0VXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBidWlsZEFubm90YXRpb25zVXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL2Fubm90YXRpb25zVXJpLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB7IEFnZW50U2VydmVyVG9vbEhvc3QgfSBmcm9tICcuLi8uLi9ub2RlL3NoYXJlZC9hZ2VudFNlcnZlclRvb2xIb3N0LmpzJztcbmltcG9ydCB7XG5cdGFkZENvbW1lbnRUb29sTmFtZSxcblx0YXBwbHlGZWVkYmFja1Rvb2wsXG5cdGRlbGV0ZUNvbW1lbnRzVG9vbE5hbWUsXG5cdGZlZWRiYWNrU2VydmVyVG9vbERlZmluaXRpb25zLFxuXHRmZWVkYmFja1NlcnZlclRvb2xHcm91cCxcblx0ZmVlZGJhY2tUb29sUmVxdWlyZXNDb25maXJtYXRpb24sXG5cdGxpc3RDb21tZW50c1Rvb2xOYW1lLFxuXHRyZXNvbHZlQ29tbWVudHNUb29sTmFtZSxcblx0dmlld1VucmV2aWV3ZWRDb21tZW50c1Rvb2xOYW1lLFxufSBmcm9tICcuLi8uLi9ub2RlL3NoYXJlZC9hZ2VudEZlZWRiYWNrU2VydmVyVG9vbHMuanMnO1xuXG5zdWl0ZSgnQWdlbnRGZWVkYmFja1NlcnZlclRvb2xzJywgKCkgPT4ge1xuXG5cdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9ICdjb3BpbG90Oi90ZXN0LXNlc3Npb24nO1xuXHRjb25zdCBmaWxlVXJpID0gJ2ZpbGU6Ly8vd29ya3NwYWNlL2FwcC50cyc7XG5cblx0ZnVuY3Rpb24gYW5ub3RhdGlvbihpZDogc3RyaW5nLCBzdGF0ZTogc3RyaW5nLCByZXNvbHZlZCA9IGZhbHNlLCB0ZXh0ID0gJ2NvbW1lbnQnLCBraW5kID0gJ2NvZGVSZXZpZXcnLCBwZW5kaW5nQWdlbnRSZXZlYWwgPSBmYWxzZSk6IEFubm90YXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZCxcblx0XHRcdHR1cm5JZDogJycsXG5cdFx0XHRyZXNvdXJjZTogZmlsZVVyaSxcblx0XHRcdHJhbmdlOiB7IHN0YXJ0OiB7IGxpbmU6IDAsIGNoYXJhY3RlcjogMCB9LCBlbmQ6IHsgbGluZTogMCwgY2hhcmFjdGVyOiA0IH0gfSxcblx0XHRcdHJlc29sdmVkLFxuXHRcdFx0ZW50cmllczogW3sgaWQ6IGAke2lkfTowYCwgdGV4dCB9XSxcblx0XHRcdF9tZXRhOiB7IFtGRUVEQkFDS19BTk5PVEFUSU9OX01FVEFfS0VZXTogeyBraW5kLCBzdGF0ZSwgc2Vzc2lvblJlc291cmNlLCAuLi4ocGVuZGluZ0FnZW50UmV2ZWFsID8geyBwZW5kaW5nQWdlbnRSZXZlYWw6IHRydWUgfSA6IHt9KSB9IH0sXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIHN0YXRlV2l0aCguLi5hbm5vdGF0aW9uczogQW5ub3RhdGlvbltdKTogQW5ub3RhdGlvbnNTdGF0ZSB7XG5cdFx0cmV0dXJuIHsgYW5ub3RhdGlvbnMgfTtcblx0fVxuXG5cdHRlc3QoJ2FkZENvbW1lbnQgcHJvZHVjZXMgYW4gQW5ub3RhdGlvbnNTZXQgaW4gdGhlIGNyZWF0ZWQgc3RhdGUgd2l0aCBhIGNvbnZlcnRlZCByYW5nZScsICgpID0+IHtcblx0XHRjb25zdCBvdXRjb21lID0gYXBwbHlGZWVkYmFja1Rvb2woc3RhdGVXaXRoKCksIHNlc3Npb25SZXNvdXJjZSwgYWRkQ29tbWVudFRvb2xOYW1lLCB7XG5cdFx0XHRyZXNvdXJjZVVyaTogZmlsZVVyaSxcblx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMywgc3RhcnRDb2x1bW46IDIsIGVuZExpbmVOdW1iZXI6IDMsIGVuZENvbHVtbjogMTAgfSxcblx0XHRcdHRleHQ6ICdwbGVhc2UgcmVuYW1lJyxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3V0Y29tZS5yZXN1bHQsICdDb21tZW50IGFkZGVkLicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRjb21lLmFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBhY3Rpb24gPSBvdXRjb21lLmFjdGlvbnNbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbi50eXBlLCBBY3Rpb25UeXBlLkFubm90YXRpb25zU2V0KTtcblx0XHRjb25zdCBzZXQgPSBhY3Rpb24gYXMgRXh0cmFjdDx0eXBlb2YgYWN0aW9uLCB7IHR5cGU6IEFjdGlvblR5cGUuQW5ub3RhdGlvbnNTZXQgfT47XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXQuYW5ub3RhdGlvbi5yYW5nZSwgeyBzdGFydDogeyBsaW5lOiAyLCBjaGFyYWN0ZXI6IDEgfSwgZW5kOiB7IGxpbmU6IDIsIGNoYXJhY3RlcjogOSB9IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXQuYW5ub3RhdGlvbi5lbnRyaWVzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNldC5hbm5vdGF0aW9uLmVudHJpZXNbMF0udGV4dCwgJ3BsZWFzZSByZW5hbWUnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNldC5hbm5vdGF0aW9uLl9tZXRhPy5bRkVFREJBQ0tfQU5OT1RBVElPTl9NRVRBX0tFWV0sIHsga2luZDogJ2NvZGVSZXZpZXcnLCBzdGF0ZTogJ2NyZWF0ZWQnLCBzZXNzaW9uUmVzb3VyY2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpc3RDb21tZW50cyBoaWRlcyBjcmVhdGVkIGl0ZW1zIGFuZCBzZXJpYWxpemVzIHRoZSByZXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gc3RhdGVXaXRoKFxuXHRcdFx0YW5ub3RhdGlvbignYScsICdjcmVhdGVkJywgZmFsc2UsICdoaWRkZW4nKSxcblx0XHRcdGFubm90YXRpb24oJ2InLCAnYWNjZXB0ZWQnLCBmYWxzZSwgJ3Zpc2libGUnKSxcblx0XHQpO1xuXHRcdGNvbnN0IG91dGNvbWUgPSBhcHBseUZlZWRiYWNrVG9vbChzdGF0ZSwgc2Vzc2lvblJlc291cmNlLCBsaXN0Q29tbWVudHNUb29sTmFtZSwge30pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRjb21lLmFjdGlvbnMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04ucGFyc2Uob3V0Y29tZS5yZXN1bHQpLCB7XG5cdFx0XHRjb21tZW50czogW3tcblx0XHRcdFx0aWQ6ICdiJyxcblx0XHRcdFx0cmVzb3VyY2VVcmk6IGZpbGVVcmksXG5cdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogNSB9LFxuXHRcdFx0XHR0ZXh0OiAndmlzaWJsZScsXG5cdFx0XHRcdGtpbmQ6ICdjb2RlUmV2aWV3Jyxcblx0XHRcdFx0cmVzb2x2ZWQ6IGZhbHNlLFxuXHRcdFx0fV0sXG5cdFx0XHRub3RlOiAnVGhlcmUgaXMgMSBjb2RlIHJldmlldyBjb21tZW50IHdoaWNoIHRoZSB1c2VyIGhhcyBub3QgcmV2aWV3ZWQgeWV0LiBJZiB0aGUgdXNlciB3YW50cyB5b3UgdG8gdGFja2xlIHRoZW0sIGNhbGwgdGhlIGB2aWV3VW5yZXZpZXdlZENvbW1lbnRzYCB0b29sIHRvIHZpZXcgdGhlbS4nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVDb21tZW50cyByZW1vdmVzIGxpc3RhYmxlIGl0ZW1zIGFuZCByZXBvcnRzIHVua25vd24gaWRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gc3RhdGVXaXRoKFxuXHRcdFx0YW5ub3RhdGlvbignYScsICdhY2NlcHRlZCcpLFxuXHRcdFx0YW5ub3RhdGlvbignYicsICdjcmVhdGVkJyksXG5cdFx0KTtcblx0XHRjb25zdCBvdXRjb21lID0gYXBwbHlGZWVkYmFja1Rvb2woc3RhdGUsIHNlc3Npb25SZXNvdXJjZSwgZGVsZXRlQ29tbWVudHNUb29sTmFtZSwgeyBjb21tZW50SWRzOiBbJ2EnLCAnYicsICdtaXNzaW5nJ10gfSk7XG5cdFx0Ly8gJ2InIGlzIGluIHRoZSBjcmVhdGVkIHN0YXRlIChub3QgbGlzdGFibGUpIHNvIGl0IGlzIHRyZWF0ZWQgYXMgbm90IGZvdW5kLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3V0Y29tZS5hY3Rpb25zLCBbeyB0eXBlOiBBY3Rpb25UeXBlLkFubm90YXRpb25zUmVtb3ZlZCwgYW5ub3RhdGlvbklkOiAnYScgfV0pO1xuXHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2Uob3V0Y29tZS5yZXN1bHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VkLmRlbGV0ZWRDb21tZW50SWRzLCBbJ2EnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQubm90Rm91bmRDb21tZW50SWRzLCBbJ2InLCAnbWlzc2luZyddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZC5yZW1haW5pbmdDb21tZW50cywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlQ29tbWVudHMgbWFya3MgaXRlbXMgcmVzb2x2ZWQgdmlhIEFubm90YXRpb25zU2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gc3RhdGVXaXRoKGFubm90YXRpb24oJ2EnLCAnYWNjZXB0ZWQnKSk7XG5cdFx0Y29uc3Qgb3V0Y29tZSA9IGFwcGx5RmVlZGJhY2tUb29sKHN0YXRlLCBzZXNzaW9uUmVzb3VyY2UsIHJlc29sdmVDb21tZW50c1Rvb2xOYW1lLCB7IGNvbW1lbnRJZHM6IFsnYSddIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRjb21lLmFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBzZXQgPSBvdXRjb21lLmFjdGlvbnNbMF0gYXMgRXh0cmFjdDx0eXBlb2Ygb3V0Y29tZS5hY3Rpb25zWzBdLCB7IHR5cGU6IEFjdGlvblR5cGUuQW5ub3RhdGlvbnNTZXQgfT47XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNldC50eXBlLCBBY3Rpb25UeXBlLkFubm90YXRpb25zU2V0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0LmFubm90YXRpb24ucmVzb2x2ZWQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2V0LmFubm90YXRpb24uX21ldGE/LltGRUVEQkFDS19BTk5PVEFUSU9OX01FVEFfS0VZXSwgeyBraW5kOiAnY29kZVJldmlldycsIHN0YXRlOiAncmVzb2x2ZWQnLCBzZXNzaW9uUmVzb3VyY2UgfSk7XG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShvdXRjb21lLnJlc3VsdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQudXBkYXRlZENvbW1lbnRJZHMsIFsnYSddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLnJlc29sdmVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZUNvbW1lbnRzIHdpdGggcmVzb2x2ZWQ9ZmFsc2UgcmUtb3BlbnMgdGhlIGl0ZW0nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZVdpdGgoYW5ub3RhdGlvbignYScsICdyZXNvbHZlZCcsIHRydWUpKTtcblx0XHRjb25zdCBvdXRjb21lID0gYXBwbHlGZWVkYmFja1Rvb2woc3RhdGUsIHNlc3Npb25SZXNvdXJjZSwgcmVzb2x2ZUNvbW1lbnRzVG9vbE5hbWUsIHsgY29tbWVudElkczogWydhJ10sIHJlc29sdmVkOiBmYWxzZSB9KTtcblx0XHRjb25zdCBzZXQgPSBvdXRjb21lLmFjdGlvbnNbMF0gYXMgRXh0cmFjdDx0eXBlb2Ygb3V0Y29tZS5hY3Rpb25zWzBdLCB7IHR5cGU6IEFjdGlvblR5cGUuQW5ub3RhdGlvbnNTZXQgfT47XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNldC5hbm5vdGF0aW9uLnJlc29sdmVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXQuYW5ub3RhdGlvbi5fbWV0YT8uW0ZFRURCQUNLX0FOTk9UQVRJT05fTUVUQV9LRVldLCB7IGtpbmQ6ICdjb2RlUmV2aWV3Jywgc3RhdGU6ICdzdWJtaXR0ZWQnLCBzZXNzaW9uUmVzb3VyY2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Vua25vd24gdG9vbCBuYW1lIHRocm93cycsICgpID0+IHtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGFwcGx5RmVlZGJhY2tUb29sKHN0YXRlV2l0aCgpLCBzZXNzaW9uUmVzb3VyY2UsICdub3BlJywge30pLCAvVW5rbm93biBmZWVkYmFjayBzZXJ2ZXIgdG9vbC8pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0Q29tbWVudHMgYWRkcyBubyBub3RlIHdoZW4gdGhlcmUgYXJlIG5vIHVucmV2aWV3ZWQgcmV2aWV3YWJsZSBjb21tZW50cycsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IHN0YXRlV2l0aChhbm5vdGF0aW9uKCdhJywgJ2FjY2VwdGVkJywgZmFsc2UsICd2aXNpYmxlJykpO1xuXHRcdGNvbnN0IG91dGNvbWUgPSBhcHBseUZlZWRiYWNrVG9vbChzdGF0ZSwgc2Vzc2lvblJlc291cmNlLCBsaXN0Q29tbWVudHNUb29sTmFtZSwge30pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChKU09OLnBhcnNlKG91dGNvbWUucmVzdWx0KS5ub3RlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0Q29tbWVudHMgbm90ZSBjb3VudHMgY3JlYXRlZCBQUiBhbmQgY29kZS1yZXZpZXcgY29tbWVudHMgcGVyIGtpbmQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZVdpdGgoXG5cdFx0XHRhbm5vdGF0aW9uKCdwcjEnLCAnY3JlYXRlZCcsIGZhbHNlLCAncHIgYScsICdwclJldmlldycpLFxuXHRcdFx0YW5ub3RhdGlvbigncHIyJywgJ2NyZWF0ZWQnLCBmYWxzZSwgJ3ByIGInLCAncHJSZXZpZXcnKSxcblx0XHRcdGFubm90YXRpb24oJ2NyMScsICdjcmVhdGVkJywgZmFsc2UsICdjciBhJywgJ2NvZGVSZXZpZXcnKSxcblx0XHRcdC8vIHVzZXItYXV0aG9yZWQgY3JlYXRlZCBjb21tZW50cyBhcmUgbm90IFwicmV2aWV3YWJsZVwiIGFuZCBuZXZlciBjb3VudGVkXG5cdFx0XHRhbm5vdGF0aW9uKCd1MScsICdjcmVhdGVkJywgZmFsc2UsICd1c2VyJywgJ3VzZXInKSxcblx0XHRcdGFubm90YXRpb24oJ2RvbmUnLCAnYWNjZXB0ZWQnLCBmYWxzZSwgJ2FscmVhZHkgcmV2aWV3ZWQnLCAncHJSZXZpZXcnKSxcblx0XHQpO1xuXHRcdGNvbnN0IG91dGNvbWUgPSBhcHBseUZlZWRiYWNrVG9vbChzdGF0ZSwgc2Vzc2lvblJlc291cmNlLCBsaXN0Q29tbWVudHNUb29sTmFtZSwge30pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdEpTT04ucGFyc2Uob3V0Y29tZS5yZXN1bHQpLm5vdGUsXG5cdFx0XHQnVGhlcmUgYXJlIDIgcHVsbCByZXF1ZXN0IGNvbW1lbnRzIGFuZCAxIGNvZGUgcmV2aWV3IGNvbW1lbnQgd2hpY2ggdGhlIHVzZXIgaGFzIG5vdCByZXZpZXdlZCB5ZXQuIElmIHRoZSB1c2VyIHdhbnRzIHlvdSB0byB0YWNrbGUgdGhlbSwgY2FsbCB0aGUgYHZpZXdVbnJldmlld2VkQ29tbWVudHNgIHRvb2wgdG8gdmlldyB0aGVtLicsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndmlld1VucmV2aWV3ZWRDb21tZW50cyByZXR1cm5zIHRoZSBjb21tZW50cyBmbGFnZ2VkIGZvciByZXZlYWwgYW5kIGNsZWFycyB0aGUgZmxhZycsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IHN0YXRlV2l0aChcblx0XHRcdGFubm90YXRpb24oJ3ByMScsICdjcmVhdGVkJywgZmFsc2UsICdzdGlsbCBoaWRkZW4nLCAncHJSZXZpZXcnKSxcblx0XHRcdGFubm90YXRpb24oJ3ByMicsICdhY2NlcHRlZCcsIGZhbHNlLCAncmV2ZWFsZWQgcHInLCAncHJSZXZpZXcnLCB0cnVlKSxcblx0XHRcdGFubm90YXRpb24oJ2NyMScsICdhY2NlcHRlZCcsIGZhbHNlLCAncmV2ZWFsZWQgY29kZSByZXZpZXcnLCAnY29kZVJldmlldycsIHRydWUpLFxuXHRcdFx0Ly8gcHJldmlvdXNseS1hY2NlcHRlZCByZXZpZXdhYmxlIGNvbW1lbnQgd2l0aG91dCB0aGUgZmxhZyAtPiBleGNsdWRlZFxuXHRcdFx0YW5ub3RhdGlvbigncHIzJywgJ2FjY2VwdGVkJywgZmFsc2UsICdvbGQgYWNjZXB0ZWQgcHInLCAncHJSZXZpZXcnKSxcblx0XHRcdC8vIHVzZXItYXV0aG9yZWQgY29tbWVudCBpcyBub3QgcmV2aWV3YWJsZSAtPiBleGNsdWRlZCBldmVuIHdoZW4gZmxhZ2dlZFxuXHRcdFx0YW5ub3RhdGlvbigndTEnLCAnYWNjZXB0ZWQnLCBmYWxzZSwgJ3VzZXIgY29tbWVudCcsICd1c2VyJywgdHJ1ZSksXG5cdFx0KTtcblx0XHRjb25zdCBvdXRjb21lID0gYXBwbHlGZWVkYmFja1Rvb2woc3RhdGUsIHNlc3Npb25SZXNvdXJjZSwgdmlld1VucmV2aWV3ZWRDb21tZW50c1Rvb2xOYW1lLCB7fSk7XG5cdFx0Y29uc3QgY2xlYXJlZElkcyA9IG91dGNvbWUuYWN0aW9ucy5tYXAoYSA9PiAoYSBhcyBFeHRyYWN0PHR5cGVvZiBhLCB7IHR5cGU6IEFjdGlvblR5cGUuQW5ub3RhdGlvbnNTZXQgfT4pLmFubm90YXRpb24uaWQpO1xuXHRcdGNvbnN0IGNsZWFyZWRGbGFncyA9IG91dGNvbWUuYWN0aW9ucy5tYXAoYSA9PiAoYSBhcyBFeHRyYWN0PHR5cGVvZiBhLCB7IHR5cGU6IEFjdGlvblR5cGUuQW5ub3RhdGlvbnNTZXQgfT4pLmFubm90YXRpb24uX21ldGE/LltGRUVEQkFDS19BTk5PVEFUSU9OX01FVEFfS0VZXSBhcyB7IHBlbmRpbmdBZ2VudFJldmVhbD86IGJvb2xlYW4gfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXR1cm5lZElkczogSlNPTi5wYXJzZShvdXRjb21lLnJlc3VsdCkuY29tbWVudHMubWFwKChjOiB7IGlkOiBzdHJpbmcgfSkgPT4gYy5pZCksXG5cdFx0XHRjbGVhcmVkSWRzLFxuXHRcdFx0ZmxhZ3NDbGVhcmVkOiBjbGVhcmVkRmxhZ3MuZXZlcnkobWV0YSA9PiBtZXRhLnBlbmRpbmdBZ2VudFJldmVhbCA9PT0gdW5kZWZpbmVkKSxcblx0XHR9LCB7XG5cdFx0XHRyZXR1cm5lZElkczogWydwcjInLCAnY3IxJ10sXG5cdFx0XHRjbGVhcmVkSWRzOiBbJ3ByMicsICdjcjEnXSxcblx0XHRcdGZsYWdzQ2xlYXJlZDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndmlld1VucmV2aWV3ZWRDb21tZW50cyByZXF1aXJlcyBjb25maXJtYXRpb247IHRoZSByZWFkL211dGF0ZSB0b29scyBkbyBub3QnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR2aWV3OiBmZWVkYmFja1Rvb2xSZXF1aXJlc0NvbmZpcm1hdGlvbih2aWV3VW5yZXZpZXdlZENvbW1lbnRzVG9vbE5hbWUpLFxuXHRcdFx0bGlzdDogZmVlZGJhY2tUb29sUmVxdWlyZXNDb25maXJtYXRpb24obGlzdENvbW1lbnRzVG9vbE5hbWUpLFxuXHRcdFx0YWRkOiBmZWVkYmFja1Rvb2xSZXF1aXJlc0NvbmZpcm1hdGlvbihhZGRDb21tZW50VG9vbE5hbWUpLFxuXHRcdFx0ZGVsOiBmZWVkYmFja1Rvb2xSZXF1aXJlc0NvbmZpcm1hdGlvbihkZWxldGVDb21tZW50c1Rvb2xOYW1lKSxcblx0XHRcdHJlc29sdmU6IGZlZWRiYWNrVG9vbFJlcXVpcmVzQ29uZmlybWF0aW9uKHJlc29sdmVDb21tZW50c1Rvb2xOYW1lKSxcblx0XHR9LCB7XG5cdFx0XHR2aWV3OiB0cnVlLFxuXHRcdFx0bGlzdDogZmFsc2UsXG5cdFx0XHRhZGQ6IGZhbHNlLFxuXHRcdFx0ZGVsOiBmYWxzZSxcblx0XHRcdHJlc29sdmU6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRDb21tZW50IHJlamVjdHMgaW52YWxpZCBhcmd1bWVudHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBhcHBseUZlZWRiYWNrVG9vbChzdGF0ZVdpdGgoKSwgc2Vzc2lvblJlc291cmNlLCBhZGRDb21tZW50VG9vbE5hbWUsIHsgcmVzb3VyY2VVcmk6IGZpbGVVcmksIHRleHQ6ICd4JyB9KSwgL3JhbmdlIG11c3QgYmUgYW4gb2JqZWN0Lyk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBhcHBseUZlZWRiYWNrVG9vbChzdGF0ZVdpdGgoKSwgc2Vzc2lvblJlc291cmNlLCBhZGRDb21tZW50VG9vbE5hbWUsIHsgcmVzb3VyY2VVcmk6ICcnLCByYW5nZToge30sIHRleHQ6ICd4JyB9KSwgL3Jlc291cmNlVXJpIG11c3QgYmUgYSBub24tZW1wdHkgc3RyaW5nLyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgYW5ub3RhdGlvbnMgdGhhdCBkbyBub3QgY2FycnkgZmVlZGJhY2sgbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0Ly8gQSBub24tZmVlZGJhY2sgYW5ub3RhdGlvbiBwcm9kdWNlZCBieSBhbm90aGVyIGZlYXR1cmUgc2hhcmluZyB0aGVcblx0XHQvLyBnZW5lcmljIGFubm90YXRpb25zIGNoYW5uZWwgbXVzdCBiZSBpbnZpc2libGUgdG8gdGhlIGZlZWRiYWNrIHRvb2xzOlxuXHRcdC8vIGl0IGlzIG5ldmVyIGxpc3RlZCwgYW5kIGRlbGV0ZS9yZXNvbHZlIHRyZWF0IGl0IGFzIG5vdCBmb3VuZCByYXRoZXJcblx0XHQvLyB0aGFuIG11dGF0aW5nIGl0LlxuXHRcdGNvbnN0IGZvcmVpZ246IEFubm90YXRpb24gPSB7XG5cdFx0XHRpZDogJ2ZvcmVpZ24nLFxuXHRcdFx0dHVybklkOiAnJyxcblx0XHRcdHJlc291cmNlOiBmaWxlVXJpLFxuXHRcdFx0cmFuZ2U6IHsgc3RhcnQ6IHsgbGluZTogMCwgY2hhcmFjdGVyOiAwIH0sIGVuZDogeyBsaW5lOiAwLCBjaGFyYWN0ZXI6IDQgfSB9LFxuXHRcdFx0cmVzb2x2ZWQ6IGZhbHNlLFxuXHRcdFx0ZW50cmllczogW3sgaWQ6ICdmb3JlaWduOjAnLCB0ZXh0OiAnbm90IGZlZWRiYWNrJyB9XSxcblx0XHR9O1xuXHRcdGNvbnN0IHN0YXRlID0gc3RhdGVXaXRoKGZvcmVpZ24sIGFubm90YXRpb24oJ2EnLCAnYWNjZXB0ZWQnLCBmYWxzZSwgJ3JlYWwgZmVlZGJhY2snKSk7XG5cblx0XHRjb25zdCBsaXN0ZWQgPSBhcHBseUZlZWRiYWNrVG9vbChzdGF0ZSwgc2Vzc2lvblJlc291cmNlLCBsaXN0Q29tbWVudHNUb29sTmFtZSwge30pO1xuXHRcdGNvbnN0IGRlbGV0ZWQgPSBhcHBseUZlZWRiYWNrVG9vbChzdGF0ZSwgc2Vzc2lvblJlc291cmNlLCBkZWxldGVDb21tZW50c1Rvb2xOYW1lLCB7IGNvbW1lbnRJZHM6IFsnZm9yZWlnbiddIH0pO1xuXHRcdGNvbnN0IHJlc29sdmVkID0gYXBwbHlGZWVkYmFja1Rvb2woc3RhdGUsIHNlc3Npb25SZXNvdXJjZSwgcmVzb2x2ZUNvbW1lbnRzVG9vbE5hbWUsIHsgY29tbWVudElkczogWydmb3JlaWduJ10gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxpc3RlZElkczogSlNPTi5wYXJzZShsaXN0ZWQucmVzdWx0KS5jb21tZW50cy5tYXAoKGM6IHsgaWQ6IHN0cmluZyB9KSA9PiBjLmlkKSxcblx0XHRcdGRlbGV0ZUFjdGlvbnM6IGRlbGV0ZWQuYWN0aW9ucyxcblx0XHRcdGRlbGV0ZU5vdEZvdW5kOiBKU09OLnBhcnNlKGRlbGV0ZWQucmVzdWx0KS5ub3RGb3VuZENvbW1lbnRJZHMsXG5cdFx0XHRyZXNvbHZlQWN0aW9uczogcmVzb2x2ZWQuYWN0aW9ucyxcblx0XHRcdHJlc29sdmVOb3RGb3VuZDogSlNPTi5wYXJzZShyZXNvbHZlZC5yZXN1bHQpLm5vdEZvdW5kQ29tbWVudElkcyxcblx0XHR9LCB7XG5cdFx0XHRsaXN0ZWRJZHM6IFsnYSddLFxuXHRcdFx0ZGVsZXRlQWN0aW9uczogW10sXG5cdFx0XHRkZWxldGVOb3RGb3VuZDogWydmb3JlaWduJ10sXG5cdFx0XHRyZXNvbHZlQWN0aW9uczogW10sXG5cdFx0XHRyZXNvbHZlTm90Rm91bmQ6IFsnZm9yZWlnbiddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQWdlbnRTZXJ2ZXJUb29sSG9zdCcsICgpID0+IHtcblxuXHRcdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRcdGxldCBtYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXI7XG5cdFx0bGV0IGhvc3Q6IEFnZW50U2VydmVyVG9vbEhvc3Q7XG5cblx0XHRmdW5jdGlvbiBtYWtlU3VtbWFyeSgpOiBTZXNzaW9uU3VtbWFyeSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0XHR0aXRsZTogJ1Rlc3QnLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRtYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdGhvc3QgPSBuZXcgQWdlbnRTZXJ2ZXJUb29sSG9zdChtYW5hZ2VyLCBbZmVlZGJhY2tTZXJ2ZXJUb29sR3JvdXBdKTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cblx0XHR0ZXN0KCdleGVjdXRlVG9vbCByb3VuZC10cmlwcyBhIGNvbW1lbnQgaW50byB0aGUgYW5ub3RhdGlvbiBzdGF0ZScsICgpID0+IHtcblx0XHRcdGhvc3QuZXhlY3V0ZVRvb2woc2Vzc2lvblJlc291cmNlLCBhZGRDb21tZW50VG9vbE5hbWUsIHtcblx0XHRcdFx0cmVzb3VyY2VVcmk6IGZpbGVVcmksXG5cdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMiB9LFxuXHRcdFx0XHR0ZXh0OiAnaGVsbG8nLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzbmFwc2hvdCA9IG1hbmFnZXIuZ2V0U25hcHNob3QoYnVpbGRBbm5vdGF0aW9uc1VyaShzZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gc25hcHNob3QhLnN0YXRlIGFzIEFubm90YXRpb25zU3RhdGU7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuYW5ub3RhdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hbm5vdGF0aW9uc1swXS5lbnRyaWVzWzBdLnRleHQsICdoZWxsbycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhlY3V0ZVRvb2wgc3RvcmVzIGNvbW1lbnRzIG9uIHRoZSBtYWluIHNlc3Npb24gd2hlbiBpbnZva2VkIGZyb20gYSBjaGF0IFVSSScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZENoYXRVcmkoc2Vzc2lvblJlc291cmNlLCAncGVlci1jaGF0LTEnKTtcblx0XHRcdGhvc3QuZXhlY3V0ZVRvb2woY2hhdFVyaSwgYWRkQ29tbWVudFRvb2xOYW1lLCB7XG5cdFx0XHRcdHJlc291cmNlVXJpOiBmaWxlVXJpLFxuXHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDIgfSxcblx0XHRcdFx0dGV4dDogJ2Zyb20gYSBwZWVyIGNoYXQnLFxuXHRcdFx0fSk7XG5cdFx0XHQvLyBUaGUgY29tbWVudCBtdXN0IGxhbmQgb24gdGhlIG1haW4gc2Vzc2lvbidzIGFubm90YXRpb25zIGNoYW5uZWwsXG5cdFx0XHQvLyBub3Qgb24gdGhlIGluZGl2aWR1YWwgY2hhdCdzLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0U25hcHNob3QoYnVpbGRBbm5vdGF0aW9uc1VyaShjaGF0VXJpKSksIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IG1hbmFnZXIuZ2V0U25hcHNob3QoYnVpbGRBbm5vdGF0aW9uc1VyaShzZXNzaW9uUmVzb3VyY2UpKSEuc3RhdGUgYXMgQW5ub3RhdGlvbnNTdGF0ZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hbm5vdGF0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0Y29uc3QgbWV0YSA9IHN0YXRlLmFubm90YXRpb25zWzBdLl9tZXRhPy5bRkVFREJBQ0tfQU5OT1RBVElPTl9NRVRBX0tFWV0gYXMgeyBzZXNzaW9uUmVzb3VyY2U6IHN0cmluZyB9O1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHRleHQ6IHN0YXRlLmFubm90YXRpb25zWzBdLmVudHJpZXNbMF0udGV4dCxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBtZXRhLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdH0sIHtcblx0XHRcdFx0dGV4dDogJ2Zyb20gYSBwZWVyIGNoYXQnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FkdmVydGlzZSBwdWJsaXNoZXMgdGhlIHNlcnZlciB0b29scyBhcyBzZXJ2ZXIgdG9vbHMnLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkoKSk7XG5cdFx0XHRob3N0LmFkdmVydGlzZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZT8uc2VydmVyVG9vbHMsIGZlZWRiYWNrU2VydmVyVG9vbERlZmluaXRpb25zKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlcXVpcmVzQ29uZmlybWF0aW9uIHJlZmxlY3RzIHRoZSBvd25pbmcgZ3JvdXAnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dmlldzogaG9zdC5yZXF1aXJlc0NvbmZpcm1hdGlvbih2aWV3VW5yZXZpZXdlZENvbW1lbnRzVG9vbE5hbWUpLFxuXHRcdFx0XHRsaXN0OiBob3N0LnJlcXVpcmVzQ29uZmlybWF0aW9uKGxpc3RDb21tZW50c1Rvb2xOYW1lKSxcblx0XHRcdFx0dW5rbm93bjogaG9zdC5yZXF1aXJlc0NvbmZpcm1hdGlvbignbm9wZScpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR2aWV3OiB0cnVlLFxuXHRcdFx0XHRsaXN0OiBmYWxzZSxcblx0XHRcdFx0dW5rbm93bjogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9D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
