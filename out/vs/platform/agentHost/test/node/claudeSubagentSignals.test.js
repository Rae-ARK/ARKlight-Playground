import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { ToolCallConfirmationReason, ToolCallContributorKind } from "../../common/state/sessionState.js";
import { ClaudeMapperState, mapSDKMessageToAgentSignals } from "../../node/claude/claudeMapSessionEvents.js";
import { SubagentRegistry } from "../../node/claude/claudeSubagentRegistry.js";
import { buildTopLevelSubagentReadyAction, mapSubagentSystemMessage } from "../../node/claude/claudeSubagentSignals.js";
import {
  makeAssistantMessage,
  makeContentBlockStartText,
  makeContentBlockStartToolUse,
  makeStreamEvent,
  makeUserToolResultMessage
} from "./claudeMapSessionEventsTestUtils.js";
suite("claudeSubagentSignals \u2014 Phase 12 emission", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const SESSION = URI.parse("agent-session://test/abc");
  const SESSION_ID = "sid-1";
  const TURN_ID = "turn-1";
  function r() {
    return disposables.add(new SubagentRegistry());
  }
  test("top-level Task tool_use records a spawn; non-subagent tools do not", () => {
    const state = new ClaudeMapperState();
    const log = new NullLogService();
    const registry = r();
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "toolu_task", "Task")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(1, "toolu_agent", "Agent")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(2, "toolu_read", "Read")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    assert.deepStrictEqual({
      task: registry.getSpawn("toolu_task")?.toolUseId,
      agent: registry.getSpawn("toolu_agent")?.toolUseId,
      read: registry.getSpawn("toolu_read")
    }, {
      task: "toolu_task",
      agent: "toolu_agent",
      read: void 0
    });
  });
  test("top-level Task ChatToolCallStart carries _meta.toolKind=subagent so the workbench renders the subagent UI", () => {
    const state = new ClaudeMapperState();
    const log = new NullLogService();
    const registry = r();
    const taskSignals = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "toolu_task", "Task")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const readSignals = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(1, "toolu_read", "Read")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const taskAction = taskSignals[0];
    const readAction = readSignals[0];
    assert.ok(taskAction.kind === "action" && taskAction.action.type === ActionType.ChatToolCallStart, "Task signal is ChatToolCallStart");
    assert.ok(readAction.kind === "action" && readAction.action.type === ActionType.ChatToolCallStart, "Read signal is ChatToolCallStart");
    assert.deepStrictEqual({
      taskMeta: taskAction.action._meta,
      readMeta: readAction.action._meta
    }, {
      taskMeta: { toolKind: "subagent" },
      readMeta: void 0
    });
  });
  test("top-level canonical assistant for Task emits ChatToolCallReady with confirmed:NotNeeded + _meta.subagentDescription/AgentName AND records metadata onto the spawn", () => {
    const state = new ClaudeMapperState();
    const log = new NullLogService();
    const registry = r();
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "toolu_top_task", "Task")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const canonical = makeAssistantMessage(SESSION_ID, [{
      type: "tool_use",
      id: "toolu_top_task",
      name: "Task",
      input: { description: "Count TS files", subagent_type: "Explore", prompt: "Count how many TS files..." }
    }]);
    const out = mapSDKMessageToAgentSignals(canonical, SESSION, TURN_ID, state, log, registry);
    const ready = out.find((s) => s.kind === "action" && s.action.type === ActionType.ChatToolCallReady);
    assert.ok(ready && ready.kind === "action" && ready.action.type === ActionType.ChatToolCallReady, "Ready emitted");
    const spawn = registry.getSpawn("toolu_top_task");
    assert.deepStrictEqual({
      toolCallId: ready.action.toolCallId,
      invocationMessage: ready.action.invocationMessage,
      confirmed: ready.action.confirmed,
      meta: ready.action._meta,
      parentToolCallId: ready.parentToolCallId,
      spawnSubagentType: spawn?.subagentType,
      spawnDescription: spawn?.description
    }, {
      toolCallId: "toolu_top_task",
      invocationMessage: "Count TS files",
      confirmed: ToolCallConfirmationReason.NotNeeded,
      meta: {
        toolKind: "subagent",
        subagentDescription: "Count TS files",
        subagentAgentName: "Explore"
      },
      parentToolCallId: void 0,
      spawnSubagentType: "Explore",
      spawnDescription: "Count TS files"
    });
  });
  test("inner subagent message: prepends subagent_started exactly once, tags emitted action with parentToolCallId, records inner-tool\u2192parent edge", () => {
    const state = new ClaudeMapperState();
    const log = new NullLogService();
    const registry = r();
    const PARENT = "toolu_parent";
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, PARENT, "Task")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const innerText = makeStreamEvent(SESSION_ID, makeContentBlockStartText(0));
    innerText.parent_tool_use_id = PARENT;
    const first = mapSDKMessageToAgentSignals(innerText, SESSION, TURN_ID, state, log, registry);
    const innerToolUse = makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(1, "toolu_inner", "Read"));
    innerToolUse.parent_tool_use_id = PARENT;
    const second = mapSDKMessageToAgentSignals(innerToolUse, SESSION, TURN_ID, state, log, registry);
    assert.deepStrictEqual({
      firstKinds: first.map((s) => s.kind),
      firstStartedToolCallId: first[0]?.kind === "subagent_started" ? first[0].toolCallId : null,
      firstActionParent: first.filter((s) => s.kind === "action").map((s) => s.kind === "action" ? s.parentToolCallId : null),
      secondKinds: second.map((s) => s.kind),
      secondActionParent: second.filter((s) => s.kind === "action").map((s) => s.kind === "action" ? s.parentToolCallId : null),
      innerToolParentSpawnId: registry.getParentSpawn("toolu_inner")?.toolUseId
    }, {
      firstKinds: ["subagent_started", "action"],
      firstStartedToolCallId: PARENT,
      firstActionParent: [PARENT],
      secondKinds: ["action"],
      secondActionParent: [PARENT],
      innerToolParentSpawnId: PARENT
    });
  });
  test("inner emission with unknown parent_tool_use_id (no spawn recorded) does NOT prepend subagent_started \u2014 tagging still applies", () => {
    const state = new ClaudeMapperState();
    const log = new NullLogService();
    const registry = r();
    const innerText = makeStreamEvent(SESSION_ID, makeContentBlockStartText(0));
    innerText.parent_tool_use_id = "toolu_unknown";
    const out = mapSDKMessageToAgentSignals(innerText, SESSION, TURN_ID, state, log, registry);
    assert.deepStrictEqual({
      kinds: out.map((s) => s.kind),
      actionParents: out.filter((s) => s.kind === "action").map((s) => s.kind === "action" ? s.parentToolCallId : null)
    }, {
      kinds: ["action"],
      actionParents: ["toolu_unknown"]
    });
  });
  test("inner subagent canonical assistant message emits text/thinking/tool_use signals + tags them with parentToolCallId, lets the matching tool_result complete", () => {
    const state = new ClaudeMapperState();
    const log = new NullLogService();
    const registry = r();
    const PARENT = "toolu_parent_inner";
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, PARENT, "Task")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const innerAssistant = makeAssistantMessage(SESSION_ID, [
      { type: "text", text: "looking up files", citations: null },
      { type: "tool_use", id: "toolu_inner_glob", name: "Glob", input: { pattern: "**/*.ts" } }
    ]);
    innerAssistant.parent_tool_use_id = PARENT;
    const fromAssistant = mapSDKMessageToAgentSignals(innerAssistant, SESSION, TURN_ID, state, log, registry);
    const innerToolResult = makeUserToolResultMessage(SESSION_ID, "toolu_inner_glob", "a.ts\nb.ts");
    innerToolResult.parent_tool_use_id = PARENT;
    const fromToolResult = mapSDKMessageToAgentSignals(innerToolResult, SESSION, TURN_ID, state, log, registry);
    const kinds = fromAssistant.map((s) => s.kind);
    const allParentIds = [...fromAssistant, ...fromToolResult].filter((s) => s.kind === "action").map((s) => s.kind === "action" ? s.parentToolCallId : null);
    const completeAction = fromToolResult.find((s) => s.kind === "action" && s.action.type === ActionType.ChatToolCallComplete);
    const completePastTense = completeAction?.kind === "action" && completeAction.action.type === ActionType.ChatToolCallComplete ? completeAction.action.result.pastTenseMessage : void 0;
    assert.deepStrictEqual({
      fromAssistantKinds: kinds,
      toolUseEdge: registry.getParentSpawn("toolu_inner_glob")?.toolUseId,
      fromToolResultHasComplete: completeAction !== void 0,
      everyActionTaggedWithParent: allParentIds.every((p) => p === PARENT),
      // D6 parity: inner-tool past-tense must use the rich helper
      // (seeded by `seedParsedInput` at start time), not fall back to
      // the generic "{displayName} finished" — replay always renders
      // rich text, so a generic live message would silently diverge.
      completePastTense
    }, {
      fromAssistantKinds: ["subagent_started", "action", "action", "action"],
      toolUseEdge: PARENT,
      fromToolResultHasComplete: true,
      everyActionTaggedWithParent: true,
      completePastTense: { markdown: "Found files matching `**/*.ts`" }
    });
  });
  test("inner client tools preserve client ownership and generic input across the lifecycle", () => {
    const state = new ClaudeMapperState();
    const log = new NullLogService();
    const registry = r();
    const parentToolCallId = "toolu_parent_client";
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, parentToolCallId, "Task")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const innerAssistant = makeAssistantMessage(SESSION_ID, [
      { type: "tool_use", id: "toolu_inner_client", name: "mcp__client__Bash", input: { command: "echo client" } }
    ]);
    innerAssistant.parent_tool_use_id = parentToolCallId;
    const fromAssistant = mapSDKMessageToAgentSignals(innerAssistant, SESSION, TURN_ID, state, log, registry, () => "client-1");
    const innerToolResult = makeUserToolResultMessage(SESSION_ID, "toolu_inner_client", "done");
    innerToolResult.parent_tool_use_id = parentToolCallId;
    const fromResult = mapSDKMessageToAgentSignals(innerToolResult, SESSION, TURN_ID, state, log, registry);
    const actions = [...fromAssistant, ...fromResult].filter((signal) => signal.kind === "action").map((signal) => signal.kind === "action" ? signal.action : void 0);
    assert.deepStrictEqual(actions.map((action) => {
      switch (action?.type) {
        case ActionType.ChatToolCallStart:
          return {
            type: action.type,
            toolName: action.toolName,
            displayName: action.displayName,
            contributor: action.contributor,
            meta: action._meta
          };
        case ActionType.ChatToolCallReady:
          return {
            type: action.type,
            invocationMessage: action.invocationMessage,
            toolInput: action.toolInput
          };
        case ActionType.ChatToolCallComplete:
          return {
            type: action.type,
            pastTenseMessage: action.result.pastTenseMessage
          };
        default:
          return void 0;
      }
    }).filter((item) => item !== void 0), [
      {
        type: ActionType.ChatToolCallStart,
        toolName: "Bash",
        displayName: "Bash",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-1" },
        meta: void 0
      },
      {
        type: ActionType.ChatToolCallReady,
        invocationMessage: "Bash",
        toolInput: '{\n  "command": "echo client"\n}'
      },
      {
        type: ActionType.ChatToolCallComplete,
        pastTenseMessage: "Bash"
      }
    ]);
  });
  test("foreground subagent completion: tool_result for a Task spawn emits ChatToolCallComplete AND IAgentSubagentCompletedSignal, then clears the spawn from the registry", () => {
    const state = new ClaudeMapperState();
    const log = new NullLogService();
    const registry = r();
    const PARENT = "toolu_fg_task";
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, PARENT, "Task")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const signals = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, PARENT, "done"),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    assert.deepStrictEqual({
      kinds: signals.map((s) => s.kind),
      completedToolCallId: signals.find((s) => s.kind === "subagent_completed")?.toolCallId,
      spawnCleared: registry.getSpawn(PARENT)
    }, {
      kinds: ["action", "subagent_completed"],
      completedToolCallId: PARENT,
      spawnCleared: void 0
    });
  });
  test("background subagent completion: task_started then tool_result yields NO completion; later task_notification fires it", () => {
    const state = new ClaudeMapperState();
    const log = new NullLogService();
    const registry = r();
    const PARENT = "toolu_bg_task";
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, PARENT, "Task")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    mapSDKMessageToAgentSignals(
      { type: "system", subtype: "task_started", task_id: "t1", tool_use_id: PARENT, description: "bg" },
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const afterToolResult = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, PARENT, "tool returned"),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const isBackgroundAfterToolResult = registry.getSpawn(PARENT)?.background;
    const afterNotification = mapSDKMessageToAgentSignals(
      { type: "system", subtype: "task_notification", task_id: "t1", tool_use_id: PARENT, status: "completed", output_file: "o", summary: "s" },
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const afterNotificationAgain = mapSDKMessageToAgentSignals(
      { type: "system", subtype: "task_notification", task_id: "t1", tool_use_id: PARENT, status: "completed", output_file: "o", summary: "s" },
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    assert.deepStrictEqual({
      afterToolResultKinds: afterToolResult.map((s) => s.kind),
      isBackgroundAfterToolResult,
      afterNotificationKinds: afterNotification.map((s) => s.kind),
      completedToolCallId: afterNotification.find((s) => s.kind === "subagent_completed")?.toolCallId,
      afterNotificationAgainKinds: afterNotificationAgain.map((s) => s.kind),
      spawnClearedAfterNotification: registry.getSpawn(PARENT)
    }, {
      afterToolResultKinds: ["action"],
      isBackgroundAfterToolResult: true,
      afterNotificationKinds: ["subagent_completed"],
      completedToolCallId: PARENT,
      afterNotificationAgainKinds: [],
      spawnClearedAfterNotification: void 0
    });
  });
  test("buildTopLevelSubagentReadyAction omits _meta description/agentName when input fields are missing or wrong-typed; still records the spawn", () => {
    const registry = r();
    const malformed = buildTopLevelSubagentReadyAction(
      { type: "tool_use", id: "toolu_bad", name: "Task", input: { description: 42, subagent_type: null } },
      SESSION,
      TURN_ID,
      registry
    );
    assert.ok(malformed.kind === "action" && malformed.action.type === ActionType.ChatToolCallReady);
    const spawn = registry.getSpawn("toolu_bad");
    assert.deepStrictEqual({
      meta: malformed.action._meta,
      invocationMessage: malformed.action.invocationMessage,
      spawnRecorded: spawn?.toolUseId,
      spawnSubagentType: spawn?.subagentType,
      spawnDescription: spawn?.description
    }, {
      meta: { toolKind: "subagent" },
      invocationMessage: "Run subagent task",
      spawnRecorded: "toolu_bad",
      spawnSubagentType: void 0,
      spawnDescription: void 0
    });
  });
  test("mapSubagentSystemMessage ignores task_notification with non-terminal status, missing tool_use_id, or unknown spawn", () => {
    const registry = r();
    registry.recordSpawn("toolu_known");
    const inProgress = mapSubagentSystemMessage({ type: "system", subtype: "task_notification", task_id: "t", tool_use_id: "toolu_known", status: "in_progress" }, SESSION, registry);
    const missingId = mapSubagentSystemMessage({ type: "system", subtype: "task_notification", task_id: "t", status: "completed" }, SESSION, registry);
    const unknownEntry = mapSubagentSystemMessage({ type: "system", subtype: "task_notification", task_id: "t", tool_use_id: "toolu_unknown", status: "completed" }, SESSION, registry);
    assert.deepStrictEqual({
      inProgressKinds: inProgress.map((s) => s.kind),
      missingIdKinds: missingId.map((s) => s.kind),
      unknownEntryKinds: unknownEntry.map((s) => s.kind)
    }, {
      inProgressKinds: [],
      missingIdKinds: [],
      unknownEntryKinds: []
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY2xhdWRlU3ViYWdlbnRTaWduYWxzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgdHlwZSB7IFNES01lc3NhZ2UgfSBmcm9tICdAYW50aHJvcGljLWFpL2NsYXVkZS1hZ2VudC1zZGsnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQ2xhdWRlTWFwcGVyU3RhdGUsIG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyB9IGZyb20gJy4uLy4uL25vZGUvY2xhdWRlL2NsYXVkZU1hcFNlc3Npb25FdmVudHMuanMnO1xuaW1wb3J0IHsgU3ViYWdlbnRSZWdpc3RyeSB9IGZyb20gJy4uLy4uL25vZGUvY2xhdWRlL2NsYXVkZVN1YmFnZW50UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgYnVpbGRUb3BMZXZlbFN1YmFnZW50UmVhZHlBY3Rpb24sIG1hcFN1YmFnZW50U3lzdGVtTWVzc2FnZSB9IGZyb20gJy4uLy4uL25vZGUvY2xhdWRlL2NsYXVkZVN1YmFnZW50U2lnbmFscy5qcyc7XG5pbXBvcnQge1xuXHRtYWtlQXNzaXN0YW50TWVzc2FnZSxcblx0bWFrZUNvbnRlbnRCbG9ja1N0YXJ0VGV4dCxcblx0bWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSxcblx0bWFrZVN0cmVhbUV2ZW50LFxuXHRtYWtlVXNlclRvb2xSZXN1bHRNZXNzYWdlLFxufSBmcm9tICcuL2NsYXVkZU1hcFNlc3Npb25FdmVudHNUZXN0VXRpbHMuanMnO1xuXG4vKipcbiAqIERpcmVjdCB0ZXN0cyBmb3IgUGhhc2UgMTIgc3ViYWdlbnQgc2lnbmFsIGVtaXNzaW9uLlxuICpcbiAqIERyaXZlcyBgbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzYCBlbmQtdG8tZW5kIGZvciB0aGUgaW50ZWdyYXRlZFxuICogcGF0aHMsIGFuZCB0aGUgdHdvIG5ld2x5LWV4cG9ydGVkIGBjbGF1ZGVTdWJhZ2VudFNpZ25hbHNgIGZ1bmN0aW9uc1xuICogZGlyZWN0bHkgZm9yIHRoZWlyIGNvbnRyYWN0LWxldmVsIGFzc2VydGlvbnMuIFVzZXMgYSBmcmVzaCByZWFsXG4gKiB7QGxpbmsgU3ViYWdlbnRSZWdpc3RyeX0gcGVyIHRlc3Qgc28gc3ViYWdlbnQgc3RhdGUgaXMgdmlzaWJsZVxuICogYWNyb3NzIG1hcHBlciBpbnZvY2F0aW9ucyBhbmQgYXNzZXJ0YWJsZSBkaXJlY3RseSBvbiB0aGUgc3Bhd24gcmVjb3JkLlxuICovXG5zdWl0ZSgnY2xhdWRlU3ViYWdlbnRTaWduYWxzIFx1MjAxNCBQaGFzZSAxMiBlbWlzc2lvbicsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IFNFU1NJT04gPSBVUkkucGFyc2UoJ2FnZW50LXNlc3Npb246Ly90ZXN0L2FiYycpO1xuXHRjb25zdCBTRVNTSU9OX0lEID0gJ3NpZC0xJztcblx0Y29uc3QgVFVSTl9JRCA9ICd0dXJuLTEnO1xuXG5cdGZ1bmN0aW9uIHIoKTogU3ViYWdlbnRSZWdpc3RyeSB7XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChuZXcgU3ViYWdlbnRSZWdpc3RyeSgpKTtcblx0fVxuXG5cdHRlc3QoJ3RvcC1sZXZlbCBUYXNrIHRvb2xfdXNlIHJlY29yZHMgYSBzcGF3bjsgbm9uLXN1YmFnZW50IHRvb2xzIGRvIG5vdCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gcigpO1xuXG5cdFx0bWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRvb2xVc2UoMCwgJ3Rvb2x1X3Rhc2snLCAnVGFzaycpKSxcblx0XHRcdFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlZ2lzdHJ5LFxuXHRcdCk7XG5cdFx0bWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRvb2xVc2UoMSwgJ3Rvb2x1X2FnZW50JywgJ0FnZW50JykpLFxuXHRcdFx0U0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVnaXN0cnksXG5cdFx0KTtcblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgyLCAndG9vbHVfcmVhZCcsICdSZWFkJykpLFxuXHRcdFx0U0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVnaXN0cnksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dGFzazogcmVnaXN0cnkuZ2V0U3Bhd24oJ3Rvb2x1X3Rhc2snKT8udG9vbFVzZUlkLFxuXHRcdFx0YWdlbnQ6IHJlZ2lzdHJ5LmdldFNwYXduKCd0b29sdV9hZ2VudCcpPy50b29sVXNlSWQsXG5cdFx0XHRyZWFkOiByZWdpc3RyeS5nZXRTcGF3bigndG9vbHVfcmVhZCcpLFxuXHRcdH0sIHtcblx0XHRcdHRhc2s6ICd0b29sdV90YXNrJyxcblx0XHRcdGFnZW50OiAndG9vbHVfYWdlbnQnLFxuXHRcdFx0cmVhZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0b3AtbGV2ZWwgVGFzayBDaGF0VG9vbENhbGxTdGFydCBjYXJyaWVzIF9tZXRhLnRvb2xLaW5kPXN1YmFnZW50IHNvIHRoZSB3b3JrYmVuY2ggcmVuZGVycyB0aGUgc3ViYWdlbnQgVUknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKTtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCByZWdpc3RyeSA9IHIoKTtcblxuXHRcdGNvbnN0IHRhc2tTaWduYWxzID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRvb2xVc2UoMCwgJ3Rvb2x1X3Rhc2snLCAnVGFzaycpKSxcblx0XHRcdFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlZ2lzdHJ5LFxuXHRcdCk7XG5cdFx0Y29uc3QgcmVhZFNpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgxLCAndG9vbHVfcmVhZCcsICdSZWFkJykpLFxuXHRcdFx0U0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVnaXN0cnksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHRhc2tBY3Rpb24gPSB0YXNrU2lnbmFsc1swXTtcblx0XHRjb25zdCByZWFkQWN0aW9uID0gcmVhZFNpZ25hbHNbMF07XG5cdFx0YXNzZXJ0Lm9rKHRhc2tBY3Rpb24ua2luZCA9PT0gJ2FjdGlvbicgJiYgdGFza0FjdGlvbi5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgJ1Rhc2sgc2lnbmFsIGlzIENoYXRUb29sQ2FsbFN0YXJ0Jyk7XG5cdFx0YXNzZXJ0Lm9rKHJlYWRBY3Rpb24ua2luZCA9PT0gJ2FjdGlvbicgJiYgcmVhZEFjdGlvbi5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgJ1JlYWQgc2lnbmFsIGlzIENoYXRUb29sQ2FsbFN0YXJ0Jyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRhc2tNZXRhOiB0YXNrQWN0aW9uLmFjdGlvbi5fbWV0YSxcblx0XHRcdHJlYWRNZXRhOiByZWFkQWN0aW9uLmFjdGlvbi5fbWV0YSxcblx0XHR9LCB7XG5cdFx0XHR0YXNrTWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50JyB9LFxuXHRcdFx0cmVhZE1ldGE6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndG9wLWxldmVsIGNhbm9uaWNhbCBhc3Npc3RhbnQgZm9yIFRhc2sgZW1pdHMgQ2hhdFRvb2xDYWxsUmVhZHkgd2l0aCBjb25maXJtZWQ6Tm90TmVlZGVkICsgX21ldGEuc3ViYWdlbnREZXNjcmlwdGlvbi9BZ2VudE5hbWUgQU5EIHJlY29yZHMgbWV0YWRhdGEgb250byB0aGUgc3Bhd24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKTtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCByZWdpc3RyeSA9IHIoKTtcblxuXHRcdG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDAsICd0b29sdV90b3BfdGFzaycsICdUYXNrJykpLFxuXHRcdFx0U0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVnaXN0cnksXG5cdFx0KTtcblxuXHRcdGNvbnN0IGNhbm9uaWNhbCA9IG1ha2VBc3Npc3RhbnRNZXNzYWdlKFNFU1NJT05fSUQsIFt7XG5cdFx0XHR0eXBlOiAndG9vbF91c2UnLFxuXHRcdFx0aWQ6ICd0b29sdV90b3BfdGFzaycsXG5cdFx0XHRuYW1lOiAnVGFzaycsXG5cdFx0XHRpbnB1dDogeyBkZXNjcmlwdGlvbjogJ0NvdW50IFRTIGZpbGVzJywgc3ViYWdlbnRfdHlwZTogJ0V4cGxvcmUnLCBwcm9tcHQ6ICdDb3VudCBob3cgbWFueSBUUyBmaWxlcy4uLicgfSxcblx0XHR9XSk7XG5cdFx0Y29uc3Qgb3V0ID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKGNhbm9uaWNhbCwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVnaXN0cnkpO1xuXG5cdFx0Y29uc3QgcmVhZHkgPSBvdXQuZmluZChzID0+IHMua2luZCA9PT0gJ2FjdGlvbicgJiYgcy5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSk7XG5cdFx0YXNzZXJ0Lm9rKHJlYWR5ICYmIHJlYWR5LmtpbmQgPT09ICdhY3Rpb24nICYmIHJlYWR5LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCAnUmVhZHkgZW1pdHRlZCcpO1xuXG5cdFx0Y29uc3Qgc3Bhd24gPSByZWdpc3RyeS5nZXRTcGF3bigndG9vbHVfdG9wX3Rhc2snKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRvb2xDYWxsSWQ6IHJlYWR5LmFjdGlvbi50b29sQ2FsbElkLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHJlYWR5LmFjdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdGNvbmZpcm1lZDogcmVhZHkuYWN0aW9uLmNvbmZpcm1lZCxcblx0XHRcdG1ldGE6IHJlYWR5LmFjdGlvbi5fbWV0YSxcblx0XHRcdHBhcmVudFRvb2xDYWxsSWQ6IHJlYWR5LnBhcmVudFRvb2xDYWxsSWQsXG5cdFx0XHRzcGF3blN1YmFnZW50VHlwZTogc3Bhd24/LnN1YmFnZW50VHlwZSxcblx0XHRcdHNwYXduRGVzY3JpcHRpb246IHNwYXduPy5kZXNjcmlwdGlvbixcblx0XHR9LCB7XG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbHVfdG9wX3Rhc2snLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdDb3VudCBUUyBmaWxlcycsXG5cdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdG1ldGE6IHtcblx0XHRcdFx0dG9vbEtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdHN1YmFnZW50RGVzY3JpcHRpb246ICdDb3VudCBUUyBmaWxlcycsXG5cdFx0XHRcdHN1YmFnZW50QWdlbnROYW1lOiAnRXhwbG9yZScsXG5cdFx0XHR9LFxuXHRcdFx0cGFyZW50VG9vbENhbGxJZDogdW5kZWZpbmVkLFxuXHRcdFx0c3Bhd25TdWJhZ2VudFR5cGU6ICdFeHBsb3JlJyxcblx0XHRcdHNwYXduRGVzY3JpcHRpb246ICdDb3VudCBUUyBmaWxlcycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lubmVyIHN1YmFnZW50IG1lc3NhZ2U6IHByZXBlbmRzIHN1YmFnZW50X3N0YXJ0ZWQgZXhhY3RseSBvbmNlLCB0YWdzIGVtaXR0ZWQgYWN0aW9uIHdpdGggcGFyZW50VG9vbENhbGxJZCwgcmVjb3JkcyBpbm5lci10b29sXHUyMTkycGFyZW50IGVkZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKTtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCByZWdpc3RyeSA9IHIoKTtcblx0XHRjb25zdCBQQVJFTlQgPSAndG9vbHVfcGFyZW50JztcblxuXHRcdG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDAsIFBBUkVOVCwgJ1Rhc2snKSksXG5cdFx0XHRTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZWdpc3RyeSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgaW5uZXJUZXh0ID0gbWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRleHQoMCkpO1xuXHRcdGlubmVyVGV4dC5wYXJlbnRfdG9vbF91c2VfaWQgPSBQQVJFTlQ7XG5cdFx0Y29uc3QgZmlyc3QgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoaW5uZXJUZXh0LCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZWdpc3RyeSk7XG5cblx0XHRjb25zdCBpbm5lclRvb2xVc2UgPSBtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgxLCAndG9vbHVfaW5uZXInLCAnUmVhZCcpKTtcblx0XHRpbm5lclRvb2xVc2UucGFyZW50X3Rvb2xfdXNlX2lkID0gUEFSRU5UO1xuXHRcdGNvbnN0IHNlY29uZCA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhpbm5lclRvb2xVc2UsIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlZ2lzdHJ5KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Zmlyc3RLaW5kczogZmlyc3QubWFwKHMgPT4gcy5raW5kKSxcblx0XHRcdGZpcnN0U3RhcnRlZFRvb2xDYWxsSWQ6IGZpcnN0WzBdPy5raW5kID09PSAnc3ViYWdlbnRfc3RhcnRlZCcgPyBmaXJzdFswXS50b29sQ2FsbElkIDogbnVsbCxcblx0XHRcdGZpcnN0QWN0aW9uUGFyZW50OiBmaXJzdC5maWx0ZXIocyA9PiBzLmtpbmQgPT09ICdhY3Rpb24nKS5tYXAocyA9PiBzLmtpbmQgPT09ICdhY3Rpb24nID8gcy5wYXJlbnRUb29sQ2FsbElkIDogbnVsbCksXG5cdFx0XHRzZWNvbmRLaW5kczogc2Vjb25kLm1hcChzID0+IHMua2luZCksXG5cdFx0XHRzZWNvbmRBY3Rpb25QYXJlbnQ6IHNlY29uZC5maWx0ZXIocyA9PiBzLmtpbmQgPT09ICdhY3Rpb24nKS5tYXAocyA9PiBzLmtpbmQgPT09ICdhY3Rpb24nID8gcy5wYXJlbnRUb29sQ2FsbElkIDogbnVsbCksXG5cdFx0XHRpbm5lclRvb2xQYXJlbnRTcGF3bklkOiByZWdpc3RyeS5nZXRQYXJlbnRTcGF3bigndG9vbHVfaW5uZXInKT8udG9vbFVzZUlkLFxuXHRcdH0sIHtcblx0XHRcdGZpcnN0S2luZHM6IFsnc3ViYWdlbnRfc3RhcnRlZCcsICdhY3Rpb24nXSxcblx0XHRcdGZpcnN0U3RhcnRlZFRvb2xDYWxsSWQ6IFBBUkVOVCxcblx0XHRcdGZpcnN0QWN0aW9uUGFyZW50OiBbUEFSRU5UXSxcblx0XHRcdHNlY29uZEtpbmRzOiBbJ2FjdGlvbiddLFxuXHRcdFx0c2Vjb25kQWN0aW9uUGFyZW50OiBbUEFSRU5UXSxcblx0XHRcdGlubmVyVG9vbFBhcmVudFNwYXduSWQ6IFBBUkVOVCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW5uZXIgZW1pc3Npb24gd2l0aCB1bmtub3duIHBhcmVudF90b29sX3VzZV9pZCAobm8gc3Bhd24gcmVjb3JkZWQpIGRvZXMgTk9UIHByZXBlbmQgc3ViYWdlbnRfc3RhcnRlZCBcdTIwMTQgdGFnZ2luZyBzdGlsbCBhcHBsaWVzJywgKCkgPT4ge1xuXHRcdC8vIE5ldyBtb2RlbDogXCJubyBzcGF3biBtZWFucyBubyBhbm5vdW5jZW1lbnRcIi4gSWYgdGhlIHJlZ2lzdHJ5XG5cdFx0Ly8gaGFzIG5ldmVyIHNlZW4gdGhlIHBhcmVudCAoYW5kIHRodXMgaGFzIG5vIG1ldGFkYXRhKSwgZW1pdHRpbmdcblx0XHQvLyBhIHN1YmFnZW50X3N0YXJ0ZWQgd291bGQgYmUgbHlpbmcgYWJvdXQgYSBzZXNzaW9uIHRoYXQgbmV2ZXJcblx0XHQvLyBleGlzdGVkLiBUaGUgYWN0aW9uIGlzIHN0aWxsIHRhZ2dlZCB3aXRoIHBhcmVudFRvb2xDYWxsSWQgc29cblx0XHQvLyBBZ2VudFNpZGVFZmZlY3RzIGNhbiByb3V0ZSBpdCAob3IgYnVmZmVyIC8gZHJvcCkuXG5cdFx0Y29uc3Qgc3RhdGUgPSBuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKTtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCByZWdpc3RyeSA9IHIoKTtcblxuXHRcdGNvbnN0IGlubmVyVGV4dCA9IG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUZXh0KDApKTtcblx0XHRpbm5lclRleHQucGFyZW50X3Rvb2xfdXNlX2lkID0gJ3Rvb2x1X3Vua25vd24nO1xuXHRcdGNvbnN0IG91dCA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhpbm5lclRleHQsIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlZ2lzdHJ5KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0a2luZHM6IG91dC5tYXAocyA9PiBzLmtpbmQpLFxuXHRcdFx0YWN0aW9uUGFyZW50czogb3V0LmZpbHRlcihzID0+IHMua2luZCA9PT0gJ2FjdGlvbicpLm1hcChzID0+IHMua2luZCA9PT0gJ2FjdGlvbicgPyBzLnBhcmVudFRvb2xDYWxsSWQgOiBudWxsKSxcblx0XHR9LCB7XG5cdFx0XHRraW5kczogWydhY3Rpb24nXSxcblx0XHRcdGFjdGlvblBhcmVudHM6IFsndG9vbHVfdW5rbm93biddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbm5lciBzdWJhZ2VudCBjYW5vbmljYWwgYXNzaXN0YW50IG1lc3NhZ2UgZW1pdHMgdGV4dC90aGlua2luZy90b29sX3VzZSBzaWduYWxzICsgdGFncyB0aGVtIHdpdGggcGFyZW50VG9vbENhbGxJZCwgbGV0cyB0aGUgbWF0Y2hpbmcgdG9vbF9yZXN1bHQgY29tcGxldGUnLCAoKSA9PiB7XG5cdFx0Ly8gRW1waXJpY2FsbHkgdGhlIFNESyBkZWxpdmVycyBpbm5lciBjb250ZW50IHZpYSBjYW5vbmljYWwgbWVzc2FnZXMsXG5cdFx0Ly8gbm90IHBhcnRpYWxzIFx1MjAxNCB0aGlzIGV4ZXJjaXNlcyB0aGF0IGludGVncmF0aW9uIHBhdGggZW5kLXRvLWVuZC5cblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gcigpO1xuXHRcdGNvbnN0IFBBUkVOVCA9ICd0b29sdV9wYXJlbnRfaW5uZXInO1xuXG5cdFx0bWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRvb2xVc2UoMCwgUEFSRU5ULCAnVGFzaycpKSxcblx0XHRcdFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlZ2lzdHJ5LFxuXHRcdCk7XG5cblx0XHRjb25zdCBpbm5lckFzc2lzdGFudCA9IG1ha2VBc3Npc3RhbnRNZXNzYWdlKFNFU1NJT05fSUQsIFtcblx0XHRcdHsgdHlwZTogJ3RleHQnLCB0ZXh0OiAnbG9va2luZyB1cCBmaWxlcycsIGNpdGF0aW9uczogbnVsbCB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbF91c2UnLCBpZDogJ3Rvb2x1X2lubmVyX2dsb2InLCBuYW1lOiAnR2xvYicsIGlucHV0OiB7IHBhdHRlcm46ICcqKi8qLnRzJyB9IH0sXG5cdFx0XSk7XG5cdFx0aW5uZXJBc3Npc3RhbnQucGFyZW50X3Rvb2xfdXNlX2lkID0gUEFSRU5UO1xuXHRcdGNvbnN0IGZyb21Bc3Npc3RhbnQgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoaW5uZXJBc3Npc3RhbnQsIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlZ2lzdHJ5KTtcblxuXHRcdGNvbnN0IGlubmVyVG9vbFJlc3VsdCA9IG1ha2VVc2VyVG9vbFJlc3VsdE1lc3NhZ2UoU0VTU0lPTl9JRCwgJ3Rvb2x1X2lubmVyX2dsb2InLCAnYS50c1xcbmIudHMnKTtcblx0XHRpbm5lclRvb2xSZXN1bHQucGFyZW50X3Rvb2xfdXNlX2lkID0gUEFSRU5UO1xuXHRcdGNvbnN0IGZyb21Ub29sUmVzdWx0ID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKGlubmVyVG9vbFJlc3VsdCwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVnaXN0cnkpO1xuXG5cdFx0Y29uc3Qga2luZHMgPSBmcm9tQXNzaXN0YW50Lm1hcChzID0+IHMua2luZCk7XG5cdFx0Y29uc3QgYWxsUGFyZW50SWRzID0gWy4uLmZyb21Bc3Npc3RhbnQsIC4uLmZyb21Ub29sUmVzdWx0XS5maWx0ZXIocyA9PiBzLmtpbmQgPT09ICdhY3Rpb24nKS5tYXAocyA9PiBzLmtpbmQgPT09ICdhY3Rpb24nID8gcy5wYXJlbnRUb29sQ2FsbElkIDogbnVsbCk7XG5cdFx0Y29uc3QgY29tcGxldGVBY3Rpb24gPSBmcm9tVG9vbFJlc3VsdC5maW5kKHMgPT4gcy5raW5kID09PSAnYWN0aW9uJyAmJiBzLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlKTtcblx0XHRjb25zdCBjb21wbGV0ZVBhc3RUZW5zZSA9IGNvbXBsZXRlQWN0aW9uPy5raW5kID09PSAnYWN0aW9uJyAmJiBjb21wbGV0ZUFjdGlvbi5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZVxuXHRcdFx0PyBjb21wbGV0ZUFjdGlvbi5hY3Rpb24ucmVzdWx0LnBhc3RUZW5zZU1lc3NhZ2Vcblx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmcm9tQXNzaXN0YW50S2luZHM6IGtpbmRzLFxuXHRcdFx0dG9vbFVzZUVkZ2U6IHJlZ2lzdHJ5LmdldFBhcmVudFNwYXduKCd0b29sdV9pbm5lcl9nbG9iJyk/LnRvb2xVc2VJZCxcblx0XHRcdGZyb21Ub29sUmVzdWx0SGFzQ29tcGxldGU6IGNvbXBsZXRlQWN0aW9uICE9PSB1bmRlZmluZWQsXG5cdFx0XHRldmVyeUFjdGlvblRhZ2dlZFdpdGhQYXJlbnQ6IGFsbFBhcmVudElkcy5ldmVyeShwID0+IHAgPT09IFBBUkVOVCksXG5cdFx0XHQvLyBENiBwYXJpdHk6IGlubmVyLXRvb2wgcGFzdC10ZW5zZSBtdXN0IHVzZSB0aGUgcmljaCBoZWxwZXJcblx0XHRcdC8vIChzZWVkZWQgYnkgYHNlZWRQYXJzZWRJbnB1dGAgYXQgc3RhcnQgdGltZSksIG5vdCBmYWxsIGJhY2sgdG9cblx0XHRcdC8vIHRoZSBnZW5lcmljIFwie2Rpc3BsYXlOYW1lfSBmaW5pc2hlZFwiIFx1MjAxNCByZXBsYXkgYWx3YXlzIHJlbmRlcnNcblx0XHRcdC8vIHJpY2ggdGV4dCwgc28gYSBnZW5lcmljIGxpdmUgbWVzc2FnZSB3b3VsZCBzaWxlbnRseSBkaXZlcmdlLlxuXHRcdFx0Y29tcGxldGVQYXN0VGVuc2UsXG5cdFx0fSwge1xuXHRcdFx0ZnJvbUFzc2lzdGFudEtpbmRzOiBbJ3N1YmFnZW50X3N0YXJ0ZWQnLCAnYWN0aW9uJywgJ2FjdGlvbicsICdhY3Rpb24nXSxcblx0XHRcdHRvb2xVc2VFZGdlOiBQQVJFTlQsXG5cdFx0XHRmcm9tVG9vbFJlc3VsdEhhc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0ZXZlcnlBY3Rpb25UYWdnZWRXaXRoUGFyZW50OiB0cnVlLFxuXHRcdFx0Y29tcGxldGVQYXN0VGVuc2U6IHsgbWFya2Rvd246ICdGb3VuZCBmaWxlcyBtYXRjaGluZyBgKiovKi50c2AnIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lubmVyIGNsaWVudCB0b29scyBwcmVzZXJ2ZSBjbGllbnQgb3duZXJzaGlwIGFuZCBnZW5lcmljIGlucHV0IGFjcm9zcyB0aGUgbGlmZWN5Y2xlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gbmV3IENsYXVkZU1hcHBlclN0YXRlKCk7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSByKCk7XG5cdFx0Y29uc3QgcGFyZW50VG9vbENhbGxJZCA9ICd0b29sdV9wYXJlbnRfY2xpZW50Jztcblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgwLCBwYXJlbnRUb29sQ2FsbElkLCAnVGFzaycpKSxcblx0XHRcdFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlZ2lzdHJ5LFxuXHRcdCk7XG5cblx0XHRjb25zdCBpbm5lckFzc2lzdGFudCA9IG1ha2VBc3Npc3RhbnRNZXNzYWdlKFNFU1NJT05fSUQsIFtcblx0XHRcdHsgdHlwZTogJ3Rvb2xfdXNlJywgaWQ6ICd0b29sdV9pbm5lcl9jbGllbnQnLCBuYW1lOiAnbWNwX19jbGllbnRfX0Jhc2gnLCBpbnB1dDogeyBjb21tYW5kOiAnZWNobyBjbGllbnQnIH0gfSxcblx0XHRdKTtcblx0XHRpbm5lckFzc2lzdGFudC5wYXJlbnRfdG9vbF91c2VfaWQgPSBwYXJlbnRUb29sQ2FsbElkO1xuXHRcdGNvbnN0IGZyb21Bc3Npc3RhbnQgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoaW5uZXJBc3Npc3RhbnQsIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlZ2lzdHJ5LCAoKSA9PiAnY2xpZW50LTEnKTtcblx0XHRjb25zdCBpbm5lclRvb2xSZXN1bHQgPSBtYWtlVXNlclRvb2xSZXN1bHRNZXNzYWdlKFNFU1NJT05fSUQsICd0b29sdV9pbm5lcl9jbGllbnQnLCAnZG9uZScpO1xuXHRcdGlubmVyVG9vbFJlc3VsdC5wYXJlbnRfdG9vbF91c2VfaWQgPSBwYXJlbnRUb29sQ2FsbElkO1xuXHRcdGNvbnN0IGZyb21SZXN1bHQgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoaW5uZXJUb29sUmVzdWx0LCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZWdpc3RyeSk7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gWy4uLmZyb21Bc3Npc3RhbnQsIC4uLmZyb21SZXN1bHRdLmZpbHRlcihzaWduYWwgPT4gc2lnbmFsLmtpbmQgPT09ICdhY3Rpb24nKS5tYXAoc2lnbmFsID0+IHNpZ25hbC5raW5kID09PSAnYWN0aW9uJyA/IHNpZ25hbC5hY3Rpb24gOiB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucy5tYXAoYWN0aW9uID0+IHtcblx0XHRcdHN3aXRjaCAoYWN0aW9uPy50eXBlKSB7XG5cdFx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydDpcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0dHlwZTogYWN0aW9uLnR5cGUsXG5cdFx0XHRcdFx0XHR0b29sTmFtZTogYWN0aW9uLnRvb2xOYW1lLFxuXHRcdFx0XHRcdFx0ZGlzcGxheU5hbWU6IGFjdGlvbi5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRcdGNvbnRyaWJ1dG9yOiBhY3Rpb24uY29udHJpYnV0b3IsXG5cdFx0XHRcdFx0XHRtZXRhOiBhY3Rpb24uX21ldGEsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5OlxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBhY3Rpb24udHlwZSxcblx0XHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBhY3Rpb24uaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdFx0XHR0b29sSW5wdXQ6IGFjdGlvbi50b29sSW5wdXQsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlOlxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBhY3Rpb24udHlwZSxcblx0XHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGFjdGlvbi5yZXN1bHQucGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkuZmlsdGVyKGl0ZW0gPT4gaXRlbSAhPT0gdW5kZWZpbmVkKSwgW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0b29sTmFtZTogJ0Jhc2gnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0Jhc2gnLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LTEnIH0sXG5cdFx0XHRcdG1ldGE6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnQmFzaCcsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcXG4gIFwiY29tbWFuZFwiOiBcImVjaG8gY2xpZW50XCJcXG59Jyxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdCYXNoJyxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcmVncm91bmQgc3ViYWdlbnQgY29tcGxldGlvbjogdG9vbF9yZXN1bHQgZm9yIGEgVGFzayBzcGF3biBlbWl0cyBDaGF0VG9vbENhbGxDb21wbGV0ZSBBTkQgSUFnZW50U3ViYWdlbnRDb21wbGV0ZWRTaWduYWwsIHRoZW4gY2xlYXJzIHRoZSBzcGF3biBmcm9tIHRoZSByZWdpc3RyeScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gcigpO1xuXHRcdGNvbnN0IFBBUkVOVCA9ICd0b29sdV9mZ190YXNrJztcblxuXHRcdG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDAsIFBBUkVOVCwgJ1Rhc2snKSksXG5cdFx0XHRTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZWdpc3RyeSxcblx0XHQpO1xuXG5cdFx0Y29uc3Qgc2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdE1lc3NhZ2UoU0VTU0lPTl9JRCwgUEFSRU5ULCAnZG9uZScpLFxuXHRcdFx0U0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVnaXN0cnksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0a2luZHM6IHNpZ25hbHMubWFwKHMgPT4gcy5raW5kKSxcblx0XHRcdGNvbXBsZXRlZFRvb2xDYWxsSWQ6IHNpZ25hbHMuZmluZChzID0+IHMua2luZCA9PT0gJ3N1YmFnZW50X2NvbXBsZXRlZCcpPy50b29sQ2FsbElkLFxuXHRcdFx0c3Bhd25DbGVhcmVkOiByZWdpc3RyeS5nZXRTcGF3bihQQVJFTlQpLFxuXHRcdH0sIHtcblx0XHRcdGtpbmRzOiBbJ2FjdGlvbicsICdzdWJhZ2VudF9jb21wbGV0ZWQnXSxcblx0XHRcdGNvbXBsZXRlZFRvb2xDYWxsSWQ6IFBBUkVOVCxcblx0XHRcdHNwYXduQ2xlYXJlZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdiYWNrZ3JvdW5kIHN1YmFnZW50IGNvbXBsZXRpb246IHRhc2tfc3RhcnRlZCB0aGVuIHRvb2xfcmVzdWx0IHlpZWxkcyBOTyBjb21wbGV0aW9uOyBsYXRlciB0YXNrX25vdGlmaWNhdGlvbiBmaXJlcyBpdCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gcigpO1xuXHRcdGNvbnN0IFBBUkVOVCA9ICd0b29sdV9iZ190YXNrJztcblxuXHRcdG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDAsIFBBUkVOVCwgJ1Rhc2snKSksXG5cdFx0XHRTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZWdpc3RyeSxcblx0XHQpO1xuXG5cdFx0bWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0eyB0eXBlOiAnc3lzdGVtJywgc3VidHlwZTogJ3Rhc2tfc3RhcnRlZCcsIHRhc2tfaWQ6ICd0MScsIHRvb2xfdXNlX2lkOiBQQVJFTlQsIGRlc2NyaXB0aW9uOiAnYmcnIH0gYXMgdW5rbm93biBhcyBTREtNZXNzYWdlLFxuXHRcdFx0U0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVnaXN0cnksXG5cdFx0KTtcblxuXHRcdGNvbnN0IGFmdGVyVG9vbFJlc3VsdCA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdE1lc3NhZ2UoU0VTU0lPTl9JRCwgUEFSRU5ULCAndG9vbCByZXR1cm5lZCcpLFxuXHRcdFx0U0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVnaXN0cnksXG5cdFx0KTtcblx0XHRjb25zdCBpc0JhY2tncm91bmRBZnRlclRvb2xSZXN1bHQgPSByZWdpc3RyeS5nZXRTcGF3bihQQVJFTlQpPy5iYWNrZ3JvdW5kO1xuXG5cdFx0Y29uc3QgYWZ0ZXJOb3RpZmljYXRpb24gPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHR7IHR5cGU6ICdzeXN0ZW0nLCBzdWJ0eXBlOiAndGFza19ub3RpZmljYXRpb24nLCB0YXNrX2lkOiAndDEnLCB0b29sX3VzZV9pZDogUEFSRU5ULCBzdGF0dXM6ICdjb21wbGV0ZWQnLCBvdXRwdXRfZmlsZTogJ28nLCBzdW1tYXJ5OiAncycgfSBhcyB1bmtub3duIGFzIFNES01lc3NhZ2UsXG5cdFx0XHRTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZWdpc3RyeSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgYWZ0ZXJOb3RpZmljYXRpb25BZ2FpbiA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdHsgdHlwZTogJ3N5c3RlbScsIHN1YnR5cGU6ICd0YXNrX25vdGlmaWNhdGlvbicsIHRhc2tfaWQ6ICd0MScsIHRvb2xfdXNlX2lkOiBQQVJFTlQsIHN0YXR1czogJ2NvbXBsZXRlZCcsIG91dHB1dF9maWxlOiAnbycsIHN1bW1hcnk6ICdzJyB9IGFzIHVua25vd24gYXMgU0RLTWVzc2FnZSxcblx0XHRcdFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlZ2lzdHJ5LFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFmdGVyVG9vbFJlc3VsdEtpbmRzOiBhZnRlclRvb2xSZXN1bHQubWFwKHMgPT4gcy5raW5kKSxcblx0XHRcdGlzQmFja2dyb3VuZEFmdGVyVG9vbFJlc3VsdCxcblx0XHRcdGFmdGVyTm90aWZpY2F0aW9uS2luZHM6IGFmdGVyTm90aWZpY2F0aW9uLm1hcChzID0+IHMua2luZCksXG5cdFx0XHRjb21wbGV0ZWRUb29sQ2FsbElkOiBhZnRlck5vdGlmaWNhdGlvbi5maW5kKHMgPT4gcy5raW5kID09PSAnc3ViYWdlbnRfY29tcGxldGVkJyk/LnRvb2xDYWxsSWQsXG5cdFx0XHRhZnRlck5vdGlmaWNhdGlvbkFnYWluS2luZHM6IGFmdGVyTm90aWZpY2F0aW9uQWdhaW4ubWFwKHMgPT4gcy5raW5kKSxcblx0XHRcdHNwYXduQ2xlYXJlZEFmdGVyTm90aWZpY2F0aW9uOiByZWdpc3RyeS5nZXRTcGF3bihQQVJFTlQpLFxuXHRcdH0sIHtcblx0XHRcdGFmdGVyVG9vbFJlc3VsdEtpbmRzOiBbJ2FjdGlvbiddLFxuXHRcdFx0aXNCYWNrZ3JvdW5kQWZ0ZXJUb29sUmVzdWx0OiB0cnVlLFxuXHRcdFx0YWZ0ZXJOb3RpZmljYXRpb25LaW5kczogWydzdWJhZ2VudF9jb21wbGV0ZWQnXSxcblx0XHRcdGNvbXBsZXRlZFRvb2xDYWxsSWQ6IFBBUkVOVCxcblx0XHRcdGFmdGVyTm90aWZpY2F0aW9uQWdhaW5LaW5kczogW10sXG5cdFx0XHRzcGF3bkNsZWFyZWRBZnRlck5vdGlmaWNhdGlvbjogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjcmVnaW9uIGZvY3VzZWQgY29udHJhY3QgdGVzdHMgb24gdGhlIGV4dHJhY3RlZCBleHBvcnRzXG5cblx0dGVzdCgnYnVpbGRUb3BMZXZlbFN1YmFnZW50UmVhZHlBY3Rpb24gb21pdHMgX21ldGEgZGVzY3JpcHRpb24vYWdlbnROYW1lIHdoZW4gaW5wdXQgZmllbGRzIGFyZSBtaXNzaW5nIG9yIHdyb25nLXR5cGVkOyBzdGlsbCByZWNvcmRzIHRoZSBzcGF3bicsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IHIoKTtcblx0XHRjb25zdCBtYWxmb3JtZWQgPSBidWlsZFRvcExldmVsU3ViYWdlbnRSZWFkeUFjdGlvbihcblx0XHRcdHsgdHlwZTogJ3Rvb2xfdXNlJywgaWQ6ICd0b29sdV9iYWQnLCBuYW1lOiAnVGFzaycsIGlucHV0OiB7IGRlc2NyaXB0aW9uOiA0Miwgc3ViYWdlbnRfdHlwZTogbnVsbCB9IGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHRUVVJOX0lELFxuXHRcdFx0cmVnaXN0cnksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5vayhtYWxmb3JtZWQua2luZCA9PT0gJ2FjdGlvbicgJiYgbWFsZm9ybWVkLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5KTtcblx0XHRjb25zdCBzcGF3biA9IHJlZ2lzdHJ5LmdldFNwYXduKCd0b29sdV9iYWQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1ldGE6IG1hbGZvcm1lZC5hY3Rpb24uX21ldGEsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbWFsZm9ybWVkLmFjdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdHNwYXduUmVjb3JkZWQ6IHNwYXduPy50b29sVXNlSWQsXG5cdFx0XHRzcGF3blN1YmFnZW50VHlwZTogc3Bhd24/LnN1YmFnZW50VHlwZSxcblx0XHRcdHNwYXduRGVzY3JpcHRpb246IHNwYXduPy5kZXNjcmlwdGlvbixcblx0XHR9LCB7XG5cdFx0XHRtZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnIH0sXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBzdWJhZ2VudCB0YXNrJyxcblx0XHRcdHNwYXduUmVjb3JkZWQ6ICd0b29sdV9iYWQnLFxuXHRcdFx0c3Bhd25TdWJhZ2VudFR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdHNwYXduRGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWFwU3ViYWdlbnRTeXN0ZW1NZXNzYWdlIGlnbm9yZXMgdGFza19ub3RpZmljYXRpb24gd2l0aCBub24tdGVybWluYWwgc3RhdHVzLCBtaXNzaW5nIHRvb2xfdXNlX2lkLCBvciB1bmtub3duIHNwYXduJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gcigpO1xuXHRcdHJlZ2lzdHJ5LnJlY29yZFNwYXduKCd0b29sdV9rbm93bicpO1xuXG5cdFx0Y29uc3QgaW5Qcm9ncmVzcyA9IG1hcFN1YmFnZW50U3lzdGVtTWVzc2FnZSh7IHR5cGU6ICdzeXN0ZW0nLCBzdWJ0eXBlOiAndGFza19ub3RpZmljYXRpb24nLCB0YXNrX2lkOiAndCcsIHRvb2xfdXNlX2lkOiAndG9vbHVfa25vd24nLCBzdGF0dXM6ICdpbl9wcm9ncmVzcycgfSBhcyB1bmtub3duIGFzIFNES01lc3NhZ2UgJiB7IHR5cGU6ICdzeXN0ZW0nIH0sIFNFU1NJT04sIHJlZ2lzdHJ5KTtcblx0XHRjb25zdCBtaXNzaW5nSWQgPSBtYXBTdWJhZ2VudFN5c3RlbU1lc3NhZ2UoeyB0eXBlOiAnc3lzdGVtJywgc3VidHlwZTogJ3Rhc2tfbm90aWZpY2F0aW9uJywgdGFza19pZDogJ3QnLCBzdGF0dXM6ICdjb21wbGV0ZWQnIH0gYXMgdW5rbm93biBhcyBTREtNZXNzYWdlICYgeyB0eXBlOiAnc3lzdGVtJyB9LCBTRVNTSU9OLCByZWdpc3RyeSk7XG5cdFx0Y29uc3QgdW5rbm93bkVudHJ5ID0gbWFwU3ViYWdlbnRTeXN0ZW1NZXNzYWdlKHsgdHlwZTogJ3N5c3RlbScsIHN1YnR5cGU6ICd0YXNrX25vdGlmaWNhdGlvbicsIHRhc2tfaWQ6ICd0JywgdG9vbF91c2VfaWQ6ICd0b29sdV91bmtub3duJywgc3RhdHVzOiAnY29tcGxldGVkJyB9IGFzIHVua25vd24gYXMgU0RLTWVzc2FnZSAmIHsgdHlwZTogJ3N5c3RlbScgfSwgU0VTU0lPTiwgcmVnaXN0cnkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpblByb2dyZXNzS2luZHM6IGluUHJvZ3Jlc3MubWFwKHMgPT4gcy5raW5kKSxcblx0XHRcdG1pc3NpbmdJZEtpbmRzOiBtaXNzaW5nSWQubWFwKHMgPT4gcy5raW5kKSxcblx0XHRcdHVua25vd25FbnRyeUtpbmRzOiB1bmtub3duRW50cnkubWFwKHMgPT4gcy5raW5kKSxcblx0XHR9LCB7XG5cdFx0XHRpblByb2dyZXNzS2luZHM6IFtdLFxuXHRcdFx0bWlzc2luZ0lkS2luZHM6IFtdLFxuXHRcdFx0dW5rbm93bkVudHJ5S2luZHM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw0QkFBNEIsK0JBQStCO0FBQ3BFLFNBQVMsbUJBQW1CLG1DQUFtQztBQUMvRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGtDQUFrQyxnQ0FBZ0M7QUFDM0U7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFXUCxNQUFNLGtEQUE2QyxNQUFNO0FBRXhELFFBQU0sY0FB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
