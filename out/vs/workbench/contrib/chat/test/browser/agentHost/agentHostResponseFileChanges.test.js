import assert from "assert";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { buildTurnChangesetUri } from "../../../../../../platform/agentHost/common/changesetUri.js";
import { fromAgentHostUri } from "../../../../../../platform/agentHost/common/agentHostUri.js";
import {
  buildDefaultChatUri,
  ChangesetStatus,
  ResponsePartKind,
  SessionStatus,
  ToolCallConfirmationReason,
  ToolCallStatus,
  ToolResultContentType,
  TurnState
} from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { AgentHostResponseFileChangesProvider } from "../../../browser/agentSessions/agentHost/agentHostResponseFileChanges.js";
class FakeAgentConnection extends mock() {
  constructor() {
    super(...arguments);
    this.clientId = "test-client";
    this._emitters = /* @__PURE__ */ new Map();
    this._values = /* @__PURE__ */ new Map();
    this._subscriptionCounts = /* @__PURE__ */ new Map();
  }
  setState(resource, value) {
    this._values.set(resource, value);
    this._emitters.get(resource)?.fire(value);
  }
  getSubscriptionCount(resource) {
    return this._subscriptionCounts.get(resource) ?? 0;
  }
  getSubscription(_kind, resource, _owner) {
    const key = resource.toString();
    this._subscriptionCounts.set(key, (this._subscriptionCounts.get(key) ?? 0) + 1);
    let emitter = this._emitters.get(key);
    if (!emitter) {
      emitter = new Emitter();
      this._emitters.set(key, emitter);
    }
    const self = this;
    const sub = {
      get value() {
        return self._values.get(key);
      },
      get verifiedValue() {
        return self._values.get(key);
      },
      onDidChange: emitter.event,
      onWillApplyAction: Event.None,
      onDidApplyAction: Event.None
    };
    return { object: sub, dispose: () => {
    } };
  }
}
suite("AgentHostResponseFileChangesProvider", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const backendSession = URI.parse("copilot:/sess-1");
  const authority = "authority-1";
  const chatResource = URI.parse("agent-host-copilot:/sess-1");
  function turnChangesetUri(turnId) {
    return URI.parse(buildTurnChangesetUri(backendSession.toString(), turnId)).toString();
  }
  function sessionStateWithTurnSupport() {
    return {
      changesets: [{ label: "This Turn", uriTemplate: buildTurnChangesetUri(backendSession.toString(), "{turnId}"), changeKind: "turn" }]
    };
  }
  function observe(provider, ds) {
    const obs = provider.getChangesForRequest(chatResource, "t1");
    let latest = [];
    ds.add(autorun((r) => {
      latest = obs.read(r);
    }));
    return { latest: () => latest };
  }
  test("maps per-turn changeset files into entry diffs", () => {
    const ds = store.add(new DisposableStore());
    const conn = new FakeAgentConnection();
    const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession));
    conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
    conn.setState(turnChangesetUri("t1"), {
      status: ChangesetStatus.Ready,
      files: [
        { id: "1", edit: { before: { uri: URI.file("/repo/a.ts").toString(), content: { uri: "git-blob://a-before" } }, after: { uri: URI.file("/repo/a.ts").toString(), content: { uri: "git-blob://a-after" } }, diff: { added: 3, removed: 1 } } },
        { id: "2", edit: { after: { uri: URI.file("/repo/b.ts").toString(), content: { uri: "git-blob://b-after" } }, diff: { added: 5, removed: 0 } } }
      ]
    });
    const { latest } = observe(provider, ds);
    assert.deepStrictEqual(latest().map((d) => ({
      added: d.added,
      removed: d.removed,
      modified: d.modifiedURI.path,
      // The RHS diff content is the frozen after-turn snapshot, not the live file.
      after: d.modifiedSnapshotURI && fromAgentHostUri(d.modifiedSnapshotURI).authority
    })), [
      { added: 3, removed: 1, modified: "/repo/a.ts", after: "a-after" },
      { added: 5, removed: 0, modified: "/repo/b.ts", after: "b-after" }
    ]);
  });
  test("keeps the changeset subscription when session state updates", () => {
    const ds = store.add(new DisposableStore());
    const conn = new FakeAgentConnection();
    const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession));
    conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
    conn.setState(turnChangesetUri("t1"), { status: ChangesetStatus.Ready, files: [] });
    observe(provider, ds);
    const subscriptionCountBeforeUpdate = conn.getSubscriptionCount(turnChangesetUri("t1"));
    conn.setState(backendSession.toString(), sessionStateWithTurnSupport());
    assert.deepStrictEqual([
      subscriptionCountBeforeUpdate,
      conn.getSubscriptionCount(turnChangesetUri("t1"))
    ], [1, 1]);
  });
  test("maps turn file edits into entry diffs", () => {
    const ds = store.add(new DisposableStore());
    const conn = new FakeAgentConnection();
    const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession));
    const defaultChatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));
    conn.setState(defaultChatUri.toString(), {
      resource: defaultChatUri.toString(),
      title: "Chat",
      status: SessionStatus.Idle,
      modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      turns: [{
        id: "t1",
        message: {},
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: {
            status: ToolCallStatus.Completed,
            toolCallId: "tool-1",
            toolName: "write_file",
            displayName: "Write File",
            invocationMessage: "Write file",
            confirmed: ToolCallConfirmationReason.NotNeeded,
            success: true,
            pastTenseMessage: "Wrote file",
            content: [{
              type: ToolResultContentType.FileEdit,
              after: { uri: URI.file("/outside/README.md").toString(), content: { uri: "git-blob://readme-after" } },
              diff: { added: 7, removed: 0 }
            }]
          }
        }],
        usage: void 0,
        state: TurnState.Complete
      }]
    });
    const obs = provider.getFileEditsForRequest(chatResource, "t1");
    let latest = [];
    ds.add(autorun((r) => {
      latest = obs.read(r);
    }));
    assert.deepStrictEqual(latest.map((diff) => ({
      modified: fromAgentHostUri(diff.modifiedURI).path,
      added: diff.added,
      removed: diff.removed
    })), [
      { modified: "/outside/README.md", added: 7, removed: 0 }
    ]);
  });
  test("returns empty when the agent does not advertise a turn changeset", () => {
    const ds = store.add(new DisposableStore());
    const conn = new FakeAgentConnection();
    const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession));
    conn.setState(backendSession.toString(), { changesets: [{ label: "All", uriTemplate: `${backendSession}/changeset/session`, changeKind: "session" }] });
    const { latest } = observe(provider, ds);
    assert.deepStrictEqual(latest(), []);
  });
  test("memoizes the observable per request", () => {
    const ds = store.add(new DisposableStore());
    const conn = new FakeAgentConnection();
    const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => backendSession));
    assert.strictEqual(
      provider.getChangesForRequest(chatResource, "t1"),
      provider.getChangesForRequest(chatResource, "t1")
    );
  });
  test("returns undefined when the backend session cannot be resolved", () => {
    const ds = store.add(new DisposableStore());
    const conn = new FakeAgentConnection();
    const provider = ds.add(new AgentHostResponseFileChangesProvider(conn, authority, () => void 0));
    assert.strictEqual(provider.getChangesForRequest(chatResource, "t1"), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50SG9zdC9hZ2VudEhvc3RSZXNwb25zZUZpbGVDaGFuZ2VzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElBZ2VudENvbm5lY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBidWlsZFR1cm5DaGFuZ2VzZXRVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2NoYW5nZXNldFVyaS5qcyc7XG5pbXBvcnQgeyBmcm9tQWdlbnRIb3N0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgSUFnZW50U3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQge1xuXHRidWlsZERlZmF1bHRDaGF0VXJpLFxuXHRDaGFuZ2VzZXRTdGF0dXMsXG5cdFJlc3BvbnNlUGFydEtpbmQsXG5cdFNlc3Npb25TdGF0dXMsXG5cdFN0YXRlQ29tcG9uZW50cyxcblx0VG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sXG5cdFRvb2xDYWxsU3RhdHVzLFxuXHRUb29sUmVzdWx0Q29udGVudFR5cGUsXG5cdFR1cm5TdGF0ZSxcblx0dHlwZSBDaGFuZ2VzZXRTdGF0ZSxcblx0dHlwZSBDaGF0U3RhdGUsXG5cdHR5cGUgU2Vzc2lvblN0YXRlXG59IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElFZGl0U2Vzc2lvbkVudHJ5RGlmZiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RSZXNwb25zZUZpbGVDaGFuZ2VzUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFJlc3BvbnNlRmlsZUNoYW5nZXMuanMnO1xuXG5jbGFzcyBGYWtlQWdlbnRDb25uZWN0aW9uIGV4dGVuZHMgbW9jazxJQWdlbnRDb25uZWN0aW9uPigpIHtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgY2xpZW50SWQgPSAndGVzdC1jbGllbnQnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VtaXR0ZXJzID0gbmV3IE1hcDxzdHJpbmcsIEVtaXR0ZXI8dW5rbm93bj4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZhbHVlcyA9IG5ldyBNYXA8c3RyaW5nLCB1bmtub3duPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdWJzY3JpcHRpb25Db3VudHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXG5cdHNldFN0YXRlKHJlc291cmNlOiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKTogdm9pZCB7XG5cdFx0dGhpcy5fdmFsdWVzLnNldChyZXNvdXJjZSwgdmFsdWUpO1xuXHRcdHRoaXMuX2VtaXR0ZXJzLmdldChyZXNvdXJjZSk/LmZpcmUodmFsdWUpO1xuXHR9XG5cblx0Z2V0U3Vic2NyaXB0aW9uQ291bnQocmVzb3VyY2U6IHN0cmluZyk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3N1YnNjcmlwdGlvbkNvdW50cy5nZXQocmVzb3VyY2UpID8/IDA7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRTdWJzY3JpcHRpb248VCBleHRlbmRzIFN0YXRlQ29tcG9uZW50cz4oX2tpbmQ6IFQsIHJlc291cmNlOiBVUkksIF9vd25lcjogc3RyaW5nKTogSVJlZmVyZW5jZTxJQWdlbnRTdWJzY3JpcHRpb248bmV2ZXI+PiB7XG5cdFx0Y29uc3Qga2V5ID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHR0aGlzLl9zdWJzY3JpcHRpb25Db3VudHMuc2V0KGtleSwgKHRoaXMuX3N1YnNjcmlwdGlvbkNvdW50cy5nZXQoa2V5KSA/PyAwKSArIDEpO1xuXHRcdGxldCBlbWl0dGVyID0gdGhpcy5fZW1pdHRlcnMuZ2V0KGtleSk7XG5cdFx0aWYgKCFlbWl0dGVyKSB7XG5cdFx0XHRlbWl0dGVyID0gbmV3IEVtaXR0ZXI8dW5rbm93bj4oKTtcblx0XHRcdHRoaXMuX2VtaXR0ZXJzLnNldChrZXksIGVtaXR0ZXIpO1xuXHRcdH1cblx0XHRjb25zdCBzZWxmID0gdGhpcztcblx0XHRjb25zdCBzdWIgPSB7XG5cdFx0XHRnZXQgdmFsdWUoKSB7IHJldHVybiBzZWxmLl92YWx1ZXMuZ2V0KGtleSk7IH0sXG5cdFx0XHRnZXQgdmVyaWZpZWRWYWx1ZSgpIHsgcmV0dXJuIHNlbGYuX3ZhbHVlcy5nZXQoa2V5KTsgfSxcblx0XHRcdG9uRGlkQ2hhbmdlOiBlbWl0dGVyLmV2ZW50LFxuXHRcdFx0b25XaWxsQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQWdlbnRTdWJzY3JpcHRpb248bmV2ZXI+O1xuXHRcdHJldHVybiB7IG9iamVjdDogc3ViLCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0fVxufVxuXG5zdWl0ZSgnQWdlbnRIb3N0UmVzcG9uc2VGaWxlQ2hhbmdlc1Byb3ZpZGVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgYmFja2VuZFNlc3Npb24gPSBVUkkucGFyc2UoJ2NvcGlsb3Q6L3Nlc3MtMScpO1xuXHRjb25zdCBhdXRob3JpdHkgPSAnYXV0aG9yaXR5LTEnO1xuXHRjb25zdCBjaGF0UmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovc2Vzcy0xJyk7XG5cblx0ZnVuY3Rpb24gdHVybkNoYW5nZXNldFVyaSh0dXJuSWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFVSSS5wYXJzZShidWlsZFR1cm5DaGFuZ2VzZXRVcmkoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSwgdHVybklkKSkudG9TdHJpbmcoKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNlc3Npb25TdGF0ZVdpdGhUdXJuU3VwcG9ydCgpOiBTZXNzaW9uU3RhdGUge1xuXHRcdHJldHVybiB7XG5cdFx0XHRjaGFuZ2VzZXRzOiBbeyBsYWJlbDogJ1RoaXMgVHVybicsIHVyaVRlbXBsYXRlOiBidWlsZFR1cm5DaGFuZ2VzZXRVcmkoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSwgJ3t0dXJuSWR9JyksIGNoYW5nZUtpbmQ6ICd0dXJuJyB9XSxcblx0XHR9IGFzIHVua25vd24gYXMgU2Vzc2lvblN0YXRlO1xuXHR9XG5cblx0ZnVuY3Rpb24gb2JzZXJ2ZShwcm92aWRlcjogQWdlbnRIb3N0UmVzcG9uc2VGaWxlQ2hhbmdlc1Byb3ZpZGVyLCBkczogRGlzcG9zYWJsZVN0b3JlKTogeyBsYXRlc3Q6ICgpID0+IHJlYWRvbmx5IElFZGl0U2Vzc2lvbkVudHJ5RGlmZltdIH0ge1xuXHRcdGNvbnN0IG9icyA9IHByb3ZpZGVyLmdldENoYW5nZXNGb3JSZXF1ZXN0KGNoYXRSZXNvdXJjZSwgJ3QxJykhO1xuXHRcdGxldCBsYXRlc3Q6IHJlYWRvbmx5IElFZGl0U2Vzc2lvbkVudHJ5RGlmZltdID0gW107XG5cdFx0ZHMuYWRkKGF1dG9ydW4ociA9PiB7IGxhdGVzdCA9IG9icy5yZWFkKHIpOyB9KSk7XG5cdFx0cmV0dXJuIHsgbGF0ZXN0OiAoKSA9PiBsYXRlc3QgfTtcblx0fVxuXG5cdHRlc3QoJ21hcHMgcGVyLXR1cm4gY2hhbmdlc2V0IGZpbGVzIGludG8gZW50cnkgZGlmZnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZHMgPSBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBjb25uID0gbmV3IEZha2VBZ2VudENvbm5lY3Rpb24oKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRzLmFkZChuZXcgQWdlbnRIb3N0UmVzcG9uc2VGaWxlQ2hhbmdlc1Byb3ZpZGVyKGNvbm4sIGF1dGhvcml0eSwgKCkgPT4gYmFja2VuZFNlc3Npb24pKTtcblxuXHRcdGNvbm4uc2V0U3RhdGUoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSwgc2Vzc2lvblN0YXRlV2l0aFR1cm5TdXBwb3J0KCkpO1xuXHRcdGNvbm4uc2V0U3RhdGUodHVybkNoYW5nZXNldFVyaSgndDEnKSwge1xuXHRcdFx0c3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMuUmVhZHksXG5cdFx0XHRmaWxlczogW1xuXHRcdFx0XHR7IGlkOiAnMScsIGVkaXQ6IHsgYmVmb3JlOiB7IHVyaTogVVJJLmZpbGUoJy9yZXBvL2EudHMnKS50b1N0cmluZygpLCBjb250ZW50OiB7IHVyaTogJ2dpdC1ibG9iOi8vYS1iZWZvcmUnIH0gfSwgYWZ0ZXI6IHsgdXJpOiBVUkkuZmlsZSgnL3JlcG8vYS50cycpLnRvU3RyaW5nKCksIGNvbnRlbnQ6IHsgdXJpOiAnZ2l0LWJsb2I6Ly9hLWFmdGVyJyB9IH0sIGRpZmY6IHsgYWRkZWQ6IDMsIHJlbW92ZWQ6IDEgfSB9IH0sXG5cdFx0XHRcdHsgaWQ6ICcyJywgZWRpdDogeyBhZnRlcjogeyB1cmk6IFVSSS5maWxlKCcvcmVwby9iLnRzJykudG9TdHJpbmcoKSwgY29udGVudDogeyB1cmk6ICdnaXQtYmxvYjovL2ItYWZ0ZXInIH0gfSwgZGlmZjogeyBhZGRlZDogNSwgcmVtb3ZlZDogMCB9IH0gfSxcblx0XHRcdF0sXG5cdFx0fSBzYXRpc2ZpZXMgQ2hhbmdlc2V0U3RhdGUpO1xuXG5cdFx0Y29uc3QgeyBsYXRlc3QgfSA9IG9ic2VydmUocHJvdmlkZXIsIGRzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhdGVzdCgpLm1hcChkID0+ICh7XG5cdFx0XHRhZGRlZDogZC5hZGRlZCxcblx0XHRcdHJlbW92ZWQ6IGQucmVtb3ZlZCxcblx0XHRcdG1vZGlmaWVkOiBkLm1vZGlmaWVkVVJJLnBhdGgsXG5cdFx0XHQvLyBUaGUgUkhTIGRpZmYgY29udGVudCBpcyB0aGUgZnJvemVuIGFmdGVyLXR1cm4gc25hcHNob3QsIG5vdCB0aGUgbGl2ZSBmaWxlLlxuXHRcdFx0YWZ0ZXI6IGQubW9kaWZpZWRTbmFwc2hvdFVSSSAmJiBmcm9tQWdlbnRIb3N0VXJpKGQubW9kaWZpZWRTbmFwc2hvdFVSSSkuYXV0aG9yaXR5LFxuXHRcdH0pKSwgW1xuXHRcdFx0eyBhZGRlZDogMywgcmVtb3ZlZDogMSwgbW9kaWZpZWQ6ICcvcmVwby9hLnRzJywgYWZ0ZXI6ICdhLWFmdGVyJyB9LFxuXHRcdFx0eyBhZGRlZDogNSwgcmVtb3ZlZDogMCwgbW9kaWZpZWQ6ICcvcmVwby9iLnRzJywgYWZ0ZXI6ICdiLWFmdGVyJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyB0aGUgY2hhbmdlc2V0IHN1YnNjcmlwdGlvbiB3aGVuIHNlc3Npb24gc3RhdGUgdXBkYXRlcycsICgpID0+IHtcblx0XHRjb25zdCBkcyA9IHN0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGNvbm4gPSBuZXcgRmFrZUFnZW50Q29ubmVjdGlvbigpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZHMuYWRkKG5ldyBBZ2VudEhvc3RSZXNwb25zZUZpbGVDaGFuZ2VzUHJvdmlkZXIoY29ubiwgYXV0aG9yaXR5LCAoKSA9PiBiYWNrZW5kU2Vzc2lvbikpO1xuXG5cdFx0Y29ubi5zZXRTdGF0ZShiYWNrZW5kU2Vzc2lvbi50b1N0cmluZygpLCBzZXNzaW9uU3RhdGVXaXRoVHVyblN1cHBvcnQoKSk7XG5cdFx0Y29ubi5zZXRTdGF0ZSh0dXJuQ2hhbmdlc2V0VXJpKCd0MScpLCB7IHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLlJlYWR5LCBmaWxlczogW10gfSBzYXRpc2ZpZXMgQ2hhbmdlc2V0U3RhdGUpO1xuXHRcdG9ic2VydmUocHJvdmlkZXIsIGRzKTtcblx0XHRjb25zdCBzdWJzY3JpcHRpb25Db3VudEJlZm9yZVVwZGF0ZSA9IGNvbm4uZ2V0U3Vic2NyaXB0aW9uQ291bnQodHVybkNoYW5nZXNldFVyaSgndDEnKSk7XG5cblx0XHRjb25uLnNldFN0YXRlKGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCksIHNlc3Npb25TdGF0ZVdpdGhUdXJuU3VwcG9ydCgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0c3Vic2NyaXB0aW9uQ291bnRCZWZvcmVVcGRhdGUsXG5cdFx0XHRjb25uLmdldFN1YnNjcmlwdGlvbkNvdW50KHR1cm5DaGFuZ2VzZXRVcmkoJ3QxJykpLFxuXHRcdF0sIFsxLCAxXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcHMgdHVybiBmaWxlIGVkaXRzIGludG8gZW50cnkgZGlmZnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZHMgPSBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBjb25uID0gbmV3IEZha2VBZ2VudENvbm5lY3Rpb24oKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRzLmFkZChuZXcgQWdlbnRIb3N0UmVzcG9uc2VGaWxlQ2hhbmdlc1Byb3ZpZGVyKGNvbm4sIGF1dGhvcml0eSwgKCkgPT4gYmFja2VuZFNlc3Npb24pKTtcblx0XHRjb25zdCBkZWZhdWx0Q2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCkpKTtcblxuXHRcdGNvbm4uc2V0U3RhdGUoZGVmYXVsdENoYXRVcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0cmVzb3VyY2U6IGRlZmF1bHRDaGF0VXJpLnRvU3RyaW5nKCksXG5cdFx0XHR0aXRsZTogJ0NoYXQnLFxuXHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0dHVybnM6IFt7XG5cdFx0XHRcdGlkOiAndDEnLFxuXHRcdFx0XHRtZXNzYWdlOiB7fSxcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3tcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLFxuXHRcdFx0XHRcdHRvb2xDYWxsOiB7XG5cdFx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0XHRcdFx0dG9vbE5hbWU6ICd3cml0ZV9maWxlJyxcblx0XHRcdFx0XHRcdGRpc3BsYXlOYW1lOiAnV3JpdGUgRmlsZScsXG5cdFx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIGZpbGUnLFxuXHRcdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1dyb3RlIGZpbGUnLFxuXHRcdFx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0LFxuXHRcdFx0XHRcdFx0XHRhZnRlcjogeyB1cmk6IFVSSS5maWxlKCcvb3V0c2lkZS9SRUFETUUubWQnKS50b1N0cmluZygpLCBjb250ZW50OiB7IHVyaTogJ2dpdC1ibG9iOi8vcmVhZG1lLWFmdGVyJyB9IH0sXG5cdFx0XHRcdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDcsIHJlbW92ZWQ6IDAgfSxcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0fV0sXG5cdFx0fSBhcyB1bmtub3duIGFzIENoYXRTdGF0ZSk7XG5cblx0XHRjb25zdCBvYnMgPSBwcm92aWRlci5nZXRGaWxlRWRpdHNGb3JSZXF1ZXN0KGNoYXRSZXNvdXJjZSwgJ3QxJykhO1xuXHRcdGxldCBsYXRlc3Q6IHJlYWRvbmx5IElFZGl0U2Vzc2lvbkVudHJ5RGlmZltdID0gW107XG5cdFx0ZHMuYWRkKGF1dG9ydW4ociA9PiB7IGxhdGVzdCA9IG9icy5yZWFkKHIpOyB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhdGVzdC5tYXAoZGlmZiA9PiAoe1xuXHRcdFx0bW9kaWZpZWQ6IGZyb21BZ2VudEhvc3RVcmkoZGlmZi5tb2RpZmllZFVSSSkucGF0aCxcblx0XHRcdGFkZGVkOiBkaWZmLmFkZGVkLFxuXHRcdFx0cmVtb3ZlZDogZGlmZi5yZW1vdmVkLFxuXHRcdH0pKSwgW1xuXHRcdFx0eyBtb2RpZmllZDogJy9vdXRzaWRlL1JFQURNRS5tZCcsIGFkZGVkOiA3LCByZW1vdmVkOiAwIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgZW1wdHkgd2hlbiB0aGUgYWdlbnQgZG9lcyBub3QgYWR2ZXJ0aXNlIGEgdHVybiBjaGFuZ2VzZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZHMgPSBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBjb25uID0gbmV3IEZha2VBZ2VudENvbm5lY3Rpb24oKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRzLmFkZChuZXcgQWdlbnRIb3N0UmVzcG9uc2VGaWxlQ2hhbmdlc1Byb3ZpZGVyKGNvbm4sIGF1dGhvcml0eSwgKCkgPT4gYmFja2VuZFNlc3Npb24pKTtcblxuXHRcdGNvbm4uc2V0U3RhdGUoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSwgeyBjaGFuZ2VzZXRzOiBbeyBsYWJlbDogJ0FsbCcsIHVyaVRlbXBsYXRlOiBgJHtiYWNrZW5kU2Vzc2lvbn0vY2hhbmdlc2V0L3Nlc3Npb25gLCBjaGFuZ2VLaW5kOiAnc2Vzc2lvbicgfV0gfSBhcyB1bmtub3duIGFzIFNlc3Npb25TdGF0ZSk7XG5cblx0XHRjb25zdCB7IGxhdGVzdCB9ID0gb2JzZXJ2ZShwcm92aWRlciwgZHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGF0ZXN0KCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVtb2l6ZXMgdGhlIG9ic2VydmFibGUgcGVyIHJlcXVlc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZHMgPSBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBjb25uID0gbmV3IEZha2VBZ2VudENvbm5lY3Rpb24oKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRzLmFkZChuZXcgQWdlbnRIb3N0UmVzcG9uc2VGaWxlQ2hhbmdlc1Byb3ZpZGVyKGNvbm4sIGF1dGhvcml0eSwgKCkgPT4gYmFja2VuZFNlc3Npb24pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHByb3ZpZGVyLmdldENoYW5nZXNGb3JSZXF1ZXN0KGNoYXRSZXNvdXJjZSwgJ3QxJyksXG5cdFx0XHRwcm92aWRlci5nZXRDaGFuZ2VzRm9yUmVxdWVzdChjaGF0UmVzb3VyY2UsICd0MScpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiB0aGUgYmFja2VuZCBzZXNzaW9uIGNhbm5vdCBiZSByZXNvbHZlZCcsICgpID0+IHtcblx0XHRjb25zdCBkcyA9IHN0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGNvbm4gPSBuZXcgRmFrZUFnZW50Q29ubmVjdGlvbigpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZHMuYWRkKG5ldyBBZ2VudEhvc3RSZXNwb25zZUZpbGVDaGFuZ2VzUHJvdmlkZXIoY29ubiwgYXV0aG9yaXR5LCAoKSA9PiB1bmRlZmluZWQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRDaGFuZ2VzRm9yUmVxdWVzdChjaGF0UmVzb3VyY2UsICd0MScpLCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQW1DO0FBQzVDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsd0JBQXdCO0FBRWpDO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBRUE7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUlNO0FBRVAsU0FBUyw0Q0FBNEM7QUFFckQsTUFBTSw0QkFBNEIsS0FBdUIsRUFBRTtBQUFBLEVBQTNEO0FBQUE7QUFDQyxTQUFrQixXQUFXO0FBRTdCLFNBQWlCLFlBQVksb0JBQUksSUFBOEI7QUFDL0QsU0FBaUIsVUFBVSxvQkFBSSxJQUFxQjtBQUNwRCxTQUFpQixzQkFBc0Isb0JBQUksSUFBb0I7QUFBQTtBQUFBLEVBRS9ELFNBQVMsVUFBa0IsT0FBc0I7QUFDaEQsU0FBSyxRQUFRLElBQUksVUFBVSxLQUFLO0FBQ2hDLFNBQUssVUFBVSxJQUFJLFFBQVEsR0FBRyxLQUFLLEtBQUs7QUFBQSxFQUN6QztBQUFBLEVBRUEscUJBQXFCLFVBQTBCO0FBQzlDLFdBQU8sS0FBSyxvQkFBb0IsSUFBSSxRQUFRLEtBQUs7QUFBQSxFQUNsRDtBQUFBLEVBRVMsZ0JBQTJDLE9BQVUsVUFBZSxRQUF1RDtBQUNuSSxVQUFNLE1BQU0sU0FBUyxTQUFTO0FBQzlCLFNBQUssb0JBQW9CLElBQUksTUFBTSxLQUFLLG9CQUFvQixJQUFJLEdBQUcsS0FBSyxLQUFLLENBQUM7QUFDOUUsUUFBSSxVQUFVLEtBQUssVUFBVSxJQUFJLEdBQUc7QUFD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
