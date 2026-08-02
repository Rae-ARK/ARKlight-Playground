import assert from "assert";
import { tmpdir } from "os";
import { join } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { isRecentFolder, restoreRecentlyOpened, toStoreData } from "../../common/workspaces.js";
suite("History Storage", () => {
  function toWorkspace(uri) {
    return {
      id: "1234",
      configPath: uri
    };
  }
  function assertEqualURI(u1, u2, message) {
    assert.strictEqual(u1 && u1.toString(), u2 && u2.toString(), message);
  }
  function assertEqualWorkspace(w1, w2, message) {
    if (!w1 || !w2) {
      assert.strictEqual(w1, w2, message);
      return;
    }
    assert.strictEqual(w1.id, w2.id, message);
    assertEqualURI(w1.configPath, w2.configPath, message);
  }
  function assertEqualRecentlyOpened(actual, expected, message) {
    assert.strictEqual(actual.files.length, expected.files.length, message);
    for (let i = 0; i < actual.files.length; i++) {
      assertEqualURI(actual.files[i].fileUri, expected.files[i].fileUri, message);
      assert.strictEqual(actual.files[i].label, expected.files[i].label);
      assert.strictEqual(actual.files[i].remoteAuthority, expected.files[i].remoteAuthority);
    }
    assert.strictEqual(actual.workspaces.length, expected.workspaces.length, message);
    for (let i = 0; i < actual.workspaces.length; i++) {
      const expectedRecent = expected.workspaces[i];
      const actualRecent = actual.workspaces[i];
      if (isRecentFolder(actualRecent)) {
        assertEqualURI(actualRecent.folderUri, expectedRecent.folderUri, message);
      } else {
        assertEqualWorkspace(actualRecent.workspace, expectedRecent.workspace, message);
      }
      assert.strictEqual(actualRecent.label, expectedRecent.label);
      assert.strictEqual(actualRecent.remoteAuthority, actualRecent.remoteAuthority);
    }
  }
  function assertRestoring(state, message) {
    const stored = toStoreData(state);
    const restored = restoreRecentlyOpened(stored, new NullLogService());
    assertEqualRecentlyOpened(state, restored, message);
  }
  const testWSPath = URI.file(join(tmpdir(), "windowStateTest", "test.code-workspace"));
  const testFileURI = URI.file(join(tmpdir(), "windowStateTest", "testFile.txt"));
  const testFolderURI = URI.file(join(tmpdir(), "windowStateTest", "testFolder"));
  const testRemoteFolderURI = URI.parse("foo://bar/c/e");
  const testRemoteFileURI = URI.parse("foo://bar/c/d.txt");
  const testRemoteWSURI = URI.parse("foo://bar/c/test.code-workspace");
  test("storing and restoring", () => {
    let ro;
    ro = {
      files: [],
      workspaces: []
    };
    assertRestoring(ro, "empty");
    ro = {
      files: [{ fileUri: testFileURI }],
      workspaces: []
    };
    assertRestoring(ro, "file");
    ro = {
      files: [],
      workspaces: [{ folderUri: testFolderURI }]
    };
    assertRestoring(ro, "folder");
    ro = {
      files: [],
      workspaces: [{ workspace: toWorkspace(testWSPath) }, { folderUri: testFolderURI }]
    };
    assertRestoring(ro, "workspaces and folders");
    ro = {
      files: [{ fileUri: testRemoteFileURI }],
      workspaces: [{ workspace: toWorkspace(testRemoteWSURI) }, { folderUri: testRemoteFolderURI }]
    };
    assertRestoring(ro, "remote workspaces and folders");
    ro = {
      files: [{ label: "abc", fileUri: testFileURI }],
      workspaces: [{ label: "def", workspace: toWorkspace(testWSPath) }, { folderUri: testRemoteFolderURI }]
    };
    assertRestoring(ro, "labels");
    ro = {
      files: [{ label: "abc", remoteAuthority: "test", fileUri: testRemoteFileURI }],
      workspaces: [{ label: "def", remoteAuthority: "test", workspace: toWorkspace(testWSPath) }, { folderUri: testRemoteFolderURI, remoteAuthority: "test" }]
    };
    assertRestoring(ro, "authority");
  });
  test("open 1_55", () => {
    const v1_55 = `{
			"entries": [
				{
					"folderUri": "foo://bar/23/43",
					"remoteAuthority": "test+test"
				},
				{
					"workspace": {
						"id": "53b714b46ef1a2d4346568b4f591028c",
						"configPath": "file:///home/user/workspaces/testing/custom.code-workspace"
					}
				},
				{
					"folderUri": "file:///home/user/workspaces/testing/folding",
					"label": "abc"
				},
				{
					"fileUri": "file:///home/user/.config/code-oss-dev/storage.json",
					"label": "def"
				}
			]
		}`;
    const windowsState = restoreRecentlyOpened(JSON.parse(v1_55), new NullLogService());
    const expected = {
      files: [{ label: "def", fileUri: URI.parse("file:///home/user/.config/code-oss-dev/storage.json") }],
      workspaces: [
        { folderUri: URI.parse("foo://bar/23/43"), remoteAuthority: "test+test" },
        { workspace: { id: "53b714b46ef1a2d4346568b4f591028c", configPath: URI.parse("file:///home/user/workspaces/testing/custom.code-workspace") } },
        { label: "abc", folderUri: URI.parse("file:///home/user/workspaces/testing/folding") }
      ]
    };
    assertEqualRecentlyOpened(windowsState, expected, "v1_33");
  });
  test("toStoreData drops label if it matches path", () => {
    const actual = toStoreData({
      workspaces: [],
      files: [{
        fileUri: URI.parse("file:///foo/bar/test.txt"),
        label: "/foo/bar/test.txt",
        remoteAuthority: void 0
      }]
    });
    assert.deepStrictEqual(actual, {
      entries: [{
        fileUri: "file:///foo/bar/test.txt",
        label: void 0,
        remoteAuthority: void 0
      }]
    });
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3dvcmtzcGFjZXMvdGVzdC9ub2RlL3dvcmtzcGFjZXNIaXN0b3J5U3RvcmFnZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElSZWNlbnRGb2xkZXIsIElSZWNlbnRseU9wZW5lZCwgSVJlY2VudFdvcmtzcGFjZSwgaXNSZWNlbnRGb2xkZXIsIHJlc3RvcmVSZWNlbnRseU9wZW5lZCwgdG9TdG9yZURhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vd29ya3NwYWNlcy5qcyc7XG5cbnN1aXRlKCdIaXN0b3J5IFN0b3JhZ2UnLCAoKSA9PiB7XG5cblx0ZnVuY3Rpb24gdG9Xb3Jrc3BhY2UodXJpOiBVUkkpOiBJV29ya3NwYWNlSWRlbnRpZmllciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiAnMTIzNCcsXG5cdFx0XHRjb25maWdQYXRoOiB1cmlcblx0XHR9O1xuXHR9XG5cdGZ1bmN0aW9uIGFzc2VydEVxdWFsVVJJKHUxOiBVUkkgfCB1bmRlZmluZWQsIHUyOiBVUkkgfCB1bmRlZmluZWQsIG1lc3NhZ2U/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodTEgJiYgdTEudG9TdHJpbmcoKSwgdTIgJiYgdTIudG9TdHJpbmcoKSwgbWVzc2FnZSk7XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRFcXVhbFdvcmtzcGFjZSh3MTogSVdvcmtzcGFjZUlkZW50aWZpZXIgfCB1bmRlZmluZWQsIHcyOiBJV29ya3NwYWNlSWRlbnRpZmllciB8IHVuZGVmaW5lZCwgbWVzc2FnZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdzEgfHwgIXcyKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodzEsIHcyLCBtZXNzYWdlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHcxLmlkLCB3Mi5pZCwgbWVzc2FnZSk7XG5cdFx0YXNzZXJ0RXF1YWxVUkkodzEuY29uZmlnUGF0aCwgdzIuY29uZmlnUGF0aCwgbWVzc2FnZSk7XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRFcXVhbFJlY2VudGx5T3BlbmVkKGFjdHVhbDogSVJlY2VudGx5T3BlbmVkLCBleHBlY3RlZDogSVJlY2VudGx5T3BlbmVkLCBtZXNzYWdlPzogc3RyaW5nKSB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5maWxlcy5sZW5ndGgsIGV4cGVjdGVkLmZpbGVzLmxlbmd0aCwgbWVzc2FnZSk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhY3R1YWwuZmlsZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGFzc2VydEVxdWFsVVJJKGFjdHVhbC5maWxlc1tpXS5maWxlVXJpLCBleHBlY3RlZC5maWxlc1tpXS5maWxlVXJpLCBtZXNzYWdlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZmlsZXNbaV0ubGFiZWwsIGV4cGVjdGVkLmZpbGVzW2ldLmxhYmVsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZmlsZXNbaV0ucmVtb3RlQXV0aG9yaXR5LCBleHBlY3RlZC5maWxlc1tpXS5yZW1vdGVBdXRob3JpdHkpO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLndvcmtzcGFjZXMubGVuZ3RoLCBleHBlY3RlZC53b3Jrc3BhY2VzLmxlbmd0aCwgbWVzc2FnZSk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhY3R1YWwud29ya3NwYWNlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRSZWNlbnQgPSBleHBlY3RlZC53b3Jrc3BhY2VzW2ldO1xuXHRcdFx0Y29uc3QgYWN0dWFsUmVjZW50ID0gYWN0dWFsLndvcmtzcGFjZXNbaV07XG5cdFx0XHRpZiAoaXNSZWNlbnRGb2xkZXIoYWN0dWFsUmVjZW50KSkge1xuXHRcdFx0XHRhc3NlcnRFcXVhbFVSSShhY3R1YWxSZWNlbnQuZm9sZGVyVXJpLCAoPElSZWNlbnRGb2xkZXI+ZXhwZWN0ZWRSZWNlbnQpLmZvbGRlclVyaSwgbWVzc2FnZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhc3NlcnRFcXVhbFdvcmtzcGFjZShhY3R1YWxSZWNlbnQud29ya3NwYWNlLCAoPElSZWNlbnRXb3Jrc3BhY2U+ZXhwZWN0ZWRSZWNlbnQpLndvcmtzcGFjZSwgbWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsUmVjZW50LmxhYmVsLCBleHBlY3RlZFJlY2VudC5sYWJlbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsUmVjZW50LnJlbW90ZUF1dGhvcml0eSwgYWN0dWFsUmVjZW50LnJlbW90ZUF1dGhvcml0eSk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gYXNzZXJ0UmVzdG9yaW5nKHN0YXRlOiBJUmVjZW50bHlPcGVuZWQsIG1lc3NhZ2U/OiBzdHJpbmcpIHtcblx0XHRjb25zdCBzdG9yZWQgPSB0b1N0b3JlRGF0YShzdGF0ZSk7XG5cdFx0Y29uc3QgcmVzdG9yZWQgPSByZXN0b3JlUmVjZW50bHlPcGVuZWQoc3RvcmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0YXNzZXJ0RXF1YWxSZWNlbnRseU9wZW5lZChzdGF0ZSwgcmVzdG9yZWQsIG1lc3NhZ2UpO1xuXHR9XG5cblx0Y29uc3QgdGVzdFdTUGF0aCA9IFVSSS5maWxlKGpvaW4odG1wZGlyKCksICd3aW5kb3dTdGF0ZVRlc3QnLCAndGVzdC5jb2RlLXdvcmtzcGFjZScpKTtcblx0Y29uc3QgdGVzdEZpbGVVUkkgPSBVUkkuZmlsZShqb2luKHRtcGRpcigpLCAnd2luZG93U3RhdGVUZXN0JywgJ3Rlc3RGaWxlLnR4dCcpKTtcblx0Y29uc3QgdGVzdEZvbGRlclVSSSA9IFVSSS5maWxlKGpvaW4odG1wZGlyKCksICd3aW5kb3dTdGF0ZVRlc3QnLCAndGVzdEZvbGRlcicpKTtcblxuXHRjb25zdCB0ZXN0UmVtb3RlRm9sZGVyVVJJID0gVVJJLnBhcnNlKCdmb286Ly9iYXIvYy9lJyk7XG5cdGNvbnN0IHRlc3RSZW1vdGVGaWxlVVJJID0gVVJJLnBhcnNlKCdmb286Ly9iYXIvYy9kLnR4dCcpO1xuXHRjb25zdCB0ZXN0UmVtb3RlV1NVUkkgPSBVUkkucGFyc2UoJ2ZvbzovL2Jhci9jL3Rlc3QuY29kZS13b3Jrc3BhY2UnKTtcblxuXHR0ZXN0KCdzdG9yaW5nIGFuZCByZXN0b3JpbmcnLCAoKSA9PiB7XG5cdFx0bGV0IHJvOiBJUmVjZW50bHlPcGVuZWQ7XG5cdFx0cm8gPSB7XG5cdFx0XHRmaWxlczogW10sXG5cdFx0XHR3b3Jrc3BhY2VzOiBbXVxuXHRcdH07XG5cdFx0YXNzZXJ0UmVzdG9yaW5nKHJvLCAnZW1wdHknKTtcblx0XHRybyA9IHtcblx0XHRcdGZpbGVzOiBbeyBmaWxlVXJpOiB0ZXN0RmlsZVVSSSB9XSxcblx0XHRcdHdvcmtzcGFjZXM6IFtdXG5cdFx0fTtcblx0XHRhc3NlcnRSZXN0b3Jpbmcocm8sICdmaWxlJyk7XG5cdFx0cm8gPSB7XG5cdFx0XHRmaWxlczogW10sXG5cdFx0XHR3b3Jrc3BhY2VzOiBbeyBmb2xkZXJVcmk6IHRlc3RGb2xkZXJVUkkgfV1cblx0XHR9O1xuXHRcdGFzc2VydFJlc3RvcmluZyhybywgJ2ZvbGRlcicpO1xuXHRcdHJvID0ge1xuXHRcdFx0ZmlsZXM6IFtdLFxuXHRcdFx0d29ya3NwYWNlczogW3sgd29ya3NwYWNlOiB0b1dvcmtzcGFjZSh0ZXN0V1NQYXRoKSB9LCB7IGZvbGRlclVyaTogdGVzdEZvbGRlclVSSSB9XVxuXHRcdH07XG5cdFx0YXNzZXJ0UmVzdG9yaW5nKHJvLCAnd29ya3NwYWNlcyBhbmQgZm9sZGVycycpO1xuXG5cdFx0cm8gPSB7XG5cdFx0XHRmaWxlczogW3sgZmlsZVVyaTogdGVzdFJlbW90ZUZpbGVVUkkgfV0sXG5cdFx0XHR3b3Jrc3BhY2VzOiBbeyB3b3Jrc3BhY2U6IHRvV29ya3NwYWNlKHRlc3RSZW1vdGVXU1VSSSkgfSwgeyBmb2xkZXJVcmk6IHRlc3RSZW1vdGVGb2xkZXJVUkkgfV1cblx0XHR9O1xuXHRcdGFzc2VydFJlc3RvcmluZyhybywgJ3JlbW90ZSB3b3Jrc3BhY2VzIGFuZCBmb2xkZXJzJyk7XG5cdFx0cm8gPSB7XG5cdFx0XHRmaWxlczogW3sgbGFiZWw6ICdhYmMnLCBmaWxlVXJpOiB0ZXN0RmlsZVVSSSB9XSxcblx0XHRcdHdvcmtzcGFjZXM6IFt7IGxhYmVsOiAnZGVmJywgd29ya3NwYWNlOiB0b1dvcmtzcGFjZSh0ZXN0V1NQYXRoKSB9LCB7IGZvbGRlclVyaTogdGVzdFJlbW90ZUZvbGRlclVSSSB9XVxuXHRcdH07XG5cdFx0YXNzZXJ0UmVzdG9yaW5nKHJvLCAnbGFiZWxzJyk7XG5cdFx0cm8gPSB7XG5cdFx0XHRmaWxlczogW3sgbGFiZWw6ICdhYmMnLCByZW1vdGVBdXRob3JpdHk6ICd0ZXN0JywgZmlsZVVyaTogdGVzdFJlbW90ZUZpbGVVUkkgfV0sXG5cdFx0XHR3b3Jrc3BhY2VzOiBbeyBsYWJlbDogJ2RlZicsIHJlbW90ZUF1dGhvcml0eTogJ3Rlc3QnLCB3b3Jrc3BhY2U6IHRvV29ya3NwYWNlKHRlc3RXU1BhdGgpIH0sIHsgZm9sZGVyVXJpOiB0ZXN0UmVtb3RlRm9sZGVyVVJJLCByZW1vdGVBdXRob3JpdHk6ICd0ZXN0JyB9XVxuXHRcdH07XG5cdFx0YXNzZXJ0UmVzdG9yaW5nKHJvLCAnYXV0aG9yaXR5Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wZW4gMV81NScsICgpID0+IHtcblx0XHRjb25zdCB2MV81NSA9IGB7XG5cdFx0XHRcImVudHJpZXNcIjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0XCJmb2xkZXJVcmlcIjogXCJmb286Ly9iYXIvMjMvNDNcIixcblx0XHRcdFx0XHRcInJlbW90ZUF1dGhvcml0eVwiOiBcInRlc3QrdGVzdFwiXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRcIndvcmtzcGFjZVwiOiB7XG5cdFx0XHRcdFx0XHRcImlkXCI6IFwiNTNiNzE0YjQ2ZWYxYTJkNDM0NjU2OGI0ZjU5MTAyOGNcIixcblx0XHRcdFx0XHRcdFwiY29uZmlnUGF0aFwiOiBcImZpbGU6Ly8vaG9tZS91c2VyL3dvcmtzcGFjZXMvdGVzdGluZy9jdXN0b20uY29kZS13b3Jrc3BhY2VcIlxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdFwiZm9sZGVyVXJpXCI6IFwiZmlsZTovLy9ob21lL3VzZXIvd29ya3NwYWNlcy90ZXN0aW5nL2ZvbGRpbmdcIixcblx0XHRcdFx0XHRcImxhYmVsXCI6IFwiYWJjXCJcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdFwiZmlsZVVyaVwiOiBcImZpbGU6Ly8vaG9tZS91c2VyLy5jb25maWcvY29kZS1vc3MtZGV2L3N0b3JhZ2UuanNvblwiLFxuXHRcdFx0XHRcdFwibGFiZWxcIjogXCJkZWZcIlxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fWA7XG5cblx0XHRjb25zdCB3aW5kb3dzU3RhdGUgPSByZXN0b3JlUmVjZW50bHlPcGVuZWQoSlNPTi5wYXJzZSh2MV81NSksIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBleHBlY3RlZDogSVJlY2VudGx5T3BlbmVkID0ge1xuXHRcdFx0ZmlsZXM6IFt7IGxhYmVsOiAnZGVmJywgZmlsZVVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci8uY29uZmlnL2NvZGUtb3NzLWRldi9zdG9yYWdlLmpzb24nKSB9XSxcblx0XHRcdHdvcmtzcGFjZXM6IFtcblx0XHRcdFx0eyBmb2xkZXJVcmk6IFVSSS5wYXJzZSgnZm9vOi8vYmFyLzIzLzQzJyksIHJlbW90ZUF1dGhvcml0eTogJ3Rlc3QrdGVzdCcgfSxcblx0XHRcdFx0eyB3b3Jrc3BhY2U6IHsgaWQ6ICc1M2I3MTRiNDZlZjFhMmQ0MzQ2NTY4YjRmNTkxMDI4YycsIGNvbmZpZ1BhdGg6IFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvd29ya3NwYWNlcy90ZXN0aW5nL2N1c3RvbS5jb2RlLXdvcmtzcGFjZScpIH0gfSxcblx0XHRcdFx0eyBsYWJlbDogJ2FiYycsIGZvbGRlclVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci93b3Jrc3BhY2VzL3Rlc3RpbmcvZm9sZGluZycpIH1cblx0XHRcdF1cblx0XHR9O1xuXG5cdFx0YXNzZXJ0RXF1YWxSZWNlbnRseU9wZW5lZCh3aW5kb3dzU3RhdGUsIGV4cGVjdGVkLCAndjFfMzMnKTtcblx0fSk7XG5cblx0dGVzdCgndG9TdG9yZURhdGEgZHJvcHMgbGFiZWwgaWYgaXQgbWF0Y2hlcyBwYXRoJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHRvU3RvcmVEYXRhKHtcblx0XHRcdHdvcmtzcGFjZXM6IFtdLFxuXHRcdFx0ZmlsZXM6IFt7XG5cdFx0XHRcdGZpbGVVcmk6IFVSSS5wYXJzZSgnZmlsZTovLy9mb28vYmFyL3Rlc3QudHh0JyksXG5cdFx0XHRcdGxhYmVsOiAnL2Zvby9iYXIvdGVzdC50eHQnLFxuXHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IHVuZGVmaW5lZFxuXHRcdFx0fV1cblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwge1xuXHRcdFx0ZW50cmllczogW3tcblx0XHRcdFx0ZmlsZVVyaTogJ2ZpbGU6Ly8vZm9vL2Jhci90ZXN0LnR4dCcsXG5cdFx0XHRcdGxhYmVsOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogdW5kZWZpbmVkXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsY0FBYztBQUN2QixTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBRS9CLFNBQTJELGdCQUFnQix1QkFBdUIsbUJBQW1CO0FBRXJILE1BQU0sbUJBQW1CLE1BQU07QUFFOUIsV0FBUyxZQUFZLEtBQWdDO0FBQ3BELFdBQU87QUFBQSxNQUNOLElBQUk7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
