import assert from "assert";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync, promises } from "fs";
import { tmpdir } from "os";
import { timeout } from "../../../../base/common/async.js";
import { bufferToReadable, bufferToStream, streamToBuffer, streamToBufferReadableStream, VSBuffer } from "../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { FileAccess, Schemas } from "../../../../base/common/network.js";
import { basename, dirname, join, posix } from "../../../../base/common/path.js";
import { isLinux, isWindows } from "../../../../base/common/platform.js";
import { joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { Promises } from "../../../../base/node/pfs.js";
import { flakySuite, getRandomTestPath } from "../../../../base/test/node/testUtils.js";
import { etag, FileOperation, FileOperationError, FileOperationResult, FilePermission, FileSystemProviderCapabilities, hasFileAtomicReadCapability, hasOpenReadWriteCloseCapability, NotModifiedSinceFileOperationError, TooLargeFileOperationError } from "../../common/files.js";
import { FileService } from "../../common/fileService.js";
import { DiskFileSystemProvider } from "../../node/diskFileSystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
function getByName(root, name) {
  if (root.children === void 0) {
    return void 0;
  }
  return root.children.find((child) => child.name === name);
}
function toLineByLineReadable(content) {
  let chunks = content.split("\n");
  chunks = chunks.map((chunk, index) => {
    if (index === 0) {
      return chunk;
    }
    return "\n" + chunk;
  });
  return {
    read() {
      const chunk = chunks.shift();
      if (typeof chunk === "string") {
        return VSBuffer.fromString(chunk);
      }
      return null;
    }
  };
}
class TestDiskFileSystemProvider extends DiskFileSystemProvider {
  constructor() {
    super(...arguments);
    this.totalBytesRead = 0;
    this.invalidStatSize = false;
    this.smallStatSize = false;
    this.readonly = false;
  }
  get capabilities() {
    if (!this._testCapabilities) {
      this._testCapabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileReadStream | FileSystemProviderCapabilities.Trash | FileSystemProviderCapabilities.FileFolderCopy | FileSystemProviderCapabilities.FileWriteUnlock | FileSystemProviderCapabilities.FileAtomicRead | FileSystemProviderCapabilities.FileAtomicWrite | FileSystemProviderCapabilities.FileAtomicDelete | FileSystemProviderCapabilities.FileClone | FileSystemProviderCapabilities.FileAppend | FileSystemProviderCapabilities.FileRealpath;
      if (isLinux) {
        this._testCapabilities |= FileSystemProviderCapabilities.PathCaseSensitive;
      }
    }
    return this._testCapabilities;
  }
  set capabilities(capabilities) {
    this._testCapabilities = capabilities;
  }
  setInvalidStatSize(enabled) {
    this.invalidStatSize = enabled;
  }
  setSmallStatSize(enabled) {
    this.smallStatSize = enabled;
  }
  setReadonly(readonly) {
    this.readonly = readonly;
  }
  async stat(resource) {
    const res = await super.stat(resource);
    if (this.invalidStatSize) {
      res.size = String(res.size);
    } else if (this.smallStatSize) {
      res.size = 1;
    } else if (this.readonly) {
      res.permissions = FilePermission.Readonly;
    }
    return res;
  }
  async read(fd, pos, data, offset, length) {
    const bytesRead = await super.read(fd, pos, data, offset, length);
    this.totalBytesRead += bytesRead;
    return bytesRead;
  }
  async readFile(resource, options) {
    const res = await super.readFile(resource, options);
    this.totalBytesRead += res.byteLength;
    return res;
  }
}
DiskFileSystemProvider.configureFlushOnWrite(false);
flakySuite("Disk File Service", function() {
  const testSchema = "test";
  let service;
  let fileProvider;
  let testProvider;
  let testDir;
  const disposables = new DisposableStore();
  setup(async () => {
    const logService = new NullLogService();
    service = disposables.add(new FileService(logService));
    fileProvider = disposables.add(new TestDiskFileSystemProvider(logService));
    disposables.add(service.registerProvider(Schemas.file, fileProvider));
    testProvider = disposables.add(new TestDiskFileSystemProvider(logService));
    disposables.add(service.registerProvider(testSchema, testProvider));
    testDir = getRandomTestPath(tmpdir(), "vsctests", "diskfileservice");
    const sourceDir = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/service").fsPath;
    await Promises.copy(sourceDir, testDir, { preserveSymlinks: false });
  });
  teardown(() => {
    disposables.clear();
    return Promises.rm(testDir);
  });
  test("createFolder", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const parent = await service.resolve(URI.file(testDir));
    const newFolderResource = URI.file(join(parent.resource.fsPath, "newFolder"));
    const newFolder = await service.createFolder(newFolderResource);
    assert.strictEqual(newFolder.name, "newFolder");
    assert.strictEqual(existsSync(newFolder.resource.fsPath), true);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, newFolderResource.fsPath);
    assert.strictEqual(event.operation, FileOperation.CREATE);
    assert.strictEqual(event.target.resource.fsPath, newFolderResource.fsPath);
    assert.strictEqual(event.target.isDirectory, true);
  });
  test("createFolder: creating multiple folders at once", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const multiFolderPaths = ["a", "couple", "of", "folders"];
    const parent = await service.resolve(URI.file(testDir));
    const newFolderResource = URI.file(join(parent.resource.fsPath, ...multiFolderPaths));
    const newFolder = await service.createFolder(newFolderResource);
    const lastFolderName = multiFolderPaths[multiFolderPaths.length - 1];
    assert.strictEqual(newFolder.name, lastFolderName);
    assert.strictEqual(existsSync(newFolder.resource.fsPath), true);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, newFolderResource.fsPath);
    assert.strictEqual(event.operation, FileOperation.CREATE);
    assert.strictEqual(event.target.resource.fsPath, newFolderResource.fsPath);
    assert.strictEqual(event.target.isDirectory, true);
  });
  test("exists", async () => {
    let exists = await service.exists(URI.file(testDir));
    assert.strictEqual(exists, true);
    exists = await service.exists(URI.file(testDir + "something"));
    assert.strictEqual(exists, false);
  });
  test("resolve - file", async () => {
    const resource = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/resolver/index.html");
    const resolved = await service.resolve(resource);
    assert.strictEqual(resolved.name, "index.html");
    assert.strictEqual(resolved.isFile, true);
    assert.strictEqual(resolved.isDirectory, false);
    assert.strictEqual(resolved.readonly, false);
    assert.strictEqual(resolved.isSymbolicLink, false);
    assert.strictEqual(resolved.resource.toString(), resource.toString());
    assert.strictEqual(resolved.children, void 0);
    assert.ok(resolved.mtime > 0);
    assert.ok(resolved.ctime > 0);
    assert.ok(resolved.size > 0);
  });
  test("resolve - directory", async () => {
    const testsElements = ["examples", "other", "index.html", "site.css"];
    const resource = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/resolver");
    const result = await service.resolve(resource);
    assert.ok(result);
    assert.strictEqual(result.resource.toString(), resource.toString());
    assert.strictEqual(result.name, "resolver");
    assert.ok(result.children);
    assert.ok(result.children.length > 0);
    assert.ok(result.isDirectory);
    assert.strictEqual(result.readonly, false);
    assert.ok(result.mtime > 0);
    assert.ok(result.ctime > 0);
    assert.strictEqual(result.children.length, testsElements.length);
    assert.ok(result.children.every((entry) => {
      return testsElements.some((name) => {
        return basename(entry.resource.fsPath) === name;
      });
    }));
    result.children.forEach((value) => {
      assert.ok(basename(value.resource.fsPath));
      if (["examples", "other"].indexOf(basename(value.resource.fsPath)) >= 0) {
        assert.ok(value.isDirectory);
        assert.strictEqual(value.mtime, void 0);
        assert.strictEqual(value.ctime, void 0);
      } else if (basename(value.resource.fsPath) === "index.html") {
        assert.ok(!value.isDirectory);
        assert.ok(!value.children);
        assert.strictEqual(value.mtime, void 0);
        assert.strictEqual(value.ctime, void 0);
      } else if (basename(value.resource.fsPath) === "site.css") {
        assert.ok(!value.isDirectory);
        assert.ok(!value.children);
        assert.strictEqual(value.mtime, void 0);
        assert.strictEqual(value.ctime, void 0);
      } else {
        assert.fail("Unexpected value " + basename(value.resource.fsPath));
      }
    });
  });
  test("resolve - directory - with metadata", async () => {
    const testsElements = ["examples", "other", "index.html", "site.css"];
    const result = await service.resolve(FileAccess.asFileUri("vs/platform/files/test/node/fixtures/resolver"), { resolveMetadata: true });
    assert.ok(result);
    assert.strictEqual(result.name, "resolver");
    assert.ok(result.children);
    assert.ok(result.children.length > 0);
    assert.ok(result.isDirectory);
    assert.ok(result.mtime > 0);
    assert.ok(result.ctime > 0);
    assert.strictEqual(result.children.length, testsElements.length);
    assert.ok(result.children.every((entry) => {
      return testsElements.some((name) => {
        return basename(entry.resource.fsPath) === name;
      });
    }));
    assert.ok(result.children.every((entry) => entry.etag.length > 0));
    result.children.forEach((value) => {
      assert.ok(basename(value.resource.fsPath));
      if (["examples", "other"].indexOf(basename(value.resource.fsPath)) >= 0) {
        assert.ok(value.isDirectory);
        assert.ok(value.mtime > 0);
        assert.ok(value.ctime > 0);
      } else if (basename(value.resource.fsPath) === "index.html") {
        assert.ok(!value.isDirectory);
        assert.ok(!value.children);
        assert.ok(value.mtime > 0);
        assert.ok(value.ctime > 0);
      } else if (basename(value.resource.fsPath) === "site.css") {
        assert.ok(!value.isDirectory);
        assert.ok(!value.children);
        assert.ok(value.mtime > 0);
        assert.ok(value.ctime > 0);
      } else {
        assert.fail("Unexpected value " + basename(value.resource.fsPath));
      }
    });
  });
  test("resolve - directory with resolveTo", async () => {
    const resolved = await service.resolve(URI.file(testDir), { resolveTo: [URI.file(join(testDir, "deep"))] });
    assert.strictEqual(resolved.children.length, 8);
    const deep = getByName(resolved, "deep");
    assert.strictEqual(deep.children.length, 4);
  });
  test("resolve - directory - resolveTo single directory", async () => {
    const resolverFixturesPath = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/resolver").fsPath;
    const result = await service.resolve(URI.file(resolverFixturesPath), { resolveTo: [URI.file(join(resolverFixturesPath, "other/deep"))] });
    assert.ok(result);
    assert.ok(result.children);
    assert.ok(result.children.length > 0);
    assert.ok(result.isDirectory);
    const children = result.children;
    assert.strictEqual(children.length, 4);
    const other = getByName(result, "other");
    assert.ok(other);
    assert.ok(other.children.length > 0);
    const deep = getByName(other, "deep");
    assert.ok(deep);
    assert.ok(deep.children.length > 0);
    assert.strictEqual(deep.children.length, 4);
  });
  test("resolve directory - resolveTo multiple directories", () => {
    return testResolveDirectoryWithTarget(false);
  });
  test("resolve directory - resolveTo with a URI that has query parameter (https://github.com/microsoft/vscode/issues/128151)", () => {
    return testResolveDirectoryWithTarget(true);
  });
  async function testResolveDirectoryWithTarget(withQueryParam) {
    const resolverFixturesPath = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/resolver").fsPath;
    const result = await service.resolve(URI.file(resolverFixturesPath).with({ query: withQueryParam ? "test" : void 0 }), {
      resolveTo: [
        URI.file(join(resolverFixturesPath, "other/deep")).with({ query: withQueryParam ? "test" : void 0 }),
        URI.file(join(resolverFixturesPath, "examples")).with({ query: withQueryParam ? "test" : void 0 })
      ]
    });
    assert.ok(result);
    assert.ok(result.children);
    assert.ok(result.children.length > 0);
    assert.ok(result.isDirectory);
    const children = result.children;
    assert.strictEqual(children.length, 4);
    const other = getByName(result, "other");
    assert.ok(other);
    assert.ok(other.children.length > 0);
    const deep = getByName(other, "deep");
    assert.ok(deep);
    assert.ok(deep.children.length > 0);
    assert.strictEqual(deep.children.length, 4);
    const examples = getByName(result, "examples");
    assert.ok(examples);
    assert.ok(examples.children.length > 0);
    assert.strictEqual(examples.children.length, 4);
  }
  test("resolve directory - resolveSingleChildFolders", async () => {
    const resolverFixturesPath = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/resolver/other").fsPath;
    const result = await service.resolve(URI.file(resolverFixturesPath), { resolveSingleChildDescendants: true });
    assert.ok(result);
    assert.ok(result.children);
    assert.ok(result.children.length > 0);
    assert.ok(result.isDirectory);
    const children = result.children;
    assert.strictEqual(children.length, 1);
    const deep = getByName(result, "deep");
    assert.ok(deep);
    assert.ok(deep.children.length > 0);
    assert.strictEqual(deep.children.length, 4);
  });
  test("resolves", async () => {
    const res = await service.resolveAll([
      { resource: URI.file(testDir), options: { resolveTo: [URI.file(join(testDir, "deep"))] } },
      { resource: URI.file(join(testDir, "deep")) }
    ]);
    const r1 = res[0].stat;
    assert.strictEqual(r1.children.length, 8);
    const deep = getByName(r1, "deep");
    assert.strictEqual(deep.children.length, 4);
    const r2 = res[1].stat;
    assert.strictEqual(r2.children.length, 4);
    assert.strictEqual(r2.name, "deep");
  });
  test("resolve / realpath - folder symbolic link", async () => {
    const link = URI.file(join(testDir, "deep-link"));
    await promises.symlink(join(testDir, "deep"), link.fsPath, "junction");
    const resolved = await service.resolve(link);
    assert.strictEqual(resolved.children.length, 4);
    assert.strictEqual(resolved.isDirectory, true);
    assert.strictEqual(resolved.isSymbolicLink, true);
    const realpath = await service.realpath(link);
    assert.ok(realpath);
    assert.strictEqual(basename(realpath.fsPath), "deep");
  });
  (isWindows ? test.skip : test)("resolve - file symbolic link", async () => {
    const link = URI.file(join(testDir, "lorem.txt-linked"));
    await promises.symlink(join(testDir, "lorem.txt"), link.fsPath);
    const resolved = await service.resolve(link);
    assert.strictEqual(resolved.isDirectory, false);
    assert.strictEqual(resolved.isSymbolicLink, true);
  });
  test("resolve - symbolic link pointing to nonexistent file does not break", async () => {
    await promises.symlink(join(testDir, "foo"), join(testDir, "bar"), "junction");
    const resolved = await service.resolve(URI.file(testDir));
    assert.strictEqual(resolved.isDirectory, true);
    assert.strictEqual(resolved.children.length, 9);
    const resolvedLink = resolved.children?.find((child) => child.name === "bar" && child.isSymbolicLink);
    assert.ok(resolvedLink);
    assert.ok(!resolvedLink?.isDirectory);
    assert.ok(!resolvedLink?.isFile);
  });
  test("stat - file", async () => {
    const resource = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/resolver/index.html");
    const resolved = await service.stat(resource);
    assert.strictEqual(resolved.name, "index.html");
    assert.strictEqual(resolved.isFile, true);
    assert.strictEqual(resolved.isDirectory, false);
    assert.strictEqual(resolved.readonly, false);
    assert.strictEqual(resolved.isSymbolicLink, false);
    assert.strictEqual(resolved.resource.toString(), resource.toString());
    assert.ok(resolved.mtime > 0);
    assert.ok(resolved.ctime > 0);
    assert.ok(resolved.size > 0);
  });
  test("stat - directory", async () => {
    const resource = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/resolver");
    const result = await service.stat(resource);
    assert.ok(result);
    assert.strictEqual(result.resource.toString(), resource.toString());
    assert.strictEqual(result.name, "resolver");
    assert.ok(result.isDirectory);
    assert.strictEqual(result.readonly, false);
    assert.ok(result.mtime > 0);
    assert.ok(result.ctime > 0);
  });
  if (!isWindows) {
    test("stat - executable", async () => {
      const nonExecutable = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/executable/non_executable");
      let resolved = await service.stat(nonExecutable);
      assert.strictEqual(resolved.isFile, true);
      assert.strictEqual(resolved.executable, false);
      const executable = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/executable/executable");
      resolved = await service.stat(executable);
      assert.strictEqual(resolved.isFile, true);
      assert.strictEqual(resolved.executable, true);
    });
  }
  test("deleteFile (non recursive)", async () => {
    return testDeleteFile(false, false);
  });
  test("deleteFile (recursive)", async () => {
    return testDeleteFile(false, true);
  });
  (isLinux ? test.skip : test)("deleteFile (useTrash)", async () => {
    return testDeleteFile(true, false);
  });
  async function testDeleteFile(useTrash, recursive) {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const resource = URI.file(join(testDir, "deep", "conway.js"));
    const source = await service.resolve(resource);
    assert.strictEqual(await service.canDelete(source.resource, { useTrash, recursive }), true);
    await service.del(source.resource, { useTrash, recursive });
    assert.strictEqual(existsSync(source.resource.fsPath), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.DELETE);
    let error = void 0;
    try {
      await service.del(source.resource, { useTrash, recursive });
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_NOT_FOUND);
  }
  (isWindows ? test.skip : test)("deleteFile - symbolic link (exists)", async () => {
    const target = URI.file(join(testDir, "lorem.txt"));
    const link = URI.file(join(testDir, "lorem.txt-linked"));
    await promises.symlink(target.fsPath, link.fsPath);
    const source = await service.resolve(link);
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    assert.strictEqual(await service.canDelete(source.resource), true);
    await service.del(source.resource);
    assert.strictEqual(existsSync(source.resource.fsPath), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, link.fsPath);
    assert.strictEqual(event.operation, FileOperation.DELETE);
    assert.strictEqual(existsSync(target.fsPath), true);
  });
  (isWindows ? test.skip : test)("deleteFile - symbolic link (pointing to nonexistent file)", async () => {
    const target = URI.file(join(testDir, "foo"));
    const link = URI.file(join(testDir, "bar"));
    await promises.symlink(target.fsPath, link.fsPath);
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    assert.strictEqual(await service.canDelete(link), true);
    await service.del(link);
    assert.strictEqual(existsSync(link.fsPath), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, link.fsPath);
    assert.strictEqual(event.operation, FileOperation.DELETE);
  });
  test("deleteFolder (recursive)", async () => {
    return testDeleteFolderRecursive(false, false);
  });
  test("deleteFolder (recursive, atomic)", async () => {
    return testDeleteFolderRecursive(false, { postfix: ".vsctmp" });
  });
  (isLinux ? test.skip : test)("deleteFolder (recursive, useTrash)", async () => {
    return testDeleteFolderRecursive(true, false);
  });
  async function testDeleteFolderRecursive(useTrash, atomic) {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const resource = URI.file(join(testDir, "deep"));
    const source = await service.resolve(resource);
    assert.strictEqual(await service.canDelete(source.resource, { recursive: true, useTrash, atomic }), true);
    await service.del(source.resource, { recursive: true, useTrash, atomic });
    assert.strictEqual(existsSync(source.resource.fsPath), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.DELETE);
  }
  test("deleteFolder (non recursive)", async () => {
    const resource = URI.file(join(testDir, "deep"));
    const source = await service.resolve(resource);
    assert.ok(await service.canDelete(source.resource) instanceof Error);
    let error;
    try {
      await service.del(source.resource);
    } catch (e) {
      error = e;
    }
    assert.ok(error);
  });
  test("deleteFolder empty folder (recursive)", () => {
    return testDeleteEmptyFolder(true);
  });
  test("deleteFolder empty folder (non recursive)", () => {
    return testDeleteEmptyFolder(false);
  });
  async function testDeleteEmptyFolder(recursive) {
    const { resource } = await service.createFolder(URI.file(join(testDir, "deep", "empty")));
    await service.del(resource, { recursive });
    assert.strictEqual(await service.exists(resource), false);
  }
  test("move", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = URI.file(join(testDir, "index.html"));
    const sourceContents = readFileSync(source.fsPath);
    const target = URI.file(join(dirname(source.fsPath), "other.html"));
    assert.strictEqual(await service.canMove(source, target), true);
    const renamed = await service.move(source, target);
    assert.strictEqual(existsSync(renamed.resource.fsPath), true);
    assert.strictEqual(existsSync(source.fsPath), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.fsPath);
    assert.strictEqual(event.operation, FileOperation.MOVE);
    assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
    const targetContents = readFileSync(target.fsPath);
    assert.strictEqual(sourceContents.byteLength, targetContents.byteLength);
    assert.strictEqual(sourceContents.toString(), targetContents.toString());
  });
  test("move - across providers (buffered => buffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testMoveAcrossProviders();
  });
  test("move - across providers (unbuffered => unbuffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testMoveAcrossProviders();
  });
  test("move - across providers (buffered => unbuffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testMoveAcrossProviders();
  });
  test("move - across providers (unbuffered => buffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testMoveAcrossProviders();
  });
  test("move - across providers - large (buffered => buffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testMoveAcrossProviders("lorem.txt");
  });
  test("move - across providers - large (unbuffered => unbuffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testMoveAcrossProviders("lorem.txt");
  });
  test("move - across providers - large (buffered => unbuffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testMoveAcrossProviders("lorem.txt");
  });
  test("move - across providers - large (unbuffered => buffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testMoveAcrossProviders("lorem.txt");
  });
  async function testMoveAcrossProviders(sourceFile = "index.html") {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = URI.file(join(testDir, sourceFile));
    const sourceContents = readFileSync(source.fsPath);
    const target = URI.file(join(dirname(source.fsPath), "other.html")).with({ scheme: testSchema });
    assert.strictEqual(await service.canMove(source, target), true);
    const renamed = await service.move(source, target);
    assert.strictEqual(existsSync(renamed.resource.fsPath), true);
    assert.strictEqual(existsSync(source.fsPath), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.fsPath);
    assert.strictEqual(event.operation, FileOperation.COPY);
    assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
    const targetContents = readFileSync(target.fsPath);
    assert.strictEqual(sourceContents.byteLength, targetContents.byteLength);
    assert.strictEqual(sourceContents.toString(), targetContents.toString());
  }
  test("move - multi folder", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const multiFolderPaths = ["a", "couple", "of", "folders"];
    const renameToPath = join(...multiFolderPaths, "other.html");
    const source = URI.file(join(testDir, "index.html"));
    assert.strictEqual(await service.canMove(source, URI.file(join(dirname(source.fsPath), renameToPath))), true);
    const renamed = await service.move(source, URI.file(join(dirname(source.fsPath), renameToPath)));
    assert.strictEqual(existsSync(renamed.resource.fsPath), true);
    assert.strictEqual(existsSync(source.fsPath), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.fsPath);
    assert.strictEqual(event.operation, FileOperation.MOVE);
    assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
  });
  test("move - directory", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = URI.file(join(testDir, "deep"));
    assert.strictEqual(await service.canMove(source, URI.file(join(dirname(source.fsPath), "deeper"))), true);
    const renamed = await service.move(source, URI.file(join(dirname(source.fsPath), "deeper")));
    assert.strictEqual(existsSync(renamed.resource.fsPath), true);
    assert.strictEqual(existsSync(source.fsPath), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.fsPath);
    assert.strictEqual(event.operation, FileOperation.MOVE);
    assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
  });
  test("move - directory - across providers (buffered => buffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testMoveFolderAcrossProviders();
  });
  test("move - directory - across providers (unbuffered => unbuffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testMoveFolderAcrossProviders();
  });
  test("move - directory - across providers (buffered => unbuffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testMoveFolderAcrossProviders();
  });
  test("move - directory - across providers (unbuffered => buffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    setCapabilities(testProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testMoveFolderAcrossProviders();
  });
  async function testMoveFolderAcrossProviders() {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = URI.file(join(testDir, "deep"));
    const sourceChildren = readdirSync(source.fsPath);
    const target = URI.file(join(dirname(source.fsPath), "deeper")).with({ scheme: testSchema });
    assert.strictEqual(await service.canMove(source, target), true);
    const renamed = await service.move(source, target);
    assert.strictEqual(existsSync(renamed.resource.fsPath), true);
    assert.strictEqual(existsSync(source.fsPath), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.fsPath);
    assert.strictEqual(event.operation, FileOperation.COPY);
    assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
    const targetChildren = readdirSync(target.fsPath);
    assert.strictEqual(sourceChildren.length, targetChildren.length);
    for (let i = 0; i < sourceChildren.length; i++) {
      assert.strictEqual(sourceChildren[i], targetChildren[i]);
    }
  }
  test("move - MIX CASE", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    assert.ok(source.size > 0);
    const renamedResource = URI.file(join(dirname(source.resource.fsPath), "INDEX.html"));
    assert.strictEqual(await service.canMove(source.resource, renamedResource), true);
    let renamed = await service.move(source.resource, renamedResource);
    assert.strictEqual(existsSync(renamedResource.fsPath), true);
    assert.strictEqual(basename(renamedResource.fsPath), "INDEX.html");
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.MOVE);
    assert.strictEqual(event.target.resource.fsPath, renamedResource.fsPath);
    renamed = await service.resolve(renamedResource, { resolveMetadata: true });
    assert.strictEqual(source.size, renamed.size);
  });
  test("move - same file", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    assert.ok(source.size > 0);
    assert.strictEqual(await service.canMove(source.resource, URI.file(source.resource.fsPath)), true);
    let renamed = await service.move(source.resource, URI.file(source.resource.fsPath));
    assert.strictEqual(existsSync(renamed.resource.fsPath), true);
    assert.strictEqual(basename(renamed.resource.fsPath), "index.html");
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.MOVE);
    assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
    renamed = await service.resolve(renamed.resource, { resolveMetadata: true });
    assert.strictEqual(source.size, renamed.size);
  });
  test("move - same file #2", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    assert.ok(source.size > 0);
    const targetParent = URI.file(testDir);
    const target = targetParent.with({ path: posix.join(targetParent.path, posix.basename(source.resource.path)) });
    assert.strictEqual(await service.canMove(source.resource, target), true);
    let renamed = await service.move(source.resource, target);
    assert.strictEqual(existsSync(renamed.resource.fsPath), true);
    assert.strictEqual(basename(renamed.resource.fsPath), "index.html");
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.MOVE);
    assert.strictEqual(event.target.resource.fsPath, renamed.resource.fsPath);
    renamed = await service.resolve(renamed.resource, { resolveMetadata: true });
    assert.strictEqual(source.size, renamed.size);
  });
  test("move - source parent of target", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    let source = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    const originalSize = source.size;
    assert.ok(originalSize > 0);
    assert.ok(await service.canMove(URI.file(testDir), URI.file(join(testDir, "binary.txt"))) instanceof Error);
    let error;
    try {
      await service.move(URI.file(testDir), URI.file(join(testDir, "binary.txt")));
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.ok(!event);
    source = await service.resolve(source.resource, { resolveMetadata: true });
    assert.strictEqual(originalSize, source.size);
  });
  test("move - FILE_MOVE_CONFLICT", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    let source = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    const originalSize = source.size;
    assert.ok(originalSize > 0);
    assert.ok(await service.canMove(source.resource, URI.file(join(testDir, "binary.txt"))) instanceof Error);
    let error;
    try {
      await service.move(source.resource, URI.file(join(testDir, "binary.txt")));
    } catch (e) {
      error = e;
    }
    assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_MOVE_CONFLICT);
    assert.ok(!event);
    source = await service.resolve(source.resource, { resolveMetadata: true });
    assert.strictEqual(originalSize, source.size);
  });
  test("move - overwrite folder with file", async () => {
    let createEvent;
    let moveEvent;
    let deleteEvent;
    disposables.add(service.onDidRunOperation((e) => {
      if (e.operation === FileOperation.CREATE) {
        createEvent = e;
      } else if (e.operation === FileOperation.DELETE) {
        deleteEvent = e;
      } else if (e.operation === FileOperation.MOVE) {
        moveEvent = e;
      }
    }));
    const parent = await service.resolve(URI.file(testDir));
    const folderResource = URI.file(join(parent.resource.fsPath, "conway.js"));
    const f = await service.createFolder(folderResource);
    const source = URI.file(join(testDir, "deep", "conway.js"));
    assert.strictEqual(await service.canMove(source, f.resource, true), true);
    const moved = await service.move(source, f.resource, true);
    assert.strictEqual(existsSync(moved.resource.fsPath), true);
    assert.ok(statSync(moved.resource.fsPath).isFile);
    assert.ok(createEvent);
    assert.ok(deleteEvent);
    assert.ok(moveEvent);
    assert.strictEqual(moveEvent.resource.fsPath, source.fsPath);
    assert.strictEqual(moveEvent.target.resource.fsPath, moved.resource.fsPath);
    assert.strictEqual(deleteEvent.resource.fsPath, folderResource.fsPath);
  });
  test("copy", async () => {
    await doTestCopy();
  });
  test("copy - unbuffered (FileSystemProviderCapabilities.FileReadWrite)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    await doTestCopy();
  });
  test("copy - unbuffered large (FileSystemProviderCapabilities.FileReadWrite)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    await doTestCopy("lorem.txt");
  });
  test("copy - buffered (FileSystemProviderCapabilities.FileOpenReadWriteClose)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    await doTestCopy();
  });
  test("copy - buffered large (FileSystemProviderCapabilities.FileOpenReadWriteClose)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    await doTestCopy("lorem.txt");
  });
  function setCapabilities(provider, capabilities) {
    provider.capabilities = capabilities;
    if (isLinux) {
      provider.capabilities |= FileSystemProviderCapabilities.PathCaseSensitive;
    }
  }
  async function doTestCopy(sourceName = "index.html") {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = await service.resolve(URI.file(join(testDir, sourceName)));
    const target = URI.file(join(testDir, "other.html"));
    assert.strictEqual(await service.canCopy(source.resource, target), true);
    const copied = await service.copy(source.resource, target);
    assert.strictEqual(existsSync(copied.resource.fsPath), true);
    assert.strictEqual(existsSync(source.resource.fsPath), true);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.COPY);
    assert.strictEqual(event.target.resource.fsPath, copied.resource.fsPath);
    const sourceContents = readFileSync(source.resource.fsPath);
    const targetContents = readFileSync(target.fsPath);
    assert.strictEqual(sourceContents.byteLength, targetContents.byteLength);
    assert.strictEqual(sourceContents.toString(), targetContents.toString());
  }
  test("copy - overwrite folder with file", async () => {
    let createEvent;
    let copyEvent;
    let deleteEvent;
    disposables.add(service.onDidRunOperation((e) => {
      if (e.operation === FileOperation.CREATE) {
        createEvent = e;
      } else if (e.operation === FileOperation.DELETE) {
        deleteEvent = e;
      } else if (e.operation === FileOperation.COPY) {
        copyEvent = e;
      }
    }));
    const parent = await service.resolve(URI.file(testDir));
    const folderResource = URI.file(join(parent.resource.fsPath, "conway.js"));
    const f = await service.createFolder(folderResource);
    const source = URI.file(join(testDir, "deep", "conway.js"));
    assert.strictEqual(await service.canCopy(source, f.resource, true), true);
    const copied = await service.copy(source, f.resource, true);
    assert.strictEqual(existsSync(copied.resource.fsPath), true);
    assert.ok(statSync(copied.resource.fsPath).isFile);
    assert.ok(createEvent);
    assert.ok(deleteEvent);
    assert.ok(copyEvent);
    assert.strictEqual(copyEvent.resource.fsPath, source.fsPath);
    assert.strictEqual(copyEvent.target.resource.fsPath, copied.resource.fsPath);
    assert.strictEqual(deleteEvent.resource.fsPath, folderResource.fsPath);
  });
  test("copy - MIX CASE same target - no overwrite", async () => {
    let source = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    const originalSize = source.size;
    assert.ok(originalSize > 0);
    const target = URI.file(join(dirname(source.resource.fsPath), "INDEX.html"));
    const canCopy = await service.canCopy(source.resource, target);
    let error;
    let copied;
    try {
      copied = await service.copy(source.resource, target);
    } catch (e) {
      error = e;
    }
    if (isLinux) {
      assert.ok(!error);
      assert.strictEqual(canCopy, true);
      assert.strictEqual(existsSync(copied.resource.fsPath), true);
      assert.ok(readdirSync(testDir).some((f) => f === "INDEX.html"));
      assert.strictEqual(source.size, copied.size);
    } else {
      assert.ok(error);
      assert.ok(canCopy instanceof Error);
      source = await service.resolve(source.resource, { resolveMetadata: true });
      assert.strictEqual(originalSize, source.size);
    }
  });
  test("copy - MIX CASE same target - overwrite", async () => {
    let source = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    const originalSize = source.size;
    assert.ok(originalSize > 0);
    const target = URI.file(join(dirname(source.resource.fsPath), "INDEX.html"));
    const canCopy = await service.canCopy(source.resource, target, true);
    let error;
    let copied;
    try {
      copied = await service.copy(source.resource, target, true);
    } catch (e) {
      error = e;
    }
    if (isLinux) {
      assert.ok(!error);
      assert.strictEqual(canCopy, true);
      assert.strictEqual(existsSync(copied.resource.fsPath), true);
      assert.ok(readdirSync(testDir).some((f) => f === "INDEX.html"));
      assert.strictEqual(source.size, copied.size);
    } else {
      assert.ok(error);
      assert.ok(canCopy instanceof Error);
      source = await service.resolve(source.resource, { resolveMetadata: true });
      assert.strictEqual(originalSize, source.size);
    }
  });
  test("copy - MIX CASE different target - overwrite", async () => {
    const source1 = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    assert.ok(source1.size > 0);
    const renamed = await service.move(source1.resource, URI.file(join(dirname(source1.resource.fsPath), "CONWAY.js")));
    assert.strictEqual(existsSync(renamed.resource.fsPath), true);
    assert.ok(readdirSync(testDir).some((f) => f === "CONWAY.js"));
    assert.strictEqual(source1.size, renamed.size);
    const source2 = await service.resolve(URI.file(join(testDir, "deep", "conway.js")), { resolveMetadata: true });
    const target = URI.file(join(testDir, basename(source2.resource.path)));
    assert.strictEqual(await service.canCopy(source2.resource, target, true), true);
    const res = await service.copy(source2.resource, target, true);
    assert.strictEqual(existsSync(res.resource.fsPath), true);
    assert.ok(readdirSync(testDir).some((f) => f === "conway.js"));
    assert.strictEqual(source2.size, res.size);
  });
  test("copy - same file", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    assert.ok(source.size > 0);
    assert.strictEqual(await service.canCopy(source.resource, URI.file(source.resource.fsPath)), true);
    let copied = await service.copy(source.resource, URI.file(source.resource.fsPath));
    assert.strictEqual(existsSync(copied.resource.fsPath), true);
    assert.strictEqual(basename(copied.resource.fsPath), "index.html");
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.COPY);
    assert.strictEqual(event.target.resource.fsPath, copied.resource.fsPath);
    copied = await service.resolve(source.resource, { resolveMetadata: true });
    assert.strictEqual(source.size, copied.size);
  });
  test("copy - same file #2", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const source = await service.resolve(URI.file(join(testDir, "index.html")), { resolveMetadata: true });
    assert.ok(source.size > 0);
    const targetParent = URI.file(testDir);
    const target = targetParent.with({ path: posix.join(targetParent.path, posix.basename(source.resource.path)) });
    assert.strictEqual(await service.canCopy(source.resource, URI.file(target.fsPath)), true);
    let copied = await service.copy(source.resource, URI.file(target.fsPath));
    assert.strictEqual(existsSync(copied.resource.fsPath), true);
    assert.strictEqual(basename(copied.resource.fsPath), "index.html");
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, source.resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.COPY);
    assert.strictEqual(event.target.resource.fsPath, copied.resource.fsPath);
    copied = await service.resolve(source.resource, { resolveMetadata: true });
    assert.strictEqual(source.size, copied.size);
  });
  test("cloneFile - basics", () => {
    return testCloneFile();
  });
  test("cloneFile - via copy capability", () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileFolderCopy);
    return testCloneFile();
  });
  test("cloneFile - via pipe", () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testCloneFile();
  });
  async function testCloneFile() {
    const source1 = URI.file(join(testDir, "index.html"));
    const source1Size = (await service.resolve(source1, { resolveMetadata: true })).size;
    const source2 = URI.file(join(testDir, "lorem.txt"));
    const source2Size = (await service.resolve(source2, { resolveMetadata: true })).size;
    const targetParent = URI.file(testDir);
    await service.cloneFile(source1, source1);
    const target1 = targetParent.with({ path: posix.join(targetParent.path, `${posix.basename(source1.path)}-clone`) });
    await service.cloneFile(source1, URI.file(target1.fsPath));
    assert.strictEqual(existsSync(target1.fsPath), true);
    assert.strictEqual(basename(target1.fsPath), "index.html-clone");
    let target1Size = (await service.resolve(target1, { resolveMetadata: true })).size;
    assert.strictEqual(source1Size, target1Size);
    await service.cloneFile(source2, URI.file(target1.fsPath));
    target1Size = (await service.resolve(target1, { resolveMetadata: true })).size;
    assert.strictEqual(source2Size, target1Size);
    assert.notStrictEqual(source1Size, target1Size);
    const target2 = targetParent.with({ path: posix.join(targetParent.path, "foo", "bar", `${posix.basename(source1.path)}-clone`) });
    await service.cloneFile(source1, URI.file(target2.fsPath));
    assert.strictEqual(existsSync(target2.fsPath), true);
    assert.strictEqual(basename(target2.fsPath), "index.html-clone");
    const target2Size = (await service.resolve(target2, { resolveMetadata: true })).size;
    assert.strictEqual(source1Size, target2Size);
  }
  test("readFile - small file - default", () => {
    return testReadFile(URI.file(join(testDir, "small.txt")));
  });
  test("readFile - small file - buffered", () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testReadFile(URI.file(join(testDir, "small.txt")));
  });
  test("readFile - small file - buffered / readonly", () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.Readonly);
    return testReadFile(URI.file(join(testDir, "small.txt")));
  });
  test("readFile - small file - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testReadFile(URI.file(join(testDir, "small.txt")));
  });
  test("readFile - small file - unbuffered / readonly", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.Readonly);
    return testReadFile(URI.file(join(testDir, "small.txt")));
  });
  test("readFile - small file - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testReadFile(URI.file(join(testDir, "small.txt")));
  });
  test("readFile - small file - streamed / readonly", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream | FileSystemProviderCapabilities.Readonly);
    return testReadFile(URI.file(join(testDir, "small.txt")));
  });
  test("readFile - large file - default", async () => {
    return testReadFile(URI.file(join(testDir, "lorem.txt")));
  });
  test("readFile - large file - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testReadFile(URI.file(join(testDir, "lorem.txt")));
  });
  test("readFile - large file - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testReadFile(URI.file(join(testDir, "lorem.txt")));
  });
  test("readFile - large file - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testReadFile(URI.file(join(testDir, "lorem.txt")));
  });
  test("readFile - atomic (emulated on service level)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testReadFile(URI.file(join(testDir, "lorem.txt")), { atomic: true });
  });
  test("readFile - atomic (natively supported)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite & FileSystemProviderCapabilities.FileAtomicRead);
    return testReadFile(URI.file(join(testDir, "lorem.txt")), { atomic: true });
  });
  async function testReadFile(resource, options) {
    const content = await service.readFile(resource, options);
    assert.strictEqual(content.value.toString(), readFileSync(resource.fsPath).toString());
  }
  test("readFileStream - small file - default", () => {
    return testReadFileStream(URI.file(join(testDir, "small.txt")));
  });
  test("readFileStream - small file - buffered", () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testReadFileStream(URI.file(join(testDir, "small.txt")));
  });
  test("readFileStream - small file - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testReadFileStream(URI.file(join(testDir, "small.txt")));
  });
  test("readFileStream - small file - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testReadFileStream(URI.file(join(testDir, "small.txt")));
  });
  async function testReadFileStream(resource) {
    const content = await service.readFileStream(resource);
    assert.strictEqual((await streamToBuffer(content.value)).toString(), readFileSync(resource.fsPath).toString());
  }
  test("readFile - Files are intermingled #38331 - default", async () => {
    return testFilesNotIntermingled();
  });
  test("readFile - Files are intermingled #38331 - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testFilesNotIntermingled();
  });
  test("readFile - Files are intermingled #38331 - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testFilesNotIntermingled();
  });
  test("readFile - Files are intermingled #38331 - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testFilesNotIntermingled();
  });
  async function testFilesNotIntermingled() {
    const resource1 = URI.file(join(testDir, "lorem.txt"));
    const resource2 = URI.file(join(testDir, "some_utf16le.css"));
    const value1 = await service.readFile(resource1);
    const value2 = await service.readFile(resource2);
    const result = await Promise.all([
      service.readFile(resource1),
      service.readFile(resource2)
    ]);
    assert.strictEqual(result[0].value.toString(), value1.value.toString());
    assert.strictEqual(result[1].value.toString(), value2.value.toString());
  }
  test("readFile - from position (ASCII) - default", async () => {
    return testReadFileFromPositionAscii();
  });
  test("readFile - from position (ASCII) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testReadFileFromPositionAscii();
  });
  test("readFile - from position (ASCII) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testReadFileFromPositionAscii();
  });
  test("readFile - from position (ASCII) - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testReadFileFromPositionAscii();
  });
  async function testReadFileFromPositionAscii() {
    const resource = URI.file(join(testDir, "small.txt"));
    const contents = await service.readFile(resource, { position: 6 });
    assert.strictEqual(contents.value.toString(), "File");
  }
  test("readFile - from position (with umlaut) - default", async () => {
    return testReadFileFromPositionUmlaut();
  });
  test("readFile - from position (with umlaut) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testReadFileFromPositionUmlaut();
  });
  test("readFile - from position (with umlaut) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testReadFileFromPositionUmlaut();
  });
  test("readFile - from position (with umlaut) - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testReadFileFromPositionUmlaut();
  });
  async function testReadFileFromPositionUmlaut() {
    const resource = URI.file(join(testDir, "small_umlaut.txt"));
    const contents = await service.readFile(resource, { position: Buffer.from("Small File with \xDC").length });
    assert.strictEqual(contents.value.toString(), "mlaut");
  }
  test("readFile - 3 bytes (ASCII) - default", async () => {
    return testReadThreeBytesFromFile();
  });
  test("readFile - 3 bytes (ASCII) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testReadThreeBytesFromFile();
  });
  test("readFile - 3 bytes (ASCII) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testReadThreeBytesFromFile();
  });
  test("readFile - 3 bytes (ASCII) - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testReadThreeBytesFromFile();
  });
  async function testReadThreeBytesFromFile() {
    const resource = URI.file(join(testDir, "small.txt"));
    const contents = await service.readFile(resource, { length: 3 });
    assert.strictEqual(contents.value.toString(), "Sma");
  }
  test("readFile - 20000 bytes (large) - default", async () => {
    return readLargeFileWithLength(2e4);
  });
  test("readFile - 20000 bytes (large) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return readLargeFileWithLength(2e4);
  });
  test("readFile - 20000 bytes (large) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return readLargeFileWithLength(2e4);
  });
  test("readFile - 20000 bytes (large) - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return readLargeFileWithLength(2e4);
  });
  test("readFile - 80000 bytes (large) - default", async () => {
    return readLargeFileWithLength(8e4);
  });
  test("readFile - 80000 bytes (large) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return readLargeFileWithLength(8e4);
  });
  test("readFile - 80000 bytes (large) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return readLargeFileWithLength(8e4);
  });
  test("readFile - 80000 bytes (large) - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return readLargeFileWithLength(8e4);
  });
  async function readLargeFileWithLength(length) {
    const resource = URI.file(join(testDir, "lorem.txt"));
    const contents = await service.readFile(resource, { length });
    assert.strictEqual(contents.value.byteLength, length);
  }
  test("readFile - FILE_IS_DIRECTORY", async () => {
    const resource = URI.file(join(testDir, "deep"));
    let error = void 0;
    try {
      await service.readFile(resource);
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_IS_DIRECTORY);
  });
  (isWindows ? test.skip : test)("readFile - FILE_NOT_DIRECTORY", async () => {
    const resource = URI.file(join(testDir, "lorem.txt", "file.txt"));
    let error = void 0;
    try {
      await service.readFile(resource);
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_NOT_DIRECTORY);
  });
  test("readFile - FILE_NOT_FOUND", async () => {
    const resource = URI.file(join(testDir, "404.html"));
    let error = void 0;
    try {
      await service.readFile(resource);
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_NOT_FOUND);
  });
  test("readFile - FILE_NOT_MODIFIED_SINCE - default", async () => {
    return testNotModifiedSince();
  });
  test("readFile - FILE_NOT_MODIFIED_SINCE - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testNotModifiedSince();
  });
  test("readFile - FILE_NOT_MODIFIED_SINCE - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testNotModifiedSince();
  });
  test("readFile - FILE_NOT_MODIFIED_SINCE - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testNotModifiedSince();
  });
  async function testNotModifiedSince() {
    const resource = URI.file(join(testDir, "index.html"));
    const contents = await service.readFile(resource);
    fileProvider.totalBytesRead = 0;
    let error = void 0;
    try {
      await service.readFile(resource, { etag: contents.etag });
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_NOT_MODIFIED_SINCE);
    assert.ok(error instanceof NotModifiedSinceFileOperationError && error.stat);
    assert.strictEqual(fileProvider.totalBytesRead, 0);
  }
  test("readFile - FILE_NOT_MODIFIED_SINCE does not fire wrongly - https://github.com/microsoft/vscode/issues/72909", async () => {
    fileProvider.setInvalidStatSize(true);
    const resource = URI.file(join(testDir, "index.html"));
    await service.readFile(resource);
    let error = void 0;
    try {
      await service.readFile(resource, { etag: void 0 });
    } catch (err) {
      error = err;
    }
    assert.ok(!error);
  });
  test("readFile - FILE_TOO_LARGE - default", async () => {
    return testFileTooLarge();
  });
  test("readFile - FILE_TOO_LARGE - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testFileTooLarge();
  });
  test("readFile - FILE_TOO_LARGE - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testFileTooLarge();
  });
  test("readFile - FILE_TOO_LARGE - streamed", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadStream);
    return testFileTooLarge();
  });
  async function testFileTooLarge() {
    await doTestFileTooLarge(false);
    fileProvider.setSmallStatSize(true);
    return doTestFileTooLarge(true);
  }
  async function doTestFileTooLarge(statSizeWrong) {
    const resource = URI.file(join(testDir, "index.html"));
    let error = void 0;
    try {
      await service.readFile(resource, { limits: { size: 10 } });
    } catch (err) {
      error = err;
    }
    if (!statSizeWrong) {
      assert.ok(error instanceof TooLargeFileOperationError);
      assert.ok(typeof error.size === "number");
    }
    assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_TOO_LARGE);
  }
  (isWindows ? test.skip : test)("readFile - dangling symbolic link - https://github.com/microsoft/vscode/issues/116049", async () => {
    const link = URI.file(join(testDir, "small.js-link"));
    await promises.symlink(join(testDir, "small.js"), link.fsPath);
    let error = void 0;
    try {
      await service.readFile(link);
    } catch (err) {
      error = err;
    }
    assert.ok(error);
  });
  test("createFile", async () => {
    return assertCreateFile((contents) => VSBuffer.fromString(contents));
  });
  test("createFile (readable)", async () => {
    return assertCreateFile((contents) => bufferToReadable(VSBuffer.fromString(contents)));
  });
  test("createFile (stream)", async () => {
    return assertCreateFile((contents) => bufferToStream(VSBuffer.fromString(contents)));
  });
  async function assertCreateFile(converter) {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const contents = "Hello World";
    const resource = URI.file(join(testDir, "test.txt"));
    assert.strictEqual(await service.canCreateFile(resource), true);
    const fileStat = await service.createFile(resource, converter(contents));
    assert.strictEqual(fileStat.name, "test.txt");
    assert.strictEqual(existsSync(fileStat.resource.fsPath), true);
    assert.strictEqual(readFileSync(fileStat.resource.fsPath).toString(), contents);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.CREATE);
    assert.strictEqual(event.target.resource.fsPath, resource.fsPath);
  }
  test("createFile (does not overwrite by default)", async () => {
    const contents = "Hello World";
    const resource = URI.file(join(testDir, "test.txt"));
    writeFileSync(resource.fsPath, "");
    assert.ok(await service.canCreateFile(resource) instanceof Error);
    let error;
    try {
      await service.createFile(resource, VSBuffer.fromString(contents));
    } catch (err) {
      error = err;
    }
    assert.ok(error);
  });
  test("createFile (allows to overwrite existing)", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const contents = "Hello World";
    const resource = URI.file(join(testDir, "test.txt"));
    writeFileSync(resource.fsPath, "");
    assert.strictEqual(await service.canCreateFile(resource, { overwrite: true }), true);
    const fileStat = await service.createFile(resource, VSBuffer.fromString(contents), { overwrite: true });
    assert.strictEqual(fileStat.name, "test.txt");
    assert.strictEqual(existsSync(fileStat.resource.fsPath), true);
    assert.strictEqual(readFileSync(fileStat.resource.fsPath).toString(), contents);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.CREATE);
    assert.strictEqual(event.target.resource.fsPath, resource.fsPath);
  });
  test("writeFile - default", async () => {
    return testWriteFile(false);
  });
  test("writeFile - flush on write", async () => {
    DiskFileSystemProvider.configureFlushOnWrite(true);
    try {
      return await testWriteFile(false);
    } finally {
      DiskFileSystemProvider.configureFlushOnWrite(false);
    }
  });
  test("writeFile - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testWriteFile(false);
  });
  test("writeFile - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testWriteFile(false);
  });
  test("writeFile - default (atomic)", async () => {
    return testWriteFile(true);
  });
  test("writeFile - flush on write (atomic)", async () => {
    DiskFileSystemProvider.configureFlushOnWrite(true);
    try {
      return await testWriteFile(true);
    } finally {
      DiskFileSystemProvider.configureFlushOnWrite(false);
    }
  });
  test("writeFile - buffered (atomic)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileAtomicWrite);
    let e;
    try {
      await testWriteFile(true);
    } catch (error) {
      e = error;
    }
    assert.ok(e);
  });
  test("writeFile - unbuffered (atomic)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileAtomicWrite);
    return testWriteFile(true);
  });
  (isWindows ? test.skip : test)("writeFile - atomic writing does not break symlinks", async () => {
    const link = URI.file(join(testDir, "lorem.txt-linked"));
    await promises.symlink(join(testDir, "lorem.txt"), link.fsPath);
    const content = "Updates to the lorem file";
    await service.writeFile(link, VSBuffer.fromString(content), { atomic: { postfix: ".vsctmp" } });
    assert.strictEqual(readFileSync(link.fsPath).toString(), content);
    const resolved = await service.resolve(link);
    assert.strictEqual(resolved.isSymbolicLink, true);
  });
  async function testWriteFile(atomic) {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const resource = URI.file(join(testDir, "small.txt"));
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const newContent = "Updates to the small file";
    await service.writeFile(resource, VSBuffer.fromString(newContent), { atomic: atomic ? { postfix: ".vsctmp" } : false });
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.WRITE);
    assert.strictEqual(readFileSync(resource.fsPath).toString(), newContent);
  }
  test("writeFile (large file) - default", async () => {
    return testWriteFileLarge(false);
  });
  test("writeFile (large file) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testWriteFileLarge(false);
  });
  test("writeFile (large file) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testWriteFileLarge(false);
  });
  test("writeFile (large file) - default (atomic)", async () => {
    return testWriteFileLarge(true);
  });
  test("writeFile (large file) - buffered (atomic)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileAtomicWrite);
    let e;
    try {
      await testWriteFileLarge(true);
    } catch (error) {
      e = error;
    }
    assert.ok(e);
  });
  test("writeFile (large file) - unbuffered (atomic)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileAtomicWrite);
    return testWriteFileLarge(true);
  });
  async function testWriteFileLarge(atomic) {
    const resource = URI.file(join(testDir, "lorem.txt"));
    const content = readFileSync(resource.fsPath);
    const newContent = content.toString() + content.toString();
    const fileStat = await service.writeFile(resource, VSBuffer.fromString(newContent), { atomic: atomic ? { postfix: ".vsctmp" } : false });
    assert.strictEqual(fileStat.name, "lorem.txt");
    assert.strictEqual(readFileSync(resource.fsPath).toString(), newContent);
  }
  test("writeFile (large file) - unbuffered (atomic) - concurrent writes with multiple services", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileAtomicWrite);
    const resource = URI.file(join(testDir, "lorem.txt"));
    const content = readFileSync(resource.fsPath);
    const newContent = content.toString() + content.toString();
    const promises2 = [];
    let suffix = 0;
    for (let i = 0; i < 10; i++) {
      const service2 = disposables.add(new FileService(new NullLogService()));
      disposables.add(service2.registerProvider(Schemas.file, fileProvider));
      promises2.push(service2.writeFile(resource, VSBuffer.fromString(`${newContent}${++suffix}`), { atomic: { postfix: ".vsctmp" } }));
      await timeout(0);
    }
    await Promise.allSettled(promises2);
    assert.strictEqual(readFileSync(resource.fsPath).toString(), `${newContent}${suffix}`);
  });
  test("writeFile - buffered - readonly throws", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.Readonly);
    return testWriteFileReadonlyThrows();
  });
  test("writeFile - unbuffered - readonly throws", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.Readonly);
    return testWriteFileReadonlyThrows();
  });
  async function testWriteFileReadonlyThrows() {
    const resource = URI.file(join(testDir, "small.txt"));
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const newContent = "Updates to the small file";
    let error;
    try {
      await service.writeFile(resource, VSBuffer.fromString(newContent));
    } catch (err) {
      error = err;
    }
    assert.ok(error);
  }
  test("writeFile (large file) - multiple parallel writes queue up and atomic read support (via file service)", async () => {
    const resource = URI.file(join(testDir, "lorem.txt"));
    const content = readFileSync(resource.fsPath);
    const newContent = content.toString() + content.toString();
    const writePromises = Promise.all(["0", "00", "000", "0000", "00000"].map(async (offset) => {
      const fileStat = await service.writeFile(resource, VSBuffer.fromString(offset + newContent));
      assert.strictEqual(fileStat.name, "lorem.txt");
    }));
    const readPromises = Promise.all(["0", "00", "000", "0000", "00000"].map(async () => {
      const fileContent = await service.readFile(resource, { atomic: true });
      assert.ok(fileContent.value.byteLength > 0);
    }));
    await Promise.all([writePromises, readPromises]);
  });
  test("provider - write barrier prevents dirty writes", async () => {
    const resource = URI.file(join(testDir, "lorem.txt"));
    const content = readFileSync(resource.fsPath);
    const newContent = content.toString() + content.toString();
    const provider = service.getProvider(resource.scheme);
    assert.ok(provider);
    assert.ok(hasOpenReadWriteCloseCapability(provider));
    const writePromises = Promise.all(["0", "00", "000", "0000", "00000"].map(async (offset) => {
      const content2 = offset + newContent;
      const contentBuffer = VSBuffer.fromString(content2).buffer;
      const fd = await provider.open(resource, { create: true, unlock: false });
      try {
        await provider.write(fd, 0, VSBuffer.fromString(content2).buffer, 0, contentBuffer.byteLength);
        assert.strictEqual((await promises.readFile(resource.fsPath)).toString(), content2);
      } finally {
        await provider.close(fd);
      }
    }));
    await Promise.all([writePromises]);
  });
  test("provider - write barrier is partitioned per resource", async () => {
    const resource1 = URI.file(join(testDir, "lorem.txt"));
    const resource2 = URI.file(join(testDir, "test.txt"));
    const provider = service.getProvider(resource1.scheme);
    assert.ok(provider);
    assert.ok(hasOpenReadWriteCloseCapability(provider));
    const fd1 = await provider.open(resource1, { create: true, unlock: false });
    const fd2 = await provider.open(resource2, { create: true, unlock: false });
    const newContent = "Hello World";
    try {
      await provider.write(fd1, 0, VSBuffer.fromString(newContent).buffer, 0, VSBuffer.fromString(newContent).buffer.byteLength);
      assert.strictEqual((await promises.readFile(resource1.fsPath)).toString(), newContent);
      await provider.write(fd2, 0, VSBuffer.fromString(newContent).buffer, 0, VSBuffer.fromString(newContent).buffer.byteLength);
      assert.strictEqual((await promises.readFile(resource2.fsPath)).toString(), newContent);
    } finally {
      await Promise.allSettled([
        await provider.close(fd1),
        await provider.close(fd2)
      ]);
    }
  });
  test("provider - write barrier not becoming stale", async () => {
    const newFolder = join(testDir, "new-folder");
    const newResource = URI.file(join(newFolder, "lorem.txt"));
    const provider = service.getProvider(newResource.scheme);
    assert.ok(provider);
    assert.ok(hasOpenReadWriteCloseCapability(provider));
    let error = void 0;
    try {
      await provider.open(newResource, { create: true, unlock: false });
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    await promises.mkdir(newFolder);
    const content = readFileSync(URI.file(join(testDir, "lorem.txt")).fsPath);
    const newContent = content.toString() + content.toString();
    const newContentBuffer = VSBuffer.fromString(newContent).buffer;
    const fd = await provider.open(newResource, { create: true, unlock: false });
    try {
      await provider.write(fd, 0, newContentBuffer, 0, newContentBuffer.byteLength);
      assert.strictEqual((await promises.readFile(newResource.fsPath)).toString(), newContent);
    } finally {
      await provider.close(fd);
    }
  });
  test("provider - atomic reads (write pending when read starts)", async () => {
    const resource = URI.file(join(testDir, "lorem.txt"));
    const content = readFileSync(resource.fsPath);
    const newContent = content.toString() + content.toString();
    const newContentBuffer = VSBuffer.fromString(newContent).buffer;
    const provider = service.getProvider(resource.scheme);
    assert.ok(provider);
    assert.ok(hasOpenReadWriteCloseCapability(provider));
    assert.ok(hasFileAtomicReadCapability(provider));
    let atomicReadPromise = void 0;
    const fd = await provider.open(resource, { create: true, unlock: false });
    try {
      atomicReadPromise = provider.readFile(resource, { atomic: true });
      await timeout(20);
      await provider.write(fd, 0, newContentBuffer, 0, newContentBuffer.byteLength);
    } finally {
      await provider.close(fd);
    }
    assert.ok(atomicReadPromise);
    const atomicReadResult = await atomicReadPromise;
    assert.strictEqual(atomicReadResult.byteLength, newContentBuffer.byteLength);
  });
  test("provider - atomic reads (read pending when write starts)", async () => {
    const resource = URI.file(join(testDir, "lorem.txt"));
    const content = readFileSync(resource.fsPath);
    const newContent = content.toString() + content.toString();
    const newContentBuffer = VSBuffer.fromString(newContent).buffer;
    const provider = service.getProvider(resource.scheme);
    assert.ok(provider);
    assert.ok(hasOpenReadWriteCloseCapability(provider));
    assert.ok(hasFileAtomicReadCapability(provider));
    let atomicReadPromise = provider.readFile(resource, { atomic: true });
    const fdPromise = provider.open(resource, { create: true, unlock: false }).then(async (fd) => {
      try {
        return await provider.write(fd, 0, newContentBuffer, 0, newContentBuffer.byteLength);
      } finally {
        await provider.close(fd);
      }
    });
    let atomicReadResult = await atomicReadPromise;
    assert.strictEqual(atomicReadResult.byteLength, content.byteLength);
    await fdPromise;
    atomicReadPromise = provider.readFile(resource, { atomic: true });
    atomicReadResult = await atomicReadPromise;
    assert.strictEqual(atomicReadResult.byteLength, newContentBuffer.byteLength);
  });
  test("writeFile (readable) - default", async () => {
    return testWriteFileReadable();
  });
  test("writeFile (readable) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testWriteFileReadable();
  });
  test("writeFile (readable) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testWriteFileReadable();
  });
  async function testWriteFileReadable() {
    const resource = URI.file(join(testDir, "small.txt"));
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const newContent = "Updates to the small file";
    await service.writeFile(resource, toLineByLineReadable(newContent));
    assert.strictEqual(readFileSync(resource.fsPath).toString(), newContent);
  }
  test("writeFile (large file - readable) - default", async () => {
    return testWriteFileLargeReadable();
  });
  test("writeFile (large file - readable) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testWriteFileLargeReadable();
  });
  test("writeFile (large file - readable) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testWriteFileLargeReadable();
  });
  async function testWriteFileLargeReadable() {
    const resource = URI.file(join(testDir, "lorem.txt"));
    const content = readFileSync(resource.fsPath);
    const newContent = content.toString() + content.toString();
    const fileStat = await service.writeFile(resource, toLineByLineReadable(newContent));
    assert.strictEqual(fileStat.name, "lorem.txt");
    assert.strictEqual(readFileSync(resource.fsPath).toString(), newContent);
  }
  test("writeFile (stream) - default", async () => {
    return testWriteFileStream();
  });
  test("writeFile (stream) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testWriteFileStream();
  });
  test("writeFile (stream) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testWriteFileStream();
  });
  async function testWriteFileStream() {
    const source = URI.file(join(testDir, "small.txt"));
    const target = URI.file(join(testDir, "small-copy.txt"));
    const fileStat = await service.writeFile(target, streamToBufferReadableStream(createReadStream(source.fsPath)));
    assert.strictEqual(fileStat.name, "small-copy.txt");
    const targetContents = readFileSync(target.fsPath).toString();
    assert.strictEqual(readFileSync(source.fsPath).toString(), targetContents);
  }
  test("writeFile (large file - stream) - default", async () => {
    return testWriteFileLargeStream();
  });
  test("writeFile (large file - stream) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testWriteFileLargeStream();
  });
  test("writeFile (large file - stream) - unbuffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testWriteFileLargeStream();
  });
  async function testWriteFileLargeStream() {
    const source = URI.file(join(testDir, "lorem.txt"));
    const target = URI.file(join(testDir, "lorem-copy.txt"));
    const fileStat = await service.writeFile(target, streamToBufferReadableStream(createReadStream(source.fsPath)));
    assert.strictEqual(fileStat.name, "lorem-copy.txt");
    const targetContents = readFileSync(target.fsPath).toString();
    assert.strictEqual(readFileSync(source.fsPath).toString(), targetContents);
  }
  test("writeFile (file is created including parents)", async () => {
    const resource = URI.file(join(testDir, "other", "newfile.txt"));
    const content = "File is created including parent";
    const fileStat = await service.writeFile(resource, VSBuffer.fromString(content));
    assert.strictEqual(fileStat.name, "newfile.txt");
    assert.strictEqual(readFileSync(resource.fsPath).toString(), content);
  });
  test("writeFile - locked files and unlocking", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileWriteUnlock);
    return testLockedFiles(false);
  });
  test("writeFile (stream) - locked files and unlocking", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileWriteUnlock);
    return testLockedFiles(false);
  });
  test("writeFile - locked files and unlocking throws error when missing capability", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite);
    return testLockedFiles(true);
  });
  test("writeFile (stream) - locked files and unlocking throws error when missing capability", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    return testLockedFiles(true);
  });
  async function testLockedFiles(expectError) {
    const lockedFile = URI.file(join(testDir, "my-locked-file"));
    const content = await service.writeFile(lockedFile, VSBuffer.fromString("Locked File"));
    assert.strictEqual(content.locked, false);
    const stats = await promises.stat(lockedFile.fsPath);
    await promises.chmod(lockedFile.fsPath, stats.mode & ~128);
    let stat = await service.stat(lockedFile);
    assert.strictEqual(stat.locked, true);
    let error;
    const newContent = "Updates to locked file";
    try {
      await service.writeFile(lockedFile, VSBuffer.fromString(newContent));
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    error = void 0;
    if (expectError) {
      try {
        await service.writeFile(lockedFile, VSBuffer.fromString(newContent), { unlock: true });
      } catch (e) {
        error = e;
      }
      assert.ok(error);
    } else {
      await service.writeFile(lockedFile, VSBuffer.fromString(newContent), { unlock: true });
      assert.strictEqual(readFileSync(lockedFile.fsPath).toString(), newContent);
      stat = await service.stat(lockedFile);
      assert.strictEqual(stat.locked, false);
    }
  }
  test("writeFile (error when folder is encountered)", async () => {
    const resource = URI.file(testDir);
    let error = void 0;
    try {
      await service.writeFile(resource, VSBuffer.fromString("File is created including parent"));
    } catch (err) {
      error = err;
    }
    assert.ok(error);
  });
  test("writeFile (no error when providing up to date etag)", async () => {
    const resource = URI.file(join(testDir, "small.txt"));
    const stat = await service.resolve(resource);
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const newContent = "Updates to the small file";
    await service.writeFile(resource, VSBuffer.fromString(newContent), { etag: stat.etag, mtime: stat.mtime });
    assert.strictEqual(readFileSync(resource.fsPath).toString(), newContent);
  });
  test("writeFile - error when writing to file that has been updated meanwhile", async () => {
    const resource = URI.file(join(testDir, "small.txt"));
    const stat = await service.resolve(resource);
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const newContent = "Updates to the small file";
    await service.writeFile(resource, VSBuffer.fromString(newContent), { etag: stat.etag, mtime: stat.mtime });
    const newContentLeadingToError = newContent + newContent;
    const fakeMtime = 1e3;
    const fakeSize = 1e3;
    let error = void 0;
    try {
      await service.writeFile(resource, VSBuffer.fromString(newContentLeadingToError), { etag: etag({ mtime: fakeMtime, size: fakeSize }), mtime: fakeMtime });
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.ok(error instanceof FileOperationError);
    assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_MODIFIED_SINCE);
  });
  test("writeFile - no error when writing to file where size is the same", async () => {
    const resource = URI.file(join(testDir, "small.txt"));
    const stat = await service.resolve(resource);
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const newContent = content;
    await service.writeFile(resource, VSBuffer.fromString(newContent), { etag: stat.etag, mtime: stat.mtime });
    const newContentLeadingToNoError = newContent;
    const fakeMtime = 1e3;
    const actualSize = newContent.length;
    let error = void 0;
    try {
      await service.writeFile(resource, VSBuffer.fromString(newContentLeadingToNoError), { etag: etag({ mtime: fakeMtime, size: actualSize }), mtime: fakeMtime });
    } catch (err) {
      error = err;
    }
    assert.ok(!error);
  });
  test("writeFile - no error when writing to file where content is the same", async () => {
    const resource = URI.file(join(testDir, "small.txt"));
    await service.resolve(resource);
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const newContent = content;
    let error = void 0;
    try {
      await service.writeFile(
        resource,
        VSBuffer.fromString(newContent),
        { etag: "anything", mtime: 0 }
        /* fake it */
      );
    } catch (err) {
      error = err;
    }
    assert.ok(!error);
  });
  test("writeFile - error when writing to file where content is the same length but different", async () => {
    const resource = URI.file(join(testDir, "small.txt"));
    await service.resolve(resource);
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const newContent = content.split("").reverse().join("");
    let error = void 0;
    try {
      await service.writeFile(
        resource,
        VSBuffer.fromString(newContent),
        { etag: "anything", mtime: 0 }
        /* fake it */
      );
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.ok(error instanceof FileOperationError);
    assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_MODIFIED_SINCE);
  });
  test("writeFile - no error when writing to same nonexistent folder multiple times different new files", async () => {
    const newFolder = URI.file(join(testDir, "some", "new", "folder"));
    const file1 = joinPath(newFolder, "file-1");
    const file2 = joinPath(newFolder, "file-2");
    const file3 = joinPath(newFolder, "file-3");
    const newContent = "Updates to the small file";
    await Promise.all([
      service.writeFile(file1, VSBuffer.fromString(newContent)),
      service.writeFile(file2, VSBuffer.fromString(newContent)),
      service.writeFile(file3, VSBuffer.fromString(newContent))
    ]);
    assert.ok(service.exists(file1));
    assert.ok(service.exists(file2));
    assert.ok(service.exists(file3));
  });
  test("writeFile - error when writing to folder that is a file", async () => {
    const existingFile = URI.file(join(testDir, "my-file"));
    await service.createFile(existingFile);
    const newFile = joinPath(existingFile, "file-1");
    let error;
    const newContent = "Updates to the small file";
    try {
      await service.writeFile(newFile, VSBuffer.fromString(newContent));
    } catch (e) {
      error = e;
    }
    assert.ok(error);
  });
  test("appendFile", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileAppend);
    return testAppendFile();
  });
  test("appendFile - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileAppend);
    return testAppendFile();
  });
  async function testAppendFile() {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const resource = URI.file(join(testDir, "small.txt"));
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const appendContent = " - Appended!";
    await service.writeFile(resource, VSBuffer.fromString(appendContent), { append: true });
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.WRITE);
    assert.strictEqual(readFileSync(resource.fsPath).toString(), "Small File - Appended!");
  }
  test("appendFile (readable)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileAppend);
    return testAppendFileReadable();
  });
  test("appendFile (readable) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileAppend);
    return testAppendFileReadable();
  });
  async function testAppendFileReadable() {
    const resource = URI.file(join(testDir, "small.txt"));
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const appendContent = " - Appended via readable!";
    await service.writeFile(resource, bufferToReadable(VSBuffer.fromString(appendContent)), { append: true });
    assert.strictEqual(readFileSync(resource.fsPath).toString(), "Small File - Appended via readable!");
  }
  test("appendFile (stream)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileAppend);
    return testAppendFileStream();
  });
  test("appendFile (stream) - buffered", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileAppend);
    return testAppendFileStream();
  });
  async function testAppendFileStream() {
    const resource = URI.file(join(testDir, "small.txt"));
    const content = readFileSync(resource.fsPath).toString();
    assert.strictEqual(content, "Small File");
    const appendContent = " - Appended via stream!";
    await service.writeFile(resource, bufferToStream(VSBuffer.fromString(appendContent)), { append: true });
    assert.strictEqual(readFileSync(resource.fsPath).toString(), "Small File - Appended via stream!");
  }
  test("appendFile - creates file if not exists", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileAppend);
    return testAppendFileCreatesFile();
  });
  test("appendFile - creates file if not exists (buffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileAppend);
    return testAppendFileCreatesFile();
  });
  async function testAppendFileCreatesFile() {
    const resource = URI.file(join(testDir, "appendfile-new.txt"));
    assert.strictEqual(existsSync(resource.fsPath), false);
    const content = "Initial content via append";
    await service.writeFile(resource, VSBuffer.fromString(content), { append: true });
    assert.strictEqual(existsSync(resource.fsPath), true);
    assert.strictEqual(readFileSync(resource.fsPath).toString(), content);
  }
  test("appendFile - multiple appends", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileAppend);
    return testAppendFileMultiple();
  });
  test("appendFile - multiple appends (buffered)", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileAppend);
    return testAppendFileMultiple();
  });
  async function testAppendFileMultiple() {
    const resource = URI.file(join(testDir, "appendfile-multiple.txt"));
    await service.writeFile(resource, VSBuffer.fromString("Line 1\n"), { append: true });
    await service.writeFile(resource, VSBuffer.fromString("Line 2\n"), { append: true });
    await service.writeFile(resource, VSBuffer.fromString("Line 3\n"), { append: true });
    assert.strictEqual(readFileSync(resource.fsPath).toString(), "Line 1\nLine 2\nLine 3\n");
  }
  test("appendFile - throws when provider does not support append", async () => {
    setCapabilities(fileProvider, FileSystemProviderCapabilities.FileOpenReadWriteClose);
    const resource = URI.file(join(testDir, "small.txt"));
    const appendContent = " - Appended via fallback!";
    let error;
    try {
      await service.writeFile(resource, VSBuffer.fromString(appendContent), { append: true });
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    assert.ok(error.message.includes("does not support append"));
  });
  test("read - mixed positions", async () => {
    const resource = URI.file(join(testDir, "lorem.txt"));
    let buffer = VSBuffer.alloc(1024);
    let fd = await fileProvider.open(resource, { create: false });
    for (let i = 0; i < 3; i++) {
      await fileProvider.read(fd, 0, buffer.buffer, 0, 26);
      assert.strictEqual(buffer.slice(0, 26).toString(), "Lorem ipsum dolor sit amet");
    }
    await fileProvider.close(fd);
    buffer = VSBuffer.alloc(1024);
    fd = await fileProvider.open(resource, { create: false });
    let posInFile = 0;
    await fileProvider.read(fd, posInFile, buffer.buffer, 0, 26);
    assert.strictEqual(buffer.slice(0, 26).toString(), "Lorem ipsum dolor sit amet");
    posInFile += 26;
    await fileProvider.read(fd, posInFile, buffer.buffer, 0, 1);
    assert.strictEqual(buffer.slice(0, 1).toString(), ",");
    posInFile += 1;
    await fileProvider.read(fd, posInFile, buffer.buffer, 0, 12);
    assert.strictEqual(buffer.slice(0, 12).toString(), " consectetur");
    posInFile += 12;
    await fileProvider.read(fd, 98, buffer.buffer, 0, 9);
    assert.strictEqual(buffer.slice(0, 9).toString(), "fermentum");
    await fileProvider.read(fd, 27, buffer.buffer, 0, 12);
    assert.strictEqual(buffer.slice(0, 12).toString(), " consectetur");
    await fileProvider.read(fd, 26, buffer.buffer, 0, 1);
    assert.strictEqual(buffer.slice(0, 1).toString(), ",");
    await fileProvider.read(fd, 0, buffer.buffer, 0, 26);
    assert.strictEqual(buffer.slice(0, 26).toString(), "Lorem ipsum dolor sit amet");
    await fileProvider.read(fd, posInFile, buffer.buffer, 0, 11);
    assert.strictEqual(buffer.slice(0, 11).toString(), " adipiscing");
    await fileProvider.close(fd);
  });
  test("write - mixed positions", async () => {
    const resource = URI.file(join(testDir, "lorem.txt"));
    const buffer = VSBuffer.alloc(1024);
    const fdWrite = await fileProvider.open(resource, { create: true, unlock: false });
    const fdRead = await fileProvider.open(resource, { create: false });
    let posInFileWrite = 0;
    let posInFileRead = 0;
    const initialContents = VSBuffer.fromString("Lorem ipsum dolor sit amet");
    await fileProvider.write(fdWrite, posInFileWrite, initialContents.buffer, 0, initialContents.byteLength);
    posInFileWrite += initialContents.byteLength;
    await fileProvider.read(fdRead, posInFileRead, buffer.buffer, 0, 26);
    assert.strictEqual(buffer.slice(0, 26).toString(), "Lorem ipsum dolor sit amet");
    posInFileRead += 26;
    const contents = VSBuffer.fromString("Hello World");
    await fileProvider.write(fdWrite, posInFileWrite, contents.buffer, 0, contents.byteLength);
    posInFileWrite += contents.byteLength;
    await fileProvider.read(fdRead, posInFileRead, buffer.buffer, 0, contents.byteLength);
    assert.strictEqual(buffer.slice(0, contents.byteLength).toString(), "Hello World");
    posInFileRead += contents.byteLength;
    await fileProvider.write(fdWrite, 6, contents.buffer, 0, contents.byteLength);
    await fileProvider.read(fdRead, 0, buffer.buffer, 0, 11);
    assert.strictEqual(buffer.slice(0, 11).toString(), "Lorem Hello");
    await fileProvider.write(fdWrite, posInFileWrite, contents.buffer, 0, contents.byteLength);
    posInFileWrite += contents.byteLength;
    await fileProvider.read(fdRead, posInFileWrite - contents.byteLength, buffer.buffer, 0, contents.byteLength);
    assert.strictEqual(buffer.slice(0, contents.byteLength).toString(), "Hello World");
    await fileProvider.close(fdWrite);
    await fileProvider.close(fdRead);
  });
  test("readonly - is handled properly for a single resource", async () => {
    fileProvider.setReadonly(true);
    const resource = URI.file(join(testDir, "index.html"));
    const resolveResult = await service.resolve(resource);
    assert.strictEqual(resolveResult.readonly, true);
    const readResult = await service.readFile(resource);
    assert.strictEqual(readResult.readonly, true);
    let writeFileError = void 0;
    try {
      await service.writeFile(resource, VSBuffer.fromString("Hello Test"));
    } catch (error) {
      writeFileError = error;
    }
    assert.ok(writeFileError);
    let deleteFileError = void 0;
    try {
      await service.del(resource);
    } catch (error) {
      deleteFileError = error;
    }
    assert.ok(deleteFileError);
  });
});
export {
  TestDiskFileSystemProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3Qvbm9kZS9kaXNrRmlsZVNlcnZpY2UuaW50ZWdyYXRpb25UZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgY3JlYXRlUmVhZFN0cmVhbSwgZXhpc3RzU3luYywgcmVhZGRpclN5bmMsIHJlYWRGaWxlU3luYywgc3RhdFN5bmMsIHdyaXRlRmlsZVN5bmMsIHByb21pc2VzIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGJ1ZmZlclRvUmVhZGFibGUsIGJ1ZmZlclRvU3RyZWFtLCBzdHJlYW1Ub0J1ZmZlciwgc3RyZWFtVG9CdWZmZXJSZWFkYWJsZVN0cmVhbSwgVlNCdWZmZXIsIFZTQnVmZmVyUmVhZGFibGUsIFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MsIFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCBqb2luLCBwb3NpeCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9ub2RlL3Bmcy5qcyc7XG5pbXBvcnQgeyBmbGFreVN1aXRlLCBnZXRSYW5kb21UZXN0UGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9ub2RlL3Rlc3RVdGlscy5qcyc7XG5pbXBvcnQgeyBldGFnLCBJRmlsZUF0b21pY1JlYWRPcHRpb25zLCBGaWxlT3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25FdmVudCwgRmlsZU9wZXJhdGlvblJlc3VsdCwgRmlsZVBlcm1pc3Npb24sIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcywgaGFzRmlsZUF0b21pY1JlYWRDYXBhYmlsaXR5LCBoYXNPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5LCBJRmlsZVN0YXQsIElGaWxlU3RhdFdpdGhNZXRhZGF0YSwgSVJlYWRGaWxlT3B0aW9ucywgSVN0YXQsIE5vdE1vZGlmaWVkU2luY2VGaWxlT3BlcmF0aW9uRXJyb3IsIFRvb0xhcmdlRmlsZU9wZXJhdGlvbkVycm9yLCBJRmlsZUF0b21pY09wdGlvbnMgfSBmcm9tICcuLi8uLi9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRGlza0ZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uL25vZGUvZGlza0ZpbGVTeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcblxuZnVuY3Rpb24gZ2V0QnlOYW1lKHJvb3Q6IElGaWxlU3RhdCwgbmFtZTogc3RyaW5nKTogSUZpbGVTdGF0IHwgdW5kZWZpbmVkIHtcblx0aWYgKHJvb3QuY2hpbGRyZW4gPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZXR1cm4gcm9vdC5jaGlsZHJlbi5maW5kKGNoaWxkID0+IGNoaWxkLm5hbWUgPT09IG5hbWUpO1xufVxuXG5mdW5jdGlvbiB0b0xpbmVCeUxpbmVSZWFkYWJsZShjb250ZW50OiBzdHJpbmcpOiBWU0J1ZmZlclJlYWRhYmxlIHtcblx0bGV0IGNodW5rcyA9IGNvbnRlbnQuc3BsaXQoJ1xcbicpO1xuXHRjaHVua3MgPSBjaHVua3MubWFwKChjaHVuaywgaW5kZXgpID0+IHtcblx0XHRpZiAoaW5kZXggPT09IDApIHtcblx0XHRcdHJldHVybiBjaHVuaztcblx0XHR9XG5cblx0XHRyZXR1cm4gJ1xcbicgKyBjaHVuaztcblx0fSk7XG5cblx0cmV0dXJuIHtcblx0XHRyZWFkKCk6IFZTQnVmZmVyIHwgbnVsbCB7XG5cdFx0XHRjb25zdCBjaHVuayA9IGNodW5rcy5zaGlmdCgpO1xuXHRcdFx0aWYgKHR5cGVvZiBjaHVuayA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuIFZTQnVmZmVyLmZyb21TdHJpbmcoY2h1bmspO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdH07XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0RGlza0ZpbGVTeXN0ZW1Qcm92aWRlciBleHRlbmRzIERpc2tGaWxlU3lzdGVtUHJvdmlkZXIge1xuXG5cdHRvdGFsQnl0ZXNSZWFkOiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgaW52YWxpZFN0YXRTaXplOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgc21hbGxTdGF0U2l6ZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5OiBib29sZWFuID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBfdGVzdENhcGFiaWxpdGllcyE6IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcztcblx0b3ZlcnJpZGUgZ2V0IGNhcGFiaWxpdGllcygpOiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMge1xuXHRcdGlmICghdGhpcy5fdGVzdENhcGFiaWxpdGllcykge1xuXHRcdFx0dGhpcy5fdGVzdENhcGFiaWxpdGllcyA9XG5cdFx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlIHxcblx0XHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UgfFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRTdHJlYW0gfFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuVHJhc2ggfFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUZvbGRlckNvcHkgfFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVdyaXRlVW5sb2NrIHxcblx0XHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBdG9taWNSZWFkIHxcblx0XHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBdG9taWNXcml0ZSB8XG5cdFx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQXRvbWljRGVsZXRlIHxcblx0XHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVDbG9uZSB8XG5cdFx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQXBwZW5kIHxcblx0XHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFscGF0aDtcblxuXHRcdFx0aWYgKGlzTGludXgpIHtcblx0XHRcdFx0dGhpcy5fdGVzdENhcGFiaWxpdGllcyB8PSBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUGF0aENhc2VTZW5zaXRpdmU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3Rlc3RDYXBhYmlsaXRpZXM7XG5cdH1cblxuXHRvdmVycmlkZSBzZXQgY2FwYWJpbGl0aWVzKGNhcGFiaWxpdGllczogRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzKSB7XG5cdFx0dGhpcy5fdGVzdENhcGFiaWxpdGllcyA9IGNhcGFiaWxpdGllcztcblx0fVxuXG5cdHNldEludmFsaWRTdGF0U2l6ZShlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5pbnZhbGlkU3RhdFNpemUgPSBlbmFibGVkO1xuXHR9XG5cblx0c2V0U21hbGxTdGF0U2l6ZShlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5zbWFsbFN0YXRTaXplID0gZW5hYmxlZDtcblx0fVxuXG5cdHNldFJlYWRvbmx5KHJlYWRvbmx5OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5yZWFkb25seSA9IHJlYWRvbmx5O1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc3RhdChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJU3RhdD4ge1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHN1cGVyLnN0YXQocmVzb3VyY2UpO1xuXG5cdFx0aWYgKHRoaXMuaW52YWxpZFN0YXRTaXplKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdChyZXMgYXMgYW55KS5zaXplID0gU3RyaW5nKHJlcy5zaXplKSBhcyBhbnk7IC8vIGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNzI5MDlcblx0XHR9IGVsc2UgaWYgKHRoaXMuc21hbGxTdGF0U2l6ZSkge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHQocmVzIGFzIGFueSkuc2l6ZSA9IDE7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnJlYWRvbmx5KSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdChyZXMgYXMgYW55KS5wZXJtaXNzaW9ucyA9IEZpbGVQZXJtaXNzaW9uLlJlYWRvbmx5O1xuXHRcdH1cblxuXHRcdHJldHVybiByZXM7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyByZWFkKGZkOiBudW1iZXIsIHBvczogbnVtYmVyLCBkYXRhOiBVaW50OEFycmF5LCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGNvbnN0IGJ5dGVzUmVhZCA9IGF3YWl0IHN1cGVyLnJlYWQoZmQsIHBvcywgZGF0YSwgb2Zmc2V0LCBsZW5ndGgpO1xuXG5cdFx0dGhpcy50b3RhbEJ5dGVzUmVhZCArPSBieXRlc1JlYWQ7XG5cblx0XHRyZXR1cm4gYnl0ZXNSZWFkO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElGaWxlQXRvbWljUmVhZE9wdGlvbnMpOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHtcblx0XHRjb25zdCByZXMgPSBhd2FpdCBzdXBlci5yZWFkRmlsZShyZXNvdXJjZSwgb3B0aW9ucyk7XG5cblx0XHR0aGlzLnRvdGFsQnl0ZXNSZWFkICs9IHJlcy5ieXRlTGVuZ3RoO1xuXG5cdFx0cmV0dXJuIHJlcztcblx0fVxufVxuXG5EaXNrRmlsZVN5c3RlbVByb3ZpZGVyLmNvbmZpZ3VyZUZsdXNoT25Xcml0ZShmYWxzZSk7IC8vIHNwZWVkIHVwIGFsbCB1bml0IHRlc3RzIGJ5IGRpc2FibGluZyBmbHVzaCBvbiB3cml0ZVxuXG5mbGFreVN1aXRlKCdEaXNrIEZpbGUgU2VydmljZScsIGZ1bmN0aW9uICgpIHtcblxuXHRjb25zdCB0ZXN0U2NoZW1hID0gJ3Rlc3QnO1xuXG5cdGxldCBzZXJ2aWNlOiBGaWxlU2VydmljZTtcblx0bGV0IGZpbGVQcm92aWRlcjogVGVzdERpc2tGaWxlU3lzdGVtUHJvdmlkZXI7XG5cdGxldCB0ZXN0UHJvdmlkZXI6IFRlc3REaXNrRmlsZVN5c3RlbVByb3ZpZGVyO1xuXG5cdGxldCB0ZXN0RGlyOiBzdHJpbmc7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblxuXHRcdHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKGxvZ1NlcnZpY2UpKTtcblxuXHRcdGZpbGVQcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdERpc2tGaWxlU3lzdGVtUHJvdmlkZXIobG9nU2VydmljZSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5maWxlLCBmaWxlUHJvdmlkZXIpKTtcblxuXHRcdHRlc3RQcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdERpc2tGaWxlU3lzdGVtUHJvdmlkZXIobG9nU2VydmljZSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIodGVzdFNjaGVtYSwgdGVzdFByb3ZpZGVyKSk7XG5cblx0XHR0ZXN0RGlyID0gZ2V0UmFuZG9tVGVzdFBhdGgodG1wZGlyKCksICd2c2N0ZXN0cycsICdkaXNrZmlsZXNlcnZpY2UnKTtcblxuXHRcdGNvbnN0IHNvdXJjZURpciA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy9wbGF0Zm9ybS9maWxlcy90ZXN0L25vZGUvZml4dHVyZXMvc2VydmljZScpLmZzUGF0aDtcblxuXHRcdGF3YWl0IFByb21pc2VzLmNvcHkoc291cmNlRGlyLCB0ZXN0RGlyLCB7IHByZXNlcnZlU3ltbGlua3M6IGZhbHNlIH0pO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdHJldHVybiBQcm9taXNlcy5ybSh0ZXN0RGlyKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlRm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50IHwgdW5kZWZpbmVkO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoVVJJLmZpbGUodGVzdERpcikpO1xuXG5cdFx0Y29uc3QgbmV3Rm9sZGVyUmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHBhcmVudC5yZXNvdXJjZS5mc1BhdGgsICduZXdGb2xkZXInKSk7XG5cblx0XHRjb25zdCBuZXdGb2xkZXIgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUZvbGRlcihuZXdGb2xkZXJSZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3Rm9sZGVyLm5hbWUsICduZXdGb2xkZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhuZXdGb2xkZXIucmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQub2soZXZlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5yZXNvdXJjZS5mc1BhdGgsIG5ld0ZvbGRlclJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Lm9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbi5DUkVBVEUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50YXJnZXQhLnJlc291cmNlLmZzUGF0aCwgbmV3Rm9sZGVyUmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQudGFyZ2V0IS5pc0RpcmVjdG9yeSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUZvbGRlcjogY3JlYXRpbmcgbXVsdGlwbGUgZm9sZGVycyBhdCBvbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRjb25zdCBtdWx0aUZvbGRlclBhdGhzID0gWydhJywgJ2NvdXBsZScsICdvZicsICdmb2xkZXJzJ107XG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKFVSSS5maWxlKHRlc3REaXIpKTtcblxuXHRcdGNvbnN0IG5ld0ZvbGRlclJlc291cmNlID0gVVJJLmZpbGUoam9pbihwYXJlbnQucmVzb3VyY2UuZnNQYXRoLCAuLi5tdWx0aUZvbGRlclBhdGhzKSk7XG5cblx0XHRjb25zdCBuZXdGb2xkZXIgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUZvbGRlcihuZXdGb2xkZXJSZXNvdXJjZSk7XG5cblx0XHRjb25zdCBsYXN0Rm9sZGVyTmFtZSA9IG11bHRpRm9sZGVyUGF0aHNbbXVsdGlGb2xkZXJQYXRocy5sZW5ndGggLSAxXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3Rm9sZGVyLm5hbWUsIGxhc3RGb2xkZXJOYW1lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhuZXdGb2xkZXIucmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQub2soZXZlbnQhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnJlc291cmNlLmZzUGF0aCwgbmV3Rm9sZGVyUmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLm9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbi5DUkVBVEUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEudGFyZ2V0IS5yZXNvdXJjZS5mc1BhdGgsIG5ld0ZvbGRlclJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS50YXJnZXQhLmlzRGlyZWN0b3J5LCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBleGlzdHMgPSBhd2FpdCBzZXJ2aWNlLmV4aXN0cyhVUkkuZmlsZSh0ZXN0RGlyKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0cywgdHJ1ZSk7XG5cblx0XHRleGlzdHMgPSBhd2FpdCBzZXJ2aWNlLmV4aXN0cyhVUkkuZmlsZSh0ZXN0RGlyICsgJ3NvbWV0aGluZycpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgLSBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3Qvbm9kZS9maXh0dXJlcy9yZXNvbHZlci9pbmRleC5odG1sJyk7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLm5hbWUsICdpbmRleC5odG1sJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmlzRmlsZSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmlzRGlyZWN0b3J5LCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLnJlYWRvbmx5LCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmlzU3ltYm9saWNMaW5rLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLnJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5jaGlsZHJlbiwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2socmVzb2x2ZWQubXRpbWUhID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc29sdmVkLmN0aW1lISA+IDApO1xuXHRcdGFzc2VydC5vayhyZXNvbHZlZC5zaXplISA+IDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIC0gZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RzRWxlbWVudHMgPSBbJ2V4YW1wbGVzJywgJ290aGVyJywgJ2luZGV4Lmh0bWwnLCAnc2l0ZS5jc3MnXTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3Qvbm9kZS9maXh0dXJlcy9yZXNvbHZlcicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShyZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubmFtZSwgJ3Jlc29sdmVyJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5jaGlsZHJlbik7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5jaGlsZHJlbi5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmlzRGlyZWN0b3J5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnJlYWRvbmx5LCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5tdGltZSEgPiAwKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmN0aW1lISA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY2hpbGRyZW4ubGVuZ3RoLCB0ZXN0c0VsZW1lbnRzLmxlbmd0aCk7XG5cblx0XHRhc3NlcnQub2socmVzdWx0LmNoaWxkcmVuLmV2ZXJ5KGVudHJ5ID0+IHtcblx0XHRcdHJldHVybiB0ZXN0c0VsZW1lbnRzLnNvbWUobmFtZSA9PiB7XG5cdFx0XHRcdHJldHVybiBiYXNlbmFtZShlbnRyeS5yZXNvdXJjZS5mc1BhdGgpID09PSBuYW1lO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0cmVzdWx0LmNoaWxkcmVuLmZvckVhY2godmFsdWUgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKGJhc2VuYW1lKHZhbHVlLnJlc291cmNlLmZzUGF0aCkpO1xuXHRcdFx0aWYgKFsnZXhhbXBsZXMnLCAnb3RoZXInXS5pbmRleE9mKGJhc2VuYW1lKHZhbHVlLnJlc291cmNlLmZzUGF0aCkpID49IDApIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmlzRGlyZWN0b3J5KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLm10aW1lLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuY3RpbWUsIHVuZGVmaW5lZCk7XG5cdFx0XHR9IGVsc2UgaWYgKGJhc2VuYW1lKHZhbHVlLnJlc291cmNlLmZzUGF0aCkgPT09ICdpbmRleC5odG1sJykge1xuXHRcdFx0XHRhc3NlcnQub2soIXZhbHVlLmlzRGlyZWN0b3J5KTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCF2YWx1ZS5jaGlsZHJlbik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5tdGltZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmN0aW1lLCB1bmRlZmluZWQpO1xuXHRcdFx0fSBlbHNlIGlmIChiYXNlbmFtZSh2YWx1ZS5yZXNvdXJjZS5mc1BhdGgpID09PSAnc2l0ZS5jc3MnKSB7XG5cdFx0XHRcdGFzc2VydC5vayghdmFsdWUuaXNEaXJlY3RvcnkpO1xuXHRcdFx0XHRhc3NlcnQub2soIXZhbHVlLmNoaWxkcmVuKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLm10aW1lLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuY3RpbWUsIHVuZGVmaW5lZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhc3NlcnQuZmFpbCgnVW5leHBlY3RlZCB2YWx1ZSAnICsgYmFzZW5hbWUodmFsdWUucmVzb3VyY2UuZnNQYXRoKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgLSBkaXJlY3RvcnkgLSB3aXRoIG1ldGFkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RzRWxlbWVudHMgPSBbJ2V4YW1wbGVzJywgJ290aGVyJywgJ2luZGV4Lmh0bWwnLCAnc2l0ZS5jc3MnXTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvcGxhdGZvcm0vZmlsZXMvdGVzdC9ub2RlL2ZpeHR1cmVzL3Jlc29sdmVyJyksIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5uYW1lLCAncmVzb2x2ZXInKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmNoaWxkcmVuKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmNoaWxkcmVuLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaXNEaXJlY3RvcnkpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQubXRpbWUgPiAwKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmN0aW1lID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jaGlsZHJlbi5sZW5ndGgsIHRlc3RzRWxlbWVudHMubGVuZ3RoKTtcblxuXHRcdGFzc2VydC5vayhyZXN1bHQuY2hpbGRyZW4uZXZlcnkoZW50cnkgPT4ge1xuXHRcdFx0cmV0dXJuIHRlc3RzRWxlbWVudHMuc29tZShuYW1lID0+IHtcblx0XHRcdFx0cmV0dXJuIGJhc2VuYW1lKGVudHJ5LnJlc291cmNlLmZzUGF0aCkgPT09IG5hbWU7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQub2socmVzdWx0LmNoaWxkcmVuLmV2ZXJ5KGVudHJ5ID0+IGVudHJ5LmV0YWcubGVuZ3RoID4gMCkpO1xuXG5cdFx0cmVzdWx0LmNoaWxkcmVuLmZvckVhY2godmFsdWUgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKGJhc2VuYW1lKHZhbHVlLnJlc291cmNlLmZzUGF0aCkpO1xuXHRcdFx0aWYgKFsnZXhhbXBsZXMnLCAnb3RoZXInXS5pbmRleE9mKGJhc2VuYW1lKHZhbHVlLnJlc291cmNlLmZzUGF0aCkpID49IDApIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmlzRGlyZWN0b3J5KTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLm10aW1lID4gMCk7XG5cdFx0XHRcdGFzc2VydC5vayh2YWx1ZS5jdGltZSA+IDApO1xuXHRcdFx0fSBlbHNlIGlmIChiYXNlbmFtZSh2YWx1ZS5yZXNvdXJjZS5mc1BhdGgpID09PSAnaW5kZXguaHRtbCcpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKCF2YWx1ZS5pc0RpcmVjdG9yeSk7XG5cdFx0XHRcdGFzc2VydC5vayghdmFsdWUuY2hpbGRyZW4pO1xuXHRcdFx0XHRhc3NlcnQub2sodmFsdWUubXRpbWUgPiAwKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmN0aW1lID4gMCk7XG5cdFx0XHR9IGVsc2UgaWYgKGJhc2VuYW1lKHZhbHVlLnJlc291cmNlLmZzUGF0aCkgPT09ICdzaXRlLmNzcycpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKCF2YWx1ZS5pc0RpcmVjdG9yeSk7XG5cdFx0XHRcdGFzc2VydC5vayghdmFsdWUuY2hpbGRyZW4pO1xuXHRcdFx0XHRhc3NlcnQub2sodmFsdWUubXRpbWUgPiAwKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmN0aW1lID4gMCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhc3NlcnQuZmFpbCgnVW5leHBlY3RlZCB2YWx1ZSAnICsgYmFzZW5hbWUodmFsdWUucmVzb3VyY2UuZnNQYXRoKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgLSBkaXJlY3Rvcnkgd2l0aCByZXNvbHZlVG8nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoVVJJLmZpbGUodGVzdERpciksIHsgcmVzb2x2ZVRvOiBbVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnZGVlcCcpKV0gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmNoaWxkcmVuIS5sZW5ndGgsIDgpO1xuXG5cdFx0Y29uc3QgZGVlcCA9IChnZXRCeU5hbWUocmVzb2x2ZWQsICdkZWVwJykhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVlcC5jaGlsZHJlbiEubGVuZ3RoLCA0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSAtIGRpcmVjdG9yeSAtIHJlc29sdmVUbyBzaW5nbGUgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc29sdmVyRml4dHVyZXNQYXRoID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3Qvbm9kZS9maXh0dXJlcy9yZXNvbHZlcicpLmZzUGF0aDtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoVVJJLmZpbGUocmVzb2x2ZXJGaXh0dXJlc1BhdGgpLCB7IHJlc29sdmVUbzogW1VSSS5maWxlKGpvaW4ocmVzb2x2ZXJGaXh0dXJlc1BhdGgsICdvdGhlci9kZWVwJykpXSB9KTtcblxuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuY2hpbGRyZW4pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuY2hpbGRyZW4ubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pc0RpcmVjdG9yeSk7XG5cblx0XHRjb25zdCBjaGlsZHJlbiA9IHJlc3VsdC5jaGlsZHJlbjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hpbGRyZW4ubGVuZ3RoLCA0KTtcblxuXHRcdGNvbnN0IG90aGVyID0gZ2V0QnlOYW1lKHJlc3VsdCwgJ290aGVyJyk7XG5cdFx0YXNzZXJ0Lm9rKG90aGVyKTtcblx0XHRhc3NlcnQub2sob3RoZXIuY2hpbGRyZW4hLmxlbmd0aCA+IDApO1xuXG5cdFx0Y29uc3QgZGVlcCA9IGdldEJ5TmFtZShvdGhlciwgJ2RlZXAnKTtcblx0XHRhc3NlcnQub2soZGVlcCk7XG5cdFx0YXNzZXJ0Lm9rKGRlZXAuY2hpbGRyZW4hLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWVwLmNoaWxkcmVuIS5sZW5ndGgsIDQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIGRpcmVjdG9yeSAtIHJlc29sdmVUbyBtdWx0aXBsZSBkaXJlY3RvcmllcycsICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdFJlc29sdmVEaXJlY3RvcnlXaXRoVGFyZ2V0KGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSBkaXJlY3RvcnkgLSByZXNvbHZlVG8gd2l0aCBhIFVSSSB0aGF0IGhhcyBxdWVyeSBwYXJhbWV0ZXIgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMjgxNTEpJywgKCkgPT4ge1xuXHRcdHJldHVybiB0ZXN0UmVzb2x2ZURpcmVjdG9yeVdpdGhUYXJnZXQodHJ1ZSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RSZXNvbHZlRGlyZWN0b3J5V2l0aFRhcmdldCh3aXRoUXVlcnlQYXJhbTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc29sdmVyRml4dHVyZXNQYXRoID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3Qvbm9kZS9maXh0dXJlcy9yZXNvbHZlcicpLmZzUGF0aDtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoVVJJLmZpbGUocmVzb2x2ZXJGaXh0dXJlc1BhdGgpLndpdGgoeyBxdWVyeTogd2l0aFF1ZXJ5UGFyYW0gPyAndGVzdCcgOiB1bmRlZmluZWQgfSksIHtcblx0XHRcdHJlc29sdmVUbzogW1xuXHRcdFx0XHRVUkkuZmlsZShqb2luKHJlc29sdmVyRml4dHVyZXNQYXRoLCAnb3RoZXIvZGVlcCcpKS53aXRoKHsgcXVlcnk6IHdpdGhRdWVyeVBhcmFtID8gJ3Rlc3QnIDogdW5kZWZpbmVkIH0pLFxuXHRcdFx0XHRVUkkuZmlsZShqb2luKHJlc29sdmVyRml4dHVyZXNQYXRoLCAnZXhhbXBsZXMnKSkud2l0aCh7IHF1ZXJ5OiB3aXRoUXVlcnlQYXJhbSA/ICd0ZXN0JyA6IHVuZGVmaW5lZCB9KVxuXHRcdFx0XVxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5jaGlsZHJlbik7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5jaGlsZHJlbi5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmlzRGlyZWN0b3J5KTtcblxuXHRcdGNvbnN0IGNoaWxkcmVuID0gcmVzdWx0LmNoaWxkcmVuO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZHJlbi5sZW5ndGgsIDQpO1xuXG5cdFx0Y29uc3Qgb3RoZXIgPSBnZXRCeU5hbWUocmVzdWx0LCAnb3RoZXInKTtcblx0XHRhc3NlcnQub2sob3RoZXIpO1xuXHRcdGFzc2VydC5vayhvdGhlci5jaGlsZHJlbiEubGVuZ3RoID4gMCk7XG5cblx0XHRjb25zdCBkZWVwID0gZ2V0QnlOYW1lKG90aGVyLCAnZGVlcCcpO1xuXHRcdGFzc2VydC5vayhkZWVwKTtcblx0XHRhc3NlcnQub2soZGVlcC5jaGlsZHJlbiEubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZXAuY2hpbGRyZW4hLmxlbmd0aCwgNCk7XG5cblx0XHRjb25zdCBleGFtcGxlcyA9IGdldEJ5TmFtZShyZXN1bHQsICdleGFtcGxlcycpO1xuXHRcdGFzc2VydC5vayhleGFtcGxlcyk7XG5cdFx0YXNzZXJ0Lm9rKGV4YW1wbGVzLmNoaWxkcmVuIS5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhhbXBsZXMuY2hpbGRyZW4hLmxlbmd0aCwgNCk7XG5cdH1cblxuXHR0ZXN0KCdyZXNvbHZlIGRpcmVjdG9yeSAtIHJlc29sdmVTaW5nbGVDaGlsZEZvbGRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb2x2ZXJGaXh0dXJlc1BhdGggPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvcGxhdGZvcm0vZmlsZXMvdGVzdC9ub2RlL2ZpeHR1cmVzL3Jlc29sdmVyL290aGVyJykuZnNQYXRoO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShVUkkuZmlsZShyZXNvbHZlckZpeHR1cmVzUGF0aCksIHsgcmVzb2x2ZVNpbmdsZUNoaWxkRGVzY2VuZGFudHM6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRhc3NlcnQub2socmVzdWx0LmNoaWxkcmVuKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmNoaWxkcmVuLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaXNEaXJlY3RvcnkpO1xuXG5cdFx0Y29uc3QgY2hpbGRyZW4gPSByZXN1bHQuY2hpbGRyZW47XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoaWxkcmVuLmxlbmd0aCwgMSk7XG5cblx0XHRjb25zdCBkZWVwID0gZ2V0QnlOYW1lKHJlc3VsdCwgJ2RlZXAnKTtcblx0XHRhc3NlcnQub2soZGVlcCk7XG5cdFx0YXNzZXJ0Lm9rKGRlZXAuY2hpbGRyZW4hLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWVwLmNoaWxkcmVuIS5sZW5ndGgsIDQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXMgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVBbGwoW1xuXHRcdFx0eyByZXNvdXJjZTogVVJJLmZpbGUodGVzdERpciksIG9wdGlvbnM6IHsgcmVzb2x2ZVRvOiBbVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnZGVlcCcpKV0gfSB9LFxuXHRcdFx0eyByZXNvdXJjZTogVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnZGVlcCcpKSB9XG5cdFx0XSk7XG5cblx0XHRjb25zdCByMSA9IChyZXNbMF0uc3RhdCEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyMS5jaGlsZHJlbiEubGVuZ3RoLCA4KTtcblxuXHRcdGNvbnN0IGRlZXAgPSAoZ2V0QnlOYW1lKHIxLCAnZGVlcCcpISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZXAuY2hpbGRyZW4hLmxlbmd0aCwgNCk7XG5cblx0XHRjb25zdCByMiA9IChyZXNbMV0uc3RhdCEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyMi5jaGlsZHJlbiEubGVuZ3RoLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocjIubmFtZSwgJ2RlZXAnKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSAvIHJlYWxwYXRoIC0gZm9sZGVyIHN5bWJvbGljIGxpbmsnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGluayA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2RlZXAtbGluaycpKTtcblx0XHRhd2FpdCBwcm9taXNlcy5zeW1saW5rKGpvaW4odGVzdERpciwgJ2RlZXAnKSwgbGluay5mc1BhdGgsICdqdW5jdGlvbicpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUobGluayk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmNoaWxkcmVuIS5sZW5ndGgsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5pc0RpcmVjdG9yeSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmlzU3ltYm9saWNMaW5rLCB0cnVlKTtcblxuXHRcdGNvbnN0IHJlYWxwYXRoID0gYXdhaXQgc2VydmljZS5yZWFscGF0aChsaW5rKTtcblx0XHRhc3NlcnQub2socmVhbHBhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbmFtZShyZWFscGF0aC5mc1BhdGgpLCAnZGVlcCcpO1xuXHR9KTtcblxuXHQoaXNXaW5kb3dzID8gdGVzdC5za2lwIC8qIHdpbmRvd3M6IGNhbm5vdCBjcmVhdGUgZmlsZSBzeW1ib2xpYyBsaW5rIHdpdGhvdXQgZWxldmF0ZWQgY29udGV4dCAqLyA6IHRlc3QpKCdyZXNvbHZlIC0gZmlsZSBzeW1ib2xpYyBsaW5rJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmsgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQtbGlua2VkJykpO1xuXHRcdGF3YWl0IHByb21pc2VzLnN5bWxpbmsoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JyksIGxpbmsuZnNQYXRoKTtcblxuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKGxpbmspO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5pc0RpcmVjdG9yeSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5pc1N5bWJvbGljTGluaywgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgLSBzeW1ib2xpYyBsaW5rIHBvaW50aW5nIHRvIG5vbmV4aXN0ZW50IGZpbGUgZG9lcyBub3QgYnJlYWsnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcHJvbWlzZXMuc3ltbGluayhqb2luKHRlc3REaXIsICdmb28nKSwgam9pbih0ZXN0RGlyLCAnYmFyJyksICdqdW5jdGlvbicpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoVVJJLmZpbGUodGVzdERpcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5pc0RpcmVjdG9yeSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmNoaWxkcmVuIS5sZW5ndGgsIDkpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWRMaW5rID0gcmVzb2x2ZWQuY2hpbGRyZW4/LmZpbmQoY2hpbGQgPT4gY2hpbGQubmFtZSA9PT0gJ2JhcicgJiYgY2hpbGQuaXNTeW1ib2xpY0xpbmspO1xuXHRcdGFzc2VydC5vayhyZXNvbHZlZExpbmspO1xuXG5cdFx0YXNzZXJ0Lm9rKCFyZXNvbHZlZExpbms/LmlzRGlyZWN0b3J5KTtcblx0XHRhc3NlcnQub2soIXJlc29sdmVkTGluaz8uaXNGaWxlKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhdCAtIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvcGxhdGZvcm0vZmlsZXMvdGVzdC9ub2RlL2ZpeHR1cmVzL3Jlc29sdmVyL2luZGV4Lmh0bWwnKTtcblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHNlcnZpY2Uuc3RhdChyZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQubmFtZSwgJ2luZGV4Lmh0bWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQuaXNGaWxlLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQuaXNEaXJlY3RvcnksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQucmVhZG9ubHksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQuaXNTeW1ib2xpY0xpbmssIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQucmVzb3VyY2UudG9TdHJpbmcoKSwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc29sdmVkLm10aW1lID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc29sdmVkLmN0aW1lID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc29sdmVkLnNpemUgPiAwKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhdCAtIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy9wbGF0Zm9ybS9maWxlcy90ZXN0L25vZGUvZml4dHVyZXMvcmVzb2x2ZXInKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnN0YXQocmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZXNvdXJjZS50b1N0cmluZygpLCByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm5hbWUsICdyZXNvbHZlcicpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaXNEaXJlY3RvcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucmVhZG9ubHksIGZhbHNlKTtcblx0XHRhc3NlcnQub2socmVzdWx0Lm10aW1lID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5jdGltZSA+IDApO1xuXHR9KTtcblxuXHQvLyBUaGUgZXhlY3V0YWJsZSBiaXQgZG9lcyBub3QgZXhpc3Qgb24gV2luZG93cyBzbyB1c2UgYSBjb25kaXRpb24gbm90IHNraXBcblx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHR0ZXN0KCdzdGF0IC0gZXhlY3V0YWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG5vbkV4ZWN1dGFibGUgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvcGxhdGZvcm0vZmlsZXMvdGVzdC9ub2RlL2ZpeHR1cmVzL2V4ZWN1dGFibGUvbm9uX2V4ZWN1dGFibGUnKTtcblx0XHRcdGxldCByZXNvbHZlZCA9IGF3YWl0IHNlcnZpY2Uuc3RhdChub25FeGVjdXRhYmxlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5pc0ZpbGUsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmV4ZWN1dGFibGUsIGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgZXhlY3V0YWJsZSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy9wbGF0Zm9ybS9maWxlcy90ZXN0L25vZGUvZml4dHVyZXMvZXhlY3V0YWJsZS9leGVjdXRhYmxlJyk7XG5cdFx0XHRyZXNvbHZlZCA9IGF3YWl0IHNlcnZpY2Uuc3RhdChleGVjdXRhYmxlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5pc0ZpbGUsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmV4ZWN1dGFibGUsIHRydWUpO1xuXHRcdH0pO1xuXHR9XG5cblx0dGVzdCgnZGVsZXRlRmlsZSAobm9uIHJlY3Vyc2l2ZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3REZWxldGVGaWxlKGZhbHNlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUZpbGUgKHJlY3Vyc2l2ZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3REZWxldGVGaWxlKGZhbHNlLCB0cnVlKTtcblx0fSk7XG5cblx0KGlzTGludXggLyogdHJhc2ggaXMgdW5yZWxpYWJsZSBvbiBMaW51eCAqLyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdkZWxldGVGaWxlICh1c2VUcmFzaCknLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3REZWxldGVGaWxlKHRydWUsIGZhbHNlKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdERlbGV0ZUZpbGUodXNlVHJhc2g6IGJvb2xlYW4sIHJlY3Vyc2l2ZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2RlZXAnLCAnY29ud2F5LmpzJykpO1xuXHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShyZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jYW5EZWxldGUoc291cmNlLnJlc291cmNlLCB7IHVzZVRyYXNoLCByZWN1cnNpdmUgfSksIHRydWUpO1xuXHRcdGF3YWl0IHNlcnZpY2UuZGVsKHNvdXJjZS5yZXNvdXJjZSwgeyB1c2VUcmFzaCwgcmVjdXJzaXZlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMoc291cmNlLnJlc291cmNlLmZzUGF0aCksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5vayhldmVudCEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEucmVzb3VyY2UuZnNQYXRoLCByZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkRFTEVURSk7XG5cblx0XHRsZXQgZXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmRlbChzb3VyY2UucmVzb3VyY2UsIHsgdXNlVHJhc2gsIHJlY3Vyc2l2ZSB9KTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRlcnJvciA9IGU7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxGaWxlT3BlcmF0aW9uRXJyb3I+ZXJyb3IpLmZpbGVPcGVyYXRpb25SZXN1bHQsIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpO1xuXHR9XG5cblx0KGlzV2luZG93cyA/IHRlc3Quc2tpcCAvKiB3aW5kb3dzOiBjYW5ub3QgY3JlYXRlIGZpbGUgc3ltYm9saWMgbGluayB3aXRob3V0IGVsZXZhdGVkIGNvbnRleHQgKi8gOiB0ZXN0KSgnZGVsZXRlRmlsZSAtIHN5bWJvbGljIGxpbmsgKGV4aXN0cyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpO1xuXHRcdGNvbnN0IGxpbmsgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQtbGlua2VkJykpO1xuXHRcdGF3YWl0IHByb21pc2VzLnN5bWxpbmsodGFyZ2V0LmZzUGF0aCwgbGluay5mc1BhdGgpO1xuXG5cdFx0Y29uc3Qgc291cmNlID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKGxpbmspO1xuXG5cdFx0bGV0IGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiBldmVudCA9IGUpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNhbkRlbGV0ZShzb3VyY2UucmVzb3VyY2UpLCB0cnVlKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmRlbChzb3VyY2UucmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMoc291cmNlLnJlc291cmNlLmZzUGF0aCksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5vayhldmVudCEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEucmVzb3VyY2UuZnNQYXRoLCBsaW5rLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5vcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uREVMRVRFKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHRhcmdldC5mc1BhdGgpLCB0cnVlKTsgLy8gdGFyZ2V0IHRoZSBsaW5rIHBvaW50ZWQgdG8gaXMgbmV2ZXIgZGVsZXRlZFxuXHR9KTtcblxuXHQoaXNXaW5kb3dzID8gdGVzdC5za2lwIC8qIHdpbmRvd3M6IGNhbm5vdCBjcmVhdGUgZmlsZSBzeW1ib2xpYyBsaW5rIHdpdGhvdXQgZWxldmF0ZWQgY29udGV4dCAqLyA6IHRlc3QpKCdkZWxldGVGaWxlIC0gc3ltYm9saWMgbGluayAocG9pbnRpbmcgdG8gbm9uZXhpc3RlbnQgZmlsZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnZm9vJykpO1xuXHRcdGNvbnN0IGxpbmsgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdiYXInKSk7XG5cdFx0YXdhaXQgcHJvbWlzZXMuc3ltbGluayh0YXJnZXQuZnNQYXRoLCBsaW5rLmZzUGF0aCk7XG5cblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2FuRGVsZXRlKGxpbmspLCB0cnVlKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmRlbChsaW5rKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKGxpbmsuZnNQYXRoKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIGxpbmsuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLm9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbi5ERUxFVEUpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVGb2xkZXIgKHJlY3Vyc2l2ZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3REZWxldGVGb2xkZXJSZWN1cnNpdmUoZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlRm9sZGVyIChyZWN1cnNpdmUsIGF0b21pYyknLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3REZWxldGVGb2xkZXJSZWN1cnNpdmUoZmFsc2UsIHsgcG9zdGZpeDogJy52c2N0bXAnIH0pO1xuXHR9KTtcblxuXHQoaXNMaW51eCAvKiB0cmFzaCBpcyB1bnJlbGlhYmxlIG9uIExpbnV4ICovID8gdGVzdC5za2lwIDogdGVzdCkoJ2RlbGV0ZUZvbGRlciAocmVjdXJzaXZlLCB1c2VUcmFzaCknLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3REZWxldGVGb2xkZXJSZWN1cnNpdmUodHJ1ZSwgZmFsc2UpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0RGVsZXRlRm9sZGVyUmVjdXJzaXZlKHVzZVRyYXNoOiBib29sZWFuLCBhdG9taWM6IElGaWxlQXRvbWljT3B0aW9ucyB8IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiBldmVudCA9IGUpKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnZGVlcCcpKTtcblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2FuRGVsZXRlKHNvdXJjZS5yZXNvdXJjZSwgeyByZWN1cnNpdmU6IHRydWUsIHVzZVRyYXNoLCBhdG9taWMgfSksIHRydWUpO1xuXHRcdGF3YWl0IHNlcnZpY2UuZGVsKHNvdXJjZS5yZXNvdXJjZSwgeyByZWN1cnNpdmU6IHRydWUsIHVzZVRyYXNoLCBhdG9taWMgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhzb3VyY2UucmVzb3VyY2UuZnNQYXRoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5vayhldmVudCEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEucmVzb3VyY2UuZnNQYXRoLCByZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkRFTEVURSk7XG5cdH1cblxuXHR0ZXN0KCdkZWxldGVGb2xkZXIgKG5vbiByZWN1cnNpdmUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnZGVlcCcpKTtcblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0Lm9rKChhd2FpdCBzZXJ2aWNlLmNhbkRlbGV0ZShzb3VyY2UucmVzb3VyY2UpKSBpbnN0YW5jZW9mIEVycm9yKTtcblxuXHRcdGxldCBlcnJvcjtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS5kZWwoc291cmNlLnJlc291cmNlKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRlcnJvciA9IGU7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlRm9sZGVyIGVtcHR5IGZvbGRlciAocmVjdXJzaXZlKScsICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdERlbGV0ZUVtcHR5Rm9sZGVyKHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVGb2xkZXIgZW1wdHkgZm9sZGVyIChub24gcmVjdXJzaXZlKScsICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdERlbGV0ZUVtcHR5Rm9sZGVyKGZhbHNlKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdERlbGV0ZUVtcHR5Rm9sZGVyKHJlY3Vyc2l2ZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgcmVzb3VyY2UgfSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlRm9sZGVyKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2RlZXAnLCAnZW1wdHknKSkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5kZWwocmVzb3VyY2UsIHsgcmVjdXJzaXZlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZXhpc3RzKHJlc291cmNlKSwgZmFsc2UpO1xuXHR9XG5cblx0dGVzdCgnbW92ZScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0Y29uc3Qgc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnaW5kZXguaHRtbCcpKTtcblx0XHRjb25zdCBzb3VyY2VDb250ZW50cyA9IHJlYWRGaWxlU3luYyhzb3VyY2UuZnNQYXRoKTtcblxuXHRcdGNvbnN0IHRhcmdldCA9IFVSSS5maWxlKGpvaW4oZGlybmFtZShzb3VyY2UuZnNQYXRoKSwgJ290aGVyLmh0bWwnKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jYW5Nb3ZlKHNvdXJjZSwgdGFyZ2V0KSwgdHJ1ZSk7XG5cdFx0Y29uc3QgcmVuYW1lZCA9IGF3YWl0IHNlcnZpY2UubW92ZShzb3VyY2UsIHRhcmdldCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhyZW5hbWVkLnJlc291cmNlLmZzUGF0aCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHNvdXJjZS5mc1BhdGgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIHNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLk1PVkUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEudGFyZ2V0IS5yZXNvdXJjZS5mc1BhdGgsIHJlbmFtZWQucmVzb3VyY2UuZnNQYXRoKTtcblxuXHRcdGNvbnN0IHRhcmdldENvbnRlbnRzID0gcmVhZEZpbGVTeW5jKHRhcmdldC5mc1BhdGgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZUNvbnRlbnRzLmJ5dGVMZW5ndGgsIHRhcmdldENvbnRlbnRzLmJ5dGVMZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3VyY2VDb250ZW50cy50b1N0cmluZygpLCB0YXJnZXRDb250ZW50cy50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSAtIGFjcm9zcyBwcm92aWRlcnMgKGJ1ZmZlcmVkID0+IGJ1ZmZlcmVkKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKHRlc3RQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0cmV0dXJuIHRlc3RNb3ZlQWNyb3NzUHJvdmlkZXJzKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgLSBhY3Jvc3MgcHJvdmlkZXJzICh1bmJ1ZmZlcmVkID0+IHVuYnVmZmVyZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblx0XHRzZXRDYXBhYmlsaXRpZXModGVzdFByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG5cblx0XHRyZXR1cm4gdGVzdE1vdmVBY3Jvc3NQcm92aWRlcnMoKTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSAtIGFjcm9zcyBwcm92aWRlcnMgKGJ1ZmZlcmVkID0+IHVuYnVmZmVyZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblx0XHRzZXRDYXBhYmlsaXRpZXModGVzdFByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG5cblx0XHRyZXR1cm4gdGVzdE1vdmVBY3Jvc3NQcm92aWRlcnMoKTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSAtIGFjcm9zcyBwcm92aWRlcnMgKHVuYnVmZmVyZWQgPT4gYnVmZmVyZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblx0XHRzZXRDYXBhYmlsaXRpZXModGVzdFByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cblx0XHRyZXR1cm4gdGVzdE1vdmVBY3Jvc3NQcm92aWRlcnMoKTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSAtIGFjcm9zcyBwcm92aWRlcnMgLSBsYXJnZSAoYnVmZmVyZWQgPT4gYnVmZmVyZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblx0XHRzZXRDYXBhYmlsaXRpZXModGVzdFByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cblx0XHRyZXR1cm4gdGVzdE1vdmVBY3Jvc3NQcm92aWRlcnMoJ2xvcmVtLnR4dCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIC0gYWNyb3NzIHByb3ZpZGVycyAtIGxhcmdlICh1bmJ1ZmZlcmVkID0+IHVuYnVmZmVyZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblx0XHRzZXRDYXBhYmlsaXRpZXModGVzdFByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG5cblx0XHRyZXR1cm4gdGVzdE1vdmVBY3Jvc3NQcm92aWRlcnMoJ2xvcmVtLnR4dCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIC0gYWNyb3NzIHByb3ZpZGVycyAtIGxhcmdlIChidWZmZXJlZCA9PiB1bmJ1ZmZlcmVkKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKHRlc3RQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXG5cdFx0cmV0dXJuIHRlc3RNb3ZlQWNyb3NzUHJvdmlkZXJzKCdsb3JlbS50eHQnKTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSAtIGFjcm9zcyBwcm92aWRlcnMgLSBsYXJnZSAodW5idWZmZXJlZCA9PiBidWZmZXJlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXHRcdHNldENhcGFiaWxpdGllcyh0ZXN0UHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdHJldHVybiB0ZXN0TW92ZUFjcm9zc1Byb3ZpZGVycygnbG9yZW0udHh0Jyk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RNb3ZlQWNyb3NzUHJvdmlkZXJzKHNvdXJjZUZpbGUgPSAnaW5kZXguaHRtbCcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0Y29uc3Qgc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCBzb3VyY2VGaWxlKSk7XG5cdFx0Y29uc3Qgc291cmNlQ29udGVudHMgPSByZWFkRmlsZVN5bmMoc291cmNlLmZzUGF0aCk7XG5cblx0XHRjb25zdCB0YXJnZXQgPSBVUkkuZmlsZShqb2luKGRpcm5hbWUoc291cmNlLmZzUGF0aCksICdvdGhlci5odG1sJykpLndpdGgoeyBzY2hlbWU6IHRlc3RTY2hlbWEgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jYW5Nb3ZlKHNvdXJjZSwgdGFyZ2V0KSwgdHJ1ZSk7XG5cdFx0Y29uc3QgcmVuYW1lZCA9IGF3YWl0IHNlcnZpY2UubW92ZShzb3VyY2UsIHRhcmdldCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhyZW5hbWVkLnJlc291cmNlLmZzUGF0aCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHNvdXJjZS5mc1BhdGgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIHNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkNPUFkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEudGFyZ2V0IS5yZXNvdXJjZS5mc1BhdGgsIHJlbmFtZWQucmVzb3VyY2UuZnNQYXRoKTtcblxuXHRcdGNvbnN0IHRhcmdldENvbnRlbnRzID0gcmVhZEZpbGVTeW5jKHRhcmdldC5mc1BhdGgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZUNvbnRlbnRzLmJ5dGVMZW5ndGgsIHRhcmdldENvbnRlbnRzLmJ5dGVMZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3VyY2VDb250ZW50cy50b1N0cmluZygpLCB0YXJnZXRDb250ZW50cy50b1N0cmluZygpKTtcblx0fVxuXG5cdHRlc3QoJ21vdmUgLSBtdWx0aSBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiBldmVudCA9IGUpKTtcblxuXHRcdGNvbnN0IG11bHRpRm9sZGVyUGF0aHMgPSBbJ2EnLCAnY291cGxlJywgJ29mJywgJ2ZvbGRlcnMnXTtcblx0XHRjb25zdCByZW5hbWVUb1BhdGggPSBqb2luKC4uLm11bHRpRm9sZGVyUGF0aHMsICdvdGhlci5odG1sJyk7XG5cblx0XHRjb25zdCBzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdpbmRleC5odG1sJykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2FuTW92ZShzb3VyY2UsIFVSSS5maWxlKGpvaW4oZGlybmFtZShzb3VyY2UuZnNQYXRoKSwgcmVuYW1lVG9QYXRoKSkpLCB0cnVlKTtcblx0XHRjb25zdCByZW5hbWVkID0gYXdhaXQgc2VydmljZS5tb3ZlKHNvdXJjZSwgVVJJLmZpbGUoam9pbihkaXJuYW1lKHNvdXJjZS5mc1BhdGgpLCByZW5hbWVUb1BhdGgpKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhyZW5hbWVkLnJlc291cmNlLmZzUGF0aCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHNvdXJjZS5mc1BhdGgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIHNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLk1PVkUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEudGFyZ2V0IS5yZXNvdXJjZS5mc1BhdGgsIHJlbmFtZWQucmVzb3VyY2UuZnNQYXRoKTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSAtIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0Y29uc3Qgc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnZGVlcCcpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNhbk1vdmUoc291cmNlLCBVUkkuZmlsZShqb2luKGRpcm5hbWUoc291cmNlLmZzUGF0aCksICdkZWVwZXInKSkpLCB0cnVlKTtcblx0XHRjb25zdCByZW5hbWVkID0gYXdhaXQgc2VydmljZS5tb3ZlKHNvdXJjZSwgVVJJLmZpbGUoam9pbihkaXJuYW1lKHNvdXJjZS5mc1BhdGgpLCAnZGVlcGVyJykpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHJlbmFtZWQucmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMoc291cmNlLmZzUGF0aCksIGZhbHNlKTtcblx0XHRhc3NlcnQub2soZXZlbnQhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnJlc291cmNlLmZzUGF0aCwgc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5vcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uTU9WRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS50YXJnZXQhLnJlc291cmNlLmZzUGF0aCwgcmVuYW1lZC5yZXNvdXJjZS5mc1BhdGgpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIC0gZGlyZWN0b3J5IC0gYWNyb3NzIHByb3ZpZGVycyAoYnVmZmVyZWQgPT4gYnVmZmVyZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblx0XHRzZXRDYXBhYmlsaXRpZXModGVzdFByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cblx0XHRyZXR1cm4gdGVzdE1vdmVGb2xkZXJBY3Jvc3NQcm92aWRlcnMoKTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSAtIGRpcmVjdG9yeSAtIGFjcm9zcyBwcm92aWRlcnMgKHVuYnVmZmVyZWQgPT4gdW5idWZmZXJlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXHRcdHNldENhcGFiaWxpdGllcyh0ZXN0UHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdHJldHVybiB0ZXN0TW92ZUZvbGRlckFjcm9zc1Byb3ZpZGVycygpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIC0gZGlyZWN0b3J5IC0gYWNyb3NzIHByb3ZpZGVycyAoYnVmZmVyZWQgPT4gdW5idWZmZXJlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXHRcdHNldENhcGFiaWxpdGllcyh0ZXN0UHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdHJldHVybiB0ZXN0TW92ZUZvbGRlckFjcm9zc1Byb3ZpZGVycygpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIC0gZGlyZWN0b3J5IC0gYWNyb3NzIHByb3ZpZGVycyAodW5idWZmZXJlZCA9PiBidWZmZXJlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXHRcdHNldENhcGFiaWxpdGllcyh0ZXN0UHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdHJldHVybiB0ZXN0TW92ZUZvbGRlckFjcm9zc1Byb3ZpZGVycygpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0TW92ZUZvbGRlckFjcm9zc1Byb3ZpZGVycygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0Y29uc3Qgc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnZGVlcCcpKTtcblx0XHRjb25zdCBzb3VyY2VDaGlsZHJlbiA9IHJlYWRkaXJTeW5jKHNvdXJjZS5mc1BhdGgpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gVVJJLmZpbGUoam9pbihkaXJuYW1lKHNvdXJjZS5mc1BhdGgpLCAnZGVlcGVyJykpLndpdGgoeyBzY2hlbWU6IHRlc3RTY2hlbWEgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jYW5Nb3ZlKHNvdXJjZSwgdGFyZ2V0KSwgdHJ1ZSk7XG5cdFx0Y29uc3QgcmVuYW1lZCA9IGF3YWl0IHNlcnZpY2UubW92ZShzb3VyY2UsIHRhcmdldCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhyZW5hbWVkLnJlc291cmNlLmZzUGF0aCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHNvdXJjZS5mc1BhdGgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIHNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkNPUFkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEudGFyZ2V0IS5yZXNvdXJjZS5mc1BhdGgsIHJlbmFtZWQucmVzb3VyY2UuZnNQYXRoKTtcblxuXHRcdGNvbnN0IHRhcmdldENoaWxkcmVuID0gcmVhZGRpclN5bmModGFyZ2V0LmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZUNoaWxkcmVuLmxlbmd0aCwgdGFyZ2V0Q2hpbGRyZW4ubGVuZ3RoKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNvdXJjZUNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlQ2hpbGRyZW5baV0sIHRhcmdldENoaWxkcmVuW2ldKTtcblx0XHR9XG5cdH1cblxuXHR0ZXN0KCdtb3ZlIC0gTUlYIENBU0UnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiBldmVudCA9IGUpKTtcblxuXHRcdGNvbnN0IHNvdXJjZSA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShVUkkuZmlsZShqb2luKHRlc3REaXIsICdpbmRleC5odG1sJykpLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQub2soc291cmNlLnNpemUgPiAwKTtcblxuXHRcdGNvbnN0IHJlbmFtZWRSZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4oZGlybmFtZShzb3VyY2UucmVzb3VyY2UuZnNQYXRoKSwgJ0lOREVYLmh0bWwnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2FuTW92ZShzb3VyY2UucmVzb3VyY2UsIHJlbmFtZWRSZXNvdXJjZSksIHRydWUpO1xuXHRcdGxldCByZW5hbWVkID0gYXdhaXQgc2VydmljZS5tb3ZlKHNvdXJjZS5yZXNvdXJjZSwgcmVuYW1lZFJlc291cmNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHJlbmFtZWRSZXNvdXJjZS5mc1BhdGgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFzZW5hbWUocmVuYW1lZFJlc291cmNlLmZzUGF0aCksICdJTkRFWC5odG1sJyk7XG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIHNvdXJjZS5yZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLk1PVkUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEudGFyZ2V0IS5yZXNvdXJjZS5mc1BhdGgsIHJlbmFtZWRSZXNvdXJjZS5mc1BhdGgpO1xuXG5cdFx0cmVuYW1lZCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShyZW5hbWVkUmVzb3VyY2UsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3VyY2Uuc2l6ZSwgcmVuYW1lZC5zaXplKTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSAtIHNhbWUgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0Y29uc3Qgc291cmNlID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2luZGV4Lmh0bWwnKSksIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5vayhzb3VyY2Uuc2l6ZSA+IDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2FuTW92ZShzb3VyY2UucmVzb3VyY2UsIFVSSS5maWxlKHNvdXJjZS5yZXNvdXJjZS5mc1BhdGgpKSwgdHJ1ZSk7XG5cdFx0bGV0IHJlbmFtZWQgPSBhd2FpdCBzZXJ2aWNlLm1vdmUoc291cmNlLnJlc291cmNlLCBVUkkuZmlsZShzb3VyY2UucmVzb3VyY2UuZnNQYXRoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhyZW5hbWVkLnJlc291cmNlLmZzUGF0aCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbmFtZShyZW5hbWVkLnJlc291cmNlLmZzUGF0aCksICdpbmRleC5odG1sJyk7XG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIHNvdXJjZS5yZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLk1PVkUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEudGFyZ2V0IS5yZXNvdXJjZS5mc1BhdGgsIHJlbmFtZWQucmVzb3VyY2UuZnNQYXRoKTtcblxuXHRcdHJlbmFtZWQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUocmVuYW1lZC5yZXNvdXJjZSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZS5zaXplLCByZW5hbWVkLnNpemUpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIC0gc2FtZSBmaWxlICMyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnaW5kZXguaHRtbCcpKSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0YXNzZXJ0Lm9rKHNvdXJjZS5zaXplID4gMCk7XG5cblx0XHRjb25zdCB0YXJnZXRQYXJlbnQgPSBVUkkuZmlsZSh0ZXN0RGlyKTtcblx0XHRjb25zdCB0YXJnZXQgPSB0YXJnZXRQYXJlbnQud2l0aCh7IHBhdGg6IHBvc2l4LmpvaW4odGFyZ2V0UGFyZW50LnBhdGgsIHBvc2l4LmJhc2VuYW1lKHNvdXJjZS5yZXNvdXJjZS5wYXRoKSkgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jYW5Nb3ZlKHNvdXJjZS5yZXNvdXJjZSwgdGFyZ2V0KSwgdHJ1ZSk7XG5cdFx0bGV0IHJlbmFtZWQgPSBhd2FpdCBzZXJ2aWNlLm1vdmUoc291cmNlLnJlc291cmNlLCB0YXJnZXQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMocmVuYW1lZC5yZXNvdXJjZS5mc1BhdGgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFzZW5hbWUocmVuYW1lZC5yZXNvdXJjZS5mc1BhdGgpLCAnaW5kZXguaHRtbCcpO1xuXHRcdGFzc2VydC5vayhldmVudCEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEucmVzb3VyY2UuZnNQYXRoLCBzb3VyY2UucmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLm9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbi5NT1ZFKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnRhcmdldCEucmVzb3VyY2UuZnNQYXRoLCByZW5hbWVkLnJlc291cmNlLmZzUGF0aCk7XG5cblx0XHRyZW5hbWVkID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHJlbmFtZWQucmVzb3VyY2UsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3VyY2Uuc2l6ZSwgcmVuYW1lZC5zaXplKTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSAtIHNvdXJjZSBwYXJlbnQgb2YgdGFyZ2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRsZXQgc291cmNlID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2luZGV4Lmh0bWwnKSksIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdGNvbnN0IG9yaWdpbmFsU2l6ZSA9IHNvdXJjZS5zaXplO1xuXHRcdGFzc2VydC5vayhvcmlnaW5hbFNpemUgPiAwKTtcblxuXHRcdGFzc2VydC5vaygoYXdhaXQgc2VydmljZS5jYW5Nb3ZlKFVSSS5maWxlKHRlc3REaXIpLCBVUkkuZmlsZShqb2luKHRlc3REaXIsICdiaW5hcnkudHh0JykpKSBpbnN0YW5jZW9mIEVycm9yKSk7XG5cblx0XHRsZXQgZXJyb3I7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2UubW92ZShVUkkuZmlsZSh0ZXN0RGlyKSwgVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnYmluYXJ5LnR4dCcpKSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0ZXJyb3IgPSBlO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cdFx0YXNzZXJ0Lm9rKCFldmVudCEpO1xuXG5cdFx0c291cmNlID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHNvdXJjZS5yZXNvdXJjZSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9yaWdpbmFsU2l6ZSwgc291cmNlLnNpemUpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIC0gRklMRV9NT1ZFX0NPTkZMSUNUJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRsZXQgc291cmNlID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2luZGV4Lmh0bWwnKSksIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdGNvbnN0IG9yaWdpbmFsU2l6ZSA9IHNvdXJjZS5zaXplO1xuXHRcdGFzc2VydC5vayhvcmlnaW5hbFNpemUgPiAwKTtcblxuXHRcdGFzc2VydC5vaygoYXdhaXQgc2VydmljZS5jYW5Nb3ZlKHNvdXJjZS5yZXNvdXJjZSwgVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnYmluYXJ5LnR4dCcpKSkgaW5zdGFuY2VvZiBFcnJvcikpO1xuXG5cdFx0bGV0IGVycm9yO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLm1vdmUoc291cmNlLnJlc291cmNlLCBVUkkuZmlsZShqb2luKHRlc3REaXIsICdiaW5hcnkudHh0JykpKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRlcnJvciA9IGU7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLmZpbGVPcGVyYXRpb25SZXN1bHQsIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT1ZFX0NPTkZMSUNUKTtcblx0XHRhc3NlcnQub2soIWV2ZW50ISk7XG5cblx0XHRzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoc291cmNlLnJlc291cmNlLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3JpZ2luYWxTaXplLCBzb3VyY2Uuc2l6ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgLSBvdmVyd3JpdGUgZm9sZGVyIHdpdGggZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgY3JlYXRlRXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRsZXQgbW92ZUV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQ7XG5cdFx0bGV0IGRlbGV0ZUV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5vcGVyYXRpb24gPT09IEZpbGVPcGVyYXRpb24uQ1JFQVRFKSB7XG5cdFx0XHRcdGNyZWF0ZUV2ZW50ID0gZTtcblx0XHRcdH0gZWxzZSBpZiAoZS5vcGVyYXRpb24gPT09IEZpbGVPcGVyYXRpb24uREVMRVRFKSB7XG5cdFx0XHRcdGRlbGV0ZUV2ZW50ID0gZTtcblx0XHRcdH0gZWxzZSBpZiAoZS5vcGVyYXRpb24gPT09IEZpbGVPcGVyYXRpb24uTU9WRSkge1xuXHRcdFx0XHRtb3ZlRXZlbnQgPSBlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShVUkkuZmlsZSh0ZXN0RGlyKSk7XG5cdFx0Y29uc3QgZm9sZGVyUmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHBhcmVudC5yZXNvdXJjZS5mc1BhdGgsICdjb253YXkuanMnKSk7XG5cdFx0Y29uc3QgZiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlRm9sZGVyKGZvbGRlclJlc291cmNlKTtcblx0XHRjb25zdCBzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdkZWVwJywgJ2NvbndheS5qcycpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNhbk1vdmUoc291cmNlLCBmLnJlc291cmNlLCB0cnVlKSwgdHJ1ZSk7XG5cdFx0Y29uc3QgbW92ZWQgPSBhd2FpdCBzZXJ2aWNlLm1vdmUoc291cmNlLCBmLnJlc291cmNlLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKG1vdmVkLnJlc291cmNlLmZzUGF0aCksIHRydWUpO1xuXHRcdGFzc2VydC5vayhzdGF0U3luYyhtb3ZlZC5yZXNvdXJjZS5mc1BhdGgpLmlzRmlsZSk7XG5cdFx0YXNzZXJ0Lm9rKGNyZWF0ZUV2ZW50ISk7XG5cdFx0YXNzZXJ0Lm9rKGRlbGV0ZUV2ZW50ISk7XG5cdFx0YXNzZXJ0Lm9rKG1vdmVFdmVudCEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb3ZlRXZlbnQhLnJlc291cmNlLmZzUGF0aCwgc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vdmVFdmVudCEudGFyZ2V0IS5yZXNvdXJjZS5mc1BhdGgsIG1vdmVkLnJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGV0ZUV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIGZvbGRlclJlc291cmNlLmZzUGF0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcHknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZG9UZXN0Q29weSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3B5IC0gdW5idWZmZXJlZCAoRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdGF3YWl0IGRvVGVzdENvcHkoKTtcblx0fSk7XG5cblx0dGVzdCgnY29weSAtIHVuYnVmZmVyZWQgbGFyZ2UgKEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG5cblx0XHRhd2FpdCBkb1Rlc3RDb3B5KCdsb3JlbS50eHQnKTtcblx0fSk7XG5cblx0dGVzdCgnY29weSAtIGJ1ZmZlcmVkIChGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0YXdhaXQgZG9UZXN0Q29weSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3B5IC0gYnVmZmVyZWQgbGFyZ2UgKEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cblx0XHRhd2FpdCBkb1Rlc3RDb3B5KCdsb3JlbS50eHQnKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gc2V0Q2FwYWJpbGl0aWVzKHByb3ZpZGVyOiBUZXN0RGlza0ZpbGVTeXN0ZW1Qcm92aWRlciwgY2FwYWJpbGl0aWVzOiBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMpOiB2b2lkIHtcblx0XHRwcm92aWRlci5jYXBhYmlsaXRpZXMgPSBjYXBhYmlsaXRpZXM7XG5cdFx0aWYgKGlzTGludXgpIHtcblx0XHRcdHByb3ZpZGVyLmNhcGFiaWxpdGllcyB8PSBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUGF0aENhc2VTZW5zaXRpdmU7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gZG9UZXN0Q29weShzb3VyY2VOYW1lOiBzdHJpbmcgPSAnaW5kZXguaHRtbCcpIHtcblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0Y29uc3Qgc291cmNlID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKFVSSS5maWxlKGpvaW4odGVzdERpciwgc291cmNlTmFtZSkpKTtcblx0XHRjb25zdCB0YXJnZXQgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdvdGhlci5odG1sJykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2FuQ29weShzb3VyY2UucmVzb3VyY2UsIHRhcmdldCksIHRydWUpO1xuXHRcdGNvbnN0IGNvcGllZCA9IGF3YWl0IHNlcnZpY2UuY29weShzb3VyY2UucmVzb3VyY2UsIHRhcmdldCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhjb3BpZWQucmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMoc291cmNlLnJlc291cmNlLmZzUGF0aCksIHRydWUpO1xuXHRcdGFzc2VydC5vayhldmVudCEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEucmVzb3VyY2UuZnNQYXRoLCBzb3VyY2UucmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLm9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbi5DT1BZKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnRhcmdldCEucmVzb3VyY2UuZnNQYXRoLCBjb3BpZWQucmVzb3VyY2UuZnNQYXRoKTtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnRzID0gcmVhZEZpbGVTeW5jKHNvdXJjZS5yZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGNvbnN0IHRhcmdldENvbnRlbnRzID0gcmVhZEZpbGVTeW5jKHRhcmdldC5mc1BhdGgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZUNvbnRlbnRzLmJ5dGVMZW5ndGgsIHRhcmdldENvbnRlbnRzLmJ5dGVMZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3VyY2VDb250ZW50cy50b1N0cmluZygpLCB0YXJnZXRDb250ZW50cy50b1N0cmluZygpKTtcblx0fVxuXG5cdHRlc3QoJ2NvcHkgLSBvdmVyd3JpdGUgZm9sZGVyIHdpdGggZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgY3JlYXRlRXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRsZXQgY29weUV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQ7XG5cdFx0bGV0IGRlbGV0ZUV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5vcGVyYXRpb24gPT09IEZpbGVPcGVyYXRpb24uQ1JFQVRFKSB7XG5cdFx0XHRcdGNyZWF0ZUV2ZW50ID0gZTtcblx0XHRcdH0gZWxzZSBpZiAoZS5vcGVyYXRpb24gPT09IEZpbGVPcGVyYXRpb24uREVMRVRFKSB7XG5cdFx0XHRcdGRlbGV0ZUV2ZW50ID0gZTtcblx0XHRcdH0gZWxzZSBpZiAoZS5vcGVyYXRpb24gPT09IEZpbGVPcGVyYXRpb24uQ09QWSkge1xuXHRcdFx0XHRjb3B5RXZlbnQgPSBlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShVUkkuZmlsZSh0ZXN0RGlyKSk7XG5cdFx0Y29uc3QgZm9sZGVyUmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHBhcmVudC5yZXNvdXJjZS5mc1BhdGgsICdjb253YXkuanMnKSk7XG5cdFx0Y29uc3QgZiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlRm9sZGVyKGZvbGRlclJlc291cmNlKTtcblx0XHRjb25zdCBzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdkZWVwJywgJ2NvbndheS5qcycpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNhbkNvcHkoc291cmNlLCBmLnJlc291cmNlLCB0cnVlKSwgdHJ1ZSk7XG5cdFx0Y29uc3QgY29waWVkID0gYXdhaXQgc2VydmljZS5jb3B5KHNvdXJjZSwgZi5yZXNvdXJjZSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhjb3BpZWQucmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKHN0YXRTeW5jKGNvcGllZC5yZXNvdXJjZS5mc1BhdGgpLmlzRmlsZSk7XG5cdFx0YXNzZXJ0Lm9rKGNyZWF0ZUV2ZW50ISk7XG5cdFx0YXNzZXJ0Lm9rKGRlbGV0ZUV2ZW50ISk7XG5cdFx0YXNzZXJ0Lm9rKGNvcHlFdmVudCEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3B5RXZlbnQhLnJlc291cmNlLmZzUGF0aCwgc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvcHlFdmVudCEudGFyZ2V0IS5yZXNvdXJjZS5mc1BhdGgsIGNvcGllZC5yZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxldGVFdmVudCEucmVzb3VyY2UuZnNQYXRoLCBmb2xkZXJSZXNvdXJjZS5mc1BhdGgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3B5IC0gTUlYIENBU0Ugc2FtZSB0YXJnZXQgLSBubyBvdmVyd3JpdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHNvdXJjZSA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShVUkkuZmlsZShqb2luKHRlc3REaXIsICdpbmRleC5odG1sJykpLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRjb25zdCBvcmlnaW5hbFNpemUgPSBzb3VyY2Uuc2l6ZTtcblx0XHRhc3NlcnQub2sob3JpZ2luYWxTaXplID4gMCk7XG5cblx0XHRjb25zdCB0YXJnZXQgPSBVUkkuZmlsZShqb2luKGRpcm5hbWUoc291cmNlLnJlc291cmNlLmZzUGF0aCksICdJTkRFWC5odG1sJykpO1xuXG5cdFx0Y29uc3QgY2FuQ29weSA9IGF3YWl0IHNlcnZpY2UuY2FuQ29weShzb3VyY2UucmVzb3VyY2UsIHRhcmdldCk7XG5cblx0XHRsZXQgZXJyb3I7XG5cdFx0bGV0IGNvcGllZDogSUZpbGVTdGF0V2l0aE1ldGFkYXRhO1xuXHRcdHRyeSB7XG5cdFx0XHRjb3BpZWQgPSBhd2FpdCBzZXJ2aWNlLmNvcHkoc291cmNlLnJlc291cmNlLCB0YXJnZXQpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGVycm9yID0gZTtcblx0XHR9XG5cblx0XHRpZiAoaXNMaW51eCkge1xuXHRcdFx0YXNzZXJ0Lm9rKCFlcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuQ29weSwgdHJ1ZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKGNvcGllZCEucmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQub2socmVhZGRpclN5bmModGVzdERpcikuc29tZShmID0+IGYgPT09ICdJTkRFWC5odG1sJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZS5zaXplLCBjb3BpZWQhLnNpemUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQub2soZXJyb3IpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNhbkNvcHkgaW5zdGFuY2VvZiBFcnJvcik7XG5cblx0XHRcdHNvdXJjZSA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShzb3VyY2UucmVzb3VyY2UsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9yaWdpbmFsU2l6ZSwgc291cmNlLnNpemUpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY29weSAtIE1JWCBDQVNFIHNhbWUgdGFyZ2V0IC0gb3ZlcndyaXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnaW5kZXguaHRtbCcpKSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxTaXplID0gc291cmNlLnNpemU7XG5cdFx0YXNzZXJ0Lm9rKG9yaWdpbmFsU2l6ZSA+IDApO1xuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gVVJJLmZpbGUoam9pbihkaXJuYW1lKHNvdXJjZS5yZXNvdXJjZS5mc1BhdGgpLCAnSU5ERVguaHRtbCcpKTtcblxuXHRcdGNvbnN0IGNhbkNvcHkgPSBhd2FpdCBzZXJ2aWNlLmNhbkNvcHkoc291cmNlLnJlc291cmNlLCB0YXJnZXQsIHRydWUpO1xuXG5cdFx0bGV0IGVycm9yO1xuXHRcdGxldCBjb3BpZWQ6IElGaWxlU3RhdFdpdGhNZXRhZGF0YTtcblx0XHR0cnkge1xuXHRcdFx0Y29waWVkID0gYXdhaXQgc2VydmljZS5jb3B5KHNvdXJjZS5yZXNvdXJjZSwgdGFyZ2V0LCB0cnVlKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRlcnJvciA9IGU7XG5cdFx0fVxuXG5cdFx0aWYgKGlzTGludXgpIHtcblx0XHRcdGFzc2VydC5vayghZXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbkNvcHksIHRydWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhjb3BpZWQhLnJlc291cmNlLmZzUGF0aCksIHRydWUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlYWRkaXJTeW5jKHRlc3REaXIpLnNvbWUoZiA9PiBmID09PSAnSU5ERVguaHRtbCcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3VyY2Uuc2l6ZSwgY29waWVkIS5zaXplKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0XHRcdGFzc2VydC5vayhjYW5Db3B5IGluc3RhbmNlb2YgRXJyb3IpO1xuXG5cdFx0XHRzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoc291cmNlLnJlc291cmNlLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcmlnaW5hbFNpemUsIHNvdXJjZS5zaXplKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcHkgLSBNSVggQ0FTRSBkaWZmZXJlbnQgdGFyZ2V0IC0gb3ZlcndyaXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNvdXJjZTEgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnaW5kZXguaHRtbCcpKSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0YXNzZXJ0Lm9rKHNvdXJjZTEuc2l6ZSA+IDApO1xuXG5cdFx0Y29uc3QgcmVuYW1lZCA9IGF3YWl0IHNlcnZpY2UubW92ZShzb3VyY2UxLnJlc291cmNlLCBVUkkuZmlsZShqb2luKGRpcm5hbWUoc291cmNlMS5yZXNvdXJjZS5mc1BhdGgpLCAnQ09OV0FZLmpzJykpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhyZW5hbWVkLnJlc291cmNlLmZzUGF0aCksIHRydWUpO1xuXHRcdGFzc2VydC5vayhyZWFkZGlyU3luYyh0ZXN0RGlyKS5zb21lKGYgPT4gZiA9PT0gJ0NPTldBWS5qcycpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlMS5zaXplLCByZW5hbWVkLnNpemUpO1xuXG5cdFx0Y29uc3Qgc291cmNlMiA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZShVUkkuZmlsZShqb2luKHRlc3REaXIsICdkZWVwJywgJ2NvbndheS5qcycpKSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCBiYXNlbmFtZShzb3VyY2UyLnJlc291cmNlLnBhdGgpKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jYW5Db3B5KHNvdXJjZTIucmVzb3VyY2UsIHRhcmdldCwgdHJ1ZSksIHRydWUpO1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHNlcnZpY2UuY29weShzb3VyY2UyLnJlc291cmNlLCB0YXJnZXQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKHJlcy5yZXNvdXJjZS5mc1BhdGgpLCB0cnVlKTtcblx0XHRhc3NlcnQub2socmVhZGRpclN5bmModGVzdERpcikuc29tZShmID0+IGYgPT09ICdjb253YXkuanMnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZTIuc2l6ZSwgcmVzLnNpemUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3B5IC0gc2FtZSBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnaW5kZXguaHRtbCcpKSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0YXNzZXJ0Lm9rKHNvdXJjZS5zaXplID4gMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jYW5Db3B5KHNvdXJjZS5yZXNvdXJjZSwgVVJJLmZpbGUoc291cmNlLnJlc291cmNlLmZzUGF0aCkpLCB0cnVlKTtcblx0XHRsZXQgY29waWVkID0gYXdhaXQgc2VydmljZS5jb3B5KHNvdXJjZS5yZXNvdXJjZSwgVVJJLmZpbGUoc291cmNlLnJlc291cmNlLmZzUGF0aCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMoY29waWVkLnJlc291cmNlLmZzUGF0aCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbmFtZShjb3BpZWQucmVzb3VyY2UuZnNQYXRoKSwgJ2luZGV4Lmh0bWwnKTtcblx0XHRhc3NlcnQub2soZXZlbnQhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnJlc291cmNlLmZzUGF0aCwgc291cmNlLnJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5vcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uQ09QWSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS50YXJnZXQhLnJlc291cmNlLmZzUGF0aCwgY29waWVkLnJlc291cmNlLmZzUGF0aCk7XG5cblx0XHRjb3BpZWQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUoc291cmNlLnJlc291cmNlLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlLnNpemUsIGNvcGllZC5zaXplKTtcblx0fSk7XG5cblx0dGVzdCgnY29weSAtIHNhbWUgZmlsZSAjMicsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0Y29uc3Qgc291cmNlID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2luZGV4Lmh0bWwnKSksIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5vayhzb3VyY2Uuc2l6ZSA+IDApO1xuXG5cdFx0Y29uc3QgdGFyZ2V0UGFyZW50ID0gVVJJLmZpbGUodGVzdERpcik7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGFyZ2V0UGFyZW50LndpdGgoeyBwYXRoOiBwb3NpeC5qb2luKHRhcmdldFBhcmVudC5wYXRoLCBwb3NpeC5iYXNlbmFtZShzb3VyY2UucmVzb3VyY2UucGF0aCkpIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2FuQ29weShzb3VyY2UucmVzb3VyY2UsIFVSSS5maWxlKHRhcmdldC5mc1BhdGgpKSwgdHJ1ZSk7XG5cdFx0bGV0IGNvcGllZCA9IGF3YWl0IHNlcnZpY2UuY29weShzb3VyY2UucmVzb3VyY2UsIFVSSS5maWxlKHRhcmdldC5mc1BhdGgpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGlzdHNTeW5jKGNvcGllZC5yZXNvdXJjZS5mc1BhdGgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFzZW5hbWUoY29waWVkLnJlc291cmNlLmZzUGF0aCksICdpbmRleC5odG1sJyk7XG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIHNvdXJjZS5yZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkNPUFkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEudGFyZ2V0IS5yZXNvdXJjZS5mc1BhdGgsIGNvcGllZC5yZXNvdXJjZS5mc1BhdGgpO1xuXG5cdFx0Y29waWVkID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHNvdXJjZS5yZXNvdXJjZSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZS5zaXplLCBjb3BpZWQuc2l6ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb25lRmlsZSAtIGJhc2ljcycsICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdENsb25lRmlsZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9uZUZpbGUgLSB2aWEgY29weSBjYXBhYmlsaXR5JywgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlIHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVGb2xkZXJDb3B5KTtcblxuXHRcdHJldHVybiB0ZXN0Q2xvbmVGaWxlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb25lRmlsZSAtIHZpYSBwaXBlJywgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdHJldHVybiB0ZXN0Q2xvbmVGaWxlKCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RDbG9uZUZpbGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc291cmNlMSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2luZGV4Lmh0bWwnKSk7XG5cdFx0Y29uc3Qgc291cmNlMVNpemUgPSAoYXdhaXQgc2VydmljZS5yZXNvbHZlKHNvdXJjZTEsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pKS5zaXplO1xuXG5cdFx0Y29uc3Qgc291cmNlMiA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpKTtcblx0XHRjb25zdCBzb3VyY2UyU2l6ZSA9IChhd2FpdCBzZXJ2aWNlLnJlc29sdmUoc291cmNlMiwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSkpLnNpemU7XG5cblx0XHRjb25zdCB0YXJnZXRQYXJlbnQgPSBVUkkuZmlsZSh0ZXN0RGlyKTtcblxuXHRcdC8vIHNhbWUgcGF0aCBpcyBhIG5vLW9wXG5cdFx0YXdhaXQgc2VydmljZS5jbG9uZUZpbGUoc291cmNlMSwgc291cmNlMSk7XG5cblx0XHQvLyBzaW1wbGUgY2xvbmUgdG8gZXhpc3RpbmcgcGFyZW50IGZvbGRlciBwYXRoXG5cdFx0Y29uc3QgdGFyZ2V0MSA9IHRhcmdldFBhcmVudC53aXRoKHsgcGF0aDogcG9zaXguam9pbih0YXJnZXRQYXJlbnQucGF0aCwgYCR7cG9zaXguYmFzZW5hbWUoc291cmNlMS5wYXRoKX0tY2xvbmVgKSB9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY2xvbmVGaWxlKHNvdXJjZTEsIFVSSS5maWxlKHRhcmdldDEuZnNQYXRoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyh0YXJnZXQxLmZzUGF0aCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbmFtZSh0YXJnZXQxLmZzUGF0aCksICdpbmRleC5odG1sLWNsb25lJyk7XG5cblx0XHRsZXQgdGFyZ2V0MVNpemUgPSAoYXdhaXQgc2VydmljZS5yZXNvbHZlKHRhcmdldDEsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pKS5zaXplO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZTFTaXplLCB0YXJnZXQxU2l6ZSk7XG5cblx0XHQvLyBjbG9uZSB0byBzYW1lIHBhdGggb3ZlcndyaXRlc1xuXHRcdGF3YWl0IHNlcnZpY2UuY2xvbmVGaWxlKHNvdXJjZTIsIFVSSS5maWxlKHRhcmdldDEuZnNQYXRoKSk7XG5cblx0XHR0YXJnZXQxU2l6ZSA9IChhd2FpdCBzZXJ2aWNlLnJlc29sdmUodGFyZ2V0MSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSkpLnNpemU7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlMlNpemUsIHRhcmdldDFTaXplKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc291cmNlMVNpemUsIHRhcmdldDFTaXplKTtcblxuXHRcdC8vIGNsb25lIGNyZWF0ZXMgbWlzc2luZyBmb2xkZXJzIGFkLWhvY1xuXHRcdGNvbnN0IHRhcmdldDIgPSB0YXJnZXRQYXJlbnQud2l0aCh7IHBhdGg6IHBvc2l4LmpvaW4odGFyZ2V0UGFyZW50LnBhdGgsICdmb28nLCAnYmFyJywgYCR7cG9zaXguYmFzZW5hbWUoc291cmNlMS5wYXRoKX0tY2xvbmVgKSB9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY2xvbmVGaWxlKHNvdXJjZTEsIFVSSS5maWxlKHRhcmdldDIuZnNQYXRoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyh0YXJnZXQyLmZzUGF0aCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNlbmFtZSh0YXJnZXQyLmZzUGF0aCksICdpbmRleC5odG1sLWNsb25lJyk7XG5cblx0XHRjb25zdCB0YXJnZXQyU2l6ZSA9IChhd2FpdCBzZXJ2aWNlLnJlc29sdmUodGFyZ2V0MiwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSkpLnNpemU7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlMVNpemUsIHRhcmdldDJTaXplKTtcblx0fVxuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gc21hbGwgZmlsZSAtIGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZShVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIHNtYWxsIGZpbGUgLSBidWZmZXJlZCcsICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cblx0XHRyZXR1cm4gdGVzdFJlYWRGaWxlKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gc21hbGwgZmlsZSAtIGJ1ZmZlcmVkIC8gcmVhZG9ubHknLCAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UgfCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUmVhZG9ubHkpO1xuXG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZShVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIHNtYWxsIGZpbGUgLSB1bmJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdHJldHVybiB0ZXN0UmVhZEZpbGUoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwudHh0JykpKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBzbWFsbCBmaWxlIC0gdW5idWZmZXJlZCAvIHJlYWRvbmx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlIHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlJlYWRvbmx5KTtcblxuXHRcdHJldHVybiB0ZXN0UmVhZEZpbGUoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwudHh0JykpKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBzbWFsbCBmaWxlIC0gc3RyZWFtZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkU3RyZWFtKTtcblxuXHRcdHJldHVybiB0ZXN0UmVhZEZpbGUoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwudHh0JykpKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBzbWFsbCBmaWxlIC0gc3RyZWFtZWQgLyByZWFkb25seScsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRTdHJlYW0gfCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUmVhZG9ubHkpO1xuXG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZShVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIGxhcmdlIGZpbGUgLSBkZWZhdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiB0ZXN0UmVhZEZpbGUoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBsYXJnZSBmaWxlIC0gYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZShVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIGxhcmdlIGZpbGUgLSB1bmJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdHJldHVybiB0ZXN0UmVhZEZpbGUoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBsYXJnZSBmaWxlIC0gc3RyZWFtZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkU3RyZWFtKTtcblxuXHRcdHJldHVybiB0ZXN0UmVhZEZpbGUoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBhdG9taWMgKGVtdWxhdGVkIG9uIHNlcnZpY2UgbGV2ZWwpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFN0cmVhbSk7XG5cblx0XHRyZXR1cm4gdGVzdFJlYWRGaWxlKFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpKSwgeyBhdG9taWM6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gYXRvbWljIChuYXRpdmVseSBzdXBwb3J0ZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlICYgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBdG9taWNSZWFkKTtcblxuXHRcdHJldHVybiB0ZXN0UmVhZEZpbGUoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpLCB7IGF0b21pYzogdHJ1ZSB9KTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdFJlYWRGaWxlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmVhZEZpbGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UsIG9wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgcmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKSk7XG5cdH1cblxuXHR0ZXN0KCdyZWFkRmlsZVN0cmVhbSAtIHNtYWxsIGZpbGUgLSBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdHJldHVybiB0ZXN0UmVhZEZpbGVTdHJlYW0oVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwudHh0JykpKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGVTdHJlYW0gLSBzbWFsbCBmaWxlIC0gYnVmZmVyZWQnLCAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZVN0cmVhbShVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZVN0cmVhbSAtIHNtYWxsIGZpbGUgLSB1bmJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdHJldHVybiB0ZXN0UmVhZEZpbGVTdHJlYW0oVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwudHh0JykpKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGVTdHJlYW0gLSBzbWFsbCBmaWxlIC0gc3RyZWFtZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkU3RyZWFtKTtcblxuXHRcdHJldHVybiB0ZXN0UmVhZEZpbGVTdHJlYW0oVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwudHh0JykpKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdFJlYWRGaWxlU3RyZWFtKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgc2VydmljZS5yZWFkRmlsZVN0cmVhbShyZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHN0cmVhbVRvQnVmZmVyKGNvbnRlbnQudmFsdWUpKS50b1N0cmluZygpLCByZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpKTtcblx0fVxuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gRmlsZXMgYXJlIGludGVybWluZ2xlZCAjMzgzMzEgLSBkZWZhdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiB0ZXN0RmlsZXNOb3RJbnRlcm1pbmdsZWQoKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBGaWxlcyBhcmUgaW50ZXJtaW5nbGVkICMzODMzMSAtIGJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdHJldHVybiB0ZXN0RmlsZXNOb3RJbnRlcm1pbmdsZWQoKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBGaWxlcyBhcmUgaW50ZXJtaW5nbGVkICMzODMzMSAtIHVuYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXG5cdFx0cmV0dXJuIHRlc3RGaWxlc05vdEludGVybWluZ2xlZCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIEZpbGVzIGFyZSBpbnRlcm1pbmdsZWQgIzM4MzMxIC0gc3RyZWFtZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkU3RyZWFtKTtcblxuXHRcdHJldHVybiB0ZXN0RmlsZXNOb3RJbnRlcm1pbmdsZWQoKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdEZpbGVzTm90SW50ZXJtaW5nbGVkKCkge1xuXHRcdGNvbnN0IHJlc291cmNlMSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpKTtcblx0XHRjb25zdCByZXNvdXJjZTIgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzb21lX3V0ZjE2bGUuY3NzJykpO1xuXG5cdFx0Ly8gbG9hZCBpbiBzZXF1ZW5jZSBhbmQga2VlcCBkYXRhXG5cdFx0Y29uc3QgdmFsdWUxID0gYXdhaXQgc2VydmljZS5yZWFkRmlsZShyZXNvdXJjZTEpO1xuXHRcdGNvbnN0IHZhbHVlMiA9IGF3YWl0IHNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UyKTtcblxuXHRcdC8vIGxvYWQgaW4gcGFyYWxsZWwgaW4gZXhwZWN0IHRoZSBzYW1lIHJlc3VsdFxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UxKSxcblx0XHRcdHNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UyKVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS52YWx1ZS50b1N0cmluZygpLCB2YWx1ZTEudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFsxXS52YWx1ZS50b1N0cmluZygpLCB2YWx1ZTIudmFsdWUudG9TdHJpbmcoKSk7XG5cdH1cblxuXHR0ZXN0KCdyZWFkRmlsZSAtIGZyb20gcG9zaXRpb24gKEFTQ0lJKSAtIGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZUZyb21Qb3NpdGlvbkFzY2lpKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gZnJvbSBwb3NpdGlvbiAoQVNDSUkpIC0gYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZUZyb21Qb3NpdGlvbkFzY2lpKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gZnJvbSBwb3NpdGlvbiAoQVNDSUkpIC0gdW5idWZmZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG5cblx0XHRyZXR1cm4gdGVzdFJlYWRGaWxlRnJvbVBvc2l0aW9uQXNjaWkoKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBmcm9tIHBvc2l0aW9uIChBU0NJSSkgLSBzdHJlYW1lZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRTdHJlYW0pO1xuXG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZUZyb21Qb3NpdGlvbkFzY2lpKCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RSZWFkRmlsZUZyb21Qb3NpdGlvbkFzY2lpKCkge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwudHh0JykpO1xuXG5cdFx0Y29uc3QgY29udGVudHMgPSBhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlLCB7IHBvc2l0aW9uOiA2IH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRzLnZhbHVlLnRvU3RyaW5nKCksICdGaWxlJyk7XG5cdH1cblxuXHR0ZXN0KCdyZWFkRmlsZSAtIGZyb20gcG9zaXRpb24gKHdpdGggdW1sYXV0KSAtIGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZUZyb21Qb3NpdGlvblVtbGF1dCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIGZyb20gcG9zaXRpb24gKHdpdGggdW1sYXV0KSAtIGJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdHJldHVybiB0ZXN0UmVhZEZpbGVGcm9tUG9zaXRpb25VbWxhdXQoKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBmcm9tIHBvc2l0aW9uICh3aXRoIHVtbGF1dCkgLSB1bmJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdHJldHVybiB0ZXN0UmVhZEZpbGVGcm9tUG9zaXRpb25VbWxhdXQoKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBmcm9tIHBvc2l0aW9uICh3aXRoIHVtbGF1dCkgLSBzdHJlYW1lZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRTdHJlYW0pO1xuXG5cdFx0cmV0dXJuIHRlc3RSZWFkRmlsZUZyb21Qb3NpdGlvblVtbGF1dCgpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0UmVhZEZpbGVGcm9tUG9zaXRpb25VbWxhdXQoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbF91bWxhdXQudHh0JykpO1xuXG5cdFx0Y29uc3QgY29udGVudHMgPSBhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlLCB7IHBvc2l0aW9uOiBCdWZmZXIuZnJvbSgnU21hbGwgRmlsZSB3aXRoIFx1MDBEQycpLmxlbmd0aCB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50cy52YWx1ZS50b1N0cmluZygpLCAnbWxhdXQnKTtcblx0fVxuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gMyBieXRlcyAoQVNDSUkpIC0gZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdFJlYWRUaHJlZUJ5dGVzRnJvbUZpbGUoKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSAzIGJ5dGVzIChBU0NJSSkgLSBidWZmZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cblx0XHRyZXR1cm4gdGVzdFJlYWRUaHJlZUJ5dGVzRnJvbUZpbGUoKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSAzIGJ5dGVzIChBU0NJSSkgLSB1bmJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdHJldHVybiB0ZXN0UmVhZFRocmVlQnl0ZXNGcm9tRmlsZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIDMgYnl0ZXMgKEFTQ0lJKSAtIHN0cmVhbWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFN0cmVhbSk7XG5cblx0XHRyZXR1cm4gdGVzdFJlYWRUaHJlZUJ5dGVzRnJvbUZpbGUoKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdFJlYWRUaHJlZUJ5dGVzRnJvbUZpbGUoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSk7XG5cblx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UsIHsgbGVuZ3RoOiAzIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRzLnZhbHVlLnRvU3RyaW5nKCksICdTbWEnKTtcblx0fVxuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gMjAwMDAgYnl0ZXMgKGxhcmdlKSAtIGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJlYWRMYXJnZUZpbGVXaXRoTGVuZ3RoKDIwMDAwKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSAyMDAwMCBieXRlcyAobGFyZ2UpIC0gYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0cmV0dXJuIHJlYWRMYXJnZUZpbGVXaXRoTGVuZ3RoKDIwMDAwKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSAyMDAwMCBieXRlcyAobGFyZ2UpIC0gdW5idWZmZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG5cblx0XHRyZXR1cm4gcmVhZExhcmdlRmlsZVdpdGhMZW5ndGgoMjAwMDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIDIwMDAwIGJ5dGVzIChsYXJnZSkgLSBzdHJlYW1lZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRTdHJlYW0pO1xuXG5cdFx0cmV0dXJuIHJlYWRMYXJnZUZpbGVXaXRoTGVuZ3RoKDIwMDAwKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSA4MDAwMCBieXRlcyAobGFyZ2UpIC0gZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcmVhZExhcmdlRmlsZVdpdGhMZW5ndGgoODAwMDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIDgwMDAwIGJ5dGVzIChsYXJnZSkgLSBidWZmZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cblx0XHRyZXR1cm4gcmVhZExhcmdlRmlsZVdpdGhMZW5ndGgoODAwMDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIDgwMDAwIGJ5dGVzIChsYXJnZSkgLSB1bmJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdHJldHVybiByZWFkTGFyZ2VGaWxlV2l0aExlbmd0aCg4MDAwMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gODAwMDAgYnl0ZXMgKGxhcmdlKSAtIHN0cmVhbWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFN0cmVhbSk7XG5cblx0XHRyZXR1cm4gcmVhZExhcmdlRmlsZVdpdGhMZW5ndGgoODAwMDApO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiByZWFkTGFyZ2VGaWxlV2l0aExlbmd0aChsZW5ndGg6IG51bWJlcikge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpO1xuXG5cdFx0Y29uc3QgY29udGVudHMgPSBhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlLCB7IGxlbmd0aCB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50cy52YWx1ZS5ieXRlTGVuZ3RoLCBsZW5ndGgpO1xuXHR9XG5cblx0dGVzdCgncmVhZEZpbGUgLSBGSUxFX0lTX0RJUkVDVE9SWScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2RlZXAnKSk7XG5cblx0XHRsZXQgZXJyb3I6IEZpbGVPcGVyYXRpb25FcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRlcnJvciA9IGVycjtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soZXJyb3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvci5maWxlT3BlcmF0aW9uUmVzdWx0LCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfSVNfRElSRUNUT1JZKTtcblx0fSk7XG5cblx0KGlzV2luZG93cyAvKiBlcnJvciBjb2RlIGRvZXMgbm90IHNlZW0gdG8gYmUgc3VwcG9ydGVkIG9uIHdpbmRvd3MgKi8gPyB0ZXN0LnNraXAgOiB0ZXN0KSgncmVhZEZpbGUgLSBGSUxFX05PVF9ESVJFQ1RPUlknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQnLCAnZmlsZS50eHQnKSk7XG5cblx0XHRsZXQgZXJyb3I6IEZpbGVPcGVyYXRpb25FcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRlcnJvciA9IGVycjtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soZXJyb3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvci5maWxlT3BlcmF0aW9uUmVzdWx0LCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0RJUkVDVE9SWSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gRklMRV9OT1RfRk9VTkQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICc0MDQuaHRtbCcpKTtcblxuXHRcdGxldCBlcnJvcjogRmlsZU9wZXJhdGlvbkVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGVycm9yID0gZXJyO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLmZpbGVPcGVyYXRpb25SZXN1bHQsIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIEZJTEVfTk9UX01PRElGSUVEX1NJTkNFIC0gZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdE5vdE1vZGlmaWVkU2luY2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBGSUxFX05PVF9NT0RJRklFRF9TSU5DRSAtIGJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdHJldHVybiB0ZXN0Tm90TW9kaWZpZWRTaW5jZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSAtIEZJTEVfTk9UX01PRElGSUVEX1NJTkNFIC0gdW5idWZmZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG5cblx0XHRyZXR1cm4gdGVzdE5vdE1vZGlmaWVkU2luY2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBGSUxFX05PVF9NT0RJRklFRF9TSU5DRSAtIHN0cmVhbWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFN0cmVhbSk7XG5cblx0XHRyZXR1cm4gdGVzdE5vdE1vZGlmaWVkU2luY2UoKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdE5vdE1vZGlmaWVkU2luY2UoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdpbmRleC5odG1sJykpO1xuXG5cdFx0Y29uc3QgY29udGVudHMgPSBhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRmaWxlUHJvdmlkZXIudG90YWxCeXRlc1JlYWQgPSAwO1xuXG5cdFx0bGV0IGVycm9yOiBGaWxlT3BlcmF0aW9uRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UsIHsgZXRhZzogY29udGVudHMuZXRhZyB9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGVycm9yID0gZXJyO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLmZpbGVPcGVyYXRpb25SZXN1bHQsIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfTU9ESUZJRURfU0lOQ0UpO1xuXHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIE5vdE1vZGlmaWVkU2luY2VGaWxlT3BlcmF0aW9uRXJyb3IgJiYgZXJyb3Iuc3RhdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVQcm92aWRlci50b3RhbEJ5dGVzUmVhZCwgMCk7XG5cdH1cblxuXHR0ZXN0KCdyZWFkRmlsZSAtIEZJTEVfTk9UX01PRElGSUVEX1NJTkNFIGRvZXMgbm90IGZpcmUgd3JvbmdseSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy83MjkwOScsIGFzeW5jICgpID0+IHtcblx0XHRmaWxlUHJvdmlkZXIuc2V0SW52YWxpZFN0YXRTaXplKHRydWUpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdpbmRleC5odG1sJykpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSk7XG5cblx0XHRsZXQgZXJyb3I6IEZpbGVPcGVyYXRpb25FcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSwgeyBldGFnOiB1bmRlZmluZWQgfSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRlcnJvciA9IGVycjtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soIWVycm9yKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBGSUxFX1RPT19MQVJHRSAtIGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3RGaWxlVG9vTGFyZ2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEZpbGUgLSBGSUxFX1RPT19MQVJHRSAtIGJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdHJldHVybiB0ZXN0RmlsZVRvb0xhcmdlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gRklMRV9UT09fTEFSR0UgLSB1bmJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdHJldHVybiB0ZXN0RmlsZVRvb0xhcmdlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIC0gRklMRV9UT09fTEFSR0UgLSBzdHJlYW1lZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRTdHJlYW0pO1xuXG5cdFx0cmV0dXJuIHRlc3RGaWxlVG9vTGFyZ2UoKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdEZpbGVUb29MYXJnZSgpIHtcblx0XHRhd2FpdCBkb1Rlc3RGaWxlVG9vTGFyZ2UoZmFsc2UpO1xuXG5cdFx0Ly8gQWxzbyB0ZXN0IHdoZW4gdGhlIHN0YXQgc2l6ZSBpcyB3cm9uZ1xuXHRcdGZpbGVQcm92aWRlci5zZXRTbWFsbFN0YXRTaXplKHRydWUpO1xuXHRcdHJldHVybiBkb1Rlc3RGaWxlVG9vTGFyZ2UodHJ1ZSk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBkb1Rlc3RGaWxlVG9vTGFyZ2Uoc3RhdFNpemVXcm9uZzogYm9vbGVhbikge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnaW5kZXguaHRtbCcpKTtcblxuXHRcdGxldCBlcnJvcjogRmlsZU9wZXJhdGlvbkVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlLCB7IGxpbWl0czogeyBzaXplOiAxMCB9IH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZXJyb3IgPSBlcnI7XG5cdFx0fVxuXG5cdFx0aWYgKCFzdGF0U2l6ZVdyb25nKSB7XG5cdFx0XHRhc3NlcnQub2soZXJyb3IgaW5zdGFuY2VvZiBUb29MYXJnZUZpbGVPcGVyYXRpb25FcnJvcik7XG5cdFx0XHRhc3NlcnQub2sodHlwZW9mIGVycm9yLnNpemUgPT09ICdudW1iZXInKTtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yIS5maWxlT3BlcmF0aW9uUmVzdWx0LCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfVE9PX0xBUkdFKTtcblx0fVxuXG5cdChpc1dpbmRvd3MgPyB0ZXN0LnNraXAgLyogd2luZG93czogY2Fubm90IGNyZWF0ZSBmaWxlIHN5bWJvbGljIGxpbmsgd2l0aG91dCBlbGV2YXRlZCBjb250ZXh0ICovIDogdGVzdCkoJ3JlYWRGaWxlIC0gZGFuZ2xpbmcgc3ltYm9saWMgbGluayAtIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTYwNDknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGluayA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLmpzLWxpbmsnKSk7XG5cdFx0YXdhaXQgcHJvbWlzZXMuc3ltbGluayhqb2luKHRlc3REaXIsICdzbWFsbC5qcycpLCBsaW5rLmZzUGF0aCk7XG5cblx0XHRsZXQgZXJyb3I6IEZpbGVPcGVyYXRpb25FcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS5yZWFkRmlsZShsaW5rKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGVycm9yID0gZXJyO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIGFzc2VydENyZWF0ZUZpbGUoY29udGVudHMgPT4gVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50cykpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVGaWxlIChyZWFkYWJsZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIGFzc2VydENyZWF0ZUZpbGUoY29udGVudHMgPT4gYnVmZmVyVG9SZWFkYWJsZShWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnRzKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVGaWxlIChzdHJlYW0pJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBhc3NlcnRDcmVhdGVGaWxlKGNvbnRlbnRzID0+IGJ1ZmZlclRvU3RyZWFtKFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudHMpKSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGFzc2VydENyZWF0ZUZpbGUoY29udmVydGVyOiAoY29udGVudDogc3RyaW5nKSA9PiBWU0J1ZmZlciB8IFZTQnVmZmVyUmVhZGFibGUgfCBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiBldmVudCA9IGUpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnRzID0gJ0hlbGxvIFdvcmxkJztcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3Rlc3QudHh0JykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2FuQ3JlYXRlRmlsZShyZXNvdXJjZSksIHRydWUpO1xuXHRcdGNvbnN0IGZpbGVTdGF0ID0gYXdhaXQgc2VydmljZS5jcmVhdGVGaWxlKHJlc291cmNlLCBjb252ZXJ0ZXIoY29udGVudHMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZVN0YXQubmFtZSwgJ3Rlc3QudHh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMoZmlsZVN0YXQucmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhmaWxlU3RhdC5yZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCksIGNvbnRlbnRzKTtcblxuXHRcdGFzc2VydC5vayhldmVudCEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEucmVzb3VyY2UuZnNQYXRoLCByZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkNSRUFURSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS50YXJnZXQhLnJlc291cmNlLmZzUGF0aCwgcmVzb3VyY2UuZnNQYXRoKTtcblx0fVxuXG5cdHRlc3QoJ2NyZWF0ZUZpbGUgKGRvZXMgbm90IG92ZXJ3cml0ZSBieSBkZWZhdWx0KScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50cyA9ICdIZWxsbyBXb3JsZCc7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICd0ZXN0LnR4dCcpKTtcblxuXHRcdHdyaXRlRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoLCAnJyk7IC8vIGNyZWF0ZSBmaWxlXG5cblx0XHRhc3NlcnQub2soKGF3YWl0IHNlcnZpY2UuY2FuQ3JlYXRlRmlsZShyZXNvdXJjZSkpIGluc3RhbmNlb2YgRXJyb3IpO1xuXG5cdFx0bGV0IGVycm9yO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudHMpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGVycm9yID0gZXJyO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUZpbGUgKGFsbG93cyB0byBvdmVyd3JpdGUgZXhpc3RpbmcpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4gZXZlbnQgPSBlKSk7XG5cblx0XHRjb25zdCBjb250ZW50cyA9ICdIZWxsbyBXb3JsZCc7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICd0ZXN0LnR4dCcpKTtcblxuXHRcdHdyaXRlRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoLCAnJyk7IC8vIGNyZWF0ZSBmaWxlXG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5jYW5DcmVhdGVGaWxlKHJlc291cmNlLCB7IG92ZXJ3cml0ZTogdHJ1ZSB9KSwgdHJ1ZSk7XG5cdFx0Y29uc3QgZmlsZVN0YXQgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudHMpLCB7IG92ZXJ3cml0ZTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZVN0YXQubmFtZSwgJ3Rlc3QudHh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0c1N5bmMoZmlsZVN0YXQucmVzb3VyY2UuZnNQYXRoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhmaWxlU3RhdC5yZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCksIGNvbnRlbnRzKTtcblxuXHRcdGFzc2VydC5vayhldmVudCEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEucmVzb3VyY2UuZnNQYXRoLCByZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkNSRUFURSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS50YXJnZXQhLnJlc291cmNlLmZzUGF0aCwgcmVzb3VyY2UuZnNQYXRoKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIC0gZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdFdyaXRlRmlsZShmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAtIGZsdXNoIG9uIHdyaXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdERpc2tGaWxlU3lzdGVtUHJvdmlkZXIuY29uZmlndXJlRmx1c2hPbldyaXRlKHRydWUpO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGVzdFdyaXRlRmlsZShmYWxzZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdERpc2tGaWxlU3lzdGVtUHJvdmlkZXIuY29uZmlndXJlRmx1c2hPbldyaXRlKGZhbHNlKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAtIGJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdHJldHVybiB0ZXN0V3JpdGVGaWxlKGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIC0gdW5idWZmZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG5cblx0XHRyZXR1cm4gdGVzdFdyaXRlRmlsZShmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAtIGRlZmF1bHQgKGF0b21pYyknLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGUodHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAtIGZsdXNoIG9uIHdyaXRlIChhdG9taWMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdERpc2tGaWxlU3lzdGVtUHJvdmlkZXIuY29uZmlndXJlRmx1c2hPbldyaXRlKHRydWUpO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGVzdFdyaXRlRmlsZSh0cnVlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0RGlza0ZpbGVTeXN0ZW1Qcm92aWRlci5jb25maWd1cmVGbHVzaE9uV3JpdGUoZmFsc2UpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIC0gYnVmZmVyZWQgKGF0b21pYyknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UgfCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUF0b21pY1dyaXRlKTtcblxuXHRcdGxldCBlO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0ZXN0V3JpdGVGaWxlKHRydWUpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRlID0gZXJyb3I7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGUpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgLSB1bmJ1ZmZlcmVkIChhdG9taWMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlIHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBdG9taWNXcml0ZSk7XG5cblx0XHRyZXR1cm4gdGVzdFdyaXRlRmlsZSh0cnVlKTtcblx0fSk7XG5cblx0KGlzV2luZG93cyA/IHRlc3Quc2tpcCAvKiB3aW5kb3dzOiBjYW5ub3QgY3JlYXRlIGZpbGUgc3ltYm9saWMgbGluayB3aXRob3V0IGVsZXZhdGVkIGNvbnRleHQgKi8gOiB0ZXN0KSgnd3JpdGVGaWxlIC0gYXRvbWljIHdyaXRpbmcgZG9lcyBub3QgYnJlYWsgc3ltbGlua3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGluayA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dC1saW5rZWQnKSk7XG5cdFx0YXdhaXQgcHJvbWlzZXMuc3ltbGluayhqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSwgbGluay5mc1BhdGgpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9ICdVcGRhdGVzIHRvIHRoZSBsb3JlbSBmaWxlJztcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShsaW5rLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpLCB7IGF0b21pYzogeyBwb3N0Zml4OiAnLnZzY3RtcCcgfSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKGxpbmsuZnNQYXRoKS50b1N0cmluZygpLCBjb250ZW50KTtcblxuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKGxpbmspO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5pc1N5bWJvbGljTGluaywgdHJ1ZSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RXcml0ZUZpbGUoYXRvbWljOiBib29sZWFuKSB7XG5cdFx0bGV0IGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiBldmVudCA9IGUpKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwudHh0JykpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsICdTbWFsbCBGaWxlJyk7XG5cblx0XHRjb25zdCBuZXdDb250ZW50ID0gJ1VwZGF0ZXMgdG8gdGhlIHNtYWxsIGZpbGUnO1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0NvbnRlbnQpLCB7IGF0b21pYzogYXRvbWljID8geyBwb3N0Zml4OiAnLnZzY3RtcCcgfSA6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5mc1BhdGgsIHJlc291cmNlLmZzUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5vcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uV1JJVEUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCksIG5ld0NvbnRlbnQpO1xuXHR9XG5cblx0dGVzdCgnd3JpdGVGaWxlIChsYXJnZSBmaWxlKSAtIGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGVMYXJnZShmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAobGFyZ2UgZmlsZSkgLSBidWZmZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSk7XG5cblx0XHRyZXR1cm4gdGVzdFdyaXRlRmlsZUxhcmdlKGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIChsYXJnZSBmaWxlKSAtIHVuYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGVMYXJnZShmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAobGFyZ2UgZmlsZSkgLSBkZWZhdWx0IChhdG9taWMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiB0ZXN0V3JpdGVGaWxlTGFyZ2UodHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAobGFyZ2UgZmlsZSkgLSBidWZmZXJlZCAoYXRvbWljKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSB8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQXRvbWljV3JpdGUpO1xuXG5cdFx0bGV0IGU7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRlc3RXcml0ZUZpbGVMYXJnZSh0cnVlKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0ZSA9IGVycm9yO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhlKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIChsYXJnZSBmaWxlKSAtIHVuYnVmZmVyZWQgKGF0b21pYyknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUgfCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUF0b21pY1dyaXRlKTtcblxuXHRcdHJldHVybiB0ZXN0V3JpdGVGaWxlTGFyZ2UodHJ1ZSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RXcml0ZUZpbGVMYXJnZShhdG9taWM6IGJvb2xlYW4pIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSByZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRjb25zdCBuZXdDb250ZW50ID0gY29udGVudC50b1N0cmluZygpICsgY29udGVudC50b1N0cmluZygpO1xuXG5cdFx0Y29uc3QgZmlsZVN0YXQgPSBhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdDb250ZW50KSwgeyBhdG9taWM6IGF0b21pYyA/IHsgcG9zdGZpeDogJy52c2N0bXAnIH0gOiBmYWxzZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZVN0YXQubmFtZSwgJ2xvcmVtLnR4dCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCksIG5ld0NvbnRlbnQpO1xuXHR9XG5cblx0dGVzdCgnd3JpdGVGaWxlIChsYXJnZSBmaWxlKSAtIHVuYnVmZmVyZWQgKGF0b21pYykgLSBjb25jdXJyZW50IHdyaXRlcyB3aXRoIG11bHRpcGxlIHNlcnZpY2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlIHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBdG9taWNXcml0ZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSByZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRjb25zdCBuZXdDb250ZW50ID0gY29udGVudC50b1N0cmluZygpICsgY29udGVudC50b1N0cmluZygpO1xuXG5cdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPltdID0gW107XG5cdFx0bGV0IHN1ZmZpeCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDsgaSsrKSB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmZpbGUsIGZpbGVQcm92aWRlcikpO1xuXG5cdFx0XHRwcm9taXNlcy5wdXNoKHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGAke25ld0NvbnRlbnR9JHsrK3N1ZmZpeH1gKSwgeyBhdG9taWM6IHsgcG9zdGZpeDogJy52c2N0bXAnIH0gfSkpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHR9XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQocHJvbWlzZXMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCksIGAke25ld0NvbnRlbnR9JHtzdWZmaXh9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAtIGJ1ZmZlcmVkIC0gcmVhZG9ubHkgdGhyb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlIHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlJlYWRvbmx5KTtcblxuXHRcdHJldHVybiB0ZXN0V3JpdGVGaWxlUmVhZG9ubHlUaHJvd3MoKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIC0gdW5idWZmZXJlZCAtIHJlYWRvbmx5IHRocm93cycsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSB8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5SZWFkb25seSk7XG5cblx0XHRyZXR1cm4gdGVzdFdyaXRlRmlsZVJlYWRvbmx5VGhyb3dzKCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RXcml0ZUZpbGVSZWFkb25seVRocm93cygpIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSByZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCAnU21hbGwgRmlsZScpO1xuXG5cdFx0Y29uc3QgbmV3Q29udGVudCA9ICdVcGRhdGVzIHRvIHRoZSBzbWFsbCBmaWxlJztcblxuXHRcdGxldCBlcnJvcjogRXJyb3I7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0NvbnRlbnQpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGVycm9yID0gZXJyO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhlcnJvciEpO1xuXHR9XG5cblx0dGVzdCgnd3JpdGVGaWxlIChsYXJnZSBmaWxlKSAtIG11bHRpcGxlIHBhcmFsbGVsIHdyaXRlcyBxdWV1ZSB1cCBhbmQgYXRvbWljIHJlYWQgc3VwcG9ydCAodmlhIGZpbGUgc2VydmljZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gcmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCk7XG5cdFx0Y29uc3QgbmV3Q29udGVudCA9IGNvbnRlbnQudG9TdHJpbmcoKSArIGNvbnRlbnQudG9TdHJpbmcoKTtcblxuXHRcdGNvbnN0IHdyaXRlUHJvbWlzZXMgPSBQcm9taXNlLmFsbChbJzAnLCAnMDAnLCAnMDAwJywgJzAwMDAnLCAnMDAwMDAnXS5tYXAoYXN5bmMgb2Zmc2V0ID0+IHtcblx0XHRcdGNvbnN0IGZpbGVTdGF0ID0gYXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcob2Zmc2V0ICsgbmV3Q29udGVudCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVTdGF0Lm5hbWUsICdsb3JlbS50eHQnKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCByZWFkUHJvbWlzZXMgPSBQcm9taXNlLmFsbChbJzAnLCAnMDAnLCAnMDAwJywgJzAwMDAnLCAnMDAwMDAnXS5tYXAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZUNvbnRlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlLCB7IGF0b21pYzogdHJ1ZSB9KTtcblx0XHRcdGFzc2VydC5vayhmaWxlQ29udGVudC52YWx1ZS5ieXRlTGVuZ3RoID4gMCk7IC8vIGBhdG9taWM6IHRydWVgIGVuc3VyZXMgd2UgbmV2ZXIgcmVhZCBhIHRydW5jYXRlZCBmaWxlXG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW3dyaXRlUHJvbWlzZXMsIHJlYWRQcm9taXNlc10pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciAtIHdyaXRlIGJhcnJpZXIgcHJldmVudHMgZGlydHkgd3JpdGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSBjb250ZW50LnRvU3RyaW5nKCkgKyBjb250ZW50LnRvU3RyaW5nKCk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHNlcnZpY2UuZ2V0UHJvdmlkZXIocmVzb3VyY2Uuc2NoZW1lKTtcblx0XHRhc3NlcnQub2socHJvdmlkZXIpO1xuXHRcdGFzc2VydC5vayhoYXNPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5KHByb3ZpZGVyKSk7XG5cblx0XHRjb25zdCB3cml0ZVByb21pc2VzID0gUHJvbWlzZS5hbGwoWycwJywgJzAwJywgJzAwMCcsICcwMDAwJywgJzAwMDAwJ10ubWFwKGFzeW5jIG9mZnNldCA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gb2Zmc2V0ICsgbmV3Q29udGVudDtcblx0XHRcdGNvbnN0IGNvbnRlbnRCdWZmZXIgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpLmJ1ZmZlcjtcblxuXHRcdFx0Y29uc3QgZmQgPSBhd2FpdCBwcm92aWRlci5vcGVuKHJlc291cmNlLCB7IGNyZWF0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHByb3ZpZGVyLndyaXRlKGZkLCAwLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpLmJ1ZmZlciwgMCwgY29udGVudEJ1ZmZlci5ieXRlTGVuZ3RoKTtcblxuXHRcdFx0XHQvLyBIZXJlIHNpbmNlIGBjbG9zZWAgaXMgbm90IGNhbGxlZCwgYWxsIG90aGVyIHdyaXRlcyBhcmVcblx0XHRcdFx0Ly8gd2FpdGluZyBvbiB0aGUgYmFycmllciB0byByZWxlYXNlLCBzbyBkb2luZyBhIHJlYWRGaWxlXG5cdFx0XHRcdC8vIHNob3VsZCBnaXZlIHVzIGEgY29uc2lzdGVudCB2aWV3IG9mIHRoZSBmaWxlIGNvbnRlbnRzXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgcHJvbWlzZXMucmVhZEZpbGUocmVzb3VyY2UuZnNQYXRoKSkudG9TdHJpbmcoKSwgY29udGVudCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBwcm92aWRlci5jbG9zZShmZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW3dyaXRlUHJvbWlzZXNdKTtcblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZXIgLSB3cml0ZSBiYXJyaWVyIGlzIHBhcnRpdGlvbmVkIHBlciByZXNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZTEgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UyID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAndGVzdC50eHQnKSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHNlcnZpY2UuZ2V0UHJvdmlkZXIocmVzb3VyY2UxLnNjaGVtZSk7XG5cdFx0YXNzZXJ0Lm9rKHByb3ZpZGVyKTtcblx0XHRhc3NlcnQub2soaGFzT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eShwcm92aWRlcikpO1xuXG5cdFx0Y29uc3QgZmQxID0gYXdhaXQgcHJvdmlkZXIub3BlbihyZXNvdXJjZTEsIHsgY3JlYXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IGZkMiA9IGF3YWl0IHByb3ZpZGVyLm9wZW4ocmVzb3VyY2UyLCB7IGNyZWF0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSB9KTtcblxuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSAnSGVsbG8gV29ybGQnO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHByb3ZpZGVyLndyaXRlKGZkMSwgMCwgVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdDb250ZW50KS5idWZmZXIsIDAsIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3Q29udGVudCkuYnVmZmVyLmJ5dGVMZW5ndGgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBwcm9taXNlcy5yZWFkRmlsZShyZXNvdXJjZTEuZnNQYXRoKSkudG9TdHJpbmcoKSwgbmV3Q29udGVudCk7XG5cblx0XHRcdGF3YWl0IHByb3ZpZGVyLndyaXRlKGZkMiwgMCwgVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdDb250ZW50KS5idWZmZXIsIDAsIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3Q29udGVudCkuYnVmZmVyLmJ5dGVMZW5ndGgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBwcm9taXNlcy5yZWFkRmlsZShyZXNvdXJjZTIuZnNQYXRoKSkudG9TdHJpbmcoKSwgbmV3Q29udGVudCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChbXG5cdFx0XHRcdGF3YWl0IHByb3ZpZGVyLmNsb3NlKGZkMSksXG5cdFx0XHRcdGF3YWl0IHByb3ZpZGVyLmNsb3NlKGZkMilcblx0XHRcdF0pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZXIgLSB3cml0ZSBiYXJyaWVyIG5vdCBiZWNvbWluZyBzdGFsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBuZXdGb2xkZXIgPSBqb2luKHRlc3REaXIsICduZXctZm9sZGVyJyk7XG5cdFx0Y29uc3QgbmV3UmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKG5ld0ZvbGRlciwgJ2xvcmVtLnR4dCcpKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gc2VydmljZS5nZXRQcm92aWRlcihuZXdSZXNvdXJjZS5zY2hlbWUpO1xuXHRcdGFzc2VydC5vayhwcm92aWRlcik7XG5cdFx0YXNzZXJ0Lm9rKGhhc09wZW5SZWFkV3JpdGVDbG9zZUNhcGFiaWxpdHkocHJvdmlkZXIpKTtcblxuXHRcdGxldCBlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHByb3ZpZGVyLm9wZW4obmV3UmVzb3VyY2UsIHsgY3JlYXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlIH0pO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGVycm9yID0gZTtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soZXJyb3IpOyAvLyBleHBlY3RlZCBiZWNhdXNlIGBuZXctZm9sZGVyYCBkb2VzIG5vdCBleGlzdFxuXG5cdFx0YXdhaXQgcHJvbWlzZXMubWtkaXIobmV3Rm9sZGVyKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSByZWFkRmlsZVN5bmMoVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpLmZzUGF0aCk7XG5cdFx0Y29uc3QgbmV3Q29udGVudCA9IGNvbnRlbnQudG9TdHJpbmcoKSArIGNvbnRlbnQudG9TdHJpbmcoKTtcblx0XHRjb25zdCBuZXdDb250ZW50QnVmZmVyID0gVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdDb250ZW50KS5idWZmZXI7XG5cblx0XHRjb25zdCBmZCA9IGF3YWl0IHByb3ZpZGVyLm9wZW4obmV3UmVzb3VyY2UsIHsgY3JlYXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlIH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBwcm92aWRlci53cml0ZShmZCwgMCwgbmV3Q29udGVudEJ1ZmZlciwgMCwgbmV3Q29udGVudEJ1ZmZlci5ieXRlTGVuZ3RoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBwcm9taXNlcy5yZWFkRmlsZShuZXdSZXNvdXJjZS5mc1BhdGgpKS50b1N0cmluZygpLCBuZXdDb250ZW50KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgcHJvdmlkZXIuY2xvc2UoZmQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZXIgLSBhdG9taWMgcmVhZHMgKHdyaXRlIHBlbmRpbmcgd2hlbiByZWFkIHN0YXJ0cyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gcmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCk7XG5cdFx0Y29uc3QgbmV3Q29udGVudCA9IGNvbnRlbnQudG9TdHJpbmcoKSArIGNvbnRlbnQudG9TdHJpbmcoKTtcblx0XHRjb25zdCBuZXdDb250ZW50QnVmZmVyID0gVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdDb250ZW50KS5idWZmZXI7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHNlcnZpY2UuZ2V0UHJvdmlkZXIocmVzb3VyY2Uuc2NoZW1lKTtcblx0XHRhc3NlcnQub2socHJvdmlkZXIpO1xuXHRcdGFzc2VydC5vayhoYXNPcGVuUmVhZFdyaXRlQ2xvc2VDYXBhYmlsaXR5KHByb3ZpZGVyKSk7XG5cdFx0YXNzZXJ0Lm9rKGhhc0ZpbGVBdG9taWNSZWFkQ2FwYWJpbGl0eShwcm92aWRlcikpO1xuXG5cdFx0bGV0IGF0b21pY1JlYWRQcm9taXNlOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGZkID0gYXdhaXQgcHJvdmlkZXIub3BlbihyZXNvdXJjZSwgeyBjcmVhdGU6IHRydWUsIHVubG9jazogZmFsc2UgfSk7XG5cdFx0dHJ5IHtcblxuXHRcdFx0Ly8gU3RhcnQgcmVhZGluZyB3aGlsZSB3cml0ZSBpcyBwZW5kaW5nXG5cdFx0XHRhdG9taWNSZWFkUHJvbWlzZSA9IHByb3ZpZGVyLnJlYWRGaWxlKHJlc291cmNlLCB7IGF0b21pYzogdHJ1ZSB9KTtcblxuXHRcdFx0Ly8gU2ltdWxhdGUgYSBzbG93IHdyaXRlLCBnaXZpbmcgdGhlIHJlYWRcblx0XHRcdC8vIGEgY2hhbmNlIHRvIHN1Y2NlZWQgaWYgaXQgd2VyZSBub3QgYXRvbWljXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDIwKTtcblxuXHRcdFx0YXdhaXQgcHJvdmlkZXIud3JpdGUoZmQsIDAsIG5ld0NvbnRlbnRCdWZmZXIsIDAsIG5ld0NvbnRlbnRCdWZmZXIuYnl0ZUxlbmd0aCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IHByb3ZpZGVyLmNsb3NlKGZkKTtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soYXRvbWljUmVhZFByb21pc2UpO1xuXG5cdFx0Y29uc3QgYXRvbWljUmVhZFJlc3VsdCA9IGF3YWl0IGF0b21pY1JlYWRQcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdG9taWNSZWFkUmVzdWx0LmJ5dGVMZW5ndGgsIG5ld0NvbnRlbnRCdWZmZXIuYnl0ZUxlbmd0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb3ZpZGVyIC0gYXRvbWljIHJlYWRzIChyZWFkIHBlbmRpbmcgd2hlbiB3cml0ZSBzdGFydHMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSBjb250ZW50LnRvU3RyaW5nKCkgKyBjb250ZW50LnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgbmV3Q29udGVudEJ1ZmZlciA9IFZTQnVmZmVyLmZyb21TdHJpbmcobmV3Q29udGVudCkuYnVmZmVyO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBzZXJ2aWNlLmdldFByb3ZpZGVyKHJlc291cmNlLnNjaGVtZSk7XG5cdFx0YXNzZXJ0Lm9rKHByb3ZpZGVyKTtcblx0XHRhc3NlcnQub2soaGFzT3BlblJlYWRXcml0ZUNsb3NlQ2FwYWJpbGl0eShwcm92aWRlcikpO1xuXHRcdGFzc2VydC5vayhoYXNGaWxlQXRvbWljUmVhZENhcGFiaWxpdHkocHJvdmlkZXIpKTtcblxuXHRcdGxldCBhdG9taWNSZWFkUHJvbWlzZSA9IHByb3ZpZGVyLnJlYWRGaWxlKHJlc291cmNlLCB7IGF0b21pYzogdHJ1ZSB9KTtcblxuXHRcdGNvbnN0IGZkUHJvbWlzZSA9IHByb3ZpZGVyLm9wZW4ocmVzb3VyY2UsIHsgY3JlYXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlIH0pLnRoZW4oYXN5bmMgZmQgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHByb3ZpZGVyLndyaXRlKGZkLCAwLCBuZXdDb250ZW50QnVmZmVyLCAwLCBuZXdDb250ZW50QnVmZmVyLmJ5dGVMZW5ndGgpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgcHJvdmlkZXIuY2xvc2UoZmQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0bGV0IGF0b21pY1JlYWRSZXN1bHQgPSBhd2FpdCBhdG9taWNSZWFkUHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXRvbWljUmVhZFJlc3VsdC5ieXRlTGVuZ3RoLCBjb250ZW50LmJ5dGVMZW5ndGgpO1xuXG5cdFx0YXdhaXQgZmRQcm9taXNlO1xuXG5cdFx0YXRvbWljUmVhZFByb21pc2UgPSBwcm92aWRlci5yZWFkRmlsZShyZXNvdXJjZSwgeyBhdG9taWM6IHRydWUgfSk7XG5cdFx0YXRvbWljUmVhZFJlc3VsdCA9IGF3YWl0IGF0b21pY1JlYWRQcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdG9taWNSZWFkUmVzdWx0LmJ5dGVMZW5ndGgsIG5ld0NvbnRlbnRCdWZmZXIuYnl0ZUxlbmd0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAocmVhZGFibGUpIC0gZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gdGVzdFdyaXRlRmlsZVJlYWRhYmxlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAocmVhZGFibGUpIC0gYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGVSZWFkYWJsZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgKHJlYWRhYmxlKSAtIHVuYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGVSZWFkYWJsZSgpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0V3JpdGVGaWxlUmVhZGFibGUoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gcmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudCwgJ1NtYWxsIEZpbGUnKTtcblxuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSAnVXBkYXRlcyB0byB0aGUgc21hbGwgZmlsZSc7XG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIHRvTGluZUJ5TGluZVJlYWRhYmxlKG5ld0NvbnRlbnQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpLCBuZXdDb250ZW50KTtcblx0fVxuXG5cdHRlc3QoJ3dyaXRlRmlsZSAobGFyZ2UgZmlsZSAtIHJlYWRhYmxlKSAtIGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGVMYXJnZVJlYWRhYmxlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAobGFyZ2UgZmlsZSAtIHJlYWRhYmxlKSAtIGJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdHJldHVybiB0ZXN0V3JpdGVGaWxlTGFyZ2VSZWFkYWJsZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgKGxhcmdlIGZpbGUgLSByZWFkYWJsZSkgLSB1bmJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlKTtcblxuXHRcdHJldHVybiB0ZXN0V3JpdGVGaWxlTGFyZ2VSZWFkYWJsZSgpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0V3JpdGVGaWxlTGFyZ2VSZWFkYWJsZSgpIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSByZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKTtcblx0XHRjb25zdCBuZXdDb250ZW50ID0gY29udGVudC50b1N0cmluZygpICsgY29udGVudC50b1N0cmluZygpO1xuXG5cdFx0Y29uc3QgZmlsZVN0YXQgPSBhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgdG9MaW5lQnlMaW5lUmVhZGFibGUobmV3Q29udGVudCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlU3RhdC5uYW1lLCAnbG9yZW0udHh0Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKSwgbmV3Q29udGVudCk7XG5cdH1cblxuXHR0ZXN0KCd3cml0ZUZpbGUgKHN0cmVhbSkgLSBkZWZhdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiB0ZXN0V3JpdGVGaWxlU3RyZWFtKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAoc3RyZWFtKSAtIGJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdHJldHVybiB0ZXN0V3JpdGVGaWxlU3RyZWFtKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAoc3RyZWFtKSAtIHVuYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGVTdHJlYW0oKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdFdyaXRlRmlsZVN0cmVhbSgpIHtcblx0XHRjb25zdCBzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwtY29weS50eHQnKSk7XG5cblx0XHRjb25zdCBmaWxlU3RhdCA9IGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHRhcmdldCwgc3RyZWFtVG9CdWZmZXJSZWFkYWJsZVN0cmVhbShjcmVhdGVSZWFkU3RyZWFtKHNvdXJjZS5mc1BhdGgpKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVTdGF0Lm5hbWUsICdzbWFsbC1jb3B5LnR4dCcpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudHMgPSByZWFkRmlsZVN5bmModGFyZ2V0LmZzUGF0aCkudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKHNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCksIHRhcmdldENvbnRlbnRzKTtcblx0fVxuXG5cdHRlc3QoJ3dyaXRlRmlsZSAobGFyZ2UgZmlsZSAtIHN0cmVhbSkgLSBkZWZhdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiB0ZXN0V3JpdGVGaWxlTGFyZ2VTdHJlYW0oKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIChsYXJnZSBmaWxlIC0gc3RyZWFtKSAtIGJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdHJldHVybiB0ZXN0V3JpdGVGaWxlTGFyZ2VTdHJlYW0oKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIChsYXJnZSBmaWxlIC0gc3RyZWFtKSAtIHVuYnVmZmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUpO1xuXG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGVMYXJnZVN0cmVhbSgpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0V3JpdGVGaWxlTGFyZ2VTdHJlYW0oKSB7XG5cdFx0Y29uc3Qgc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpO1xuXHRcdGNvbnN0IHRhcmdldCA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2xvcmVtLWNvcHkudHh0JykpO1xuXG5cdFx0Y29uc3QgZmlsZVN0YXQgPSBhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZSh0YXJnZXQsIHN0cmVhbVRvQnVmZmVyUmVhZGFibGVTdHJlYW0oY3JlYXRlUmVhZFN0cmVhbShzb3VyY2UuZnNQYXRoKSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlU3RhdC5uYW1lLCAnbG9yZW0tY29weS50eHQnKTtcblxuXHRcdGNvbnN0IHRhcmdldENvbnRlbnRzID0gcmVhZEZpbGVTeW5jKHRhcmdldC5mc1BhdGgpLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpLCB0YXJnZXRDb250ZW50cyk7XG5cdH1cblxuXHR0ZXN0KCd3cml0ZUZpbGUgKGZpbGUgaXMgY3JlYXRlZCBpbmNsdWRpbmcgcGFyZW50cyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdvdGhlcicsICduZXdmaWxlLnR4dCcpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSAnRmlsZSBpcyBjcmVhdGVkIGluY2x1ZGluZyBwYXJlbnQnO1xuXHRcdGNvbnN0IGZpbGVTdGF0ID0gYXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlU3RhdC5uYW1lLCAnbmV3ZmlsZS50eHQnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpLCBjb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIC0gbG9ja2VkIGZpbGVzIGFuZCB1bmxvY2tpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUgfCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVdyaXRlVW5sb2NrKTtcblxuXHRcdHJldHVybiB0ZXN0TG9ja2VkRmlsZXMoZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgKHN0cmVhbSkgLSBsb2NrZWQgZmlsZXMgYW5kIHVubG9ja2luZycsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSB8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlV3JpdGVVbmxvY2spO1xuXG5cdFx0cmV0dXJuIHRlc3RMb2NrZWRGaWxlcyhmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAtIGxvY2tlZCBmaWxlcyBhbmQgdW5sb2NraW5nIHRocm93cyBlcnJvciB3aGVuIG1pc3NpbmcgY2FwYWJpbGl0eScsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSk7XG5cblx0XHRyZXR1cm4gdGVzdExvY2tlZEZpbGVzKHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgKHN0cmVhbSkgLSBsb2NrZWQgZmlsZXMgYW5kIHVubG9ja2luZyB0aHJvd3MgZXJyb3Igd2hlbiBtaXNzaW5nIGNhcGFiaWxpdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpO1xuXG5cdFx0cmV0dXJuIHRlc3RMb2NrZWRGaWxlcyh0cnVlKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdExvY2tlZEZpbGVzKGV4cGVjdEVycm9yOiBib29sZWFuKSB7XG5cdFx0Y29uc3QgbG9ja2VkRmlsZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ215LWxvY2tlZC1maWxlJykpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKGxvY2tlZEZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ0xvY2tlZCBGaWxlJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LmxvY2tlZCwgZmFsc2UpO1xuXG5cdFx0Y29uc3Qgc3RhdHMgPSBhd2FpdCBwcm9taXNlcy5zdGF0KGxvY2tlZEZpbGUuZnNQYXRoKTtcblx0XHRhd2FpdCBwcm9taXNlcy5jaG1vZChsb2NrZWRGaWxlLmZzUGF0aCwgc3RhdHMubW9kZSAmIH4wbzIwMCk7XG5cblx0XHRsZXQgc3RhdCA9IGF3YWl0IHNlcnZpY2Uuc3RhdChsb2NrZWRGaWxlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdC5sb2NrZWQsIHRydWUpO1xuXG5cdFx0bGV0IGVycm9yO1xuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSAnVXBkYXRlcyB0byBsb2NrZWQgZmlsZSc7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKGxvY2tlZEZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3Q29udGVudCkpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGVycm9yID0gZTtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soZXJyb3IpO1xuXHRcdGVycm9yID0gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGV4cGVjdEVycm9yKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShsb2NrZWRGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0NvbnRlbnQpLCB7IHVubG9jazogdHJ1ZSB9KTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0ZXJyb3IgPSBlO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQub2soZXJyb3IpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShsb2NrZWRGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0NvbnRlbnQpLCB7IHVubG9jazogdHJ1ZSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMobG9ja2VkRmlsZS5mc1BhdGgpLnRvU3RyaW5nKCksIG5ld0NvbnRlbnQpO1xuXG5cdFx0XHRzdGF0ID0gYXdhaXQgc2VydmljZS5zdGF0KGxvY2tlZEZpbGUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXQubG9ja2VkLCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0dGVzdCgnd3JpdGVGaWxlIChlcnJvciB3aGVuIGZvbGRlciBpcyBlbmNvdW50ZXJlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSh0ZXN0RGlyKTtcblxuXHRcdGxldCBlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdGaWxlIGlzIGNyZWF0ZWQgaW5jbHVkaW5nIHBhcmVudCcpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGVycm9yID0gZXJyO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAobm8gZXJyb3Igd2hlbiBwcm92aWRpbmcgdXAgdG8gZGF0ZSBldGFnKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKTtcblxuXHRcdGNvbnN0IHN0YXQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsICdTbWFsbCBGaWxlJyk7XG5cblx0XHRjb25zdCBuZXdDb250ZW50ID0gJ1VwZGF0ZXMgdG8gdGhlIHNtYWxsIGZpbGUnO1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0NvbnRlbnQpLCB7IGV0YWc6IHN0YXQuZXRhZywgbXRpbWU6IHN0YXQubXRpbWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKSwgbmV3Q29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAtIGVycm9yIHdoZW4gd3JpdGluZyB0byBmaWxlIHRoYXQgaGFzIGJlZW4gdXBkYXRlZCBtZWFud2hpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSk7XG5cblx0XHRjb25zdCBzdGF0ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHJlc291cmNlKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSByZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCAnU21hbGwgRmlsZScpO1xuXG5cdFx0Y29uc3QgbmV3Q29udGVudCA9ICdVcGRhdGVzIHRvIHRoZSBzbWFsbCBmaWxlJztcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdDb250ZW50KSwgeyBldGFnOiBzdGF0LmV0YWcsIG10aW1lOiBzdGF0Lm10aW1lIH0pO1xuXG5cdFx0Y29uc3QgbmV3Q29udGVudExlYWRpbmdUb0Vycm9yID0gbmV3Q29udGVudCArIG5ld0NvbnRlbnQ7XG5cblx0XHRjb25zdCBmYWtlTXRpbWUgPSAxMDAwO1xuXHRcdGNvbnN0IGZha2VTaXplID0gMTAwMDtcblxuXHRcdGxldCBlcnJvcjogRmlsZU9wZXJhdGlvbkVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdDb250ZW50TGVhZGluZ1RvRXJyb3IpLCB7IGV0YWc6IGV0YWcoeyBtdGltZTogZmFrZU10aW1lLCBzaXplOiBmYWtlU2l6ZSB9KSwgbXRpbWU6IGZha2VNdGltZSB9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGVycm9yID0gZXJyO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cdFx0YXNzZXJ0Lm9rKGVycm9yIGluc3RhbmNlb2YgRmlsZU9wZXJhdGlvbkVycm9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IuZmlsZU9wZXJhdGlvblJlc3VsdCwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX01PRElGSUVEX1NJTkNFKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIC0gbm8gZXJyb3Igd2hlbiB3cml0aW5nIHRvIGZpbGUgd2hlcmUgc2l6ZSBpcyB0aGUgc2FtZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKTtcblxuXHRcdGNvbnN0IHN0YXQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsICdTbWFsbCBGaWxlJyk7XG5cblx0XHRjb25zdCBuZXdDb250ZW50ID0gY29udGVudDsgLy8gc2FtZSBjb250ZW50XG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3Q29udGVudCksIHsgZXRhZzogc3RhdC5ldGFnLCBtdGltZTogc3RhdC5tdGltZSB9KTtcblxuXHRcdGNvbnN0IG5ld0NvbnRlbnRMZWFkaW5nVG9Ob0Vycm9yID0gbmV3Q29udGVudDsgLy8gd3JpdGluZyB0aGUgc2FtZSBjb250ZW50IHNob3VsZCBiZSBPS1xuXG5cdFx0Y29uc3QgZmFrZU10aW1lID0gMTAwMDtcblx0XHRjb25zdCBhY3R1YWxTaXplID0gbmV3Q29udGVudC5sZW5ndGg7XG5cblx0XHRsZXQgZXJyb3I6IEZpbGVPcGVyYXRpb25FcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3Q29udGVudExlYWRpbmdUb05vRXJyb3IpLCB7IGV0YWc6IGV0YWcoeyBtdGltZTogZmFrZU10aW1lLCBzaXplOiBhY3R1YWxTaXplIH0pLCBtdGltZTogZmFrZU10aW1lIH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZXJyb3IgPSBlcnI7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKCFlcnJvcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAtIG5vIGVycm9yIHdoZW4gd3JpdGluZyB0byBmaWxlIHdoZXJlIGNvbnRlbnQgaXMgdGhlIHNhbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IHJlYWRGaWxlU3luYyhyZXNvdXJjZS5mc1BhdGgpLnRvU3RyaW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsICdTbWFsbCBGaWxlJyk7XG5cblx0XHRjb25zdCBuZXdDb250ZW50ID0gY29udGVudDsgLy8gc2FtZSBjb250ZW50XG5cdFx0bGV0IGVycm9yOiBGaWxlT3BlcmF0aW9uRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0NvbnRlbnQpLCB7IGV0YWc6ICdhbnl0aGluZycsIG10aW1lOiAwIH0gLyogZmFrZSBpdCAqLyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRlcnJvciA9IGVycjtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soIWVycm9yKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIC0gZXJyb3Igd2hlbiB3cml0aW5nIHRvIGZpbGUgd2hlcmUgY29udGVudCBpcyB0aGUgc2FtZSBsZW5ndGggYnV0IGRpZmZlcmVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVzb2x2ZShyZXNvdXJjZSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gcmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudCwgJ1NtYWxsIEZpbGUnKTtcblxuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSBjb250ZW50LnNwbGl0KCcnKS5yZXZlcnNlKCkuam9pbignJyk7IC8vIHJldmVyc2UgY29udGVudFxuXHRcdGxldCBlcnJvcjogRmlsZU9wZXJhdGlvbkVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhuZXdDb250ZW50KSwgeyBldGFnOiAnYW55dGhpbmcnLCBtdGltZTogMCB9IC8qIGZha2UgaXQgKi8pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZXJyb3IgPSBlcnI7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGVycm9yKTtcblx0XHRhc3NlcnQub2soZXJyb3IgaW5zdGFuY2VvZiBGaWxlT3BlcmF0aW9uRXJyb3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvci5maWxlT3BlcmF0aW9uUmVzdWx0LCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9ESUZJRURfU0lOQ0UpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgLSBubyBlcnJvciB3aGVuIHdyaXRpbmcgdG8gc2FtZSBub25leGlzdGVudCBmb2xkZXIgbXVsdGlwbGUgdGltZXMgZGlmZmVyZW50IG5ldyBmaWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBuZXdGb2xkZXIgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzb21lJywgJ25ldycsICdmb2xkZXInKSk7XG5cblx0XHRjb25zdCBmaWxlMSA9IGpvaW5QYXRoKG5ld0ZvbGRlciwgJ2ZpbGUtMScpO1xuXHRcdGNvbnN0IGZpbGUyID0gam9pblBhdGgobmV3Rm9sZGVyLCAnZmlsZS0yJyk7XG5cdFx0Y29uc3QgZmlsZTMgPSBqb2luUGF0aChuZXdGb2xkZXIsICdmaWxlLTMnKTtcblxuXHRcdC8vIHRoaXMgZXNzZW50aWFsbHkgdmVyaWZpZXMgdGhhdCB0aGUgbWtkaXJwIGxvZ2ljIGltcGxlbWVudGVkXG5cdFx0Ly8gaW4gdGhlIGZpbGUgc2VydmljZSBpcyBhYmxlIHRvIHJlY2VpdmUgbXVsdGlwbGUgcmVxdWVzdHMgZm9yXG5cdFx0Ly8gdGhlIHNhbWUgZm9sZGVyIGFuZCB3aWxsIG5vdCB0aHJvdyBlcnJvcnMgaWYgYW5vdGhlciByYWNpbmdcblx0XHQvLyBjYWxsIHN1Y2NlZWRlZCBmaXJzdC5cblx0XHRjb25zdCBuZXdDb250ZW50ID0gJ1VwZGF0ZXMgdG8gdGhlIHNtYWxsIGZpbGUnO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHNlcnZpY2Uud3JpdGVGaWxlKGZpbGUxLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0NvbnRlbnQpKSxcblx0XHRcdHNlcnZpY2Uud3JpdGVGaWxlKGZpbGUyLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0NvbnRlbnQpKSxcblx0XHRcdHNlcnZpY2Uud3JpdGVGaWxlKGZpbGUzLCBWU0J1ZmZlci5mcm9tU3RyaW5nKG5ld0NvbnRlbnQpKVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZXhpc3RzKGZpbGUxKSk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZXhpc3RzKGZpbGUyKSk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZXhpc3RzKGZpbGUzKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAtIGVycm9yIHdoZW4gd3JpdGluZyB0byBmb2xkZXIgdGhhdCBpcyBhIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXhpc3RpbmdGaWxlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbXktZmlsZScpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlRmlsZShleGlzdGluZ0ZpbGUpO1xuXG5cdFx0Y29uc3QgbmV3RmlsZSA9IGpvaW5QYXRoKGV4aXN0aW5nRmlsZSwgJ2ZpbGUtMScpO1xuXG5cdFx0bGV0IGVycm9yO1xuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSAnVXBkYXRlcyB0byB0aGUgc21hbGwgZmlsZSc7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKG5ld0ZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3Q29udGVudCkpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGVycm9yID0gZTtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soZXJyb3IpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBlbmRGaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlIHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBcHBlbmQpO1xuXG5cdFx0cmV0dXJuIHRlc3RBcHBlbmRGaWxlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGVuZEZpbGUgLSBidWZmZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSB8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQXBwZW5kKTtcblxuXHRcdHJldHVybiB0ZXN0QXBwZW5kRmlsZSgpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0QXBwZW5kRmlsZSgpIHtcblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdzbWFsbC50eHQnKSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gcmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudCwgJ1NtYWxsIEZpbGUnKTtcblxuXHRcdGNvbnN0IGFwcGVuZENvbnRlbnQgPSAnIC0gQXBwZW5kZWQhJztcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhhcHBlbmRDb250ZW50KSwgeyBhcHBlbmQ6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQub2soZXZlbnQhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnJlc291cmNlLmZzUGF0aCwgcmVzb3VyY2UuZnNQYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLm9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbi5XUklURSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKSwgJ1NtYWxsIEZpbGUgLSBBcHBlbmRlZCEnKTtcblx0fVxuXG5cdHRlc3QoJ2FwcGVuZEZpbGUgKHJlYWRhYmxlKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSB8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQXBwZW5kKTtcblxuXHRcdHJldHVybiB0ZXN0QXBwZW5kRmlsZVJlYWRhYmxlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGVuZEZpbGUgKHJlYWRhYmxlKSAtIGJ1ZmZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlIHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBcHBlbmQpO1xuXG5cdFx0cmV0dXJuIHRlc3RBcHBlbmRGaWxlUmVhZGFibGUoKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdEFwcGVuZEZpbGVSZWFkYWJsZSgpIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSByZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCAnU21hbGwgRmlsZScpO1xuXG5cdFx0Y29uc3QgYXBwZW5kQ29udGVudCA9ICcgLSBBcHBlbmRlZCB2aWEgcmVhZGFibGUhJztcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgYnVmZmVyVG9SZWFkYWJsZShWU0J1ZmZlci5mcm9tU3RyaW5nKGFwcGVuZENvbnRlbnQpKSwgeyBhcHBlbmQ6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKSwgJ1NtYWxsIEZpbGUgLSBBcHBlbmRlZCB2aWEgcmVhZGFibGUhJyk7XG5cdH1cblxuXHR0ZXN0KCdhcHBlbmRGaWxlIChzdHJlYW0pJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlIHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBcHBlbmQpO1xuXG5cdFx0cmV0dXJuIHRlc3RBcHBlbmRGaWxlU3RyZWFtKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGVuZEZpbGUgKHN0cmVhbSkgLSBidWZmZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSB8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQXBwZW5kKTtcblxuXHRcdHJldHVybiB0ZXN0QXBwZW5kRmlsZVN0cmVhbSgpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0QXBwZW5kRmlsZVN0cmVhbSgpIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ3NtYWxsLnR4dCcpKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSByZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCAnU21hbGwgRmlsZScpO1xuXG5cdFx0Y29uc3QgYXBwZW5kQ29udGVudCA9ICcgLSBBcHBlbmRlZCB2aWEgc3RyZWFtISc7XG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIGJ1ZmZlclRvU3RyZWFtKFZTQnVmZmVyLmZyb21TdHJpbmcoYXBwZW5kQ29udGVudCkpLCB7IGFwcGVuZDogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpLCAnU21hbGwgRmlsZSAtIEFwcGVuZGVkIHZpYSBzdHJlYW0hJyk7XG5cdH1cblxuXHR0ZXN0KCdhcHBlbmRGaWxlIC0gY3JlYXRlcyBmaWxlIGlmIG5vdCBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUgfCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUFwcGVuZCk7XG5cblx0XHRyZXR1cm4gdGVzdEFwcGVuZEZpbGVDcmVhdGVzRmlsZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBlbmRGaWxlIC0gY3JlYXRlcyBmaWxlIGlmIG5vdCBleGlzdHMgKGJ1ZmZlcmVkKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZU9wZW5SZWFkV3JpdGVDbG9zZSB8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQXBwZW5kKTtcblxuXHRcdHJldHVybiB0ZXN0QXBwZW5kRmlsZUNyZWF0ZXNGaWxlKCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RBcHBlbmRGaWxlQ3JlYXRlc0ZpbGUoKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZShqb2luKHRlc3REaXIsICdhcHBlbmRmaWxlLW5ldy50eHQnKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhyZXNvdXJjZS5mc1BhdGgpLCBmYWxzZSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gJ0luaXRpYWwgY29udGVudCB2aWEgYXBwZW5kJztcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSwgeyBhcHBlbmQ6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzU3luYyhyZXNvdXJjZS5mc1BhdGgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKHJlc291cmNlLmZzUGF0aCkudG9TdHJpbmcoKSwgY29udGVudCk7XG5cdH1cblxuXHR0ZXN0KCdhcHBlbmRGaWxlIC0gbXVsdGlwbGUgYXBwZW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRzZXRDYXBhYmlsaXRpZXMoZmlsZVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRXcml0ZSB8IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlQXBwZW5kKTtcblxuXHRcdHJldHVybiB0ZXN0QXBwZW5kRmlsZU11bHRpcGxlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGVuZEZpbGUgLSBtdWx0aXBsZSBhcHBlbmRzIChidWZmZXJlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0Q2FwYWJpbGl0aWVzKGZpbGVQcm92aWRlciwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UgfCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUFwcGVuZCk7XG5cblx0XHRyZXR1cm4gdGVzdEFwcGVuZEZpbGVNdWx0aXBsZSgpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0QXBwZW5kRmlsZU11bHRpcGxlKCkge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnYXBwZW5kZmlsZS1tdWx0aXBsZS50eHQnKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnTGluZSAxXFxuJyksIHsgYXBwZW5kOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdMaW5lIDJcXG4nKSwgeyBhcHBlbmQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ0xpbmUgM1xcbicpLCB7IGFwcGVuZDogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMocmVzb3VyY2UuZnNQYXRoKS50b1N0cmluZygpLCAnTGluZSAxXFxuTGluZSAyXFxuTGluZSAzXFxuJyk7XG5cdH1cblxuXHR0ZXN0KCdhcHBlbmRGaWxlIC0gdGhyb3dzIHdoZW4gcHJvdmlkZXIgZG9lcyBub3Qgc3VwcG9ydCBhcHBlbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVtb3ZlIEZpbGVBcHBlbmQgY2FwYWJpbGl0eSAtIHNob3VsZCB0aHJvdyBlcnJvclxuXHRcdHNldENhcGFiaWxpdGllcyhmaWxlUHJvdmlkZXIsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlKTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnc21hbGwudHh0JykpO1xuXHRcdGNvbnN0IGFwcGVuZENvbnRlbnQgPSAnIC0gQXBwZW5kZWQgdmlhIGZhbGxiYWNrISc7XG5cblx0XHRsZXQgZXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhhcHBlbmRDb250ZW50KSwgeyBhcHBlbmQ6IHRydWUgfSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0ZXJyb3IgPSBlIGFzIEVycm9yO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cdFx0YXNzZXJ0Lm9rKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ2RvZXMgbm90IHN1cHBvcnQgYXBwZW5kJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkIC0gbWl4ZWQgcG9zaXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0JykpO1xuXG5cdFx0Ly8gcmVhZCBtdWx0aXBsZSB0aW1lcyBmcm9tIHBvc2l0aW9uIDBcblx0XHRsZXQgYnVmZmVyID0gVlNCdWZmZXIuYWxsb2MoMTAyNCk7XG5cdFx0bGV0IGZkID0gYXdhaXQgZmlsZVByb3ZpZGVyLm9wZW4ocmVzb3VyY2UsIHsgY3JlYXRlOiBmYWxzZSB9KTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDM7IGkrKykge1xuXHRcdFx0YXdhaXQgZmlsZVByb3ZpZGVyLnJlYWQoZmQsIDAsIGJ1ZmZlci5idWZmZXIsIDAsIDI2KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmZXIuc2xpY2UoMCwgMjYpLnRvU3RyaW5nKCksICdMb3JlbSBpcHN1bSBkb2xvciBzaXQgYW1ldCcpO1xuXHRcdH1cblx0XHRhd2FpdCBmaWxlUHJvdmlkZXIuY2xvc2UoZmQpO1xuXG5cdFx0Ly8gcmVhZCBtdWx0aXBsZSB0aW1lcyBhdCB2YXJpb3VzIGxvY2F0aW9uc1xuXHRcdGJ1ZmZlciA9IFZTQnVmZmVyLmFsbG9jKDEwMjQpO1xuXHRcdGZkID0gYXdhaXQgZmlsZVByb3ZpZGVyLm9wZW4ocmVzb3VyY2UsIHsgY3JlYXRlOiBmYWxzZSB9KTtcblxuXHRcdGxldCBwb3NJbkZpbGUgPSAwO1xuXG5cdFx0YXdhaXQgZmlsZVByb3ZpZGVyLnJlYWQoZmQsIHBvc0luRmlsZSwgYnVmZmVyLmJ1ZmZlciwgMCwgMjYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmZXIuc2xpY2UoMCwgMjYpLnRvU3RyaW5nKCksICdMb3JlbSBpcHN1bSBkb2xvciBzaXQgYW1ldCcpO1xuXHRcdHBvc0luRmlsZSArPSAyNjtcblxuXHRcdGF3YWl0IGZpbGVQcm92aWRlci5yZWFkKGZkLCBwb3NJbkZpbGUsIGJ1ZmZlci5idWZmZXIsIDAsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmZXIuc2xpY2UoMCwgMSkudG9TdHJpbmcoKSwgJywnKTtcblx0XHRwb3NJbkZpbGUgKz0gMTtcblxuXHRcdGF3YWl0IGZpbGVQcm92aWRlci5yZWFkKGZkLCBwb3NJbkZpbGUsIGJ1ZmZlci5idWZmZXIsIDAsIDEyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZmVyLnNsaWNlKDAsIDEyKS50b1N0cmluZygpLCAnIGNvbnNlY3RldHVyJyk7XG5cdFx0cG9zSW5GaWxlICs9IDEyO1xuXG5cdFx0YXdhaXQgZmlsZVByb3ZpZGVyLnJlYWQoZmQsIDk4IC8qIG5vIGxvbmdlciBpbiBzZXF1ZW5jZSBvZiBwb3NJbkZpbGUgKi8sIGJ1ZmZlci5idWZmZXIsIDAsIDkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmZXIuc2xpY2UoMCwgOSkudG9TdHJpbmcoKSwgJ2Zlcm1lbnR1bScpO1xuXG5cdFx0YXdhaXQgZmlsZVByb3ZpZGVyLnJlYWQoZmQsIDI3LCBidWZmZXIuYnVmZmVyLCAwLCAxMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmZlci5zbGljZSgwLCAxMikudG9TdHJpbmcoKSwgJyBjb25zZWN0ZXR1cicpO1xuXG5cdFx0YXdhaXQgZmlsZVByb3ZpZGVyLnJlYWQoZmQsIDI2LCBidWZmZXIuYnVmZmVyLCAwLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZmVyLnNsaWNlKDAsIDEpLnRvU3RyaW5nKCksICcsJyk7XG5cblx0XHRhd2FpdCBmaWxlUHJvdmlkZXIucmVhZChmZCwgMCwgYnVmZmVyLmJ1ZmZlciwgMCwgMjYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmZXIuc2xpY2UoMCwgMjYpLnRvU3RyaW5nKCksICdMb3JlbSBpcHN1bSBkb2xvciBzaXQgYW1ldCcpO1xuXG5cdFx0YXdhaXQgZmlsZVByb3ZpZGVyLnJlYWQoZmQsIHBvc0luRmlsZSAvKiBiYWNrIGluIHNlcXVlbmNlICovLCBidWZmZXIuYnVmZmVyLCAwLCAxMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmZlci5zbGljZSgwLCAxMSkudG9TdHJpbmcoKSwgJyBhZGlwaXNjaW5nJyk7XG5cblx0XHRhd2FpdCBmaWxlUHJvdmlkZXIuY2xvc2UoZmQpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZSAtIG1peGVkIHBvc2l0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpKTtcblxuXHRcdGNvbnN0IGJ1ZmZlciA9IFZTQnVmZmVyLmFsbG9jKDEwMjQpO1xuXHRcdGNvbnN0IGZkV3JpdGUgPSBhd2FpdCBmaWxlUHJvdmlkZXIub3BlbihyZXNvdXJjZSwgeyBjcmVhdGU6IHRydWUsIHVubG9jazogZmFsc2UgfSk7XG5cdFx0Y29uc3QgZmRSZWFkID0gYXdhaXQgZmlsZVByb3ZpZGVyLm9wZW4ocmVzb3VyY2UsIHsgY3JlYXRlOiBmYWxzZSB9KTtcblxuXHRcdGxldCBwb3NJbkZpbGVXcml0ZSA9IDA7XG5cdFx0bGV0IHBvc0luRmlsZVJlYWQgPSAwO1xuXG5cdFx0Y29uc3QgaW5pdGlhbENvbnRlbnRzID0gVlNCdWZmZXIuZnJvbVN0cmluZygnTG9yZW0gaXBzdW0gZG9sb3Igc2l0IGFtZXQnKTtcblx0XHRhd2FpdCBmaWxlUHJvdmlkZXIud3JpdGUoZmRXcml0ZSwgcG9zSW5GaWxlV3JpdGUsIGluaXRpYWxDb250ZW50cy5idWZmZXIsIDAsIGluaXRpYWxDb250ZW50cy5ieXRlTGVuZ3RoKTtcblx0XHRwb3NJbkZpbGVXcml0ZSArPSBpbml0aWFsQ29udGVudHMuYnl0ZUxlbmd0aDtcblxuXHRcdGF3YWl0IGZpbGVQcm92aWRlci5yZWFkKGZkUmVhZCwgcG9zSW5GaWxlUmVhZCwgYnVmZmVyLmJ1ZmZlciwgMCwgMjYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmZXIuc2xpY2UoMCwgMjYpLnRvU3RyaW5nKCksICdMb3JlbSBpcHN1bSBkb2xvciBzaXQgYW1ldCcpO1xuXHRcdHBvc0luRmlsZVJlYWQgKz0gMjY7XG5cblx0XHRjb25zdCBjb250ZW50cyA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ0hlbGxvIFdvcmxkJyk7XG5cblx0XHRhd2FpdCBmaWxlUHJvdmlkZXIud3JpdGUoZmRXcml0ZSwgcG9zSW5GaWxlV3JpdGUsIGNvbnRlbnRzLmJ1ZmZlciwgMCwgY29udGVudHMuYnl0ZUxlbmd0aCk7XG5cdFx0cG9zSW5GaWxlV3JpdGUgKz0gY29udGVudHMuYnl0ZUxlbmd0aDtcblxuXHRcdGF3YWl0IGZpbGVQcm92aWRlci5yZWFkKGZkUmVhZCwgcG9zSW5GaWxlUmVhZCwgYnVmZmVyLmJ1ZmZlciwgMCwgY29udGVudHMuYnl0ZUxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmZlci5zbGljZSgwLCBjb250ZW50cy5ieXRlTGVuZ3RoKS50b1N0cmluZygpLCAnSGVsbG8gV29ybGQnKTtcblx0XHRwb3NJbkZpbGVSZWFkICs9IGNvbnRlbnRzLmJ5dGVMZW5ndGg7XG5cblx0XHRhd2FpdCBmaWxlUHJvdmlkZXIud3JpdGUoZmRXcml0ZSwgNiwgY29udGVudHMuYnVmZmVyLCAwLCBjb250ZW50cy5ieXRlTGVuZ3RoKTtcblxuXHRcdGF3YWl0IGZpbGVQcm92aWRlci5yZWFkKGZkUmVhZCwgMCwgYnVmZmVyLmJ1ZmZlciwgMCwgMTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmZXIuc2xpY2UoMCwgMTEpLnRvU3RyaW5nKCksICdMb3JlbSBIZWxsbycpO1xuXG5cdFx0YXdhaXQgZmlsZVByb3ZpZGVyLndyaXRlKGZkV3JpdGUsIHBvc0luRmlsZVdyaXRlLCBjb250ZW50cy5idWZmZXIsIDAsIGNvbnRlbnRzLmJ5dGVMZW5ndGgpO1xuXHRcdHBvc0luRmlsZVdyaXRlICs9IGNvbnRlbnRzLmJ5dGVMZW5ndGg7XG5cblx0XHRhd2FpdCBmaWxlUHJvdmlkZXIucmVhZChmZFJlYWQsIHBvc0luRmlsZVdyaXRlIC0gY29udGVudHMuYnl0ZUxlbmd0aCwgYnVmZmVyLmJ1ZmZlciwgMCwgY29udGVudHMuYnl0ZUxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmZlci5zbGljZSgwLCBjb250ZW50cy5ieXRlTGVuZ3RoKS50b1N0cmluZygpLCAnSGVsbG8gV29ybGQnKTtcblxuXHRcdGF3YWl0IGZpbGVQcm92aWRlci5jbG9zZShmZFdyaXRlKTtcblx0XHRhd2FpdCBmaWxlUHJvdmlkZXIuY2xvc2UoZmRSZWFkKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZG9ubHkgLSBpcyBoYW5kbGVkIHByb3Blcmx5IGZvciBhIHNpbmdsZSByZXNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRmaWxlUHJvdmlkZXIuc2V0UmVhZG9ubHkodHJ1ZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKGpvaW4odGVzdERpciwgJ2luZGV4Lmh0bWwnKSk7XG5cblx0XHRjb25zdCByZXNvbHZlUmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZVJlc3VsdC5yZWFkb25seSwgdHJ1ZSk7XG5cblx0XHRjb25zdCByZWFkUmVzdWx0ID0gYXdhaXQgc2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRSZXN1bHQucmVhZG9ubHksIHRydWUpO1xuXG5cdFx0bGV0IHdyaXRlRmlsZUVycm9yOiBFcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ0hlbGxvIFRlc3QnKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHdyaXRlRmlsZUVycm9yID0gZXJyb3I7XG5cdFx0fVxuXHRcdGFzc2VydC5vayh3cml0ZUZpbGVFcnJvcik7XG5cblx0XHRsZXQgZGVsZXRlRmlsZUVycm9yOiBFcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS5kZWwocmVzb3VyY2UpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRkZWxldGVGaWxlRXJyb3IgPSBlcnJvcjtcblx0XHR9XG5cdFx0YXNzZXJ0Lm9rKGRlbGV0ZUZpbGVFcnJvcik7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBa0IsWUFBWSxhQUFhLGNBQWMsVUFBVSxlQUFlLGdCQUFnQjtBQUMzRyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCLGdCQUFnQixnQkFBZ0IsOEJBQThCLGdCQUEwRDtBQUNuSixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVksZUFBZTtBQUNwQyxTQUFTLFVBQVUsU0FBUyxNQUFNLGFBQWE7QUFDL0MsU0FBUyxTQUFTLGlCQUFpQjtBQUNuQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxZQUFZLHlCQUF5QjtBQUM5QyxTQUFTLE1BQThCLGVBQWUsb0JBQXdDLHFCQUFxQixnQkFBZ0IsZ0NBQWdDLDZCQUE2QixpQ0FBNEYsb0NBQW9DLGtDQUFzRDtBQUN0WCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLFVBQVUsTUFBaUIsTUFBcUM7QUFDeEUsTUFBSSxLQUFLLGFBQWEsUUFBVztBQUNoQyxXQUFPO0FBQUEsRUFDUjtBQUVBLFNBQU8sS0FBSyxTQUFTLEtBQUssV0FBUyxNQUFNLFNBQVMsSUFBSTtBQUN2RDtBQUVBLFNBQVMscUJBQXFCLFNBQW1DO0FBQ2hFLE1BQUksU0FBUyxRQUFRLE1BQU0sSUFBSTtBQUMvQixXQUFTLE9BQU8sSUFBSSxDQUFDLE9BQU8sVUFBVTtBQUNyQyxRQUFJLFVBQVUsR0FBRztBQUNoQixhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sT0FBTztBQUFBLEVBQ2YsQ0FBQztBQUVELFNBQU87QUFBQSxJQUNOLE9BQXdCO0FBQ3ZCLFlBQU0sUUFBUSxPQUFPLE1BQU07QUFDM0IsVUFBSSxPQUFPLFVBQVUsVUFBVTtBQUM5QixlQUFPLFNBQVMsV0FBVyxLQUFLO0FBQUEsTUFDakM7QUFFQSxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFDRDtBQUVPLE1BQU0sbUNBQW1DLHVCQUF1QjtBQUFBLEVBQWhFO0FBQUE7QUFFTiwwQkFBeUI7QUFFekIsU0FBUSxrQkFBMkI7QUFDbkMsU0FBUSxnQkFBeUI7QUFDakMsU0FBUSxXQUFvQjtBQUFBO0FBQUEsRUFHNUIsSUFBYSxlQUErQztBQUMzRCxRQUFJLENBQUMsS0FBSyxtQkFBbUI7QUFDNUIsV0FBSyxvQkFDSiwrQkFBK0IsZ0JBQy9CLCtCQUErQix5QkFDL0IsK0JBQStCLGlCQUMvQiwrQkFBK0IsUUFDL0IsK0JBQStCLGlCQUMvQiwrQkFBK0Isa0JBQy9CLCtCQUErQixpQkFDL0IsK0JBQStCLGtCQUMvQiwrQkFBK0IsbUJBQy9CLCtCQUErQixZQUMvQiwrQkFBK0IsYUFDL0IsK0JBQStCO0FBRWhDLFVBQUksU0FBUztBQUNaLGFBQUsscUJBQXFCLCtCQUErQjtBQUFBLE1BQzFEO0FBQUEsSUFDRDtBQUVBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQWEsYUFBYSxjQUE4QztBQUN2RSxTQUFLLG9CQUFvQjtBQUFBLEVBQzFCO0FBQUEsRUFFQSxtQkFBbUIsU0FBd0I7QUFDMUMsU0FBSyxrQkFBa0I7QUFBQSxFQUN4QjtBQUFBLEVBRUEsaUJBQWlCLFNBQXdCO0FBQ3hDLFNBQUssZ0JBQWdCO0FBQUEsRUFDdEI7QUFBQSxFQUVBLFlBQVksVUFBeUI7QUFDcEMsU0FBSyxXQUFXO0FBQUEsRUFDakI7QUFBQSxFQUVBLE1BQWUsS0FBSyxVQUErQjtBQUNsRCxVQUFNLE1BQU0sTUFBTSxNQUFNLEtBQUssUUFBUTtBQUVyQyxRQUFJLEtBQUssaUJBQWlCO0FBRXpCLE1BQUMsSUFBWSxPQUFPLE9BQU8sSUFBSSxJQUFJO0FBQUEsSUFDcEMsV0FBVyxLQUFLLGVBQWU7QUFFOUIsTUFBQyxJQUFZLE9BQU87QUFBQSxJQUNyQixXQUFXLEtBQUssVUFBVTtBQUV6QixNQUFDLElBQVksY0FBYyxlQUFlO0FBQUEsSUFDM0M7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBZSxLQUFLLElBQVksS0FBYSxNQUFrQixRQUFnQixRQUFpQztBQUMvRyxVQUFNLFlBQVksTUFBTSxNQUFNLEtBQUssSUFBSSxLQUFLLE1BQU0sUUFBUSxNQUFNO0FBRWhFLFNBQUssa0JBQWtCO0FBRXZCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFlLFNBQVMsVUFBZSxTQUF1RDtBQUM3RixVQUFNLE1BQU0sTUFBTSxNQUFNLFNBQVMsVUFBVSxPQUFPO0FBRWxELFNBQUssa0JBQWtCLElBQUk7QUFFM0IsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLHVCQUF1QixzQkFBc0IsS0FBSztBQUVsRCxXQUFXLHFCQUFxQixXQUFZO0FBRTNDLFFBQU0sYUFBYTtBQUVuQixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixNQUFJO0FBRUosUUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBRXhDLFFBQU0sWUFBWTtBQUNqQixVQUFNLGFBQWEsSUFBSSxlQUFlO0FBRXRDLGNBQVUsWUFBWSxJQUFJLElBQUksWUFBWSxVQUFVLENBQUM7QUFFckQsbUJBQWUsWUFBWSxJQUFJLElBQUksMkJBQTJCLFVBQVUsQ0FBQztBQUN6RSxnQkFBWSxJQUFJLFFBQVEsaUJBQWlCLFFBQVEsTUFBTSxZQUFZLENBQUM7QUFFcEUsbUJBQWUsWUFBWSxJQUFJLElBQUksMkJBQTJCLFVBQVUsQ0FBQztBQUN6RSxnQkFBWSxJQUFJLFFBQVEsaUJBQWlCLFlBQVksWUFBWSxDQUFDO0FBRWxFLGNBQVUsa0JBQWtCLE9BQU8sR0FBRyxZQUFZLGlCQUFpQjtBQUVuRSxVQUFNLFlBQVksV0FBVyxVQUFVLDhDQUE4QyxFQUFFO0FBRXZGLFVBQU0sU0FBUyxLQUFLLFdBQVcsU0FBUyxFQUFFLGtCQUFrQixNQUFNLENBQUM7QUFBQSxFQUNwRSxDQUFDO0FBRUQsV0FBUyxNQUFNO0FBQ2QsZ0JBQVksTUFBTTtBQUVsQixXQUFPLFNBQVMsR0FBRyxPQUFPO0FBQUEsRUFDM0IsQ0FBQztBQUVELE9BQUssZ0JBQWdCLFlBQVk7QUFDaEMsUUFBSTtBQUNKLGdCQUFZLElBQUksUUFBUSxrQkFBa0IsT0FBSyxRQUFRLENBQUMsQ0FBQztBQUV6RCxVQUFNLFNBQVMsTUFBTSxRQUFRLFFBQVEsSUFBSSxLQUFLLE9BQU8sQ0FBQztBQUV0RCxVQUFNLG9CQUFvQixJQUFJLEtBQUssS0FBSyxPQUFPLFNBQVMsUUFBUSxXQUFXLENBQUM7QUFFNUUsVUFBTSxZQUFZLE1BQU0sUUFBUSxhQUFhLGlCQUFpQjtBQUU5RCxXQUFPLFlBQVksVUFBVSxNQUFNLFdBQVc7QUFDOUMsV0FBTyxZQUFZLFdBQVcsVUFBVSxTQUFTLE1BQU0sR0FBRyxJQUFJO0FBRTlELFdBQU8sR0FBRyxLQUFLO0FBQ2YsV0FBTyxZQUFZLE1BQU0sU0FBUyxRQUFRLGtCQUFrQixNQUFNO0FBQ2xFLFdBQU8sWUFBWSxNQUFNLFdBQVcsY0FBYyxNQUFNO0FBQ3hELFdBQU8sWUFBWSxNQUFNLE9BQVEsU0FBUyxRQUFRLGtCQUFrQixNQUFNO0FBQzFFLFdBQU8sWUFBWSxNQUFNLE9BQVEsYUFBYSxJQUFJO0FBQUEsRUFDbkQsQ0FBQztBQUVELE9BQUssbURBQW1ELFlBQVk7QUFDbkUsUUFBSTtBQUNKLGdCQUFZLElBQUksUUFBUSxrQkFBa0IsT0FBSyxRQUFRLENBQUMsQ0FBQztBQUV6RCxVQUFNLG1CQUFtQixDQUFDLEtBQUssVUFBVSxNQUFNLFNBQVM7QUFDeEQsVUFBTSxTQUFTLE1BQU0sUUFBUSxRQUFRLElBQUksS0FBSyxPQUFPLENBQUM7QUFFdEQsVUFBTSxvQkFBb0IsSUFBSSxLQUFLLEtBQUssT0FBTyxTQUFTLFFBQVEsR0FBRyxnQkFBZ0IsQ0FBQztBQUVwRixVQUFNLFlBQVksTUFBTSxRQUFRLGFBQWEsaUJBQWlCO0FBRTlELFVBQU0saUJBQWlCLGlCQUFpQixpQkFBaUIsU0FBUyxDQUFDO0FBQ25FLFdBQU8sWUFBWSxVQUFVLE1BQU0sY0FBYztBQUNqRCxXQUFPLFlBQVksV0FBVyxVQUFVLFNBQVMsTUFBTSxHQUFHLElBQUk7QUFFOUQsV0FBTyxHQUFHLEtBQU07QUFDaEIsV0FBTyxZQUFZLE1BQU8sU0FBUyxRQUFRLGtCQUFrQixNQUFNO0FBQ25FLFdBQU8sWUFBWSxNQUFPLFdBQVcsY0FBYyxNQUFNO0FBQ3pELFdBQU8sWUFBWSxNQUFPLE9BQVEsU0FBUyxRQUFRLGtCQUFrQixNQUFNO0FBQzNFLFdBQU8sWUFBWSxNQUFPLE9BQVEsYUFBYSxJQUFJO0FBQUEsRUFDcEQsQ0FBQztBQUVELE9BQUssVUFBVSxZQUFZO0FBQzFCLFFBQUksU0FBUyxNQUFNLFFBQVEsT0FBTyxJQUFJLEtBQUssT0FBTyxDQUFDO0FBQ25ELFdBQU8sWUFBWSxRQUFRLElBQUk7QUFFL0IsYUFBUyxNQUFNLFFBQVEsT0FBTyxJQUFJLEtBQUssVUFBVSxXQUFXLENBQUM7QUFDN0QsV0FBTyxZQUFZLFFBQVEsS0FBSztBQUFBLEVBQ2pDLENBQUM7QUFFRCxPQUFLLGtCQUFrQixZQUFZO0FBQ2xDLFVBQU0sV0FBVyxXQUFXLFVBQVUsMERBQTBEO0FBQ2hHLFVBQU0sV0FBVyxNQUFNLFFBQVEsUUFBUSxRQUFRO0FBRS9DLFdBQU8sWUFBWSxTQUFTLE1BQU0sWUFBWTtBQUM5QyxXQUFPLFlBQVksU0FBUyxRQUFRLElBQUk7QUFDeEMsV0FBTyxZQUFZLFNBQVMsYUFBYSxLQUFLO0FBQzlDLFdBQU8sWUFBWSxTQUFTLFVBQVUsS0FBSztBQUMzQyxXQUFPLFlBQVksU0FBUyxnQkFBZ0IsS0FBSztBQUNqRCxXQUFPLFlBQVksU0FBUyxTQUFTLFNBQVMsR0FBRyxTQUFTLFNBQVMsQ0FBQztBQUNwRSxXQUFPLFlBQVksU0FBUyxVQUFVLE1BQVM7QUFDL0MsV0FBTyxHQUFHLFNBQVMsUUFBUyxDQUFDO0FBQzdCLFdBQU8sR0FBRyxTQUFTLFFBQVMsQ0FBQztBQUM3QixXQUFPLEdBQUcsU0FBUyxPQUFRLENBQUM7QUFBQSxFQUM3QixDQUFDO0FBRUQsT0FBSyx1QkFBdUIsWUFBWTtBQUN2QyxVQUFNLGdCQUFnQixDQUFDLFlBQVksU0FBUyxjQUFjLFVBQVU7QUFFcEUsVUFBTSxXQUFXLFdBQVcsVUFBVSwrQ0FBK0M7QUFDckYsVUFBTSxTQUFTLE1BQU0sUUFBUSxRQUFRLFFBQVE7QUFFN0MsV0FBTyxHQUFHLE1BQU07QUFDaEIsV0FBTyxZQUFZLE9BQU8sU0FBUyxTQUFTLEdBQUcsU0FBUyxTQUFTLENBQUM7QUFDbEUsV0FBTyxZQUFZLE9BQU8sTUFBTSxVQUFVO0FBQzFDLFdBQU8sR0FBRyxPQUFPLFFBQVE7QUFDekIsV0FBTyxHQUFHLE9BQU8sU0FBUyxTQUFTLENBQUM7QUFDcEMsV0FBTyxHQUFHLE9BQU8sV0FBVztBQUM1QixXQUFPLFlBQVksT0FBTyxVQUFVLEtBQUs7QUFDekMsV0FBTyxHQUFHLE9BQU8sUUFBUyxDQUFDO0FBQzNCLFdBQU8sR0FBRyxPQUFPLFFBQVMsQ0FBQztBQUMzQixXQUFPLFlBQVksT0FBTyxTQUFTLFFBQVEsY0FBYyxNQUFNO0FBRS9ELFdBQU8sR0FBRyxPQUFPLFNBQVMsTUFBTSxXQUFTO0FBQ3hDLGFBQU8sY0FBYyxLQUFLLFVBQVE7QUFDakMsZUFBTyxTQUFTLE1BQU0sU0FBUyxNQUFNLE1BQU07QUFBQSxNQUM1QyxDQUFDO0FBQUEsSUFDRixDQUFDLENBQUM7QUFFRixXQUFPLFNBQVMsUUFBUSxXQUFTO0FBQ2hDLGFBQU8sR0FBRyxTQUFTLE1BQU0sU0FBUyxNQUFNLENBQUM7QUFDekMsVUFBSSxDQUFDLFlBQVksT0FBTyxFQUFFLFFBQVEsU0FBUyxNQUFNLFNBQVMsTUFBTSxDQUFDLEtBQUssR0FBRztBQUN4RSxlQUFPLEdBQUcsTUFBTSxXQUFXO0FBQzNCLGVBQU8sWUFBWSxNQUFNLE9BQU8sTUFBUztBQUN6QyxlQUFPLFlBQVksTUFBTSxPQUFPLE1BQVM7QUFBQSxNQUMxQyxXQUFXLFNBQVMsTUFBTSxTQUFTLE1BQU0sTUFBTSxjQUFjO0FBQzVELGVBQU8sR0FBRyxDQUFDLE1BQU0sV0FBVztBQUM1QixlQUFPLEdBQUcsQ0FBQyxNQUFNLFFBQVE7QUFDekIsZUFBTyxZQUFZLE1BQU0sT0FBTyxNQUFTO0FBQ3pDLGVBQU8sWUFBWSxNQUFNLE9BQU8sTUFBUztBQUFBLE1BQzFDLFdBQVcsU0FBUyxNQUFNLFNBQVMsTUFBTSxNQUFNLFlBQVk7QUFDMUQsZUFBTyxHQUFHLENBQUMsTUFBTSxXQUFXO0FBQzVCLGVBQU8sR0FBRyxDQUFDLE1BQU0sUUFBUTtBQUN6QixlQUFPLFlBQVksTUFBTSxPQUFPLE1BQVM7QUFDekMsZUFBTyxZQUFZLE1BQU0sT0FBTyxNQUFTO0FBQUEsTUFDMUMsT0FBTztBQUNOLGVBQU8sS0FBSyxzQkFBc0IsU0FBUyxNQUFNLFNBQVMsTUFBTSxDQUFDO0FBQUEsTUFDbEU7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHVDQUF1QyxZQUFZO0FBQ3ZELFVBQU0sZ0JBQWdCLENBQUMsWUFBWSxTQUFTLGNBQWMsVUFBVTtBQUVwRSxVQUFNLFNBQVMsTUFBTSxRQUFRLFFBQVEsV0FBVyxVQUFVLCtDQUErQyxHQUFHLEVBQUUsaUJBQWlCLEtBQUssQ0FBQztBQUVySSxXQUFPLEdBQUcsTUFBTTtBQUNoQixXQUFPLFlBQVksT0FBTyxNQUFNLFVBQVU7QUFDMUMsV0FBTyxHQUFHLE9BQU8sUUFBUTtBQUN6QixXQUFPLEdBQUcsT0FBTyxTQUFTLFNBQVMsQ0FBQztBQUNwQyxXQUFPLEdBQUcsT0FBTyxXQUFXO0FBQzVCLFdBQU8sR0FBRyxPQUFPLFFBQVEsQ0FBQztBQUMxQixXQUFPLEdBQUcsT0FBTyxRQUFRLENBQUM7QUFDMUIsV0FBTyxZQUFZLE9BQU8sU0FBUyxRQUFRLGNBQWMsTUFBTTtBQUUvRCxXQUFPLEdBQUcsT0FBTyxTQUFTLE1BQU0sV0FBUztBQUN4QyxhQUFPLGNBQWMsS0FBSyxVQUFRO0FBQ2pDLGVBQU8sU0FBUyxNQUFNLFNBQVMsTUFBTSxNQUFNO0FBQUEsTUFDNUMsQ0FBQztBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBRUYsV0FBTyxHQUFHLE9BQU8sU0FBUyxNQUFNLFdBQVMsTUFBTSxLQUFLLFNBQVMsQ0FBQyxDQUFDO0FBRS9ELFdBQU8sU0FBUyxRQUFRLFdBQVM7QUFDaEMsYUFBTyxHQUFHLFNBQVMsTUFBTSxTQUFTLE1BQU0sQ0FBQztBQUN6QyxVQUFJLENBQUMsWUFBWSxPQUFPLEVBQUUsUUFBUSxTQUFTLE1BQU0sU0FBUyxNQUFNLENBQUMsS0FBSyxHQUFHO0FBQ3hFLGVBQU8sR0FBRyxNQUFNLFdBQVc7QUFDM0IsZUFBTyxHQUFHLE1BQU0sUUFBUSxDQUFDO0FBQ3pCLGVBQU8sR0FBRyxNQUFNLFFBQVEsQ0FBQztBQUFBLE1BQzFCLFdBQVcsU0FBUyxNQUFNLFNBQVMsTUFBTSxNQUFNLGNBQWM7QUFDNUQsZUFBTyxHQUFHLENBQUMsTUFBTSxXQUFXO0FBQzVCLGVBQU8sR0FBRyxDQUFDLE1BQU0sUUFBUTtBQUN6QixlQUFPLEdBQUcsTUFBTSxRQUFRLENBQUM7QUFDekIsZUFBTyxHQUFHLE1BQU0sUUFBUSxDQUFDO0FBQUEsTUFDMUIsV0FBVyxTQUFTLE1BQU0sU0FBUyxNQUFNLE1BQU0sWUFBWTtBQUMxRCxlQUFPLEdBQUcsQ0FBQyxNQUFNLFdBQVc7QUFDNUIsZUFBTyxHQUFHLENBQUMsTUFBTSxRQUFRO0FBQ3pCLGVBQU8sR0FBRyxNQUFNLFFBQVEsQ0FBQztBQUN6QixlQUFPLEdBQUcsTUFBTSxRQUFRLENBQUM7QUFBQSxNQUMxQixPQUFPO0FBQ04sZUFBTyxLQUFLLHNCQUFzQixTQUFTLE1BQU0sU0FBUyxNQUFNLENBQUM7QUFBQSxNQUNsRTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssc0NBQXNDLFlBQVk7QUFDdEQsVUFBTSxXQUFXLE1BQU0sUUFBUSxRQUFRLElBQUksS0FBSyxPQUFPLEdBQUcsRUFBRSxXQUFXLENBQUMsSUFBSSxLQUFLLEtBQUssU0FBUyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDMUcsV0FBTyxZQUFZLFNBQVMsU0FBVSxRQUFRLENBQUM7QUFFL0MsVUFBTSxPQUFRLFVBQVUsVUFBVSxNQUFNO0FBQ3hDLFdBQU8sWUFBWSxLQUFLLFNBQVUsUUFBUSxDQUFDO0FBQUEsRUFDNUMsQ0FBQztBQUVELE9BQUssb0RBQW9ELFlBQVk7QUFDcEUsVUFBTSx1QkFBdUIsV0FBVyxVQUFVLCtDQUErQyxFQUFFO0FBQ25HLFVBQU0sU0FBUyxNQUFNLFFBQVEsUUFBUSxJQUFJLEtBQUssb0JBQW9CLEdBQUcsRUFBRSxXQUFXLENBQUMsSUFBSSxLQUFLLEtBQUssc0JBQXNCLFlBQVksQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUV4SSxXQUFPLEdBQUcsTUFBTTtBQUNoQixXQUFPLEdBQUcsT0FBTyxRQUFRO0FBQ3pCLFdBQU8sR0FBRyxPQUFPLFNBQVMsU0FBUyxDQUFDO0FBQ3BDLFdBQU8sR0FBRyxPQUFPLFdBQVc7QUFFNUIsVUFBTSxXQUFXLE9BQU87QUFDeEIsV0FBTyxZQUFZLFNBQVMsUUFBUSxDQUFDO0FBRXJDLFVBQU0sUUFBUSxVQUFVLFFBQVEsT0FBTztBQUN2QyxXQUFPLEdBQUcsS0FBSztBQUNmLFdBQU8sR0FBRyxNQUFNLFNBQVUsU0FBUyxDQUFDO0FBRXBDLFVBQU0sT0FBTyxVQUFVLE9BQU8sTUFBTTtBQUNwQyxXQUFPLEdBQUcsSUFBSTtBQUNkLFdBQU8sR0FBRyxLQUFLLFNBQVUsU0FBUyxDQUFDO0FBQ25DLFdBQU8sWUFBWSxLQUFLLFNBQVUsUUFBUSxDQUFDO0FBQUEsRUFDNUMsQ0FBQztBQUVELE9BQUssc0RBQXNELE1BQU07QUFDaEUsV0FBTywrQkFBK0IsS0FBSztBQUFBLEVBQzVDLENBQUM7QUFFRCxPQUFLLHlIQUF5SCxNQUFNO0FBQ25JLFdBQU8sK0JBQStCLElBQUk7QUFBQSxFQUMzQyxDQUFDO0FBRUQsaUJBQWUsK0JBQStCLGdCQUF3QztBQUNyRixVQUFNLHVCQUF1QixXQUFXLFVBQVUsK0NBQStDLEVBQUU7QUFDbkcsVUFBTSxTQUFTLE1BQU0sUUFBUSxRQUFRLElBQUksS0FBSyxvQkFBb0IsRUFBRSxLQUFLLEVBQUUsT0FBTyxpQkFBaUIsU0FBUyxPQUFVLENBQUMsR0FBRztBQUFBLE1BQ3pILFdBQVc7QUFBQSxRQUNWLElBQUksS0FBSyxLQUFLLHNCQUFzQixZQUFZLENBQUMsRUFBRSxLQUFLLEVBQUUsT0FBTyxpQkFBaUIsU0FBUyxPQUFVLENBQUM7QUFBQSxRQUN0RyxJQUFJLEtBQUssS0FBSyxzQkFBc0IsVUFBVSxDQUFDLEVBQUUsS0FBSyxFQUFFLE9BQU8saUJBQWlCLFNBQVMsT0FBVSxDQUFDO0FBQUEsTUFDckc7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPLEdBQUcsTUFBTTtBQUNoQixXQUFPLEdBQUcsT0FBTyxRQUFRO0FBQ3pCLFdBQU8sR0FBRyxPQUFPLFNBQVMsU0FBUyxDQUFDO0FBQ3BDLFdBQU8sR0FBRyxPQUFPLFdBQVc7QUFFNUIsVUFBTSxXQUFXLE9BQU87QUFDeEIsV0FBTyxZQUFZLFNBQVMsUUFBUSxDQUFDO0FBRXJDLFVBQU0sUUFBUSxVQUFVLFFBQVEsT0FBTztBQUN2QyxXQUFPLEdBQUcsS0FBSztBQUNmLFdBQU8sR0FBRyxNQUFNLFNBQVUsU0FBUyxDQUFDO0FBRXBDLFVBQU0sT0FBTyxVQUFVLE9BQU8sTUFBTTtBQUNwQyxXQUFPLEdBQUcsSUFBSTtBQUNkLFdBQU8sR0FBRyxLQUFLLFNBQVUsU0FBUyxDQUFDO0FBQ25DLFdBQU8sWUFBWSxLQUFLLFNBQVUsUUFBUSxDQUFDO0FBRTNDLFVBQU0sV0FBVyxVQUFVLFFBQVEsVUFBVTtBQUM3QyxXQUFPLEdBQUcsUUFBUTtBQUNsQixXQUFPLEdBQUcsU0FBUyxTQUFVLFNBQVMsQ0FBQztBQUN2QyxXQUFPLFlBQVksU0FBUyxTQUFVLFFBQVEsQ0FBQztBQUFBLEVBQ2hEO0FBRUEsT0FBSyxpREFBaUQsWUFBWTtBQUNqRSxVQUFNLHVCQUF1QixXQUFXLFVBQVUscURBQXFELEVBQUU7QUFDekcsVUFBTSxTQUFTLE1BQU0sUUFBUSxRQUFRLElBQUksS0FBSyxvQkFBb0IsR0FBRyxFQUFFLCtCQUErQixLQUFLLENBQUM7QUFFNUcsV0FBTyxHQUFHLE1BQU07QUFDaEIsV0FBTyxHQUFHLE9BQU8sUUFBUTtBQUN6QixXQUFPLEdBQUcsT0FBTyxTQUFTLFNBQVMsQ0FBQztBQUNwQyxXQUFPLEdBQUcsT0FBTyxXQUFXO0FBRTVCLFVBQU0sV0FBVyxPQUFPO0FBQ3hCLFdBQU8sWUFBWSxTQUFTLFFBQVEsQ0FBQztBQUVyQyxVQUFNLE9BQU8sVUFBVSxRQUFRLE1BQU07QUFDckMsV0FBTyxHQUFHLElBQUk7QUFDZCxXQUFPLEdBQUcsS0FBSyxTQUFVLFNBQVMsQ0FBQztBQUNuQyxXQUFPLFlBQVksS0FBSyxTQUFVLFFBQVEsQ0FBQztBQUFBLEVBQzVDLENBQUM7QUFFRCxPQUFLLFlBQVksWUFBWTtBQUM1QixVQUFNLE1BQU0sTUFBTSxRQUFRLFdBQVc7QUFBQSxNQUNwQyxFQUFFLFVBQVUsSUFBSSxLQUFLLE9BQU8sR0FBRyxTQUFTLEVBQUUsV0FBVyxDQUFDLElBQUksS0FBSyxLQUFLLFNBQVMsTUFBTSxDQUFDLENBQUMsRUFBRSxFQUFFO0FBQUEsTUFDekYsRUFBRSxVQUFVLElBQUksS0FBSyxLQUFLLFNBQVMsTUFBTSxDQUFDLEVBQUU7QUFBQSxJQUM3QyxDQUFDO0FBRUQsVUFBTSxLQUFNLElBQUksQ0FBQyxFQUFFO0FBQ25CLFdBQU8sWUFBWSxHQUFHLFNBQVUsUUFBUSxDQUFDO0FBRXpDLFVBQU0sT0FBUSxVQUFVLElBQUksTUFBTTtBQUNsQyxXQUFPLFlBQVksS0FBSyxTQUFVLFFBQVEsQ0FBQztBQUUzQyxVQUFNLEtBQU0sSUFBSSxDQUFDLEVBQUU7QUFDbkIsV0FBTyxZQUFZLEdBQUcsU0FBVSxRQUFRLENBQUM7QUFDekMsV0FBTyxZQUFZLEdBQUcsTUFBTSxNQUFNO0FBQUEsRUFDbkMsQ0FBQztBQUVELE9BQUssNkNBQTZDLFlBQVk7QUFDN0QsVUFBTSxPQUFPLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDO0FBQ2hELFVBQU0sU0FBUyxRQUFRLEtBQUssU0FBUyxNQUFNLEdBQUcsS0FBSyxRQUFRLFVBQVU7QUFFckUsVUFBTSxXQUFXLE1BQU0sUUFBUSxRQUFRLElBQUk7QUFDM0MsV0FBTyxZQUFZLFNBQVMsU0FBVSxRQUFRLENBQUM7QUFDL0MsV0FBTyxZQUFZLFNBQVMsYUFBYSxJQUFJO0FBQzdDLFdBQU8sWUFBWSxTQUFTLGdCQUFnQixJQUFJO0FBRWhELFVBQU0sV0FBVyxNQUFNLFFBQVEsU0FBUyxJQUFJO0FBQzVDLFdBQU8sR0FBRyxRQUFRO0FBQ2xCLFdBQU8sWUFBWSxTQUFTLFNBQVMsTUFBTSxHQUFHLE1BQU07QUFBQSxFQUNyRCxDQUFDO0FBRUQsR0FBQyxZQUFZLEtBQUssT0FBZ0YsTUFBTSxnQ0FBZ0MsWUFBWTtBQUNuSixVQUFNLE9BQU8sSUFBSSxLQUFLLEtBQUssU0FBUyxrQkFBa0IsQ0FBQztBQUN2RCxVQUFNLFNBQVMsUUFBUSxLQUFLLFNBQVMsV0FBVyxHQUFHLEtBQUssTUFBTTtBQUU5RCxVQUFNLFdBQVcsTUFBTSxRQUFRLFFBQVEsSUFBSTtBQUMzQyxXQUFPLFlBQVksU0FBUyxhQUFhLEtBQUs7QUFDOUMsV0FBTyxZQUFZLFNBQVMsZ0JBQWdCLElBQUk7QUFBQSxFQUNqRCxDQUFDO0FBRUQsT0FBSyx1RUFBdUUsWUFBWTtBQUN2RixVQUFNLFNBQVMsUUFBUSxLQUFLLFNBQVMsS0FBSyxHQUFHLEtBQUssU0FBUyxLQUFLLEdBQUcsVUFBVTtBQUU3RSxVQUFNLFdBQVcsTUFBTSxRQUFRLFFBQVEsSUFBSSxLQUFLLE9BQU8sQ0FBQztBQUN4RCxXQUFPLFlBQVksU0FBUyxhQUFhLElBQUk7QUFDN0MsV0FBTyxZQUFZLFNBQVMsU0FBVSxRQUFRLENBQUM7QUFFL0MsVUFBTSxlQUFlLFNBQVMsVUFBVSxLQUFLLFdBQVMsTUFBTSxTQUFTLFNBQVMsTUFBTSxjQUFjO0FBQ2xHLFdBQU8sR0FBRyxZQUFZO0FBRXRCLFdBQU8sR0FBRyxDQUFDLGNBQWMsV0FBVztBQUNwQyxXQUFPLEdBQUcsQ0FBQyxjQUFjLE1BQU07QUFBQSxFQUNoQyxDQUFDO0FBRUQsT0FBSyxlQUFlLFlBQVk7QUFDL0IsVUFBTSxXQUFXLFdBQVcsVUFBVSwwREFBMEQ7QUFDaEcsVUFBTSxXQUFXLE1BQU0sUUFBUSxLQUFLLFFBQVE7QUFFNUMsV0FBTyxZQUFZLFNBQVMsTUFBTSxZQUFZO0FBQzlDLFdBQU8sWUFBWSxTQUFTLFFBQVEsSUFBSTtBQUN4QyxXQUFPLFlBQVksU0FBUyxhQUFhLEtBQUs7QUFDOUMsV0FBTyxZQUFZLFNBQVMsVUFBVSxLQUFLO0FBQzNDLFdBQU8sWUFBWSxTQUFTLGdCQUFnQixLQUFLO0FBQ2pELFdBQU8sWUFBWSxTQUFTLFNBQVMsU0FBUyxHQUFHLFNBQVMsU0FBUyxDQUFDO0FBQ3BFLFdBQU8sR0FBRyxTQUFTLFFBQVEsQ0FBQztBQUM1QixXQUFPLEdBQUcsU0FBUyxRQUFRLENBQUM7QUFDNUIsV0FBTyxHQUFHLFNBQVMsT0FBTyxDQUFDO0FBQUEsRUFDNUIsQ0FBQztBQUVELE9BQUssb0JBQW9CLFlBQVk7QUFDcEMsVUFBTSxXQUFXLFdBQVcsVUFBVSwrQ0FBK0M7QUFDckYsVUFBTSxTQUFTLE1BQU0sUUFBUSxLQUFLLFFBQVE7QUFFMUMsV0FBTyxHQUFHLE1BQU07QUFDaEIsV0FBTyxZQUFZLE9BQU8sU0FBUyxTQUFTLEdBQUcsU0FBUyxTQUFTLENBQUM7QUFDbEUsV0FBTyxZQUFZLE9BQU8sTUFBTSxVQUFVO0FBQzFDLFdBQU8sR0FBRyxPQUFPLFdBQVc7QUFDNUIsV0FBTyxZQUFZLE9BQU8sVUFBVSxLQUFLO0FBQ3pDLFdBQU8sR0FBRyxPQUFPLFFBQVEsQ0FBQztBQUMxQixXQUFPLEdBQUcsT0FBTyxRQUFRLENBQUM7QUFBQSxFQUMzQixDQUFDO0FBR0QsTUFBSSxDQUFDLFdBQVc7QUFDZixTQUFLLHFCQUFxQixZQUFZO0FBQ3JDLFlBQU0sZ0JBQWdCLFdBQVcsVUFBVSxnRUFBZ0U7QUFDM0csVUFBSSxXQUFXLE1BQU0sUUFBUSxLQUFLLGFBQWE7QUFDL0MsYUFBTyxZQUFZLFNBQVMsUUFBUSxJQUFJO0FBQ3hDLGFBQU8sWUFBWSxTQUFTLFlBQVksS0FBSztBQUU3QyxZQUFNLGFBQWEsV0FBVyxVQUFVLDREQUE0RDtBQUNwRyxpQkFBVyxNQUFNLFFBQVEsS0FBSyxVQUFVO0FBQ3hDLGFBQU8sWUFBWSxTQUFTLFFBQVEsSUFBSTtBQUN4QyxhQUFPLFlBQVksU0FBUyxZQUFZLElBQUk7QUFBQSxJQUM3QyxDQUFDO0FBQUEsRUFDRjtBQUVBLE9BQUssOEJBQThCLFlBQVk7QUFDOUMsV0FBTyxlQUFlLE9BQU8sS0FBSztBQUFBLEVBQ25DLENBQUM7QUFFRCxPQUFLLDBCQUEwQixZQUFZO0FBQzFDLFdBQU8sZUFBZSxPQUFPLElBQUk7QUFBQSxFQUNsQyxDQUFDO0FBRUQsR0FBQyxVQUE2QyxLQUFLLE9BQU8sTUFBTSx5QkFBeUIsWUFBWTtBQUNwRyxXQUFPLGVBQWUsTUFBTSxLQUFLO0FBQUEsRUFDbEMsQ0FBQztBQUVELGlCQUFlLGVBQWUsVUFBbUIsV0FBbUM7QUFDbkYsUUFBSTtBQUNKLGdCQUFZLElBQUksUUFBUSxrQkFBa0IsT0FBSyxRQUFRLENBQUMsQ0FBQztBQUV6RCxVQUFNLFdBQVcsSUFBSSxLQUFLLEtBQUssU0FBUyxRQUFRLFdBQVcsQ0FBQztBQUM1RCxVQUFNLFNBQVMsTUFBTSxRQUFRLFFBQVEsUUFBUTtBQUU3QyxXQUFPLFlBQVksTUFBTSxRQUFRLFVBQVUsT0FBTyxVQUFVLEVBQUUsVUFBVSxVQUFVLENBQUMsR0FBRyxJQUFJO0FBQzFGLFVBQU0sUUFBUSxJQUFJLE9BQU8sVUFBVSxFQUFFLFVBQVUsVUFBVSxDQUFDO0FBRTFELFdBQU8sWUFBWSxXQUFXLE9BQU8sU0FBUyxNQUFNLEdBQUcsS0FBSztBQUU1RCxXQUFPLEdBQUcsS0FBTTtBQUNoQixXQUFPLFlBQVksTUFBTyxTQUFTLFFBQVEsU0FBUyxNQUFNO0FBQzFELFdBQU8sWUFBWSxNQUFPLFdBQVcsY0FBYyxNQUFNO0FBRXpELFFBQUksUUFBMkI7QUFDL0IsUUFBSTtBQUNILFlBQU0sUUFBUSxJQUFJLE9BQU8sVUFBVSxFQUFFLFVBQVUsVUFBVSxDQUFDO0FBQUEsSUFDM0QsU0FBUyxHQUFHO0FBQ1gsY0FBUTtBQUFBLElBQ1Q7QUFFQSxXQUFPLEdBQUcsS0FBSztBQUNmLFdBQU8sWUFBaUMsTUFBTyxxQkFBcUIsb0JBQW9CLGNBQWM7QUFBQSxFQUN2RztBQUVBLEdBQUMsWUFBWSxLQUFLLE9BQWdGLE1BQU0sdUNBQXVDLFlBQVk7QUFDMUosVUFBTSxTQUFTLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDO0FBQ2xELFVBQU0sT0FBTyxJQUFJLEtBQUssS0FBSyxTQUFTLGtCQUFrQixDQUFDO0FBQ3ZELFVBQU0sU0FBUyxRQUFRLE9BQU8sUUFBUSxLQUFLLE1BQU07QUFFakQsVUFBTSxTQUFTLE1BQU0sUUFBUSxRQUFRLElBQUk7QUFFekMsUUFBSTtBQUNKLGdCQUFZLElBQUksUUFBUSxrQkFBa0IsT0FBSyxRQUFRLENBQUMsQ0FBQztBQUV6RCxXQUFPLFlBQVksTUFBTSxRQUFRLFVBQVUsT0FBTyxRQUFRLEdBQUcsSUFBSTtBQUNqRSxVQUFNLFFBQVEsSUFBSSxPQUFPLFFBQVE7QUFFakMsV0FBTyxZQUFZLFdBQVcsT0FBTyxTQUFTLE1BQU0sR0FBRyxLQUFLO0FBRTVELFdBQU8sR0FBRyxLQUFNO0FBQ2hCLFdBQU8sWUFBWSxNQUFPLFNBQVMsUUFBUSxLQUFLLE1BQU07QUFDdEQsV0FBTyxZQUFZLE1BQU8sV0FBVyxjQUFjLE1BQU07QUFFekQsV0FBTyxZQUFZLFdBQVcsT0FBTyxNQUFNLEdBQUcsSUFBSTtBQUFBLEVBQ25ELENBQUM7QUFFRCxHQUFDLFlBQVksS0FBSyxPQUFnRixNQUFNLDZEQUE2RCxZQUFZO0FBQ2hMLFVBQU0sU0FBUyxJQUFJLEtBQUssS0FBSyxTQUFTLEtBQUssQ0FBQztBQUM1QyxVQUFNLE9BQU8sSUFBSSxLQUFLLEtBQUssU0FBUyxLQUFLLENBQUM7QUFDMUMsVUFBTSxTQUFTLFFBQVEsT0FBTyxRQUFRLEtBQUssTUFBTTtBQUVqRCxRQUFJO0FBQ0osZ0JBQVksSUFBSSxRQUFRLGtCQUFrQixPQUFLLFFBQVEsQ0FBQyxDQUFDO0FBRXpELFdBQU8sWUFBWSxNQUFNLFFBQVEsVUFBVSxJQUFJLEdBQUcsSUFBSTtBQUN0RCxVQUFNLFFBQVEsSUFBSSxJQUFJO0FBRXRCLFdBQU8sWUFBWSxXQUFXLEtBQUssTUFBTSxHQUFHLEtBQUs7QUFFakQsV0FBTyxHQUFHLEtBQU07QUFDaEIsV0FBTyxZQUFZLE1BQU8sU0FBUyxRQUFRLEtBQUssTUFBTTtBQUN0RCxXQUFPLFlBQVksTUFBTyxXQUFXLGNBQWMsTUFBTTtBQUFBLEVBQzFELENBQUM7QUFFRCxPQUFLLDRCQUE0QixZQUFZO0FBQzVDLFdBQU8sMEJBQTBCLE9BQU8sS0FBSztBQUFBLEVBQzlDLENBQUM7QUFFRCxPQUFLLG9DQUFvQyxZQUFZO0FBQ3BELFdBQU8sMEJBQTBCLE9BQU8sRUFBRSxTQUFTLFVBQVUsQ0FBQztBQUFBLEVBQy9ELENBQUM7QUFFRCxHQUFDLFVBQTZDLEtBQUssT0FBTyxNQUFNLHNDQUFzQyxZQUFZO0FBQ2pILFdBQU8sMEJBQTBCLE1BQU0sS0FBSztBQUFBLEVBQzdDLENBQUM7QUFFRCxpQkFBZSwwQkFBMEIsVUFBbUIsUUFBbUQ7QUFDOUcsUUFBSTtBQUNKLGdCQUFZLElBQUksUUFBUSxrQkFBa0IsT0FBSyxRQUFRLENBQUMsQ0FBQztBQUV6RCxVQUFNLFdBQVcsSUFBSSxLQUFLLEtBQUssU0FBUyxNQUFNLENBQUM7QUFDL0MsVUFBTSxTQUFTLE1BQU0sUUFBUSxRQUFRLFFBQVE7QUFFN0MsV0FBTyxZQUFZLE1BQU0sUUFBUSxVQUFVLE9BQU8sVUFBVSxFQUFFLFdBQVcsTUFBTSxVQUFVLE9BQU8sQ0FBQyxHQUFHLElBQUk7QUFDeEcsVUFBTSxRQUFRLElBQUksT0FBTyxVQUFVLEVBQUUsV0FBVyxNQUFNLFVBQVUsT0FBTyxDQUFDO0FBRXhFLFdBQU8sWUFBWSxXQUFXLE9BQU8sU0FBUyxNQUFNLEdBQUcsS0FBSztBQUM1RCxXQUFPLEdBQUcsS0FBTTtBQUNoQixXQUFPLFlBQVksTUFBTyxTQUFTLFFBQVEsU0FBUyxNQUFNO0FBQzFELFdBQU8sWUFBWSxNQUFPLFdBQVcsY0FBYyxNQUFNO0FBQUEsRUFDMUQ7QUFFQSxPQUFLLGdDQUFnQyxZQUFZO0FBQ2hELFVBQU0sV0FBVyxJQUFJLEtBQUssS0FBSyxTQUFTLE1BQU0sQ0FBQztBQUMvQyxVQUFNLFNBQVMsTUFBTSxRQUFRLFFBQVEsUUFBUTtBQUU3QyxXQUFPLEdBQUksTUFBTSxRQUFRLFVBQVUsT0FBTyxRQUFRLGFBQWMsS0FBSztBQUVyRSxRQUFJO0FBQ0osUUFBSTtBQUNILFlBQU0sUUFBUSxJQUFJLE9BQU8sUUFBUTtBQUFBLElBQ2xDLFNBQVMsR0FBRztBQUNYLGNBQVE7QUFBQSxJQUNUO0FBRUEsV0FBTyxHQUFHLEtBQUs7QUFBQSxFQUNoQixDQUFDO0FBRUQsT0FBSyx5Q0FBeUMsTUFBTTtBQUNuRCxXQUFPLHNCQUFzQixJQUFJO0FBQUEsRUFDbEMsQ0FBQztBQUVELE9BQUssNkNBQTZDLE1BQU07QUFDdkQsV0FBTyxzQkFBc0IsS0FBSztBQUFBLEVBQ25DLENBQUM7QUFFRCxpQkFBZSxzQkFBc0IsV0FBbUM7QUFDdkUsVUFBTSxFQUFFLFNBQVMsSUFBSSxNQUFNLFFBQVEsYUFBYSxJQUFJLEtBQUssS0FBSyxTQUFTLFFBQVEsT0FBTyxDQUFDLENBQUM7QUFFeEYsVUFBTSxRQUFRLElBQUksVUFBVSxFQUFFLFVBQVUsQ0FBQztBQUV6QyxXQUFPLFlBQVksTUFBTSxRQUFRLE9BQU8sUUFBUSxHQUFHLEtBQUs7QUFBQSxFQUN6RDtBQUVBLE9BQUssUUFBUSxZQUFZO0FBQ3hCLFFBQUk7QUFDSixnQkFBWSxJQUFJLFFBQVEsa0JBQWtCLE9BQUssUUFBUSxDQUFDLENBQUM7QUFFekQsVUFBTSxTQUFTLElBQUksS0FBSyxLQUFLLFNBQVMsWUFBWSxDQUFDO0FBQ25ELFVBQU0saUJBQWlCLGFBQWEsT0FBTyxNQUFNO0FBRWpELFVBQU0sU0FBUyxJQUFJLEtBQUssS0FBSyxRQUFRLE9BQU8sTUFBTSxHQUFHLFlBQVksQ0FBQztBQUVsRSxXQUFPLFlBQVksTUFBTSxRQUFRLFFBQVEsUUFBUSxNQUFNLEdBQUcsSUFBSTtBQUM5RCxVQUFNLFVBQVUsTUFBTSxRQUFRLEtBQUssUUFBUSxNQUFNO0FBRWpELFdBQU8sWUFBWSxXQUFXLFFBQVEsU0FBUyxNQUFNLEdBQUcsSUFBSTtBQUM1RCxXQUFPLFlBQVksV0FBVyxPQUFPLE1BQU0sR0FBRyxLQUFLO0FBQ25ELFdBQU8sR0FBRyxLQUFNO0FBQ2hCLFdBQU8sWUFBWSxNQUFPLFNBQVMsUUFBUSxPQUFPLE1BQU07QUFDeEQsV0FBTyxZQUFZLE1BQU8sV0FBVyxjQUFjLElBQUk7QUFDdkQsV0FBTyxZQUFZLE1BQU8sT0FBUSxTQUFTLFFBQVEsUUFBUSxTQUFTLE1BQU07QUFFMUUsVUFBTSxpQkFBaUIsYUFBYSxPQUFPLE1BQU07QUFFakQsV0FBTyxZQUFZLGVBQWUsWUFBWSxlQUFlLFVBQVU7QUFDdkUsV0FBTyxZQUFZLGVBQWUsU0FBUyxHQUFHLGVBQWUsU0FBUyxDQUFDO0FBQUEsRUFDeEUsQ0FBQztBQUVELE9BQUssa0RBQWtELFlBQVk7QUFDbEUsb0JBQWdCLGNBQWMsK0JBQStCLHNCQUFzQjtBQUNuRixvQkFBZ0IsY0FBYywrQkFBK0Isc0JBQXNCO0FBRW5GLFdBQU8sd0JBQXdCO0FBQUEsRUFDaEMsQ0FBQztBQUVELE9BQUssc0RBQXNELFlBQVk7QUFDdEUsb0JBQWdCLGNBQWMsK0JBQStCLGFBQWE7QUFDMUUsb0JBQWdCLGNBQWMsK0JBQStCLGFBQWE7QUFFMUUsV0FBTyx3QkFBd0I7QUFBQSxFQUNoQyxDQUFDO0FBRUQsT0FBSyxvREFBb0QsWUFBWTtBQUNwRSxvQkFBZ0IsY0FBYywrQkFBK0Isc0JBQXNCO0FBQ25GLG9CQUFnQixjQUFjLCtCQUErQixhQUFhO0FBRTFFLFdBQU8sd0JBQXdCO0FBQUEsRUFDaEMsQ0FBQztBQUVELE9BQUssb0RBQW9ELFlBQVk7QUFDcEUsb0JBQWdCLGNBQWMsK0JBQStCLGFBQWE7QUFDMUUsb0JBQWdCLGNBQWMsK0JBQStCLHNCQUFzQjtBQUVuRixXQUFPLHdCQUF3QjtBQUFBLEVBQ2hDLENBQUM7QUFFRCxPQUFLLDBEQUEwRCxZQUFZO0FBQzFFLG9CQUFnQixjQUFjLCtCQUErQixzQkFBc0I7QUFDbkYsb0JBQWdCLGNBQWMsK0JBQStCLHNCQUFzQjtBQUVuRixXQUFPLHdCQUF3QixXQUFXO0FBQUEsRUFDM0MsQ0FBQztBQUVELE9BQUssOERBQThELFlBQVk7QUFDOUUsb0JBQWdCLGNBQWMsK0JBQStCLGFBQWE7QUFDMUUsb0JBQWdCLGNBQWMsK0JBQStCLGFBQWE7QUFFMUUsV0FBTyx3QkFBd0IsV0FBVztBQUFBLEVBQzNDLENBQUM7QUFFRCxPQUFLLDREQUE0RCxZQUFZO0FBQzVFLG9CQUFnQixjQUFjLCtCQUErQixzQkFBc0I7QUFDbkYsb0JBQWdCLGNBQWMsK0JBQStCLGFBQWE7QUFFMUUsV0FBTyx3QkFBd0IsV0FBVztBQUFBLEVBQzNDLENBQUM7QUFFRCxPQUFLLDREQUE0RCxZQUFZO0FBQzVFLG9CQUFnQixjQUFjLCtCQUErQixhQUFhO0FBQzFFLG9CQUFnQixjQUFjLCtCQUErQixzQkFBc0I7QUFFbkYsV0FBTyx3QkFBd0IsV0FBVztBQUFBLEVBQzNDLENBQUM7QUFFRCxpQkFBZSx3QkFBd0IsYUFBYSxjQUE2QjtBQUNoRixRQUFJO0FBQ0osZ0JBQVksSUFBSSxRQUFRLGtCQUFrQixPQUFLLFFBQVEsQ0FBQyxDQUFDO0FBRXpELFVBQU0sU0FBUyxJQUFJLEtBQUssS0FBSyxTQUFTLFVBQVUsQ0FBQztBQUNqRCxVQUFNLGlCQUFpQixhQUFhLE9BQU8sTUFBTTtBQUVqRCxVQUFNLFNBQVMsSUFBSSxLQUFLLEtBQUssUUFBUSxPQUFPLE1BQU0sR0FBRyxZQUFZLENBQUMsRUFBRSxLQUFLLEVBQUUsUUFBUSxXQUFXLENBQUM7QUFFL0YsV0FBTyxZQUFZLE1BQU0sUUFBUSxRQUFRLFFBQVEsTUFBTSxHQUFHLElBQUk7QUFDOUQsVUFBTSxVQUFVLE1BQU0sUUFBUSxLQUFLLFFBQVEsTUFBTTtBQUVqRCxXQUFPLFlBQVksV0FBVyxRQUFRLFNBQVMsTUFBTSxHQUFHLElBQUk7QUFDNUQsV0FBTyxZQUFZLFdBQVcsT0FBTyxNQUFNLEdBQUcsS0FBSztBQUNuRCxXQUFPLEdBQUcsS0FBTTtBQUNoQixXQUFPLFlBQVksTUFBTyxTQUFTLFFBQVEsT0FBTyxNQUFNO0FBQ3hELFdBQU8sWUFBWSxNQUFPLFdBQVcsY0FBYyxJQUFJO0FBQ3ZELFdBQU8sWUFBWSxNQUFPLE9BQVEsU0FBUyxRQUFRLFFBQVEsU0FBUyxNQUFNO0FBRTFFLFVBQU0saUJBQWlCLGFBQWEsT0FBTyxNQUFNO0FBRWpELFdBQU8sWUFBWSxlQUFlLFlBQVksZUFBZSxVQUFVO0FBQ3ZFLFdBQU8sWUFBWSxlQUFlLFNBQVMsR0FBRyxlQUFlLFNBQVMsQ0FBQztBQUFBLEVBQ3hFO0FBRUEsT0FBSyx1QkFBdUIsWUFBWTtBQUN2QyxRQUFJO0FBQ0osZ0JBQVksSUFBSSxRQUFRLGtCQUFrQixPQUFLLFFBQVEsQ0FBQyxDQUFDO0FBRXpELFVBQU0sbUJBQW1CLENBQUMsS0FBSyxVQUFVLE1BQU0sU0FBUztBQUN4RCxVQUFNLGVBQWUsS0FBSyxHQUFHLGtCQUFrQixZQUFZO0FBRTNELFVBQU0sU0FBUyxJQUFJLEtBQUssS0FBSyxTQUFTLFlBQVksQ0FBQztBQUVuRCxXQUFPLFlBQVksTUFBTSxRQUFRLFFBQVEsUUFBUSxJQUFJLEtBQUssS0FBSyxRQUFRLE9BQU8sTUFBTSxHQUFHLFlBQVksQ0FBQyxDQUFDLEdBQUcsSUFBSTtBQUM1RyxVQUFNLFVBQVUsTUFBTSxRQUFRLEtBQUssUUFBUSxJQUFJLEtBQUssS0FBSyxRQUFRLE9BQU8sTUFBTSxHQUFHLFlBQVksQ0FBQyxDQUFDO0FBRS9GLFdBQU8sWUFBWSxXQUFXLFFBQVEsU0FBUyxNQUFNLEdBQUcsSUFBSTtBQUM1RCxXQUFPLFlBQVksV0FBVyxPQUFPLE1BQU0sR0FBRyxLQUFLO0FBQ25ELFdBQU8sR0FBRyxLQUFNO0FBQ2hCLFdBQU8sWUFBWSxNQUFPLFNBQVMsUUFBUSxPQUFPLE1BQU07QUFDeEQsV0FBTyxZQUFZLE1BQU8sV0FBVyxjQUFjLElBQUk7QUFDdkQsV0FBTyxZQUFZLE1BQU8sT0FBUSxTQUFTLFFBQVEsUUFBUSxTQUFTLE1BQU07QUFBQSxFQUMzRSxDQUFDO0FBRUQsT0FBSyxvQkFBb0IsWUFBWTtBQUNwQyxRQUFJO0FBQ0osZ0JBQVksSUFBSSxRQUFRLGtCQUFrQixPQUFLLFFBQVEsQ0FBQyxDQUFDO0FBRXpELFVBQU0sU0FBUyxJQUFJLEtBQUssS0FBSyxTQUFTLE1BQU0sQ0FBQztBQUU3QyxXQUFPLFlBQVksTUFBTSxRQUFRLFFBQVEsUUFBUSxJQUFJLEtBQUssS0FBSyxRQUFRLE9BQU8sTUFBTSxHQUFHLFFBQVEsQ0FBQyxDQUFDLEdBQUcsSUFBSTtBQUN4RyxVQUFNLFVBQVUsTUFBTSxRQUFRLEtBQUssUUFBUSxJQUFJLEtBQUssS0FBSyxRQUFRLE9BQU8sTUFBTSxHQUFHLFFBQVEsQ0FBQyxDQUFDO0FBRTNGLFdBQU8sWUFBWSxXQUFXLFFBQVEsU0FBUyxNQUFNLEdBQUcsSUFBSTtBQUM1RCxXQUFPLFlBQVksV0FBVyxPQUFPLE1BQU0sR0FBRyxLQUFLO0FBQ25ELFdBQU8sR0FBRyxLQUFNO0FBQ2hCLFdBQU8sWUFBWSxNQUFPLFNBQVMsUUFBUSxPQUFPLE1BQU07QUFDeEQsV0FBTyxZQUFZLE1BQU8sV0FBVyxjQUFjLElBQUk7QUFDdkQsV0FBTyxZQUFZLE1BQU8sT0FBUSxTQUFTLFFBQVEsUUFBUSxTQUFTLE1BQU07QUFBQSxFQUMzRSxDQUFDO0FBRUQsT0FBSyw4REFBOEQsWUFBWTtBQUM5RSxvQkFBZ0IsY0FBYywrQkFBK0Isc0JBQXNCO0FBQ25GLG9CQUFnQixjQUFjLCtCQUErQixzQkFBc0I7QUFFbkYsV0FBTyw4QkFBOEI7QUFBQSxFQUN0QyxDQUFDO0FBRUQsT0FBSyxrRUFBa0UsWUFBWTtBQUNsRixvQkFBZ0IsY0FBYywrQkFBK0IsYUFBYTtBQUMxRSxvQkFBZ0IsY0FBYywrQkFBK0IsYUFBYTtBQUUxRSxXQUFPLDhCQUE4QjtBQUFBLEVBQ3RDLENBQUM7QUFFRCxPQUFLLGdFQUFnRSxZQUFZO0FBQ2hGLG9CQUFnQixjQUFjLCtCQUErQixzQkFBc0I7QUFDbkYsb0JBQWdCLGNBQWMsK0JBQStCLGFBQWE7QUFFMUUsV0FBTyw4QkFBOEI7QUFBQSxFQUN0QyxDQUFDO0FBRUQsT0FBSyxnRUFBZ0UsWUFBWTtBQUNoRixvQkFBZ0IsY0FBYywrQkFBK0IsYUFBYTtBQUMxRSxvQkFBZ0IsY0FBYywrQkFBK0Isc0JBQXNCO0FBRW5GLFdBQU8sOEJBQThCO0FBQUEsRUFDdEMsQ0FBQztBQUVELGlCQUFlLGdDQUErQztBQUM3RCxRQUFJO0FBQ0osZ0JBQVksSUFBSSxRQUFRLGtCQUFrQixPQUFLLFFBQVEsQ0FBQyxDQUFDO0FBRXpELFVBQU0sU0FBUyxJQUFJLEtBQUssS0FBSyxTQUFTLE1BQU0sQ0FBQztBQUM3QyxVQUFNLGlCQUFpQixZQUFZLE9BQU8sTUFBTTtBQUVoRCxVQUFNLFNBQVMsSUFBSSxLQUFLLEtBQUssUUFBUSxPQUFPLE1BQU0sR0FBRyxRQUFRLENBQUMsRUFBRSxLQUFLLEVBQUUsUUFBUSxXQUFXLENBQUM7QUFFM0YsV0FBTyxZQUFZLE1BQU0sUUFBUSxRQUFRLFFBQVEsTUFBTSxHQUFHLElBQUk7QUFDOUQsVUFBTSxVQUFVLE1BQU0sUUFBUSxLQUFLLFFBQVEsTUFBTTtBQUVqRCxXQUFPLFlBQVksV0FBVyxRQUFRLFNBQVMsTUFBTSxHQUFHLElBQUk7QUFDNUQsV0FBTyxZQUFZLFdBQVcsT0FBTyxNQUFNLEdBQUcsS0FBSztBQUNuRCxXQUFPLEdBQUcsS0FBTTtBQUNoQixXQUFPLFlBQVksTUFBTyxTQUFTLFFBQVEsT0FBTyxNQUFNO0FBQ3hELFdBQU8sWUFBWSxNQUFPLFdBQVcsY0FBYyxJQUFJO0FBQ3ZELFdBQU8sWUFBWSxNQUFPLE9BQVEsU0FBUyxRQUFRLFFBQVEsU0FBUyxNQUFNO0FBRTFFLFVBQU0saUJBQWlCLFlBQVksT0FBTyxNQUFNO0FBQ2hELFdBQU8sWUFBWSxlQUFlLFFBQVEsZUFBZSxNQUFNO0FBQy9ELGFBQVMsSUFBSSxHQUFHLElBQUksZUFBZSxRQUFRLEtBQUs7QUFDL0MsYUFBTyxZQUFZLGVBQWUsQ0FBQyxHQUFHLGVBQWUsQ0FBQyxDQUFDO0FBQUEsSUFDeEQ7QUFBQSxFQUNEO0FBRUEsT0FBSyxtQkFBbUIsWUFBWTtBQUNuQyxRQUFJO0FBQ0osZ0JBQVksSUFBSSxRQUFRLGtCQUFrQixPQUFLLFFBQVEsQ0FBQyxDQUFDO0FBRXpELFVBQU0sU0FBUyxNQUFNLFFBQVEsUUFBUSxJQUFJLEtBQUssS0FBSyxTQUFTLFlBQVksQ0FBQyxHQUFHLEVBQUUsaUJBQWlCLEtBQUssQ0FBQztBQUNyRyxXQUFPLEdBQUcsT0FBTyxPQUFPLENBQUM7QUFFekIsVUFBTSxrQkFBa0IsSUFBSSxLQUFLLEtBQUssUUFBUSxPQUFPLFNBQVMsTUFBTSxHQUFHLFlBQVksQ0FBQztBQUNwRixXQUFPLFlBQVksTUFBTSxRQUFRLFFBQVEsT0FBTyxVQUFVLGVBQWUsR0FBRyxJQUFJO0FBQ2hGLFFBQUksVUFBVSxNQUFNLFFBQVEsS0FBSyxPQUFPLFVBQVUsZUFBZTtBQUVqRSxXQUFPLFlBQVksV0FBVyxnQkFBZ0IsTUFBTSxHQUFHLElBQUk7QUFDM0QsV0FBTyxZQUFZLFNBQVMsZ0JBQWdCLE1BQU0sR0FBRyxZQUFZO0FBQ2pFLFdBQU8sR0FBRyxLQUFNO0FBQ2hCLFdBQU8sWUFBWSxNQUFPLFNBQVMsUUFBUSxPQUFPLFNBQVMsTUFBTTtBQUNqRSxXQUFPLFlBQVksTUFBTyxXQUFXLGNBQWMsSUFBSTtBQUN2RCxXQUFPLFlBQVksTUFBTyxPQUFRLFNBQVMsUUFBUSxnQkFBZ0IsTUFBTTtBQUV6RSxjQUFVLE1BQU0sUUFBUSxRQUFRLGlCQUFpQixFQUFFLGlCQUFpQixLQUFLLENBQUM7QUFDMUUsV0FBTyxZQUFZLE9BQU8sTUFBTSxRQUFRLElBQUk7QUFBQSxFQUM3QyxDQUFDO0FBRUQsT0FBSyxvQkFBb0IsWUFBWTtBQUNwQyxRQUFJO0FBQ0osZ0JBQVksSUFBSSxRQUFRLGtCQUFrQixPQUFLLFFBQVEsQ0FBQyxDQUFDO0FBRXpELFVBQU0sU0FBUyxNQUFNLFFBQVEsUUFBUSxJQUFJLEtBQUssS0FBSyxTQUFTLFlBQVksQ0FBQyxHQUFHLEVBQUUsaUJBQWlCLEtBQUssQ0FBQztBQUNyRyxXQUFPLEdBQUcsT0FBTyxPQUFPLENBQUM7QUFFekIsV0FBTyxZQUFZLE1BQU0sUUFBUSxRQUFRLE9BQU8sVUFBVSxJQUFJLEtBQUssT0FBTyxTQUFTLE1BQU0sQ0FBQyxHQUFHLElBQUk7QUFDakcsUUFBSSxVQUFVLE1BQU0sUUFBUSxLQUFLLE9BQU8sVUFBVSxJQUFJLEtBQUssT0FBTyxTQUFTLE1BQU0sQ0FBQztBQUVsRixXQUFPLFlBQVksV0FBVyxRQUFRLFNBQVMsTUFBTSxHQUFHLElBQUk7QUFDNUQsV0FBTyxZQUFZLFNBQVMsUUFBUSxTQUFTLE1BQU0sR0FBRyxZQUFZO0FBQ2xFLFdBQU8sR0FBRyxLQUFNO0FBQ2hCLFdBQU8sWUFBWSxNQUFPLFNBQVMsUUFBUSxPQUFPLFNBQVMsTUFBTTtBQUNqRSxXQUFPLFlBQVksTUFBTyxXQUFXLGNBQWMsSUFBSTtBQUN2RCxXQUFPLFlBQVksTUFBTyxPQUFRLFNBQVMsUUFBUSxRQUFRLFNBQVMsTUFBTTtBQUUxRSxjQUFVLE1BQU0sUUFBUSxRQUFRLFFBQVEsVUFBVSxFQUFFLGlCQUFpQixLQUFLLENBQUM7QUFDM0UsV0FBTyxZQUFZLE9BQU8sTUFBTSxRQUFRLElBQUk7QUFBQSxFQUM3QyxDQUFDO0FBRUQsT0FBSyx1QkFBdUIsWUFBWTtBQUN2QyxRQUFJO0FBQ0osZ0JBQVksSUFBSSxRQUFRLGtCQUFrQixPQUFLLFFBQVEsQ0FBQyxDQUFDO0FBRXpELFVBQU0sU0FBUyxNQUFNLFFBQVEsUUFBUSxJQUFJLEtBQUssS0FBSyxTQUFTLFlBQVksQ0FBQyxHQUFHLEVBQUUsaUJBQWlCLEtBQUssQ0FBQztBQUNyRyxXQUFPLEdBQUcsT0FBTyxPQUFPLENBQUM7QUFFekIsVUFBTSxlQUFlLElBQUksS0FBSyxPQUFPO0FBQ3JDLFVBQU0sU0FBUyxhQUFhLEtBQUssRUFBRSxNQUFNLE1BQU0sS0FBSyxhQUFhLE1BQU0sTUFBTSxTQUFTLE9BQU8sU0FBUyxJQUFJLENBQUMsRUFBRSxDQUFDO0FBRTlHLFdBQU8sWUFBWSxNQUFNLFFBQVEsUUFBUSxPQUFPLFVBQVUsTUFBTSxHQUFHLElBQUk7QUFDdkUsUUFBSSxVQUFVLE1BQU0sUUFBUSxLQUFLLE9BQU8sVUFBVSxNQUFNO0FBRXhELFdBQU8sWUFBWSxXQUFXLFFBQVEsU0FBUyxNQUFNLEdBQUcsSUFBSTtBQUM1RCxXQUFPLFlBQVksU0FBUyxRQUFRLFNBQVMsTUFBTSxHQUFHLFlBQVk7QUFDbEUsV0FBTyxHQUFHLEtBQU07QUFDaEIsV0FBTyxZQUFZLE1BQU8sU0FBUyxRQUFRLE9BQU8sU0FBUyxNQUFNO0FBQ2pFLFdBQU8sWUFBWSxNQUFPLFdBQVcsY0FBYyxJQUFJO0FBQ3ZELFdBQU8sWUFBWSxNQUFPLE9BQVEsU0FBUyxRQUFRLFFBQVEsU0FBUyxNQUFNO0FBRTFFLGNBQVUsTUFBTSxRQUFRLFFBQVEsUUFBUSxVQUFVLEVBQUUsaUJBQWlCLEtBQUssQ0FBQztBQUMzRSxXQUFPLFlBQVksT0FBTyxNQUFNLFFBQVEsSUFBSTtBQUFBLEVBQzdDLENBQUM7QUFFRCxPQUFLLGtDQUFrQyxZQUFZO0FBQ2xELFFBQUk7QUFDSixnQkFBWSxJQUFJLFFBQVEsa0JBQWtCLE9BQUssUUFBUSxDQUFDLENBQUM7QUFFekQsUUFBSSxTQUFTLE1BQU0sUUFBUSxRQUFRLElBQUksS0FBSyxLQUFLLFNBQVMsWUFBWSxDQUFDLEdBQUcsRUFBRSxpQkFBaUIsS0FBSyxDQUFDO0FBQ25HLFVBQU0sZUFBZSxPQUFPO0FBQzVCLFdBQU8sR0FBRyxlQUFlLENBQUM7QUFFMUIsV0FBTyxHQUFJLE1BQU0sUUFBUSxRQUFRLElBQUksS0FBSyxPQUFPLEdBQUcsSUFBSSxLQUFLLEtBQUssU0FBUyxZQUFZLENBQUMsQ0FBQyxhQUFhLEtBQU07QUFFNUcsUUFBSTtBQUNKLFFBQUk7QUFDSCxZQUFNLFFBQVEsS0FBSyxJQUFJLEtBQUssT0FBTyxHQUFHLElBQUksS0FBSyxLQUFLLFNBQVMsWUFBWSxDQUFDLENBQUM7QUFBQSxJQUM1RSxTQUFTLEdBQUc7QUFDWCxjQUFRO0FBQUEsSUFDVDtBQUVBLFdBQU8sR0FBRyxLQUFLO0FBQ2YsV0FBTyxHQUFHLENBQUMsS0FBTTtBQUVqQixhQUFTLE1BQU0sUUFBUSxRQUFRLE9BQU8sVUFBVSxFQUFFLGlCQUFpQixLQUFLLENBQUM7QUFDekUsV0FBTyxZQUFZLGNBQWMsT0FBTyxJQUFJO0FBQUEsRUFDN0MsQ0FBQztBQUVELE9BQUssNkJBQTZCLFlBQVk7QUFDN0MsUUFBSTtBQUNKLGdCQUFZLElBQUksUUFBUSxrQkFBa0IsT0FBSyxRQUFRLENBQUMsQ0FBQztBQUV6RCxRQUFJLFNBQVMsTUFBTSxRQUFRLFFBQVEsSUFBSSxLQUFLLEtBQUssU0FBUyxZQUFZLENBQUMsR0FBRyxFQUFFLGlCQUFpQixLQUFLLENBQUM7QUFDbkcsVUFBTSxlQUFlLE9BQU87QUFDNUIsV0FBTyxHQUFHLGVBQWUsQ0FBQztBQUUxQixXQUFPLEdBQUksTUFBTSxRQUFRLFFBQVEsT0FBTyxVQUFVLElBQUksS0FBSyxLQUFLLFNBQVMsWUFBWSxDQUFDLENBQUMsYUFBYSxLQUFNO0FBRTFHLFFBQUk7QUFDSixRQUFJO0FBQ0gsWUFBTSxRQUFRLEtBQUssT0FBTyxVQUFVLElBQUksS0FBSyxLQUFLLFNBQVMsWUFBWSxDQUFDLENBQUM7QUFBQSxJQUMxRSxTQUFTLEdBQUc7QUFDWCxjQUFRO0FBQUEsSUFDVDtBQUVBLFdBQU8sWUFBWSxNQUFNLHFCQUFxQixvQkFBb0Isa0JBQWtCO0FBQ3BGLFdBQU8sR0FBRyxDQUFDLEtBQU07QUFFakIsYUFBUyxNQUFNLFFBQVEsUUFBUSxPQUFPLFVBQVUsRUFBRSxpQkFBaUIsS0FBSyxDQUFDO0FBQ3pFLFdBQU8sWUFBWSxjQUFjLE9BQU8sSUFBSTtBQUFBLEVBQzdDLENBQUM7QUFFRCxPQUFLLHFDQUFxQyxZQUFZO0FBQ3JELFFBQUk7QUFDSixRQUFJO0FBQ0osUUFBSTtBQUNKLGdCQUFZLElBQUksUUFBUSxrQkFBa0IsT0FBSztBQUM5QyxVQUFJLEVBQUUsY0FBYyxjQUFjLFFBQVE7QUFDekMsc0JBQWM7QUFBQSxNQUNmLFdBQVcsRUFBRSxjQUFjLGNBQWMsUUFBUTtBQUNoRCxzQkFBYztBQUFBLE1BQ2YsV0FBVyxFQUFFLGNBQWMsY0FBYyxNQUFNO0FBQzlDLG9CQUFZO0FBQUEsTUFDYjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsVUFBTSxTQUFTLE1BQU0sUUFBUSxRQUFRLElBQUksS0FBSyxPQUFPLENBQUM7QUFDdEQsVUFBTSxpQkFBaUIsSUFBSSxLQUFLLEtBQUssT0FBTyxTQUFTLFFBQVEsV0FBVyxDQUFDO0FBQ3pFLFVBQU0sSUFBSSxNQUFNLFFBQVEsYUFBYSxjQUFjO0FBQ25ELFVBQU0sU0FBUyxJQUFJLEtBQUssS0FBSyxTQUFTLFFBQVEsV0FBVyxDQUFDO0FBRTFELFdBQU8sWUFBWSxNQUFNLFFBQVEsUUFBUSxRQUFRLEVBQUUsVUFBVSxJQUFJLEdBQUcsSUFBSTtBQUN4RSxVQUFNLFFBQVEsTUFBTSxRQUFRLEtBQUssUUFBUSxFQUFFLFVBQVUsSUFBSTtBQUV6RCxXQUFPLFlBQVksV0FBVyxNQUFNLFNBQVMsTUFBTSxHQUFHLElBQUk7QUFDMUQsV0FBTyxHQUFHLFNBQVMsTUFBTSxTQUFTLE1BQU0sRUFBRSxNQUFNO0FBQ2hELFdBQU8sR0FBRyxXQUFZO0FBQ3RCLFdBQU8sR0FBRyxXQUFZO0FBQ3RCLFdBQU8sR0FBRyxTQUFVO0FBQ3BCLFdBQU8sWUFBWSxVQUFXLFNBQVMsUUFBUSxPQUFPLE1BQU07QUFDNUQsV0FBTyxZQUFZLFVBQVcsT0FBUSxTQUFTLFFBQVEsTUFBTSxTQUFTLE1BQU07QUFDNUUsV0FBTyxZQUFZLFlBQWEsU0FBUyxRQUFRLGVBQWUsTUFBTTtBQUFBLEVBQ3ZFLENBQUM7QUFFRCxPQUFLLFFBQVEsWUFBWTtBQUN4QixVQUFNLFdBQVc7QUFBQSxFQUNsQixDQUFDO0FBRUQsT0FBSyxvRUFBb0UsWUFBWTtBQUNwRixvQkFBZ0IsY0FBYywrQkFBK0IsYUFBYTtBQUUxRSxVQUFNLFdBQVc7QUFBQSxFQUNsQixDQUFDO0FBRUQsT0FBSywwRUFBMEUsWUFBWTtBQUMxRixvQkFBZ0IsY0FBYywrQkFBK0IsYUFBYTtBQUUxRSxVQUFNLFdBQVcsV0FBVztBQUFBLEVBQzdCLENBQUM7QUFFRCxPQUFLLDJFQUEyRSxZQUFZO0FBQzNGLG9CQUFnQixjQUFjLCtCQUErQixzQkFBc0I7QUFFbkYsVUFBTSxXQUFXO0FBQUEsRUFDbEIsQ0FBQztBQUVELE9BQUssaUZBQWlGLFlBQVk7QUFDakcsb0JBQWdCLGNBQWMsK0JBQStCLHNCQUFzQjtBQUVuRixVQUFNLFdBQVcsV0FBVztBQUFBLEVBQzdCLENBQUM7QUFFRCxXQUFTLGdCQUFnQixVQUFzQyxjQUFvRDtBQUNsSCxhQUFTLGVBQWU7QUFDeEIsUUFBSSxTQUFTO0FBQ1osZUFBUyxnQkFBZ0IsK0JBQStCO0FBQUEsSUFDekQ7QUFBQSxFQUNEO0FBRUEsaUJBQWUsV0FBVyxhQUFxQixjQUFjO0FBQzVELFFBQUk7QUFDSixnQkFBWSxJQUFJLFFBQVEsa0JBQWtCLE9BQUssUUFBUSxDQUFDLENBQUM7QUFFekQsVUFBTSxTQUFTLE1BQU0sUUFBUSxRQUFRLElBQUksS0FBSyxLQUFLLFNBQVMsVUFBVSxDQUFDLENBQUM7QUFDeEUsVUFBTSxTQUFTLElBQUksS0FBSyxLQUFLLFNBQVMsWUFBWSxDQUFDO0FBRW5ELFdBQU8sWUFBWSxNQUFNLFFBQVEsUUFBUSxPQUFPLFVBQVUsTUFBTSxHQUFHLElBQUk7QUFDdkUsVUFBTSxTQUFTLE1BQU0sUUFBUSxLQUFLLE9BQU8sVUFBVSxNQUFNO0FBRXpELFdBQU8sWUFBWSxXQUFXLE9BQU8sU0FBUyxNQUFNLEdBQUcsSUFBSTtBQUMzRCxXQUFPLFlBQVksV0FBVyxPQUFPLFNBQVMsTUFBTSxHQUFHLElBQUk7QUFDM0QsV0FBTyxHQUFHLEtBQU07QUFDaEIsV0FBTyxZQUFZLE1BQU8sU0FBUyxRQUFRLE9BQU8sU0FBUyxNQUFNO0FBQ2pFLFdBQU8sWUFBWSxNQUFPLFdBQVcsY0FBYyxJQUFJO0FBQ3ZELFdBQU8sWUFBWSxNQUFPLE9BQVEsU0FBUyxRQUFRLE9BQU8sU0FBUyxNQUFNO0FBRXpFLFVBQU0saUJBQWlCLGFBQWEsT0FBTyxTQUFTLE1BQU07QUFDMUQsVUFBTSxpQkFBaUIsYUFBYSxPQUFPLE1BQU07QUFFakQsV0FBTyxZQUFZLGVBQWUsWUFBWSxlQUFlLFVBQVU7QUFDdkUsV0FBTyxZQUFZLGVBQWUsU0FBUyxHQUFHLGVBQWUsU0FBUyxDQUFDO0FBQUEsRUFDeEU7QUFFQSxPQUFLLHFDQUFxQyxZQUFZO0FBQ3JELFFBQUk7QUFDSixRQUFJO0FBQ0osUUFBSTtBQUNKLGdCQUFZLElBQUksUUFBUSxrQkFBa0IsT0FBSztBQUM5QyxVQUFJLEVBQUUsY0FBYyxjQUFjLFFBQVE7QUFDekMsc0JBQWM7QUFBQSxNQUNmLFdBQVcsRUFBRSxjQUFjLGNBQWMsUUFBUTtBQUNoRCxzQkFBYztBQUFBLE1BQ2YsV0FBVyxFQUFFLGNBQWMsY0FBYyxNQUFNO0FBQzlDLG9CQUFZO0FBQUEsTUFDYjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsVUFBTSxTQUFTLE1BQU0sUUFBUSxRQUFRLElBQUksS0FBSyxPQUFPLENBQUM7QUFDdEQsVUFBTSxpQkFBaUIsSUFBSSxLQUFLLEtBQUssT0FBTyxTQUFTLFFBQVEsV0FBVyxDQUFDO0FBQ3pFLFVBQU0sSUFBSSxNQUFNLFFBQVEsYUFBYSxjQUFjO0FBQ25ELFVBQU0sU0FBUyxJQUFJLEtBQUssS0FBSyxTQUFTLFFBQVEsV0FBVyxDQUFDO0FBRTFELFdBQU8sWUFBWSxNQUFNLFFBQVEsUUFBUSxRQUFRLEVBQUUsVUFBVSxJQUFJLEdBQUcsSUFBSTtBQUN4RSxVQUFNLFNBQVMsTUFBTSxRQUFRLEtBQUssUUFBUSxFQUFFLFVBQVUsSUFBSTtBQUUxRCxXQUFPLFlBQVksV0FBVyxPQUFPLFNBQVMsTUFBTSxHQUFHLElBQUk7QUFDM0QsV0FBTyxHQUFHLFNBQVMsT0FBTyxTQUFTLE1BQU0sRUFBRSxNQUFNO0FBQ2pELFdBQU8sR0FBRyxXQUFZO0FBQ3RCLFdBQU8sR0FBRyxXQUFZO0FBQ3RCLFdBQU8sR0FBRyxTQUFVO0FBQ3BCLFdBQU8sWUFBWSxVQUFXLFNBQVMsUUFBUSxPQUFPLE1BQU07QUFDNUQsV0FBTyxZQUFZLFVBQVcsT0FBUSxTQUFTLFFBQVEsT0FBTyxTQUFTLE1BQU07QUFDN0UsV0FBTyxZQUFZLFlBQWEsU0FBUyxRQUFRLGVBQWUsTUFBTTtBQUFBLEVBQ3ZFLENBQUM7QUFFRCxPQUFLLDhDQUE4QyxZQUFZO0FBQzlELFFBQUksU0FBUyxNQUFNLFFBQVEsUUFBUSxJQUFJLEtBQUssS0FBSyxTQUFTLFlBQVksQ0FBQyxHQUFHLEVBQUUsaUJBQWlCLEtBQUssQ0FBQztBQUNuRyxVQUFNLGVBQWUsT0FBTztBQUM1QixXQUFPLEdBQUcsZUFBZSxDQUFDO0FBRTFCLFVBQU0sU0FBUyxJQUFJLEtBQUssS0FBSyxRQUFRLE9BQU8sU0FBUyxNQUFNLEdBQUcsWUFBWSxDQUFDO0FBRTNFLFVBQU0sVUFBVSxNQUFNLFFBQVEsUUFBUSxPQUFPLFVBQVUsTUFBTTtBQUU3RCxRQUFJO0FBQ0osUUFBSTtBQUNKLFFBQUk7QUFDSCxlQUFTLE1BQU0sUUFBUSxLQUFLLE9BQU8sVUFBVSxNQUFNO0FBQUEsSUFDcEQsU0FBUyxHQUFHO0FBQ1gsY0FBUTtBQUFBLElBQ1Q7QUFFQSxRQUFJLFNBQVM7QUFDWixhQUFPLEdBQUcsQ0FBQyxLQUFLO0FBQ2hCLGFBQU8sWUFBWSxTQUFTLElBQUk7QUFFaEMsYUFBTyxZQUFZLFdBQVcsT0FBUSxTQUFTLE1BQU0sR0FBRyxJQUFJO0FBQzVELGFBQU8sR0FBRyxZQUFZLE9BQU8sRUFBRSxLQUFLLE9BQUssTUFBTSxZQUFZLENBQUM7QUFDNUQsYUFBTyxZQUFZLE9BQU8sTUFBTSxPQUFRLElBQUk7QUFBQSxJQUM3QyxPQUFPO0FBQ04sYUFBTyxHQUFHLEtBQUs7QUFDZixhQUFPLEdBQUcsbUJBQW1CLEtBQUs7QUFFbEMsZUFBUyxNQUFNLFFBQVEsUUFBUSxPQUFPLFVBQVUsRUFBRSxpQkFBaUIsS0FBSyxDQUFDO0FBQ3pFLGFBQU8sWUFBWSxjQUFjLE9BQU8sSUFBSTtBQUFBLElBQzdDO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywyQ0FBMkMsWUFBWTtBQUMzRCxRQUFJLFNBQVMsTUFBTSxRQUFRLFFBQVEsSUFBSSxLQUFLLEtBQUssU0FBUyxZQUFZLENBQUMsR0FBRyxFQUFFLGlCQUFpQixLQUFLLENBQUM7QUFDbkcsVUFBTSxlQUFlLE9BQU87QUFDNUIsV0FBTyxHQUFHLGVBQWUsQ0FBQztBQUUxQixVQUFNLFNBQVMsSUFBSSxLQUFLLEtBQUssUUFBUSxPQUFPLFNBQVMsTUFBTSxHQUFHLFlBQVksQ0FBQztBQUUzRSxVQUFNLFVBQVUsTUFBTSxRQUFRLFFBQVEsT0FBTyxVQUFVLFFBQVEsSUFBSTtBQUVuRSxRQUFJO0FBQ0osUUFBSTtBQUNKLFFBQUk7QUFDSCxlQUFTLE1BQU0sUUFBUSxLQUFLLE9BQU8sVUFBVSxRQUFRLElBQUk7QUFBQSxJQUMxRCxTQUFTLEdBQUc7QUFDWCxjQUFRO0FBQUEsSUFDVDtBQUVBLFFBQUksU0FBUztBQUNaLGFBQU8sR0FBRyxDQUFDLEtBQUs7QUFDaEIsYUFBTyxZQUFZLFNBQVMsSUFBSTtBQUVoQyxhQUFPLFlBQVksV0FBVyxPQUFRLFNBQVMsTUFBTSxHQUFHLElBQUk7QUFDNUQsYUFBTyxHQUFHLFlBQVksT0FBTyxFQUFFLEtBQUssT0FBSyxNQUFNLFlBQVksQ0FBQztBQUM1RCxhQUFPLFlBQVksT0FBTyxNQUFNLE9BQVEsSUFBSTtBQUFBLElBQzdDLE9BQU87QUFDTixhQUFPLEdBQUcsS0FBSztBQUNmLGFBQU8sR0FBRyxtQkFBbUIsS0FBSztBQUVsQyxlQUFTLE1BQU0sUUFBUSxRQUFRLE9BQU8sVUFBVSxFQUFFLGlCQUFpQixLQUFLLENBQUM7QUFDekUsYUFBTyxZQUFZLGNBQWMsT0FBTyxJQUFJO0FBQUEsSUFDN0M7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGdEQUFnRCxZQUFZO0FBQ2hFLFVBQU0sVUFBVSxNQUFNLFFBQVEsUUFBUSxJQUFJLEtBQUssS0FBSyxTQUFTLFlBQVksQ0FBQyxHQUFHLEVBQUUsaUJBQWlCLEtBQUssQ0FBQztBQUN0RyxXQUFPLEdBQUcsUUFBUSxPQUFPLENBQUM7QUFFMUIsVUFBTSxVQUFVLE1BQU0sUUFBUSxLQUFLLFFBQVEsVUFBVSxJQUFJLEtBQUssS0FBSyxRQUFRLFFBQVEsU0FBUyxNQUFNLEdBQUcsV0FBVyxDQUFDLENBQUM7QUFDbEgsV0FBTyxZQUFZLFdBQVcsUUFBUSxTQUFTLE1BQU0sR0FBRyxJQUFJO0FBQzVELFdBQU8sR0FBRyxZQUFZLE9BQU8sRUFBRSxLQUFLLE9BQUssTUFBTSxXQUFXLENBQUM7QUFDM0QsV0FBTyxZQUFZLFFBQVEsTUFBTSxRQUFRLElBQUk7QUFFN0MsVUFBTSxVQUFVLE1BQU0sUUFBUSxRQUFRLElBQUksS0FBSyxLQUFLLFNBQVMsUUFBUSxXQUFXLENBQUMsR0FBRyxFQUFFLGlCQUFpQixLQUFLLENBQUM7QUFDN0csVUFBTSxTQUFTLElBQUksS0FBSyxLQUFLLFNBQVMsU0FBUyxRQUFRLFNBQVMsSUFBSSxDQUFDLENBQUM7QUFFdEUsV0FBTyxZQUFZLE1BQU0sUUFBUSxRQUFRLFFBQVEsVUFBVSxRQUFRLElBQUksR0FBRyxJQUFJO0FBQzlFLFVBQU0sTUFBTSxNQUFNLFFBQVEsS0FBSyxRQUFRLFVBQVUsUUFBUSxJQUFJO0FBQzdELFdBQU8sWUFBWSxXQUFXLElBQUksU0FBUyxNQUFNLEdBQUcsSUFBSTtBQUN4RCxXQUFPLEdBQUcsWUFBWSxPQUFPLEVBQUUsS0FBSyxPQUFLLE1BQU0sV0FBVyxDQUFDO0FBQzNELFdBQU8sWUFBWSxRQUFRLE1BQU0sSUFBSSxJQUFJO0FBQUEsRUFDMUMsQ0FBQztBQUVELE9BQUssb0JBQW9CLFlBQVk7QUFDcEMsUUFBSTtBQUNKLGdCQUFZLElBQUksUUFBUSxrQkFBa0IsT0FBSyxRQUFRLENBQUMsQ0FBQztBQUV6RCxVQUFNLFNBQVMsTUFBTSxRQUFRLFFBQVEsSUFBSSxLQUFLLEtBQUssU0FBUyxZQUFZLENBQUMsR0FBRyxFQUFFLGlCQUFpQixLQUFLLENBQUM7QUFDckcsV0FBTyxHQUFHLE9BQU8sT0FBTyxDQUFDO0FBRXpCLFdBQU8sWUFBWSxNQUFNLFFBQVEsUUFBUSxPQUFPLFVBQVUsSUFBSSxLQUFLLE9BQU8sU0FBUyxNQUFNLENBQUMsR0FBRyxJQUFJO0FBQ2pHLFFBQUksU0FBUyxNQUFNLFFBQVEsS0FBSyxPQUFPLFVBQVUsSUFBSSxLQUFLLE9BQU8sU0FBUyxNQUFNLENBQUM7QUFFakYsV0FBTyxZQUFZLFdBQVcsT0FBTyxTQUFTLE1BQU0sR0FBRyxJQUFJO0FBQzNELFdBQU8sWUFBWSxTQUFTLE9BQU8sU0FBUyxNQUFNLEdBQUcsWUFBWTtBQUNqRSxXQUFPLEdBQUcsS0FBTTtBQUNoQixXQUFPLFlBQVksTUFBTyxTQUFTLFFBQVEsT0FBTyxTQUFTLE1BQU07QUFDakUsV0FBTyxZQUFZLE1BQU8sV0FBVyxjQUFjLElBQUk7QUFDdkQsV0FBTyxZQUFZLE1BQU8sT0FBUSxTQUFTLFFBQVEsT0FBTyxTQUFTLE1BQU07QUFFekUsYUFBUyxNQUFNLFFBQVEsUUFBUSxPQUFPLFVBQVUsRUFBRSxpQkFBaUIsS0FBSyxDQUFDO0FBQ3pFLFdBQU8sWUFBWSxPQUFPLE1BQU0sT0FBTyxJQUFJO0FBQUEsRUFDNUMsQ0FBQztBQUVELE9BQUssdUJBQXVCLFlBQVk7QUFDdkMsUUFBSTtBQUNKLGdCQUFZLElBQUksUUFBUSxrQkFBa0IsT0FBSyxRQUFRLENBQUMsQ0FBQztBQUV6RCxVQUFNLFNBQVMsTUFBTSxRQUFRLFFBQVEsSUFBSSxLQUFLLEtBQUssU0FBUyxZQUFZLENBQUMsR0FBRyxFQUFFLGlCQUFpQixLQUFLLENBQUM7QUFDckcsV0FBTyxHQUFHLE9BQU8sT0FBTyxDQUFDO0FBRXpCLFVBQU0sZUFBZSxJQUFJLEtBQUssT0FBTztBQUNyQyxVQUFNLFNBQVMsYUFBYSxLQUFLLEVBQUUsTUFBTSxNQUFNLEtBQUssYUFBYSxNQUFNLE1BQU0sU0FBUyxPQUFPLFNBQVMsSUFBSSxDQUFDLEVBQUUsQ0FBQztBQUU5RyxXQUFPLFlBQVksTUFBTSxRQUFRLFFBQVEsT0FBTyxVQUFVLElBQUksS0FBSyxPQUFPLE1BQU0sQ0FBQyxHQUFHLElBQUk7QUFDeEYsUUFBSSxTQUFTLE1BQU0sUUFBUSxLQUFLLE9BQU8sVUFBVSxJQUFJLEtBQUssT0FBTyxNQUFNLENBQUM7QUFFeEUsV0FBTyxZQUFZLFdBQVcsT0FBTyxTQUFTLE1BQU0sR0FBRyxJQUFJO0FBQzNELFdBQU8sWUFBWSxTQUFTLE9BQU8sU0FBUyxNQUFNLEdBQUcsWUFBWTtBQUNqRSxXQUFPLEdBQUcsS0FBTTtBQUNoQixXQUFPLFlBQVksTUFBTyxTQUFTLFFBQVEsT0FBTyxTQUFTLE1BQU07QUFDakUsV0FBTyxZQUFZLE1BQU8sV0FBVyxjQUFjLElBQUk7QUFDdkQsV0FBTyxZQUFZLE1BQU8sT0FBUSxTQUFTLFFBQVEsT0FBTyxTQUFTLE1BQU07QUFFekUsYUFBUyxNQUFNLFFBQVEsUUFBUSxPQUFPLFVBQVUsRUFBRSxpQkFBaUIsS0FBSyxDQUFDO0FBQ3pFLFdBQU8sWUFBWSxPQUFPLE1BQU0sT0FBTyxJQUFJO0FBQUEsRUFDNUMsQ0FBQztBQUVELE9BQUssc0JBQXNCLE1BQU07QUFDaEMsV0FBTyxjQUFjO0FBQUEsRUFDdEIsQ0FBQztBQUVELE9BQUssbUNBQW1DLE1BQU07QUFDN0Msb0JBQWdCLGNBQWMsK0JBQStCLHlCQUF5QiwrQkFBK0IsY0FBYztBQUVuSSxXQUFPLGNBQWM7QUFBQSxFQUN0QixDQUFDO0FBRUQsT0FBSyx3QkFBd0IsTUFBTTtBQUNsQyxvQkFBZ0IsY0FBYywrQkFBK0Isc0JBQXNCO0FBRW5GLFdBQU8sY0FBYztBQUFBLEVBQ3RCLENBQUM7QUFFRCxpQkFBZSxnQkFBK0I7QUFDN0MsVUFBTSxVQUFVLElBQUksS0FBSyxLQUFLLFNBQVMsWUFBWSxDQUFDO0FBQ3BELFVBQU0sZUFBZSxNQUFNLFFBQVEsUUFBUSxTQUFTLEVBQUUsaUJBQWlCLEtBQUssQ0FBQyxHQUFHO0FBRWhGLFVBQU0sVUFBVSxJQUFJLEtBQUssS0FBSyxTQUFTLFdBQVcsQ0FBQztBQUNuRCxVQUFNLGVBQWUsTUFBTSxRQUFRLFFBQVEsU0FBUyxFQUFFLGlCQUFpQixLQUFLLENBQUMsR0FBRztBQUVoRixVQUFNLGVBQWUsSUFBSSxLQUFLLE9BQU87QUFHckMsVUFBTSxRQUFRLFVBQVUsU0FBUyxPQUFPO0FBR3hDLFVBQU0sVUFBVSxhQUFhLEtBQUssRUFBRSxNQUFNLE1BQU0sS0FBSyxhQUFhLE1BQU0sR0FBRyxNQUFNLFNBQVMsUUFBUSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7QUFFbEgsVUFBTSxRQUFRLFVBQVUsU0FBUyxJQUFJLEtBQUssUUFBUSxNQUFNLENBQUM7QUFFekQsV0FBTyxZQUFZLFdBQVcsUUFBUSxNQUFNLEdBQUcsSUFBSTtBQUNuRCxXQUFPLFlBQVksU0FBUyxRQUFRLE1BQU0sR0FBRyxrQkFBa0I7QUFFL0QsUUFBSSxlQUFlLE1BQU0sUUFBUSxRQUFRLFNBQVMsRUFBRSxpQkFBaUIsS0FBSyxDQUFDLEdBQUc7QUFFOUUsV0FBTyxZQUFZLGFBQWEsV0FBVztBQUczQyxVQUFNLFFBQVEsVUFBVSxTQUFTLElBQUksS0FBSyxRQUFRLE1BQU0sQ0FBQztBQUV6RCxtQkFBZSxNQUFNLFFBQVEsUUFBUSxTQUFTLEVBQUUsaUJBQWlCLEtBQUssQ0FBQyxHQUFHO0FBRTFFLFdBQU8sWUFBWSxhQUFhLFdBQVc7QUFDM0MsV0FBTyxlQUFlLGFBQWEsV0FBVztBQUc5QyxVQUFNLFVBQVUsYUFBYSxLQUFLLEVBQUUsTUFBTSxNQUFNLEtBQUssYUFBYSxNQUFNLE9BQU8sT0FBTyxHQUFHLE1BQU0sU0FBUyxRQUFRLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztBQUVoSSxVQUFNLFFBQVEsVUFBVSxTQUFTLElBQUksS0FBSyxRQUFRLE1BQU0sQ0FBQztBQUV6RCxXQUFPLFlBQVksV0FBVyxRQUFRLE1BQU0sR0FBRyxJQUFJO0FBQ25ELFdBQU8sWUFBWSxTQUFTLFFBQVEsTUFBTSxHQUFHLGtCQUFrQjtBQUUvRCxVQUFNLGVBQWUsTUFBTSxRQUFRLFFBQVEsU0FBUyxFQUFFLGlCQUFpQixLQUFLLENBQUMsR0FBRztBQUVoRixXQUFPLFlBQVksYUFBYSxXQUFXO0FBQUEsRUFDNUM7QUFFQSxPQUFLLG1DQUFtQyxNQUFNO0FBQzdDLFdBQU8sYUFBYSxJQUFJLEtBQUssS0FBSyxTQUFTLFdBQVcsQ0FBQyxDQUFDO0FBQUEsRUFDekQsQ0FBQztBQUVELE9BQUssb0NBQW9DLE1BQU07QUFDOUMsb0JBQWdCLGNBQWMsK0JBQStCLHNCQUFzQjtBQUVuRixXQUFPLGFBQWEsSUFBSSxLQUFLLEtBQUssU0FBUyxXQUFXLENBQUMsQ0FBQztBQUFBLEVBQ3pELENBQUM7QUFFRCxPQUFLLCtDQUErQyxNQUFNO0FBQ3pELG9CQUFnQixjQUFjLCtCQUErQix5QkFBeUIsK0JBQStCLFFBQVE7QUFFN0gsV0FBTyxhQUFhLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDLENBQUM7QUFBQSxFQUN6RCxDQUFDO0FBRUQsT0FBSyxzQ0FBc0MsWUFBWTtBQUN0RCxvQkFBZ0IsY0FBYywrQkFBK0IsYUFBYTtBQUUxRSxXQUFPLGFBQWEsSUFBSSxLQUFLLEtBQUssU0FBUyxXQUFXLENBQUMsQ0FBQztBQUFBLEVBQ3pELENBQUM7QUFFRCxPQUFLLGlEQUFpRCxZQUFZO0FBQ2pFLG9CQUFnQixjQUFjLCtCQUErQixnQkFBZ0IsK0JBQStCLFFBQVE7QUFFcEgsV0FBTyxhQUFhLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDLENBQUM7QUFBQSxFQUN6RCxDQUFDO0FBRUQsT0FBSyxvQ0FBb0MsWUFBWTtBQUNwRCxvQkFBZ0IsY0FBYywrQkFBK0IsY0FBYztBQUUzRSxXQUFPLGFBQWEsSUFBSSxLQUFLLEtBQUssU0FBUyxXQUFXLENBQUMsQ0FBQztBQUFBLEVBQ3pELENBQUM7QUFFRCxPQUFLLCtDQUErQyxZQUFZO0FBQy9ELG9CQUFnQixjQUFjLCtCQUErQixpQkFBaUIsK0JBQStCLFFBQVE7QUFFckgsV0FBTyxhQUFhLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDLENBQUM7QUFBQSxFQUN6RCxDQUFDO0FBRUQsT0FBSyxtQ0FBbUMsWUFBWTtBQUNuRCxXQUFPLGFBQWEsSUFBSSxLQUFLLEtBQUssU0FBUyxXQUFXLENBQUMsQ0FBQztBQUFBLEVBQ3pELENBQUM7QUFFRCxPQUFLLG9DQUFvQyxZQUFZO0FBQ3BELG9CQUFnQixjQUFjLCtCQUErQixzQkFBc0I7QUFFbkYsV0FBTyxhQUFhLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDLENBQUM7QUFBQSxFQUN6RCxDQUFDO0FBRUQsT0FBSyxzQ0FBc0MsWUFBWTtBQUN0RCxvQkFBZ0IsY0FBYywrQkFBK0IsYUFBYTtBQUUxRSxXQUFPLGFBQWEsSUFBSSxLQUFLLEtBQUssU0FBUyxXQUFXLENBQUMsQ0FBQztBQUFBLEVBQ3pELENBQUM7QUFFRCxPQUFLLG9DQUFvQyxZQUFZO0FBQ3BELG9CQUFnQixjQUFjLCtCQUErQixjQUFjO0FBRTNFLFdBQU8sYUFBYSxJQUFJLEtBQUssS0FBSyxTQUFTLFdBQVcsQ0FBQyxDQUFDO0FBQUEsRUFDekQsQ0FBQztBQUVELE9BQUssaURBQWlELFlBQVk7QUFDakUsb0JBQWdCLGNBQWMsK0JBQStCLGNBQWM7QUFFM0UsV0FBTyxhQUFhLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDLEdBQUcsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUFBLEVBQzNFLENBQUM7QUFFRCxPQUFLLDBDQUEwQyxZQUFZO0FBQzFELG9CQUFnQixjQUFjLCtCQUErQixnQkFBZ0IsK0JBQStCLGNBQWM7QUFFMUgsV0FBTyxhQUFhLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDLEdBQUcsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUFBLEVBQzNFLENBQUM7QUFFRCxpQkFBZSxhQUFhLFVBQWUsU0FBMkM7QUFDckYsVUFBTSxVQUFVLE1BQU0sUUFBUSxTQUFTLFVBQVUsT0FBTztBQUV4RCxXQUFPLFlBQVksUUFBUSxNQUFNLFNBQVMsR0FBRyxhQUFhLFNBQVMsTUFBTSxFQUFFLFNBQVMsQ0FBQztBQUFBLEVBQ3RGO0FBRUEsT0FBSyx5Q0FBeUMsTUFBTTtBQUNuRCxXQUFPLG1CQUFtQixJQUFJLEtBQUssS0FBSyxTQUFTLFdBQVcsQ0FBQyxDQUFDO0FBQUEsRUFDL0QsQ0FBQztBQUVELE9BQUssMENBQTBDLE1BQU07QUFDcEQsb0JBQWdCLGNBQWMsK0JBQStCLHNCQUFzQjtBQUVuRixXQUFPLG1CQUFtQixJQUFJLEtBQUssS0FBSyxTQUFTLFdBQVcsQ0FBQyxDQUFDO0FBQUEsRUFDL0QsQ0FBQztBQUVELE9BQUssNENBQTRDLFlBQVk7QUFDNUQsb0JBQWdCLGNBQWMsK0JBQStCLGFBQWE7QUFFMUUsV0FBTyxtQkFBbUIsSUFBSSxLQUFLLEtBQUssU0FBUyxXQUFXLENBQUMsQ0FBQztBQUFBLEVBQy9ELENBQUM7QUFFRCxPQUFLLDBDQUEwQyxZQUFZO0FBQzFELG9CQUFnQixjQUFjLCtCQUErQixjQUFjO0FBRTNFLFdBQU8sbUJBQW1CLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDLENBQUM7QUFBQSxFQUMvRCxDQUFDO0FBRUQsaUJBQWUsbUJBQW1CLFVBQThCO0FBQy9ELFVBQU0sVUFBVSxNQUFNLFFBQVEsZUFBZSxRQUFRO0FBRXJELFdBQU8sYUFBYSxNQUFNLGVBQWUsUUFBUSxLQUFLLEdBQUcsU0FBUyxHQUFHLGFBQWEsU0FBUyxNQUFNLEVBQUUsU0FBUyxDQUFDO0FBQUEsRUFDOUc7QUFFQSxPQUFLLHNEQUFzRCxZQUFZO0FBQ3RFLFdBQU8seUJBQXlCO0FBQUEsRUFDakMsQ0FBQztBQUVELE9BQUssdURBQXVELFlBQVk7QUFDdkUsb0JBQWdCLGNBQWMsK0JBQStCLHNCQUFzQjtBQUVuRixXQUFPLHlCQUF5QjtBQUFBLEVBQ2pDLENBQUM7QUFFRCxPQUFLLHlEQUF5RCxZQUFZO0FBQ3pFLG9CQUFnQixjQUFjLCtCQUErQixhQUFhO0FBRTFFLFdBQU8seUJBQXlCO0FBQUEsRUFDakMsQ0FBQztBQUVELE9BQUssdURBQXVELFlBQVk7QUFDdkUsb0JBQWdCLGNBQWMsK0JBQStCLGNBQWM7QUFFM0UsV0FBTyx5QkFBeUI7QUFBQSxFQUNqQyxDQUFDO0FBRUQsaUJBQWUsMkJBQTJCO0FBQ3pDLFVBQU0sWUFBWSxJQUFJLEtBQUssS0FBSyxTQUFTLFdBQVcsQ0FBQztBQUNyRCxVQUFNLFlBQVksSUFBSSxLQUFLLEtBQUssU0FBUyxrQkFBa0IsQ0FBQztBQUc1RCxVQUFNLFNBQVMsTUFBTSxRQUFRLFNBQVMsU0FBUztBQUMvQyxVQUFNLFNBQVMsTUFBTSxRQUFRLFNBQVMsU0FBUztBQUcvQyxVQUFNLFNBQVMsTUFBTSxRQUFRLElBQUk7QUFBQSxNQUNoQyxRQUFRLFNBQVMsU0FBUztBQUFBLE1BQzFCLFFBQVEsU0FBUyxTQUFTO0FBQUEsSUFDM0IsQ0FBQztBQUVELFdBQU8sWUFBWSxPQUFPLENBQUMsRUFBRSxNQUFNLFNBQVMsR0FBRyxPQUFPLE1BQU0sU0FBUyxDQUFDO0FBQ3RFLFdBQU8sWUFBWSxPQUFPLENBQUMsRUFBRSxNQUFNLFNBQVMsR0FBRyxPQUFPLE1BQU0sU0FBUyxDQUFDO0FBQUEsRUFDdkU7QUFFQSxPQUFLLDhDQUE4QyxZQUFZO0FBQzlELFdBQU8sOEJBQThCO0FBQUEsRUFDdEMsQ0FBQztBQUVELE9BQUssK0NBQStDLFlBQVk7QUFDL0Qsb0JBQWdCLGNBQWMsK0JBQStCLHNCQUFzQjtBQUVuRixXQUFPLDhCQUE4QjtBQUFBLEVBQ3RDLENBQUM7QUFFRCxPQUFLLGlEQUFpRCxZQUFZO0FBQ2pFLG9CQUFnQixjQUFjLCtCQUErQixhQUFhO0FBRTFFLFdBQU8sOEJBQThCO0FBQUEsRUFDdEMsQ0FBQztBQUVELE9BQUssK0NBQStDLFlBQVk7QUFDL0Qsb0JBQWdCLGNBQWMsK0JBQStCLGNBQWM7QUFFM0UsV0FBTyw4QkFBOEI7QUFBQSxFQUN0QyxDQUFDO0FBRUQsaUJBQWUsZ0NBQWdDO0FBQzlDLFVBQU0sV0FBVyxJQUFJLEtBQUssS0FBSyxTQUFTLFdBQVcsQ0FBQztBQUVwRCxVQUFNLFdBQVcsTUFBTSxRQUFRLFNBQVMsVUFBVSxFQUFFLFVBQVUsRUFBRSxDQUFDO0FBRWpFLFdBQU8sWUFBWSxTQUFTLE1BQU0sU0FBUyxHQUFHLE1BQU07QUFBQSxFQUNyRDtBQUVBLE9BQUssb0RBQW9ELFlBQVk7QUFDcEUsV0FBTywrQkFBK0I7QUFBQSxFQUN2QyxDQUFDO0FBRUQsT0FBSyxxREFBcUQsWUFBWTtBQUNyRSxvQkFBZ0IsY0FBYywrQkFBK0Isc0JBQXNCO0FBRW5GLFdBQU8sK0JBQStCO0FBQUEsRUFDdkMsQ0FBQztBQUVELE9BQUssdURBQXVELFlBQVk7QUFDdkUsb0JBQWdCLGNBQWMsK0JBQStCLGFBQWE7QUFFMUUsV0FBTywrQkFBK0I7QUFBQSxFQUN2QyxDQUFDO0FBRUQsT0FBSyxxREFBcUQsWUFBWTtBQUNyRSxvQkFBZ0IsY0FBYywrQkFBK0IsY0FBYztBQUUzRSxXQUFPLCtCQUErQjtBQUFBLEVBQ3ZDLENBQUM7QUFFRCxpQkFBZSxpQ0FBaUM7QUFDL0MsVUFBTSxXQUFXLElBQUksS0FBSyxLQUFLLFNBQVMsa0JBQWtCLENBQUM7QUFFM0QsVUFBTSxXQUFXLE1BQU0sUUFBUSxTQUFTLFVBQVUsRUFBRSxVQUFVLE9BQU8sS0FBSyxzQkFBbUIsRUFBRSxPQUFPLENBQUM7QUFFdkcsV0FBTyxZQUFZLFNBQVMsTUFBTSxTQUFTLEdBQUcsT0FBTztBQUFBLEVBQ3REO0FBRUEsT0FBSyx3Q0FBd0MsWUFBWTtBQUN4RCxXQUFPLDJCQUEyQjtBQUFBLEVBQ25DLENBQUM7QUFFRCxPQUFLLHlDQUF5QyxZQUFZO0FBQ3pELG9CQUFnQixjQUFjLCtCQUErQixzQkFBc0I7QUFFbkYsV0FBTywyQkFBMkI7QUFBQSxFQUNuQyxDQUFDO0FBRUQsT0FBSywyQ0FBMkMsWUFBWTtBQUMzRCxvQkFBZ0IsY0FBYywrQkFBK0IsYUFBYTtBQUUxRSxXQUFPLDJCQUEyQjtBQUFBLEVBQ25DLENBQUM7QUFFRCxPQUFLLHlDQUF5QyxZQUFZO0FBQ3pELG9CQUFnQixjQUFjLCtCQUErQixjQUFjO0FBRTNFLFdBQU8sMkJBQTJCO0FBQUEsRUFDbkMsQ0FBQztBQUVELGlCQUFlLDZCQUE2QjtBQUMzQyxVQUFNLFdBQVcsSUFBSSxLQUFLLEtBQUssU0FBUyxXQUFXLENBQUM7QUFFcEQsVUFBTSxXQUFXLE1BQU0sUUFBUSxTQUFTLFVBQVUsRUFBRSxRQUFRLEVBQUUsQ0FBQztBQUUvRCxXQUFPLFlBQVksU0FBUyxNQUFNLFNBQVMsR0FBRyxLQUFLO0FBQUEsRUFDcEQ7QUFFQSxPQUFLLDRDQUE0QyxZQUFZO0FBQzVELFdBQU8sd0JBQXdCLEdBQUs7QUFBQSxFQUNyQyxDQUFDO0FBRUQsT0FBSyw2Q0FBNkMsWUFBWTtBQUM3RCxvQkFBZ0IsY0FBYywrQkFBK0Isc0JBQXNCO0FBRW5GLFdBQU8sd0JBQXdCLEdBQUs7QUFBQSxFQUNyQyxDQUFDO0FBRUQsT0FBSywrQ0FBK0MsWUFBWTtBQUMvRCxvQkFBZ0IsY0FBYywrQkFBK0IsYUFBYTtBQUUxRSxXQUFPLHdCQUF3QixHQUFLO0FBQUEsRUFDckMsQ0FBQztBQUVELE9BQUssNkNBQTZDLFlBQVk7QUFDN0Qsb0JBQWdCLGNBQWMsK0JBQStCLGNBQWM7QUFFM0UsV0FBTyx3QkFBd0IsR0FBSztBQUFBLEVBQ3JDLENBQUM7QUFFRCxPQUFLLDRDQUE0QyxZQUFZO0FBQzVELFdBQU8sd0JBQXdCLEdBQUs7QUFBQSxFQUNyQyxDQUFDO0FBRUQsT0FBSyw2Q0FBNkMsWUFBWTtBQUM3RCxvQkFBZ0IsY0FBYywrQkFBK0Isc0JBQXNCO0FBRW5GLFdBQU8sd0JBQXdCLEdBQUs7QUFBQSxFQUNyQyxDQUFDO0FBRUQsT0FBSywrQ0FBK0MsWUFBWTtBQUMvRCxvQkFBZ0IsY0FBYywrQkFBK0IsYUFBYTtBQUUxRSxXQUFPLHdCQUF3QixHQUFLO0FBQUEsRUFDckMsQ0FBQztBQUVELE9BQUssNkNBQTZDLFlBQVk7QUFDN0Qsb0JBQWdCLGNBQWMsK0JBQStCLGNBQWM7QUFFM0UsV0FBTyx3QkFBd0IsR0FBSztBQUFBLEVBQ3JDLENBQUM7QUFFRCxpQkFBZSx3QkFBd0IsUUFBZ0I7QUFDdEQsVUFBTSxXQUFXLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDO0FBRXBELFVBQU0sV0FBVyxNQUFNLFFBQVEsU0FBUyxVQUFVLEVBQUUsT0FBTyxDQUFDO0FBRTVELFdBQU8sWUFBWSxTQUFTLE1BQU0sWUFBWSxNQUFNO0FBQUEsRUFDckQ7QUFFQSxPQUFLLGdDQUFnQyxZQUFZO0FBQ2hELFVBQU0sV0FBVyxJQUFJLEtBQUssS0FBSyxTQUFTLE1BQU0sQ0FBQztBQUUvQyxRQUFJLFFBQXdDO0FBQzVDLFFBQUk7QUFDSCxZQUFNLFFBQVEsU0FBUyxRQUFRO0FBQUEsSUFDaEMsU0FBUyxLQUFLO0FBQ2IsY0FBUTtBQUFBLElBQ1Q7QUFFQSxXQUFPLEdBQUcsS0FBSztBQUNmLFdBQU8sWUFBWSxNQUFNLHFCQUFxQixvQkFBb0IsaUJBQWlCO0FBQUEsRUFDcEYsQ0FBQztBQUVELEdBQUMsWUFBc0UsS0FBSyxPQUFPLE1BQU0saUNBQWlDLFlBQVk7QUFDckksVUFBTSxXQUFXLElBQUksS0FBSyxLQUFLLFNBQVMsYUFBYSxVQUFVLENBQUM7QUFFaEUsUUFBSSxRQUF3QztBQUM1QyxRQUFJO0FBQ0gsWUFBTSxRQUFRLFNBQVMsUUFBUTtBQUFBLElBQ2hDLFNBQVMsS0FBSztBQUNiLGNBQVE7QUFBQSxJQUNUO0FBRUEsV0FBTyxHQUFHLEtBQUs7QUFDZixXQUFPLFlBQVksTUFBTSxxQkFBcUIsb0JBQW9CLGtCQUFrQjtBQUFBLEVBQ3JGLENBQUM7QUFFRCxPQUFLLDZCQUE2QixZQUFZO0FBQzdDLFVBQU0sV0FBVyxJQUFJLEtBQUssS0FBSyxTQUFTLFVBQVUsQ0FBQztBQUVuRCxRQUFJLFFBQXdDO0FBQzVDLFFBQUk7QUFDSCxZQUFNLFFBQVEsU0FBUyxRQUFRO0FBQUEsSUFDaEMsU0FBUyxLQUFLO0FBQ2IsY0FBUTtBQUFBLElBQ1Q7QUFFQSxXQUFPLEdBQUcsS0FBSztBQUNmLFdBQU8sWUFBWSxNQUFNLHFCQUFxQixvQkFBb0IsY0FBYztBQUFBLEVBQ2pGLENBQUM7QUFFRCxPQUFLLGdEQUFnRCxZQUFZO0FBQ2hFLFdBQU8scUJBQXFCO0FBQUEsRUFDN0IsQ0FBQztBQUVELE9BQUssaURBQWlELFlBQVk7QUFDakUsb0JBQWdCLGNBQWMsK0JBQStCLHNCQUFzQjtBQUVuRixXQUFPLHFCQUFxQjtBQUFBLEVBQzdCLENBQUM7QUFFRCxPQUFLLG1EQUFtRCxZQUFZO0FBQ25FLG9CQUFnQixjQUFjLCtCQUErQixhQUFhO0FBRTFFLFdBQU8scUJBQXFCO0FBQUEsRUFDN0IsQ0FBQztBQUVELE9BQUssaURBQWlELFlBQVk7QUFDakUsb0JBQWdCLGNBQWMsK0JBQStCLGNBQWM7QUFFM0UsV0FBTyxxQkFBcUI7QUFBQSxFQUM3QixDQUFDO0FBRUQsaUJBQWUsdUJBQXVCO0FBQ3JDLFVBQU0sV0FBVyxJQUFJLEtBQUssS0FBSyxTQUFTLFlBQVksQ0FBQztBQUVyRCxVQUFNLFdBQVcsTUFBTSxRQUFRLFNBQVMsUUFBUTtBQUNoRCxpQkFBYSxpQkFBaUI7QUFFOUIsUUFBSSxRQUF3QztBQUM1QyxRQUFJO0FBQ0gsWUFBTSxRQUFRLFNBQVMsVUFBVSxFQUFFLE1BQU0sU0FBUyxLQUFLLENBQUM7QUFBQSxJQUN6RCxTQUFTLEtBQUs7QUFDYixjQUFRO0FBQUEsSUFDVDtBQUVBLFdBQU8sR0FBRyxLQUFLO0FBQ2YsV0FBTyxZQUFZLE1BQU0scUJBQXFCLG9CQUFvQix1QkFBdUI7QUFDekYsV0FBTyxHQUFHLGlCQUFpQixzQ0FBc0MsTUFBTSxJQUFJO0FBQzNFLFdBQU8sWUFBWSxhQUFhLGdCQUFnQixDQUFDO0FBQUEsRUFDbEQ7QUFFQSxPQUFLLCtHQUErRyxZQUFZO0FBQy9ILGlCQUFhLG1CQUFtQixJQUFJO0FBRXBDLFVBQU0sV0FBVyxJQUFJLEtBQUssS0FBSyxTQUFTLFlBQVksQ0FBQztBQUVyRCxVQUFNLFFBQVEsU0FBUyxRQUFRO0FBRS9CLFFBQUksUUFBd0M7QUFDNUMsUUFBSTtBQUNILFlBQU0sUUFBUSxTQUFTLFVBQVUsRUFBRSxNQUFNLE9BQVUsQ0FBQztBQUFBLElBQ3JELFNBQVMsS0FBSztBQUNiLGNBQVE7QUFBQSxJQUNUO0FBRUEsV0FBTyxHQUFHLENBQUMsS0FBSztBQUFBLEVBQ2pCLENBQUM7QUFFRCxPQUFLLHVDQUF1QyxZQUFZO0FBQ3ZELFdBQU8saUJBQWlCO0FBQUEsRUFDekIsQ0FBQztBQUVELE9BQUssd0NBQXdDLFlBQVk7QUFDeEQsb0JBQWdCLGNBQWMsK0JBQStCLHNCQUFzQjtBQUVuRixXQUFPLGlCQUFpQjtBQUFBLEVBQ3pCLENBQUM7QUFFRCxPQUFLLDBDQUEwQyxZQUFZO0FBQzFELG9CQUFnQixjQUFjLCtCQUErQixhQUFhO0FBRTFFLFdBQU8saUJBQWlCO0FBQUEsRUFDekIsQ0FBQztBQUVELE9BQUssd0NBQXdDLFlBQVk7QUFDeEQsb0JBQWdCLGNBQWMsK0JBQStCLGNBQWM7QUFFM0UsV0FBTyxpQkFBaUI7QUFBQSxFQUN6QixDQUFDO0FBRUQsaUJBQWUsbUJBQW1CO0FBQ2pDLFVBQU0sbUJBQW1CLEtBQUs7QUFHOUIsaUJBQWEsaUJBQWlCLElBQUk7QUFDbEMsV0FBTyxtQkFBbUIsSUFBSTtBQUFBLEVBQy9CO0FBRUEsaUJBQWUsbUJBQW1CLGVBQXdCO0FBQ3pELFVBQU0sV0FBVyxJQUFJLEtBQUssS0FBSyxTQUFTLFlBQVksQ0FBQztBQUVyRCxRQUFJLFFBQXdDO0FBQzVDLFFBQUk7QUFDSCxZQUFNLFFBQVEsU0FBUyxVQUFVLEVBQUUsUUFBUSxFQUFFLE1BQU0sR0FBRyxFQUFFLENBQUM7QUFBQSxJQUMxRCxTQUFTLEtBQUs7QUFDYixjQUFRO0FBQUEsSUFDVDtBQUVBLFFBQUksQ0FBQyxlQUFlO0FBQ25CLGFBQU8sR0FBRyxpQkFBaUIsMEJBQTBCO0FBQ3JELGFBQU8sR0FBRyxPQUFPLE1BQU0sU0FBUyxRQUFRO0FBQUEsSUFDekM7QUFDQSxXQUFPLFlBQVksTUFBTyxxQkFBcUIsb0JBQW9CLGNBQWM7QUFBQSxFQUNsRjtBQUVBLEdBQUMsWUFBWSxLQUFLLE9BQWdGLE1BQU0seUZBQXlGLFlBQVk7QUFDNU0sVUFBTSxPQUFPLElBQUksS0FBSyxLQUFLLFNBQVMsZUFBZSxDQUFDO0FBQ3BELFVBQU0sU0FBUyxRQUFRLEtBQUssU0FBUyxVQUFVLEdBQUcsS0FBSyxNQUFNO0FBRTdELFFBQUksUUFBd0M7QUFDNUMsUUFBSTtBQUNILFlBQU0sUUFBUSxTQUFTLElBQUk7QUFBQSxJQUM1QixTQUFTLEtBQUs7QUFDYixjQUFRO0FBQUEsSUFDVDtBQUVBLFdBQU8sR0FBRyxLQUFLO0FBQUEsRUFDaEIsQ0FBQztBQUVELE9BQUssY0FBYyxZQUFZO0FBQzlCLFdBQU8saUJBQWlCLGNBQVksU0FBUyxXQUFXLFFBQVEsQ0FBQztBQUFBLEVBQ2xFLENBQUM7QUFFRCxPQUFLLHlCQUF5QixZQUFZO0FBQ3pDLFdBQU8saUJBQWlCLGNBQVksaUJBQWlCLFNBQVMsV0FBVyxRQUFRLENBQUMsQ0FBQztBQUFBLEVBQ3BGLENBQUM7QUFFRCxPQUFLLHVCQUF1QixZQUFZO0FBQ3ZDLFdBQU8saUJBQWlCLGNBQVksZUFBZSxTQUFTLFdBQVcsUUFBUSxDQUFDLENBQUM7QUFBQSxFQUNsRixDQUFDO0FBRUQsaUJBQWUsaUJBQWlCLFdBQXFHO0FBQ3BJLFFBQUk7QUFDSixnQkFBWSxJQUFJLFFBQVEsa0JBQWtCLE9BQUssUUFBUSxDQUFDLENBQUM7QUFFekQsVUFBTSxXQUFXO0FBQ2pCLFVBQU0sV0FBVyxJQUFJLEtBQUssS0FBSyxTQUFTLFVBQVUsQ0FBQztBQUVuRCxXQUFPLFlBQVksTUFBTSxRQUFRLGNBQWMsUUFBUSxHQUFHLElBQUk7QUFDOUQsVUFBTSxXQUFXLE1BQU0sUUFBUSxXQUFXLFVBQVUsVUFBVSxRQUFRLENBQUM7QUFDdkUsV0FBTyxZQUFZLFNBQVMsTUFBTSxVQUFVO0FBQzVDLFdBQU8sWUFBWSxXQUFXLFNBQVMsU0FBUyxNQUFNLEdBQUcsSUFBSTtBQUM3RCxXQUFPLFlBQVksYUFBYSxTQUFTLFNBQVMsTUFBTSxFQUFFLFNBQVMsR0FBRyxRQUFRO0FBRTlFLFdBQU8sR0FBRyxLQUFNO0FBQ2hCLFdBQU8sWUFBWSxNQUFPLFNBQVMsUUFBUSxTQUFTLE1BQU07QUFDMUQsV0FBTyxZQUFZLE1BQU8sV0FBVyxjQUFjLE1BQU07QUFDekQsV0FBTyxZQUFZLE1BQU8sT0FBUSxTQUFTLFFBQVEsU0FBUyxNQUFNO0FBQUEsRUFDbkU7QUFFQSxPQUFLLDhDQUE4QyxZQUFZO0FBQzlELFVBQU0sV0FBVztBQUNqQixVQUFNLFdBQVcsSUFBSSxLQUFLLEtBQUssU0FBUyxVQUFVLENBQUM7QUFFbkQsa0JBQWMsU0FBUyxRQUFRLEVBQUU7QUFFakMsV0FBTyxHQUFJLE1BQU0sUUFBUSxjQUFjLFFBQVEsYUFBYyxLQUFLO0FBRWxFLFFBQUk7QUFDSixRQUFJO0FBQ0gsWUFBTSxRQUFRLFdBQVcsVUFBVSxTQUFTLFdBQVcsUUFBUSxDQUFDO0FBQUEsSUFDakUsU0FBUyxLQUFLO0FBQ2IsY0FBUTtBQUFBLElBQ1Q7QUFFQSxXQUFPLEdBQUcsS0FBSztBQUFBLEVBQ2hCLENBQUM7QUFFRCxPQUFLLDZDQUE2QyxZQUFZO0FBQzdELFFBQUk7QUFDSixnQkFBWSxJQUFJLFFBQVEsa0JBQWtCLE9BQUssUUFBUSxDQUFDLENBQUM7QUFFekQsVUFBTSxXQUFXO0FBQ2pCLFVBQU0sV0FBVyxJQUFJLEtBQUssS0FBSyxTQUFTLFVBQVUsQ0FBQztBQUVuRCxrQkFBYyxTQUFTLFFBQVEsRUFBRTtBQUVqQyxXQUFPLFlBQVksTUFBTSxRQUFRLGNBQWMsVUFBVSxFQUFFLFdBQVcsS0FBSyxDQUFDLEdBQUcsSUFBSTtBQUNuRixVQUFNLFdBQVcsTUFBTSxRQUFRLFdBQVcsVUFBVSxTQUFTLFdBQVcsUUFBUSxHQUFHLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFDdEcsV0FBTyxZQUFZLFNBQVMsTUFBTSxVQUFVO0FBQzVDLFdBQU8sWUFBWSxXQUFXLFNBQVMsU0FBUyxNQUFNLEdBQUcsSUFBSTtBQUM3RCxXQUFPLFlBQVksYUFBYSxTQUFTLFNBQVMsTUFBTSxFQUFFLFNBQVMsR0FBRyxRQUFRO0FBRTlFLFdBQU8sR0FBRyxLQUFNO0FBQ2hCLFdBQU8sWUFBWSxNQUFPLFNBQVMsUUFBUSxTQUFTLE1BQU07QUFDMUQsV0FBTyxZQUFZLE1BQU8sV0FBVyxjQUFjLE1BQU07QUFDekQsV0FBTyxZQUFZLE1BQU8sT0FBUSxTQUFTLFFBQVEsU0FBUyxNQUFNO0FBQUEsRUFDbkUsQ0FBQztBQUVELE9BQUssdUJBQXVCLFlBQVk7QUFDdkMsV0FBTyxjQUFjLEtBQUs7QUFBQSxFQUMzQixDQUFDO0FBRUQsT0FBSyw4QkFBOEIsWUFBWTtBQUM5QywyQkFBdUIsc0JBQXNCLElBQUk7QUFDakQsUUFBSTtBQUNILGFBQU8sTUFBTSxjQUFjLEtBQUs7QUFBQSxJQUNqQyxVQUFFO0FBQ0QsNkJBQXVCLHNCQUFzQixLQUFLO0FBQUEsSUFDbkQ7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHdCQUF3QixZQUFZO0FBQ3hDLG9CQUFnQixjQUFjLCtCQUErQixzQkFBc0I7QUFFbkYsV0FBTyxjQUFjLEtBQUs7QUFBQSxFQUMzQixDQUFDO0FBRUQsT0FBSywwQkFBMEIsWUFBWTtBQUMxQyxvQkFBZ0IsY0FBYywrQkFBK0IsYUFBYTtBQUUxRSxXQUFPLGNBQWMsS0FBSztBQUFBLEVBQzNCLENBQUM7QUFFRCxPQUFLLGdDQUFnQyxZQUFZO0FBQ2hELFdBQU8sY0FBYyxJQUFJO0FBQUEsRUFDMUIsQ0FBQztBQUVELE9BQUssdUNBQXVDLFlBQVk7QUFDdkQsMkJBQXVCLHNCQUFzQixJQUFJO0FBQ2pELFFBQUk7QUFDSCxhQUFPLE1BQU0sY0FBYyxJQUFJO0FBQUEsSUFDaEMsVUFBRTtBQUNELDZCQUF1QixzQkFBc0IsS0FBSztBQUFBLElBQ25EO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxpQ0FBaUMsWUFBWTtBQUNqRCxvQkFBZ0IsY0FBYywrQkFBK0IseUJBQXlCLCtCQUErQixlQUFlO0FBRXBJLFFBQUk7QUFDSixRQUFJO0FBQ0gsWUFBTSxjQUFjLElBQUk7QUFBQSxJQUN6QixTQUFTLE9BQU87QUFDZixVQUFJO0FBQUEsSUFDTDtBQUVBLFdBQU8sR0FBRyxDQUFDO0FBQUEsRUFDWixDQUFDO0FBRUQsT0FBSyxtQ0FBbUMsWUFBWTtBQUNuRCxvQkFBZ0IsY0FBYywrQkFBK0IsZ0JBQWdCLCtCQUErQixlQUFlO0FBRTNILFdBQU8sY0FBYyxJQUFJO0FBQUEsRUFDMUIsQ0FBQztBQUVELEdBQUMsWUFBWSxLQUFLLE9BQWdGLE1BQU0sc0RBQXNELFlBQVk7QUFDekssVUFBTSxPQUFPLElBQUksS0FBSyxLQUFLLFNBQVMsa0JBQWtCLENBQUM7QUFDdkQsVUFBTSxTQUFTLFFBQVEsS0FBSyxTQUFTLFdBQVcsR0FBRyxLQUFLLE1BQU07QUFFOUQsVUFBTSxVQUFVO0FBQ2hCLFVBQU0sUUFBUSxVQUFVLE1BQU0sU0FBUyxXQUFXLE9BQU8sR0FBRyxFQUFFLFFBQVEsRUFBRSxTQUFTLFVBQVUsRUFBRSxDQUFDO0FBQzlGLFdBQU8sWUFBWSxhQUFhLEtBQUssTUFBTSxFQUFFLFNBQVMsR0FBRyxPQUFPO0FBRWhFLFVBQU0sV0FBVyxNQUFNLFFBQVEsUUFBUSxJQUFJO0FBQzNDLFdBQU8sWUFBWSxTQUFTLGdCQUFnQixJQUFJO0FBQUEsRUFDakQsQ0FBQztBQUVELGlCQUFlLGNBQWMsUUFBaUI7QUFDN0MsUUFBSTtBQUNKLGdCQUFZLElBQUksUUFBUSxrQkFBa0IsT0FBSyxRQUFRLENBQUMsQ0FBQztBQUV6RCxVQUFNLFdBQVcsSUFBSSxLQUFLLEtBQUssU0FBUyxXQUFXLENBQUM7QUFFcEQsVUFBTSxVQUFVLGFBQWEsU0FBUyxNQUFNLEVBQUUsU0FBUztBQUN2RCxXQUFPLFlBQVksU0FBUyxZQUFZO0FBRXhDLFVBQU0sYUFBYTtBQUNuQixVQUFNLFFBQVEsVUFBVSxVQUFVLFNBQVMsV0FBVyxVQUFVLEdBQUcsRUFBRSxRQUFRLFNBQVMsRUFBRSxTQUFTLFVBQVUsSUFBSSxNQUFNLENBQUM7QUFFdEgsV0FBTyxHQUFHLEtBQU07QUFDaEIsV0FBTyxZQUFZLE1BQU8sU0FBUyxRQUFRLFNBQVMsTUFBTTtBQUMxRCxXQUFPLFlBQVksTUFBTyxXQUFXLGNBQWMsS0FBSztBQUV4RCxXQUFPLFlBQVksYUFBYSxTQUFTLE1BQU0sRUFBRSxTQUFTLEdBQUcsVUFBVTtBQUFBLEVBQ3hFO0FBRUEsT0FBSyxvQ0FBb0MsWUFBWTtBQUNwRCxXQUFPLG1CQUFtQixLQUFLO0FBQUEsRUFDaEMsQ0FBQztBQUVELE9BQUsscUNBQXFDLFlBQVk7QUFDckQsb0JBQWdCLGNBQWMsK0JBQStCLHNCQUFzQjtBQUVuRixXQUFPLG1CQUFtQixLQUFLO0FBQUEsRUFDaEMsQ0FBQztBQUVELE9BQUssdUNBQXVDLFlBQVk7QUFDdkQsb0JBQWdCLGNBQWMsK0JBQStCLGFBQWE7QUFFMUUsV0FBTyxtQkFBbUIsS0FBSztBQUFBLEVBQ2hDLENBQUM7QUFFRCxPQUFLLDZDQUE2QyxZQUFZO0FBQzdELFdBQU8sbUJBQW1CLElBQUk7QUFBQSxFQUMvQixDQUFDO0FBRUQsT0FBSyw4Q0FBOEMsWUFBWTtBQUM5RCxvQkFBZ0IsY0FBYywrQkFBK0IseUJBQXlCLCtCQUErQixlQUFlO0FBRXBJLFFBQUk7QUFDSixRQUFJO0FBQ0gsWUFBTSxtQkFBbUIsSUFBSTtBQUFBLElBQzlCLFNBQVMsT0FBTztBQUNmLFVBQUk7QUFBQSxJQUNMO0FBRUEsV0FBTyxHQUFHLENBQUM7QUFBQSxFQUNaLENBQUM7QUFFRCxPQUFLLGdEQUFnRCxZQUFZO0FBQ2hFLG9CQUFnQixjQUFjLCtCQUErQixnQkFBZ0IsK0JBQStCLGVBQWU7QUFFM0gsV0FBTyxtQkFBbUIsSUFBSTtBQUFBLEVBQy9CLENBQUM7QUFFRCxpQkFBZSxtQkFBbUIsUUFBaUI7QUFDbEQsVUFBTSxXQUFXLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDO0FBRXBELFVBQU0sVUFBVSxhQUFhLFNBQVMsTUFBTTtBQUM1QyxVQUFNLGFBQWEsUUFBUSxTQUFTLElBQUksUUFBUSxTQUFTO0FBRXpELFVBQU0sV0FBVyxNQUFNLFFBQVEsVUFBVSxVQUFVLFNBQVMsV0FBVyxVQUFVLEdBQUcsRUFBRSxRQUFRLFNBQVMsRUFBRSxTQUFTLFVBQVUsSUFBSSxNQUFNLENBQUM7QUFDdkksV0FBTyxZQUFZLFNBQVMsTUFBTSxXQUFXO0FBRTdDLFdBQU8sWUFBWSxhQUFhLFNBQVMsTUFBTSxFQUFFLFNBQVMsR0FBRyxVQUFVO0FBQUEsRUFDeEU7QUFFQSxPQUFLLDJGQUEyRixZQUFZO0FBQzNHLG9CQUFnQixjQUFjLCtCQUErQixnQkFBZ0IsK0JBQStCLGVBQWU7QUFFM0gsVUFBTSxXQUFXLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDO0FBRXBELFVBQU0sVUFBVSxhQUFhLFNBQVMsTUFBTTtBQUM1QyxVQUFNLGFBQWEsUUFBUSxTQUFTLElBQUksUUFBUSxTQUFTO0FBRXpELFVBQU1BLFlBQTZDLENBQUM7QUFDcEQsUUFBSSxTQUFTO0FBQ2IsYUFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLEtBQUs7QUFDNUIsWUFBTUMsV0FBVSxZQUFZLElBQUksSUFBSSxZQUFZLElBQUksZUFBZSxDQUFDLENBQUM7QUFDckUsa0JBQVksSUFBSUEsU0FBUSxpQkFBaUIsUUFBUSxNQUFNLFlBQVksQ0FBQztBQUVwRSxNQUFBRCxVQUFTLEtBQUtDLFNBQVEsVUFBVSxVQUFVLFNBQVMsV0FBVyxHQUFHLFVBQVUsR0FBRyxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsUUFBUSxFQUFFLFNBQVMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUM5SCxZQUFNLFFBQVEsQ0FBQztBQUFBLElBQ2hCO0FBRUEsVUFBTSxRQUFRLFdBQVdELFNBQVE7QUFFakMsV0FBTyxZQUFZLGFBQWEsU0FBUyxNQUFNLEVBQUUsU0FBUyxHQUFHLEdBQUcsVUFBVSxHQUFHLE1BQU0sRUFBRTtBQUFBLEVBQ3RGLENBQUM7QUFFRCxPQUFLLDBDQUEwQyxZQUFZO0FBQzFELG9CQUFnQixjQUFjLCtCQUErQix5QkFBeUIsK0JBQStCLFFBQVE7QUFFN0gsV0FBTyw0QkFBNEI7QUFBQSxFQUNwQyxDQUFDO0FBRUQsT0FBSyw0Q0FBNEMsWUFBWTtBQUM1RCxvQkFBZ0IsY0FBYywrQkFBK0IsZ0JBQWdCLCtCQUErQixRQUFRO0FBRXBILFdBQU8sNEJBQTRCO0FBQUEsRUFDcEMsQ0FBQztBQUVELGlCQUFlLDhCQUE4QjtBQUM1QyxVQUFNLFdBQVcsSUFBSSxLQUFLLEtBQUssU0FBUyxXQUFXLENBQUM7QUFFcEQsVUFBTSxVQUFVLGFBQWEsU0FBUyxNQUFNLEVBQUUsU0FBUztBQUN2RCxXQUFPLFlBQVksU0FBUyxZQUFZO0FBRXhDLFVBQU0sYUFBYTtBQUVuQixRQUFJO0FBQ0osUUFBSTtBQUNILFlBQU0sUUFBUSxVQUFVLFVBQVUsU0FBUyxXQUFXLFVBQVUsQ0FBQztBQUFBLElBQ2xFLFNBQVMsS0FBSztBQUNiLGNBQVE7QUFBQSxJQUNUO0FBRUEsV0FBTyxHQUFHLEtBQU07QUFBQSxFQUNqQjtBQUVBLE9BQUsseUdBQXlHLFlBQVk7QUFDekgsVUFBTSxXQUFXLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDO0FBRXBELFVBQU0sVUFBVSxhQUFhLFNBQVMsTUFBTTtBQUM1QyxVQUFNLGFBQWEsUUFBUSxTQUFTLElBQUksUUFBUSxTQUFTO0FBRXpELFVBQU0sZ0JBQWdCLFFBQVEsSUFBSSxDQUFDLEtBQUssTUFBTSxPQUFPLFFBQVEsT0FBTyxFQUFFLElBQUksT0FBTSxXQUFVO0FBQ3pGLFlBQU0sV0FBVyxNQUFNLFFBQVEsVUFBVSxVQUFVLFNBQVMsV0FBVyxTQUFTLFVBQVUsQ0FBQztBQUMzRixhQUFPLFlBQVksU0FBUyxNQUFNLFdBQVc7QUFBQSxJQUM5QyxDQUFDLENBQUM7QUFFRixVQUFNLGVBQWUsUUFBUSxJQUFJLENBQUMsS0FBSyxNQUFNLE9BQU8sUUFBUSxPQUFPLEVBQUUsSUFBSSxZQUFZO0FBQ3BGLFlBQU0sY0FBYyxNQUFNLFFBQVEsU0FBUyxVQUFVLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDckUsYUFBTyxHQUFHLFlBQVksTUFBTSxhQUFhLENBQUM7QUFBQSxJQUMzQyxDQUFDLENBQUM7QUFFRixVQUFNLFFBQVEsSUFBSSxDQUFDLGVBQWUsWUFBWSxDQUFDO0FBQUEsRUFDaEQsQ0FBQztBQUVELE9BQUssa0RBQWtELFlBQVk7QUFDbEUsVUFBTSxXQUFXLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDO0FBRXBELFVBQU0sVUFBVSxhQUFhLFNBQVMsTUFBTTtBQUM1QyxVQUFNLGFBQWEsUUFBUSxTQUFTLElBQUksUUFBUSxTQUFTO0FBRXpELFVBQU0sV0FBVyxRQUFRLFlBQVksU0FBUyxNQUFNO0FBQ3BELFdBQU8sR0FBRyxRQUFRO0FBQ2xCLFdBQU8sR0FBRyxnQ0FBZ0MsUUFBUSxDQUFDO0FBRW5ELFVBQU0sZ0JBQWdCLFFBQVEsSUFBSSxDQUFDLEtBQUssTUFBTSxPQUFPLFFBQVEsT0FBTyxFQUFFLElBQUksT0FBTSxXQUFVO0FBQ3pGLFlBQU1FLFdBQVUsU0FBUztBQUN6QixZQUFNLGdCQUFnQixTQUFTLFdBQVdBLFFBQU8sRUFBRTtBQUVuRCxZQUFNLEtBQUssTUFBTSxTQUFTLEtBQUssVUFBVSxFQUFFLFFBQVEsTUFBTSxRQUFRLE1BQU0sQ0FBQztBQUN4RSxVQUFJO0FBQ0gsY0FBTSxTQUFTLE1BQU0sSUFBSSxHQUFHLFNBQVMsV0FBV0EsUUFBTyxFQUFFLFFBQVEsR0FBRyxjQUFjLFVBQVU7QUFLNUYsZUFBTyxhQUFhLE1BQU0sU0FBUyxTQUFTLFNBQVMsTUFBTSxHQUFHLFNBQVMsR0FBR0EsUUFBTztBQUFBLE1BQ2xGLFVBQUU7QUFDRCxjQUFNLFNBQVMsTUFBTSxFQUFFO0FBQUEsTUFDeEI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFVBQU0sUUFBUSxJQUFJLENBQUMsYUFBYSxDQUFDO0FBQUEsRUFDbEMsQ0FBQztBQUVELE9BQUssd0RBQXdELFlBQVk7QUFDeEUsVUFBTSxZQUFZLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDO0FBQ3JELFVBQU0sWUFBWSxJQUFJLEtBQUssS0FBSyxTQUFTLFVBQVUsQ0FBQztBQUVwRCxVQUFNLFdBQVcsUUFBUSxZQUFZLFVBQVUsTUFBTTtBQUNyRCxXQUFPLEdBQUcsUUFBUTtBQUNsQixXQUFPLEdBQUcsZ0NBQWdDLFFBQVEsQ0FBQztBQUVuRCxVQUFNLE1BQU0sTUFBTSxTQUFTLEtBQUssV0FBVyxFQUFFLFFBQVEsTUFBTSxRQUFRLE1BQU0sQ0FBQztBQUMxRSxVQUFNLE1BQU0sTUFBTSxTQUFTLEtBQUssV0FBVyxFQUFFLFFBQVEsTUFBTSxRQUFRLE1BQU0sQ0FBQztBQUUxRSxVQUFNLGFBQWE7QUFFbkIsUUFBSTtBQUNILFlBQU0sU0FBUyxNQUFNLEtBQUssR0FBRyxTQUFTLFdBQVcsVUFBVSxFQUFFLFFBQVEsR0FBRyxTQUFTLFdBQVcsVUFBVSxFQUFFLE9BQU8sVUFBVTtBQUN6SCxhQUFPLGFBQWEsTUFBTSxTQUFTLFNBQVMsVUFBVSxNQUFNLEdBQUcsU0FBUyxHQUFHLFVBQVU7QUFFckYsWUFBTSxTQUFTLE1BQU0sS0FBSyxHQUFHLFNBQVMsV0FBVyxVQUFVLEVBQUUsUUFBUSxHQUFHLFNBQVMsV0FBVyxVQUFVLEVBQUUsT0FBTyxVQUFVO0FBQ3pILGFBQU8sYUFBYSxNQUFNLFNBQVMsU0FBUyxVQUFVLE1BQU0sR0FBRyxTQUFTLEdBQUcsVUFBVTtBQUFBLElBQ3RGLFVBQUU7QUFDRCxZQUFNLFFBQVEsV0FBVztBQUFBLFFBQ3hCLE1BQU0sU0FBUyxNQUFNLEdBQUc7QUFBQSxRQUN4QixNQUFNLFNBQVMsTUFBTSxHQUFHO0FBQUEsTUFDekIsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLCtDQUErQyxZQUFZO0FBQy9ELFVBQU0sWUFBWSxLQUFLLFNBQVMsWUFBWTtBQUM1QyxVQUFNLGNBQWMsSUFBSSxLQUFLLEtBQUssV0FBVyxXQUFXLENBQUM7QUFFekQsVUFBTSxXQUFXLFFBQVEsWUFBWSxZQUFZLE1BQU07QUFDdkQsV0FBTyxHQUFHLFFBQVE7QUFDbEIsV0FBTyxHQUFHLGdDQUFnQyxRQUFRLENBQUM7QUFFbkQsUUFBSSxRQUEyQjtBQUMvQixRQUFJO0FBQ0gsWUFBTSxTQUFTLEtBQUssYUFBYSxFQUFFLFFBQVEsTUFBTSxRQUFRLE1BQU0sQ0FBQztBQUFBLElBQ2pFLFNBQVMsR0FBRztBQUNYLGNBQVE7QUFBQSxJQUNUO0FBRUEsV0FBTyxHQUFHLEtBQUs7QUFFZixVQUFNLFNBQVMsTUFBTSxTQUFTO0FBRTlCLFVBQU0sVUFBVSxhQUFhLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDLEVBQUUsTUFBTTtBQUN4RSxVQUFNLGFBQWEsUUFBUSxTQUFTLElBQUksUUFBUSxTQUFTO0FBQ3pELFVBQU0sbUJBQW1CLFNBQVMsV0FBVyxVQUFVLEVBQUU7QUFFekQsVUFBTSxLQUFLLE1BQU0sU0FBUyxLQUFLLGFBQWEsRUFBRSxRQUFRLE1BQU0sUUFBUSxNQUFNLENBQUM7QUFDM0UsUUFBSTtBQUNILFlBQU0sU0FBUyxNQUFNLElBQUksR0FBRyxrQkFBa0IsR0FBRyxpQkFBaUIsVUFBVTtBQUU1RSxhQUFPLGFBQWEsTUFBTSxTQUFTLFNBQVMsWUFBWSxNQUFNLEdBQUcsU0FBUyxHQUFHLFVBQVU7QUFBQSxJQUN4RixVQUFFO0FBQ0QsWUFBTSxTQUFTLE1BQU0sRUFBRTtBQUFBLElBQ3hCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw0REFBNEQsWUFBWTtBQUM1RSxVQUFNLFdBQVcsSUFBSSxLQUFLLEtBQUssU0FBUyxXQUFXLENBQUM7QUFFcEQsVUFBTSxVQUFVLGFBQWEsU0FBUyxNQUFNO0FBQzVDLFVBQU0sYUFBYSxRQUFRLFNBQVMsSUFBSSxRQUFRLFNBQVM7QUFDekQsVUFBTSxtQkFBbUIsU0FBUyxXQUFXLFVBQVUsRUFBRTtBQUV6RCxVQUFNLFdBQVcsUUFBUSxZQUFZLFNBQVMsTUFBTTtBQUNwRCxXQUFPLEdBQUcsUUFBUTtBQUNsQixXQUFPLEdBQUcsZ0NBQWdDLFFBQVEsQ0FBQztBQUNuRCxXQUFPLEdBQUcsNEJBQTRCLFFBQVEsQ0FBQztBQUUvQyxRQUFJLG9CQUFxRDtBQUN6RCxVQUFNLEtBQUssTUFBTSxTQUFTLEtBQUssVUFBVSxFQUFFLFFBQVEsTUFBTSxRQUFRLE1BQU0sQ0FBQztBQUN4RSxRQUFJO0FBR0gsMEJBQW9CLFNBQVMsU0FBUyxVQUFVLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFJaEUsWUFBTSxRQUFRLEVBQUU7QUFFaEIsWUFBTSxTQUFTLE1BQU0sSUFBSSxHQUFHLGtCQUFrQixHQUFHLGlCQUFpQixVQUFVO0FBQUEsSUFDN0UsVUFBRTtBQUNELFlBQU0sU0FBUyxNQUFNLEVBQUU7QUFBQSxJQUN4QjtBQUVBLFdBQU8sR0FBRyxpQkFBaUI7QUFFM0IsVUFBTSxtQkFBbUIsTUFBTTtBQUMvQixXQUFPLFlBQVksaUJBQWlCLFlBQVksaUJBQWlCLFVBQVU7QUFBQSxFQUM1RSxDQUFDO0FBRUQsT0FBSyw0REFBNEQsWUFBWTtBQUM1RSxVQUFNLFdBQVcsSUFBSSxLQUFLLEtBQUssU0FBUyxXQUFXLENBQUM7QUFFcEQsVUFBTSxVQUFVLGFBQWEsU0FBUyxNQUFNO0FBQzVDLFVBQU0sYUFBYSxRQUFRLFNBQVMsSUFBSSxRQUFRLFNBQVM7QUFDekQsVUFBTSxtQkFBbUIsU0FBUyxXQUFXLFVBQVUsRUFBRTtBQUV6RCxVQUFNLFdBQVcsUUFBUSxZQUFZLFNBQVMsTUFBTTtBQUNwRCxXQUFPLEdBQUcsUUFBUTtBQUNsQixXQUFPLEdBQUcsZ0NBQWdDLFFBQVEsQ0FBQztBQUNuRCxXQUFPLEdBQUcsNEJBQTRCLFFBQVEsQ0FBQztBQUUvQyxRQUFJLG9CQUFvQixTQUFTLFNBQVMsVUFBVSxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBRXBFLFVBQU0sWUFBWSxTQUFTLEtBQUssVUFBVSxFQUFFLFFBQVEsTUFBTSxRQUFRLE1BQU0sQ0FBQyxFQUFFLEtBQUssT0FBTSxPQUFNO0FBQzNGLFVBQUk7QUFDSCxlQUFPLE1BQU0sU0FBUyxNQUFNLElBQUksR0FBRyxrQkFBa0IsR0FBRyxpQkFBaUIsVUFBVTtBQUFBLE1BQ3BGLFVBQUU7QUFDRCxjQUFNLFNBQVMsTUFBTSxFQUFFO0FBQUEsTUFDeEI7QUFBQSxJQUNELENBQUM7QUFFRCxRQUFJLG1CQUFtQixNQUFNO0FBQzdCLFdBQU8sWUFBWSxpQkFBaUIsWUFBWSxRQUFRLFVBQVU7QUFFbEUsVUFBTTtBQUVOLHdCQUFvQixTQUFTLFNBQVMsVUFBVSxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQ2hFLHVCQUFtQixNQUFNO0FBQ3pCLFdBQU8sWUFBWSxpQkFBaUIsWUFBWSxpQkFBaUIsVUFBVTtBQUFBLEVBQzVFLENBQUM7QUFFRCxPQUFLLGtDQUFrQyxZQUFZO0FBQ2xELFdBQU8sc0JBQXNCO0FBQUEsRUFDOUIsQ0FBQztBQUVELE9BQUssbUNBQW1DLFlBQVk7QUFDbkQsb0JBQWdCLGNBQWMsK0JBQStCLHNCQUFzQjtBQUVuRixXQUFPLHNCQUFzQjtBQUFBLEVBQzlCLENBQUM7QUFFRCxPQUFLLHFDQUFxQyxZQUFZO0FBQ3JELG9CQUFnQixjQUFjLCtCQUErQixhQUFhO0FBRTFFLFdBQU8sc0JBQXNCO0FBQUEsRUFDOUIsQ0FBQztBQUVELGlCQUFlLHdCQUF3QjtBQUN0QyxVQUFNLFdBQVcsSUFBSSxLQUFLLEtBQUssU0FBUyxXQUFXLENBQUM7QUFFcEQsVUFBTSxVQUFVLGFBQWEsU0FBUyxNQUFNLEVBQUUsU0FBUztBQUN2RCxXQUFPLFlBQVksU0FBUyxZQUFZO0FBRXhDLFVBQU0sYUFBYTtBQUNuQixVQUFNLFFBQVEsVUFBVSxVQUFVLHFCQUFxQixVQUFVLENBQUM7QUFFbEUsV0FBTyxZQUFZLGFBQWEsU0FBUyxNQUFNLEVBQUUsU0FBUyxHQUFHLFVBQVU7QUFBQSxFQUN4RTtBQUVBLE9BQUssK0NBQStDLFlBQVk7QUFDL0QsV0FBTywyQkFBMkI7QUFBQSxFQUNuQyxDQUFDO0FBRUQsT0FBSyxnREFBZ0QsWUFBWTtBQUNoRSxvQkFBZ0IsY0FBYywrQkFBK0Isc0JBQXNCO0FBRW5GLFdBQU8sMkJBQTJCO0FBQUEsRUFDbkMsQ0FBQztBQUVELE9BQUssa0RBQWtELFlBQVk7QUFDbEUsb0JBQWdCLGNBQWMsK0JBQStCLGFBQWE7QUFFMUUsV0FBTywyQkFBMkI7QUFBQSxFQUNuQyxDQUFDO0FBRUQsaUJBQWUsNkJBQTZCO0FBQzNDLFVBQU0sV0FBVyxJQUFJLEtBQUssS0FBSyxTQUFTLFdBQVcsQ0FBQztBQUVwRCxVQUFNLFVBQVUsYUFBYSxTQUFTLE1BQU07QUFDNUMsVUFBTSxhQUFhLFFBQVEsU0FBUyxJQUFJLFFBQVEsU0FBUztBQUV6RCxVQUFNLFdBQVcsTUFBTSxRQUFRLFVBQVUsVUFBVSxxQkFBcUIsVUFBVSxDQUFDO0FBQ25GLFdBQU8sWUFBWSxTQUFTLE1BQU0sV0FBVztBQUU3QyxXQUFPLFlBQVksYUFBYSxTQUFTLE1BQU0sRUFBRSxTQUFTLEdBQUcsVUFBVTtBQUFBLEVBQ3hFO0FBRUEsT0FBSyxnQ0FBZ0MsWUFBWTtBQUNoRCxXQUFPLG9CQUFvQjtBQUFBLEVBQzVCLENBQUM7QUFFRCxPQUFLLGlDQUFpQyxZQUFZO0FBQ2pELG9CQUFnQixjQUFjLCtCQUErQixzQkFBc0I7QUFFbkYsV0FBTyxvQkFBb0I7QUFBQSxFQUM1QixDQUFDO0FBRUQsT0FBSyxtQ0FBbUMsWUFBWTtBQUNuRCxvQkFBZ0IsY0FBYywrQkFBK0IsYUFBYTtBQUUxRSxXQUFPLG9CQUFvQjtBQUFBLEVBQzVCLENBQUM7QUFFRCxpQkFBZSxzQkFBc0I7QUFDcEMsVUFBTSxTQUFTLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDO0FBQ2xELFVBQU0sU0FBUyxJQUFJLEtBQUssS0FBSyxTQUFTLGdCQUFnQixDQUFDO0FBRXZELFVBQU0sV0FBVyxNQUFNLFFBQVEsVUFBVSxRQUFRLDZCQUE2QixpQkFBaUIsT0FBTyxNQUFNLENBQUMsQ0FBQztBQUM5RyxXQUFPLFlBQVksU0FBUyxNQUFNLGdCQUFnQjtBQUVsRCxVQUFNLGlCQUFpQixhQUFhLE9BQU8sTUFBTSxFQUFFLFNBQVM7QUFDNUQsV0FBTyxZQUFZLGFBQWEsT0FBTyxNQUFNLEVBQUUsU0FBUyxHQUFHLGNBQWM7QUFBQSxFQUMxRTtBQUVBLE9BQUssNkNBQTZDLFlBQVk7QUFDN0QsV0FBTyx5QkFBeUI7QUFBQSxFQUNqQyxDQUFDO0FBRUQsT0FBSyw4Q0FBOEMsWUFBWTtBQUM5RCxvQkFBZ0IsY0FBYywrQkFBK0Isc0JBQXNCO0FBRW5GLFdBQU8seUJBQXlCO0FBQUEsRUFDakMsQ0FBQztBQUVELE9BQUssZ0RBQWdELFlBQVk7QUFDaEUsb0JBQWdCLGNBQWMsK0JBQStCLGFBQWE7QUFFMUUsV0FBTyx5QkFBeUI7QUFBQSxFQUNqQyxDQUFDO0FBRUQsaUJBQWUsMkJBQTJCO0FBQ3pDLFVBQU0sU0FBUyxJQUFJLEtBQUssS0FBSyxTQUFTLFdBQVcsQ0FBQztBQUNsRCxVQUFNLFNBQVMsSUFBSSxLQUFLLEtBQUssU0FBUyxnQkFBZ0IsQ0FBQztBQUV2RCxVQUFNLFdBQVcsTUFBTSxRQUFRLFVBQVUsUUFBUSw2QkFBNkIsaUJBQWlCLE9BQU8sTUFBTSxDQUFDLENBQUM7QUFDOUcsV0FBTyxZQUFZLFNBQVMsTUFBTSxnQkFBZ0I7QUFFbEQsVUFBTSxpQkFBaUIsYUFBYSxPQUFPLE1BQU0sRUFBRSxTQUFTO0FBQzVELFdBQU8sWUFBWSxhQUFhLE9BQU8sTUFBTSxFQUFFLFNBQVMsR0FBRyxjQUFjO0FBQUEsRUFDMUU7QUFFQSxPQUFLLGlEQUFpRCxZQUFZO0FBQ2pFLFVBQU0sV0FBVyxJQUFJLEtBQUssS0FBSyxTQUFTLFNBQVMsYUFBYSxDQUFDO0FBRS9ELFVBQU0sVUFBVTtBQUNoQixVQUFNLFdBQVcsTUFBTSxRQUFRLFVBQVUsVUFBVSxTQUFTLFdBQVcsT0FBTyxDQUFDO0FBQy9FLFdBQU8sWUFBWSxTQUFTLE1BQU0sYUFBYTtBQUUvQyxXQUFPLFlBQVksYUFBYSxTQUFTLE1BQU0sRUFBRSxTQUFTLEdBQUcsT0FBTztBQUFBLEVBQ3JFLENBQUM7QUFFRCxPQUFLLDBDQUEwQyxZQUFZO0FBQzFELG9CQUFnQixjQUFjLCtCQUErQixnQkFBZ0IsK0JBQStCLGVBQWU7QUFFM0gsV0FBTyxnQkFBZ0IsS0FBSztBQUFBLEVBQzdCLENBQUM7QUFFRCxPQUFLLG1EQUFtRCxZQUFZO0FBQ25FLG9CQUFnQixjQUFjLCtCQUErQix5QkFBeUIsK0JBQStCLGVBQWU7QUFFcEksV0FBTyxnQkFBZ0IsS0FBSztBQUFBLEVBQzdCLENBQUM7QUFFRCxPQUFLLCtFQUErRSxZQUFZO0FBQy9GLG9CQUFnQixjQUFjLCtCQUErQixhQUFhO0FBRTFFLFdBQU8sZ0JBQWdCLElBQUk7QUFBQSxFQUM1QixDQUFDO0FBRUQsT0FBSyx3RkFBd0YsWUFBWTtBQUN4RyxvQkFBZ0IsY0FBYywrQkFBK0Isc0JBQXNCO0FBRW5GLFdBQU8sZ0JBQWdCLElBQUk7QUFBQSxFQUM1QixDQUFDO0FBRUQsaUJBQWUsZ0JBQWdCLGFBQXNCO0FBQ3BELFVBQU0sYUFBYSxJQUFJLEtBQUssS0FBSyxTQUFTLGdCQUFnQixDQUFDO0FBRTNELFVBQU0sVUFBVSxNQUFNLFFBQVEsVUFBVSxZQUFZLFNBQVMsV0FBVyxhQUFhLENBQUM7QUFDdEYsV0FBTyxZQUFZLFFBQVEsUUFBUSxLQUFLO0FBRXhDLFVBQU0sUUFBUSxNQUFNLFNBQVMsS0FBSyxXQUFXLE1BQU07QUFDbkQsVUFBTSxTQUFTLE1BQU0sV0FBVyxRQUFRLE1BQU0sT0FBTyxDQUFDLEdBQUs7QUFFM0QsUUFBSSxPQUFPLE1BQU0sUUFBUSxLQUFLLFVBQVU7QUFDeEMsV0FBTyxZQUFZLEtBQUssUUFBUSxJQUFJO0FBRXBDLFFBQUk7QUFDSixVQUFNLGFBQWE7QUFDbkIsUUFBSTtBQUNILFlBQU0sUUFBUSxVQUFVLFlBQVksU0FBUyxXQUFXLFVBQVUsQ0FBQztBQUFBLElBQ3BFLFNBQVMsR0FBRztBQUNYLGNBQVE7QUFBQSxJQUNUO0FBRUEsV0FBTyxHQUFHLEtBQUs7QUFDZixZQUFRO0FBRVIsUUFBSSxhQUFhO0FBQ2hCLFVBQUk7QUFDSCxjQUFNLFFBQVEsVUFBVSxZQUFZLFNBQVMsV0FBVyxVQUFVLEdBQUcsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUFBLE1BQ3RGLFNBQVMsR0FBRztBQUNYLGdCQUFRO0FBQUEsTUFDVDtBQUVBLGFBQU8sR0FBRyxLQUFLO0FBQUEsSUFDaEIsT0FBTztBQUNOLFlBQU0sUUFBUSxVQUFVLFlBQVksU0FBUyxXQUFXLFVBQVUsR0FBRyxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQ3JGLGFBQU8sWUFBWSxhQUFhLFdBQVcsTUFBTSxFQUFFLFNBQVMsR0FBRyxVQUFVO0FBRXpFLGFBQU8sTUFBTSxRQUFRLEtBQUssVUFBVTtBQUNwQyxhQUFPLFlBQVksS0FBSyxRQUFRLEtBQUs7QUFBQSxJQUN0QztBQUFBLEVBQ0Q7QUFFQSxPQUFLLGdEQUFnRCxZQUFZO0FBQ2hFLFVBQU0sV0FBVyxJQUFJLEtBQUssT0FBTztBQUVqQyxRQUFJLFFBQTJCO0FBQy9CLFFBQUk7QUFDSCxZQUFNLFFBQVEsVUFBVSxVQUFVLFNBQVMsV0FBVyxrQ0FBa0MsQ0FBQztBQUFBLElBQzFGLFNBQVMsS0FBSztBQUNiLGNBQVE7QUFBQSxJQUNUO0FBRUEsV0FBTyxHQUFHLEtBQUs7QUFBQSxFQUNoQixDQUFDO0FBRUQsT0FBSyx1REFBdUQsWUFBWTtBQUN2RSxVQUFNLFdBQVcsSUFBSSxLQUFLLEtBQUssU0FBUyxXQUFXLENBQUM7QUFFcEQsVUFBTSxPQUFPLE1BQU0sUUFBUSxRQUFRLFFBQVE7QUFFM0MsVUFBTSxVQUFVLGFBQWEsU0FBUyxNQUFNLEVBQUUsU0FBUztBQUN2RCxXQUFPLFlBQVksU0FBUyxZQUFZO0FBRXhDLFVBQU0sYUFBYTtBQUNuQixVQUFNLFFBQVEsVUFBVSxVQUFVLFNBQVMsV0FBVyxVQUFVLEdBQUcsRUFBRSxNQUFNLEtBQUssTUFBTSxPQUFPLEtBQUssTUFBTSxDQUFDO0FBRXpHLFdBQU8sWUFBWSxhQUFhLFNBQVMsTUFBTSxFQUFFLFNBQVMsR0FBRyxVQUFVO0FBQUEsRUFDeEUsQ0FBQztBQUVELE9BQUssMEVBQTBFLFlBQVk7QUFDMUYsVUFBTSxXQUFXLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDO0FBRXBELFVBQU0sT0FBTyxNQUFNLFFBQVEsUUFBUSxRQUFRO0FBRTNDLFVBQU0sVUFBVSxhQUFhLFNBQVMsTUFBTSxFQUFFLFNBQVM7QUFDdkQsV0FBTyxZQUFZLFNBQVMsWUFBWTtBQUV4QyxVQUFNLGFBQWE7QUFDbkIsVUFBTSxRQUFRLFVBQVUsVUFBVSxTQUFTLFdBQVcsVUFBVSxHQUFHLEVBQUUsTUFBTSxLQUFLLE1BQU0sT0FBTyxLQUFLLE1BQU0sQ0FBQztBQUV6RyxVQUFNLDJCQUEyQixhQUFhO0FBRTlDLFVBQU0sWUFBWTtBQUNsQixVQUFNLFdBQVc7QUFFakIsUUFBSSxRQUF3QztBQUM1QyxRQUFJO0FBQ0gsWUFBTSxRQUFRLFVBQVUsVUFBVSxTQUFTLFdBQVcsd0JBQXdCLEdBQUcsRUFBRSxNQUFNLEtBQUssRUFBRSxPQUFPLFdBQVcsTUFBTSxTQUFTLENBQUMsR0FBRyxPQUFPLFVBQVUsQ0FBQztBQUFBLElBQ3hKLFNBQVMsS0FBSztBQUNiLGNBQVE7QUFBQSxJQUNUO0FBRUEsV0FBTyxHQUFHLEtBQUs7QUFDZixXQUFPLEdBQUcsaUJBQWlCLGtCQUFrQjtBQUM3QyxXQUFPLFlBQVksTUFBTSxxQkFBcUIsb0JBQW9CLG1CQUFtQjtBQUFBLEVBQ3RGLENBQUM7QUFFRCxPQUFLLG9FQUFvRSxZQUFZO0FBQ3BGLFVBQU0sV0FBVyxJQUFJLEtBQUssS0FBSyxTQUFTLFdBQVcsQ0FBQztBQUVwRCxVQUFNLE9BQU8sTUFBTSxRQUFRLFFBQVEsUUFBUTtBQUUzQyxVQUFNLFVBQVUsYUFBYSxTQUFTLE1BQU0sRUFBRSxTQUFTO0FBQ3ZELFdBQU8sWUFBWSxTQUFTLFlBQVk7QUFFeEMsVUFBTSxhQUFhO0FBQ25CLFVBQU0sUUFBUSxVQUFVLFVBQVUsU0FBUyxXQUFXLFVBQVUsR0FBRyxFQUFFLE1BQU0sS0FBSyxNQUFNLE9BQU8sS0FBSyxNQUFNLENBQUM7QUFFekcsVUFBTSw2QkFBNkI7QUFFbkMsVUFBTSxZQUFZO0FBQ2xCLFVBQU0sYUFBYSxXQUFXO0FBRTlCLFFBQUksUUFBd0M7QUFDNUMsUUFBSTtBQUNILFlBQU0sUUFBUSxVQUFVLFVBQVUsU0FBUyxXQUFXLDBCQUEwQixHQUFHLEVBQUUsTUFBTSxLQUFLLEVBQUUsT0FBTyxXQUFXLE1BQU0sV0FBVyxDQUFDLEdBQUcsT0FBTyxVQUFVLENBQUM7QUFBQSxJQUM1SixTQUFTLEtBQUs7QUFDYixjQUFRO0FBQUEsSUFDVDtBQUVBLFdBQU8sR0FBRyxDQUFDLEtBQUs7QUFBQSxFQUNqQixDQUFDO0FBRUQsT0FBSyx1RUFBdUUsWUFBWTtBQUN2RixVQUFNLFdBQVcsSUFBSSxLQUFLLEtBQUssU0FBUyxXQUFXLENBQUM7QUFFcEQsVUFBTSxRQUFRLFFBQVEsUUFBUTtBQUU5QixVQUFNLFVBQVUsYUFBYSxTQUFTLE1BQU0sRUFBRSxTQUFTO0FBQ3ZELFdBQU8sWUFBWSxTQUFTLFlBQVk7QUFFeEMsVUFBTSxhQUFhO0FBQ25CLFFBQUksUUFBd0M7QUFDNUMsUUFBSTtBQUNILFlBQU0sUUFBUTtBQUFBLFFBQVU7QUFBQSxRQUFVLFNBQVMsV0FBVyxVQUFVO0FBQUEsUUFBRyxFQUFFLE1BQU0sWUFBWSxPQUFPLEVBQUU7QUFBQTtBQUFBLE1BQWU7QUFBQSxJQUNoSCxTQUFTLEtBQUs7QUFDYixjQUFRO0FBQUEsSUFDVDtBQUVBLFdBQU8sR0FBRyxDQUFDLEtBQUs7QUFBQSxFQUNqQixDQUFDO0FBRUQsT0FBSyx5RkFBeUYsWUFBWTtBQUN6RyxVQUFNLFdBQVcsSUFBSSxLQUFLLEtBQUssU0FBUyxXQUFXLENBQUM7QUFFcEQsVUFBTSxRQUFRLFFBQVEsUUFBUTtBQUU5QixVQUFNLFVBQVUsYUFBYSxTQUFTLE1BQU0sRUFBRSxTQUFTO0FBQ3ZELFdBQU8sWUFBWSxTQUFTLFlBQVk7QUFFeEMsVUFBTSxhQUFhLFFBQVEsTUFBTSxFQUFFLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRTtBQUN0RCxRQUFJLFFBQXdDO0FBQzVDLFFBQUk7QUFDSCxZQUFNLFFBQVE7QUFBQSxRQUFVO0FBQUEsUUFBVSxTQUFTLFdBQVcsVUFBVTtBQUFBLFFBQUcsRUFBRSxNQUFNLFlBQVksT0FBTyxFQUFFO0FBQUE7QUFBQSxNQUFlO0FBQUEsSUFDaEgsU0FBUyxLQUFLO0FBQ2IsY0FBUTtBQUFBLElBQ1Q7QUFFQSxXQUFPLEdBQUcsS0FBSztBQUNmLFdBQU8sR0FBRyxpQkFBaUIsa0JBQWtCO0FBQzdDLFdBQU8sWUFBWSxNQUFNLHFCQUFxQixvQkFBb0IsbUJBQW1CO0FBQUEsRUFDdEYsQ0FBQztBQUVELE9BQUssbUdBQW1HLFlBQVk7QUFDbkgsVUFBTSxZQUFZLElBQUksS0FBSyxLQUFLLFNBQVMsUUFBUSxPQUFPLFFBQVEsQ0FBQztBQUVqRSxVQUFNLFFBQVEsU0FBUyxXQUFXLFFBQVE7QUFDMUMsVUFBTSxRQUFRLFNBQVMsV0FBVyxRQUFRO0FBQzFDLFVBQU0sUUFBUSxTQUFTLFdBQVcsUUFBUTtBQU0xQyxVQUFNLGFBQWE7QUFDbkIsVUFBTSxRQUFRLElBQUk7QUFBQSxNQUNqQixRQUFRLFVBQVUsT0FBTyxTQUFTLFdBQVcsVUFBVSxDQUFDO0FBQUEsTUFDeEQsUUFBUSxVQUFVLE9BQU8sU0FBUyxXQUFXLFVBQVUsQ0FBQztBQUFBLE1BQ3hELFFBQVEsVUFBVSxPQUFPLFNBQVMsV0FBVyxVQUFVLENBQUM7QUFBQSxJQUN6RCxDQUFDO0FBRUQsV0FBTyxHQUFHLFFBQVEsT0FBTyxLQUFLLENBQUM7QUFDL0IsV0FBTyxHQUFHLFFBQVEsT0FBTyxLQUFLLENBQUM7QUFDL0IsV0FBTyxHQUFHLFFBQVEsT0FBTyxLQUFLLENBQUM7QUFBQSxFQUNoQyxDQUFDO0FBRUQsT0FBSywyREFBMkQsWUFBWTtBQUMzRSxVQUFNLGVBQWUsSUFBSSxLQUFLLEtBQUssU0FBUyxTQUFTLENBQUM7QUFFdEQsVUFBTSxRQUFRLFdBQVcsWUFBWTtBQUVyQyxVQUFNLFVBQVUsU0FBUyxjQUFjLFFBQVE7QUFFL0MsUUFBSTtBQUNKLFVBQU0sYUFBYTtBQUNuQixRQUFJO0FBQ0gsWUFBTSxRQUFRLFVBQVUsU0FBUyxTQUFTLFdBQVcsVUFBVSxDQUFDO0FBQUEsSUFDakUsU0FBUyxHQUFHO0FBQ1gsY0FBUTtBQUFBLElBQ1Q7QUFFQSxXQUFPLEdBQUcsS0FBSztBQUFBLEVBQ2hCLENBQUM7QUFFRCxPQUFLLGNBQWMsWUFBWTtBQUM5QixvQkFBZ0IsY0FBYywrQkFBK0IsZ0JBQWdCLCtCQUErQixVQUFVO0FBRXRILFdBQU8sZUFBZTtBQUFBLEVBQ3ZCLENBQUM7QUFFRCxPQUFLLHlCQUF5QixZQUFZO0FBQ3pDLG9CQUFnQixjQUFjLCtCQUErQix5QkFBeUIsK0JBQStCLFVBQVU7QUFFL0gsV0FBTyxlQUFlO0FBQUEsRUFDdkIsQ0FBQztBQUVELGlCQUFlLGlCQUFpQjtBQUMvQixRQUFJO0FBQ0osZ0JBQVksSUFBSSxRQUFRLGtCQUFrQixPQUFLLFFBQVEsQ0FBQyxDQUFDO0FBRXpELFVBQU0sV0FBVyxJQUFJLEtBQUssS0FBSyxTQUFTLFdBQVcsQ0FBQztBQUVwRCxVQUFNLFVBQVUsYUFBYSxTQUFTLE1BQU0sRUFBRSxTQUFTO0FBQ3ZELFdBQU8sWUFBWSxTQUFTLFlBQVk7QUFFeEMsVUFBTSxnQkFBZ0I7QUFDdEIsVUFBTSxRQUFRLFVBQVUsVUFBVSxTQUFTLFdBQVcsYUFBYSxHQUFHLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFFdEYsV0FBTyxHQUFHLEtBQU07QUFDaEIsV0FBTyxZQUFZLE1BQU8sU0FBUyxRQUFRLFNBQVMsTUFBTTtBQUMxRCxXQUFPLFlBQVksTUFBTyxXQUFXLGNBQWMsS0FBSztBQUV4RCxXQUFPLFlBQVksYUFBYSxTQUFTLE1BQU0sRUFBRSxTQUFTLEdBQUcsd0JBQXdCO0FBQUEsRUFDdEY7QUFFQSxPQUFLLHlCQUF5QixZQUFZO0FBQ3pDLG9CQUFnQixjQUFjLCtCQUErQixnQkFBZ0IsK0JBQStCLFVBQVU7QUFFdEgsV0FBTyx1QkFBdUI7QUFBQSxFQUMvQixDQUFDO0FBRUQsT0FBSyxvQ0FBb0MsWUFBWTtBQUNwRCxvQkFBZ0IsY0FBYywrQkFBK0IseUJBQXlCLCtCQUErQixVQUFVO0FBRS9ILFdBQU8sdUJBQXVCO0FBQUEsRUFDL0IsQ0FBQztBQUVELGlCQUFlLHlCQUF5QjtBQUN2QyxVQUFNLFdBQVcsSUFBSSxLQUFLLEtBQUssU0FBUyxXQUFXLENBQUM7QUFFcEQsVUFBTSxVQUFVLGFBQWEsU0FBUyxNQUFNLEVBQUUsU0FBUztBQUN2RCxXQUFPLFlBQVksU0FBUyxZQUFZO0FBRXhDLFVBQU0sZ0JBQWdCO0FBQ3RCLFVBQU0sUUFBUSxVQUFVLFVBQVUsaUJBQWlCLFNBQVMsV0FBVyxhQUFhLENBQUMsR0FBRyxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBRXhHLFdBQU8sWUFBWSxhQUFhLFNBQVMsTUFBTSxFQUFFLFNBQVMsR0FBRyxxQ0FBcUM7QUFBQSxFQUNuRztBQUVBLE9BQUssdUJBQXVCLFlBQVk7QUFDdkMsb0JBQWdCLGNBQWMsK0JBQStCLGdCQUFnQiwrQkFBK0IsVUFBVTtBQUV0SCxXQUFPLHFCQUFxQjtBQUFBLEVBQzdCLENBQUM7QUFFRCxPQUFLLGtDQUFrQyxZQUFZO0FBQ2xELG9CQUFnQixjQUFjLCtCQUErQix5QkFBeUIsK0JBQStCLFVBQVU7QUFFL0gsV0FBTyxxQkFBcUI7QUFBQSxFQUM3QixDQUFDO0FBRUQsaUJBQWUsdUJBQXVCO0FBQ3JDLFVBQU0sV0FBVyxJQUFJLEtBQUssS0FBSyxTQUFTLFdBQVcsQ0FBQztBQUVwRCxVQUFNLFVBQVUsYUFBYSxTQUFTLE1BQU0sRUFBRSxTQUFTO0FBQ3ZELFdBQU8sWUFBWSxTQUFTLFlBQVk7QUFFeEMsVUFBTSxnQkFBZ0I7QUFDdEIsVUFBTSxRQUFRLFVBQVUsVUFBVSxlQUFlLFNBQVMsV0FBVyxhQUFhLENBQUMsR0FBRyxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBRXRHLFdBQU8sWUFBWSxhQUFhLFNBQVMsTUFBTSxFQUFFLFNBQVMsR0FBRyxtQ0FBbUM7QUFBQSxFQUNqRztBQUVBLE9BQUssMkNBQTJDLFlBQVk7QUFDM0Qsb0JBQWdCLGNBQWMsK0JBQStCLGdCQUFnQiwrQkFBK0IsVUFBVTtBQUV0SCxXQUFPLDBCQUEwQjtBQUFBLEVBQ2xDLENBQUM7QUFFRCxPQUFLLHNEQUFzRCxZQUFZO0FBQ3RFLG9CQUFnQixjQUFjLCtCQUErQix5QkFBeUIsK0JBQStCLFVBQVU7QUFFL0gsV0FBTywwQkFBMEI7QUFBQSxFQUNsQyxDQUFDO0FBRUQsaUJBQWUsNEJBQTRCO0FBQzFDLFVBQU0sV0FBVyxJQUFJLEtBQUssS0FBSyxTQUFTLG9CQUFvQixDQUFDO0FBRTdELFdBQU8sWUFBWSxXQUFXLFNBQVMsTUFBTSxHQUFHLEtBQUs7QUFFckQsVUFBTSxVQUFVO0FBQ2hCLFVBQU0sUUFBUSxVQUFVLFVBQVUsU0FBUyxXQUFXLE9BQU8sR0FBRyxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBRWhGLFdBQU8sWUFBWSxXQUFXLFNBQVMsTUFBTSxHQUFHLElBQUk7QUFDcEQsV0FBTyxZQUFZLGFBQWEsU0FBUyxNQUFNLEVBQUUsU0FBUyxHQUFHLE9BQU87QUFBQSxFQUNyRTtBQUVBLE9BQUssaUNBQWlDLFlBQVk7QUFDakQsb0JBQWdCLGNBQWMsK0JBQStCLGdCQUFnQiwrQkFBK0IsVUFBVTtBQUV0SCxXQUFPLHVCQUF1QjtBQUFBLEVBQy9CLENBQUM7QUFFRCxPQUFLLDRDQUE0QyxZQUFZO0FBQzVELG9CQUFnQixjQUFjLCtCQUErQix5QkFBeUIsK0JBQStCLFVBQVU7QUFFL0gsV0FBTyx1QkFBdUI7QUFBQSxFQUMvQixDQUFDO0FBRUQsaUJBQWUseUJBQXlCO0FBQ3ZDLFVBQU0sV0FBVyxJQUFJLEtBQUssS0FBSyxTQUFTLHlCQUF5QixDQUFDO0FBRWxFLFVBQU0sUUFBUSxVQUFVLFVBQVUsU0FBUyxXQUFXLFVBQVUsR0FBRyxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQ25GLFVBQU0sUUFBUSxVQUFVLFVBQVUsU0FBUyxXQUFXLFVBQVUsR0FBRyxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQ25GLFVBQU0sUUFBUSxVQUFVLFVBQVUsU0FBUyxXQUFXLFVBQVUsR0FBRyxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBRW5GLFdBQU8sWUFBWSxhQUFhLFNBQVMsTUFBTSxFQUFFLFNBQVMsR0FBRywwQkFBMEI7QUFBQSxFQUN4RjtBQUVBLE9BQUssNkRBQTZELFlBQVk7QUFFN0Usb0JBQWdCLGNBQWMsK0JBQStCLHNCQUFzQjtBQUVuRixVQUFNLFdBQVcsSUFBSSxLQUFLLEtBQUssU0FBUyxXQUFXLENBQUM7QUFDcEQsVUFBTSxnQkFBZ0I7QUFFdEIsUUFBSTtBQUNKLFFBQUk7QUFDSCxZQUFNLFFBQVEsVUFBVSxVQUFVLFNBQVMsV0FBVyxhQUFhLEdBQUcsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUFBLElBQ3ZGLFNBQVMsR0FBRztBQUNYLGNBQVE7QUFBQSxJQUNUO0FBRUEsV0FBTyxHQUFHLEtBQUs7QUFDZixXQUFPLEdBQUcsTUFBTSxRQUFRLFNBQVMseUJBQXlCLENBQUM7QUFBQSxFQUM1RCxDQUFDO0FBRUQsT0FBSywwQkFBMEIsWUFBWTtBQUMxQyxVQUFNLFdBQVcsSUFBSSxLQUFLLEtBQUssU0FBUyxXQUFXLENBQUM7QUFHcEQsUUFBSSxTQUFTLFNBQVMsTUFBTSxJQUFJO0FBQ2hDLFFBQUksS0FBSyxNQUFNLGFBQWEsS0FBSyxVQUFVLEVBQUUsUUFBUSxNQUFNLENBQUM7QUFDNUQsYUFBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDM0IsWUFBTSxhQUFhLEtBQUssSUFBSSxHQUFHLE9BQU8sUUFBUSxHQUFHLEVBQUU7QUFDbkQsYUFBTyxZQUFZLE9BQU8sTUFBTSxHQUFHLEVBQUUsRUFBRSxTQUFTLEdBQUcsNEJBQTRCO0FBQUEsSUFDaEY7QUFDQSxVQUFNLGFBQWEsTUFBTSxFQUFFO0FBRzNCLGFBQVMsU0FBUyxNQUFNLElBQUk7QUFDNUIsU0FBSyxNQUFNLGFBQWEsS0FBSyxVQUFVLEVBQUUsUUFBUSxNQUFNLENBQUM7QUFFeEQsUUFBSSxZQUFZO0FBRWhCLFVBQU0sYUFBYSxLQUFLLElBQUksV0FBVyxPQUFPLFFBQVEsR0FBRyxFQUFFO0FBQzNELFdBQU8sWUFBWSxPQUFPLE1BQU0sR0FBRyxFQUFFLEVBQUUsU0FBUyxHQUFHLDRCQUE0QjtBQUMvRSxpQkFBYTtBQUViLFVBQU0sYUFBYSxLQUFLLElBQUksV0FBVyxPQUFPLFFBQVEsR0FBRyxDQUFDO0FBQzFELFdBQU8sWUFBWSxPQUFPLE1BQU0sR0FBRyxDQUFDLEVBQUUsU0FBUyxHQUFHLEdBQUc7QUFDckQsaUJBQWE7QUFFYixVQUFNLGFBQWEsS0FBSyxJQUFJLFdBQVcsT0FBTyxRQUFRLEdBQUcsRUFBRTtBQUMzRCxXQUFPLFlBQVksT0FBTyxNQUFNLEdBQUcsRUFBRSxFQUFFLFNBQVMsR0FBRyxjQUFjO0FBQ2pFLGlCQUFhO0FBRWIsVUFBTSxhQUFhLEtBQUssSUFBSSxJQUE2QyxPQUFPLFFBQVEsR0FBRyxDQUFDO0FBQzVGLFdBQU8sWUFBWSxPQUFPLE1BQU0sR0FBRyxDQUFDLEVBQUUsU0FBUyxHQUFHLFdBQVc7QUFFN0QsVUFBTSxhQUFhLEtBQUssSUFBSSxJQUFJLE9BQU8sUUFBUSxHQUFHLEVBQUU7QUFDcEQsV0FBTyxZQUFZLE9BQU8sTUFBTSxHQUFHLEVBQUUsRUFBRSxTQUFTLEdBQUcsY0FBYztBQUVqRSxVQUFNLGFBQWEsS0FBSyxJQUFJLElBQUksT0FBTyxRQUFRLEdBQUcsQ0FBQztBQUNuRCxXQUFPLFlBQVksT0FBTyxNQUFNLEdBQUcsQ0FBQyxFQUFFLFNBQVMsR0FBRyxHQUFHO0FBRXJELFVBQU0sYUFBYSxLQUFLLElBQUksR0FBRyxPQUFPLFFBQVEsR0FBRyxFQUFFO0FBQ25ELFdBQU8sWUFBWSxPQUFPLE1BQU0sR0FBRyxFQUFFLEVBQUUsU0FBUyxHQUFHLDRCQUE0QjtBQUUvRSxVQUFNLGFBQWEsS0FBSyxJQUFJLFdBQWtDLE9BQU8sUUFBUSxHQUFHLEVBQUU7QUFDbEYsV0FBTyxZQUFZLE9BQU8sTUFBTSxHQUFHLEVBQUUsRUFBRSxTQUFTLEdBQUcsYUFBYTtBQUVoRSxVQUFNLGFBQWEsTUFBTSxFQUFFO0FBQUEsRUFDNUIsQ0FBQztBQUVELE9BQUssMkJBQTJCLFlBQVk7QUFDM0MsVUFBTSxXQUFXLElBQUksS0FBSyxLQUFLLFNBQVMsV0FBVyxDQUFDO0FBRXBELFVBQU0sU0FBUyxTQUFTLE1BQU0sSUFBSTtBQUNsQyxVQUFNLFVBQVUsTUFBTSxhQUFhLEtBQUssVUFBVSxFQUFFLFFBQVEsTUFBTSxRQUFRLE1BQU0sQ0FBQztBQUNqRixVQUFNLFNBQVMsTUFBTSxhQUFhLEtBQUssVUFBVSxFQUFFLFFBQVEsTUFBTSxDQUFDO0FBRWxFLFFBQUksaUJBQWlCO0FBQ3JCLFFBQUksZ0JBQWdCO0FBRXBCLFVBQU0sa0JBQWtCLFNBQVMsV0FBVyw0QkFBNEI7QUFDeEUsVUFBTSxhQUFhLE1BQU0sU0FBUyxnQkFBZ0IsZ0JBQWdCLFFBQVEsR0FBRyxnQkFBZ0IsVUFBVTtBQUN2RyxzQkFBa0IsZ0JBQWdCO0FBRWxDLFVBQU0sYUFBYSxLQUFLLFFBQVEsZUFBZSxPQUFPLFFBQVEsR0FBRyxFQUFFO0FBQ25FLFdBQU8sWUFBWSxPQUFPLE1BQU0sR0FBRyxFQUFFLEVBQUUsU0FBUyxHQUFHLDRCQUE0QjtBQUMvRSxxQkFBaUI7QUFFakIsVUFBTSxXQUFXLFNBQVMsV0FBVyxhQUFhO0FBRWxELFVBQU0sYUFBYSxNQUFNLFNBQVMsZ0JBQWdCLFNBQVMsUUFBUSxHQUFHLFNBQVMsVUFBVTtBQUN6RixzQkFBa0IsU0FBUztBQUUzQixVQUFNLGFBQWEsS0FBSyxRQUFRLGVBQWUsT0FBTyxRQUFRLEdBQUcsU0FBUyxVQUFVO0FBQ3BGLFdBQU8sWUFBWSxPQUFPLE1BQU0sR0FBRyxTQUFTLFVBQVUsRUFBRSxTQUFTLEdBQUcsYUFBYTtBQUNqRixxQkFBaUIsU0FBUztBQUUxQixVQUFNLGFBQWEsTUFBTSxTQUFTLEdBQUcsU0FBUyxRQUFRLEdBQUcsU0FBUyxVQUFVO0FBRTVFLFVBQU0sYUFBYSxLQUFLLFFBQVEsR0FBRyxPQUFPLFFBQVEsR0FBRyxFQUFFO0FBQ3ZELFdBQU8sWUFBWSxPQUFPLE1BQU0sR0FBRyxFQUFFLEVBQUUsU0FBUyxHQUFHLGFBQWE7QUFFaEUsVUFBTSxhQUFhLE1BQU0sU0FBUyxnQkFBZ0IsU0FBUyxRQUFRLEdBQUcsU0FBUyxVQUFVO0FBQ3pGLHNCQUFrQixTQUFTO0FBRTNCLFVBQU0sYUFBYSxLQUFLLFFBQVEsaUJBQWlCLFNBQVMsWUFBWSxPQUFPLFFBQVEsR0FBRyxTQUFTLFVBQVU7QUFDM0csV0FBTyxZQUFZLE9BQU8sTUFBTSxHQUFHLFNBQVMsVUFBVSxFQUFFLFNBQVMsR0FBRyxhQUFhO0FBRWpGLFVBQU0sYUFBYSxNQUFNLE9BQU87QUFDaEMsVUFBTSxhQUFhLE1BQU0sTUFBTTtBQUFBLEVBQ2hDLENBQUM7QUFFRCxPQUFLLHdEQUF3RCxZQUFZO0FBQ3hFLGlCQUFhLFlBQVksSUFBSTtBQUU3QixVQUFNLFdBQVcsSUFBSSxLQUFLLEtBQUssU0FBUyxZQUFZLENBQUM7QUFFckQsVUFBTSxnQkFBZ0IsTUFBTSxRQUFRLFFBQVEsUUFBUTtBQUNwRCxXQUFPLFlBQVksY0FBYyxVQUFVLElBQUk7QUFFL0MsVUFBTSxhQUFhLE1BQU0sUUFBUSxTQUFTLFFBQVE7QUFDbEQsV0FBTyxZQUFZLFdBQVcsVUFBVSxJQUFJO0FBRTVDLFFBQUksaUJBQW9DO0FBQ3hDLFFBQUk7QUFDSCxZQUFNLFFBQVEsVUFBVSxVQUFVLFNBQVMsV0FBVyxZQUFZLENBQUM7QUFBQSxJQUNwRSxTQUFTLE9BQU87QUFDZix1QkFBaUI7QUFBQSxJQUNsQjtBQUNBLFdBQU8sR0FBRyxjQUFjO0FBRXhCLFFBQUksa0JBQXFDO0FBQ3pDLFFBQUk7QUFDSCxZQUFNLFFBQVEsSUFBSSxRQUFRO0FBQUEsSUFDM0IsU0FBUyxPQUFPO0FBQ2Ysd0JBQWtCO0FBQUEsSUFDbkI7QUFDQSxXQUFPLEdBQUcsZUFBZTtBQUFBLEVBQzFCLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJwcm9taXNlcyIsICJzZXJ2aWNlIiwgImNvbnRlbnQiXQp9Cg==
