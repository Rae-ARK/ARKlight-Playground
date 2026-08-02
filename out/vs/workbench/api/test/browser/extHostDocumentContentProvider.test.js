import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ExtHostDocumentsAndEditors } from "../../common/extHostDocumentsAndEditors.js";
import { SingleProxyRPCProtocol } from "../common/testRPCProtocol.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ExtHostDocumentContentProvider } from "../../common/extHostDocumentContentProviders.js";
import { Emitter } from "../../../../base/common/event.js";
import { timeout } from "../../../../base/common/async.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
suite("ExtHostDocumentContentProvider", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const resource = URI.parse("foo:bar");
  let documentContentProvider;
  let mainThreadContentProvider;
  const changes = [];
  setup(() => {
    changes.length = 0;
    mainThreadContentProvider = new class {
      $registerTextContentProvider(handle, scheme) {
      }
      $unregisterTextContentProvider(handle) {
      }
      async $onVirtualDocumentChange(uri, value) {
        await timeout(10);
        changes.push([uri, value]);
      }
      dispose() {
        throw new Error("Method not implemented.");
      }
    }();
    const ehContext = SingleProxyRPCProtocol(mainThreadContentProvider);
    const documentsAndEditors = new ExtHostDocumentsAndEditors(ehContext, new NullLogService());
    documentsAndEditors.$acceptDocumentsAndEditorsDelta({
      addedDocuments: [{
        isDirty: false,
        languageId: "foo",
        uri: resource,
        versionId: 1,
        lines: ["foo"],
        EOL: "\n",
        encoding: "utf8"
      }]
    });
    documentContentProvider = new ExtHostDocumentContentProvider(ehContext, documentsAndEditors, new NullLogService());
  });
  test("TextDocumentContentProvider drops onDidChange events when they happen quickly #179711", async () => {
    await runWithFakedTimers({}, async function() {
      const emitter = new Emitter();
      const contents = ["X", "Y"];
      let counter = 0;
      let stack = 0;
      const d = documentContentProvider.registerTextDocumentContentProvider(resource.scheme, {
        onDidChange: emitter.event,
        async provideTextDocumentContent(_uri) {
          assert.strictEqual(stack, 0);
          stack++;
          try {
            await timeout(0);
            return contents[counter++ % contents.length];
          } finally {
            stack--;
          }
        }
      });
      emitter.fire(resource);
      emitter.fire(resource);
      await timeout(100);
      assert.strictEqual(changes.length, 2);
      assert.strictEqual(changes[0][1], "X");
      assert.strictEqual(changes[1][1], "Y");
      d.dispose();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3REb2N1bWVudENvbnRlbnRQcm92aWRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLmpzJztcbmltcG9ydCB7IFNpbmdsZVByb3h5UlBDUHJvdG9jb2wgfSBmcm9tICcuLi9jb21tb24vdGVzdFJQQ1Byb3RvY29sLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRDb250ZW50UHJvdmlkZXIgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdERvY3VtZW50Q29udGVudFByb3ZpZGVycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZERvY3VtZW50Q29udGVudFByb3ZpZGVyc1NoYXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5cbnN1aXRlKCdFeHRIb3N0RG9jdW1lbnRDb250ZW50UHJvdmlkZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ2ZvbzpiYXInKTtcblx0bGV0IGRvY3VtZW50Q29udGVudFByb3ZpZGVyOiBFeHRIb3N0RG9jdW1lbnRDb250ZW50UHJvdmlkZXI7XG5cdGxldCBtYWluVGhyZWFkQ29udGVudFByb3ZpZGVyOiBNYWluVGhyZWFkRG9jdW1lbnRDb250ZW50UHJvdmlkZXJzU2hhcGU7XG5cdGNvbnN0IGNoYW5nZXM6IFt1cmk6IFVyaUNvbXBvbmVudHMsIHZhbHVlOiBzdHJpbmddW10gPSBbXTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cblx0XHRjaGFuZ2VzLmxlbmd0aCA9IDA7XG5cblx0XHRtYWluVGhyZWFkQ29udGVudFByb3ZpZGVyID0gbmV3IGNsYXNzIGltcGxlbWVudHMgTWFpblRocmVhZERvY3VtZW50Q29udGVudFByb3ZpZGVyc1NoYXBlIHtcblx0XHRcdCRyZWdpc3RlclRleHRDb250ZW50UHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHNjaGVtZTogc3RyaW5nKTogdm9pZCB7XG5cblx0XHRcdH1cblx0XHRcdCR1bnJlZ2lzdGVyVGV4dENvbnRlbnRQcm92aWRlcihoYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXG5cdFx0XHR9XG5cdFx0XHRhc3luYyAkb25WaXJ0dWFsRG9jdW1lbnRDaGFuZ2UodXJpOiBVcmlDb21wb25lbnRzLCB2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdFx0XHRjaGFuZ2VzLnB1c2goW3VyaSwgdmFsdWVdKTtcblx0XHRcdH1cblx0XHRcdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgZWhDb250ZXh0ID0gU2luZ2xlUHJveHlSUENQcm90b2NvbChtYWluVGhyZWFkQ29udGVudFByb3ZpZGVyKTtcblx0XHRjb25zdCBkb2N1bWVudHNBbmRFZGl0b3JzID0gbmV3IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzKGVoQ29udGV4dCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGRvY3VtZW50c0FuZEVkaXRvcnMuJGFjY2VwdERvY3VtZW50c0FuZEVkaXRvcnNEZWx0YSh7XG5cdFx0XHRhZGRlZERvY3VtZW50czogW3tcblx0XHRcdFx0aXNEaXJ0eTogZmFsc2UsXG5cdFx0XHRcdGxhbmd1YWdlSWQ6ICdmb28nLFxuXHRcdFx0XHR1cmk6IHJlc291cmNlLFxuXHRcdFx0XHR2ZXJzaW9uSWQ6IDEsXG5cdFx0XHRcdGxpbmVzOiBbJ2ZvbyddLFxuXHRcdFx0XHRFT0w6ICdcXG4nLFxuXHRcdFx0XHRlbmNvZGluZzogJ3V0ZjgnXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHRcdGRvY3VtZW50Q29udGVudFByb3ZpZGVyID0gbmV3IEV4dEhvc3REb2N1bWVudENvbnRlbnRQcm92aWRlcihlaENvbnRleHQsIGRvY3VtZW50c0FuZEVkaXRvcnMsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0fSk7XG5cblx0dGVzdCgnVGV4dERvY3VtZW50Q29udGVudFByb3ZpZGVyIGRyb3BzIG9uRGlkQ2hhbmdlIGV2ZW50cyB3aGVuIHRoZXkgaGFwcGVuIHF1aWNrbHkgIzE3OTcxMScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPFVSST4oKTtcblx0XHRcdGNvbnN0IGNvbnRlbnRzID0gWydYJywgJ1knXTtcblx0XHRcdGxldCBjb3VudGVyID0gMDtcblxuXHRcdFx0bGV0IHN0YWNrID0gMDtcblxuXHRcdFx0Y29uc3QgZCA9IGRvY3VtZW50Q29udGVudFByb3ZpZGVyLnJlZ2lzdGVyVGV4dERvY3VtZW50Q29udGVudFByb3ZpZGVyKHJlc291cmNlLnNjaGVtZSwge1xuXHRcdFx0XHRvbkRpZENoYW5nZTogZW1pdHRlci5ldmVudCxcblx0XHRcdFx0YXN5bmMgcHJvdmlkZVRleHREb2N1bWVudENvbnRlbnQoX3VyaSkge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGFjaywgMCk7XG5cdFx0XHRcdFx0c3RhY2srKztcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdFx0XHRcdHJldHVybiBjb250ZW50c1tjb3VudGVyKysgJSBjb250ZW50cy5sZW5ndGhdO1xuXHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHRzdGFjay0tO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGVtaXR0ZXIuZmlyZShyZXNvdXJjZSk7XG5cdFx0XHRlbWl0dGVyLmZpcmUocmVzb3VyY2UpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEwMCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VzLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlc1swXVsxXSwgJ1gnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VzWzFdWzFdLCAnWScpO1xuXG5cdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLGVBQWU7QUFFeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsMEJBQTBCO0FBRW5DLE1BQU0sa0NBQWtDLE1BQU07QUFFN0MsMENBQXdDO0FBRXhDLFFBQU0sV0FBVyxJQUFJLE1BQU0sU0FBUztBQUNwQyxNQUFJO0FBQ0osTUFBSTtBQUNKLFFBQU0sVUFBaUQsQ0FBQztBQUV4RCxRQUFNLE1BQU07QUFFWCxZQUFRLFNBQVM7QUFFakIsZ0NBQTRCLElBQUksTUFBeUQ7QUFBQSxNQUN4Riw2QkFBNkIsUUFBZ0IsUUFBc0I7QUFBQSxNQUVuRTtBQUFBLE1BQ0EsK0JBQStCLFFBQXNCO0FBQUEsTUFFckQ7QUFBQSxNQUNBLE1BQU0seUJBQXlCLEtBQW9CLE9BQThCO0FBQ2hGLGNBQU0sUUFBUSxFQUFFO0FBQ2hCLGdCQUFRLEtBQUssQ0FBQyxLQUFLLEtBQUssQ0FBQztBQUFBLE1BQzFCO0FBQUEsTUFDQSxVQUFnQjtBQUNmLGNBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLE1BQzFDO0FBQUEsSUFDRDtBQUVBLFVBQU0sWUFBWSx1QkFBdUIseUJBQXlCO0FBQ2xFLFVBQU0sc0JBQXNCLElBQUksMkJBQTJCLFdBQVcsSUFBSSxlQUFlLENBQUM7QUFDMUYsd0JBQW9CLGdDQUFnQztBQUFBLE1BQ25ELGdCQUFnQixDQUFDO0FBQUEsUUFDaEIsU0FBUztBQUFBLFFBQ1QsWUFBWTtBQUFBLFFBQ1osS0FBSztBQUFBLFFBQ0wsV0FBVztBQUFBLFFBQ1gsT0FBTyxDQUFDLEtBQUs7QUFBQSxRQUNiLEtBQUs7QUFBQSxRQUNMLFVBQVU7QUFBQSxNQUNYLENBQUM7QUFBQSxJQUNGLENBQUM7QUFDRCw4QkFBMEIsSUFBSSwrQkFBK0IsV0FBVyxxQkFBcUIsSUFBSSxlQUFlLENBQUM7QUFBQSxFQUNsSCxDQUFDO0FBRUQsT0FBSyx5RkFBeUYsWUFBWTtBQUN6RyxVQUFNLG1CQUFtQixDQUFDLEdBQUcsaUJBQWtCO0FBRTlDLFlBQU0sVUFBVSxJQUFJLFFBQWE7QUFDakMsWUFBTSxXQUFXLENBQUMsS0FBSyxHQUFHO0FBQzFCLFVBQUksVUFBVTtBQUVkLFVBQUksUUFBUTtBQUVaLFlBQU0sSUFBSSx3QkFBd0Isb0NBQW9DLFNBQVMsUUFBUTtBQUFBLFFBQ3RGLGFBQWEsUUFBUTtBQUFBLFFBQ3JCLE1BQU0sMkJBQTJCLE1BQU07QUFDdEMsaUJBQU8sWUFBWSxPQUFPLENBQUM7QUFDM0I7QUFDQSxjQUFJO0FBQ0gsa0JBQU0sUUFBUSxDQUFDO0FBQ2YsbUJBQU8sU0FBUyxZQUFZLFNBQVMsTUFBTTtBQUFBLFVBQzVDLFVBQUU7QUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsY0FBUSxLQUFLLFFBQVE7QUFDckIsY0FBUSxLQUFLLFFBQVE7QUFFckIsWUFBTSxRQUFRLEdBQUc7QUFFakIsYUFBTyxZQUFZLFFBQVEsUUFBUSxDQUFDO0FBQ3BDLGFBQU8sWUFBWSxRQUFRLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRztBQUNyQyxhQUFPLFlBQVksUUFBUSxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUc7QUFFckMsUUFBRSxRQUFRO0FBQUEsSUFDWCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBR0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
