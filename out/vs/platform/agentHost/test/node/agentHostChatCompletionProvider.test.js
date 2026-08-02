import assert from "assert";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { CompletionItemKind } from "../../common/state/protocol/commands.js";
import { buildChatUri, buildDefaultChatUri, ChatInteractivity, ChatOriginKind, createChatState, createSessionState, MessageAttachmentKind, MessageKind, mergeSessionWithDefaultChat, SessionStatus, TurnState } from "../../common/state/sessionState.js";
import { AgentHostCompletions, CompletionTriggerCharacter } from "../../node/agentHostCompletions.js";
import { AgentHostChatCompletionProvider, extractChatToken } from "../../node/agentHostChatCompletionProvider.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
const SESSION_URI = "ahp-copilot://session-1";
const DEFAULT_CHAT_URI = buildDefaultChatUri(SESSION_URI);
function makeTurn(id) {
  return { id, message: { text: "", origin: { kind: MessageKind.User } }, responseParts: [], usage: void 0, state: TurnState.Complete };
}
function makeActiveTurn(id) {
  return { id, startedAt: (/* @__PURE__ */ new Date(0)).toISOString(), message: { text: "", origin: { kind: MessageKind.User } }, responseParts: [], usage: void 0 };
}
function makeChatSummary(resource, title, opts) {
  return {
    resource,
    title,
    status: SessionStatus.Idle,
    modifiedAt: opts?.modifiedAt ?? (/* @__PURE__ */ new Date(0)).toISOString(),
    origin: opts?.origin,
    interactivity: opts?.interactivity
  };
}
class FakeStateManager extends AgentHostStateManager {
  constructor(chats, defaultChat) {
    super(new NullLogService());
    this._fixtureChatStates = /* @__PURE__ */ new Map();
    const summary = {
      resource: SESSION_URI,
      provider: "copilot",
      title: "t",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString()
    };
    this._session = mergeSessionWithDefaultChat({ ...createSessionState(summary), chats: chats.map((c) => c.summary), defaultChat }, void 0);
    for (const chat of chats) {
      this._fixtureChatStates.set(chat.summary.resource, { ...createChatState(chat.summary), turns: [...chat.turns ?? []], activeTurn: chat.activeTurn });
    }
  }
  getSessionState() {
    return this._session;
  }
  getChatState(chat) {
    return this._fixtureChatStates.get(chat);
  }
  getDefaultChatState() {
    return this._fixtureChatStates.get(DEFAULT_CHAT_URI);
  }
}
suite("AgentHostChatCompletionProvider", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test('announces only "#" as a trigger character via IAgentHostCompletions', () => {
    const completions = disposables.add(new AgentHostCompletions(new NullLogService()));
    const stateManager = disposables.add(new FakeStateManager([]));
    disposables.add(completions.registerProvider(new AgentHostChatCompletionProvider(stateManager)));
    assert.deepStrictEqual([...completions.triggerCharacters], [CompletionTriggerCharacter.Hash]);
  });
  suite("extractChatToken", () => {
    test("extracts the title filter and range across the prefix lifecycle", () => {
      assert.deepStrictEqual(
        [
          extractChatToken("hello world", 5),
          // no '#'
          extractChatToken("ping #file", 10),
          // '#file' is not a chat token
          extractChatToken("ping #", 6),
          // bare '#': still could become #chat:
          extractChatToken("ping #ch", 8),
          // typing the 'chat:' prefix
          extractChatToken("ping #chat:", 11),
          // prefix complete, empty filter
          extractChatToken("ping #chat:Pla", 14),
          // filter typed
          extractChatToken("#CHAT:Pla", 9),
          // case-insensitive prefix
          extractChatToken("a#chat:x", 8),
          // '#' not preceded by whitespace
          extractChatToken("#chat:a b", 9)
          // whitespace terminates the token
        ],
        [
          void 0,
          void 0,
          { typed: "", rangeStart: 5, rangeEnd: 6 },
          { typed: "", rangeStart: 5, rangeEnd: 8 },
          { typed: "", rangeStart: 5, rangeEnd: 11 },
          { typed: "Pla", rangeStart: 5, rangeEnd: 14 },
          { typed: "Pla", rangeStart: 0, rangeEnd: 9 },
          void 0,
          void 0
        ]
      );
    });
  });
  suite("provideCompletionItems", () => {
    function run(stateManager, text, offset, channel = DEFAULT_CHAT_URI) {
      const provider = new AgentHostChatCompletionProvider(stateManager);
      return provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel, text, offset },
        CancellationToken.None
      );
    }
    test("returns [] when no chat token is being typed", async () => {
      const stateManager = disposables.add(new FakeStateManager([
        { summary: makeChatSummary(DEFAULT_CHAT_URI, "Default", { origin: { kind: ChatOriginKind.User } }), turns: [makeTurn("d1")] },
        { summary: makeChatSummary(buildChatUri(SESSION_URI, "c1"), "Planning"), turns: [makeTurn("c1-1")] }
      ]));
      assert.deepStrictEqual(await run(stateManager, "see #file", 9), []);
    });
    test("excludes current chat, subagent chats, hidden chats, and chats without a completed turn", async () => {
      const planningUri = buildChatUri(SESSION_URI, "planning");
      const stateManager = disposables.add(new FakeStateManager([
        // current chat (the default chat) — must never be listed
        { summary: makeChatSummary(DEFAULT_CHAT_URI, "Default", { origin: { kind: ChatOriginKind.User } }), turns: [makeTurn("d1")] },
        // a normal peer chat with two completed turns → endTurn is the last one
        { summary: makeChatSummary(planningUri, "Planning notes"), turns: [makeTurn("p1"), makeTurn("p2")] },
        // subagent chat spawned by a tool → excluded
        { summary: makeChatSummary(buildChatUri(SESSION_URI, "sub"), "Worker", { origin: { kind: ChatOriginKind.Tool, chat: DEFAULT_CHAT_URI, toolCallId: "tc1" } }), turns: [makeTurn("s1")] },
        // hidden worker chat → excluded
        { summary: makeChatSummary(buildChatUri(SESSION_URI, "hidden"), "Hidden", { interactivity: ChatInteractivity.Hidden }), turns: [makeTurn("h1")] },
        // only an active turn, no completed turn → skipped
        { summary: makeChatSummary(buildChatUri(SESSION_URI, "active"), "Active", { interactivity: ChatInteractivity.Full }), activeTurn: makeActiveTurn("a1") }
      ]));
      const result = await run(stateManager, "ref #chat:", 10);
      assert.deepStrictEqual(result, [{
        insertText: "#chat:Planning notes ",
        rangeStart: 4,
        rangeEnd: 10,
        attachment: {
          type: MessageAttachmentKind.Chat,
          resource: planningUri,
          endTurn: "p2",
          label: "Planning notes"
        }
      }]);
    });
    test("excludes the default chat when the channel is the session URI", async () => {
      const peerUri = buildChatUri(SESSION_URI, "peer");
      const stateManager = disposables.add(new FakeStateManager([
        { summary: makeChatSummary(DEFAULT_CHAT_URI, "Default", { origin: { kind: ChatOriginKind.User } }), turns: [makeTurn("d1")] },
        { summary: makeChatSummary(peerUri, "Peer"), turns: [makeTurn("e1")] }
      ]));
      const result = await run(stateManager, "#chat:", 6, SESSION_URI);
      assert.deepStrictEqual(result.map((i) => i.attachment), [{
        type: MessageAttachmentKind.Chat,
        resource: peerUri,
        endTurn: "e1",
        label: "Peer"
      }]);
    });
    test("filters by title (case-insensitive) and sorts newest first", async () => {
      const alpha = buildChatUri(SESSION_URI, "alpha");
      const beta = buildChatUri(SESSION_URI, "beta");
      const gamma = buildChatUri(SESSION_URI, "gamma");
      const stateManager = disposables.add(new FakeStateManager([
        { summary: makeChatSummary(DEFAULT_CHAT_URI, "Default", { origin: { kind: ChatOriginKind.User } }), turns: [makeTurn("d1")] },
        { summary: makeChatSummary(alpha, "Alpha review", { modifiedAt: "2025-01-01T00:00:00.000Z" }), turns: [makeTurn("a1")] },
        { summary: makeChatSummary(beta, "Beta review", { modifiedAt: "2025-03-01T00:00:00.000Z" }), turns: [makeTurn("b1")] },
        { summary: makeChatSummary(gamma, "Unrelated", { modifiedAt: "2025-06-01T00:00:00.000Z" }), turns: [makeTurn("g1")] }
      ]));
      const result = await run(stateManager, "#chat:review", 12);
      assert.deepStrictEqual(result.map((i) => i.attachment.label), ["Beta review", "Alpha review"]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0Q2hhdENvbXBsZXRpb25Qcm92aWRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uSXRlbUtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgYnVpbGRDaGF0VXJpLCBidWlsZERlZmF1bHRDaGF0VXJpLCBDaGF0SW50ZXJhY3Rpdml0eSwgQ2hhdE9yaWdpbktpbmQsIGNyZWF0ZUNoYXRTdGF0ZSwgY3JlYXRlU2Vzc2lvblN0YXRlLCBNZXNzYWdlQXR0YWNobWVudEtpbmQsIE1lc3NhZ2VLaW5kLCBtZXJnZVNlc3Npb25XaXRoRGVmYXVsdENoYXQsIFNlc3Npb25TdGF0dXMsIFR1cm5TdGF0ZSwgdHlwZSBBY3RpdmVUdXJuLCB0eXBlIENoYXRPcmlnaW4sIHR5cGUgQ2hhdFN0YXRlLCB0eXBlIENoYXRTdW1tYXJ5LCB0eXBlIElTZXNzaW9uV2l0aERlZmF1bHRDaGF0LCB0eXBlIFNlc3Npb25TdW1tYXJ5LCB0eXBlIFR1cm4sIHR5cGUgVVJJIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb21wbGV0aW9ucywgQ29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdENvbXBsZXRpb25zLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENoYXRDb21wbGV0aW9uUHJvdmlkZXIsIGV4dHJhY3RDaGF0VG9rZW4gfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdENoYXRDb21wbGV0aW9uUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuXG5jb25zdCBTRVNTSU9OX1VSSSA9ICdhaHAtY29waWxvdDovL3Nlc3Npb24tMSc7XG5jb25zdCBERUZBVUxUX0NIQVRfVVJJID0gYnVpbGREZWZhdWx0Q2hhdFVyaShTRVNTSU9OX1VSSSk7XG5cbmZ1bmN0aW9uIG1ha2VUdXJuKGlkOiBzdHJpbmcpOiBUdXJuIHtcblx0cmV0dXJuIHsgaWQsIG1lc3NhZ2U6IHsgdGV4dDogJycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSwgcmVzcG9uc2VQYXJ0czogW10sIHVzYWdlOiB1bmRlZmluZWQsIHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUgfTtcbn1cblxuZnVuY3Rpb24gbWFrZUFjdGl2ZVR1cm4oaWQ6IHN0cmluZyk6IEFjdGl2ZVR1cm4ge1xuXHRyZXR1cm4geyBpZCwgc3RhcnRlZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLCBtZXNzYWdlOiB7IHRleHQ6ICcnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sIHJlc3BvbnNlUGFydHM6IFtdLCB1c2FnZTogdW5kZWZpbmVkIH07XG59XG5cbmZ1bmN0aW9uIG1ha2VDaGF0U3VtbWFyeShyZXNvdXJjZTogc3RyaW5nLCB0aXRsZTogc3RyaW5nLCBvcHRzPzogeyBtb2RpZmllZEF0Pzogc3RyaW5nOyBvcmlnaW4/OiBDaGF0T3JpZ2luOyBpbnRlcmFjdGl2aXR5PzogQ2hhdEludGVyYWN0aXZpdHkgfSk6IENoYXRTdW1tYXJ5IHtcblx0cmV0dXJuIHtcblx0XHRyZXNvdXJjZSxcblx0XHR0aXRsZSxcblx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRtb2RpZmllZEF0OiBvcHRzPy5tb2RpZmllZEF0ID8/IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCksXG5cdFx0b3JpZ2luOiBvcHRzPy5vcmlnaW4sXG5cdFx0aW50ZXJhY3Rpdml0eTogb3B0cz8uaW50ZXJhY3Rpdml0eSxcblx0fTtcbn1cblxuLyoqXG4gKiBBIGZpeHR1cmUgY2hhdDogaXRzIGNhdGFsb2cgc3VtbWFyeSBwbHVzIHRoZSBjb21wbGV0ZWQvYWN0aXZlIHR1cm5zIG9mIGl0c1xuICoge0BsaW5rIENoYXRTdGF0ZX0uXG4gKi9cbmludGVyZmFjZSBJRml4dHVyZUNoYXQge1xuXHRyZWFkb25seSBzdW1tYXJ5OiBDaGF0U3VtbWFyeTtcblx0cmVhZG9ubHkgdHVybnM/OiByZWFkb25seSBUdXJuW107XG5cdHJlYWRvbmx5IGFjdGl2ZVR1cm4/OiBBY3RpdmVUdXJuO1xufVxuXG4vKipcbiAqIEEgbWluaW1hbCB7QGxpbmsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyfSB0aGF0IHNlcnZlcyBjb250cm9sbGVkIGZpeHR1cmVzIGZvclxuICogdGhlIHRocmVlIHJlYWQgbWV0aG9kcyB0aGUgcHJvdmlkZXIgdXNlcy4gRXZlcnkgY2hhdCBzdGF0ZSAoZGVmYXVsdCBhbmQgcGVlcilcbiAqIGlzIGtleWVkIGJ5IGl0cyByZXNvdXJjZSBpbiBvbmUgbWFwLCBzbyBgZ2V0Q2hhdFN0YXRlYCByZXNvbHZlcyB0aGVtIGFsbC5cbiAqL1xuY2xhc3MgRmFrZVN0YXRlTWFuYWdlciBleHRlbmRzIEFnZW50SG9zdFN0YXRlTWFuYWdlciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb246IElTZXNzaW9uV2l0aERlZmF1bHRDaGF0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maXh0dXJlQ2hhdFN0YXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBDaGF0U3RhdGU+KCk7XG5cblx0Y29uc3RydWN0b3IoY2hhdHM6IHJlYWRvbmx5IElGaXh0dXJlQ2hhdFtdLCBkZWZhdWx0Q2hhdD86IHN0cmluZykge1xuXHRcdHN1cGVyKG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBzdW1tYXJ5OiBTZXNzaW9uU3VtbWFyeSA9IHtcblx0XHRcdHJlc291cmNlOiBTRVNTSU9OX1VSSSxcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHR0aXRsZTogJ3QnLFxuXHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdH07XG5cdFx0dGhpcy5fc2Vzc2lvbiA9IG1lcmdlU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCh7IC4uLmNyZWF0ZVNlc3Npb25TdGF0ZShzdW1tYXJ5KSwgY2hhdHM6IGNoYXRzLm1hcChjID0+IGMuc3VtbWFyeSksIGRlZmF1bHRDaGF0IH0sIHVuZGVmaW5lZCk7XG5cdFx0Zm9yIChjb25zdCBjaGF0IG9mIGNoYXRzKSB7XG5cdFx0XHR0aGlzLl9maXh0dXJlQ2hhdFN0YXRlcy5zZXQoY2hhdC5zdW1tYXJ5LnJlc291cmNlLCB7IC4uLmNyZWF0ZUNoYXRTdGF0ZShjaGF0LnN1bW1hcnkpLCB0dXJuczogWy4uLihjaGF0LnR1cm5zID8/IFtdKV0sIGFjdGl2ZVR1cm46IGNoYXQuYWN0aXZlVHVybiB9KTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBnZXRTZXNzaW9uU3RhdGUoKTogSVNlc3Npb25XaXRoRGVmYXVsdENoYXQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0Q2hhdFN0YXRlKGNoYXQ6IFVSSSk6IENoYXRTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZpeHR1cmVDaGF0U3RhdGVzLmdldChjaGF0KTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldERlZmF1bHRDaGF0U3RhdGUoKTogQ2hhdFN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZml4dHVyZUNoYXRTdGF0ZXMuZ2V0KERFRkFVTFRfQ0hBVF9VUkkpO1xuXHR9XG59XG5cbnN1aXRlKCdBZ2VudEhvc3RDaGF0Q29tcGxldGlvblByb3ZpZGVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5jbGVhcigpKTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYW5ub3VuY2VzIG9ubHkgXCIjXCIgYXMgYSB0cmlnZ2VyIGNoYXJhY3RlciB2aWEgSUFnZW50SG9zdENvbXBsZXRpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbXBsZXRpb25zID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RDb21wbGV0aW9ucyhuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmFrZVN0YXRlTWFuYWdlcihbXSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjb21wbGV0aW9ucy5yZWdpc3RlclByb3ZpZGVyKG5ldyBBZ2VudEhvc3RDaGF0Q29tcGxldGlvblByb3ZpZGVyKHN0YXRlTWFuYWdlcikpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5jb21wbGV0aW9ucy50cmlnZ2VyQ2hhcmFjdGVyc10sIFtDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3Rlci5IYXNoXSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdleHRyYWN0Q2hhdFRva2VuJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2V4dHJhY3RzIHRoZSB0aXRsZSBmaWx0ZXIgYW5kIHJhbmdlIGFjcm9zcyB0aGUgcHJlZml4IGxpZmVjeWNsZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRleHRyYWN0Q2hhdFRva2VuKCdoZWxsbyB3b3JsZCcsIDUpLCAgICAgICAgICAvLyBubyAnIydcblx0XHRcdFx0XHRleHRyYWN0Q2hhdFRva2VuKCdwaW5nICNmaWxlJywgMTApLCAgICAgICAgICAvLyAnI2ZpbGUnIGlzIG5vdCBhIGNoYXQgdG9rZW5cblx0XHRcdFx0XHRleHRyYWN0Q2hhdFRva2VuKCdwaW5nICMnLCA2KSwgICAgICAgICAgICAgICAvLyBiYXJlICcjJzogc3RpbGwgY291bGQgYmVjb21lICNjaGF0OlxuXHRcdFx0XHRcdGV4dHJhY3RDaGF0VG9rZW4oJ3BpbmcgI2NoJywgOCksICAgICAgICAgICAgIC8vIHR5cGluZyB0aGUgJ2NoYXQ6JyBwcmVmaXhcblx0XHRcdFx0XHRleHRyYWN0Q2hhdFRva2VuKCdwaW5nICNjaGF0OicsIDExKSwgICAgICAgICAvLyBwcmVmaXggY29tcGxldGUsIGVtcHR5IGZpbHRlclxuXHRcdFx0XHRcdGV4dHJhY3RDaGF0VG9rZW4oJ3BpbmcgI2NoYXQ6UGxhJywgMTQpLCAgICAgIC8vIGZpbHRlciB0eXBlZFxuXHRcdFx0XHRcdGV4dHJhY3RDaGF0VG9rZW4oJyNDSEFUOlBsYScsIDkpLCAgICAgICAgICAgIC8vIGNhc2UtaW5zZW5zaXRpdmUgcHJlZml4XG5cdFx0XHRcdFx0ZXh0cmFjdENoYXRUb2tlbignYSNjaGF0OngnLCA4KSwgICAgICAgICAgICAgLy8gJyMnIG5vdCBwcmVjZWRlZCBieSB3aGl0ZXNwYWNlXG5cdFx0XHRcdFx0ZXh0cmFjdENoYXRUb2tlbignI2NoYXQ6YSBiJywgOSksICAgICAgICAgICAgLy8gd2hpdGVzcGFjZSB0ZXJtaW5hdGVzIHRoZSB0b2tlblxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHR7IHR5cGVkOiAnJywgcmFuZ2VTdGFydDogNSwgcmFuZ2VFbmQ6IDYgfSxcblx0XHRcdFx0XHR7IHR5cGVkOiAnJywgcmFuZ2VTdGFydDogNSwgcmFuZ2VFbmQ6IDggfSxcblx0XHRcdFx0XHR7IHR5cGVkOiAnJywgcmFuZ2VTdGFydDogNSwgcmFuZ2VFbmQ6IDExIH0sXG5cdFx0XHRcdFx0eyB0eXBlZDogJ1BsYScsIHJhbmdlU3RhcnQ6IDUsIHJhbmdlRW5kOiAxNCB9LFxuXHRcdFx0XHRcdHsgdHlwZWQ6ICdQbGEnLCByYW5nZVN0YXJ0OiAwLCByYW5nZUVuZDogOSB9LFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdF0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncHJvdmlkZUNvbXBsZXRpb25JdGVtcycsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIHJ1bihzdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlciwgdGV4dDogc3RyaW5nLCBvZmZzZXQ6IG51bWJlciwgY2hhbm5lbCA9IERFRkFVTFRfQ0hBVF9VUkkpIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IEFnZW50SG9zdENoYXRDb21wbGV0aW9uUHJvdmlkZXIoc3RhdGVNYW5hZ2VyKTtcblx0XHRcdHJldHVybiBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKFxuXHRcdFx0XHR7IGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Vc2VyTWVzc2FnZSwgY2hhbm5lbCwgdGV4dCwgb2Zmc2V0IH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3JldHVybnMgW10gd2hlbiBubyBjaGF0IHRva2VuIGlzIGJlaW5nIHR5cGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGYWtlU3RhdGVNYW5hZ2VyKFtcblx0XHRcdFx0eyBzdW1tYXJ5OiBtYWtlQ2hhdFN1bW1hcnkoREVGQVVMVF9DSEFUX1VSSSwgJ0RlZmF1bHQnLCB7IG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5Vc2VyIH0gfSksIHR1cm5zOiBbbWFrZVR1cm4oJ2QxJyldIH0sXG5cdFx0XHRcdHsgc3VtbWFyeTogbWFrZUNoYXRTdW1tYXJ5KGJ1aWxkQ2hhdFVyaShTRVNTSU9OX1VSSSwgJ2MxJyksICdQbGFubmluZycpLCB0dXJuczogW21ha2VUdXJuKCdjMS0xJyldIH0sXG5cdFx0XHRdKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHJ1bihzdGF0ZU1hbmFnZXIsICdzZWUgI2ZpbGUnLCA5KSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhjbHVkZXMgY3VycmVudCBjaGF0LCBzdWJhZ2VudCBjaGF0cywgaGlkZGVuIGNoYXRzLCBhbmQgY2hhdHMgd2l0aG91dCBhIGNvbXBsZXRlZCB0dXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGxhbm5pbmdVcmkgPSBidWlsZENoYXRVcmkoU0VTU0lPTl9VUkksICdwbGFubmluZycpO1xuXHRcdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGYWtlU3RhdGVNYW5hZ2VyKFtcblx0XHRcdFx0Ly8gY3VycmVudCBjaGF0ICh0aGUgZGVmYXVsdCBjaGF0KSBcdTIwMTQgbXVzdCBuZXZlciBiZSBsaXN0ZWRcblx0XHRcdFx0eyBzdW1tYXJ5OiBtYWtlQ2hhdFN1bW1hcnkoREVGQVVMVF9DSEFUX1VSSSwgJ0RlZmF1bHQnLCB7IG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5Vc2VyIH0gfSksIHR1cm5zOiBbbWFrZVR1cm4oJ2QxJyldIH0sXG5cdFx0XHRcdC8vIGEgbm9ybWFsIHBlZXIgY2hhdCB3aXRoIHR3byBjb21wbGV0ZWQgdHVybnMgXHUyMTkyIGVuZFR1cm4gaXMgdGhlIGxhc3Qgb25lXG5cdFx0XHRcdHsgc3VtbWFyeTogbWFrZUNoYXRTdW1tYXJ5KHBsYW5uaW5nVXJpLCAnUGxhbm5pbmcgbm90ZXMnKSwgdHVybnM6IFttYWtlVHVybigncDEnKSwgbWFrZVR1cm4oJ3AyJyldIH0sXG5cdFx0XHRcdC8vIHN1YmFnZW50IGNoYXQgc3Bhd25lZCBieSBhIHRvb2wgXHUyMTkyIGV4Y2x1ZGVkXG5cdFx0XHRcdHsgc3VtbWFyeTogbWFrZUNoYXRTdW1tYXJ5KGJ1aWxkQ2hhdFVyaShTRVNTSU9OX1VSSSwgJ3N1YicpLCAnV29ya2VyJywgeyBvcmlnaW46IHsga2luZDogQ2hhdE9yaWdpbktpbmQuVG9vbCwgY2hhdDogREVGQVVMVF9DSEFUX1VSSSwgdG9vbENhbGxJZDogJ3RjMScgfSB9KSwgdHVybnM6IFttYWtlVHVybignczEnKV0gfSxcblx0XHRcdFx0Ly8gaGlkZGVuIHdvcmtlciBjaGF0IFx1MjE5MiBleGNsdWRlZFxuXHRcdFx0XHR7IHN1bW1hcnk6IG1ha2VDaGF0U3VtbWFyeShidWlsZENoYXRVcmkoU0VTU0lPTl9VUkksICdoaWRkZW4nKSwgJ0hpZGRlbicsIHsgaW50ZXJhY3Rpdml0eTogQ2hhdEludGVyYWN0aXZpdHkuSGlkZGVuIH0pLCB0dXJuczogW21ha2VUdXJuKCdoMScpXSB9LFxuXHRcdFx0XHQvLyBvbmx5IGFuIGFjdGl2ZSB0dXJuLCBubyBjb21wbGV0ZWQgdHVybiBcdTIxOTIgc2tpcHBlZFxuXHRcdFx0XHR7IHN1bW1hcnk6IG1ha2VDaGF0U3VtbWFyeShidWlsZENoYXRVcmkoU0VTU0lPTl9VUkksICdhY3RpdmUnKSwgJ0FjdGl2ZScsIHsgaW50ZXJhY3Rpdml0eTogQ2hhdEludGVyYWN0aXZpdHkuRnVsbCB9KSwgYWN0aXZlVHVybjogbWFrZUFjdGl2ZVR1cm4oJ2ExJykgfSxcblx0XHRcdF0pKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuKHN0YXRlTWFuYWdlciwgJ3JlZiAjY2hhdDonLCAxMCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbe1xuXHRcdFx0XHRpbnNlcnRUZXh0OiAnI2NoYXQ6UGxhbm5pbmcgbm90ZXMgJyxcblx0XHRcdFx0cmFuZ2VTdGFydDogNCxcblx0XHRcdFx0cmFuZ2VFbmQ6IDEwLFxuXHRcdFx0XHRhdHRhY2htZW50OiB7XG5cdFx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkNoYXQsXG5cdFx0XHRcdFx0cmVzb3VyY2U6IHBsYW5uaW5nVXJpLFxuXHRcdFx0XHRcdGVuZFR1cm46ICdwMicsXG5cdFx0XHRcdFx0bGFiZWw6ICdQbGFubmluZyBub3RlcycsXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGNsdWRlcyB0aGUgZGVmYXVsdCBjaGF0IHdoZW4gdGhlIGNoYW5uZWwgaXMgdGhlIHNlc3Npb24gVVJJJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGVlclVyaSA9IGJ1aWxkQ2hhdFVyaShTRVNTSU9OX1VSSSwgJ3BlZXInKTtcblx0XHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmFrZVN0YXRlTWFuYWdlcihbXG5cdFx0XHRcdHsgc3VtbWFyeTogbWFrZUNoYXRTdW1tYXJ5KERFRkFVTFRfQ0hBVF9VUkksICdEZWZhdWx0JywgeyBvcmlnaW46IHsga2luZDogQ2hhdE9yaWdpbktpbmQuVXNlciB9IH0pLCB0dXJuczogW21ha2VUdXJuKCdkMScpXSB9LFxuXHRcdFx0XHR7IHN1bW1hcnk6IG1ha2VDaGF0U3VtbWFyeShwZWVyVXJpLCAnUGVlcicpLCB0dXJuczogW21ha2VUdXJuKCdlMScpXSB9LFxuXHRcdFx0XSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuKHN0YXRlTWFuYWdlciwgJyNjaGF0OicsIDYsIFNFU1NJT05fVVJJKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChpID0+IGkuYXR0YWNobWVudCksIFt7XG5cdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5DaGF0LFxuXHRcdFx0XHRyZXNvdXJjZTogcGVlclVyaSxcblx0XHRcdFx0ZW5kVHVybjogJ2UxJyxcblx0XHRcdFx0bGFiZWw6ICdQZWVyJyxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbHRlcnMgYnkgdGl0bGUgKGNhc2UtaW5zZW5zaXRpdmUpIGFuZCBzb3J0cyBuZXdlc3QgZmlyc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhbHBoYSA9IGJ1aWxkQ2hhdFVyaShTRVNTSU9OX1VSSSwgJ2FscGhhJyk7XG5cdFx0XHRjb25zdCBiZXRhID0gYnVpbGRDaGF0VXJpKFNFU1NJT05fVVJJLCAnYmV0YScpO1xuXHRcdFx0Y29uc3QgZ2FtbWEgPSBidWlsZENoYXRVcmkoU0VTU0lPTl9VUkksICdnYW1tYScpO1xuXHRcdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGYWtlU3RhdGVNYW5hZ2VyKFtcblx0XHRcdFx0eyBzdW1tYXJ5OiBtYWtlQ2hhdFN1bW1hcnkoREVGQVVMVF9DSEFUX1VSSSwgJ0RlZmF1bHQnLCB7IG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5Vc2VyIH0gfSksIHR1cm5zOiBbbWFrZVR1cm4oJ2QxJyldIH0sXG5cdFx0XHRcdHsgc3VtbWFyeTogbWFrZUNoYXRTdW1tYXJ5KGFscGhhLCAnQWxwaGEgcmV2aWV3JywgeyBtb2RpZmllZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyB9KSwgdHVybnM6IFttYWtlVHVybignYTEnKV0gfSxcblx0XHRcdFx0eyBzdW1tYXJ5OiBtYWtlQ2hhdFN1bW1hcnkoYmV0YSwgJ0JldGEgcmV2aWV3JywgeyBtb2RpZmllZEF0OiAnMjAyNS0wMy0wMVQwMDowMDowMC4wMDBaJyB9KSwgdHVybnM6IFttYWtlVHVybignYjEnKV0gfSxcblx0XHRcdFx0eyBzdW1tYXJ5OiBtYWtlQ2hhdFN1bW1hcnkoZ2FtbWEsICdVbnJlbGF0ZWQnLCB7IG1vZGlmaWVkQXQ6ICcyMDI1LTA2LTAxVDAwOjAwOjAwLjAwMFonIH0pLCB0dXJuczogW21ha2VUdXJuKCdnMScpXSB9LFxuXHRcdFx0XSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuKHN0YXRlTWFuYWdlciwgJyNjaGF0OnJldmlldycsIDEyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChpID0+IGkuYXR0YWNobWVudC5sYWJlbCksIFsnQmV0YSByZXZpZXcnLCAnQWxwaGEgcmV2aWV3J10pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NB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
