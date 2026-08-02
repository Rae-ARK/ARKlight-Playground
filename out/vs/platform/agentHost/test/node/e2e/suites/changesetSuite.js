import assert from "assert";
import { execSync } from "child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ChangesetOperationTargetKind } from "../../../../common/state/protocol/channels-changeset/commands.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { buildDefaultChatUri } from "../../../../common/state/sessionState.js";
import {
  ChangesetKind,
  buildBranchChangesetUri,
  buildUncommittedChangesetUri
} from "../../../../common/changesetUri.js";
import { createRealSession, dispatchTurn, initTestGitRepo } from "../harness/agentHostE2ETestHarness.js";
import { getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
import { conformanceTest } from "./e2eTestContext.js";
function defineChangesetTests(context) {
  const { config, createdSessions, tempDirs } = context;
  let clientSeq = 1e3;
  function nextClientSeq() {
    return clientSeq++;
  }
  function createGitWorkspace(prefix) {
    const workspace = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(workspace);
    initTestGitRepo(workspace);
    writeFileSync(join(workspace, "seed.txt"), "seed\n");
    execSync("git add .", { cwd: workspace });
    execSync('git commit -q -m "seed"', { cwd: workspace });
    return workspace;
  }
  async function createSessionIn(workspace, prefix) {
    return createRealSession(context.client, config, `${prefix}-${config.provider}`, createdSessions, URI.file(workspace));
  }
  function writeFileCommand(file, contents) {
    return `!node -e "require('fs').writeFileSync(process.argv[1],process.argv[2])" ${file} ${contents}`;
  }
  function fileUri(file) {
    return file.edit.after?.uri ?? file.edit.before?.uri ?? "";
  }
  async function waitForFileInChangeset(channel, basename, timeout = 6e4) {
    const notification = await context.client.waitForNotification((n) => {
      if (!isActionNotification(n, "changeset/contentChanged") || getActionEnvelope(n).channel !== channel) {
        return false;
      }
      const action2 = getActionEnvelope(n).action;
      return action2.files.some((file) => fileUri(file).endsWith(`/${basename}`));
    }, timeout);
    const action = getActionEnvelope(notification).action;
    return action.files.find((file) => fileUri(file).endsWith(`/${basename}`));
  }
  async function waitForTurnComplete(sessionUri, turnId) {
    const chatUri = buildDefaultChatUri(sessionUri);
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === turnId,
      9e4
    );
  }
  async function waitForIdleResourceOnlyOperation(channel, operationId, initialOperations) {
    const operations = new Map(initialOperations.map((operation) => [operation.id, operation]));
    const pendingStatuses = /* @__PURE__ */ new Map();
    const isReady = () => {
      const operation = operations.get(operationId);
      return operation?.status === "idle" && operation.scopes.includes("resource") && !operation.scopes.includes("changeset");
    };
    const replaceOperations = (replacement) => {
      operations.clear();
      for (const operation of replacement) {
        const pendingStatus = pendingStatuses.get(operation.id);
        operations.set(operation.id, pendingStatus === void 0 ? operation : { ...operation, status: pendingStatus });
        pendingStatuses.delete(operation.id);
      }
    };
    const reduce = (n) => {
      const isContentChanged = isActionNotification(n, "changeset/contentChanged");
      const isOperationsChanged = isActionNotification(n, "changeset/operationsChanged");
      const isStatusChanged = isActionNotification(n, "changeset/operationStatusChanged");
      if (!isContentChanged && !isOperationsChanged && !isStatusChanged || getActionEnvelope(n).channel !== channel) {
        return;
      }
      if (isOperationsChanged) {
        replaceOperations(getActionEnvelope(n).action.operations ?? []);
      } else if (isContentChanged) {
        const replacement = getActionEnvelope(n).action.operations;
        if (replacement) {
          replaceOperations(replacement);
        }
      } else {
        const changed = getActionEnvelope(n).action;
        const operation = operations.get(changed.operationId);
        if (operation) {
          operations.set(changed.operationId, { ...operation, status: changed.status });
        } else {
          pendingStatuses.set(changed.operationId, changed.status);
        }
      }
    };
    const processed = new Set(context.client.receivedNotifications());
    for (const notification of processed) {
      reduce(notification);
    }
    if (isReady()) {
      return;
    }
    await context.client.waitForNotification((n) => {
      if (processed.has(n)) {
        return false;
      }
      processed.add(n);
      reduce(n);
      return isReady();
    }, 6e4);
  }
  async function createModifiedUncommittedChangeset(prefix) {
    const workspace = createGitWorkspace(`ahp-${prefix}-`);
    const sessionUri = await createSessionIn(workspace, prefix);
    const changeset = buildUncommittedChangesetUri(sessionUri);
    const subscribed = await context.client.call("subscribe", { channel: changeset });
    const initialOperations = subscribed.snapshot.state.operations ?? [];
    context.client.clearReceived();
    const turnId = `turn-${prefix}`;
    dispatchTurn(context.client, sessionUri, turnId, writeFileCommand("seed.txt", "edited"), 1);
    const file = await waitForFileInChangeset(changeset, "seed.txt");
    await waitForIdleResourceOnlyOperation(changeset, "discard-changes", initialOperations);
    await waitForTurnComplete(sessionUri, turnId);
    return { workspace, changeset, file };
  }
  conformanceTest(context, "subscribing to a changeset reports its computation status", async function() {
    const workspace = createGitWorkspace("ahp-changeset-status-");
    const sessionUri = await createSessionIn(workspace, "changeset-status");
    const branchUri = buildBranchChangesetUri(sessionUri);
    const subscribed = await context.client.call("subscribe", { channel: branchUri });
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "changeset/statusChanged") && getActionEnvelope(n).channel === branchUri && getActionEnvelope(n).action.status === "ready",
      6e4
    );
    assert.deepStrictEqual({
      resource: subscribed.snapshot.resource,
      files: subscribed.snapshot.state.files
    }, {
      resource: branchUri,
      files: []
    });
  });
  conformanceTest(context, "a file written during a turn appears in the branch changeset", async function() {
    const workspace = createGitWorkspace("ahp-changeset-add-");
    const sessionUri = await createSessionIn(workspace, "changeset-add");
    const branchUri = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchUri });
    context.client.clearReceived();
    const turnId = "turn-changeset-add";
    dispatchTurn(context.client, sessionUri, turnId, writeFileCommand("added.txt", "ADDED"), 1);
    const file = await waitForFileInChangeset(branchUri, "added.txt");
    await waitForTurnComplete(sessionUri, turnId);
    assert.deepStrictEqual({
      hasBeforeSide: file.edit.before !== void 0,
      hasAfterSide: file.edit.after !== void 0,
      diff: file.edit.diff,
      reviewed: file.reviewed
    }, {
      hasBeforeSide: false,
      hasAfterSide: true,
      diff: { added: 1, removed: 0 },
      reviewed: false
    });
  });
  conformanceTest(context, "editing a committed file reports both sides of the change", async function() {
    const workspace = createGitWorkspace("ahp-changeset-edit-");
    const sessionUri = await createSessionIn(workspace, "changeset-edit");
    const branchUri = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchUri });
    context.client.clearReceived();
    const turnId = "turn-changeset-edit";
    dispatchTurn(context.client, sessionUri, turnId, writeFileCommand("seed.txt", "edited"), 1);
    const file = await waitForFileInChangeset(branchUri, "seed.txt");
    await waitForTurnComplete(sessionUri, turnId);
    assert.deepStrictEqual({
      hasBeforeSide: file.edit.before !== void 0,
      hasAfterSide: file.edit.after !== void 0
    }, {
      hasBeforeSide: true,
      hasAfterSide: true
    });
  });
  conformanceTest(context, "a client can mark a changeset file reviewed", async function() {
    const workspace = createGitWorkspace("ahp-changeset-review-");
    const sessionUri = await createSessionIn(workspace, "changeset-review");
    const branchUri = buildBranchChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: branchUri });
    context.client.clearReceived();
    const turnId = "turn-changeset-review";
    dispatchTurn(context.client, sessionUri, turnId, writeFileCommand("reviewme.txt", "REVIEW"), 1);
    const file = await waitForFileInChangeset(branchUri, "reviewme.txt");
    await waitForTurnComplete(sessionUri, turnId);
    context.client.dispatch({
      channel: branchUri,
      clientSeq: nextClientSeq(),
      action: { type: ActionType.ChangesetFilesReviewChanged, files: [file.id], reviewed: true }
    });
    const echoed = await context.client.waitForNotification(
      (n) => isActionNotification(n, "changeset/filesReviewChanged") && getActionEnvelope(n).channel === branchUri,
      6e4
    );
    assert.deepStrictEqual(getActionEnvelope(echoed).action, {
      type: ActionType.ChangesetFilesReviewChanged,
      files: [file.id],
      reviewed: true
    });
  });
  conformanceTest(context, "uncommitted changes advertise the operations that act on them", async function() {
    const workspace = createGitWorkspace("ahp-changeset-ops-");
    const sessionUri = await createSessionIn(workspace, "changeset-ops");
    const uncommittedUri = buildUncommittedChangesetUri(sessionUri);
    await context.client.call("subscribe", { channel: uncommittedUri });
    context.client.clearReceived();
    const turnId = "turn-changeset-ops";
    dispatchTurn(context.client, sessionUri, turnId, writeFileCommand("operate.txt", "OPERATE"), 1);
    const notification = await context.client.waitForNotification((n) => {
      if (!isActionNotification(n, "changeset/contentChanged") || getActionEnvelope(n).channel !== uncommittedUri) {
        return false;
      }
      return (getActionEnvelope(n).action.operations ?? []).length > 0;
    }, 6e4);
    const operations = getActionEnvelope(notification).action.operations ?? [];
    await waitForTurnComplete(sessionUri, turnId);
    assert.deepStrictEqual(operations.map((operation) => ({ id: operation.id, scopes: operation.scopes })), [
      { id: "commit", scopes: ["changeset"] },
      { id: "discard-changes", scopes: ["resource"] }
    ]);
  });
  conformanceTest(context, "discarding a tracked change restores the file and reports operation status", async function() {
    const { workspace, changeset, file } = await createModifiedUncommittedChangeset("changeset-discard");
    const resource = file.edit.after?.uri;
    assert.ok(resource);
    context.client.clearReceived();
    const completed = context.client.waitForNotification(
      (n) => isActionNotification(n, "changeset/operationStatusChanged") && getActionEnvelope(n).channel === changeset && getActionEnvelope(n).action.operationId === "discard-changes" && getActionEnvelope(n).action.status === "idle"
    );
    await context.client.call("invokeChangesetOperation", {
      channel: changeset,
      operationId: "discard-changes",
      target: { kind: ChangesetOperationTargetKind.Resource, resource }
    });
    await completed;
    const statuses = context.client.receivedNotifications(
      (n) => isActionNotification(n, "changeset/operationStatusChanged") && getActionEnvelope(n).channel === changeset
    ).map((n) => getActionEnvelope(n).action).filter((action) => action.operationId === "discard-changes").map((action) => action.status);
    assert.deepStrictEqual({
      contents: readFileSync(join(workspace, "seed.txt"), "utf8").replaceAll("\r\n", "\n"),
      statuses
    }, {
      contents: "seed\n",
      statuses: ["running", "idle"]
    });
  });
  conformanceTest(context, "invoking an unknown changeset operation is rejected", async function() {
    const { changeset } = await createModifiedUncommittedChangeset("changeset-unknown-operation");
    await assert.rejects(context.client.call("invokeChangesetOperation", {
      channel: changeset,
      operationId: "unknown-operation"
    }));
  });
  conformanceTest(context, "changeset operation rejects a target outside its advertised scopes", async function() {
    const { changeset } = await createModifiedUncommittedChangeset("changeset-invalid-scope");
    await assert.rejects(context.client.call("invokeChangesetOperation", {
      channel: changeset,
      operationId: "discard-changes"
    }));
  });
  conformanceTest(context, "a new session advertises its initial changeset catalog on a separate channel", async function() {
    const workspace = createGitWorkspace("ahp-changeset-catalog-");
    const sessionUri = await createSessionIn(workspace, "changeset-catalog");
    const session = await context.client.call("subscribe", { channel: sessionUri });
    const changesets = session.snapshot.state.changesets ?? [];
    const advertisedChannels = changesets.map((changeset) => changeset.uriTemplate).filter((uri) => !uri.includes("{"));
    const subscribed = await Promise.all(advertisedChannels.map(
      (channel) => context.client.call("subscribe", { channel })
    ));
    assert.deepStrictEqual({
      catalog: changesets.map((changeset) => ({
        changeKind: changeset.changeKind,
        uriTemplate: changeset.uriTemplate,
        canReview: changeset.capabilities?.review !== void 0
      })),
      subscribedChannels: subscribed.map((result) => result.snapshot.resource)
    }, {
      catalog: [{
        changeKind: ChangesetKind.Uncommitted,
        uriTemplate: buildUncommittedChangesetUri(sessionUri),
        canReview: false
      }],
      subscribedChannels: advertisedChannels
    });
  });
}
export {
  defineChangesetTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvZTJlL3N1aXRlcy9jaGFuZ2VzZXRTdWl0ZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8qKlxuICogVGhlIGNoYW5nZXNldCBjaGFubmVsOiBob3cgdGhlIGhvc3QgcmVwb3J0cyB3aGF0IGEgc2Vzc2lvbiBjaGFuZ2VkIG9uIGRpc2suXG4gKlxuICogQSBjaGFuZ2VzZXQgaXMgY29tcHV0ZWQgZnJvbSBnaXQgcmF0aGVyIHRoYW4gZnJvbSB3aGF0IGEgdG9vbCByZXBvcnRlZCwgc29cbiAqIGl0IHNlZXMgZWRpdHMgdGhlIGFnZW50IG1hZGUgYnkgYW55IG1lYW5zIFx1MjAxNCB0aGUgc2NlbmFyaW9zIGhlcmUgZHJpdmUgcmVhbFxuICogZmlsZSBjaGFuZ2VzIHRocm91Z2ggaG9zdC1leGVjdXRlZCBiYW5nIGNvbW1hbmRzIGFuZCBuZXZlciBjcm9zcyB0aGUgbW9kZWxcbiAqIGJvdW5kYXJ5LlxuICpcbiAqIFRoZSBob3N0IHB1Ymxpc2hlcyBzZXZlcmFsIGNoYW5nZXNldHMgcGVyIHNlc3Npb24sIGVhY2ggb24gaXRzIG93blxuICogc3Vic2NyaWJhYmxlIGNoYW5uZWw6IGBicmFuY2hgIChhZ2FpbnN0IHRoZSBicmFuY2ggcG9pbnQpLCBgdW5jb21taXR0ZWRgXG4gKiAod29ya2luZy10cmVlIHN0YXRlKSwgYW5kIGBzZXNzaW9uYCAoY3VtdWxhdGl2ZSBmb3IgdGhlIHNlc3Npb24pLiBUaGV5IGFyZVxuICogc2VwYXJhdGUgY2hhbm5lbHMgYmVjYXVzZSBgY2hhbmdlc2V0LypgIGFjdGlvbnMgYXJlIHNjb3BlZCB0byB0aGUgY2hhbmdlc2V0XG4gKiBVUkksIHNvIGEgc2Vzc2lvbi1vbmx5IHN1YnNjcmlwdGlvbiBuZXZlciByZWNlaXZlcyB0aGVtLlxuICpcbiAqIFRoaXMgY29udHJhY3QgcHJldmlvdXNseSBleGlzdGVkIG9ubHkgaW4gdGhlIGZyb3plbiBgLi4vcHJvdG9jb2wvYCBzdWl0ZSxcbiAqIHdoaWNoIGRyaXZlcyBhIG1vY2sgYWdlbnQgd2l0aCB0aGUgbWFnaWMgcHJvbXB0IGB0ZXJtaW5hbC1lZGl0OjxwYXRoPmAgYW5kXG4gKiBzbyBjYW5ub3QgZGVzY3JpYmUgdGhlIGNvbnRyYWN0IGZvciBhbnkgb3RoZXIgQUhQIGltcGxlbWVudGF0aW9uLlxuICovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGV4ZWNTeW5jIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBta2R0ZW1wU3luYywgcmVhZEZpbGVTeW5jLCB3cml0ZUZpbGVTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB0eXBlIHsgU3Vic2NyaWJlUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENoYW5nZXNldE9wZXJhdGlvblRhcmdldEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtY2hhbmdlc2V0L2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgYnVpbGREZWZhdWx0Q2hhdFVyaSwgdHlwZSBTZXNzaW9uU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7XG5cdENoYW5nZXNldEtpbmQsXG5cdGJ1aWxkQnJhbmNoQ2hhbmdlc2V0VXJpLFxuXHRidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpLFxufSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhbmdlc2V0VXJpLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlYWxTZXNzaW9uLCBkaXNwYXRjaFR1cm4sIGluaXRUZXN0R2l0UmVwbyB9IGZyb20gJy4uL2hhcm5lc3MvYWdlbnRIb3N0RTJFVGVzdEhhcm5lc3MuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aW9uRW52ZWxvcGUsIGlzQWN0aW9uTm90aWZpY2F0aW9uIH0gZnJvbSAnLi4vLi4vc2VydmVySW50ZWdyYXRpb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBjb25mb3JtYW5jZVRlc3QsIHR5cGUgSUFnZW50SG9zdEUyRVRlc3RDb250ZXh0IH0gZnJvbSAnLi9lMmVUZXN0Q29udGV4dC5qcyc7XG5cbi8qKiBUaGUgc3Vic2V0IG9mIGBDaGFuZ2VzZXRGaWxlYCB0aGVzZSB0ZXN0cyBhc3NlcnQgb24uICovXG5pbnRlcmZhY2UgSU9ic2VydmVkQ2hhbmdlc2V0RmlsZSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJldmlld2VkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZWRpdDoge1xuXHRcdHJlYWRvbmx5IGJlZm9yZT86IHsgcmVhZG9ubHkgdXJpOiBzdHJpbmcgfTtcblx0XHRyZWFkb25seSBhZnRlcj86IHsgcmVhZG9ubHkgdXJpOiBzdHJpbmcgfTtcblx0XHRyZWFkb25seSBkaWZmPzogeyByZWFkb25seSBhZGRlZDogbnVtYmVyOyByZWFkb25seSByZW1vdmVkOiBudW1iZXIgfTtcblx0fTtcbn1cblxuaW50ZXJmYWNlIElDb250ZW50Q2hhbmdlZEFjdGlvbiB7XG5cdHJlYWRvbmx5IGZpbGVzOiByZWFkb25seSBJT2JzZXJ2ZWRDaGFuZ2VzZXRGaWxlW107XG5cdHJlYWRvbmx5IG9wZXJhdGlvbnM/OiByZWFkb25seSBJT2JzZXJ2ZWRPcGVyYXRpb25bXTtcbn1cblxuaW50ZXJmYWNlIElPcGVyYXRpb25zQ2hhbmdlZEFjdGlvbiB7XG5cdHJlYWRvbmx5IG9wZXJhdGlvbnM/OiByZWFkb25seSBJT2JzZXJ2ZWRPcGVyYXRpb25bXTtcbn1cblxuaW50ZXJmYWNlIElPYnNlcnZlZE9wZXJhdGlvbiB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNjb3BlczogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IHN0YXR1czogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSU9wZXJhdGlvblN0YXR1c0NoYW5nZWRBY3Rpb24ge1xuXHRyZWFkb25seSBvcGVyYXRpb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSBzdGF0dXM6IHN0cmluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlZmluZUNoYW5nZXNldFRlc3RzKGNvbnRleHQ6IElBZ2VudEhvc3RFMkVUZXN0Q29udGV4dCk6IHZvaWQge1xuXHRjb25zdCB7IGNvbmZpZywgY3JlYXRlZFNlc3Npb25zLCB0ZW1wRGlycyB9ID0gY29udGV4dDtcblxuXHQvKipcblx0ICogQ2xpZW50IHNlcXVlbmNlIG51bWJlcnMgbXVzdCBzdHJpY3RseSBpbmNyZWFzZSBmb3IgdGhlIGxpZmV0aW1lIG9mIGFcblx0ICogY2xpZW50LCBhbmQgdGhlIHN1aXRlIHNoYXJlcyBvbmUgYWNyb3NzIHRlc3RzLCBzbyB0aGV5IGNhbm5vdCBiZVxuXHQgKiBoYXJkLWNvZGVkIHBlciBzY2VuYXJpby5cblx0ICovXG5cdGxldCBjbGllbnRTZXEgPSAxMDAwO1xuXHRmdW5jdGlvbiBuZXh0Q2xpZW50U2VxKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIGNsaWVudFNlcSsrO1xuXHR9XG5cblx0LyoqIEEgZ2l0IHJlcG9zaXRvcnkgd2l0aCBvbmUgY29tbWl0dGVkIGZpbGUsIHNvIGEgYnJhbmNoIHBvaW50IGV4aXN0cy4gKi9cblx0ZnVuY3Rpb24gY3JlYXRlR2l0V29ya3NwYWNlKHByZWZpeDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCBwcmVmaXgpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtzcGFjZSk7XG5cdFx0aW5pdFRlc3RHaXRSZXBvKHdvcmtzcGFjZSk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHdvcmtzcGFjZSwgJ3NlZWQudHh0JyksICdzZWVkXFxuJyk7XG5cdFx0ZXhlY1N5bmMoJ2dpdCBhZGQgLicsIHsgY3dkOiB3b3Jrc3BhY2UgfSk7XG5cdFx0ZXhlY1N5bmMoJ2dpdCBjb21taXQgLXEgLW0gXCJzZWVkXCInLCB7IGN3ZDogd29ya3NwYWNlIH0pO1xuXHRcdHJldHVybiB3b3Jrc3BhY2U7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVTZXNzaW9uSW4od29ya3NwYWNlOiBzdHJpbmcsIHByZWZpeDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gY3JlYXRlUmVhbFNlc3Npb24oY29udGV4dC5jbGllbnQsIGNvbmZpZywgYCR7cHJlZml4fS0ke2NvbmZpZy5wcm92aWRlcn1gLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtzcGFjZSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdyaXRlcyBgZmlsZWAgdGhyb3VnaCBhIGhvc3QtZXhlY3V0ZWQgYmFuZyBjb21tYW5kLCBzbyB0aGUgY2hhbmdlIHJlYWNoZXNcblx0ICogZGlzayB0aGUgd2F5IGFuIGFnZW50J3Mgc2hlbGwgZWRpdCB3b3VsZCByYXRoZXIgdGhhbiBmcm9tIHRoZSB0ZXN0XG5cdCAqIHByb2Nlc3MuIFBhdGhzIGFyZSByZWxhdGl2ZSBzbyBubyBXaW5kb3dzIGJhY2tzbGFzaCBoYXMgdG8gc3Vydml2ZSBpbnRvIGFcblx0ICogSmF2YVNjcmlwdCBzdHJpbmcgbGl0ZXJhbC5cblx0ICpcblx0ICogVGhlIGZpbGUgbmFtZSBhbmQgY29udGVudHMgYXJlIHBhc3NlZCBhcyBgcHJvY2Vzcy5hcmd2YCBlbnRyaWVzIHJhdGhlclxuXHQgKiB0aGFuIGludGVycG9sYXRlZCBpbnRvIHRoZSBzY3JpcHQsIHNvIGEgdmFsdWUgY29udGFpbmluZyBhIHF1b3RlIG9yIGFcblx0ICogYmFja3NsYXNoIGNhbm5vdCBicmVhayBvdXQgb2YgdGhlIGxpdGVyYWwgb3IgY2hhbmdlIHdoYXQgcnVucy5cblx0ICovXG5cdGZ1bmN0aW9uIHdyaXRlRmlsZUNvbW1hbmQoZmlsZTogc3RyaW5nLCBjb250ZW50czogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCFub2RlIC1lIFwicmVxdWlyZSgnZnMnKS53cml0ZUZpbGVTeW5jKHByb2Nlc3MuYXJndlsxXSxwcm9jZXNzLmFyZ3ZbMl0pXCIgJHtmaWxlfSAke2NvbnRlbnRzfWA7XG5cdH1cblxuXHRmdW5jdGlvbiBmaWxlVXJpKGZpbGU6IElPYnNlcnZlZENoYW5nZXNldEZpbGUpOiBzdHJpbmcge1xuXHRcdHJldHVybiBmaWxlLmVkaXQuYWZ0ZXI/LnVyaSA/PyBmaWxlLmVkaXQuYmVmb3JlPy51cmkgPz8gJyc7XG5cdH1cblxuXHQvKipcblx0ICogV2FpdHMgZm9yIGEgYGNoYW5nZXNldC9jb250ZW50Q2hhbmdlZGAgb24gYGNoYW5uZWxgIHRoYXQgcmVwb3J0c1xuXHQgKiBgYmFzZW5hbWVgLiBNYXRjaGVkIGJ5IGJhc2VuYW1lIGJlY2F1c2UgZ2l0IHJlc29sdmVzIHN5bWxpbmtzIHdoZW5cblx0ICogcmVwb3J0aW5nIGl0cyB0b3AgbGV2ZWwgKG1hY09TIGAvdmFyYCB2ZXJzdXMgYC9wcml2YXRlL3ZhcmApLCBzbyB0aGVcblx0ICogcmVwb3J0ZWQgVVJJIG5lZWQgbm90IHNoYXJlIGEgcHJlZml4IHdpdGggdGhlIHdvcmtzcGFjZSBwYXRoLlxuXHQgKi9cblx0YXN5bmMgZnVuY3Rpb24gd2FpdEZvckZpbGVJbkNoYW5nZXNldChjaGFubmVsOiBzdHJpbmcsIGJhc2VuYW1lOiBzdHJpbmcsIHRpbWVvdXQgPSA2MF8wMDApOiBQcm9taXNlPElPYnNlcnZlZENoYW5nZXNldEZpbGU+IHtcblx0XHRjb25zdCBub3RpZmljYXRpb24gPSBhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4ge1xuXHRcdFx0aWYgKCFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhbmdlc2V0L2NvbnRlbnRDaGFuZ2VkJykgfHwgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCAhPT0gY2hhbm5lbCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgSUNvbnRlbnRDaGFuZ2VkQWN0aW9uO1xuXHRcdFx0cmV0dXJuIGFjdGlvbi5maWxlcy5zb21lKGZpbGUgPT4gZmlsZVVyaShmaWxlKS5lbmRzV2l0aChgLyR7YmFzZW5hbWV9YCkpO1xuXHRcdH0sIHRpbWVvdXQpO1xuXHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG5vdGlmaWNhdGlvbikuYWN0aW9uIGFzIElDb250ZW50Q2hhbmdlZEFjdGlvbjtcblx0XHRyZXR1cm4gYWN0aW9uLmZpbGVzLmZpbmQoZmlsZSA9PiBmaWxlVXJpKGZpbGUpLmVuZHNXaXRoKGAvJHtiYXNlbmFtZX1gKSkhO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gd2FpdEZvclR1cm5Db21wbGV0ZShzZXNzaW9uVXJpOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90dXJuQ29tcGxldGUnKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFVyaVxuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHJlYWRvbmx5IHR1cm5JZDogc3RyaW5nIH0pLnR1cm5JZCA9PT0gdHVybklkLFxuXHRcdFx0OTBfMDAwLFxuXHRcdCk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiB3YWl0Rm9ySWRsZVJlc291cmNlT25seU9wZXJhdGlvbihcblx0XHRjaGFubmVsOiBzdHJpbmcsXG5cdFx0b3BlcmF0aW9uSWQ6IHN0cmluZyxcblx0XHRpbml0aWFsT3BlcmF0aW9uczogcmVhZG9ubHkgSU9ic2VydmVkT3BlcmF0aW9uW10sXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG9wZXJhdGlvbnMgPSBuZXcgTWFwKGluaXRpYWxPcGVyYXRpb25zLm1hcChvcGVyYXRpb24gPT4gW29wZXJhdGlvbi5pZCwgb3BlcmF0aW9uXSkpO1xuXHRcdGNvbnN0IHBlbmRpbmdTdGF0dXNlcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3QgaXNSZWFkeSA9ICgpID0+IHtcblx0XHRcdGNvbnN0IG9wZXJhdGlvbiA9IG9wZXJhdGlvbnMuZ2V0KG9wZXJhdGlvbklkKTtcblx0XHRcdHJldHVybiBvcGVyYXRpb24/LnN0YXR1cyA9PT0gJ2lkbGUnXG5cdFx0XHRcdCYmIG9wZXJhdGlvbi5zY29wZXMuaW5jbHVkZXMoJ3Jlc291cmNlJylcblx0XHRcdFx0JiYgIW9wZXJhdGlvbi5zY29wZXMuaW5jbHVkZXMoJ2NoYW5nZXNldCcpO1xuXHRcdH07XG5cdFx0Y29uc3QgcmVwbGFjZU9wZXJhdGlvbnMgPSAocmVwbGFjZW1lbnQ6IHJlYWRvbmx5IElPYnNlcnZlZE9wZXJhdGlvbltdKTogdm9pZCA9PiB7XG5cdFx0XHRvcGVyYXRpb25zLmNsZWFyKCk7XG5cdFx0XHRmb3IgKGNvbnN0IG9wZXJhdGlvbiBvZiByZXBsYWNlbWVudCkge1xuXHRcdFx0XHRjb25zdCBwZW5kaW5nU3RhdHVzID0gcGVuZGluZ1N0YXR1c2VzLmdldChvcGVyYXRpb24uaWQpO1xuXHRcdFx0XHRvcGVyYXRpb25zLnNldChvcGVyYXRpb24uaWQsIHBlbmRpbmdTdGF0dXMgPT09IHVuZGVmaW5lZCA/IG9wZXJhdGlvbiA6IHsgLi4ub3BlcmF0aW9uLCBzdGF0dXM6IHBlbmRpbmdTdGF0dXMgfSk7XG5cdFx0XHRcdHBlbmRpbmdTdGF0dXNlcy5kZWxldGUob3BlcmF0aW9uLmlkKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHJlZHVjZSA9IChuOiBQYXJhbWV0ZXJzPHR5cGVvZiBpc0FjdGlvbk5vdGlmaWNhdGlvbj5bMF0pOiB2b2lkID0+IHtcblx0XHRcdGNvbnN0IGlzQ29udGVudENoYW5nZWQgPSBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhbmdlc2V0L2NvbnRlbnRDaGFuZ2VkJyk7XG5cdFx0XHRjb25zdCBpc09wZXJhdGlvbnNDaGFuZ2VkID0gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYW5nZXNldC9vcGVyYXRpb25zQ2hhbmdlZCcpO1xuXHRcdFx0Y29uc3QgaXNTdGF0dXNDaGFuZ2VkID0gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYW5nZXNldC9vcGVyYXRpb25TdGF0dXNDaGFuZ2VkJyk7XG5cdFx0XHRpZiAoKCFpc0NvbnRlbnRDaGFuZ2VkICYmICFpc09wZXJhdGlvbnNDaGFuZ2VkICYmICFpc1N0YXR1c0NoYW5nZWQpIHx8IGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgIT09IGNoYW5uZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzT3BlcmF0aW9uc0NoYW5nZWQpIHtcblx0XHRcdFx0cmVwbGFjZU9wZXJhdGlvbnMoKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBJT3BlcmF0aW9uc0NoYW5nZWRBY3Rpb24pLm9wZXJhdGlvbnMgPz8gW10pO1xuXHRcdFx0fSBlbHNlIGlmIChpc0NvbnRlbnRDaGFuZ2VkKSB7XG5cdFx0XHRcdGNvbnN0IHJlcGxhY2VtZW50ID0gKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBJQ29udGVudENoYW5nZWRBY3Rpb24pLm9wZXJhdGlvbnM7XG5cdFx0XHRcdGlmIChyZXBsYWNlbWVudCkge1xuXHRcdFx0XHRcdHJlcGxhY2VPcGVyYXRpb25zKHJlcGxhY2VtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgY2hhbmdlZCA9IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBJT3BlcmF0aW9uU3RhdHVzQ2hhbmdlZEFjdGlvbjtcblx0XHRcdFx0Y29uc3Qgb3BlcmF0aW9uID0gb3BlcmF0aW9ucy5nZXQoY2hhbmdlZC5vcGVyYXRpb25JZCk7XG5cdFx0XHRcdGlmIChvcGVyYXRpb24pIHtcblx0XHRcdFx0XHRvcGVyYXRpb25zLnNldChjaGFuZ2VkLm9wZXJhdGlvbklkLCB7IC4uLm9wZXJhdGlvbiwgc3RhdHVzOiBjaGFuZ2VkLnN0YXR1cyB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRwZW5kaW5nU3RhdHVzZXMuc2V0KGNoYW5nZWQub3BlcmF0aW9uSWQsIGNoYW5nZWQuc3RhdHVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgcHJvY2Vzc2VkID0gbmV3IFNldChjb250ZXh0LmNsaWVudC5yZWNlaXZlZE5vdGlmaWNhdGlvbnMoKSk7XG5cdFx0Zm9yIChjb25zdCBub3RpZmljYXRpb24gb2YgcHJvY2Vzc2VkKSB7XG5cdFx0XHRyZWR1Y2Uobm90aWZpY2F0aW9uKTtcblx0XHR9XG5cdFx0aWYgKGlzUmVhZHkoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4ge1xuXHRcdFx0aWYgKHByb2Nlc3NlZC5oYXMobikpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cHJvY2Vzc2VkLmFkZChuKTtcblx0XHRcdHJlZHVjZShuKTtcblx0XHRcdHJldHVybiBpc1JlYWR5KCk7XG5cdFx0fSwgNjBfMDAwKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZU1vZGlmaWVkVW5jb21taXR0ZWRDaGFuZ2VzZXQocHJlZml4OiBzdHJpbmcpOiBQcm9taXNlPHtcblx0XHRyZWFkb25seSB3b3Jrc3BhY2U6IHN0cmluZztcblx0XHRyZWFkb25seSBjaGFuZ2VzZXQ6IHN0cmluZztcblx0XHRyZWFkb25seSBmaWxlOiBJT2JzZXJ2ZWRDaGFuZ2VzZXRGaWxlO1xuXHR9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlR2l0V29ya3NwYWNlKGBhaHAtJHtwcmVmaXh9LWApO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVTZXNzaW9uSW4od29ya3NwYWNlLCBwcmVmaXgpO1xuXHRcdGNvbnN0IGNoYW5nZXNldCA9IGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3Qgc3Vic2NyaWJlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBjaGFuZ2VzZXQgfSk7XG5cdFx0Y29uc3QgaW5pdGlhbE9wZXJhdGlvbnMgPSAoKHN1YnNjcmliZWQuc25hcHNob3QhLnN0YXRlIGFzIHsgb3BlcmF0aW9ucz86IHJlYWRvbmx5IElPYnNlcnZlZE9wZXJhdGlvbltdIH0pLm9wZXJhdGlvbnMgPz8gW10pO1xuXHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblx0XHRjb25zdCB0dXJuSWQgPSBgdHVybi0ke3ByZWZpeH1gO1xuXHRcdGRpc3BhdGNoVHVybihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgdHVybklkLCB3cml0ZUZpbGVDb21tYW5kKCdzZWVkLnR4dCcsICdlZGl0ZWQnKSwgMSk7XG5cdFx0Y29uc3QgZmlsZSA9IGF3YWl0IHdhaXRGb3JGaWxlSW5DaGFuZ2VzZXQoY2hhbmdlc2V0LCAnc2VlZC50eHQnKTtcblx0XHRhd2FpdCB3YWl0Rm9ySWRsZVJlc291cmNlT25seU9wZXJhdGlvbihjaGFuZ2VzZXQsICdkaXNjYXJkLWNoYW5nZXMnLCBpbml0aWFsT3BlcmF0aW9ucyk7XG5cdFx0YXdhaXQgd2FpdEZvclR1cm5Db21wbGV0ZShzZXNzaW9uVXJpLCB0dXJuSWQpO1xuXHRcdHJldHVybiB7IHdvcmtzcGFjZSwgY2hhbmdlc2V0LCBmaWxlIH07XG5cdH1cblxuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnc3Vic2NyaWJpbmcgdG8gYSBjaGFuZ2VzZXQgcmVwb3J0cyBpdHMgY29tcHV0YXRpb24gc3RhdHVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNyZWF0ZUdpdFdvcmtzcGFjZSgnYWhwLWNoYW5nZXNldC1zdGF0dXMtJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZVNlc3Npb25Jbih3b3Jrc3BhY2UsICdjaGFuZ2VzZXQtc3RhdHVzJyk7XG5cdFx0Y29uc3QgYnJhbmNoVXJpID0gYnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSk7XG5cblx0XHRjb25zdCBzdWJzY3JpYmVkID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGJyYW5jaFVyaSB9KTtcblxuXHRcdC8vIEEgY2hhbmdlc2V0IGlzIGNvbXB1dGVkIGFzeW5jaHJvbm91c2x5LCBzbyB0aGUgc25hcHNob3QgYSBzdWJzY3JpYmVyXG5cdFx0Ly8gcmVjZWl2ZXMgaXMgYSBzdGFydGluZyBwb2ludCBhbmQgdGhlIHRlcm1pbmFsIHN0YXR1cyBhcnJpdmVzIGFzIGFuXG5cdFx0Ly8gYWN0aW9uLiBBc3NlcnRpbmcgb25seSB0aGUgc25hcHNob3Qgd291bGQgcGFzcyB3aXRob3V0IHRoZSBob3N0IGV2ZXJcblx0XHQvLyBmaW5pc2hpbmcgdGhlIGNvbXB1dGF0aW9uLlxuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYW5nZXNldC9zdGF0dXNDaGFuZ2VkJylcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGJyYW5jaFVyaVxuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHN0YXR1czogc3RyaW5nIH0pLnN0YXR1cyA9PT0gJ3JlYWR5Jyxcblx0XHRcdDYwXzAwMCxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXNvdXJjZTogc3Vic2NyaWJlZC5zbmFwc2hvdCEucmVzb3VyY2UsXG5cdFx0XHRmaWxlczogKHN1YnNjcmliZWQuc25hcHNob3QhLnN0YXRlIGFzIHsgZmlsZXM6IHVua25vd25bXSB9KS5maWxlcyxcblx0XHR9LCB7XG5cdFx0XHRyZXNvdXJjZTogYnJhbmNoVXJpLFxuXHRcdFx0ZmlsZXM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2EgZmlsZSB3cml0dGVuIGR1cmluZyBhIHR1cm4gYXBwZWFycyBpbiB0aGUgYnJhbmNoIGNoYW5nZXNldCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVHaXRXb3Jrc3BhY2UoJ2FocC1jaGFuZ2VzZXQtYWRkLScpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVTZXNzaW9uSW4od29ya3NwYWNlLCAnY2hhbmdlc2V0LWFkZCcpO1xuXHRcdGNvbnN0IGJyYW5jaFVyaSA9IGJ1aWxkQnJhbmNoQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBicmFuY2hVcmkgfSk7XG5cblx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdFx0Y29uc3QgdHVybklkID0gJ3R1cm4tY2hhbmdlc2V0LWFkZCc7XG5cdFx0ZGlzcGF0Y2hUdXJuKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCB0dXJuSWQsIHdyaXRlRmlsZUNvbW1hbmQoJ2FkZGVkLnR4dCcsICdBRERFRCcpLCAxKTtcblxuXHRcdGNvbnN0IGZpbGUgPSBhd2FpdCB3YWl0Rm9yRmlsZUluQ2hhbmdlc2V0KGJyYW5jaFVyaSwgJ2FkZGVkLnR4dCcpO1xuXHRcdGF3YWl0IHdhaXRGb3JUdXJuQ29tcGxldGUoc2Vzc2lvblVyaSwgdHVybklkKTtcblxuXHRcdC8vIEEgbmV3bHkgYWRkZWQgZmlsZSBoYXMgbm8gYmVmb3JlLXNpZGUsIGFuZCBpdHMgZGlmZiBjb3VudHMgdGhlIGFkZGVkXG5cdFx0Ly8gbGluZS4gQm90aCBjb21lIGZyb20gZ2l0IHJhdGhlciB0aGFuIGZyb20gYW55dGhpbmcgdGhlIHRvb2wgcmVwb3J0ZWQsXG5cdFx0Ly8gd2hpY2ggaXMgdGhlIHByb3BlcnR5IHRoYXQgbWFrZXMgdGhlIGNoYW5nZXNldCB0cnVzdHdvcnRoeS5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhhc0JlZm9yZVNpZGU6IGZpbGUuZWRpdC5iZWZvcmUgIT09IHVuZGVmaW5lZCxcblx0XHRcdGhhc0FmdGVyU2lkZTogZmlsZS5lZGl0LmFmdGVyICE9PSB1bmRlZmluZWQsXG5cdFx0XHRkaWZmOiBmaWxlLmVkaXQuZGlmZixcblx0XHRcdHJldmlld2VkOiBmaWxlLnJldmlld2VkLFxuXHRcdH0sIHtcblx0XHRcdGhhc0JlZm9yZVNpZGU6IGZhbHNlLFxuXHRcdFx0aGFzQWZ0ZXJTaWRlOiB0cnVlLFxuXHRcdFx0ZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMCB9LFxuXHRcdFx0cmV2aWV3ZWQ6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2VkaXRpbmcgYSBjb21taXR0ZWQgZmlsZSByZXBvcnRzIGJvdGggc2lkZXMgb2YgdGhlIGNoYW5nZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVHaXRXb3Jrc3BhY2UoJ2FocC1jaGFuZ2VzZXQtZWRpdC0nKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlU2Vzc2lvbkluKHdvcmtzcGFjZSwgJ2NoYW5nZXNldC1lZGl0Jyk7XG5cdFx0Y29uc3QgYnJhbmNoVXJpID0gYnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IGJyYW5jaFVyaSB9KTtcblxuXHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblx0XHRjb25zdCB0dXJuSWQgPSAndHVybi1jaGFuZ2VzZXQtZWRpdCc7XG5cdFx0ZGlzcGF0Y2hUdXJuKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCB0dXJuSWQsIHdyaXRlRmlsZUNvbW1hbmQoJ3NlZWQudHh0JywgJ2VkaXRlZCcpLCAxKTtcblxuXHRcdGNvbnN0IGZpbGUgPSBhd2FpdCB3YWl0Rm9yRmlsZUluQ2hhbmdlc2V0KGJyYW5jaFVyaSwgJ3NlZWQudHh0Jyk7XG5cdFx0YXdhaXQgd2FpdEZvclR1cm5Db21wbGV0ZShzZXNzaW9uVXJpLCB0dXJuSWQpO1xuXG5cdFx0Ly8gVW5saWtlIGFuIGFkZGVkIGZpbGUsIGFuIGVkaXQgdG8gYSBjb21taXR0ZWQgZmlsZSBoYXMgYSBiZWZvcmUtc2lkZSBcdTIwMTRcblx0XHQvLyB0aGUgY29tbWl0dGVkIHJldmlzaW9uIFx1MjAxNCBzbyB0aGUgY2xpZW50IGNhbiByZW5kZXIgYSByZWFsIGRpZmYuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoYXNCZWZvcmVTaWRlOiBmaWxlLmVkaXQuYmVmb3JlICE9PSB1bmRlZmluZWQsXG5cdFx0XHRoYXNBZnRlclNpZGU6IGZpbGUuZWRpdC5hZnRlciAhPT0gdW5kZWZpbmVkLFxuXHRcdH0sIHtcblx0XHRcdGhhc0JlZm9yZVNpZGU6IHRydWUsXG5cdFx0XHRoYXNBZnRlclNpZGU6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnYSBjbGllbnQgY2FuIG1hcmsgYSBjaGFuZ2VzZXQgZmlsZSByZXZpZXdlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVHaXRXb3Jrc3BhY2UoJ2FocC1jaGFuZ2VzZXQtcmV2aWV3LScpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVTZXNzaW9uSW4od29ya3NwYWNlLCAnY2hhbmdlc2V0LXJldmlldycpO1xuXHRcdGNvbnN0IGJyYW5jaFVyaSA9IGJ1aWxkQnJhbmNoQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBicmFuY2hVcmkgfSk7XG5cblx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdFx0Y29uc3QgdHVybklkID0gJ3R1cm4tY2hhbmdlc2V0LXJldmlldyc7XG5cdFx0ZGlzcGF0Y2hUdXJuKGNvbnRleHQuY2xpZW50LCBzZXNzaW9uVXJpLCB0dXJuSWQsIHdyaXRlRmlsZUNvbW1hbmQoJ3Jldmlld21lLnR4dCcsICdSRVZJRVcnKSwgMSk7XG5cdFx0Y29uc3QgZmlsZSA9IGF3YWl0IHdhaXRGb3JGaWxlSW5DaGFuZ2VzZXQoYnJhbmNoVXJpLCAncmV2aWV3bWUudHh0Jyk7XG5cdFx0YXdhaXQgd2FpdEZvclR1cm5Db21wbGV0ZShzZXNzaW9uVXJpLCB0dXJuSWQpO1xuXG5cdFx0Ly8gYGNoYW5nZXNldC9maWxlc1Jldmlld0NoYW5nZWRgIGlzIHRoZSBvbmUgY2xpZW50LWRpc3BhdGNoYWJsZSBhY3Rpb25cblx0XHQvLyBvbiB0aGlzIGNoYW5uZWw6IHJldmlldyBzdGF0ZSBpcyB0aGUgY2xpZW50J3MgdG8gb3duLCBhbmQgdGhlIHNlcnZlclxuXHRcdC8vIGVjaG9lcyBpdCBiYWNrIHNvIG90aGVyIGNvbm5lY3RlZCBjbGllbnRzIGNvbnZlcmdlLlxuXHRcdGNvbnRleHQuY2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdGNoYW5uZWw6IGJyYW5jaFVyaSxcblx0XHRcdGNsaWVudFNlcTogbmV4dENsaWVudFNlcSgpLFxuXHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZXNSZXZpZXdDaGFuZ2VkLCBmaWxlczogW2ZpbGUuaWRdLCByZXZpZXdlZDogdHJ1ZSB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZWNob2VkID0gYXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhbmdlc2V0L2ZpbGVzUmV2aWV3Q2hhbmdlZCcpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBicmFuY2hVcmksXG5cdFx0XHQ2MF8wMDAsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0QWN0aW9uRW52ZWxvcGUoZWNob2VkKS5hY3Rpb24sIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZXNSZXZpZXdDaGFuZ2VkLFxuXHRcdFx0ZmlsZXM6IFtmaWxlLmlkXSxcblx0XHRcdHJldmlld2VkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3VuY29tbWl0dGVkIGNoYW5nZXMgYWR2ZXJ0aXNlIHRoZSBvcGVyYXRpb25zIHRoYXQgYWN0IG9uIHRoZW0nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gY3JlYXRlR2l0V29ya3NwYWNlKCdhaHAtY2hhbmdlc2V0LW9wcy0nKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlU2Vzc2lvbkluKHdvcmtzcGFjZSwgJ2NoYW5nZXNldC1vcHMnKTtcblx0XHRjb25zdCB1bmNvbW1pdHRlZFVyaSA9IGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHVuY29tbWl0dGVkVXJpIH0pO1xuXG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdGNvbnN0IHR1cm5JZCA9ICd0dXJuLWNoYW5nZXNldC1vcHMnO1xuXHRcdGRpc3BhdGNoVHVybihjb250ZXh0LmNsaWVudCwgc2Vzc2lvblVyaSwgdHVybklkLCB3cml0ZUZpbGVDb21tYW5kKCdvcGVyYXRlLnR4dCcsICdPUEVSQVRFJyksIDEpO1xuXG5cdFx0Ly8gT3BlcmF0aW9ucyBhcmUgd2hhdCBhIGNsaWVudCB0dXJucyBpbnRvIGFmZm9yZGFuY2VzLCBhbmQgdGhleSBhcmVcblx0XHQvLyBvbmx5IG9mZmVyZWQgb25jZSB0aGVyZSBpcyBzb21ldGhpbmcgdG8gYWN0IG9uIFx1MjAxNCBhIHNlc3Npb24gd2l0aCBub1xuXHRcdC8vIHVuY29tbWl0dGVkIGNoYW5nZXMgYWR2ZXJ0aXNlcyBub25lLiBFYWNoIGNhcnJpZXMgdGhlIHNjb3BlIGl0XG5cdFx0Ly8gYXBwbGllcyB0bywgc28gYSBjbGllbnQga25vd3Mgd2hldGhlciB0byBvZmZlciBpdCBmb3IgdGhlIHdob2xlXG5cdFx0Ly8gY2hhbmdlc2V0IG9yIHBlciBmaWxlLlxuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGFuZ2VzZXQvY29udGVudENoYW5nZWQnKSB8fCBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsICE9PSB1bmNvbW1pdHRlZFVyaSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gKChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgSUNvbnRlbnRDaGFuZ2VkQWN0aW9uKS5vcGVyYXRpb25zID8/IFtdKS5sZW5ndGggPiAwO1xuXHRcdH0sIDYwXzAwMCk7XG5cblx0XHRjb25zdCBvcGVyYXRpb25zID0gKGdldEFjdGlvbkVudmVsb3BlKG5vdGlmaWNhdGlvbikuYWN0aW9uIGFzIElDb250ZW50Q2hhbmdlZEFjdGlvbikub3BlcmF0aW9ucyA/PyBbXTtcblx0XHRhd2FpdCB3YWl0Rm9yVHVybkNvbXBsZXRlKHNlc3Npb25VcmksIHR1cm5JZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcGVyYXRpb25zLm1hcChvcGVyYXRpb24gPT4gKHsgaWQ6IG9wZXJhdGlvbi5pZCwgc2NvcGVzOiBvcGVyYXRpb24uc2NvcGVzIH0pKSwgW1xuXHRcdFx0eyBpZDogJ2NvbW1pdCcsIHNjb3BlczogWydjaGFuZ2VzZXQnXSB9LFxuXHRcdFx0eyBpZDogJ2Rpc2NhcmQtY2hhbmdlcycsIHNjb3BlczogWydyZXNvdXJjZSddIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZGlzY2FyZGluZyBhIHRyYWNrZWQgY2hhbmdlIHJlc3RvcmVzIHRoZSBmaWxlIGFuZCByZXBvcnRzIG9wZXJhdGlvbiBzdGF0dXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyB3b3Jrc3BhY2UsIGNoYW5nZXNldCwgZmlsZSB9ID0gYXdhaXQgY3JlYXRlTW9kaWZpZWRVbmNvbW1pdHRlZENoYW5nZXNldCgnY2hhbmdlc2V0LWRpc2NhcmQnKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IGZpbGUuZWRpdC5hZnRlcj8udXJpO1xuXHRcdGFzc2VydC5vayhyZXNvdXJjZSk7XG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdGNvbnN0IGNvbXBsZXRlZCA9IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYW5nZXNldC9vcGVyYXRpb25TdGF0dXNDaGFuZ2VkJylcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYW5nZXNldFxuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IG9wZXJhdGlvbklkOiBzdHJpbmc7IHN0YXR1czogc3RyaW5nIH0pLm9wZXJhdGlvbklkID09PSAnZGlzY2FyZC1jaGFuZ2VzJ1xuXHRcdFx0JiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IG9wZXJhdGlvbklkOiBzdHJpbmc7IHN0YXR1czogc3RyaW5nIH0pLnN0YXR1cyA9PT0gJ2lkbGUnLFxuXHRcdCk7XG5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdpbnZva2VDaGFuZ2VzZXRPcGVyYXRpb24nLCB7XG5cdFx0XHRjaGFubmVsOiBjaGFuZ2VzZXQsXG5cdFx0XHRvcGVyYXRpb25JZDogJ2Rpc2NhcmQtY2hhbmdlcycsXG5cdFx0XHR0YXJnZXQ6IHsga2luZDogQ2hhbmdlc2V0T3BlcmF0aW9uVGFyZ2V0S2luZC5SZXNvdXJjZSwgcmVzb3VyY2UgfSxcblx0XHR9KTtcblx0XHRhd2FpdCBjb21wbGV0ZWQ7XG5cblx0XHRjb25zdCBzdGF0dXNlcyA9IGNvbnRleHQuY2xpZW50LnJlY2VpdmVkTm90aWZpY2F0aW9ucyhuID0+XG5cdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhbmdlc2V0L29wZXJhdGlvblN0YXR1c0NoYW5nZWQnKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhbmdlc2V0LFxuXHRcdCkubWFwKG4gPT4gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgb3BlcmF0aW9uSWQ6IHN0cmluZzsgc3RhdHVzOiBzdHJpbmcgfSlcblx0XHRcdC5maWx0ZXIoYWN0aW9uID0+IGFjdGlvbi5vcGVyYXRpb25JZCA9PT0gJ2Rpc2NhcmQtY2hhbmdlcycpXG5cdFx0XHQubWFwKGFjdGlvbiA9PiBhY3Rpb24uc3RhdHVzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbnRlbnRzOiByZWFkRmlsZVN5bmMoam9pbih3b3Jrc3BhY2UsICdzZWVkLnR4dCcpLCAndXRmOCcpLnJlcGxhY2VBbGwoJ1xcclxcbicsICdcXG4nKSxcblx0XHRcdHN0YXR1c2VzLFxuXHRcdH0sIHtcblx0XHRcdGNvbnRlbnRzOiAnc2VlZFxcbicsXG5cdFx0XHRzdGF0dXNlczogWydydW5uaW5nJywgJ2lkbGUnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdpbnZva2luZyBhbiB1bmtub3duIGNoYW5nZXNldCBvcGVyYXRpb24gaXMgcmVqZWN0ZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBjaGFuZ2VzZXQgfSA9IGF3YWl0IGNyZWF0ZU1vZGlmaWVkVW5jb21taXR0ZWRDaGFuZ2VzZXQoJ2NoYW5nZXNldC11bmtub3duLW9wZXJhdGlvbicpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY29udGV4dC5jbGllbnQuY2FsbCgnaW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uJywge1xuXHRcdFx0Y2hhbm5lbDogY2hhbmdlc2V0LFxuXHRcdFx0b3BlcmF0aW9uSWQ6ICd1bmtub3duLW9wZXJhdGlvbicsXG5cdFx0fSkpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2NoYW5nZXNldCBvcGVyYXRpb24gcmVqZWN0cyBhIHRhcmdldCBvdXRzaWRlIGl0cyBhZHZlcnRpc2VkIHNjb3BlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IGNoYW5nZXNldCB9ID0gYXdhaXQgY3JlYXRlTW9kaWZpZWRVbmNvbW1pdHRlZENoYW5nZXNldCgnY2hhbmdlc2V0LWludmFsaWQtc2NvcGUnKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNvbnRleHQuY2xpZW50LmNhbGwoJ2ludm9rZUNoYW5nZXNldE9wZXJhdGlvbicsIHtcblx0XHRcdGNoYW5uZWw6IGNoYW5nZXNldCxcblx0XHRcdG9wZXJhdGlvbklkOiAnZGlzY2FyZC1jaGFuZ2VzJyxcblx0XHR9KSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnYSBuZXcgc2Vzc2lvbiBhZHZlcnRpc2VzIGl0cyBpbml0aWFsIGNoYW5nZXNldCBjYXRhbG9nIG9uIGEgc2VwYXJhdGUgY2hhbm5lbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVHaXRXb3Jrc3BhY2UoJ2FocC1jaGFuZ2VzZXQtY2F0YWxvZy0nKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlU2Vzc2lvbkluKHdvcmtzcGFjZSwgJ2NoYW5nZXNldC1jYXRhbG9nJyk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0cyA9IChzZXNzaW9uLnNuYXBzaG90IS5zdGF0ZSBhcyBTZXNzaW9uU3RhdGUpLmNoYW5nZXNldHMgPz8gW107XG5cdFx0Y29uc3QgYWR2ZXJ0aXNlZENoYW5uZWxzID0gY2hhbmdlc2V0cy5tYXAoY2hhbmdlc2V0ID0+IGNoYW5nZXNldC51cmlUZW1wbGF0ZSkuZmlsdGVyKHVyaSA9PiAhdXJpLmluY2x1ZGVzKCd7JykpO1xuXHRcdGNvbnN0IHN1YnNjcmliZWQgPSBhd2FpdCBQcm9taXNlLmFsbChhZHZlcnRpc2VkQ2hhbm5lbHMubWFwKGNoYW5uZWwgPT5cblx0XHRcdGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsIH0pXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNhdGFsb2c6IGNoYW5nZXNldHMubWFwKGNoYW5nZXNldCA9PiAoe1xuXHRcdFx0XHRjaGFuZ2VLaW5kOiBjaGFuZ2VzZXQuY2hhbmdlS2luZCxcblx0XHRcdFx0dXJpVGVtcGxhdGU6IGNoYW5nZXNldC51cmlUZW1wbGF0ZSxcblx0XHRcdFx0Y2FuUmV2aWV3OiBjaGFuZ2VzZXQuY2FwYWJpbGl0aWVzPy5yZXZpZXcgIT09IHVuZGVmaW5lZCxcblx0XHRcdH0pKSxcblx0XHRcdHN1YnNjcmliZWRDaGFubmVsczogc3Vic2NyaWJlZC5tYXAocmVzdWx0ID0+IHJlc3VsdC5zbmFwc2hvdCEucmVzb3VyY2UpLFxuXHRcdH0sIHtcblx0XHRcdGNhdGFsb2c6IFt7XG5cdFx0XHRcdGNoYW5nZUtpbmQ6IENoYW5nZXNldEtpbmQuVW5jb21taXR0ZWQsXG5cdFx0XHRcdHVyaVRlbXBsYXRlOiBidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmkpLFxuXHRcdFx0XHRjYW5SZXZpZXc6IGZhbHNlLFxuXHRcdFx0fV0sXG5cdFx0XHRzdWJzY3JpYmVkQ2hhbm5lbHM6IGFkdmVydGlzZWRDaGFubmVscyxcblx0XHR9KTtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUF3QkEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYSxjQUFjLHFCQUFxQjtBQUN6RCxTQUFTLGNBQWM7QUFDdkIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsV0FBVztBQUVwQixTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDJCQUE4QztBQUN2RDtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFDUCxTQUFTLG1CQUFtQixjQUFjLHVCQUF1QjtBQUNqRSxTQUFTLG1CQUFtQiw0QkFBNEI7QUFDeEQsU0FBUyx1QkFBc0Q7QUFpQ3hELFNBQVMscUJBQXFCLFNBQXlDO0FBQzdFLFFBQU0sRUFBRSxRQUFRLGlCQUFpQixTQUFTLElBQUk7QUFPOUMsTUFBSSxZQUFZO0FBQ2hCLFdBQVMsZ0JBQXdCO0FBQ2hDLFdBQU87QUFBQSxFQUNSO0FBR0EsV0FBUyxtQkFBbUIsUUFBd0I7QUFDbkQsVUFBTSxZQUFZLFlBQVksS0FBSyxPQUFPLEdBQUcsTUFBTSxDQUFDO0FBQ3BELGFBQVMsS0FBSyxTQUFTO0FBQ3ZCLG9CQUFnQixTQUFTO0FBQ3pCLGtCQUFjLEtBQUssV0FBVyxVQUFVLEdBQUcsUUFBUTtBQUNuRCxhQUFTLGFBQWEsRUFBRSxLQUFLLFVBQVUsQ0FBQztBQUN4QyxhQUFTLDJCQUEyQixFQUFFLEtBQUssVUFBVSxDQUFDO0FBQ3RELFdBQU87QUFBQSxFQUNSO0FBRUEsaUJBQWUsZ0JBQWdCLFdBQW1CLFFBQWlDO0FBQ2xGLFdBQU8sa0JBQWtCLFFBQVEsUUFBUSxRQUFRLEdBQUcsTUFBTSxJQUFJ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
