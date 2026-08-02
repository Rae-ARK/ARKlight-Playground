import assert from "assert";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Range } from "../../../common/core/range.js";
import { InternalModelContentChangeEvent, RawContentChangedType } from "../../../common/textModelEvents.js";
import { createTextModel } from "../testTextModel.js";
suite("Editor Model - Injected Text Events", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("Basic", () => {
    const thisModel = store.add(createTextModel("First Line\nSecond Line"));
    const recordedChanges = new Array();
    const spyViewModel = new class extends mock() {
      onDidChangeContentOrInjectedText(e) {
        const changes = e instanceof InternalModelContentChangeEvent ? e.rawContentChangedEvent.changes : e.changes;
        for (const change of changes) {
          recordedChanges.push(mapChange(change));
        }
      }
      emitContentChangeEvent(_e) {
      }
    }();
    thisModel.registerViewModel(spyViewModel);
    let decorations = thisModel.deltaDecorations([], [{
      options: {
        after: { content: "injected1" },
        description: "test1",
        showIfCollapsed: true
      },
      range: new Range(1, 1, 1, 1)
    }]);
    assert.deepStrictEqual(recordedChanges.splice(0), [
      {
        kind: "lineChanged",
        lineNumber: 1,
        lineNumberPostEdit: 1
      }
    ]);
    decorations = thisModel.deltaDecorations(decorations, [{
      options: {
        after: { content: "injected1" },
        description: "test1",
        showIfCollapsed: true
      },
      range: new Range(2, 1, 2, 1)
    }, {
      options: {
        after: { content: "injected2" },
        description: "test2",
        showIfCollapsed: true
      },
      range: new Range(2, 2, 2, 2)
    }]);
    assert.deepStrictEqual(recordedChanges.splice(0), [
      {
        kind: "lineChanged",
        lineNumber: 1,
        lineNumberPostEdit: 1
      },
      {
        kind: "lineChanged",
        lineNumber: 2,
        lineNumberPostEdit: 2
      }
    ]);
    thisModel.applyEdits([EditOperation.replace(new Range(2, 2, 2, 2), "Hello")]);
    assert.deepStrictEqual(recordedChanges.splice(0), [
      {
        kind: "lineChanged",
        lineNumber: 2,
        lineNumberPostEdit: 2
      }
    ]);
    thisModel.pushEditOperations(null, [EditOperation.replace(new Range(2, 2, 2, 2), "\n\n\n")], null);
    assert.deepStrictEqual(thisModel.getAllDecorations(void 0).map((d) => ({ description: d.options.description, range: d.range.toString() })), [
      {
        "description": "test1",
        "range": "[2,1 -> 2,1]"
      },
      {
        "description": "test2",
        "range": "[2,2 -> 5,6]"
      }
    ]);
    assert.deepStrictEqual(recordedChanges.splice(0), [
      {
        kind: "lineChanged",
        lineNumber: 2,
        lineNumberPostEdit: 2
      },
      {
        kind: "linesInserted",
        fromLineNumber: 3,
        count: 3
      }
    ]);
    thisModel.pushEditOperations(null, [EditOperation.replace(new Range(3, 1, 5, 1), "\n\n\n\n\n\n\n\n\n\n\n\n\n")], null);
    assert.deepStrictEqual(recordedChanges.splice(0), [
      {
        kind: "lineChanged",
        lineNumber: 5,
        lineNumberPostEdit: 5
      },
      {
        kind: "lineChanged",
        lineNumber: 4,
        lineNumberPostEdit: 4
      },
      {
        kind: "lineChanged",
        lineNumber: 3,
        lineNumberPostEdit: 3
      },
      {
        kind: "linesInserted",
        fromLineNumber: 6,
        count: 11
      }
    ]);
    assert.strictEqual(thisModel.undo(), void 0);
    assert.deepStrictEqual(recordedChanges.splice(0), [
      {
        kind: "lineChanged",
        lineNumber: 2,
        lineNumberPostEdit: 2
      },
      {
        kind: "linesDeleted"
      }
    ]);
    thisModel.unregisterViewModel(spyViewModel);
  });
});
function mapChange(change) {
  if (change.changeType === RawContentChangedType.LineChanged) {
    return {
      kind: "lineChanged",
      lineNumber: change.lineNumber,
      lineNumberPostEdit: change.lineNumberPostEdit
    };
  } else if (change.changeType === RawContentChangedType.LinesInserted) {
    return {
      kind: "linesInserted",
      fromLineNumber: change.fromLineNumber,
      count: change.count
    };
  } else if (change.changeType === RawContentChangedType.LinesDeleted) {
    return {
      kind: "linesDeleted"
    };
  } else if (change.changeType === RawContentChangedType.EOLChanged) {
    return {
      kind: "eolChanged"
    };
  } else if (change.changeType === RawContentChangedType.Flush) {
    return {
      kind: "flush"
    };
  }
  return { kind: "unknown" };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2RlbC9tb2RlbEluamVjdGVkVGV4dC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VFdmVudCwgTW9kZWxJbmplY3RlZFRleHRDaGFuZ2VkRXZlbnQsIE1vZGVsUmF3Q2hhbmdlLCBSYXdDb250ZW50Q2hhbmdlZFR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGV4dE1vZGVsRXZlbnRzLmpzJztcbmltcG9ydCB7IElWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uL3Rlc3RUZXh0TW9kZWwuanMnO1xuXG5zdWl0ZSgnRWRpdG9yIE1vZGVsIC0gSW5qZWN0ZWQgVGV4dCBFdmVudHMnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnQmFzaWMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGhpc01vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnRmlyc3QgTGluZVxcblNlY29uZCBMaW5lJykpO1xuXG5cdFx0Y29uc3QgcmVjb3JkZWRDaGFuZ2VzID0gbmV3IEFycmF5PHVua25vd24+KCk7XG5cblx0XHRjb25zdCBzcHlWaWV3TW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElWaWV3TW9kZWw+KCkge1xuXHRcdFx0b3ZlcnJpZGUgb25EaWRDaGFuZ2VDb250ZW50T3JJbmplY3RlZFRleHQoZTogSW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VFdmVudCB8IE1vZGVsSW5qZWN0ZWRUZXh0Q2hhbmdlZEV2ZW50KSB7XG5cdFx0XHRcdGNvbnN0IGNoYW5nZXMgPSAoZSBpbnN0YW5jZW9mIEludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlRXZlbnQgPyBlLnJhd0NvbnRlbnRDaGFuZ2VkRXZlbnQuY2hhbmdlcyA6IGUuY2hhbmdlcyk7XG5cdFx0XHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGNoYW5nZXMpIHtcblx0XHRcdFx0XHRyZWNvcmRlZENoYW5nZXMucHVzaChtYXBDaGFuZ2UoY2hhbmdlKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGVtaXRDb250ZW50Q2hhbmdlRXZlbnQoX2U6IEludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlRXZlbnQgfCBNb2RlbEluamVjdGVkVGV4dENoYW5nZWRFdmVudCk6IHZvaWQgeyB9XG5cdFx0fTtcblx0XHR0aGlzTW9kZWwucmVnaXN0ZXJWaWV3TW9kZWwoc3B5Vmlld01vZGVsKTtcblxuXHRcdC8vIEluaXRpYWwgZGVjb3JhdGlvblxuXHRcdGxldCBkZWNvcmF0aW9ucyA9IHRoaXNNb2RlbC5kZWx0YURlY29yYXRpb25zKFtdLCBbe1xuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRhZnRlcjogeyBjb250ZW50OiAnaW5qZWN0ZWQxJyB9LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QxJyxcblx0XHRcdFx0c2hvd0lmQ29sbGFwc2VkOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSxcblx0XHR9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNvcmRlZENoYW5nZXMuc3BsaWNlKDApLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICdsaW5lQ2hhbmdlZCcsXG5cdFx0XHRcdGxpbmVOdW1iZXI6IDEsXG5cdFx0XHRcdGxpbmVOdW1iZXJQb3N0RWRpdDogMSxcblx0XHRcdH1cblx0XHRdKTtcblxuXHRcdC8vIERlY29yYXRpb24gY2hhbmdlXG5cdFx0ZGVjb3JhdGlvbnMgPSB0aGlzTW9kZWwuZGVsdGFEZWNvcmF0aW9ucyhkZWNvcmF0aW9ucywgW3tcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0YWZ0ZXI6IHsgY29udGVudDogJ2luamVjdGVkMScgfSxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0MScsXG5cdFx0XHRcdHNob3dJZkNvbGxhcHNlZDogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMiwgMSwgMiwgMSksXG5cdFx0fSwge1xuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRhZnRlcjogeyBjb250ZW50OiAnaW5qZWN0ZWQyJyB9LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QyJyxcblx0XHRcdFx0c2hvd0lmQ29sbGFwc2VkOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgyLCAyLCAyLCAyKSxcblx0XHR9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNvcmRlZENoYW5nZXMuc3BsaWNlKDApLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICdsaW5lQ2hhbmdlZCcsXG5cdFx0XHRcdGxpbmVOdW1iZXI6IDEsXG5cdFx0XHRcdGxpbmVOdW1iZXJQb3N0RWRpdDogMSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICdsaW5lQ2hhbmdlZCcsXG5cdFx0XHRcdGxpbmVOdW1iZXI6IDIsXG5cdFx0XHRcdGxpbmVOdW1iZXJQb3N0RWRpdDogMixcblx0XHRcdH1cblx0XHRdKTtcblxuXHRcdC8vIFNpbXBsZSBJbnNlcnRcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5yZXBsYWNlKG5ldyBSYW5nZSgyLCAyLCAyLCAyKSwgJ0hlbGxvJyldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlY29yZGVkQ2hhbmdlcy5zcGxpY2UoMCksIFtcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2xpbmVDaGFuZ2VkJyxcblx0XHRcdFx0bGluZU51bWJlcjogMixcblx0XHRcdFx0bGluZU51bWJlclBvc3RFZGl0OiAyLFxuXHRcdFx0fVxuXHRcdF0pO1xuXG5cdFx0Ly8gTXVsdGktTGluZSBJbnNlcnRcblx0XHR0aGlzTW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKG51bGwsIFtFZGl0T3BlcmF0aW9uLnJlcGxhY2UobmV3IFJhbmdlKDIsIDIsIDIsIDIpLCAnXFxuXFxuXFxuJyldLCBudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRBbGxEZWNvcmF0aW9ucyh1bmRlZmluZWQpLm1hcChkID0+ICh7IGRlc2NyaXB0aW9uOiBkLm9wdGlvbnMuZGVzY3JpcHRpb24sIHJhbmdlOiBkLnJhbmdlLnRvU3RyaW5nKCkgfSkpLCBbe1xuXHRcdFx0J2Rlc2NyaXB0aW9uJzogJ3Rlc3QxJyxcblx0XHRcdCdyYW5nZSc6ICdbMiwxIC0+IDIsMV0nXG5cdFx0fSxcblx0XHR7XG5cdFx0XHQnZGVzY3JpcHRpb24nOiAndGVzdDInLFxuXHRcdFx0J3JhbmdlJzogJ1syLDIgLT4gNSw2XSdcblx0XHR9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNvcmRlZENoYW5nZXMuc3BsaWNlKDApLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICdsaW5lQ2hhbmdlZCcsXG5cdFx0XHRcdGxpbmVOdW1iZXI6IDIsXG5cdFx0XHRcdGxpbmVOdW1iZXJQb3N0RWRpdDogMixcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICdsaW5lc0luc2VydGVkJyxcblx0XHRcdFx0ZnJvbUxpbmVOdW1iZXI6IDMsXG5cdFx0XHRcdGNvdW50OiAzLFxuXHRcdFx0fVxuXHRcdF0pO1xuXG5cblx0XHQvLyBNdWx0aS1MaW5lIFJlcGxhY2Vcblx0XHR0aGlzTW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKG51bGwsIFtFZGl0T3BlcmF0aW9uLnJlcGxhY2UobmV3IFJhbmdlKDMsIDEsIDUsIDEpLCAnXFxuXFxuXFxuXFxuXFxuXFxuXFxuXFxuXFxuXFxuXFxuXFxuXFxuJyldLCBudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlY29yZGVkQ2hhbmdlcy5zcGxpY2UoMCksIFtcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2xpbmVDaGFuZ2VkJyxcblx0XHRcdFx0bGluZU51bWJlcjogNSxcblx0XHRcdFx0bGluZU51bWJlclBvc3RFZGl0OiA1LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2xpbmVDaGFuZ2VkJyxcblx0XHRcdFx0bGluZU51bWJlcjogNCxcblx0XHRcdFx0bGluZU51bWJlclBvc3RFZGl0OiA0LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2xpbmVDaGFuZ2VkJyxcblx0XHRcdFx0bGluZU51bWJlcjogMyxcblx0XHRcdFx0bGluZU51bWJlclBvc3RFZGl0OiAzLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2xpbmVzSW5zZXJ0ZWQnLFxuXHRcdFx0XHRmcm9tTGluZU51bWJlcjogNixcblx0XHRcdFx0Y291bnQ6IDExLFxuXHRcdFx0fVxuXHRcdF0pO1xuXG5cdFx0Ly8gTXVsdGktTGluZSBSZXBsYWNlIHVuZG9cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLnVuZG8oKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlY29yZGVkQ2hhbmdlcy5zcGxpY2UoMCksIFtcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2xpbmVDaGFuZ2VkJyxcblx0XHRcdFx0bGluZU51bWJlcjogMixcblx0XHRcdFx0bGluZU51bWJlclBvc3RFZGl0OiAyLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2xpbmVzRGVsZXRlZCcsXG5cdFx0XHR9XG5cdFx0XSk7XG5cblx0XHR0aGlzTW9kZWwudW5yZWdpc3RlclZpZXdNb2RlbChzcHlWaWV3TW9kZWwpO1xuXHR9KTtcbn0pO1xuXG5mdW5jdGlvbiBtYXBDaGFuZ2UoY2hhbmdlOiBNb2RlbFJhd0NoYW5nZSk6IHVua25vd24ge1xuXHRpZiAoY2hhbmdlLmNoYW5nZVR5cGUgPT09IFJhd0NvbnRlbnRDaGFuZ2VkVHlwZS5MaW5lQ2hhbmdlZCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnbGluZUNoYW5nZWQnLFxuXHRcdFx0bGluZU51bWJlcjogY2hhbmdlLmxpbmVOdW1iZXIsXG5cdFx0XHRsaW5lTnVtYmVyUG9zdEVkaXQ6IGNoYW5nZS5saW5lTnVtYmVyUG9zdEVkaXQsXG5cdFx0fTtcblx0fSBlbHNlIGlmIChjaGFuZ2UuY2hhbmdlVHlwZSA9PT0gUmF3Q29udGVudENoYW5nZWRUeXBlLkxpbmVzSW5zZXJ0ZWQpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2xpbmVzSW5zZXJ0ZWQnLFxuXHRcdFx0ZnJvbUxpbmVOdW1iZXI6IGNoYW5nZS5mcm9tTGluZU51bWJlcixcblx0XHRcdGNvdW50OiBjaGFuZ2UuY291bnQsXG5cdFx0fTtcblx0fSBlbHNlIGlmIChjaGFuZ2UuY2hhbmdlVHlwZSA9PT0gUmF3Q29udGVudENoYW5nZWRUeXBlLkxpbmVzRGVsZXRlZCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnbGluZXNEZWxldGVkJyxcblx0XHR9O1xuXHR9IGVsc2UgaWYgKGNoYW5nZS5jaGFuZ2VUeXBlID09PSBSYXdDb250ZW50Q2hhbmdlZFR5cGUuRU9MQ2hhbmdlZCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnZW9sQ2hhbmdlZCdcblx0XHR9O1xuXHR9IGVsc2UgaWYgKGNoYW5nZS5jaGFuZ2VUeXBlID09PSBSYXdDb250ZW50Q2hhbmdlZFR5cGUuRmx1c2gpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2ZsdXNoJ1xuXHRcdH07XG5cdH1cblx0cmV0dXJuIHsga2luZDogJ3Vua25vd24nIH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlDQUFnRiw2QkFBNkI7QUFFdEgsU0FBUyx1QkFBdUI7QUFFaEMsTUFBTSx1Q0FBdUMsTUFBTTtBQUNsRCxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELE9BQUssU0FBUyxNQUFNO0FBQ25CLFVBQU0sWUFBWSxNQUFNLElBQUksZ0JBQWdCLHlCQUF5QixDQUFDO0FBRXRFLFVB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
