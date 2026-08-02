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
import { getActiveWindow } from "../../../../base/browser/dom.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { autorun, runOnChange } from "../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { TextureAtlasPage } from "../../gpu/atlas/textureAtlasPage.js";
import { BindingId } from "../../gpu/gpu.js";
import { GPULifecycle } from "../../gpu/gpuDisposable.js";
import { quadVertices } from "../../gpu/gpuUtils.js";
import { ViewGpuContext } from "../../gpu/viewGpuContext.js";
import { FloatHorizontalRange, HorizontalPosition, HorizontalRange, LineVisibleRanges, VisibleRanges } from "../../view/renderingContext.js";
import { ViewPart } from "../../view/viewPart.js";
import { ViewLineOptions } from "../viewLines/viewLineOptions.js";
import { CursorColumns } from "../../../common/core/cursorColumns.js";
import { TextureAtlas } from "../../gpu/atlas/textureAtlas.js";
import { createContentSegmenter } from "../../gpu/contentSegmenter.js";
import { ViewportRenderStrategy } from "../../gpu/renderStrategy/viewportRenderStrategy.js";
import { FullFileRenderStrategy } from "../../gpu/renderStrategy/fullFileRenderStrategy.js";
import { MutableDisposable } from "../../../../base/common/lifecycle.js";
import { GlyphRasterizer } from "../../gpu/raster/glyphRasterizer.js";
var GlyphStorageBufferInfo = /* @__PURE__ */ ((GlyphStorageBufferInfo2) => {
  GlyphStorageBufferInfo2[GlyphStorageBufferInfo2["FloatsPerEntry"] = 6] = "FloatsPerEntry";
  GlyphStorageBufferInfo2[GlyphStorageBufferInfo2["BytesPerEntry"] = 24] = "BytesPerEntry";
  GlyphStorageBufferInfo2[GlyphStorageBufferInfo2["Offset_TexturePosition"] = 0] = "Offset_TexturePosition";
  GlyphStorageBufferInfo2[GlyphStorageBufferInfo2["Offset_TextureSize"] = 2] = "Offset_TextureSize";
  GlyphStorageBufferInfo2[GlyphStorageBufferInfo2["Offset_OriginPosition"] = 4] = "Offset_OriginPosition";
  return GlyphStorageBufferInfo2;
})(GlyphStorageBufferInfo || {});
let ViewLinesGpu = class extends ViewPart {
  constructor(context, _viewGpuContext, _instantiationService, _logService) {
    super(context);
    this._viewGpuContext = _viewGpuContext;
    this._instantiationService = _instantiationService;
    this._logService = _logService;
    /**
     * Tracks the maximum line width seen so far for horizontal scrollbar sizing.
     * This is needed because GPU-rendered lines don't have DOM nodes to measure.
     */
    this._maxLineWidth = 0;
    this._atlasGpuTextureVersions = [];
    this._initialized = false;
    this._glyphRasterizer = this._register(new MutableDisposable());
    this._renderStrategy = this._register(new MutableDisposable());
    this.canvas = this._viewGpuContext.canvas.domNode;
    this._register(autorun((reader) => {
      this._viewGpuContext.canvasDevicePixelDimensions.read(reader);
      const lastViewportData = this._lastViewportData;
      if (lastViewportData) {
        setTimeout(() => {
          if (lastViewportData === this._lastViewportData) {
            this.renderText(lastViewportData);
          }
        });
      }
    }));
    this.initWebgpu();
  }
  async initWebgpu() {
    this._device = ViewGpuContext.deviceSync || await ViewGpuContext.device;
    if (this._store.isDisposed) {
      return;
    }
    const atlas = ViewGpuContext.atlas;
    this._register(atlas.onDidDeleteGlyphs(() => {
      this._atlasGpuTextureVersions.length = 0;
      this._atlasGpuTextureVersions[0] = 0;
      this._atlasGpuTextureVersions[1] = 0;
      this._renderStrategy.value.reset();
    }));
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this._viewGpuContext.ctx.configure({
      device: this._device,
      format: presentationFormat,
      alphaMode: "premultiplied"
    });
    this._renderPassColorAttachment = {
      view: null,
      // Will be filled at render time
      loadOp: "load",
      storeOp: "store"
    };
    this._renderPassDescriptor = {
      label: "Monaco render pass",
      colorAttachments: [this._renderPassColorAttachment]
    };
    let layoutInfoUniformBuffer;
    {
      let Info;
      ((Info2) => {
        Info2[Info2["FloatsPerEntry"] = 6] = "FloatsPerEntry";
        Info2[Info2["BytesPerEntry"] = 24] = "BytesPerEntry";
        Info2[Info2["Offset_CanvasWidth____"] = 0] = "Offset_CanvasWidth____";
        Info2[Info2["Offset_CanvasHeight___"] = 1] = "Offset_CanvasHeight___";
        Info2[Info2["Offset_ViewportOffsetX"] = 2] = "Offset_ViewportOffsetX";
        Info2[Info2["Offset_ViewportOffsetY"] = 3] = "Offset_ViewportOffsetY";
        Info2[Info2["Offset_ViewportWidth__"] = 4] = "Offset_ViewportWidth__";
        Info2[Info2["Offset_ViewportHeight_"] = 5] = "Offset_ViewportHeight_";
      })(Info || (Info = {}));
      const bufferValues = new Float32Array(6 /* FloatsPerEntry */);
      const updateBufferValues = (canvasDevicePixelWidth = this.canvas.width, canvasDevicePixelHeight = this.canvas.height) => {
        bufferValues[0 /* Offset_CanvasWidth____ */] = canvasDevicePixelWidth;
        bufferValues[1 /* Offset_CanvasHeight___ */] = canvasDevicePixelHeight;
        bufferValues[2 /* Offset_ViewportOffsetX */] = Math.ceil(this._context.configuration.options.get(EditorOption.layoutInfo).contentLeft * getActiveWindow().devicePixelRatio);
        bufferValues[3 /* Offset_ViewportOffsetY */] = 0;
        bufferValues[4 /* Offset_ViewportWidth__ */] = bufferValues[0 /* Offset_CanvasWidth____ */] - bufferValues[2 /* Offset_ViewportOffsetX */];
        bufferValues[5 /* Offset_ViewportHeight_ */] = bufferValues[1 /* Offset_CanvasHeight___ */] - bufferValues[3 /* Offset_ViewportOffsetY */];
        return bufferValues;
      };
      layoutInfoUniformBuffer = this._register(GPULifecycle.createBuffer(this._device, {
        label: "Monaco uniform buffer",
        size: 24 /* BytesPerEntry */,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }, () => updateBufferValues())).object;
      this._register(runOnChange(this._viewGpuContext.canvasDevicePixelDimensions, ({ width, height }) => {
        this._device.queue.writeBuffer(layoutInfoUniformBuffer, 0, updateBufferValues(width, height));
      }));
      this._register(runOnChange(this._viewGpuContext.contentLeft, () => {
        this._device.queue.writeBuffer(layoutInfoUniformBuffer, 0, updateBufferValues());
      }));
    }
    let atlasInfoUniformBuffer;
    {
      let Info;
      ((Info2) => {
        Info2[Info2["FloatsPerEntry"] = 2] = "FloatsPerEntry";
        Info2[Info2["BytesPerEntry"] = 8] = "BytesPerEntry";
        Info2[Info2["Offset_Width_"] = 0] = "Offset_Width_";
        Info2[Info2["Offset_Height"] = 1] = "Offset_Height";
      })(Info || (Info = {}));
      atlasInfoUniformBuffer = this._register(GPULifecycle.createBuffer(this._device, {
        label: "Monaco atlas info uniform buffer",
        size: 8 /* BytesPerEntry */,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }, () => {
        const values = new Float32Array(2 /* FloatsPerEntry */);
        values[0 /* Offset_Width_ */] = atlas.pageSize;
        values[1 /* Offset_Height */] = atlas.pageSize;
        return values;
      })).object;
    }
    const fontFamily = this._context.configuration.options.get(EditorOption.fontFamily);
    const fontSize = this._context.configuration.options.get(EditorOption.fontSize);
    this._glyphRasterizer.value = this._register(new GlyphRasterizer(fontSize, fontFamily, this._viewGpuContext.devicePixelRatio.get(), ViewGpuContext.decorationStyleCache));
    this._register(runOnChange(this._viewGpuContext.devicePixelRatio, () => {
      this._refreshGlyphRasterizer();
    }));
    this._renderStrategy.value = this._instantiationService.createInstance(FullFileRenderStrategy, this._context, this._viewGpuContext, this._device, this._glyphRasterizer);
    this._glyphStorageBuffer = this._register(GPULifecycle.createBuffer(this._device, {
      label: "Monaco glyph storage buffer",
      size: TextureAtlas.maximumPageCount * (TextureAtlasPage.maximumGlyphCount * 24 /* BytesPerEntry */),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })).object;
    this._atlasGpuTextureVersions[0] = 0;
    this._atlasGpuTextureVersions[1] = 0;
    this._atlasGpuTexture = this._register(GPULifecycle.createTexture(this._device, {
      label: "Monaco atlas texture",
      format: "rgba8unorm",
      size: { width: atlas.pageSize, height: atlas.pageSize, depthOrArrayLayers: TextureAtlas.maximumPageCount },
      dimension: "2d",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    })).object;
    this._updateAtlasStorageBufferAndTexture();
    this._vertexBuffer = this._register(GPULifecycle.createBuffer(this._device, {
      label: "Monaco vertex buffer",
      size: quadVertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    }, quadVertices)).object;
    const module = this._device.createShaderModule({
      label: "Monaco shader module",
      code: this._renderStrategy.value.wgsl
    });
    this._pipeline = this._device.createRenderPipeline({
      label: "Monaco render pipeline",
      layout: "auto",
      vertex: {
        module,
        buffers: [
          {
            arrayStride: 2 * Float32Array.BYTES_PER_ELEMENT,
            // 2 floats, 4 bytes each
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" }
              // position
            ]
          }
        ]
      },
      fragment: {
        module,
        targets: [
          {
            format: presentationFormat,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha"
              },
              alpha: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha"
              }
            }
          }
        ]
      }
    });
    this._rebuildBindGroup = () => {
      this._bindGroup = this._device.createBindGroup({
        label: "Monaco bind group",
        layout: this._pipeline.getBindGroupLayout(0),
        entries: [
          // TODO: Pass in generically as array?
          { binding: BindingId.GlyphInfo, resource: { buffer: this._glyphStorageBuffer } },
          {
            binding: BindingId.TextureSampler,
            resource: this._device.createSampler({
              label: "Monaco atlas sampler",
              magFilter: "nearest",
              minFilter: "nearest"
            })
          },
          { binding: BindingId.Texture, resource: this._atlasGpuTexture.createView() },
          { binding: BindingId.LayoutInfoUniform, resource: { buffer: layoutInfoUniformBuffer } },
          { binding: BindingId.AtlasDimensionsUniform, resource: { buffer: atlasInfoUniformBuffer } },
          ...this._renderStrategy.value.bindGroupEntries
        ]
      });
    };
    this._rebuildBindGroup();
    this._initialized = true;
    if (this._initViewportData) {
      for (const viewportData of this._initViewportData) {
        this.renderText(viewportData);
      }
      this._initViewportData = void 0;
    }
  }
  _refreshRenderStrategy(viewportData) {
    if (this._renderStrategy.value?.type === "viewport") {
      return;
    }
    if (viewportData.endLineNumber < FullFileRenderStrategy.maxSupportedLines && this._viewportMaxColumn(viewportData) < FullFileRenderStrategy.maxSupportedColumns) {
      return;
    }
    this._logService.trace(`File is larger than ${FullFileRenderStrategy.maxSupportedLines} lines or ${FullFileRenderStrategy.maxSupportedColumns} columns, switching to viewport render strategy`);
    const viewportRenderStrategy = this._instantiationService.createInstance(ViewportRenderStrategy, this._context, this._viewGpuContext, this._device, this._glyphRasterizer);
    this._renderStrategy.value = viewportRenderStrategy;
    this._register(viewportRenderStrategy.onDidChangeBindGroupEntries(() => this._rebuildBindGroup?.()));
    this._rebuildBindGroup?.();
  }
  _viewportMaxColumn(viewportData) {
    let maxColumn = 0;
    let lineData;
    for (let i = viewportData.startLineNumber; i <= viewportData.endLineNumber; i++) {
      lineData = viewportData.getViewLineRenderingData(i);
      maxColumn = Math.max(maxColumn, lineData.maxColumn);
    }
    return maxColumn;
  }
  _updateAtlasStorageBufferAndTexture() {
    for (const [layerIndex, page] of ViewGpuContext.atlas.pages.entries()) {
      if (layerIndex >= TextureAtlas.maximumPageCount) {
        console.log(`Attempt to upload atlas page [${layerIndex}], only ${TextureAtlas.maximumPageCount} are supported currently`);
        continue;
      }
      if (page.version === this._atlasGpuTextureVersions[layerIndex]) {
        continue;
      }
      this._logService.trace("Updating atlas page[", layerIndex, "] from version ", this._atlasGpuTextureVersions[layerIndex], " to version ", page.version);
      const entryCount = 6 /* FloatsPerEntry */ * TextureAtlasPage.maximumGlyphCount;
      const values = new Float32Array(entryCount);
      let entryOffset = 0;
      for (const glyph of page.glyphs) {
        values[entryOffset + 0 /* Offset_TexturePosition */] = glyph.x;
        values[entryOffset + 0 /* Offset_TexturePosition */ + 1] = glyph.y;
        values[entryOffset + 2 /* Offset_TextureSize */] = glyph.w;
        values[entryOffset + 2 /* Offset_TextureSize */ + 1] = glyph.h;
        values[entryOffset + 4 /* Offset_OriginPosition */] = glyph.originOffsetX;
        values[entryOffset + 4 /* Offset_OriginPosition */ + 1] = glyph.originOffsetY;
        entryOffset += 6 /* FloatsPerEntry */;
      }
      if (entryOffset / 6 /* FloatsPerEntry */ > TextureAtlasPage.maximumGlyphCount) {
        throw new Error(`Attempting to write more glyphs (${entryOffset / 6 /* FloatsPerEntry */}) than the GPUBuffer can hold (${TextureAtlasPage.maximumGlyphCount})`);
      }
      this._device.queue.writeBuffer(
        this._glyphStorageBuffer,
        layerIndex * 6 /* FloatsPerEntry */ * TextureAtlasPage.maximumGlyphCount * Float32Array.BYTES_PER_ELEMENT,
        values,
        0,
        6 /* FloatsPerEntry */ * TextureAtlasPage.maximumGlyphCount
      );
      if (page.usedArea.right - page.usedArea.left > 0 && page.usedArea.bottom - page.usedArea.top > 0) {
        this._device.queue.copyExternalImageToTexture(
          { source: page.source },
          {
            texture: this._atlasGpuTexture,
            origin: {
              x: page.usedArea.left,
              y: page.usedArea.top,
              z: layerIndex
            }
          },
          {
            width: page.usedArea.right - page.usedArea.left + 1,
            height: page.usedArea.bottom - page.usedArea.top + 1
          }
        );
      }
      this._atlasGpuTextureVersions[layerIndex] = page.version;
    }
  }
  prepareRender(ctx) {
    throw new BugIndicatingError("Should not be called");
  }
  render(ctx) {
    throw new BugIndicatingError("Should not be called");
  }
  // #region Event handlers
  // Since ViewLinesGpu currently coordinates rendering to the canvas, it must listen to all
  // changed events that any GPU part listens to. This is because any drawing to the canvas will
  // clear it for that frame, so all parts must be rendered every time.
  //
  // Additionally, since this is intrinsically linked to ViewLines, it must also listen to events
  // from that side. Luckily rendering is cheap, it's only when uploaded data changes does it
  // start to cost.
  onConfigurationChanged(e) {
    this._refreshGlyphRasterizer();
    this._maxLineWidth = 0;
    return true;
  }
  onCursorStateChanged(e) {
    return true;
  }
  onDecorationsChanged(e) {
    return true;
  }
  onFlushed(e) {
    this._maxLineWidth = 0;
    return true;
  }
  onLinesChanged(e) {
    return true;
  }
  onLinesDeleted(e) {
    this._maxLineWidth = 0;
    return true;
  }
  onLinesInserted(e) {
    return true;
  }
  onLineMappingChanged(e) {
    return true;
  }
  onRevealRangeRequest(e) {
    return true;
  }
  onScrollChanged(e) {
    return true;
  }
  onThemeChanged(e) {
    return true;
  }
  onZonesChanged(e) {
    return true;
  }
  // #endregion
  _refreshGlyphRasterizer() {
    const glyphRasterizer = this._glyphRasterizer.value;
    if (!glyphRasterizer) {
      return;
    }
    const fontFamily = this._context.configuration.options.get(EditorOption.fontFamily);
    const fontSize = this._context.configuration.options.get(EditorOption.fontSize);
    const devicePixelRatio = this._viewGpuContext.devicePixelRatio.get();
    if (glyphRasterizer.fontFamily !== fontFamily || glyphRasterizer.fontSize !== fontSize || glyphRasterizer.devicePixelRatio !== devicePixelRatio) {
      this._glyphRasterizer.value = new GlyphRasterizer(fontSize, fontFamily, devicePixelRatio, ViewGpuContext.decorationStyleCache);
    }
  }
  renderText(viewportData) {
    if (this._initialized) {
      this._refreshRenderStrategy(viewportData);
      return this._renderText(viewportData);
    } else {
      this._initViewportData = this._initViewportData ?? [];
      this._initViewportData.push(viewportData);
    }
  }
  _renderText(viewportData) {
    this._viewGpuContext.rectangleRenderer.draw(viewportData);
    const options = new ViewLineOptions(this._context.configuration, this._context.theme.type);
    this._renderStrategy.value.update(viewportData, options);
    this._updateAtlasStorageBufferAndTexture();
    const encoder = this._device.createCommandEncoder({ label: "Monaco command encoder" });
    this._renderPassColorAttachment.view = this._viewGpuContext.ctx.getCurrentTexture().createView({ label: "Monaco canvas texture view" });
    const pass = encoder.beginRenderPass(this._renderPassDescriptor);
    pass.setPipeline(this._pipeline);
    pass.setVertexBuffer(0, this._vertexBuffer);
    const contentLeft = Math.ceil(this._viewGpuContext.contentLeft.get() * this._viewGpuContext.devicePixelRatio.get());
    pass.setScissorRect(contentLeft, 0, this.canvas.width - contentLeft, this.canvas.height);
    pass.setBindGroup(0, this._bindGroup);
    this._renderStrategy.value.draw(pass, viewportData);
    pass.end();
    const commandBuffer = encoder.finish();
    this._device.queue.submit([commandBuffer]);
    this._lastViewportData = viewportData;
    this._lastViewLineOptions = options;
    this._updateMaxLineWidth(viewportData, options);
  }
  /**
   * Update the max line width based on GPU-rendered lines.
   * This is needed because GPU-rendered lines don't have DOM nodes to measure.
   */
  _updateMaxLineWidth(viewportData, viewLineOptions) {
    const dpr = getActiveWindow().devicePixelRatio;
    let localMaxLineWidth = 0;
    for (let lineNumber = viewportData.startLineNumber; lineNumber <= viewportData.endLineNumber; lineNumber++) {
      if (!this._viewGpuContext.canRender(viewLineOptions, viewportData, lineNumber)) {
        continue;
      }
      const lineData = viewportData.getViewLineRenderingData(lineNumber);
      const lineWidth = this._computeLineWidth(lineData, viewLineOptions, dpr);
      localMaxLineWidth = Math.max(localMaxLineWidth, lineWidth);
    }
    const iLineWidth = Math.ceil(localMaxLineWidth);
    if (iLineWidth > this._maxLineWidth) {
      this._maxLineWidth = iLineWidth;
      this._context.viewModel.viewLayout.setMaxLineWidth(this._maxLineWidth);
    }
  }
  /**
   * Compute the width of a line in CSS pixels.
   */
  _computeLineWidth(lineData, viewLineOptions, dpr) {
    const content = lineData.content;
    let contentSegmenter;
    if (!(lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations)) {
      contentSegmenter = createContentSegmenter(lineData, viewLineOptions);
    }
    let width = 0;
    let tabXOffset = 0;
    for (let x = 0; x < content.length; x++) {
      let chars;
      if (lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations) {
        chars = content.charAt(x);
      } else {
        const segment = contentSegmenter.getSegmentAtIndex(x);
        if (segment === void 0) {
          continue;
        }
        chars = segment;
      }
      if (chars === "	") {
        const offsetBefore = x + tabXOffset;
        tabXOffset = CursorColumns.nextRenderTabStop(x + tabXOffset, lineData.tabSize);
        width += viewLineOptions.spaceWidth * (tabXOffset - offsetBefore);
        tabXOffset -= x + 1;
      } else if (lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations) {
        width += viewLineOptions.spaceWidth;
      } else {
        width += this._renderStrategy.value.glyphRasterizer.getTextMetrics(chars).width / dpr;
      }
    }
    return width;
  }
  linesVisibleRangesForRange(_range, includeNewLines) {
    if (!this._lastViewportData) {
      return null;
    }
    const originalEndLineNumber = _range.endLineNumber;
    const range = Range.intersectRanges(_range, this._lastViewportData.visibleRange);
    if (!range) {
      return null;
    }
    const rendStartLineNumber = this._lastViewportData.startLineNumber;
    const rendEndLineNumber = this._lastViewportData.endLineNumber;
    const viewportData = this._lastViewportData;
    const viewLineOptions = this._lastViewLineOptions;
    if (!viewportData || !viewLineOptions) {
      return null;
    }
    const visibleRanges = [];
    let nextLineModelLineNumber = 0;
    if (includeNewLines) {
      nextLineModelLineNumber = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(range.startLineNumber, 1)).lineNumber;
    }
    for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
      if (lineNumber < rendStartLineNumber || lineNumber > rendEndLineNumber) {
        continue;
      }
      const startColumn = lineNumber === range.startLineNumber ? range.startColumn : 1;
      const continuesInNextLine = lineNumber !== originalEndLineNumber;
      const endColumn = continuesInNextLine ? this._context.viewModel.getLineMaxColumn(lineNumber) : range.endColumn;
      const visibleRangesForLine = this._visibleRangesForLineRange(lineNumber, startColumn, endColumn);
      if (!visibleRangesForLine) {
        continue;
      }
      if (includeNewLines && lineNumber < originalEndLineNumber) {
        const currentLineModelLineNumber = nextLineModelLineNumber;
        nextLineModelLineNumber = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(lineNumber + 1, 1)).lineNumber;
        if (currentLineModelLineNumber !== nextLineModelLineNumber) {
          visibleRangesForLine.ranges[visibleRangesForLine.ranges.length - 1].width += viewLineOptions.spaceWidth;
        }
      }
      visibleRanges.push(new LineVisibleRanges(visibleRangesForLine.outsideRenderedLine, lineNumber, HorizontalRange.from(visibleRangesForLine.ranges), continuesInNextLine));
    }
    if (visibleRanges.length === 0) {
      return null;
    }
    return visibleRanges;
  }
  _visibleRangesForLineRange(lineNumber, startColumn, endColumn) {
    if (this.shouldRender()) {
      return null;
    }
    const viewportData = this._lastViewportData;
    const viewLineOptions = this._lastViewLineOptions;
    if (!viewportData || !viewLineOptions || lineNumber < viewportData.startLineNumber || lineNumber > viewportData.endLineNumber) {
      return null;
    }
    const lineData = viewportData.getViewLineRenderingData(lineNumber);
    const content = lineData.content;
    let contentSegmenter;
    if (!(lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations)) {
      contentSegmenter = createContentSegmenter(lineData, viewLineOptions);
    }
    let chars = "";
    let resolvedStartColumn = 0;
    let resolvedStartCssPixelOffset = 0;
    for (let x = 0; x < startColumn - 1; x++) {
      if (lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations) {
        chars = content.charAt(x);
      } else {
        chars = contentSegmenter.getSegmentAtIndex(x);
        if (chars === void 0) {
          continue;
        }
        resolvedStartCssPixelOffset += this._renderStrategy.value.glyphRasterizer.getTextMetrics(chars).width / getActiveWindow().devicePixelRatio - viewLineOptions.spaceWidth;
      }
      if (chars === "	") {
        resolvedStartColumn = CursorColumns.nextRenderTabStop(resolvedStartColumn, lineData.tabSize);
      } else {
        resolvedStartColumn++;
      }
    }
    let resolvedEndColumn = resolvedStartColumn;
    let resolvedEndCssPixelOffset = 0;
    for (let x = startColumn - 1; x < endColumn - 1; x++) {
      if (lineData.isBasicASCII && viewLineOptions.useMonospaceOptimizations) {
        chars = content.charAt(x);
      } else {
        chars = contentSegmenter.getSegmentAtIndex(x);
        if (chars === void 0) {
          continue;
        }
        resolvedEndCssPixelOffset += this._renderStrategy.value.glyphRasterizer.getTextMetrics(chars).width / getActiveWindow().devicePixelRatio - viewLineOptions.spaceWidth;
      }
      if (chars === "	") {
        resolvedEndColumn = CursorColumns.nextRenderTabStop(resolvedEndColumn, lineData.tabSize);
      } else {
        resolvedEndColumn++;
      }
    }
    const result = new VisibleRanges(false, [
      new FloatHorizontalRange(
        resolvedStartColumn * viewLineOptions.spaceWidth + resolvedStartCssPixelOffset,
        (resolvedEndColumn - resolvedStartColumn) * viewLineOptions.spaceWidth + resolvedEndCssPixelOffset
      )
    ]);
    return result;
  }
  visibleRangeForPosition(position) {
    const visibleRanges = this._visibleRangesForLineRange(position.lineNumber, position.column, position.column);
    if (!visibleRanges) {
      return null;
    }
    return new HorizontalPosition(visibleRanges.outsideRenderedLine, visibleRanges.ranges[0].left);
  }
  getLineWidth(lineNumber) {
    if (!this._lastViewportData || !this._lastViewLineOptions) {
      return void 0;
    }
    if (!this._viewGpuContext.canRender(this._lastViewLineOptions, this._lastViewportData, lineNumber)) {
      return void 0;
    }
    const lineData = this._lastViewportData.getViewLineRenderingData(lineNumber);
    const lineRange = this._visibleRangesForLineRange(lineNumber, 1, lineData.maxColumn);
    const lastRange = lineRange?.ranges.at(-1);
    if (lastRange) {
      return lastRange.left + lastRange.width;
    }
    return void 0;
  }
  getPositionAtCoordinate(lineNumber, mouseContentHorizontalOffset) {
    if (!this._lastViewportData || !this._lastViewLineOptions) {
      return void 0;
    }
    if (!this._viewGpuContext.canRender(this._lastViewLineOptions, this._lastViewportData, lineNumber)) {
      return void 0;
    }
    const lineData = this._lastViewportData.getViewLineRenderingData(lineNumber);
    const content = lineData.content;
    const dpr = getActiveWindow().devicePixelRatio;
    const mouseContentHorizontalOffsetDevicePixels = mouseContentHorizontalOffset * dpr;
    const spaceWidthDevicePixels = this._lastViewLineOptions.spaceWidth * dpr;
    const contentSegmenter = createContentSegmenter(lineData, this._lastViewLineOptions);
    let widthSoFar = 0;
    let charWidth = 0;
    let tabXOffset = 0;
    let column = 0;
    for (let x = 0; x < content.length; x++) {
      const chars = contentSegmenter.getSegmentAtIndex(x);
      if (chars === void 0) {
        column++;
        continue;
      }
      if (chars === "	") {
        const offsetBefore = x + tabXOffset;
        tabXOffset = CursorColumns.nextRenderTabStop(x + tabXOffset, lineData.tabSize);
        charWidth = spaceWidthDevicePixels * (tabXOffset - offsetBefore);
        tabXOffset -= x + 1;
      } else if (lineData.isBasicASCII && this._lastViewLineOptions.useMonospaceOptimizations) {
        charWidth = spaceWidthDevicePixels;
      } else {
        charWidth = this._renderStrategy.value.glyphRasterizer.getTextMetrics(chars).width;
      }
      if (mouseContentHorizontalOffsetDevicePixels < widthSoFar + charWidth / 2) {
        break;
      }
      widthSoFar += charWidth;
      column++;
    }
    return new Position(lineNumber, column + 1);
  }
};
ViewLinesGpu = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ILogService)
], ViewLinesGpu);
export {
  ViewLinesGpu
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3ZpZXdQYXJ0cy92aWV3TGluZXNHcHUvdmlld0xpbmVzR3B1LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZ2V0QWN0aXZlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgcnVuT25DaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB0eXBlIHsgVmlld3BvcnREYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdMYXlvdXQvdmlld0xpbmVzVmlld3BvcnREYXRhLmpzJztcbmltcG9ydCB0eXBlIHsgVmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdDb250ZXh0LmpzJztcbmltcG9ydCB7IFRleHR1cmVBdGxhc1BhZ2UgfSBmcm9tICcuLi8uLi9ncHUvYXRsYXMvdGV4dHVyZUF0bGFzUGFnZS5qcyc7XG5pbXBvcnQgeyBCaW5kaW5nSWQsIHR5cGUgSUdwdVJlbmRlclN0cmF0ZWd5IH0gZnJvbSAnLi4vLi4vZ3B1L2dwdS5qcyc7XG5pbXBvcnQgeyBHUFVMaWZlY3ljbGUgfSBmcm9tICcuLi8uLi9ncHUvZ3B1RGlzcG9zYWJsZS5qcyc7XG5pbXBvcnQgeyBxdWFkVmVydGljZXMgfSBmcm9tICcuLi8uLi9ncHUvZ3B1VXRpbHMuanMnO1xuaW1wb3J0IHsgVmlld0dwdUNvbnRleHQgfSBmcm9tICcuLi8uLi9ncHUvdmlld0dwdUNvbnRleHQuanMnO1xuaW1wb3J0IHsgRmxvYXRIb3Jpem9udGFsUmFuZ2UsIEhvcml6b250YWxQb3NpdGlvbiwgSG9yaXpvbnRhbFJhbmdlLCBJVmlld0xpbmVzLCBMaW5lVmlzaWJsZVJhbmdlcywgUmVuZGVyaW5nQ29udGV4dCwgUmVzdHJpY3RlZFJlbmRlcmluZ0NvbnRleHQsIFZpc2libGVSYW5nZXMgfSBmcm9tICcuLi8uLi92aWV3L3JlbmRlcmluZ0NvbnRleHQuanMnO1xuaW1wb3J0IHsgVmlld1BhcnQgfSBmcm9tICcuLi8uLi92aWV3L3ZpZXdQYXJ0LmpzJztcbmltcG9ydCB7IFZpZXdMaW5lT3B0aW9ucyB9IGZyb20gJy4uL3ZpZXdMaW5lcy92aWV3TGluZU9wdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgKiBhcyB2aWV3RXZlbnRzIGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3RXZlbnRzLmpzJztcbmltcG9ydCB7IEN1cnNvckNvbHVtbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9jdXJzb3JDb2x1bW5zLmpzJztcbmltcG9ydCB7IFRleHR1cmVBdGxhcyB9IGZyb20gJy4uLy4uL2dwdS9hdGxhcy90ZXh0dXJlQXRsYXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29udGVudFNlZ21lbnRlciwgdHlwZSBJQ29udGVudFNlZ21lbnRlciB9IGZyb20gJy4uLy4uL2dwdS9jb250ZW50U2VnbWVudGVyLmpzJztcbmltcG9ydCB7IFZpZXdwb3J0UmVuZGVyU3RyYXRlZ3kgfSBmcm9tICcuLi8uLi9ncHUvcmVuZGVyU3RyYXRlZ3kvdmlld3BvcnRSZW5kZXJTdHJhdGVneS5qcyc7XG5pbXBvcnQgeyBGdWxsRmlsZVJlbmRlclN0cmF0ZWd5IH0gZnJvbSAnLi4vLi4vZ3B1L3JlbmRlclN0cmF0ZWd5L2Z1bGxGaWxlUmVuZGVyU3RyYXRlZ3kuanMnO1xuaW1wb3J0IHsgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHR5cGUgeyBWaWV3TGluZVJlbmRlcmluZ0RhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsLmpzJztcbmltcG9ydCB7IEdseXBoUmFzdGVyaXplciB9IGZyb20gJy4uLy4uL2dwdS9yYXN0ZXIvZ2x5cGhSYXN0ZXJpemVyLmpzJztcblxuY29uc3QgZW51bSBHbHlwaFN0b3JhZ2VCdWZmZXJJbmZvIHtcblx0RmxvYXRzUGVyRW50cnkgPSAyICsgMiArIDIsXG5cdEJ5dGVzUGVyRW50cnkgPSBHbHlwaFN0b3JhZ2VCdWZmZXJJbmZvLkZsb2F0c1BlckVudHJ5ICogNCxcblx0T2Zmc2V0X1RleHR1cmVQb3NpdGlvbiA9IDAsXG5cdE9mZnNldF9UZXh0dXJlU2l6ZSA9IDIsXG5cdE9mZnNldF9PcmlnaW5Qb3NpdGlvbiA9IDQsXG59XG5cbi8qKlxuICogVGhlIEdQVSBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgVmlld0xpbmVzIHBhcnQuXG4gKi9cbmV4cG9ydCBjbGFzcyBWaWV3TGluZXNHcHUgZXh0ZW5kcyBWaWV3UGFydCBpbXBsZW1lbnRzIElWaWV3TGluZXMge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcblxuXHRwcml2YXRlIF9pbml0Vmlld3BvcnREYXRhPzogVmlld3BvcnREYXRhW107XG5cdHByaXZhdGUgX2xhc3RWaWV3cG9ydERhdGE/OiBWaWV3cG9ydERhdGE7XG5cdHByaXZhdGUgX2xhc3RWaWV3TGluZU9wdGlvbnM/OiBWaWV3TGluZU9wdGlvbnM7XG5cblx0LyoqXG5cdCAqIFRyYWNrcyB0aGUgbWF4aW11bSBsaW5lIHdpZHRoIHNlZW4gc28gZmFyIGZvciBob3Jpem9udGFsIHNjcm9sbGJhciBzaXppbmcuXG5cdCAqIFRoaXMgaXMgbmVlZGVkIGJlY2F1c2UgR1BVLXJlbmRlcmVkIGxpbmVzIGRvbid0IGhhdmUgRE9NIG5vZGVzIHRvIG1lYXN1cmUuXG5cdCAqL1xuXHRwcml2YXRlIF9tYXhMaW5lV2lkdGg6IG51bWJlciA9IDA7XG5cblx0cHJpdmF0ZSBfZGV2aWNlITogR1BVRGV2aWNlO1xuXHRwcml2YXRlIF9yZW5kZXJQYXNzRGVzY3JpcHRvciE6IEdQVVJlbmRlclBhc3NEZXNjcmlwdG9yO1xuXHRwcml2YXRlIF9yZW5kZXJQYXNzQ29sb3JBdHRhY2htZW50ITogR1BVUmVuZGVyUGFzc0NvbG9yQXR0YWNobWVudDtcblx0cHJpdmF0ZSBfYmluZEdyb3VwITogR1BVQmluZEdyb3VwO1xuXHRwcml2YXRlIF9waXBlbGluZSE6IEdQVVJlbmRlclBpcGVsaW5lO1xuXG5cdHByaXZhdGUgX3ZlcnRleEJ1ZmZlciE6IEdQVUJ1ZmZlcjtcblxuXHRwcml2YXRlIF9nbHlwaFN0b3JhZ2VCdWZmZXIhOiBHUFVCdWZmZXI7XG5cdHByaXZhdGUgX2F0bGFzR3B1VGV4dHVyZSE6IEdQVVRleHR1cmU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2F0bGFzR3B1VGV4dHVyZVZlcnNpb25zOiBudW1iZXJbXSA9IFtdO1xuXG5cdHByaXZhdGUgX2luaXRpYWxpemVkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZ2x5cGhSYXN0ZXJpemVyOiBNdXRhYmxlRGlzcG9zYWJsZTxHbHlwaFJhc3Rlcml6ZXI+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJTdHJhdGVneTogTXV0YWJsZURpc3Bvc2FibGU8SUdwdVJlbmRlclN0cmF0ZWd5PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBfcmVidWlsZEJpbmRHcm91cD86ICgpID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGV4dDogVmlld0NvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdmlld0dwdUNvbnRleHQ6IFZpZXdHcHVDb250ZXh0LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGNvbnRleHQpO1xuXG5cdFx0dGhpcy5jYW52YXMgPSB0aGlzLl92aWV3R3B1Q29udGV4dC5jYW52YXMuZG9tTm9kZTtcblxuXHRcdC8vIFJlLXJlbmRlciB0aGUgZm9sbG93aW5nIGZyYW1lIGFmdGVyIGNhbnZhcyBkZXZpY2UgcGl4ZWwgZGltZW5zaW9ucyBjaGFuZ2UsIHByb3ZpZGVkIGFcblx0XHQvLyBuZXcgcmVuZGVyIGRvZXMgbm90IG9jY3VyLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX3ZpZXdHcHVDb250ZXh0LmNhbnZhc0RldmljZVBpeGVsRGltZW5zaW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBsYXN0Vmlld3BvcnREYXRhID0gdGhpcy5fbGFzdFZpZXdwb3J0RGF0YTtcblx0XHRcdGlmIChsYXN0Vmlld3BvcnREYXRhKSB7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChsYXN0Vmlld3BvcnREYXRhID09PSB0aGlzLl9sYXN0Vmlld3BvcnREYXRhKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnJlbmRlclRleHQobGFzdFZpZXdwb3J0RGF0YSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmluaXRXZWJncHUoKTtcblx0fVxuXG5cdGFzeW5jIGluaXRXZWJncHUoKSB7XG5cdFx0Ly8gI3JlZ2lvbiBHZW5lcmFsXG5cblx0XHR0aGlzLl9kZXZpY2UgPSBWaWV3R3B1Q29udGV4dC5kZXZpY2VTeW5jIHx8IGF3YWl0IFZpZXdHcHVDb250ZXh0LmRldmljZTtcblxuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXRsYXMgPSBWaWV3R3B1Q29udGV4dC5hdGxhcztcblxuXHRcdC8vIFJlcmVuZGVyIHdoZW4gdGhlIHRleHR1cmUgYXRsYXMgZGVsZXRlcyBnbHlwaHNcblx0XHR0aGlzLl9yZWdpc3RlcihhdGxhcy5vbkRpZERlbGV0ZUdseXBocygoKSA9PiB7XG5cdFx0XHR0aGlzLl9hdGxhc0dwdVRleHR1cmVWZXJzaW9ucy5sZW5ndGggPSAwO1xuXHRcdFx0dGhpcy5fYXRsYXNHcHVUZXh0dXJlVmVyc2lvbnNbMF0gPSAwO1xuXHRcdFx0dGhpcy5fYXRsYXNHcHVUZXh0dXJlVmVyc2lvbnNbMV0gPSAwO1xuXHRcdFx0dGhpcy5fcmVuZGVyU3RyYXRlZ3kudmFsdWUhLnJlc2V0KCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uRm9ybWF0ID0gbmF2aWdhdG9yLmdwdS5nZXRQcmVmZXJyZWRDYW52YXNGb3JtYXQoKTtcblx0XHR0aGlzLl92aWV3R3B1Q29udGV4dC5jdHguY29uZmlndXJlKHtcblx0XHRcdGRldmljZTogdGhpcy5fZGV2aWNlLFxuXHRcdFx0Zm9ybWF0OiBwcmVzZW50YXRpb25Gb3JtYXQsXG5cdFx0XHRhbHBoYU1vZGU6ICdwcmVtdWx0aXBsaWVkJyxcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlbmRlclBhc3NDb2xvckF0dGFjaG1lbnQgPSB7XG5cdFx0XHR2aWV3OiBudWxsISwgLy8gV2lsbCBiZSBmaWxsZWQgYXQgcmVuZGVyIHRpbWVcblx0XHRcdGxvYWRPcDogJ2xvYWQnLFxuXHRcdFx0c3RvcmVPcDogJ3N0b3JlJyxcblx0XHR9O1xuXHRcdHRoaXMuX3JlbmRlclBhc3NEZXNjcmlwdG9yID0ge1xuXHRcdFx0bGFiZWw6ICdNb25hY28gcmVuZGVyIHBhc3MnLFxuXHRcdFx0Y29sb3JBdHRhY2htZW50czogW3RoaXMuX3JlbmRlclBhc3NDb2xvckF0dGFjaG1lbnRdLFxuXHRcdH07XG5cblx0XHQvLyAjZW5kcmVnaW9uIEdlbmVyYWxcblxuXHRcdC8vICNyZWdpb24gVW5pZm9ybXNcblxuXHRcdGxldCBsYXlvdXRJbmZvVW5pZm9ybUJ1ZmZlcjogR1BVQnVmZmVyO1xuXHRcdHtcblx0XHRcdGNvbnN0IGVudW0gSW5mbyB7XG5cdFx0XHRcdEZsb2F0c1BlckVudHJ5ID0gNixcblx0XHRcdFx0Qnl0ZXNQZXJFbnRyeSA9IEluZm8uRmxvYXRzUGVyRW50cnkgKiA0LFxuXHRcdFx0XHRPZmZzZXRfQ2FudmFzV2lkdGhfX19fID0gMCxcblx0XHRcdFx0T2Zmc2V0X0NhbnZhc0hlaWdodF9fXyA9IDEsXG5cdFx0XHRcdE9mZnNldF9WaWV3cG9ydE9mZnNldFggPSAyLFxuXHRcdFx0XHRPZmZzZXRfVmlld3BvcnRPZmZzZXRZID0gMyxcblx0XHRcdFx0T2Zmc2V0X1ZpZXdwb3J0V2lkdGhfXyA9IDQsXG5cdFx0XHRcdE9mZnNldF9WaWV3cG9ydEhlaWdodF8gPSA1LFxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYnVmZmVyVmFsdWVzID0gbmV3IEZsb2F0MzJBcnJheShJbmZvLkZsb2F0c1BlckVudHJ5KTtcblx0XHRcdGNvbnN0IHVwZGF0ZUJ1ZmZlclZhbHVlcyA9IChjYW52YXNEZXZpY2VQaXhlbFdpZHRoOiBudW1iZXIgPSB0aGlzLmNhbnZhcy53aWR0aCwgY2FudmFzRGV2aWNlUGl4ZWxIZWlnaHQ6IG51bWJlciA9IHRoaXMuY2FudmFzLmhlaWdodCkgPT4ge1xuXHRcdFx0XHRidWZmZXJWYWx1ZXNbSW5mby5PZmZzZXRfQ2FudmFzV2lkdGhfX19fXSA9IGNhbnZhc0RldmljZVBpeGVsV2lkdGg7XG5cdFx0XHRcdGJ1ZmZlclZhbHVlc1tJbmZvLk9mZnNldF9DYW52YXNIZWlnaHRfX19dID0gY2FudmFzRGV2aWNlUGl4ZWxIZWlnaHQ7XG5cdFx0XHRcdGJ1ZmZlclZhbHVlc1tJbmZvLk9mZnNldF9WaWV3cG9ydE9mZnNldFhdID0gTWF0aC5jZWlsKHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGF5b3V0SW5mbykuY29udGVudExlZnQgKiBnZXRBY3RpdmVXaW5kb3coKS5kZXZpY2VQaXhlbFJhdGlvKTtcblx0XHRcdFx0YnVmZmVyVmFsdWVzW0luZm8uT2Zmc2V0X1ZpZXdwb3J0T2Zmc2V0WV0gPSAwO1xuXHRcdFx0XHRidWZmZXJWYWx1ZXNbSW5mby5PZmZzZXRfVmlld3BvcnRXaWR0aF9fXSA9IGJ1ZmZlclZhbHVlc1tJbmZvLk9mZnNldF9DYW52YXNXaWR0aF9fX19dIC0gYnVmZmVyVmFsdWVzW0luZm8uT2Zmc2V0X1ZpZXdwb3J0T2Zmc2V0WF07XG5cdFx0XHRcdGJ1ZmZlclZhbHVlc1tJbmZvLk9mZnNldF9WaWV3cG9ydEhlaWdodF9dID0gYnVmZmVyVmFsdWVzW0luZm8uT2Zmc2V0X0NhbnZhc0hlaWdodF9fX10gLSBidWZmZXJWYWx1ZXNbSW5mby5PZmZzZXRfVmlld3BvcnRPZmZzZXRZXTtcblx0XHRcdFx0cmV0dXJuIGJ1ZmZlclZhbHVlcztcblx0XHRcdH07XG5cdFx0XHRsYXlvdXRJbmZvVW5pZm9ybUJ1ZmZlciA9IHRoaXMuX3JlZ2lzdGVyKEdQVUxpZmVjeWNsZS5jcmVhdGVCdWZmZXIodGhpcy5fZGV2aWNlLCB7XG5cdFx0XHRcdGxhYmVsOiAnTW9uYWNvIHVuaWZvcm0gYnVmZmVyJyxcblx0XHRcdFx0c2l6ZTogSW5mby5CeXRlc1BlckVudHJ5LFxuXHRcdFx0XHR1c2FnZTogR1BVQnVmZmVyVXNhZ2UuVU5JRk9STSB8IEdQVUJ1ZmZlclVzYWdlLkNPUFlfRFNULFxuXHRcdFx0fSwgKCkgPT4gdXBkYXRlQnVmZmVyVmFsdWVzKCkpKS5vYmplY3Q7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihydW5PbkNoYW5nZSh0aGlzLl92aWV3R3B1Q29udGV4dC5jYW52YXNEZXZpY2VQaXhlbERpbWVuc2lvbnMsICh7IHdpZHRoLCBoZWlnaHQgfSkgPT4ge1xuXHRcdFx0XHR0aGlzLl9kZXZpY2UucXVldWUud3JpdGVCdWZmZXIobGF5b3V0SW5mb1VuaWZvcm1CdWZmZXIsIDAsIHVwZGF0ZUJ1ZmZlclZhbHVlcyh3aWR0aCwgaGVpZ2h0KSk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihydW5PbkNoYW5nZSh0aGlzLl92aWV3R3B1Q29udGV4dC5jb250ZW50TGVmdCwgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9kZXZpY2UucXVldWUud3JpdGVCdWZmZXIobGF5b3V0SW5mb1VuaWZvcm1CdWZmZXIsIDAsIHVwZGF0ZUJ1ZmZlclZhbHVlcygpKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRsZXQgYXRsYXNJbmZvVW5pZm9ybUJ1ZmZlcjogR1BVQnVmZmVyO1xuXHRcdHtcblx0XHRcdGNvbnN0IGVudW0gSW5mbyB7XG5cdFx0XHRcdEZsb2F0c1BlckVudHJ5ID0gMixcblx0XHRcdFx0Qnl0ZXNQZXJFbnRyeSA9IEluZm8uRmxvYXRzUGVyRW50cnkgKiA0LFxuXHRcdFx0XHRPZmZzZXRfV2lkdGhfID0gMCxcblx0XHRcdFx0T2Zmc2V0X0hlaWdodCA9IDEsXG5cdFx0XHR9XG5cdFx0XHRhdGxhc0luZm9Vbmlmb3JtQnVmZmVyID0gdGhpcy5fcmVnaXN0ZXIoR1BVTGlmZWN5Y2xlLmNyZWF0ZUJ1ZmZlcih0aGlzLl9kZXZpY2UsIHtcblx0XHRcdFx0bGFiZWw6ICdNb25hY28gYXRsYXMgaW5mbyB1bmlmb3JtIGJ1ZmZlcicsXG5cdFx0XHRcdHNpemU6IEluZm8uQnl0ZXNQZXJFbnRyeSxcblx0XHRcdFx0dXNhZ2U6IEdQVUJ1ZmZlclVzYWdlLlVOSUZPUk0gfCBHUFVCdWZmZXJVc2FnZS5DT1BZX0RTVCxcblx0XHRcdH0sICgpID0+IHtcblx0XHRcdFx0Y29uc3QgdmFsdWVzID0gbmV3IEZsb2F0MzJBcnJheShJbmZvLkZsb2F0c1BlckVudHJ5KTtcblx0XHRcdFx0dmFsdWVzW0luZm8uT2Zmc2V0X1dpZHRoX10gPSBhdGxhcy5wYWdlU2l6ZTtcblx0XHRcdFx0dmFsdWVzW0luZm8uT2Zmc2V0X0hlaWdodF0gPSBhdGxhcy5wYWdlU2l6ZTtcblx0XHRcdFx0cmV0dXJuIHZhbHVlcztcblx0XHRcdH0pKS5vYmplY3Q7XG5cdFx0fVxuXG5cdFx0Ly8gI2VuZHJlZ2lvbiBVbmlmb3Jtc1xuXG5cdFx0Ly8gI3JlZ2lvbiBTdG9yYWdlIGJ1ZmZlcnNcblxuXHRcdGNvbnN0IGZvbnRGYW1pbHkgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRGYW1pbHkpO1xuXHRcdGNvbnN0IGZvbnRTaXplID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb250U2l6ZSk7XG5cdFx0dGhpcy5fZ2x5cGhSYXN0ZXJpemVyLnZhbHVlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEdseXBoUmFzdGVyaXplcihmb250U2l6ZSwgZm9udEZhbWlseSwgdGhpcy5fdmlld0dwdUNvbnRleHQuZGV2aWNlUGl4ZWxSYXRpby5nZXQoKSwgVmlld0dwdUNvbnRleHQuZGVjb3JhdGlvblN0eWxlQ2FjaGUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihydW5PbkNoYW5nZSh0aGlzLl92aWV3R3B1Q29udGV4dC5kZXZpY2VQaXhlbFJhdGlvLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZWZyZXNoR2x5cGhSYXN0ZXJpemVyKCk7XG5cdFx0fSkpO1xuXG5cblx0XHR0aGlzLl9yZW5kZXJTdHJhdGVneS52YWx1ZSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZ1bGxGaWxlUmVuZGVyU3RyYXRlZ3ksIHRoaXMuX2NvbnRleHQsIHRoaXMuX3ZpZXdHcHVDb250ZXh0LCB0aGlzLl9kZXZpY2UsIHRoaXMuX2dseXBoUmFzdGVyaXplciBhcyB7IHZhbHVlOiBHbHlwaFJhc3Rlcml6ZXIgfSk7XG5cdFx0Ly8gdGhpcy5fcmVuZGVyU3RyYXRlZ3kudmFsdWUgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWaWV3cG9ydFJlbmRlclN0cmF0ZWd5LCB0aGlzLl9jb250ZXh0LCB0aGlzLl92aWV3R3B1Q29udGV4dCwgdGhpcy5fZGV2aWNlKTtcblxuXHRcdHRoaXMuX2dseXBoU3RvcmFnZUJ1ZmZlciA9IHRoaXMuX3JlZ2lzdGVyKEdQVUxpZmVjeWNsZS5jcmVhdGVCdWZmZXIodGhpcy5fZGV2aWNlLCB7XG5cdFx0XHRsYWJlbDogJ01vbmFjbyBnbHlwaCBzdG9yYWdlIGJ1ZmZlcicsXG5cdFx0XHRzaXplOiBUZXh0dXJlQXRsYXMubWF4aW11bVBhZ2VDb3VudCAqIChUZXh0dXJlQXRsYXNQYWdlLm1heGltdW1HbHlwaENvdW50ICogR2x5cGhTdG9yYWdlQnVmZmVySW5mby5CeXRlc1BlckVudHJ5KSxcblx0XHRcdHVzYWdlOiBHUFVCdWZmZXJVc2FnZS5TVE9SQUdFIHwgR1BVQnVmZmVyVXNhZ2UuQ09QWV9EU1QsXG5cdFx0fSkpLm9iamVjdDtcblx0XHR0aGlzLl9hdGxhc0dwdVRleHR1cmVWZXJzaW9uc1swXSA9IDA7XG5cdFx0dGhpcy5fYXRsYXNHcHVUZXh0dXJlVmVyc2lvbnNbMV0gPSAwO1xuXHRcdHRoaXMuX2F0bGFzR3B1VGV4dHVyZSA9IHRoaXMuX3JlZ2lzdGVyKEdQVUxpZmVjeWNsZS5jcmVhdGVUZXh0dXJlKHRoaXMuX2RldmljZSwge1xuXHRcdFx0bGFiZWw6ICdNb25hY28gYXRsYXMgdGV4dHVyZScsXG5cdFx0XHRmb3JtYXQ6ICdyZ2JhOHVub3JtJyxcblx0XHRcdHNpemU6IHsgd2lkdGg6IGF0bGFzLnBhZ2VTaXplLCBoZWlnaHQ6IGF0bGFzLnBhZ2VTaXplLCBkZXB0aE9yQXJyYXlMYXllcnM6IFRleHR1cmVBdGxhcy5tYXhpbXVtUGFnZUNvdW50IH0sXG5cdFx0XHRkaW1lbnNpb246ICcyZCcsXG5cdFx0XHR1c2FnZTogR1BVVGV4dHVyZVVzYWdlLlRFWFRVUkVfQklORElORyB8XG5cdFx0XHRcdEdQVVRleHR1cmVVc2FnZS5DT1BZX0RTVCB8XG5cdFx0XHRcdEdQVVRleHR1cmVVc2FnZS5SRU5ERVJfQVRUQUNITUVOVCxcblx0XHR9KSkub2JqZWN0O1xuXG5cdFx0dGhpcy5fdXBkYXRlQXRsYXNTdG9yYWdlQnVmZmVyQW5kVGV4dHVyZSgpO1xuXG5cdFx0Ly8gI2VuZHJlZ2lvbiBTdG9yYWdlIGJ1ZmZlcnNcblxuXHRcdC8vICNyZWdpb24gVmVydGV4IGJ1ZmZlclxuXG5cdFx0dGhpcy5fdmVydGV4QnVmZmVyID0gdGhpcy5fcmVnaXN0ZXIoR1BVTGlmZWN5Y2xlLmNyZWF0ZUJ1ZmZlcih0aGlzLl9kZXZpY2UsIHtcblx0XHRcdGxhYmVsOiAnTW9uYWNvIHZlcnRleCBidWZmZXInLFxuXHRcdFx0c2l6ZTogcXVhZFZlcnRpY2VzLmJ5dGVMZW5ndGgsXG5cdFx0XHR1c2FnZTogR1BVQnVmZmVyVXNhZ2UuVkVSVEVYIHwgR1BVQnVmZmVyVXNhZ2UuQ09QWV9EU1QsXG5cdFx0fSwgcXVhZFZlcnRpY2VzKSkub2JqZWN0O1xuXG5cdFx0Ly8gI2VuZHJlZ2lvbiBWZXJ0ZXggYnVmZmVyXG5cblx0XHQvLyAjcmVnaW9uIFNoYWRlciBtb2R1bGVcblxuXHRcdGNvbnN0IG1vZHVsZSA9IHRoaXMuX2RldmljZS5jcmVhdGVTaGFkZXJNb2R1bGUoe1xuXHRcdFx0bGFiZWw6ICdNb25hY28gc2hhZGVyIG1vZHVsZScsXG5cdFx0XHRjb2RlOiB0aGlzLl9yZW5kZXJTdHJhdGVneS52YWx1ZS53Z3NsLFxuXHRcdH0pO1xuXG5cdFx0Ly8gI2VuZHJlZ2lvbiBTaGFkZXIgbW9kdWxlXG5cblx0XHQvLyAjcmVnaW9uIFBpcGVsaW5lXG5cblx0XHR0aGlzLl9waXBlbGluZSA9IHRoaXMuX2RldmljZS5jcmVhdGVSZW5kZXJQaXBlbGluZSh7XG5cdFx0XHRsYWJlbDogJ01vbmFjbyByZW5kZXIgcGlwZWxpbmUnLFxuXHRcdFx0bGF5b3V0OiAnYXV0bycsXG5cdFx0XHR2ZXJ0ZXg6IHtcblx0XHRcdFx0bW9kdWxlLFxuXHRcdFx0XHRidWZmZXJzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0YXJyYXlTdHJpZGU6IDIgKiBGbG9hdDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQsIC8vIDIgZmxvYXRzLCA0IGJ5dGVzIGVhY2hcblx0XHRcdFx0XHRcdGF0dHJpYnV0ZXM6IFtcblx0XHRcdFx0XHRcdFx0eyBzaGFkZXJMb2NhdGlvbjogMCwgb2Zmc2V0OiAwLCBmb3JtYXQ6ICdmbG9hdDMyeDInIH0sICAvLyBwb3NpdGlvblxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XHRmcmFnbWVudDoge1xuXHRcdFx0XHRtb2R1bGUsXG5cdFx0XHRcdHRhcmdldHM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRmb3JtYXQ6IHByZXNlbnRhdGlvbkZvcm1hdCxcblx0XHRcdFx0XHRcdGJsZW5kOiB7XG5cdFx0XHRcdFx0XHRcdGNvbG9yOiB7XG5cdFx0XHRcdFx0XHRcdFx0c3JjRmFjdG9yOiAnc3JjLWFscGhhJyxcblx0XHRcdFx0XHRcdFx0XHRkc3RGYWN0b3I6ICdvbmUtbWludXMtc3JjLWFscGhhJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRhbHBoYToge1xuXHRcdFx0XHRcdFx0XHRcdHNyY0ZhY3RvcjogJ3NyYy1hbHBoYScsXG5cdFx0XHRcdFx0XHRcdFx0ZHN0RmFjdG9yOiAnb25lLW1pbnVzLXNyYy1hbHBoYSdcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdC8vICNlbmRyZWdpb24gUGlwZWxpbmVcblxuXHRcdC8vICNyZWdpb24gQmluZCBncm91cFxuXG5cdFx0dGhpcy5fcmVidWlsZEJpbmRHcm91cCA9ICgpID0+IHtcblx0XHRcdHRoaXMuX2JpbmRHcm91cCA9IHRoaXMuX2RldmljZS5jcmVhdGVCaW5kR3JvdXAoe1xuXHRcdFx0XHRsYWJlbDogJ01vbmFjbyBiaW5kIGdyb3VwJyxcblx0XHRcdFx0bGF5b3V0OiB0aGlzLl9waXBlbGluZS5nZXRCaW5kR3JvdXBMYXlvdXQoMCksXG5cdFx0XHRcdGVudHJpZXM6IFtcblx0XHRcdFx0XHQvLyBUT0RPOiBQYXNzIGluIGdlbmVyaWNhbGx5IGFzIGFycmF5P1xuXHRcdFx0XHRcdHsgYmluZGluZzogQmluZGluZ0lkLkdseXBoSW5mbywgcmVzb3VyY2U6IHsgYnVmZmVyOiB0aGlzLl9nbHlwaFN0b3JhZ2VCdWZmZXIgfSB9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGJpbmRpbmc6IEJpbmRpbmdJZC5UZXh0dXJlU2FtcGxlciwgcmVzb3VyY2U6IHRoaXMuX2RldmljZS5jcmVhdGVTYW1wbGVyKHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6ICdNb25hY28gYXRsYXMgc2FtcGxlcicsXG5cdFx0XHRcdFx0XHRcdG1hZ0ZpbHRlcjogJ25lYXJlc3QnLFxuXHRcdFx0XHRcdFx0XHRtaW5GaWx0ZXI6ICduZWFyZXN0Jyxcblx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7IGJpbmRpbmc6IEJpbmRpbmdJZC5UZXh0dXJlLCByZXNvdXJjZTogdGhpcy5fYXRsYXNHcHVUZXh0dXJlLmNyZWF0ZVZpZXcoKSB9LFxuXHRcdFx0XHRcdHsgYmluZGluZzogQmluZGluZ0lkLkxheW91dEluZm9Vbmlmb3JtLCByZXNvdXJjZTogeyBidWZmZXI6IGxheW91dEluZm9Vbmlmb3JtQnVmZmVyIH0gfSxcblx0XHRcdFx0XHR7IGJpbmRpbmc6IEJpbmRpbmdJZC5BdGxhc0RpbWVuc2lvbnNVbmlmb3JtLCByZXNvdXJjZTogeyBidWZmZXI6IGF0bGFzSW5mb1VuaWZvcm1CdWZmZXIgfSB9LFxuXHRcdFx0XHRcdC4uLnRoaXMuX3JlbmRlclN0cmF0ZWd5LnZhbHVlIS5iaW5kR3JvdXBFbnRyaWVzXG5cdFx0XHRcdF0sXG5cdFx0XHR9KTtcblx0XHR9O1xuXHRcdHRoaXMuX3JlYnVpbGRCaW5kR3JvdXAoKTtcblxuXHRcdC8vIGVuZHJlZ2lvbiBCaW5kIGdyb3VwXG5cblx0XHR0aGlzLl9pbml0aWFsaXplZCA9IHRydWU7XG5cblx0XHQvLyBSZW5kZXIgdGhlIGluaXRpYWwgdmlld3BvcnQgaW1tZWRpYXRlbHkgYWZ0ZXIgaW5pdGlhbGl6YXRpb25cblx0XHRpZiAodGhpcy5faW5pdFZpZXdwb3J0RGF0YSkge1xuXHRcdFx0Ly8gSEFDSzogUmVuZGVyaW5nIG11bHRpcGxlIHRpbWVzIGluIHRoZSBzYW1lIGZyYW1lIGxpa2UgdGhpcyBpc24ndCBpZGVhbCwgYnV0IHRoZXJlXG5cdFx0XHQvLyAgICAgICBpc24ndCBhbiBlYXN5IHdheSB0byBtZXJnZSB2aWV3cG9ydCBkYXRhXG5cdFx0XHRmb3IgKGNvbnN0IHZpZXdwb3J0RGF0YSBvZiB0aGlzLl9pbml0Vmlld3BvcnREYXRhKSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyVGV4dCh2aWV3cG9ydERhdGEpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5faW5pdFZpZXdwb3J0RGF0YSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoUmVuZGVyU3RyYXRlZ3kodmlld3BvcnREYXRhOiBWaWV3cG9ydERhdGEpIHtcblx0XHRpZiAodGhpcy5fcmVuZGVyU3RyYXRlZ3kudmFsdWU/LnR5cGUgPT09ICd2aWV3cG9ydCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHZpZXdwb3J0RGF0YS5lbmRMaW5lTnVtYmVyIDwgRnVsbEZpbGVSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRMaW5lcyAmJiB0aGlzLl92aWV3cG9ydE1heENvbHVtbih2aWV3cG9ydERhdGEpIDwgRnVsbEZpbGVSZW5kZXJTdHJhdGVneS5tYXhTdXBwb3J0ZWRDb2x1bW5zKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYEZpbGUgaXMgbGFyZ2VyIHRoYW4gJHtGdWxsRmlsZVJlbmRlclN0cmF0ZWd5Lm1heFN1cHBvcnRlZExpbmVzfSBsaW5lcyBvciAke0Z1bGxGaWxlUmVuZGVyU3RyYXRlZ3kubWF4U3VwcG9ydGVkQ29sdW1uc30gY29sdW1ucywgc3dpdGNoaW5nIHRvIHZpZXdwb3J0IHJlbmRlciBzdHJhdGVneWApO1xuXHRcdGNvbnN0IHZpZXdwb3J0UmVuZGVyU3RyYXRlZ3kgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWaWV3cG9ydFJlbmRlclN0cmF0ZWd5LCB0aGlzLl9jb250ZXh0LCB0aGlzLl92aWV3R3B1Q29udGV4dCwgdGhpcy5fZGV2aWNlLCB0aGlzLl9nbHlwaFJhc3Rlcml6ZXIgYXMgeyB2YWx1ZTogR2x5cGhSYXN0ZXJpemVyIH0pO1xuXHRcdHRoaXMuX3JlbmRlclN0cmF0ZWd5LnZhbHVlID0gdmlld3BvcnRSZW5kZXJTdHJhdGVneTtcblx0XHR0aGlzLl9yZWdpc3Rlcih2aWV3cG9ydFJlbmRlclN0cmF0ZWd5Lm9uRGlkQ2hhbmdlQmluZEdyb3VwRW50cmllcygoKSA9PiB0aGlzLl9yZWJ1aWxkQmluZEdyb3VwPy4oKSkpO1xuXHRcdHRoaXMuX3JlYnVpbGRCaW5kR3JvdXA/LigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdmlld3BvcnRNYXhDb2x1bW4odmlld3BvcnREYXRhOiBWaWV3cG9ydERhdGEpOiBudW1iZXIge1xuXHRcdGxldCBtYXhDb2x1bW4gPSAwO1xuXHRcdGxldCBsaW5lRGF0YTogVmlld0xpbmVSZW5kZXJpbmdEYXRhO1xuXHRcdGZvciAobGV0IGkgPSB2aWV3cG9ydERhdGEuc3RhcnRMaW5lTnVtYmVyOyBpIDw9IHZpZXdwb3J0RGF0YS5lbmRMaW5lTnVtYmVyOyBpKyspIHtcblx0XHRcdGxpbmVEYXRhID0gdmlld3BvcnREYXRhLmdldFZpZXdMaW5lUmVuZGVyaW5nRGF0YShpKTtcblx0XHRcdG1heENvbHVtbiA9IE1hdGgubWF4KG1heENvbHVtbiwgbGluZURhdGEubWF4Q29sdW1uKTtcblx0XHR9XG5cdFx0cmV0dXJuIG1heENvbHVtbjtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUF0bGFzU3RvcmFnZUJ1ZmZlckFuZFRleHR1cmUoKSB7XG5cdFx0Zm9yIChjb25zdCBbbGF5ZXJJbmRleCwgcGFnZV0gb2YgVmlld0dwdUNvbnRleHQuYXRsYXMucGFnZXMuZW50cmllcygpKSB7XG5cdFx0XHRpZiAobGF5ZXJJbmRleCA+PSBUZXh0dXJlQXRsYXMubWF4aW11bVBhZ2VDb3VudCkge1xuXHRcdFx0XHRjb25zb2xlLmxvZyhgQXR0ZW1wdCB0byB1cGxvYWQgYXRsYXMgcGFnZSBbJHtsYXllckluZGV4fV0sIG9ubHkgJHtUZXh0dXJlQXRsYXMubWF4aW11bVBhZ2VDb3VudH0gYXJlIHN1cHBvcnRlZCBjdXJyZW50bHlgKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNraXAgdGhlIHVwZGF0ZSBpZiBpdCdzIGFscmVhZHkgdGhlIGxhdGVzdCB2ZXJzaW9uXG5cdFx0XHRpZiAocGFnZS52ZXJzaW9uID09PSB0aGlzLl9hdGxhc0dwdVRleHR1cmVWZXJzaW9uc1tsYXllckluZGV4XSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnVXBkYXRpbmcgYXRsYXMgcGFnZVsnLCBsYXllckluZGV4LCAnXSBmcm9tIHZlcnNpb24gJywgdGhpcy5fYXRsYXNHcHVUZXh0dXJlVmVyc2lvbnNbbGF5ZXJJbmRleF0sICcgdG8gdmVyc2lvbiAnLCBwYWdlLnZlcnNpb24pO1xuXG5cdFx0XHRjb25zdCBlbnRyeUNvdW50ID0gR2x5cGhTdG9yYWdlQnVmZmVySW5mby5GbG9hdHNQZXJFbnRyeSAqIFRleHR1cmVBdGxhc1BhZ2UubWF4aW11bUdseXBoQ291bnQ7XG5cdFx0XHRjb25zdCB2YWx1ZXMgPSBuZXcgRmxvYXQzMkFycmF5KGVudHJ5Q291bnQpO1xuXHRcdFx0bGV0IGVudHJ5T2Zmc2V0ID0gMDtcblx0XHRcdGZvciAoY29uc3QgZ2x5cGggb2YgcGFnZS5nbHlwaHMpIHtcblx0XHRcdFx0dmFsdWVzW2VudHJ5T2Zmc2V0ICsgR2x5cGhTdG9yYWdlQnVmZmVySW5mby5PZmZzZXRfVGV4dHVyZVBvc2l0aW9uXSA9IGdseXBoLng7XG5cdFx0XHRcdHZhbHVlc1tlbnRyeU9mZnNldCArIEdseXBoU3RvcmFnZUJ1ZmZlckluZm8uT2Zmc2V0X1RleHR1cmVQb3NpdGlvbiArIDFdID0gZ2x5cGgueTtcblx0XHRcdFx0dmFsdWVzW2VudHJ5T2Zmc2V0ICsgR2x5cGhTdG9yYWdlQnVmZmVySW5mby5PZmZzZXRfVGV4dHVyZVNpemVdID0gZ2x5cGgudztcblx0XHRcdFx0dmFsdWVzW2VudHJ5T2Zmc2V0ICsgR2x5cGhTdG9yYWdlQnVmZmVySW5mby5PZmZzZXRfVGV4dHVyZVNpemUgKyAxXSA9IGdseXBoLmg7XG5cdFx0XHRcdHZhbHVlc1tlbnRyeU9mZnNldCArIEdseXBoU3RvcmFnZUJ1ZmZlckluZm8uT2Zmc2V0X09yaWdpblBvc2l0aW9uXSA9IGdseXBoLm9yaWdpbk9mZnNldFg7XG5cdFx0XHRcdHZhbHVlc1tlbnRyeU9mZnNldCArIEdseXBoU3RvcmFnZUJ1ZmZlckluZm8uT2Zmc2V0X09yaWdpblBvc2l0aW9uICsgMV0gPSBnbHlwaC5vcmlnaW5PZmZzZXRZO1xuXHRcdFx0XHRlbnRyeU9mZnNldCArPSBHbHlwaFN0b3JhZ2VCdWZmZXJJbmZvLkZsb2F0c1BlckVudHJ5O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVudHJ5T2Zmc2V0IC8gR2x5cGhTdG9yYWdlQnVmZmVySW5mby5GbG9hdHNQZXJFbnRyeSA+IFRleHR1cmVBdGxhc1BhZ2UubWF4aW11bUdseXBoQ291bnQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBdHRlbXB0aW5nIHRvIHdyaXRlIG1vcmUgZ2x5cGhzICgke2VudHJ5T2Zmc2V0IC8gR2x5cGhTdG9yYWdlQnVmZmVySW5mby5GbG9hdHNQZXJFbnRyeX0pIHRoYW4gdGhlIEdQVUJ1ZmZlciBjYW4gaG9sZCAoJHtUZXh0dXJlQXRsYXNQYWdlLm1heGltdW1HbHlwaENvdW50fSlgKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2RldmljZS5xdWV1ZS53cml0ZUJ1ZmZlcihcblx0XHRcdFx0dGhpcy5fZ2x5cGhTdG9yYWdlQnVmZmVyLFxuXHRcdFx0XHRsYXllckluZGV4ICogR2x5cGhTdG9yYWdlQnVmZmVySW5mby5GbG9hdHNQZXJFbnRyeSAqIFRleHR1cmVBdGxhc1BhZ2UubWF4aW11bUdseXBoQ291bnQgKiBGbG9hdDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQsXG5cdFx0XHRcdHZhbHVlcyxcblx0XHRcdFx0MCxcblx0XHRcdFx0R2x5cGhTdG9yYWdlQnVmZmVySW5mby5GbG9hdHNQZXJFbnRyeSAqIFRleHR1cmVBdGxhc1BhZ2UubWF4aW11bUdseXBoQ291bnRcblx0XHRcdCk7XG5cdFx0XHRpZiAocGFnZS51c2VkQXJlYS5yaWdodCAtIHBhZ2UudXNlZEFyZWEubGVmdCA+IDAgJiYgcGFnZS51c2VkQXJlYS5ib3R0b20gLSBwYWdlLnVzZWRBcmVhLnRvcCA+IDApIHtcblx0XHRcdFx0dGhpcy5fZGV2aWNlLnF1ZXVlLmNvcHlFeHRlcm5hbEltYWdlVG9UZXh0dXJlKFxuXHRcdFx0XHRcdHsgc291cmNlOiBwYWdlLnNvdXJjZSB9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHRleHR1cmU6IHRoaXMuX2F0bGFzR3B1VGV4dHVyZSxcblx0XHRcdFx0XHRcdG9yaWdpbjoge1xuXHRcdFx0XHRcdFx0XHR4OiBwYWdlLnVzZWRBcmVhLmxlZnQsXG5cdFx0XHRcdFx0XHRcdHk6IHBhZ2UudXNlZEFyZWEudG9wLFxuXHRcdFx0XHRcdFx0XHR6OiBsYXllckluZGV4XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR3aWR0aDogcGFnZS51c2VkQXJlYS5yaWdodCAtIHBhZ2UudXNlZEFyZWEubGVmdCArIDEsXG5cdFx0XHRcdFx0XHRoZWlnaHQ6IHBhZ2UudXNlZEFyZWEuYm90dG9tIC0gcGFnZS51c2VkQXJlYS50b3AgKyAxXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2F0bGFzR3B1VGV4dHVyZVZlcnNpb25zW2xheWVySW5kZXhdID0gcGFnZS52ZXJzaW9uO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBwcmVwYXJlUmVuZGVyKGN0eDogUmVuZGVyaW5nQ29udGV4dCk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ1Nob3VsZCBub3QgYmUgY2FsbGVkJyk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcmVuZGVyKGN0eDogUmVzdHJpY3RlZFJlbmRlcmluZ0NvbnRleHQpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdTaG91bGQgbm90IGJlIGNhbGxlZCcpO1xuXHR9XG5cblx0Ly8gI3JlZ2lvbiBFdmVudCBoYW5kbGVyc1xuXG5cdC8vIFNpbmNlIFZpZXdMaW5lc0dwdSBjdXJyZW50bHkgY29vcmRpbmF0ZXMgcmVuZGVyaW5nIHRvIHRoZSBjYW52YXMsIGl0IG11c3QgbGlzdGVuIHRvIGFsbFxuXHQvLyBjaGFuZ2VkIGV2ZW50cyB0aGF0IGFueSBHUFUgcGFydCBsaXN0ZW5zIHRvLiBUaGlzIGlzIGJlY2F1c2UgYW55IGRyYXdpbmcgdG8gdGhlIGNhbnZhcyB3aWxsXG5cdC8vIGNsZWFyIGl0IGZvciB0aGF0IGZyYW1lLCBzbyBhbGwgcGFydHMgbXVzdCBiZSByZW5kZXJlZCBldmVyeSB0aW1lLlxuXHQvL1xuXHQvLyBBZGRpdGlvbmFsbHksIHNpbmNlIHRoaXMgaXMgaW50cmluc2ljYWxseSBsaW5rZWQgdG8gVmlld0xpbmVzLCBpdCBtdXN0IGFsc28gbGlzdGVuIHRvIGV2ZW50c1xuXHQvLyBmcm9tIHRoYXQgc2lkZS4gTHVja2lseSByZW5kZXJpbmcgaXMgY2hlYXAsIGl0J3Mgb25seSB3aGVuIHVwbG9hZGVkIGRhdGEgY2hhbmdlcyBkb2VzIGl0XG5cdC8vIHN0YXJ0IHRvIGNvc3QuXG5cblx0b3ZlcnJpZGUgb25Db25maWd1cmF0aW9uQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fcmVmcmVzaEdseXBoUmFzdGVyaXplcigpO1xuXHRcdHRoaXMuX21heExpbmVXaWR0aCA9IDA7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0b3ZlcnJpZGUgb25DdXJzb3JTdGF0ZUNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Q3Vyc29yU3RhdGVDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHsgcmV0dXJuIHRydWU7IH1cblx0b3ZlcnJpZGUgb25EZWNvcmF0aW9uc0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3RGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHsgcmV0dXJuIHRydWU7IH1cblx0b3ZlcnJpZGUgb25GbHVzaGVkKGU6IHZpZXdFdmVudHMuVmlld0ZsdXNoZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX21heExpbmVXaWR0aCA9IDA7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRvdmVycmlkZSBvbkxpbmVzQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXHRvdmVycmlkZSBvbkxpbmVzRGVsZXRlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0RlbGV0ZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX21heExpbmVXaWR0aCA9IDA7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0b3ZlcnJpZGUgb25MaW5lc0luc2VydGVkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzSW5zZXJ0ZWRFdmVudCk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXHRvdmVycmlkZSBvbkxpbmVNYXBwaW5nQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lTWFwcGluZ0NoYW5nZWRFdmVudCk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXHRvdmVycmlkZSBvblJldmVhbFJhbmdlUmVxdWVzdChlOiB2aWV3RXZlbnRzLlZpZXdSZXZlYWxSYW5nZVJlcXVlc3RFdmVudCk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXHRvdmVycmlkZSBvblNjcm9sbENoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3U2Nyb2xsQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdG92ZXJyaWRlIG9uVGhlbWVDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1RoZW1lQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdG92ZXJyaWRlIG9uWm9uZXNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1pvbmVzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgX3JlZnJlc2hHbHlwaFJhc3Rlcml6ZXIoKSB7XG5cdFx0Y29uc3QgZ2x5cGhSYXN0ZXJpemVyID0gdGhpcy5fZ2x5cGhSYXN0ZXJpemVyLnZhbHVlO1xuXHRcdGlmICghZ2x5cGhSYXN0ZXJpemVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGZvbnRGYW1pbHkgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRGYW1pbHkpO1xuXHRcdGNvbnN0IGZvbnRTaXplID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb250U2l6ZSk7XG5cdFx0Y29uc3QgZGV2aWNlUGl4ZWxSYXRpbyA9IHRoaXMuX3ZpZXdHcHVDb250ZXh0LmRldmljZVBpeGVsUmF0aW8uZ2V0KCk7XG5cdFx0aWYgKFxuXHRcdFx0Z2x5cGhSYXN0ZXJpemVyLmZvbnRGYW1pbHkgIT09IGZvbnRGYW1pbHkgfHxcblx0XHRcdGdseXBoUmFzdGVyaXplci5mb250U2l6ZSAhPT0gZm9udFNpemUgfHxcblx0XHRcdGdseXBoUmFzdGVyaXplci5kZXZpY2VQaXhlbFJhdGlvICE9PSBkZXZpY2VQaXhlbFJhdGlvXG5cdFx0KSB7XG5cdFx0XHR0aGlzLl9nbHlwaFJhc3Rlcml6ZXIudmFsdWUgPSBuZXcgR2x5cGhSYXN0ZXJpemVyKGZvbnRTaXplLCBmb250RmFtaWx5LCBkZXZpY2VQaXhlbFJhdGlvLCBWaWV3R3B1Q29udGV4dC5kZWNvcmF0aW9uU3R5bGVDYWNoZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlbmRlclRleHQodmlld3BvcnREYXRhOiBWaWV3cG9ydERhdGEpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faW5pdGlhbGl6ZWQpIHtcblx0XHRcdHRoaXMuX3JlZnJlc2hSZW5kZXJTdHJhdGVneSh2aWV3cG9ydERhdGEpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlbmRlclRleHQodmlld3BvcnREYXRhKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5faW5pdFZpZXdwb3J0RGF0YSA9IHRoaXMuX2luaXRWaWV3cG9ydERhdGEgPz8gW107XG5cdFx0XHR0aGlzLl9pbml0Vmlld3BvcnREYXRhLnB1c2godmlld3BvcnREYXRhKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJUZXh0KHZpZXdwb3J0RGF0YTogVmlld3BvcnREYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlld0dwdUNvbnRleHQucmVjdGFuZ2xlUmVuZGVyZXIuZHJhdyh2aWV3cG9ydERhdGEpO1xuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IG5ldyBWaWV3TGluZU9wdGlvbnModGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLCB0aGlzLl9jb250ZXh0LnRoZW1lLnR5cGUpO1xuXG5cdFx0dGhpcy5fcmVuZGVyU3RyYXRlZ3kudmFsdWUhLnVwZGF0ZSh2aWV3cG9ydERhdGEsIG9wdGlvbnMpO1xuXG5cdFx0dGhpcy5fdXBkYXRlQXRsYXNTdG9yYWdlQnVmZmVyQW5kVGV4dHVyZSgpO1xuXG5cdFx0Y29uc3QgZW5jb2RlciA9IHRoaXMuX2RldmljZS5jcmVhdGVDb21tYW5kRW5jb2Rlcih7IGxhYmVsOiAnTW9uYWNvIGNvbW1hbmQgZW5jb2RlcicgfSk7XG5cblx0XHR0aGlzLl9yZW5kZXJQYXNzQ29sb3JBdHRhY2htZW50LnZpZXcgPSB0aGlzLl92aWV3R3B1Q29udGV4dC5jdHguZ2V0Q3VycmVudFRleHR1cmUoKS5jcmVhdGVWaWV3KHsgbGFiZWw6ICdNb25hY28gY2FudmFzIHRleHR1cmUgdmlldycgfSk7XG5cdFx0Y29uc3QgcGFzcyA9IGVuY29kZXIuYmVnaW5SZW5kZXJQYXNzKHRoaXMuX3JlbmRlclBhc3NEZXNjcmlwdG9yKTtcblx0XHRwYXNzLnNldFBpcGVsaW5lKHRoaXMuX3BpcGVsaW5lKTtcblx0XHRwYXNzLnNldFZlcnRleEJ1ZmZlcigwLCB0aGlzLl92ZXJ0ZXhCdWZmZXIpO1xuXG5cdFx0Ly8gT25seSBkcmF3IHRoZSBjb250ZW50IGFyZWFcblx0XHRjb25zdCBjb250ZW50TGVmdCA9IE1hdGguY2VpbCh0aGlzLl92aWV3R3B1Q29udGV4dC5jb250ZW50TGVmdC5nZXQoKSAqIHRoaXMuX3ZpZXdHcHVDb250ZXh0LmRldmljZVBpeGVsUmF0aW8uZ2V0KCkpO1xuXHRcdHBhc3Muc2V0U2Npc3NvclJlY3QoY29udGVudExlZnQsIDAsIHRoaXMuY2FudmFzLndpZHRoIC0gY29udGVudExlZnQsIHRoaXMuY2FudmFzLmhlaWdodCk7XG5cblx0XHRwYXNzLnNldEJpbmRHcm91cCgwLCB0aGlzLl9iaW5kR3JvdXApO1xuXG5cdFx0dGhpcy5fcmVuZGVyU3RyYXRlZ3kudmFsdWUhLmRyYXcocGFzcywgdmlld3BvcnREYXRhKTtcblxuXHRcdHBhc3MuZW5kKCk7XG5cblx0XHRjb25zdCBjb21tYW5kQnVmZmVyID0gZW5jb2Rlci5maW5pc2goKTtcblxuXHRcdHRoaXMuX2RldmljZS5xdWV1ZS5zdWJtaXQoW2NvbW1hbmRCdWZmZXJdKTtcblxuXHRcdHRoaXMuX2xhc3RWaWV3cG9ydERhdGEgPSB2aWV3cG9ydERhdGE7XG5cdFx0dGhpcy5fbGFzdFZpZXdMaW5lT3B0aW9ucyA9IG9wdGlvbnM7XG5cblx0XHQvLyBVcGRhdGUgbWF4IGxpbmUgd2lkdGggZm9yIGhvcml6b250YWwgc2Nyb2xsYmFyXG5cdFx0dGhpcy5fdXBkYXRlTWF4TGluZVdpZHRoKHZpZXdwb3J0RGF0YSwgb3B0aW9ucyk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIHRoZSBtYXggbGluZSB3aWR0aCBiYXNlZCBvbiBHUFUtcmVuZGVyZWQgbGluZXMuXG5cdCAqIFRoaXMgaXMgbmVlZGVkIGJlY2F1c2UgR1BVLXJlbmRlcmVkIGxpbmVzIGRvbid0IGhhdmUgRE9NIG5vZGVzIHRvIG1lYXN1cmUuXG5cdCAqL1xuXHRwcml2YXRlIF91cGRhdGVNYXhMaW5lV2lkdGgodmlld3BvcnREYXRhOiBWaWV3cG9ydERhdGEsIHZpZXdMaW5lT3B0aW9uczogVmlld0xpbmVPcHRpb25zKTogdm9pZCB7XG5cdFx0Y29uc3QgZHByID0gZ2V0QWN0aXZlV2luZG93KCkuZGV2aWNlUGl4ZWxSYXRpbztcblx0XHRsZXQgbG9jYWxNYXhMaW5lV2lkdGggPSAwO1xuXG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gdmlld3BvcnREYXRhLmVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0aWYgKCF0aGlzLl92aWV3R3B1Q29udGV4dC5jYW5SZW5kZXIodmlld0xpbmVPcHRpb25zLCB2aWV3cG9ydERhdGEsIGxpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsaW5lRGF0YSA9IHZpZXdwb3J0RGF0YS5nZXRWaWV3TGluZVJlbmRlcmluZ0RhdGEobGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBsaW5lV2lkdGggPSB0aGlzLl9jb21wdXRlTGluZVdpZHRoKGxpbmVEYXRhLCB2aWV3TGluZU9wdGlvbnMsIGRwcik7XG5cdFx0XHRsb2NhbE1heExpbmVXaWR0aCA9IE1hdGgubWF4KGxvY2FsTWF4TGluZVdpZHRoLCBsaW5lV2lkdGgpO1xuXHRcdH1cblxuXHRcdC8vIE9ubHkgdXBkYXRlIGlmIHdlIGZvdW5kIGEgbGFyZ2VyIHdpZHRoICh1c2UgY2VpbCB0byBtYXRjaCBET00gYmVoYXZpb3IpXG5cdFx0Y29uc3QgaUxpbmVXaWR0aCA9IE1hdGguY2VpbChsb2NhbE1heExpbmVXaWR0aCk7XG5cdFx0aWYgKGlMaW5lV2lkdGggPiB0aGlzLl9tYXhMaW5lV2lkdGgpIHtcblx0XHRcdHRoaXMuX21heExpbmVXaWR0aCA9IGlMaW5lV2lkdGg7XG5cdFx0XHR0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC52aWV3TGF5b3V0LnNldE1heExpbmVXaWR0aCh0aGlzLl9tYXhMaW5lV2lkdGgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlIHRoZSB3aWR0aCBvZiBhIGxpbmUgaW4gQ1NTIHBpeGVscy5cblx0ICovXG5cdHByaXZhdGUgX2NvbXB1dGVMaW5lV2lkdGgobGluZURhdGE6IFZpZXdMaW5lUmVuZGVyaW5nRGF0YSwgdmlld0xpbmVPcHRpb25zOiBWaWV3TGluZU9wdGlvbnMsIGRwcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBjb250ZW50ID0gbGluZURhdGEuY29udGVudDtcblx0XHRsZXQgY29udGVudFNlZ21lbnRlcjogSUNvbnRlbnRTZWdtZW50ZXIgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCEobGluZURhdGEuaXNCYXNpY0FTQ0lJICYmIHZpZXdMaW5lT3B0aW9ucy51c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zKSkge1xuXHRcdFx0Y29udGVudFNlZ21lbnRlciA9IGNyZWF0ZUNvbnRlbnRTZWdtZW50ZXIobGluZURhdGEsIHZpZXdMaW5lT3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0bGV0IHdpZHRoID0gMDtcblx0XHRsZXQgdGFiWE9mZnNldCA9IDA7XG5cblx0XHRmb3IgKGxldCB4ID0gMDsgeCA8IGNvbnRlbnQubGVuZ3RoOyB4KyspIHtcblx0XHRcdGxldCBjaGFyczogc3RyaW5nO1xuXHRcdFx0aWYgKGxpbmVEYXRhLmlzQmFzaWNBU0NJSSAmJiB2aWV3TGluZU9wdGlvbnMudXNlTW9ub3NwYWNlT3B0aW1pemF0aW9ucykge1xuXHRcdFx0XHRjaGFycyA9IGNvbnRlbnQuY2hhckF0KHgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3Qgc2VnbWVudCA9IGNvbnRlbnRTZWdtZW50ZXIhLmdldFNlZ21lbnRBdEluZGV4KHgpO1xuXHRcdFx0XHRpZiAoc2VnbWVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2hhcnMgPSBzZWdtZW50O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2hhcnMgPT09ICdcXHQnKSB7XG5cdFx0XHRcdGNvbnN0IG9mZnNldEJlZm9yZSA9IHggKyB0YWJYT2Zmc2V0O1xuXHRcdFx0XHR0YWJYT2Zmc2V0ID0gQ3Vyc29yQ29sdW1ucy5uZXh0UmVuZGVyVGFiU3RvcCh4ICsgdGFiWE9mZnNldCwgbGluZURhdGEudGFiU2l6ZSk7XG5cdFx0XHRcdHdpZHRoICs9IHZpZXdMaW5lT3B0aW9ucy5zcGFjZVdpZHRoICogKHRhYlhPZmZzZXQgLSBvZmZzZXRCZWZvcmUpO1xuXHRcdFx0XHR0YWJYT2Zmc2V0IC09IHggKyAxO1xuXHRcdFx0fSBlbHNlIGlmIChsaW5lRGF0YS5pc0Jhc2ljQVNDSUkgJiYgdmlld0xpbmVPcHRpb25zLnVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnMpIHtcblx0XHRcdFx0d2lkdGggKz0gdmlld0xpbmVPcHRpb25zLnNwYWNlV2lkdGg7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR3aWR0aCArPSB0aGlzLl9yZW5kZXJTdHJhdGVneS52YWx1ZSEuZ2x5cGhSYXN0ZXJpemVyLmdldFRleHRNZXRyaWNzKGNoYXJzKS53aWR0aCAvIGRwcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gd2lkdGg7XG5cdH1cblxuXHRsaW5lc1Zpc2libGVSYW5nZXNGb3JSYW5nZShfcmFuZ2U6IFJhbmdlLCBpbmNsdWRlTmV3TGluZXM6IGJvb2xlYW4pOiBMaW5lVmlzaWJsZVJhbmdlc1tdIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9sYXN0Vmlld3BvcnREYXRhKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3Qgb3JpZ2luYWxFbmRMaW5lTnVtYmVyID0gX3JhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgcmFuZ2UgPSBSYW5nZS5pbnRlcnNlY3RSYW5nZXMoX3JhbmdlLCB0aGlzLl9sYXN0Vmlld3BvcnREYXRhLnZpc2libGVSYW5nZSk7XG5cdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVuZFN0YXJ0TGluZU51bWJlciA9IHRoaXMuX2xhc3RWaWV3cG9ydERhdGEuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IHJlbmRFbmRMaW5lTnVtYmVyID0gdGhpcy5fbGFzdFZpZXdwb3J0RGF0YS5lbmRMaW5lTnVtYmVyO1xuXG5cdFx0Y29uc3Qgdmlld3BvcnREYXRhID0gdGhpcy5fbGFzdFZpZXdwb3J0RGF0YTtcblx0XHRjb25zdCB2aWV3TGluZU9wdGlvbnMgPSB0aGlzLl9sYXN0Vmlld0xpbmVPcHRpb25zO1xuXG5cdFx0aWYgKCF2aWV3cG9ydERhdGEgfHwgIXZpZXdMaW5lT3B0aW9ucykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmlzaWJsZVJhbmdlczogTGluZVZpc2libGVSYW5nZXNbXSA9IFtdO1xuXG5cdFx0bGV0IG5leHRMaW5lTW9kZWxMaW5lTnVtYmVyOiBudW1iZXIgPSAwO1xuXHRcdGlmIChpbmNsdWRlTmV3TGluZXMpIHtcblx0XHRcdG5leHRMaW5lTW9kZWxMaW5lTnVtYmVyID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbihuZXcgUG9zaXRpb24ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAxKSkubGluZU51bWJlcjtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IHJhbmdlLmVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXG5cdFx0XHRpZiAobGluZU51bWJlciA8IHJlbmRTdGFydExpbmVOdW1iZXIgfHwgbGluZU51bWJlciA+IHJlbmRFbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3RhcnRDb2x1bW4gPSBsaW5lTnVtYmVyID09PSByYW5nZS5zdGFydExpbmVOdW1iZXIgPyByYW5nZS5zdGFydENvbHVtbiA6IDE7XG5cdFx0XHRjb25zdCBjb250aW51ZXNJbk5leHRMaW5lID0gbGluZU51bWJlciAhPT0gb3JpZ2luYWxFbmRMaW5lTnVtYmVyO1xuXHRcdFx0Y29uc3QgZW5kQ29sdW1uID0gY29udGludWVzSW5OZXh0TGluZSA/IHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcikgOiByYW5nZS5lbmRDb2x1bW47XG5cblx0XHRcdGNvbnN0IHZpc2libGVSYW5nZXNGb3JMaW5lID0gdGhpcy5fdmlzaWJsZVJhbmdlc0ZvckxpbmVSYW5nZShsaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgZW5kQ29sdW1uKTtcblxuXHRcdFx0aWYgKCF2aXNpYmxlUmFuZ2VzRm9yTGluZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGluY2x1ZGVOZXdMaW5lcyAmJiBsaW5lTnVtYmVyIDwgb3JpZ2luYWxFbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRMaW5lTW9kZWxMaW5lTnVtYmVyID0gbmV4dExpbmVNb2RlbExpbmVOdW1iZXI7XG5cdFx0XHRcdG5leHRMaW5lTW9kZWxMaW5lTnVtYmVyID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbihuZXcgUG9zaXRpb24obGluZU51bWJlciArIDEsIDEpKS5saW5lTnVtYmVyO1xuXG5cdFx0XHRcdGlmIChjdXJyZW50TGluZU1vZGVsTGluZU51bWJlciAhPT0gbmV4dExpbmVNb2RlbExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHR2aXNpYmxlUmFuZ2VzRm9yTGluZS5yYW5nZXNbdmlzaWJsZVJhbmdlc0ZvckxpbmUucmFuZ2VzLmxlbmd0aCAtIDFdLndpZHRoICs9IHZpZXdMaW5lT3B0aW9ucy5zcGFjZVdpZHRoO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHZpc2libGVSYW5nZXMucHVzaChuZXcgTGluZVZpc2libGVSYW5nZXModmlzaWJsZVJhbmdlc0ZvckxpbmUub3V0c2lkZVJlbmRlcmVkTGluZSwgbGluZU51bWJlciwgSG9yaXpvbnRhbFJhbmdlLmZyb20odmlzaWJsZVJhbmdlc0ZvckxpbmUucmFuZ2VzKSwgY29udGludWVzSW5OZXh0TGluZSkpO1xuXHRcdH1cblxuXHRcdGlmICh2aXNpYmxlUmFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHZpc2libGVSYW5nZXM7XG5cdH1cblxuXHRwcml2YXRlIF92aXNpYmxlUmFuZ2VzRm9yTGluZVJhbmdlKGxpbmVOdW1iZXI6IG51bWJlciwgc3RhcnRDb2x1bW46IG51bWJlciwgZW5kQ29sdW1uOiBudW1iZXIpOiBWaXNpYmxlUmFuZ2VzIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuc2hvdWxkUmVuZGVyKCkpIHtcblx0XHRcdC8vIENhbm5vdCByZWFkIGZyb20gdGhlIERPTSBiZWNhdXNlIGl0IGlzIGRpcnR5XG5cdFx0XHQvLyBpLmUuIHRoZSBtb2RlbCAmIHRoZSBkb20gYXJlIG91dCBvZiBzeW5jLCBzbyBJJ2QgYmUgcmVhZGluZyBzb21ldGhpbmcgc3RhbGVcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdwb3J0RGF0YSA9IHRoaXMuX2xhc3RWaWV3cG9ydERhdGE7XG5cdFx0Y29uc3Qgdmlld0xpbmVPcHRpb25zID0gdGhpcy5fbGFzdFZpZXdMaW5lT3B0aW9ucztcblxuXHRcdGlmICghdmlld3BvcnREYXRhIHx8ICF2aWV3TGluZU9wdGlvbnMgfHwgbGluZU51bWJlciA8IHZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXIgfHwgbGluZU51bWJlciA+IHZpZXdwb3J0RGF0YS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBSZXNvbHZlIHRhYiB3aWR0aHMgZm9yIHRoaXMgbGluZVxuXHRcdGNvbnN0IGxpbmVEYXRhID0gdmlld3BvcnREYXRhLmdldFZpZXdMaW5lUmVuZGVyaW5nRGF0YShsaW5lTnVtYmVyKTtcblx0XHRjb25zdCBjb250ZW50ID0gbGluZURhdGEuY29udGVudDtcblxuXHRcdGxldCBjb250ZW50U2VnbWVudGVyOiBJQ29udGVudFNlZ21lbnRlciB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIShsaW5lRGF0YS5pc0Jhc2ljQVNDSUkgJiYgdmlld0xpbmVPcHRpb25zLnVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnMpKSB7XG5cdFx0XHRjb250ZW50U2VnbWVudGVyID0gY3JlYXRlQ29udGVudFNlZ21lbnRlcihsaW5lRGF0YSwgdmlld0xpbmVPcHRpb25zKTtcblx0XHR9XG5cblx0XHRsZXQgY2hhcnM6IHN0cmluZyB8IHVuZGVmaW5lZCA9ICcnO1xuXG5cdFx0bGV0IHJlc29sdmVkU3RhcnRDb2x1bW4gPSAwO1xuXHRcdGxldCByZXNvbHZlZFN0YXJ0Q3NzUGl4ZWxPZmZzZXQgPSAwO1xuXHRcdGZvciAobGV0IHggPSAwOyB4IDwgc3RhcnRDb2x1bW4gLSAxOyB4KyspIHtcblx0XHRcdGlmIChsaW5lRGF0YS5pc0Jhc2ljQVNDSUkgJiYgdmlld0xpbmVPcHRpb25zLnVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnMpIHtcblx0XHRcdFx0Y2hhcnMgPSBjb250ZW50LmNoYXJBdCh4KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNoYXJzID0gY29udGVudFNlZ21lbnRlciEuZ2V0U2VnbWVudEF0SW5kZXgoeCk7XG5cdFx0XHRcdGlmIChjaGFycyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZWRTdGFydENzc1BpeGVsT2Zmc2V0ICs9ICh0aGlzLl9yZW5kZXJTdHJhdGVneS52YWx1ZSEuZ2x5cGhSYXN0ZXJpemVyLmdldFRleHRNZXRyaWNzKGNoYXJzKS53aWR0aCAvIGdldEFjdGl2ZVdpbmRvdygpLmRldmljZVBpeGVsUmF0aW8pIC0gdmlld0xpbmVPcHRpb25zLnNwYWNlV2lkdGg7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2hhcnMgPT09ICdcXHQnKSB7XG5cdFx0XHRcdHJlc29sdmVkU3RhcnRDb2x1bW4gPSBDdXJzb3JDb2x1bW5zLm5leHRSZW5kZXJUYWJTdG9wKHJlc29sdmVkU3RhcnRDb2x1bW4sIGxpbmVEYXRhLnRhYlNpemUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzb2x2ZWRTdGFydENvbHVtbisrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRsZXQgcmVzb2x2ZWRFbmRDb2x1bW4gPSByZXNvbHZlZFN0YXJ0Q29sdW1uO1xuXHRcdGxldCByZXNvbHZlZEVuZENzc1BpeGVsT2Zmc2V0ID0gMDtcblx0XHRmb3IgKGxldCB4ID0gc3RhcnRDb2x1bW4gLSAxOyB4IDwgZW5kQ29sdW1uIC0gMTsgeCsrKSB7XG5cdFx0XHRpZiAobGluZURhdGEuaXNCYXNpY0FTQ0lJICYmIHZpZXdMaW5lT3B0aW9ucy51c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zKSB7XG5cdFx0XHRcdGNoYXJzID0gY29udGVudC5jaGFyQXQoeCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjaGFycyA9IGNvbnRlbnRTZWdtZW50ZXIhLmdldFNlZ21lbnRBdEluZGV4KHgpO1xuXHRcdFx0XHRpZiAoY2hhcnMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc29sdmVkRW5kQ3NzUGl4ZWxPZmZzZXQgKz0gKHRoaXMuX3JlbmRlclN0cmF0ZWd5LnZhbHVlIS5nbHlwaFJhc3Rlcml6ZXIuZ2V0VGV4dE1ldHJpY3MoY2hhcnMpLndpZHRoIC8gZ2V0QWN0aXZlV2luZG93KCkuZGV2aWNlUGl4ZWxSYXRpbykgLSB2aWV3TGluZU9wdGlvbnMuc3BhY2VXaWR0aDtcblx0XHRcdH1cblx0XHRcdGlmIChjaGFycyA9PT0gJ1xcdCcpIHtcblx0XHRcdFx0cmVzb2x2ZWRFbmRDb2x1bW4gPSBDdXJzb3JDb2x1bW5zLm5leHRSZW5kZXJUYWJTdG9wKHJlc29sdmVkRW5kQ29sdW1uLCBsaW5lRGF0YS50YWJTaXplKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc29sdmVkRW5kQ29sdW1uKys7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVmlzaWJsZSBob3Jpem9udGFsIHJhbmdlIGluIF9zY2FsZWRfIHBpeGVsc1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBWaXNpYmxlUmFuZ2VzKGZhbHNlLCBbbmV3IEZsb2F0SG9yaXpvbnRhbFJhbmdlKFxuXHRcdFx0cmVzb2x2ZWRTdGFydENvbHVtbiAqIHZpZXdMaW5lT3B0aW9ucy5zcGFjZVdpZHRoICsgcmVzb2x2ZWRTdGFydENzc1BpeGVsT2Zmc2V0LFxuXHRcdFx0KHJlc29sdmVkRW5kQ29sdW1uIC0gcmVzb2x2ZWRTdGFydENvbHVtbikgKiB2aWV3TGluZU9wdGlvbnMuc3BhY2VXaWR0aCArIHJlc29sdmVkRW5kQ3NzUGl4ZWxPZmZzZXQpXG5cdFx0XSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0dmlzaWJsZVJhbmdlRm9yUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uKTogSG9yaXpvbnRhbFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0Y29uc3QgdmlzaWJsZVJhbmdlcyA9IHRoaXMuX3Zpc2libGVSYW5nZXNGb3JMaW5lUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uLCBwb3NpdGlvbi5jb2x1bW4pO1xuXHRcdGlmICghdmlzaWJsZVJhbmdlcykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgSG9yaXpvbnRhbFBvc2l0aW9uKHZpc2libGVSYW5nZXMub3V0c2lkZVJlbmRlcmVkTGluZSwgdmlzaWJsZVJhbmdlcy5yYW5nZXNbMF0ubGVmdCk7XG5cdH1cblxuXHRnZXRMaW5lV2lkdGgobGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2xhc3RWaWV3cG9ydERhdGEgfHwgIXRoaXMuX2xhc3RWaWV3TGluZU9wdGlvbnMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fdmlld0dwdUNvbnRleHQuY2FuUmVuZGVyKHRoaXMuX2xhc3RWaWV3TGluZU9wdGlvbnMsIHRoaXMuX2xhc3RWaWV3cG9ydERhdGEsIGxpbmVOdW1iZXIpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVEYXRhID0gdGhpcy5fbGFzdFZpZXdwb3J0RGF0YS5nZXRWaWV3TGluZVJlbmRlcmluZ0RhdGEobGluZU51bWJlcik7XG5cdFx0Y29uc3QgbGluZVJhbmdlID0gdGhpcy5fdmlzaWJsZVJhbmdlc0ZvckxpbmVSYW5nZShsaW5lTnVtYmVyLCAxLCBsaW5lRGF0YS5tYXhDb2x1bW4pO1xuXHRcdGNvbnN0IGxhc3RSYW5nZSA9IGxpbmVSYW5nZT8ucmFuZ2VzLmF0KC0xKTtcblx0XHRpZiAobGFzdFJhbmdlKSB7XG5cdFx0XHQvLyBUb3RhbCBsaW5lIHdpZHRoIGlzIHRoZSBsZWZ0IG9mZnNldCBwbHVzIHdpZHRoIG9mIHRoZSBsYXN0IHJhbmdlXG5cdFx0XHRyZXR1cm4gbGFzdFJhbmdlLmxlZnQgKyBsYXN0UmFuZ2Uud2lkdGg7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldFBvc2l0aW9uQXRDb29yZGluYXRlKGxpbmVOdW1iZXI6IG51bWJlciwgbW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldDogbnVtYmVyKTogUG9zaXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fbGFzdFZpZXdwb3J0RGF0YSB8fCAhdGhpcy5fbGFzdFZpZXdMaW5lT3B0aW9ucykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl92aWV3R3B1Q29udGV4dC5jYW5SZW5kZXIodGhpcy5fbGFzdFZpZXdMaW5lT3B0aW9ucywgdGhpcy5fbGFzdFZpZXdwb3J0RGF0YSwgbGluZU51bWJlcikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGxpbmVEYXRhID0gdGhpcy5fbGFzdFZpZXdwb3J0RGF0YS5nZXRWaWV3TGluZVJlbmRlcmluZ0RhdGEobGluZU51bWJlcik7XG5cdFx0Y29uc3QgY29udGVudCA9IGxpbmVEYXRhLmNvbnRlbnQ7XG5cdFx0Y29uc3QgZHByID0gZ2V0QWN0aXZlV2luZG93KCkuZGV2aWNlUGl4ZWxSYXRpbztcblx0XHRjb25zdCBtb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0RGV2aWNlUGl4ZWxzID0gbW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCAqIGRwcjtcblx0XHRjb25zdCBzcGFjZVdpZHRoRGV2aWNlUGl4ZWxzID0gdGhpcy5fbGFzdFZpZXdMaW5lT3B0aW9ucy5zcGFjZVdpZHRoICogZHByO1xuXHRcdGNvbnN0IGNvbnRlbnRTZWdtZW50ZXIgPSBjcmVhdGVDb250ZW50U2VnbWVudGVyKGxpbmVEYXRhLCB0aGlzLl9sYXN0Vmlld0xpbmVPcHRpb25zKTtcblxuXHRcdGxldCB3aWR0aFNvRmFyID0gMDtcblx0XHRsZXQgY2hhcldpZHRoID0gMDtcblx0XHRsZXQgdGFiWE9mZnNldCA9IDA7XG5cdFx0bGV0IGNvbHVtbiA9IDA7XG5cdFx0Zm9yIChsZXQgeCA9IDA7IHggPCBjb250ZW50Lmxlbmd0aDsgeCsrKSB7XG5cdFx0XHRjb25zdCBjaGFycyA9IGNvbnRlbnRTZWdtZW50ZXIuZ2V0U2VnbWVudEF0SW5kZXgoeCk7XG5cblx0XHRcdC8vIFBhcnQgb2YgYW4gZWFybGllciBzZWdtZW50XG5cdFx0XHRpZiAoY2hhcnMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb2x1bW4rKztcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEdldCB0aGUgd2lkdGggb2YgdGhlIGNoYXJhY3RlclxuXHRcdFx0aWYgKGNoYXJzID09PSAnXFx0Jykge1xuXHRcdFx0XHQvLyBGaW5kIHRoZSBwaXhlbCBvZmZzZXQgYmV0d2VlbiB0aGUgY3VycmVudCBwb3NpdGlvbiBhbmQgdGhlIG5leHQgdGFiIHN0b3Bcblx0XHRcdFx0Y29uc3Qgb2Zmc2V0QmVmb3JlID0geCArIHRhYlhPZmZzZXQ7XG5cdFx0XHRcdHRhYlhPZmZzZXQgPSBDdXJzb3JDb2x1bW5zLm5leHRSZW5kZXJUYWJTdG9wKHggKyB0YWJYT2Zmc2V0LCBsaW5lRGF0YS50YWJTaXplKTtcblx0XHRcdFx0Y2hhcldpZHRoID0gc3BhY2VXaWR0aERldmljZVBpeGVscyAqICh0YWJYT2Zmc2V0IC0gb2Zmc2V0QmVmb3JlKTtcblx0XHRcdFx0Ly8gQ29udmVydCBiYWNrIHRvIG9mZnNldCBleGNsdWRpbmcgeCBhbmQgdGhlIGN1cnJlbnQgY2hhcmFjdGVyXG5cdFx0XHRcdHRhYlhPZmZzZXQgLT0geCArIDE7XG5cdFx0XHR9IGVsc2UgaWYgKGxpbmVEYXRhLmlzQmFzaWNBU0NJSSAmJiB0aGlzLl9sYXN0Vmlld0xpbmVPcHRpb25zLnVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnMpIHtcblx0XHRcdFx0Y2hhcldpZHRoID0gc3BhY2VXaWR0aERldmljZVBpeGVscztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNoYXJXaWR0aCA9IHRoaXMuX3JlbmRlclN0cmF0ZWd5LnZhbHVlIS5nbHlwaFJhc3Rlcml6ZXIuZ2V0VGV4dE1ldHJpY3MoY2hhcnMpLndpZHRoO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldERldmljZVBpeGVscyA8IHdpZHRoU29GYXIgKyBjaGFyV2lkdGggLyAyKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHR3aWR0aFNvRmFyICs9IGNoYXJXaWR0aDtcblx0XHRcdGNvbHVtbisrO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uICsgMSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxTQUFTLG1CQUFtQjtBQUNyQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFHdEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxpQkFBMEM7QUFDbkQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0Isb0JBQW9CLGlCQUE2QixtQkFBaUUscUJBQXFCO0FBQ3RLLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsOEJBQXNEO0FBQy9ELFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsdUJBQXVCO0FBRWhDLElBQVcseUJBQVgsa0JBQVdBLDRCQUFYO0FBQ0MsRUFBQUEsZ0RBQUEsb0JBQWlCLEtBQWpCO0FBQ0EsRUFBQUEsZ0RBQUEsbUJBQWdCLE1BQWhCO0FBQ0EsRUFBQUEsZ0RBQUEsNEJBQXlCLEtBQXpCO0FBQ0EsRUFBQUEsZ0RBQUEsd0JBQXFCLEtBQXJCO0FBQ0EsRUFBQUEsZ0RBQUEsMkJBQXdCLEtBQXhCO0FBTFUsU0FBQUE7QUFBQSxHQUFBO0FBV0os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
