import assert from "assert";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { basename } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { MainContext } from "../../common/extHost.protocol.js";
import { RelativePattern } from "../../common/extHostTypes.js";
import { ExtHostWorkspace } from "../../common/extHostWorkspace.js";
import { mock } from "../../../../base/test/common/mock.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { ExtHostRpcService } from "../../common/extHostRpcService.js";
import { isLinux, isWindows } from "../../../../base/common/platform.js";
import { FileSystemProviderCapabilities } from "../../../../platform/files/common/files.js";
import { nullExtensionDescription as extensionDescriptor } from "../../../services/extensions/common/extensions.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ExcludeSettingOptions } from "../../../services/search/common/searchExtTypes.js";
function createExtHostWorkspace(mainContext, data, logService) {
  mainContext.set(MainContext.MainThreadTelemetry, new class extends mock() {
    $publicLog2() {
    }
  }());
  const result = new ExtHostWorkspace(
    new ExtHostRpcService(mainContext),
    new class extends mock() {
      constructor() {
        super(...arguments);
        this.workspace = data;
      }
    }(),
    new class extends mock() {
      getCapabilities() {
        return isLinux ? FileSystemProviderCapabilities.PathCaseSensitive : void 0;
      }
    }(),
    logService,
    new class extends mock() {
    }()
  );
  result.$initializeWorkspace(data, true);
  return result;
}
suite("ExtHostWorkspace", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertAsRelativePath(workspace, input, expected, includeWorkspace) {
    const actual = workspace.getRelativePath(input, includeWorkspace);
    assert.strictEqual(actual, expected);
  }
  test("asRelativePath", () => {
    const ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", folders: [aWorkspaceFolderData(URI.file("/Coding/Applications/NewsWoWBot"), 0)], name: "Test" }, new NullLogService());
    assertAsRelativePath(ws, "/Coding/Applications/NewsWoWBot/bernd/das/brot", "bernd/das/brot");
    assertAsRelativePath(
      ws,
      "/Apps/DartPubCache/hosted/pub.dartlang.org/convert-2.0.1/lib/src/hex.dart",
      "/Apps/DartPubCache/hosted/pub.dartlang.org/convert-2.0.1/lib/src/hex.dart"
    );
    assertAsRelativePath(ws, "", "");
    assertAsRelativePath(ws, "/foo/bar", "/foo/bar");
    assertAsRelativePath(ws, "in/out", "in/out");
  });
  test("asRelativePath, same paths, #11402", function() {
    const root = "/home/aeschli/workspaces/samples/docker";
    const input = "/home/aeschli/workspaces/samples/docker";
    const ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
    assertAsRelativePath(ws, input, input);
    const input2 = "/home/aeschli/workspaces/samples/docker/a.file";
    assertAsRelativePath(ws, input2, "a.file");
  });
  test("asRelativePath, no workspace", function() {
    const ws = createExtHostWorkspace(new TestRPCProtocol(), null, new NullLogService());
    assertAsRelativePath(ws, "", "");
    assertAsRelativePath(ws, "/foo/bar", "/foo/bar");
  });
  test("asRelativePath, multiple folders", function() {
    const ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", folders: [aWorkspaceFolderData(URI.file("/Coding/One"), 0), aWorkspaceFolderData(URI.file("/Coding/Two"), 1)], name: "Test" }, new NullLogService());
    assertAsRelativePath(ws, "/Coding/One/file.txt", "One/file.txt");
    assertAsRelativePath(ws, "/Coding/Two/files/out.txt", "Two/files/out.txt");
    assertAsRelativePath(ws, "/Coding/Two2/files/out.txt", "/Coding/Two2/files/out.txt");
  });
  test("slightly inconsistent behaviour of asRelativePath and getWorkspaceFolder, #31553", function() {
    const mrws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", folders: [aWorkspaceFolderData(URI.file("/Coding/One"), 0), aWorkspaceFolderData(URI.file("/Coding/Two"), 1)], name: "Test" }, new NullLogService());
    assertAsRelativePath(mrws, "/Coding/One/file.txt", "One/file.txt");
    assertAsRelativePath(mrws, "/Coding/One/file.txt", "One/file.txt", true);
    assertAsRelativePath(mrws, "/Coding/One/file.txt", "file.txt", false);
    assertAsRelativePath(mrws, "/Coding/Two/files/out.txt", "Two/files/out.txt");
    assertAsRelativePath(mrws, "/Coding/Two/files/out.txt", "Two/files/out.txt", true);
    assertAsRelativePath(mrws, "/Coding/Two/files/out.txt", "files/out.txt", false);
    assertAsRelativePath(mrws, "/Coding/Two2/files/out.txt", "/Coding/Two2/files/out.txt");
    assertAsRelativePath(mrws, "/Coding/Two2/files/out.txt", "/Coding/Two2/files/out.txt", true);
    assertAsRelativePath(mrws, "/Coding/Two2/files/out.txt", "/Coding/Two2/files/out.txt", false);
    const srws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", folders: [aWorkspaceFolderData(URI.file("/Coding/One"), 0)], name: "Test" }, new NullLogService());
    assertAsRelativePath(srws, "/Coding/One/file.txt", "file.txt");
    assertAsRelativePath(srws, "/Coding/One/file.txt", "file.txt", false);
    assertAsRelativePath(srws, "/Coding/One/file.txt", "One/file.txt", true);
    assertAsRelativePath(srws, "/Coding/Two2/files/out.txt", "/Coding/Two2/files/out.txt");
    assertAsRelativePath(srws, "/Coding/Two2/files/out.txt", "/Coding/Two2/files/out.txt", true);
    assertAsRelativePath(srws, "/Coding/Two2/files/out.txt", "/Coding/Two2/files/out.txt", false);
  });
  test("getPath, legacy", function() {
    let ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", name: "Test", folders: [] }, new NullLogService());
    assert.strictEqual(ws.getPath(), void 0);
    ws = createExtHostWorkspace(new TestRPCProtocol(), null, new NullLogService());
    assert.strictEqual(ws.getPath(), void 0);
    ws = createExtHostWorkspace(new TestRPCProtocol(), void 0, new NullLogService());
    assert.strictEqual(ws.getPath(), void 0);
    ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.file("Folder"), 0), aWorkspaceFolderData(URI.file("Another/Folder"), 1)] }, new NullLogService());
    assert.strictEqual(ws.getPath().replace(/\\/g, "/"), "/Folder");
    ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.file("/Folder"), 0)] }, new NullLogService());
    assert.strictEqual(ws.getPath().replace(/\\/g, "/"), "/Folder");
  });
  test("WorkspaceFolder has name and index", function() {
    const ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", folders: [aWorkspaceFolderData(URI.file("/Coding/One"), 0), aWorkspaceFolderData(URI.file("/Coding/Two"), 1)], name: "Test" }, new NullLogService());
    const [one, two] = ws.getWorkspaceFolders();
    assert.strictEqual(one.name, "One");
    assert.strictEqual(one.index, 0);
    assert.strictEqual(two.name, "Two");
    assert.strictEqual(two.index, 1);
  });
  test("getContainingWorkspaceFolder", () => {
    const ws = createExtHostWorkspace(new TestRPCProtocol(), {
      id: "foo",
      name: "Test",
      folders: [
        aWorkspaceFolderData(URI.file("/Coding/One"), 0),
        aWorkspaceFolderData(URI.file("/Coding/Two"), 1),
        aWorkspaceFolderData(URI.file("/Coding/Two/Nested"), 2)
      ]
    }, new NullLogService());
    let folder = ws.getWorkspaceFolder(URI.file("/foo/bar"));
    assert.strictEqual(folder, void 0);
    folder = ws.getWorkspaceFolder(URI.file("/Coding/One/file/path.txt"));
    assert.strictEqual(folder.name, "One");
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two/file/path.txt"));
    assert.strictEqual(folder.name, "Two");
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two/Nest"));
    assert.strictEqual(folder.name, "Two");
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two/Nested/file"));
    assert.strictEqual(folder.name, "Nested");
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two/Nested/f"));
    assert.strictEqual(folder.name, "Nested");
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two/Nested"), true);
    assert.strictEqual(folder.name, "Two");
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two/Nested/"), true);
    assert.strictEqual(folder.name, "Two");
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two/Nested"));
    assert.strictEqual(folder.name, "Nested");
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two/Nested/"));
    assert.strictEqual(folder.name, "Nested");
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two"), true);
    assert.strictEqual(folder, void 0);
    folder = ws.getWorkspaceFolder(URI.file("/Coding/Two"), false);
    assert.strictEqual(folder.name, "Two");
  });
  test("Multiroot change event should have a delta, #29641", function(done) {
    const ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", name: "Test", folders: [] }, new NullLogService());
    let finished = false;
    const finish = (error) => {
      if (!finished) {
        finished = true;
        done(error);
      }
    };
    let sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.deepStrictEqual(e.added, []);
        assert.deepStrictEqual(e.removed, []);
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [] });
    sub.dispose();
    sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.deepStrictEqual(e.removed, []);
        assert.strictEqual(e.added.length, 1);
        assert.strictEqual(e.added[0].uri.toString(), "foo:bar");
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar"), 0)] });
    sub.dispose();
    sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.deepStrictEqual(e.removed, []);
        assert.strictEqual(e.added.length, 1);
        assert.strictEqual(e.added[0].uri.toString(), "foo:bar2");
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar"), 0), aWorkspaceFolderData(URI.parse("foo:bar2"), 1)] });
    sub.dispose();
    sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.strictEqual(e.removed.length, 2);
        assert.strictEqual(e.removed[0].uri.toString(), "foo:bar");
        assert.strictEqual(e.removed[1].uri.toString(), "foo:bar2");
        assert.strictEqual(e.added.length, 1);
        assert.strictEqual(e.added[0].uri.toString(), "foo:bar3");
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar3"), 0)] });
    sub.dispose();
    finish();
  });
  test("Multiroot change keeps existing workspaces live", function() {
    const ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar"), 0)] }, new NullLogService());
    const firstFolder = ws.getWorkspaceFolders()[0];
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar2"), 0), aWorkspaceFolderData(URI.parse("foo:bar"), 1, "renamed")] });
    assert.strictEqual(ws.getWorkspaceFolders()[1], firstFolder);
    assert.strictEqual(firstFolder.index, 1);
    assert.strictEqual(firstFolder.name, "renamed");
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar3"), 0), aWorkspaceFolderData(URI.parse("foo:bar2"), 1), aWorkspaceFolderData(URI.parse("foo:bar"), 2)] });
    assert.strictEqual(ws.getWorkspaceFolders()[2], firstFolder);
    assert.strictEqual(firstFolder.index, 2);
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar3"), 0)] });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar3"), 0), aWorkspaceFolderData(URI.parse("foo:bar"), 1)] });
    assert.notStrictEqual(firstFolder, ws.workspace.folders[0]);
  });
  test("updateWorkspaceFolders - invalid arguments", function() {
    let ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", name: "Test", folders: [] }, new NullLogService());
    assert.strictEqual(false, ws.updateWorkspaceFolders(extensionDescriptor, null, null));
    assert.strictEqual(false, ws.updateWorkspaceFolders(extensionDescriptor, 0, 0));
    assert.strictEqual(false, ws.updateWorkspaceFolders(extensionDescriptor, 0, 1));
    assert.strictEqual(false, ws.updateWorkspaceFolders(extensionDescriptor, 1, 0));
    assert.strictEqual(false, ws.updateWorkspaceFolders(extensionDescriptor, -1, 0));
    assert.strictEqual(false, ws.updateWorkspaceFolders(extensionDescriptor, -1, -1));
    ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar"), 0)] }, new NullLogService());
    assert.strictEqual(false, ws.updateWorkspaceFolders(extensionDescriptor, 1, 1));
    assert.strictEqual(false, ws.updateWorkspaceFolders(extensionDescriptor, 0, 2));
    assert.strictEqual(false, ws.updateWorkspaceFolders(extensionDescriptor, 0, 1, asUpdateWorkspaceFolderData(URI.parse("foo:bar"))));
  });
  test("updateWorkspaceFolders - valid arguments", function(done) {
    let finished = false;
    const finish = (error) => {
      if (!finished) {
        finished = true;
        done(error);
      }
    };
    const protocol = {
      getProxy: () => {
        return void 0;
      },
      set: () => {
        return void 0;
      },
      dispose: () => {
      },
      assertRegistered: () => {
      },
      drain: () => {
        return void 0;
      }
    };
    const ws = createExtHostWorkspace(protocol, { id: "foo", name: "Test", folders: [] }, new NullLogService());
    assert.strictEqual(true, ws.updateWorkspaceFolders(extensionDescriptor, 0, 0, asUpdateWorkspaceFolderData(URI.parse("foo:bar"))));
    assert.strictEqual(1, ws.workspace.folders.length);
    assert.strictEqual(ws.workspace.folders[0].uri.toString(), URI.parse("foo:bar").toString());
    const firstAddedFolder = ws.getWorkspaceFolders()[0];
    let gotEvent = false;
    let sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.deepStrictEqual(e.removed, []);
        assert.strictEqual(e.added.length, 1);
        assert.strictEqual(e.added[0].uri.toString(), "foo:bar");
        assert.strictEqual(e.added[0], firstAddedFolder);
        gotEvent = true;
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar"), 0)] });
    assert.strictEqual(gotEvent, true);
    sub.dispose();
    assert.strictEqual(ws.getWorkspaceFolders()[0], firstAddedFolder);
    assert.strictEqual(true, ws.updateWorkspaceFolders(extensionDescriptor, 1, 0, asUpdateWorkspaceFolderData(URI.parse("foo:bar1")), asUpdateWorkspaceFolderData(URI.parse("foo:bar2"))));
    assert.strictEqual(3, ws.workspace.folders.length);
    assert.strictEqual(ws.workspace.folders[0].uri.toString(), URI.parse("foo:bar").toString());
    assert.strictEqual(ws.workspace.folders[1].uri.toString(), URI.parse("foo:bar1").toString());
    assert.strictEqual(ws.workspace.folders[2].uri.toString(), URI.parse("foo:bar2").toString());
    const secondAddedFolder = ws.getWorkspaceFolders()[1];
    const thirdAddedFolder = ws.getWorkspaceFolders()[2];
    gotEvent = false;
    sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.deepStrictEqual(e.removed, []);
        assert.strictEqual(e.added.length, 2);
        assert.strictEqual(e.added[0].uri.toString(), "foo:bar1");
        assert.strictEqual(e.added[1].uri.toString(), "foo:bar2");
        assert.strictEqual(e.added[0], secondAddedFolder);
        assert.strictEqual(e.added[1], thirdAddedFolder);
        gotEvent = true;
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar"), 0), aWorkspaceFolderData(URI.parse("foo:bar1"), 1), aWorkspaceFolderData(URI.parse("foo:bar2"), 2)] });
    assert.strictEqual(gotEvent, true);
    sub.dispose();
    assert.strictEqual(ws.getWorkspaceFolders()[0], firstAddedFolder);
    assert.strictEqual(ws.getWorkspaceFolders()[1], secondAddedFolder);
    assert.strictEqual(ws.getWorkspaceFolders()[2], thirdAddedFolder);
    assert.strictEqual(true, ws.updateWorkspaceFolders(extensionDescriptor, 2, 1));
    assert.strictEqual(2, ws.workspace.folders.length);
    assert.strictEqual(ws.workspace.folders[0].uri.toString(), URI.parse("foo:bar").toString());
    assert.strictEqual(ws.workspace.folders[1].uri.toString(), URI.parse("foo:bar1").toString());
    gotEvent = false;
    sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.deepStrictEqual(e.added, []);
        assert.strictEqual(e.removed.length, 1);
        assert.strictEqual(e.removed[0], thirdAddedFolder);
        gotEvent = true;
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar"), 0), aWorkspaceFolderData(URI.parse("foo:bar1"), 1)] });
    assert.strictEqual(gotEvent, true);
    sub.dispose();
    assert.strictEqual(ws.getWorkspaceFolders()[0], firstAddedFolder);
    assert.strictEqual(ws.getWorkspaceFolders()[1], secondAddedFolder);
    assert.strictEqual(true, ws.updateWorkspaceFolders(extensionDescriptor, 0, 2, asUpdateWorkspaceFolderData(URI.parse("foo:bar"), "renamed 1"), asUpdateWorkspaceFolderData(URI.parse("foo:bar1"), "renamed 2")));
    assert.strictEqual(2, ws.workspace.folders.length);
    assert.strictEqual(ws.workspace.folders[0].uri.toString(), URI.parse("foo:bar").toString());
    assert.strictEqual(ws.workspace.folders[1].uri.toString(), URI.parse("foo:bar1").toString());
    assert.strictEqual(ws.workspace.folders[0].name, "renamed 1");
    assert.strictEqual(ws.workspace.folders[1].name, "renamed 2");
    assert.strictEqual(ws.getWorkspaceFolders()[0].name, "renamed 1");
    assert.strictEqual(ws.getWorkspaceFolders()[1].name, "renamed 2");
    gotEvent = false;
    sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.deepStrictEqual(e.added, []);
        assert.strictEqual(e.removed.length, 0);
        gotEvent = true;
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar"), 0, "renamed 1"), aWorkspaceFolderData(URI.parse("foo:bar1"), 1, "renamed 2")] });
    assert.strictEqual(gotEvent, true);
    sub.dispose();
    assert.strictEqual(ws.getWorkspaceFolders()[0], firstAddedFolder);
    assert.strictEqual(ws.getWorkspaceFolders()[1], secondAddedFolder);
    assert.strictEqual(ws.workspace.folders[0].name, "renamed 1");
    assert.strictEqual(ws.workspace.folders[1].name, "renamed 2");
    assert.strictEqual(ws.getWorkspaceFolders()[0].name, "renamed 1");
    assert.strictEqual(ws.getWorkspaceFolders()[1].name, "renamed 2");
    assert.strictEqual(true, ws.updateWorkspaceFolders(extensionDescriptor, 0, 2, asUpdateWorkspaceFolderData(URI.parse("foo:bar3")), asUpdateWorkspaceFolderData(URI.parse("foo:bar4"))));
    assert.strictEqual(2, ws.workspace.folders.length);
    assert.strictEqual(ws.workspace.folders[0].uri.toString(), URI.parse("foo:bar3").toString());
    assert.strictEqual(ws.workspace.folders[1].uri.toString(), URI.parse("foo:bar4").toString());
    const fourthAddedFolder = ws.getWorkspaceFolders()[0];
    const fifthAddedFolder = ws.getWorkspaceFolders()[1];
    gotEvent = false;
    sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.strictEqual(e.added.length, 2);
        assert.strictEqual(e.added[0], fourthAddedFolder);
        assert.strictEqual(e.added[1], fifthAddedFolder);
        assert.strictEqual(e.removed.length, 2);
        assert.strictEqual(e.removed[0], firstAddedFolder);
        assert.strictEqual(e.removed[1], secondAddedFolder);
        gotEvent = true;
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar3"), 0), aWorkspaceFolderData(URI.parse("foo:bar4"), 1)] });
    assert.strictEqual(gotEvent, true);
    sub.dispose();
    assert.strictEqual(ws.getWorkspaceFolders()[0], fourthAddedFolder);
    assert.strictEqual(ws.getWorkspaceFolders()[1], fifthAddedFolder);
    assert.strictEqual(true, ws.updateWorkspaceFolders(extensionDescriptor, 0, 2, asUpdateWorkspaceFolderData(URI.parse("foo:bar4")), asUpdateWorkspaceFolderData(URI.parse("foo:bar3"))));
    assert.strictEqual(2, ws.workspace.folders.length);
    assert.strictEqual(ws.workspace.folders[0].uri.toString(), URI.parse("foo:bar4").toString());
    assert.strictEqual(ws.workspace.folders[1].uri.toString(), URI.parse("foo:bar3").toString());
    assert.strictEqual(ws.getWorkspaceFolders()[0], fifthAddedFolder);
    assert.strictEqual(ws.getWorkspaceFolders()[1], fourthAddedFolder);
    gotEvent = false;
    sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.strictEqual(e.added.length, 0);
        assert.strictEqual(e.removed.length, 0);
        gotEvent = true;
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [aWorkspaceFolderData(URI.parse("foo:bar4"), 0), aWorkspaceFolderData(URI.parse("foo:bar3"), 1)] });
    assert.strictEqual(gotEvent, true);
    sub.dispose();
    assert.strictEqual(ws.getWorkspaceFolders()[0], fifthAddedFolder);
    assert.strictEqual(ws.getWorkspaceFolders()[1], fourthAddedFolder);
    assert.strictEqual(fifthAddedFolder.index, 0);
    assert.strictEqual(fourthAddedFolder.index, 1);
    assert.strictEqual(true, ws.updateWorkspaceFolders(extensionDescriptor, 2, 0, asUpdateWorkspaceFolderData(URI.parse("foo:bar5"))));
    assert.strictEqual(3, ws.workspace.folders.length);
    assert.strictEqual(ws.workspace.folders[0].uri.toString(), URI.parse("foo:bar4").toString());
    assert.strictEqual(ws.workspace.folders[1].uri.toString(), URI.parse("foo:bar3").toString());
    assert.strictEqual(ws.workspace.folders[2].uri.toString(), URI.parse("foo:bar5").toString());
    const sixthAddedFolder = ws.getWorkspaceFolders()[2];
    gotEvent = false;
    sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.strictEqual(e.added.length, 1);
        assert.strictEqual(e.added[0], sixthAddedFolder);
        gotEvent = true;
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({
      id: "foo",
      name: "Test",
      folders: [
        aWorkspaceFolderData(URI.parse("foo:bar4"), 0),
        aWorkspaceFolderData(URI.parse("foo:bar3"), 1),
        aWorkspaceFolderData(URI.parse("foo:bar5"), 2)
      ]
    });
    assert.strictEqual(gotEvent, true);
    sub.dispose();
    assert.strictEqual(ws.getWorkspaceFolders()[0], fifthAddedFolder);
    assert.strictEqual(ws.getWorkspaceFolders()[1], fourthAddedFolder);
    assert.strictEqual(ws.getWorkspaceFolders()[2], sixthAddedFolder);
    finish();
  });
  test("Multiroot change event is immutable", function(done) {
    let finished = false;
    const finish = (error) => {
      if (!finished) {
        finished = true;
        done(error);
      }
    };
    const ws = createExtHostWorkspace(new TestRPCProtocol(), { id: "foo", name: "Test", folders: [] }, new NullLogService());
    const sub = ws.onDidChangeWorkspace((e) => {
      try {
        assert.throws(() => {
          e.added = [];
        });
      } catch (error) {
        finish(error);
      }
    });
    ws.$acceptWorkspaceData({ id: "foo", name: "Test", folders: [] });
    sub.dispose();
    finish();
  });
  test("`vscode.workspace.getWorkspaceFolder(file)` don't return workspace folder when file open from command line. #36221", function() {
    if (isWindows) {
      const ws = createExtHostWorkspace(new TestRPCProtocol(), {
        id: "foo",
        name: "Test",
        folders: [
          aWorkspaceFolderData(URI.file("c:/Users/marek/Desktop/vsc_test/"), 0)
        ]
      }, new NullLogService());
      assert.ok(ws.getWorkspaceFolder(URI.file("c:/Users/marek/Desktop/vsc_test/a.txt")));
      assert.ok(ws.getWorkspaceFolder(URI.file("C:/Users/marek/Desktop/vsc_test/b.txt")));
    }
  });
  function aWorkspaceFolderData(uri, index, name = "") {
    return {
      uri,
      index,
      name: name || basename(uri.path)
    };
  }
  function asUpdateWorkspaceFolderData(uri, name) {
    return { uri, name };
  }
  suite("findFiles -", function() {
    test("string include", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.includePattern, "foo");
          assert.strictEqual(_includeFolder, null);
          assert.strictEqual(options.excludePattern, void 0);
          assert.strictEqual(options.disregardExcludeSettings, false);
          assert.strictEqual(options.maxResults, 10);
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles("foo", void 0, 10, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    });
    function testFindFilesInclude(pattern) {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.includePattern, "glob/**");
          assert.deepStrictEqual(_includeFolder ? URI.from(_includeFolder).toJSON() : null, URI.file("/other/folder").toJSON());
          assert.strictEqual(options.excludePattern, void 0);
          assert.strictEqual(options.disregardExcludeSettings, false);
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles(pattern, void 0, 10, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    }
    test("RelativePattern include (string)", () => {
      return testFindFilesInclude(new RelativePattern("/other/folder", "glob/**"));
    });
    test("RelativePattern include (URI)", () => {
      return testFindFilesInclude(new RelativePattern(URI.file("/other/folder"), "glob/**"));
    });
    test("no excludes", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.includePattern, "glob/**");
          assert.deepStrictEqual(URI.revive(_includeFolder).toString(), URI.file("/other/folder").toString());
          assert.strictEqual(options.excludePattern, void 0);
          assert.strictEqual(options.disregardExcludeSettings, true);
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles(new RelativePattern("/other/folder", "glob/**"), null, 10, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    });
    test("with cancelled token", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token2) {
          mainThreadCalled = true;
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      const token = CancellationToken.Cancelled;
      return ws.findFiles(new RelativePattern("/other/folder", "glob/**"), null, 10, new ExtensionIdentifier("test"), token).then(() => {
        assert(!mainThreadCalled, "!mainThreadCalled");
      });
    });
    test("RelativePattern exclude", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.disregardExcludeSettings, false);
          assert.strictEqual(options.excludePattern?.length, 1);
          assert.strictEqual(options.excludePattern[0].pattern, "glob/**");
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles("", new RelativePattern(root, "glob/**"), 10, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    });
  });
  suite("findFiles2 -", function() {
    test("string include", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.filePattern, "foo");
          assert.strictEqual(options.includePattern, void 0);
          assert.strictEqual(_includeFolder, null);
          assert.strictEqual(options.excludePattern, void 0);
          assert.strictEqual(options.disregardExcludeSettings, false);
          assert.strictEqual(options.maxResults, 10);
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles2(["foo"], { maxResults: 10, useExcludeSettings: ExcludeSettingOptions.FilesExclude }, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    });
    function testFindFiles2Include(pattern) {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.filePattern, "glob/**");
          assert.strictEqual(options.includePattern, void 0);
          assert.deepStrictEqual(_includeFolder ? URI.from(_includeFolder).toJSON() : null, URI.file("/other/folder").toJSON());
          assert.strictEqual(options.excludePattern, void 0);
          assert.strictEqual(options.disregardExcludeSettings, false);
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles2(pattern, { maxResults: 10 }, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    }
    test("RelativePattern include (string)", () => {
      return testFindFiles2Include([new RelativePattern("/other/folder", "glob/**")]);
    });
    test("RelativePattern include (URI)", () => {
      return testFindFiles2Include([new RelativePattern(URI.file("/other/folder"), "glob/**")]);
    });
    test("no excludes", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.filePattern, "glob/**");
          assert.strictEqual(options.includePattern, void 0);
          assert.deepStrictEqual(URI.revive(_includeFolder).toString(), URI.file("/other/folder").toString());
          assert.strictEqual(options.excludePattern, void 0);
          assert.strictEqual(options.disregardExcludeSettings, false);
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles2([new RelativePattern("/other/folder", "glob/**")], {}, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    });
    test("no dups", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.includePattern, void 0);
          assert.strictEqual(options.excludePattern, void 0);
          assert.strictEqual(options.disregardExcludeSettings, false);
          return Promise.resolve([URI.file(root + "/main.py")]);
        }
      }());
      const folders = [aWorkspaceFolderData(URI.file(root), 0)];
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders, name: "Test" }, new NullLogService());
      return ws.findFiles2(["**/main.py", "**/main.py/**"], {}, new ExtensionIdentifier("test")).then((uris) => {
        assert(mainThreadCalled, "mainThreadCalled");
        assert.equal(uris.length, 1);
        assert.equal(uris[0].toString(), URI.file(root + "/main.py").toString());
      });
    });
    test("with cancelled token", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token2) {
          mainThreadCalled = true;
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      const token = CancellationToken.Cancelled;
      return ws.findFiles2([new RelativePattern("/other/folder", "glob/**")], {}, new ExtensionIdentifier("test"), token).then(() => {
        assert(!mainThreadCalled, "!mainThreadCalled");
      });
    });
    test("RelativePattern exclude", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.disregardExcludeSettings, false);
          assert.strictEqual(options.excludePattern?.length, 1);
          assert.strictEqual(options.excludePattern[0].pattern, "glob/**");
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles2([""], { exclude: [new RelativePattern(root, "glob/**")] }, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    });
    test("useIgnoreFiles", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.disregardExcludeSettings, false);
          assert.strictEqual(options.disregardIgnoreFiles, false);
          assert.strictEqual(options.disregardGlobalIgnoreFiles, false);
          assert.strictEqual(options.disregardParentIgnoreFiles, false);
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles2([""], { useIgnoreFiles: { local: true, parent: true, global: true } }, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    });
    test("use symlinks", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.ignoreSymlinks, false);
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles2([""], { followSymlinks: true }, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    });
    test("caseInsensitive", () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        $startFileSearch(_includeFolder, options, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.ignoreGlobCase, true);
          return Promise.resolve(null);
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      return ws.findFiles2([""], { caseInsensitive: true }, new ExtensionIdentifier("test")).then(() => {
        assert(mainThreadCalled, "mainThreadCalled");
      });
    });
  });
  suite("findTextInFiles -", function() {
    test("no include", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token) {
          mainThreadCalled = true;
          assert.strictEqual(query.pattern, "foo");
          assert.strictEqual(folder, null);
          assert.strictEqual(options.includePattern, void 0);
          assert.strictEqual(options.excludePattern, void 0);
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      await ws.findTextInFiles({ pattern: "foo" }, {}, () => {
      }, new ExtensionIdentifier("test"));
      assert(mainThreadCalled, "mainThreadCalled");
    });
    test("string include", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token) {
          mainThreadCalled = true;
          assert.strictEqual(query.pattern, "foo");
          assert.strictEqual(folder, null);
          assert.strictEqual(options.includePattern, "**/files");
          assert.strictEqual(options.excludePattern, void 0);
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      await ws.findTextInFiles({ pattern: "foo" }, { include: "**/files" }, () => {
      }, new ExtensionIdentifier("test"));
      assert(mainThreadCalled, "mainThreadCalled");
    });
    test("RelativePattern include", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token) {
          mainThreadCalled = true;
          assert.strictEqual(query.pattern, "foo");
          assert.deepStrictEqual(URI.revive(folder).toString(), URI.file("/other/folder").toString());
          assert.strictEqual(options.includePattern, "glob/**");
          assert.strictEqual(options.excludePattern, void 0);
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      await ws.findTextInFiles({ pattern: "foo" }, { include: new RelativePattern("/other/folder", "glob/**") }, () => {
      }, new ExtensionIdentifier("test"));
      assert(mainThreadCalled, "mainThreadCalled");
    });
    test("with cancelled token", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token2) {
          mainThreadCalled = true;
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      const token = CancellationToken.Cancelled;
      await ws.findTextInFiles({ pattern: "foo" }, {}, () => {
      }, new ExtensionIdentifier("test"), token);
      assert(!mainThreadCalled, "!mainThreadCalled");
    });
    test("RelativePattern exclude", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token) {
          mainThreadCalled = true;
          assert.strictEqual(query.pattern, "foo");
          assert.deepStrictEqual(folder, null);
          assert.strictEqual(options.includePattern, void 0);
          assert.strictEqual(options.excludePattern?.length, 1);
          assert.strictEqual(options.excludePattern[0].pattern, "glob/**");
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      await ws.findTextInFiles({ pattern: "foo" }, { exclude: new RelativePattern("/other/folder", "glob/**") }, () => {
      }, new ExtensionIdentifier("test"));
      assert(mainThreadCalled, "mainThreadCalled");
    });
  });
  suite("findTextInFiles2 -", function() {
    test("no include", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token) {
          mainThreadCalled = true;
          assert.strictEqual(query.pattern, "foo");
          assert.strictEqual(folder, null);
          assert.strictEqual(options.includePattern, void 0);
          assert.strictEqual(options.excludePattern, void 0);
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      await ws.findTextInFiles2({ pattern: "foo" }, {}, new ExtensionIdentifier("test")).complete;
      assert(mainThreadCalled, "mainThreadCalled");
    });
    test("string include", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token) {
          mainThreadCalled = true;
          assert.strictEqual(query.pattern, "foo");
          assert.strictEqual(folder, null);
          assert.strictEqual(options.includePattern, "**/files");
          assert.strictEqual(options.excludePattern, void 0);
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      await ws.findTextInFiles2({ pattern: "foo" }, { include: ["**/files"] }, new ExtensionIdentifier("test")).complete;
      assert(mainThreadCalled, "mainThreadCalled");
    });
    test("RelativePattern include", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token) {
          mainThreadCalled = true;
          assert.strictEqual(query.pattern, "foo");
          assert.deepStrictEqual(URI.revive(folder).toString(), URI.file("/other/folder").toString());
          assert.strictEqual(options.includePattern, "glob/**");
          assert.strictEqual(options.excludePattern, void 0);
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      await ws.findTextInFiles2({ pattern: "foo" }, { include: [new RelativePattern("/other/folder", "glob/**")] }, new ExtensionIdentifier("test")).complete;
      assert(mainThreadCalled, "mainThreadCalled");
    });
    test("with cancelled token", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token2) {
          mainThreadCalled = true;
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      const token = CancellationToken.Cancelled;
      await ws.findTextInFiles2({ pattern: "foo" }, void 0, new ExtensionIdentifier("test"), token).complete;
      assert(!mainThreadCalled, "!mainThreadCalled");
    });
    test("RelativePattern exclude", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token) {
          mainThreadCalled = true;
          assert.strictEqual(query.pattern, "foo");
          assert.deepStrictEqual(folder, null);
          assert.strictEqual(options.includePattern, void 0);
          assert.strictEqual(options.excludePattern?.length, 1);
          assert.strictEqual(options.excludePattern[0].pattern, "glob/**");
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      await ws.findTextInFiles2({ pattern: "foo" }, { exclude: [new RelativePattern("/other/folder", "glob/**")] }, new ExtensionIdentifier("test")).complete;
      assert(mainThreadCalled, "mainThreadCalled");
    });
    test("caseInsensitive", async () => {
      const root = "/project/foo";
      const rpcProtocol = new TestRPCProtocol();
      let mainThreadCalled = false;
      rpcProtocol.set(MainContext.MainThreadWorkspace, new class extends mock() {
        async $startTextSearch(query, folder, options, requestId, token) {
          mainThreadCalled = true;
          assert.strictEqual(options.ignoreGlobCase, true);
          return null;
        }
      }());
      const ws = createExtHostWorkspace(rpcProtocol, { id: "foo", folders: [aWorkspaceFolderData(URI.file(root), 0)], name: "Test" }, new NullLogService());
      await ws.findTextInFiles2({ pattern: "foo" }, { caseInsensitive: true }, new ExtensionIdentifier("test")).complete;
      assert(mainThreadCalled, "mainThreadCalled");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RXb3Jrc3BhY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUZvbGRlckRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tYWluVGhyZWFkV29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElNYWluQ29udGV4dCwgSVdvcmtzcGFjZURhdGEsIE1haW5Db250ZXh0LCBJVGV4dFNlYXJjaENvbXBsZXRlLCBNYWluVGhyZWFkVGVsZW1ldHJ5U2hhcGUgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBSZWxhdGl2ZVBhdHRlcm4gfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IFRlc3RSUENQcm90b2NvbCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RJbml0RGF0YVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdEluaXREYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVF1ZXJ5QnVpbGRlck9wdGlvbnMsIElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vcXVlcnlCdWlsZGVyLmpzJztcbmltcG9ydCB7IElQYXR0ZXJuSW5mbyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IGlzTGludXgsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElFeHRIb3N0RmlsZVN5c3RlbUluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdEZpbGVTeXN0ZW1JbmZvLmpzJztcbmltcG9ydCB7IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24gYXMgZXh0ZW5zaW9uRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVVSSVRyYW5zZm9ybWVyU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VXJpVHJhbnNmb3JtZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRXhjbHVkZVNldHRpbmdPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2hFeHRUeXBlcy5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UobWFpbkNvbnRleHQ6IElNYWluQ29udGV4dCwgZGF0YTogSVdvcmtzcGFjZURhdGEsIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKTogRXh0SG9zdFdvcmtzcGFjZSB7XG5cdG1haW5Db250ZXh0LnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkVGVsZW1ldHJ5LCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRUZWxlbWV0cnlTaGFwZT4oKSB7XG5cdFx0b3ZlcnJpZGUgJHB1YmxpY0xvZzIoKTogdm9pZCB7IH1cblx0fSk7XG5cdGNvbnN0IHJlc3VsdCA9IG5ldyBFeHRIb3N0V29ya3NwYWNlKFxuXHRcdG5ldyBFeHRIb3N0UnBjU2VydmljZShtYWluQ29udGV4dCksXG5cdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdEluaXREYXRhU2VydmljZT4oKSB7IG92ZXJyaWRlIHdvcmtzcGFjZSA9IGRhdGE7IH0sXG5cdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvPigpIHsgb3ZlcnJpZGUgZ2V0Q2FwYWJpbGl0aWVzKCkgeyByZXR1cm4gaXNMaW51eCA/IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5QYXRoQ2FzZVNlbnNpdGl2ZSA6IHVuZGVmaW5lZDsgfSB9LFxuXHRcdGxvZ1NlcnZpY2UsXG5cdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVVJJVHJhbnNmb3JtZXJTZXJ2aWNlPigpIHsgfVxuXHQpO1xuXHRyZXN1bHQuJGluaXRpYWxpemVXb3Jrc3BhY2UoZGF0YSwgdHJ1ZSk7XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbnN1aXRlKCdFeHRIb3N0V29ya3NwYWNlJywgZnVuY3Rpb24gKCkge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGFzc2VydEFzUmVsYXRpdmVQYXRoKHdvcmtzcGFjZTogRXh0SG9zdFdvcmtzcGFjZSwgaW5wdXQ6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZywgaW5jbHVkZVdvcmtzcGFjZT86IGJvb2xlYW4pIHtcblx0XHRjb25zdCBhY3R1YWwgPSB3b3Jrc3BhY2UuZ2V0UmVsYXRpdmVQYXRoKGlucHV0LCBpbmNsdWRlV29ya3NwYWNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH1cblxuXHR0ZXN0KCdhc1JlbGF0aXZlUGF0aCcsICgpID0+IHtcblxuXHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShuZXcgVGVzdFJQQ1Byb3RvY29sKCksIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUoJy9Db2RpbmcvQXBwbGljYXRpb25zL05ld3NXb1dCb3QnKSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgod3MsICcvQ29kaW5nL0FwcGxpY2F0aW9ucy9OZXdzV29XQm90L2Jlcm5kL2Rhcy9icm90JywgJ2Jlcm5kL2Rhcy9icm90Jyk7XG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgod3MsICcvQXBwcy9EYXJ0UHViQ2FjaGUvaG9zdGVkL3B1Yi5kYXJ0bGFuZy5vcmcvY29udmVydC0yLjAuMS9saWIvc3JjL2hleC5kYXJ0Jyxcblx0XHRcdCcvQXBwcy9EYXJ0UHViQ2FjaGUvaG9zdGVkL3B1Yi5kYXJ0bGFuZy5vcmcvY29udmVydC0yLjAuMS9saWIvc3JjL2hleC5kYXJ0Jyk7XG5cblx0XHRhc3NlcnRBc1JlbGF0aXZlUGF0aCh3cywgJycsICcnKTtcblx0XHRhc3NlcnRBc1JlbGF0aXZlUGF0aCh3cywgJy9mb28vYmFyJywgJy9mb28vYmFyJyk7XG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgod3MsICdpbi9vdXQnLCAnaW4vb3V0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FzUmVsYXRpdmVQYXRoLCBzYW1lIHBhdGhzLCAjMTE0MDInLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgcm9vdCA9ICcvaG9tZS9hZXNjaGxpL3dvcmtzcGFjZXMvc2FtcGxlcy9kb2NrZXInO1xuXHRcdGNvbnN0IGlucHV0ID0gJy9ob21lL2Flc2NobGkvd29ya3NwYWNlcy9zYW1wbGVzL2RvY2tlcic7XG5cdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKG5ldyBUZXN0UlBDUHJvdG9jb2woKSwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgod3MsIGlucHV0LCBpbnB1dCk7XG5cblx0XHRjb25zdCBpbnB1dDIgPSAnL2hvbWUvYWVzY2hsaS93b3Jrc3BhY2VzL3NhbXBsZXMvZG9ja2VyL2EuZmlsZSc7XG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgod3MsIGlucHV0MiwgJ2EuZmlsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdhc1JlbGF0aXZlUGF0aCwgbm8gd29ya3NwYWNlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShuZXcgVGVzdFJQQ1Byb3RvY29sKCksIG51bGwhLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgod3MsICcnLCAnJyk7XG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgod3MsICcvZm9vL2JhcicsICcvZm9vL2JhcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdhc1JlbGF0aXZlUGF0aCwgbXVsdGlwbGUgZm9sZGVycycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UobmV3IFRlc3RSUENQcm90b2NvbCgpLCB7IGlkOiAnZm9vJywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKCcvQ29kaW5nL09uZScpLCAwKSwgYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUoJy9Db2RpbmcvVHdvJyksIDEpXSwgbmFtZTogJ1Rlc3QnIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRhc3NlcnRBc1JlbGF0aXZlUGF0aCh3cywgJy9Db2RpbmcvT25lL2ZpbGUudHh0JywgJ09uZS9maWxlLnR4dCcpO1xuXHRcdGFzc2VydEFzUmVsYXRpdmVQYXRoKHdzLCAnL0NvZGluZy9Ud28vZmlsZXMvb3V0LnR4dCcsICdUd28vZmlsZXMvb3V0LnR4dCcpO1xuXHRcdGFzc2VydEFzUmVsYXRpdmVQYXRoKHdzLCAnL0NvZGluZy9Ud28yL2ZpbGVzL291dC50eHQnLCAnL0NvZGluZy9Ud28yL2ZpbGVzL291dC50eHQnKTtcblx0fSk7XG5cblx0dGVzdCgnc2xpZ2h0bHkgaW5jb25zaXN0ZW50IGJlaGF2aW91ciBvZiBhc1JlbGF0aXZlUGF0aCBhbmQgZ2V0V29ya3NwYWNlRm9sZGVyLCAjMzE1NTMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbXJ3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UobmV3IFRlc3RSUENQcm90b2NvbCgpLCB7IGlkOiAnZm9vJywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKCcvQ29kaW5nL09uZScpLCAwKSwgYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUoJy9Db2RpbmcvVHdvJyksIDEpXSwgbmFtZTogJ1Rlc3QnIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGFzc2VydEFzUmVsYXRpdmVQYXRoKG1yd3MsICcvQ29kaW5nL09uZS9maWxlLnR4dCcsICdPbmUvZmlsZS50eHQnKTtcblx0XHRhc3NlcnRBc1JlbGF0aXZlUGF0aChtcndzLCAnL0NvZGluZy9PbmUvZmlsZS50eHQnLCAnT25lL2ZpbGUudHh0JywgdHJ1ZSk7XG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgobXJ3cywgJy9Db2RpbmcvT25lL2ZpbGUudHh0JywgJ2ZpbGUudHh0JywgZmFsc2UpO1xuXHRcdGFzc2VydEFzUmVsYXRpdmVQYXRoKG1yd3MsICcvQ29kaW5nL1R3by9maWxlcy9vdXQudHh0JywgJ1R3by9maWxlcy9vdXQudHh0Jyk7XG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgobXJ3cywgJy9Db2RpbmcvVHdvL2ZpbGVzL291dC50eHQnLCAnVHdvL2ZpbGVzL291dC50eHQnLCB0cnVlKTtcblx0XHRhc3NlcnRBc1JlbGF0aXZlUGF0aChtcndzLCAnL0NvZGluZy9Ud28vZmlsZXMvb3V0LnR4dCcsICdmaWxlcy9vdXQudHh0JywgZmFsc2UpO1xuXHRcdGFzc2VydEFzUmVsYXRpdmVQYXRoKG1yd3MsICcvQ29kaW5nL1R3bzIvZmlsZXMvb3V0LnR4dCcsICcvQ29kaW5nL1R3bzIvZmlsZXMvb3V0LnR4dCcpO1xuXHRcdGFzc2VydEFzUmVsYXRpdmVQYXRoKG1yd3MsICcvQ29kaW5nL1R3bzIvZmlsZXMvb3V0LnR4dCcsICcvQ29kaW5nL1R3bzIvZmlsZXMvb3V0LnR4dCcsIHRydWUpO1xuXHRcdGFzc2VydEFzUmVsYXRpdmVQYXRoKG1yd3MsICcvQ29kaW5nL1R3bzIvZmlsZXMvb3V0LnR4dCcsICcvQ29kaW5nL1R3bzIvZmlsZXMvb3V0LnR4dCcsIGZhbHNlKTtcblxuXHRcdGNvbnN0IHNyd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKG5ldyBUZXN0UlBDUHJvdG9jb2woKSwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZSgnL0NvZGluZy9PbmUnKSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGFzc2VydEFzUmVsYXRpdmVQYXRoKHNyd3MsICcvQ29kaW5nL09uZS9maWxlLnR4dCcsICdmaWxlLnR4dCcpO1xuXHRcdGFzc2VydEFzUmVsYXRpdmVQYXRoKHNyd3MsICcvQ29kaW5nL09uZS9maWxlLnR4dCcsICdmaWxlLnR4dCcsIGZhbHNlKTtcblx0XHRhc3NlcnRBc1JlbGF0aXZlUGF0aChzcndzLCAnL0NvZGluZy9PbmUvZmlsZS50eHQnLCAnT25lL2ZpbGUudHh0JywgdHJ1ZSk7XG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgoc3J3cywgJy9Db2RpbmcvVHdvMi9maWxlcy9vdXQudHh0JywgJy9Db2RpbmcvVHdvMi9maWxlcy9vdXQudHh0Jyk7XG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgoc3J3cywgJy9Db2RpbmcvVHdvMi9maWxlcy9vdXQudHh0JywgJy9Db2RpbmcvVHdvMi9maWxlcy9vdXQudHh0JywgdHJ1ZSk7XG5cdFx0YXNzZXJ0QXNSZWxhdGl2ZVBhdGgoc3J3cywgJy9Db2RpbmcvVHdvMi9maWxlcy9vdXQudHh0JywgJy9Db2RpbmcvVHdvMi9maWxlcy9vdXQudHh0JywgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRQYXRoLCBsZWdhY3knLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShuZXcgVGVzdFJQQ1Byb3RvY29sKCksIHsgaWQ6ICdmb28nLCBuYW1lOiAnVGVzdCcsIGZvbGRlcnM6IFtdIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0UGF0aCgpLCB1bmRlZmluZWQpO1xuXG5cdFx0d3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKG5ldyBUZXN0UlBDUHJvdG9jb2woKSwgbnVsbCEsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0UGF0aCgpLCB1bmRlZmluZWQpO1xuXG5cdFx0d3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKG5ldyBUZXN0UlBDUHJvdG9jb2woKSwgdW5kZWZpbmVkISwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRQYXRoKCksIHVuZGVmaW5lZCk7XG5cblx0XHR3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UobmV3IFRlc3RSUENQcm90b2NvbCgpLCB7IGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUoJ0ZvbGRlcicpLCAwKSwgYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUoJ0Fub3RoZXIvRm9sZGVyJyksIDEpXSB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmdldFBhdGgoKSEucmVwbGFjZSgvXFxcXC9nLCAnLycpLCAnL0ZvbGRlcicpO1xuXG5cdFx0d3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKG5ldyBUZXN0UlBDUHJvdG9jb2woKSwgeyBpZDogJ2ZvbycsIG5hbWU6ICdUZXN0JywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKCcvRm9sZGVyJyksIDApXSB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmdldFBhdGgoKSEucmVwbGFjZSgvXFxcXC9nLCAnLycpLCAnL0ZvbGRlcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdXb3Jrc3BhY2VGb2xkZXIgaGFzIG5hbWUgYW5kIGluZGV4JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShuZXcgVGVzdFJQQ1Byb3RvY29sKCksIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUoJy9Db2RpbmcvT25lJyksIDApLCBhV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZSgnL0NvZGluZy9Ud28nKSwgMSldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgW29uZSwgdHdvXSA9IHdzLmdldFdvcmtzcGFjZUZvbGRlcnMoKSE7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob25lLm5hbWUsICdPbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob25lLmluZGV4LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHdvLm5hbWUsICdUd28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHdvLmluZGV4LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q29udGFpbmluZ1dvcmtzcGFjZUZvbGRlcicsICgpID0+IHtcblx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UobmV3IFRlc3RSUENQcm90b2NvbCgpLCB7XG5cdFx0XHRpZDogJ2ZvbycsXG5cdFx0XHRuYW1lOiAnVGVzdCcsXG5cdFx0XHRmb2xkZXJzOiBbXG5cdFx0XHRcdGFXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKCcvQ29kaW5nL09uZScpLCAwKSxcblx0XHRcdFx0YVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUoJy9Db2RpbmcvVHdvJyksIDEpLFxuXHRcdFx0XHRhV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZSgnL0NvZGluZy9Ud28vTmVzdGVkJyksIDIpXG5cdFx0XHRdXG5cdFx0fSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0bGV0IGZvbGRlciA9IHdzLmdldFdvcmtzcGFjZUZvbGRlcihVUkkuZmlsZSgnL2Zvby9iYXInKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRlciwgdW5kZWZpbmVkKTtcblxuXHRcdGZvbGRlciA9IHdzLmdldFdvcmtzcGFjZUZvbGRlcihVUkkuZmlsZSgnL0NvZGluZy9PbmUvZmlsZS9wYXRoLnR4dCcpKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRlci5uYW1lLCAnT25lJyk7XG5cblx0XHRmb2xkZXIgPSB3cy5nZXRXb3Jrc3BhY2VGb2xkZXIoVVJJLmZpbGUoJy9Db2RpbmcvVHdvL2ZpbGUvcGF0aC50eHQnKSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkZXIubmFtZSwgJ1R3bycpO1xuXG5cdFx0Zm9sZGVyID0gd3MuZ2V0V29ya3NwYWNlRm9sZGVyKFVSSS5maWxlKCcvQ29kaW5nL1R3by9OZXN0JykpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGVyLm5hbWUsICdUd28nKTtcblxuXHRcdGZvbGRlciA9IHdzLmdldFdvcmtzcGFjZUZvbGRlcihVUkkuZmlsZSgnL0NvZGluZy9Ud28vTmVzdGVkL2ZpbGUnKSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkZXIubmFtZSwgJ05lc3RlZCcpO1xuXG5cdFx0Zm9sZGVyID0gd3MuZ2V0V29ya3NwYWNlRm9sZGVyKFVSSS5maWxlKCcvQ29kaW5nL1R3by9OZXN0ZWQvZicpKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRlci5uYW1lLCAnTmVzdGVkJyk7XG5cblx0XHRmb2xkZXIgPSB3cy5nZXRXb3Jrc3BhY2VGb2xkZXIoVVJJLmZpbGUoJy9Db2RpbmcvVHdvL05lc3RlZCcpLCB0cnVlKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRlci5uYW1lLCAnVHdvJyk7XG5cblx0XHRmb2xkZXIgPSB3cy5nZXRXb3Jrc3BhY2VGb2xkZXIoVVJJLmZpbGUoJy9Db2RpbmcvVHdvL05lc3RlZC8nKSwgdHJ1ZSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkZXIubmFtZSwgJ1R3bycpO1xuXG5cdFx0Zm9sZGVyID0gd3MuZ2V0V29ya3NwYWNlRm9sZGVyKFVSSS5maWxlKCcvQ29kaW5nL1R3by9OZXN0ZWQnKSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkZXIubmFtZSwgJ05lc3RlZCcpO1xuXG5cdFx0Zm9sZGVyID0gd3MuZ2V0V29ya3NwYWNlRm9sZGVyKFVSSS5maWxlKCcvQ29kaW5nL1R3by9OZXN0ZWQvJykpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGVyLm5hbWUsICdOZXN0ZWQnKTtcblxuXHRcdGZvbGRlciA9IHdzLmdldFdvcmtzcGFjZUZvbGRlcihVUkkuZmlsZSgnL0NvZGluZy9Ud28nKSwgdHJ1ZSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkZXIsIHVuZGVmaW5lZCk7XG5cblx0XHRmb2xkZXIgPSB3cy5nZXRXb3Jrc3BhY2VGb2xkZXIoVVJJLmZpbGUoJy9Db2RpbmcvVHdvJyksIGZhbHNlKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRlci5uYW1lLCAnVHdvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ011bHRpcm9vdCBjaGFuZ2UgZXZlbnQgc2hvdWxkIGhhdmUgYSBkZWx0YSwgIzI5NjQxJywgZnVuY3Rpb24gKGRvbmUpIHtcblx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UobmV3IFRlc3RSUENQcm90b2NvbCgpLCB7IGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbXSB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRsZXQgZmluaXNoZWQgPSBmYWxzZTtcblx0XHRjb25zdCBmaW5pc2ggPSAoZXJyb3I/OiBhbnkpID0+IHtcblx0XHRcdGlmICghZmluaXNoZWQpIHtcblx0XHRcdFx0ZmluaXNoZWQgPSB0cnVlO1xuXHRcdFx0XHRkb25lKGVycm9yKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0bGV0IHN1YiA9IHdzLm9uRGlkQ2hhbmdlV29ya3NwYWNlKGUgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlLmFkZGVkLCBbXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZS5yZW1vdmVkLCBbXSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRmaW5pc2goZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHdzLiRhY2NlcHRXb3Jrc3BhY2VEYXRhKHsgaWQ6ICdmb28nLCBuYW1lOiAnVGVzdCcsIGZvbGRlcnM6IFtdIH0pO1xuXHRcdHN1Yi5kaXNwb3NlKCk7XG5cblx0XHRzdWIgPSB3cy5vbkRpZENoYW5nZVdvcmtzcGFjZShlID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZS5yZW1vdmVkLCBbXSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmFkZGVkLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmFkZGVkWzBdLnVyaS50b1N0cmluZygpLCAnZm9vOmJhcicpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0ZmluaXNoKGVycm9yKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR3cy4kYWNjZXB0V29ya3NwYWNlRGF0YSh7IGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyJyksIDApXSB9KTtcblx0XHRzdWIuZGlzcG9zZSgpO1xuXG5cdFx0c3ViID0gd3Mub25EaWRDaGFuZ2VXb3Jrc3BhY2UoZSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGUucmVtb3ZlZCwgW10pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5hZGRlZC5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5hZGRlZFswXS51cmkudG9TdHJpbmcoKSwgJ2ZvbzpiYXIyJyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRmaW5pc2goZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHdzLiRhY2NlcHRXb3Jrc3BhY2VEYXRhKHsgaWQ6ICdmb28nLCBuYW1lOiAnVGVzdCcsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXInKSwgMCksIGFXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcjInKSwgMSldIH0pO1xuXHRcdHN1Yi5kaXNwb3NlKCk7XG5cblx0XHRzdWIgPSB3cy5vbkRpZENoYW5nZVdvcmtzcGFjZShlID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLnJlbW92ZWQubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUucmVtb3ZlZFswXS51cmkudG9TdHJpbmcoKSwgJ2ZvbzpiYXInKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUucmVtb3ZlZFsxXS51cmkudG9TdHJpbmcoKSwgJ2ZvbzpiYXIyJyk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUuYWRkZWQubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUuYWRkZWRbMF0udXJpLnRvU3RyaW5nKCksICdmb286YmFyMycpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0ZmluaXNoKGVycm9yKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR3cy4kYWNjZXB0V29ya3NwYWNlRGF0YSh7IGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyMycpLCAwKV0gfSk7XG5cdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRmaW5pc2goKTtcblx0fSk7XG5cblx0dGVzdCgnTXVsdGlyb290IGNoYW5nZSBrZWVwcyBleGlzdGluZyB3b3Jrc3BhY2VzIGxpdmUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKG5ldyBUZXN0UlBDUHJvdG9jb2woKSwgeyBpZDogJ2ZvbycsIG5hbWU6ICdUZXN0JywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcicpLCAwKV0gfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgZmlyc3RGb2xkZXIgPSB3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzBdO1xuXHRcdHdzLiRhY2NlcHRXb3Jrc3BhY2VEYXRhKHsgaWQ6ICdmb28nLCBuYW1lOiAnVGVzdCcsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXIyJyksIDApLCBhV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXInKSwgMSwgJ3JlbmFtZWQnKV0gfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVsxXSwgZmlyc3RGb2xkZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdEZvbGRlci5pbmRleCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Rm9sZGVyLm5hbWUsICdyZW5hbWVkJyk7XG5cblx0XHR3cy4kYWNjZXB0V29ya3NwYWNlRGF0YSh7IGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyMycpLCAwKSwgYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyMicpLCAxKSwgYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyJyksIDIpXSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVsyXSwgZmlyc3RGb2xkZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdEZvbGRlci5pbmRleCwgMik7XG5cblx0XHR3cy4kYWNjZXB0V29ya3NwYWNlRGF0YSh7IGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyMycpLCAwKV0gfSk7XG5cdFx0d3MuJGFjY2VwdFdvcmtzcGFjZURhdGEoeyBpZDogJ2ZvbycsIG5hbWU6ICdUZXN0JywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcjMnKSwgMCksIGFXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcicpLCAxKV0gfSk7XG5cblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoZmlyc3RGb2xkZXIsIHdzLndvcmtzcGFjZSEuZm9sZGVyc1swXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZVdvcmtzcGFjZUZvbGRlcnMgLSBpbnZhbGlkIGFyZ3VtZW50cycsIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKG5ldyBUZXN0UlBDUHJvdG9jb2woKSwgeyBpZDogJ2ZvbycsIG5hbWU6ICdUZXN0JywgZm9sZGVyczogW10gfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhbHNlLCB3cy51cGRhdGVXb3Jrc3BhY2VGb2xkZXJzKGV4dGVuc2lvbkRlc2NyaXB0b3IsIG51bGwhLCBudWxsISkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWxzZSwgd3MudXBkYXRlV29ya3NwYWNlRm9sZGVycyhleHRlbnNpb25EZXNjcmlwdG9yLCAwLCAwKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhbHNlLCB3cy51cGRhdGVXb3Jrc3BhY2VGb2xkZXJzKGV4dGVuc2lvbkRlc2NyaXB0b3IsIDAsIDEpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFsc2UsIHdzLnVwZGF0ZVdvcmtzcGFjZUZvbGRlcnMoZXh0ZW5zaW9uRGVzY3JpcHRvciwgMSwgMCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWxzZSwgd3MudXBkYXRlV29ya3NwYWNlRm9sZGVycyhleHRlbnNpb25EZXNjcmlwdG9yLCAtMSwgMCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWxzZSwgd3MudXBkYXRlV29ya3NwYWNlRm9sZGVycyhleHRlbnNpb25EZXNjcmlwdG9yLCAtMSwgLTEpKTtcblxuXHRcdHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShuZXcgVGVzdFJQQ1Byb3RvY29sKCksIHsgaWQ6ICdmb28nLCBuYW1lOiAnVGVzdCcsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXInKSwgMCldIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWxzZSwgd3MudXBkYXRlV29ya3NwYWNlRm9sZGVycyhleHRlbnNpb25EZXNjcmlwdG9yLCAxLCAxKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhbHNlLCB3cy51cGRhdGVXb3Jrc3BhY2VGb2xkZXJzKGV4dGVuc2lvbkRlc2NyaXB0b3IsIDAsIDIpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFsc2UsIHdzLnVwZGF0ZVdvcmtzcGFjZUZvbGRlcnMoZXh0ZW5zaW9uRGVzY3JpcHRvciwgMCwgMSwgYXNVcGRhdGVXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcicpKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVXb3Jrc3BhY2VGb2xkZXJzIC0gdmFsaWQgYXJndW1lbnRzJywgZnVuY3Rpb24gKGRvbmUpIHtcblx0XHRsZXQgZmluaXNoZWQgPSBmYWxzZTtcblx0XHRjb25zdCBmaW5pc2ggPSAoZXJyb3I/OiBhbnkpID0+IHtcblx0XHRcdGlmICghZmluaXNoZWQpIHtcblx0XHRcdFx0ZmluaXNoZWQgPSB0cnVlO1xuXHRcdFx0XHRkb25lKGVycm9yKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcHJvdG9jb2w6IElNYWluQ29udGV4dCA9IHtcblx0XHRcdGdldFByb3h5OiAoKSA9PiB7IHJldHVybiB1bmRlZmluZWQhOyB9LFxuXHRcdFx0c2V0OiAoKSA9PiB7IHJldHVybiB1bmRlZmluZWQhOyB9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0YXNzZXJ0UmVnaXN0ZXJlZDogKCkgPT4geyB9LFxuXHRcdFx0ZHJhaW46ICgpID0+IHsgcmV0dXJuIHVuZGVmaW5lZCE7IH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShwcm90b2NvbCwgeyBpZDogJ2ZvbycsIG5hbWU6ICdUZXN0JywgZm9sZGVyczogW10gfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0Ly9cblx0XHQvLyBBZGQgb25lIGZvbGRlclxuXHRcdC8vXG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJ1ZSwgd3MudXBkYXRlV29ya3NwYWNlRm9sZGVycyhleHRlbnNpb25EZXNjcmlwdG9yLCAwLCAwLCBhc1VwZGF0ZVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyJykpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDEsIHdzLndvcmtzcGFjZSEuZm9sZGVycy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy53b3Jrc3BhY2UhLmZvbGRlcnNbMF0udXJpLnRvU3RyaW5nKCksIFVSSS5wYXJzZSgnZm9vOmJhcicpLnRvU3RyaW5nKCkpO1xuXG5cdFx0Y29uc3QgZmlyc3RBZGRlZEZvbGRlciA9IHdzLmdldFdvcmtzcGFjZUZvbGRlcnMoKSFbMF07XG5cblx0XHRsZXQgZ290RXZlbnQgPSBmYWxzZTtcblx0XHRsZXQgc3ViID0gd3Mub25EaWRDaGFuZ2VXb3Jrc3BhY2UoZSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGUucmVtb3ZlZCwgW10pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5hZGRlZC5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5hZGRlZFswXS51cmkudG9TdHJpbmcoKSwgJ2ZvbzpiYXInKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUuYWRkZWRbMF0sIGZpcnN0QWRkZWRGb2xkZXIpOyAvLyB2ZXJpZnkgb2JqZWN0IGlzIHN0aWxsIGxpdmVcblx0XHRcdFx0Z290RXZlbnQgPSB0cnVlO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0ZmluaXNoKGVycm9yKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR3cy4kYWNjZXB0V29ya3NwYWNlRGF0YSh7IGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyJyksIDApXSB9KTsgLy8gc2ltdWxhdGUgYWNrbm93bGVkZ2VtZW50IGZyb20gbWFpbiBzaWRlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdvdEV2ZW50LCB0cnVlKTtcblx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzBdLCBmaXJzdEFkZGVkRm9sZGVyKTsgLy8gdmVyaWZ5IG9iamVjdCBpcyBzdGlsbCBsaXZlXG5cblx0XHQvL1xuXHRcdC8vIEFkZCB0d28gbW9yZSBmb2xkZXJzXG5cdFx0Ly9cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVlLCB3cy51cGRhdGVXb3Jrc3BhY2VGb2xkZXJzKGV4dGVuc2lvbkRlc2NyaXB0b3IsIDEsIDAsIGFzVXBkYXRlV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXIxJykpLCBhc1VwZGF0ZVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyMicpKSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgzLCB3cy53b3Jrc3BhY2UhLmZvbGRlcnMubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3Mud29ya3NwYWNlIS5mb2xkZXJzWzBdLnVyaS50b1N0cmluZygpLCBVUkkucGFyc2UoJ2ZvbzpiYXInKS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3Mud29ya3NwYWNlIS5mb2xkZXJzWzFdLnVyaS50b1N0cmluZygpLCBVUkkucGFyc2UoJ2ZvbzpiYXIxJykudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLndvcmtzcGFjZSEuZm9sZGVyc1syXS51cmkudG9TdHJpbmcoKSwgVVJJLnBhcnNlKCdmb286YmFyMicpLnRvU3RyaW5nKCkpO1xuXG5cdFx0Y29uc3Qgc2Vjb25kQWRkZWRGb2xkZXIgPSB3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzFdO1xuXHRcdGNvbnN0IHRoaXJkQWRkZWRGb2xkZXIgPSB3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzJdO1xuXG5cdFx0Z290RXZlbnQgPSBmYWxzZTtcblx0XHRzdWIgPSB3cy5vbkRpZENoYW5nZVdvcmtzcGFjZShlID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZS5yZW1vdmVkLCBbXSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmFkZGVkLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmFkZGVkWzBdLnVyaS50b1N0cmluZygpLCAnZm9vOmJhcjEnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUuYWRkZWRbMV0udXJpLnRvU3RyaW5nKCksICdmb286YmFyMicpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5hZGRlZFswXSwgc2Vjb25kQWRkZWRGb2xkZXIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5hZGRlZFsxXSwgdGhpcmRBZGRlZEZvbGRlcik7XG5cdFx0XHRcdGdvdEV2ZW50ID0gdHJ1ZTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGZpbmlzaChlcnJvcik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0d3MuJGFjY2VwdFdvcmtzcGFjZURhdGEoeyBpZDogJ2ZvbycsIG5hbWU6ICdUZXN0JywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcicpLCAwKSwgYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyMScpLCAxKSwgYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyMicpLCAyKV0gfSk7IC8vIHNpbXVsYXRlIGFja25vd2xlZGdlbWVudCBmcm9tIG1haW4gc2lkZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnb3RFdmVudCwgdHJ1ZSk7XG5cdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVswXSwgZmlyc3RBZGRlZEZvbGRlcik7IC8vIHZlcmlmeSBvYmplY3QgaXMgc3RpbGwgbGl2ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzFdLCBzZWNvbmRBZGRlZEZvbGRlcik7IC8vIHZlcmlmeSBvYmplY3QgaXMgc3RpbGwgbGl2ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzJdLCB0aGlyZEFkZGVkRm9sZGVyKTsgLy8gdmVyaWZ5IG9iamVjdCBpcyBzdGlsbCBsaXZlXG5cblx0XHQvL1xuXHRcdC8vIFJlbW92ZSBvbmUgZm9sZGVyXG5cdFx0Ly9cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVlLCB3cy51cGRhdGVXb3Jrc3BhY2VGb2xkZXJzKGV4dGVuc2lvbkRlc2NyaXB0b3IsIDIsIDEpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMiwgd3Mud29ya3NwYWNlIS5mb2xkZXJzLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLndvcmtzcGFjZSEuZm9sZGVyc1swXS51cmkudG9TdHJpbmcoKSwgVVJJLnBhcnNlKCdmb286YmFyJykudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLndvcmtzcGFjZSEuZm9sZGVyc1sxXS51cmkudG9TdHJpbmcoKSwgVVJJLnBhcnNlKCdmb286YmFyMScpLnRvU3RyaW5nKCkpO1xuXG5cdFx0Z290RXZlbnQgPSBmYWxzZTtcblx0XHRzdWIgPSB3cy5vbkRpZENoYW5nZVdvcmtzcGFjZShlID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZS5hZGRlZCwgW10pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5yZW1vdmVkLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLnJlbW92ZWRbMF0sIHRoaXJkQWRkZWRGb2xkZXIpO1xuXHRcdFx0XHRnb3RFdmVudCA9IHRydWU7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRmaW5pc2goZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHdzLiRhY2NlcHRXb3Jrc3BhY2VEYXRhKHsgaWQ6ICdmb28nLCBuYW1lOiAnVGVzdCcsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXInKSwgMCksIGFXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcjEnKSwgMSldIH0pOyAvLyBzaW11bGF0ZSBhY2tub3dsZWRnZW1lbnQgZnJvbSBtYWluIHNpZGVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ290RXZlbnQsIHRydWUpO1xuXHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmdldFdvcmtzcGFjZUZvbGRlcnMoKSFbMF0sIGZpcnN0QWRkZWRGb2xkZXIpOyAvLyB2ZXJpZnkgb2JqZWN0IGlzIHN0aWxsIGxpdmVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVsxXSwgc2Vjb25kQWRkZWRGb2xkZXIpOyAvLyB2ZXJpZnkgb2JqZWN0IGlzIHN0aWxsIGxpdmVcblxuXHRcdC8vXG5cdFx0Ly8gUmVuYW1lIGZvbGRlclxuXHRcdC8vXG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJ1ZSwgd3MudXBkYXRlV29ya3NwYWNlRm9sZGVycyhleHRlbnNpb25EZXNjcmlwdG9yLCAwLCAyLCBhc1VwZGF0ZVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyJyksICdyZW5hbWVkIDEnKSwgYXNVcGRhdGVXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcjEnKSwgJ3JlbmFtZWQgMicpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDIsIHdzLndvcmtzcGFjZSEuZm9sZGVycy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy53b3Jrc3BhY2UhLmZvbGRlcnNbMF0udXJpLnRvU3RyaW5nKCksIFVSSS5wYXJzZSgnZm9vOmJhcicpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy53b3Jrc3BhY2UhLmZvbGRlcnNbMV0udXJpLnRvU3RyaW5nKCksIFVSSS5wYXJzZSgnZm9vOmJhcjEnKS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3Mud29ya3NwYWNlIS5mb2xkZXJzWzBdLm5hbWUsICdyZW5hbWVkIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3Mud29ya3NwYWNlIS5mb2xkZXJzWzFdLm5hbWUsICdyZW5hbWVkIDInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVswXS5uYW1lLCAncmVuYW1lZCAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmdldFdvcmtzcGFjZUZvbGRlcnMoKSFbMV0ubmFtZSwgJ3JlbmFtZWQgMicpO1xuXG5cdFx0Z290RXZlbnQgPSBmYWxzZTtcblx0XHRzdWIgPSB3cy5vbkRpZENoYW5nZVdvcmtzcGFjZShlID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZS5hZGRlZCwgW10pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5yZW1vdmVkLmxlbmd0aCwgMCk7XG5cdFx0XHRcdGdvdEV2ZW50ID0gdHJ1ZTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGZpbmlzaChlcnJvcik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0d3MuJGFjY2VwdFdvcmtzcGFjZURhdGEoeyBpZDogJ2ZvbycsIG5hbWU6ICdUZXN0JywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcicpLCAwLCAncmVuYW1lZCAxJyksIGFXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcjEnKSwgMSwgJ3JlbmFtZWQgMicpXSB9KTsgLy8gc2ltdWxhdGUgYWNrbm93bGVkZ2VtZW50IGZyb20gbWFpbiBzaWRlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdvdEV2ZW50LCB0cnVlKTtcblx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzBdLCBmaXJzdEFkZGVkRm9sZGVyKTsgLy8gdmVyaWZ5IG9iamVjdCBpcyBzdGlsbCBsaXZlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmdldFdvcmtzcGFjZUZvbGRlcnMoKSFbMV0sIHNlY29uZEFkZGVkRm9sZGVyKTsgLy8gdmVyaWZ5IG9iamVjdCBpcyBzdGlsbCBsaXZlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLndvcmtzcGFjZSEuZm9sZGVyc1swXS5uYW1lLCAncmVuYW1lZCAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLndvcmtzcGFjZSEuZm9sZGVyc1sxXS5uYW1lLCAncmVuYW1lZCAyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmdldFdvcmtzcGFjZUZvbGRlcnMoKSFbMF0ubmFtZSwgJ3JlbmFtZWQgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzFdLm5hbWUsICdyZW5hbWVkIDInKTtcblxuXHRcdC8vXG5cdFx0Ly8gQWRkIGFuZCByZW1vdmUgZm9sZGVyc1xuXHRcdC8vXG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJ1ZSwgd3MudXBkYXRlV29ya3NwYWNlRm9sZGVycyhleHRlbnNpb25EZXNjcmlwdG9yLCAwLCAyLCBhc1VwZGF0ZVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyMycpKSwgYXNVcGRhdGVXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcjQnKSkpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMiwgd3Mud29ya3NwYWNlIS5mb2xkZXJzLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLndvcmtzcGFjZSEuZm9sZGVyc1swXS51cmkudG9TdHJpbmcoKSwgVVJJLnBhcnNlKCdmb286YmFyMycpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy53b3Jrc3BhY2UhLmZvbGRlcnNbMV0udXJpLnRvU3RyaW5nKCksIFVSSS5wYXJzZSgnZm9vOmJhcjQnKS50b1N0cmluZygpKTtcblxuXHRcdGNvbnN0IGZvdXJ0aEFkZGVkRm9sZGVyID0gd3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVswXTtcblx0XHRjb25zdCBmaWZ0aEFkZGVkRm9sZGVyID0gd3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVsxXTtcblxuXHRcdGdvdEV2ZW50ID0gZmFsc2U7XG5cdFx0c3ViID0gd3Mub25EaWRDaGFuZ2VXb3Jrc3BhY2UoZSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5hZGRlZC5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5hZGRlZFswXSwgZm91cnRoQWRkZWRGb2xkZXIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5hZGRlZFsxXSwgZmlmdGhBZGRlZEZvbGRlcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLnJlbW92ZWQubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUucmVtb3ZlZFswXSwgZmlyc3RBZGRlZEZvbGRlcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLnJlbW92ZWRbMV0sIHNlY29uZEFkZGVkRm9sZGVyKTtcblx0XHRcdFx0Z290RXZlbnQgPSB0cnVlO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0ZmluaXNoKGVycm9yKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR3cy4kYWNjZXB0V29ya3NwYWNlRGF0YSh7IGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyMycpLCAwKSwgYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyNCcpLCAxKV0gfSk7IC8vIHNpbXVsYXRlIGFja25vd2xlZGdlbWVudCBmcm9tIG1haW4gc2lkZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnb3RFdmVudCwgdHJ1ZSk7XG5cdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVswXSwgZm91cnRoQWRkZWRGb2xkZXIpOyAvLyB2ZXJpZnkgb2JqZWN0IGlzIHN0aWxsIGxpdmVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVsxXSwgZmlmdGhBZGRlZEZvbGRlcik7IC8vIHZlcmlmeSBvYmplY3QgaXMgc3RpbGwgbGl2ZVxuXG5cdFx0Ly9cblx0XHQvLyBTd2FwIGZvbGRlcnNcblx0XHQvL1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydWUsIHdzLnVwZGF0ZVdvcmtzcGFjZUZvbGRlcnMoZXh0ZW5zaW9uRGVzY3JpcHRvciwgMCwgMiwgYXNVcGRhdGVXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcjQnKSksIGFzVXBkYXRlV29ya3NwYWNlRm9sZGVyRGF0YShVUkkucGFyc2UoJ2ZvbzpiYXIzJykpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDIsIHdzLndvcmtzcGFjZSEuZm9sZGVycy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy53b3Jrc3BhY2UhLmZvbGRlcnNbMF0udXJpLnRvU3RyaW5nKCksIFVSSS5wYXJzZSgnZm9vOmJhcjQnKS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3Mud29ya3NwYWNlIS5mb2xkZXJzWzFdLnVyaS50b1N0cmluZygpLCBVUkkucGFyc2UoJ2ZvbzpiYXIzJykudG9TdHJpbmcoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVswXSwgZmlmdGhBZGRlZEZvbGRlcik7IC8vIHZlcmlmeSBvYmplY3QgaXMgc3RpbGwgbGl2ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzFdLCBmb3VydGhBZGRlZEZvbGRlcik7IC8vIHZlcmlmeSBvYmplY3QgaXMgc3RpbGwgbGl2ZVxuXG5cdFx0Z290RXZlbnQgPSBmYWxzZTtcblx0XHRzdWIgPSB3cy5vbkRpZENoYW5nZVdvcmtzcGFjZShlID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmFkZGVkLmxlbmd0aCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLnJlbW92ZWQubGVuZ3RoLCAwKTtcblx0XHRcdFx0Z290RXZlbnQgPSB0cnVlO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0ZmluaXNoKGVycm9yKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR3cy4kYWNjZXB0V29ya3NwYWNlRGF0YSh7IGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyNCcpLCAwKSwgYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyMycpLCAxKV0gfSk7IC8vIHNpbXVsYXRlIGFja25vd2xlZGdlbWVudCBmcm9tIG1haW4gc2lkZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnb3RFdmVudCwgdHJ1ZSk7XG5cdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVswXSwgZmlmdGhBZGRlZEZvbGRlcik7IC8vIHZlcmlmeSBvYmplY3QgaXMgc3RpbGwgbGl2ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkhWzFdLCBmb3VydGhBZGRlZEZvbGRlcik7IC8vIHZlcmlmeSBvYmplY3QgaXMgc3RpbGwgbGl2ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWZ0aEFkZGVkRm9sZGVyLmluZGV4LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91cnRoQWRkZWRGb2xkZXIuaW5kZXgsIDEpO1xuXG5cdFx0Ly9cblx0XHQvLyBBZGQgb25lIGZvbGRlciBhZnRlciB0aGUgb3RoZXIgd2l0aG91dCB3YWl0aW5nIGZvciBjb25maXJtYXRpb24gKG5vdCBzdXBwb3J0ZWQgY3VycmVudGx5KVxuXHRcdC8vXG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJ1ZSwgd3MudXBkYXRlV29ya3NwYWNlRm9sZGVycyhleHRlbnNpb25EZXNjcmlwdG9yLCAyLCAwLCBhc1VwZGF0ZVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLnBhcnNlKCdmb286YmFyNScpKSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDMsIHdzLndvcmtzcGFjZSEuZm9sZGVycy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy53b3Jrc3BhY2UhLmZvbGRlcnNbMF0udXJpLnRvU3RyaW5nKCksIFVSSS5wYXJzZSgnZm9vOmJhcjQnKS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3Mud29ya3NwYWNlIS5mb2xkZXJzWzFdLnVyaS50b1N0cmluZygpLCBVUkkucGFyc2UoJ2ZvbzpiYXIzJykudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLndvcmtzcGFjZSEuZm9sZGVyc1syXS51cmkudG9TdHJpbmcoKSwgVVJJLnBhcnNlKCdmb286YmFyNScpLnRvU3RyaW5nKCkpO1xuXG5cdFx0Y29uc3Qgc2l4dGhBZGRlZEZvbGRlciA9IHdzLmdldFdvcmtzcGFjZUZvbGRlcnMoKSFbMl07XG5cblx0XHRnb3RFdmVudCA9IGZhbHNlO1xuXHRcdHN1YiA9IHdzLm9uRGlkQ2hhbmdlV29ya3NwYWNlKGUgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUuYWRkZWQubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUuYWRkZWRbMF0sIHNpeHRoQWRkZWRGb2xkZXIpO1xuXHRcdFx0XHRnb3RFdmVudCA9IHRydWU7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRmaW5pc2goZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHdzLiRhY2NlcHRXb3Jrc3BhY2VEYXRhKHtcblx0XHRcdGlkOiAnZm9vJywgbmFtZTogJ1Rlc3QnLCBmb2xkZXJzOiBbXG5cdFx0XHRcdGFXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcjQnKSwgMCksXG5cdFx0XHRcdGFXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcjMnKSwgMSksXG5cdFx0XHRcdGFXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5wYXJzZSgnZm9vOmJhcjUnKSwgMilcblx0XHRcdF1cblx0XHR9KTsgLy8gc2ltdWxhdGUgYWNrbm93bGVkZ2VtZW50IGZyb20gbWFpbiBzaWRlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdvdEV2ZW50LCB0cnVlKTtcblx0XHRzdWIuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmdldFdvcmtzcGFjZUZvbGRlcnMoKSFbMF0sIGZpZnRoQWRkZWRGb2xkZXIpOyAvLyB2ZXJpZnkgb2JqZWN0IGlzIHN0aWxsIGxpdmVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVsxXSwgZm91cnRoQWRkZWRGb2xkZXIpOyAvLyB2ZXJpZnkgb2JqZWN0IGlzIHN0aWxsIGxpdmVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZ2V0V29ya3NwYWNlRm9sZGVycygpIVsyXSwgc2l4dGhBZGRlZEZvbGRlcik7IC8vIHZlcmlmeSBvYmplY3QgaXMgc3RpbGwgbGl2ZVxuXG5cdFx0ZmluaXNoKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ011bHRpcm9vdCBjaGFuZ2UgZXZlbnQgaXMgaW1tdXRhYmxlJywgZnVuY3Rpb24gKGRvbmUpIHtcblx0XHRsZXQgZmluaXNoZWQgPSBmYWxzZTtcblx0XHRjb25zdCBmaW5pc2ggPSAoZXJyb3I/OiBhbnkpID0+IHtcblx0XHRcdGlmICghZmluaXNoZWQpIHtcblx0XHRcdFx0ZmluaXNoZWQgPSB0cnVlO1xuXHRcdFx0XHRkb25lKGVycm9yKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKG5ldyBUZXN0UlBDUHJvdG9jb2woKSwgeyBpZDogJ2ZvbycsIG5hbWU6ICdUZXN0JywgZm9sZGVyczogW10gfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHN1YiA9IHdzLm9uRGlkQ2hhbmdlV29ya3NwYWNlKGUgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdFx0KDxhbnk+ZSkuYWRkZWQgPSBbXTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdC8vIGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHQvLyBcdCg8YW55PmUuYWRkZWQpWzBdID0gbnVsbDtcblx0XHRcdFx0Ly8gfSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRmaW5pc2goZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHdzLiRhY2NlcHRXb3Jrc3BhY2VEYXRhKHsgaWQ6ICdmb28nLCBuYW1lOiAnVGVzdCcsIGZvbGRlcnM6IFtdIH0pO1xuXHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0ZmluaXNoKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2B2c2NvZGUud29ya3NwYWNlLmdldFdvcmtzcGFjZUZvbGRlcihmaWxlKWAgZG9uXFwndCByZXR1cm4gd29ya3NwYWNlIGZvbGRlciB3aGVuIGZpbGUgb3BlbiBmcm9tIGNvbW1hbmQgbGluZS4gIzM2MjIxJywgZnVuY3Rpb24gKCkge1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblxuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKG5ldyBUZXN0UlBDUHJvdG9jb2woKSwge1xuXHRcdFx0XHRpZDogJ2ZvbycsIG5hbWU6ICdUZXN0JywgZm9sZGVyczogW1xuXHRcdFx0XHRcdGFXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKCdjOi9Vc2Vycy9tYXJlay9EZXNrdG9wL3ZzY190ZXN0LycpLCAwKVxuXHRcdFx0XHRdXG5cdFx0XHR9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRcdGFzc2VydC5vayh3cy5nZXRXb3Jrc3BhY2VGb2xkZXIoVVJJLmZpbGUoJ2M6L1VzZXJzL21hcmVrL0Rlc2t0b3AvdnNjX3Rlc3QvYS50eHQnKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHdzLmdldFdvcmtzcGFjZUZvbGRlcihVUkkuZmlsZSgnQzovVXNlcnMvbWFyZWsvRGVza3RvcC92c2NfdGVzdC9iLnR4dCcpKSk7XG5cdFx0fVxuXHR9KTtcblxuXHRmdW5jdGlvbiBhV29ya3NwYWNlRm9sZGVyRGF0YSh1cmk6IFVSSSwgaW5kZXg6IG51bWJlciwgbmFtZTogc3RyaW5nID0gJycpOiBJV29ya3NwYWNlRm9sZGVyRGF0YSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVyaSxcblx0XHRcdGluZGV4LFxuXHRcdFx0bmFtZTogbmFtZSB8fCBiYXNlbmFtZSh1cmkucGF0aClcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gYXNVcGRhdGVXb3Jrc3BhY2VGb2xkZXJEYXRhKHVyaTogVVJJLCBuYW1lPzogc3RyaW5nKTogeyB1cmk6IFVSSTsgbmFtZT86IHN0cmluZyB9IHtcblx0XHRyZXR1cm4geyB1cmksIG5hbWUgfTtcblx0fVxuXG5cdHN1aXRlKCdmaW5kRmlsZXMgLScsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0KCdzdHJpbmcgaW5jbHVkZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlICRzdGFydEZpbGVTZWFyY2goX2luY2x1ZGVGb2xkZXI6IFVyaUNvbXBvbmVudHMgfCBudWxsLCBvcHRpb25zOiBJRmlsZVF1ZXJ5QnVpbGRlck9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10gfCBudWxsPiB7XG5cdFx0XHRcdFx0bWFpblRocmVhZENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuaW5jbHVkZVBhdHRlcm4sICdmb28nKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoX2luY2x1ZGVGb2xkZXIsIG51bGwpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVQYXR0ZXJuLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmRpc3JlZ2FyZEV4Y2x1ZGVTZXR0aW5ncywgZmFsc2UpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLm1heFJlc3VsdHMsIDEwKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKHJwY1Byb3RvY29sLCB7IGlkOiAnZm9vJywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKHJvb3QpLCAwKV0sIG5hbWU6ICdUZXN0JyB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRyZXR1cm4gd3MuZmluZEZpbGVzKCdmb28nLCB1bmRlZmluZWQsIDEwLCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpKS50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0KG1haW5UaHJlYWRDYWxsZWQsICdtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGZ1bmN0aW9uIHRlc3RGaW5kRmlsZXNJbmNsdWRlKHBhdHRlcm46IFJlbGF0aXZlUGF0dGVybikge1xuXHRcdFx0Y29uc3Qgcm9vdCA9ICcvcHJvamVjdC9mb28nO1xuXHRcdFx0Y29uc3QgcnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cblx0XHRcdGxldCBtYWluVGhyZWFkQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZFdvcmtzcGFjZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkV29ya3NwYWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgJHN0YXJ0RmlsZVNlYXJjaChfaW5jbHVkZUZvbGRlcjogVXJpQ29tcG9uZW50cyB8IG51bGwsIG9wdGlvbnM6IElGaWxlUXVlcnlCdWlsZGVyT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXSB8IG51bGw+IHtcblx0XHRcdFx0XHRtYWluVGhyZWFkQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5pbmNsdWRlUGF0dGVybiwgJ2dsb2IvKionKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKF9pbmNsdWRlRm9sZGVyID8gVVJJLmZyb20oX2luY2x1ZGVGb2xkZXIpLnRvSlNPTigpIDogbnVsbCwgVVJJLmZpbGUoJy9vdGhlci9mb2xkZXInKS50b0pTT04oKSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZXhjbHVkZVBhdHRlcm4sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZGlzcmVnYXJkRXhjbHVkZVNldHRpbmdzLCBmYWxzZSk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0cmV0dXJuIHdzLmZpbmRGaWxlcyhwYXR0ZXJuLCB1bmRlZmluZWQsIDEwLCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpKS50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0KG1haW5UaHJlYWRDYWxsZWQsICdtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0ZXN0KCdSZWxhdGl2ZVBhdHRlcm4gaW5jbHVkZSAoc3RyaW5nKScsICgpID0+IHtcblx0XHRcdHJldHVybiB0ZXN0RmluZEZpbGVzSW5jbHVkZShuZXcgUmVsYXRpdmVQYXR0ZXJuKCcvb3RoZXIvZm9sZGVyJywgJ2dsb2IvKionKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdSZWxhdGl2ZVBhdHRlcm4gaW5jbHVkZSAoVVJJKScsICgpID0+IHtcblx0XHRcdHJldHVybiB0ZXN0RmluZEZpbGVzSW5jbHVkZShuZXcgUmVsYXRpdmVQYXR0ZXJuKFVSSS5maWxlKCcvb3RoZXIvZm9sZGVyJyksICdnbG9iLyoqJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm8gZXhjbHVkZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gJy9wcm9qZWN0L2Zvbyc7XG5cdFx0XHRjb25zdCBycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdFx0bGV0IG1haW5UaHJlYWRDYWxsZWQgPSBmYWxzZTtcblx0XHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRXb3Jrc3BhY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSAkc3RhcnRGaWxlU2VhcmNoKF9pbmNsdWRlRm9sZGVyOiBVcmlDb21wb25lbnRzIHwgbnVsbCwgb3B0aW9uczogSUZpbGVRdWVyeUJ1aWxkZXJPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdIHwgbnVsbD4ge1xuXHRcdFx0XHRcdG1haW5UaHJlYWRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmluY2x1ZGVQYXR0ZXJuLCAnZ2xvYi8qKicpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoVVJJLnJldml2ZShfaW5jbHVkZUZvbGRlciEpLnRvU3RyaW5nKCksIFVSSS5maWxlKCcvb3RoZXIvZm9sZGVyJykudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZXhjbHVkZVBhdHRlcm4sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZGlzcmVnYXJkRXhjbHVkZVNldHRpbmdzLCB0cnVlKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKHJwY1Byb3RvY29sLCB7IGlkOiAnZm9vJywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKHJvb3QpLCAwKV0sIG5hbWU6ICdUZXN0JyB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRyZXR1cm4gd3MuZmluZEZpbGVzKG5ldyBSZWxhdGl2ZVBhdHRlcm4oJy9vdGhlci9mb2xkZXInLCAnZ2xvYi8qKicpLCBudWxsLCAxMCwgbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydChtYWluVGhyZWFkQ2FsbGVkLCAnbWFpblRocmVhZENhbGxlZCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aXRoIGNhbmNlbGxlZCB0b2tlbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlICRzdGFydEZpbGVTZWFyY2goX2luY2x1ZGVGb2xkZXI6IFVyaUNvbXBvbmVudHMgfCBudWxsLCBvcHRpb25zOiBJRmlsZVF1ZXJ5QnVpbGRlck9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10gfCBudWxsPiB7XG5cdFx0XHRcdFx0bWFpblRocmVhZENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0XHRjb25zdCB0b2tlbiA9IENhbmNlbGxhdGlvblRva2VuLkNhbmNlbGxlZDtcblx0XHRcdHJldHVybiB3cy5maW5kRmlsZXMobmV3IFJlbGF0aXZlUGF0dGVybignL290aGVyL2ZvbGRlcicsICdnbG9iLyoqJyksIG51bGwsIDEwLCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpLCB0b2tlbikudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydCghbWFpblRocmVhZENhbGxlZCwgJyFtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1JlbGF0aXZlUGF0dGVybiBleGNsdWRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9ICcvcHJvamVjdC9mb28nO1xuXHRcdFx0Y29uc3QgcnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cblx0XHRcdGxldCBtYWluVGhyZWFkQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZFdvcmtzcGFjZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkV29ya3NwYWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgJHN0YXJ0RmlsZVNlYXJjaChfaW5jbHVkZUZvbGRlcjogVXJpQ29tcG9uZW50cyB8IG51bGwsIG9wdGlvbnM6IElGaWxlUXVlcnlCdWlsZGVyT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXSB8IG51bGw+IHtcblx0XHRcdFx0XHRtYWluVGhyZWFkQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5kaXNyZWdhcmRFeGNsdWRlU2V0dGluZ3MsIGZhbHNlKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlUGF0dGVybj8ubGVuZ3RoLCAxKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlUGF0dGVyblswXS5wYXR0ZXJuLCAnZ2xvYi8qKicpOyAvLyBOb3RlIHRoYXQgdGhlIGJhc2UgcG9ydGlvbiBpcyBpZ25vcmVkLCBzZWUgIzUyNjUxXG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0cmV0dXJuIHdzLmZpbmRGaWxlcygnJywgbmV3IFJlbGF0aXZlUGF0dGVybihyb290LCAnZ2xvYi8qKicpLCAxMCwgbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydChtYWluVGhyZWFkQ2FsbGVkLCAnbWFpblRocmVhZENhbGxlZCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmaW5kRmlsZXMyIC0nLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdCgnc3RyaW5nIGluY2x1ZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gJy9wcm9qZWN0L2Zvbyc7XG5cdFx0XHRjb25zdCBycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdFx0bGV0IG1haW5UaHJlYWRDYWxsZWQgPSBmYWxzZTtcblx0XHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRXb3Jrc3BhY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSAkc3RhcnRGaWxlU2VhcmNoKF9pbmNsdWRlRm9sZGVyOiBVcmlDb21wb25lbnRzIHwgbnVsbCwgb3B0aW9uczogSUZpbGVRdWVyeUJ1aWxkZXJPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdIHwgbnVsbD4ge1xuXHRcdFx0XHRcdG1haW5UaHJlYWRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmZpbGVQYXR0ZXJuLCAnZm9vJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuaW5jbHVkZVBhdHRlcm4sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKF9pbmNsdWRlRm9sZGVyLCBudWxsKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlUGF0dGVybiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5kaXNyZWdhcmRFeGNsdWRlU2V0dGluZ3MsIGZhbHNlKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5tYXhSZXN1bHRzLCAxMCk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0cmV0dXJuIHdzLmZpbmRGaWxlczIoWydmb28nXSwgeyBtYXhSZXN1bHRzOiAxMCwgdXNlRXhjbHVkZVNldHRpbmdzOiBFeGNsdWRlU2V0dGluZ09wdGlvbnMuRmlsZXNFeGNsdWRlIH0sIG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0JykpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQobWFpblRocmVhZENhbGxlZCwgJ21haW5UaHJlYWRDYWxsZWQnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0ZnVuY3Rpb24gdGVzdEZpbmRGaWxlczJJbmNsdWRlKHBhdHRlcm46IFJlbGF0aXZlUGF0dGVybltdKSB7XG5cdFx0XHRjb25zdCByb290ID0gJy9wcm9qZWN0L2Zvbyc7XG5cdFx0XHRjb25zdCBycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdFx0bGV0IG1haW5UaHJlYWRDYWxsZWQgPSBmYWxzZTtcblx0XHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRXb3Jrc3BhY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSAkc3RhcnRGaWxlU2VhcmNoKF9pbmNsdWRlRm9sZGVyOiBVcmlDb21wb25lbnRzIHwgbnVsbCwgb3B0aW9uczogSUZpbGVRdWVyeUJ1aWxkZXJPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdIHwgbnVsbD4ge1xuXHRcdFx0XHRcdG1haW5UaHJlYWRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmZpbGVQYXR0ZXJuLCAnZ2xvYi8qKicpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmluY2x1ZGVQYXR0ZXJuLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoX2luY2x1ZGVGb2xkZXIgPyBVUkkuZnJvbShfaW5jbHVkZUZvbGRlcikudG9KU09OKCkgOiBudWxsLCBVUkkuZmlsZSgnL290aGVyL2ZvbGRlcicpLnRvSlNPTigpKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlUGF0dGVybiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5kaXNyZWdhcmRFeGNsdWRlU2V0dGluZ3MsIGZhbHNlKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKHJwY1Byb3RvY29sLCB7IGlkOiAnZm9vJywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKHJvb3QpLCAwKV0sIG5hbWU6ICdUZXN0JyB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRyZXR1cm4gd3MuZmluZEZpbGVzMihwYXR0ZXJuLCB7IG1heFJlc3VsdHM6IDEwIH0sIG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0JykpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQobWFpblRocmVhZENhbGxlZCwgJ21haW5UaHJlYWRDYWxsZWQnKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRlc3QoJ1JlbGF0aXZlUGF0dGVybiBpbmNsdWRlIChzdHJpbmcpJywgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRlc3RGaW5kRmlsZXMySW5jbHVkZShbbmV3IFJlbGF0aXZlUGF0dGVybignL290aGVyL2ZvbGRlcicsICdnbG9iLyoqJyldKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1JlbGF0aXZlUGF0dGVybiBpbmNsdWRlIChVUkkpJywgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRlc3RGaW5kRmlsZXMySW5jbHVkZShbbmV3IFJlbGF0aXZlUGF0dGVybihVUkkuZmlsZSgnL290aGVyL2ZvbGRlcicpLCAnZ2xvYi8qKicpXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdubyBleGNsdWRlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlICRzdGFydEZpbGVTZWFyY2goX2luY2x1ZGVGb2xkZXI6IFVyaUNvbXBvbmVudHMgfCBudWxsLCBvcHRpb25zOiBJRmlsZVF1ZXJ5QnVpbGRlck9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10gfCBudWxsPiB7XG5cdFx0XHRcdFx0bWFpblRocmVhZENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZmlsZVBhdHRlcm4sICdnbG9iLyoqJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuaW5jbHVkZVBhdHRlcm4sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChVUkkucmV2aXZlKF9pbmNsdWRlRm9sZGVyISkudG9TdHJpbmcoKSwgVVJJLmZpbGUoJy9vdGhlci9mb2xkZXInKS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlUGF0dGVybiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5kaXNyZWdhcmRFeGNsdWRlU2V0dGluZ3MsIGZhbHNlKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKHJwY1Byb3RvY29sLCB7IGlkOiAnZm9vJywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKHJvb3QpLCAwKV0sIG5hbWU6ICdUZXN0JyB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRyZXR1cm4gd3MuZmluZEZpbGVzMihbbmV3IFJlbGF0aXZlUGF0dGVybignL290aGVyL2ZvbGRlcicsICdnbG9iLyoqJyldLCB7fSwgbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydChtYWluVGhyZWFkQ2FsbGVkLCAnbWFpblRocmVhZENhbGxlZCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdubyBkdXBzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9ICcvcHJvamVjdC9mb28nO1xuXHRcdFx0Y29uc3QgcnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cblx0XHRcdGxldCBtYWluVGhyZWFkQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZFdvcmtzcGFjZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkV29ya3NwYWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgJHN0YXJ0RmlsZVNlYXJjaChfaW5jbHVkZUZvbGRlcjogVXJpQ29tcG9uZW50cyB8IG51bGwsIG9wdGlvbnM6IElGaWxlUXVlcnlCdWlsZGVyT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXSB8IG51bGw+IHtcblx0XHRcdFx0XHRtYWluVGhyZWFkQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5pbmNsdWRlUGF0dGVybiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlUGF0dGVybiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5kaXNyZWdhcmRFeGNsdWRlU2V0dGluZ3MsIGZhbHNlKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtVUkkuZmlsZShyb290ICsgJy9tYWluLnB5JyldKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIE9ubHkgYWRkIHRoZSByb290IGRpcmVjdG9yeSBhcyBhIHdvcmtzcGFjZSBmb2xkZXIgLSBtYWluLnB5IHdpbGwgYmUgYSBmaWxlIHdpdGhpbiBpdFxuXHRcdFx0Y29uc3QgZm9sZGVycyA9IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldO1xuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKHJwY1Byb3RvY29sLCB7IGlkOiAnZm9vJywgZm9sZGVyczogZm9sZGVycywgbmFtZTogJ1Rlc3QnIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdFx0cmV0dXJuIHdzLmZpbmRGaWxlczIoWycqKi9tYWluLnB5JywgJyoqL21haW4ucHkvKionXSwge30sIG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0JykpLnRoZW4oKHVyaXMpID0+IHtcblx0XHRcdFx0YXNzZXJ0KG1haW5UaHJlYWRDYWxsZWQsICdtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0XHRcdGFzc2VydC5lcXVhbCh1cmlzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5lcXVhbCh1cmlzWzBdLnRvU3RyaW5nKCksIFVSSS5maWxlKHJvb3QgKyAnL21haW4ucHknKS50b1N0cmluZygpKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2l0aCBjYW5jZWxsZWQgdG9rZW4nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gJy9wcm9qZWN0L2Zvbyc7XG5cdFx0XHRjb25zdCBycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdFx0bGV0IG1haW5UaHJlYWRDYWxsZWQgPSBmYWxzZTtcblx0XHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRXb3Jrc3BhY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSAkc3RhcnRGaWxlU2VhcmNoKF9pbmNsdWRlRm9sZGVyOiBVcmlDb21wb25lbnRzIHwgbnVsbCwgb3B0aW9uczogSUZpbGVRdWVyeUJ1aWxkZXJPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdIHwgbnVsbD4ge1xuXHRcdFx0XHRcdG1haW5UaHJlYWRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UocnBjUHJvdG9jb2wsIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUocm9vdCksIDApXSwgbmFtZTogJ1Rlc3QnIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdFx0Y29uc3QgdG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5DYW5jZWxsZWQ7XG5cdFx0XHRyZXR1cm4gd3MuZmluZEZpbGVzMihbbmV3IFJlbGF0aXZlUGF0dGVybignL290aGVyL2ZvbGRlcicsICdnbG9iLyoqJyldLCB7fSwgbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSwgdG9rZW4pLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQoIW1haW5UaHJlYWRDYWxsZWQsICchbWFpblRocmVhZENhbGxlZCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdSZWxhdGl2ZVBhdHRlcm4gZXhjbHVkZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlICRzdGFydEZpbGVTZWFyY2goX2luY2x1ZGVGb2xkZXI6IFVyaUNvbXBvbmVudHMgfCBudWxsLCBvcHRpb25zOiBJRmlsZVF1ZXJ5QnVpbGRlck9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10gfCBudWxsPiB7XG5cdFx0XHRcdFx0bWFpblRocmVhZENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZGlzcmVnYXJkRXhjbHVkZVNldHRpbmdzLCBmYWxzZSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZXhjbHVkZVBhdHRlcm4/Lmxlbmd0aCwgMSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZXhjbHVkZVBhdHRlcm5bMF0ucGF0dGVybiwgJ2dsb2IvKionKTsgLy8gTm90ZSB0aGF0IHRoZSBiYXNlIHBvcnRpb24gaXMgaWdub3JlZCwgc2VlICM1MjY1MVxuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UocnBjUHJvdG9jb2wsIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUocm9vdCksIDApXSwgbmFtZTogJ1Rlc3QnIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdHJldHVybiB3cy5maW5kRmlsZXMyKFsnJ10sIHsgZXhjbHVkZTogW25ldyBSZWxhdGl2ZVBhdHRlcm4ocm9vdCwgJ2dsb2IvKionKV0gfSwgbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydChtYWluVGhyZWFkQ2FsbGVkLCAnbWFpblRocmVhZENhbGxlZCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgndXNlSWdub3JlRmlsZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gJy9wcm9qZWN0L2Zvbyc7XG5cdFx0XHRjb25zdCBycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdFx0bGV0IG1haW5UaHJlYWRDYWxsZWQgPSBmYWxzZTtcblx0XHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRXb3Jrc3BhY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSAkc3RhcnRGaWxlU2VhcmNoKF9pbmNsdWRlRm9sZGVyOiBVcmlDb21wb25lbnRzIHwgbnVsbCwgb3B0aW9uczogSUZpbGVRdWVyeUJ1aWxkZXJPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdIHwgbnVsbD4ge1xuXHRcdFx0XHRcdG1haW5UaHJlYWRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmRpc3JlZ2FyZEV4Y2x1ZGVTZXR0aW5ncywgZmFsc2UpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmRpc3JlZ2FyZElnbm9yZUZpbGVzLCBmYWxzZSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZGlzcmVnYXJkR2xvYmFsSWdub3JlRmlsZXMsIGZhbHNlKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5kaXNyZWdhcmRQYXJlbnRJZ25vcmVGaWxlcywgZmFsc2UpO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UocnBjUHJvdG9jb2wsIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUocm9vdCksIDApXSwgbmFtZTogJ1Rlc3QnIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdHJldHVybiB3cy5maW5kRmlsZXMyKFsnJ10sIHsgdXNlSWdub3JlRmlsZXM6IHsgbG9jYWw6IHRydWUsIHBhcmVudDogdHJ1ZSwgZ2xvYmFsOiB0cnVlIH0gfSwgbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydChtYWluVGhyZWFkQ2FsbGVkLCAnbWFpblRocmVhZENhbGxlZCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2Ugc3ltbGlua3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gJy9wcm9qZWN0L2Zvbyc7XG5cdFx0XHRjb25zdCBycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdFx0bGV0IG1haW5UaHJlYWRDYWxsZWQgPSBmYWxzZTtcblx0XHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRXb3Jrc3BhY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSAkc3RhcnRGaWxlU2VhcmNoKF9pbmNsdWRlRm9sZGVyOiBVcmlDb21wb25lbnRzIHwgbnVsbCwgb3B0aW9uczogSUZpbGVRdWVyeUJ1aWxkZXJPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdIHwgbnVsbD4ge1xuXHRcdFx0XHRcdG1haW5UaHJlYWRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmlnbm9yZVN5bWxpbmtzLCBmYWxzZSk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0cmV0dXJuIHdzLmZpbmRGaWxlczIoWycnXSwgeyBmb2xsb3dTeW1saW5rczogdHJ1ZSB9LCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpKS50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0KG1haW5UaHJlYWRDYWxsZWQsICdtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Nhc2VJbnNlbnNpdGl2ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlICRzdGFydEZpbGVTZWFyY2goX2luY2x1ZGVGb2xkZXI6IFVyaUNvbXBvbmVudHMgfCBudWxsLCBvcHRpb25zOiBJRmlsZVF1ZXJ5QnVpbGRlck9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10gfCBudWxsPiB7XG5cdFx0XHRcdFx0bWFpblRocmVhZENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuaWdub3JlR2xvYkNhc2UsIHRydWUpO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UocnBjUHJvdG9jb2wsIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUocm9vdCksIDApXSwgbmFtZTogJ1Rlc3QnIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdHJldHVybiB3cy5maW5kRmlsZXMyKFsnJ10sIHsgY2FzZUluc2Vuc2l0aXZlOiB0cnVlIH0sIG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0JykpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQobWFpblRocmVhZENhbGxlZCwgJ21haW5UaHJlYWRDYWxsZWQnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gdG9kbzogYWRkIHRlc3RzIHdpdGggbXVsdGlwbGUgZmlsZVBhdHRlcm5zIGFuZCBleGNsdWRlc1xuXG5cdH0pO1xuXG5cdHN1aXRlKCdmaW5kVGV4dEluRmlsZXMgLScsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0KCdubyBpbmNsdWRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9ICcvcHJvamVjdC9mb28nO1xuXHRcdFx0Y29uc3QgcnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cblx0XHRcdGxldCBtYWluVGhyZWFkQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZFdvcmtzcGFjZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkV29ya3NwYWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgJHN0YXJ0VGV4dFNlYXJjaChxdWVyeTogSVBhdHRlcm5JbmZvLCBmb2xkZXI6IFVyaUNvbXBvbmVudHMgfCBudWxsLCBvcHRpb25zOiBJVGV4dFF1ZXJ5QnVpbGRlck9wdGlvbnMsIHJlcXVlc3RJZDogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUZXh0U2VhcmNoQ29tcGxldGUgfCBudWxsPiB7XG5cdFx0XHRcdFx0bWFpblRocmVhZENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5LnBhdHRlcm4sICdmb28nKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGVyLCBudWxsKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5pbmNsdWRlUGF0dGVybiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlUGF0dGVybiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0YXdhaXQgd3MuZmluZFRleHRJbkZpbGVzKHsgcGF0dGVybjogJ2ZvbycgfSwge30sICgpID0+IHsgfSwgbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSk7XG5cdFx0XHRhc3NlcnQobWFpblRocmVhZENhbGxlZCwgJ21haW5UaHJlYWRDYWxsZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmluZyBpbmNsdWRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9ICcvcHJvamVjdC9mb28nO1xuXHRcdFx0Y29uc3QgcnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cblx0XHRcdGxldCBtYWluVGhyZWFkQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZFdvcmtzcGFjZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkV29ya3NwYWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgJHN0YXJ0VGV4dFNlYXJjaChxdWVyeTogSVBhdHRlcm5JbmZvLCBmb2xkZXI6IFVyaUNvbXBvbmVudHMgfCBudWxsLCBvcHRpb25zOiBJVGV4dFF1ZXJ5QnVpbGRlck9wdGlvbnMsIHJlcXVlc3RJZDogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUZXh0U2VhcmNoQ29tcGxldGUgfCBudWxsPiB7XG5cdFx0XHRcdFx0bWFpblRocmVhZENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5LnBhdHRlcm4sICdmb28nKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGVyLCBudWxsKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5pbmNsdWRlUGF0dGVybiwgJyoqL2ZpbGVzJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZXhjbHVkZVBhdHRlcm4sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UocnBjUHJvdG9jb2wsIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUocm9vdCksIDApXSwgbmFtZTogJ1Rlc3QnIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGF3YWl0IHdzLmZpbmRUZXh0SW5GaWxlcyh7IHBhdHRlcm46ICdmb28nIH0sIHsgaW5jbHVkZTogJyoqL2ZpbGVzJyB9LCAoKSA9PiB7IH0sIG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0JykpO1xuXHRcdFx0YXNzZXJ0KG1haW5UaHJlYWRDYWxsZWQsICdtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdSZWxhdGl2ZVBhdHRlcm4gaW5jbHVkZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jICRzdGFydFRleHRTZWFyY2gocXVlcnk6IElQYXR0ZXJuSW5mbywgZm9sZGVyOiBVcmlDb21wb25lbnRzIHwgbnVsbCwgb3B0aW9uczogSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zLCByZXF1ZXN0SWQ6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVGV4dFNlYXJjaENvbXBsZXRlIHwgbnVsbD4ge1xuXHRcdFx0XHRcdG1haW5UaHJlYWRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5wYXR0ZXJuLCAnZm9vJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChVUkkucmV2aXZlKGZvbGRlciEpLnRvU3RyaW5nKCksIFVSSS5maWxlKCcvb3RoZXIvZm9sZGVyJykudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuaW5jbHVkZVBhdHRlcm4sICdnbG9iLyoqJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZXhjbHVkZVBhdHRlcm4sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UocnBjUHJvdG9jb2wsIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUocm9vdCksIDApXSwgbmFtZTogJ1Rlc3QnIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGF3YWl0IHdzLmZpbmRUZXh0SW5GaWxlcyh7IHBhdHRlcm46ICdmb28nIH0sIHsgaW5jbHVkZTogbmV3IFJlbGF0aXZlUGF0dGVybignL290aGVyL2ZvbGRlcicsICdnbG9iLyoqJykgfSwgKCkgPT4geyB9LCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpKTtcblx0XHRcdGFzc2VydChtYWluVGhyZWFkQ2FsbGVkLCAnbWFpblRocmVhZENhbGxlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2l0aCBjYW5jZWxsZWQgdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gJy9wcm9qZWN0L2Zvbyc7XG5cdFx0XHRjb25zdCBycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdFx0bGV0IG1haW5UaHJlYWRDYWxsZWQgPSBmYWxzZTtcblx0XHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRXb3Jrc3BhY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyAkc3RhcnRUZXh0U2VhcmNoKHF1ZXJ5OiBJUGF0dGVybkluZm8sIGZvbGRlcjogVXJpQ29tcG9uZW50cyB8IG51bGwsIG9wdGlvbnM6IElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucywgcmVxdWVzdElkOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRleHRTZWFyY2hDb21wbGV0ZSB8IG51bGw+IHtcblx0XHRcdFx0XHRtYWluVGhyZWFkQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgdG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5DYW5jZWxsZWQ7XG5cdFx0XHRhd2FpdCB3cy5maW5kVGV4dEluRmlsZXMoeyBwYXR0ZXJuOiAnZm9vJyB9LCB7fSwgKCkgPT4geyB9LCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpLCB0b2tlbik7XG5cdFx0XHRhc3NlcnQoIW1haW5UaHJlYWRDYWxsZWQsICchbWFpblRocmVhZENhbGxlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnUmVsYXRpdmVQYXR0ZXJuIGV4Y2x1ZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gJy9wcm9qZWN0L2Zvbyc7XG5cdFx0XHRjb25zdCBycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdFx0bGV0IG1haW5UaHJlYWRDYWxsZWQgPSBmYWxzZTtcblx0XHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRXb3Jrc3BhY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyAkc3RhcnRUZXh0U2VhcmNoKHF1ZXJ5OiBJUGF0dGVybkluZm8sIGZvbGRlcjogVXJpQ29tcG9uZW50cyB8IG51bGwsIG9wdGlvbnM6IElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucywgcmVxdWVzdElkOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRleHRTZWFyY2hDb21wbGV0ZSB8IG51bGw+IHtcblx0XHRcdFx0XHRtYWluVGhyZWFkQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkucGF0dGVybiwgJ2ZvbycpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZm9sZGVyLCBudWxsKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5pbmNsdWRlUGF0dGVybiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlUGF0dGVybj8ubGVuZ3RoLCAxKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlUGF0dGVyblswXS5wYXR0ZXJuLCAnZ2xvYi8qKicpOyAvLyBleGNsdWRlIGZvbGRlciBpcyBpZ25vcmVkLi4uXG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UocnBjUHJvdG9jb2wsIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUocm9vdCksIDApXSwgbmFtZTogJ1Rlc3QnIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGF3YWl0IHdzLmZpbmRUZXh0SW5GaWxlcyh7IHBhdHRlcm46ICdmb28nIH0sIHsgZXhjbHVkZTogbmV3IFJlbGF0aXZlUGF0dGVybignL290aGVyL2ZvbGRlcicsICdnbG9iLyoqJykgfSwgKCkgPT4geyB9LCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpKTtcblx0XHRcdGFzc2VydChtYWluVGhyZWFkQ2FsbGVkLCAnbWFpblRocmVhZENhbGxlZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmluZFRleHRJbkZpbGVzMiAtJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3QoJ25vIGluY2x1ZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gJy9wcm9qZWN0L2Zvbyc7XG5cdFx0XHRjb25zdCBycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdFx0bGV0IG1haW5UaHJlYWRDYWxsZWQgPSBmYWxzZTtcblx0XHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRXb3Jrc3BhY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyAkc3RhcnRUZXh0U2VhcmNoKHF1ZXJ5OiBJUGF0dGVybkluZm8sIGZvbGRlcjogVXJpQ29tcG9uZW50cyB8IG51bGwsIG9wdGlvbnM6IElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucywgcmVxdWVzdElkOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRleHRTZWFyY2hDb21wbGV0ZSB8IG51bGw+IHtcblx0XHRcdFx0XHRtYWluVGhyZWFkQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkucGF0dGVybiwgJ2ZvbycpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkZXIsIG51bGwpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmluY2x1ZGVQYXR0ZXJuLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVQYXR0ZXJuLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKHJwY1Byb3RvY29sLCB7IGlkOiAnZm9vJywgZm9sZGVyczogW2FXb3Jrc3BhY2VGb2xkZXJEYXRhKFVSSS5maWxlKHJvb3QpLCAwKV0sIG5hbWU6ICdUZXN0JyB9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRhd2FpdCAod3MuZmluZFRleHRJbkZpbGVzMih7IHBhdHRlcm46ICdmb28nIH0sIHt9LCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpKSkuY29tcGxldGU7XG5cdFx0XHRhc3NlcnQobWFpblRocmVhZENhbGxlZCwgJ21haW5UaHJlYWRDYWxsZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmluZyBpbmNsdWRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm9vdCA9ICcvcHJvamVjdC9mb28nO1xuXHRcdFx0Y29uc3QgcnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cblx0XHRcdGxldCBtYWluVGhyZWFkQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZFdvcmtzcGFjZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkV29ya3NwYWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgJHN0YXJ0VGV4dFNlYXJjaChxdWVyeTogSVBhdHRlcm5JbmZvLCBmb2xkZXI6IFVyaUNvbXBvbmVudHMgfCBudWxsLCBvcHRpb25zOiBJVGV4dFF1ZXJ5QnVpbGRlck9wdGlvbnMsIHJlcXVlc3RJZDogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUZXh0U2VhcmNoQ29tcGxldGUgfCBudWxsPiB7XG5cdFx0XHRcdFx0bWFpblRocmVhZENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJ5LnBhdHRlcm4sICdmb28nKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGVyLCBudWxsKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5pbmNsdWRlUGF0dGVybiwgJyoqL2ZpbGVzJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZXhjbHVkZVBhdHRlcm4sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UocnBjUHJvdG9jb2wsIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUocm9vdCksIDApXSwgbmFtZTogJ1Rlc3QnIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGF3YWl0ICh3cy5maW5kVGV4dEluRmlsZXMyKHsgcGF0dGVybjogJ2ZvbycgfSwgeyBpbmNsdWRlOiBbJyoqL2ZpbGVzJ10gfSwgbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSkpLmNvbXBsZXRlO1xuXHRcdFx0YXNzZXJ0KG1haW5UaHJlYWRDYWxsZWQsICdtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdSZWxhdGl2ZVBhdHRlcm4gaW5jbHVkZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jICRzdGFydFRleHRTZWFyY2gocXVlcnk6IElQYXR0ZXJuSW5mbywgZm9sZGVyOiBVcmlDb21wb25lbnRzIHwgbnVsbCwgb3B0aW9uczogSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zLCByZXF1ZXN0SWQ6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVGV4dFNlYXJjaENvbXBsZXRlIHwgbnVsbD4ge1xuXHRcdFx0XHRcdG1haW5UaHJlYWRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5wYXR0ZXJuLCAnZm9vJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChVUkkucmV2aXZlKGZvbGRlciEpLnRvU3RyaW5nKCksIFVSSS5maWxlKCcvb3RoZXIvZm9sZGVyJykudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuaW5jbHVkZVBhdHRlcm4sICdnbG9iLyoqJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZXhjbHVkZVBhdHRlcm4sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UocnBjUHJvdG9jb2wsIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUocm9vdCksIDApXSwgbmFtZTogJ1Rlc3QnIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGF3YWl0ICh3cy5maW5kVGV4dEluRmlsZXMyKHsgcGF0dGVybjogJ2ZvbycgfSwgeyBpbmNsdWRlOiBbbmV3IFJlbGF0aXZlUGF0dGVybignL290aGVyL2ZvbGRlcicsICdnbG9iLyoqJyldIH0sIG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0JykpKS5jb21wbGV0ZTtcblx0XHRcdGFzc2VydChtYWluVGhyZWFkQ2FsbGVkLCAnbWFpblRocmVhZENhbGxlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2l0aCBjYW5jZWxsZWQgdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gJy9wcm9qZWN0L2Zvbyc7XG5cdFx0XHRjb25zdCBycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdFx0bGV0IG1haW5UaHJlYWRDYWxsZWQgPSBmYWxzZTtcblx0XHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRXb3Jrc3BhY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyAkc3RhcnRUZXh0U2VhcmNoKHF1ZXJ5OiBJUGF0dGVybkluZm8sIGZvbGRlcjogVXJpQ29tcG9uZW50cyB8IG51bGwsIG9wdGlvbnM6IElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucywgcmVxdWVzdElkOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRleHRTZWFyY2hDb21wbGV0ZSB8IG51bGw+IHtcblx0XHRcdFx0XHRtYWluVGhyZWFkQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgdG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5DYW5jZWxsZWQ7XG5cdFx0XHRhd2FpdCAod3MuZmluZFRleHRJbkZpbGVzMih7IHBhdHRlcm46ICdmb28nIH0sIHVuZGVmaW5lZCwgbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSwgdG9rZW4pKS5jb21wbGV0ZTtcblx0XHRcdGFzc2VydCghbWFpblRocmVhZENhbGxlZCwgJyFtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdSZWxhdGl2ZVBhdHRlcm4gZXhjbHVkZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSAnL3Byb2plY3QvZm9vJztcblx0XHRcdGNvbnN0IHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXG5cdFx0XHRsZXQgbWFpblRocmVhZENhbGxlZCA9IGZhbHNlO1xuXHRcdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRXb3Jrc3BhY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFdvcmtzcGFjZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jICRzdGFydFRleHRTZWFyY2gocXVlcnk6IElQYXR0ZXJuSW5mbywgZm9sZGVyOiBVcmlDb21wb25lbnRzIHwgbnVsbCwgb3B0aW9uczogSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zLCByZXF1ZXN0SWQ6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVGV4dFNlYXJjaENvbXBsZXRlIHwgbnVsbD4ge1xuXHRcdFx0XHRcdG1haW5UaHJlYWRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5wYXR0ZXJuLCAnZm9vJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmb2xkZXIsIG51bGwpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmluY2x1ZGVQYXR0ZXJuLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVQYXR0ZXJuPy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVQYXR0ZXJuWzBdLnBhdHRlcm4sICdnbG9iLyoqJyk7IC8vIGV4Y2x1ZGUgZm9sZGVyIGlzIGlnbm9yZWQuLi5cblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZShycGNQcm90b2NvbCwgeyBpZDogJ2ZvbycsIGZvbGRlcnM6IFthV29ya3NwYWNlRm9sZGVyRGF0YShVUkkuZmlsZShyb290KSwgMCldLCBuYW1lOiAnVGVzdCcgfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0YXdhaXQgKHdzLmZpbmRUZXh0SW5GaWxlczIoeyBwYXR0ZXJuOiAnZm9vJyB9LCB7IGV4Y2x1ZGU6IFtuZXcgUmVsYXRpdmVQYXR0ZXJuKCcvb3RoZXIvZm9sZGVyJywgJ2dsb2IvKionKV0gfSwgbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSkpLmNvbXBsZXRlO1xuXHRcdFx0YXNzZXJ0KG1haW5UaHJlYWRDYWxsZWQsICdtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYXNlSW5zZW5zaXRpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gJy9wcm9qZWN0L2Zvbyc7XG5cdFx0XHRjb25zdCBycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdFx0bGV0IG1haW5UaHJlYWRDYWxsZWQgPSBmYWxzZTtcblx0XHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkV29ya3NwYWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRXb3Jrc3BhY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyAkc3RhcnRUZXh0U2VhcmNoKHF1ZXJ5OiBJUGF0dGVybkluZm8sIGZvbGRlcjogVXJpQ29tcG9uZW50cyB8IG51bGwsIG9wdGlvbnM6IElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucywgcmVxdWVzdElkOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRleHRTZWFyY2hDb21wbGV0ZSB8IG51bGw+IHtcblx0XHRcdFx0XHRtYWluVGhyZWFkQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5pZ25vcmVHbG9iQ2FzZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UocnBjUHJvdG9jb2wsIHsgaWQ6ICdmb28nLCBmb2xkZXJzOiBbYVdvcmtzcGFjZUZvbGRlckRhdGEoVVJJLmZpbGUocm9vdCksIDApXSwgbmFtZTogJ1Rlc3QnIH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGF3YWl0ICh3cy5maW5kVGV4dEluRmlsZXMyKHsgcGF0dGVybjogJ2ZvbycgfSwgeyBjYXNlSW5zZW5zaXRpdmU6IHRydWUgfSwgbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSkpLmNvbXBsZXRlO1xuXHRcdFx0YXNzZXJ0KG1haW5UaHJlYWRDYWxsZWQsICdtYWluVGhyZWFkQ2FsbGVkJyk7XG5cdFx0fSk7XG5cblx0XHQvLyBUT0RPOiB0ZXN0IG11bHRpcGxlIGluY2x1ZGVzL2V4Y2x1ZGVzc1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBc0Isc0JBQXNCO0FBRzVDLFNBQXVDLG1CQUFrRTtBQUN6RyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFT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
