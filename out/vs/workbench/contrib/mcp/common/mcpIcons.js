import { getMediaMime } from "../../../../base/common/mime.js";
import { URI } from "../../../../base/common/uri.js";
import { McpServerTransportType } from "./mcpTypes.js";
const mcpAllowableContentTypes = [
  "image/webp",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif"
];
var IconTheme = /* @__PURE__ */ ((IconTheme2) => {
  IconTheme2[IconTheme2["Light"] = 0] = "Light";
  IconTheme2[IconTheme2["Dark"] = 1] = "Dark";
  IconTheme2[IconTheme2["Any"] = 2] = "Any";
  return IconTheme2;
})(IconTheme || {});
function validateIcon(icon, launch, logger) {
  const mimeType = icon.mimeType?.toLowerCase() || getMediaMime(icon.src);
  if (!mimeType || !mcpAllowableContentTypes.includes(mimeType)) {
    logger.debug(`Ignoring icon with unsupported mime type: ${icon.src} (${mimeType}), allowed: ${mcpAllowableContentTypes.join(", ")}`);
    return;
  }
  const uri = URI.parse(icon.src);
  if (uri.scheme === "data") {
    return uri;
  }
  if (uri.scheme === "https" || uri.scheme === "http") {
    if (launch.type !== McpServerTransportType.HTTP) {
      logger.debug(`Ignoring icon with HTTP/HTTPS URL: ${icon.src} as the MCP server is not launched with HTTP transport.`);
      return;
    }
    const expectedAuthority = launch.uri.authority.toLowerCase();
    if (uri.authority.toLowerCase() !== expectedAuthority) {
      logger.debug(`Ignoring icon with untrusted authority: ${icon.src}, expected authority: ${expectedAuthority}`);
      return;
    }
    return uri;
  }
  if (uri.scheme === "file") {
    if (launch.type !== McpServerTransportType.Stdio) {
      logger.debug(`Ignoring icon with file URL: ${icon.src} as the MCP server is not launched as a local process.`);
      return;
    }
    return uri;
  }
  logger.debug(`Ignoring icon with unsupported scheme: ${icon.src}. Allowed: data:, http:, https:, file:`);
  return;
}
function parseAndValidateMcpIcon(icons, launch, logger) {
  const result = [];
  for (const icon of icons.icons || []) {
    const uri = validateIcon(icon, launch, logger);
    if (!uri) {
      continue;
    }
    const sizesArr = typeof icon.sizes === "string" ? icon.sizes.split(" ") : Array.isArray(icon.sizes) ? icon.sizes : [];
    result.push({
      src: uri,
      theme: icon.theme === "light" ? 0 /* Light */ : icon.theme === "dark" ? 1 /* Dark */ : 2 /* Any */,
      sizes: sizesArr.map((size) => {
        const [widthStr, heightStr] = size.toLowerCase().split("x");
        return { width: Number(widthStr) || 0, height: Number(heightStr) || 0 };
      }).sort((a, b) => a.width - b.width)
    });
  }
  result.sort((a, b) => a.sizes[0]?.width - b.sizes[0]?.width);
  return result;
}
class McpIcons {
  constructor(_icons) {
    this._icons = _icons;
  }
  static fromStored(icons) {
    return McpIcons.fromParsed(icons?.map((i) => ({ src: URI.revive(i.src), theme: i.theme, sizes: i.sizes })));
  }
  static fromParsed(icons) {
    return new McpIcons(icons || []);
  }
  getUrl(size) {
    const dark = this.getSizeWithTheme(size, 1 /* Dark */);
    if (dark?.theme === 2 /* Any */) {
      return { dark: dark.src };
    }
    const light = this.getSizeWithTheme(size, 0 /* Light */);
    if (!light && !dark) {
      return void 0;
    }
    return { dark: (dark || light).src, light: light?.src };
  }
  getSizeWithTheme(size, theme) {
    let bestOfAnySize;
    for (const icon of this._icons) {
      if (icon.theme === theme || icon.theme === 2 /* Any */ || icon.theme === void 0) {
        bestOfAnySize = icon;
        const matchingSize = icon.sizes.find((s) => s.width >= size);
        if (matchingSize) {
          return { ...icon, sizes: [matchingSize] };
        }
      }
    }
    return bestOfAnySize;
  }
}
export {
  McpIcons,
  parseAndValidateMcpIcon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwSWNvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBnZXRNZWRpYU1pbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRHRvIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IElNY3BJY29ucywgTWNwU2VydmVyTGF1bmNoLCBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlIH0gZnJvbSAnLi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBNQ1AgfSBmcm9tICcuL21vZGVsQ29udGV4dFByb3RvY29sLmpzJztcblxuY29uc3QgbWNwQWxsb3dhYmxlQ29udGVudFR5cGVzOiByZWFkb25seSBzdHJpbmdbXSA9IFtcblx0J2ltYWdlL3dlYnAnLFxuXHQnaW1hZ2UvcG5nJyxcblx0J2ltYWdlL2pwZWcnLFxuXHQnaW1hZ2UvanBnJyxcblx0J2ltYWdlL2dpZidcbl07XG5cbmNvbnN0IGVudW0gSWNvblRoZW1lIHtcblx0TGlnaHQsXG5cdERhcmssXG5cdEFueSxcbn1cblxuaW50ZXJmYWNlIElJY29uIHtcblx0LyoqIFVSSSB0aGUgaW1hZ2UgY2FuIGJlIGxvYWRlZCBmcm9tICovXG5cdHNyYzogVVJJO1xuXHQvKiogVGhlbWUgZm9yIHRoaXMgaWNvbi4gKi9cblx0dGhlbWU6IEljb25UaGVtZTtcblx0LyoqIFNpemVzIG9mIHRoZSBpY29uIGluIGFzY2VuZGluZyBvcmRlci4gKi9cblx0c2l6ZXM6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfVtdO1xufVxuXG5leHBvcnQgdHlwZSBQYXJzZWRNY3BJY29ucyA9IElJY29uW107XG5leHBvcnQgdHlwZSBTdG9yZWRNY3BJY29ucyA9IER0bzxJSWNvbj5bXTtcblxuXG5mdW5jdGlvbiB2YWxpZGF0ZUljb24oaWNvbjogTUNQLkljb24sIGxhdW5jaDogTWNwU2VydmVyTGF1bmNoLCBsb2dnZXI6IElMb2dnZXIpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRjb25zdCBtaW1lVHlwZSA9IGljb24ubWltZVR5cGU/LnRvTG93ZXJDYXNlKCkgfHwgZ2V0TWVkaWFNaW1lKGljb24uc3JjKTtcblx0aWYgKCFtaW1lVHlwZSB8fCAhbWNwQWxsb3dhYmxlQ29udGVudFR5cGVzLmluY2x1ZGVzKG1pbWVUeXBlKSkge1xuXHRcdGxvZ2dlci5kZWJ1ZyhgSWdub3JpbmcgaWNvbiB3aXRoIHVuc3VwcG9ydGVkIG1pbWUgdHlwZTogJHtpY29uLnNyY30gKCR7bWltZVR5cGV9KSwgYWxsb3dlZDogJHttY3BBbGxvd2FibGVDb250ZW50VHlwZXMuam9pbignLCAnKX1gKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCB1cmkgPSBVUkkucGFyc2UoaWNvbi5zcmMpO1xuXHRpZiAodXJpLnNjaGVtZSA9PT0gJ2RhdGEnKSB7XG5cdFx0cmV0dXJuIHVyaTtcblx0fVxuXG5cdGlmICh1cmkuc2NoZW1lID09PSAnaHR0cHMnIHx8IHVyaS5zY2hlbWUgPT09ICdodHRwJykge1xuXHRcdGlmIChsYXVuY2gudHlwZSAhPT0gTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5IVFRQKSB7XG5cdFx0XHRsb2dnZXIuZGVidWcoYElnbm9yaW5nIGljb24gd2l0aCBIVFRQL0hUVFBTIFVSTDogJHtpY29uLnNyY30gYXMgdGhlIE1DUCBzZXJ2ZXIgaXMgbm90IGxhdW5jaGVkIHdpdGggSFRUUCB0cmFuc3BvcnQuYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhwZWN0ZWRBdXRob3JpdHkgPSBsYXVuY2gudXJpLmF1dGhvcml0eS50b0xvd2VyQ2FzZSgpO1xuXHRcdGlmICh1cmkuYXV0aG9yaXR5LnRvTG93ZXJDYXNlKCkgIT09IGV4cGVjdGVkQXV0aG9yaXR5KSB7XG5cdFx0XHRsb2dnZXIuZGVidWcoYElnbm9yaW5nIGljb24gd2l0aCB1bnRydXN0ZWQgYXV0aG9yaXR5OiAke2ljb24uc3JjfSwgZXhwZWN0ZWQgYXV0aG9yaXR5OiAke2V4cGVjdGVkQXV0aG9yaXR5fWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiB1cmk7XG5cdH1cblxuXHRpZiAodXJpLnNjaGVtZSA9PT0gJ2ZpbGUnKSB7XG5cdFx0aWYgKGxhdW5jaC50eXBlICE9PSBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLlN0ZGlvKSB7XG5cdFx0XHRsb2dnZXIuZGVidWcoYElnbm9yaW5nIGljb24gd2l0aCBmaWxlIFVSTDogJHtpY29uLnNyY30gYXMgdGhlIE1DUCBzZXJ2ZXIgaXMgbm90IGxhdW5jaGVkIGFzIGEgbG9jYWwgcHJvY2Vzcy5gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdXJpO1xuXHR9XG5cblx0bG9nZ2VyLmRlYnVnKGBJZ25vcmluZyBpY29uIHdpdGggdW5zdXBwb3J0ZWQgc2NoZW1lOiAke2ljb24uc3JjfS4gQWxsb3dlZDogZGF0YTosIGh0dHA6LCBodHRwczosIGZpbGU6YCk7XG5cdHJldHVybjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQW5kVmFsaWRhdGVNY3BJY29uKGljb25zOiBNQ1AuSWNvbnMsIGxhdW5jaDogTWNwU2VydmVyTGF1bmNoLCBsb2dnZXI6IElMb2dnZXIpOiBQYXJzZWRNY3BJY29ucyB7XG5cdGNvbnN0IHJlc3VsdDogUGFyc2VkTWNwSWNvbnMgPSBbXTtcblx0Zm9yIChjb25zdCBpY29uIG9mIGljb25zLmljb25zIHx8IFtdKSB7XG5cdFx0Y29uc3QgdXJpID0gdmFsaWRhdGVJY29uKGljb24sIGxhdW5jaCwgbG9nZ2VyKTtcblx0XHRpZiAoIXVyaSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Ly8gY2hlY2sgZm9yIHNpemVzIGFzIHN0cmluZyBmb3IgYmFjay1jb21wYXQgd2l0aCBlYXJseSAyMDI1LTExLTI1IGRyYWZ0c1xuXHRcdGNvbnN0IHNpemVzQXJyID0gdHlwZW9mIGljb24uc2l6ZXMgPT09ICdzdHJpbmcnID8gKGljb24uc2l6ZXMgYXMgc3RyaW5nKS5zcGxpdCgnICcpIDogQXJyYXkuaXNBcnJheShpY29uLnNpemVzKSA/IGljb24uc2l6ZXMgOiBbXTtcblx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRzcmM6IHVyaSxcblx0XHRcdHRoZW1lOiBpY29uLnRoZW1lID09PSAnbGlnaHQnID8gSWNvblRoZW1lLkxpZ2h0IDogaWNvbi50aGVtZSA9PT0gJ2RhcmsnID8gSWNvblRoZW1lLkRhcmsgOiBJY29uVGhlbWUuQW55LFxuXHRcdFx0c2l6ZXM6IHNpemVzQXJyLm1hcChzaXplID0+IHtcblx0XHRcdFx0Y29uc3QgW3dpZHRoU3RyLCBoZWlnaHRTdHJdID0gc2l6ZS50b0xvd2VyQ2FzZSgpLnNwbGl0KCd4Jyk7XG5cdFx0XHRcdHJldHVybiB7IHdpZHRoOiBOdW1iZXIod2lkdGhTdHIpIHx8IDAsIGhlaWdodDogTnVtYmVyKGhlaWdodFN0cikgfHwgMCB9O1xuXHRcdFx0fSkuc29ydCgoYSwgYikgPT4gYS53aWR0aCAtIGIud2lkdGgpXG5cdFx0fSk7XG5cdH1cblxuXHRyZXN1bHQuc29ydCgoYSwgYikgPT4gYS5zaXplc1swXT8ud2lkdGggLSBiLnNpemVzWzBdPy53aWR0aCk7XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGNsYXNzIE1jcEljb25zIGltcGxlbWVudHMgSU1jcEljb25zIHtcblx0cHVibGljIHN0YXRpYyBmcm9tU3RvcmVkKGljb25zOiBTdG9yZWRNY3BJY29ucyB8IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBNY3BJY29ucy5mcm9tUGFyc2VkKGljb25zPy5tYXAoaSA9PiAoeyBzcmM6IFVSSS5yZXZpdmUoaS5zcmMpLCB0aGVtZTogaS50aGVtZSwgc2l6ZXM6IGkuc2l6ZXMgfSkpKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZnJvbVBhcnNlZChpY29uczogUGFyc2VkTWNwSWNvbnMgfCB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gbmV3IE1jcEljb25zKGljb25zIHx8IFtdKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9pY29uczogSUljb25bXSkgeyB9XG5cblx0Z2V0VXJsKHNpemU6IG51bWJlcik6IHsgZGFyazogVVJJOyBsaWdodD86IFVSSSB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBkYXJrID0gdGhpcy5nZXRTaXplV2l0aFRoZW1lKHNpemUsIEljb25UaGVtZS5EYXJrKTtcblx0XHRpZiAoZGFyaz8udGhlbWUgPT09IEljb25UaGVtZS5BbnkpIHtcblx0XHRcdHJldHVybiB7IGRhcms6IGRhcmsuc3JjIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGlnaHQgPSB0aGlzLmdldFNpemVXaXRoVGhlbWUoc2l6ZSwgSWNvblRoZW1lLkxpZ2h0KTtcblx0XHRpZiAoIWxpZ2h0ICYmICFkYXJrKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGRhcms6IChkYXJrIHx8IGxpZ2h0KSEuc3JjLCBsaWdodDogbGlnaHQ/LnNyYyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTaXplV2l0aFRoZW1lKHNpemU6IG51bWJlciwgdGhlbWU6IEljb25UaGVtZSk6IElJY29uIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgYmVzdE9mQW55U2l6ZTogSUljb24gfCB1bmRlZmluZWQ7XG5cblx0XHRmb3IgKGNvbnN0IGljb24gb2YgdGhpcy5faWNvbnMpIHtcblx0XHRcdGlmIChpY29uLnRoZW1lID09PSB0aGVtZSB8fCBpY29uLnRoZW1lID09PSBJY29uVGhlbWUuQW55IHx8IGljb24udGhlbWUgPT09IHVuZGVmaW5lZCkgeyAvLyB1bmRlZmluZWQgY2hlY2sgZm9yIGJhY2sgY29tcGF0XG5cdFx0XHRcdGJlc3RPZkFueVNpemUgPSBpY29uO1xuXG5cdFx0XHRcdGNvbnN0IG1hdGNoaW5nU2l6ZSA9IGljb24uc2l6ZXMuZmluZChzID0+IHMud2lkdGggPj0gc2l6ZSk7XG5cdFx0XHRcdGlmIChtYXRjaGluZ1NpemUpIHtcblx0XHRcdFx0XHRyZXR1cm4geyAuLi5pY29uLCBzaXplczogW21hdGNoaW5nU2l6ZV0gfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gYmVzdE9mQW55U2l6ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxXQUFXO0FBR3BCLFNBQXFDLDhCQUE4QjtBQUduRSxNQUFNLDJCQUE4QztBQUFBLEVBQ25EO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUNE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
