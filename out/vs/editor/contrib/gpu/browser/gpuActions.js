import { getActiveWindow } from "../../../../base/browser/dom.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { URI } from "../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { EditorAction, registerEditorAction } from "../../../browser/editorExtensions.js";
import { ensureNonNullable } from "../../../browser/gpu/gpuUtils.js";
import { GlyphRasterizer } from "../../../browser/gpu/raster/glyphRasterizer.js";
import { ViewGpuContext } from "../../../browser/gpu/viewGpuContext.js";
class DebugEditorGpuRendererAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.debugEditorGpuRenderer",
      label: localize2("gpuDebug.label", "Developer: Debug Editor GPU Renderer"),
      // TODO: Why doesn't `ContextKeyExpr.equals('config:editor.experimentalGpuAcceleration', 'on')` work?
      precondition: ContextKeyExpr.true()
    });
  }
  async run(accessor, editor) {
    const instantiationService = accessor.get(IInstantiationService);
    const quickInputService = accessor.get(IQuickInputService);
    const choice = await quickInputService.pick([
      {
        label: localize("logTextureAtlasStats.label", "Log Texture Atlas Stats"),
        id: "logTextureAtlasStats"
      },
      {
        label: localize("saveTextureAtlas.label", "Save Texture Atlas"),
        id: "saveTextureAtlas"
      },
      {
        label: localize("drawGlyph.label", "Draw Glyph"),
        id: "drawGlyph"
      }
    ], { canPickMany: false });
    if (!choice) {
      return;
    }
    switch (choice.id) {
      case "logTextureAtlasStats":
        instantiationService.invokeFunction((accessor2) => {
          const logService = accessor2.get(ILogService);
          const atlas = ViewGpuContext.atlas;
          if (!ViewGpuContext.atlas) {
            logService.error("No texture atlas found");
            return;
          }
          const stats = atlas.getStats();
          logService.info(["Texture atlas stats", ...stats].join("\n\n"));
        });
        break;
      case "saveTextureAtlas":
        instantiationService.invokeFunction(async (accessor2) => {
          const workspaceContextService = accessor2.get(IWorkspaceContextService);
          const fileService = accessor2.get(IFileService);
          const folders = workspaceContextService.getWorkspace().folders;
          if (folders.length > 0) {
            const atlas = ViewGpuContext.atlas;
            const promises = [];
            for (const [layerIndex, page] of atlas.pages.entries()) {
              promises.push(...[
                fileService.writeFile(
                  URI.joinPath(folders[0].uri, `textureAtlasPage${layerIndex}_actual.png`),
                  VSBuffer.wrap(new Uint8Array(await (await page.source.convertToBlob()).arrayBuffer()))
                ),
                fileService.writeFile(
                  URI.joinPath(folders[0].uri, `textureAtlasPage${layerIndex}_usage.png`),
                  VSBuffer.wrap(new Uint8Array(await (await page.getUsagePreview()).arrayBuffer()))
                )
              ]);
            }
            await Promise.all(promises);
          }
        });
        break;
      case "drawGlyph":
        instantiationService.invokeFunction(async (accessor2) => {
          const configurationService = accessor2.get(IConfigurationService);
          const fileService = accessor2.get(IFileService);
          const quickInputService2 = accessor2.get(IQuickInputService);
          const workspaceContextService = accessor2.get(IWorkspaceContextService);
          const folders = workspaceContextService.getWorkspace().folders;
          if (folders.length === 0) {
            return;
          }
          const atlas = ViewGpuContext.atlas;
          const fontFamily = configurationService.getValue("editor.fontFamily");
          const fontSize = configurationService.getValue("editor.fontSize");
          const rasterizer = new GlyphRasterizer(fontSize, fontFamily, getActiveWindow().devicePixelRatio, ViewGpuContext.decorationStyleCache);
          let chars = await quickInputService2.input({
            prompt: "Enter a character to draw (prefix with 0x for code point))"
          });
          if (!chars) {
            return;
          }
          const codePoint = chars.match(/0x(?<codePoint>[0-9a-f]+)/i)?.groups?.codePoint;
          if (codePoint !== void 0) {
            chars = String.fromCodePoint(parseInt(codePoint, 16));
          }
          const tokenMetadata = 0;
          const charMetadata = 0;
          const rasterizedGlyph = atlas.getGlyph(rasterizer, chars, tokenMetadata, charMetadata, 0);
          if (!rasterizedGlyph) {
            return;
          }
          const imageData = atlas.pages[rasterizedGlyph.pageIndex].source.getContext("2d")?.getImageData(
            rasterizedGlyph.x,
            rasterizedGlyph.y,
            rasterizedGlyph.w,
            rasterizedGlyph.h
          );
          if (!imageData) {
            return;
          }
          const canvas = new OffscreenCanvas(imageData.width, imageData.height);
          const ctx = ensureNonNullable(canvas.getContext("2d"));
          ctx.putImageData(imageData, 0, 0);
          const blob = await canvas.convertToBlob({ type: "image/png" });
          const resource = URI.joinPath(folders[0].uri, `glyph_${chars}_${tokenMetadata}_${fontSize}px_${fontFamily.replaceAll(/[,\\\/\.'\s]/g, "_")}.png`);
          await fileService.writeFile(resource, VSBuffer.wrap(new Uint8Array(await blob.arrayBuffer())));
        });
        break;
    }
  }
}
registerEditorAction(DebugEditorGpuRendererAction);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2dwdS9icm93c2VyL2dwdUFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBnZXRBY3RpdmVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbiwgcmVnaXN0ZXJFZGl0b3JBY3Rpb24sIHR5cGUgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb25OdWxsYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZ3B1L2dwdVV0aWxzLmpzJztcbmltcG9ydCB7IEdseXBoUmFzdGVyaXplciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZ3B1L3Jhc3Rlci9nbHlwaFJhc3Rlcml6ZXIuanMnO1xuaW1wb3J0IHsgVmlld0dwdUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2dwdS92aWV3R3B1Q29udGV4dC5qcyc7XG5cbmNsYXNzIERlYnVnRWRpdG9yR3B1UmVuZGVyZXJBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5kZWJ1Z0VkaXRvckdwdVJlbmRlcmVyJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZTIoJ2dwdURlYnVnLmxhYmVsJywgXCJEZXZlbG9wZXI6IERlYnVnIEVkaXRvciBHUFUgUmVuZGVyZXJcIiksXG5cdFx0XHQvLyBUT0RPOiBXaHkgZG9lc24ndCBgQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWc6ZWRpdG9yLmV4cGVyaW1lbnRhbEdwdUFjY2VsZXJhdGlvbicsICdvbicpYCB3b3JrP1xuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci50cnVlKCksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgY2hvaWNlID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhbXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbG9nVGV4dHVyZUF0bGFzU3RhdHMubGFiZWwnLCBcIkxvZyBUZXh0dXJlIEF0bGFzIFN0YXRzXCIpLFxuXHRcdFx0XHRpZDogJ2xvZ1RleHR1cmVBdGxhc1N0YXRzJyxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2F2ZVRleHR1cmVBdGxhcy5sYWJlbCcsIFwiU2F2ZSBUZXh0dXJlIEF0bGFzXCIpLFxuXHRcdFx0XHRpZDogJ3NhdmVUZXh0dXJlQXRsYXMnLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdkcmF3R2x5cGgubGFiZWwnLCBcIkRyYXcgR2x5cGhcIiksXG5cdFx0XHRcdGlkOiAnZHJhd0dseXBoJyxcblx0XHRcdH0sXG5cdFx0XSwgeyBjYW5QaWNrTWFueTogZmFsc2UgfSk7XG5cdFx0aWYgKCFjaG9pY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0c3dpdGNoIChjaG9pY2UuaWQpIHtcblx0XHRcdGNhc2UgJ2xvZ1RleHR1cmVBdGxhc1N0YXRzJzpcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXG5cdFx0XHRcdFx0Y29uc3QgYXRsYXMgPSBWaWV3R3B1Q29udGV4dC5hdGxhcztcblx0XHRcdFx0XHRpZiAoIVZpZXdHcHVDb250ZXh0LmF0bGFzKSB7XG5cdFx0XHRcdFx0XHRsb2dTZXJ2aWNlLmVycm9yKCdObyB0ZXh0dXJlIGF0bGFzIGZvdW5kJyk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3Qgc3RhdHMgPSBhdGxhcy5nZXRTdGF0cygpO1xuXHRcdFx0XHRcdGxvZ1NlcnZpY2UuaW5mbyhbJ1RleHR1cmUgYXRsYXMgc3RhdHMnLCAuLi5zdGF0c10uam9pbignXFxuXFxuJykpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdzYXZlVGV4dHVyZUF0bGFzJzpcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYXN5bmMgYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCBmb2xkZXJzID0gd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRcdFx0XHRpZiAoZm9sZGVycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBhdGxhcyA9IFZpZXdHcHVDb250ZXh0LmF0bGFzO1xuXHRcdFx0XHRcdFx0Y29uc3QgcHJvbWlzZXMgPSBbXTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgW2xheWVySW5kZXgsIHBhZ2VdIG9mIGF0bGFzLnBhZ2VzLmVudHJpZXMoKSkge1xuXHRcdFx0XHRcdFx0XHRwcm9taXNlcy5wdXNoKC4uLltcblx0XHRcdFx0XHRcdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUoXG5cdFx0XHRcdFx0XHRcdFx0XHRVUkkuam9pblBhdGgoZm9sZGVyc1swXS51cmksIGB0ZXh0dXJlQXRsYXNQYWdlJHtsYXllckluZGV4fV9hY3R1YWwucG5nYCksXG5cdFx0XHRcdFx0XHRcdFx0XHRWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KGF3YWl0IChhd2FpdCBwYWdlLnNvdXJjZS5jb252ZXJ0VG9CbG9iKCkpLmFycmF5QnVmZmVyKCkpKVxuXHRcdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRcdFx0ZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFxuXHRcdFx0XHRcdFx0XHRcdFx0VVJJLmpvaW5QYXRoKGZvbGRlcnNbMF0udXJpLCBgdGV4dHVyZUF0bGFzUGFnZSR7bGF5ZXJJbmRleH1fdXNhZ2UucG5nYCksXG5cdFx0XHRcdFx0XHRcdFx0XHRWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KGF3YWl0IChhd2FpdCBwYWdlLmdldFVzYWdlUHJldmlldygpKS5hcnJheUJ1ZmZlcigpKSlcblx0XHRcdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2RyYXdHbHlwaCc6XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFzeW5jIGFjY2Vzc29yID0+IHtcblx0XHRcdFx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXG5cdFx0XHRcdFx0Y29uc3QgZm9sZGVycyA9IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0XHRcdFx0aWYgKGZvbGRlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgYXRsYXMgPSBWaWV3R3B1Q29udGV4dC5hdGxhcztcblx0XHRcdFx0XHRjb25zdCBmb250RmFtaWx5ID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignZWRpdG9yLmZvbnRGYW1pbHknKTtcblx0XHRcdFx0XHRjb25zdCBmb250U2l6ZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ2VkaXRvci5mb250U2l6ZScpO1xuXHRcdFx0XHRcdGNvbnN0IHJhc3Rlcml6ZXIgPSBuZXcgR2x5cGhSYXN0ZXJpemVyKGZvbnRTaXplLCBmb250RmFtaWx5LCBnZXRBY3RpdmVXaW5kb3coKS5kZXZpY2VQaXhlbFJhdGlvLCBWaWV3R3B1Q29udGV4dC5kZWNvcmF0aW9uU3R5bGVDYWNoZSk7XG5cdFx0XHRcdFx0bGV0IGNoYXJzID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0XHRcdFx0cHJvbXB0OiAnRW50ZXIgYSBjaGFyYWN0ZXIgdG8gZHJhdyAocHJlZml4IHdpdGggMHggZm9yIGNvZGUgcG9pbnQpKSdcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRpZiAoIWNoYXJzKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGNvZGVQb2ludCA9IGNoYXJzLm1hdGNoKC8weCg/PGNvZGVQb2ludD5bMC05YS1mXSspL2kpPy5ncm91cHM/LmNvZGVQb2ludDtcblx0XHRcdFx0XHRpZiAoY29kZVBvaW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGNoYXJzID0gU3RyaW5nLmZyb21Db2RlUG9pbnQocGFyc2VJbnQoY29kZVBvaW50LCAxNikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCB0b2tlbk1ldGFkYXRhID0gMDtcblx0XHRcdFx0XHRjb25zdCBjaGFyTWV0YWRhdGEgPSAwO1xuXHRcdFx0XHRcdGNvbnN0IHJhc3Rlcml6ZWRHbHlwaCA9IGF0bGFzLmdldEdseXBoKHJhc3Rlcml6ZXIsIGNoYXJzLCB0b2tlbk1ldGFkYXRhLCBjaGFyTWV0YWRhdGEsIDApO1xuXHRcdFx0XHRcdGlmICghcmFzdGVyaXplZEdseXBoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGltYWdlRGF0YSA9IGF0bGFzLnBhZ2VzW3Jhc3Rlcml6ZWRHbHlwaC5wYWdlSW5kZXhdLnNvdXJjZS5nZXRDb250ZXh0KCcyZCcpPy5nZXRJbWFnZURhdGEoXG5cdFx0XHRcdFx0XHRyYXN0ZXJpemVkR2x5cGgueCxcblx0XHRcdFx0XHRcdHJhc3Rlcml6ZWRHbHlwaC55LFxuXHRcdFx0XHRcdFx0cmFzdGVyaXplZEdseXBoLncsXG5cdFx0XHRcdFx0XHRyYXN0ZXJpemVkR2x5cGguaFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0aWYgKCFpbWFnZURhdGEpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgY2FudmFzID0gbmV3IE9mZnNjcmVlbkNhbnZhcyhpbWFnZURhdGEud2lkdGgsIGltYWdlRGF0YS5oZWlnaHQpO1xuXHRcdFx0XHRcdGNvbnN0IGN0eCA9IGVuc3VyZU5vbk51bGxhYmxlKGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpKTtcblx0XHRcdFx0XHRjdHgucHV0SW1hZ2VEYXRhKGltYWdlRGF0YSwgMCwgMCk7XG5cdFx0XHRcdFx0Y29uc3QgYmxvYiA9IGF3YWl0IGNhbnZhcy5jb252ZXJ0VG9CbG9iKHsgdHlwZTogJ2ltYWdlL3BuZycgfSk7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuam9pblBhdGgoZm9sZGVyc1swXS51cmksIGBnbHlwaF8ke2NoYXJzfV8ke3Rva2VuTWV0YWRhdGF9XyR7Zm9udFNpemV9cHhfJHtmb250RmFtaWx5LnJlcGxhY2VBbGwoL1ssXFxcXFxcL1xcLidcXHNdL2csICdfJyl9LnBuZ2ApO1xuXHRcdFx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShhd2FpdCBibG9iLmFycmF5QnVmZmVyKCkpKSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJFZGl0b3JBY3Rpb24oRGVidWdFZGl0b3JHcHVSZW5kZXJlckFjdGlvbik7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtB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LGdCQUFnQjtBQUFBLFVBQ2pCO0FBQ0EsY0FBSSxDQUFDLFdBQVc7QUFDZjtBQUFBLFVBQ0Q7QUFDQSxnQkFBTSxTQUFTLElBQUksZ0JBQWdCLFVBQVUsT0FBTyxVQUFVLE1BQU07QUFDcEUsZ0JBQU0sTUFBTSxrQkFBa0IsT0FBTyxXQUFXLElBQUksQ0FBQztBQUNyRCxjQUFJLGFBQWEsV0FBVyxHQUFHLENBQUM7QUFDaEMsZ0JBQU0sT0FBTyxNQUFNLE9BQU8sY0FBYyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzdELGdCQUFNLFdBQVcsSUFBSSxTQUFTLFFBQVEsQ0FBQyxFQUFFLEtBQUssU0FBUyxLQUFLLElBQUksYUFBYSxJQUFJLFFBQVEsTUFBTSxXQUFXLFdBQVcsaUJBQWlCLEdBQUcsQ0FBQyxNQUFNO0FBQ2hKLGdCQUFNLFlBQVksVUFBVSxVQUFVLFNBQVMsS0FBSyxJQUFJLFdBQVcsTUFBTSxLQUFLLFlBQVksQ0FBQyxDQUFDLENBQUM7QUFBQSxRQUM5RixDQUFDO0FBQ0Q7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUNEO0FBRUEscUJBQXFCLDRCQUE0QjsiLAogICJuYW1lcyI6IFsiYWNjZXNzb3IiLCAicXVpY2tJbnB1dFNlcnZpY2UiXQp9Cg==
