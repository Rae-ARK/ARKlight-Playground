var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import assert from "assert";
import { Disposable, DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { MetadataConsts } from "../../../common/encodedTokenAttributes.js";
import { EncodedTokenizationResult, TokenizationRegistry } from "../../../common/languages.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { NullState } from "../../../common/languages/nullTokenize.js";
import { InternalModelContentChangeEvent, ModelRawContentChangedEvent, ModelRawFlush, ModelRawLineChanged, ModelRawLinesDeleted, ModelRawLinesInserted } from "../../../common/textModelEvents.js";
import { createModelServices, createTextModel, instantiateTextModel } from "../testTextModel.js";
import { mock } from "../../../../base/test/common/mock.js";
const LINE1 = "My First Line";
const LINE2 = "		My Second Line";
const LINE3 = "    Third Line";
const LINE4 = "";
const LINE5 = "1";
suite("Editor Model - Model", () => {
  let thisModel;
  setup(() => {
    const text = LINE1 + "\r\n" + LINE2 + "\n" + LINE3 + "\n" + LINE4 + "\r\n" + LINE5;
    thisModel = createTextModel(text);
  });
  teardown(() => {
    thisModel.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("model getValue", () => {
    assert.strictEqual(thisModel.getValue(), "My First Line\n		My Second Line\n    Third Line\n\n1");
  });
  test("model insert empty text", () => {
    thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "")]);
    assert.strictEqual(thisModel.getLineCount(), 5);
    assert.strictEqual(thisModel.getLineContent(1), "My First Line");
  });
  test("model insert text without newline 1", () => {
    thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "foo ")]);
    assert.strictEqual(thisModel.getLineCount(), 5);
    assert.strictEqual(thisModel.getLineContent(1), "foo My First Line");
  });
  test("model insert text without newline 2", () => {
    thisModel.applyEdits([EditOperation.insert(new Position(1, 3), " foo")]);
    assert.strictEqual(thisModel.getLineCount(), 5);
    assert.strictEqual(thisModel.getLineContent(1), "My foo First Line");
  });
  test("model insert text with one newline", () => {
    thisModel.applyEdits([EditOperation.insert(new Position(1, 3), " new line\nNo longer")]);
    assert.strictEqual(thisModel.getLineCount(), 6);
    assert.strictEqual(thisModel.getLineContent(1), "My new line");
    assert.strictEqual(thisModel.getLineContent(2), "No longer First Line");
  });
  test("model insert text with two newlines", () => {
    thisModel.applyEdits([EditOperation.insert(new Position(1, 3), " new line\nOne more line in the middle\nNo longer")]);
    assert.strictEqual(thisModel.getLineCount(), 7);
    assert.strictEqual(thisModel.getLineContent(1), "My new line");
    assert.strictEqual(thisModel.getLineContent(2), "One more line in the middle");
    assert.strictEqual(thisModel.getLineContent(3), "No longer First Line");
  });
  test("model insert text with many newlines", () => {
    thisModel.applyEdits([EditOperation.insert(new Position(1, 3), "\n\n\n\n")]);
    assert.strictEqual(thisModel.getLineCount(), 9);
    assert.strictEqual(thisModel.getLineContent(1), "My");
    assert.strictEqual(thisModel.getLineContent(2), "");
    assert.strictEqual(thisModel.getLineContent(3), "");
    assert.strictEqual(thisModel.getLineContent(4), "");
    assert.strictEqual(thisModel.getLineContent(5), " First Line");
  });
  function withEventCapturing(callback) {
    let e = null;
    const spyViewModel = new class extends mock() {
      onDidChangeContentOrInjectedText(_e) {
        if (e !== null || !(_e instanceof InternalModelContentChangeEvent)) {
          assert.fail("Unexpected assertion error");
        }
        e = _e.rawContentChangedEvent;
      }
      emitContentChangeEvent(e2) {
      }
    }();
    thisModel.registerViewModel(spyViewModel);
    callback();
    thisModel.unregisterViewModel(spyViewModel);
    return e;
  }
  test("model insert empty text does not trigger eventing", () => {
    const e = withEventCapturing(() => {
      thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "")]);
    });
    assert.deepStrictEqual(e, null, "was not expecting event");
  });
  test("model insert text without newline eventing", () => {
    const e = withEventCapturing(() => {
      thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "foo ")]);
    });
    assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
      [
        new ModelRawLineChanged(1, 1)
      ],
      2,
      false,
      false
    ));
  });
  test("model insert text with one newline eventing", () => {
    const e = withEventCapturing(() => {
      thisModel.applyEdits([EditOperation.insert(new Position(1, 3), " new line\nNo longer")]);
    });
    assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
      [
        new ModelRawLineChanged(1, 1),
        new ModelRawLinesInserted(2, 2, 1)
      ],
      2,
      false,
      false
    ));
  });
  test("model delete empty text", () => {
    thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 1))]);
    assert.strictEqual(thisModel.getLineCount(), 5);
    assert.strictEqual(thisModel.getLineContent(1), "My First Line");
  });
  test("model delete text from one line", () => {
    thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 2))]);
    assert.strictEqual(thisModel.getLineCount(), 5);
    assert.strictEqual(thisModel.getLineContent(1), "y First Line");
  });
  test("model delete text from one line 2", () => {
    thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "a")]);
    assert.strictEqual(thisModel.getLineContent(1), "aMy First Line");
    thisModel.applyEdits([EditOperation.delete(new Range(1, 2, 1, 4))]);
    assert.strictEqual(thisModel.getLineCount(), 5);
    assert.strictEqual(thisModel.getLineContent(1), "a First Line");
  });
  test("model delete all text from a line", () => {
    thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 14))]);
    assert.strictEqual(thisModel.getLineCount(), 5);
    assert.strictEqual(thisModel.getLineContent(1), "");
  });
  test("model delete text from two lines", () => {
    thisModel.applyEdits([EditOperation.delete(new Range(1, 4, 2, 6))]);
    assert.strictEqual(thisModel.getLineCount(), 4);
    assert.strictEqual(thisModel.getLineContent(1), "My Second Line");
  });
  test("model delete text from many lines", () => {
    thisModel.applyEdits([EditOperation.delete(new Range(1, 4, 3, 5))]);
    assert.strictEqual(thisModel.getLineCount(), 3);
    assert.strictEqual(thisModel.getLineContent(1), "My Third Line");
  });
  test("model delete everything", () => {
    thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 5, 2))]);
    assert.strictEqual(thisModel.getLineCount(), 1);
    assert.strictEqual(thisModel.getLineContent(1), "");
  });
  test("model delete empty text does not trigger eventing", () => {
    const e = withEventCapturing(() => {
      thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 1))]);
    });
    assert.deepStrictEqual(e, null, "was not expecting event");
  });
  test("model delete text from one line eventing", () => {
    const e = withEventCapturing(() => {
      thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 2))]);
    });
    assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
      [
        new ModelRawLineChanged(1, 1)
      ],
      2,
      false,
      false
    ));
  });
  test("model delete all text from a line eventing", () => {
    const e = withEventCapturing(() => {
      thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 14))]);
    });
    assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
      [
        new ModelRawLineChanged(1, 1)
      ],
      2,
      false,
      false
    ));
  });
  test("model delete text from two lines eventing", () => {
    const e = withEventCapturing(() => {
      thisModel.applyEdits([EditOperation.delete(new Range(1, 4, 2, 6))]);
    });
    assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
      [
        new ModelRawLineChanged(1, 1),
        new ModelRawLinesDeleted(2, 2, 1)
      ],
      2,
      false,
      false
    ));
  });
  test("model delete text from many lines eventing", () => {
    const e = withEventCapturing(() => {
      thisModel.applyEdits([EditOperation.delete(new Range(1, 4, 3, 5))]);
    });
    assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
      [
        new ModelRawLineChanged(1, 1),
        new ModelRawLinesDeleted(2, 3, 1)
      ],
      2,
      false,
      false
    ));
  });
  test("getValueInRange", () => {
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 1, 1)), "");
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 1, 2)), "M");
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 2, 1, 3)), "y");
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 1, 14)), "My First Line");
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 2, 1)), "My First Line\n");
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 2, 2)), "My First Line\n	");
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 2, 3)), "My First Line\n		");
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 2, 17)), "My First Line\n		My Second Line");
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 3, 1)), "My First Line\n		My Second Line\n");
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 4, 1)), "My First Line\n		My Second Line\n    Third Line\n");
  });
  test("getValueLengthInRange", () => {
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 1, 1)), "".length);
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 1, 2)), "M".length);
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 2, 1, 3)), "y".length);
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 1, 14)), "My First Line".length);
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 2, 1)), "My First Line\n".length);
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 2, 2)), "My First Line\n	".length);
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 2, 3)), "My First Line\n		".length);
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 2, 17)), "My First Line\n		My Second Line".length);
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 3, 1)), "My First Line\n		My Second Line\n".length);
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 4, 1)), "My First Line\n		My Second Line\n    Third Line\n".length);
  });
  test("setValue eventing", () => {
    const e = withEventCapturing(() => {
      thisModel.setValue("new value");
    });
    assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
      [
        new ModelRawFlush()
      ],
      2,
      false,
      false
    ));
  });
  test("issue #46342: Maintain edit operation order in applyEdits", () => {
    const res = thisModel.applyEdits([
      { range: new Range(2, 1, 2, 1), text: "a" },
      { range: new Range(1, 1, 1, 1), text: "b" }
    ], true);
    assert.deepStrictEqual(res[0].range, new Range(2, 1, 2, 2));
    assert.deepStrictEqual(res[1].range, new Range(1, 1, 1, 2));
  });
});
suite("Editor Model - Model Line Separators", () => {
  let thisModel;
  setup(() => {
    const text = LINE1 + "\u2028" + LINE2 + "\n" + LINE3 + "\u2028" + LINE4 + "\r\n" + LINE5;
    thisModel = createTextModel(text);
  });
  teardown(() => {
    thisModel.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("model getValue", () => {
    assert.strictEqual(thisModel.getValue(), "My First Line\u2028		My Second Line\n    Third Line\u2028\n1");
  });
  test("model lines", () => {
    assert.strictEqual(thisModel.getLineCount(), 3);
  });
  test("Bug 13333:Model should line break on lonely CR too", () => {
    const model = createTextModel("Hello\rWorld!\r\nAnother line");
    assert.strictEqual(model.getLineCount(), 3);
    assert.strictEqual(model.getValue(), "Hello\r\nWorld!\r\nAnother line");
    model.dispose();
  });
});
suite("Editor Model - Words", () => {
  const OUTER_LANGUAGE_ID = "outerMode";
  const INNER_LANGUAGE_ID = "innerMode";
  let OuterMode = class extends Disposable {
    constructor(languageService, languageConfigurationService) {
      super();
      this.languageId = OUTER_LANGUAGE_ID;
      this._register(languageService.registerLanguage({ id: this.languageId }));
      this._register(languageConfigurationService.register(this.languageId, {}));
      const languageIdCodec = languageService.languageIdCodec;
      this._register(TokenizationRegistry.register(this.languageId, {
        getInitialState: () => NullState,
        tokenize: void 0,
        tokenizeEncoded: (line, hasEOL, state) => {
          const tokensArr = [];
          let prevLanguageId = void 0;
          for (let i = 0; i < line.length; i++) {
            const languageId = line.charAt(i) === "x" ? INNER_LANGUAGE_ID : OUTER_LANGUAGE_ID;
            const encodedLanguageId = languageIdCodec.encodeLanguageId(languageId);
            if (prevLanguageId !== languageId) {
              tokensArr.push(i);
              tokensArr.push(encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET);
            }
            prevLanguageId = languageId;
          }
          const tokens = new Uint32Array(tokensArr.length);
          for (let i = 0; i < tokens.length; i++) {
            tokens[i] = tokensArr[i];
          }
          return new EncodedTokenizationResult(tokens, [], state);
        }
      }));
    }
  };
  OuterMode = __decorateClass([
    __decorateParam(0, ILanguageService),
    __decorateParam(1, ILanguageConfigurationService)
  ], OuterMode);
  let InnerMode = class extends Disposable {
    constructor(languageService, languageConfigurationService) {
      super();
      this.languageId = INNER_LANGUAGE_ID;
      this._register(languageService.registerLanguage({ id: this.languageId }));
      this._register(languageConfigurationService.register(this.languageId, {}));
    }
  };
  InnerMode = __decorateClass([
    __decorateParam(0, ILanguageService),
    __decorateParam(1, ILanguageConfigurationService)
  ], InnerMode);
  let disposables = [];
  setup(() => {
    disposables = [];
  });
  teardown(() => {
    dispose(disposables);
    disposables = [];
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Get word at position", () => {
    const text = ["This text has some  words. "];
    const thisModel = createTextModel(text.join("\n"));
    disposables.push(thisModel);
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 1)), { word: "This", startColumn: 1, endColumn: 5 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 2)), { word: "This", startColumn: 1, endColumn: 5 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 4)), { word: "This", startColumn: 1, endColumn: 5 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 5)), { word: "This", startColumn: 1, endColumn: 5 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 6)), { word: "text", startColumn: 6, endColumn: 10 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 19)), { word: "some", startColumn: 15, endColumn: 19 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 20)), null);
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 21)), { word: "words", startColumn: 21, endColumn: 26 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 26)), { word: "words", startColumn: 21, endColumn: 26 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 27)), null);
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 28)), null);
  });
  test("getWordAtPosition at embedded language boundaries", () => {
    const disposables2 = new DisposableStore();
    const instantiationService = createModelServices(disposables2);
    const outerMode = disposables2.add(instantiationService.createInstance(OuterMode));
    disposables2.add(instantiationService.createInstance(InnerMode));
    const model = disposables2.add(instantiateTextModel(instantiationService, "ab<xx>ab<x>", outerMode.languageId));
    assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 1)), { word: "ab", startColumn: 1, endColumn: 3 });
    assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 2)), { word: "ab", startColumn: 1, endColumn: 3 });
    assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 3)), { word: "ab", startColumn: 1, endColumn: 3 });
    assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 4)), { word: "xx", startColumn: 4, endColumn: 6 });
    assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 5)), { word: "xx", startColumn: 4, endColumn: 6 });
    assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 6)), { word: "xx", startColumn: 4, endColumn: 6 });
    assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 7)), { word: "ab", startColumn: 7, endColumn: 9 });
    disposables2.dispose();
  });
  test("issue #61296: VS code freezes when editing CSS file with emoji", () => {
    const MODE_ID = "testMode";
    const disposables2 = new DisposableStore();
    const instantiationService = createModelServices(disposables2);
    const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    const languageService = instantiationService.get(ILanguageService);
    disposables2.add(languageService.registerLanguage({ id: MODE_ID }));
    disposables2.add(languageConfigurationService.register(MODE_ID, {
      wordPattern: /(#?-?\d*\.\d\w*%?)|(::?[\w-]*(?=[^,{;]*[,{]))|(([@#.!])?[\w-?]+%?|[@#!.])/g
    }));
    const thisModel = disposables2.add(instantiateTextModel(instantiationService, ".\u{1F437}-a-b", MODE_ID));
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 1)), { word: ".", startColumn: 1, endColumn: 2 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 2)), { word: ".", startColumn: 1, endColumn: 2 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 3)), null);
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 4)), { word: "-a-b", startColumn: 4, endColumn: 8 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 5)), { word: "-a-b", startColumn: 4, endColumn: 8 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 6)), { word: "-a-b", startColumn: 4, endColumn: 8 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 7)), { word: "-a-b", startColumn: 4, endColumn: 8 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 8)), { word: "-a-b", startColumn: 4, endColumn: 8 });
    disposables2.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2RlbC9tb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IE1ldGFkYXRhQ29uc3RzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCwgSVN0YXRlLCBUb2tlbml6YXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IE51bGxTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbnVsbFRva2VuaXplLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VFdmVudCwgTW9kZWxJbmplY3RlZFRleHRDaGFuZ2VkRXZlbnQsIE1vZGVsUmF3Q29udGVudENoYW5nZWRFdmVudCwgTW9kZWxSYXdGbHVzaCwgTW9kZWxSYXdMaW5lQ2hhbmdlZCwgTW9kZWxSYXdMaW5lc0RlbGV0ZWQsIE1vZGVsUmF3TGluZXNJbnNlcnRlZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90ZXh0TW9kZWxFdmVudHMuanMnO1xuaW1wb3J0IHsgY3JlYXRlTW9kZWxTZXJ2aWNlcywgY3JlYXRlVGV4dE1vZGVsLCBpbnN0YW50aWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBJVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC5qcyc7XG5cbi8vIC0tLS0tLS0tLSB1dGlsc1xuXG5jb25zdCBMSU5FMSA9ICdNeSBGaXJzdCBMaW5lJztcbmNvbnN0IExJTkUyID0gJ1xcdFxcdE15IFNlY29uZCBMaW5lJztcbmNvbnN0IExJTkUzID0gJyAgICBUaGlyZCBMaW5lJztcbmNvbnN0IExJTkU0ID0gJyc7XG5jb25zdCBMSU5FNSA9ICcxJztcblxuc3VpdGUoJ0VkaXRvciBNb2RlbCAtIE1vZGVsJywgKCkgPT4ge1xuXG5cdGxldCB0aGlzTW9kZWw6IFRleHRNb2RlbDtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9XG5cdFx0XHRMSU5FMSArICdcXHJcXG4nICtcblx0XHRcdExJTkUyICsgJ1xcbicgK1xuXHRcdFx0TElORTMgKyAnXFxuJyArXG5cdFx0XHRMSU5FNCArICdcXHJcXG4nICtcblx0XHRcdExJTkU1O1xuXHRcdHRoaXNNb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCh0ZXh0KTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHRoaXNNb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIC0tLS0tLS0tLSBpbnNlcnQgdGV4dFxuXG5cdHRlc3QoJ21vZGVsIGdldFZhbHVlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWUoKSwgJ015IEZpcnN0IExpbmVcXG5cXHRcXHRNeSBTZWNvbmQgTGluZVxcbiAgICBUaGlyZCBMaW5lXFxuXFxuMScpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCBpbnNlcnQgZW1wdHkgdGV4dCcsICgpID0+IHtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDEsIDEpLCAnJyldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb3VudCgpLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb250ZW50KDEpLCAnTXkgRmlyc3QgTGluZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCBpbnNlcnQgdGV4dCB3aXRob3V0IG5ld2xpbmUgMScsICgpID0+IHtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDEsIDEpLCAnZm9vICcpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ291bnQoKSwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ2ZvbyBNeSBGaXJzdCBMaW5lJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsIGluc2VydCB0ZXh0IHdpdGhvdXQgbmV3bGluZSAyJywgKCkgPT4ge1xuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmluc2VydChuZXcgUG9zaXRpb24oMSwgMyksICcgZm9vJyldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb3VudCgpLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb250ZW50KDEpLCAnTXkgZm9vIEZpcnN0IExpbmUnKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgaW5zZXJ0IHRleHQgd2l0aCBvbmUgbmV3bGluZScsICgpID0+IHtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDEsIDMpLCAnIG5ldyBsaW5lXFxuTm8gbG9uZ2VyJyldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb3VudCgpLCA2KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb250ZW50KDEpLCAnTXkgbmV3IGxpbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb250ZW50KDIpLCAnTm8gbG9uZ2VyIEZpcnN0IExpbmUnKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgaW5zZXJ0IHRleHQgd2l0aCB0d28gbmV3bGluZXMnLCAoKSA9PiB7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uaW5zZXJ0KG5ldyBQb3NpdGlvbigxLCAzKSwgJyBuZXcgbGluZVxcbk9uZSBtb3JlIGxpbmUgaW4gdGhlIG1pZGRsZVxcbk5vIGxvbmdlcicpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ291bnQoKSwgNyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ015IG5ldyBsaW5lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ09uZSBtb3JlIGxpbmUgaW4gdGhlIG1pZGRsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICdObyBsb25nZXIgRmlyc3QgTGluZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCBpbnNlcnQgdGV4dCB3aXRoIG1hbnkgbmV3bGluZXMnLCAoKSA9PiB7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uaW5zZXJ0KG5ldyBQb3NpdGlvbigxLCAzKSwgJ1xcblxcblxcblxcbicpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ291bnQoKSwgOSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ015Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb250ZW50KDQpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ29udGVudCg1KSwgJyBGaXJzdCBMaW5lJyk7XG5cdH0pO1xuXG5cblx0Ly8gLS0tLS0tLS0tIGluc2VydCB0ZXh0IGV2ZW50aW5nXG5cblx0ZnVuY3Rpb24gd2l0aEV2ZW50Q2FwdHVyaW5nKGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogTW9kZWxSYXdDb250ZW50Q2hhbmdlZEV2ZW50IHwgbnVsbCB7XG5cdFx0bGV0IGU6IE1vZGVsUmF3Q29udGVudENoYW5nZWRFdmVudCB8IG51bGwgPSBudWxsO1xuXHRcdGNvbnN0IHNweVZpZXdNb2RlbCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZpZXdNb2RlbD4oKSB7XG5cdFx0XHRvdmVycmlkZSBvbkRpZENoYW5nZUNvbnRlbnRPckluamVjdGVkVGV4dChfZTogSW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VFdmVudCB8IE1vZGVsSW5qZWN0ZWRUZXh0Q2hhbmdlZEV2ZW50KSB7XG5cdFx0XHRcdGlmIChlICE9PSBudWxsIHx8ICEoX2UgaW5zdGFuY2VvZiBJbnRlcm5hbE1vZGVsQ29udGVudENoYW5nZUV2ZW50KSkge1xuXHRcdFx0XHRcdGFzc2VydC5mYWlsKCdVbmV4cGVjdGVkIGFzc2VydGlvbiBlcnJvcicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGUgPSBfZS5yYXdDb250ZW50Q2hhbmdlZEV2ZW50O1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZW1pdENvbnRlbnRDaGFuZ2VFdmVudChlOiBJbnRlcm5hbE1vZGVsQ29udGVudENoYW5nZUV2ZW50IHwgTW9kZWxJbmplY3RlZFRleHRDaGFuZ2VkRXZlbnQpOiB2b2lkIHsgfVxuXHRcdH07XG5cdFx0dGhpc01vZGVsLnJlZ2lzdGVyVmlld01vZGVsKHNweVZpZXdNb2RlbCk7XG5cdFx0Y2FsbGJhY2soKTtcblx0XHR0aGlzTW9kZWwudW5yZWdpc3RlclZpZXdNb2RlbChzcHlWaWV3TW9kZWwpO1xuXHRcdHJldHVybiBlO1xuXHR9XG5cblx0dGVzdCgnbW9kZWwgaW5zZXJ0IGVtcHR5IHRleHQgZG9lcyBub3QgdHJpZ2dlciBldmVudGluZycsICgpID0+IHtcblx0XHRjb25zdCBlID0gd2l0aEV2ZW50Q2FwdHVyaW5nKCgpID0+IHtcblx0XHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmluc2VydChuZXcgUG9zaXRpb24oMSwgMSksICcnKV0pO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZSwgbnVsbCwgJ3dhcyBub3QgZXhwZWN0aW5nIGV2ZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsIGluc2VydCB0ZXh0IHdpdGhvdXQgbmV3bGluZSBldmVudGluZycsICgpID0+IHtcblx0XHRjb25zdCBlID0gd2l0aEV2ZW50Q2FwdHVyaW5nKCgpID0+IHtcblx0XHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmluc2VydChuZXcgUG9zaXRpb24oMSwgMSksICdmb28gJyldKTtcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGUsIG5ldyBNb2RlbFJhd0NvbnRlbnRDaGFuZ2VkRXZlbnQoXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBNb2RlbFJhd0xpbmVDaGFuZ2VkKDEsIDEpXG5cdFx0XHRdLFxuXHRcdFx0Mixcblx0XHRcdGZhbHNlLFxuXHRcdFx0ZmFsc2Vcblx0XHQpKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgaW5zZXJ0IHRleHQgd2l0aCBvbmUgbmV3bGluZSBldmVudGluZycsICgpID0+IHtcblx0XHRjb25zdCBlID0gd2l0aEV2ZW50Q2FwdHVyaW5nKCgpID0+IHtcblx0XHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmluc2VydChuZXcgUG9zaXRpb24oMSwgMyksICcgbmV3IGxpbmVcXG5ObyBsb25nZXInKV0pO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZSwgbmV3IE1vZGVsUmF3Q29udGVudENoYW5nZWRFdmVudChcblx0XHRcdFtcblx0XHRcdFx0bmV3IE1vZGVsUmF3TGluZUNoYW5nZWQoMSwgMSksXG5cdFx0XHRcdG5ldyBNb2RlbFJhd0xpbmVzSW5zZXJ0ZWQoMiwgMiwgMSksXG5cdFx0XHRdLFxuXHRcdFx0Mixcblx0XHRcdGZhbHNlLFxuXHRcdFx0ZmFsc2Vcblx0XHQpKTtcblx0fSk7XG5cblxuXHQvLyAtLS0tLS0tLS0gZGVsZXRlIHRleHRcblxuXHR0ZXN0KCdtb2RlbCBkZWxldGUgZW1wdHkgdGV4dCcsICgpID0+IHtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5kZWxldGUobmV3IFJhbmdlKDEsIDEsIDEsIDEpKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvdW50KCksIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdNeSBGaXJzdCBMaW5lJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsIGRlbGV0ZSB0ZXh0IGZyb20gb25lIGxpbmUnLCAoKSA9PiB7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uZGVsZXRlKG5ldyBSYW5nZSgxLCAxLCAxLCAyKSldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb3VudCgpLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb250ZW50KDEpLCAneSBGaXJzdCBMaW5lJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsIGRlbGV0ZSB0ZXh0IGZyb20gb25lIGxpbmUgMicsICgpID0+IHtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDEsIDEpLCAnYScpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ2FNeSBGaXJzdCBMaW5lJyk7XG5cblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5kZWxldGUobmV3IFJhbmdlKDEsIDIsIDEsIDQpKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvdW50KCksIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdhIEZpcnN0IExpbmUnKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgZGVsZXRlIGFsbCB0ZXh0IGZyb20gYSBsaW5lJywgKCkgPT4ge1xuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmRlbGV0ZShuZXcgUmFuZ2UoMSwgMSwgMSwgMTQpKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvdW50KCksIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcnKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgZGVsZXRlIHRleHQgZnJvbSB0d28gbGluZXMnLCAoKSA9PiB7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uZGVsZXRlKG5ldyBSYW5nZSgxLCA0LCAyLCA2KSldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb3VudCgpLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb250ZW50KDEpLCAnTXkgU2Vjb25kIExpbmUnKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgZGVsZXRlIHRleHQgZnJvbSBtYW55IGxpbmVzJywgKCkgPT4ge1xuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmRlbGV0ZShuZXcgUmFuZ2UoMSwgNCwgMywgNSkpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ291bnQoKSwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ015IFRoaXJkIExpbmUnKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgZGVsZXRlIGV2ZXJ5dGhpbmcnLCAoKSA9PiB7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uZGVsZXRlKG5ldyBSYW5nZSgxLCAxLCA1LCAyKSldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb3VudCgpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb250ZW50KDEpLCAnJyk7XG5cdH0pO1xuXG5cdC8vIC0tLS0tLS0tLSBkZWxldGUgdGV4dCBldmVudGluZ1xuXG5cdHRlc3QoJ21vZGVsIGRlbGV0ZSBlbXB0eSB0ZXh0IGRvZXMgbm90IHRyaWdnZXIgZXZlbnRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZSA9IHdpdGhFdmVudENhcHR1cmluZygoKSA9PiB7XG5cdFx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5kZWxldGUobmV3IFJhbmdlKDEsIDEsIDEsIDEpKV0pO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZSwgbnVsbCwgJ3dhcyBub3QgZXhwZWN0aW5nIGV2ZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsIGRlbGV0ZSB0ZXh0IGZyb20gb25lIGxpbmUgZXZlbnRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZSA9IHdpdGhFdmVudENhcHR1cmluZygoKSA9PiB7XG5cdFx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5kZWxldGUobmV3IFJhbmdlKDEsIDEsIDEsIDIpKV0pO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZSwgbmV3IE1vZGVsUmF3Q29udGVudENoYW5nZWRFdmVudChcblx0XHRcdFtcblx0XHRcdFx0bmV3IE1vZGVsUmF3TGluZUNoYW5nZWQoMSwgMSksXG5cdFx0XHRdLFxuXHRcdFx0Mixcblx0XHRcdGZhbHNlLFxuXHRcdFx0ZmFsc2Vcblx0XHQpKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgZGVsZXRlIGFsbCB0ZXh0IGZyb20gYSBsaW5lIGV2ZW50aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGUgPSB3aXRoRXZlbnRDYXB0dXJpbmcoKCkgPT4ge1xuXHRcdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uZGVsZXRlKG5ldyBSYW5nZSgxLCAxLCAxLCAxNCkpXSk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlLCBuZXcgTW9kZWxSYXdDb250ZW50Q2hhbmdlZEV2ZW50KFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgTW9kZWxSYXdMaW5lQ2hhbmdlZCgxLCAxKSxcblx0XHRcdF0sXG5cdFx0XHQyLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRmYWxzZVxuXHRcdCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCBkZWxldGUgdGV4dCBmcm9tIHR3byBsaW5lcyBldmVudGluZycsICgpID0+IHtcblx0XHRjb25zdCBlID0gd2l0aEV2ZW50Q2FwdHVyaW5nKCgpID0+IHtcblx0XHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmRlbGV0ZShuZXcgUmFuZ2UoMSwgNCwgMiwgNikpXSk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlLCBuZXcgTW9kZWxSYXdDb250ZW50Q2hhbmdlZEV2ZW50KFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgTW9kZWxSYXdMaW5lQ2hhbmdlZCgxLCAxKSxcblx0XHRcdFx0bmV3IE1vZGVsUmF3TGluZXNEZWxldGVkKDIsIDIsIDEpLFxuXHRcdFx0XSxcblx0XHRcdDIsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGZhbHNlXG5cdFx0KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsIGRlbGV0ZSB0ZXh0IGZyb20gbWFueSBsaW5lcyBldmVudGluZycsICgpID0+IHtcblx0XHRjb25zdCBlID0gd2l0aEV2ZW50Q2FwdHVyaW5nKCgpID0+IHtcblx0XHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmRlbGV0ZShuZXcgUmFuZ2UoMSwgNCwgMywgNSkpXSk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlLCBuZXcgTW9kZWxSYXdDb250ZW50Q2hhbmdlZEV2ZW50KFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgTW9kZWxSYXdMaW5lQ2hhbmdlZCgxLCAxKSxcblx0XHRcdFx0bmV3IE1vZGVsUmF3TGluZXNEZWxldGVkKDIsIDMsIDEpLFxuXHRcdFx0XSxcblx0XHRcdDIsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGZhbHNlXG5cdFx0KSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0tLS0tLSBnZXRWYWx1ZUluUmFuZ2VcblxuXHR0ZXN0KCdnZXRWYWx1ZUluUmFuZ2UnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDEpKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxLCAyKSksICdNJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDEsIDMpKSwgJ3knKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMSwgMTQpKSwgJ015IEZpcnN0IExpbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMiwgMSkpLCAnTXkgRmlyc3QgTGluZVxcbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAyLCAyKSksICdNeSBGaXJzdCBMaW5lXFxuXFx0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDIsIDMpKSwgJ015IEZpcnN0IExpbmVcXG5cXHRcXHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMiwgMTcpKSwgJ015IEZpcnN0IExpbmVcXG5cXHRcXHRNeSBTZWNvbmQgTGluZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAzLCAxKSksICdNeSBGaXJzdCBMaW5lXFxuXFx0XFx0TXkgU2Vjb25kIExpbmVcXG4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgNCwgMSkpLCAnTXkgRmlyc3QgTGluZVxcblxcdFxcdE15IFNlY29uZCBMaW5lXFxuICAgIFRoaXJkIExpbmVcXG4nKTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tIGdldFZhbHVlTGVuZ3RoSW5SYW5nZVxuXG5cdHRlc3QoJ2dldFZhbHVlTGVuZ3RoSW5SYW5nZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMSwgMSkpLCAnJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxLCAyKSksICdNJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAyLCAxLCAzKSksICd5Jy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxLCAxNCkpLCAnTXkgRmlyc3QgTGluZScubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMiwgMSkpLCAnTXkgRmlyc3QgTGluZVxcbicubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMiwgMikpLCAnTXkgRmlyc3QgTGluZVxcblxcdCcubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMiwgMykpLCAnTXkgRmlyc3QgTGluZVxcblxcdFxcdCcubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMiwgMTcpKSwgJ015IEZpcnN0IExpbmVcXG5cXHRcXHRNeSBTZWNvbmQgTGluZScubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMywgMSkpLCAnTXkgRmlyc3QgTGluZVxcblxcdFxcdE15IFNlY29uZCBMaW5lXFxuJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCA0LCAxKSksICdNeSBGaXJzdCBMaW5lXFxuXFx0XFx0TXkgU2Vjb25kIExpbmVcXG4gICAgVGhpcmQgTGluZVxcbicubGVuZ3RoKTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tIHNldFZhbHVlXG5cdHRlc3QoJ3NldFZhbHVlIGV2ZW50aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGUgPSB3aXRoRXZlbnRDYXB0dXJpbmcoKCkgPT4ge1xuXHRcdFx0dGhpc01vZGVsLnNldFZhbHVlKCduZXcgdmFsdWUnKTtcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGUsIG5ldyBNb2RlbFJhd0NvbnRlbnRDaGFuZ2VkRXZlbnQoXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBNb2RlbFJhd0ZsdXNoKClcblx0XHRcdF0sXG5cdFx0XHQyLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRmYWxzZVxuXHRcdCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDYzNDI6IE1haW50YWluIGVkaXQgb3BlcmF0aW9uIG9yZGVyIGluIGFwcGx5RWRpdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzID0gdGhpc01vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDIsIDEsIDIsIDEpLCB0ZXh0OiAnYScgfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgdGV4dDogJ2InIH0sXG5cdFx0XSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc1swXS5yYW5nZSwgbmV3IFJhbmdlKDIsIDEsIDIsIDIpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc1sxXS5yYW5nZSwgbmV3IFJhbmdlKDEsIDEsIDEsIDIpKTtcblx0fSk7XG59KTtcblxuXG4vLyAtLS0tLS0tLS0gU3BlY2lhbCBVbmljb2RlIExJTkUgU0VQQVJBVE9SIGNoYXJhY3Rlclxuc3VpdGUoJ0VkaXRvciBNb2RlbCAtIE1vZGVsIExpbmUgU2VwYXJhdG9ycycsICgpID0+IHtcblxuXHRsZXQgdGhpc01vZGVsOiBUZXh0TW9kZWw7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPVxuXHRcdFx0TElORTEgKyAnXFx1MjAyOCcgK1xuXHRcdFx0TElORTIgKyAnXFxuJyArXG5cdFx0XHRMSU5FMyArICdcXHUyMDI4JyArXG5cdFx0XHRMSU5FNCArICdcXHJcXG4nICtcblx0XHRcdExJTkU1O1xuXHRcdHRoaXNNb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCh0ZXh0KTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHRoaXNNb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ21vZGVsIGdldFZhbHVlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWUoKSwgJ015IEZpcnN0IExpbmVcXHUyMDI4XFx0XFx0TXkgU2Vjb25kIExpbmVcXG4gICAgVGhpcmQgTGluZVxcdTIwMjhcXG4xJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsIGxpbmVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvdW50KCksIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdCdWcgMTMzMzM6TW9kZWwgc2hvdWxkIGxpbmUgYnJlYWsgb24gbG9uZWx5IENSIHRvbycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnSGVsbG9cXHJXb3JsZCFcXHJcXG5Bbm90aGVyIGxpbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvdW50KCksIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnSGVsbG9cXHJcXG5Xb3JsZCFcXHJcXG5Bbm90aGVyIGxpbmUnKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG5cblxuLy8gLS0tLS0tLS0tIFdvcmRzXG5cbnN1aXRlKCdFZGl0b3IgTW9kZWwgLSBXb3JkcycsICgpID0+IHtcblxuXHRjb25zdCBPVVRFUl9MQU5HVUFHRV9JRCA9ICdvdXRlck1vZGUnO1xuXHRjb25zdCBJTk5FUl9MQU5HVUFHRV9JRCA9ICdpbm5lck1vZGUnO1xuXG5cdGNsYXNzIE91dGVyTW9kZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdFx0cHVibGljIHJlYWRvbmx5IGxhbmd1YWdlSWQgPSBPVVRFUl9MQU5HVUFHRV9JRDtcblxuXHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0QElMYW5ndWFnZVNlcnZpY2UgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdFx0QElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0KSB7XG5cdFx0XHRzdXBlcigpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogdGhpcy5sYW5ndWFnZUlkIH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIodGhpcy5sYW5ndWFnZUlkLCB7fSkpO1xuXG5cdFx0XHRjb25zdCBsYW5ndWFnZUlkQ29kZWMgPSBsYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIodGhpcy5sYW5ndWFnZUlkLCB7XG5cdFx0XHRcdGdldEluaXRpYWxTdGF0ZTogKCk6IElTdGF0ZSA9PiBOdWxsU3RhdGUsXG5cdFx0XHRcdHRva2VuaXplOiB1bmRlZmluZWQhLFxuXHRcdFx0XHR0b2tlbml6ZUVuY29kZWQ6IChsaW5lOiBzdHJpbmcsIGhhc0VPTDogYm9vbGVhbiwgc3RhdGU6IElTdGF0ZSk6IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRva2Vuc0FycjogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0XHRsZXQgcHJldkxhbmd1YWdlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmUubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxhbmd1YWdlSWQgPSAobGluZS5jaGFyQXQoaSkgPT09ICd4JyA/IElOTkVSX0xBTkdVQUdFX0lEIDogT1VURVJfTEFOR1VBR0VfSUQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZW5jb2RlZExhbmd1YWdlSWQgPSBsYW5ndWFnZUlkQ29kZWMuZW5jb2RlTGFuZ3VhZ2VJZChsYW5ndWFnZUlkKTtcblx0XHRcdFx0XHRcdGlmIChwcmV2TGFuZ3VhZ2VJZCAhPT0gbGFuZ3VhZ2VJZCkge1xuXHRcdFx0XHRcdFx0XHR0b2tlbnNBcnIucHVzaChpKTtcblx0XHRcdFx0XHRcdFx0dG9rZW5zQXJyLnB1c2goKGVuY29kZWRMYW5ndWFnZUlkIDw8IE1ldGFkYXRhQ29uc3RzLkxBTkdVQUdFSURfT0ZGU0VUKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRwcmV2TGFuZ3VhZ2VJZCA9IGxhbmd1YWdlSWQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbmV3IFVpbnQzMkFycmF5KHRva2Vuc0Fyci5sZW5ndGgpO1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHR0b2tlbnNbaV0gPSB0b2tlbnNBcnJbaV07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBuZXcgRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCh0b2tlbnMsIFtdLCBzdGF0ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRjbGFzcyBJbm5lck1vZGUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRcdHB1YmxpYyByZWFkb25seSBsYW5ndWFnZUlkID0gSU5ORVJfTEFOR1VBR0VfSUQ7XG5cblx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRcdEBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZVxuXHRcdCkge1xuXHRcdFx0c3VwZXIoKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IHRoaXMubGFuZ3VhZ2VJZCB9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VJZCwge30pKTtcblx0XHR9XG5cdH1cblxuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVbXSA9IFtdO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IFtdO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zZShkaXNwb3NhYmxlcyk7XG5cdFx0ZGlzcG9zYWJsZXMgPSBbXTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnR2V0IHdvcmQgYXQgcG9zaXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9IFsnVGhpcyB0ZXh0IGhhcyBzb21lICB3b3Jkcy4gJ107XG5cdFx0Y29uc3QgdGhpc01vZGVsID0gY3JlYXRlVGV4dE1vZGVsKHRleHQuam9pbignXFxuJykpO1xuXHRcdGRpc3Bvc2FibGVzLnB1c2godGhpc01vZGVsKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxKSksIHsgd29yZDogJ1RoaXMnLCBzdGFydENvbHVtbjogMSwgZW5kQ29sdW1uOiA1IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAyKSksIHsgd29yZDogJ1RoaXMnLCBzdGFydENvbHVtbjogMSwgZW5kQ29sdW1uOiA1IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA0KSksIHsgd29yZDogJ1RoaXMnLCBzdGFydENvbHVtbjogMSwgZW5kQ29sdW1uOiA1IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA1KSksIHsgd29yZDogJ1RoaXMnLCBzdGFydENvbHVtbjogMSwgZW5kQ29sdW1uOiA1IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA2KSksIHsgd29yZDogJ3RleHQnLCBzdGFydENvbHVtbjogNiwgZW5kQ29sdW1uOiAxMCB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMTkpKSwgeyB3b3JkOiAnc29tZScsIHN0YXJ0Q29sdW1uOiAxNSwgZW5kQ29sdW1uOiAxOSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMjApKSwgbnVsbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0V29yZEF0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDIxKSksIHsgd29yZDogJ3dvcmRzJywgc3RhcnRDb2x1bW46IDIxLCBlbmRDb2x1bW46IDI2IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAyNikpLCB7IHdvcmQ6ICd3b3JkcycsIHN0YXJ0Q29sdW1uOiAyMSwgZW5kQ29sdW1uOiAyNiB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMjcpKSwgbnVsbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0V29yZEF0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDI4KSksIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRXb3JkQXRQb3NpdGlvbiBhdCBlbWJlZGRlZCBsYW5ndWFnZSBib3VuZGFyaWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlTW9kZWxTZXJ2aWNlcyhkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3Qgb3V0ZXJNb2RlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE91dGVyTW9kZSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbm5lck1vZGUpKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCAnYWI8eHg+YWI8eD4nLCBvdXRlck1vZGUubGFuZ3VhZ2VJZCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMSkpLCB7IHdvcmQ6ICdhYicsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDMgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMikpLCB7IHdvcmQ6ICdhYicsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDMgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMykpLCB7IHdvcmQ6ICdhYicsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDMgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNCkpLCB7IHdvcmQ6ICd4eCcsIHN0YXJ0Q29sdW1uOiA0LCBlbmRDb2x1bW46IDYgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNSkpLCB7IHdvcmQ6ICd4eCcsIHN0YXJ0Q29sdW1uOiA0LCBlbmRDb2x1bW46IDYgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNikpLCB7IHdvcmQ6ICd4eCcsIHN0YXJ0Q29sdW1uOiA0LCBlbmRDb2x1bW46IDYgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNykpLCB7IHdvcmQ6ICdhYicsIHN0YXJ0Q29sdW1uOiA3LCBlbmRDb2x1bW46IDkgfSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM2MTI5NjogVlMgY29kZSBmcmVlemVzIHdoZW4gZWRpdGluZyBDU1MgZmlsZSB3aXRoIGVtb2ppJywgKCkgPT4ge1xuXHRcdGNvbnN0IE1PREVfSUQgPSAndGVzdE1vZGUnO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlTW9kZWxTZXJ2aWNlcyhkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IE1PREVfSUQgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKE1PREVfSUQsIHtcblx0XHRcdHdvcmRQYXR0ZXJuOiAvKCM/LT9cXGQqXFwuXFxkXFx3KiU/KXwoOjo/W1xcdy1dKig/PVteLHs7XSpbLHtdKSl8KChbQCMuIV0pP1tcXHctP10rJT98W0AjIS5dKS9nXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdGhpc01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCAnLlx1RDgzRFx1REMzNy1hLWInLCBNT0RFX0lEKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMSkpLCB7IHdvcmQ6ICcuJywgc3RhcnRDb2x1bW46IDEsIGVuZENvbHVtbjogMiB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMikpLCB7IHdvcmQ6ICcuJywgc3RhcnRDb2x1bW46IDEsIGVuZENvbHVtbjogMiB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMykpLCBudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNCkpLCB7IHdvcmQ6ICctYS1iJywgc3RhcnRDb2x1bW46IDQsIGVuZENvbHVtbjogOCB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNSkpLCB7IHdvcmQ6ICctYS1iJywgc3RhcnRDb2x1bW46IDQsIGVuZENvbHVtbjogOCB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNikpLCB7IHdvcmQ6ICctYS1iJywgc3RhcnRDb2x1bW46IDQsIGVuZENvbHVtbjogOCB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNykpLCB7IHdvcmQ6ICctYS1iJywgc3RhcnRDb2x1bW46IDQsIGVuZENvbHVtbjogOCB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgOCkpLCB7IHdvcmQ6ICctYS1iJywgc3RhcnRDb2x1bW46IDQsIGVuZENvbHVtbjogOCB9KTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBw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
