import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ComputedEditorOptions } from "../../../browser/config/editorConfiguration.js";
import { EditorLayoutInfoComputer, EditorOption, EditorOptions, RenderLineNumbersType, RenderMinimap } from "../../../common/config/editorOptions.js";
suite("Editor ViewLayout - EditorLayoutProvider", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function doTest(input, expected) {
    const options = new ComputedEditorOptions();
    options._write(EditorOption.glyphMargin, input.showGlyphMargin);
    options._write(EditorOption.lineNumbersMinChars, input.lineNumbersMinChars);
    options._write(EditorOption.lineDecorationsWidth, input.lineDecorationsWidth);
    options._write(EditorOption.folding, false);
    options._write(EditorOption.padding, { top: 0, bottom: 0 });
    const minimapOptions = {
      enabled: input.minimap,
      autohide: "none",
      size: input.minimapSize || "proportional",
      side: input.minimapSide,
      renderCharacters: input.minimapRenderCharacters,
      maxColumn: input.minimapMaxColumn,
      showSlider: "mouseover",
      scale: 1,
      showRegionSectionHeaders: true,
      showMarkSectionHeaders: true,
      sectionHeaderFontSize: 9,
      sectionHeaderLetterSpacing: 1,
      markSectionHeaderRegex: "\\bMARK:\\s*(?<separator>-?)\\s*(?<label>.*)$"
    };
    options._write(EditorOption.minimap, minimapOptions);
    const scrollbarOptions = {
      arrowSize: input.scrollbarArrowSize,
      vertical: EditorOptions.scrollbar.defaultValue.vertical,
      horizontal: EditorOptions.scrollbar.defaultValue.horizontal,
      useShadows: EditorOptions.scrollbar.defaultValue.useShadows,
      verticalHasArrows: input.verticalScrollbarHasArrows,
      horizontalHasArrows: false,
      handleMouseWheel: EditorOptions.scrollbar.defaultValue.handleMouseWheel,
      alwaysConsumeMouseWheel: true,
      horizontalScrollbarSize: input.horizontalScrollbarHeight,
      horizontalSliderSize: EditorOptions.scrollbar.defaultValue.horizontalSliderSize,
      verticalScrollbarSize: input.verticalScrollbarWidth,
      verticalSliderSize: EditorOptions.scrollbar.defaultValue.verticalSliderSize,
      scrollByPage: EditorOptions.scrollbar.defaultValue.scrollByPage,
      ignoreHorizontalScrollbarInContentHeight: false
    };
    options._write(EditorOption.scrollbar, scrollbarOptions);
    const lineNumbersOptions = {
      renderType: input.showLineNumbers ? RenderLineNumbersType.On : RenderLineNumbersType.Off,
      renderFn: null
    };
    options._write(EditorOption.lineNumbers, lineNumbersOptions);
    options._write(EditorOption.wordWrap, "off");
    options._write(EditorOption.wordWrapColumn, 80);
    options._write(EditorOption.wordWrapOverride1, "inherit");
    options._write(EditorOption.wordWrapOverride2, "inherit");
    options._write(EditorOption.accessibilitySupport, "auto");
    const actual = EditorLayoutInfoComputer.computeLayout(options, {
      memory: null,
      outerWidth: input.outerWidth,
      outerHeight: input.outerHeight,
      isDominatedByLongLines: false,
      lineHeight: input.lineHeight,
      viewLineCount: input.maxLineNumber || Math.pow(10, input.lineNumbersDigitCount) - 1,
      lineNumbersDigitCount: input.lineNumbersDigitCount,
      typicalHalfwidthCharacterWidth: input.typicalHalfwidthCharacterWidth,
      maxDigitWidth: input.maxDigitWidth,
      pixelRatio: input.pixelRatio,
      glyphMarginDecorationLaneCount: 1
    });
    assert.deepStrictEqual(actual, expected);
  }
  test("EditorLayoutProvider 1", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 990,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 800,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 98,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 1.1", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 11,
      horizontalScrollbarHeight: 12,
      scrollbarArrowSize: 13,
      verticalScrollbarHasArrows: true,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 990,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 800,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 97,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 11,
      horizontalScrollbarHeight: 12,
      overviewRuler: {
        top: 13,
        width: 11,
        height: 800 - 2 * 13,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 2", () => {
    doTest({
      outerWidth: 900,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 900,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 890,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 800,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 88,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 3", () => {
    doTest({
      outerWidth: 900,
      outerHeight: 900,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 900,
      height: 900,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 890,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 900,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 900
      },
      viewportColumn: 88,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 900,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 4", () => {
    doTest({
      outerWidth: 900,
      outerHeight: 900,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 5,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 900,
      height: 900,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 890,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 900,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 900
      },
      viewportColumn: 88,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 900,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 5", () => {
    doTest({
      outerWidth: 900,
      outerHeight: 900,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: true,
      lineNumbersMinChars: 5,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 900,
      height: 900,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 50,
      decorationsLeft: 50,
      decorationsWidth: 10,
      contentLeft: 60,
      contentWidth: 840,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 900,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 900
      },
      viewportColumn: 83,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 900,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 6", () => {
    doTest({
      outerWidth: 900,
      outerHeight: 900,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: true,
      lineNumbersMinChars: 5,
      lineNumbersDigitCount: 5,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 900,
      height: 900,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 50,
      decorationsLeft: 50,
      decorationsWidth: 10,
      contentLeft: 60,
      contentWidth: 840,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 900,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 900
      },
      viewportColumn: 83,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 900,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 7", () => {
    doTest({
      outerWidth: 900,
      outerHeight: 900,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: true,
      lineNumbersMinChars: 5,
      lineNumbersDigitCount: 6,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 900,
      height: 900,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 60,
      decorationsLeft: 60,
      decorationsWidth: 10,
      contentLeft: 70,
      contentWidth: 830,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 900,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 900
      },
      viewportColumn: 82,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 900,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 8", () => {
    doTest({
      outerWidth: 900,
      outerHeight: 900,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: true,
      lineNumbersMinChars: 5,
      lineNumbersDigitCount: 6,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 5,
      maxDigitWidth: 5,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 900,
      height: 900,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 30,
      decorationsLeft: 30,
      decorationsWidth: 10,
      contentLeft: 40,
      contentWidth: 860,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 900,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 900
      },
      viewportColumn: 171,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 900,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 8 - rounds floats", () => {
    doTest({
      outerWidth: 900,
      outerHeight: 900,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: true,
      lineNumbersMinChars: 5,
      lineNumbersDigitCount: 6,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 5.05,
      maxDigitWidth: 5.05,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: false,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 900,
      height: 900,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 30,
      decorationsLeft: 30,
      decorationsWidth: 10,
      contentLeft: 40,
      contentWidth: 860,
      minimap: {
        renderMinimap: RenderMinimap.None,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 900,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 900
      },
      viewportColumn: 169,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 900,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 9 - render minimap", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: true,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 1
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 893,
      minimap: {
        renderMinimap: RenderMinimap.Text,
        minimapLeft: 903,
        minimapWidth: 97,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 2,
        minimapCanvasInnerWidth: 97,
        minimapCanvasInnerHeight: 800,
        minimapCanvasOuterWidth: 97,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 89,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 9 - render minimap with pixelRatio = 2", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: true,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 2
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 893,
      minimap: {
        renderMinimap: RenderMinimap.Text,
        minimapLeft: 903,
        minimapWidth: 97,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 2,
        minimapLineHeight: 4,
        minimapCanvasInnerWidth: 194,
        minimapCanvasInnerHeight: 1600,
        minimapCanvasOuterWidth: 97,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 89,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 9 - render minimap with pixelRatio = 4", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: true,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 4
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 935,
      minimap: {
        renderMinimap: RenderMinimap.Text,
        minimapLeft: 945,
        minimapWidth: 55,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 2,
        minimapLineHeight: 4,
        minimapCanvasInnerWidth: 220,
        minimapCanvasInnerHeight: 3200,
        minimapCanvasOuterWidth: 55,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 93,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 10 - render minimap to left", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: true,
      minimapSide: "left",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      pixelRatio: 4
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 55,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 55,
      lineNumbersWidth: 0,
      decorationsLeft: 55,
      decorationsWidth: 10,
      contentLeft: 65,
      contentWidth: 935,
      minimap: {
        renderMinimap: RenderMinimap.Text,
        minimapLeft: 0,
        minimapWidth: 55,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 2,
        minimapLineHeight: 4,
        minimapCanvasInnerWidth: 220,
        minimapCanvasInnerHeight: 3200,
        minimapCanvasOuterWidth: 55,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 93,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 11 - minimap mode cover without sampling", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 3,
      maxLineNumber: 120,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: true,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      minimapSize: "fill",
      pixelRatio: 2
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 893,
      minimap: {
        renderMinimap: RenderMinimap.Text,
        minimapLeft: 903,
        minimapWidth: 97,
        minimapHeightIsEditorHeight: true,
        minimapIsSampling: false,
        minimapScale: 3,
        minimapLineHeight: 13,
        minimapCanvasInnerWidth: 291,
        minimapCanvasInnerHeight: 1560,
        minimapCanvasOuterWidth: 97,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 89,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 12 - minimap mode cover with sampling", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 4,
      maxLineNumber: 2500,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: true,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      minimapSize: "fill",
      pixelRatio: 2
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 935,
      minimap: {
        renderMinimap: RenderMinimap.Text,
        minimapLeft: 945,
        minimapWidth: 55,
        minimapHeightIsEditorHeight: true,
        minimapIsSampling: true,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 110,
        minimapCanvasInnerHeight: 1600,
        minimapCanvasOuterWidth: 55,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 93,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 13 - minimap mode contain without sampling", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 3,
      maxLineNumber: 120,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: true,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      minimapSize: "fit",
      pixelRatio: 2
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 893,
      minimap: {
        renderMinimap: RenderMinimap.Text,
        minimapLeft: 903,
        minimapWidth: 97,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 2,
        minimapLineHeight: 4,
        minimapCanvasInnerWidth: 194,
        minimapCanvasInnerHeight: 1600,
        minimapCanvasOuterWidth: 97,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 89,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("EditorLayoutProvider 14 - minimap mode contain with sampling", () => {
    doTest({
      outerWidth: 1e3,
      outerHeight: 800,
      showGlyphMargin: false,
      lineHeight: 16,
      showLineNumbers: false,
      lineNumbersMinChars: 0,
      lineNumbersDigitCount: 4,
      maxLineNumber: 2500,
      lineDecorationsWidth: 10,
      typicalHalfwidthCharacterWidth: 10,
      maxDigitWidth: 10,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      scrollbarArrowSize: 0,
      verticalScrollbarHasArrows: false,
      minimap: true,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 150,
      minimapSize: "fit",
      pixelRatio: 2
    }, {
      width: 1e3,
      height: 800,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 10,
      contentLeft: 10,
      contentWidth: 935,
      minimap: {
        renderMinimap: RenderMinimap.Text,
        minimapLeft: 945,
        minimapWidth: 55,
        minimapHeightIsEditorHeight: true,
        minimapIsSampling: true,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 110,
        minimapCanvasInnerHeight: 1600,
        minimapCanvasOuterWidth: 55,
        minimapCanvasOuterHeight: 800
      },
      viewportColumn: 93,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 800,
        right: 0
      }
    });
  });
  test("issue #31312: When wrapping, leave 2px for the cursor", () => {
    doTest({
      outerWidth: 1201,
      outerHeight: 422,
      showGlyphMargin: true,
      lineHeight: 30,
      showLineNumbers: true,
      lineNumbersMinChars: 3,
      lineNumbersDigitCount: 1,
      lineDecorationsWidth: 26,
      typicalHalfwidthCharacterWidth: 12.04296875,
      maxDigitWidth: 12.04296875,
      verticalScrollbarWidth: 14,
      horizontalScrollbarHeight: 10,
      scrollbarArrowSize: 11,
      verticalScrollbarHasArrows: false,
      minimap: true,
      minimapSide: "right",
      minimapRenderCharacters: true,
      minimapMaxColumn: 120,
      pixelRatio: 2
    }, {
      width: 1201,
      height: 422,
      glyphMarginLeft: 0,
      glyphMarginWidth: 30,
      glyphMarginDecorationLaneCount: 1,
      lineNumbersLeft: 30,
      lineNumbersWidth: 36,
      decorationsLeft: 66,
      decorationsWidth: 26,
      contentLeft: 92,
      contentWidth: 1018,
      minimap: {
        renderMinimap: RenderMinimap.Text,
        minimapLeft: 1096,
        minimapWidth: 91,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 2,
        minimapLineHeight: 4,
        minimapCanvasInnerWidth: 182,
        minimapCanvasInnerHeight: 844,
        minimapCanvasOuterWidth: 91,
        minimapCanvasOuterHeight: 422
      },
      viewportColumn: 83,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 14,
      horizontalScrollbarHeight: 10,
      overviewRuler: {
        top: 0,
        width: 14,
        height: 422,
        right: 0
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvY29uZmlnL2VkaXRvckxheW91dFByb3ZpZGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbXB1dGVkRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yTGF5b3V0SW5mbywgRWRpdG9yTGF5b3V0SW5mb0NvbXB1dGVyLCBFZGl0b3JNaW5pbWFwT3B0aW9ucywgRWRpdG9yT3B0aW9uLCBFZGl0b3JPcHRpb25zLCBJbnRlcm5hbEVkaXRvclJlbmRlckxpbmVOdW1iZXJzT3B0aW9ucywgSW50ZXJuYWxFZGl0b3JTY3JvbGxiYXJPcHRpb25zLCBSZW5kZXJMaW5lTnVtYmVyc1R5cGUsIFJlbmRlck1pbmltYXAgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuXG5pbnRlcmZhY2UgSUVkaXRvckxheW91dFByb3ZpZGVyT3B0cyB7XG5cdHJlYWRvbmx5IG91dGVyV2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgb3V0ZXJIZWlnaHQ6IG51bWJlcjtcblxuXHRyZWFkb25seSBzaG93R2x5cGhNYXJnaW46IGJvb2xlYW47XG5cdHJlYWRvbmx5IGxpbmVIZWlnaHQ6IG51bWJlcjtcblxuXHRyZWFkb25seSBzaG93TGluZU51bWJlcnM6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGxpbmVOdW1iZXJzTWluQ2hhcnM6IG51bWJlcjtcblx0cmVhZG9ubHkgbGluZU51bWJlcnNEaWdpdENvdW50OiBudW1iZXI7XG5cdG1heExpbmVOdW1iZXI/OiBudW1iZXI7XG5cblx0cmVhZG9ubHkgbGluZURlY29yYXRpb25zV2lkdGg6IG51bWJlcjtcblxuXHRyZWFkb25seSB0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgbWF4RGlnaXRXaWR0aDogbnVtYmVyO1xuXG5cdHJlYWRvbmx5IHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgdmVydGljYWxTY3JvbGxiYXJIYXNBcnJvd3M6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNjcm9sbGJhckFycm93U2l6ZTogbnVtYmVyO1xuXHRyZWFkb25seSBob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiBudW1iZXI7XG5cblx0cmVhZG9ubHkgbWluaW1hcDogYm9vbGVhbjtcblx0cmVhZG9ubHkgbWluaW1hcFNpZGU6ICdsZWZ0JyB8ICdyaWdodCc7XG5cdHJlYWRvbmx5IG1pbmltYXBSZW5kZXJDaGFyYWN0ZXJzOiBib29sZWFuO1xuXHRyZWFkb25seSBtaW5pbWFwTWF4Q29sdW1uOiBudW1iZXI7XG5cdG1pbmltYXBTaXplPzogJ3Byb3BvcnRpb25hbCcgfCAnZmlsbCcgfCAnZml0Jztcblx0cmVhZG9ubHkgcGl4ZWxSYXRpbzogbnVtYmVyO1xufVxuXG5zdWl0ZSgnRWRpdG9yIFZpZXdMYXlvdXQgLSBFZGl0b3JMYXlvdXRQcm92aWRlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBkb1Rlc3QoaW5wdXQ6IElFZGl0b3JMYXlvdXRQcm92aWRlck9wdHMsIGV4cGVjdGVkOiBFZGl0b3JMYXlvdXRJbmZvKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IG5ldyBDb21wdXRlZEVkaXRvck9wdGlvbnMoKTtcblx0XHRvcHRpb25zLl93cml0ZShFZGl0b3JPcHRpb24uZ2x5cGhNYXJnaW4sIGlucHV0LnNob3dHbHlwaE1hcmdpbik7XG5cdFx0b3B0aW9ucy5fd3JpdGUoRWRpdG9yT3B0aW9uLmxpbmVOdW1iZXJzTWluQ2hhcnMsIGlucHV0LmxpbmVOdW1iZXJzTWluQ2hhcnMpO1xuXHRcdG9wdGlvbnMuX3dyaXRlKEVkaXRvck9wdGlvbi5saW5lRGVjb3JhdGlvbnNXaWR0aCwgaW5wdXQubGluZURlY29yYXRpb25zV2lkdGgpO1xuXHRcdG9wdGlvbnMuX3dyaXRlKEVkaXRvck9wdGlvbi5mb2xkaW5nLCBmYWxzZSk7XG5cdFx0b3B0aW9ucy5fd3JpdGUoRWRpdG9yT3B0aW9uLnBhZGRpbmcsIHsgdG9wOiAwLCBib3R0b206IDAgfSk7XG5cdFx0Y29uc3QgbWluaW1hcE9wdGlvbnM6IEVkaXRvck1pbmltYXBPcHRpb25zID0ge1xuXHRcdFx0ZW5hYmxlZDogaW5wdXQubWluaW1hcCxcblx0XHRcdGF1dG9oaWRlOiAnbm9uZScsXG5cdFx0XHRzaXplOiBpbnB1dC5taW5pbWFwU2l6ZSB8fCAncHJvcG9ydGlvbmFsJyxcblx0XHRcdHNpZGU6IGlucHV0Lm1pbmltYXBTaWRlLFxuXHRcdFx0cmVuZGVyQ2hhcmFjdGVyczogaW5wdXQubWluaW1hcFJlbmRlckNoYXJhY3RlcnMsXG5cdFx0XHRtYXhDb2x1bW46IGlucHV0Lm1pbmltYXBNYXhDb2x1bW4sXG5cdFx0XHRzaG93U2xpZGVyOiAnbW91c2VvdmVyJyxcblx0XHRcdHNjYWxlOiAxLFxuXHRcdFx0c2hvd1JlZ2lvblNlY3Rpb25IZWFkZXJzOiB0cnVlLFxuXHRcdFx0c2hvd01hcmtTZWN0aW9uSGVhZGVyczogdHJ1ZSxcblx0XHRcdHNlY3Rpb25IZWFkZXJGb250U2l6ZTogOSxcblx0XHRcdHNlY3Rpb25IZWFkZXJMZXR0ZXJTcGFjaW5nOiAxLFxuXHRcdFx0bWFya1NlY3Rpb25IZWFkZXJSZWdleDogJ1xcXFxiTUFSSzpcXFxccyooPzxzZXBhcmF0b3I+XFwtPylcXFxccyooPzxsYWJlbD4uKikkJyxcblx0XHR9O1xuXHRcdG9wdGlvbnMuX3dyaXRlKEVkaXRvck9wdGlvbi5taW5pbWFwLCBtaW5pbWFwT3B0aW9ucyk7XG5cdFx0Y29uc3Qgc2Nyb2xsYmFyT3B0aW9uczogSW50ZXJuYWxFZGl0b3JTY3JvbGxiYXJPcHRpb25zID0ge1xuXHRcdFx0YXJyb3dTaXplOiBpbnB1dC5zY3JvbGxiYXJBcnJvd1NpemUsXG5cdFx0XHR2ZXJ0aWNhbDogRWRpdG9yT3B0aW9ucy5zY3JvbGxiYXIuZGVmYXVsdFZhbHVlLnZlcnRpY2FsLFxuXHRcdFx0aG9yaXpvbnRhbDogRWRpdG9yT3B0aW9ucy5zY3JvbGxiYXIuZGVmYXVsdFZhbHVlLmhvcml6b250YWwsXG5cdFx0XHR1c2VTaGFkb3dzOiBFZGl0b3JPcHRpb25zLnNjcm9sbGJhci5kZWZhdWx0VmFsdWUudXNlU2hhZG93cyxcblx0XHRcdHZlcnRpY2FsSGFzQXJyb3dzOiBpbnB1dC52ZXJ0aWNhbFNjcm9sbGJhckhhc0Fycm93cyxcblx0XHRcdGhvcml6b250YWxIYXNBcnJvd3M6IGZhbHNlLFxuXHRcdFx0aGFuZGxlTW91c2VXaGVlbDogRWRpdG9yT3B0aW9ucy5zY3JvbGxiYXIuZGVmYXVsdFZhbHVlLmhhbmRsZU1vdXNlV2hlZWwsXG5cdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogdHJ1ZSxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJTaXplOiBpbnB1dC5ob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0LFxuXHRcdFx0aG9yaXpvbnRhbFNsaWRlclNpemU6IEVkaXRvck9wdGlvbnMuc2Nyb2xsYmFyLmRlZmF1bHRWYWx1ZS5ob3Jpem9udGFsU2xpZGVyU2l6ZSxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZTogaW5wdXQudmVydGljYWxTY3JvbGxiYXJXaWR0aCxcblx0XHRcdHZlcnRpY2FsU2xpZGVyU2l6ZTogRWRpdG9yT3B0aW9ucy5zY3JvbGxiYXIuZGVmYXVsdFZhbHVlLnZlcnRpY2FsU2xpZGVyU2l6ZSxcblx0XHRcdHNjcm9sbEJ5UGFnZTogRWRpdG9yT3B0aW9ucy5zY3JvbGxiYXIuZGVmYXVsdFZhbHVlLnNjcm9sbEJ5UGFnZSxcblx0XHRcdGlnbm9yZUhvcml6b250YWxTY3JvbGxiYXJJbkNvbnRlbnRIZWlnaHQ6IGZhbHNlLFxuXHRcdH07XG5cdFx0b3B0aW9ucy5fd3JpdGUoRWRpdG9yT3B0aW9uLnNjcm9sbGJhciwgc2Nyb2xsYmFyT3B0aW9ucyk7XG5cdFx0Y29uc3QgbGluZU51bWJlcnNPcHRpb25zOiBJbnRlcm5hbEVkaXRvclJlbmRlckxpbmVOdW1iZXJzT3B0aW9ucyA9IHtcblx0XHRcdHJlbmRlclR5cGU6IGlucHV0LnNob3dMaW5lTnVtYmVycyA/IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PbiA6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PZmYsXG5cdFx0XHRyZW5kZXJGbjogbnVsbFxuXHRcdH07XG5cdFx0b3B0aW9ucy5fd3JpdGUoRWRpdG9yT3B0aW9uLmxpbmVOdW1iZXJzLCBsaW5lTnVtYmVyc09wdGlvbnMpO1xuXG5cdFx0b3B0aW9ucy5fd3JpdGUoRWRpdG9yT3B0aW9uLndvcmRXcmFwLCAnb2ZmJyk7XG5cdFx0b3B0aW9ucy5fd3JpdGUoRWRpdG9yT3B0aW9uLndvcmRXcmFwQ29sdW1uLCA4MCk7XG5cdFx0b3B0aW9ucy5fd3JpdGUoRWRpdG9yT3B0aW9uLndvcmRXcmFwT3ZlcnJpZGUxLCAnaW5oZXJpdCcpO1xuXHRcdG9wdGlvbnMuX3dyaXRlKEVkaXRvck9wdGlvbi53b3JkV3JhcE92ZXJyaWRlMiwgJ2luaGVyaXQnKTtcblx0XHRvcHRpb25zLl93cml0ZShFZGl0b3JPcHRpb24uYWNjZXNzaWJpbGl0eVN1cHBvcnQsICdhdXRvJyk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBFZGl0b3JMYXlvdXRJbmZvQ29tcHV0ZXIuY29tcHV0ZUxheW91dChvcHRpb25zLCB7XG5cdFx0XHRtZW1vcnk6IG51bGwsXG5cdFx0XHRvdXRlcldpZHRoOiBpbnB1dC5vdXRlcldpZHRoLFxuXHRcdFx0b3V0ZXJIZWlnaHQ6IGlucHV0Lm91dGVySGVpZ2h0LFxuXHRcdFx0aXNEb21pbmF0ZWRCeUxvbmdMaW5lczogZmFsc2UsXG5cdFx0XHRsaW5lSGVpZ2h0OiBpbnB1dC5saW5lSGVpZ2h0LFxuXHRcdFx0dmlld0xpbmVDb3VudDogaW5wdXQubWF4TGluZU51bWJlciB8fCBNYXRoLnBvdygxMCwgaW5wdXQubGluZU51bWJlcnNEaWdpdENvdW50KSAtIDEsXG5cdFx0XHRsaW5lTnVtYmVyc0RpZ2l0Q291bnQ6IGlucHV0LmxpbmVOdW1iZXJzRGlnaXRDb3VudCxcblx0XHRcdHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogaW5wdXQudHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoLFxuXHRcdFx0bWF4RGlnaXRXaWR0aDogaW5wdXQubWF4RGlnaXRXaWR0aCxcblx0XHRcdHBpeGVsUmF0aW86IGlucHV0LnBpeGVsUmF0aW8sXG5cdFx0XHRnbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQ6IDEsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fVxuXG5cdHRlc3QoJ0VkaXRvckxheW91dFByb3ZpZGVyIDEnLCAoKSA9PiB7XG5cdFx0ZG9UZXN0KHtcblx0XHRcdG91dGVyV2lkdGg6IDEwMDAsXG5cdFx0XHRvdXRlckhlaWdodDogODAwLFxuXHRcdFx0c2hvd0dseXBoTWFyZ2luOiBmYWxzZSxcblx0XHRcdGxpbmVIZWlnaHQ6IDE2LFxuXHRcdFx0c2hvd0xpbmVOdW1iZXJzOiBmYWxzZSxcblx0XHRcdGxpbmVOdW1iZXJzTWluQ2hhcnM6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc0RpZ2l0Q291bnQ6IDEsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IDEwLFxuXHRcdFx0bWF4RGlnaXRXaWR0aDogMTAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblx0XHRcdHNjcm9sbGJhckFycm93U2l6ZTogMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFySGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdG1pbmltYXA6IGZhbHNlLFxuXHRcdFx0bWluaW1hcFNpZGU6ICdyaWdodCcsXG5cdFx0XHRtaW5pbWFwUmVuZGVyQ2hhcmFjdGVyczogdHJ1ZSxcblx0XHRcdG1pbmltYXBNYXhDb2x1bW46IDE1MCxcblx0XHRcdHBpeGVsUmF0aW86IDEsXG5cdFx0fSwge1xuXHRcdFx0d2lkdGg6IDEwMDAsXG5cdFx0XHRoZWlnaHQ6IDgwMCxcblxuXHRcdFx0Z2x5cGhNYXJnaW5MZWZ0OiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5XaWR0aDogMCxcblx0XHRcdGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogMSxcblxuXHRcdFx0bGluZU51bWJlcnNMZWZ0OiAwLFxuXHRcdFx0bGluZU51bWJlcnNXaWR0aDogMCxcblxuXHRcdFx0ZGVjb3JhdGlvbnNMZWZ0OiAwLFxuXHRcdFx0ZGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cblx0XHRcdGNvbnRlbnRMZWZ0OiAxMCxcblx0XHRcdGNvbnRlbnRXaWR0aDogOTkwLFxuXG5cdFx0XHRtaW5pbWFwOiB7XG5cdFx0XHRcdHJlbmRlck1pbmltYXA6IFJlbmRlck1pbmltYXAuTm9uZSxcblx0XHRcdFx0bWluaW1hcExlZnQ6IDAsXG5cdFx0XHRcdG1pbmltYXBXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcElzU2FtcGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwU2NhbGU6IDEsXG5cdFx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0OiAxLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVySGVpZ2h0OiA4MDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IDgwMCxcblx0XHRcdH0sXG5cblx0XHRcdHZpZXdwb3J0Q29sdW1uOiA5OCxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHR0b3A6IDAsXG5cdFx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0XHRoZWlnaHQ6IDgwMCxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWRpdG9yTGF5b3V0UHJvdmlkZXIgMS4xJywgKCkgPT4ge1xuXHRcdGRvVGVzdCh7XG5cdFx0XHRvdXRlcldpZHRoOiAxMDAwLFxuXHRcdFx0b3V0ZXJIZWlnaHQ6IDgwMCxcblx0XHRcdHNob3dHbHlwaE1hcmdpbjogZmFsc2UsXG5cdFx0XHRsaW5lSGVpZ2h0OiAxNixcblx0XHRcdHNob3dMaW5lTnVtYmVyczogZmFsc2UsXG5cdFx0XHRsaW5lTnVtYmVyc01pbkNoYXJzOiAwLFxuXHRcdFx0bGluZU51bWJlcnNEaWdpdENvdW50OiAxLFxuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGg6IDEwLFxuXHRcdFx0dHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiAxMCxcblx0XHRcdG1heERpZ2l0V2lkdGg6IDEwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMTEsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAxMixcblx0XHRcdHNjcm9sbGJhckFycm93U2l6ZTogMTMsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhckhhc0Fycm93czogdHJ1ZSxcblx0XHRcdG1pbmltYXA6IGZhbHNlLFxuXHRcdFx0bWluaW1hcFNpZGU6ICdyaWdodCcsXG5cdFx0XHRtaW5pbWFwUmVuZGVyQ2hhcmFjdGVyczogdHJ1ZSxcblx0XHRcdG1pbmltYXBNYXhDb2x1bW46IDE1MCxcblx0XHRcdHBpeGVsUmF0aW86IDEsXG5cdFx0fSwge1xuXHRcdFx0d2lkdGg6IDEwMDAsXG5cdFx0XHRoZWlnaHQ6IDgwMCxcblxuXHRcdFx0Z2x5cGhNYXJnaW5MZWZ0OiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5XaWR0aDogMCxcblx0XHRcdGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogMSxcblxuXHRcdFx0bGluZU51bWJlcnNMZWZ0OiAwLFxuXHRcdFx0bGluZU51bWJlcnNXaWR0aDogMCxcblxuXHRcdFx0ZGVjb3JhdGlvbnNMZWZ0OiAwLFxuXHRcdFx0ZGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cblx0XHRcdGNvbnRlbnRMZWZ0OiAxMCxcblx0XHRcdGNvbnRlbnRXaWR0aDogOTkwLFxuXG5cdFx0XHRtaW5pbWFwOiB7XG5cdFx0XHRcdHJlbmRlck1pbmltYXA6IFJlbmRlck1pbmltYXAuTm9uZSxcblx0XHRcdFx0bWluaW1hcExlZnQ6IDAsXG5cdFx0XHRcdG1pbmltYXBXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcElzU2FtcGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwU2NhbGU6IDEsXG5cdFx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0OiAxLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVySGVpZ2h0OiA4MDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IDgwMCxcblx0XHRcdH0sXG5cblx0XHRcdHZpZXdwb3J0Q29sdW1uOiA5Nyxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAxMSxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDEyLFxuXG5cdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdHRvcDogMTMsXG5cdFx0XHRcdHdpZHRoOiAxMSxcblx0XHRcdFx0aGVpZ2h0OiAoODAwIC0gMiAqIDEzKSxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWRpdG9yTGF5b3V0UHJvdmlkZXIgMicsICgpID0+IHtcblx0XHRkb1Rlc3Qoe1xuXHRcdFx0b3V0ZXJXaWR0aDogOTAwLFxuXHRcdFx0b3V0ZXJIZWlnaHQ6IDgwMCxcblx0XHRcdHNob3dHbHlwaE1hcmdpbjogZmFsc2UsXG5cdFx0XHRsaW5lSGVpZ2h0OiAxNixcblx0XHRcdHNob3dMaW5lTnVtYmVyczogZmFsc2UsXG5cdFx0XHRsaW5lTnVtYmVyc01pbkNoYXJzOiAwLFxuXHRcdFx0bGluZU51bWJlcnNEaWdpdENvdW50OiAxLFxuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGg6IDEwLFxuXHRcdFx0dHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiAxMCxcblx0XHRcdG1heERpZ2l0V2lkdGg6IDEwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cdFx0XHRzY3JvbGxiYXJBcnJvd1NpemU6IDAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhckhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRtaW5pbWFwOiBmYWxzZSxcblx0XHRcdG1pbmltYXBTaWRlOiAncmlnaHQnLFxuXHRcdFx0bWluaW1hcFJlbmRlckNoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRtaW5pbWFwTWF4Q29sdW1uOiAxNTAsXG5cdFx0XHRwaXhlbFJhdGlvOiAxLFxuXHRcdH0sIHtcblx0XHRcdHdpZHRoOiA5MDAsXG5cdFx0XHRoZWlnaHQ6IDgwMCxcblxuXHRcdFx0Z2x5cGhNYXJnaW5MZWZ0OiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5XaWR0aDogMCxcblx0XHRcdGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogMSxcblxuXHRcdFx0bGluZU51bWJlcnNMZWZ0OiAwLFxuXHRcdFx0bGluZU51bWJlcnNXaWR0aDogMCxcblxuXHRcdFx0ZGVjb3JhdGlvbnNMZWZ0OiAwLFxuXHRcdFx0ZGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cblx0XHRcdGNvbnRlbnRMZWZ0OiAxMCxcblx0XHRcdGNvbnRlbnRXaWR0aDogODkwLFxuXG5cdFx0XHRtaW5pbWFwOiB7XG5cdFx0XHRcdHJlbmRlck1pbmltYXA6IFJlbmRlck1pbmltYXAuTm9uZSxcblx0XHRcdFx0bWluaW1hcExlZnQ6IDAsXG5cdFx0XHRcdG1pbmltYXBXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcElzU2FtcGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwU2NhbGU6IDEsXG5cdFx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0OiAxLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVySGVpZ2h0OiA4MDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IDgwMCxcblx0XHRcdH0sXG5cblx0XHRcdHZpZXdwb3J0Q29sdW1uOiA4OCxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHR0b3A6IDAsXG5cdFx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0XHRoZWlnaHQ6IDgwMCxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWRpdG9yTGF5b3V0UHJvdmlkZXIgMycsICgpID0+IHtcblx0XHRkb1Rlc3Qoe1xuXHRcdFx0b3V0ZXJXaWR0aDogOTAwLFxuXHRcdFx0b3V0ZXJIZWlnaHQ6IDkwMCxcblx0XHRcdHNob3dHbHlwaE1hcmdpbjogZmFsc2UsXG5cdFx0XHRsaW5lSGVpZ2h0OiAxNixcblx0XHRcdHNob3dMaW5lTnVtYmVyczogZmFsc2UsXG5cdFx0XHRsaW5lTnVtYmVyc01pbkNoYXJzOiAwLFxuXHRcdFx0bGluZU51bWJlcnNEaWdpdENvdW50OiAxLFxuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGg6IDEwLFxuXHRcdFx0dHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiAxMCxcblx0XHRcdG1heERpZ2l0V2lkdGg6IDEwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cdFx0XHRzY3JvbGxiYXJBcnJvd1NpemU6IDAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhckhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRtaW5pbWFwOiBmYWxzZSxcblx0XHRcdG1pbmltYXBTaWRlOiAncmlnaHQnLFxuXHRcdFx0bWluaW1hcFJlbmRlckNoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRtaW5pbWFwTWF4Q29sdW1uOiAxNTAsXG5cdFx0XHRwaXhlbFJhdGlvOiAxLFxuXHRcdH0sIHtcblx0XHRcdHdpZHRoOiA5MDAsXG5cdFx0XHRoZWlnaHQ6IDkwMCxcblxuXHRcdFx0Z2x5cGhNYXJnaW5MZWZ0OiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5XaWR0aDogMCxcblx0XHRcdGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogMSxcblxuXHRcdFx0bGluZU51bWJlcnNMZWZ0OiAwLFxuXHRcdFx0bGluZU51bWJlcnNXaWR0aDogMCxcblxuXHRcdFx0ZGVjb3JhdGlvbnNMZWZ0OiAwLFxuXHRcdFx0ZGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cblx0XHRcdGNvbnRlbnRMZWZ0OiAxMCxcblx0XHRcdGNvbnRlbnRXaWR0aDogODkwLFxuXG5cdFx0XHRtaW5pbWFwOiB7XG5cdFx0XHRcdHJlbmRlck1pbmltYXA6IFJlbmRlck1pbmltYXAuTm9uZSxcblx0XHRcdFx0bWluaW1hcExlZnQ6IDAsXG5cdFx0XHRcdG1pbmltYXBXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcElzU2FtcGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwU2NhbGU6IDEsXG5cdFx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0OiAxLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVySGVpZ2h0OiA5MDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IDkwMCxcblx0XHRcdH0sXG5cblx0XHRcdHZpZXdwb3J0Q29sdW1uOiA4OCxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHR0b3A6IDAsXG5cdFx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0XHRoZWlnaHQ6IDkwMCxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWRpdG9yTGF5b3V0UHJvdmlkZXIgNCcsICgpID0+IHtcblx0XHRkb1Rlc3Qoe1xuXHRcdFx0b3V0ZXJXaWR0aDogOTAwLFxuXHRcdFx0b3V0ZXJIZWlnaHQ6IDkwMCxcblx0XHRcdHNob3dHbHlwaE1hcmdpbjogZmFsc2UsXG5cdFx0XHRsaW5lSGVpZ2h0OiAxNixcblx0XHRcdHNob3dMaW5lTnVtYmVyczogZmFsc2UsXG5cdFx0XHRsaW5lTnVtYmVyc01pbkNoYXJzOiA1LFxuXHRcdFx0bGluZU51bWJlcnNEaWdpdENvdW50OiAxLFxuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGg6IDEwLFxuXHRcdFx0dHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiAxMCxcblx0XHRcdG1heERpZ2l0V2lkdGg6IDEwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cdFx0XHRzY3JvbGxiYXJBcnJvd1NpemU6IDAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhckhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRtaW5pbWFwOiBmYWxzZSxcblx0XHRcdG1pbmltYXBTaWRlOiAncmlnaHQnLFxuXHRcdFx0bWluaW1hcFJlbmRlckNoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRtaW5pbWFwTWF4Q29sdW1uOiAxNTAsXG5cdFx0XHRwaXhlbFJhdGlvOiAxLFxuXHRcdH0sIHtcblx0XHRcdHdpZHRoOiA5MDAsXG5cdFx0XHRoZWlnaHQ6IDkwMCxcblxuXHRcdFx0Z2x5cGhNYXJnaW5MZWZ0OiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5XaWR0aDogMCxcblx0XHRcdGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogMSxcblxuXHRcdFx0bGluZU51bWJlcnNMZWZ0OiAwLFxuXHRcdFx0bGluZU51bWJlcnNXaWR0aDogMCxcblxuXHRcdFx0ZGVjb3JhdGlvbnNMZWZ0OiAwLFxuXHRcdFx0ZGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cblx0XHRcdGNvbnRlbnRMZWZ0OiAxMCxcblx0XHRcdGNvbnRlbnRXaWR0aDogODkwLFxuXG5cdFx0XHRtaW5pbWFwOiB7XG5cdFx0XHRcdHJlbmRlck1pbmltYXA6IFJlbmRlck1pbmltYXAuTm9uZSxcblx0XHRcdFx0bWluaW1hcExlZnQ6IDAsXG5cdFx0XHRcdG1pbmltYXBXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcElzU2FtcGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwU2NhbGU6IDEsXG5cdFx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0OiAxLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVySGVpZ2h0OiA5MDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IDkwMCxcblx0XHRcdH0sXG5cblx0XHRcdHZpZXdwb3J0Q29sdW1uOiA4OCxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHR0b3A6IDAsXG5cdFx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0XHRoZWlnaHQ6IDkwMCxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWRpdG9yTGF5b3V0UHJvdmlkZXIgNScsICgpID0+IHtcblx0XHRkb1Rlc3Qoe1xuXHRcdFx0b3V0ZXJXaWR0aDogOTAwLFxuXHRcdFx0b3V0ZXJIZWlnaHQ6IDkwMCxcblx0XHRcdHNob3dHbHlwaE1hcmdpbjogZmFsc2UsXG5cdFx0XHRsaW5lSGVpZ2h0OiAxNixcblx0XHRcdHNob3dMaW5lTnVtYmVyczogdHJ1ZSxcblx0XHRcdGxpbmVOdW1iZXJzTWluQ2hhcnM6IDUsXG5cdFx0XHRsaW5lTnVtYmVyc0RpZ2l0Q291bnQ6IDEsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IDEwLFxuXHRcdFx0bWF4RGlnaXRXaWR0aDogMTAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblx0XHRcdHNjcm9sbGJhckFycm93U2l6ZTogMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFySGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdG1pbmltYXA6IGZhbHNlLFxuXHRcdFx0bWluaW1hcFNpZGU6ICdyaWdodCcsXG5cdFx0XHRtaW5pbWFwUmVuZGVyQ2hhcmFjdGVyczogdHJ1ZSxcblx0XHRcdG1pbmltYXBNYXhDb2x1bW46IDE1MCxcblx0XHRcdHBpeGVsUmF0aW86IDEsXG5cdFx0fSwge1xuXHRcdFx0d2lkdGg6IDkwMCxcblx0XHRcdGhlaWdodDogOTAwLFxuXG5cdFx0XHRnbHlwaE1hcmdpbkxlZnQ6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbldpZHRoOiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50OiAxLFxuXG5cdFx0XHRsaW5lTnVtYmVyc0xlZnQ6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc1dpZHRoOiA1MCxcblxuXHRcdFx0ZGVjb3JhdGlvbnNMZWZ0OiA1MCxcblx0XHRcdGRlY29yYXRpb25zV2lkdGg6IDEwLFxuXG5cdFx0XHRjb250ZW50TGVmdDogNjAsXG5cdFx0XHRjb250ZW50V2lkdGg6IDg0MCxcblxuXHRcdFx0bWluaW1hcDoge1xuXHRcdFx0XHRyZW5kZXJNaW5pbWFwOiBSZW5kZXJNaW5pbWFwLk5vbmUsXG5cdFx0XHRcdG1pbmltYXBMZWZ0OiAwLFxuXHRcdFx0XHRtaW5pbWFwV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBIZWlnaHRJc0VkaXRvckhlaWdodDogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBJc1NhbXBsaW5nOiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcFNjYWxlOiAxLFxuXHRcdFx0XHRtaW5pbWFwTGluZUhlaWdodDogMSxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVyV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lckhlaWdodDogOTAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVySGVpZ2h0OiA5MDAsXG5cdFx0XHR9LFxuXG5cdFx0XHR2aWV3cG9ydENvbHVtbjogODMsXG5cdFx0XHRpc1dvcmRXcmFwTWluaWZpZWQ6IGZhbHNlLFxuXHRcdFx0aXNWaWV3cG9ydFdyYXBwaW5nOiBmYWxzZSxcblx0XHRcdHdyYXBwaW5nQ29sdW1uOiAtMSxcblxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cblx0XHRcdG92ZXJ2aWV3UnVsZXI6IHtcblx0XHRcdFx0dG9wOiAwLFxuXHRcdFx0XHR3aWR0aDogMCxcblx0XHRcdFx0aGVpZ2h0OiA5MDAsXG5cdFx0XHRcdHJpZ2h0OiAwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VkaXRvckxheW91dFByb3ZpZGVyIDYnLCAoKSA9PiB7XG5cdFx0ZG9UZXN0KHtcblx0XHRcdG91dGVyV2lkdGg6IDkwMCxcblx0XHRcdG91dGVySGVpZ2h0OiA5MDAsXG5cdFx0XHRzaG93R2x5cGhNYXJnaW46IGZhbHNlLFxuXHRcdFx0bGluZUhlaWdodDogMTYsXG5cdFx0XHRzaG93TGluZU51bWJlcnM6IHRydWUsXG5cdFx0XHRsaW5lTnVtYmVyc01pbkNoYXJzOiA1LFxuXHRcdFx0bGluZU51bWJlcnNEaWdpdENvdW50OiA1LFxuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGg6IDEwLFxuXHRcdFx0dHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiAxMCxcblx0XHRcdG1heERpZ2l0V2lkdGg6IDEwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cdFx0XHRzY3JvbGxiYXJBcnJvd1NpemU6IDAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhckhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRtaW5pbWFwOiBmYWxzZSxcblx0XHRcdG1pbmltYXBTaWRlOiAncmlnaHQnLFxuXHRcdFx0bWluaW1hcFJlbmRlckNoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRtaW5pbWFwTWF4Q29sdW1uOiAxNTAsXG5cdFx0XHRwaXhlbFJhdGlvOiAxLFxuXHRcdH0sIHtcblx0XHRcdHdpZHRoOiA5MDAsXG5cdFx0XHRoZWlnaHQ6IDkwMCxcblxuXHRcdFx0Z2x5cGhNYXJnaW5MZWZ0OiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5XaWR0aDogMCxcblx0XHRcdGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogMSxcblxuXHRcdFx0bGluZU51bWJlcnNMZWZ0OiAwLFxuXHRcdFx0bGluZU51bWJlcnNXaWR0aDogNTAsXG5cblx0XHRcdGRlY29yYXRpb25zTGVmdDogNTAsXG5cdFx0XHRkZWNvcmF0aW9uc1dpZHRoOiAxMCxcblxuXHRcdFx0Y29udGVudExlZnQ6IDYwLFxuXHRcdFx0Y29udGVudFdpZHRoOiA4NDAsXG5cblx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0cmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcC5Ob25lLFxuXHRcdFx0XHRtaW5pbWFwTGVmdDogMCxcblx0XHRcdFx0bWluaW1hcFdpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwSXNTYW1wbGluZzogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBTY2FsZTogMSxcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQ6IDEsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQ6IDkwMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlckhlaWdodDogOTAwLFxuXHRcdFx0fSxcblxuXHRcdFx0dmlld3BvcnRDb2x1bW46IDgzLFxuXHRcdFx0aXNXb3JkV3JhcE1pbmlmaWVkOiBmYWxzZSxcblx0XHRcdGlzVmlld3BvcnRXcmFwcGluZzogZmFsc2UsXG5cdFx0XHR3cmFwcGluZ0NvbHVtbjogLTEsXG5cblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXG5cdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdHRvcDogMCxcblx0XHRcdFx0d2lkdGg6IDAsXG5cdFx0XHRcdGhlaWdodDogOTAwLFxuXHRcdFx0XHRyaWdodDogMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFZGl0b3JMYXlvdXRQcm92aWRlciA3JywgKCkgPT4ge1xuXHRcdGRvVGVzdCh7XG5cdFx0XHRvdXRlcldpZHRoOiA5MDAsXG5cdFx0XHRvdXRlckhlaWdodDogOTAwLFxuXHRcdFx0c2hvd0dseXBoTWFyZ2luOiBmYWxzZSxcblx0XHRcdGxpbmVIZWlnaHQ6IDE2LFxuXHRcdFx0c2hvd0xpbmVOdW1iZXJzOiB0cnVlLFxuXHRcdFx0bGluZU51bWJlcnNNaW5DaGFyczogNSxcblx0XHRcdGxpbmVOdW1iZXJzRGlnaXRDb3VudDogNixcblx0XHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoOiAxMCxcblx0XHRcdHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogMTAsXG5cdFx0XHRtYXhEaWdpdFdpZHRoOiAxMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXHRcdFx0c2Nyb2xsYmFyQXJyb3dTaXplOiAwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJIYXNBcnJvd3M6IGZhbHNlLFxuXHRcdFx0bWluaW1hcDogZmFsc2UsXG5cdFx0XHRtaW5pbWFwU2lkZTogJ3JpZ2h0Jyxcblx0XHRcdG1pbmltYXBSZW5kZXJDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0bWluaW1hcE1heENvbHVtbjogMTUwLFxuXHRcdFx0cGl4ZWxSYXRpbzogMSxcblx0XHR9LCB7XG5cdFx0XHR3aWR0aDogOTAwLFxuXHRcdFx0aGVpZ2h0OiA5MDAsXG5cblx0XHRcdGdseXBoTWFyZ2luTGVmdDogMCxcblx0XHRcdGdseXBoTWFyZ2luV2lkdGg6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQ6IDEsXG5cblx0XHRcdGxpbmVOdW1iZXJzTGVmdDogMCxcblx0XHRcdGxpbmVOdW1iZXJzV2lkdGg6IDYwLFxuXG5cdFx0XHRkZWNvcmF0aW9uc0xlZnQ6IDYwLFxuXHRcdFx0ZGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cblx0XHRcdGNvbnRlbnRMZWZ0OiA3MCxcblx0XHRcdGNvbnRlbnRXaWR0aDogODMwLFxuXG5cdFx0XHRtaW5pbWFwOiB7XG5cdFx0XHRcdHJlbmRlck1pbmltYXA6IFJlbmRlck1pbmltYXAuTm9uZSxcblx0XHRcdFx0bWluaW1hcExlZnQ6IDAsXG5cdFx0XHRcdG1pbmltYXBXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcElzU2FtcGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwU2NhbGU6IDEsXG5cdFx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0OiAxLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVySGVpZ2h0OiA5MDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IDkwMCxcblx0XHRcdH0sXG5cblx0XHRcdHZpZXdwb3J0Q29sdW1uOiA4Mixcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHR0b3A6IDAsXG5cdFx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0XHRoZWlnaHQ6IDkwMCxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWRpdG9yTGF5b3V0UHJvdmlkZXIgOCcsICgpID0+IHtcblx0XHRkb1Rlc3Qoe1xuXHRcdFx0b3V0ZXJXaWR0aDogOTAwLFxuXHRcdFx0b3V0ZXJIZWlnaHQ6IDkwMCxcblx0XHRcdHNob3dHbHlwaE1hcmdpbjogZmFsc2UsXG5cdFx0XHRsaW5lSGVpZ2h0OiAxNixcblx0XHRcdHNob3dMaW5lTnVtYmVyczogdHJ1ZSxcblx0XHRcdGxpbmVOdW1iZXJzTWluQ2hhcnM6IDUsXG5cdFx0XHRsaW5lTnVtYmVyc0RpZ2l0Q291bnQ6IDYsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IDUsXG5cdFx0XHRtYXhEaWdpdFdpZHRoOiA1LFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cdFx0XHRzY3JvbGxiYXJBcnJvd1NpemU6IDAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhckhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRtaW5pbWFwOiBmYWxzZSxcblx0XHRcdG1pbmltYXBTaWRlOiAncmlnaHQnLFxuXHRcdFx0bWluaW1hcFJlbmRlckNoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRtaW5pbWFwTWF4Q29sdW1uOiAxNTAsXG5cdFx0XHRwaXhlbFJhdGlvOiAxLFxuXHRcdH0sIHtcblx0XHRcdHdpZHRoOiA5MDAsXG5cdFx0XHRoZWlnaHQ6IDkwMCxcblxuXHRcdFx0Z2x5cGhNYXJnaW5MZWZ0OiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5XaWR0aDogMCxcblx0XHRcdGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogMSxcblxuXHRcdFx0bGluZU51bWJlcnNMZWZ0OiAwLFxuXHRcdFx0bGluZU51bWJlcnNXaWR0aDogMzAsXG5cblx0XHRcdGRlY29yYXRpb25zTGVmdDogMzAsXG5cdFx0XHRkZWNvcmF0aW9uc1dpZHRoOiAxMCxcblxuXHRcdFx0Y29udGVudExlZnQ6IDQwLFxuXHRcdFx0Y29udGVudFdpZHRoOiA4NjAsXG5cblx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0cmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcC5Ob25lLFxuXHRcdFx0XHRtaW5pbWFwTGVmdDogMCxcblx0XHRcdFx0bWluaW1hcFdpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwSXNTYW1wbGluZzogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBTY2FsZTogMSxcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQ6IDEsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQ6IDkwMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlckhlaWdodDogOTAwLFxuXHRcdFx0fSxcblxuXHRcdFx0dmlld3BvcnRDb2x1bW46IDE3MSxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHR0b3A6IDAsXG5cdFx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0XHRoZWlnaHQ6IDkwMCxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWRpdG9yTGF5b3V0UHJvdmlkZXIgOCAtIHJvdW5kcyBmbG9hdHMnLCAoKSA9PiB7XG5cdFx0ZG9UZXN0KHtcblx0XHRcdG91dGVyV2lkdGg6IDkwMCxcblx0XHRcdG91dGVySGVpZ2h0OiA5MDAsXG5cdFx0XHRzaG93R2x5cGhNYXJnaW46IGZhbHNlLFxuXHRcdFx0bGluZUhlaWdodDogMTYsXG5cdFx0XHRzaG93TGluZU51bWJlcnM6IHRydWUsXG5cdFx0XHRsaW5lTnVtYmVyc01pbkNoYXJzOiA1LFxuXHRcdFx0bGluZU51bWJlcnNEaWdpdENvdW50OiA2LFxuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGg6IDEwLFxuXHRcdFx0dHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiA1LjA1LFxuXHRcdFx0bWF4RGlnaXRXaWR0aDogNS4wNSxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXHRcdFx0c2Nyb2xsYmFyQXJyb3dTaXplOiAwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJIYXNBcnJvd3M6IGZhbHNlLFxuXHRcdFx0bWluaW1hcDogZmFsc2UsXG5cdFx0XHRtaW5pbWFwU2lkZTogJ3JpZ2h0Jyxcblx0XHRcdG1pbmltYXBSZW5kZXJDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0bWluaW1hcE1heENvbHVtbjogMTUwLFxuXHRcdFx0cGl4ZWxSYXRpbzogMSxcblx0XHR9LCB7XG5cdFx0XHR3aWR0aDogOTAwLFxuXHRcdFx0aGVpZ2h0OiA5MDAsXG5cblx0XHRcdGdseXBoTWFyZ2luTGVmdDogMCxcblx0XHRcdGdseXBoTWFyZ2luV2lkdGg6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQ6IDEsXG5cblx0XHRcdGxpbmVOdW1iZXJzTGVmdDogMCxcblx0XHRcdGxpbmVOdW1iZXJzV2lkdGg6IDMwLFxuXG5cdFx0XHRkZWNvcmF0aW9uc0xlZnQ6IDMwLFxuXHRcdFx0ZGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cblx0XHRcdGNvbnRlbnRMZWZ0OiA0MCxcblx0XHRcdGNvbnRlbnRXaWR0aDogODYwLFxuXG5cdFx0XHRtaW5pbWFwOiB7XG5cdFx0XHRcdHJlbmRlck1pbmltYXA6IFJlbmRlck1pbmltYXAuTm9uZSxcblx0XHRcdFx0bWluaW1hcExlZnQ6IDAsXG5cdFx0XHRcdG1pbmltYXBXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcElzU2FtcGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwU2NhbGU6IDEsXG5cdFx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0OiAxLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVySGVpZ2h0OiA5MDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IDkwMCxcblx0XHRcdH0sXG5cblx0XHRcdHZpZXdwb3J0Q29sdW1uOiAxNjksXG5cdFx0XHRpc1dvcmRXcmFwTWluaWZpZWQ6IGZhbHNlLFxuXHRcdFx0aXNWaWV3cG9ydFdyYXBwaW5nOiBmYWxzZSxcblx0XHRcdHdyYXBwaW5nQ29sdW1uOiAtMSxcblxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cblx0XHRcdG92ZXJ2aWV3UnVsZXI6IHtcblx0XHRcdFx0dG9wOiAwLFxuXHRcdFx0XHR3aWR0aDogMCxcblx0XHRcdFx0aGVpZ2h0OiA5MDAsXG5cdFx0XHRcdHJpZ2h0OiAwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VkaXRvckxheW91dFByb3ZpZGVyIDkgLSByZW5kZXIgbWluaW1hcCcsICgpID0+IHtcblx0XHRkb1Rlc3Qoe1xuXHRcdFx0b3V0ZXJXaWR0aDogMTAwMCxcblx0XHRcdG91dGVySGVpZ2h0OiA4MDAsXG5cdFx0XHRzaG93R2x5cGhNYXJnaW46IGZhbHNlLFxuXHRcdFx0bGluZUhlaWdodDogMTYsXG5cdFx0XHRzaG93TGluZU51bWJlcnM6IGZhbHNlLFxuXHRcdFx0bGluZU51bWJlcnNNaW5DaGFyczogMCxcblx0XHRcdGxpbmVOdW1iZXJzRGlnaXRDb3VudDogMSxcblx0XHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoOiAxMCxcblx0XHRcdHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogMTAsXG5cdFx0XHRtYXhEaWdpdFdpZHRoOiAxMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDAsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiAwLFxuXHRcdFx0c2Nyb2xsYmFyQXJyb3dTaXplOiAwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJIYXNBcnJvd3M6IGZhbHNlLFxuXHRcdFx0bWluaW1hcDogdHJ1ZSxcblx0XHRcdG1pbmltYXBTaWRlOiAncmlnaHQnLFxuXHRcdFx0bWluaW1hcFJlbmRlckNoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRtaW5pbWFwTWF4Q29sdW1uOiAxNTAsXG5cdFx0XHRwaXhlbFJhdGlvOiAxLFxuXHRcdH0sIHtcblx0XHRcdHdpZHRoOiAxMDAwLFxuXHRcdFx0aGVpZ2h0OiA4MDAsXG5cblx0XHRcdGdseXBoTWFyZ2luTGVmdDogMCxcblx0XHRcdGdseXBoTWFyZ2luV2lkdGg6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQ6IDEsXG5cblx0XHRcdGxpbmVOdW1iZXJzTGVmdDogMCxcblx0XHRcdGxpbmVOdW1iZXJzV2lkdGg6IDAsXG5cblx0XHRcdGRlY29yYXRpb25zTGVmdDogMCxcblx0XHRcdGRlY29yYXRpb25zV2lkdGg6IDEwLFxuXG5cdFx0XHRjb250ZW50TGVmdDogMTAsXG5cdFx0XHRjb250ZW50V2lkdGg6IDg5MyxcblxuXHRcdFx0bWluaW1hcDoge1xuXHRcdFx0XHRyZW5kZXJNaW5pbWFwOiBSZW5kZXJNaW5pbWFwLlRleHQsXG5cdFx0XHRcdG1pbmltYXBMZWZ0OiA5MDMsXG5cdFx0XHRcdG1pbmltYXBXaWR0aDogOTcsXG5cdFx0XHRcdG1pbmltYXBIZWlnaHRJc0VkaXRvckhlaWdodDogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBJc1NhbXBsaW5nOiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcFNjYWxlOiAxLFxuXHRcdFx0XHRtaW5pbWFwTGluZUhlaWdodDogMixcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVyV2lkdGg6IDk3LFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQ6IDgwMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDk3LFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IDgwMCxcblx0XHRcdH0sXG5cblx0XHRcdHZpZXdwb3J0Q29sdW1uOiA4OSxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHR0b3A6IDAsXG5cdFx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0XHRoZWlnaHQ6IDgwMCxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWRpdG9yTGF5b3V0UHJvdmlkZXIgOSAtIHJlbmRlciBtaW5pbWFwIHdpdGggcGl4ZWxSYXRpbyA9IDInLCAoKSA9PiB7XG5cdFx0ZG9UZXN0KHtcblx0XHRcdG91dGVyV2lkdGg6IDEwMDAsXG5cdFx0XHRvdXRlckhlaWdodDogODAwLFxuXHRcdFx0c2hvd0dseXBoTWFyZ2luOiBmYWxzZSxcblx0XHRcdGxpbmVIZWlnaHQ6IDE2LFxuXHRcdFx0c2hvd0xpbmVOdW1iZXJzOiBmYWxzZSxcblx0XHRcdGxpbmVOdW1iZXJzTWluQ2hhcnM6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc0RpZ2l0Q291bnQ6IDEsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IDEwLFxuXHRcdFx0bWF4RGlnaXRXaWR0aDogMTAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblx0XHRcdHNjcm9sbGJhckFycm93U2l6ZTogMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFySGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdG1pbmltYXA6IHRydWUsXG5cdFx0XHRtaW5pbWFwU2lkZTogJ3JpZ2h0Jyxcblx0XHRcdG1pbmltYXBSZW5kZXJDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0bWluaW1hcE1heENvbHVtbjogMTUwLFxuXHRcdFx0cGl4ZWxSYXRpbzogMixcblx0XHR9LCB7XG5cdFx0XHR3aWR0aDogMTAwMCxcblx0XHRcdGhlaWdodDogODAwLFxuXG5cdFx0XHRnbHlwaE1hcmdpbkxlZnQ6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbldpZHRoOiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50OiAxLFxuXG5cdFx0XHRsaW5lTnVtYmVyc0xlZnQ6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc1dpZHRoOiAwLFxuXG5cdFx0XHRkZWNvcmF0aW9uc0xlZnQ6IDAsXG5cdFx0XHRkZWNvcmF0aW9uc1dpZHRoOiAxMCxcblxuXHRcdFx0Y29udGVudExlZnQ6IDEwLFxuXHRcdFx0Y29udGVudFdpZHRoOiA4OTMsXG5cblx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0cmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcC5UZXh0LFxuXHRcdFx0XHRtaW5pbWFwTGVmdDogOTAzLFxuXHRcdFx0XHRtaW5pbWFwV2lkdGg6IDk3LFxuXHRcdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwSXNTYW1wbGluZzogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBTY2FsZTogMixcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQ6IDQsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiAxOTQsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lckhlaWdodDogMTYwMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDk3LFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IDgwMCxcblx0XHRcdH0sXG5cblx0XHRcdHZpZXdwb3J0Q29sdW1uOiA4OSxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHR0b3A6IDAsXG5cdFx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0XHRoZWlnaHQ6IDgwMCxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWRpdG9yTGF5b3V0UHJvdmlkZXIgOSAtIHJlbmRlciBtaW5pbWFwIHdpdGggcGl4ZWxSYXRpbyA9IDQnLCAoKSA9PiB7XG5cdFx0ZG9UZXN0KHtcblx0XHRcdG91dGVyV2lkdGg6IDEwMDAsXG5cdFx0XHRvdXRlckhlaWdodDogODAwLFxuXHRcdFx0c2hvd0dseXBoTWFyZ2luOiBmYWxzZSxcblx0XHRcdGxpbmVIZWlnaHQ6IDE2LFxuXHRcdFx0c2hvd0xpbmVOdW1iZXJzOiBmYWxzZSxcblx0XHRcdGxpbmVOdW1iZXJzTWluQ2hhcnM6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc0RpZ2l0Q291bnQ6IDEsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IDEwLFxuXHRcdFx0bWF4RGlnaXRXaWR0aDogMTAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblx0XHRcdHNjcm9sbGJhckFycm93U2l6ZTogMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFySGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdG1pbmltYXA6IHRydWUsXG5cdFx0XHRtaW5pbWFwU2lkZTogJ3JpZ2h0Jyxcblx0XHRcdG1pbmltYXBSZW5kZXJDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0bWluaW1hcE1heENvbHVtbjogMTUwLFxuXHRcdFx0cGl4ZWxSYXRpbzogNCxcblx0XHR9LCB7XG5cdFx0XHR3aWR0aDogMTAwMCxcblx0XHRcdGhlaWdodDogODAwLFxuXG5cdFx0XHRnbHlwaE1hcmdpbkxlZnQ6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbldpZHRoOiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50OiAxLFxuXG5cdFx0XHRsaW5lTnVtYmVyc0xlZnQ6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc1dpZHRoOiAwLFxuXG5cdFx0XHRkZWNvcmF0aW9uc0xlZnQ6IDAsXG5cdFx0XHRkZWNvcmF0aW9uc1dpZHRoOiAxMCxcblxuXHRcdFx0Y29udGVudExlZnQ6IDEwLFxuXHRcdFx0Y29udGVudFdpZHRoOiA5MzUsXG5cblx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0cmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcC5UZXh0LFxuXHRcdFx0XHRtaW5pbWFwTGVmdDogOTQ1LFxuXHRcdFx0XHRtaW5pbWFwV2lkdGg6IDU1LFxuXHRcdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwSXNTYW1wbGluZzogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBTY2FsZTogMixcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQ6IDQsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiAyMjAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lckhlaWdodDogMzIwMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDU1LFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IDgwMCxcblx0XHRcdH0sXG5cblx0XHRcdHZpZXdwb3J0Q29sdW1uOiA5Myxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHR0b3A6IDAsXG5cdFx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0XHRoZWlnaHQ6IDgwMCxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWRpdG9yTGF5b3V0UHJvdmlkZXIgMTAgLSByZW5kZXIgbWluaW1hcCB0byBsZWZ0JywgKCkgPT4ge1xuXHRcdGRvVGVzdCh7XG5cdFx0XHRvdXRlcldpZHRoOiAxMDAwLFxuXHRcdFx0b3V0ZXJIZWlnaHQ6IDgwMCxcblx0XHRcdHNob3dHbHlwaE1hcmdpbjogZmFsc2UsXG5cdFx0XHRsaW5lSGVpZ2h0OiAxNixcblx0XHRcdHNob3dMaW5lTnVtYmVyczogZmFsc2UsXG5cdFx0XHRsaW5lTnVtYmVyc01pbkNoYXJzOiAwLFxuXHRcdFx0bGluZU51bWJlcnNEaWdpdENvdW50OiAxLFxuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGg6IDEwLFxuXHRcdFx0dHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiAxMCxcblx0XHRcdG1heERpZ2l0V2lkdGg6IDEwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cdFx0XHRzY3JvbGxiYXJBcnJvd1NpemU6IDAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhckhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRtaW5pbWFwOiB0cnVlLFxuXHRcdFx0bWluaW1hcFNpZGU6ICdsZWZ0Jyxcblx0XHRcdG1pbmltYXBSZW5kZXJDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0bWluaW1hcE1heENvbHVtbjogMTUwLFxuXHRcdFx0cGl4ZWxSYXRpbzogNCxcblx0XHR9LCB7XG5cdFx0XHR3aWR0aDogMTAwMCxcblx0XHRcdGhlaWdodDogODAwLFxuXG5cdFx0XHRnbHlwaE1hcmdpbkxlZnQ6IDU1LFxuXHRcdFx0Z2x5cGhNYXJnaW5XaWR0aDogMCxcblx0XHRcdGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogMSxcblxuXHRcdFx0bGluZU51bWJlcnNMZWZ0OiA1NSxcblx0XHRcdGxpbmVOdW1iZXJzV2lkdGg6IDAsXG5cblx0XHRcdGRlY29yYXRpb25zTGVmdDogNTUsXG5cdFx0XHRkZWNvcmF0aW9uc1dpZHRoOiAxMCxcblxuXHRcdFx0Y29udGVudExlZnQ6IDY1LFxuXHRcdFx0Y29udGVudFdpZHRoOiA5MzUsXG5cblx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0cmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcC5UZXh0LFxuXHRcdFx0XHRtaW5pbWFwTGVmdDogMCxcblx0XHRcdFx0bWluaW1hcFdpZHRoOiA1NSxcblx0XHRcdFx0bWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcElzU2FtcGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwU2NhbGU6IDIsXG5cdFx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0OiA0LFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aDogMjIwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQ6IDMyMDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlcldpZHRoOiA1NSxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVySGVpZ2h0OiA4MDAsXG5cdFx0XHR9LFxuXG5cdFx0XHR2aWV3cG9ydENvbHVtbjogOTMsXG5cdFx0XHRpc1dvcmRXcmFwTWluaWZpZWQ6IGZhbHNlLFxuXHRcdFx0aXNWaWV3cG9ydFdyYXBwaW5nOiBmYWxzZSxcblx0XHRcdHdyYXBwaW5nQ29sdW1uOiAtMSxcblxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cblx0XHRcdG92ZXJ2aWV3UnVsZXI6IHtcblx0XHRcdFx0dG9wOiAwLFxuXHRcdFx0XHR3aWR0aDogMCxcblx0XHRcdFx0aGVpZ2h0OiA4MDAsXG5cdFx0XHRcdHJpZ2h0OiAwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VkaXRvckxheW91dFByb3ZpZGVyIDExIC0gbWluaW1hcCBtb2RlIGNvdmVyIHdpdGhvdXQgc2FtcGxpbmcnLCAoKSA9PiB7XG5cdFx0ZG9UZXN0KHtcblx0XHRcdG91dGVyV2lkdGg6IDEwMDAsXG5cdFx0XHRvdXRlckhlaWdodDogODAwLFxuXHRcdFx0c2hvd0dseXBoTWFyZ2luOiBmYWxzZSxcblx0XHRcdGxpbmVIZWlnaHQ6IDE2LFxuXHRcdFx0c2hvd0xpbmVOdW1iZXJzOiBmYWxzZSxcblx0XHRcdGxpbmVOdW1iZXJzTWluQ2hhcnM6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc0RpZ2l0Q291bnQ6IDMsXG5cdFx0XHRtYXhMaW5lTnVtYmVyOiAxMjAsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IDEwLFxuXHRcdFx0bWF4RGlnaXRXaWR0aDogMTAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblx0XHRcdHNjcm9sbGJhckFycm93U2l6ZTogMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFySGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdG1pbmltYXA6IHRydWUsXG5cdFx0XHRtaW5pbWFwU2lkZTogJ3JpZ2h0Jyxcblx0XHRcdG1pbmltYXBSZW5kZXJDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0bWluaW1hcE1heENvbHVtbjogMTUwLFxuXHRcdFx0bWluaW1hcFNpemU6ICdmaWxsJyxcblx0XHRcdHBpeGVsUmF0aW86IDIsXG5cdFx0fSwge1xuXHRcdFx0d2lkdGg6IDEwMDAsXG5cdFx0XHRoZWlnaHQ6IDgwMCxcblxuXHRcdFx0Z2x5cGhNYXJnaW5MZWZ0OiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5XaWR0aDogMCxcblx0XHRcdGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogMSxcblxuXHRcdFx0bGluZU51bWJlcnNMZWZ0OiAwLFxuXHRcdFx0bGluZU51bWJlcnNXaWR0aDogMCxcblxuXHRcdFx0ZGVjb3JhdGlvbnNMZWZ0OiAwLFxuXHRcdFx0ZGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cblx0XHRcdGNvbnRlbnRMZWZ0OiAxMCxcblx0XHRcdGNvbnRlbnRXaWR0aDogODkzLFxuXG5cdFx0XHRtaW5pbWFwOiB7XG5cdFx0XHRcdHJlbmRlck1pbmltYXA6IFJlbmRlck1pbmltYXAuVGV4dCxcblx0XHRcdFx0bWluaW1hcExlZnQ6IDkwMyxcblx0XHRcdFx0bWluaW1hcFdpZHRoOiA5Nyxcblx0XHRcdFx0bWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0OiB0cnVlLFxuXHRcdFx0XHRtaW5pbWFwSXNTYW1wbGluZzogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBTY2FsZTogMyxcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQ6IDEzLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aDogMjkxLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQ6IDE1NjAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlcldpZHRoOiA5Nyxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVySGVpZ2h0OiA4MDAsXG5cdFx0XHR9LFxuXG5cdFx0XHR2aWV3cG9ydENvbHVtbjogODksXG5cdFx0XHRpc1dvcmRXcmFwTWluaWZpZWQ6IGZhbHNlLFxuXHRcdFx0aXNWaWV3cG9ydFdyYXBwaW5nOiBmYWxzZSxcblx0XHRcdHdyYXBwaW5nQ29sdW1uOiAtMSxcblxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cblx0XHRcdG92ZXJ2aWV3UnVsZXI6IHtcblx0XHRcdFx0dG9wOiAwLFxuXHRcdFx0XHR3aWR0aDogMCxcblx0XHRcdFx0aGVpZ2h0OiA4MDAsXG5cdFx0XHRcdHJpZ2h0OiAwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VkaXRvckxheW91dFByb3ZpZGVyIDEyIC0gbWluaW1hcCBtb2RlIGNvdmVyIHdpdGggc2FtcGxpbmcnLCAoKSA9PiB7XG5cdFx0ZG9UZXN0KHtcblx0XHRcdG91dGVyV2lkdGg6IDEwMDAsXG5cdFx0XHRvdXRlckhlaWdodDogODAwLFxuXHRcdFx0c2hvd0dseXBoTWFyZ2luOiBmYWxzZSxcblx0XHRcdGxpbmVIZWlnaHQ6IDE2LFxuXHRcdFx0c2hvd0xpbmVOdW1iZXJzOiBmYWxzZSxcblx0XHRcdGxpbmVOdW1iZXJzTWluQ2hhcnM6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc0RpZ2l0Q291bnQ6IDQsXG5cdFx0XHRtYXhMaW5lTnVtYmVyOiAyNTAwLFxuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGg6IDEwLFxuXHRcdFx0dHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiAxMCxcblx0XHRcdG1heERpZ2l0V2lkdGg6IDEwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cdFx0XHRzY3JvbGxiYXJBcnJvd1NpemU6IDAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhckhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRtaW5pbWFwOiB0cnVlLFxuXHRcdFx0bWluaW1hcFNpZGU6ICdyaWdodCcsXG5cdFx0XHRtaW5pbWFwUmVuZGVyQ2hhcmFjdGVyczogdHJ1ZSxcblx0XHRcdG1pbmltYXBNYXhDb2x1bW46IDE1MCxcblx0XHRcdG1pbmltYXBTaXplOiAnZmlsbCcsXG5cdFx0XHRwaXhlbFJhdGlvOiAyLFxuXHRcdH0sIHtcblx0XHRcdHdpZHRoOiAxMDAwLFxuXHRcdFx0aGVpZ2h0OiA4MDAsXG5cblx0XHRcdGdseXBoTWFyZ2luTGVmdDogMCxcblx0XHRcdGdseXBoTWFyZ2luV2lkdGg6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQ6IDEsXG5cblx0XHRcdGxpbmVOdW1iZXJzTGVmdDogMCxcblx0XHRcdGxpbmVOdW1iZXJzV2lkdGg6IDAsXG5cblx0XHRcdGRlY29yYXRpb25zTGVmdDogMCxcblx0XHRcdGRlY29yYXRpb25zV2lkdGg6IDEwLFxuXG5cdFx0XHRjb250ZW50TGVmdDogMTAsXG5cdFx0XHRjb250ZW50V2lkdGg6IDkzNSxcblxuXHRcdFx0bWluaW1hcDoge1xuXHRcdFx0XHRyZW5kZXJNaW5pbWFwOiBSZW5kZXJNaW5pbWFwLlRleHQsXG5cdFx0XHRcdG1pbmltYXBMZWZ0OiA5NDUsXG5cdFx0XHRcdG1pbmltYXBXaWR0aDogNTUsXG5cdFx0XHRcdG1pbmltYXBIZWlnaHRJc0VkaXRvckhlaWdodDogdHJ1ZSxcblx0XHRcdFx0bWluaW1hcElzU2FtcGxpbmc6IHRydWUsXG5cdFx0XHRcdG1pbmltYXBTY2FsZTogMSxcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQ6IDEsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiAxMTAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lckhlaWdodDogMTYwMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDU1LFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IDgwMCxcblx0XHRcdH0sXG5cblx0XHRcdHZpZXdwb3J0Q29sdW1uOiA5Myxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHR0b3A6IDAsXG5cdFx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0XHRoZWlnaHQ6IDgwMCxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWRpdG9yTGF5b3V0UHJvdmlkZXIgMTMgLSBtaW5pbWFwIG1vZGUgY29udGFpbiB3aXRob3V0IHNhbXBsaW5nJywgKCkgPT4ge1xuXHRcdGRvVGVzdCh7XG5cdFx0XHRvdXRlcldpZHRoOiAxMDAwLFxuXHRcdFx0b3V0ZXJIZWlnaHQ6IDgwMCxcblx0XHRcdHNob3dHbHlwaE1hcmdpbjogZmFsc2UsXG5cdFx0XHRsaW5lSGVpZ2h0OiAxNixcblx0XHRcdHNob3dMaW5lTnVtYmVyczogZmFsc2UsXG5cdFx0XHRsaW5lTnVtYmVyc01pbkNoYXJzOiAwLFxuXHRcdFx0bGluZU51bWJlcnNEaWdpdENvdW50OiAzLFxuXHRcdFx0bWF4TGluZU51bWJlcjogMTIwLFxuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGg6IDEwLFxuXHRcdFx0dHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiAxMCxcblx0XHRcdG1heERpZ2l0V2lkdGg6IDEwLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cdFx0XHRzY3JvbGxiYXJBcnJvd1NpemU6IDAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhckhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRtaW5pbWFwOiB0cnVlLFxuXHRcdFx0bWluaW1hcFNpZGU6ICdyaWdodCcsXG5cdFx0XHRtaW5pbWFwUmVuZGVyQ2hhcmFjdGVyczogdHJ1ZSxcblx0XHRcdG1pbmltYXBNYXhDb2x1bW46IDE1MCxcblx0XHRcdG1pbmltYXBTaXplOiAnZml0Jyxcblx0XHRcdHBpeGVsUmF0aW86IDIsXG5cdFx0fSwge1xuXHRcdFx0d2lkdGg6IDEwMDAsXG5cdFx0XHRoZWlnaHQ6IDgwMCxcblxuXHRcdFx0Z2x5cGhNYXJnaW5MZWZ0OiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5XaWR0aDogMCxcblx0XHRcdGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogMSxcblxuXHRcdFx0bGluZU51bWJlcnNMZWZ0OiAwLFxuXHRcdFx0bGluZU51bWJlcnNXaWR0aDogMCxcblxuXHRcdFx0ZGVjb3JhdGlvbnNMZWZ0OiAwLFxuXHRcdFx0ZGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cblx0XHRcdGNvbnRlbnRMZWZ0OiAxMCxcblx0XHRcdGNvbnRlbnRXaWR0aDogODkzLFxuXG5cdFx0XHRtaW5pbWFwOiB7XG5cdFx0XHRcdHJlbmRlck1pbmltYXA6IFJlbmRlck1pbmltYXAuVGV4dCxcblx0XHRcdFx0bWluaW1hcExlZnQ6IDkwMyxcblx0XHRcdFx0bWluaW1hcFdpZHRoOiA5Nyxcblx0XHRcdFx0bWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcElzU2FtcGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwU2NhbGU6IDIsXG5cdFx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0OiA0LFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aDogMTk0LFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQ6IDE2MDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlcldpZHRoOiA5Nyxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVySGVpZ2h0OiA4MDAsXG5cdFx0XHR9LFxuXG5cdFx0XHR2aWV3cG9ydENvbHVtbjogODksXG5cdFx0XHRpc1dvcmRXcmFwTWluaWZpZWQ6IGZhbHNlLFxuXHRcdFx0aXNWaWV3cG9ydFdyYXBwaW5nOiBmYWxzZSxcblx0XHRcdHdyYXBwaW5nQ29sdW1uOiAtMSxcblxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cblx0XHRcdG92ZXJ2aWV3UnVsZXI6IHtcblx0XHRcdFx0dG9wOiAwLFxuXHRcdFx0XHR3aWR0aDogMCxcblx0XHRcdFx0aGVpZ2h0OiA4MDAsXG5cdFx0XHRcdHJpZ2h0OiAwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VkaXRvckxheW91dFByb3ZpZGVyIDE0IC0gbWluaW1hcCBtb2RlIGNvbnRhaW4gd2l0aCBzYW1wbGluZycsICgpID0+IHtcblx0XHRkb1Rlc3Qoe1xuXHRcdFx0b3V0ZXJXaWR0aDogMTAwMCxcblx0XHRcdG91dGVySGVpZ2h0OiA4MDAsXG5cdFx0XHRzaG93R2x5cGhNYXJnaW46IGZhbHNlLFxuXHRcdFx0bGluZUhlaWdodDogMTYsXG5cdFx0XHRzaG93TGluZU51bWJlcnM6IGZhbHNlLFxuXHRcdFx0bGluZU51bWJlcnNNaW5DaGFyczogMCxcblx0XHRcdGxpbmVOdW1iZXJzRGlnaXRDb3VudDogNCxcblx0XHRcdG1heExpbmVOdW1iZXI6IDI1MDAsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogMTAsXG5cdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IDEwLFxuXHRcdFx0bWF4RGlnaXRXaWR0aDogMTAsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblx0XHRcdHNjcm9sbGJhckFycm93U2l6ZTogMCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFySGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdG1pbmltYXA6IHRydWUsXG5cdFx0XHRtaW5pbWFwU2lkZTogJ3JpZ2h0Jyxcblx0XHRcdG1pbmltYXBSZW5kZXJDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0bWluaW1hcE1heENvbHVtbjogMTUwLFxuXHRcdFx0bWluaW1hcFNpemU6ICdmaXQnLFxuXHRcdFx0cGl4ZWxSYXRpbzogMixcblx0XHR9LCB7XG5cdFx0XHR3aWR0aDogMTAwMCxcblx0XHRcdGhlaWdodDogODAwLFxuXG5cdFx0XHRnbHlwaE1hcmdpbkxlZnQ6IDAsXG5cdFx0XHRnbHlwaE1hcmdpbldpZHRoOiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50OiAxLFxuXG5cdFx0XHRsaW5lTnVtYmVyc0xlZnQ6IDAsXG5cdFx0XHRsaW5lTnVtYmVyc1dpZHRoOiAwLFxuXG5cdFx0XHRkZWNvcmF0aW9uc0xlZnQ6IDAsXG5cdFx0XHRkZWNvcmF0aW9uc1dpZHRoOiAxMCxcblxuXHRcdFx0Y29udGVudExlZnQ6IDEwLFxuXHRcdFx0Y29udGVudFdpZHRoOiA5MzUsXG5cblx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0cmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcC5UZXh0LFxuXHRcdFx0XHRtaW5pbWFwTGVmdDogOTQ1LFxuXHRcdFx0XHRtaW5pbWFwV2lkdGg6IDU1LFxuXHRcdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQ6IHRydWUsXG5cdFx0XHRcdG1pbmltYXBJc1NhbXBsaW5nOiB0cnVlLFxuXHRcdFx0XHRtaW5pbWFwU2NhbGU6IDEsXG5cdFx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0OiAxLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aDogMTEwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQ6IDE2MDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlcldpZHRoOiA1NSxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVySGVpZ2h0OiA4MDAsXG5cdFx0XHR9LFxuXG5cdFx0XHR2aWV3cG9ydENvbHVtbjogOTMsXG5cdFx0XHRpc1dvcmRXcmFwTWluaWZpZWQ6IGZhbHNlLFxuXHRcdFx0aXNWaWV3cG9ydFdyYXBwaW5nOiBmYWxzZSxcblx0XHRcdHdyYXBwaW5nQ29sdW1uOiAtMSxcblxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogMCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDAsXG5cblx0XHRcdG92ZXJ2aWV3UnVsZXI6IHtcblx0XHRcdFx0dG9wOiAwLFxuXHRcdFx0XHR3aWR0aDogMCxcblx0XHRcdFx0aGVpZ2h0OiA4MDAsXG5cdFx0XHRcdHJpZ2h0OiAwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMzMTMxMjogV2hlbiB3cmFwcGluZywgbGVhdmUgMnB4IGZvciB0aGUgY3Vyc29yJywgKCkgPT4ge1xuXHRcdGRvVGVzdCh7XG5cdFx0XHRvdXRlcldpZHRoOiAxMjAxLFxuXHRcdFx0b3V0ZXJIZWlnaHQ6IDQyMixcblx0XHRcdHNob3dHbHlwaE1hcmdpbjogdHJ1ZSxcblx0XHRcdGxpbmVIZWlnaHQ6IDMwLFxuXHRcdFx0c2hvd0xpbmVOdW1iZXJzOiB0cnVlLFxuXHRcdFx0bGluZU51bWJlcnNNaW5DaGFyczogMyxcblx0XHRcdGxpbmVOdW1iZXJzRGlnaXRDb3VudDogMSxcblx0XHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoOiAyNixcblx0XHRcdHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogMTIuMDQyOTY4NzUsXG5cdFx0XHRtYXhEaWdpdFdpZHRoOiAxMi4wNDI5Njg3NSxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IDE0LFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMTAsXG5cdFx0XHRzY3JvbGxiYXJBcnJvd1NpemU6IDExLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJIYXNBcnJvd3M6IGZhbHNlLFxuXHRcdFx0bWluaW1hcDogdHJ1ZSxcblx0XHRcdG1pbmltYXBTaWRlOiAncmlnaHQnLFxuXHRcdFx0bWluaW1hcFJlbmRlckNoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRtaW5pbWFwTWF4Q29sdW1uOiAxMjAsXG5cdFx0XHRwaXhlbFJhdGlvOiAyXG5cdFx0fSwge1xuXHRcdFx0d2lkdGg6IDEyMDEsXG5cdFx0XHRoZWlnaHQ6IDQyMixcblxuXHRcdFx0Z2x5cGhNYXJnaW5MZWZ0OiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5XaWR0aDogMzAsXG5cdFx0XHRnbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQ6IDEsXG5cblx0XHRcdGxpbmVOdW1iZXJzTGVmdDogMzAsXG5cdFx0XHRsaW5lTnVtYmVyc1dpZHRoOiAzNixcblxuXHRcdFx0ZGVjb3JhdGlvbnNMZWZ0OiA2Nixcblx0XHRcdGRlY29yYXRpb25zV2lkdGg6IDI2LFxuXG5cdFx0XHRjb250ZW50TGVmdDogOTIsXG5cdFx0XHRjb250ZW50V2lkdGg6IDEwMTgsXG5cblx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0cmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcC5UZXh0LFxuXHRcdFx0XHRtaW5pbWFwTGVmdDogMTA5Nixcblx0XHRcdFx0bWluaW1hcFdpZHRoOiA5MSxcblx0XHRcdFx0bWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcElzU2FtcGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwU2NhbGU6IDIsXG5cdFx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0OiA0LFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aDogMTgyLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQ6IDg0NCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDkxLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IDQyMixcblx0XHRcdH0sXG5cblx0XHRcdHZpZXdwb3J0Q29sdW1uOiA4Myxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xLFxuXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAxNCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IDEwLFxuXG5cdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdHRvcDogMCxcblx0XHRcdFx0d2lkdGg6IDE0LFxuXHRcdFx0XHRoZWlnaHQ6IDQyMixcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9KTtcblxuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQTJCLDBCQUFnRCxjQUFjLGVBQXVGLHVCQUF1QixxQkFBcUI7QUFnQzVOLE1BQU0sNENBQTRDLE1BQU07QUFFdkQsMENBQXdDO0FBRXhDLFdBQVMsT0FBTyxPQUFrQyxVQUFrQztBQUNuRixVQUFNLFVBQVUsSUFBSSxzQkFBc0I7QUFDMUMsWUFBUSxPQUFPLGFBQWEsYUFBYSxNQUFNLGVBQWU7QUFDOUQsWUFBUSxPQUFPLGFBQWEscUJBQXFCLE1BQU0sbUJBQW1CO0FBQzFFLFlBQVEsT0FBTyxhQUFhLHNCQUFzQixNQUFNLG9CQUFvQjtBQUM1RSxZQUFRLE9BQU8sYUFBYSxTQUFTLEtBQUs7QUFD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
