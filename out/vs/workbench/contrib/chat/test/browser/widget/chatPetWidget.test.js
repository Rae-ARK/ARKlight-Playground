import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { NullTelemetryServiceShape } from "../../../../../../platform/telemetry/common/telemetryUtils.js";
import { TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { ChatPetService, getChatPetVariant } from "../../../browser/chatPetService.js";
import { CHAT_PET_IDLE_SLEEP_DELAY, doesChatPetStateTrackCursor, getChatPetAnimationFrame, getChatPetBaseState, getChatPetBuddyName, getChatPetClickInteraction, getChatPetFrameDurations, getChatPetGazeDirection, getChatPetHorizontalPosition, getChatPetRenderedState, getChatPetSpeechFrameDurations, getChatPetSpriteName, isChatPetImageSource, isChatPetVisible } from "../../../browser/widget/chatPetWidget.js";
suite("ChatPetWidget", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  class TestTelemetryService extends NullTelemetryServiceShape {
    constructor() {
      super(...arguments);
      this.events = [];
    }
    publicLog2(eventName, data) {
      if (eventName) {
        this.events.push({ name: eventName, data });
      }
    }
  }
  test("maps chat activity to pet states by priority", () => {
    assert.deepStrictEqual([
      getChatPetBaseState(false, false, false, false),
      getChatPetBaseState(false, false, false, true),
      getChatPetBaseState(false, false, true, false),
      getChatPetBaseState(false, false, true, true),
      getChatPetBaseState(true, false, true, true),
      getChatPetBaseState(true, true, true, true)
    ], [
      "idle",
      "sleep",
      "typing",
      "sleep",
      "rendering",
      "clapping"
    ]);
  });
  test("only shows in the latest focused chat widget when enabled", () => {
    assert.deepStrictEqual([
      isChatPetVisible(false, false),
      isChatPetVisible(false, true),
      isChatPetVisible(true, false),
      isChatPetVisible(true, true)
    ], [
      false,
      false,
      false,
      true
    ]);
  });
  test("gives dragging precedence over base and transient states", () => {
    assert.deepStrictEqual([
      getChatPetRenderedState("rendering", void 0, false),
      getChatPetRenderedState("rendering", "complete", false),
      getChatPetRenderedState("rendering", void 0, true),
      getChatPetRenderedState("rendering", "complete", true)
    ], [
      "rendering",
      "complete",
      "idle",
      "idle"
    ]);
  });
  test("sleeps after twenty seconds of inactivity", () => {
    assert.strictEqual(CHAT_PET_IDLE_SLEEP_DELAY, 2e4);
  });
  test("selects the buddy for the product quality", () => {
    assert.deepStrictEqual([
      getChatPetBuddyName("stable"),
      getChatPetBuddyName("insider"),
      getChatPetBuddyName(void 0)
    ], [
      "buddy-idle-stable",
      "buddy-idle-insiders",
      "buddy-idle-insiders"
    ]);
  });
  test("resolves configured and product pet variants", () => {
    assert.deepStrictEqual([
      getChatPetVariant("stable", "insider"),
      getChatPetVariant("insiders", "stable"),
      getChatPetVariant(void 0, "stable"),
      getChatPetVariant(void 0, "insider")
    ], [
      "stable",
      "insiders",
      "stable",
      "insiders"
    ]);
  });
  test("logs pet enablement at startup and when toggled", () => {
    const telemetryService = new TestTelemetryService();
    const service = disposables.add(new ChatPetService(disposables.add(new TestStorageService()), telemetryService));
    service.toggle();
    service.toggle();
    assert.deepStrictEqual(telemetryService.events, [
      { name: "chatPetEnablement", data: { enabled: false, source: "startup" } },
      { name: "chatPetEnablement", data: { enabled: true, source: "change" } },
      { name: "chatPetEnablement", data: { enabled: false, source: "change" } }
    ]);
  });
  test("maps random values to click interactions", () => {
    assert.deepStrictEqual([
      getChatPetClickInteraction(0),
      getChatPetClickInteraction(0.24),
      getChatPetClickInteraction(0.26),
      getChatPetClickInteraction(0.49),
      getChatPetClickInteraction(0.51),
      getChatPetClickInteraction(0.74),
      getChatPetClickInteraction(0.76),
      getChatPetClickInteraction(0.99)
    ], [
      "love",
      "love",
      "jump",
      "jump",
      "cool",
      "cool",
      "yapping",
      "yapping"
    ]);
  });
  test("does not repeat the previous click interaction", () => {
    assert.deepStrictEqual([
      getChatPetClickInteraction(0, "love"),
      getChatPetClickInteraction(0.99, "love"),
      getChatPetClickInteraction(0, "jump"),
      getChatPetClickInteraction(0.99, "jump"),
      getChatPetClickInteraction(0, "cool"),
      getChatPetClickInteraction(0.99, "cool"),
      getChatPetClickInteraction(0, "yapping"),
      getChatPetClickInteraction(0.99, "yapping")
    ], [
      "jump",
      "yapping",
      "love",
      "yapping",
      "love",
      "yapping",
      "love",
      "cool"
    ]);
  });
  test("disables cursor tracking for fixed-eye sprite states", () => {
    assert.deepStrictEqual([
      doesChatPetStateTrackCursor("idle"),
      doesChatPetStateTrackCursor("sleep"),
      doesChatPetStateTrackCursor("waking"),
      doesChatPetStateTrackCursor("typing"),
      doesChatPetStateTrackCursor("rendering"),
      doesChatPetStateTrackCursor("complete"),
      doesChatPetStateTrackCursor("love"),
      doesChatPetStateTrackCursor("cool"),
      doesChatPetStateTrackCursor("yapping"),
      doesChatPetStateTrackCursor("yappingMouthOpen"),
      doesChatPetStateTrackCursor("onTheRun"),
      doesChatPetStateTrackCursor("searching")
    ], [
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false
    ]);
  });
  test("keeps automatic completion separate from the yapping sprite", () => {
    assert.deepStrictEqual([
      getChatPetSpriteName("complete", "insider"),
      getChatPetSpriteName("sleep", "insider"),
      getChatPetSpriteName("waking", "stable"),
      getChatPetSpriteName("typing", "insider"),
      getChatPetSpriteName("rendering", "stable"),
      getChatPetSpriteName("cool", "stable"),
      getChatPetSpriteName("searching", "stable"),
      getChatPetSpriteName("yappingMouthOpen", "insider")
    ], [
      "buddy-idle-insiders",
      "buddy-sleep-insiders",
      "buddy-waking-stable",
      "buddy-typing-insiders",
      "buddy-rendering-stable",
      "buddy-cool-stable",
      "buddy-search-stable",
      "buddy-yapping-insiders"
    ]);
  });
  test("preserves the source animation timing", () => {
    assert.deepStrictEqual([
      getChatPetFrameDurations("idle"),
      getChatPetFrameDurations("sleep"),
      getChatPetFrameDurations("waking"),
      getChatPetFrameDurations("typing"),
      getChatPetFrameDurations("rendering"),
      getChatPetFrameDurations("clapping"),
      getChatPetFrameDurations("love"),
      getChatPetFrameDurations("cool"),
      getChatPetFrameDurations("searching"),
      getChatPetFrameDurations("yapping"),
      getChatPetFrameDurations("yappingMouthOpen"),
      getChatPetSpeechFrameDurations()
    ], [
      Array.from({ length: 50 }, () => 40),
      Array.from({ length: 8 }, () => 300),
      [160, 100, 80, 90, 90, 90, 100, 170],
      Array.from({ length: 8 }, () => 120),
      Array.from({ length: 50 }, () => 40),
      [80, 40, 40, 40, 80, 40, 40, 40, 40, 80, 40, 40, 80],
      [200, 200, 380, 100, 80, 1980],
      [600, 120, 120, 120, 160, 80, 80, 80, 1640],
      [500, 500, 500, 500],
      [],
      [300, 240, 1500, 240, 360],
      [220, 220, 220, 100, 160, 180]
    ]);
  });
  test("selects animation frames and completes on the final frame", () => {
    const frameDurations = [100, 50, 150];
    assert.deepStrictEqual([
      getChatPetAnimationFrame([], 0, 1),
      getChatPetAnimationFrame(frameDurations, -1, 1),
      getChatPetAnimationFrame(frameDurations, 99, 1),
      getChatPetAnimationFrame(frameDurations, 100, 1),
      getChatPetAnimationFrame(frameDurations, 149, 1),
      getChatPetAnimationFrame(frameDurations, 150, 1),
      getChatPetAnimationFrame(frameDurations, 299, 1),
      getChatPetAnimationFrame(frameDurations, 300, 1),
      getChatPetAnimationFrame(frameDurations, 300, Infinity),
      getChatPetAnimationFrame(frameDurations, 600, 2)
    ], [
      { frameIndex: 0, complete: true },
      { frameIndex: 0, complete: false },
      { frameIndex: 0, complete: false },
      { frameIndex: 1, complete: false },
      { frameIndex: 1, complete: false },
      { frameIndex: 2, complete: false },
      { frameIndex: 2, complete: false },
      { frameIndex: 2, complete: true },
      { frameIndex: 0, complete: false },
      { frameIndex: 2, complete: true }
    ]);
  });
  test("matches sprite sources without browser URL normalization", () => {
    const source = "vscode-file://vscode-app/Applications/Visual Studio Code - Insiders.app/pet.gif";
    const image = document.createElement("img");
    image.src = source;
    assert.deepStrictEqual([
      image.src === source,
      isChatPetImageSource(image, source)
    ], [
      false,
      true
    ]);
  });
  test("maps the cursor to pixel-snapped gaze directions", () => {
    assert.deepStrictEqual([
      getChatPetGazeDirection(10, 0, 0, 0),
      getChatPetGazeDirection(10, 10, 0, 0),
      getChatPetGazeDirection(0, 10, 0, 0),
      getChatPetGazeDirection(-10, 10, 0, 0),
      getChatPetGazeDirection(-10, 0, 0, 0),
      getChatPetGazeDirection(-10, -10, 0, 0),
      getChatPetGazeDirection(0, -10, 0, 0),
      getChatPetGazeDirection(10, -10, 0, 0),
      getChatPetGazeDirection(0, 0, 0, 0)
    ], [
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
      [0, -1],
      [1, -1],
      [0, 0]
    ]);
  });
  test("clamps horizontal movement to the input bounds", () => {
    assert.deepStrictEqual([
      getChatPetHorizontalPosition(-20, 10, 100),
      getChatPetHorizontalPosition(50, 10, 100),
      getChatPetHorizontalPosition(120, 10, 100),
      getChatPetHorizontalPosition(20, 40, 20)
    ], [
      10,
      50,
      100,
      40
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0UGV0V2lkZ2V0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBDaGF0UGV0U2VydmljZSwgZ2V0Q2hhdFBldFZhcmlhbnQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NoYXRQZXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENIQVRfUEVUX0lETEVfU0xFRVBfREVMQVksIGRvZXNDaGF0UGV0U3RhdGVUcmFja0N1cnNvciwgZ2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lLCBnZXRDaGF0UGV0QmFzZVN0YXRlLCBnZXRDaGF0UGV0QnVkZHlOYW1lLCBnZXRDaGF0UGV0Q2xpY2tJbnRlcmFjdGlvbiwgZ2V0Q2hhdFBldEZyYW1lRHVyYXRpb25zLCBnZXRDaGF0UGV0R2F6ZURpcmVjdGlvbiwgZ2V0Q2hhdFBldEhvcml6b250YWxQb3NpdGlvbiwgZ2V0Q2hhdFBldFJlbmRlcmVkU3RhdGUsIGdldENoYXRQZXRTcGVlY2hGcmFtZUR1cmF0aW9ucywgZ2V0Q2hhdFBldFNwcml0ZU5hbWUsIGlzQ2hhdFBldEltYWdlU291cmNlLCBpc0NoYXRQZXRWaXNpYmxlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdFBldFdpZGdldC5qcyc7XG5cbnN1aXRlKCdDaGF0UGV0V2lkZ2V0JywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y2xhc3MgVGVzdFRlbGVtZXRyeVNlcnZpY2UgZXh0ZW5kcyBOdWxsVGVsZW1ldHJ5U2VydmljZVNoYXBlIHtcblx0XHRyZWFkb25seSBldmVudHM6IHsgcmVhZG9ubHkgbmFtZTogc3RyaW5nOyByZWFkb25seSBkYXRhOiB1bmtub3duIH1bXSA9IFtdO1xuXG5cdFx0b3ZlcnJpZGUgcHVibGljTG9nMihldmVudE5hbWU/OiBzdHJpbmcsIGRhdGE/OiB1bmtub3duKTogdm9pZCB7XG5cdFx0XHRpZiAoZXZlbnROYW1lKSB7XG5cdFx0XHRcdHRoaXMuZXZlbnRzLnB1c2goeyBuYW1lOiBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dGVzdCgnbWFwcyBjaGF0IGFjdGl2aXR5IHRvIHBldCBzdGF0ZXMgYnkgcHJpb3JpdHknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRnZXRDaGF0UGV0QmFzZVN0YXRlKGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlKSxcblx0XHRcdGdldENoYXRQZXRCYXNlU3RhdGUoZmFsc2UsIGZhbHNlLCBmYWxzZSwgdHJ1ZSksXG5cdFx0XHRnZXRDaGF0UGV0QmFzZVN0YXRlKGZhbHNlLCBmYWxzZSwgdHJ1ZSwgZmFsc2UpLFxuXHRcdFx0Z2V0Q2hhdFBldEJhc2VTdGF0ZShmYWxzZSwgZmFsc2UsIHRydWUsIHRydWUpLFxuXHRcdFx0Z2V0Q2hhdFBldEJhc2VTdGF0ZSh0cnVlLCBmYWxzZSwgdHJ1ZSwgdHJ1ZSksXG5cdFx0XHRnZXRDaGF0UGV0QmFzZVN0YXRlKHRydWUsIHRydWUsIHRydWUsIHRydWUpLFxuXHRcdF0sIFtcblx0XHRcdCdpZGxlJyxcblx0XHRcdCdzbGVlcCcsXG5cdFx0XHQndHlwaW5nJyxcblx0XHRcdCdzbGVlcCcsXG5cdFx0XHQncmVuZGVyaW5nJyxcblx0XHRcdCdjbGFwcGluZycsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29ubHkgc2hvd3MgaW4gdGhlIGxhdGVzdCBmb2N1c2VkIGNoYXQgd2lkZ2V0IHdoZW4gZW5hYmxlZCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGlzQ2hhdFBldFZpc2libGUoZmFsc2UsIGZhbHNlKSxcblx0XHRcdGlzQ2hhdFBldFZpc2libGUoZmFsc2UsIHRydWUpLFxuXHRcdFx0aXNDaGF0UGV0VmlzaWJsZSh0cnVlLCBmYWxzZSksXG5cdFx0XHRpc0NoYXRQZXRWaXNpYmxlKHRydWUsIHRydWUpLFxuXHRcdF0sIFtcblx0XHRcdGZhbHNlLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRmYWxzZSxcblx0XHRcdHRydWUsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dpdmVzIGRyYWdnaW5nIHByZWNlZGVuY2Ugb3ZlciBiYXNlIGFuZCB0cmFuc2llbnQgc3RhdGVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0Z2V0Q2hhdFBldFJlbmRlcmVkU3RhdGUoJ3JlbmRlcmluZycsIHVuZGVmaW5lZCwgZmFsc2UpLFxuXHRcdFx0Z2V0Q2hhdFBldFJlbmRlcmVkU3RhdGUoJ3JlbmRlcmluZycsICdjb21wbGV0ZScsIGZhbHNlKSxcblx0XHRcdGdldENoYXRQZXRSZW5kZXJlZFN0YXRlKCdyZW5kZXJpbmcnLCB1bmRlZmluZWQsIHRydWUpLFxuXHRcdFx0Z2V0Q2hhdFBldFJlbmRlcmVkU3RhdGUoJ3JlbmRlcmluZycsICdjb21wbGV0ZScsIHRydWUpLFxuXHRcdF0sIFtcblx0XHRcdCdyZW5kZXJpbmcnLFxuXHRcdFx0J2NvbXBsZXRlJyxcblx0XHRcdCdpZGxlJyxcblx0XHRcdCdpZGxlJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2xlZXBzIGFmdGVyIHR3ZW50eSBzZWNvbmRzIG9mIGluYWN0aXZpdHknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKENIQVRfUEVUX0lETEVfU0xFRVBfREVMQVksIDIwXzAwMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGVjdHMgdGhlIGJ1ZGR5IGZvciB0aGUgcHJvZHVjdCBxdWFsaXR5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0Z2V0Q2hhdFBldEJ1ZGR5TmFtZSgnc3RhYmxlJyksXG5cdFx0XHRnZXRDaGF0UGV0QnVkZHlOYW1lKCdpbnNpZGVyJyksXG5cdFx0XHRnZXRDaGF0UGV0QnVkZHlOYW1lKHVuZGVmaW5lZCksXG5cdFx0XSwgW1xuXHRcdFx0J2J1ZGR5LWlkbGUtc3RhYmxlJyxcblx0XHRcdCdidWRkeS1pZGxlLWluc2lkZXJzJyxcblx0XHRcdCdidWRkeS1pZGxlLWluc2lkZXJzJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZXMgY29uZmlndXJlZCBhbmQgcHJvZHVjdCBwZXQgdmFyaWFudHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRnZXRDaGF0UGV0VmFyaWFudCgnc3RhYmxlJywgJ2luc2lkZXInKSxcblx0XHRcdGdldENoYXRQZXRWYXJpYW50KCdpbnNpZGVycycsICdzdGFibGUnKSxcblx0XHRcdGdldENoYXRQZXRWYXJpYW50KHVuZGVmaW5lZCwgJ3N0YWJsZScpLFxuXHRcdFx0Z2V0Q2hhdFBldFZhcmlhbnQodW5kZWZpbmVkLCAnaW5zaWRlcicpLFxuXHRcdF0sIFtcblx0XHRcdCdzdGFibGUnLFxuXHRcdFx0J2luc2lkZXJzJyxcblx0XHRcdCdzdGFibGUnLFxuXHRcdFx0J2luc2lkZXJzJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbG9ncyBwZXQgZW5hYmxlbWVudCBhdCBzdGFydHVwIGFuZCB3aGVuIHRvZ2dsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IG5ldyBUZXN0VGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRQZXRTZXJ2aWNlKGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpLCB0ZWxlbWV0cnlTZXJ2aWNlKSk7XG5cblx0XHRzZXJ2aWNlLnRvZ2dsZSgpO1xuXHRcdHNlcnZpY2UudG9nZ2xlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeVNlcnZpY2UuZXZlbnRzLCBbXG5cdFx0XHR7IG5hbWU6ICdjaGF0UGV0RW5hYmxlbWVudCcsIGRhdGE6IHsgZW5hYmxlZDogZmFsc2UsIHNvdXJjZTogJ3N0YXJ0dXAnIH0gfSxcblx0XHRcdHsgbmFtZTogJ2NoYXRQZXRFbmFibGVtZW50JywgZGF0YTogeyBlbmFibGVkOiB0cnVlLCBzb3VyY2U6ICdjaGFuZ2UnIH0gfSxcblx0XHRcdHsgbmFtZTogJ2NoYXRQZXRFbmFibGVtZW50JywgZGF0YTogeyBlbmFibGVkOiBmYWxzZSwgc291cmNlOiAnY2hhbmdlJyB9IH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcHMgcmFuZG9tIHZhbHVlcyB0byBjbGljayBpbnRlcmFjdGlvbnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRnZXRDaGF0UGV0Q2xpY2tJbnRlcmFjdGlvbigwKSxcblx0XHRcdGdldENoYXRQZXRDbGlja0ludGVyYWN0aW9uKDAuMjQpLFxuXHRcdFx0Z2V0Q2hhdFBldENsaWNrSW50ZXJhY3Rpb24oMC4yNiksXG5cdFx0XHRnZXRDaGF0UGV0Q2xpY2tJbnRlcmFjdGlvbigwLjQ5KSxcblx0XHRcdGdldENoYXRQZXRDbGlja0ludGVyYWN0aW9uKDAuNTEpLFxuXHRcdFx0Z2V0Q2hhdFBldENsaWNrSW50ZXJhY3Rpb24oMC43NCksXG5cdFx0XHRnZXRDaGF0UGV0Q2xpY2tJbnRlcmFjdGlvbigwLjc2KSxcblx0XHRcdGdldENoYXRQZXRDbGlja0ludGVyYWN0aW9uKDAuOTkpLFxuXHRcdF0sIFtcblx0XHRcdCdsb3ZlJyxcblx0XHRcdCdsb3ZlJyxcblx0XHRcdCdqdW1wJyxcblx0XHRcdCdqdW1wJyxcblx0XHRcdCdjb29sJyxcblx0XHRcdCdjb29sJyxcblx0XHRcdCd5YXBwaW5nJyxcblx0XHRcdCd5YXBwaW5nJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVwZWF0IHRoZSBwcmV2aW91cyBjbGljayBpbnRlcmFjdGlvbicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGdldENoYXRQZXRDbGlja0ludGVyYWN0aW9uKDAsICdsb3ZlJyksXG5cdFx0XHRnZXRDaGF0UGV0Q2xpY2tJbnRlcmFjdGlvbigwLjk5LCAnbG92ZScpLFxuXHRcdFx0Z2V0Q2hhdFBldENsaWNrSW50ZXJhY3Rpb24oMCwgJ2p1bXAnKSxcblx0XHRcdGdldENoYXRQZXRDbGlja0ludGVyYWN0aW9uKDAuOTksICdqdW1wJyksXG5cdFx0XHRnZXRDaGF0UGV0Q2xpY2tJbnRlcmFjdGlvbigwLCAnY29vbCcpLFxuXHRcdFx0Z2V0Q2hhdFBldENsaWNrSW50ZXJhY3Rpb24oMC45OSwgJ2Nvb2wnKSxcblx0XHRcdGdldENoYXRQZXRDbGlja0ludGVyYWN0aW9uKDAsICd5YXBwaW5nJyksXG5cdFx0XHRnZXRDaGF0UGV0Q2xpY2tJbnRlcmFjdGlvbigwLjk5LCAneWFwcGluZycpLFxuXHRcdF0sIFtcblx0XHRcdCdqdW1wJyxcblx0XHRcdCd5YXBwaW5nJyxcblx0XHRcdCdsb3ZlJyxcblx0XHRcdCd5YXBwaW5nJyxcblx0XHRcdCdsb3ZlJyxcblx0XHRcdCd5YXBwaW5nJyxcblx0XHRcdCdsb3ZlJyxcblx0XHRcdCdjb29sJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzYWJsZXMgY3Vyc29yIHRyYWNraW5nIGZvciBmaXhlZC1leWUgc3ByaXRlIHN0YXRlcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGRvZXNDaGF0UGV0U3RhdGVUcmFja0N1cnNvcignaWRsZScpLFxuXHRcdFx0ZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKCdzbGVlcCcpLFxuXHRcdFx0ZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKCd3YWtpbmcnKSxcblx0XHRcdGRvZXNDaGF0UGV0U3RhdGVUcmFja0N1cnNvcigndHlwaW5nJyksXG5cdFx0XHRkb2VzQ2hhdFBldFN0YXRlVHJhY2tDdXJzb3IoJ3JlbmRlcmluZycpLFxuXHRcdFx0ZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKCdjb21wbGV0ZScpLFxuXHRcdFx0ZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKCdsb3ZlJyksXG5cdFx0XHRkb2VzQ2hhdFBldFN0YXRlVHJhY2tDdXJzb3IoJ2Nvb2wnKSxcblx0XHRcdGRvZXNDaGF0UGV0U3RhdGVUcmFja0N1cnNvcigneWFwcGluZycpLFxuXHRcdFx0ZG9lc0NoYXRQZXRTdGF0ZVRyYWNrQ3Vyc29yKCd5YXBwaW5nTW91dGhPcGVuJyksXG5cdFx0XHRkb2VzQ2hhdFBldFN0YXRlVHJhY2tDdXJzb3IoJ29uVGhlUnVuJyksXG5cdFx0XHRkb2VzQ2hhdFBldFN0YXRlVHJhY2tDdXJzb3IoJ3NlYXJjaGluZycpLFxuXHRcdF0sIFtcblx0XHRcdHRydWUsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR0cnVlLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRmYWxzZSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgYXV0b21hdGljIGNvbXBsZXRpb24gc2VwYXJhdGUgZnJvbSB0aGUgeWFwcGluZyBzcHJpdGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRnZXRDaGF0UGV0U3ByaXRlTmFtZSgnY29tcGxldGUnLCAnaW5zaWRlcicpLFxuXHRcdFx0Z2V0Q2hhdFBldFNwcml0ZU5hbWUoJ3NsZWVwJywgJ2luc2lkZXInKSxcblx0XHRcdGdldENoYXRQZXRTcHJpdGVOYW1lKCd3YWtpbmcnLCAnc3RhYmxlJyksXG5cdFx0XHRnZXRDaGF0UGV0U3ByaXRlTmFtZSgndHlwaW5nJywgJ2luc2lkZXInKSxcblx0XHRcdGdldENoYXRQZXRTcHJpdGVOYW1lKCdyZW5kZXJpbmcnLCAnc3RhYmxlJyksXG5cdFx0XHRnZXRDaGF0UGV0U3ByaXRlTmFtZSgnY29vbCcsICdzdGFibGUnKSxcblx0XHRcdGdldENoYXRQZXRTcHJpdGVOYW1lKCdzZWFyY2hpbmcnLCAnc3RhYmxlJyksXG5cdFx0XHRnZXRDaGF0UGV0U3ByaXRlTmFtZSgneWFwcGluZ01vdXRoT3BlbicsICdpbnNpZGVyJyksXG5cdFx0XSwgW1xuXHRcdFx0J2J1ZGR5LWlkbGUtaW5zaWRlcnMnLFxuXHRcdFx0J2J1ZGR5LXNsZWVwLWluc2lkZXJzJyxcblx0XHRcdCdidWRkeS13YWtpbmctc3RhYmxlJyxcblx0XHRcdCdidWRkeS10eXBpbmctaW5zaWRlcnMnLFxuXHRcdFx0J2J1ZGR5LXJlbmRlcmluZy1zdGFibGUnLFxuXHRcdFx0J2J1ZGR5LWNvb2wtc3RhYmxlJyxcblx0XHRcdCdidWRkeS1zZWFyY2gtc3RhYmxlJyxcblx0XHRcdCdidWRkeS15YXBwaW5nLWluc2lkZXJzJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIHRoZSBzb3VyY2UgYW5pbWF0aW9uIHRpbWluZycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGdldENoYXRQZXRGcmFtZUR1cmF0aW9ucygnaWRsZScpLFxuXHRcdFx0Z2V0Q2hhdFBldEZyYW1lRHVyYXRpb25zKCdzbGVlcCcpLFxuXHRcdFx0Z2V0Q2hhdFBldEZyYW1lRHVyYXRpb25zKCd3YWtpbmcnKSxcblx0XHRcdGdldENoYXRQZXRGcmFtZUR1cmF0aW9ucygndHlwaW5nJyksXG5cdFx0XHRnZXRDaGF0UGV0RnJhbWVEdXJhdGlvbnMoJ3JlbmRlcmluZycpLFxuXHRcdFx0Z2V0Q2hhdFBldEZyYW1lRHVyYXRpb25zKCdjbGFwcGluZycpLFxuXHRcdFx0Z2V0Q2hhdFBldEZyYW1lRHVyYXRpb25zKCdsb3ZlJyksXG5cdFx0XHRnZXRDaGF0UGV0RnJhbWVEdXJhdGlvbnMoJ2Nvb2wnKSxcblx0XHRcdGdldENoYXRQZXRGcmFtZUR1cmF0aW9ucygnc2VhcmNoaW5nJyksXG5cdFx0XHRnZXRDaGF0UGV0RnJhbWVEdXJhdGlvbnMoJ3lhcHBpbmcnKSxcblx0XHRcdGdldENoYXRQZXRGcmFtZUR1cmF0aW9ucygneWFwcGluZ01vdXRoT3BlbicpLFxuXHRcdFx0Z2V0Q2hhdFBldFNwZWVjaEZyYW1lRHVyYXRpb25zKCksXG5cdFx0XSwgW1xuXHRcdFx0QXJyYXkuZnJvbSh7IGxlbmd0aDogNTAgfSwgKCkgPT4gNDApLFxuXHRcdFx0QXJyYXkuZnJvbSh7IGxlbmd0aDogOCB9LCAoKSA9PiAzMDApLFxuXHRcdFx0WzE2MCwgMTAwLCA4MCwgOTAsIDkwLCA5MCwgMTAwLCAxNzBdLFxuXHRcdFx0QXJyYXkuZnJvbSh7IGxlbmd0aDogOCB9LCAoKSA9PiAxMjApLFxuXHRcdFx0QXJyYXkuZnJvbSh7IGxlbmd0aDogNTAgfSwgKCkgPT4gNDApLFxuXHRcdFx0WzgwLCA0MCwgNDAsIDQwLCA4MCwgNDAsIDQwLCA0MCwgNDAsIDgwLCA0MCwgNDAsIDgwXSxcblx0XHRcdFsyMDAsIDIwMCwgMzgwLCAxMDAsIDgwLCAxXzk4MF0sXG5cdFx0XHRbNjAwLCAxMjAsIDEyMCwgMTIwLCAxNjAsIDgwLCA4MCwgODAsIDFfNjQwXSxcblx0XHRcdFs1MDAsIDUwMCwgNTAwLCA1MDBdLFxuXHRcdFx0W10sXG5cdFx0XHRbMzAwLCAyNDAsIDFfNTAwLCAyNDAsIDM2MF0sXG5cdFx0XHRbMjIwLCAyMjAsIDIyMCwgMTAwLCAxNjAsIDE4MF0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGVjdHMgYW5pbWF0aW9uIGZyYW1lcyBhbmQgY29tcGxldGVzIG9uIHRoZSBmaW5hbCBmcmFtZScsICgpID0+IHtcblx0XHRjb25zdCBmcmFtZUR1cmF0aW9ucyA9IFsxMDAsIDUwLCAxNTBdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0Z2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lKFtdLCAwLCAxKSxcblx0XHRcdGdldENoYXRQZXRBbmltYXRpb25GcmFtZShmcmFtZUR1cmF0aW9ucywgLTEsIDEpLFxuXHRcdFx0Z2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lKGZyYW1lRHVyYXRpb25zLCA5OSwgMSksXG5cdFx0XHRnZXRDaGF0UGV0QW5pbWF0aW9uRnJhbWUoZnJhbWVEdXJhdGlvbnMsIDEwMCwgMSksXG5cdFx0XHRnZXRDaGF0UGV0QW5pbWF0aW9uRnJhbWUoZnJhbWVEdXJhdGlvbnMsIDE0OSwgMSksXG5cdFx0XHRnZXRDaGF0UGV0QW5pbWF0aW9uRnJhbWUoZnJhbWVEdXJhdGlvbnMsIDE1MCwgMSksXG5cdFx0XHRnZXRDaGF0UGV0QW5pbWF0aW9uRnJhbWUoZnJhbWVEdXJhdGlvbnMsIDI5OSwgMSksXG5cdFx0XHRnZXRDaGF0UGV0QW5pbWF0aW9uRnJhbWUoZnJhbWVEdXJhdGlvbnMsIDMwMCwgMSksXG5cdFx0XHRnZXRDaGF0UGV0QW5pbWF0aW9uRnJhbWUoZnJhbWVEdXJhdGlvbnMsIDMwMCwgSW5maW5pdHkpLFxuXHRcdFx0Z2V0Q2hhdFBldEFuaW1hdGlvbkZyYW1lKGZyYW1lRHVyYXRpb25zLCA2MDAsIDIpLFxuXHRcdF0sIFtcblx0XHRcdHsgZnJhbWVJbmRleDogMCwgY29tcGxldGU6IHRydWUgfSxcblx0XHRcdHsgZnJhbWVJbmRleDogMCwgY29tcGxldGU6IGZhbHNlIH0sXG5cdFx0XHR7IGZyYW1lSW5kZXg6IDAsIGNvbXBsZXRlOiBmYWxzZSB9LFxuXHRcdFx0eyBmcmFtZUluZGV4OiAxLCBjb21wbGV0ZTogZmFsc2UgfSxcblx0XHRcdHsgZnJhbWVJbmRleDogMSwgY29tcGxldGU6IGZhbHNlIH0sXG5cdFx0XHR7IGZyYW1lSW5kZXg6IDIsIGNvbXBsZXRlOiBmYWxzZSB9LFxuXHRcdFx0eyBmcmFtZUluZGV4OiAyLCBjb21wbGV0ZTogZmFsc2UgfSxcblx0XHRcdHsgZnJhbWVJbmRleDogMiwgY29tcGxldGU6IHRydWUgfSxcblx0XHRcdHsgZnJhbWVJbmRleDogMCwgY29tcGxldGU6IGZhbHNlIH0sXG5cdFx0XHR7IGZyYW1lSW5kZXg6IDIsIGNvbXBsZXRlOiB0cnVlIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hdGNoZXMgc3ByaXRlIHNvdXJjZXMgd2l0aG91dCBicm93c2VyIFVSTCBub3JtYWxpemF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNvdXJjZSA9ICd2c2NvZGUtZmlsZTovL3ZzY29kZS1hcHAvQXBwbGljYXRpb25zL1Zpc3VhbCBTdHVkaW8gQ29kZSAtIEluc2lkZXJzLmFwcC9wZXQuZ2lmJztcblx0XHRjb25zdCBpbWFnZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2ltZycpO1xuXHRcdGltYWdlLnNyYyA9IHNvdXJjZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0aW1hZ2Uuc3JjID09PSBzb3VyY2UsXG5cdFx0XHRpc0NoYXRQZXRJbWFnZVNvdXJjZShpbWFnZSwgc291cmNlKSxcblx0XHRdLCBbXG5cdFx0XHRmYWxzZSxcblx0XHRcdHRydWUsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcHMgdGhlIGN1cnNvciB0byBwaXhlbC1zbmFwcGVkIGdhemUgZGlyZWN0aW9ucycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGdldENoYXRQZXRHYXplRGlyZWN0aW9uKDEwLCAwLCAwLCAwKSxcblx0XHRcdGdldENoYXRQZXRHYXplRGlyZWN0aW9uKDEwLCAxMCwgMCwgMCksXG5cdFx0XHRnZXRDaGF0UGV0R2F6ZURpcmVjdGlvbigwLCAxMCwgMCwgMCksXG5cdFx0XHRnZXRDaGF0UGV0R2F6ZURpcmVjdGlvbigtMTAsIDEwLCAwLCAwKSxcblx0XHRcdGdldENoYXRQZXRHYXplRGlyZWN0aW9uKC0xMCwgMCwgMCwgMCksXG5cdFx0XHRnZXRDaGF0UGV0R2F6ZURpcmVjdGlvbigtMTAsIC0xMCwgMCwgMCksXG5cdFx0XHRnZXRDaGF0UGV0R2F6ZURpcmVjdGlvbigwLCAtMTAsIDAsIDApLFxuXHRcdFx0Z2V0Q2hhdFBldEdhemVEaXJlY3Rpb24oMTAsIC0xMCwgMCwgMCksXG5cdFx0XHRnZXRDaGF0UGV0R2F6ZURpcmVjdGlvbigwLCAwLCAwLCAwKSxcblx0XHRdLCBbXG5cdFx0XHRbMSwgMF0sXG5cdFx0XHRbMSwgMV0sXG5cdFx0XHRbMCwgMV0sXG5cdFx0XHRbLTEsIDFdLFxuXHRcdFx0Wy0xLCAwXSxcblx0XHRcdFstMSwgLTFdLFxuXHRcdFx0WzAsIC0xXSxcblx0XHRcdFsxLCAtMV0sXG5cdFx0XHRbMCwgMF0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsYW1wcyBob3Jpem9udGFsIG1vdmVtZW50IHRvIHRoZSBpbnB1dCBib3VuZHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRnZXRDaGF0UGV0SG9yaXpvbnRhbFBvc2l0aW9uKC0yMCwgMTAsIDEwMCksXG5cdFx0XHRnZXRDaGF0UGV0SG9yaXpvbnRhbFBvc2l0aW9uKDUwLCAxMCwgMTAwKSxcblx0XHRcdGdldENoYXRQZXRIb3Jpem9udGFsUG9zaXRpb24oMTIwLCAxMCwgMTAwKSxcblx0XHRcdGdldENoYXRQZXRIb3Jpem9udGFsUG9zaXRpb24oMjAsIDQwLCAyMCksXG5cdFx0XSwgW1xuXHRcdFx0MTAsXG5cdFx0XHQ1MCxcblx0XHRcdDEwMCxcblx0XHRcdDQwLFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0JBQWdCLHlCQUF5QjtBQUNsRCxTQUFTLDJCQUEyQiw2QkFBNkIsMEJBQTBCLHFCQUFxQixxQkFBcUIsNEJBQTRCLDBCQUEwQix5QkFBeUIsOEJBQThCLHlCQUF5QixnQ0FBZ0Msc0JBQXNCLHNCQUFzQix3QkFBd0I7QUFFL1csTUFBTSxpQkFBaUIsTUFBTTtBQUU1QixRQUFNLGNBQWMsd0NBQXdDO0FBQUEsRUFFNUQsTUFBTSw2QkFBNkIsMEJBQTBCO0FBQUEsSUFBN0Q7QUFBQTtBQUNDLFdBQVMsU0FBOEQsQ0FBQztBQUFBO0FBQUEsSUFFL0QsV0FBVyxXQUFvQixNQUFzQjtBQUM3RCxVQUFJLFdBQVc7QUFDZCxhQUFLLE9BQU8sS0FBSyxFQUFFLE1BQU0sV0FBVyxLQUFLLENBQUM7QUFBQSxNQUMzQztB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
