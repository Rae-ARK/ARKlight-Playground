import assert from "assert";
import { encodeHex, VSBuffer } from "../../../../base/common/buffer.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { URI } from "../../../../base/common/uri.js";
import { FileEditKind } from "../../common/state/sessionState.js";
import { normalizeFileEdit } from "../../common/fileEditDiff.js";
suite("fileEditDiff", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const fileA = URI.file("/repo/a.ts").toString();
  const fileB = URI.file("/repo/b.ts").toString();
  const beforeContent = "git-blob://before";
  const afterContent = "git-blob://after";
  test("normalizes added, modified, deleted, and renamed edits", () => {
    const created = { after: { uri: fileA, content: { uri: afterContent } } };
    const modified = { before: { uri: fileA, content: { uri: beforeContent } }, after: { uri: fileA, content: { uri: afterContent } } };
    const deleted = { before: { uri: fileA, content: { uri: beforeContent } } };
    const renamed = { before: { uri: fileA, content: { uri: beforeContent } }, after: { uri: fileB, content: { uri: afterContent } } };
    const summarize = (edit) => {
      const n = normalizeFileEdit(edit);
      return n && {
        kind: n.kind,
        resource: n.resource.toString(),
        beforeUri: n.beforeUri?.toString(),
        afterUri: n.afterUri?.toString(),
        beforeContentUri: n.beforeContentUri?.toString(),
        afterContentUri: n.afterContentUri?.toString()
      };
    };
    assert.deepStrictEqual(
      [created, modified, deleted, renamed].map(summarize),
      [
        { kind: FileEditKind.Create, resource: fileA, beforeUri: void 0, afterUri: fileA, beforeContentUri: void 0, afterContentUri: afterContent },
        { kind: FileEditKind.Edit, resource: fileA, beforeUri: fileA, afterUri: fileA, beforeContentUri: beforeContent, afterContentUri: afterContent },
        { kind: FileEditKind.Delete, resource: fileA, beforeUri: fileA, afterUri: void 0, beforeContentUri: beforeContent, afterContentUri: void 0 },
        { kind: FileEditKind.Rename, resource: fileB, beforeUri: fileA, afterUri: fileB, beforeContentUri: beforeContent, afterContentUri: afterContent }
      ]
    );
  });
  test("returns undefined when no usable URI is present", () => {
    assert.strictEqual(normalizeFileEdit({}), void 0);
  });
  test("canonicalizes legacy session-db content URIs so their path is the edited file", () => {
    const hex = (value) => encodeHex(VSBuffer.fromString(value)).toString();
    const legacy = (part) => URI.from({
      scheme: "session-db",
      authority: hex("copilot:/s1"),
      path: `/call_1/${hex("/repo/a.ts")}/${part}/a.ts`
    }).toString();
    const normalized = normalizeFileEdit({
      before: { uri: fileA, content: { uri: legacy("before") } },
      after: { uri: fileA, content: { uri: legacy("after") } }
    });
    assert.deepStrictEqual(
      [normalized?.beforeContentUri?.path, normalized?.afterContentUri?.path],
      ["/repo/a.ts", "/repo/a.ts"]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L2NvbW1vbi9maWxlRWRpdERpZmYudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuY29kZUhleCwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHR5cGUgeyBGaWxlRWRpdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBGaWxlRWRpdEtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IG5vcm1hbGl6ZUZpbGVFZGl0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVFZGl0RGlmZi5qcyc7XG5cbnN1aXRlKCdmaWxlRWRpdERpZmYnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgZmlsZUEgPSBVUkkuZmlsZSgnL3JlcG8vYS50cycpLnRvU3RyaW5nKCk7XG5cdGNvbnN0IGZpbGVCID0gVVJJLmZpbGUoJy9yZXBvL2IudHMnKS50b1N0cmluZygpO1xuXHRjb25zdCBiZWZvcmVDb250ZW50ID0gJ2dpdC1ibG9iOi8vYmVmb3JlJztcblx0Y29uc3QgYWZ0ZXJDb250ZW50ID0gJ2dpdC1ibG9iOi8vYWZ0ZXInO1xuXG5cdHRlc3QoJ25vcm1hbGl6ZXMgYWRkZWQsIG1vZGlmaWVkLCBkZWxldGVkLCBhbmQgcmVuYW1lZCBlZGl0cycsICgpID0+IHtcblx0XHRjb25zdCBjcmVhdGVkOiBGaWxlRWRpdCA9IHsgYWZ0ZXI6IHsgdXJpOiBmaWxlQSwgY29udGVudDogeyB1cmk6IGFmdGVyQ29udGVudCB9IH0gfTtcblx0XHRjb25zdCBtb2RpZmllZDogRmlsZUVkaXQgPSB7IGJlZm9yZTogeyB1cmk6IGZpbGVBLCBjb250ZW50OiB7IHVyaTogYmVmb3JlQ29udGVudCB9IH0sIGFmdGVyOiB7IHVyaTogZmlsZUEsIGNvbnRlbnQ6IHsgdXJpOiBhZnRlckNvbnRlbnQgfSB9IH07XG5cdFx0Y29uc3QgZGVsZXRlZDogRmlsZUVkaXQgPSB7IGJlZm9yZTogeyB1cmk6IGZpbGVBLCBjb250ZW50OiB7IHVyaTogYmVmb3JlQ29udGVudCB9IH0gfTtcblx0XHRjb25zdCByZW5hbWVkOiBGaWxlRWRpdCA9IHsgYmVmb3JlOiB7IHVyaTogZmlsZUEsIGNvbnRlbnQ6IHsgdXJpOiBiZWZvcmVDb250ZW50IH0gfSwgYWZ0ZXI6IHsgdXJpOiBmaWxlQiwgY29udGVudDogeyB1cmk6IGFmdGVyQ29udGVudCB9IH0gfTtcblxuXHRcdGNvbnN0IHN1bW1hcml6ZSA9IChlZGl0OiBGaWxlRWRpdCkgPT4ge1xuXHRcdFx0Y29uc3QgbiA9IG5vcm1hbGl6ZUZpbGVFZGl0KGVkaXQpO1xuXHRcdFx0cmV0dXJuIG4gJiYge1xuXHRcdFx0XHRraW5kOiBuLmtpbmQsXG5cdFx0XHRcdHJlc291cmNlOiBuLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGJlZm9yZVVyaTogbi5iZWZvcmVVcmk/LnRvU3RyaW5nKCksXG5cdFx0XHRcdGFmdGVyVXJpOiBuLmFmdGVyVXJpPy50b1N0cmluZygpLFxuXHRcdFx0XHRiZWZvcmVDb250ZW50VXJpOiBuLmJlZm9yZUNvbnRlbnRVcmk/LnRvU3RyaW5nKCksXG5cdFx0XHRcdGFmdGVyQ29udGVudFVyaTogbi5hZnRlckNvbnRlbnRVcmk/LnRvU3RyaW5nKCksXG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W2NyZWF0ZWQsIG1vZGlmaWVkLCBkZWxldGVkLCByZW5hbWVkXS5tYXAoc3VtbWFyaXplKSxcblx0XHRcdFtcblx0XHRcdFx0eyBraW5kOiBGaWxlRWRpdEtpbmQuQ3JlYXRlLCByZXNvdXJjZTogZmlsZUEsIGJlZm9yZVVyaTogdW5kZWZpbmVkLCBhZnRlclVyaTogZmlsZUEsIGJlZm9yZUNvbnRlbnRVcmk6IHVuZGVmaW5lZCwgYWZ0ZXJDb250ZW50VXJpOiBhZnRlckNvbnRlbnQgfSxcblx0XHRcdFx0eyBraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCwgcmVzb3VyY2U6IGZpbGVBLCBiZWZvcmVVcmk6IGZpbGVBLCBhZnRlclVyaTogZmlsZUEsIGJlZm9yZUNvbnRlbnRVcmk6IGJlZm9yZUNvbnRlbnQsIGFmdGVyQ29udGVudFVyaTogYWZ0ZXJDb250ZW50IH0sXG5cdFx0XHRcdHsga2luZDogRmlsZUVkaXRLaW5kLkRlbGV0ZSwgcmVzb3VyY2U6IGZpbGVBLCBiZWZvcmVVcmk6IGZpbGVBLCBhZnRlclVyaTogdW5kZWZpbmVkLCBiZWZvcmVDb250ZW50VXJpOiBiZWZvcmVDb250ZW50LCBhZnRlckNvbnRlbnRVcmk6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IGtpbmQ6IEZpbGVFZGl0S2luZC5SZW5hbWUsIHJlc291cmNlOiBmaWxlQiwgYmVmb3JlVXJpOiBmaWxlQSwgYWZ0ZXJVcmk6IGZpbGVCLCBiZWZvcmVDb250ZW50VXJpOiBiZWZvcmVDb250ZW50LCBhZnRlckNvbnRlbnRVcmk6IGFmdGVyQ29udGVudCB9LFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbm8gdXNhYmxlIFVSSSBpcyBwcmVzZW50JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3JtYWxpemVGaWxlRWRpdCh7fSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nhbm9uaWNhbGl6ZXMgbGVnYWN5IHNlc3Npb24tZGIgY29udGVudCBVUklzIHNvIHRoZWlyIHBhdGggaXMgdGhlIGVkaXRlZCBmaWxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhleCA9ICh2YWx1ZTogc3RyaW5nKSA9PiBlbmNvZGVIZXgoVlNCdWZmZXIuZnJvbVN0cmluZyh2YWx1ZSkpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgbGVnYWN5ID0gKHBhcnQ6IHN0cmluZykgPT4gVVJJLmZyb20oe1xuXHRcdFx0c2NoZW1lOiAnc2Vzc2lvbi1kYicsXG5cdFx0XHRhdXRob3JpdHk6IGhleCgnY29waWxvdDovczEnKSxcblx0XHRcdHBhdGg6IGAvY2FsbF8xLyR7aGV4KCcvcmVwby9hLnRzJyl9LyR7cGFydH0vYS50c2AsXG5cdFx0fSkudG9TdHJpbmcoKTtcblxuXHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVGaWxlRWRpdCh7XG5cdFx0XHRiZWZvcmU6IHsgdXJpOiBmaWxlQSwgY29udGVudDogeyB1cmk6IGxlZ2FjeSgnYmVmb3JlJykgfSB9LFxuXHRcdFx0YWZ0ZXI6IHsgdXJpOiBmaWxlQSwgY29udGVudDogeyB1cmk6IGxlZ2FjeSgnYWZ0ZXInKSB9IH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W25vcm1hbGl6ZWQ/LmJlZm9yZUNvbnRlbnRVcmk/LnBhdGgsIG5vcm1hbGl6ZWQ/LmFmdGVyQ29udGVudFVyaT8ucGF0aF0sXG5cdFx0XHRbJy9yZXBvL2EudHMnLCAnL3JlcG8vYS50cyddLFxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXLGdCQUFnQjtBQUNwQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLFdBQVc7QUFFcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBeUI7QUFFbEMsTUFBTSxnQkFBZ0IsTUFBTTtBQUUzQiwwQ0FBd0M7QUFFeEMsUUFBTSxRQUFRLElBQUksS0FBSyxZQUFZLEVBQUUsU0FBUztBQUM5QyxRQUFNLFFBQVEsSUFBSSxLQUFLLFlBQVksRUFBRSxTQUFTO0FBQzlDLFFBQU0sZ0JBQWdCO0FBQ3RCLFFBQU0sZUFBZTtBQUVyQixPQUFLLDBEQUEwRCxNQUFNO0FBQ3BFLFVBQU0sVUFBb0IsRUFBRSxPQUFPLEVBQUUsS0FBSyxPQUFPLFNBQVMsRUFBRSxLQUFLLGFBQWEsRUFBRSxFQUFFO0FBQ2xGLFVBQU0sV0FBcUIsRUFBRSxRQUFRLEVBQUUsS0FBSyxPQUFPLFNBQVMsRUFBRSxLQUFLLGNBQWMsRUFBRSxHQUFHLE9BQU8sRUFBRSxLQUFLLE9BQU8sU0FBUyxFQUFFLEtBQUssYUFBYSxFQUFFLEVBQUU7QUFDNUksVUFBTSxVQUFvQixFQUFFLFFBQVEsRUFBRSxLQUFLLE9BQU8sU0FBUyxFQUFFLEtBQUssY0FBYyxFQUFFLEVBQUU7QUFDcEYsVUFBTSxVQUFvQixFQUFFLFFBQVEsRUFBRSxLQUFLLE9BQU8sU0FBUyxFQUFFLEtBQUssY0FBYyxFQUFFLEdBQUcsT0FBTyxFQUFFLEtBQUssT0FBTyxTQUFTLEVBQUUsS0FBSyxhQUFhLEVBQUUsRUFBRTtBQUUzSSxVQUFNLFlBQVksQ0FBQyxTQUFtQjtBQUNyQyxZQUFNLElBQUksa0JBQWtCLElBQUk7QUFDaEMsYUFBTyxLQUFLO0FBQUEsUUFDWCxNQUFNLEVBQUU7QUFBQSxRQUNSLFVBQVUsRUFBRSxTQUFTLFNBQVM7QUFBQSxRQUM5QixXQUFXLEVBQUUsV0FBVyxTQUFTO0FBQUEsUUFDakMsVUFBVSxFQUFFLFVBQVUsU0FBUztBQUFBLFFBQy9CLGtCQUFrQixFQUFFLGtCQUFrQixTQUFTO0FBQUEsUUFDL0MsaUJBQWlCLEVBQUUsaUJBQWlCLFNBQVM7QUFBQSxNQUM5QztBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsVUFBVSxTQUFTLE9BQU8sRUFBRSxJQUFJLFNBQVM7QUFBQSxNQUNuRDtBQUFBLFFBQ0MsRUFBRSxNQUFNLGFBQWEsUUFBUSxVQUFVLE9BQU8sV0FBVyxRQUFXLFVBQVUsT0FBTyxrQkFBa0IsUUFBVyxpQkFBaUIsYUFBYTtBQUFBLFFBQ2hKLEVBQUUsTUFBTSxhQUFhLE1BQU0sVUFBVSxPQUFPLFdBQVcsT0FBTyxVQUFVLE9BQU8sa0JBQWtCLGVBQWUsaUJBQWlCLGFBQWE7QUFBQSxRQUM5SSxFQUFFLE1BQU0sYUFBYSxRQUFRLFVBQVUsT0FBTyxXQUFXLE9BQU8sVUFBVSxRQUFXLGtCQUFrQixlQUFlLGlCQUFpQixPQUFVO0FBQUEsUUFDakosRUFBRSxNQUFNLGFBQWEsUUFBUSxVQUFVLE9BQU8sV0FBVyxPQUFPLFVBQVUsT0FBTyxrQkFBa0IsZUFBZSxpQkFBaUIsYUFBYTtBQUFBLE1BQ2pKO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssbURBQW1ELE1BQU07QUFDN0QsV0FBTyxZQUFZLGtCQUFrQixDQUFDLENBQUMsR0FBRyxNQUFTO0FBQUEsRUFDcEQsQ0FBQztBQUVELE9BQUssaUZBQWlGLE1BQU07QUFDM0YsVUFBTSxNQUFNLENBQUMsVUFBa0IsVUFBVSxTQUFTLFdBQVcsS0FBSyxDQUFDLEVBQUUsU0FBUztBQUM5RSxVQUFNLFNBQVMsQ0FBQyxTQUFpQixJQUFJLEtBQUs7QUFBQSxNQUN6QyxRQUFRO0FBQUEsTUFDUixXQUFXLElBQUksYUFBYTtBQUFBLE1BQzVCLE1BQU0sV0FBVyxJQUFJLFlBQVksQ0FBQyxJQUFJLElBQUk7QUFBQSxJQUMzQyxDQUFDLEVBQUUsU0FBUztBQUVaLFVBQU0sYUFBYSxrQkFBa0I7QUFBQSxNQUNwQyxRQUFRLEVBQUUsS0FBSyxPQUFPLFNBQVMsRUFBRSxLQUFLLE9BQU8sUUFBUSxFQUFFLEVBQUU7QUFBQSxNQUN6RCxPQUFPLEVBQUUsS0FBSyxPQUFPLFNBQVMsRUFBRSxLQUFLLE9BQU8sT0FBTyxFQUFFLEVBQUU7QUFBQSxJQUN4RCxDQUFDO0FBRUQsV0FBTztBQUFBLE1BQ04sQ0FBQyxZQUFZLGtCQUFrQixNQUFNLFlBQVksaUJBQWlCLElBQUk7QUFBQSxNQUN0RSxDQUFDLGNBQWMsWUFBWTtBQUFBLElBQzVCO0FBQUEsRUFDRCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
