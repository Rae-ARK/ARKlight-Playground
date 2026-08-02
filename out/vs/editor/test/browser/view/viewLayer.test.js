import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { RenderedLinesCollection } from "../../../browser/view/viewLayer.js";
class TestLine {
  constructor(id) {
    this.id = id;
    this._pinged = false;
  }
  onContentChanged() {
    this._pinged = true;
  }
  onTokensChanged() {
    this._pinged = true;
  }
}
function assertState(col, state) {
  const actualState = {
    startLineNumber: col.getStartLineNumber(),
    lines: [],
    pinged: []
  };
  for (let lineNumber = col.getStartLineNumber(); lineNumber <= col.getEndLineNumber(); lineNumber++) {
    actualState.lines.push(col.getLine(lineNumber).id);
    actualState.pinged.push(col.getLine(lineNumber)._pinged);
  }
  assert.deepStrictEqual(actualState, state);
}
suite("RenderedLinesCollection onLinesDeleted", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testOnModelLinesDeleted(deleteFromLineNumber, deleteToLineNumber, expectedDeleted, expectedState) {
    const col = new RenderedLinesCollection({ createLine: () => new TestLine("new") });
    col._set(6, [
      new TestLine("old6"),
      new TestLine("old7"),
      new TestLine("old8"),
      new TestLine("old9")
    ]);
    const actualDeleted1 = col.onLinesDeleted(deleteFromLineNumber, deleteToLineNumber);
    let actualDeleted = [];
    if (actualDeleted1) {
      actualDeleted = actualDeleted1.map((line) => line.id);
    }
    assert.deepStrictEqual(actualDeleted, expectedDeleted);
    assertState(col, expectedState);
  }
  test("A1", () => {
    testOnModelLinesDeleted(3, 3, [], {
      startLineNumber: 5,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A2", () => {
    testOnModelLinesDeleted(3, 4, [], {
      startLineNumber: 4,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A3", () => {
    testOnModelLinesDeleted(3, 5, [], {
      startLineNumber: 3,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A4", () => {
    testOnModelLinesDeleted(3, 6, ["old6"], {
      startLineNumber: 3,
      lines: ["old7", "old8", "old9"],
      pinged: [false, false, false]
    });
  });
  test("A5", () => {
    testOnModelLinesDeleted(3, 7, ["old6", "old7"], {
      startLineNumber: 3,
      lines: ["old8", "old9"],
      pinged: [false, false]
    });
  });
  test("A6", () => {
    testOnModelLinesDeleted(3, 8, ["old6", "old7", "old8"], {
      startLineNumber: 3,
      lines: ["old9"],
      pinged: [false]
    });
  });
  test("A7", () => {
    testOnModelLinesDeleted(3, 9, ["old6", "old7", "old8", "old9"], {
      startLineNumber: 3,
      lines: [],
      pinged: []
    });
  });
  test("A8", () => {
    testOnModelLinesDeleted(3, 10, ["old6", "old7", "old8", "old9"], {
      startLineNumber: 3,
      lines: [],
      pinged: []
    });
  });
  test("B1", () => {
    testOnModelLinesDeleted(5, 5, [], {
      startLineNumber: 5,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("B2", () => {
    testOnModelLinesDeleted(5, 6, ["old6"], {
      startLineNumber: 5,
      lines: ["old7", "old8", "old9"],
      pinged: [false, false, false]
    });
  });
  test("B3", () => {
    testOnModelLinesDeleted(5, 7, ["old6", "old7"], {
      startLineNumber: 5,
      lines: ["old8", "old9"],
      pinged: [false, false]
    });
  });
  test("B4", () => {
    testOnModelLinesDeleted(5, 8, ["old6", "old7", "old8"], {
      startLineNumber: 5,
      lines: ["old9"],
      pinged: [false]
    });
  });
  test("B5", () => {
    testOnModelLinesDeleted(5, 9, ["old6", "old7", "old8", "old9"], {
      startLineNumber: 5,
      lines: [],
      pinged: []
    });
  });
  test("B6", () => {
    testOnModelLinesDeleted(5, 10, ["old6", "old7", "old8", "old9"], {
      startLineNumber: 5,
      lines: [],
      pinged: []
    });
  });
  test("C1", () => {
    testOnModelLinesDeleted(6, 6, ["old6"], {
      startLineNumber: 6,
      lines: ["old7", "old8", "old9"],
      pinged: [false, false, false]
    });
  });
  test("C2", () => {
    testOnModelLinesDeleted(6, 7, ["old6", "old7"], {
      startLineNumber: 6,
      lines: ["old8", "old9"],
      pinged: [false, false]
    });
  });
  test("C3", () => {
    testOnModelLinesDeleted(6, 8, ["old6", "old7", "old8"], {
      startLineNumber: 6,
      lines: ["old9"],
      pinged: [false]
    });
  });
  test("C4", () => {
    testOnModelLinesDeleted(6, 9, ["old6", "old7", "old8", "old9"], {
      startLineNumber: 6,
      lines: [],
      pinged: []
    });
  });
  test("C5", () => {
    testOnModelLinesDeleted(6, 10, ["old6", "old7", "old8", "old9"], {
      startLineNumber: 6,
      lines: [],
      pinged: []
    });
  });
  test("D1", () => {
    testOnModelLinesDeleted(7, 7, ["old7"], {
      startLineNumber: 6,
      lines: ["old6", "old8", "old9"],
      pinged: [false, false, false]
    });
  });
  test("D2", () => {
    testOnModelLinesDeleted(7, 8, ["old7", "old8"], {
      startLineNumber: 6,
      lines: ["old6", "old9"],
      pinged: [false, false]
    });
  });
  test("D3", () => {
    testOnModelLinesDeleted(7, 9, ["old7", "old8", "old9"], {
      startLineNumber: 6,
      lines: ["old6"],
      pinged: [false]
    });
  });
  test("D4", () => {
    testOnModelLinesDeleted(7, 10, ["old7", "old8", "old9"], {
      startLineNumber: 6,
      lines: ["old6"],
      pinged: [false]
    });
  });
  test("E1", () => {
    testOnModelLinesDeleted(8, 8, ["old8"], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old9"],
      pinged: [false, false, false]
    });
  });
  test("E2", () => {
    testOnModelLinesDeleted(8, 9, ["old8", "old9"], {
      startLineNumber: 6,
      lines: ["old6", "old7"],
      pinged: [false, false]
    });
  });
  test("E3", () => {
    testOnModelLinesDeleted(8, 10, ["old8", "old9"], {
      startLineNumber: 6,
      lines: ["old6", "old7"],
      pinged: [false, false]
    });
  });
  test("F1", () => {
    testOnModelLinesDeleted(9, 9, ["old9"], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8"],
      pinged: [false, false, false]
    });
  });
  test("F2", () => {
    testOnModelLinesDeleted(9, 10, ["old9"], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8"],
      pinged: [false, false, false]
    });
  });
  test("G1", () => {
    testOnModelLinesDeleted(10, 10, [], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("G2", () => {
    testOnModelLinesDeleted(10, 11, [], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("H1", () => {
    testOnModelLinesDeleted(11, 13, [], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
});
suite("RenderedLinesCollection onLineChanged", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testOnModelLineChanged(changedLineNumber, expectedPinged, expectedState) {
    const col = new RenderedLinesCollection({ createLine: () => new TestLine("new") });
    col._set(6, [
      new TestLine("old6"),
      new TestLine("old7"),
      new TestLine("old8"),
      new TestLine("old9")
    ]);
    const actualPinged = col.onLinesChanged(changedLineNumber, 1);
    assert.deepStrictEqual(actualPinged, expectedPinged);
    assertState(col, expectedState);
  }
  test("3", () => {
    testOnModelLineChanged(3, false, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("4", () => {
    testOnModelLineChanged(4, false, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("5", () => {
    testOnModelLineChanged(5, false, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("6", () => {
    testOnModelLineChanged(6, true, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [true, false, false, false]
    });
  });
  test("7", () => {
    testOnModelLineChanged(7, true, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, true, false, false]
    });
  });
  test("8", () => {
    testOnModelLineChanged(8, true, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, true, false]
    });
  });
  test("9", () => {
    testOnModelLineChanged(9, true, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, true]
    });
  });
  test("10", () => {
    testOnModelLineChanged(10, false, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("11", () => {
    testOnModelLineChanged(11, false, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
});
suite("RenderedLinesCollection onLinesInserted", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testOnModelLinesInserted(insertFromLineNumber, insertToLineNumber, expectedDeleted, expectedState) {
    const col = new RenderedLinesCollection({ createLine: () => new TestLine("new") });
    col._set(6, [
      new TestLine("old6"),
      new TestLine("old7"),
      new TestLine("old8"),
      new TestLine("old9")
    ]);
    const actualDeleted1 = col.onLinesInserted(insertFromLineNumber, insertToLineNumber);
    let actualDeleted = [];
    if (actualDeleted1) {
      actualDeleted = actualDeleted1.map((line) => line.id);
    }
    assert.deepStrictEqual(actualDeleted, expectedDeleted);
    assertState(col, expectedState);
  }
  test("A1", () => {
    testOnModelLinesInserted(3, 3, [], {
      startLineNumber: 7,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A2", () => {
    testOnModelLinesInserted(3, 4, [], {
      startLineNumber: 8,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A3", () => {
    testOnModelLinesInserted(3, 5, [], {
      startLineNumber: 9,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A4", () => {
    testOnModelLinesInserted(3, 6, [], {
      startLineNumber: 10,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A5", () => {
    testOnModelLinesInserted(3, 7, [], {
      startLineNumber: 11,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A6", () => {
    testOnModelLinesInserted(3, 8, [], {
      startLineNumber: 12,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A7", () => {
    testOnModelLinesInserted(3, 9, [], {
      startLineNumber: 13,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("A8", () => {
    testOnModelLinesInserted(3, 10, [], {
      startLineNumber: 14,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("B1", () => {
    testOnModelLinesInserted(5, 5, [], {
      startLineNumber: 7,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("B2", () => {
    testOnModelLinesInserted(5, 6, [], {
      startLineNumber: 8,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("B3", () => {
    testOnModelLinesInserted(5, 7, [], {
      startLineNumber: 9,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("B4", () => {
    testOnModelLinesInserted(5, 8, [], {
      startLineNumber: 10,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("B5", () => {
    testOnModelLinesInserted(5, 9, [], {
      startLineNumber: 11,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("B6", () => {
    testOnModelLinesInserted(5, 10, [], {
      startLineNumber: 12,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("C1", () => {
    testOnModelLinesInserted(6, 6, [], {
      startLineNumber: 7,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("C2", () => {
    testOnModelLinesInserted(6, 7, [], {
      startLineNumber: 8,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("C3", () => {
    testOnModelLinesInserted(6, 8, [], {
      startLineNumber: 9,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("C4", () => {
    testOnModelLinesInserted(6, 9, [], {
      startLineNumber: 10,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("C5", () => {
    testOnModelLinesInserted(6, 10, [], {
      startLineNumber: 11,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("D1", () => {
    testOnModelLinesInserted(7, 7, ["old9"], {
      startLineNumber: 6,
      lines: ["old6", "new", "old7", "old8"],
      pinged: [false, false, false, false]
    });
  });
  test("D2", () => {
    testOnModelLinesInserted(7, 8, ["old8", "old9"], {
      startLineNumber: 6,
      lines: ["old6", "new", "new", "old7"],
      pinged: [false, false, false, false]
    });
  });
  test("D3", () => {
    testOnModelLinesInserted(7, 9, ["old7", "old8", "old9"], {
      startLineNumber: 6,
      lines: ["old6"],
      pinged: [false]
    });
  });
  test("D4", () => {
    testOnModelLinesInserted(7, 10, ["old7", "old8", "old9"], {
      startLineNumber: 6,
      lines: ["old6"],
      pinged: [false]
    });
  });
  test("E1", () => {
    testOnModelLinesInserted(8, 8, ["old9"], {
      startLineNumber: 6,
      lines: ["old6", "old7", "new", "old8"],
      pinged: [false, false, false, false]
    });
  });
  test("E2", () => {
    testOnModelLinesInserted(8, 9, ["old8", "old9"], {
      startLineNumber: 6,
      lines: ["old6", "old7"],
      pinged: [false, false]
    });
  });
  test("E3", () => {
    testOnModelLinesInserted(8, 10, ["old8", "old9"], {
      startLineNumber: 6,
      lines: ["old6", "old7"],
      pinged: [false, false]
    });
  });
  test("F1", () => {
    testOnModelLinesInserted(9, 9, ["old9"], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8"],
      pinged: [false, false, false]
    });
  });
  test("F2", () => {
    testOnModelLinesInserted(9, 10, ["old9"], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8"],
      pinged: [false, false, false]
    });
  });
  test("G1", () => {
    testOnModelLinesInserted(10, 10, [], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("G2", () => {
    testOnModelLinesInserted(10, 11, [], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("H1", () => {
    testOnModelLinesInserted(11, 13, [], {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
});
suite("RenderedLinesCollection onTokensChanged", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testOnModelTokensChanged(changedFromLineNumber, changedToLineNumber, expectedPinged, expectedState) {
    const col = new RenderedLinesCollection({ createLine: () => new TestLine("new") });
    col._set(6, [
      new TestLine("old6"),
      new TestLine("old7"),
      new TestLine("old8"),
      new TestLine("old9")
    ]);
    const actualPinged = col.onTokensChanged([{ fromLineNumber: changedFromLineNumber, toLineNumber: changedToLineNumber }]);
    assert.deepStrictEqual(actualPinged, expectedPinged);
    assertState(col, expectedState);
  }
  test("A", () => {
    testOnModelTokensChanged(3, 3, false, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("B", () => {
    testOnModelTokensChanged(3, 5, false, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("C", () => {
    testOnModelTokensChanged(3, 6, true, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [true, false, false, false]
    });
  });
  test("D", () => {
    testOnModelTokensChanged(6, 6, true, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [true, false, false, false]
    });
  });
  test("E", () => {
    testOnModelTokensChanged(5, 10, true, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [true, true, true, true]
    });
  });
  test("F", () => {
    testOnModelTokensChanged(8, 9, true, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, true, true]
    });
  });
  test("G", () => {
    testOnModelTokensChanged(8, 11, true, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, true, true]
    });
  });
  test("H", () => {
    testOnModelTokensChanged(10, 10, false, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
  test("I", () => {
    testOnModelTokensChanged(10, 11, false, {
      startLineNumber: 6,
      lines: ["old6", "old7", "old8", "old9"],
      pinged: [false, false, false, false]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvdmlldy92aWV3TGF5ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUxpbmUsIFJlbmRlcmVkTGluZXNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci92aWV3L3ZpZXdMYXllci5qcyc7XG5cbmNsYXNzIFRlc3RMaW5lIGltcGxlbWVudHMgSUxpbmUge1xuXG5cdF9waW5nZWQgPSBmYWxzZTtcblx0Y29uc3RydWN0b3IocHVibGljIGlkOiBzdHJpbmcpIHtcblx0fVxuXG5cdG9uQ29udGVudENoYW5nZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGluZ2VkID0gdHJ1ZTtcblx0fVxuXHRvblRva2Vuc0NoYW5nZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGluZ2VkID0gdHJ1ZTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUxpbmVzQ29sbGVjdGlvblN0YXRlIHtcblx0c3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdGxpbmVzOiBzdHJpbmdbXTtcblx0cGluZ2VkOiBib29sZWFuW107XG59XG5cbmZ1bmN0aW9uIGFzc2VydFN0YXRlKGNvbDogUmVuZGVyZWRMaW5lc0NvbGxlY3Rpb248VGVzdExpbmU+LCBzdGF0ZTogSUxpbmVzQ29sbGVjdGlvblN0YXRlKTogdm9pZCB7XG5cdGNvbnN0IGFjdHVhbFN0YXRlOiBJTGluZXNDb2xsZWN0aW9uU3RhdGUgPSB7XG5cdFx0c3RhcnRMaW5lTnVtYmVyOiBjb2wuZ2V0U3RhcnRMaW5lTnVtYmVyKCksXG5cdFx0bGluZXM6IFtdLFxuXHRcdHBpbmdlZDogW11cblx0fTtcblx0Zm9yIChsZXQgbGluZU51bWJlciA9IGNvbC5nZXRTdGFydExpbmVOdW1iZXIoKTsgbGluZU51bWJlciA8PSBjb2wuZ2V0RW5kTGluZU51bWJlcigpOyBsaW5lTnVtYmVyKyspIHtcblx0XHRhY3R1YWxTdGF0ZS5saW5lcy5wdXNoKGNvbC5nZXRMaW5lKGxpbmVOdW1iZXIpLmlkKTtcblx0XHRhY3R1YWxTdGF0ZS5waW5nZWQucHVzaChjb2wuZ2V0TGluZShsaW5lTnVtYmVyKS5fcGluZ2VkKTtcblx0fVxuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbFN0YXRlLCBzdGF0ZSk7XG59XG5cbnN1aXRlKCdSZW5kZXJlZExpbmVzQ29sbGVjdGlvbiBvbkxpbmVzRGVsZXRlZCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiB0ZXN0T25Nb2RlbExpbmVzRGVsZXRlZChkZWxldGVGcm9tTGluZU51bWJlcjogbnVtYmVyLCBkZWxldGVUb0xpbmVOdW1iZXI6IG51bWJlciwgZXhwZWN0ZWREZWxldGVkOiBzdHJpbmdbXSwgZXhwZWN0ZWRTdGF0ZTogSUxpbmVzQ29sbGVjdGlvblN0YXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgY29sID0gbmV3IFJlbmRlcmVkTGluZXNDb2xsZWN0aW9uPFRlc3RMaW5lPih7IGNyZWF0ZUxpbmU6ICgpID0+IG5ldyBUZXN0TGluZSgnbmV3JykgfSk7XG5cdFx0Y29sLl9zZXQoNiwgW1xuXHRcdFx0bmV3IFRlc3RMaW5lKCdvbGQ2JyksXG5cdFx0XHRuZXcgVGVzdExpbmUoJ29sZDcnKSxcblx0XHRcdG5ldyBUZXN0TGluZSgnb2xkOCcpLFxuXHRcdFx0bmV3IFRlc3RMaW5lKCdvbGQ5Jylcblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWxEZWxldGVkMSA9IGNvbC5vbkxpbmVzRGVsZXRlZChkZWxldGVGcm9tTGluZU51bWJlciwgZGVsZXRlVG9MaW5lTnVtYmVyKTtcblx0XHRsZXQgYWN0dWFsRGVsZXRlZDogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAoYWN0dWFsRGVsZXRlZDEpIHtcblx0XHRcdGFjdHVhbERlbGV0ZWQgPSBhY3R1YWxEZWxldGVkMS5tYXAobGluZSA9PiBsaW5lLmlkKTtcblx0XHR9XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWxEZWxldGVkLCBleHBlY3RlZERlbGV0ZWQpO1xuXHRcdGFzc2VydFN0YXRlKGNvbCwgZXhwZWN0ZWRTdGF0ZSk7XG5cdH1cblxuXHR0ZXN0KCdBMScsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzRGVsZXRlZCgzLCAzLCBbXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA1LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0EyJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDMsIDQsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDQsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQTMnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoMywgNSwgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogMyxcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBNCcsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzRGVsZXRlZCgzLCA2LCBbJ29sZDYnXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAzLFxuXHRcdFx0bGluZXM6IFsnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0E1JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDMsIDcsIFsnb2xkNicsICdvbGQ3J10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogMyxcblx0XHRcdGxpbmVzOiBbJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBNicsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzRGVsZXRlZCgzLCA4LCBbJ29sZDYnLCAnb2xkNycsICdvbGQ4J10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogMyxcblx0XHRcdGxpbmVzOiBbJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBNycsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzRGVsZXRlZCgzLCA5LCBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAzLFxuXHRcdFx0bGluZXM6IFtdLFxuXHRcdFx0cGluZ2VkOiBbXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBOCcsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzRGVsZXRlZCgzLCAxMCwgWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogMyxcblx0XHRcdGxpbmVzOiBbXSxcblx0XHRcdHBpbmdlZDogW11cblx0XHR9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdCMScsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzRGVsZXRlZCg1LCA1LCBbXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA1LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0IyJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDUsIDYsIFsnb2xkNiddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDUsXG5cdFx0XHRsaW5lczogWydvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQjMnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoNSwgNywgWydvbGQ2JywgJ29sZDcnXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA1LFxuXHRcdFx0bGluZXM6IFsnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0I0JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDUsIDgsIFsnb2xkNicsICdvbGQ3JywgJ29sZDgnXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA1LFxuXHRcdFx0bGluZXM6IFsnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0I1JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDUsIDksIFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDUsXG5cdFx0XHRsaW5lczogW10sXG5cdFx0XHRwaW5nZWQ6IFtdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0I2JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDUsIDEwLCBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA1LFxuXHRcdFx0bGluZXM6IFtdLFxuXHRcdFx0cGluZ2VkOiBbXVxuXHRcdH0pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ0MxJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDYsIDYsIFsnb2xkNiddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQzInLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoNiwgNywgWydvbGQ2JywgJ29sZDcnXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0MzJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDYsIDgsIFsnb2xkNicsICdvbGQ3JywgJ29sZDgnXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0M0JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDYsIDksIFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogW10sXG5cdFx0XHRwaW5nZWQ6IFtdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0M1JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDYsIDEwLCBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFtdLFxuXHRcdFx0cGluZ2VkOiBbXVxuXHRcdH0pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ0QxJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDcsIDcsIFsnb2xkNyddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRDInLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoNywgOCwgWydvbGQ3JywgJ29sZDgnXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0QzJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDcsIDksIFsnb2xkNycsICdvbGQ4JywgJ29sZDknXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNiddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0Q0JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDcsIDEwLCBbJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ0UxJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDgsIDgsIFsnb2xkOCddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRTInLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoOCwgOSwgWydvbGQ4JywgJ29sZDknXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0UzJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDgsIDEwLCBbJ29sZDgnLCAnb2xkOSddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdGMScsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzRGVsZXRlZCg5LCA5LCBbJ29sZDknXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0YyJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDksIDEwLCBbJ29sZDknXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnRzEnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0RlbGV0ZWQoMTAsIDEwLCBbXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0cyJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDEwLCAxMSwgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ0gxJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNEZWxldGVkKDExLCAxMywgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnUmVuZGVyZWRMaW5lc0NvbGxlY3Rpb24gb25MaW5lQ2hhbmdlZCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiB0ZXN0T25Nb2RlbExpbmVDaGFuZ2VkKGNoYW5nZWRMaW5lTnVtYmVyOiBudW1iZXIsIGV4cGVjdGVkUGluZ2VkOiBib29sZWFuLCBleHBlY3RlZFN0YXRlOiBJTGluZXNDb2xsZWN0aW9uU3RhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBjb2wgPSBuZXcgUmVuZGVyZWRMaW5lc0NvbGxlY3Rpb248VGVzdExpbmU+KHsgY3JlYXRlTGluZTogKCkgPT4gbmV3IFRlc3RMaW5lKCduZXcnKSB9KTtcblx0XHRjb2wuX3NldCg2LCBbXG5cdFx0XHRuZXcgVGVzdExpbmUoJ29sZDYnKSxcblx0XHRcdG5ldyBUZXN0TGluZSgnb2xkNycpLFxuXHRcdFx0bmV3IFRlc3RMaW5lKCdvbGQ4JyksXG5cdFx0XHRuZXcgVGVzdExpbmUoJ29sZDknKVxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbFBpbmdlZCA9IGNvbC5vbkxpbmVzQ2hhbmdlZChjaGFuZ2VkTGluZU51bWJlciwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWxQaW5nZWQsIGV4cGVjdGVkUGluZ2VkKTtcblx0XHRhc3NlcnRTdGF0ZShjb2wsIGV4cGVjdGVkU3RhdGUpO1xuXHR9XG5cblx0dGVzdCgnMycsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVDaGFuZ2VkKDMsIGZhbHNlLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cdHRlc3QoJzQnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lQ2hhbmdlZCg0LCBmYWxzZSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXHR0ZXN0KCc1JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZUNoYW5nZWQoNSwgZmFsc2UsIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblx0dGVzdCgnNicsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVDaGFuZ2VkKDYsIHRydWUsIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW3RydWUsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXHR0ZXN0KCc3JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZUNoYW5nZWQoNywgdHJ1ZSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIHRydWUsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cdHRlc3QoJzgnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lQ2hhbmdlZCg4LCB0cnVlLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIHRydWUsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblx0dGVzdCgnOScsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVDaGFuZ2VkKDksIHRydWUsIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIHRydWVdXG5cdFx0fSk7XG5cdH0pO1xuXHR0ZXN0KCcxMCcsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVDaGFuZ2VkKDEwLCBmYWxzZSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXHR0ZXN0KCcxMScsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVDaGFuZ2VkKDExLCBmYWxzZSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG59KTtcblxuc3VpdGUoJ1JlbmRlcmVkTGluZXNDb2xsZWN0aW9uIG9uTGluZXNJbnNlcnRlZCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiB0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoaW5zZXJ0RnJvbUxpbmVOdW1iZXI6IG51bWJlciwgaW5zZXJ0VG9MaW5lTnVtYmVyOiBudW1iZXIsIGV4cGVjdGVkRGVsZXRlZDogc3RyaW5nW10sIGV4cGVjdGVkU3RhdGU6IElMaW5lc0NvbGxlY3Rpb25TdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbCA9IG5ldyBSZW5kZXJlZExpbmVzQ29sbGVjdGlvbjxUZXN0TGluZT4oeyBjcmVhdGVMaW5lOiAoKSA9PiBuZXcgVGVzdExpbmUoJ25ldycpIH0pO1xuXHRcdGNvbC5fc2V0KDYsIFtcblx0XHRcdG5ldyBUZXN0TGluZSgnb2xkNicpLFxuXHRcdFx0bmV3IFRlc3RMaW5lKCdvbGQ3JyksXG5cdFx0XHRuZXcgVGVzdExpbmUoJ29sZDgnKSxcblx0XHRcdG5ldyBUZXN0TGluZSgnb2xkOScpXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsRGVsZXRlZDEgPSBjb2wub25MaW5lc0luc2VydGVkKGluc2VydEZyb21MaW5lTnVtYmVyLCBpbnNlcnRUb0xpbmVOdW1iZXIpO1xuXHRcdGxldCBhY3R1YWxEZWxldGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmIChhY3R1YWxEZWxldGVkMSkge1xuXHRcdFx0YWN0dWFsRGVsZXRlZCA9IGFjdHVhbERlbGV0ZWQxLm1hcChsaW5lID0+IGxpbmUuaWQpO1xuXHRcdH1cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbERlbGV0ZWQsIGV4cGVjdGVkRGVsZXRlZCk7XG5cdFx0YXNzZXJ0U3RhdGUoY29sLCBleHBlY3RlZFN0YXRlKTtcblx0fVxuXG5cdHRlc3QoJ0ExJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNJbnNlcnRlZCgzLCAzLCBbXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA3LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0EyJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNJbnNlcnRlZCgzLCA0LCBbXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA4LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0EzJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNJbnNlcnRlZCgzLCA1LCBbXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA5LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0E0JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNJbnNlcnRlZCgzLCA2LCBbXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBNScsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoMywgNywgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTEsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQTYnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDMsIDgsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDEyLFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0E3JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNJbnNlcnRlZCgzLCA5LCBbXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMyxcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBOCcsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoMywgMTAsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDE0LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnQjEnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDUsIDUsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDcsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQjInLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDUsIDYsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDgsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQjMnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDUsIDcsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDksXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQjQnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDUsIDgsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0I1JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNJbnNlcnRlZCg1LCA5LCBbXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMSxcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdCNicsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoNSwgMTAsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDEyLFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnQzEnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDYsIDYsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDcsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQzInLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDYsIDcsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDgsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQzMnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDYsIDgsIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDksXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQzQnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDYsIDksIFtdLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0M1JywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNJbnNlcnRlZCg2LCAxMCwgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTEsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdEMScsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoNywgNywgWydvbGQ5J10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnbmV3JywgJ29sZDcnLCAnb2xkOCddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0QyJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNJbnNlcnRlZCg3LCA4LCBbJ29sZDgnLCAnb2xkOSddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ25ldycsICduZXcnLCAnb2xkNyddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0QzJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNJbnNlcnRlZCg3LCA5LCBbJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdENCcsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoNywgMTAsIFsnb2xkNycsICdvbGQ4JywgJ29sZDknXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNiddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnRTEnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDgsIDgsIFsnb2xkOSddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnbmV3JywgJ29sZDgnXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFMicsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoOCwgOSwgWydvbGQ4JywgJ29sZDknXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0UzJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsTGluZXNJbnNlcnRlZCg4LCAxMCwgWydvbGQ4JywgJ29sZDknXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3J10sXG5cdFx0XHRwaW5nZWQ6IFtmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnRjEnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDksIDksIFsnb2xkOSddLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRjInLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDksIDEwLCBbJ29sZDknXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnRzEnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDEwLCAxMCwgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdHMicsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbExpbmVzSW5zZXJ0ZWQoMTAsIDExLCBbXSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnSDEnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxMaW5lc0luc2VydGVkKDExLCAxMywgW10sIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5cbnN1aXRlKCdSZW5kZXJlZExpbmVzQ29sbGVjdGlvbiBvblRva2Vuc0NoYW5nZWQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gdGVzdE9uTW9kZWxUb2tlbnNDaGFuZ2VkKGNoYW5nZWRGcm9tTGluZU51bWJlcjogbnVtYmVyLCBjaGFuZ2VkVG9MaW5lTnVtYmVyOiBudW1iZXIsIGV4cGVjdGVkUGluZ2VkOiBib29sZWFuLCBleHBlY3RlZFN0YXRlOiBJTGluZXNDb2xsZWN0aW9uU3RhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBjb2wgPSBuZXcgUmVuZGVyZWRMaW5lc0NvbGxlY3Rpb248VGVzdExpbmU+KHsgY3JlYXRlTGluZTogKCkgPT4gbmV3IFRlc3RMaW5lKCduZXcnKSB9KTtcblx0XHRjb2wuX3NldCg2LCBbXG5cdFx0XHRuZXcgVGVzdExpbmUoJ29sZDYnKSxcblx0XHRcdG5ldyBUZXN0TGluZSgnb2xkNycpLFxuXHRcdFx0bmV3IFRlc3RMaW5lKCdvbGQ4JyksXG5cdFx0XHRuZXcgVGVzdExpbmUoJ29sZDknKVxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbFBpbmdlZCA9IGNvbC5vblRva2Vuc0NoYW5nZWQoW3sgZnJvbUxpbmVOdW1iZXI6IGNoYW5nZWRGcm9tTGluZU51bWJlciwgdG9MaW5lTnVtYmVyOiBjaGFuZ2VkVG9MaW5lTnVtYmVyIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbFBpbmdlZCwgZXhwZWN0ZWRQaW5nZWQpO1xuXHRcdGFzc2VydFN0YXRlKGNvbCwgZXhwZWN0ZWRTdGF0ZSk7XG5cdH1cblxuXHR0ZXN0KCdBJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsVG9rZW5zQ2hhbmdlZCgzLCAzLCBmYWxzZSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXHR0ZXN0KCdCJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsVG9rZW5zQ2hhbmdlZCgzLCA1LCBmYWxzZSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xuXHR0ZXN0KCdDJywgKCkgPT4ge1xuXHRcdHRlc3RPbk1vZGVsVG9rZW5zQ2hhbmdlZCgzLCA2LCB0cnVlLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFt0cnVlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblx0dGVzdCgnRCcsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbFRva2Vuc0NoYW5nZWQoNiwgNiwgdHJ1ZSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbdHJ1ZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV1cblx0XHR9KTtcblx0fSk7XG5cdHRlc3QoJ0UnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxUb2tlbnNDaGFuZ2VkKDUsIDEwLCB0cnVlLCB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRsaW5lczogWydvbGQ2JywgJ29sZDcnLCAnb2xkOCcsICdvbGQ5J10sXG5cdFx0XHRwaW5nZWQ6IFt0cnVlLCB0cnVlLCB0cnVlLCB0cnVlXVxuXHRcdH0pO1xuXHR9KTtcblx0dGVzdCgnRicsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbFRva2Vuc0NoYW5nZWQoOCwgOSwgdHJ1ZSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCB0cnVlLCB0cnVlXVxuXHRcdH0pO1xuXHR9KTtcblx0dGVzdCgnRycsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbFRva2Vuc0NoYW5nZWQoOCwgMTEsIHRydWUsIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgdHJ1ZSwgdHJ1ZV1cblx0XHR9KTtcblx0fSk7XG5cdHRlc3QoJ0gnLCAoKSA9PiB7XG5cdFx0dGVzdE9uTW9kZWxUb2tlbnNDaGFuZ2VkKDEwLCAxMCwgZmFsc2UsIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdGxpbmVzOiBbJ29sZDYnLCAnb2xkNycsICdvbGQ4JywgJ29sZDknXSxcblx0XHRcdHBpbmdlZDogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXVxuXHRcdH0pO1xuXHR9KTtcblx0dGVzdCgnSScsICgpID0+IHtcblx0XHR0ZXN0T25Nb2RlbFRva2Vuc0NoYW5nZWQoMTAsIDExLCBmYWxzZSwge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0bGluZXM6IFsnb2xkNicsICdvbGQ3JywgJ29sZDgnLCAnb2xkOSddLFxuXHRcdFx0cGluZ2VkOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBZ0IsK0JBQStCO0FBRS9DLE1BQU0sU0FBMEI7QUFBQSxFQUcvQixZQUFtQixJQUFZO0FBQVo7QUFEbkIsbUJBQVU7QUFBQSxFQUVWO0FBQUEsRUFFQSxtQkFBeUI7QUFDeEIsU0FBSyxVQUFVO0FBQUEsRUFDaEI7QUFBQSxFQUNBLGtCQUF3QjtBQUN2QixTQUFLLFVBQVU7QUFBQSxFQUNoQjtBQUNEO0FBUUEsU0FBUyxZQUFZLEtBQXdDLE9BQW9DO0FBQ2hHLFFBQU0sY0FBcUM7QUFBQSxJQUMxQyxpQkFBaUIsSUFBSSxtQkFBbUI7QUFBQSxJQUN4QyxPQUFPLENBQUM7QUFBQSxJQUNSLFFBQVEsQ0FBQztBQUFBLEVBQ1Y7QUFDQSxXQUFTLGFBQWEsSUFBSSxtQkFBbUIsR0FBRyxjQUFjLElBQUksaUJBQWlCLEdBQUcsY0FB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
