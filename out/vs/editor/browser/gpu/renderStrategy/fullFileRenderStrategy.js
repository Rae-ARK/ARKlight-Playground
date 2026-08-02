import { getActiveWindow } from "../../../../base/browser/dom.js";
import { Color } from "../../../../base/common/color.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { CursorColumns } from "../../../common/core/cursorColumns.js";
import { ViewEventType } from "../../../common/viewEvents.js";
import { createContentSegmenter } from "../contentSegmenter.js";
import { fullFileRenderStrategyWgsl } from "./fullFileRenderStrategy.wgsl.js";
import { BindingId } from "../gpu.js";
import { GPULifecycle } from "../gpuDisposable.js";
import { quadVertices } from "../gpuUtils.js";
import { ViewGpuContext } from "../viewGpuContext.js";
import { BaseRenderStrategy } from "./baseRenderStrategy.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["IndicesPerCell"] = 6] = "IndicesPerCell";
  return Constants2;
})(Constants || {});
var CellBufferInfo = /* @__PURE__ */ ((CellBufferInfo2) => {
  CellBufferInfo2[CellBufferInfo2["FloatsPerEntry"] = 6] = "FloatsPerEntry";
  CellBufferInfo2[CellBufferInfo2["BytesPerEntry"] = 24] = "BytesPerEntry";
  CellBufferInfo2[CellBufferInfo2["Offset_X"] = 0] = "Offset_X";
  CellBufferInfo2[CellBufferInfo2["Offset_Y"] = 1] = "Offset_Y";
  CellBufferInfo2[CellBufferInfo2["Offset_Unused1"] = 2] = "Offset_Unused1";
  CellBufferInfo2[CellBufferInfo2["Offset_Unused2"] = 3] = "Offset_Unused2";
  CellBufferInfo2[CellBufferInfo2["GlyphIndex"] = 4] = "GlyphIndex";
  CellBufferInfo2[CellBufferInfo2["TextureIndex"] = 5] = "TextureIndex";
  return CellBufferInfo2;
})(CellBufferInfo || {});
const _FullFileRenderStrategy = class _FullFileRenderStrategy extends BaseRenderStrategy {
  constructor(context, viewGpuContext, device, glyphRasterizer) {
    super(context, viewGpuContext, device, glyphRasterizer);
    this.type = "fullfile";
    this.wgsl = fullFileRenderStrategyWgsl;
    this._activeDoubleBufferIndex = 0;
    this._upToDateLines = [/* @__PURE__ */ new Set(), /* @__PURE__ */ new Set()];
    this._visibleObjectCount = 0;
    this._finalRenderedLine = 0;
    this._scrollInitialized = false;
    this._queuedBufferUpdates = [[], []];
    const bufferSize = _FullFileRenderStrategy.maxSupportedLines * _FullFileRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */ * Float32Array.BYTES_PER_ELEMENT;
    this._cellBindBuffer = this._register(GPULifecycle.createBuffer(this._device, {
      label: "Monaco full file cell buffer",
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })).object;
    this._cellValueBuffers = [
      new ArrayBuffer(bufferSize),
      new ArrayBuffer(bufferSize)
    ];
    const scrollOffsetBufferSize = 2;
    this._scrollOffsetBindBuffer = this._register(GPULifecycle.createBuffer(this._device, {
      label: "Monaco scroll offset buffer",
      size: scrollOffsetBufferSize * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })).object;
    this._scrollOffsetValueBuffer = new Float32Array(scrollOffsetBufferSize);
  }
  get bindGroupEntries() {
    return [
      { binding: BindingId.Cells, resource: { buffer: this._cellBindBuffer } },
      { binding: BindingId.ScrollOffset, resource: { buffer: this._scrollOffsetBindBuffer } }
    ];
  }
  // #region Event handlers
  // The primary job of these handlers is to:
  // 1. Invalidate the up to date line cache, which will cause the line to be re-rendered when
  //    it's _within the viewport_.
  // 2. Pass relevant events on to the render function so it can force certain line ranges to be
  //    re-rendered even if they're not in the viewport. For example when a view zone is added,
  //    there are lines that used to be visible but are no longer, so those ranges must be
  //    cleared and uploaded to the GPU.
  onConfigurationChanged(e) {
    this._invalidateAllLines();
    this._queueBufferUpdate(e);
    return true;
  }
  onDecorationsChanged(e) {
    this._invalidateAllLines();
    return true;
  }
  onTokensChanged(e) {
    for (const range of e.ranges) {
      this._invalidateLineRange(range.fromLineNumber, range.toLineNumber);
    }
    return true;
  }
  onLinesDeleted(e) {
    this._invalidateLinesFrom(e.fromLineNumber);
    this._queueBufferUpdate(e);
    return true;
  }
  onLinesInserted(e) {
    this._invalidateLinesFrom(e.fromLineNumber);
    return true;
  }
  onLinesChanged(e) {
    this._invalidateLineRange(e.fromLineNumber, e.fromLineNumber + e.count);
    return true;
  }
  onScrollChanged(e) {
    if (this._store.isDisposed) {
      return false;
    }
    const dpr = getActiveWindow().devicePixelRatio;
    this._scrollOffsetValueBuffer[0] = (e?.scrollLeft ?? this._context.viewLayout.getCurrentScrollLeft()) * dpr;
    this._scrollOffsetValueBuffer[1] = (e?.scrollTop ?? this._context.viewLayout.getCurrentScrollTop()) * dpr;
    this._device.queue.writeBuffer(this._scrollOffsetBindBuffer, 0, this._scrollOffsetValueBuffer);
    return true;
  }
  onThemeChanged(e) {
    this._invalidateAllLines();
    return true;
  }
  onLineMappingChanged(e) {
    this._invalidateAllLines();
    this._queueBufferUpdate(e);
    return true;
  }
  onZonesChanged(e) {
    this._invalidateAllLines();
    this._queueBufferUpdate(e);
    return true;
  }
  // #endregion
  _invalidateAllLines() {
    this._upToDateLines[0].clear();
    this._upToDateLines[1].clear();
  }
  _invalidateLinesFrom(lineNumber) {
    for (const i of [0, 1]) {
      const upToDateLines = this._upToDateLines[i];
      for (const upToDateLine of upToDateLines) {
        if (upToDateLine >= lineNumber) {
          upToDateLines.delete(upToDateLine);
        }
      }
    }
  }
  _invalidateLineRange(fromLineNumber, toLineNumber) {
    for (let i = fromLineNumber; i <= toLineNumber; i++) {
      this._upToDateLines[0].delete(i);
      this._upToDateLines[1].delete(i);
    }
  }
  reset() {
    this._invalidateAllLines();
    for (const bufferIndex of [0, 1]) {
      const buffer = new Float32Array(this._cellValueBuffers[bufferIndex]);
      buffer.fill(0, 0, buffer.length);
      this._device.queue.writeBuffer(this._cellBindBuffer, 0, buffer.buffer, 0, buffer.byteLength);
    }
    this._finalRenderedLine = 0;
  }
  update(viewportData, viewLineOptions) {
    let chars = "";
    let segment;
    let charWidth = 0;
    let y = 0;
    let x = 0;
    let absoluteOffsetX = 0;
    let absoluteOffsetY = 0;
    let tabXOffset = 0;
    let glyph;
    let cellIndex = 0;
    let tokenStartIndex = 0;
    let tokenEndIndex = 0;
    let tokenMetadata = 0;
    let decorationStyleSetBold;
    let decorationStyleSetColor;
    let decorationStyleSetOpacity;
    let decorationStyleSetStrikethrough;
    let decorationStyleSetStrikethroughThickness;
    let decorationStyleSetStrikethroughColor;
    let lineData;
    let decoration;
    let fillStartIndex = 0;
    let fillEndIndex = 0;
    let tokens;
    const dpr = getActiveWindow().devicePixelRatio;
    let contentSegmenter;
    if (!this._scrollInitialized) {
      this.onScrollChanged();
      this._scrollInitialized = true;
    }
    const cellBuffer = new Float32Array(this._cellValueBuffers[this._activeDoubleBufferIndex]);
    const lineIndexCount = _FullFileRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */;
    const upToDateLines = this._upToDateLines[this._activeDoubleBufferIndex];
    let dirtyLineStart = 3e3;
    let dirtyLineEnd = 0;
    const queuedBufferUpdates = this._queuedBufferUpdates[this._activeDoubleBufferIndex];
    while (queuedBufferUpdates.length) {
      const e = queuedBufferUpdates.shift();
      switch (e.type) {
        // TODO: Refine these cases so we're not throwing away everything
        case ViewEventType.ViewConfigurationChanged:
        case ViewEventType.ViewLineMappingChanged:
        case ViewEventType.ViewZonesChanged: {
          cellBuffer.fill(0);
          dirtyLineStart = 1;
          dirtyLineEnd = Math.max(dirtyLineEnd, this._finalRenderedLine);
          this._finalRenderedLine = 0;
          break;
        }
        case ViewEventType.ViewLinesDeleted: {
          const deletedLineContentStartIndex = (e.fromLineNumber - 1) * _FullFileRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */;
          const deletedLineContentEndIndex = e.toLineNumber * _FullFileRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */;
          const nullContentStartIndex = (this._finalRenderedLine - (e.toLineNumber - e.fromLineNumber + 1)) * _FullFileRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */;
          cellBuffer.set(cellBuffer.subarray(deletedLineContentEndIndex), deletedLineContentStartIndex);
          cellBuffer.fill(0, nullContentStartIndex);
          dirtyLineStart = Math.min(dirtyLineStart, e.fromLineNumber);
          dirtyLineEnd = Math.max(dirtyLineEnd, this._finalRenderedLine);
          this._finalRenderedLine -= e.toLineNumber - e.fromLineNumber + 1;
          break;
        }
      }
    }
    for (y = viewportData.startLineNumber; y <= viewportData.endLineNumber; y++) {
      if (!this._viewGpuContext.canRender(viewLineOptions, viewportData, y)) {
        fillStartIndex = (y - 1) * _FullFileRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */;
        fillEndIndex = y * _FullFileRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */;
        cellBuffer.fill(0, fillStartIndex, fillEndIndex);
        dirtyLineStart = Math.min(dirtyLineStart, y);
        dirtyLineEnd = Math.max(dirtyLineEnd, y);
        continue;
      }
      if (upToDateLines.has(y)) {
        continue;
      }
      dirtyLineStart = Math.min(dirtyLineStart, y);
      dirtyLineEnd = Math.max(dirtyLineEnd, y);
      lineData = viewportData.getViewLineRenderingData(y);
      tabXOffset = 0;
      contentSegmenter = createContentSegmenter(lineData, viewLineOptions);
      charWidth = viewLineOptions.spaceWidth * dpr;
      absoluteOffsetX = (lineData.minColumn - 1) * charWidth;
      tokens = lineData.tokens;
      tokenStartIndex = lineData.minColumn - 1;
      tokenEndIndex = 0;
      for (let tokenIndex = 0, tokensLen = tokens.getCount(); tokenIndex < tokensLen; tokenIndex++) {
        tokenEndIndex = tokens.getEndOffset(tokenIndex);
        if (tokenEndIndex <= tokenStartIndex) {
          continue;
        }
        tokenMetadata = tokens.getMetadata(tokenIndex);
        for (x = tokenStartIndex; x < tokenEndIndex; x++) {
          if (x > _FullFileRenderStrategy.maxSupportedColumns) {
            break;
          }
          segment = contentSegmenter.getSegmentAtIndex(x);
          if (segment === void 0) {
            continue;
          }
          chars = segment;
          if (!(lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations)) {
            charWidth = this.glyphRasterizer.getTextMetrics(chars).width;
          }
          decorationStyleSetColor = void 0;
          decorationStyleSetBold = void 0;
          decorationStyleSetOpacity = void 0;
          decorationStyleSetStrikethrough = void 0;
          decorationStyleSetStrikethroughThickness = void 0;
          decorationStyleSetStrikethroughColor = void 0;
          for (decoration of lineData.inlineDecorations) {
            if (y < decoration.range.startLineNumber || y > decoration.range.endLineNumber || y === decoration.range.startLineNumber && x < decoration.range.startColumn - 1 || y === decoration.range.endLineNumber && x >= decoration.range.endColumn - 1) {
              continue;
            }
            const rules = ViewGpuContext.decorationCssRuleExtractor.getStyleRules(this._viewGpuContext.canvas.domNode, decoration.inlineClassName);
            for (const rule of rules) {
              for (const r of rule.style) {
                const value = rule.styleMap.get(r)?.toString() ?? "";
                switch (r) {
                  case "color": {
                    const parsedColor = Color.Format.CSS.parse(value);
                    if (!parsedColor) {
                      throw new BugIndicatingError("Invalid color format " + value);
                    }
                    decorationStyleSetColor = parsedColor.toNumber32Bit();
                    break;
                  }
                  case "font-weight": {
                    const parsedValue = parseCssFontWeight(value);
                    if (parsedValue >= 400) {
                      decorationStyleSetBold = true;
                    } else {
                      decorationStyleSetBold = false;
                    }
                    break;
                  }
                  case "opacity": {
                    const parsedValue = parseCssOpacity(value);
                    decorationStyleSetOpacity = parsedValue;
                    break;
                  }
                  case "text-decoration":
                  case "text-decoration-line": {
                    if (value === "line-through") {
                      decorationStyleSetStrikethrough = true;
                    }
                    break;
                  }
                  case "text-decoration-thickness": {
                    const match = value.match(/^(\d+(?:\.\d+)?)px$/);
                    if (match) {
                      decorationStyleSetStrikethroughThickness = parseFloat(match[1]);
                    }
                    break;
                  }
                  case "text-decoration-color": {
                    let colorValue = value;
                    const varMatch = value.match(/^var\((--[^,]+),\s*(?:initial|inherit)\)$/);
                    if (varMatch) {
                      colorValue = ViewGpuContext.decorationCssRuleExtractor.resolveCssVariable(this._viewGpuContext.canvas.domNode, varMatch[1]);
                    }
                    const parsedColor = Color.Format.CSS.parse(colorValue);
                    if (parsedColor) {
                      decorationStyleSetStrikethroughColor = parsedColor.toNumber32Bit();
                    }
                    break;
                  }
                  case "text-decoration-style": {
                    break;
                  }
                  default:
                    throw new BugIndicatingError("Unexpected inline decoration style");
                }
              }
            }
          }
          if (chars === " " || chars === "	") {
            cellIndex = ((y - 1) * _FullFileRenderStrategy.maxSupportedColumns + x) * 6 /* IndicesPerCell */;
            cellBuffer.fill(0, cellIndex, cellIndex + 6 /* FloatsPerEntry */);
            if (chars === "	") {
              const offsetBefore = x + tabXOffset;
              tabXOffset = CursorColumns.nextRenderTabStop(x + tabXOffset, lineData.tabSize);
              absoluteOffsetX += charWidth * (tabXOffset - offsetBefore);
              tabXOffset -= x + 1;
            } else {
              absoluteOffsetX += charWidth;
            }
            continue;
          }
          const decorationStyleSetId = ViewGpuContext.decorationStyleCache.getOrCreateEntry(decorationStyleSetColor, decorationStyleSetBold, decorationStyleSetOpacity, decorationStyleSetStrikethrough, decorationStyleSetStrikethroughThickness, decorationStyleSetStrikethroughColor);
          glyph = this._viewGpuContext.atlas.getGlyph(this.glyphRasterizer, chars, tokenMetadata, decorationStyleSetId, absoluteOffsetX);
          absoluteOffsetY = Math.round(
            // Top of layout box (includes line height)
            viewportData.relativeVerticalOffset[y - viewportData.startLineNumber] * dpr + // Delta from top of layout box (includes line height) to top of the inline box (no line height)
            Math.floor((viewportData.lineHeight * dpr - (glyph.fontBoundingBoxAscent + glyph.fontBoundingBoxDescent)) / 2) + // Delta from top of inline box (no line height) to top of glyph origin. If the glyph was drawn
            // with a top baseline for example, this ends up drawing the glyph correctly using the alphabetical
            // baseline.
            glyph.fontBoundingBoxAscent
          );
          cellIndex = ((y - 1) * _FullFileRenderStrategy.maxSupportedColumns + x) * 6 /* IndicesPerCell */;
          cellBuffer[cellIndex + 0 /* Offset_X */] = Math.floor(absoluteOffsetX);
          cellBuffer[cellIndex + 1 /* Offset_Y */] = absoluteOffsetY;
          cellBuffer[cellIndex + 4 /* GlyphIndex */] = glyph.glyphIndex;
          cellBuffer[cellIndex + 5 /* TextureIndex */] = glyph.pageIndex;
          absoluteOffsetX += charWidth;
        }
        tokenStartIndex = tokenEndIndex;
      }
      fillStartIndex = ((y - 1) * _FullFileRenderStrategy.maxSupportedColumns + tokenEndIndex) * 6 /* IndicesPerCell */;
      fillEndIndex = y * _FullFileRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */;
      cellBuffer.fill(0, fillStartIndex, fillEndIndex);
      upToDateLines.add(y);
    }
    const visibleObjectCount = (viewportData.endLineNumber - viewportData.startLineNumber + 1) * lineIndexCount;
    dirtyLineStart = Math.min(dirtyLineStart, _FullFileRenderStrategy.maxSupportedLines);
    dirtyLineEnd = Math.min(dirtyLineEnd, _FullFileRenderStrategy.maxSupportedLines);
    if (dirtyLineStart <= dirtyLineEnd) {
      this._device.queue.writeBuffer(
        this._cellBindBuffer,
        (dirtyLineStart - 1) * lineIndexCount * Float32Array.BYTES_PER_ELEMENT,
        cellBuffer.buffer,
        (dirtyLineStart - 1) * lineIndexCount * Float32Array.BYTES_PER_ELEMENT,
        (dirtyLineEnd - dirtyLineStart + 1) * lineIndexCount * Float32Array.BYTES_PER_ELEMENT
      );
    }
    this._finalRenderedLine = Math.max(this._finalRenderedLine, dirtyLineEnd);
    this._activeDoubleBufferIndex = this._activeDoubleBufferIndex ? 0 : 1;
    this._visibleObjectCount = visibleObjectCount;
    return visibleObjectCount;
  }
  draw(pass, viewportData) {
    if (this._visibleObjectCount <= 0) {
      throw new BugIndicatingError("Attempt to draw 0 objects");
    }
    pass.draw(
      quadVertices.length / 2,
      this._visibleObjectCount,
      void 0,
      (viewportData.startLineNumber - 1) * _FullFileRenderStrategy.maxSupportedColumns
    );
  }
  /**
   * Queue updates that need to happen on the active buffer, not just the cache. This will be
   * deferred to when the actual cell buffer is changed since the active buffer could be locked by
   * the GPU which would block the main thread.
   */
  _queueBufferUpdate(e) {
    this._queuedBufferUpdates[0].push(e);
    this._queuedBufferUpdates[1].push(e);
  }
};
/**
 * The hard cap for line count that can be rendered by the GPU renderer.
 */
