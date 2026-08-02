import { getActiveWindow } from "../../../../base/browser/dom.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { NKeyMap } from "../../../../base/common/map.js";
import { ensureNonNullable } from "../gpuUtils.js";
import { UsagePreviewColors } from "./atlas.js";
class TextureAtlasSlabAllocator {
  constructor(_canvas, _textureIndex, options) {
    this._canvas = _canvas;
    this._textureIndex = _textureIndex;
    this._slabs = [];
    this._activeSlabsByDims = new NKeyMap();
    this._unusedRects = [];
    this._openRegionsByHeight = /* @__PURE__ */ new Map();
    this._openRegionsByWidth = /* @__PURE__ */ new Map();
    /** A set of all glyphs allocated, this is only tracked to enable debug related functionality */
    this._allocatedGlyphs = /* @__PURE__ */ new Set();
    this._nextIndex = 0;
    this._ctx = ensureNonNullable(this._canvas.getContext("2d", {
      willReadFrequently: true
    }));
    this._slabW = Math.min(
      options?.slabW ?? 64 << Math.max(Math.floor(getActiveWindow().devicePixelRatio) - 1, 0),
      this._canvas.width
    );
    this._slabH = Math.min(
      options?.slabH ?? this._slabW,
      this._canvas.height
    );
    this._slabsPerRow = Math.floor(this._canvas.width / this._slabW);
    this._slabsPerColumn = Math.floor(this._canvas.height / this._slabH);
  }
  allocate(rasterizedGlyph) {
    const glyphWidth = rasterizedGlyph.boundingBox.right - rasterizedGlyph.boundingBox.left + 1;
    const glyphHeight = rasterizedGlyph.boundingBox.bottom - rasterizedGlyph.boundingBox.top + 1;
    if (glyphWidth > this._canvas.width || glyphHeight > this._canvas.height) {
      throw new BugIndicatingError("Glyph is too large for the atlas page");
    }
    if (glyphWidth > this._slabW || glyphHeight > this._slabH) {
      if (this._allocatedGlyphs.size > 0) {
        return void 0;
      }
      let sizeCandidate = this._canvas.width;
      while (glyphWidth < sizeCandidate / 2 && glyphHeight < sizeCandidate / 2) {
        sizeCandidate /= 2;
      }
      this._slabW = sizeCandidate;
      this._slabH = sizeCandidate;
      this._slabsPerRow = Math.floor(this._canvas.width / this._slabW);
      this._slabsPerColumn = Math.floor(this._canvas.height / this._slabH);
    }
    const desiredSlabSize = {
      // Nearest square number
      // TODO: This can probably be optimized
      // w: 1 << Math.ceil(Math.sqrt(glyphWidth)),
      // h: 1 << Math.ceil(Math.sqrt(glyphHeight)),
      // Nearest x px
      // w: Math.ceil(glyphWidth / nearestXPixels) * nearestXPixels,
      // h: Math.ceil(glyphHeight / nearestXPixels) * nearestXPixels,
      // Round odd numbers up
      // w: glyphWidth % 0 === 1 ? glyphWidth + 1 : glyphWidth,
      // h: glyphHeight % 0 === 1 ? glyphHeight + 1 : glyphHeight,
      // Exact number only
      w: glyphWidth,
      h: glyphHeight
    };
    let slab = this._activeSlabsByDims.get(desiredSlabSize.w, desiredSlabSize.h);
    if (slab) {
      const glyphsPerSlab = Math.floor(this._slabW / slab.entryW) * Math.floor(this._slabH / slab.entryH);
      if (slab.count >= glyphsPerSlab) {
        slab = void 0;
      }
    }
    let dx;
    let dy;
    if (!slab) {
      if (glyphWidth < glyphHeight) {
        const openRegions = this._openRegionsByWidth.get(glyphWidth);
        if (openRegions?.length) {
          for (let i = openRegions.length - 1; i >= 0; i--) {
            const r = openRegions[i];
            if (r.w >= glyphWidth && r.h >= glyphHeight) {
              dx = r.x;
              dy = r.y;
              if (glyphWidth < r.w) {
                this._unusedRects.push({
                  x: r.x + glyphWidth,
                  y: r.y,
                  w: r.w - glyphWidth,
                  h: glyphHeight
                });
              }
              r.y += glyphHeight;
              r.h -= glyphHeight;
              if (r.h === 0) {
                if (i === openRegions.length - 1) {
                  openRegions.pop();
                } else {
                  this._unusedRects.splice(i, 1);
                }
              }
              break;
            }
          }
        }
      } else {
        const openRegions = this._openRegionsByHeight.get(glyphHeight);
        if (openRegions?.length) {
          for (let i = openRegions.length - 1; i >= 0; i--) {
            const r = openRegions[i];
            if (r.w >= glyphWidth && r.h >= glyphHeight) {
              dx = r.x;
              dy = r.y;
              if (glyphHeight < r.h) {
                this._unusedRects.push({
                  x: r.x,
                  y: r.y + glyphHeight,
                  w: glyphWidth,
                  h: r.h - glyphHeight
                });
              }
              r.x += glyphWidth;
              r.w -= glyphWidth;
              if (r.h === 0) {
                if (i === openRegions.length - 1) {
                  openRegions.pop();
                } else {
                  this._unusedRects.splice(i, 1);
                }
              }
              break;
            }
          }
        }
      }
    }
    if (dx === void 0 || dy === void 0) {
      if (!slab) {
        if (this._slabs.length >= this._slabsPerRow * this._slabsPerColumn) {
          return void 0;
        }
        slab = {
          x: Math.floor(this._slabs.length % this._slabsPerRow) * this._slabW,
          y: Math.floor(this._slabs.length / this._slabsPerRow) * this._slabH,
          entryW: desiredSlabSize.w,
          entryH: desiredSlabSize.h,
          count: 0
        };
        const unusedW = this._slabW % slab.entryW;
        const unusedH = this._slabH % slab.entryH;
        if (unusedW) {
          addEntryToMapArray(this._openRegionsByWidth, unusedW, {
            x: slab.x + this._slabW - unusedW,
            w: unusedW,
            y: slab.y,
            h: this._slabH - (unusedH ?? 0)
          });
        }
        if (unusedH) {
          addEntryToMapArray(this._openRegionsByHeight, unusedH, {
            x: slab.x,
            w: this._slabW,
            y: slab.y + this._slabH - unusedH,
            h: unusedH
          });
        }
        this._slabs.push(slab);
        this._activeSlabsByDims.set(slab, desiredSlabSize.w, desiredSlabSize.h);
      }
      const glyphsPerRow = Math.floor(this._slabW / slab.entryW);
      dx = slab.x + Math.floor(slab.count % glyphsPerRow) * slab.entryW;
      dy = slab.y + Math.floor(slab.count / glyphsPerRow) * slab.entryH;
      slab.count++;
    }
    this._ctx.drawImage(
      rasterizedGlyph.source,
      // source
      rasterizedGlyph.boundingBox.left,
      rasterizedGlyph.boundingBox.top,
      glyphWidth,
      glyphHeight,
      // destination
      dx,
      dy,
      glyphWidth,
      glyphHeight
    );
    const glyph = {
      pageIndex: this._textureIndex,
      glyphIndex: this._nextIndex++,
      x: dx,
      y: dy,
      w: glyphWidth,
      h: glyphHeight,
      originOffsetX: rasterizedGlyph.originOffset.x,
      originOffsetY: rasterizedGlyph.originOffset.y,
      fontBoundingBoxAscent: rasterizedGlyph.fontBoundingBoxAscent,
      fontBoundingBoxDescent: rasterizedGlyph.fontBoundingBoxDescent
    };
    this._allocatedGlyphs.add(glyph);
    return glyph;
  }
  getUsagePreview() {
    const w = this._canvas.width;
    const h = this._canvas.height;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = ensureNonNullable(canvas.getContext("2d"));
    ctx.fillStyle = UsagePreviewColors.Unused;
    ctx.fillRect(0, 0, w, h);
    let slabEntryPixels = 0;
    let usedPixels = 0;
    let slabEdgePixels = 0;
    let restrictedPixels = 0;
    const slabW = 64 << Math.floor(getActiveWindow().devicePixelRatio) - 1;
    const slabH = slabW;
    for (const slab of this._slabs) {
      let x = 0;
      let y = 0;
      for (let i = 0; i < slab.count; i++) {
        if (x + slab.entryW > slabW) {
          x = 0;
          y += slab.entryH;
        }
        ctx.fillStyle = UsagePreviewColors.Wasted;
        ctx.fillRect(slab.x + x, slab.y + y, slab.entryW, slab.entryH);
        slabEntryPixels += slab.entryW * slab.entryH;
        x += slab.entryW;
      }
      const entriesPerRow = Math.floor(slabW / slab.entryW);
      const entriesPerCol = Math.floor(slabH / slab.entryH);
      const thisSlabPixels = slab.entryW * entriesPerRow * slab.entryH * entriesPerCol;
      slabEdgePixels += slabW * slabH - thisSlabPixels;
    }
    for (const g of this._allocatedGlyphs) {
      usedPixels += g.w * g.h;
      ctx.fillStyle = UsagePreviewColors.Used;
      ctx.fillRect(g.x, g.y, g.w, g.h);
    }
    const unusedRegions = Array.from(this._openRegionsByWidth.values()).flat().concat(Array.from(this._openRegionsByHeight.values()).flat());
    for (const r of unusedRegions) {
      ctx.fillStyle = UsagePreviewColors.Restricted;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      restrictedPixels += r.w * r.h;
    }
    ctx.globalAlpha = 0.5;
    ctx.drawImage(this._canvas, 0, 0);
    ctx.globalAlpha = 1;
    return canvas.convertToBlob();
  }
  getStats() {
    const w = this._canvas.width;
    const h = this._canvas.height;
    let slabEntryPixels = 0;
    let usedPixels = 0;
    let slabEdgePixels = 0;
    let wastedPixels = 0;
    let restrictedPixels = 0;
    const totalPixels = w * h;
    const slabW = 64 << Math.floor(getActiveWindow().devicePixelRatio) - 1;
    const slabH = slabW;
    for (const slab of this._slabs) {
      let x = 0;
      let y = 0;
      for (let i = 0; i < slab.count; i++) {
        if (x + slab.entryW > slabW) {
          x = 0;
          y += slab.entryH;
        }
        slabEntryPixels += slab.entryW * slab.entryH;
        x += slab.entryW;
      }
      const entriesPerRow = Math.floor(slabW / slab.entryW);
      const entriesPerCol = Math.floor(slabH / slab.entryH);
      const thisSlabPixels = slab.entryW * entriesPerRow * slab.entryH * entriesPerCol;
      slabEdgePixels += slabW * slabH - thisSlabPixels;
    }
    for (const g of this._allocatedGlyphs) {
      usedPixels += g.w * g.h;
    }
    const unusedRegions = Array.from(this._openRegionsByWidth.values()).flat().concat(Array.from(this._openRegionsByHeight.values()).flat());
    for (const r of unusedRegions) {
      restrictedPixels += r.w * r.h;
    }
    const edgeUsedPixels = slabEdgePixels - restrictedPixels;
    wastedPixels = slabEntryPixels - (usedPixels - edgeUsedPixels);
    const efficiency = usedPixels / (usedPixels + wastedPixels + restrictedPixels);
    return [
      `page[${this._textureIndex}]:`,
      `     Total: ${totalPixels}px (${w}x${h})`,
      `      Used: ${usedPixels}px (${(usedPixels / totalPixels * 100).toFixed(2)}%)`,
      `    Wasted: ${wastedPixels}px (${(wastedPixels / totalPixels * 100).toFixed(2)}%)`,
      `Restricted: ${restrictedPixels}px (${(restrictedPixels / totalPixels * 100).toFixed(2)}%) (hard to allocate)`,
      `Efficiency: ${efficiency === 1 ? "100" : (efficiency * 100).toFixed(2)}%`,
      `     Slabs: ${this._slabs.length} of ${Math.floor(this._canvas.width / slabW) * Math.floor(this._canvas.height / slabH)}`
    ].join("\n");
  }
}
function addEntryToMapArray(map, key, entry) {
  let list = map.get(key);
  if (!list) {
    list = [];
    map.set(key, list);
  }
  list.push(entry);
}
export {
  TextureAtlasSlabAllocator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL2dwdS9hdGxhcy90ZXh0dXJlQXRsYXNTbGFiQWxsb2NhdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZ2V0QWN0aXZlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgTktleU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb25OdWxsYWJsZSB9IGZyb20gJy4uL2dwdVV0aWxzLmpzJztcbmltcG9ydCB0eXBlIHsgSVJhc3Rlcml6ZWRHbHlwaCB9IGZyb20gJy4uL3Jhc3Rlci9yYXN0ZXIuanMnO1xuaW1wb3J0IHsgVXNhZ2VQcmV2aWV3Q29sb3JzLCB0eXBlIElUZXh0dXJlQXRsYXNBbGxvY2F0b3IsIHR5cGUgSVRleHR1cmVBdGxhc1BhZ2VHbHlwaCB9IGZyb20gJy4vYXRsYXMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFRleHR1cmVBdGxhc1NsYWJBbGxvY2F0b3JPcHRpb25zIHtcblx0c2xhYlc/OiBudW1iZXI7XG5cdHNsYWJIPzogbnVtYmVyO1xufVxuXG4vKipcbiAqIFRoZSBzbGFiIGFsbG9jYXRvciBpcyBhIG1vcmUgY29tcGxleCBhbGxvY2F0b3IgdGhhdCBwbGFjZXMgZ2x5cGhzIGluIHNxdWFyZSBzbGFicyBvZiBhIGZpeGVkXG4gKiBzaXplLiBTbGFicyBhcmUgZGVmaW5lZCBieSBhIHNtYWxsIHJhbmdlIG9mIGdseXBocyBzaXplcyB0aGV5IGNhbiBob3VzZSwgdGhpcyBwbGFjZXMgbGlrZS1zaXplZFxuICogZ2x5cGhzIGluIHRoZSBzYW1lIHNsYWIgd2hpY2ggcmVkdWNlcyB3YXN0ZWQgc3BhY2UuXG4gKlxuICogU2xhYnMgYWxzbyBtYXkgY29udGFpbiBcInVudXNlZFwiIHJlZ2lvbnMgb24gdGhlIGxlZnQgYW5kIGJvdHRvbSBkZXBlbmRpbmcgb24gdGhlIHNpemUgb2YgdGhlXG4gKiBnbHlwaHMgdGhleSBpbmNsdWRlLiBUaGlzIHNwYWNlIGlzIHVzZWQgdG8gcGxhY2UgdmVyeSB0aGluIG9yIHNob3J0IGdseXBocywgd2hpY2ggd291bGQgb3RoZXJ3aXNlXG4gKiB3YXN0ZSBhIGxvdCBvZiBzcGFjZSBpbiB0aGVpciBvd24gc2xhYi5cbiAqL1xuZXhwb3J0IGNsYXNzIFRleHR1cmVBdGxhc1NsYWJBbGxvY2F0b3IgaW1wbGVtZW50cyBJVGV4dHVyZUF0bGFzQWxsb2NhdG9yIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jdHg6IE9mZnNjcmVlbkNhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zbGFiczogSVRleHR1cmVBdGxhc1NsYWJbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVTbGFic0J5RGltczogTktleU1hcDxJVGV4dHVyZUF0bGFzU2xhYiwgW251bWJlciwgbnVtYmVyXT4gPSBuZXcgTktleU1hcCgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3VudXNlZFJlY3RzOiBJVGV4dHVyZUF0bGFzU2xhYlVudXNlZFJlY3RbXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29wZW5SZWdpb25zQnlIZWlnaHQ6IE1hcDxudW1iZXIsIElUZXh0dXJlQXRsYXNTbGFiVW51c2VkUmVjdFtdPiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb3BlblJlZ2lvbnNCeVdpZHRoOiBNYXA8bnVtYmVyLCBJVGV4dHVyZUF0bGFzU2xhYlVudXNlZFJlY3RbXT4gPSBuZXcgTWFwKCk7XG5cblx0LyoqIEEgc2V0IG9mIGFsbCBnbHlwaHMgYWxsb2NhdGVkLCB0aGlzIGlzIG9ubHkgdHJhY2tlZCB0byBlbmFibGUgZGVidWcgcmVsYXRlZCBmdW5jdGlvbmFsaXR5ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FsbG9jYXRlZEdseXBoczogU2V0PFJlYWRvbmx5PElUZXh0dXJlQXRsYXNQYWdlR2x5cGg+PiA9IG5ldyBTZXQoKTtcblxuXHRwcml2YXRlIF9zbGFiVzogbnVtYmVyO1xuXHRwcml2YXRlIF9zbGFiSDogbnVtYmVyO1xuXHRwcml2YXRlIF9zbGFic1BlclJvdzogbnVtYmVyO1xuXHRwcml2YXRlIF9zbGFic1BlckNvbHVtbjogbnVtYmVyO1xuXHRwcml2YXRlIF9uZXh0SW5kZXggPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NhbnZhczogT2Zmc2NyZWVuQ2FudmFzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RleHR1cmVJbmRleDogbnVtYmVyLFxuXHRcdG9wdGlvbnM/OiBUZXh0dXJlQXRsYXNTbGFiQWxsb2NhdG9yT3B0aW9uc1xuXHQpIHtcblx0XHR0aGlzLl9jdHggPSBlbnN1cmVOb25OdWxsYWJsZSh0aGlzLl9jYW52YXMuZ2V0Q29udGV4dCgnMmQnLCB7XG5cdFx0XHR3aWxsUmVhZEZyZXF1ZW50bHk6IHRydWVcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9zbGFiVyA9IE1hdGgubWluKFxuXHRcdFx0b3B0aW9ucz8uc2xhYlcgPz8gKDY0IDw8IE1hdGgubWF4KE1hdGguZmxvb3IoZ2V0QWN0aXZlV2luZG93KCkuZGV2aWNlUGl4ZWxSYXRpbykgLSAxLCAwKSksXG5cdFx0XHR0aGlzLl9jYW52YXMud2lkdGhcblx0XHQpO1xuXHRcdHRoaXMuX3NsYWJIID0gTWF0aC5taW4oXG5cdFx0XHRvcHRpb25zPy5zbGFiSCA/PyB0aGlzLl9zbGFiVyxcblx0XHRcdHRoaXMuX2NhbnZhcy5oZWlnaHRcblx0XHQpO1xuXHRcdHRoaXMuX3NsYWJzUGVyUm93ID0gTWF0aC5mbG9vcih0aGlzLl9jYW52YXMud2lkdGggLyB0aGlzLl9zbGFiVyk7XG5cdFx0dGhpcy5fc2xhYnNQZXJDb2x1bW4gPSBNYXRoLmZsb29yKHRoaXMuX2NhbnZhcy5oZWlnaHQgLyB0aGlzLl9zbGFiSCk7XG5cdH1cblxuXHRwdWJsaWMgYWxsb2NhdGUocmFzdGVyaXplZEdseXBoOiBJUmFzdGVyaXplZEdseXBoKTogSVRleHR1cmVBdGxhc1BhZ2VHbHlwaCB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gRmluZCBpZGVhbCBzbGFiLCBjcmVhdGluZyBpdCBpZiB0aGVyZSBpcyBub25lIHN1aXRhYmxlXG5cdFx0Y29uc3QgZ2x5cGhXaWR0aCA9IHJhc3Rlcml6ZWRHbHlwaC5ib3VuZGluZ0JveC5yaWdodCAtIHJhc3Rlcml6ZWRHbHlwaC5ib3VuZGluZ0JveC5sZWZ0ICsgMTtcblx0XHRjb25zdCBnbHlwaEhlaWdodCA9IHJhc3Rlcml6ZWRHbHlwaC5ib3VuZGluZ0JveC5ib3R0b20gLSByYXN0ZXJpemVkR2x5cGguYm91bmRpbmdCb3gudG9wICsgMTtcblxuXHRcdC8vIFRoZSBnbHlwaCBkb2VzIG5vdCBmaXQgaW50byB0aGUgYXRsYXMgcGFnZSwgZ2x5cGhzIHNob3VsZCBuZXZlciBiZSB0aGlzIGxhcmdlIGluIHByYWN0aWNlXG5cdFx0aWYgKGdseXBoV2lkdGggPiB0aGlzLl9jYW52YXMud2lkdGggfHwgZ2x5cGhIZWlnaHQgPiB0aGlzLl9jYW52YXMuaGVpZ2h0KSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdHbHlwaCBpcyB0b28gbGFyZ2UgZm9yIHRoZSBhdGxhcyBwYWdlJyk7XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIGdseXBoIGRvZXMgbm90IGZpdCBpbnRvIGEgc2xhYlxuXHRcdGlmIChnbHlwaFdpZHRoID4gdGhpcy5fc2xhYlcgfHwgZ2x5cGhIZWlnaHQgPiB0aGlzLl9zbGFiSCkge1xuXHRcdFx0Ly8gT25seSBpZiB0aGlzIGlzIHRoZSBhbGxvY2F0b3IncyBmaXJzdCBnbHlwaCwgcmVzaXplIHRoZSBzbGFiIHNpemUgdG8gZml0IHRoZSBnbHlwaC5cblx0XHRcdGlmICh0aGlzLl9hbGxvY2F0ZWRHbHlwaHMuc2l6ZSA+IDApIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdC8vIEZpbmQgdGhlIGxhcmdlc3QgcG93ZXIgb2YgMiBkZXZpc29yIHRoYXQgdGhlIGdseXBoIGZpdHMgaW50bywgdGhpcyBlbnN1cmUgdGhlcmUgaXMgbm9cblx0XHRcdC8vIHdhc3RlZCBzcGFjZSBvdXRzaWRlIHRoZSBhbGxvY2F0ZWQgc2xhYnMuXG5cdFx0XHRsZXQgc2l6ZUNhbmRpZGF0ZSA9IHRoaXMuX2NhbnZhcy53aWR0aDtcblx0XHRcdHdoaWxlIChnbHlwaFdpZHRoIDwgc2l6ZUNhbmRpZGF0ZSAvIDIgJiYgZ2x5cGhIZWlnaHQgPCBzaXplQ2FuZGlkYXRlIC8gMikge1xuXHRcdFx0XHRzaXplQ2FuZGlkYXRlIC89IDI7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zbGFiVyA9IHNpemVDYW5kaWRhdGU7XG5cdFx0XHR0aGlzLl9zbGFiSCA9IHNpemVDYW5kaWRhdGU7XG5cdFx0XHR0aGlzLl9zbGFic1BlclJvdyA9IE1hdGguZmxvb3IodGhpcy5fY2FudmFzLndpZHRoIC8gdGhpcy5fc2xhYlcpO1xuXHRcdFx0dGhpcy5fc2xhYnNQZXJDb2x1bW4gPSBNYXRoLmZsb29yKHRoaXMuX2NhbnZhcy5oZWlnaHQgLyB0aGlzLl9zbGFiSCk7XG5cdFx0fVxuXG5cdFx0Ly8gY29uc3QgZHByID0gZ2V0QWN0aXZlV2luZG93KCkuZGV2aWNlUGl4ZWxSYXRpbztcblxuXHRcdC8vIFRPRE86IEluY2x1ZGUgZm9udCBzaXplIGFzIHdlbGwgYXMgRFBSIGluIG5lYXJlc3RYUGl4ZWxzIGNhbGN1bGF0aW9uXG5cblx0XHQvLyBSb3VuZCBzbGFiIGdseXBoIGRpbWVuc2lvbnMgdG8gdGhlIG5lYXJlc3QgeCBwaXhlbHMsIHdoZXJlIHggc2NhbGVkIHdpdGggZGV2aWNlIHBpeGVsIHJhdGlvXG5cdFx0Ly8gY29uc3QgbmVhcmVzdFhQaXhlbHMgPSBNYXRoLm1heCgxLCBNYXRoLmZsb29yKGRwciAvIDAuNSkpO1xuXHRcdC8vIGNvbnN0IG5lYXJlc3RYUGl4ZWxzID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihkcHIpKTtcblx0XHRjb25zdCBkZXNpcmVkU2xhYlNpemUgPSB7XG5cdFx0XHQvLyBOZWFyZXN0IHNxdWFyZSBudW1iZXJcblx0XHRcdC8vIFRPRE86IFRoaXMgY2FuIHByb2JhYmx5IGJlIG9wdGltaXplZFxuXHRcdFx0Ly8gdzogMSA8PCBNYXRoLmNlaWwoTWF0aC5zcXJ0KGdseXBoV2lkdGgpKSxcblx0XHRcdC8vIGg6IDEgPDwgTWF0aC5jZWlsKE1hdGguc3FydChnbHlwaEhlaWdodCkpLFxuXG5cdFx0XHQvLyBOZWFyZXN0IHggcHhcblx0XHRcdC8vIHc6IE1hdGguY2VpbChnbHlwaFdpZHRoIC8gbmVhcmVzdFhQaXhlbHMpICogbmVhcmVzdFhQaXhlbHMsXG5cdFx0XHQvLyBoOiBNYXRoLmNlaWwoZ2x5cGhIZWlnaHQgLyBuZWFyZXN0WFBpeGVscykgKiBuZWFyZXN0WFBpeGVscyxcblxuXHRcdFx0Ly8gUm91bmQgb2RkIG51bWJlcnMgdXBcblx0XHRcdC8vIHc6IGdseXBoV2lkdGggJSAwID09PSAxID8gZ2x5cGhXaWR0aCArIDEgOiBnbHlwaFdpZHRoLFxuXHRcdFx0Ly8gaDogZ2x5cGhIZWlnaHQgJSAwID09PSAxID8gZ2x5cGhIZWlnaHQgKyAxIDogZ2x5cGhIZWlnaHQsXG5cblx0XHRcdC8vIEV4YWN0IG51bWJlciBvbmx5XG5cdFx0XHR3OiBnbHlwaFdpZHRoLFxuXHRcdFx0aDogZ2x5cGhIZWlnaHQsXG5cdFx0fTtcblxuXHRcdC8vIEdldCBhbnkgZXhpc3Rpbmcgc2xhYlxuXHRcdGxldCBzbGFiID0gdGhpcy5fYWN0aXZlU2xhYnNCeURpbXMuZ2V0KGRlc2lyZWRTbGFiU2l6ZS53LCBkZXNpcmVkU2xhYlNpemUuaCk7XG5cblx0XHQvLyBDaGVjayBpZiB0aGUgc2xhYiBpcyBmdWxsXG5cdFx0aWYgKHNsYWIpIHtcblx0XHRcdGNvbnN0IGdseXBoc1BlclNsYWIgPSBNYXRoLmZsb29yKHRoaXMuX3NsYWJXIC8gc2xhYi5lbnRyeVcpICogTWF0aC5mbG9vcih0aGlzLl9zbGFiSCAvIHNsYWIuZW50cnlIKTtcblx0XHRcdGlmIChzbGFiLmNvdW50ID49IGdseXBoc1BlclNsYWIpIHtcblx0XHRcdFx0c2xhYiA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgZHg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZHk6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRcdC8vIFNlYXJjaCBmb3Igc3VpdGFibGUgc3BhY2UgaW4gdW51c2VkIHJlY3RhbmdsZXNcblx0XHRpZiAoIXNsYWIpIHtcblx0XHRcdC8vIE9ubHkgY2hlY2sgYXZhaWxhYmlsaXR5IGZvciB0aGUgc21hbGxlc3Qgc2lkZVxuXHRcdFx0aWYgKGdseXBoV2lkdGggPCBnbHlwaEhlaWdodCkge1xuXHRcdFx0XHRjb25zdCBvcGVuUmVnaW9ucyA9IHRoaXMuX29wZW5SZWdpb25zQnlXaWR0aC5nZXQoZ2x5cGhXaWR0aCk7XG5cdFx0XHRcdGlmIChvcGVuUmVnaW9ucz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Ly8gVE9ETzogRG9uJ3Qgc2VhcmNoIGV2ZXJ5dGhpbmc/XG5cdFx0XHRcdFx0Ly8gU2VhcmNoIGZyb20gdGhlIGVuZCBzbyB3ZSBjYW4gdHlwaWNhbGx5IHBvcCBpdCBvZmYgdGhlIHN0YWNrXG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IG9wZW5SZWdpb25zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdFx0XHRjb25zdCByID0gb3BlblJlZ2lvbnNbaV07XG5cdFx0XHRcdFx0XHRpZiAoci53ID49IGdseXBoV2lkdGggJiYgci5oID49IGdseXBoSGVpZ2h0KSB7XG5cdFx0XHRcdFx0XHRcdGR4ID0gci54O1xuXHRcdFx0XHRcdFx0XHRkeSA9IHIueTtcblx0XHRcdFx0XHRcdFx0aWYgKGdseXBoV2lkdGggPCByLncpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl91bnVzZWRSZWN0cy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRcdHg6IHIueCArIGdseXBoV2lkdGgsXG5cdFx0XHRcdFx0XHRcdFx0XHR5OiByLnksXG5cdFx0XHRcdFx0XHRcdFx0XHR3OiByLncgLSBnbHlwaFdpZHRoLFxuXHRcdFx0XHRcdFx0XHRcdFx0aDogZ2x5cGhIZWlnaHRcblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyLnkgKz0gZ2x5cGhIZWlnaHQ7XG5cdFx0XHRcdFx0XHRcdHIuaCAtPSBnbHlwaEhlaWdodDtcblx0XHRcdFx0XHRcdFx0aWYgKHIuaCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChpID09PSBvcGVuUmVnaW9ucy5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRvcGVuUmVnaW9ucy5wb3AoKTtcblx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5fdW51c2VkUmVjdHMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG9wZW5SZWdpb25zID0gdGhpcy5fb3BlblJlZ2lvbnNCeUhlaWdodC5nZXQoZ2x5cGhIZWlnaHQpO1xuXHRcdFx0XHRpZiAob3BlblJlZ2lvbnM/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdC8vIFRPRE86IERvbid0IHNlYXJjaCBldmVyeXRoaW5nP1xuXHRcdFx0XHRcdC8vIFNlYXJjaCBmcm9tIHRoZSBlbmQgc28gd2UgY2FuIHR5cGljYWxseSBwb3AgaXQgb2ZmIHRoZSBzdGFja1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSBvcGVuUmVnaW9ucy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgciA9IG9wZW5SZWdpb25zW2ldO1xuXHRcdFx0XHRcdFx0aWYgKHIudyA+PSBnbHlwaFdpZHRoICYmIHIuaCA+PSBnbHlwaEhlaWdodCkge1xuXHRcdFx0XHRcdFx0XHRkeCA9IHIueDtcblx0XHRcdFx0XHRcdFx0ZHkgPSByLnk7XG5cdFx0XHRcdFx0XHRcdGlmIChnbHlwaEhlaWdodCA8IHIuaCkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX3VudXNlZFJlY3RzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdFx0eDogci54LFxuXHRcdFx0XHRcdFx0XHRcdFx0eTogci55ICsgZ2x5cGhIZWlnaHQsXG5cdFx0XHRcdFx0XHRcdFx0XHR3OiBnbHlwaFdpZHRoLFxuXHRcdFx0XHRcdFx0XHRcdFx0aDogci5oIC0gZ2x5cGhIZWlnaHRcblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyLnggKz0gZ2x5cGhXaWR0aDtcblx0XHRcdFx0XHRcdFx0ci53IC09IGdseXBoV2lkdGg7XG5cdFx0XHRcdFx0XHRcdGlmIChyLmggPT09IDApIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoaSA9PT0gb3BlblJlZ2lvbnMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0b3BlblJlZ2lvbnMucG9wKCk7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuX3VudXNlZFJlY3RzLnNwbGljZShpLCAxKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIGEgbmV3IHNsYWJcblx0XHRpZiAoZHggPT09IHVuZGVmaW5lZCB8fCBkeSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAoIXNsYWIpIHtcblx0XHRcdFx0aWYgKHRoaXMuX3NsYWJzLmxlbmd0aCA+PSB0aGlzLl9zbGFic1BlclJvdyAqIHRoaXMuX3NsYWJzUGVyQ29sdW1uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHNsYWIgPSB7XG5cdFx0XHRcdFx0eDogTWF0aC5mbG9vcih0aGlzLl9zbGFicy5sZW5ndGggJSB0aGlzLl9zbGFic1BlclJvdykgKiB0aGlzLl9zbGFiVyxcblx0XHRcdFx0XHR5OiBNYXRoLmZsb29yKHRoaXMuX3NsYWJzLmxlbmd0aCAvIHRoaXMuX3NsYWJzUGVyUm93KSAqIHRoaXMuX3NsYWJILFxuXHRcdFx0XHRcdGVudHJ5VzogZGVzaXJlZFNsYWJTaXplLncsXG5cdFx0XHRcdFx0ZW50cnlIOiBkZXNpcmVkU2xhYlNpemUuaCxcblx0XHRcdFx0XHRjb3VudDogMFxuXHRcdFx0XHR9O1xuXHRcdFx0XHQvLyBUcmFjayB1bnVzZWQgcmVnaW9ucyB0byB1c2UgZm9yIHNtYWxsIGdseXBoc1xuXHRcdFx0XHQvLyArLS0tLS0tLS0tLS0tLSstLS0tK1xuXHRcdFx0XHQvLyB8ICAgICAgICAgICAgIHwgICAgfFxuXHRcdFx0XHQvLyB8ICAgICAgICAgICAgIHwgICAgfCA8LSBVbnVzZWQgVyByZWdpb25cblx0XHRcdFx0Ly8gfCAgICAgICAgICAgICB8ICAgIHxcblx0XHRcdFx0Ly8gfC0tLS0tLS0tLS0tLS0rLS0tLStcblx0XHRcdFx0Ly8gfCAgICAgICAgICAgICAgICAgIHwgPC0gVW51c2VkIEggcmVnaW9uXG5cdFx0XHRcdC8vICstLS0tLS0tLS0tLS0tLS0tLS0rXG5cdFx0XHRcdGNvbnN0IHVudXNlZFcgPSB0aGlzLl9zbGFiVyAlIHNsYWIuZW50cnlXO1xuXHRcdFx0XHRjb25zdCB1bnVzZWRIID0gdGhpcy5fc2xhYkggJSBzbGFiLmVudHJ5SDtcblx0XHRcdFx0aWYgKHVudXNlZFcpIHtcblx0XHRcdFx0XHRhZGRFbnRyeVRvTWFwQXJyYXkodGhpcy5fb3BlblJlZ2lvbnNCeVdpZHRoLCB1bnVzZWRXLCB7XG5cdFx0XHRcdFx0XHR4OiBzbGFiLnggKyB0aGlzLl9zbGFiVyAtIHVudXNlZFcsXG5cdFx0XHRcdFx0XHR3OiB1bnVzZWRXLFxuXHRcdFx0XHRcdFx0eTogc2xhYi55LFxuXHRcdFx0XHRcdFx0aDogdGhpcy5fc2xhYkggLSAodW51c2VkSCA/PyAwKVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh1bnVzZWRIKSB7XG5cdFx0XHRcdFx0YWRkRW50cnlUb01hcEFycmF5KHRoaXMuX29wZW5SZWdpb25zQnlIZWlnaHQsIHVudXNlZEgsIHtcblx0XHRcdFx0XHRcdHg6IHNsYWIueCxcblx0XHRcdFx0XHRcdHc6IHRoaXMuX3NsYWJXLFxuXHRcdFx0XHRcdFx0eTogc2xhYi55ICsgdGhpcy5fc2xhYkggLSB1bnVzZWRILFxuXHRcdFx0XHRcdFx0aDogdW51c2VkSFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3NsYWJzLnB1c2goc2xhYik7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVNsYWJzQnlEaW1zLnNldChzbGFiLCBkZXNpcmVkU2xhYlNpemUudywgZGVzaXJlZFNsYWJTaXplLmgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBnbHlwaHNQZXJSb3cgPSBNYXRoLmZsb29yKHRoaXMuX3NsYWJXIC8gc2xhYi5lbnRyeVcpO1xuXHRcdFx0ZHggPSBzbGFiLnggKyBNYXRoLmZsb29yKHNsYWIuY291bnQgJSBnbHlwaHNQZXJSb3cpICogc2xhYi5lbnRyeVc7XG5cdFx0XHRkeSA9IHNsYWIueSArIE1hdGguZmxvb3Ioc2xhYi5jb3VudCAvIGdseXBoc1BlclJvdykgKiBzbGFiLmVudHJ5SDtcblxuXHRcdFx0Ly8gU2hpZnQgY3VycmVudCByb3dcblx0XHRcdHNsYWIuY291bnQrKztcblx0XHR9XG5cblx0XHQvLyBEcmF3IGdseXBoXG5cdFx0dGhpcy5fY3R4LmRyYXdJbWFnZShcblx0XHRcdHJhc3Rlcml6ZWRHbHlwaC5zb3VyY2UsXG5cdFx0XHQvLyBzb3VyY2Vcblx0XHRcdHJhc3Rlcml6ZWRHbHlwaC5ib3VuZGluZ0JveC5sZWZ0LFxuXHRcdFx0cmFzdGVyaXplZEdseXBoLmJvdW5kaW5nQm94LnRvcCxcblx0XHRcdGdseXBoV2lkdGgsXG5cdFx0XHRnbHlwaEhlaWdodCxcblx0XHRcdC8vIGRlc3RpbmF0aW9uXG5cdFx0XHRkeCxcblx0XHRcdGR5LFxuXHRcdFx0Z2x5cGhXaWR0aCxcblx0XHRcdGdseXBoSGVpZ2h0XG5cdFx0KTtcblxuXHRcdC8vIENyZWF0ZSBnbHlwaCBvYmplY3Rcblx0XHRjb25zdCBnbHlwaDogSVRleHR1cmVBdGxhc1BhZ2VHbHlwaCA9IHtcblx0XHRcdHBhZ2VJbmRleDogdGhpcy5fdGV4dHVyZUluZGV4LFxuXHRcdFx0Z2x5cGhJbmRleDogdGhpcy5fbmV4dEluZGV4KyssXG5cdFx0XHR4OiBkeCxcblx0XHRcdHk6IGR5LFxuXHRcdFx0dzogZ2x5cGhXaWR0aCxcblx0XHRcdGg6IGdseXBoSGVpZ2h0LFxuXHRcdFx0b3JpZ2luT2Zmc2V0WDogcmFzdGVyaXplZEdseXBoLm9yaWdpbk9mZnNldC54LFxuXHRcdFx0b3JpZ2luT2Zmc2V0WTogcmFzdGVyaXplZEdseXBoLm9yaWdpbk9mZnNldC55LFxuXHRcdFx0Zm9udEJvdW5kaW5nQm94QXNjZW50OiByYXN0ZXJpemVkR2x5cGguZm9udEJvdW5kaW5nQm94QXNjZW50LFxuXHRcdFx0Zm9udEJvdW5kaW5nQm94RGVzY2VudDogcmFzdGVyaXplZEdseXBoLmZvbnRCb3VuZGluZ0JveERlc2NlbnQsXG5cdFx0fTtcblxuXHRcdC8vIFNldCB0aGUgZ2x5cGhcblx0XHR0aGlzLl9hbGxvY2F0ZWRHbHlwaHMuYWRkKGdseXBoKTtcblxuXHRcdHJldHVybiBnbHlwaDtcblx0fVxuXG5cdHB1YmxpYyBnZXRVc2FnZVByZXZpZXcoKTogUHJvbWlzZTxCbG9iPiB7XG5cdFx0Y29uc3QgdyA9IHRoaXMuX2NhbnZhcy53aWR0aDtcblx0XHRjb25zdCBoID0gdGhpcy5fY2FudmFzLmhlaWdodDtcblx0XHRjb25zdCBjYW52YXMgPSBuZXcgT2Zmc2NyZWVuQ2FudmFzKHcsIGgpO1xuXHRcdGNvbnN0IGN0eCA9IGVuc3VyZU5vbk51bGxhYmxlKGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpKTtcblxuXHRcdGN0eC5maWxsU3R5bGUgPSBVc2FnZVByZXZpZXdDb2xvcnMuVW51c2VkO1xuXHRcdGN0eC5maWxsUmVjdCgwLCAwLCB3LCBoKTtcblxuXHRcdGxldCBzbGFiRW50cnlQaXhlbHMgPSAwO1xuXHRcdGxldCB1c2VkUGl4ZWxzID0gMDtcblx0XHRsZXQgc2xhYkVkZ2VQaXhlbHMgPSAwO1xuXHRcdGxldCByZXN0cmljdGVkUGl4ZWxzID0gMDtcblx0XHRjb25zdCBzbGFiVyA9IDY0IDw8IChNYXRoLmZsb29yKGdldEFjdGl2ZVdpbmRvdygpLmRldmljZVBpeGVsUmF0aW8pIC0gMSk7XG5cdFx0Y29uc3Qgc2xhYkggPSBzbGFiVztcblxuXHRcdC8vIERyYXcgd2FzdGVkIHVuZGVybmVhdGggZ2x5cGhzIGZpcnN0XG5cdFx0Zm9yIChjb25zdCBzbGFiIG9mIHRoaXMuX3NsYWJzKSB7XG5cdFx0XHRsZXQgeCA9IDA7XG5cdFx0XHRsZXQgeSA9IDA7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNsYWIuY291bnQ7IGkrKykge1xuXHRcdFx0XHRpZiAoeCArIHNsYWIuZW50cnlXID4gc2xhYlcpIHtcblx0XHRcdFx0XHR4ID0gMDtcblx0XHRcdFx0XHR5ICs9IHNsYWIuZW50cnlIO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGN0eC5maWxsU3R5bGUgPSBVc2FnZVByZXZpZXdDb2xvcnMuV2FzdGVkO1xuXHRcdFx0XHRjdHguZmlsbFJlY3Qoc2xhYi54ICsgeCwgc2xhYi55ICsgeSwgc2xhYi5lbnRyeVcsIHNsYWIuZW50cnlIKTtcblxuXHRcdFx0XHRzbGFiRW50cnlQaXhlbHMgKz0gc2xhYi5lbnRyeVcgKiBzbGFiLmVudHJ5SDtcblx0XHRcdFx0eCArPSBzbGFiLmVudHJ5Vztcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVudHJpZXNQZXJSb3cgPSBNYXRoLmZsb29yKHNsYWJXIC8gc2xhYi5lbnRyeVcpO1xuXHRcdFx0Y29uc3QgZW50cmllc1BlckNvbCA9IE1hdGguZmxvb3Ioc2xhYkggLyBzbGFiLmVudHJ5SCk7XG5cdFx0XHRjb25zdCB0aGlzU2xhYlBpeGVscyA9IHNsYWIuZW50cnlXICogZW50cmllc1BlclJvdyAqIHNsYWIuZW50cnlIICogZW50cmllc1BlckNvbDtcblx0XHRcdHNsYWJFZGdlUGl4ZWxzICs9IChzbGFiVyAqIHNsYWJIKSAtIHRoaXNTbGFiUGl4ZWxzO1xuXHRcdH1cblxuXHRcdC8vIERyYXcgZ2x5cGhzXG5cdFx0Zm9yIChjb25zdCBnIG9mIHRoaXMuX2FsbG9jYXRlZEdseXBocykge1xuXHRcdFx0dXNlZFBpeGVscyArPSBnLncgKiBnLmg7XG5cdFx0XHRjdHguZmlsbFN0eWxlID0gVXNhZ2VQcmV2aWV3Q29sb3JzLlVzZWQ7XG5cdFx0XHRjdHguZmlsbFJlY3QoZy54LCBnLnksIGcudywgZy5oKTtcblx0XHR9XG5cblx0XHQvLyBEcmF3IHVudXNlZCBzcGFjZSBvbiBzaWRlXG5cdFx0Y29uc3QgdW51c2VkUmVnaW9ucyA9IEFycmF5LmZyb20odGhpcy5fb3BlblJlZ2lvbnNCeVdpZHRoLnZhbHVlcygpKS5mbGF0KCkuY29uY2F0KEFycmF5LmZyb20odGhpcy5fb3BlblJlZ2lvbnNCeUhlaWdodC52YWx1ZXMoKSkuZmxhdCgpKTtcblx0XHRmb3IgKGNvbnN0IHIgb2YgdW51c2VkUmVnaW9ucykge1xuXHRcdFx0Y3R4LmZpbGxTdHlsZSA9IFVzYWdlUHJldmlld0NvbG9ycy5SZXN0cmljdGVkO1xuXHRcdFx0Y3R4LmZpbGxSZWN0KHIueCwgci55LCByLncsIHIuaCk7XG5cdFx0XHRyZXN0cmljdGVkUGl4ZWxzICs9IHIudyAqIHIuaDtcblx0XHR9XG5cblxuXHRcdC8vIE92ZXJsYXkgYWN0dWFsIGdseXBocyBvbiB0b3Bcblx0XHRjdHguZ2xvYmFsQWxwaGEgPSAwLjU7XG5cdFx0Y3R4LmRyYXdJbWFnZSh0aGlzLl9jYW52YXMsIDAsIDApO1xuXHRcdGN0eC5nbG9iYWxBbHBoYSA9IDE7XG5cblx0XHRyZXR1cm4gY2FudmFzLmNvbnZlcnRUb0Jsb2IoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTdGF0cygpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHcgPSB0aGlzLl9jYW52YXMud2lkdGg7XG5cdFx0Y29uc3QgaCA9IHRoaXMuX2NhbnZhcy5oZWlnaHQ7XG5cblx0XHRsZXQgc2xhYkVudHJ5UGl4ZWxzID0gMDtcblx0XHRsZXQgdXNlZFBpeGVscyA9IDA7XG5cdFx0bGV0IHNsYWJFZGdlUGl4ZWxzID0gMDtcblx0XHRsZXQgd2FzdGVkUGl4ZWxzID0gMDtcblx0XHRsZXQgcmVzdHJpY3RlZFBpeGVscyA9IDA7XG5cdFx0Y29uc3QgdG90YWxQaXhlbHMgPSB3ICogaDtcblx0XHRjb25zdCBzbGFiVyA9IDY0IDw8IChNYXRoLmZsb29yKGdldEFjdGl2ZVdpbmRvdygpLmRldmljZVBpeGVsUmF0aW8pIC0gMSk7XG5cdFx0Y29uc3Qgc2xhYkggPSBzbGFiVztcblxuXHRcdC8vIERyYXcgd2FzdGVkIHVuZGVybmVhdGggZ2x5cGhzIGZpcnN0XG5cdFx0Zm9yIChjb25zdCBzbGFiIG9mIHRoaXMuX3NsYWJzKSB7XG5cdFx0XHRsZXQgeCA9IDA7XG5cdFx0XHRsZXQgeSA9IDA7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNsYWIuY291bnQ7IGkrKykge1xuXHRcdFx0XHRpZiAoeCArIHNsYWIuZW50cnlXID4gc2xhYlcpIHtcblx0XHRcdFx0XHR4ID0gMDtcblx0XHRcdFx0XHR5ICs9IHNsYWIuZW50cnlIO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNsYWJFbnRyeVBpeGVscyArPSBzbGFiLmVudHJ5VyAqIHNsYWIuZW50cnlIO1xuXHRcdFx0XHR4ICs9IHNsYWIuZW50cnlXO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZW50cmllc1BlclJvdyA9IE1hdGguZmxvb3Ioc2xhYlcgLyBzbGFiLmVudHJ5Vyk7XG5cdFx0XHRjb25zdCBlbnRyaWVzUGVyQ29sID0gTWF0aC5mbG9vcihzbGFiSCAvIHNsYWIuZW50cnlIKTtcblx0XHRcdGNvbnN0IHRoaXNTbGFiUGl4ZWxzID0gc2xhYi5lbnRyeVcgKiBlbnRyaWVzUGVyUm93ICogc2xhYi5lbnRyeUggKiBlbnRyaWVzUGVyQ29sO1xuXHRcdFx0c2xhYkVkZ2VQaXhlbHMgKz0gKHNsYWJXICogc2xhYkgpIC0gdGhpc1NsYWJQaXhlbHM7XG5cdFx0fVxuXG5cdFx0Ly8gRHJhdyBnbHlwaHNcblx0XHRmb3IgKGNvbnN0IGcgb2YgdGhpcy5fYWxsb2NhdGVkR2x5cGhzKSB7XG5cdFx0XHR1c2VkUGl4ZWxzICs9IGcudyAqIGcuaDtcblx0XHR9XG5cblx0XHQvLyBEcmF3IHVudXNlZCBzcGFjZSBvbiBzaWRlXG5cdFx0Y29uc3QgdW51c2VkUmVnaW9ucyA9IEFycmF5LmZyb20odGhpcy5fb3BlblJlZ2lvbnNCeVdpZHRoLnZhbHVlcygpKS5mbGF0KCkuY29uY2F0KEFycmF5LmZyb20odGhpcy5fb3BlblJlZ2lvbnNCeUhlaWdodC52YWx1ZXMoKSkuZmxhdCgpKTtcblx0XHRmb3IgKGNvbnN0IHIgb2YgdW51c2VkUmVnaW9ucykge1xuXHRcdFx0cmVzdHJpY3RlZFBpeGVscyArPSByLncgKiByLmg7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRnZVVzZWRQaXhlbHMgPSBzbGFiRWRnZVBpeGVscyAtIHJlc3RyaWN0ZWRQaXhlbHM7XG5cdFx0d2FzdGVkUGl4ZWxzID0gc2xhYkVudHJ5UGl4ZWxzIC0gKHVzZWRQaXhlbHMgLSBlZGdlVXNlZFBpeGVscyk7XG5cblx0XHQvLyB1c2VkUGl4ZWxzICs9IHNsYWJFZGdlUGl4ZWxzIC0gcmVzdHJpY3RlZFBpeGVscztcblx0XHRjb25zdCBlZmZpY2llbmN5ID0gdXNlZFBpeGVscyAvICh1c2VkUGl4ZWxzICsgd2FzdGVkUGl4ZWxzICsgcmVzdHJpY3RlZFBpeGVscyk7XG5cblx0XHRyZXR1cm4gW1xuXHRcdFx0YHBhZ2VbJHt0aGlzLl90ZXh0dXJlSW5kZXh9XTpgLFxuXHRcdFx0YCAgICAgVG90YWw6ICR7dG90YWxQaXhlbHN9cHggKCR7d314JHtofSlgLFxuXHRcdFx0YCAgICAgIFVzZWQ6ICR7dXNlZFBpeGVsc31weCAoJHsoKHVzZWRQaXhlbHMgLyB0b3RhbFBpeGVscykgKiAxMDApLnRvRml4ZWQoMil9JSlgLFxuXHRcdFx0YCAgICBXYXN0ZWQ6ICR7d2FzdGVkUGl4ZWxzfXB4ICgkeygod2FzdGVkUGl4ZWxzIC8gdG90YWxQaXhlbHMpICogMTAwKS50b0ZpeGVkKDIpfSUpYCxcblx0XHRcdGBSZXN0cmljdGVkOiAke3Jlc3RyaWN0ZWRQaXhlbHN9cHggKCR7KChyZXN0cmljdGVkUGl4ZWxzIC8gdG90YWxQaXhlbHMpICogMTAwKS50b0ZpeGVkKDIpfSUpIChoYXJkIHRvIGFsbG9jYXRlKWAsXG5cdFx0XHRgRWZmaWNpZW5jeTogJHtlZmZpY2llbmN5ID09PSAxID8gJzEwMCcgOiAoZWZmaWNpZW5jeSAqIDEwMCkudG9GaXhlZCgyKX0lYCxcblx0XHRcdGAgICAgIFNsYWJzOiAke3RoaXMuX3NsYWJzLmxlbmd0aH0gb2YgJHtNYXRoLmZsb29yKHRoaXMuX2NhbnZhcy53aWR0aCAvIHNsYWJXKSAqIE1hdGguZmxvb3IodGhpcy5fY2FudmFzLmhlaWdodCAvIHNsYWJIKX1gXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVRleHR1cmVBdGxhc1NsYWIge1xuXHR4OiBudW1iZXI7XG5cdHk6IG51bWJlcjtcblx0ZW50cnlIOiBudW1iZXI7XG5cdGVudHJ5VzogbnVtYmVyO1xuXHRjb3VudDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSVRleHR1cmVBdGxhc1NsYWJVbnVzZWRSZWN0IHtcblx0eDogbnVtYmVyO1xuXHR5OiBudW1iZXI7XG5cdHc6IG51bWJlcjtcblx0aDogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBhZGRFbnRyeVRvTWFwQXJyYXk8SywgVj4obWFwOiBNYXA8SywgVltdPiwga2V5OiBLLCBlbnRyeTogVikge1xuXHRsZXQgbGlzdCA9IG1hcC5nZXQoa2V5KTtcblx0aWYgKCFsaXN0KSB7XG5cdFx0bGlzdCA9IFtdO1xuXHRcdG1hcC5zZXQoa2V5LCBsaXN0KTtcblx0fVxuXHRsaXN0LnB1c2goZW50cnkpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsMEJBQW9GO0FBZ0J0RixNQUFNLDBCQUE0RDtBQUFBLEVBcUJ4RSxZQUNrQixTQUNBLGVBQ2pCLFNBQ0M7QUFIZ0I7QUFDQTtBQW5CbEIsU0FBaUIsU0FBOEIsQ0FBQztBQUNoRCxTQUFpQixxQkFBbUUsSUFBSSxRQUFRO0FBRWhHLFNBQWlCLGVBQThDLENBQUM7QUFFaEUsU0FBaUIsdUJBQW1FLG9CQUFJLElBQUk7QUFDNUYsU0FBaUIsc0JBQWtFLG9CQUFJLElBQUk7QUFHM0Y7QUFBQSxTQUFpQixtQkFBMEQsb0JB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
