import assert from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { getSessionWorkspaceKind, getUntitledSessionTitle, isActiveSessionStatus, sessionFileChangesEqual, SessionStatus, SessionWorkspaceKind, sessionWorkspaceEqual } from "../../common/session.js";
suite("isActiveSessionStatus", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("treats in-progress and needs-input sessions as active", () => {
    assert.deepStrictEqual([
      SessionStatus.Untitled,
      SessionStatus.InProgress,
      SessionStatus.NeedsInput,
      SessionStatus.Completed,
      SessionStatus.Error
    ].map((status) => isActiveSessionStatus(status)), [
      false,
      true,
      true,
      false,
      false
    ]);
  });
});
suite("sessionFileChangesEqual", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const fileA = URI.file("/a.txt");
  const fileB = URI.file("/b.txt");
  const fileAOriginal = URI.file("/a.original.txt");
  const fileAModified = URI.file("/a.modified.txt");
  function v1(modifiedUri, insertions = 1, deletions = 1, originalUri) {
    return { modifiedUri, originalUri, insertions, deletions };
  }
  function v2(uri, insertions = 1, deletions = 1, originalUri, modifiedUri) {
    return { uri, originalUri, modifiedUri, insertions, deletions };
  }
  test("returns true for the same array reference", () => {
    const arr = [v1(fileA)];
    assert.strictEqual(sessionFileChangesEqual(arr, arr), true);
  });
  test("returns true for two empty arrays", () => {
    assert.strictEqual(sessionFileChangesEqual([], []), true);
  });
  test("returns false when lengths differ", () => {
    assert.strictEqual(sessionFileChangesEqual([v1(fileA)], [v1(fileA), v1(fileB)]), false);
  });
  test("returns true for structurally equal v1 entries", () => {
    assert.strictEqual(sessionFileChangesEqual(
      [v1(fileA, 2, 3, fileAOriginal)],
      [v1(fileA, 2, 3, fileAOriginal)]
    ), true);
  });
  test("returns true for structurally equal v2 entries", () => {
    assert.strictEqual(sessionFileChangesEqual(
      [v2(fileA, 2, 3, fileAOriginal, fileAModified)],
      [v2(fileA, 2, 3, fileAOriginal, fileAModified)]
    ), true);
  });
  test("returns false when insertions differ", () => {
    assert.strictEqual(sessionFileChangesEqual([v1(fileA, 1, 1)], [v1(fileA, 2, 1)]), false);
  });
  test("returns false when deletions differ", () => {
    assert.strictEqual(sessionFileChangesEqual([v1(fileA, 1, 1)], [v1(fileA, 1, 2)]), false);
  });
  test("returns false when one entry is v1 and the other is v2", () => {
    assert.strictEqual(sessionFileChangesEqual([v1(fileA)], [v2(fileA)]), false);
  });
  test("returns false when v1 modifiedUri differs", () => {
    assert.strictEqual(sessionFileChangesEqual([v1(fileA)], [v1(fileB)]), false);
  });
  test("returns false when v2 uri differs", () => {
    assert.strictEqual(sessionFileChangesEqual([v2(fileA)], [v2(fileB)]), false);
  });
  test("returns false when v2 modifiedUri differs", () => {
    assert.strictEqual(sessionFileChangesEqual(
      [v2(fileA, 1, 1, void 0, fileAModified)],
      [v2(fileA, 1, 1, void 0, void 0)]
    ), false);
  });
  test("returns false when originalUri differs", () => {
    assert.strictEqual(sessionFileChangesEqual(
      [v1(fileA, 1, 1, fileAOriginal)],
      [v1(fileA, 1, 1, void 0)]
    ), false);
  });
  test("returns true when entries are the same reference (short-circuit)", () => {
    const shared = v1(fileA);
    assert.strictEqual(sessionFileChangesEqual([shared], [shared]), true);
  });
});
suite("sessionWorkspaceEqual", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function workspace(branchName = "main", gitHubInfo = constObservable(void 0)) {
    const root = URI.file("/repo");
    return {
      uri: root,
      label: "repo",
      group: "Local",
      icon: Codicon.repo,
      folders: [{
        root,
        workingDirectory: root,
        name: "repo",
        description: void 0,
        gitRepository: {
          uri: root,
          workTreeUri: void 0,
          branchName,
          baseBranchName: "main",
          gitHubInfo
        }
      }],
      requiresWorkspaceTrust: true,
      isVirtualWorkspace: false
    };
  }
  test("returns true for rebuilt workspace objects with the same values", () => {
    const gitHubInfo = constObservable(void 0);
    assert.strictEqual(sessionWorkspaceEqual(workspace("main", gitHubInfo), workspace("main", gitHubInfo)), true);
  });
  test("returns true for rebuilt workspace objects with equivalent GitHub info values", () => {
    const gitHubInfoA = { owner: "owner", repo: "repo" };
    const gitHubInfoB = { owner: "owner", repo: "repo" };
    assert.strictEqual(sessionWorkspaceEqual(workspace("main", constObservable(gitHubInfoA)), workspace("main", constObservable(gitHubInfoB))), true);
  });
  test("returns false when folder repository metadata changes", () => {
    assert.strictEqual(sessionWorkspaceEqual(workspace("main"), workspace("feature")), false);
  });
});
suite("getSessionWorkspaceKind", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function workspace(options = {}) {
    const root = URI.file("/repo");
    return {
      uri: root,
      label: "repo",
      icon: Codicon.repo,
      folders: options.folders === false ? [] : [{
        root,
        workingDirectory: options.workTreeUri ?? root,
        name: "repo",
        description: void 0,
        gitRepository: {
          uri: root,
          workTreeUri: options.workTreeUri,
          baseBranchName: "main",
          gitHubInfo: constObservable(void 0)
        }
      }],
      requiresWorkspaceTrust: true,
      isVirtualWorkspace: options.isVirtualWorkspace ?? false
    };
  }
  test("classifies workspaces", () => {
    assert.deepStrictEqual({
      checkout: getSessionWorkspaceKind(workspace()),
      worktree: getSessionWorkspaceKind(workspace({ workTreeUri: URI.file("/worktrees/repo") })),
      virtual: getSessionWorkspaceKind(workspace({ isVirtualWorkspace: true })),
      noFolders: getSessionWorkspaceKind(workspace({ folders: false })),
      undefinedWorkspace: getSessionWorkspaceKind(void 0),
      // A pending worktree still reports the checkout it was started from.
      pendingWorktree: getSessionWorkspaceKind(workspace(), true),
      pendingVirtual: getSessionWorkspaceKind(workspace({ isVirtualWorkspace: true }), true)
    }, {
      checkout: SessionWorkspaceKind.Folder,
      worktree: SessionWorkspaceKind.Worktree,
      virtual: SessionWorkspaceKind.Virtual,
      noFolders: SessionWorkspaceKind.Worktree,
      undefinedWorkspace: SessionWorkspaceKind.Worktree,
      pendingWorktree: SessionWorkspaceKind.Worktree,
      pendingVirtual: SessionWorkspaceKind.Virtual
    });
  });
});
suite("getUntitledSessionTitle", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test('returns "New Chat" for a quick chat', () => {
    assert.strictEqual(getUntitledSessionTitle(true), "New Chat");
  });
  test('returns "New Session" for a non-quick-chat session', () => {
    assert.strictEqual(getUntitledSessionTitle(false), "New Session");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL3NlcnZpY2VzL3Nlc3Npb25zL3Rlc3QvY29tbW9uL3Nlc3Npb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlLCBJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0U2Vzc2lvbldvcmtzcGFjZUtpbmQsIGdldFVudGl0bGVkU2Vzc2lvblRpdGxlLCBJR2l0SHViSW5mbywgaXNBY3RpdmVTZXNzaW9uU3RhdHVzLCBJU2Vzc2lvbldvcmtzcGFjZSwgc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwsIFNlc3Npb25TdGF0dXMsIFNlc3Npb25Xb3Jrc3BhY2VLaW5kLCBzZXNzaW9uV29ya3NwYWNlRXF1YWwgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbi5qcyc7XG5cbnN1aXRlKCdpc0FjdGl2ZVNlc3Npb25TdGF0dXMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndHJlYXRzIGluLXByb2dyZXNzIGFuZCBuZWVkcy1pbnB1dCBzZXNzaW9ucyBhcyBhY3RpdmUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRTZXNzaW9uU3RhdHVzLlVudGl0bGVkLFxuXHRcdFx0U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLFxuXHRcdFx0U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0LFxuXHRcdFx0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRTZXNzaW9uU3RhdHVzLkVycm9yLFxuXHRcdF0ubWFwKHN0YXR1cyA9PiBpc0FjdGl2ZVNlc3Npb25TdGF0dXMoc3RhdHVzKSksIFtcblx0XHRcdGZhbHNlLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHRydWUsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGZhbHNlLFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgZmlsZUEgPSBVUkkuZmlsZSgnL2EudHh0Jyk7XG5cdGNvbnN0IGZpbGVCID0gVVJJLmZpbGUoJy9iLnR4dCcpO1xuXHRjb25zdCBmaWxlQU9yaWdpbmFsID0gVVJJLmZpbGUoJy9hLm9yaWdpbmFsLnR4dCcpO1xuXHRjb25zdCBmaWxlQU1vZGlmaWVkID0gVVJJLmZpbGUoJy9hLm1vZGlmaWVkLnR4dCcpO1xuXG5cdGZ1bmN0aW9uIHYxKG1vZGlmaWVkVXJpOiBVUkksIGluc2VydGlvbnMgPSAxLCBkZWxldGlvbnMgPSAxLCBvcmlnaW5hbFVyaT86IFVSSSk6IElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2Uge1xuXHRcdHJldHVybiB7IG1vZGlmaWVkVXJpLCBvcmlnaW5hbFVyaSwgaW5zZXJ0aW9ucywgZGVsZXRpb25zIH07XG5cdH1cblxuXHRmdW5jdGlvbiB2Mih1cmk6IFVSSSwgaW5zZXJ0aW9ucyA9IDEsIGRlbGV0aW9ucyA9IDEsIG9yaWdpbmFsVXJpPzogVVJJLCBtb2RpZmllZFVyaT86IFVSSSk6IElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyIHtcblx0XHRyZXR1cm4geyB1cmksIG9yaWdpbmFsVXJpLCBtb2RpZmllZFVyaSwgaW5zZXJ0aW9ucywgZGVsZXRpb25zIH07XG5cdH1cblxuXHR0ZXN0KCdyZXR1cm5zIHRydWUgZm9yIHRoZSBzYW1lIGFycmF5IHJlZmVyZW5jZScsICgpID0+IHtcblx0XHRjb25zdCBhcnIgPSBbdjEoZmlsZUEpXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwoYXJyLCBhcnIpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB0cnVlIGZvciB0d28gZW1wdHkgYXJyYXlzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uRmlsZUNoYW5nZXNFcXVhbChbXSwgW10pLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBmYWxzZSB3aGVuIGxlbmd0aHMgZGlmZmVyJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uRmlsZUNoYW5nZXNFcXVhbChbdjEoZmlsZUEpXSwgW3YxKGZpbGVBKSwgdjEoZmlsZUIpXSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB0cnVlIGZvciBzdHJ1Y3R1cmFsbHkgZXF1YWwgdjEgZW50cmllcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwoXG5cdFx0XHRbdjEoZmlsZUEsIDIsIDMsIGZpbGVBT3JpZ2luYWwpXSxcblx0XHRcdFt2MShmaWxlQSwgMiwgMywgZmlsZUFPcmlnaW5hbCldXG5cdFx0KSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdHJ1ZSBmb3Igc3RydWN0dXJhbGx5IGVxdWFsIHYyIGVudHJpZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25GaWxlQ2hhbmdlc0VxdWFsKFxuXHRcdFx0W3YyKGZpbGVBLCAyLCAzLCBmaWxlQU9yaWdpbmFsLCBmaWxlQU1vZGlmaWVkKV0sXG5cdFx0XHRbdjIoZmlsZUEsIDIsIDMsIGZpbGVBT3JpZ2luYWwsIGZpbGVBTW9kaWZpZWQpXVxuXHRcdCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGZhbHNlIHdoZW4gaW5zZXJ0aW9ucyBkaWZmZXInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25GaWxlQ2hhbmdlc0VxdWFsKFt2MShmaWxlQSwgMSwgMSldLCBbdjEoZmlsZUEsIDIsIDEpXSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBmYWxzZSB3aGVuIGRlbGV0aW9ucyBkaWZmZXInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25GaWxlQ2hhbmdlc0VxdWFsKFt2MShmaWxlQSwgMSwgMSldLCBbdjEoZmlsZUEsIDEsIDIpXSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBmYWxzZSB3aGVuIG9uZSBlbnRyeSBpcyB2MSBhbmQgdGhlIG90aGVyIGlzIHYyJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uRmlsZUNoYW5nZXNFcXVhbChbdjEoZmlsZUEpXSwgW3YyKGZpbGVBKV0pLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgZmFsc2Ugd2hlbiB2MSBtb2RpZmllZFVyaSBkaWZmZXJzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uRmlsZUNoYW5nZXNFcXVhbChbdjEoZmlsZUEpXSwgW3YxKGZpbGVCKV0pLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgZmFsc2Ugd2hlbiB2MiB1cmkgZGlmZmVycycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwoW3YyKGZpbGVBKV0sIFt2MihmaWxlQildKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGZhbHNlIHdoZW4gdjIgbW9kaWZpZWRVcmkgZGlmZmVycycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwoXG5cdFx0XHRbdjIoZmlsZUEsIDEsIDEsIHVuZGVmaW5lZCwgZmlsZUFNb2RpZmllZCldLFxuXHRcdFx0W3YyKGZpbGVBLCAxLCAxLCB1bmRlZmluZWQsIHVuZGVmaW5lZCldXG5cdFx0KSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGZhbHNlIHdoZW4gb3JpZ2luYWxVcmkgZGlmZmVycycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbkZpbGVDaGFuZ2VzRXF1YWwoXG5cdFx0XHRbdjEoZmlsZUEsIDEsIDEsIGZpbGVBT3JpZ2luYWwpXSxcblx0XHRcdFt2MShmaWxlQSwgMSwgMSwgdW5kZWZpbmVkKV1cblx0XHQpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdHJ1ZSB3aGVuIGVudHJpZXMgYXJlIHRoZSBzYW1lIHJlZmVyZW5jZSAoc2hvcnQtY2lyY3VpdCknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2hhcmVkID0gdjEoZmlsZUEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uRmlsZUNoYW5nZXNFcXVhbChbc2hhcmVkXSwgW3NoYXJlZF0pLCB0cnVlKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3Nlc3Npb25Xb3Jrc3BhY2VFcXVhbCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiB3b3Jrc3BhY2UoYnJhbmNoTmFtZSA9ICdtYWluJywgZ2l0SHViSW5mbzogSU9ic2VydmFibGU8SUdpdEh1YkluZm8gfCB1bmRlZmluZWQ+ID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCkpOiBJU2Vzc2lvbldvcmtzcGFjZSB7XG5cdFx0Y29uc3Qgcm9vdCA9IFVSSS5maWxlKCcvcmVwbycpO1xuXHRcdHJldHVybiB7XG5cdFx0XHR1cmk6IHJvb3QsXG5cdFx0XHRsYWJlbDogJ3JlcG8nLFxuXHRcdFx0Z3JvdXA6ICdMb2NhbCcsXG5cdFx0XHRpY29uOiBDb2RpY29uLnJlcG8sXG5cdFx0XHRmb2xkZXJzOiBbe1xuXHRcdFx0XHRyb290LFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiByb290LFxuXHRcdFx0XHRuYW1lOiAncmVwbycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdGdpdFJlcG9zaXRvcnk6IHtcblx0XHRcdFx0XHR1cmk6IHJvb3QsXG5cdFx0XHRcdFx0d29ya1RyZWVVcmk6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRicmFuY2hOYW1lLFxuXHRcdFx0XHRcdGJhc2VCcmFuY2hOYW1lOiAnbWFpbicsXG5cdFx0XHRcdFx0Z2l0SHViSW5mbyxcblx0XHRcdFx0fSxcblx0XHRcdH1dLFxuXHRcdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogdHJ1ZSxcblx0XHRcdGlzVmlydHVhbFdvcmtzcGFjZTogZmFsc2UsXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ3JldHVybnMgdHJ1ZSBmb3IgcmVidWlsdCB3b3Jrc3BhY2Ugb2JqZWN0cyB3aXRoIHRoZSBzYW1lIHZhbHVlcycsICgpID0+IHtcblx0XHRjb25zdCBnaXRIdWJJbmZvID0gY29uc3RPYnNlcnZhYmxlPElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkPih1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uV29ya3NwYWNlRXF1YWwod29ya3NwYWNlKCdtYWluJywgZ2l0SHViSW5mbyksIHdvcmtzcGFjZSgnbWFpbicsIGdpdEh1YkluZm8pKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdHJ1ZSBmb3IgcmVidWlsdCB3b3Jrc3BhY2Ugb2JqZWN0cyB3aXRoIGVxdWl2YWxlbnQgR2l0SHViIGluZm8gdmFsdWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdEh1YkluZm9BOiBJR2l0SHViSW5mbyA9IHsgb3duZXI6ICdvd25lcicsIHJlcG86ICdyZXBvJyB9O1xuXHRcdGNvbnN0IGdpdEh1YkluZm9COiBJR2l0SHViSW5mbyA9IHsgb3duZXI6ICdvd25lcicsIHJlcG86ICdyZXBvJyB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uV29ya3NwYWNlRXF1YWwod29ya3NwYWNlKCdtYWluJywgY29uc3RPYnNlcnZhYmxlKGdpdEh1YkluZm9BKSksIHdvcmtzcGFjZSgnbWFpbicsIGNvbnN0T2JzZXJ2YWJsZShnaXRIdWJJbmZvQikpKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgZmFsc2Ugd2hlbiBmb2xkZXIgcmVwb3NpdG9yeSBtZXRhZGF0YSBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uV29ya3NwYWNlRXF1YWwod29ya3NwYWNlKCdtYWluJyksIHdvcmtzcGFjZSgnZmVhdHVyZScpKSwgZmFsc2UpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnZ2V0U2Vzc2lvbldvcmtzcGFjZUtpbmQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gd29ya3NwYWNlKG9wdGlvbnM6IHsgd29ya1RyZWVVcmk/OiBVUkk7IGlzVmlydHVhbFdvcmtzcGFjZT86IGJvb2xlYW47IGZvbGRlcnM/OiBib29sZWFuIH0gPSB7fSk6IElTZXNzaW9uV29ya3NwYWNlIHtcblx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJy9yZXBvJyk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVyaTogcm9vdCxcblx0XHRcdGxhYmVsOiAncmVwbycsXG5cdFx0XHRpY29uOiBDb2RpY29uLnJlcG8sXG5cdFx0XHRmb2xkZXJzOiBvcHRpb25zLmZvbGRlcnMgPT09IGZhbHNlID8gW10gOiBbe1xuXHRcdFx0XHRyb290LFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBvcHRpb25zLndvcmtUcmVlVXJpID8/IHJvb3QsXG5cdFx0XHRcdG5hbWU6ICdyZXBvJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0Z2l0UmVwb3NpdG9yeToge1xuXHRcdFx0XHRcdHVyaTogcm9vdCxcblx0XHRcdFx0XHR3b3JrVHJlZVVyaTogb3B0aW9ucy53b3JrVHJlZVVyaSxcblx0XHRcdFx0XHRiYXNlQnJhbmNoTmFtZTogJ21haW4nLFxuXHRcdFx0XHRcdGdpdEh1YkluZm86IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0sXG5cdFx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiB0cnVlLFxuXHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBvcHRpb25zLmlzVmlydHVhbFdvcmtzcGFjZSA/PyBmYWxzZSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnY2xhc3NpZmllcyB3b3Jrc3BhY2VzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2hlY2tvdXQ6IGdldFNlc3Npb25Xb3Jrc3BhY2VLaW5kKHdvcmtzcGFjZSgpKSxcblx0XHRcdHdvcmt0cmVlOiBnZXRTZXNzaW9uV29ya3NwYWNlS2luZCh3b3Jrc3BhY2UoeyB3b3JrVHJlZVVyaTogVVJJLmZpbGUoJy93b3JrdHJlZXMvcmVwbycpIH0pKSxcblx0XHRcdHZpcnR1YWw6IGdldFNlc3Npb25Xb3Jrc3BhY2VLaW5kKHdvcmtzcGFjZSh7IGlzVmlydHVhbFdvcmtzcGFjZTogdHJ1ZSB9KSksXG5cdFx0XHRub0ZvbGRlcnM6IGdldFNlc3Npb25Xb3Jrc3BhY2VLaW5kKHdvcmtzcGFjZSh7IGZvbGRlcnM6IGZhbHNlIH0pKSxcblx0XHRcdHVuZGVmaW5lZFdvcmtzcGFjZTogZ2V0U2Vzc2lvbldvcmtzcGFjZUtpbmQodW5kZWZpbmVkKSxcblx0XHRcdC8vIEEgcGVuZGluZyB3b3JrdHJlZSBzdGlsbCByZXBvcnRzIHRoZSBjaGVja291dCBpdCB3YXMgc3RhcnRlZCBmcm9tLlxuXHRcdFx0cGVuZGluZ1dvcmt0cmVlOiBnZXRTZXNzaW9uV29ya3NwYWNlS2luZCh3b3Jrc3BhY2UoKSwgdHJ1ZSksXG5cdFx0XHRwZW5kaW5nVmlydHVhbDogZ2V0U2Vzc2lvbldvcmtzcGFjZUtpbmQod29ya3NwYWNlKHsgaXNWaXJ0dWFsV29ya3NwYWNlOiB0cnVlIH0pLCB0cnVlKSxcblx0XHR9LCB7XG5cdFx0XHRjaGVja291dDogU2Vzc2lvbldvcmtzcGFjZUtpbmQuRm9sZGVyLFxuXHRcdFx0d29ya3RyZWU6IFNlc3Npb25Xb3Jrc3BhY2VLaW5kLldvcmt0cmVlLFxuXHRcdFx0dmlydHVhbDogU2Vzc2lvbldvcmtzcGFjZUtpbmQuVmlydHVhbCxcblx0XHRcdG5vRm9sZGVyczogU2Vzc2lvbldvcmtzcGFjZUtpbmQuV29ya3RyZWUsXG5cdFx0XHR1bmRlZmluZWRXb3Jrc3BhY2U6IFNlc3Npb25Xb3Jrc3BhY2VLaW5kLldvcmt0cmVlLFxuXHRcdFx0cGVuZGluZ1dvcmt0cmVlOiBTZXNzaW9uV29ya3NwYWNlS2luZC5Xb3JrdHJlZSxcblx0XHRcdHBlbmRpbmdWaXJ0dWFsOiBTZXNzaW9uV29ya3NwYWNlS2luZC5WaXJ0dWFsLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnZ2V0VW50aXRsZWRTZXNzaW9uVGl0bGUnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmV0dXJucyBcIk5ldyBDaGF0XCIgZm9yIGEgcXVpY2sgY2hhdCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VW50aXRsZWRTZXNzaW9uVGl0bGUodHJ1ZSksICdOZXcgQ2hhdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIFwiTmV3IFNlc3Npb25cIiBmb3IgYSBub24tcXVpY2stY2hhdCBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRVbnRpdGxlZFNlc3Npb25UaXRsZShmYWxzZSksICdOZXcgU2Vzc2lvbicpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUFvQztBQUM3QyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyx5QkFBeUIseUJBQXNDLHVCQUEwQyx5QkFBeUIsZUFBZSxzQkFBc0IsNkJBQTZCO0FBRTdNLE1BQU0seUJBQXlCLE1BQU07QUFFcEMsMENBQXdDO0FBRXhDLE9BQUsseURBQXlELE1BQU07QUFDbkUsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixjQUFjO0FBQUEsTUFDZCxjQUFjO0FBQUEsTUFDZCxjQUFjO0FBQUEsTUFD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
