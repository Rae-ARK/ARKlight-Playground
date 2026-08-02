import * as assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { derivedHandleChanges } from "../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { observableCodeEditor } from "../../../browser/observableCodeEditor.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { withTestCodeEditor } from "../testCodeEditor.js";
suite("CodeEditorWidget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function withTestFixture(cb) {
    withEditorSetupTestFixture(void 0, cb);
  }
  function withEditorSetupTestFixture(preSetupCallback, cb) {
    withTestCodeEditor("hello world", {}, (editor, viewModel) => {
      const disposables = new DisposableStore();
      preSetupCallback?.(editor, disposables);
      const obsEditor = observableCodeEditor(editor);
      const log = new Log();
      const derived = derivedHandleChanges(
        {
          changeTracker: {
            createChangeSummary: () => void 0,
            handleChange: (context) => {
              const obsName = observableName(context.changedObservable, obsEditor);
              log.log(`handle change: ${obsName} ${formatChange(context.change)}`);
              return true;
            }
          }
        },
        (reader) => {
          const versionId = obsEditor.versionId.read(reader);
          const selection = obsEditor.selections.read(reader)?.map((s) => s.toString()).join(", ");
          obsEditor.onDidType.read(reader);
          const str = `running derived: selection: ${selection}, value: ${versionId}`;
          log.log(str);
          return str;
        }
      );
      derived.recomputeInitiallyAndOnChange(disposables);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "running derived: selection: [1,1 -> 1,1], value: 1"
      ]);
      cb({ editor, viewModel, log, derived });
      disposables.dispose();
    });
  }
  test("setPosition", () => withTestFixture(({ editor, log }) => {
    editor.setPosition(new Position(1, 2));
    assert.deepStrictEqual(log.getAndClearEntries(), [
      'handle change: editor.selections {"selection":"[1,2 -> 1,2]","modelVersionId":1,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"api","reason":0}',
      "running derived: selection: [1,2 -> 1,2], value: 1"
    ]);
  }));
  test("keyboard.type", () => withTestFixture(({ editor, log }) => {
    editor.trigger("keyboard", "type", { text: "abc" });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      'handle change: editor.onDidType "abc"',
      'handle change: editor.versionId {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
      'handle change: editor.versionId {"changes":[{"range":"[1,2 -> 1,2]","rangeLength":0,"text":"b","rangeOffset":1}],"eol":"\\n","versionId":3,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
      'handle change: editor.versionId {"changes":[{"range":"[1,3 -> 1,3]","rangeLength":0,"text":"c","rangeOffset":2}],"eol":"\\n","versionId":4,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
      'handle change: editor.selections {"selection":"[1,4 -> 1,4]","modelVersionId":4,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
      "running derived: selection: [1,4 -> 1,4], value: 4"
    ]);
  }));
  test("keyboard.type and set position", () => withTestFixture(({ editor, log }) => {
    editor.trigger("keyboard", "type", { text: "abc" });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      'handle change: editor.onDidType "abc"',
      'handle change: editor.versionId {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
      'handle change: editor.versionId {"changes":[{"range":"[1,2 -> 1,2]","rangeLength":0,"text":"b","rangeOffset":1}],"eol":"\\n","versionId":3,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
      'handle change: editor.versionId {"changes":[{"range":"[1,3 -> 1,3]","rangeLength":0,"text":"c","rangeOffset":2}],"eol":"\\n","versionId":4,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
      'handle change: editor.selections {"selection":"[1,4 -> 1,4]","modelVersionId":4,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
      "running derived: selection: [1,4 -> 1,4], value: 4"
    ]);
    editor.setPosition(new Position(1, 5), "test");
    assert.deepStrictEqual(log.getAndClearEntries(), [
      'handle change: editor.selections {"selection":"[1,5 -> 1,5]","modelVersionId":4,"oldSelections":["[1,4 -> 1,4]"],"oldModelVersionId":4,"source":"test","reason":0}',
      "running derived: selection: [1,5 -> 1,5], value: 4"
    ]);
  }));
  test("listener interaction (unforced)", () => {
    let derived;
    let log;
    withEditorSetupTestFixture(
      (editor, disposables) => {
        disposables.add(
          editor.onDidChangeModelContent(() => {
            log.log(">>> before get");
            derived.get();
            log.log("<<< after get");
          })
        );
      },
      (args) => {
        const editor = args.editor;
        derived = args.derived;
        log = args.log;
        editor.trigger("keyboard", "type", { text: "a" });
        assert.deepStrictEqual(log.getAndClearEntries(), [
          ">>> before get",
          "<<< after get",
          'handle change: editor.onDidType "a"',
          'handle change: editor.versionId {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
          'handle change: editor.selections {"selection":"[1,2 -> 1,2]","modelVersionId":2,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
          "running derived: selection: [1,2 -> 1,2], value: 2"
        ]);
      }
    );
  });
  test("listener interaction ()", () => {
    let derived;
    let log;
    withEditorSetupTestFixture(
      (editor, disposables) => {
        disposables.add(
          editor.onDidChangeModelContent(() => {
            log.log(">>> before forceUpdate");
            observableCodeEditor(editor).forceUpdate();
            log.log(">>> before get");
            derived.get();
            log.log("<<< after get");
          })
        );
      },
      (args) => {
        const editor = args.editor;
        derived = args.derived;
        log = args.log;
        editor.trigger("keyboard", "type", { text: "a" });
        assert.deepStrictEqual(log.getAndClearEntries(), [
          ">>> before forceUpdate",
          ">>> before get",
          "handle change: editor.versionId undefined",
          "running derived: selection: [1,2 -> 1,2], value: 2",
          "<<< after get",
          'handle change: editor.onDidType "a"',
          'handle change: editor.versionId {"changes":[{"range":"[1,1 -> 1,1]","rangeLength":0,"text":"a","rangeOffset":0}],"eol":"\\n","versionId":2,"detailedReasons":[{"metadata":{"source":"cursor","kind":"type","detailedSource":"keyboard"}}],"detailedReasonsChangeLengths":[1]}',
          'handle change: editor.selections {"selection":"[1,2 -> 1,2]","modelVersionId":2,"oldSelections":["[1,1 -> 1,1]"],"oldModelVersionId":1,"source":"keyboard","reason":0}',
          "running derived: selection: [1,2 -> 1,2], value: 2"
        ]);
      }
    );
  });
});
class Log {
  constructor() {
    this.entries = [];
  }
  log(message) {
    this.entries.push(message);
  }
  getAndClearEntries() {
    const entries = [...this.entries];
    this.entries.length = 0;
    return entries;
  }
}
function formatChange(change) {
  return JSON.stringify(
    change,
    (key, value) => {
      if (value instanceof Range) {
        return value.toString();
      }
      if (value === false || Array.isArray(value) && value.length === 0) {
        return void 0;
      }
      return value;
    }
  );
}
function observableName(obs, obsEditor) {
  switch (obs) {
    case obsEditor.selections:
      return "editor.selections";
    case obsEditor.versionId:
      return "editor.versionId";
    case obsEditor.onDidType:
      return "editor.onDidType";
    default:
      return "unknown";
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvd2lkZ2V0L29ic2VydmFibGVDb2RlRWRpdG9yLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgZGVyaXZlZEhhbmRsZUNoYW5nZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgT2JzZXJ2YWJsZUNvZGVFZGl0b3IsIG9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9vYnNlcnZhYmxlQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC92aWV3TW9kZWxJbXBsLmpzJztcbmltcG9ydCB7IHdpdGhUZXN0Q29kZUVkaXRvciB9IGZyb20gJy4uL3Rlc3RDb2RlRWRpdG9yLmpzJztcblxuc3VpdGUoJ0NvZGVFZGl0b3JXaWRnZXQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHdpdGhUZXN0Rml4dHVyZShcblx0XHRjYjogKGFyZ3M6IHsgZWRpdG9yOiBJQ29kZUVkaXRvcjsgdmlld01vZGVsOiBWaWV3TW9kZWw7IGxvZzogTG9nOyBkZXJpdmVkOiBJT2JzZXJ2YWJsZTxzdHJpbmc+IH0pID0+IHZvaWRcblx0KSB7XG5cdFx0d2l0aEVkaXRvclNldHVwVGVzdEZpeHR1cmUodW5kZWZpbmVkLCBjYik7XG5cdH1cblxuXHRmdW5jdGlvbiB3aXRoRWRpdG9yU2V0dXBUZXN0Rml4dHVyZShcblx0XHRwcmVTZXR1cENhbGxiYWNrOlxuXHRcdFx0fCAoKGVkaXRvcjogSUNvZGVFZGl0b3IsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpID0+IHZvaWQpXG5cdFx0XHR8IHVuZGVmaW5lZCxcblx0XHRjYjogKGFyZ3M6IHsgZWRpdG9yOiBJQ29kZUVkaXRvcjsgdmlld01vZGVsOiBWaWV3TW9kZWw7IGxvZzogTG9nOyBkZXJpdmVkOiBJT2JzZXJ2YWJsZTxzdHJpbmc+IH0pID0+IHZvaWRcblx0KSB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKCdoZWxsbyB3b3JsZCcsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0cHJlU2V0dXBDYWxsYmFjaz8uKGVkaXRvciwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0Y29uc3Qgb2JzRWRpdG9yID0gb2JzZXJ2YWJsZUNvZGVFZGl0b3IoZWRpdG9yKTtcblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblxuXHRcdFx0Y29uc3QgZGVyaXZlZCA9IGRlcml2ZWRIYW5kbGVDaGFuZ2VzKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y2hhbmdlVHJhY2tlcjoge1xuXHRcdFx0XHRcdFx0Y3JlYXRlQ2hhbmdlU3VtbWFyeTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0aGFuZGxlQ2hhbmdlOiAoY29udGV4dCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBvYnNOYW1lID0gb2JzZXJ2YWJsZU5hbWUoY29udGV4dC5jaGFuZ2VkT2JzZXJ2YWJsZSwgb2JzRWRpdG9yKTtcblxuXHRcdFx0XHRcdFx0XHRsb2cubG9nKGBoYW5kbGUgY2hhbmdlOiAke29ic05hbWV9ICR7Zm9ybWF0Q2hhbmdlKGNvbnRleHQuY2hhbmdlKX1gKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdChyZWFkZXIpID0+IHtcblx0XHRcdFx0XHRjb25zdCB2ZXJzaW9uSWQgPSBvYnNFZGl0b3IudmVyc2lvbklkLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBvYnNFZGl0b3Iuc2VsZWN0aW9ucy5yZWFkKHJlYWRlcik/Lm1hcCgocykgPT4gcy50b1N0cmluZygpKS5qb2luKCcsICcpO1xuXHRcdFx0XHRcdG9ic0VkaXRvci5vbkRpZFR5cGUucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRcdFx0Y29uc3Qgc3RyID0gYHJ1bm5pbmcgZGVyaXZlZDogc2VsZWN0aW9uOiAke3NlbGVjdGlvbn0sIHZhbHVlOiAke3ZlcnNpb25JZH1gO1xuXHRcdFx0XHRcdGxvZy5sb2coc3RyKTtcblx0XHRcdFx0XHRyZXR1cm4gc3RyO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHRkZXJpdmVkLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKGRpc3Bvc2FibGVzKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdydW5uaW5nIGRlcml2ZWQ6IHNlbGVjdGlvbjogWzEsMSAtPiAxLDFdLCB2YWx1ZTogMScsXG5cdFx0XHRdKTtcblxuXHRcdFx0Y2IoeyBlZGl0b3IsIHZpZXdNb2RlbCwgbG9nLCBkZXJpdmVkIH0pO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHR0ZXN0KCdzZXRQb3NpdGlvbicsICgpID0+XG5cdFx0d2l0aFRlc3RGaXh0dXJlKCh7IGVkaXRvciwgbG9nIH0pID0+IHtcblx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMikpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFtcblx0XHRcdFx0J2hhbmRsZSBjaGFuZ2U6IGVkaXRvci5zZWxlY3Rpb25zIHtcInNlbGVjdGlvblwiOlwiWzEsMiAtPiAxLDJdXCIsXCJtb2RlbFZlcnNpb25JZFwiOjEsXCJvbGRTZWxlY3Rpb25zXCI6W1wiWzEsMSAtPiAxLDFdXCJdLFwib2xkTW9kZWxWZXJzaW9uSWRcIjoxLFwic291cmNlXCI6XCJhcGlcIixcInJlYXNvblwiOjB9Jyxcblx0XHRcdFx0J3J1bm5pbmcgZGVyaXZlZDogc2VsZWN0aW9uOiBbMSwyIC0+IDEsMl0sIHZhbHVlOiAxJ1xuXHRcdFx0XSkpO1xuXHRcdH0pKTtcblxuXHR0ZXN0KCdrZXlib2FyZC50eXBlJywgKCkgPT5cblx0XHR3aXRoVGVzdEZpeHR1cmUoKHsgZWRpdG9yLCBsb2cgfSkgPT4ge1xuXHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgJ3R5cGUnLCB7IHRleHQ6ICdhYmMnIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFtcblx0XHRcdFx0J2hhbmRsZSBjaGFuZ2U6IGVkaXRvci5vbkRpZFR5cGUgXCJhYmNcIicsXG5cdFx0XHRcdCdoYW5kbGUgY2hhbmdlOiBlZGl0b3IudmVyc2lvbklkIHtcImNoYW5nZXNcIjpbe1wicmFuZ2VcIjpcIlsxLDEgLT4gMSwxXVwiLFwicmFuZ2VMZW5ndGhcIjowLFwidGV4dFwiOlwiYVwiLFwicmFuZ2VPZmZzZXRcIjowfV0sXCJlb2xcIjpcIlxcXFxuXCIsXCJ2ZXJzaW9uSWRcIjoyLFwiZGV0YWlsZWRSZWFzb25zXCI6W3tcIm1ldGFkYXRhXCI6e1wic291cmNlXCI6XCJjdXJzb3JcIixcImtpbmRcIjpcInR5cGVcIixcImRldGFpbGVkU291cmNlXCI6XCJrZXlib2FyZFwifX1dLFwiZGV0YWlsZWRSZWFzb25zQ2hhbmdlTGVuZ3Roc1wiOlsxXX0nLFxuXHRcdFx0XHQnaGFuZGxlIGNoYW5nZTogZWRpdG9yLnZlcnNpb25JZCB7XCJjaGFuZ2VzXCI6W3tcInJhbmdlXCI6XCJbMSwyIC0+IDEsMl1cIixcInJhbmdlTGVuZ3RoXCI6MCxcInRleHRcIjpcImJcIixcInJhbmdlT2Zmc2V0XCI6MX1dLFwiZW9sXCI6XCJcXFxcblwiLFwidmVyc2lvbklkXCI6MyxcImRldGFpbGVkUmVhc29uc1wiOlt7XCJtZXRhZGF0YVwiOntcInNvdXJjZVwiOlwiY3Vyc29yXCIsXCJraW5kXCI6XCJ0eXBlXCIsXCJkZXRhaWxlZFNvdXJjZVwiOlwia2V5Ym9hcmRcIn19XSxcImRldGFpbGVkUmVhc29uc0NoYW5nZUxlbmd0aHNcIjpbMV19Jyxcblx0XHRcdFx0J2hhbmRsZSBjaGFuZ2U6IGVkaXRvci52ZXJzaW9uSWQge1wiY2hhbmdlc1wiOlt7XCJyYW5nZVwiOlwiWzEsMyAtPiAxLDNdXCIsXCJyYW5nZUxlbmd0aFwiOjAsXCJ0ZXh0XCI6XCJjXCIsXCJyYW5nZU9mZnNldFwiOjJ9XSxcImVvbFwiOlwiXFxcXG5cIixcInZlcnNpb25JZFwiOjQsXCJkZXRhaWxlZFJlYXNvbnNcIjpbe1wibWV0YWRhdGFcIjp7XCJzb3VyY2VcIjpcImN1cnNvclwiLFwia2luZFwiOlwidHlwZVwiLFwiZGV0YWlsZWRTb3VyY2VcIjpcImtleWJvYXJkXCJ9fV0sXCJkZXRhaWxlZFJlYXNvbnNDaGFuZ2VMZW5ndGhzXCI6WzFdfScsXG5cdFx0XHRcdCdoYW5kbGUgY2hhbmdlOiBlZGl0b3Iuc2VsZWN0aW9ucyB7XCJzZWxlY3Rpb25cIjpcIlsxLDQgLT4gMSw0XVwiLFwibW9kZWxWZXJzaW9uSWRcIjo0LFwib2xkU2VsZWN0aW9uc1wiOltcIlsxLDEgLT4gMSwxXVwiXSxcIm9sZE1vZGVsVmVyc2lvbklkXCI6MSxcInNvdXJjZVwiOlwia2V5Ym9hcmRcIixcInJlYXNvblwiOjB9Jyxcblx0XHRcdFx0J3J1bm5pbmcgZGVyaXZlZDogc2VsZWN0aW9uOiBbMSw0IC0+IDEsNF0sIHZhbHVlOiA0J1xuXHRcdFx0XSkpO1xuXHRcdH0pKTtcblxuXHR0ZXN0KCdrZXlib2FyZC50eXBlIGFuZCBzZXQgcG9zaXRpb24nLCAoKSA9PlxuXHRcdHdpdGhUZXN0Rml4dHVyZSgoeyBlZGl0b3IsIGxvZyB9KSA9PiB7XG5cdFx0XHRlZGl0b3IudHJpZ2dlcigna2V5Ym9hcmQnLCAndHlwZScsIHsgdGV4dDogJ2FiYycgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoW1xuXHRcdFx0XHQnaGFuZGxlIGNoYW5nZTogZWRpdG9yLm9uRGlkVHlwZSBcImFiY1wiJyxcblx0XHRcdFx0J2hhbmRsZSBjaGFuZ2U6IGVkaXRvci52ZXJzaW9uSWQge1wiY2hhbmdlc1wiOlt7XCJyYW5nZVwiOlwiWzEsMSAtPiAxLDFdXCIsXCJyYW5nZUxlbmd0aFwiOjAsXCJ0ZXh0XCI6XCJhXCIsXCJyYW5nZU9mZnNldFwiOjB9XSxcImVvbFwiOlwiXFxcXG5cIixcInZlcnNpb25JZFwiOjIsXCJkZXRhaWxlZFJlYXNvbnNcIjpbe1wibWV0YWRhdGFcIjp7XCJzb3VyY2VcIjpcImN1cnNvclwiLFwia2luZFwiOlwidHlwZVwiLFwiZGV0YWlsZWRTb3VyY2VcIjpcImtleWJvYXJkXCJ9fV0sXCJkZXRhaWxlZFJlYXNvbnNDaGFuZ2VMZW5ndGhzXCI6WzFdfScsXG5cdFx0XHRcdCdoYW5kbGUgY2hhbmdlOiBlZGl0b3IudmVyc2lvbklkIHtcImNoYW5nZXNcIjpbe1wicmFuZ2VcIjpcIlsxLDIgLT4gMSwyXVwiLFwicmFuZ2VMZW5ndGhcIjowLFwidGV4dFwiOlwiYlwiLFwicmFuZ2VPZmZzZXRcIjoxfV0sXCJlb2xcIjpcIlxcXFxuXCIsXCJ2ZXJzaW9uSWRcIjozLFwiZGV0YWlsZWRSZWFzb25zXCI6W3tcIm1ldGFkYXRhXCI6e1wic291cmNlXCI6XCJjdXJzb3JcIixcImtpbmRcIjpcInR5cGVcIixcImRldGFpbGVkU291cmNlXCI6XCJrZXlib2FyZFwifX1dLFwiZGV0YWlsZWRSZWFzb25zQ2hhbmdlTGVuZ3Roc1wiOlsxXX0nLFxuXHRcdFx0XHQnaGFuZGxlIGNoYW5nZTogZWRpdG9yLnZlcnNpb25JZCB7XCJjaGFuZ2VzXCI6W3tcInJhbmdlXCI6XCJbMSwzIC0+IDEsM11cIixcInJhbmdlTGVuZ3RoXCI6MCxcInRleHRcIjpcImNcIixcInJhbmdlT2Zmc2V0XCI6Mn1dLFwiZW9sXCI6XCJcXFxcblwiLFwidmVyc2lvbklkXCI6NCxcImRldGFpbGVkUmVhc29uc1wiOlt7XCJtZXRhZGF0YVwiOntcInNvdXJjZVwiOlwiY3Vyc29yXCIsXCJraW5kXCI6XCJ0eXBlXCIsXCJkZXRhaWxlZFNvdXJjZVwiOlwia2V5Ym9hcmRcIn19XSxcImRldGFpbGVkUmVhc29uc0NoYW5nZUxlbmd0aHNcIjpbMV19Jyxcblx0XHRcdFx0J2hhbmRsZSBjaGFuZ2U6IGVkaXRvci5zZWxlY3Rpb25zIHtcInNlbGVjdGlvblwiOlwiWzEsNCAtPiAxLDRdXCIsXCJtb2RlbFZlcnNpb25JZFwiOjQsXCJvbGRTZWxlY3Rpb25zXCI6W1wiWzEsMSAtPiAxLDFdXCJdLFwib2xkTW9kZWxWZXJzaW9uSWRcIjoxLFwic291cmNlXCI6XCJrZXlib2FyZFwiLFwicmVhc29uXCI6MH0nLFxuXHRcdFx0XHQncnVubmluZyBkZXJpdmVkOiBzZWxlY3Rpb246IFsxLDQgLT4gMSw0XSwgdmFsdWU6IDQnXG5cdFx0XHRdKSk7XG5cblx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNSksICd0ZXN0Jyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoW1xuXHRcdFx0XHQnaGFuZGxlIGNoYW5nZTogZWRpdG9yLnNlbGVjdGlvbnMge1wic2VsZWN0aW9uXCI6XCJbMSw1IC0+IDEsNV1cIixcIm1vZGVsVmVyc2lvbklkXCI6NCxcIm9sZFNlbGVjdGlvbnNcIjpbXCJbMSw0IC0+IDEsNF1cIl0sXCJvbGRNb2RlbFZlcnNpb25JZFwiOjQsXCJzb3VyY2VcIjpcInRlc3RcIixcInJlYXNvblwiOjB9Jyxcblx0XHRcdFx0J3J1bm5pbmcgZGVyaXZlZDogc2VsZWN0aW9uOiBbMSw1IC0+IDEsNV0sIHZhbHVlOiA0J1xuXHRcdFx0XSkpO1xuXHRcdH0pKTtcblxuXHR0ZXN0KCdsaXN0ZW5lciBpbnRlcmFjdGlvbiAodW5mb3JjZWQpJywgKCkgPT4ge1xuXHRcdGxldCBkZXJpdmVkOiBJT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXHRcdGxldCBsb2c6IExvZztcblx0XHR3aXRoRWRpdG9yU2V0dXBUZXN0Rml4dHVyZShcblx0XHRcdChlZGl0b3IsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChcblx0XHRcdFx0XHRlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0bG9nLmxvZygnPj4+IGJlZm9yZSBnZXQnKTtcblx0XHRcdFx0XHRcdGRlcml2ZWQuZ2V0KCk7XG5cdFx0XHRcdFx0XHRsb2cubG9nKCc8PDwgYWZ0ZXIgZ2V0Jyk7XG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0KTtcblx0XHRcdH0sXG5cdFx0XHQoYXJncykgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3IgPSBhcmdzLmVkaXRvcjtcblx0XHRcdFx0ZGVyaXZlZCA9IGFyZ3MuZGVyaXZlZDtcblx0XHRcdFx0bG9nID0gYXJncy5sb2c7XG5cblx0XHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgJ3R5cGUnLCB7IHRleHQ6ICdhJyB9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbXG5cdFx0XHRcdFx0Jz4+PiBiZWZvcmUgZ2V0Jyxcblx0XHRcdFx0XHQnPDw8IGFmdGVyIGdldCcsXG5cdFx0XHRcdFx0J2hhbmRsZSBjaGFuZ2U6IGVkaXRvci5vbkRpZFR5cGUgXCJhXCInLFxuXHRcdFx0XHRcdCdoYW5kbGUgY2hhbmdlOiBlZGl0b3IudmVyc2lvbklkIHtcImNoYW5nZXNcIjpbe1wicmFuZ2VcIjpcIlsxLDEgLT4gMSwxXVwiLFwicmFuZ2VMZW5ndGhcIjowLFwidGV4dFwiOlwiYVwiLFwicmFuZ2VPZmZzZXRcIjowfV0sXCJlb2xcIjpcIlxcXFxuXCIsXCJ2ZXJzaW9uSWRcIjoyLFwiZGV0YWlsZWRSZWFzb25zXCI6W3tcIm1ldGFkYXRhXCI6e1wic291cmNlXCI6XCJjdXJzb3JcIixcImtpbmRcIjpcInR5cGVcIixcImRldGFpbGVkU291cmNlXCI6XCJrZXlib2FyZFwifX1dLFwiZGV0YWlsZWRSZWFzb25zQ2hhbmdlTGVuZ3Roc1wiOlsxXX0nLFxuXHRcdFx0XHRcdCdoYW5kbGUgY2hhbmdlOiBlZGl0b3Iuc2VsZWN0aW9ucyB7XCJzZWxlY3Rpb25cIjpcIlsxLDIgLT4gMSwyXVwiLFwibW9kZWxWZXJzaW9uSWRcIjoyLFwib2xkU2VsZWN0aW9uc1wiOltcIlsxLDEgLT4gMSwxXVwiXSxcIm9sZE1vZGVsVmVyc2lvbklkXCI6MSxcInNvdXJjZVwiOlwia2V5Ym9hcmRcIixcInJlYXNvblwiOjB9Jyxcblx0XHRcdFx0XHQncnVubmluZyBkZXJpdmVkOiBzZWxlY3Rpb246IFsxLDIgLT4gMSwyXSwgdmFsdWU6IDInXG5cdFx0XHRcdF0pKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0ZW5lciBpbnRlcmFjdGlvbiAoKScsICgpID0+IHtcblx0XHRsZXQgZGVyaXZlZDogSU9ic2VydmFibGU8c3RyaW5nPjtcblx0XHRsZXQgbG9nOiBMb2c7XG5cdFx0d2l0aEVkaXRvclNldHVwVGVzdEZpeHR1cmUoXG5cdFx0XHQoZWRpdG9yLCBkaXNwb3NhYmxlcykgPT4ge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoXG5cdFx0XHRcdFx0ZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHtcblx0XHRcdFx0XHRcdGxvZy5sb2coJz4+PiBiZWZvcmUgZm9yY2VVcGRhdGUnKTtcblx0XHRcdFx0XHRcdG9ic2VydmFibGVDb2RlRWRpdG9yKGVkaXRvcikuZm9yY2VVcGRhdGUoKTtcblxuXHRcdFx0XHRcdFx0bG9nLmxvZygnPj4+IGJlZm9yZSBnZXQnKTtcblx0XHRcdFx0XHRcdGRlcml2ZWQuZ2V0KCk7XG5cdFx0XHRcdFx0XHRsb2cubG9nKCc8PDwgYWZ0ZXIgZ2V0Jyk7XG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0KTtcblx0XHRcdH0sXG5cdFx0XHQoYXJncykgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3IgPSBhcmdzLmVkaXRvcjtcblx0XHRcdFx0ZGVyaXZlZCA9IGFyZ3MuZGVyaXZlZDtcblx0XHRcdFx0bG9nID0gYXJncy5sb2c7XG5cblx0XHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgJ3R5cGUnLCB7IHRleHQ6ICdhJyB9KTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFtcblx0XHRcdFx0XHQnPj4+IGJlZm9yZSBmb3JjZVVwZGF0ZScsXG5cdFx0XHRcdFx0Jz4+PiBiZWZvcmUgZ2V0Jyxcblx0XHRcdFx0XHQnaGFuZGxlIGNoYW5nZTogZWRpdG9yLnZlcnNpb25JZCB1bmRlZmluZWQnLFxuXHRcdFx0XHRcdCdydW5uaW5nIGRlcml2ZWQ6IHNlbGVjdGlvbjogWzEsMiAtPiAxLDJdLCB2YWx1ZTogMicsXG5cdFx0XHRcdFx0Jzw8PCBhZnRlciBnZXQnLFxuXHRcdFx0XHRcdCdoYW5kbGUgY2hhbmdlOiBlZGl0b3Iub25EaWRUeXBlIFwiYVwiJyxcblx0XHRcdFx0XHQnaGFuZGxlIGNoYW5nZTogZWRpdG9yLnZlcnNpb25JZCB7XCJjaGFuZ2VzXCI6W3tcInJhbmdlXCI6XCJbMSwxIC0+IDEsMV1cIixcInJhbmdlTGVuZ3RoXCI6MCxcInRleHRcIjpcImFcIixcInJhbmdlT2Zmc2V0XCI6MH1dLFwiZW9sXCI6XCJcXFxcblwiLFwidmVyc2lvbklkXCI6MixcImRldGFpbGVkUmVhc29uc1wiOlt7XCJtZXRhZGF0YVwiOntcInNvdXJjZVwiOlwiY3Vyc29yXCIsXCJraW5kXCI6XCJ0eXBlXCIsXCJkZXRhaWxlZFNvdXJjZVwiOlwia2V5Ym9hcmRcIn19XSxcImRldGFpbGVkUmVhc29uc0NoYW5nZUxlbmd0aHNcIjpbMV19Jyxcblx0XHRcdFx0XHQnaGFuZGxlIGNoYW5nZTogZWRpdG9yLnNlbGVjdGlvbnMge1wic2VsZWN0aW9uXCI6XCJbMSwyIC0+IDEsMl1cIixcIm1vZGVsVmVyc2lvbklkXCI6MixcIm9sZFNlbGVjdGlvbnNcIjpbXCJbMSwxIC0+IDEsMV1cIl0sXCJvbGRNb2RlbFZlcnNpb25JZFwiOjEsXCJzb3VyY2VcIjpcImtleWJvYXJkXCIsXCJyZWFzb25cIjowfScsXG5cdFx0XHRcdFx0J3J1bm5pbmcgZGVyaXZlZDogc2VsZWN0aW9uOiBbMSwyIC0+IDEsMl0sIHZhbHVlOiAyJ1xuXHRcdFx0XHRdKSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG59KTtcblxuY2xhc3MgTG9nIHtcblx0cHJpdmF0ZSByZWFkb25seSBlbnRyaWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRwdWJsaWMgbG9nKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuZW50cmllcy5wdXNoKG1lc3NhZ2UpO1xuXHR9XG5cblx0cHVibGljIGdldEFuZENsZWFyRW50cmllcygpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgZW50cmllcyA9IFsuLi50aGlzLmVudHJpZXNdO1xuXHRcdHRoaXMuZW50cmllcy5sZW5ndGggPSAwO1xuXHRcdHJldHVybiBlbnRyaWVzO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGZvcm1hdENoYW5nZShjaGFuZ2U6IHVua25vd24pIHtcblx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KFxuXHRcdGNoYW5nZSxcblx0XHQoa2V5LCB2YWx1ZSkgPT4ge1xuXHRcdFx0aWYgKHZhbHVlIGluc3RhbmNlb2YgUmFuZ2UpIHtcblx0XHRcdFx0cmV0dXJuIHZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoXG5cdFx0XHRcdHZhbHVlID09PSBmYWxzZSB8fFxuXHRcdFx0XHQoQXJyYXkuaXNBcnJheSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSAwKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fVxuXHQpO1xufVxuXG5mdW5jdGlvbiBvYnNlcnZhYmxlTmFtZShvYnM6IElPYnNlcnZhYmxlPGFueT4sIG9ic0VkaXRvcjogT2JzZXJ2YWJsZUNvZGVFZGl0b3IpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKG9icykge1xuXHRcdGNhc2Ugb2JzRWRpdG9yLnNlbGVjdGlvbnM6XG5cdFx0XHRyZXR1cm4gJ2VkaXRvci5zZWxlY3Rpb25zJztcblx0XHRjYXNlIG9ic0VkaXRvci52ZXJzaW9uSWQ6XG5cdFx0XHRyZXR1cm4gJ2VkaXRvci52ZXJzaW9uSWQnO1xuXHRcdGNhc2Ugb2JzRWRpdG9yLm9uRGlkVHlwZTpcblx0XHRcdHJldHVybiAnZWRpdG9yLm9uRGlkVHlwZSc7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiAndW5rbm93bic7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFzQiw0QkFBNEI7QUFDbEQsU0FBUywrQ0FBK0M7QUFFeEQsU0FBK0IsNEJBQTRCO0FBQzNELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUV0QixTQUFTLDBCQUEwQjtBQUVuQyxNQUFNLG9CQUFvQixNQUFNO0FBQy9CLDBDQUF3QztBQUV4QyxXQUFTLGdCQUNSLElBQ0M7QUFDRCwrQkFBMkIsUUFBVyxFQUFFO0FBQUEsRUFDekM7QUFFQSxXQUFTLDJCQUNSLGtCQUdBLElBQ0M7QUFDRCx1QkFBbUIsZUFBZSxDQUFDLEdBQUcsQ0FBQyxRQUFRLGNBQWM7QUFDNUQsWUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLHlCQUFtQixRQUFRLFdBQVc7QUFDdEMsWUFBTSxZQUFZLHFCQUFxQixNQUFNO0FBQzdDLFlBQU0sTUFBTSxJQUFJLElBQUk7QUFFcEIsWUFBTSxVQUFVO0FBQUEsUUFDZjtBQUFBLFVBQ0MsZUFBZTtBQUFBLFlBQ2QscUJBQXFCLE1BQU07QUFBQSxZQUMzQixjQUFjLENBQUMsWUFBWTtBQUMxQixvQkFBTSxVQUFVLGVBQWUsUUFBUSxtQkFBbUIsU0FBUztBQUVuRSxrQkFBSSxJQUFJLGtCQUFrQixPQUFPLElBQUksYUFBYSxRQUFRLE1BQU0sQ0FBQyxFQUFFO0FBQ25FLHFCQUFPO0FBQUEsWUFDUjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQSxDQUFDLFdBQVc7QUFDWCxnQkFBTSxZQUFZLFVBQVUsVUFBVSxLQUFLLE1BQU07QUFDakQsZ0JBQU0sWUFBWSxVQUFVLFdBQVcsS0FBSyxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsRUFBRSxLQUFLLElBQUk7QUFDdkYsb0JBQVUsVUFBVSxLQUFLLE1BQU07QUFFL0IsZ0JBQU0sTUFBTSwrQkFBK0IsU0FBUyxZQUFZLFNBQVM7QUFDekUsY0FBSSxJQUFJLEdBQUc7QUFDWCxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBRUEsY0FBUSw4QkFBOEIsV0FBVztBQUNqRCxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxNQUNELENBQUM7QUFFRCxTQUFHLEVBQUUsUUFBUSxXQUFXLEtBQUssUUFBUSxDQUFDO0FBRXRDLGtCQUFZLFFBQVE7QUFBQSxJQUNyQixDQUFDO0FBQUEsRUFDRjtBQUVBLE9BQUssZUFBZSxNQUNuQixnQkFBZ0IsQ0FBQyxFQUFFLFFBQVEsSUFBSSxNQUFNO0FBQ3BDLFdBQU8sWUFBWSxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFFckMsV0FBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBSTtBQUFBLE1BQ2pEO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBRTtBQUFBLEVBQ0gsQ0FBQyxDQUFDO0FBRUgsT0FBSyxpQkFBaUIsTUFDckIsZ0JBQWdCLENBQUMsRUFBRSxRQUFRLElBQUksTUFBTTtBQUNwQyxXQUFPLFFBQVEsWUFBWSxRQUFRLEVBQUUsTUFBTSxNQUFNLENBQUM7QUFFbEQsV0FBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBSTtBQUFBLE1BQ2pEO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUU7QUFBQSxFQUNILENBQUMsQ0FBQztBQUVILE9BQUssa0NBQWtDLE1BQ3RDLGdCQUFnQixDQUFDLEVBQUUsUUFBUSxJQUFJLE1BQU07QUFDcEMsV0FBTyxRQUFRLFlBQVksUUFBUSxFQUFFLE1BQU0sTUFBTSxDQUFDO0FBRWxELFdBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUk7QUFBQSxNQUNqRDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFFO0FBRUYsV0FBTyxZQUFZLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxNQUFNO0FBRTdDLFdBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUk7QUFBQSxNQUNqRDtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUU7QUFBQSxFQUNILENBQUMsQ0FBQztBQUVILE9BQUssbUNBQW1DLE1BQU07QUFDN0MsUUFBSTtBQUNKLFFBQUk7QUFDSjtBQUFBLE1BQ0MsQ0FBQyxRQUFRLGdCQUFnQjtBQUN4QixvQkFBWTtBQUFBLFVBQ1gsT0FBTyx3QkFBd0IsTUFBTTtBQUNwQyxnQkFBSSxJQUFJLGdCQUFnQjtBQUN4QixvQkFBUSxJQUFJO0FBQ1osZ0JBQUksSUFBSSxlQUFlO0FBQUEsVUFDeEIsQ0FBQztBQUFBLFFBQ0Y7QUFBQSxNQUNEO0FBQUEsTUFDQSxDQUFDLFNBQVM7QUFDVCxjQUFNLFNBQVMsS0FBSztBQUNwQixrQkFBVSxLQUFLO0FBQ2YsY0FBTSxLQUFLO0FBRVgsZUFBTyxRQUFRLFlBQVksUUFBUSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ2hELGVBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUk7QUFBQSxVQUNqRDtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRCxDQUFFO0FBQUEsTUFDSDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDJCQUEyQixNQUFNO0FBQ3JDLFFBQUk7QUFDSixRQUFJO0FBQ0o7QUFBQSxNQUNDLENBQUMsUUFBUSxnQkFBZ0I7QUFDeEIsb0JBQVk7QUFBQSxVQUNYLE9BQU8sd0JBQXdCLE1BQU07QUFDcEMsZ0JBQUksSUFBSSx3QkFBd0I7QUFDaEMsaUNBQXFCLE1BQU0sRUFBRSxZQUFZO0FBRXpDLGdCQUFJLElBQUksZ0JBQWdCO0FBQ3hCLG9CQUFRLElBQUk7QUFDWixnQkFBSSxJQUFJLGVBQWU7QUFBQSxVQUN4QixDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLENBQUMsU0FBUztBQUNULGNBQU0sU0FBUyxLQUFLO0FBQ3BCLGtCQUFVLEtBQUs7QUFDZixjQUFNLEtBQUs7QUFFWCxlQUFPLFFBQVEsWUFBWSxRQUFRLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFFaEQsZUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBSTtBQUFBLFVBQ2pEO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNELENBQUU7QUFBQSxNQUNIO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLElBQUk7QUFBQSxFQUFWO0FBQ0MsU0FBaUIsVUFBb0IsQ0FBQztBQUFBO0FBQUEsRUFDL0IsSUFBSSxTQUF1QjtBQUNqQyxTQUFLLFFBQVEsS0FBSyxPQUFPO0FBQUEsRUFDMUI7QUFBQSxFQUVPLHFCQUErQjtBQUNyQyxVQUFNLFVBQVUsQ0FBQyxHQUFHLEtBQUssT0FBTztBQUNoQyxTQUFLLFFBQVEsU0FBUztBQUN0QixXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRUEsU0FBUyxhQUFhLFFBQWlCO0FBQ3RDLFNBQU8sS0FBSztBQUFBLElBQ1g7QUFBQSxJQUNBLENBQUMsS0FBSyxVQUFVO0FBQ2YsVUFBSSxpQkFBaUIsT0FBTztBQUMzQixlQUFPLE1BQU0sU0FBUztBQUFBLE1BQ3ZCO0FBQ0EsVUFDQyxVQUFVLFNBQ1QsTUFBTSxRQUFRLEtBQUssS0FBSyxNQUFNLFdBQVcsR0FDekM7QUFDRCxlQUFPO0FBQUEsTUFDUjtBQUNBLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUNEO0FBRUEsU0FBUyxlQUFlLEtBQXVCLFdBQXlDO0FBQ3ZGLFVBQVEsS0FBSztBQUFBLElBQ1osS0FBSyxVQUFVO0FBQ2QsYUFBTztBQUFBLElBQ1IsS0FBSyxVQUFVO0FBQ2QsYUFBTztBQUFBLElBQ1IsS0FBSyxVQUFVO0FBQ2QsYUFBTztBQUFBLElBQ1I7QUFDQyxhQUFPO0FBQUEsRUFDVDtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
