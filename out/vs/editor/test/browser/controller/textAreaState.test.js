import assert from "assert";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TextAreaState } from "../../../browser/controller/editContext/textArea/textAreaEditContextState.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { createTextModel } from "../../common/testTextModel.js";
import { SimplePagedScreenReaderStrategy } from "../../../browser/controller/editContext/screenReaderUtils.js";
class MockTextAreaWrapper extends Disposable {
  constructor() {
    super();
    this._value = "";
    this._selectionStart = 0;
    this._selectionEnd = 0;
  }
  getValue() {
    return this._value;
  }
  setValue(reason, value) {
    this._value = value;
    this._selectionStart = this._value.length;
    this._selectionEnd = this._value.length;
  }
  getSelectionStart() {
    return this._selectionStart;
  }
  getSelectionEnd() {
    return this._selectionEnd;
  }
  setSelectionRange(reason, selectionStart, selectionEnd) {
    if (selectionStart < 0) {
      selectionStart = 0;
    }
    if (selectionStart > this._value.length) {
      selectionStart = this._value.length;
    }
    if (selectionEnd < 0) {
      selectionEnd = 0;
    }
    if (selectionEnd > this._value.length) {
      selectionEnd = this._value.length;
    }
    this._selectionStart = selectionStart;
    this._selectionEnd = selectionEnd;
  }
}
function equalsTextAreaState(a, b) {
  return a.value === b.value && a.selectionStart === b.selectionStart && a.selectionEnd === b.selectionEnd && Range.equalsRange(a.selection, b.selection) && a.newlineCountBeforeSelection === b.newlineCountBeforeSelection;
}
suite("TextAreaState", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertTextAreaState(actual, value, selectionStart, selectionEnd) {
    const desired = new TextAreaState(value, selectionStart, selectionEnd, null, void 0);
    assert.ok(equalsTextAreaState(desired, actual), desired.toString() + " == " + actual.toString());
  }
  test("fromTextArea", () => {
    const textArea = new MockTextAreaWrapper();
    textArea._value = "Hello world!";
    textArea._selectionStart = 1;
    textArea._selectionEnd = 12;
    let actual = TextAreaState.readFromTextArea(textArea, null);
    assertTextAreaState(actual, "Hello world!", 1, 12);
    assert.strictEqual(actual.value, "Hello world!");
    assert.strictEqual(actual.selectionStart, 1);
    actual = actual.collapseSelection();
    assertTextAreaState(actual, "Hello world!", 12, 12);
    textArea.dispose();
  });
  test("applyToTextArea", () => {
    const textArea = new MockTextAreaWrapper();
    textArea._value = "Hello world!";
    textArea._selectionStart = 1;
    textArea._selectionEnd = 12;
    let state = new TextAreaState("Hi world!", 2, 2, null, void 0);
    state.writeToTextArea("test", textArea, false);
    assert.strictEqual(textArea._value, "Hi world!");
    assert.strictEqual(textArea._selectionStart, 9);
    assert.strictEqual(textArea._selectionEnd, 9);
    state = new TextAreaState("Hi world!", 3, 3, null, void 0);
    state.writeToTextArea("test", textArea, false);
    assert.strictEqual(textArea._value, "Hi world!");
    assert.strictEqual(textArea._selectionStart, 9);
    assert.strictEqual(textArea._selectionEnd, 9);
    state = new TextAreaState("Hi world!", 0, 2, null, void 0);
    state.writeToTextArea("test", textArea, true);
    assert.strictEqual(textArea._value, "Hi world!");
    assert.strictEqual(textArea._selectionStart, 0);
    assert.strictEqual(textArea._selectionEnd, 2);
    textArea.dispose();
  });
  function testDeduceInput(prevState, value, selectionStart, selectionEnd, couldBeEmojiInput, expected, expectedCharReplaceCnt) {
    prevState = prevState || TextAreaState.EMPTY;
    const textArea = new MockTextAreaWrapper();
    textArea._value = value;
    textArea._selectionStart = selectionStart;
    textArea._selectionEnd = selectionEnd;
    const newState = TextAreaState.readFromTextArea(textArea, null);
    const actual = TextAreaState.deduceInput(prevState, newState, couldBeEmojiInput);
    assert.deepStrictEqual(actual, {
      text: expected,
      replacePrevCharCnt: expectedCharReplaceCnt,
      replaceNextCharCnt: 0,
      positionDelta: 0
    });
    textArea.dispose();
  }
  test("extractNewText - no previous state with selection", () => {
    testDeduceInput(
      null,
      "a",
      0,
      1,
      true,
      "a",
      0
    );
  });
  test("issue #2586: Replacing selected end-of-line with newline locks up the document", () => {
    testDeduceInput(
      new TextAreaState("]\n", 1, 2, null, void 0),
      "]\n",
      2,
      2,
      true,
      "\n",
      0
    );
  });
  test("extractNewText - no previous state without selection", () => {
    testDeduceInput(
      null,
      "a",
      1,
      1,
      true,
      "a",
      0
    );
  });
  test("extractNewText - typing does not cause a selection", () => {
    testDeduceInput(
      TextAreaState.EMPTY,
      "a",
      0,
      1,
      true,
      "a",
      0
    );
  });
  test("extractNewText - had the textarea empty", () => {
    testDeduceInput(
      TextAreaState.EMPTY,
      "a",
      1,
      1,
      true,
      "a",
      0
    );
  });
  test("extractNewText - had the entire line selected", () => {
    testDeduceInput(
      new TextAreaState("Hello world!", 0, 12, null, void 0),
      "H",
      1,
      1,
      true,
      "H",
      0
    );
  });
  test("extractNewText - had previous text 1", () => {
    testDeduceInput(
      new TextAreaState("Hello world!", 12, 12, null, void 0),
      "Hello world!a",
      13,
      13,
      true,
      "a",
      0
    );
  });
  test("extractNewText - had previous text 2", () => {
    testDeduceInput(
      new TextAreaState("Hello world!", 0, 0, null, void 0),
      "aHello world!",
      1,
      1,
      true,
      "a",
      0
    );
  });
  test("extractNewText - had previous text 3", () => {
    testDeduceInput(
      new TextAreaState("Hello world!", 6, 11, null, void 0),
      "Hello other!",
      11,
      11,
      true,
      "other",
      0
    );
  });
  test("extractNewText - IME", () => {
    testDeduceInput(
      TextAreaState.EMPTY,
      "\u3053\u308C\u306F",
      3,
      3,
      true,
      "\u3053\u308C\u306F",
      0
    );
  });
  test("extractNewText - isInOverwriteMode", () => {
    testDeduceInput(
      new TextAreaState("Hello world!", 0, 0, null, void 0),
      "Aello world!",
      1,
      1,
      true,
      "A",
      0
    );
  });
  test("extractMacReplacedText - does nothing if there is selection", () => {
    testDeduceInput(
      new TextAreaState("Hello world!", 5, 5, null, void 0),
      "Hell\xF6 world!",
      4,
      5,
      true,
      "\xF6",
      0
    );
  });
  test("extractMacReplacedText - does nothing if there is more than one extra char", () => {
    testDeduceInput(
      new TextAreaState("Hello world!", 5, 5, null, void 0),
      "Hell\xF6\xF6 world!",
      5,
      5,
      true,
      "\xF6\xF6",
      1
    );
  });
  test("extractMacReplacedText - does nothing if there is more than one changed char", () => {
    testDeduceInput(
      new TextAreaState("Hello world!", 5, 5, null, void 0),
      "Hel\xF6\xF6 world!",
      5,
      5,
      true,
      "\xF6\xF6",
      2
    );
  });
  test("extractMacReplacedText", () => {
    testDeduceInput(
      new TextAreaState("Hello world!", 5, 5, null, void 0),
      "Hell\xF6 world!",
      5,
      5,
      true,
      "\xF6",
      1
    );
  });
  test("issue #25101 - First key press ignored", () => {
    testDeduceInput(
      new TextAreaState("a", 0, 1, null, void 0),
      "a",
      1,
      1,
      true,
      "a",
      0
    );
  });
  test("issue #16520 - Cmd-d of single character followed by typing same character as has no effect", () => {
    testDeduceInput(
      new TextAreaState("x x", 0, 1, null, void 0),
      "x x",
      1,
      1,
      true,
      "x",
      0
    );
  });
  function testDeduceAndroidCompositionInput(prevState, value, selectionStart, selectionEnd, expected, expectedReplacePrevCharCnt, expectedReplaceNextCharCnt, expectedPositionDelta) {
    prevState = prevState || TextAreaState.EMPTY;
    const textArea = new MockTextAreaWrapper();
    textArea._value = value;
    textArea._selectionStart = selectionStart;
    textArea._selectionEnd = selectionEnd;
    const newState = TextAreaState.readFromTextArea(textArea, null);
    const actual = TextAreaState.deduceAndroidCompositionInput(prevState, newState);
    assert.deepStrictEqual(actual, {
      text: expected,
      replacePrevCharCnt: expectedReplacePrevCharCnt,
      replaceNextCharCnt: expectedReplaceNextCharCnt,
      positionDelta: expectedPositionDelta
    });
    textArea.dispose();
  }
  test("Android composition input 1", () => {
    testDeduceAndroidCompositionInput(
      new TextAreaState("Microsoft", 4, 4, null, void 0),
      "Microsoft",
      4,
      4,
      "",
      0,
      0,
      0
    );
  });
  test("Android composition input 2", () => {
    testDeduceAndroidCompositionInput(
      new TextAreaState("Microsoft", 4, 4, null, void 0),
      "Microsoft",
      0,
      9,
      "",
      0,
      0,
      5
    );
  });
  test("Android composition input 3", () => {
    testDeduceAndroidCompositionInput(
      new TextAreaState("Microsoft", 0, 9, null, void 0),
      "Microsoft's",
      11,
      11,
      "'s",
      0,
      0,
      0
    );
  });
  test("Android backspace", () => {
    testDeduceAndroidCompositionInput(
      new TextAreaState("undefinedVariable", 2, 2, null, void 0),
      "udefinedVariable",
      1,
      1,
      "",
      1,
      0,
      0
    );
  });
  suite("SimplePagedScreenReaderStrategy", () => {
    function testPagedScreenReaderStrategy(lines, selection, expected) {
      const model = createTextModel(lines.join("\n"));
      const screenReaderStrategy = new SimplePagedScreenReaderStrategy();
      const screenReaderContentState = screenReaderStrategy.fromEditorSelection(model, selection, 10, true);
      const textAreaState = TextAreaState.fromScreenReaderContentState(screenReaderContentState);
      assert.ok(equalsTextAreaState(textAreaState, expected));
      model.dispose();
    }
    test("simple", () => {
      testPagedScreenReaderStrategy(
        [
          "Hello world!"
        ],
        new Selection(1, 13, 1, 13),
        new TextAreaState("Hello world!", 12, 12, new Range(1, 13, 1, 13), 0)
      );
      testPagedScreenReaderStrategy(
        [
          "Hello world!"
        ],
        new Selection(1, 1, 1, 1),
        new TextAreaState("Hello world!", 0, 0, new Range(1, 1, 1, 1), 0)
      );
      testPagedScreenReaderStrategy(
        [
          "Hello world!"
        ],
        new Selection(1, 1, 1, 6),
        new TextAreaState("Hello world!", 0, 5, new Range(1, 1, 1, 6), 0)
      );
    });
    test("multiline", () => {
      testPagedScreenReaderStrategy(
        [
          "Hello world!",
          "How are you?"
        ],
        new Selection(1, 1, 1, 1),
        new TextAreaState("Hello world!\nHow are you?", 0, 0, new Range(1, 1, 1, 1), 0)
      );
      testPagedScreenReaderStrategy(
        [
          "Hello world!",
          "How are you?"
        ],
        new Selection(2, 1, 2, 1),
        new TextAreaState("Hello world!\nHow are you?", 13, 13, new Range(2, 1, 2, 1), 1)
      );
    });
    test("page", () => {
      testPagedScreenReaderStrategy(
        [
          "L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9\nL10\nL11\nL12\nL13\nL14\nL15\nL16\nL17\nL18\nL19\nL20\nL21"
        ],
        new Selection(1, 1, 1, 1),
        new TextAreaState("L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9\nL10\n", 0, 0, new Range(1, 1, 1, 1), 0)
      );
      testPagedScreenReaderStrategy(
        [
          "L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9\nL10\nL11\nL12\nL13\nL14\nL15\nL16\nL17\nL18\nL19\nL20\nL21"
        ],
        new Selection(11, 1, 11, 1),
        new TextAreaState("L11\nL12\nL13\nL14\nL15\nL16\nL17\nL18\nL19\nL20\n", 0, 0, new Range(11, 1, 11, 1), 0)
      );
      testPagedScreenReaderStrategy(
        [
          "L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9\nL10\nL11\nL12\nL13\nL14\nL15\nL16\nL17\nL18\nL19\nL20\nL21"
        ],
        new Selection(12, 1, 12, 1),
        new TextAreaState("L11\nL12\nL13\nL14\nL15\nL16\nL17\nL18\nL19\nL20\n", 4, 4, new Range(12, 1, 12, 1), 1)
      );
      testPagedScreenReaderStrategy(
        [
          "L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9\nL10\nL11\nL12\nL13\nL14\nL15\nL16\nL17\nL18\nL19\nL20\nL21"
        ],
        new Selection(21, 1, 21, 1),
        new TextAreaState("L21", 0, 0, new Range(21, 1, 21, 1), 0)
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvY29udHJvbGxlci90ZXh0QXJlYVN0YXRlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSVRleHRBcmVhV3JhcHBlciwgVGV4dEFyZWFTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY29udHJvbGxlci9lZGl0Q29udGV4dC90ZXh0QXJlYS90ZXh0QXJlYUVkaXRDb250ZXh0U3RhdGUuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgU2ltcGxlUGFnZWRTY3JlZW5SZWFkZXJTdHJhdGVneSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY29udHJvbGxlci9lZGl0Q29udGV4dC9zY3JlZW5SZWFkZXJVdGlscy5qcyc7XG5cbmNsYXNzIE1vY2tUZXh0QXJlYVdyYXBwZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRleHRBcmVhV3JhcHBlciB7XG5cblx0cHVibGljIF92YWx1ZTogc3RyaW5nO1xuXHRwdWJsaWMgX3NlbGVjdGlvblN0YXJ0OiBudW1iZXI7XG5cdHB1YmxpYyBfc2VsZWN0aW9uRW5kOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl92YWx1ZSA9ICcnO1xuXHRcdHRoaXMuX3NlbGVjdGlvblN0YXJ0ID0gMDtcblx0XHR0aGlzLl9zZWxlY3Rpb25FbmQgPSAwO1xuXHR9XG5cblx0cHVibGljIGdldFZhbHVlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbHVlO1xuXHR9XG5cblx0cHVibGljIHNldFZhbHVlKHJlYXNvbjogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdmFsdWUgPSB2YWx1ZTtcblx0XHR0aGlzLl9zZWxlY3Rpb25TdGFydCA9IHRoaXMuX3ZhbHVlLmxlbmd0aDtcblx0XHR0aGlzLl9zZWxlY3Rpb25FbmQgPSB0aGlzLl92YWx1ZS5sZW5ndGg7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2VsZWN0aW9uU3RhcnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VsZWN0aW9uU3RhcnQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2VsZWN0aW9uRW5kKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbGVjdGlvbkVuZDtcblx0fVxuXG5cdHB1YmxpYyBzZXRTZWxlY3Rpb25SYW5nZShyZWFzb246IHN0cmluZywgc2VsZWN0aW9uU3RhcnQ6IG51bWJlciwgc2VsZWN0aW9uRW5kOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoc2VsZWN0aW9uU3RhcnQgPCAwKSB7XG5cdFx0XHRzZWxlY3Rpb25TdGFydCA9IDA7XG5cdFx0fVxuXHRcdGlmIChzZWxlY3Rpb25TdGFydCA+IHRoaXMuX3ZhbHVlLmxlbmd0aCkge1xuXHRcdFx0c2VsZWN0aW9uU3RhcnQgPSB0aGlzLl92YWx1ZS5sZW5ndGg7XG5cdFx0fVxuXHRcdGlmIChzZWxlY3Rpb25FbmQgPCAwKSB7XG5cdFx0XHRzZWxlY3Rpb25FbmQgPSAwO1xuXHRcdH1cblx0XHRpZiAoc2VsZWN0aW9uRW5kID4gdGhpcy5fdmFsdWUubGVuZ3RoKSB7XG5cdFx0XHRzZWxlY3Rpb25FbmQgPSB0aGlzLl92YWx1ZS5sZW5ndGg7XG5cdFx0fVxuXHRcdHRoaXMuX3NlbGVjdGlvblN0YXJ0ID0gc2VsZWN0aW9uU3RhcnQ7XG5cdFx0dGhpcy5fc2VsZWN0aW9uRW5kID0gc2VsZWN0aW9uRW5kO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGVxdWFsc1RleHRBcmVhU3RhdGUoYTogVGV4dEFyZWFTdGF0ZSwgYjogVGV4dEFyZWFTdGF0ZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKFxuXHRcdGEudmFsdWUgPT09IGIudmFsdWVcblx0XHQmJiBhLnNlbGVjdGlvblN0YXJ0ID09PSBiLnNlbGVjdGlvblN0YXJ0XG5cdFx0JiYgYS5zZWxlY3Rpb25FbmQgPT09IGIuc2VsZWN0aW9uRW5kXG5cdFx0JiYgUmFuZ2UuZXF1YWxzUmFuZ2UoYS5zZWxlY3Rpb24sIGIuc2VsZWN0aW9uKVxuXHRcdCYmIGEubmV3bGluZUNvdW50QmVmb3JlU2VsZWN0aW9uID09PSBiLm5ld2xpbmVDb3VudEJlZm9yZVNlbGVjdGlvblxuXHQpO1xufVxuXG5zdWl0ZSgnVGV4dEFyZWFTdGF0ZScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBhc3NlcnRUZXh0QXJlYVN0YXRlKGFjdHVhbDogVGV4dEFyZWFTdGF0ZSwgdmFsdWU6IHN0cmluZywgc2VsZWN0aW9uU3RhcnQ6IG51bWJlciwgc2VsZWN0aW9uRW5kOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBkZXNpcmVkID0gbmV3IFRleHRBcmVhU3RhdGUodmFsdWUsIHNlbGVjdGlvblN0YXJ0LCBzZWxlY3Rpb25FbmQsIG51bGwsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFsc1RleHRBcmVhU3RhdGUoZGVzaXJlZCwgYWN0dWFsKSwgZGVzaXJlZC50b1N0cmluZygpICsgJyA9PSAnICsgYWN0dWFsLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0dGVzdCgnZnJvbVRleHRBcmVhJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHRBcmVhID0gbmV3IE1vY2tUZXh0QXJlYVdyYXBwZXIoKTtcblx0XHR0ZXh0QXJlYS5fdmFsdWUgPSAnSGVsbG8gd29ybGQhJztcblx0XHR0ZXh0QXJlYS5fc2VsZWN0aW9uU3RhcnQgPSAxO1xuXHRcdHRleHRBcmVhLl9zZWxlY3Rpb25FbmQgPSAxMjtcblx0XHRsZXQgYWN0dWFsID0gVGV4dEFyZWFTdGF0ZS5yZWFkRnJvbVRleHRBcmVhKHRleHRBcmVhLCBudWxsKTtcblxuXHRcdGFzc2VydFRleHRBcmVhU3RhdGUoYWN0dWFsLCAnSGVsbG8gd29ybGQhJywgMSwgMTIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwudmFsdWUsICdIZWxsbyB3b3JsZCEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnNlbGVjdGlvblN0YXJ0LCAxKTtcblxuXHRcdGFjdHVhbCA9IGFjdHVhbC5jb2xsYXBzZVNlbGVjdGlvbigpO1xuXHRcdGFzc2VydFRleHRBcmVhU3RhdGUoYWN0dWFsLCAnSGVsbG8gd29ybGQhJywgMTIsIDEyKTtcblxuXHRcdHRleHRBcmVhLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbHlUb1RleHRBcmVhJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHRBcmVhID0gbmV3IE1vY2tUZXh0QXJlYVdyYXBwZXIoKTtcblx0XHR0ZXh0QXJlYS5fdmFsdWUgPSAnSGVsbG8gd29ybGQhJztcblx0XHR0ZXh0QXJlYS5fc2VsZWN0aW9uU3RhcnQgPSAxO1xuXHRcdHRleHRBcmVhLl9zZWxlY3Rpb25FbmQgPSAxMjtcblxuXHRcdGxldCBzdGF0ZSA9IG5ldyBUZXh0QXJlYVN0YXRlKCdIaSB3b3JsZCEnLCAyLCAyLCBudWxsLCB1bmRlZmluZWQpO1xuXHRcdHN0YXRlLndyaXRlVG9UZXh0QXJlYSgndGVzdCcsIHRleHRBcmVhLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dEFyZWEuX3ZhbHVlLCAnSGkgd29ybGQhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRBcmVhLl9zZWxlY3Rpb25TdGFydCwgOSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRBcmVhLl9zZWxlY3Rpb25FbmQsIDkpO1xuXG5cdFx0c3RhdGUgPSBuZXcgVGV4dEFyZWFTdGF0ZSgnSGkgd29ybGQhJywgMywgMywgbnVsbCwgdW5kZWZpbmVkKTtcblx0XHRzdGF0ZS53cml0ZVRvVGV4dEFyZWEoJ3Rlc3QnLCB0ZXh0QXJlYSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRBcmVhLl92YWx1ZSwgJ0hpIHdvcmxkIScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0QXJlYS5fc2VsZWN0aW9uU3RhcnQsIDkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0QXJlYS5fc2VsZWN0aW9uRW5kLCA5KTtcblxuXHRcdHN0YXRlID0gbmV3IFRleHRBcmVhU3RhdGUoJ0hpIHdvcmxkIScsIDAsIDIsIG51bGwsIHVuZGVmaW5lZCk7XG5cdFx0c3RhdGUud3JpdGVUb1RleHRBcmVhKCd0ZXN0JywgdGV4dEFyZWEsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRBcmVhLl92YWx1ZSwgJ0hpIHdvcmxkIScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0QXJlYS5fc2VsZWN0aW9uU3RhcnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0QXJlYS5fc2VsZWN0aW9uRW5kLCAyKTtcblxuXHRcdHRleHRBcmVhLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gdGVzdERlZHVjZUlucHV0KHByZXZTdGF0ZTogVGV4dEFyZWFTdGF0ZSB8IG51bGwsIHZhbHVlOiBzdHJpbmcsIHNlbGVjdGlvblN0YXJ0OiBudW1iZXIsIHNlbGVjdGlvbkVuZDogbnVtYmVyLCBjb3VsZEJlRW1vamlJbnB1dDogYm9vbGVhbiwgZXhwZWN0ZWQ6IHN0cmluZywgZXhwZWN0ZWRDaGFyUmVwbGFjZUNudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0cHJldlN0YXRlID0gcHJldlN0YXRlIHx8IFRleHRBcmVhU3RhdGUuRU1QVFk7XG5cblx0XHRjb25zdCB0ZXh0QXJlYSA9IG5ldyBNb2NrVGV4dEFyZWFXcmFwcGVyKCk7XG5cdFx0dGV4dEFyZWEuX3ZhbHVlID0gdmFsdWU7XG5cdFx0dGV4dEFyZWEuX3NlbGVjdGlvblN0YXJ0ID0gc2VsZWN0aW9uU3RhcnQ7XG5cdFx0dGV4dEFyZWEuX3NlbGVjdGlvbkVuZCA9IHNlbGVjdGlvbkVuZDtcblxuXHRcdGNvbnN0IG5ld1N0YXRlID0gVGV4dEFyZWFTdGF0ZS5yZWFkRnJvbVRleHRBcmVhKHRleHRBcmVhLCBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBUZXh0QXJlYVN0YXRlLmRlZHVjZUlucHV0KHByZXZTdGF0ZSwgbmV3U3RhdGUsIGNvdWxkQmVFbW9qaUlucHV0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCB7XG5cdFx0XHR0ZXh0OiBleHBlY3RlZCxcblx0XHRcdHJlcGxhY2VQcmV2Q2hhckNudDogZXhwZWN0ZWRDaGFyUmVwbGFjZUNudCxcblx0XHRcdHJlcGxhY2VOZXh0Q2hhckNudDogMCxcblx0XHRcdHBvc2l0aW9uRGVsdGE6IDAsXG5cdFx0fSk7XG5cblx0XHR0ZXh0QXJlYS5kaXNwb3NlKCk7XG5cdH1cblxuXHR0ZXN0KCdleHRyYWN0TmV3VGV4dCAtIG5vIHByZXZpb3VzIHN0YXRlIHdpdGggc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3REZWR1Y2VJbnB1dChcblx0XHRcdG51bGwsXG5cdFx0XHQnYScsXG5cdFx0XHQwLCAxLCB0cnVlLFxuXHRcdFx0J2EnLCAwXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzI1ODY6IFJlcGxhY2luZyBzZWxlY3RlZCBlbmQtb2YtbGluZSB3aXRoIG5ld2xpbmUgbG9ja3MgdXAgdGhlIGRvY3VtZW50JywgKCkgPT4ge1xuXHRcdHRlc3REZWR1Y2VJbnB1dChcblx0XHRcdG5ldyBUZXh0QXJlYVN0YXRlKCddXFxuJywgMSwgMiwgbnVsbCwgdW5kZWZpbmVkKSxcblx0XHRcdCddXFxuJyxcblx0XHRcdDIsIDIsIHRydWUsXG5cdFx0XHQnXFxuJywgMFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhY3ROZXdUZXh0IC0gbm8gcHJldmlvdXMgc3RhdGUgd2l0aG91dCBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0dGVzdERlZHVjZUlucHV0KFxuXHRcdFx0bnVsbCxcblx0XHRcdCdhJyxcblx0XHRcdDEsIDEsIHRydWUsXG5cdFx0XHQnYScsIDBcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRyYWN0TmV3VGV4dCAtIHR5cGluZyBkb2VzIG5vdCBjYXVzZSBhIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHR0ZXN0RGVkdWNlSW5wdXQoXG5cdFx0XHRUZXh0QXJlYVN0YXRlLkVNUFRZLFxuXHRcdFx0J2EnLFxuXHRcdFx0MCwgMSwgdHJ1ZSxcblx0XHRcdCdhJywgMFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhY3ROZXdUZXh0IC0gaGFkIHRoZSB0ZXh0YXJlYSBlbXB0eScsICgpID0+IHtcblx0XHR0ZXN0RGVkdWNlSW5wdXQoXG5cdFx0XHRUZXh0QXJlYVN0YXRlLkVNUFRZLFxuXHRcdFx0J2EnLFxuXHRcdFx0MSwgMSwgdHJ1ZSxcblx0XHRcdCdhJywgMFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhY3ROZXdUZXh0IC0gaGFkIHRoZSBlbnRpcmUgbGluZSBzZWxlY3RlZCcsICgpID0+IHtcblx0XHR0ZXN0RGVkdWNlSW5wdXQoXG5cdFx0XHRuZXcgVGV4dEFyZWFTdGF0ZSgnSGVsbG8gd29ybGQhJywgMCwgMTIsIG51bGwsIHVuZGVmaW5lZCksXG5cdFx0XHQnSCcsXG5cdFx0XHQxLCAxLCB0cnVlLFxuXHRcdFx0J0gnLCAwXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFjdE5ld1RleHQgLSBoYWQgcHJldmlvdXMgdGV4dCAxJywgKCkgPT4ge1xuXHRcdHRlc3REZWR1Y2VJbnB1dChcblx0XHRcdG5ldyBUZXh0QXJlYVN0YXRlKCdIZWxsbyB3b3JsZCEnLCAxMiwgMTIsIG51bGwsIHVuZGVmaW5lZCksXG5cdFx0XHQnSGVsbG8gd29ybGQhYScsXG5cdFx0XHQxMywgMTMsIHRydWUsXG5cdFx0XHQnYScsIDBcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRyYWN0TmV3VGV4dCAtIGhhZCBwcmV2aW91cyB0ZXh0IDInLCAoKSA9PiB7XG5cdFx0dGVzdERlZHVjZUlucHV0KFxuXHRcdFx0bmV3IFRleHRBcmVhU3RhdGUoJ0hlbGxvIHdvcmxkIScsIDAsIDAsIG51bGwsIHVuZGVmaW5lZCksXG5cdFx0XHQnYUhlbGxvIHdvcmxkIScsXG5cdFx0XHQxLCAxLCB0cnVlLFxuXHRcdFx0J2EnLCAwXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFjdE5ld1RleHQgLSBoYWQgcHJldmlvdXMgdGV4dCAzJywgKCkgPT4ge1xuXHRcdHRlc3REZWR1Y2VJbnB1dChcblx0XHRcdG5ldyBUZXh0QXJlYVN0YXRlKCdIZWxsbyB3b3JsZCEnLCA2LCAxMSwgbnVsbCwgdW5kZWZpbmVkKSxcblx0XHRcdCdIZWxsbyBvdGhlciEnLFxuXHRcdFx0MTEsIDExLCB0cnVlLFxuXHRcdFx0J290aGVyJywgMFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhY3ROZXdUZXh0IC0gSU1FJywgKCkgPT4ge1xuXHRcdHRlc3REZWR1Y2VJbnB1dChcblx0XHRcdFRleHRBcmVhU3RhdGUuRU1QVFksXG5cdFx0XHQnXHUzMDUzXHUzMDhDXHUzMDZGJyxcblx0XHRcdDMsIDMsIHRydWUsXG5cdFx0XHQnXHUzMDUzXHUzMDhDXHUzMDZGJywgMFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhY3ROZXdUZXh0IC0gaXNJbk92ZXJ3cml0ZU1vZGUnLCAoKSA9PiB7XG5cdFx0dGVzdERlZHVjZUlucHV0KFxuXHRcdFx0bmV3IFRleHRBcmVhU3RhdGUoJ0hlbGxvIHdvcmxkIScsIDAsIDAsIG51bGwsIHVuZGVmaW5lZCksXG5cdFx0XHQnQWVsbG8gd29ybGQhJyxcblx0XHRcdDEsIDEsIHRydWUsXG5cdFx0XHQnQScsIDBcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRyYWN0TWFjUmVwbGFjZWRUZXh0IC0gZG9lcyBub3RoaW5nIGlmIHRoZXJlIGlzIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHR0ZXN0RGVkdWNlSW5wdXQoXG5cdFx0XHRuZXcgVGV4dEFyZWFTdGF0ZSgnSGVsbG8gd29ybGQhJywgNSwgNSwgbnVsbCwgdW5kZWZpbmVkKSxcblx0XHRcdCdIZWxsXHUwMEY2IHdvcmxkIScsXG5cdFx0XHQ0LCA1LCB0cnVlLFxuXHRcdFx0J1x1MDBGNicsIDBcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRyYWN0TWFjUmVwbGFjZWRUZXh0IC0gZG9lcyBub3RoaW5nIGlmIHRoZXJlIGlzIG1vcmUgdGhhbiBvbmUgZXh0cmEgY2hhcicsICgpID0+IHtcblx0XHR0ZXN0RGVkdWNlSW5wdXQoXG5cdFx0XHRuZXcgVGV4dEFyZWFTdGF0ZSgnSGVsbG8gd29ybGQhJywgNSwgNSwgbnVsbCwgdW5kZWZpbmVkKSxcblx0XHRcdCdIZWxsXHUwMEY2XHUwMEY2IHdvcmxkIScsXG5cdFx0XHQ1LCA1LCB0cnVlLFxuXHRcdFx0J1x1MDBGNlx1MDBGNicsIDFcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRyYWN0TWFjUmVwbGFjZWRUZXh0IC0gZG9lcyBub3RoaW5nIGlmIHRoZXJlIGlzIG1vcmUgdGhhbiBvbmUgY2hhbmdlZCBjaGFyJywgKCkgPT4ge1xuXHRcdHRlc3REZWR1Y2VJbnB1dChcblx0XHRcdG5ldyBUZXh0QXJlYVN0YXRlKCdIZWxsbyB3b3JsZCEnLCA1LCA1LCBudWxsLCB1bmRlZmluZWQpLFxuXHRcdFx0J0hlbFx1MDBGNlx1MDBGNiB3b3JsZCEnLFxuXHRcdFx0NSwgNSwgdHJ1ZSxcblx0XHRcdCdcdTAwRjZcdTAwRjYnLCAyXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFjdE1hY1JlcGxhY2VkVGV4dCcsICgpID0+IHtcblx0XHR0ZXN0RGVkdWNlSW5wdXQoXG5cdFx0XHRuZXcgVGV4dEFyZWFTdGF0ZSgnSGVsbG8gd29ybGQhJywgNSwgNSwgbnVsbCwgdW5kZWZpbmVkKSxcblx0XHRcdCdIZWxsXHUwMEY2IHdvcmxkIScsXG5cdFx0XHQ1LCA1LCB0cnVlLFxuXHRcdFx0J1x1MDBGNicsIDFcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjUxMDEgLSBGaXJzdCBrZXkgcHJlc3MgaWdub3JlZCcsICgpID0+IHtcblx0XHR0ZXN0RGVkdWNlSW5wdXQoXG5cdFx0XHRuZXcgVGV4dEFyZWFTdGF0ZSgnYScsIDAsIDEsIG51bGwsIHVuZGVmaW5lZCksXG5cdFx0XHQnYScsXG5cdFx0XHQxLCAxLCB0cnVlLFxuXHRcdFx0J2EnLCAwXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE2NTIwIC0gQ21kLWQgb2Ygc2luZ2xlIGNoYXJhY3RlciBmb2xsb3dlZCBieSB0eXBpbmcgc2FtZSBjaGFyYWN0ZXIgYXMgaGFzIG5vIGVmZmVjdCcsICgpID0+IHtcblx0XHR0ZXN0RGVkdWNlSW5wdXQoXG5cdFx0XHRuZXcgVGV4dEFyZWFTdGF0ZSgneCB4JywgMCwgMSwgbnVsbCwgdW5kZWZpbmVkKSxcblx0XHRcdCd4IHgnLFxuXHRcdFx0MSwgMSwgdHJ1ZSxcblx0XHRcdCd4JywgMFxuXHRcdCk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHRlc3REZWR1Y2VBbmRyb2lkQ29tcG9zaXRpb25JbnB1dChcblx0XHRwcmV2U3RhdGU6IFRleHRBcmVhU3RhdGUgfCBudWxsLFxuXHRcdHZhbHVlOiBzdHJpbmcsIHNlbGVjdGlvblN0YXJ0OiBudW1iZXIsIHNlbGVjdGlvbkVuZDogbnVtYmVyLFxuXHRcdGV4cGVjdGVkOiBzdHJpbmcsIGV4cGVjdGVkUmVwbGFjZVByZXZDaGFyQ250OiBudW1iZXIsIGV4cGVjdGVkUmVwbGFjZU5leHRDaGFyQ250OiBudW1iZXIsIGV4cGVjdGVkUG9zaXRpb25EZWx0YTogbnVtYmVyKTogdm9pZCB7XG5cdFx0cHJldlN0YXRlID0gcHJldlN0YXRlIHx8IFRleHRBcmVhU3RhdGUuRU1QVFk7XG5cblx0XHRjb25zdCB0ZXh0QXJlYSA9IG5ldyBNb2NrVGV4dEFyZWFXcmFwcGVyKCk7XG5cdFx0dGV4dEFyZWEuX3ZhbHVlID0gdmFsdWU7XG5cdFx0dGV4dEFyZWEuX3NlbGVjdGlvblN0YXJ0ID0gc2VsZWN0aW9uU3RhcnQ7XG5cdFx0dGV4dEFyZWEuX3NlbGVjdGlvbkVuZCA9IHNlbGVjdGlvbkVuZDtcblxuXHRcdGNvbnN0IG5ld1N0YXRlID0gVGV4dEFyZWFTdGF0ZS5yZWFkRnJvbVRleHRBcmVhKHRleHRBcmVhLCBudWxsKTtcblx0XHRjb25zdCBhY3R1YWwgPSBUZXh0QXJlYVN0YXRlLmRlZHVjZUFuZHJvaWRDb21wb3NpdGlvbklucHV0KHByZXZTdGF0ZSwgbmV3U3RhdGUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHtcblx0XHRcdHRleHQ6IGV4cGVjdGVkLFxuXHRcdFx0cmVwbGFjZVByZXZDaGFyQ250OiBleHBlY3RlZFJlcGxhY2VQcmV2Q2hhckNudCxcblx0XHRcdHJlcGxhY2VOZXh0Q2hhckNudDogZXhwZWN0ZWRSZXBsYWNlTmV4dENoYXJDbnQsXG5cdFx0XHRwb3NpdGlvbkRlbHRhOiBleHBlY3RlZFBvc2l0aW9uRGVsdGEsXG5cdFx0fSk7XG5cblx0XHR0ZXh0QXJlYS5kaXNwb3NlKCk7XG5cdH1cblxuXHR0ZXN0KCdBbmRyb2lkIGNvbXBvc2l0aW9uIGlucHV0IDEnLCAoKSA9PiB7XG5cdFx0dGVzdERlZHVjZUFuZHJvaWRDb21wb3NpdGlvbklucHV0KFxuXHRcdFx0bmV3IFRleHRBcmVhU3RhdGUoJ01pY3Jvc29mdCcsIDQsIDQsIG51bGwsIHVuZGVmaW5lZCksXG5cdFx0XHQnTWljcm9zb2Z0Jyxcblx0XHRcdDQsIDQsXG5cdFx0XHQnJywgMCwgMCwgMCxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdBbmRyb2lkIGNvbXBvc2l0aW9uIGlucHV0IDInLCAoKSA9PiB7XG5cdFx0dGVzdERlZHVjZUFuZHJvaWRDb21wb3NpdGlvbklucHV0KFxuXHRcdFx0bmV3IFRleHRBcmVhU3RhdGUoJ01pY3Jvc29mdCcsIDQsIDQsIG51bGwsIHVuZGVmaW5lZCksXG5cdFx0XHQnTWljcm9zb2Z0Jyxcblx0XHRcdDAsIDksXG5cdFx0XHQnJywgMCwgMCwgNSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdBbmRyb2lkIGNvbXBvc2l0aW9uIGlucHV0IDMnLCAoKSA9PiB7XG5cdFx0dGVzdERlZHVjZUFuZHJvaWRDb21wb3NpdGlvbklucHV0KFxuXHRcdFx0bmV3IFRleHRBcmVhU3RhdGUoJ01pY3Jvc29mdCcsIDAsIDksIG51bGwsIHVuZGVmaW5lZCksXG5cdFx0XHQnTWljcm9zb2Z0XFwncycsXG5cdFx0XHQxMSwgMTEsXG5cdFx0XHQnXFwncycsIDAsIDAsIDAsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnQW5kcm9pZCBiYWNrc3BhY2UnLCAoKSA9PiB7XG5cdFx0dGVzdERlZHVjZUFuZHJvaWRDb21wb3NpdGlvbklucHV0KFxuXHRcdFx0bmV3IFRleHRBcmVhU3RhdGUoJ3VuZGVmaW5lZFZhcmlhYmxlJywgMiwgMiwgbnVsbCwgdW5kZWZpbmVkKSxcblx0XHRcdCd1ZGVmaW5lZFZhcmlhYmxlJyxcblx0XHRcdDEsIDEsXG5cdFx0XHQnJywgMSwgMCwgMCxcblx0XHQpO1xuXHR9KTtcblxuXHRzdWl0ZSgnU2ltcGxlUGFnZWRTY3JlZW5SZWFkZXJTdHJhdGVneScsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIHRlc3RQYWdlZFNjcmVlblJlYWRlclN0cmF0ZWd5KGxpbmVzOiBzdHJpbmdbXSwgc2VsZWN0aW9uOiBTZWxlY3Rpb24sIGV4cGVjdGVkOiBUZXh0QXJlYVN0YXRlKTogdm9pZCB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChsaW5lcy5qb2luKCdcXG4nKSk7XG5cdFx0XHRjb25zdCBzY3JlZW5SZWFkZXJTdHJhdGVneSA9IG5ldyBTaW1wbGVQYWdlZFNjcmVlblJlYWRlclN0cmF0ZWd5KCk7XG5cdFx0XHRjb25zdCBzY3JlZW5SZWFkZXJDb250ZW50U3RhdGUgPSBzY3JlZW5SZWFkZXJTdHJhdGVneS5mcm9tRWRpdG9yU2VsZWN0aW9uKG1vZGVsLCBzZWxlY3Rpb24sIDEwLCB0cnVlKTtcblx0XHRcdGNvbnN0IHRleHRBcmVhU3RhdGUgPSBUZXh0QXJlYVN0YXRlLmZyb21TY3JlZW5SZWFkZXJDb250ZW50U3RhdGUoc2NyZWVuUmVhZGVyQ29udGVudFN0YXRlKTtcblx0XHRcdGFzc2VydC5vayhlcXVhbHNUZXh0QXJlYVN0YXRlKHRleHRBcmVhU3RhdGUsIGV4cGVjdGVkKSk7XG5cdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnc2ltcGxlJywgKCkgPT4ge1xuXHRcdFx0dGVzdFBhZ2VkU2NyZWVuUmVhZGVyU3RyYXRlZ3koXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnSGVsbG8gd29ybGQhJ1xuXHRcdFx0XHRdLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEzLCAxLCAxMyksXG5cdFx0XHRcdG5ldyBUZXh0QXJlYVN0YXRlKCdIZWxsbyB3b3JsZCEnLCAxMiwgMTIsIG5ldyBSYW5nZSgxLCAxMywgMSwgMTMpLCAwKVxuXHRcdFx0KTtcblxuXHRcdFx0dGVzdFBhZ2VkU2NyZWVuUmVhZGVyU3RyYXRlZ3koXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnSGVsbG8gd29ybGQhJ1xuXHRcdFx0XHRdLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLFxuXHRcdFx0XHRuZXcgVGV4dEFyZWFTdGF0ZSgnSGVsbG8gd29ybGQhJywgMCwgMCwgbmV3IFJhbmdlKDEsIDEsIDEsIDEpLCAwKVxuXHRcdFx0KTtcblxuXHRcdFx0dGVzdFBhZ2VkU2NyZWVuUmVhZGVyU3RyYXRlZ3koXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnSGVsbG8gd29ybGQhJ1xuXHRcdFx0XHRdLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDYpLFxuXHRcdFx0XHRuZXcgVGV4dEFyZWFTdGF0ZSgnSGVsbG8gd29ybGQhJywgMCwgNSwgbmV3IFJhbmdlKDEsIDEsIDEsIDYpLCAwKVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpbGluZScsICgpID0+IHtcblx0XHRcdHRlc3RQYWdlZFNjcmVlblJlYWRlclN0cmF0ZWd5KFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J0hlbGxvIHdvcmxkIScsXG5cdFx0XHRcdFx0J0hvdyBhcmUgeW91Pydcblx0XHRcdFx0XSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSxcblx0XHRcdFx0bmV3IFRleHRBcmVhU3RhdGUoJ0hlbGxvIHdvcmxkIVxcbkhvdyBhcmUgeW91PycsIDAsIDAsIG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgMClcblx0XHRcdCk7XG5cblx0XHRcdHRlc3RQYWdlZFNjcmVlblJlYWRlclN0cmF0ZWd5KFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J0hlbGxvIHdvcmxkIScsXG5cdFx0XHRcdFx0J0hvdyBhcmUgeW91Pydcblx0XHRcdFx0XSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKSxcblx0XHRcdFx0bmV3IFRleHRBcmVhU3RhdGUoJ0hlbGxvIHdvcmxkIVxcbkhvdyBhcmUgeW91PycsIDEzLCAxMywgbmV3IFJhbmdlKDIsIDEsIDIsIDEpLCAxKVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhZ2UnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0UGFnZWRTY3JlZW5SZWFkZXJTdHJhdGVneShcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdMMVxcbkwyXFxuTDNcXG5MNFxcbkw1XFxuTDZcXG5MN1xcbkw4XFxuTDlcXG5MMTBcXG5MMTFcXG5MMTJcXG5MMTNcXG5MMTRcXG5MMTVcXG5MMTZcXG5MMTdcXG5MMThcXG5MMTlcXG5MMjBcXG5MMjEnXG5cdFx0XHRcdF0sXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksXG5cdFx0XHRcdG5ldyBUZXh0QXJlYVN0YXRlKCdMMVxcbkwyXFxuTDNcXG5MNFxcbkw1XFxuTDZcXG5MN1xcbkw4XFxuTDlcXG5MMTBcXG4nLCAwLCAwLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIDApXG5cdFx0XHQpO1xuXG5cdFx0XHR0ZXN0UGFnZWRTY3JlZW5SZWFkZXJTdHJhdGVneShcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdMMVxcbkwyXFxuTDNcXG5MNFxcbkw1XFxuTDZcXG5MN1xcbkw4XFxuTDlcXG5MMTBcXG5MMTFcXG5MMTJcXG5MMTNcXG5MMTRcXG5MMTVcXG5MMTZcXG5MMTdcXG5MMThcXG5MMTlcXG5MMjBcXG5MMjEnXG5cdFx0XHRcdF0sXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMTEsIDEsIDExLCAxKSxcblx0XHRcdFx0bmV3IFRleHRBcmVhU3RhdGUoJ0wxMVxcbkwxMlxcbkwxM1xcbkwxNFxcbkwxNVxcbkwxNlxcbkwxN1xcbkwxOFxcbkwxOVxcbkwyMFxcbicsIDAsIDAsIG5ldyBSYW5nZSgxMSwgMSwgMTEsIDEpLCAwKVxuXHRcdFx0KTtcblxuXHRcdFx0dGVzdFBhZ2VkU2NyZWVuUmVhZGVyU3RyYXRlZ3koXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnTDFcXG5MMlxcbkwzXFxuTDRcXG5MNVxcbkw2XFxuTDdcXG5MOFxcbkw5XFxuTDEwXFxuTDExXFxuTDEyXFxuTDEzXFxuTDE0XFxuTDE1XFxuTDE2XFxuTDE3XFxuTDE4XFxuTDE5XFxuTDIwXFxuTDIxJ1xuXHRcdFx0XHRdLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEyLCAxLCAxMiwgMSksXG5cdFx0XHRcdG5ldyBUZXh0QXJlYVN0YXRlKCdMMTFcXG5MMTJcXG5MMTNcXG5MMTRcXG5MMTVcXG5MMTZcXG5MMTdcXG5MMThcXG5MMTlcXG5MMjBcXG4nLCA0LCA0LCBuZXcgUmFuZ2UoMTIsIDEsIDEyLCAxKSwgMSlcblx0XHRcdCk7XG5cblx0XHRcdHRlc3RQYWdlZFNjcmVlblJlYWRlclN0cmF0ZWd5KFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J0wxXFxuTDJcXG5MM1xcbkw0XFxuTDVcXG5MNlxcbkw3XFxuTDhcXG5MOVxcbkwxMFxcbkwxMVxcbkwxMlxcbkwxM1xcbkwxNFxcbkwxNVxcbkwxNlxcbkwxN1xcbkwxOFxcbkwxOVxcbkwyMFxcbkwyMSdcblx0XHRcdFx0XSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyMSwgMSwgMjEsIDEpLFxuXHRcdFx0XHRuZXcgVGV4dEFyZWFTdGF0ZSgnTDIxJywgMCwgMCwgbmV3IFJhbmdlKDIxLCAxLCAyMSwgMSksIDApXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBa0I7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
