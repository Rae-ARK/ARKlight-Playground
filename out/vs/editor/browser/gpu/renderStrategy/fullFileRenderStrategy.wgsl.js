import { TextureAtlas } from "../atlas/textureAtlas.js";
import { TextureAtlasPage } from "../atlas/textureAtlasPage.js";
import { BindingId } from "../gpu.js";
const fullFileRenderStrategyWgsl = (
  /*wgsl*/
  `
struct GlyphInfo {
	position: vec2f,
	size: vec2f,
	origin: vec2f,
};

struct Vertex {
	@location(0) position: vec2f,
};

struct Cell {
	position: vec2f,
	unused1: vec2f,
	glyphIndex: f32,
	textureIndex: f32
};

struct LayoutInfo {
	canvasDims: vec2f,
	viewportOffset: vec2f,
	viewportDims: vec2f,
}

struct ScrollOffset {
	offset: vec2f
}

struct VSOutput {
	@builtin(position) position:   vec4f,
	@location(1)       layerIndex: f32,
	@location(0)       texcoord:   vec2f,
};

// Uniforms
@group(0) @binding(${BindingId.LayoutInfoUniform})       var<uniform>       layoutInfo:      LayoutInfo;
@group(0) @binding(${BindingId.AtlasDimensionsUniform})  var<uniform>       atlasDims:       vec2f;
@group(0) @binding(${BindingId.ScrollOffset})            var<uniform>       scrollOffset:    ScrollOffset;

// Storage buffers
@group(0) @binding(${BindingId.GlyphInfo})               var<storage, read> glyphInfo:       array<array<GlyphInfo, ${TextureAtlasPage.maximumGlyphCount}>, ${TextureAtlas.maximumPageCount}>;
@group(0) @binding(${BindingId.Cells})                   var<storage, read> cells:           array<Cell>;

@vertex fn vs(
	vert: Vertex,
	@builtin(instance_index) instanceIndex: u32,
	@builtin(vertex_index) vertexIndex : u32
) -> VSOutput {
	let cell = cells[instanceIndex];
	var glyph = glyphInfo[u32(cell.textureIndex)][u32(cell.glyphIndex)];

	var vsOut: VSOutput;
	// Multiple vert.position by 2,-2 to get it into clipspace which ranged from -1 to 1
	vsOut.position = vec4f(
		// Make everything relative to top left instead of center
		vec2f(-1, 1) +
		((vert.position * vec2f(2, -2)) / layoutInfo.canvasDims) * glyph.size +
		((cell.position * vec2f(2, -2)) / layoutInfo.canvasDims) +
		((glyph.origin * vec2f(2, -2)) / layoutInfo.canvasDims) +
		(((layoutInfo.viewportOffset - scrollOffset.offset * vec2(1, -1)) * 2) / layoutInfo.canvasDims),
		0.0,
		1.0
	);

	vsOut.layerIndex = cell.textureIndex;
	// Textures are flipped from natural direction on the y-axis, so flip it back
	vsOut.texcoord = vert.position;
	vsOut.texcoord = (
		// Glyph offset (0-1)
		(glyph.position / atlasDims) +
		// Glyph coordinate (0-1)
		(vsOut.texcoord * (glyph.size / atlasDims))
	);

	return vsOut;
}

@group(0) @binding(${BindingId.TextureSampler}) var ourSampler: sampler;
@group(0) @binding(${BindingId.Texture})        var ourTexture: texture_2d_array<f32>;

@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
	return textureSample(ourTexture, ourSampler, vsOut.texcoord, u32(vsOut.layerIndex));
}
`
);
export {
  fullFileRenderStrategyWgsl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL2dwdS9yZW5kZXJTdHJhdGVneS9mdWxsRmlsZVJlbmRlclN0cmF0ZWd5Lndnc2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBUZXh0dXJlQXRsYXMgfSBmcm9tICcuLi9hdGxhcy90ZXh0dXJlQXRsYXMuanMnO1xuaW1wb3J0IHsgVGV4dHVyZUF0bGFzUGFnZSB9IGZyb20gJy4uL2F0bGFzL3RleHR1cmVBdGxhc1BhZ2UuanMnO1xuaW1wb3J0IHsgQmluZGluZ0lkIH0gZnJvbSAnLi4vZ3B1LmpzJztcblxuZXhwb3J0IGNvbnN0IGZ1bGxGaWxlUmVuZGVyU3RyYXRlZ3lXZ3NsID0gLyp3Z3NsKi8gYFxuc3RydWN0IEdseXBoSW5mbyB7XG5cdHBvc2l0aW9uOiB2ZWMyZixcblx0c2l6ZTogdmVjMmYsXG5cdG9yaWdpbjogdmVjMmYsXG59O1xuXG5zdHJ1Y3QgVmVydGV4IHtcblx0QGxvY2F0aW9uKDApIHBvc2l0aW9uOiB2ZWMyZixcbn07XG5cbnN0cnVjdCBDZWxsIHtcblx0cG9zaXRpb246IHZlYzJmLFxuXHR1bnVzZWQxOiB2ZWMyZixcblx0Z2x5cGhJbmRleDogZjMyLFxuXHR0ZXh0dXJlSW5kZXg6IGYzMlxufTtcblxuc3RydWN0IExheW91dEluZm8ge1xuXHRjYW52YXNEaW1zOiB2ZWMyZixcblx0dmlld3BvcnRPZmZzZXQ6IHZlYzJmLFxuXHR2aWV3cG9ydERpbXM6IHZlYzJmLFxufVxuXG5zdHJ1Y3QgU2Nyb2xsT2Zmc2V0IHtcblx0b2Zmc2V0OiB2ZWMyZlxufVxuXG5zdHJ1Y3QgVlNPdXRwdXQge1xuXHRAYnVpbHRpbihwb3NpdGlvbikgcG9zaXRpb246ICAgdmVjNGYsXG5cdEBsb2NhdGlvbigxKSAgICAgICBsYXllckluZGV4OiBmMzIsXG5cdEBsb2NhdGlvbigwKSAgICAgICB0ZXhjb29yZDogICB2ZWMyZixcbn07XG5cbi8vIFVuaWZvcm1zXG5AZ3JvdXAoMCkgQGJpbmRpbmcoJHtCaW5kaW5nSWQuTGF5b3V0SW5mb1VuaWZvcm19KSAgICAgICB2YXI8dW5pZm9ybT4gICAgICAgbGF5b3V0SW5mbzogICAgICBMYXlvdXRJbmZvO1xuQGdyb3VwKDApIEBiaW5kaW5nKCR7QmluZGluZ0lkLkF0bGFzRGltZW5zaW9uc1VuaWZvcm19KSAgdmFyPHVuaWZvcm0+ICAgICAgIGF0bGFzRGltczogICAgICAgdmVjMmY7XG5AZ3JvdXAoMCkgQGJpbmRpbmcoJHtCaW5kaW5nSWQuU2Nyb2xsT2Zmc2V0fSkgICAgICAgICAgICB2YXI8dW5pZm9ybT4gICAgICAgc2Nyb2xsT2Zmc2V0OiAgICBTY3JvbGxPZmZzZXQ7XG5cbi8vIFN0b3JhZ2UgYnVmZmVyc1xuQGdyb3VwKDApIEBiaW5kaW5nKCR7QmluZGluZ0lkLkdseXBoSW5mb30pICAgICAgICAgICAgICAgdmFyPHN0b3JhZ2UsIHJlYWQ+IGdseXBoSW5mbzogICAgICAgYXJyYXk8YXJyYXk8R2x5cGhJbmZvLCAke1RleHR1cmVBdGxhc1BhZ2UubWF4aW11bUdseXBoQ291bnR9PiwgJHtUZXh0dXJlQXRsYXMubWF4aW11bVBhZ2VDb3VudH0+O1xuQGdyb3VwKDApIEBiaW5kaW5nKCR7QmluZGluZ0lkLkNlbGxzfSkgICAgICAgICAgICAgICAgICAgdmFyPHN0b3JhZ2UsIHJlYWQ+IGNlbGxzOiAgICAgICAgICAgYXJyYXk8Q2VsbD47XG5cbkB2ZXJ0ZXggZm4gdnMoXG5cdHZlcnQ6IFZlcnRleCxcblx0QGJ1aWx0aW4oaW5zdGFuY2VfaW5kZXgpIGluc3RhbmNlSW5kZXg6IHUzMixcblx0QGJ1aWx0aW4odmVydGV4X2luZGV4KSB2ZXJ0ZXhJbmRleCA6IHUzMlxuKSAtPiBWU091dHB1dCB7XG5cdGxldCBjZWxsID0gY2VsbHNbaW5zdGFuY2VJbmRleF07XG5cdHZhciBnbHlwaCA9IGdseXBoSW5mb1t1MzIoY2VsbC50ZXh0dXJlSW5kZXgpXVt1MzIoY2VsbC5nbHlwaEluZGV4KV07XG5cblx0dmFyIHZzT3V0OiBWU091dHB1dDtcblx0Ly8gTXVsdGlwbGUgdmVydC5wb3NpdGlvbiBieSAyLC0yIHRvIGdldCBpdCBpbnRvIGNsaXBzcGFjZSB3aGljaCByYW5nZWQgZnJvbSAtMSB0byAxXG5cdHZzT3V0LnBvc2l0aW9uID0gdmVjNGYoXG5cdFx0Ly8gTWFrZSBldmVyeXRoaW5nIHJlbGF0aXZlIHRvIHRvcCBsZWZ0IGluc3RlYWQgb2YgY2VudGVyXG5cdFx0dmVjMmYoLTEsIDEpICtcblx0XHQoKHZlcnQucG9zaXRpb24gKiB2ZWMyZigyLCAtMikpIC8gbGF5b3V0SW5mby5jYW52YXNEaW1zKSAqIGdseXBoLnNpemUgK1xuXHRcdCgoY2VsbC5wb3NpdGlvbiAqIHZlYzJmKDIsIC0yKSkgLyBsYXlvdXRJbmZvLmNhbnZhc0RpbXMpICtcblx0XHQoKGdseXBoLm9yaWdpbiAqIHZlYzJmKDIsIC0yKSkgLyBsYXlvdXRJbmZvLmNhbnZhc0RpbXMpICtcblx0XHQoKChsYXlvdXRJbmZvLnZpZXdwb3J0T2Zmc2V0IC0gc2Nyb2xsT2Zmc2V0Lm9mZnNldCAqIHZlYzIoMSwgLTEpKSAqIDIpIC8gbGF5b3V0SW5mby5jYW52YXNEaW1zKSxcblx0XHQwLjAsXG5cdFx0MS4wXG5cdCk7XG5cblx0dnNPdXQubGF5ZXJJbmRleCA9IGNlbGwudGV4dHVyZUluZGV4O1xuXHQvLyBUZXh0dXJlcyBhcmUgZmxpcHBlZCBmcm9tIG5hdHVyYWwgZGlyZWN0aW9uIG9uIHRoZSB5LWF4aXMsIHNvIGZsaXAgaXQgYmFja1xuXHR2c091dC50ZXhjb29yZCA9IHZlcnQucG9zaXRpb247XG5cdHZzT3V0LnRleGNvb3JkID0gKFxuXHRcdC8vIEdseXBoIG9mZnNldCAoMC0xKVxuXHRcdChnbHlwaC5wb3NpdGlvbiAvIGF0bGFzRGltcykgK1xuXHRcdC8vIEdseXBoIGNvb3JkaW5hdGUgKDAtMSlcblx0XHQodnNPdXQudGV4Y29vcmQgKiAoZ2x5cGguc2l6ZSAvIGF0bGFzRGltcykpXG5cdCk7XG5cblx0cmV0dXJuIHZzT3V0O1xufVxuXG5AZ3JvdXAoMCkgQGJpbmRpbmcoJHtCaW5kaW5nSWQuVGV4dHVyZVNhbXBsZXJ9KSB2YXIgb3VyU2FtcGxlcjogc2FtcGxlcjtcbkBncm91cCgwKSBAYmluZGluZygke0JpbmRpbmdJZC5UZXh0dXJlfSkgICAgICAgIHZhciBvdXJUZXh0dXJlOiB0ZXh0dXJlXzJkX2FycmF5PGYzMj47XG5cbkBmcmFnbWVudCBmbiBmcyh2c091dDogVlNPdXRwdXQpIC0+IEBsb2NhdGlvbigwKSB2ZWM0ZiB7XG5cdHJldHVybiB0ZXh0dXJlU2FtcGxlKG91clRleHR1cmUsIG91clNhbXBsZXIsIHZzT3V0LnRleGNvb3JkLCB1MzIodnNPdXQubGF5ZXJJbmRleCkpO1xufVxuYDtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsaUJBQWlCO0FBRW5CLE1BQU07QUFBQTtBQUFBLEVBQXNDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxxQkFtQzlCLFVBQVUsaUJBQWlCO0FBQUEscUJBQzNCLFVBQVUsc0JBQXNCO0FBQUEscUJBQ2hDLFVBQVUsWUFBWTtBQUFBO0FBQUE7QUFBQSxxQkFHdEIsVUFBVSxTQUFTLDhFQUE4RSxpQkFBaUIsaUJBQWlCLE1BQU0sYUFBYSxnQkFBZ0I7QUFBQSxxQkFDdEssVUFBVSxLQUFLO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLHFCQW9DZixVQUFVLGNBQWM7QUFBQSxxQkFDeEIsVUFBVSxPQUFPO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBOyIsCiAgIm5hbWVzIjogW10KfQo=
