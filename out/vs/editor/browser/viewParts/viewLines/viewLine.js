import * as browser from "../../../../base/browser/browser.js";
import { createFastDomNode } from "../../../../base/browser/fastDomNode.js";
import * as platform from "../../../../base/common/platform.js";
import { RangeUtil } from "./rangeUtil.js";
import { FloatHorizontalRange, VisibleRanges } from "../../view/renderingContext.js";
import { LineDecoration } from "../../../common/viewLayout/lineDecorations.js";
import { ForeignElementType, RenderLineInput, renderViewLine, DomPosition, RenderWhitespace } from "../../../common/viewLayout/viewLineRenderer.js";
import { isHighContrast } from "../../../../platform/theme/common/theme.js";
import { EditorFontLigatures } from "../../../common/config/editorOptions.js";
import { OffsetRange } from "../../../common/core/ranges/offsetRange.js";
import { InlineDecorationType } from "../../../common/viewModel/inlineDecorations.js";
import { TextDirection } from "../../../common/model.js";
const canUseFastRenderedViewLine = (function() {
  if (platform.isNative) {
    return true;
  }
  if (platform.isLinux || browser.isFirefox || browser.isSafari) {
    return false;
  }
  return true;
})();
let monospaceAssumptionsAreValid = true;
const _ViewLine = class _ViewLine {
  constructor(_viewGpuContext, options) {
    this._viewGpuContext = _viewGpuContext;
    this._options = options;
    this._isMaybeInvalid = true;
    this._renderedViewLine = null;
  }
  // --- begin IVisibleLineData
  getDomNode() {
    if (this._renderedViewLine && this._renderedViewLine.domNode) {
      return this._renderedViewLine.domNode.domNode;
    }
    return null;
  }
  setDomNode(domNode) {
    if (this._renderedViewLine) {
      this._renderedViewLine.domNode = createFastDomNode(domNode);
    } else {
      throw new Error("I have no rendered view line to set the dom node to...");
    }
  }
  onContentChanged() {
    this._isMaybeInvalid = true;
  }
  onTokensChanged() {
    this._isMaybeInvalid = true;
  }
  onDecorationsChanged() {
    this._isMaybeInvalid = true;
  }
  onOptionsChanged(newOptions) {
    this._isMaybeInvalid = true;
    this._options = newOptions;
  }
  onSelectionChanged() {
    if (isHighContrast(this._options.themeType) || this._renderedViewLine?.input.renderWhitespace === RenderWhitespace.Selection) {
      this._isMaybeInvalid = true;
      return true;
    }
    return false;
  }
  renderLine(lineNumber, deltaTop, lineHeight, viewportData, sb) {
    if (this._options.useGpu && this._viewGpuContext?.canRender(this._options, viewportData, lineNumber)) {
      this._renderedViewLine?.domNode?.domNode.remove();
      this._renderedViewLine = null;
      return false;
    }
    if (this._isMaybeInvalid === false) {
      return false;
    }
    this._isMaybeInvalid = false;
    const lineData = viewportData.getViewLineRenderingData(lineNumber);
    const options = this._options;
    const actualInlineDecorations = LineDecoration.filter(lineData.inlineDecorations, lineNumber, lineData.minColumn, lineData.maxColumn);
    const renderWhitespace = options.experimentalWhitespaceRendering === "off" ? options.renderWhitespace : "none";
    const allowFastRendering = !lineData.hasVariableFonts;
    let selectionsOnLine = null;
    if (isHighContrast(options.themeType) || renderWhitespace === "selection") {
      const selections = viewportData.selections;
      for (const selection of selections) {
        if (selection.endLineNumber < lineNumber || selection.startLineNumber > lineNumber) {
          continue;
        }
        const startColumn = selection.startLineNumber === lineNumber ? selection.startColumn : lineData.minColumn;
        const endColumn = selection.endLineNumber === lineNumber ? selection.endColumn : lineData.maxColumn;
        if (startColumn < endColumn) {
          if (isHighContrast(options.themeType)) {
            actualInlineDecorations.push(new LineDecoration(startColumn, endColumn, "inline-selected-text", InlineDecorationType.Regular));
          }
          if (renderWhitespace === "selection") {
            if (!selectionsOnLine) {
              selectionsOnLine = [];
            }
            selectionsOnLine.push(new OffsetRange(startColumn - 1, endColumn - 1));
          }
        }
      }
    }
    const renderLineInput = new RenderLineInput(
      options.useMonospaceOptimizations,
      options.canUseHalfwidthRightwardsArrow,
      lineData.content,
      lineData.continuesWithWrappedLine,
      lineData.isBasicASCII,
      lineData.containsRTL,
      lineData.minColumn - 1,
      lineData.tokens,
      actualInlineDecorations,
      lineData.tabSize,
      lineData.startVisibleColumn,
      options.spaceWidth,
      options.middotWidth,
      options.wsmiddotWidth,
      options.stopRenderingLineAfter,
      renderWhitespace,
      options.renderControlCharacters,
      options.fontLigatures !== EditorFontLigatures.OFF,
      selectionsOnLine,
      lineData.textDirection,
      options.verticalScrollbarSize
    );
    if (this._renderedViewLine && this._renderedViewLine.input.equals(renderLineInput)) {
      return false;
    }
    sb.appendString("<div ");
    if (lineData.textDirection === TextDirection.RTL) {
      sb.appendString('dir="rtl" ');
    } else if (lineData.containsRTL) {
      sb.appendString('dir="ltr" ');
    }
    sb.appendString('style="top:');
    sb.appendString(String(deltaTop));
    sb.appendString("px;height:");
    sb.appendString(String(lineHeight));
    sb.appendString("px;line-height:");
    sb.appendString(String(lineHeight));
    if (lineData.textDirection === TextDirection.RTL) {
      sb.appendString("px;padding-right:");
      sb.appendString(String(options.verticalScrollbarSize));
    }
    sb.appendString('px;" class="');
    sb.appendString(_ViewLine.CLASS_NAME);
    sb.appendString('">');
    const output = renderViewLine(renderLineInput, sb);
    sb.appendString("</div>");
    let renderedViewLine = null;
    if (allowFastRendering && monospaceAssumptionsAreValid && canUseFastRenderedViewLine && lineData.isBasicASCII && renderLineInput.isLTR && options.useMonospaceOptimizations && output.containsForeignElements === ForeignElementType.None) {
      renderedViewLine = new FastRenderedViewLine(
        this._renderedViewLine ? this._renderedViewLine.domNode : null,
        renderLineInput,
        output.characterMapping
      );
    }
    if (!renderedViewLine) {
      renderedViewLine = createRenderedLine(
        this._renderedViewLine ? this._renderedViewLine.domNode : null,
        renderLineInput,
        output.characterMapping,
        output.containsForeignElements
      );
    }
    this._renderedViewLine = renderedViewLine;
    return true;
  }
  layoutLine(lineNumber, deltaTop, lineHeight) {
    if (this._renderedViewLine && this._renderedViewLine.domNode) {
      this._renderedViewLine.domNode.setTop(deltaTop);
      this._renderedViewLine.domNode.setHeight(lineHeight);
      this._renderedViewLine.domNode.setLineHeight(lineHeight);
    }
  }
  // --- end IVisibleLineData
  isRenderedRTL() {
    if (!this._renderedViewLine) {
      return false;
    }
    return this._renderedViewLine.input.textDirection === TextDirection.RTL;
  }
  getWidth(context) {
    if (!this._renderedViewLine) {
      return 0;
    }
    return this._renderedViewLine.getWidth(context);
  }
  getWidthIsFast() {
    if (!this._renderedViewLine) {
      return true;
    }
    return this._renderedViewLine.getWidthIsFast();
  }
  needsMonospaceFontCheck() {
    if (!this._renderedViewLine) {
      return false;
    }
    return this._renderedViewLine instanceof FastRenderedViewLine;
  }
  monospaceAssumptionsAreValid() {
    if (!this._renderedViewLine) {
      return monospaceAssumptionsAreValid;
    }
    if (this._renderedViewLine instanceof FastRenderedViewLine) {
      return this._renderedViewLine.monospaceAssumptionsAreValid();
    }
    return monospaceAssumptionsAreValid;
  }
  onMonospaceAssumptionsInvalidated() {
    if (this._renderedViewLine && this._renderedViewLine instanceof FastRenderedViewLine) {
      this._renderedViewLine = this._renderedViewLine.toSlowRenderedLine();
    }
  }
  getVisibleRangesForRange(lineNumber, startColumn, endColumn, context) {
    if (!this._renderedViewLine) {
      return null;
    }
    startColumn = Math.min(this._renderedViewLine.input.lineContent.length + 1, Math.max(1, startColumn));
    endColumn = Math.min(this._renderedViewLine.input.lineContent.length + 1, Math.max(1, endColumn));
    const stopRenderingLineAfter = this._renderedViewLine.input.stopRenderingLineAfter;
    if (stopRenderingLineAfter !== -1 && startColumn > stopRenderingLineAfter + 1 && endColumn > stopRenderingLineAfter + 1) {
      return new VisibleRanges(true, [new FloatHorizontalRange(this.getWidth(context), 0)]);
    }
    if (stopRenderingLineAfter !== -1 && startColumn > stopRenderingLineAfter + 1) {
      startColumn = stopRenderingLineAfter + 1;
    }
    if (stopRenderingLineAfter !== -1 && endColumn > stopRenderingLineAfter + 1) {
      endColumn = stopRenderingLineAfter + 1;
    }
    const horizontalRanges = this._renderedViewLine.getVisibleRangesForRange(lineNumber, startColumn, endColumn, context);
    if (horizontalRanges && horizontalRanges.length > 0) {
      return new VisibleRanges(false, horizontalRanges);
    }
    return null;
  }
  getColumnOfNodeOffset(spanNode, offset) {
    if (!this._renderedViewLine) {
      return 1;
    }
    return this._renderedViewLine.getColumnOfNodeOffset(spanNode, offset);
  }
  resetCachedWidth() {
    this._renderedViewLine?.resetCachedWidth();
  }
};
_ViewLine.CLASS_NAME = "view-line";
let ViewLine = _ViewLine;
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["MaxMonospaceDistance"] = 300] = "MaxMonospaceDistance";
  return Constants2;
})(Constants || {});
class FastRenderedViewLine {
  constructor(domNode, renderLineInput, characterMapping) {
    this._cachedWidth = -1;
    this.domNode = domNode;
    this.input = renderLineInput;
    const keyColumnCount = Math.floor(renderLineInput.lineContent.length / 300 /* MaxMonospaceDistance */);
    if (keyColumnCount > 0) {
      this._keyColumnPixelOffsetCache = new Float32Array(keyColumnCount);
      for (let i = 0; i < keyColumnCount; i++) {
        this._keyColumnPixelOffsetCache[i] = -1;
      }
    } else {
      this._keyColumnPixelOffsetCache = null;
    }
    this._characterMapping = characterMapping;
    this._charWidth = renderLineInput.spaceWidth;
  }
  getWidth(context) {
    if (!this.domNode || this.input.lineContent.length < 300 /* MaxMonospaceDistance */) {
      const horizontalOffset = this._characterMapping.getHorizontalOffset(this._characterMapping.length);
      return Math.round(this._charWidth * horizontalOffset);
    }
    if (this._cachedWidth === -1) {
      this._cachedWidth = this._getReadingTarget(this.domNode).offsetWidth;
      context?.markDidDomLayout();
    }
    return this._cachedWidth;
  }
  getWidthIsFast() {
    return this.input.lineContent.length < 300 /* MaxMonospaceDistance */ || this._cachedWidth !== -1;
  }
  resetCachedWidth() {
    this._cachedWidth = -1;
  }
  monospaceAssumptionsAreValid() {
    if (!this.domNode) {
      return monospaceAssumptionsAreValid;
    }
    if (this.input.lineContent.length < 300 /* MaxMonospaceDistance */) {
      const expectedWidth = this.getWidth(null);
      const actualWidth = this.domNode.domNode.firstChild.offsetWidth;
      if (Math.abs(expectedWidth - actualWidth) >= 2) {
        console.warn(`monospace assumptions have been violated, therefore disabling monospace optimizations!`);
        monospaceAssumptionsAreValid = false;
      }
    }
    return monospaceAssumptionsAreValid;
  }
  toSlowRenderedLine() {
    return createRenderedLine(this.domNode, this.input, this._characterMapping, ForeignElementType.None);
  }
  getVisibleRangesForRange(lineNumber, startColumn, endColumn, context) {
    const startPosition = this._getColumnPixelOffset(lineNumber, startColumn, context);
    const endPosition = this._getColumnPixelOffset(lineNumber, endColumn, context);
    return [new FloatHorizontalRange(startPosition, endPosition - startPosition)];
  }
  _getColumnPixelOffset(lineNumber, column, context) {
    if (column <= 300 /* MaxMonospaceDistance */) {
      const horizontalOffset2 = this._characterMapping.getHorizontalOffset(column);
      return this._charWidth * horizontalOffset2;
    }
    const keyColumnOrdinal = Math.floor((column - 1) / 300 /* MaxMonospaceDistance */) - 1;
    const keyColumn = (keyColumnOrdinal + 1) * 300 /* MaxMonospaceDistance */ + 1;
    let keyColumnPixelOffset = -1;
    if (this._keyColumnPixelOffsetCache) {
      keyColumnPixelOffset = this._keyColumnPixelOffsetCache[keyColumnOrdinal];
      if (keyColumnPixelOffset === -1) {
        keyColumnPixelOffset = this._actualReadPixelOffset(lineNumber, keyColumn, context);
        this._keyColumnPixelOffsetCache[keyColumnOrdinal] = keyColumnPixelOffset;
      }
    }
    if (keyColumnPixelOffset === -1) {
      const horizontalOffset2 = this._characterMapping.getHorizontalOffset(column);
      return this._charWidth * horizontalOffset2;
    }
    const keyColumnHorizontalOffset = this._characterMapping.getHorizontalOffset(keyColumn);
    const horizontalOffset = this._characterMapping.getHorizontalOffset(column);
    return keyColumnPixelOffset + this._charWidth * (horizontalOffset - keyColumnHorizontalOffset);
  }
  _getReadingTarget(myDomNode) {
    return myDomNode.domNode.firstChild;
  }
  _actualReadPixelOffset(lineNumber, column, context) {
    if (!this.domNode) {
      return -1;
    }
    const domPosition = this._characterMapping.getDomPosition(column);
    const r = RangeUtil.readHorizontalRanges(this._getReadingTarget(this.domNode), domPosition.partIndex, domPosition.charIndex, domPosition.partIndex, domPosition.charIndex, context);
    if (!r || r.length === 0) {
      return -1;
    }
    return r[0].left;
  }
  getColumnOfNodeOffset(spanNode, offset) {
    return getColumnOfNodeOffset(this._characterMapping, spanNode, offset);
  }
}
class RenderedViewLine {
  constructor(domNode, renderLineInput, characterMapping, containsForeignElements) {
    this.domNode = domNode;
    this.input = renderLineInput;
    this._characterMapping = characterMapping;
    this._isWhitespaceOnly = /^\s*$/.test(renderLineInput.lineContent);
    this._containsForeignElements = containsForeignElements;
    this._cachedWidth = -1;
    this._pixelOffsetCache = null;
    if (renderLineInput.isLTR) {
      this._pixelOffsetCache = new Float32Array(Math.max(2, this._characterMapping.length + 1));
      for (let column = 0, len = this._characterMapping.length; column <= len; column++) {
        this._pixelOffsetCache[column] = -1;
      }
    }
  }
  // --- Reading from the DOM methods
  _getReadingTarget(myDomNode) {
    return myDomNode.domNode.firstChild;
  }
  /**
   * Width of the line in pixels
   */
  getWidth(context) {
    if (!this.domNode) {
      return 0;
    }
    if (this._cachedWidth === -1) {
      this._cachedWidth = this._getReadingTarget(this.domNode).offsetWidth;
      context?.markDidDomLayout();
    }
    return this._cachedWidth;
  }
  getWidthIsFast() {
    if (this._cachedWidth === -1) {
      return false;
    }
    return true;
  }
  resetCachedWidth() {
    this._cachedWidth = -1;
    if (this._pixelOffsetCache !== null) {
      for (let column = 0, len = this._pixelOffsetCache.length; column < len; column++) {
        this._pixelOffsetCache[column] = -1;
      }
    }
  }
  /**
   * Visible ranges for a model range
   */
  getVisibleRangesForRange(lineNumber, startColumn, endColumn, context) {
    if (!this.domNode) {
      return null;
    }
    if (this._pixelOffsetCache !== null) {
      const startOffset = this._readPixelOffset(this.domNode, lineNumber, startColumn, context);
      if (startOffset === -1) {
        return null;
      }
      const endOffset = this._readPixelOffset(this.domNode, lineNumber, endColumn, context);
      if (endOffset === -1) {
        return null;
      }
      return [new FloatHorizontalRange(startOffset, endOffset - startOffset)];
    }
    return this._readVisibleRangesForRange(this.domNode, lineNumber, startColumn, endColumn, context);
  }
  _readVisibleRangesForRange(domNode, lineNumber, startColumn, endColumn, context) {
    if (startColumn === endColumn) {
      const pixelOffset = this._readPixelOffset(domNode, lineNumber, startColumn, context);
      if (pixelOffset === -1) {
        return null;
      } else {
        return [new FloatHorizontalRange(pixelOffset, 0)];
      }
    } else {
      return this._readRawVisibleRangesForRange(domNode, startColumn, endColumn, context);
    }
  }
  _readPixelOffset(domNode, lineNumber, column, context) {
    if (this.input.isLTR && this._characterMapping.length === 0) {
      if (this._containsForeignElements === ForeignElementType.None) {
        return 0;
      }
      if (this._containsForeignElements === ForeignElementType.After) {
        return 0;
      }
      if (this._containsForeignElements === ForeignElementType.Before) {
        return this.getWidth(context);
      }
      const readingTarget = this._getReadingTarget(domNode);
      if (readingTarget.firstChild) {
        context.markDidDomLayout();
        return readingTarget.firstChild.offsetWidth;
      } else {
        return 0;
      }
    }
    if (this._pixelOffsetCache !== null) {
      const cachedPixelOffset = this._pixelOffsetCache[column];
      if (cachedPixelOffset !== -1) {
        return cachedPixelOffset;
      }
      const result = this._actualReadPixelOffset(domNode, lineNumber, column, context);
      this._pixelOffsetCache[column] = result;
      return result;
    }
    return this._actualReadPixelOffset(domNode, lineNumber, column, context);
  }
  _actualReadPixelOffset(domNode, lineNumber, column, context) {
    if (this._characterMapping.length === 0) {
      const r2 = RangeUtil.readHorizontalRanges(this._getReadingTarget(domNode), 0, 0, 0, 0, context);
      if (!r2 || r2.length === 0) {
        return -1;
      }
      return r2[0].left;
    }
    if (this.input.isLTR && column === this._characterMapping.length && this._isWhitespaceOnly && this._containsForeignElements === ForeignElementType.None) {
      return this.getWidth(context);
    }
    const domPosition = this._characterMapping.getDomPosition(column);
    const r = RangeUtil.readHorizontalRanges(this._getReadingTarget(domNode), domPosition.partIndex, domPosition.charIndex, domPosition.partIndex, domPosition.charIndex, context);
    if (!r || r.length === 0) {
      return -1;
    }
    const result = r[0].left;
    if (this.input.isBasicASCII) {
      const horizontalOffset = this._characterMapping.getHorizontalOffset(column);
      const expectedResult = Math.round(this.input.spaceWidth * horizontalOffset);
      if (Math.abs(expectedResult - result) <= 1) {
        return expectedResult;
      }
    }
    return result;
  }
  _readRawVisibleRangesForRange(domNode, startColumn, endColumn, context) {
    if (this.input.isLTR && startColumn === 1 && endColumn === this._characterMapping.length) {
      return [new FloatHorizontalRange(0, this.getWidth(context))];
    }
    const startDomPosition = this._characterMapping.getDomPosition(startColumn);
    const endDomPosition = this._characterMapping.getDomPosition(endColumn);
    return RangeUtil.readHorizontalRanges(this._getReadingTarget(domNode), startDomPosition.partIndex, startDomPosition.charIndex, endDomPosition.partIndex, endDomPosition.charIndex, context);
  }
  /**
   * Returns the column for the text found at a specific offset inside a rendered dom node
   */
  getColumnOfNodeOffset(spanNode, offset) {
    return getColumnOfNodeOffset(this._characterMapping, spanNode, offset);
  }
}
class WebKitRenderedViewLine extends RenderedViewLine {
  _readVisibleRangesForRange(domNode, lineNumber, startColumn, endColumn, context) {
    const output = super._readVisibleRangesForRange(domNode, lineNumber, startColumn, endColumn, context);
    if (!output || output.length === 0 || startColumn === endColumn || startColumn === 1 && endColumn === this._characterMapping.length) {
      return output;
    }
    if (this.input.isLTR) {
      const endPixelOffset = this._readPixelOffset(domNode, lineNumber, endColumn, context);
      if (endPixelOffset !== -1) {
        const lastRange = output[output.length - 1];
        if (lastRange.left < endPixelOffset) {
          lastRange.width = endPixelOffset - lastRange.left;
        }
      }
    }
    return output;
  }
}
const createRenderedLine = (function() {
  if (browser.isWebKit) {
    return createWebKitRenderedLine;
  }
  return createNormalRenderedLine;
})();
function createWebKitRenderedLine(domNode, renderLineInput, characterMapping, containsForeignElements) {
  return new WebKitRenderedViewLine(domNode, renderLineInput, characterMapping, containsForeignElements);
}
function createNormalRenderedLine(domNode, renderLineInput, characterMapping, containsForeignElements) {
  return new RenderedViewLine(domNode, renderLineInput, characterMapping, containsForeignElements);
}
function getColumnOfNodeOffset(characterMapping, spanNode, offset) {
  const spanNodeTextContentLength = spanNode.textContent.length;
  let spanIndex = -1;
  while (spanNode) {
    spanNode = spanNode.previousSibling;
    spanIndex++;
  }
  return characterMapping.getColumn(new DomPosition(spanIndex, offset), spanNodeTextContentLength);
}
export {
  ViewLine,
  getColumnOfNodeOffset
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3ZpZXdQYXJ0cy92aWV3TGluZXMvdmlld0xpbmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBicm93c2VyIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9icm93c2VyLmpzJztcbmltcG9ydCB7IEZhc3REb21Ob2RlLCBjcmVhdGVGYXN0RG9tTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mYXN0RG9tTm9kZS5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJVmlzaWJsZUxpbmUgfSBmcm9tICcuLi8uLi92aWV3L3ZpZXdMYXllci5qcyc7XG5pbXBvcnQgeyBSYW5nZVV0aWwgfSBmcm9tICcuL3JhbmdlVXRpbC5qcyc7XG5pbXBvcnQgeyBTdHJpbmdCdWlsZGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc3RyaW5nQnVpbGRlci5qcyc7XG5pbXBvcnQgeyBGbG9hdEhvcml6b250YWxSYW5nZSwgVmlzaWJsZVJhbmdlcyB9IGZyb20gJy4uLy4uL3ZpZXcvcmVuZGVyaW5nQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBMaW5lRGVjb3JhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TGF5b3V0L2xpbmVEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGFyYWN0ZXJNYXBwaW5nLCBGb3JlaWduRWxlbWVudFR5cGUsIFJlbmRlckxpbmVJbnB1dCwgcmVuZGVyVmlld0xpbmUsIERvbVBvc2l0aW9uLCBSZW5kZXJXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdMYXlvdXQvdmlld0xpbmVSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBWaWV3cG9ydERhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld0xheW91dC92aWV3TGluZXNWaWV3cG9ydERhdGEuanMnO1xuaW1wb3J0IHsgaXNIaWdoQ29udHJhc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgRWRpdG9yRm9udExpZ2F0dXJlcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBEb21SZWFkaW5nQ29udGV4dCB9IGZyb20gJy4vZG9tUmVhZGluZ0NvbnRleHQuanMnO1xuaW1wb3J0IHR5cGUgeyBWaWV3TGluZU9wdGlvbnMgfSBmcm9tICcuL3ZpZXdMaW5lT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBWaWV3R3B1Q29udGV4dCB9IGZyb20gJy4uLy4uL2dwdS92aWV3R3B1Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVEZWNvcmF0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvaW5saW5lRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgVGV4dERpcmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5cbmNvbnN0IGNhblVzZUZhc3RSZW5kZXJlZFZpZXdMaW5lID0gKGZ1bmN0aW9uICgpIHtcblx0aWYgKHBsYXRmb3JtLmlzTmF0aXZlKSB7XG5cdFx0Ly8gSW4gVlNDb2RlIHdlIGtub3cgdmVyeSB3ZWxsIHdoZW4gdGhlIHpvb20gbGV2ZWwgY2hhbmdlc1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0aWYgKHBsYXRmb3JtLmlzTGludXggfHwgYnJvd3Nlci5pc0ZpcmVmb3ggfHwgYnJvd3Nlci5pc1NhZmFyaSkge1xuXHRcdC8vIE9uIExpbnV4LCBpdCBhcHBlYXJzIHRoYXQgem9vbWluZyBhZmZlY3RzIGNoYXIgd2lkdGhzIChpbiBwaXhlbHMpLCB3aGljaCBpcyB1bmV4cGVjdGVkLlxuXHRcdC8vIC0tXG5cdFx0Ly8gRXZlbiB0aG91Z2ggd2UgcmVhZCBjaGFyYWN0ZXIgd2lkdGhzIGNvcnJlY3RseSwgaGF2aW5nIHJlYWQgdGhlbSBhdCBhIHNwZWNpZmljIHpvb20gbGV2ZWxcblx0XHQvLyBkb2VzIG5vdCBtZWFuIHRoZXkgYXJlIHRoZSBzYW1lIGF0IHRoZSBjdXJyZW50IHpvb20gbGV2ZWwuXG5cdFx0Ly8gLS1cblx0XHQvLyBUaGlzIGNvdWxkIGJlIGltcHJvdmVkIGlmIHdlIGV2ZXIgZmlndXJlIG91dCBob3cgdG8gZ2V0IGFuIGV2ZW50IHdoZW4gYnJvd3NlcnMgem9vbSxcblx0XHQvLyBidXQgdW50aWwgdGhlbiB3ZSBoYXZlIHRvIHN0aWNrIHdpdGggcmVhZGluZyBjbGllbnQgcmVjdHMuXG5cdFx0Ly8gLS1cblx0XHQvLyBUaGUgc2FtZSBoYXMgYmVlbiBvYnNlcnZlZCB3aXRoIEZpcmVmb3ggb24gV2luZG93czdcblx0XHQvLyAtLVxuXHRcdC8vIFRoZSBzYW1lIGhhcyBiZWVuIG92ZXJzdmVkIHdpdGggU2FmYXJpXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59KSgpO1xuXG5sZXQgbW9ub3NwYWNlQXNzdW1wdGlvbnNBcmVWYWxpZCA9IHRydWU7XG5cbmV4cG9ydCBjbGFzcyBWaWV3TGluZSBpbXBsZW1lbnRzIElWaXNpYmxlTGluZSB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBDTEFTU19OQU1FID0gJ3ZpZXctbGluZSc7XG5cblx0cHJpdmF0ZSBfb3B0aW9uczogVmlld0xpbmVPcHRpb25zO1xuXHRwcml2YXRlIF9pc01heWJlSW52YWxpZDogYm9vbGVhbjtcblx0cHJpdmF0ZSBfcmVuZGVyZWRWaWV3TGluZTogSVJlbmRlcmVkVmlld0xpbmUgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdHcHVDb250ZXh0OiBWaWV3R3B1Q29udGV4dCB8IHVuZGVmaW5lZCwgb3B0aW9uczogVmlld0xpbmVPcHRpb25zKSB7XG5cdFx0dGhpcy5fb3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy5faXNNYXliZUludmFsaWQgPSB0cnVlO1xuXHRcdHRoaXMuX3JlbmRlcmVkVmlld0xpbmUgPSBudWxsO1xuXHR9XG5cblx0Ly8gLS0tIGJlZ2luIElWaXNpYmxlTGluZURhdGFcblxuXHRwdWJsaWMgZ2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB8IG51bGwge1xuXHRcdGlmICh0aGlzLl9yZW5kZXJlZFZpZXdMaW5lICYmIHRoaXMuX3JlbmRlcmVkVmlld0xpbmUuZG9tTm9kZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkVmlld0xpbmUuZG9tTm9kZS5kb21Ob2RlO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXHRwdWJsaWMgc2V0RG9tTm9kZShkb21Ob2RlOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9yZW5kZXJlZFZpZXdMaW5lKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJlZFZpZXdMaW5lLmRvbU5vZGUgPSBjcmVhdGVGYXN0RG9tTm9kZShkb21Ob2RlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJIGhhdmUgbm8gcmVuZGVyZWQgdmlldyBsaW5lIHRvIHNldCB0aGUgZG9tIG5vZGUgdG8uLi4nKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb25Db250ZW50Q2hhbmdlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc01heWJlSW52YWxpZCA9IHRydWU7XG5cdH1cblx0cHVibGljIG9uVG9rZW5zQ2hhbmdlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc01heWJlSW52YWxpZCA9IHRydWU7XG5cdH1cblx0cHVibGljIG9uRGVjb3JhdGlvbnNDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzTWF5YmVJbnZhbGlkID0gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb25PcHRpb25zQ2hhbmdlZChuZXdPcHRpb25zOiBWaWV3TGluZU9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLl9pc01heWJlSW52YWxpZCA9IHRydWU7XG5cdFx0dGhpcy5fb3B0aW9ucyA9IG5ld09wdGlvbnM7XG5cdH1cblx0cHVibGljIG9uU2VsZWN0aW9uQ2hhbmdlZCgpOiBib29sZWFuIHtcblx0XHRpZiAoaXNIaWdoQ29udHJhc3QodGhpcy5fb3B0aW9ucy50aGVtZVR5cGUpIHx8IHRoaXMuX3JlbmRlcmVkVmlld0xpbmU/LmlucHV0LnJlbmRlcldoaXRlc3BhY2UgPT09IFJlbmRlcldoaXRlc3BhY2UuU2VsZWN0aW9uKSB7XG5cdFx0XHR0aGlzLl9pc01heWJlSW52YWxpZCA9IHRydWU7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHJlbmRlckxpbmUobGluZU51bWJlcjogbnVtYmVyLCBkZWx0YVRvcDogbnVtYmVyLCBsaW5lSGVpZ2h0OiBudW1iZXIsIHZpZXdwb3J0RGF0YTogVmlld3BvcnREYXRhLCBzYjogU3RyaW5nQnVpbGRlcik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9vcHRpb25zLnVzZUdwdSAmJiB0aGlzLl92aWV3R3B1Q29udGV4dD8uY2FuUmVuZGVyKHRoaXMuX29wdGlvbnMsIHZpZXdwb3J0RGF0YSwgbGluZU51bWJlcikpIHtcblx0XHRcdHRoaXMuX3JlbmRlcmVkVmlld0xpbmU/LmRvbU5vZGU/LmRvbU5vZGUucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLl9yZW5kZXJlZFZpZXdMaW5lID0gbnVsbDtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5faXNNYXliZUludmFsaWQgPT09IGZhbHNlKSB7XG5cdFx0XHQvLyBpdCBhcHBlYXJzIHRoYXQgbm90aGluZyByZWxldmFudCBoYXMgY2hhbmdlZFxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX2lzTWF5YmVJbnZhbGlkID0gZmFsc2U7XG5cblx0XHRjb25zdCBsaW5lRGF0YSA9IHZpZXdwb3J0RGF0YS5nZXRWaWV3TGluZVJlbmRlcmluZ0RhdGEobGluZU51bWJlcik7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX29wdGlvbnM7XG5cdFx0Y29uc3QgYWN0dWFsSW5saW5lRGVjb3JhdGlvbnMgPSBMaW5lRGVjb3JhdGlvbi5maWx0ZXIobGluZURhdGEuaW5saW5lRGVjb3JhdGlvbnMsIGxpbmVOdW1iZXIsIGxpbmVEYXRhLm1pbkNvbHVtbiwgbGluZURhdGEubWF4Q29sdW1uKTtcblx0XHRjb25zdCByZW5kZXJXaGl0ZXNwYWNlID0gb3B0aW9ucy5leHBlcmltZW50YWxXaGl0ZXNwYWNlUmVuZGVyaW5nID09PSAnb2ZmJyA/IG9wdGlvbnMucmVuZGVyV2hpdGVzcGFjZSA6ICdub25lJztcblx0XHRjb25zdCBhbGxvd0Zhc3RSZW5kZXJpbmcgPSAhbGluZURhdGEuaGFzVmFyaWFibGVGb250cztcblxuXHRcdC8vIE9ubHkgc2VuZCBzZWxlY3Rpb24gaW5mb3JtYXRpb24gd2hlbiBuZWVkZWQgZm9yIHJlbmRlcmluZyB3aGl0ZXNwYWNlXG5cdFx0bGV0IHNlbGVjdGlvbnNPbkxpbmU6IE9mZnNldFJhbmdlW10gfCBudWxsID0gbnVsbDtcblx0XHRpZiAoaXNIaWdoQ29udHJhc3Qob3B0aW9ucy50aGVtZVR5cGUpIHx8IHJlbmRlcldoaXRlc3BhY2UgPT09ICdzZWxlY3Rpb24nKSB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb25zID0gdmlld3BvcnREYXRhLnNlbGVjdGlvbnM7XG5cdFx0XHRmb3IgKGNvbnN0IHNlbGVjdGlvbiBvZiBzZWxlY3Rpb25zKSB7XG5cblx0XHRcdFx0aWYgKHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyIDwgbGluZU51bWJlciB8fCBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyID4gbGluZU51bWJlcikge1xuXHRcdFx0XHRcdC8vIFNlbGVjdGlvbiBkb2VzIG5vdCBpbnRlcnNlY3QgbGluZVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc3RhcnRDb2x1bW4gPSAoc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciA9PT0gbGluZU51bWJlciA/IHNlbGVjdGlvbi5zdGFydENvbHVtbiA6IGxpbmVEYXRhLm1pbkNvbHVtbik7XG5cdFx0XHRcdGNvbnN0IGVuZENvbHVtbiA9IChzZWxlY3Rpb24uZW5kTGluZU51bWJlciA9PT0gbGluZU51bWJlciA/IHNlbGVjdGlvbi5lbmRDb2x1bW4gOiBsaW5lRGF0YS5tYXhDb2x1bW4pO1xuXG5cdFx0XHRcdGlmIChzdGFydENvbHVtbiA8IGVuZENvbHVtbikge1xuXHRcdFx0XHRcdGlmIChpc0hpZ2hDb250cmFzdChvcHRpb25zLnRoZW1lVHlwZSkpIHtcblx0XHRcdFx0XHRcdGFjdHVhbElubGluZURlY29yYXRpb25zLnB1c2gobmV3IExpbmVEZWNvcmF0aW9uKHN0YXJ0Q29sdW1uLCBlbmRDb2x1bW4sICdpbmxpbmUtc2VsZWN0ZWQtdGV4dCcsIElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXIpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHJlbmRlcldoaXRlc3BhY2UgPT09ICdzZWxlY3Rpb24nKSB7XG5cdFx0XHRcdFx0XHRpZiAoIXNlbGVjdGlvbnNPbkxpbmUpIHtcblx0XHRcdFx0XHRcdFx0c2VsZWN0aW9uc09uTGluZSA9IFtdO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRzZWxlY3Rpb25zT25MaW5lLnB1c2gobmV3IE9mZnNldFJhbmdlKHN0YXJ0Q29sdW1uIC0gMSwgZW5kQ29sdW1uIC0gMSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlbmRlckxpbmVJbnB1dCA9IG5ldyBSZW5kZXJMaW5lSW5wdXQoXG5cdFx0XHRvcHRpb25zLnVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnMsXG5cdFx0XHRvcHRpb25zLmNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdyxcblx0XHRcdGxpbmVEYXRhLmNvbnRlbnQsXG5cdFx0XHRsaW5lRGF0YS5jb250aW51ZXNXaXRoV3JhcHBlZExpbmUsXG5cdFx0XHRsaW5lRGF0YS5pc0Jhc2ljQVNDSUksXG5cdFx0XHRsaW5lRGF0YS5jb250YWluc1JUTCxcblx0XHRcdGxpbmVEYXRhLm1pbkNvbHVtbiAtIDEsXG5cdFx0XHRsaW5lRGF0YS50b2tlbnMsXG5cdFx0XHRhY3R1YWxJbmxpbmVEZWNvcmF0aW9ucyxcblx0XHRcdGxpbmVEYXRhLnRhYlNpemUsXG5cdFx0XHRsaW5lRGF0YS5zdGFydFZpc2libGVDb2x1bW4sXG5cdFx0XHRvcHRpb25zLnNwYWNlV2lkdGgsXG5cdFx0XHRvcHRpb25zLm1pZGRvdFdpZHRoLFxuXHRcdFx0b3B0aW9ucy53c21pZGRvdFdpZHRoLFxuXHRcdFx0b3B0aW9ucy5zdG9wUmVuZGVyaW5nTGluZUFmdGVyLFxuXHRcdFx0cmVuZGVyV2hpdGVzcGFjZSxcblx0XHRcdG9wdGlvbnMucmVuZGVyQ29udHJvbENoYXJhY3RlcnMsXG5cdFx0XHRvcHRpb25zLmZvbnRMaWdhdHVyZXMgIT09IEVkaXRvckZvbnRMaWdhdHVyZXMuT0ZGLFxuXHRcdFx0c2VsZWN0aW9uc09uTGluZSxcblx0XHRcdGxpbmVEYXRhLnRleHREaXJlY3Rpb24sXG5cdFx0XHRvcHRpb25zLnZlcnRpY2FsU2Nyb2xsYmFyU2l6ZVxuXHRcdCk7XG5cblx0XHRpZiAodGhpcy5fcmVuZGVyZWRWaWV3TGluZSAmJiB0aGlzLl9yZW5kZXJlZFZpZXdMaW5lLmlucHV0LmVxdWFscyhyZW5kZXJMaW5lSW5wdXQpKSB7XG5cdFx0XHQvLyBubyBuZWVkIHRvIGRvIGFueXRoaW5nLCB3ZSBoYXZlIHRoZSBzYW1lIHJlbmRlciBpbnB1dFxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHNiLmFwcGVuZFN0cmluZygnPGRpdiAnKTtcblx0XHRpZiAobGluZURhdGEudGV4dERpcmVjdGlvbiA9PT0gVGV4dERpcmVjdGlvbi5SVEwpIHtcblx0XHRcdHNiLmFwcGVuZFN0cmluZygnZGlyPVwicnRsXCIgJyk7XG5cdFx0fSBlbHNlIGlmIChsaW5lRGF0YS5jb250YWluc1JUTCkge1xuXHRcdFx0c2IuYXBwZW5kU3RyaW5nKCdkaXI9XCJsdHJcIiAnKTtcblx0XHR9XG5cdFx0c2IuYXBwZW5kU3RyaW5nKCdzdHlsZT1cInRvcDonKTtcblx0XHRzYi5hcHBlbmRTdHJpbmcoU3RyaW5nKGRlbHRhVG9wKSk7XG5cdFx0c2IuYXBwZW5kU3RyaW5nKCdweDtoZWlnaHQ6Jyk7XG5cdFx0c2IuYXBwZW5kU3RyaW5nKFN0cmluZyhsaW5lSGVpZ2h0KSk7XG5cdFx0c2IuYXBwZW5kU3RyaW5nKCdweDtsaW5lLWhlaWdodDonKTtcblx0XHRzYi5hcHBlbmRTdHJpbmcoU3RyaW5nKGxpbmVIZWlnaHQpKTtcblx0XHRpZiAobGluZURhdGEudGV4dERpcmVjdGlvbiA9PT0gVGV4dERpcmVjdGlvbi5SVEwpIHtcblx0XHRcdHNiLmFwcGVuZFN0cmluZygncHg7cGFkZGluZy1yaWdodDonKTtcblx0XHRcdHNiLmFwcGVuZFN0cmluZyhTdHJpbmcob3B0aW9ucy52ZXJ0aWNhbFNjcm9sbGJhclNpemUpKTtcblx0XHR9XG5cdFx0c2IuYXBwZW5kU3RyaW5nKCdweDtcIiBjbGFzcz1cIicpO1xuXHRcdHNiLmFwcGVuZFN0cmluZyhWaWV3TGluZS5DTEFTU19OQU1FKTtcblx0XHRzYi5hcHBlbmRTdHJpbmcoJ1wiPicpO1xuXG5cdFx0Y29uc3Qgb3V0cHV0ID0gcmVuZGVyVmlld0xpbmUocmVuZGVyTGluZUlucHV0LCBzYik7XG5cblx0XHRzYi5hcHBlbmRTdHJpbmcoJzwvZGl2PicpO1xuXG5cdFx0bGV0IHJlbmRlcmVkVmlld0xpbmU6IElSZW5kZXJlZFZpZXdMaW5lIHwgbnVsbCA9IG51bGw7XG5cdFx0aWYgKFxuXHRcdFx0YWxsb3dGYXN0UmVuZGVyaW5nXG5cdFx0XHQmJiBtb25vc3BhY2VBc3N1bXB0aW9uc0FyZVZhbGlkXG5cdFx0XHQmJiBjYW5Vc2VGYXN0UmVuZGVyZWRWaWV3TGluZVxuXHRcdFx0JiYgbGluZURhdGEuaXNCYXNpY0FTQ0lJXG5cdFx0XHQmJiByZW5kZXJMaW5lSW5wdXQuaXNMVFJcblx0XHRcdCYmIG9wdGlvbnMudXNlTW9ub3NwYWNlT3B0aW1pemF0aW9uc1xuXHRcdFx0JiYgb3V0cHV0LmNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzID09PSBGb3JlaWduRWxlbWVudFR5cGUuTm9uZVxuXHRcdCkge1xuXHRcdFx0cmVuZGVyZWRWaWV3TGluZSA9IG5ldyBGYXN0UmVuZGVyZWRWaWV3TGluZShcblx0XHRcdFx0dGhpcy5fcmVuZGVyZWRWaWV3TGluZSA/IHRoaXMuX3JlbmRlcmVkVmlld0xpbmUuZG9tTm9kZSA6IG51bGwsXG5cdFx0XHRcdHJlbmRlckxpbmVJbnB1dCxcblx0XHRcdFx0b3V0cHV0LmNoYXJhY3Rlck1hcHBpbmdcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFyZW5kZXJlZFZpZXdMaW5lKSB7XG5cdFx0XHRyZW5kZXJlZFZpZXdMaW5lID0gY3JlYXRlUmVuZGVyZWRMaW5lKFxuXHRcdFx0XHR0aGlzLl9yZW5kZXJlZFZpZXdMaW5lID8gdGhpcy5fcmVuZGVyZWRWaWV3TGluZS5kb21Ob2RlIDogbnVsbCxcblx0XHRcdFx0cmVuZGVyTGluZUlucHV0LFxuXHRcdFx0XHRvdXRwdXQuY2hhcmFjdGVyTWFwcGluZyxcblx0XHRcdFx0b3V0cHV0LmNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlbmRlcmVkVmlld0xpbmUgPSByZW5kZXJlZFZpZXdMaW5lO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgbGF5b3V0TGluZShsaW5lTnVtYmVyOiBudW1iZXIsIGRlbHRhVG9wOiBudW1iZXIsIGxpbmVIZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9yZW5kZXJlZFZpZXdMaW5lICYmIHRoaXMuX3JlbmRlcmVkVmlld0xpbmUuZG9tTm9kZSkge1xuXHRcdFx0dGhpcy5fcmVuZGVyZWRWaWV3TGluZS5kb21Ob2RlLnNldFRvcChkZWx0YVRvcCk7XG5cdFx0XHR0aGlzLl9yZW5kZXJlZFZpZXdMaW5lLmRvbU5vZGUuc2V0SGVpZ2h0KGxpbmVIZWlnaHQpO1xuXHRcdFx0dGhpcy5fcmVuZGVyZWRWaWV3TGluZS5kb21Ob2RlLnNldExpbmVIZWlnaHQobGluZUhlaWdodCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIGVuZCBJVmlzaWJsZUxpbmVEYXRhXG5cblx0cHVibGljIGlzUmVuZGVyZWRSVEwoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9yZW5kZXJlZFZpZXdMaW5lKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlZFZpZXdMaW5lLmlucHV0LnRleHREaXJlY3Rpb24gPT09IFRleHREaXJlY3Rpb24uUlRMO1xuXHR9XG5cblx0cHVibGljIGdldFdpZHRoKGNvbnRleHQ6IERvbVJlYWRpbmdDb250ZXh0IHwgbnVsbCk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl9yZW5kZXJlZFZpZXdMaW5lKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkVmlld0xpbmUuZ2V0V2lkdGgoY29udGV4dCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0V2lkdGhJc0Zhc3QoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9yZW5kZXJlZFZpZXdMaW5lKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkVmlld0xpbmUuZ2V0V2lkdGhJc0Zhc3QoKTtcblx0fVxuXG5cdHB1YmxpYyBuZWVkc01vbm9zcGFjZUZvbnRDaGVjaygpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX3JlbmRlcmVkVmlld0xpbmUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuICh0aGlzLl9yZW5kZXJlZFZpZXdMaW5lIGluc3RhbmNlb2YgRmFzdFJlbmRlcmVkVmlld0xpbmUpO1xuXHR9XG5cblx0cHVibGljIG1vbm9zcGFjZUFzc3VtcHRpb25zQXJlVmFsaWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9yZW5kZXJlZFZpZXdMaW5lKSB7XG5cdFx0XHRyZXR1cm4gbW9ub3NwYWNlQXNzdW1wdGlvbnNBcmVWYWxpZDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3JlbmRlcmVkVmlld0xpbmUgaW5zdGFuY2VvZiBGYXN0UmVuZGVyZWRWaWV3TGluZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkVmlld0xpbmUubW9ub3NwYWNlQXNzdW1wdGlvbnNBcmVWYWxpZCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gbW9ub3NwYWNlQXNzdW1wdGlvbnNBcmVWYWxpZDtcblx0fVxuXG5cdHB1YmxpYyBvbk1vbm9zcGFjZUFzc3VtcHRpb25zSW52YWxpZGF0ZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3JlbmRlcmVkVmlld0xpbmUgJiYgdGhpcy5fcmVuZGVyZWRWaWV3TGluZSBpbnN0YW5jZW9mIEZhc3RSZW5kZXJlZFZpZXdMaW5lKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJlZFZpZXdMaW5lID0gdGhpcy5fcmVuZGVyZWRWaWV3TGluZS50b1Nsb3dSZW5kZXJlZExpbmUoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmlzaWJsZVJhbmdlc0ZvclJhbmdlKGxpbmVOdW1iZXI6IG51bWJlciwgc3RhcnRDb2x1bW46IG51bWJlciwgZW5kQ29sdW1uOiBudW1iZXIsIGNvbnRleHQ6IERvbVJlYWRpbmdDb250ZXh0KTogVmlzaWJsZVJhbmdlcyB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fcmVuZGVyZWRWaWV3TGluZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0c3RhcnRDb2x1bW4gPSBNYXRoLm1pbih0aGlzLl9yZW5kZXJlZFZpZXdMaW5lLmlucHV0LmxpbmVDb250ZW50Lmxlbmd0aCArIDEsIE1hdGgubWF4KDEsIHN0YXJ0Q29sdW1uKSk7XG5cdFx0ZW5kQ29sdW1uID0gTWF0aC5taW4odGhpcy5fcmVuZGVyZWRWaWV3TGluZS5pbnB1dC5saW5lQ29udGVudC5sZW5ndGggKyAxLCBNYXRoLm1heCgxLCBlbmRDb2x1bW4pKTtcblxuXHRcdGNvbnN0IHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIgPSB0aGlzLl9yZW5kZXJlZFZpZXdMaW5lLmlucHV0LnN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXI7XG5cblx0XHRpZiAoc3RvcFJlbmRlcmluZ0xpbmVBZnRlciAhPT0gLTEgJiYgc3RhcnRDb2x1bW4gPiBzdG9wUmVuZGVyaW5nTGluZUFmdGVyICsgMSAmJiBlbmRDb2x1bW4gPiBzdG9wUmVuZGVyaW5nTGluZUFmdGVyICsgMSkge1xuXHRcdFx0Ly8gVGhpcyByYW5nZSBpcyBvYnZpb3VzbHkgbm90IHZpc2libGVcblx0XHRcdHJldHVybiBuZXcgVmlzaWJsZVJhbmdlcyh0cnVlLCBbbmV3IEZsb2F0SG9yaXpvbnRhbFJhbmdlKHRoaXMuZ2V0V2lkdGgoY29udGV4dCksIDApXSk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIgIT09IC0xICYmIHN0YXJ0Q29sdW1uID4gc3RvcFJlbmRlcmluZ0xpbmVBZnRlciArIDEpIHtcblx0XHRcdHN0YXJ0Q29sdW1uID0gc3RvcFJlbmRlcmluZ0xpbmVBZnRlciArIDE7XG5cdFx0fVxuXG5cdFx0aWYgKHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIgIT09IC0xICYmIGVuZENvbHVtbiA+IHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIgKyAxKSB7XG5cdFx0XHRlbmRDb2x1bW4gPSBzdG9wUmVuZGVyaW5nTGluZUFmdGVyICsgMTtcblx0XHR9XG5cblx0XHRjb25zdCBob3Jpem9udGFsUmFuZ2VzID0gdGhpcy5fcmVuZGVyZWRWaWV3TGluZS5nZXRWaXNpYmxlUmFuZ2VzRm9yUmFuZ2UobGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGVuZENvbHVtbiwgY29udGV4dCk7XG5cdFx0aWYgKGhvcml6b250YWxSYW5nZXMgJiYgaG9yaXpvbnRhbFJhbmdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFZpc2libGVSYW5nZXMoZmFsc2UsIGhvcml6b250YWxSYW5nZXMpO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHVibGljIGdldENvbHVtbk9mTm9kZU9mZnNldChzcGFuTm9kZTogSFRNTEVsZW1lbnQsIG9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuX3JlbmRlcmVkVmlld0xpbmUpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZWRWaWV3TGluZS5nZXRDb2x1bW5PZk5vZGVPZmZzZXQoc3Bhbk5vZGUsIG9mZnNldCk7XG5cdH1cblxuXHRwdWJsaWMgcmVzZXRDYWNoZWRXaWR0aCgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZW5kZXJlZFZpZXdMaW5lPy5yZXNldENhY2hlZFdpZHRoKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElSZW5kZXJlZFZpZXdMaW5lIHtcblx0ZG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+IHwgbnVsbDtcblx0cmVhZG9ubHkgaW5wdXQ6IFJlbmRlckxpbmVJbnB1dDtcblx0Z2V0V2lkdGgoY29udGV4dDogRG9tUmVhZGluZ0NvbnRleHQgfCBudWxsKTogbnVtYmVyO1xuXHRnZXRXaWR0aElzRmFzdCgpOiBib29sZWFuO1xuXHRyZXNldENhY2hlZFdpZHRoKCk6IHZvaWQ7XG5cdGdldFZpc2libGVSYW5nZXNGb3JSYW5nZShsaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyLCBjb250ZXh0OiBEb21SZWFkaW5nQ29udGV4dCk6IEZsb2F0SG9yaXpvbnRhbFJhbmdlW10gfCBudWxsO1xuXHRnZXRDb2x1bW5PZk5vZGVPZmZzZXQoc3Bhbk5vZGU6IEhUTUxFbGVtZW50LCBvZmZzZXQ6IG51bWJlcik6IG51bWJlcjtcbn1cblxuY29uc3QgZW51bSBDb25zdGFudHMge1xuXHQvKipcblx0ICogSXQgc2VlbXMgdGhhdCByb3VuZGluZyBlcnJvcnMgb2NjdXIgd2l0aCBsb25nIGxpbmVzLCBzbyB0aGUgcHVyZWx5IG11bHRpcGxpY2F0aW9uIGJhc2VkXG5cdCAqIG1ldGhvZCBpcyBvbmx5IHZpYWJsZSBmb3Igc2hvcnQgbGluZXMuIEZvciBsb25nZXIgbGluZXMsIHdlIGxvb2sgdXAgdGhlIHJlYWwgcG9zaXRpb24gb2Zcblx0ICogZXZlcnkgMzAwdGggY2hhcmFjdGVyIGFuZCB1c2UgbXVsdGlwbGljYXRpb24gYmFzZWQgb24gdGhhdC5cblx0ICpcblx0ICogU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zMzE3OFxuXHQgKi9cblx0TWF4TW9ub3NwYWNlRGlzdGFuY2UgPSAzMDBcbn1cblxuLyoqXG4gKiBBIHJlbmRlcmVkIGxpbmUgd2hpY2ggaXMgZ3VhcmFudGVlZCB0byBjb250YWluIG9ubHkgcmVndWxhciBBU0NJSSBhbmQgaXMgcmVuZGVyZWQgd2l0aCBhIG1vbm9zcGFjZSBmb250LlxuICovXG5jbGFzcyBGYXN0UmVuZGVyZWRWaWV3TGluZSBpbXBsZW1lbnRzIElSZW5kZXJlZFZpZXdMaW5lIHtcblxuXHRwdWJsaWMgZG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+IHwgbnVsbDtcblx0cHVibGljIHJlYWRvbmx5IGlucHV0OiBSZW5kZXJMaW5lSW5wdXQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2hhcmFjdGVyTWFwcGluZzogQ2hhcmFjdGVyTWFwcGluZztcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhcldpZHRoOiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2tleUNvbHVtblBpeGVsT2Zmc2V0Q2FjaGU6IEZsb2F0MzJBcnJheSB8IG51bGw7XG5cdHByaXZhdGUgX2NhY2hlZFdpZHRoOiBudW1iZXIgPSAtMTtcblxuXHRjb25zdHJ1Y3Rvcihkb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4gfCBudWxsLCByZW5kZXJMaW5lSW5wdXQ6IFJlbmRlckxpbmVJbnB1dCwgY2hhcmFjdGVyTWFwcGluZzogQ2hhcmFjdGVyTWFwcGluZykge1xuXHRcdHRoaXMuZG9tTm9kZSA9IGRvbU5vZGU7XG5cdFx0dGhpcy5pbnB1dCA9IHJlbmRlckxpbmVJbnB1dDtcblx0XHRjb25zdCBrZXlDb2x1bW5Db3VudCA9IE1hdGguZmxvb3IocmVuZGVyTGluZUlucHV0LmxpbmVDb250ZW50Lmxlbmd0aCAvIENvbnN0YW50cy5NYXhNb25vc3BhY2VEaXN0YW5jZSk7XG5cdFx0aWYgKGtleUNvbHVtbkNvdW50ID4gMCkge1xuXHRcdFx0dGhpcy5fa2V5Q29sdW1uUGl4ZWxPZmZzZXRDYWNoZSA9IG5ldyBGbG9hdDMyQXJyYXkoa2V5Q29sdW1uQ291bnQpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBrZXlDb2x1bW5Db3VudDsgaSsrKSB7XG5cdFx0XHRcdHRoaXMuX2tleUNvbHVtblBpeGVsT2Zmc2V0Q2FjaGVbaV0gPSAtMTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fa2V5Q29sdW1uUGl4ZWxPZmZzZXRDYWNoZSA9IG51bGw7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY2hhcmFjdGVyTWFwcGluZyA9IGNoYXJhY3Rlck1hcHBpbmc7XG5cdFx0dGhpcy5fY2hhcldpZHRoID0gcmVuZGVyTGluZUlucHV0LnNwYWNlV2lkdGg7XG5cdH1cblxuXHRwdWJsaWMgZ2V0V2lkdGgoY29udGV4dDogRG9tUmVhZGluZ0NvbnRleHQgfCBudWxsKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuZG9tTm9kZSB8fCB0aGlzLmlucHV0LmxpbmVDb250ZW50Lmxlbmd0aCA8IENvbnN0YW50cy5NYXhNb25vc3BhY2VEaXN0YW5jZSkge1xuXHRcdFx0Y29uc3QgaG9yaXpvbnRhbE9mZnNldCA9IHRoaXMuX2NoYXJhY3Rlck1hcHBpbmcuZ2V0SG9yaXpvbnRhbE9mZnNldCh0aGlzLl9jaGFyYWN0ZXJNYXBwaW5nLmxlbmd0aCk7XG5cdFx0XHRyZXR1cm4gTWF0aC5yb3VuZCh0aGlzLl9jaGFyV2lkdGggKiBob3Jpem9udGFsT2Zmc2V0KTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NhY2hlZFdpZHRoID09PSAtMSkge1xuXHRcdFx0dGhpcy5fY2FjaGVkV2lkdGggPSB0aGlzLl9nZXRSZWFkaW5nVGFyZ2V0KHRoaXMuZG9tTm9kZSkub2Zmc2V0V2lkdGg7XG5cdFx0XHRjb250ZXh0Py5tYXJrRGlkRG9tTGF5b3V0KCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jYWNoZWRXaWR0aDtcblx0fVxuXG5cdHB1YmxpYyBnZXRXaWR0aElzRmFzdCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuaW5wdXQubGluZUNvbnRlbnQubGVuZ3RoIDwgQ29uc3RhbnRzLk1heE1vbm9zcGFjZURpc3RhbmNlKSB8fCB0aGlzLl9jYWNoZWRXaWR0aCAhPT0gLTE7XG5cdH1cblxuXHRwdWJsaWMgcmVzZXRDYWNoZWRXaWR0aCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jYWNoZWRXaWR0aCA9IC0xO1xuXHR9XG5cblx0cHVibGljIG1vbm9zcGFjZUFzc3VtcHRpb25zQXJlVmFsaWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmRvbU5vZGUpIHtcblx0XHRcdHJldHVybiBtb25vc3BhY2VBc3N1bXB0aW9uc0FyZVZhbGlkO1xuXHRcdH1cblx0XHRpZiAodGhpcy5pbnB1dC5saW5lQ29udGVudC5sZW5ndGggPCBDb25zdGFudHMuTWF4TW9ub3NwYWNlRGlzdGFuY2UpIHtcblx0XHRcdGNvbnN0IGV4cGVjdGVkV2lkdGggPSB0aGlzLmdldFdpZHRoKG51bGwpO1xuXHRcdFx0Y29uc3QgYWN0dWFsV2lkdGggPSAoPEhUTUxTcGFuRWxlbWVudD50aGlzLmRvbU5vZGUuZG9tTm9kZS5maXJzdENoaWxkKS5vZmZzZXRXaWR0aDtcblx0XHRcdGlmIChNYXRoLmFicyhleHBlY3RlZFdpZHRoIC0gYWN0dWFsV2lkdGgpID49IDIpIHtcblx0XHRcdFx0Ly8gbW9yZSB0aGFuIDJweCBvZmZcblx0XHRcdFx0Y29uc29sZS53YXJuKGBtb25vc3BhY2UgYXNzdW1wdGlvbnMgaGF2ZSBiZWVuIHZpb2xhdGVkLCB0aGVyZWZvcmUgZGlzYWJsaW5nIG1vbm9zcGFjZSBvcHRpbWl6YXRpb25zIWApO1xuXHRcdFx0XHRtb25vc3BhY2VBc3N1bXB0aW9uc0FyZVZhbGlkID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBtb25vc3BhY2VBc3N1bXB0aW9uc0FyZVZhbGlkO1xuXHR9XG5cblx0cHVibGljIHRvU2xvd1JlbmRlcmVkTGluZSgpOiBSZW5kZXJlZFZpZXdMaW5lIHtcblx0XHRyZXR1cm4gY3JlYXRlUmVuZGVyZWRMaW5lKHRoaXMuZG9tTm9kZSwgdGhpcy5pbnB1dCwgdGhpcy5fY2hhcmFjdGVyTWFwcGluZywgRm9yZWlnbkVsZW1lbnRUeXBlLk5vbmUpO1xuXHR9XG5cblx0cHVibGljIGdldFZpc2libGVSYW5nZXNGb3JSYW5nZShsaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyLCBjb250ZXh0OiBEb21SZWFkaW5nQ29udGV4dCk6IEZsb2F0SG9yaXpvbnRhbFJhbmdlW10gfCBudWxsIHtcblx0XHRjb25zdCBzdGFydFBvc2l0aW9uID0gdGhpcy5fZ2V0Q29sdW1uUGl4ZWxPZmZzZXQobGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGNvbnRleHQpO1xuXHRcdGNvbnN0IGVuZFBvc2l0aW9uID0gdGhpcy5fZ2V0Q29sdW1uUGl4ZWxPZmZzZXQobGluZU51bWJlciwgZW5kQ29sdW1uLCBjb250ZXh0KTtcblx0XHRyZXR1cm4gW25ldyBGbG9hdEhvcml6b250YWxSYW5nZShzdGFydFBvc2l0aW9uLCBlbmRQb3NpdGlvbiAtIHN0YXJ0UG9zaXRpb24pXTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENvbHVtblBpeGVsT2Zmc2V0KGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGNvbnRleHQ6IERvbVJlYWRpbmdDb250ZXh0KTogbnVtYmVyIHtcblx0XHRpZiAoY29sdW1uIDw9IENvbnN0YW50cy5NYXhNb25vc3BhY2VEaXN0YW5jZSkge1xuXHRcdFx0Y29uc3QgaG9yaXpvbnRhbE9mZnNldCA9IHRoaXMuX2NoYXJhY3Rlck1hcHBpbmcuZ2V0SG9yaXpvbnRhbE9mZnNldChjb2x1bW4pO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NoYXJXaWR0aCAqIGhvcml6b250YWxPZmZzZXQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2V5Q29sdW1uT3JkaW5hbCA9IE1hdGguZmxvb3IoKGNvbHVtbiAtIDEpIC8gQ29uc3RhbnRzLk1heE1vbm9zcGFjZURpc3RhbmNlKSAtIDE7XG5cdFx0Y29uc3Qga2V5Q29sdW1uID0gKGtleUNvbHVtbk9yZGluYWwgKyAxKSAqIENvbnN0YW50cy5NYXhNb25vc3BhY2VEaXN0YW5jZSArIDE7XG5cdFx0bGV0IGtleUNvbHVtblBpeGVsT2Zmc2V0ID0gLTE7XG5cdFx0aWYgKHRoaXMuX2tleUNvbHVtblBpeGVsT2Zmc2V0Q2FjaGUpIHtcblx0XHRcdGtleUNvbHVtblBpeGVsT2Zmc2V0ID0gdGhpcy5fa2V5Q29sdW1uUGl4ZWxPZmZzZXRDYWNoZVtrZXlDb2x1bW5PcmRpbmFsXTtcblx0XHRcdGlmIChrZXlDb2x1bW5QaXhlbE9mZnNldCA9PT0gLTEpIHtcblx0XHRcdFx0a2V5Q29sdW1uUGl4ZWxPZmZzZXQgPSB0aGlzLl9hY3R1YWxSZWFkUGl4ZWxPZmZzZXQobGluZU51bWJlciwga2V5Q29sdW1uLCBjb250ZXh0KTtcblx0XHRcdFx0dGhpcy5fa2V5Q29sdW1uUGl4ZWxPZmZzZXRDYWNoZVtrZXlDb2x1bW5PcmRpbmFsXSA9IGtleUNvbHVtblBpeGVsT2Zmc2V0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChrZXlDb2x1bW5QaXhlbE9mZnNldCA9PT0gLTEpIHtcblx0XHRcdC8vIENvdWxkIG5vdCByZWFkIGFjdHVhbCBrZXkgY29sdW1uIHBpeGVsIG9mZnNldFxuXHRcdFx0Y29uc3QgaG9yaXpvbnRhbE9mZnNldCA9IHRoaXMuX2NoYXJhY3Rlck1hcHBpbmcuZ2V0SG9yaXpvbnRhbE9mZnNldChjb2x1bW4pO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NoYXJXaWR0aCAqIGhvcml6b250YWxPZmZzZXQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2V5Q29sdW1uSG9yaXpvbnRhbE9mZnNldCA9IHRoaXMuX2NoYXJhY3Rlck1hcHBpbmcuZ2V0SG9yaXpvbnRhbE9mZnNldChrZXlDb2x1bW4pO1xuXHRcdGNvbnN0IGhvcml6b250YWxPZmZzZXQgPSB0aGlzLl9jaGFyYWN0ZXJNYXBwaW5nLmdldEhvcml6b250YWxPZmZzZXQoY29sdW1uKTtcblx0XHRyZXR1cm4ga2V5Q29sdW1uUGl4ZWxPZmZzZXQgKyB0aGlzLl9jaGFyV2lkdGggKiAoaG9yaXpvbnRhbE9mZnNldCAtIGtleUNvbHVtbkhvcml6b250YWxPZmZzZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UmVhZGluZ1RhcmdldChteURvbU5vZGU6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50Pik6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gPEhUTUxTcGFuRWxlbWVudD5teURvbU5vZGUuZG9tTm9kZS5maXJzdENoaWxkO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWN0dWFsUmVhZFBpeGVsT2Zmc2V0KGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGNvbnRleHQ6IERvbVJlYWRpbmdDb250ZXh0KTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuZG9tTm9kZSkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRjb25zdCBkb21Qb3NpdGlvbiA9IHRoaXMuX2NoYXJhY3Rlck1hcHBpbmcuZ2V0RG9tUG9zaXRpb24oY29sdW1uKTtcblx0XHRjb25zdCByID0gUmFuZ2VVdGlsLnJlYWRIb3Jpem9udGFsUmFuZ2VzKHRoaXMuX2dldFJlYWRpbmdUYXJnZXQodGhpcy5kb21Ob2RlKSwgZG9tUG9zaXRpb24ucGFydEluZGV4LCBkb21Qb3NpdGlvbi5jaGFySW5kZXgsIGRvbVBvc2l0aW9uLnBhcnRJbmRleCwgZG9tUG9zaXRpb24uY2hhckluZGV4LCBjb250ZXh0KTtcblx0XHRpZiAoIXIgfHwgci5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0cmV0dXJuIHJbMF0ubGVmdDtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb2x1bW5PZk5vZGVPZmZzZXQoc3Bhbk5vZGU6IEhUTUxFbGVtZW50LCBvZmZzZXQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIGdldENvbHVtbk9mTm9kZU9mZnNldCh0aGlzLl9jaGFyYWN0ZXJNYXBwaW5nLCBzcGFuTm9kZSwgb2Zmc2V0KTtcblx0fVxufVxuXG4vKipcbiAqIEV2ZXJ5IHRpbWUgd2UgcmVuZGVyIGEgbGluZSwgd2Ugc2F2ZSB3aGF0IHdlIGhhdmUgcmVuZGVyZWQgaW4gYW4gaW5zdGFuY2Ugb2YgdGhpcyBjbGFzcy5cbiAqL1xuY2xhc3MgUmVuZGVyZWRWaWV3TGluZSBpbXBsZW1lbnRzIElSZW5kZXJlZFZpZXdMaW5lIHtcblxuXHRwdWJsaWMgZG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+IHwgbnVsbDtcblx0cHVibGljIHJlYWRvbmx5IGlucHV0OiBSZW5kZXJMaW5lSW5wdXQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9jaGFyYWN0ZXJNYXBwaW5nOiBDaGFyYWN0ZXJNYXBwaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc1doaXRlc3BhY2VPbmx5OiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250YWluc0ZvcmVpZ25FbGVtZW50czogRm9yZWlnbkVsZW1lbnRUeXBlO1xuXHRwcml2YXRlIF9jYWNoZWRXaWR0aDogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBUaGlzIGlzIGEgbWFwIHRoYXQgaXMgdXNlZCBvbmx5IHdoZW4gdGhlIGxpbmUgaXMgZ3VhcmFudGVlZCB0byBiZSByZW5kZXJlZCBMVFIgYW5kIGhhcyBubyBSVEwgdGV4dC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BpeGVsT2Zmc2V0Q2FjaGU6IEZsb2F0MzJBcnJheSB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IoZG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+IHwgbnVsbCwgcmVuZGVyTGluZUlucHV0OiBSZW5kZXJMaW5lSW5wdXQsIGNoYXJhY3Rlck1hcHBpbmc6IENoYXJhY3Rlck1hcHBpbmcsIGNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzOiBGb3JlaWduRWxlbWVudFR5cGUpIHtcblx0XHR0aGlzLmRvbU5vZGUgPSBkb21Ob2RlO1xuXHRcdHRoaXMuaW5wdXQgPSByZW5kZXJMaW5lSW5wdXQ7XG5cdFx0dGhpcy5fY2hhcmFjdGVyTWFwcGluZyA9IGNoYXJhY3Rlck1hcHBpbmc7XG5cdFx0dGhpcy5faXNXaGl0ZXNwYWNlT25seSA9IC9eXFxzKiQvLnRlc3QocmVuZGVyTGluZUlucHV0LmxpbmVDb250ZW50KTtcblx0XHR0aGlzLl9jb250YWluc0ZvcmVpZ25FbGVtZW50cyA9IGNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzO1xuXHRcdHRoaXMuX2NhY2hlZFdpZHRoID0gLTE7XG5cblx0XHR0aGlzLl9waXhlbE9mZnNldENhY2hlID0gbnVsbDtcblx0XHRpZiAocmVuZGVyTGluZUlucHV0LmlzTFRSKSB7XG5cdFx0XHR0aGlzLl9waXhlbE9mZnNldENhY2hlID0gbmV3IEZsb2F0MzJBcnJheShNYXRoLm1heCgyLCB0aGlzLl9jaGFyYWN0ZXJNYXBwaW5nLmxlbmd0aCArIDEpKTtcblx0XHRcdGZvciAobGV0IGNvbHVtbiA9IDAsIGxlbiA9IHRoaXMuX2NoYXJhY3Rlck1hcHBpbmcubGVuZ3RoOyBjb2x1bW4gPD0gbGVuOyBjb2x1bW4rKykge1xuXHRcdFx0XHR0aGlzLl9waXhlbE9mZnNldENhY2hlW2NvbHVtbl0gPSAtMTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gUmVhZGluZyBmcm9tIHRoZSBET00gbWV0aG9kc1xuXG5cdHByb3RlY3RlZCBfZ2V0UmVhZGluZ1RhcmdldChteURvbU5vZGU6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50Pik6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gPEhUTUxTcGFuRWxlbWVudD5teURvbU5vZGUuZG9tTm9kZS5maXJzdENoaWxkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdpZHRoIG9mIHRoZSBsaW5lIGluIHBpeGVsc1xuXHQgKi9cblx0cHVibGljIGdldFdpZHRoKGNvbnRleHQ6IERvbVJlYWRpbmdDb250ZXh0IHwgbnVsbCk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLmRvbU5vZGUpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY2FjaGVkV2lkdGggPT09IC0xKSB7XG5cdFx0XHR0aGlzLl9jYWNoZWRXaWR0aCA9IHRoaXMuX2dldFJlYWRpbmdUYXJnZXQodGhpcy5kb21Ob2RlKS5vZmZzZXRXaWR0aDtcblx0XHRcdGNvbnRleHQ/Lm1hcmtEaWREb21MYXlvdXQoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NhY2hlZFdpZHRoO1xuXHR9XG5cblx0cHVibGljIGdldFdpZHRoSXNGYXN0KCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9jYWNoZWRXaWR0aCA9PT0gLTEpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgcmVzZXRDYWNoZWRXaWR0aCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jYWNoZWRXaWR0aCA9IC0xO1xuXHRcdGlmICh0aGlzLl9waXhlbE9mZnNldENhY2hlICE9PSBudWxsKSB7XG5cdFx0XHRmb3IgKGxldCBjb2x1bW4gPSAwLCBsZW4gPSB0aGlzLl9waXhlbE9mZnNldENhY2hlLmxlbmd0aDsgY29sdW1uIDwgbGVuOyBjb2x1bW4rKykge1xuXHRcdFx0XHR0aGlzLl9waXhlbE9mZnNldENhY2hlW2NvbHVtbl0gPSAtMTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVmlzaWJsZSByYW5nZXMgZm9yIGEgbW9kZWwgcmFuZ2Vcblx0ICovXG5cdHB1YmxpYyBnZXRWaXNpYmxlUmFuZ2VzRm9yUmFuZ2UobGluZU51bWJlcjogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyLCBlbmRDb2x1bW46IG51bWJlciwgY29udGV4dDogRG9tUmVhZGluZ0NvbnRleHQpOiBGbG9hdEhvcml6b250YWxSYW5nZVtdIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLmRvbU5vZGUpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fcGl4ZWxPZmZzZXRDYWNoZSAhPT0gbnVsbCkge1xuXHRcdFx0Ly8gdGhlIHRleHQgaXMgZ3VhcmFudGVlZCB0byBiZSBlbnRpcmVseSBMVFJcblx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5fcmVhZFBpeGVsT2Zmc2V0KHRoaXMuZG9tTm9kZSwgbGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGNvbnRleHQpO1xuXHRcdFx0aWYgKHN0YXJ0T2Zmc2V0ID09PSAtMSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZW5kT2Zmc2V0ID0gdGhpcy5fcmVhZFBpeGVsT2Zmc2V0KHRoaXMuZG9tTm9kZSwgbGluZU51bWJlciwgZW5kQ29sdW1uLCBjb250ZXh0KTtcblx0XHRcdGlmIChlbmRPZmZzZXQgPT09IC0xKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gW25ldyBGbG9hdEhvcml6b250YWxSYW5nZShzdGFydE9mZnNldCwgZW5kT2Zmc2V0IC0gc3RhcnRPZmZzZXQpXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcmVhZFZpc2libGVSYW5nZXNGb3JSYW5nZSh0aGlzLmRvbU5vZGUsIGxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRDb2x1bW4sIGNvbnRleHQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9yZWFkVmlzaWJsZVJhbmdlc0ZvclJhbmdlKGRvbU5vZGU6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50PiwgbGluZU51bWJlcjogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyLCBlbmRDb2x1bW46IG51bWJlciwgY29udGV4dDogRG9tUmVhZGluZ0NvbnRleHQpOiBGbG9hdEhvcml6b250YWxSYW5nZVtdIHwgbnVsbCB7XG5cdFx0aWYgKHN0YXJ0Q29sdW1uID09PSBlbmRDb2x1bW4pIHtcblx0XHRcdGNvbnN0IHBpeGVsT2Zmc2V0ID0gdGhpcy5fcmVhZFBpeGVsT2Zmc2V0KGRvbU5vZGUsIGxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBjb250ZXh0KTtcblx0XHRcdGlmIChwaXhlbE9mZnNldCA9PT0gLTEpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gW25ldyBGbG9hdEhvcml6b250YWxSYW5nZShwaXhlbE9mZnNldCwgMCldO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVhZFJhd1Zpc2libGVSYW5nZXNGb3JSYW5nZShkb21Ob2RlLCBzdGFydENvbHVtbiwgZW5kQ29sdW1uLCBjb250ZXh0KTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3JlYWRQaXhlbE9mZnNldChkb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4sIGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGNvbnRleHQ6IERvbVJlYWRpbmdDb250ZXh0KTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5pbnB1dC5pc0xUUiAmJiB0aGlzLl9jaGFyYWN0ZXJNYXBwaW5nLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gVGhpcyBsaW5lIGhhcyBubyBjb250ZW50XG5cdFx0XHRpZiAodGhpcy5fY29udGFpbnNGb3JlaWduRWxlbWVudHMgPT09IEZvcmVpZ25FbGVtZW50VHlwZS5Ob25lKSB7XG5cdFx0XHRcdC8vIFdlIGNhbiBhc3N1bWUgdGhlIGxpbmUgaXMgcmVhbGx5IGVtcHR5XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2NvbnRhaW5zRm9yZWlnbkVsZW1lbnRzID09PSBGb3JlaWduRWxlbWVudFR5cGUuQWZ0ZXIpIHtcblx0XHRcdFx0Ly8gV2UgaGF2ZSBmb3JlaWduIGVsZW1lbnRzIGFmdGVyIHRoZSAoZW1wdHkpIGxpbmVcblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fY29udGFpbnNGb3JlaWduRWxlbWVudHMgPT09IEZvcmVpZ25FbGVtZW50VHlwZS5CZWZvcmUpIHtcblx0XHRcdFx0Ly8gV2UgaGF2ZSBmb3JlaWduIGVsZW1lbnRzIGJlZm9yZSB0aGUgKGVtcHR5KSBsaW5lXG5cdFx0XHRcdHJldHVybiB0aGlzLmdldFdpZHRoKGNvbnRleHQpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gV2UgaGF2ZSBmb3JlaWduIGVsZW1lbnRzIGJlZm9yZSAmIGFmdGVyIHRoZSAoZW1wdHkpIGxpbmVcblx0XHRcdGNvbnN0IHJlYWRpbmdUYXJnZXQgPSB0aGlzLl9nZXRSZWFkaW5nVGFyZ2V0KGRvbU5vZGUpO1xuXHRcdFx0aWYgKHJlYWRpbmdUYXJnZXQuZmlyc3RDaGlsZCkge1xuXHRcdFx0XHRjb250ZXh0Lm1hcmtEaWREb21MYXlvdXQoKTtcblx0XHRcdFx0cmV0dXJuICg8SFRNTFNwYW5FbGVtZW50PnJlYWRpbmdUYXJnZXQuZmlyc3RDaGlsZCkub2Zmc2V0V2lkdGg7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcGl4ZWxPZmZzZXRDYWNoZSAhPT0gbnVsbCkge1xuXHRcdFx0Ly8gdGhlIHRleHQgaXMgZ3VhcmFudGVlZCB0byBiZSBMVFJcblxuXHRcdFx0Y29uc3QgY2FjaGVkUGl4ZWxPZmZzZXQgPSB0aGlzLl9waXhlbE9mZnNldENhY2hlW2NvbHVtbl07XG5cdFx0XHRpZiAoY2FjaGVkUGl4ZWxPZmZzZXQgIT09IC0xKSB7XG5cdFx0XHRcdHJldHVybiBjYWNoZWRQaXhlbE9mZnNldDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fYWN0dWFsUmVhZFBpeGVsT2Zmc2V0KGRvbU5vZGUsIGxpbmVOdW1iZXIsIGNvbHVtbiwgY29udGV4dCk7XG5cdFx0XHR0aGlzLl9waXhlbE9mZnNldENhY2hlW2NvbHVtbl0gPSByZXN1bHQ7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9hY3R1YWxSZWFkUGl4ZWxPZmZzZXQoZG9tTm9kZSwgbGluZU51bWJlciwgY29sdW1uLCBjb250ZXh0KTtcblx0fVxuXG5cdHByaXZhdGUgX2FjdHVhbFJlYWRQaXhlbE9mZnNldChkb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4sIGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGNvbnRleHQ6IERvbVJlYWRpbmdDb250ZXh0KTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5fY2hhcmFjdGVyTWFwcGluZy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIFRoaXMgbGluZSBoYXMgbm8gY29udGVudFxuXHRcdFx0Y29uc3QgciA9IFJhbmdlVXRpbC5yZWFkSG9yaXpvbnRhbFJhbmdlcyh0aGlzLl9nZXRSZWFkaW5nVGFyZ2V0KGRvbU5vZGUpLCAwLCAwLCAwLCAwLCBjb250ZXh0KTtcblx0XHRcdGlmICghciB8fCByLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gclswXS5sZWZ0O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlucHV0LmlzTFRSICYmIGNvbHVtbiA9PT0gdGhpcy5fY2hhcmFjdGVyTWFwcGluZy5sZW5ndGggJiYgdGhpcy5faXNXaGl0ZXNwYWNlT25seSAmJiB0aGlzLl9jb250YWluc0ZvcmVpZ25FbGVtZW50cyA9PT0gRm9yZWlnbkVsZW1lbnRUeXBlLk5vbmUpIHtcblx0XHRcdC8vIFRoaXMgYnJhbmNoIGhlbHBzIGluIHRoZSBjYXNlIG9mIHdoaXRlc3BhY2Ugb25seSBsaW5lcyB3aGljaCBoYXZlIGEgd2lkdGggc2V0XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRXaWR0aChjb250ZXh0KTtcblx0XHR9XG5cblx0XHRjb25zdCBkb21Qb3NpdGlvbiA9IHRoaXMuX2NoYXJhY3Rlck1hcHBpbmcuZ2V0RG9tUG9zaXRpb24oY29sdW1uKTtcblxuXHRcdGNvbnN0IHIgPSBSYW5nZVV0aWwucmVhZEhvcml6b250YWxSYW5nZXModGhpcy5fZ2V0UmVhZGluZ1RhcmdldChkb21Ob2RlKSwgZG9tUG9zaXRpb24ucGFydEluZGV4LCBkb21Qb3NpdGlvbi5jaGFySW5kZXgsIGRvbVBvc2l0aW9uLnBhcnRJbmRleCwgZG9tUG9zaXRpb24uY2hhckluZGV4LCBjb250ZXh0KTtcblx0XHRpZiAoIXIgfHwgci5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gclswXS5sZWZ0O1xuXHRcdGlmICh0aGlzLmlucHV0LmlzQmFzaWNBU0NJSSkge1xuXHRcdFx0Y29uc3QgaG9yaXpvbnRhbE9mZnNldCA9IHRoaXMuX2NoYXJhY3Rlck1hcHBpbmcuZ2V0SG9yaXpvbnRhbE9mZnNldChjb2x1bW4pO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRSZXN1bHQgPSBNYXRoLnJvdW5kKHRoaXMuaW5wdXQuc3BhY2VXaWR0aCAqIGhvcml6b250YWxPZmZzZXQpO1xuXHRcdFx0aWYgKE1hdGguYWJzKGV4cGVjdGVkUmVzdWx0IC0gcmVzdWx0KSA8PSAxKSB7XG5cdFx0XHRcdHJldHVybiBleHBlY3RlZFJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX3JlYWRSYXdWaXNpYmxlUmFuZ2VzRm9yUmFuZ2UoZG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+LCBzdGFydENvbHVtbjogbnVtYmVyLCBlbmRDb2x1bW46IG51bWJlciwgY29udGV4dDogRG9tUmVhZGluZ0NvbnRleHQpOiBGbG9hdEhvcml6b250YWxSYW5nZVtdIHwgbnVsbCB7XG5cblx0XHRpZiAodGhpcy5pbnB1dC5pc0xUUiAmJiBzdGFydENvbHVtbiA9PT0gMSAmJiBlbmRDb2x1bW4gPT09IHRoaXMuX2NoYXJhY3Rlck1hcHBpbmcubGVuZ3RoKSB7XG5cdFx0XHQvLyBUaGlzIGJyYW5jaCBoZWxwcyBJRSB3aXRoIGJpZGkgdGV4dCAmIGdpdmVzIGEgcGVyZm9ybWFuY2UgYm9vc3QgdG8gb3RoZXIgYnJvd3NlcnMgd2hlbiByZWFkaW5nIHZpc2libGUgcmFuZ2VzIGZvciBhbiBlbnRpcmUgbGluZVxuXG5cdFx0XHRyZXR1cm4gW25ldyBGbG9hdEhvcml6b250YWxSYW5nZSgwLCB0aGlzLmdldFdpZHRoKGNvbnRleHQpKV07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnREb21Qb3NpdGlvbiA9IHRoaXMuX2NoYXJhY3Rlck1hcHBpbmcuZ2V0RG9tUG9zaXRpb24oc3RhcnRDb2x1bW4pO1xuXHRcdGNvbnN0IGVuZERvbVBvc2l0aW9uID0gdGhpcy5fY2hhcmFjdGVyTWFwcGluZy5nZXREb21Qb3NpdGlvbihlbmRDb2x1bW4pO1xuXG5cdFx0cmV0dXJuIFJhbmdlVXRpbC5yZWFkSG9yaXpvbnRhbFJhbmdlcyh0aGlzLl9nZXRSZWFkaW5nVGFyZ2V0KGRvbU5vZGUpLCBzdGFydERvbVBvc2l0aW9uLnBhcnRJbmRleCwgc3RhcnREb21Qb3NpdGlvbi5jaGFySW5kZXgsIGVuZERvbVBvc2l0aW9uLnBhcnRJbmRleCwgZW5kRG9tUG9zaXRpb24uY2hhckluZGV4LCBjb250ZXh0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjb2x1bW4gZm9yIHRoZSB0ZXh0IGZvdW5kIGF0IGEgc3BlY2lmaWMgb2Zmc2V0IGluc2lkZSBhIHJlbmRlcmVkIGRvbSBub2RlXG5cdCAqL1xuXHRwdWJsaWMgZ2V0Q29sdW1uT2ZOb2RlT2Zmc2V0KHNwYW5Ob2RlOiBIVE1MRWxlbWVudCwgb2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiBnZXRDb2x1bW5PZk5vZGVPZmZzZXQodGhpcy5fY2hhcmFjdGVyTWFwcGluZywgc3Bhbk5vZGUsIG9mZnNldCk7XG5cdH1cbn1cblxuY2xhc3MgV2ViS2l0UmVuZGVyZWRWaWV3TGluZSBleHRlbmRzIFJlbmRlcmVkVmlld0xpbmUge1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX3JlYWRWaXNpYmxlUmFuZ2VzRm9yUmFuZ2UoZG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+LCBsaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyLCBjb250ZXh0OiBEb21SZWFkaW5nQ29udGV4dCk6IEZsb2F0SG9yaXpvbnRhbFJhbmdlW10gfCBudWxsIHtcblx0XHRjb25zdCBvdXRwdXQgPSBzdXBlci5fcmVhZFZpc2libGVSYW5nZXNGb3JSYW5nZShkb21Ob2RlLCBsaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgZW5kQ29sdW1uLCBjb250ZXh0KTtcblxuXHRcdGlmICghb3V0cHV0IHx8IG91dHB1dC5sZW5ndGggPT09IDAgfHwgc3RhcnRDb2x1bW4gPT09IGVuZENvbHVtbiB8fCAoc3RhcnRDb2x1bW4gPT09IDEgJiYgZW5kQ29sdW1uID09PSB0aGlzLl9jaGFyYWN0ZXJNYXBwaW5nLmxlbmd0aCkpIHtcblx0XHRcdHJldHVybiBvdXRwdXQ7XG5cdFx0fVxuXG5cdFx0Ly8gV2ViS2l0IGlzIGJ1Z2d5IGFuZCByZXR1cm5zIGFuIGV4cGFuZGVkIHJhbmdlICh0byBjb250YWluIHdvcmRzIGluIHNvbWUgY2FzZXMpXG5cdFx0Ly8gVGhlIGxhc3QgY2xpZW50IHJlY3QgaXMgZW5sYXJnZWQgKEkgdGhpbmspXG5cdFx0aWYgKHRoaXMuaW5wdXQuaXNMVFIpIHtcblx0XHRcdC8vIFRoaXMgaXMgYW4gYXR0ZW1wdCB0byBwYXRjaCB0aGluZ3MgdXBcblx0XHRcdC8vIEZpbmQgcG9zaXRpb24gb2YgbGFzdCBjb2x1bW5cblx0XHRcdGNvbnN0IGVuZFBpeGVsT2Zmc2V0ID0gdGhpcy5fcmVhZFBpeGVsT2Zmc2V0KGRvbU5vZGUsIGxpbmVOdW1iZXIsIGVuZENvbHVtbiwgY29udGV4dCk7XG5cdFx0XHRpZiAoZW5kUGl4ZWxPZmZzZXQgIT09IC0xKSB7XG5cdFx0XHRcdGNvbnN0IGxhc3RSYW5nZSA9IG91dHB1dFtvdXRwdXQubGVuZ3RoIC0gMV07XG5cdFx0XHRcdGlmIChsYXN0UmFuZ2UubGVmdCA8IGVuZFBpeGVsT2Zmc2V0KSB7XG5cdFx0XHRcdFx0Ly8gVHJpbSBkb3duIHRoZSB3aWR0aCBvZiB0aGUgbGFzdCB2aXNpYmxlIHJhbmdlIHRvIG5vdCBnbyBhZnRlciB0aGUgbGFzdCBjb2x1bW4ncyBwb3NpdGlvblxuXHRcdFx0XHRcdGxhc3RSYW5nZS53aWR0aCA9IGVuZFBpeGVsT2Zmc2V0IC0gbGFzdFJhbmdlLmxlZnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG59XG5cbmNvbnN0IGNyZWF0ZVJlbmRlcmVkTGluZTogKGRvbU5vZGU6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50PiB8IG51bGwsIHJlbmRlckxpbmVJbnB1dDogUmVuZGVyTGluZUlucHV0LCBjaGFyYWN0ZXJNYXBwaW5nOiBDaGFyYWN0ZXJNYXBwaW5nLCBjb250YWluc0ZvcmVpZ25FbGVtZW50czogRm9yZWlnbkVsZW1lbnRUeXBlKSA9PiBSZW5kZXJlZFZpZXdMaW5lID0gKGZ1bmN0aW9uICgpIHtcblx0aWYgKGJyb3dzZXIuaXNXZWJLaXQpIHtcblx0XHRyZXR1cm4gY3JlYXRlV2ViS2l0UmVuZGVyZWRMaW5lO1xuXHR9XG5cdHJldHVybiBjcmVhdGVOb3JtYWxSZW5kZXJlZExpbmU7XG59KSgpO1xuXG5mdW5jdGlvbiBjcmVhdGVXZWJLaXRSZW5kZXJlZExpbmUoZG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+IHwgbnVsbCwgcmVuZGVyTGluZUlucHV0OiBSZW5kZXJMaW5lSW5wdXQsIGNoYXJhY3Rlck1hcHBpbmc6IENoYXJhY3Rlck1hcHBpbmcsIGNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzOiBGb3JlaWduRWxlbWVudFR5cGUpOiBSZW5kZXJlZFZpZXdMaW5lIHtcblx0cmV0dXJuIG5ldyBXZWJLaXRSZW5kZXJlZFZpZXdMaW5lKGRvbU5vZGUsIHJlbmRlckxpbmVJbnB1dCwgY2hhcmFjdGVyTWFwcGluZywgY29udGFpbnNGb3JlaWduRWxlbWVudHMpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVOb3JtYWxSZW5kZXJlZExpbmUoZG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+IHwgbnVsbCwgcmVuZGVyTGluZUlucHV0OiBSZW5kZXJMaW5lSW5wdXQsIGNoYXJhY3Rlck1hcHBpbmc6IENoYXJhY3Rlck1hcHBpbmcsIGNvbnRhaW5zRm9yZWlnbkVsZW1lbnRzOiBGb3JlaWduRWxlbWVudFR5cGUpOiBSZW5kZXJlZFZpZXdMaW5lIHtcblx0cmV0dXJuIG5ldyBSZW5kZXJlZFZpZXdMaW5lKGRvbU5vZGUsIHJlbmRlckxpbmVJbnB1dCwgY2hhcmFjdGVyTWFwcGluZywgY29udGFpbnNGb3JlaWduRWxlbWVudHMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29sdW1uT2ZOb2RlT2Zmc2V0KGNoYXJhY3Rlck1hcHBpbmc6IENoYXJhY3Rlck1hcHBpbmcsIHNwYW5Ob2RlOiBIVE1MRWxlbWVudCwgb2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRjb25zdCBzcGFuTm9kZVRleHRDb250ZW50TGVuZ3RoID0gc3Bhbk5vZGUudGV4dENvbnRlbnQubGVuZ3RoO1xuXG5cdGxldCBzcGFuSW5kZXggPSAtMTtcblx0d2hpbGUgKHNwYW5Ob2RlKSB7XG5cdFx0c3Bhbk5vZGUgPSA8SFRNTEVsZW1lbnQ+c3Bhbk5vZGUucHJldmlvdXNTaWJsaW5nO1xuXHRcdHNwYW5JbmRleCsrO1xuXHR9XG5cblx0cmV0dXJuIGNoYXJhY3Rlck1hcHBpbmcuZ2V0Q29sdW1uKG5ldyBEb21Qb3NpdGlvbihzcGFuSW5kZXgsIG9mZnNldCksIHNwYW5Ob2RlVGV4dENvbnRlbnRMZW5ndGgpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxhQUFhO0FBQ3pCLFNBQXNCLHlCQUF5QjtBQUMvQyxZQUFZLGNBQWM7QUFFMUIsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyxzQkFBc0IscUJBQXFCO0FBQ3BELFNBQVMsc0JBQXNCO0FBQy9CLFNBQTJCLG9CQUFvQixpQkFBaUIsZ0JBQWdCLGFBQWEsd0JBQXdCO0FBRXJILFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkJBQTJCO0FBSXBDLFNB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QUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLE1BQU0sc0JBQXlNLFdBQVk7QUFDMU4sTUFBSSxRQUFRLFVBQVU7QUFDckIsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPO0FBQ1IsR0FBRztBQUVILFNBQVMseUJBQXlCLFNBQTBDLGlCQUFrQyxrQkFBb0MseUJBQStEO0FBQ2hOLFNBQU8sSUFBSSx1QkFBdUIsU0FBUyxpQkFBaUIsa0JBQWtCLHVCQUF1QjtBQUN0RztBQUVBLFNBQVMseUJBQXlCLFNBQTBDLGlCQUFrQyxrQkFBb0MseUJBQStEO0FBQ2hOLFNBQU8sSUFBSSxpQkFBaUIsU0FBUyxpQkFBaUIsa0JBQWtCLHVCQUF1QjtBQUNoRztBQUVPLFNBQVMsc0JBQXNCLGtCQUFvQyxVQUF1QixRQUF3QjtBQUN4SCxRQUFNLDRCQUE0QixTQUFTLFlBQVk7QUFFdkQsTUFBSSxZQUFZO0FBQ2hCLFNBQU8sVUFBVTtBQUNoQixlQUF3QixTQUFTO0FBQ2pDO0FBQUEsRUFDRDtBQUVBLFNBQU8saUJBQWlCLFVBQVUsSUFBSSxZQUFZLFdBQVcsTUFBTSxHQUFHLHlCQUF5QjtBQUNoRzsiLAogICJuYW1lcyI6IFsiQ29uc3RhbnRzIiwgImhvcml6b250YWxPZmZzZXQiLCAiciJdCn0K
