import assert from "assert";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { CopilotClient } from "@github/copilot-sdk";
import { Emitter } from "../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../log/common/log.js";
import { ByokLmBridgeRegistry } from "../../../node/byokLmBridgeRegistry.js";
import { ByokLmProxyService } from "../../../node/copilot/byokLmProxyService.js";
const REAL_SDK_ENABLED = process.env["AGENT_HOST_REAL_SDK"] === "1";
(REAL_SDK_ENABLED ? suite : suite.skip)("Agent Host Provider Integration - Copilot BYOK Responses", function() {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("real SDK consumes structured reasoning and text from the proxy", async function() {
    this.timeout(12e4);
    const sessionId = "byok-responses-integration";
    const baseDirectory = await mkdtemp(`${tmpdir()}/byok-responses-sdk-`);
    const models = store.add(new Emitter());
    const registry = new ByokLmBridgeRegistry();
    const captured = [];
    const registration = registry.register("client", {
      chat: async (request) => {
        captured.push(request);
        if (captured.length > 1) {
          return {
            responseId: "resp_provider_2",
            output: [{ type: "message", content: [{ type: "text", text: "second" }] }]
          };
        }
        return {
          responseId: "resp_provider",
          output: [
            { type: "reasoning", id: "rs_provider", summary: ["considered options"], encryptedContent: "opaque" },
            { type: "message", content: [{ type: "text", text: "hello" }] }
          ],
          usage: { inputTokens: 1, outputTokens: 2, reasoningTokens: 1 }
        };
      },
      onDidChangeModels: models.event
    });
    models.fire([{ vendor: "acme", id: "test-model" }]);
    const proxy = new ByokLmProxyService(new NullLogService(), registry);
    const handle = await proxy.start();
    const client = new CopilotClient({
      mode: "empty",
      baseDirectory,
      useLoggedInUser: false,
      logLevel: "error"
    });
    let session;
    let clientStarted = false;
    try {
      await client.start();
      clientStarted = true;
      session = await client.createSession({
        sessionId,
        model: "test-model",
        reasoningEffort: "medium",
        availableTools: [],
        provider: {
          type: "openai",
          wireApi: "responses",
          baseUrl: handle.providerBaseUrl("acme"),
          bearerToken: `${handle.nonce}.${sessionId}`
        }
      });
      const reasoning = [];
      session.on("assistant.reasoning", (event) => reasoning.push(event.data.content));
      const result = await session.sendAndWait({ prompt: "Reply exactly hello." }, 3e4);
      const secondResult = await session.sendAndWait({ prompt: "Reply exactly second." }, 3e4);
      const replayedReasoning = captured[1]?.input.find((item) => item.type === "reasoning");
      assert.deepStrictEqual({
        result: result?.type === "assistant.message" ? result.data.content : void 0,
        secondResult: secondResult?.type === "assistant.message" ? secondResult.data.content : void 0,
        reasoning,
        firstRequest: {
          vendor: captured[0]?.vendor,
          modelId: captured[0]?.modelId,
          inputTypes: captured[0]?.input.map((item) => item.type),
          reasoningEffort: captured[0]?.reasoningEffort
        },
        replayedReasoning
      }, {
        result: "hello",
        secondResult: "second",
        reasoning: ["considered options"],
        firstRequest: {
          vendor: "acme",
          modelId: "test-model",
          inputTypes: ["message"],
          reasoningEffort: "medium"
        },
        replayedReasoning: {
          type: "reasoning",
          id: "rs_provider",
          summary: ["considered options"],
          encryptedContent: "opaque"
        }
      });
    } finally {
      try {
        await session?.disconnect();
      } finally {
        try {
          if (clientStarted) {
            await client.stop();
          }
        } finally {
          handle.dispose();
          registration.dispose();
          proxy.dispose();
          await rm(baseDirectory, { recursive: true, force: true });
        }
      }
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvcHJvdmlkZXJJbnRlZ3JhdGlvbi9jb3BpbG90Qnlva1Jlc3BvbnNlcy5pbnRlZ3JhdGlvblRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBta2R0ZW1wLCBybSB9IGZyb20gJ2ZzL3Byb21pc2VzJztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IENvcGlsb3RDbGllbnQgfSBmcm9tICdAZ2l0aHViL2NvcGlsb3Qtc2RrJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHR5cGUgeyBJQnlva0xtQ2hhdFJlcXVlc3QsIElCeW9rTG1Nb2RlbEluZm8gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0Qnlva0xtLmpzJztcbmltcG9ydCB7IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9ieW9rTG1CcmlkZ2VSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBCeW9rTG1Qcm94eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2NvcGlsb3QvYnlva0xtUHJveHlTZXJ2aWNlLmpzJztcblxuY29uc3QgUkVBTF9TREtfRU5BQkxFRCA9IHByb2Nlc3MuZW52WydBR0VOVF9IT1NUX1JFQUxfU0RLJ10gPT09ICcxJztcblxuKFJFQUxfU0RLX0VOQUJMRUQgPyBzdWl0ZSA6IHN1aXRlLnNraXApKCdBZ2VudCBIb3N0IFByb3ZpZGVyIEludGVncmF0aW9uIC0gQ29waWxvdCBCWU9LIFJlc3BvbnNlcycsIGZ1bmN0aW9uICgpIHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JlYWwgU0RLIGNvbnN1bWVzIHN0cnVjdHVyZWQgcmVhc29uaW5nIGFuZCB0ZXh0IGZyb20gdGhlIHByb3h5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxMjBfMDAwKTtcblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9ICdieW9rLXJlc3BvbnNlcy1pbnRlZ3JhdGlvbic7XG5cdFx0Y29uc3QgYmFzZURpcmVjdG9yeSA9IGF3YWl0IG1rZHRlbXAoYCR7dG1wZGlyKCl9L2J5b2stcmVzcG9uc2VzLXNkay1gKTtcblx0XHRjb25zdCBtb2RlbHMgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8SUJ5b2tMbU1vZGVsSW5mb1tdPigpKTtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpO1xuXHRcdGNvbnN0IGNhcHR1cmVkOiBJQnlva0xtQ2hhdFJlcXVlc3RbXSA9IFtdO1xuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJ5LnJlZ2lzdGVyKCdjbGllbnQnLCB7XG5cdFx0XHRjaGF0OiBhc3luYyByZXF1ZXN0ID0+IHtcblx0XHRcdFx0Y2FwdHVyZWQucHVzaChyZXF1ZXN0KTtcblx0XHRcdFx0aWYgKGNhcHR1cmVkLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0cmVzcG9uc2VJZDogJ3Jlc3BfcHJvdmlkZXJfMicsXG5cdFx0XHRcdFx0XHRvdXRwdXQ6IFt7IHR5cGU6ICdtZXNzYWdlJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnc2Vjb25kJyB9XSB9XSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cmVzcG9uc2VJZDogJ3Jlc3BfcHJvdmlkZXInLFxuXHRcdFx0XHRcdG91dHB1dDogW1xuXHRcdFx0XHRcdFx0eyB0eXBlOiAncmVhc29uaW5nJywgaWQ6ICdyc19wcm92aWRlcicsIHN1bW1hcnk6IFsnY29uc2lkZXJlZCBvcHRpb25zJ10sIGVuY3J5cHRlZENvbnRlbnQ6ICdvcGFxdWUnIH0sXG5cdFx0XHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnaGVsbG8nIH1dIH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR1c2FnZTogeyBpbnB1dFRva2VuczogMSwgb3V0cHV0VG9rZW5zOiAyLCByZWFzb25pbmdUb2tlbnM6IDEgfSxcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZU1vZGVsczogbW9kZWxzLmV2ZW50LFxuXHRcdH0pO1xuXHRcdG1vZGVscy5maXJlKFt7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ3Rlc3QtbW9kZWwnIH1dKTtcblxuXHRcdGNvbnN0IHByb3h5ID0gbmV3IEJ5b2tMbVByb3h5U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgcmVnaXN0cnkpO1xuXHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHByb3h5LnN0YXJ0KCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IENvcGlsb3RDbGllbnQoe1xuXHRcdFx0bW9kZTogJ2VtcHR5Jyxcblx0XHRcdGJhc2VEaXJlY3RvcnksXG5cdFx0XHR1c2VMb2dnZWRJblVzZXI6IGZhbHNlLFxuXHRcdFx0bG9nTGV2ZWw6ICdlcnJvcicsXG5cdFx0fSk7XG5cdFx0bGV0IHNlc3Npb246IEF3YWl0ZWQ8UmV0dXJuVHlwZTxDb3BpbG90Q2xpZW50WydjcmVhdGVTZXNzaW9uJ10+PiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY2xpZW50U3RhcnRlZCA9IGZhbHNlO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGNsaWVudC5zdGFydCgpO1xuXHRcdFx0Y2xpZW50U3RhcnRlZCA9IHRydWU7XG5cdFx0XHRzZXNzaW9uID0gYXdhaXQgY2xpZW50LmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHRcdG1vZGVsOiAndGVzdC1tb2RlbCcsXG5cdFx0XHRcdHJlYXNvbmluZ0VmZm9ydDogJ21lZGl1bScsXG5cdFx0XHRcdGF2YWlsYWJsZVRvb2xzOiBbXSxcblx0XHRcdFx0cHJvdmlkZXI6IHtcblx0XHRcdFx0XHR0eXBlOiAnb3BlbmFpJyxcblx0XHRcdFx0XHR3aXJlQXBpOiAncmVzcG9uc2VzJyxcblx0XHRcdFx0XHRiYXNlVXJsOiBoYW5kbGUucHJvdmlkZXJCYXNlVXJsKCdhY21lJyksXG5cdFx0XHRcdFx0YmVhcmVyVG9rZW46IGAke2hhbmRsZS5ub25jZX0uJHtzZXNzaW9uSWR9YCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVhc29uaW5nOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0c2Vzc2lvbi5vbignYXNzaXN0YW50LnJlYXNvbmluZycsIGV2ZW50ID0+IHJlYXNvbmluZy5wdXNoKGV2ZW50LmRhdGEuY29udGVudCkpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXNzaW9uLnNlbmRBbmRXYWl0KHsgcHJvbXB0OiAnUmVwbHkgZXhhY3RseSBoZWxsby4nIH0sIDMwXzAwMCk7XG5cdFx0XHRjb25zdCBzZWNvbmRSZXN1bHQgPSBhd2FpdCBzZXNzaW9uLnNlbmRBbmRXYWl0KHsgcHJvbXB0OiAnUmVwbHkgZXhhY3RseSBzZWNvbmQuJyB9LCAzMF8wMDApO1xuXHRcdFx0Y29uc3QgcmVwbGF5ZWRSZWFzb25pbmcgPSBjYXB0dXJlZFsxXT8uaW5wdXQuZmluZChpdGVtID0+IGl0ZW0udHlwZSA9PT0gJ3JlYXNvbmluZycpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzdWx0OiByZXN1bHQ/LnR5cGUgPT09ICdhc3Npc3RhbnQubWVzc2FnZScgPyByZXN1bHQuZGF0YS5jb250ZW50IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzZWNvbmRSZXN1bHQ6IHNlY29uZFJlc3VsdD8udHlwZSA9PT0gJ2Fzc2lzdGFudC5tZXNzYWdlJyA/IHNlY29uZFJlc3VsdC5kYXRhLmNvbnRlbnQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlYXNvbmluZyxcblx0XHRcdFx0Zmlyc3RSZXF1ZXN0OiB7XG5cdFx0XHRcdFx0dmVuZG9yOiBjYXB0dXJlZFswXT8udmVuZG9yLFxuXHRcdFx0XHRcdG1vZGVsSWQ6IGNhcHR1cmVkWzBdPy5tb2RlbElkLFxuXHRcdFx0XHRcdGlucHV0VHlwZXM6IGNhcHR1cmVkWzBdPy5pbnB1dC5tYXAoaXRlbSA9PiBpdGVtLnR5cGUpLFxuXHRcdFx0XHRcdHJlYXNvbmluZ0VmZm9ydDogY2FwdHVyZWRbMF0/LnJlYXNvbmluZ0VmZm9ydCxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVwbGF5ZWRSZWFzb25pbmcsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlc3VsdDogJ2hlbGxvJyxcblx0XHRcdFx0c2Vjb25kUmVzdWx0OiAnc2Vjb25kJyxcblx0XHRcdFx0cmVhc29uaW5nOiBbJ2NvbnNpZGVyZWQgb3B0aW9ucyddLFxuXHRcdFx0XHRmaXJzdFJlcXVlc3Q6IHtcblx0XHRcdFx0XHR2ZW5kb3I6ICdhY21lJyxcblx0XHRcdFx0XHRtb2RlbElkOiAndGVzdC1tb2RlbCcsXG5cdFx0XHRcdFx0aW5wdXRUeXBlczogWydtZXNzYWdlJ10sXG5cdFx0XHRcdFx0cmVhc29uaW5nRWZmb3J0OiAnbWVkaXVtJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVwbGF5ZWRSZWFzb25pbmc6IHtcblx0XHRcdFx0XHR0eXBlOiAncmVhc29uaW5nJyxcblx0XHRcdFx0XHRpZDogJ3JzX3Byb3ZpZGVyJyxcblx0XHRcdFx0XHRzdW1tYXJ5OiBbJ2NvbnNpZGVyZWQgb3B0aW9ucyddLFxuXHRcdFx0XHRcdGVuY3J5cHRlZENvbnRlbnQ6ICdvcGFxdWUnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgc2Vzc2lvbj8uZGlzY29ubmVjdCgpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRpZiAoY2xpZW50U3RhcnRlZCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgY2xpZW50LnN0b3AoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHByb3h5LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRhd2FpdCBybShiYXNlRGlyZWN0b3J5LCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0pO1xufSk7XG4iXSwKICAibWFw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
