import "./minimap.css";
import * as dom from "../../../../base/browser/dom.js";
import { createFastDomNode } from "../../../../base/browser/fastDomNode.js";
import { GlobalPointerMoveMonitor } from "../../../../base/browser/globalPointerMoveMonitor.js";
import { CharCode } from "../../../../base/common/charCode.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import * as platform from "../../../../base/common/platform.js";
import * as strings from "../../../../base/common/strings.js";
import { RenderedLinesCollection } from "../../view/viewLayer.js";
import { PartFingerprint, PartFingerprints, ViewPart } from "../../view/viewPart.js";
import { RenderMinimap, EditorOption, MINIMAP_GUTTER_WIDTH, EditorLayoutInfoComputer } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { RGBA8 } from "../../../common/core/misc/rgba.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { ColorId } from "../../../common/encodedTokenAttributes.js";
import { Constants } from "./minimapCharSheet.js";
import { MinimapTokensColorTracker } from "../../../common/viewModel/minimapTokensColorTracker.js";
import * as viewEvents from "../../../common/viewEvents.js";
import { minimapSelection, minimapBackground, minimapForegroundOpacity, editorForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { Selection } from "../../../common/core/selection.js";
import { EventType, Gesture } from "../../../../base/browser/touch.js";
import { MinimapCharRendererFactory } from "./minimapCharRendererFactory.js";
import { MinimapPosition, MinimapSectionHeaderStyle } from "../../../common/model.js";
import { createSingleCallFunction } from "../../../../base/common/functional.js";
import { LRUCache } from "../../../../base/common/map.js";
import { DEFAULT_FONT_FAMILY } from "../../../../base/browser/fonts.js";
import { ViewModelDecoration } from "../../../common/viewModel/viewModelDecoration.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
const POINTER_DRAG_RESET_DISTANCE = 140;
const GUTTER_DECORATION_WIDTH = 2;
class MinimapOptions {
  constructor(configuration, theme, tokensColorTracker) {
    const options = configuration.options;
    const pixelRatio = options.get(EditorOption.pixelRatio);
    const layoutInfo = options.get(EditorOption.layoutInfo);
    const minimapLayout = layoutInfo.minimap;
    const fontInfo = options.get(EditorOption.fontInfo);
    const minimapOpts = options.get(EditorOption.minimap);
    this.renderMinimap = minimapLayout.renderMinimap;
    this.size = minimapOpts.size;
    this.minimapHeightIsEditorHeight = minimapLayout.minimapHeightIsEditorHeight;
    this.scrollBeyondLastLine = options.get(EditorOption.scrollBeyondLastLine);
    this.paddingTop = options.get(EditorOption.padding).top;
    this.paddingBottom = options.get(EditorOption.padding).bottom;
    this.showSlider = minimapOpts.showSlider;
    this.autohide = minimapOpts.autohide;
    this.pixelRatio = pixelRatio;
    this.typicalHalfwidthCharacterWidth = fontInfo.typicalHalfwidthCharacterWidth;
    this.lineHeight = options.get(EditorOption.lineHeight);
    this.minimapLeft = minimapLayout.minimapLeft;
    this.minimapWidth = minimapLayout.minimapWidth;
    this.minimapHeight = layoutInfo.height;
    this.canvasInnerWidth = minimapLayout.minimapCanvasInnerWidth;
    this.canvasInnerHeight = minimapLayout.minimapCanvasInnerHeight;
    this.canvasOuterWidth = minimapLayout.minimapCanvasOuterWidth;
    this.canvasOuterHeight = minimapLayout.minimapCanvasOuterHeight;
    this.isSampling = minimapLayout.minimapIsSampling;
    this.editorHeight = layoutInfo.height;
    this.fontScale = minimapLayout.minimapScale;
    this.minimapLineHeight = minimapLayout.minimapLineHeight;
    this.minimapCharWidth = Constants.BASE_CHAR_WIDTH * this.fontScale;
    this.sectionHeaderFontFamily = DEFAULT_FONT_FAMILY;
    this.sectionHeaderFontSize = minimapOpts.sectionHeaderFontSize * pixelRatio;
    this.sectionHeaderLetterSpacing = minimapOpts.sectionHeaderLetterSpacing;
    this.sectionHeaderFontColor = MinimapOptions._getSectionHeaderColor(theme, tokensColorTracker.getColor(ColorId.DefaultForeground));
    this.charRenderer = createSingleCallFunction(() => MinimapCharRendererFactory.create(this.fontScale, fontInfo.fontFamily));
    this.defaultBackgroundColor = tokensColorTracker.getColor(ColorId.DefaultBackground);
    this.backgroundColor = MinimapOptions._getMinimapBackground(theme, this.defaultBackgroundColor);
    this.foregroundAlpha = MinimapOptions._getMinimapForegroundOpacity(theme);
  }
  static _getMinimapBackground(theme, defaultBackgroundColor) {
    const themeColor = theme.getColor(minimapBackground);
    if (themeColor) {
      return new RGBA8(themeColor.rgba.r, themeColor.rgba.g, themeColor.rgba.b, Math.round(255 * themeColor.rgba.a));
    }
    return defaultBackgroundColor;
  }
  static _getMinimapForegroundOpacity(theme) {
    const themeColor = theme.getColor(minimapForegroundOpacity);
    if (themeColor) {
      return RGBA8._clamp(Math.round(255 * themeColor.rgba.a));
    }
    return 255;
  }
  static _getSectionHeaderColor(theme, defaultForegroundColor) {
    const themeColor = theme.getColor(editorForeground);
    if (themeColor) {
      return new RGBA8(themeColor.rgba.r, themeColor.rgba.g, themeColor.rgba.b, Math.round(255 * themeColor.rgba.a));
    }
    return defaultForegroundColor;
  }
  equals(other) {
    return this.renderMinimap === other.renderMinimap && this.size === other.size && this.minimapHeightIsEditorHeight === other.minimapHeightIsEditorHeight && this.scrollBeyondLastLine === other.scrollBeyondLastLine && this.paddingTop === other.paddingTop && this.paddingBottom === other.paddingBottom && this.showSlider === other.showSlider && this.autohide === other.autohide && this.pixelRatio === other.pixelRatio && this.typicalHalfwidthCharacterWidth === other.typicalHalfwidthCharacterWidth && this.lineHeight === other.lineHeight && this.minimapLeft === other.minimapLeft && this.minimapWidth === other.minimapWidth && this.minimapHeight === other.minimapHeight && this.canvasInnerWidth === other.canvasInnerWidth && this.canvasInnerHeight === other.canvasInnerHeight && this.canvasOuterWidth === other.canvasOuterWidth && this.canvasOuterHeight === other.canvasOuterHeight && this.isSampling === other.isSampling && this.editorHeight === other.editorHeight && this.fontScale === other.fontScale && this.minimapLineHeight === other.minimapLineHeight && this.minimapCharWidth === other.minimapCharWidth && this.sectionHeaderFontSize === other.sectionHeaderFontSize && this.sectionHeaderLetterSpacing === other.sectionHeaderLetterSpacing && this.defaultBackgroundColor && this.defaultBackgroundColor.equals(other.defaultBackgroundColor) && this.backgroundColor && this.backgroundColor.equals(other.backgroundColor) && this.foregroundAlpha === other.foregroundAlpha;
  }
}
class MinimapLayout {
  constructor(scrollTop, scrollHeight, sliderNeeded, _computedSliderRatio, sliderTop, sliderHeight, topPaddingLineCount, startLineNumber, endLineNumber) {
    this.scrollTop = scrollTop;
    this.scrollHeight = scrollHeight;
    this.sliderNeeded = sliderNeeded;
    this._computedSliderRatio = _computedSliderRatio;
    this.sliderTop = sliderTop;
    this.sliderHeight = sliderHeight;
    this.topPaddingLineCount = topPaddingLineCount;
    this.startLineNumber = startLineNumber;
    this.endLineNumber = endLineNumber;
  }
  /**
   * Compute a desired `scrollPosition` such that the slider moves by `delta`.
   */
  getDesiredScrollTopFromDelta(delta) {
    return Math.round(this.scrollTop + delta / this._computedSliderRatio);
  }
  getDesiredScrollTopFromTouchLocation(pageY) {
    return Math.round((pageY - this.sliderHeight / 2) / this._computedSliderRatio);
  }
  /**
   * Intersect a line range with `this.startLineNumber` and `this.endLineNumber`.
   */
  intersectWithViewport(range) {
    const startLineNumber = Math.max(this.startLineNumber, range.startLineNumber);
    const endLineNumber = Math.min(this.endLineNumber, range.endLineNumber);
    if (startLineNumber > endLineNumber) {
      return null;
    }
    return [startLineNumber, endLineNumber];
  }
  /**
   * Get the inner minimap y coordinate for a line number.
   */
  getYForLineNumber(lineNumber, minimapLineHeight) {
    return +(lineNumber - this.startLineNumber + this.topPaddingLineCount) * minimapLineHeight;
  }
  static create(options, viewportStartLineNumber, viewportEndLineNumber, viewportStartLineNumberVerticalOffset, viewportHeight, viewportContainsWhitespaceGaps, lineCount, realLineCount, scrollTop, scrollHeight, previousLayout) {
    const pixelRatio = options.pixelRatio;
    const minimapLineHeight = options.minimapLineHeight;
    const minimapLinesFitting = Math.floor(options.canvasInnerHeight / minimapLineHeight);
    const lineHeight = options.lineHeight;
    if (options.minimapHeightIsEditorHeight) {
      let logicalScrollHeight = realLineCount * options.lineHeight + options.paddingTop + options.paddingBottom;
      if (options.scrollBeyondLastLine) {
        logicalScrollHeight += Math.max(0, viewportHeight - options.lineHeight - options.paddingBottom);
      }
      const sliderHeight2 = Math.max(1, Math.floor(viewportHeight * viewportHeight / logicalScrollHeight));
      const maxMinimapSliderTop2 = Math.max(0, options.minimapHeight - sliderHeight2);
      const computedSliderRatio2 = maxMinimapSliderTop2 / (scrollHeight - viewportHeight);
      const sliderTop2 = scrollTop * computedSliderRatio2;
      const sliderNeeded = maxMinimapSliderTop2 > 0;
      const maxLinesFitting = Math.floor(options.canvasInnerHeight / options.minimapLineHeight);
      const topPaddingLineCount = Math.floor(options.paddingTop / options.lineHeight);
      return new MinimapLayout(scrollTop, scrollHeight, sliderNeeded, computedSliderRatio2, sliderTop2, sliderHeight2, topPaddingLineCount, 1, Math.min(lineCount, maxLinesFitting));
    }
    let sliderHeight;
    if (viewportContainsWhitespaceGaps && viewportEndLineNumber !== lineCount) {
      const viewportLineCount = viewportEndLineNumber - viewportStartLineNumber + 1;
      sliderHeight = Math.floor(viewportLineCount * minimapLineHeight / pixelRatio);
    } else {
      const expectedViewportLineCount = viewportHeight / lineHeight;
      sliderHeight = Math.floor(expectedViewportLineCount * minimapLineHeight / pixelRatio);
    }
    const extraLinesAtTheTop = Math.floor(options.paddingTop / lineHeight);
    let extraLinesAtTheBottom = Math.floor(options.paddingBottom / lineHeight);
    if (options.scrollBeyondLastLine) {
      const expectedViewportLineCount = viewportHeight / lineHeight;
      extraLinesAtTheBottom = Math.max(extraLinesAtTheBottom, expectedViewportLineCount - 1);
    }
    let maxMinimapSliderTop;
    if (extraLinesAtTheBottom > 0) {
      const expectedViewportLineCount = viewportHeight / lineHeight;
      maxMinimapSliderTop = (extraLinesAtTheTop + lineCount + extraLinesAtTheBottom - expectedViewportLineCount - 1) * minimapLineHeight / pixelRatio;
    } else {
      maxMinimapSliderTop = Math.max(0, (extraLinesAtTheTop + lineCount) * minimapLineHeight / pixelRatio - sliderHeight);
    }
    maxMinimapSliderTop = Math.min(options.minimapHeight - sliderHeight, maxMinimapSliderTop);
    const computedSliderRatio = maxMinimapSliderTop / (scrollHeight - viewportHeight);
    const sliderTop = scrollTop * computedSliderRatio;
    if (minimapLinesFitting >= extraLinesAtTheTop + lineCount + extraLinesAtTheBottom) {
      const sliderNeeded = maxMinimapSliderTop > 0;
      return new MinimapLayout(scrollTop, scrollHeight, sliderNeeded, computedSliderRatio, sliderTop, sliderHeight, extraLinesAtTheTop, 1, lineCount);
    } else {
      let consideringStartLineNumber;
      if (viewportStartLineNumber > 1) {
        consideringStartLineNumber = viewportStartLineNumber + extraLinesAtTheTop;
      } else {
        consideringStartLineNumber = Math.max(1, scrollTop / lineHeight);
      }
      let topPaddingLineCount;
      let startLineNumber = Math.max(1, Math.floor(consideringStartLineNumber - sliderTop * pixelRatio / minimapLineHeight));
      if (startLineNumber < extraLinesAtTheTop) {
        topPaddingLineCount = extraLinesAtTheTop - startLineNumber + 1;
        startLineNumber = 1;
      } else {
        topPaddingLineCount = 0;
        startLineNumber = Math.max(1, startLineNumber - extraLinesAtTheTop);
      }
      if (previousLayout && previousLayout.scrollHeight === scrollHeight) {
        if (previousLayout.scrollTop > scrollTop) {
          startLineNumber = Math.min(startLineNumber, previousLayout.startLineNumber);
          topPaddingLineCount = Math.max(topPaddingLineCount, previousLayout.topPaddingLineCount);
        }
        if (previousLayout.scrollTop < scrollTop) {
          startLineNumber = Math.max(startLineNumber, previousLayout.startLineNumber);
          topPaddingLineCount = Math.min(topPaddingLineCount, previousLayout.topPaddingLineCount);
        }
      }
      const endLineNumber = Math.min(lineCount, startLineNumber - topPaddingLineCount + minimapLinesFitting - 1);
      const partialLine = (scrollTop - viewportStartLineNumberVerticalOffset) / lineHeight;
      let sliderTopAligned;
      if (scrollTop >= options.paddingTop) {
        sliderTopAligned = (viewportStartLineNumber - startLineNumber + topPaddingLineCount + partialLine) * minimapLineHeight / pixelRatio;
      } else {
        sliderTopAligned = scrollTop / options.paddingTop * (topPaddingLineCount + partialLine) * minimapLineHeight / pixelRatio;
      }
      return new MinimapLayout(scrollTop, scrollHeight, true, computedSliderRatio, sliderTopAligned, sliderHeight, topPaddingLineCount, startLineNumber, endLineNumber);
    }
  }
}
const _MinimapLine = class _MinimapLine {
  constructor(dy) {
    this.dy = dy;
  }
  onContentChanged() {
    this.dy = -1;
  }
  onTokensChanged() {
    this.dy = -1;
  }
};
_MinimapLine.INVALID = new _MinimapLine(-1);
let MinimapLine = _MinimapLine;
class RenderData {
  constructor(renderedLayout, imageData, lines) {
    this.renderedLayout = renderedLayout;
    this._imageData = imageData;
    this._renderedLines = new RenderedLinesCollection({
      createLine: () => MinimapLine.INVALID
    });
    this._renderedLines._set(renderedLayout.startLineNumber, lines);
  }
  /**
   * Check if the current RenderData matches accurately the new desired layout and no painting is needed.
   */
  linesEquals(layout) {
    if (!this.scrollEquals(layout)) {
      return false;
    }
    const tmp = this._renderedLines._get();
    const lines = tmp.lines;
    for (let i = 0, len = lines.length; i < len; i++) {
      if (lines[i].dy === -1) {
        return false;
      }
    }
    return true;
  }
  /**
   * Check if the current RenderData matches the new layout's scroll position
   */
  scrollEquals(layout) {
    return this.renderedLayout.startLineNumber === layout.startLineNumber && this.renderedLayout.endLineNumber === layout.endLineNumber;
  }
  _get() {
    const tmp = this._renderedLines._get();
    return {
      imageData: this._imageData,
      rendLineNumberStart: tmp.rendLineNumberStart,
      lines: tmp.lines
    };
  }
  onLinesChanged(changeFromLineNumber, changeCount) {
    return this._renderedLines.onLinesChanged(changeFromLineNumber, changeCount);
  }
  onLinesDeleted(deleteFromLineNumber, deleteToLineNumber) {
    this._renderedLines.onLinesDeleted(deleteFromLineNumber, deleteToLineNumber);
  }
  onLinesInserted(insertFromLineNumber, insertToLineNumber) {
    this._renderedLines.onLinesInserted(insertFromLineNumber, insertToLineNumber);
  }
  onTokensChanged(ranges) {
    return this._renderedLines.onTokensChanged(ranges);
  }
}
class MinimapBuffers {
  constructor(ctx, WIDTH, HEIGHT, background) {
    this._backgroundFillData = MinimapBuffers._createBackgroundFillData(WIDTH, HEIGHT, background);
    this._buffers = [
      ctx.createImageData(WIDTH, HEIGHT),
      ctx.createImageData(WIDTH, HEIGHT)
    ];
    this._lastUsedBuffer = 0;
  }
  getBuffer() {
    this._lastUsedBuffer = 1 - this._lastUsedBuffer;
    const result = this._buffers[this._lastUsedBuffer];
    result.data.set(this._backgroundFillData);
    return result;
  }
  static _createBackgroundFillData(WIDTH, HEIGHT, background) {
    const backgroundR = background.r;
    const backgroundG = background.g;
    const backgroundB = background.b;
    const backgroundA = background.a;
    const result = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    let offset = 0;
    for (let i = 0; i < HEIGHT; i++) {
      for (let j = 0; j < WIDTH; j++) {
        result[offset] = backgroundR;
        result[offset + 1] = backgroundG;
        result[offset + 2] = backgroundB;
        result[offset + 3] = backgroundA;
        offset += 4;
      }
    }
    return result;
  }
}
class MinimapSamplingState {
  constructor(samplingRatio, minimapLines) {
    this.samplingRatio = samplingRatio;
    this.minimapLines = minimapLines;
  }
  static compute(options, viewLineCount, oldSamplingState) {
    if (options.renderMinimap === RenderMinimap.None || !options.isSampling) {
      return [null, []];
    }
    const { minimapLineCount } = EditorLayoutInfoComputer.computeContainedMinimapLineCount({
      viewLineCount,
      scrollBeyondLastLine: options.scrollBeyondLastLine,
      paddingTop: options.paddingTop,
      paddingBottom: options.paddingBottom,
      height: options.editorHeight,
      lineHeight: options.lineHeight,
      pixelRatio: options.pixelRatio
    });
    const ratio = viewLineCount / minimapLineCount;
    const halfRatio = ratio / 2;
    if (!oldSamplingState || oldSamplingState.minimapLines.length === 0) {
      const result2 = [];
      result2[0] = 1;
      if (minimapLineCount > 1) {
        for (let i = 0, lastIndex = minimapLineCount - 1; i < lastIndex; i++) {
          result2[i] = Math.round(i * ratio + halfRatio);
        }
        result2[minimapLineCount - 1] = viewLineCount;
      }
      return [new MinimapSamplingState(ratio, result2), []];
    }
    const oldMinimapLines = oldSamplingState.minimapLines;
    const oldLength = oldMinimapLines.length;
    const result = [];
    let oldIndex = 0;
    let oldDeltaLineCount = 0;
    let minViewLineNumber = 1;
    const MAX_EVENT_COUNT = 10;
    let events = [];
    let lastEvent = null;
    for (let i = 0; i < minimapLineCount; i++) {
      const fromViewLineNumber = Math.max(minViewLineNumber, Math.round(i * ratio));
      const toViewLineNumber = Math.max(fromViewLineNumber, Math.round((i + 1) * ratio));
      while (oldIndex < oldLength && oldMinimapLines[oldIndex] < fromViewLineNumber) {
        if (events.length < MAX_EVENT_COUNT) {
          const oldMinimapLineNumber = oldIndex + 1 + oldDeltaLineCount;
          if (lastEvent && lastEvent.type === "deleted" && lastEvent._oldIndex === oldIndex - 1) {
            lastEvent.deleteToLineNumber++;
          } else {
            lastEvent = { type: "deleted", _oldIndex: oldIndex, deleteFromLineNumber: oldMinimapLineNumber, deleteToLineNumber: oldMinimapLineNumber };
            events.push(lastEvent);
          }
          oldDeltaLineCount--;
        }
        oldIndex++;
      }
      let selectedViewLineNumber;
      if (oldIndex < oldLength && oldMinimapLines[oldIndex] <= toViewLineNumber) {
        selectedViewLineNumber = oldMinimapLines[oldIndex];
        oldIndex++;
      } else {
        if (i === 0) {
          selectedViewLineNumber = 1;
        } else if (i + 1 === minimapLineCount) {
          selectedViewLineNumber = viewLineCount;
        } else {
          selectedViewLineNumber = Math.round(i * ratio + halfRatio);
        }
        if (events.length < MAX_EVENT_COUNT) {
          const oldMinimapLineNumber = oldIndex + 1 + oldDeltaLineCount;
          if (lastEvent && lastEvent.type === "inserted" && lastEvent._i === i - 1) {
            lastEvent.insertToLineNumber++;
          } else {
            lastEvent = { type: "inserted", _i: i, insertFromLineNumber: oldMinimapLineNumber, insertToLineNumber: oldMinimapLineNumber };
            events.push(lastEvent);
          }
          oldDeltaLineCount++;
        }
      }
      result[i] = selectedViewLineNumber;
      minViewLineNumber = selectedViewLineNumber;
    }
    if (events.length < MAX_EVENT_COUNT) {
      while (oldIndex < oldLength) {
        const oldMinimapLineNumber = oldIndex + 1 + oldDeltaLineCount;
        if (lastEvent && lastEvent.type === "deleted" && lastEvent._oldIndex === oldIndex - 1) {
          lastEvent.deleteToLineNumber++;
        } else {
          lastEvent = { type: "deleted", _oldIndex: oldIndex, deleteFromLineNumber: oldMinimapLineNumber, deleteToLineNumber: oldMinimapLineNumber };
          events.push(lastEvent);
        }
        oldDeltaLineCount--;
        oldIndex++;
      }
    } else {
      events = [{ type: "flush" }];
    }
    return [new MinimapSamplingState(ratio, result), events];
  }
  modelLineToMinimapLine(lineNumber) {
    return Math.min(this.minimapLines.length, Math.max(1, Math.round(lineNumber / this.samplingRatio)));
  }
  /**
   * Will return null if the model line ranges are not intersecting with a sampled model line.
   */
  modelLineRangeToMinimapLineRange(fromLineNumber, toLineNumber) {
    let fromLineIndex = this.modelLineToMinimapLine(fromLineNumber) - 1;
    while (fromLineIndex > 0 && this.minimapLines[fromLineIndex - 1] >= fromLineNumber) {
      fromLineIndex--;
    }
    let toLineIndex = this.modelLineToMinimapLine(toLineNumber) - 1;
    while (toLineIndex + 1 < this.minimapLines.length && this.minimapLines[toLineIndex + 1] <= toLineNumber) {
      toLineIndex++;
    }
    if (fromLineIndex === toLineIndex) {
      const sampledLineNumber = this.minimapLines[fromLineIndex];
      if (sampledLineNumber < fromLineNumber || sampledLineNumber > toLineNumber) {
        return null;
      }
    }
    return [fromLineIndex + 1, toLineIndex + 1];
  }
  /**
   * Will always return a range, even if it is not intersecting with a sampled model line.
   */
  decorationLineRangeToMinimapLineRange(startLineNumber, endLineNumber) {
    let minimapLineStart = this.modelLineToMinimapLine(startLineNumber);
    let minimapLineEnd = this.modelLineToMinimapLine(endLineNumber);
    if (startLineNumber !== endLineNumber && minimapLineEnd === minimapLineStart) {
      if (minimapLineEnd === this.minimapLines.length) {
        if (minimapLineStart > 1) {
          minimapLineStart--;
        }
      } else {
        minimapLineEnd++;
      }
    }
    return [minimapLineStart, minimapLineEnd];
  }
  onLinesDeleted(e) {
    const deletedLineCount = e.toLineNumber - e.fromLineNumber + 1;
    let changeStartIndex = this.minimapLines.length;
    let changeEndIndex = 0;
    for (let i = this.minimapLines.length - 1; i >= 0; i--) {
      if (this.minimapLines[i] < e.fromLineNumber) {
        break;
      }
      if (this.minimapLines[i] <= e.toLineNumber) {
        this.minimapLines[i] = Math.max(1, e.fromLineNumber - 1);
        changeStartIndex = Math.min(changeStartIndex, i);
        changeEndIndex = Math.max(changeEndIndex, i);
      } else {
        this.minimapLines[i] -= deletedLineCount;
      }
    }
    return [changeStartIndex, changeEndIndex];
  }
  onLinesInserted(e) {
    const insertedLineCount = e.toLineNumber - e.fromLineNumber + 1;
    for (let i = this.minimapLines.length - 1; i >= 0; i--) {
      if (this.minimapLines[i] < e.fromLineNumber) {
        break;
      }
      this.minimapLines[i] += insertedLineCount;
    }
  }
}
class Minimap extends ViewPart {
  constructor(context) {
    super(context);
    this._sectionHeaderCache = new LRUCache(10, 1.5);
    this.tokensColorTracker = MinimapTokensColorTracker.getInstance();
    this._selections = [];
    this._minimapSelections = null;
    this.options = new MinimapOptions(this._context.configuration, this._context.theme, this.tokensColorTracker);
    const [samplingState] = MinimapSamplingState.compute(this.options, this._context.viewModel.getLineCount(), null);
    this._samplingState = samplingState;
    this._shouldCheckSampling = false;
    this._actual = new InnerMinimap(context.theme, this);
  }
  dispose() {
    this._actual.dispose();
    super.dispose();
  }
  getDomNode() {
    return this._actual.getDomNode();
  }
  _onOptionsMaybeChanged() {
    const opts = new MinimapOptions(this._context.configuration, this._context.theme, this.tokensColorTracker);
    if (this.options.equals(opts)) {
      return false;
    }
    this.options = opts;
    this._recreateLineSampling();
    this._actual.onDidChangeOptions();
    return true;
  }
  // ---- begin view event handlers
  onConfigurationChanged(e) {
    return this._onOptionsMaybeChanged();
  }
  onCursorStateChanged(e) {
    this._selections = e.selections;
    this._minimapSelections = null;
    return this._actual.onSelectionChanged();
  }
  onDecorationsChanged(e) {
    if (e.affectsMinimap) {
      return this._actual.onDecorationsChanged();
    }
    return false;
  }
  onFlushed(e) {
    if (this._samplingState) {
      this._shouldCheckSampling = true;
    }
    return this._actual.onFlushed();
  }
  onLinesChanged(e) {
    if (this._samplingState) {
      const minimapLineRange = this._samplingState.modelLineRangeToMinimapLineRange(e.fromLineNumber, e.fromLineNumber + e.count - 1);
      if (minimapLineRange) {
        return this._actual.onLinesChanged(minimapLineRange[0], minimapLineRange[1] - minimapLineRange[0] + 1);
      } else {
        return false;
      }
    } else {
      return this._actual.onLinesChanged(e.fromLineNumber, e.count);
    }
  }
  onLinesDeleted(e) {
    if (this._samplingState) {
      const [changeStartIndex, changeEndIndex] = this._samplingState.onLinesDeleted(e);
      if (changeStartIndex <= changeEndIndex) {
        this._actual.onLinesChanged(changeStartIndex + 1, changeEndIndex - changeStartIndex + 1);
      }
      this._shouldCheckSampling = true;
      return true;
    } else {
      return this._actual.onLinesDeleted(e.fromLineNumber, e.toLineNumber);
    }
  }
  onLinesInserted(e) {
    if (this._samplingState) {
      this._samplingState.onLinesInserted(e);
      this._shouldCheckSampling = true;
      return true;
    } else {
      return this._actual.onLinesInserted(e.fromLineNumber, e.toLineNumber);
    }
  }
  onScrollChanged(e) {
    return this._actual.onScrollChanged(e);
  }
  onThemeChanged(e) {
    this._actual.onThemeChanged();
    this._onOptionsMaybeChanged();
    return true;
  }
  onTokensChanged(e) {
    if (this._samplingState) {
      const ranges = [];
      for (const range of e.ranges) {
        const minimapLineRange = this._samplingState.modelLineRangeToMinimapLineRange(range.fromLineNumber, range.toLineNumber);
        if (minimapLineRange) {
          ranges.push({ fromLineNumber: minimapLineRange[0], toLineNumber: minimapLineRange[1] });
        }
      }
      if (ranges.length) {
        return this._actual.onTokensChanged(ranges);
      } else {
        return false;
      }
    } else {
      return this._actual.onTokensChanged(e.ranges);
    }
  }
  onTokensColorsChanged(e) {
    this._onOptionsMaybeChanged();
    return this._actual.onTokensColorsChanged();
  }
  onZonesChanged(e) {
    return this._actual.onZonesChanged();
  }
  // --- end event handlers
  prepareRender(ctx) {
    if (this._shouldCheckSampling) {
      this._shouldCheckSampling = false;
      this._recreateLineSampling();
    }
  }
  render(ctx) {
    let viewportStartLineNumber = ctx.visibleRange.startLineNumber;
    let viewportEndLineNumber = ctx.visibleRange.endLineNumber;
    if (this._samplingState) {
      viewportStartLineNumber = this._samplingState.modelLineToMinimapLine(viewportStartLineNumber);
      viewportEndLineNumber = this._samplingState.modelLineToMinimapLine(viewportEndLineNumber);
    }
    const minimapCtx = {
      viewportContainsWhitespaceGaps: ctx.viewportData.whitespaceViewportData.length > 0,
      scrollWidth: ctx.scrollWidth,
      scrollHeight: ctx.scrollHeight,
      viewportStartLineNumber,
      viewportEndLineNumber,
      viewportStartLineNumberVerticalOffset: ctx.getVerticalOffsetForLineNumber(viewportStartLineNumber),
      scrollTop: ctx.scrollTop,
      scrollLeft: ctx.scrollLeft,
      viewportWidth: ctx.viewportWidth,
      viewportHeight: ctx.viewportHeight
    };
    this._actual.render(minimapCtx);
  }
  //#region IMinimapModel
  _recreateLineSampling() {
    this._minimapSelections = null;
    const wasSampling = Boolean(this._samplingState);
    const [samplingState, events] = MinimapSamplingState.compute(this.options, this._context.viewModel.getLineCount(), this._samplingState);
    this._samplingState = samplingState;
    if (wasSampling && this._samplingState) {
      for (const event of events) {
        switch (event.type) {
          case "deleted":
            this._actual.onLinesDeleted(event.deleteFromLineNumber, event.deleteToLineNumber);
            break;
          case "inserted":
            this._actual.onLinesInserted(event.insertFromLineNumber, event.insertToLineNumber);
            break;
          case "flush":
            this._actual.onFlushed();
            break;
        }
      }
    }
  }
  getLineCount() {
    if (this._samplingState) {
      return this._samplingState.minimapLines.length;
    }
    return this._context.viewModel.getLineCount();
  }
  getRealLineCount() {
    return this._context.viewModel.getLineCount();
  }
  getLineContent(lineNumber) {
    if (this._samplingState) {
      return this._context.viewModel.getLineContent(this._samplingState.minimapLines[lineNumber - 1]);
    }
    return this._context.viewModel.getLineContent(lineNumber);
  }
  getLineMaxColumn(lineNumber) {
    if (this._samplingState) {
      return this._context.viewModel.getLineMaxColumn(this._samplingState.minimapLines[lineNumber - 1]);
    }
    return this._context.viewModel.getLineMaxColumn(lineNumber);
  }
  getMinimapLinesRenderingData(startLineNumber, endLineNumber, needed) {
    if (this._samplingState) {
      const result = [];
      for (let lineIndex = 0, lineCount = endLineNumber - startLineNumber + 1; lineIndex < lineCount; lineIndex++) {
        if (needed[lineIndex]) {
          result[lineIndex] = this._context.viewModel.getViewLineData(this._samplingState.minimapLines[startLineNumber + lineIndex - 1]);
        } else {
          result[lineIndex] = null;
        }
      }
      return result;
    }
    return this._context.viewModel.getMinimapLinesRenderingData(startLineNumber, endLineNumber, needed).data;
  }
  getSelections() {
    if (this._minimapSelections === null) {
      if (this._samplingState) {
        this._minimapSelections = [];
        for (const selection of this._selections) {
          const [minimapLineStart, minimapLineEnd] = this._samplingState.decorationLineRangeToMinimapLineRange(selection.startLineNumber, selection.endLineNumber);
          this._minimapSelections.push(new Selection(minimapLineStart, selection.startColumn, minimapLineEnd, selection.endColumn));
        }
      } else {
        this._minimapSelections = this._selections;
      }
    }
    return this._minimapSelections;
  }
  getMinimapDecorationsInViewport(startLineNumber, endLineNumber) {
    return this._getMinimapDecorationsInViewport(startLineNumber, endLineNumber).filter((decoration) => !decoration.options.minimap?.sectionHeaderStyle);
  }
  getSectionHeaderDecorationsInViewport(startLineNumber, endLineNumber) {
    const headerHeightInMinimapLines = this.options.sectionHeaderFontSize / this.options.minimapLineHeight;
    startLineNumber = Math.floor(Math.max(1, startLineNumber - headerHeightInMinimapLines));
    return this._getMinimapDecorationsInViewport(startLineNumber, endLineNumber).filter((decoration) => !!decoration.options.minimap?.sectionHeaderStyle);
  }
  _getMinimapDecorationsInViewport(startLineNumber, endLineNumber) {
    let visibleRange;
    if (this._samplingState) {
      const modelStartLineNumber = this._samplingState.minimapLines[startLineNumber - 1];
      const modelEndLineNumber = this._samplingState.minimapLines[endLineNumber - 1];
      visibleRange = new Range(modelStartLineNumber, 1, modelEndLineNumber, this._context.viewModel.getLineMaxColumn(modelEndLineNumber));
    } else {
      visibleRange = new Range(startLineNumber, 1, endLineNumber, this._context.viewModel.getLineMaxColumn(endLineNumber));
    }
    const decorations = this._context.viewModel.getMinimapDecorationsInRange(visibleRange);
    if (this._samplingState) {
      const result = [];
      for (const decoration of decorations) {
        if (!decoration.options.minimap) {
          continue;
        }
        const range = decoration.range;
        const minimapStartLineNumber = this._samplingState.modelLineToMinimapLine(range.startLineNumber);
        const minimapEndLineNumber = this._samplingState.modelLineToMinimapLine(range.endLineNumber);
        result.push(new ViewModelDecoration(new Range(minimapStartLineNumber, range.startColumn, minimapEndLineNumber, range.endColumn), decoration.options));
      }
      return result;
    }
    return decorations;
  }
  getSectionHeaderText(decoration, fitWidth) {
    const headerText = decoration.options.minimap?.sectionHeaderText;
    if (!headerText) {
      return null;
    }
    const cachedText = this._sectionHeaderCache.get(headerText);
    if (cachedText) {
      return cachedText;
    }
    const fittedText = fitWidth(headerText);
    this._sectionHeaderCache.set(headerText, fittedText);
    return fittedText;
  }
  getOptions() {
    return this._context.viewModel.model.getOptions();
  }
  revealLineNumber(lineNumber) {
    if (this._samplingState) {
      lineNumber = this._samplingState.minimapLines[lineNumber - 1];
    }
    this._context.viewModel.revealRange(
      "mouse",
      false,
      new Range(lineNumber, 1, lineNumber, 1),
      viewEvents.VerticalRevealType.Center,
      ScrollType.Smooth
    );
  }
  setScrollTop(scrollTop) {
    this._context.viewModel.viewLayout.setScrollPosition({
      scrollTop
    }, ScrollType.Immediate);
  }
  //#endregion
}
class InnerMinimap extends Disposable {
  constructor(theme, model) {
    super();
    this._renderDecorations = false;
    this._gestureInProgress = false;
    this._isMouseOverMinimap = false;
    this._theme = theme;
    this._model = model;
    this._lastRenderData = null;
    this._buffers = null;
    this._selectionColor = this._theme.getColor(minimapSelection);
    this._domNode = createFastDomNode(document.createElement("div"));
    PartFingerprints.write(this._domNode, PartFingerprint.Minimap);
    this._domNode.setClassName(this._getMinimapDomNodeClassName());
    this._domNode.setPosition("absolute");
    this._domNode.setAttribute("role", "presentation");
    this._domNode.setAttribute("aria-hidden", "true");
    this._shadow = createFastDomNode(document.createElement("div"));
    this._shadow.setClassName("minimap-shadow-hidden");
    this._domNode.appendChild(this._shadow);
    this._canvas = createFastDomNode(document.createElement("canvas"));
    this._canvas.setPosition("absolute");
    this._canvas.setLeft(0);
    this._domNode.appendChild(this._canvas);
    this._decorationsCanvas = createFastDomNode(document.createElement("canvas"));
    this._decorationsCanvas.setPosition("absolute");
    this._decorationsCanvas.setClassName("minimap-decorations-layer");
    this._decorationsCanvas.setLeft(0);
    this._domNode.appendChild(this._decorationsCanvas);
    this._slider = createFastDomNode(document.createElement("div"));
    this._slider.setPosition("absolute");
    this._slider.setClassName("minimap-slider");
    this._slider.setLayerHinting(true);
    this._slider.setContain("strict");
    this._domNode.appendChild(this._slider);
    this._sliderHorizontal = createFastDomNode(document.createElement("div"));
    this._sliderHorizontal.setPosition("absolute");
    this._sliderHorizontal.setClassName("minimap-slider-horizontal");
    this._slider.appendChild(this._sliderHorizontal);
    this._applyLayout();
    this._hideDelayedScheduler = this._register(new RunOnceScheduler(() => this._hideImmediatelyIfMouseIsOutside(), 500));
    this._register(dom.addStandardDisposableListener(this._domNode.domNode, dom.EventType.MOUSE_OVER, () => {
      this._isMouseOverMinimap = true;
    }));
    this._register(dom.addStandardDisposableListener(this._domNode.domNode, dom.EventType.MOUSE_LEAVE, () => {
      this._isMouseOverMinimap = false;
    }));
    this._pointerDownListener = dom.addStandardDisposableListener(this._domNode.domNode, dom.EventType.POINTER_DOWN, (e) => {
      e.preventDefault();
      const isMouse = e.pointerType === "mouse";
      const isLeftClick = e.button === 0;
      const renderMinimap = this._model.options.renderMinimap;
      if (renderMinimap === RenderMinimap.None) {
        return;
      }
      if (!this._lastRenderData) {
        return;
      }
      if (this._model.options.size !== "proportional") {
        if (isLeftClick && this._lastRenderData) {
          const position = dom.getDomNodePagePosition(this._slider.domNode);
          const initialPosY = position.top + position.height / 2;
          this._startSliderDragging(e, initialPosY, this._lastRenderData.renderedLayout);
        }
        return;
      }
      if (isLeftClick || !isMouse) {
        const minimapLineHeight = this._model.options.minimapLineHeight;
        const internalOffsetY = this._model.options.canvasInnerHeight / this._model.options.canvasOuterHeight * e.offsetY;
        const lineIndex = Math.floor(internalOffsetY / minimapLineHeight);
        let lineNumber = lineIndex + this._lastRenderData.renderedLayout.startLineNumber - this._lastRenderData.renderedLayout.topPaddingLineCount;
        lineNumber = Math.min(lineNumber, this._model.getLineCount());
        this._model.revealLineNumber(lineNumber);
      }
    });
    this._sliderPointerMoveMonitor = new GlobalPointerMoveMonitor();
    this._sliderPointerDownListener = dom.addStandardDisposableListener(this._slider.domNode, dom.EventType.POINTER_DOWN, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.button === 0 && this._lastRenderData) {
        this._startSliderDragging(e, e.pageY, this._lastRenderData.renderedLayout);
      }
    });
    this._gestureDisposable = Gesture.addTarget(this._domNode.domNode);
    this._sliderTouchStartListener = dom.addDisposableListener(this._domNode.domNode, EventType.Start, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._lastRenderData) {
        this._slider.toggleClassName("active", true);
        this._gestureInProgress = true;
        this.scrollDueToTouchEvent(e);
      }
    }, { passive: false });
    this._sliderTouchMoveListener = dom.addDisposableListener(this._domNode.domNode, EventType.Change, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._lastRenderData && this._gestureInProgress) {
        this.scrollDueToTouchEvent(e);
      }
    }, { passive: false });
    this._sliderTouchEndListener = dom.addStandardDisposableListener(this._domNode.domNode, EventType.End, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._gestureInProgress = false;
      this._slider.toggleClassName("active", false);
    });
  }
  _hideSoon() {
    this._hideDelayedScheduler.cancel();
    this._hideDelayedScheduler.schedule();
  }
  _hideImmediatelyIfMouseIsOutside() {
    if (this._isMouseOverMinimap) {
      this._hideSoon();
      return;
    }
    this._domNode.toggleClassName("active", false);
  }
  _startSliderDragging(e, initialPosY, initialSliderState) {
    if (!e.target || !(e.target instanceof Element)) {
      return;
    }
    const initialPosX = e.pageX;
    this._slider.toggleClassName("active", true);
    const handlePointerMove = (posy, posx) => {
      const minimapPosition = dom.getDomNodePagePosition(this._domNode.domNode);
      const pointerOrthogonalDelta = Math.min(
        Math.abs(posx - initialPosX),
        Math.abs(posx - minimapPosition.left),
        Math.abs(posx - minimapPosition.left - minimapPosition.width)
      );
      if (platform.isWindows && pointerOrthogonalDelta > POINTER_DRAG_RESET_DISTANCE) {
        this._model.setScrollTop(initialSliderState.scrollTop);
        return;
      }
      const pointerDelta = posy - initialPosY;
      this._model.setScrollTop(initialSliderState.getDesiredScrollTopFromDelta(pointerDelta));
    };
    if (e.pageY !== initialPosY) {
      handlePointerMove(e.pageY, initialPosX);
    }
    this._sliderPointerMoveMonitor.startMonitoring(
      e.target,
      e.pointerId,
      e.buttons,
      (pointerMoveData) => handlePointerMove(pointerMoveData.pageY, pointerMoveData.pageX),
      () => {
        this._slider.toggleClassName("active", false);
      }
    );
  }
  scrollDueToTouchEvent(touch) {
    const startY = this._domNode.domNode.getBoundingClientRect().top;
    const scrollTop = this._lastRenderData.renderedLayout.getDesiredScrollTopFromTouchLocation(touch.pageY - startY);
    this._model.setScrollTop(scrollTop);
  }
  dispose() {
    this._pointerDownListener.dispose();
    this._sliderPointerMoveMonitor.dispose();
    this._sliderPointerDownListener.dispose();
    this._gestureDisposable.dispose();
    this._sliderTouchStartListener.dispose();
    this._sliderTouchMoveListener.dispose();
    this._sliderTouchEndListener.dispose();
    super.dispose();
  }
  _getMinimapDomNodeClassName() {
    const class_ = ["minimap"];
    if (this._model.options.showSlider === "always") {
      class_.push("slider-always");
    } else {
      class_.push("slider-mouseover");
    }
    if (this._model.options.autohide === "mouseover") {
      class_.push("minimap-autohide-mouseover");
    } else if (this._model.options.autohide === "scroll") {
      class_.push("minimap-autohide-scroll");
    }
    return class_.join(" ");
  }
  getDomNode() {
    return this._domNode;
  }
  _applyLayout() {
    this._domNode.setLeft(this._model.options.minimapLeft);
    this._domNode.setWidth(this._model.options.minimapWidth);
    this._domNode.setHeight(this._model.options.minimapHeight);
    this._shadow.setHeight(this._model.options.minimapHeight);
    this._canvas.setWidth(this._model.options.canvasOuterWidth);
    this._canvas.setHeight(this._model.options.canvasOuterHeight);
    this._canvas.domNode.width = this._model.options.canvasInnerWidth;
    this._canvas.domNode.height = this._model.options.canvasInnerHeight;
    this._decorationsCanvas.setWidth(this._model.options.canvasOuterWidth);
    this._decorationsCanvas.setHeight(this._model.options.canvasOuterHeight);
    this._decorationsCanvas.domNode.width = this._model.options.canvasInnerWidth;
    this._decorationsCanvas.domNode.height = this._model.options.canvasInnerHeight;
    this._slider.setWidth(this._model.options.minimapWidth);
  }
  _getBuffer() {
    if (!this._buffers) {
      if (this._model.options.canvasInnerWidth > 0 && this._model.options.canvasInnerHeight > 0) {
        this._buffers = new MinimapBuffers(
          this._canvas.domNode.getContext("2d"),
          this._model.options.canvasInnerWidth,
          this._model.options.canvasInnerHeight,
          this._model.options.backgroundColor
        );
      }
    }
    return this._buffers ? this._buffers.getBuffer() : null;
  }
  // ---- begin view event handlers
  onDidChangeOptions() {
    this._lastRenderData = null;
    this._buffers = null;
    this._applyLayout();
    this._domNode.setClassName(this._getMinimapDomNodeClassName());
  }
  onSelectionChanged() {
    this._renderDecorations = true;
    return true;
  }
  onDecorationsChanged() {
    this._renderDecorations = true;
    return true;
  }
  onFlushed() {
    this._lastRenderData = null;
    return true;
  }
  onLinesChanged(changeFromLineNumber, changeCount) {
    if (this._lastRenderData) {
      return this._lastRenderData.onLinesChanged(changeFromLineNumber, changeCount);
    }
    return false;
  }
  onLinesDeleted(deleteFromLineNumber, deleteToLineNumber) {
    this._lastRenderData?.onLinesDeleted(deleteFromLineNumber, deleteToLineNumber);
    return true;
  }
  onLinesInserted(insertFromLineNumber, insertToLineNumber) {
    this._lastRenderData?.onLinesInserted(insertFromLineNumber, insertToLineNumber);
    return true;
  }
  onScrollChanged(e) {
    if (this._model.options.autohide === "scroll" && (e.scrollTopChanged || e.scrollHeightChanged)) {
      this._domNode.toggleClassName("active", true);
      this._hideSoon();
    }
    this._renderDecorations = true;
    return true;
  }
  onThemeChanged() {
    this._selectionColor = this._theme.getColor(minimapSelection);
    this._renderDecorations = true;
    return true;
  }
  onTokensChanged(ranges) {
    if (this._lastRenderData) {
      return this._lastRenderData.onTokensChanged(ranges);
    }
    return false;
  }
  onTokensColorsChanged() {
    this._lastRenderData = null;
    this._buffers = null;
    return true;
  }
  onZonesChanged() {
    this._lastRenderData = null;
    return true;
  }
  // --- end event handlers
  render(renderingCtx) {
    const renderMinimap = this._model.options.renderMinimap;
    if (renderMinimap === RenderMinimap.None) {
      this._shadow.setClassName("minimap-shadow-hidden");
      this._sliderHorizontal.setWidth(0);
      this._sliderHorizontal.setHeight(0);
      return;
    }
    if (renderingCtx.scrollLeft + renderingCtx.viewportWidth >= renderingCtx.scrollWidth) {
      this._shadow.setClassName("minimap-shadow-hidden");
    } else {
      this._shadow.setClassName("minimap-shadow-visible");
    }
    const layout = MinimapLayout.create(
      this._model.options,
      renderingCtx.viewportStartLineNumber,
      renderingCtx.viewportEndLineNumber,
      renderingCtx.viewportStartLineNumberVerticalOffset,
      renderingCtx.viewportHeight,
      renderingCtx.viewportContainsWhitespaceGaps,
      this._model.getLineCount(),
      this._model.getRealLineCount(),
      renderingCtx.scrollTop,
      renderingCtx.scrollHeight,
      this._lastRenderData ? this._lastRenderData.renderedLayout : null
    );
    this._slider.setDisplay(layout.sliderNeeded ? "block" : "none");
    this._slider.setTop(layout.sliderTop);
    this._slider.setHeight(layout.sliderHeight);
    this._sliderHorizontal.setLeft(0);
    this._sliderHorizontal.setWidth(this._model.options.minimapWidth);
    this._sliderHorizontal.setTop(0);
    this._sliderHorizontal.setHeight(layout.sliderHeight);
    this.renderDecorations(layout);
    this._lastRenderData = this.renderLines(layout);
  }
  renderDecorations(layout) {
    if (this._renderDecorations) {
      this._renderDecorations = false;
      const selections = this._model.getSelections();
      selections.sort(Range.compareRangesUsingStarts);
      const decorations = this._model.getMinimapDecorationsInViewport(layout.startLineNumber, layout.endLineNumber);
      decorations.sort((a, b) => (a.options.zIndex || 0) - (b.options.zIndex || 0));
      const { canvasInnerWidth, canvasInnerHeight } = this._model.options;
      const minimapLineHeight = this._model.options.minimapLineHeight;
      const minimapCharWidth = this._model.options.minimapCharWidth;
      const tabSize = this._model.getOptions().tabSize;
      const canvasContext = this._decorationsCanvas.domNode.getContext("2d");
      canvasContext.clearRect(0, 0, canvasInnerWidth, canvasInnerHeight);
      const highlightedLines = new ContiguousLineMap(layout.startLineNumber, layout.endLineNumber, false);
      this._renderSelectionLineHighlights(canvasContext, selections, highlightedLines, layout, minimapLineHeight);
      this._renderDecorationsLineHighlights(canvasContext, decorations, highlightedLines, layout, minimapLineHeight);
      const lineOffsetMap = new ContiguousLineMap(layout.startLineNumber, layout.endLineNumber, null);
      this._renderSelectionsHighlights(canvasContext, selections, lineOffsetMap, layout, minimapLineHeight, tabSize, minimapCharWidth, canvasInnerWidth);
      this._renderDecorationsHighlights(canvasContext, decorations, lineOffsetMap, layout, minimapLineHeight, tabSize, minimapCharWidth, canvasInnerWidth);
      this._renderSectionHeaders(layout);
    }
  }
  _renderSelectionLineHighlights(canvasContext, selections, highlightedLines, layout, minimapLineHeight) {
    if (!this._selectionColor || this._selectionColor.isTransparent()) {
      return;
    }
    canvasContext.fillStyle = this._selectionColor.transparent(0.5).toString();
    let y1 = 0;
    let y2 = 0;
    for (const selection of selections) {
      const intersection = layout.intersectWithViewport(selection);
      if (!intersection) {
        continue;
      }
      const [startLineNumber, endLineNumber] = intersection;
      for (let line = startLineNumber; line <= endLineNumber; line++) {
        highlightedLines.set(line, true);
      }
      const yy1 = layout.getYForLineNumber(startLineNumber, minimapLineHeight);
      const yy2 = layout.getYForLineNumber(endLineNumber, minimapLineHeight);
      if (y2 >= yy1) {
        y2 = yy2;
      } else {
        if (y2 > y1) {
          canvasContext.fillRect(MINIMAP_GUTTER_WIDTH, y1, canvasContext.canvas.width, y2 - y1);
        }
        y1 = yy1;
        y2 = yy2;
      }
    }
    if (y2 > y1) {
      canvasContext.fillRect(MINIMAP_GUTTER_WIDTH, y1, canvasContext.canvas.width, y2 - y1);
    }
  }
  _renderDecorationsLineHighlights(canvasContext, decorations, highlightedLines, layout, minimapLineHeight) {
    const highlightColors = /* @__PURE__ */ new Map();
    for (let i = decorations.length - 1; i >= 0; i--) {
      const decoration = decorations[i];
      const minimapOptions = decoration.options.minimap;
      if (!minimapOptions || minimapOptions.position !== MinimapPosition.Inline) {
        continue;
      }
      const intersection = layout.intersectWithViewport(decoration.range);
      if (!intersection) {
        continue;
      }
      const [startLineNumber, endLineNumber] = intersection;
      const decorationColor = minimapOptions.getColor(this._theme.value);
      if (!decorationColor || decorationColor.isTransparent()) {
        continue;
      }
      let highlightColor = highlightColors.get(decorationColor.toString());
      if (!highlightColor) {
        highlightColor = decorationColor.transparent(0.5).toString();
        highlightColors.set(decorationColor.toString(), highlightColor);
      }
      canvasContext.fillStyle = highlightColor;
      for (let line = startLineNumber; line <= endLineNumber; line++) {
        if (highlightedLines.has(line)) {
          continue;
        }
        highlightedLines.set(line, true);
        const y = layout.getYForLineNumber(line, minimapLineHeight);
        canvasContext.fillRect(MINIMAP_GUTTER_WIDTH, y, canvasContext.canvas.width, minimapLineHeight);
      }
    }
  }
  _renderSelectionsHighlights(canvasContext, selections, lineOffsetMap, layout, lineHeight, tabSize, characterWidth, canvasInnerWidth) {
    if (!this._selectionColor || this._selectionColor.isTransparent()) {
      return;
    }
    for (const selection of selections) {
      const intersection = layout.intersectWithViewport(selection);
      if (!intersection) {
        continue;
      }
      const [startLineNumber, endLineNumber] = intersection;
      for (let line = startLineNumber; line <= endLineNumber; line++) {
        this.renderDecorationOnLine(canvasContext, lineOffsetMap, selection, this._selectionColor, layout, line, lineHeight, lineHeight, tabSize, characterWidth, canvasInnerWidth);
      }
    }
  }
  _renderDecorationsHighlights(canvasContext, decorations, lineOffsetMap, layout, minimapLineHeight, tabSize, characterWidth, canvasInnerWidth) {
    for (const decoration of decorations) {
      const minimapOptions = decoration.options.minimap;
      if (!minimapOptions) {
        continue;
      }
      const intersection = layout.intersectWithViewport(decoration.range);
      if (!intersection) {
        continue;
      }
      const [startLineNumber, endLineNumber] = intersection;
      const decorationColor = minimapOptions.getColor(this._theme.value);
      if (!decorationColor || decorationColor.isTransparent()) {
        continue;
      }
      for (let line = startLineNumber; line <= endLineNumber; line++) {
        switch (minimapOptions.position) {
          case MinimapPosition.Inline:
            this.renderDecorationOnLine(canvasContext, lineOffsetMap, decoration.range, decorationColor, layout, line, minimapLineHeight, minimapLineHeight, tabSize, characterWidth, canvasInnerWidth);
            continue;
          case MinimapPosition.Gutter: {
            const y = layout.getYForLineNumber(line, minimapLineHeight);
            const x = 2;
            this.renderDecoration(canvasContext, decorationColor, x, y, GUTTER_DECORATION_WIDTH, minimapLineHeight);
            continue;
          }
        }
      }
    }
  }
  renderDecorationOnLine(canvasContext, lineOffsetMap, decorationRange, decorationColor, layout, lineNumber, height, minimapLineHeight, tabSize, charWidth, canvasInnerWidth) {
    const y = layout.getYForLineNumber(lineNumber, minimapLineHeight);
    if (y + height < 0 || y > this._model.options.canvasInnerHeight) {
      return;
    }
    const { startLineNumber, endLineNumber } = decorationRange;
    const startColumn = startLineNumber === lineNumber ? decorationRange.startColumn : 1;
    const endColumn = endLineNumber === lineNumber ? decorationRange.endColumn : this._model.getLineMaxColumn(lineNumber);
    const x1 = this.getXOffsetForPosition(lineOffsetMap, lineNumber, startColumn, tabSize, charWidth, canvasInnerWidth);
    const x2 = this.getXOffsetForPosition(lineOffsetMap, lineNumber, endColumn, tabSize, charWidth, canvasInnerWidth);
    this.renderDecoration(canvasContext, decorationColor, x1, y, x2 - x1, height);
  }
  getXOffsetForPosition(lineOffsetMap, lineNumber, column, tabSize, charWidth, canvasInnerWidth) {
    if (column === 1) {
      return MINIMAP_GUTTER_WIDTH;
    }
    const minimumXOffset = (column - 1) * charWidth;
    if (minimumXOffset >= canvasInnerWidth) {
      return canvasInnerWidth;
    }
    let lineIndexToXOffset = lineOffsetMap.get(lineNumber);
    if (!lineIndexToXOffset) {
      const lineData = this._model.getLineContent(lineNumber);
      lineIndexToXOffset = [MINIMAP_GUTTER_WIDTH];
      let prevx = MINIMAP_GUTTER_WIDTH;
      for (let i = 1; i < lineData.length + 1; i++) {
        const charCode = lineData.charCodeAt(i - 1);
        const dx = charCode === CharCode.Tab ? tabSize * charWidth : strings.isFullWidthCharacter(charCode) ? 2 * charWidth : charWidth;
        const x = prevx + dx;
        if (x >= canvasInnerWidth) {
          lineIndexToXOffset[i] = canvasInnerWidth;
          break;
        }
        lineIndexToXOffset[i] = x;
        prevx = x;
      }
      lineOffsetMap.set(lineNumber, lineIndexToXOffset);
    }
    if (column - 1 < lineIndexToXOffset.length) {
      return lineIndexToXOffset[column - 1];
    }
    return canvasInnerWidth;
  }
  renderDecoration(canvasContext, decorationColor, x, y, width, height) {
    canvasContext.fillStyle = decorationColor && decorationColor.toString() || "";
    canvasContext.fillRect(x, y, width, height);
  }
  _renderSectionHeaders(layout) {
    const minimapLineHeight = this._model.options.minimapLineHeight;
    const sectionHeaderFontSize = this._model.options.sectionHeaderFontSize;
    const sectionHeaderLetterSpacing = this._model.options.sectionHeaderLetterSpacing;
    const backgroundFillHeight = sectionHeaderFontSize * 1.5;
    const { canvasInnerWidth } = this._model.options;
    const backgroundColor = this._model.options.backgroundColor;
    const backgroundFill = `rgb(${backgroundColor.r} ${backgroundColor.g} ${backgroundColor.b} / .7)`;
    const foregroundColor = this._model.options.sectionHeaderFontColor;
    const foregroundFill = `rgb(${foregroundColor.r} ${foregroundColor.g} ${foregroundColor.b})`;
    const separatorStroke = foregroundFill;
    const canvasContext = this._decorationsCanvas.domNode.getContext("2d");
    canvasContext.letterSpacing = sectionHeaderLetterSpacing + "px";
    canvasContext.font = "500 " + sectionHeaderFontSize + "px " + this._model.options.sectionHeaderFontFamily;
    canvasContext.strokeStyle = separatorStroke;
    canvasContext.lineWidth = 0.4;
    const decorations = this._model.getSectionHeaderDecorationsInViewport(layout.startLineNumber, layout.endLineNumber);
    decorations.sort((a, b) => a.range.startLineNumber - b.range.startLineNumber);
    const fitWidth = InnerMinimap._fitSectionHeader.bind(
      null,
      canvasContext,
      canvasInnerWidth - MINIMAP_GUTTER_WIDTH
    );
    for (const decoration of decorations) {
      const y = layout.getYForLineNumber(decoration.range.startLineNumber, minimapLineHeight) + sectionHeaderFontSize;
      const backgroundFillY = y - sectionHeaderFontSize;
      const separatorY = backgroundFillY + 2;
      const headerText = this._model.getSectionHeaderText(decoration, fitWidth);
      InnerMinimap._renderSectionLabel(
        canvasContext,
        headerText,
        decoration.options.minimap?.sectionHeaderStyle === MinimapSectionHeaderStyle.Underlined,
        backgroundFill,
        foregroundFill,
        canvasInnerWidth,
        backgroundFillY,
        backgroundFillHeight,
        y,
        separatorY
      );
    }
  }
  static _fitSectionHeader(target, maxWidth, headerText) {
    if (!headerText) {
      return headerText;
    }
    const ellipsis = "\u2026";
    const width = target.measureText(headerText).width;
    const ellipsisWidth = target.measureText(ellipsis).width;
    if (width <= maxWidth || width <= ellipsisWidth) {
      return headerText;
    }
    const len = headerText.length;
    const averageCharWidth = width / headerText.length;
    const maxCharCount = Math.floor((maxWidth - ellipsisWidth) / averageCharWidth) - 1;
    let halfCharCount = Math.ceil(maxCharCount / 2);
    while (halfCharCount > 0 && /\s/.test(headerText[halfCharCount - 1])) {
      --halfCharCount;
    }
    return headerText.substring(0, halfCharCount) + ellipsis + headerText.substring(len - (maxCharCount - halfCharCount));
  }
  static _renderSectionLabel(target, headerText, hasSeparatorLine, backgroundFill, foregroundFill, minimapWidth, backgroundFillY, backgroundFillHeight, textY, separatorY) {
    if (headerText) {
      target.fillStyle = backgroundFill;
      target.fillRect(0, backgroundFillY, minimapWidth, backgroundFillHeight);
      target.fillStyle = foregroundFill;
      target.fillText(headerText, MINIMAP_GUTTER_WIDTH, textY);
    }
    if (hasSeparatorLine) {
      target.beginPath();
      target.moveTo(0, separatorY);
      target.lineTo(minimapWidth, separatorY);
      target.closePath();
      target.stroke();
    }
  }
  renderLines(layout) {
    const startLineNumber = layout.startLineNumber;
    const endLineNumber = layout.endLineNumber;
    const minimapLineHeight = this._model.options.minimapLineHeight;
    if (this._lastRenderData && this._lastRenderData.linesEquals(layout)) {
      const _lastData = this._lastRenderData._get();
      return new RenderData(layout, _lastData.imageData, _lastData.lines);
    }
    const imageData = this._getBuffer();
    if (!imageData) {
      return null;
    }
    const [_dirtyY1, _dirtyY2, needed] = InnerMinimap._renderUntouchedLines(
      imageData,
      layout.topPaddingLineCount,
      startLineNumber,
      endLineNumber,
      minimapLineHeight,
      this._lastRenderData
    );
    const lineInfo = this._model.getMinimapLinesRenderingData(startLineNumber, endLineNumber, needed);
    const tabSize = this._model.getOptions().tabSize;
    const defaultBackground = this._model.options.defaultBackgroundColor;
    const background = this._model.options.backgroundColor;
    const foregroundAlpha = this._model.options.foregroundAlpha;
    const tokensColorTracker = this._model.tokensColorTracker;
    const useLighterFont = tokensColorTracker.backgroundIsLight();
    const renderMinimap = this._model.options.renderMinimap;
    const charRenderer = this._model.options.charRenderer();
    const fontScale = this._model.options.fontScale;
    const minimapCharWidth = this._model.options.minimapCharWidth;
    const baseCharHeight = renderMinimap === RenderMinimap.Text ? Constants.BASE_CHAR_HEIGHT : Constants.BASE_CHAR_HEIGHT + 1;
    const renderMinimapLineHeight = baseCharHeight * fontScale;
    const innerLinePadding = minimapLineHeight > renderMinimapLineHeight ? Math.floor((minimapLineHeight - renderMinimapLineHeight) / 2) : 0;
    const backgroundA = background.a / 255;
    const renderBackground = new RGBA8(
      Math.round((background.r - defaultBackground.r) * backgroundA + defaultBackground.r),
      Math.round((background.g - defaultBackground.g) * backgroundA + defaultBackground.g),
      Math.round((background.b - defaultBackground.b) * backgroundA + defaultBackground.b),
      255
    );
    let dy = layout.topPaddingLineCount * minimapLineHeight;
    const renderedLines = [];
    for (let lineIndex = 0, lineCount = endLineNumber - startLineNumber + 1; lineIndex < lineCount; lineIndex++) {
      if (needed[lineIndex]) {
        InnerMinimap._renderLine(
          imageData,
          renderBackground,
          background.a,
          useLighterFont,
          renderMinimap,
          minimapCharWidth,
          tokensColorTracker,
          foregroundAlpha,
          charRenderer,
          dy,
          innerLinePadding,
          tabSize,
          lineInfo[lineIndex],
          fontScale,
          minimapLineHeight
        );
      }
      renderedLines[lineIndex] = new MinimapLine(dy);
      dy += minimapLineHeight;
    }
    const dirtyY1 = _dirtyY1 === -1 ? 0 : _dirtyY1;
    const dirtyY2 = _dirtyY2 === -1 ? imageData.height : _dirtyY2;
    const dirtyHeight = dirtyY2 - dirtyY1;
    const ctx = this._canvas.domNode.getContext("2d");
    ctx.putImageData(imageData, 0, 0, 0, dirtyY1, imageData.width, dirtyHeight);
    return new RenderData(
      layout,
      imageData,
      renderedLines
    );
  }
  static _renderUntouchedLines(target, topPaddingLineCount, startLineNumber, endLineNumber, minimapLineHeight, lastRenderData) {
    const needed = [];
    if (!lastRenderData) {
      for (let i = 0, len = endLineNumber - startLineNumber + 1; i < len; i++) {
        needed[i] = true;
      }
      return [-1, -1, needed];
    }
    const _lastData = lastRenderData._get();
    const lastTargetData = _lastData.imageData.data;
    const lastStartLineNumber = _lastData.rendLineNumberStart;
    const lastLines = _lastData.lines;
    const lastLinesLength = lastLines.length;
    const WIDTH = target.width;
    const targetData = target.data;
    const maxDestPixel = (endLineNumber - startLineNumber + 1) * minimapLineHeight * WIDTH * 4;
    let dirtyPixel1 = -1;
    let dirtyPixel2 = -1;
    let copySourceStart = -1;
    let copySourceEnd = -1;
    let copyDestStart = -1;
    let copyDestEnd = -1;
    let dest_dy = topPaddingLineCount * minimapLineHeight;
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      const lineIndex = lineNumber - startLineNumber;
      const lastLineIndex = lineNumber - lastStartLineNumber;
      const source_dy = lastLineIndex >= 0 && lastLineIndex < lastLinesLength ? lastLines[lastLineIndex].dy : -1;
      if (source_dy === -1) {
        needed[lineIndex] = true;
        dest_dy += minimapLineHeight;
        continue;
      }
      const sourceStart = source_dy * WIDTH * 4;
      const sourceEnd = (source_dy + minimapLineHeight) * WIDTH * 4;
      const destStart = dest_dy * WIDTH * 4;
      const destEnd = (dest_dy + minimapLineHeight) * WIDTH * 4;
      if (copySourceEnd === sourceStart && copyDestEnd === destStart) {
        copySourceEnd = sourceEnd;
        copyDestEnd = destEnd;
      } else {
        if (copySourceStart !== -1) {
          targetData.set(lastTargetData.subarray(copySourceStart, copySourceEnd), copyDestStart);
          if (dirtyPixel1 === -1 && copySourceStart === 0 && copySourceStart === copyDestStart) {
            dirtyPixel1 = copySourceEnd;
          }
          if (dirtyPixel2 === -1 && copySourceEnd === maxDestPixel && copySourceStart === copyDestStart) {
            dirtyPixel2 = copySourceStart;
          }
        }
        copySourceStart = sourceStart;
        copySourceEnd = sourceEnd;
        copyDestStart = destStart;
        copyDestEnd = destEnd;
      }
      needed[lineIndex] = false;
      dest_dy += minimapLineHeight;
    }
    if (copySourceStart !== -1) {
      targetData.set(lastTargetData.subarray(copySourceStart, copySourceEnd), copyDestStart);
      if (dirtyPixel1 === -1 && copySourceStart === 0 && copySourceStart === copyDestStart) {
        dirtyPixel1 = copySourceEnd;
      }
      if (dirtyPixel2 === -1 && copySourceEnd === maxDestPixel && copySourceStart === copyDestStart) {
        dirtyPixel2 = copySourceStart;
      }
    }
    const dirtyY1 = dirtyPixel1 === -1 ? -1 : dirtyPixel1 / (WIDTH * 4);
    const dirtyY2 = dirtyPixel2 === -1 ? -1 : dirtyPixel2 / (WIDTH * 4);
    return [dirtyY1, dirtyY2, needed];
  }
  static _renderLine(target, backgroundColor, backgroundAlpha, useLighterFont, renderMinimap, charWidth, colorTracker, foregroundAlpha, minimapCharRenderer, dy, innerLinePadding, tabSize, lineData, fontScale, minimapLineHeight) {
    const content = lineData.content;
    const tokens = lineData.tokens;
    const maxDx = target.width - charWidth;
    const force1pxHeight = minimapLineHeight === 1;
    let dx = MINIMAP_GUTTER_WIDTH;
    let charIndex = 0;
    let tabsCharDelta = 0;
    for (let tokenIndex = 0, tokensLen = tokens.getCount(); tokenIndex < tokensLen; tokenIndex++) {
      const tokenEndIndex = tokens.getEndOffset(tokenIndex);
      const tokenColorId = tokens.getForeground(tokenIndex);
      const tokenColor = colorTracker.getColor(tokenColorId);
      for (; charIndex < tokenEndIndex; charIndex++) {
        if (dx > maxDx) {
          return;
        }
        const charCode = content.charCodeAt(charIndex);
        if (charCode === CharCode.Tab) {
          const insertSpacesCount = tabSize - (charIndex + tabsCharDelta) % tabSize;
          tabsCharDelta += insertSpacesCount - 1;
          dx += insertSpacesCount * charWidth;
        } else if (charCode === CharCode.Space) {
          dx += charWidth;
        } else {
          const count = strings.isFullWidthCharacter(charCode) ? 2 : 1;
          for (let i = 0; i < count; i++) {
            if (renderMinimap === RenderMinimap.Blocks) {
              minimapCharRenderer.blockRenderChar(target, dx, dy + innerLinePadding, tokenColor, foregroundAlpha, backgroundColor, backgroundAlpha, force1pxHeight);
            } else {
              minimapCharRenderer.renderChar(target, dx, dy + innerLinePadding, charCode, tokenColor, foregroundAlpha, backgroundColor, backgroundAlpha, fontScale, useLighterFont, force1pxHeight);
            }
            dx += charWidth;
            if (dx > maxDx) {
              return;
            }
          }
        }
      }
    }
  }
}
class ContiguousLineMap {
  constructor(startLineNumber, endLineNumber, defaultValue) {
    this._startLineNumber = startLineNumber;
    this._endLineNumber = endLineNumber;
    this._defaultValue = defaultValue;
    this._values = [];
    for (let i = 0, count = this._endLineNumber - this._startLineNumber + 1; i < count; i++) {
      this._values[i] = defaultValue;
    }
  }
  has(lineNumber) {
    return this.get(lineNumber) !== this._defaultValue;
  }
  set(lineNumber, value) {
    if (lineNumber < this._startLineNumber || lineNumber > this._endLineNumber) {
      return;
    }
    this._values[lineNumber - this._startLineNumber] = value;
  }
  get(lineNumber) {
    if (lineNumber < this._startLineNumber || lineNumber > this._endLineNumber) {
      return this._defaultValue;
    }
    return this._values[lineNumber - this._startLineNumber];
  }
}
export {
  Minimap
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3ZpZXdQYXJ0cy9taW5pbWFwL21pbmltYXAudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWluaW1hcC5jc3MnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRmFzdERvbU5vZGUsIGNyZWF0ZUZhc3REb21Ob2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Zhc3REb21Ob2RlLmpzJztcbmltcG9ydCB7IEdsb2JhbFBvaW50ZXJNb3ZlTW9uaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9nbG9iYWxQb2ludGVyTW92ZU1vbml0b3IuanMnO1xuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSUxpbmUsIFJlbmRlcmVkTGluZXNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vdmlldy92aWV3TGF5ZXIuanMnO1xuaW1wb3J0IHsgUGFydEZpbmdlcnByaW50LCBQYXJ0RmluZ2VycHJpbnRzLCBWaWV3UGFydCB9IGZyb20gJy4uLy4uL3ZpZXcvdmlld1BhcnQuanMnO1xuaW1wb3J0IHsgUmVuZGVyTWluaW1hcCwgRWRpdG9yT3B0aW9uLCBNSU5JTUFQX0dVVFRFUl9XSURUSCwgRWRpdG9yTGF5b3V0SW5mb0NvbXB1dGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgUkdCQTggfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9taXNjL3JnYmEuanMnO1xuaW1wb3J0IHsgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29sb3JJZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IE1pbmltYXBDaGFyUmVuZGVyZXIgfSBmcm9tICcuL21pbmltYXBDaGFyUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQ29uc3RhbnRzIH0gZnJvbSAnLi9taW5pbWFwQ2hhclNoZWV0LmpzJztcbmltcG9ydCB7IE1pbmltYXBUb2tlbnNDb2xvclRyYWNrZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL21pbmltYXBUb2tlbnNDb2xvclRyYWNrZXIuanMnO1xuaW1wb3J0IHsgUmVuZGVyaW5nQ29udGV4dCwgUmVzdHJpY3RlZFJlbmRlcmluZ0NvbnRleHQgfSBmcm9tICcuLi8uLi92aWV3L3JlbmRlcmluZ0NvbnRleHQuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdDb250ZXh0LmpzJztcbmltcG9ydCB7IEVkaXRvclRoZW1lIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvclRoZW1lLmpzJztcbmltcG9ydCAqIGFzIHZpZXdFdmVudHMgZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdFdmVudHMuanMnO1xuaW1wb3J0IHsgVmlld0xpbmVEYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBtaW5pbWFwU2VsZWN0aW9uLCBtaW5pbWFwQmFja2dyb3VuZCwgbWluaW1hcEZvcmVncm91bmRPcGFjaXR5LCBlZGl0b3JGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTW9kZWxEZWNvcmF0aW9uTWluaW1hcE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IEdlc3R1cmVFdmVudCwgRXZlbnRUeXBlLCBHZXN0dXJlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IE1pbmltYXBDaGFyUmVuZGVyZXJGYWN0b3J5IH0gZnJvbSAnLi9taW5pbWFwQ2hhclJlbmRlcmVyRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBNaW5pbWFwUG9zaXRpb24sIE1pbmltYXBTZWN0aW9uSGVhZGVyU3R5bGUsIFRleHRNb2RlbFJlc29sdmVkT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9mdW5jdGlvbmFsLmpzJztcbmltcG9ydCB7IExSVUNhY2hlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IERFRkFVTFRfRk9OVF9GQU1JTFkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZm9udHMuanMnO1xuaW1wb3J0IHsgVmlld01vZGVsRGVjb3JhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvdmlld01vZGVsRGVjb3JhdGlvbi5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuXG4vKipcbiAqIFRoZSBvcnRob2dvbmFsIGRpc3RhbmNlIHRvIHRoZSBzbGlkZXIgYXQgd2hpY2ggZHJhZ2dpbmcgXCJyZXNldHNcIi4gVGhpcyBpbXBsZW1lbnRzIFwic25hcHBpbmdcIlxuICovXG5jb25zdCBQT0lOVEVSX0RSQUdfUkVTRVRfRElTVEFOQ0UgPSAxNDA7XG5cbmNvbnN0IEdVVFRFUl9ERUNPUkFUSU9OX1dJRFRIID0gMjtcblxuY2xhc3MgTWluaW1hcE9wdGlvbnMge1xuXG5cdHB1YmxpYyByZWFkb25seSByZW5kZXJNaW5pbWFwOiBSZW5kZXJNaW5pbWFwO1xuXHRwdWJsaWMgcmVhZG9ubHkgc2l6ZTogJ3Byb3BvcnRpb25hbCcgfCAnZmlsbCcgfCAnZml0Jztcblx0cHVibGljIHJlYWRvbmx5IG1pbmltYXBIZWlnaHRJc0VkaXRvckhlaWdodDogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IHNjcm9sbEJleW9uZExhc3RMaW5lOiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgcGFkZGluZ1RvcDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgcGFkZGluZ0JvdHRvbTogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgc2hvd1NsaWRlcjogJ2Fsd2F5cycgfCAnbW91c2VvdmVyJztcblx0cHVibGljIHJlYWRvbmx5IGF1dG9oaWRlOiAnbm9uZScgfCAnbW91c2VvdmVyJyB8ICdzY3JvbGwnO1xuXHRwdWJsaWMgcmVhZG9ubHkgcGl4ZWxSYXRpbzogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBsaW5lSGVpZ2h0OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBjb250YWluZXIgZG9tIG5vZGUgbGVmdCBwb3NpdGlvbiAoaW4gQ1NTIHB4KVxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IG1pbmltYXBMZWZ0OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBjb250YWluZXIgZG9tIG5vZGUgd2lkdGggKGluIENTUyBweClcblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBtaW5pbWFwV2lkdGg6IG51bWJlcjtcblx0LyoqXG5cdCAqIGNvbnRhaW5lciBkb20gbm9kZSBoZWlnaHQgKGluIENTUyBweClcblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBtaW5pbWFwSGVpZ2h0OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBjYW52YXMgYmFja2luZyBzdG9yZSB3aWR0aCAoaW4gZGV2aWNlIHB4KVxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IGNhbnZhc0lubmVyV2lkdGg6IG51bWJlcjtcblx0LyoqXG5cdCAqIGNhbnZhcyBiYWNraW5nIHN0b3JlIGhlaWdodCAoaW4gZGV2aWNlIHB4KVxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IGNhbnZhc0lubmVySGVpZ2h0OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBjYW52YXMgd2lkdGggKGluIENTUyBweClcblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBjYW52YXNPdXRlcldpZHRoOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBjYW52YXMgaGVpZ2h0IChpbiBDU1MgcHgpXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgY2FudmFzT3V0ZXJIZWlnaHQ6IG51bWJlcjtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaXNTYW1wbGluZzogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IGVkaXRvckhlaWdodDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgZm9udFNjYWxlOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBtaW5pbWFwTGluZUhlaWdodDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgbWluaW1hcENoYXJXaWR0aDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgc2VjdGlvbkhlYWRlckZvbnRGYW1pbHk6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IHNlY3Rpb25IZWFkZXJGb250U2l6ZTogbnVtYmVyO1xuXHQvKipcblx0ICogU3BhY2UgaW4gYmV0d2VlbiB0aGUgY2hhcmFjdGVycyBvZiB0aGUgc2VjdGlvbiBoZWFkZXIgKGluIENTUyBweClcblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBzZWN0aW9uSGVhZGVyTGV0dGVyU3BhY2luZzogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgc2VjdGlvbkhlYWRlckZvbnRDb2xvcjogUkdCQTg7XG5cblx0cHVibGljIHJlYWRvbmx5IGNoYXJSZW5kZXJlcjogKCkgPT4gTWluaW1hcENoYXJSZW5kZXJlcjtcblx0cHVibGljIHJlYWRvbmx5IGRlZmF1bHRCYWNrZ3JvdW5kQ29sb3I6IFJHQkE4O1xuXHRwdWJsaWMgcmVhZG9ubHkgYmFja2dyb3VuZENvbG9yOiBSR0JBODtcblx0LyoqXG5cdCAqIGZvcmVncm91bmQgYWxwaGE6IGludGVnZXIgaW4gWzAtMjU1XVxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IGZvcmVncm91bmRBbHBoYTogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKGNvbmZpZ3VyYXRpb246IElFZGl0b3JDb25maWd1cmF0aW9uLCB0aGVtZTogRWRpdG9yVGhlbWUsIHRva2Vuc0NvbG9yVHJhY2tlcjogTWluaW1hcFRva2Vuc0NvbG9yVHJhY2tlcikge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBjb25maWd1cmF0aW9uLm9wdGlvbnM7XG5cdFx0Y29uc3QgcGl4ZWxSYXRpbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5waXhlbFJhdGlvKTtcblx0XHRjb25zdCBsYXlvdXRJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pO1xuXHRcdGNvbnN0IG1pbmltYXBMYXlvdXQgPSBsYXlvdXRJbmZvLm1pbmltYXA7XG5cdFx0Y29uc3QgZm9udEluZm8gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRcdGNvbnN0IG1pbmltYXBPcHRzID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLm1pbmltYXApO1xuXG5cdFx0dGhpcy5yZW5kZXJNaW5pbWFwID0gbWluaW1hcExheW91dC5yZW5kZXJNaW5pbWFwO1xuXHRcdHRoaXMuc2l6ZSA9IG1pbmltYXBPcHRzLnNpemU7XG5cdFx0dGhpcy5taW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQgPSBtaW5pbWFwTGF5b3V0Lm1pbmltYXBIZWlnaHRJc0VkaXRvckhlaWdodDtcblx0XHR0aGlzLnNjcm9sbEJleW9uZExhc3RMaW5lID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnNjcm9sbEJleW9uZExhc3RMaW5lKTtcblx0XHR0aGlzLnBhZGRpbmdUb3AgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ucGFkZGluZykudG9wO1xuXHRcdHRoaXMucGFkZGluZ0JvdHRvbSA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5wYWRkaW5nKS5ib3R0b207XG5cdFx0dGhpcy5zaG93U2xpZGVyID0gbWluaW1hcE9wdHMuc2hvd1NsaWRlcjtcblx0XHR0aGlzLmF1dG9oaWRlID0gbWluaW1hcE9wdHMuYXV0b2hpZGU7XG5cdFx0dGhpcy5waXhlbFJhdGlvID0gcGl4ZWxSYXRpbztcblx0XHR0aGlzLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCA9IGZvbnRJbmZvLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDtcblx0XHR0aGlzLmxpbmVIZWlnaHQgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0dGhpcy5taW5pbWFwTGVmdCA9IG1pbmltYXBMYXlvdXQubWluaW1hcExlZnQ7XG5cdFx0dGhpcy5taW5pbWFwV2lkdGggPSBtaW5pbWFwTGF5b3V0Lm1pbmltYXBXaWR0aDtcblx0XHR0aGlzLm1pbmltYXBIZWlnaHQgPSBsYXlvdXRJbmZvLmhlaWdodDtcblxuXHRcdHRoaXMuY2FudmFzSW5uZXJXaWR0aCA9IG1pbmltYXBMYXlvdXQubWluaW1hcENhbnZhc0lubmVyV2lkdGg7XG5cdFx0dGhpcy5jYW52YXNJbm5lckhlaWdodCA9IG1pbmltYXBMYXlvdXQubWluaW1hcENhbnZhc0lubmVySGVpZ2h0O1xuXHRcdHRoaXMuY2FudmFzT3V0ZXJXaWR0aCA9IG1pbmltYXBMYXlvdXQubWluaW1hcENhbnZhc091dGVyV2lkdGg7XG5cdFx0dGhpcy5jYW52YXNPdXRlckhlaWdodCA9IG1pbmltYXBMYXlvdXQubWluaW1hcENhbnZhc091dGVySGVpZ2h0O1xuXG5cdFx0dGhpcy5pc1NhbXBsaW5nID0gbWluaW1hcExheW91dC5taW5pbWFwSXNTYW1wbGluZztcblx0XHR0aGlzLmVkaXRvckhlaWdodCA9IGxheW91dEluZm8uaGVpZ2h0O1xuXHRcdHRoaXMuZm9udFNjYWxlID0gbWluaW1hcExheW91dC5taW5pbWFwU2NhbGU7XG5cdFx0dGhpcy5taW5pbWFwTGluZUhlaWdodCA9IG1pbmltYXBMYXlvdXQubWluaW1hcExpbmVIZWlnaHQ7XG5cdFx0dGhpcy5taW5pbWFwQ2hhcldpZHRoID0gQ29uc3RhbnRzLkJBU0VfQ0hBUl9XSURUSCAqIHRoaXMuZm9udFNjYWxlO1xuXHRcdHRoaXMuc2VjdGlvbkhlYWRlckZvbnRGYW1pbHkgPSBERUZBVUxUX0ZPTlRfRkFNSUxZO1xuXHRcdHRoaXMuc2VjdGlvbkhlYWRlckZvbnRTaXplID0gbWluaW1hcE9wdHMuc2VjdGlvbkhlYWRlckZvbnRTaXplICogcGl4ZWxSYXRpbztcblx0XHR0aGlzLnNlY3Rpb25IZWFkZXJMZXR0ZXJTcGFjaW5nID0gbWluaW1hcE9wdHMuc2VjdGlvbkhlYWRlckxldHRlclNwYWNpbmc7IC8vIGludGVudGlvbmFsbHkgbm90IG11bHRpcGx5aW5nIGJ5IHBpeGVsUmF0aW9cblx0XHR0aGlzLnNlY3Rpb25IZWFkZXJGb250Q29sb3IgPSBNaW5pbWFwT3B0aW9ucy5fZ2V0U2VjdGlvbkhlYWRlckNvbG9yKHRoZW1lLCB0b2tlbnNDb2xvclRyYWNrZXIuZ2V0Q29sb3IoQ29sb3JJZC5EZWZhdWx0Rm9yZWdyb3VuZCkpO1xuXG5cdFx0dGhpcy5jaGFyUmVuZGVyZXIgPSBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24oKCkgPT4gTWluaW1hcENoYXJSZW5kZXJlckZhY3RvcnkuY3JlYXRlKHRoaXMuZm9udFNjYWxlLCBmb250SW5mby5mb250RmFtaWx5KSk7XG5cdFx0dGhpcy5kZWZhdWx0QmFja2dyb3VuZENvbG9yID0gdG9rZW5zQ29sb3JUcmFja2VyLmdldENvbG9yKENvbG9ySWQuRGVmYXVsdEJhY2tncm91bmQpO1xuXHRcdHRoaXMuYmFja2dyb3VuZENvbG9yID0gTWluaW1hcE9wdGlvbnMuX2dldE1pbmltYXBCYWNrZ3JvdW5kKHRoZW1lLCB0aGlzLmRlZmF1bHRCYWNrZ3JvdW5kQ29sb3IpO1xuXHRcdHRoaXMuZm9yZWdyb3VuZEFscGhhID0gTWluaW1hcE9wdGlvbnMuX2dldE1pbmltYXBGb3JlZ3JvdW5kT3BhY2l0eSh0aGVtZSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZ2V0TWluaW1hcEJhY2tncm91bmQodGhlbWU6IEVkaXRvclRoZW1lLCBkZWZhdWx0QmFja2dyb3VuZENvbG9yOiBSR0JBOCk6IFJHQkE4IHtcblx0XHRjb25zdCB0aGVtZUNvbG9yID0gdGhlbWUuZ2V0Q29sb3IobWluaW1hcEJhY2tncm91bmQpO1xuXHRcdGlmICh0aGVtZUNvbG9yKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFJHQkE4KHRoZW1lQ29sb3IucmdiYS5yLCB0aGVtZUNvbG9yLnJnYmEuZywgdGhlbWVDb2xvci5yZ2JhLmIsIE1hdGgucm91bmQoMjU1ICogdGhlbWVDb2xvci5yZ2JhLmEpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGRlZmF1bHRCYWNrZ3JvdW5kQ29sb3I7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZ2V0TWluaW1hcEZvcmVncm91bmRPcGFjaXR5KHRoZW1lOiBFZGl0b3JUaGVtZSk6IG51bWJlciB7XG5cdFx0Y29uc3QgdGhlbWVDb2xvciA9IHRoZW1lLmdldENvbG9yKG1pbmltYXBGb3JlZ3JvdW5kT3BhY2l0eSk7XG5cdFx0aWYgKHRoZW1lQ29sb3IpIHtcblx0XHRcdHJldHVybiBSR0JBOC5fY2xhbXAoTWF0aC5yb3VuZCgyNTUgKiB0aGVtZUNvbG9yLnJnYmEuYSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gMjU1O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2dldFNlY3Rpb25IZWFkZXJDb2xvcih0aGVtZTogRWRpdG9yVGhlbWUsIGRlZmF1bHRGb3JlZ3JvdW5kQ29sb3I6IFJHQkE4KTogUkdCQTgge1xuXHRcdGNvbnN0IHRoZW1lQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JGb3JlZ3JvdW5kKTtcblx0XHRpZiAodGhlbWVDb2xvcikge1xuXHRcdFx0cmV0dXJuIG5ldyBSR0JBOCh0aGVtZUNvbG9yLnJnYmEuciwgdGhlbWVDb2xvci5yZ2JhLmcsIHRoZW1lQ29sb3IucmdiYS5iLCBNYXRoLnJvdW5kKDI1NSAqIHRoZW1lQ29sb3IucmdiYS5hKSk7XG5cdFx0fVxuXHRcdHJldHVybiBkZWZhdWx0Rm9yZWdyb3VuZENvbG9yO1xuXHR9XG5cblx0cHVibGljIGVxdWFscyhvdGhlcjogTWluaW1hcE9wdGlvbnMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMucmVuZGVyTWluaW1hcCA9PT0gb3RoZXIucmVuZGVyTWluaW1hcFxuXHRcdFx0JiYgdGhpcy5zaXplID09PSBvdGhlci5zaXplXG5cdFx0XHQmJiB0aGlzLm1pbmltYXBIZWlnaHRJc0VkaXRvckhlaWdodCA9PT0gb3RoZXIubWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0XG5cdFx0XHQmJiB0aGlzLnNjcm9sbEJleW9uZExhc3RMaW5lID09PSBvdGhlci5zY3JvbGxCZXlvbmRMYXN0TGluZVxuXHRcdFx0JiYgdGhpcy5wYWRkaW5nVG9wID09PSBvdGhlci5wYWRkaW5nVG9wXG5cdFx0XHQmJiB0aGlzLnBhZGRpbmdCb3R0b20gPT09IG90aGVyLnBhZGRpbmdCb3R0b21cblx0XHRcdCYmIHRoaXMuc2hvd1NsaWRlciA9PT0gb3RoZXIuc2hvd1NsaWRlclxuXHRcdFx0JiYgdGhpcy5hdXRvaGlkZSA9PT0gb3RoZXIuYXV0b2hpZGVcblx0XHRcdCYmIHRoaXMucGl4ZWxSYXRpbyA9PT0gb3RoZXIucGl4ZWxSYXRpb1xuXHRcdFx0JiYgdGhpcy50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGggPT09IG90aGVyLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aFxuXHRcdFx0JiYgdGhpcy5saW5lSGVpZ2h0ID09PSBvdGhlci5saW5lSGVpZ2h0XG5cdFx0XHQmJiB0aGlzLm1pbmltYXBMZWZ0ID09PSBvdGhlci5taW5pbWFwTGVmdFxuXHRcdFx0JiYgdGhpcy5taW5pbWFwV2lkdGggPT09IG90aGVyLm1pbmltYXBXaWR0aFxuXHRcdFx0JiYgdGhpcy5taW5pbWFwSGVpZ2h0ID09PSBvdGhlci5taW5pbWFwSGVpZ2h0XG5cdFx0XHQmJiB0aGlzLmNhbnZhc0lubmVyV2lkdGggPT09IG90aGVyLmNhbnZhc0lubmVyV2lkdGhcblx0XHRcdCYmIHRoaXMuY2FudmFzSW5uZXJIZWlnaHQgPT09IG90aGVyLmNhbnZhc0lubmVySGVpZ2h0XG5cdFx0XHQmJiB0aGlzLmNhbnZhc091dGVyV2lkdGggPT09IG90aGVyLmNhbnZhc091dGVyV2lkdGhcblx0XHRcdCYmIHRoaXMuY2FudmFzT3V0ZXJIZWlnaHQgPT09IG90aGVyLmNhbnZhc091dGVySGVpZ2h0XG5cdFx0XHQmJiB0aGlzLmlzU2FtcGxpbmcgPT09IG90aGVyLmlzU2FtcGxpbmdcblx0XHRcdCYmIHRoaXMuZWRpdG9ySGVpZ2h0ID09PSBvdGhlci5lZGl0b3JIZWlnaHRcblx0XHRcdCYmIHRoaXMuZm9udFNjYWxlID09PSBvdGhlci5mb250U2NhbGVcblx0XHRcdCYmIHRoaXMubWluaW1hcExpbmVIZWlnaHQgPT09IG90aGVyLm1pbmltYXBMaW5lSGVpZ2h0XG5cdFx0XHQmJiB0aGlzLm1pbmltYXBDaGFyV2lkdGggPT09IG90aGVyLm1pbmltYXBDaGFyV2lkdGhcblx0XHRcdCYmIHRoaXMuc2VjdGlvbkhlYWRlckZvbnRTaXplID09PSBvdGhlci5zZWN0aW9uSGVhZGVyRm9udFNpemVcblx0XHRcdCYmIHRoaXMuc2VjdGlvbkhlYWRlckxldHRlclNwYWNpbmcgPT09IG90aGVyLnNlY3Rpb25IZWFkZXJMZXR0ZXJTcGFjaW5nXG5cdFx0XHQmJiB0aGlzLmRlZmF1bHRCYWNrZ3JvdW5kQ29sb3IgJiYgdGhpcy5kZWZhdWx0QmFja2dyb3VuZENvbG9yLmVxdWFscyhvdGhlci5kZWZhdWx0QmFja2dyb3VuZENvbG9yKVxuXHRcdFx0JiYgdGhpcy5iYWNrZ3JvdW5kQ29sb3IgJiYgdGhpcy5iYWNrZ3JvdW5kQ29sb3IuZXF1YWxzKG90aGVyLmJhY2tncm91bmRDb2xvcilcblx0XHRcdCYmIHRoaXMuZm9yZWdyb3VuZEFscGhhID09PSBvdGhlci5mb3JlZ3JvdW5kQWxwaGFcblx0XHQpO1xuXHR9XG59XG5cbmNsYXNzIE1pbmltYXBMYXlvdXQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdC8qKlxuXHRcdCAqIFRoZSBnaXZlbiBlZGl0b3Igc2Nyb2xsVG9wIChpbnB1dCkuXG5cdFx0ICovXG5cdFx0cHVibGljIHJlYWRvbmx5IHNjcm9sbFRvcDogbnVtYmVyLFxuXHRcdC8qKlxuXHRcdCAqIFRoZSBnaXZlbiBlZGl0b3Igc2Nyb2xsSGVpZ2h0IChpbnB1dCkuXG5cdFx0ICovXG5cdFx0cHVibGljIHJlYWRvbmx5IHNjcm9sbEhlaWdodDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBzbGlkZXJOZWVkZWQ6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29tcHV0ZWRTbGlkZXJSYXRpbzogbnVtYmVyLFxuXHRcdC8qKlxuXHRcdCAqIHNsaWRlciBkb20gbm9kZSB0b3AgKGluIENTUyBweClcblx0XHQgKi9cblx0XHRwdWJsaWMgcmVhZG9ubHkgc2xpZGVyVG9wOiBudW1iZXIsXG5cdFx0LyoqXG5cdFx0ICogc2xpZGVyIGRvbSBub2RlIGhlaWdodCAoaW4gQ1NTIHB4KVxuXHRcdCAqL1xuXHRcdHB1YmxpYyByZWFkb25seSBzbGlkZXJIZWlnaHQ6IG51bWJlcixcblx0XHQvKipcblx0XHQgKiBlbXB0eSBsaW5lcyB0byByZXNlcnZlIGF0IHRoZSB0b3Agb2YgdGhlIG1pbmltYXAuXG5cdFx0ICovXG5cdFx0cHVibGljIHJlYWRvbmx5IHRvcFBhZGRpbmdMaW5lQ291bnQ6IG51bWJlcixcblx0XHQvKipcblx0XHQgKiBtaW5pbWFwIHJlbmRlciBzdGFydCBsaW5lIG51bWJlci5cblx0XHQgKi9cblx0XHRwdWJsaWMgcmVhZG9ubHkgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0LyoqXG5cdFx0ICogbWluaW1hcCByZW5kZXIgZW5kIGxpbmUgbnVtYmVyLlxuXHRcdCAqL1xuXHRcdHB1YmxpYyByZWFkb25seSBlbmRMaW5lTnVtYmVyOiBudW1iZXJcblx0KSB7IH1cblxuXHQvKipcblx0ICogQ29tcHV0ZSBhIGRlc2lyZWQgYHNjcm9sbFBvc2l0aW9uYCBzdWNoIHRoYXQgdGhlIHNsaWRlciBtb3ZlcyBieSBgZGVsdGFgLlxuXHQgKi9cblx0cHVibGljIGdldERlc2lyZWRTY3JvbGxUb3BGcm9tRGVsdGEoZGVsdGE6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIE1hdGgucm91bmQodGhpcy5zY3JvbGxUb3AgKyBkZWx0YSAvIHRoaXMuX2NvbXB1dGVkU2xpZGVyUmF0aW8pO1xuXHR9XG5cblx0cHVibGljIGdldERlc2lyZWRTY3JvbGxUb3BGcm9tVG91Y2hMb2NhdGlvbihwYWdlWTogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gTWF0aC5yb3VuZCgocGFnZVkgLSB0aGlzLnNsaWRlckhlaWdodCAvIDIpIC8gdGhpcy5fY29tcHV0ZWRTbGlkZXJSYXRpbyk7XG5cdH1cblxuXHQvKipcblx0ICogSW50ZXJzZWN0IGEgbGluZSByYW5nZSB3aXRoIGB0aGlzLnN0YXJ0TGluZU51bWJlcmAgYW5kIGB0aGlzLmVuZExpbmVOdW1iZXJgLlxuXHQgKi9cblx0cHVibGljIGludGVyc2VjdFdpdGhWaWV3cG9ydChyYW5nZTogUmFuZ2UpOiBbbnVtYmVyLCBudW1iZXJdIHwgbnVsbCB7XG5cdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gTWF0aC5tYXgodGhpcy5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IE1hdGgubWluKHRoaXMuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kTGluZU51bWJlcik7XG5cdFx0aWYgKHN0YXJ0TGluZU51bWJlciA+IGVuZExpbmVOdW1iZXIpIHtcblx0XHRcdC8vIGVudGlyZWx5IG91dHNpZGUgbWluaW1hcCdzIHZpZXdwb3J0XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIFtzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXJdO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgaW5uZXIgbWluaW1hcCB5IGNvb3JkaW5hdGUgZm9yIGEgbGluZSBudW1iZXIuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0WUZvckxpbmVOdW1iZXIobGluZU51bWJlcjogbnVtYmVyLCBtaW5pbWFwTGluZUhlaWdodDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gKyAobGluZU51bWJlciAtIHRoaXMuc3RhcnRMaW5lTnVtYmVyICsgdGhpcy50b3BQYWRkaW5nTGluZUNvdW50KSAqIG1pbmltYXBMaW5lSGVpZ2h0O1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGUoXG5cdFx0b3B0aW9uczogTWluaW1hcE9wdGlvbnMsXG5cdFx0dmlld3BvcnRTdGFydExpbmVOdW1iZXI6IG51bWJlcixcblx0XHR2aWV3cG9ydEVuZExpbmVOdW1iZXI6IG51bWJlcixcblx0XHR2aWV3cG9ydFN0YXJ0TGluZU51bWJlclZlcnRpY2FsT2Zmc2V0OiBudW1iZXIsXG5cdFx0dmlld3BvcnRIZWlnaHQ6IG51bWJlcixcblx0XHR2aWV3cG9ydENvbnRhaW5zV2hpdGVzcGFjZUdhcHM6IGJvb2xlYW4sXG5cdFx0bGluZUNvdW50OiBudW1iZXIsXG5cdFx0cmVhbExpbmVDb3VudDogbnVtYmVyLFxuXHRcdHNjcm9sbFRvcDogbnVtYmVyLFxuXHRcdHNjcm9sbEhlaWdodDogbnVtYmVyLFxuXHRcdHByZXZpb3VzTGF5b3V0OiBNaW5pbWFwTGF5b3V0IHwgbnVsbFxuXHQpOiBNaW5pbWFwTGF5b3V0IHtcblx0XHRjb25zdCBwaXhlbFJhdGlvID0gb3B0aW9ucy5waXhlbFJhdGlvO1xuXHRcdGNvbnN0IG1pbmltYXBMaW5lSGVpZ2h0ID0gb3B0aW9ucy5taW5pbWFwTGluZUhlaWdodDtcblx0XHRjb25zdCBtaW5pbWFwTGluZXNGaXR0aW5nID0gTWF0aC5mbG9vcihvcHRpb25zLmNhbnZhc0lubmVySGVpZ2h0IC8gbWluaW1hcExpbmVIZWlnaHQpO1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSBvcHRpb25zLmxpbmVIZWlnaHQ7XG5cblx0XHRpZiAob3B0aW9ucy5taW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQpIHtcblx0XHRcdGxldCBsb2dpY2FsU2Nyb2xsSGVpZ2h0ID0gKFxuXHRcdFx0XHRyZWFsTGluZUNvdW50ICogb3B0aW9ucy5saW5lSGVpZ2h0XG5cdFx0XHRcdCsgb3B0aW9ucy5wYWRkaW5nVG9wXG5cdFx0XHRcdCsgb3B0aW9ucy5wYWRkaW5nQm90dG9tXG5cdFx0XHQpO1xuXHRcdFx0aWYgKG9wdGlvbnMuc2Nyb2xsQmV5b25kTGFzdExpbmUpIHtcblx0XHRcdFx0bG9naWNhbFNjcm9sbEhlaWdodCArPSBNYXRoLm1heCgwLCB2aWV3cG9ydEhlaWdodCAtIG9wdGlvbnMubGluZUhlaWdodCAtIG9wdGlvbnMucGFkZGluZ0JvdHRvbSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzbGlkZXJIZWlnaHQgPSBNYXRoLm1heCgxLCBNYXRoLmZsb29yKHZpZXdwb3J0SGVpZ2h0ICogdmlld3BvcnRIZWlnaHQgLyBsb2dpY2FsU2Nyb2xsSGVpZ2h0KSk7XG5cdFx0XHRjb25zdCBtYXhNaW5pbWFwU2xpZGVyVG9wID0gTWF0aC5tYXgoMCwgb3B0aW9ucy5taW5pbWFwSGVpZ2h0IC0gc2xpZGVySGVpZ2h0KTtcblx0XHRcdC8vIFRoZSBzbGlkZXIgY2FuIG1vdmUgZnJvbSAwIHRvIGBtYXhNaW5pbWFwU2xpZGVyVG9wYFxuXHRcdFx0Ly8gaW4gdGhlIHNhbWUgd2F5IGBzY3JvbGxUb3BgIGNhbiBtb3ZlIGZyb20gMCB0byBgc2Nyb2xsSGVpZ2h0YCAtIGB2aWV3cG9ydEhlaWdodGAuXG5cdFx0XHRjb25zdCBjb21wdXRlZFNsaWRlclJhdGlvID0gKG1heE1pbmltYXBTbGlkZXJUb3ApIC8gKHNjcm9sbEhlaWdodCAtIHZpZXdwb3J0SGVpZ2h0KTtcblx0XHRcdGNvbnN0IHNsaWRlclRvcCA9IChzY3JvbGxUb3AgKiBjb21wdXRlZFNsaWRlclJhdGlvKTtcblx0XHRcdGNvbnN0IHNsaWRlck5lZWRlZCA9IChtYXhNaW5pbWFwU2xpZGVyVG9wID4gMCk7XG5cdFx0XHRjb25zdCBtYXhMaW5lc0ZpdHRpbmcgPSBNYXRoLmZsb29yKG9wdGlvbnMuY2FudmFzSW5uZXJIZWlnaHQgLyBvcHRpb25zLm1pbmltYXBMaW5lSGVpZ2h0KTtcblx0XHRcdGNvbnN0IHRvcFBhZGRpbmdMaW5lQ291bnQgPSBNYXRoLmZsb29yKG9wdGlvbnMucGFkZGluZ1RvcCAvIG9wdGlvbnMubGluZUhlaWdodCk7XG5cdFx0XHRyZXR1cm4gbmV3IE1pbmltYXBMYXlvdXQoc2Nyb2xsVG9wLCBzY3JvbGxIZWlnaHQsIHNsaWRlck5lZWRlZCwgY29tcHV0ZWRTbGlkZXJSYXRpbywgc2xpZGVyVG9wLCBzbGlkZXJIZWlnaHQsIHRvcFBhZGRpbmdMaW5lQ291bnQsIDEsIE1hdGgubWluKGxpbmVDb3VudCwgbWF4TGluZXNGaXR0aW5nKSk7XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIHZpc2libGUgbGluZSBjb3VudCBpbiBhIHZpZXdwb3J0IGNhbiBjaGFuZ2UgZHVlIHRvIGEgbnVtYmVyIG9mIHJlYXNvbnM6XG5cdFx0Ly8gIGEpIHdpdGggdGhlIHNhbWUgdmlld3BvcnQgd2lkdGgsIGRpZmZlcmVudCBzY3JvbGwgcG9zaXRpb25zIGNhbiByZXN1bHQgaW4gcGFydGlhbCBsaW5lcyBiZWluZyB2aXNpYmxlOlxuXHRcdC8vICAgIGUuZy4gZm9yIGEgbGluZSBoZWlnaHQgb2YgMjAsIGFuZCBhIHZpZXdwb3J0IGhlaWdodCBvZiA2MDBcblx0XHQvLyAgICAgICAgICAqIHNjcm9sbFRvcCA9IDAgID0+IHZpc2libGUgbGluZXMgYXJlIFsxLCAzMF1cblx0XHQvLyAgICAgICAgICAqIHNjcm9sbFRvcCA9IDEwID0+IHZpc2libGUgbGluZXMgYXJlIFsxLCAzMV0gKHdpdGggbGluZXMgMSBhbmQgMzEgcGFydGlhbGx5IHZpc2libGUpXG5cdFx0Ly8gICAgICAgICAgKiBzY3JvbGxUb3AgPSAyMCA9PiB2aXNpYmxlIGxpbmVzIGFyZSBbMiwgMzFdXG5cdFx0Ly8gIGIpIHdoaXRlc3BhY2UgZ2FwcyBtaWdodCBtYWtlIHRoZWlyIHdheSBpbiB0aGUgdmlld3BvcnQgKHdoaWNoIHJlc3VsdHMgaW4gYSBkZWNyZWFzZSBpbiB0aGUgdmlzaWJsZSBsaW5lIGNvdW50KVxuXHRcdC8vICBjKSB3ZSBjb3VsZCBiZSBpbiB0aGUgc2Nyb2xsIGJleW9uZCBsYXN0IGxpbmUgY2FzZSAod2hpY2ggYWxzbyByZXN1bHRzIGluIGEgZGVjcmVhc2UgaW4gdGhlIHZpc2libGUgbGluZSBjb3VudCwgZG93biB0byBwb3NzaWJseSBvbmx5IG9uZSBsaW5lIGJlaW5nIHZpc2libGUpXG5cblx0XHQvLyBXZSBtdXN0IGZpcnN0IGVzdGFibGlzaCBhIGRlc2lyYWJsZSBzbGlkZXIgaGVpZ2h0LlxuXHRcdGxldCBzbGlkZXJIZWlnaHQ6IG51bWJlcjtcblx0XHRpZiAodmlld3BvcnRDb250YWluc1doaXRlc3BhY2VHYXBzICYmIHZpZXdwb3J0RW5kTGluZU51bWJlciAhPT0gbGluZUNvdW50KSB7XG5cdFx0XHQvLyBjYXNlIGIpIGZyb20gYWJvdmU6IHRoZXJlIGFyZSB3aGl0ZXNwYWNlIGdhcHMgaW4gdGhlIHZpZXdwb3J0LlxuXHRcdFx0Ly8gSW4gdGhpcyBjYXNlLCB0aGUgaGVpZ2h0IG9mIHRoZSBzbGlkZXIgZGlyZWN0bHkgcmVmbGVjdHMgdGhlIHZpc2libGUgbGluZSBjb3VudC5cblx0XHRcdGNvbnN0IHZpZXdwb3J0TGluZUNvdW50ID0gdmlld3BvcnRFbmRMaW5lTnVtYmVyIC0gdmlld3BvcnRTdGFydExpbmVOdW1iZXIgKyAxO1xuXHRcdFx0c2xpZGVySGVpZ2h0ID0gTWF0aC5mbG9vcih2aWV3cG9ydExpbmVDb3VudCAqIG1pbmltYXBMaW5lSGVpZ2h0IC8gcGl4ZWxSYXRpbyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFRoZSBzbGlkZXIgaGFzIGEgc3RhYmxlIGhlaWdodFxuXHRcdFx0Y29uc3QgZXhwZWN0ZWRWaWV3cG9ydExpbmVDb3VudCA9IHZpZXdwb3J0SGVpZ2h0IC8gbGluZUhlaWdodDtcblx0XHRcdHNsaWRlckhlaWdodCA9IE1hdGguZmxvb3IoZXhwZWN0ZWRWaWV3cG9ydExpbmVDb3VudCAqIG1pbmltYXBMaW5lSGVpZ2h0IC8gcGl4ZWxSYXRpbyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0cmFMaW5lc0F0VGhlVG9wID0gTWF0aC5mbG9vcihvcHRpb25zLnBhZGRpbmdUb3AgLyBsaW5lSGVpZ2h0KTtcblx0XHRsZXQgZXh0cmFMaW5lc0F0VGhlQm90dG9tID0gTWF0aC5mbG9vcihvcHRpb25zLnBhZGRpbmdCb3R0b20gLyBsaW5lSGVpZ2h0KTtcblx0XHRpZiAob3B0aW9ucy5zY3JvbGxCZXlvbmRMYXN0TGluZSkge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRWaWV3cG9ydExpbmVDb3VudCA9IHZpZXdwb3J0SGVpZ2h0IC8gbGluZUhlaWdodDtcblx0XHRcdGV4dHJhTGluZXNBdFRoZUJvdHRvbSA9IE1hdGgubWF4KGV4dHJhTGluZXNBdFRoZUJvdHRvbSwgZXhwZWN0ZWRWaWV3cG9ydExpbmVDb3VudCAtIDEpO1xuXHRcdH1cblxuXHRcdGxldCBtYXhNaW5pbWFwU2xpZGVyVG9wOiBudW1iZXI7XG5cdFx0aWYgKGV4dHJhTGluZXNBdFRoZUJvdHRvbSA+IDApIHtcblx0XHRcdGNvbnN0IGV4cGVjdGVkVmlld3BvcnRMaW5lQ291bnQgPSB2aWV3cG9ydEhlaWdodCAvIGxpbmVIZWlnaHQ7XG5cdFx0XHQvLyBUaGUgbWluaW1hcCBzbGlkZXIsIHdoZW4gZHJhZ2dlZCBhbGwgdGhlIHdheSBkb3duLCB3aWxsIGNvbnRhaW4gdGhlIGxhc3QgbGluZSBhdCBpdHMgdG9wXG5cdFx0XHRtYXhNaW5pbWFwU2xpZGVyVG9wID0gKGV4dHJhTGluZXNBdFRoZVRvcCArIGxpbmVDb3VudCArIGV4dHJhTGluZXNBdFRoZUJvdHRvbSAtIGV4cGVjdGVkVmlld3BvcnRMaW5lQ291bnQgLSAxKSAqIG1pbmltYXBMaW5lSGVpZ2h0IC8gcGl4ZWxSYXRpbztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVGhlIG1pbmltYXAgc2xpZGVyLCB3aGVuIGRyYWdnZWQgYWxsIHRoZSB3YXkgZG93biwgd2lsbCBjb250YWluIHRoZSBsYXN0IGxpbmUgYXQgaXRzIGJvdHRvbVxuXHRcdFx0bWF4TWluaW1hcFNsaWRlclRvcCA9IE1hdGgubWF4KDAsIChleHRyYUxpbmVzQXRUaGVUb3AgKyBsaW5lQ291bnQpICogbWluaW1hcExpbmVIZWlnaHQgLyBwaXhlbFJhdGlvIC0gc2xpZGVySGVpZ2h0KTtcblx0XHR9XG5cdFx0bWF4TWluaW1hcFNsaWRlclRvcCA9IE1hdGgubWluKG9wdGlvbnMubWluaW1hcEhlaWdodCAtIHNsaWRlckhlaWdodCwgbWF4TWluaW1hcFNsaWRlclRvcCk7XG5cblx0XHQvLyBUaGUgc2xpZGVyIGNhbiBtb3ZlIGZyb20gMCB0byBgbWF4TWluaW1hcFNsaWRlclRvcGBcblx0XHQvLyBpbiB0aGUgc2FtZSB3YXkgYHNjcm9sbFRvcGAgY2FuIG1vdmUgZnJvbSAwIHRvIGBzY3JvbGxIZWlnaHRgIC0gYHZpZXdwb3J0SGVpZ2h0YC5cblx0XHRjb25zdCBjb21wdXRlZFNsaWRlclJhdGlvID0gKG1heE1pbmltYXBTbGlkZXJUb3ApIC8gKHNjcm9sbEhlaWdodCAtIHZpZXdwb3J0SGVpZ2h0KTtcblx0XHRjb25zdCBzbGlkZXJUb3AgPSAoc2Nyb2xsVG9wICogY29tcHV0ZWRTbGlkZXJSYXRpbyk7XG5cblx0XHRpZiAobWluaW1hcExpbmVzRml0dGluZyA+PSBleHRyYUxpbmVzQXRUaGVUb3AgKyBsaW5lQ291bnQgKyBleHRyYUxpbmVzQXRUaGVCb3R0b20pIHtcblx0XHRcdC8vIEFsbCBsaW5lcyBmaXQgaW4gdGhlIG1pbmltYXBcblx0XHRcdGNvbnN0IHNsaWRlck5lZWRlZCA9IChtYXhNaW5pbWFwU2xpZGVyVG9wID4gMCk7XG5cdFx0XHRyZXR1cm4gbmV3IE1pbmltYXBMYXlvdXQoc2Nyb2xsVG9wLCBzY3JvbGxIZWlnaHQsIHNsaWRlck5lZWRlZCwgY29tcHV0ZWRTbGlkZXJSYXRpbywgc2xpZGVyVG9wLCBzbGlkZXJIZWlnaHQsIGV4dHJhTGluZXNBdFRoZVRvcCwgMSwgbGluZUNvdW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IGNvbnNpZGVyaW5nU3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdFx0XHRpZiAodmlld3BvcnRTdGFydExpbmVOdW1iZXIgPiAxKSB7XG5cdFx0XHRcdGNvbnNpZGVyaW5nU3RhcnRMaW5lTnVtYmVyID0gdmlld3BvcnRTdGFydExpbmVOdW1iZXIgKyBleHRyYUxpbmVzQXRUaGVUb3A7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zaWRlcmluZ1N0YXJ0TGluZU51bWJlciA9IE1hdGgubWF4KDEsIHNjcm9sbFRvcCAvIGxpbmVIZWlnaHQpO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgdG9wUGFkZGluZ0xpbmVDb3VudDogbnVtYmVyO1xuXHRcdFx0bGV0IHN0YXJ0TGluZU51bWJlciA9IE1hdGgubWF4KDEsIE1hdGguZmxvb3IoY29uc2lkZXJpbmdTdGFydExpbmVOdW1iZXIgLSBzbGlkZXJUb3AgKiBwaXhlbFJhdGlvIC8gbWluaW1hcExpbmVIZWlnaHQpKTtcblx0XHRcdGlmIChzdGFydExpbmVOdW1iZXIgPCBleHRyYUxpbmVzQXRUaGVUb3ApIHtcblx0XHRcdFx0dG9wUGFkZGluZ0xpbmVDb3VudCA9IGV4dHJhTGluZXNBdFRoZVRvcCAtIHN0YXJ0TGluZU51bWJlciArIDE7XG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlciA9IDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0b3BQYWRkaW5nTGluZUNvdW50ID0gMDtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyID0gTWF0aC5tYXgoMSwgc3RhcnRMaW5lTnVtYmVyIC0gZXh0cmFMaW5lc0F0VGhlVG9wKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQXZvaWQgZmxpY2tlcmluZyBjYXVzZWQgYnkgYSBwYXJ0aWFsIHZpZXdwb3J0IHN0YXJ0IGxpbmVcblx0XHRcdC8vIGJ5IGJlaW5nIGNvbnNpc3RlbnQgdy5yLnQuIHRoZSBwcmV2aW91cyBsYXlvdXQgZGVjaXNpb25cblx0XHRcdGlmIChwcmV2aW91c0xheW91dCAmJiBwcmV2aW91c0xheW91dC5zY3JvbGxIZWlnaHQgPT09IHNjcm9sbEhlaWdodCkge1xuXHRcdFx0XHRpZiAocHJldmlvdXNMYXlvdXQuc2Nyb2xsVG9wID4gc2Nyb2xsVG9wKSB7XG5cdFx0XHRcdFx0Ly8gU2Nyb2xsaW5nIHVwID0+IG5ldmVyIGluY3JlYXNlIGBzdGFydExpbmVOdW1iZXJgXG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyID0gTWF0aC5taW4oc3RhcnRMaW5lTnVtYmVyLCBwcmV2aW91c0xheW91dC5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdHRvcFBhZGRpbmdMaW5lQ291bnQgPSBNYXRoLm1heCh0b3BQYWRkaW5nTGluZUNvdW50LCBwcmV2aW91c0xheW91dC50b3BQYWRkaW5nTGluZUNvdW50KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocHJldmlvdXNMYXlvdXQuc2Nyb2xsVG9wIDwgc2Nyb2xsVG9wKSB7XG5cdFx0XHRcdFx0Ly8gU2Nyb2xsaW5nIGRvd24gPT4gbmV2ZXIgZGVjcmVhc2UgYHN0YXJ0TGluZU51bWJlcmBcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXIgPSBNYXRoLm1heChzdGFydExpbmVOdW1iZXIsIHByZXZpb3VzTGF5b3V0LnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdFx0dG9wUGFkZGluZ0xpbmVDb3VudCA9IE1hdGgubWluKHRvcFBhZGRpbmdMaW5lQ291bnQsIHByZXZpb3VzTGF5b3V0LnRvcFBhZGRpbmdMaW5lQ291bnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSBNYXRoLm1pbihsaW5lQ291bnQsIHN0YXJ0TGluZU51bWJlciAtIHRvcFBhZGRpbmdMaW5lQ291bnQgKyBtaW5pbWFwTGluZXNGaXR0aW5nIC0gMSk7XG5cdFx0XHRjb25zdCBwYXJ0aWFsTGluZSA9IChzY3JvbGxUb3AgLSB2aWV3cG9ydFN0YXJ0TGluZU51bWJlclZlcnRpY2FsT2Zmc2V0KSAvIGxpbmVIZWlnaHQ7XG5cblx0XHRcdGxldCBzbGlkZXJUb3BBbGlnbmVkOiBudW1iZXI7XG5cdFx0XHRpZiAoc2Nyb2xsVG9wID49IG9wdGlvbnMucGFkZGluZ1RvcCkge1xuXHRcdFx0XHRzbGlkZXJUb3BBbGlnbmVkID0gKHZpZXdwb3J0U3RhcnRMaW5lTnVtYmVyIC0gc3RhcnRMaW5lTnVtYmVyICsgdG9wUGFkZGluZ0xpbmVDb3VudCArIHBhcnRpYWxMaW5lKSAqIG1pbmltYXBMaW5lSGVpZ2h0IC8gcGl4ZWxSYXRpbztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNsaWRlclRvcEFsaWduZWQgPSAoc2Nyb2xsVG9wIC8gb3B0aW9ucy5wYWRkaW5nVG9wKSAqICh0b3BQYWRkaW5nTGluZUNvdW50ICsgcGFydGlhbExpbmUpICogbWluaW1hcExpbmVIZWlnaHQgLyBwaXhlbFJhdGlvO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbmV3IE1pbmltYXBMYXlvdXQoc2Nyb2xsVG9wLCBzY3JvbGxIZWlnaHQsIHRydWUsIGNvbXB1dGVkU2xpZGVyUmF0aW8sIHNsaWRlclRvcEFsaWduZWQsIHNsaWRlckhlaWdodCwgdG9wUGFkZGluZ0xpbmVDb3VudCwgc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgTWluaW1hcExpbmUgaW1wbGVtZW50cyBJTGluZSB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJTlZBTElEID0gbmV3IE1pbmltYXBMaW5lKC0xKTtcblxuXHRkeTogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKGR5OiBudW1iZXIpIHtcblx0XHR0aGlzLmR5ID0gZHk7XG5cdH1cblxuXHRwdWJsaWMgb25Db250ZW50Q2hhbmdlZCgpOiB2b2lkIHtcblx0XHR0aGlzLmR5ID0gLTE7XG5cdH1cblxuXHRwdWJsaWMgb25Ub2tlbnNDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuZHkgPSAtMTtcblx0fVxufVxuXG5jbGFzcyBSZW5kZXJEYXRhIHtcblx0LyoqXG5cdCAqIGxhc3QgcmVuZGVyZWQgbGF5b3V0LlxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IHJlbmRlcmVkTGF5b3V0OiBNaW5pbWFwTGF5b3V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbWFnZURhdGE6IEltYWdlRGF0YTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVuZGVyZWRMaW5lczogUmVuZGVyZWRMaW5lc0NvbGxlY3Rpb248TWluaW1hcExpbmU+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlbmRlcmVkTGF5b3V0OiBNaW5pbWFwTGF5b3V0LFxuXHRcdGltYWdlRGF0YTogSW1hZ2VEYXRhLFxuXHRcdGxpbmVzOiBNaW5pbWFwTGluZVtdXG5cdCkge1xuXHRcdHRoaXMucmVuZGVyZWRMYXlvdXQgPSByZW5kZXJlZExheW91dDtcblx0XHR0aGlzLl9pbWFnZURhdGEgPSBpbWFnZURhdGE7XG5cdFx0dGhpcy5fcmVuZGVyZWRMaW5lcyA9IG5ldyBSZW5kZXJlZExpbmVzQ29sbGVjdGlvbih7XG5cdFx0XHRjcmVhdGVMaW5lOiAoKSA9PiBNaW5pbWFwTGluZS5JTlZBTElEXG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVuZGVyZWRMaW5lcy5fc2V0KHJlbmRlcmVkTGF5b3V0LnN0YXJ0TGluZU51bWJlciwgbGluZXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrIGlmIHRoZSBjdXJyZW50IFJlbmRlckRhdGEgbWF0Y2hlcyBhY2N1cmF0ZWx5IHRoZSBuZXcgZGVzaXJlZCBsYXlvdXQgYW5kIG5vIHBhaW50aW5nIGlzIG5lZWRlZC5cblx0ICovXG5cdHB1YmxpYyBsaW5lc0VxdWFscyhsYXlvdXQ6IE1pbmltYXBMYXlvdXQpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuc2Nyb2xsRXF1YWxzKGxheW91dCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCB0bXAgPSB0aGlzLl9yZW5kZXJlZExpbmVzLl9nZXQoKTtcblx0XHRjb25zdCBsaW5lcyA9IHRtcC5saW5lcztcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gbGluZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGlmIChsaW5lc1tpXS5keSA9PT0gLTEpIHtcblx0XHRcdFx0Ly8gVGhpcyBsaW5lIGlzIGludmFsaWRcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrIGlmIHRoZSBjdXJyZW50IFJlbmRlckRhdGEgbWF0Y2hlcyB0aGUgbmV3IGxheW91dCdzIHNjcm9sbCBwb3NpdGlvblxuXHQgKi9cblx0cHVibGljIHNjcm9sbEVxdWFscyhsYXlvdXQ6IE1pbmltYXBMYXlvdXQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5yZW5kZXJlZExheW91dC5zdGFydExpbmVOdW1iZXIgPT09IGxheW91dC5zdGFydExpbmVOdW1iZXJcblx0XHRcdCYmIHRoaXMucmVuZGVyZWRMYXlvdXQuZW5kTGluZU51bWJlciA9PT0gbGF5b3V0LmVuZExpbmVOdW1iZXI7XG5cdH1cblxuXHRfZ2V0KCk6IHsgaW1hZ2VEYXRhOiBJbWFnZURhdGE7IHJlbmRMaW5lTnVtYmVyU3RhcnQ6IG51bWJlcjsgbGluZXM6IE1pbmltYXBMaW5lW10gfSB7XG5cdFx0Y29uc3QgdG1wID0gdGhpcy5fcmVuZGVyZWRMaW5lcy5fZ2V0KCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGltYWdlRGF0YTogdGhpcy5faW1hZ2VEYXRhLFxuXHRcdFx0cmVuZExpbmVOdW1iZXJTdGFydDogdG1wLnJlbmRMaW5lTnVtYmVyU3RhcnQsXG5cdFx0XHRsaW5lczogdG1wLmxpbmVzXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBvbkxpbmVzQ2hhbmdlZChjaGFuZ2VGcm9tTGluZU51bWJlcjogbnVtYmVyLCBjaGFuZ2VDb3VudDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkTGluZXMub25MaW5lc0NoYW5nZWQoY2hhbmdlRnJvbUxpbmVOdW1iZXIsIGNoYW5nZUNvdW50KTtcblx0fVxuXHRwdWJsaWMgb25MaW5lc0RlbGV0ZWQoZGVsZXRlRnJvbUxpbmVOdW1iZXI6IG51bWJlciwgZGVsZXRlVG9MaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9yZW5kZXJlZExpbmVzLm9uTGluZXNEZWxldGVkKGRlbGV0ZUZyb21MaW5lTnVtYmVyLCBkZWxldGVUb0xpbmVOdW1iZXIpO1xuXHR9XG5cdHB1YmxpYyBvbkxpbmVzSW5zZXJ0ZWQoaW5zZXJ0RnJvbUxpbmVOdW1iZXI6IG51bWJlciwgaW5zZXJ0VG9MaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9yZW5kZXJlZExpbmVzLm9uTGluZXNJbnNlcnRlZChpbnNlcnRGcm9tTGluZU51bWJlciwgaW5zZXJ0VG9MaW5lTnVtYmVyKTtcblx0fVxuXHRwdWJsaWMgb25Ub2tlbnNDaGFuZ2VkKHJhbmdlczogeyBmcm9tTGluZU51bWJlcjogbnVtYmVyOyB0b0xpbmVOdW1iZXI6IG51bWJlciB9W10pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZWRMaW5lcy5vblRva2Vuc0NoYW5nZWQocmFuZ2VzKTtcblx0fVxufVxuXG4vKipcbiAqIFNvbWUgc29ydCBvZiBkb3VibGUgYnVmZmVyaW5nLlxuICpcbiAqIEtlZXBzIHR3byBidWZmZXJzIGFyb3VuZCB0aGF0IHdpbGwgYmUgcm90YXRlZCBmb3IgcGFpbnRpbmcuXG4gKiBBbHdheXMgZ2l2ZXMgYSBidWZmZXIgdGhhdCBpcyBmaWxsZWQgd2l0aCB0aGUgYmFja2dyb3VuZCBjb2xvci5cbiAqL1xuY2xhc3MgTWluaW1hcEJ1ZmZlcnMge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2JhY2tncm91bmRGaWxsRGF0YTogVWludDhDbGFtcGVkQXJyYXk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2J1ZmZlcnM6IFtJbWFnZURhdGEsIEltYWdlRGF0YV07XG5cdHByaXZhdGUgX2xhc3RVc2VkQnVmZmVyOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIFdJRFRIOiBudW1iZXIsIEhFSUdIVDogbnVtYmVyLCBiYWNrZ3JvdW5kOiBSR0JBOCkge1xuXHRcdHRoaXMuX2JhY2tncm91bmRGaWxsRGF0YSA9IE1pbmltYXBCdWZmZXJzLl9jcmVhdGVCYWNrZ3JvdW5kRmlsbERhdGEoV0lEVEgsIEhFSUdIVCwgYmFja2dyb3VuZCk7XG5cdFx0dGhpcy5fYnVmZmVycyA9IFtcblx0XHRcdGN0eC5jcmVhdGVJbWFnZURhdGEoV0lEVEgsIEhFSUdIVCksXG5cdFx0XHRjdHguY3JlYXRlSW1hZ2VEYXRhKFdJRFRILCBIRUlHSFQpXG5cdFx0XTtcblx0XHR0aGlzLl9sYXN0VXNlZEJ1ZmZlciA9IDA7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QnVmZmVyKCk6IEltYWdlRGF0YSB7XG5cdFx0Ly8gcm90YXRlIGJ1ZmZlcnNcblx0XHR0aGlzLl9sYXN0VXNlZEJ1ZmZlciA9IDEgLSB0aGlzLl9sYXN0VXNlZEJ1ZmZlcjtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9idWZmZXJzW3RoaXMuX2xhc3RVc2VkQnVmZmVyXTtcblxuXHRcdC8vIGZpbGwgd2l0aCBiYWNrZ3JvdW5kIGNvbG9yXG5cdFx0cmVzdWx0LmRhdGEuc2V0KHRoaXMuX2JhY2tncm91bmRGaWxsRGF0YSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NyZWF0ZUJhY2tncm91bmRGaWxsRGF0YShXSURUSDogbnVtYmVyLCBIRUlHSFQ6IG51bWJlciwgYmFja2dyb3VuZDogUkdCQTgpOiBVaW50OENsYW1wZWRBcnJheSB7XG5cdFx0Y29uc3QgYmFja2dyb3VuZFIgPSBiYWNrZ3JvdW5kLnI7XG5cdFx0Y29uc3QgYmFja2dyb3VuZEcgPSBiYWNrZ3JvdW5kLmc7XG5cdFx0Y29uc3QgYmFja2dyb3VuZEIgPSBiYWNrZ3JvdW5kLmI7XG5cdFx0Y29uc3QgYmFja2dyb3VuZEEgPSBiYWNrZ3JvdW5kLmE7XG5cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgVWludDhDbGFtcGVkQXJyYXkoV0lEVEggKiBIRUlHSFQgKiA0KTtcblx0XHRsZXQgb2Zmc2V0ID0gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IEhFSUdIVDsgaSsrKSB7XG5cdFx0XHRmb3IgKGxldCBqID0gMDsgaiA8IFdJRFRIOyBqKyspIHtcblx0XHRcdFx0cmVzdWx0W29mZnNldF0gPSBiYWNrZ3JvdW5kUjtcblx0XHRcdFx0cmVzdWx0W29mZnNldCArIDFdID0gYmFja2dyb3VuZEc7XG5cdFx0XHRcdHJlc3VsdFtvZmZzZXQgKyAyXSA9IGJhY2tncm91bmRCO1xuXHRcdFx0XHRyZXN1bHRbb2Zmc2V0ICsgM10gPSBiYWNrZ3JvdW5kQTtcblx0XHRcdFx0b2Zmc2V0ICs9IDQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNaW5pbWFwTW9kZWwge1xuXHRyZWFkb25seSB0b2tlbnNDb2xvclRyYWNrZXI6IE1pbmltYXBUb2tlbnNDb2xvclRyYWNrZXI7XG5cdHJlYWRvbmx5IG9wdGlvbnM6IE1pbmltYXBPcHRpb25zO1xuXG5cdGdldExpbmVDb3VudCgpOiBudW1iZXI7XG5cdGdldFJlYWxMaW5lQ291bnQoKTogbnVtYmVyO1xuXHRnZXRMaW5lQ29udGVudChsaW5lTnVtYmVyOiBudW1iZXIpOiBzdHJpbmc7XG5cdGdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyO1xuXHRnZXRNaW5pbWFwTGluZXNSZW5kZXJpbmdEYXRhKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIG5lZWRlZDogYm9vbGVhbltdKTogKFZpZXdMaW5lRGF0YSB8IG51bGwpW107XG5cdGdldFNlbGVjdGlvbnMoKTogU2VsZWN0aW9uW107XG5cdGdldE1pbmltYXBEZWNvcmF0aW9uc0luVmlld3BvcnQoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlcik6IFZpZXdNb2RlbERlY29yYXRpb25bXTtcblx0Z2V0U2VjdGlvbkhlYWRlckRlY29yYXRpb25zSW5WaWV3cG9ydChzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyKTogVmlld01vZGVsRGVjb3JhdGlvbltdO1xuXHRnZXRTZWN0aW9uSGVhZGVyVGV4dChkZWNvcmF0aW9uOiBWaWV3TW9kZWxEZWNvcmF0aW9uLCBmaXRXaWR0aDogKHM6IHN0cmluZykgPT4gc3RyaW5nKTogc3RyaW5nIHwgbnVsbDtcblx0Z2V0T3B0aW9ucygpOiBUZXh0TW9kZWxSZXNvbHZlZE9wdGlvbnM7XG5cdHJldmVhbExpbmVOdW1iZXIobGluZU51bWJlcjogbnVtYmVyKTogdm9pZDtcblx0c2V0U2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIElNaW5pbWFwUmVuZGVyaW5nQ29udGV4dCB7XG5cdHJlYWRvbmx5IHZpZXdwb3J0Q29udGFpbnNXaGl0ZXNwYWNlR2FwczogYm9vbGVhbjtcblxuXHRyZWFkb25seSBzY3JvbGxXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBzY3JvbGxIZWlnaHQ6IG51bWJlcjtcblxuXHRyZWFkb25seSB2aWV3cG9ydFN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRyZWFkb25seSB2aWV3cG9ydEVuZExpbmVOdW1iZXI6IG51bWJlcjtcblx0cmVhZG9ubHkgdmlld3BvcnRTdGFydExpbmVOdW1iZXJWZXJ0aWNhbE9mZnNldDogbnVtYmVyO1xuXG5cdHJlYWRvbmx5IHNjcm9sbFRvcDogbnVtYmVyO1xuXHRyZWFkb25seSBzY3JvbGxMZWZ0OiBudW1iZXI7XG5cblx0cmVhZG9ubHkgdmlld3BvcnRXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSB2aWV3cG9ydEhlaWdodDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU2FtcGxpbmdTdGF0ZUxpbmVzRGVsZXRlZEV2ZW50IHtcblx0dHlwZTogJ2RlbGV0ZWQnO1xuXHRfb2xkSW5kZXg6IG51bWJlcjtcblx0ZGVsZXRlRnJvbUxpbmVOdW1iZXI6IG51bWJlcjtcblx0ZGVsZXRlVG9MaW5lTnVtYmVyOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBTYW1wbGluZ1N0YXRlTGluZXNJbnNlcnRlZEV2ZW50IHtcblx0dHlwZTogJ2luc2VydGVkJztcblx0X2k6IG51bWJlcjtcblx0aW5zZXJ0RnJvbUxpbmVOdW1iZXI6IG51bWJlcjtcblx0aW5zZXJ0VG9MaW5lTnVtYmVyOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBTYW1wbGluZ1N0YXRlRmx1c2hFdmVudCB7XG5cdHR5cGU6ICdmbHVzaCc7XG59XG5cbnR5cGUgU2FtcGxpbmdTdGF0ZUV2ZW50ID0gU2FtcGxpbmdTdGF0ZUxpbmVzSW5zZXJ0ZWRFdmVudCB8IFNhbXBsaW5nU3RhdGVMaW5lc0RlbGV0ZWRFdmVudCB8IFNhbXBsaW5nU3RhdGVGbHVzaEV2ZW50O1xuXG5jbGFzcyBNaW5pbWFwU2FtcGxpbmdTdGF0ZSB7XG5cblx0cHVibGljIHN0YXRpYyBjb21wdXRlKG9wdGlvbnM6IE1pbmltYXBPcHRpb25zLCB2aWV3TGluZUNvdW50OiBudW1iZXIsIG9sZFNhbXBsaW5nU3RhdGU6IE1pbmltYXBTYW1wbGluZ1N0YXRlIHwgbnVsbCk6IFtNaW5pbWFwU2FtcGxpbmdTdGF0ZSB8IG51bGwsIFNhbXBsaW5nU3RhdGVFdmVudFtdXSB7XG5cdFx0aWYgKG9wdGlvbnMucmVuZGVyTWluaW1hcCA9PT0gUmVuZGVyTWluaW1hcC5Ob25lIHx8ICFvcHRpb25zLmlzU2FtcGxpbmcpIHtcblx0XHRcdHJldHVybiBbbnVsbCwgW11dO1xuXHRcdH1cblxuXHRcdC8vIHJhdGlvIGlzIGludGVudGlvbmFsbHkgbm90IHBhcnQgb2YgdGhlIGxheW91dCB0byBhdm9pZCB0aGUgbGF5b3V0IGNoYW5naW5nIGFsbCB0aGUgdGltZVxuXHRcdC8vIHNvIHdlIG5lZWQgdG8gcmVjb21wdXRlIGl0IGFnYWluLi4uXG5cdFx0Y29uc3QgeyBtaW5pbWFwTGluZUNvdW50IH0gPSBFZGl0b3JMYXlvdXRJbmZvQ29tcHV0ZXIuY29tcHV0ZUNvbnRhaW5lZE1pbmltYXBMaW5lQ291bnQoe1xuXHRcdFx0dmlld0xpbmVDb3VudDogdmlld0xpbmVDb3VudCxcblx0XHRcdHNjcm9sbEJleW9uZExhc3RMaW5lOiBvcHRpb25zLnNjcm9sbEJleW9uZExhc3RMaW5lLFxuXHRcdFx0cGFkZGluZ1RvcDogb3B0aW9ucy5wYWRkaW5nVG9wLFxuXHRcdFx0cGFkZGluZ0JvdHRvbTogb3B0aW9ucy5wYWRkaW5nQm90dG9tLFxuXHRcdFx0aGVpZ2h0OiBvcHRpb25zLmVkaXRvckhlaWdodCxcblx0XHRcdGxpbmVIZWlnaHQ6IG9wdGlvbnMubGluZUhlaWdodCxcblx0XHRcdHBpeGVsUmF0aW86IG9wdGlvbnMucGl4ZWxSYXRpb1xuXHRcdH0pO1xuXHRcdGNvbnN0IHJhdGlvID0gdmlld0xpbmVDb3VudCAvIG1pbmltYXBMaW5lQ291bnQ7XG5cdFx0Y29uc3QgaGFsZlJhdGlvID0gcmF0aW8gLyAyO1xuXG5cdFx0aWYgKCFvbGRTYW1wbGluZ1N0YXRlIHx8IG9sZFNhbXBsaW5nU3RhdGUubWluaW1hcExpbmVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0cmVzdWx0WzBdID0gMTtcblx0XHRcdGlmIChtaW5pbWFwTGluZUNvdW50ID4gMSkge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMCwgbGFzdEluZGV4ID0gbWluaW1hcExpbmVDb3VudCAtIDE7IGkgPCBsYXN0SW5kZXg7IGkrKykge1xuXHRcdFx0XHRcdHJlc3VsdFtpXSA9IE1hdGgucm91bmQoaSAqIHJhdGlvICsgaGFsZlJhdGlvKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN1bHRbbWluaW1hcExpbmVDb3VudCAtIDFdID0gdmlld0xpbmVDb3VudDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBbbmV3IE1pbmltYXBTYW1wbGluZ1N0YXRlKHJhdGlvLCByZXN1bHQpLCBbXV07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb2xkTWluaW1hcExpbmVzID0gb2xkU2FtcGxpbmdTdGF0ZS5taW5pbWFwTGluZXM7XG5cdFx0Y29uc3Qgb2xkTGVuZ3RoID0gb2xkTWluaW1hcExpbmVzLmxlbmd0aDtcblx0XHRjb25zdCByZXN1bHQ6IG51bWJlcltdID0gW107XG5cdFx0bGV0IG9sZEluZGV4ID0gMDtcblx0XHRsZXQgb2xkRGVsdGFMaW5lQ291bnQgPSAwO1xuXHRcdGxldCBtaW5WaWV3TGluZU51bWJlciA9IDE7XG5cdFx0Y29uc3QgTUFYX0VWRU5UX0NPVU5UID0gMTA7IC8vIGdlbmVyYXRlIGF0IG1vc3QgMTAgZXZlbnRzLCBpZiB0aGVyZSBhcmUgbW9yZSB0aGFuIDEwIGNoYW5nZXMsIGp1c3QgZmx1c2ggYWxsIHByZXZpb3VzIGRhdGFcblx0XHRsZXQgZXZlbnRzOiBTYW1wbGluZ1N0YXRlRXZlbnRbXSA9IFtdO1xuXHRcdGxldCBsYXN0RXZlbnQ6IFNhbXBsaW5nU3RhdGVFdmVudCB8IG51bGwgPSBudWxsO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbWluaW1hcExpbmVDb3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCBmcm9tVmlld0xpbmVOdW1iZXIgPSBNYXRoLm1heChtaW5WaWV3TGluZU51bWJlciwgTWF0aC5yb3VuZChpICogcmF0aW8pKTtcblx0XHRcdGNvbnN0IHRvVmlld0xpbmVOdW1iZXIgPSBNYXRoLm1heChmcm9tVmlld0xpbmVOdW1iZXIsIE1hdGgucm91bmQoKGkgKyAxKSAqIHJhdGlvKSk7XG5cblx0XHRcdHdoaWxlIChvbGRJbmRleCA8IG9sZExlbmd0aCAmJiBvbGRNaW5pbWFwTGluZXNbb2xkSW5kZXhdIDwgZnJvbVZpZXdMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGlmIChldmVudHMubGVuZ3RoIDwgTUFYX0VWRU5UX0NPVU5UKSB7XG5cdFx0XHRcdFx0Y29uc3Qgb2xkTWluaW1hcExpbmVOdW1iZXIgPSBvbGRJbmRleCArIDEgKyBvbGREZWx0YUxpbmVDb3VudDtcblx0XHRcdFx0XHRpZiAobGFzdEV2ZW50ICYmIGxhc3RFdmVudC50eXBlID09PSAnZGVsZXRlZCcgJiYgbGFzdEV2ZW50Ll9vbGRJbmRleCA9PT0gb2xkSW5kZXggLSAxKSB7XG5cdFx0XHRcdFx0XHRsYXN0RXZlbnQuZGVsZXRlVG9MaW5lTnVtYmVyKys7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGxhc3RFdmVudCA9IHsgdHlwZTogJ2RlbGV0ZWQnLCBfb2xkSW5kZXg6IG9sZEluZGV4LCBkZWxldGVGcm9tTGluZU51bWJlcjogb2xkTWluaW1hcExpbmVOdW1iZXIsIGRlbGV0ZVRvTGluZU51bWJlcjogb2xkTWluaW1hcExpbmVOdW1iZXIgfTtcblx0XHRcdFx0XHRcdGV2ZW50cy5wdXNoKGxhc3RFdmVudCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdG9sZERlbHRhTGluZUNvdW50LS07XG5cdFx0XHRcdH1cblx0XHRcdFx0b2xkSW5kZXgrKztcblx0XHRcdH1cblxuXHRcdFx0bGV0IHNlbGVjdGVkVmlld0xpbmVOdW1iZXI6IG51bWJlcjtcblx0XHRcdGlmIChvbGRJbmRleCA8IG9sZExlbmd0aCAmJiBvbGRNaW5pbWFwTGluZXNbb2xkSW5kZXhdIDw9IHRvVmlld0xpbmVOdW1iZXIpIHtcblx0XHRcdFx0Ly8gcmV1c2UgdGhlIG9sZCBzYW1wbGVkIGxpbmVcblx0XHRcdFx0c2VsZWN0ZWRWaWV3TGluZU51bWJlciA9IG9sZE1pbmltYXBMaW5lc1tvbGRJbmRleF07XG5cdFx0XHRcdG9sZEluZGV4Kys7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoaSA9PT0gMCkge1xuXHRcdFx0XHRcdHNlbGVjdGVkVmlld0xpbmVOdW1iZXIgPSAxO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGkgKyAxID09PSBtaW5pbWFwTGluZUNvdW50KSB7XG5cdFx0XHRcdFx0c2VsZWN0ZWRWaWV3TGluZU51bWJlciA9IHZpZXdMaW5lQ291bnQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2VsZWN0ZWRWaWV3TGluZU51bWJlciA9IE1hdGgucm91bmQoaSAqIHJhdGlvICsgaGFsZlJhdGlvKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXZlbnRzLmxlbmd0aCA8IE1BWF9FVkVOVF9DT1VOVCkge1xuXHRcdFx0XHRcdGNvbnN0IG9sZE1pbmltYXBMaW5lTnVtYmVyID0gb2xkSW5kZXggKyAxICsgb2xkRGVsdGFMaW5lQ291bnQ7XG5cdFx0XHRcdFx0aWYgKGxhc3RFdmVudCAmJiBsYXN0RXZlbnQudHlwZSA9PT0gJ2luc2VydGVkJyAmJiBsYXN0RXZlbnQuX2kgPT09IGkgLSAxKSB7XG5cdFx0XHRcdFx0XHRsYXN0RXZlbnQuaW5zZXJ0VG9MaW5lTnVtYmVyKys7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGxhc3RFdmVudCA9IHsgdHlwZTogJ2luc2VydGVkJywgX2k6IGksIGluc2VydEZyb21MaW5lTnVtYmVyOiBvbGRNaW5pbWFwTGluZU51bWJlciwgaW5zZXJ0VG9MaW5lTnVtYmVyOiBvbGRNaW5pbWFwTGluZU51bWJlciB9O1xuXHRcdFx0XHRcdFx0ZXZlbnRzLnB1c2gobGFzdEV2ZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0b2xkRGVsdGFMaW5lQ291bnQrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHRbaV0gPSBzZWxlY3RlZFZpZXdMaW5lTnVtYmVyO1xuXHRcdFx0bWluVmlld0xpbmVOdW1iZXIgPSBzZWxlY3RlZFZpZXdMaW5lTnVtYmVyO1xuXHRcdH1cblxuXHRcdGlmIChldmVudHMubGVuZ3RoIDwgTUFYX0VWRU5UX0NPVU5UKSB7XG5cdFx0XHR3aGlsZSAob2xkSW5kZXggPCBvbGRMZW5ndGgpIHtcblx0XHRcdFx0Y29uc3Qgb2xkTWluaW1hcExpbmVOdW1iZXIgPSBvbGRJbmRleCArIDEgKyBvbGREZWx0YUxpbmVDb3VudDtcblx0XHRcdFx0aWYgKGxhc3RFdmVudCAmJiBsYXN0RXZlbnQudHlwZSA9PT0gJ2RlbGV0ZWQnICYmIGxhc3RFdmVudC5fb2xkSW5kZXggPT09IG9sZEluZGV4IC0gMSkge1xuXHRcdFx0XHRcdGxhc3RFdmVudC5kZWxldGVUb0xpbmVOdW1iZXIrKztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsYXN0RXZlbnQgPSB7IHR5cGU6ICdkZWxldGVkJywgX29sZEluZGV4OiBvbGRJbmRleCwgZGVsZXRlRnJvbUxpbmVOdW1iZXI6IG9sZE1pbmltYXBMaW5lTnVtYmVyLCBkZWxldGVUb0xpbmVOdW1iZXI6IG9sZE1pbmltYXBMaW5lTnVtYmVyIH07XG5cdFx0XHRcdFx0ZXZlbnRzLnB1c2gobGFzdEV2ZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvbGREZWx0YUxpbmVDb3VudC0tO1xuXHRcdFx0XHRvbGRJbmRleCsrO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyB0b28gbWFueSBldmVudHMsIGp1c3QgZ2l2ZSB1cFxuXHRcdFx0ZXZlbnRzID0gW3sgdHlwZTogJ2ZsdXNoJyB9XTtcblx0XHR9XG5cblx0XHRyZXR1cm4gW25ldyBNaW5pbWFwU2FtcGxpbmdTdGF0ZShyYXRpbywgcmVzdWx0KSwgZXZlbnRzXTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBzYW1wbGluZ1JhdGlvOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IG1pbmltYXBMaW5lczogbnVtYmVyW11cdC8vIGEgbWFwIG9mIDAtYmFzZWQgbWluaW1hcCBsaW5lIGluZGV4ZXMgdG8gMS1iYXNlZCB2aWV3IGxpbmUgbnVtYmVyc1xuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyBtb2RlbExpbmVUb01pbmltYXBMaW5lKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIE1hdGgubWluKHRoaXMubWluaW1hcExpbmVzLmxlbmd0aCwgTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChsaW5lTnVtYmVyIC8gdGhpcy5zYW1wbGluZ1JhdGlvKSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdpbGwgcmV0dXJuIG51bGwgaWYgdGhlIG1vZGVsIGxpbmUgcmFuZ2VzIGFyZSBub3QgaW50ZXJzZWN0aW5nIHdpdGggYSBzYW1wbGVkIG1vZGVsIGxpbmUuXG5cdCAqL1xuXHRwdWJsaWMgbW9kZWxMaW5lUmFuZ2VUb01pbmltYXBMaW5lUmFuZ2UoZnJvbUxpbmVOdW1iZXI6IG51bWJlciwgdG9MaW5lTnVtYmVyOiBudW1iZXIpOiBbbnVtYmVyLCBudW1iZXJdIHwgbnVsbCB7XG5cdFx0bGV0IGZyb21MaW5lSW5kZXggPSB0aGlzLm1vZGVsTGluZVRvTWluaW1hcExpbmUoZnJvbUxpbmVOdW1iZXIpIC0gMTtcblx0XHR3aGlsZSAoZnJvbUxpbmVJbmRleCA+IDAgJiYgdGhpcy5taW5pbWFwTGluZXNbZnJvbUxpbmVJbmRleCAtIDFdID49IGZyb21MaW5lTnVtYmVyKSB7XG5cdFx0XHRmcm9tTGluZUluZGV4LS07XG5cdFx0fVxuXHRcdGxldCB0b0xpbmVJbmRleCA9IHRoaXMubW9kZWxMaW5lVG9NaW5pbWFwTGluZSh0b0xpbmVOdW1iZXIpIC0gMTtcblx0XHR3aGlsZSAodG9MaW5lSW5kZXggKyAxIDwgdGhpcy5taW5pbWFwTGluZXMubGVuZ3RoICYmIHRoaXMubWluaW1hcExpbmVzW3RvTGluZUluZGV4ICsgMV0gPD0gdG9MaW5lTnVtYmVyKSB7XG5cdFx0XHR0b0xpbmVJbmRleCsrO1xuXHRcdH1cblx0XHRpZiAoZnJvbUxpbmVJbmRleCA9PT0gdG9MaW5lSW5kZXgpIHtcblx0XHRcdGNvbnN0IHNhbXBsZWRMaW5lTnVtYmVyID0gdGhpcy5taW5pbWFwTGluZXNbZnJvbUxpbmVJbmRleF07XG5cdFx0XHRpZiAoc2FtcGxlZExpbmVOdW1iZXIgPCBmcm9tTGluZU51bWJlciB8fCBzYW1wbGVkTGluZU51bWJlciA+IHRvTGluZU51bWJlcikge1xuXHRcdFx0XHQvLyBUaGlzIGxpbmUgaXMgbm90IHBhcnQgb2YgdGhlIHNhbXBsZWQgbGluZXMgPT0+IG5vdGhpbmcgdG8gZG9cblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbZnJvbUxpbmVJbmRleCArIDEsIHRvTGluZUluZGV4ICsgMV07XG5cdH1cblxuXHQvKipcblx0ICogV2lsbCBhbHdheXMgcmV0dXJuIGEgcmFuZ2UsIGV2ZW4gaWYgaXQgaXMgbm90IGludGVyc2VjdGluZyB3aXRoIGEgc2FtcGxlZCBtb2RlbCBsaW5lLlxuXHQgKi9cblx0cHVibGljIGRlY29yYXRpb25MaW5lUmFuZ2VUb01pbmltYXBMaW5lUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlcik6IFtudW1iZXIsIG51bWJlcl0ge1xuXHRcdGxldCBtaW5pbWFwTGluZVN0YXJ0ID0gdGhpcy5tb2RlbExpbmVUb01pbmltYXBMaW5lKHN0YXJ0TGluZU51bWJlcik7XG5cdFx0bGV0IG1pbmltYXBMaW5lRW5kID0gdGhpcy5tb2RlbExpbmVUb01pbmltYXBMaW5lKGVuZExpbmVOdW1iZXIpO1xuXHRcdGlmIChzdGFydExpbmVOdW1iZXIgIT09IGVuZExpbmVOdW1iZXIgJiYgbWluaW1hcExpbmVFbmQgPT09IG1pbmltYXBMaW5lU3RhcnQpIHtcblx0XHRcdGlmIChtaW5pbWFwTGluZUVuZCA9PT0gdGhpcy5taW5pbWFwTGluZXMubGVuZ3RoKSB7XG5cdFx0XHRcdGlmIChtaW5pbWFwTGluZVN0YXJ0ID4gMSkge1xuXHRcdFx0XHRcdG1pbmltYXBMaW5lU3RhcnQtLTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWluaW1hcExpbmVFbmQrKztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFttaW5pbWFwTGluZVN0YXJ0LCBtaW5pbWFwTGluZUVuZF07XG5cdH1cblxuXHRwdWJsaWMgb25MaW5lc0RlbGV0ZWQoZTogdmlld0V2ZW50cy5WaWV3TGluZXNEZWxldGVkRXZlbnQpOiBbbnVtYmVyLCBudW1iZXJdIHtcblx0XHQvLyBoYXZlIHRoZSBtYXBwaW5nIGJlIHN0aWNreVxuXHRcdGNvbnN0IGRlbGV0ZWRMaW5lQ291bnQgPSBlLnRvTGluZU51bWJlciAtIGUuZnJvbUxpbmVOdW1iZXIgKyAxO1xuXHRcdGxldCBjaGFuZ2VTdGFydEluZGV4ID0gdGhpcy5taW5pbWFwTGluZXMubGVuZ3RoO1xuXHRcdGxldCBjaGFuZ2VFbmRJbmRleCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IHRoaXMubWluaW1hcExpbmVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRpZiAodGhpcy5taW5pbWFwTGluZXNbaV0gPCBlLmZyb21MaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMubWluaW1hcExpbmVzW2ldIDw9IGUudG9MaW5lTnVtYmVyKSB7XG5cdFx0XHRcdC8vIHRoaXMgbGluZSBnb3QgZGVsZXRlZCA9PiBtb3ZlIHRvIHByZXZpb3VzIGF2YWlsYWJsZVxuXHRcdFx0XHR0aGlzLm1pbmltYXBMaW5lc1tpXSA9IE1hdGgubWF4KDEsIGUuZnJvbUxpbmVOdW1iZXIgLSAxKTtcblx0XHRcdFx0Y2hhbmdlU3RhcnRJbmRleCA9IE1hdGgubWluKGNoYW5nZVN0YXJ0SW5kZXgsIGkpO1xuXHRcdFx0XHRjaGFuZ2VFbmRJbmRleCA9IE1hdGgubWF4KGNoYW5nZUVuZEluZGV4LCBpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubWluaW1hcExpbmVzW2ldIC09IGRlbGV0ZWRMaW5lQ291bnQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbY2hhbmdlU3RhcnRJbmRleCwgY2hhbmdlRW5kSW5kZXhdO1xuXHR9XG5cblx0cHVibGljIG9uTGluZXNJbnNlcnRlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0luc2VydGVkRXZlbnQpOiB2b2lkIHtcblx0XHQvLyBoYXZlIHRoZSBtYXBwaW5nIGJlIHN0aWNreVxuXHRcdGNvbnN0IGluc2VydGVkTGluZUNvdW50ID0gZS50b0xpbmVOdW1iZXIgLSBlLmZyb21MaW5lTnVtYmVyICsgMTtcblx0XHRmb3IgKGxldCBpID0gdGhpcy5taW5pbWFwTGluZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGlmICh0aGlzLm1pbmltYXBMaW5lc1tpXSA8IGUuZnJvbUxpbmVOdW1iZXIpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm1pbmltYXBMaW5lc1tpXSArPSBpbnNlcnRlZExpbmVDb3VudDtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBUaGUgbWluaW1hcCBhcHBlYXJzIGJlc2lkZSB0aGUgZWRpdG9yIHNjcm9sbCBiYXIgYW5kIHZpc3VhbGl6ZXMgYSB6b29tZWQgb3V0XG4gKiB2aWV3IG9mIHRoZSBmaWxlLlxuICovXG5leHBvcnQgY2xhc3MgTWluaW1hcCBleHRlbmRzIFZpZXdQYXJ0IGltcGxlbWVudHMgSU1pbmltYXBNb2RlbCB7XG5cblx0cHVibGljIHJlYWRvbmx5IHRva2Vuc0NvbG9yVHJhY2tlcjogTWluaW1hcFRva2Vuc0NvbG9yVHJhY2tlcjtcblxuXHRwcml2YXRlIF9zZWxlY3Rpb25zOiBTZWxlY3Rpb25bXTtcblx0cHJpdmF0ZSBfbWluaW1hcFNlbGVjdGlvbnM6IFNlbGVjdGlvbltdIHwgbnVsbDtcblxuXHRwdWJsaWMgb3B0aW9uczogTWluaW1hcE9wdGlvbnM7XG5cblx0cHJpdmF0ZSBfc2FtcGxpbmdTdGF0ZTogTWluaW1hcFNhbXBsaW5nU3RhdGUgfCBudWxsO1xuXHRwcml2YXRlIF9zaG91bGRDaGVja1NhbXBsaW5nOiBib29sZWFuO1xuXG5cdHByaXZhdGUgX3NlY3Rpb25IZWFkZXJDYWNoZSA9IG5ldyBMUlVDYWNoZTxzdHJpbmcsIHN0cmluZz4oMTAsIDEuNSk7XG5cblx0cHJpdmF0ZSBfYWN0dWFsOiBJbm5lck1pbmltYXA7XG5cblx0Y29uc3RydWN0b3IoY29udGV4dDogVmlld0NvbnRleHQpIHtcblx0XHRzdXBlcihjb250ZXh0KTtcblxuXHRcdHRoaXMudG9rZW5zQ29sb3JUcmFja2VyID0gTWluaW1hcFRva2Vuc0NvbG9yVHJhY2tlci5nZXRJbnN0YW5jZSgpO1xuXG5cdFx0dGhpcy5fc2VsZWN0aW9ucyA9IFtdO1xuXHRcdHRoaXMuX21pbmltYXBTZWxlY3Rpb25zID0gbnVsbDtcblxuXHRcdHRoaXMub3B0aW9ucyA9IG5ldyBNaW5pbWFwT3B0aW9ucyh0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24sIHRoaXMuX2NvbnRleHQudGhlbWUsIHRoaXMudG9rZW5zQ29sb3JUcmFja2VyKTtcblx0XHRjb25zdCBbc2FtcGxpbmdTdGF0ZSxdID0gTWluaW1hcFNhbXBsaW5nU3RhdGUuY29tcHV0ZSh0aGlzLm9wdGlvbnMsIHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdldExpbmVDb3VudCgpLCBudWxsKTtcblx0XHR0aGlzLl9zYW1wbGluZ1N0YXRlID0gc2FtcGxpbmdTdGF0ZTtcblx0XHR0aGlzLl9zaG91bGRDaGVja1NhbXBsaW5nID0gZmFsc2U7XG5cblx0XHR0aGlzLl9hY3R1YWwgPSBuZXcgSW5uZXJNaW5pbWFwKGNvbnRleHQudGhlbWUsIHRoaXMpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0dWFsLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RG9tTm9kZSgpOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9hY3R1YWwuZ2V0RG9tTm9kZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25PcHRpb25zTWF5YmVDaGFuZ2VkKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG9wdHMgPSBuZXcgTWluaW1hcE9wdGlvbnModGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLCB0aGlzLl9jb250ZXh0LnRoZW1lLCB0aGlzLnRva2Vuc0NvbG9yVHJhY2tlcik7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5lcXVhbHMob3B0cykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5vcHRpb25zID0gb3B0cztcblx0XHR0aGlzLl9yZWNyZWF0ZUxpbmVTYW1wbGluZygpO1xuXHRcdHRoaXMuX2FjdHVhbC5vbkRpZENoYW5nZU9wdGlvbnMoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8vIC0tLS0gYmVnaW4gdmlldyBldmVudCBoYW5kbGVyc1xuXG5cdHB1YmxpYyBvdmVycmlkZSBvbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0NvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fb25PcHRpb25zTWF5YmVDaGFuZ2VkKCk7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uQ3Vyc29yU3RhdGVDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0N1cnNvclN0YXRlQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fc2VsZWN0aW9ucyA9IGUuc2VsZWN0aW9ucztcblx0XHR0aGlzLl9taW5pbWFwU2VsZWN0aW9ucyA9IG51bGw7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbC5vblNlbGVjdGlvbkNoYW5nZWQoKTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25EZWNvcmF0aW9uc0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3RGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRpZiAoZS5hZmZlY3RzTWluaW1hcCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FjdHVhbC5vbkRlY29yYXRpb25zQ2hhbmdlZCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uRmx1c2hlZChlOiB2aWV3RXZlbnRzLlZpZXdGbHVzaGVkRXZlbnQpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fc2FtcGxpbmdTdGF0ZSkge1xuXHRcdFx0dGhpcy5fc2hvdWxkQ2hlY2tTYW1wbGluZyA9IHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9hY3R1YWwub25GbHVzaGVkKCk7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uTGluZXNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX3NhbXBsaW5nU3RhdGUpIHtcblx0XHRcdGNvbnN0IG1pbmltYXBMaW5lUmFuZ2UgPSB0aGlzLl9zYW1wbGluZ1N0YXRlLm1vZGVsTGluZVJhbmdlVG9NaW5pbWFwTGluZVJhbmdlKGUuZnJvbUxpbmVOdW1iZXIsIGUuZnJvbUxpbmVOdW1iZXIgKyBlLmNvdW50IC0gMSk7XG5cdFx0XHRpZiAobWluaW1hcExpbmVSYW5nZSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsLm9uTGluZXNDaGFuZ2VkKG1pbmltYXBMaW5lUmFuZ2VbMF0sIG1pbmltYXBMaW5lUmFuZ2VbMV0gLSBtaW5pbWFwTGluZVJhbmdlWzBdICsgMSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9hY3R1YWwub25MaW5lc0NoYW5nZWQoZS5mcm9tTGluZU51bWJlciwgZS5jb3VudCk7XG5cdFx0fVxuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVzRGVsZXRlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0RlbGV0ZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9zYW1wbGluZ1N0YXRlKSB7XG5cdFx0XHRjb25zdCBbY2hhbmdlU3RhcnRJbmRleCwgY2hhbmdlRW5kSW5kZXhdID0gdGhpcy5fc2FtcGxpbmdTdGF0ZS5vbkxpbmVzRGVsZXRlZChlKTtcblx0XHRcdGlmIChjaGFuZ2VTdGFydEluZGV4IDw9IGNoYW5nZUVuZEluZGV4KSB7XG5cdFx0XHRcdHRoaXMuX2FjdHVhbC5vbkxpbmVzQ2hhbmdlZChjaGFuZ2VTdGFydEluZGV4ICsgMSwgY2hhbmdlRW5kSW5kZXggLSBjaGFuZ2VTdGFydEluZGV4ICsgMSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zaG91bGRDaGVja1NhbXBsaW5nID0gdHJ1ZTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsLm9uTGluZXNEZWxldGVkKGUuZnJvbUxpbmVOdW1iZXIsIGUudG9MaW5lTnVtYmVyKTtcblx0XHR9XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uTGluZXNJbnNlcnRlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0luc2VydGVkRXZlbnQpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fc2FtcGxpbmdTdGF0ZSkge1xuXHRcdFx0dGhpcy5fc2FtcGxpbmdTdGF0ZS5vbkxpbmVzSW5zZXJ0ZWQoZSk7XG5cdFx0XHR0aGlzLl9zaG91bGRDaGVja1NhbXBsaW5nID0gdHJ1ZTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsLm9uTGluZXNJbnNlcnRlZChlLmZyb21MaW5lTnVtYmVyLCBlLnRvTGluZU51bWJlcik7XG5cdFx0fVxuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvblNjcm9sbENoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3U2Nyb2xsQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbC5vblNjcm9sbENoYW5nZWQoZSk7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uVGhlbWVDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1RoZW1lQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fYWN0dWFsLm9uVGhlbWVDaGFuZ2VkKCk7XG5cdFx0dGhpcy5fb25PcHRpb25zTWF5YmVDaGFuZ2VkKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uVG9rZW5zQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdUb2tlbnNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fc2FtcGxpbmdTdGF0ZSkge1xuXHRcdFx0Y29uc3QgcmFuZ2VzOiB7IGZyb21MaW5lTnVtYmVyOiBudW1iZXI7IHRvTGluZU51bWJlcjogbnVtYmVyIH1bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCByYW5nZSBvZiBlLnJhbmdlcykge1xuXHRcdFx0XHRjb25zdCBtaW5pbWFwTGluZVJhbmdlID0gdGhpcy5fc2FtcGxpbmdTdGF0ZS5tb2RlbExpbmVSYW5nZVRvTWluaW1hcExpbmVSYW5nZShyYW5nZS5mcm9tTGluZU51bWJlciwgcmFuZ2UudG9MaW5lTnVtYmVyKTtcblx0XHRcdFx0aWYgKG1pbmltYXBMaW5lUmFuZ2UpIHtcblx0XHRcdFx0XHRyYW5nZXMucHVzaCh7IGZyb21MaW5lTnVtYmVyOiBtaW5pbWFwTGluZVJhbmdlWzBdLCB0b0xpbmVOdW1iZXI6IG1pbmltYXBMaW5lUmFuZ2VbMV0gfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChyYW5nZXMubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9hY3R1YWwub25Ub2tlbnNDaGFuZ2VkKHJhbmdlcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9hY3R1YWwub25Ub2tlbnNDaGFuZ2VkKGUucmFuZ2VzKTtcblx0XHR9XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uVG9rZW5zQ29sb3JzQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdUb2tlbnNDb2xvcnNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHR0aGlzLl9vbk9wdGlvbnNNYXliZUNoYW5nZWQoKTtcblx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsLm9uVG9rZW5zQ29sb3JzQ2hhbmdlZCgpO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvblpvbmVzQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdab25lc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9hY3R1YWwub25ab25lc0NoYW5nZWQoKTtcblx0fVxuXG5cdC8vIC0tLSBlbmQgZXZlbnQgaGFuZGxlcnNcblxuXHRwdWJsaWMgcHJlcGFyZVJlbmRlcihjdHg6IFJlbmRlcmluZ0NvbnRleHQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2hvdWxkQ2hlY2tTYW1wbGluZykge1xuXHRcdFx0dGhpcy5fc2hvdWxkQ2hlY2tTYW1wbGluZyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fcmVjcmVhdGVMaW5lU2FtcGxpbmcoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyKGN0eDogUmVzdHJpY3RlZFJlbmRlcmluZ0NvbnRleHQpOiB2b2lkIHtcblx0XHRsZXQgdmlld3BvcnRTdGFydExpbmVOdW1iZXIgPSBjdHgudmlzaWJsZVJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRsZXQgdmlld3BvcnRFbmRMaW5lTnVtYmVyID0gY3R4LnZpc2libGVSYW5nZS5lbmRMaW5lTnVtYmVyO1xuXG5cdFx0aWYgKHRoaXMuX3NhbXBsaW5nU3RhdGUpIHtcblx0XHRcdHZpZXdwb3J0U3RhcnRMaW5lTnVtYmVyID0gdGhpcy5fc2FtcGxpbmdTdGF0ZS5tb2RlbExpbmVUb01pbmltYXBMaW5lKHZpZXdwb3J0U3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdHZpZXdwb3J0RW5kTGluZU51bWJlciA9IHRoaXMuX3NhbXBsaW5nU3RhdGUubW9kZWxMaW5lVG9NaW5pbWFwTGluZSh2aWV3cG9ydEVuZExpbmVOdW1iZXIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1pbmltYXBDdHg6IElNaW5pbWFwUmVuZGVyaW5nQ29udGV4dCA9IHtcblx0XHRcdHZpZXdwb3J0Q29udGFpbnNXaGl0ZXNwYWNlR2FwczogKGN0eC52aWV3cG9ydERhdGEud2hpdGVzcGFjZVZpZXdwb3J0RGF0YS5sZW5ndGggPiAwKSxcblxuXHRcdFx0c2Nyb2xsV2lkdGg6IGN0eC5zY3JvbGxXaWR0aCxcblx0XHRcdHNjcm9sbEhlaWdodDogY3R4LnNjcm9sbEhlaWdodCxcblxuXHRcdFx0dmlld3BvcnRTdGFydExpbmVOdW1iZXI6IHZpZXdwb3J0U3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0dmlld3BvcnRFbmRMaW5lTnVtYmVyOiB2aWV3cG9ydEVuZExpbmVOdW1iZXIsXG5cdFx0XHR2aWV3cG9ydFN0YXJ0TGluZU51bWJlclZlcnRpY2FsT2Zmc2V0OiBjdHguZ2V0VmVydGljYWxPZmZzZXRGb3JMaW5lTnVtYmVyKHZpZXdwb3J0U3RhcnRMaW5lTnVtYmVyKSxcblxuXHRcdFx0c2Nyb2xsVG9wOiBjdHguc2Nyb2xsVG9wLFxuXHRcdFx0c2Nyb2xsTGVmdDogY3R4LnNjcm9sbExlZnQsXG5cblx0XHRcdHZpZXdwb3J0V2lkdGg6IGN0eC52aWV3cG9ydFdpZHRoLFxuXHRcdFx0dmlld3BvcnRIZWlnaHQ6IGN0eC52aWV3cG9ydEhlaWdodCxcblx0XHR9O1xuXHRcdHRoaXMuX2FjdHVhbC5yZW5kZXIobWluaW1hcEN0eCk7XG5cdH1cblxuXHQvLyNyZWdpb24gSU1pbmltYXBNb2RlbFxuXG5cdHByaXZhdGUgX3JlY3JlYXRlTGluZVNhbXBsaW5nKCk6IHZvaWQge1xuXHRcdHRoaXMuX21pbmltYXBTZWxlY3Rpb25zID0gbnVsbDtcblxuXHRcdGNvbnN0IHdhc1NhbXBsaW5nID0gQm9vbGVhbih0aGlzLl9zYW1wbGluZ1N0YXRlKTtcblx0XHRjb25zdCBbc2FtcGxpbmdTdGF0ZSwgZXZlbnRzXSA9IE1pbmltYXBTYW1wbGluZ1N0YXRlLmNvbXB1dGUodGhpcy5vcHRpb25zLCB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSwgdGhpcy5fc2FtcGxpbmdTdGF0ZSk7XG5cdFx0dGhpcy5fc2FtcGxpbmdTdGF0ZSA9IHNhbXBsaW5nU3RhdGU7XG5cblx0XHRpZiAod2FzU2FtcGxpbmcgJiYgdGhpcy5fc2FtcGxpbmdTdGF0ZSkge1xuXHRcdFx0Ly8gd2FzIHNhbXBsaW5nLCBpcyBzYW1wbGluZ1xuXHRcdFx0Zm9yIChjb25zdCBldmVudCBvZiBldmVudHMpIHtcblx0XHRcdFx0c3dpdGNoIChldmVudC50eXBlKSB7XG5cdFx0XHRcdFx0Y2FzZSAnZGVsZXRlZCc6XG5cdFx0XHRcdFx0XHR0aGlzLl9hY3R1YWwub25MaW5lc0RlbGV0ZWQoZXZlbnQuZGVsZXRlRnJvbUxpbmVOdW1iZXIsIGV2ZW50LmRlbGV0ZVRvTGluZU51bWJlcik7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdpbnNlcnRlZCc6XG5cdFx0XHRcdFx0XHR0aGlzLl9hY3R1YWwub25MaW5lc0luc2VydGVkKGV2ZW50Lmluc2VydEZyb21MaW5lTnVtYmVyLCBldmVudC5pbnNlcnRUb0xpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnZmx1c2gnOlxuXHRcdFx0XHRcdFx0dGhpcy5fYWN0dWFsLm9uRmx1c2hlZCgpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUNvdW50KCk6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuX3NhbXBsaW5nU3RhdGUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9zYW1wbGluZ1N0YXRlLm1pbmltYXBMaW5lcy5sZW5ndGg7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRSZWFsTGluZUNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdldExpbmVDb3VudCgpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVDb250ZW50KGxpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuX3NhbXBsaW5nU3RhdGUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nZXRMaW5lQ29udGVudCh0aGlzLl9zYW1wbGluZ1N0YXRlLm1pbmltYXBMaW5lc1tsaW5lTnVtYmVyIC0gMV0pO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9zYW1wbGluZ1N0YXRlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbih0aGlzLl9zYW1wbGluZ1N0YXRlLm1pbmltYXBMaW5lc1tsaW5lTnVtYmVyIC0gMV0pO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRNaW5pbWFwTGluZXNSZW5kZXJpbmdEYXRhKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIG5lZWRlZDogYm9vbGVhbltdKTogKFZpZXdMaW5lRGF0YSB8IG51bGwpW10ge1xuXHRcdGlmICh0aGlzLl9zYW1wbGluZ1N0YXRlKSB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IChWaWV3TGluZURhdGEgfCBudWxsKVtdID0gW107XG5cdFx0XHRmb3IgKGxldCBsaW5lSW5kZXggPSAwLCBsaW5lQ291bnQgPSBlbmRMaW5lTnVtYmVyIC0gc3RhcnRMaW5lTnVtYmVyICsgMTsgbGluZUluZGV4IDwgbGluZUNvdW50OyBsaW5lSW5kZXgrKykge1xuXHRcdFx0XHRpZiAobmVlZGVkW2xpbmVJbmRleF0pIHtcblx0XHRcdFx0XHRyZXN1bHRbbGluZUluZGV4XSA9IHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdldFZpZXdMaW5lRGF0YSh0aGlzLl9zYW1wbGluZ1N0YXRlLm1pbmltYXBMaW5lc1tzdGFydExpbmVOdW1iZXIgKyBsaW5lSW5kZXggLSAxXSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0W2xpbmVJbmRleF0gPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TWluaW1hcExpbmVzUmVuZGVyaW5nRGF0YShzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXIsIG5lZWRlZCkuZGF0YTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTZWxlY3Rpb25zKCk6IFNlbGVjdGlvbltdIHtcblx0XHRpZiAodGhpcy5fbWluaW1hcFNlbGVjdGlvbnMgPT09IG51bGwpIHtcblx0XHRcdGlmICh0aGlzLl9zYW1wbGluZ1N0YXRlKSB7XG5cdFx0XHRcdHRoaXMuX21pbmltYXBTZWxlY3Rpb25zID0gW107XG5cdFx0XHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIHRoaXMuX3NlbGVjdGlvbnMpIHtcblx0XHRcdFx0XHRjb25zdCBbbWluaW1hcExpbmVTdGFydCwgbWluaW1hcExpbmVFbmRdID0gdGhpcy5fc2FtcGxpbmdTdGF0ZS5kZWNvcmF0aW9uTGluZVJhbmdlVG9NaW5pbWFwTGluZVJhbmdlKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyKTtcblx0XHRcdFx0XHR0aGlzLl9taW5pbWFwU2VsZWN0aW9ucy5wdXNoKG5ldyBTZWxlY3Rpb24obWluaW1hcExpbmVTdGFydCwgc2VsZWN0aW9uLnN0YXJ0Q29sdW1uLCBtaW5pbWFwTGluZUVuZCwgc2VsZWN0aW9uLmVuZENvbHVtbikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9taW5pbWFwU2VsZWN0aW9ucyA9IHRoaXMuX3NlbGVjdGlvbnM7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9taW5pbWFwU2VsZWN0aW9ucztcblx0fVxuXG5cdHB1YmxpYyBnZXRNaW5pbWFwRGVjb3JhdGlvbnNJblZpZXdwb3J0KHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIpOiBWaWV3TW9kZWxEZWNvcmF0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRNaW5pbWFwRGVjb3JhdGlvbnNJblZpZXdwb3J0KHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlcilcblx0XHRcdC5maWx0ZXIoZGVjb3JhdGlvbiA9PiAhZGVjb3JhdGlvbi5vcHRpb25zLm1pbmltYXA/LnNlY3Rpb25IZWFkZXJTdHlsZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2VjdGlvbkhlYWRlckRlY29yYXRpb25zSW5WaWV3cG9ydChzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyKTogVmlld01vZGVsRGVjb3JhdGlvbltdIHtcblx0XHRjb25zdCBoZWFkZXJIZWlnaHRJbk1pbmltYXBMaW5lcyA9IHRoaXMub3B0aW9ucy5zZWN0aW9uSGVhZGVyRm9udFNpemUgLyB0aGlzLm9wdGlvbnMubWluaW1hcExpbmVIZWlnaHQ7XG5cdFx0c3RhcnRMaW5lTnVtYmVyID0gTWF0aC5mbG9vcihNYXRoLm1heCgxLCBzdGFydExpbmVOdW1iZXIgLSBoZWFkZXJIZWlnaHRJbk1pbmltYXBMaW5lcykpO1xuXHRcdHJldHVybiB0aGlzLl9nZXRNaW5pbWFwRGVjb3JhdGlvbnNJblZpZXdwb3J0KHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlcilcblx0XHRcdC5maWx0ZXIoZGVjb3JhdGlvbiA9PiAhIWRlY29yYXRpb24ub3B0aW9ucy5taW5pbWFwPy5zZWN0aW9uSGVhZGVyU3R5bGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TWluaW1hcERlY29yYXRpb25zSW5WaWV3cG9ydChzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyKSB7XG5cdFx0bGV0IHZpc2libGVSYW5nZTogUmFuZ2U7XG5cdFx0aWYgKHRoaXMuX3NhbXBsaW5nU3RhdGUpIHtcblx0XHRcdGNvbnN0IG1vZGVsU3RhcnRMaW5lTnVtYmVyID0gdGhpcy5fc2FtcGxpbmdTdGF0ZS5taW5pbWFwTGluZXNbc3RhcnRMaW5lTnVtYmVyIC0gMV07XG5cdFx0XHRjb25zdCBtb2RlbEVuZExpbmVOdW1iZXIgPSB0aGlzLl9zYW1wbGluZ1N0YXRlLm1pbmltYXBMaW5lc1tlbmRMaW5lTnVtYmVyIC0gMV07XG5cdFx0XHR2aXNpYmxlUmFuZ2UgPSBuZXcgUmFuZ2UobW9kZWxTdGFydExpbmVOdW1iZXIsIDEsIG1vZGVsRW5kTGluZU51bWJlciwgdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbihtb2RlbEVuZExpbmVOdW1iZXIpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmlzaWJsZVJhbmdlID0gbmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgMSwgZW5kTGluZU51bWJlciwgdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbihlbmRMaW5lTnVtYmVyKSk7XG5cdFx0fVxuXHRcdGNvbnN0IGRlY29yYXRpb25zID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TWluaW1hcERlY29yYXRpb25zSW5SYW5nZSh2aXNpYmxlUmFuZ2UpO1xuXG5cdFx0aWYgKHRoaXMuX3NhbXBsaW5nU3RhdGUpIHtcblx0XHRcdGNvbnN0IHJlc3VsdDogVmlld01vZGVsRGVjb3JhdGlvbltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGRlY29yYXRpb24gb2YgZGVjb3JhdGlvbnMpIHtcblx0XHRcdFx0aWYgKCFkZWNvcmF0aW9uLm9wdGlvbnMubWluaW1hcCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gZGVjb3JhdGlvbi5yYW5nZTtcblx0XHRcdFx0Y29uc3QgbWluaW1hcFN0YXJ0TGluZU51bWJlciA9IHRoaXMuX3NhbXBsaW5nU3RhdGUubW9kZWxMaW5lVG9NaW5pbWFwTGluZShyYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRjb25zdCBtaW5pbWFwRW5kTGluZU51bWJlciA9IHRoaXMuX3NhbXBsaW5nU3RhdGUubW9kZWxMaW5lVG9NaW5pbWFwTGluZShyYW5nZS5lbmRMaW5lTnVtYmVyKTtcblx0XHRcdFx0cmVzdWx0LnB1c2gobmV3IFZpZXdNb2RlbERlY29yYXRpb24obmV3IFJhbmdlKG1pbmltYXBTdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uLCBtaW5pbWFwRW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKSwgZGVjb3JhdGlvbi5vcHRpb25zKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdHJldHVybiBkZWNvcmF0aW9ucztcblx0fVxuXG5cdHB1YmxpYyBnZXRTZWN0aW9uSGVhZGVyVGV4dChkZWNvcmF0aW9uOiBWaWV3TW9kZWxEZWNvcmF0aW9uLCBmaXRXaWR0aDogKHM6IHN0cmluZykgPT4gc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0Y29uc3QgaGVhZGVyVGV4dCA9IGRlY29yYXRpb24ub3B0aW9ucy5taW5pbWFwPy5zZWN0aW9uSGVhZGVyVGV4dDtcblx0XHRpZiAoIWhlYWRlclRleHQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBjYWNoZWRUZXh0ID0gdGhpcy5fc2VjdGlvbkhlYWRlckNhY2hlLmdldChoZWFkZXJUZXh0KTtcblx0XHRpZiAoY2FjaGVkVGV4dCkge1xuXHRcdFx0cmV0dXJuIGNhY2hlZFRleHQ7XG5cdFx0fVxuXHRcdGNvbnN0IGZpdHRlZFRleHQgPSBmaXRXaWR0aChoZWFkZXJUZXh0KTtcblx0XHR0aGlzLl9zZWN0aW9uSGVhZGVyQ2FjaGUuc2V0KGhlYWRlclRleHQsIGZpdHRlZFRleHQpO1xuXHRcdHJldHVybiBmaXR0ZWRUZXh0O1xuXHR9XG5cblx0cHVibGljIGdldE9wdGlvbnMoKTogVGV4dE1vZGVsUmVzb2x2ZWRPcHRpb25zIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGV4dC52aWV3TW9kZWwubW9kZWwuZ2V0T3B0aW9ucygpO1xuXHR9XG5cblx0cHVibGljIHJldmVhbExpbmVOdW1iZXIobGluZU51bWJlcjogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3NhbXBsaW5nU3RhdGUpIHtcblx0XHRcdGxpbmVOdW1iZXIgPSB0aGlzLl9zYW1wbGluZ1N0YXRlLm1pbmltYXBMaW5lc1tsaW5lTnVtYmVyIC0gMV07XG5cdFx0fVxuXHRcdHRoaXMuX2NvbnRleHQudmlld01vZGVsLnJldmVhbFJhbmdlKFxuXHRcdFx0J21vdXNlJyxcblx0XHRcdGZhbHNlLFxuXHRcdFx0bmV3IFJhbmdlKGxpbmVOdW1iZXIsIDEsIGxpbmVOdW1iZXIsIDEpLFxuXHRcdFx0dmlld0V2ZW50cy5WZXJ0aWNhbFJldmVhbFR5cGUuQ2VudGVyLFxuXHRcdFx0U2Nyb2xsVHlwZS5TbW9vdGhcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHNldFNjcm9sbFRvcChzY3JvbGxUb3A6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRleHQudmlld01vZGVsLnZpZXdMYXlvdXQuc2V0U2Nyb2xsUG9zaXRpb24oe1xuXHRcdFx0c2Nyb2xsVG9wOiBzY3JvbGxUb3Bcblx0XHR9LCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cblxuY2xhc3MgSW5uZXJNaW5pbWFwIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdGhlbWU6IEVkaXRvclRoZW1lO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogSU1pbmltYXBNb2RlbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NoYWRvdzogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYW52YXM6IEZhc3REb21Ob2RlPEhUTUxDYW52YXNFbGVtZW50Pjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVjb3JhdGlvbnNDYW52YXM6IEZhc3REb21Ob2RlPEhUTUxDYW52YXNFbGVtZW50Pjtcblx0cHJpdmF0ZSByZWFkb25seSBfc2xpZGVyOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NsaWRlckhvcml6b250YWw6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50Pjtcblx0cHJpdmF0ZSByZWFkb25seSBfcG9pbnRlckRvd25MaXN0ZW5lcjogSURpc3Bvc2FibGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NsaWRlclBvaW50ZXJNb3ZlTW9uaXRvcjogR2xvYmFsUG9pbnRlck1vdmVNb25pdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zbGlkZXJQb2ludGVyRG93bkxpc3RlbmVyOiBJRGlzcG9zYWJsZTtcblx0cHJpdmF0ZSByZWFkb25seSBfZ2VzdHVyZURpc3Bvc2FibGU6IElEaXNwb3NhYmxlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zbGlkZXJUb3VjaFN0YXJ0TGlzdGVuZXI6IElEaXNwb3NhYmxlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zbGlkZXJUb3VjaE1vdmVMaXN0ZW5lcjogSURpc3Bvc2FibGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NsaWRlclRvdWNoRW5kTGlzdGVuZXI6IElEaXNwb3NhYmxlO1xuXG5cdHByaXZhdGUgX2xhc3RSZW5kZXJEYXRhOiBSZW5kZXJEYXRhIHwgbnVsbDtcblx0cHJpdmF0ZSBfc2VsZWN0aW9uQ29sb3I6IENvbG9yIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9yZW5kZXJEZWNvcmF0aW9uczogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9nZXN0dXJlSW5Qcm9ncmVzczogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9idWZmZXJzOiBNaW5pbWFwQnVmZmVycyB8IG51bGw7XG5cdHByaXZhdGUgX2lzTW91c2VPdmVyTWluaW1hcDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9oaWRlRGVsYXllZFNjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR0aGVtZTogRWRpdG9yVGhlbWUsXG5cdFx0bW9kZWw6IElNaW5pbWFwTW9kZWxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3RoZW1lID0gdGhlbWU7XG5cdFx0dGhpcy5fbW9kZWwgPSBtb2RlbDtcblxuXHRcdHRoaXMuX2xhc3RSZW5kZXJEYXRhID0gbnVsbDtcblx0XHR0aGlzLl9idWZmZXJzID0gbnVsbDtcblx0XHR0aGlzLl9zZWxlY3Rpb25Db2xvciA9IHRoaXMuX3RoZW1lLmdldENvbG9yKG1pbmltYXBTZWxlY3Rpb24pO1xuXG5cdFx0dGhpcy5fZG9tTm9kZSA9IGNyZWF0ZUZhc3REb21Ob2RlKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKTtcblx0XHRQYXJ0RmluZ2VycHJpbnRzLndyaXRlKHRoaXMuX2RvbU5vZGUsIFBhcnRGaW5nZXJwcmludC5NaW5pbWFwKTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldENsYXNzTmFtZSh0aGlzLl9nZXRNaW5pbWFwRG9tTm9kZUNsYXNzTmFtZSgpKTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldFBvc2l0aW9uKCdhYnNvbHV0ZScpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3ByZXNlbnRhdGlvbicpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cblx0XHR0aGlzLl9zaGFkb3cgPSBjcmVhdGVGYXN0RG9tTm9kZShkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSk7XG5cdFx0dGhpcy5fc2hhZG93LnNldENsYXNzTmFtZSgnbWluaW1hcC1zaGFkb3ctaGlkZGVuJyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9zaGFkb3cpO1xuXG5cdFx0dGhpcy5fY2FudmFzID0gY3JlYXRlRmFzdERvbU5vZGUoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJykpO1xuXHRcdHRoaXMuX2NhbnZhcy5zZXRQb3NpdGlvbignYWJzb2x1dGUnKTtcblx0XHR0aGlzLl9jYW52YXMuc2V0TGVmdCgwKTtcblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX2NhbnZhcyk7XG5cblx0XHR0aGlzLl9kZWNvcmF0aW9uc0NhbnZhcyA9IGNyZWF0ZUZhc3REb21Ob2RlKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpKTtcblx0XHR0aGlzLl9kZWNvcmF0aW9uc0NhbnZhcy5zZXRQb3NpdGlvbignYWJzb2x1dGUnKTtcblx0XHR0aGlzLl9kZWNvcmF0aW9uc0NhbnZhcy5zZXRDbGFzc05hbWUoJ21pbmltYXAtZGVjb3JhdGlvbnMtbGF5ZXInKTtcblx0XHR0aGlzLl9kZWNvcmF0aW9uc0NhbnZhcy5zZXRMZWZ0KDApO1xuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fZGVjb3JhdGlvbnNDYW52YXMpO1xuXG5cdFx0dGhpcy5fc2xpZGVyID0gY3JlYXRlRmFzdERvbU5vZGUoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JykpO1xuXHRcdHRoaXMuX3NsaWRlci5zZXRQb3NpdGlvbignYWJzb2x1dGUnKTtcblx0XHR0aGlzLl9zbGlkZXIuc2V0Q2xhc3NOYW1lKCdtaW5pbWFwLXNsaWRlcicpO1xuXHRcdHRoaXMuX3NsaWRlci5zZXRMYXllckhpbnRpbmcodHJ1ZSk7XG5cdFx0dGhpcy5fc2xpZGVyLnNldENvbnRhaW4oJ3N0cmljdCcpO1xuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fc2xpZGVyKTtcblxuXHRcdHRoaXMuX3NsaWRlckhvcml6b250YWwgPSBjcmVhdGVGYXN0RG9tTm9kZShkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSk7XG5cdFx0dGhpcy5fc2xpZGVySG9yaXpvbnRhbC5zZXRQb3NpdGlvbignYWJzb2x1dGUnKTtcblx0XHR0aGlzLl9zbGlkZXJIb3Jpem9udGFsLnNldENsYXNzTmFtZSgnbWluaW1hcC1zbGlkZXItaG9yaXpvbnRhbCcpO1xuXHRcdHRoaXMuX3NsaWRlci5hcHBlbmRDaGlsZCh0aGlzLl9zbGlkZXJIb3Jpem9udGFsKTtcblxuXHRcdHRoaXMuX2FwcGx5TGF5b3V0KCk7XG5cblx0XHR0aGlzLl9oaWRlRGVsYXllZFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuX2hpZGVJbW1lZGlhdGVseUlmTW91c2VJc091dHNpZGUoKSwgNTAwKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZG9tTm9kZS5kb21Ob2RlLCBkb20uRXZlbnRUeXBlLk1PVVNFX09WRVIsICgpID0+IHtcblx0XHRcdHRoaXMuX2lzTW91c2VPdmVyTWluaW1hcCA9IHRydWU7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9kb21Ob2RlLmRvbU5vZGUsIGRvbS5FdmVudFR5cGUuTU9VU0VfTEVBVkUsICgpID0+IHtcblx0XHRcdHRoaXMuX2lzTW91c2VPdmVyTWluaW1hcCA9IGZhbHNlO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3BvaW50ZXJEb3duTGlzdGVuZXIgPSBkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZG9tTm9kZS5kb21Ob2RlLCBkb20uRXZlbnRUeXBlLlBPSU5URVJfRE9XTiwgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblxuXHRcdFx0Y29uc3QgaXNNb3VzZSA9IChlLnBvaW50ZXJUeXBlID09PSAnbW91c2UnKTtcblx0XHRcdGNvbnN0IGlzTGVmdENsaWNrID0gKGUuYnV0dG9uID09PSAwKTtcblxuXHRcdFx0Y29uc3QgcmVuZGVyTWluaW1hcCA9IHRoaXMuX21vZGVsLm9wdGlvbnMucmVuZGVyTWluaW1hcDtcblx0XHRcdGlmIChyZW5kZXJNaW5pbWFwID09PSBSZW5kZXJNaW5pbWFwLk5vbmUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLl9sYXN0UmVuZGVyRGF0YSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fbW9kZWwub3B0aW9ucy5zaXplICE9PSAncHJvcG9ydGlvbmFsJykge1xuXHRcdFx0XHRpZiAoaXNMZWZ0Q2xpY2sgJiYgdGhpcy5fbGFzdFJlbmRlckRhdGEpIHtcblx0XHRcdFx0XHQvLyBwcmV0ZW5kIHRoZSBjbGljayBvY2N1cnJlZCBpbiB0aGUgY2VudGVyIG9mIHRoZSBzbGlkZXJcblx0XHRcdFx0XHRjb25zdCBwb3NpdGlvbiA9IGRvbS5nZXREb21Ob2RlUGFnZVBvc2l0aW9uKHRoaXMuX3NsaWRlci5kb21Ob2RlKTtcblx0XHRcdFx0XHRjb25zdCBpbml0aWFsUG9zWSA9IHBvc2l0aW9uLnRvcCArIHBvc2l0aW9uLmhlaWdodCAvIDI7XG5cdFx0XHRcdFx0dGhpcy5fc3RhcnRTbGlkZXJEcmFnZ2luZyhlLCBpbml0aWFsUG9zWSwgdGhpcy5fbGFzdFJlbmRlckRhdGEucmVuZGVyZWRMYXlvdXQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzTGVmdENsaWNrIHx8ICFpc01vdXNlKSB7XG5cdFx0XHRcdGNvbnN0IG1pbmltYXBMaW5lSGVpZ2h0ID0gdGhpcy5fbW9kZWwub3B0aW9ucy5taW5pbWFwTGluZUhlaWdodDtcblx0XHRcdFx0Y29uc3QgaW50ZXJuYWxPZmZzZXRZID0gKHRoaXMuX21vZGVsLm9wdGlvbnMuY2FudmFzSW5uZXJIZWlnaHQgLyB0aGlzLl9tb2RlbC5vcHRpb25zLmNhbnZhc091dGVySGVpZ2h0KSAqIGUub2Zmc2V0WTtcblx0XHRcdFx0Y29uc3QgbGluZUluZGV4ID0gTWF0aC5mbG9vcihpbnRlcm5hbE9mZnNldFkgLyBtaW5pbWFwTGluZUhlaWdodCk7XG5cblx0XHRcdFx0bGV0IGxpbmVOdW1iZXIgPSBsaW5lSW5kZXggKyB0aGlzLl9sYXN0UmVuZGVyRGF0YS5yZW5kZXJlZExheW91dC5zdGFydExpbmVOdW1iZXIgLSB0aGlzLl9sYXN0UmVuZGVyRGF0YS5yZW5kZXJlZExheW91dC50b3BQYWRkaW5nTGluZUNvdW50O1xuXHRcdFx0XHRsaW5lTnVtYmVyID0gTWF0aC5taW4obGluZU51bWJlciwgdGhpcy5fbW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXG5cdFx0XHRcdHRoaXMuX21vZGVsLnJldmVhbExpbmVOdW1iZXIobGluZU51bWJlcik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9zbGlkZXJQb2ludGVyTW92ZU1vbml0b3IgPSBuZXcgR2xvYmFsUG9pbnRlck1vdmVNb25pdG9yKCk7XG5cblx0XHR0aGlzLl9zbGlkZXJQb2ludGVyRG93bkxpc3RlbmVyID0gZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3NsaWRlci5kb21Ob2RlLCBkb20uRXZlbnRUeXBlLlBPSU5URVJfRE9XTiwgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRpZiAoZS5idXR0b24gPT09IDAgJiYgdGhpcy5fbGFzdFJlbmRlckRhdGEpIHtcblx0XHRcdFx0dGhpcy5fc3RhcnRTbGlkZXJEcmFnZ2luZyhlLCBlLnBhZ2VZLCB0aGlzLl9sYXN0UmVuZGVyRGF0YS5yZW5kZXJlZExheW91dCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9nZXN0dXJlRGlzcG9zYWJsZSA9IEdlc3R1cmUuYWRkVGFyZ2V0KHRoaXMuX2RvbU5vZGUuZG9tTm9kZSk7XG5cdFx0dGhpcy5fc2xpZGVyVG91Y2hTdGFydExpc3RlbmVyID0gZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9kb21Ob2RlLmRvbU5vZGUsIEV2ZW50VHlwZS5TdGFydCwgKGU6IEdlc3R1cmVFdmVudCkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGlmICh0aGlzLl9sYXN0UmVuZGVyRGF0YSkge1xuXHRcdFx0XHR0aGlzLl9zbGlkZXIudG9nZ2xlQ2xhc3NOYW1lKCdhY3RpdmUnLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5fZ2VzdHVyZUluUHJvZ3Jlc3MgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLnNjcm9sbER1ZVRvVG91Y2hFdmVudChlKTtcblx0XHRcdH1cblx0XHR9LCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuXG5cdFx0dGhpcy5fc2xpZGVyVG91Y2hNb3ZlTGlzdGVuZXIgPSBkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RvbU5vZGUuZG9tTm9kZSwgRXZlbnRUeXBlLkNoYW5nZSwgKGU6IEdlc3R1cmVFdmVudCkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGlmICh0aGlzLl9sYXN0UmVuZGVyRGF0YSAmJiB0aGlzLl9nZXN0dXJlSW5Qcm9ncmVzcykge1xuXHRcdFx0XHR0aGlzLnNjcm9sbER1ZVRvVG91Y2hFdmVudChlKTtcblx0XHRcdH1cblx0XHR9LCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuXG5cdFx0dGhpcy5fc2xpZGVyVG91Y2hFbmRMaXN0ZW5lciA9IGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9kb21Ob2RlLmRvbU5vZGUsIEV2ZW50VHlwZS5FbmQsIChlOiBHZXN0dXJlRXZlbnQpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLl9nZXN0dXJlSW5Qcm9ncmVzcyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fc2xpZGVyLnRvZ2dsZUNsYXNzTmFtZSgnYWN0aXZlJywgZmFsc2UpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGlkZVNvb24oKSB7XG5cdFx0dGhpcy5faGlkZURlbGF5ZWRTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0dGhpcy5faGlkZURlbGF5ZWRTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2hpZGVJbW1lZGlhdGVseUlmTW91c2VJc091dHNpZGUoKSB7XG5cdFx0aWYgKHRoaXMuX2lzTW91c2VPdmVyTWluaW1hcCkge1xuXHRcdFx0dGhpcy5faGlkZVNvb24oKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZG9tTm9kZS50b2dnbGVDbGFzc05hbWUoJ2FjdGl2ZScsIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgX3N0YXJ0U2xpZGVyRHJhZ2dpbmcoZTogUG9pbnRlckV2ZW50LCBpbml0aWFsUG9zWTogbnVtYmVyLCBpbml0aWFsU2xpZGVyU3RhdGU6IE1pbmltYXBMYXlvdXQpOiB2b2lkIHtcblx0XHRpZiAoIWUudGFyZ2V0IHx8ICEoZS50YXJnZXQgaW5zdGFuY2VvZiBFbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpbml0aWFsUG9zWCA9IGUucGFnZVg7XG5cblx0XHR0aGlzLl9zbGlkZXIudG9nZ2xlQ2xhc3NOYW1lKCdhY3RpdmUnLCB0cnVlKTtcblxuXHRcdGNvbnN0IGhhbmRsZVBvaW50ZXJNb3ZlID0gKHBvc3k6IG51bWJlciwgcG9zeDogbnVtYmVyKSA9PiB7XG5cdFx0XHRjb25zdCBtaW5pbWFwUG9zaXRpb24gPSBkb20uZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbih0aGlzLl9kb21Ob2RlLmRvbU5vZGUpO1xuXHRcdFx0Y29uc3QgcG9pbnRlck9ydGhvZ29uYWxEZWx0YSA9IE1hdGgubWluKFxuXHRcdFx0XHRNYXRoLmFicyhwb3N4IC0gaW5pdGlhbFBvc1gpLFxuXHRcdFx0XHRNYXRoLmFicyhwb3N4IC0gbWluaW1hcFBvc2l0aW9uLmxlZnQpLFxuXHRcdFx0XHRNYXRoLmFicyhwb3N4IC0gbWluaW1hcFBvc2l0aW9uLmxlZnQgLSBtaW5pbWFwUG9zaXRpb24ud2lkdGgpXG5cdFx0XHQpO1xuXG5cdFx0XHRpZiAocGxhdGZvcm0uaXNXaW5kb3dzICYmIHBvaW50ZXJPcnRob2dvbmFsRGVsdGEgPiBQT0lOVEVSX0RSQUdfUkVTRVRfRElTVEFOQ0UpIHtcblx0XHRcdFx0Ly8gVGhlIHBvaW50ZXIgaGFzIHdvbmRlcmVkIGF3YXkgZnJvbSB0aGUgc2Nyb2xsYmFyID0+IHJlc2V0IGRyYWdnaW5nXG5cdFx0XHRcdHRoaXMuX21vZGVsLnNldFNjcm9sbFRvcChpbml0aWFsU2xpZGVyU3RhdGUuc2Nyb2xsVG9wKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwb2ludGVyRGVsdGEgPSBwb3N5IC0gaW5pdGlhbFBvc1k7XG5cdFx0XHR0aGlzLl9tb2RlbC5zZXRTY3JvbGxUb3AoaW5pdGlhbFNsaWRlclN0YXRlLmdldERlc2lyZWRTY3JvbGxUb3BGcm9tRGVsdGEocG9pbnRlckRlbHRhKSk7XG5cdFx0fTtcblxuXHRcdGlmIChlLnBhZ2VZICE9PSBpbml0aWFsUG9zWSkge1xuXHRcdFx0aGFuZGxlUG9pbnRlck1vdmUoZS5wYWdlWSwgaW5pdGlhbFBvc1gpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NsaWRlclBvaW50ZXJNb3ZlTW9uaXRvci5zdGFydE1vbml0b3JpbmcoXG5cdFx0XHRlLnRhcmdldCxcblx0XHRcdGUucG9pbnRlcklkLFxuXHRcdFx0ZS5idXR0b25zLFxuXHRcdFx0cG9pbnRlck1vdmVEYXRhID0+IGhhbmRsZVBvaW50ZXJNb3ZlKHBvaW50ZXJNb3ZlRGF0YS5wYWdlWSwgcG9pbnRlck1vdmVEYXRhLnBhZ2VYKSxcblx0XHRcdCgpID0+IHtcblx0XHRcdFx0dGhpcy5fc2xpZGVyLnRvZ2dsZUNsYXNzTmFtZSgnYWN0aXZlJywgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIHNjcm9sbER1ZVRvVG91Y2hFdmVudCh0b3VjaDogR2VzdHVyZUV2ZW50KSB7XG5cdFx0Y29uc3Qgc3RhcnRZID0gdGhpcy5fZG9tTm9kZS5kb21Ob2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnRvcDtcblx0XHRjb25zdCBzY3JvbGxUb3AgPSB0aGlzLl9sYXN0UmVuZGVyRGF0YSEucmVuZGVyZWRMYXlvdXQuZ2V0RGVzaXJlZFNjcm9sbFRvcEZyb21Ub3VjaExvY2F0aW9uKHRvdWNoLnBhZ2VZIC0gc3RhcnRZKTtcblx0XHR0aGlzLl9tb2RlbC5zZXRTY3JvbGxUb3Aoc2Nyb2xsVG9wKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BvaW50ZXJEb3duTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3NsaWRlclBvaW50ZXJNb3ZlTW9uaXRvci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fc2xpZGVyUG9pbnRlckRvd25MaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZ2VzdHVyZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3NsaWRlclRvdWNoU3RhcnRMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fc2xpZGVyVG91Y2hNb3ZlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3NsaWRlclRvdWNoRW5kTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE1pbmltYXBEb21Ob2RlQ2xhc3NOYW1lKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgY2xhc3NfID0gWydtaW5pbWFwJ107XG5cdFx0aWYgKHRoaXMuX21vZGVsLm9wdGlvbnMuc2hvd1NsaWRlciA9PT0gJ2Fsd2F5cycpIHtcblx0XHRcdGNsYXNzXy5wdXNoKCdzbGlkZXItYWx3YXlzJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNsYXNzXy5wdXNoKCdzbGlkZXItbW91c2VvdmVyJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX21vZGVsLm9wdGlvbnMuYXV0b2hpZGUgPT09ICdtb3VzZW92ZXInKSB7XG5cdFx0XHRjbGFzc18ucHVzaCgnbWluaW1hcC1hdXRvaGlkZS1tb3VzZW92ZXInKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX21vZGVsLm9wdGlvbnMuYXV0b2hpZGUgPT09ICdzY3JvbGwnKSB7XG5cdFx0XHRjbGFzc18ucHVzaCgnbWluaW1hcC1hdXRvaGlkZS1zY3JvbGwnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2xhc3NfLmpvaW4oJyAnKTtcblx0fVxuXG5cdHB1YmxpYyBnZXREb21Ob2RlKCk6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2RvbU5vZGU7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseUxheW91dCgpOiB2b2lkIHtcblx0XHR0aGlzLl9kb21Ob2RlLnNldExlZnQodGhpcy5fbW9kZWwub3B0aW9ucy5taW5pbWFwTGVmdCk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRXaWR0aCh0aGlzLl9tb2RlbC5vcHRpb25zLm1pbmltYXBXaWR0aCk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRIZWlnaHQodGhpcy5fbW9kZWwub3B0aW9ucy5taW5pbWFwSGVpZ2h0KTtcblx0XHR0aGlzLl9zaGFkb3cuc2V0SGVpZ2h0KHRoaXMuX21vZGVsLm9wdGlvbnMubWluaW1hcEhlaWdodCk7XG5cblx0XHR0aGlzLl9jYW52YXMuc2V0V2lkdGgodGhpcy5fbW9kZWwub3B0aW9ucy5jYW52YXNPdXRlcldpZHRoKTtcblx0XHR0aGlzLl9jYW52YXMuc2V0SGVpZ2h0KHRoaXMuX21vZGVsLm9wdGlvbnMuY2FudmFzT3V0ZXJIZWlnaHQpO1xuXHRcdHRoaXMuX2NhbnZhcy5kb21Ob2RlLndpZHRoID0gdGhpcy5fbW9kZWwub3B0aW9ucy5jYW52YXNJbm5lcldpZHRoO1xuXHRcdHRoaXMuX2NhbnZhcy5kb21Ob2RlLmhlaWdodCA9IHRoaXMuX21vZGVsLm9wdGlvbnMuY2FudmFzSW5uZXJIZWlnaHQ7XG5cblx0XHR0aGlzLl9kZWNvcmF0aW9uc0NhbnZhcy5zZXRXaWR0aCh0aGlzLl9tb2RlbC5vcHRpb25zLmNhbnZhc091dGVyV2lkdGgpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zQ2FudmFzLnNldEhlaWdodCh0aGlzLl9tb2RlbC5vcHRpb25zLmNhbnZhc091dGVySGVpZ2h0KTtcblx0XHR0aGlzLl9kZWNvcmF0aW9uc0NhbnZhcy5kb21Ob2RlLndpZHRoID0gdGhpcy5fbW9kZWwub3B0aW9ucy5jYW52YXNJbm5lcldpZHRoO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zQ2FudmFzLmRvbU5vZGUuaGVpZ2h0ID0gdGhpcy5fbW9kZWwub3B0aW9ucy5jYW52YXNJbm5lckhlaWdodDtcblxuXHRcdHRoaXMuX3NsaWRlci5zZXRXaWR0aCh0aGlzLl9tb2RlbC5vcHRpb25zLm1pbmltYXBXaWR0aCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRCdWZmZXIoKTogSW1hZ2VEYXRhIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9idWZmZXJzKSB7XG5cdFx0XHRpZiAodGhpcy5fbW9kZWwub3B0aW9ucy5jYW52YXNJbm5lcldpZHRoID4gMCAmJiB0aGlzLl9tb2RlbC5vcHRpb25zLmNhbnZhc0lubmVySGVpZ2h0ID4gMCkge1xuXHRcdFx0XHR0aGlzLl9idWZmZXJzID0gbmV3IE1pbmltYXBCdWZmZXJzKFxuXHRcdFx0XHRcdHRoaXMuX2NhbnZhcy5kb21Ob2RlLmdldENvbnRleHQoJzJkJykhLFxuXHRcdFx0XHRcdHRoaXMuX21vZGVsLm9wdGlvbnMuY2FudmFzSW5uZXJXaWR0aCxcblx0XHRcdFx0XHR0aGlzLl9tb2RlbC5vcHRpb25zLmNhbnZhc0lubmVySGVpZ2h0LFxuXHRcdFx0XHRcdHRoaXMuX21vZGVsLm9wdGlvbnMuYmFja2dyb3VuZENvbG9yXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9idWZmZXJzID8gdGhpcy5fYnVmZmVycy5nZXRCdWZmZXIoKSA6IG51bGw7XG5cdH1cblxuXHQvLyAtLS0tIGJlZ2luIHZpZXcgZXZlbnQgaGFuZGxlcnNcblxuXHRwdWJsaWMgb25EaWRDaGFuZ2VPcHRpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xhc3RSZW5kZXJEYXRhID0gbnVsbDtcblx0XHR0aGlzLl9idWZmZXJzID0gbnVsbDtcblx0XHR0aGlzLl9hcHBseUxheW91dCgpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0Q2xhc3NOYW1lKHRoaXMuX2dldE1pbmltYXBEb21Ob2RlQ2xhc3NOYW1lKCkpO1xuXHR9XG5cdHB1YmxpYyBvblNlbGVjdGlvbkNoYW5nZWQoKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fcmVuZGVyRGVjb3JhdGlvbnMgPSB0cnVlO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvbkRlY29yYXRpb25zQ2hhbmdlZCgpOiBib29sZWFuIHtcblx0XHR0aGlzLl9yZW5kZXJEZWNvcmF0aW9ucyA9IHRydWU7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG9uRmx1c2hlZCgpOiBib29sZWFuIHtcblx0XHR0aGlzLl9sYXN0UmVuZGVyRGF0YSA9IG51bGw7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG9uTGluZXNDaGFuZ2VkKGNoYW5nZUZyb21MaW5lTnVtYmVyOiBudW1iZXIsIGNoYW5nZUNvdW50OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fbGFzdFJlbmRlckRhdGEpIHtcblx0XHRcdHJldHVybiB0aGlzLl9sYXN0UmVuZGVyRGF0YS5vbkxpbmVzQ2hhbmdlZChjaGFuZ2VGcm9tTGluZU51bWJlciwgY2hhbmdlQ291bnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cHVibGljIG9uTGluZXNEZWxldGVkKGRlbGV0ZUZyb21MaW5lTnVtYmVyOiBudW1iZXIsIGRlbGV0ZVRvTGluZU51bWJlcjogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fbGFzdFJlbmRlckRhdGE/Lm9uTGluZXNEZWxldGVkKGRlbGV0ZUZyb21MaW5lTnVtYmVyLCBkZWxldGVUb0xpbmVOdW1iZXIpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvbkxpbmVzSW5zZXJ0ZWQoaW5zZXJ0RnJvbUxpbmVOdW1iZXI6IG51bWJlciwgaW5zZXJ0VG9MaW5lTnVtYmVyOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHR0aGlzLl9sYXN0UmVuZGVyRGF0YT8ub25MaW5lc0luc2VydGVkKGluc2VydEZyb21MaW5lTnVtYmVyLCBpbnNlcnRUb0xpbmVOdW1iZXIpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvblNjcm9sbENoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3U2Nyb2xsQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX21vZGVsLm9wdGlvbnMuYXV0b2hpZGUgPT09ICdzY3JvbGwnICYmIChlLnNjcm9sbFRvcENoYW5nZWQgfHwgZS5zY3JvbGxIZWlnaHRDaGFuZ2VkKSkge1xuXHRcdFx0dGhpcy5fZG9tTm9kZS50b2dnbGVDbGFzc05hbWUoJ2FjdGl2ZScsIHRydWUpO1xuXHRcdFx0dGhpcy5faGlkZVNvb24oKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVuZGVyRGVjb3JhdGlvbnMgPSB0cnVlO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvblRoZW1lQ2hhbmdlZCgpOiBib29sZWFuIHtcblx0XHR0aGlzLl9zZWxlY3Rpb25Db2xvciA9IHRoaXMuX3RoZW1lLmdldENvbG9yKG1pbmltYXBTZWxlY3Rpb24pO1xuXHRcdHRoaXMuX3JlbmRlckRlY29yYXRpb25zID0gdHJ1ZTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb25Ub2tlbnNDaGFuZ2VkKHJhbmdlczogeyBmcm9tTGluZU51bWJlcjogbnVtYmVyOyB0b0xpbmVOdW1iZXI6IG51bWJlciB9W10pOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fbGFzdFJlbmRlckRhdGEpIHtcblx0XHRcdHJldHVybiB0aGlzLl9sYXN0UmVuZGVyRGF0YS5vblRva2Vuc0NoYW5nZWQocmFuZ2VzKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHB1YmxpYyBvblRva2Vuc0NvbG9yc0NoYW5nZWQoKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fbGFzdFJlbmRlckRhdGEgPSBudWxsO1xuXHRcdHRoaXMuX2J1ZmZlcnMgPSBudWxsO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvblpvbmVzQ2hhbmdlZCgpOiBib29sZWFuIHtcblx0XHR0aGlzLl9sYXN0UmVuZGVyRGF0YSA9IG51bGw7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyAtLS0gZW5kIGV2ZW50IGhhbmRsZXJzXG5cblx0cHVibGljIHJlbmRlcihyZW5kZXJpbmdDdHg6IElNaW5pbWFwUmVuZGVyaW5nQ29udGV4dCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlbmRlck1pbmltYXAgPSB0aGlzLl9tb2RlbC5vcHRpb25zLnJlbmRlck1pbmltYXA7XG5cdFx0aWYgKHJlbmRlck1pbmltYXAgPT09IFJlbmRlck1pbmltYXAuTm9uZSkge1xuXHRcdFx0dGhpcy5fc2hhZG93LnNldENsYXNzTmFtZSgnbWluaW1hcC1zaGFkb3ctaGlkZGVuJyk7XG5cdFx0XHR0aGlzLl9zbGlkZXJIb3Jpem9udGFsLnNldFdpZHRoKDApO1xuXHRcdFx0dGhpcy5fc2xpZGVySG9yaXpvbnRhbC5zZXRIZWlnaHQoMCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChyZW5kZXJpbmdDdHguc2Nyb2xsTGVmdCArIHJlbmRlcmluZ0N0eC52aWV3cG9ydFdpZHRoID49IHJlbmRlcmluZ0N0eC5zY3JvbGxXaWR0aCkge1xuXHRcdFx0dGhpcy5fc2hhZG93LnNldENsYXNzTmFtZSgnbWluaW1hcC1zaGFkb3ctaGlkZGVuJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3NoYWRvdy5zZXRDbGFzc05hbWUoJ21pbmltYXAtc2hhZG93LXZpc2libGUnKTtcblx0XHR9XG5cblx0XHRjb25zdCBsYXlvdXQgPSBNaW5pbWFwTGF5b3V0LmNyZWF0ZShcblx0XHRcdHRoaXMuX21vZGVsLm9wdGlvbnMsXG5cdFx0XHRyZW5kZXJpbmdDdHgudmlld3BvcnRTdGFydExpbmVOdW1iZXIsXG5cdFx0XHRyZW5kZXJpbmdDdHgudmlld3BvcnRFbmRMaW5lTnVtYmVyLFxuXHRcdFx0cmVuZGVyaW5nQ3R4LnZpZXdwb3J0U3RhcnRMaW5lTnVtYmVyVmVydGljYWxPZmZzZXQsXG5cdFx0XHRyZW5kZXJpbmdDdHgudmlld3BvcnRIZWlnaHQsXG5cdFx0XHRyZW5kZXJpbmdDdHgudmlld3BvcnRDb250YWluc1doaXRlc3BhY2VHYXBzLFxuXHRcdFx0dGhpcy5fbW9kZWwuZ2V0TGluZUNvdW50KCksXG5cdFx0XHR0aGlzLl9tb2RlbC5nZXRSZWFsTGluZUNvdW50KCksXG5cdFx0XHRyZW5kZXJpbmdDdHguc2Nyb2xsVG9wLFxuXHRcdFx0cmVuZGVyaW5nQ3R4LnNjcm9sbEhlaWdodCxcblx0XHRcdHRoaXMuX2xhc3RSZW5kZXJEYXRhID8gdGhpcy5fbGFzdFJlbmRlckRhdGEucmVuZGVyZWRMYXlvdXQgOiBudWxsXG5cdFx0KTtcblx0XHR0aGlzLl9zbGlkZXIuc2V0RGlzcGxheShsYXlvdXQuc2xpZGVyTmVlZGVkID8gJ2Jsb2NrJyA6ICdub25lJyk7XG5cdFx0dGhpcy5fc2xpZGVyLnNldFRvcChsYXlvdXQuc2xpZGVyVG9wKTtcblx0XHR0aGlzLl9zbGlkZXIuc2V0SGVpZ2h0KGxheW91dC5zbGlkZXJIZWlnaHQpO1xuXG5cdFx0Ly8gQ29tcHV0ZSBob3Jpem9udGFsIHNsaWRlciBjb29yZGluYXRlc1xuXHRcdHRoaXMuX3NsaWRlckhvcml6b250YWwuc2V0TGVmdCgwKTtcblx0XHR0aGlzLl9zbGlkZXJIb3Jpem9udGFsLnNldFdpZHRoKHRoaXMuX21vZGVsLm9wdGlvbnMubWluaW1hcFdpZHRoKTtcblx0XHR0aGlzLl9zbGlkZXJIb3Jpem9udGFsLnNldFRvcCgwKTtcblx0XHR0aGlzLl9zbGlkZXJIb3Jpem9udGFsLnNldEhlaWdodChsYXlvdXQuc2xpZGVySGVpZ2h0KTtcblxuXHRcdHRoaXMucmVuZGVyRGVjb3JhdGlvbnMobGF5b3V0KTtcblx0XHR0aGlzLl9sYXN0UmVuZGVyRGF0YSA9IHRoaXMucmVuZGVyTGluZXMobGF5b3V0KTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRGVjb3JhdGlvbnMobGF5b3V0OiBNaW5pbWFwTGF5b3V0KSB7XG5cdFx0aWYgKHRoaXMuX3JlbmRlckRlY29yYXRpb25zKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJEZWNvcmF0aW9ucyA9IGZhbHNlO1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IHRoaXMuX21vZGVsLmdldFNlbGVjdGlvbnMoKTtcblx0XHRcdHNlbGVjdGlvbnMuc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpO1xuXG5cdFx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IHRoaXMuX21vZGVsLmdldE1pbmltYXBEZWNvcmF0aW9uc0luVmlld3BvcnQobGF5b3V0LnN0YXJ0TGluZU51bWJlciwgbGF5b3V0LmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0ZGVjb3JhdGlvbnMuc29ydCgoYSwgYikgPT4gKGEub3B0aW9ucy56SW5kZXggfHwgMCkgLSAoYi5vcHRpb25zLnpJbmRleCB8fCAwKSk7XG5cblx0XHRcdGNvbnN0IHsgY2FudmFzSW5uZXJXaWR0aCwgY2FudmFzSW5uZXJIZWlnaHQgfSA9IHRoaXMuX21vZGVsLm9wdGlvbnM7XG5cdFx0XHRjb25zdCBtaW5pbWFwTGluZUhlaWdodCA9IHRoaXMuX21vZGVsLm9wdGlvbnMubWluaW1hcExpbmVIZWlnaHQ7XG5cdFx0XHRjb25zdCBtaW5pbWFwQ2hhcldpZHRoID0gdGhpcy5fbW9kZWwub3B0aW9ucy5taW5pbWFwQ2hhcldpZHRoO1xuXHRcdFx0Y29uc3QgdGFiU2l6ZSA9IHRoaXMuX21vZGVsLmdldE9wdGlvbnMoKS50YWJTaXplO1xuXHRcdFx0Y29uc3QgY2FudmFzQ29udGV4dCA9IHRoaXMuX2RlY29yYXRpb25zQ2FudmFzLmRvbU5vZGUuZ2V0Q29udGV4dCgnMmQnKSE7XG5cblx0XHRcdGNhbnZhc0NvbnRleHQuY2xlYXJSZWN0KDAsIDAsIGNhbnZhc0lubmVyV2lkdGgsIGNhbnZhc0lubmVySGVpZ2h0KTtcblxuXHRcdFx0Ly8gV2UgZmlyc3QgbmVlZCB0byByZW5kZXIgbGluZSBoaWdobGlnaHRzIGFuZCB0aGVuIHJlbmRlciBkZWNvcmF0aW9ucyBvbiB0b3Agb2YgdGhvc2UuXG5cdFx0XHQvLyBCdXQgd2UgbmVlZCB0byBwaWNrIGEgc2luZ2xlIGNvbG9yIGZvciBlYWNoIGxpbmUsIGFuZCB1c2UgdGhhdCBhcyBhIGxpbmUgaGlnaGxpZ2h0LlxuXHRcdFx0Ly8gVGhpcyBuZWVkcyB0byBiZSB0aGUgY29sb3Igb2YgdGhlIGRlY29yYXRpb24gd2l0aCB0aGUgaGlnaGVzdCBgekluZGV4YCwgYnV0IHByaW9yaXR5XG5cdFx0XHQvLyBpcyBnaXZlbiB0byB0aGUgc2VsZWN0aW9uLlxuXG5cdFx0XHRjb25zdCBoaWdobGlnaHRlZExpbmVzID0gbmV3IENvbnRpZ3VvdXNMaW5lTWFwPGJvb2xlYW4+KGxheW91dC5zdGFydExpbmVOdW1iZXIsIGxheW91dC5lbmRMaW5lTnVtYmVyLCBmYWxzZSk7XG5cdFx0XHR0aGlzLl9yZW5kZXJTZWxlY3Rpb25MaW5lSGlnaGxpZ2h0cyhjYW52YXNDb250ZXh0LCBzZWxlY3Rpb25zLCBoaWdobGlnaHRlZExpbmVzLCBsYXlvdXQsIG1pbmltYXBMaW5lSGVpZ2h0KTtcblx0XHRcdHRoaXMuX3JlbmRlckRlY29yYXRpb25zTGluZUhpZ2hsaWdodHMoY2FudmFzQ29udGV4dCwgZGVjb3JhdGlvbnMsIGhpZ2hsaWdodGVkTGluZXMsIGxheW91dCwgbWluaW1hcExpbmVIZWlnaHQpO1xuXG5cdFx0XHRjb25zdCBsaW5lT2Zmc2V0TWFwID0gbmV3IENvbnRpZ3VvdXNMaW5lTWFwPG51bWJlcltdIHwgbnVsbD4obGF5b3V0LnN0YXJ0TGluZU51bWJlciwgbGF5b3V0LmVuZExpbmVOdW1iZXIsIG51bGwpO1xuXHRcdFx0dGhpcy5fcmVuZGVyU2VsZWN0aW9uc0hpZ2hsaWdodHMoY2FudmFzQ29udGV4dCwgc2VsZWN0aW9ucywgbGluZU9mZnNldE1hcCwgbGF5b3V0LCBtaW5pbWFwTGluZUhlaWdodCwgdGFiU2l6ZSwgbWluaW1hcENoYXJXaWR0aCwgY2FudmFzSW5uZXJXaWR0aCk7XG5cdFx0XHR0aGlzLl9yZW5kZXJEZWNvcmF0aW9uc0hpZ2hsaWdodHMoY2FudmFzQ29udGV4dCwgZGVjb3JhdGlvbnMsIGxpbmVPZmZzZXRNYXAsIGxheW91dCwgbWluaW1hcExpbmVIZWlnaHQsIHRhYlNpemUsIG1pbmltYXBDaGFyV2lkdGgsIGNhbnZhc0lubmVyV2lkdGgpO1xuXHRcdFx0dGhpcy5fcmVuZGVyU2VjdGlvbkhlYWRlcnMobGF5b3V0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJTZWxlY3Rpb25MaW5lSGlnaGxpZ2h0cyhcblx0XHRjYW52YXNDb250ZXh0OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsXG5cdFx0c2VsZWN0aW9uczogU2VsZWN0aW9uW10sXG5cdFx0aGlnaGxpZ2h0ZWRMaW5lczogQ29udGlndW91c0xpbmVNYXA8Ym9vbGVhbj4sXG5cdFx0bGF5b3V0OiBNaW5pbWFwTGF5b3V0LFxuXHRcdG1pbmltYXBMaW5lSGVpZ2h0OiBudW1iZXJcblx0KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zZWxlY3Rpb25Db2xvciB8fCB0aGlzLl9zZWxlY3Rpb25Db2xvci5pc1RyYW5zcGFyZW50KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjYW52YXNDb250ZXh0LmZpbGxTdHlsZSA9IHRoaXMuX3NlbGVjdGlvbkNvbG9yLnRyYW5zcGFyZW50KDAuNSkudG9TdHJpbmcoKTtcblxuXHRcdGxldCB5MSA9IDA7XG5cdFx0bGV0IHkyID0gMDtcblxuXHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIHNlbGVjdGlvbnMpIHtcblx0XHRcdGNvbnN0IGludGVyc2VjdGlvbiA9IGxheW91dC5pbnRlcnNlY3RXaXRoVmlld3BvcnQoc2VsZWN0aW9uKTtcblx0XHRcdGlmICghaW50ZXJzZWN0aW9uKSB7XG5cdFx0XHRcdC8vIGVudGlyZWx5IG91dHNpZGUgbWluaW1hcCdzIHZpZXdwb3J0XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgW3N0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlcl0gPSBpbnRlcnNlY3Rpb247XG5cblx0XHRcdGZvciAobGV0IGxpbmUgPSBzdGFydExpbmVOdW1iZXI7IGxpbmUgPD0gZW5kTGluZU51bWJlcjsgbGluZSsrKSB7XG5cdFx0XHRcdGhpZ2hsaWdodGVkTGluZXMuc2V0KGxpbmUsIHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB5eTEgPSBsYXlvdXQuZ2V0WUZvckxpbmVOdW1iZXIoc3RhcnRMaW5lTnVtYmVyLCBtaW5pbWFwTGluZUhlaWdodCk7XG5cdFx0XHRjb25zdCB5eTIgPSBsYXlvdXQuZ2V0WUZvckxpbmVOdW1iZXIoZW5kTGluZU51bWJlciwgbWluaW1hcExpbmVIZWlnaHQpO1xuXG5cdFx0XHRpZiAoeTIgPj0geXkxKSB7XG5cdFx0XHRcdC8vIG1lcmdlIGludG8gcHJldmlvdXNcblx0XHRcdFx0eTIgPSB5eTI7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoeTIgPiB5MSkge1xuXHRcdFx0XHRcdC8vIGZsdXNoXG5cdFx0XHRcdFx0Y2FudmFzQ29udGV4dC5maWxsUmVjdChNSU5JTUFQX0dVVFRFUl9XSURUSCwgeTEsIGNhbnZhc0NvbnRleHQuY2FudmFzLndpZHRoLCB5MiAtIHkxKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR5MSA9IHl5MTtcblx0XHRcdFx0eTIgPSB5eTI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHkyID4geTEpIHtcblx0XHRcdC8vIGZsdXNoXG5cdFx0XHRjYW52YXNDb250ZXh0LmZpbGxSZWN0KE1JTklNQVBfR1VUVEVSX1dJRFRILCB5MSwgY2FudmFzQ29udGV4dC5jYW52YXMud2lkdGgsIHkyIC0geTEpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckRlY29yYXRpb25zTGluZUhpZ2hsaWdodHMoXG5cdFx0Y2FudmFzQ29udGV4dDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELFxuXHRcdGRlY29yYXRpb25zOiBWaWV3TW9kZWxEZWNvcmF0aW9uW10sXG5cdFx0aGlnaGxpZ2h0ZWRMaW5lczogQ29udGlndW91c0xpbmVNYXA8Ym9vbGVhbj4sXG5cdFx0bGF5b3V0OiBNaW5pbWFwTGF5b3V0LFxuXHRcdG1pbmltYXBMaW5lSGVpZ2h0OiBudW1iZXJcblx0KTogdm9pZCB7XG5cblx0XHRjb25zdCBoaWdobGlnaHRDb2xvcnMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdFx0Ly8gTG9vcCBiYWNrd2FyZHMgdG8gaGl0IGZpcnN0IGRlY29yYXRpb25zIHdpdGggaGlnaGVyIGB6SW5kZXhgXG5cdFx0Zm9yIChsZXQgaSA9IGRlY29yYXRpb25zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uID0gZGVjb3JhdGlvbnNbaV07XG5cblx0XHRcdGNvbnN0IG1pbmltYXBPcHRpb25zID0gPE1vZGVsRGVjb3JhdGlvbk1pbmltYXBPcHRpb25zIHwgbnVsbCB8IHVuZGVmaW5lZD5kZWNvcmF0aW9uLm9wdGlvbnMubWluaW1hcDtcblx0XHRcdGlmICghbWluaW1hcE9wdGlvbnMgfHwgbWluaW1hcE9wdGlvbnMucG9zaXRpb24gIT09IE1pbmltYXBQb3NpdGlvbi5JbmxpbmUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGludGVyc2VjdGlvbiA9IGxheW91dC5pbnRlcnNlY3RXaXRoVmlld3BvcnQoZGVjb3JhdGlvbi5yYW5nZSk7XG5cdFx0XHRpZiAoIWludGVyc2VjdGlvbikge1xuXHRcdFx0XHQvLyBlbnRpcmVseSBvdXRzaWRlIG1pbmltYXAncyB2aWV3cG9ydFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IFtzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXJdID0gaW50ZXJzZWN0aW9uO1xuXG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uQ29sb3IgPSBtaW5pbWFwT3B0aW9ucy5nZXRDb2xvcih0aGlzLl90aGVtZS52YWx1ZSk7XG5cdFx0XHRpZiAoIWRlY29yYXRpb25Db2xvciB8fCBkZWNvcmF0aW9uQ29sb3IuaXNUcmFuc3BhcmVudCgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgaGlnaGxpZ2h0Q29sb3IgPSBoaWdobGlnaHRDb2xvcnMuZ2V0KGRlY29yYXRpb25Db2xvci50b1N0cmluZygpKTtcblx0XHRcdGlmICghaGlnaGxpZ2h0Q29sb3IpIHtcblx0XHRcdFx0aGlnaGxpZ2h0Q29sb3IgPSBkZWNvcmF0aW9uQ29sb3IudHJhbnNwYXJlbnQoMC41KS50b1N0cmluZygpO1xuXHRcdFx0XHRoaWdobGlnaHRDb2xvcnMuc2V0KGRlY29yYXRpb25Db2xvci50b1N0cmluZygpLCBoaWdobGlnaHRDb2xvcik7XG5cdFx0XHR9XG5cblx0XHRcdGNhbnZhc0NvbnRleHQuZmlsbFN0eWxlID0gaGlnaGxpZ2h0Q29sb3I7XG5cdFx0XHRmb3IgKGxldCBsaW5lID0gc3RhcnRMaW5lTnVtYmVyOyBsaW5lIDw9IGVuZExpbmVOdW1iZXI7IGxpbmUrKykge1xuXHRcdFx0XHRpZiAoaGlnaGxpZ2h0ZWRMaW5lcy5oYXMobGluZSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRoaWdobGlnaHRlZExpbmVzLnNldChsaW5lLCB0cnVlKTtcblx0XHRcdFx0Y29uc3QgeSA9IGxheW91dC5nZXRZRm9yTGluZU51bWJlcihsaW5lLCBtaW5pbWFwTGluZUhlaWdodCk7XG5cdFx0XHRcdGNhbnZhc0NvbnRleHQuZmlsbFJlY3QoTUlOSU1BUF9HVVRURVJfV0lEVEgsIHksIGNhbnZhc0NvbnRleHQuY2FudmFzLndpZHRoLCBtaW5pbWFwTGluZUhlaWdodCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyU2VsZWN0aW9uc0hpZ2hsaWdodHMoXG5cdFx0Y2FudmFzQ29udGV4dDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELFxuXHRcdHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLFxuXHRcdGxpbmVPZmZzZXRNYXA6IENvbnRpZ3VvdXNMaW5lTWFwPG51bWJlcltdIHwgbnVsbD4sXG5cdFx0bGF5b3V0OiBNaW5pbWFwTGF5b3V0LFxuXHRcdGxpbmVIZWlnaHQ6IG51bWJlcixcblx0XHR0YWJTaXplOiBudW1iZXIsXG5cdFx0Y2hhcmFjdGVyV2lkdGg6IG51bWJlcixcblx0XHRjYW52YXNJbm5lcldpZHRoOiBudW1iZXJcblx0KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zZWxlY3Rpb25Db2xvciB8fCB0aGlzLl9zZWxlY3Rpb25Db2xvci5pc1RyYW5zcGFyZW50KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzZWxlY3Rpb24gb2Ygc2VsZWN0aW9ucykge1xuXHRcdFx0Y29uc3QgaW50ZXJzZWN0aW9uID0gbGF5b3V0LmludGVyc2VjdFdpdGhWaWV3cG9ydChzZWxlY3Rpb24pO1xuXHRcdFx0aWYgKCFpbnRlcnNlY3Rpb24pIHtcblx0XHRcdFx0Ly8gZW50aXJlbHkgb3V0c2lkZSBtaW5pbWFwJ3Mgdmlld3BvcnRcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBbc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyXSA9IGludGVyc2VjdGlvbjtcblxuXHRcdFx0Zm9yIChsZXQgbGluZSA9IHN0YXJ0TGluZU51bWJlcjsgbGluZSA8PSBlbmRMaW5lTnVtYmVyOyBsaW5lKyspIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJEZWNvcmF0aW9uT25MaW5lKGNhbnZhc0NvbnRleHQsIGxpbmVPZmZzZXRNYXAsIHNlbGVjdGlvbiwgdGhpcy5fc2VsZWN0aW9uQ29sb3IsIGxheW91dCwgbGluZSwgbGluZUhlaWdodCwgbGluZUhlaWdodCwgdGFiU2l6ZSwgY2hhcmFjdGVyV2lkdGgsIGNhbnZhc0lubmVyV2lkdGgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckRlY29yYXRpb25zSGlnaGxpZ2h0cyhcblx0XHRjYW52YXNDb250ZXh0OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsXG5cdFx0ZGVjb3JhdGlvbnM6IFZpZXdNb2RlbERlY29yYXRpb25bXSxcblx0XHRsaW5lT2Zmc2V0TWFwOiBDb250aWd1b3VzTGluZU1hcDxudW1iZXJbXSB8IG51bGw+LFxuXHRcdGxheW91dDogTWluaW1hcExheW91dCxcblx0XHRtaW5pbWFwTGluZUhlaWdodDogbnVtYmVyLFxuXHRcdHRhYlNpemU6IG51bWJlcixcblx0XHRjaGFyYWN0ZXJXaWR0aDogbnVtYmVyLFxuXHRcdGNhbnZhc0lubmVyV2lkdGg6IG51bWJlclxuXHQpOiB2b2lkIHtcblx0XHQvLyBMb29wIGZvcndhcmRzIHRvIGhpdCBmaXJzdCBkZWNvcmF0aW9ucyB3aXRoIGxvd2VyIGB6SW5kZXhgXG5cdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIGRlY29yYXRpb25zKSB7XG5cblx0XHRcdGNvbnN0IG1pbmltYXBPcHRpb25zID0gPE1vZGVsRGVjb3JhdGlvbk1pbmltYXBPcHRpb25zIHwgbnVsbCB8IHVuZGVmaW5lZD5kZWNvcmF0aW9uLm9wdGlvbnMubWluaW1hcDtcblx0XHRcdGlmICghbWluaW1hcE9wdGlvbnMpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGludGVyc2VjdGlvbiA9IGxheW91dC5pbnRlcnNlY3RXaXRoVmlld3BvcnQoZGVjb3JhdGlvbi5yYW5nZSk7XG5cdFx0XHRpZiAoIWludGVyc2VjdGlvbikge1xuXHRcdFx0XHQvLyBlbnRpcmVseSBvdXRzaWRlIG1pbmltYXAncyB2aWV3cG9ydFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IFtzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXJdID0gaW50ZXJzZWN0aW9uO1xuXG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uQ29sb3IgPSBtaW5pbWFwT3B0aW9ucy5nZXRDb2xvcih0aGlzLl90aGVtZS52YWx1ZSk7XG5cdFx0XHRpZiAoIWRlY29yYXRpb25Db2xvciB8fCBkZWNvcmF0aW9uQ29sb3IuaXNUcmFuc3BhcmVudCgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGxldCBsaW5lID0gc3RhcnRMaW5lTnVtYmVyOyBsaW5lIDw9IGVuZExpbmVOdW1iZXI7IGxpbmUrKykge1xuXHRcdFx0XHRzd2l0Y2ggKG1pbmltYXBPcHRpb25zLnBvc2l0aW9uKSB7XG5cblx0XHRcdFx0XHRjYXNlIE1pbmltYXBQb3NpdGlvbi5JbmxpbmU6XG5cdFx0XHRcdFx0XHR0aGlzLnJlbmRlckRlY29yYXRpb25PbkxpbmUoY2FudmFzQ29udGV4dCwgbGluZU9mZnNldE1hcCwgZGVjb3JhdGlvbi5yYW5nZSwgZGVjb3JhdGlvbkNvbG9yLCBsYXlvdXQsIGxpbmUsIG1pbmltYXBMaW5lSGVpZ2h0LCBtaW5pbWFwTGluZUhlaWdodCwgdGFiU2l6ZSwgY2hhcmFjdGVyV2lkdGgsIGNhbnZhc0lubmVyV2lkdGgpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cblx0XHRcdFx0XHRjYXNlIE1pbmltYXBQb3NpdGlvbi5HdXR0ZXI6IHtcblx0XHRcdFx0XHRcdGNvbnN0IHkgPSBsYXlvdXQuZ2V0WUZvckxpbmVOdW1iZXIobGluZSwgbWluaW1hcExpbmVIZWlnaHQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgeCA9IDI7XG5cdFx0XHRcdFx0XHR0aGlzLnJlbmRlckRlY29yYXRpb24oY2FudmFzQ29udGV4dCwgZGVjb3JhdGlvbkNvbG9yLCB4LCB5LCBHVVRURVJfREVDT1JBVElPTl9XSURUSCwgbWluaW1hcExpbmVIZWlnaHQpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJEZWNvcmF0aW9uT25MaW5lKFxuXHRcdGNhbnZhc0NvbnRleHQ6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCxcblx0XHRsaW5lT2Zmc2V0TWFwOiBDb250aWd1b3VzTGluZU1hcDxudW1iZXJbXSB8IG51bGw+LFxuXHRcdGRlY29yYXRpb25SYW5nZTogUmFuZ2UsXG5cdFx0ZGVjb3JhdGlvbkNvbG9yOiBDb2xvciB8IHVuZGVmaW5lZCxcblx0XHRsYXlvdXQ6IE1pbmltYXBMYXlvdXQsXG5cdFx0bGluZU51bWJlcjogbnVtYmVyLFxuXHRcdGhlaWdodDogbnVtYmVyLFxuXHRcdG1pbmltYXBMaW5lSGVpZ2h0OiBudW1iZXIsXG5cdFx0dGFiU2l6ZTogbnVtYmVyLFxuXHRcdGNoYXJXaWR0aDogbnVtYmVyLFxuXHRcdGNhbnZhc0lubmVyV2lkdGg6IG51bWJlclxuXHQpOiB2b2lkIHtcblx0XHRjb25zdCB5ID0gbGF5b3V0LmdldFlGb3JMaW5lTnVtYmVyKGxpbmVOdW1iZXIsIG1pbmltYXBMaW5lSGVpZ2h0KTtcblxuXHRcdC8vIFNraXAgcmVuZGVyaW5nIHRoZSBsaW5lIGlmIGl0J3MgdmVydGljYWxseSBvdXRzaWRlIG91ciB2aWV3cG9ydFxuXHRcdGlmICh5ICsgaGVpZ2h0IDwgMCB8fCB5ID4gdGhpcy5fbW9kZWwub3B0aW9ucy5jYW52YXNJbm5lckhlaWdodCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyIH0gPSBkZWNvcmF0aW9uUmFuZ2U7XG5cdFx0Y29uc3Qgc3RhcnRDb2x1bW4gPSAoc3RhcnRMaW5lTnVtYmVyID09PSBsaW5lTnVtYmVyID8gZGVjb3JhdGlvblJhbmdlLnN0YXJ0Q29sdW1uIDogMSk7XG5cdFx0Y29uc3QgZW5kQ29sdW1uID0gKGVuZExpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIgPyBkZWNvcmF0aW9uUmFuZ2UuZW5kQ29sdW1uIDogdGhpcy5fbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKSk7XG5cblx0XHRjb25zdCB4MSA9IHRoaXMuZ2V0WE9mZnNldEZvclBvc2l0aW9uKGxpbmVPZmZzZXRNYXAsIGxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCB0YWJTaXplLCBjaGFyV2lkdGgsIGNhbnZhc0lubmVyV2lkdGgpO1xuXHRcdGNvbnN0IHgyID0gdGhpcy5nZXRYT2Zmc2V0Rm9yUG9zaXRpb24obGluZU9mZnNldE1hcCwgbGluZU51bWJlciwgZW5kQ29sdW1uLCB0YWJTaXplLCBjaGFyV2lkdGgsIGNhbnZhc0lubmVyV2lkdGgpO1xuXG5cdFx0dGhpcy5yZW5kZXJEZWNvcmF0aW9uKGNhbnZhc0NvbnRleHQsIGRlY29yYXRpb25Db2xvciwgeDEsIHksIHgyIC0geDEsIGhlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFhPZmZzZXRGb3JQb3NpdGlvbihcblx0XHRsaW5lT2Zmc2V0TWFwOiBDb250aWd1b3VzTGluZU1hcDxudW1iZXJbXSB8IG51bGw+LFxuXHRcdGxpbmVOdW1iZXI6IG51bWJlcixcblx0XHRjb2x1bW46IG51bWJlcixcblx0XHR0YWJTaXplOiBudW1iZXIsXG5cdFx0Y2hhcldpZHRoOiBudW1iZXIsXG5cdFx0Y2FudmFzSW5uZXJXaWR0aDogbnVtYmVyXG5cdCk6IG51bWJlciB7XG5cdFx0aWYgKGNvbHVtbiA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIE1JTklNQVBfR1VUVEVSX1dJRFRIO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1pbmltdW1YT2Zmc2V0ID0gKGNvbHVtbiAtIDEpICogY2hhcldpZHRoO1xuXHRcdGlmIChtaW5pbXVtWE9mZnNldCA+PSBjYW52YXNJbm5lcldpZHRoKSB7XG5cdFx0XHQvLyB0aGVyZSBpcyBubyBuZWVkIHRvIGxvb2sgYXQgYWN0dWFsIGNoYXJhY3RlcnMsXG5cdFx0XHQvLyBhcyB0aGlzIGNvbHVtbiBpcyBjZXJ0YWlubHkgYWZ0ZXIgdGhlIG1pbmltYXAgd2lkdGhcblx0XHRcdHJldHVybiBjYW52YXNJbm5lcldpZHRoO1xuXHRcdH1cblxuXHRcdC8vIENhY2hlIGxpbmUgb2Zmc2V0IGRhdGEgc28gdGhhdCBpdCBpcyBvbmx5IHJlYWQgb25jZSBwZXIgbGluZVxuXHRcdGxldCBsaW5lSW5kZXhUb1hPZmZzZXQgPSBsaW5lT2Zmc2V0TWFwLmdldChsaW5lTnVtYmVyKTtcblx0XHRpZiAoIWxpbmVJbmRleFRvWE9mZnNldCkge1xuXHRcdFx0Y29uc3QgbGluZURhdGEgPSB0aGlzLl9tb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0XHRcdGxpbmVJbmRleFRvWE9mZnNldCA9IFtNSU5JTUFQX0dVVFRFUl9XSURUSF07XG5cdFx0XHRsZXQgcHJldnggPSBNSU5JTUFQX0dVVFRFUl9XSURUSDtcblx0XHRcdGZvciAobGV0IGkgPSAxOyBpIDwgbGluZURhdGEubGVuZ3RoICsgMTsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNoYXJDb2RlID0gbGluZURhdGEuY2hhckNvZGVBdChpIC0gMSk7XG5cdFx0XHRcdGNvbnN0IGR4ID0gY2hhckNvZGUgPT09IENoYXJDb2RlLlRhYlxuXHRcdFx0XHRcdD8gdGFiU2l6ZSAqIGNoYXJXaWR0aFxuXHRcdFx0XHRcdDogc3RyaW5ncy5pc0Z1bGxXaWR0aENoYXJhY3RlcihjaGFyQ29kZSlcblx0XHRcdFx0XHRcdD8gMiAqIGNoYXJXaWR0aFxuXHRcdFx0XHRcdFx0OiBjaGFyV2lkdGg7XG5cblx0XHRcdFx0Y29uc3QgeCA9IHByZXZ4ICsgZHg7XG5cdFx0XHRcdGlmICh4ID49IGNhbnZhc0lubmVyV2lkdGgpIHtcblx0XHRcdFx0XHQvLyBubyBuZWVkIHRvIGtlZXAgb24gZ29pbmcsIGFzIHdlJ3ZlIGhpdCB0aGUgY2FudmFzIHdpZHRoXG5cdFx0XHRcdFx0bGluZUluZGV4VG9YT2Zmc2V0W2ldID0gY2FudmFzSW5uZXJXaWR0aDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxpbmVJbmRleFRvWE9mZnNldFtpXSA9IHg7XG5cdFx0XHRcdHByZXZ4ID0geDtcblx0XHRcdH1cblxuXHRcdFx0bGluZU9mZnNldE1hcC5zZXQobGluZU51bWJlciwgbGluZUluZGV4VG9YT2Zmc2V0KTtcblx0XHR9XG5cblx0XHRpZiAoY29sdW1uIC0gMSA8IGxpbmVJbmRleFRvWE9mZnNldC5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBsaW5lSW5kZXhUb1hPZmZzZXRbY29sdW1uIC0gMV07XG5cdFx0fVxuXHRcdC8vIGdvZXMgb3ZlciB0aGUgY2FudmFzIHdpZHRoXG5cdFx0cmV0dXJuIGNhbnZhc0lubmVyV2lkdGg7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckRlY29yYXRpb24oY2FudmFzQ29udGV4dDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBkZWNvcmF0aW9uQ29sb3I6IENvbG9yIHwgdW5kZWZpbmVkLCB4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpIHtcblx0XHRjYW52YXNDb250ZXh0LmZpbGxTdHlsZSA9IGRlY29yYXRpb25Db2xvciAmJiBkZWNvcmF0aW9uQ29sb3IudG9TdHJpbmcoKSB8fCAnJztcblx0XHRjYW52YXNDb250ZXh0LmZpbGxSZWN0KHgsIHksIHdpZHRoLCBoZWlnaHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyU2VjdGlvbkhlYWRlcnMobGF5b3V0OiBNaW5pbWFwTGF5b3V0KSB7XG5cdFx0Y29uc3QgbWluaW1hcExpbmVIZWlnaHQgPSB0aGlzLl9tb2RlbC5vcHRpb25zLm1pbmltYXBMaW5lSGVpZ2h0O1xuXHRcdGNvbnN0IHNlY3Rpb25IZWFkZXJGb250U2l6ZSA9IHRoaXMuX21vZGVsLm9wdGlvbnMuc2VjdGlvbkhlYWRlckZvbnRTaXplO1xuXHRcdGNvbnN0IHNlY3Rpb25IZWFkZXJMZXR0ZXJTcGFjaW5nID0gdGhpcy5fbW9kZWwub3B0aW9ucy5zZWN0aW9uSGVhZGVyTGV0dGVyU3BhY2luZztcblx0XHRjb25zdCBiYWNrZ3JvdW5kRmlsbEhlaWdodCA9IHNlY3Rpb25IZWFkZXJGb250U2l6ZSAqIDEuNTtcblx0XHRjb25zdCB7IGNhbnZhc0lubmVyV2lkdGggfSA9IHRoaXMuX21vZGVsLm9wdGlvbnM7XG5cblx0XHRjb25zdCBiYWNrZ3JvdW5kQ29sb3IgPSB0aGlzLl9tb2RlbC5vcHRpb25zLmJhY2tncm91bmRDb2xvcjtcblx0XHRjb25zdCBiYWNrZ3JvdW5kRmlsbCA9IGByZ2IoJHtiYWNrZ3JvdW5kQ29sb3Iucn0gJHtiYWNrZ3JvdW5kQ29sb3IuZ30gJHtiYWNrZ3JvdW5kQ29sb3IuYn0gLyAuNylgO1xuXHRcdGNvbnN0IGZvcmVncm91bmRDb2xvciA9IHRoaXMuX21vZGVsLm9wdGlvbnMuc2VjdGlvbkhlYWRlckZvbnRDb2xvcjtcblx0XHRjb25zdCBmb3JlZ3JvdW5kRmlsbCA9IGByZ2IoJHtmb3JlZ3JvdW5kQ29sb3Iucn0gJHtmb3JlZ3JvdW5kQ29sb3IuZ30gJHtmb3JlZ3JvdW5kQ29sb3IuYn0pYDtcblx0XHRjb25zdCBzZXBhcmF0b3JTdHJva2UgPSBmb3JlZ3JvdW5kRmlsbDtcblxuXHRcdGNvbnN0IGNhbnZhc0NvbnRleHQgPSB0aGlzLl9kZWNvcmF0aW9uc0NhbnZhcy5kb21Ob2RlLmdldENvbnRleHQoJzJkJykhO1xuXHRcdGNhbnZhc0NvbnRleHQubGV0dGVyU3BhY2luZyA9IHNlY3Rpb25IZWFkZXJMZXR0ZXJTcGFjaW5nICsgJ3B4Jztcblx0XHRjYW52YXNDb250ZXh0LmZvbnQgPSAnNTAwICcgKyBzZWN0aW9uSGVhZGVyRm9udFNpemUgKyAncHggJyArIHRoaXMuX21vZGVsLm9wdGlvbnMuc2VjdGlvbkhlYWRlckZvbnRGYW1pbHk7XG5cdFx0Y2FudmFzQ29udGV4dC5zdHJva2VTdHlsZSA9IHNlcGFyYXRvclN0cm9rZTtcblx0XHRjYW52YXNDb250ZXh0LmxpbmVXaWR0aCA9IDAuNDtcblxuXHRcdGNvbnN0IGRlY29yYXRpb25zID0gdGhpcy5fbW9kZWwuZ2V0U2VjdGlvbkhlYWRlckRlY29yYXRpb25zSW5WaWV3cG9ydChsYXlvdXQuc3RhcnRMaW5lTnVtYmVyLCBsYXlvdXQuZW5kTGluZU51bWJlcik7XG5cdFx0ZGVjb3JhdGlvbnMuc29ydCgoYSwgYikgPT4gYS5yYW5nZS5zdGFydExpbmVOdW1iZXIgLSBiLnJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cblx0XHRjb25zdCBmaXRXaWR0aCA9IElubmVyTWluaW1hcC5fZml0U2VjdGlvbkhlYWRlci5iaW5kKG51bGwsIGNhbnZhc0NvbnRleHQsXG5cdFx0XHRjYW52YXNJbm5lcldpZHRoIC0gTUlOSU1BUF9HVVRURVJfV0lEVEgpO1xuXG5cdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIGRlY29yYXRpb25zKSB7XG5cdFx0XHRjb25zdCB5ID0gbGF5b3V0LmdldFlGb3JMaW5lTnVtYmVyKGRlY29yYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBtaW5pbWFwTGluZUhlaWdodCkgKyBzZWN0aW9uSGVhZGVyRm9udFNpemU7XG5cdFx0XHRjb25zdCBiYWNrZ3JvdW5kRmlsbFkgPSB5IC0gc2VjdGlvbkhlYWRlckZvbnRTaXplO1xuXHRcdFx0Y29uc3Qgc2VwYXJhdG9yWSA9IGJhY2tncm91bmRGaWxsWSArIDI7XG5cdFx0XHRjb25zdCBoZWFkZXJUZXh0ID0gdGhpcy5fbW9kZWwuZ2V0U2VjdGlvbkhlYWRlclRleHQoZGVjb3JhdGlvbiwgZml0V2lkdGgpO1xuXG5cdFx0XHRJbm5lck1pbmltYXAuX3JlbmRlclNlY3Rpb25MYWJlbChcblx0XHRcdFx0Y2FudmFzQ29udGV4dCxcblx0XHRcdFx0aGVhZGVyVGV4dCxcblx0XHRcdFx0ZGVjb3JhdGlvbi5vcHRpb25zLm1pbmltYXA/LnNlY3Rpb25IZWFkZXJTdHlsZSA9PT0gTWluaW1hcFNlY3Rpb25IZWFkZXJTdHlsZS5VbmRlcmxpbmVkLFxuXHRcdFx0XHRiYWNrZ3JvdW5kRmlsbCxcblx0XHRcdFx0Zm9yZWdyb3VuZEZpbGwsXG5cdFx0XHRcdGNhbnZhc0lubmVyV2lkdGgsXG5cdFx0XHRcdGJhY2tncm91bmRGaWxsWSxcblx0XHRcdFx0YmFja2dyb3VuZEZpbGxIZWlnaHQsXG5cdFx0XHRcdHksXG5cdFx0XHRcdHNlcGFyYXRvclkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9maXRTZWN0aW9uSGVhZGVyKFxuXHRcdHRhcmdldDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELFxuXHRcdG1heFdpZHRoOiBudW1iZXIsXG5cdFx0aGVhZGVyVGV4dDogc3RyaW5nLFxuXHQpOiBzdHJpbmcge1xuXHRcdGlmICghaGVhZGVyVGV4dCkge1xuXHRcdFx0cmV0dXJuIGhlYWRlclRleHQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWxsaXBzaXMgPSAnXHUyMDI2Jztcblx0XHRjb25zdCB3aWR0aCA9IHRhcmdldC5tZWFzdXJlVGV4dChoZWFkZXJUZXh0KS53aWR0aDtcblx0XHRjb25zdCBlbGxpcHNpc1dpZHRoID0gdGFyZ2V0Lm1lYXN1cmVUZXh0KGVsbGlwc2lzKS53aWR0aDtcblxuXHRcdGlmICh3aWR0aCA8PSBtYXhXaWR0aCB8fCB3aWR0aCA8PSBlbGxpcHNpc1dpZHRoKSB7XG5cdFx0XHRyZXR1cm4gaGVhZGVyVGV4dDtcblx0XHR9XG5cblx0XHRjb25zdCBsZW4gPSBoZWFkZXJUZXh0Lmxlbmd0aDtcblx0XHRjb25zdCBhdmVyYWdlQ2hhcldpZHRoID0gd2lkdGggLyBoZWFkZXJUZXh0Lmxlbmd0aDtcblx0XHRjb25zdCBtYXhDaGFyQ291bnQgPSBNYXRoLmZsb29yKChtYXhXaWR0aCAtIGVsbGlwc2lzV2lkdGgpIC8gYXZlcmFnZUNoYXJXaWR0aCkgLSAxO1xuXG5cdFx0Ly8gRmluZCBhIGhhbGZ3YXkgcG9pbnQgdGhhdCBpc24ndCBhZnRlciB3aGl0ZXNwYWNlXG5cdFx0bGV0IGhhbGZDaGFyQ291bnQgPSBNYXRoLmNlaWwobWF4Q2hhckNvdW50IC8gMik7XG5cdFx0d2hpbGUgKGhhbGZDaGFyQ291bnQgPiAwICYmIC9cXHMvLnRlc3QoaGVhZGVyVGV4dFtoYWxmQ2hhckNvdW50IC0gMV0pKSB7XG5cdFx0XHQtLWhhbGZDaGFyQ291bnQ7XG5cdFx0fVxuXG5cdFx0Ly8gU3BsaXQgd2l0aCBlbGxpcHNpc1xuXHRcdHJldHVybiBoZWFkZXJUZXh0LnN1YnN0cmluZygwLCBoYWxmQ2hhckNvdW50KVxuXHRcdFx0KyBlbGxpcHNpcyArIGhlYWRlclRleHQuc3Vic3RyaW5nKGxlbiAtIChtYXhDaGFyQ291bnQgLSBoYWxmQ2hhckNvdW50KSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmVuZGVyU2VjdGlvbkxhYmVsKFxuXHRcdHRhcmdldDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELFxuXHRcdGhlYWRlclRleHQ6IHN0cmluZyB8IG51bGwsXG5cdFx0aGFzU2VwYXJhdG9yTGluZTogYm9vbGVhbixcblx0XHRiYWNrZ3JvdW5kRmlsbDogc3RyaW5nLFxuXHRcdGZvcmVncm91bmRGaWxsOiBzdHJpbmcsXG5cdFx0bWluaW1hcFdpZHRoOiBudW1iZXIsXG5cdFx0YmFja2dyb3VuZEZpbGxZOiBudW1iZXIsXG5cdFx0YmFja2dyb3VuZEZpbGxIZWlnaHQ6IG51bWJlcixcblx0XHR0ZXh0WTogbnVtYmVyLFxuXHRcdHNlcGFyYXRvclk6IG51bWJlclxuXHQpOiB2b2lkIHtcblx0XHRpZiAoaGVhZGVyVGV4dCkge1xuXHRcdFx0dGFyZ2V0LmZpbGxTdHlsZSA9IGJhY2tncm91bmRGaWxsO1xuXHRcdFx0dGFyZ2V0LmZpbGxSZWN0KDAsIGJhY2tncm91bmRGaWxsWSwgbWluaW1hcFdpZHRoLCBiYWNrZ3JvdW5kRmlsbEhlaWdodCk7XG5cblx0XHRcdHRhcmdldC5maWxsU3R5bGUgPSBmb3JlZ3JvdW5kRmlsbDtcblx0XHRcdHRhcmdldC5maWxsVGV4dChoZWFkZXJUZXh0LCBNSU5JTUFQX0dVVFRFUl9XSURUSCwgdGV4dFkpO1xuXHRcdH1cblxuXHRcdGlmIChoYXNTZXBhcmF0b3JMaW5lKSB7XG5cdFx0XHR0YXJnZXQuYmVnaW5QYXRoKCk7XG5cdFx0XHR0YXJnZXQubW92ZVRvKDAsIHNlcGFyYXRvclkpO1xuXHRcdFx0dGFyZ2V0LmxpbmVUbyhtaW5pbWFwV2lkdGgsIHNlcGFyYXRvclkpO1xuXHRcdFx0dGFyZ2V0LmNsb3NlUGF0aCgpO1xuXHRcdFx0dGFyZ2V0LnN0cm9rZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTGluZXMobGF5b3V0OiBNaW5pbWFwTGF5b3V0KTogUmVuZGVyRGF0YSB8IG51bGwge1xuXHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IGxheW91dC5zdGFydExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IGxheW91dC5lbmRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IG1pbmltYXBMaW5lSGVpZ2h0ID0gdGhpcy5fbW9kZWwub3B0aW9ucy5taW5pbWFwTGluZUhlaWdodDtcblxuXHRcdC8vIENoZWNrIGlmIG5vdGhpbmcgY2hhbmdlZCB3LnIudC4gbGluZXMgZnJvbSBsYXN0IGZyYW1lXG5cdFx0aWYgKHRoaXMuX2xhc3RSZW5kZXJEYXRhICYmIHRoaXMuX2xhc3RSZW5kZXJEYXRhLmxpbmVzRXF1YWxzKGxheW91dCkpIHtcblx0XHRcdGNvbnN0IF9sYXN0RGF0YSA9IHRoaXMuX2xhc3RSZW5kZXJEYXRhLl9nZXQoKTtcblx0XHRcdC8vIE5pY2UhISBOb3RoaW5nIGNoYW5nZWQgZnJvbSBsYXN0IGZyYW1lXG5cdFx0XHRyZXR1cm4gbmV3IFJlbmRlckRhdGEobGF5b3V0LCBfbGFzdERhdGEuaW1hZ2VEYXRhLCBfbGFzdERhdGEubGluZXMpO1xuXHRcdH1cblxuXHRcdC8vIE9oIHdlbGwhISBXZSBuZWVkIHRvIHJlcGFpbnQgc29tZSBsaW5lcy4uLlxuXG5cdFx0Y29uc3QgaW1hZ2VEYXRhID0gdGhpcy5fZ2V0QnVmZmVyKCk7XG5cdFx0aWYgKCFpbWFnZURhdGEpIHtcblx0XHRcdC8vIDAgd2lkdGggb3IgMCBoZWlnaHQgY2FudmFzLCBub3RoaW5nIHRvIGRvXG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBSZW5kZXIgdW50b3VjaGVkIGxpbmVzIGJ5IHVzaW5nIGxhc3QgcmVuZGVyZWQgZGF0YS5cblx0XHRjb25zdCBbX2RpcnR5WTEsIF9kaXJ0eVkyLCBuZWVkZWRdID0gSW5uZXJNaW5pbWFwLl9yZW5kZXJVbnRvdWNoZWRMaW5lcyhcblx0XHRcdGltYWdlRGF0YSxcblx0XHRcdGxheW91dC50b3BQYWRkaW5nTGluZUNvdW50LFxuXHRcdFx0c3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0ZW5kTGluZU51bWJlcixcblx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0LFxuXHRcdFx0dGhpcy5fbGFzdFJlbmRlckRhdGFcblx0XHQpO1xuXG5cdFx0Ly8gRmV0Y2ggcmVuZGVyaW5nIGluZm8gZnJvbSB2aWV3IG1vZGVsIGZvciByZXN0IG9mIGxpbmVzIHRoYXQgbmVlZCByZW5kZXJpbmcuXG5cdFx0Y29uc3QgbGluZUluZm8gPSB0aGlzLl9tb2RlbC5nZXRNaW5pbWFwTGluZXNSZW5kZXJpbmdEYXRhKHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlciwgbmVlZGVkKTtcblx0XHRjb25zdCB0YWJTaXplID0gdGhpcy5fbW9kZWwuZ2V0T3B0aW9ucygpLnRhYlNpemU7XG5cdFx0Y29uc3QgZGVmYXVsdEJhY2tncm91bmQgPSB0aGlzLl9tb2RlbC5vcHRpb25zLmRlZmF1bHRCYWNrZ3JvdW5kQ29sb3I7XG5cdFx0Y29uc3QgYmFja2dyb3VuZCA9IHRoaXMuX21vZGVsLm9wdGlvbnMuYmFja2dyb3VuZENvbG9yO1xuXHRcdGNvbnN0IGZvcmVncm91bmRBbHBoYSA9IHRoaXMuX21vZGVsLm9wdGlvbnMuZm9yZWdyb3VuZEFscGhhO1xuXHRcdGNvbnN0IHRva2Vuc0NvbG9yVHJhY2tlciA9IHRoaXMuX21vZGVsLnRva2Vuc0NvbG9yVHJhY2tlcjtcblx0XHRjb25zdCB1c2VMaWdodGVyRm9udCA9IHRva2Vuc0NvbG9yVHJhY2tlci5iYWNrZ3JvdW5kSXNMaWdodCgpO1xuXHRcdGNvbnN0IHJlbmRlck1pbmltYXAgPSB0aGlzLl9tb2RlbC5vcHRpb25zLnJlbmRlck1pbmltYXA7XG5cdFx0Y29uc3QgY2hhclJlbmRlcmVyID0gdGhpcy5fbW9kZWwub3B0aW9ucy5jaGFyUmVuZGVyZXIoKTtcblx0XHRjb25zdCBmb250U2NhbGUgPSB0aGlzLl9tb2RlbC5vcHRpb25zLmZvbnRTY2FsZTtcblx0XHRjb25zdCBtaW5pbWFwQ2hhcldpZHRoID0gdGhpcy5fbW9kZWwub3B0aW9ucy5taW5pbWFwQ2hhcldpZHRoO1xuXG5cdFx0Y29uc3QgYmFzZUNoYXJIZWlnaHQgPSAocmVuZGVyTWluaW1hcCA9PT0gUmVuZGVyTWluaW1hcC5UZXh0ID8gQ29uc3RhbnRzLkJBU0VfQ0hBUl9IRUlHSFQgOiBDb25zdGFudHMuQkFTRV9DSEFSX0hFSUdIVCArIDEpO1xuXHRcdGNvbnN0IHJlbmRlck1pbmltYXBMaW5lSGVpZ2h0ID0gYmFzZUNoYXJIZWlnaHQgKiBmb250U2NhbGU7XG5cdFx0Y29uc3QgaW5uZXJMaW5lUGFkZGluZyA9IChtaW5pbWFwTGluZUhlaWdodCA+IHJlbmRlck1pbmltYXBMaW5lSGVpZ2h0ID8gTWF0aC5mbG9vcigobWluaW1hcExpbmVIZWlnaHQgLSByZW5kZXJNaW5pbWFwTGluZUhlaWdodCkgLyAyKSA6IDApO1xuXG5cdFx0Ly8gUmVuZGVyIHRoZSByZXN0IG9mIGxpbmVzXG5cdFx0Y29uc3QgYmFja2dyb3VuZEEgPSBiYWNrZ3JvdW5kLmEgLyAyNTU7XG5cdFx0Y29uc3QgcmVuZGVyQmFja2dyb3VuZCA9IG5ldyBSR0JBOChcblx0XHRcdE1hdGgucm91bmQoKGJhY2tncm91bmQuciAtIGRlZmF1bHRCYWNrZ3JvdW5kLnIpICogYmFja2dyb3VuZEEgKyBkZWZhdWx0QmFja2dyb3VuZC5yKSxcblx0XHRcdE1hdGgucm91bmQoKGJhY2tncm91bmQuZyAtIGRlZmF1bHRCYWNrZ3JvdW5kLmcpICogYmFja2dyb3VuZEEgKyBkZWZhdWx0QmFja2dyb3VuZC5nKSxcblx0XHRcdE1hdGgucm91bmQoKGJhY2tncm91bmQuYiAtIGRlZmF1bHRCYWNrZ3JvdW5kLmIpICogYmFja2dyb3VuZEEgKyBkZWZhdWx0QmFja2dyb3VuZC5iKSxcblx0XHRcdDI1NVxuXHRcdCk7XG5cdFx0bGV0IGR5ID0gbGF5b3V0LnRvcFBhZGRpbmdMaW5lQ291bnQgKiBtaW5pbWFwTGluZUhlaWdodDtcblx0XHRjb25zdCByZW5kZXJlZExpbmVzOiBNaW5pbWFwTGluZVtdID0gW107XG5cdFx0Zm9yIChsZXQgbGluZUluZGV4ID0gMCwgbGluZUNvdW50ID0gZW5kTGluZU51bWJlciAtIHN0YXJ0TGluZU51bWJlciArIDE7IGxpbmVJbmRleCA8IGxpbmVDb3VudDsgbGluZUluZGV4KyspIHtcblx0XHRcdGlmIChuZWVkZWRbbGluZUluZGV4XSkge1xuXHRcdFx0XHRJbm5lck1pbmltYXAuX3JlbmRlckxpbmUoXG5cdFx0XHRcdFx0aW1hZ2VEYXRhLFxuXHRcdFx0XHRcdHJlbmRlckJhY2tncm91bmQsXG5cdFx0XHRcdFx0YmFja2dyb3VuZC5hLFxuXHRcdFx0XHRcdHVzZUxpZ2h0ZXJGb250LFxuXHRcdFx0XHRcdHJlbmRlck1pbmltYXAsXG5cdFx0XHRcdFx0bWluaW1hcENoYXJXaWR0aCxcblx0XHRcdFx0XHR0b2tlbnNDb2xvclRyYWNrZXIsXG5cdFx0XHRcdFx0Zm9yZWdyb3VuZEFscGhhLFxuXHRcdFx0XHRcdGNoYXJSZW5kZXJlcixcblx0XHRcdFx0XHRkeSxcblx0XHRcdFx0XHRpbm5lckxpbmVQYWRkaW5nLFxuXHRcdFx0XHRcdHRhYlNpemUsXG5cdFx0XHRcdFx0bGluZUluZm9bbGluZUluZGV4XSEsXG5cdFx0XHRcdFx0Zm9udFNjYWxlLFxuXHRcdFx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0XG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRyZW5kZXJlZExpbmVzW2xpbmVJbmRleF0gPSBuZXcgTWluaW1hcExpbmUoZHkpO1xuXHRcdFx0ZHkgKz0gbWluaW1hcExpbmVIZWlnaHQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlydHlZMSA9IChfZGlydHlZMSA9PT0gLTEgPyAwIDogX2RpcnR5WTEpO1xuXHRcdGNvbnN0IGRpcnR5WTIgPSAoX2RpcnR5WTIgPT09IC0xID8gaW1hZ2VEYXRhLmhlaWdodCA6IF9kaXJ0eVkyKTtcblx0XHRjb25zdCBkaXJ0eUhlaWdodCA9IGRpcnR5WTIgLSBkaXJ0eVkxO1xuXG5cdFx0Ly8gRmluYWxseSwgcGFpbnQgdG8gdGhlIGNhbnZhc1xuXHRcdGNvbnN0IGN0eCA9IHRoaXMuX2NhbnZhcy5kb21Ob2RlLmdldENvbnRleHQoJzJkJykhO1xuXHRcdGN0eC5wdXRJbWFnZURhdGEoaW1hZ2VEYXRhLCAwLCAwLCAwLCBkaXJ0eVkxLCBpbWFnZURhdGEud2lkdGgsIGRpcnR5SGVpZ2h0KTtcblxuXHRcdC8vIFNhdmUgcmVuZGVyZWQgZGF0YSBmb3IgcmV1c2Ugb24gbmV4dCBmcmFtZSBpZiBwb3NzaWJsZVxuXHRcdHJldHVybiBuZXcgUmVuZGVyRGF0YShcblx0XHRcdGxheW91dCxcblx0XHRcdGltYWdlRGF0YSxcblx0XHRcdHJlbmRlcmVkTGluZXNcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3JlbmRlclVudG91Y2hlZExpbmVzKFxuXHRcdHRhcmdldDogSW1hZ2VEYXRhLFxuXHRcdHRvcFBhZGRpbmdMaW5lQ291bnQ6IG51bWJlcixcblx0XHRzdGFydExpbmVOdW1iZXI6IG51bWJlcixcblx0XHRlbmRMaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0bWluaW1hcExpbmVIZWlnaHQ6IG51bWJlcixcblx0XHRsYXN0UmVuZGVyRGF0YTogUmVuZGVyRGF0YSB8IG51bGwsXG5cdCk6IFtudW1iZXIsIG51bWJlciwgYm9vbGVhbltdXSB7XG5cblx0XHRjb25zdCBuZWVkZWQ6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGlmICghbGFzdFJlbmRlckRhdGEpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBlbmRMaW5lTnVtYmVyIC0gc3RhcnRMaW5lTnVtYmVyICsgMTsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdG5lZWRlZFtpXSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gWy0xLCAtMSwgbmVlZGVkXTtcblx0XHR9XG5cblx0XHRjb25zdCBfbGFzdERhdGEgPSBsYXN0UmVuZGVyRGF0YS5fZ2V0KCk7XG5cdFx0Y29uc3QgbGFzdFRhcmdldERhdGEgPSBfbGFzdERhdGEuaW1hZ2VEYXRhLmRhdGE7XG5cdFx0Y29uc3QgbGFzdFN0YXJ0TGluZU51bWJlciA9IF9sYXN0RGF0YS5yZW5kTGluZU51bWJlclN0YXJ0O1xuXHRcdGNvbnN0IGxhc3RMaW5lcyA9IF9sYXN0RGF0YS5saW5lcztcblx0XHRjb25zdCBsYXN0TGluZXNMZW5ndGggPSBsYXN0TGluZXMubGVuZ3RoO1xuXHRcdGNvbnN0IFdJRFRIID0gdGFyZ2V0LndpZHRoO1xuXHRcdGNvbnN0IHRhcmdldERhdGEgPSB0YXJnZXQuZGF0YTtcblxuXHRcdGNvbnN0IG1heERlc3RQaXhlbCA9IChlbmRMaW5lTnVtYmVyIC0gc3RhcnRMaW5lTnVtYmVyICsgMSkgKiBtaW5pbWFwTGluZUhlaWdodCAqIFdJRFRIICogNDtcblx0XHRsZXQgZGlydHlQaXhlbDEgPSAtMTsgLy8gdGhlIHBpeGVsIG9mZnNldCB1cCB0byB3aGljaCBhbGwgdGhlIGRhdGEgaXMgZXF1YWwgdG8gdGhlIHByZXYgZnJhbWVcblx0XHRsZXQgZGlydHlQaXhlbDIgPSAtMTsgLy8gdGhlIHBpeGVsIG9mZnNldCBhZnRlciB3aGljaCBhbGwgdGhlIGRhdGEgaXMgZXF1YWwgdG8gdGhlIHByZXYgZnJhbWVcblxuXHRcdGxldCBjb3B5U291cmNlU3RhcnQgPSAtMTtcblx0XHRsZXQgY29weVNvdXJjZUVuZCA9IC0xO1xuXHRcdGxldCBjb3B5RGVzdFN0YXJ0ID0gLTE7XG5cdFx0bGV0IGNvcHlEZXN0RW5kID0gLTE7XG5cblx0XHRsZXQgZGVzdF9keSA9IHRvcFBhZGRpbmdMaW5lQ291bnQgKiBtaW5pbWFwTGluZUhlaWdodDtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IGVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgbGluZUluZGV4ID0gbGluZU51bWJlciAtIHN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGNvbnN0IGxhc3RMaW5lSW5kZXggPSBsaW5lTnVtYmVyIC0gbGFzdFN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGNvbnN0IHNvdXJjZV9keSA9IChsYXN0TGluZUluZGV4ID49IDAgJiYgbGFzdExpbmVJbmRleCA8IGxhc3RMaW5lc0xlbmd0aCA/IGxhc3RMaW5lc1tsYXN0TGluZUluZGV4XS5keSA6IC0xKTtcblxuXHRcdFx0aWYgKHNvdXJjZV9keSA9PT0gLTEpIHtcblx0XHRcdFx0bmVlZGVkW2xpbmVJbmRleF0gPSB0cnVlO1xuXHRcdFx0XHRkZXN0X2R5ICs9IG1pbmltYXBMaW5lSGVpZ2h0O1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc291cmNlU3RhcnQgPSBzb3VyY2VfZHkgKiBXSURUSCAqIDQ7XG5cdFx0XHRjb25zdCBzb3VyY2VFbmQgPSAoc291cmNlX2R5ICsgbWluaW1hcExpbmVIZWlnaHQpICogV0lEVEggKiA0O1xuXHRcdFx0Y29uc3QgZGVzdFN0YXJ0ID0gZGVzdF9keSAqIFdJRFRIICogNDtcblx0XHRcdGNvbnN0IGRlc3RFbmQgPSAoZGVzdF9keSArIG1pbmltYXBMaW5lSGVpZ2h0KSAqIFdJRFRIICogNDtcblxuXHRcdFx0aWYgKGNvcHlTb3VyY2VFbmQgPT09IHNvdXJjZVN0YXJ0ICYmIGNvcHlEZXN0RW5kID09PSBkZXN0U3RhcnQpIHtcblx0XHRcdFx0Ly8gY29udGlndW91cyB6b25lID0+IGV4dGVuZCBjb3B5IHJlcXVlc3Rcblx0XHRcdFx0Y29weVNvdXJjZUVuZCA9IHNvdXJjZUVuZDtcblx0XHRcdFx0Y29weURlc3RFbmQgPSBkZXN0RW5kO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGNvcHlTb3VyY2VTdGFydCAhPT0gLTEpIHtcblx0XHRcdFx0XHQvLyBmbHVzaCBleGlzdGluZyBjb3B5IHJlcXVlc3Rcblx0XHRcdFx0XHR0YXJnZXREYXRhLnNldChsYXN0VGFyZ2V0RGF0YS5zdWJhcnJheShjb3B5U291cmNlU3RhcnQsIGNvcHlTb3VyY2VFbmQpLCBjb3B5RGVzdFN0YXJ0KTtcblx0XHRcdFx0XHRpZiAoZGlydHlQaXhlbDEgPT09IC0xICYmIGNvcHlTb3VyY2VTdGFydCA9PT0gMCAmJiBjb3B5U291cmNlU3RhcnQgPT09IGNvcHlEZXN0U3RhcnQpIHtcblx0XHRcdFx0XHRcdGRpcnR5UGl4ZWwxID0gY29weVNvdXJjZUVuZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGRpcnR5UGl4ZWwyID09PSAtMSAmJiBjb3B5U291cmNlRW5kID09PSBtYXhEZXN0UGl4ZWwgJiYgY29weVNvdXJjZVN0YXJ0ID09PSBjb3B5RGVzdFN0YXJ0KSB7XG5cdFx0XHRcdFx0XHRkaXJ0eVBpeGVsMiA9IGNvcHlTb3VyY2VTdGFydDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29weVNvdXJjZVN0YXJ0ID0gc291cmNlU3RhcnQ7XG5cdFx0XHRcdGNvcHlTb3VyY2VFbmQgPSBzb3VyY2VFbmQ7XG5cdFx0XHRcdGNvcHlEZXN0U3RhcnQgPSBkZXN0U3RhcnQ7XG5cdFx0XHRcdGNvcHlEZXN0RW5kID0gZGVzdEVuZDtcblx0XHRcdH1cblxuXHRcdFx0bmVlZGVkW2xpbmVJbmRleF0gPSBmYWxzZTtcblx0XHRcdGRlc3RfZHkgKz0gbWluaW1hcExpbmVIZWlnaHQ7XG5cdFx0fVxuXG5cdFx0aWYgKGNvcHlTb3VyY2VTdGFydCAhPT0gLTEpIHtcblx0XHRcdC8vIGZsdXNoIGV4aXN0aW5nIGNvcHkgcmVxdWVzdFxuXHRcdFx0dGFyZ2V0RGF0YS5zZXQobGFzdFRhcmdldERhdGEuc3ViYXJyYXkoY29weVNvdXJjZVN0YXJ0LCBjb3B5U291cmNlRW5kKSwgY29weURlc3RTdGFydCk7XG5cdFx0XHRpZiAoZGlydHlQaXhlbDEgPT09IC0xICYmIGNvcHlTb3VyY2VTdGFydCA9PT0gMCAmJiBjb3B5U291cmNlU3RhcnQgPT09IGNvcHlEZXN0U3RhcnQpIHtcblx0XHRcdFx0ZGlydHlQaXhlbDEgPSBjb3B5U291cmNlRW5kO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGRpcnR5UGl4ZWwyID09PSAtMSAmJiBjb3B5U291cmNlRW5kID09PSBtYXhEZXN0UGl4ZWwgJiYgY29weVNvdXJjZVN0YXJ0ID09PSBjb3B5RGVzdFN0YXJ0KSB7XG5cdFx0XHRcdGRpcnR5UGl4ZWwyID0gY29weVNvdXJjZVN0YXJ0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGRpcnR5WTEgPSAoZGlydHlQaXhlbDEgPT09IC0xID8gLTEgOiBkaXJ0eVBpeGVsMSAvIChXSURUSCAqIDQpKTtcblx0XHRjb25zdCBkaXJ0eVkyID0gKGRpcnR5UGl4ZWwyID09PSAtMSA/IC0xIDogZGlydHlQaXhlbDIgLyAoV0lEVEggKiA0KSk7XG5cblx0XHRyZXR1cm4gW2RpcnR5WTEsIGRpcnR5WTIsIG5lZWRlZF07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmVuZGVyTGluZShcblx0XHR0YXJnZXQ6IEltYWdlRGF0YSxcblx0XHRiYWNrZ3JvdW5kQ29sb3I6IFJHQkE4LFxuXHRcdGJhY2tncm91bmRBbHBoYTogbnVtYmVyLFxuXHRcdHVzZUxpZ2h0ZXJGb250OiBib29sZWFuLFxuXHRcdHJlbmRlck1pbmltYXA6IFJlbmRlck1pbmltYXAsXG5cdFx0Y2hhcldpZHRoOiBudW1iZXIsXG5cdFx0Y29sb3JUcmFja2VyOiBNaW5pbWFwVG9rZW5zQ29sb3JUcmFja2VyLFxuXHRcdGZvcmVncm91bmRBbHBoYTogbnVtYmVyLFxuXHRcdG1pbmltYXBDaGFyUmVuZGVyZXI6IE1pbmltYXBDaGFyUmVuZGVyZXIsXG5cdFx0ZHk6IG51bWJlcixcblx0XHRpbm5lckxpbmVQYWRkaW5nOiBudW1iZXIsXG5cdFx0dGFiU2l6ZTogbnVtYmVyLFxuXHRcdGxpbmVEYXRhOiBWaWV3TGluZURhdGEsXG5cdFx0Zm9udFNjYWxlOiBudW1iZXIsXG5cdFx0bWluaW1hcExpbmVIZWlnaHQ6IG51bWJlclxuXHQpOiB2b2lkIHtcblx0XHRjb25zdCBjb250ZW50ID0gbGluZURhdGEuY29udGVudDtcblx0XHRjb25zdCB0b2tlbnMgPSBsaW5lRGF0YS50b2tlbnM7XG5cdFx0Y29uc3QgbWF4RHggPSB0YXJnZXQud2lkdGggLSBjaGFyV2lkdGg7XG5cdFx0Y29uc3QgZm9yY2UxcHhIZWlnaHQgPSAobWluaW1hcExpbmVIZWlnaHQgPT09IDEpO1xuXG5cdFx0bGV0IGR4ID0gTUlOSU1BUF9HVVRURVJfV0lEVEg7XG5cdFx0bGV0IGNoYXJJbmRleCA9IDA7XG5cdFx0bGV0IHRhYnNDaGFyRGVsdGEgPSAwO1xuXG5cdFx0Zm9yIChsZXQgdG9rZW5JbmRleCA9IDAsIHRva2Vuc0xlbiA9IHRva2Vucy5nZXRDb3VudCgpOyB0b2tlbkluZGV4IDwgdG9rZW5zTGVuOyB0b2tlbkluZGV4KyspIHtcblx0XHRcdGNvbnN0IHRva2VuRW5kSW5kZXggPSB0b2tlbnMuZ2V0RW5kT2Zmc2V0KHRva2VuSW5kZXgpO1xuXHRcdFx0Y29uc3QgdG9rZW5Db2xvcklkID0gdG9rZW5zLmdldEZvcmVncm91bmQodG9rZW5JbmRleCk7XG5cdFx0XHRjb25zdCB0b2tlbkNvbG9yID0gY29sb3JUcmFja2VyLmdldENvbG9yKHRva2VuQ29sb3JJZCk7XG5cblx0XHRcdGZvciAoOyBjaGFySW5kZXggPCB0b2tlbkVuZEluZGV4OyBjaGFySW5kZXgrKykge1xuXHRcdFx0XHRpZiAoZHggPiBtYXhEeCkge1xuXHRcdFx0XHRcdC8vIGhpdCBlZGdlIG9mIG1pbmltYXBcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY2hhckNvZGUgPSBjb250ZW50LmNoYXJDb2RlQXQoY2hhckluZGV4KTtcblxuXHRcdFx0XHRpZiAoY2hhckNvZGUgPT09IENoYXJDb2RlLlRhYikge1xuXHRcdFx0XHRcdGNvbnN0IGluc2VydFNwYWNlc0NvdW50ID0gdGFiU2l6ZSAtIChjaGFySW5kZXggKyB0YWJzQ2hhckRlbHRhKSAlIHRhYlNpemU7XG5cdFx0XHRcdFx0dGFic0NoYXJEZWx0YSArPSBpbnNlcnRTcGFjZXNDb3VudCAtIDE7XG5cdFx0XHRcdFx0Ly8gTm8gbmVlZCB0byByZW5kZXIgYW55dGhpbmcgc2luY2UgdGFiIGlzIGludmlzaWJsZVxuXHRcdFx0XHRcdGR4ICs9IGluc2VydFNwYWNlc0NvdW50ICogY2hhcldpZHRoO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGNoYXJDb2RlID09PSBDaGFyQ29kZS5TcGFjZSkge1xuXHRcdFx0XHRcdC8vIE5vIG5lZWQgdG8gcmVuZGVyIGFueXRoaW5nIHNpbmNlIHNwYWNlIGlzIGludmlzaWJsZVxuXHRcdFx0XHRcdGR4ICs9IGNoYXJXaWR0aDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBSZW5kZXIgdHdpY2UgZm9yIGEgZnVsbCB3aWR0aCBjaGFyYWN0ZXJcblx0XHRcdFx0XHRjb25zdCBjb3VudCA9IHN0cmluZ3MuaXNGdWxsV2lkdGhDaGFyYWN0ZXIoY2hhckNvZGUpID8gMiA6IDE7XG5cblx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcblx0XHRcdFx0XHRcdGlmIChyZW5kZXJNaW5pbWFwID09PSBSZW5kZXJNaW5pbWFwLkJsb2Nrcykge1xuXHRcdFx0XHRcdFx0XHRtaW5pbWFwQ2hhclJlbmRlcmVyLmJsb2NrUmVuZGVyQ2hhcih0YXJnZXQsIGR4LCBkeSArIGlubmVyTGluZVBhZGRpbmcsIHRva2VuQ29sb3IsIGZvcmVncm91bmRBbHBoYSwgYmFja2dyb3VuZENvbG9yLCBiYWNrZ3JvdW5kQWxwaGEsIGZvcmNlMXB4SGVpZ2h0KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7IC8vIFJlbmRlck1pbmltYXAuVGV4dFxuXHRcdFx0XHRcdFx0XHRtaW5pbWFwQ2hhclJlbmRlcmVyLnJlbmRlckNoYXIodGFyZ2V0LCBkeCwgZHkgKyBpbm5lckxpbmVQYWRkaW5nLCBjaGFyQ29kZSwgdG9rZW5Db2xvciwgZm9yZWdyb3VuZEFscGhhLCBiYWNrZ3JvdW5kQ29sb3IsIGJhY2tncm91bmRBbHBoYSwgZm9udFNjYWxlLCB1c2VMaWdodGVyRm9udCwgZm9yY2UxcHhIZWlnaHQpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRkeCArPSBjaGFyV2lkdGg7XG5cblx0XHRcdFx0XHRcdGlmIChkeCA+IG1heER4KSB7XG5cdFx0XHRcdFx0XHRcdC8vIGhpdCBlZGdlIG9mIG1pbmltYXBcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBDb250aWd1b3VzTGluZU1hcDxUPiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VuZExpbmVOdW1iZXI6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdFZhbHVlOiBUO1xuXHRwcml2YXRlIHJlYWRvbmx5IF92YWx1ZXM6IFRbXTtcblxuXHRjb25zdHJ1Y3RvcihzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyLCBkZWZhdWx0VmFsdWU6IFQpIHtcblx0XHR0aGlzLl9zdGFydExpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7XG5cdFx0dGhpcy5fZW5kTGluZU51bWJlciA9IGVuZExpbmVOdW1iZXI7XG5cdFx0dGhpcy5fZGVmYXVsdFZhbHVlID0gZGVmYXVsdFZhbHVlO1xuXHRcdHRoaXMuX3ZhbHVlcyA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBjb3VudCA9IHRoaXMuX2VuZExpbmVOdW1iZXIgLSB0aGlzLl9zdGFydExpbmVOdW1iZXIgKyAxOyBpIDwgY291bnQ7IGkrKykge1xuXHRcdFx0dGhpcy5fdmFsdWVzW2ldID0gZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBoYXMobGluZU51bWJlcjogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICh0aGlzLmdldChsaW5lTnVtYmVyKSAhPT0gdGhpcy5fZGVmYXVsdFZhbHVlKTtcblx0fVxuXG5cdHB1YmxpYyBzZXQobGluZU51bWJlcjogbnVtYmVyLCB2YWx1ZTogVCk6IHZvaWQge1xuXHRcdGlmIChsaW5lTnVtYmVyIDwgdGhpcy5fc3RhcnRMaW5lTnVtYmVyIHx8IGxpbmVOdW1iZXIgPiB0aGlzLl9lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3ZhbHVlc1tsaW5lTnVtYmVyIC0gdGhpcy5fc3RhcnRMaW5lTnVtYmVyXSA9IHZhbHVlO1xuXHR9XG5cblx0cHVibGljIGdldChsaW5lTnVtYmVyOiBudW1iZXIpOiBUIHtcblx0XHRpZiAobGluZU51bWJlciA8IHRoaXMuX3N0YXJ0TGluZU51bWJlciB8fCBsaW5lTnVtYmVyID4gdGhpcy5fZW5kTGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RlZmF1bHRWYWx1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbHVlc1tsaW5lTnVtYmVyIC0gdGhpcy5fc3RhcnRMaW5lTnVtYmVyXTtcblx0fVxufVxuXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQXNCLHlCQUF5QjtBQUMvQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFzQixrQkFBa0I7QUFDeEMsWUFBWSxjQUFjO0FBQzFCLFlBQVksYUFBYTtBQUN6QixTQUFnQiwrQkFBK0I7QUFDL0MsU0FBUyxpQkFBaUIsa0JBQWtCLGdCQUFnQjtBQUM1RCxTQUFTLGVBQWUsY0FBYyxzQkFBc0IsZ0NBQWdDO0FBQzVGLFNBQVMsYUFBYTtBQUN0QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxlQUFlO0FBRXhCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsaUNBQWlDO0FBSTFDLFlBQVksZ0JBQWdCO0FBRTVCLFNBQVMsa0JBQWtCLG1CQUFtQiwwQkFBMEIsd0JBQXdCO0FBRWhHLFNBQVMsaUJBQWlCO0FBRTFCLFNBQXVCLFdBQVcsZUFBZTtBQUNqRCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGlCQUFpQixpQ0FBMkQ7QUFDckYsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx3QkFBd0I7QUFLakMsTUFBTSw4QkFBOEI7QUFFcEMsTUFBTSwwQkFBMEI7QUFFaEMsTUFBTSxlQUFlO0FBQUEsRUErRHBCLFlBQVksZUFBcUMsT0FBb0Isb0JBQStDO0FBQ25ILFVBQU0sVUFBVSxjQUFjO0FBQzlCLFVBQU0sYUFBYSxRQUFRLElBQUksYUFB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QVMsT0FBTztBQUV2QyxnQkFBTTtBQUFBLFFBQ1AsT0FBTztBQUVOLGdCQUFNLFFBQVEsUUFBUSxxQkFBcUIsUUFBUSxJQUFJLElBQUk7QUFFM0QsbUJBQVMsSUFBSSxHQUFHLElBQUksT0FBTyxLQUFLO0FBQy9CLGdCQUFJLGtCQUFrQixjQUFjLFFBQVE7QUFDM0Msa0NBQW9CLGdCQUFnQixRQUFRLElBQUksS0FBSyxrQkFBa0IsWUFBWSxpQkFBaUIsaUJBQWlCLGlCQUFpQixjQUFjO0FBQUEsWUFDckosT0FBTztBQUNOLGtDQUFvQixXQUFXLFFBQVEsSUFBSSxLQUFLLGtCQUFrQixVQUFVLFlBQVksaUJBQWlCLGlCQUFpQixpQkFBaUIsV0FBVyxnQkFBZ0IsY0FBYztBQUFBLFlBQ3JMO0FBRUEsa0JBQU07QUFFTixnQkFBSSxLQUFLLE9BQU87QUFFZjtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBRUEsTUFBTSxrQkFBcUI7QUFBQSxFQU8xQixZQUFZLGlCQUF5QixlQUF1QixjQUFpQjtBQUM1RSxTQUFLLG1CQUFtQjtBQUN4QixTQUFLLGlCQUFpQjtBQUN0QixTQUFLLGdCQUFnQjtBQUNyQixTQUFLLFVBQVUsQ0FBQztBQUNoQixhQUFTLElBQUksR0FBRyxRQUFRLEtBQUssaUJBQWlCLEtBQUssbUJBQW1CLEdBQUcsSUFBSSxPQUFPLEtBQUs7QUFDeEYsV0FBSyxRQUFRLENBQUMsSUFBSTtBQUFBLElBQ25CO0FBQUEsRUFDRDtBQUFBLEVBRU8sSUFBSSxZQUE2QjtBQUN2QyxXQUFRLEtBQUssSUFBSSxVQUFVLE1BQU0sS0FBSztBQUFBLEVBQ3ZDO0FBQUEsRUFFTyxJQUFJLFlBQW9CLE9BQWdCO0FBQzlDLFFBQUksYUFBYSxLQUFLLG9CQUFvQixhQUFhLEtBQUssZ0JBQWdCO0FBQzNFO0FBQUEsSUFDRDtBQUNBLFNBQUssUUFBUSxhQUFhLEtBQUssZ0JBQWdCLElBQUk7QUFBQSxFQUNwRDtBQUFBLEVBRU8sSUFBSSxZQUF1QjtBQUNqQyxRQUFJLGFBQWEsS0FBSyxvQkFBb0IsYUFBYSxLQUFLLGdCQUFnQjtBQUMzRSxhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQ0EsV0FBTyxLQUFLLFFBQVEsYUFBYSxLQUFLLGdCQUFnQjtBQUFBLEVBQ3ZEO0FBQ0Q7IiwKICAibmFtZXMiOiBbInNsaWRlckhlaWdodCIsICJtYXhNaW5pbWFwU2xpZGVyVG9wIiwgImNvbXB1dGVkU2xpZGVyUmF0aW8iLCAic2xpZGVyVG9wIiwgInJlc3VsdCJdCn0K
