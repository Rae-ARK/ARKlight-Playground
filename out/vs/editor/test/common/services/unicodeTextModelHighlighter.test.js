import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Range } from "../../../common/core/range.js";
import { UnicodeTextModelHighlighter } from "../../../common/services/unicodeTextModelHighlighter.js";
import { createTextModel } from "../testTextModel.js";
suite("UnicodeTextModelHighlighter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function t(text, options) {
    const m = createTextModel(text);
    const r = UnicodeTextModelHighlighter.computeUnicodeHighlights(m, options);
    m.dispose();
    return {
      ...r,
      ranges: r.ranges.map((r2) => Range.lift(r2).toString())
    };
  }
  test("computeUnicodeHighlights (#168068)", () => {
    assert.deepStrictEqual(
      t(`
	For\xA0\xE5\xA0gi\xA0et\xA0eksempel
`, {
        allowedCodePoints: [],
        allowedLocales: [],
        ambiguousCharacters: true,
        invisibleCharacters: true,
        includeComments: false,
        includeStrings: false,
        nonBasicASCII: false
      }),
      {
        ambiguousCharacterCount: 0,
        hasMore: false,
        invisibleCharacterCount: 4,
        nonBasicAsciiCharacterCount: 0,
        ranges: [
          "[2,5 -> 2,6]",
          "[2,7 -> 2,8]",
          "[2,10 -> 2,11]",
          "[2,13 -> 2,14]"
        ]
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9zZXJ2aWNlcy91bmljb2RlVGV4dE1vZGVsSGlnaGxpZ2h0ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBVbmljb2RlSGlnaGxpZ2h0ZXJPcHRpb25zLCBVbmljb2RlVGV4dE1vZGVsSGlnaGxpZ2h0ZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvdW5pY29kZVRleHRNb2RlbEhpZ2hsaWdodGVyLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uL3Rlc3RUZXh0TW9kZWwuanMnO1xuXG5zdWl0ZSgnVW5pY29kZVRleHRNb2RlbEhpZ2hsaWdodGVyJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiB0KHRleHQ6IHN0cmluZywgb3B0aW9uczogVW5pY29kZUhpZ2hsaWdodGVyT3B0aW9ucyk6IHVua25vd24ge1xuXHRcdGNvbnN0IG0gPSBjcmVhdGVUZXh0TW9kZWwodGV4dCk7XG5cdFx0Y29uc3QgciA9IFVuaWNvZGVUZXh0TW9kZWxIaWdobGlnaHRlci5jb21wdXRlVW5pY29kZUhpZ2hsaWdodHMobSwgb3B0aW9ucyk7XG5cdFx0bS5kaXNwb3NlKCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4ucixcblx0XHRcdHJhbmdlczogci5yYW5nZXMubWFwKHIgPT4gUmFuZ2UubGlmdChyKS50b1N0cmluZygpKVxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdjb21wdXRlVW5pY29kZUhpZ2hsaWdodHMgKCMxNjgwNjgpJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR0KGBcblx0Rm9yXHUwMEEwXHUwMEU1XHUwMEEwZ2lcdTAwQTBldFx1MDBBMGVrc2VtcGVsXG5gLCB7XG5cdFx0XHRcdGFsbG93ZWRDb2RlUG9pbnRzOiBbXSxcblx0XHRcdFx0YWxsb3dlZExvY2FsZXM6IFtdLFxuXHRcdFx0XHRhbWJpZ3VvdXNDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0XHRpbnZpc2libGVDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0XHRpbmNsdWRlQ29tbWVudHM6IGZhbHNlLFxuXHRcdFx0XHRpbmNsdWRlU3RyaW5nczogZmFsc2UsXG5cdFx0XHRcdG5vbkJhc2ljQVNDSUk6IGZhbHNlXG5cdFx0XHR9KSxcblx0XHRcdHtcblx0XHRcdFx0YW1iaWd1b3VzQ2hhcmFjdGVyQ291bnQ6IDAsXG5cdFx0XHRcdGhhc01vcmU6IGZhbHNlLFxuXHRcdFx0XHRpbnZpc2libGVDaGFyYWN0ZXJDb3VudDogNCxcblx0XHRcdFx0bm9uQmFzaWNBc2NpaUNoYXJhY3RlckNvdW50OiAwLFxuXHRcdFx0XHRyYW5nZXM6IFtcblx0XHRcdFx0XHQnWzIsNSAtPiAyLDZdJyxcblx0XHRcdFx0XHQnWzIsNyAtPiAyLDhdJyxcblx0XHRcdFx0XHQnWzIsMTAgLT4gMiwxMV0nLFxuXHRcdFx0XHRcdCdbMiwxMyAtPiAyLDE0XSdcblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhO0FBQ3RCLFNBQW9DLG1DQUFtQztBQUN2RSxTQUFTLHVCQUF1QjtBQUVoQyxNQUFNLCtCQUErQixNQUFNO0FBQzFDLDBDQUF3QztBQUV4QyxXQUFTLEVBQUUsTUFBYyxTQUE2QztBQUNyRSxVQUFNLElBQUksZ0JBQWdCLElBQUk7QUFDOUIsVUFBTSxJQUFJLDRCQUE0Qix5QkFBeUIsR0FBRyxPQUFPO0FBQ3pFLE1BQUUsUUFBUTtBQUVWLFdBQU87QUFBQSxNQUNOLEdBQUc7QUFBQSxNQUNILFFBQVEsRUFBRSxPQUFPLElBQUksQ0FBQUEsT0FBSyxNQUFNLEtBQUtBLEVBQUMsRUFBRSxTQUFTLENBQUM7QUFBQSxJQUNuRDtBQUFBLEVBQ0Q7QUFFQSxPQUFLLHNDQUFzQyxNQUFNO0FBQ2hELFdBQU87QUFBQSxNQUNOLEVBQUU7QUFBQTtBQUFBLEdBRUY7QUFBQSxRQUNDLG1CQUFtQixDQUFDO0FBQUEsUUFDcEIsZ0JBQWdCLENBQUM7QUFBQSxRQUNqQixxQkFBcUI7QUFBQSxRQUNyQixxQkFBcUI7QUFBQSxRQUNyQixpQkFBaUI7QUFBQSxRQUNqQixnQkFBZ0I7QUFBQSxRQUNoQixlQUFlO0FBQUEsTUFDaEIsQ0FBQztBQUFBLE1BQ0Q7QUFBQSxRQUNDLHlCQUF5QjtBQUFBLFFBQ3pCLFNBQVM7QUFBQSxRQUNULHlCQUF5QjtBQUFBLFFBQ3pCLDZCQUE2QjtBQUFBLFFBQzdCLFFBQVE7QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsiciJdCn0K
