import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { dirname, isEqual, joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { AbstractNativeEnvironmentService } from "../../../environment/common/environmentService.js";
import { FileService } from "../../../files/common/fileService.js";
import { FileChangeType, FileSystemProviderCapabilities } from "../../../files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import product from "../../../product/common/product.js";
import { UriIdentityService } from "../../../uriIdentity/common/uriIdentityService.js";
import { FileUserDataProvider } from "../../common/fileUserDataProvider.js";
import { UserDataProfilesService } from "../../../userDataProfile/common/userDataProfile.js";
const ROOT = URI.file("tests").with({ scheme: "vscode-tests" });
class TestEnvironmentService extends AbstractNativeEnvironmentService {
  constructor(_appSettingsHome) {
    super(/* @__PURE__ */ Object.create(null), /* @__PURE__ */ Object.create(null), { _serviceBrand: void 0, ...product });
    this._appSettingsHome = _appSettingsHome;
  }
  get userRoamingDataHome() {
    return this._appSettingsHome.with({ scheme: Schemas.vscodeUserData });
  }
  get cacheHome() {
    return this.userRoamingDataHome;
  }
}
suite("FileUserDataProvider", () => {
  let testObject;
  let userDataHomeOnDisk;
  let backupWorkspaceHomeOnDisk;
  let environmentService;
  let userDataProfilesService;
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let fileUserDataProvider;
  setup(async () => {
    const logService = new NullLogService();
    testObject = disposables.add(new FileService(logService));
    const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(testObject.registerProvider(ROOT.scheme, fileSystemProvider));
    userDataHomeOnDisk = joinPath(ROOT, "User");
    const backupHome = joinPath(ROOT, "Backups");
    backupWorkspaceHomeOnDisk = joinPath(backupHome, "workspaceId");
    await testObject.createFolder(userDataHomeOnDisk);
    await testObject.createFolder(backupWorkspaceHomeOnDisk);
    environmentService = new TestEnvironmentService(userDataHomeOnDisk);
    const uriIdentityService = disposables.add(new UriIdentityService(testObject));
    userDataProfilesService = disposables.add(new UserDataProfilesService(environmentService, testObject, uriIdentityService, logService));
    fileUserDataProvider = disposables.add(new FileUserDataProvider(ROOT.scheme, fileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, logService));
    disposables.add(fileUserDataProvider);
    disposables.add(testObject.registerProvider(Schemas.vscodeUserData, fileUserDataProvider));
  });
  test("exists return false when file does not exist", async () => {
    const exists = await testObject.exists(userDataProfilesService.defaultProfile.settingsResource);
    assert.strictEqual(exists, false);
  });
  test("read file throws error if not exist", async () => {
    try {
      await testObject.readFile(userDataProfilesService.defaultProfile.settingsResource);
      assert.fail("Should fail since file does not exist");
    } catch (e) {
    }
  });
  test("read existing file", async () => {
    await testObject.writeFile(joinPath(userDataHomeOnDisk, "settings.json"), VSBuffer.fromString("{}"));
    const result = await testObject.readFile(userDataProfilesService.defaultProfile.settingsResource);
    assert.strictEqual(result.value.toString(), "{}");
  });
  test("create file", async () => {
    const resource = userDataProfilesService.defaultProfile.settingsResource;
    const actual1 = await testObject.createFile(resource, VSBuffer.fromString("{}"));
    assert.strictEqual(actual1.resource.toString(), resource.toString());
    const actual2 = await testObject.readFile(joinPath(userDataHomeOnDisk, "settings.json"));
    assert.strictEqual(actual2.value.toString(), "{}");
  });
  test("write file creates the file if not exist", async () => {
    const resource = userDataProfilesService.defaultProfile.settingsResource;
    const actual1 = await testObject.writeFile(resource, VSBuffer.fromString("{}"));
    assert.strictEqual(actual1.resource.toString(), resource.toString());
    const actual2 = await testObject.readFile(joinPath(userDataHomeOnDisk, "settings.json"));
    assert.strictEqual(actual2.value.toString(), "{}");
  });
  test("write to existing file", async () => {
    const resource = userDataProfilesService.defaultProfile.settingsResource;
    await testObject.writeFile(joinPath(userDataHomeOnDisk, "settings.json"), VSBuffer.fromString("{}"));
    const actual1 = await testObject.writeFile(resource, VSBuffer.fromString("{a:1}"));
    assert.strictEqual(actual1.resource.toString(), resource.toString());
    const actual2 = await testObject.readFile(joinPath(userDataHomeOnDisk, "settings.json"));
    assert.strictEqual(actual2.value.toString(), "{a:1}");
  });
  test("delete file", async () => {
    await testObject.writeFile(joinPath(userDataHomeOnDisk, "settings.json"), VSBuffer.fromString(""));
    await testObject.del(userDataProfilesService.defaultProfile.settingsResource);
    const result = await testObject.exists(joinPath(userDataHomeOnDisk, "settings.json"));
    assert.strictEqual(false, result);
  });
  test("resolve file", async () => {
    await testObject.writeFile(joinPath(userDataHomeOnDisk, "settings.json"), VSBuffer.fromString(""));
    const result = await testObject.resolve(userDataProfilesService.defaultProfile.settingsResource);
    assert.ok(!result.isDirectory);
    assert.ok(result.children === void 0);
  });
  test("exists return false for folder that does not exist", async () => {
    const exists = await testObject.exists(userDataProfilesService.defaultProfile.snippetsHome);
    assert.strictEqual(exists, false);
  });
  test("exists return true for folder that exists", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets"));
    const exists = await testObject.exists(userDataProfilesService.defaultProfile.snippetsHome);
    assert.strictEqual(exists, true);
  });
  test("read file throws error for folder", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets"));
    try {
      await testObject.readFile(userDataProfilesService.defaultProfile.snippetsHome);
      assert.fail("Should fail since read file is not supported for folders");
    } catch (e) {
    }
  });
  test("read file under folder", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets"));
    await testObject.writeFile(joinPath(userDataHomeOnDisk, "snippets", "settings.json"), VSBuffer.fromString("{}"));
    const resource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json");
    const actual = await testObject.readFile(resource);
    assert.strictEqual(actual.resource.toString(), resource.toString());
    assert.strictEqual(actual.value.toString(), "{}");
  });
  test("read file under sub folder", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets", "java"));
    await testObject.writeFile(joinPath(userDataHomeOnDisk, "snippets", "java", "settings.json"), VSBuffer.fromString("{}"));
    const resource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, "java/settings.json");
    const actual = await testObject.readFile(resource);
    assert.strictEqual(actual.resource.toString(), resource.toString());
    assert.strictEqual(actual.value.toString(), "{}");
  });
  test("create file under folder that exists", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets"));
    const resource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json");
    const actual1 = await testObject.createFile(resource, VSBuffer.fromString("{}"));
    assert.strictEqual(actual1.resource.toString(), resource.toString());
    const actual2 = await testObject.readFile(joinPath(userDataHomeOnDisk, "snippets", "settings.json"));
    assert.strictEqual(actual2.value.toString(), "{}");
  });
  test("create file under folder that does not exist", async () => {
    const resource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json");
    const actual1 = await testObject.createFile(resource, VSBuffer.fromString("{}"));
    assert.strictEqual(actual1.resource.toString(), resource.toString());
    const actual2 = await testObject.readFile(joinPath(userDataHomeOnDisk, "snippets", "settings.json"));
    assert.strictEqual(actual2.value.toString(), "{}");
  });
  test("write to not existing file under container that exists", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets"));
    const resource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json");
    const actual1 = await testObject.writeFile(resource, VSBuffer.fromString("{}"));
    assert.strictEqual(actual1.resource.toString(), resource.toString());
    const actual = await testObject.readFile(joinPath(userDataHomeOnDisk, "snippets", "settings.json"));
    assert.strictEqual(actual.value.toString(), "{}");
  });
  test("write to not existing file under container that does not exists", async () => {
    const resource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json");
    const actual1 = await testObject.writeFile(resource, VSBuffer.fromString("{}"));
    assert.strictEqual(actual1.resource.toString(), resource.toString());
    const actual = await testObject.readFile(joinPath(userDataHomeOnDisk, "snippets", "settings.json"));
    assert.strictEqual(actual.value.toString(), "{}");
  });
  test("write to existing file under container", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets"));
    await testObject.writeFile(joinPath(userDataHomeOnDisk, "snippets", "settings.json"), VSBuffer.fromString("{}"));
    const resource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json");
    const actual1 = await testObject.writeFile(resource, VSBuffer.fromString("{a:1}"));
    assert.strictEqual(actual1.resource.toString(), resource.toString());
    const actual = await testObject.readFile(joinPath(userDataHomeOnDisk, "snippets", "settings.json"));
    assert.strictEqual(actual.value.toString(), "{a:1}");
  });
  test("write file under sub container", async () => {
    const resource = joinPath(userDataProfilesService.defaultProfile.snippetsHome, "java/settings.json");
    const actual1 = await testObject.writeFile(resource, VSBuffer.fromString("{}"));
    assert.strictEqual(actual1.resource.toString(), resource.toString());
    const actual = await testObject.readFile(joinPath(userDataHomeOnDisk, "snippets", "java", "settings.json"));
    assert.strictEqual(actual.value.toString(), "{}");
  });
  test("delete throws error for folder that does not exist", async () => {
    try {
      await testObject.del(userDataProfilesService.defaultProfile.snippetsHome);
      assert.fail("Should fail the folder does not exist");
    } catch (e) {
    }
  });
  test("delete not existing file under container that exists", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets"));
    try {
      await testObject.del(joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json"));
      assert.fail("Should fail since file does not exist");
    } catch (e) {
    }
  });
  test("delete not existing file under container that does not exists", async () => {
    try {
      await testObject.del(joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json"));
      assert.fail("Should fail since file does not exist");
    } catch (e) {
    }
  });
  test("delete existing file under folder", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets"));
    await testObject.writeFile(joinPath(userDataHomeOnDisk, "snippets", "settings.json"), VSBuffer.fromString("{}"));
    await testObject.del(joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json"));
    const exists = await testObject.exists(joinPath(userDataHomeOnDisk, "snippets", "settings.json"));
    assert.strictEqual(exists, false);
  });
  test("resolve folder", async () => {
    await testObject.createFolder(joinPath(userDataHomeOnDisk, "snippets"));
    await testObject.writeFile(joinPath(userDataHomeOnDisk, "snippets", "settings.json"), VSBuffer.fromString("{}"));
    const result = await testObject.resolve(userDataProfilesService.defaultProfile.snippetsHome);
    assert.ok(result.isDirectory);
    assert.ok(result.children !== void 0);
    assert.strictEqual(result.children.length, 1);
    assert.strictEqual(result.children[0].resource.toString(), joinPath(userDataProfilesService.defaultProfile.snippetsHome, "settings.json").toString());
  });
  test("read backup file", async () => {
    await testObject.writeFile(joinPath(backupWorkspaceHomeOnDisk, "backup.json"), VSBuffer.fromString("{}"));
    const result = await testObject.readFile(joinPath(backupWorkspaceHomeOnDisk.with({ scheme: environmentService.userRoamingDataHome.scheme }), `backup.json`));
    assert.strictEqual(result.value.toString(), "{}");
  });
  test("create backup file", async () => {
    await testObject.createFile(joinPath(backupWorkspaceHomeOnDisk.with({ scheme: environmentService.userRoamingDataHome.scheme }), `backup.json`), VSBuffer.fromString("{}"));
    const result = await testObject.readFile(joinPath(backupWorkspaceHomeOnDisk, "backup.json"));
    assert.strictEqual(result.value.toString(), "{}");
  });
  test("write backup file", async () => {
    await testObject.writeFile(joinPath(backupWorkspaceHomeOnDisk, "backup.json"), VSBuffer.fromString("{}"));
    await testObject.writeFile(joinPath(backupWorkspaceHomeOnDisk.with({ scheme: environmentService.userRoamingDataHome.scheme }), `backup.json`), VSBuffer.fromString("{a:1}"));
    const result = await testObject.readFile(joinPath(backupWorkspaceHomeOnDisk, "backup.json"));
    assert.strictEqual(result.value.toString(), "{a:1}");
  });
  test("resolve backups folder", async () => {
    await testObject.writeFile(joinPath(backupWorkspaceHomeOnDisk, "backup.json"), VSBuffer.fromString("{}"));
    const result = await testObject.resolve(backupWorkspaceHomeOnDisk.with({ scheme: environmentService.userRoamingDataHome.scheme }));
    assert.ok(result.isDirectory);
    assert.ok(result.children !== void 0);
    assert.strictEqual(result.children.length, 1);
    assert.strictEqual(result.children[0].resource.toString(), joinPath(backupWorkspaceHomeOnDisk.with({ scheme: environmentService.userRoamingDataHome.scheme }), `backup.json`).toString());
  });
});
class TestFileSystemProvider {
  constructor(onDidChangeFile) {
    this.onDidChangeFile = onDidChangeFile;
    this.capabilities = FileSystemProviderCapabilities.FileReadWrite;
    this.onDidChangeCapabilities = Event.None;
  }
  watch() {
    return Disposable.None;
  }
  stat() {
    throw new Error("Not Supported");
  }
  mkdir(resource) {
    throw new Error("Not Supported");
  }
  rename() {
    throw new Error("Not Supported");
  }
  readFile(resource) {
    throw new Error("Not Supported");
  }
  readdir(resource) {
    throw new Error("Not Supported");
  }
  writeFile() {
    throw new Error("Not Supported");
  }
  delete() {
    throw new Error("Not Supported");
  }
  open(resource, opts) {
    throw new Error("Not Supported");
  }
  close(fd) {
    throw new Error("Not Supported");
  }
  read(fd, pos, data, offset, length) {
    throw new Error("Not Supported");
  }
  write(fd, pos, data, offset, length) {
    throw new Error("Not Supported");
  }
  readFileStream(resource, opts, token) {
    throw new Error("Method not implemented.");
  }
}
suite("FileUserDataProvider - Watching", () => {
  let testObject;
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const rootFileResource = joinPath(ROOT, "User");
  const rootUserDataResource = rootFileResource.with({ scheme: Schemas.vscodeUserData });
  let fileEventEmitter;
  setup(() => {
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    const environmentService = new TestEnvironmentService(rootFileResource);
    const uriIdentityService = disposables.add(new UriIdentityService(fileService));
    const userDataProfilesService = disposables.add(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
    fileEventEmitter = disposables.add(new Emitter());
    testObject = disposables.add(new FileUserDataProvider(rootFileResource.scheme, new TestFileSystemProvider(fileEventEmitter.event), Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, new NullLogService()));
  });
  test("file added change event", (done) => {
    disposables.add(testObject.watch(rootUserDataResource, { excludes: [], recursive: false }));
    const expected = joinPath(rootUserDataResource, "settings.json");
    const target = joinPath(rootFileResource, "settings.json");
    disposables.add(testObject.onDidChangeFile((e) => {
      if (isEqual(e[0].resource, expected) && e[0].type === FileChangeType.ADDED) {
        done();
      }
    }));
    fileEventEmitter.fire([{
      resource: target,
      type: FileChangeType.ADDED
    }]);
  });
  test("file updated change event", (done) => {
    disposables.add(testObject.watch(rootUserDataResource, { excludes: [], recursive: false }));
    const expected = joinPath(rootUserDataResource, "settings.json");
    const target = joinPath(rootFileResource, "settings.json");
    disposables.add(testObject.onDidChangeFile((e) => {
      if (isEqual(e[0].resource, expected) && e[0].type === FileChangeType.UPDATED) {
        done();
      }
    }));
    fileEventEmitter.fire([{
      resource: target,
      type: FileChangeType.UPDATED
    }]);
  });
  test("file deleted change event", (done) => {
    disposables.add(testObject.watch(rootUserDataResource, { excludes: [], recursive: false }));
    const expected = joinPath(rootUserDataResource, "settings.json");
    const target = joinPath(rootFileResource, "settings.json");
    disposables.add(testObject.onDidChangeFile((e) => {
      if (isEqual(e[0].resource, expected) && e[0].type === FileChangeType.DELETED) {
        done();
      }
    }));
    fileEventEmitter.fire([{
      resource: target,
      type: FileChangeType.DELETED
    }]);
  });
  test("file under folder created change event", (done) => {
    disposables.add(testObject.watch(rootUserDataResource, { excludes: [], recursive: false }));
    const expected = joinPath(rootUserDataResource, "snippets", "settings.json");
    const target = joinPath(rootFileResource, "snippets", "settings.json");
    disposables.add(testObject.onDidChangeFile((e) => {
      if (isEqual(e[0].resource, expected) && e[0].type === FileChangeType.ADDED) {
        done();
      }
    }));
    fileEventEmitter.fire([{
      resource: target,
      type: FileChangeType.ADDED
    }]);
  });
  test("file under folder updated change event", (done) => {
    disposables.add(testObject.watch(rootUserDataResource, { excludes: [], recursive: false }));
    const expected = joinPath(rootUserDataResource, "snippets", "settings.json");
    const target = joinPath(rootFileResource, "snippets", "settings.json");
    disposables.add(testObject.onDidChangeFile((e) => {
      if (isEqual(e[0].resource, expected) && e[0].type === FileChangeType.UPDATED) {
        done();
      }
    }));
    fileEventEmitter.fire([{
      resource: target,
      type: FileChangeType.UPDATED
    }]);
  });
  test("file under folder deleted change event", (done) => {
    disposables.add(testObject.watch(rootUserDataResource, { excludes: [], recursive: false }));
    const expected = joinPath(rootUserDataResource, "snippets", "settings.json");
    const target = joinPath(rootFileResource, "snippets", "settings.json");
    disposables.add(testObject.onDidChangeFile((e) => {
      if (isEqual(e[0].resource, expected) && e[0].type === FileChangeType.DELETED) {
        done();
      }
    }));
    fileEventEmitter.fire([{
      resource: target,
      type: FileChangeType.DELETED
    }]);
  });
  test("event is not triggered if not watched", async () => {
    const target = joinPath(rootFileResource, "settings.json");
    let triggered = false;
    disposables.add(testObject.onDidChangeFile(() => triggered = true));
    fileEventEmitter.fire([{
      resource: target,
      type: FileChangeType.DELETED
    }]);
    if (triggered) {
      assert.fail("event should not be triggered");
    }
  });
  test("event is not triggered if not watched 2", async () => {
    disposables.add(testObject.watch(rootUserDataResource, { excludes: [], recursive: false }));
    const target = joinPath(dirname(rootFileResource), "settings.json");
    let triggered = false;
    disposables.add(testObject.onDidChangeFile(() => triggered = true));
    fileEventEmitter.fire([{
      resource: target,
      type: FileChangeType.DELETED
    }]);
    if (triggered) {
      assert.fail("event should not be triggered");
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhL3Rlc3QvYnJvd3Nlci9maWxlVXNlckRhdGFQcm92aWRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lLCBpc0VxdWFsLCBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBSZWFkYWJsZVN0cmVhbUV2ZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmVhbS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IEFic3RyYWN0TmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBGaWxlQ2hhbmdlVHlwZSwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLCBGaWxlVHlwZSwgSUZpbGVDaGFuZ2UsIElGaWxlT3Blbk9wdGlvbnMsIElGaWxlUmVhZFN0cmVhbU9wdGlvbnMsIElGaWxlU2VydmljZSwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFN0cmVhbUNhcGFiaWxpdHksIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZVJlYWRXcml0ZUNhcGFiaWxpdHksIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eSwgSVN0YXQgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IFVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRmlsZVVzZXJEYXRhUHJvdmlkZXIgfSBmcm9tICcuLi8uLi9jb21tb24vZmlsZVVzZXJEYXRhUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCBVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcblxuY29uc3QgUk9PVCA9IFVSSS5maWxlKCd0ZXN0cycpLndpdGgoeyBzY2hlbWU6ICd2c2NvZGUtdGVzdHMnIH0pO1xuXG5jbGFzcyBUZXN0RW52aXJvbm1lbnRTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3ROYXRpdmVFbnZpcm9ubWVudFNlcnZpY2Uge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9hcHBTZXR0aW5nc0hvbWU6IFVSSSkge1xuXHRcdHN1cGVyKE9iamVjdC5jcmVhdGUobnVsbCksIE9iamVjdC5jcmVhdGUobnVsbCksIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCAuLi5wcm9kdWN0IH0pO1xuXHR9XG5cdG92ZXJyaWRlIGdldCB1c2VyUm9hbWluZ0RhdGFIb21lKCkgeyByZXR1cm4gdGhpcy5fYXBwU2V0dGluZ3NIb21lLndpdGgoeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlVXNlckRhdGEgfSk7IH1cblx0b3ZlcnJpZGUgZ2V0IGNhY2hlSG9tZSgpIHsgcmV0dXJuIHRoaXMudXNlclJvYW1pbmdEYXRhSG9tZTsgfVxufVxuXG5zdWl0ZSgnRmlsZVVzZXJEYXRhUHJvdmlkZXInLCAoKSA9PiB7XG5cblx0bGV0IHRlc3RPYmplY3Q6IElGaWxlU2VydmljZTtcblx0bGV0IHVzZXJEYXRhSG9tZU9uRGlzazogVVJJO1xuXHRsZXQgYmFja3VwV29ya3NwYWNlSG9tZU9uRGlzazogVVJJO1xuXHRsZXQgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlO1xuXHRsZXQgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZTtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0bGV0IGZpbGVVc2VyRGF0YVByb3ZpZGVyOiBGaWxlVXNlckRhdGFQcm92aWRlcjtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBmaWxlU3lzdGVtUHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0ZXN0T2JqZWN0LnJlZ2lzdGVyUHJvdmlkZXIoUk9PVC5zY2hlbWUsIGZpbGVTeXN0ZW1Qcm92aWRlcikpO1xuXG5cdFx0dXNlckRhdGFIb21lT25EaXNrID0gam9pblBhdGgoUk9PVCwgJ1VzZXInKTtcblx0XHRjb25zdCBiYWNrdXBIb21lID0gam9pblBhdGgoUk9PVCwgJ0JhY2t1cHMnKTtcblx0XHRiYWNrdXBXb3Jrc3BhY2VIb21lT25EaXNrID0gam9pblBhdGgoYmFja3VwSG9tZSwgJ3dvcmtzcGFjZUlkJyk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5jcmVhdGVGb2xkZXIodXNlckRhdGFIb21lT25EaXNrKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmNyZWF0ZUZvbGRlcihiYWNrdXBXb3Jrc3BhY2VIb21lT25EaXNrKTtcblxuXHRcdGVudmlyb25tZW50U2VydmljZSA9IG5ldyBUZXN0RW52aXJvbm1lbnRTZXJ2aWNlKHVzZXJEYXRhSG9tZU9uRGlzayk7XG5cdFx0Y29uc3QgdXJpSWRlbnRpdHlTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBVcmlJZGVudGl0eVNlcnZpY2UodGVzdE9iamVjdCkpO1xuXHRcdHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBVc2VyRGF0YVByb2ZpbGVzU2VydmljZShlbnZpcm9ubWVudFNlcnZpY2UsIHRlc3RPYmplY3QsIHVyaUlkZW50aXR5U2VydmljZSwgbG9nU2VydmljZSkpO1xuXG5cdFx0ZmlsZVVzZXJEYXRhUHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVVc2VyRGF0YVByb3ZpZGVyKFJPT1Quc2NoZW1lLCBmaWxlU3lzdGVtUHJvdmlkZXIsIFNjaGVtYXMudnNjb2RlVXNlckRhdGEsIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVVzZXJEYXRhUHJvdmlkZXIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0ZXN0T2JqZWN0LnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy52c2NvZGVVc2VyRGF0YSwgZmlsZVVzZXJEYXRhUHJvdmlkZXIpKTtcblx0fSk7XG5cblx0dGVzdCgnZXhpc3RzIHJldHVybiBmYWxzZSB3aGVuIGZpbGUgZG9lcyBub3QgZXhpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXhpc3RzID0gYXdhaXQgdGVzdE9iamVjdC5leGlzdHModXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0cywgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkIGZpbGUgdGhyb3dzIGVycm9yIGlmIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5yZWFkRmlsZSh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlKTtcblx0XHRcdGFzc2VydC5mYWlsKCdTaG91bGQgZmFpbCBzaW5jZSBmaWxlIGRvZXMgbm90IGV4aXN0Jyk7XG5cdFx0fSBjYXRjaCAoZSkgeyB9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWQgZXhpc3RpbmcgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndyaXRlRmlsZShqb2luUGF0aCh1c2VyRGF0YUhvbWVPbkRpc2ssICdzZXR0aW5ncy5qc29uJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3t9JykpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlc3RPYmplY3QucmVhZEZpbGUodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC52YWx1ZS50b1N0cmluZygpLCAne30nKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlO1xuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCB0ZXN0T2JqZWN0LmNyZWF0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3t9JykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLnJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCB0ZXN0T2JqZWN0LnJlYWRGaWxlKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NldHRpbmdzLmpzb24nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIudmFsdWUudG9TdHJpbmcoKSwgJ3t9Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlIGZpbGUgY3JlYXRlcyB0aGUgZmlsZSBpZiBub3QgZXhpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlO1xuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCB0ZXN0T2JqZWN0LndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygne30nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEucmVzb3VyY2UudG9TdHJpbmcoKSwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgYWN0dWFsMiA9IGF3YWl0IHRlc3RPYmplY3QucmVhZEZpbGUoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc2V0dGluZ3MuanNvbicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi52YWx1ZS50b1N0cmluZygpLCAne30nKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGUgdG8gZXhpc3RpbmcgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2U7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53cml0ZUZpbGUoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc2V0dGluZ3MuanNvbicpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7fScpKTtcblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgdGVzdE9iamVjdC53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3thOjF9JykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLnJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IGFjdHVhbDIgPSBhd2FpdCB0ZXN0T2JqZWN0LnJlYWRGaWxlKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NldHRpbmdzLmpzb24nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIudmFsdWUudG9TdHJpbmcoKSwgJ3thOjF9Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud3JpdGVGaWxlKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NldHRpbmdzLmpzb24nKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnJykpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuZGVsKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlc3RPYmplY3QuZXhpc3RzKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NldHRpbmdzLmpzb24nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhbHNlLCByZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53cml0ZUZpbGUoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc2V0dGluZ3MuanNvbicpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVzdE9iamVjdC5yZXNvbHZlKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayghcmVzdWx0LmlzRGlyZWN0b3J5KTtcblx0XHRhc3NlcnQub2socmVzdWx0LmNoaWxkcmVuID09PSB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdleGlzdHMgcmV0dXJuIGZhbHNlIGZvciBmb2xkZXIgdGhhdCBkb2VzIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleGlzdHMgPSBhd2FpdCB0ZXN0T2JqZWN0LmV4aXN0cyh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zbmlwcGV0c0hvbWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHMsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZXhpc3RzIHJldHVybiB0cnVlIGZvciBmb2xkZXIgdGhhdCBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5jcmVhdGVGb2xkZXIoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc25pcHBldHMnKSk7XG5cdFx0Y29uc3QgZXhpc3RzID0gYXdhaXQgdGVzdE9iamVjdC5leGlzdHModXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc25pcHBldHNIb21lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZCBmaWxlIHRocm93cyBlcnJvciBmb3IgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuY3JlYXRlRm9sZGVyKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NuaXBwZXRzJykpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LnJlYWRGaWxlKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNuaXBwZXRzSG9tZSk7XG5cdFx0XHRhc3NlcnQuZmFpbCgnU2hvdWxkIGZhaWwgc2luY2UgcmVhZCBmaWxlIGlzIG5vdCBzdXBwb3J0ZWQgZm9yIGZvbGRlcnMnKTtcblx0XHR9IGNhdGNoIChlKSB7IH1cblx0fSk7XG5cblx0dGVzdCgncmVhZCBmaWxlIHVuZGVyIGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmNyZWF0ZUZvbGRlcihqb2luUGF0aCh1c2VyRGF0YUhvbWVPbkRpc2ssICdzbmlwcGV0cycpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndyaXRlRmlsZShqb2luUGF0aCh1c2VyRGF0YUhvbWVPbkRpc2ssICdzbmlwcGV0cycsICdzZXR0aW5ncy5qc29uJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3t9JykpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gam9pblBhdGgodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc25pcHBldHNIb21lLCAnc2V0dGluZ3MuanNvbicpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHRlc3RPYmplY3QucmVhZEZpbGUocmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVzb3VyY2UudG9TdHJpbmcoKSwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC52YWx1ZS50b1N0cmluZygpLCAne30nKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZCBmaWxlIHVuZGVyIHN1YiBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5jcmVhdGVGb2xkZXIoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc25pcHBldHMnLCAnamF2YScpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndyaXRlRmlsZShqb2luUGF0aCh1c2VyRGF0YUhvbWVPbkRpc2ssICdzbmlwcGV0cycsICdqYXZhJywgJ3NldHRpbmdzLmpzb24nKSwgVlNCdWZmZXIuZnJvbVN0cmluZygne30nKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBqb2luUGF0aCh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zbmlwcGV0c0hvbWUsICdqYXZhL3NldHRpbmdzLmpzb24nKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCB0ZXN0T2JqZWN0LnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwudmFsdWUudG9TdHJpbmcoKSwgJ3t9Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZSBmaWxlIHVuZGVyIGZvbGRlciB0aGF0IGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmNyZWF0ZUZvbGRlcihqb2luUGF0aCh1c2VyRGF0YUhvbWVPbkRpc2ssICdzbmlwcGV0cycpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IGpvaW5QYXRoKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNuaXBwZXRzSG9tZSwgJ3NldHRpbmdzLmpzb24nKTtcblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgdGVzdE9iamVjdC5jcmVhdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7fScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5yZXNvdXJjZS50b1N0cmluZygpLCByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgdGVzdE9iamVjdC5yZWFkRmlsZShqb2luUGF0aCh1c2VyRGF0YUhvbWVPbkRpc2ssICdzbmlwcGV0cycsICdzZXR0aW5ncy5qc29uJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLnZhbHVlLnRvU3RyaW5nKCksICd7fScpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGUgZmlsZSB1bmRlciBmb2xkZXIgdGhhdCBkb2VzIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IGpvaW5QYXRoKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNuaXBwZXRzSG9tZSwgJ3NldHRpbmdzLmpzb24nKTtcblx0XHRjb25zdCBhY3R1YWwxID0gYXdhaXQgdGVzdE9iamVjdC5jcmVhdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7fScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5yZXNvdXJjZS50b1N0cmluZygpLCByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRjb25zdCBhY3R1YWwyID0gYXdhaXQgdGVzdE9iamVjdC5yZWFkRmlsZShqb2luUGF0aCh1c2VyRGF0YUhvbWVPbkRpc2ssICdzbmlwcGV0cycsICdzZXR0aW5ncy5qc29uJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLnZhbHVlLnRvU3RyaW5nKCksICd7fScpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZSB0byBub3QgZXhpc3RpbmcgZmlsZSB1bmRlciBjb250YWluZXIgdGhhdCBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5jcmVhdGVGb2xkZXIoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc25pcHBldHMnKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBqb2luUGF0aCh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zbmlwcGV0c0hvbWUsICdzZXR0aW5ncy5qc29uJyk7XG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHRlc3RPYmplY3Qud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7fScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5yZXNvdXJjZS50b1N0cmluZygpLCByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCB0ZXN0T2JqZWN0LnJlYWRGaWxlKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NuaXBwZXRzJywgJ3NldHRpbmdzLmpzb24nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC52YWx1ZS50b1N0cmluZygpLCAne30nKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGUgdG8gbm90IGV4aXN0aW5nIGZpbGUgdW5kZXIgY29udGFpbmVyIHRoYXQgZG9lcyBub3QgZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gam9pblBhdGgodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc25pcHBldHNIb21lLCAnc2V0dGluZ3MuanNvbicpO1xuXHRcdGNvbnN0IGFjdHVhbDEgPSBhd2FpdCB0ZXN0T2JqZWN0LndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygne30nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEucmVzb3VyY2UudG9TdHJpbmcoKSwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgdGVzdE9iamVjdC5yZWFkRmlsZShqb2luUGF0aCh1c2VyRGF0YUhvbWVPbkRpc2ssICdzbmlwcGV0cycsICdzZXR0aW5ncy5qc29uJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwudmFsdWUudG9TdHJpbmcoKSwgJ3t9Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlIHRvIGV4aXN0aW5nIGZpbGUgdW5kZXIgY29udGFpbmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuY3JlYXRlRm9sZGVyKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NuaXBwZXRzJykpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud3JpdGVGaWxlKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NuaXBwZXRzJywgJ3NldHRpbmdzLmpzb24nKSwgVlNCdWZmZXIuZnJvbVN0cmluZygne30nKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBqb2luUGF0aCh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zbmlwcGV0c0hvbWUsICdzZXR0aW5ncy5qc29uJyk7XG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHRlc3RPYmplY3Qud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7YToxfScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5yZXNvdXJjZS50b1N0cmluZygpLCByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCB0ZXN0T2JqZWN0LnJlYWRGaWxlKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NuaXBwZXRzJywgJ3NldHRpbmdzLmpzb24nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC52YWx1ZS50b1N0cmluZygpLCAne2E6MX0nKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGUgZmlsZSB1bmRlciBzdWIgY29udGFpbmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gam9pblBhdGgodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc25pcHBldHNIb21lLCAnamF2YS9zZXR0aW5ncy5qc29uJyk7XG5cdFx0Y29uc3QgYWN0dWFsMSA9IGF3YWl0IHRlc3RPYmplY3Qud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7fScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5yZXNvdXJjZS50b1N0cmluZygpLCByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCB0ZXN0T2JqZWN0LnJlYWRGaWxlKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NuaXBwZXRzJywgJ2phdmEnLCAnc2V0dGluZ3MuanNvbicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnZhbHVlLnRvU3RyaW5nKCksICd7fScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUgdGhyb3dzIGVycm9yIGZvciBmb2xkZXIgdGhhdCBkb2VzIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC5kZWwodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc25pcHBldHNIb21lKTtcblx0XHRcdGFzc2VydC5mYWlsKCdTaG91bGQgZmFpbCB0aGUgZm9sZGVyIGRvZXMgbm90IGV4aXN0Jyk7XG5cdFx0fSBjYXRjaCAoZSkgeyB9XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSBub3QgZXhpc3RpbmcgZmlsZSB1bmRlciBjb250YWluZXIgdGhhdCBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5jcmVhdGVGb2xkZXIoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc25pcHBldHMnKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3QuZGVsKGpvaW5QYXRoKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNuaXBwZXRzSG9tZSwgJ3NldHRpbmdzLmpzb24nKSk7XG5cdFx0XHRhc3NlcnQuZmFpbCgnU2hvdWxkIGZhaWwgc2luY2UgZmlsZSBkb2VzIG5vdCBleGlzdCcpO1xuXHRcdH0gY2F0Y2ggKGUpIHsgfVxuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUgbm90IGV4aXN0aW5nIGZpbGUgdW5kZXIgY29udGFpbmVyIHRoYXQgZG9lcyBub3QgZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0ZXN0T2JqZWN0LmRlbChqb2luUGF0aCh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zbmlwcGV0c0hvbWUsICdzZXR0aW5ncy5qc29uJykpO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ1Nob3VsZCBmYWlsIHNpbmNlIGZpbGUgZG9lcyBub3QgZXhpc3QnKTtcblx0XHR9IGNhdGNoIChlKSB7IH1cblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIGV4aXN0aW5nIGZpbGUgdW5kZXIgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuY3JlYXRlRm9sZGVyKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NuaXBwZXRzJykpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud3JpdGVGaWxlKGpvaW5QYXRoKHVzZXJEYXRhSG9tZU9uRGlzaywgJ3NuaXBwZXRzJywgJ3NldHRpbmdzLmpzb24nKSwgVlNCdWZmZXIuZnJvbVN0cmluZygne30nKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5kZWwoam9pblBhdGgodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc25pcHBldHNIb21lLCAnc2V0dGluZ3MuanNvbicpKTtcblx0XHRjb25zdCBleGlzdHMgPSBhd2FpdCB0ZXN0T2JqZWN0LmV4aXN0cyhqb2luUGF0aCh1c2VyRGF0YUhvbWVPbkRpc2ssICdzbmlwcGV0cycsICdzZXR0aW5ncy5qc29uJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHMsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5jcmVhdGVGb2xkZXIoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc25pcHBldHMnKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53cml0ZUZpbGUoam9pblBhdGgodXNlckRhdGFIb21lT25EaXNrLCAnc25pcHBldHMnLCAnc2V0dGluZ3MuanNvbicpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7fScpKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXN0T2JqZWN0LnJlc29sdmUodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc25pcHBldHNIb21lKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmlzRGlyZWN0b3J5KTtcblx0XHRhc3NlcnQub2socmVzdWx0LmNoaWxkcmVuICE9PSB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY2hpbGRyZW4ubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNoaWxkcmVuWzBdLnJlc291cmNlLnRvU3RyaW5nKCksIGpvaW5QYXRoKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNuaXBwZXRzSG9tZSwgJ3NldHRpbmdzLmpzb24nKS50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZCBiYWNrdXAgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndyaXRlRmlsZShqb2luUGF0aChiYWNrdXBXb3Jrc3BhY2VIb21lT25EaXNrLCAnYmFja3VwLmpzb24nKSwgVlNCdWZmZXIuZnJvbVN0cmluZygne30nKSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVzdE9iamVjdC5yZWFkRmlsZShqb2luUGF0aChiYWNrdXBXb3Jrc3BhY2VIb21lT25EaXNrLndpdGgoeyBzY2hlbWU6IGVudmlyb25tZW50U2VydmljZS51c2VyUm9hbWluZ0RhdGFIb21lLnNjaGVtZSB9KSwgYGJhY2t1cC5qc29uYCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudmFsdWUudG9TdHJpbmcoKSwgJ3t9Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZSBiYWNrdXAgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmNyZWF0ZUZpbGUoam9pblBhdGgoYmFja3VwV29ya3NwYWNlSG9tZU9uRGlzay53aXRoKHsgc2NoZW1lOiBlbnZpcm9ubWVudFNlcnZpY2UudXNlclJvYW1pbmdEYXRhSG9tZS5zY2hlbWUgfSksIGBiYWNrdXAuanNvbmApLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7fScpKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXN0T2JqZWN0LnJlYWRGaWxlKGpvaW5QYXRoKGJhY2t1cFdvcmtzcGFjZUhvbWVPbkRpc2ssICdiYWNrdXAuanNvbicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnZhbHVlLnRvU3RyaW5nKCksICd7fScpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZSBiYWNrdXAgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndyaXRlRmlsZShqb2luUGF0aChiYWNrdXBXb3Jrc3BhY2VIb21lT25EaXNrLCAnYmFja3VwLmpzb24nKSwgVlNCdWZmZXIuZnJvbVN0cmluZygne30nKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53cml0ZUZpbGUoam9pblBhdGgoYmFja3VwV29ya3NwYWNlSG9tZU9uRGlzay53aXRoKHsgc2NoZW1lOiBlbnZpcm9ubWVudFNlcnZpY2UudXNlclJvYW1pbmdEYXRhSG9tZS5zY2hlbWUgfSksIGBiYWNrdXAuanNvbmApLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7YToxfScpKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXN0T2JqZWN0LnJlYWRGaWxlKGpvaW5QYXRoKGJhY2t1cFdvcmtzcGFjZUhvbWVPbkRpc2ssICdiYWNrdXAuanNvbicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnZhbHVlLnRvU3RyaW5nKCksICd7YToxfScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIGJhY2t1cHMgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud3JpdGVGaWxlKGpvaW5QYXRoKGJhY2t1cFdvcmtzcGFjZUhvbWVPbkRpc2ssICdiYWNrdXAuanNvbicpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7fScpKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXN0T2JqZWN0LnJlc29sdmUoYmFja3VwV29ya3NwYWNlSG9tZU9uRGlzay53aXRoKHsgc2NoZW1lOiBlbnZpcm9ubWVudFNlcnZpY2UudXNlclJvYW1pbmdEYXRhSG9tZS5zY2hlbWUgfSkpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaXNEaXJlY3RvcnkpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuY2hpbGRyZW4gIT09IHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jaGlsZHJlbi5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY2hpbGRyZW5bMF0ucmVzb3VyY2UudG9TdHJpbmcoKSwgam9pblBhdGgoYmFja3VwV29ya3NwYWNlSG9tZU9uRGlzay53aXRoKHsgc2NoZW1lOiBlbnZpcm9ubWVudFNlcnZpY2UudXNlclJvYW1pbmdEYXRhSG9tZS5zY2hlbWUgfSksIGBiYWNrdXAuanNvbmApLnRvU3RyaW5nKCkpO1xuXHR9KTtcbn0pO1xuXG5jbGFzcyBUZXN0RmlsZVN5c3RlbVByb3ZpZGVyIGltcGxlbWVudHMgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlUmVhZFdyaXRlQ2FwYWJpbGl0eSwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5LCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVSZWFkU3RyZWFtQ2FwYWJpbGl0eSB7XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgb25EaWRDaGFuZ2VGaWxlOiBFdmVudDxyZWFkb25seSBJRmlsZUNoYW5nZVtdPikgeyB9XG5cblxuXHRyZWFkb25seSBjYXBhYmlsaXRpZXM6IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyA9IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzOiBFdmVudDx2b2lkPiA9IEV2ZW50Lk5vbmU7XG5cblx0d2F0Y2goKTogSURpc3Bvc2FibGUgeyByZXR1cm4gRGlzcG9zYWJsZS5Ob25lOyB9XG5cblx0c3RhdCgpOiBQcm9taXNlPElTdGF0PiB7IHRocm93IG5ldyBFcnJvcignTm90IFN1cHBvcnRlZCcpOyB9XG5cblx0bWtkaXIocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBTdXBwb3J0ZWQnKTsgfVxuXG5cdHJlbmFtZSgpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgU3VwcG9ydGVkJyk7IH1cblxuXHRyZWFkRmlsZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxVaW50OEFycmF5PiB7IHRocm93IG5ldyBFcnJvcignTm90IFN1cHBvcnRlZCcpOyB9XG5cblx0cmVhZGRpcihyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxbc3RyaW5nLCBGaWxlVHlwZV1bXT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBTdXBwb3J0ZWQnKTsgfVxuXG5cdHdyaXRlRmlsZSgpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgU3VwcG9ydGVkJyk7IH1cblxuXHRkZWxldGUoKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignTm90IFN1cHBvcnRlZCcpOyB9XG5cdG9wZW4ocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVPcGVuT3B0aW9ucyk6IFByb21pc2U8bnVtYmVyPiB7IHRocm93IG5ldyBFcnJvcignTm90IFN1cHBvcnRlZCcpOyB9XG5cdGNsb3NlKGZkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgU3VwcG9ydGVkJyk7IH1cblx0cmVhZChmZDogbnVtYmVyLCBwb3M6IG51bWJlciwgZGF0YTogVWludDhBcnJheSwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKTogUHJvbWlzZTxudW1iZXI+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgU3VwcG9ydGVkJyk7IH1cblx0d3JpdGUoZmQ6IG51bWJlciwgcG9zOiBudW1iZXIsIGRhdGE6IFVpbnQ4QXJyYXksIG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcik6IFByb21pc2U8bnVtYmVyPiB7IHRocm93IG5ldyBFcnJvcignTm90IFN1cHBvcnRlZCcpOyB9XG5cblx0cmVhZEZpbGVTdHJlYW0ocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVSZWFkU3RyZWFtT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUmVhZGFibGVTdHJlYW1FdmVudHM8VWludDhBcnJheT4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cbn1cblxuc3VpdGUoJ0ZpbGVVc2VyRGF0YVByb3ZpZGVyIC0gV2F0Y2hpbmcnLCAoKSA9PiB7XG5cblx0bGV0IHRlc3RPYmplY3Q6IEZpbGVVc2VyRGF0YVByb3ZpZGVyO1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRjb25zdCByb290RmlsZVJlc291cmNlID0gam9pblBhdGgoUk9PVCwgJ1VzZXInKTtcblx0Y29uc3Qgcm9vdFVzZXJEYXRhUmVzb3VyY2UgPSByb290RmlsZVJlc291cmNlLndpdGgoeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlVXNlckRhdGEgfSk7XG5cblx0bGV0IGZpbGVFdmVudEVtaXR0ZXI6IEVtaXR0ZXI8cmVhZG9ubHkgSUZpbGVDaGFuZ2VbXT47XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IG5ldyBUZXN0RW52aXJvbm1lbnRTZXJ2aWNlKHJvb3RGaWxlUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHVyaUlkZW50aXR5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVXJpSWRlbnRpdHlTZXJ2aWNlKGZpbGVTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKGVudmlyb25tZW50U2VydmljZSwgZmlsZVNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgbG9nU2VydmljZSkpO1xuXG5cdFx0ZmlsZUV2ZW50RW1pdHRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxyZWFkb25seSBJRmlsZUNoYW5nZVtdPigpKTtcblx0XHR0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlVXNlckRhdGFQcm92aWRlcihyb290RmlsZVJlc291cmNlLnNjaGVtZSwgbmV3IFRlc3RGaWxlU3lzdGVtUHJvdmlkZXIoZmlsZUV2ZW50RW1pdHRlci5ldmVudCksIFNjaGVtYXMudnNjb2RlVXNlckRhdGEsIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbGUgYWRkZWQgY2hhbmdlIGV2ZW50JywgZG9uZSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRlc3RPYmplY3Qud2F0Y2gocm9vdFVzZXJEYXRhUmVzb3VyY2UsIHsgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH0pKTtcblx0XHRjb25zdCBleHBlY3RlZCA9IGpvaW5QYXRoKHJvb3RVc2VyRGF0YVJlc291cmNlLCAnc2V0dGluZ3MuanNvbicpO1xuXHRcdGNvbnN0IHRhcmdldCA9IGpvaW5QYXRoKHJvb3RGaWxlUmVzb3VyY2UsICdzZXR0aW5ncy5qc29uJyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VGaWxlKGUgPT4ge1xuXHRcdFx0aWYgKGlzRXF1YWwoZVswXS5yZXNvdXJjZSwgZXhwZWN0ZWQpICYmIGVbMF0udHlwZSA9PT0gRmlsZUNoYW5nZVR5cGUuQURERUQpIHtcblx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRmaWxlRXZlbnRFbWl0dGVyLmZpcmUoW3tcblx0XHRcdHJlc291cmNlOiB0YXJnZXQsXG5cdFx0XHR0eXBlOiBGaWxlQ2hhbmdlVHlwZS5BRERFRFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsZSB1cGRhdGVkIGNoYW5nZSBldmVudCcsIGRvbmUgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0ZXN0T2JqZWN0LndhdGNoKHJvb3RVc2VyRGF0YVJlc291cmNlLCB7IGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSB9KSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBqb2luUGF0aChyb290VXNlckRhdGFSZXNvdXJjZSwgJ3NldHRpbmdzLmpzb24nKTtcblx0XHRjb25zdCB0YXJnZXQgPSBqb2luUGF0aChyb290RmlsZVJlc291cmNlLCAnc2V0dGluZ3MuanNvbicpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlRmlsZShlID0+IHtcblx0XHRcdGlmIChpc0VxdWFsKGVbMF0ucmVzb3VyY2UsIGV4cGVjdGVkKSAmJiBlWzBdLnR5cGUgPT09IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpIHtcblx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRmaWxlRXZlbnRFbWl0dGVyLmZpcmUoW3tcblx0XHRcdHJlc291cmNlOiB0YXJnZXQsXG5cdFx0XHR0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxlIGRlbGV0ZWQgY2hhbmdlIGV2ZW50JywgZG9uZSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRlc3RPYmplY3Qud2F0Y2gocm9vdFVzZXJEYXRhUmVzb3VyY2UsIHsgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH0pKTtcblx0XHRjb25zdCBleHBlY3RlZCA9IGpvaW5QYXRoKHJvb3RVc2VyRGF0YVJlc291cmNlLCAnc2V0dGluZ3MuanNvbicpO1xuXHRcdGNvbnN0IHRhcmdldCA9IGpvaW5QYXRoKHJvb3RGaWxlUmVzb3VyY2UsICdzZXR0aW5ncy5qc29uJyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VGaWxlKGUgPT4ge1xuXHRcdFx0aWYgKGlzRXF1YWwoZVswXS5yZXNvdXJjZSwgZXhwZWN0ZWQpICYmIGVbMF0udHlwZSA9PT0gRmlsZUNoYW5nZVR5cGUuREVMRVRFRCkge1xuXHRcdFx0XHRkb25lKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGZpbGVFdmVudEVtaXR0ZXIuZmlyZShbe1xuXHRcdFx0cmVzb3VyY2U6IHRhcmdldCxcblx0XHRcdHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkRFTEVURURcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbGUgdW5kZXIgZm9sZGVyIGNyZWF0ZWQgY2hhbmdlIGV2ZW50JywgZG9uZSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRlc3RPYmplY3Qud2F0Y2gocm9vdFVzZXJEYXRhUmVzb3VyY2UsIHsgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH0pKTtcblx0XHRjb25zdCBleHBlY3RlZCA9IGpvaW5QYXRoKHJvb3RVc2VyRGF0YVJlc291cmNlLCAnc25pcHBldHMnLCAnc2V0dGluZ3MuanNvbicpO1xuXHRcdGNvbnN0IHRhcmdldCA9IGpvaW5QYXRoKHJvb3RGaWxlUmVzb3VyY2UsICdzbmlwcGV0cycsICdzZXR0aW5ncy5qc29uJyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VGaWxlKGUgPT4ge1xuXHRcdFx0aWYgKGlzRXF1YWwoZVswXS5yZXNvdXJjZSwgZXhwZWN0ZWQpICYmIGVbMF0udHlwZSA9PT0gRmlsZUNoYW5nZVR5cGUuQURERUQpIHtcblx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRmaWxlRXZlbnRFbWl0dGVyLmZpcmUoW3tcblx0XHRcdHJlc291cmNlOiB0YXJnZXQsXG5cdFx0XHR0eXBlOiBGaWxlQ2hhbmdlVHlwZS5BRERFRFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsZSB1bmRlciBmb2xkZXIgdXBkYXRlZCBjaGFuZ2UgZXZlbnQnLCBkb25lID0+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGVzdE9iamVjdC53YXRjaChyb290VXNlckRhdGFSZXNvdXJjZSwgeyBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfSkpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gam9pblBhdGgocm9vdFVzZXJEYXRhUmVzb3VyY2UsICdzbmlwcGV0cycsICdzZXR0aW5ncy5qc29uJyk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gam9pblBhdGgocm9vdEZpbGVSZXNvdXJjZSwgJ3NuaXBwZXRzJywgJ3NldHRpbmdzLmpzb24nKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGVzdE9iamVjdC5vbkRpZENoYW5nZUZpbGUoZSA9PiB7XG5cdFx0XHRpZiAoaXNFcXVhbChlWzBdLnJlc291cmNlLCBleHBlY3RlZCkgJiYgZVswXS50eXBlID09PSBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKSB7XG5cdFx0XHRcdGRvbmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZmlsZUV2ZW50RW1pdHRlci5maXJlKFt7XG5cdFx0XHRyZXNvdXJjZTogdGFyZ2V0LFxuXHRcdFx0dHlwZTogRmlsZUNoYW5nZVR5cGUuVVBEQVRFRFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsZSB1bmRlciBmb2xkZXIgZGVsZXRlZCBjaGFuZ2UgZXZlbnQnLCBkb25lID0+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGVzdE9iamVjdC53YXRjaChyb290VXNlckRhdGFSZXNvdXJjZSwgeyBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfSkpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gam9pblBhdGgocm9vdFVzZXJEYXRhUmVzb3VyY2UsICdzbmlwcGV0cycsICdzZXR0aW5ncy5qc29uJyk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gam9pblBhdGgocm9vdEZpbGVSZXNvdXJjZSwgJ3NuaXBwZXRzJywgJ3NldHRpbmdzLmpzb24nKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGVzdE9iamVjdC5vbkRpZENoYW5nZUZpbGUoZSA9PiB7XG5cdFx0XHRpZiAoaXNFcXVhbChlWzBdLnJlc291cmNlLCBleHBlY3RlZCkgJiYgZVswXS50eXBlID09PSBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSB7XG5cdFx0XHRcdGRvbmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZmlsZUV2ZW50RW1pdHRlci5maXJlKFt7XG5cdFx0XHRyZXNvdXJjZTogdGFyZ2V0LFxuXHRcdFx0dHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgaXMgbm90IHRyaWdnZXJlZCBpZiBub3Qgd2F0Y2hlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0YXJnZXQgPSBqb2luUGF0aChyb290RmlsZVJlc291cmNlLCAnc2V0dGluZ3MuanNvbicpO1xuXHRcdGxldCB0cmlnZ2VyZWQgPSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGVzdE9iamVjdC5vbkRpZENoYW5nZUZpbGUoKCkgPT4gdHJpZ2dlcmVkID0gdHJ1ZSkpO1xuXHRcdGZpbGVFdmVudEVtaXR0ZXIuZmlyZShbe1xuXHRcdFx0cmVzb3VyY2U6IHRhcmdldCxcblx0XHRcdHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkRFTEVURURcblx0XHR9XSk7XG5cdFx0aWYgKHRyaWdnZXJlZCkge1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ2V2ZW50IHNob3VsZCBub3QgYmUgdHJpZ2dlcmVkJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdldmVudCBpcyBub3QgdHJpZ2dlcmVkIGlmIG5vdCB3YXRjaGVkIDInLCBhc3luYyAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRlc3RPYmplY3Qud2F0Y2gocm9vdFVzZXJEYXRhUmVzb3VyY2UsIHsgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH0pKTtcblx0XHRjb25zdCB0YXJnZXQgPSBqb2luUGF0aChkaXJuYW1lKHJvb3RGaWxlUmVzb3VyY2UpLCAnc2V0dGluZ3MuanNvbicpO1xuXHRcdGxldCB0cmlnZ2VyZWQgPSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGVzdE9iamVjdC5vbkRpZENoYW5nZUZpbGUoKCkgPT4gdHJpZ2dlcmVkID0gdHJ1ZSkpO1xuXHRcdGZpbGVFdmVudEVtaXR0ZXIuZmlyZShbe1xuXHRcdFx0cmVzb3VyY2U6IHRhcmdldCxcblx0XHRcdHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkRFTEVURURcblx0XHR9XSk7XG5cdFx0aWYgKHRyaWdnZXJlZCkge1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ2V2ZW50IHNob3VsZCBub3QgYmUgdHJpZ2dlcmVkJyk7XG5cdFx0fVxuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxrQkFBK0I7QUFDeEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxTQUFTLGdCQUFnQjtBQUUzQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQkFBZ0Isc0NBQWtSO0FBQzNTLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsc0JBQXNC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
