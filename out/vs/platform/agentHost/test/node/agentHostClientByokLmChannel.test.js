import assert from "assert";
import { Emitter } from "../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentHostClientByokLmChannel, createAgentHostClientByokLmConnection } from "../../common/agentHostClientByokLmChannel.js";
suite("agentHostClientByokLmChannel", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function handlerOf(chat, listModels = async () => [], onDidChangeModels) {
    return { _serviceBrand: void 0, chat: (request) => chat(request), listModels: () => listModels(), onDidChangeModels };
  }
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  function bridge(handler) {
    const server = new AgentHostClientByokLmChannel(handler, new NullLogService());
    const channel = {
      call(command, arg) {
        return server.call(null, command, arg);
      },
      listen(event) {
        return (listener, thisArgs, disposables) => server.listen(null, event)(listener, thisArgs, disposables);
      }
    };
    return createAgentHostClientByokLmConnection(channel);
  }
  test("round-trips a Responses request to the handler and back", async () => {
    let seen;
    const connection = bridge(handlerOf(async (request2) => {
      seen = request2;
      return {
        responseId: "resp_1",
        output: [
          { type: "reasoning", id: "rs_1", summary: ["thinking"], encryptedContent: "opaque" },
          { type: "message", content: [{ type: "text", text: "pong" }] },
          { type: "function_call", callId: "c1", name: "noop", argumentsJson: "{}" }
        ]
      };
    }));
    const request = {
      vendor: "acme",
      modelId: "m",
      previousResponseId: "resp_0",
      input: [
        { type: "reasoning", id: "rs_0", summary: ["previous"], encryptedContent: "previous-opaque" },
        { type: "message", role: "user", content: [{ type: "text", text: "ping" }] }
      ]
    };
    const result = await connection.chat(request);
    assert.deepStrictEqual(seen, request);
    assert.deepStrictEqual(result, {
      responseId: "resp_1",
      output: [
        { type: "reasoning", id: "rs_1", summary: ["thinking"], encryptedContent: "opaque" },
        { type: "message", content: [{ type: "text", text: "pong" }] },
        { type: "function_call", callId: "c1", name: "noop", argumentsJson: "{}" }
      ]
    });
  });
  test("forwards a bridge error result unchanged", async () => {
    const connection = bridge(handlerOf(async () => ({ output: [], error: "no model" })));
    const result = await connection.chat({ vendor: "v", modelId: "m", input: [] });
    assert.strictEqual(result.error, "no model");
  });
  test("pushes the current model snapshot on subscribe and re-pushes on change", async () => {
    const onDidChange = store.add(new Emitter());
    let models = [{ vendor: "acme", id: "claude", name: "Acme Claude", maxContextWindowTokens: 128e3 }];
    const connection = bridge(handlerOf(async () => ({ output: [] }), async () => models, onDidChange.event));
    const pushed = [];
    const sub = connection.onDidChangeModels((snapshot) => pushed.push(snapshot));
    await flush();
    models = [{ vendor: "acme", id: "gpt" }];
    onDidChange.fire();
    await flush();
    sub.dispose();
    assert.deepStrictEqual(pushed, [
      [{ vendor: "acme", id: "claude", name: "Acme Claude", maxContextWindowTokens: 128e3 }],
      [{ vendor: "acme", id: "gpt" }]
    ]);
  });
  test("coalesces a burst of changes so the final snapshot reflects the latest models", async () => {
    const onDidChange = store.add(new Emitter());
    let models = [{ vendor: "acme", id: "v1" }];
    const connection = bridge(handlerOf(async () => ({ output: [] }), async () => models, onDidChange.event));
    const pushed = [];
    const sub = connection.onDidChangeModels((snapshot) => pushed.push(snapshot));
    await flush();
    models = [{ vendor: "acme", id: "v2" }];
    onDidChange.fire();
    models = [{ vendor: "acme", id: "v3" }];
    onDidChange.fire();
    await flush();
    sub.dispose();
    assert.deepStrictEqual(pushed.at(-1), [{ vendor: "acme", id: "v3" }]);
  });
  test("rejects unknown channel commands", async () => {
    const server = new AgentHostClientByokLmChannel(handlerOf(async () => ({ output: [] })), new NullLogService());
    await assert.rejects(() => server.call(null, "frobnicate"), /Unknown command/);
  });
  test("exposes only the models event", () => {
    const server = new AgentHostClientByokLmChannel(handlerOf(async () => ({ output: [] })), new NullLogService());
    assert.throws(() => server.listen(null, "anything"), /No event/);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0Q2xpZW50Qnlva0xtQ2hhbm5lbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgdHlwZSB7IElDaGFubmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0Qnlva0xtSGFuZGxlciwgSUJ5b2tMbUNoYXRSZXF1ZXN0LCBJQnlva0xtQ2hhdFJlc3VsdCwgSUJ5b2tMbU1vZGVsSW5mbyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RCeW9rTG0uanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2xpZW50Qnlva0xtQ2hhbm5lbCwgY3JlYXRlQWdlbnRIb3N0Q2xpZW50Qnlva0xtQ29ubmVjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDbGllbnRCeW9rTG1DaGFubmVsLmpzJztcblxuc3VpdGUoJ2FnZW50SG9zdENsaWVudEJ5b2tMbUNoYW5uZWwnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBoYW5kbGVyT2YoXG5cdFx0Y2hhdDogKHJlcXVlc3Q6IElCeW9rTG1DaGF0UmVxdWVzdCkgPT4gUHJvbWlzZTxJQnlva0xtQ2hhdFJlc3VsdD4sXG5cdFx0bGlzdE1vZGVsczogKCkgPT4gUHJvbWlzZTxJQnlva0xtTW9kZWxJbmZvW10+ID0gYXN5bmMgKCkgPT4gW10sXG5cdFx0b25EaWRDaGFuZ2VNb2RlbHM/OiBFdmVudDx2b2lkPixcblx0KTogSUFnZW50SG9zdEJ5b2tMbUhhbmRsZXIge1xuXHRcdHJldHVybiB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgY2hhdDogKHJlcXVlc3QpID0+IGNoYXQocmVxdWVzdCksIGxpc3RNb2RlbHM6ICgpID0+IGxpc3RNb2RlbHMoKSwgb25EaWRDaGFuZ2VNb2RlbHMgfTtcblx0fVxuXG5cdC8qKiBSZXNvbHZlcyBvbmNlIHRoZSBjaGFubmVsJ3MgYXN5bmMgc25hcHNob3QgcHVibGlzaCBoYXMgc2V0dGxlZC4gKi9cblx0Y29uc3QgZmx1c2ggPSAoKSA9PiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdC8qKlxuXHQgKiBXaXJlIHRoZSBub2RlLXNpZGUgY29ubmVjdGlvbiBzdHJhaWdodCB0byB0aGUgcmVuZGVyZXIgc2VydmVyIGNoYW5uZWwsXG5cdCAqIHN0YW5kaW5nIGluIGZvciB0aGUgTWVzc2FnZVBvcnQgdHJhbnNwb3J0IHNvIHRoZSBmdWxsIHJlcXVlc3QgXHUyMTkyIGhhbmRsZXIgXHUyMTkyXG5cdCAqIHJlc3BvbnNlIHJvdW5kLXRyaXAgY2FuIGJlIGV4ZXJjaXNlZCB3aXRob3V0IHRoZSByZW5kZXJlciBvciB0aGUgU0RLLlxuXHQgKi9cblx0ZnVuY3Rpb24gYnJpZGdlKGhhbmRsZXI6IElBZ2VudEhvc3RCeW9rTG1IYW5kbGVyKSB7XG5cdFx0Y29uc3Qgc2VydmVyID0gbmV3IEFnZW50SG9zdENsaWVudEJ5b2tMbUNoYW5uZWwoaGFuZGxlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGNoYW5uZWw6IElDaGFubmVsID0ge1xuXHRcdFx0Y2FsbDxUPihjb21tYW5kOiBzdHJpbmcsIGFyZz86IHVua25vd24pOiBQcm9taXNlPFQ+IHtcblx0XHRcdFx0cmV0dXJuIHNlcnZlci5jYWxsPFQ+KG51bGwsIGNvbW1hbmQsIGFyZyk7XG5cdFx0XHR9LFxuXHRcdFx0bGlzdGVuPFQ+KGV2ZW50OiBzdHJpbmcpOiBFdmVudDxUPiB7XG5cdFx0XHRcdC8vIE1pcnJvciBDaGFubmVsQ2xpZW50Lmxpc3RlbjogZGVmZXIgdG8gdGhlIHNlcnZlciBjaGFubmVsIG9ubHkgd2hlblxuXHRcdFx0XHQvLyB0aGUgcmV0dXJuZWQgZXZlbnQgaXMgYWN0dWFsbHkgc3Vic2NyaWJlZCAobGF6eSksIHNvIGEgY29ubmVjdGlvblxuXHRcdFx0XHQvLyB0aGF0IG5ldmVyIGxpc3RlbnMgYWxsb2NhdGVzIG5vdGhpbmcuXG5cdFx0XHRcdHJldHVybiAobGlzdGVuZXIsIHRoaXNBcmdzPywgZGlzcG9zYWJsZXM/KSA9PiBzZXJ2ZXIubGlzdGVuPFQ+KG51bGwsIGV2ZW50KShsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRyZXR1cm4gY3JlYXRlQWdlbnRIb3N0Q2xpZW50Qnlva0xtQ29ubmVjdGlvbihjaGFubmVsKTtcblx0fVxuXG5cdHRlc3QoJ3JvdW5kLXRyaXBzIGEgUmVzcG9uc2VzIHJlcXVlc3QgdG8gdGhlIGhhbmRsZXIgYW5kIGJhY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHNlZW46IElCeW9rTG1DaGF0UmVxdWVzdCB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gYnJpZGdlKGhhbmRsZXJPZihhc3luYyAocmVxdWVzdCkgPT4ge1xuXHRcdFx0c2VlbiA9IHJlcXVlc3Q7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyZXNwb25zZUlkOiAncmVzcF8xJyxcblx0XHRcdFx0b3V0cHV0OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiAncmVhc29uaW5nJywgaWQ6ICdyc18xJywgc3VtbWFyeTogWyd0aGlua2luZyddLCBlbmNyeXB0ZWRDb250ZW50OiAnb3BhcXVlJyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdwb25nJyB9XSB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ2Z1bmN0aW9uX2NhbGwnLCBjYWxsSWQ6ICdjMScsIG5hbWU6ICdub29wJywgYXJndW1lbnRzSnNvbjogJ3t9JyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCByZXF1ZXN0OiBJQnlva0xtQ2hhdFJlcXVlc3QgPSB7XG5cdFx0XHR2ZW5kb3I6ICdhY21lJyxcblx0XHRcdG1vZGVsSWQ6ICdtJyxcblx0XHRcdHByZXZpb3VzUmVzcG9uc2VJZDogJ3Jlc3BfMCcsXG5cdFx0XHRpbnB1dDogW1xuXHRcdFx0XHR7IHR5cGU6ICdyZWFzb25pbmcnLCBpZDogJ3JzXzAnLCBzdW1tYXJ5OiBbJ3ByZXZpb3VzJ10sIGVuY3J5cHRlZENvbnRlbnQ6ICdwcmV2aW91cy1vcGFxdWUnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCByb2xlOiAndXNlcicsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ3BpbmcnIH1dIH0sXG5cdFx0XHRdLFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jaGF0KHJlcXVlc3QpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWVuLCByZXF1ZXN0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0cmVzcG9uc2VJZDogJ3Jlc3BfMScsXG5cdFx0XHRvdXRwdXQ6IFtcblx0XHRcdFx0eyB0eXBlOiAncmVhc29uaW5nJywgaWQ6ICdyc18xJywgc3VtbWFyeTogWyd0aGlua2luZyddLCBlbmNyeXB0ZWRDb250ZW50OiAnb3BhcXVlJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAncG9uZycgfV0gfSxcblx0XHRcdFx0eyB0eXBlOiAnZnVuY3Rpb25fY2FsbCcsIGNhbGxJZDogJ2MxJywgbmFtZTogJ25vb3AnLCBhcmd1bWVudHNKc29uOiAne30nIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3J3YXJkcyBhIGJyaWRnZSBlcnJvciByZXN1bHQgdW5jaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBicmlkZ2UoaGFuZGxlck9mKGFzeW5jICgpID0+ICh7IG91dHB1dDogW10sIGVycm9yOiAnbm8gbW9kZWwnIH0pKSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5jaGF0KHsgdmVuZG9yOiAndicsIG1vZGVsSWQ6ICdtJywgaW5wdXQ6IFtdIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZXJyb3IsICdubyBtb2RlbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdwdXNoZXMgdGhlIGN1cnJlbnQgbW9kZWwgc25hcHNob3Qgb24gc3Vic2NyaWJlIGFuZCByZS1wdXNoZXMgb24gY2hhbmdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGxldCBtb2RlbHM6IElCeW9rTG1Nb2RlbEluZm9bXSA9IFt7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ2NsYXVkZScsIG5hbWU6ICdBY21lIENsYXVkZScsIG1heENvbnRleHRXaW5kb3dUb2tlbnM6IDEyODAwMCB9XTtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gYnJpZGdlKGhhbmRsZXJPZihhc3luYyAoKSA9PiAoeyBvdXRwdXQ6IFtdIH0pLCBhc3luYyAoKSA9PiBtb2RlbHMsIG9uRGlkQ2hhbmdlLmV2ZW50KSk7XG5cblx0XHRjb25zdCBwdXNoZWQ6IElCeW9rTG1Nb2RlbEluZm9bXVtdID0gW107XG5cdFx0Y29uc3Qgc3ViID0gY29ubmVjdGlvbi5vbkRpZENoYW5nZU1vZGVscyhzbmFwc2hvdCA9PiBwdXNoZWQucHVzaChzbmFwc2hvdCkpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cblx0XHQvLyBBIGNoYW5nZSBvbiB0aGUgaGFuZGxlciB0cmlnZ2VycyBhIGZyZXNoIHNuYXBzaG90IHB1c2guXG5cdFx0bW9kZWxzID0gW3sgdmVuZG9yOiAnYWNtZScsIGlkOiAnZ3B0JyB9XTtcblx0XHRvbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwdXNoZWQsIFtcblx0XHRcdFt7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ2NsYXVkZScsIG5hbWU6ICdBY21lIENsYXVkZScsIG1heENvbnRleHRXaW5kb3dUb2tlbnM6IDEyODAwMCB9XSxcblx0XHRcdFt7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ2dwdCcgfV0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvYWxlc2NlcyBhIGJ1cnN0IG9mIGNoYW5nZXMgc28gdGhlIGZpbmFsIHNuYXBzaG90IHJlZmxlY3RzIHRoZSBsYXRlc3QgbW9kZWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGxldCBtb2RlbHM6IElCeW9rTG1Nb2RlbEluZm9bXSA9IFt7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ3YxJyB9XTtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gYnJpZGdlKGhhbmRsZXJPZihhc3luYyAoKSA9PiAoeyBvdXRwdXQ6IFtdIH0pLCBhc3luYyAoKSA9PiBtb2RlbHMsIG9uRGlkQ2hhbmdlLmV2ZW50KSk7XG5cblx0XHRjb25zdCBwdXNoZWQ6IElCeW9rTG1Nb2RlbEluZm9bXVtdID0gW107XG5cdFx0Y29uc3Qgc3ViID0gY29ubmVjdGlvbi5vbkRpZENoYW5nZU1vZGVscyhzbmFwc2hvdCA9PiBwdXNoZWQucHVzaChzbmFwc2hvdCkpO1xuXHRcdGF3YWl0IGZsdXNoKCk7XG5cblx0XHQvLyBBIHJhcGlkIGJ1cnN0OiBzZXZlcmFsIGNoYW5nZXMgZmlyZSBiZWZvcmUgYW55IGVudW1lcmF0aW9uIHNldHRsZXMuIFRoZVxuXHRcdC8vIHRocm90dGxlciBzZXJpYWxpemVzIHRoZW0sIHNvIHRoZSBsYXN0IHNuYXBzaG90IG11c3QgcmVmbGVjdCB0aGUgbGF0ZXN0XG5cdFx0Ly8gbW9kZWxzIHJhdGhlciB0aGFuIGEgc3RhbGUgZW51bWVyYXRpb24gZmluaXNoaW5nIG91dCBvZiBvcmRlci5cblx0XHRtb2RlbHMgPSBbeyB2ZW5kb3I6ICdhY21lJywgaWQ6ICd2MicgfV07XG5cdFx0b25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdG1vZGVscyA9IFt7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ3YzJyB9XTtcblx0XHRvbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgZmx1c2goKTtcblxuXHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwdXNoZWQuYXQoLTEpLCBbeyB2ZW5kb3I6ICdhY21lJywgaWQ6ICd2MycgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIHVua25vd24gY2hhbm5lbCBjb21tYW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSBuZXcgQWdlbnRIb3N0Q2xpZW50Qnlva0xtQ2hhbm5lbChoYW5kbGVyT2YoYXN5bmMgKCkgPT4gKHsgb3V0cHV0OiBbXSB9KSksIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzZXJ2ZXIuY2FsbChudWxsLCAnZnJvYm5pY2F0ZScpLCAvVW5rbm93biBjb21tYW5kLyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cG9zZXMgb25seSB0aGUgbW9kZWxzIGV2ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IG5ldyBBZ2VudEhvc3RDbGllbnRCeW9rTG1DaGFubmVsKGhhbmRsZXJPZihhc3luYyAoKSA9PiAoeyBvdXRwdXQ6IFtdIH0pKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gc2VydmVyLmxpc3RlbihudWxsLCAnYW55dGhpbmcnKSwgL05vIGV2ZW50Lyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFzQjtBQUUvQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLDhCQUE4Qiw2Q0FBNkM7QUFFcEYsTUFBTSxnQ0FBZ0MsTUFBTTtBQUUzQyxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELFdBQVMsVUFDUixNQUNBLGFBQWdELFlBQVksQ0FBQyxHQUM3RCxtQkFDMEI7QUFDMUIsV0FBTyxFQUFFLGVBQWUsUUFBVyxNQUFNLENBQUMsWUFBWSxLQUFLLE9BQU8sR0FBRyxZQUFZ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
