import { getActiveWindow } from "../../../../base/browser/dom.js";
import { Color } from "../../../../base/common/color.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { CursorColumns } from "../../../common/core/cursorColumns.js";
import { createContentSegmenter } from "../contentSegmenter.js";
import { BindingId } from "../gpu.js";
import { GPULifecycle } from "../gpuDisposable.js";
import { quadVertices } from "../gpuUtils.js";
import { ViewGpuContext } from "../viewGpuContext.js";
import { BaseRenderStrategy } from "./baseRenderStrategy.js";
import { fullFileRenderStrategyWgsl } from "./fullFileRenderStrategy.wgsl.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["IndicesPerCell"] = 6] = "IndicesPerCell";
  Constants2[Constants2["CellBindBufferCapacityIncrement"] = 32] = "CellBindBufferCapacityIncrement";
  Constants2[Constants2["CellBindBufferInitialCapacity"] = 63] = "CellBindBufferInitialCapacity";
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
const _ViewportRenderStrategy = class _ViewportRenderStrategy extends BaseRenderStrategy {
  constructor(context, viewGpuContext, device, glyphRasterizer) {
    super(context, viewGpuContext, device, glyphRasterizer);
    this.type = "viewport";
    this.wgsl = fullFileRenderStrategyWgsl;
    this._cellBindBufferLineCapacity = 63 /* CellBindBufferInitialCapacity */;
    this._activeDoubleBufferIndex = 0;
    this._visibleObjectCount = 0;
    this._lastViewportLineCount = 0;
    this._scrollInitialized = false;
    this._onDidChangeBindGroupEntries = this._register(new Emitter());
    this.onDidChangeBindGroupEntries = this._onDidChangeBindGroupEntries.event;
    this._rebuildCellBuffer(this._cellBindBufferLineCapacity);
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
  _rebuildCellBuffer(lineCount) {
    this._cellBindBuffer?.destroy();
    const lineCountWithIncrement = (Math.floor(lineCount / 32 /* CellBindBufferCapacityIncrement */) + 1) * 32 /* CellBindBufferCapacityIncrement */;
    const bufferSize = lineCountWithIncrement * _ViewportRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */ * Float32Array.BYTES_PER_ELEMENT;
    this._cellBindBuffer = this._register(GPULifecycle.createBuffer(this._device, {
      label: "Monaco full file cell buffer",
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })).object;
    this._cellValueBuffers = [
      new ArrayBuffer(bufferSize),
      new ArrayBuffer(bufferSize)
    ];
    this._cellBindBufferLineCapacity = lineCountWithIncrement;
    this._lastViewportLineCount = 0;
    this._onDidChangeBindGroupEntries.fire();
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
    return true;
  }
  onDecorationsChanged(e) {
    return true;
  }
  onTokensChanged(e) {
    return true;
  }
  onLinesDeleted(e) {
    return true;
  }
  onLinesInserted(e) {
    return true;
  }
  onLinesChanged(e) {
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
    return true;
  }
  onLineMappingChanged(e) {
    return true;
  }
  onZonesChanged(e) {
    return true;
  }
  // #endregion
  reset() {
    for (const bufferIndex of [0, 1]) {
      const buffer = new Float32Array(this._cellValueBuffers[bufferIndex]);
      buffer.fill(0, 0, buffer.length);
      this._device.queue.writeBuffer(this._cellBindBuffer, 0, buffer.buffer, 0, buffer.byteLength);
    }
    this._lastViewportLineCount = 0;
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
    if (this._cellBindBufferLineCapacity < viewportData.endLineNumber - viewportData.startLineNumber + 1) {
      this._rebuildCellBuffer(viewportData.endLineNumber - viewportData.startLineNumber + 1);
    }
    const cellBuffer = new Float32Array(this._cellValueBuffers[this._activeDoubleBufferIndex]);
    cellBuffer.fill(0);
    const lineIndexCount = _ViewportRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */;
    for (y = viewportData.startLineNumber; y <= viewportData.endLineNumber; y++) {
      if (!this._viewGpuContext.canRender(viewLineOptions, viewportData, y)) {
        continue;
      }
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
          if (x > _ViewportRenderStrategy.maxSupportedColumns) {
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
            cellIndex = ((y - 1) * _ViewportRenderStrategy.maxSupportedColumns + x) * 6 /* IndicesPerCell */;
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
          cellIndex = ((y - viewportData.startLineNumber) * _ViewportRenderStrategy.maxSupportedColumns + x) * 6 /* IndicesPerCell */;
          cellBuffer[cellIndex + 0 /* Offset_X */] = Math.floor(absoluteOffsetX);
          cellBuffer[cellIndex + 1 /* Offset_Y */] = absoluteOffsetY;
          cellBuffer[cellIndex + 4 /* GlyphIndex */] = glyph.glyphIndex;
          cellBuffer[cellIndex + 5 /* TextureIndex */] = glyph.pageIndex;
          absoluteOffsetX += charWidth;
        }
        tokenStartIndex = tokenEndIndex;
      }
      fillStartIndex = ((y - viewportData.startLineNumber) * _ViewportRenderStrategy.maxSupportedColumns + tokenEndIndex) * 6 /* IndicesPerCell */;
      fillEndIndex = (y - viewportData.startLineNumber) * _ViewportRenderStrategy.maxSupportedColumns * 6 /* IndicesPerCell */;
      cellBuffer.fill(0, fillStartIndex, fillEndIndex);
    }
    const visibleObjectCount = (viewportData.endLineNumber - viewportData.startLineNumber + 1) * lineIndexCount;
    const viewportLineCount = viewportData.endLineNumber - viewportData.startLineNumber + 1;
    this._device.queue.writeBuffer(
      this._cellBindBuffer,
      0,
      cellBuffer.buffer,
      0,
      visibleObjectCount * Float32Array.BYTES_PER_ELEMENT
    );
    if (viewportLineCount < this._lastViewportLineCount) {
      const staleLineCount = this._lastViewportLineCount - viewportLineCount;
      const staleStartOffset = visibleObjectCount * Float32Array.BYTES_PER_ELEMENT;
      const staleByteCount = staleLineCount * lineIndexCount * Float32Array.BYTES_PER_ELEMENT;
      this._device.queue.writeBuffer(
        this._cellBindBuffer,
        staleStartOffset,
        cellBuffer.buffer,
        visibleObjectCount * Float32Array.BYTES_PER_ELEMENT,
        staleByteCount
      );
    }
    this._lastViewportLineCount = viewportLineCount;
    this._activeDoubleBufferIndex = this._activeDoubleBufferIndex ? 0 : 1;
    this._visibleObjectCount = visibleObjectCount;
    return visibleObjectCount;
  }
  draw(pass, viewportData) {
    if (this._visibleObjectCount <= 0) {
      throw new BugIndicatingError("Attempt to draw 0 objects");
    }
    pass.draw(quadVertices.length / 2, this._visibleObjectCount);
  }
};
/**
 * The hard cap for line columns that can be rendered by the GPU renderer.
 */
