var RectangleRendererBindingId = /* @__PURE__ */ ((RectangleRendererBindingId2) => {
  RectangleRendererBindingId2[RectangleRendererBindingId2["Shapes"] = 0] = "Shapes";
  RectangleRendererBindingId2[RectangleRendererBindingId2["LayoutInfoUniform"] = 1] = "LayoutInfoUniform";
  RectangleRendererBindingId2[RectangleRendererBindingId2["ScrollOffset"] = 2] = "ScrollOffset";
  return RectangleRendererBindingId2;
})(RectangleRendererBindingId || {});
const rectangleRendererWgsl = (
  /*wgsl*/
  `

struct Vertex {
	@location(0) position: vec2f,
};

struct LayoutInfo {
	canvasDims: vec2f,
	viewportOffset: vec2f,
	viewportDims: vec2f,
}

struct ScrollOffset {
	offset: vec2f,
}

struct Shape {
	position: vec2f,
	size: vec2f,
	color: vec4f,
};

struct VSOutput {
	@builtin(position) position: vec4f,
	@location(1)       color:    vec4f,
};

// Uniforms
@group(0) @binding(${1 /* LayoutInfoUniform */}) var<uniform>       layoutInfo:      LayoutInfo;

// Storage buffers
@group(0) @binding(${0 /* Shapes */})            var<storage, read> shapes:          array<Shape>;
@group(0) @binding(${2 /* ScrollOffset */})      var<uniform>       scrollOffset:    ScrollOffset;

@vertex fn vs(
	vert: Vertex,
	@builtin(instance_index) instanceIndex: u32,
	@builtin(vertex_index) vertexIndex : u32
) -> VSOutput {
	let shape = shapes[instanceIndex];

	var vsOut: VSOutput;
	vsOut.position = vec4f(
		(
			// Top left corner
			vec2f(-1,  1) +
			// Convert pixel position to clipspace
			vec2f( 2, -2) / layoutInfo.canvasDims *
			// Shape position and size
			(layoutInfo.viewportOffset - scrollOffset.offset + shape.position + vert.position * shape.size)
		),
		0.0,
		1.0
	);
	vsOut.color = shape.color;
	return vsOut;
}

@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
	return vsOut.color;
}
`
);
export {
  RectangleRendererBindingId,
  rectangleRendererWgsl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL2dwdS9yZWN0YW5nbGVSZW5kZXJlci53Z3NsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuZXhwb3J0IGNvbnN0IGVudW0gUmVjdGFuZ2xlUmVuZGVyZXJCaW5kaW5nSWQge1xuXHRTaGFwZXMsXG5cdExheW91dEluZm9Vbmlmb3JtLFxuXHRTY3JvbGxPZmZzZXQsXG59XG5cbmV4cG9ydCBjb25zdCByZWN0YW5nbGVSZW5kZXJlcldnc2wgPSAvKndnc2wqLyBgXG5cbnN0cnVjdCBWZXJ0ZXgge1xuXHRAbG9jYXRpb24oMCkgcG9zaXRpb246IHZlYzJmLFxufTtcblxuc3RydWN0IExheW91dEluZm8ge1xuXHRjYW52YXNEaW1zOiB2ZWMyZixcblx0dmlld3BvcnRPZmZzZXQ6IHZlYzJmLFxuXHR2aWV3cG9ydERpbXM6IHZlYzJmLFxufVxuXG5zdHJ1Y3QgU2Nyb2xsT2Zmc2V0IHtcblx0b2Zmc2V0OiB2ZWMyZixcbn1cblxuc3RydWN0IFNoYXBlIHtcblx0cG9zaXRpb246IHZlYzJmLFxuXHRzaXplOiB2ZWMyZixcblx0Y29sb3I6IHZlYzRmLFxufTtcblxuc3RydWN0IFZTT3V0cHV0IHtcblx0QGJ1aWx0aW4ocG9zaXRpb24pIHBvc2l0aW9uOiB2ZWM0Zixcblx0QGxvY2F0aW9uKDEpICAgICAgIGNvbG9yOiAgICB2ZWM0Zixcbn07XG5cbi8vIFVuaWZvcm1zXG5AZ3JvdXAoMCkgQGJpbmRpbmcoJHtSZWN0YW5nbGVSZW5kZXJlckJpbmRpbmdJZC5MYXlvdXRJbmZvVW5pZm9ybX0pIHZhcjx1bmlmb3JtPiAgICAgICBsYXlvdXRJbmZvOiAgICAgIExheW91dEluZm87XG5cbi8vIFN0b3JhZ2UgYnVmZmVyc1xuQGdyb3VwKDApIEBiaW5kaW5nKCR7UmVjdGFuZ2xlUmVuZGVyZXJCaW5kaW5nSWQuU2hhcGVzfSkgICAgICAgICAgICB2YXI8c3RvcmFnZSwgcmVhZD4gc2hhcGVzOiAgICAgICAgICBhcnJheTxTaGFwZT47XG5AZ3JvdXAoMCkgQGJpbmRpbmcoJHtSZWN0YW5nbGVSZW5kZXJlckJpbmRpbmdJZC5TY3JvbGxPZmZzZXR9KSAgICAgIHZhcjx1bmlmb3JtPiAgICAgICBzY3JvbGxPZmZzZXQ6ICAgIFNjcm9sbE9mZnNldDtcblxuQHZlcnRleCBmbiB2cyhcblx0dmVydDogVmVydGV4LFxuXHRAYnVpbHRpbihpbnN0YW5jZV9pbmRleCkgaW5zdGFuY2VJbmRleDogdTMyLFxuXHRAYnVpbHRpbih2ZXJ0ZXhfaW5kZXgpIHZlcnRleEluZGV4IDogdTMyXG4pIC0+IFZTT3V0cHV0IHtcblx0bGV0IHNoYXBlID0gc2hhcGVzW2luc3RhbmNlSW5kZXhdO1xuXG5cdHZhciB2c091dDogVlNPdXRwdXQ7XG5cdHZzT3V0LnBvc2l0aW9uID0gdmVjNGYoXG5cdFx0KFxuXHRcdFx0Ly8gVG9wIGxlZnQgY29ybmVyXG5cdFx0XHR2ZWMyZigtMSwgIDEpICtcblx0XHRcdC8vIENvbnZlcnQgcGl4ZWwgcG9zaXRpb24gdG8gY2xpcHNwYWNlXG5cdFx0XHR2ZWMyZiggMiwgLTIpIC8gbGF5b3V0SW5mby5jYW52YXNEaW1zICpcblx0XHRcdC8vIFNoYXBlIHBvc2l0aW9uIGFuZCBzaXplXG5cdFx0XHQobGF5b3V0SW5mby52aWV3cG9ydE9mZnNldCAtIHNjcm9sbE9mZnNldC5vZmZzZXQgKyBzaGFwZS5wb3NpdGlvbiArIHZlcnQucG9zaXRpb24gKiBzaGFwZS5zaXplKVxuXHRcdCksXG5cdFx0MC4wLFxuXHRcdDEuMFxuXHQpO1xuXHR2c091dC5jb2xvciA9IHNoYXBlLmNvbG9yO1xuXHRyZXR1cm4gdnNPdXQ7XG59XG5cbkBmcmFnbWVudCBmbiBmcyh2c091dDogVlNPdXRwdXQpIC0+IEBsb2NhdGlvbigwKSB2ZWM0ZiB7XG5cdHJldHVybiB2c091dC5jb2xvcjtcbn1cbmA7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLTyxJQUFXLDZCQUFYLGtCQUFXQSxnQ0FBWDtBQUNOLEVBQUFBLHdEQUFBO0FBQ0EsRUFBQUEsd0RBQUE7QUFDQSxFQUFBQSx3REFBQTtBQUhpQixTQUFBQTtBQUFBLEdBQUE7QUFNWCxNQUFNO0FBQUE7QUFBQSxFQUFpQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLHFCQTRCekIseUJBQTRDO0FBQUE7QUFBQTtBQUFBLHFCQUc1QyxjQUFpQztBQUFBLHFCQUNqQyxvQkFBdUM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7IiwKICAibmFtZXMiOiBbIlJlY3RhbmdsZVJlbmRlcmVyQmluZGluZ0lkIl0KfQo=
