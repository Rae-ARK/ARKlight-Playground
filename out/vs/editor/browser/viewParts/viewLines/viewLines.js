import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from "../../../../base/browser/ui/mouseCursor/mouseCursor.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import * as platform from "../../../../base/common/platform.js";
import { Constants } from "../../../../base/common/uint.js";
import "./viewLines.css";
import { applyFontInfo } from "../../config/domFontInfo.js";
import { HorizontalPosition, HorizontalRange, LineVisibleRanges } from "../../view/renderingContext.js";
import { VisibleLinesCollection } from "../../view/viewLayer.js";
import { PartFingerprint, PartFingerprints, ViewPart } from "../../view/viewPart.js";
import { DomReadingContext } from "./domReadingContext.js";
import { ViewLine } from "./viewLine.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { ScrollType } from "../../../common/editorCommon.js";
import * as viewEvents from "../../../common/viewEvents.js";
import { ViewLineOptions } from "./viewLineOptions.js";
import { TextDirection } from "../../../common/model.js";
class LastRenderedData {
  constructor() {
    this._currentVisibleRange = new Range(1, 1, 1, 1);
  }
  getCurrentVisibleRange() {
    return this._currentVisibleRange;
  }
  setCurrentVisibleRange(currentVisibleRange) {
    this._currentVisibleRange = currentVisibleRange;
  }
}
class HorizontalRevealRangeRequest {
  constructor(minimalReveal, lineNumber, startColumn, endColumn, startScrollTop, stopScrollTop, scrollType) {
    this.minimalReveal = minimalReveal;
    this.lineNumber = lineNumber;
    this.startColumn = startColumn;
    this.endColumn = endColumn;
    this.startScrollTop = startScrollTop;
    this.stopScrollTop = stopScrollTop;
    this.scrollType = scrollType;
    this.type = "range";
    this.minLineNumber = lineNumber;
    this.maxLineNumber = lineNumber;
  }
}
class HorizontalRevealSelectionsRequest {
  constructor(minimalReveal, selections, startScrollTop, stopScrollTop, scrollType) {
    this.minimalReveal = minimalReveal;
    this.selections = selections;
    this.startScrollTop = startScrollTop;
    this.stopScrollTop = stopScrollTop;
    this.scrollType = scrollType;
    this.type = "selections";
    let minLineNumber = selections[0].startLineNumber;
    let maxLineNumber = selections[0].endLineNumber;
    for (let i = 1, len = selections.length; i < len; i++) {
      const selection = selections[i];
      minLineNumber = Math.min(minLineNumber, selection.startLineNumber);
      maxLineNumber = Math.max(maxLineNumber, selection.endLineNumber);
    }
    this.minLineNumber = minLineNumber;
    this.maxLineNumber = maxLineNumber;
  }
}
const _ViewLines = class _ViewLines extends ViewPart {
  constructor(context, viewGpuContext, linesContent) {
    super(context);
    const conf = this._context.configuration;
    const options = this._context.configuration.options;
    const fontInfo = options.get(EditorOption.fontInfo);
    const wrappingInfo = options.get(EditorOption.wrappingInfo);
    this._lineHeight = options.get(EditorOption.lineHeight);
    this._typicalHalfwidthCharacterWidth = fontInfo.typicalHalfwidthCharacterWidth;
    this._isViewportWrapping = wrappingInfo.isViewportWrapping;
    this._revealHorizontalRightPadding = options.get(EditorOption.revealHorizontalRightPadding);
    this._cursorSurroundingLines = options.get(EditorOption.cursorSurroundingLines);
    this._cursorSurroundingLinesStyle = options.get(EditorOption.cursorSurroundingLinesStyle);
    this._canUseLayerHinting = !options.get(EditorOption.disableLayerHinting);
    this._viewLineOptions = new ViewLineOptions(conf, this._context.theme.type);
    this._linesContent = linesContent;
    this._textRangeRestingSpot = document.createElement("div");
    this._visibleLines = new VisibleLinesCollection(this._context, {
      createLine: () => new ViewLine(viewGpuContext, this._viewLineOptions)
    });
    this.domNode = this._visibleLines.domNode;
    PartFingerprints.write(this.domNode, PartFingerprint.ViewLines);
    this.domNode.setClassName(`view-lines ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
    applyFontInfo(this.domNode, fontInfo);
    this._maxLineWidth = 0;
    this._asyncUpdateLineWidths = new RunOnceScheduler(() => {
      this._updateLineWidthsSlow();
    }, 200);
    this._asyncCheckMonospaceFontAssumptions = new RunOnceScheduler(() => {
      this._checkMonospaceFontAssumptions();
    }, 2e3);
    this._lastRenderedData = new LastRenderedData();
    this._horizontalRevealRequest = null;
    this._stickyScrollEnabled = options.get(EditorOption.stickyScroll).enabled;
    this._maxNumberStickyLines = options.get(EditorOption.stickyScroll).maxLineCount;
  }
  dispose() {
    this._asyncUpdateLineWidths.dispose();
    this._asyncCheckMonospaceFontAssumptions.dispose();
    super.dispose();
  }
  getDomNode() {
    return this.domNode;
  }
  // ---- begin view event handlers
  onConfigurationChanged(e) {
    this._visibleLines.onConfigurationChanged(e);
    if (e.hasChanged(EditorOption.wrappingInfo)) {
      this._maxLineWidth = 0;
    }
    const options = this._context.configuration.options;
    const fontInfo = options.get(EditorOption.fontInfo);
    const wrappingInfo = options.get(EditorOption.wrappingInfo);
    this._lineHeight = options.get(EditorOption.lineHeight);
    this._typicalHalfwidthCharacterWidth = fontInfo.typicalHalfwidthCharacterWidth;
    this._isViewportWrapping = wrappingInfo.isViewportWrapping;
    this._revealHorizontalRightPadding = options.get(EditorOption.revealHorizontalRightPadding);
    this._cursorSurroundingLines = options.get(EditorOption.cursorSurroundingLines);
    this._cursorSurroundingLinesStyle = options.get(EditorOption.cursorSurroundingLinesStyle);
    this._canUseLayerHinting = !options.get(EditorOption.disableLayerHinting);
    this._stickyScrollEnabled = options.get(EditorOption.stickyScroll).enabled;
    this._maxNumberStickyLines = options.get(EditorOption.stickyScroll).maxLineCount;
    applyFontInfo(this.domNode, fontInfo);
    this._onOptionsMaybeChanged();
    if (e.hasChanged(EditorOption.layoutInfo)) {
      this._maxLineWidth = 0;
    }
    return true;
  }
  _onOptionsMaybeChanged() {
    const conf = this._context.configuration;
    const newViewLineOptions = new ViewLineOptions(conf, this._context.theme.type);
    if (!this._viewLineOptions.equals(newViewLineOptions)) {
      this._viewLineOptions = newViewLineOptions;
      const startLineNumber = this._visibleLines.getStartLineNumber();
      const endLineNumber = this._visibleLines.getEndLineNumber();
      for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
        const line = this._visibleLines.getVisibleLine(lineNumber);
        line.onOptionsChanged(this._viewLineOptions);
      }
      return true;
    }
    return false;
  }
  onCursorStateChanged(e) {
    const rendStartLineNumber = this._visibleLines.getStartLineNumber();
    const rendEndLineNumber = this._visibleLines.getEndLineNumber();
    let r = false;
    for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
      r = this._visibleLines.getVisibleLine(lineNumber).onSelectionChanged() || r;
    }
    return r;
  }
  onDecorationsChanged(e) {
    const rendStartLineNumber = this._visibleLines.getStartLineNumber();
    const rendEndLineNumber = this._visibleLines.getEndLineNumber();
    for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
      this._visibleLines.getVisibleLine(lineNumber).onDecorationsChanged();
    }
    return true;
  }
  onFlushed(e) {
    const shouldRender = this._visibleLines.onFlushed(e, this._viewLineOptions.useGpu);
    this._maxLineWidth = 0;
    return shouldRender;
  }
  onLinesChanged(e) {
    return this._visibleLines.onLinesChanged(e);
  }
  onLinesDeleted(e) {
    return this._visibleLines.onLinesDeleted(e);
  }
  onLinesInserted(e) {
    return this._visibleLines.onLinesInserted(e);
  }
  onRevealRangeRequest(e) {
    const desiredScrollTop = this._computeScrollTopToRevealRange(this._context.viewLayout.getFutureViewport(), e.source, e.minimalReveal, e.range, e.selections, e.verticalType);
    if (desiredScrollTop === -1) {
      return false;
    }
    let newScrollPosition = this._context.viewLayout.validateScrollPosition({ scrollTop: desiredScrollTop });
    if (e.revealHorizontal) {
      if (e.range && e.range.startLineNumber !== e.range.endLineNumber) {
        newScrollPosition = {
          scrollTop: newScrollPosition.scrollTop,
          scrollLeft: 0
        };
      } else if (e.range) {
        this._horizontalRevealRequest = new HorizontalRevealRangeRequest(e.minimalReveal, e.range.startLineNumber, e.range.startColumn, e.range.endColumn, this._context.viewLayout.getCurrentScrollTop(), newScrollPosition.scrollTop, e.scrollType);
      } else if (e.selections && e.selections.length > 0) {
        this._horizontalRevealRequest = new HorizontalRevealSelectionsRequest(e.minimalReveal, e.selections, this._context.viewLayout.getCurrentScrollTop(), newScrollPosition.scrollTop, e.scrollType);
      }
    } else {
      this._horizontalRevealRequest = null;
    }
    const scrollTopDelta = Math.abs(this._context.viewLayout.getCurrentScrollTop() - newScrollPosition.scrollTop);
    const scrollType = scrollTopDelta <= this._lineHeight ? ScrollType.Immediate : e.scrollType;
    this._context.viewModel.viewLayout.setScrollPosition(newScrollPosition, scrollType);
    return true;
  }
  onScrollChanged(e) {
    if (this._horizontalRevealRequest && e.scrollLeftChanged) {
      this._horizontalRevealRequest = null;
    }
    if (this._horizontalRevealRequest && e.scrollTopChanged) {
      const min = Math.min(this._horizontalRevealRequest.startScrollTop, this._horizontalRevealRequest.stopScrollTop);
      const max = Math.max(this._horizontalRevealRequest.startScrollTop, this._horizontalRevealRequest.stopScrollTop);
      if (e.scrollTop < min || e.scrollTop > max) {
        this._horizontalRevealRequest = null;
      }
    }
    this.domNode.setWidth(e.scrollWidth);
    return this._visibleLines.onScrollChanged(e) || e.scrollTopChanged || e.scrollLeftChanged;
  }
  onTokensChanged(e) {
    return this._visibleLines.onTokensChanged(e);
  }
  onZonesChanged(e) {
    this._context.viewModel.viewLayout.setMaxLineWidth(this._maxLineWidth);
    return this._visibleLines.onZonesChanged(e);
  }
  onThemeChanged(e) {
    return this._onOptionsMaybeChanged();
  }
  // ---- end view event handlers
  // ----------- HELPERS FOR OTHERS
  getPositionFromDOMInfo(spanNode, offset) {
    const viewLineDomNode = this._getViewLineDomNode(spanNode);
    if (viewLineDomNode === null) {
      return null;
    }
    const lineNumber = this._getLineNumberFor(viewLineDomNode);
    if (lineNumber === -1) {
      return null;
    }
    if (lineNumber < 1 || lineNumber > this._context.viewModel.getLineCount()) {
      return null;
    }
    if (this._context.viewModel.getLineMaxColumn(lineNumber) === 1) {
      return new Position(lineNumber, 1);
    }
    const rendStartLineNumber = this._visibleLines.getStartLineNumber();
    const rendEndLineNumber = this._visibleLines.getEndLineNumber();
    if (lineNumber < rendStartLineNumber || lineNumber > rendEndLineNumber) {
      return null;
    }
    let column = this._visibleLines.getVisibleLine(lineNumber).getColumnOfNodeOffset(spanNode, offset);
    const minColumn = this._context.viewModel.getLineMinColumn(lineNumber);
    if (column < minColumn) {
      column = minColumn;
    }
    return new Position(lineNumber, column);
  }
  _getViewLineDomNode(node) {
    while (node && node.nodeType === 1) {
      if (node.className === ViewLine.CLASS_NAME) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }
  /**
   * @returns the line number of this view line dom node.
   */
  _getLineNumberFor(domNode) {
    const startLineNumber = this._visibleLines.getStartLineNumber();
    const endLineNumber = this._visibleLines.getEndLineNumber();
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      const line = this._visibleLines.getVisibleLine(lineNumber);
      if (domNode === line.getDomNode()) {
        return lineNumber;
      }
    }
    return -1;
  }
  getLineWidth(lineNumber) {
    const rendStartLineNumber = this._visibleLines.getStartLineNumber();
    const rendEndLineNumber = this._visibleLines.getEndLineNumber();
    if (lineNumber < rendStartLineNumber || lineNumber > rendEndLineNumber) {
      return -1;
    }
    const context = new DomReadingContext(this.domNode.domNode, this._textRangeRestingSpot);
    const result = this._visibleLines.getVisibleLine(lineNumber).getWidth(context);
    this._updateLineWidthsSlowIfDomDidLayout(context);
    return result;
  }
  resetLineWidthCaches() {
    const rendStartLineNumber = this._visibleLines.getStartLineNumber();
    const rendEndLineNumber = this._visibleLines.getEndLineNumber();
    for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
      this._visibleLines.getVisibleLine(lineNumber).resetCachedWidth();
    }
  }
  linesVisibleRangesForRange(_range, includeNewLines) {
    const originalEndLineNumber = _range.endLineNumber;
    const range = Range.intersectRanges(_range, this._lastRenderedData.getCurrentVisibleRange());
    if (!range) {
      return null;
    }
    const visibleRanges = [];
    let visibleRangesLen = 0;
    const domReadingContext = new DomReadingContext(this.domNode.domNode, this._textRangeRestingSpot);
    let nextLineModelLineNumber = 0;
    if (includeNewLines) {
      nextLineModelLineNumber = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(range.startLineNumber, 1)).lineNumber;
    }
    const rendStartLineNumber = this._visibleLines.getStartLineNumber();
    const rendEndLineNumber = this._visibleLines.getEndLineNumber();
    for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
      if (lineNumber < rendStartLineNumber || lineNumber > rendEndLineNumber) {
        continue;
      }
      const startColumn = lineNumber === range.startLineNumber ? range.startColumn : 1;
      const continuesInNextLine = lineNumber !== originalEndLineNumber;
      const endColumn = continuesInNextLine ? this._context.viewModel.getLineMaxColumn(lineNumber) : range.endColumn;
      const visibleLine = this._visibleLines.getVisibleLine(lineNumber);
      const visibleRangesForLine = visibleLine.getVisibleRangesForRange(lineNumber, startColumn, endColumn, domReadingContext);
      if (!visibleRangesForLine) {
        continue;
      }
      if (includeNewLines && lineNumber < originalEndLineNumber) {
        const currentLineModelLineNumber = nextLineModelLineNumber;
        nextLineModelLineNumber = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(lineNumber + 1, 1)).lineNumber;
        if (currentLineModelLineNumber !== nextLineModelLineNumber) {
          const floatHorizontalRange = visibleRangesForLine.ranges[visibleRangesForLine.ranges.length - 1];
          floatHorizontalRange.width += this._typicalHalfwidthCharacterWidth;
          if (this._context.viewModel.getTextDirection(currentLineModelLineNumber) === TextDirection.RTL) {
            floatHorizontalRange.left -= this._typicalHalfwidthCharacterWidth;
          }
        }
      }
      visibleRanges[visibleRangesLen++] = new LineVisibleRanges(visibleRangesForLine.outsideRenderedLine, lineNumber, HorizontalRange.from(visibleRangesForLine.ranges), continuesInNextLine);
    }
    this._updateLineWidthsSlowIfDomDidLayout(domReadingContext);
    if (visibleRangesLen === 0) {
      return null;
    }
    return visibleRanges;
  }
  _visibleRangesForLineRange(lineNumber, startColumn, endColumn) {
    if (lineNumber < this._visibleLines.getStartLineNumber() || lineNumber > this._visibleLines.getEndLineNumber()) {
      return null;
    }
    const domReadingContext = new DomReadingContext(this.domNode.domNode, this._textRangeRestingSpot);
    const result = this._visibleLines.getVisibleLine(lineNumber).getVisibleRangesForRange(lineNumber, startColumn, endColumn, domReadingContext);
    this._updateLineWidthsSlowIfDomDidLayout(domReadingContext);
    return result;
  }
  _lineIsRenderedRTL(lineNumber) {
    if (lineNumber < this._visibleLines.getStartLineNumber() || lineNumber > this._visibleLines.getEndLineNumber()) {
      return false;
    }
    const visibleLine = this._visibleLines.getVisibleLine(lineNumber);
    return visibleLine.isRenderedRTL();
  }
  visibleRangeForPosition(position) {
    const visibleRanges = this._visibleRangesForLineRange(position.lineNumber, position.column, position.column);
    if (!visibleRanges) {
      return null;
    }
    return new HorizontalPosition(visibleRanges.outsideRenderedLine, visibleRanges.ranges[0].left);
  }
  // --- implementation
  updateLineWidths() {
    this._updateLineWidths(false);
  }
  /**
   * Updates the max line width if it is fast to compute.
   * Returns true if all lines were taken into account.
   * Returns false if some lines need to be reevaluated (in a slow fashion).
   */
  _updateLineWidthsFast() {
    return this._updateLineWidths(true);
  }
  _updateLineWidthsSlow() {
    this._updateLineWidths(false);
  }
  /**
   * Update the line widths using DOM layout information after someone else
   * has caused a synchronous layout.
   */
  _updateLineWidthsSlowIfDomDidLayout(domReadingContext) {
    if (!domReadingContext.didDomLayout) {
      return;
    }
    if (!this._asyncUpdateLineWidths.isScheduled()) {
      return;
    }
    this._asyncUpdateLineWidths.cancel();
    this._updateLineWidthsSlow();
  }
  _updateLineWidths(fast) {
    const rendStartLineNumber = this._visibleLines.getStartLineNumber();
    const rendEndLineNumber = this._visibleLines.getEndLineNumber();
    let localMaxLineWidth = 1;
    let allWidthsComputed = true;
    for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
      const visibleLine = this._visibleLines.getVisibleLine(lineNumber);
      if (fast && !visibleLine.getWidthIsFast()) {
        allWidthsComputed = false;
        continue;
      }
      localMaxLineWidth = Math.max(localMaxLineWidth, visibleLine.getWidth(null));
    }
    if (allWidthsComputed && rendStartLineNumber === 1 && rendEndLineNumber === this._context.viewModel.getLineCount()) {
      this._maxLineWidth = 0;
    }
    this._ensureMaxLineWidth(localMaxLineWidth);
    return allWidthsComputed;
  }
  _checkMonospaceFontAssumptions() {
    let longestLineNumber = -1;
    let longestWidth = -1;
    const rendStartLineNumber = this._visibleLines.getStartLineNumber();
    const rendEndLineNumber = this._visibleLines.getEndLineNumber();
    for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
      const visibleLine = this._visibleLines.getVisibleLine(lineNumber);
      if (visibleLine.needsMonospaceFontCheck()) {
        const lineWidth = visibleLine.getWidth(null);
        if (lineWidth > longestWidth) {
          longestWidth = lineWidth;
          longestLineNumber = lineNumber;
        }
      }
    }
    if (longestLineNumber === -1) {
      return;
    }
    if (!this._visibleLines.getVisibleLine(longestLineNumber).monospaceAssumptionsAreValid()) {
      for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
        const visibleLine = this._visibleLines.getVisibleLine(lineNumber);
        visibleLine.onMonospaceAssumptionsInvalidated();
      }
    }
  }
  prepareRender() {
    throw new Error("Not supported");
  }
  render() {
    throw new Error("Not supported");
  }
  renderText(viewportData) {
    this._visibleLines.renderLines(viewportData);
    this._lastRenderedData.setCurrentVisibleRange(viewportData.visibleRange);
    this.domNode.setWidth(this._context.viewLayout.getScrollWidth());
    this.domNode.setHeight(Math.min(this._context.viewLayout.getScrollHeight(), 1e6));
    if (this._horizontalRevealRequest) {
      const horizontalRevealRequest = this._horizontalRevealRequest;
      if (viewportData.startLineNumber <= horizontalRevealRequest.minLineNumber && horizontalRevealRequest.maxLineNumber <= viewportData.endLineNumber) {
        this._horizontalRevealRequest = null;
        this.onDidRender();
        const newScrollLeft = this._computeScrollLeftToReveal(horizontalRevealRequest);
        if (newScrollLeft) {
          if (!this._isViewportWrapping && !newScrollLeft.hasRTL) {
            this._ensureMaxLineWidth(newScrollLeft.maxHorizontalOffset);
          }
          this._context.viewModel.viewLayout.setScrollPosition({
            scrollLeft: newScrollLeft.scrollLeft
          }, horizontalRevealRequest.scrollType);
        }
      }
    }
    if (!this._updateLineWidthsFast()) {
      this._asyncUpdateLineWidths.schedule();
    } else {
      this._asyncUpdateLineWidths.cancel();
    }
    if (platform.isLinux && !this._asyncCheckMonospaceFontAssumptions.isScheduled()) {
      const rendStartLineNumber = this._visibleLines.getStartLineNumber();
      const rendEndLineNumber = this._visibleLines.getEndLineNumber();
      for (let lineNumber = rendStartLineNumber; lineNumber <= rendEndLineNumber; lineNumber++) {
        const visibleLine = this._visibleLines.getVisibleLine(lineNumber);
        if (visibleLine.needsMonospaceFontCheck()) {
          this._asyncCheckMonospaceFontAssumptions.schedule();
          break;
        }
      }
    }
    this._linesContent.setLayerHinting(this._canUseLayerHinting);
    this._linesContent.setContain("strict");
    const adjustedScrollTop = this._context.viewLayout.getCurrentScrollTop() - viewportData.bigNumbersDelta;
    this._linesContent.setTop(-adjustedScrollTop);
    this._linesContent.setLeft(-this._context.viewLayout.getCurrentScrollLeft());
  }
  // --- width
  _ensureMaxLineWidth(lineWidth) {
    if (this._viewLineOptions.useGpu) {
      return;
    }
    const iLineWidth = Math.ceil(lineWidth);
    if (this._maxLineWidth < iLineWidth) {
      this._maxLineWidth = iLineWidth;
      this._context.viewModel.viewLayout.setMaxLineWidth(this._maxLineWidth);
    }
  }
  _computeScrollTopToRevealRange(viewport, source, minimalReveal, range, selections, verticalType) {
    const viewportStartY = viewport.top;
    const viewportHeight = viewport.height;
    const viewportEndY = viewportStartY + viewportHeight;
    let boxIsSingleRange;
    let boxStartY;
    let boxEndY;
    if (selections && selections.length > 0) {
      let minLineNumber = selections[0].startLineNumber;
      let maxLineNumber = selections[0].endLineNumber;
      for (let i = 1, len = selections.length; i < len; i++) {
        const selection = selections[i];
        minLineNumber = Math.min(minLineNumber, selection.startLineNumber);
        maxLineNumber = Math.max(maxLineNumber, selection.endLineNumber);
      }
      boxIsSingleRange = false;
      boxStartY = this._context.viewLayout.getVerticalOffsetForLineNumber(minLineNumber);
      boxEndY = this._context.viewLayout.getVerticalOffsetForLineNumber(maxLineNumber) + this._lineHeight;
    } else if (range) {
      boxIsSingleRange = true;
      boxStartY = this._context.viewLayout.getVerticalOffsetForLineNumber(range.startLineNumber);
      boxEndY = this._context.viewLayout.getVerticalOffsetForLineNumber(range.endLineNumber) + this._lineHeight;
    } else {
      return -1;
    }
    const shouldIgnoreScrollOff = (source === "mouse" || minimalReveal) && this._cursorSurroundingLinesStyle === "default";
    let paddingTop = 0;
    let paddingBottom = 0;
    if (!shouldIgnoreScrollOff) {
      const maxLinesInViewport = viewportHeight / this._lineHeight;
      const surroundingLines = Math.max(this._cursorSurroundingLines, this._stickyScrollEnabled ? this._maxNumberStickyLines : 0);
      const context = Math.min(maxLinesInViewport / 2, surroundingLines);
      paddingTop = context * this._lineHeight;
      paddingBottom = Math.max(0, context - 1) * this._lineHeight;
    } else {
      if (!minimalReveal) {
        paddingTop = this._lineHeight;
      }
    }
    if (!minimalReveal) {
      if (verticalType === viewEvents.VerticalRevealType.Simple || verticalType === viewEvents.VerticalRevealType.Bottom) {
        paddingBottom += this._lineHeight;
      }
    }
    boxStartY -= paddingTop;
    boxEndY += paddingBottom;
    let newScrollTop;
    if (boxEndY - boxStartY > viewportHeight) {
      if (!boxIsSingleRange) {
        return -1;
      }
      newScrollTop = boxStartY;
    } else if (verticalType === viewEvents.VerticalRevealType.NearTop || verticalType === viewEvents.VerticalRevealType.NearTopIfOutsideViewport) {
      if (verticalType === viewEvents.VerticalRevealType.NearTopIfOutsideViewport && viewportStartY <= boxStartY && boxEndY <= viewportEndY) {
        newScrollTop = viewportStartY;
      } else {
        const desiredGapAbove = Math.max(5 * this._lineHeight, viewportHeight * 0.2);
        const desiredScrollTop = boxStartY - desiredGapAbove;
        const minScrollTop = boxEndY - viewportHeight;
        newScrollTop = Math.max(minScrollTop, desiredScrollTop);
      }
    } else if (verticalType === viewEvents.VerticalRevealType.Center || verticalType === viewEvents.VerticalRevealType.CenterIfOutsideViewport) {
      if (verticalType === viewEvents.VerticalRevealType.CenterIfOutsideViewport && viewportStartY <= boxStartY && boxEndY <= viewportEndY) {
        newScrollTop = viewportStartY;
      } else {
        const boxMiddleY = (boxStartY + boxEndY) / 2;
        newScrollTop = Math.max(0, boxMiddleY - viewportHeight / 2);
      }
    } else {
      newScrollTop = this._computeMinimumScrolling(viewportStartY, viewportEndY, boxStartY, boxEndY, verticalType === viewEvents.VerticalRevealType.Top, verticalType === viewEvents.VerticalRevealType.Bottom);
    }
    return newScrollTop;
  }
  _computeScrollLeftToReveal(horizontalRevealRequest) {
    const viewport = this._context.viewLayout.getCurrentViewport();
    const layoutInfo = this._context.configuration.options.get(EditorOption.layoutInfo);
    const viewportStartX = viewport.left;
    const viewportEndX = viewportStartX + viewport.width - layoutInfo.verticalScrollbarWidth;
    let boxStartX = Constants.MAX_SAFE_SMALL_INTEGER;
    let boxEndX = 0;
    let hasRTL = false;
    if (horizontalRevealRequest.type === "range") {
      hasRTL = this._lineIsRenderedRTL(horizontalRevealRequest.lineNumber);
      const visibleRanges = this._visibleRangesForLineRange(horizontalRevealRequest.lineNumber, horizontalRevealRequest.startColumn, horizontalRevealRequest.endColumn);
      if (!visibleRanges) {
        return null;
      }
      for (const visibleRange of visibleRanges.ranges) {
        boxStartX = Math.min(boxStartX, Math.round(visibleRange.left));
        boxEndX = Math.max(boxEndX, Math.round(visibleRange.left + visibleRange.width));
      }
    } else {
      for (const selection of horizontalRevealRequest.selections) {
        if (selection.startLineNumber !== selection.endLineNumber) {
          return null;
        }
        const visibleRanges = this._visibleRangesForLineRange(selection.startLineNumber, selection.startColumn, selection.endColumn);
        hasRTL ||= this._lineIsRenderedRTL(selection.startLineNumber);
        if (!visibleRanges) {
          return null;
        }
        for (const visibleRange of visibleRanges.ranges) {
          boxStartX = Math.min(boxStartX, Math.round(visibleRange.left));
          boxEndX = Math.max(boxEndX, Math.round(visibleRange.left + visibleRange.width));
        }
      }
    }
    if (!horizontalRevealRequest.minimalReveal) {
      boxStartX = Math.max(0, boxStartX - _ViewLines.HORIZONTAL_EXTRA_PX);
      boxEndX += this._revealHorizontalRightPadding;
    }
    if (horizontalRevealRequest.type === "selections" && boxEndX - boxStartX > viewport.width) {
      return null;
    }
    const newScrollLeft = this._computeMinimumScrolling(viewportStartX, viewportEndX, boxStartX, boxEndX);
    return {
      scrollLeft: newScrollLeft,
      maxHorizontalOffset: boxEndX,
      hasRTL
    };
  }
  _computeMinimumScrolling(viewportStart, viewportEnd, boxStart, boxEnd, revealAtStart, revealAtEnd) {
    viewportStart = viewportStart | 0;
    viewportEnd = viewportEnd | 0;
    boxStart = boxStart | 0;
    boxEnd = boxEnd | 0;
    revealAtStart = !!revealAtStart;
    revealAtEnd = !!revealAtEnd;
    const viewportLength = viewportEnd - viewportStart;
    const boxLength = boxEnd - boxStart;
    if (boxLength < viewportLength) {
      if (revealAtStart) {
        return boxStart;
      }
      if (revealAtEnd) {
        return Math.max(0, boxEnd - viewportLength);
      }
      if (boxStart < viewportStart) {
        return boxStart;
      } else if (boxEnd > viewportEnd) {
        return Math.max(0, boxEnd - viewportLength);
      }
    } else {
      return boxStart;
    }
    return viewportStart;
  }
};
/**
 * Adds this amount of pixels to the right of lines (no-one wants to type near the edge of the viewport)
 */
_ViewLines.HORIZONTAL_EXTRA_PX = 30;
let ViewLines = _ViewLines;
export {
  ViewLines
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3ZpZXdQYXJ0cy92aWV3TGluZXMvdmlld0xpbmVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRmFzdERvbU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZmFzdERvbU5vZGUuanMnO1xuaW1wb3J0IHsgTU9VU0VfQ1VSU09SX1RFWFRfQ1NTX0NMQVNTX05BTUUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbW91c2VDdXJzb3IvbW91c2VDdXJzb3IuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IENvbnN0YW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VpbnQuanMnO1xuaW1wb3J0ICcuL3ZpZXdMaW5lcy5jc3MnO1xuaW1wb3J0IHsgYXBwbHlGb250SW5mbyB9IGZyb20gJy4uLy4uL2NvbmZpZy9kb21Gb250SW5mby5qcyc7XG5pbXBvcnQgeyBIb3Jpem9udGFsUG9zaXRpb24sIEhvcml6b250YWxSYW5nZSwgSVZpZXdMaW5lcywgTGluZVZpc2libGVSYW5nZXMsIFZpc2libGVSYW5nZXMgfSBmcm9tICcuLi8uLi92aWV3L3JlbmRlcmluZ0NvbnRleHQuanMnO1xuaW1wb3J0IHsgVmlzaWJsZUxpbmVzQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uL3ZpZXcvdmlld0xheWVyLmpzJztcbmltcG9ydCB7IFBhcnRGaW5nZXJwcmludCwgUGFydEZpbmdlcnByaW50cywgVmlld1BhcnQgfSBmcm9tICcuLi8uLi92aWV3L3ZpZXdQYXJ0LmpzJztcbmltcG9ydCB7IERvbVJlYWRpbmdDb250ZXh0IH0gZnJvbSAnLi9kb21SZWFkaW5nQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBWaWV3TGluZSB9IGZyb20gJy4vdmlld0xpbmUuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0ICogYXMgdmlld0V2ZW50cyBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld0V2ZW50cy5qcyc7XG5pbXBvcnQgeyBWaWV3cG9ydERhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld0xheW91dC92aWV3TGluZXNWaWV3cG9ydERhdGEuanMnO1xuaW1wb3J0IHsgVmlld3BvcnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsLmpzJztcbmltcG9ydCB7IFZpZXdDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC92aWV3Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBWaWV3TGluZU9wdGlvbnMgfSBmcm9tICcuL3ZpZXdMaW5lT3B0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IFZpZXdHcHVDb250ZXh0IH0gZnJvbSAnLi4vLi4vZ3B1L3ZpZXdHcHVDb250ZXh0LmpzJztcbmltcG9ydCB7IFRleHREaXJlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuXG5jbGFzcyBMYXN0UmVuZGVyZWREYXRhIHtcblxuXHRwcml2YXRlIF9jdXJyZW50VmlzaWJsZVJhbmdlOiBSYW5nZTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLl9jdXJyZW50VmlzaWJsZVJhbmdlID0gbmV3IFJhbmdlKDEsIDEsIDEsIDEpO1xuXHR9XG5cblx0cHVibGljIGdldEN1cnJlbnRWaXNpYmxlUmFuZ2UoKTogUmFuZ2Uge1xuXHRcdHJldHVybiB0aGlzLl9jdXJyZW50VmlzaWJsZVJhbmdlO1xuXHR9XG5cblx0cHVibGljIHNldEN1cnJlbnRWaXNpYmxlUmFuZ2UoY3VycmVudFZpc2libGVSYW5nZTogUmFuZ2UpOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJyZW50VmlzaWJsZVJhbmdlID0gY3VycmVudFZpc2libGVSYW5nZTtcblx0fVxufVxuXG5jbGFzcyBIb3Jpem9udGFsUmV2ZWFsUmFuZ2VSZXF1ZXN0IHtcblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSAncmFuZ2UnO1xuXHRwdWJsaWMgcmVhZG9ubHkgbWluTGluZU51bWJlcjogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgbWF4TGluZU51bWJlcjogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBtaW5pbWFsUmV2ZWFsOiBib29sZWFuLFxuXHRcdHB1YmxpYyByZWFkb25seSBsaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHN0YXJ0Q29sdW1uOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGVuZENvbHVtbjogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBzdGFydFNjcm9sbFRvcDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBzdG9wU2Nyb2xsVG9wOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHNjcm9sbFR5cGU6IFNjcm9sbFR5cGVcblx0KSB7XG5cdFx0dGhpcy5taW5MaW5lTnVtYmVyID0gbGluZU51bWJlcjtcblx0XHR0aGlzLm1heExpbmVOdW1iZXIgPSBsaW5lTnVtYmVyO1xuXHR9XG59XG5cbmNsYXNzIEhvcml6b250YWxSZXZlYWxTZWxlY3Rpb25zUmVxdWVzdCB7XG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gJ3NlbGVjdGlvbnMnO1xuXHRwdWJsaWMgcmVhZG9ubHkgbWluTGluZU51bWJlcjogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgbWF4TGluZU51bWJlcjogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBtaW5pbWFsUmV2ZWFsOiBib29sZWFuLFxuXHRcdHB1YmxpYyByZWFkb25seSBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgc3RhcnRTY3JvbGxUb3A6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgc3RvcFNjcm9sbFRvcDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBzY3JvbGxUeXBlOiBTY3JvbGxUeXBlXG5cdCkge1xuXHRcdGxldCBtaW5MaW5lTnVtYmVyID0gc2VsZWN0aW9uc1swXS5zdGFydExpbmVOdW1iZXI7XG5cdFx0bGV0IG1heExpbmVOdW1iZXIgPSBzZWxlY3Rpb25zWzBdLmVuZExpbmVOdW1iZXI7XG5cdFx0Zm9yIChsZXQgaSA9IDEsIGxlbiA9IHNlbGVjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHNlbGVjdGlvbnNbaV07XG5cdFx0XHRtaW5MaW5lTnVtYmVyID0gTWF0aC5taW4obWluTGluZU51bWJlciwgc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRtYXhMaW5lTnVtYmVyID0gTWF0aC5tYXgobWF4TGluZU51bWJlciwgc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIpO1xuXHRcdH1cblx0XHR0aGlzLm1pbkxpbmVOdW1iZXIgPSBtaW5MaW5lTnVtYmVyO1xuXHRcdHRoaXMubWF4TGluZU51bWJlciA9IG1heExpbmVOdW1iZXI7XG5cdH1cbn1cblxudHlwZSBIb3Jpem9udGFsUmV2ZWFsUmVxdWVzdCA9IEhvcml6b250YWxSZXZlYWxSYW5nZVJlcXVlc3QgfCBIb3Jpem9udGFsUmV2ZWFsU2VsZWN0aW9uc1JlcXVlc3Q7XG5cbi8qKlxuICogVGhlIHZpZXcgbGluZXMgcGFydCBpcyByZXNwb25zaWJsZSBmb3IgcmVuZGVyaW5nIHRoZSBhY3R1YWwgY29udGVudCBvZiBhXG4gKiBmaWxlLlxuICovXG5leHBvcnQgY2xhc3MgVmlld0xpbmVzIGV4dGVuZHMgVmlld1BhcnQgaW1wbGVtZW50cyBJVmlld0xpbmVzIHtcblx0LyoqXG5cdCAqIEFkZHMgdGhpcyBhbW91bnQgb2YgcGl4ZWxzIHRvIHRoZSByaWdodCBvZiBsaW5lcyAobm8tb25lIHdhbnRzIHRvIHR5cGUgbmVhciB0aGUgZWRnZSBvZiB0aGUgdmlld3BvcnQpXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBIT1JJWk9OVEFMX0VYVFJBX1BYID0gMzA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGluZXNDb250ZW50OiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RleHRSYW5nZVJlc3RpbmdTcG90OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdmlzaWJsZUxpbmVzOiBWaXNpYmxlTGluZXNDb2xsZWN0aW9uPFZpZXdMaW5lPjtcblx0cHJpdmF0ZSByZWFkb25seSBkb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD47XG5cblx0Ly8gLS0tIGNvbmZpZ1xuXHRwcml2YXRlIF9saW5lSGVpZ2h0OiBudW1iZXI7XG5cdHByaXZhdGUgX3R5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogbnVtYmVyO1xuXHRwcml2YXRlIF9pc1ZpZXdwb3J0V3JhcHBpbmc6IGJvb2xlYW47XG5cdHByaXZhdGUgX3JldmVhbEhvcml6b250YWxSaWdodFBhZGRpbmc6IG51bWJlcjtcblx0cHJpdmF0ZSBfY3Vyc29yU3Vycm91bmRpbmdMaW5lczogbnVtYmVyO1xuXHRwcml2YXRlIF9jdXJzb3JTdXJyb3VuZGluZ0xpbmVzU3R5bGU6ICdkZWZhdWx0JyB8ICdhbGwnO1xuXHRwcml2YXRlIF9jYW5Vc2VMYXllckhpbnRpbmc6IGJvb2xlYW47XG5cdHByaXZhdGUgX3ZpZXdMaW5lT3B0aW9uczogVmlld0xpbmVPcHRpb25zO1xuXG5cdC8vIC0tLSB3aWR0aFxuXHRwcml2YXRlIF9tYXhMaW5lV2lkdGg6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfYXN5bmNVcGRhdGVMaW5lV2lkdGhzOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hc3luY0NoZWNrTW9ub3NwYWNlRm9udEFzc3VtcHRpb25zOiBSdW5PbmNlU2NoZWR1bGVyO1xuXG5cdHByaXZhdGUgX2hvcml6b250YWxSZXZlYWxSZXF1ZXN0OiBIb3Jpem9udGFsUmV2ZWFsUmVxdWVzdCB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhc3RSZW5kZXJlZERhdGE6IExhc3RSZW5kZXJlZERhdGE7XG5cblx0Ly8gU3RpY2t5IFNjcm9sbFxuXHRwcml2YXRlIF9zdGlja3lTY3JvbGxFbmFibGVkOiBib29sZWFuO1xuXHRwcml2YXRlIF9tYXhOdW1iZXJTdGlja3lMaW5lczogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRleHQ6IFZpZXdDb250ZXh0LCB2aWV3R3B1Q29udGV4dDogVmlld0dwdUNvbnRleHQgfCB1bmRlZmluZWQsIGxpbmVzQ29udGVudDogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+KSB7XG5cdFx0c3VwZXIoY29udGV4dCk7XG5cblx0XHRjb25zdCBjb25mID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uO1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucztcblx0XHRjb25zdCBmb250SW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb250SW5mbyk7XG5cdFx0Y29uc3Qgd3JhcHBpbmdJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndyYXBwaW5nSW5mbyk7XG5cblx0XHR0aGlzLl9saW5lSGVpZ2h0ID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdHRoaXMuX3R5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCA9IGZvbnRJbmZvLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDtcblx0XHR0aGlzLl9pc1ZpZXdwb3J0V3JhcHBpbmcgPSB3cmFwcGluZ0luZm8uaXNWaWV3cG9ydFdyYXBwaW5nO1xuXHRcdHRoaXMuX3JldmVhbEhvcml6b250YWxSaWdodFBhZGRpbmcgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ucmV2ZWFsSG9yaXpvbnRhbFJpZ2h0UGFkZGluZyk7XG5cdFx0dGhpcy5fY3Vyc29yU3Vycm91bmRpbmdMaW5lcyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5jdXJzb3JTdXJyb3VuZGluZ0xpbmVzKTtcblx0XHR0aGlzLl9jdXJzb3JTdXJyb3VuZGluZ0xpbmVzU3R5bGUgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uY3Vyc29yU3Vycm91bmRpbmdMaW5lc1N0eWxlKTtcblx0XHR0aGlzLl9jYW5Vc2VMYXllckhpbnRpbmcgPSAhb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmRpc2FibGVMYXllckhpbnRpbmcpO1xuXHRcdHRoaXMuX3ZpZXdMaW5lT3B0aW9ucyA9IG5ldyBWaWV3TGluZU9wdGlvbnMoY29uZiwgdGhpcy5fY29udGV4dC50aGVtZS50eXBlKTtcblxuXHRcdHRoaXMuX2xpbmVzQ29udGVudCA9IGxpbmVzQ29udGVudDtcblx0XHR0aGlzLl90ZXh0UmFuZ2VSZXN0aW5nU3BvdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX3Zpc2libGVMaW5lcyA9IG5ldyBWaXNpYmxlTGluZXNDb2xsZWN0aW9uKHRoaXMuX2NvbnRleHQsIHtcblx0XHRcdGNyZWF0ZUxpbmU6ICgpID0+IG5ldyBWaWV3TGluZSh2aWV3R3B1Q29udGV4dCwgdGhpcy5fdmlld0xpbmVPcHRpb25zKSxcblx0XHR9KTtcblx0XHR0aGlzLmRvbU5vZGUgPSB0aGlzLl92aXNpYmxlTGluZXMuZG9tTm9kZTtcblxuXHRcdFBhcnRGaW5nZXJwcmludHMud3JpdGUodGhpcy5kb21Ob2RlLCBQYXJ0RmluZ2VycHJpbnQuVmlld0xpbmVzKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0Q2xhc3NOYW1lKGB2aWV3LWxpbmVzICR7TU9VU0VfQ1VSU09SX1RFWFRfQ1NTX0NMQVNTX05BTUV9YCk7XG5cdFx0YXBwbHlGb250SW5mbyh0aGlzLmRvbU5vZGUsIGZvbnRJbmZvKTtcblxuXHRcdC8vIC0tLSB3aWR0aCAmIGhlaWdodFxuXHRcdHRoaXMuX21heExpbmVXaWR0aCA9IDA7XG5cdFx0dGhpcy5fYXN5bmNVcGRhdGVMaW5lV2lkdGhzID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlTGluZVdpZHRoc1Nsb3coKTtcblx0XHR9LCAyMDApO1xuXHRcdHRoaXMuX2FzeW5jQ2hlY2tNb25vc3BhY2VGb250QXNzdW1wdGlvbnMgPSBuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHR0aGlzLl9jaGVja01vbm9zcGFjZUZvbnRBc3N1bXB0aW9ucygpO1xuXHRcdH0sIDIwMDApO1xuXG5cdFx0dGhpcy5fbGFzdFJlbmRlcmVkRGF0YSA9IG5ldyBMYXN0UmVuZGVyZWREYXRhKCk7XG5cblx0XHR0aGlzLl9ob3Jpem9udGFsUmV2ZWFsUmVxdWVzdCA9IG51bGw7XG5cblx0XHQvLyBzdGlja3kgc2Nyb2xsIHdpZGdldFxuXHRcdHRoaXMuX3N0aWNreVNjcm9sbEVuYWJsZWQgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uc3RpY2t5U2Nyb2xsKS5lbmFibGVkO1xuXHRcdHRoaXMuX21heE51bWJlclN0aWNreUxpbmVzID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnN0aWNreVNjcm9sbCkubWF4TGluZUNvdW50O1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fYXN5bmNVcGRhdGVMaW5lV2lkdGhzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9hc3luY0NoZWNrTW9ub3NwYWNlRm9udEFzc3VtcHRpb25zLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RG9tTm9kZSgpOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4ge1xuXHRcdHJldHVybiB0aGlzLmRvbU5vZGU7XG5cdH1cblxuXHQvLyAtLS0tIGJlZ2luIHZpZXcgZXZlbnQgaGFuZGxlcnNcblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25Db25maWd1cmF0aW9uQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fdmlzaWJsZUxpbmVzLm9uQ29uZmlndXJhdGlvbkNoYW5nZWQoZSk7XG5cdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ud3JhcHBpbmdJbmZvKSkge1xuXHRcdFx0dGhpcy5fbWF4TGluZVdpZHRoID0gMDtcblx0XHR9XG5cblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnM7XG5cdFx0Y29uc3QgZm9udEluZm8gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRcdGNvbnN0IHdyYXBwaW5nSW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53cmFwcGluZ0luZm8pO1xuXG5cdFx0dGhpcy5fbGluZUhlaWdodCA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHR0aGlzLl90eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGggPSBmb250SW5mby50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg7XG5cdFx0dGhpcy5faXNWaWV3cG9ydFdyYXBwaW5nID0gd3JhcHBpbmdJbmZvLmlzVmlld3BvcnRXcmFwcGluZztcblx0XHR0aGlzLl9yZXZlYWxIb3Jpem9udGFsUmlnaHRQYWRkaW5nID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnJldmVhbEhvcml6b250YWxSaWdodFBhZGRpbmcpO1xuXHRcdHRoaXMuX2N1cnNvclN1cnJvdW5kaW5nTGluZXMgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uY3Vyc29yU3Vycm91bmRpbmdMaW5lcyk7XG5cdFx0dGhpcy5fY3Vyc29yU3Vycm91bmRpbmdMaW5lc1N0eWxlID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmN1cnNvclN1cnJvdW5kaW5nTGluZXNTdHlsZSk7XG5cdFx0dGhpcy5fY2FuVXNlTGF5ZXJIaW50aW5nID0gIW9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5kaXNhYmxlTGF5ZXJIaW50aW5nKTtcblxuXHRcdC8vIHN0aWNreSBzY3JvbGxcblx0XHR0aGlzLl9zdGlja3lTY3JvbGxFbmFibGVkID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnN0aWNreVNjcm9sbCkuZW5hYmxlZDtcblx0XHR0aGlzLl9tYXhOdW1iZXJTdGlja3lMaW5lcyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5zdGlja3lTY3JvbGwpLm1heExpbmVDb3VudDtcblxuXHRcdGFwcGx5Rm9udEluZm8odGhpcy5kb21Ob2RlLCBmb250SW5mbyk7XG5cblx0XHR0aGlzLl9vbk9wdGlvbnNNYXliZUNoYW5nZWQoKTtcblxuXHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pKSB7XG5cdFx0XHR0aGlzLl9tYXhMaW5lV2lkdGggPSAwO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHByaXZhdGUgX29uT3B0aW9uc01heWJlQ2hhbmdlZCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBjb25mID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uO1xuXG5cdFx0Y29uc3QgbmV3Vmlld0xpbmVPcHRpb25zID0gbmV3IFZpZXdMaW5lT3B0aW9ucyhjb25mLCB0aGlzLl9jb250ZXh0LnRoZW1lLnR5cGUpO1xuXHRcdGlmICghdGhpcy5fdmlld0xpbmVPcHRpb25zLmVxdWFscyhuZXdWaWV3TGluZU9wdGlvbnMpKSB7XG5cdFx0XHR0aGlzLl92aWV3TGluZU9wdGlvbnMgPSBuZXdWaWV3TGluZU9wdGlvbnM7XG5cblx0XHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRTdGFydExpbmVOdW1iZXIoKTtcblx0XHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0RW5kTGluZU51bWJlcigpO1xuXHRcdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlcjsgbGluZU51bWJlciA8PSBlbmRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZSA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRWaXNpYmxlTGluZShsaW5lTnVtYmVyKTtcblx0XHRcdFx0bGluZS5vbk9wdGlvbnNDaGFuZ2VkKHRoaXMuX3ZpZXdMaW5lT3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uQ3Vyc29yU3RhdGVDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0N1cnNvclN0YXRlQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcmVuZFN0YXJ0TGluZU51bWJlciA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRTdGFydExpbmVOdW1iZXIoKTtcblx0XHRjb25zdCByZW5kRW5kTGluZU51bWJlciA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRFbmRMaW5lTnVtYmVyKCk7XG5cdFx0bGV0IHIgPSBmYWxzZTtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gcmVuZFN0YXJ0TGluZU51bWJlcjsgbGluZU51bWJlciA8PSByZW5kRW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRyID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFZpc2libGVMaW5lKGxpbmVOdW1iZXIpLm9uU2VsZWN0aW9uQ2hhbmdlZCgpIHx8IHI7XG5cdFx0fVxuXHRcdHJldHVybiByO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkRlY29yYXRpb25zQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdEZWNvcmF0aW9uc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHJlbmRTdGFydExpbmVOdW1iZXIgPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0U3RhcnRMaW5lTnVtYmVyKCk7XG5cdFx0Y29uc3QgcmVuZEVuZExpbmVOdW1iZXIgPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0RW5kTGluZU51bWJlcigpO1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSByZW5kU3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IHJlbmRFbmRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdHRoaXMuX3Zpc2libGVMaW5lcy5nZXRWaXNpYmxlTGluZShsaW5lTnVtYmVyKS5vbkRlY29yYXRpb25zQ2hhbmdlZCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25GbHVzaGVkKGU6IHZpZXdFdmVudHMuVmlld0ZsdXNoZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNob3VsZFJlbmRlciA9IHRoaXMuX3Zpc2libGVMaW5lcy5vbkZsdXNoZWQoZSwgdGhpcy5fdmlld0xpbmVPcHRpb25zLnVzZUdwdSk7XG5cdFx0dGhpcy5fbWF4TGluZVdpZHRoID0gMDtcblx0XHRyZXR1cm4gc2hvdWxkUmVuZGVyO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVzQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl92aXNpYmxlTGluZXMub25MaW5lc0NoYW5nZWQoZSk7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uTGluZXNEZWxldGVkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzRGVsZXRlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Zpc2libGVMaW5lcy5vbkxpbmVzRGVsZXRlZChlKTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25MaW5lc0luc2VydGVkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzSW5zZXJ0ZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl92aXNpYmxlTGluZXMub25MaW5lc0luc2VydGVkKGUpO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvblJldmVhbFJhbmdlUmVxdWVzdChlOiB2aWV3RXZlbnRzLlZpZXdSZXZlYWxSYW5nZVJlcXVlc3RFdmVudCk6IGJvb2xlYW4ge1xuXHRcdC8vIFVzaW5nIHRoZSBmdXR1cmUgdmlld3BvcnQgaGVyZSBpbiBvcmRlciB0byBoYW5kbGUgbXVsdGlwbGVcblx0XHQvLyBpbmNvbWluZyByZXZlYWwgcmFuZ2UgcmVxdWVzdHMgdGhhdCBtaWdodCBhbGwgZGVzaXJlIHRvIGJlIGFuaW1hdGVkXG5cdFx0Y29uc3QgZGVzaXJlZFNjcm9sbFRvcCA9IHRoaXMuX2NvbXB1dGVTY3JvbGxUb3BUb1JldmVhbFJhbmdlKHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRGdXR1cmVWaWV3cG9ydCgpLCBlLnNvdXJjZSwgZS5taW5pbWFsUmV2ZWFsLCBlLnJhbmdlLCBlLnNlbGVjdGlvbnMsIGUudmVydGljYWxUeXBlKTtcblxuXHRcdGlmIChkZXNpcmVkU2Nyb2xsVG9wID09PSAtMSkge1xuXHRcdFx0Ly8gbWFya2VyIHRvIGFib3J0IHRoZSByZXZlYWwgcmFuZ2UgcmVxdWVzdFxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIHZhbGlkYXRlIHRoZSBuZXcgZGVzaXJlZCBzY3JvbGwgdG9wXG5cdFx0bGV0IG5ld1Njcm9sbFBvc2l0aW9uID0gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LnZhbGlkYXRlU2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IGRlc2lyZWRTY3JvbGxUb3AgfSk7XG5cblx0XHRpZiAoZS5yZXZlYWxIb3Jpem9udGFsKSB7XG5cdFx0XHRpZiAoZS5yYW5nZSAmJiBlLnJhbmdlLnN0YXJ0TGluZU51bWJlciAhPT0gZS5yYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdC8vIFR3byBvciBtb3JlIGxpbmVzPyA9PiBzY3JvbGwgdG8gYmFzZSAoVGhhdCdzIGhvdyB5b3Ugc2VlIG1vc3Qgb2YgdGhlIHR3byBsaW5lcylcblx0XHRcdFx0bmV3U2Nyb2xsUG9zaXRpb24gPSB7XG5cdFx0XHRcdFx0c2Nyb2xsVG9wOiBuZXdTY3JvbGxQb3NpdGlvbi5zY3JvbGxUb3AsXG5cdFx0XHRcdFx0c2Nyb2xsTGVmdDogMFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIGlmIChlLnJhbmdlKSB7XG5cdFx0XHRcdC8vIFdlIGRvbid0IG5lY2Vzc2FyaWx5IGtub3cgdGhlIGhvcml6b250YWwgb2Zmc2V0IG9mIHRoaXMgcmFuZ2Ugc2luY2UgdGhlIGxpbmUgbWlnaHQgbm90IGJlIGluIHRoZSB2aWV3Li4uXG5cdFx0XHRcdHRoaXMuX2hvcml6b250YWxSZXZlYWxSZXF1ZXN0ID0gbmV3IEhvcml6b250YWxSZXZlYWxSYW5nZVJlcXVlc3QoZS5taW5pbWFsUmV2ZWFsLCBlLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgZS5yYW5nZS5zdGFydENvbHVtbiwgZS5yYW5nZS5lbmRDb2x1bW4sIHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRDdXJyZW50U2Nyb2xsVG9wKCksIG5ld1Njcm9sbFBvc2l0aW9uLnNjcm9sbFRvcCwgZS5zY3JvbGxUeXBlKTtcblx0XHRcdH0gZWxzZSBpZiAoZS5zZWxlY3Rpb25zICYmIGUuc2VsZWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2hvcml6b250YWxSZXZlYWxSZXF1ZXN0ID0gbmV3IEhvcml6b250YWxSZXZlYWxTZWxlY3Rpb25zUmVxdWVzdChlLm1pbmltYWxSZXZlYWwsIGUuc2VsZWN0aW9ucywgdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldEN1cnJlbnRTY3JvbGxUb3AoKSwgbmV3U2Nyb2xsUG9zaXRpb24uc2Nyb2xsVG9wLCBlLnNjcm9sbFR5cGUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9ob3Jpem9udGFsUmV2ZWFsUmVxdWVzdCA9IG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Nyb2xsVG9wRGVsdGEgPSBNYXRoLmFicyh0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuZ2V0Q3VycmVudFNjcm9sbFRvcCgpIC0gbmV3U2Nyb2xsUG9zaXRpb24uc2Nyb2xsVG9wKTtcblx0XHRjb25zdCBzY3JvbGxUeXBlID0gKHNjcm9sbFRvcERlbHRhIDw9IHRoaXMuX2xpbmVIZWlnaHQgPyBTY3JvbGxUeXBlLkltbWVkaWF0ZSA6IGUuc2Nyb2xsVHlwZSk7XG5cdFx0dGhpcy5fY29udGV4dC52aWV3TW9kZWwudmlld0xheW91dC5zZXRTY3JvbGxQb3NpdGlvbihuZXdTY3JvbGxQb3NpdGlvbiwgc2Nyb2xsVHlwZSk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25TY3JvbGxDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1Njcm9sbENoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9ob3Jpem9udGFsUmV2ZWFsUmVxdWVzdCAmJiBlLnNjcm9sbExlZnRDaGFuZ2VkKSB7XG5cdFx0XHQvLyBjYW5jZWwgYW55IG91dHN0YW5kaW5nIGhvcml6b250YWwgcmV2ZWFsIHJlcXVlc3QgaWYgc29tZW9uZSBlbHNlIHNjcm9sbHMgaG9yaXpvbnRhbGx5LlxuXHRcdFx0dGhpcy5faG9yaXpvbnRhbFJldmVhbFJlcXVlc3QgPSBudWxsO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faG9yaXpvbnRhbFJldmVhbFJlcXVlc3QgJiYgZS5zY3JvbGxUb3BDaGFuZ2VkKSB7XG5cdFx0XHRjb25zdCBtaW4gPSBNYXRoLm1pbih0aGlzLl9ob3Jpem9udGFsUmV2ZWFsUmVxdWVzdC5zdGFydFNjcm9sbFRvcCwgdGhpcy5faG9yaXpvbnRhbFJldmVhbFJlcXVlc3Quc3RvcFNjcm9sbFRvcCk7XG5cdFx0XHRjb25zdCBtYXggPSBNYXRoLm1heCh0aGlzLl9ob3Jpem9udGFsUmV2ZWFsUmVxdWVzdC5zdGFydFNjcm9sbFRvcCwgdGhpcy5faG9yaXpvbnRhbFJldmVhbFJlcXVlc3Quc3RvcFNjcm9sbFRvcCk7XG5cdFx0XHRpZiAoZS5zY3JvbGxUb3AgPCBtaW4gfHwgZS5zY3JvbGxUb3AgPiBtYXgpIHtcblx0XHRcdFx0Ly8gY2FuY2VsIGFueSBvdXRzdGFuZGluZyBob3Jpem9udGFsIHJldmVhbCByZXF1ZXN0IGlmIHNvbWVvbmUgZWxzZSBzY3JvbGxzIHZlcnRpY2FsbHkuXG5cdFx0XHRcdHRoaXMuX2hvcml6b250YWxSZXZlYWxSZXF1ZXN0ID0gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5kb21Ob2RlLnNldFdpZHRoKGUuc2Nyb2xsV2lkdGgpO1xuXHRcdHJldHVybiB0aGlzLl92aXNpYmxlTGluZXMub25TY3JvbGxDaGFuZ2VkKGUpIHx8IGUuc2Nyb2xsVG9wQ2hhbmdlZCB8fCBlLnNjcm9sbExlZnRDaGFuZ2VkO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIG9uVG9rZW5zQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdUb2tlbnNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlzaWJsZUxpbmVzLm9uVG9rZW5zQ2hhbmdlZChlKTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25ab25lc0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Wm9uZXNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHR0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC52aWV3TGF5b3V0LnNldE1heExpbmVXaWR0aCh0aGlzLl9tYXhMaW5lV2lkdGgpO1xuXHRcdHJldHVybiB0aGlzLl92aXNpYmxlTGluZXMub25ab25lc0NoYW5nZWQoZSk7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uVGhlbWVDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1RoZW1lQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uT3B0aW9uc01heWJlQ2hhbmdlZCgpO1xuXHR9XG5cblx0Ly8gLS0tLSBlbmQgdmlldyBldmVudCBoYW5kbGVyc1xuXG5cdC8vIC0tLS0tLS0tLS0tIEhFTFBFUlMgRk9SIE9USEVSU1xuXG5cdHB1YmxpYyBnZXRQb3NpdGlvbkZyb21ET01JbmZvKHNwYW5Ob2RlOiBIVE1MRWxlbWVudCwgb2Zmc2V0OiBudW1iZXIpOiBQb3NpdGlvbiB8IG51bGwge1xuXHRcdGNvbnN0IHZpZXdMaW5lRG9tTm9kZSA9IHRoaXMuX2dldFZpZXdMaW5lRG9tTm9kZShzcGFuTm9kZSk7XG5cdFx0aWYgKHZpZXdMaW5lRG9tTm9kZSA9PT0gbnVsbCkge1xuXHRcdFx0Ly8gQ291bGRuJ3QgZmluZCB2aWV3IGxpbmUgbm9kZVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IGxpbmVOdW1iZXIgPSB0aGlzLl9nZXRMaW5lTnVtYmVyRm9yKHZpZXdMaW5lRG9tTm9kZSk7XG5cblx0XHRpZiAobGluZU51bWJlciA9PT0gLTEpIHtcblx0XHRcdC8vIENvdWxkbid0IGZpbmQgdmlldyBsaW5lIG5vZGVcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmIChsaW5lTnVtYmVyIDwgMSB8fCBsaW5lTnVtYmVyID4gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdC8vIGxpbmVOdW1iZXIgaXMgb3V0c2lkZSByYW5nZVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcikgPT09IDEpIHtcblx0XHRcdC8vIExpbmUgaXMgZW1wdHlcblx0XHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgMSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVuZFN0YXJ0TGluZU51bWJlciA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRTdGFydExpbmVOdW1iZXIoKTtcblx0XHRjb25zdCByZW5kRW5kTGluZU51bWJlciA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRFbmRMaW5lTnVtYmVyKCk7XG5cdFx0aWYgKGxpbmVOdW1iZXIgPCByZW5kU3RhcnRMaW5lTnVtYmVyIHx8IGxpbmVOdW1iZXIgPiByZW5kRW5kTGluZU51bWJlcikge1xuXHRcdFx0Ly8gQ291bGRuJ3QgZmluZCBsaW5lXG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRsZXQgY29sdW1uID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFZpc2libGVMaW5lKGxpbmVOdW1iZXIpLmdldENvbHVtbk9mTm9kZU9mZnNldChzcGFuTm9kZSwgb2Zmc2V0KTtcblx0XHRjb25zdCBtaW5Db2x1bW4gPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nZXRMaW5lTWluQ29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdGlmIChjb2x1bW4gPCBtaW5Db2x1bW4pIHtcblx0XHRcdGNvbHVtbiA9IG1pbkNvbHVtbjtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Vmlld0xpbmVEb21Ob2RlKG5vZGU6IEhUTUxFbGVtZW50IHwgbnVsbCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG5cdFx0d2hpbGUgKG5vZGUgJiYgbm9kZS5ub2RlVHlwZSA9PT0gMSkge1xuXHRcdFx0aWYgKG5vZGUuY2xhc3NOYW1lID09PSBWaWV3TGluZS5DTEFTU19OQU1FKSB7XG5cdFx0XHRcdHJldHVybiBub2RlO1xuXHRcdFx0fVxuXHRcdFx0bm9kZSA9IG5vZGUucGFyZW50RWxlbWVudDtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHQvKipcblx0ICogQHJldHVybnMgdGhlIGxpbmUgbnVtYmVyIG9mIHRoaXMgdmlldyBsaW5lIGRvbSBub2RlLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0TGluZU51bWJlckZvcihkb21Ob2RlOiBIVE1MRWxlbWVudCk6IG51bWJlciB7XG5cdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFN0YXJ0TGluZU51bWJlcigpO1xuXHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0RW5kTGluZU51bWJlcigpO1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gZW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRjb25zdCBsaW5lID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFZpc2libGVMaW5lKGxpbmVOdW1iZXIpO1xuXHRcdFx0aWYgKGRvbU5vZGUgPT09IGxpbmUuZ2V0RG9tTm9kZSgpKSB7XG5cdFx0XHRcdHJldHVybiBsaW5lTnVtYmVyO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gLTE7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZVdpZHRoKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgcmVuZFN0YXJ0TGluZU51bWJlciA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRTdGFydExpbmVOdW1iZXIoKTtcblx0XHRjb25zdCByZW5kRW5kTGluZU51bWJlciA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRFbmRMaW5lTnVtYmVyKCk7XG5cdFx0aWYgKGxpbmVOdW1iZXIgPCByZW5kU3RhcnRMaW5lTnVtYmVyIHx8IGxpbmVOdW1iZXIgPiByZW5kRW5kTGluZU51bWJlcikge1xuXHRcdFx0Ly8gQ291bGRuJ3QgZmluZCBsaW5lXG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGV4dCA9IG5ldyBEb21SZWFkaW5nQ29udGV4dCh0aGlzLmRvbU5vZGUuZG9tTm9kZSwgdGhpcy5fdGV4dFJhbmdlUmVzdGluZ1Nwb3QpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRWaXNpYmxlTGluZShsaW5lTnVtYmVyKS5nZXRXaWR0aChjb250ZXh0KTtcblx0XHR0aGlzLl91cGRhdGVMaW5lV2lkdGhzU2xvd0lmRG9tRGlkTGF5b3V0KGNvbnRleHQpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyByZXNldExpbmVXaWR0aENhY2hlcygpOiB2b2lkIHtcblx0XHRjb25zdCByZW5kU3RhcnRMaW5lTnVtYmVyID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFN0YXJ0TGluZU51bWJlcigpO1xuXHRcdGNvbnN0IHJlbmRFbmRMaW5lTnVtYmVyID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldEVuZExpbmVOdW1iZXIoKTtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gcmVuZFN0YXJ0TGluZU51bWJlcjsgbGluZU51bWJlciA8PSByZW5kRW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHR0aGlzLl92aXNpYmxlTGluZXMuZ2V0VmlzaWJsZUxpbmUobGluZU51bWJlcikucmVzZXRDYWNoZWRXaWR0aCgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBsaW5lc1Zpc2libGVSYW5nZXNGb3JSYW5nZShfcmFuZ2U6IFJhbmdlLCBpbmNsdWRlTmV3TGluZXM6IGJvb2xlYW4pOiBMaW5lVmlzaWJsZVJhbmdlc1tdIHwgbnVsbCB7XG5cdFx0Y29uc3Qgb3JpZ2luYWxFbmRMaW5lTnVtYmVyID0gX3JhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgcmFuZ2UgPSBSYW5nZS5pbnRlcnNlY3RSYW5nZXMoX3JhbmdlLCB0aGlzLl9sYXN0UmVuZGVyZWREYXRhLmdldEN1cnJlbnRWaXNpYmxlUmFuZ2UoKSk7XG5cdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmlzaWJsZVJhbmdlczogTGluZVZpc2libGVSYW5nZXNbXSA9IFtdO1xuXHRcdGxldCB2aXNpYmxlUmFuZ2VzTGVuID0gMDtcblx0XHRjb25zdCBkb21SZWFkaW5nQ29udGV4dCA9IG5ldyBEb21SZWFkaW5nQ29udGV4dCh0aGlzLmRvbU5vZGUuZG9tTm9kZSwgdGhpcy5fdGV4dFJhbmdlUmVzdGluZ1Nwb3QpO1xuXG5cdFx0bGV0IG5leHRMaW5lTW9kZWxMaW5lTnVtYmVyOiBudW1iZXIgPSAwO1xuXHRcdGlmIChpbmNsdWRlTmV3TGluZXMpIHtcblx0XHRcdG5leHRMaW5lTW9kZWxMaW5lTnVtYmVyID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbihuZXcgUG9zaXRpb24ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAxKSkubGluZU51bWJlcjtcblx0XHR9XG5cblx0XHRjb25zdCByZW5kU3RhcnRMaW5lTnVtYmVyID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFN0YXJ0TGluZU51bWJlcigpO1xuXHRcdGNvbnN0IHJlbmRFbmRMaW5lTnVtYmVyID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldEVuZExpbmVOdW1iZXIoKTtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IHJhbmdlLmVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXG5cdFx0XHRpZiAobGluZU51bWJlciA8IHJlbmRTdGFydExpbmVOdW1iZXIgfHwgbGluZU51bWJlciA+IHJlbmRFbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGFydENvbHVtbiA9IGxpbmVOdW1iZXIgPT09IHJhbmdlLnN0YXJ0TGluZU51bWJlciA/IHJhbmdlLnN0YXJ0Q29sdW1uIDogMTtcblx0XHRcdGNvbnN0IGNvbnRpbnVlc0luTmV4dExpbmUgPSBsaW5lTnVtYmVyICE9PSBvcmlnaW5hbEVuZExpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBlbmRDb2x1bW4gPSBjb250aW51ZXNJbk5leHRMaW5lID8gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKSA6IHJhbmdlLmVuZENvbHVtbjtcblx0XHRcdGNvbnN0IHZpc2libGVMaW5lID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFZpc2libGVMaW5lKGxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgdmlzaWJsZVJhbmdlc0ZvckxpbmUgPSB2aXNpYmxlTGluZS5nZXRWaXNpYmxlUmFuZ2VzRm9yUmFuZ2UobGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGVuZENvbHVtbiwgZG9tUmVhZGluZ0NvbnRleHQpO1xuXG5cdFx0XHRpZiAoIXZpc2libGVSYW5nZXNGb3JMaW5lKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaW5jbHVkZU5ld0xpbmVzICYmIGxpbmVOdW1iZXIgPCBvcmlnaW5hbEVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudExpbmVNb2RlbExpbmVOdW1iZXIgPSBuZXh0TGluZU1vZGVsTGluZU51bWJlcjtcblx0XHRcdFx0bmV4dExpbmVNb2RlbExpbmVOdW1iZXIgPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyICsgMSwgMSkpLmxpbmVOdW1iZXI7XG5cblx0XHRcdFx0aWYgKGN1cnJlbnRMaW5lTW9kZWxMaW5lTnVtYmVyICE9PSBuZXh0TGluZU1vZGVsTGluZU51bWJlcikge1xuXHRcdFx0XHRcdGNvbnN0IGZsb2F0SG9yaXpvbnRhbFJhbmdlID0gdmlzaWJsZVJhbmdlc0ZvckxpbmUucmFuZ2VzW3Zpc2libGVSYW5nZXNGb3JMaW5lLnJhbmdlcy5sZW5ndGggLSAxXTtcblx0XHRcdFx0XHRmbG9hdEhvcml6b250YWxSYW5nZS53aWR0aCArPSB0aGlzLl90eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdldFRleHREaXJlY3Rpb24oY3VycmVudExpbmVNb2RlbExpbmVOdW1iZXIpID09PSBUZXh0RGlyZWN0aW9uLlJUTCkge1xuXHRcdFx0XHRcdFx0ZmxvYXRIb3Jpem9udGFsUmFuZ2UubGVmdCAtPSB0aGlzLl90eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHZpc2libGVSYW5nZXNbdmlzaWJsZVJhbmdlc0xlbisrXSA9IG5ldyBMaW5lVmlzaWJsZVJhbmdlcyh2aXNpYmxlUmFuZ2VzRm9yTGluZS5vdXRzaWRlUmVuZGVyZWRMaW5lLCBsaW5lTnVtYmVyLCBIb3Jpem9udGFsUmFuZ2UuZnJvbSh2aXNpYmxlUmFuZ2VzRm9yTGluZS5yYW5nZXMpLCBjb250aW51ZXNJbk5leHRMaW5lKTtcblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVMaW5lV2lkdGhzU2xvd0lmRG9tRGlkTGF5b3V0KGRvbVJlYWRpbmdDb250ZXh0KTtcblxuXHRcdGlmICh2aXNpYmxlUmFuZ2VzTGVuID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdmlzaWJsZVJhbmdlcztcblx0fVxuXG5cdHByaXZhdGUgX3Zpc2libGVSYW5nZXNGb3JMaW5lUmFuZ2UobGluZU51bWJlcjogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyLCBlbmRDb2x1bW46IG51bWJlcik6IFZpc2libGVSYW5nZXMgfCBudWxsIHtcblx0XHRpZiAobGluZU51bWJlciA8IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRTdGFydExpbmVOdW1iZXIoKSB8fCBsaW5lTnVtYmVyID4gdGhpcy5fdmlzaWJsZUxpbmVzLmdldEVuZExpbmVOdW1iZXIoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZG9tUmVhZGluZ0NvbnRleHQgPSBuZXcgRG9tUmVhZGluZ0NvbnRleHQodGhpcy5kb21Ob2RlLmRvbU5vZGUsIHRoaXMuX3RleHRSYW5nZVJlc3RpbmdTcG90KTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0VmlzaWJsZUxpbmUobGluZU51bWJlcikuZ2V0VmlzaWJsZVJhbmdlc0ZvclJhbmdlKGxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRDb2x1bW4sIGRvbVJlYWRpbmdDb250ZXh0KTtcblx0XHR0aGlzLl91cGRhdGVMaW5lV2lkdGhzU2xvd0lmRG9tRGlkTGF5b3V0KGRvbVJlYWRpbmdDb250ZXh0KTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9saW5lSXNSZW5kZXJlZFJUTChsaW5lTnVtYmVyOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAobGluZU51bWJlciA8IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRTdGFydExpbmVOdW1iZXIoKSB8fCBsaW5lTnVtYmVyID4gdGhpcy5fdmlzaWJsZUxpbmVzLmdldEVuZExpbmVOdW1iZXIoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCB2aXNpYmxlTGluZSA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRWaXNpYmxlTGluZShsaW5lTnVtYmVyKTtcblx0XHRyZXR1cm4gdmlzaWJsZUxpbmUuaXNSZW5kZXJlZFJUTCgpO1xuXHR9XG5cblx0cHVibGljIHZpc2libGVSYW5nZUZvclBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbik6IEhvcml6b250YWxQb3NpdGlvbiB8IG51bGwge1xuXHRcdGNvbnN0IHZpc2libGVSYW5nZXMgPSB0aGlzLl92aXNpYmxlUmFuZ2VzRm9yTGluZVJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiwgcG9zaXRpb24uY29sdW1uKTtcblx0XHRpZiAoIXZpc2libGVSYW5nZXMpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IEhvcml6b250YWxQb3NpdGlvbih2aXNpYmxlUmFuZ2VzLm91dHNpZGVSZW5kZXJlZExpbmUsIHZpc2libGVSYW5nZXMucmFuZ2VzWzBdLmxlZnQpO1xuXHR9XG5cblx0Ly8gLS0tIGltcGxlbWVudGF0aW9uXG5cblx0cHVibGljIHVwZGF0ZUxpbmVXaWR0aHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fdXBkYXRlTGluZVdpZHRocyhmYWxzZSk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgbWF4IGxpbmUgd2lkdGggaWYgaXQgaXMgZmFzdCB0byBjb21wdXRlLlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgYWxsIGxpbmVzIHdlcmUgdGFrZW4gaW50byBhY2NvdW50LlxuXHQgKiBSZXR1cm5zIGZhbHNlIGlmIHNvbWUgbGluZXMgbmVlZCB0byBiZSByZWV2YWx1YXRlZCAoaW4gYSBzbG93IGZhc2hpb24pLlxuXHQgKi9cblx0cHJpdmF0ZSBfdXBkYXRlTGluZVdpZHRoc0Zhc3QoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3VwZGF0ZUxpbmVXaWR0aHModHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVMaW5lV2lkdGhzU2xvdygpOiB2b2lkIHtcblx0XHR0aGlzLl91cGRhdGVMaW5lV2lkdGhzKGZhbHNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGUgdGhlIGxpbmUgd2lkdGhzIHVzaW5nIERPTSBsYXlvdXQgaW5mb3JtYXRpb24gYWZ0ZXIgc29tZW9uZSBlbHNlXG5cdCAqIGhhcyBjYXVzZWQgYSBzeW5jaHJvbm91cyBsYXlvdXQuXG5cdCAqL1xuXHRwcml2YXRlIF91cGRhdGVMaW5lV2lkdGhzU2xvd0lmRG9tRGlkTGF5b3V0KGRvbVJlYWRpbmdDb250ZXh0OiBEb21SZWFkaW5nQ29udGV4dCk6IHZvaWQge1xuXHRcdGlmICghZG9tUmVhZGluZ0NvbnRleHQuZGlkRG9tTGF5b3V0KSB7XG5cdFx0XHQvLyBvbmx5IHByb2NlZWQgaWYgd2UganVzdCBkaWQgYSBsYXlvdXRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9hc3luY1VwZGF0ZUxpbmVXaWR0aHMuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0Ly8gcmVhZGluZyB3aWR0aHMgaXMgbm90IHNjaGVkdWxlZCA9PiB3aWR0aHMgYXJlIHVwLXRvLWRhdGVcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYXN5bmNVcGRhdGVMaW5lV2lkdGhzLmNhbmNlbCgpO1xuXHRcdHRoaXMuX3VwZGF0ZUxpbmVXaWR0aHNTbG93KCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVMaW5lV2lkdGhzKGZhc3Q6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRjb25zdCByZW5kU3RhcnRMaW5lTnVtYmVyID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFN0YXJ0TGluZU51bWJlcigpO1xuXHRcdGNvbnN0IHJlbmRFbmRMaW5lTnVtYmVyID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldEVuZExpbmVOdW1iZXIoKTtcblxuXHRcdGxldCBsb2NhbE1heExpbmVXaWR0aCA9IDE7XG5cdFx0bGV0IGFsbFdpZHRoc0NvbXB1dGVkID0gdHJ1ZTtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gcmVuZFN0YXJ0TGluZU51bWJlcjsgbGluZU51bWJlciA8PSByZW5kRW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRjb25zdCB2aXNpYmxlTGluZSA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRWaXNpYmxlTGluZShsaW5lTnVtYmVyKTtcblxuXHRcdFx0aWYgKGZhc3QgJiYgIXZpc2libGVMaW5lLmdldFdpZHRoSXNGYXN0KCkpIHtcblx0XHRcdFx0Ly8gQ2Fubm90IGNvbXB1dGUgd2lkdGggaW4gYSBmYXN0IHdheSBmb3IgdGhpcyBsaW5lXG5cdFx0XHRcdGFsbFdpZHRoc0NvbXB1dGVkID0gZmFsc2U7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRsb2NhbE1heExpbmVXaWR0aCA9IE1hdGgubWF4KGxvY2FsTWF4TGluZVdpZHRoLCB2aXNpYmxlTGluZS5nZXRXaWR0aChudWxsKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGFsbFdpZHRoc0NvbXB1dGVkICYmIHJlbmRTdGFydExpbmVOdW1iZXIgPT09IDEgJiYgcmVuZEVuZExpbmVOdW1iZXIgPT09IHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHQvLyB3ZSBrbm93IHRoZSBtYXggbGluZSB3aWR0aCBmb3IgYWxsIHRoZSBsaW5lc1xuXHRcdFx0dGhpcy5fbWF4TGluZVdpZHRoID0gMDtcblx0XHR9XG5cblx0XHR0aGlzLl9lbnN1cmVNYXhMaW5lV2lkdGgobG9jYWxNYXhMaW5lV2lkdGgpO1xuXG5cdFx0cmV0dXJuIGFsbFdpZHRoc0NvbXB1dGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2hlY2tNb25vc3BhY2VGb250QXNzdW1wdGlvbnMoKTogdm9pZCB7XG5cdFx0Ly8gUHJvYmxlbXMgd2l0aCBtb25vc3BhY2UgYXNzdW1wdGlvbnMgYXJlIG1vcmUgYXBwYXJlbnQgZm9yIGxvbmdlciBsaW5lcyxcblx0XHQvLyBhcyBzbWFsbCByb3VuZGluZyBlcnJvcnMgc3RhcnQgdG8gc3VtIHVwLCBzbyB3ZSB3aWxsIHNlbGVjdCB0aGUgbG9uZ2VzdFxuXHRcdC8vIGxpbmUgZm9yIGEgY2xvc2VyIGluc3BlY3Rpb25cblx0XHRsZXQgbG9uZ2VzdExpbmVOdW1iZXIgPSAtMTtcblx0XHRsZXQgbG9uZ2VzdFdpZHRoID0gLTE7XG5cdFx0Y29uc3QgcmVuZFN0YXJ0TGluZU51bWJlciA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRTdGFydExpbmVOdW1iZXIoKTtcblx0XHRjb25zdCByZW5kRW5kTGluZU51bWJlciA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRFbmRMaW5lTnVtYmVyKCk7XG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHJlbmRTdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gcmVuZEVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgdmlzaWJsZUxpbmUgPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0VmlzaWJsZUxpbmUobGluZU51bWJlcik7XG5cdFx0XHRpZiAodmlzaWJsZUxpbmUubmVlZHNNb25vc3BhY2VGb250Q2hlY2soKSkge1xuXHRcdFx0XHRjb25zdCBsaW5lV2lkdGggPSB2aXNpYmxlTGluZS5nZXRXaWR0aChudWxsKTtcblx0XHRcdFx0aWYgKGxpbmVXaWR0aCA+IGxvbmdlc3RXaWR0aCkge1xuXHRcdFx0XHRcdGxvbmdlc3RXaWR0aCA9IGxpbmVXaWR0aDtcblx0XHRcdFx0XHRsb25nZXN0TGluZU51bWJlciA9IGxpbmVOdW1iZXI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobG9uZ2VzdExpbmVOdW1iZXIgPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl92aXNpYmxlTGluZXMuZ2V0VmlzaWJsZUxpbmUobG9uZ2VzdExpbmVOdW1iZXIpLm1vbm9zcGFjZUFzc3VtcHRpb25zQXJlVmFsaWQoKSkge1xuXHRcdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHJlbmRTdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gcmVuZEVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0XHRjb25zdCB2aXNpYmxlTGluZSA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRWaXNpYmxlTGluZShsaW5lTnVtYmVyKTtcblx0XHRcdFx0dmlzaWJsZUxpbmUub25Nb25vc3BhY2VBc3N1bXB0aW9uc0ludmFsaWRhdGVkKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHByZXBhcmVSZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkJyk7XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyKCk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZCcpO1xuXHR9XG5cblx0cHVibGljIHJlbmRlclRleHQodmlld3BvcnREYXRhOiBWaWV3cG9ydERhdGEpOiB2b2lkIHtcblx0XHQvLyAoMSkgcmVuZGVyIGxpbmVzIC0gZW5zdXJlcyBsaW5lcyBhcmUgaW4gdGhlIERPTVxuXHRcdHRoaXMuX3Zpc2libGVMaW5lcy5yZW5kZXJMaW5lcyh2aWV3cG9ydERhdGEpO1xuXHRcdHRoaXMuX2xhc3RSZW5kZXJlZERhdGEuc2V0Q3VycmVudFZpc2libGVSYW5nZSh2aWV3cG9ydERhdGEudmlzaWJsZVJhbmdlKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0V2lkdGgodGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldFNjcm9sbFdpZHRoKCkpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRIZWlnaHQoTWF0aC5taW4odGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldFNjcm9sbEhlaWdodCgpLCAxMDAwMDAwKSk7XG5cblx0XHQvLyAoMikgY29tcHV0ZSBob3Jpem9udGFsIHNjcm9sbCBwb3NpdGlvbjpcblx0XHQvLyAgLSB0aGlzIG11c3QgaGFwcGVuIGFmdGVyIHRoZSBsaW5lcyBhcmUgaW4gdGhlIERPTSBzaW5jZSBpdCBtaWdodCBuZWVkIGEgbGluZSB0aGF0IHJlbmRlcmVkIGp1c3Qgbm93XG5cdFx0Ly8gIC0gaXQgbWlnaHQgY2hhbmdlIGBzY3JvbGxXaWR0aGAgYW5kIGBzY3JvbGxMZWZ0YFxuXHRcdGlmICh0aGlzLl9ob3Jpem9udGFsUmV2ZWFsUmVxdWVzdCkge1xuXG5cdFx0XHRjb25zdCBob3Jpem9udGFsUmV2ZWFsUmVxdWVzdCA9IHRoaXMuX2hvcml6b250YWxSZXZlYWxSZXF1ZXN0O1xuXG5cdFx0XHQvLyBDaGVjayB0aGF0IHdlIGhhdmUgdGhlIGxpbmUgdGhhdCBjb250YWlucyB0aGUgaG9yaXpvbnRhbCByYW5nZSBpbiB0aGUgdmlld3BvcnRcblx0XHRcdGlmICh2aWV3cG9ydERhdGEuc3RhcnRMaW5lTnVtYmVyIDw9IGhvcml6b250YWxSZXZlYWxSZXF1ZXN0Lm1pbkxpbmVOdW1iZXIgJiYgaG9yaXpvbnRhbFJldmVhbFJlcXVlc3QubWF4TGluZU51bWJlciA8PSB2aWV3cG9ydERhdGEuZW5kTGluZU51bWJlcikge1xuXG5cdFx0XHRcdHRoaXMuX2hvcml6b250YWxSZXZlYWxSZXF1ZXN0ID0gbnVsbDtcblxuXHRcdFx0XHQvLyBhbGxvdyBgdmlzaWJsZVJhbmdlc0ZvclJhbmdlMmAgdG8gd29ya1xuXHRcdFx0XHR0aGlzLm9uRGlkUmVuZGVyKCk7XG5cblx0XHRcdFx0Ly8gY29tcHV0ZSBuZXcgc2Nyb2xsIHBvc2l0aW9uXG5cdFx0XHRcdGNvbnN0IG5ld1Njcm9sbExlZnQgPSB0aGlzLl9jb21wdXRlU2Nyb2xsTGVmdFRvUmV2ZWFsKGhvcml6b250YWxSZXZlYWxSZXF1ZXN0KTtcblxuXHRcdFx0XHRpZiAobmV3U2Nyb2xsTGVmdCkge1xuXHRcdFx0XHRcdGlmICghdGhpcy5faXNWaWV3cG9ydFdyYXBwaW5nICYmICFuZXdTY3JvbGxMZWZ0Lmhhc1JUTCkge1xuXHRcdFx0XHRcdFx0Ly8gZW5zdXJlIGBzY3JvbGxXaWR0aGAgaXMgbGFyZ2UgZW5vdWdoXG5cdFx0XHRcdFx0XHR0aGlzLl9lbnN1cmVNYXhMaW5lV2lkdGgobmV3U2Nyb2xsTGVmdC5tYXhIb3Jpem9udGFsT2Zmc2V0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gc2V0IGBzY3JvbGxMZWZ0YFxuXHRcdFx0XHRcdHRoaXMuX2NvbnRleHQudmlld01vZGVsLnZpZXdMYXlvdXQuc2V0U2Nyb2xsUG9zaXRpb24oe1xuXHRcdFx0XHRcdFx0c2Nyb2xsTGVmdDogbmV3U2Nyb2xsTGVmdC5zY3JvbGxMZWZ0XG5cdFx0XHRcdFx0fSwgaG9yaXpvbnRhbFJldmVhbFJlcXVlc3Quc2Nyb2xsVHlwZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgbWF4IGxpbmUgd2lkdGggKG5vdCBzbyBpbXBvcnRhbnQsIGl0IGlzIGp1c3Qgc28gdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyIGRvZXNuJ3QgZ2V0IHRvbyBzbWFsbClcblx0XHRpZiAoIXRoaXMuX3VwZGF0ZUxpbmVXaWR0aHNGYXN0KCkpIHtcblx0XHRcdC8vIENvbXB1dGluZyB0aGUgd2lkdGggb2Ygc29tZSBsaW5lcyB3b3VsZCBiZSBzbG93ID0+IGRlbGF5IGl0XG5cdFx0XHR0aGlzLl9hc3luY1VwZGF0ZUxpbmVXaWR0aHMuc2NoZWR1bGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fYXN5bmNVcGRhdGVMaW5lV2lkdGhzLmNhbmNlbCgpO1xuXHRcdH1cblxuXHRcdGlmIChwbGF0Zm9ybS5pc0xpbnV4ICYmICF0aGlzLl9hc3luY0NoZWNrTW9ub3NwYWNlRm9udEFzc3VtcHRpb25zLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdGNvbnN0IHJlbmRTdGFydExpbmVOdW1iZXIgPSB0aGlzLl92aXNpYmxlTGluZXMuZ2V0U3RhcnRMaW5lTnVtYmVyKCk7XG5cdFx0XHRjb25zdCByZW5kRW5kTGluZU51bWJlciA9IHRoaXMuX3Zpc2libGVMaW5lcy5nZXRFbmRMaW5lTnVtYmVyKCk7XG5cdFx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gcmVuZFN0YXJ0TGluZU51bWJlcjsgbGluZU51bWJlciA8PSByZW5kRW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRcdGNvbnN0IHZpc2libGVMaW5lID0gdGhpcy5fdmlzaWJsZUxpbmVzLmdldFZpc2libGVMaW5lKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRpZiAodmlzaWJsZUxpbmUubmVlZHNNb25vc3BhY2VGb250Q2hlY2soKSkge1xuXHRcdFx0XHRcdHRoaXMuX2FzeW5jQ2hlY2tNb25vc3BhY2VGb250QXNzdW1wdGlvbnMuc2NoZWR1bGUoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vICgzKSBoYW5kbGUgc2Nyb2xsaW5nXG5cdFx0dGhpcy5fbGluZXNDb250ZW50LnNldExheWVySGludGluZyh0aGlzLl9jYW5Vc2VMYXllckhpbnRpbmcpO1xuXHRcdHRoaXMuX2xpbmVzQ29udGVudC5zZXRDb250YWluKCdzdHJpY3QnKTtcblx0XHRjb25zdCBhZGp1c3RlZFNjcm9sbFRvcCA9IHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRDdXJyZW50U2Nyb2xsVG9wKCkgLSB2aWV3cG9ydERhdGEuYmlnTnVtYmVyc0RlbHRhO1xuXHRcdHRoaXMuX2xpbmVzQ29udGVudC5zZXRUb3AoLWFkanVzdGVkU2Nyb2xsVG9wKTtcblx0XHR0aGlzLl9saW5lc0NvbnRlbnQuc2V0TGVmdCgtdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldEN1cnJlbnRTY3JvbGxMZWZ0KCkpO1xuXHR9XG5cblx0Ly8gLS0tIHdpZHRoXG5cblx0cHJpdmF0ZSBfZW5zdXJlTWF4TGluZVdpZHRoKGxpbmVXaWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Ly8gV2hlbiBHUFUgcmVuZGVyaW5nIGlzIGVuYWJsZWQsIFZpZXdMaW5lc0dwdSBoYW5kbGVzIG1heCBsaW5lIHdpZHRoIHRyYWNraW5nXG5cdFx0aWYgKHRoaXMuX3ZpZXdMaW5lT3B0aW9ucy51c2VHcHUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaUxpbmVXaWR0aCA9IE1hdGguY2VpbChsaW5lV2lkdGgpO1xuXHRcdGlmICh0aGlzLl9tYXhMaW5lV2lkdGggPCBpTGluZVdpZHRoKSB7XG5cdFx0XHR0aGlzLl9tYXhMaW5lV2lkdGggPSBpTGluZVdpZHRoO1xuXHRcdFx0dGhpcy5fY29udGV4dC52aWV3TW9kZWwudmlld0xheW91dC5zZXRNYXhMaW5lV2lkdGgodGhpcy5fbWF4TGluZVdpZHRoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlU2Nyb2xsVG9wVG9SZXZlYWxSYW5nZSh2aWV3cG9ydDogVmlld3BvcnQsIHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgbWluaW1hbFJldmVhbDogYm9vbGVhbiwgcmFuZ2U6IFJhbmdlIHwgbnVsbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10gfCBudWxsLCB2ZXJ0aWNhbFR5cGU6IHZpZXdFdmVudHMuVmVydGljYWxSZXZlYWxUeXBlKTogbnVtYmVyIHtcblx0XHRjb25zdCB2aWV3cG9ydFN0YXJ0WSA9IHZpZXdwb3J0LnRvcDtcblx0XHRjb25zdCB2aWV3cG9ydEhlaWdodCA9IHZpZXdwb3J0LmhlaWdodDtcblx0XHRjb25zdCB2aWV3cG9ydEVuZFkgPSB2aWV3cG9ydFN0YXJ0WSArIHZpZXdwb3J0SGVpZ2h0O1xuXHRcdGxldCBib3hJc1NpbmdsZVJhbmdlOiBib29sZWFuO1xuXHRcdGxldCBib3hTdGFydFk6IG51bWJlcjtcblx0XHRsZXQgYm94RW5kWTogbnVtYmVyO1xuXG5cdFx0aWYgKHNlbGVjdGlvbnMgJiYgc2VsZWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRsZXQgbWluTGluZU51bWJlciA9IHNlbGVjdGlvbnNbMF0uc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0bGV0IG1heExpbmVOdW1iZXIgPSBzZWxlY3Rpb25zWzBdLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRmb3IgKGxldCBpID0gMSwgbGVuID0gc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBzZWxlY3Rpb25zW2ldO1xuXHRcdFx0XHRtaW5MaW5lTnVtYmVyID0gTWF0aC5taW4obWluTGluZU51bWJlciwgc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdG1heExpbmVOdW1iZXIgPSBNYXRoLm1heChtYXhMaW5lTnVtYmVyLCBzZWxlY3Rpb24uZW5kTGluZU51bWJlcik7XG5cdFx0XHR9XG5cdFx0XHRib3hJc1NpbmdsZVJhbmdlID0gZmFsc2U7XG5cdFx0XHRib3hTdGFydFkgPSB0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuZ2V0VmVydGljYWxPZmZzZXRGb3JMaW5lTnVtYmVyKG1pbkxpbmVOdW1iZXIpO1xuXHRcdFx0Ym94RW5kWSA9IHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRWZXJ0aWNhbE9mZnNldEZvckxpbmVOdW1iZXIobWF4TGluZU51bWJlcikgKyB0aGlzLl9saW5lSGVpZ2h0O1xuXHRcdH0gZWxzZSBpZiAocmFuZ2UpIHtcblx0XHRcdGJveElzU2luZ2xlUmFuZ2UgPSB0cnVlO1xuXHRcdFx0Ym94U3RhcnRZID0gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcihyYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0Ym94RW5kWSA9IHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRWZXJ0aWNhbE9mZnNldEZvckxpbmVOdW1iZXIocmFuZ2UuZW5kTGluZU51bWJlcikgKyB0aGlzLl9saW5lSGVpZ2h0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2hvdWxkSWdub3JlU2Nyb2xsT2ZmID0gKHNvdXJjZSA9PT0gJ21vdXNlJyB8fCBtaW5pbWFsUmV2ZWFsKSAmJiB0aGlzLl9jdXJzb3JTdXJyb3VuZGluZ0xpbmVzU3R5bGUgPT09ICdkZWZhdWx0JztcblxuXHRcdGxldCBwYWRkaW5nVG9wOiBudW1iZXIgPSAwO1xuXHRcdGxldCBwYWRkaW5nQm90dG9tOiBudW1iZXIgPSAwO1xuXG5cdFx0aWYgKCFzaG91bGRJZ25vcmVTY3JvbGxPZmYpIHtcblx0XHRcdGNvbnN0IG1heExpbmVzSW5WaWV3cG9ydCA9ICh2aWV3cG9ydEhlaWdodCAvIHRoaXMuX2xpbmVIZWlnaHQpO1xuXHRcdFx0Y29uc3Qgc3Vycm91bmRpbmdMaW5lcyA9IE1hdGgubWF4KHRoaXMuX2N1cnNvclN1cnJvdW5kaW5nTGluZXMsIHRoaXMuX3N0aWNreVNjcm9sbEVuYWJsZWQgPyB0aGlzLl9tYXhOdW1iZXJTdGlja3lMaW5lcyA6IDApO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IE1hdGgubWluKG1heExpbmVzSW5WaWV3cG9ydCAvIDIsIHN1cnJvdW5kaW5nTGluZXMpO1xuXHRcdFx0cGFkZGluZ1RvcCA9IGNvbnRleHQgKiB0aGlzLl9saW5lSGVpZ2h0O1xuXHRcdFx0cGFkZGluZ0JvdHRvbSA9IE1hdGgubWF4KDAsIChjb250ZXh0IC0gMSkpICogdGhpcy5fbGluZUhlaWdodDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKCFtaW5pbWFsUmV2ZWFsKSB7XG5cdFx0XHRcdC8vIFJldmVhbCBvbmUgbW9yZSBsaW5lIGFib3ZlICh0aGlzIGNhc2UgaXMgaGl0IHdoZW4gZHJhZ2dpbmcpXG5cdFx0XHRcdHBhZGRpbmdUb3AgPSB0aGlzLl9saW5lSGVpZ2h0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIW1pbmltYWxSZXZlYWwpIHtcblx0XHRcdGlmICh2ZXJ0aWNhbFR5cGUgPT09IHZpZXdFdmVudHMuVmVydGljYWxSZXZlYWxUeXBlLlNpbXBsZSB8fCB2ZXJ0aWNhbFR5cGUgPT09IHZpZXdFdmVudHMuVmVydGljYWxSZXZlYWxUeXBlLkJvdHRvbSkge1xuXHRcdFx0XHQvLyBSZXZlYWwgb25lIGxpbmUgbW9yZSB3aGVuIHRoZSBsYXN0IGxpbmUgd291bGQgYmUgY292ZXJlZCBieSB0aGUgc2Nyb2xsYmFyIC0gYXJyb3cgZG93biBjYXNlIG9yIHJldmVhbGluZyBhIGxpbmUgZXhwbGljaXRseSBhdCBib3R0b21cblx0XHRcdFx0cGFkZGluZ0JvdHRvbSArPSB0aGlzLl9saW5lSGVpZ2h0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGJveFN0YXJ0WSAtPSBwYWRkaW5nVG9wO1xuXHRcdGJveEVuZFkgKz0gcGFkZGluZ0JvdHRvbTtcblx0XHRsZXQgbmV3U2Nyb2xsVG9wOiBudW1iZXI7XG5cblx0XHRpZiAoYm94RW5kWSAtIGJveFN0YXJ0WSA+IHZpZXdwb3J0SGVpZ2h0KSB7XG5cdFx0XHQvLyB0aGUgYm94IGlzIGxhcmdlciB0aGFuIHRoZSB2aWV3cG9ydCAuLi4gc2Nyb2xsIHRvIGl0cyB0b3Bcblx0XHRcdGlmICghYm94SXNTaW5nbGVSYW5nZSkge1xuXHRcdFx0XHQvLyBkbyBub3QgcmV2ZWFsIG11bHRpcGxlIGN1cnNvcnMgaWYgdGhlcmUgYXJlIG1vcmUgdGhhbiBmaXQgdGhlIHZpZXdwb3J0XG5cdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdH1cblx0XHRcdG5ld1Njcm9sbFRvcCA9IGJveFN0YXJ0WTtcblx0XHR9IGVsc2UgaWYgKHZlcnRpY2FsVHlwZSA9PT0gdmlld0V2ZW50cy5WZXJ0aWNhbFJldmVhbFR5cGUuTmVhclRvcCB8fCB2ZXJ0aWNhbFR5cGUgPT09IHZpZXdFdmVudHMuVmVydGljYWxSZXZlYWxUeXBlLk5lYXJUb3BJZk91dHNpZGVWaWV3cG9ydCkge1xuXHRcdFx0aWYgKHZlcnRpY2FsVHlwZSA9PT0gdmlld0V2ZW50cy5WZXJ0aWNhbFJldmVhbFR5cGUuTmVhclRvcElmT3V0c2lkZVZpZXdwb3J0ICYmIHZpZXdwb3J0U3RhcnRZIDw9IGJveFN0YXJ0WSAmJiBib3hFbmRZIDw9IHZpZXdwb3J0RW5kWSkge1xuXHRcdFx0XHQvLyBCb3ggaXMgYWxyZWFkeSBpbiB0aGUgdmlld3BvcnQuLi4gZG8gbm90aGluZ1xuXHRcdFx0XHRuZXdTY3JvbGxUb3AgPSB2aWV3cG9ydFN0YXJ0WTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFdlIHdhbnQgYSBnYXAgdGhhdCBpcyAyMCUgb2YgdGhlIHZpZXdwb3J0LCBidXQgd2l0aCBhIG1pbmltdW0gb2YgNSBsaW5lc1xuXHRcdFx0XHRjb25zdCBkZXNpcmVkR2FwQWJvdmUgPSBNYXRoLm1heCg1ICogdGhpcy5fbGluZUhlaWdodCwgdmlld3BvcnRIZWlnaHQgKiAwLjIpO1xuXHRcdFx0XHQvLyBUcnkgdG8gc2Nyb2xsIGp1c3QgYWJvdmUgdGhlIGJveCB3aXRoIHRoZSBkZXNpcmVkIGdhcFxuXHRcdFx0XHRjb25zdCBkZXNpcmVkU2Nyb2xsVG9wID0gYm94U3RhcnRZIC0gZGVzaXJlZEdhcEFib3ZlO1xuXHRcdFx0XHQvLyBCdXQgZW5zdXJlIHRoYXQgdGhlIGJveCBpcyBub3QgcHVzaGVkIG91dCBvZiB2aWV3cG9ydFxuXHRcdFx0XHRjb25zdCBtaW5TY3JvbGxUb3AgPSBib3hFbmRZIC0gdmlld3BvcnRIZWlnaHQ7XG5cdFx0XHRcdG5ld1Njcm9sbFRvcCA9IE1hdGgubWF4KG1pblNjcm9sbFRvcCwgZGVzaXJlZFNjcm9sbFRvcCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh2ZXJ0aWNhbFR5cGUgPT09IHZpZXdFdmVudHMuVmVydGljYWxSZXZlYWxUeXBlLkNlbnRlciB8fCB2ZXJ0aWNhbFR5cGUgPT09IHZpZXdFdmVudHMuVmVydGljYWxSZXZlYWxUeXBlLkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KSB7XG5cdFx0XHRpZiAodmVydGljYWxUeXBlID09PSB2aWV3RXZlbnRzLlZlcnRpY2FsUmV2ZWFsVHlwZS5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydCAmJiB2aWV3cG9ydFN0YXJ0WSA8PSBib3hTdGFydFkgJiYgYm94RW5kWSA8PSB2aWV3cG9ydEVuZFkpIHtcblx0XHRcdFx0Ly8gQm94IGlzIGFscmVhZHkgaW4gdGhlIHZpZXdwb3J0Li4uIGRvIG5vdGhpbmdcblx0XHRcdFx0bmV3U2Nyb2xsVG9wID0gdmlld3BvcnRTdGFydFk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBCb3ggaXMgb3V0c2lkZSB0aGUgdmlld3BvcnQuLi4gY2VudGVyIGl0XG5cdFx0XHRcdGNvbnN0IGJveE1pZGRsZVkgPSAoYm94U3RhcnRZICsgYm94RW5kWSkgLyAyO1xuXHRcdFx0XHRuZXdTY3JvbGxUb3AgPSBNYXRoLm1heCgwLCBib3hNaWRkbGVZIC0gdmlld3BvcnRIZWlnaHQgLyAyKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bmV3U2Nyb2xsVG9wID0gdGhpcy5fY29tcHV0ZU1pbmltdW1TY3JvbGxpbmcodmlld3BvcnRTdGFydFksIHZpZXdwb3J0RW5kWSwgYm94U3RhcnRZLCBib3hFbmRZLCB2ZXJ0aWNhbFR5cGUgPT09IHZpZXdFdmVudHMuVmVydGljYWxSZXZlYWxUeXBlLlRvcCwgdmVydGljYWxUeXBlID09PSB2aWV3RXZlbnRzLlZlcnRpY2FsUmV2ZWFsVHlwZS5Cb3R0b20pO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXdTY3JvbGxUb3A7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlU2Nyb2xsTGVmdFRvUmV2ZWFsKGhvcml6b250YWxSZXZlYWxSZXF1ZXN0OiBIb3Jpem9udGFsUmV2ZWFsUmVxdWVzdCk6IHsgc2Nyb2xsTGVmdDogbnVtYmVyOyBtYXhIb3Jpem9udGFsT2Zmc2V0OiBudW1iZXI7IGhhc1JUTDogYm9vbGVhbiB9IHwgbnVsbCB7XG5cblx0XHRjb25zdCB2aWV3cG9ydCA9IHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRDdXJyZW50Vmlld3BvcnQoKTtcblx0XHRjb25zdCBsYXlvdXRJbmZvID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKTtcblx0XHRjb25zdCB2aWV3cG9ydFN0YXJ0WCA9IHZpZXdwb3J0LmxlZnQ7XG5cdFx0Y29uc3Qgdmlld3BvcnRFbmRYID0gdmlld3BvcnRTdGFydFggKyB2aWV3cG9ydC53aWR0aCAtIGxheW91dEluZm8udmVydGljYWxTY3JvbGxiYXJXaWR0aDtcblxuXHRcdGxldCBib3hTdGFydFggPSBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUjtcblx0XHRsZXQgYm94RW5kWCA9IDA7XG5cdFx0bGV0IGhhc1JUTCA9IGZhbHNlO1xuXHRcdGlmIChob3Jpem9udGFsUmV2ZWFsUmVxdWVzdC50eXBlID09PSAncmFuZ2UnKSB7XG5cdFx0XHRoYXNSVEwgPSB0aGlzLl9saW5lSXNSZW5kZXJlZFJUTChob3Jpem9udGFsUmV2ZWFsUmVxdWVzdC5saW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IHZpc2libGVSYW5nZXMgPSB0aGlzLl92aXNpYmxlUmFuZ2VzRm9yTGluZVJhbmdlKGhvcml6b250YWxSZXZlYWxSZXF1ZXN0LmxpbmVOdW1iZXIsIGhvcml6b250YWxSZXZlYWxSZXF1ZXN0LnN0YXJ0Q29sdW1uLCBob3Jpem9udGFsUmV2ZWFsUmVxdWVzdC5lbmRDb2x1bW4pO1xuXHRcdFx0aWYgKCF2aXNpYmxlUmFuZ2VzKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCB2aXNpYmxlUmFuZ2Ugb2YgdmlzaWJsZVJhbmdlcy5yYW5nZXMpIHtcblx0XHRcdFx0Ym94U3RhcnRYID0gTWF0aC5taW4oYm94U3RhcnRYLCBNYXRoLnJvdW5kKHZpc2libGVSYW5nZS5sZWZ0KSk7XG5cdFx0XHRcdGJveEVuZFggPSBNYXRoLm1heChib3hFbmRYLCBNYXRoLnJvdW5kKHZpc2libGVSYW5nZS5sZWZ0ICsgdmlzaWJsZVJhbmdlLndpZHRoKSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIGhvcml6b250YWxSZXZlYWxSZXF1ZXN0LnNlbGVjdGlvbnMpIHtcblx0XHRcdFx0aWYgKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgIT09IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdmlzaWJsZVJhbmdlcyA9IHRoaXMuX3Zpc2libGVSYW5nZXNGb3JMaW5lUmFuZ2Uoc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciwgc2VsZWN0aW9uLnN0YXJ0Q29sdW1uLCBzZWxlY3Rpb24uZW5kQ29sdW1uKTtcblx0XHRcdFx0aGFzUlRMIHx8PSB0aGlzLl9saW5lSXNSZW5kZXJlZFJUTChzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0aWYgKCF2aXNpYmxlUmFuZ2VzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCB2aXNpYmxlUmFuZ2Ugb2YgdmlzaWJsZVJhbmdlcy5yYW5nZXMpIHtcblx0XHRcdFx0XHRib3hTdGFydFggPSBNYXRoLm1pbihib3hTdGFydFgsIE1hdGgucm91bmQodmlzaWJsZVJhbmdlLmxlZnQpKTtcblx0XHRcdFx0XHRib3hFbmRYID0gTWF0aC5tYXgoYm94RW5kWCwgTWF0aC5yb3VuZCh2aXNpYmxlUmFuZ2UubGVmdCArIHZpc2libGVSYW5nZS53aWR0aCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFob3Jpem9udGFsUmV2ZWFsUmVxdWVzdC5taW5pbWFsUmV2ZWFsKSB7XG5cdFx0XHRib3hTdGFydFggPSBNYXRoLm1heCgwLCBib3hTdGFydFggLSBWaWV3TGluZXMuSE9SSVpPTlRBTF9FWFRSQV9QWCk7XG5cdFx0XHRib3hFbmRYICs9IHRoaXMuX3JldmVhbEhvcml6b250YWxSaWdodFBhZGRpbmc7XG5cdFx0fVxuXG5cdFx0aWYgKGhvcml6b250YWxSZXZlYWxSZXF1ZXN0LnR5cGUgPT09ICdzZWxlY3Rpb25zJyAmJiBib3hFbmRYIC0gYm94U3RhcnRYID4gdmlld3BvcnQud2lkdGgpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld1Njcm9sbExlZnQgPSB0aGlzLl9jb21wdXRlTWluaW11bVNjcm9sbGluZyh2aWV3cG9ydFN0YXJ0WCwgdmlld3BvcnRFbmRYLCBib3hTdGFydFgsIGJveEVuZFgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzY3JvbGxMZWZ0OiBuZXdTY3JvbGxMZWZ0LFxuXHRcdFx0bWF4SG9yaXpvbnRhbE9mZnNldDogYm94RW5kWCxcblx0XHRcdGhhc1JUTFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlTWluaW11bVNjcm9sbGluZyh2aWV3cG9ydFN0YXJ0OiBudW1iZXIsIHZpZXdwb3J0RW5kOiBudW1iZXIsIGJveFN0YXJ0OiBudW1iZXIsIGJveEVuZDogbnVtYmVyLCByZXZlYWxBdFN0YXJ0PzogYm9vbGVhbiwgcmV2ZWFsQXRFbmQ/OiBib29sZWFuKTogbnVtYmVyIHtcblx0XHR2aWV3cG9ydFN0YXJ0ID0gdmlld3BvcnRTdGFydCB8IDA7XG5cdFx0dmlld3BvcnRFbmQgPSB2aWV3cG9ydEVuZCB8IDA7XG5cdFx0Ym94U3RhcnQgPSBib3hTdGFydCB8IDA7XG5cdFx0Ym94RW5kID0gYm94RW5kIHwgMDtcblx0XHRyZXZlYWxBdFN0YXJ0ID0gISFyZXZlYWxBdFN0YXJ0O1xuXHRcdHJldmVhbEF0RW5kID0gISFyZXZlYWxBdEVuZDtcblxuXHRcdGNvbnN0IHZpZXdwb3J0TGVuZ3RoID0gdmlld3BvcnRFbmQgLSB2aWV3cG9ydFN0YXJ0O1xuXHRcdGNvbnN0IGJveExlbmd0aCA9IGJveEVuZCAtIGJveFN0YXJ0O1xuXG5cdFx0aWYgKGJveExlbmd0aCA8IHZpZXdwb3J0TGVuZ3RoKSB7XG5cdFx0XHQvLyBUaGUgYm94IHdvdWxkIGZpdCBpbiB0aGUgdmlld3BvcnRcblxuXHRcdFx0aWYgKHJldmVhbEF0U3RhcnQpIHtcblx0XHRcdFx0cmV0dXJuIGJveFN0YXJ0O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmV2ZWFsQXRFbmQpIHtcblx0XHRcdFx0cmV0dXJuIE1hdGgubWF4KDAsIGJveEVuZCAtIHZpZXdwb3J0TGVuZ3RoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGJveFN0YXJ0IDwgdmlld3BvcnRTdGFydCkge1xuXHRcdFx0XHQvLyBUaGUgYm94IGlzIGFib3ZlIHRoZSB2aWV3cG9ydFxuXHRcdFx0XHRyZXR1cm4gYm94U3RhcnQ7XG5cdFx0XHR9IGVsc2UgaWYgKGJveEVuZCA+IHZpZXdwb3J0RW5kKSB7XG5cdFx0XHRcdC8vIFRoZSBib3ggaXMgYmVsb3cgdGhlIHZpZXdwb3J0XG5cdFx0XHRcdHJldHVybiBNYXRoLm1heCgwLCBib3hFbmQgLSB2aWV3cG9ydExlbmd0aCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFRoZSBib3ggd291bGQgbm90IGZpdCBpbiB0aGUgdmlld3BvcnRcblx0XHRcdC8vIFJldmVhbCB0aGUgYmVnaW5uaW5nIG9mIHRoZSBib3hcblx0XHRcdHJldHVybiBib3hTdGFydDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdmlld3BvcnRTdGFydDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyx3QkFBd0I7QUFDakMsWUFBWSxjQUFjO0FBQzFCLFNBQVMsaUJBQWlCO0FBQzFCLE9BQU87QUFDUCxTQUFTLHFCQUFx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
