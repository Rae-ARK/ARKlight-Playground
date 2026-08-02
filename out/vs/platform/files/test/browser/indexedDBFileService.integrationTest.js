import assert from "assert";
import { IndexedDB } from "../../../../base/browser/indexedDB.js";
import { bufferToReadable, bufferToStream, VSBuffer } from "../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { basename, joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { flakySuite } from "../../../../base/test/common/testUtils.js";
import { IndexedDBFileSystemProvider } from "../../browser/indexedDBFileSystemProvider.js";
import { FileOperation, FileOperationResult, FileSystemProviderErrorCode, FileType } from "../../common/files.js";
import { FileService } from "../../common/fileService.js";
import { NullLogService } from "../../../log/common/log.js";
flakySuite("IndexedDBFileSystemProvider", function() {
  let service;
  let userdataFileProvider;
  const testDir = "/";
  const userdataURIFromPaths = (paths) => joinPath(URI.from({ scheme: Schemas.vscodeUserData, path: testDir }), ...paths);
  const disposables = new DisposableStore();
  const initFixtures = async () => {
    await Promise.all(
      [
        ["fixtures", "resolver", "examples"],
        ["fixtures", "resolver", "other", "deep"],
        ["fixtures", "service", "deep"],
        ["batched"]
      ].map((path) => userdataURIFromPaths(path)).map((uri) => service.createFolder(uri))
    );
    await Promise.all(
      [
        [["fixtures", "resolver", "examples", "company.js"], "class company {}"],
        [["fixtures", "resolver", "examples", "conway.js"], "export function conway() {}"],
        [["fixtures", "resolver", "examples", "employee.js"], 'export const employee = "jax"'],
        [["fixtures", "resolver", "examples", "small.js"], ""],
        [["fixtures", "resolver", "other", "deep", "company.js"], "class company {}"],
        [["fixtures", "resolver", "other", "deep", "conway.js"], "export function conway() {}"],
        [["fixtures", "resolver", "other", "deep", "employee.js"], 'export const employee = "jax"'],
        [["fixtures", "resolver", "other", "deep", "small.js"], ""],
        [["fixtures", "resolver", "index.html"], "<p>p</p>"],
        [["fixtures", "resolver", "site.css"], ".p {color: red;}"],
        [["fixtures", "service", "deep", "company.js"], "class company {}"],
        [["fixtures", "service", "deep", "conway.js"], "export function conway() {}"],
        [["fixtures", "service", "deep", "employee.js"], 'export const employee = "jax"'],
        [["fixtures", "service", "deep", "small.js"], ""],
        [["fixtures", "service", "binary.txt"], "<p>p</p>"]
      ].map(([path, contents]) => [userdataURIFromPaths(path), contents]).map(([uri, contents]) => service.createFile(uri, VSBuffer.fromString(contents)))
    );
  };
  const reload = async () => {
    const logService = new NullLogService();
    service = new FileService(logService);
    disposables.add(service);
    const indexedDB = await IndexedDB.create("vscode-web-db-test", 1, ["vscode-userdata-store", "vscode-logs-store"]);
    userdataFileProvider = new IndexedDBFileSystemProvider(Schemas.vscodeUserData, indexedDB, "vscode-userdata-store", true);
    disposables.add(service.registerProvider(Schemas.vscodeUserData, userdataFileProvider));
    disposables.add(userdataFileProvider);
  };
  setup(async function() {
    this.timeout(15e3);
    await reload();
  });
  teardown(async () => {
    await userdataFileProvider.reset();
    disposables.clear();
  });
  test("root is always present", async () => {
    assert.strictEqual((await userdataFileProvider.stat(userdataURIFromPaths([]))).type, FileType.Directory);
    await userdataFileProvider.delete(userdataURIFromPaths([]), { recursive: true, useTrash: false, atomic: false });
    assert.strictEqual((await userdataFileProvider.stat(userdataURIFromPaths([]))).type, FileType.Directory);
  });
  test("createFolder", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const parent = await service.resolve(userdataURIFromPaths([]));
    const newFolderResource = joinPath(parent.resource, "newFolder");
    assert.strictEqual((await userdataFileProvider.readdir(parent.resource)).length, 0);
    const newFolder = await service.createFolder(newFolderResource);
    assert.strictEqual(newFolder.name, "newFolder");
    assert.strictEqual((await userdataFileProvider.readdir(parent.resource)).length, 1);
    assert.strictEqual((await userdataFileProvider.stat(newFolderResource)).type, FileType.Directory);
    assert.ok(event);
    assert.strictEqual(event.resource.path, newFolderResource.path);
    assert.strictEqual(event.operation, FileOperation.CREATE);
    assert.strictEqual(event.target.resource.path, newFolderResource.path);
    assert.strictEqual(event.target.isDirectory, true);
  });
  test("createFolder: creating multiple folders at once", async () => {
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const multiFolderPaths = ["a", "couple", "of", "folders"];
    const parent = await service.resolve(userdataURIFromPaths([]));
    const newFolderResource = joinPath(parent.resource, ...multiFolderPaths);
    const newFolder = await service.createFolder(newFolderResource);
    const lastFolderName = multiFolderPaths[multiFolderPaths.length - 1];
    assert.strictEqual(newFolder.name, lastFolderName);
    assert.strictEqual((await userdataFileProvider.stat(newFolderResource)).type, FileType.Directory);
    assert.ok(event);
    assert.strictEqual(event.resource.path, newFolderResource.path);
    assert.strictEqual(event.operation, FileOperation.CREATE);
    assert.strictEqual(event.target.resource.path, newFolderResource.path);
    assert.strictEqual(event.target.isDirectory, true);
  });
  test("exists", async () => {
    let exists = await service.exists(userdataURIFromPaths([]));
    assert.strictEqual(exists, true);
    exists = await service.exists(userdataURIFromPaths(["hello"]));
    assert.strictEqual(exists, false);
  });
  test("resolve - file", async () => {
    await initFixtures();
    const resource = userdataURIFromPaths(["fixtures", "resolver", "index.html"]);
    const resolved = await service.resolve(resource);
    assert.strictEqual(resolved.name, "index.html");
    assert.strictEqual(resolved.isFile, true);
    assert.strictEqual(resolved.isDirectory, false);
    assert.strictEqual(resolved.isSymbolicLink, false);
    assert.strictEqual(resolved.resource.toString(), resource.toString());
    assert.strictEqual(resolved.children, void 0);
    assert.ok(resolved.size > 0);
  });
  test("resolve - directory", async () => {
    await initFixtures();
    const testsElements = ["examples", "other", "index.html", "site.css"];
    const resource = userdataURIFromPaths(["fixtures", "resolver"]);
    const result = await service.resolve(resource);
    assert.ok(result);
    assert.strictEqual(result.resource.toString(), resource.toString());
    assert.strictEqual(result.name, "resolver");
    assert.ok(result.children);
    assert.ok(result.children.length > 0);
    assert.ok(result.isDirectory);
    assert.strictEqual(result.children.length, testsElements.length);
    assert.ok(result.children.every((entry) => {
      return testsElements.some((name) => {
        return basename(entry.resource) === name;
      });
    }));
    result.children.forEach((value) => {
      assert.ok(basename(value.resource));
      if (["examples", "other"].indexOf(basename(value.resource)) >= 0) {
        assert.ok(value.isDirectory);
        assert.strictEqual(value.mtime, void 0);
        assert.strictEqual(value.ctime, void 0);
      } else if (basename(value.resource) === "index.html") {
        assert.ok(!value.isDirectory);
        assert.ok(!value.children);
        assert.strictEqual(value.mtime, void 0);
        assert.strictEqual(value.ctime, void 0);
      } else if (basename(value.resource) === "site.css") {
        assert.ok(!value.isDirectory);
        assert.ok(!value.children);
        assert.strictEqual(value.mtime, void 0);
        assert.strictEqual(value.ctime, void 0);
      } else {
        assert.fail("Unexpected value " + basename(value.resource));
      }
    });
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
    const resource = userdataURIFromPaths(["test.txt"]);
    assert.strictEqual(await service.canCreateFile(resource), true);
    const fileStat = await service.createFile(resource, converter(contents));
    assert.strictEqual(fileStat.name, "test.txt");
    assert.strictEqual((await userdataFileProvider.stat(fileStat.resource)).type, FileType.File);
    assert.strictEqual(new TextDecoder().decode(await userdataFileProvider.readFile(fileStat.resource)), contents);
    assert.ok(event);
    assert.strictEqual(event.resource.path, resource.path);
    assert.strictEqual(event.operation, FileOperation.CREATE);
    assert.strictEqual(event.target.resource.path, resource.path);
  }
  const fileCreateBatchTester = (size, name) => {
    const batch = Array.from({ length: size }).map((_, i) => ({ contents: `Hello${i}`, resource: userdataURIFromPaths(["batched", name, `Hello${i}.txt`]) }));
    let creationPromises = void 0;
    return {
      async create() {
        return creationPromises = Promise.all(batch.map((entry) => userdataFileProvider.writeFile(entry.resource, VSBuffer.fromString(entry.contents).buffer, { create: true, overwrite: true, unlock: false, atomic: false })));
      },
      async assertContentsCorrect() {
        if (!creationPromises) {
          throw Error("read called before create");
        }
        await creationPromises;
        await Promise.all(batch.map(async (entry, i) => {
          assert.strictEqual((await userdataFileProvider.stat(entry.resource)).type, FileType.File);
          assert.strictEqual(new TextDecoder().decode(await userdataFileProvider.readFile(entry.resource)), entry.contents);
        }));
      }
    };
  };
  test("createFile - batch", async () => {
    const tester = fileCreateBatchTester(20, "batch");
    await tester.create();
    await tester.assertContentsCorrect();
  });
  test("createFile - batch (mixed parallel/sequential)", async () => {
    const batch1 = fileCreateBatchTester(1, "batch1");
    const batch2 = fileCreateBatchTester(20, "batch2");
    const batch3 = fileCreateBatchTester(1, "batch3");
    const batch4 = fileCreateBatchTester(20, "batch4");
    batch1.create();
    batch2.create();
    await Promise.all([batch1.assertContentsCorrect(), batch2.assertContentsCorrect()]);
    batch3.create();
    batch4.create();
    await Promise.all([batch3.assertContentsCorrect(), batch4.assertContentsCorrect()]);
    await Promise.all([batch1.assertContentsCorrect(), batch2.assertContentsCorrect()]);
  });
  test("rename not existing resource", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFile = joinPath(parent.resource, "sourceFile");
    const targetFile = joinPath(parent.resource, "targetFile");
    try {
      await service.move(sourceFile, targetFile, false);
    } catch (error) {
      assert.deepStrictEqual(error.code, FileSystemProviderErrorCode.FileNotFound);
      return;
    }
    assert.fail("This should fail with error");
  });
  test("rename to an existing file without overwrite", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFile = joinPath(parent.resource, "sourceFile");
    await service.writeFile(sourceFile, VSBuffer.fromString("This is source file"));
    const targetFile = joinPath(parent.resource, "targetFile");
    await service.writeFile(targetFile, VSBuffer.fromString("This is target file"));
    try {
      await service.move(sourceFile, targetFile, false);
    } catch (error) {
      assert.deepStrictEqual(error.fileOperationResult, FileOperationResult.FILE_MOVE_CONFLICT);
      return;
    }
    assert.fail("This should fail with error");
  });
  test("rename folder to an existing folder without overwrite", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFolder = joinPath(parent.resource, "sourceFolder");
    await service.createFolder(sourceFolder);
    const targetFolder = joinPath(parent.resource, "targetFolder");
    await service.createFolder(targetFolder);
    try {
      await service.move(sourceFolder, targetFolder, false);
    } catch (error) {
      assert.deepStrictEqual(error.fileOperationResult, FileOperationResult.FILE_MOVE_CONFLICT);
      return;
    }
    assert.fail("This should fail with cannot overwrite error");
  });
  test("rename file to a folder", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFile = joinPath(parent.resource, "sourceFile");
    await service.writeFile(sourceFile, VSBuffer.fromString("This is source file"));
    const targetFolder = joinPath(parent.resource, "targetFolder");
    await service.createFolder(targetFolder);
    try {
      await service.move(sourceFile, targetFolder, false);
    } catch (error) {
      assert.deepStrictEqual(error.fileOperationResult, FileOperationResult.FILE_MOVE_CONFLICT);
      return;
    }
    assert.fail("This should fail with error");
  });
  test("rename folder to a file", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFolder = joinPath(parent.resource, "sourceFile");
    await service.createFolder(sourceFolder);
    const targetFile = joinPath(parent.resource, "targetFile");
    await service.writeFile(targetFile, VSBuffer.fromString("This is target file"));
    try {
      await service.move(sourceFolder, targetFile, false);
    } catch (error) {
      assert.deepStrictEqual(error.fileOperationResult, FileOperationResult.FILE_MOVE_CONFLICT);
      return;
    }
    assert.fail("This should fail with error");
  });
  test("rename file", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFile = joinPath(parent.resource, "sourceFile");
    await service.writeFile(sourceFile, VSBuffer.fromString("This is source file"));
    const targetFile = joinPath(parent.resource, "targetFile");
    await service.move(sourceFile, targetFile, false);
    const content = await service.readFile(targetFile);
    assert.strictEqual(await service.exists(sourceFile), false);
    assert.strictEqual(content.value.toString(), "This is source file");
  });
  test("rename to an existing file with overwrite", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFile = joinPath(parent.resource, "sourceFile");
    const targetFile = joinPath(parent.resource, "targetFile");
    await Promise.all([
      service.writeFile(sourceFile, VSBuffer.fromString("This is source file")),
      service.writeFile(targetFile, VSBuffer.fromString("This is target file"))
    ]);
    await service.move(sourceFile, targetFile, true);
    const content = await service.readFile(targetFile);
    assert.strictEqual(await service.exists(sourceFile), false);
    assert.strictEqual(content.value.toString(), "This is source file");
  });
  test("rename folder to a new folder", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFolder = joinPath(parent.resource, "sourceFolder");
    await service.createFolder(sourceFolder);
    const targetFolder = joinPath(parent.resource, "targetFolder");
    await service.move(sourceFolder, targetFolder, false);
    assert.deepStrictEqual(await service.exists(sourceFolder), false);
    assert.deepStrictEqual(await service.exists(targetFolder), true);
  });
  test("rename folder to an existing folder", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFolder = joinPath(parent.resource, "sourceFolder");
    await service.createFolder(sourceFolder);
    const targetFolder = joinPath(parent.resource, "targetFolder");
    await service.createFolder(targetFolder);
    await service.move(sourceFolder, targetFolder, true);
    assert.deepStrictEqual(await service.exists(sourceFolder), false);
    assert.deepStrictEqual(await service.exists(targetFolder), true);
  });
  test("rename a folder that has multiple files and folders", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFolder = joinPath(parent.resource, "sourceFolder");
    const sourceFile1 = joinPath(sourceFolder, "folder1", "file1");
    const sourceFile2 = joinPath(sourceFolder, "folder2", "file1");
    const sourceEmptyFolder = joinPath(sourceFolder, "folder3");
    await Promise.all([
      service.writeFile(sourceFile1, VSBuffer.fromString("Source File 1")),
      service.writeFile(sourceFile2, VSBuffer.fromString("Source File 2")),
      service.createFolder(sourceEmptyFolder)
    ]);
    const targetFolder = joinPath(parent.resource, "targetFolder");
    const targetFile1 = joinPath(targetFolder, "folder1", "file1");
    const targetFile2 = joinPath(targetFolder, "folder2", "file1");
    const targetEmptyFolder = joinPath(targetFolder, "folder3");
    await service.move(sourceFolder, targetFolder, false);
    assert.deepStrictEqual(await service.exists(sourceFolder), false);
    assert.deepStrictEqual(await service.exists(targetFolder), true);
    assert.strictEqual((await service.readFile(targetFile1)).value.toString(), "Source File 1");
    assert.strictEqual((await service.readFile(targetFile2)).value.toString(), "Source File 2");
    assert.deepStrictEqual(await service.exists(targetEmptyFolder), true);
  });
  test("rename a folder to another folder that has some files", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const sourceFolder = joinPath(parent.resource, "sourceFolder");
    const sourceFile1 = joinPath(sourceFolder, "folder1", "file1");
    const targetFolder = joinPath(parent.resource, "targetFolder");
    const targetFile1 = joinPath(targetFolder, "folder1", "file1");
    const targetFile2 = joinPath(targetFolder, "folder1", "file2");
    const targetFile3 = joinPath(targetFolder, "folder2", "file1");
    await Promise.all([
      service.writeFile(sourceFile1, VSBuffer.fromString("Source File 1")),
      service.writeFile(targetFile2, VSBuffer.fromString("Target File 2")),
      service.writeFile(targetFile3, VSBuffer.fromString("Target File 3"))
    ]);
    await service.move(sourceFolder, targetFolder, true);
    assert.deepStrictEqual(await service.exists(sourceFolder), false);
    assert.deepStrictEqual(await service.exists(targetFolder), true);
    assert.strictEqual((await service.readFile(targetFile1)).value.toString(), "Source File 1");
    assert.strictEqual(await service.exists(targetFile2), false);
    assert.strictEqual(await service.exists(targetFile3), false);
  });
  test("deleteFile", async () => {
    await initFixtures();
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const anotherResource = userdataURIFromPaths(["fixtures", "service", "deep", "company.js"]);
    const resource = userdataURIFromPaths(["fixtures", "service", "deep", "conway.js"]);
    const source = await service.resolve(resource);
    assert.strictEqual(await service.canDelete(source.resource, { useTrash: false }), true);
    await service.del(source.resource, { useTrash: false });
    assert.strictEqual(await service.exists(source.resource), false);
    assert.strictEqual(await service.exists(anotherResource), true);
    assert.ok(event);
    assert.strictEqual(event.resource.path, resource.path);
    assert.strictEqual(event.operation, FileOperation.DELETE);
    {
      let error = void 0;
      try {
        await service.del(source.resource, { useTrash: false });
      } catch (e) {
        error = e;
      }
      assert.ok(error);
      assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_NOT_FOUND);
    }
    await reload();
    {
      let error = void 0;
      try {
        await service.del(source.resource, { useTrash: false });
      } catch (e) {
        error = e;
      }
      assert.ok(error);
      assert.strictEqual(error.fileOperationResult, FileOperationResult.FILE_NOT_FOUND);
    }
  });
  test("deleteFolder (recursive)", async () => {
    await initFixtures();
    let event;
    disposables.add(service.onDidRunOperation((e) => event = e));
    const resource = userdataURIFromPaths(["fixtures", "service", "deep"]);
    const subResource1 = userdataURIFromPaths(["fixtures", "service", "deep", "company.js"]);
    const subResource2 = userdataURIFromPaths(["fixtures", "service", "deep", "conway.js"]);
    assert.strictEqual(await service.exists(subResource1), true);
    assert.strictEqual(await service.exists(subResource2), true);
    const source = await service.resolve(resource);
    assert.strictEqual(await service.canDelete(source.resource, { recursive: true, useTrash: false }), true);
    await service.del(source.resource, { recursive: true, useTrash: false });
    assert.strictEqual(await service.exists(source.resource), false);
    assert.strictEqual(await service.exists(subResource1), false);
    assert.strictEqual(await service.exists(subResource2), false);
    assert.ok(event);
    assert.strictEqual(event.resource.fsPath, resource.fsPath);
    assert.strictEqual(event.operation, FileOperation.DELETE);
  });
  test("deleteFolder (non recursive)", async () => {
    await initFixtures();
    const resource = userdataURIFromPaths(["fixtures", "service", "deep"]);
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
  test("delete empty folder", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const folder = joinPath(parent.resource, "folder");
    await service.createFolder(folder);
    await service.del(folder);
    assert.deepStrictEqual(await service.exists(folder), false);
  });
  test("delete empty folder with reccursive", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const folder = joinPath(parent.resource, "folder");
    await service.createFolder(folder);
    await service.del(folder, { recursive: true });
    assert.deepStrictEqual(await service.exists(folder), false);
  });
  test("deleteFolder with folders and files (recursive)", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const targetFolder = joinPath(parent.resource, "targetFolder");
    const file1 = joinPath(targetFolder, "folder1", "file1");
    await service.createFile(file1);
    const file2 = joinPath(targetFolder, "folder2", "file1");
    await service.createFile(file2);
    const emptyFolder = joinPath(targetFolder, "folder3");
    await service.createFolder(emptyFolder);
    await service.del(targetFolder, { recursive: true });
    assert.deepStrictEqual(await service.exists(targetFolder), false);
    assert.deepStrictEqual(await service.exists(joinPath(targetFolder, "folder1")), false);
    assert.deepStrictEqual(await service.exists(joinPath(targetFolder, "folder2")), false);
    assert.deepStrictEqual(await service.exists(file1), false);
    assert.deepStrictEqual(await service.exists(file2), false);
    assert.deepStrictEqual(await service.exists(emptyFolder), false);
  });
  test("writeFile with append - existing file", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const resource = joinPath(parent.resource, "appendTest.txt");
    await service.writeFile(resource, VSBuffer.fromString("Hello "));
    await service.writeFile(resource, VSBuffer.fromString("World!"), { append: true });
    const content = await service.readFile(resource);
    assert.strictEqual(content.value.toString(), "Hello World!");
  });
  test("writeFile with append - non-existent file", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const resource = joinPath(parent.resource, "newAppendTest.txt");
    await service.writeFile(resource, VSBuffer.fromString("First content"), { append: true });
    const content = await service.readFile(resource);
    assert.strictEqual(content.value.toString(), "First content");
  });
  test("writeFile with append - multiple appends", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const resource = joinPath(parent.resource, "multiAppend.txt");
    await service.writeFile(resource, VSBuffer.fromString("Line 1\n"));
    await service.writeFile(resource, VSBuffer.fromString("Line 2\n"), { append: true });
    await service.writeFile(resource, VSBuffer.fromString("Line 3\n"), { append: true });
    const content = await service.readFile(resource);
    assert.strictEqual(content.value.toString(), "Line 1\nLine 2\nLine 3\n");
  });
  test("writeFile without append - overwrites content", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const resource = joinPath(parent.resource, "overwriteTest.txt");
    await service.writeFile(resource, VSBuffer.fromString("Original content"));
    await service.writeFile(resource, VSBuffer.fromString("New content"));
    const content = await service.readFile(resource);
    assert.strictEqual(content.value.toString(), "New content");
  });
  test("writeFile with append - binary content", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const resource = joinPath(parent.resource, "binaryAppend.bin");
    const data1 = new Uint8Array([1, 2, 3, 4, 5]);
    const data2 = new Uint8Array([6, 7, 8, 9, 10]);
    await service.writeFile(resource, VSBuffer.wrap(data1));
    await service.writeFile(resource, VSBuffer.wrap(data2), { append: true });
    const content = await service.readFile(resource);
    const expected = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.strictEqual(content.value.byteLength, expected.byteLength);
    for (let i = 0; i < expected.byteLength; i++) {
      assert.strictEqual(content.value.buffer[i], expected[i]);
    }
  });
  test("provider writeFile with append - direct provider API", async () => {
    const parent = await service.resolve(userdataURIFromPaths([]));
    const resource = joinPath(parent.resource, "providerAppend.txt");
    await userdataFileProvider.writeFile(resource, VSBuffer.fromString("First ").buffer, { create: true, overwrite: true, unlock: false, atomic: false });
    await userdataFileProvider.writeFile(resource, VSBuffer.fromString("Second").buffer, { create: true, overwrite: true, unlock: false, atomic: false, append: true });
    const content = await userdataFileProvider.readFile(resource);
    assert.strictEqual(new TextDecoder().decode(content), "First Second");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3QvYnJvd3Nlci9pbmRleGVkREJGaWxlU2VydmljZS5pbnRlZ3JhdGlvblRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBJbmRleGVkREIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvaW5kZXhlZERCLmpzJztcbmltcG9ydCB7IGJ1ZmZlclRvUmVhZGFibGUsIGJ1ZmZlclRvU3RyZWFtLCBWU0J1ZmZlciwgVlNCdWZmZXJSZWFkYWJsZSwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBmbGFreVN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90ZXN0VXRpbHMuanMnO1xuaW1wb3J0IHsgSW5kZXhlZERCRmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9pbmRleGVkREJGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uRXZlbnQsIEZpbGVPcGVyYXRpb25SZXN1bHQsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUsIEZpbGVUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5mbGFreVN1aXRlKCdJbmRleGVkREJGaWxlU3lzdGVtUHJvdmlkZXInLCBmdW5jdGlvbiAoKSB7XG5cblx0bGV0IHNlcnZpY2U6IEZpbGVTZXJ2aWNlO1xuXHRsZXQgdXNlcmRhdGFGaWxlUHJvdmlkZXI6IEluZGV4ZWREQkZpbGVTeXN0ZW1Qcm92aWRlcjtcblx0Y29uc3QgdGVzdERpciA9ICcvJztcblxuXHRjb25zdCB1c2VyZGF0YVVSSUZyb21QYXRocyA9IChwYXRoczogcmVhZG9ubHkgc3RyaW5nW10pID0+IGpvaW5QYXRoKFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZVVzZXJEYXRhLCBwYXRoOiB0ZXN0RGlyIH0pLCAuLi5wYXRocyk7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3QgaW5pdEZpeHR1cmVzID0gYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFxuXHRcdFx0W1snZml4dHVyZXMnLCAncmVzb2x2ZXInLCAnZXhhbXBsZXMnXSxcblx0XHRcdFsnZml4dHVyZXMnLCAncmVzb2x2ZXInLCAnb3RoZXInLCAnZGVlcCddLFxuXHRcdFx0WydmaXh0dXJlcycsICdzZXJ2aWNlJywgJ2RlZXAnXSxcblx0XHRcdFsnYmF0Y2hlZCddXVxuXHRcdFx0XHQubWFwKHBhdGggPT4gdXNlcmRhdGFVUklGcm9tUGF0aHMocGF0aCkpXG5cdFx0XHRcdC5tYXAodXJpID0+IHNlcnZpY2UuY3JlYXRlRm9sZGVyKHVyaSkpKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChcblx0XHRcdChbXG5cdFx0XHRcdFtbJ2ZpeHR1cmVzJywgJ3Jlc29sdmVyJywgJ2V4YW1wbGVzJywgJ2NvbXBhbnkuanMnXSwgJ2NsYXNzIGNvbXBhbnkge30nXSxcblx0XHRcdFx0W1snZml4dHVyZXMnLCAncmVzb2x2ZXInLCAnZXhhbXBsZXMnLCAnY29ud2F5LmpzJ10sICdleHBvcnQgZnVuY3Rpb24gY29ud2F5KCkge30nXSxcblx0XHRcdFx0W1snZml4dHVyZXMnLCAncmVzb2x2ZXInLCAnZXhhbXBsZXMnLCAnZW1wbG95ZWUuanMnXSwgJ2V4cG9ydCBjb25zdCBlbXBsb3llZSA9IFwiamF4XCInXSxcblx0XHRcdFx0W1snZml4dHVyZXMnLCAncmVzb2x2ZXInLCAnZXhhbXBsZXMnLCAnc21hbGwuanMnXSwgJyddLFxuXHRcdFx0XHRbWydmaXh0dXJlcycsICdyZXNvbHZlcicsICdvdGhlcicsICdkZWVwJywgJ2NvbXBhbnkuanMnXSwgJ2NsYXNzIGNvbXBhbnkge30nXSxcblx0XHRcdFx0W1snZml4dHVyZXMnLCAncmVzb2x2ZXInLCAnb3RoZXInLCAnZGVlcCcsICdjb253YXkuanMnXSwgJ2V4cG9ydCBmdW5jdGlvbiBjb253YXkoKSB7fSddLFxuXHRcdFx0XHRbWydmaXh0dXJlcycsICdyZXNvbHZlcicsICdvdGhlcicsICdkZWVwJywgJ2VtcGxveWVlLmpzJ10sICdleHBvcnQgY29uc3QgZW1wbG95ZWUgPSBcImpheFwiJ10sXG5cdFx0XHRcdFtbJ2ZpeHR1cmVzJywgJ3Jlc29sdmVyJywgJ290aGVyJywgJ2RlZXAnLCAnc21hbGwuanMnXSwgJyddLFxuXHRcdFx0XHRbWydmaXh0dXJlcycsICdyZXNvbHZlcicsICdpbmRleC5odG1sJ10sICc8cD5wPC9wPiddLFxuXHRcdFx0XHRbWydmaXh0dXJlcycsICdyZXNvbHZlcicsICdzaXRlLmNzcyddLCAnLnAge2NvbG9yOiByZWQ7fSddLFxuXHRcdFx0XHRbWydmaXh0dXJlcycsICdzZXJ2aWNlJywgJ2RlZXAnLCAnY29tcGFueS5qcyddLCAnY2xhc3MgY29tcGFueSB7fSddLFxuXHRcdFx0XHRbWydmaXh0dXJlcycsICdzZXJ2aWNlJywgJ2RlZXAnLCAnY29ud2F5LmpzJ10sICdleHBvcnQgZnVuY3Rpb24gY29ud2F5KCkge30nXSxcblx0XHRcdFx0W1snZml4dHVyZXMnLCAnc2VydmljZScsICdkZWVwJywgJ2VtcGxveWVlLmpzJ10sICdleHBvcnQgY29uc3QgZW1wbG95ZWUgPSBcImpheFwiJ10sXG5cdFx0XHRcdFtbJ2ZpeHR1cmVzJywgJ3NlcnZpY2UnLCAnZGVlcCcsICdzbWFsbC5qcyddLCAnJ10sXG5cdFx0XHRcdFtbJ2ZpeHR1cmVzJywgJ3NlcnZpY2UnLCAnYmluYXJ5LnR4dCddLCAnPHA+cDwvcD4nXSxcblx0XHRcdF0gYXMgY29uc3QpXG5cdFx0XHRcdC5tYXAoKFtwYXRoLCBjb250ZW50c10pID0+IFt1c2VyZGF0YVVSSUZyb21QYXRocyhwYXRoKSwgY29udGVudHNdIGFzIGNvbnN0KVxuXHRcdFx0XHQubWFwKChbdXJpLCBjb250ZW50c10pID0+IHNlcnZpY2UuY3JlYXRlRmlsZSh1cmksIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudHMpKSlcblx0XHQpO1xuXHR9O1xuXG5cdGNvbnN0IHJlbG9hZCA9IGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cblx0XHRzZXJ2aWNlID0gbmV3IEZpbGVTZXJ2aWNlKGxvZ1NlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGluZGV4ZWREQiA9IGF3YWl0IEluZGV4ZWREQi5jcmVhdGUoJ3ZzY29kZS13ZWItZGItdGVzdCcsIDEsIFsndnNjb2RlLXVzZXJkYXRhLXN0b3JlJywgJ3ZzY29kZS1sb2dzLXN0b3JlJ10pO1xuXG5cdFx0dXNlcmRhdGFGaWxlUHJvdmlkZXIgPSBuZXcgSW5kZXhlZERCRmlsZVN5c3RlbVByb3ZpZGVyKFNjaGVtYXMudnNjb2RlVXNlckRhdGEsIGluZGV4ZWREQiwgJ3ZzY29kZS11c2VyZGF0YS1zdG9yZScsIHRydWUpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy52c2NvZGVVc2VyRGF0YSwgdXNlcmRhdGFGaWxlUHJvdmlkZXIpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodXNlcmRhdGFGaWxlUHJvdmlkZXIpO1xuXHR9O1xuXG5cdHNldHVwKGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTUwMDApO1xuXHRcdGF3YWl0IHJlbG9hZCgpO1xuXHR9KTtcblxuXHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdXNlcmRhdGFGaWxlUHJvdmlkZXIucmVzZXQoKTtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHR0ZXN0KCdyb290IGlzIGFsd2F5cyBwcmVzZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgdXNlcmRhdGFGaWxlUHJvdmlkZXIuc3RhdCh1c2VyZGF0YVVSSUZyb21QYXRocyhbXSkpKS50eXBlLCBGaWxlVHlwZS5EaXJlY3RvcnkpO1xuXHRcdGF3YWl0IHVzZXJkYXRhRmlsZVByb3ZpZGVyLmRlbGV0ZSh1c2VyZGF0YVVSSUZyb21QYXRocyhbXSksIHsgcmVjdXJzaXZlOiB0cnVlLCB1c2VUcmFzaDogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCB1c2VyZGF0YUZpbGVQcm92aWRlci5zdGF0KHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSkpLnR5cGUsIEZpbGVUeXBlLkRpcmVjdG9yeSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudCB8IHVuZGVmaW5lZDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSk7XG5cdFx0Y29uc3QgbmV3Rm9sZGVyUmVzb3VyY2UgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICduZXdGb2xkZXInKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgdXNlcmRhdGFGaWxlUHJvdmlkZXIucmVhZGRpcihwYXJlbnQucmVzb3VyY2UpKS5sZW5ndGgsIDApO1xuXHRcdGNvbnN0IG5ld0ZvbGRlciA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlRm9sZGVyKG5ld0ZvbGRlclJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3Rm9sZGVyLm5hbWUsICduZXdGb2xkZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHVzZXJkYXRhRmlsZVByb3ZpZGVyLnJlYWRkaXIocGFyZW50LnJlc291cmNlKSkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHVzZXJkYXRhRmlsZVByb3ZpZGVyLnN0YXQobmV3Rm9sZGVyUmVzb3VyY2UpKS50eXBlLCBGaWxlVHlwZS5EaXJlY3RvcnkpO1xuXG5cdFx0YXNzZXJ0Lm9rKGV2ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQucmVzb3VyY2UucGF0aCwgbmV3Rm9sZGVyUmVzb3VyY2UucGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Lm9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbi5DUkVBVEUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50YXJnZXQhLnJlc291cmNlLnBhdGgsIG5ld0ZvbGRlclJlc291cmNlLnBhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50YXJnZXQhLmlzRGlyZWN0b3J5LCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlRm9sZGVyOiBjcmVhdGluZyBtdWx0aXBsZSBmb2xkZXJzIGF0IG9uY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiBldmVudCA9IGUpKTtcblxuXHRcdGNvbnN0IG11bHRpRm9sZGVyUGF0aHMgPSBbJ2EnLCAnY291cGxlJywgJ29mJywgJ2ZvbGRlcnMnXTtcblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUodXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKTtcblx0XHRjb25zdCBuZXdGb2xkZXJSZXNvdXJjZSA9IGpvaW5QYXRoKHBhcmVudC5yZXNvdXJjZSwgLi4ubXVsdGlGb2xkZXJQYXRocyk7XG5cblx0XHRjb25zdCBuZXdGb2xkZXIgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUZvbGRlcihuZXdGb2xkZXJSZXNvdXJjZSk7XG5cblx0XHRjb25zdCBsYXN0Rm9sZGVyTmFtZSA9IG11bHRpRm9sZGVyUGF0aHNbbXVsdGlGb2xkZXJQYXRocy5sZW5ndGggLSAxXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3Rm9sZGVyLm5hbWUsIGxhc3RGb2xkZXJOYW1lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHVzZXJkYXRhRmlsZVByb3ZpZGVyLnN0YXQobmV3Rm9sZGVyUmVzb3VyY2UpKS50eXBlLCBGaWxlVHlwZS5EaXJlY3RvcnkpO1xuXG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5wYXRoLCBuZXdGb2xkZXJSZXNvdXJjZS5wYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLm9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbi5DUkVBVEUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEudGFyZ2V0IS5yZXNvdXJjZS5wYXRoLCBuZXdGb2xkZXJSZXNvdXJjZS5wYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnRhcmdldCEuaXNEaXJlY3RvcnksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGV4aXN0cyA9IGF3YWl0IHNlcnZpY2UuZXhpc3RzKHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0cywgdHJ1ZSk7XG5cblx0XHRleGlzdHMgPSBhd2FpdCBzZXJ2aWNlLmV4aXN0cyh1c2VyZGF0YVVSSUZyb21QYXRocyhbJ2hlbGxvJ10pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhpc3RzLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmUgLSBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGluaXRGaXh0dXJlcygpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB1c2VyZGF0YVVSSUZyb21QYXRocyhbJ2ZpeHR1cmVzJywgJ3Jlc29sdmVyJywgJ2luZGV4Lmh0bWwnXSk7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLm5hbWUsICdpbmRleC5odG1sJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmlzRmlsZSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmlzRGlyZWN0b3J5LCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLmlzU3ltYm9saWNMaW5rLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVkLnJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZC5jaGlsZHJlbiwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2socmVzb2x2ZWQuc2l6ZSEgPiAwKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZSAtIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBpbml0Rml4dHVyZXMoKTtcblxuXHRcdGNvbnN0IHRlc3RzRWxlbWVudHMgPSBbJ2V4YW1wbGVzJywgJ290aGVyJywgJ2luZGV4Lmh0bWwnLCAnc2l0ZS5jc3MnXTtcblxuXHRcdGNvbnN0IHJlc291cmNlID0gdXNlcmRhdGFVUklGcm9tUGF0aHMoWydmaXh0dXJlcycsICdyZXNvbHZlciddKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZXNvdXJjZS50b1N0cmluZygpLCByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm5hbWUsICdyZXNvbHZlcicpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuY2hpbGRyZW4pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuY2hpbGRyZW4ubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pc0RpcmVjdG9yeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jaGlsZHJlbi5sZW5ndGgsIHRlc3RzRWxlbWVudHMubGVuZ3RoKTtcblxuXHRcdGFzc2VydC5vayhyZXN1bHQuY2hpbGRyZW4uZXZlcnkoZW50cnkgPT4ge1xuXHRcdFx0cmV0dXJuIHRlc3RzRWxlbWVudHMuc29tZShuYW1lID0+IHtcblx0XHRcdFx0cmV0dXJuIGJhc2VuYW1lKGVudHJ5LnJlc291cmNlKSA9PT0gbmFtZTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHJlc3VsdC5jaGlsZHJlbi5mb3JFYWNoKHZhbHVlID0+IHtcblx0XHRcdGFzc2VydC5vayhiYXNlbmFtZSh2YWx1ZS5yZXNvdXJjZSkpO1xuXHRcdFx0aWYgKFsnZXhhbXBsZXMnLCAnb3RoZXInXS5pbmRleE9mKGJhc2VuYW1lKHZhbHVlLnJlc291cmNlKSkgPj0gMCkge1xuXHRcdFx0XHRhc3NlcnQub2sodmFsdWUuaXNEaXJlY3RvcnkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubXRpbWUsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5jdGltZSwgdW5kZWZpbmVkKTtcblx0XHRcdH0gZWxzZSBpZiAoYmFzZW5hbWUodmFsdWUucmVzb3VyY2UpID09PSAnaW5kZXguaHRtbCcpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKCF2YWx1ZS5pc0RpcmVjdG9yeSk7XG5cdFx0XHRcdGFzc2VydC5vayghdmFsdWUuY2hpbGRyZW4pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubXRpbWUsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5jdGltZSwgdW5kZWZpbmVkKTtcblx0XHRcdH0gZWxzZSBpZiAoYmFzZW5hbWUodmFsdWUucmVzb3VyY2UpID09PSAnc2l0ZS5jc3MnKSB7XG5cdFx0XHRcdGFzc2VydC5vayghdmFsdWUuaXNEaXJlY3RvcnkpO1xuXHRcdFx0XHRhc3NlcnQub2soIXZhbHVlLmNoaWxkcmVuKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLm10aW1lLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuY3RpbWUsIHVuZGVmaW5lZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhc3NlcnQuZmFpbCgnVW5leHBlY3RlZCB2YWx1ZSAnICsgYmFzZW5hbWUodmFsdWUucmVzb3VyY2UpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlRmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gYXNzZXJ0Q3JlYXRlRmlsZShjb250ZW50cyA9PiBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnRzKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUZpbGUgKHJlYWRhYmxlKScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gYXNzZXJ0Q3JlYXRlRmlsZShjb250ZW50cyA9PiBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudHMpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUZpbGUgKHN0cmVhbSknLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIGFzc2VydENyZWF0ZUZpbGUoY29udGVudHMgPT4gYnVmZmVyVG9TdHJlYW0oVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50cykpKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gYXNzZXJ0Q3JlYXRlRmlsZShjb252ZXJ0ZXI6IChjb250ZW50OiBzdHJpbmcpID0+IFZTQnVmZmVyIHwgVlNCdWZmZXJSZWFkYWJsZSB8IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0Y29uc3QgY29udGVudHMgPSAnSGVsbG8gV29ybGQnO1xuXHRcdGNvbnN0IHJlc291cmNlID0gdXNlcmRhdGFVUklGcm9tUGF0aHMoWyd0ZXN0LnR4dCddKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNhbkNyZWF0ZUZpbGUocmVzb3VyY2UpLCB0cnVlKTtcblx0XHRjb25zdCBmaWxlU3RhdCA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlRmlsZShyZXNvdXJjZSwgY29udmVydGVyKGNvbnRlbnRzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVTdGF0Lm5hbWUsICd0ZXN0LnR4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgdXNlcmRhdGFGaWxlUHJvdmlkZXIuc3RhdChmaWxlU3RhdC5yZXNvdXJjZSkpLnR5cGUsIEZpbGVUeXBlLkZpbGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoYXdhaXQgdXNlcmRhdGFGaWxlUHJvdmlkZXIucmVhZEZpbGUoZmlsZVN0YXQucmVzb3VyY2UpKSwgY29udGVudHMpO1xuXG5cdFx0YXNzZXJ0Lm9rKGV2ZW50ISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5yZXNvdXJjZS5wYXRoLCByZXNvdXJjZS5wYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLm9wZXJhdGlvbiwgRmlsZU9wZXJhdGlvbi5DUkVBVEUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEudGFyZ2V0IS5yZXNvdXJjZS5wYXRoLCByZXNvdXJjZS5wYXRoKTtcblx0fVxuXG5cdGNvbnN0IGZpbGVDcmVhdGVCYXRjaFRlc3RlciA9IChzaXplOiBudW1iZXIsIG5hbWU6IHN0cmluZykgPT4ge1xuXHRcdGNvbnN0IGJhdGNoID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogc2l6ZSB9KS5tYXAoKF8sIGkpID0+ICh7IGNvbnRlbnRzOiBgSGVsbG8ke2l9YCwgcmVzb3VyY2U6IHVzZXJkYXRhVVJJRnJvbVBhdGhzKFsnYmF0Y2hlZCcsIG5hbWUsIGBIZWxsbyR7aX0udHh0YF0pIH0pKTtcblx0XHRsZXQgY3JlYXRpb25Qcm9taXNlczogUHJvbWlzZTxhbnk+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHJldHVybiB7XG5cdFx0XHRhc3luYyBjcmVhdGUoKSB7XG5cdFx0XHRcdHJldHVybiBjcmVhdGlvblByb21pc2VzID0gUHJvbWlzZS5hbGwoYmF0Y2gubWFwKGVudHJ5ID0+IHVzZXJkYXRhRmlsZVByb3ZpZGVyLndyaXRlRmlsZShlbnRyeS5yZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhlbnRyeS5jb250ZW50cykuYnVmZmVyLCB7IGNyZWF0ZTogdHJ1ZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pKSk7XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgYXNzZXJ0Q29udGVudHNDb3JyZWN0KCkge1xuXHRcdFx0XHRpZiAoIWNyZWF0aW9uUHJvbWlzZXMpIHsgdGhyb3cgRXJyb3IoJ3JlYWQgY2FsbGVkIGJlZm9yZSBjcmVhdGUnKTsgfVxuXHRcdFx0XHRhd2FpdCBjcmVhdGlvblByb21pc2VzO1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChiYXRjaC5tYXAoYXN5bmMgKGVudHJ5LCBpKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCB1c2VyZGF0YUZpbGVQcm92aWRlci5zdGF0KGVudHJ5LnJlc291cmNlKSkudHlwZSwgRmlsZVR5cGUuRmlsZSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShhd2FpdCB1c2VyZGF0YUZpbGVQcm92aWRlci5yZWFkRmlsZShlbnRyeS5yZXNvdXJjZSkpLCBlbnRyeS5jb250ZW50cyk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9O1xuXG5cdHRlc3QoJ2NyZWF0ZUZpbGUgLSBiYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0ZXIgPSBmaWxlQ3JlYXRlQmF0Y2hUZXN0ZXIoMjAsICdiYXRjaCcpO1xuXHRcdGF3YWl0IHRlc3Rlci5jcmVhdGUoKTtcblx0XHRhd2FpdCB0ZXN0ZXIuYXNzZXJ0Q29udGVudHNDb3JyZWN0KCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUZpbGUgLSBiYXRjaCAobWl4ZWQgcGFyYWxsZWwvc2VxdWVudGlhbCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmF0Y2gxID0gZmlsZUNyZWF0ZUJhdGNoVGVzdGVyKDEsICdiYXRjaDEnKTtcblx0XHRjb25zdCBiYXRjaDIgPSBmaWxlQ3JlYXRlQmF0Y2hUZXN0ZXIoMjAsICdiYXRjaDInKTtcblx0XHRjb25zdCBiYXRjaDMgPSBmaWxlQ3JlYXRlQmF0Y2hUZXN0ZXIoMSwgJ2JhdGNoMycpO1xuXHRcdGNvbnN0IGJhdGNoNCA9IGZpbGVDcmVhdGVCYXRjaFRlc3RlcigyMCwgJ2JhdGNoNCcpO1xuXG5cdFx0YmF0Y2gxLmNyZWF0ZSgpO1xuXHRcdGJhdGNoMi5jcmVhdGUoKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbYmF0Y2gxLmFzc2VydENvbnRlbnRzQ29ycmVjdCgpLCBiYXRjaDIuYXNzZXJ0Q29udGVudHNDb3JyZWN0KCldKTtcblx0XHRiYXRjaDMuY3JlYXRlKCk7XG5cdFx0YmF0Y2g0LmNyZWF0ZSgpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtiYXRjaDMuYXNzZXJ0Q29udGVudHNDb3JyZWN0KCksIGJhdGNoNC5hc3NlcnRDb250ZW50c0NvcnJlY3QoKV0pO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtiYXRjaDEuYXNzZXJ0Q29udGVudHNDb3JyZWN0KCksIGJhdGNoMi5hc3NlcnRDb250ZW50c0NvcnJlY3QoKV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5hbWUgbm90IGV4aXN0aW5nIHJlc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZSh1c2VyZGF0YVVSSUZyb21QYXRocyhbXSkpO1xuXHRcdGNvbnN0IHNvdXJjZUZpbGUgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICdzb3VyY2VGaWxlJyk7XG5cdFx0Y29uc3QgdGFyZ2V0RmlsZSA9IGpvaW5QYXRoKHBhcmVudC5yZXNvdXJjZSwgJ3RhcmdldEZpbGUnKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLm1vdmUoc291cmNlRmlsZSwgdGFyZ2V0RmlsZSwgZmFsc2UpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKCg8RmlsZVN5c3RlbVByb3ZpZGVyRXJyb3I+ZXJyb3IpLmNvZGUsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGFzc2VydC5mYWlsKCdUaGlzIHNob3VsZCBmYWlsIHdpdGggZXJyb3InKTtcblx0fSk7XG5cblx0dGVzdCgncmVuYW1lIHRvIGFuIGV4aXN0aW5nIGZpbGUgd2l0aG91dCBvdmVyd3JpdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSk7XG5cdFx0Y29uc3Qgc291cmNlRmlsZSA9IGpvaW5QYXRoKHBhcmVudC5yZXNvdXJjZSwgJ3NvdXJjZUZpbGUnKTtcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShzb3VyY2VGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdUaGlzIGlzIHNvdXJjZSBmaWxlJykpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0RmlsZSA9IGpvaW5QYXRoKHBhcmVudC5yZXNvdXJjZSwgJ3RhcmdldEZpbGUnKTtcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZSh0YXJnZXRGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdUaGlzIGlzIHRhcmdldCBmaWxlJykpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2UubW92ZShzb3VyY2VGaWxlLCB0YXJnZXRGaWxlLCBmYWxzZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKDxGaWxlT3BlcmF0aW9uRXJyb3I+ZXJyb3IpLmZpbGVPcGVyYXRpb25SZXN1bHQsIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT1ZFX0NPTkZMSUNUKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhc3NlcnQuZmFpbCgnVGhpcyBzaG91bGQgZmFpbCB3aXRoIGVycm9yJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmFtZSBmb2xkZXIgdG8gYW4gZXhpc3RpbmcgZm9sZGVyIHdpdGhvdXQgb3ZlcndyaXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZSh1c2VyZGF0YVVSSUZyb21QYXRocyhbXSkpO1xuXHRcdGNvbnN0IHNvdXJjZUZvbGRlciA9IGpvaW5QYXRoKHBhcmVudC5yZXNvdXJjZSwgJ3NvdXJjZUZvbGRlcicpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlRm9sZGVyKHNvdXJjZUZvbGRlcik7XG5cdFx0Y29uc3QgdGFyZ2V0Rm9sZGVyID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAndGFyZ2V0Rm9sZGVyJyk7XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVGb2xkZXIodGFyZ2V0Rm9sZGVyKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLm1vdmUoc291cmNlRm9sZGVyLCB0YXJnZXRGb2xkZXIsIGZhbHNlKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoPEZpbGVPcGVyYXRpb25FcnJvcj5lcnJvcikuZmlsZU9wZXJhdGlvblJlc3VsdCwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX01PVkVfQ09ORkxJQ1QpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGFzc2VydC5mYWlsKCdUaGlzIHNob3VsZCBmYWlsIHdpdGggY2Fubm90IG92ZXJ3cml0ZSBlcnJvcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5hbWUgZmlsZSB0byBhIGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUodXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKTtcblx0XHRjb25zdCBzb3VyY2VGaWxlID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAnc291cmNlRmlsZScpO1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHNvdXJjZUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ1RoaXMgaXMgc291cmNlIGZpbGUnKSk7XG5cblx0XHRjb25zdCB0YXJnZXRGb2xkZXIgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICd0YXJnZXRGb2xkZXInKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUZvbGRlcih0YXJnZXRGb2xkZXIpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlcnZpY2UubW92ZShzb3VyY2VGaWxlLCB0YXJnZXRGb2xkZXIsIGZhbHNlKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoPEZpbGVPcGVyYXRpb25FcnJvcj5lcnJvcikuZmlsZU9wZXJhdGlvblJlc3VsdCwgRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX01PVkVfQ09ORkxJQ1QpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGFzc2VydC5mYWlsKCdUaGlzIHNob3VsZCBmYWlsIHdpdGggZXJyb3InKTtcblx0fSk7XG5cblx0dGVzdCgncmVuYW1lIGZvbGRlciB0byBhIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSk7XG5cdFx0Y29uc3Qgc291cmNlRm9sZGVyID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAnc291cmNlRmlsZScpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlRm9sZGVyKHNvdXJjZUZvbGRlcik7XG5cblx0XHRjb25zdCB0YXJnZXRGaWxlID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAndGFyZ2V0RmlsZScpO1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHRhcmdldEZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ1RoaXMgaXMgdGFyZ2V0IGZpbGUnKSk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS5tb3ZlKHNvdXJjZUZvbGRlciwgdGFyZ2V0RmlsZSwgZmFsc2UpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKCg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0LCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9WRV9DT05GTElDVCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmZhaWwoJ1RoaXMgc2hvdWxkIGZhaWwgd2l0aCBlcnJvcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5hbWUgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUodXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKTtcblx0XHRjb25zdCBzb3VyY2VGaWxlID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAnc291cmNlRmlsZScpO1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHNvdXJjZUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ1RoaXMgaXMgc291cmNlIGZpbGUnKSk7XG5cblx0XHRjb25zdCB0YXJnZXRGaWxlID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAndGFyZ2V0RmlsZScpO1xuXHRcdGF3YWl0IHNlcnZpY2UubW92ZShzb3VyY2VGaWxlLCB0YXJnZXRGaWxlLCBmYWxzZSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgc2VydmljZS5yZWFkRmlsZSh0YXJnZXRGaWxlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHMoc291cmNlRmlsZSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudC52YWx1ZS50b1N0cmluZygpLCAnVGhpcyBpcyBzb3VyY2UgZmlsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5hbWUgdG8gYW4gZXhpc3RpbmcgZmlsZSB3aXRoIG92ZXJ3cml0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUodXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKTtcblx0XHRjb25zdCBzb3VyY2VGaWxlID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAnc291cmNlRmlsZScpO1xuXHRcdGNvbnN0IHRhcmdldEZpbGUgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICd0YXJnZXRGaWxlJyk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRzZXJ2aWNlLndyaXRlRmlsZShzb3VyY2VGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdUaGlzIGlzIHNvdXJjZSBmaWxlJykpLFxuXHRcdFx0c2VydmljZS53cml0ZUZpbGUodGFyZ2V0RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnVGhpcyBpcyB0YXJnZXQgZmlsZScpKVxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgc2VydmljZS5tb3ZlKHNvdXJjZUZpbGUsIHRhcmdldEZpbGUsIHRydWUpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHNlcnZpY2UucmVhZEZpbGUodGFyZ2V0RmlsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZXhpc3RzKHNvdXJjZUZpbGUpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgJ1RoaXMgaXMgc291cmNlIGZpbGUnKTtcblx0fSk7XG5cblx0dGVzdCgncmVuYW1lIGZvbGRlciB0byBhIG5ldyBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSk7XG5cdFx0Y29uc3Qgc291cmNlRm9sZGVyID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAnc291cmNlRm9sZGVyJyk7XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVGb2xkZXIoc291cmNlRm9sZGVyKTtcblxuXHRcdGNvbnN0IHRhcmdldEZvbGRlciA9IGpvaW5QYXRoKHBhcmVudC5yZXNvdXJjZSwgJ3RhcmdldEZvbGRlcicpO1xuXHRcdGF3YWl0IHNlcnZpY2UubW92ZShzb3VyY2VGb2xkZXIsIHRhcmdldEZvbGRlciwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyhzb3VyY2VGb2xkZXIpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyh0YXJnZXRGb2xkZXIpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVuYW1lIGZvbGRlciB0byBhbiBleGlzdGluZyBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSk7XG5cdFx0Y29uc3Qgc291cmNlRm9sZGVyID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAnc291cmNlRm9sZGVyJyk7XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVGb2xkZXIoc291cmNlRm9sZGVyKTtcblx0XHRjb25zdCB0YXJnZXRGb2xkZXIgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICd0YXJnZXRGb2xkZXInKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUZvbGRlcih0YXJnZXRGb2xkZXIpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5tb3ZlKHNvdXJjZUZvbGRlciwgdGFyZ2V0Rm9sZGVyLCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHMoc291cmNlRm9sZGVyKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHModGFyZ2V0Rm9sZGVyKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmFtZSBhIGZvbGRlciB0aGF0IGhhcyBtdWx0aXBsZSBmaWxlcyBhbmQgZm9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUodXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKTtcblxuXHRcdGNvbnN0IHNvdXJjZUZvbGRlciA9IGpvaW5QYXRoKHBhcmVudC5yZXNvdXJjZSwgJ3NvdXJjZUZvbGRlcicpO1xuXHRcdGNvbnN0IHNvdXJjZUZpbGUxID0gam9pblBhdGgoc291cmNlRm9sZGVyLCAnZm9sZGVyMScsICdmaWxlMScpO1xuXHRcdGNvbnN0IHNvdXJjZUZpbGUyID0gam9pblBhdGgoc291cmNlRm9sZGVyLCAnZm9sZGVyMicsICdmaWxlMScpO1xuXHRcdGNvbnN0IHNvdXJjZUVtcHR5Rm9sZGVyID0gam9pblBhdGgoc291cmNlRm9sZGVyLCAnZm9sZGVyMycpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0c2VydmljZS53cml0ZUZpbGUoc291cmNlRmlsZTEsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ1NvdXJjZSBGaWxlIDEnKSksXG5cdFx0XHRzZXJ2aWNlLndyaXRlRmlsZShzb3VyY2VGaWxlMiwgVlNCdWZmZXIuZnJvbVN0cmluZygnU291cmNlIEZpbGUgMicpKSxcblx0XHRcdHNlcnZpY2UuY3JlYXRlRm9sZGVyKHNvdXJjZUVtcHR5Rm9sZGVyKVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgdGFyZ2V0Rm9sZGVyID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAndGFyZ2V0Rm9sZGVyJyk7XG5cdFx0Y29uc3QgdGFyZ2V0RmlsZTEgPSBqb2luUGF0aCh0YXJnZXRGb2xkZXIsICdmb2xkZXIxJywgJ2ZpbGUxJyk7XG5cdFx0Y29uc3QgdGFyZ2V0RmlsZTIgPSBqb2luUGF0aCh0YXJnZXRGb2xkZXIsICdmb2xkZXIyJywgJ2ZpbGUxJyk7XG5cdFx0Y29uc3QgdGFyZ2V0RW1wdHlGb2xkZXIgPSBqb2luUGF0aCh0YXJnZXRGb2xkZXIsICdmb2xkZXIzJyk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLm1vdmUoc291cmNlRm9sZGVyLCB0YXJnZXRGb2xkZXIsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHMoc291cmNlRm9sZGVyKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHModGFyZ2V0Rm9sZGVyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHRhcmdldEZpbGUxKSkudmFsdWUudG9TdHJpbmcoKSwgJ1NvdXJjZSBGaWxlIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHNlcnZpY2UucmVhZEZpbGUodGFyZ2V0RmlsZTIpKS52YWx1ZS50b1N0cmluZygpLCAnU291cmNlIEZpbGUgMicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHModGFyZ2V0RW1wdHlGb2xkZXIpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVuYW1lIGEgZm9sZGVyIHRvIGFub3RoZXIgZm9sZGVyIHRoYXQgaGFzIHNvbWUgZmlsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSk7XG5cblx0XHRjb25zdCBzb3VyY2VGb2xkZXIgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICdzb3VyY2VGb2xkZXInKTtcblx0XHRjb25zdCBzb3VyY2VGaWxlMSA9IGpvaW5QYXRoKHNvdXJjZUZvbGRlciwgJ2ZvbGRlcjEnLCAnZmlsZTEnKTtcblxuXHRcdGNvbnN0IHRhcmdldEZvbGRlciA9IGpvaW5QYXRoKHBhcmVudC5yZXNvdXJjZSwgJ3RhcmdldEZvbGRlcicpO1xuXHRcdGNvbnN0IHRhcmdldEZpbGUxID0gam9pblBhdGgodGFyZ2V0Rm9sZGVyLCAnZm9sZGVyMScsICdmaWxlMScpO1xuXHRcdGNvbnN0IHRhcmdldEZpbGUyID0gam9pblBhdGgodGFyZ2V0Rm9sZGVyLCAnZm9sZGVyMScsICdmaWxlMicpO1xuXHRcdGNvbnN0IHRhcmdldEZpbGUzID0gam9pblBhdGgodGFyZ2V0Rm9sZGVyLCAnZm9sZGVyMicsICdmaWxlMScpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0c2VydmljZS53cml0ZUZpbGUoc291cmNlRmlsZTEsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ1NvdXJjZSBGaWxlIDEnKSksXG5cdFx0XHRzZXJ2aWNlLndyaXRlRmlsZSh0YXJnZXRGaWxlMiwgVlNCdWZmZXIuZnJvbVN0cmluZygnVGFyZ2V0IEZpbGUgMicpKSxcblx0XHRcdHNlcnZpY2Uud3JpdGVGaWxlKHRhcmdldEZpbGUzLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdUYXJnZXQgRmlsZSAzJykpXG5cdFx0XSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLm1vdmUoc291cmNlRm9sZGVyLCB0YXJnZXRGb2xkZXIsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyhzb3VyY2VGb2xkZXIpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyh0YXJnZXRGb2xkZXIpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHNlcnZpY2UucmVhZEZpbGUodGFyZ2V0RmlsZTEpKS52YWx1ZS50b1N0cmluZygpLCAnU291cmNlIEZpbGUgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyh0YXJnZXRGaWxlMiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHModGFyZ2V0RmlsZTMpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgaW5pdEZpeHR1cmVzKCk7XG5cblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0Y29uc3QgYW5vdGhlclJlc291cmNlID0gdXNlcmRhdGFVUklGcm9tUGF0aHMoWydmaXh0dXJlcycsICdzZXJ2aWNlJywgJ2RlZXAnLCAnY29tcGFueS5qcyddKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IHVzZXJkYXRhVVJJRnJvbVBhdGhzKFsnZml4dHVyZXMnLCAnc2VydmljZScsICdkZWVwJywgJ2NvbndheS5qcyddKTtcblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuY2FuRGVsZXRlKHNvdXJjZS5yZXNvdXJjZSwgeyB1c2VUcmFzaDogZmFsc2UgfSksIHRydWUpO1xuXHRcdGF3YWl0IHNlcnZpY2UuZGVsKHNvdXJjZS5yZXNvdXJjZSwgeyB1c2VUcmFzaDogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHMoc291cmNlLnJlc291cmNlKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyhhbm90aGVyUmVzb3VyY2UpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5vayhldmVudCEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEucmVzb3VyY2UucGF0aCwgcmVzb3VyY2UucGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5vcGVyYXRpb24sIEZpbGVPcGVyYXRpb24uREVMRVRFKTtcblxuXHRcdHtcblx0XHRcdGxldCBlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBzZXJ2aWNlLmRlbChzb3VyY2UucmVzb3VyY2UsIHsgdXNlVHJhc2g6IGZhbHNlIH0pO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRlcnJvciA9IGU7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5vayhlcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKDxGaWxlT3BlcmF0aW9uRXJyb3I+ZXJyb3IpLmZpbGVPcGVyYXRpb25SZXN1bHQsIEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpO1xuXHRcdH1cblx0XHRhd2FpdCByZWxvYWQoKTtcblx0XHR7XG5cdFx0XHRsZXQgZXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgc2VydmljZS5kZWwoc291cmNlLnJlc291cmNlLCB7IHVzZVRyYXNoOiBmYWxzZSB9KTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0ZXJyb3IgPSBlO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQub2soZXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0LCBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUZvbGRlciAocmVjdXJzaXZlKScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBpbml0Rml4dHVyZXMoKTtcblx0XHRsZXQgZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IGV2ZW50ID0gZSkpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB1c2VyZGF0YVVSSUZyb21QYXRocyhbJ2ZpeHR1cmVzJywgJ3NlcnZpY2UnLCAnZGVlcCddKTtcblx0XHRjb25zdCBzdWJSZXNvdXJjZTEgPSB1c2VyZGF0YVVSSUZyb21QYXRocyhbJ2ZpeHR1cmVzJywgJ3NlcnZpY2UnLCAnZGVlcCcsICdjb21wYW55LmpzJ10pO1xuXHRcdGNvbnN0IHN1YlJlc291cmNlMiA9IHVzZXJkYXRhVVJJRnJvbVBhdGhzKFsnZml4dHVyZXMnLCAnc2VydmljZScsICdkZWVwJywgJ2NvbndheS5qcyddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHMoc3ViUmVzb3VyY2UxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZXhpc3RzKHN1YlJlc291cmNlMiksIHRydWUpO1xuXG5cdFx0Y29uc3Qgc291cmNlID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHJlc291cmNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNhbkRlbGV0ZShzb3VyY2UucmVzb3VyY2UsIHsgcmVjdXJzaXZlOiB0cnVlLCB1c2VUcmFzaDogZmFsc2UgfSksIHRydWUpO1xuXHRcdGF3YWl0IHNlcnZpY2UuZGVsKHNvdXJjZS5yZXNvdXJjZSwgeyByZWN1cnNpdmU6IHRydWUsIHVzZVRyYXNoOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyhzb3VyY2UucmVzb3VyY2UpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZXhpc3RzKHN1YlJlc291cmNlMSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHMoc3ViUmVzb3VyY2UyKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5vayhldmVudCEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEucmVzb3VyY2UuZnNQYXRoLCByZXNvdXJjZS5mc1BhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEub3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uLkRFTEVURSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUZvbGRlciAobm9uIHJlY3Vyc2l2ZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgaW5pdEZpeHR1cmVzKCk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB1c2VyZGF0YVVSSUZyb21QYXRocyhbJ2ZpeHR1cmVzJywgJ3NlcnZpY2UnLCAnZGVlcCddKTtcblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0Lm9rKChhd2FpdCBzZXJ2aWNlLmNhbkRlbGV0ZShzb3VyY2UucmVzb3VyY2UpKSBpbnN0YW5jZW9mIEVycm9yKTtcblxuXHRcdGxldCBlcnJvcjtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS5kZWwoc291cmNlLnJlc291cmNlKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRlcnJvciA9IGU7XG5cdFx0fVxuXHRcdGFzc2VydC5vayhlcnJvcik7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSBlbXB0eSBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSk7XG5cdFx0Y29uc3QgZm9sZGVyID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAnZm9sZGVyJyk7XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVGb2xkZXIoZm9sZGVyKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuZGVsKGZvbGRlcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZXhpc3RzKGZvbGRlciksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIGVtcHR5IGZvbGRlciB3aXRoIHJlY2N1cnNpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSk7XG5cdFx0Y29uc3QgZm9sZGVyID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAnZm9sZGVyJyk7XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVGb2xkZXIoZm9sZGVyKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuZGVsKGZvbGRlciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZXhpc3RzKGZvbGRlciksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlRm9sZGVyIHdpdGggZm9sZGVycyBhbmQgZmlsZXMgKHJlY3Vyc2l2ZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSk7XG5cblx0XHRjb25zdCB0YXJnZXRGb2xkZXIgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICd0YXJnZXRGb2xkZXInKTtcblx0XHRjb25zdCBmaWxlMSA9IGpvaW5QYXRoKHRhcmdldEZvbGRlciwgJ2ZvbGRlcjEnLCAnZmlsZTEnKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUZpbGUoZmlsZTEpO1xuXHRcdGNvbnN0IGZpbGUyID0gam9pblBhdGgodGFyZ2V0Rm9sZGVyLCAnZm9sZGVyMicsICdmaWxlMScpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlRmlsZShmaWxlMik7XG5cdFx0Y29uc3QgZW1wdHlGb2xkZXIgPSBqb2luUGF0aCh0YXJnZXRGb2xkZXIsICdmb2xkZXIzJyk7XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVGb2xkZXIoZW1wdHlGb2xkZXIpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5kZWwodGFyZ2V0Rm9sZGVyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHModGFyZ2V0Rm9sZGVyKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHMoam9pblBhdGgodGFyZ2V0Rm9sZGVyLCAnZm9sZGVyMScpKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHMoam9pblBhdGgodGFyZ2V0Rm9sZGVyLCAnZm9sZGVyMicpKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5leGlzdHMoZmlsZTEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmV4aXN0cyhmaWxlMiksIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZXhpc3RzKGVtcHR5Rm9sZGVyKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgd2l0aCBhcHBlbmQgLSBleGlzdGluZyBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZSh1c2VyZGF0YVVSSUZyb21QYXRocyhbXSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAnYXBwZW5kVGVzdC50eHQnKTtcblxuXHRcdC8vIENyZWF0ZSBpbml0aWFsIGZpbGVcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnSGVsbG8gJykpO1xuXG5cdFx0Ly8gQXBwZW5kIHRvIGV4aXN0aW5nIGZpbGVcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnV29ybGQhJyksIHsgYXBwZW5kOiB0cnVlIH0pO1xuXG5cdFx0Ly8gVmVyaWZ5IGNvbnRlbnRcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgc2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgJ0hlbGxvIFdvcmxkIScpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgd2l0aCBhcHBlbmQgLSBub24tZXhpc3RlbnQgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUodXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IGpvaW5QYXRoKHBhcmVudC5yZXNvdXJjZSwgJ25ld0FwcGVuZFRlc3QudHh0Jyk7XG5cblx0XHQvLyBBcHBlbmQgdG8gbm9uLWV4aXN0ZW50IGZpbGUgKHNob3VsZCBjcmVhdGUgaXQpXG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ0ZpcnN0IGNvbnRlbnQnKSwgeyBhcHBlbmQ6IHRydWUgfSk7XG5cblx0XHQvLyBWZXJpZnkgY29udGVudFxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudC52YWx1ZS50b1N0cmluZygpLCAnRmlyc3QgY29udGVudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgd2l0aCBhcHBlbmQgLSBtdWx0aXBsZSBhcHBlbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZSh1c2VyZGF0YVVSSUZyb21QYXRocyhbXSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAnbXVsdGlBcHBlbmQudHh0Jyk7XG5cblx0XHQvLyBDcmVhdGUgYW5kIGFwcGVuZCBtdWx0aXBsZSB0aW1lc1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdMaW5lIDFcXG4nKSk7XG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ0xpbmUgMlxcbicpLCB7IGFwcGVuZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnTGluZSAzXFxuJyksIHsgYXBwZW5kOiB0cnVlIH0pO1xuXG5cdFx0Ly8gVmVyaWZ5IGNvbnRlbnRcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgc2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgJ0xpbmUgMVxcbkxpbmUgMlxcbkxpbmUgM1xcbicpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgd2l0aG91dCBhcHBlbmQgLSBvdmVyd3JpdGVzIGNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgc2VydmljZS5yZXNvbHZlKHVzZXJkYXRhVVJJRnJvbVBhdGhzKFtdKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBqb2luUGF0aChwYXJlbnQucmVzb3VyY2UsICdvdmVyd3JpdGVUZXN0LnR4dCcpO1xuXG5cdFx0Ly8gQ3JlYXRlIGluaXRpYWwgZmlsZVxuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdPcmlnaW5hbCBjb250ZW50JykpO1xuXG5cdFx0Ly8gV3JpdGUgd2l0aG91dCBhcHBlbmQgKHNob3VsZCBvdmVyd3JpdGUpXG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ05ldyBjb250ZW50JykpO1xuXG5cdFx0Ly8gVmVyaWZ5IGNvbnRlbnQgaXMgb3ZlcndyaXR0ZW5cblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgc2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgJ05ldyBjb250ZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSB3aXRoIGFwcGVuZCAtIGJpbmFyeSBjb250ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZSh1c2VyZGF0YVVSSUZyb21QYXRocyhbXSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gam9pblBhdGgocGFyZW50LnJlc291cmNlLCAnYmluYXJ5QXBwZW5kLmJpbicpO1xuXG5cdFx0Y29uc3QgZGF0YTEgPSBuZXcgVWludDhBcnJheShbMSwgMiwgMywgNCwgNV0pO1xuXHRcdGNvbnN0IGRhdGEyID0gbmV3IFVpbnQ4QXJyYXkoWzYsIDcsIDgsIDksIDEwXSk7XG5cblx0XHQvLyBDcmVhdGUgaW5pdGlhbCBmaWxlIHdpdGggYmluYXJ5IGRhdGFcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIud3JhcChkYXRhMSkpO1xuXG5cdFx0Ly8gQXBwZW5kIGJpbmFyeSBkYXRhXG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLndyYXAoZGF0YTIpLCB7IGFwcGVuZDogdHJ1ZSB9KTtcblxuXHRcdC8vIFZlcmlmeSBjb21iaW5lZCBjb250ZW50XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gbmV3IFVpbnQ4QXJyYXkoWzEsIDIsIDMsIDQsIDUsIDYsIDcsIDgsIDksIDEwXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQudmFsdWUuYnl0ZUxlbmd0aCwgZXhwZWN0ZWQuYnl0ZUxlbmd0aCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBleHBlY3RlZC5ieXRlTGVuZ3RoOyBpKyspIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LnZhbHVlLmJ1ZmZlcltpXSwgZXhwZWN0ZWRbaV0pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZXIgd3JpdGVGaWxlIHdpdGggYXBwZW5kIC0gZGlyZWN0IHByb3ZpZGVyIEFQSScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnQgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmUodXNlcmRhdGFVUklGcm9tUGF0aHMoW10pKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IGpvaW5QYXRoKHBhcmVudC5yZXNvdXJjZSwgJ3Byb3ZpZGVyQXBwZW5kLnR4dCcpO1xuXG5cdFx0Ly8gVXNlIHByb3ZpZGVyIGRpcmVjdGx5XG5cdFx0YXdhaXQgdXNlcmRhdGFGaWxlUHJvdmlkZXIud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdGaXJzdCAnKS5idWZmZXIsIHsgY3JlYXRlOiB0cnVlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cdFx0YXdhaXQgdXNlcmRhdGFGaWxlUHJvdmlkZXIud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdTZWNvbmQnKS5idWZmZXIsIHsgY3JlYXRlOiB0cnVlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UsIGFwcGVuZDogdHJ1ZSB9KTtcblxuXHRcdC8vIFZlcmlmeSBjb250ZW50XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHVzZXJkYXRhRmlsZVByb3ZpZGVyLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGNvbnRlbnQpLCAnRmlyc3QgU2Vjb25kJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxrQkFBa0IsZ0JBQWdCLGdCQUEwRDtBQUNyRyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxVQUFVLGdCQUFnQjtBQUNuQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxlQUF1RCxxQkFBOEMsNkJBQTZCLGdCQUFnQjtBQUMzSixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHNCQUFzQjtBQUUvQixXQUFXLCtCQUErQixXQUFZO0FBRXJELE1BQUk7QUFDSixNQUFJO0FBQ0osUUFBTSxVQUFVO0FBRWhCLFFBQU0sdUJBQXVCLENBQUMsVUFBNkIsU0FBUyxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsZ0JBQWdCLE1BQU0sUUFBUSxDQUFDLEdBQUcsR0FBRyxLQUFLO0FBRXpJLFFBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUV4QyxRQUFNLGVBQWUsWUFBWTtBQUNoQyxVQUFNLFFBQVE7QUFBQSxNQUNiO0FBQUEsUUFB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
