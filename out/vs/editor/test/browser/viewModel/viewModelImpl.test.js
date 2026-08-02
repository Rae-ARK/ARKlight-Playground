import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { EndOfLineSequence, PositionAffinity } from "../../../common/model.js";
import { ViewEventHandler } from "../../../common/viewEventHandler.js";
import { testViewModel } from "./testViewModel.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { createTextModel } from "../../common/testTextModel.js";
import { createCodeEditorServices, instantiateTestCodeEditor } from "../testCodeEditor.js";
suite("ViewModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("issue #21073: SplitLinesCollection: attempt to access a 'newer' model", () => {
    const text = [""];
    const opts = {
      lineNumbersMinChars: 1
    };
    testViewModel(text, opts, (viewModel, model) => {
      assert.strictEqual(viewModel.getLineCount(), 1);
      viewModel.setViewport(1, 1, 1);
      model.applyEdits([{
        range: new Range(1, 1, 1, 1),
        text: [
          "line01",
          "line02",
          "line03",
          "line04",
          "line05",
          "line06",
          "line07",
          "line08",
          "line09",
          "line10"
        ].join("\n")
      }]);
      assert.strictEqual(viewModel.getLineCount(), 10);
    });
  });
  test("issue #44805: SplitLinesCollection: attempt to access a 'newer' model", () => {
    const text = [""];
    testViewModel(text, {}, (viewModel, model) => {
      assert.strictEqual(viewModel.getLineCount(), 1);
      model.pushEditOperations([], [{
        range: new Range(1, 1, 1, 1),
        text: "\ninsert1"
      }], () => []);
      model.pushEditOperations([], [{
        range: new Range(1, 1, 1, 1),
        text: "\ninsert2"
      }], () => []);
      model.pushEditOperations([], [{
        range: new Range(1, 1, 1, 1),
        text: "\ninsert3"
      }], () => []);
      const viewLineCount = [];
      viewLineCount.push(viewModel.getLineCount());
      const eventHandler = new class extends ViewEventHandler {
        handleEvents(events) {
          viewLineCount.push(viewModel.getLineCount());
        }
      }();
      viewModel.addViewEventHandler(eventHandler);
      model.undo();
      viewLineCount.push(viewModel.getLineCount());
      assert.deepStrictEqual(viewLineCount, [4, 1, 1, 1, 1]);
      viewModel.removeViewEventHandler(eventHandler);
      eventHandler.dispose();
    });
  });
  test("view models react first to model changes", () => {
    const initialText = [
      "Hello",
      "world"
    ];
    const disposables = new DisposableStore();
    const model = disposables.add(createTextModel(initialText.join("\n")));
    const instantiationService = createCodeEditorServices(disposables);
    const ed1 = disposables.add(instantiateTestCodeEditor(instantiationService, model));
    disposables.add(instantiateTestCodeEditor(instantiationService, model));
    let isFirst = true;
    disposables.add(ed1.onDidChangeModelContent((e) => {
      if (isFirst) {
        isFirst = false;
        model.applyEdits([{ range: new Range(1, 6, 2, 1), text: "" }]);
      }
    }));
    model.applyEdits([{ range: new Range(2, 6, 2, 6), text: "!" }]);
    disposables.dispose();
  });
  test("issue #44805: No visible lines via API call", () => {
    const text = [
      "line1",
      "line2",
      "line3"
    ];
    testViewModel(text, {}, (viewModel, model) => {
      assert.strictEqual(viewModel.getLineCount(), 3);
      viewModel.setHiddenAreas([new Range(1, 1, 3, 1)]);
      assert.ok(viewModel.getVisibleRanges() !== null);
    });
  });
  test("issue #44805: No visible lines via undoing", () => {
    const text = [
      ""
    ];
    testViewModel(text, {}, (viewModel, model) => {
      assert.strictEqual(viewModel.getLineCount(), 1);
      model.pushEditOperations([], [{
        range: new Range(1, 1, 1, 1),
        text: "line1\nline2\nline3"
      }], () => []);
      viewModel.setHiddenAreas([new Range(1, 1, 1, 1)]);
      assert.strictEqual(viewModel.getLineCount(), 2);
      model.undo();
      assert.ok(viewModel.getVisibleRanges() !== null);
    });
  });
  function assertGetPlainTextToCopy(text, ranges, emptySelectionClipboard, expected) {
    testViewModel(text, {}, (viewModel, model) => {
      const actual = viewModel.getPlainTextToCopy(ranges, emptySelectionClipboard, false);
      assert.deepStrictEqual(actual.sourceText, expected);
    });
  }
  const USUAL_TEXT = [
    "",
    "line2",
    "line3",
    "line4",
    ""
  ];
  test("getPlainTextToCopy 0/1", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 2)
      ],
      false,
      ""
    );
  });
  test("getPlainTextToCopy 0/1 - emptySelectionClipboard", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 2)
      ],
      true,
      "line2\n"
    );
  });
  test("getPlainTextToCopy 1/1", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 6)
      ],
      false,
      "ine2"
    );
  });
  test("getPlainTextToCopy 1/1 - emptySelectionClipboard", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 6)
      ],
      true,
      "ine2"
    );
  });
  test("getPlainTextToCopy 0/2", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 2),
        new Range(3, 2, 3, 2)
      ],
      false,
      ""
    );
  });
  test("getPlainTextToCopy 0/2 - emptySelectionClipboard", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 2),
        new Range(3, 2, 3, 2)
      ],
      true,
      [
        "line2\n",
        "line3\n"
      ]
    );
  });
  test("issue #256039: getPlainTextToCopy with multiple cursors and empty selections should return array", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 1, 2, 1),
        new Range(3, 1, 3, 1)
      ],
      true,
      ["line2\n", "line3\n"]
    );
  });
  test("getPlainTextToCopy 1/2", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 6),
        new Range(3, 2, 3, 2)
      ],
      false,
      "ine2"
    );
  });
  test("getPlainTextToCopy 1/2 - emptySelectionClipboard", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 6),
        new Range(3, 2, 3, 2)
      ],
      true,
      ["ine2", "line3\n"]
    );
  });
  test("getPlainTextToCopy 2/2", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 6),
        new Range(3, 2, 3, 6)
      ],
      false,
      ["ine2", "ine3"]
    );
  });
  test("getPlainTextToCopy 2/2 reversed", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(3, 2, 3, 6),
        new Range(2, 2, 2, 6)
      ],
      false,
      ["ine2", "ine3"]
    );
  });
  test("getPlainTextToCopy 0/3 - emptySelectionClipboard", () => {
    assertGetPlainTextToCopy(
      USUAL_TEXT,
      [
        new Range(2, 2, 2, 2),
        new Range(2, 3, 2, 3),
        new Range(3, 2, 3, 2)
      ],
      true,
      [
        "line2\n",
        "line3\n"
      ]
    );
  });
  test("issue #22688 - always use CRLF for clipboard on Windows", () => {
    testViewModel(USUAL_TEXT, {}, (viewModel, model) => {
      model.setEOL(EndOfLineSequence.LF);
      const actual = viewModel.getPlainTextToCopy([new Range(2, 1, 5, 1)], true, true);
      assert.deepStrictEqual(actual.sourceText, "line2\r\nline3\r\nline4\r\n");
    });
  });
  test("issue #40926: Incorrect spacing when inserting new line after multiple folded blocks of code", () => {
    testViewModel(
      [
        "foo = {",
        "    foobar: function() {",
        "        this.foobar();",
        "    },",
        "    foobar: function() {",
        "        this.foobar();",
        "    },",
        "    foobar: function() {",
        "        this.foobar();",
        "    },",
        "}"
      ],
      {},
      (viewModel, model) => {
        viewModel.setHiddenAreas([
          new Range(3, 1, 3, 1),
          new Range(6, 1, 6, 1),
          new Range(9, 1, 9, 1)
        ]);
        model.applyEdits([
          { range: new Range(4, 7, 4, 7), text: "\n    " },
          { range: new Range(7, 7, 7, 7), text: "\n    " },
          { range: new Range(10, 7, 10, 7), text: "\n    " }
        ]);
        assert.strictEqual(viewModel.getLineCount(), 11);
      }
    );
  });
  test("normalizePosition with multiple touching injected text", () => {
    testViewModel(
      [
        "just some text"
      ],
      {},
      (viewModel, model) => {
        model.deltaDecorations([], [
          {
            range: new Range(1, 8, 1, 8),
            options: {
              description: "test",
              before: {
                content: "bar"
              },
              showIfCollapsed: true
            }
          },
          {
            range: new Range(1, 8, 1, 8),
            options: {
              description: "test",
              before: {
                content: "bz"
              },
              showIfCollapsed: true
            }
          }
        ]);
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 8), PositionAffinity.None), new Position(1, 8));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 9), PositionAffinity.None), new Position(1, 8));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 11), PositionAffinity.None), new Position(1, 11));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 12), PositionAffinity.None), new Position(1, 11));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 13), PositionAffinity.None), new Position(1, 13));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 8), PositionAffinity.Left), new Position(1, 8));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 9), PositionAffinity.Left), new Position(1, 8));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 11), PositionAffinity.Left), new Position(1, 8));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 12), PositionAffinity.Left), new Position(1, 8));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 13), PositionAffinity.Left), new Position(1, 8));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 8), PositionAffinity.Right), new Position(1, 13));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 9), PositionAffinity.Right), new Position(1, 13));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 11), PositionAffinity.Right), new Position(1, 13));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 12), PositionAffinity.Right), new Position(1, 13));
        assert.deepStrictEqual(viewModel.normalizePosition(new Position(1, 13), PositionAffinity.Right), new Position(1, 13));
      }
    );
  });
  test("issue #193262: Incorrect implementation of modifyPosition", () => {
    testViewModel(
      [
        "just some text"
      ],
      {
        wordWrap: "wordWrapColumn",
        wordWrapColumn: 5
      },
      (viewModel, model) => {
        assert.deepStrictEqual(
          new Position(3, 1),
          viewModel.modifyPosition(new Position(3, 2), -1)
        );
      }
    );
  });
  suite("hidden areas must always leave at least one visible line", () => {
    test("replacing the only visible line content does not make it hidden", () => {
      const text = [
        "line1",
        "line2",
        "line3"
      ];
      testViewModel(text, {}, (viewModel, model) => {
        viewModel.setHiddenAreas([
          new Range(1, 1, 1, 1),
          new Range(3, 1, 3, 1)
        ]);
        assert.strictEqual(viewModel.getLineCount(), 1);
        model.applyEdits([{
          range: new Range(2, 1, 2, 6),
          text: "new content"
        }]);
        assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
      });
    });
    test("deleting the only visible line when it is the last line", () => {
      const text = [
        "line1",
        "line2",
        "line3"
      ];
      testViewModel(text, {}, (viewModel, model) => {
        viewModel.setHiddenAreas([new Range(1, 1, 2, 1)]);
        assert.strictEqual(viewModel.getLineCount(), 1);
        model.applyEdits([{
          range: new Range(2, 6, 3, 6),
          text: null
        }]);
        assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
      });
    });
    test("deleting the only visible line when it is in the middle", () => {
      const text = [
        "line1",
        "line2",
        "line3",
        "line4",
        "line5"
      ];
      testViewModel(text, {}, (viewModel, model) => {
        viewModel.setHiddenAreas([
          new Range(1, 1, 2, 1),
          new Range(4, 1, 5, 1)
        ]);
        assert.strictEqual(viewModel.getLineCount(), 1);
        model.applyEdits([{
          range: new Range(2, 6, 4, 1),
          text: null
        }]);
        assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
      });
    });
    test("undo that removes the only visible line", () => {
      const text = [
        "line1"
      ];
      testViewModel(text, {}, (viewModel, model) => {
        assert.strictEqual(viewModel.getLineCount(), 1);
        model.pushEditOperations([], [{
          range: new Range(1, 6, 1, 6),
          text: "\nline2\nline3\nline4\nline5"
        }], () => []);
        assert.strictEqual(viewModel.getLineCount(), 5);
        viewModel.setHiddenAreas([
          new Range(1, 1, 2, 1),
          new Range(4, 1, 5, 1)
        ]);
        assert.strictEqual(viewModel.getLineCount(), 1);
        model.undo();
        assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
      });
    });
    test("deleting the only visible line between two hidden areas leaves all lines hidden", () => {
      const text = [
        "line1",
        "line2",
        "line3",
        "line4",
        "line5",
        "line6",
        "line7",
        "line8"
      ];
      testViewModel(text, {}, (viewModel, model) => {
        assert.strictEqual(viewModel.getLineCount(), 8);
        viewModel.setHiddenAreas([
          new Range(1, 1, 5, 1),
          new Range(7, 1, 8, 1)
        ]);
        assert.strictEqual(viewModel.getLineCount(), 1);
        model.applyEdits([{
          range: new Range(6, 1, 8, 5),
          text: null
        }]);
        assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
      });
    });
    test("multiple visible lines deleted leaving only hidden lines", () => {
      const text = [
        "hidden1",
        "hidden2",
        "visible1",
        "visible2",
        "hidden3",
        "hidden4"
      ];
      testViewModel(text, {}, (viewModel, model) => {
        viewModel.setHiddenAreas([
          new Range(1, 1, 2, 1),
          new Range(5, 1, 6, 1)
        ]);
        assert.strictEqual(viewModel.getLineCount(), 2);
        model.applyEdits([{
          range: new Range(2, 8, 5, 1),
          text: null
        }]);
        assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
      });
    });
    test("hidden areas from multiple sources that overlap produce valid merged result", () => {
      const text = [];
      for (let i = 1; i <= 10; i++) {
        text.push(`line${i}`);
      }
      testViewModel(text, {}, (viewModel, model) => {
        viewModel.setHiddenAreas([new Range(1, 1, 8, 1)], "sourceA");
        viewModel.setHiddenAreas([new Range(2, 1, 3, 1), new Range(5, 1, 6, 1), new Range(8, 1, 9, 1)], "sourceB");
        assert.strictEqual(viewModel.getLineCount(), 1, "only line 10 should be visible");
        const hiddenAreas = viewModel.getHiddenAreas();
        for (let i = 1; i < hiddenAreas.length; i++) {
          assert.ok(
            hiddenAreas[i].startLineNumber > hiddenAreas[i - 1].endLineNumber,
            `hidden areas should not overlap: [${hiddenAreas[i - 1].startLineNumber}-${hiddenAreas[i - 1].endLineNumber}] and [${hiddenAreas[i].startLineNumber}-${hiddenAreas[i].endLineNumber}]`
          );
        }
      });
    });
    test("tab size change with drifted hidden area decorations must not leave 0 visible lines", () => {
      const text = [
        "line1",
        "line2",
        "line3"
      ];
      testViewModel(text, {}, (viewModel, model) => {
        viewModel.setHiddenAreas([new Range(1, 1, 2, 1)]);
        assert.strictEqual(viewModel.getLineCount(), 1);
        model.applyEdits([{ range: new Range(2, 1, 2, 1), text: "x\n" }]);
        model.applyEdits([{ range: new Range(3, 1, 3, 1), text: "y\n" }]);
        model.applyEdits([{ range: new Range(4, 1, 5, 6), text: "" }]);
        model.updateOptions({ tabSize: 8 });
        assert.ok(viewModel.getLineCount() >= 1, `expected at least 1 view line but got ${viewModel.getLineCount()}`);
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvdmlld01vZGVsL3ZpZXdNb2RlbEltcGwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVNlcXVlbmNlLCBQb3NpdGlvbkFmZmluaXR5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFZpZXdFdmVudEhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld0V2ZW50SGFuZGxlci5qcyc7XG5pbXBvcnQgeyBWaWV3RXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld0V2ZW50cy5qcyc7XG5pbXBvcnQgeyB0ZXN0Vmlld01vZGVsIH0gZnJvbSAnLi90ZXN0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDb2RlRWRpdG9yU2VydmljZXMsIGluc3RhbnRpYXRlVGVzdENvZGVFZGl0b3IgfSBmcm9tICcuLi90ZXN0Q29kZUVkaXRvci5qcyc7XG5cbnN1aXRlKCdWaWV3TW9kZWwnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaXNzdWUgIzIxMDczOiBTcGxpdExpbmVzQ29sbGVjdGlvbjogYXR0ZW1wdCB0byBhY2Nlc3MgYSBcXCduZXdlclxcJyBtb2RlbCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gWycnXTtcblx0XHRjb25zdCBvcHRzID0ge1xuXHRcdFx0bGluZU51bWJlcnNNaW5DaGFyczogMVxuXHRcdH07XG5cdFx0dGVzdFZpZXdNb2RlbCh0ZXh0LCBvcHRzLCAodmlld01vZGVsLCBtb2RlbCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSwgMSk7XG5cblx0XHRcdHZpZXdNb2RlbC5zZXRWaWV3cG9ydCgxLCAxLCAxKTtcblxuXHRcdFx0bW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLFxuXHRcdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdFx0J2xpbmUwMScsXG5cdFx0XHRcdFx0J2xpbmUwMicsXG5cdFx0XHRcdFx0J2xpbmUwMycsXG5cdFx0XHRcdFx0J2xpbmUwNCcsXG5cdFx0XHRcdFx0J2xpbmUwNScsXG5cdFx0XHRcdFx0J2xpbmUwNicsXG5cdFx0XHRcdFx0J2xpbmUwNycsXG5cdFx0XHRcdFx0J2xpbmUwOCcsXG5cdFx0XHRcdFx0J2xpbmUwOScsXG5cdFx0XHRcdFx0J2xpbmUxMCcsXG5cdFx0XHRcdF0uam9pbignXFxuJylcblx0XHRcdH1dKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSwgMTApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDQ4MDU6IFNwbGl0TGluZXNDb2xsZWN0aW9uOiBhdHRlbXB0IHRvIGFjY2VzcyBhIFxcJ25ld2VyXFwnIG1vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSBbJyddO1xuXHRcdHRlc3RWaWV3TW9kZWwodGV4dCwge30sICh2aWV3TW9kZWwsIG1vZGVsKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldExpbmVDb3VudCgpLCAxKTtcblxuXHRcdFx0bW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKFtdLCBbe1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLFxuXHRcdFx0XHR0ZXh0OiAnXFxuaW5zZXJ0MSdcblx0XHRcdH1dLCAoKSA9PiAoW10pKTtcblxuXHRcdFx0bW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKFtdLCBbe1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLFxuXHRcdFx0XHR0ZXh0OiAnXFxuaW5zZXJ0Midcblx0XHRcdH1dLCAoKSA9PiAoW10pKTtcblxuXHRcdFx0bW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKFtdLCBbe1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLFxuXHRcdFx0XHR0ZXh0OiAnXFxuaW5zZXJ0Mydcblx0XHRcdH1dLCAoKSA9PiAoW10pKTtcblxuXHRcdFx0Y29uc3Qgdmlld0xpbmVDb3VudDogbnVtYmVyW10gPSBbXTtcblxuXHRcdFx0dmlld0xpbmVDb3VudC5wdXNoKHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHRjb25zdCBldmVudEhhbmRsZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBWaWV3RXZlbnRIYW5kbGVyIHtcblx0XHRcdFx0b3ZlcnJpZGUgaGFuZGxlRXZlbnRzKGV2ZW50czogVmlld0V2ZW50W10pOiB2b2lkIHtcblx0XHRcdFx0XHQvLyBBY2Nlc3MgdGhlIHZpZXcgbW9kZWxcblx0XHRcdFx0XHR2aWV3TGluZUNvdW50LnB1c2godmlld01vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHZpZXdNb2RlbC5hZGRWaWV3RXZlbnRIYW5kbGVyKGV2ZW50SGFuZGxlcik7XG5cdFx0XHRtb2RlbC51bmRvKCk7XG5cdFx0XHR2aWV3TGluZUNvdW50LnB1c2godmlld01vZGVsLmdldExpbmVDb3VudCgpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TGluZUNvdW50LCBbNCwgMSwgMSwgMSwgMV0pO1xuXG5cdFx0XHR2aWV3TW9kZWwucmVtb3ZlVmlld0V2ZW50SGFuZGxlcihldmVudEhhbmRsZXIpO1xuXHRcdFx0ZXZlbnRIYW5kbGVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndmlldyBtb2RlbHMgcmVhY3QgZmlyc3QgdG8gbW9kZWwgY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCBpbml0aWFsVGV4dCA9IFtcblx0XHRcdCdIZWxsbycsXG5cdFx0XHQnd29ybGQnXG5cdFx0XTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChpbml0aWFsVGV4dC5qb2luKCdcXG4nKSkpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlQ29kZUVkaXRvclNlcnZpY2VzKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBlZDEgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXN0Q29kZUVkaXRvcihpbnN0YW50aWF0aW9uU2VydmljZSwgbW9kZWwpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXN0Q29kZUVkaXRvcihpbnN0YW50aWF0aW9uU2VydmljZSwgbW9kZWwpKTtcblxuXHRcdC8vIEFkZCBhIG5hc3R5IGxpc3RlbmVyIHdoaWNoIG1vZGlmaWVzIHRoZSBtb2RlbCBkdXJpbmcgdGhlIG1vZGVsIGNoYW5nZSBldmVudFxuXHRcdGxldCBpc0ZpcnN0ID0gdHJ1ZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZWQxLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KChlKSA9PiB7XG5cdFx0XHRpZiAoaXNGaXJzdCkge1xuXHRcdFx0XHRpc0ZpcnN0ID0gZmFsc2U7XG5cdFx0XHRcdC8vIGRlbGV0ZSB0aGUgXFxuXG5cdFx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCA2LCAyLCAxKSwgdGV4dDogJycgfV0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdG1vZGVsLmFwcGx5RWRpdHMoW3sgcmFuZ2U6IG5ldyBSYW5nZSgyLCA2LCAyLCA2KSwgdGV4dDogJyEnIH1dKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQ0ODA1OiBObyB2aXNpYmxlIGxpbmVzIHZpYSBBUEkgY2FsbCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gW1xuXHRcdFx0J2xpbmUxJyxcblx0XHRcdCdsaW5lMicsXG5cdFx0XHQnbGluZTMnXG5cdFx0XTtcblx0XHR0ZXN0Vmlld01vZGVsKHRleHQsIHt9LCAodmlld01vZGVsLCBtb2RlbCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSwgMyk7XG5cdFx0XHR2aWV3TW9kZWwuc2V0SGlkZGVuQXJlYXMoW25ldyBSYW5nZSgxLCAxLCAzLCAxKV0pO1xuXHRcdFx0YXNzZXJ0Lm9rKHZpZXdNb2RlbC5nZXRWaXNpYmxlUmFuZ2VzKCkgIT09IG51bGwpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDQ4MDU6IE5vIHZpc2libGUgbGluZXMgdmlhIHVuZG9pbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdCcnXG5cdFx0XTtcblx0XHR0ZXN0Vmlld01vZGVsKHRleHQsIHt9LCAodmlld01vZGVsLCBtb2RlbCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSwgMSk7XG5cblx0XHRcdG1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhbXSwgW3tcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSxcblx0XHRcdFx0dGV4dDogJ2xpbmUxXFxubGluZTJcXG5saW5lMydcblx0XHRcdH1dLCAoKSA9PiAoW10pKTtcblxuXHRcdFx0dmlld01vZGVsLnNldEhpZGRlbkFyZWFzKFtuZXcgUmFuZ2UoMSwgMSwgMSwgMSldKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCksIDIpO1xuXG5cdFx0XHRtb2RlbC51bmRvKCk7XG5cdFx0XHRhc3NlcnQub2sodmlld01vZGVsLmdldFZpc2libGVSYW5nZXMoKSAhPT0gbnVsbCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGFzc2VydEdldFBsYWluVGV4dFRvQ29weSh0ZXh0OiBzdHJpbmdbXSwgcmFuZ2VzOiBSYW5nZVtdLCBlbXB0eVNlbGVjdGlvbkNsaXBib2FyZDogYm9vbGVhbiwgZXhwZWN0ZWQ6IHN0cmluZyB8IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0dGVzdFZpZXdNb2RlbCh0ZXh0LCB7fSwgKHZpZXdNb2RlbCwgbW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IHZpZXdNb2RlbC5nZXRQbGFpblRleHRUb0NvcHkocmFuZ2VzLCBlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuc291cmNlVGV4dCwgZXhwZWN0ZWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0Y29uc3QgVVNVQUxfVEVYVCA9IFtcblx0XHQnJyxcblx0XHQnbGluZTInLFxuXHRcdCdsaW5lMycsXG5cdFx0J2xpbmU0Jyxcblx0XHQnJ1xuXHRdO1xuXG5cdHRlc3QoJ2dldFBsYWluVGV4dFRvQ29weSAwLzEnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0R2V0UGxhaW5UZXh0VG9Db3B5KFxuXHRcdFx0VVNVQUxfVEVYVCxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFJhbmdlKDIsIDIsIDIsIDIpXG5cdFx0XHRdLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFBsYWluVGV4dFRvQ29weSAwLzEgLSBlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCcsICgpID0+IHtcblx0XHRhc3NlcnRHZXRQbGFpblRleHRUb0NvcHkoXG5cdFx0XHRVU1VBTF9URVhULFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgUmFuZ2UoMiwgMiwgMiwgMilcblx0XHRcdF0sXG5cdFx0XHR0cnVlLFxuXHRcdFx0J2xpbmUyXFxuJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFBsYWluVGV4dFRvQ29weSAxLzEnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0R2V0UGxhaW5UZXh0VG9Db3B5KFxuXHRcdFx0VVNVQUxfVEVYVCxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFJhbmdlKDIsIDIsIDIsIDYpXG5cdFx0XHRdLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnaW5lMidcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRQbGFpblRleHRUb0NvcHkgMS8xIC0gZW1wdHlTZWxlY3Rpb25DbGlwYm9hcmQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0R2V0UGxhaW5UZXh0VG9Db3B5KFxuXHRcdFx0VVNVQUxfVEVYVCxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFJhbmdlKDIsIDIsIDIsIDYpXG5cdFx0XHRdLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdCdpbmUyJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFBsYWluVGV4dFRvQ29weSAwLzInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0R2V0UGxhaW5UZXh0VG9Db3B5KFxuXHRcdFx0VVNVQUxfVEVYVCxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFJhbmdlKDIsIDIsIDIsIDIpLFxuXHRcdFx0XHRuZXcgUmFuZ2UoMywgMiwgMywgMiksXG5cdFx0XHRdLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFBsYWluVGV4dFRvQ29weSAwLzIgLSBlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCcsICgpID0+IHtcblx0XHRhc3NlcnRHZXRQbGFpblRleHRUb0NvcHkoXG5cdFx0XHRVU1VBTF9URVhULFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgUmFuZ2UoMiwgMiwgMiwgMiksXG5cdFx0XHRcdG5ldyBSYW5nZSgzLCAyLCAzLCAyKSxcblx0XHRcdF0sXG5cdFx0XHR0cnVlLFxuXHRcdFx0W1xuXHRcdFx0XHQnbGluZTJcXG4nLFxuXHRcdFx0XHQnbGluZTNcXG4nXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzI1NjAzOTogZ2V0UGxhaW5UZXh0VG9Db3B5IHdpdGggbXVsdGlwbGUgY3Vyc29ycyBhbmQgZW1wdHkgc2VsZWN0aW9ucyBzaG91bGQgcmV0dXJuIGFycmF5JywgKCkgPT4ge1xuXHRcdC8vIEJ1ZzogV2hlbiBjb3B5aW5nIHdpdGggbXVsdGlwbGUgY3Vyc29ycyAoZW1wdHkgc2VsZWN0aW9ucykgd2l0aCBlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCBlbmFibGVkLFxuXHRcdC8vIHRoZSByZXN1bHQgc2hvdWxkIGJlIGFuIGFycmF5IHNvIHRoYXQgcGFzdGluZyB3aXRoIFwiZWRpdG9yLm11bHRpQ3Vyc29yUGFzdGVcIjogXCJmdWxsXCJcblx0XHQvLyBjb3JyZWN0bHkgZGlzdHJpYnV0ZXMgZWFjaCBsaW5lIHRvIHRoZSBjb3JyZXNwb25kaW5nIGN1cnNvci5cblx0XHQvLyBXaXRob3V0IHRoZSBmaXgsIHRoaXMgcmV0dXJucyAnbGluZTJcXG5saW5lM1xcbicgKGEgc2luZ2xlIHN0cmluZykuXG5cdFx0Ly8gV2l0aCB0aGUgZml4LCB0aGlzIHJldHVybnMgWydsaW5lMlxcbicsICdsaW5lM1xcbiddIChhbiBhcnJheSkuXG5cdFx0YXNzZXJ0R2V0UGxhaW5UZXh0VG9Db3B5KFxuXHRcdFx0VVNVQUxfVEVYVCxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFJhbmdlKDIsIDEsIDIsIDEpLFxuXHRcdFx0XHRuZXcgUmFuZ2UoMywgMSwgMywgMSksXG5cdFx0XHRdLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdFsnbGluZTJcXG4nLCAnbGluZTNcXG4nXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFBsYWluVGV4dFRvQ29weSAxLzInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0R2V0UGxhaW5UZXh0VG9Db3B5KFxuXHRcdFx0VVNVQUxfVEVYVCxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFJhbmdlKDIsIDIsIDIsIDYpLFxuXHRcdFx0XHRuZXcgUmFuZ2UoMywgMiwgMywgMiksXG5cdFx0XHRdLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnaW5lMidcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRQbGFpblRleHRUb0NvcHkgMS8yIC0gZW1wdHlTZWxlY3Rpb25DbGlwYm9hcmQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0R2V0UGxhaW5UZXh0VG9Db3B5KFxuXHRcdFx0VVNVQUxfVEVYVCxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFJhbmdlKDIsIDIsIDIsIDYpLFxuXHRcdFx0XHRuZXcgUmFuZ2UoMywgMiwgMywgMiksXG5cdFx0XHRdLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdFsnaW5lMicsICdsaW5lM1xcbiddXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UGxhaW5UZXh0VG9Db3B5IDIvMicsICgpID0+IHtcblx0XHRhc3NlcnRHZXRQbGFpblRleHRUb0NvcHkoXG5cdFx0XHRVU1VBTF9URVhULFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgUmFuZ2UoMiwgMiwgMiwgNiksXG5cdFx0XHRcdG5ldyBSYW5nZSgzLCAyLCAzLCA2KSxcblx0XHRcdF0sXG5cdFx0XHRmYWxzZSxcblx0XHRcdFsnaW5lMicsICdpbmUzJ11cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRQbGFpblRleHRUb0NvcHkgMi8yIHJldmVyc2VkJywgKCkgPT4ge1xuXHRcdGFzc2VydEdldFBsYWluVGV4dFRvQ29weShcblx0XHRcdFVTVUFMX1RFWFQsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBSYW5nZSgzLCAyLCAzLCA2KSxcblx0XHRcdFx0bmV3IFJhbmdlKDIsIDIsIDIsIDYpLFxuXHRcdFx0XSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0WydpbmUyJywgJ2luZTMnXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFBsYWluVGV4dFRvQ29weSAwLzMgLSBlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCcsICgpID0+IHtcblx0XHRhc3NlcnRHZXRQbGFpblRleHRUb0NvcHkoXG5cdFx0XHRVU1VBTF9URVhULFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgUmFuZ2UoMiwgMiwgMiwgMiksXG5cdFx0XHRcdG5ldyBSYW5nZSgyLCAzLCAyLCAzKSxcblx0XHRcdFx0bmV3IFJhbmdlKDMsIDIsIDMsIDIpLFxuXHRcdFx0XSxcblx0XHRcdHRydWUsXG5cdFx0XHRbXG5cdFx0XHRcdCdsaW5lMlxcbicsXG5cdFx0XHRcdCdsaW5lM1xcbidcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjI2ODggLSBhbHdheXMgdXNlIENSTEYgZm9yIGNsaXBib2FyZCBvbiBXaW5kb3dzJywgKCkgPT4ge1xuXHRcdHRlc3RWaWV3TW9kZWwoVVNVQUxfVEVYVCwge30sICh2aWV3TW9kZWwsIG1vZGVsKSA9PiB7XG5cdFx0XHRtb2RlbC5zZXRFT0woRW5kT2ZMaW5lU2VxdWVuY2UuTEYpO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gdmlld01vZGVsLmdldFBsYWluVGV4dFRvQ29weShbbmV3IFJhbmdlKDIsIDEsIDUsIDEpXSwgdHJ1ZSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5zb3VyY2VUZXh0LCAnbGluZTJcXHJcXG5saW5lM1xcclxcbmxpbmU0XFxyXFxuJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0MDkyNjogSW5jb3JyZWN0IHNwYWNpbmcgd2hlbiBpbnNlcnRpbmcgbmV3IGxpbmUgYWZ0ZXIgbXVsdGlwbGUgZm9sZGVkIGJsb2NrcyBvZiBjb2RlJywgKCkgPT4ge1xuXHRcdHRlc3RWaWV3TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdmb28gPSB7Jyxcblx0XHRcdFx0JyAgICBmb29iYXI6IGZ1bmN0aW9uKCkgeycsXG5cdFx0XHRcdCcgICAgICAgIHRoaXMuZm9vYmFyKCk7Jyxcblx0XHRcdFx0JyAgICB9LCcsXG5cdFx0XHRcdCcgICAgZm9vYmFyOiBmdW5jdGlvbigpIHsnLFxuXHRcdFx0XHQnICAgICAgICB0aGlzLmZvb2JhcigpOycsXG5cdFx0XHRcdCcgICAgfSwnLFxuXHRcdFx0XHQnICAgIGZvb2JhcjogZnVuY3Rpb24oKSB7Jyxcblx0XHRcdFx0JyAgICAgICAgdGhpcy5mb29iYXIoKTsnLFxuXHRcdFx0XHQnICAgIH0sJyxcblx0XHRcdFx0J30nLFxuXHRcdFx0XSwge30sICh2aWV3TW9kZWwsIG1vZGVsKSA9PiB7XG5cdFx0XHRcdHZpZXdNb2RlbC5zZXRIaWRkZW5BcmVhcyhbXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDMsIDEsIDMsIDEpLFxuXHRcdFx0XHRcdG5ldyBSYW5nZSg2LCAxLCA2LCAxKSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoOSwgMSwgOSwgMSksXG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSg0LCA3LCA0LCA3KSwgdGV4dDogJ1xcbiAgICAnIH0sXG5cdFx0XHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDcsIDcsIDcsIDcpLCB0ZXh0OiAnXFxuICAgICcgfSxcblx0XHRcdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMTAsIDcsIDEwLCA3KSwgdGV4dDogJ1xcbiAgICAnIH1cblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSwgMTEpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vcm1hbGl6ZVBvc2l0aW9uIHdpdGggbXVsdGlwbGUgdG91Y2hpbmcgaW5qZWN0ZWQgdGV4dCcsICgpID0+IHtcblx0XHR0ZXN0Vmlld01vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnanVzdCBzb21lIHRleHQnXG5cdFx0XHRdLFxuXHRcdFx0e30sXG5cdFx0XHQodmlld01vZGVsLCBtb2RlbCkgPT4ge1xuXHRcdFx0XHRtb2RlbC5kZWx0YURlY29yYXRpb25zKFtdLCBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCA4LCAxLCA4KSxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0Jyxcblx0XHRcdFx0XHRcdFx0YmVmb3JlOiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudDogJ2Jhcidcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0c2hvd0lmQ29sbGFwc2VkOiB0cnVlXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDgsIDEsIDgpLFxuXHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0XHRcdFx0XHRiZWZvcmU6IHtcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50OiAnYnonXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHNob3dJZkNvbGxhcHNlZDogdHJ1ZVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdC8vIGp1c3Qgc29iYXJiem1lIHRleHRcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5ub3JtYWxpemVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgOCksIFBvc2l0aW9uQWZmaW5pdHkuTm9uZSksIG5ldyBQb3NpdGlvbigxLCA4KSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLm5vcm1hbGl6ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA5KSwgUG9zaXRpb25BZmZpbml0eS5Ob25lKSwgbmV3IFBvc2l0aW9uKDEsIDgpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwubm9ybWFsaXplUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDExKSwgUG9zaXRpb25BZmZpbml0eS5Ob25lKSwgbmV3IFBvc2l0aW9uKDEsIDExKSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLm5vcm1hbGl6ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxMiksIFBvc2l0aW9uQWZmaW5pdHkuTm9uZSksIG5ldyBQb3NpdGlvbigxLCAxMSkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5ub3JtYWxpemVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMTMpLCBQb3NpdGlvbkFmZmluaXR5Lk5vbmUpLCBuZXcgUG9zaXRpb24oMSwgMTMpKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5ub3JtYWxpemVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgOCksIFBvc2l0aW9uQWZmaW5pdHkuTGVmdCksIG5ldyBQb3NpdGlvbigxLCA4KSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLm5vcm1hbGl6ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA5KSwgUG9zaXRpb25BZmZpbml0eS5MZWZ0KSwgbmV3IFBvc2l0aW9uKDEsIDgpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwubm9ybWFsaXplUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDExKSwgUG9zaXRpb25BZmZpbml0eS5MZWZ0KSwgbmV3IFBvc2l0aW9uKDEsIDgpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwubm9ybWFsaXplUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDEyKSwgUG9zaXRpb25BZmZpbml0eS5MZWZ0KSwgbmV3IFBvc2l0aW9uKDEsIDgpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwubm9ybWFsaXplUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDEzKSwgUG9zaXRpb25BZmZpbml0eS5MZWZ0KSwgbmV3IFBvc2l0aW9uKDEsIDgpKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5ub3JtYWxpemVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgOCksIFBvc2l0aW9uQWZmaW5pdHkuUmlnaHQpLCBuZXcgUG9zaXRpb24oMSwgMTMpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwubm9ybWFsaXplUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDkpLCBQb3NpdGlvbkFmZmluaXR5LlJpZ2h0KSwgbmV3IFBvc2l0aW9uKDEsIDEzKSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLm5vcm1hbGl6ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxMSksIFBvc2l0aW9uQWZmaW5pdHkuUmlnaHQpLCBuZXcgUG9zaXRpb24oMSwgMTMpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwubm9ybWFsaXplUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDEyKSwgUG9zaXRpb25BZmZpbml0eS5SaWdodCksIG5ldyBQb3NpdGlvbigxLCAxMykpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5ub3JtYWxpemVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMTMpLCBQb3NpdGlvbkFmZmluaXR5LlJpZ2h0KSwgbmV3IFBvc2l0aW9uKDEsIDEzKSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE5MzI2MjogSW5jb3JyZWN0IGltcGxlbWVudGF0aW9uIG9mIG1vZGlmeVBvc2l0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3RWaWV3TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdqdXN0IHNvbWUgdGV4dCdcblx0XHRcdF0sXG5cdFx0XHR7XG5cdFx0XHRcdHdvcmRXcmFwOiAnd29yZFdyYXBDb2x1bW4nLFxuXHRcdFx0XHR3b3JkV3JhcENvbHVtbjogNVxuXHRcdFx0fSxcblx0XHRcdCh2aWV3TW9kZWwsIG1vZGVsKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0bmV3IFBvc2l0aW9uKDMsIDEpLFxuXHRcdFx0XHRcdHZpZXdNb2RlbC5tb2RpZnlQb3NpdGlvbihuZXcgUG9zaXRpb24oMywgMiksIC0xKVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdoaWRkZW4gYXJlYXMgbXVzdCBhbHdheXMgbGVhdmUgYXQgbGVhc3Qgb25lIHZpc2libGUgbGluZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JlcGxhY2luZyB0aGUgb25seSB2aXNpYmxlIGxpbmUgY29udGVudCBkb2VzIG5vdCBtYWtlIGl0IGhpZGRlbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHRcdCdsaW5lMScsXG5cdFx0XHRcdCdsaW5lMicsXG5cdFx0XHRcdCdsaW5lMycsXG5cdFx0XHRdO1xuXHRcdFx0dGVzdFZpZXdNb2RlbCh0ZXh0LCB7fSwgKHZpZXdNb2RlbCwgbW9kZWwpID0+IHtcblx0XHRcdFx0Ly8gSGlkZSBsaW5lcyAxIGFuZCAzLCBsZWF2aW5nIG9ubHkgbGluZSAyIHZpc2libGVcblx0XHRcdFx0dmlld01vZGVsLnNldEhpZGRlbkFyZWFzKFtcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgMSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDMsIDEsIDMsIDEpLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSwgMSk7XG5cblx0XHRcdFx0Ly8gUmVwbGFjZSBsaW5lIDIgY29udGVudCBlbnRpcmVseVxuXHRcdFx0XHRtb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAyLCA2KSxcblx0XHRcdFx0XHR0ZXh0OiAnbmV3IGNvbnRlbnQnXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRhc3NlcnQub2sodmlld01vZGVsLmdldExpbmVDb3VudCgpID49IDEsIGBleHBlY3RlZCBhdCBsZWFzdCAxIHZpZXcgbGluZSBidXQgZ290ICR7dmlld01vZGVsLmdldExpbmVDb3VudCgpfWApO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWxldGluZyB0aGUgb25seSB2aXNpYmxlIGxpbmUgd2hlbiBpdCBpcyB0aGUgbGFzdCBsaW5lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdFx0J2xpbmUxJyxcblx0XHRcdFx0J2xpbmUyJyxcblx0XHRcdFx0J2xpbmUzJyxcblx0XHRcdF07XG5cdFx0XHR0ZXN0Vmlld01vZGVsKHRleHQsIHt9LCAodmlld01vZGVsLCBtb2RlbCkgPT4ge1xuXHRcdFx0XHQvLyBIaWRlIGxpbmVzIDEtMiwgbGVhdmluZyBvbmx5IGxpbmUgMyB2aXNpYmxlXG5cdFx0XHRcdHZpZXdNb2RlbC5zZXRIaWRkZW5BcmVhcyhbbmV3IFJhbmdlKDEsIDEsIDIsIDEpXSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCksIDEpO1xuXG5cdFx0XHRcdC8vIERlbGV0ZSBsaW5lIDMgYnkgbWVyZ2luZyBpdCBpbnRvIGxpbmUgMlxuXHRcdFx0XHRtb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgyLCA2LCAzLCA2KSxcblx0XHRcdFx0XHR0ZXh0OiBudWxsXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRhc3NlcnQub2sodmlld01vZGVsLmdldExpbmVDb3VudCgpID49IDEsIGBleHBlY3RlZCBhdCBsZWFzdCAxIHZpZXcgbGluZSBidXQgZ290ICR7dmlld01vZGVsLmdldExpbmVDb3VudCgpfWApO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWxldGluZyB0aGUgb25seSB2aXNpYmxlIGxpbmUgd2hlbiBpdCBpcyBpbiB0aGUgbWlkZGxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdFx0J2xpbmUxJyxcblx0XHRcdFx0J2xpbmUyJyxcblx0XHRcdFx0J2xpbmUzJyxcblx0XHRcdFx0J2xpbmU0Jyxcblx0XHRcdFx0J2xpbmU1Jyxcblx0XHRcdF07XG5cdFx0XHR0ZXN0Vmlld01vZGVsKHRleHQsIHt9LCAodmlld01vZGVsLCBtb2RlbCkgPT4ge1xuXHRcdFx0XHQvLyBIaWRlIGxpbmVzIDEtMiBhbmQgNC01LCBsZWF2aW5nIG9ubHkgbGluZSAzIHZpc2libGVcblx0XHRcdFx0dmlld01vZGVsLnNldEhpZGRlbkFyZWFzKFtcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMiwgMSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDQsIDEsIDUsIDEpLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSwgMSk7XG5cblx0XHRcdFx0Ly8gRGVsZXRlIGxpbmUgMyBieSBtZXJnaW5nIGFkamFjZW50IGxpbmVzXG5cdFx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDIsIDYsIDQsIDEpLFxuXHRcdFx0XHRcdHRleHQ6IG51bGxcblx0XHRcdFx0fV0pO1xuXG5cdFx0XHRcdGFzc2VydC5vayh2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCkgPj0gMSwgYGV4cGVjdGVkIGF0IGxlYXN0IDEgdmlldyBsaW5lIGJ1dCBnb3QgJHt2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCl9YCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VuZG8gdGhhdCByZW1vdmVzIHRoZSBvbmx5IHZpc2libGUgbGluZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHRcdCdsaW5lMScsXG5cdFx0XHRdO1xuXHRcdFx0dGVzdFZpZXdNb2RlbCh0ZXh0LCB7fSwgKHZpZXdNb2RlbCwgbW9kZWwpID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSwgMSk7XG5cblx0XHRcdFx0Ly8gSW5zZXJ0IGxpbmVzIHRvIGNyZWF0ZSBjb250ZW50XG5cdFx0XHRcdG1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhbXSwgW3tcblx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDYsIDEsIDYpLFxuXHRcdFx0XHRcdHRleHQ6ICdcXG5saW5lMlxcbmxpbmUzXFxubGluZTRcXG5saW5lNSdcblx0XHRcdFx0fV0sICgpID0+IChbXSkpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCksIDUpO1xuXG5cdFx0XHRcdC8vIEhpZGUgbGluZXMgMS0yIGFuZCA0LTUsIGxlYXZpbmcgb25seSBsaW5lIDMgdmlzaWJsZVxuXHRcdFx0XHR2aWV3TW9kZWwuc2V0SGlkZGVuQXJlYXMoW1xuXHRcdFx0XHRcdG5ldyBSYW5nZSgxLCAxLCAyLCAxKSxcblx0XHRcdFx0XHRuZXcgUmFuZ2UoNCwgMSwgNSwgMSksXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldExpbmVDb3VudCgpLCAxKTtcblxuXHRcdFx0XHQvLyBVbmRvIGNvbGxhcHNlcyBiYWNrIHRvIDEgbGluZSwgYnV0IGhpZGRlbiBhcmVhIGRlY29yYXRpb25zIG1heSBncm93XG5cdFx0XHRcdG1vZGVsLnVuZG8oKTtcblxuXHRcdFx0XHRhc3NlcnQub2sodmlld01vZGVsLmdldExpbmVDb3VudCgpID49IDEsIGBleHBlY3RlZCBhdCBsZWFzdCAxIHZpZXcgbGluZSBidXQgZ290ICR7dmlld01vZGVsLmdldExpbmVDb3VudCgpfWApO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWxldGluZyB0aGUgb25seSB2aXNpYmxlIGxpbmUgYmV0d2VlbiB0d28gaGlkZGVuIGFyZWFzIGxlYXZlcyBhbGwgbGluZXMgaGlkZGVuJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdFx0J2xpbmUxJyxcblx0XHRcdFx0J2xpbmUyJyxcblx0XHRcdFx0J2xpbmUzJyxcblx0XHRcdFx0J2xpbmU0Jyxcblx0XHRcdFx0J2xpbmU1Jyxcblx0XHRcdFx0J2xpbmU2Jyxcblx0XHRcdFx0J2xpbmU3Jyxcblx0XHRcdFx0J2xpbmU4Jyxcblx0XHRcdF07XG5cdFx0XHR0ZXN0Vmlld01vZGVsKHRleHQsIHt9LCAodmlld01vZGVsLCBtb2RlbCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldExpbmVDb3VudCgpLCA4KTtcblxuXHRcdFx0XHQvLyBIaWRlIGxpbmVzIDEtNSBhbmQgNy04LCBsZWF2aW5nIG9ubHkgbGluZSA2IHZpc2libGVcblx0XHRcdFx0dmlld01vZGVsLnNldEhpZGRlbkFyZWFzKFtcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMSwgNSwgMSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDcsIDEsIDgsIDEpLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSwgMSk7XG5cblx0XHRcdFx0Ly8gRGVsZXRlIGxpbmVzIDYsIDcsIDggXHUyMDE0IHRoZSBvbmx5IHZpc2libGUgbGluZSBwbHVzIHNvbWUgaGlkZGVuIG9uZXNcblx0XHRcdFx0bW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoNiwgMSwgOCwgNSksXG5cdFx0XHRcdFx0dGV4dDogbnVsbFxuXHRcdFx0XHR9XSk7XG5cblx0XHRcdFx0Ly8gVGhlIHZpZXcgbW9kZWwgbXVzdCBzdGlsbCBoYXZlIGF0IGxlYXN0IG9uZSB2aXNpYmxlIGxpbmVcblx0XHRcdFx0YXNzZXJ0Lm9rKHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSA+PSAxLCBgZXhwZWN0ZWQgYXQgbGVhc3QgMSB2aWV3IGxpbmUgYnV0IGdvdCAke3ZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKX1gKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlwbGUgdmlzaWJsZSBsaW5lcyBkZWxldGVkIGxlYXZpbmcgb25seSBoaWRkZW4gbGluZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gW1xuXHRcdFx0XHQnaGlkZGVuMScsXG5cdFx0XHRcdCdoaWRkZW4yJyxcblx0XHRcdFx0J3Zpc2libGUxJyxcblx0XHRcdFx0J3Zpc2libGUyJyxcblx0XHRcdFx0J2hpZGRlbjMnLFxuXHRcdFx0XHQnaGlkZGVuNCcsXG5cdFx0XHRdO1xuXHRcdFx0dGVzdFZpZXdNb2RlbCh0ZXh0LCB7fSwgKHZpZXdNb2RlbCwgbW9kZWwpID0+IHtcblx0XHRcdFx0dmlld01vZGVsLnNldEhpZGRlbkFyZWFzKFtcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMiwgMSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDUsIDEsIDYsIDEpLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSwgMik7XG5cblx0XHRcdFx0Ly8gRGVsZXRlIHZpc2libGUgbGluZXMgMyBhbmQgNFxuXHRcdFx0XHRtb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgyLCA4LCA1LCAxKSxcblx0XHRcdFx0XHR0ZXh0OiBudWxsXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRhc3NlcnQub2sodmlld01vZGVsLmdldExpbmVDb3VudCgpID49IDEsIGBleHBlY3RlZCBhdCBsZWFzdCAxIHZpZXcgbGluZSBidXQgZ290ICR7dmlld01vZGVsLmdldExpbmVDb3VudCgpfWApO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoaWRkZW4gYXJlYXMgZnJvbSBtdWx0aXBsZSBzb3VyY2VzIHRoYXQgb3ZlcmxhcCBwcm9kdWNlIHZhbGlkIG1lcmdlZCByZXN1bHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDE7IGkgPD0gMTA7IGkrKykge1xuXHRcdFx0XHR0ZXh0LnB1c2goYGxpbmUke2l9YCk7XG5cdFx0XHR9XG5cdFx0XHR0ZXN0Vmlld01vZGVsKHRleHQsIHt9LCAodmlld01vZGVsLCBtb2RlbCkgPT4ge1xuXHRcdFx0XHQvLyBTb3VyY2UgQSBoaWRlcyBhIGxhcmdlIHJhbmdlIFsxLThdLlxuXHRcdFx0XHQvLyBTb3VyY2UgQiBoaWRlcyBzbWFsbCByYW5nZXMgWzItM10gYW5kIFs1LTZdIHRoYXQgYXJlIHN1YnN1bWVkIGJ5IEEuXG5cdFx0XHRcdC8vIG1lcmdlTGluZVJhbmdlQXJyYXkgaGFzIGEgYnVnIHdoZXJlIGl0IGFkdmFuY2VzIGJvdGggcG9pbnRlcnMgYWZ0ZXJcblx0XHRcdFx0Ly8gbWVyZ2luZyBbMS04XStbMi0zXT1bMS04XSwgbGVhdmluZyBbNS02XSBhbmQgWzgsOV0gYXMgc2VwYXJhdGUgZW50cmllc1xuXHRcdFx0XHQvLyB0aGF0IG92ZXJsYXAgd2l0aCBvciBhcmUgc3Vic3VtZWQgYnkgWzEtOF0uXG5cdFx0XHRcdC8vIG5vcm1hbGl6ZUxpbmVSYW5nZXMgaW4gc2V0SGlkZGVuQXJlYXMgY2xlYW5zIHRoaXMgdXAsIHNvIHRoZSByZXN1bHRcblx0XHRcdFx0Ly8gc2hvdWxkIHN0aWxsIGJlIGNvcnJlY3Q6IGxpbmVzIDEtOCBoaWRkZW4sIGxpbmVzIDktMTAgdmlzaWJsZS5cblx0XHRcdFx0dmlld01vZGVsLnNldEhpZGRlbkFyZWFzKFtuZXcgUmFuZ2UoMSwgMSwgOCwgMSldLCAnc291cmNlQScpO1xuXHRcdFx0XHR2aWV3TW9kZWwuc2V0SGlkZGVuQXJlYXMoW25ldyBSYW5nZSgyLCAxLCAzLCAxKSwgbmV3IFJhbmdlKDUsIDEsIDYsIDEpLCBuZXcgUmFuZ2UoOCwgMSwgOSwgMSldLCAnc291cmNlQicpO1xuXG5cdFx0XHRcdC8vIExpbmVzIDEtOSBzaG91bGQgYmUgaGlkZGVuIChtZXJnZWQgZnJvbSBbMS04XSBhbmQgWzgtOV0pLCBsaW5lIDEwIHZpc2libGVcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSwgMSwgJ29ubHkgbGluZSAxMCBzaG91bGQgYmUgdmlzaWJsZScpO1xuXG5cdFx0XHRcdC8vIFRoZSBoaWRkZW4gYXJlYXMgcmV0dXJuZWQgc2hvdWxkIGJlIG5vbi1vdmVybGFwcGluZyBhbmQgc29ydGVkXG5cdFx0XHRcdGNvbnN0IGhpZGRlbkFyZWFzID0gdmlld01vZGVsLmdldEhpZGRlbkFyZWFzKCk7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAxOyBpIDwgaGlkZGVuQXJlYXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRhc3NlcnQub2soXG5cdFx0XHRcdFx0XHRoaWRkZW5BcmVhc1tpXS5zdGFydExpbmVOdW1iZXIgPiBoaWRkZW5BcmVhc1tpIC0gMV0uZW5kTGluZU51bWJlcixcblx0XHRcdFx0XHRcdGBoaWRkZW4gYXJlYXMgc2hvdWxkIG5vdCBvdmVybGFwOiBbJHtoaWRkZW5BcmVhc1tpIC0gMV0uc3RhcnRMaW5lTnVtYmVyfS0ke2hpZGRlbkFyZWFzW2kgLSAxXS5lbmRMaW5lTnVtYmVyfV0gYW5kIFske2hpZGRlbkFyZWFzW2ldLnN0YXJ0TGluZU51bWJlcn0tJHtoaWRkZW5BcmVhc1tpXS5lbmRMaW5lTnVtYmVyfV1gXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0YWIgc2l6ZSBjaGFuZ2Ugd2l0aCBkcmlmdGVkIGhpZGRlbiBhcmVhIGRlY29yYXRpb25zIG11c3Qgbm90IGxlYXZlIDAgdmlzaWJsZSBsaW5lcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHRcdCdsaW5lMScsXG5cdFx0XHRcdCdsaW5lMicsXG5cdFx0XHRcdCdsaW5lMycsXG5cdFx0XHRdO1xuXHRcdFx0dGVzdFZpZXdNb2RlbCh0ZXh0LCB7fSwgKHZpZXdNb2RlbCwgbW9kZWwpID0+IHtcblx0XHRcdFx0Ly8gSGlkZSBsaW5lcyAxLTIsIGxlYXZpbmcgb25seSBsaW5lIDMgdmlzaWJsZS5cblx0XHRcdFx0dmlld01vZGVsLnNldEhpZGRlbkFyZWFzKFtuZXcgUmFuZ2UoMSwgMSwgMiwgMSldKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSwgMSk7XG5cblx0XHRcdFx0Ly8gSW5zZXJ0IGF0ICgyLDEpIFx1MjAxNCB0aGUgZW5kIGVkZ2Ugb2YgdGhlIGhpZGRlbiBhcmVhIGRlY29yYXRpb24uXG5cdFx0XHRcdC8vIEFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMgY2F1c2VzIHRoZSBkZWNvcmF0aW9uIHRvIGdyb3cgZnJvbVxuXHRcdFx0XHQvLyBbMSwxIFx1MjE5MiAyLDFdIHRvIFsxLDEgXHUyMTkyIDMsMV0sIGNvdmVyaW5nIHdoYXQgd2FzIHRoZSB2aXNpYmxlIGxpbmUgMy5cblx0XHRcdFx0Ly8gQWZ0ZXIgdGhpcyBpbnNlcnQsIHRoZSBmaWxlIGhhcyA0IGxpbmVzLCBkZWNvcmF0aW9uIGNvdmVycyBbMS0zXSwgbGluZSA0IHZpc2libGUuXG5cdFx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoW3sgcmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAyLCAxKSwgdGV4dDogJ3hcXG4nIH1dKTtcblx0XHRcdFx0Ly8gSW5zZXJ0IGFnYWluIHRvIHB1c2ggZGVjb3JhdGlvbiBmdXJ0aGVyXG5cdFx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoW3sgcmFuZ2U6IG5ldyBSYW5nZSgzLCAxLCAzLCAxKSwgdGV4dDogJ3lcXG4nIH1dKTtcblx0XHRcdFx0Ly8gTm93IGZpbGUgaGFzIDUgbGluZXMsIGRlY29yYXRpb24gY292ZXJzIFsxLTRdLCBsaW5lIDUgdmlzaWJsZS5cblxuXHRcdFx0XHQvLyBEZWxldGUgbGluZXMgNC01IHRvIGNvbGxhcHNlIGJhY2ssIG1ha2luZyBkZWNvcmF0aW9uIGNvdmVyIGV2ZXJ5dGhpbmdcblx0XHRcdFx0bW9kZWwuYXBwbHlFZGl0cyhbeyByYW5nZTogbmV3IFJhbmdlKDQsIDEsIDUsIDYpLCB0ZXh0OiAnJyB9XSk7XG5cdFx0XHRcdC8vIE5vdyBmaWxlIGhhcyA0IGxpbmVzLiBhY2NlcHRWZXJzaW9uSWQgZW5zdXJlcyB2aWV3TGluZXMgPj0gMS5cblxuXHRcdFx0XHQvLyBUYWIgc2l6ZSBjaGFuZ2U6IHRyaWdnZXJzIF9jb25zdHJ1Y3RMaW5lcyhyZXNldEhpZGRlbkFyZWFzPWZhbHNlKVxuXHRcdFx0XHQvLyB3aGljaCByZS1yZWFkcyB0aGUgZGVjb3JhdGlvbiByYW5nZXMgKHdoaWNoIG1heSBjb3ZlciBhbGwgbGluZXMpLlxuXHRcdFx0XHRtb2RlbC51cGRhdGVPcHRpb25zKHsgdGFiU2l6ZTogOCB9KTtcblxuXHRcdFx0XHRhc3NlcnQub2sodmlld01vZGVsLmdldExpbmVDb3VudCgpID49IDEsIGBleHBlY3RlZCBhdCBsZWFzdCAxIHZpZXcgbGluZSBidXQgZ290ICR7dmlld01vZGVsLmdldExpbmVDb3VudCgpfWApO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsbUJBQW1CLHdCQUF3QjtBQUNwRCxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQixpQ0FBaUM7QUFFcEUsTUFBTSxhQUFhLE1BQU07QUFFeEIsMENBQXdDO0FBRXhDLE9BQUsseUVBQTJFLE1BQU07QUFDckYsVUFBTSxPQUFPLENBQUMsRUFBRTtBQUNoQixVQUFNLE9BQU87QUFBQSxNQUNaLHFCQUFxQjtBQUFBLElBQ3RCO0FBQ0Esa0JBQWMsTUFBTSxNQUFNLENBQUMsV0FBVyxVQUFVO0FBQy9DLGFBQU8sWUFBWSxVQUFVLGFBQWEsR0FBRyxDQUFDO0FBRTlDLGdCQUFVLFlBQVksR0FBRyxHQUFHLENBQUM7QUFFN0IsWUFBTSxXQUFXLENBQUM7QUFBQSxRQUNqQixPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDM0IsTUFBTTtBQUFBLFVBQ0w7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVB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