_ViewportRenderStrategy.maxSupportedColumns = 2e3;
let ViewportRenderStrategy = _ViewportRenderStrategy;
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
  ViewportRenderStrategy
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL2dwdS9yZW5kZXJTdHJhdGVneS92aWV3cG9ydFJlbmRlclN0cmF0ZWd5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZ2V0QWN0aXZlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ29sdW1ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2N1cnNvckNvbHVtbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBJVmlld0xpbmVUb2tlbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9rZW5zL2xpbmVUb2tlbnMuanMnO1xuaW1wb3J0IHsgdHlwZSBWaWV3Q29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCwgdHlwZSBWaWV3RGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQsIHR5cGUgVmlld0xpbmVNYXBwaW5nQ2hhbmdlZEV2ZW50LCB0eXBlIFZpZXdMaW5lc0NoYW5nZWRFdmVudCwgdHlwZSBWaWV3TGluZXNEZWxldGVkRXZlbnQsIHR5cGUgVmlld0xpbmVzSW5zZXJ0ZWRFdmVudCwgdHlwZSBWaWV3U2Nyb2xsQ2hhbmdlZEV2ZW50LCB0eXBlIFZpZXdUaGVtZUNoYW5nZWRFdmVudCwgdHlwZSBWaWV3VG9rZW5zQ2hhbmdlZEV2ZW50LCB0eXBlIFZpZXdab25lc0NoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3RXZlbnRzLmpzJztcbmltcG9ydCB0eXBlIHsgVmlld3BvcnREYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdMYXlvdXQvdmlld0xpbmVzVmlld3BvcnREYXRhLmpzJztcbmltcG9ydCB0eXBlIHsgVmlld0xpbmVSZW5kZXJpbmdEYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVEZWNvcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC9pbmxpbmVEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IFZpZXdDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC92aWV3Q29udGV4dC5qcyc7XG5pbXBvcnQgdHlwZSB7IFZpZXdMaW5lT3B0aW9ucyB9IGZyb20gJy4uLy4uL3ZpZXdQYXJ0cy92aWV3TGluZXMvdmlld0xpbmVPcHRpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgSVRleHR1cmVBdGxhc1BhZ2VHbHlwaCB9IGZyb20gJy4uL2F0bGFzL2F0bGFzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvbnRlbnRTZWdtZW50ZXIsIHR5cGUgSUNvbnRlbnRTZWdtZW50ZXIgfSBmcm9tICcuLi9jb250ZW50U2VnbWVudGVyLmpzJztcbmltcG9ydCB7IEJpbmRpbmdJZCB9IGZyb20gJy4uL2dwdS5qcyc7XG5pbXBvcnQgeyBHUFVMaWZlY3ljbGUgfSBmcm9tICcuLi9ncHVEaXNwb3NhYmxlLmpzJztcbmltcG9ydCB7IHF1YWRWZXJ0aWNlcyB9IGZyb20gJy4uL2dwdVV0aWxzLmpzJztcbmltcG9ydCB7IEdseXBoUmFzdGVyaXplciB9IGZyb20gJy4uL3Jhc3Rlci9nbHlwaFJhc3Rlcml6ZXIuanMnO1xuaW1wb3J0IHsgVmlld0dwdUNvbnRleHQgfSBmcm9tICcuLi92aWV3R3B1Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBCYXNlUmVuZGVyU3RyYXRlZ3kgfSBmcm9tICcuL2Jhc2VSZW5kZXJTdHJhdGVneS5qcyc7XG5pbXBvcnQgeyBmdWxsRmlsZVJlbmRlclN0cmF0ZWd5V2dzbCB9IGZyb20gJy4vZnVsbEZpbGVSZW5kZXJTdHJhdGVneS53Z3NsLmpzJztcblxuY29uc3QgZW51bSBDb25zdGFudHMge1xuXHRJbmRpY2VzUGVyQ2VsbCA9IDYsXG5cdENlbGxCaW5kQnVmZmVyQ2FwYWNpdHlJbmNyZW1lbnQgPSAzMixcblx0Q2VsbEJpbmRCdWZmZXJJbml0aWFsQ2FwYWNpdHkgPSA2MywgLy8gV2lsbCBiZSByb3VuZGVkIHVwIHRvIG5lYXJlc3QgaW5jcmVtZW50XG59XG5cbmNvbnN0IGVudW0gQ2VsbEJ1ZmZlckluZm8ge1xuXHRGbG9hdHNQZXJFbnRyeSA9IDYsXG5cdEJ5dGVzUGVyRW50cnkgPSBDZWxsQnVmZmVySW5mby5GbG9hdHNQZXJFbnRyeSAqIDQsXG5cdE9mZnNldF9YID0gMCxcblx0T2Zmc2V0X1kgPSAxLFxuXHRPZmZzZXRfVW51c2VkMSA9IDIsXG5cdE9mZnNldF9VbnVzZWQyID0gMyxcblx0R2x5cGhJbmRleCA9IDQsXG5cdFRleHR1cmVJbmRleCA9IDUsXG59XG5cbi8qKlxuICogQSByZW5kZXIgc3RyYXRlZ3kgdGhhdCB1cGxvYWRzIHRoZSBjb250ZW50IG9mIHRoZSBlbnRpcmUgdmlld3BvcnQgZXZlcnkgZnJhbWUuXG4gKi9cbmV4cG9ydCBjbGFzcyBWaWV3cG9ydFJlbmRlclN0cmF0ZWd5IGV4dGVuZHMgQmFzZVJlbmRlclN0cmF0ZWd5IHtcblx0LyoqXG5cdCAqIFRoZSBoYXJkIGNhcCBmb3IgbGluZSBjb2x1bW5zIHRoYXQgY2FuIGJlIHJlbmRlcmVkIGJ5IHRoZSBHUFUgcmVuZGVyZXIuXG5cdCAqL1xuXHRzdGF0aWMgcmVhZG9ubHkgbWF4U3VwcG9ydGVkQ29sdW1ucyA9IDIwMDA7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICd2aWV3cG9ydCc7XG5cdHJlYWRvbmx5IHdnc2w6IHN0cmluZyA9IGZ1bGxGaWxlUmVuZGVyU3RyYXRlZ3lXZ3NsO1xuXG5cdHByaXZhdGUgX2NlbGxCaW5kQnVmZmVyTGluZUNhcGFjaXR5ID0gQ29uc3RhbnRzLkNlbGxCaW5kQnVmZmVySW5pdGlhbENhcGFjaXR5O1xuXHRwcml2YXRlIF9jZWxsQmluZEJ1ZmZlciE6IEdQVUJ1ZmZlcjtcblxuXHQvKipcblx0ICogVGhlIGNlbGwgdmFsdWUgYnVmZmVycywgdGhlc2UgaG9sZCB0aGUgY2VsbHMgYW5kIHRoZWlyIGdseXBocy4gSXQncyBkb3VibGUgYnVmZmVycyBzdWNoIHRoYXRcblx0ICogdGhlIHRocmVhZCBkb2Vzbid0IGJsb2NrIHdoZW4gb25lIGlzIGJlaW5nIHVwbG9hZGVkIHRvIHRoZSBHUFUuXG5cdCAqL1xuXHRwcml2YXRlIF9jZWxsVmFsdWVCdWZmZXJzITogW0FycmF5QnVmZmVyLCBBcnJheUJ1ZmZlcl07XG5cdHByaXZhdGUgX2FjdGl2ZURvdWJsZUJ1ZmZlckluZGV4OiAwIHwgMSA9IDA7XG5cblx0cHJpdmF0ZSBfdmlzaWJsZU9iamVjdENvdW50OiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9sYXN0Vmlld3BvcnRMaW5lQ291bnQ6IG51bWJlciA9IDA7XG5cblx0cHJpdmF0ZSBfc2Nyb2xsT2Zmc2V0QmluZEJ1ZmZlcjogR1BVQnVmZmVyO1xuXHRwcml2YXRlIF9zY3JvbGxPZmZzZXRWYWx1ZUJ1ZmZlcjogRmxvYXQzMkFycmF5O1xuXHRwcml2YXRlIF9zY3JvbGxJbml0aWFsaXplZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGdldCBiaW5kR3JvdXBFbnRyaWVzKCk6IEdQVUJpbmRHcm91cEVudHJ5W10ge1xuXHRcdHJldHVybiBbXG5cdFx0XHR7IGJpbmRpbmc6IEJpbmRpbmdJZC5DZWxscywgcmVzb3VyY2U6IHsgYnVmZmVyOiB0aGlzLl9jZWxsQmluZEJ1ZmZlciB9IH0sXG5cdFx0XHR7IGJpbmRpbmc6IEJpbmRpbmdJZC5TY3JvbGxPZmZzZXQsIHJlc291cmNlOiB7IGJ1ZmZlcjogdGhpcy5fc2Nyb2xsT2Zmc2V0QmluZEJ1ZmZlciB9IH1cblx0XHRdO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VCaW5kR3JvdXBFbnRyaWVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQmluZEdyb3VwRW50cmllcyA9IHRoaXMuX29uRGlkQ2hhbmdlQmluZEdyb3VwRW50cmllcy5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250ZXh0OiBWaWV3Q29udGV4dCxcblx0XHR2aWV3R3B1Q29udGV4dDogVmlld0dwdUNvbnRleHQsXG5cdFx0ZGV2aWNlOiBHUFVEZXZpY2UsXG5cdFx0Z2x5cGhSYXN0ZXJpemVyOiB7IHZhbHVlOiBHbHlwaFJhc3Rlcml6ZXIgfSxcblx0KSB7XG5cdFx0c3VwZXIoY29udGV4dCwgdmlld0dwdUNvbnRleHQsIGRldmljZSwgZ2x5cGhSYXN0ZXJpemVyKTtcblxuXHRcdHRoaXMuX3JlYnVpbGRDZWxsQnVmZmVyKHRoaXMuX2NlbGxCaW5kQnVmZmVyTGluZUNhcGFjaXR5KTtcblxuXHRcdGNvbnN0IHNjcm9sbE9mZnNldEJ1ZmZlclNpemUgPSAyO1xuXHRcdHRoaXMuX3Njcm9sbE9mZnNldEJpbmRCdWZmZXIgPSB0aGlzLl9yZWdpc3RlcihHUFVMaWZlY3ljbGUuY3JlYXRlQnVmZmVyKHRoaXMuX2RldmljZSwge1xuXHRcdFx0bGFiZWw6ICdNb25hY28gc2Nyb2xsIG9mZnNldCBidWZmZXInLFxuXHRcdFx0c2l6ZTogc2Nyb2xsT2Zmc2V0QnVmZmVyU2l6ZSAqIEZsb2F0MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVCxcblx0XHRcdHVzYWdlOiBHUFVCdWZmZXJVc2FnZS5VTklGT1JNIHwgR1BVQnVmZmVyVXNhZ2UuQ09QWV9EU1QsXG5cdFx0fSkpLm9iamVjdDtcblx0XHR0aGlzLl9zY3JvbGxPZmZzZXRWYWx1ZUJ1ZmZlciA9IG5ldyBGbG9hdDMyQXJyYXkoc2Nyb2xsT2Zmc2V0QnVmZmVyU2l6ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWJ1aWxkQ2VsbEJ1ZmZlcihsaW5lQ291bnQ6IG51bWJlcikge1xuXHRcdHRoaXMuX2NlbGxCaW5kQnVmZmVyPy5kZXN0cm95KCk7XG5cblx0XHQvLyBJbmNyZWFzZSBpbiBjaHVua3Mgc28gcmVzaXppbmcgYSB3aW5kb3cgYnkgaGFuZCBkb2Vzbid0IGtlZXAgYWxsb2NhdGluZyBhbmQgdGhyb3dpbmcgYXdheVxuXHRcdGNvbnN0IGxpbmVDb3VudFdpdGhJbmNyZW1lbnQgPSAoTWF0aC5mbG9vcihsaW5lQ291bnQgLyBDb25zdGFudHMuQ2VsbEJpbmRCdWZmZXJDYXBhY2l0eUluY3JlbWVudCkgKyAxKSAqIENvbnN0YW50cy5DZWxsQmluZEJ1ZmZlckNhcGFjaXR5SW5jcmVtZW50O1xuXG5cdFx0Y29uc3QgYnVmZmVyU2l6ZSA9IGxpbmVDb3VudFdpdGhJbmNyZW1lbnQgKiBWaWV3cG9ydFJlbmRlclN0cmF0ZWd5Lm1heFN1cHBvcnRlZENvbHVtbnMgKiBDb25zdGFudHMuSW5kaWNlc1BlckNlbGwgKiBGbG9hdDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQ7XG5cdFx0dGhpcy5fY2VsbEJpbmRCdWZmZXIgPSB0aGlzLl9yZWdpc3RlcihHUFVMaWZlY3ljbGUuY3JlYXRlQnVmZmVyKHRoaXMuX2RldmljZSwge1xuXHRcdFx0bGFiZWw6ICdNb25hY28gZnVsbCBmaWxlIGNlbGwgYnVmZmVyJyxcblx0XHRcdHNpemU6IGJ1ZmZlclNpemUsXG5cdFx0XHR1c2FnZTogR1BVQnVmZmVyVXNhZ2UuU1RPUkFHRSB8IEdQVUJ1ZmZlclVzYWdlLkNPUFlfRFNULFxuXHRcdH0pKS5vYmplY3Q7XG5cdFx0dGhpcy5fY2VsbFZhbHVlQnVmZmVycyA9IFtcblx0XHRcdG5ldyBBcnJheUJ1ZmZlcihidWZmZXJTaXplKSxcblx0XHRcdG5ldyBBcnJheUJ1ZmZlcihidWZmZXJTaXplKSxcblx0XHRdO1xuXHRcdHRoaXMuX2NlbGxCaW5kQnVmZmVyTGluZUNhcGFjaXR5ID0gbGluZUNvdW50V2l0aEluY3JlbWVudDtcblx0XHR0aGlzLl9sYXN0Vmlld3BvcnRMaW5lQ291bnQgPSAwO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VCaW5kR3JvdXBFbnRyaWVzLmZpcmUoKTtcblx0fVxuXG5cdC8vICNyZWdpb24gRXZlbnQgaGFuZGxlcnNcblxuXHQvLyBUaGUgcHJpbWFyeSBqb2Igb2YgdGhlc2UgaGFuZGxlcnMgaXMgdG86XG5cdC8vIDEuIEludmFsaWRhdGUgdGhlIHVwIHRvIGRhdGUgbGluZSBjYWNoZSwgd2hpY2ggd2lsbCBjYXVzZSB0aGUgbGluZSB0byBiZSByZS1yZW5kZXJlZCB3aGVuXG5cdC8vICAgIGl0J3MgX3dpdGhpbiB0aGUgdmlld3BvcnRfLlxuXHQvLyAyLiBQYXNzIHJlbGV2YW50IGV2ZW50cyBvbiB0byB0aGUgcmVuZGVyIGZ1bmN0aW9uIHNvIGl0IGNhbiBmb3JjZSBjZXJ0YWluIGxpbmUgcmFuZ2VzIHRvIGJlXG5cdC8vICAgIHJlLXJlbmRlcmVkIGV2ZW4gaWYgdGhleSdyZSBub3QgaW4gdGhlIHZpZXdwb3J0LiBGb3IgZXhhbXBsZSB3aGVuIGEgdmlldyB6b25lIGlzIGFkZGVkLFxuXHQvLyAgICB0aGVyZSBhcmUgbGluZXMgdGhhdCB1c2VkIHRvIGJlIHZpc2libGUgYnV0IGFyZSBubyBsb25nZXIsIHNvIHRob3NlIHJhbmdlcyBtdXN0IGJlXG5cdC8vICAgIGNsZWFyZWQgYW5kIHVwbG9hZGVkIHRvIHRoZSBHUFUuXG5cblx0cHVibGljIG92ZXJyaWRlIG9uQ29uZmlndXJhdGlvbkNoYW5nZWQoZTogVmlld0NvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvbkRlY29yYXRpb25zQ2hhbmdlZChlOiBWaWV3RGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvblRva2Vuc0NoYW5nZWQoZTogVmlld1Rva2Vuc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIG9uTGluZXNEZWxldGVkKGU6IFZpZXdMaW5lc0RlbGV0ZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIG9uTGluZXNJbnNlcnRlZChlOiBWaWV3TGluZXNJbnNlcnRlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25MaW5lc0NoYW5nZWQoZTogVmlld0xpbmVzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25TY3JvbGxDaGFuZ2VkKGU/OiBWaWV3U2Nyb2xsQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgZHByID0gZ2V0QWN0aXZlV2luZG93KCkuZGV2aWNlUGl4ZWxSYXRpbztcblx0XHR0aGlzLl9zY3JvbGxPZmZzZXRWYWx1ZUJ1ZmZlclswXSA9IChlPy5zY3JvbGxMZWZ0ID8/IHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRDdXJyZW50U2Nyb2xsTGVmdCgpKSAqIGRwcjtcblx0XHR0aGlzLl9zY3JvbGxPZmZzZXRWYWx1ZUJ1ZmZlclsxXSA9IChlPy5zY3JvbGxUb3AgPz8gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldEN1cnJlbnRTY3JvbGxUb3AoKSkgKiBkcHI7XG5cdFx0dGhpcy5fZGV2aWNlLnF1ZXVlLndyaXRlQnVmZmVyKHRoaXMuX3Njcm9sbE9mZnNldEJpbmRCdWZmZXIsIDAsIHRoaXMuX3Njcm9sbE9mZnNldFZhbHVlQnVmZmVyIGFzIEZsb2F0MzJBcnJheTxBcnJheUJ1ZmZlcj4pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIG9uVGhlbWVDaGFuZ2VkKGU6IFZpZXdUaGVtZUNoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIG9uTGluZU1hcHBpbmdDaGFuZ2VkKGU6IFZpZXdMaW5lTWFwcGluZ0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIG9uWm9uZXNDaGFuZ2VkKGU6IFZpZXdab25lc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdHJlc2V0KCkge1xuXHRcdGZvciAoY29uc3QgYnVmZmVySW5kZXggb2YgWzAsIDFdKSB7XG5cdFx0XHQvLyBaZXJvIG91dCBidWZmZXIgYW5kIHVwbG9hZCB0byBHUFUgdG8gcHJldmVudCBzdGFsZSByb3dzIGZyb20gcmVuZGVyaW5nXG5cdFx0XHRjb25zdCBidWZmZXIgPSBuZXcgRmxvYXQzMkFycmF5KHRoaXMuX2NlbGxWYWx1ZUJ1ZmZlcnNbYnVmZmVySW5kZXhdKTtcblx0XHRcdGJ1ZmZlci5maWxsKDAsIDAsIGJ1ZmZlci5sZW5ndGgpO1xuXHRcdFx0dGhpcy5fZGV2aWNlLnF1ZXVlLndyaXRlQnVmZmVyKHRoaXMuX2NlbGxCaW5kQnVmZmVyLCAwLCBidWZmZXIuYnVmZmVyLCAwLCBidWZmZXIuYnl0ZUxlbmd0aCk7XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3RWaWV3cG9ydExpbmVDb3VudCA9IDA7XG5cdH1cblxuXHR1cGRhdGUodmlld3BvcnREYXRhOiBWaWV3cG9ydERhdGEsIHZpZXdMaW5lT3B0aW9uczogVmlld0xpbmVPcHRpb25zKTogbnVtYmVyIHtcblx0XHQvLyBJTVBPUlRBTlQ6IFRoaXMgaXMgYSBob3QgZnVuY3Rpb24uIFZhcmlhYmxlcyBhcmUgcHJlLWFsbG9jYXRlZCBhbmQgc2hhcmVkIHdpdGhpbiB0aGVcblx0XHQvLyBsb29wLiBUaGlzIGlzIGRvbmUgc28gd2UgZG9uJ3QgbmVlZCB0byB0cnVzdCB0aGUgSklUIGNvbXBpbGVyIHRvIGRvIHRoaXMgb3B0aW1pemF0aW9uIHRvXG5cdFx0Ly8gYXZvaWQgcG90ZW50aWFsIGFkZGl0aW9uYWwgYmxvY2tpbmcgdGltZSBpbiBnYXJiYWdlIGNvbGxlY3RvciB3aGljaCBpcyBhIGNvbW1vbiBjYXVzZSBvZlxuXHRcdC8vIGRyb3BwZWQgZnJhbWVzLlxuXG5cdFx0bGV0IGNoYXJzID0gJyc7XG5cdFx0bGV0IHNlZ21lbnQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY2hhcldpZHRoID0gMDtcblx0XHRsZXQgeSA9IDA7XG5cdFx0bGV0IHggPSAwO1xuXHRcdGxldCBhYnNvbHV0ZU9mZnNldFggPSAwO1xuXHRcdGxldCBhYnNvbHV0ZU9mZnNldFkgPSAwO1xuXHRcdGxldCB0YWJYT2Zmc2V0ID0gMDtcblx0XHRsZXQgZ2x5cGg6IFJlYWRvbmx5PElUZXh0dXJlQXRsYXNQYWdlR2x5cGg+O1xuXHRcdGxldCBjZWxsSW5kZXggPSAwO1xuXG5cdFx0bGV0IHRva2VuU3RhcnRJbmRleCA9IDA7XG5cdFx0bGV0IHRva2VuRW5kSW5kZXggPSAwO1xuXHRcdGxldCB0b2tlbk1ldGFkYXRhID0gMDtcblxuXHRcdGxldCBkZWNvcmF0aW9uU3R5bGVTZXRCb2xkOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBkZWNvcmF0aW9uU3R5bGVTZXRDb2xvcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBkZWNvcmF0aW9uU3R5bGVTZXRPcGFjaXR5OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGRlY29yYXRpb25TdHlsZVNldFN0cmlrZXRocm91Z2g6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGRlY29yYXRpb25TdHlsZVNldFN0cmlrZXRocm91Z2hUaGlja25lc3M6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaENvbG9yOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0XHRsZXQgbGluZURhdGE6IFZpZXdMaW5lUmVuZGVyaW5nRGF0YTtcblx0XHRsZXQgZGVjb3JhdGlvbjogSW5saW5lRGVjb3JhdGlvbjtcblx0XHRsZXQgZmlsbFN0YXJ0SW5kZXggPSAwO1xuXHRcdGxldCBmaWxsRW5kSW5kZXggPSAwO1xuXG5cdFx0bGV0IHRva2VuczogSVZpZXdMaW5lVG9rZW5zO1xuXG5cdFx0Y29uc3QgZHByID0gZ2V0QWN0aXZlV2luZG93KCkuZGV2aWNlUGl4ZWxSYXRpbztcblx0XHRsZXQgY29udGVudFNlZ21lbnRlcjogSUNvbnRlbnRTZWdtZW50ZXI7XG5cblx0XHRpZiAoIXRoaXMuX3Njcm9sbEluaXRpYWxpemVkKSB7XG5cdFx0XHR0aGlzLm9uU2Nyb2xsQ2hhbmdlZCgpO1xuXHRcdFx0dGhpcy5fc2Nyb2xsSW5pdGlhbGl6ZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIFplcm8gb3V0IGNlbGwgYnVmZmVyIG9yIHJlYnVpbGQgaWYgbmVlZGVkXG5cdFx0aWYgKHRoaXMuX2NlbGxCaW5kQnVmZmVyTGluZUNhcGFjaXR5IDwgdmlld3BvcnREYXRhLmVuZExpbmVOdW1iZXIgLSB2aWV3cG9ydERhdGEuc3RhcnRMaW5lTnVtYmVyICsgMSkge1xuXHRcdFx0dGhpcy5fcmVidWlsZENlbGxCdWZmZXIodmlld3BvcnREYXRhLmVuZExpbmVOdW1iZXIgLSB2aWV3cG9ydERhdGEuc3RhcnRMaW5lTnVtYmVyICsgMSk7XG5cdFx0fVxuXHRcdGNvbnN0IGNlbGxCdWZmZXIgPSBuZXcgRmxvYXQzMkFycmF5KHRoaXMuX2NlbGxWYWx1ZUJ1ZmZlcnNbdGhpcy5fYWN0aXZlRG91YmxlQnVmZmVySW5kZXhdKTtcblx0XHRjZWxsQnVmZmVyLmZpbGwoMCk7XG5cblx0XHRjb25zdCBsaW5lSW5kZXhDb3VudCA9IFZpZXdwb3J0UmVuZGVyU3RyYXRlZ3kubWF4U3VwcG9ydGVkQ29sdW1ucyAqIENvbnN0YW50cy5JbmRpY2VzUGVyQ2VsbDtcblxuXHRcdGZvciAoeSA9IHZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXI7IHkgPD0gdmlld3BvcnREYXRhLmVuZExpbmVOdW1iZXI7IHkrKykge1xuXG5cdFx0XHQvLyBPbmx5IGF0dGVtcHQgdG8gcmVuZGVyIGxpbmVzIHRoYXQgdGhlIEdQVSByZW5kZXJlciBjYW4gaGFuZGxlXG5cdFx0XHRpZiAoIXRoaXMuX3ZpZXdHcHVDb250ZXh0LmNhblJlbmRlcih2aWV3TGluZU9wdGlvbnMsIHZpZXdwb3J0RGF0YSwgeSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGxpbmVEYXRhID0gdmlld3BvcnREYXRhLmdldFZpZXdMaW5lUmVuZGVyaW5nRGF0YSh5KTtcblx0XHRcdHRhYlhPZmZzZXQgPSAwO1xuXG5cdFx0XHRjb250ZW50U2VnbWVudGVyID0gY3JlYXRlQ29udGVudFNlZ21lbnRlcihsaW5lRGF0YSwgdmlld0xpbmVPcHRpb25zKTtcblx0XHRcdGNoYXJXaWR0aCA9IHZpZXdMaW5lT3B0aW9ucy5zcGFjZVdpZHRoICogZHByO1xuXHRcdFx0YWJzb2x1dGVPZmZzZXRYID0gKGxpbmVEYXRhLm1pbkNvbHVtbiAtIDEpICogY2hhcldpZHRoO1xuXG5cdFx0XHR0b2tlbnMgPSBsaW5lRGF0YS50b2tlbnM7XG5cdFx0XHR0b2tlblN0YXJ0SW5kZXggPSBsaW5lRGF0YS5taW5Db2x1bW4gLSAxO1xuXHRcdFx0dG9rZW5FbmRJbmRleCA9IDA7XG5cdFx0XHRmb3IgKGxldCB0b2tlbkluZGV4ID0gMCwgdG9rZW5zTGVuID0gdG9rZW5zLmdldENvdW50KCk7IHRva2VuSW5kZXggPCB0b2tlbnNMZW47IHRva2VuSW5kZXgrKykge1xuXHRcdFx0XHR0b2tlbkVuZEluZGV4ID0gdG9rZW5zLmdldEVuZE9mZnNldCh0b2tlbkluZGV4KTtcblx0XHRcdFx0aWYgKHRva2VuRW5kSW5kZXggPD0gdG9rZW5TdGFydEluZGV4KSB7XG5cdFx0XHRcdFx0Ly8gVGhlIGZhdXggaW5kZW50IHBhcnQgb2YgdGhlIGxpbmUgc2hvdWxkIGhhdmUgbm8gdG9rZW4gdHlwZVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dG9rZW5NZXRhZGF0YSA9IHRva2Vucy5nZXRNZXRhZGF0YSh0b2tlbkluZGV4KTtcblxuXHRcdFx0XHRmb3IgKHggPSB0b2tlblN0YXJ0SW5kZXg7IHggPCB0b2tlbkVuZEluZGV4OyB4KyspIHtcblx0XHRcdFx0XHQvLyBPbmx5IHJlbmRlciBsaW5lcyB0aGF0IGRvIG5vdCBleGNlZWQgbWF4aW11bSBjb2x1bW5zXG5cdFx0XHRcdFx0aWYgKHggPiBWaWV3cG9ydFJlbmRlclN0cmF0ZWd5Lm1heFN1cHBvcnRlZENvbHVtbnMpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzZWdtZW50ID0gY29udGVudFNlZ21lbnRlci5nZXRTZWdtZW50QXRJbmRleCh4KTtcblx0XHRcdFx0XHRpZiAoc2VnbWVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2hhcnMgPSBzZWdtZW50O1xuXG5cdFx0XHRcdFx0aWYgKCEobGluZURhdGEuaXNCYXNpY0FTQ0lJICYmIHZpZXdMaW5lT3B0aW9ucy51c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zKSkge1xuXHRcdFx0XHRcdFx0Y2hhcldpZHRoID0gdGhpcy5nbHlwaFJhc3Rlcml6ZXIuZ2V0VGV4dE1ldHJpY3MoY2hhcnMpLndpZHRoO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGRlY29yYXRpb25TdHlsZVNldENvbG9yID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGRlY29yYXRpb25TdHlsZVNldEJvbGQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0ZGVjb3JhdGlvblN0eWxlU2V0T3BhY2l0eSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRkZWNvcmF0aW9uU3R5bGVTZXRTdHJpa2V0aHJvdWdoID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGRlY29yYXRpb25TdHlsZVNldFN0cmlrZXRocm91Z2hUaGlja25lc3MgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0ZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaENvbG9yID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRcdFx0Ly8gQXBwbHkgc3VwcG9ydGVkIGlubGluZSBkZWNvcmF0aW9uIHN0eWxlcyB0byB0aGUgY2VsbCBtZXRhZGF0YVxuXHRcdFx0XHRcdGZvciAoZGVjb3JhdGlvbiBvZiBsaW5lRGF0YS5pbmxpbmVEZWNvcmF0aW9ucykge1xuXHRcdFx0XHRcdFx0Ly8gVGhpcyBpcyBSYW5nZS5zdHJpY3RDb250YWluc1Bvc2l0aW9uIGV4Y2VwdCBpdCB3b3JrcyBhdCB0aGUgY2VsbCBsZXZlbCxcblx0XHRcdFx0XHRcdC8vIGl0J3MgYWxzbyBpbmxpbmVkIHRvIGF2b2lkIG92ZXJoZWFkLlxuXHRcdFx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdFx0XHQoeSA8IGRlY29yYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIHx8IHkgPiBkZWNvcmF0aW9uLnJhbmdlLmVuZExpbmVOdW1iZXIpIHx8XG5cdFx0XHRcdFx0XHRcdCh5ID09PSBkZWNvcmF0aW9uLnJhbmdlLnN0YXJ0TGluZU51bWJlciAmJiB4IDwgZGVjb3JhdGlvbi5yYW5nZS5zdGFydENvbHVtbiAtIDEpIHx8XG5cdFx0XHRcdFx0XHRcdCh5ID09PSBkZWNvcmF0aW9uLnJhbmdlLmVuZExpbmVOdW1iZXIgJiYgeCA+PSBkZWNvcmF0aW9uLnJhbmdlLmVuZENvbHVtbiAtIDEpXG5cdFx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IHJ1bGVzID0gVmlld0dwdUNvbnRleHQuZGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3IuZ2V0U3R5bGVSdWxlcyh0aGlzLl92aWV3R3B1Q29udGV4dC5jYW52YXMuZG9tTm9kZSwgZGVjb3JhdGlvbi5pbmxpbmVDbGFzc05hbWUpO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBydWxlIG9mIHJ1bGVzKSB7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgciBvZiBydWxlLnN0eWxlKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBydWxlLnN0eWxlTWFwLmdldChyKT8udG9TdHJpbmcoKSA/PyAnJztcblx0XHRcdFx0XHRcdFx0XHRzd2l0Y2ggKHIpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNhc2UgJ2NvbG9yJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQvLyBUT0RPOiBUaGlzIHBhcnNpbmcgYW5kIGVycm9yIGhhbmRsaW5nIHNob3VsZCBtb3ZlIGludG8gY2FuUmVuZGVyIHNvIGZhbGxiYWNrXG5cdFx0XHRcdFx0XHRcdFx0XHRcdC8vICAgICAgIHRvIERPTSB3b3Jrc1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBwYXJzZWRDb2xvciA9IENvbG9yLkZvcm1hdC5DU1MucGFyc2UodmFsdWUpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAoIXBhcnNlZENvbG9yKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignSW52YWxpZCBjb2xvciBmb3JtYXQgJyArIHZhbHVlKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZWNvcmF0aW9uU3R5bGVTZXRDb2xvciA9IHBhcnNlZENvbG9yLnRvTnVtYmVyMzJCaXQoKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRjYXNlICdmb250LXdlaWdodCc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgcGFyc2VkVmFsdWUgPSBwYXJzZUNzc0ZvbnRXZWlnaHQodmFsdWUpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAocGFyc2VkVmFsdWUgPj0gNDAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVjb3JhdGlvblN0eWxlU2V0Qm9sZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gVE9ETzogU2V0IGJvbGQgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMzc1ODQpXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVjb3JhdGlvblN0eWxlU2V0Qm9sZCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdC8vIFRPRE86IFNldCBub3JtYWwgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMzc1ODQpXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRjYXNlICdvcGFjaXR5Jzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb25zdCBwYXJzZWRWYWx1ZSA9IHBhcnNlQ3NzT3BhY2l0eSh2YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlY29yYXRpb25TdHlsZVNldE9wYWNpdHkgPSBwYXJzZWRWYWx1ZTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRjYXNlICd0ZXh0LWRlY29yYXRpb24nOlxuXHRcdFx0XHRcdFx0XHRcdFx0Y2FzZSAndGV4dC1kZWNvcmF0aW9uLWxpbmUnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmICh2YWx1ZSA9PT0gJ2xpbmUtdGhyb3VnaCcpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZWNvcmF0aW9uU3R5bGVTZXRTdHJpa2V0aHJvdWdoID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdGNhc2UgJ3RleHQtZGVjb3JhdGlvbi10aGlja25lc3MnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IG1hdGNoID0gdmFsdWUubWF0Y2goL14oXFxkKyg/OlxcLlxcZCspPylweCQvKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaFRoaWNrbmVzcyA9IHBhcnNlRmxvYXQobWF0Y2hbMV0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0Y2FzZSAndGV4dC1kZWNvcmF0aW9uLWNvbG9yJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRsZXQgY29sb3JWYWx1ZSA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb25zdCB2YXJNYXRjaCA9IHZhbHVlLm1hdGNoKC9edmFyXFwoKC0tW14sXSspLFxccyooPzppbml0aWFsfGluaGVyaXQpXFwpJC8pO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAodmFyTWF0Y2gpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRjb2xvclZhbHVlID0gVmlld0dwdUNvbnRleHQuZGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3IucmVzb2x2ZUNzc1ZhcmlhYmxlKHRoaXMuX3ZpZXdHcHVDb250ZXh0LmNhbnZhcy5kb21Ob2RlLCB2YXJNYXRjaFsxXSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgcGFyc2VkQ29sb3IgPSBDb2xvci5Gb3JtYXQuQ1NTLnBhcnNlKGNvbG9yVmFsdWUpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAocGFyc2VkQ29sb3IpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZWNvcmF0aW9uU3R5bGVTZXRTdHJpa2V0aHJvdWdoQ29sb3IgPSBwYXJzZWRDb2xvci50b051bWJlcjMyQml0KCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRjYXNlICd0ZXh0LWRlY29yYXRpb24tc3R5bGUnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdC8vIFRoZXNlIGFyZSB2YWxpZGF0ZWQgaW4gY2FuUmVuZGVyIGFuZCB1c2UgZGVmYXVsdCBiZWhhdmlvclxuXHRcdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ1VuZXhwZWN0ZWQgaW5saW5lIGRlY29yYXRpb24gc3R5bGUnKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoY2hhcnMgPT09ICcgJyB8fCBjaGFycyA9PT0gJ1xcdCcpIHtcblx0XHRcdFx0XHRcdC8vIFplcm8gb3V0IGdseXBoIHRvIGVuc3VyZSBpdCBkb2Vzbid0IGdldCByZW5kZXJlZFxuXHRcdFx0XHRcdFx0Y2VsbEluZGV4ID0gKCh5IC0gMSkgKiBWaWV3cG9ydFJlbmRlclN0cmF0ZWd5Lm1heFN1cHBvcnRlZENvbHVtbnMgKyB4KSAqIENvbnN0YW50cy5JbmRpY2VzUGVyQ2VsbDtcblx0XHRcdFx0XHRcdGNlbGxCdWZmZXIuZmlsbCgwLCBjZWxsSW5kZXgsIGNlbGxJbmRleCArIENlbGxCdWZmZXJJbmZvLkZsb2F0c1BlckVudHJ5KTtcblx0XHRcdFx0XHRcdC8vIEFkanVzdCB4T2Zmc2V0IGZvciB0YWIgc3RvcHNcblx0XHRcdFx0XHRcdGlmIChjaGFycyA9PT0gJ1xcdCcpIHtcblx0XHRcdFx0XHRcdFx0Ly8gRmluZCB0aGUgcGl4ZWwgb2Zmc2V0IGJldHdlZW4gdGhlIGN1cnJlbnQgcG9zaXRpb24gYW5kIHRoZSBuZXh0IHRhYiBzdG9wXG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9mZnNldEJlZm9yZSA9IHggKyB0YWJYT2Zmc2V0O1xuXHRcdFx0XHRcdFx0XHR0YWJYT2Zmc2V0ID0gQ3Vyc29yQ29sdW1ucy5uZXh0UmVuZGVyVGFiU3RvcCh4ICsgdGFiWE9mZnNldCwgbGluZURhdGEudGFiU2l6ZSk7XG5cdFx0XHRcdFx0XHRcdGFic29sdXRlT2Zmc2V0WCArPSBjaGFyV2lkdGggKiAodGFiWE9mZnNldCAtIG9mZnNldEJlZm9yZSk7XG5cdFx0XHRcdFx0XHRcdC8vIENvbnZlcnQgYmFjayB0byBvZmZzZXQgZXhjbHVkaW5nIHggYW5kIHRoZSBjdXJyZW50IGNoYXJhY3RlclxuXHRcdFx0XHRcdFx0XHR0YWJYT2Zmc2V0IC09IHggKyAxO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0YWJzb2x1dGVPZmZzZXRYICs9IGNoYXJXaWR0aDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGRlY29yYXRpb25TdHlsZVNldElkID0gVmlld0dwdUNvbnRleHQuZGVjb3JhdGlvblN0eWxlQ2FjaGUuZ2V0T3JDcmVhdGVFbnRyeShkZWNvcmF0aW9uU3R5bGVTZXRDb2xvciwgZGVjb3JhdGlvblN0eWxlU2V0Qm9sZCwgZGVjb3JhdGlvblN0eWxlU2V0T3BhY2l0eSwgZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaCwgZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaFRoaWNrbmVzcywgZGVjb3JhdGlvblN0eWxlU2V0U3RyaWtldGhyb3VnaENvbG9yKTtcblx0XHRcdFx0XHRnbHlwaCA9IHRoaXMuX3ZpZXdHcHVDb250ZXh0LmF0bGFzLmdldEdseXBoKHRoaXMuZ2x5cGhSYXN0ZXJpemVyLCBjaGFycywgdG9rZW5NZXRhZGF0YSwgZGVjb3JhdGlvblN0eWxlU2V0SWQsIGFic29sdXRlT2Zmc2V0WCk7XG5cblx0XHRcdFx0XHRhYnNvbHV0ZU9mZnNldFkgPSBNYXRoLnJvdW5kKFxuXHRcdFx0XHRcdFx0Ly8gVG9wIG9mIGxheW91dCBib3ggKGluY2x1ZGVzIGxpbmUgaGVpZ2h0KVxuXHRcdFx0XHRcdFx0dmlld3BvcnREYXRhLnJlbGF0aXZlVmVydGljYWxPZmZzZXRbeSAtIHZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXJdICogZHByICtcblxuXHRcdFx0XHRcdFx0Ly8gRGVsdGEgZnJvbSB0b3Agb2YgbGF5b3V0IGJveCAoaW5jbHVkZXMgbGluZSBoZWlnaHQpIHRvIHRvcCBvZiB0aGUgaW5saW5lIGJveCAobm8gbGluZSBoZWlnaHQpXG5cdFx0XHRcdFx0XHRNYXRoLmZsb29yKCh2aWV3cG9ydERhdGEubGluZUhlaWdodCAqIGRwciAtIChnbHlwaC5mb250Qm91bmRpbmdCb3hBc2NlbnQgKyBnbHlwaC5mb250Qm91bmRpbmdCb3hEZXNjZW50KSkgLyAyKSArXG5cblx0XHRcdFx0XHRcdC8vIERlbHRhIGZyb20gdG9wIG9mIGlubGluZSBib3ggKG5vIGxpbmUgaGVpZ2h0KSB0byB0b3Agb2YgZ2x5cGggb3JpZ2luLiBJZiB0aGUgZ2x5cGggd2FzIGRyYXduXG5cdFx0XHRcdFx0XHQvLyB3aXRoIGEgdG9wIGJhc2VsaW5lIGZvciBleGFtcGxlLCB0aGlzIGVuZHMgdXAgZHJhd2luZyB0aGUgZ2x5cGggY29ycmVjdGx5IHVzaW5nIHRoZSBhbHBoYWJldGljYWxcblx0XHRcdFx0XHRcdC8vIGJhc2VsaW5lLlxuXHRcdFx0XHRcdFx0Z2x5cGguZm9udEJvdW5kaW5nQm94QXNjZW50XG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdGNlbGxJbmRleCA9ICgoeSAtIHZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXIpICogVmlld3BvcnRSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRDb2x1bW5zICsgeCkgKiBDb25zdGFudHMuSW5kaWNlc1BlckNlbGw7XG5cdFx0XHRcdFx0Y2VsbEJ1ZmZlcltjZWxsSW5kZXggKyBDZWxsQnVmZmVySW5mby5PZmZzZXRfWF0gPSBNYXRoLmZsb29yKGFic29sdXRlT2Zmc2V0WCk7XG5cdFx0XHRcdFx0Y2VsbEJ1ZmZlcltjZWxsSW5kZXggKyBDZWxsQnVmZmVySW5mby5PZmZzZXRfWV0gPSBhYnNvbHV0ZU9mZnNldFk7XG5cdFx0XHRcdFx0Y2VsbEJ1ZmZlcltjZWxsSW5kZXggKyBDZWxsQnVmZmVySW5mby5HbHlwaEluZGV4XSA9IGdseXBoLmdseXBoSW5kZXg7XG5cdFx0XHRcdFx0Y2VsbEJ1ZmZlcltjZWxsSW5kZXggKyBDZWxsQnVmZmVySW5mby5UZXh0dXJlSW5kZXhdID0gZ2x5cGgucGFnZUluZGV4O1xuXG5cdFx0XHRcdFx0Ly8gQWRqdXN0IHRoZSB4IHBpeGVsIG9mZnNldCBmb3IgdGhlIG5leHQgY2hhcmFjdGVyXG5cdFx0XHRcdFx0YWJzb2x1dGVPZmZzZXRYICs9IGNoYXJXaWR0aDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRva2VuU3RhcnRJbmRleCA9IHRva2VuRW5kSW5kZXg7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENsZWFyIHRvIGVuZCBvZiBsaW5lXG5cdFx0XHRmaWxsU3RhcnRJbmRleCA9ICgoeSAtIHZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXIpICogVmlld3BvcnRSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRDb2x1bW5zICsgdG9rZW5FbmRJbmRleCkgKiBDb25zdGFudHMuSW5kaWNlc1BlckNlbGw7XG5cdFx0XHRmaWxsRW5kSW5kZXggPSAoKHkgLSB2aWV3cG9ydERhdGEuc3RhcnRMaW5lTnVtYmVyKSAqIFZpZXdwb3J0UmVuZGVyU3RyYXRlZ3kubWF4U3VwcG9ydGVkQ29sdW1ucykgKiBDb25zdGFudHMuSW5kaWNlc1BlckNlbGw7XG5cdFx0XHRjZWxsQnVmZmVyLmZpbGwoMCwgZmlsbFN0YXJ0SW5kZXgsIGZpbGxFbmRJbmRleCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmlzaWJsZU9iamVjdENvdW50ID0gKHZpZXdwb3J0RGF0YS5lbmRMaW5lTnVtYmVyIC0gdmlld3BvcnREYXRhLnN0YXJ0TGluZU51bWJlciArIDEpICogbGluZUluZGV4Q291bnQ7XG5cdFx0Y29uc3Qgdmlld3BvcnRMaW5lQ291bnQgPSB2aWV3cG9ydERhdGEuZW5kTGluZU51bWJlciAtIHZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXIgKyAxO1xuXG5cdFx0Ly8gVGhpcyByZW5kZXIgc3RyYXRlZ3kgYWx3YXlzIHVwbG9hZHMgdGhlIHdob2xlIHZpZXdwb3J0XG5cdFx0dGhpcy5fZGV2aWNlLnF1ZXVlLndyaXRlQnVmZmVyKFxuXHRcdFx0dGhpcy5fY2VsbEJpbmRCdWZmZXIsXG5cdFx0XHQwLFxuXHRcdFx0Y2VsbEJ1ZmZlci5idWZmZXIsXG5cdFx0XHQwLFxuXHRcdFx0dmlzaWJsZU9iamVjdENvdW50ICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5UXG5cdFx0KTtcblxuXHRcdC8vIENsZWFyIHN0YWxlIGxpbmVzIGluIEdQVSBidWZmZXIgaWYgdmlld3BvcnQgc2hydW5rXG5cdFx0aWYgKHZpZXdwb3J0TGluZUNvdW50IDwgdGhpcy5fbGFzdFZpZXdwb3J0TGluZUNvdW50KSB7XG5cdFx0XHRjb25zdCBzdGFsZUxpbmVDb3VudCA9IHRoaXMuX2xhc3RWaWV3cG9ydExpbmVDb3VudCAtIHZpZXdwb3J0TGluZUNvdW50O1xuXHRcdFx0Y29uc3Qgc3RhbGVTdGFydE9mZnNldCA9IHZpc2libGVPYmplY3RDb3VudCAqIEZsb2F0MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVDtcblx0XHRcdGNvbnN0IHN0YWxlQnl0ZUNvdW50ID0gc3RhbGVMaW5lQ291bnQgKiBsaW5lSW5kZXhDb3VudCAqIEZsb2F0MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVDtcblx0XHRcdC8vIFdyaXRlIHplcm9zIGZyb20gdGhlIHplcm9lZCBjZWxsQnVmZmVyIGZvciB0aGUgc3RhbGUgcmVnaW9uXG5cdFx0XHR0aGlzLl9kZXZpY2UucXVldWUud3JpdGVCdWZmZXIoXG5cdFx0XHRcdHRoaXMuX2NlbGxCaW5kQnVmZmVyLFxuXHRcdFx0XHRzdGFsZVN0YXJ0T2Zmc2V0LFxuXHRcdFx0XHRjZWxsQnVmZmVyLmJ1ZmZlcixcblx0XHRcdFx0dmlzaWJsZU9iamVjdENvdW50ICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5ULFxuXHRcdFx0XHRzdGFsZUJ5dGVDb3VudFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0dGhpcy5fbGFzdFZpZXdwb3J0TGluZUNvdW50ID0gdmlld3BvcnRMaW5lQ291bnQ7XG5cblx0XHR0aGlzLl9hY3RpdmVEb3VibGVCdWZmZXJJbmRleCA9IHRoaXMuX2FjdGl2ZURvdWJsZUJ1ZmZlckluZGV4ID8gMCA6IDE7XG5cblx0XHR0aGlzLl92aXNpYmxlT2JqZWN0Q291bnQgPSB2aXNpYmxlT2JqZWN0Q291bnQ7XG5cblx0XHRyZXR1cm4gdmlzaWJsZU9iamVjdENvdW50O1xuXHR9XG5cblx0ZHJhdyhwYXNzOiBHUFVSZW5kZXJQYXNzRW5jb2Rlciwgdmlld3BvcnREYXRhOiBWaWV3cG9ydERhdGEpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdmlzaWJsZU9iamVjdENvdW50IDw9IDApIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0F0dGVtcHQgdG8gZHJhdyAwIG9iamVjdHMnKTtcblx0XHR9XG5cdFx0cGFzcy5kcmF3KHF1YWRWZXJ0aWNlcy5sZW5ndGggLyAyLCB0aGlzLl92aXNpYmxlT2JqZWN0Q291bnQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHBhcnNlQ3NzRm9udFdlaWdodCh2YWx1ZTogc3RyaW5nKSB7XG5cdHN3aXRjaCAodmFsdWUpIHtcblx0XHRjYXNlICdsaWdodGVyJzpcblx0XHRjYXNlICdub3JtYWwnOiByZXR1cm4gNDAwO1xuXHRcdGNhc2UgJ2JvbGRlcic6XG5cdFx0Y2FzZSAnYm9sZCc6IHJldHVybiA3MDA7XG5cdH1cblx0cmV0dXJuIHBhcnNlSW50KHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VDc3NPcGFjaXR5KHZhbHVlOiBzdHJpbmcpOiBudW1iZXIge1xuXHRpZiAodmFsdWUuZW5kc1dpdGgoJyUnKSkge1xuXHRcdHJldHVybiBwYXJzZUZsb2F0KHZhbHVlLnN1YnN0cmluZygwLCB2YWx1ZS5sZW5ndGggLSAxKSkgLyAxMDA7XG5cdH1cblx0aWYgKHZhbHVlLm1hdGNoKC9eXFxkKyg/OlxcLlxcZCopLykpIHtcblx0XHRyZXR1cm4gcGFyc2VGbG9hdCh2YWx1ZSk7XG5cdH1cblx0cmV0dXJuIDE7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGFBQWE7QUFDdEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMscUJBQXFCO0FBUzlCLFNBQVMsOEJBQXNEO0FBQy9ELFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0NB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Qix3QkFBdUIsc0JBQXNCLGlCQUFpQjtBQUNySCxzQkFBaUIsSUFBSSxhQUFhLG1CQUFtQix3QkFBdUIsc0JBQXVCO0FBQ25HLGlCQUFXLEtBQUssR0FBRyxnQkFBZ0IsWUFBWTtBQUFBLElBQ2hEO0FBRUEsVUFBTSxzQkFBc0IsYUFBYSxnQkFBZ0IsYUFBYSxrQkFBa0IsS0FBSztBQUM3RixVQUFNLG9CQUFvQixhQUFhLGdCQUFnQixhQUFhLGtCQUFrQjtBQUd0RixTQUFLLFFBQVEsTUFBTTtBQUFBLE1BQ2xCLEtBQUs7QUFBQSxNQUNMO0FBQUEsTUFDQSxXQUFXO0FBQUEsTUFDWDtBQUFBLE1BQ0EscUJBQXFCLGFBQWE7QUFBQSxJQUNuQztBQUdBLFFBQUksb0JBQW9CLEtBQUssd0JBQXdCO0FBQ3BELFlBQU0saUJBQWlCLEtBQUsseUJBQXlCO0FBQ3JELFlBQU0sbUJBQW1CLHFCQUFxQixhQUFhO0FBQzNELFlBQU0saUJBQWlCLGlCQUFpQixpQkFBaUIsYUFBYTtBQUV0RSxXQUFLLFFBQVEsTUFBTTtBQUFBLFFBQ2xCLEtBQUs7QUFBQSxRQUNMO0FBQUEsUUFDQSxXQUFXO0FBQUEsUUFDWCxxQkFBcUIsYUFBYTtBQUFBLFFBQ2xDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxTQUFLLHlCQUF5QjtBQUU5QixTQUFLLDJCQUEyQixLQUFLLDJCQUEyQixJQUFJO0FBRXBFLFNBQUssc0JBQXNCO0FBRTNCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxLQUFLLE1BQTRCLGNBQWtDO0FBQ2xFLFFBQUksS0FBSyx1QkFBdUIsR0FBRztBQUNsQyxZQUFNLElBQUksbUJBQW1CLDJCQUEyQjtBQUFBLElBQ3pEO0FBQ0EsU0FBSyxLQUFLLGFBQWEsU0FBUyxHQUFHLEtBQUssbUJBQW1CO0FBQUEsRUFDNUQ7QUFDRDtBQUFBO0FBQUE7QUFBQTtBQW5hYSx3QkFJSSxzQkFBc0I7QUFKaEMsSUFBTSx5QkFBTjtBQXFhUCxTQUFTLG1CQUFtQixPQUFlO0FBQzFDLFVBQVEsT0FBTztBQUFBLElBQ2QsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFVLGFBQU87QUFBQSxJQUN0QixLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQVEsYUFBTztBQUFBLEVBQ3JCO0FBQ0EsU0FBTyxTQUFTLEtBQUs7QUFDdEI7QUFFQSxTQUFTLGdCQUFnQixPQUF1QjtBQUMvQyxNQUFJLE1BQU0sU0FBUyxHQUFHLEdBQUc7QUFDeEIsV0FBTyxXQUFXLE1BQU0sVUFBVSxHQUFHLE1BQU0sU0FBUyxDQUFDLENBQUMsSUFBSTtBQUFBLEVBQzNEO0FBQ0EsTUFBSSxNQUFNLE1BQU0sZUFBZSxHQUFHO0FBQ2pDLFdBQU8sV0FBVyxLQUFLO0FBQUEsRUFDeEI7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbIkNvbnN0YW50cyIsICJDZWxsQnVmZmVySW5mbyJdCn0K
