import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Range } from "../../../common/core/range.js";
import { InlineDecoration, InlineDecorationType, InlineModelDecorationsComputer, InjectedTextInlineDecorationsComputer } from "../../../common/viewModel/inlineDecorations.js";
import { createTextModel } from "../testTextModel.js";
import { IdentityCoordinatesConverter } from "../../../common/coordinatesConverter.js";
function createModelDecoration(id, range, options) {
  return {
    id,
    ownerId: 0,
    range,
    options
  };
}
suite("InlineModelDecorationsComputer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("no decorations", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => []
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    assert.deepStrictEqual(result, {
      decorations: [],
      inlineDecorations: [[]],
      hasVariableFonts: [false]
    });
    model.dispose();
  });
  test("inline class name decoration on a single line", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => [
        createModelDecoration("dec1", new Range(1, 1, 1, 6), {
          description: "test",
          inlineClassName: "test-class"
        })
      ]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    assert.strictEqual(result.decorations.length, 1);
    assert.deepStrictEqual(result.inlineDecorations, [
      [new InlineDecoration(new Range(1, 1, 1, 6), "test-class", InlineDecorationType.Regular)]
    ]);
    assert.deepStrictEqual(result.hasVariableFonts, [false]);
    model.dispose();
  });
  test("inlineClassName with affectsLetterSpacing", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => [
        createModelDecoration("dec1", new Range(1, 1, 1, 6), {
          description: "test",
          inlineClassName: "test-class",
          inlineClassNameAffectsLetterSpacing: true
        })
      ]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    assert.deepStrictEqual(result.inlineDecorations, [
      [new InlineDecoration(new Range(1, 1, 1, 6), "test-class", InlineDecorationType.RegularAffectingLetterSpacing)]
    ]);
    model.dispose();
  });
  test("beforeContentClassName decoration", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => [
        createModelDecoration("dec1", new Range(1, 3, 1, 8), {
          description: "test",
          beforeContentClassName: "before-class"
        })
      ]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    assert.deepStrictEqual(result.inlineDecorations, [
      [new InlineDecoration(new Range(1, 3, 1, 3), "before-class", InlineDecorationType.Before)]
    ]);
    model.dispose();
  });
  test("afterContentClassName decoration", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => [
        createModelDecoration("dec1", new Range(1, 3, 1, 8), {
          description: "test",
          afterContentClassName: "after-class"
        })
      ]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    assert.deepStrictEqual(result.inlineDecorations, [
      [new InlineDecoration(new Range(1, 8, 1, 8), "after-class", InlineDecorationType.After)]
    ]);
    model.dispose();
  });
  test("all decoration types combined", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => [
        createModelDecoration("dec1", new Range(1, 2, 1, 6), {
          description: "test",
          inlineClassName: "inline-class",
          beforeContentClassName: "before-class",
          afterContentClassName: "after-class"
        })
      ]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    assert.deepStrictEqual(result.inlineDecorations, [
      [
        new InlineDecoration(new Range(1, 2, 1, 6), "inline-class", InlineDecorationType.Regular),
        new InlineDecoration(new Range(1, 2, 1, 2), "before-class", InlineDecorationType.Before),
        new InlineDecoration(new Range(1, 6, 1, 6), "after-class", InlineDecorationType.After)
      ]
    ]);
    model.dispose();
  });
  test("decoration spanning multiple lines", () => {
    const model = createTextModel("line one\nline two\nline three");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => [
        createModelDecoration("dec1", new Range(1, 3, 3, 5), {
          description: "test",
          inlineClassName: "multi-line"
        })
      ]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getDecorations(new Range(1, 1, 3, 11), false, false);
    const expectedInlineDecoration = new InlineDecoration(new Range(1, 3, 3, 5), "multi-line", InlineDecorationType.Regular);
    assert.deepStrictEqual(result.inlineDecorations, [
      [expectedInlineDecoration],
      [expectedInlineDecoration],
      [expectedInlineDecoration]
    ]);
    model.dispose();
  });
  test("decoration with affectsFont sets hasVariableFonts", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => [
        createModelDecoration("dec1", new Range(1, 1, 1, 6), {
          description: "test",
          inlineClassName: "font-class",
          affectsFont: true
        })
      ]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    assert.deepStrictEqual(result.hasVariableFonts, [true]);
    model.dispose();
  });
  test("multiple decorations on different lines", () => {
    const model = createTextModel("line one\nline two");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => [
        createModelDecoration("dec1", new Range(1, 1, 1, 5), {
          description: "test",
          inlineClassName: "class-a"
        }),
        createModelDecoration("dec2", new Range(2, 1, 2, 5), {
          description: "test",
          inlineClassName: "class-b"
        })
      ]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getDecorations(new Range(1, 1, 2, 9), false, false);
    assert.deepStrictEqual(result.inlineDecorations, [
      [new InlineDecoration(new Range(1, 1, 1, 5), "class-a", InlineDecorationType.Regular)],
      [new InlineDecoration(new Range(2, 1, 2, 5), "class-b", InlineDecorationType.Regular)]
    ]);
    model.dispose();
  });
  test("decoration cache is used for same decoration id", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const dec = createModelDecoration("dec1", new Range(1, 1, 1, 6), {
      description: "test",
      inlineClassName: "test-class"
    });
    const context = {
      getModelDecorations: () => [dec]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result1 = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    const result2 = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    assert.strictEqual(result1.decorations[0], result2.decorations[0]);
    model.dispose();
  });
  test("reset clears decoration cache", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const dec = createModelDecoration("dec1", new Range(1, 1, 1, 6), {
      description: "test",
      inlineClassName: "test-class"
    });
    const context = {
      getModelDecorations: () => [dec]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result1 = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    computer.reset();
    const result2 = computer.getDecorations(new Range(1, 1, 1, 12), false, false);
    assert.notStrictEqual(result1.decorations[0], result2.decorations[0]);
    model.dispose();
  });
  test("getInlineDecorations returns inline decorations for a model line", () => {
    const model = createTextModel("hello world");
    const coordinatesConverter = new IdentityCoordinatesConverter(model);
    const context = {
      getModelDecorations: () => [
        createModelDecoration("dec1", new Range(1, 1, 1, 6), {
          description: "test",
          inlineClassName: "test-class"
        })
      ]
    };
    const computer = new InlineModelDecorationsComputer(context, model, coordinatesConverter);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, [
      [new InlineDecoration(new Range(1, 1, 1, 6), "test-class", InlineDecorationType.Regular)]
    ]);
    model.dispose();
  });
});
suite("InjectedTextInlineDecorationsComputer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("no injections returns empty", () => {
    const context = {
      getInjectionOptions: () => null,
      getInjectionOffsets: () => null,
      getBreakOffsets: () => [10],
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => 1
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, []);
  });
  test("single injection with inlineClassName on a single output line", () => {
    const injectionOptions = [
      { content: "injected", inlineClassName: "injected-class" }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [5],
      getBreakOffsets: () => [18],
      // 10 (original) + 8 (injected)
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => 1
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, [
      [new InlineDecoration(new Range(1, 6, 1, 14), "injected-class", InlineDecorationType.Regular)]
    ]);
  });
  test("injection without inlineClassName produces no inline decorations", () => {
    const injectionOptions = [
      { content: "injected" }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [5],
      getBreakOffsets: () => [18],
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => 1
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, [
      []
      // empty - no inlineClassName
    ]);
  });
  test("injection with inlineClassNameAffectsLetterSpacing", () => {
    const injectionOptions = [
      { content: "abc", inlineClassName: "ls-class", inlineClassNameAffectsLetterSpacing: true }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [0],
      getBreakOffsets: () => [13],
      // 10 + 3
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => 1
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, [
      [new InlineDecoration(new Range(1, 1, 1, 4), "ls-class", InlineDecorationType.RegularAffectingLetterSpacing)]
    ]);
  });
  test("multiple injections on a single output line", () => {
    const injectionOptions = [
      { content: "AA", inlineClassName: "class-a" },
      { content: "BBB", inlineClassName: "class-b" }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [2, 5],
      getBreakOffsets: () => [15],
      // 10 + 2 + 3
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => 1
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, [
      [
        new InlineDecoration(new Range(1, 3, 1, 5), "class-a", InlineDecorationType.Regular),
        new InlineDecoration(new Range(1, 8, 1, 11), "class-b", InlineDecorationType.Regular)
      ]
    ]);
  });
  test("injection spanning across wrapped lines", () => {
    const injectionOptions = [
      { content: "1234567890", inlineClassName: "injected" }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [8],
      getBreakOffsets: () => [15, 30],
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => 5
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, [
      [new InlineDecoration(new Range(5, 9, 5, 16), "injected", InlineDecorationType.Regular)],
      [new InlineDecoration(new Range(6, 1, 6, 4), "injected", InlineDecorationType.Regular)]
    ]);
  });
  test("injection with wrappedTextIndentLength on wrapped lines", () => {
    const injectionOptions = [
      { content: "12345678901234567890", inlineClassName: "injected" }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [0],
      getBreakOffsets: () => [15, 30],
      getWrappedTextIndentLength: () => 4,
      getBaseViewLineNumber: () => 1
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, [
      [new InlineDecoration(new Range(1, 1, 1, 16), "injected", InlineDecorationType.Regular)],
      [new InlineDecoration(new Range(2, 5, 2, 10), "injected", InlineDecorationType.Regular)]
    ]);
  });
  test("injection starting in later wrapped line", () => {
    const injectionOptions = [
      { content: "ab", inlineClassName: "late-class" }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [20],
      getBreakOffsets: () => [15, 32],
      // 30 + 2
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => 1
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, [
      [],
      [new InlineDecoration(new Range(2, 6, 2, 8), "late-class", InlineDecorationType.Regular)]
    ]);
  });
  test("base view line number offsets correctly", () => {
    const injectionOptions = [
      { content: "test", inlineClassName: "test-class" }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [0],
      getBreakOffsets: () => [14],
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => 10
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(1);
    assert.deepStrictEqual(result, [
      [new InlineDecoration(new Range(10, 1, 10, 5), "test-class", InlineDecorationType.Regular)]
    ]);
  });
  test("range uses view line number, not model line number", () => {
    const modelLineNumber = 3;
    const baseViewLineNumber = 7;
    const injectionOptions = [
      { content: "ghost", inlineClassName: "ghost-class" }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [0],
      getBreakOffsets: () => [15],
      // 10 (original) + 5 (injected)
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => baseViewLineNumber
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(modelLineNumber);
    assert.deepStrictEqual(result, [
      [new InlineDecoration(new Range(7, 1, 7, 6), "ghost-class", InlineDecorationType.Regular)]
    ]);
  });
  test("range uses view line number on wrapped lines, not model line number", () => {
    const modelLineNumber = 2;
    const baseViewLineNumber = 5;
    const injectionOptions = [
      { content: "1234567890", inlineClassName: "wrap-class" }
    ];
    const context = {
      getInjectionOptions: () => injectionOptions,
      getInjectionOffsets: () => [0],
      getBreakOffsets: () => [8, 20],
      getWrappedTextIndentLength: () => 0,
      getBaseViewLineNumber: () => baseViewLineNumber
    };
    const computer = new InjectedTextInlineDecorationsComputer(context);
    const result = computer.getInlineDecorations(modelLineNumber);
    assert.deepStrictEqual(result, [
      [new InlineDecoration(new Range(5, 1, 5, 9), "wrap-class", InlineDecorationType.Regular)],
      [new InlineDecoration(new Range(6, 1, 6, 3), "wrap-class", InlineDecorationType.Regular)]
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi92aWV3TW9kZWwvaW5saW5lRGVjb3JhdGlvbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWNvcmF0aW9uLCBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucywgSW5qZWN0ZWRUZXh0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVEZWNvcmF0aW9uLCBJbmxpbmVEZWNvcmF0aW9uVHlwZSwgSW5saW5lTW9kZWxEZWNvcmF0aW9uc0NvbXB1dGVyLCBJSW5saW5lTW9kZWxEZWNvcmF0aW9uc0NvbXB1dGVyQ29udGV4dCwgSW5qZWN0ZWRUZXh0SW5saW5lRGVjb3JhdGlvbnNDb21wdXRlciwgSUluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC9pbmxpbmVEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElkZW50aXR5Q29vcmRpbmF0ZXNDb252ZXJ0ZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29vcmRpbmF0ZXNDb252ZXJ0ZXIuanMnO1xuXG5mdW5jdGlvbiBjcmVhdGVNb2RlbERlY29yYXRpb24oaWQ6IHN0cmluZywgcmFuZ2U6IFJhbmdlLCBvcHRpb25zOiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyk6IElNb2RlbERlY29yYXRpb24ge1xuXHRyZXR1cm4ge1xuXHRcdGlkLFxuXHRcdG93bmVySWQ6IDAsXG5cdFx0cmFuZ2UsXG5cdFx0b3B0aW9uc1xuXHR9O1xufVxuXG5zdWl0ZSgnSW5saW5lTW9kZWxEZWNvcmF0aW9uc0NvbXB1dGVyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ25vIGRlY29yYXRpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdGNvbnN0IGNvb3JkaW5hdGVzQ29udmVydGVyID0gbmV3IElkZW50aXR5Q29vcmRpbmF0ZXNDb252ZXJ0ZXIobW9kZWwpO1xuXHRcdGNvbnN0IGNvbnRleHQ6IElJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0ID0ge1xuXHRcdFx0Z2V0TW9kZWxEZWNvcmF0aW9uczogKCkgPT4gW11cblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IElubGluZU1vZGVsRGVjb3JhdGlvbnNDb21wdXRlcihjb250ZXh0LCBtb2RlbCwgY29vcmRpbmF0ZXNDb252ZXJ0ZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVyLmdldERlY29yYXRpb25zKG5ldyBSYW5nZSgxLCAxLCAxLCAxMiksIGZhbHNlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdGRlY29yYXRpb25zOiBbXSxcblx0XHRcdGlubGluZURlY29yYXRpb25zOiBbW11dLFxuXHRcdFx0aGFzVmFyaWFibGVGb250czogW2ZhbHNlXVxuXHRcdH0pO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaW5saW5lIGNsYXNzIG5hbWUgZGVjb3JhdGlvbiBvbiBhIHNpbmdsZSBsaW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdGNvbnN0IGNvb3JkaW5hdGVzQ29udmVydGVyID0gbmV3IElkZW50aXR5Q29vcmRpbmF0ZXNDb252ZXJ0ZXIobW9kZWwpO1xuXHRcdGNvbnN0IGNvbnRleHQ6IElJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0ID0ge1xuXHRcdFx0Z2V0TW9kZWxEZWNvcmF0aW9uczogKCkgPT4gW1xuXHRcdFx0XHRjcmVhdGVNb2RlbERlY29yYXRpb24oJ2RlYzEnLCBuZXcgUmFuZ2UoMSwgMSwgMSwgNiksIHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZTogJ3Rlc3QtY2xhc3MnXG5cdFx0XHRcdH0pXG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBjb21wdXRlciA9IG5ldyBJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXIoY29udGV4dCwgbW9kZWwsIGNvb3JkaW5hdGVzQ29udmVydGVyKTtcblx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlci5nZXREZWNvcmF0aW9ucyhuZXcgUmFuZ2UoMSwgMSwgMSwgMTIpLCBmYWxzZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGVjb3JhdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5pbmxpbmVEZWNvcmF0aW9ucywgW1xuXHRcdFx0W25ldyBJbmxpbmVEZWNvcmF0aW9uKG5ldyBSYW5nZSgxLCAxLCAxLCA2KSwgJ3Rlc3QtY2xhc3MnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyKV1cblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5oYXNWYXJpYWJsZUZvbnRzLCBbZmFsc2VdKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lubGluZUNsYXNzTmFtZSB3aXRoIGFmZmVjdHNMZXR0ZXJTcGFjaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdGNvbnN0IGNvb3JkaW5hdGVzQ29udmVydGVyID0gbmV3IElkZW50aXR5Q29vcmRpbmF0ZXNDb252ZXJ0ZXIobW9kZWwpO1xuXHRcdGNvbnN0IGNvbnRleHQ6IElJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0ID0ge1xuXHRcdFx0Z2V0TW9kZWxEZWNvcmF0aW9uczogKCkgPT4gW1xuXHRcdFx0XHRjcmVhdGVNb2RlbERlY29yYXRpb24oJ2RlYzEnLCBuZXcgUmFuZ2UoMSwgMSwgMSwgNiksIHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZTogJ3Rlc3QtY2xhc3MnLFxuXHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZUFmZmVjdHNMZXR0ZXJTcGFjaW5nOiB0cnVlXG5cdFx0XHRcdH0pXG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBjb21wdXRlciA9IG5ldyBJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXIoY29udGV4dCwgbW9kZWwsIGNvb3JkaW5hdGVzQ29udmVydGVyKTtcblx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlci5nZXREZWNvcmF0aW9ucyhuZXcgUmFuZ2UoMSwgMSwgMSwgMTIpLCBmYWxzZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmlubGluZURlY29yYXRpb25zLCBbXG5cdFx0XHRbbmV3IElubGluZURlY29yYXRpb24obmV3IFJhbmdlKDEsIDEsIDEsIDYpLCAndGVzdC1jbGFzcycsIElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXJBZmZlY3RpbmdMZXR0ZXJTcGFjaW5nKV1cblx0XHRdKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JlZm9yZUNvbnRlbnRDbGFzc05hbWUgZGVjb3JhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnaGVsbG8gd29ybGQnKTtcblx0XHRjb25zdCBjb29yZGluYXRlc0NvbnZlcnRlciA9IG5ldyBJZGVudGl0eUNvb3JkaW5hdGVzQ29udmVydGVyKG1vZGVsKTtcblx0XHRjb25zdCBjb250ZXh0OiBJSW5saW5lTW9kZWxEZWNvcmF0aW9uc0NvbXB1dGVyQ29udGV4dCA9IHtcblx0XHRcdGdldE1vZGVsRGVjb3JhdGlvbnM6ICgpID0+IFtcblx0XHRcdFx0Y3JlYXRlTW9kZWxEZWNvcmF0aW9uKCdkZWMxJywgbmV3IFJhbmdlKDEsIDMsIDEsIDgpLCB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0Jyxcblx0XHRcdFx0XHRiZWZvcmVDb250ZW50Q2xhc3NOYW1lOiAnYmVmb3JlLWNsYXNzJ1xuXHRcdFx0XHR9KVxuXHRcdFx0XVxuXHRcdH07XG5cdFx0Y29uc3QgY29tcHV0ZXIgPSBuZXcgSW5saW5lTW9kZWxEZWNvcmF0aW9uc0NvbXB1dGVyKGNvbnRleHQsIG1vZGVsLCBjb29yZGluYXRlc0NvbnZlcnRlcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZXIuZ2V0RGVjb3JhdGlvbnMobmV3IFJhbmdlKDEsIDEsIDEsIDEyKSwgZmFsc2UsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5pbmxpbmVEZWNvcmF0aW9ucywgW1xuXHRcdFx0W25ldyBJbmxpbmVEZWNvcmF0aW9uKG5ldyBSYW5nZSgxLCAzLCAxLCAzKSwgJ2JlZm9yZS1jbGFzcycsIElubGluZURlY29yYXRpb25UeXBlLkJlZm9yZSldXG5cdFx0XSk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZnRlckNvbnRlbnRDbGFzc05hbWUgZGVjb3JhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnaGVsbG8gd29ybGQnKTtcblx0XHRjb25zdCBjb29yZGluYXRlc0NvbnZlcnRlciA9IG5ldyBJZGVudGl0eUNvb3JkaW5hdGVzQ29udmVydGVyKG1vZGVsKTtcblx0XHRjb25zdCBjb250ZXh0OiBJSW5saW5lTW9kZWxEZWNvcmF0aW9uc0NvbXB1dGVyQ29udGV4dCA9IHtcblx0XHRcdGdldE1vZGVsRGVjb3JhdGlvbnM6ICgpID0+IFtcblx0XHRcdFx0Y3JlYXRlTW9kZWxEZWNvcmF0aW9uKCdkZWMxJywgbmV3IFJhbmdlKDEsIDMsIDEsIDgpLCB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0Jyxcblx0XHRcdFx0XHRhZnRlckNvbnRlbnRDbGFzc05hbWU6ICdhZnRlci1jbGFzcydcblx0XHRcdFx0fSlcblx0XHRcdF1cblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IElubGluZU1vZGVsRGVjb3JhdGlvbnNDb21wdXRlcihjb250ZXh0LCBtb2RlbCwgY29vcmRpbmF0ZXNDb252ZXJ0ZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVyLmdldERlY29yYXRpb25zKG5ldyBSYW5nZSgxLCAxLCAxLCAxMiksIGZhbHNlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuaW5saW5lRGVjb3JhdGlvbnMsIFtcblx0XHRcdFtuZXcgSW5saW5lRGVjb3JhdGlvbihuZXcgUmFuZ2UoMSwgOCwgMSwgOCksICdhZnRlci1jbGFzcycsIElubGluZURlY29yYXRpb25UeXBlLkFmdGVyKV1cblx0XHRdKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbCBkZWNvcmF0aW9uIHR5cGVzIGNvbWJpbmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdGNvbnN0IGNvb3JkaW5hdGVzQ29udmVydGVyID0gbmV3IElkZW50aXR5Q29vcmRpbmF0ZXNDb252ZXJ0ZXIobW9kZWwpO1xuXHRcdGNvbnN0IGNvbnRleHQ6IElJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0ID0ge1xuXHRcdFx0Z2V0TW9kZWxEZWNvcmF0aW9uczogKCkgPT4gW1xuXHRcdFx0XHRjcmVhdGVNb2RlbERlY29yYXRpb24oJ2RlYzEnLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNiksIHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZTogJ2lubGluZS1jbGFzcycsXG5cdFx0XHRcdFx0YmVmb3JlQ29udGVudENsYXNzTmFtZTogJ2JlZm9yZS1jbGFzcycsXG5cdFx0XHRcdFx0YWZ0ZXJDb250ZW50Q2xhc3NOYW1lOiAnYWZ0ZXItY2xhc3MnXG5cdFx0XHRcdH0pXG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBjb21wdXRlciA9IG5ldyBJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXIoY29udGV4dCwgbW9kZWwsIGNvb3JkaW5hdGVzQ29udmVydGVyKTtcblx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlci5nZXREZWNvcmF0aW9ucyhuZXcgUmFuZ2UoMSwgMSwgMSwgMTIpLCBmYWxzZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmlubGluZURlY29yYXRpb25zLCBbXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBJbmxpbmVEZWNvcmF0aW9uKG5ldyBSYW5nZSgxLCAyLCAxLCA2KSwgJ2lubGluZS1jbGFzcycsIElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXIpLFxuXHRcdFx0XHRuZXcgSW5saW5lRGVjb3JhdGlvbihuZXcgUmFuZ2UoMSwgMiwgMSwgMiksICdiZWZvcmUtY2xhc3MnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5CZWZvcmUpLFxuXHRcdFx0XHRuZXcgSW5saW5lRGVjb3JhdGlvbihuZXcgUmFuZ2UoMSwgNiwgMSwgNiksICdhZnRlci1jbGFzcycsIElubGluZURlY29yYXRpb25UeXBlLkFmdGVyKSxcblx0XHRcdF1cblx0XHRdKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29yYXRpb24gc3Bhbm5pbmcgbXVsdGlwbGUgbGluZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2xpbmUgb25lXFxubGluZSB0d29cXG5saW5lIHRocmVlJyk7XG5cdFx0Y29uc3QgY29vcmRpbmF0ZXNDb252ZXJ0ZXIgPSBuZXcgSWRlbnRpdHlDb29yZGluYXRlc0NvbnZlcnRlcihtb2RlbCk7XG5cdFx0Y29uc3QgY29udGV4dDogSUlubGluZU1vZGVsRGVjb3JhdGlvbnNDb21wdXRlckNvbnRleHQgPSB7XG5cdFx0XHRnZXRNb2RlbERlY29yYXRpb25zOiAoKSA9PiBbXG5cdFx0XHRcdGNyZWF0ZU1vZGVsRGVjb3JhdGlvbignZGVjMScsIG5ldyBSYW5nZSgxLCAzLCAzLCA1KSwge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCcsXG5cdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lOiAnbXVsdGktbGluZSdcblx0XHRcdFx0fSlcblx0XHRcdF1cblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IElubGluZU1vZGVsRGVjb3JhdGlvbnNDb21wdXRlcihjb250ZXh0LCBtb2RlbCwgY29vcmRpbmF0ZXNDb252ZXJ0ZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVyLmdldERlY29yYXRpb25zKG5ldyBSYW5nZSgxLCAxLCAzLCAxMSksIGZhbHNlLCBmYWxzZSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWRJbmxpbmVEZWNvcmF0aW9uID0gbmV3IElubGluZURlY29yYXRpb24obmV3IFJhbmdlKDEsIDMsIDMsIDUpLCAnbXVsdGktbGluZScsIElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmlubGluZURlY29yYXRpb25zLCBbXG5cdFx0XHRbZXhwZWN0ZWRJbmxpbmVEZWNvcmF0aW9uXSxcblx0XHRcdFtleHBlY3RlZElubGluZURlY29yYXRpb25dLFxuXHRcdFx0W2V4cGVjdGVkSW5saW5lRGVjb3JhdGlvbl0sXG5cdFx0XSk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWNvcmF0aW9uIHdpdGggYWZmZWN0c0ZvbnQgc2V0cyBoYXNWYXJpYWJsZUZvbnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdGNvbnN0IGNvb3JkaW5hdGVzQ29udmVydGVyID0gbmV3IElkZW50aXR5Q29vcmRpbmF0ZXNDb252ZXJ0ZXIobW9kZWwpO1xuXHRcdGNvbnN0IGNvbnRleHQ6IElJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0ID0ge1xuXHRcdFx0Z2V0TW9kZWxEZWNvcmF0aW9uczogKCkgPT4gW1xuXHRcdFx0XHRjcmVhdGVNb2RlbERlY29yYXRpb24oJ2RlYzEnLCBuZXcgUmFuZ2UoMSwgMSwgMSwgNiksIHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZTogJ2ZvbnQtY2xhc3MnLFxuXHRcdFx0XHRcdGFmZmVjdHNGb250OiB0cnVlXG5cdFx0XHRcdH0pXG5cdFx0XHRdXG5cdFx0fTtcblx0XHRjb25zdCBjb21wdXRlciA9IG5ldyBJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXIoY29udGV4dCwgbW9kZWwsIGNvb3JkaW5hdGVzQ29udmVydGVyKTtcblx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlci5nZXREZWNvcmF0aW9ucyhuZXcgUmFuZ2UoMSwgMSwgMSwgMTIpLCBmYWxzZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lmhhc1ZhcmlhYmxlRm9udHMsIFt0cnVlXSk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBkZWNvcmF0aW9ucyBvbiBkaWZmZXJlbnQgbGluZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2xpbmUgb25lXFxubGluZSB0d28nKTtcblx0XHRjb25zdCBjb29yZGluYXRlc0NvbnZlcnRlciA9IG5ldyBJZGVudGl0eUNvb3JkaW5hdGVzQ29udmVydGVyKG1vZGVsKTtcblx0XHRjb25zdCBjb250ZXh0OiBJSW5saW5lTW9kZWxEZWNvcmF0aW9uc0NvbXB1dGVyQ29udGV4dCA9IHtcblx0XHRcdGdldE1vZGVsRGVjb3JhdGlvbnM6ICgpID0+IFtcblx0XHRcdFx0Y3JlYXRlTW9kZWxEZWNvcmF0aW9uKCdkZWMxJywgbmV3IFJhbmdlKDEsIDEsIDEsIDUpLCB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0Jyxcblx0XHRcdFx0XHRpbmxpbmVDbGFzc05hbWU6ICdjbGFzcy1hJ1xuXHRcdFx0XHR9KSxcblx0XHRcdFx0Y3JlYXRlTW9kZWxEZWNvcmF0aW9uKCdkZWMyJywgbmV3IFJhbmdlKDIsIDEsIDIsIDUpLCB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0Jyxcblx0XHRcdFx0XHRpbmxpbmVDbGFzc05hbWU6ICdjbGFzcy1iJ1xuXHRcdFx0XHR9KSxcblx0XHRcdF1cblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IElubGluZU1vZGVsRGVjb3JhdGlvbnNDb21wdXRlcihjb250ZXh0LCBtb2RlbCwgY29vcmRpbmF0ZXNDb252ZXJ0ZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVyLmdldERlY29yYXRpb25zKG5ldyBSYW5nZSgxLCAxLCAyLCA5KSwgZmFsc2UsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5pbmxpbmVEZWNvcmF0aW9ucywgW1xuXHRcdFx0W25ldyBJbmxpbmVEZWNvcmF0aW9uKG5ldyBSYW5nZSgxLCAxLCAxLCA1KSwgJ2NsYXNzLWEnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyKV0sXG5cdFx0XHRbbmV3IElubGluZURlY29yYXRpb24obmV3IFJhbmdlKDIsIDEsIDIsIDUpLCAnY2xhc3MtYicsIElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXIpXSxcblx0XHRdKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlY29yYXRpb24gY2FjaGUgaXMgdXNlZCBmb3Igc2FtZSBkZWNvcmF0aW9uIGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpO1xuXHRcdGNvbnN0IGNvb3JkaW5hdGVzQ29udmVydGVyID0gbmV3IElkZW50aXR5Q29vcmRpbmF0ZXNDb252ZXJ0ZXIobW9kZWwpO1xuXHRcdGNvbnN0IGRlYyA9IGNyZWF0ZU1vZGVsRGVjb3JhdGlvbignZGVjMScsIG5ldyBSYW5nZSgxLCAxLCAxLCA2KSwge1xuXHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0Jyxcblx0XHRcdGlubGluZUNsYXNzTmFtZTogJ3Rlc3QtY2xhc3MnXG5cdFx0fSk7XG5cdFx0Y29uc3QgY29udGV4dDogSUlubGluZU1vZGVsRGVjb3JhdGlvbnNDb21wdXRlckNvbnRleHQgPSB7XG5cdFx0XHRnZXRNb2RlbERlY29yYXRpb25zOiAoKSA9PiBbZGVjXVxuXHRcdH07XG5cdFx0Y29uc3QgY29tcHV0ZXIgPSBuZXcgSW5saW5lTW9kZWxEZWNvcmF0aW9uc0NvbXB1dGVyKGNvbnRleHQsIG1vZGVsLCBjb29yZGluYXRlc0NvbnZlcnRlcik7XG5cdFx0Y29uc3QgcmVzdWx0MSA9IGNvbXB1dGVyLmdldERlY29yYXRpb25zKG5ldyBSYW5nZSgxLCAxLCAxLCAxMiksIGZhbHNlLCBmYWxzZSk7XG5cdFx0Y29uc3QgcmVzdWx0MiA9IGNvbXB1dGVyLmdldERlY29yYXRpb25zKG5ldyBSYW5nZSgxLCAxLCAxLCAxMiksIGZhbHNlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEuZGVjb3JhdGlvbnNbMF0sIHJlc3VsdDIuZGVjb3JhdGlvbnNbMF0pO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVzZXQgY2xlYXJzIGRlY29yYXRpb24gY2FjaGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2hlbGxvIHdvcmxkJyk7XG5cdFx0Y29uc3QgY29vcmRpbmF0ZXNDb252ZXJ0ZXIgPSBuZXcgSWRlbnRpdHlDb29yZGluYXRlc0NvbnZlcnRlcihtb2RlbCk7XG5cdFx0Y29uc3QgZGVjID0gY3JlYXRlTW9kZWxEZWNvcmF0aW9uKCdkZWMxJywgbmV3IFJhbmdlKDEsIDEsIDEsIDYpLCB7XG5cdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdFx0aW5saW5lQ2xhc3NOYW1lOiAndGVzdC1jbGFzcydcblx0XHR9KTtcblx0XHRjb25zdCBjb250ZXh0OiBJSW5saW5lTW9kZWxEZWNvcmF0aW9uc0NvbXB1dGVyQ29udGV4dCA9IHtcblx0XHRcdGdldE1vZGVsRGVjb3JhdGlvbnM6ICgpID0+IFtkZWNdXG5cdFx0fTtcblx0XHRjb25zdCBjb21wdXRlciA9IG5ldyBJbmxpbmVNb2RlbERlY29yYXRpb25zQ29tcHV0ZXIoY29udGV4dCwgbW9kZWwsIGNvb3JkaW5hdGVzQ29udmVydGVyKTtcblx0XHRjb25zdCByZXN1bHQxID0gY29tcHV0ZXIuZ2V0RGVjb3JhdGlvbnMobmV3IFJhbmdlKDEsIDEsIDEsIDEyKSwgZmFsc2UsIGZhbHNlKTtcblx0XHRjb21wdXRlci5yZXNldCgpO1xuXHRcdGNvbnN0IHJlc3VsdDIgPSBjb21wdXRlci5nZXREZWNvcmF0aW9ucyhuZXcgUmFuZ2UoMSwgMSwgMSwgMTIpLCBmYWxzZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChyZXN1bHQxLmRlY29yYXRpb25zWzBdLCByZXN1bHQyLmRlY29yYXRpb25zWzBdKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldElubGluZURlY29yYXRpb25zIHJldHVybnMgaW5saW5lIGRlY29yYXRpb25zIGZvciBhIG1vZGVsIGxpbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2hlbGxvIHdvcmxkJyk7XG5cdFx0Y29uc3QgY29vcmRpbmF0ZXNDb252ZXJ0ZXIgPSBuZXcgSWRlbnRpdHlDb29yZGluYXRlc0NvbnZlcnRlcihtb2RlbCk7XG5cdFx0Y29uc3QgY29udGV4dDogSUlubGluZU1vZGVsRGVjb3JhdGlvbnNDb21wdXRlckNvbnRleHQgPSB7XG5cdFx0XHRnZXRNb2RlbERlY29yYXRpb25zOiAoKSA9PiBbXG5cdFx0XHRcdGNyZWF0ZU1vZGVsRGVjb3JhdGlvbignZGVjMScsIG5ldyBSYW5nZSgxLCAxLCAxLCA2KSwge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCcsXG5cdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lOiAndGVzdC1jbGFzcydcblx0XHRcdFx0fSlcblx0XHRcdF1cblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IElubGluZU1vZGVsRGVjb3JhdGlvbnNDb21wdXRlcihjb250ZXh0LCBtb2RlbCwgY29vcmRpbmF0ZXNDb252ZXJ0ZXIpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVyLmdldElubGluZURlY29yYXRpb25zKDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRbbmV3IElubGluZURlY29yYXRpb24obmV3IFJhbmdlKDEsIDEsIDEsIDYpLCAndGVzdC1jbGFzcycsIElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXIpXVxuXHRcdF0pO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0luamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbm8gaW5qZWN0aW9ucyByZXR1cm5zIGVtcHR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQ6IElJbmplY3RlZFRleHRJbmxpbmVEZWNvcmF0aW9uc0NvbXB1dGVyQ29udGV4dCA9IHtcblx0XHRcdGdldEluamVjdGlvbk9wdGlvbnM6ICgpID0+IG51bGwsXG5cdFx0XHRnZXRJbmplY3Rpb25PZmZzZXRzOiAoKSA9PiBudWxsLFxuXHRcdFx0Z2V0QnJlYWtPZmZzZXRzOiAoKSA9PiBbMTBdLFxuXHRcdFx0Z2V0V3JhcHBlZFRleHRJbmRlbnRMZW5ndGg6ICgpID0+IDAsXG5cdFx0XHRnZXRCYXNlVmlld0xpbmVOdW1iZXI6ICgpID0+IDEsXG5cdFx0fTtcblx0XHRjb25zdCBjb21wdXRlciA9IG5ldyBJbmplY3RlZFRleHRJbmxpbmVEZWNvcmF0aW9uc0NvbXB1dGVyKGNvbnRleHQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVyLmdldElubGluZURlY29yYXRpb25zKDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZSBpbmplY3Rpb24gd2l0aCBpbmxpbmVDbGFzc05hbWUgb24gYSBzaW5nbGUgb3V0cHV0IGxpbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5qZWN0aW9uT3B0aW9uczogSW5qZWN0ZWRUZXh0T3B0aW9uc1tdID0gW1xuXHRcdFx0eyBjb250ZW50OiAnaW5qZWN0ZWQnLCBpbmxpbmVDbGFzc05hbWU6ICdpbmplY3RlZC1jbGFzcycgfVxuXHRcdF07XG5cdFx0Y29uc3QgY29udGV4dDogSUluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0ID0ge1xuXHRcdFx0Z2V0SW5qZWN0aW9uT3B0aW9uczogKCkgPT4gaW5qZWN0aW9uT3B0aW9ucyxcblx0XHRcdGdldEluamVjdGlvbk9mZnNldHM6ICgpID0+IFs1XSxcblx0XHRcdGdldEJyZWFrT2Zmc2V0czogKCkgPT4gWzE4XSwgLy8gMTAgKG9yaWdpbmFsKSArIDggKGluamVjdGVkKVxuXHRcdFx0Z2V0V3JhcHBlZFRleHRJbmRlbnRMZW5ndGg6ICgpID0+IDAsXG5cdFx0XHRnZXRCYXNlVmlld0xpbmVOdW1iZXI6ICgpID0+IDEsXG5cdFx0fTtcblx0XHRjb25zdCBjb21wdXRlciA9IG5ldyBJbmplY3RlZFRleHRJbmxpbmVEZWNvcmF0aW9uc0NvbXB1dGVyKGNvbnRleHQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVyLmdldElubGluZURlY29yYXRpb25zKDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRbbmV3IElubGluZURlY29yYXRpb24obmV3IFJhbmdlKDEsIDYsIDEsIDE0KSwgJ2luamVjdGVkLWNsYXNzJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhcildXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luamVjdGlvbiB3aXRob3V0IGlubGluZUNsYXNzTmFtZSBwcm9kdWNlcyBubyBpbmxpbmUgZGVjb3JhdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5qZWN0aW9uT3B0aW9uczogSW5qZWN0ZWRUZXh0T3B0aW9uc1tdID0gW1xuXHRcdFx0eyBjb250ZW50OiAnaW5qZWN0ZWQnIH1cblx0XHRdO1xuXHRcdGNvbnN0IGNvbnRleHQ6IElJbmplY3RlZFRleHRJbmxpbmVEZWNvcmF0aW9uc0NvbXB1dGVyQ29udGV4dCA9IHtcblx0XHRcdGdldEluamVjdGlvbk9wdGlvbnM6ICgpID0+IGluamVjdGlvbk9wdGlvbnMsXG5cdFx0XHRnZXRJbmplY3Rpb25PZmZzZXRzOiAoKSA9PiBbNV0sXG5cdFx0XHRnZXRCcmVha09mZnNldHM6ICgpID0+IFsxOF0sXG5cdFx0XHRnZXRXcmFwcGVkVGV4dEluZGVudExlbmd0aDogKCkgPT4gMCxcblx0XHRcdGdldEJhc2VWaWV3TGluZU51bWJlcjogKCkgPT4gMSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IEluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXIoY29udGV4dCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZXIuZ2V0SW5saW5lRGVjb3JhdGlvbnMoMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFtdIC8vIGVtcHR5IC0gbm8gaW5saW5lQ2xhc3NOYW1lXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luamVjdGlvbiB3aXRoIGlubGluZUNsYXNzTmFtZUFmZmVjdHNMZXR0ZXJTcGFjaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGluamVjdGlvbk9wdGlvbnM6IEluamVjdGVkVGV4dE9wdGlvbnNbXSA9IFtcblx0XHRcdHsgY29udGVudDogJ2FiYycsIGlubGluZUNsYXNzTmFtZTogJ2xzLWNsYXNzJywgaW5saW5lQ2xhc3NOYW1lQWZmZWN0c0xldHRlclNwYWNpbmc6IHRydWUgfVxuXHRcdF07XG5cdFx0Y29uc3QgY29udGV4dDogSUluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0ID0ge1xuXHRcdFx0Z2V0SW5qZWN0aW9uT3B0aW9uczogKCkgPT4gaW5qZWN0aW9uT3B0aW9ucyxcblx0XHRcdGdldEluamVjdGlvbk9mZnNldHM6ICgpID0+IFswXSxcblx0XHRcdGdldEJyZWFrT2Zmc2V0czogKCkgPT4gWzEzXSwgLy8gMTAgKyAzXG5cdFx0XHRnZXRXcmFwcGVkVGV4dEluZGVudExlbmd0aDogKCkgPT4gMCxcblx0XHRcdGdldEJhc2VWaWV3TGluZU51bWJlcjogKCkgPT4gMSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IEluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXIoY29udGV4dCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZXIuZ2V0SW5saW5lRGVjb3JhdGlvbnMoMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFtuZXcgSW5saW5lRGVjb3JhdGlvbihuZXcgUmFuZ2UoMSwgMSwgMSwgNCksICdscy1jbGFzcycsIElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXJBZmZlY3RpbmdMZXR0ZXJTcGFjaW5nKV1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgaW5qZWN0aW9ucyBvbiBhIHNpbmdsZSBvdXRwdXQgbGluZScsICgpID0+IHtcblx0XHRjb25zdCBpbmplY3Rpb25PcHRpb25zOiBJbmplY3RlZFRleHRPcHRpb25zW10gPSBbXG5cdFx0XHR7IGNvbnRlbnQ6ICdBQScsIGlubGluZUNsYXNzTmFtZTogJ2NsYXNzLWEnIH0sXG5cdFx0XHR7IGNvbnRlbnQ6ICdCQkInLCBpbmxpbmVDbGFzc05hbWU6ICdjbGFzcy1iJyB9XG5cdFx0XTtcblx0XHRjb25zdCBjb250ZXh0OiBJSW5qZWN0ZWRUZXh0SW5saW5lRGVjb3JhdGlvbnNDb21wdXRlckNvbnRleHQgPSB7XG5cdFx0XHRnZXRJbmplY3Rpb25PcHRpb25zOiAoKSA9PiBpbmplY3Rpb25PcHRpb25zLFxuXHRcdFx0Z2V0SW5qZWN0aW9uT2Zmc2V0czogKCkgPT4gWzIsIDVdLFxuXHRcdFx0Z2V0QnJlYWtPZmZzZXRzOiAoKSA9PiBbMTVdLCAvLyAxMCArIDIgKyAzXG5cdFx0XHRnZXRXcmFwcGVkVGV4dEluZGVudExlbmd0aDogKCkgPT4gMCxcblx0XHRcdGdldEJhc2VWaWV3TGluZU51bWJlcjogKCkgPT4gMSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IEluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXIoY29udGV4dCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZXIuZ2V0SW5saW5lRGVjb3JhdGlvbnMoMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFtcblx0XHRcdFx0bmV3IElubGluZURlY29yYXRpb24obmV3IFJhbmdlKDEsIDMsIDEsIDUpLCAnY2xhc3MtYScsIElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXIpLFxuXHRcdFx0XHRuZXcgSW5saW5lRGVjb3JhdGlvbihuZXcgUmFuZ2UoMSwgOCwgMSwgMTEpLCAnY2xhc3MtYicsIElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXIpLFxuXHRcdFx0XVxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmplY3Rpb24gc3Bhbm5pbmcgYWNyb3NzIHdyYXBwZWQgbGluZXMnLCAoKSA9PiB7XG5cdFx0Ly8gT3JpZ2luYWwgdGV4dCBpcyAyMCBjaGFycywgaW5qZWN0aW9uIG9mIDEwIGNoYXJzIGF0IG9mZnNldCA4XG5cdFx0Ly8gQnJlYWsgb2Zmc2V0cyBzcGxpdCBhdCAxNSBhbmQgMzAgKHR3byB3cmFwcGVkIGxpbmVzKVxuXHRcdGNvbnN0IGluamVjdGlvbk9wdGlvbnM6IEluamVjdGVkVGV4dE9wdGlvbnNbXSA9IFtcblx0XHRcdHsgY29udGVudDogJzEyMzQ1Njc4OTAnLCBpbmxpbmVDbGFzc05hbWU6ICdpbmplY3RlZCcgfVxuXHRcdF07XG5cdFx0Y29uc3QgY29udGV4dDogSUluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0ID0ge1xuXHRcdFx0Z2V0SW5qZWN0aW9uT3B0aW9uczogKCkgPT4gaW5qZWN0aW9uT3B0aW9ucyxcblx0XHRcdGdldEluamVjdGlvbk9mZnNldHM6ICgpID0+IFs4XSxcblx0XHRcdGdldEJyZWFrT2Zmc2V0czogKCkgPT4gWzE1LCAzMF0sXG5cdFx0XHRnZXRXcmFwcGVkVGV4dEluZGVudExlbmd0aDogKCkgPT4gMCxcblx0XHRcdGdldEJhc2VWaWV3TGluZU51bWJlcjogKCkgPT4gNSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IEluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXIoY29udGV4dCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZXIuZ2V0SW5saW5lRGVjb3JhdGlvbnMoMSk7XG5cdFx0Ly8gSW5qZWN0ZWQgdGV4dCBzdGFydHMgYXQgb2Zmc2V0IDggaW4gdGhlIGlucHV0IHdpdGggaW5qZWN0aW9uc1xuXHRcdC8vIExpbmUgMDogWzAsIDE1KSwgaW5qZWN0ZWQgdGV4dCBvY2N1cGllcyBbOCwgMTgpIC0+IGNsaXBwZWQgdG8gWzgsIDE1KVxuXHRcdC8vIExpbmUgMTogWzE1LCAzMCksIGluamVjdGVkIHRleHQgb2NjdXBpZXMgWzgsIDE4KSAtPiBjbGlwcGVkIHRvIFsxNSwgMTgpIC0+IHJlbGF0aXZlOiBbMCwgMylcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0W25ldyBJbmxpbmVEZWNvcmF0aW9uKG5ldyBSYW5nZSg1LCA5LCA1LCAxNiksICdpbmplY3RlZCcsIElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXIpXSxcblx0XHRcdFtuZXcgSW5saW5lRGVjb3JhdGlvbihuZXcgUmFuZ2UoNiwgMSwgNiwgNCksICdpbmplY3RlZCcsIElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXIpXSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnaW5qZWN0aW9uIHdpdGggd3JhcHBlZFRleHRJbmRlbnRMZW5ndGggb24gd3JhcHBlZCBsaW5lcycsICgpID0+IHtcblx0XHRjb25zdCBpbmplY3Rpb25PcHRpb25zOiBJbmplY3RlZFRleHRPcHRpb25zW10gPSBbXG5cdFx0XHR7IGNvbnRlbnQ6ICcxMjM0NTY3ODkwMTIzNDU2Nzg5MCcsIGlubGluZUNsYXNzTmFtZTogJ2luamVjdGVkJyB9XG5cdFx0XTtcblx0XHRjb25zdCBjb250ZXh0OiBJSW5qZWN0ZWRUZXh0SW5saW5lRGVjb3JhdGlvbnNDb21wdXRlckNvbnRleHQgPSB7XG5cdFx0XHRnZXRJbmplY3Rpb25PcHRpb25zOiAoKSA9PiBpbmplY3Rpb25PcHRpb25zLFxuXHRcdFx0Z2V0SW5qZWN0aW9uT2Zmc2V0czogKCkgPT4gWzBdLFxuXHRcdFx0Z2V0QnJlYWtPZmZzZXRzOiAoKSA9PiBbMTUsIDMwXSxcblx0XHRcdGdldFdyYXBwZWRUZXh0SW5kZW50TGVuZ3RoOiAoKSA9PiA0LFxuXHRcdFx0Z2V0QmFzZVZpZXdMaW5lTnVtYmVyOiAoKSA9PiAxLFxuXHRcdH07XG5cdFx0Y29uc3QgY29tcHV0ZXIgPSBuZXcgSW5qZWN0ZWRUZXh0SW5saW5lRGVjb3JhdGlvbnNDb21wdXRlcihjb250ZXh0KTtcblx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlci5nZXRJbmxpbmVEZWNvcmF0aW9ucygxKTtcblx0XHQvLyBMaW5lIDAgKG91dHB1dExpbmVJbmRleCAwKTogbm8gb2Zmc2V0LCBzdGFydD0wLCBlbmQ9MTUgLT4gY29sdW1ucyAxIHRvIDE2XG5cdFx0Ly8gTGluZSAxIChvdXRwdXRMaW5lSW5kZXggMSk6IHdyYXBwZWRUZXh0SW5kZW50TGVuZ3RoPTQsIHN0YXJ0PTQrMD00LCBlbmQ9NCs1PTkgLT4gY29sdW1ucyA1IHRvIDEwXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFtuZXcgSW5saW5lRGVjb3JhdGlvbihuZXcgUmFuZ2UoMSwgMSwgMSwgMTYpLCAnaW5qZWN0ZWQnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyKV0sXG5cdFx0XHRbbmV3IElubGluZURlY29yYXRpb24obmV3IFJhbmdlKDIsIDUsIDIsIDEwKSwgJ2luamVjdGVkJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhcildLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmplY3Rpb24gc3RhcnRpbmcgaW4gbGF0ZXIgd3JhcHBlZCBsaW5lJywgKCkgPT4ge1xuXHRcdC8vIEluamVjdGlvbiBhdCBvZmZzZXQgMjAgd2hpY2ggaXMgcGFzdCB0aGUgZmlyc3QgbGluZSBicmVha1xuXHRcdGNvbnN0IGluamVjdGlvbk9wdGlvbnM6IEluamVjdGVkVGV4dE9wdGlvbnNbXSA9IFtcblx0XHRcdHsgY29udGVudDogJ2FiJywgaW5saW5lQ2xhc3NOYW1lOiAnbGF0ZS1jbGFzcycgfVxuXHRcdF07XG5cdFx0Y29uc3QgY29udGV4dDogSUluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0ID0ge1xuXHRcdFx0Z2V0SW5qZWN0aW9uT3B0aW9uczogKCkgPT4gaW5qZWN0aW9uT3B0aW9ucyxcblx0XHRcdGdldEluamVjdGlvbk9mZnNldHM6ICgpID0+IFsyMF0sXG5cdFx0XHRnZXRCcmVha09mZnNldHM6ICgpID0+IFsxNSwgMzJdLCAvLyAzMCArIDJcblx0XHRcdGdldFdyYXBwZWRUZXh0SW5kZW50TGVuZ3RoOiAoKSA9PiAwLFxuXHRcdFx0Z2V0QmFzZVZpZXdMaW5lTnVtYmVyOiAoKSA9PiAxLFxuXHRcdH07XG5cdFx0Y29uc3QgY29tcHV0ZXIgPSBuZXcgSW5qZWN0ZWRUZXh0SW5saW5lRGVjb3JhdGlvbnNDb21wdXRlcihjb250ZXh0KTtcblx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlci5nZXRJbmxpbmVEZWNvcmF0aW9ucygxKTtcblx0XHQvLyBMaW5lIDA6IFswLCAxNSkgLT4gaW5qZWN0aW9uIGF0IG9mZnNldCAyMCBpcyBwYXN0IHRoaXMgbGluZSAtPiBlbXB0eVxuXHRcdC8vIExpbmUgMTogWzE1LCAzMikgLT4gaW5qZWN0aW9uIGF0IG9mZnNldCAyMCAtPiBzdGFydD0yMC0xNT01LCBlbmQ9MjItMTU9NyAtPiBjb2x1bW5zIDYgdG8gOFxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRbXSxcblx0XHRcdFtuZXcgSW5saW5lRGVjb3JhdGlvbihuZXcgUmFuZ2UoMiwgNiwgMiwgOCksICdsYXRlLWNsYXNzJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhcildLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdiYXNlIHZpZXcgbGluZSBudW1iZXIgb2Zmc2V0cyBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5qZWN0aW9uT3B0aW9uczogSW5qZWN0ZWRUZXh0T3B0aW9uc1tdID0gW1xuXHRcdFx0eyBjb250ZW50OiAndGVzdCcsIGlubGluZUNsYXNzTmFtZTogJ3Rlc3QtY2xhc3MnIH1cblx0XHRdO1xuXHRcdGNvbnN0IGNvbnRleHQ6IElJbmplY3RlZFRleHRJbmxpbmVEZWNvcmF0aW9uc0NvbXB1dGVyQ29udGV4dCA9IHtcblx0XHRcdGdldEluamVjdGlvbk9wdGlvbnM6ICgpID0+IGluamVjdGlvbk9wdGlvbnMsXG5cdFx0XHRnZXRJbmplY3Rpb25PZmZzZXRzOiAoKSA9PiBbMF0sXG5cdFx0XHRnZXRCcmVha09mZnNldHM6ICgpID0+IFsxNF0sXG5cdFx0XHRnZXRXcmFwcGVkVGV4dEluZGVudExlbmd0aDogKCkgPT4gMCxcblx0XHRcdGdldEJhc2VWaWV3TGluZU51bWJlcjogKCkgPT4gMTAsXG5cdFx0fTtcblx0XHRjb25zdCBjb21wdXRlciA9IG5ldyBJbmplY3RlZFRleHRJbmxpbmVEZWNvcmF0aW9uc0NvbXB1dGVyKGNvbnRleHQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVyLmdldElubGluZURlY29yYXRpb25zKDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXG5cdFx0XHRbbmV3IElubGluZURlY29yYXRpb24obmV3IFJhbmdlKDEwLCAxLCAxMCwgNSksICd0ZXN0LWNsYXNzJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhcildXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhbmdlIHVzZXMgdmlldyBsaW5lIG51bWJlciwgbm90IG1vZGVsIGxpbmUgbnVtYmVyJywgKCkgPT4ge1xuXHRcdC8vIE1vZGVsIGxpbmUgMyBtYXBzIHRvIHZpZXcgbGluZSA3IChlLmcuIGR1ZSB0byBwcmV2aW91cyBsaW5lcyB3cmFwcGluZykuXG5cdFx0Ly8gVGhlIHJhbmdlIGluIHRoZSByZXN1bHRpbmcgSW5saW5lRGVjb3JhdGlvbiBtdXN0IHVzZSB0aGUgdmlldyBsaW5lIG51bWJlciAoNyksXG5cdFx0Ly8gbm90IHRoZSBtb2RlbCBsaW5lIG51bWJlciAoMykgdGhhdCBpcyBwYXNzZWQgdG8gZ2V0SW5saW5lRGVjb3JhdGlvbnMoKS5cblx0XHRjb25zdCBtb2RlbExpbmVOdW1iZXIgPSAzO1xuXHRcdGNvbnN0IGJhc2VWaWV3TGluZU51bWJlciA9IDc7XG5cdFx0Y29uc3QgaW5qZWN0aW9uT3B0aW9uczogSW5qZWN0ZWRUZXh0T3B0aW9uc1tdID0gW1xuXHRcdFx0eyBjb250ZW50OiAnZ2hvc3QnLCBpbmxpbmVDbGFzc05hbWU6ICdnaG9zdC1jbGFzcycgfVxuXHRcdF07XG5cdFx0Y29uc3QgY29udGV4dDogSUluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0ID0ge1xuXHRcdFx0Z2V0SW5qZWN0aW9uT3B0aW9uczogKCkgPT4gaW5qZWN0aW9uT3B0aW9ucyxcblx0XHRcdGdldEluamVjdGlvbk9mZnNldHM6ICgpID0+IFswXSxcblx0XHRcdGdldEJyZWFrT2Zmc2V0czogKCkgPT4gWzE1XSwgLy8gMTAgKG9yaWdpbmFsKSArIDUgKGluamVjdGVkKVxuXHRcdFx0Z2V0V3JhcHBlZFRleHRJbmRlbnRMZW5ndGg6ICgpID0+IDAsXG5cdFx0XHRnZXRCYXNlVmlld0xpbmVOdW1iZXI6ICgpID0+IGJhc2VWaWV3TGluZU51bWJlcixcblx0XHR9O1xuXHRcdGNvbnN0IGNvbXB1dGVyID0gbmV3IEluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXIoY29udGV4dCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZXIuZ2V0SW5saW5lRGVjb3JhdGlvbnMobW9kZWxMaW5lTnVtYmVyKTtcblx0XHQvLyBUaGUgcmFuZ2UgbXVzdCByZWZlcmVuY2UgdmlldyBsaW5lIDcsIG5vdCBtb2RlbCBsaW5lIDNcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0W25ldyBJbmxpbmVEZWNvcmF0aW9uKG5ldyBSYW5nZSg3LCAxLCA3LCA2KSwgJ2dob3N0LWNsYXNzJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhcildXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhbmdlIHVzZXMgdmlldyBsaW5lIG51bWJlciBvbiB3cmFwcGVkIGxpbmVzLCBub3QgbW9kZWwgbGluZSBudW1iZXInLCAoKSA9PiB7XG5cdFx0Ly8gTW9kZWwgbGluZSAyIHdyYXBzIGludG8gdmlldyBsaW5lcyA1IGFuZCA2LlxuXHRcdC8vIEJvdGggb3V0cHV0IGxpbmVzIG11c3QgdXNlIHZpZXcgbGluZSBudW1iZXJzLCBub3QgbW9kZWwgbGluZSAyLlxuXHRcdGNvbnN0IG1vZGVsTGluZU51bWJlciA9IDI7XG5cdFx0Y29uc3QgYmFzZVZpZXdMaW5lTnVtYmVyID0gNTtcblx0XHRjb25zdCBpbmplY3Rpb25PcHRpb25zOiBJbmplY3RlZFRleHRPcHRpb25zW10gPSBbXG5cdFx0XHR7IGNvbnRlbnQ6ICcxMjM0NTY3ODkwJywgaW5saW5lQ2xhc3NOYW1lOiAnd3JhcC1jbGFzcycgfVxuXHRcdF07XG5cdFx0Y29uc3QgY29udGV4dDogSUluamVjdGVkVGV4dElubGluZURlY29yYXRpb25zQ29tcHV0ZXJDb250ZXh0ID0ge1xuXHRcdFx0Z2V0SW5qZWN0aW9uT3B0aW9uczogKCkgPT4gaW5qZWN0aW9uT3B0aW9ucyxcblx0XHRcdGdldEluamVjdGlvbk9mZnNldHM6ICgpID0+IFswXSxcblx0XHRcdGdldEJyZWFrT2Zmc2V0czogKCkgPT4gWzgsIDIwXSxcblx0XHRcdGdldFdyYXBwZWRUZXh0SW5kZW50TGVuZ3RoOiAoKSA9PiAwLFxuXHRcdFx0Z2V0QmFzZVZpZXdMaW5lTnVtYmVyOiAoKSA9PiBiYXNlVmlld0xpbmVOdW1iZXIsXG5cdFx0fTtcblx0XHRjb25zdCBjb21wdXRlciA9IG5ldyBJbmplY3RlZFRleHRJbmxpbmVEZWNvcmF0aW9uc0NvbXB1dGVyKGNvbnRleHQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVyLmdldElubGluZURlY29yYXRpb25zKG1vZGVsTGluZU51bWJlcik7XG5cdFx0Ly8gRmlyc3Qgd3JhcHBlZCBsaW5lIHVzZXMgdmlldyBsaW5lIDUsIHNlY29uZCB1c2VzIHZpZXcgbGluZSA2XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFtuZXcgSW5saW5lRGVjb3JhdGlvbihuZXcgUmFuZ2UoNSwgMSwgNSwgOSksICd3cmFwLWNsYXNzJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhcildLFxuXHRcdFx0W25ldyBJbmxpbmVEZWNvcmF0aW9uKG5ldyBSYW5nZSg2LCAxLCA2LCAzKSwgJ3dyYXAtY2xhc3MnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyKV0sXG5cdFx0XSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhO0FBRXRCLFNBQVMsa0JBQWtCLHNCQUFzQixnQ0FBd0UsNkNBQTRGO0FBQ3JOLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMs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
