import assert from "assert";
import { DeferredPromise } from "../../../../../../base/common/async.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { OffsetRange } from "../../../../../../editor/common/core/ranges/offsetRange.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { acceptAndAwaitSentRequest, getImmediateSilentSlashCommandPart, layoutChatWidgetForInputHeight } from "../../../browser/widget/chatWidget.js";
import { ChatAgentLocation } from "../../../common/constants.js";
import { ChatRequestSlashCommandPart, ChatRequestTextPart } from "../../../common/requestParser/chatParserTypes.js";
suite("ChatWidget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("identifies only leading silent execute-immediately slash commands", () => {
    const command = new ChatRequestSlashCommandPart(
      new OffsetRange(0, 7),
      new Range(1, 1, 1, 8),
      {
        command: "models",
        detail: "Open models",
        executeImmediately: true,
        silent: true,
        locations: [ChatAgentLocation.Chat]
      }
    );
    const nonSilentCommand = new ChatRequestSlashCommandPart(
      new OffsetRange(0, 5),
      new Range(1, 1, 1, 6),
      {
        command: "help",
        detail: "Show help",
        executeImmediately: true,
        silent: false,
        locations: [ChatAgentLocation.Chat]
      }
    );
    const delayedCommand = new ChatRequestSlashCommandPart(
      new OffsetRange(0, 7),
      new Range(1, 1, 1, 8),
      {
        command: "rename",
        detail: "Rename chat",
        executeImmediately: false,
        silent: true,
        locations: [ChatAgentLocation.Chat]
      }
    );
    const prefix = new ChatRequestTextPart(new OffsetRange(0, 1), new Range(1, 1, 1, 2), " ");
    const shiftedCommand = new ChatRequestSlashCommandPart(
      new OffsetRange(1, 8),
      new Range(1, 2, 1, 9),
      command.slashCommand
    );
    assert.deepStrictEqual([
      getImmediateSilentSlashCommandPart({ text: "/models", parts: [command] })?.slashCommand.command,
      getImmediateSilentSlashCommandPart({ text: "/help", parts: [nonSilentCommand] })?.slashCommand.command,
      getImmediateSilentSlashCommandPart({ text: "/rename", parts: [delayedCommand] })?.slashCommand.command,
      getImmediateSilentSlashCommandPart({ text: " /models", parts: [prefix, shiftedCommand] })?.slashCommand.command
    ], [
      "models",
      void 0,
      void 0,
      void 0
    ]);
  });
  test("input height changes update the budget without re-laying out the input", () => {
    const calls = [];
    const target = {
      setInputPartMaxHeightOverride: (height) => calls.push(["setInputPartMaxHeightOverride", height]),
      layoutForInputHeight: (height, width) => calls.push(["layoutForInputHeight", height, width])
    };
    layoutChatWidgetForInputHeight(target, 600, 420, 720);
    assert.deepStrictEqual(calls, [
      ["setInputPartMaxHeightOverride", 600],
      ["layoutForInputHeight", 420, 720]
    ]);
  });
});
suite("ChatWidget - acceptAndAwaitSentRequest", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function sentResult() {
    return { kind: "sent", data: {} };
  }
  test("an immediately sent request is accepted and returned", async () => {
    let accepted = 0;
    const result = sentResult();
    const sent = await acceptAndAwaitSentRequest(result, () => accepted++);
    assert.deepStrictEqual({ accepted, sent }, { accepted: 1, sent: result });
  });
  test("a queued request is accepted before the queued request settles", async () => {
    const deferred = new DeferredPromise();
    let accepted = 0;
    const pending = acceptAndAwaitSentRequest({ kind: "queued", deferred: deferred.p }, () => accepted++);
    const acceptedWhileQueued = accepted === 1;
    const result = sentResult();
    await deferred.complete(result);
    assert.deepStrictEqual({ acceptedWhileQueued, accepted, sent: await pending }, {
      acceptedWhileQueued: true,
      accepted: 1,
      sent: result
    });
  });
  test("a rejected request is never accepted", async () => {
    let accepted = 0;
    const sent = await acceptAndAwaitSentRequest({ kind: "rejected", reason: "Empty message" }, () => accepted++);
    assert.deepStrictEqual({ accepted, sent }, { accepted: 0, sent: void 0 });
  });
  test("a queued request that is rejected when it runs stays accepted but is not sent", async () => {
    const deferred = new DeferredPromise();
    let accepted = 0;
    const pending = acceptAndAwaitSentRequest({ kind: "queued", deferred: deferred.p }, () => accepted++);
    await deferred.complete({ kind: "rejected", reason: "Session is read-only" });
    assert.deepStrictEqual({ accepted, sent: await pending }, { accepted: 1, sent: void 0 });
  });
  test("accepting is optional", async () => {
    const result = sentResult();
    assert.strictEqual(await acceptAndAwaitSentRequest(result), result);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0V2lkZ2V0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBhY2NlcHRBbmRBd2FpdFNlbnRSZXF1ZXN0LCBnZXRJbW1lZGlhdGVTaWxlbnRTbGFzaENvbW1hbmRQYXJ0LCBsYXlvdXRDaGF0V2lkZ2V0Rm9ySW5wdXRIZWlnaHQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0V2lkZ2V0LmpzJztcbmltcG9ydCB7IENoYXRTZW5kUmVzdWx0LCBDaGF0U2VuZFJlc3VsdFNlbnQsIElDaGF0U2VuZFJlcXVlc3REYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQsIENoYXRSZXF1ZXN0VGV4dFBhcnQsIElQYXJzZWRDaGF0UmVxdWVzdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9yZXF1ZXN0UGFyc2VyL2NoYXRQYXJzZXJUeXBlcy5qcyc7XG5cbnN1aXRlKCdDaGF0V2lkZ2V0JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2lkZW50aWZpZXMgb25seSBsZWFkaW5nIHNpbGVudCBleGVjdXRlLWltbWVkaWF0ZWx5IHNsYXNoIGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBuZXcgQ2hhdFJlcXVlc3RTbGFzaENvbW1hbmRQYXJ0KFxuXHRcdFx0bmV3IE9mZnNldFJhbmdlKDAsIDcpLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDgpLFxuXHRcdFx0e1xuXHRcdFx0XHRjb21tYW5kOiAnbW9kZWxzJyxcblx0XHRcdFx0ZGV0YWlsOiAnT3BlbiBtb2RlbHMnLFxuXHRcdFx0XHRleGVjdXRlSW1tZWRpYXRlbHk6IHRydWUsXG5cdFx0XHRcdHNpbGVudDogdHJ1ZSxcblx0XHRcdFx0bG9jYXRpb25zOiBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0sXG5cdFx0XHR9LFxuXHRcdCk7XG5cdFx0Y29uc3Qgbm9uU2lsZW50Q29tbWFuZCA9IG5ldyBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQoXG5cdFx0XHRuZXcgT2Zmc2V0UmFuZ2UoMCwgNSksXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgNiksXG5cdFx0XHR7XG5cdFx0XHRcdGNvbW1hbmQ6ICdoZWxwJyxcblx0XHRcdFx0ZGV0YWlsOiAnU2hvdyBoZWxwJyxcblx0XHRcdFx0ZXhlY3V0ZUltbWVkaWF0ZWx5OiB0cnVlLFxuXHRcdFx0XHRzaWxlbnQ6IGZhbHNlLFxuXHRcdFx0XHRsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSxcblx0XHRcdH0sXG5cdFx0KTtcblx0XHRjb25zdCBkZWxheWVkQ29tbWFuZCA9IG5ldyBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQoXG5cdFx0XHRuZXcgT2Zmc2V0UmFuZ2UoMCwgNyksXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgOCksXG5cdFx0XHR7XG5cdFx0XHRcdGNvbW1hbmQ6ICdyZW5hbWUnLFxuXHRcdFx0XHRkZXRhaWw6ICdSZW5hbWUgY2hhdCcsXG5cdFx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogZmFsc2UsXG5cdFx0XHRcdHNpbGVudDogdHJ1ZSxcblx0XHRcdFx0bG9jYXRpb25zOiBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0sXG5cdFx0XHR9LFxuXHRcdCk7XG5cdFx0Y29uc3QgcHJlZml4ID0gbmV3IENoYXRSZXF1ZXN0VGV4dFBhcnQobmV3IE9mZnNldFJhbmdlKDAsIDEpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMiksICcgJyk7XG5cdFx0Y29uc3Qgc2hpZnRlZENvbW1hbmQgPSBuZXcgQ2hhdFJlcXVlc3RTbGFzaENvbW1hbmRQYXJ0KFxuXHRcdFx0bmV3IE9mZnNldFJhbmdlKDEsIDgpLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDIsIDEsIDkpLFxuXHRcdFx0Y29tbWFuZC5zbGFzaENvbW1hbmQsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0Z2V0SW1tZWRpYXRlU2lsZW50U2xhc2hDb21tYW5kUGFydCh7IHRleHQ6ICcvbW9kZWxzJywgcGFydHM6IFtjb21tYW5kXSB9IHNhdGlzZmllcyBJUGFyc2VkQ2hhdFJlcXVlc3QpPy5zbGFzaENvbW1hbmQuY29tbWFuZCxcblx0XHRcdGdldEltbWVkaWF0ZVNpbGVudFNsYXNoQ29tbWFuZFBhcnQoeyB0ZXh0OiAnL2hlbHAnLCBwYXJ0czogW25vblNpbGVudENvbW1hbmRdIH0gc2F0aXNmaWVzIElQYXJzZWRDaGF0UmVxdWVzdCk/LnNsYXNoQ29tbWFuZC5jb21tYW5kLFxuXHRcdFx0Z2V0SW1tZWRpYXRlU2lsZW50U2xhc2hDb21tYW5kUGFydCh7IHRleHQ6ICcvcmVuYW1lJywgcGFydHM6IFtkZWxheWVkQ29tbWFuZF0gfSBzYXRpc2ZpZXMgSVBhcnNlZENoYXRSZXF1ZXN0KT8uc2xhc2hDb21tYW5kLmNvbW1hbmQsXG5cdFx0XHRnZXRJbW1lZGlhdGVTaWxlbnRTbGFzaENvbW1hbmRQYXJ0KHsgdGV4dDogJyAvbW9kZWxzJywgcGFydHM6IFtwcmVmaXgsIHNoaWZ0ZWRDb21tYW5kXSB9IHNhdGlzZmllcyBJUGFyc2VkQ2hhdFJlcXVlc3QpPy5zbGFzaENvbW1hbmQuY29tbWFuZCxcblx0XHRdLCBbXG5cdFx0XHQnbW9kZWxzJyxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnaW5wdXQgaGVpZ2h0IGNoYW5nZXMgdXBkYXRlIHRoZSBidWRnZXQgd2l0aG91dCByZS1sYXlpbmcgb3V0IHRoZSBpbnB1dCcsICgpID0+IHtcblx0XHRjb25zdCBjYWxsczogdW5rbm93bltdID0gW107XG5cdFx0Y29uc3QgdGFyZ2V0ID0ge1xuXHRcdFx0c2V0SW5wdXRQYXJ0TWF4SGVpZ2h0T3ZlcnJpZGU6IChoZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZCkgPT4gY2FsbHMucHVzaChbJ3NldElucHV0UGFydE1heEhlaWdodE92ZXJyaWRlJywgaGVpZ2h0XSksXG5cdFx0XHRsYXlvdXRGb3JJbnB1dEhlaWdodDogKGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKSA9PiBjYWxscy5wdXNoKFsnbGF5b3V0Rm9ySW5wdXRIZWlnaHQnLCBoZWlnaHQsIHdpZHRoXSksXG5cdFx0fTtcblxuXHRcdGxheW91dENoYXRXaWRnZXRGb3JJbnB1dEhlaWdodCh0YXJnZXQsIDYwMCwgNDIwLCA3MjApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW1xuXHRcdFx0WydzZXRJbnB1dFBhcnRNYXhIZWlnaHRPdmVycmlkZScsIDYwMF0sXG5cdFx0XHRbJ2xheW91dEZvcklucHV0SGVpZ2h0JywgNDIwLCA3MjBdLFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdFdpZGdldCAtIGFjY2VwdEFuZEF3YWl0U2VudFJlcXVlc3QnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gc2VudFJlc3VsdCgpOiBDaGF0U2VuZFJlc3VsdFNlbnQge1xuXHRcdHJldHVybiB7IGtpbmQ6ICdzZW50JywgZGF0YToge30gYXMgSUNoYXRTZW5kUmVxdWVzdERhdGEgfTtcblx0fVxuXG5cdHRlc3QoJ2FuIGltbWVkaWF0ZWx5IHNlbnQgcmVxdWVzdCBpcyBhY2NlcHRlZCBhbmQgcmV0dXJuZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGFjY2VwdGVkID0gMDtcblx0XHRjb25zdCByZXN1bHQgPSBzZW50UmVzdWx0KCk7XG5cblx0XHRjb25zdCBzZW50ID0gYXdhaXQgYWNjZXB0QW5kQXdhaXRTZW50UmVxdWVzdChyZXN1bHQsICgpID0+IGFjY2VwdGVkKyspO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFjY2VwdGVkLCBzZW50IH0sIHsgYWNjZXB0ZWQ6IDEsIHNlbnQ6IHJlc3VsdCB9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBxdWV1ZWQgcmVxdWVzdCBpcyBhY2NlcHRlZCBiZWZvcmUgdGhlIHF1ZXVlZCByZXF1ZXN0IHNldHRsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPENoYXRTZW5kUmVzdWx0PigpO1xuXHRcdGxldCBhY2NlcHRlZCA9IDA7XG5cblx0XHRjb25zdCBwZW5kaW5nID0gYWNjZXB0QW5kQXdhaXRTZW50UmVxdWVzdCh7IGtpbmQ6ICdxdWV1ZWQnLCBkZWZlcnJlZDogZGVmZXJyZWQucCB9LCAoKSA9PiBhY2NlcHRlZCsrKTtcblx0XHQvLyBUaGUgcXVldWVkIHJlcXVlc3QgaGFzIG5vdCBydW4geWV0LCBzbyBgcGVuZGluZ2AgaXMgc3RpbGwgdW5yZXNvbHZlZCBoZXJlLlxuXHRcdGNvbnN0IGFjY2VwdGVkV2hpbGVRdWV1ZWQgPSBhY2NlcHRlZCA9PT0gMTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHNlbnRSZXN1bHQoKTtcblx0XHRhd2FpdCBkZWZlcnJlZC5jb21wbGV0ZShyZXN1bHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFjY2VwdGVkV2hpbGVRdWV1ZWQsIGFjY2VwdGVkLCBzZW50OiBhd2FpdCBwZW5kaW5nIH0sIHtcblx0XHRcdGFjY2VwdGVkV2hpbGVRdWV1ZWQ6IHRydWUsXG5cdFx0XHRhY2NlcHRlZDogMSxcblx0XHRcdHNlbnQ6IHJlc3VsdCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSByZWplY3RlZCByZXF1ZXN0IGlzIG5ldmVyIGFjY2VwdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBhY2NlcHRlZCA9IDA7XG5cblx0XHRjb25zdCBzZW50ID0gYXdhaXQgYWNjZXB0QW5kQXdhaXRTZW50UmVxdWVzdCh7IGtpbmQ6ICdyZWplY3RlZCcsIHJlYXNvbjogJ0VtcHR5IG1lc3NhZ2UnIH0sICgpID0+IGFjY2VwdGVkKyspO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFjY2VwdGVkLCBzZW50IH0sIHsgYWNjZXB0ZWQ6IDAsIHNlbnQ6IHVuZGVmaW5lZCB9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBxdWV1ZWQgcmVxdWVzdCB0aGF0IGlzIHJlamVjdGVkIHdoZW4gaXQgcnVucyBzdGF5cyBhY2NlcHRlZCBidXQgaXMgbm90IHNlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPENoYXRTZW5kUmVzdWx0PigpO1xuXHRcdGxldCBhY2NlcHRlZCA9IDA7XG5cblx0XHRjb25zdCBwZW5kaW5nID0gYWNjZXB0QW5kQXdhaXRTZW50UmVxdWVzdCh7IGtpbmQ6ICdxdWV1ZWQnLCBkZWZlcnJlZDogZGVmZXJyZWQucCB9LCAoKSA9PiBhY2NlcHRlZCsrKTtcblx0XHRhd2FpdCBkZWZlcnJlZC5jb21wbGV0ZSh7IGtpbmQ6ICdyZWplY3RlZCcsIHJlYXNvbjogJ1Nlc3Npb24gaXMgcmVhZC1vbmx5JyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhY2NlcHRlZCwgc2VudDogYXdhaXQgcGVuZGluZyB9LCB7IGFjY2VwdGVkOiAxLCBzZW50OiB1bmRlZmluZWQgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjY2VwdGluZyBpcyBvcHRpb25hbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBzZW50UmVzdWx0KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgYWNjZXB0QW5kQXdhaXRTZW50UmVxdWVzdChyZXN1bHQpLCByZXN1bHQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBQ3hE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
