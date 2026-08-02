import assert from "assert";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import { Schemas } from "../../../../base/common/network.js";
import * as path from "../../../../base/common/path.js";
import * as platform from "../../../../base/common/platform.js";
import { isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { Promises } from "../../../../base/node/pfs.js";
import { flakySuite, getRandomTestPath } from "../../../../base/test/node/testUtils.js";
import { BackupMainService } from "../../electron-main/backupMainService.js";
import { TestConfigurationService } from "../../../configuration/test/common/testConfigurationService.js";
import { EnvironmentMainService } from "../../../environment/electron-main/environmentMainService.js";
import { OPTIONS, parseArgs } from "../../../environment/node/argv.js";
import { HotExitConfiguration } from "../../../files/common/files.js";
import { ConsoleMainLogger } from "../../../log/common/log.js";
import product from "../../../product/common/product.js";
import { isFolderBackupInfo } from "../../common/backup.js";
import { InMemoryTestStateMainService } from "../../../test/electron-main/workbenchTestServices.js";
import { LogService } from "../../../log/common/logService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
flakySuite("BackupMainService", () => {
  function assertEqualFolderInfos(actual, expected) {
    const withUriAsString = (f) => ({ folderUri: f.folderUri.toString(), remoteAuthority: f.remoteAuthority });
    assert.deepStrictEqual(actual.map(withUriAsString), expected.map(withUriAsString));
  }
  function toWorkspace(path2) {
    return {
      id: createHash("md5").update(sanitizePath(path2)).digest("hex"),
      // CodeQL [SM04514] Using MD5 to convert a file path to a fixed length
      configPath: URI.file(path2)
    };
  }
  function toWorkspaceBackupInfo(path2, remoteAuthority) {
    return {
      workspace: {
        id: createHash("md5").update(sanitizePath(path2)).digest("hex"),
        // CodeQL [SM04514] Using MD5 to convert a file path to a fixed length
        configPath: URI.file(path2)
      },
      remoteAuthority
    };
  }
  function toFolderBackupInfo(uri, remoteAuthority) {
    return { folderUri: uri, remoteAuthority };
  }
  function toSerializedWorkspace(ws) {
    return {
      id: ws.id,
      configURIPath: ws.configPath.toString()
    };
  }
  function ensureFolderExists(uri) {
    if (!fs.existsSync(uri.fsPath)) {
      fs.mkdirSync(uri.fsPath);
    }
    const backupFolder = service.toBackupPath(uri);
    return createBackupFolder(backupFolder);
  }
  async function ensureWorkspaceExists(workspace) {
    if (!fs.existsSync(workspace.configPath.fsPath)) {
      await Promises.writeFile(workspace.configPath.fsPath, "Hello");
    }
    const backupFolder = service.toBackupPath(workspace.id);
    await createBackupFolder(backupFolder);
    return workspace;
  }
  async function createBackupFolder(backupFolder) {
    if (!fs.existsSync(backupFolder)) {
      fs.mkdirSync(backupFolder);
      fs.mkdirSync(path.join(backupFolder, Schemas.file));
      await Promises.writeFile(path.join(backupFolder, Schemas.file, "foo.txt"), "Hello");
    }
  }
  function readWorkspacesMetadata() {
    return stateMainService.getItem("backupWorkspaces");
  }
  function writeWorkspacesMetadata(data) {
    if (!data) {
      stateMainService.removeItem("backupWorkspaces");
    } else {
      stateMainService.setItem("backupWorkspaces", JSON.parse(data));
    }
  }
  function sanitizePath(p) {
    return platform.isLinux ? p : p.toLowerCase();
  }
  const fooFile = URI.file(platform.isWindows ? "C:\\foo" : "/foo");
  const barFile = URI.file(platform.isWindows ? "C:\\bar" : "/bar");
  let service;
  let configService;
  let stateMainService;
  let environmentService;
  let testDir;
  let backupHome;
  let existingTestFolder1;
  setup(async () => {
    testDir = getRandomTestPath(os.tmpdir(), "vsctests", "backupmainservice");
    backupHome = path.join(testDir, "Backups");
    existingTestFolder1 = URI.file(path.join(testDir, "folder1"));
    environmentService = new EnvironmentMainService(parseArgs(process.argv, OPTIONS), { _serviceBrand: void 0, ...product });
    await fs.promises.mkdir(backupHome, { recursive: true });
    configService = new TestConfigurationService();
    stateMainService = new InMemoryTestStateMainService();
    service = new class TestBackupMainService extends BackupMainService {
      constructor() {
        super(environmentService, configService, new LogService(new ConsoleMainLogger()), stateMainService);
        this.backupHome = backupHome;
      }
      toBackupPath(arg) {
        const id = arg instanceof URI ? super.getFolderHash({ folderUri: arg }) : arg;
        return path.join(this.backupHome, id);
      }
      testGetFolderHash(folder) {
        return super.getFolderHash(folder);
      }
      testGetWorkspaceBackups() {
        return super.getWorkspaceBackups();
      }
      testGetFolderBackups() {
        return super.getFolderBackups();
      }
    }();
    return service.initialize();
  });
  teardown(() => {
    return Promises.rm(testDir);
  });
  test("service validates backup workspaces on startup and cleans up (folder workspaces)", async function() {
    service.registerFolderBackup(toFolderBackupInfo(fooFile));
    service.registerFolderBackup(toFolderBackupInfo(barFile));
    await service.initialize();
    assertEqualFolderInfos(service.testGetFolderBackups(), []);
    fs.mkdirSync(service.toBackupPath(fooFile));
    fs.mkdirSync(service.toBackupPath(barFile));
    service.registerFolderBackup(toFolderBackupInfo(fooFile));
    service.registerFolderBackup(toFolderBackupInfo(barFile));
    await service.initialize();
    assertEqualFolderInfos(service.testGetFolderBackups(), []);
    assert.ok(!fs.existsSync(service.toBackupPath(fooFile)));
    assert.ok(!fs.existsSync(service.toBackupPath(barFile)));
    fs.mkdirSync(service.toBackupPath(fooFile));
    fs.mkdirSync(service.toBackupPath(barFile));
    fs.mkdirSync(path.join(service.toBackupPath(fooFile), Schemas.file));
    fs.mkdirSync(path.join(service.toBackupPath(barFile), Schemas.untitled));
    service.registerFolderBackup(toFolderBackupInfo(fooFile));
    service.registerFolderBackup(toFolderBackupInfo(barFile));
    await service.initialize();
    assertEqualFolderInfos(service.testGetFolderBackups(), []);
    assert.ok(!fs.existsSync(service.toBackupPath(fooFile)));
    assert.ok(!fs.existsSync(service.toBackupPath(barFile)));
    const fileBackups = path.join(service.toBackupPath(fooFile), Schemas.file);
    fs.mkdirSync(service.toBackupPath(fooFile));
    fs.mkdirSync(service.toBackupPath(barFile));
    fs.mkdirSync(fileBackups);
    service.registerFolderBackup(toFolderBackupInfo(fooFile));
    assert.strictEqual(service.testGetFolderBackups().length, 1);
    assert.strictEqual(service.getEmptyWindowBackups().length, 0);
    fs.writeFileSync(path.join(fileBackups, "backup.txt"), "");
    await service.initialize();
    assert.strictEqual(service.testGetFolderBackups().length, 0);
    assert.strictEqual(service.getEmptyWindowBackups().length, 1);
  });
  test("service validates backup workspaces on startup and cleans up (root workspaces)", async function() {
    service.registerWorkspaceBackup(toWorkspaceBackupInfo(fooFile.fsPath));
    service.registerWorkspaceBackup(toWorkspaceBackupInfo(barFile.fsPath));
    await service.initialize();
    assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
    fs.mkdirSync(service.toBackupPath(fooFile));
    fs.mkdirSync(service.toBackupPath(barFile));
    service.registerWorkspaceBackup(toWorkspaceBackupInfo(fooFile.fsPath));
    service.registerWorkspaceBackup(toWorkspaceBackupInfo(barFile.fsPath));
    await service.initialize();
    assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
    assert.ok(!fs.existsSync(service.toBackupPath(fooFile)));
    assert.ok(!fs.existsSync(service.toBackupPath(barFile)));
    fs.mkdirSync(service.toBackupPath(fooFile));
    fs.mkdirSync(service.toBackupPath(barFile));
    fs.mkdirSync(path.join(service.toBackupPath(fooFile), Schemas.file));
    fs.mkdirSync(path.join(service.toBackupPath(barFile), Schemas.untitled));
    service.registerWorkspaceBackup(toWorkspaceBackupInfo(fooFile.fsPath));
    service.registerWorkspaceBackup(toWorkspaceBackupInfo(barFile.fsPath));
    await service.initialize();
    assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
    assert.ok(!fs.existsSync(service.toBackupPath(fooFile)));
    assert.ok(!fs.existsSync(service.toBackupPath(barFile)));
    const fileBackups = path.join(service.toBackupPath(fooFile), Schemas.file);
    fs.mkdirSync(service.toBackupPath(fooFile));
    fs.mkdirSync(service.toBackupPath(barFile));
    fs.mkdirSync(fileBackups);
    service.registerWorkspaceBackup(toWorkspaceBackupInfo(fooFile.fsPath));
    assert.strictEqual(service.testGetWorkspaceBackups().length, 1);
    assert.strictEqual(service.getEmptyWindowBackups().length, 0);
    fs.writeFileSync(path.join(fileBackups, "backup.txt"), "");
    await service.initialize();
    assert.strictEqual(service.testGetWorkspaceBackups().length, 0);
    assert.strictEqual(service.getEmptyWindowBackups().length, 1);
  });
  test("service supports to migrate backup data from another location", async () => {
    const backupPathToMigrate = service.toBackupPath(fooFile);
    fs.mkdirSync(backupPathToMigrate);
    fs.writeFileSync(path.join(backupPathToMigrate, "backup.txt"), "Some Data");
    service.registerFolderBackup(toFolderBackupInfo(URI.file(backupPathToMigrate)));
    const workspaceBackupPath = await service.registerWorkspaceBackup(toWorkspaceBackupInfo(barFile.fsPath), backupPathToMigrate);
    assert.ok(fs.existsSync(workspaceBackupPath));
    assert.ok(fs.existsSync(path.join(workspaceBackupPath, "backup.txt")));
    assert.ok(!fs.existsSync(backupPathToMigrate));
    const emptyBackups = service.getEmptyWindowBackups();
    assert.strictEqual(0, emptyBackups.length);
  });
  test("service backup migration makes sure to preserve existing backups", async () => {
    const backupPathToMigrate = service.toBackupPath(fooFile);
    fs.mkdirSync(backupPathToMigrate);
    fs.writeFileSync(path.join(backupPathToMigrate, "backup.txt"), "Some Data");
    service.registerFolderBackup(toFolderBackupInfo(URI.file(backupPathToMigrate)));
    const backupPathToPreserve = service.toBackupPath(barFile);
    fs.mkdirSync(backupPathToPreserve);
    fs.writeFileSync(path.join(backupPathToPreserve, "backup.txt"), "Some Data");
    service.registerFolderBackup(toFolderBackupInfo(URI.file(backupPathToPreserve)));
    const workspaceBackupPath = await service.registerWorkspaceBackup(toWorkspaceBackupInfo(barFile.fsPath), backupPathToMigrate);
    assert.ok(fs.existsSync(workspaceBackupPath));
    assert.ok(fs.existsSync(path.join(workspaceBackupPath, "backup.txt")));
    assert.ok(!fs.existsSync(backupPathToMigrate));
    const emptyBackups = service.getEmptyWindowBackups();
    assert.strictEqual(1, emptyBackups.length);
    assert.strictEqual(1, fs.readdirSync(path.join(backupHome, emptyBackups[0].backupFolder)).length);
  });
  suite("loadSync", () => {
    test("getFolderBackupPaths() should return [] when workspaces.json doesn't exist", () => {
      assertEqualFolderInfos(service.testGetFolderBackups(), []);
    });
    test("getFolderBackupPaths() should return [] when folders in workspaces.json is absent", async () => {
      writeWorkspacesMetadata("{}");
      await service.initialize();
      assertEqualFolderInfos(service.testGetFolderBackups(), []);
    });
    test("getFolderBackupPaths() should return [] when folders in workspaces.json is not a string array", async () => {
      writeWorkspacesMetadata('{"folders":{}}');
      await service.initialize();
      assertEqualFolderInfos(service.testGetFolderBackups(), []);
      writeWorkspacesMetadata('{"folders":{"foo": ["bar"]}}');
      await service.initialize();
      assertEqualFolderInfos(service.testGetFolderBackups(), []);
      writeWorkspacesMetadata('{"folders":{"foo": []}}');
      await service.initialize();
      assertEqualFolderInfos(service.testGetFolderBackups(), []);
      writeWorkspacesMetadata('{"folders":{"foo": "bar"}}');
      await service.initialize();
      assertEqualFolderInfos(service.testGetFolderBackups(), []);
      writeWorkspacesMetadata('{"folders":"foo"}');
      await service.initialize();
      assertEqualFolderInfos(service.testGetFolderBackups(), []);
      writeWorkspacesMetadata('{"folders":1}');
      await service.initialize();
      assertEqualFolderInfos(service.testGetFolderBackups(), []);
    });
    test('getFolderBackupPaths() should return [] when files.hotExit = "onExitAndWindowClose"', async () => {
      const fi = toFolderBackupInfo(URI.file(fooFile.fsPath.toUpperCase()));
      service.registerFolderBackup(fi);
      assertEqualFolderInfos(service.testGetFolderBackups(), [fi]);
      configService.setUserConfiguration("files.hotExit", HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE);
      await service.initialize();
      assertEqualFolderInfos(service.testGetFolderBackups(), []);
    });
    test("getWorkspaceBackups() should return [] when workspaces.json doesn't exist", () => {
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
    });
    test("getWorkspaceBackups() should return [] when folderWorkspaces in workspaces.json is absent", async () => {
      writeWorkspacesMetadata("{}");
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
    });
    test("getWorkspaceBackups() should return [] when rootWorkspaces in workspaces.json is not a object array", async () => {
      writeWorkspacesMetadata('{"rootWorkspaces":{}}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"rootWorkspaces":{"foo": ["bar"]}}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"rootWorkspaces":{"foo": []}}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"rootWorkspaces":{"foo": "bar"}}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"rootWorkspaces":"foo"}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"rootWorkspaces":1}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
    });
    test("getWorkspaceBackups() should return [] when workspaces in workspaces.json is not a object array", async () => {
      writeWorkspacesMetadata('{"workspaces":{}}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"workspaces":{"foo": ["bar"]}}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"workspaces":{"foo": []}}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"workspaces":{"foo": "bar"}}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"workspaces":"foo"}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
      writeWorkspacesMetadata('{"workspaces":1}');
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
    });
    test('getWorkspaceBackups() should return [] when files.hotExit = "onExitAndWindowClose"', async () => {
      const upperFooPath = fooFile.fsPath.toUpperCase();
      service.registerWorkspaceBackup(toWorkspaceBackupInfo(upperFooPath));
      assert.strictEqual(service.testGetWorkspaceBackups().length, 1);
      assert.deepStrictEqual(service.testGetWorkspaceBackups().map((r) => r.workspace.configPath.toString()), [URI.file(upperFooPath).toString()]);
      configService.setUserConfiguration("files.hotExit", HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE);
      await service.initialize();
      assert.deepStrictEqual(service.testGetWorkspaceBackups(), []);
    });
    test("getEmptyWorkspaceBackupPaths() should return [] when workspaces.json doesn't exist", () => {
      assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
    });
    test("getEmptyWorkspaceBackupPaths() should return [] when folderWorkspaces in workspaces.json is absent", async () => {
      writeWorkspacesMetadata("{}");
      await service.initialize();
      assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
    });
    test("getEmptyWorkspaceBackupPaths() should return [] when folderWorkspaces in workspaces.json is not a string array", async function() {
      writeWorkspacesMetadata('{"emptyWorkspaces":{}}');
      await service.initialize();
      assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
      writeWorkspacesMetadata('{"emptyWorkspaces":{"foo": ["bar"]}}');
      await service.initialize();
      assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
      writeWorkspacesMetadata('{"emptyWorkspaces":{"foo": []}}');
      await service.initialize();
      assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
      writeWorkspacesMetadata('{"emptyWorkspaces":{"foo": "bar"}}');
      await service.initialize();
      assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
      writeWorkspacesMetadata('{"emptyWorkspaces":"foo"}');
      await service.initialize();
      assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
      writeWorkspacesMetadata('{"emptyWorkspaces":1}');
      await service.initialize();
      assert.deepStrictEqual(service.getEmptyWindowBackups(), []);
    });
  });
  suite("dedupeFolderWorkspaces", () => {
    test("should ignore duplicates (folder workspace)", async () => {
      await ensureFolderExists(existingTestFolder1);
      const workspacesJson = {
        workspaces: [],
        folders: [{ folderUri: existingTestFolder1.toString() }, { folderUri: existingTestFolder1.toString() }],
        emptyWindows: []
      };
      writeWorkspacesMetadata(JSON.stringify(workspacesJson));
      await service.initialize();
      const json = readWorkspacesMetadata();
      assert.deepStrictEqual(json.folders, [{ folderUri: existingTestFolder1.toString() }]);
    });
    test("should ignore duplicates on Windows and Mac (folder workspace)", async () => {
      await ensureFolderExists(existingTestFolder1);
      const workspacesJson = {
        workspaces: [],
        folders: [{ folderUri: existingTestFolder1.toString() }, { folderUri: existingTestFolder1.toString().toLowerCase() }],
        emptyWindows: []
      };
      writeWorkspacesMetadata(JSON.stringify(workspacesJson));
      await service.initialize();
      const json = readWorkspacesMetadata();
      assert.deepStrictEqual(json.folders, [{ folderUri: existingTestFolder1.toString() }]);
    });
    test("should ignore duplicates on Windows and Mac (root workspace)", async () => {
      const workspacePath = path.join(testDir, "Foo.code-workspace");
      const workspacePath1 = path.join(testDir, "FOO.code-workspace");
      const workspacePath2 = path.join(testDir, "foo.code-workspace");
      const workspace1 = await ensureWorkspaceExists(toWorkspace(workspacePath));
      const workspace2 = await ensureWorkspaceExists(toWorkspace(workspacePath1));
      const workspace3 = await ensureWorkspaceExists(toWorkspace(workspacePath2));
      const workspacesJson = {
        workspaces: [workspace1, workspace2, workspace3].map(toSerializedWorkspace),
        folders: [],
        emptyWindows: []
      };
      writeWorkspacesMetadata(JSON.stringify(workspacesJson));
      await service.initialize();
      const json = readWorkspacesMetadata();
      assert.strictEqual(json.workspaces.length, platform.isLinux ? 3 : 1);
      if (platform.isLinux) {
        assert.deepStrictEqual(json.workspaces.map((r) => r.configURIPath), [URI.file(workspacePath).toString(), URI.file(workspacePath1).toString(), URI.file(workspacePath2).toString()]);
      } else {
        assert.deepStrictEqual(json.workspaces.map((r) => r.configURIPath), [URI.file(workspacePath).toString()], "should return the first duplicated entry");
      }
    });
  });
  suite("registerWindowForBackups", () => {
    test("should persist paths to workspaces.json (folder workspace)", async () => {
      service.registerFolderBackup(toFolderBackupInfo(fooFile));
      service.registerFolderBackup(toFolderBackupInfo(barFile));
      assertEqualFolderInfos(service.testGetFolderBackups(), [toFolderBackupInfo(fooFile), toFolderBackupInfo(barFile)]);
      const json = readWorkspacesMetadata();
      assert.deepStrictEqual(json.folders, [{ folderUri: fooFile.toString() }, { folderUri: barFile.toString() }]);
    });
    test("should persist paths to workspaces.json (root workspace)", async () => {
      const ws1 = toWorkspaceBackupInfo(fooFile.fsPath);
      service.registerWorkspaceBackup(ws1);
      const ws2 = toWorkspaceBackupInfo(barFile.fsPath);
      service.registerWorkspaceBackup(ws2);
      assert.deepStrictEqual(service.testGetWorkspaceBackups().map((b) => b.workspace.configPath.toString()), [fooFile.toString(), barFile.toString()]);
      assert.strictEqual(ws1.workspace.id, service.testGetWorkspaceBackups()[0].workspace.id);
      assert.strictEqual(ws2.workspace.id, service.testGetWorkspaceBackups()[1].workspace.id);
      const json = readWorkspacesMetadata();
      assert.deepStrictEqual(json.workspaces.map((b) => b.configURIPath), [fooFile.toString(), barFile.toString()]);
      assert.strictEqual(ws1.workspace.id, json.workspaces[0].id);
      assert.strictEqual(ws2.workspace.id, json.workspaces[1].id);
    });
  });
  test("should always store the workspace path in workspaces.json using the case given, regardless of whether the file system is case-sensitive (folder workspace)", async () => {
    service.registerFolderBackup(toFolderBackupInfo(URI.file(fooFile.fsPath.toUpperCase())));
    assertEqualFolderInfos(service.testGetFolderBackups(), [toFolderBackupInfo(URI.file(fooFile.fsPath.toUpperCase()))]);
    const json = readWorkspacesMetadata();
    assert.deepStrictEqual(json.folders, [{ folderUri: URI.file(fooFile.fsPath.toUpperCase()).toString() }]);
  });
  test("should always store the workspace path in workspaces.json using the case given, regardless of whether the file system is case-sensitive (root workspace)", async () => {
    const upperFooPath = fooFile.fsPath.toUpperCase();
    service.registerWorkspaceBackup(toWorkspaceBackupInfo(upperFooPath));
    assert.deepStrictEqual(service.testGetWorkspaceBackups().map((b) => b.workspace.configPath.toString()), [URI.file(upperFooPath).toString()]);
    const json = readWorkspacesMetadata();
    assert.deepStrictEqual(json.workspaces.map((b) => b.configURIPath), [URI.file(upperFooPath).toString()]);
  });
  suite("getWorkspaceHash", () => {
    (platform.isLinux ? test.skip : test)("should ignore case on Windows and Mac", () => {
      const assertFolderHash = (uri1, uri2) => {
        assert.strictEqual(service.testGetFolderHash(toFolderBackupInfo(uri1)), service.testGetFolderHash(toFolderBackupInfo(uri2)));
      };
      if (platform.isMacintosh) {
        assertFolderHash(URI.file("/foo"), URI.file("/FOO"));
      }
      if (platform.isWindows) {
        assertFolderHash(URI.file("c:\\foo"), URI.file("C:\\FOO"));
      }
    });
  });
  suite("mixed path casing", () => {
    test("should handle case insensitive paths properly (registerWindowForBackupsSync) (folder workspace)", () => {
      service.registerFolderBackup(toFolderBackupInfo(fooFile));
      service.registerFolderBackup(toFolderBackupInfo(URI.file(fooFile.fsPath.toUpperCase())));
      if (platform.isLinux) {
        assert.strictEqual(service.testGetFolderBackups().length, 2);
      } else {
        assert.strictEqual(service.testGetFolderBackups().length, 1);
      }
    });
    test("should handle case insensitive paths properly (registerWindowForBackupsSync) (root workspace)", () => {
      service.registerWorkspaceBackup(toWorkspaceBackupInfo(fooFile.fsPath));
      service.registerWorkspaceBackup(toWorkspaceBackupInfo(fooFile.fsPath.toUpperCase()));
      if (platform.isLinux) {
        assert.strictEqual(service.testGetWorkspaceBackups().length, 2);
      } else {
        assert.strictEqual(service.testGetWorkspaceBackups().length, 1);
      }
    });
  });
  suite("getDirtyWorkspaces", () => {
    test("should report if a workspace or folder has backups", async () => {
      const folderBackupPath = service.registerFolderBackup(toFolderBackupInfo(fooFile));
      const backupWorkspaceInfo = toWorkspaceBackupInfo(fooFile.fsPath);
      const workspaceBackupPath = service.registerWorkspaceBackup(backupWorkspaceInfo);
      assert.strictEqual((await service.getDirtyWorkspaces()).length, 0);
      try {
        await fs.promises.mkdir(path.join(folderBackupPath, Schemas.file), { recursive: true });
        await fs.promises.mkdir(path.join(workspaceBackupPath, Schemas.untitled), { recursive: true });
      } catch {
      }
      assert.strictEqual((await service.getDirtyWorkspaces()).length, 0);
      fs.writeFileSync(path.join(folderBackupPath, Schemas.file, "594a4a9d82a277a899d4713a5b08f504"), "");
      fs.writeFileSync(path.join(workspaceBackupPath, Schemas.untitled, "594a4a9d82a277a899d4713a5b08f504"), "");
      const dirtyWorkspaces = await service.getDirtyWorkspaces();
      assert.strictEqual(dirtyWorkspaces.length, 2);
      let found = 0;
      for (const dirtyWorkpspace of dirtyWorkspaces) {
        if (isFolderBackupInfo(dirtyWorkpspace)) {
          if (isEqual(fooFile, dirtyWorkpspace.folderUri)) {
            found++;
          }
        } else {
          if (isEqual(backupWorkspaceInfo.workspace.configPath, dirtyWorkpspace.workspace.configPath)) {
            found++;
          }
        }
      }
      assert.strictEqual(found, 2);
    });
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2JhY2t1cC90ZXN0L2VsZWN0cm9uLW1haW4vYmFja3VwTWFpblNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGNyZWF0ZUhhc2ggfSBmcm9tICdjcnlwdG8nO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9ub2RlL3Bmcy5qcyc7XG5pbXBvcnQgeyBmbGFreVN1aXRlLCBnZXRSYW5kb21UZXN0UGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9ub2RlL3Rlc3RVdGlscy5qcyc7XG5pbXBvcnQgeyBCYWNrdXBNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL2VsZWN0cm9uLW1haW4vYmFja3VwTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlcmlhbGl6ZWRCYWNrdXBXb3Jrc3BhY2VzLCBJU2VyaWFsaXplZFdvcmtzcGFjZUJhY2t1cEluZm8gfSBmcm9tICcuLi8uLi9ub2RlL2JhY2t1cC5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFbnZpcm9ubWVudE1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvZWxlY3Ryb24tbWFpbi9lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IE9QVElPTlMsIHBhcnNlQXJncyB9IGZyb20gJy4uLy4uLy4uL2Vudmlyb25tZW50L25vZGUvYXJndi5qcyc7XG5pbXBvcnQgeyBIb3RFeGl0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBDb25zb2xlTWFpbkxvZ2dlciB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgSUZvbGRlckJhY2t1cEluZm8sIGlzRm9sZGVyQmFja3VwSW5mbywgSVdvcmtzcGFjZUJhY2t1cEluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vYmFja3VwLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlUZXN0U3RhdGVNYWluU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Rlc3QvZWxlY3Ryb24tbWFpbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuZmxha3lTdWl0ZSgnQmFja3VwTWFpblNlcnZpY2UnLCAoKSA9PiB7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0RXF1YWxGb2xkZXJJbmZvcyhhY3R1YWw6IElGb2xkZXJCYWNrdXBJbmZvW10sIGV4cGVjdGVkOiBJRm9sZGVyQmFja3VwSW5mb1tdKSB7XG5cdFx0Y29uc3Qgd2l0aFVyaUFzU3RyaW5nID0gKGY6IElGb2xkZXJCYWNrdXBJbmZvKSA9PiAoeyBmb2xkZXJVcmk6IGYuZm9sZGVyVXJpLnRvU3RyaW5nKCksIHJlbW90ZUF1dGhvcml0eTogZi5yZW1vdGVBdXRob3JpdHkgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubWFwKHdpdGhVcmlBc1N0cmluZyksIGV4cGVjdGVkLm1hcCh3aXRoVXJpQXNTdHJpbmcpKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRvV29ya3NwYWNlKHBhdGg6IHN0cmluZyk6IElXb3Jrc3BhY2VJZGVudGlmaWVyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IGNyZWF0ZUhhc2goJ21kNScpLnVwZGF0ZShzYW5pdGl6ZVBhdGgocGF0aCkpLmRpZ2VzdCgnaGV4JyksIC8vIENvZGVRTCBbU00wNDUxNF0gVXNpbmcgTUQ1IHRvIGNvbnZlcnQgYSBmaWxlIHBhdGggdG8gYSBmaXhlZCBsZW5ndGhcblx0XHRcdGNvbmZpZ1BhdGg6IFVSSS5maWxlKHBhdGgpXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRvV29ya3NwYWNlQmFja3VwSW5mbyhwYXRoOiBzdHJpbmcsIHJlbW90ZUF1dGhvcml0eT86IHN0cmluZyk6IElXb3Jrc3BhY2VCYWNrdXBJbmZvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0d29ya3NwYWNlOiB7XG5cdFx0XHRcdGlkOiBjcmVhdGVIYXNoKCdtZDUnKS51cGRhdGUoc2FuaXRpemVQYXRoKHBhdGgpKS5kaWdlc3QoJ2hleCcpLCAvLyBDb2RlUUwgW1NNMDQ1MTRdIFVzaW5nIE1ENSB0byBjb252ZXJ0IGEgZmlsZSBwYXRoIHRvIGEgZml4ZWQgbGVuZ3RoXG5cdFx0XHRcdGNvbmZpZ1BhdGg6IFVSSS5maWxlKHBhdGgpXG5cdFx0XHR9LFxuXHRcdFx0cmVtb3RlQXV0aG9yaXR5XG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRvRm9sZGVyQmFja3VwSW5mbyh1cmk6IFVSSSwgcmVtb3RlQXV0aG9yaXR5Pzogc3RyaW5nKTogSUZvbGRlckJhY2t1cEluZm8ge1xuXHRcdHJldHVybiB7IGZvbGRlclVyaTogdXJpLCByZW1vdGVBdXRob3JpdHkgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRvU2VyaWFsaXplZFdvcmtzcGFjZSh3czogSVdvcmtzcGFjZUlkZW50aWZpZXIpOiBJU2VyaWFsaXplZFdvcmtzcGFjZUJhY2t1cEluZm8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogd3MuaWQsXG5cdFx0XHRjb25maWdVUklQYXRoOiB3cy5jb25maWdQYXRoLnRvU3RyaW5nKClcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gZW5zdXJlRm9sZGVyRXhpc3RzKHVyaTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFmcy5leGlzdHNTeW5jKHVyaS5mc1BhdGgpKSB7XG5cdFx0XHRmcy5ta2RpclN5bmModXJpLmZzUGF0aCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmFja3VwRm9sZGVyID0gc2VydmljZS50b0JhY2t1cFBhdGgodXJpKTtcblx0XHRyZXR1cm4gY3JlYXRlQmFja3VwRm9sZGVyKGJhY2t1cEZvbGRlcik7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBlbnN1cmVXb3Jrc3BhY2VFeGlzdHMod29ya3NwYWNlOiBJV29ya3NwYWNlSWRlbnRpZmllcik6IFByb21pc2U8SVdvcmtzcGFjZUlkZW50aWZpZXI+IHtcblx0XHRpZiAoIWZzLmV4aXN0c1N5bmMod29ya3NwYWNlLmNvbmZpZ1BhdGguZnNQYXRoKSkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKHdvcmtzcGFjZS5jb25maWdQYXRoLmZzUGF0aCwgJ0hlbGxvJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmFja3VwRm9sZGVyID0gc2VydmljZS50b0JhY2t1cFBhdGgod29ya3NwYWNlLmlkKTtcblx0XHRhd2FpdCBjcmVhdGVCYWNrdXBGb2xkZXIoYmFja3VwRm9sZGVyKTtcblxuXHRcdHJldHVybiB3b3Jrc3BhY2U7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVCYWNrdXBGb2xkZXIoYmFja3VwRm9sZGVyOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWZzLmV4aXN0c1N5bmMoYmFja3VwRm9sZGVyKSkge1xuXHRcdFx0ZnMubWtkaXJTeW5jKGJhY2t1cEZvbGRlcik7XG5cdFx0XHRmcy5ta2RpclN5bmMocGF0aC5qb2luKGJhY2t1cEZvbGRlciwgU2NoZW1hcy5maWxlKSk7XG5cdFx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUocGF0aC5qb2luKGJhY2t1cEZvbGRlciwgU2NoZW1hcy5maWxlLCAnZm9vLnR4dCcpLCAnSGVsbG8nKTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiByZWFkV29ya3NwYWNlc01ldGFkYXRhKCk6IElTZXJpYWxpemVkQmFja3VwV29ya3NwYWNlcyB7XG5cdFx0cmV0dXJuIHN0YXRlTWFpblNlcnZpY2UuZ2V0SXRlbSgnYmFja3VwV29ya3NwYWNlcycpIGFzIElTZXJpYWxpemVkQmFja3VwV29ya3NwYWNlcztcblx0fVxuXG5cdGZ1bmN0aW9uIHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKGRhdGE6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0c3RhdGVNYWluU2VydmljZS5yZW1vdmVJdGVtKCdiYWNrdXBXb3Jrc3BhY2VzJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN0YXRlTWFpblNlcnZpY2Uuc2V0SXRlbSgnYmFja3VwV29ya3NwYWNlcycsIEpTT04ucGFyc2UoZGF0YSkpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIHNhbml0aXplUGF0aChwOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBwbGF0Zm9ybS5pc0xpbnV4ID8gcCA6IHAudG9Mb3dlckNhc2UoKTtcblx0fVxuXG5cdGNvbnN0IGZvb0ZpbGUgPSBVUkkuZmlsZShwbGF0Zm9ybS5pc1dpbmRvd3MgPyAnQzpcXFxcZm9vJyA6ICcvZm9vJyk7XG5cdGNvbnN0IGJhckZpbGUgPSBVUkkuZmlsZShwbGF0Zm9ybS5pc1dpbmRvd3MgPyAnQzpcXFxcYmFyJyA6ICcvYmFyJyk7XG5cblx0bGV0IHNlcnZpY2U6IEJhY2t1cE1haW5TZXJ2aWNlICYge1xuXHRcdHRvQmFja3VwUGF0aChhcmc6IFVSSSB8IHN0cmluZyk6IHN0cmluZztcblx0XHR0ZXN0R2V0Rm9sZGVySGFzaChmb2xkZXI6IElGb2xkZXJCYWNrdXBJbmZvKTogc3RyaW5nO1xuXHRcdHRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKCk6IElXb3Jrc3BhY2VCYWNrdXBJbmZvW107XG5cdFx0dGVzdEdldEZvbGRlckJhY2t1cHMoKTogSUZvbGRlckJhY2t1cEluZm9bXTtcblx0fTtcblx0bGV0IGNvbmZpZ1NlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0bGV0IHN0YXRlTWFpblNlcnZpY2U6IEluTWVtb3J5VGVzdFN0YXRlTWFpblNlcnZpY2U7XG5cblx0bGV0IGVudmlyb25tZW50U2VydmljZTogRW52aXJvbm1lbnRNYWluU2VydmljZTtcblx0bGV0IHRlc3REaXI6IHN0cmluZztcblx0bGV0IGJhY2t1cEhvbWU6IHN0cmluZztcblx0bGV0IGV4aXN0aW5nVGVzdEZvbGRlcjE6IFVSSTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0dGVzdERpciA9IGdldFJhbmRvbVRlc3RQYXRoKG9zLnRtcGRpcigpLCAndnNjdGVzdHMnLCAnYmFja3VwbWFpbnNlcnZpY2UnKTtcblx0XHRiYWNrdXBIb21lID0gcGF0aC5qb2luKHRlc3REaXIsICdCYWNrdXBzJyk7XG5cdFx0ZXhpc3RpbmdUZXN0Rm9sZGVyMSA9IFVSSS5maWxlKHBhdGguam9pbih0ZXN0RGlyLCAnZm9sZGVyMScpKTtcblxuXHRcdGVudmlyb25tZW50U2VydmljZSA9IG5ldyBFbnZpcm9ubWVudE1haW5TZXJ2aWNlKHBhcnNlQXJncyhwcm9jZXNzLmFyZ3YsIE9QVElPTlMpLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgLi4ucHJvZHVjdCB9KTtcblxuXHRcdGF3YWl0IGZzLnByb21pc2VzLm1rZGlyKGJhY2t1cEhvbWUsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXG5cdFx0Y29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRzdGF0ZU1haW5TZXJ2aWNlID0gbmV3IEluTWVtb3J5VGVzdFN0YXRlTWFpblNlcnZpY2UoKTtcblxuXHRcdHNlcnZpY2UgPSBuZXcgY2xhc3MgVGVzdEJhY2t1cE1haW5TZXJ2aWNlIGV4dGVuZHMgQmFja3VwTWFpblNlcnZpY2Uge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKGVudmlyb25tZW50U2VydmljZSwgY29uZmlnU2VydmljZSwgbmV3IExvZ1NlcnZpY2UobmV3IENvbnNvbGVNYWluTG9nZ2VyKCkpLCBzdGF0ZU1haW5TZXJ2aWNlKTtcblxuXHRcdFx0XHR0aGlzLmJhY2t1cEhvbWUgPSBiYWNrdXBIb21lO1xuXHRcdFx0fVxuXG5cdFx0XHR0b0JhY2t1cFBhdGgoYXJnOiBVUkkgfCBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdFx0XHRjb25zdCBpZCA9IGFyZyBpbnN0YW5jZW9mIFVSSSA/IHN1cGVyLmdldEZvbGRlckhhc2goeyBmb2xkZXJVcmk6IGFyZyB9KSA6IGFyZztcblx0XHRcdFx0cmV0dXJuIHBhdGguam9pbih0aGlzLmJhY2t1cEhvbWUsIGlkKTtcblx0XHRcdH1cblxuXHRcdFx0dGVzdEdldEZvbGRlckhhc2goZm9sZGVyOiBJRm9sZGVyQmFja3VwSW5mbyk6IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiBzdXBlci5nZXRGb2xkZXJIYXNoKGZvbGRlcik7XG5cdFx0XHR9XG5cblx0XHRcdHRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKCk6IElXb3Jrc3BhY2VCYWNrdXBJbmZvW10ge1xuXHRcdFx0XHRyZXR1cm4gc3VwZXIuZ2V0V29ya3NwYWNlQmFja3VwcygpO1xuXHRcdFx0fVxuXG5cdFx0XHR0ZXN0R2V0Rm9sZGVyQmFja3VwcygpOiBJRm9sZGVyQmFja3VwSW5mb1tdIHtcblx0XHRcdFx0cmV0dXJuIHN1cGVyLmdldEZvbGRlckJhY2t1cHMoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cmV0dXJuIHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0cmV0dXJuIFByb21pc2VzLnJtKHRlc3REaXIpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJ2aWNlIHZhbGlkYXRlcyBiYWNrdXAgd29ya3NwYWNlcyBvbiBzdGFydHVwIGFuZCBjbGVhbnMgdXAgKGZvbGRlciB3b3Jrc3BhY2VzKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdC8vIDEpIGJhY2t1cCB3b3Jrc3BhY2UgcGF0aCBkb2VzIG5vdCBleGlzdFxuXHRcdHNlcnZpY2UucmVnaXN0ZXJGb2xkZXJCYWNrdXAodG9Gb2xkZXJCYWNrdXBJbmZvKGZvb0ZpbGUpKTtcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyRm9sZGVyQmFja3VwKHRvRm9sZGVyQmFja3VwSW5mbyhiYXJGaWxlKSk7XG5cdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0YXNzZXJ0RXF1YWxGb2xkZXJJbmZvcyhzZXJ2aWNlLnRlc3RHZXRGb2xkZXJCYWNrdXBzKCksIFtdKTtcblxuXHRcdC8vIDIpIGJhY2t1cCB3b3Jrc3BhY2UgcGF0aCBleGlzdHMgd2l0aCBlbXB0eSBjb250ZW50cyB3aXRoaW5cblx0XHRmcy5ta2RpclN5bmMoc2VydmljZS50b0JhY2t1cFBhdGgoZm9vRmlsZSkpO1xuXHRcdGZzLm1rZGlyU3luYyhzZXJ2aWNlLnRvQmFja3VwUGF0aChiYXJGaWxlKSk7XG5cdFx0c2VydmljZS5yZWdpc3RlckZvbGRlckJhY2t1cCh0b0ZvbGRlckJhY2t1cEluZm8oZm9vRmlsZSkpO1xuXHRcdHNlcnZpY2UucmVnaXN0ZXJGb2xkZXJCYWNrdXAodG9Gb2xkZXJCYWNrdXBJbmZvKGJhckZpbGUpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRhc3NlcnRFcXVhbEZvbGRlckluZm9zKHNlcnZpY2UudGVzdEdldEZvbGRlckJhY2t1cHMoKSwgW10pO1xuXHRcdGFzc2VydC5vayghZnMuZXhpc3RzU3luYyhzZXJ2aWNlLnRvQmFja3VwUGF0aChmb29GaWxlKSkpO1xuXHRcdGFzc2VydC5vayghZnMuZXhpc3RzU3luYyhzZXJ2aWNlLnRvQmFja3VwUGF0aChiYXJGaWxlKSkpO1xuXG5cdFx0Ly8gMykgYmFja3VwIHdvcmtzcGFjZSBwYXRoIGV4aXN0cyB3aXRoIGVtcHR5IGZvbGRlcnMgd2l0aGluXG5cdFx0ZnMubWtkaXJTeW5jKHNlcnZpY2UudG9CYWNrdXBQYXRoKGZvb0ZpbGUpKTtcblx0XHRmcy5ta2RpclN5bmMoc2VydmljZS50b0JhY2t1cFBhdGgoYmFyRmlsZSkpO1xuXHRcdGZzLm1rZGlyU3luYyhwYXRoLmpvaW4oc2VydmljZS50b0JhY2t1cFBhdGgoZm9vRmlsZSksIFNjaGVtYXMuZmlsZSkpO1xuXHRcdGZzLm1rZGlyU3luYyhwYXRoLmpvaW4oc2VydmljZS50b0JhY2t1cFBhdGgoYmFyRmlsZSksIFNjaGVtYXMudW50aXRsZWQpKTtcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyRm9sZGVyQmFja3VwKHRvRm9sZGVyQmFja3VwSW5mbyhmb29GaWxlKSk7XG5cdFx0c2VydmljZS5yZWdpc3RlckZvbGRlckJhY2t1cCh0b0ZvbGRlckJhY2t1cEluZm8oYmFyRmlsZSkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdGFzc2VydEVxdWFsRm9sZGVySW5mb3Moc2VydmljZS50ZXN0R2V0Rm9sZGVyQmFja3VwcygpLCBbXSk7XG5cdFx0YXNzZXJ0Lm9rKCFmcy5leGlzdHNTeW5jKHNlcnZpY2UudG9CYWNrdXBQYXRoKGZvb0ZpbGUpKSk7XG5cdFx0YXNzZXJ0Lm9rKCFmcy5leGlzdHNTeW5jKHNlcnZpY2UudG9CYWNrdXBQYXRoKGJhckZpbGUpKSk7XG5cblx0XHQvLyA0KSBiYWNrdXAgd29ya3NwYWNlIHBhdGggcG9pbnRzIHRvIGEgd29ya3NwYWNlIHRoYXQgbm8gbG9uZ2VyIGV4aXN0c1xuXHRcdC8vIHNvIGl0IHNob3VsZCBjb252ZXJ0IHRoZSBiYWNrdXAgd29yc3BhY2UgdG8gYW4gZW1wdHkgd29ya3NwYWNlIGJhY2t1cFxuXHRcdGNvbnN0IGZpbGVCYWNrdXBzID0gcGF0aC5qb2luKHNlcnZpY2UudG9CYWNrdXBQYXRoKGZvb0ZpbGUpLCBTY2hlbWFzLmZpbGUpO1xuXHRcdGZzLm1rZGlyU3luYyhzZXJ2aWNlLnRvQmFja3VwUGF0aChmb29GaWxlKSk7XG5cdFx0ZnMubWtkaXJTeW5jKHNlcnZpY2UudG9CYWNrdXBQYXRoKGJhckZpbGUpKTtcblx0XHRmcy5ta2RpclN5bmMoZmlsZUJhY2t1cHMpO1xuXHRcdHNlcnZpY2UucmVnaXN0ZXJGb2xkZXJCYWNrdXAodG9Gb2xkZXJCYWNrdXBJbmZvKGZvb0ZpbGUpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0Rm9sZGVyQmFja3VwcygpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RW1wdHlXaW5kb3dCYWNrdXBzKCkubGVuZ3RoLCAwKTtcblx0XHRmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihmaWxlQmFja3VwcywgJ2JhY2t1cC50eHQnKSwgJycpO1xuXHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRGb2xkZXJCYWNrdXBzKCkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRFbXB0eVdpbmRvd0JhY2t1cHMoKS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJ2aWNlIHZhbGlkYXRlcyBiYWNrdXAgd29ya3NwYWNlcyBvbiBzdGFydHVwIGFuZCBjbGVhbnMgdXAgKHJvb3Qgd29ya3NwYWNlcyknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHQvLyAxKSBiYWNrdXAgd29ya3NwYWNlIHBhdGggZG9lcyBub3QgZXhpc3Rcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyV29ya3NwYWNlQmFja3VwKHRvV29ya3NwYWNlQmFja3VwSW5mbyhmb29GaWxlLmZzUGF0aCkpO1xuXHRcdHNlcnZpY2UucmVnaXN0ZXJXb3Jrc3BhY2VCYWNrdXAodG9Xb3Jrc3BhY2VCYWNrdXBJbmZvKGJhckZpbGUuZnNQYXRoKSk7XG5cdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKCksIFtdKTtcblxuXHRcdC8vIDIpIGJhY2t1cCB3b3Jrc3BhY2UgcGF0aCBleGlzdHMgd2l0aCBlbXB0eSBjb250ZW50cyB3aXRoaW5cblx0XHRmcy5ta2RpclN5bmMoc2VydmljZS50b0JhY2t1cFBhdGgoZm9vRmlsZSkpO1xuXHRcdGZzLm1rZGlyU3luYyhzZXJ2aWNlLnRvQmFja3VwUGF0aChiYXJGaWxlKSk7XG5cdFx0c2VydmljZS5yZWdpc3RlcldvcmtzcGFjZUJhY2t1cCh0b1dvcmtzcGFjZUJhY2t1cEluZm8oZm9vRmlsZS5mc1BhdGgpKTtcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyV29ya3NwYWNlQmFja3VwKHRvV29ya3NwYWNlQmFja3VwSW5mbyhiYXJGaWxlLmZzUGF0aCkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0V29ya3NwYWNlQmFja3VwcygpLCBbXSk7XG5cdFx0YXNzZXJ0Lm9rKCFmcy5leGlzdHNTeW5jKHNlcnZpY2UudG9CYWNrdXBQYXRoKGZvb0ZpbGUpKSk7XG5cdFx0YXNzZXJ0Lm9rKCFmcy5leGlzdHNTeW5jKHNlcnZpY2UudG9CYWNrdXBQYXRoKGJhckZpbGUpKSk7XG5cblx0XHQvLyAzKSBiYWNrdXAgd29ya3NwYWNlIHBhdGggZXhpc3RzIHdpdGggZW1wdHkgZm9sZGVycyB3aXRoaW5cblx0XHRmcy5ta2RpclN5bmMoc2VydmljZS50b0JhY2t1cFBhdGgoZm9vRmlsZSkpO1xuXHRcdGZzLm1rZGlyU3luYyhzZXJ2aWNlLnRvQmFja3VwUGF0aChiYXJGaWxlKSk7XG5cdFx0ZnMubWtkaXJTeW5jKHBhdGguam9pbihzZXJ2aWNlLnRvQmFja3VwUGF0aChmb29GaWxlKSwgU2NoZW1hcy5maWxlKSk7XG5cdFx0ZnMubWtkaXJTeW5jKHBhdGguam9pbihzZXJ2aWNlLnRvQmFja3VwUGF0aChiYXJGaWxlKSwgU2NoZW1hcy51bnRpdGxlZCkpO1xuXHRcdHNlcnZpY2UucmVnaXN0ZXJXb3Jrc3BhY2VCYWNrdXAodG9Xb3Jrc3BhY2VCYWNrdXBJbmZvKGZvb0ZpbGUuZnNQYXRoKSk7XG5cdFx0c2VydmljZS5yZWdpc3RlcldvcmtzcGFjZUJhY2t1cCh0b1dvcmtzcGFjZUJhY2t1cEluZm8oYmFyRmlsZS5mc1BhdGgpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKSwgW10pO1xuXHRcdGFzc2VydC5vayghZnMuZXhpc3RzU3luYyhzZXJ2aWNlLnRvQmFja3VwUGF0aChmb29GaWxlKSkpO1xuXHRcdGFzc2VydC5vayghZnMuZXhpc3RzU3luYyhzZXJ2aWNlLnRvQmFja3VwUGF0aChiYXJGaWxlKSkpO1xuXG5cdFx0Ly8gNCkgYmFja3VwIHdvcmtzcGFjZSBwYXRoIHBvaW50cyB0byBhIHdvcmtzcGFjZSB0aGF0IG5vIGxvbmdlciBleGlzdHNcblx0XHQvLyBzbyBpdCBzaG91bGQgY29udmVydCB0aGUgYmFja3VwIHdvcnNwYWNlIHRvIGFuIGVtcHR5IHdvcmtzcGFjZSBiYWNrdXBcblx0XHRjb25zdCBmaWxlQmFja3VwcyA9IHBhdGguam9pbihzZXJ2aWNlLnRvQmFja3VwUGF0aChmb29GaWxlKSwgU2NoZW1hcy5maWxlKTtcblx0XHRmcy5ta2RpclN5bmMoc2VydmljZS50b0JhY2t1cFBhdGgoZm9vRmlsZSkpO1xuXHRcdGZzLm1rZGlyU3luYyhzZXJ2aWNlLnRvQmFja3VwUGF0aChiYXJGaWxlKSk7XG5cdFx0ZnMubWtkaXJTeW5jKGZpbGVCYWNrdXBzKTtcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyV29ya3NwYWNlQmFja3VwKHRvV29ya3NwYWNlQmFja3VwSW5mbyhmb29GaWxlLmZzUGF0aCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRFbXB0eVdpbmRvd0JhY2t1cHMoKS5sZW5ndGgsIDApO1xuXHRcdGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGZpbGVCYWNrdXBzLCAnYmFja3VwLnR4dCcpLCAnJyk7XG5cdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKS5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEVtcHR5V2luZG93QmFja3VwcygpLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcnZpY2Ugc3VwcG9ydHMgdG8gbWlncmF0ZSBiYWNrdXAgZGF0YSBmcm9tIGFub3RoZXIgbG9jYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmFja3VwUGF0aFRvTWlncmF0ZSA9IHNlcnZpY2UudG9CYWNrdXBQYXRoKGZvb0ZpbGUpO1xuXHRcdGZzLm1rZGlyU3luYyhiYWNrdXBQYXRoVG9NaWdyYXRlKTtcblx0XHRmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihiYWNrdXBQYXRoVG9NaWdyYXRlLCAnYmFja3VwLnR4dCcpLCAnU29tZSBEYXRhJyk7XG5cdFx0c2VydmljZS5yZWdpc3RlckZvbGRlckJhY2t1cCh0b0ZvbGRlckJhY2t1cEluZm8oVVJJLmZpbGUoYmFja3VwUGF0aFRvTWlncmF0ZSkpKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZUJhY2t1cFBhdGggPSBhd2FpdCBzZXJ2aWNlLnJlZ2lzdGVyV29ya3NwYWNlQmFja3VwKHRvV29ya3NwYWNlQmFja3VwSW5mbyhiYXJGaWxlLmZzUGF0aCksIGJhY2t1cFBhdGhUb01pZ3JhdGUpO1xuXG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMod29ya3NwYWNlQmFja3VwUGF0aCkpO1xuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKHBhdGguam9pbih3b3Jrc3BhY2VCYWNrdXBQYXRoLCAnYmFja3VwLnR4dCcpKSk7XG5cdFx0YXNzZXJ0Lm9rKCFmcy5leGlzdHNTeW5jKGJhY2t1cFBhdGhUb01pZ3JhdGUpKTtcblxuXHRcdGNvbnN0IGVtcHR5QmFja3VwcyA9IHNlcnZpY2UuZ2V0RW1wdHlXaW5kb3dCYWNrdXBzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDAsIGVtcHR5QmFja3Vwcy5sZW5ndGgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJ2aWNlIGJhY2t1cCBtaWdyYXRpb24gbWFrZXMgc3VyZSB0byBwcmVzZXJ2ZSBleGlzdGluZyBiYWNrdXBzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJhY2t1cFBhdGhUb01pZ3JhdGUgPSBzZXJ2aWNlLnRvQmFja3VwUGF0aChmb29GaWxlKTtcblx0XHRmcy5ta2RpclN5bmMoYmFja3VwUGF0aFRvTWlncmF0ZSk7XG5cdFx0ZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmFja3VwUGF0aFRvTWlncmF0ZSwgJ2JhY2t1cC50eHQnKSwgJ1NvbWUgRGF0YScpO1xuXHRcdHNlcnZpY2UucmVnaXN0ZXJGb2xkZXJCYWNrdXAodG9Gb2xkZXJCYWNrdXBJbmZvKFVSSS5maWxlKGJhY2t1cFBhdGhUb01pZ3JhdGUpKSk7XG5cblx0XHRjb25zdCBiYWNrdXBQYXRoVG9QcmVzZXJ2ZSA9IHNlcnZpY2UudG9CYWNrdXBQYXRoKGJhckZpbGUpO1xuXHRcdGZzLm1rZGlyU3luYyhiYWNrdXBQYXRoVG9QcmVzZXJ2ZSk7XG5cdFx0ZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYmFja3VwUGF0aFRvUHJlc2VydmUsICdiYWNrdXAudHh0JyksICdTb21lIERhdGEnKTtcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyRm9sZGVyQmFja3VwKHRvRm9sZGVyQmFja3VwSW5mbyhVUkkuZmlsZShiYWNrdXBQYXRoVG9QcmVzZXJ2ZSkpKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZUJhY2t1cFBhdGggPSBhd2FpdCBzZXJ2aWNlLnJlZ2lzdGVyV29ya3NwYWNlQmFja3VwKHRvV29ya3NwYWNlQmFja3VwSW5mbyhiYXJGaWxlLmZzUGF0aCksIGJhY2t1cFBhdGhUb01pZ3JhdGUpO1xuXG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMod29ya3NwYWNlQmFja3VwUGF0aCkpO1xuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKHBhdGguam9pbih3b3Jrc3BhY2VCYWNrdXBQYXRoLCAnYmFja3VwLnR4dCcpKSk7XG5cdFx0YXNzZXJ0Lm9rKCFmcy5leGlzdHNTeW5jKGJhY2t1cFBhdGhUb01pZ3JhdGUpKTtcblxuXHRcdGNvbnN0IGVtcHR5QmFja3VwcyA9IHNlcnZpY2UuZ2V0RW1wdHlXaW5kb3dCYWNrdXBzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDEsIGVtcHR5QmFja3Vwcy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgxLCBmcy5yZWFkZGlyU3luYyhwYXRoLmpvaW4oYmFja3VwSG9tZSwgZW1wdHlCYWNrdXBzWzBdLmJhY2t1cEZvbGRlcikpLmxlbmd0aCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdsb2FkU3luYycsICgpID0+IHtcblx0XHR0ZXN0KCdnZXRGb2xkZXJCYWNrdXBQYXRocygpIHNob3VsZCByZXR1cm4gW10gd2hlbiB3b3Jrc3BhY2VzLmpzb24gZG9lc25cXCd0IGV4aXN0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0RXF1YWxGb2xkZXJJbmZvcyhzZXJ2aWNlLnRlc3RHZXRGb2xkZXJCYWNrdXBzKCksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldEZvbGRlckJhY2t1cFBhdGhzKCkgc2hvdWxkIHJldHVybiBbXSB3aGVuIGZvbGRlcnMgaW4gd29ya3NwYWNlcy5qc29uIGlzIGFic2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKCd7fScpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnRFcXVhbEZvbGRlckluZm9zKHNlcnZpY2UudGVzdEdldEZvbGRlckJhY2t1cHMoKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0Rm9sZGVyQmFja3VwUGF0aHMoKSBzaG91bGQgcmV0dXJuIFtdIHdoZW4gZm9sZGVycyBpbiB3b3Jrc3BhY2VzLmpzb24gaXMgbm90IGEgc3RyaW5nIGFycmF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3tcImZvbGRlcnNcIjp7fX0nKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0RXF1YWxGb2xkZXJJbmZvcyhzZXJ2aWNlLnRlc3RHZXRGb2xkZXJCYWNrdXBzKCksIFtdKTtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKCd7XCJmb2xkZXJzXCI6e1wiZm9vXCI6IFtcImJhclwiXX19Jyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydEVxdWFsRm9sZGVySW5mb3Moc2VydmljZS50ZXN0R2V0Rm9sZGVyQmFja3VwcygpLCBbXSk7XG5cdFx0XHR3cml0ZVdvcmtzcGFjZXNNZXRhZGF0YSgne1wiZm9sZGVyc1wiOntcImZvb1wiOiBbXX19Jyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydEVxdWFsRm9sZGVySW5mb3Moc2VydmljZS50ZXN0R2V0Rm9sZGVyQmFja3VwcygpLCBbXSk7XG5cdFx0XHR3cml0ZVdvcmtzcGFjZXNNZXRhZGF0YSgne1wiZm9sZGVyc1wiOntcImZvb1wiOiBcImJhclwifX0nKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0RXF1YWxGb2xkZXJJbmZvcyhzZXJ2aWNlLnRlc3RHZXRGb2xkZXJCYWNrdXBzKCksIFtdKTtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKCd7XCJmb2xkZXJzXCI6XCJmb29cIn0nKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0RXF1YWxGb2xkZXJJbmZvcyhzZXJ2aWNlLnRlc3RHZXRGb2xkZXJCYWNrdXBzKCksIFtdKTtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKCd7XCJmb2xkZXJzXCI6MX0nKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0RXF1YWxGb2xkZXJJbmZvcyhzZXJ2aWNlLnRlc3RHZXRGb2xkZXJCYWNrdXBzKCksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldEZvbGRlckJhY2t1cFBhdGhzKCkgc2hvdWxkIHJldHVybiBbXSB3aGVuIGZpbGVzLmhvdEV4aXQgPSBcIm9uRXhpdEFuZFdpbmRvd0Nsb3NlXCInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaSA9IHRvRm9sZGVyQmFja3VwSW5mbyhVUkkuZmlsZShmb29GaWxlLmZzUGF0aC50b1VwcGVyQ2FzZSgpKSk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyRm9sZGVyQmFja3VwKGZpKTtcblx0XHRcdGFzc2VydEVxdWFsRm9sZGVySW5mb3Moc2VydmljZS50ZXN0R2V0Rm9sZGVyQmFja3VwcygpLCBbZmldKTtcblx0XHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2ZpbGVzLmhvdEV4aXQnLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElUX0FORF9XSU5ET1dfQ0xPU0UpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnRFcXVhbEZvbGRlckluZm9zKHNlcnZpY2UudGVzdEdldEZvbGRlckJhY2t1cHMoKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0V29ya3NwYWNlQmFja3VwcygpIHNob3VsZCByZXR1cm4gW10gd2hlbiB3b3Jrc3BhY2VzLmpzb24gZG9lc25cXCd0IGV4aXN0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKCksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFdvcmtzcGFjZUJhY2t1cHMoKSBzaG91bGQgcmV0dXJuIFtdIHdoZW4gZm9sZGVyV29ya3NwYWNlcyBpbiB3b3Jrc3BhY2VzLmpzb24gaXMgYWJzZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3t9Jyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0V29ya3NwYWNlQmFja3VwcygpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRXb3Jrc3BhY2VCYWNrdXBzKCkgc2hvdWxkIHJldHVybiBbXSB3aGVuIHJvb3RXb3Jrc3BhY2VzIGluIHdvcmtzcGFjZXMuanNvbiBpcyBub3QgYSBvYmplY3QgYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR3cml0ZVdvcmtzcGFjZXNNZXRhZGF0YSgne1wicm9vdFdvcmtzcGFjZXNcIjp7fX0nKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKCksIFtdKTtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKCd7XCJyb290V29ya3NwYWNlc1wiOntcImZvb1wiOiBbXCJiYXJcIl19fScpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKSwgW10pO1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3tcInJvb3RXb3Jrc3BhY2VzXCI6e1wiZm9vXCI6IFtdfX0nKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKCksIFtdKTtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKCd7XCJyb290V29ya3NwYWNlc1wiOntcImZvb1wiOiBcImJhclwifX0nKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKCksIFtdKTtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKCd7XCJyb290V29ya3NwYWNlc1wiOlwiZm9vXCJ9Jyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0V29ya3NwYWNlQmFja3VwcygpLCBbXSk7XG5cdFx0XHR3cml0ZVdvcmtzcGFjZXNNZXRhZGF0YSgne1wicm9vdFdvcmtzcGFjZXNcIjoxfScpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0V29ya3NwYWNlQmFja3VwcygpIHNob3VsZCByZXR1cm4gW10gd2hlbiB3b3Jrc3BhY2VzIGluIHdvcmtzcGFjZXMuanNvbiBpcyBub3QgYSBvYmplY3QgYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR3cml0ZVdvcmtzcGFjZXNNZXRhZGF0YSgne1wid29ya3NwYWNlc1wiOnt9fScpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKSwgW10pO1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3tcIndvcmtzcGFjZXNcIjp7XCJmb29cIjogW1wiYmFyXCJdfX0nKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKCksIFtdKTtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKCd7XCJ3b3Jrc3BhY2VzXCI6e1wiZm9vXCI6IFtdfX0nKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKCksIFtdKTtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKCd7XCJ3b3Jrc3BhY2VzXCI6e1wiZm9vXCI6IFwiYmFyXCJ9fScpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKSwgW10pO1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3tcIndvcmtzcGFjZXNcIjpcImZvb1wifScpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKSwgW10pO1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3tcIndvcmtzcGFjZXNcIjoxfScpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0V29ya3NwYWNlQmFja3VwcygpIHNob3VsZCByZXR1cm4gW10gd2hlbiBmaWxlcy5ob3RFeGl0ID0gXCJvbkV4aXRBbmRXaW5kb3dDbG9zZVwiJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXBwZXJGb29QYXRoID0gZm9vRmlsZS5mc1BhdGgudG9VcHBlckNhc2UoKTtcblx0XHRcdHNlcnZpY2UucmVnaXN0ZXJXb3Jrc3BhY2VCYWNrdXAodG9Xb3Jrc3BhY2VCYWNrdXBJbmZvKHVwcGVyRm9vUGF0aCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKS5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKCkubWFwKHIgPT4gci53b3Jrc3BhY2UuY29uZmlnUGF0aC50b1N0cmluZygpKSwgW1VSSS5maWxlKHVwcGVyRm9vUGF0aCkudG9TdHJpbmcoKV0pO1xuXHRcdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignZmlsZXMuaG90RXhpdCcsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0V29ya3NwYWNlQmFja3VwcygpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRFbXB0eVdvcmtzcGFjZUJhY2t1cFBhdGhzKCkgc2hvdWxkIHJldHVybiBbXSB3aGVuIHdvcmtzcGFjZXMuanNvbiBkb2VzblxcJ3QgZXhpc3QnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RW1wdHlXaW5kb3dCYWNrdXBzKCksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldEVtcHR5V29ya3NwYWNlQmFja3VwUGF0aHMoKSBzaG91bGQgcmV0dXJuIFtdIHdoZW4gZm9sZGVyV29ya3NwYWNlcyBpbiB3b3Jrc3BhY2VzLmpzb24gaXMgYWJzZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3t9Jyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5nZXRFbXB0eVdpbmRvd0JhY2t1cHMoKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0RW1wdHlXb3Jrc3BhY2VCYWNrdXBQYXRocygpIHNob3VsZCByZXR1cm4gW10gd2hlbiBmb2xkZXJXb3Jrc3BhY2VzIGluIHdvcmtzcGFjZXMuanNvbiBpcyBub3QgYSBzdHJpbmcgYXJyYXknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHR3cml0ZVdvcmtzcGFjZXNNZXRhZGF0YSgne1wiZW1wdHlXb3Jrc3BhY2VzXCI6e319Jyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5nZXRFbXB0eVdpbmRvd0JhY2t1cHMoKSwgW10pO1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3tcImVtcHR5V29ya3NwYWNlc1wiOntcImZvb1wiOiBbXCJiYXJcIl19fScpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RW1wdHlXaW5kb3dCYWNrdXBzKCksIFtdKTtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKCd7XCJlbXB0eVdvcmtzcGFjZXNcIjp7XCJmb29cIjogW119fScpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RW1wdHlXaW5kb3dCYWNrdXBzKCksIFtdKTtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKCd7XCJlbXB0eVdvcmtzcGFjZXNcIjp7XCJmb29cIjogXCJiYXJcIn19Jyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5nZXRFbXB0eVdpbmRvd0JhY2t1cHMoKSwgW10pO1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3tcImVtcHR5V29ya3NwYWNlc1wiOlwiZm9vXCJ9Jyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5nZXRFbXB0eVdpbmRvd0JhY2t1cHMoKSwgW10pO1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoJ3tcImVtcHR5V29ya3NwYWNlc1wiOjF9Jyk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5nZXRFbXB0eVdpbmRvd0JhY2t1cHMoKSwgW10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZGVkdXBlRm9sZGVyV29ya3NwYWNlcycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgaWdub3JlIGR1cGxpY2F0ZXMgKGZvbGRlciB3b3Jrc3BhY2UpJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHRhd2FpdCBlbnN1cmVGb2xkZXJFeGlzdHMoZXhpc3RpbmdUZXN0Rm9sZGVyMSk7XG5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZXNKc29uOiBJU2VyaWFsaXplZEJhY2t1cFdvcmtzcGFjZXMgPSB7XG5cdFx0XHRcdHdvcmtzcGFjZXM6IFtdLFxuXHRcdFx0XHRmb2xkZXJzOiBbeyBmb2xkZXJVcmk6IGV4aXN0aW5nVGVzdEZvbGRlcjEudG9TdHJpbmcoKSB9LCB7IGZvbGRlclVyaTogZXhpc3RpbmdUZXN0Rm9sZGVyMS50b1N0cmluZygpIH1dLFxuXHRcdFx0XHRlbXB0eVdpbmRvd3M6IFtdXG5cdFx0XHR9O1xuXHRcdFx0d3JpdGVXb3Jrc3BhY2VzTWV0YWRhdGEoSlNPTi5zdHJpbmdpZnkod29ya3NwYWNlc0pzb24pKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0XHRjb25zdCBqc29uID0gcmVhZFdvcmtzcGFjZXNNZXRhZGF0YSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChqc29uLmZvbGRlcnMsIFt7IGZvbGRlclVyaTogZXhpc3RpbmdUZXN0Rm9sZGVyMS50b1N0cmluZygpIH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpZ25vcmUgZHVwbGljYXRlcyBvbiBXaW5kb3dzIGFuZCBNYWMgKGZvbGRlciB3b3Jrc3BhY2UpJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHRhd2FpdCBlbnN1cmVGb2xkZXJFeGlzdHMoZXhpc3RpbmdUZXN0Rm9sZGVyMSk7XG5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZXNKc29uOiBJU2VyaWFsaXplZEJhY2t1cFdvcmtzcGFjZXMgPSB7XG5cdFx0XHRcdHdvcmtzcGFjZXM6IFtdLFxuXHRcdFx0XHRmb2xkZXJzOiBbeyBmb2xkZXJVcmk6IGV4aXN0aW5nVGVzdEZvbGRlcjEudG9TdHJpbmcoKSB9LCB7IGZvbGRlclVyaTogZXhpc3RpbmdUZXN0Rm9sZGVyMS50b1N0cmluZygpLnRvTG93ZXJDYXNlKCkgfV0sXG5cdFx0XHRcdGVtcHR5V2luZG93czogW11cblx0XHRcdH07XG5cdFx0XHR3cml0ZVdvcmtzcGFjZXNNZXRhZGF0YShKU09OLnN0cmluZ2lmeSh3b3Jrc3BhY2VzSnNvbikpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5pbml0aWFsaXplKCk7XG5cdFx0XHRjb25zdCBqc29uID0gcmVhZFdvcmtzcGFjZXNNZXRhZGF0YSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChqc29uLmZvbGRlcnMsIFt7IGZvbGRlclVyaTogZXhpc3RpbmdUZXN0Rm9sZGVyMS50b1N0cmluZygpIH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpZ25vcmUgZHVwbGljYXRlcyBvbiBXaW5kb3dzIGFuZCBNYWMgKHJvb3Qgd29ya3NwYWNlKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZVBhdGggPSBwYXRoLmpvaW4odGVzdERpciwgJ0Zvby5jb2RlLXdvcmtzcGFjZScpO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlUGF0aDEgPSBwYXRoLmpvaW4odGVzdERpciwgJ0ZPTy5jb2RlLXdvcmtzcGFjZScpO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlUGF0aDIgPSBwYXRoLmpvaW4odGVzdERpciwgJ2Zvby5jb2RlLXdvcmtzcGFjZScpO1xuXG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UxID0gYXdhaXQgZW5zdXJlV29ya3NwYWNlRXhpc3RzKHRvV29ya3NwYWNlKHdvcmtzcGFjZVBhdGgpKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZTIgPSBhd2FpdCBlbnN1cmVXb3Jrc3BhY2VFeGlzdHModG9Xb3Jrc3BhY2Uod29ya3NwYWNlUGF0aDEpKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZTMgPSBhd2FpdCBlbnN1cmVXb3Jrc3BhY2VFeGlzdHModG9Xb3Jrc3BhY2Uod29ya3NwYWNlUGF0aDIpKTtcblxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlc0pzb246IElTZXJpYWxpemVkQmFja3VwV29ya3NwYWNlcyA9IHtcblx0XHRcdFx0d29ya3NwYWNlczogW3dvcmtzcGFjZTEsIHdvcmtzcGFjZTIsIHdvcmtzcGFjZTNdLm1hcCh0b1NlcmlhbGl6ZWRXb3Jrc3BhY2UpLFxuXHRcdFx0XHRmb2xkZXJzOiBbXSxcblx0XHRcdFx0ZW1wdHlXaW5kb3dzOiBbXVxuXHRcdFx0fTtcblx0XHRcdHdyaXRlV29ya3NwYWNlc01ldGFkYXRhKEpTT04uc3RyaW5naWZ5KHdvcmtzcGFjZXNKc29uKSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmluaXRpYWxpemUoKTtcblxuXHRcdFx0Y29uc3QganNvbiA9IHJlYWRXb3Jrc3BhY2VzTWV0YWRhdGEoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChqc29uLndvcmtzcGFjZXMubGVuZ3RoLCBwbGF0Zm9ybS5pc0xpbnV4ID8gMyA6IDEpO1xuXHRcdFx0aWYgKHBsYXRmb3JtLmlzTGludXgpIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChqc29uLndvcmtzcGFjZXMubWFwKHIgPT4gci5jb25maWdVUklQYXRoKSwgW1VSSS5maWxlKHdvcmtzcGFjZVBhdGgpLnRvU3RyaW5nKCksIFVSSS5maWxlKHdvcmtzcGFjZVBhdGgxKS50b1N0cmluZygpLCBVUkkuZmlsZSh3b3Jrc3BhY2VQYXRoMikudG9TdHJpbmcoKV0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChqc29uLndvcmtzcGFjZXMubWFwKHIgPT4gci5jb25maWdVUklQYXRoKSwgW1VSSS5maWxlKHdvcmtzcGFjZVBhdGgpLnRvU3RyaW5nKCldLCAnc2hvdWxkIHJldHVybiB0aGUgZmlyc3QgZHVwbGljYXRlZCBlbnRyeScpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVnaXN0ZXJXaW5kb3dGb3JCYWNrdXBzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBwZXJzaXN0IHBhdGhzIHRvIHdvcmtzcGFjZXMuanNvbiAoZm9sZGVyIHdvcmtzcGFjZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyRm9sZGVyQmFja3VwKHRvRm9sZGVyQmFja3VwSW5mbyhmb29GaWxlKSk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyRm9sZGVyQmFja3VwKHRvRm9sZGVyQmFja3VwSW5mbyhiYXJGaWxlKSk7XG5cdFx0XHRhc3NlcnRFcXVhbEZvbGRlckluZm9zKHNlcnZpY2UudGVzdEdldEZvbGRlckJhY2t1cHMoKSwgW3RvRm9sZGVyQmFja3VwSW5mbyhmb29GaWxlKSwgdG9Gb2xkZXJCYWNrdXBJbmZvKGJhckZpbGUpXSk7XG5cblx0XHRcdGNvbnN0IGpzb24gPSByZWFkV29ya3NwYWNlc01ldGFkYXRhKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGpzb24uZm9sZGVycywgW3sgZm9sZGVyVXJpOiBmb29GaWxlLnRvU3RyaW5nKCkgfSwgeyBmb2xkZXJVcmk6IGJhckZpbGUudG9TdHJpbmcoKSB9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcGVyc2lzdCBwYXRocyB0byB3b3Jrc3BhY2VzLmpzb24gKHJvb3Qgd29ya3NwYWNlKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdzMSA9IHRvV29ya3NwYWNlQmFja3VwSW5mbyhmb29GaWxlLmZzUGF0aCk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyV29ya3NwYWNlQmFja3VwKHdzMSk7XG5cdFx0XHRjb25zdCB3czIgPSB0b1dvcmtzcGFjZUJhY2t1cEluZm8oYmFyRmlsZS5mc1BhdGgpO1xuXHRcdFx0c2VydmljZS5yZWdpc3RlcldvcmtzcGFjZUJhY2t1cCh3czIpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKS5tYXAoYiA9PiBiLndvcmtzcGFjZS5jb25maWdQYXRoLnRvU3RyaW5nKCkpLCBbZm9vRmlsZS50b1N0cmluZygpLCBiYXJGaWxlLnRvU3RyaW5nKCldKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3czEud29ya3NwYWNlLmlkLCBzZXJ2aWNlLnRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKClbMF0ud29ya3NwYWNlLmlkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3czIud29ya3NwYWNlLmlkLCBzZXJ2aWNlLnRlc3RHZXRXb3Jrc3BhY2VCYWNrdXBzKClbMV0ud29ya3NwYWNlLmlkKTtcblxuXHRcdFx0Y29uc3QganNvbiA9IHJlYWRXb3Jrc3BhY2VzTWV0YWRhdGEoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoanNvbi53b3Jrc3BhY2VzLm1hcChiID0+IGIuY29uZmlnVVJJUGF0aCksIFtmb29GaWxlLnRvU3RyaW5nKCksIGJhckZpbGUudG9TdHJpbmcoKV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzMS53b3Jrc3BhY2UuaWQsIGpzb24ud29ya3NwYWNlc1swXS5pZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MyLndvcmtzcGFjZS5pZCwganNvbi53b3Jrc3BhY2VzWzFdLmlkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGFsd2F5cyBzdG9yZSB0aGUgd29ya3NwYWNlIHBhdGggaW4gd29ya3NwYWNlcy5qc29uIHVzaW5nIHRoZSBjYXNlIGdpdmVuLCByZWdhcmRsZXNzIG9mIHdoZXRoZXIgdGhlIGZpbGUgc3lzdGVtIGlzIGNhc2Utc2Vuc2l0aXZlIChmb2xkZXIgd29ya3NwYWNlKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyRm9sZGVyQmFja3VwKHRvRm9sZGVyQmFja3VwSW5mbyhVUkkuZmlsZShmb29GaWxlLmZzUGF0aC50b1VwcGVyQ2FzZSgpKSkpO1xuXHRcdGFzc2VydEVxdWFsRm9sZGVySW5mb3Moc2VydmljZS50ZXN0R2V0Rm9sZGVyQmFja3VwcygpLCBbdG9Gb2xkZXJCYWNrdXBJbmZvKFVSSS5maWxlKGZvb0ZpbGUuZnNQYXRoLnRvVXBwZXJDYXNlKCkpKV0pO1xuXG5cdFx0Y29uc3QganNvbiA9IHJlYWRXb3Jrc3BhY2VzTWV0YWRhdGEoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGpzb24uZm9sZGVycywgW3sgZm9sZGVyVXJpOiBVUkkuZmlsZShmb29GaWxlLmZzUGF0aC50b1VwcGVyQ2FzZSgpKS50b1N0cmluZygpIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGFsd2F5cyBzdG9yZSB0aGUgd29ya3NwYWNlIHBhdGggaW4gd29ya3NwYWNlcy5qc29uIHVzaW5nIHRoZSBjYXNlIGdpdmVuLCByZWdhcmRsZXNzIG9mIHdoZXRoZXIgdGhlIGZpbGUgc3lzdGVtIGlzIGNhc2Utc2Vuc2l0aXZlIChyb290IHdvcmtzcGFjZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXBwZXJGb29QYXRoID0gZm9vRmlsZS5mc1BhdGgudG9VcHBlckNhc2UoKTtcblx0XHRzZXJ2aWNlLnJlZ2lzdGVyV29ya3NwYWNlQmFja3VwKHRvV29ya3NwYWNlQmFja3VwSW5mbyh1cHBlckZvb1BhdGgpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldFdvcmtzcGFjZUJhY2t1cHMoKS5tYXAoYiA9PiBiLndvcmtzcGFjZS5jb25maWdQYXRoLnRvU3RyaW5nKCkpLCBbVVJJLmZpbGUodXBwZXJGb29QYXRoKS50b1N0cmluZygpXSk7XG5cblx0XHRjb25zdCBqc29uID0gcmVhZFdvcmtzcGFjZXNNZXRhZGF0YSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoanNvbi53b3Jrc3BhY2VzLm1hcChiID0+IGIuY29uZmlnVVJJUGF0aCksIFtVUkkuZmlsZSh1cHBlckZvb1BhdGgpLnRvU3RyaW5nKCldKTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldFdvcmtzcGFjZUhhc2gnLCAoKSA9PiB7XG5cdFx0KHBsYXRmb3JtLmlzTGludXggPyB0ZXN0LnNraXAgOiB0ZXN0KSgnc2hvdWxkIGlnbm9yZSBjYXNlIG9uIFdpbmRvd3MgYW5kIE1hYycsICgpID0+IHtcblx0XHRcdGNvbnN0IGFzc2VydEZvbGRlckhhc2ggPSAodXJpMTogVVJJLCB1cmkyOiBVUkkpID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudGVzdEdldEZvbGRlckhhc2godG9Gb2xkZXJCYWNrdXBJbmZvKHVyaTEpKSwgc2VydmljZS50ZXN0R2V0Rm9sZGVySGFzaCh0b0ZvbGRlckJhY2t1cEluZm8odXJpMikpKTtcblx0XHRcdH07XG5cblx0XHRcdGlmIChwbGF0Zm9ybS5pc01hY2ludG9zaCkge1xuXHRcdFx0XHRhc3NlcnRGb2xkZXJIYXNoKFVSSS5maWxlKCcvZm9vJyksIFVSSS5maWxlKCcvRk9PJykpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocGxhdGZvcm0uaXNXaW5kb3dzKSB7XG5cdFx0XHRcdGFzc2VydEZvbGRlckhhc2goVVJJLmZpbGUoJ2M6XFxcXGZvbycpLCBVUkkuZmlsZSgnQzpcXFxcRk9PJykpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbWl4ZWQgcGF0aCBjYXNpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBjYXNlIGluc2Vuc2l0aXZlIHBhdGhzIHByb3Blcmx5IChyZWdpc3RlcldpbmRvd0ZvckJhY2t1cHNTeW5jKSAoZm9sZGVyIHdvcmtzcGFjZSknLCAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyRm9sZGVyQmFja3VwKHRvRm9sZGVyQmFja3VwSW5mbyhmb29GaWxlKSk7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyRm9sZGVyQmFja3VwKHRvRm9sZGVyQmFja3VwSW5mbyhVUkkuZmlsZShmb29GaWxlLmZzUGF0aC50b1VwcGVyQ2FzZSgpKSkpO1xuXG5cdFx0XHRpZiAocGxhdGZvcm0uaXNMaW51eCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0Rm9sZGVyQmFja3VwcygpLmxlbmd0aCwgMik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0Rm9sZGVyQmFja3VwcygpLmxlbmd0aCwgMSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGNhc2UgaW5zZW5zaXRpdmUgcGF0aHMgcHJvcGVybHkgKHJlZ2lzdGVyV2luZG93Rm9yQmFja3Vwc1N5bmMpIChyb290IHdvcmtzcGFjZSknLCAoKSA9PiB7XG5cdFx0XHRzZXJ2aWNlLnJlZ2lzdGVyV29ya3NwYWNlQmFja3VwKHRvV29ya3NwYWNlQmFja3VwSW5mbyhmb29GaWxlLmZzUGF0aCkpO1xuXHRcdFx0c2VydmljZS5yZWdpc3RlcldvcmtzcGFjZUJhY2t1cCh0b1dvcmtzcGFjZUJhY2t1cEluZm8oZm9vRmlsZS5mc1BhdGgudG9VcHBlckNhc2UoKSkpO1xuXG5cdFx0XHRpZiAocGxhdGZvcm0uaXNMaW51eCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0V29ya3NwYWNlQmFja3VwcygpLmxlbmd0aCwgMik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS50ZXN0R2V0V29ya3NwYWNlQmFja3VwcygpLmxlbmd0aCwgMSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXREaXJ0eVdvcmtzcGFjZXMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHJlcG9ydCBpZiBhIHdvcmtzcGFjZSBvciBmb2xkZXIgaGFzIGJhY2t1cHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmb2xkZXJCYWNrdXBQYXRoID0gc2VydmljZS5yZWdpc3RlckZvbGRlckJhY2t1cCh0b0ZvbGRlckJhY2t1cEluZm8oZm9vRmlsZSkpO1xuXG5cdFx0XHRjb25zdCBiYWNrdXBXb3Jrc3BhY2VJbmZvID0gdG9Xb3Jrc3BhY2VCYWNrdXBJbmZvKGZvb0ZpbGUuZnNQYXRoKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUJhY2t1cFBhdGggPSBzZXJ2aWNlLnJlZ2lzdGVyV29ya3NwYWNlQmFja3VwKGJhY2t1cFdvcmtzcGFjZUluZm8pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKChhd2FpdCBzZXJ2aWNlLmdldERpcnR5V29ya3NwYWNlcygpKS5sZW5ndGgpLCAwKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZnMucHJvbWlzZXMubWtkaXIocGF0aC5qb2luKGZvbGRlckJhY2t1cFBhdGgsIFNjaGVtYXMuZmlsZSksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0XHRhd2FpdCBmcy5wcm9taXNlcy5ta2RpcihwYXRoLmpvaW4od29ya3NwYWNlQmFja3VwUGF0aCwgU2NoZW1hcy51bnRpdGxlZCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSAtIGZvbGRlciBtaWdodCBleGlzdCBhbHJlYWR5XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoKGF3YWl0IHNlcnZpY2UuZ2V0RGlydHlXb3Jrc3BhY2VzKCkpLmxlbmd0aCksIDApO1xuXG5cdFx0XHRmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihmb2xkZXJCYWNrdXBQYXRoLCBTY2hlbWFzLmZpbGUsICc1OTRhNGE5ZDgyYTI3N2E4OTlkNDcxM2E1YjA4ZjUwNCcpLCAnJyk7XG5cdFx0XHRmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbih3b3Jrc3BhY2VCYWNrdXBQYXRoLCBTY2hlbWFzLnVudGl0bGVkLCAnNTk0YTRhOWQ4MmEyNzdhODk5ZDQ3MTNhNWIwOGY1MDQnKSwgJycpO1xuXG5cdFx0XHRjb25zdCBkaXJ0eVdvcmtzcGFjZXMgPSBhd2FpdCBzZXJ2aWNlLmdldERpcnR5V29ya3NwYWNlcygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpcnR5V29ya3NwYWNlcy5sZW5ndGgsIDIpO1xuXG5cdFx0XHRsZXQgZm91bmQgPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBkaXJ0eVdvcmtwc3BhY2Ugb2YgZGlydHlXb3Jrc3BhY2VzKSB7XG5cdFx0XHRcdGlmIChpc0ZvbGRlckJhY2t1cEluZm8oZGlydHlXb3JrcHNwYWNlKSkge1xuXHRcdFx0XHRcdGlmIChpc0VxdWFsKGZvb0ZpbGUsIGRpcnR5V29ya3BzcGFjZS5mb2xkZXJVcmkpKSB7XG5cdFx0XHRcdFx0XHRmb3VuZCsrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAoaXNFcXVhbChiYWNrdXBXb3Jrc3BhY2VJbmZvLndvcmtzcGFjZS5jb25maWdQYXRoLCBkaXJ0eVdvcmtwc3BhY2Uud29ya3NwYWNlLmNvbmZpZ1BhdGgpKSB7XG5cdFx0XHRcdFx0XHRmb3VuZCsrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91bmQsIDIpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsa0JBQWtCO0FBQzNCLFlBQVksUUFBUTtBQUNwQixZQUFZLFFBQVE7QUFDcEIsU0FBUyxlQUFlO0FBQ3hCLFlBQVksVUFBVTtBQUN0QixZQUFZLGNBQWM7QUFDMUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsU0FBUyxpQkFBaUI7QUFDbkMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFDbEMsT0FBTyxhQUFhO0FBQ3BCLFNBQTRCLDBCQUFnRDtBQUU1RSxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLCtDQUErQztBQUV4RCxXQUFXLHFCQUFxQixNQUFNO0FBRXJDLFdBQVMsdUJBQXVCLFFBQTZCLFVBQStCO0FBQzNGLFVBQU0sa0JBQWtCLENBQUMsT0FBMEIsRUFBRSxXQUFXLEVBQUUsVUFBVSxTQUFTLEdBQUcsaUJBQWlCLEVBQUUsZ0JBQWdCO0FBQzNILFdBQU8sZ0JBQWdCLE9BQU8sSUFBSSxlQUFlLEdBQUcsU0FBUyxJQUFJLGVBQWUsQ0FBQztBQUFBLEVBQ2xGO0FBRUEsV0FBUyxZQUFZQSxPQUFvQztBQUN4RCxXQUFPO0FBQUEsTUFDTixJQUFJLFdBQVcsS0FBSyxFQUFFLE9BQU8sYUFBYUEsS0FBSSxDQUFDLEVBQUUsT0FBTyxLQUFL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
