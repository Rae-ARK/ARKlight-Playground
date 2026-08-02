import assert from "assert";
import { CustomLineHeightData, LineHeightsManager } from "../../../common/viewLayout/lineHeights.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("Editor ViewLayout - LineHeightsManager", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("default line height is used when no custom heights exist", () => {
    const manager = new LineHeightsManager(10, []);
    assert.strictEqual(manager.heightForLineNumber(1), 10);
    assert.strictEqual(manager.heightForLineNumber(5), 10);
    assert.strictEqual(manager.heightForLineNumber(100), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 50);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(10), 100);
  });
  test("can change default line height", () => {
    const manager = new LineHeightsManager(10, []);
    manager.defaultLineHeight = 20;
    assert.strictEqual(manager.heightForLineNumber(1), 20);
    assert.strictEqual(manager.heightForLineNumber(5), 20);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 20);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 100);
  });
  test("can add single custom line height", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    assert.strictEqual(manager.heightForLineNumber(1), 10);
    assert.strictEqual(manager.heightForLineNumber(2), 10);
    assert.strictEqual(manager.heightForLineNumber(3), 20);
    assert.strictEqual(manager.heightForLineNumber(4), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(2), 20);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 40);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 50);
  });
  test("can add multiple custom line heights", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 2, 2, 15);
    manager.insertOrChangeCustomLineHeight("dec2", 4, 4, 25);
    assert.strictEqual(manager.heightForLineNumber(1), 10);
    assert.strictEqual(manager.heightForLineNumber(2), 15);
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.heightForLineNumber(4), 25);
    assert.strictEqual(manager.heightForLineNumber(5), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(2), 25);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 35);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 60);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 70);
  });
  test("can add range of custom line heights", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 2, 4, 15);
    assert.strictEqual(manager.heightForLineNumber(1), 10);
    assert.strictEqual(manager.heightForLineNumber(2), 15);
    assert.strictEqual(manager.heightForLineNumber(3), 15);
    assert.strictEqual(manager.heightForLineNumber(4), 15);
    assert.strictEqual(manager.heightForLineNumber(5), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(2), 25);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 40);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 55);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 65);
  });
  test("can change existing custom line height", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    assert.strictEqual(manager.heightForLineNumber(3), 20);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 30);
    assert.strictEqual(manager.heightForLineNumber(3), 30);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 50);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 60);
  });
  test("can remove custom line height", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    assert.strictEqual(manager.heightForLineNumber(3), 20);
    manager.removeCustomLineHeight("dec1");
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 30);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 40);
  });
  test("handles overlapping custom line heights (last one wins)", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 5, 20);
    manager.insertOrChangeCustomLineHeight("dec2", 4, 6, 30);
    assert.strictEqual(manager.heightForLineNumber(2), 10);
    assert.strictEqual(manager.heightForLineNumber(3), 20);
    assert.strictEqual(manager.heightForLineNumber(4), 30);
    assert.strictEqual(manager.heightForLineNumber(5), 30);
    assert.strictEqual(manager.heightForLineNumber(6), 30);
    assert.strictEqual(manager.heightForLineNumber(7), 10);
  });
  test("handles deleting lines before custom line heights", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 10, 12, 20);
    manager.onLinesDeleted(5, 7);
    assert.strictEqual(manager.heightForLineNumber(7), 20);
    assert.strictEqual(manager.heightForLineNumber(8), 20);
    assert.strictEqual(manager.heightForLineNumber(9), 20);
    assert.strictEqual(manager.heightForLineNumber(10), 10);
  });
  test("handles deleting lines overlapping with custom line heights", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 5, 10, 20);
    manager.onLinesDeleted(7, 12);
    assert.strictEqual(manager.heightForLineNumber(5), 20);
    assert.strictEqual(manager.heightForLineNumber(6), 20);
    assert.strictEqual(manager.heightForLineNumber(7), 10);
  });
  test("handles deleting lines containing custom line heights completely", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 5, 7, 20);
    manager.onLinesDeleted(4, 8);
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.heightForLineNumber(4), 20);
    assert.strictEqual(manager.heightForLineNumber(5), 10);
  });
  test("handles deleting lines at the very beginning", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("decA", 1, 1, 40);
    manager.onLinesDeleted(2, 4);
    assert.strictEqual(manager.heightForLineNumber(1), 40);
  });
  test("handles inserting lines before custom line heights", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 5, 7, 20);
    manager.onLinesInserted(3, 4);
    assert.strictEqual(manager.heightForLineNumber(5), 10);
    assert.strictEqual(manager.heightForLineNumber(6), 10);
    assert.strictEqual(manager.heightForLineNumber(7), 20);
    assert.strictEqual(manager.heightForLineNumber(8), 20);
    assert.strictEqual(manager.heightForLineNumber(9), 20);
  });
  test("handles inserting lines inside custom line heights range", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 5, 7, 20);
    manager.onLinesInserted(6, 7);
    assert.strictEqual(manager.heightForLineNumber(5), 20);
    assert.strictEqual(manager.heightForLineNumber(6), 20);
    assert.strictEqual(manager.heightForLineNumber(7), 20);
    assert.strictEqual(manager.heightForLineNumber(8), 20);
    assert.strictEqual(manager.heightForLineNumber(9), 20);
  });
  test("changing decoration id maintains custom line height", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 5, 7, 20);
    manager.removeCustomLineHeight("dec1");
    manager.insertOrChangeCustomLineHeight("dec2", 5, 7, 20);
    assert.strictEqual(manager.heightForLineNumber(5), 20);
    assert.strictEqual(manager.heightForLineNumber(6), 20);
    assert.strictEqual(manager.heightForLineNumber(7), 20);
  });
  test("accumulates heights correctly with complex setup", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 15);
    manager.insertOrChangeCustomLineHeight("dec2", 5, 7, 20);
    manager.insertOrChangeCustomLineHeight("dec3", 10, 10, 30);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(2), 20);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 35);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 45);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 65);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(7), 105);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(9), 125);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(10), 155);
  });
  test("partial deletion with multiple lines for the same decoration ID", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("decSame", 5, 5, 20);
    manager.insertOrChangeCustomLineHeight("decSame", 6, 6, 25);
    manager.onLinesDeleted(6, 6);
    assert.strictEqual(manager.heightForLineNumber(5), 10);
    assert.strictEqual(manager.heightForLineNumber(6), 25);
  });
  test("overlapping decorations use maximum line height", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("decA", 3, 5, 40);
    manager.insertOrChangeCustomLineHeight("decB", 4, 6, 30);
    assert.strictEqual(manager.heightForLineNumber(3), 40);
    assert.strictEqual(manager.heightForLineNumber(4), 40);
    assert.strictEqual(manager.heightForLineNumber(5), 40);
    assert.strictEqual(manager.heightForLineNumber(6), 30);
  });
  test("onLinesInserted with same decoration ID extending to inserted line", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("decA", 1, 1, 30);
    assert.strictEqual(manager.heightForLineNumber(1), 30);
    assert.strictEqual(manager.heightForLineNumber(2), 10);
    manager.onLinesInserted(2, 2);
    manager.insertOrChangeCustomLineHeight("decA", 2, 2, 30);
    assert.strictEqual(manager.heightForLineNumber(1), 10);
    assert.strictEqual(manager.heightForLineNumber(2), 30);
    assert.strictEqual(manager.heightForLineNumber(3), 10);
  });
});
suite("Editor ViewLayout - LineHeightsManager (auto-commit on read)", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("read after single insert without commit", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    assert.strictEqual(manager.heightForLineNumber(1), 10);
    assert.strictEqual(manager.heightForLineNumber(3), 20);
    assert.strictEqual(manager.heightForLineNumber(4), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 40);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 50);
  });
  test("read after multiple inserts without commit", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 2, 2, 15);
    manager.insertOrChangeCustomLineHeight("dec2", 4, 4, 25);
    assert.strictEqual(manager.heightForLineNumber(2), 15);
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.heightForLineNumber(4), 25);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 60);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 70);
  });
  test("read after remove without commit", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    assert.strictEqual(manager.heightForLineNumber(3), 20);
    manager.removeCustomLineHeight("dec1");
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 30);
  });
  test("insert then remove same decoration without commit", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    manager.removeCustomLineHeight("dec1");
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 30);
  });
  test("insert same decoration ID twice without commit replaces first", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    manager.insertOrChangeCustomLineHeight("dec1", 5, 5, 30);
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.heightForLineNumber(5), 30);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 70);
  });
  test("interleaved callers: remove must cancel queued inserts before first flush", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("decA", 3, 3, 20);
    manager.insertOrChangeCustomLineHeight("decB", 4, 4, 30);
    manager.removeCustomLineHeight("decA");
    manager.onLinesInserted(1, 1);
    assert.strictEqual(manager.heightForLineNumber(4), 10);
    assert.strictEqual(manager.heightForLineNumber(5), 30);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 70);
  });
  test("interleaved callers: remove must cancel queued inserts before delete flush", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("decA", 3, 3, 20);
    manager.insertOrChangeCustomLineHeight("decB", 5, 5, 30);
    manager.removeCustomLineHeight("decA");
    manager.onLinesDeleted(1, 1);
    assert.strictEqual(manager.heightForLineNumber(2), 10);
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.heightForLineNumber(4), 30);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 60);
  });
  test("interleaved: insert, insert, onLinesInserted, onLinesDeleted, remove, remove, insert, insert, read", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 2, 2, 20);
    manager.insertOrChangeCustomLineHeight("dec2", 5, 5, 30);
    manager.onLinesInserted(3, 4);
    manager.onLinesDeleted(1, 1);
    manager.removeCustomLineHeight("dec1");
    manager.removeCustomLineHeight("dec2");
    manager.insertOrChangeCustomLineHeight("dec3", 3, 3, 40);
    manager.insertOrChangeCustomLineHeight("dec4", 5, 5, 50);
    assert.strictEqual(manager.heightForLineNumber(1), 10);
    assert.strictEqual(manager.heightForLineNumber(3), 40);
    assert.strictEqual(manager.heightForLineNumber(4), 10);
    assert.strictEqual(manager.heightForLineNumber(5), 50);
    assert.strictEqual(manager.heightForLineNumber(6), 10);
  });
  test("interleaved: insert, onLinesInserted, remove, read", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    manager.onLinesInserted(1, 1);
    manager.removeCustomLineHeight("dec1");
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.heightForLineNumber(4), 10);
  });
  test("interleaved: onLinesDeleted, insert, read", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 5, 5, 20);
    manager.onLinesDeleted(1, 2);
    manager.insertOrChangeCustomLineHeight("dec2", 1, 1, 30);
    assert.strictEqual(manager.heightForLineNumber(1), 30);
    assert.strictEqual(manager.heightForLineNumber(2), 10);
    assert.strictEqual(manager.heightForLineNumber(3), 20);
  });
  test("interleaved: insert, onLinesDeleted, insert, read", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    manager.onLinesDeleted(1, 1);
    manager.insertOrChangeCustomLineHeight("dec2", 5, 5, 30);
    assert.strictEqual(manager.heightForLineNumber(1), 10);
    assert.strictEqual(manager.heightForLineNumber(2), 20);
    assert.strictEqual(manager.heightForLineNumber(5), 30);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 80);
  });
  test("onLinesInserted then onLinesDeleted without reads between", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    manager.onLinesInserted(1, 2);
    manager.onLinesDeleted(1, 1);
    assert.strictEqual(manager.heightForLineNumber(4), 20);
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 50);
  });
  test("multiple onLinesInserted without reads between", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    manager.onLinesInserted(1, 1);
    manager.onLinesInserted(1, 1);
    assert.strictEqual(manager.heightForLineNumber(5), 20);
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.heightForLineNumber(4), 10);
  });
  test("multiple onLinesDeleted without reads between", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 10, 10, 20);
    manager.onLinesDeleted(1, 2);
    manager.onLinesDeleted(1, 2);
    assert.strictEqual(manager.heightForLineNumber(6), 20);
    assert.strictEqual(manager.heightForLineNumber(7), 10);
  });
  test("pending insert then onLinesDeleted affecting that line", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    manager.onLinesDeleted(3, 3);
    assert.strictEqual(manager.heightForLineNumber(3), 20);
  });
  test("pending insert then onLinesInserted shifting that line", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 3, 3, 20);
    manager.onLinesInserted(1, 2);
    assert.strictEqual(manager.heightForLineNumber(3), 10);
    assert.strictEqual(manager.heightForLineNumber(5), 20);
  });
  test("accumulated heights correct after interleaved ops without commit", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 2, 2, 15);
    manager.insertOrChangeCustomLineHeight("dec2", 4, 4, 25);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(1), 10);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(2), 25);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(3), 35);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(4), 60);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(5), 70);
  });
  test("constructor with initial data works without explicit commit", () => {
    const data = [
      new CustomLineHeightData("dec1", 2, 4, 20),
      new CustomLineHeightData("dec2", 6, 6, 30)
    ];
    const manager = new LineHeightsManager(10, data);
    assert.strictEqual(manager.heightForLineNumber(1), 10);
    assert.strictEqual(manager.heightForLineNumber(2), 20);
    assert.strictEqual(manager.heightForLineNumber(3), 20);
    assert.strictEqual(manager.heightForLineNumber(4), 20);
    assert.strictEqual(manager.heightForLineNumber(5), 10);
    assert.strictEqual(manager.heightForLineNumber(6), 30);
    assert.strictEqual(manager.getAccumulatedLineHeightsIncludingLineNumber(6), 110);
  });
  test("deleting line 2 with lineHeightsRemoved re-adding at line 1 moves special line to line 1", () => {
    const manager = new LineHeightsManager(10, []);
    manager.insertOrChangeCustomLineHeight("dec1", 2, 2, 20);
    assert.strictEqual(manager.heightForLineNumber(2), 20);
    manager.onLinesDeleted(2, 2);
    manager.insertOrChangeCustomLineHeight("dec1", 1, 1, 20);
    assert.strictEqual(manager.heightForLineNumber(1), 20);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi92aWV3TGF5b3V0L2xpbmVIZWlnaHRzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDdXN0b21MaW5lSGVpZ2h0RGF0YSwgTGluZUhlaWdodHNNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdMYXlvdXQvbGluZUhlaWdodHMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdFZGl0b3IgVmlld0xheW91dCAtIExpbmVIZWlnaHRzTWFuYWdlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdkZWZhdWx0IGxpbmUgaGVpZ2h0IGlzIHVzZWQgd2hlbiBubyBjdXN0b20gaGVpZ2h0cyBleGlzdCcsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXG5cdFx0Ly8gQ2hlY2sgaW5kaXZpZHVhbCBsaW5lIGhlaWdodHNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDEpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig1KSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMTAwKSwgMTApO1xuXG5cdFx0Ly8gQ2hlY2sgYWNjdW11bGF0ZWQgaGVpZ2h0c1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDEpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoNSksIDUwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcigxMCksIDEwMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBjaGFuZ2UgZGVmYXVsdCBsaW5lIGhlaWdodCcsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdG1hbmFnZXIuZGVmYXVsdExpbmVIZWlnaHQgPSAyMDtcblxuXHRcdC8vIENoZWNrIGluZGl2aWR1YWwgbGluZSBoZWlnaHRzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigxKSwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNSksIDIwKTtcblxuXHRcdC8vIENoZWNrIGFjY3VtdWxhdGVkIGhlaWdodHNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcigxKSwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDUpLCAxMDApO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gYWRkIHNpbmdsZSBjdXN0b20gbGluZSBoZWlnaHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScsIDMsIDMsIDIwKTtcblxuXHRcdC8vIENoZWNrIGluZGl2aWR1YWwgbGluZSBoZWlnaHRzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigxKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMiksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDMpLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig0KSwgMTApO1xuXG5cdFx0Ly8gQ2hlY2sgYWNjdW11bGF0ZWQgaGVpZ2h0c1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDEpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoMiksIDIwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcigzKSwgNDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDQpLCA1MCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBhZGQgbXVsdGlwbGUgY3VzdG9tIGxpbmUgaGVpZ2h0cycsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJywgMiwgMiwgMTUpO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMyJywgNCwgNCwgMjUpO1xuXG5cdFx0Ly8gQ2hlY2sgaW5kaXZpZHVhbCBsaW5lIGhlaWdodHNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDEpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigyKSwgMTUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMyksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDQpLCAyNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig1KSwgMTApO1xuXG5cdFx0Ly8gQ2hlY2sgYWNjdW11bGF0ZWQgaGVpZ2h0c1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDEpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoMiksIDI1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcigzKSwgMzUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDQpLCA2MCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoNSksIDcwKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGFkZCByYW5nZSBvZiBjdXN0b20gbGluZSBoZWlnaHRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAyLCA0LCAxNSk7XG5cblx0XHQvLyBDaGVjayBpbmRpdmlkdWFsIGxpbmUgaGVpZ2h0c1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMSksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDIpLCAxNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMTUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNCksIDE1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDUpLCAxMCk7XG5cblx0XHQvLyBDaGVjayBhY2N1bXVsYXRlZCBoZWlnaHRzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoMSksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcigyKSwgMjUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDMpLCA0MCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoNCksIDU1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcig1KSwgNjUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gY2hhbmdlIGV4aXN0aW5nIGN1c3RvbSBsaW5lIGhlaWdodCcsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJywgMywgMywgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMyksIDIwKTtcblxuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJywgMywgMywgMzApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMyksIDMwKTtcblxuXHRcdC8vIENoZWNrIGFjY3VtdWxhdGVkIGhlaWdodHMgYWZ0ZXIgY2hhbmdlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoMyksIDUwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcig0KSwgNjApO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gcmVtb3ZlIGN1c3RvbSBsaW5lIGhlaWdodCcsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJywgMywgMywgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMyksIDIwKTtcblxuXHRcdG1hbmFnZXIucmVtb3ZlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMyksIDEwKTtcblxuXHRcdC8vIENoZWNrIGFjY3VtdWxhdGVkIGhlaWdodHMgYWZ0ZXIgcmVtb3ZhbFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDMpLCAzMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoNCksIDQwKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBvdmVybGFwcGluZyBjdXN0b20gbGluZSBoZWlnaHRzIChsYXN0IG9uZSB3aW5zKScsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJywgMywgNSwgMjApO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMyJywgNCwgNiwgMzApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigyKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMyksIDIwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDQpLCAzMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig1KSwgMzApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNiksIDMwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDcpLCAxMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgZGVsZXRpbmcgbGluZXMgYmVmb3JlIGN1c3RvbSBsaW5lIGhlaWdodHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScsIDEwLCAxMiwgMjApO1xuXG5cdFx0bWFuYWdlci5vbkxpbmVzRGVsZXRlZCg1LCA3KTsgLy8gRGVsZXRlIGxpbmVzIDUtN1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig3KSwgMjApOyAvLyBXYXMgbGluZSAxMFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoOCksIDIwKTsgLy8gV2FzIGxpbmUgMTFcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDkpLCAyMCk7IC8vIFdhcyBsaW5lIDEyXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigxMCksIDEwKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBkZWxldGluZyBsaW5lcyBvdmVybGFwcGluZyB3aXRoIGN1c3RvbSBsaW5lIGhlaWdodHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScsIDUsIDEwLCAyMCk7XG5cblx0XHRtYW5hZ2VyLm9uTGluZXNEZWxldGVkKDcsIDEyKTsgLy8gRGVsZXRlIGxpbmVzIDctMTIsIGluY2x1ZGluZyBwYXJ0IG9mIGRlY29yYXRpb25cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNSksIDIwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDYpLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig3KSwgMTApO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIGRlbGV0aW5nIGxpbmVzIGNvbnRhaW5pbmcgY3VzdG9tIGxpbmUgaGVpZ2h0cyBjb21wbGV0ZWx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCA1LCA3LCAyMCk7XG5cblx0XHRtYW5hZ2VyLm9uTGluZXNEZWxldGVkKDQsIDgpOyAvLyBEZWxldGUgbGluZXMgNC04LCBjb21wbGV0ZWx5IGNvbnRhaW5zIGRlY29yYXRpb25cblxuXHRcdC8vIFRoZSBkZWNvcmF0aW9uIGNvbGxhcHNlcyB0byBhIHNpbmdsZSBsaW5lIHdoaWNoIG1hdGNoZXMgdGhlIGJlaGF2aW9yIGluIHRoZSB0ZXh0IGJ1ZmZlclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMyksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDQpLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig1KSwgMTApO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIGRlbGV0aW5nIGxpbmVzIGF0IHRoZSB2ZXJ5IGJlZ2lubmluZycsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWNBJywgMSwgMSwgNDApO1xuXG5cdFx0bWFuYWdlci5vbkxpbmVzRGVsZXRlZCgyLCA0KTsgLy8gRGVsZXRlIGxpbmVzIDItNCBhZnRlciB0aGUgdmFyaWFibGUgbGluZSBoZWlnaHRcblxuXHRcdC8vIENoZWNrIGluZGl2aWR1YWwgbGluZSBoZWlnaHRzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigxKSwgNDApO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIGluc2VydGluZyBsaW5lcyBiZWZvcmUgY3VzdG9tIGxpbmUgaGVpZ2h0cycsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJywgNSwgNywgMjApO1xuXG5cdFx0bWFuYWdlci5vbkxpbmVzSW5zZXJ0ZWQoMywgNCk7IC8vIEluc2VydCAyIGxpbmVzIGF0IGxpbmUgM1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig1KSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNiksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDcpLCAyMCk7IC8vIFdhcyBsaW5lIDVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDgpLCAyMCk7IC8vIFdhcyBsaW5lIDZcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDkpLCAyMCk7IC8vIFdhcyBsaW5lIDdcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBpbnNlcnRpbmcgbGluZXMgaW5zaWRlIGN1c3RvbSBsaW5lIGhlaWdodHMgcmFuZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScsIDUsIDcsIDIwKTtcblxuXHRcdG1hbmFnZXIub25MaW5lc0luc2VydGVkKDYsIDcpOyAvLyBJbnNlcnQgMiBsaW5lcyBhdCBsaW5lIDZcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNSksIDIwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDYpLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig3KSwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoOCksIDIwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDkpLCAyMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoYW5naW5nIGRlY29yYXRpb24gaWQgbWFpbnRhaW5zIGN1c3RvbSBsaW5lIGhlaWdodCcsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJywgNSwgNywgMjApO1xuXG5cdFx0bWFuYWdlci5yZW1vdmVDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJyk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzInLCA1LCA3LCAyMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDUpLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig2KSwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNyksIDIwKTtcblx0fSk7XG5cblx0dGVzdCgnYWNjdW11bGF0ZXMgaGVpZ2h0cyBjb3JyZWN0bHkgd2l0aCBjb21wbGV4IHNldHVwJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAzLCAzLCAxNSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzInLCA1LCA3LCAyMCk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzMnLCAxMCwgMTAsIDMwKTtcblxuXHRcdC8vIENoZWNrIGFjY3VtdWxhdGVkIGhlaWdodHNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcigxKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDIpLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoMyksIDM1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcig0KSwgNDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDUpLCA2NSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoNyksIDEwNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoOSksIDEyNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoMTApLCAxNTUpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJ0aWFsIGRlbGV0aW9uIHdpdGggbXVsdGlwbGUgbGluZXMgZm9yIHRoZSBzYW1lIGRlY29yYXRpb24gSUQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFuYWdlciA9IG5ldyBMaW5lSGVpZ2h0c01hbmFnZXIoMTAsIFtdKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjU2FtZScsIDUsIDUsIDIwKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjU2FtZScsIDYsIDYsIDI1KTtcblxuXHRcdC8vIERlbGV0ZSBvbmUgbGluZSB0aGF0IHBhcnRpYWxseSBpbnRlcnNlY3RzIHRoZSBzYW1lIGRlY29yYXRpb25cblx0XHRtYW5hZ2VyLm9uTGluZXNEZWxldGVkKDYsIDYpO1xuXG5cdFx0Ly8gQ2hlY2sgaW5kaXZpZHVhbCBsaW5lIGhlaWdodHNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDUpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig2KSwgMjUpO1xuXHR9KTtcblxuXHR0ZXN0KCdvdmVybGFwcGluZyBkZWNvcmF0aW9ucyB1c2UgbWF4aW11bSBsaW5lIGhlaWdodCcsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWNBJywgMywgNSwgNDApO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWNCJywgNCwgNiwgMzApO1xuXG5cdFx0Ly8gQ2hlY2sgaW5kaXZpZHVhbCBsaW5lIGhlaWdodHNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDMpLCA0MCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig0KSwgNDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNSksIDQwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDYpLCAzMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uTGluZXNJbnNlcnRlZCB3aXRoIHNhbWUgZGVjb3JhdGlvbiBJRCBleHRlbmRpbmcgdG8gaW5zZXJ0ZWQgbGluZScsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdC8vIFNldCB1cCBhIHNwZWNpYWwgbGluZSBhdCBsaW5lIDEgd2l0aCBkZWNvcmF0aW9uICdkZWNBJ1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWNBJywgMSwgMSwgMzApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigxKSwgMzApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMiksIDEwKTtcblxuXHRcdC8vIEluc2VydCBsaW5lIDIgdG8gbGluZSAyLCB3aXRoIHRoZSBzYW1lIGRlY29yYXRpb24gSUQgJ2RlY0EnIGNvdmVyaW5nIGxpbmUgMlxuXHRcdG1hbmFnZXIub25MaW5lc0luc2VydGVkKDIsIDIpO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWNBJywgMiwgMiwgMzApO1xuXG5cdFx0Ly8gQWZ0ZXIgaW5zZXJ0aW9uLCB0aGUgZGVjb3JhdGlvbiAnZGVjQScgbm93IGNvdmVycyBsaW5lIDJcblx0XHQvLyBTaW5jZSBpbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQgcmVtb3ZlcyB0aGUgb2xkIGRlY29yYXRpb24gZmlyc3QsXG5cdFx0Ly8gbGluZSAxIG5vIGxvbmdlciBoYXMgdGhlIGN1c3RvbSBoZWlnaHQsIGFuZCBsaW5lIDIgZ2V0cyBpdFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMSksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDIpLCAzMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMTApO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnRWRpdG9yIFZpZXdMYXlvdXQgLSBMaW5lSGVpZ2h0c01hbmFnZXIgKGF1dG8tY29tbWl0IG9uIHJlYWQpJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIC0tLSBBdXRvLWNvbW1pdCBvbiByZWFkOiByZWFkcyB3aXRob3V0IGV4cGxpY2l0IGNvbW1pdCgpIC0tLVxuXG5cdHRlc3QoJ3JlYWQgYWZ0ZXIgc2luZ2xlIGluc2VydCB3aXRob3V0IGNvbW1pdCcsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJywgMywgMywgMjApO1xuXHRcdC8vIE5vIGNvbW1pdCgpIGNhbGwgXHUyMDE0IHJlYWQgc2hvdWxkIHN0aWxsIHdvcmtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDEpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNCksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcigzKSwgNDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDQpLCA1MCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWQgYWZ0ZXIgbXVsdGlwbGUgaW5zZXJ0cyB3aXRob3V0IGNvbW1pdCcsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJywgMiwgMiwgMTUpO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMyJywgNCwgNCwgMjUpO1xuXHRcdC8vIE5vIGNvbW1pdCgpIGNhbGxcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDIpLCAxNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNCksIDI1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcig0KSwgNjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDUpLCA3MCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWQgYWZ0ZXIgcmVtb3ZlIHdpdGhvdXQgY29tbWl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAzLCAzLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMjApO1xuXG5cdFx0bWFuYWdlci5yZW1vdmVDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJyk7XG5cdFx0Ly8gTm8gY29tbWl0KCkgY2FsbFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMyksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcigzKSwgMzApO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgdGhlbiByZW1vdmUgc2FtZSBkZWNvcmF0aW9uIHdpdGhvdXQgY29tbWl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAzLCAzLCAyMCk7XG5cdFx0bWFuYWdlci5yZW1vdmVDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJyk7XG5cdFx0Ly8gTm8gY29tbWl0KCkgY2FsbCBcdTIwMTQgc2hvdWxkIHNlZSBkZWZhdWx0IGhlaWdodFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMyksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcigzKSwgMzApO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgc2FtZSBkZWNvcmF0aW9uIElEIHR3aWNlIHdpdGhvdXQgY29tbWl0IHJlcGxhY2VzIGZpcnN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAzLCAzLCAyMCk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCA1LCA1LCAzMCk7XG5cdFx0Ly8gTm8gY29tbWl0KCkgXHUyMDE0IHNlY29uZCBjYWxsIHNob3VsZCByZXBsYWNlIGZpcnN0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNSksIDMwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcig1KSwgNzApO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnRlcmxlYXZlZCBjYWxsZXJzOiByZW1vdmUgbXVzdCBjYW5jZWwgcXVldWVkIGluc2VydHMgYmVmb3JlIGZpcnN0IGZsdXNoJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cblx0XHQvLyBDYWxsZXIgQSBxdWV1ZXMgZGVjb3JhdGlvbiBpbnNlcnQuXG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlY0EnLCAzLCAzLCAyMCk7XG5cdFx0Ly8gQ2FsbGVyIEIgcXVldWVzIGluZGVwZW5kZW50IGluc2VydC5cblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjQicsIDQsIDQsIDMwKTtcblx0XHQvLyBDYWxsZXIgQSByZW1vdmVzIGl0cyBkZWNvcmF0aW9uIGJlZm9yZSBhbnkgZmx1c2ggb2NjdXJzLlxuXHRcdG1hbmFnZXIucmVtb3ZlQ3VzdG9tTGluZUhlaWdodCgnZGVjQScpO1xuXHRcdC8vIENhbGxlciBCIHRyaWdnZXJzIGEgc3RydWN0dXJhbCBjaGFuZ2UgdGhhdCBjYXVzZXMgcXVldWUgZmx1c2ggaW4gdGhlIG1pZGRsZSBvZiBjb21taXQuXG5cdFx0bWFuYWdlci5vbkxpbmVzSW5zZXJ0ZWQoMSwgMSk7XG5cblx0XHQvLyBkZWNBIG11c3Qgc3RheSByZW1vdmVkLiBJZiBxdWV1ZWQgaW5zZXJ0cyBhcmUgbm90IGNhbmNlbGVkIG9uIHJlbW92ZSwgZGVjQSBpbmNvcnJlY3RseSBzdXJ2aXZlcy5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDQpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig1KSwgMzApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDUpLCA3MCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ludGVybGVhdmVkIGNhbGxlcnM6IHJlbW92ZSBtdXN0IGNhbmNlbCBxdWV1ZWQgaW5zZXJ0cyBiZWZvcmUgZGVsZXRlIGZsdXNoJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjQScsIDMsIDMsIDIwKTtcblx0XHRtYW5hZ2VyLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodCgnZGVjQicsIDUsIDUsIDMwKTtcblx0XHRtYW5hZ2VyLnJlbW92ZUN1c3RvbUxpbmVIZWlnaHQoJ2RlY0EnKTtcblx0XHRtYW5hZ2VyLm9uTGluZXNEZWxldGVkKDEsIDEpO1xuXG5cdFx0Ly8gQWZ0ZXIgZGVsZXRpbmcgbGluZSAxLCBkZWNCIHNoaWZ0cyBmcm9tIGxpbmUgNSB0byBsaW5lIDQuXG5cdFx0Ly8gZGVjQSBtdXN0IHJlbWFpbiByZW1vdmVkIGV2ZW4gdGhvdWdoIGl0cyBpbnNlcnQgd2FzIHF1ZXVlZCBiZWZvcmUgdGhlIHJlbW92ZS5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDIpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNCksIDMwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcig0KSwgNjApO1xuXHR9KTtcblxuXHQvLyAtLS0gSW50ZXJsZWF2ZWQgb3BlcmF0aW9ucyAtLS1cblxuXHR0ZXN0KCdpbnRlcmxlYXZlZDogaW5zZXJ0LCBpbnNlcnQsIG9uTGluZXNJbnNlcnRlZCwgb25MaW5lc0RlbGV0ZWQsIHJlbW92ZSwgcmVtb3ZlLCBpbnNlcnQsIGluc2VydCwgcmVhZCcsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdC8vIFN0ZXAgMS0yOiB0d28gaW5zZXJ0c1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJywgMiwgMiwgMjApO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMyJywgNSwgNSwgMzApO1xuXHRcdC8vIFN0ZXAgMzogaW5zZXJ0IDIgbGluZXMgYXQgbGluZSAzIChzaGlmdHMgZGVjMiBmcm9tIGxpbmUgNSBcdTIxOTIgNylcblx0XHRtYW5hZ2VyLm9uTGluZXNJbnNlcnRlZCgzLCA0KTtcblx0XHQvLyBTdGVwIDQ6IGRlbGV0ZSBsaW5lIDEgKHNoaWZ0cyBkZWMxIGZyb20gbGluZSAyIFx1MjE5MiAxLCBkZWMyIGZyb20gbGluZSA3IFx1MjE5MiA2KVxuXHRcdG1hbmFnZXIub25MaW5lc0RlbGV0ZWQoMSwgMSk7XG5cdFx0Ly8gU3RlcCA1LTY6IHJlbW92ZSB0aGUgdHdvIGRlY29yYXRpb25zXG5cdFx0bWFuYWdlci5yZW1vdmVDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJyk7XG5cdFx0bWFuYWdlci5yZW1vdmVDdXN0b21MaW5lSGVpZ2h0KCdkZWMyJyk7XG5cdFx0Ly8gU3RlcCA3LTg6IHR3byBuZXcgaW5zZXJ0c1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMzJywgMywgMywgNDApO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWM0JywgNSwgNSwgNTApO1xuXHRcdC8vIFJlYWQgXHUyMDE0IG5vIGV4cGxpY2l0IGNvbW1pdFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMSksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDMpLCA0MCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig0KSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNSksIDUwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDYpLCAxMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ludGVybGVhdmVkOiBpbnNlcnQsIG9uTGluZXNJbnNlcnRlZCwgcmVtb3ZlLCByZWFkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAzLCAzLCAyMCk7XG5cdFx0Ly8gSW5zZXJ0IDEgbGluZSBhdCBsaW5lIDEgXHUyMTkyIGRlYzEgc2hpZnRzIGZyb20gMyBcdTIxOTIgNFxuXHRcdG1hbmFnZXIub25MaW5lc0luc2VydGVkKDEsIDEpO1xuXHRcdG1hbmFnZXIucmVtb3ZlQ3VzdG9tTGluZUhlaWdodCgnZGVjMScpO1xuXHRcdC8vIFJlYWQgXHUyMDE0IG5vIGV4cGxpY2l0IGNvbW1pdFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMyksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDQpLCAxMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ludGVybGVhdmVkOiBvbkxpbmVzRGVsZXRlZCwgaW5zZXJ0LCByZWFkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCA1LCA1LCAyMCk7XG5cdFx0Ly8gRGVsZXRlIGxpbmVzIDEtMiBcdTIxOTIgZGVjMSBzaGlmdHMgZnJvbSA1IFx1MjE5MiAzXG5cdFx0bWFuYWdlci5vbkxpbmVzRGVsZXRlZCgxLCAyKTtcblx0XHQvLyBJbnNlcnQgYSBuZXcgZGVjb3JhdGlvblxuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMyJywgMSwgMSwgMzApO1xuXHRcdC8vIFJlYWQgXHUyMDE0IG5vIGV4cGxpY2l0IGNvbW1pdFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMSksIDMwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDIpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigzKSwgMjApO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnRlcmxlYXZlZDogaW5zZXJ0LCBvbkxpbmVzRGVsZXRlZCwgaW5zZXJ0LCByZWFkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAzLCAzLCAyMCk7XG5cdFx0Ly8gRGVsZXRlIGxpbmUgMSBcdTIxOTIgZGVjMSBzaG91bGQgc2hpZnQgZnJvbSAzIFx1MjE5MiAyXG5cdFx0bWFuYWdlci5vbkxpbmVzRGVsZXRlZCgxLCAxKTtcblx0XHQvLyBBZGQgYW5vdGhlciBkZWNvcmF0aW9uXG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzInLCA1LCA1LCAzMCk7XG5cdFx0Ly8gUmVhZCBcdTIwMTQgbm8gZXhwbGljaXQgY29tbWl0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigxKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMiksIDIwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDUpLCAzMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoNSksIDgwKTtcblx0fSk7XG5cblx0Ly8gLS0tIEVkZ2UgY2FzZXMgLS0tXG5cblx0dGVzdCgnb25MaW5lc0luc2VydGVkIHRoZW4gb25MaW5lc0RlbGV0ZWQgd2l0aG91dCByZWFkcyBiZXR3ZWVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAzLCAzLCAyMCk7XG5cdFx0Ly8gSW5zZXJ0IDIgbGluZXMgYXQgbGluZSAxIFx1MjE5MiBkZWMxIG1vdmVzIGZyb20gMyBcdTIxOTIgNVxuXHRcdG1hbmFnZXIub25MaW5lc0luc2VydGVkKDEsIDIpO1xuXHRcdC8vIERlbGV0ZSBsaW5lIDEgXHUyMTkyIGRlYzEgbW92ZXMgZnJvbSA1IFx1MjE5MiA0XG5cdFx0bWFuYWdlci5vbkxpbmVzRGVsZXRlZCgxLCAxKTtcblx0XHQvLyBSZWFkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig0KSwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMyksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcig0KSwgNTApO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBvbkxpbmVzSW5zZXJ0ZWQgd2l0aG91dCByZWFkcyBiZXR3ZWVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAzLCAzLCAyMCk7XG5cdFx0Ly8gSW5zZXJ0IDEgbGluZSBhdCBsaW5lIDEgXHUyMTkyIGRlYzEgYXQgMyBcdTIxOTIgNFxuXHRcdG1hbmFnZXIub25MaW5lc0luc2VydGVkKDEsIDEpO1xuXHRcdC8vIEluc2VydCAxIGxpbmUgYXQgbGluZSAxIFx1MjE5MiBkZWMxIGF0IDQgXHUyMTkyIDVcblx0XHRtYW5hZ2VyLm9uTGluZXNJbnNlcnRlZCgxLCAxKTtcblx0XHQvLyBSZWFkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig1KSwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMyksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDQpLCAxMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIG9uTGluZXNEZWxldGVkIHdpdGhvdXQgcmVhZHMgYmV0d2VlbicsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJywgMTAsIDEwLCAyMCk7XG5cdFx0Ly8gRGVsZXRlIGxpbmVzIDEtMiBcdTIxOTIgZGVjMSBhdCAxMCBcdTIxOTIgOFxuXHRcdG1hbmFnZXIub25MaW5lc0RlbGV0ZWQoMSwgMik7XG5cdFx0Ly8gRGVsZXRlIGxpbmVzIDEtMiBcdTIxOTIgZGVjMSBhdCA4IFx1MjE5MiA2XG5cdFx0bWFuYWdlci5vbkxpbmVzRGVsZXRlZCgxLCAyKTtcblx0XHQvLyBSZWFkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig2KSwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNyksIDEwKTtcblx0fSk7XG5cblx0dGVzdCgncGVuZGluZyBpbnNlcnQgdGhlbiBvbkxpbmVzRGVsZXRlZCBhZmZlY3RpbmcgdGhhdCBsaW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0Ly8gSW5zZXJ0IGEgZGVjb3JhdGlvbiBhdCBsaW5lIDMgKHBlbmRpbmcsIG5vdCBjb21taXR0ZWQpXG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAzLCAzLCAyMCk7XG5cdFx0Ly8gRGVsZXRlIGxpbmUgMyBcdTIwMTQgc2hvdWxkIHJlbW92ZS9jb2xsYXBzZSB0aGUgcGVuZGluZyBkZWNvcmF0aW9uXG5cdFx0bWFuYWdlci5vbkxpbmVzRGVsZXRlZCgzLCAzKTtcblx0XHQvLyBSZWFkIFx1MjAxNCB0aGUgZGVjb3JhdGlvbiB3YXMgb24gdGhlIGRlbGV0ZWQgbGluZVxuXHRcdC8vIFRoZSBkZWNvcmF0aW9uIGNvbGxhcHNlcyB0byBsaW5lIDMgKGZyb21MaW5lTnVtYmVyKSBwZXIgb25MaW5lc0RlbGV0ZWQgYmVoYXZpb3Jcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDMpLCAyMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlbmRpbmcgaW5zZXJ0IHRoZW4gb25MaW5lc0luc2VydGVkIHNoaWZ0aW5nIHRoYXQgbGluZScsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdC8vIEluc2VydCBhIGRlY29yYXRpb24gYXQgbGluZSAzIChwZW5kaW5nLCBub3QgY29tbWl0dGVkKVxuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJywgMywgMywgMjApO1xuXHRcdC8vIEluc2VydCAyIGxpbmVzIGJlZm9yZSBpdCBhdCBsaW5lIDEgXHUyMTkyIHNob3VsZCBzaGlmdCBkZWMxIGZyb20gMyBcdTIxOTIgNVxuXHRcdG1hbmFnZXIub25MaW5lc0luc2VydGVkKDEsIDIpO1xuXHRcdC8vIFJlYWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDMpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig1KSwgMjApO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2N1bXVsYXRlZCBoZWlnaHRzIGNvcnJlY3QgYWZ0ZXIgaW50ZXJsZWF2ZWQgb3BzIHdpdGhvdXQgY29tbWl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBbXSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzEnLCAyLCAyLCAxNSk7XG5cdFx0bWFuYWdlci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoJ2RlYzInLCA0LCA0LCAyNSk7XG5cdFx0Ly8gTm8gY29tbWl0IFx1MjAxNCB2ZXJpZnkgYWNjdW11bGF0ZWQgaGVpZ2h0c1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDEpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoMiksIDI1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcigzKSwgMzUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjY3VtdWxhdGVkTGluZUhlaWdodHNJbmNsdWRpbmdMaW5lTnVtYmVyKDQpLCA2MCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0QWNjdW11bGF0ZWRMaW5lSGVpZ2h0c0luY2x1ZGluZ0xpbmVOdW1iZXIoNSksIDcwKTtcblx0fSk7XG5cblx0dGVzdCgnY29uc3RydWN0b3Igd2l0aCBpbml0aWFsIGRhdGEgd29ya3Mgd2l0aG91dCBleHBsaWNpdCBjb21taXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGF0YSA9IFtcblx0XHRcdG5ldyBDdXN0b21MaW5lSGVpZ2h0RGF0YSgnZGVjMScsIDIsIDQsIDIwKSxcblx0XHRcdG5ldyBDdXN0b21MaW5lSGVpZ2h0RGF0YSgnZGVjMicsIDYsIDYsIDMwKSxcblx0XHRdO1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBuZXcgTGluZUhlaWdodHNNYW5hZ2VyKDEwLCBkYXRhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDEpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcigyKSwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMyksIDIwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oZWlnaHRGb3JMaW5lTnVtYmVyKDQpLCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGVpZ2h0Rm9yTGluZU51bWJlcig1KSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoNiksIDMwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5nZXRBY2N1bXVsYXRlZExpbmVIZWlnaHRzSW5jbHVkaW5nTGluZU51bWJlcig2KSwgMTEwKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRpbmcgbGluZSAyIHdpdGggbGluZUhlaWdodHNSZW1vdmVkIHJlLWFkZGluZyBhdCBsaW5lIDEgbW92ZXMgc3BlY2lhbCBsaW5lIHRvIGxpbmUgMScsICgpID0+IHtcblx0XHRjb25zdCBtYW5hZ2VyID0gbmV3IExpbmVIZWlnaHRzTWFuYWdlcigxMCwgW10pO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJywgMiwgMiwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMiksIDIwKTtcblx0XHRtYW5hZ2VyLm9uTGluZXNEZWxldGVkKDIsIDIpO1xuXHRcdG1hbmFnZXIuaW5zZXJ0T3JDaGFuZ2VDdXN0b21MaW5lSGVpZ2h0KCdkZWMxJywgMSwgMSwgMjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhlaWdodEZvckxpbmVOdW1iZXIoMSksIDIwKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHNCQUFzQiwwQkFBMEI7QUFDekQsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSwwQ0FBMEMsTUFBTTtBQUVyRCwwQ0FBd0M7QUFFeEMsT0FBSyw0REFBNEQsTUFBTTtBQUN0RSxVQUFNLFVBQVUsSUFBSSxtQkFBbUIsSUFBSSxDQUFDLENBQUM7QUFHN0MsV0FBTyxZQUFZLFFBQVEs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
