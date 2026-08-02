import * as assert from "assert";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { cloneAndChange } from "../../../../../../base/common/objects.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { TestEnvironmentService } from "../../../../../test/browser/workbenchTestServices.js";
import { ChatEditingSessionStorage } from "../../../browser/chatEditing/chatEditingSessionStorage.js";
import { ChatEditingSnapshotTextModelContentProvider } from "../../../browser/chatEditing/chatEditingTextModelContentProviders.js";
import { ModifiedFileEntryState } from "../../../common/editing/chatEditingService.js";
import { hasKey } from "../../../../../../base/common/types.js";
suite("ChatEditingSessionStorage", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  const sessionResource = URI.parse("chat://test-session");
  let fs;
  let storage;
  class TestChatEditingSessionStorage extends ChatEditingSessionStorage {
    get storageLocation() {
      return super._getStorageLocation();
    }
  }
  setup(() => {
    fs = ds.add(new FileService(new NullLogService()));
    ds.add(fs.registerProvider(TestEnvironmentService.workspaceStorageHome.scheme, ds.add(new InMemoryFileSystemProvider())));
    storage = new TestChatEditingSessionStorage(
      sessionResource,
      fs,
      TestEnvironmentService,
      new NullLogService(),
      // eslint-disable-next-line local/code-no-any-casts
      { getWorkspace: () => ({ id: "workspaceId" }) }
    );
  });
  function makeStop(requestId, before, after) {
    const stopId = generateUuid();
    const resource = URI.file("/foo.js");
    return {
      stopId,
      entries: new ResourceMap([
        [resource, { resource, languageId: "javascript", snapshotUri: ChatEditingSnapshotTextModelContentProvider.getSnapshotFileURI(sessionResource, requestId, stopId, resource.path, resource.scheme, resource.authority), original: `contents${before}}`, current: `contents${after}`, state: ModifiedFileEntryState.Modified, telemetryInfo: { agentId: "agentId", command: "cmd", requestId: generateUuid(), result: void 0, sessionResource, modelId: void 0, modeId: void 0, applyCodeBlockSuggestionId: void 0, feature: void 0 } }]
      ])
    };
  }
  function generateState() {
    const initialFileContents = new ResourceMap();
    for (let i = 0; i < 10; i++) {
      initialFileContents.set(URI.file(`/foo${i}.js`), `fileContents${Math.floor(i / 2)}`);
    }
    return {
      initialFileContents,
      recentSnapshot: makeStop(void 0, "d", "e"),
      timeline: void 0
    };
  }
  test("state is empty initially", async () => {
    const s = await storage.restoreState();
    assert.strictEqual(s, void 0);
  });
  test("round trips state", async () => {
    const original = generateState();
    await storage.storeState(original);
    const changer = (x) => {
      if (typeof x === "object" && x && hasKey(x, { isDeleted: true }) && x.isDeleted === void 0) {
        delete x.isDeleted;
      }
      return URI.isUri(x) ? x.toString() : x instanceof Map ? cloneAndChange([...x.values()], changer) : void 0;
    };
    const restored = await storage.restoreState();
    assert.deepStrictEqual(cloneAndChange(restored, changer), cloneAndChange(original, changer));
  });
  test("clears state", async () => {
    await storage.storeState(generateState());
    await storage.clearState();
    const s = await storage.restoreState();
    assert.strictEqual(s, void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nU2Vzc2lvblN0b3JhZ2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgY2xvbmVBbmRDaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBUZXN0RW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ1Nlc3Npb25TdG9yYWdlLCBJQ2hhdEVkaXRpbmdTZXNzaW9uU3RvcCwgU3RvcmVkU2Vzc2lvblN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jaGF0RWRpdGluZy9jaGF0RWRpdGluZ1Nlc3Npb25TdG9yYWdlLmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nU25hcHNob3RUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nVGV4dE1vZGVsQ29udGVudFByb3ZpZGVycy5qcyc7XG5pbXBvcnQgeyBJU25hcHNob3RFbnRyeSwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBoYXNLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5cbnN1aXRlKCdDaGF0RWRpdGluZ1Nlc3Npb25TdG9yYWdlJywgKCkgPT4ge1xuXHRjb25zdCBkcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NoYXQ6Ly90ZXN0LXNlc3Npb24nKTtcblx0bGV0IGZzOiBGaWxlU2VydmljZTtcblx0bGV0IHN0b3JhZ2U6IFRlc3RDaGF0RWRpdGluZ1Nlc3Npb25TdG9yYWdlO1xuXG5cdGNsYXNzIFRlc3RDaGF0RWRpdGluZ1Nlc3Npb25TdG9yYWdlIGV4dGVuZHMgQ2hhdEVkaXRpbmdTZXNzaW9uU3RvcmFnZSB7XG5cdFx0cHVibGljIGdldCBzdG9yYWdlTG9jYXRpb24oKSB7XG5cdFx0XHRyZXR1cm4gc3VwZXIuX2dldFN0b3JhZ2VMb2NhdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHRmcyA9IGRzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkcy5hZGQoZnMucmVnaXN0ZXJQcm92aWRlcihUZXN0RW52aXJvbm1lbnRTZXJ2aWNlLndvcmtzcGFjZVN0b3JhZ2VIb21lLnNjaGVtZSwgZHMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXG5cdFx0c3RvcmFnZSA9IG5ldyBUZXN0Q2hhdEVkaXRpbmdTZXNzaW9uU3RvcmFnZShcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGZzLFxuXHRcdFx0VGVzdEVudmlyb25tZW50U2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHR7IGdldFdvcmtzcGFjZTogKCkgPT4gKHsgaWQ6ICd3b3Jrc3BhY2VJZCcgfSkgfSBhcyBhbnksXG5cdFx0KTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gbWFrZVN0b3AocmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGJlZm9yZTogc3RyaW5nLCBhZnRlcjogc3RyaW5nKTogSUNoYXRFZGl0aW5nU2Vzc2lvblN0b3Age1xuXHRcdGNvbnN0IHN0b3BJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy9mb28uanMnKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RvcElkLFxuXHRcdFx0ZW50cmllczogbmV3IFJlc291cmNlTWFwKFtcblx0XHRcdFx0W3Jlc291cmNlLCB7IHJlc291cmNlLCBsYW5ndWFnZUlkOiAnamF2YXNjcmlwdCcsIHNuYXBzaG90VXJpOiBDaGF0RWRpdGluZ1NuYXBzaG90VGV4dE1vZGVsQ29udGVudFByb3ZpZGVyLmdldFNuYXBzaG90RmlsZVVSSShzZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3RJZCwgc3RvcElkLCByZXNvdXJjZS5wYXRoLCByZXNvdXJjZS5zY2hlbWUsIHJlc291cmNlLmF1dGhvcml0eSksIG9yaWdpbmFsOiBgY29udGVudHMke2JlZm9yZX19YCwgY3VycmVudDogYGNvbnRlbnRzJHthZnRlcn1gLCBzdGF0ZTogTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5Nb2RpZmllZCwgdGVsZW1ldHJ5SW5mbzogeyBhZ2VudElkOiAnYWdlbnRJZCcsIGNvbW1hbmQ6ICdjbWQnLCByZXF1ZXN0SWQ6IGdlbmVyYXRlVXVpZCgpLCByZXN1bHQ6IHVuZGVmaW5lZCwgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UsIG1vZGVsSWQ6IHVuZGVmaW5lZCwgbW9kZUlkOiB1bmRlZmluZWQsIGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsIGZlYXR1cmU6IHVuZGVmaW5lZCB9IH0gc2F0aXNmaWVzIElTbmFwc2hvdEVudHJ5XSxcblx0XHRcdF0pLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBnZW5lcmF0ZVN0YXRlKCk6IFN0b3JlZFNlc3Npb25TdGF0ZSB7XG5cdFx0Y29uc3QgaW5pdGlhbEZpbGVDb250ZW50cyA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDsgaSsrKSB7IGluaXRpYWxGaWxlQ29udGVudHMuc2V0KFVSSS5maWxlKGAvZm9vJHtpfS5qc2ApLCBgZmlsZUNvbnRlbnRzJHtNYXRoLmZsb29yKGkgLyAyKX1gKTsgfVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGluaXRpYWxGaWxlQ29udGVudHMsXG5cdFx0XHRyZWNlbnRTbmFwc2hvdDogbWFrZVN0b3AodW5kZWZpbmVkLCAnZCcsICdlJyksXG5cdFx0XHR0aW1lbGluZTogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdzdGF0ZSBpcyBlbXB0eSBpbml0aWFsbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcyA9IGF3YWl0IHN0b3JhZ2UucmVzdG9yZVN0YXRlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHMsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JvdW5kIHRyaXBzIHN0YXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gZ2VuZXJhdGVTdGF0ZSgpO1xuXHRcdGF3YWl0IHN0b3JhZ2Uuc3RvcmVTdGF0ZShvcmlnaW5hbCk7XG5cblx0XHRjb25zdCBjaGFuZ2VyID0gKHg6IGFueSkgPT4ge1xuXHRcdFx0aWYgKHR5cGVvZiB4ID09PSAnb2JqZWN0JyAmJiB4ICYmIGhhc0tleSh4LCB7IGlzRGVsZXRlZDogdHJ1ZSB9KSAmJiB4LmlzRGVsZXRlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGRlbGV0ZSB4LmlzRGVsZXRlZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBVUkkuaXNVcmkoeCkgPyB4LnRvU3RyaW5nKCkgOiB4IGluc3RhbmNlb2YgTWFwID8gY2xvbmVBbmRDaGFuZ2UoWy4uLngudmFsdWVzKCldLCBjaGFuZ2VyKSA6IHVuZGVmaW5lZDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzdG9yZWQgPSBhd2FpdCBzdG9yYWdlLnJlc3RvcmVTdGF0ZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2xvbmVBbmRDaGFuZ2UocmVzdG9yZWQsIGNoYW5nZXIpLCBjbG9uZUFuZENoYW5nZShvcmlnaW5hbCwgY2hhbmdlcikpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhcnMgc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgc3RvcmFnZS5zdG9yZVN0YXRlKGdlbmVyYXRlU3RhdGUoKSk7XG5cdFx0YXdhaXQgc3RvcmFnZS5jbGVhclN0YXRlKCk7XG5cdFx0Y29uc3QgcyA9IGF3YWl0IHN0b3JhZ2UucmVzdG9yZVN0YXRlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHMsIHVuZGVmaW5lZCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFDeEIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsaUNBQThFO0FBQ3ZGLFNBQVMsbURBQW1EO0FBQzVELFNBQXlCLDhCQUE4QjtBQUN2RCxTQUFTLGNBQWM7QUFFdkIsTUFBTSw2QkFBNkIsTUFBTTtBQUN4QyxRQUFNLEtBQUssd0NBQXdDO0FBQ25ELFFBQU0sa0JBQWtCLElBQUksTUFBTSxxQkFBcUI7QUFDdkQsTUFBSTtBQUNKLE1BQUk7QUFBQSxFQUVKLE1BQU0sc0NBQXNDLDBCQUEwQjtBQUFBLElBQ3JFLElBQVcsa0JBQWtCO0FBQzVCLGFBQU8sTUFBTSxvQkFBb0I7QUFBQSxJQUNsQztBQUFBLEVBQ0Q7QUFFQSxRQUFNLE1BQU07QUFDWCxT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