_FullFileRenderStrategy.maxSupportedLines = 3e3;
/**
 * The hard cap for line columns that can be rendered by the GPU renderer.
 */
_FullFileRenderStrategy.maxSupportedColumns = 200;
let FullFileRenderStrategy = _FullFileRenderStrategy;
function parseCssFontWeight(value) {
  switch (value) {
    case "lighter":
    case "normal":
      return 400;
    case "bolder":
    case "bold":
      return 700;
  }
  return parseInt(value);
}
function parseCssOpacity(value) {
  if (value.endsWith("%")) {
    return parseFloat(value.substring(0, value.length - 1)) / 100;
  }
  if (value.match(/^\d+(?:\.\d*)/)) {
    return parseFloat(value);
  }
  return 1;
}
export {
  FullFileRenderStrategy
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL2dwdS9yZW5kZXJTdHJhdGVneS9mdWxsRmlsZVJlbmRlclN0cmF0ZWd5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZ2V0QWN0aXZlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBDdXJzb3JDb2x1bW5zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvY3Vyc29yQ29sdW1ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IElWaWV3TGluZVRva2VucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b2tlbnMvbGluZVRva2Vucy5qcyc7XG5pbXBvcnQgeyBWaWV3RXZlbnRUeXBlLCB0eXBlIFZpZXdDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50LCB0eXBlIFZpZXdEZWNvcmF0aW9uc0NoYW5nZWRFdmVudCwgdHlwZSBWaWV3TGluZU1hcHBpbmdDaGFuZ2VkRXZlbnQsIHR5cGUgVmlld0xpbmVzQ2hhbmdlZEV2ZW50LCB0eXBlIFZpZXdMaW5lc0RlbGV0ZWRFdmVudCwgdHlwZSBWaWV3TGluZXNJbnNlcnRlZEV2ZW50LCB0eXBlIFZpZXdTY3JvbGxDaGFuZ2VkRXZlbnQsIHR5cGUgVmlld1RoZW1lQ2hhbmdlZEV2ZW50LCB0eXBlIFZpZXdUb2tlbnNDaGFuZ2VkRXZlbnQsIHR5cGUgVmlld1pvbmVzQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdFdmVudHMuanMnO1xuaW1wb3J0IHR5cGUgeyBWaWV3cG9ydERhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld0xheW91dC92aWV3TGluZXNWaWV3cG9ydERhdGEuanMnO1xuaW1wb3J0IHR5cGUgeyBWaWV3TGluZVJlbmRlcmluZ0RhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsLmpzJztcbmltcG9ydCB0eXBlIHsgVmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdDb250ZXh0LmpzJztcbmltcG9ydCB0eXBlIHsgVmlld0xpbmVPcHRpb25zIH0gZnJvbSAnLi4vLi4vdmlld1BhcnRzL3ZpZXdMaW5lcy92aWV3TGluZU9wdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBJVGV4dHVyZUF0bGFzUGFnZUdseXBoIH0gZnJvbSAnLi4vYXRsYXMvYXRsYXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29udGVudFNlZ21lbnRlciwgdHlwZSBJQ29udGVudFNlZ21lbnRlciB9IGZyb20gJy4uL2NvbnRlbnRTZWdtZW50ZXIuanMnO1xuaW1wb3J0IHsgZnVsbEZpbGVSZW5kZXJTdHJhdGVneVdnc2wgfSBmcm9tICcuL2Z1bGxGaWxlUmVuZGVyU3RyYXRlZ3kud2dzbC5qcyc7XG5pbXBvcnQgeyBCaW5kaW5nSWQgfSBmcm9tICcuLi9ncHUuanMnO1xuaW1wb3J0IHsgR1BVTGlmZWN5Y2xlIH0gZnJvbSAnLi4vZ3B1RGlzcG9zYWJsZS5qcyc7XG5pbXBvcnQgeyBxdWFkVmVydGljZXMgfSBmcm9tICcuLi9ncHVVdGlscy5qcyc7XG5pbXBvcnQgeyBHbHlwaFJhc3Rlcml6ZXIgfSBmcm9tICcuLi9yYXN0ZXIvZ2x5cGhSYXN0ZXJpemVyLmpzJztcbmltcG9ydCB7IFZpZXdHcHVDb250ZXh0IH0gZnJvbSAnLi4vdmlld0dwdUNvbnRleHQuanMnO1xuaW1wb3J0IHsgQmFzZVJlbmRlclN0cmF0ZWd5IH0gZnJvbSAnLi9iYXNlUmVuZGVyU3RyYXRlZ3kuanMnO1xuaW1wb3J0IHsgSW5saW5lRGVjb3JhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvaW5saW5lRGVjb3JhdGlvbnMuanMnO1xuXG5jb25zdCBlbnVtIENvbnN0YW50cyB7XG5cdEluZGljZXNQZXJDZWxsID0gNixcbn1cblxuY29uc3QgZW51bSBDZWxsQnVmZmVySW5mbyB7XG5cdEZsb2F0c1BlckVudHJ5ID0gNixcblx0Qnl0ZXNQZXJFbnRyeSA9IENlbGxCdWZmZXJJbmZvLkZsb2F0c1BlckVudHJ5ICogNCxcblx0T2Zmc2V0X1ggPSAwLFxuXHRPZmZzZXRfWSA9IDEsXG5cdE9mZnNldF9VbnVzZWQxID0gMixcblx0T2Zmc2V0X1VudXNlZDIgPSAzLFxuXHRHbHlwaEluZGV4ID0gNCxcblx0VGV4dHVyZUluZGV4ID0gNSxcbn1cblxudHlwZSBRdWV1ZWRCdWZmZXJFdmVudCA9IChcblx0Vmlld0NvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQgfFxuXHRWaWV3TGluZU1hcHBpbmdDaGFuZ2VkRXZlbnQgfFxuXHRWaWV3TGluZXNEZWxldGVkRXZlbnQgfFxuXHRWaWV3Wm9uZXNDaGFuZ2VkRXZlbnRcbik7XG5cbi8qKlxuICogQSByZW5kZXIgc3RyYXRlZ3kgdGhhdCB0cmFja3MgYSBsYXJnZSBidWZmZXIsIHVwbG9hZGluZyBvbmx5IGRpcnR5IGxpbmVzIGFzIHRoZXkgY2hhbmdlIGFuZFxuICogbGV2ZXJhZ2luZyBoZWF2eSBjYWNoaW5nLiBUaGlzIGlzIHRoZSBtb3N0IHBlcmZvcm1hbnQgc3RyYXRlZ3kgYnV0IGhhcyBsaW1pdGF0aW9ucyBhcm91bmQgbG9uZ1xuICogbGluZXMgYW5kIHRvbyBtYW55IGxpbmVzLlxuICovXG5leHBvcnQgY2xhc3MgRnVsbEZpbGVSZW5kZXJTdHJhdGVneSBleHRlbmRzIEJhc2VSZW5kZXJTdHJhdGVneSB7XG5cblx0LyoqXG5cdCAqIFRoZSBoYXJkIGNhcCBmb3IgbGluZSBjb3VudCB0aGF0IGNhbiBiZSByZW5kZXJlZCBieSB0aGUgR1BVIHJlbmRlcmVyLlxuXHQgKi9cblx0c3RhdGljIHJlYWRvbmx5IG1heFN1cHBvcnRlZExpbmVzID0gMzAwMDtcblxuXHQvKipcblx0ICogVGhlIGhhcmQgY2FwIGZvciBsaW5lIGNvbHVtbnMgdGhhdCBjYW4gYmUgcmVuZGVyZWQgYnkgdGhlIEdQVSByZW5kZXJlci5cblx0ICovXG5cdHN0YXRpYyByZWFkb25seSBtYXhTdXBwb3J0ZWRDb2x1bW5zID0gMjAwO1xuXG5cdHJlYWRvbmx5IHR5cGUgPSAnZnVsbGZpbGUnO1xuXHRyZWFkb25seSB3Z3NsOiBzdHJpbmcgPSBmdWxsRmlsZVJlbmRlclN0cmF0ZWd5V2dzbDtcblxuXHRwcml2YXRlIF9jZWxsQmluZEJ1ZmZlciE6IEdQVUJ1ZmZlcjtcblxuXHQvKipcblx0ICogVGhlIGNlbGwgdmFsdWUgYnVmZmVycywgdGhlc2UgaG9sZCB0aGUgY2VsbHMgYW5kIHRoZWlyIGdseXBocy4gSXQncyBkb3VibGUgYnVmZmVycyBzdWNoIHRoYXRcblx0ICogdGhlIHRocmVhZCBkb2Vzbid0IGJsb2NrIHdoZW4gb25lIGlzIGJlaW5nIHVwbG9hZGVkIHRvIHRoZSBHUFUuXG5cdCAqL1xuXHRwcml2YXRlIF9jZWxsVmFsdWVCdWZmZXJzITogW0FycmF5QnVmZmVyLCBBcnJheUJ1ZmZlcl07XG5cdHByaXZhdGUgX2FjdGl2ZURvdWJsZUJ1ZmZlckluZGV4OiAwIHwgMSA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdXBUb0RhdGVMaW5lczogW1NldDxudW1iZXI+LCBTZXQ8bnVtYmVyPl0gPSBbbmV3IFNldCgpLCBuZXcgU2V0KCldO1xuXHRwcml2YXRlIF92aXNpYmxlT2JqZWN0Q291bnQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX2ZpbmFsUmVuZGVyZWRMaW5lOiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgX3Njcm9sbE9mZnNldEJpbmRCdWZmZXI6IEdQVUJ1ZmZlcjtcblx0cHJpdmF0ZSBfc2Nyb2xsT2Zmc2V0VmFsdWVCdWZmZXI6IEZsb2F0MzJBcnJheTtcblx0cHJpdmF0ZSBfc2Nyb2xsSW5pdGlhbGl6ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9xdWV1ZWRCdWZmZXJVcGRhdGVzOiBbUXVldWVkQnVmZmVyRXZlbnRbXSwgUXVldWVkQnVmZmVyRXZlbnRbXV0gPSBbW10sIFtdXTtcblxuXHRnZXQgYmluZEdyb3VwRW50cmllcygpOiBHUFVCaW5kR3JvdXBFbnRyeVtdIHtcblx0XHRyZXR1cm4gW1xuXHRcdFx0eyBiaW5kaW5nOiBCaW5kaW5nSWQuQ2VsbHMsIHJlc291cmNlOiB7IGJ1ZmZlcjogdGhpcy5fY2VsbEJpbmRCdWZmZXIgfSB9LFxuXHRcdFx0eyBiaW5kaW5nOiBCaW5kaW5nSWQuU2Nyb2xsT2Zmc2V0LCByZXNvdXJjZTogeyBidWZmZXI6IHRoaXMuX3Njcm9sbE9mZnNldEJpbmRCdWZmZXIgfSB9XG5cdFx0XTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRleHQ6IFZpZXdDb250ZXh0LFxuXHRcdHZpZXdHcHVDb250ZXh0OiBWaWV3R3B1Q29udGV4dCxcblx0XHRkZXZpY2U6IEdQVURldmljZSxcblx0XHRnbHlwaFJhc3Rlcml6ZXI6IHsgdmFsdWU6IEdseXBoUmFzdGVyaXplciB9LFxuXHQpIHtcblx0XHRzdXBlcihjb250ZXh0LCB2aWV3R3B1Q29udGV4dCwgZGV2aWNlLCBnbHlwaFJhc3Rlcml6ZXIpO1xuXG5cdFx0Y29uc3QgYnVmZmVyU2l6ZSA9IEZ1bGxGaWxlUmVuZGVyU3RyYXRlZ3kubWF4U3VwcG9ydGVkTGluZXMgKiBGdWxsRmlsZVJlbmRlclN0cmF0ZWd5Lm1heFN1cHBvcnRlZENvbHVtbnMgKiBDb25zdGFudHMuSW5kaWNlc1BlckNlbGwgKiBGbG9hdDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQ7XG5cdFx0dGhpcy5fY2VsbEJpbmRCdWZmZXIgPSB0aGlzLl9yZWdpc3RlcihHUFVMaWZlY3ljbGUuY3JlYXRlQnVmZmVyKHRoaXMuX2RldmljZSwge1xuXHRcdFx0bGFiZWw6ICdNb25hY28gZnVsbCBmaWxlIGNlbGwgYnVmZmVyJyxcblx0XHRcdHNpemU6IGJ1ZmZlclNpemUsXG5cdFx0XHR1c2FnZTogR1BVQnVmZmVyVXNhZ2UuU1RPUkFHRSB8IEdQVUJ1ZmZlclVzYWdlLkNPUFlfRFNULFxuXHRcdH0pKS5vYmplY3Q7XG5cdFx0dGhpcy5fY2VsbFZhbHVlQnVmZmVycyA9IFtcblx0XHRcdG5ldyBBcnJheUJ1ZmZlcihidWZmZXJTaXplKSxcblx0XHRcdG5ldyBBcnJheUJ1ZmZlcihidWZmZXJTaXplKSxcblx0XHRdO1xuXG5cdFx0Y29uc3Qgc2Nyb2xsT2Zmc2V0QnVmZmVyU2l6ZSA9IDI7XG5cdFx0dGhpcy5fc2Nyb2xsT2Zmc2V0QmluZEJ1ZmZlciA9IHRoaXMuX3JlZ2lzdGVyKEdQVUxpZmVjeWNsZS5jcmVhdGVCdWZmZXIodGhpcy5fZGV2aWNlLCB7XG5cdFx0XHRsYWJlbDogJ01vbmFjbyBzY3JvbGwgb2Zmc2V0IGJ1ZmZlcicsXG5cdFx0XHRzaXplOiBzY3JvbGxPZmZzZXRCdWZmZXJTaXplICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5ULFxuXHRcdFx0dXNhZ2U6IEdQVUJ1ZmZlclVzYWdlLlVOSUZPUk0gfCBHUFVCdWZmZXJVc2FnZS5DT1BZX0RTVCxcblx0XHR9KSkub2JqZWN0O1xuXHRcdHRoaXMuX3Njcm9sbE9mZnNldFZhbHVlQnVmZmVyID0gbmV3IEZsb2F0MzJBcnJheShzY3JvbGxPZmZzZXRCdWZmZXJTaXplKTtcblx0fVxuXG5cdC8vICNyZWdpb24gRXZlbnQgaGFuZGxlcnNcblxuXHQvLyBUaGUgcHJpbWFyeSBqb2Igb2YgdGhlc2UgaGFuZGxlcnMgaXMgdG86XG5cdC8vIDEuIEludmFsaWRhdGUgdGhlIHVwIHRvIGRhdGUgbGluZSBjYWNoZSwgd2hpY2ggd2lsbCBjYXVzZSB0aGUgbGluZSB0byBiZSByZS1yZW5kZXJlZCB3aGVuXG5cdC8vICAgIGl0J3MgX3dpdGhpbiB0aGUgdmlld3BvcnRfLlxuXHQvLyAyLiBQYXNzIHJlbGV2YW50IGV2ZW50cyBvbiB0byB0aGUgcmVuZGVyIGZ1bmN0aW9uIHNvIGl0IGNhbiBmb3JjZSBjZXJ0YWluIGxpbmUgcmFuZ2VzIHRvIGJlXG5cdC8vICAgIHJlLXJlbmRlcmVkIGV2ZW4gaWYgdGhleSdyZSBub3QgaW4gdGhlIHZpZXdwb3J0LiBGb3IgZXhhbXBsZSB3aGVuIGEgdmlldyB6b25lIGlzIGFkZGVkLFxuXHQvLyAgICB0aGVyZSBhcmUgbGluZXMgdGhhdCB1c2VkIHRvIGJlIHZpc2libGUgYnV0IGFyZSBubyBsb25nZXIsIHNvIHRob3NlIHJhbmdlcyBtdXN0IGJlXG5cdC8vICAgIGNsZWFyZWQgYW5kIHVwbG9hZGVkIHRvIHRoZSBHUFUuXG5cblx0cHVibGljIG92ZXJyaWRlIG9uQ29uZmlndXJhdGlvbkNoYW5nZWQoZTogVmlld0NvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHR0aGlzLl9pbnZhbGlkYXRlQWxsTGluZXMoKTtcblx0XHR0aGlzLl9xdWV1ZUJ1ZmZlclVwZGF0ZShlKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvbkRlY29yYXRpb25zQ2hhbmdlZChlOiBWaWV3RGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHR0aGlzLl9pbnZhbGlkYXRlQWxsTGluZXMoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvblRva2Vuc0NoYW5nZWQoZTogVmlld1Rva2Vuc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdC8vIFRPRE86IFRoaXMgY3VycmVudGx5IGZpcmVzIGZvciB0aGUgZW50aXJlIHZpZXdwb3J0IHdoZW5ldmVyIHNjcm9sbGluZyBzdG9wc1xuXHRcdC8vICAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMzM5NDJcblx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIGUucmFuZ2VzKSB7XG5cdFx0XHR0aGlzLl9pbnZhbGlkYXRlTGluZVJhbmdlKHJhbmdlLmZyb21MaW5lTnVtYmVyLCByYW5nZS50b0xpbmVOdW1iZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVzRGVsZXRlZChlOiBWaWV3TGluZXNEZWxldGVkRXZlbnQpOiBib29sZWFuIHtcblx0XHQvLyBUT0RPOiBUaGlzIGN1cnJlbnRseSBpbnZhbGlkYXRlcyBldmVyeXRoaW5nIGFmdGVyIHRoZSBkZWxldGVkIGxpbmUsIGl0IGNvdWxkIHNoaWZ0IHRoZVxuXHRcdC8vICAgICAgIGxpbmUgZGF0YSB1cCB0byByZXRhaW4gc29tZSB1cCB0byBkYXRlIGxpbmVzXG5cdFx0Ly8gVE9ETzogVGhpcyBkb2VzIG5vdCBpbnZhbGlkYXRlIGxpbmVzIHRoYXQgYXJlIG5vIGxvbmdlciBpbiB0aGUgZmlsZVxuXHRcdHRoaXMuX2ludmFsaWRhdGVMaW5lc0Zyb20oZS5mcm9tTGluZU51bWJlcik7XG5cdFx0dGhpcy5fcXVldWVCdWZmZXJVcGRhdGUoZSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25MaW5lc0luc2VydGVkKGU6IFZpZXdMaW5lc0luc2VydGVkRXZlbnQpOiBib29sZWFuIHtcblx0XHQvLyBUT0RPOiBUaGlzIGN1cnJlbnRseSBpbnZhbGlkYXRlcyBldmVyeXRoaW5nIGFmdGVyIHRoZSBkZWxldGVkIGxpbmUsIGl0IGNvdWxkIHNoaWZ0IHRoZVxuXHRcdC8vICAgICAgIGxpbmUgZGF0YSB1cCB0byByZXRhaW4gc29tZSB1cCB0byBkYXRlIGxpbmVzXG5cdFx0dGhpcy5faW52YWxpZGF0ZUxpbmVzRnJvbShlLmZyb21MaW5lTnVtYmVyKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVzQ2hhbmdlZChlOiBWaWV3TGluZXNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHR0aGlzLl9pbnZhbGlkYXRlTGluZVJhbmdlKGUuZnJvbUxpbmVOdW1iZXIsIGUuZnJvbUxpbmVOdW1iZXIgKyBlLmNvdW50KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvblNjcm9sbENoYW5nZWQoZT86IFZpZXdTY3JvbGxDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBkcHIgPSBnZXRBY3RpdmVXaW5kb3coKS5kZXZpY2VQaXhlbFJhdGlvO1xuXHRcdHRoaXMuX3Njcm9sbE9mZnNldFZhbHVlQnVmZmVyWzBdID0gKGU/LnNjcm9sbExlZnQgPz8gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldEN1cnJlbnRTY3JvbGxMZWZ0KCkpICogZHByO1xuXHRcdHRoaXMuX3Njcm9sbE9mZnNldFZhbHVlQnVmZmVyWzFdID0gKGU/LnNjcm9sbFRvcCA/PyB0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuZ2V0Q3VycmVudFNjcm9sbFRvcCgpKSAqIGRwcjtcblx0XHR0aGlzLl9kZXZpY2UucXVldWUud3JpdGVCdWZmZXIodGhpcy5fc2Nyb2xsT2Zmc2V0QmluZEJ1ZmZlciwgMCwgdGhpcy5fc2Nyb2xsT2Zmc2V0VmFsdWVCdWZmZXIgYXMgRmxvYXQzMkFycmF5PEFycmF5QnVmZmVyPik7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25UaGVtZUNoYW5nZWQoZTogVmlld1RoZW1lQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0dGhpcy5faW52YWxpZGF0ZUFsbExpbmVzKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25MaW5lTWFwcGluZ0NoYW5nZWQoZTogVmlld0xpbmVNYXBwaW5nQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0dGhpcy5faW52YWxpZGF0ZUFsbExpbmVzKCk7XG5cdFx0dGhpcy5fcXVldWVCdWZmZXJVcGRhdGUoZSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25ab25lc0NoYW5nZWQoZTogVmlld1pvbmVzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0dGhpcy5faW52YWxpZGF0ZUFsbExpbmVzKCk7XG5cdFx0dGhpcy5fcXVldWVCdWZmZXJVcGRhdGUoZSk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHRwcml2YXRlIF9pbnZhbGlkYXRlQWxsTGluZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fdXBUb0RhdGVMaW5lc1swXS5jbGVhcigpO1xuXHRcdHRoaXMuX3VwVG9EYXRlTGluZXNbMV0uY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX2ludmFsaWRhdGVMaW5lc0Zyb20obGluZU51bWJlcjogbnVtYmVyKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBpIG9mIFswLCAxXSkge1xuXHRcdFx0Y29uc3QgdXBUb0RhdGVMaW5lcyA9IHRoaXMuX3VwVG9EYXRlTGluZXNbaV07XG5cdFx0XHRmb3IgKGNvbnN0IHVwVG9EYXRlTGluZSBvZiB1cFRvRGF0ZUxpbmVzKSB7XG5cdFx0XHRcdGlmICh1cFRvRGF0ZUxpbmUgPj0gbGluZU51bWJlcikge1xuXHRcdFx0XHRcdHVwVG9EYXRlTGluZXMuZGVsZXRlKHVwVG9EYXRlTGluZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pbnZhbGlkYXRlTGluZVJhbmdlKGZyb21MaW5lTnVtYmVyOiBudW1iZXIsIHRvTGluZU51bWJlcjogbnVtYmVyKTogdm9pZCB7XG5cdFx0Zm9yIChsZXQgaSA9IGZyb21MaW5lTnVtYmVyOyBpIDw9IHRvTGluZU51bWJlcjsgaSsrKSB7XG5cdFx0XHR0aGlzLl91cFRvRGF0ZUxpbmVzWzBdLmRlbGV0ZShpKTtcblx0XHRcdHRoaXMuX3VwVG9EYXRlTGluZXNbMV0uZGVsZXRlKGkpO1xuXHRcdH1cblx0fVxuXG5cdHJlc2V0KCkge1xuXHRcdHRoaXMuX2ludmFsaWRhdGVBbGxMaW5lcygpO1xuXHRcdGZvciAoY29uc3QgYnVmZmVySW5kZXggb2YgWzAsIDFdKSB7XG5cdFx0XHQvLyBaZXJvIG91dCBidWZmZXIgYW5kIHVwbG9hZCB0byBHUFUgdG8gcHJldmVudCBzdGFsZSByb3dzIGZyb20gcmVuZGVyaW5nXG5cdFx0XHRjb25zdCBidWZmZXIgPSBuZXcgRmxvYXQzMkFycmF5KHRoaXMuX2NlbGxWYWx1ZUJ1ZmZlcnNbYnVmZmVySW5kZXhdKTtcblx0XHRcdGJ1ZmZlci5maWxsKDAsIDAsIGJ1ZmZlci5sZW5ndGgpO1xuXHRcdFx0dGhpcy5fZGV2aWNlLnF1ZXVlLndyaXRlQnVmZmVyKHRoaXMuX2NlbGxCaW5kQnVmZmVyLCAwLCBidWZmZXIuYnVmZmVyLCAwLCBidWZmZXIuYnl0ZUxlbmd0aCk7XG5cdFx0fVxuXHRcdHRoaXMuX2ZpbmFsUmVuZGVyZWRMaW5lID0gMDtcblx0fVxuXG5cdHVwZGF0ZSh2aWV3cG9ydERhdGE6IFZpZXdwb3J0RGF0YSwgdmlld0xpbmVPcHRpb25zOiBWaWV3TGluZU9wdGlvbnMpOiBudW1iZXIge1xuXHRcdC8vIElNUE9SVEFOVDogVGhpcyBpcyBhIGhvdCBmdW5jdGlvbi4gVmFyaWFibGVzIGFyZSBwcmUtYWxsb2NhdGVkIGFuZCBzaGFyZWQgd2l0aGluIHRoZVxuXHRcdC8vIGxvb3AuIFRoaXMgaXMgZG9uZSBzbyB3ZSBkb24ndCBuZWVkIHRvIHRydXN0IHRoZSBKSVQgY29tcGlsZXIgdG8gZG8gdGhpcyBvcHRpbWl6YXRpb24gdG9cblx0XHQvLyBhdm9pZCBwb3RlbnRpYWwgYWRkaXRpb25hbCBibG9ja2luZyB0aW1lIGluIGdhcmJhZ2UgY29sbGVjdG9yIHdoaWNoIGlzIGEgY29tbW9uIGNhdXNlIG9mXG5cdFx0Ly8gZHJvcHBlZCBmcmFtZXMuXG5cblx0XHRsZXQgY2hhcnMgPSAnJztcblx0XHRsZXQgc2VnbWVudDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjaGFyV2lkdGggPSAwO1xuXHRcdGxldCB5ID0gMDtcblx0XHRsZXQgeCA9IDA7XG5cdFx0bGV0IGFic29sdXRlT2Zmc2V0WCA9IDA7XG5cdFx0bGV0IGFic29sdXRlT2Zmc2V0WSA9IDA7XG5cdFx0bGV0IHRhYlhPZmZzZXQgPSAwO1xuXHRcdGxldCBnbHlwaDogUmVhZG9ubHk8SVRleHR1cmVBdGxhc1BhZ2VHbHlwaD47XG5cdFx0bGV0IGNlbGxJbmRleCA9IDA7XG5cblx0XHRsZXQgdG9rZW5TdGFydEluZGV4ID0gMDtcblx0XHRsZXQgdG9rZW5FbmRJbmRleCA9IDA7XG5cdFx0bGV0IHRva2VuTWV0YWRhdGEgPSAwO1xuXG5cdFx0bGV0IGRlY29yYXRpb25TdHlsZVNldEJvbGQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGRlY29yYXRpb25TdHlsZVNldENvbG9yOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGRlY29yYXRpb25TdHlsZVNldE9wYWNpdHk6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaFRoaWNrbmVzczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBkZWNvcmF0aW9uU3R5bGVTZXRTdHJpa2V0aHJvdWdoQ29sb3I6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRcdGxldCBsaW5lRGF0YTogVmlld0xpbmVSZW5kZXJpbmdEYXRhO1xuXHRcdGxldCBkZWNvcmF0aW9uOiBJbmxpbmVEZWNvcmF0aW9uO1xuXHRcdGxldCBmaWxsU3RhcnRJbmRleCA9IDA7XG5cdFx0bGV0IGZpbGxFbmRJbmRleCA9IDA7XG5cblx0XHRsZXQgdG9rZW5zOiBJVmlld0xpbmVUb2tlbnM7XG5cblx0XHRjb25zdCBkcHIgPSBnZXRBY3RpdmVXaW5kb3coKS5kZXZpY2VQaXhlbFJhdGlvO1xuXHRcdGxldCBjb250ZW50U2VnbWVudGVyOiBJQ29udGVudFNlZ21lbnRlcjtcblxuXHRcdGlmICghdGhpcy5fc2Nyb2xsSW5pdGlhbGl6ZWQpIHtcblx0XHRcdHRoaXMub25TY3JvbGxDaGFuZ2VkKCk7XG5cdFx0XHR0aGlzLl9zY3JvbGxJbml0aWFsaXplZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGNlbGwgZGF0YVxuXHRcdGNvbnN0IGNlbGxCdWZmZXIgPSBuZXcgRmxvYXQzMkFycmF5KHRoaXMuX2NlbGxWYWx1ZUJ1ZmZlcnNbdGhpcy5fYWN0aXZlRG91YmxlQnVmZmVySW5kZXhdKTtcblx0XHRjb25zdCBsaW5lSW5kZXhDb3VudCA9IEZ1bGxGaWxlUmVuZGVyU3RyYXRlZ3kubWF4U3VwcG9ydGVkQ29sdW1ucyAqIENvbnN0YW50cy5JbmRpY2VzUGVyQ2VsbDtcblxuXHRcdGNvbnN0IHVwVG9EYXRlTGluZXMgPSB0aGlzLl91cFRvRGF0ZUxpbmVzW3RoaXMuX2FjdGl2ZURvdWJsZUJ1ZmZlckluZGV4XTtcblx0XHRsZXQgZGlydHlMaW5lU3RhcnQgPSAzMDAwO1xuXHRcdGxldCBkaXJ0eUxpbmVFbmQgPSAwO1xuXG5cdFx0Ly8gSGFuZGxlIGFueSBxdWV1ZWQgYnVmZmVyIHVwZGF0ZXNcblx0XHRjb25zdCBxdWV1ZWRCdWZmZXJVcGRhdGVzID0gdGhpcy5fcXVldWVkQnVmZmVyVXBkYXRlc1t0aGlzLl9hY3RpdmVEb3VibGVCdWZmZXJJbmRleF07XG5cdFx0d2hpbGUgKHF1ZXVlZEJ1ZmZlclVwZGF0ZXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBlID0gcXVldWVkQnVmZmVyVXBkYXRlcy5zaGlmdCgpITtcblx0XHRcdHN3aXRjaCAoZS50eXBlKSB7XG5cdFx0XHRcdC8vIFRPRE86IFJlZmluZSB0aGVzZSBjYXNlcyBzbyB3ZSdyZSBub3QgdGhyb3dpbmcgYXdheSBldmVyeXRoaW5nXG5cdFx0XHRcdGNhc2UgVmlld0V2ZW50VHlwZS5WaWV3Q29uZmlndXJhdGlvbkNoYW5nZWQ6XG5cdFx0XHRcdGNhc2UgVmlld0V2ZW50VHlwZS5WaWV3TGluZU1hcHBpbmdDaGFuZ2VkOlxuXHRcdFx0XHRjYXNlIFZpZXdFdmVudFR5cGUuVmlld1pvbmVzQ2hhbmdlZDoge1xuXHRcdFx0XHRcdGNlbGxCdWZmZXIuZmlsbCgwKTtcblxuXHRcdFx0XHRcdGRpcnR5TGluZVN0YXJ0ID0gMTtcblx0XHRcdFx0XHRkaXJ0eUxpbmVFbmQgPSBNYXRoLm1heChkaXJ0eUxpbmVFbmQsIHRoaXMuX2ZpbmFsUmVuZGVyZWRMaW5lKTtcblx0XHRcdFx0XHR0aGlzLl9maW5hbFJlbmRlcmVkTGluZSA9IDA7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBWaWV3RXZlbnRUeXBlLlZpZXdMaW5lc0RlbGV0ZWQ6IHtcblx0XHRcdFx0XHQvLyBTaGlmdCBjb250ZW50IGJlbG93IGRlbGV0ZWQgbGluZSB1cFxuXHRcdFx0XHRcdGNvbnN0IGRlbGV0ZWRMaW5lQ29udGVudFN0YXJ0SW5kZXggPSAoZS5mcm9tTGluZU51bWJlciAtIDEpICogRnVsbEZpbGVSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRDb2x1bW5zICogQ29uc3RhbnRzLkluZGljZXNQZXJDZWxsO1xuXHRcdFx0XHRcdGNvbnN0IGRlbGV0ZWRMaW5lQ29udGVudEVuZEluZGV4ID0gKGUudG9MaW5lTnVtYmVyKSAqIEZ1bGxGaWxlUmVuZGVyU3RyYXRlZ3kubWF4U3VwcG9ydGVkQ29sdW1ucyAqIENvbnN0YW50cy5JbmRpY2VzUGVyQ2VsbDtcblx0XHRcdFx0XHRjb25zdCBudWxsQ29udGVudFN0YXJ0SW5kZXggPSAodGhpcy5fZmluYWxSZW5kZXJlZExpbmUgLSAoZS50b0xpbmVOdW1iZXIgLSBlLmZyb21MaW5lTnVtYmVyICsgMSkpICogRnVsbEZpbGVSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRDb2x1bW5zICogQ29uc3RhbnRzLkluZGljZXNQZXJDZWxsO1xuXHRcdFx0XHRcdGNlbGxCdWZmZXIuc2V0KGNlbGxCdWZmZXIuc3ViYXJyYXkoZGVsZXRlZExpbmVDb250ZW50RW5kSW5kZXgpLCBkZWxldGVkTGluZUNvbnRlbnRTdGFydEluZGV4KTtcblxuXHRcdFx0XHRcdC8vIFplcm8gb3V0IGNvbnRlbnQgb24gbGluZXMgdGhhdCBhcmUgbm8gbG9uZ2VyIHZhbGlkXG5cdFx0XHRcdFx0Y2VsbEJ1ZmZlci5maWxsKDAsIG51bGxDb250ZW50U3RhcnRJbmRleCk7XG5cblx0XHRcdFx0XHQvLyBVcGRhdGUgZGlydHkgbGluZXMgYW5kIGZpbmFsIHJlbmRlcmVkIGxpbmVcblx0XHRcdFx0XHRkaXJ0eUxpbmVTdGFydCA9IE1hdGgubWluKGRpcnR5TGluZVN0YXJ0LCBlLmZyb21MaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRkaXJ0eUxpbmVFbmQgPSBNYXRoLm1heChkaXJ0eUxpbmVFbmQsIHRoaXMuX2ZpbmFsUmVuZGVyZWRMaW5lKTtcblx0XHRcdFx0XHR0aGlzLl9maW5hbFJlbmRlcmVkTGluZSAtPSBlLnRvTGluZU51bWJlciAtIGUuZnJvbUxpbmVOdW1iZXIgKyAxO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yICh5ID0gdmlld3BvcnREYXRhLnN0YXJ0TGluZU51bWJlcjsgeSA8PSB2aWV3cG9ydERhdGEuZW5kTGluZU51bWJlcjsgeSsrKSB7XG5cblx0XHRcdC8vIE9ubHkgYXR0ZW1wdCB0byByZW5kZXIgbGluZXMgdGhhdCB0aGUgR1BVIHJlbmRlcmVyIGNhbiBoYW5kbGVcblx0XHRcdGlmICghdGhpcy5fdmlld0dwdUNvbnRleHQuY2FuUmVuZGVyKHZpZXdMaW5lT3B0aW9ucywgdmlld3BvcnREYXRhLCB5KSkge1xuXHRcdFx0XHRmaWxsU3RhcnRJbmRleCA9ICgoeSAtIDEpICogRnVsbEZpbGVSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRDb2x1bW5zKSAqIENvbnN0YW50cy5JbmRpY2VzUGVyQ2VsbDtcblx0XHRcdFx0ZmlsbEVuZEluZGV4ID0gKHkgKiBGdWxsRmlsZVJlbmRlclN0cmF0ZWd5Lm1heFN1cHBvcnRlZENvbHVtbnMpICogQ29uc3RhbnRzLkluZGljZXNQZXJDZWxsO1xuXHRcdFx0XHRjZWxsQnVmZmVyLmZpbGwoMCwgZmlsbFN0YXJ0SW5kZXgsIGZpbGxFbmRJbmRleCk7XG5cblx0XHRcdFx0ZGlydHlMaW5lU3RhcnQgPSBNYXRoLm1pbihkaXJ0eUxpbmVTdGFydCwgeSk7XG5cdFx0XHRcdGRpcnR5TGluZUVuZCA9IE1hdGgubWF4KGRpcnR5TGluZUVuZCwgeSk7XG5cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNraXAgdXBkYXRpbmcgdGhlIGxpbmUgaWYgaXQncyBhbHJlYWR5IHVwIHRvIGRhdGVcblx0XHRcdGlmICh1cFRvRGF0ZUxpbmVzLmhhcyh5KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0ZGlydHlMaW5lU3RhcnQgPSBNYXRoLm1pbihkaXJ0eUxpbmVTdGFydCwgeSk7XG5cdFx0XHRkaXJ0eUxpbmVFbmQgPSBNYXRoLm1heChkaXJ0eUxpbmVFbmQsIHkpO1xuXG5cdFx0XHRsaW5lRGF0YSA9IHZpZXdwb3J0RGF0YS5nZXRWaWV3TGluZVJlbmRlcmluZ0RhdGEoeSk7XG5cdFx0XHR0YWJYT2Zmc2V0ID0gMDtcblxuXHRcdFx0Y29udGVudFNlZ21lbnRlciA9IGNyZWF0ZUNvbnRlbnRTZWdtZW50ZXIobGluZURhdGEsIHZpZXdMaW5lT3B0aW9ucyk7XG5cdFx0XHRjaGFyV2lkdGggPSB2aWV3TGluZU9wdGlvbnMuc3BhY2VXaWR0aCAqIGRwcjtcblx0XHRcdGFic29sdXRlT2Zmc2V0WCA9IChsaW5lRGF0YS5taW5Db2x1bW4gLSAxKSAqIGNoYXJXaWR0aDtcblxuXHRcdFx0dG9rZW5zID0gbGluZURhdGEudG9rZW5zO1xuXHRcdFx0dG9rZW5TdGFydEluZGV4ID0gbGluZURhdGEubWluQ29sdW1uIC0gMTtcblx0XHRcdHRva2VuRW5kSW5kZXggPSAwO1xuXHRcdFx0Zm9yIChsZXQgdG9rZW5JbmRleCA9IDAsIHRva2Vuc0xlbiA9IHRva2Vucy5nZXRDb3VudCgpOyB0b2tlbkluZGV4IDwgdG9rZW5zTGVuOyB0b2tlbkluZGV4KyspIHtcblx0XHRcdFx0dG9rZW5FbmRJbmRleCA9IHRva2Vucy5nZXRFbmRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0XHRcdGlmICh0b2tlbkVuZEluZGV4IDw9IHRva2VuU3RhcnRJbmRleCkge1xuXHRcdFx0XHRcdC8vIFRoZSBmYXV4IGluZGVudCBwYXJ0IG9mIHRoZSBsaW5lIHNob3VsZCBoYXZlIG5vIHRva2VuIHR5cGVcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRva2VuTWV0YWRhdGEgPSB0b2tlbnMuZ2V0TWV0YWRhdGEodG9rZW5JbmRleCk7XG5cblx0XHRcdFx0Zm9yICh4ID0gdG9rZW5TdGFydEluZGV4OyB4IDwgdG9rZW5FbmRJbmRleDsgeCsrKSB7XG5cdFx0XHRcdFx0Ly8gT25seSByZW5kZXIgbGluZXMgdGhhdCBkbyBub3QgZXhjZWVkIG1heGltdW0gY29sdW1uc1xuXHRcdFx0XHRcdGlmICh4ID4gRnVsbEZpbGVSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRDb2x1bW5zKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c2VnbWVudCA9IGNvbnRlbnRTZWdtZW50ZXIuZ2V0U2VnbWVudEF0SW5kZXgoeCk7XG5cdFx0XHRcdFx0aWYgKHNlZ21lbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNoYXJzID0gc2VnbWVudDtcblxuXHRcdFx0XHRcdGlmICghKGxpbmVEYXRhLmlzQmFzaWNBU0NJSSAmJiB2aWV3TGluZU9wdGlvbnMudXNlTW9ub3NwYWNlT3B0aW1pemF0aW9ucykpIHtcblx0XHRcdFx0XHRcdGNoYXJXaWR0aCA9IHRoaXMuZ2x5cGhSYXN0ZXJpemVyLmdldFRleHRNZXRyaWNzKGNoYXJzKS53aWR0aDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRkZWNvcmF0aW9uU3R5bGVTZXRDb2xvciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRkZWNvcmF0aW9uU3R5bGVTZXRCb2xkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGRlY29yYXRpb25TdHlsZVNldE9wYWNpdHkgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0ZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRkZWNvcmF0aW9uU3R5bGVTZXRTdHJpa2V0aHJvdWdoVGhpY2tuZXNzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGRlY29yYXRpb25TdHlsZVNldFN0cmlrZXRocm91Z2hDb2xvciA9IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRcdC8vIEFwcGx5IHN1cHBvcnRlZCBpbmxpbmUgZGVjb3JhdGlvbiBzdHlsZXMgdG8gdGhlIGNlbGwgbWV0YWRhdGFcblx0XHRcdFx0XHRmb3IgKGRlY29yYXRpb24gb2YgbGluZURhdGEuaW5saW5lRGVjb3JhdGlvbnMpIHtcblx0XHRcdFx0XHRcdC8vIFRoaXMgaXMgUmFuZ2Uuc3RyaWN0Q29udGFpbnNQb3NpdGlvbiBleGNlcHQgaXQgd29ya3MgYXQgdGhlIGNlbGwgbGV2ZWwsXG5cdFx0XHRcdFx0XHQvLyBpdCdzIGFsc28gaW5saW5lZCB0byBhdm9pZCBvdmVyaGVhZC5cblx0XHRcdFx0XHRcdGlmIChcblx0XHRcdFx0XHRcdFx0KHkgPCBkZWNvcmF0aW9uLnJhbmdlLnN0YXJ0TGluZU51bWJlciB8fCB5ID4gZGVjb3JhdGlvbi5yYW5nZS5lbmRMaW5lTnVtYmVyKSB8fFxuXHRcdFx0XHRcdFx0XHQoeSA9PT0gZGVjb3JhdGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXIgJiYgeCA8IGRlY29yYXRpb24ucmFuZ2Uuc3RhcnRDb2x1bW4gLSAxKSB8fFxuXHRcdFx0XHRcdFx0XHQoeSA9PT0gZGVjb3JhdGlvbi5yYW5nZS5lbmRMaW5lTnVtYmVyICYmIHggPj0gZGVjb3JhdGlvbi5yYW5nZS5lbmRDb2x1bW4gLSAxKVxuXHRcdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCBydWxlcyA9IFZpZXdHcHVDb250ZXh0LmRlY29yYXRpb25Dc3NSdWxlRXh0cmFjdG9yLmdldFN0eWxlUnVsZXModGhpcy5fdmlld0dwdUNvbnRleHQuY2FudmFzLmRvbU5vZGUsIGRlY29yYXRpb24uaW5saW5lQ2xhc3NOYW1lKTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgcnVsZSBvZiBydWxlcykge1xuXHRcdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHIgb2YgcnVsZS5zdHlsZSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gcnVsZS5zdHlsZU1hcC5nZXQocik/LnRvU3RyaW5nKCkgPz8gJyc7XG5cdFx0XHRcdFx0XHRcdFx0c3dpdGNoIChyKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjYXNlICdjb2xvcic6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gVE9ETzogVGhpcyBwYXJzaW5nIGFuZCBlcnJvciBoYW5kbGluZyBzaG91bGQgbW92ZSBpbnRvIGNhblJlbmRlciBzbyBmYWxsYmFja1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQvLyAgICAgICB0byBET00gd29ya3Ncblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgcGFyc2VkQ29sb3IgPSBDb2xvci5Gb3JtYXQuQ1NTLnBhcnNlKHZhbHVlKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKCFwYXJzZWRDb2xvcikge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0ludmFsaWQgY29sb3IgZm9ybWF0ICcgKyB2YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVjb3JhdGlvblN0eWxlU2V0Q29sb3IgPSBwYXJzZWRDb2xvci50b051bWJlcjMyQml0KCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0Y2FzZSAnZm9udC13ZWlnaHQnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHBhcnNlZFZhbHVlID0gcGFyc2VDc3NGb250V2VpZ2h0KHZhbHVlKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKHBhcnNlZFZhbHVlID49IDQwMCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlY29yYXRpb25TdHlsZVNldEJvbGQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdC8vIFRPRE86IFNldCBib2xkIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjM3NTg0KVxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlY29yYXRpb25TdHlsZVNldEJvbGQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQvLyBUT0RPOiBTZXQgbm9ybWFsIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjM3NTg0KVxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0Y2FzZSAnb3BhY2l0eSc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgcGFyc2VkVmFsdWUgPSBwYXJzZUNzc09wYWNpdHkodmFsdWUpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZWNvcmF0aW9uU3R5bGVTZXRPcGFjaXR5ID0gcGFyc2VkVmFsdWU7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0Y2FzZSAndGV4dC1kZWNvcmF0aW9uJzpcblx0XHRcdFx0XHRcdFx0XHRcdGNhc2UgJ3RleHQtZGVjb3JhdGlvbi1saW5lJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAodmFsdWUgPT09ICdsaW5lLXRocm91Z2gnKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRjYXNlICd0ZXh0LWRlY29yYXRpb24tdGhpY2tuZXNzJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBtYXRjaCA9IHZhbHVlLm1hdGNoKC9eKFxcZCsoPzpcXC5cXGQrKT8pcHgkLyk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmIChtYXRjaCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGRlY29yYXRpb25TdHlsZVNldFN0cmlrZXRocm91Z2hUaGlja25lc3MgPSBwYXJzZUZsb2F0KG1hdGNoWzFdKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdGNhc2UgJ3RleHQtZGVjb3JhdGlvbi1jb2xvcic6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bGV0IGNvbG9yVmFsdWUgPSB2YWx1ZTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgdmFyTWF0Y2ggPSB2YWx1ZS5tYXRjaCgvXnZhclxcKCgtLVteLF0rKSxcXHMqKD86aW5pdGlhbHxpbmhlcml0KVxcKSQvKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKHZhck1hdGNoKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y29sb3JWYWx1ZSA9IFZpZXdHcHVDb250ZXh0LmRlY29yYXRpb25Dc3NSdWxlRXh0cmFjdG9yLnJlc29sdmVDc3NWYXJpYWJsZSh0aGlzLl92aWV3R3B1Q29udGV4dC5jYW52YXMuZG9tTm9kZSwgdmFyTWF0Y2hbMV0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHBhcnNlZENvbG9yID0gQ29sb3IuRm9ybWF0LkNTUy5wYXJzZShjb2xvclZhbHVlKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKHBhcnNlZENvbG9yKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaENvbG9yID0gcGFyc2VkQ29sb3IudG9OdW1iZXIzMkJpdCgpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0Y2FzZSAndGV4dC1kZWNvcmF0aW9uLXN0eWxlJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQvLyBUaGVzZSBhcmUgdmFsaWRhdGVkIGluIGNhblJlbmRlciBhbmQgdXNlIGRlZmF1bHQgYmVoYXZpb3Jcblx0XHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiB0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdVbmV4cGVjdGVkIGlubGluZSBkZWNvcmF0aW9uIHN0eWxlJyk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGNoYXJzID09PSAnICcgfHwgY2hhcnMgPT09ICdcXHQnKSB7XG5cdFx0XHRcdFx0XHQvLyBaZXJvIG91dCBnbHlwaCB0byBlbnN1cmUgaXQgZG9lc24ndCBnZXQgcmVuZGVyZWRcblx0XHRcdFx0XHRcdGNlbGxJbmRleCA9ICgoeSAtIDEpICogRnVsbEZpbGVSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRDb2x1bW5zICsgeCkgKiBDb25zdGFudHMuSW5kaWNlc1BlckNlbGw7XG5cdFx0XHRcdFx0XHRjZWxsQnVmZmVyLmZpbGwoMCwgY2VsbEluZGV4LCBjZWxsSW5kZXggKyBDZWxsQnVmZmVySW5mby5GbG9hdHNQZXJFbnRyeSk7XG5cdFx0XHRcdFx0XHQvLyBBZGp1c3QgeE9mZnNldCBmb3IgdGFiIHN0b3BzXG5cdFx0XHRcdFx0XHRpZiAoY2hhcnMgPT09ICdcXHQnKSB7XG5cdFx0XHRcdFx0XHRcdC8vIEZpbmQgdGhlIHBpeGVsIG9mZnNldCBiZXR3ZWVuIHRoZSBjdXJyZW50IHBvc2l0aW9uIGFuZCB0aGUgbmV4dCB0YWIgc3RvcFxuXHRcdFx0XHRcdFx0XHRjb25zdCBvZmZzZXRCZWZvcmUgPSB4ICsgdGFiWE9mZnNldDtcblx0XHRcdFx0XHRcdFx0dGFiWE9mZnNldCA9IEN1cnNvckNvbHVtbnMubmV4dFJlbmRlclRhYlN0b3AoeCArIHRhYlhPZmZzZXQsIGxpbmVEYXRhLnRhYlNpemUpO1xuXHRcdFx0XHRcdFx0XHRhYnNvbHV0ZU9mZnNldFggKz0gY2hhcldpZHRoICogKHRhYlhPZmZzZXQgLSBvZmZzZXRCZWZvcmUpO1xuXHRcdFx0XHRcdFx0XHQvLyBDb252ZXJ0IGJhY2sgdG8gb2Zmc2V0IGV4Y2x1ZGluZyB4IGFuZCB0aGUgY3VycmVudCBjaGFyYWN0ZXJcblx0XHRcdFx0XHRcdFx0dGFiWE9mZnNldCAtPSB4ICsgMTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGFic29sdXRlT2Zmc2V0WCArPSBjaGFyV2lkdGg7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBkZWNvcmF0aW9uU3R5bGVTZXRJZCA9IFZpZXdHcHVDb250ZXh0LmRlY29yYXRpb25TdHlsZUNhY2hlLmdldE9yQ3JlYXRlRW50cnkoZGVjb3JhdGlvblN0eWxlU2V0Q29sb3IsIGRlY29yYXRpb25TdHlsZVNldEJvbGQsIGRlY29yYXRpb25TdHlsZVNldE9wYWNpdHksIGRlY29yYXRpb25TdHlsZVNldFN0cmlrZXRocm91Z2gsIGRlY29yYXRpb25TdHlsZVNldFN0cmlrZXRocm91Z2hUaGlja25lc3MsIGRlY29yYXRpb25TdHlsZVNldFN0cmlrZXRocm91Z2hDb2xvcik7XG5cdFx0XHRcdFx0Z2x5cGggPSB0aGlzLl92aWV3R3B1Q29udGV4dC5hdGxhcy5nZXRHbHlwaCh0aGlzLmdseXBoUmFzdGVyaXplciwgY2hhcnMsIHRva2VuTWV0YWRhdGEsIGRlY29yYXRpb25TdHlsZVNldElkLCBhYnNvbHV0ZU9mZnNldFgpO1xuXG5cdFx0XHRcdFx0YWJzb2x1dGVPZmZzZXRZID0gTWF0aC5yb3VuZChcblx0XHRcdFx0XHRcdC8vIFRvcCBvZiBsYXlvdXQgYm94IChpbmNsdWRlcyBsaW5lIGhlaWdodClcblx0XHRcdFx0XHRcdHZpZXdwb3J0RGF0YS5yZWxhdGl2ZVZlcnRpY2FsT2Zmc2V0W3kgLSB2aWV3cG9ydERhdGEuc3RhcnRMaW5lTnVtYmVyXSAqIGRwciArXG5cblx0XHRcdFx0XHRcdC8vIERlbHRhIGZyb20gdG9wIG9mIGxheW91dCBib3ggKGluY2x1ZGVzIGxpbmUgaGVpZ2h0KSB0byB0b3Agb2YgdGhlIGlubGluZSBib3ggKG5vIGxpbmUgaGVpZ2h0KVxuXHRcdFx0XHRcdFx0TWF0aC5mbG9vcigodmlld3BvcnREYXRhLmxpbmVIZWlnaHQgKiBkcHIgLSAoZ2x5cGguZm9udEJvdW5kaW5nQm94QXNjZW50ICsgZ2x5cGguZm9udEJvdW5kaW5nQm94RGVzY2VudCkpIC8gMikgK1xuXG5cdFx0XHRcdFx0XHQvLyBEZWx0YSBmcm9tIHRvcCBvZiBpbmxpbmUgYm94IChubyBsaW5lIGhlaWdodCkgdG8gdG9wIG9mIGdseXBoIG9yaWdpbi4gSWYgdGhlIGdseXBoIHdhcyBkcmF3blxuXHRcdFx0XHRcdFx0Ly8gd2l0aCBhIHRvcCBiYXNlbGluZSBmb3IgZXhhbXBsZSwgdGhpcyBlbmRzIHVwIGRyYXdpbmcgdGhlIGdseXBoIGNvcnJlY3RseSB1c2luZyB0aGUgYWxwaGFiZXRpY2FsXG5cdFx0XHRcdFx0XHQvLyBiYXNlbGluZS5cblx0XHRcdFx0XHRcdGdseXBoLmZvbnRCb3VuZGluZ0JveEFzY2VudFxuXHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHRjZWxsSW5kZXggPSAoKHkgLSAxKSAqIEZ1bGxGaWxlUmVuZGVyU3RyYXRlZ3kubWF4U3VwcG9ydGVkQ29sdW1ucyArIHgpICogQ29uc3RhbnRzLkluZGljZXNQZXJDZWxsO1xuXHRcdFx0XHRcdGNlbGxCdWZmZXJbY2VsbEluZGV4ICsgQ2VsbEJ1ZmZlckluZm8uT2Zmc2V0X1hdID0gTWF0aC5mbG9vcihhYnNvbHV0ZU9mZnNldFgpO1xuXHRcdFx0XHRcdGNlbGxCdWZmZXJbY2VsbEluZGV4ICsgQ2VsbEJ1ZmZlckluZm8uT2Zmc2V0X1ldID0gYWJzb2x1dGVPZmZzZXRZO1xuXHRcdFx0XHRcdGNlbGxCdWZmZXJbY2VsbEluZGV4ICsgQ2VsbEJ1ZmZlckluZm8uR2x5cGhJbmRleF0gPSBnbHlwaC5nbHlwaEluZGV4O1xuXHRcdFx0XHRcdGNlbGxCdWZmZXJbY2VsbEluZGV4ICsgQ2VsbEJ1ZmZlckluZm8uVGV4dHVyZUluZGV4XSA9IGdseXBoLnBhZ2VJbmRleDtcblxuXHRcdFx0XHRcdC8vIEFkanVzdCB0aGUgeCBwaXhlbCBvZmZzZXQgZm9yIHRoZSBuZXh0IGNoYXJhY3RlclxuXHRcdFx0XHRcdGFic29sdXRlT2Zmc2V0WCArPSBjaGFyV2lkdGg7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0b2tlblN0YXJ0SW5kZXggPSB0b2tlbkVuZEluZGV4O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDbGVhciB0byBlbmQgb2YgbGluZVxuXHRcdFx0ZmlsbFN0YXJ0SW5kZXggPSAoKHkgLSAxKSAqIEZ1bGxGaWxlUmVuZGVyU3RyYXRlZ3kubWF4U3VwcG9ydGVkQ29sdW1ucyArIHRva2VuRW5kSW5kZXgpICogQ29uc3RhbnRzLkluZGljZXNQZXJDZWxsO1xuXHRcdFx0ZmlsbEVuZEluZGV4ID0gKHkgKiBGdWxsRmlsZVJlbmRlclN0cmF0ZWd5Lm1heFN1cHBvcnRlZENvbHVtbnMpICogQ29uc3RhbnRzLkluZGljZXNQZXJDZWxsO1xuXHRcdFx0Y2VsbEJ1ZmZlci5maWxsKDAsIGZpbGxTdGFydEluZGV4LCBmaWxsRW5kSW5kZXgpO1xuXG5cdFx0XHR1cFRvRGF0ZUxpbmVzLmFkZCh5KTtcblx0XHR9XG5cblx0XHRjb25zdCB2aXNpYmxlT2JqZWN0Q291bnQgPSAodmlld3BvcnREYXRhLmVuZExpbmVOdW1iZXIgLSB2aWV3cG9ydERhdGEuc3RhcnRMaW5lTnVtYmVyICsgMSkgKiBsaW5lSW5kZXhDb3VudDtcblxuXHRcdC8vIE9ubHkgd3JpdGUgd2hlbiB0aGVyZSBpcyBjaGFuZ2VkIGRhdGFcblx0XHRkaXJ0eUxpbmVTdGFydCA9IE1hdGgubWluKGRpcnR5TGluZVN0YXJ0LCBGdWxsRmlsZVJlbmRlclN0cmF0ZWd5Lm1heFN1cHBvcnRlZExpbmVzKTtcblx0XHRkaXJ0eUxpbmVFbmQgPSBNYXRoLm1pbihkaXJ0eUxpbmVFbmQsIEZ1bGxGaWxlUmVuZGVyU3RyYXRlZ3kubWF4U3VwcG9ydGVkTGluZXMpO1xuXHRcdGlmIChkaXJ0eUxpbmVTdGFydCA8PSBkaXJ0eUxpbmVFbmQpIHtcblx0XHRcdC8vIFdyaXRlIGJ1ZmZlciBhbmQgc3dhcCBpdCBvdXQgdG8gdW5ibG9jayB3cml0ZXNcblx0XHRcdHRoaXMuX2RldmljZS5xdWV1ZS53cml0ZUJ1ZmZlcihcblx0XHRcdFx0dGhpcy5fY2VsbEJpbmRCdWZmZXIsXG5cdFx0XHRcdChkaXJ0eUxpbmVTdGFydCAtIDEpICogbGluZUluZGV4Q291bnQgKiBGbG9hdDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQsXG5cdFx0XHRcdGNlbGxCdWZmZXIuYnVmZmVyLFxuXHRcdFx0XHQoZGlydHlMaW5lU3RhcnQgLSAxKSAqIGxpbmVJbmRleENvdW50ICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5ULFxuXHRcdFx0XHQoZGlydHlMaW5lRW5kIC0gZGlydHlMaW5lU3RhcnQgKyAxKSAqIGxpbmVJbmRleENvdW50ICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5UXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2ZpbmFsUmVuZGVyZWRMaW5lID0gTWF0aC5tYXgodGhpcy5fZmluYWxSZW5kZXJlZExpbmUsIGRpcnR5TGluZUVuZCk7XG5cblx0XHR0aGlzLl9hY3RpdmVEb3VibGVCdWZmZXJJbmRleCA9IHRoaXMuX2FjdGl2ZURvdWJsZUJ1ZmZlckluZGV4ID8gMCA6IDE7XG5cblx0XHR0aGlzLl92aXNpYmxlT2JqZWN0Q291bnQgPSB2aXNpYmxlT2JqZWN0Q291bnQ7XG5cblx0XHRyZXR1cm4gdmlzaWJsZU9iamVjdENvdW50O1xuXHR9XG5cblx0ZHJhdyhwYXNzOiBHUFVSZW5kZXJQYXNzRW5jb2Rlciwgdmlld3BvcnREYXRhOiBWaWV3cG9ydERhdGEpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdmlzaWJsZU9iamVjdENvdW50IDw9IDApIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0F0dGVtcHQgdG8gZHJhdyAwIG9iamVjdHMnKTtcblx0XHR9XG5cdFx0cGFzcy5kcmF3KFxuXHRcdFx0cXVhZFZlcnRpY2VzLmxlbmd0aCAvIDIsXG5cdFx0XHR0aGlzLl92aXNpYmxlT2JqZWN0Q291bnQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQodmlld3BvcnREYXRhLnN0YXJ0TGluZU51bWJlciAtIDEpICogRnVsbEZpbGVSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRDb2x1bW5zXG5cdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBRdWV1ZSB1cGRhdGVzIHRoYXQgbmVlZCB0byBoYXBwZW4gb24gdGhlIGFjdGl2ZSBidWZmZXIsIG5vdCBqdXN0IHRoZSBjYWNoZS4gVGhpcyB3aWxsIGJlXG5cdCAqIGRlZmVycmVkIHRvIHdoZW4gdGhlIGFjdHVhbCBjZWxsIGJ1ZmZlciBpcyBjaGFuZ2VkIHNpbmNlIHRoZSBhY3RpdmUgYnVmZmVyIGNvdWxkIGJlIGxvY2tlZCBieVxuXHQgKiB0aGUgR1BVIHdoaWNoIHdvdWxkIGJsb2NrIHRoZSBtYWluIHRocmVhZC5cblx0ICovXG5cdHByaXZhdGUgX3F1ZXVlQnVmZmVyVXBkYXRlKGU6IFF1ZXVlZEJ1ZmZlckV2ZW50KSB7XG5cdFx0dGhpcy5fcXVldWVkQnVmZmVyVXBkYXRlc1swXS5wdXNoKGUpO1xuXHRcdHRoaXMuX3F1ZXVlZEJ1ZmZlclVwZGF0ZXNbMV0ucHVzaChlKTtcblx0fVxufVxuXG5mdW5jdGlvbiBwYXJzZUNzc0ZvbnRXZWlnaHQodmFsdWU6IHN0cmluZykge1xuXHRzd2l0Y2ggKHZhbHVlKSB7XG5cdFx0Y2FzZSAnbGlnaHRlcic6XG5cdFx0Y2FzZSAnbm9ybWFsJzogcmV0dXJuIDQwMDtcblx0XHRjYXNlICdib2xkZXInOlxuXHRcdGNhc2UgJ2JvbGQnOiByZXR1cm4gNzAwO1xuXHR9XG5cdHJldHVybiBwYXJzZUludCh2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIHBhcnNlQ3NzT3BhY2l0eSh2YWx1ZTogc3RyaW5nKTogbnVtYmVyIHtcblx0aWYgKHZhbHVlLmVuZHNXaXRoKCclJykpIHtcblx0XHRyZXR1cm4gcGFyc2VGbG9hdCh2YWx1ZS5zdWJzdHJpbmcoMCwgdmFsdWUubGVuZ3RoIC0gMSkpIC8gMTAwO1xuXHR9XG5cdGlmICh2YWx1ZS5tYXRjaCgvXlxcZCsoPzpcXC5cXGQqKS8pKSB7XG5cdFx0cmV0dXJuIHBhcnNlRmxvYXQodmFsdWUpO1xuXHR9XG5cdHJldHVybiAxO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMscUJBQW9VO0FBTTdVLFNBQVMsOEJBQXNEO0FBQy9ELFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMEJBQTBCO0FBR25DLElBQVcsWUFBWCxrQkFBV0EsZUFBWDtBQUNDLEVBQUFBLHNCQUFBLG9CQUFpQixLQUFqQjtBQURVLFNBQUFBO0FBQUEsR0FBQTtBQUlYLElBQVcsaUJBQVgsa0JBQVdDLG9CQUFYO0FBQ0MsRUFBQUEsZ0NBQUEsb0JBQWlCLEtBQWpCO0FBQ0EsRUFBQUEsZ0NBQUEsbUJBQWdCLE1BQWhCO0FBQ0EsRUFBQUEsZ0NBQUEsY0FBVyxLQUFYO0FBQ0EsRUFBQUEsZ0NBQUEsY0FBVyxLQUFYO0FBQ0EsRUFBQUEsZ0NBQUEsb0JBQWlCLEtBQWpCO0FBQ0EsRUFBQUEsZ0NBQUEsb0JBQWlCLEtBQWpCO0FBQ0EsRUFBQUEsZ0NBQUEsZ0JBQWEsS0FBYjtBQUNBLEVBQUFBLGdDQUFBLGtCQUFlLEtBQWY7QUFSVSxTQUFBQTtBQUFBLEdBQUE7QUF1QkosTUFBTSwwQkFBTixNQUFNLGdDQUErQixtQkFBbUI7QUFBQSxFQXlDOUQsWUFDQyxTQUNBLGdCQUNBLFFBQ0EsaUJBQ0M7QUFDRCxVQUFNLFNBQVMsZ0JBQWdCLFFBQVEsZUFBZTtBQW5DdkQsU0FBUyxPQUFPO0FBQ2hCLFNBQVMsT0FBZTtBQVN4QixTQUFRLDJCQUFrQztBQUUxQyxTQUFpQixpQkFBNkMsQ0FB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
