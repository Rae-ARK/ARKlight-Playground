import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { MessageKind, ResponsePartKind, TurnState } from "../../common/state/sessionState.js";
import { buildSideChatSourceContext, decodeProviderData, encodeProviderData, injectSideChatContext, prepareSideChatPrompt, stripSideChatContext } from "../../node/agentPeerChats.js";
suite("agentPeerChats", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const sourceTurn = {
    id: "source-turn",
    state: TurnState.Complete,
    message: { text: "source question", origin: { kind: MessageKind.User } },
    responseParts: [],
    usage: void 0
  };
  const sideChat = {
    source: "ahp-chat://default/source",
    turnId: sourceTurn.id,
    inheritedTurnCount: 1
  };
  const countOccurrences = (value, needle) => value.split(needle).length - 1;
  test("first prompt prefers explanation and remains hidden from visible history", () => {
    const prepared = prepareSideChatPrompt("What is happening?", [sourceTurn], sideChat);
    const visible = stripSideChatContext([{
      ...sourceTurn,
      id: "side-turn",
      message: { ...sourceTurn.message, text: prepared }
    }], sideChat);
    assert.deepStrictEqual({
      hasGuidance: prepared.includes("Prefer explanation over action; do not make changes or carry out work unless the user explicitly asks."),
      visiblePrompt: visible[0]?.message.text
    }, {
      hasGuidance: true,
      visiblePrompt: "What is happening?"
    });
  });
  test("later prompts are not wrapped again", () => {
    const existingSideTurn = {
      ...sourceTurn,
      id: "side-turn",
      message: { ...sourceTurn.message, text: "What is happening?" }
    };
    assert.strictEqual(prepareSideChatPrompt("Follow up", [sourceTurn, existingSideTurn], sideChat), "Follow up");
  });
  test("injects selected text exactly once and keeps it out of visible history", () => {
    const selectedText = "  selected text  ";
    const prepared = prepareSideChatPrompt("Explain the branch", [sourceTurn], {
      ...sideChat,
      selection: { text: selectedText }
    });
    const visible = stripSideChatContext([{
      ...sourceTurn,
      id: "side-turn",
      message: { ...sourceTurn.message, text: prepared }
    }], sideChat);
    assert.deepStrictEqual({
      selectedTextCount: countOccurrences(prepared, "Selected text:"),
      includesExactSelection: prepared.includes(selectedText),
      visiblePrompt: visible[0]?.message.text
    }, {
      selectedTextCount: 1,
      includesExactSelection: true,
      visiblePrompt: "Explain the branch"
    });
  });
  test("captures the first active user message even without completed turns", () => {
    assert.strictEqual(buildSideChatSourceContext([], {
      id: "active",
      message: { text: "current question", origin: { kind: MessageKind.User } },
      responseParts: [],
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      usage: void 0
    }), "User request:\ncurrent question");
  });
  test("captures completed context before an active turn", () => {
    assert.strictEqual(buildSideChatSourceContext([{
      ...sourceTurn,
      responseParts: [{ kind: ResponsePartKind.Markdown, id: "source-md", content: "source answer" }]
    }], {
      id: "active",
      message: { text: "follow-up question", origin: { kind: MessageKind.User } },
      responseParts: [],
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      usage: void 0
    }), "User request:\nsource question\n\nAgent response:\nsource answer\n\n---\n\nUser request:\nfollow-up question");
  });
  test("does not duplicate active source context when the inherited transcript already contains the source turn", () => {
    const partialResponse = "partial answer";
    const prepared = prepareSideChatPrompt("Explain the branch", [{
      id: "active-turn",
      state: TurnState.Complete,
      message: { text: "current question", origin: { kind: MessageKind.User } },
      responseParts: [{ kind: ResponsePartKind.Markdown, id: "active-md", content: partialResponse }],
      usage: void 0
    }], {
      source: "ahp-chat://default/source",
      turnId: "active-turn",
      inheritedTurnCount: 1,
      context: "User request:\ncurrent question",
      partialResponse
    });
    assert.strictEqual(prepared, injectSideChatContext("Explain the branch"));
  });
  test("injects active source context exactly once when the inherited transcript is missing the source turn", () => {
    const sourceContext = "User request:\nsource question\n\nAgent response:\nsource answer\n\n---\n\nUser request:\ncurrent question";
    const partialResponse = "partial answer";
    const prepared = prepareSideChatPrompt("Explain the branch", [{
      ...sourceTurn,
      responseParts: [{ kind: ResponsePartKind.Markdown, id: "source-md", content: "source answer" }]
    }], {
      source: "ahp-chat://default/source",
      turnId: "active-turn",
      inheritedTurnCount: 1,
      context: sourceContext,
      partialResponse
    });
    assert.deepStrictEqual({
      prepared,
      activeQuestionCount: countOccurrences(prepared, "User request:\ncurrent question"),
      partialResponseCount: countOccurrences(prepared, partialResponse)
    }, {
      prepared: injectSideChatContext("Explain the branch", partialResponse, sourceContext),
      activeQuestionCount: 1,
      partialResponseCount: 1
    });
  });
  test("injects completed local-turn context even when the inherited transcript already contains the concrete provider anchor", () => {
    const sourceContext = "User request:\nsource question\n\nAgent response:\nsource answer\n\n---\n\nUser request:\n!command";
    const localSideChat = {
      source: "ahp-chat://default/source",
      turnId: "local-turn",
      providerAnchorTurnId: sourceTurn.id,
      inheritedTurnCount: 1,
      context: sourceContext
    };
    const prepared = prepareSideChatPrompt("Explain the branch", [sourceTurn], localSideChat);
    assert.deepStrictEqual({
      prepared,
      localQuestionCount: countOccurrences(prepared, "User request:\n!command"),
      sourceQuestionCount: countOccurrences(prepared, "User request:\nsource question")
    }, {
      prepared: injectSideChatContext("Explain the branch", void 0, sourceContext),
      localQuestionCount: 1,
      sourceQuestionCount: 1
    });
  });
  test("strips hidden context even when the source text contains the legacy delimiter", () => {
    const prepared = prepareSideChatPrompt("Visible prompt", [], {
      ...sideChat,
      context: `User request:
contains ${"</side-chat-context>"}

Agent response:
ready`
    });
    const visible = stripSideChatContext([{
      ...sourceTurn,
      id: "side-turn",
      message: { ...sourceTurn.message, text: prepared }
    }], sideChat);
    assert.strictEqual(visible[0]?.message.text, "Visible prompt");
  });
  test("round-trips side-chat selection through provider data", () => {
    const providerData = encodeProviderData({
      sdkSessionId: "sdk-session",
      sideChat: {
        ...sideChat,
        selection: { text: "  selected text  ", responsePartId: "response-part-1" }
      }
    });
    assert.deepStrictEqual(decodeProviderData(providerData)?.sideChat?.selection, {
      text: "  selected text  ",
      responsePartId: "response-part-1"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRQZWVyQ2hhdHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUtpbmQsIFJlc3BvbnNlUGFydEtpbmQsIFR1cm5TdGF0ZSwgdHlwZSBUdXJuIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBidWlsZFNpZGVDaGF0U291cmNlQ29udGV4dCwgZGVjb2RlUHJvdmlkZXJEYXRhLCBlbmNvZGVQcm92aWRlckRhdGEsIGluamVjdFNpZGVDaGF0Q29udGV4dCwgcHJlcGFyZVNpZGVDaGF0UHJvbXB0LCBzdHJpcFNpZGVDaGF0Q29udGV4dCwgdHlwZSBJUGVyc2lzdGVkU2lkZUNoYXQgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50UGVlckNoYXRzLmpzJztcblxuc3VpdGUoJ2FnZW50UGVlckNoYXRzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHNvdXJjZVR1cm46IFR1cm4gPSB7XG5cdFx0aWQ6ICdzb3VyY2UtdHVybicsXG5cdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRtZXNzYWdlOiB7IHRleHQ6ICdzb3VyY2UgcXVlc3Rpb24nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0cmVzcG9uc2VQYXJ0czogW10sXG5cdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0fTtcblx0Y29uc3Qgc2lkZUNoYXQ6IElQZXJzaXN0ZWRTaWRlQ2hhdCA9IHtcblx0XHRzb3VyY2U6ICdhaHAtY2hhdDovL2RlZmF1bHQvc291cmNlJyxcblx0XHR0dXJuSWQ6IHNvdXJjZVR1cm4uaWQsXG5cdFx0aW5oZXJpdGVkVHVybkNvdW50OiAxLFxuXHR9O1xuXG5cdGNvbnN0IGNvdW50T2NjdXJyZW5jZXMgPSAodmFsdWU6IHN0cmluZywgbmVlZGxlOiBzdHJpbmcpID0+IHZhbHVlLnNwbGl0KG5lZWRsZSkubGVuZ3RoIC0gMTtcblxuXHR0ZXN0KCdmaXJzdCBwcm9tcHQgcHJlZmVycyBleHBsYW5hdGlvbiBhbmQgcmVtYWlucyBoaWRkZW4gZnJvbSB2aXNpYmxlIGhpc3RvcnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBwcmVwYXJlU2lkZUNoYXRQcm9tcHQoJ1doYXQgaXMgaGFwcGVuaW5nPycsIFtzb3VyY2VUdXJuXSwgc2lkZUNoYXQpO1xuXHRcdGNvbnN0IHZpc2libGUgPSBzdHJpcFNpZGVDaGF0Q29udGV4dChbe1xuXHRcdFx0Li4uc291cmNlVHVybixcblx0XHRcdGlkOiAnc2lkZS10dXJuJyxcblx0XHRcdG1lc3NhZ2U6IHsgLi4uc291cmNlVHVybi5tZXNzYWdlLCB0ZXh0OiBwcmVwYXJlZCB9LFxuXHRcdH1dLCBzaWRlQ2hhdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhhc0d1aWRhbmNlOiBwcmVwYXJlZC5pbmNsdWRlcygnUHJlZmVyIGV4cGxhbmF0aW9uIG92ZXIgYWN0aW9uOyBkbyBub3QgbWFrZSBjaGFuZ2VzIG9yIGNhcnJ5IG91dCB3b3JrIHVubGVzcyB0aGUgdXNlciBleHBsaWNpdGx5IGFza3MuJyksXG5cdFx0XHR2aXNpYmxlUHJvbXB0OiB2aXNpYmxlWzBdPy5tZXNzYWdlLnRleHQsXG5cdFx0fSwge1xuXHRcdFx0aGFzR3VpZGFuY2U6IHRydWUsXG5cdFx0XHR2aXNpYmxlUHJvbXB0OiAnV2hhdCBpcyBoYXBwZW5pbmc/Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGF0ZXIgcHJvbXB0cyBhcmUgbm90IHdyYXBwZWQgYWdhaW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXhpc3RpbmdTaWRlVHVybjogVHVybiA9IHtcblx0XHRcdC4uLnNvdXJjZVR1cm4sXG5cdFx0XHRpZDogJ3NpZGUtdHVybicsXG5cdFx0XHRtZXNzYWdlOiB7IC4uLnNvdXJjZVR1cm4ubWVzc2FnZSwgdGV4dDogJ1doYXQgaXMgaGFwcGVuaW5nPycgfSxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmVTaWRlQ2hhdFByb21wdCgnRm9sbG93IHVwJywgW3NvdXJjZVR1cm4sIGV4aXN0aW5nU2lkZVR1cm5dLCBzaWRlQ2hhdCksICdGb2xsb3cgdXAnKTtcblx0fSk7XG5cblx0dGVzdCgnaW5qZWN0cyBzZWxlY3RlZCB0ZXh0IGV4YWN0bHkgb25jZSBhbmQga2VlcHMgaXQgb3V0IG9mIHZpc2libGUgaGlzdG9yeScsICgpID0+IHtcblx0XHRjb25zdCBzZWxlY3RlZFRleHQgPSAnICBzZWxlY3RlZCB0ZXh0ICAnO1xuXHRcdGNvbnN0IHByZXBhcmVkID0gcHJlcGFyZVNpZGVDaGF0UHJvbXB0KCdFeHBsYWluIHRoZSBicmFuY2gnLCBbc291cmNlVHVybl0sIHtcblx0XHRcdC4uLnNpZGVDaGF0LFxuXHRcdFx0c2VsZWN0aW9uOiB7IHRleHQ6IHNlbGVjdGVkVGV4dCB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHZpc2libGUgPSBzdHJpcFNpZGVDaGF0Q29udGV4dChbe1xuXHRcdFx0Li4uc291cmNlVHVybixcblx0XHRcdGlkOiAnc2lkZS10dXJuJyxcblx0XHRcdG1lc3NhZ2U6IHsgLi4uc291cmNlVHVybi5tZXNzYWdlLCB0ZXh0OiBwcmVwYXJlZCB9LFxuXHRcdH1dLCBzaWRlQ2hhdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlbGVjdGVkVGV4dENvdW50OiBjb3VudE9jY3VycmVuY2VzKHByZXBhcmVkLCAnU2VsZWN0ZWQgdGV4dDonKSxcblx0XHRcdGluY2x1ZGVzRXhhY3RTZWxlY3Rpb246IHByZXBhcmVkLmluY2x1ZGVzKHNlbGVjdGVkVGV4dCksXG5cdFx0XHR2aXNpYmxlUHJvbXB0OiB2aXNpYmxlWzBdPy5tZXNzYWdlLnRleHQsXG5cdFx0fSwge1xuXHRcdFx0c2VsZWN0ZWRUZXh0Q291bnQ6IDEsXG5cdFx0XHRpbmNsdWRlc0V4YWN0U2VsZWN0aW9uOiB0cnVlLFxuXHRcdFx0dmlzaWJsZVByb21wdDogJ0V4cGxhaW4gdGhlIGJyYW5jaCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhcHR1cmVzIHRoZSBmaXJzdCBhY3RpdmUgdXNlciBtZXNzYWdlIGV2ZW4gd2l0aG91dCBjb21wbGV0ZWQgdHVybnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1aWxkU2lkZUNoYXRTb3VyY2VDb250ZXh0KFtdLCB7XG5cdFx0XHRpZDogJ2FjdGl2ZScsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdjdXJyZW50IHF1ZXN0aW9uJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0cmVzcG9uc2VQYXJ0czogW10sXG5cdFx0XHRzdGFydGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0fSksICdVc2VyIHJlcXVlc3Q6XFxuY3VycmVudCBxdWVzdGlvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYXB0dXJlcyBjb21wbGV0ZWQgY29udGV4dCBiZWZvcmUgYW4gYWN0aXZlIHR1cm4nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1aWxkU2lkZUNoYXRTb3VyY2VDb250ZXh0KFt7XG5cdFx0XHQuLi5zb3VyY2VUdXJuLFxuXHRcdFx0cmVzcG9uc2VQYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6ICdzb3VyY2UtbWQnLCBjb250ZW50OiAnc291cmNlIGFuc3dlcicgfV0sXG5cdFx0fV0sIHtcblx0XHRcdGlkOiAnYWN0aXZlJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2ZvbGxvdy11cCBxdWVzdGlvbicsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdHJlc3BvbnNlUGFydHM6IFtdLFxuXHRcdFx0c3RhcnRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdH0pLCAnVXNlciByZXF1ZXN0OlxcbnNvdXJjZSBxdWVzdGlvblxcblxcbkFnZW50IHJlc3BvbnNlOlxcbnNvdXJjZSBhbnN3ZXJcXG5cXG4tLS1cXG5cXG5Vc2VyIHJlcXVlc3Q6XFxuZm9sbG93LXVwIHF1ZXN0aW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGR1cGxpY2F0ZSBhY3RpdmUgc291cmNlIGNvbnRleHQgd2hlbiB0aGUgaW5oZXJpdGVkIHRyYW5zY3JpcHQgYWxyZWFkeSBjb250YWlucyB0aGUgc291cmNlIHR1cm4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydGlhbFJlc3BvbnNlID0gJ3BhcnRpYWwgYW5zd2VyJztcblx0XHRjb25zdCBwcmVwYXJlZCA9IHByZXBhcmVTaWRlQ2hhdFByb21wdCgnRXhwbGFpbiB0aGUgYnJhbmNoJywgW3tcblx0XHRcdGlkOiAnYWN0aXZlLXR1cm4nLFxuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2N1cnJlbnQgcXVlc3Rpb24nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ2FjdGl2ZS1tZCcsIGNvbnRlbnQ6IHBhcnRpYWxSZXNwb25zZSB9XSxcblx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0fV0sIHtcblx0XHRcdHNvdXJjZTogJ2FocC1jaGF0Oi8vZGVmYXVsdC9zb3VyY2UnLFxuXHRcdFx0dHVybklkOiAnYWN0aXZlLXR1cm4nLFxuXHRcdFx0aW5oZXJpdGVkVHVybkNvdW50OiAxLFxuXHRcdFx0Y29udGV4dDogJ1VzZXIgcmVxdWVzdDpcXG5jdXJyZW50IHF1ZXN0aW9uJyxcblx0XHRcdHBhcnRpYWxSZXNwb25zZSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlZCwgaW5qZWN0U2lkZUNoYXRDb250ZXh0KCdFeHBsYWluIHRoZSBicmFuY2gnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luamVjdHMgYWN0aXZlIHNvdXJjZSBjb250ZXh0IGV4YWN0bHkgb25jZSB3aGVuIHRoZSBpbmhlcml0ZWQgdHJhbnNjcmlwdCBpcyBtaXNzaW5nIHRoZSBzb3VyY2UgdHVybicsICgpID0+IHtcblx0XHRjb25zdCBzb3VyY2VDb250ZXh0ID0gJ1VzZXIgcmVxdWVzdDpcXG5zb3VyY2UgcXVlc3Rpb25cXG5cXG5BZ2VudCByZXNwb25zZTpcXG5zb3VyY2UgYW5zd2VyXFxuXFxuLS0tXFxuXFxuVXNlciByZXF1ZXN0OlxcbmN1cnJlbnQgcXVlc3Rpb24nO1xuXHRcdGNvbnN0IHBhcnRpYWxSZXNwb25zZSA9ICdwYXJ0aWFsIGFuc3dlcic7XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBwcmVwYXJlU2lkZUNoYXRQcm9tcHQoJ0V4cGxhaW4gdGhlIGJyYW5jaCcsIFt7XG5cdFx0XHQuLi5zb3VyY2VUdXJuLFxuXHRcdFx0cmVzcG9uc2VQYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6ICdzb3VyY2UtbWQnLCBjb250ZW50OiAnc291cmNlIGFuc3dlcicgfV0sXG5cdFx0fV0sIHtcblx0XHRcdHNvdXJjZTogJ2FocC1jaGF0Oi8vZGVmYXVsdC9zb3VyY2UnLFxuXHRcdFx0dHVybklkOiAnYWN0aXZlLXR1cm4nLFxuXHRcdFx0aW5oZXJpdGVkVHVybkNvdW50OiAxLFxuXHRcdFx0Y29udGV4dDogc291cmNlQ29udGV4dCxcblx0XHRcdHBhcnRpYWxSZXNwb25zZSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJlcGFyZWQsXG5cdFx0XHRhY3RpdmVRdWVzdGlvbkNvdW50OiBjb3VudE9jY3VycmVuY2VzKHByZXBhcmVkLCAnVXNlciByZXF1ZXN0OlxcbmN1cnJlbnQgcXVlc3Rpb24nKSxcblx0XHRcdHBhcnRpYWxSZXNwb25zZUNvdW50OiBjb3VudE9jY3VycmVuY2VzKHByZXBhcmVkLCBwYXJ0aWFsUmVzcG9uc2UpLFxuXHRcdH0sIHtcblx0XHRcdHByZXBhcmVkOiBpbmplY3RTaWRlQ2hhdENvbnRleHQoJ0V4cGxhaW4gdGhlIGJyYW5jaCcsIHBhcnRpYWxSZXNwb25zZSwgc291cmNlQ29udGV4dCksXG5cdFx0XHRhY3RpdmVRdWVzdGlvbkNvdW50OiAxLFxuXHRcdFx0cGFydGlhbFJlc3BvbnNlQ291bnQ6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luamVjdHMgY29tcGxldGVkIGxvY2FsLXR1cm4gY29udGV4dCBldmVuIHdoZW4gdGhlIGluaGVyaXRlZCB0cmFuc2NyaXB0IGFscmVhZHkgY29udGFpbnMgdGhlIGNvbmNyZXRlIHByb3ZpZGVyIGFuY2hvcicsICgpID0+IHtcblx0XHRjb25zdCBzb3VyY2VDb250ZXh0ID0gJ1VzZXIgcmVxdWVzdDpcXG5zb3VyY2UgcXVlc3Rpb25cXG5cXG5BZ2VudCByZXNwb25zZTpcXG5zb3VyY2UgYW5zd2VyXFxuXFxuLS0tXFxuXFxuVXNlciByZXF1ZXN0OlxcbiFjb21tYW5kJztcblx0XHRjb25zdCBsb2NhbFNpZGVDaGF0OiBJUGVyc2lzdGVkU2lkZUNoYXQgPSB7XG5cdFx0XHRzb3VyY2U6ICdhaHAtY2hhdDovL2RlZmF1bHQvc291cmNlJyxcblx0XHRcdHR1cm5JZDogJ2xvY2FsLXR1cm4nLFxuXHRcdFx0cHJvdmlkZXJBbmNob3JUdXJuSWQ6IHNvdXJjZVR1cm4uaWQsXG5cdFx0XHRpbmhlcml0ZWRUdXJuQ291bnQ6IDEsXG5cdFx0XHRjb250ZXh0OiBzb3VyY2VDb250ZXh0LFxuXHRcdH07XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBwcmVwYXJlU2lkZUNoYXRQcm9tcHQoJ0V4cGxhaW4gdGhlIGJyYW5jaCcsIFtzb3VyY2VUdXJuXSwgbG9jYWxTaWRlQ2hhdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByZXBhcmVkLFxuXHRcdFx0bG9jYWxRdWVzdGlvbkNvdW50OiBjb3VudE9jY3VycmVuY2VzKHByZXBhcmVkLCAnVXNlciByZXF1ZXN0OlxcbiFjb21tYW5kJyksXG5cdFx0XHRzb3VyY2VRdWVzdGlvbkNvdW50OiBjb3VudE9jY3VycmVuY2VzKHByZXBhcmVkLCAnVXNlciByZXF1ZXN0OlxcbnNvdXJjZSBxdWVzdGlvbicpLFxuXHRcdH0sIHtcblx0XHRcdHByZXBhcmVkOiBpbmplY3RTaWRlQ2hhdENvbnRleHQoJ0V4cGxhaW4gdGhlIGJyYW5jaCcsIHVuZGVmaW5lZCwgc291cmNlQ29udGV4dCksXG5cdFx0XHRsb2NhbFF1ZXN0aW9uQ291bnQ6IDEsXG5cdFx0XHRzb3VyY2VRdWVzdGlvbkNvdW50OiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgaGlkZGVuIGNvbnRleHQgZXZlbiB3aGVuIHRoZSBzb3VyY2UgdGV4dCBjb250YWlucyB0aGUgbGVnYWN5IGRlbGltaXRlcicsICgpID0+IHtcblx0XHRjb25zdCBwcmVwYXJlZCA9IHByZXBhcmVTaWRlQ2hhdFByb21wdCgnVmlzaWJsZSBwcm9tcHQnLCBbXSwge1xuXHRcdFx0Li4uc2lkZUNoYXQsXG5cdFx0XHRjb250ZXh0OiBgVXNlciByZXF1ZXN0OlxcbmNvbnRhaW5zICR7Jzwvc2lkZS1jaGF0LWNvbnRleHQ+J31cXG5cXG5BZ2VudCByZXNwb25zZTpcXG5yZWFkeWAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IHN0cmlwU2lkZUNoYXRDb250ZXh0KFt7XG5cdFx0XHQuLi5zb3VyY2VUdXJuLFxuXHRcdFx0aWQ6ICdzaWRlLXR1cm4nLFxuXHRcdFx0bWVzc2FnZTogeyAuLi5zb3VyY2VUdXJuLm1lc3NhZ2UsIHRleHQ6IHByZXBhcmVkIH0sXG5cdFx0fV0sIHNpZGVDaGF0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aXNpYmxlWzBdPy5tZXNzYWdlLnRleHQsICdWaXNpYmxlIHByb21wdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyb3VuZC10cmlwcyBzaWRlLWNoYXQgc2VsZWN0aW9uIHRocm91Z2ggcHJvdmlkZXIgZGF0YScsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlckRhdGEgPSBlbmNvZGVQcm92aWRlckRhdGEoe1xuXHRcdFx0c2RrU2Vzc2lvbklkOiAnc2RrLXNlc3Npb24nLFxuXHRcdFx0c2lkZUNoYXQ6IHtcblx0XHRcdFx0Li4uc2lkZUNoYXQsXG5cdFx0XHRcdHNlbGVjdGlvbjogeyB0ZXh0OiAnICBzZWxlY3RlZCB0ZXh0ICAnLCByZXNwb25zZVBhcnRJZDogJ3Jlc3BvbnNlLXBhcnQtMScgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRlY29kZVByb3ZpZGVyRGF0YShwcm92aWRlckRhdGEpPy5zaWRlQ2hhdD8uc2VsZWN0aW9uLCB7XG5cdFx0XHR0ZXh0OiAnICBzZWxlY3RlZCB0ZXh0ICAnLFxuXHRcdFx0cmVzcG9uc2VQYXJ0SWQ6ICdyZXNwb25zZS1wYXJ0LTEnLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsYUFBYSxrQkFBa0IsaUJBQTRCO0FBQ3BFLFNBQVMsNEJBQTRCLG9CQUFvQixvQkFBb0IsdUJBQXVCLHVCQUF1Qiw0QkFBcUQ7QUFFaEwsTUFBTSxrQkFBa0IsTUFBTTtBQUU3QiwwQ0FBd0M7QUFFeEMsUUFBTSxhQUFtQjtBQUFBLElBQ3hCLElBQUk7QUFBQSxJQUNKLE9BQU8sVUFBVTtBQUFBLElBQ2pCLFNBQVMsRUFBRSxNQUFNLG1CQUFtQixRQUFRLEVBQUUsTUFBTSxZQUFZLEtBQUssRUFBRTtBQUFBLElBQ3ZFLGVBQWUsQ0FBQztBQUFBLElBQ2hCLE9BQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxXQUErQjtBQUFBLElBQ3BDLFFBQVE7QUFBQSxJQUNSLFFBQVEsV0FBVztBQUFBLElBQ25CLG9CQUFvQjtBQUFBLEVBQ3JCO0FBRUEsUUFBTSxtQkFBbUIsQ0FBQyxPQUFlLFdBQW1CLE1BQU0sTUFBTSxNQUFNLEVBQUUsU0FBUztBQUV6RixPQUFLLDRFQUE0RSxNQUFNO0FBQ3RGLFVBQU0sV0FBVyxzQkFBc0Isc0JBQXNCLENBQUMsVUFBVSxHQUFHLFFBQVE7QUFDbkYsVUFBTSxVQUFVLHFCQUFxQixDQUFDO0FBQUEsTUFDckMsR0FBRztBQUFBLE1BQ0gsSUFBSTtBQUFBLE1BQ0osU0FBUyxFQUFFLEdBQUcsV0FBVyxTQUFTLE1BQU0sU0FBUztBQUFBLElBQ2xELENBQUMsR0FBRyxRQUFRO0FBRVosV0FBTyxnQkFBZ0I7QUFB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
