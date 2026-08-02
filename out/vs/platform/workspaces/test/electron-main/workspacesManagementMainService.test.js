import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import { isUNC, toSlashes } from "../../../../base/common/extpath.js";
import { normalizeDriveLetter } from "../../../../base/common/labels.js";
import * as path from "../../../../base/common/path.js";
import { isWindows } from "../../../../base/common/platform.js";
import { extUriBiasedIgnorePathCase } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import * as pfs from "../../../../base/node/pfs.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { flakySuite, getRandomTestPath } from "../../../../base/test/node/testUtils.js";
import { EnvironmentMainService } from "../../../environment/electron-main/environmentMainService.js";
import { OPTIONS, parseArgs } from "../../../environment/node/argv.js";
import { FileService } from "../../../files/common/fileService.js";
import { NullLogService } from "../../../log/common/log.js";
import product from "../../../product/common/product.js";
import { SaveStrategy, StateService } from "../../../state/node/stateService.js";
import { UriIdentityService } from "../../../uriIdentity/common/uriIdentityService.js";
import { UserDataProfilesMainService } from "../../../userDataProfile/electron-main/userDataProfile.js";
import { WORKSPACE_EXTENSION } from "../../../workspace/common/workspace.js";
import { rewriteWorkspaceFileForNewLocation } from "../../common/workspaces.js";
import { WorkspacesManagementMainService } from "../../electron-main/workspacesManagementMainService.js";
flakySuite("WorkspacesManagementMainService", () => {
  class TestDialogMainService {
    pickFileFolder(options, window) {
      throw new Error("Method not implemented.");
    }
    pickFolder(options, window) {
      throw new Error("Method not implemented.");
    }
    pickFile(options, window) {
      throw new Error("Method not implemented.");
    }
    pickWorkspace(options, window) {
      throw new Error("Method not implemented.");
    }
    showMessageBox(options, window) {
      throw new Error("Method not implemented.");
    }
    showSaveDialog(options, window) {
      throw new Error("Method not implemented.");
    }
    showOpenDialog(options, window) {
      throw new Error("Method not implemented.");
    }
  }
  class TestBackupMainService {
    isHotExitEnabled() {
      throw new Error("Method not implemented.");
    }
    getEmptyWindowBackups() {
      throw new Error("Method not implemented.");
    }
    registerWorkspaceBackup(workspaceInfo, migrateFrom) {
      throw new Error("Method not implemented.");
    }
    registerFolderBackup(folder) {
      throw new Error("Method not implemented.");
    }
    registerEmptyWindowBackup(empty) {
      throw new Error("Method not implemented.");
    }
    async getDirtyWorkspaces() {
      return [];
    }
  }
  function createUntitledWorkspace(folders, names) {
    return service.createUntitledWorkspace(folders.map((folder, index) => ({ uri: URI.file(folder), name: names ? names[index] : void 0 })));
  }
  function createWorkspace(workspaceConfigPath, folders, names) {
    const ws = {
      folders: []
    };
    for (let i = 0; i < folders.length; i++) {
      const f = folders[i];
      const s = f instanceof URI ? { uri: f.toString() } : { path: f };
      if (names) {
        s.name = names[i];
      }
      ws.folders.push(s);
    }
    fs.writeFileSync(workspaceConfigPath, JSON.stringify(ws));
  }
  let testDir;
  let untitledWorkspacesHomePath;
  let environmentMainService;
  let service;
  const cwd = process.cwd();
  const tmpDir = os.tmpdir();
  setup(async () => {
    testDir = getRandomTestPath(tmpDir, "vsctests", "workspacesmanagementmainservice");
    untitledWorkspacesHomePath = path.join(testDir, "Workspaces");
    const productService = { _serviceBrand: void 0, ...product };
    environmentMainService = new class TestEnvironmentService extends EnvironmentMainService {
      constructor() {
        super(parseArgs(process.argv, OPTIONS), productService);
      }
      get untitledWorkspacesHome() {
        return URI.file(untitledWorkspacesHomePath);
      }
    }();
    const logService = new NullLogService();
    const fileService = new FileService(logService);
    service = new WorkspacesManagementMainService(environmentMainService, logService, new UserDataProfilesMainService(new StateService(SaveStrategy.DELAYED, environmentMainService, logService, fileService), new UriIdentityService(fileService), environmentMainService, fileService, logService, productService), new TestBackupMainService(), new TestDialogMainService());
    return fs.promises.mkdir(untitledWorkspacesHomePath, { recursive: true });
  });
  teardown(() => {
    service.dispose();
    return pfs.Promises.rm(testDir);
  });
  function assertPathEquals(pathInWorkspaceFile, pathOnDisk) {
    if (isWindows) {
      pathInWorkspaceFile = normalizeDriveLetter(pathInWorkspaceFile);
      pathOnDisk = normalizeDriveLetter(pathOnDisk);
      if (!isUNC(pathOnDisk)) {
        pathOnDisk = toSlashes(pathOnDisk);
      }
    }
    assert.strictEqual(pathInWorkspaceFile, pathOnDisk);
  }
  function assertEqualURI(u1, u2) {
    assert.strictEqual(u1.toString(), u2.toString());
  }
  test("createWorkspace (folders)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir]);
    assert.ok(workspace);
    assert.ok(fs.existsSync(workspace.configPath.fsPath));
    assert.ok(service.isUntitledWorkspace(workspace));
    const ws = JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString());
    assert.strictEqual(ws.folders.length, 2);
    assertPathEquals(ws.folders[0].path, cwd);
    assertPathEquals(ws.folders[1].path, tmpDir);
    assert.ok(!ws.folders[0].name);
    assert.ok(!ws.folders[1].name);
  });
  test("createWorkspace (folders with name)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir], ["currentworkingdirectory", "tempdir"]);
    assert.ok(workspace);
    assert.ok(fs.existsSync(workspace.configPath.fsPath));
    assert.ok(service.isUntitledWorkspace(workspace));
    const ws = JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString());
    assert.strictEqual(ws.folders.length, 2);
    assertPathEquals(ws.folders[0].path, cwd);
    assertPathEquals(ws.folders[1].path, tmpDir);
    assert.strictEqual(ws.folders[0].name, "currentworkingdirectory");
    assert.strictEqual(ws.folders[1].name, "tempdir");
  });
  test("createUntitledWorkspace (folders as other resource URIs)", async () => {
    const folder1URI = URI.parse("myscheme://server/work/p/f1");
    const folder2URI = URI.parse("myscheme://server/work/o/f3");
    const workspace = await service.createUntitledWorkspace([{ uri: folder1URI }, { uri: folder2URI }], "server");
    assert.ok(workspace);
    assert.ok(fs.existsSync(workspace.configPath.fsPath));
    assert.ok(service.isUntitledWorkspace(workspace));
    const ws = JSON.parse(fs.readFileSync(workspace.configPath.fsPath).toString());
    assert.strictEqual(ws.folders.length, 2);
    assert.strictEqual(ws.folders[0].uri, folder1URI.toString(true));
    assert.strictEqual(ws.folders[1].uri, folder2URI.toString(true));
    assert.ok(!ws.folders[0].name);
    assert.ok(!ws.folders[1].name);
    assert.strictEqual(ws.remoteAuthority, "server");
  });
  test("resolveWorkspace", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir]);
    assert.ok(await service.resolveLocalWorkspace(workspace.configPath));
    const newPath = path.join(path.dirname(workspace.configPath.fsPath), `workspace.${WORKSPACE_EXTENSION}`);
    fs.renameSync(workspace.configPath.fsPath, newPath);
    workspace.configPath = URI.file(newPath);
    const resolved = await service.resolveLocalWorkspace(workspace.configPath);
    assert.strictEqual(2, resolved.folders.length);
    assertEqualURI(resolved.configPath, workspace.configPath);
    assert.ok(resolved.id);
    fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ something: "something" }));
    const resolvedInvalid = await service.resolveLocalWorkspace(workspace.configPath);
    assert.ok(!resolvedInvalid);
    fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ transient: true, folders: [] }));
    const resolvedTransient = await service.resolveLocalWorkspace(workspace.configPath);
    assert.ok(resolvedTransient?.transient);
  });
  test("resolveWorkspace (support relative paths)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir]);
    fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ folders: [{ path: "./ticino-playground/lib" }] }));
    const resolved = await service.resolveLocalWorkspace(workspace.configPath);
    assertEqualURI(resolved.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), "ticino-playground", "lib")));
  });
  test("resolveWorkspace (support relative paths #2)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir]);
    fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ folders: [{ path: "./ticino-playground/lib/../other" }] }));
    const resolved = await service.resolveLocalWorkspace(workspace.configPath);
    assertEqualURI(resolved.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), "ticino-playground", "other")));
  });
  test("resolveWorkspace (support relative paths #3)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir]);
    fs.writeFileSync(workspace.configPath.fsPath, JSON.stringify({ folders: [{ path: "ticino-playground/lib" }] }));
    const resolved = await service.resolveLocalWorkspace(workspace.configPath);
    assertEqualURI(resolved.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), "ticino-playground", "lib")));
  });
  test("resolveWorkspace (support invalid JSON via fault tolerant parsing)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir]);
    fs.writeFileSync(workspace.configPath.fsPath, '{ "folders": [ { "path": "./ticino-playground/lib" } , ] }');
    const resolved = await service.resolveLocalWorkspace(workspace.configPath);
    assertEqualURI(resolved.folders[0].uri, URI.file(path.join(path.dirname(workspace.configPath.fsPath), "ticino-playground", "lib")));
  });
  test("rewriteWorkspaceFileForNewLocation", async () => {
    const folder1 = cwd;
    const tmpInsideDir = path.join(tmpDir, "inside");
    const firstConfigPath = path.join(tmpDir, "myworkspace0.code-workspace");
    createWorkspace(firstConfigPath, [folder1, "inside", path.join("inside", "somefolder")]);
    const origContent = fs.readFileSync(firstConfigPath).toString();
    let origConfigPath = URI.file(firstConfigPath);
    let workspaceConfigPath = URI.file(path.join(tmpDir, "inside", "myworkspace1.code-workspace"));
    let newContent = rewriteWorkspaceFileForNewLocation(origContent, origConfigPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
    let ws = JSON.parse(newContent);
    assert.strictEqual(ws.folders.length, 3);
    assertPathEquals(ws.folders[0].path, folder1);
    assertPathEquals(ws.folders[1].path, ".");
    assertPathEquals(ws.folders[2].path, "somefolder");
    origConfigPath = workspaceConfigPath;
    workspaceConfigPath = URI.file(path.join(tmpDir, "myworkspace2.code-workspace"));
    newContent = rewriteWorkspaceFileForNewLocation(newContent, origConfigPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
    ws = JSON.parse(newContent);
    assert.strictEqual(ws.folders.length, 3);
    assertPathEquals(ws.folders[0].path, folder1);
    assertPathEquals(ws.folders[1].path, "inside");
    assertPathEquals(ws.folders[2].path, "inside/somefolder");
    origConfigPath = workspaceConfigPath;
    workspaceConfigPath = URI.file(path.join(tmpDir, "other", "myworkspace2.code-workspace"));
    newContent = rewriteWorkspaceFileForNewLocation(newContent, origConfigPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
    ws = JSON.parse(newContent);
    assert.strictEqual(ws.folders.length, 3);
    assertPathEquals(ws.folders[0].path, folder1);
    assertPathEquals(ws.folders[1].path, "../inside");
    assertPathEquals(ws.folders[2].path, "../inside/somefolder");
    origConfigPath = workspaceConfigPath;
    workspaceConfigPath = URI.parse("foo://foo/bar/myworkspace2.code-workspace");
    newContent = rewriteWorkspaceFileForNewLocation(newContent, origConfigPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
    ws = JSON.parse(newContent);
    assert.strictEqual(ws.folders.length, 3);
    assert.strictEqual(ws.folders[0].uri, URI.file(folder1).toString(true));
    assert.strictEqual(ws.folders[1].uri, URI.file(tmpInsideDir).toString(true));
    assert.strictEqual(ws.folders[2].uri, URI.file(path.join(tmpInsideDir, "somefolder")).toString(true));
    fs.unlinkSync(firstConfigPath);
  });
  test("rewriteWorkspaceFileForNewLocation (preserves comments)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir, path.join(tmpDir, "somefolder")]);
    const workspaceConfigPath = URI.file(path.join(tmpDir, `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`));
    let origContent = fs.readFileSync(workspace.configPath.fsPath).toString();
    origContent = `// this is a comment
${origContent}`;
    const newContent = rewriteWorkspaceFileForNewLocation(origContent, workspace.configPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
    assert.strictEqual(0, newContent.indexOf("// this is a comment"));
    await service.deleteUntitledWorkspace(workspace);
  });
  test("rewriteWorkspaceFileForNewLocation (preserves forward slashes)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir, path.join(tmpDir, "somefolder")]);
    const workspaceConfigPath = URI.file(path.join(tmpDir, `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`));
    let origContent = fs.readFileSync(workspace.configPath.fsPath).toString();
    origContent = origContent.replace(/[\\]/g, "/");
    const newContent = rewriteWorkspaceFileForNewLocation(origContent, workspace.configPath, false, workspaceConfigPath, extUriBiasedIgnorePathCase);
    const ws = JSON.parse(newContent);
    assert.ok(ws.folders.every((f) => f.path.indexOf("\\") < 0));
    await service.deleteUntitledWorkspace(workspace);
  });
  (!isWindows ? test.skip : test)("rewriteWorkspaceFileForNewLocation (unc paths)", async () => {
    const workspaceLocation = path.join(tmpDir, "wsloc");
    const folder1Location = "x:\\foo";
    const folder2Location = "\\\\server\\share2\\some\\path";
    const folder3Location = path.join(workspaceLocation, "inner", "more");
    const workspace = await createUntitledWorkspace([folder1Location, folder2Location, folder3Location]);
    const workspaceConfigPath = URI.file(path.join(workspaceLocation, `myworkspace.${Date.now()}.${WORKSPACE_EXTENSION}`));
    const origContent = fs.readFileSync(workspace.configPath.fsPath).toString();
    const newContent = rewriteWorkspaceFileForNewLocation(origContent, workspace.configPath, true, workspaceConfigPath, extUriBiasedIgnorePathCase);
    const ws = JSON.parse(newContent);
    assertPathEquals(ws.folders[0].path, folder1Location);
    assertPathEquals(ws.folders[1].path, folder2Location);
    assertPathEquals(ws.folders[2].path, "inner/more");
    await service.deleteUntitledWorkspace(workspace);
  });
  test("deleteUntitledWorkspace (untitled)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir]);
    assert.ok(fs.existsSync(workspace.configPath.fsPath));
    await service.deleteUntitledWorkspace(workspace);
    assert.ok(!fs.existsSync(workspace.configPath.fsPath));
  });
  test("deleteUntitledWorkspace (saved)", async () => {
    const workspace = await createUntitledWorkspace([cwd, tmpDir]);
    await service.deleteUntitledWorkspace(workspace);
  });
  test("getUntitledWorkspace", async function() {
    await service.initialize();
    let untitled = service.getUntitledWorkspaces();
    assert.strictEqual(untitled.length, 0);
    const untitledOne = await createUntitledWorkspace([cwd, tmpDir]);
    assert.ok(fs.existsSync(untitledOne.configPath.fsPath));
    await service.initialize();
    untitled = service.getUntitledWorkspaces();
    assert.strictEqual(1, untitled.length);
    assert.strictEqual(untitledOne.id, untitled[0].workspace.id);
    await service.deleteUntitledWorkspace(untitledOne);
    await service.initialize();
    untitled = service.getUntitledWorkspaces();
    assert.strictEqual(0, untitled.length);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3dvcmtzcGFjZXMvdGVzdC9lbGVjdHJvbi1tYWluL3dvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmltcG9ydCB7IGlzVU5DLCB0b1NsYXNoZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCB7IG5vcm1hbGl6ZURyaXZlTGV0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgcGZzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2Uvbm9kZS9wZnMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBmbGFreVN1aXRlLCBnZXRSYW5kb21UZXN0UGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9ub2RlL3Rlc3RVdGlscy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQmFja3VwSW5mbywgSUZvbGRlckJhY2t1cEluZm8gfSBmcm9tICcuLi8uLi8uLi9iYWNrdXAvY29tbW9uL2JhY2t1cC5qcyc7XG5pbXBvcnQgeyBJQmFja3VwTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9iYWNrdXAvZWxlY3Ryb24tbWFpbi9iYWNrdXAuanMnO1xuaW1wb3J0IHsgSUVtcHR5V2luZG93QmFja3VwSW5mbyB9IGZyb20gJy4uLy4uLy4uL2JhY2t1cC9ub2RlL2JhY2t1cC5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlT3BlbkRpYWxvZ09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElEaWFsb2dNYWluU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2RpYWxvZ3MvZWxlY3Ryb24tbWFpbi9kaWFsb2dNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvZWxlY3Ryb24tbWFpbi9lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IE9QVElPTlMsIHBhcnNlQXJncyB9IGZyb20gJy4uLy4uLy4uL2Vudmlyb25tZW50L25vZGUvYXJndi5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2F2ZVN0cmF0ZWd5LCBTdGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zdGF0ZS9ub2RlL3N0YXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVzZXJEYXRhUHJvZmlsZXNNYWluU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9lbGVjdHJvbi1tYWluL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJUmF3RmlsZVdvcmtzcGFjZUZvbGRlciwgSVJhd1VyaVdvcmtzcGFjZUZvbGRlciwgV09SS1NQQUNFX0VYVEVOU0lPTiB9IGZyb20gJy4uLy4uLy4uL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElTdG9yZWRXb3Jrc3BhY2UsIElTdG9yZWRXb3Jrc3BhY2VGb2xkZXIsIElXb3Jrc3BhY2VGb2xkZXJDcmVhdGlvbkRhdGEsIHJld3JpdGVXb3Jrc3BhY2VGaWxlRm9yTmV3TG9jYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vd29ya3NwYWNlcy5qcyc7XG5pbXBvcnQgeyBXb3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWxlY3Ryb24tbWFpbi93b3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlLmpzJztcblxuZmxha3lTdWl0ZSgnV29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZScsICgpID0+IHtcblxuXHRjbGFzcyBUZXN0RGlhbG9nTWFpblNlcnZpY2UgaW1wbGVtZW50cyBJRGlhbG9nTWFpblNlcnZpY2Uge1xuXG5cdFx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0XHRwaWNrRmlsZUZvbGRlcihvcHRpb25zOiBJTmF0aXZlT3BlbkRpYWxvZ09wdGlvbnMsIHdpbmRvdz86IEVsZWN0cm9uLkJyb3dzZXJXaW5kb3cgfCB1bmRlZmluZWQpOiBQcm9taXNlPHN0cmluZ1tdIHwgdW5kZWZpbmVkPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRcdHBpY2tGb2xkZXIob3B0aW9uczogSU5hdGl2ZU9wZW5EaWFsb2dPcHRpb25zLCB3aW5kb3c/OiBFbGVjdHJvbi5Ccm93c2VyV2luZG93IHwgdW5kZWZpbmVkKTogUHJvbWlzZTxzdHJpbmdbXSB8IHVuZGVmaW5lZD4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0XHRwaWNrRmlsZShvcHRpb25zOiBJTmF0aXZlT3BlbkRpYWxvZ09wdGlvbnMsIHdpbmRvdz86IEVsZWN0cm9uLkJyb3dzZXJXaW5kb3cgfCB1bmRlZmluZWQpOiBQcm9taXNlPHN0cmluZ1tdIHwgdW5kZWZpbmVkPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRcdHBpY2tXb3Jrc3BhY2Uob3B0aW9uczogSU5hdGl2ZU9wZW5EaWFsb2dPcHRpb25zLCB3aW5kb3c/OiBFbGVjdHJvbi5Ccm93c2VyV2luZG93IHwgdW5kZWZpbmVkKTogUHJvbWlzZTxzdHJpbmdbXSB8IHVuZGVmaW5lZD4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0XHRzaG93TWVzc2FnZUJveChvcHRpb25zOiBFbGVjdHJvbi5NZXNzYWdlQm94T3B0aW9ucywgd2luZG93PzogRWxlY3Ryb24uQnJvd3NlcldpbmRvdyB8IHVuZGVmaW5lZCk6IFByb21pc2U8RWxlY3Ryb24uTWVzc2FnZUJveFJldHVyblZhbHVlPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRcdHNob3dTYXZlRGlhbG9nKG9wdGlvbnM6IEVsZWN0cm9uLlNhdmVEaWFsb2dPcHRpb25zLCB3aW5kb3c/OiBFbGVjdHJvbi5Ccm93c2VyV2luZG93IHwgdW5kZWZpbmVkKTogUHJvbWlzZTxFbGVjdHJvbi5TYXZlRGlhbG9nUmV0dXJuVmFsdWU+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdFx0c2hvd09wZW5EaWFsb2cob3B0aW9uczogRWxlY3Ryb24uT3BlbkRpYWxvZ09wdGlvbnMsIHdpbmRvdz86IEVsZWN0cm9uLkJyb3dzZXJXaW5kb3cgfCB1bmRlZmluZWQpOiBQcm9taXNlPEVsZWN0cm9uLk9wZW5EaWFsb2dSZXR1cm5WYWx1ZT4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0fVxuXG5cdGNsYXNzIFRlc3RCYWNrdXBNYWluU2VydmljZSBpbXBsZW1lbnRzIElCYWNrdXBNYWluU2VydmljZSB7XG5cblx0XHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRcdGlzSG90RXhpdEVuYWJsZWQoKTogYm9vbGVhbiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRcdGdldEVtcHR5V2luZG93QmFja3VwcygpOiBJRW1wdHlXaW5kb3dCYWNrdXBJbmZvW10geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0XHRyZWdpc3RlcldvcmtzcGFjZUJhY2t1cCh3b3Jrc3BhY2VJbmZvOiBJV29ya3NwYWNlQmFja3VwSW5mbyk6IHN0cmluZztcblx0XHRyZWdpc3RlcldvcmtzcGFjZUJhY2t1cCh3b3Jrc3BhY2VJbmZvOiBJV29ya3NwYWNlQmFja3VwSW5mbywgbWlncmF0ZUZyb206IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPjtcblx0XHRyZWdpc3RlcldvcmtzcGFjZUJhY2t1cCh3b3Jrc3BhY2VJbmZvOiB1bmtub3duLCBtaWdyYXRlRnJvbT86IHVua25vd24pOiBzdHJpbmcgfCBQcm9taXNlPHN0cmluZz4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0XHRyZWdpc3RlckZvbGRlckJhY2t1cChmb2xkZXI6IElGb2xkZXJCYWNrdXBJbmZvKTogc3RyaW5nIHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9XG5cdFx0cmVnaXN0ZXJFbXB0eVdpbmRvd0JhY2t1cChlbXB0eTogSUVtcHR5V2luZG93QmFja3VwSW5mbyk6IHN0cmluZyB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRcdGFzeW5jIGdldERpcnR5V29ya3NwYWNlcygpOiBQcm9taXNlPChJV29ya3NwYWNlQmFja3VwSW5mbyB8IElGb2xkZXJCYWNrdXBJbmZvKVtdPiB7IHJldHVybiBbXTsgfVxuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlVW50aXRsZWRXb3Jrc3BhY2UoZm9sZGVyczogc3RyaW5nW10sIG5hbWVzPzogc3RyaW5nW10pIHtcblx0XHRyZXR1cm4gc2VydmljZS5jcmVhdGVVbnRpdGxlZFdvcmtzcGFjZShmb2xkZXJzLm1hcCgoZm9sZGVyLCBpbmRleCkgPT4gKHsgdXJpOiBVUkkuZmlsZShmb2xkZXIpLCBuYW1lOiBuYW1lcyA/IG5hbWVzW2luZGV4XSA6IHVuZGVmaW5lZCB9IGFzIElXb3Jrc3BhY2VGb2xkZXJDcmVhdGlvbkRhdGEpKSk7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVXb3Jrc3BhY2Uod29ya3NwYWNlQ29uZmlnUGF0aDogc3RyaW5nLCBmb2xkZXJzOiAoc3RyaW5nIHwgVVJJKVtdLCBuYW1lcz86IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Y29uc3Qgd3M6IElTdG9yZWRXb3Jrc3BhY2UgPSB7XG5cdFx0XHRmb2xkZXJzOiBbXVxuXHRcdH07XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGZvbGRlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGYgPSBmb2xkZXJzW2ldO1xuXHRcdFx0Y29uc3QgczogSVN0b3JlZFdvcmtzcGFjZUZvbGRlciA9IGYgaW5zdGFuY2VvZiBVUkkgPyB7IHVyaTogZi50b1N0cmluZygpIH0gOiB7IHBhdGg6IGYgfTtcblx0XHRcdGlmIChuYW1lcykge1xuXHRcdFx0XHRzLm5hbWUgPSBuYW1lc1tpXTtcblx0XHRcdH1cblx0XHRcdHdzLmZvbGRlcnMucHVzaChzKTtcblx0XHR9XG5cblx0XHRmcy53cml0ZUZpbGVTeW5jKHdvcmtzcGFjZUNvbmZpZ1BhdGgsIEpTT04uc3RyaW5naWZ5KHdzKSk7XG5cdH1cblxuXHRsZXQgdGVzdERpcjogc3RyaW5nO1xuXHRsZXQgdW50aXRsZWRXb3Jrc3BhY2VzSG9tZVBhdGg6IHN0cmluZztcblx0bGV0IGVudmlyb25tZW50TWFpblNlcnZpY2U6IEVudmlyb25tZW50TWFpblNlcnZpY2U7XG5cdGxldCBzZXJ2aWNlOiBXb3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlO1xuXG5cdGNvbnN0IGN3ZCA9IHByb2Nlc3MuY3dkKCk7XG5cdGNvbnN0IHRtcERpciA9IG9zLnRtcGRpcigpO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHR0ZXN0RGlyID0gZ2V0UmFuZG9tVGVzdFBhdGgodG1wRGlyLCAndnNjdGVzdHMnLCAnd29ya3NwYWNlc21hbmFnZW1lbnRtYWluc2VydmljZScpO1xuXHRcdHVudGl0bGVkV29ya3NwYWNlc0hvbWVQYXRoID0gcGF0aC5qb2luKHRlc3REaXIsICdXb3Jrc3BhY2VzJyk7XG5cblx0XHRjb25zdCBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlID0geyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIC4uLnByb2R1Y3QgfTtcblxuXHRcdGVudmlyb25tZW50TWFpblNlcnZpY2UgPSBuZXcgY2xhc3MgVGVzdEVudmlyb25tZW50U2VydmljZSBleHRlbmRzIEVudmlyb25tZW50TWFpblNlcnZpY2Uge1xuXG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIocGFyc2VBcmdzKHByb2Nlc3MuYXJndiwgT1BUSU9OUyksIHByb2R1Y3RTZXJ2aWNlKTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgZ2V0IHVudGl0bGVkV29ya3NwYWNlc0hvbWUoKTogVVJJIHtcblx0XHRcdFx0cmV0dXJuIFVSSS5maWxlKHVudGl0bGVkV29ya3NwYWNlc0hvbWVQYXRoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IEZpbGVTZXJ2aWNlKGxvZ1NlcnZpY2UpO1xuXHRcdHNlcnZpY2UgPSBuZXcgV29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZShlbnZpcm9ubWVudE1haW5TZXJ2aWNlLCBsb2dTZXJ2aWNlLCBuZXcgVXNlckRhdGFQcm9maWxlc01haW5TZXJ2aWNlKG5ldyBTdGF0ZVNlcnZpY2UoU2F2ZVN0cmF0ZWd5LkRFTEFZRUQsIGVudmlyb25tZW50TWFpblNlcnZpY2UsIGxvZ1NlcnZpY2UsIGZpbGVTZXJ2aWNlKSwgbmV3IFVyaUlkZW50aXR5U2VydmljZShmaWxlU2VydmljZSksIGVudmlyb25tZW50TWFpblNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSksIG5ldyBUZXN0QmFja3VwTWFpblNlcnZpY2UoKSwgbmV3IFRlc3REaWFsb2dNYWluU2VydmljZSgpKTtcblxuXHRcdHJldHVybiBmcy5wcm9taXNlcy5ta2Rpcih1bnRpdGxlZFdvcmtzcGFjZXNIb21lUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblxuXHRcdHJldHVybiBwZnMuUHJvbWlzZXMucm0odGVzdERpcik7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGFzc2VydFBhdGhFcXVhbHMocGF0aEluV29ya3NwYWNlRmlsZTogc3RyaW5nLCBwYXRoT25EaXNrOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRwYXRoSW5Xb3Jrc3BhY2VGaWxlID0gbm9ybWFsaXplRHJpdmVMZXR0ZXIocGF0aEluV29ya3NwYWNlRmlsZSk7XG5cdFx0XHRwYXRoT25EaXNrID0gbm9ybWFsaXplRHJpdmVMZXR0ZXIocGF0aE9uRGlzayk7XG5cdFx0XHRpZiAoIWlzVU5DKHBhdGhPbkRpc2spKSB7XG5cdFx0XHRcdHBhdGhPbkRpc2sgPSB0b1NsYXNoZXMocGF0aE9uRGlzayk7IC8vIHdvcmtzcGFjZSBmaWxlIGlzIHVzaW5nIHNsYXNoZXMgZm9yIGFsbCBwYXRocyBleGNlcHQgd2hlcmUgbWFuZGF0b3J5XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGhJbldvcmtzcGFjZUZpbGUsIHBhdGhPbkRpc2spO1xuXHR9XG5cblx0ZnVuY3Rpb24gYXNzZXJ0RXF1YWxVUkkodTE6IFVSSSwgdTI6IFVSSSk6IHZvaWQge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1MS50b1N0cmluZygpLCB1Mi50b1N0cmluZygpKTtcblx0fVxuXG5cdHRlc3QoJ2NyZWF0ZVdvcmtzcGFjZSAoZm9sZGVycyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gYXdhaXQgY3JlYXRlVW50aXRsZWRXb3Jrc3BhY2UoW2N3ZCwgdG1wRGlyXSk7XG5cdFx0YXNzZXJ0Lm9rKHdvcmtzcGFjZSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMod29ya3NwYWNlLmNvbmZpZ1BhdGguZnNQYXRoKSk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuaXNVbnRpdGxlZFdvcmtzcGFjZSh3b3Jrc3BhY2UpKTtcblxuXHRcdGNvbnN0IHdzID0gKEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKHdvcmtzcGFjZS5jb25maWdQYXRoLmZzUGF0aCkudG9TdHJpbmcoKSkgYXMgSVN0b3JlZFdvcmtzcGFjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmZvbGRlcnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnRQYXRoRXF1YWxzKCg8SVJhd0ZpbGVXb3Jrc3BhY2VGb2xkZXI+d3MuZm9sZGVyc1swXSkucGF0aCwgY3dkKTtcblx0XHRhc3NlcnRQYXRoRXF1YWxzKCg8SVJhd0ZpbGVXb3Jrc3BhY2VGb2xkZXI+d3MuZm9sZGVyc1sxXSkucGF0aCwgdG1wRGlyKTtcblx0XHRhc3NlcnQub2soISg8SVJhd0ZpbGVXb3Jrc3BhY2VGb2xkZXI+d3MuZm9sZGVyc1swXSkubmFtZSk7XG5cdFx0YXNzZXJ0Lm9rKCEoPElSYXdGaWxlV29ya3NwYWNlRm9sZGVyPndzLmZvbGRlcnNbMV0pLm5hbWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVXb3Jrc3BhY2UgKGZvbGRlcnMgd2l0aCBuYW1lKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCBjcmVhdGVVbnRpdGxlZFdvcmtzcGFjZShbY3dkLCB0bXBEaXJdLCBbJ2N1cnJlbnR3b3JraW5nZGlyZWN0b3J5JywgJ3RlbXBkaXInXSk7XG5cdFx0YXNzZXJ0Lm9rKHdvcmtzcGFjZSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMod29ya3NwYWNlLmNvbmZpZ1BhdGguZnNQYXRoKSk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuaXNVbnRpdGxlZFdvcmtzcGFjZSh3b3Jrc3BhY2UpKTtcblxuXHRcdGNvbnN0IHdzID0gKEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKHdvcmtzcGFjZS5jb25maWdQYXRoLmZzUGF0aCkudG9TdHJpbmcoKSkgYXMgSVN0b3JlZFdvcmtzcGFjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmZvbGRlcnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnRQYXRoRXF1YWxzKCg8SVJhd0ZpbGVXb3Jrc3BhY2VGb2xkZXI+d3MuZm9sZGVyc1swXSkucGF0aCwgY3dkKTtcblx0XHRhc3NlcnRQYXRoRXF1YWxzKCg8SVJhd0ZpbGVXb3Jrc3BhY2VGb2xkZXI+d3MuZm9sZGVyc1sxXSkucGF0aCwgdG1wRGlyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxJUmF3RmlsZVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzBdKS5uYW1lLCAnY3VycmVudHdvcmtpbmdkaXJlY3RvcnknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxJUmF3RmlsZVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzFdKS5uYW1lLCAndGVtcGRpcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVVbnRpdGxlZFdvcmtzcGFjZSAoZm9sZGVycyBhcyBvdGhlciByZXNvdXJjZSBVUklzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmb2xkZXIxVVJJID0gVVJJLnBhcnNlKCdteXNjaGVtZTovL3NlcnZlci93b3JrL3AvZjEnKTtcblx0XHRjb25zdCBmb2xkZXIyVVJJID0gVVJJLnBhcnNlKCdteXNjaGVtZTovL3NlcnZlci93b3JrL28vZjMnKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlVW50aXRsZWRXb3Jrc3BhY2UoW3sgdXJpOiBmb2xkZXIxVVJJIH0sIHsgdXJpOiBmb2xkZXIyVVJJIH1dLCAnc2VydmVyJyk7XG5cdFx0YXNzZXJ0Lm9rKHdvcmtzcGFjZSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMod29ya3NwYWNlLmNvbmZpZ1BhdGguZnNQYXRoKSk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuaXNVbnRpdGxlZFdvcmtzcGFjZSh3b3Jrc3BhY2UpKTtcblxuXHRcdGNvbnN0IHdzID0gKEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKHdvcmtzcGFjZS5jb25maWdQYXRoLmZzUGF0aCkudG9TdHJpbmcoKSkgYXMgSVN0b3JlZFdvcmtzcGFjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmZvbGRlcnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxJUmF3VXJpV29ya3NwYWNlRm9sZGVyPndzLmZvbGRlcnNbMF0pLnVyaSwgZm9sZGVyMVVSSS50b1N0cmluZyh0cnVlKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCg8SVJhd1VyaVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzFdKS51cmksIGZvbGRlcjJVUkkudG9TdHJpbmcodHJ1ZSkpO1xuXHRcdGFzc2VydC5vayghKDxJUmF3RmlsZVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzBdKS5uYW1lKTtcblx0XHRhc3NlcnQub2soISg8SVJhd0ZpbGVXb3Jrc3BhY2VGb2xkZXI+d3MuZm9sZGVyc1sxXSkubmFtZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLnJlbW90ZUF1dGhvcml0eSwgJ3NlcnZlcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlV29ya3NwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IGNyZWF0ZVVudGl0bGVkV29ya3NwYWNlKFtjd2QsIHRtcERpcl0pO1xuXHRcdGFzc2VydC5vayhhd2FpdCBzZXJ2aWNlLnJlc29sdmVMb2NhbFdvcmtzcGFjZSh3b3Jrc3BhY2UuY29uZmlnUGF0aCkpO1xuXG5cdFx0Ly8gbWFrZSBpdCBhIHZhbGlkIHdvcmtzcGFjZSBwYXRoXG5cdFx0Y29uc3QgbmV3UGF0aCA9IHBhdGguam9pbihwYXRoLmRpcm5hbWUod29ya3NwYWNlLmNvbmZpZ1BhdGguZnNQYXRoKSwgYHdvcmtzcGFjZS4ke1dPUktTUEFDRV9FWFRFTlNJT059YCk7XG5cdFx0ZnMucmVuYW1lU3luYyh3b3Jrc3BhY2UuY29uZmlnUGF0aC5mc1BhdGgsIG5ld1BhdGgpO1xuXHRcdHdvcmtzcGFjZS5jb25maWdQYXRoID0gVVJJLmZpbGUobmV3UGF0aCk7XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUxvY2FsV29ya3NwYWNlKHdvcmtzcGFjZS5jb25maWdQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMiwgcmVzb2x2ZWQhLmZvbGRlcnMubGVuZ3RoKTtcblx0XHRhc3NlcnRFcXVhbFVSSShyZXNvbHZlZCEuY29uZmlnUGF0aCwgd29ya3NwYWNlLmNvbmZpZ1BhdGgpO1xuXHRcdGFzc2VydC5vayhyZXNvbHZlZCEuaWQpO1xuXHRcdGZzLndyaXRlRmlsZVN5bmMod29ya3NwYWNlLmNvbmZpZ1BhdGguZnNQYXRoLCBKU09OLnN0cmluZ2lmeSh7IHNvbWV0aGluZzogJ3NvbWV0aGluZycgfSkpOyAvLyBpbnZhbGlkIHdvcmtzcGFjZVxuXG5cdFx0Y29uc3QgcmVzb2x2ZWRJbnZhbGlkID0gYXdhaXQgc2VydmljZS5yZXNvbHZlTG9jYWxXb3Jrc3BhY2Uod29ya3NwYWNlLmNvbmZpZ1BhdGgpO1xuXHRcdGFzc2VydC5vayghcmVzb2x2ZWRJbnZhbGlkKTtcblxuXHRcdGZzLndyaXRlRmlsZVN5bmMod29ya3NwYWNlLmNvbmZpZ1BhdGguZnNQYXRoLCBKU09OLnN0cmluZ2lmeSh7IHRyYW5zaWVudDogdHJ1ZSwgZm9sZGVyczogW10gfSkpOyAvLyB0cmFuc2llbnQgd29ya3NhcGNlXG5cdFx0Y29uc3QgcmVzb2x2ZWRUcmFuc2llbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVMb2NhbFdvcmtzcGFjZSh3b3Jrc3BhY2UuY29uZmlnUGF0aCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc29sdmVkVHJhbnNpZW50Py50cmFuc2llbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlV29ya3NwYWNlIChzdXBwb3J0IHJlbGF0aXZlIHBhdGhzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCBjcmVhdGVVbnRpdGxlZFdvcmtzcGFjZShbY3dkLCB0bXBEaXJdKTtcblx0XHRmcy53cml0ZUZpbGVTeW5jKHdvcmtzcGFjZS5jb25maWdQYXRoLmZzUGF0aCwgSlNPTi5zdHJpbmdpZnkoeyBmb2xkZXJzOiBbeyBwYXRoOiAnLi90aWNpbm8tcGxheWdyb3VuZC9saWInIH1dIH0pKTtcblxuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgc2VydmljZS5yZXNvbHZlTG9jYWxXb3Jrc3BhY2Uod29ya3NwYWNlLmNvbmZpZ1BhdGgpO1xuXHRcdGFzc2VydEVxdWFsVVJJKHJlc29sdmVkIS5mb2xkZXJzWzBdLnVyaSwgVVJJLmZpbGUocGF0aC5qb2luKHBhdGguZGlybmFtZSh3b3Jrc3BhY2UuY29uZmlnUGF0aC5mc1BhdGgpLCAndGljaW5vLXBsYXlncm91bmQnLCAnbGliJykpKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVdvcmtzcGFjZSAoc3VwcG9ydCByZWxhdGl2ZSBwYXRocyAjMiknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gYXdhaXQgY3JlYXRlVW50aXRsZWRXb3Jrc3BhY2UoW2N3ZCwgdG1wRGlyXSk7XG5cdFx0ZnMud3JpdGVGaWxlU3luYyh3b3Jrc3BhY2UuY29uZmlnUGF0aC5mc1BhdGgsIEpTT04uc3RyaW5naWZ5KHsgZm9sZGVyczogW3sgcGF0aDogJy4vdGljaW5vLXBsYXlncm91bmQvbGliLy4uL290aGVyJyB9XSB9KSk7XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUxvY2FsV29ya3NwYWNlKHdvcmtzcGFjZS5jb25maWdQYXRoKTtcblx0XHRhc3NlcnRFcXVhbFVSSShyZXNvbHZlZCEuZm9sZGVyc1swXS51cmksIFVSSS5maWxlKHBhdGguam9pbihwYXRoLmRpcm5hbWUod29ya3NwYWNlLmNvbmZpZ1BhdGguZnNQYXRoKSwgJ3RpY2luby1wbGF5Z3JvdW5kJywgJ290aGVyJykpKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVdvcmtzcGFjZSAoc3VwcG9ydCByZWxhdGl2ZSBwYXRocyAjMyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gYXdhaXQgY3JlYXRlVW50aXRsZWRXb3Jrc3BhY2UoW2N3ZCwgdG1wRGlyXSk7XG5cdFx0ZnMud3JpdGVGaWxlU3luYyh3b3Jrc3BhY2UuY29uZmlnUGF0aC5mc1BhdGgsIEpTT04uc3RyaW5naWZ5KHsgZm9sZGVyczogW3sgcGF0aDogJ3RpY2luby1wbGF5Z3JvdW5kL2xpYicgfV0gfSkpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVMb2NhbFdvcmtzcGFjZSh3b3Jrc3BhY2UuY29uZmlnUGF0aCk7XG5cdFx0YXNzZXJ0RXF1YWxVUkkocmVzb2x2ZWQhLmZvbGRlcnNbMF0udXJpLCBVUkkuZmlsZShwYXRoLmpvaW4ocGF0aC5kaXJuYW1lKHdvcmtzcGFjZS5jb25maWdQYXRoLmZzUGF0aCksICd0aWNpbm8tcGxheWdyb3VuZCcsICdsaWInKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlV29ya3NwYWNlIChzdXBwb3J0IGludmFsaWQgSlNPTiB2aWEgZmF1bHQgdG9sZXJhbnQgcGFyc2luZyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gYXdhaXQgY3JlYXRlVW50aXRsZWRXb3Jrc3BhY2UoW2N3ZCwgdG1wRGlyXSk7XG5cdFx0ZnMud3JpdGVGaWxlU3luYyh3b3Jrc3BhY2UuY29uZmlnUGF0aC5mc1BhdGgsICd7IFwiZm9sZGVyc1wiOiBbIHsgXCJwYXRoXCI6IFwiLi90aWNpbm8tcGxheWdyb3VuZC9saWJcIiB9ICwgXSB9Jyk7IC8vIHRyYWlsaW5nIGNvbW1hXG5cblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUxvY2FsV29ya3NwYWNlKHdvcmtzcGFjZS5jb25maWdQYXRoKTtcblx0XHRhc3NlcnRFcXVhbFVSSShyZXNvbHZlZCEuZm9sZGVyc1swXS51cmksIFVSSS5maWxlKHBhdGguam9pbihwYXRoLmRpcm5hbWUod29ya3NwYWNlLmNvbmZpZ1BhdGguZnNQYXRoKSwgJ3RpY2luby1wbGF5Z3JvdW5kJywgJ2xpYicpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jld3JpdGVXb3Jrc3BhY2VGaWxlRm9yTmV3TG9jYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZm9sZGVyMSA9IGN3ZDsgIC8vIGFic29sdXRlIHBhdGggYmVjYXVzZSBvdXRzaWRlIG9mIHRtcERpclxuXHRcdGNvbnN0IHRtcEluc2lkZURpciA9IHBhdGguam9pbih0bXBEaXIsICdpbnNpZGUnKTtcblxuXHRcdGNvbnN0IGZpcnN0Q29uZmlnUGF0aCA9IHBhdGguam9pbih0bXBEaXIsICdteXdvcmtzcGFjZTAuY29kZS13b3Jrc3BhY2UnKTtcblx0XHRjcmVhdGVXb3Jrc3BhY2UoZmlyc3RDb25maWdQYXRoLCBbZm9sZGVyMSwgJ2luc2lkZScsIHBhdGguam9pbignaW5zaWRlJywgJ3NvbWVmb2xkZXInKV0pO1xuXHRcdGNvbnN0IG9yaWdDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGZpcnN0Q29uZmlnUGF0aCkudG9TdHJpbmcoKTtcblxuXHRcdGxldCBvcmlnQ29uZmlnUGF0aCA9IFVSSS5maWxlKGZpcnN0Q29uZmlnUGF0aCk7XG5cdFx0bGV0IHdvcmtzcGFjZUNvbmZpZ1BhdGggPSBVUkkuZmlsZShwYXRoLmpvaW4odG1wRGlyLCAnaW5zaWRlJywgJ215d29ya3NwYWNlMS5jb2RlLXdvcmtzcGFjZScpKTtcblx0XHRsZXQgbmV3Q29udGVudCA9IHJld3JpdGVXb3Jrc3BhY2VGaWxlRm9yTmV3TG9jYXRpb24ob3JpZ0NvbnRlbnQsIG9yaWdDb25maWdQYXRoLCBmYWxzZSwgd29ya3NwYWNlQ29uZmlnUGF0aCwgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UpO1xuXHRcdGxldCB3cyA9IChKU09OLnBhcnNlKG5ld0NvbnRlbnQpIGFzIElTdG9yZWRXb3Jrc3BhY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5mb2xkZXJzLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0UGF0aEVxdWFscygoPElSYXdGaWxlV29ya3NwYWNlRm9sZGVyPndzLmZvbGRlcnNbMF0pLnBhdGgsIGZvbGRlcjEpOyAvLyBhYnNvbHV0ZSBwYXRoIGJlY2F1c2Ugb3V0c2lkZSBvZiB0bXBkaXJcblx0XHRhc3NlcnRQYXRoRXF1YWxzKCg8SVJhd0ZpbGVXb3Jrc3BhY2VGb2xkZXI+d3MuZm9sZGVyc1sxXSkucGF0aCwgJy4nKTtcblx0XHRhc3NlcnRQYXRoRXF1YWxzKCg8SVJhd0ZpbGVXb3Jrc3BhY2VGb2xkZXI+d3MuZm9sZGVyc1syXSkucGF0aCwgJ3NvbWVmb2xkZXInKTtcblxuXHRcdG9yaWdDb25maWdQYXRoID0gd29ya3NwYWNlQ29uZmlnUGF0aDtcblx0XHR3b3Jrc3BhY2VDb25maWdQYXRoID0gVVJJLmZpbGUocGF0aC5qb2luKHRtcERpciwgJ215d29ya3NwYWNlMi5jb2RlLXdvcmtzcGFjZScpKTtcblx0XHRuZXdDb250ZW50ID0gcmV3cml0ZVdvcmtzcGFjZUZpbGVGb3JOZXdMb2NhdGlvbihuZXdDb250ZW50LCBvcmlnQ29uZmlnUGF0aCwgZmFsc2UsIHdvcmtzcGFjZUNvbmZpZ1BhdGgsIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlKTtcblx0XHR3cyA9IChKU09OLnBhcnNlKG5ld0NvbnRlbnQpIGFzIElTdG9yZWRXb3Jrc3BhY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5mb2xkZXJzLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0UGF0aEVxdWFscygoPElSYXdGaWxlV29ya3NwYWNlRm9sZGVyPndzLmZvbGRlcnNbMF0pLnBhdGgsIGZvbGRlcjEpO1xuXHRcdGFzc2VydFBhdGhFcXVhbHMoKDxJUmF3RmlsZVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzFdKS5wYXRoLCAnaW5zaWRlJyk7XG5cdFx0YXNzZXJ0UGF0aEVxdWFscygoPElSYXdGaWxlV29ya3NwYWNlRm9sZGVyPndzLmZvbGRlcnNbMl0pLnBhdGgsICdpbnNpZGUvc29tZWZvbGRlcicpO1xuXG5cdFx0b3JpZ0NvbmZpZ1BhdGggPSB3b3Jrc3BhY2VDb25maWdQYXRoO1xuXHRcdHdvcmtzcGFjZUNvbmZpZ1BhdGggPSBVUkkuZmlsZShwYXRoLmpvaW4odG1wRGlyLCAnb3RoZXInLCAnbXl3b3Jrc3BhY2UyLmNvZGUtd29ya3NwYWNlJykpO1xuXHRcdG5ld0NvbnRlbnQgPSByZXdyaXRlV29ya3NwYWNlRmlsZUZvck5ld0xvY2F0aW9uKG5ld0NvbnRlbnQsIG9yaWdDb25maWdQYXRoLCBmYWxzZSwgd29ya3NwYWNlQ29uZmlnUGF0aCwgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UpO1xuXHRcdHdzID0gKEpTT04ucGFyc2UobmV3Q29udGVudCkgYXMgSVN0b3JlZFdvcmtzcGFjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmZvbGRlcnMubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnRQYXRoRXF1YWxzKCg8SVJhd0ZpbGVXb3Jrc3BhY2VGb2xkZXI+d3MuZm9sZGVyc1swXSkucGF0aCwgZm9sZGVyMSk7XG5cdFx0YXNzZXJ0UGF0aEVxdWFscygoPElSYXdGaWxlV29ya3NwYWNlRm9sZGVyPndzLmZvbGRlcnNbMV0pLnBhdGgsICcuLi9pbnNpZGUnKTtcblx0XHRhc3NlcnRQYXRoRXF1YWxzKCg8SVJhd0ZpbGVXb3Jrc3BhY2VGb2xkZXI+d3MuZm9sZGVyc1syXSkucGF0aCwgJy4uL2luc2lkZS9zb21lZm9sZGVyJyk7XG5cblx0XHRvcmlnQ29uZmlnUGF0aCA9IHdvcmtzcGFjZUNvbmZpZ1BhdGg7XG5cdFx0d29ya3NwYWNlQ29uZmlnUGF0aCA9IFVSSS5wYXJzZSgnZm9vOi8vZm9vL2Jhci9teXdvcmtzcGFjZTIuY29kZS13b3Jrc3BhY2UnKTtcblx0XHRuZXdDb250ZW50ID0gcmV3cml0ZVdvcmtzcGFjZUZpbGVGb3JOZXdMb2NhdGlvbihuZXdDb250ZW50LCBvcmlnQ29uZmlnUGF0aCwgZmFsc2UsIHdvcmtzcGFjZUNvbmZpZ1BhdGgsIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlKTtcblx0XHR3cyA9IChKU09OLnBhcnNlKG5ld0NvbnRlbnQpIGFzIElTdG9yZWRXb3Jrc3BhY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cy5mb2xkZXJzLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCg8SVJhd1VyaVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzBdKS51cmksIFVSSS5maWxlKGZvbGRlcjEpLnRvU3RyaW5nKHRydWUpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxJUmF3VXJpV29ya3NwYWNlRm9sZGVyPndzLmZvbGRlcnNbMV0pLnVyaSwgVVJJLmZpbGUodG1wSW5zaWRlRGlyKS50b1N0cmluZyh0cnVlKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCg8SVJhd1VyaVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzJdKS51cmksIFVSSS5maWxlKHBhdGguam9pbih0bXBJbnNpZGVEaXIsICdzb21lZm9sZGVyJykpLnRvU3RyaW5nKHRydWUpKTtcblxuXHRcdGZzLnVubGlua1N5bmMoZmlyc3RDb25maWdQYXRoKTtcblx0fSk7XG5cblx0dGVzdCgncmV3cml0ZVdvcmtzcGFjZUZpbGVGb3JOZXdMb2NhdGlvbiAocHJlc2VydmVzIGNvbW1lbnRzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCBjcmVhdGVVbnRpdGxlZFdvcmtzcGFjZShbY3dkLCB0bXBEaXIsIHBhdGguam9pbih0bXBEaXIsICdzb21lZm9sZGVyJyldKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VDb25maWdQYXRoID0gVVJJLmZpbGUocGF0aC5qb2luKHRtcERpciwgYG15d29ya3NwYWNlLiR7RGF0ZS5ub3coKX0uJHtXT1JLU1BBQ0VfRVhURU5TSU9OfWApKTtcblxuXHRcdGxldCBvcmlnQ29udGVudCA9IGZzLnJlYWRGaWxlU3luYyh3b3Jrc3BhY2UuY29uZmlnUGF0aC5mc1BhdGgpLnRvU3RyaW5nKCk7XG5cdFx0b3JpZ0NvbnRlbnQgPSBgLy8gdGhpcyBpcyBhIGNvbW1lbnRcXG4ke29yaWdDb250ZW50fWA7XG5cblx0XHRjb25zdCBuZXdDb250ZW50ID0gcmV3cml0ZVdvcmtzcGFjZUZpbGVGb3JOZXdMb2NhdGlvbihvcmlnQ29udGVudCwgd29ya3NwYWNlLmNvbmZpZ1BhdGgsIGZhbHNlLCB3b3Jrc3BhY2VDb25maWdQYXRoLCBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDAsIG5ld0NvbnRlbnQuaW5kZXhPZignLy8gdGhpcyBpcyBhIGNvbW1lbnQnKSk7XG5cdFx0YXdhaXQgc2VydmljZS5kZWxldGVVbnRpdGxlZFdvcmtzcGFjZSh3b3Jrc3BhY2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXdyaXRlV29ya3NwYWNlRmlsZUZvck5ld0xvY2F0aW9uIChwcmVzZXJ2ZXMgZm9yd2FyZCBzbGFzaGVzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCBjcmVhdGVVbnRpdGxlZFdvcmtzcGFjZShbY3dkLCB0bXBEaXIsIHBhdGguam9pbih0bXBEaXIsICdzb21lZm9sZGVyJyldKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VDb25maWdQYXRoID0gVVJJLmZpbGUocGF0aC5qb2luKHRtcERpciwgYG15d29ya3NwYWNlLiR7RGF0ZS5ub3coKX0uJHtXT1JLU1BBQ0VfRVhURU5TSU9OfWApKTtcblxuXHRcdGxldCBvcmlnQ29udGVudCA9IGZzLnJlYWRGaWxlU3luYyh3b3Jrc3BhY2UuY29uZmlnUGF0aC5mc1BhdGgpLnRvU3RyaW5nKCk7XG5cdFx0b3JpZ0NvbnRlbnQgPSBvcmlnQ29udGVudC5yZXBsYWNlKC9bXFxcXF0vZywgJy8nKTsgLy8gY29udmVydCBiYWNrc2xhc2ggdG8gc2xhc2hcblxuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSByZXdyaXRlV29ya3NwYWNlRmlsZUZvck5ld0xvY2F0aW9uKG9yaWdDb250ZW50LCB3b3Jrc3BhY2UuY29uZmlnUGF0aCwgZmFsc2UsIHdvcmtzcGFjZUNvbmZpZ1BhdGgsIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlKTtcblx0XHRjb25zdCB3cyA9IChKU09OLnBhcnNlKG5ld0NvbnRlbnQpIGFzIElTdG9yZWRXb3Jrc3BhY2UpO1xuXHRcdGFzc2VydC5vayh3cy5mb2xkZXJzLmV2ZXJ5KGYgPT4gKDxJUmF3RmlsZVdvcmtzcGFjZUZvbGRlcj5mKS5wYXRoLmluZGV4T2YoJ1xcXFwnKSA8IDApKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmRlbGV0ZVVudGl0bGVkV29ya3NwYWNlKHdvcmtzcGFjZSk7XG5cdH0pO1xuXG5cdCghaXNXaW5kb3dzID8gdGVzdC5za2lwIDogdGVzdCkoJ3Jld3JpdGVXb3Jrc3BhY2VGaWxlRm9yTmV3TG9jYXRpb24gKHVuYyBwYXRocyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlTG9jYXRpb24gPSBwYXRoLmpvaW4odG1wRGlyLCAnd3Nsb2MnKTtcblx0XHRjb25zdCBmb2xkZXIxTG9jYXRpb24gPSAneDpcXFxcZm9vJztcblx0XHRjb25zdCBmb2xkZXIyTG9jYXRpb24gPSAnXFxcXFxcXFxzZXJ2ZXJcXFxcc2hhcmUyXFxcXHNvbWVcXFxccGF0aCc7XG5cdFx0Y29uc3QgZm9sZGVyM0xvY2F0aW9uID0gcGF0aC5qb2luKHdvcmtzcGFjZUxvY2F0aW9uLCAnaW5uZXInLCAnbW9yZScpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gYXdhaXQgY3JlYXRlVW50aXRsZWRXb3Jrc3BhY2UoW2ZvbGRlcjFMb2NhdGlvbiwgZm9sZGVyMkxvY2F0aW9uLCBmb2xkZXIzTG9jYXRpb25dKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VDb25maWdQYXRoID0gVVJJLmZpbGUocGF0aC5qb2luKHdvcmtzcGFjZUxvY2F0aW9uLCBgbXl3b3Jrc3BhY2UuJHtEYXRlLm5vdygpfS4ke1dPUktTUEFDRV9FWFRFTlNJT059YCkpO1xuXHRcdGNvbnN0IG9yaWdDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKHdvcmtzcGFjZS5jb25maWdQYXRoLmZzUGF0aCkudG9TdHJpbmcoKTtcblx0XHRjb25zdCBuZXdDb250ZW50ID0gcmV3cml0ZVdvcmtzcGFjZUZpbGVGb3JOZXdMb2NhdGlvbihvcmlnQ29udGVudCwgd29ya3NwYWNlLmNvbmZpZ1BhdGgsIHRydWUsIHdvcmtzcGFjZUNvbmZpZ1BhdGgsIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlKTtcblx0XHRjb25zdCB3cyA9IChKU09OLnBhcnNlKG5ld0NvbnRlbnQpIGFzIElTdG9yZWRXb3Jrc3BhY2UpO1xuXHRcdGFzc2VydFBhdGhFcXVhbHMoKDxJUmF3RmlsZVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzBdKS5wYXRoLCBmb2xkZXIxTG9jYXRpb24pO1xuXHRcdGFzc2VydFBhdGhFcXVhbHMoKDxJUmF3RmlsZVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzFdKS5wYXRoLCBmb2xkZXIyTG9jYXRpb24pO1xuXHRcdGFzc2VydFBhdGhFcXVhbHMoKDxJUmF3RmlsZVdvcmtzcGFjZUZvbGRlcj53cy5mb2xkZXJzWzJdKS5wYXRoLCAnaW5uZXIvbW9yZScpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5kZWxldGVVbnRpdGxlZFdvcmtzcGFjZSh3b3Jrc3BhY2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVVbnRpdGxlZFdvcmtzcGFjZSAodW50aXRsZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IGNyZWF0ZVVudGl0bGVkV29ya3NwYWNlKFtjd2QsIHRtcERpcl0pO1xuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKHdvcmtzcGFjZS5jb25maWdQYXRoLmZzUGF0aCkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuZGVsZXRlVW50aXRsZWRXb3Jrc3BhY2Uod29ya3NwYWNlKTtcblx0XHRhc3NlcnQub2soIWZzLmV4aXN0c1N5bmMod29ya3NwYWNlLmNvbmZpZ1BhdGguZnNQYXRoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVVudGl0bGVkV29ya3NwYWNlIChzYXZlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gYXdhaXQgY3JlYXRlVW50aXRsZWRXb3Jrc3BhY2UoW2N3ZCwgdG1wRGlyXSk7XG5cdFx0YXdhaXQgc2VydmljZS5kZWxldGVVbnRpdGxlZFdvcmtzcGFjZSh3b3Jrc3BhY2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRVbnRpdGxlZFdvcmtzcGFjZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRsZXQgdW50aXRsZWQgPSBzZXJ2aWNlLmdldFVudGl0bGVkV29ya3NwYWNlcygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnRpdGxlZC5sZW5ndGgsIDApO1xuXG5cdFx0Y29uc3QgdW50aXRsZWRPbmUgPSBhd2FpdCBjcmVhdGVVbnRpdGxlZFdvcmtzcGFjZShbY3dkLCB0bXBEaXJdKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyh1bnRpdGxlZE9uZS5jb25maWdQYXRoLmZzUGF0aCkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0dW50aXRsZWQgPSBzZXJ2aWNlLmdldFVudGl0bGVkV29ya3NwYWNlcygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgxLCB1bnRpdGxlZC5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnRpdGxlZE9uZS5pZCwgdW50aXRsZWRbMF0ud29ya3NwYWNlLmlkKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuZGVsZXRlVW50aXRsZWRXb3Jrc3BhY2UodW50aXRsZWRPbmUpO1xuXHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdHVudGl0bGVkID0gc2VydmljZS5nZXRVbnRpdGxlZFdvcmtzcGFjZXMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMCwgdW50aXRsZWQubGVuZ3RoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFFBQVE7QUFDcEIsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsT0FBTyxpQkFBaUI7QUFDakMsU0FBUyw0QkFBNEI7QUFDckMsWUFBWSxVQUFVO0FBQ3RCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsV0FBVztBQUNwQixZQUFZLFNBQVM7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxZQUFZLHlCQUF5QjtBQU05QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLFNBQVMsaUJBQWlCO0FBQ25DLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCO0FBQy9CLE9BQU8sYUFBYTtBQUVwQixTQUFTLGNBQWMsb0JBQW9CO0FBQzNDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsbUNBQW1DO0FBQzVDLFNBQTBELDJCQUEyQjtBQUNyRixTQUFpRiwwQ0FBMEM7QUFDM0gsU0FBUyx1Q0FBdUM7QUFFaEQsV0FBVyxtQ0FBbUMsTUFBTTtBQUFBLEVBRW5ELE1BQU0sc0JBQW9EO0FBQUEsSUFJekQsZUFBZSxTQUFtQyxRQUE0RTtBQUFFLFlBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLElBQUc7QUFBQSxJQUM1SyxXQUFXLFNBQW1DLFFBQTRFO0FBQUUsWUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsSUFBRztBQUFBLElBQ3hLLFNBQVMsU0FBbUMsUUFBNEU7QUFBRSxZQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxJQUFHO0FBQUEsSUFDdEssY0FBYyxTQUFtQyxRQUE0RTtBQUFFLFlBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLElBQUc7QUFBQSxJQUMzSyxlQUFlLFNBQXFDLFFBQXNGO0FBQUUsWUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsSUFBRztBQUFBLElBQ3hMLGVBQWUsU0FBcUMsUUFBc0Y7QUFBRSxZQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxJQUFHO0FBQUEsSUFDeEwsZUFBZSxTQUFxQyxRQUFzRjtBQUFFLFlBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLElBQUc7QUFBQSxFQUN6TDtBQUFBLEVBRUEsTUFBTSxzQkFBb0Q7QUFBQSxJQUl6RCxtQkFBNEI7QUFBRSxZQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxJQUFHO0FBQUEsSUFDMUUsd0JBQWtEO0FBQUUsWUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsSUFBRztBQUFBLElBR2hHLHdCQUF3QixlQUF3QixhQUFpRDtBQUFFLFlBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLElBQUc7QUFBQSxJQUMvSSxxQkFBcUIsUUFBbUM7QUFBRSxZQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxJQUFHO0FBQUEsSUFDdEcsMEJBQTBCLE9BQXVDO0FBQUUsWUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsSUFBRztBQUFBLElBQy9HLE1BQU0scUJBQTRFO0FBQUUsYUFBTyxDQUFDO0FBQUEsSUFBRztBQUFBLEVBQ2hHO0FBRUEsV0FBUyx3QkFBd0IsU0FBbUIsT0FBa0I7QUFDckUsV0FBTyxRQUFRLHdCQUF3QixRQUFRLElBQUksQ0FBQyxRQUFRLFdBQVcsRUFBRSxLQUFLLElBQUksS0FBSyxNQUFNLEdBQUcsTUFBTSxRQUFRLE1BQU0sS0FBSyxJQUFJLE9BQVUsRUFBa0MsQ0FBQztBQUFBLEVBQzNLO0FBRUEsV0FBUyxnQkFBZ0IscUJBQTZCLFNBQTJCLE9BQXdCO0FBQ3hHLFVBQU0sS0FBdUI7QUFBQSxNQUM1QixTQUFTLENBQUM7QUFBQSxJQUNYO0FBRUEsYUFBUyxJQUFJLEdBQUcsSUFBSSxRQUFRLFFBQVEsS0FBSztBQUN4QyxZQUFNLElBQUksUUFBUSxDQUFDO0FBQ25CLFlBQU0sSUFBNEIsYUFBYSxNQUFNLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFO0FBQ3ZGLFVBQUksT0FBTztBQUNWLFVBQUUsT0FBTyxNQUFNLENBQUM7QUFBQSxNQUNqQjtBQUNBLFNBQUcsUUFBUSxLQUFLLENBQUM7QUFBQSxJQUNsQjtBQUVBLE9BQUcsY0FBYyxxQkFBcUIsS0FBSyxVQUFVLEVBQUUsQ0FBQztBQUFBLEVBQ3pEO0FBRUEsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUVKLFFBQU0sTUFBTSxRQUFRLElBQUk7QUFDeEIsUUFBTSxTQUFTLEdBQUcsT0FBTztBQUV6QixRQUFNLFlBQVk7QUFDakIsY0FBVSxrQkFBa0IsUUFBUSxZQUFZLGlDQUFpQztBQUNqRixpQ0FBNkIsS0FBSyxLQUFLLFNBQVMsWUFBWTtBQUU1RCxVQUFNLGlCQUFrQyxFQUFFLGVBQWUsUUFBVyxHQUFHLFFBQVE7QUFFL0UsNkJBQXlCLElBQUksTUFBTSwrQkFBK0IsdUJBQXVCO0FBQUEsTUFFeEYsY0FBYztBQUNiLGNBQU0sVUFBVSxRQUFRLE1BQU0sT0FBTyxHQUFHLGNBQWM7QUFBQSxNQUN2RDtBQUFBLE1BRUEsSUFBYSx5QkFBOEI7QUFDMUMsZUFBTyxJQUFJLEtBQUssMEJBQTBCO0FBQUEsTUFDM0M7QUFBQSxJQUNEO0FBRUEsVUFBTSxhQUFhLElBQUksZUFBZTtBQUN0QyxVQUFNLGNBQWMsSUFBSSxZQUFZLFVBQVU7QUFDOUMsY0FBVSxJQUFJLGdDQUFnQyx3QkFBd0IsWUFBWSxJQUFJLDRCQUE0QixJQUFJLGFBQWEsYUFBYSxTQUFTLHdCQUF3QixZQUFZLFdBQVcsR0FBRyxJQUFJLG1CQUFtQixXQUFXLEdBQUcsd0JBQXdCLGFBQWEsWUFBWSxjQUFjLEdBQUcsSUFBSSxzQkFBc0IsR0FBRyxJQUFJLHNCQUFzQixDQUFDO0FBRTFXLFdBQU8sR0FBRyxTQUFTLE1BQU0sNEJBQTRCLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFBQSxFQUN6RSxDQUFDO0FBRUQsV0FBUyxNQUFNO0FBQ2QsWUFBUSxRQUFRO0FBRWhCLFdBQU8sSUFBSSxTQUFTLEdBQUcsT0FBTztBQUFBLEVBQy9CLENBQUM7QUFFRCxXQUFTLGlCQUFpQixxQkFBNkIsWUFBMEI7QUFDaEYsUUFBSSxXQUFXO0FBQ2QsNEJBQXNCLHFCQUFxQixtQkFBbUI7QUFDOUQsbUJBQWEscUJBQXFCLFVBQVU7QUFDNUMsVUFBSSxDQUFDLE1BQU0sVUFBVSxHQUFHO0FBQ3ZCLHFCQUFhLFVBQVUsVUFBVTtBQUFBLE1BQ2xDO0FBQUEsSUFDRDtBQUVBLFdBQU8sWUFBWSxxQkFBcUIsVUFBVTtBQUFBLEVBQ25EO0FBRUEsV0FBUyxlQUFlLElBQVMsSUFBZTtBQUMvQyxXQUFPLFlBQVksR0FBRyxTQUFTLEdBQUcsR0FBRyxTQUFTLENBQUM7QUFBQSxFQUNoRDtBQUVBLE9BQUssNkJBQTZCLFlBQVk7QUFDN0MsVUFBTSxZQUFZLE1BQU0sd0JBQXdCLENBQUMsS0FBSyxNQUFNLENBQUM7QUFDN0QsV0FBTyxHQUFHLFNBQVM7QUFDbkIsV0FBTyxHQUFHLEdBQUcsV0FBVyxVQUFVLFdBQVcsTUFBTSxDQUFDO0FBQ3BELFdBQU8sR0FBRyxRQUFRLG9CQUFvQixTQUFTLENBQUM7QUFFaEQsVUFBTSxLQUFNLEtBQUssTUFBTSxHQUFHLGFBQWEsVUFBVSxXQUFXLE1BQU0sRUFBRSxTQUFTLENBQUM7QUFDOUUsV0FBTyxZQUFZLEdBQUcsUUFBUSxRQUFRLENBQUM7QUFDdkMscUJBQTJDLEdBQUcsUUFBUSxDQUFDLEVBQUcsTUFBTSxHQUFHO0FBQ25FLHFCQUEyQyxHQUFHLFFBQVEsQ0FBQyxFQUFHLE1BQU0sTUFBTTtBQUN0RSxXQUFPLEdBQUcsQ0FBMkIsR0FBRyxRQUFRLENBQUMsRUFBRyxJQUFJO0FBQ3hELFdBQU8sR0FBRyxDQUEyQixHQUFHLFFBQVEsQ0FBQyxFQUFHLElBQUk7QUFBQSxFQUN6RCxDQUFDO0FBRUQsT0FBSyx1Q0FBdUMsWUFBWTtBQUN2RCxVQUFNLFlBQVksTUFBTSx3QkFBd0IsQ0FBQyxLQUFLLE1BQU0sR0FBRyxDQUFDLDJCQUEyQixTQUFTLENBQUM7QUFDckcsV0FBTyxHQUFHLFNBQVM7QUFDbkIsV0FBTyxHQUFHLEdBQUcsV0FBVyxVQUFVLFdBQVcsTUFBTSxDQUFDO0FBQ3BELFdBQU8sR0FBRyxRQUFRLG9CQUFvQixTQUFTLENBQUM7QUFFaEQsVUFBTSxLQUFNLEtBQUssTUFBTSxHQUFHLGFBQWEsVUFBVSxXQUFXLE1BQU0sRUFBRSxTQUFTLENBQUM7QUFDOUUsV0FBTyxZQUFZLEdBQUcsUUFBUSxRQUFRLENBQUM7QUFDdkMscUJBQTJDLEdBQUcsUUFBUSxDQUFDLEVBQUcsTUFBTSxHQUFHO0FBQ25FLHFCQUEyQyxHQUFHLFFBQVEsQ0FBQyxFQUFHLE1BQU0sTUFBTTtBQUN0RSxXQUFPLFlBQXNDLEdBQUcsUUFBUSxDQUFDLEVBQUcsTUFBTSx5QkFBeUI7QUFDM0YsV0FBTyxZQUFzQyxHQUFHLFFBQVEsQ0FBQyxFQUFHLE1BQU0sU0FBUztBQUFBLEVBQzVFLENBQUM7QUFFRCxPQUFLLDREQUE0RCxZQUFZO0FBQzVFLFVBQU0sYUFBYSxJQUFJLE1BQU0sNkJBQTZCO0FBQzFELFVBQU0sYUFBYSxJQUFJLE1BQU0sNkJBQTZCO0FBRTFELFVBQU0sWUFBWSxNQUFNLFFBQVEsd0JBQXdCLENBQUMsRUFBRSxLQUFLLFdBQVcsR0FBRyxFQUFFLEtBQUssV0FBVyxDQUFDLEdBQUcsUUFBUTtBQUM1RyxXQUFPLEdBQUcsU0FBUztBQUNuQixXQUFPLEdBQUcsR0FBRyxXQUFXLFVBQVUsV0FBVyxNQUFNLENBQUM7QUFDcEQsV0FBTyxHQUFHLFFBQVEsb0JBQW9CLFNBQVMsQ0FBQztBQUVoRCxVQUFNLEtBQU0sS0FBSyxNQUFNLEdBQUcsYUFBYSxVQUFVLFdBQVcsTUFBTSxFQUFFLFNBQVMsQ0FBQztBQUM5RSxXQUFPLFlBQVksR0FBRyxRQUFRLFFBQVEsQ0FBQztBQUN2QyxXQUFPLFlBQXFDLEdBQUcsUUFBUSxDQUFDLEVBQUcsS0FBSyxXQUFXLFNBQVMsSUFBSSxDQUFDO0FBQ3pGLFdBQU8sWUFBcUMsR0FBRyxRQUFRLENBQUMsRUFBRyxLQUFLLFdBQVcsU0FBUyxJQUFJLENBQUM7QUFDekYsV0FBTyxHQUFHLENBQTJCLEdBQUcsUUFBUSxDQUFDLEVBQUcsSUFBSTtBQUN4RCxXQUFPLEdBQUcsQ0FBMkIsR0FBRyxRQUFRLENBQUMsRUFBRyxJQUFJO0FBQ3hELFdBQU8sWUFBWSxHQUFHLGlCQUFpQixRQUFRO0FBQUEsRUFDaEQsQ0FBQztBQUVELE9BQUssb0JBQW9CLFlBQVk7QUFDcEMsVUFBTSxZQUFZLE1BQU0sd0JBQXdCLENBQUMsS0FBSyxNQUFNLENBQUM7QUFDN0QsV0FBTyxHQUFHLE1BQU0sUUFBUSxzQkFBc0IsVUFBVSxVQUFVLENBQUM7QUFHbkUsVUFBTSxVQUFVLEtBQUssS0FBSyxLQUFLLFFBQVEsVUFBVSxXQUFXLE1BQU0sR0FBRyxhQUFhLG1CQUFtQixFQUFFO0FBQ3ZHLE9BQUcsV0FBVyxVQUFVLFdBQVcsUUFBUSxPQUFPO0FBQ2xELGNBQVUsYUFBYSxJQUFJLEtBQUssT0FBTztBQUV2QyxVQUFNLFdBQVcsTUFBTSxRQUFRLHNCQUFzQixVQUFVLFVBQVU7QUFDekUsV0FBTyxZQUFZLEdBQUcsU0FBVSxRQUFRLE1BQU07QUFDOUMsbUJBQWUsU0FBVSxZQUFZLFVBQVUsVUFBVTtBQUN6RCxXQUFPLEdBQUcsU0FBVSxFQUFFO0FBQ3RCLE9BQUcsY0FBYyxVQUFVLFdBQVcsUUFBUSxLQUFLLFVBQVUsRUFBRSxXQUFXLFlBQVksQ0FBQyxDQUFDO0FBRXhGLFVBQU0sa0JBQWtCLE1BQU0sUUFBUSxzQkFBc0IsVUFBVSxVQUFVO0FBQ2hGLFdBQU8sR0FBRyxDQUFDLGVBQWU7QUFFMUIsT0FBRyxjQUFjLFVBQVUsV0FBVyxRQUFRLEtBQUssVUFBVSxFQUFFLFdBQVcsTUFBTSxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDOUYsVUFBTSxvQkFBb0IsTUFBTSxRQUFRLHNCQUFzQixVQUFVLFVBQVU7QUFDbEYsV0FBTyxHQUFHLG1CQUFtQixTQUFTO0FBQUEsRUFDdkMsQ0FBQztBQUVELE9BQUssNkNBQTZDLFlBQVk7QUFDN0QsVUFBTSxZQUFZLE1BQU0sd0JBQXdCLENBQUMsS0FBSyxNQUFNLENBQUM7QUFDN0QsT0FBRyxjQUFjLFVBQVUsV0FBVyxRQUFRLEtBQUssVUFBVSxFQUFFLFNBQVMsQ0FBQyxFQUFFLE1BQU0sMEJBQTBCLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFaEgsVUFBTSxXQUFXLE1BQU0sUUFBUSxzQkFBc0IsVUFBVSxVQUFVO0FBQ3pFLG1CQUFlLFNBQVUsUUFBUSxDQUFDLEVBQUUsS0FBSyxJQUFJLEtBQUssS0FBSyxLQUFLLEtBQUssUUFBUSxVQUFVLFdBQVcsTUFBTSxHQUFHLHFCQUFxQixLQUFLLENBQUMsQ0FBQztBQUFBLEVBQ3BJLENBQUM7QUFFRCxPQUFLLGdEQUFnRCxZQUFZO0FBQ2hFLFVBQU0sWUFBWSxNQUFNLHdCQUF3QixDQUFDLEtBQUssTUFBTSxDQUFDO0FBQzdELE9BQUcsY0FBYyxVQUFVLFdBQVcsUUFBUSxLQUFLLFVBQVUsRUFBRSxTQUFTLENBQUMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBRXpILFVBQU0sV0FBVyxNQUFNLFFBQVEsc0JBQXNCLFVBQVUsVUFBVTtBQUN6RSxtQkFBZSxTQUFVLFFBQVEsQ0FBQyxFQUFFLEtBQUssSUFBSSxLQUFLLEtBQUssS0FBSyxLQUFLLFFBQVEsVUFBVSxXQUFXLE1BQU0sR0FBRyxxQkFBcUIsT0FBTyxDQUFDLENBQUM7QUFBQSxFQUN0SSxDQUFDO0FBRUQsT0FBSyxnREFBZ0QsWUFBWTtBQUNoRSxVQUFNLFlBQVksTUFBTSx3QkFBd0IsQ0FBQyxLQUFLLE1BQU0sQ0FBQztBQUM3RCxPQUFHLGNBQWMsVUFBVSxXQUFXLFFBQVEsS0FBSyxVQUFVLEVBQUUsU0FBUyxDQUFDLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUU5RyxVQUFNLFdBQVcsTUFBTSxRQUFRLHNCQUFzQixVQUFVLFVBQVU7QUFDekUsbUJBQWUsU0FBVSxRQUFRLENBQUMsRUFBRSxLQUFLLElBQUksS0FBSyxLQUFLLEtBQUssS0FBSyxRQUFRLFVBQVUsV0FBVyxNQUFNLEdBQUcscUJBQXFCLEtBQUssQ0FBQyxDQUFDO0FBQUEsRUFDcEksQ0FBQztBQUVELE9BQUssc0VBQXNFLFlBQVk7QUFDdEYsVUFBTSxZQUFZLE1BQU0sd0JBQXdCLENBQUMsS0FBSyxNQUFNLENBQUM7QUFDN0QsT0FBRyxjQUFjLFVBQVUsV0FBVyxRQUFRLDREQUE0RDtBQUUxRyxVQUFNLFdBQVcsTUFBTSxRQUFRLHNCQUFzQixVQUFVLFVBQVU7QUFDekUsbUJBQWUsU0FBVSxRQUFRLENBQUMsRUFBRSxLQUFLLElBQUksS0FBSyxLQUFLLEtBQUssS0FBSyxRQUFRLFVBQVUsV0FBVyxNQUFNLEdBQUcscUJBQXFCLEtBQUssQ0FBQyxDQUFDO0FBQUEsRUFDcEksQ0FBQztBQUVELE9BQUssc0NBQXNDLFlBQVk7QUFDdEQsVUFBTSxVQUFVO0FBQ2hCLFVBQU0sZUFBZSxLQUFLLEtBQUssUUFBUSxRQUFRO0FBRS9DLFVBQU0sa0JBQWtCLEtBQUssS0FBSyxRQUFRLDZCQUE2QjtBQUN2RSxvQkFBZ0IsaUJBQWlCLENBQUMsU0FBUyxVQUFVLEtBQUssS0FBSyxVQUFVLFlBQVksQ0FBQyxDQUFDO0FBQ3ZGLFVBQU0sY0FBYyxHQUFHLGFBQWEsZUFBZSxFQUFFLFNBQVM7QUFFOUQsUUFBSSxpQkFBaUIsSUFBSSxLQUFLLGVBQWU7QUFDN0MsUUFBSSxzQkFBc0IsSUFBSSxLQUFLLEtBQUssS0FBSyxRQUFRLFVBQVUsNkJBQTZCLENBQUM7QUFDN0YsUUFBSSxhQUFhLG1DQUFtQyxhQUFhLGdCQUFnQixPQUFPLHFCQUFxQiwwQkFBMEI7QUFDdkksUUFBSSxLQUFNLEtBQUssTUFBTSxVQUFVO0FBQy9CLFdBQU8sWUFBWSxHQUFHLFFBQVEsUUFBUSxDQUFDO0FBQ3ZDLHFCQUEyQyxHQUFHLFFBQVEsQ0FBQyxFQUFHLE1BQU0sT0FBTztBQUN2RSxxQkFBMkMsR0FBRyxRQUFRLENBQUMsRUFBRyxNQUFNLEdBQUc7QUFDbkUscUJBQTJDLEdBQUcsUUFBUSxDQUFDLEVBQUcsTUFBTSxZQUFZO0FBRTVFLHFCQUFpQjtBQUNqQiwwQkFBc0IsSUFBSSxLQUFLLEtBQUssS0FBSyxRQUFRLDZCQUE2QixDQUFDO0FBQy9FLGlCQUFhLG1DQUFtQyxZQUFZLGdCQUFnQixPQUFPLHFCQUFxQiwwQkFBMEI7QUFDbEksU0FBTSxLQUFLLE1BQU0sVUFBVTtBQUMzQixXQUFPLFlBQVksR0FBRyxRQUFRLFFBQVEsQ0FBQztBQUN2QyxxQkFBMkMsR0FBRyxRQUFRLENBQUMsRUFBRyxNQUFNLE9BQU87QUFDdkUscUJBQTJDLEdBQUcsUUFBUSxDQUFDLEVBQUcsTUFBTSxRQUFRO0FBQ3hFLHFCQUEyQyxHQUFHLFFBQVEsQ0FBQyxFQUFHLE1BQU0sbUJBQW1CO0FBRW5GLHFCQUFpQjtBQUNqQiwwQkFBc0IsSUFBSSxLQUFLLEtBQUssS0FBSyxRQUFRLFNBQVMsNkJBQTZCLENBQUM7QUFDeEYsaUJBQWEsbUNBQW1DLFlBQVksZ0JBQWdCLE9BQU8scUJBQXFCLDBCQUEwQjtBQUNsSSxTQUFNLEtBQUssTUFBTSxVQUFVO0FBQzNCLFdBQU8sWUFBWSxHQUFHLFFBQVEsUUFBUSxDQUFDO0FBQ3ZDLHFCQUEyQyxHQUFHLFFBQVEsQ0FBQyxFQUFHLE1BQU0sT0FBTztBQUN2RSxxQkFBMkMsR0FBRyxRQUFRLENBQUMsRUFBRyxNQUFNLFdBQVc7QUFDM0UscUJBQTJDLEdBQUcsUUFBUSxDQUFDLEVBQUcsTUFBTSxzQkFBc0I7QUFFdEYscUJBQWlCO0FBQ2pCLDBCQUFzQixJQUFJLE1BQU0sMkNBQTJDO0FBQzNFLGlCQUFhLG1DQUFtQyxZQUFZLGdCQUFnQixPQUFPLHFCQUFxQiwwQkFBMEI7QUFDbEksU0FBTSxLQUFLLE1BQU0sVUFBVTtBQUMzQixXQUFPLFlBQVksR0FBRyxRQUFRLFFBQVEsQ0FBQztBQUN2QyxXQUFPLFlBQXFDLEdBQUcsUUFBUSxDQUFDLEVBQUcsS0FBSyxJQUFJLEtBQUssT0FBTyxFQUFFLFNBQVMsSUFBSSxDQUFDO0FBQ2hHLFdBQU8sWUFBcUMsR0FBRyxRQUFRLENBQUMsRUFBRyxLQUFLLElBQUksS0FBSyxZQUFZLEVBQUUsU0FBUyxJQUFJLENBQUM7QUFDckcsV0FBTyxZQUFxQyxHQUFHLFFBQVEsQ0FBQyxFQUFHLEtBQUssSUFBSSxLQUFLLEtBQUssS0FBSyxjQUFjLFlBQVksQ0FBQyxFQUFFLFNBQVMsSUFBSSxDQUFDO0FBRTlILE9BQUcsV0FBVyxlQUFlO0FBQUEsRUFDOUIsQ0FBQztBQUVELE9BQUssMkRBQTJELFlBQVk7QUFDM0UsVUFBTSxZQUFZLE1BQU0sd0JBQXdCLENBQUMsS0FBSyxRQUFRLEtBQUssS0FBSyxRQUFRLFlBQVksQ0FBQyxDQUFDO0FBQzlGLFVBQU0sc0JBQXNCLElBQUksS0FBSyxLQUFLLEtBQUssUUFBUSxlQUFlLEtBQUssSUFBSSxDQUFDLElBQUksbUJBQW1CLEVBQUUsQ0FBQztBQUUxRyxRQUFJLGNBQWMsR0FBRyxhQUFhLFVBQVUsV0FBVyxNQUFNLEVBQUUsU0FBUztBQUN4RSxrQkFBYztBQUFBLEVBQXlCLFdBQVc7QUFFbEQsVUFBTSxhQUFhLG1DQUFtQyxhQUFhLFVBQVUsWUFBWSxPQUFPLHFCQUFxQiwwQkFBMEI7QUFDL0ksV0FBTyxZQUFZLEdBQUcsV0FBVyxRQUFRLHNCQUFzQixDQUFDO0FBQ2hFLFVBQU0sUUFBUSx3QkFBd0IsU0FBUztBQUFBLEVBQ2hELENBQUM7QUFFRCxPQUFLLGtFQUFrRSxZQUFZO0FBQ2xGLFVBQU0sWUFBWSxNQUFNLHdCQUF3QixDQUFDLEtBQUssUUFBUSxLQUFLLEtBQUssUUFBUSxZQUFZLENBQUMsQ0FBQztBQUM5RixVQUFNLHNCQUFzQixJQUFJLEtBQUssS0FBSyxLQUFLLFFBQVEsZUFBZSxLQUFLLElBQUksQ0FBQyxJQUFJLG1CQUFtQixFQUFFLENBQUM7QUFFMUcsUUFBSSxjQUFjLEdBQUcsYUFBYSxVQUFVLFdBQVcsTUFBTSxFQUFFLFNBQVM7QUFDeEUsa0JBQWMsWUFBWSxRQUFRLFNBQVMsR0FBRztBQUU5QyxVQUFNLGFBQWEsbUNBQW1DLGFBQWEsVUFBVSxZQUFZLE9BQU8scUJBQXFCLDBCQUEwQjtBQUMvSSxVQUFNLEtBQU0sS0FBSyxNQUFNLFVBQVU7QUFDakMsV0FBTyxHQUFHLEdBQUcsUUFBUSxNQUFNLE9BQStCLEVBQUcsS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLENBQUM7QUFDcEYsVUFBTSxRQUFRLHdCQUF3QixTQUFTO0FBQUEsRUFDaEQsQ0FBQztBQUVELEdBQUMsQ0FBQyxZQUFZLEtBQUssT0FBTyxNQUFNLGtEQUFrRCxZQUFZO0FBQzdGLFVBQU0sb0JBQW9CLEtBQUssS0FBSyxRQUFRLE9BQU87QUFDbkQsVUFBTSxrQkFBa0I7QUFDeEIsVUFBTSxrQkFBa0I7QUFDeEIsVUFBTSxrQkFBa0IsS0FBSyxLQUFLLG1CQUFtQixTQUFTLE1BQU07QUFFcEUsVUFBTSxZQUFZLE1BQU0sd0JBQXdCLENBQUMsaUJBQWlCLGlCQUFpQixlQUFlLENBQUM7QUFDbkcsVUFBTSxzQkFBc0IsSUFBSSxLQUFLLEtBQUssS0FBSyxtQkFBbUIsZUFBZSxLQUFLLElBQUksQ0FBQyxJQUFJLG1CQUFtQixFQUFFLENBQUM7QUFDckgsVUFBTSxjQUFjLEdBQUcsYUFBYSxVQUFVLFdBQVcsTUFBTSxFQUFFLFNBQVM7QUFDMUUsVUFBTSxhQUFhLG1DQUFtQyxhQUFhLFVBQVUsWUFBWSxNQUFNLHFCQUFxQiwwQkFBMEI7QUFDOUksVUFBTSxLQUFNLEtBQUssTUFBTSxVQUFVO0FBQ2pDLHFCQUEyQyxHQUFHLFFBQVEsQ0FBQyxFQUFHLE1BQU0sZUFBZTtBQUMvRSxxQkFBMkMsR0FBRyxRQUFRLENBQUMsRUFBRyxNQUFNLGVBQWU7QUFDL0UscUJBQTJDLEdBQUcsUUFBUSxDQUFDLEVBQUcsTUFBTSxZQUFZO0FBRTVFLFVBQU0sUUFBUSx3QkFBd0IsU0FBUztBQUFBLEVBQ2hELENBQUM7QUFFRCxPQUFLLHNDQUFzQyxZQUFZO0FBQ3RELFVBQU0sWUFBWSxNQUFNLHdCQUF3QixDQUFDLEtBQUssTUFBTSxDQUFDO0FBQzdELFdBQU8sR0FBRyxHQUFHLFdBQVcsVUFBVSxXQUFXLE1BQU0sQ0FBQztBQUNwRCxVQUFNLFFBQVEsd0JBQXdCLFNBQVM7QUFDL0MsV0FBTyxHQUFHLENBQUMsR0FBRyxXQUFXLFVBQVUsV0FBVyxNQUFNLENBQUM7QUFBQSxFQUN0RCxDQUFDO0FBRUQsT0FBSyxtQ0FBbUMsWUFBWTtBQUNuRCxVQUFNLFlBQVksTUFBTSx3QkFBd0IsQ0FBQyxLQUFLLE1BQU0sQ0FBQztBQUM3RCxVQUFNLFFBQVEsd0JBQXdCLFNBQVM7QUFBQSxFQUNoRCxDQUFDO0FBRUQsT0FBSyx3QkFBd0IsaUJBQWtCO0FBQzlDLFVBQU0sUUFBUSxXQUFXO0FBQ3pCLFFBQUksV0FBVyxRQUFRLHNCQUFzQjtBQUM3QyxXQUFPLFlBQVksU0FBUyxRQUFRLENBQUM7QUFFckMsVUFBTSxjQUFjLE1BQU0sd0JBQXdCLENBQUMsS0FBSyxNQUFNLENBQUM7QUFDL0QsV0FBTyxHQUFHLEdBQUcsV0FBVyxZQUFZLFdBQVcsTUFBTSxDQUFDO0FBRXRELFVBQU0sUUFBUSxXQUFXO0FBQ3pCLGVBQVcsUUFBUSxzQkFBc0I7QUFDekMsV0FBTyxZQUFZLEdBQUcsU0FBUyxNQUFNO0FBQ3JDLFdBQU8sWUFBWSxZQUFZLElBQUksU0FBUyxDQUFDLEVBQUUsVUFBVSxFQUFFO0FBRTNELFVBQU0sUUFBUSx3QkFBd0IsV0FBVztBQUNqRCxVQUFNLFFBQVEsV0FBVztBQUN6QixlQUFXLFFBQVEsc0JBQXNCO0FBQ3pDLFdBQU8sWUFBWSxHQUFHLFNBQVMsTUFBTTtBQUFBLEVBQ3RDLENBQUM7QUFFRCwwQ0FBd0M7QUFDekMsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
