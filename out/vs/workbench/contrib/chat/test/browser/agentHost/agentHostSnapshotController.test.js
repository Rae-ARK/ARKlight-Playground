import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { AgentHostSnapshotController } from "../../../browser/agentSessions/agentHost/agentHostSnapshotController.js";
function makeToolCall(opts) {
  return {
    status: ToolCallStatus.Completed,
    toolCallId: opts.toolCallId,
    toolName: "codeEdit",
    displayName: "Edit File",
    invocationMessage: "Editing file",
    toolInput: JSON.stringify({ path: opts.filePath }),
    success: true,
    pastTenseMessage: "Edited file",
    confirmed: ToolCallConfirmationReason.NotNeeded,
    content: [{
      type: ToolResultContentType.FileEdit,
      before: {
        uri: URI.file(opts.filePath).toString(),
        content: { uri: opts.beforeURI }
      },
      after: {
        uri: URI.file(opts.filePath).toString(),
        content: { uri: opts.afterURI }
      },
      diff: {
        added: opts.added ?? 0,
        removed: opts.removed ?? 0
      }
    }]
  };
}
function makeMockFileService(contentMap) {
  return new class extends mock() {
    async readFile(uri) {
      const data = contentMap.get(uri.toString());
      if (data === void 0) {
        throw new Error(`Content not found: ${uri.toString()}`);
      }
      return { value: VSBuffer.fromString(data) };
    }
    async writeFile(uri, content) {
      contentMap.set(uri.toString(), content.toString());
      return {};
    }
    async del(uri) {
      contentMap.delete(uri.toString());
    }
    async move(source, target) {
      const data = contentMap.get(source.toString());
      if (data !== void 0) {
        contentMap.set(target.toString(), data);
        contentMap.delete(source.toString());
      }
      return {};
    }
  }();
}
function createController(store, contentMap) {
  const sessionResource = URI.from({ scheme: "agent-host-copilot", path: "/test-session" });
  const controller = new AgentHostSnapshotController(
    sessionResource,
    "local",
    new NullLogService(),
    makeMockFileService(contentMap)
  );
  store.add(controller);
  return controller;
}
suite("AgentHostSnapshotController", () => {
  const store = new DisposableStore();
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("initial state \u2014 empty checkpoints, no disablement, no undo", () => {
    const controller = createController(store, /* @__PURE__ */ new Map());
    assert.deepStrictEqual(controller.requestDisablement.get(), []);
    assert.strictEqual(controller.canUndo.get(), false);
    assert.strictEqual(controller.canRedo.get(), false);
    assert.deepStrictEqual(controller.entries.get(), []);
  });
  test("addToolCallEdits records snapshot data, enables undo", () => {
    const contentMap = /* @__PURE__ */ new Map();
    const controller = createController(store, contentMap);
    controller.addToolCallEdits("req-1", makeToolCall({
      toolCallId: "tc-1",
      filePath: "/file.ts",
      beforeURI: "agenthost-content:///snap/before",
      afterURI: "agenthost-content:///snap/after"
    }));
    assert.strictEqual(controller.canUndo.get(), true);
    assert.strictEqual(controller.canRedo.get(), false);
  });
  test("addToolCallEdits is idempotent on toolCallId", () => {
    const controller = createController(store, /* @__PURE__ */ new Map());
    const tc = makeToolCall({
      toolCallId: "tc-1",
      filePath: "/file.ts",
      beforeURI: "agenthost-content:///snap/before",
      afterURI: "agenthost-content:///snap/after"
    });
    controller.addToolCallEdits("req-1", tc);
    controller.addToolCallEdits("req-1", tc);
    assert.strictEqual(controller.canUndo.get(), true);
  });
  test("restoreSnapshot to a prior checkpoint writes before-content to disk", async () => {
    const before = URI.file("/snap/before-1").toString();
    const after = URI.file("/snap/after-1").toString();
    const file = URI.file("/file.ts").toString();
    const contentMap = /* @__PURE__ */ new Map([
      [before, "original"],
      [after, "modified"],
      [file, "modified"]
    ]);
    const controller = createController(store, contentMap);
    controller.addToolCallEdits("req-1", makeToolCall({
      toolCallId: "tc-1",
      filePath: "/file.ts",
      beforeURI: before,
      afterURI: after
    }));
    await controller.restoreSnapshot("req-1", void 0);
    assert.strictEqual(contentMap.get(file), "original");
  });
  test("requestDisablement reports requests after a checkpoint restore", async () => {
    const before1 = URI.file("/snap/before-1").toString();
    const after1 = URI.file("/snap/after-1").toString();
    const before2 = URI.file("/snap/before-2").toString();
    const after2 = URI.file("/snap/after-2").toString();
    const file = URI.file("/file.ts").toString();
    const controller = createController(store, /* @__PURE__ */ new Map([
      [before1, "a"],
      [after1, "b"],
      [before2, "b"],
      [after2, "c"],
      [file, "c"]
    ]));
    controller.addToolCallEdits("req-1", makeToolCall({
      toolCallId: "tc-1",
      filePath: "/file.ts",
      beforeURI: before1,
      afterURI: after1
    }));
    controller.addToolCallEdits("req-2", makeToolCall({
      toolCallId: "tc-2",
      filePath: "/file.ts",
      beforeURI: before2,
      afterURI: after2
    }));
    assert.deepStrictEqual(controller.requestDisablement.get(), []);
    await controller.restoreSnapshot("req-2", void 0);
    assert.deepStrictEqual(controller.requestDisablement.get().map((d) => d.requestId), ["req-2"]);
  });
  test("ensureRequestCheckpoint creates a checkpoint and is idempotent", () => {
    const controller = createController(store, /* @__PURE__ */ new Map());
    controller.ensureRequestCheckpoint("req-1");
    controller.ensureRequestCheckpoint("req-1");
    assert.strictEqual(controller.canUndo.get(), true);
    assert.strictEqual(controller.canRedo.get(), false);
  });
  test("ensureRequestCheckpoint does not mark the current request as disabled", () => {
    const controller = createController(store, /* @__PURE__ */ new Map());
    controller.ensureRequestCheckpoint("req-1");
    assert.deepStrictEqual(controller.requestDisablement.get(), []);
    controller.ensureRequestCheckpoint("req-2");
    assert.deepStrictEqual(controller.requestDisablement.get(), []);
  });
  test("restoreSnapshot of a no-edit request marks it disabled", async () => {
    const controller = createController(store, /* @__PURE__ */ new Map());
    controller.ensureRequestCheckpoint("req-1");
    controller.ensureRequestCheckpoint("req-2");
    await controller.restoreSnapshot("req-2", void 0);
    assert.deepStrictEqual(
      controller.requestDisablement.get().map((d) => d.requestId),
      ["req-2"]
    );
  });
  test("starting a new request after restore-to-start splices stale checkpoints", () => {
    const before = URI.file("/snap/before-1").toString();
    const after = URI.file("/snap/after-1").toString();
    const controller = createController(store, /* @__PURE__ */ new Map([
      [before, "a"],
      [after, "b"],
      [URI.file("/file.ts").toString(), "a"]
    ]));
    controller.addToolCallEdits("req-1", makeToolCall({
      toolCallId: "tc-1",
      filePath: "/file.ts",
      beforeURI: before,
      afterURI: after
    }));
    return controller.restoreSnapshot("req-1", void 0).then(() => {
      controller.ensureRequestCheckpoint("req-2");
      assert.deepStrictEqual(controller.requestDisablement.get(), []);
      assert.strictEqual(controller.canRedo.get(), false);
    });
  });
  test("multiple tool calls in one request share a checkpoint", async () => {
    const before1 = URI.file("/snap/before-1").toString();
    const after1 = URI.file("/snap/after-1").toString();
    const before2 = URI.file("/snap/before-2").toString();
    const after2 = URI.file("/snap/after-2").toString();
    const fileA = URI.file("/a.ts").toString();
    const fileB = URI.file("/b.ts").toString();
    const contentMap = /* @__PURE__ */ new Map([
      [before1, "a-original"],
      [after1, "a-modified"],
      [fileA, "a-modified"],
      [before2, "b-original"],
      [after2, "b-modified"],
      [fileB, "b-modified"]
    ]);
    const controller = createController(store, contentMap);
    controller.addToolCallEdits("req-1", makeToolCall({
      toolCallId: "tc-1",
      filePath: "/a.ts",
      beforeURI: before1,
      afterURI: after1
    }));
    controller.addToolCallEdits("req-1", makeToolCall({
      toolCallId: "tc-2",
      filePath: "/b.ts",
      beforeURI: before2,
      afterURI: after2
    }));
    await controller.restoreSnapshot("req-1", void 0);
    assert.strictEqual(contentMap.get(fileA), "a-original");
    assert.strictEqual(contentMap.get(fileB), "b-original");
  });
  test("multiple tool calls editing the same file collapse to one net edit", async () => {
    const beforeA = URI.file("/snap/before-a").toString();
    const afterA = URI.file("/snap/after-a").toString();
    const beforeB = URI.file("/snap/before-b").toString();
    const afterB = URI.file("/snap/after-b").toString();
    const file = URI.file("/file.ts").toString();
    const contentMap = /* @__PURE__ */ new Map([
      [beforeA, "v0"],
      [afterA, "v1"],
      [beforeB, "v1"],
      [afterB, "v2"],
      [file, "v2"]
    ]);
    const controller = createController(store, contentMap);
    controller.addToolCallEdits("req-1", makeToolCall({
      toolCallId: "tc-1",
      filePath: "/file.ts",
      beforeURI: beforeA,
      afterURI: afterA
    }));
    controller.addToolCallEdits("req-1", makeToolCall({
      toolCallId: "tc-2",
      filePath: "/file.ts",
      beforeURI: beforeB,
      afterURI: afterB
    }));
    await controller.restoreSnapshot("req-1", void 0);
    assert.strictEqual(contentMap.get(file), "v0");
  });
  test("hasEditsInRequest reflects added tool call edits", () => {
    const controller = createController(store, /* @__PURE__ */ new Map());
    controller.addToolCallEdits("req-1", makeToolCall({
      toolCallId: "tc-1",
      filePath: "/file.ts",
      beforeURI: "agenthost-content:///before",
      afterURI: "agenthost-content:///after"
    }));
    assert.strictEqual(controller.hasEditsInRequest("req-1"), true);
    assert.strictEqual(controller.hasEditsInRequest("req-2"), false);
  });
  test("non-completed tool calls are ignored", () => {
    const controller = createController(store, /* @__PURE__ */ new Map());
    controller.addToolCallEdits("req-1", {
      status: ToolCallStatus.Running,
      toolCallId: "tc-1",
      toolName: "codeEdit",
      displayName: "Edit File",
      invocationMessage: "Editing file",
      toolInput: "{}",
      confirmed: ToolCallConfirmationReason.NotNeeded,
      content: []
    });
    assert.strictEqual(controller.canUndo.get(), false);
  });
  test("undoInteraction steps back one checkpoint at a time", async () => {
    const beforeA = URI.file("/snap/before-a").toString();
    const afterA = URI.file("/snap/after-a").toString();
    const beforeB = URI.file("/snap/before-b").toString();
    const afterB = URI.file("/snap/after-b").toString();
    const fileA = URI.file("/a.ts").toString();
    const fileB = URI.file("/b.ts").toString();
    const contentMap = /* @__PURE__ */ new Map([
      [beforeA, "a0"],
      [afterA, "a1"],
      [fileA, "a1"],
      [beforeB, "b0"],
      [afterB, "b1"],
      [fileB, "b1"]
    ]);
    const controller = createController(store, contentMap);
    controller.addToolCallEdits("req-1", makeToolCall({ toolCallId: "tc-1", filePath: "/a.ts", beforeURI: beforeA, afterURI: afterA }));
    controller.addToolCallEdits("req-2", makeToolCall({ toolCallId: "tc-2", filePath: "/b.ts", beforeURI: beforeB, afterURI: afterB }));
    await controller.undoInteraction();
    assert.strictEqual(contentMap.get(fileA), "a1");
    assert.strictEqual(contentMap.get(fileB), "b0");
    assert.strictEqual(controller.canUndo.get(), true);
    assert.strictEqual(controller.canRedo.get(), true);
    await controller.undoInteraction();
    assert.strictEqual(contentMap.get(fileA), "a0");
    assert.strictEqual(controller.canUndo.get(), false);
    await controller.undoInteraction();
    assert.strictEqual(contentMap.get(fileA), "a0");
  });
  test("redoInteraction steps forward and stops at HEAD (no infinite loop)", async () => {
    const beforeA = URI.file("/snap/before-a").toString();
    const afterA = URI.file("/snap/after-a").toString();
    const beforeB = URI.file("/snap/before-b").toString();
    const afterB = URI.file("/snap/after-b").toString();
    const fileA = URI.file("/a.ts").toString();
    const fileB = URI.file("/b.ts").toString();
    const contentMap = /* @__PURE__ */ new Map([
      [beforeA, "a0"],
      [afterA, "a1"],
      [fileA, "a1"],
      [beforeB, "b0"],
      [afterB, "b1"],
      [fileB, "b1"]
    ]);
    const controller = createController(store, contentMap);
    controller.addToolCallEdits("req-1", makeToolCall({ toolCallId: "tc-1", filePath: "/a.ts", beforeURI: beforeA, afterURI: afterA }));
    controller.addToolCallEdits("req-2", makeToolCall({ toolCallId: "tc-2", filePath: "/b.ts", beforeURI: beforeB, afterURI: afterB }));
    await controller.restoreSnapshot("req-1", void 0);
    assert.strictEqual(contentMap.get(fileA), "a0");
    assert.strictEqual(contentMap.get(fileB), "b0");
    assert.strictEqual(controller.canRedo.get(), true);
    let guard = 0;
    while (controller.canRedo.get()) {
      await controller.redoInteraction();
      assert.ok(++guard <= 10, "redoInteraction failed to advance the checkpoint cursor");
    }
    assert.strictEqual(contentMap.get(fileA), "a1");
    assert.strictEqual(contentMap.get(fileB), "b1");
    assert.strictEqual(controller.canRedo.get(), false);
    assert.strictEqual(controller.canUndo.get(), true);
  });
  test("streaming-edits APIs throw \u2014 agent host owns edits server-side", () => {
    const controller = createController(store, /* @__PURE__ */ new Map());
    const fakeResponseModel = {};
    assert.throws(() => controller.startStreamingEdits(URI.file("/x"), fakeResponseModel, void 0));
    assert.throws(() => controller.applyWorkspaceEdit({ kind: "workspaceEdit", edits: [] }, fakeResponseModel, "stop"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50SG9zdC9hZ2VudEhvc3RTbmFwc2hvdENvbnRyb2xsZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbFN0YXR1cywgVG9vbFJlc3VsdENvbnRlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFRvb2xDYWxsQ29tcGxldGVkU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJRmlsZUNvbnRlbnQsIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElDaGF0UmVzcG9uc2VNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U25hcHNob3RDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RTbmFwc2hvdENvbnRyb2xsZXIuanMnO1xuXG5mdW5jdGlvbiBtYWtlVG9vbENhbGwob3B0czoge1xuXHR0b29sQ2FsbElkOiBzdHJpbmc7XG5cdGZpbGVQYXRoOiBzdHJpbmc7XG5cdGJlZm9yZVVSSTogc3RyaW5nO1xuXHRhZnRlclVSSTogc3RyaW5nO1xuXHRhZGRlZD86IG51bWJlcjtcblx0cmVtb3ZlZD86IG51bWJlcjtcbn0pOiBUb29sQ2FsbENvbXBsZXRlZFN0YXRlIHtcblx0cmV0dXJuIHtcblx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHR0b29sQ2FsbElkOiBvcHRzLnRvb2xDYWxsSWQsXG5cdFx0dG9vbE5hbWU6ICdjb2RlRWRpdCcsXG5cdFx0ZGlzcGxheU5hbWU6ICdFZGl0IEZpbGUnLFxuXHRcdGludm9jYXRpb25NZXNzYWdlOiAnRWRpdGluZyBmaWxlJyxcblx0XHR0b29sSW5wdXQ6IEpTT04uc3RyaW5naWZ5KHsgcGF0aDogb3B0cy5maWxlUGF0aCB9KSxcblx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdFZGl0ZWQgZmlsZScsXG5cdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0Y29udGVudDogW3tcblx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCxcblx0XHRcdGJlZm9yZToge1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKG9wdHMuZmlsZVBhdGgpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGNvbnRlbnQ6IHsgdXJpOiBvcHRzLmJlZm9yZVVSSSB9LFxuXHRcdFx0fSxcblx0XHRcdGFmdGVyOiB7XG5cdFx0XHRcdHVyaTogVVJJLmZpbGUob3B0cy5maWxlUGF0aCkudG9TdHJpbmcoKSxcblx0XHRcdFx0Y29udGVudDogeyB1cmk6IG9wdHMuYWZ0ZXJVUkkgfSxcblx0XHRcdH0sXG5cdFx0XHRkaWZmOiB7XG5cdFx0XHRcdGFkZGVkOiBvcHRzLmFkZGVkID8/IDAsXG5cdFx0XHRcdHJlbW92ZWQ6IG9wdHMucmVtb3ZlZCA/PyAwLFxuXHRcdFx0fSxcblx0XHR9XSxcblx0fTtcbn1cblxuZnVuY3Rpb24gbWFrZU1vY2tGaWxlU2VydmljZShjb250ZW50TWFwOiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogSUZpbGVTZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBhc3luYyByZWFkRmlsZSh1cmk6IFVSSSkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IGNvbnRlbnRNYXAuZ2V0KHVyaS50b1N0cmluZygpKTtcblx0XHRcdGlmIChkYXRhID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDb250ZW50IG5vdCBmb3VuZDogJHt1cmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHZhbHVlOiBWU0J1ZmZlci5mcm9tU3RyaW5nKGRhdGEpIH0gYXMgSUZpbGVDb250ZW50O1xuXHRcdH1cblx0XHRvdmVycmlkZSBhc3luYyB3cml0ZUZpbGUodXJpOiBVUkksIGNvbnRlbnQ6IFZTQnVmZmVyKTogUHJvbWlzZTxhbnk+IHtcblx0XHRcdGNvbnRlbnRNYXAuc2V0KHVyaS50b1N0cmluZygpLCBjb250ZW50LnRvU3RyaW5nKCkpO1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblx0XHRvdmVycmlkZSBhc3luYyBkZWwodXJpOiBVUkkpIHtcblx0XHRcdGNvbnRlbnRNYXAuZGVsZXRlKHVyaS50b1N0cmluZygpKTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgbW92ZShzb3VyY2U6IFVSSSwgdGFyZ2V0OiBVUkkpOiBQcm9taXNlPGFueT4ge1xuXHRcdFx0Y29uc3QgZGF0YSA9IGNvbnRlbnRNYXAuZ2V0KHNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGlmIChkYXRhICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29udGVudE1hcC5zZXQodGFyZ2V0LnRvU3RyaW5nKCksIGRhdGEpO1xuXHRcdFx0XHRjb250ZW50TWFwLmRlbGV0ZShzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVDb250cm9sbGVyKHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsIGNvbnRlbnRNYXA6IE1hcDxzdHJpbmcsIHN0cmluZz4pOiBBZ2VudEhvc3RTbmFwc2hvdENvbnRyb2xsZXIge1xuXHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50LWhvc3QtY29waWxvdCcsIHBhdGg6ICcvdGVzdC1zZXNzaW9uJyB9KTtcblx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBBZ2VudEhvc3RTbmFwc2hvdENvbnRyb2xsZXIoXG5cdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdCdsb2NhbCcsXG5cdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0bWFrZU1vY2tGaWxlU2VydmljZShjb250ZW50TWFwKSxcblx0KTtcblx0c3RvcmUuYWRkKGNvbnRyb2xsZXIpO1xuXHRyZXR1cm4gY29udHJvbGxlcjtcbn1cblxuc3VpdGUoJ0FnZW50SG9zdFNuYXBzaG90Q29udHJvbGxlcicsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHR0ZWFyZG93bigoKSA9PiBzdG9yZS5jbGVhcigpKTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdpbml0aWFsIHN0YXRlIFx1MjAxNCBlbXB0eSBjaGVja3BvaW50cywgbm8gZGlzYWJsZW1lbnQsIG5vIHVuZG8nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoc3RvcmUsIG5ldyBNYXAoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250cm9sbGVyLnJlcXVlc3REaXNhYmxlbWVudC5nZXQoKSwgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLmNhblVuZG8uZ2V0KCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5jYW5SZWRvLmdldCgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250cm9sbGVyLmVudHJpZXMuZ2V0KCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkVG9vbENhbGxFZGl0cyByZWNvcmRzIHNuYXBzaG90IGRhdGEsIGVuYWJsZXMgdW5kbycsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50TWFwID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihzdG9yZSwgY29udGVudE1hcCk7XG5cdFx0Y29udHJvbGxlci5hZGRUb29sQ2FsbEVkaXRzKCdyZXEtMScsIG1ha2VUb29sQ2FsbCh7XG5cdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRmaWxlUGF0aDogJy9maWxlLnRzJyxcblx0XHRcdGJlZm9yZVVSSTogJ2FnZW50aG9zdC1jb250ZW50Oi8vL3NuYXAvYmVmb3JlJyxcblx0XHRcdGFmdGVyVVJJOiAnYWdlbnRob3N0LWNvbnRlbnQ6Ly8vc25hcC9hZnRlcicsXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLmNhblVuZG8uZ2V0KCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLmNhblJlZG8uZ2V0KCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkVG9vbENhbGxFZGl0cyBpcyBpZGVtcG90ZW50IG9uIHRvb2xDYWxsSWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoc3RvcmUsIG5ldyBNYXAoKSk7XG5cdFx0Y29uc3QgdGMgPSBtYWtlVG9vbENhbGwoe1xuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0ZmlsZVBhdGg6ICcvZmlsZS50cycsXG5cdFx0XHRiZWZvcmVVUkk6ICdhZ2VudGhvc3QtY29udGVudDovLy9zbmFwL2JlZm9yZScsXG5cdFx0XHRhZnRlclVSSTogJ2FnZW50aG9zdC1jb250ZW50Oi8vL3NuYXAvYWZ0ZXInLFxuXHRcdH0pO1xuXHRcdGNvbnRyb2xsZXIuYWRkVG9vbENhbGxFZGl0cygncmVxLTEnLCB0Yyk7XG5cdFx0Y29udHJvbGxlci5hZGRUb29sQ2FsbEVkaXRzKCdyZXEtMScsIHRjKTtcblx0XHQvLyBSZXN0b3JlIHRvIGJlZm9yZSB0aGUgcmVxdWVzdCBcdTIwMTQgb25seSBvbmUgdW5kbyBleHBlY3RlZC5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5jYW5VbmRvLmdldCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZVNuYXBzaG90IHRvIGEgcHJpb3IgY2hlY2twb2ludCB3cml0ZXMgYmVmb3JlLWNvbnRlbnQgdG8gZGlzaycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiZWZvcmUgPSBVUkkuZmlsZSgnL3NuYXAvYmVmb3JlLTEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGFmdGVyID0gVVJJLmZpbGUoJy9zbmFwL2FmdGVyLTEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGZpbGUgPSBVUkkuZmlsZSgnL2ZpbGUudHMnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGNvbnRlbnRNYXAgPSBuZXcgTWFwKFtcblx0XHRcdFtiZWZvcmUsICdvcmlnaW5hbCddLFxuXHRcdFx0W2FmdGVyLCAnbW9kaWZpZWQnXSxcblx0XHRcdFtmaWxlLCAnbW9kaWZpZWQnXSxcblx0XHRdKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihzdG9yZSwgY29udGVudE1hcCk7XG5cdFx0Y29udHJvbGxlci5hZGRUb29sQ2FsbEVkaXRzKCdyZXEtMScsIG1ha2VUb29sQ2FsbCh7XG5cdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRmaWxlUGF0aDogJy9maWxlLnRzJyxcblx0XHRcdGJlZm9yZVVSSTogYmVmb3JlLFxuXHRcdFx0YWZ0ZXJVUkk6IGFmdGVyLFxuXHRcdH0pKTtcblx0XHQvLyBSZXN0b3JlIGJlZm9yZSB0aGUgcmVxdWVzdCBcdTIxOTIgd3JhcHMgYmFjayB0byB0aGUgb3JpZ2luYWwgY29udGVudC5cblx0XHRhd2FpdCBjb250cm9sbGVyLnJlc3RvcmVTbmFwc2hvdCgncmVxLTEnLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50TWFwLmdldChmaWxlKSwgJ29yaWdpbmFsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVlc3REaXNhYmxlbWVudCByZXBvcnRzIHJlcXVlc3RzIGFmdGVyIGEgY2hlY2twb2ludCByZXN0b3JlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJlZm9yZTEgPSBVUkkuZmlsZSgnL3NuYXAvYmVmb3JlLTEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGFmdGVyMSA9IFVSSS5maWxlKCcvc25hcC9hZnRlci0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBiZWZvcmUyID0gVVJJLmZpbGUoJy9zbmFwL2JlZm9yZS0yJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBhZnRlcjIgPSBVUkkuZmlsZSgnL3NuYXAvYWZ0ZXItMicpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZmlsZSA9IFVSSS5maWxlKCcvZmlsZS50cycpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoc3RvcmUsIG5ldyBNYXAoW1xuXHRcdFx0W2JlZm9yZTEsICdhJ10sXG5cdFx0XHRbYWZ0ZXIxLCAnYiddLFxuXHRcdFx0W2JlZm9yZTIsICdiJ10sXG5cdFx0XHRbYWZ0ZXIyLCAnYyddLFxuXHRcdFx0W2ZpbGUsICdjJ10sXG5cdFx0XSkpO1xuXHRcdGNvbnRyb2xsZXIuYWRkVG9vbENhbGxFZGl0cygncmVxLTEnLCBtYWtlVG9vbENhbGwoe1xuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLCBmaWxlUGF0aDogJy9maWxlLnRzJyxcblx0XHRcdGJlZm9yZVVSSTogYmVmb3JlMSwgYWZ0ZXJVUkk6IGFmdGVyMSxcblx0XHR9KSk7XG5cdFx0Y29udHJvbGxlci5hZGRUb29sQ2FsbEVkaXRzKCdyZXEtMicsIG1ha2VUb29sQ2FsbCh7XG5cdFx0XHR0b29sQ2FsbElkOiAndGMtMicsIGZpbGVQYXRoOiAnL2ZpbGUudHMnLFxuXHRcdFx0YmVmb3JlVVJJOiBiZWZvcmUyLCBhZnRlclVSSTogYWZ0ZXIyLFxuXHRcdH0pKTtcblx0XHQvLyBBdCBIRUFEIG5vdGhpbmcgaXMgZGlzYWJsZWRcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRyb2xsZXIucmVxdWVzdERpc2FibGVtZW50LmdldCgpLCBbXSk7XG5cblx0XHQvLyBSZXN0b3JlIGJlZm9yZSByZXEtMiBcdTIxOTIgcmVxLTIgYmVjb21lcyBkaXNhYmxlZFxuXHRcdGF3YWl0IGNvbnRyb2xsZXIucmVzdG9yZVNuYXBzaG90KCdyZXEtMicsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250cm9sbGVyLnJlcXVlc3REaXNhYmxlbWVudC5nZXQoKS5tYXAoZCA9PiBkLnJlcXVlc3RJZCksIFsncmVxLTInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Vuc3VyZVJlcXVlc3RDaGVja3BvaW50IGNyZWF0ZXMgYSBjaGVja3BvaW50IGFuZCBpcyBpZGVtcG90ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHN0b3JlLCBuZXcgTWFwKCkpO1xuXHRcdGNvbnRyb2xsZXIuZW5zdXJlUmVxdWVzdENoZWNrcG9pbnQoJ3JlcS0xJyk7XG5cdFx0Y29udHJvbGxlci5lbnN1cmVSZXF1ZXN0Q2hlY2twb2ludCgncmVxLTEnKTtcblx0XHQvLyBVbmRvIGlzIHJlcXVlc3QtbGV2ZWw6IGEgY2hlY2twb2ludCBleGlzdHMsIHNvIHdlIGNhbiB1bmRvIGl0XG5cdFx0Ly8gKGV2ZW4gdGhvdWdoIHRoZSByZXF1ZXN0IHByb2R1Y2VkIG5vIGVkaXRzKS5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5jYW5VbmRvLmdldCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5jYW5SZWRvLmdldCgpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Vuc3VyZVJlcXVlc3RDaGVja3BvaW50IGRvZXMgbm90IG1hcmsgdGhlIGN1cnJlbnQgcmVxdWVzdCBhcyBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihzdG9yZSwgbmV3IE1hcCgpKTtcblx0XHQvLyBTaW11bGF0ZXMgdGhlIHN0YXJ0LW9mLXR1cm4gcGF0aCBpbiB0aGUgc2Vzc2lvbiBoYW5kbGVyOiB0aGVcblx0XHQvLyBjaGVja3BvaW50IGZvciB0aGUgaW4tZmxpZ2h0IHJlcXVlc3QgbXVzdCBub3QgYXBwZWFyIGluXG5cdFx0Ly8gcmVxdWVzdERpc2FibGVtZW50IChvdGhlcndpc2UgdGhlIGNoYXQgVUkgaGlkZXMgdGhlIGxpdmUgdHVybikuXG5cdFx0Y29udHJvbGxlci5lbnN1cmVSZXF1ZXN0Q2hlY2twb2ludCgncmVxLTEnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRyb2xsZXIucmVxdWVzdERpc2FibGVtZW50LmdldCgpLCBbXSk7XG5cdFx0Y29udHJvbGxlci5lbnN1cmVSZXF1ZXN0Q2hlY2twb2ludCgncmVxLTInKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRyb2xsZXIucmVxdWVzdERpc2FibGVtZW50LmdldCgpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVTbmFwc2hvdCBvZiBhIG5vLWVkaXQgcmVxdWVzdCBtYXJrcyBpdCBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihzdG9yZSwgbmV3IE1hcCgpKTtcblx0XHQvLyBUd28gcmVxdWVzdHMsIG5laXRoZXIgcHJvZHVjZWQgZmlsZSBlZGl0cyBcdTIwMTQgbWlycm9ycyBhIHNlc3Npb25cblx0XHQvLyBoeWRyYXRlZCBmcm9tIGhpc3Rvcnkgd2hlcmUgaW50ZXJtZWRpYXRlIHR1cm5zIGhhZCBubyB0b29sIGNhbGxzLlxuXHRcdGNvbnRyb2xsZXIuZW5zdXJlUmVxdWVzdENoZWNrcG9pbnQoJ3JlcS0xJyk7XG5cdFx0Y29udHJvbGxlci5lbnN1cmVSZXF1ZXN0Q2hlY2twb2ludCgncmVxLTInKTtcblx0XHRhd2FpdCBjb250cm9sbGVyLnJlc3RvcmVTbmFwc2hvdCgncmVxLTInLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRjb250cm9sbGVyLnJlcXVlc3REaXNhYmxlbWVudC5nZXQoKS5tYXAoZCA9PiBkLnJlcXVlc3RJZCksXG5cdFx0XHRbJ3JlcS0yJ10sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3RhcnRpbmcgYSBuZXcgcmVxdWVzdCBhZnRlciByZXN0b3JlLXRvLXN0YXJ0IHNwbGljZXMgc3RhbGUgY2hlY2twb2ludHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmVmb3JlID0gVVJJLmZpbGUoJy9zbmFwL2JlZm9yZS0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBhZnRlciA9IFVSSS5maWxlKCcvc25hcC9hZnRlci0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihzdG9yZSwgbmV3IE1hcChbXG5cdFx0XHRbYmVmb3JlLCAnYSddLCBbYWZ0ZXIsICdiJ10sIFtVUkkuZmlsZSgnL2ZpbGUudHMnKS50b1N0cmluZygpLCAnYSddLFxuXHRcdF0pKTtcblx0XHRjb250cm9sbGVyLmFkZFRvb2xDYWxsRWRpdHMoJ3JlcS0xJywgbWFrZVRvb2xDYWxsKHtcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJywgZmlsZVBhdGg6ICcvZmlsZS50cycsXG5cdFx0XHRiZWZvcmVVUkk6IGJlZm9yZSwgYWZ0ZXJVUkk6IGFmdGVyLFxuXHRcdH0pKTtcblx0XHRyZXR1cm4gY29udHJvbGxlci5yZXN0b3JlU25hcHNob3QoJ3JlcS0xJywgdW5kZWZpbmVkKS50aGVuKCgpID0+IHtcblx0XHRcdC8vIEFmdGVyIHJlc3RvcmluZyBiZWZvcmUgcmVxLTEsIHRoZSB1c2VyIHNlbmRzIGEgbmV3IHJlcXVlc3QuXG5cdFx0XHQvLyBUaGUgc3RhbGUgZm9yd2FyZCBicmFuY2ggbXVzdCBiZSBzcGxpY2VkIG9yIHRoZSBuZXcgY2hlY2twb2ludFxuXHRcdFx0Ly8gd291bGQgY29leGlzdCB3aXRoIHRoZSBkaXNjYXJkZWQgb25lLlxuXHRcdFx0Y29udHJvbGxlci5lbnN1cmVSZXF1ZXN0Q2hlY2twb2ludCgncmVxLTInKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udHJvbGxlci5yZXF1ZXN0RGlzYWJsZW1lbnQuZ2V0KCksIFtdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLmNhblJlZG8uZ2V0KCksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgdG9vbCBjYWxscyBpbiBvbmUgcmVxdWVzdCBzaGFyZSBhIGNoZWNrcG9pbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmVmb3JlMSA9IFVSSS5maWxlKCcvc25hcC9iZWZvcmUtMScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgYWZ0ZXIxID0gVVJJLmZpbGUoJy9zbmFwL2FmdGVyLTEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGJlZm9yZTIgPSBVUkkuZmlsZSgnL3NuYXAvYmVmb3JlLTInKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGFmdGVyMiA9IFVSSS5maWxlKCcvc25hcC9hZnRlci0yJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBmaWxlQSA9IFVSSS5maWxlKCcvYS50cycpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZmlsZUIgPSBVUkkuZmlsZSgnL2IudHMnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGNvbnRlbnRNYXAgPSBuZXcgTWFwKFtcblx0XHRcdFtiZWZvcmUxLCAnYS1vcmlnaW5hbCddLCBbYWZ0ZXIxLCAnYS1tb2RpZmllZCddLCBbZmlsZUEsICdhLW1vZGlmaWVkJ10sXG5cdFx0XHRbYmVmb3JlMiwgJ2Itb3JpZ2luYWwnXSwgW2FmdGVyMiwgJ2ItbW9kaWZpZWQnXSwgW2ZpbGVCLCAnYi1tb2RpZmllZCddLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHN0b3JlLCBjb250ZW50TWFwKTtcblx0XHRjb250cm9sbGVyLmFkZFRvb2xDYWxsRWRpdHMoJ3JlcS0xJywgbWFrZVRvb2xDYWxsKHtcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJywgZmlsZVBhdGg6ICcvYS50cycsXG5cdFx0XHRiZWZvcmVVUkk6IGJlZm9yZTEsIGFmdGVyVVJJOiBhZnRlcjEsXG5cdFx0fSkpO1xuXHRcdGNvbnRyb2xsZXIuYWRkVG9vbENhbGxFZGl0cygncmVxLTEnLCBtYWtlVG9vbENhbGwoe1xuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTInLCBmaWxlUGF0aDogJy9iLnRzJyxcblx0XHRcdGJlZm9yZVVSSTogYmVmb3JlMiwgYWZ0ZXJVUkk6IGFmdGVyMixcblx0XHR9KSk7XG5cdFx0Ly8gUmVzdG9yaW5nIGJlZm9yZSByZXEtMSB1bmRvZXMgQk9USCB0b29sIGNhbGxzJyBlZGl0cy5cblx0XHRhd2FpdCBjb250cm9sbGVyLnJlc3RvcmVTbmFwc2hvdCgncmVxLTEnLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50TWFwLmdldChmaWxlQSksICdhLW9yaWdpbmFsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRNYXAuZ2V0KGZpbGVCKSwgJ2Itb3JpZ2luYWwnKTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgdG9vbCBjYWxscyBlZGl0aW5nIHRoZSBzYW1lIGZpbGUgY29sbGFwc2UgdG8gb25lIG5ldCBlZGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFR3byBzZXF1ZW50aWFsIGVkaXRzIHRvIC9maWxlLnRzIHdpdGhpbiB0aGUgc2FtZSByZXF1ZXN0OiB0aGVcblx0XHQvLyBzZWNvbmQgZWRpdCdzIGFmdGVyLWNvbnRlbnQgbXVzdCB3aW4gb24gcmVkbywgYW5kIHRoZSBmaXJzdFxuXHRcdC8vIGVkaXQncyBiZWZvcmUtY29udGVudCBtdXN0IHdpbiBvbiB1bmRvLiBXaXRob3V0IG1lcmdpbmcsIHRoZVxuXHRcdC8vIHR3byBlZGl0cyB3b3VsZCByYWNlIHdoZW4gYXBwbGllZCBpbiBwYXJhbGxlbC5cblx0XHRjb25zdCBiZWZvcmVBID0gVVJJLmZpbGUoJy9zbmFwL2JlZm9yZS1hJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBhZnRlckEgPSBVUkkuZmlsZSgnL3NuYXAvYWZ0ZXItYScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgYmVmb3JlQiA9IFVSSS5maWxlKCcvc25hcC9iZWZvcmUtYicpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgYWZ0ZXJCID0gVVJJLmZpbGUoJy9zbmFwL2FmdGVyLWInKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGZpbGUgPSBVUkkuZmlsZSgnL2ZpbGUudHMnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGNvbnRlbnRNYXAgPSBuZXcgTWFwKFtcblx0XHRcdFtiZWZvcmVBLCAndjAnXSwgW2FmdGVyQSwgJ3YxJ10sXG5cdFx0XHRbYmVmb3JlQiwgJ3YxJ10sIFthZnRlckIsICd2MiddLFxuXHRcdFx0W2ZpbGUsICd2MiddLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHN0b3JlLCBjb250ZW50TWFwKTtcblx0XHRjb250cm9sbGVyLmFkZFRvb2xDYWxsRWRpdHMoJ3JlcS0xJywgbWFrZVRvb2xDYWxsKHtcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJywgZmlsZVBhdGg6ICcvZmlsZS50cycsXG5cdFx0XHRiZWZvcmVVUkk6IGJlZm9yZUEsIGFmdGVyVVJJOiBhZnRlckEsXG5cdFx0fSkpO1xuXHRcdGNvbnRyb2xsZXIuYWRkVG9vbENhbGxFZGl0cygncmVxLTEnLCBtYWtlVG9vbENhbGwoe1xuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTInLCBmaWxlUGF0aDogJy9maWxlLnRzJyxcblx0XHRcdGJlZm9yZVVSSTogYmVmb3JlQiwgYWZ0ZXJVUkk6IGFmdGVyQixcblx0XHR9KSk7XG5cdFx0YXdhaXQgY29udHJvbGxlci5yZXN0b3JlU25hcHNob3QoJ3JlcS0xJywgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudE1hcC5nZXQoZmlsZSksICd2MCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYXNFZGl0c0luUmVxdWVzdCByZWZsZWN0cyBhZGRlZCB0b29sIGNhbGwgZWRpdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoc3RvcmUsIG5ldyBNYXAoKSk7XG5cdFx0Y29udHJvbGxlci5hZGRUb29sQ2FsbEVkaXRzKCdyZXEtMScsIG1ha2VUb29sQ2FsbCh7XG5cdFx0XHR0b29sQ2FsbElkOiAndGMtMScsIGZpbGVQYXRoOiAnL2ZpbGUudHMnLFxuXHRcdFx0YmVmb3JlVVJJOiAnYWdlbnRob3N0LWNvbnRlbnQ6Ly8vYmVmb3JlJywgYWZ0ZXJVUkk6ICdhZ2VudGhvc3QtY29udGVudDovLy9hZnRlcicsXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLmhhc0VkaXRzSW5SZXF1ZXN0KCdyZXEtMScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5oYXNFZGl0c0luUmVxdWVzdCgncmVxLTInKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdub24tY29tcGxldGVkIHRvb2wgY2FsbHMgYXJlIGlnbm9yZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoc3RvcmUsIG5ldyBNYXAoKSk7XG5cdFx0Y29udHJvbGxlci5hZGRUb29sQ2FsbEVkaXRzKCdyZXEtMScsIHtcblx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdHRvb2xOYW1lOiAnY29kZUVkaXQnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdFZGl0IEZpbGUnLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdFZGl0aW5nIGZpbGUnLFxuXHRcdFx0dG9vbElucHV0OiAne30nLFxuXHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRjb250ZW50OiBbXSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5jYW5VbmRvLmdldCgpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VuZG9JbnRlcmFjdGlvbiBzdGVwcyBiYWNrIG9uZSBjaGVja3BvaW50IGF0IGEgdGltZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiZWZvcmVBID0gVVJJLmZpbGUoJy9zbmFwL2JlZm9yZS1hJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBhZnRlckEgPSBVUkkuZmlsZSgnL3NuYXAvYWZ0ZXItYScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgYmVmb3JlQiA9IFVSSS5maWxlKCcvc25hcC9iZWZvcmUtYicpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgYWZ0ZXJCID0gVVJJLmZpbGUoJy9zbmFwL2FmdGVyLWInKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGZpbGVBID0gVVJJLmZpbGUoJy9hLnRzJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBmaWxlQiA9IFVSSS5maWxlKCcvYi50cycpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY29udGVudE1hcCA9IG5ldyBNYXAoW1xuXHRcdFx0W2JlZm9yZUEsICdhMCddLCBbYWZ0ZXJBLCAnYTEnXSwgW2ZpbGVBLCAnYTEnXSxcblx0XHRcdFtiZWZvcmVCLCAnYjAnXSwgW2FmdGVyQiwgJ2IxJ10sIFtmaWxlQiwgJ2IxJ10sXG5cdFx0XSk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoc3RvcmUsIGNvbnRlbnRNYXApO1xuXHRcdGNvbnRyb2xsZXIuYWRkVG9vbENhbGxFZGl0cygncmVxLTEnLCBtYWtlVG9vbENhbGwoeyB0b29sQ2FsbElkOiAndGMtMScsIGZpbGVQYXRoOiAnL2EudHMnLCBiZWZvcmVVUkk6IGJlZm9yZUEsIGFmdGVyVVJJOiBhZnRlckEgfSkpO1xuXHRcdGNvbnRyb2xsZXIuYWRkVG9vbENhbGxFZGl0cygncmVxLTInLCBtYWtlVG9vbENhbGwoeyB0b29sQ2FsbElkOiAndGMtMicsIGZpbGVQYXRoOiAnL2IudHMnLCBiZWZvcmVVUkk6IGJlZm9yZUIsIGFmdGVyVVJJOiBhZnRlckIgfSkpO1xuXG5cdFx0Ly8gVW5kbyByZXEtMiBvbmx5IFx1MjAxNCByZXEtMSdzIGVkaXQgc3RheXMgYXBwbGllZC5cblx0XHRhd2FpdCBjb250cm9sbGVyLnVuZG9JbnRlcmFjdGlvbigpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50TWFwLmdldChmaWxlQSksICdhMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50TWFwLmdldChmaWxlQiksICdiMCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLmNhblVuZG8uZ2V0KCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLmNhblJlZG8uZ2V0KCksIHRydWUpO1xuXG5cdFx0Ly8gVW5kbyByZXEtMSB0b28uXG5cdFx0YXdhaXQgY29udHJvbGxlci51bmRvSW50ZXJhY3Rpb24oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudE1hcC5nZXQoZmlsZUEpLCAnYTAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5jYW5VbmRvLmdldCgpLCBmYWxzZSk7XG5cblx0XHQvLyBFeHRyYSB1bmRvIHBhc3QgdGhlIHN0YXJ0IGlzIGEgc2FmZSBuby1vcC5cblx0XHRhd2FpdCBjb250cm9sbGVyLnVuZG9JbnRlcmFjdGlvbigpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50TWFwLmdldChmaWxlQSksICdhMCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWRvSW50ZXJhY3Rpb24gc3RlcHMgZm9yd2FyZCBhbmQgc3RvcHMgYXQgSEVBRCAobm8gaW5maW5pdGUgbG9vcCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmVmb3JlQSA9IFVSSS5maWxlKCcvc25hcC9iZWZvcmUtYScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgYWZ0ZXJBID0gVVJJLmZpbGUoJy9zbmFwL2FmdGVyLWEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGJlZm9yZUIgPSBVUkkuZmlsZSgnL3NuYXAvYmVmb3JlLWInKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGFmdGVyQiA9IFVSSS5maWxlKCcvc25hcC9hZnRlci1iJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBmaWxlQSA9IFVSSS5maWxlKCcvYS50cycpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZmlsZUIgPSBVUkkuZmlsZSgnL2IudHMnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGNvbnRlbnRNYXAgPSBuZXcgTWFwKFtcblx0XHRcdFtiZWZvcmVBLCAnYTAnXSwgW2FmdGVyQSwgJ2ExJ10sIFtmaWxlQSwgJ2ExJ10sXG5cdFx0XHRbYmVmb3JlQiwgJ2IwJ10sIFthZnRlckIsICdiMSddLCBbZmlsZUIsICdiMSddLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHN0b3JlLCBjb250ZW50TWFwKTtcblx0XHRjb250cm9sbGVyLmFkZFRvb2xDYWxsRWRpdHMoJ3JlcS0xJywgbWFrZVRvb2xDYWxsKHsgdG9vbENhbGxJZDogJ3RjLTEnLCBmaWxlUGF0aDogJy9hLnRzJywgYmVmb3JlVVJJOiBiZWZvcmVBLCBhZnRlclVSSTogYWZ0ZXJBIH0pKTtcblx0XHRjb250cm9sbGVyLmFkZFRvb2xDYWxsRWRpdHMoJ3JlcS0yJywgbWFrZVRvb2xDYWxsKHsgdG9vbENhbGxJZDogJ3RjLTInLCBmaWxlUGF0aDogJy9iLnRzJywgYmVmb3JlVVJJOiBiZWZvcmVCLCBhZnRlclVSSTogYWZ0ZXJCIH0pKTtcblxuXHRcdC8vIFJlc3RvcmUgdG8gYmVmb3JlIHJlcS0xIHNvIGJvdGggZWRpdHMgYXJlIHBlbmRpbmcgYSByZWRvLlxuXHRcdGF3YWl0IGNvbnRyb2xsZXIucmVzdG9yZVNuYXBzaG90KCdyZXEtMScsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRNYXAuZ2V0KGZpbGVBKSwgJ2EwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRNYXAuZ2V0KGZpbGVCKSwgJ2IwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuY2FuUmVkby5nZXQoKSwgdHJ1ZSk7XG5cblx0XHQvLyBFbXVsYXRlIHRoZSBcIlJlZG9cIiBhY3Rpb24ncyBkcmFpbiBsb29wLiBUaGUgYm91bmRlZCBndWFyZCB0dXJucyBhXG5cdFx0Ly8gcmVncmVzc2lvbiAocmVkb0ludGVyYWN0aW9uIG5vdCBhZHZhbmNpbmcgdGhlIGN1cnNvcikgaW50byBhIGNsZWFuXG5cdFx0Ly8gYXNzZXJ0aW9uIGZhaWx1cmUgaW5zdGVhZCBvZiBhbiBpbmZpbml0ZSBsb29wIHRoYXQgd291bGQgaGFuZyB0aGVcblx0XHQvLyB3aW5kb3cgXHUyMDE0IHdoaWNoIGlzIGV4YWN0bHkgdGhlIGJ1ZyB0aGlzIGd1YXJkcyBhZ2FpbnN0LlxuXHRcdGxldCBndWFyZCA9IDA7XG5cdFx0d2hpbGUgKGNvbnRyb2xsZXIuY2FuUmVkby5nZXQoKSkge1xuXHRcdFx0YXdhaXQgY29udHJvbGxlci5yZWRvSW50ZXJhY3Rpb24oKTtcblx0XHRcdGFzc2VydC5vaygrK2d1YXJkIDw9IDEwLCAncmVkb0ludGVyYWN0aW9uIGZhaWxlZCB0byBhZHZhbmNlIHRoZSBjaGVja3BvaW50IGN1cnNvcicpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50TWFwLmdldChmaWxlQSksICdhMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50TWFwLmdldChmaWxlQiksICdiMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLmNhblJlZG8uZ2V0KCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5jYW5VbmRvLmdldCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnc3RyZWFtaW5nLWVkaXRzIEFQSXMgdGhyb3cgXHUyMDE0IGFnZW50IGhvc3Qgb3ducyBlZGl0cyBzZXJ2ZXItc2lkZScsICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcihzdG9yZSwgbmV3IE1hcCgpKTtcblx0XHRjb25zdCBmYWtlUmVzcG9uc2VNb2RlbCA9IHt9IGFzIElDaGF0UmVzcG9uc2VNb2RlbDtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGNvbnRyb2xsZXIuc3RhcnRTdHJlYW1pbmdFZGl0cyhVUkkuZmlsZSgnL3gnKSwgZmFrZVJlc3BvbnNlTW9kZWwsIHVuZGVmaW5lZCkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gY29udHJvbGxlci5hcHBseVdvcmtzcGFjZUVkaXQoeyBraW5kOiAnd29ya3NwYWNlRWRpdCcsIGVkaXRzOiBbXSB9LCBmYWtlUmVzcG9uc2VNb2RlbCwgJ3N0b3AnKSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDRCQUE0QixnQkFBZ0IsNkJBQTZCO0FBR2xGLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsbUNBQW1DO0FBRTVDLFNBQVMsYUFBYSxNQU9LO0FBQzFCLFNBQU87QUFBQSxJ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
