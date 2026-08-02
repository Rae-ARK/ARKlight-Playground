import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TrimTrailingWhitespaceCommand, trimTrailingWhitespace } from "../../../common/commands/trimTrailingWhitespaceCommand.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { MetadataConsts, StandardTokenType } from "../../../common/encodedTokenAttributes.js";
import { EncodedTokenizationResult, TokenizationRegistry } from "../../../common/languages.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { NullState } from "../../../common/languages/nullTokenize.js";
import { getEditOperation } from "../testCommand.js";
import { createModelServices, instantiateTextModel, withEditorModel } from "../../common/testTextModel.js";
function createInsertDeleteSingleEditOp(text, positionLineNumber, positionColumn, selectionLineNumber = positionLineNumber, selectionColumn = positionColumn) {
  return {
    range: new Range(selectionLineNumber, selectionColumn, positionLineNumber, positionColumn),
    text
  };
}
function createSingleEditOp(text, positionLineNumber, positionColumn, selectionLineNumber = positionLineNumber, selectionColumn = positionColumn) {
  return {
    range: new Range(selectionLineNumber, selectionColumn, positionLineNumber, positionColumn),
    text,
    forceMoveMarkers: false
  };
}
function assertTrimTrailingWhitespaceCommand(text, expected) {
  return withEditorModel(text, (model) => {
    const op = new TrimTrailingWhitespaceCommand(new Selection(1, 1, 1, 1), [], true);
    const actual = getEditOperation(model, op);
    assert.deepStrictEqual(actual, expected);
  });
}
function assertTrimTrailingWhitespace(text, cursors, expected) {
  return withEditorModel(text, (model) => {
    const actual = trimTrailingWhitespace(model, cursors, true);
    assert.deepStrictEqual(actual, expected);
  });
}
suite("Editor Commands - Trim Trailing Whitespace Command", () => {
  let disposables;
  setup(() => {
    disposables = new DisposableStore();
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("remove trailing whitespace", function() {
    assertTrimTrailingWhitespaceCommand([""], []);
    assertTrimTrailingWhitespaceCommand(["text"], []);
    assertTrimTrailingWhitespaceCommand(["text   "], [createSingleEditOp(null, 1, 5, 1, 8)]);
    assertTrimTrailingWhitespaceCommand(["text	   "], [createSingleEditOp(null, 1, 5, 1, 9)]);
    assertTrimTrailingWhitespaceCommand(["	   "], [createSingleEditOp(null, 1, 1, 1, 5)]);
    assertTrimTrailingWhitespaceCommand(["text	"], [createSingleEditOp(null, 1, 5, 1, 6)]);
    assertTrimTrailingWhitespaceCommand([
      "some text	",
      "some more text",
      "	  ",
      "even more text  ",
      "and some mixed	   	"
    ], [
      createSingleEditOp(null, 1, 10, 1, 11),
      createSingleEditOp(null, 3, 1, 3, 4),
      createSingleEditOp(null, 4, 15, 4, 17),
      createSingleEditOp(null, 5, 15, 5, 20)
    ]);
    assertTrimTrailingWhitespace(["text   "], [new Position(1, 1), new Position(1, 2), new Position(1, 3)], [createInsertDeleteSingleEditOp(null, 1, 5, 1, 8)]);
    assertTrimTrailingWhitespace(["text   "], [new Position(1, 1), new Position(1, 5)], [createInsertDeleteSingleEditOp(null, 1, 5, 1, 8)]);
    assertTrimTrailingWhitespace(["text   "], [new Position(1, 1), new Position(1, 5), new Position(1, 6)], [createInsertDeleteSingleEditOp(null, 1, 6, 1, 8)]);
    assertTrimTrailingWhitespace([
      "some text	",
      "some more text",
      "	  ",
      "even more text  ",
      "and some mixed	   	"
    ], [], [
      createInsertDeleteSingleEditOp(null, 1, 10, 1, 11),
      createInsertDeleteSingleEditOp(null, 3, 1, 3, 4),
      createInsertDeleteSingleEditOp(null, 4, 15, 4, 17),
      createInsertDeleteSingleEditOp(null, 5, 15, 5, 20)
    ]);
    assertTrimTrailingWhitespace([
      "some text	",
      "some more text",
      "	  ",
      "even more text  ",
      "and some mixed	   	"
    ], [new Position(1, 11), new Position(3, 2), new Position(5, 1), new Position(4, 1), new Position(5, 10)], [
      createInsertDeleteSingleEditOp(null, 3, 2, 3, 4),
      createInsertDeleteSingleEditOp(null, 4, 15, 4, 17),
      createInsertDeleteSingleEditOp(null, 5, 15, 5, 20)
    ]);
  });
  test("skips strings and regex if configured", function() {
    const instantiationService = createModelServices(disposables);
    const languageService = instantiationService.get(ILanguageService);
    const languageId = "testLanguageId";
    const languageIdCodec = languageService.languageIdCodec;
    disposables.add(languageService.registerLanguage({ id: languageId }));
    const encodedLanguageId = languageIdCodec.encodeLanguageId(languageId);
    const otherMetadata = (encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET | StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET | MetadataConsts.BALANCED_BRACKETS_MASK) >>> 0;
    const stringMetadata = (encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET | StandardTokenType.String << MetadataConsts.TOKEN_TYPE_OFFSET | MetadataConsts.BALANCED_BRACKETS_MASK) >>> 0;
    const tokenizationSupport = {
      getInitialState: () => NullState,
      tokenize: void 0,
      tokenizeEncoded: (line, hasEOL, state) => {
        switch (line) {
          case "const a = `  ": {
            const tokens = new Uint32Array([
              0,
              otherMetadata,
              10,
              stringMetadata
            ]);
            return new EncodedTokenizationResult(tokens, [], state);
          }
          case "  a string  ": {
            const tokens = new Uint32Array([
              0,
              stringMetadata
            ]);
            return new EncodedTokenizationResult(tokens, [], state);
          }
          case "`;  ": {
            const tokens = new Uint32Array([
              0,
              stringMetadata,
              1,
              otherMetadata
            ]);
            return new EncodedTokenizationResult(tokens, [], state);
          }
        }
        throw new Error(`Unexpected`);
      }
    };
    disposables.add(TokenizationRegistry.register(languageId, tokenizationSupport));
    const model = disposables.add(instantiateTextModel(
      instantiationService,
      [
        "const a = `  ",
        "  a string  ",
        "`;  "
      ].join("\n"),
      languageId
    ));
    model.tokenization.forceTokenization(1);
    model.tokenization.forceTokenization(2);
    model.tokenization.forceTokenization(3);
    const op = new TrimTrailingWhitespaceCommand(new Selection(1, 1, 1, 1), [], false);
    const actual = getEditOperation(model, op);
    assert.deepStrictEqual(actual, [createSingleEditOp(null, 3, 3, 3, 5)]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvY29tbWFuZHMvdHJpbVRyYWlsaW5nV2hpdGVzcGFjZUNvbW1hbmQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRyaW1UcmFpbGluZ1doaXRlc3BhY2VDb21tYW5kLCB0cmltVHJhaWxpbmdXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbW1hbmRzL3RyaW1UcmFpbGluZ1doaXRlc3BhY2VDb21tYW5kLmpzJztcbmltcG9ydCB7IElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IE1ldGFkYXRhQ29uc3RzLCBTdGFuZGFyZFRva2VuVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQsIElUb2tlbml6YXRpb25TdXBwb3J0LCBUb2tlbml6YXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgTnVsbFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9udWxsVG9rZW5pemUuanMnO1xuaW1wb3J0IHsgZ2V0RWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uL3Rlc3RDb21tYW5kLmpzJztcbmltcG9ydCB7IGNyZWF0ZU1vZGVsU2VydmljZXMsIGluc3RhbnRpYXRlVGV4dE1vZGVsLCB3aXRoRWRpdG9yTW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5cbi8qKlxuICogQ3JlYXRlIHNpbmdsZSBlZGl0IG9wZXJhdGlvblxuICovXG5mdW5jdGlvbiBjcmVhdGVJbnNlcnREZWxldGVTaW5nbGVFZGl0T3AodGV4dDogc3RyaW5nIHwgbnVsbCwgcG9zaXRpb25MaW5lTnVtYmVyOiBudW1iZXIsIHBvc2l0aW9uQ29sdW1uOiBudW1iZXIsIHNlbGVjdGlvbkxpbmVOdW1iZXI6IG51bWJlciA9IHBvc2l0aW9uTGluZU51bWJlciwgc2VsZWN0aW9uQ29sdW1uOiBudW1iZXIgPSBwb3NpdGlvbkNvbHVtbik6IElTaW5nbGVFZGl0T3BlcmF0aW9uIHtcblx0cmV0dXJuIHtcblx0XHRyYW5nZTogbmV3IFJhbmdlKHNlbGVjdGlvbkxpbmVOdW1iZXIsIHNlbGVjdGlvbkNvbHVtbiwgcG9zaXRpb25MaW5lTnVtYmVyLCBwb3NpdGlvbkNvbHVtbiksXG5cdFx0dGV4dDogdGV4dFxuXHR9O1xufVxuXG4vKipcbiAqIENyZWF0ZSBzaW5nbGUgZWRpdCBvcGVyYXRpb25cbiAqL1xuZnVuY3Rpb24gY3JlYXRlU2luZ2xlRWRpdE9wKHRleHQ6IHN0cmluZyB8IG51bGwsIHBvc2l0aW9uTGluZU51bWJlcjogbnVtYmVyLCBwb3NpdGlvbkNvbHVtbjogbnVtYmVyLCBzZWxlY3Rpb25MaW5lTnVtYmVyOiBudW1iZXIgPSBwb3NpdGlvbkxpbmVOdW1iZXIsIHNlbGVjdGlvbkNvbHVtbjogbnVtYmVyID0gcG9zaXRpb25Db2x1bW4pOiBJU2luZ2xlRWRpdE9wZXJhdGlvbiB7XG5cdHJldHVybiB7XG5cdFx0cmFuZ2U6IG5ldyBSYW5nZShzZWxlY3Rpb25MaW5lTnVtYmVyLCBzZWxlY3Rpb25Db2x1bW4sIHBvc2l0aW9uTGluZU51bWJlciwgcG9zaXRpb25Db2x1bW4pLFxuXHRcdHRleHQ6IHRleHQsXG5cdFx0Zm9yY2VNb3ZlTWFya2VyczogZmFsc2Vcblx0fTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0VHJpbVRyYWlsaW5nV2hpdGVzcGFjZUNvbW1hbmQodGV4dDogc3RyaW5nW10sIGV4cGVjdGVkOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdKTogdm9pZCB7XG5cdHJldHVybiB3aXRoRWRpdG9yTW9kZWwodGV4dCwgKG1vZGVsKSA9PiB7XG5cdFx0Y29uc3Qgb3AgPSBuZXcgVHJpbVRyYWlsaW5nV2hpdGVzcGFjZUNvbW1hbmQobmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSwgW10sIHRydWUpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGdldEVkaXRPcGVyYXRpb24obW9kZWwsIG9wKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0VHJpbVRyYWlsaW5nV2hpdGVzcGFjZSh0ZXh0OiBzdHJpbmdbXSwgY3Vyc29yczogUG9zaXRpb25bXSwgZXhwZWN0ZWQ6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10pOiB2b2lkIHtcblx0cmV0dXJuIHdpdGhFZGl0b3JNb2RlbCh0ZXh0LCAobW9kZWwpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSB0cmltVHJhaWxpbmdXaGl0ZXNwYWNlKG1vZGVsLCBjdXJzb3JzLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcbn1cblxuc3VpdGUoJ0VkaXRvciBDb21tYW5kcyAtIFRyaW0gVHJhaWxpbmcgV2hpdGVzcGFjZSBDb21tYW5kJywgKCkgPT4ge1xuXG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVtb3ZlIHRyYWlsaW5nIHdoaXRlc3BhY2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0VHJpbVRyYWlsaW5nV2hpdGVzcGFjZUNvbW1hbmQoWycnXSwgW10pO1xuXHRcdGFzc2VydFRyaW1UcmFpbGluZ1doaXRlc3BhY2VDb21tYW5kKFsndGV4dCddLCBbXSk7XG5cdFx0YXNzZXJ0VHJpbVRyYWlsaW5nV2hpdGVzcGFjZUNvbW1hbmQoWyd0ZXh0ICAgJ10sIFtjcmVhdGVTaW5nbGVFZGl0T3AobnVsbCwgMSwgNSwgMSwgOCldKTtcblx0XHRhc3NlcnRUcmltVHJhaWxpbmdXaGl0ZXNwYWNlQ29tbWFuZChbJ3RleHRcXHQgICAnXSwgW2NyZWF0ZVNpbmdsZUVkaXRPcChudWxsLCAxLCA1LCAxLCA5KV0pO1xuXHRcdGFzc2VydFRyaW1UcmFpbGluZ1doaXRlc3BhY2VDb21tYW5kKFsnXFx0ICAgJ10sIFtjcmVhdGVTaW5nbGVFZGl0T3AobnVsbCwgMSwgMSwgMSwgNSldKTtcblx0XHRhc3NlcnRUcmltVHJhaWxpbmdXaGl0ZXNwYWNlQ29tbWFuZChbJ3RleHRcXHQnXSwgW2NyZWF0ZVNpbmdsZUVkaXRPcChudWxsLCAxLCA1LCAxLCA2KV0pO1xuXHRcdGFzc2VydFRyaW1UcmFpbGluZ1doaXRlc3BhY2VDb21tYW5kKFtcblx0XHRcdCdzb21lIHRleHRcXHQnLFxuXHRcdFx0J3NvbWUgbW9yZSB0ZXh0Jyxcblx0XHRcdCdcXHQgICcsXG5cdFx0XHQnZXZlbiBtb3JlIHRleHQgICcsXG5cdFx0XHQnYW5kIHNvbWUgbWl4ZWRcXHQgICBcXHQnXG5cdFx0XSwgW1xuXHRcdFx0Y3JlYXRlU2luZ2xlRWRpdE9wKG51bGwsIDEsIDEwLCAxLCAxMSksXG5cdFx0XHRjcmVhdGVTaW5nbGVFZGl0T3AobnVsbCwgMywgMSwgMywgNCksXG5cdFx0XHRjcmVhdGVTaW5nbGVFZGl0T3AobnVsbCwgNCwgMTUsIDQsIDE3KSxcblx0XHRcdGNyZWF0ZVNpbmdsZUVkaXRPcChudWxsLCA1LCAxNSwgNSwgMjApXG5cdFx0XSk7XG5cblxuXHRcdGFzc2VydFRyaW1UcmFpbGluZ1doaXRlc3BhY2UoWyd0ZXh0ICAgJ10sIFtuZXcgUG9zaXRpb24oMSwgMSksIG5ldyBQb3NpdGlvbigxLCAyKSwgbmV3IFBvc2l0aW9uKDEsIDMpXSwgW2NyZWF0ZUluc2VydERlbGV0ZVNpbmdsZUVkaXRPcChudWxsLCAxLCA1LCAxLCA4KV0pO1xuXHRcdGFzc2VydFRyaW1UcmFpbGluZ1doaXRlc3BhY2UoWyd0ZXh0ICAgJ10sIFtuZXcgUG9zaXRpb24oMSwgMSksIG5ldyBQb3NpdGlvbigxLCA1KV0sIFtjcmVhdGVJbnNlcnREZWxldGVTaW5nbGVFZGl0T3AobnVsbCwgMSwgNSwgMSwgOCldKTtcblx0XHRhc3NlcnRUcmltVHJhaWxpbmdXaGl0ZXNwYWNlKFsndGV4dCAgICddLCBbbmV3IFBvc2l0aW9uKDEsIDEpLCBuZXcgUG9zaXRpb24oMSwgNSksIG5ldyBQb3NpdGlvbigxLCA2KV0sIFtjcmVhdGVJbnNlcnREZWxldGVTaW5nbGVFZGl0T3AobnVsbCwgMSwgNiwgMSwgOCldKTtcblx0XHRhc3NlcnRUcmltVHJhaWxpbmdXaGl0ZXNwYWNlKFtcblx0XHRcdCdzb21lIHRleHRcXHQnLFxuXHRcdFx0J3NvbWUgbW9yZSB0ZXh0Jyxcblx0XHRcdCdcXHQgICcsXG5cdFx0XHQnZXZlbiBtb3JlIHRleHQgICcsXG5cdFx0XHQnYW5kIHNvbWUgbWl4ZWRcXHQgICBcXHQnXG5cdFx0XSwgW10sIFtcblx0XHRcdGNyZWF0ZUluc2VydERlbGV0ZVNpbmdsZUVkaXRPcChudWxsLCAxLCAxMCwgMSwgMTEpLFxuXHRcdFx0Y3JlYXRlSW5zZXJ0RGVsZXRlU2luZ2xlRWRpdE9wKG51bGwsIDMsIDEsIDMsIDQpLFxuXHRcdFx0Y3JlYXRlSW5zZXJ0RGVsZXRlU2luZ2xlRWRpdE9wKG51bGwsIDQsIDE1LCA0LCAxNyksXG5cdFx0XHRjcmVhdGVJbnNlcnREZWxldGVTaW5nbGVFZGl0T3AobnVsbCwgNSwgMTUsIDUsIDIwKVxuXHRcdF0pO1xuXHRcdGFzc2VydFRyaW1UcmFpbGluZ1doaXRlc3BhY2UoW1xuXHRcdFx0J3NvbWUgdGV4dFxcdCcsXG5cdFx0XHQnc29tZSBtb3JlIHRleHQnLFxuXHRcdFx0J1xcdCAgJyxcblx0XHRcdCdldmVuIG1vcmUgdGV4dCAgJyxcblx0XHRcdCdhbmQgc29tZSBtaXhlZFxcdCAgIFxcdCdcblx0XHRdLCBbbmV3IFBvc2l0aW9uKDEsIDExKSwgbmV3IFBvc2l0aW9uKDMsIDIpLCBuZXcgUG9zaXRpb24oNSwgMSksIG5ldyBQb3NpdGlvbig0LCAxKSwgbmV3IFBvc2l0aW9uKDUsIDEwKV0sIFtcblx0XHRcdGNyZWF0ZUluc2VydERlbGV0ZVNpbmdsZUVkaXRPcChudWxsLCAzLCAyLCAzLCA0KSxcblx0XHRcdGNyZWF0ZUluc2VydERlbGV0ZVNpbmdsZUVkaXRPcChudWxsLCA0LCAxNSwgNCwgMTcpLFxuXHRcdFx0Y3JlYXRlSW5zZXJ0RGVsZXRlU2luZ2xlRWRpdE9wKG51bGwsIDUsIDE1LCA1LCAyMClcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgc3RyaW5ncyBhbmQgcmVnZXggaWYgY29uZmlndXJlZCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZU1vZGVsU2VydmljZXMoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gJ3Rlc3RMYW5ndWFnZUlkJztcblx0XHRjb25zdCBsYW5ndWFnZUlkQ29kZWMgPSBsYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBsYW5ndWFnZUlkIH0pKTtcblx0XHRjb25zdCBlbmNvZGVkTGFuZ3VhZ2VJZCA9IGxhbmd1YWdlSWRDb2RlYy5lbmNvZGVMYW5ndWFnZUlkKGxhbmd1YWdlSWQpO1xuXG5cdFx0Y29uc3Qgb3RoZXJNZXRhZGF0YSA9IChcblx0XHRcdChlbmNvZGVkTGFuZ3VhZ2VJZCA8PCBNZXRhZGF0YUNvbnN0cy5MQU5HVUFHRUlEX09GRlNFVClcblx0XHRcdHwgKFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIDw8IE1ldGFkYXRhQ29uc3RzLlRPS0VOX1RZUEVfT0ZGU0VUKVxuXHRcdFx0fCAoTWV0YWRhdGFDb25zdHMuQkFMQU5DRURfQlJBQ0tFVFNfTUFTSylcblx0XHQpID4+PiAwO1xuXHRcdGNvbnN0IHN0cmluZ01ldGFkYXRhID0gKFxuXHRcdFx0KGVuY29kZWRMYW5ndWFnZUlkIDw8IE1ldGFkYXRhQ29uc3RzLkxBTkdVQUdFSURfT0ZGU0VUKVxuXHRcdFx0fCAoU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nIDw8IE1ldGFkYXRhQ29uc3RzLlRPS0VOX1RZUEVfT0ZGU0VUKVxuXHRcdFx0fCAoTWV0YWRhdGFDb25zdHMuQkFMQU5DRURfQlJBQ0tFVFNfTUFTSylcblx0XHQpID4+PiAwO1xuXG5cdFx0Y29uc3QgdG9rZW5pemF0aW9uU3VwcG9ydDogSVRva2VuaXphdGlvblN1cHBvcnQgPSB7XG5cdFx0XHRnZXRJbml0aWFsU3RhdGU6ICgpID0+IE51bGxTdGF0ZSxcblx0XHRcdHRva2VuaXplOiB1bmRlZmluZWQhLFxuXHRcdFx0dG9rZW5pemVFbmNvZGVkOiAobGluZSwgaGFzRU9MLCBzdGF0ZSkgPT4ge1xuXHRcdFx0XHRzd2l0Y2ggKGxpbmUpIHtcblx0XHRcdFx0XHRjYXNlICdjb25zdCBhID0gYCAgJzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdFx0XHRcdFx0MCwgb3RoZXJNZXRhZGF0YSxcblx0XHRcdFx0XHRcdFx0MTAsIHN0cmluZ01ldGFkYXRhLFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQodG9rZW5zLCBbXSwgc3RhdGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICcgIGEgc3RyaW5nICAnOiB7XG5cdFx0XHRcdFx0XHRjb25zdCB0b2tlbnMgPSBuZXcgVWludDMyQXJyYXkoW1xuXHRcdFx0XHRcdFx0XHQwLCBzdHJpbmdNZXRhZGF0YSxcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0KHRva2VucywgW10sIHN0YXRlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAnYDsgICc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IHRva2VucyA9IG5ldyBVaW50MzJBcnJheShbXG5cdFx0XHRcdFx0XHRcdDAsIHN0cmluZ01ldGFkYXRhLFxuXHRcdFx0XHRcdFx0XHQxLCBvdGhlck1ldGFkYXRhXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCh0b2tlbnMsIFtdLCBzdGF0ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZGApO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIobGFuZ3VhZ2VJZCwgdG9rZW5pemF0aW9uU3VwcG9ydCkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdFtcblx0XHRcdFx0J2NvbnN0IGEgPSBgICAnLFxuXHRcdFx0XHQnICBhIHN0cmluZyAgJyxcblx0XHRcdFx0J2A7ICAnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdGxhbmd1YWdlSWRcblx0XHQpKTtcblxuXHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbigxKTtcblx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24oMik7XG5cdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKDMpO1xuXG5cdFx0Y29uc3Qgb3AgPSBuZXcgVHJpbVRyYWlsaW5nV2hpdGVzcGFjZUNvbW1hbmQobmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSwgW10sIGZhbHNlKTtcblx0XHRjb25zdCBhY3R1YWwgPSBnZXRFZGl0T3BlcmF0aW9uKG1vZGVsLCBvcCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtjcmVhdGVTaW5nbGVFZGl0T3AobnVsbCwgMywgMywgMywgNSldKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLCtCQUErQiw4QkFBOEI7QUFFdEUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCLHlCQUF5QjtBQUNsRCxTQUFTLDJCQUFpRCw0QkFBNEI7QUFDdEYsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUIsc0JBQXNCLHVCQUF1QjtBQUszRSxTQUFTLCtCQUErQixNQUFxQixvQkFBNEIsZ0JBQXdCLHNCQUE4QixvQkFBb0Isa0JBQTBCLGdCQUFzQztBQUNsTyxTQUFPO0FBQUEsSUFDTixPQUFPLElBQUksTUFBTSxxQkFBcUIsaUJBQWlCLG9CQUFvQixjQUFjO0FBQUEsSUFDekY7QUFBQSxFQUNEO0FBQ0Q7QUFLQSxTQUFTLG1CQUFtQixNQUFxQixvQkFBNEIsZ0JBQXdCLHNCQUE4QixvQkFBb0Isa0JBQTBCLGdCQUFzQztBQUN0TixTQUFPO0FBQUEsSUFDTixPQUFPLElBQUksTUFBTSxxQkFBcUIsaUJBQWlCLG9CQUFvQixjQUFjO0FBQUEsSUFDekY7QUFBQSxJQUNBLGtCQUFrQjtBQUFBLEVBQ25CO0FBQ0Q7QUFFQSxTQUFTLG9DQUFvQyxNQUFnQixVQUF3QztBQUNwRyxTQUFPLGdCQUFnQixNQUFNLENBQUMsVUFBVTtBQUN2QyxVQUFNLEtBQUssSUFBSSw4QkFBOEIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENB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
