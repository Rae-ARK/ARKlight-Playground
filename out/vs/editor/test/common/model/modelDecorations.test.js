import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { EndOfLineSequence, TrackedRangeStickiness } from "../../../common/model.js";
import { createTextModel } from "../testTextModel.js";
function modelHasDecorations(model, decorations) {
  const modelDecorations = [];
  const actualDecorations = model.getAllDecorations();
  for (let i = 0, len = actualDecorations.length; i < len; i++) {
    modelDecorations.push({
      range: actualDecorations[i].range,
      className: actualDecorations[i].options.className
    });
  }
  modelDecorations.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
  assert.deepStrictEqual(modelDecorations, decorations);
}
function modelHasDecoration(model, startLineNumber, startColumn, endLineNumber, endColumn, className) {
  modelHasDecorations(model, [{
    range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
    className
  }]);
}
function modelHasNoDecorations(model) {
  assert.strictEqual(model.getAllDecorations().length, 0, "Model has no decoration");
}
function addDecoration(model, startLineNumber, startColumn, endLineNumber, endColumn, className) {
  return model.changeDecorations((changeAccessor) => {
    return changeAccessor.addDecoration(new Range(startLineNumber, startColumn, endLineNumber, endColumn), {
      description: "test",
      className
    });
  });
}
function lineHasDecorations(model, lineNumber, decorations) {
  const lineDecorations = [];
  const decs = model.getLineDecorations(lineNumber);
  for (let i = 0, len = decs.length; i < len; i++) {
    lineDecorations.push({
      start: decs[i].range.startColumn,
      end: decs[i].range.endColumn,
      className: decs[i].options.className
    });
  }
  assert.deepStrictEqual(lineDecorations, decorations, "Line decorations");
}
function lineHasNoDecorations(model, lineNumber) {
  lineHasDecorations(model, lineNumber, []);
}
function lineHasDecoration(model, lineNumber, start, end, className) {
  lineHasDecorations(model, lineNumber, [{
    start,
    end,
    className
  }]);
}
suite("Editor Model - Model Decorations", () => {
  const LINE1 = "My First Line";
  const LINE2 = "		My Second Line";
  const LINE3 = "    Third Line";
  const LINE4 = "";
  const LINE5 = "1";
  let thisModel;
  setup(() => {
    const text = LINE1 + "\r\n" + LINE2 + "\n" + LINE3 + "\n" + LINE4 + "\r\n" + LINE5;
    thisModel = createTextModel(text);
  });
  teardown(() => {
    thisModel.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("single character decoration", () => {
    addDecoration(thisModel, 1, 1, 1, 2, "myType");
    lineHasDecoration(thisModel, 1, 1, 2, "myType");
    lineHasNoDecorations(thisModel, 2);
    lineHasNoDecorations(thisModel, 3);
    lineHasNoDecorations(thisModel, 4);
    lineHasNoDecorations(thisModel, 5);
  });
  test("line decoration", () => {
    addDecoration(thisModel, 1, 1, 1, 14, "myType");
    lineHasDecoration(thisModel, 1, 1, 14, "myType");
    lineHasNoDecorations(thisModel, 2);
    lineHasNoDecorations(thisModel, 3);
    lineHasNoDecorations(thisModel, 4);
    lineHasNoDecorations(thisModel, 5);
  });
  test("full line decoration", () => {
    addDecoration(thisModel, 1, 1, 2, 1, "myType");
    const line1Decorations = thisModel.getLineDecorations(1);
    assert.strictEqual(line1Decorations.length, 1);
    assert.strictEqual(line1Decorations[0].options.className, "myType");
    const line2Decorations = thisModel.getLineDecorations(1);
    assert.strictEqual(line2Decorations.length, 1);
    assert.strictEqual(line2Decorations[0].options.className, "myType");
    lineHasNoDecorations(thisModel, 3);
    lineHasNoDecorations(thisModel, 4);
    lineHasNoDecorations(thisModel, 5);
  });
  test("multiple line decoration", () => {
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    const line1Decorations = thisModel.getLineDecorations(1);
    assert.strictEqual(line1Decorations.length, 1);
    assert.strictEqual(line1Decorations[0].options.className, "myType");
    const line2Decorations = thisModel.getLineDecorations(1);
    assert.strictEqual(line2Decorations.length, 1);
    assert.strictEqual(line2Decorations[0].options.className, "myType");
    const line3Decorations = thisModel.getLineDecorations(1);
    assert.strictEqual(line3Decorations.length, 1);
    assert.strictEqual(line3Decorations[0].options.className, "myType");
    lineHasNoDecorations(thisModel, 4);
    lineHasNoDecorations(thisModel, 5);
  });
  test("decoration gets removed", () => {
    const decId = addDecoration(thisModel, 1, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
    thisModel.changeDecorations((changeAccessor) => {
      changeAccessor.removeDecoration(decId);
    });
    modelHasNoDecorations(thisModel);
  });
  test("decorations get removed", () => {
    const decId1 = addDecoration(thisModel, 1, 2, 3, 2, "myType1");
    const decId2 = addDecoration(thisModel, 1, 2, 3, 1, "myType2");
    modelHasDecorations(thisModel, [
      {
        range: new Range(1, 2, 3, 1),
        className: "myType2"
      },
      {
        range: new Range(1, 2, 3, 2),
        className: "myType1"
      }
    ]);
    thisModel.changeDecorations((changeAccessor) => {
      changeAccessor.removeDecoration(decId1);
    });
    modelHasDecorations(thisModel, [
      {
        range: new Range(1, 2, 3, 1),
        className: "myType2"
      }
    ]);
    thisModel.changeDecorations((changeAccessor) => {
      changeAccessor.removeDecoration(decId2);
    });
    modelHasNoDecorations(thisModel);
  });
  test("decoration range can be changed", () => {
    const decId = addDecoration(thisModel, 1, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
    thisModel.changeDecorations((changeAccessor) => {
      changeAccessor.changeDecoration(decId, new Range(1, 1, 1, 2));
    });
    modelHasDecoration(thisModel, 1, 1, 1, 2, "myType");
  });
  test("decorations emit event on add", () => {
    let listenerCalled = 0;
    const disposable = thisModel.onDidChangeDecorations((e) => {
      listenerCalled++;
    });
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    assert.strictEqual(listenerCalled, 1, "listener called");
    disposable.dispose();
  });
  test("decorations emit event on change", () => {
    let listenerCalled = 0;
    const decId = addDecoration(thisModel, 1, 2, 3, 2, "myType");
    const disposable = thisModel.onDidChangeDecorations((e) => {
      listenerCalled++;
    });
    thisModel.changeDecorations((changeAccessor) => {
      changeAccessor.changeDecoration(decId, new Range(1, 1, 1, 2));
    });
    assert.strictEqual(listenerCalled, 1, "listener called");
    disposable.dispose();
  });
  test("decorations emit event on remove", () => {
    let listenerCalled = 0;
    const decId = addDecoration(thisModel, 1, 2, 3, 2, "myType");
    const disposable = thisModel.onDidChangeDecorations((e) => {
      listenerCalled++;
    });
    thisModel.changeDecorations((changeAccessor) => {
      changeAccessor.removeDecoration(decId);
    });
    assert.strictEqual(listenerCalled, 1, "listener called");
    disposable.dispose();
  });
  test("decorations emit event when inserting one line text before it", () => {
    let listenerCalled = 0;
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    const disposable = thisModel.onDidChangeDecorations((e) => {
      listenerCalled++;
    });
    thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "Hallo ")]);
    assert.strictEqual(listenerCalled, 1, "listener called");
    disposable.dispose();
  });
  test("decorations do not emit event on no-op deltaDecorations", () => {
    let listenerCalled = 0;
    const disposable = thisModel.onDidChangeDecorations((e) => {
      listenerCalled++;
    });
    thisModel.deltaDecorations([], []);
    thisModel.changeDecorations((accessor) => {
      accessor.deltaDecorations([], []);
    });
    assert.strictEqual(listenerCalled, 0, "listener not called");
    disposable.dispose();
  });
  test("decorations are updated when inserting one line text before it", () => {
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "Hallo ")]);
    modelHasDecoration(thisModel, 1, 8, 3, 2, "myType");
  });
  test("decorations are updated when inserting one line text before it 2", () => {
    addDecoration(thisModel, 1, 1, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 1, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.replace(new Range(1, 1, 1, 1), "Hallo ")]);
    modelHasDecoration(thisModel, 1, 1, 3, 2, "myType");
  });
  test("decorations are updated when inserting multiple lines text before it", () => {
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "Hallo\nI'm inserting multiple\nlines")]);
    modelHasDecoration(thisModel, 3, 7, 5, 2, "myType");
  });
  test("decorations change when inserting text after them", () => {
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.insert(new Position(3, 2), "Hallo")]);
    modelHasDecoration(thisModel, 1, 2, 3, 7, "myType");
  });
  test("decorations are updated when inserting text inside", () => {
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.insert(new Position(1, 3), "Hallo ")]);
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
  });
  test("decorations are updated when inserting text inside 2", () => {
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.insert(new Position(3, 1), "Hallo ")]);
    modelHasDecoration(thisModel, 1, 2, 3, 8, "myType");
  });
  test("decorations are updated when inserting text inside 3", () => {
    addDecoration(thisModel, 1, 1, 2, 16, "myType");
    modelHasDecoration(thisModel, 1, 1, 2, 16, "myType");
    thisModel.applyEdits([EditOperation.insert(new Position(2, 2), "\n")]);
    modelHasDecoration(thisModel, 1, 1, 3, 15, "myType");
  });
  test("decorations are updated when inserting multiple lines text inside", () => {
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.insert(new Position(1, 3), "Hallo\nI'm inserting multiple\nlines")]);
    modelHasDecoration(thisModel, 1, 2, 5, 2, "myType");
  });
  test("decorations are updated when deleting one line text before it", () => {
    addDecoration(thisModel, 1, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 1, 2, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 2))]);
    modelHasDecoration(thisModel, 1, 1, 3, 2, "myType");
  });
  test("decorations are updated when deleting multiple lines text before it", () => {
    addDecoration(thisModel, 2, 2, 3, 2, "myType");
    modelHasDecoration(thisModel, 2, 2, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 2, 1))]);
    modelHasDecoration(thisModel, 1, 2, 2, 2, "myType");
  });
  test("decorations are updated when deleting multiple lines text before it 2", () => {
    addDecoration(thisModel, 2, 3, 3, 2, "myType");
    modelHasDecoration(thisModel, 2, 3, 3, 2, "myType");
    thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 2, 2))]);
    modelHasDecoration(thisModel, 1, 2, 2, 2, "myType");
  });
  test("decorations are updated when deleting text inside", () => {
    addDecoration(thisModel, 1, 2, 4, 1, "myType");
    modelHasDecoration(thisModel, 1, 2, 4, 1, "myType");
    thisModel.applyEdits([EditOperation.delete(new Range(1, 3, 2, 1))]);
    modelHasDecoration(thisModel, 1, 2, 3, 1, "myType");
  });
  test("decorations are updated when deleting text inside 2", () => {
    addDecoration(thisModel, 1, 2, 4, 1, "myType");
    modelHasDecoration(thisModel, 1, 2, 4, 1, "myType");
    thisModel.applyEdits([
      EditOperation.delete(new Range(1, 1, 1, 2)),
      EditOperation.delete(new Range(4, 1, 4, 1))
    ]);
    modelHasDecoration(thisModel, 1, 1, 4, 1, "myType");
  });
  test("decorations are updated when deleting multiple lines text", () => {
    addDecoration(thisModel, 1, 2, 4, 1, "myType");
    modelHasDecoration(thisModel, 1, 2, 4, 1, "myType");
    thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 3, 1))]);
    modelHasDecoration(thisModel, 1, 1, 2, 1, "myType");
  });
  test("decorations are updated when changing EOL", () => {
    addDecoration(thisModel, 1, 2, 4, 1, "myType1");
    addDecoration(thisModel, 1, 3, 4, 1, "myType2");
    addDecoration(thisModel, 1, 4, 4, 1, "myType3");
    addDecoration(thisModel, 1, 5, 4, 1, "myType4");
    addDecoration(thisModel, 1, 6, 4, 1, "myType5");
    addDecoration(thisModel, 1, 7, 4, 1, "myType6");
    addDecoration(thisModel, 1, 8, 4, 1, "myType7");
    addDecoration(thisModel, 1, 9, 4, 1, "myType8");
    addDecoration(thisModel, 1, 10, 4, 1, "myType9");
    thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "x")]);
    thisModel.setEOL(EndOfLineSequence.CRLF);
    thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "x")]);
    modelHasDecorations(thisModel, [
      { range: new Range(1, 4, 4, 1), className: "myType1" },
      { range: new Range(1, 5, 4, 1), className: "myType2" },
      { range: new Range(1, 6, 4, 1), className: "myType3" },
      { range: new Range(1, 7, 4, 1), className: "myType4" },
      { range: new Range(1, 8, 4, 1), className: "myType5" },
      { range: new Range(1, 9, 4, 1), className: "myType6" },
      { range: new Range(1, 10, 4, 1), className: "myType7" },
      { range: new Range(1, 11, 4, 1), className: "myType8" },
      { range: new Range(1, 12, 4, 1), className: "myType9" }
    ]);
  });
  test("an apparently simple edit", () => {
    addDecoration(thisModel, 1, 2, 4, 1, "myType1");
    thisModel.applyEdits([EditOperation.replace(new Range(1, 14, 2, 1), "x")]);
    modelHasDecorations(thisModel, [
      { range: new Range(1, 2, 3, 1), className: "myType1" }
    ]);
  });
  test("removeAllDecorationsWithOwnerId can be called after model dispose", () => {
    const model = createTextModel("asd");
    model.dispose();
    model.removeAllDecorationsWithOwnerId(1);
  });
  test("removeAllDecorationsWithOwnerId works", () => {
    thisModel.deltaDecorations([], [{ range: new Range(1, 2, 4, 1), options: { description: "test", className: "myType1" } }], 1);
    thisModel.removeAllDecorationsWithOwnerId(1);
    modelHasNoDecorations(thisModel);
  });
});
suite("Decorations and editing", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function _runTest(decRange, stickiness, editRange, editText, editForceMoveMarkers, expectedDecRange, msg) {
    const model = createTextModel([
      "My First Line",
      "My Second Line",
      "Third Line"
    ].join("\n"));
    const id = model.deltaDecorations([], [{ range: decRange, options: { description: "test", stickiness } }])[0];
    model.applyEdits([{
      range: editRange,
      text: editText,
      forceMoveMarkers: editForceMoveMarkers
    }]);
    const actual = model.getDecorationRange(id);
    assert.deepStrictEqual(actual, expectedDecRange, msg);
    model.dispose();
  }
  function runTest(decRange, editRange, editText, expectedDecRange) {
    _runTest(decRange, 0, editRange, editText, false, expectedDecRange[0][0], "no-0-AlwaysGrowsWhenTypingAtEdges");
    _runTest(decRange, 1, editRange, editText, false, expectedDecRange[0][1], "no-1-NeverGrowsWhenTypingAtEdges");
    _runTest(decRange, 2, editRange, editText, false, expectedDecRange[0][2], "no-2-GrowsOnlyWhenTypingBefore");
    _runTest(decRange, 3, editRange, editText, false, expectedDecRange[0][3], "no-3-GrowsOnlyWhenTypingAfter");
    _runTest(decRange, 0, editRange, editText, true, expectedDecRange[1][0], "force-0-AlwaysGrowsWhenTypingAtEdges");
    _runTest(decRange, 1, editRange, editText, true, expectedDecRange[1][1], "force-1-NeverGrowsWhenTypingAtEdges");
    _runTest(decRange, 2, editRange, editText, true, expectedDecRange[1][2], "force-2-GrowsOnlyWhenTypingBefore");
    _runTest(decRange, 3, editRange, editText, true, expectedDecRange[1][3], "force-3-GrowsOnlyWhenTypingAfter");
  }
  suite("insert", () => {
    suite("collapsed dec", () => {
      test("before", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 3, 1, 3),
          "xx",
          [
            [new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6)],
            [new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6)]
          ]
        );
      });
      test("equal", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 4, 1, 4),
          "xx",
          [
            [new Range(1, 4, 1, 6), new Range(1, 6, 1, 6), new Range(1, 4, 1, 4), new Range(1, 6, 1, 6)],
            [new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6)]
          ]
        );
      });
      test("after", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 5, 1, 5),
          "xx",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
    });
    suite("non-collapsed dec", () => {
      test("before", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 3),
          "xx",
          [
            [new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11)],
            [new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11)]
          ]
        );
      });
      test("start", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 4),
          "xx",
          [
            [new Range(1, 4, 1, 11), new Range(1, 6, 1, 11), new Range(1, 4, 1, 11), new Range(1, 6, 1, 11)],
            [new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11)]
          ]
        );
      });
      test("inside", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 5),
          "xx",
          [
            [new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11)],
            [new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11)]
          ]
        );
      });
      test("end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 9, 1, 9),
          "xx",
          [
            [new Range(1, 4, 1, 11), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 11)],
            [new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11)]
          ]
        );
      });
      test("after", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 10, 1, 10),
          "xx",
          [
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)],
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)]
          ]
        );
      });
    });
  });
  suite("delete", () => {
    suite("collapsed dec", () => {
      test("edit.end < range.start", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 1, 1, 3),
          "",
          [
            [new Range(1, 2, 1, 2), new Range(1, 2, 1, 2), new Range(1, 2, 1, 2), new Range(1, 2, 1, 2)],
            [new Range(1, 2, 1, 2), new Range(1, 2, 1, 2), new Range(1, 2, 1, 2), new Range(1, 2, 1, 2)]
          ]
        );
      });
      test("edit.end <= range.start", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 2, 1, 4),
          "",
          [
            [new Range(1, 2, 1, 2), new Range(1, 2, 1, 2), new Range(1, 2, 1, 2), new Range(1, 2, 1, 2)],
            [new Range(1, 2, 1, 2), new Range(1, 2, 1, 2), new Range(1, 2, 1, 2), new Range(1, 2, 1, 2)]
          ]
        );
      });
      test("edit.start < range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 3, 1, 5),
          "",
          [
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)],
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)]
          ]
        );
      });
      test("edit.start >= range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 4, 1, 6),
          "",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
      test("edit.start > range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 5, 1, 7),
          "",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
    });
    suite("non-collapsed dec", () => {
      test("edit.end < range.start", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 1, 1, 3),
          "",
          [
            [new Range(1, 2, 1, 7), new Range(1, 2, 1, 7), new Range(1, 2, 1, 7), new Range(1, 2, 1, 7)],
            [new Range(1, 2, 1, 7), new Range(1, 2, 1, 7), new Range(1, 2, 1, 7), new Range(1, 2, 1, 7)]
          ]
        );
      });
      test("edit.end <= range.start", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 2, 1, 4),
          "",
          [
            [new Range(1, 2, 1, 7), new Range(1, 2, 1, 7), new Range(1, 2, 1, 7), new Range(1, 2, 1, 7)],
            [new Range(1, 2, 1, 7), new Range(1, 2, 1, 7), new Range(1, 2, 1, 7), new Range(1, 2, 1, 7)]
          ]
        );
      });
      test("edit.start < range.start && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 5),
          "",
          [
            [new Range(1, 3, 1, 7), new Range(1, 3, 1, 7), new Range(1, 3, 1, 7), new Range(1, 3, 1, 7)],
            [new Range(1, 3, 1, 7), new Range(1, 3, 1, 7), new Range(1, 3, 1, 7), new Range(1, 3, 1, 7)]
          ]
        );
      });
      test("edit.start < range.start && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 9),
          "",
          [
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)],
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)]
          ]
        );
      });
      test("edit.start < range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 10),
          "",
          [
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)],
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)]
          ]
        );
      });
      test("edit.start == range.start && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 6),
          "",
          [
            [new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7)],
            [new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7)]
          ]
        );
      });
      test("edit.start == range.start && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 9),
          "",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
      test("edit.start == range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 10),
          "",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 7),
          "",
          [
            [new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7)],
            [new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 9),
          "",
          [
            [new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5)],
            [new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 10),
          "",
          [
            [new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5)],
            [new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5)]
          ]
        );
      });
      test("edit.start == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 9, 1, 11),
          "",
          [
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)],
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)]
          ]
        );
      });
      test("edit.start > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 10, 1, 11),
          "",
          [
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)],
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)]
          ]
        );
      });
    });
  });
  suite("replace short", () => {
    suite("collapsed dec", () => {
      test("edit.end < range.start", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 1, 1, 3),
          "c",
          [
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)],
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)]
          ]
        );
      });
      test("edit.end <= range.start", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 2, 1, 4),
          "c",
          [
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)],
            [new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3), new Range(1, 3, 1, 3)]
          ]
        );
      });
      test("edit.start < range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 3, 1, 5),
          "c",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
      test("edit.start >= range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 4, 1, 6),
          "c",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 5, 1, 5), new Range(1, 5, 1, 5), new Range(1, 5, 1, 5), new Range(1, 5, 1, 5)]
          ]
        );
      });
      test("edit.start > range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 5, 1, 7),
          "c",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
    });
    suite("non-collapsed dec", () => {
      test("edit.end < range.start", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 1, 1, 3),
          "c",
          [
            [new Range(1, 3, 1, 8), new Range(1, 3, 1, 8), new Range(1, 3, 1, 8), new Range(1, 3, 1, 8)],
            [new Range(1, 3, 1, 8), new Range(1, 3, 1, 8), new Range(1, 3, 1, 8), new Range(1, 3, 1, 8)]
          ]
        );
      });
      test("edit.end <= range.start", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 2, 1, 4),
          "c",
          [
            [new Range(1, 3, 1, 8), new Range(1, 3, 1, 8), new Range(1, 3, 1, 8), new Range(1, 3, 1, 8)],
            [new Range(1, 3, 1, 8), new Range(1, 3, 1, 8), new Range(1, 3, 1, 8), new Range(1, 3, 1, 8)]
          ]
        );
      });
      test("edit.start < range.start && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 5),
          "c",
          [
            [new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8)],
            [new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8)]
          ]
        );
      });
      test("edit.start < range.start && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 9),
          "c",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
      test("edit.start < range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 10),
          "c",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
      test("edit.start == range.start && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 6),
          "c",
          [
            [new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8)],
            [new Range(1, 5, 1, 8), new Range(1, 5, 1, 8), new Range(1, 5, 1, 8), new Range(1, 5, 1, 8)]
          ]
        );
      });
      test("edit.start == range.start && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 9),
          "c",
          [
            [new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5)],
            [new Range(1, 5, 1, 5), new Range(1, 5, 1, 5), new Range(1, 5, 1, 5), new Range(1, 5, 1, 5)]
          ]
        );
      });
      test("edit.start == range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 10),
          "c",
          [
            [new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5), new Range(1, 4, 1, 5)],
            [new Range(1, 5, 1, 5), new Range(1, 5, 1, 5), new Range(1, 5, 1, 5), new Range(1, 5, 1, 5)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 7),
          "c",
          [
            [new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8)],
            [new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 9),
          "c",
          [
            [new Range(1, 4, 1, 6), new Range(1, 4, 1, 6), new Range(1, 4, 1, 6), new Range(1, 4, 1, 6)],
            [new Range(1, 4, 1, 6), new Range(1, 4, 1, 6), new Range(1, 4, 1, 6), new Range(1, 4, 1, 6)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 10),
          "c",
          [
            [new Range(1, 4, 1, 6), new Range(1, 4, 1, 6), new Range(1, 4, 1, 6), new Range(1, 4, 1, 6)],
            [new Range(1, 4, 1, 6), new Range(1, 4, 1, 6), new Range(1, 4, 1, 6), new Range(1, 4, 1, 6)]
          ]
        );
      });
      test("edit.start == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 9, 1, 11),
          "c",
          [
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)],
            [new Range(1, 4, 1, 10), new Range(1, 4, 1, 10), new Range(1, 4, 1, 10), new Range(1, 4, 1, 10)]
          ]
        );
      });
      test("edit.start > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 10, 1, 11),
          "c",
          [
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)],
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)]
          ]
        );
      });
    });
  });
  suite("replace long", () => {
    suite("collapsed dec", () => {
      test("edit.end < range.start", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 1, 1, 3),
          "cccc",
          [
            [new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6)],
            [new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6)]
          ]
        );
      });
      test("edit.end <= range.start", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 2, 1, 4),
          "cccc",
          [
            [new Range(1, 4, 1, 6), new Range(1, 6, 1, 6), new Range(1, 4, 1, 4), new Range(1, 6, 1, 6)],
            [new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6), new Range(1, 6, 1, 6)]
          ]
        );
      });
      test("edit.start < range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 3, 1, 5),
          "cccc",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 7, 1, 7), new Range(1, 7, 1, 7), new Range(1, 7, 1, 7), new Range(1, 7, 1, 7)]
          ]
        );
      });
      test("edit.start >= range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 4, 1, 6),
          "cccc",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 8, 1, 8), new Range(1, 8, 1, 8), new Range(1, 8, 1, 8), new Range(1, 8, 1, 8)]
          ]
        );
      });
      test("edit.start > range.end", () => {
        runTest(
          new Range(1, 4, 1, 4),
          new Range(1, 5, 1, 7),
          "cccc",
          [
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)],
            [new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4), new Range(1, 4, 1, 4)]
          ]
        );
      });
    });
    suite("non-collapsed dec", () => {
      test("edit.end < range.start", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 1, 1, 3),
          "cccc",
          [
            [new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11)],
            [new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11)]
          ]
        );
      });
      test("edit.end <= range.start", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 2, 1, 4),
          "cccc",
          [
            [new Range(1, 4, 1, 11), new Range(1, 6, 1, 11), new Range(1, 4, 1, 11), new Range(1, 6, 1, 11)],
            [new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11), new Range(1, 6, 1, 11)]
          ]
        );
      });
      test("edit.start < range.start && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 5),
          "cccc",
          [
            [new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11)],
            [new Range(1, 7, 1, 11), new Range(1, 7, 1, 11), new Range(1, 7, 1, 11), new Range(1, 7, 1, 11)]
          ]
        );
      });
      test("edit.start < range.start && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 9),
          "cccc",
          [
            [new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7)],
            [new Range(1, 7, 1, 7), new Range(1, 7, 1, 7), new Range(1, 7, 1, 7), new Range(1, 7, 1, 7)]
          ]
        );
      });
      test("edit.start < range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 3, 1, 10),
          "cccc",
          [
            [new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7), new Range(1, 4, 1, 7)],
            [new Range(1, 7, 1, 7), new Range(1, 7, 1, 7), new Range(1, 7, 1, 7), new Range(1, 7, 1, 7)]
          ]
        );
      });
      test("edit.start == range.start && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 6),
          "cccc",
          [
            [new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11)],
            [new Range(1, 8, 1, 11), new Range(1, 8, 1, 11), new Range(1, 8, 1, 11), new Range(1, 8, 1, 11)]
          ]
        );
      });
      test("edit.start == range.start && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 9),
          "cccc",
          [
            [new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8)],
            [new Range(1, 8, 1, 8), new Range(1, 8, 1, 8), new Range(1, 8, 1, 8), new Range(1, 8, 1, 8)]
          ]
        );
      });
      test("edit.start == range.start && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 4, 1, 10),
          "cccc",
          [
            [new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8), new Range(1, 4, 1, 8)],
            [new Range(1, 8, 1, 8), new Range(1, 8, 1, 8), new Range(1, 8, 1, 8), new Range(1, 8, 1, 8)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end < range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 7),
          "cccc",
          [
            [new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11)],
            [new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11), new Range(1, 4, 1, 11)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 9),
          "cccc",
          [
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)],
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)]
          ]
        );
      });
      test("edit.start > range.start && edit.start < range.end && edit.end > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 5, 1, 10),
          "cccc",
          [
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)],
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)]
          ]
        );
      });
      test("edit.start == range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 9, 1, 11),
          "cccc",
          [
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)],
            [new Range(1, 4, 1, 13), new Range(1, 4, 1, 13), new Range(1, 4, 1, 13), new Range(1, 4, 1, 13)]
          ]
        );
      });
      test("edit.start > range.end", () => {
        runTest(
          new Range(1, 4, 1, 9),
          new Range(1, 10, 1, 11),
          "cccc",
          [
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)],
            [new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9), new Range(1, 4, 1, 9)]
          ]
        );
      });
    });
  });
});
suite("deltaDecorations", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function decoration(id, startLineNumber, startColumn, endLineNumber, endColum) {
    return {
      id,
      range: new Range(startLineNumber, startColumn, endLineNumber, endColum)
    };
  }
  function toModelDeltaDecoration(dec) {
    return {
      range: dec.range,
      options: {
        description: "test",
        className: dec.id
      }
    };
  }
  function strcmp(a, b) {
    if (a === b) {
      return 0;
    }
    if (a < b) {
      return -1;
    }
    return 1;
  }
  function readModelDecorations(model, ids) {
    return ids.map((id) => {
      return {
        range: model.getDecorationRange(id),
        id: model.getDecorationOptions(id).className
      };
    });
  }
  function testDeltaDecorations(text, decorations, newDecorations) {
    const model = createTextModel(text.join("\n"));
    const initialIds = model.deltaDecorations([], decorations.map(toModelDeltaDecoration));
    const actualDecorations = readModelDecorations(model, initialIds);
    assert.strictEqual(initialIds.length, decorations.length, "returns expected cnt of ids");
    assert.strictEqual(initialIds.length, model.getAllDecorations().length, "does not leak decorations");
    actualDecorations.sort((a, b) => strcmp(a.id, b.id));
    decorations.sort((a, b) => strcmp(a.id, b.id));
    assert.deepStrictEqual(actualDecorations, decorations);
    const newIds = model.deltaDecorations(initialIds, newDecorations.map(toModelDeltaDecoration));
    const actualNewDecorations = readModelDecorations(model, newIds);
    assert.strictEqual(newIds.length, newDecorations.length, "returns expected cnt of ids");
    assert.strictEqual(newIds.length, model.getAllDecorations().length, "does not leak decorations");
    actualNewDecorations.sort((a, b) => strcmp(a.id, b.id));
    newDecorations.sort((a, b) => strcmp(a.id, b.id));
    assert.deepStrictEqual(actualDecorations, decorations);
    model.dispose();
  }
  function range(startLineNumber, startColumn, endLineNumber, endColumn) {
    return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
  }
  test("result respects input", () => {
    const model = createTextModel([
      "Hello world,",
      "How are you?"
    ].join("\n"));
    const ids = model.deltaDecorations([], [
      toModelDeltaDecoration(decoration("a", 1, 1, 1, 12)),
      toModelDeltaDecoration(decoration("b", 2, 1, 2, 13))
    ]);
    assert.deepStrictEqual(model.getDecorationRange(ids[0]), range(1, 1, 1, 12));
    assert.deepStrictEqual(model.getDecorationRange(ids[1]), range(2, 1, 2, 13));
    model.dispose();
  });
  test("deltaDecorations 1", () => {
    testDeltaDecorations(
      [
        "This is a text",
        "That has multiple lines",
        "And is very friendly",
        "Towards testing"
      ],
      [
        decoration("a", 1, 1, 1, 2),
        decoration("b", 1, 1, 1, 15),
        decoration("c", 1, 1, 2, 1),
        decoration("d", 1, 1, 2, 24),
        decoration("e", 2, 1, 2, 24),
        decoration("f", 2, 1, 4, 16)
      ],
      [
        decoration("x", 1, 1, 1, 2),
        decoration("b", 1, 1, 1, 15),
        decoration("c", 1, 1, 2, 1),
        decoration("d", 1, 1, 2, 24),
        decoration("e", 2, 1, 2, 21),
        decoration("f", 2, 17, 4, 16)
      ]
    );
  });
  test("deltaDecorations 2", () => {
    testDeltaDecorations(
      [
        "This is a text",
        "That has multiple lines",
        "And is very friendly",
        "Towards testing"
      ],
      [
        decoration("a", 1, 1, 1, 2),
        decoration("b", 1, 2, 1, 3),
        decoration("c", 1, 3, 1, 4),
        decoration("d", 1, 4, 1, 5),
        decoration("e", 1, 5, 1, 6)
      ],
      [
        decoration("a", 1, 2, 1, 3),
        decoration("b", 1, 3, 1, 4),
        decoration("c", 1, 4, 1, 5),
        decoration("d", 1, 5, 1, 6)
      ]
    );
  });
  test("deltaDecorations 3", () => {
    testDeltaDecorations(
      [
        "This is a text",
        "That has multiple lines",
        "And is very friendly",
        "Towards testing"
      ],
      [
        decoration("a", 1, 1, 1, 2),
        decoration("b", 1, 2, 1, 3),
        decoration("c", 1, 3, 1, 4),
        decoration("d", 1, 4, 1, 5),
        decoration("e", 1, 5, 1, 6)
      ],
      []
    );
  });
  test("issue #4317: editor.setDecorations doesn't update the hover message", () => {
    const model = createTextModel("Hello world!");
    let ids = model.deltaDecorations([], [{
      range: {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 100,
        endColumn: 1
      },
      options: {
        description: "test",
        hoverMessage: { value: "hello1" }
      }
    }]);
    ids = model.deltaDecorations(ids, [{
      range: {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 100,
        endColumn: 1
      },
      options: {
        description: "test",
        hoverMessage: { value: "hello2" }
      }
    }]);
    const actualDecoration = model.getDecorationOptions(ids[0]);
    assert.deepStrictEqual(actualDecoration.hoverMessage, { value: "hello2" });
    model.dispose();
  });
  test("model doesn't get confused with individual tracked ranges", () => {
    const model = createTextModel([
      "Hello world,",
      "How are you?"
    ].join("\n"));
    const trackedRangeId = model.changeDecorations((changeAcessor) => {
      return changeAcessor.addDecoration(
        {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 1
        },
        {
          description: "test",
          stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges
        }
      );
    });
    model.changeDecorations((changeAccessor) => {
      changeAccessor.removeDecoration(trackedRangeId);
    });
    let ids = model.deltaDecorations([], [
      toModelDeltaDecoration(decoration("a", 1, 1, 1, 12)),
      toModelDeltaDecoration(decoration("b", 2, 1, 2, 13))
    ]);
    assert.deepStrictEqual(model.getDecorationRange(ids[0]), range(1, 1, 1, 12));
    assert.deepStrictEqual(model.getDecorationRange(ids[1]), range(2, 1, 2, 13));
    ids = model.deltaDecorations(ids, [
      toModelDeltaDecoration(decoration("a", 1, 1, 1, 12)),
      toModelDeltaDecoration(decoration("b", 2, 1, 2, 13))
    ]);
    assert.deepStrictEqual(model.getDecorationRange(ids[0]), range(1, 1, 1, 12));
    assert.deepStrictEqual(model.getDecorationRange(ids[1]), range(2, 1, 2, 13));
    model.dispose();
  });
  test("issue #16922: Clicking on link doesn't seem to do anything", () => {
    const model = createTextModel([
      "Hello world,",
      "How are you?",
      "Fine.",
      "Good."
    ].join("\n"));
    model.deltaDecorations([], [
      { range: new Range(1, 1, 1, 1), options: { description: "test", className: "1" } },
      { range: new Range(1, 13, 1, 13), options: { description: "test", className: "2" } },
      { range: new Range(2, 1, 2, 1), options: { description: "test", className: "3" } },
      { range: new Range(2, 1, 2, 4), options: { description: "test", className: "4" } },
      { range: new Range(2, 8, 2, 13), options: { description: "test", className: "5" } },
      { range: new Range(3, 1, 4, 6), options: { description: "test", className: "6" } },
      { range: new Range(1, 1, 3, 6), options: { description: "test", className: "x1" } },
      { range: new Range(2, 5, 2, 8), options: { description: "test", className: "x2" } },
      { range: new Range(1, 1, 2, 8), options: { description: "test", className: "x3" } },
      { range: new Range(2, 5, 3, 1), options: { description: "test", className: "x4" } }
    ]);
    const inRange = model.getDecorationsInRange(new Range(2, 6, 2, 6));
    const inRangeClassNames = inRange.map((d) => d.options.className);
    inRangeClassNames.sort();
    assert.deepStrictEqual(inRangeClassNames, ["x1", "x2", "x3", "x4"]);
    model.dispose();
  });
  test("issue #41492: URL highlighting persists after pasting over url", () => {
    const model = createTextModel([
      "My First Line"
    ].join("\n"));
    const id = model.deltaDecorations([], [{ range: new Range(1, 2, 1, 14), options: { description: "test", stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, collapseOnReplaceEdit: true } }])[0];
    model.applyEdits([{
      range: new Range(1, 1, 1, 14),
      text: "Some new text that is longer than the previous one",
      forceMoveMarkers: false
    }]);
    const actual = model.getDecorationRange(id);
    assert.deepStrictEqual(actual, new Range(1, 1, 1, 1));
    model.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2RlbC9tb2RlbERlY29yYXRpb25zLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBFbmRPZkxpbmVTZXF1ZW5jZSwgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vdGVzdFRleHRNb2RlbC5qcyc7XG5cbi8vIC0tLS0tLS0tLSB1dGlsc1xuXG5pbnRlcmZhY2UgSUxpZ2h0V2VpZ2h0RGVjb3JhdGlvbjIge1xuXHRyYW5nZTogUmFuZ2U7XG5cdGNsYXNzTmFtZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gbW9kZWxIYXNEZWNvcmF0aW9ucyhtb2RlbDogVGV4dE1vZGVsLCBkZWNvcmF0aW9uczogSUxpZ2h0V2VpZ2h0RGVjb3JhdGlvbjJbXSkge1xuXHRjb25zdCBtb2RlbERlY29yYXRpb25zOiBJTGlnaHRXZWlnaHREZWNvcmF0aW9uMltdID0gW107XG5cdGNvbnN0IGFjdHVhbERlY29yYXRpb25zID0gbW9kZWwuZ2V0QWxsRGVjb3JhdGlvbnMoKTtcblx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGFjdHVhbERlY29yYXRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0bW9kZWxEZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdHJhbmdlOiBhY3R1YWxEZWNvcmF0aW9uc1tpXS5yYW5nZSxcblx0XHRcdGNsYXNzTmFtZTogYWN0dWFsRGVjb3JhdGlvbnNbaV0ub3B0aW9ucy5jbGFzc05hbWVcblx0XHR9KTtcblx0fVxuXHRtb2RlbERlY29yYXRpb25zLnNvcnQoKGEsIGIpID0+IFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyhhLnJhbmdlLCBiLnJhbmdlKSk7XG5cdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWxEZWNvcmF0aW9ucywgZGVjb3JhdGlvbnMpO1xufVxuXG5mdW5jdGlvbiBtb2RlbEhhc0RlY29yYXRpb24obW9kZWw6IFRleHRNb2RlbCwgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgZW5kQ29sdW1uOiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKSB7XG5cdG1vZGVsSGFzRGVjb3JhdGlvbnMobW9kZWwsIFt7XG5cdFx0cmFuZ2U6IG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4pLFxuXHRcdGNsYXNzTmFtZTogY2xhc3NOYW1lXG5cdH1dKTtcbn1cblxuZnVuY3Rpb24gbW9kZWxIYXNOb0RlY29yYXRpb25zKG1vZGVsOiBUZXh0TW9kZWwpIHtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldEFsbERlY29yYXRpb25zKCkubGVuZ3RoLCAwLCAnTW9kZWwgaGFzIG5vIGRlY29yYXRpb24nKTtcbn1cblxuZnVuY3Rpb24gYWRkRGVjb3JhdGlvbihtb2RlbDogVGV4dE1vZGVsLCBzdGFydExpbmVOdW1iZXI6IG51bWJlciwgc3RhcnRDb2x1bW46IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyLCBlbmRDb2x1bW46IG51bWJlciwgY2xhc3NOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gbW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoKGNoYW5nZUFjY2Vzc29yKSA9PiB7XG5cdFx0cmV0dXJuIGNoYW5nZUFjY2Vzc29yLmFkZERlY29yYXRpb24obmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbiksIHtcblx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCcsXG5cdFx0XHRjbGFzc05hbWU6IGNsYXNzTmFtZVxuXHRcdH0pO1xuXHR9KSE7XG59XG5cbmZ1bmN0aW9uIGxpbmVIYXNEZWNvcmF0aW9ucyhtb2RlbDogVGV4dE1vZGVsLCBsaW5lTnVtYmVyOiBudW1iZXIsIGRlY29yYXRpb25zOiB7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyOyBjbGFzc05hbWU6IHN0cmluZyB9W10pIHtcblx0Y29uc3QgbGluZURlY29yYXRpb25zOiBBcnJheTx7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyOyBjbGFzc05hbWU6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQgfT4gPSBbXTtcblx0Y29uc3QgZGVjcyA9IG1vZGVsLmdldExpbmVEZWNvcmF0aW9ucyhsaW5lTnVtYmVyKTtcblx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGRlY3MubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRsaW5lRGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRzdGFydDogZGVjc1tpXS5yYW5nZS5zdGFydENvbHVtbixcblx0XHRcdGVuZDogZGVjc1tpXS5yYW5nZS5lbmRDb2x1bW4sXG5cdFx0XHRjbGFzc05hbWU6IGRlY3NbaV0ub3B0aW9ucy5jbGFzc05hbWVcblx0XHR9KTtcblx0fVxuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpbmVEZWNvcmF0aW9ucywgZGVjb3JhdGlvbnMsICdMaW5lIGRlY29yYXRpb25zJyk7XG59XG5cbmZ1bmN0aW9uIGxpbmVIYXNOb0RlY29yYXRpb25zKG1vZGVsOiBUZXh0TW9kZWwsIGxpbmVOdW1iZXI6IG51bWJlcikge1xuXHRsaW5lSGFzRGVjb3JhdGlvbnMobW9kZWwsIGxpbmVOdW1iZXIsIFtdKTtcbn1cblxuZnVuY3Rpb24gbGluZUhhc0RlY29yYXRpb24obW9kZWw6IFRleHRNb2RlbCwgbGluZU51bWJlcjogbnVtYmVyLCBzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlciwgY2xhc3NOYW1lOiBzdHJpbmcpIHtcblx0bGluZUhhc0RlY29yYXRpb25zKG1vZGVsLCBsaW5lTnVtYmVyLCBbe1xuXHRcdHN0YXJ0OiBzdGFydCxcblx0XHRlbmQ6IGVuZCxcblx0XHRjbGFzc05hbWU6IGNsYXNzTmFtZVxuXHR9XSk7XG59XG5cbnN1aXRlKCdFZGl0b3IgTW9kZWwgLSBNb2RlbCBEZWNvcmF0aW9ucycsICgpID0+IHtcblx0Y29uc3QgTElORTEgPSAnTXkgRmlyc3QgTGluZSc7XG5cdGNvbnN0IExJTkUyID0gJ1xcdFxcdE15IFNlY29uZCBMaW5lJztcblx0Y29uc3QgTElORTMgPSAnICAgIFRoaXJkIExpbmUnO1xuXHRjb25zdCBMSU5FNCA9ICcnO1xuXHRjb25zdCBMSU5FNSA9ICcxJztcblxuXHQvLyAtLS0tLS0tLS0gTW9kZWwgRGVjb3JhdGlvbnNcblxuXHRsZXQgdGhpc01vZGVsOiBUZXh0TW9kZWw7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPVxuXHRcdFx0TElORTEgKyAnXFxyXFxuJyArXG5cdFx0XHRMSU5FMiArICdcXG4nICtcblx0XHRcdExJTkUzICsgJ1xcbicgK1xuXHRcdFx0TElORTQgKyAnXFxyXFxuJyArXG5cdFx0XHRMSU5FNTtcblx0XHR0aGlzTW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwodGV4dCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHR0aGlzTW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzaW5nbGUgY2hhcmFjdGVyIGRlY29yYXRpb24nLCAoKSA9PiB7XG5cdFx0YWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDEsIDEsIDIsICdteVR5cGUnKTtcblx0XHRsaW5lSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDEsIDIsICdteVR5cGUnKTtcblx0XHRsaW5lSGFzTm9EZWNvcmF0aW9ucyh0aGlzTW9kZWwsIDIpO1xuXHRcdGxpbmVIYXNOb0RlY29yYXRpb25zKHRoaXNNb2RlbCwgMyk7XG5cdFx0bGluZUhhc05vRGVjb3JhdGlvbnModGhpc01vZGVsLCA0KTtcblx0XHRsaW5lSGFzTm9EZWNvcmF0aW9ucyh0aGlzTW9kZWwsIDUpO1xuXHR9KTtcblxuXHR0ZXN0KCdsaW5lIGRlY29yYXRpb24nLCAoKSA9PiB7XG5cdFx0YWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDEsIDEsIDE0LCAnbXlUeXBlJyk7XG5cdFx0bGluZUhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAxLCAxNCwgJ215VHlwZScpO1xuXHRcdGxpbmVIYXNOb0RlY29yYXRpb25zKHRoaXNNb2RlbCwgMik7XG5cdFx0bGluZUhhc05vRGVjb3JhdGlvbnModGhpc01vZGVsLCAzKTtcblx0XHRsaW5lSGFzTm9EZWNvcmF0aW9ucyh0aGlzTW9kZWwsIDQpO1xuXHRcdGxpbmVIYXNOb0RlY29yYXRpb25zKHRoaXNNb2RlbCwgNSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1bGwgbGluZSBkZWNvcmF0aW9uJywgKCkgPT4ge1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAxLCAyLCAxLCAnbXlUeXBlJyk7XG5cblx0XHRjb25zdCBsaW5lMURlY29yYXRpb25zID0gdGhpc01vZGVsLmdldExpbmVEZWNvcmF0aW9ucygxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZTFEZWNvcmF0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMURlY29yYXRpb25zWzBdLm9wdGlvbnMuY2xhc3NOYW1lLCAnbXlUeXBlJyk7XG5cblx0XHRjb25zdCBsaW5lMkRlY29yYXRpb25zID0gdGhpc01vZGVsLmdldExpbmVEZWNvcmF0aW9ucygxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZTJEZWNvcmF0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMkRlY29yYXRpb25zWzBdLm9wdGlvbnMuY2xhc3NOYW1lLCAnbXlUeXBlJyk7XG5cblx0XHRsaW5lSGFzTm9EZWNvcmF0aW9ucyh0aGlzTW9kZWwsIDMpO1xuXHRcdGxpbmVIYXNOb0RlY29yYXRpb25zKHRoaXNNb2RlbCwgNCk7XG5cdFx0bGluZUhhc05vRGVjb3JhdGlvbnModGhpc01vZGVsLCA1KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgbGluZSBkZWNvcmF0aW9uJywgKCkgPT4ge1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cblx0XHRjb25zdCBsaW5lMURlY29yYXRpb25zID0gdGhpc01vZGVsLmdldExpbmVEZWNvcmF0aW9ucygxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZTFEZWNvcmF0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMURlY29yYXRpb25zWzBdLm9wdGlvbnMuY2xhc3NOYW1lLCAnbXlUeXBlJyk7XG5cblx0XHRjb25zdCBsaW5lMkRlY29yYXRpb25zID0gdGhpc01vZGVsLmdldExpbmVEZWNvcmF0aW9ucygxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZTJEZWNvcmF0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMkRlY29yYXRpb25zWzBdLm9wdGlvbnMuY2xhc3NOYW1lLCAnbXlUeXBlJyk7XG5cblx0XHRjb25zdCBsaW5lM0RlY29yYXRpb25zID0gdGhpc01vZGVsLmdldExpbmVEZWNvcmF0aW9ucygxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZTNEZWNvcmF0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lM0RlY29yYXRpb25zWzBdLm9wdGlvbnMuY2xhc3NOYW1lLCAnbXlUeXBlJyk7XG5cblx0XHRsaW5lSGFzTm9EZWNvcmF0aW9ucyh0aGlzTW9kZWwsIDQpO1xuXHRcdGxpbmVIYXNOb0RlY29yYXRpb25zKHRoaXNNb2RlbCwgNSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0tLS0tLSByZW1vdmluZywgY2hhbmdpbmcgZGVjb3JhdGlvbnNcblxuXHR0ZXN0KCdkZWNvcmF0aW9uIGdldHMgcmVtb3ZlZCcsICgpID0+IHtcblx0XHRjb25zdCBkZWNJZCA9IGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgMywgMiwgJ215VHlwZScpO1xuXHRcdHRoaXNNb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucygoY2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdGNoYW5nZUFjY2Vzc29yLnJlbW92ZURlY29yYXRpb24oZGVjSWQpO1xuXHRcdH0pO1xuXHRcdG1vZGVsSGFzTm9EZWNvcmF0aW9ucyh0aGlzTW9kZWwpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWNvcmF0aW9ucyBnZXQgcmVtb3ZlZCcsICgpID0+IHtcblx0XHRjb25zdCBkZWNJZDEgPSBhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgMywgMiwgJ215VHlwZTEnKTtcblx0XHRjb25zdCBkZWNJZDIgPSBhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgMywgMSwgJ215VHlwZTInKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb25zKHRoaXNNb2RlbCwgW1xuXHRcdFx0e1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDIsIDMsIDEpLFxuXHRcdFx0XHRjbGFzc05hbWU6ICdteVR5cGUyJ1xuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAyLCAzLCAyKSxcblx0XHRcdFx0Y2xhc3NOYW1lOiAnbXlUeXBlMSdcblx0XHRcdH1cblx0XHRdKTtcblx0XHR0aGlzTW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoKGNoYW5nZUFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjaGFuZ2VBY2Nlc3Nvci5yZW1vdmVEZWNvcmF0aW9uKGRlY0lkMSk7XG5cdFx0fSk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9ucyh0aGlzTW9kZWwsIFtcblx0XHRcdHtcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAyLCAzLCAxKSxcblx0XHRcdFx0Y2xhc3NOYW1lOiAnbXlUeXBlMidcblx0XHRcdH1cblx0XHRdKTtcblx0XHR0aGlzTW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoKGNoYW5nZUFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjaGFuZ2VBY2Nlc3Nvci5yZW1vdmVEZWNvcmF0aW9uKGRlY0lkMik7XG5cdFx0fSk7XG5cdFx0bW9kZWxIYXNOb0RlY29yYXRpb25zKHRoaXNNb2RlbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29yYXRpb24gcmFuZ2UgY2FuIGJlIGNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGVjSWQgPSBhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgMywgMiwgJ215VHlwZScpO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDIsICdteVR5cGUnKTtcblx0XHR0aGlzTW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoKGNoYW5nZUFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjaGFuZ2VBY2Nlc3Nvci5jaGFuZ2VEZWNvcmF0aW9uKGRlY0lkLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMikpO1xuXHRcdH0pO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDEsIDEsIDIsICdteVR5cGUnKTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tIGV2ZW50aW5nXG5cblx0dGVzdCgnZGVjb3JhdGlvbnMgZW1pdCBldmVudCBvbiBhZGQnLCAoKSA9PiB7XG5cdFx0bGV0IGxpc3RlbmVyQ2FsbGVkID0gMDtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpc01vZGVsLm9uRGlkQ2hhbmdlRGVjb3JhdGlvbnMoKGUpID0+IHtcblx0XHRcdGxpc3RlbmVyQ2FsbGVkKys7XG5cdFx0fSk7XG5cdFx0YWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDIsICdteVR5cGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlzdGVuZXJDYWxsZWQsIDEsICdsaXN0ZW5lciBjYWxsZWQnKTtcblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZGVjb3JhdGlvbnMgZW1pdCBldmVudCBvbiBjaGFuZ2UnLCAoKSA9PiB7XG5cdFx0bGV0IGxpc3RlbmVyQ2FsbGVkID0gMDtcblx0XHRjb25zdCBkZWNJZCA9IGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXNNb2RlbC5vbkRpZENoYW5nZURlY29yYXRpb25zKChlKSA9PiB7XG5cdFx0XHRsaXN0ZW5lckNhbGxlZCsrO1xuXHRcdH0pO1xuXHRcdHRoaXNNb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucygoY2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdGNoYW5nZUFjY2Vzc29yLmNoYW5nZURlY29yYXRpb24oZGVjSWQsIG5ldyBSYW5nZSgxLCAxLCAxLCAyKSk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpc3RlbmVyQ2FsbGVkLCAxLCAnbGlzdGVuZXIgY2FsbGVkJyk7XG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29yYXRpb25zIGVtaXQgZXZlbnQgb24gcmVtb3ZlJywgKCkgPT4ge1xuXHRcdGxldCBsaXN0ZW5lckNhbGxlZCA9IDA7XG5cdFx0Y29uc3QgZGVjSWQgPSBhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgMywgMiwgJ215VHlwZScpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzTW9kZWwub25EaWRDaGFuZ2VEZWNvcmF0aW9ucygoZSkgPT4ge1xuXHRcdFx0bGlzdGVuZXJDYWxsZWQrKztcblx0XHR9KTtcblx0XHR0aGlzTW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoKGNoYW5nZUFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjaGFuZ2VBY2Nlc3Nvci5yZW1vdmVEZWNvcmF0aW9uKGRlY0lkKTtcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlzdGVuZXJDYWxsZWQsIDEsICdsaXN0ZW5lciBjYWxsZWQnKTtcblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZGVjb3JhdGlvbnMgZW1pdCBldmVudCB3aGVuIGluc2VydGluZyBvbmUgbGluZSB0ZXh0IGJlZm9yZSBpdCcsICgpID0+IHtcblx0XHRsZXQgbGlzdGVuZXJDYWxsZWQgPSAwO1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpc01vZGVsLm9uRGlkQ2hhbmdlRGVjb3JhdGlvbnMoKGUpID0+IHtcblx0XHRcdGxpc3RlbmVyQ2FsbGVkKys7XG5cdFx0fSk7XG5cblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDEsIDEpLCAnSGFsbG8gJyldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlzdGVuZXJDYWxsZWQsIDEsICdsaXN0ZW5lciBjYWxsZWQnKTtcblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZGVjb3JhdGlvbnMgZG8gbm90IGVtaXQgZXZlbnQgb24gbm8tb3AgZGVsdGFEZWNvcmF0aW9ucycsICgpID0+IHtcblx0XHRsZXQgbGlzdGVuZXJDYWxsZWQgPSAwO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXNNb2RlbC5vbkRpZENoYW5nZURlY29yYXRpb25zKChlKSA9PiB7XG5cdFx0XHRsaXN0ZW5lckNhbGxlZCsrO1xuXHRcdH0pO1xuXG5cdFx0dGhpc01vZGVsLmRlbHRhRGVjb3JhdGlvbnMoW10sIFtdKTtcblx0XHR0aGlzTW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRhY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zKFtdLCBbXSk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlzdGVuZXJDYWxsZWQsIDAsICdsaXN0ZW5lciBub3QgY2FsbGVkJyk7XG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdC8vIC0tLS0tLS0tLSBlZGl0aW5nIHRleHQgJiBlZmZlY3RzIG9uIGRlY29yYXRpb25zXG5cblx0dGVzdCgnZGVjb3JhdGlvbnMgYXJlIHVwZGF0ZWQgd2hlbiBpbnNlcnRpbmcgb25lIGxpbmUgdGV4dCBiZWZvcmUgaXQnLCAoKSA9PiB7XG5cdFx0YWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDIsICdteVR5cGUnKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uaW5zZXJ0KG5ldyBQb3NpdGlvbigxLCAxKSwgJ0hhbGxvICcpXSk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgOCwgMywgMiwgJ215VHlwZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWNvcmF0aW9ucyBhcmUgdXBkYXRlZCB3aGVuIGluc2VydGluZyBvbmUgbGluZSB0ZXh0IGJlZm9yZSBpdCAyJywgKCkgPT4ge1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAxLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMSwgMywgMiwgJ215VHlwZScpO1xuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLnJlcGxhY2UobmV3IFJhbmdlKDEsIDEsIDEsIDEpLCAnSGFsbG8gJyldKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAxLCAzLCAyLCAnbXlUeXBlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29yYXRpb25zIGFyZSB1cGRhdGVkIHdoZW4gaW5zZXJ0aW5nIG11bHRpcGxlIGxpbmVzIHRleHQgYmVmb3JlIGl0JywgKCkgPT4ge1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgMywgMiwgJ215VHlwZScpO1xuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmluc2VydChuZXcgUG9zaXRpb24oMSwgMSksICdIYWxsb1xcbklcXCdtIGluc2VydGluZyBtdWx0aXBsZVxcbmxpbmVzJyldKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAzLCA3LCA1LCAyLCAnbXlUeXBlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29yYXRpb25zIGNoYW5nZSB3aGVuIGluc2VydGluZyB0ZXh0IGFmdGVyIHRoZW0nLCAoKSA9PiB7XG5cdFx0YWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDIsICdteVR5cGUnKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uaW5zZXJ0KG5ldyBQb3NpdGlvbigzLCAyKSwgJ0hhbGxvJyldKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCA3LCAnbXlUeXBlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29yYXRpb25zIGFyZSB1cGRhdGVkIHdoZW4gaW5zZXJ0aW5nIHRleHQgaW5zaWRlJywgKCkgPT4ge1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgMywgMiwgJ215VHlwZScpO1xuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmluc2VydChuZXcgUG9zaXRpb24oMSwgMyksICdIYWxsbyAnKV0pO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDIsICdteVR5cGUnKTtcblx0fSk7XG5cblx0dGVzdCgnZGVjb3JhdGlvbnMgYXJlIHVwZGF0ZWQgd2hlbiBpbnNlcnRpbmcgdGV4dCBpbnNpZGUgMicsICgpID0+IHtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgMywgMiwgJ215VHlwZScpO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDIsICdteVR5cGUnKTtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDMsIDEpLCAnSGFsbG8gJyldKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCA4LCAnbXlUeXBlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29yYXRpb25zIGFyZSB1cGRhdGVkIHdoZW4gaW5zZXJ0aW5nIHRleHQgaW5zaWRlIDMnLCAoKSA9PiB7XG5cdFx0YWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDEsIDIsIDE2LCAnbXlUeXBlJyk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMSwgMiwgMTYsICdteVR5cGUnKTtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDIsIDIpLCAnXFxuJyldKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAxLCAzLCAxNSwgJ215VHlwZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWNvcmF0aW9ucyBhcmUgdXBkYXRlZCB3aGVuIGluc2VydGluZyBtdWx0aXBsZSBsaW5lcyB0ZXh0IGluc2lkZScsICgpID0+IHtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgMywgMiwgJ215VHlwZScpO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDMsIDIsICdteVR5cGUnKTtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDEsIDMpLCAnSGFsbG9cXG5JXFwnbSBpbnNlcnRpbmcgbXVsdGlwbGVcXG5saW5lcycpXSk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgNSwgMiwgJ215VHlwZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWNvcmF0aW9ucyBhcmUgdXBkYXRlZCB3aGVuIGRlbGV0aW5nIG9uZSBsaW5lIHRleHQgYmVmb3JlIGl0JywgKCkgPT4ge1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgMywgMiwgJ215VHlwZScpO1xuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmRlbGV0ZShuZXcgUmFuZ2UoMSwgMSwgMSwgMikpXSk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMSwgMywgMiwgJ215VHlwZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWNvcmF0aW9ucyBhcmUgdXBkYXRlZCB3aGVuIGRlbGV0aW5nIG11bHRpcGxlIGxpbmVzIHRleHQgYmVmb3JlIGl0JywgKCkgPT4ge1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAyLCAyLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMiwgMiwgMywgMiwgJ215VHlwZScpO1xuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmRlbGV0ZShuZXcgUmFuZ2UoMSwgMSwgMiwgMSkpXSk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgMiwgMiwgJ215VHlwZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWNvcmF0aW9ucyBhcmUgdXBkYXRlZCB3aGVuIGRlbGV0aW5nIG11bHRpcGxlIGxpbmVzIHRleHQgYmVmb3JlIGl0IDInLCAoKSA9PiB7XG5cdFx0YWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDIsIDMsIDMsIDIsICdteVR5cGUnKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAyLCAzLCAzLCAyLCAnbXlUeXBlJyk7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uZGVsZXRlKG5ldyBSYW5nZSgxLCAxLCAyLCAyKSldKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAyLCAyLCAnbXlUeXBlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29yYXRpb25zIGFyZSB1cGRhdGVkIHdoZW4gZGVsZXRpbmcgdGV4dCBpbnNpZGUnLCAoKSA9PiB7XG5cdFx0YWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDQsIDEsICdteVR5cGUnKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCA0LCAxLCAnbXlUeXBlJyk7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uZGVsZXRlKG5ldyBSYW5nZSgxLCAzLCAyLCAxKSldKTtcblx0XHRtb2RlbEhhc0RlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCAzLCAxLCAnbXlUeXBlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29yYXRpb25zIGFyZSB1cGRhdGVkIHdoZW4gZGVsZXRpbmcgdGV4dCBpbnNpZGUgMicsICgpID0+IHtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgNCwgMSwgJ215VHlwZScpO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDQsIDEsICdteVR5cGUnKTtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHRFZGl0T3BlcmF0aW9uLmRlbGV0ZShuZXcgUmFuZ2UoMSwgMSwgMSwgMikpLFxuXHRcdFx0RWRpdE9wZXJhdGlvbi5kZWxldGUobmV3IFJhbmdlKDQsIDEsIDQsIDEpKVxuXHRcdF0pO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDEsIDQsIDEsICdteVR5cGUnKTtcblx0fSk7XG5cblx0dGVzdCgnZGVjb3JhdGlvbnMgYXJlIHVwZGF0ZWQgd2hlbiBkZWxldGluZyBtdWx0aXBsZSBsaW5lcyB0ZXh0JywgKCkgPT4ge1xuXHRcdGFkZERlY29yYXRpb24odGhpc01vZGVsLCAxLCAyLCA0LCAxLCAnbXlUeXBlJyk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgNCwgMSwgJ215VHlwZScpO1xuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmRlbGV0ZShuZXcgUmFuZ2UoMSwgMSwgMywgMSkpXSk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMSwgMiwgMSwgJ215VHlwZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWNvcmF0aW9ucyBhcmUgdXBkYXRlZCB3aGVuIGNoYW5naW5nIEVPTCcsICgpID0+IHtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMiwgNCwgMSwgJ215VHlwZTEnKTtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMywgNCwgMSwgJ215VHlwZTInKTtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgNCwgNCwgMSwgJ215VHlwZTMnKTtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgNSwgNCwgMSwgJ215VHlwZTQnKTtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgNiwgNCwgMSwgJ215VHlwZTUnKTtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgNywgNCwgMSwgJ215VHlwZTYnKTtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgOCwgNCwgMSwgJ215VHlwZTcnKTtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgOSwgNCwgMSwgJ215VHlwZTgnKTtcblx0XHRhZGREZWNvcmF0aW9uKHRoaXNNb2RlbCwgMSwgMTAsIDQsIDEsICdteVR5cGU5Jyk7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uaW5zZXJ0KG5ldyBQb3NpdGlvbigxLCAxKSwgJ3gnKV0pO1xuXHRcdHRoaXNNb2RlbC5zZXRFT0woRW5kT2ZMaW5lU2VxdWVuY2UuQ1JMRik7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uaW5zZXJ0KG5ldyBQb3NpdGlvbigxLCAxKSwgJ3gnKV0pO1xuXHRcdG1vZGVsSGFzRGVjb3JhdGlvbnModGhpc01vZGVsLCBbXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgNCwgNCwgMSksIGNsYXNzTmFtZTogJ215VHlwZTEnIH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgNSwgNCwgMSksIGNsYXNzTmFtZTogJ215VHlwZTInIH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgNiwgNCwgMSksIGNsYXNzTmFtZTogJ215VHlwZTMnIH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgNywgNCwgMSksIGNsYXNzTmFtZTogJ215VHlwZTQnIH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgOCwgNCwgMSksIGNsYXNzTmFtZTogJ215VHlwZTUnIH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgOSwgNCwgMSksIGNsYXNzTmFtZTogJ215VHlwZTYnIH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTAsIDQsIDEpLCBjbGFzc05hbWU6ICdteVR5cGU3JyB9LFxuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDEsIDExLCA0LCAxKSwgY2xhc3NOYW1lOiAnbXlUeXBlOCcgfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxMiwgNCwgMSksIGNsYXNzTmFtZTogJ215VHlwZTknIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FuIGFwcGFyZW50bHkgc2ltcGxlIGVkaXQnLCAoKSA9PiB7XG5cdFx0YWRkRGVjb3JhdGlvbih0aGlzTW9kZWwsIDEsIDIsIDQsIDEsICdteVR5cGUxJyk7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24ucmVwbGFjZShuZXcgUmFuZ2UoMSwgMTQsIDIsIDEpLCAneCcpXSk7XG5cdFx0bW9kZWxIYXNEZWNvcmF0aW9ucyh0aGlzTW9kZWwsIFtcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCAyLCAzLCAxKSwgY2xhc3NOYW1lOiAnbXlUeXBlMScgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlQWxsRGVjb3JhdGlvbnNXaXRoT3duZXJJZCBjYW4gYmUgY2FsbGVkIGFmdGVyIG1vZGVsIGRpc3Bvc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2FzZCcpO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRtb2RlbC5yZW1vdmVBbGxEZWNvcmF0aW9uc1dpdGhPd25lcklkKDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVBbGxEZWNvcmF0aW9uc1dpdGhPd25lcklkIHdvcmtzJywgKCkgPT4ge1xuXHRcdHRoaXNNb2RlbC5kZWx0YURlY29yYXRpb25zKFtdLCBbeyByYW5nZTogbmV3IFJhbmdlKDEsIDIsIDQsIDEpLCBvcHRpb25zOiB7IGRlc2NyaXB0aW9uOiAndGVzdCcsIGNsYXNzTmFtZTogJ215VHlwZTEnIH0gfV0sIDEpO1xuXHRcdHRoaXNNb2RlbC5yZW1vdmVBbGxEZWNvcmF0aW9uc1dpdGhPd25lcklkKDEpO1xuXHRcdG1vZGVsSGFzTm9EZWNvcmF0aW9ucyh0aGlzTW9kZWwpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnRGVjb3JhdGlvbnMgYW5kIGVkaXRpbmcnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gX3J1blRlc3QoZGVjUmFuZ2U6IFJhbmdlLCBzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLCBlZGl0UmFuZ2U6IFJhbmdlLCBlZGl0VGV4dDogc3RyaW5nLCBlZGl0Rm9yY2VNb3ZlTWFya2VyczogYm9vbGVhbiwgZXhwZWN0ZWREZWNSYW5nZTogUmFuZ2UsIG1zZzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0J015IFNlY29uZCBMaW5lJyxcblx0XHRcdCdUaGlyZCBMaW5lJ1xuXHRcdF0uam9pbignXFxuJykpO1xuXG5cdFx0Y29uc3QgaWQgPSBtb2RlbC5kZWx0YURlY29yYXRpb25zKFtdLCBbeyByYW5nZTogZGVjUmFuZ2UsIG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICd0ZXN0Jywgc3RpY2tpbmVzczogc3RpY2tpbmVzcyB9IH1dKVswXTtcblx0XHRtb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRyYW5nZTogZWRpdFJhbmdlLFxuXHRcdFx0dGV4dDogZWRpdFRleHQsXG5cdFx0XHRmb3JjZU1vdmVNYXJrZXJzOiBlZGl0Rm9yY2VNb3ZlTWFya2Vyc1xuXHRcdH1dKTtcblx0XHRjb25zdCBhY3R1YWwgPSBtb2RlbC5nZXREZWNvcmF0aW9uUmFuZ2UoaWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZERlY1JhbmdlLCBtc2cpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9XG5cblx0ZnVuY3Rpb24gcnVuVGVzdChkZWNSYW5nZTogUmFuZ2UsIGVkaXRSYW5nZTogUmFuZ2UsIGVkaXRUZXh0OiBzdHJpbmcsIGV4cGVjdGVkRGVjUmFuZ2U6IFJhbmdlW11bXSk6IHZvaWQge1xuXHRcdF9ydW5UZXN0KGRlY1JhbmdlLCAwLCBlZGl0UmFuZ2UsIGVkaXRUZXh0LCBmYWxzZSwgZXhwZWN0ZWREZWNSYW5nZVswXVswXSwgJ25vLTAtQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcycpO1xuXHRcdF9ydW5UZXN0KGRlY1JhbmdlLCAxLCBlZGl0UmFuZ2UsIGVkaXRUZXh0LCBmYWxzZSwgZXhwZWN0ZWREZWNSYW5nZVswXVsxXSwgJ25vLTEtTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzJyk7XG5cdFx0X3J1blRlc3QoZGVjUmFuZ2UsIDIsIGVkaXRSYW5nZSwgZWRpdFRleHQsIGZhbHNlLCBleHBlY3RlZERlY1JhbmdlWzBdWzJdLCAnbm8tMi1Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlJyk7XG5cdFx0X3J1blRlc3QoZGVjUmFuZ2UsIDMsIGVkaXRSYW5nZSwgZWRpdFRleHQsIGZhbHNlLCBleHBlY3RlZERlY1JhbmdlWzBdWzNdLCAnbm8tMy1Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXInKTtcblxuXHRcdF9ydW5UZXN0KGRlY1JhbmdlLCAwLCBlZGl0UmFuZ2UsIGVkaXRUZXh0LCB0cnVlLCBleHBlY3RlZERlY1JhbmdlWzFdWzBdLCAnZm9yY2UtMC1BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzJyk7XG5cdFx0X3J1blRlc3QoZGVjUmFuZ2UsIDEsIGVkaXRSYW5nZSwgZWRpdFRleHQsIHRydWUsIGV4cGVjdGVkRGVjUmFuZ2VbMV1bMV0sICdmb3JjZS0xLU5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcycpO1xuXHRcdF9ydW5UZXN0KGRlY1JhbmdlLCAyLCBlZGl0UmFuZ2UsIGVkaXRUZXh0LCB0cnVlLCBleHBlY3RlZERlY1JhbmdlWzFdWzJdLCAnZm9yY2UtMi1Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlJyk7XG5cdFx0X3J1blRlc3QoZGVjUmFuZ2UsIDMsIGVkaXRSYW5nZSwgZWRpdFRleHQsIHRydWUsIGV4cGVjdGVkRGVjUmFuZ2VbMV1bM10sICdmb3JjZS0zLUdyb3dzT25seVdoZW5UeXBpbmdBZnRlcicpO1xuXHR9XG5cblx0c3VpdGUoJ2luc2VydCcsICgpID0+IHtcblx0XHRzdWl0ZSgnY29sbGFwc2VkIGRlYycsICgpID0+IHtcblx0XHRcdHRlc3QoJ2JlZm9yZScsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNCksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDMsIDEsIDMpLCAneHgnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNiwgMSwgNiksIG5ldyBSYW5nZSgxLCA2LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDYsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgNildLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA2LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDYsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgNiksIG5ldyBSYW5nZSgxLCA2LCAxLCA2KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlcXVhbCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNCksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLCAneHgnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNiksIG5ldyBSYW5nZSgxLCA2LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgNildLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA2LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDYsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgNiksIG5ldyBSYW5nZSgxLCA2LCAxLCA2KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdhZnRlcicsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNCksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDUsIDEsIDUpLCAneHgnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0c3VpdGUoJ25vbi1jb2xsYXBzZWQgZGVjJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnYmVmb3JlJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMywgMSwgMyksICd4eCcsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA2LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA2LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA2LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA2LCAxLCAxMSldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA2LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA2LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA2LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA2LCAxLCAxMSldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc3RhcnQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgJ3h4Jyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDExKV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDYsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDExKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdpbnNpZGUnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA1LCAxLCA1KSwgJ3h4Jyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDExKV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDExKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA5LCAxLCA5KSwgJ3h4Jyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCAxMSldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA0LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA0LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA0LCAxLCAxMSldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnYWZ0ZXInLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAxMCwgMSwgMTApLCAneHgnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdkZWxldGUnLCAoKSA9PiB7XG5cdFx0c3VpdGUoJ2NvbGxhcHNlZCBkZWMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdlZGl0LmVuZCA8IHJhbmdlLnN0YXJ0JywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgMyksICcnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgMiwgMSwgMiksIG5ldyBSYW5nZSgxLCAyLCAxLCAyKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDIpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgMildLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCAyLCAxLCAyKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDIpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgMiksIG5ldyBSYW5nZSgxLCAyLCAxLCAyKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LmVuZCA8PSByYW5nZS5zdGFydCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNCksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDIsIDEsIDQpLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDIsIDEsIDIpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgMiksIG5ldyBSYW5nZSgxLCAyLCAxLCAyKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDIpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgMiwgMSwgMiksIG5ldyBSYW5nZSgxLCAyLCAxLCAyKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDIpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgMildLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA8IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMywgMSwgNSksICcnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID49IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNCksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDYpLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA+IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNCksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDUsIDEsIDcpLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdHN1aXRlKCdub24tY29sbGFwc2VkIGRlYycsICgpID0+IHtcblx0XHRcdHRlc3QoJ2VkaXQuZW5kIDwgcmFuZ2Uuc3RhcnQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCAzKSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCAyLCAxLCA3KSwgbmV3IFJhbmdlKDEsIDIsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNyksIG5ldyBSYW5nZSgxLCAyLCAxLCA3KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDIsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNyksIG5ldyBSYW5nZSgxLCAyLCAxLCA3KSwgbmV3IFJhbmdlKDEsIDIsIDEsIDcpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuZW5kIDw9IHJhbmdlLnN0YXJ0JywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMiwgMSwgNCksICcnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgMiwgMSwgNyksIG5ldyBSYW5nZSgxLCAyLCAxLCA3KSwgbmV3IFJhbmdlKDEsIDIsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNyldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCAyLCAxLCA3KSwgbmV3IFJhbmdlKDEsIDIsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNyksIG5ldyBSYW5nZSgxLCAyLCAxLCA3KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0IDwgcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPCByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAzLCAxLCA1KSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCAzLCAxLCA3KSwgbmV3IFJhbmdlKDEsIDMsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgMywgMSwgNyksIG5ldyBSYW5nZSgxLCAzLCAxLCA3KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDMsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgMywgMSwgNyksIG5ldyBSYW5nZSgxLCAzLCAxLCA3KSwgbmV3IFJhbmdlKDEsIDMsIDEsIDcpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA8IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kID09IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDMsIDEsIDkpLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0IDwgcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAzLCAxLCAxMCksICcnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPT0gcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPCByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA2KSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA3KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNyksIG5ldyBSYW5nZSgxLCA0LCAxLCA3KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNyksIG5ldyBSYW5nZSgxLCA0LCAxLCA3KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDcpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA9PSByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA9PSByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA9PSByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA+IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDEwKSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA+IHJhbmdlLnN0YXJ0ICYmIGVkaXQuc3RhcnQgPCByYW5nZS5lbmQgJiYgZWRpdC5lbmQgPCByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA1LCAxLCA3KSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA3KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNyksIG5ldyBSYW5nZSgxLCA0LCAxLCA3KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNyksIG5ldyBSYW5nZSgxLCA0LCAxLCA3KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDcpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA+IHJhbmdlLnN0YXJ0ICYmIGVkaXQuc3RhcnQgPCByYW5nZS5lbmQgJiYgZWRpdC5lbmQgPT0gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNSwgMSwgOSksICcnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNSksIG5ldyBSYW5nZSgxLCA0LCAxLCA1KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDUpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNSldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA1KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDUpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNSksIG5ldyBSYW5nZSgxLCA0LCAxLCA1KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPiByYW5nZS5zdGFydCAmJiBlZGl0LnN0YXJ0IDwgcmFuZ2UuZW5kICYmIGVkaXQuZW5kID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNSwgMSwgMTApLCAnJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDUpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNSksIG5ldyBSYW5nZSgxLCA0LCAxLCA1KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDUpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNSksIG5ldyBSYW5nZSgxLCA0LCAxLCA1KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDUpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNSldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID09IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDksIDEsIDExKSwgJycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA+IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDEwLCAxLCAxMSksICcnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXBsYWNlIHNob3J0JywgKCkgPT4ge1xuXHRcdHN1aXRlKCdjb2xsYXBzZWQgZGVjJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnZWRpdC5lbmQgPCByYW5nZS5zdGFydCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNCksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDMpLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuZW5kIDw9IHJhbmdlLnN0YXJ0JywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMiwgMSwgNCksICdjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgMywgMSwgMyksIG5ldyBSYW5nZSgxLCAzLCAxLCAzKSwgbmV3IFJhbmdlKDEsIDMsIDEsIDMpLCBuZXcgUmFuZ2UoMSwgMywgMSwgMyldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA8IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMywgMSwgNSksICdjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA+PSByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA2KSwgJ2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA1LCAxLCA1KSwgbmV3IFJhbmdlKDEsIDUsIDEsIDUpLCBuZXcgUmFuZ2UoMSwgNSwgMSwgNSksIG5ldyBSYW5nZSgxLCA1LCAxLCA1KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNSwgMSwgNyksICdjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdHN1aXRlKCdub24tY29sbGFwc2VkIGRlYycsICgpID0+IHtcblx0XHRcdHRlc3QoJ2VkaXQuZW5kIDwgcmFuZ2Uuc3RhcnQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCAzKSwgJ2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgMywgMSwgOCksIG5ldyBSYW5nZSgxLCAzLCAxLCA4KSwgbmV3IFJhbmdlKDEsIDMsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgMywgMSwgOCldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCAzLCAxLCA4KSwgbmV3IFJhbmdlKDEsIDMsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgMywgMSwgOCksIG5ldyBSYW5nZSgxLCAzLCAxLCA4KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LmVuZCA8PSByYW5nZS5zdGFydCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDIsIDEsIDQpLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCAzLCAxLCA4KSwgbmV3IFJhbmdlKDEsIDMsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgMywgMSwgOCksIG5ldyBSYW5nZSgxLCAzLCAxLCA4KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDMsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgMywgMSwgOCksIG5ldyBSYW5nZSgxLCAzLCAxLCA4KSwgbmV3IFJhbmdlKDEsIDMsIDEsIDgpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPCByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA8IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDMsIDEsIDUpLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOCksIG5ldyBSYW5nZSgxLCA0LCAxLCA4KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOCksIG5ldyBSYW5nZSgxLCA0LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDgpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPCByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA9PSByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAzLCAxLCA5KSwgJ2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0IDwgcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAzLCAxLCAxMCksICdjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA9PSByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA8IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDYpLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOCksIG5ldyBSYW5nZSgxLCA0LCAxLCA4KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDUsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgNSwgMSwgOCksIG5ldyBSYW5nZSgxLCA1LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDUsIDEsIDgpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPT0gcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPT0gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksICdjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDUpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNSksIG5ldyBSYW5nZSgxLCA0LCAxLCA1KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDUpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNSwgMSwgNSksIG5ldyBSYW5nZSgxLCA1LCAxLCA1KSwgbmV3IFJhbmdlKDEsIDUsIDEsIDUpLCBuZXcgUmFuZ2UoMSwgNSwgMSwgNSldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA9PSByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA+IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDEwKSwgJ2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNSksIG5ldyBSYW5nZSgxLCA0LCAxLCA1KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDUpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNSldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA1LCAxLCA1KSwgbmV3IFJhbmdlKDEsIDUsIDEsIDUpLCBuZXcgUmFuZ2UoMSwgNSwgMSwgNSksIG5ldyBSYW5nZSgxLCA1LCAxLCA1KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID4gcmFuZ2Uuc3RhcnQgJiYgZWRpdC5zdGFydCA8IHJhbmdlLmVuZCAmJiBlZGl0LmVuZCA8IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDUsIDEsIDcpLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOCksIG5ldyBSYW5nZSgxLCA0LCAxLCA4KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOCksIG5ldyBSYW5nZSgxLCA0LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDgpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPiByYW5nZS5zdGFydCAmJiBlZGl0LnN0YXJ0IDwgcmFuZ2UuZW5kICYmIGVkaXQuZW5kID09IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDUsIDEsIDkpLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNiksIG5ldyBSYW5nZSgxLCA0LCAxLCA2KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNiksIG5ldyBSYW5nZSgxLCA0LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDYpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPiByYW5nZS5zdGFydCAmJiBlZGl0LnN0YXJ0IDwgcmFuZ2UuZW5kICYmIGVkaXQuZW5kID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNSwgMSwgMTApLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNiksIG5ldyBSYW5nZSgxLCA0LCAxLCA2KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNiksIG5ldyBSYW5nZSgxLCA0LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDYpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPT0gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgOSwgMSwgMTEpLCAnYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDEwKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDEwKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDEwKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDEwKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMTAsIDEsIDExKSwgJ2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXBsYWNlIGxvbmcnLCAoKSA9PiB7XG5cdFx0c3VpdGUoJ2NvbGxhcHNlZCBkZWMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdlZGl0LmVuZCA8IHJhbmdlLnN0YXJ0JywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA0KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgMyksICdjY2NjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDYsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgNiksIG5ldyBSYW5nZSgxLCA2LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDYsIDEsIDYpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNiwgMSwgNiksIG5ldyBSYW5nZSgxLCA2LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDYsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgNildLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5lbmQgPD0gcmFuZ2Uuc3RhcnQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAyLCAxLCA0KSwgJ2NjY2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNiksIG5ldyBSYW5nZSgxLCA2LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgNildLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA2LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDYsIDEsIDYpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgNiksIG5ldyBSYW5nZSgxLCA2LCAxLCA2KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0IDwgcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAzLCAxLCA1KSwgJ2NjY2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA3LCAxLCA3KSwgbmV3IFJhbmdlKDEsIDcsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgNywgMSwgNyksIG5ldyBSYW5nZSgxLCA3LCAxLCA3KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID49IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNCksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDYpLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDgsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgOCwgMSwgOCksIG5ldyBSYW5nZSgxLCA4LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDgsIDEsIDgpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDQpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA1LCAxLCA3KSwgJ2NjY2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0c3VpdGUoJ25vbi1jb2xsYXBzZWQgZGVjJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnZWRpdC5lbmQgPCByYW5nZS5zdGFydCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDMpLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA2LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA2LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA2LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA2LCAxLCAxMSldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA2LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA2LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA2LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA2LCAxLCAxMSldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5lbmQgPD0gcmFuZ2Uuc3RhcnQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAyLCAxLCA0KSwgJ2NjY2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgMTEpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNiwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgMTEpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPCByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA8IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDMsIDEsIDUpLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA0LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA0LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA0LCAxLCAxMSldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA3LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA3LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA3LCAxLCAxMSksIG5ldyBSYW5nZSgxLCA3LCAxLCAxMSldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA8IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kID09IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDMsIDEsIDkpLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA3KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNyksIG5ldyBSYW5nZSgxLCA0LCAxLCA3KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDcsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgNywgMSwgNyksIG5ldyBSYW5nZSgxLCA3LCAxLCA3KSwgbmV3IFJhbmdlKDEsIDcsIDEsIDcpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPCByYW5nZS5zdGFydCAmJiBlZGl0LmVuZCA+IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDMsIDEsIDEwKSwgJ2NjY2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgNyksIG5ldyBSYW5nZSgxLCA0LCAxLCA3KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNyldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA3LCAxLCA3KSwgbmV3IFJhbmdlKDEsIDcsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgNywgMSwgNyksIG5ldyBSYW5nZSgxLCA3LCAxLCA3KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID09IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kIDwgcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgNiksICdjY2NjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDExKV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDgsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDgsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDgsIDEsIDExKSwgbmV3IFJhbmdlKDEsIDgsIDEsIDExKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID09IHJhbmdlLnN0YXJ0ICYmIGVkaXQuZW5kID09IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOCksIG5ldyBSYW5nZSgxLCA0LCAxLCA4KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDgsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgOCwgMSwgOCksIG5ldyBSYW5nZSgxLCA4LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDgsIDEsIDgpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPT0gcmFuZ2Uuc3RhcnQgJiYgZWRpdC5lbmQgPiByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCAxMCksICdjY2NjJyxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOCksIG5ldyBSYW5nZSgxLCA0LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDgpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgOCwgMSwgOCksIG5ldyBSYW5nZSgxLCA4LCAxLCA4KSwgbmV3IFJhbmdlKDEsIDgsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgOCwgMSwgOCldLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnZWRpdC5zdGFydCA+IHJhbmdlLnN0YXJ0ICYmIGVkaXQuc3RhcnQgPCByYW5nZS5lbmQgJiYgZWRpdC5lbmQgPCByYW5nZS5lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1blRlc3QoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDQsIDEsIDkpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA1LCAxLCA3KSwgJ2NjY2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpXSxcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgMTEpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPiByYW5nZS5zdGFydCAmJiBlZGl0LnN0YXJ0IDwgcmFuZ2UuZW5kICYmIGVkaXQuZW5kID09IHJhbmdlLmVuZCcsICgpID0+IHtcblx0XHRcdFx0cnVuVGVzdChcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNCwgMSwgOSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDEsIDUsIDEsIDkpLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPiByYW5nZS5zdGFydCAmJiBlZGl0LnN0YXJ0IDwgcmFuZ2UuZW5kICYmIGVkaXQuZW5kID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgNSwgMSwgMTApLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpXSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2VkaXQuc3RhcnQgPT0gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgOSwgMSwgMTEpLCAnY2NjYycsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KV0sXG5cdFx0XHRcdFx0XHRbbmV3IFJhbmdlKDEsIDQsIDEsIDEzKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDEzKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDEzKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDEzKV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdlZGl0LnN0YXJ0ID4gcmFuZ2UuZW5kJywgKCkgPT4ge1xuXHRcdFx0XHRydW5UZXN0KFxuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCA0LCAxLCA5KSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMTAsIDEsIDExKSwgJ2NjY2MnLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFtuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSldLFxuXHRcdFx0XHRcdFx0W25ldyBSYW5nZSgxLCA0LCAxLCA5KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgOSksIG5ldyBSYW5nZSgxLCA0LCAxLCA5KV0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbmludGVyZmFjZSBJTGlnaHRXZWlnaHREZWNvcmF0aW9uIHtcblx0aWQ6IHN0cmluZztcblx0cmFuZ2U6IFJhbmdlO1xufVxuXG5zdWl0ZSgnZGVsdGFEZWNvcmF0aW9ucycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBkZWNvcmF0aW9uKGlkOiBzdHJpbmcsIHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZENvbHVtOiBudW1iZXIpOiBJTGlnaHRXZWlnaHREZWNvcmF0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IGlkLFxuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bSlcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gdG9Nb2RlbERlbHRhRGVjb3JhdGlvbihkZWM6IElMaWdodFdlaWdodERlY29yYXRpb24pOiBJTW9kZWxEZWx0YURlY29yYXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZTogZGVjLnJhbmdlLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0XHRjbGFzc05hbWU6IGRlYy5pZFxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBzdHJjbXAoYTogc3RyaW5nLCBiOiBzdHJpbmcpOiBudW1iZXIge1xuXHRcdGlmIChhID09PSBiKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0aWYgKGEgPCBiKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHRcdHJldHVybiAxO1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVhZE1vZGVsRGVjb3JhdGlvbnMobW9kZWw6IFRleHRNb2RlbCwgaWRzOiBzdHJpbmdbXSk6IElMaWdodFdlaWdodERlY29yYXRpb25bXSB7XG5cdFx0cmV0dXJuIGlkcy5tYXAoKGlkKSA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyYW5nZTogbW9kZWwuZ2V0RGVjb3JhdGlvblJhbmdlKGlkKSEsXG5cdFx0XHRcdGlkOiBtb2RlbC5nZXREZWNvcmF0aW9uT3B0aW9ucyhpZCkhLmNsYXNzTmFtZSFcblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiB0ZXN0RGVsdGFEZWNvcmF0aW9ucyh0ZXh0OiBzdHJpbmdbXSwgZGVjb3JhdGlvbnM6IElMaWdodFdlaWdodERlY29yYXRpb25bXSwgbmV3RGVjb3JhdGlvbnM6IElMaWdodFdlaWdodERlY29yYXRpb25bXSk6IHZvaWQge1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwodGV4dC5qb2luKCdcXG4nKSk7XG5cblx0XHQvLyBBZGQgaW5pdGlhbCBkZWNvcmF0aW9ucyAmIGFzc2VydCB0aGV5IGFyZSBhZGRlZFxuXHRcdGNvbnN0IGluaXRpYWxJZHMgPSBtb2RlbC5kZWx0YURlY29yYXRpb25zKFtdLCBkZWNvcmF0aW9ucy5tYXAodG9Nb2RlbERlbHRhRGVjb3JhdGlvbikpO1xuXHRcdGNvbnN0IGFjdHVhbERlY29yYXRpb25zID0gcmVhZE1vZGVsRGVjb3JhdGlvbnMobW9kZWwsIGluaXRpYWxJZHMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluaXRpYWxJZHMubGVuZ3RoLCBkZWNvcmF0aW9ucy5sZW5ndGgsICdyZXR1cm5zIGV4cGVjdGVkIGNudCBvZiBpZHMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5pdGlhbElkcy5sZW5ndGgsIG1vZGVsLmdldEFsbERlY29yYXRpb25zKCkubGVuZ3RoLCAnZG9lcyBub3QgbGVhayBkZWNvcmF0aW9ucycpO1xuXHRcdGFjdHVhbERlY29yYXRpb25zLnNvcnQoKGEsIGIpID0+IHN0cmNtcChhLmlkLCBiLmlkKSk7XG5cdFx0ZGVjb3JhdGlvbnMuc29ydCgoYSwgYikgPT4gc3RyY21wKGEuaWQsIGIuaWQpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbERlY29yYXRpb25zLCBkZWNvcmF0aW9ucyk7XG5cblx0XHRjb25zdCBuZXdJZHMgPSBtb2RlbC5kZWx0YURlY29yYXRpb25zKGluaXRpYWxJZHMsIG5ld0RlY29yYXRpb25zLm1hcCh0b01vZGVsRGVsdGFEZWNvcmF0aW9uKSk7XG5cdFx0Y29uc3QgYWN0dWFsTmV3RGVjb3JhdGlvbnMgPSByZWFkTW9kZWxEZWNvcmF0aW9ucyhtb2RlbCwgbmV3SWRzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdJZHMubGVuZ3RoLCBuZXdEZWNvcmF0aW9ucy5sZW5ndGgsICdyZXR1cm5zIGV4cGVjdGVkIGNudCBvZiBpZHMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3SWRzLmxlbmd0aCwgbW9kZWwuZ2V0QWxsRGVjb3JhdGlvbnMoKS5sZW5ndGgsICdkb2VzIG5vdCBsZWFrIGRlY29yYXRpb25zJyk7XG5cdFx0YWN0dWFsTmV3RGVjb3JhdGlvbnMuc29ydCgoYSwgYikgPT4gc3RyY21wKGEuaWQsIGIuaWQpKTtcblx0XHRuZXdEZWNvcmF0aW9ucy5zb3J0KChhLCBiKSA9PiBzdHJjbXAoYS5pZCwgYi5pZCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsRGVjb3JhdGlvbnMsIGRlY29yYXRpb25zKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHJhbmdlKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyKTogUmFuZ2Uge1xuXHRcdHJldHVybiBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgZW5kTGluZU51bWJlciwgZW5kQ29sdW1uKTtcblx0fVxuXG5cdHRlc3QoJ3Jlc3VsdCByZXNwZWN0cyBpbnB1dCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnSGVsbG8gd29ybGQsJyxcblx0XHRcdCdIb3cgYXJlIHlvdT8nXG5cdFx0XS5qb2luKCdcXG4nKSk7XG5cblx0XHRjb25zdCBpZHMgPSBtb2RlbC5kZWx0YURlY29yYXRpb25zKFtdLCBbXG5cdFx0XHR0b01vZGVsRGVsdGFEZWNvcmF0aW9uKGRlY29yYXRpb24oJ2EnLCAxLCAxLCAxLCAxMikpLFxuXHRcdFx0dG9Nb2RlbERlbHRhRGVjb3JhdGlvbihkZWNvcmF0aW9uKCdiJywgMiwgMSwgMiwgMTMpKVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXREZWNvcmF0aW9uUmFuZ2UoaWRzWzBdKSwgcmFuZ2UoMSwgMSwgMSwgMTIpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldERlY29yYXRpb25SYW5nZShpZHNbMV0pLCByYW5nZSgyLCAxLCAyLCAxMykpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWx0YURlY29yYXRpb25zIDEnLCAoKSA9PiB7XG5cdFx0dGVzdERlbHRhRGVjb3JhdGlvbnMoXG5cdFx0XHRbXG5cdFx0XHRcdCdUaGlzIGlzIGEgdGV4dCcsXG5cdFx0XHRcdCdUaGF0IGhhcyBtdWx0aXBsZSBsaW5lcycsXG5cdFx0XHRcdCdBbmQgaXMgdmVyeSBmcmllbmRseScsXG5cdFx0XHRcdCdUb3dhcmRzIHRlc3RpbmcnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRkZWNvcmF0aW9uKCdhJywgMSwgMSwgMSwgMiksXG5cdFx0XHRcdGRlY29yYXRpb24oJ2InLCAxLCAxLCAxLCAxNSksXG5cdFx0XHRcdGRlY29yYXRpb24oJ2MnLCAxLCAxLCAyLCAxKSxcblx0XHRcdFx0ZGVjb3JhdGlvbignZCcsIDEsIDEsIDIsIDI0KSxcblx0XHRcdFx0ZGVjb3JhdGlvbignZScsIDIsIDEsIDIsIDI0KSxcblx0XHRcdFx0ZGVjb3JhdGlvbignZicsIDIsIDEsIDQsIDE2KVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZGVjb3JhdGlvbigneCcsIDEsIDEsIDEsIDIpLFxuXHRcdFx0XHRkZWNvcmF0aW9uKCdiJywgMSwgMSwgMSwgMTUpLFxuXHRcdFx0XHRkZWNvcmF0aW9uKCdjJywgMSwgMSwgMiwgMSksXG5cdFx0XHRcdGRlY29yYXRpb24oJ2QnLCAxLCAxLCAyLCAyNCksXG5cdFx0XHRcdGRlY29yYXRpb24oJ2UnLCAyLCAxLCAyLCAyMSksXG5cdFx0XHRcdGRlY29yYXRpb24oJ2YnLCAyLCAxNywgNCwgMTYpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsdGFEZWNvcmF0aW9ucyAyJywgKCkgPT4ge1xuXHRcdHRlc3REZWx0YURlY29yYXRpb25zKFxuXHRcdFx0W1xuXHRcdFx0XHQnVGhpcyBpcyBhIHRleHQnLFxuXHRcdFx0XHQnVGhhdCBoYXMgbXVsdGlwbGUgbGluZXMnLFxuXHRcdFx0XHQnQW5kIGlzIHZlcnkgZnJpZW5kbHknLFxuXHRcdFx0XHQnVG93YXJkcyB0ZXN0aW5nJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZGVjb3JhdGlvbignYScsIDEsIDEsIDEsIDIpLFxuXHRcdFx0XHRkZWNvcmF0aW9uKCdiJywgMSwgMiwgMSwgMyksXG5cdFx0XHRcdGRlY29yYXRpb24oJ2MnLCAxLCAzLCAxLCA0KSxcblx0XHRcdFx0ZGVjb3JhdGlvbignZCcsIDEsIDQsIDEsIDUpLFxuXHRcdFx0XHRkZWNvcmF0aW9uKCdlJywgMSwgNSwgMSwgNilcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGRlY29yYXRpb24oJ2EnLCAxLCAyLCAxLCAzKSxcblx0XHRcdFx0ZGVjb3JhdGlvbignYicsIDEsIDMsIDEsIDQpLFxuXHRcdFx0XHRkZWNvcmF0aW9uKCdjJywgMSwgNCwgMSwgNSksXG5cdFx0XHRcdGRlY29yYXRpb24oJ2QnLCAxLCA1LCAxLCA2KVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbHRhRGVjb3JhdGlvbnMgMycsICgpID0+IHtcblx0XHR0ZXN0RGVsdGFEZWNvcmF0aW9ucyhcblx0XHRcdFtcblx0XHRcdFx0J1RoaXMgaXMgYSB0ZXh0Jyxcblx0XHRcdFx0J1RoYXQgaGFzIG11bHRpcGxlIGxpbmVzJyxcblx0XHRcdFx0J0FuZCBpcyB2ZXJ5IGZyaWVuZGx5Jyxcblx0XHRcdFx0J1Rvd2FyZHMgdGVzdGluZydcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGRlY29yYXRpb24oJ2EnLCAxLCAxLCAxLCAyKSxcblx0XHRcdFx0ZGVjb3JhdGlvbignYicsIDEsIDIsIDEsIDMpLFxuXHRcdFx0XHRkZWNvcmF0aW9uKCdjJywgMSwgMywgMSwgNCksXG5cdFx0XHRcdGRlY29yYXRpb24oJ2QnLCAxLCA0LCAxLCA1KSxcblx0XHRcdFx0ZGVjb3JhdGlvbignZScsIDEsIDUsIDEsIDYpXG5cdFx0XHRdLFxuXHRcdFx0W11cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDMxNzogZWRpdG9yLnNldERlY29yYXRpb25zIGRvZXNuXFwndCB1cGRhdGUgdGhlIGhvdmVyIG1lc3NhZ2UnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnSGVsbG8gd29ybGQhJyk7XG5cblx0XHRsZXQgaWRzID0gbW9kZWwuZGVsdGFEZWNvcmF0aW9ucyhbXSwgW3tcblx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMSxcblx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IDEwMCxcblx0XHRcdFx0ZW5kQ29sdW1uOiAxXG5cdFx0XHR9LFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0XHRob3Zlck1lc3NhZ2U6IHsgdmFsdWU6ICdoZWxsbzEnIH1cblx0XHRcdH1cblx0XHR9XSk7XG5cblx0XHRpZHMgPSBtb2RlbC5kZWx0YURlY29yYXRpb25zKGlkcywgW3tcblx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMSxcblx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IDEwMCxcblx0XHRcdFx0ZW5kQ29sdW1uOiAxXG5cdFx0XHR9LFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0XHRob3Zlck1lc3NhZ2U6IHsgdmFsdWU6ICdoZWxsbzInIH1cblx0XHRcdH1cblx0XHR9XSk7XG5cblx0XHRjb25zdCBhY3R1YWxEZWNvcmF0aW9uID0gbW9kZWwuZ2V0RGVjb3JhdGlvbk9wdGlvbnMoaWRzWzBdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsRGVjb3JhdGlvbiEuaG92ZXJNZXNzYWdlLCB7IHZhbHVlOiAnaGVsbG8yJyB9KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgZG9lc25cXCd0IGdldCBjb25mdXNlZCB3aXRoIGluZGl2aWR1YWwgdHJhY2tlZCByYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J0hlbGxvIHdvcmxkLCcsXG5cdFx0XHQnSG93IGFyZSB5b3U/J1xuXHRcdF0uam9pbignXFxuJykpO1xuXG5cdFx0Y29uc3QgdHJhY2tlZFJhbmdlSWQgPSBtb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucygoY2hhbmdlQWNlc3NvcikgPT4ge1xuXHRcdFx0cmV0dXJuIGNoYW5nZUFjZXNzb3IuYWRkRGVjb3JhdGlvbihcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMSxcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0Jyxcblx0XHRcdFx0XHRzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXNcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblx0XHRtb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucygoY2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdGNoYW5nZUFjY2Vzc29yLnJlbW92ZURlY29yYXRpb24odHJhY2tlZFJhbmdlSWQhKTtcblx0XHR9KTtcblxuXHRcdGxldCBpZHMgPSBtb2RlbC5kZWx0YURlY29yYXRpb25zKFtdLCBbXG5cdFx0XHR0b01vZGVsRGVsdGFEZWNvcmF0aW9uKGRlY29yYXRpb24oJ2EnLCAxLCAxLCAxLCAxMikpLFxuXHRcdFx0dG9Nb2RlbERlbHRhRGVjb3JhdGlvbihkZWNvcmF0aW9uKCdiJywgMiwgMSwgMiwgMTMpKVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXREZWNvcmF0aW9uUmFuZ2UoaWRzWzBdKSwgcmFuZ2UoMSwgMSwgMSwgMTIpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldERlY29yYXRpb25SYW5nZShpZHNbMV0pLCByYW5nZSgyLCAxLCAyLCAxMykpO1xuXG5cdFx0aWRzID0gbW9kZWwuZGVsdGFEZWNvcmF0aW9ucyhpZHMsIFtcblx0XHRcdHRvTW9kZWxEZWx0YURlY29yYXRpb24oZGVjb3JhdGlvbignYScsIDEsIDEsIDEsIDEyKSksXG5cdFx0XHR0b01vZGVsRGVsdGFEZWNvcmF0aW9uKGRlY29yYXRpb24oJ2InLCAyLCAxLCAyLCAxMykpXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldERlY29yYXRpb25SYW5nZShpZHNbMF0pLCByYW5nZSgxLCAxLCAxLCAxMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0RGVjb3JhdGlvblJhbmdlKGlkc1sxXSksIHJhbmdlKDIsIDEsIDIsIDEzKSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNjkyMjogQ2xpY2tpbmcgb24gbGluayBkb2VzblxcJ3Qgc2VlbSB0byBkbyBhbnl0aGluZycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnSGVsbG8gd29ybGQsJyxcblx0XHRcdCdIb3cgYXJlIHlvdT8nLFxuXHRcdFx0J0ZpbmUuJyxcblx0XHRcdCdHb29kLicsXG5cdFx0XS5qb2luKCdcXG4nKSk7XG5cblx0XHRtb2RlbC5kZWx0YURlY29yYXRpb25zKFtdLCBbXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICd0ZXN0JywgY2xhc3NOYW1lOiAnMScgfSB9LFxuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDEsIDEzLCAxLCAxMyksIG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICd0ZXN0JywgY2xhc3NOYW1lOiAnMicgfSB9LFxuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDIsIDEsIDIsIDEpLCBvcHRpb25zOiB7IGRlc2NyaXB0aW9uOiAndGVzdCcsIGNsYXNzTmFtZTogJzMnIH0gfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAyLCA0KSwgb3B0aW9uczogeyBkZXNjcmlwdGlvbjogJ3Rlc3QnLCBjbGFzc05hbWU6ICc0JyB9IH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMiwgOCwgMiwgMTMpLCBvcHRpb25zOiB7IGRlc2NyaXB0aW9uOiAndGVzdCcsIGNsYXNzTmFtZTogJzUnIH0gfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgzLCAxLCA0LCA2KSwgb3B0aW9uczogeyBkZXNjcmlwdGlvbjogJ3Rlc3QnLCBjbGFzc05hbWU6ICc2JyB9IH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMywgNiksIG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICd0ZXN0JywgY2xhc3NOYW1lOiAneDEnIH0gfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgyLCA1LCAyLCA4KSwgb3B0aW9uczogeyBkZXNjcmlwdGlvbjogJ3Rlc3QnLCBjbGFzc05hbWU6ICd4MicgfSB9LFxuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDIsIDgpLCBvcHRpb25zOiB7IGRlc2NyaXB0aW9uOiAndGVzdCcsIGNsYXNzTmFtZTogJ3gzJyB9IH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMiwgNSwgMywgMSksIG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICd0ZXN0JywgY2xhc3NOYW1lOiAneDQnIH0gfSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGluUmFuZ2UgPSBtb2RlbC5nZXREZWNvcmF0aW9uc0luUmFuZ2UobmV3IFJhbmdlKDIsIDYsIDIsIDYpKTtcblxuXHRcdGNvbnN0IGluUmFuZ2VDbGFzc05hbWVzID0gaW5SYW5nZS5tYXAoZCA9PiBkLm9wdGlvbnMuY2xhc3NOYW1lKTtcblx0XHRpblJhbmdlQ2xhc3NOYW1lcy5zb3J0KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpblJhbmdlQ2xhc3NOYW1lcywgWyd4MScsICd4MicsICd4MycsICd4NCddKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQxNDkyOiBVUkwgaGlnaGxpZ2h0aW5nIHBlcnNpc3RzIGFmdGVyIHBhc3Rpbmcgb3ZlciB1cmwnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnTXkgRmlyc3QgTGluZSdcblx0XHRdLmpvaW4oJ1xcbicpKTtcblxuXHRcdGNvbnN0IGlkID0gbW9kZWwuZGVsdGFEZWNvcmF0aW9ucyhbXSwgW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAyLCAxLCAxNCksIG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICd0ZXN0Jywgc3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIGNvbGxhcHNlT25SZXBsYWNlRWRpdDogdHJ1ZSB9IH1dKVswXTtcblx0XHRtb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDE0KSxcblx0XHRcdHRleHQ6ICdTb21lIG5ldyB0ZXh0IHRoYXQgaXMgbG9uZ2VyIHRoYW4gdGhlIHByZXZpb3VzIG9uZScsXG5cdFx0XHRmb3JjZU1vdmVNYXJrZXJzOiBmYWxzZVxuXHRcdH1dKTtcblx0XHRjb25zdCBhY3R1YWwgPSBtb2RlbC5nZXREZWNvcmF0aW9uUmFuZ2UoaWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMSkpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLG1CQUEwQyw4QkFBOEI7QUFFakYsU0FBUyx1QkFBdUI7QUFTaEMsU0FBUyxvQkFBb0IsT0FBa0IsYUFBd0M7QUFDdEYsUUFBTSxtQkFBOEMsQ0FBQztBQUNyRCxRQUFNLG9CQUFv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QUcsQ0FBQztBQUFBLFVBQ3BCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFBRztBQUFBLFVBQ3ZCO0FBQUEsWUFDQyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxZQUMzRixDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLFNBQVMsTUFBTTtBQUNuQjtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxTQUFTLE1BQU07QUFDbkI7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQzNGLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQzVGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUNELFVBQU0scUJBQXFCLE1BQU07QUFDaEMsV0FBSyxVQUFVLE1BQU07QUFDcEI7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUFBLFlBQy9GLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxF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QUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxVQUM1RjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLFVBQVUsTUFBTTtBQUNyQixVQUFNLGlCQUFpQixNQUFNO0FBQzVCLFdBQUssMEJBQTBCLE1BQU07QUFDcEM7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQzNGLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQzVGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssMkJBQTJCLE1BQU07QUFDckM7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQzNGLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQzVGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssb0RBQW9ELE1BQU07QUFDOUQ7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQzNGLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQzVGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssMkJBQTJCLE1BQU07QUFDckM7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQzNGLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQzVGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssMEJBQTBCLE1BQU07QUFDcEM7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQzNGLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQzVGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUNELFVBQU0scUJBQXFCLE1BQU07QUFDaEMsV0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywyQkFBMkIsTUFBTTtBQUNyQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxvREFBb0QsTUFBTTtBQUM5RDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSyxxREFBcUQsTUFBTTtBQUMvRDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSyxvREFBb0QsTUFBTTtBQUM5RDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFVBQUc7QUFBQSxVQUN4QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSyxxREFBcUQsTUFBTTtBQUMvRDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSyxzREFBc0QsTUFBTTtBQUNoRTtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSyxxREFBcUQsTUFBTTtBQUMvRDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFVBQUc7QUFBQSxVQUN4QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSyw4RUFBOEUsTUFBTTtBQUN4RjtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSywrRUFBK0UsTUFBTTtBQUN6RjtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSyw4RUFBOEUsTUFBTTtBQUN4RjtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFVBQUc7QUFBQSxVQUN4QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSywyQkFBMkIsTUFBTTtBQUNyQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFVBQUc7QUFBQSxVQUN4QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFVBQUc7QUFBQSxVQUN6QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxpQkFBaUIsTUFBTTtBQUM1QixVQUFNLGlCQUFpQixNQUFNO0FBQzVCLFdBQUssMEJBQTBCLE1BQU07QUFDcEM7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQzNGLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQzVGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssMkJBQTJCLE1BQU07QUFDckM7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQzNGLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQzVGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssb0RBQW9ELE1BQU07QUFDOUQ7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQzNGLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQzVGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssMkJBQTJCLE1BQU07QUFDckM7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQzNGLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQzVGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssMEJBQTBCLE1BQU07QUFDcEM7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQzNGLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQzVGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUNELFVBQU0scUJBQXFCLE1BQU07QUFDaEMsV0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywyQkFBMkIsTUFBTTtBQUNyQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxvREFBb0QsTUFBTTtBQUM5RDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxxREFBcUQsTUFBTTtBQUMvRDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxvREFBb0QsTUFBTTtBQUM5RDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFVBQUc7QUFBQSxVQUN4QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxxREFBcUQsTUFBTTtBQUMvRDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxzREFBc0QsTUFBTTtBQUNoRTtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxxREFBcUQsTUFBTTtBQUMvRDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFVBQUc7QUFBQSxVQUN4QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyw4RUFBOEUsTUFBTTtBQUN4RjtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywrRUFBK0UsTUFBTTtBQUN6RjtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyw4RUFBOEUsTUFBTTtBQUN4RjtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFVBQUc7QUFBQSxVQUN4QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywyQkFBMkIsTUFBTTtBQUNyQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFVBQUc7QUFBQSxVQUN4QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsVUFDaEc7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFVBQUc7QUFBQSxVQUN6QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxnQkFBZ0IsTUFBTTtBQUMzQixVQUFNLGlCQUFpQixNQUFNO0FBQzVCLFdBQUssMEJBQTBCLE1BQU07QUFDcEM7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQzNGLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQzVGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssMkJBQTJCLE1BQU07QUFDckM7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQzNGLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQzVGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssb0RBQW9ELE1BQU07QUFDOUQ7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQzNGLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQzVGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssMkJBQTJCLE1BQU07QUFDckM7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQzNGLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQzVGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUssMEJBQTBCLE1BQU07QUFDcEM7QUFBQSxVQUNDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsVUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUFHO0FBQUEsVUFDdkI7QUFBQSxZQUNDLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFlBQzNGLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLFVBQzVGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUNELFVBQU0scUJBQXFCLE1BQU07QUFDaEMsV0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsWUFDL0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsVUFDaEc7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywyQkFBMkIsTUFBTTtBQUNyQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsWUFDL0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsVUFDaEc7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxvREFBb0QsTUFBTTtBQUM5RDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsWUFDL0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsVUFDaEc7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxxREFBcUQsTUFBTTtBQUMvRDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxvREFBb0QsTUFBTTtBQUM5RDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFVBQUc7QUFBQSxVQUN4QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxxREFBcUQsTUFBTTtBQUMvRDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsWUFDL0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsVUFDaEc7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxzREFBc0QsTUFBTTtBQUNoRTtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxxREFBcUQsTUFBTTtBQUMvRDtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFVBQUc7QUFBQSxVQUN4QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyw4RUFBOEUsTUFBTTtBQUN4RjtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsWUFDL0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsVUFDaEc7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywrRUFBK0UsTUFBTTtBQUN6RjtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUN2QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyw4RUFBOEUsTUFBTTtBQUN4RjtBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFVBQUc7QUFBQSxVQUN4QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywyQkFBMkIsTUFBTTtBQUNyQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFVBQUc7QUFBQSxVQUN4QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsVUFDaEc7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSywwQkFBMEIsTUFBTTtBQUNwQztBQUFBLFVBQ0MsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNwQixJQUFJLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFVBQUc7QUFBQSxVQUN6QjtBQUFBLFlBQ0MsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsWUFDM0YsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDNUY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQztBQU9ELE1BQU0sb0JBQW9CLE1BQU07QUFFL0IsMENBQXdDO0FBRXhDLFdBQVMsV0FBVyxJQUFZLGlCQUF5QixhQUFxQixlQUF1QixVQUEwQztBQUM5SSxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0EsT0FBTyxJQUFJLE1BQU0saUJBQWlCLGFBQWEsZUFBZSxRQUFRO0FBQUEsSUFDdkU7QUFBQSxFQUNEO0FBRUEsV0FBUyx1QkFBdUIsS0FBb0Q7QUFDbkYsV0FBTztBQUFBLE1BQ04sT0FBTyxJQUFJO0FBQUEsTUFDWCxTQUFTO0FBQUEsUUFDUixhQUFhO0FBQUEsUUFDYixXQUFXLElBQUk7QUFBQSxNQUNoQjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsV0FBUyxPQUFPLEdBQVcsR0FBbUI7QUFDN0MsUUFBSSxNQUFNLEdBQUc7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksSUFBSSxHQUFHO0FBQ1YsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUVBLFdBQVMscUJBQXFCLE9BQWtCLEtBQXlDO0FBQ3hGLFdBQU8sSUFBSSxJQUFJLENBQUMsT0FBTztBQUN0QixhQUFPO0FBQUEsUUFDTixPQUFPLE1BQU0sbUJBQW1CLEVBQUU7QUFBQSxRQUNsQyxJQUFJLE1BQU0scUJBQXFCLEVBQUUsRUFBRztBQUFBLE1BQ3JDO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUVBLFdBQVMscUJBQXFCLE1BQWdCLGFBQXVDLGdCQUFnRDtBQUVwSSxVQUFNLFFBQVEsZ0JBQWdCLEtBQUssS0FBSyxJQUFJLENBQUM7QUFHN0MsVUFBTSxhQUFhLE1BQU0saUJBQWlCLENBQUMsR0FBRyxZQUFZLElBQUksc0JBQXNCLENBQUM7QUFDckYsVUFBTSxvQkFBb0IscUJBQXFCLE9BQU8sVUFBVTtBQUVoRSxXQUFPLFlBQVksV0FBVyxRQUFRLFlBQVksUUFBUSw2QkFBNkI7QUFDdkYsV0FBTyxZQUFZLFdBQVcsUUFBUSxNQUFNLGtCQUFrQixFQUFFLFFBQVEsMkJBQTJCO0FBQ25HLHNCQUFrQixLQUFLLENBQUMsR0FBRyxNQUFNLE9BQU8sRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDO0FBQ25ELGdCQUFZLEtBQUssQ0FBQyxHQUFHLE1BQU0sT0FBTyxFQUFFLElBQUksRUFBRSxFQUFFLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsbUJBQW1CLFdBQVc7QUFFckQsVUFBTSxTQUFTLE1BQU0saUJBQWlCLFlBQVksZUFBZSxJQUFJLHNCQUFzQixDQUFDO0FBQzVGLFVBQU0sdUJBQXVCLHFCQUFxQixPQUFPLE1BQU07QUFFL0QsV0FBTyxZQUFZLE9BQU8sUUFBUSxlQUFlLFFBQVEsNkJBQTZCO0FBQ3RGLFdBQU8sWUFBWSxPQUFPLFFBQVEsTUFBTSxrQkFBa0IsRUFBRSxRQUFRLDJCQUEyQjtBQUMvRix5QkFBcUIsS0FBSyxDQUFDLEdBQUcsTUFBTSxPQUFPLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQztBQUN0RCxtQkFBZSxLQUFLLENBQUMsR0FBRyxNQUFNLE9BQU8sRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDO0FBQ2hELFdBQU8sZ0JBQWdCLG1CQUFtQixXQUFXO0FBRXJELFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFFQSxXQUFTLE1BQU0saUJBQXlCLGFBQXFCLGVBQXVCLFdBQTBCO0FBQzdHLFdBQU8sSUFBSSxNQUFNLGlCQUFpQixhQUFhLGVBQWUsU0FBUztBQUFBLEVBQ3hFO0FBRUEsT0FBSyx5QkFBeUIsTUFBTTtBQUNuQyxVQUFNLFFBQVEsZ0JBQWdCO0FBQUEsTUFDN0I7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtBQUssSUFBSSxDQUFDO0FBRVosVUFBTSxNQUFNLE1BQU0saUJBQWlCLENBQUMsR0FBRztBQUFBLE1BQ3RDLHVCQUF1QixXQUFXLEtBQUssR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBQUEsTUFDbkQsdUJBQXVCLFdBQVcsS0FBSyxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxJQUNwRCxDQUFDO0FBRUQsV0FBTyxnQkFBZ0IsTUFBTSxtQkFBbUIsSUFBSSxDQUFDLENBQUMsR0FBRyxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUMzRSxXQUFPLGdCQUFnQixNQUFNLG1CQUFtQixJQUFJLENBQUMsQ0FBQyxHQUFHLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBRTNFLFVBQU0sUUFBUTtBQUFBLEVBQ2YsQ0FBQztBQUVELE9BQUssc0JBQXNCLE1BQU07QUFDaEM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxXQUFXLEtBQUssR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQzFCLFdBQVcsS0FBSyxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDM0IsV0FBVyxLQUFLLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUMxQixXQUFXLEtBQUssR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQzNCLFdBQVcsS0FBSyxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDM0IsV0FBVyxLQUFLLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxNQUM1QjtBQUFBLE1BQ0E7QUFBQSxRQUNDLFdBQVcsS0FBSyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDMUIsV0FBVyxLQUFLLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUMzQixXQUFXLEtBQUssR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQzFCLFdBQVcsS0FBSyxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDM0IsV0FBVyxLQUFLLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUMzQixXQUFXLEtBQUssR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQzdCO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssc0JBQXNCLE1BQU07QUFDaEM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxXQUFXLEtBQUssR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQzFCLFdBQVcsS0FBSyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDMUIsV0FBVyxLQUFLLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUMxQixXQUFXLEtBQUssR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQzFCLFdBQVcsS0FBSyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDM0I7QUFBQSxNQUNBO0FBQUEsUUFDQyxXQUFXLEtBQUssR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQzFCLFdBQVcsS0FBSyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDMUIsV0FBVyxLQUFLLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUMxQixXQUFXLEtBQUssR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQzNCO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssc0JBQXNCLE1BQU07QUFDaEM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxXQUFXLEtBQUssR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQzFCLFdBQVcsS0FBSyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDMUIsV0FBVyxLQUFLLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUMxQixXQUFXLEtBQUssR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQzFC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
