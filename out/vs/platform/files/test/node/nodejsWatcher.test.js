import * as fs from "fs";
import assert from "assert";
import { tmpdir } from "os";
import { basename, dirname, join } from "../../../../base/common/path.js";
import { Promises, RimRafMode } from "../../../../base/node/pfs.js";
import { getRandomTestPath } from "../../../../base/test/node/testUtils.js";
import { FileChangeFilter, FileChangeType } from "../../common/files.js";
import { watchFileContents } from "../../node/watcher/nodejs/nodejsWatcherLib.js";
import { isLinux, isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { getDriveLetter } from "../../../../base/common/extpath.js";
import { ltrim } from "../../../../base/common/strings.js";
import { DeferredPromise, timeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { NodeJSWatcher } from "../../node/watcher/nodejs/nodejsWatcher.js";
import { FileAccess } from "../../../../base/common/network.js";
import { extUriBiasedIgnorePathCase } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { addUNCHostToAllowlist } from "../../../../base/node/unc.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { TestParcelWatcher } from "./parcelWatcher.test.js";
suite.skip("File Watcher (node.js)", function() {
  this.timeout(1e4);
  class TestNodeJSWatcher extends NodeJSWatcher {
    constructor() {
      super(...arguments);
      this.suspendedWatchRequestPollingInterval = 100;
      this._onDidWatch = this._register(new Emitter());
      this.onDidWatch = this._onDidWatch.event;
      this.onWatchFail = this._onDidWatchFail.event;
    }
    getUpdateWatchersDelay() {
      return 0;
    }
    async doWatch(requests) {
      await super.doWatch(requests);
      for (const watcher2 of this.watchers) {
        await watcher2.instance.ready;
      }
      this._onDidWatch.fire();
    }
  }
  let testDir;
  let watcher;
  let loggingEnabled = false;
  function enableLogging(enable) {
    loggingEnabled = enable;
    watcher?.setVerboseLogging(enable);
  }
  enableLogging(loggingEnabled);
  setup(async () => {
    await createWatcher(void 0);
    testDir = URI.file(getRandomTestPath(fs.realpathSync(tmpdir()), "vsctests", "filewatcher")).fsPath;
    const sourceDir = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/service").fsPath;
    await Promises.copy(sourceDir, testDir, { preserveSymlinks: false });
  });
  async function createWatcher(accessor) {
    await watcher?.stop();
    watcher?.dispose();
    watcher = new TestNodeJSWatcher(accessor);
    watcher?.setVerboseLogging(loggingEnabled);
    watcher.onDidLogMessage((e) => {
      if (loggingEnabled) {
        console.log(`[non-recursive watcher test message] ${e.message}`);
      }
    });
    watcher.onDidError((e) => {
      if (loggingEnabled) {
        console.log(`[non-recursive watcher test error] ${e}`);
      }
    });
  }
  teardown(async () => {
    await watcher.stop();
    watcher.dispose();
    return Promises.rm(testDir).catch((error) => console.error(error));
  });
  function toMsg(type) {
    switch (type) {
      case FileChangeType.ADDED:
        return "added";
      case FileChangeType.DELETED:
        return "deleted";
      default:
        return "changed";
    }
  }
  async function awaitEvent(service, path, type, correlationId, expectedCount) {
    if (loggingEnabled) {
      console.log(`Awaiting change type '${toMsg(type)}' on file '${path}'`);
    }
    await new Promise((resolve) => {
      let counter = 0;
      const disposable = service.onDidChangeFile((events) => {
        for (const event of events) {
          if (extUriBiasedIgnorePathCase.isEqual(event.resource, URI.file(path)) && event.type === type && (correlationId === null || event.cId === correlationId)) {
            counter++;
            if (typeof expectedCount === "number" && counter < expectedCount) {
              continue;
            }
            disposable.dispose();
            resolve();
            break;
          }
        }
      });
    });
  }
  test("basics (folder watch)", async function() {
    const request = { path: testDir, excludes: [], recursive: false };
    await watcher.watch([request]);
    assert.strictEqual(watcher.isSuspended(request), false);
    const instance = Array.from(watcher.watchers)[0].instance;
    assert.strictEqual(instance.isReusingRecursiveWatcher, false);
    assert.strictEqual(instance.failed, false);
    const newFilePath = join(testDir, "newFile.txt");
    let changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newFilePath, "Hello World");
    await changeFuture;
    const newFolderPath = join(testDir, "New Folder");
    changeFuture = awaitEvent(watcher, newFolderPath, FileChangeType.ADDED);
    await fs.promises.mkdir(newFolderPath);
    await changeFuture;
    let renamedFilePath = join(testDir, "renamedFile.txt");
    changeFuture = Promise.all([
      awaitEvent(watcher, newFilePath, FileChangeType.DELETED),
      awaitEvent(watcher, renamedFilePath, FileChangeType.ADDED)
    ]);
    await Promises.rename(newFilePath, renamedFilePath);
    await changeFuture;
    let renamedFolderPath = join(testDir, "Renamed Folder");
    changeFuture = Promise.all([
      awaitEvent(watcher, newFolderPath, FileChangeType.DELETED),
      awaitEvent(watcher, renamedFolderPath, FileChangeType.ADDED)
    ]);
    await Promises.rename(newFolderPath, renamedFolderPath);
    await changeFuture;
    const caseRenamedFilePath = join(testDir, "RenamedFile.txt");
    changeFuture = Promise.all([
      awaitEvent(watcher, renamedFilePath, FileChangeType.DELETED),
      awaitEvent(watcher, caseRenamedFilePath, FileChangeType.ADDED)
    ]);
    await Promises.rename(renamedFilePath, caseRenamedFilePath);
    await changeFuture;
    renamedFilePath = caseRenamedFilePath;
    const caseRenamedFolderPath = join(testDir, "REnamed Folder");
    changeFuture = Promise.all([
      awaitEvent(watcher, renamedFolderPath, FileChangeType.DELETED),
      awaitEvent(watcher, caseRenamedFolderPath, FileChangeType.ADDED)
    ]);
    await Promises.rename(renamedFolderPath, caseRenamedFolderPath);
    await changeFuture;
    renamedFolderPath = caseRenamedFolderPath;
    const movedFilepath = join(testDir, "movedFile.txt");
    changeFuture = Promise.all([
      awaitEvent(watcher, renamedFilePath, FileChangeType.DELETED),
      awaitEvent(watcher, movedFilepath, FileChangeType.ADDED)
    ]);
    await Promises.rename(renamedFilePath, movedFilepath);
    await changeFuture;
    const movedFolderpath = join(testDir, "Moved Folder");
    changeFuture = Promise.all([
      awaitEvent(watcher, renamedFolderPath, FileChangeType.DELETED),
      awaitEvent(watcher, movedFolderpath, FileChangeType.ADDED)
    ]);
    await Promises.rename(renamedFolderPath, movedFolderpath);
    await changeFuture;
    const copiedFilepath = join(testDir, "copiedFile.txt");
    changeFuture = awaitEvent(watcher, copiedFilepath, FileChangeType.ADDED);
    await fs.promises.copyFile(movedFilepath, copiedFilepath);
    await changeFuture;
    const copiedFolderpath = join(testDir, "Copied Folder");
    changeFuture = awaitEvent(watcher, copiedFolderpath, FileChangeType.ADDED);
    await Promises.copy(movedFolderpath, copiedFolderpath, { preserveSymlinks: false });
    await changeFuture;
    changeFuture = awaitEvent(watcher, copiedFilepath, FileChangeType.UPDATED);
    await Promises.writeFile(copiedFilepath, "Hello Change");
    await changeFuture;
    const anotherNewFilePath = join(testDir, "anotherNewFile.txt");
    changeFuture = awaitEvent(watcher, anotherNewFilePath, FileChangeType.ADDED);
    await Promises.writeFile(anotherNewFilePath, "Hello Another World");
    await changeFuture;
    changeFuture = awaitEvent(watcher, copiedFilepath, FileChangeType.DELETED);
    await fs.promises.unlink(copiedFilepath);
    await changeFuture;
    changeFuture = awaitEvent(watcher, copiedFolderpath, FileChangeType.DELETED);
    await fs.promises.rmdir(copiedFolderpath);
    await changeFuture;
    watcher.dispose();
  });
  test("basics (file watch)", async function() {
    const filePath = join(testDir, "lorem.txt");
    const request = { path: filePath, excludes: [], recursive: false };
    await watcher.watch([request]);
    assert.strictEqual(watcher.isSuspended(request), false);
    const instance = Array.from(watcher.watchers)[0].instance;
    assert.strictEqual(instance.isReusingRecursiveWatcher, false);
    assert.strictEqual(instance.failed, false);
    let changeFuture = awaitEvent(watcher, filePath, FileChangeType.UPDATED);
    await Promises.writeFile(filePath, "Hello Change");
    await changeFuture;
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED);
    await fs.promises.unlink(filePath);
    await changeFuture;
    await Promises.writeFile(filePath, "Hello Change");
    await watcher.watch([]);
    await watcher.watch([{ path: filePath, excludes: [], recursive: false }]);
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED);
    await Promises.rename(filePath, `${filePath}-moved`);
    await changeFuture;
  });
  test("atomic writes (folder watch)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], recursive: false }]);
    const newFilePath = join(testDir, "lorem.txt");
    const changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.UPDATED);
    await fs.promises.unlink(newFilePath);
    Promises.writeFile(newFilePath, "Hello Atomic World");
    await changeFuture;
  });
  test("atomic writes (file watch)", async function() {
    const filePath = join(testDir, "lorem.txt");
    await watcher.watch([{ path: filePath, excludes: [], recursive: false }]);
    const newFilePath = join(filePath);
    const changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.UPDATED);
    await fs.promises.unlink(newFilePath);
    Promises.writeFile(newFilePath, "Hello Atomic World");
    await changeFuture;
  });
  test("multiple events (folder watch)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], recursive: false }]);
    const newFilePath1 = join(testDir, "newFile-1.txt");
    const newFilePath2 = join(testDir, "newFile-2.txt");
    const newFilePath3 = join(testDir, "newFile-3.txt");
    const addedFuture1 = awaitEvent(watcher, newFilePath1, FileChangeType.ADDED);
    const addedFuture2 = awaitEvent(watcher, newFilePath2, FileChangeType.ADDED);
    const addedFuture3 = awaitEvent(watcher, newFilePath3, FileChangeType.ADDED);
    await Promise.all([
      await Promises.writeFile(newFilePath1, "Hello World 1"),
      await Promises.writeFile(newFilePath2, "Hello World 2"),
      await Promises.writeFile(newFilePath3, "Hello World 3")
    ]);
    await Promise.all([addedFuture1, addedFuture2, addedFuture3]);
    const changeFuture1 = awaitEvent(watcher, newFilePath1, FileChangeType.UPDATED);
    const changeFuture2 = awaitEvent(watcher, newFilePath2, FileChangeType.UPDATED);
    const changeFuture3 = awaitEvent(watcher, newFilePath3, FileChangeType.UPDATED);
    await Promise.all([
      await Promises.writeFile(newFilePath1, "Hello Update 1"),
      await Promises.writeFile(newFilePath2, "Hello Update 2"),
      await Promises.writeFile(newFilePath3, "Hello Update 3")
    ]);
    await Promise.all([changeFuture1, changeFuture2, changeFuture3]);
    const copyFuture1 = awaitEvent(watcher, join(testDir, "newFile-1-copy.txt"), FileChangeType.ADDED);
    const copyFuture2 = awaitEvent(watcher, join(testDir, "newFile-2-copy.txt"), FileChangeType.ADDED);
    const copyFuture3 = awaitEvent(watcher, join(testDir, "newFile-3-copy.txt"), FileChangeType.ADDED);
    await Promise.all([
      Promises.copy(join(testDir, "newFile-1.txt"), join(testDir, "newFile-1-copy.txt"), { preserveSymlinks: false }),
      Promises.copy(join(testDir, "newFile-2.txt"), join(testDir, "newFile-2-copy.txt"), { preserveSymlinks: false }),
      Promises.copy(join(testDir, "newFile-3.txt"), join(testDir, "newFile-3-copy.txt"), { preserveSymlinks: false })
    ]);
    await Promise.all([copyFuture1, copyFuture2, copyFuture3]);
    const deleteFuture1 = awaitEvent(watcher, newFilePath1, FileChangeType.DELETED);
    const deleteFuture2 = awaitEvent(watcher, newFilePath2, FileChangeType.DELETED);
    const deleteFuture3 = awaitEvent(watcher, newFilePath3, FileChangeType.DELETED);
    await Promise.all([
      await fs.promises.unlink(newFilePath1),
      await fs.promises.unlink(newFilePath2),
      await fs.promises.unlink(newFilePath3)
    ]);
    await Promise.all([deleteFuture1, deleteFuture2, deleteFuture3]);
  });
  test("multiple events (file watch)", async function() {
    const filePath = join(testDir, "lorem.txt");
    await watcher.watch([{ path: filePath, excludes: [], recursive: false }]);
    const changeFuture1 = awaitEvent(watcher, filePath, FileChangeType.UPDATED);
    await Promise.all([
      await Promises.writeFile(filePath, "Hello Update 1"),
      await Promises.writeFile(filePath, "Hello Update 2"),
      await Promises.writeFile(filePath, "Hello Update 3")
    ]);
    await Promise.all([changeFuture1]);
  });
  test("excludes can be updated (folder watch)", async function() {
    await watcher.watch([{ path: testDir, excludes: ["**"], recursive: false }]);
    await watcher.watch([{ path: testDir, excludes: [], recursive: false }]);
    return basicCrudTest(join(testDir, "files-excludes.txt"));
  });
  test("excludes are ignored (file watch)", async function() {
    const filePath = join(testDir, "lorem.txt");
    await watcher.watch([{ path: filePath, excludes: ["**"], recursive: false }]);
    return basicCrudTest(filePath, true);
  });
  test("includes can be updated (folder watch)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: ["nothing"], recursive: false }]);
    await watcher.watch([{ path: testDir, excludes: [], recursive: false }]);
    return basicCrudTest(join(testDir, "files-includes.txt"));
  });
  test("non-includes are ignored (file watch)", async function() {
    const filePath = join(testDir, "lorem.txt");
    await watcher.watch([{ path: filePath, excludes: [], includes: ["nothing"], recursive: false }]);
    return basicCrudTest(filePath, true);
  });
  test("includes are supported (folder watch)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: ["**/files-includes.txt"], recursive: false }]);
    return basicCrudTest(join(testDir, "files-includes.txt"));
  });
  test("includes are supported (folder watch, relative pattern explicit)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: [{ base: testDir, pattern: "files-includes.txt" }], recursive: false }]);
    return basicCrudTest(join(testDir, "files-includes.txt"));
  });
  test("includes are supported (folder watch, relative pattern implicit)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: ["files-includes.txt"], recursive: false }]);
    return basicCrudTest(join(testDir, "files-includes.txt"));
  });
  test("correlationId is supported", async function() {
    const correlationId = Math.random();
    await watcher.watch([{ correlationId, path: testDir, excludes: [], recursive: false }]);
    return basicCrudTest(join(testDir, "newFile.txt"), void 0, correlationId);
  });
  (isWindows ? test.skip : test)("symlink support (folder watch)", async function() {
    const link = join(testDir, "deep-linked");
    const linkTarget = join(testDir, "deep");
    await fs.promises.symlink(linkTarget, link);
    await watcher.watch([{ path: link, excludes: [], recursive: false }]);
    return basicCrudTest(join(link, "newFile.txt"));
  });
  async function basicCrudTest(filePath, skipAdd, correlationId, expectedCount, awaitWatchAfterAdd) {
    let changeFuture;
    if (!skipAdd) {
      changeFuture = awaitEvent(watcher, filePath, FileChangeType.ADDED, correlationId, expectedCount);
      await Promises.writeFile(filePath, "Hello World");
      await changeFuture;
      if (awaitWatchAfterAdd) {
        await Event.toPromise(watcher.onDidWatch);
      }
    }
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.UPDATED, correlationId, expectedCount);
    await Promises.writeFile(filePath, "Hello Change");
    await changeFuture;
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED, correlationId, expectedCount);
    await fs.promises.unlink(await Promises.realpath(filePath));
    await changeFuture;
  }
  (isWindows ? test.skip : test)("symlink support (file watch)", async function() {
    const link = join(testDir, "lorem.txt-linked");
    const linkTarget = join(testDir, "lorem.txt");
    await fs.promises.symlink(linkTarget, link);
    await watcher.watch([{ path: link, excludes: [], recursive: false }]);
    return basicCrudTest(link, true);
  });
  (!isWindows ? test.skip : test)("unc support (folder watch)", async function() {
    addUNCHostToAllowlist("localhost");
    const uncPath = `\\\\localhost\\${getDriveLetter(testDir)?.toLowerCase()}$\\${ltrim(testDir.substr(testDir.indexOf(":") + 1), "\\")}`;
    await watcher.watch([{ path: uncPath, excludes: [], recursive: false }]);
    return basicCrudTest(join(uncPath, "newFile.txt"));
  });
  (!isWindows ? test.skip : test)("unc support (file watch)", async function() {
    addUNCHostToAllowlist("localhost");
    const uncPath = `\\\\localhost\\${getDriveLetter(testDir)?.toLowerCase()}$\\${ltrim(testDir.substr(testDir.indexOf(":") + 1), "\\")}\\lorem.txt`;
    await watcher.watch([{ path: uncPath, excludes: [], recursive: false }]);
    return basicCrudTest(uncPath, true);
  });
  (isLinux ? test.skip : test)("wrong casing (folder watch)", async function() {
    const wrongCase = join(dirname(testDir), basename(testDir).toUpperCase());
    await watcher.watch([{ path: wrongCase, excludes: [], recursive: false }]);
    return basicCrudTest(join(wrongCase, "newFile.txt"));
  });
  (isLinux ? test.skip : test)("wrong casing (file watch)", async function() {
    const filePath = join(testDir, "LOREM.txt");
    await watcher.watch([{ path: filePath, excludes: [], recursive: false }]);
    return basicCrudTest(filePath, true);
  });
  test("invalid path does not explode", async function() {
    const invalidPath = join(testDir, "invalid");
    await watcher.watch([{ path: invalidPath, excludes: [], recursive: false }]);
  });
  test("watchFileContents", async function() {
    const watchedPath = join(testDir, "lorem.txt");
    const cts = new CancellationTokenSource();
    const readyPromise = new DeferredPromise();
    const chunkPromise = new DeferredPromise();
    const watchPromise = watchFileContents(watchedPath, () => chunkPromise.complete(), () => readyPromise.complete(), cts.token);
    await readyPromise.p;
    Promises.writeFile(watchedPath, "Hello World");
    await chunkPromise.p;
    cts.cancel();
    return watchPromise;
  });
  test("watching same or overlapping paths supported when correlation is applied", async function() {
    await watcher.watch([
      { path: testDir, excludes: [], recursive: false, correlationId: 1 }
    ]);
    await basicCrudTest(join(testDir, "newFile_1.txt"), void 0, null, 1);
    await watcher.watch([
      { path: testDir, excludes: [], recursive: false, correlationId: 1 },
      { path: testDir, excludes: [], recursive: false, correlationId: 2 },
      { path: testDir, excludes: [], recursive: false, correlationId: void 0 }
    ]);
    await basicCrudTest(join(testDir, "newFile_2.txt"), void 0, null, 3);
    await basicCrudTest(join(testDir, "otherNewFile.txt"), void 0, null, 3);
  });
  test("watching missing path emits watcher fail event", async function() {
    const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    const folderPath = join(testDir, "missing");
    watcher.watch([{ path: folderPath, excludes: [], recursive: true }]);
    await onDidWatchFail;
  });
  test("deleting watched path emits watcher fail and delete event when correlated (file watch)", async function() {
    const filePath = join(testDir, "lorem.txt");
    await watcher.watch([{ path: filePath, excludes: [], recursive: false, correlationId: 1 }]);
    const instance = Array.from(watcher.watchers)[0].instance;
    const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    const changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED, 1);
    fs.promises.unlink(filePath);
    await onDidWatchFail;
    await changeFuture;
    assert.strictEqual(instance.failed, true);
  });
  (isMacintosh || isWindows ? test.skip : test)("deleting watched path emits watcher fail and delete event when correlated (folder watch)", async function() {
    const folderPath = join(testDir, "deep");
    await watcher.watch([{ path: folderPath, excludes: [], recursive: false, correlationId: 1 }]);
    const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    const changeFuture = awaitEvent(watcher, folderPath, FileChangeType.DELETED, 1);
    Promises.rm(folderPath, RimRafMode.UNLINK);
    await onDidWatchFail;
    await changeFuture;
  });
  test("watch requests support suspend/resume (file, does not exist in beginning)", async function() {
    const filePath = join(testDir, "not-found.txt");
    const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    const request = { path: filePath, excludes: [], recursive: false };
    await watcher.watch([request]);
    await onDidWatchFail;
    assert.strictEqual(watcher.isSuspended(request), "polling");
    await basicCrudTest(filePath, void 0, null, void 0, true);
    await basicCrudTest(filePath, void 0, null, void 0, true);
  });
  test("watch requests support suspend/resume (file, exists in beginning)", async function() {
    const filePath = join(testDir, "lorem.txt");
    const request = { path: filePath, excludes: [], recursive: false };
    await watcher.watch([request]);
    const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    await basicCrudTest(filePath, true);
    await onDidWatchFail;
    assert.strictEqual(watcher.isSuspended(request), "polling");
    await basicCrudTest(filePath, void 0, null, void 0, true);
  });
  (isWindows ? test.skip : test)("watch requests support suspend/resume (folder, does not exist in beginning)", async function() {
    let onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    const folderPath = join(testDir, "not-found");
    const request = { path: folderPath, excludes: [], recursive: false };
    await watcher.watch([request]);
    await onDidWatchFail;
    assert.strictEqual(watcher.isSuspended(request), "polling");
    let changeFuture = awaitEvent(watcher, folderPath, FileChangeType.ADDED);
    let onDidWatch = Event.toPromise(watcher.onDidWatch);
    await fs.promises.mkdir(folderPath);
    await changeFuture;
    await onDidWatch;
    assert.strictEqual(watcher.isSuspended(request), false);
    if (isWindows) {
      const filePath = join(folderPath, "newFile.txt");
      await basicCrudTest(filePath);
      onDidWatchFail = Event.toPromise(watcher.onWatchFail);
      await fs.promises.rmdir(folderPath);
      await onDidWatchFail;
      changeFuture = awaitEvent(watcher, folderPath, FileChangeType.ADDED);
      onDidWatch = Event.toPromise(watcher.onDidWatch);
      await fs.promises.mkdir(folderPath);
      await changeFuture;
      await onDidWatch;
      await timeout(500);
      await basicCrudTest(filePath);
    }
  });
  (isMacintosh ? test.skip : test)("watch requests support suspend/resume (folder, exists in beginning)", async function() {
    const folderPath = join(testDir, "deep");
    await watcher.watch([{ path: folderPath, excludes: [], recursive: false }]);
    const filePath = join(folderPath, "newFile.txt");
    await basicCrudTest(filePath);
    const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    await Promises.rm(folderPath);
    await onDidWatchFail;
    const changeFuture = awaitEvent(watcher, folderPath, FileChangeType.ADDED);
    const onDidWatch = Event.toPromise(watcher.onDidWatch);
    await fs.promises.mkdir(folderPath);
    await changeFuture;
    await onDidWatch;
    await timeout(500);
    await basicCrudTest(filePath);
  });
  test("parcel watcher reused when present for non-recursive file watching (uncorrelated)", function() {
    return testParcelWatcherReused(void 0);
  });
  test("parcel watcher reused when present for non-recursive file watching (correlated)", function() {
    return testParcelWatcherReused(2);
  });
  function createParcelWatcher() {
    const recursiveWatcher = new TestParcelWatcher();
    recursiveWatcher.setVerboseLogging(loggingEnabled);
    recursiveWatcher.onDidLogMessage((e) => {
      if (loggingEnabled) {
        console.log(`[recursive watcher test message] ${e.message}`);
      }
    });
    recursiveWatcher.onDidError((e) => {
      if (loggingEnabled) {
        console.log(`[recursive watcher test error] ${e.error}`);
      }
    });
    return recursiveWatcher;
  }
  async function testParcelWatcherReused(correlationId) {
    const recursiveWatcher = createParcelWatcher();
    await recursiveWatcher.watch([{ path: testDir, excludes: [], recursive: true, correlationId: 1 }]);
    const recursiveInstance = Array.from(recursiveWatcher.watchers)[0];
    assert.strictEqual(recursiveInstance.subscriptionsCount, 0);
    await createWatcher(recursiveWatcher);
    const filePath = join(testDir, "deep", "conway.js");
    await watcher.watch([{ path: filePath, excludes: [], recursive: false, correlationId }]);
    const { instance } = Array.from(watcher.watchers)[0];
    assert.strictEqual(instance.isReusingRecursiveWatcher, true);
    assert.strictEqual(recursiveInstance.subscriptionsCount, 1);
    let changeFuture = awaitEvent(watcher, filePath, isMacintosh ? FileChangeType.ADDED : FileChangeType.UPDATED, correlationId);
    await Promises.writeFile(filePath, "Hello World");
    await changeFuture;
    await recursiveWatcher.stop();
    recursiveWatcher.dispose();
    await timeout(500);
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.UPDATED, correlationId);
    await Promises.writeFile(filePath, "Hello World");
    await changeFuture;
    assert.strictEqual(instance.isReusingRecursiveWatcher, false);
  }
  test("watch requests support suspend/resume (file, does not exist in beginning, parcel watcher reused)", async function() {
    const recursiveWatcher = createParcelWatcher();
    await recursiveWatcher.watch([{ path: testDir, excludes: [], recursive: true }]);
    await createWatcher(recursiveWatcher);
    const filePath = join(testDir, "not-found-2.txt");
    const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    const request = { path: filePath, excludes: [], recursive: false };
    await watcher.watch([request]);
    await onDidWatchFail;
    assert.strictEqual(watcher.isSuspended(request), true);
    const changeFuture = awaitEvent(watcher, filePath, FileChangeType.ADDED);
    await Promises.writeFile(filePath, "Hello World");
    await changeFuture;
    assert.strictEqual(watcher.isSuspended(request), false);
  });
  test("event type filter (file watch)", async function() {
    const filePath = join(testDir, "lorem.txt");
    const request = { path: filePath, excludes: [], recursive: false, filter: FileChangeFilter.UPDATED | FileChangeFilter.DELETED, correlationId: 1 };
    await watcher.watch([request]);
    let changeFuture = awaitEvent(watcher, filePath, FileChangeType.UPDATED, 1);
    await Promises.writeFile(filePath, "Hello Change");
    await changeFuture;
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED, 1);
    await fs.promises.unlink(filePath);
    await changeFuture;
  });
  test("event type filter (folder watch)", async function() {
    const request = { path: testDir, excludes: [], recursive: false, filter: FileChangeFilter.UPDATED | FileChangeFilter.DELETED, correlationId: 1 };
    await watcher.watch([request]);
    const filePath = join(testDir, "lorem.txt");
    let changeFuture = awaitEvent(watcher, filePath, FileChangeType.UPDATED, 1);
    await Promises.writeFile(filePath, "Hello Change");
    await changeFuture;
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED, 1);
    await fs.promises.unlink(filePath);
    await changeFuture;
  });
  (isLinux ? test.skip : test)("includes are case insensitive on Windows/Mac", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: ["*.TXT"], recursive: false }]);
    return basicCrudTest(join(testDir, "newFile.txt"));
  });
  (isLinux ? test.skip : test)("excludes are case insensitive on Windows/Mac", async function() {
    await watcher.watch([{ path: testDir, excludes: ["*.TXT"], recursive: false }]);
    const newFilePath = join(testDir, "newFile.txt");
    const changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newFilePath, "Hello World");
    const res = await Promise.any([
      timeout(500).then(() => true),
      changeFuture.then(() => false)
    ]);
    if (!res) {
      assert.fail("Unexpected change event");
    }
  });
  (isLinux ? test.skip : test)("excludes are case insensitive on Windows/Mac", async function() {
    await watcher.watch([{ path: testDir, excludes: ["*.TXT"], recursive: false }]);
    const newFilePath = join(testDir, "newFile.txt");
    const changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newFilePath, "Hello World");
    const res = await Promise.any([
      timeout(500).then(() => true),
      changeFuture.then(() => false)
    ]);
    if (!res) {
      assert.fail("Unexpected change event");
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3Qvbm9kZS9ub2RlanNXYXRjaGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSwgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMsIFJpbVJhZk1vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IGdldFJhbmRvbVRlc3RQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L25vZGUvdGVzdFV0aWxzLmpzJztcbmltcG9ydCB7IEZpbGVDaGFuZ2VGaWx0ZXIsIEZpbGVDaGFuZ2VUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElOb25SZWN1cnNpdmVXYXRjaFJlcXVlc3QsIElSZWN1cnNpdmVXYXRjaGVyV2l0aFN1YnNjcmliZSB9IGZyb20gJy4uLy4uL2NvbW1vbi93YXRjaGVyLmpzJztcbmltcG9ydCB7IHdhdGNoRmlsZUNvbnRlbnRzIH0gZnJvbSAnLi4vLi4vbm9kZS93YXRjaGVyL25vZGVqcy9ub2RlanNXYXRjaGVyTGliLmpzJztcbmltcG9ydCB7IGlzTGludXgsIGlzTWFjaW50b3NoLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBnZXREcml2ZUxldHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgbHRyaW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IE5vZGVKU1dhdGNoZXIgfSBmcm9tICcuLi8uLi9ub2RlL3dhdGNoZXIvbm9kZWpzL25vZGVqc1dhdGNoZXIuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGFkZFVOQ0hvc3RUb0FsbG93bGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2Uvbm9kZS91bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBUZXN0UGFyY2VsV2F0Y2hlciB9IGZyb20gJy4vcGFyY2VsV2F0Y2hlci50ZXN0LmpzJztcblxuLy8gdGhpcyBzdWl0ZSBoYXMgc2hvd24gZmxha3kgcnVucyBpbiBBenVyZSBwaXBlbGluZXMgd2hlcmVcbi8vIHRhc2tzIHdvdWxkIGp1c3QgaGFuZyBhbmQgdGltZW91dCBhZnRlciBhIHdoaWxlIChub3QgaW5cbi8vIG1vY2hhIGJ1dCBnZW5lcmFsbHkpLiBhcyBzdWNoIHRoZXkgd2lsbCBydW4gb25seSBvbiBkZW1hbmRcbi8vIHdoZW5ldmVyIHdlIHVwZGF0ZSB0aGUgd2F0Y2hlciBsaWJyYXJ5LlxuXG5zdWl0ZS5za2lwKCdGaWxlIFdhdGNoZXIgKG5vZGUuanMpJywgZnVuY3Rpb24gKCkge1xuXG5cdHRoaXMudGltZW91dCgxMDAwMCk7XG5cblx0Y2xhc3MgVGVzdE5vZGVKU1dhdGNoZXIgZXh0ZW5kcyBOb2RlSlNXYXRjaGVyIHtcblxuXHRcdHByb3RlY3RlZCBvdmVycmlkZSByZWFkb25seSBzdXNwZW5kZWRXYXRjaFJlcXVlc3RQb2xsaW5nSW50ZXJ2YWwgPSAxMDA7XG5cblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFdhdGNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0cmVhZG9ubHkgb25EaWRXYXRjaCA9IHRoaXMuX29uRGlkV2F0Y2guZXZlbnQ7XG5cblx0XHRyZWFkb25seSBvbldhdGNoRmFpbCA9IHRoaXMuX29uRGlkV2F0Y2hGYWlsLmV2ZW50O1xuXG5cdFx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFVwZGF0ZVdhdGNoZXJzRGVsYXkoKTogbnVtYmVyIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBkb1dhdGNoKHJlcXVlc3RzOiBJTm9uUmVjdXJzaXZlV2F0Y2hSZXF1ZXN0W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGF3YWl0IHN1cGVyLmRvV2F0Y2gocmVxdWVzdHMpO1xuXHRcdFx0Zm9yIChjb25zdCB3YXRjaGVyIG9mIHRoaXMud2F0Y2hlcnMpIHtcblx0XHRcdFx0YXdhaXQgd2F0Y2hlci5pbnN0YW5jZS5yZWFkeTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fb25EaWRXYXRjaC5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0bGV0IHRlc3REaXI6IHN0cmluZztcblx0bGV0IHdhdGNoZXI6IFRlc3ROb2RlSlNXYXRjaGVyO1xuXG5cdGxldCBsb2dnaW5nRW5hYmxlZCA9IGZhbHNlO1xuXG5cdGZ1bmN0aW9uIGVuYWJsZUxvZ2dpbmcoZW5hYmxlOiBib29sZWFuKSB7XG5cdFx0bG9nZ2luZ0VuYWJsZWQgPSBlbmFibGU7XG5cdFx0d2F0Y2hlcj8uc2V0VmVyYm9zZUxvZ2dpbmcoZW5hYmxlKTtcblx0fVxuXG5cdGVuYWJsZUxvZ2dpbmcobG9nZ2luZ0VuYWJsZWQpO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjcmVhdGVXYXRjaGVyKHVuZGVmaW5lZCk7XG5cblx0XHQvLyBSdWxlIG91dCBzdHJhbmdlIHRlc3RpbmcgY29uZGl0aW9ucyBieSB1c2luZyB0aGUgcmVhbHBhdGhcblx0XHQvLyBoZXJlLiBmb3IgZXhhbXBsZSwgb24gbWFjT1MgdGhlIHRtcCBkaXIgaXMgcG90ZW50aWFsbHkgYVxuXHRcdC8vIHN5bWxpbmsgaW4gc29tZSBvZiB0aGUgcm9vdCBmb2xkZXJzLCB3aGljaCBpcyBhIHJhdGhlclxuXHRcdC8vIHVucmVhbGlzaWMgY2FzZSBmb3IgdGhlIGZpbGUgd2F0Y2hlci5cblx0XHR0ZXN0RGlyID0gVVJJLmZpbGUoZ2V0UmFuZG9tVGVzdFBhdGgoZnMucmVhbHBhdGhTeW5jKHRtcGRpcigpKSwgJ3ZzY3Rlc3RzJywgJ2ZpbGV3YXRjaGVyJykpLmZzUGF0aDtcblxuXHRcdGNvbnN0IHNvdXJjZURpciA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy9wbGF0Zm9ybS9maWxlcy90ZXN0L25vZGUvZml4dHVyZXMvc2VydmljZScpLmZzUGF0aDtcblxuXHRcdGF3YWl0IFByb21pc2VzLmNvcHkoc291cmNlRGlyLCB0ZXN0RGlyLCB7IHByZXNlcnZlU3ltbGlua3M6IGZhbHNlIH0pO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVXYXRjaGVyKGFjY2Vzc29yOiBJUmVjdXJzaXZlV2F0Y2hlcldpdGhTdWJzY3JpYmUgfCB1bmRlZmluZWQpIHtcblx0XHRhd2FpdCB3YXRjaGVyPy5zdG9wKCk7XG5cdFx0d2F0Y2hlcj8uZGlzcG9zZSgpO1xuXG5cdFx0d2F0Y2hlciA9IG5ldyBUZXN0Tm9kZUpTV2F0Y2hlcihhY2Nlc3Nvcik7XG5cdFx0d2F0Y2hlcj8uc2V0VmVyYm9zZUxvZ2dpbmcobG9nZ2luZ0VuYWJsZWQpO1xuXG5cdFx0d2F0Y2hlci5vbkRpZExvZ01lc3NhZ2UoZSA9PiB7XG5cdFx0XHRpZiAobG9nZ2luZ0VuYWJsZWQpIHtcblx0XHRcdFx0Y29uc29sZS5sb2coYFtub24tcmVjdXJzaXZlIHdhdGNoZXIgdGVzdCBtZXNzYWdlXSAke2UubWVzc2FnZX1gKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHdhdGNoZXIub25EaWRFcnJvcihlID0+IHtcblx0XHRcdGlmIChsb2dnaW5nRW5hYmxlZCkge1xuXHRcdFx0XHRjb25zb2xlLmxvZyhgW25vbi1yZWN1cnNpdmUgd2F0Y2hlciB0ZXN0IGVycm9yXSAke2V9YCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2F0Y2hlci5zdG9wKCk7XG5cdFx0d2F0Y2hlci5kaXNwb3NlKCk7XG5cblx0XHQvLyBQb3NzaWJsZSB0aGF0IHRoZSBmaWxlIHdhdGNoZXIgaXMgc3RpbGwgaG9sZGluZ1xuXHRcdC8vIG9udG8gdGhlIGZvbGRlcnMgb24gV2luZG93cyBzcGVjaWZpY2FsbHkgYW5kIHRoZVxuXHRcdC8vIHVubGluayB3b3VsZCBmYWlsLiBJbiB0aGF0IGNhc2UsIGRvIG5vdCBmYWlsIHRoZVxuXHRcdC8vIHRlc3Qgc3VpdGUuXG5cdFx0cmV0dXJuIFByb21pc2VzLnJtKHRlc3REaXIpLmNhdGNoKGVycm9yID0+IGNvbnNvbGUuZXJyb3IoZXJyb3IpKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gdG9Nc2codHlwZTogRmlsZUNoYW5nZVR5cGUpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSBGaWxlQ2hhbmdlVHlwZS5BRERFRDogcmV0dXJuICdhZGRlZCc7XG5cdFx0XHRjYXNlIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQ6IHJldHVybiAnZGVsZXRlZCc7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gJ2NoYW5nZWQnO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGF3YWl0RXZlbnQoc2VydmljZTogVGVzdE5vZGVKU1dhdGNoZXIsIHBhdGg6IHN0cmluZywgdHlwZTogRmlsZUNoYW5nZVR5cGUsIGNvcnJlbGF0aW9uSWQ/OiBudW1iZXIgfCBudWxsLCBleHBlY3RlZENvdW50PzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGxvZ2dpbmdFbmFibGVkKSB7XG5cdFx0XHRjb25zb2xlLmxvZyhgQXdhaXRpbmcgY2hhbmdlIHR5cGUgJyR7dG9Nc2codHlwZSl9JyBvbiBmaWxlICcke3BhdGh9J2ApO1xuXHRcdH1cblxuXHRcdC8vIEF3YWl0IHRoZSBldmVudFxuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0bGV0IGNvdW50ZXIgPSAwO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHNlcnZpY2Uub25EaWRDaGFuZ2VGaWxlKGV2ZW50cyA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgZXZlbnQgb2YgZXZlbnRzKSB7XG5cdFx0XHRcdFx0aWYgKGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwoZXZlbnQucmVzb3VyY2UsIFVSSS5maWxlKHBhdGgpKSAmJiBldmVudC50eXBlID09PSB0eXBlICYmIChjb3JyZWxhdGlvbklkID09PSBudWxsIHx8IGV2ZW50LmNJZCA9PT0gY29ycmVsYXRpb25JZCkpIHtcblx0XHRcdFx0XHRcdGNvdW50ZXIrKztcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgZXhwZWN0ZWRDb3VudCA9PT0gJ251bWJlcicgJiYgY291bnRlciA8IGV4cGVjdGVkQ291bnQpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7IC8vIG5vdCB5ZXRcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0dGVzdCgnYmFzaWNzIChmb2xkZXIgd2F0Y2gpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlcXVlc3QgPSB7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSB9O1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3JlcXVlc3RdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlci5pc1N1c3BlbmRlZChyZXF1ZXN0KSwgZmFsc2UpO1xuXG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBBcnJheS5mcm9tKHdhdGNoZXIud2F0Y2hlcnMpWzBdLmluc3RhbmNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0YW5jZS5pc1JldXNpbmdSZWN1cnNpdmVXYXRjaGVyLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbmNlLmZhaWxlZCwgZmFsc2UpO1xuXG5cdFx0Ly8gTmV3IGZpbGVcblx0XHRjb25zdCBuZXdGaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ25ld0ZpbGUudHh0Jyk7XG5cdFx0bGV0IGNoYW5nZUZ1dHVyZTogUHJvbWlzZTx1bmtub3duPiA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGgsICdIZWxsbyBXb3JsZCcpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIE5ldyBmb2xkZXJcblx0XHRjb25zdCBuZXdGb2xkZXJQYXRoID0gam9pbih0ZXN0RGlyLCAnTmV3IEZvbGRlcicpO1xuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3Rm9sZGVyUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGF3YWl0IGZzLnByb21pc2VzLm1rZGlyKG5ld0ZvbGRlclBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIFJlbmFtZSBmaWxlXG5cdFx0bGV0IHJlbmFtZWRGaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ3JlbmFtZWRGaWxlLnR4dCcpO1xuXHRcdGNoYW5nZUZ1dHVyZSA9IFByb21pc2UuYWxsKFtcblx0XHRcdGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpLFxuXHRcdFx0YXdhaXRFdmVudCh3YXRjaGVyLCByZW5hbWVkRmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKVxuXHRcdF0pO1xuXHRcdGF3YWl0IFByb21pc2VzLnJlbmFtZShuZXdGaWxlUGF0aCwgcmVuYW1lZEZpbGVQYXRoKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHQvLyBSZW5hbWUgZm9sZGVyXG5cdFx0bGV0IHJlbmFtZWRGb2xkZXJQYXRoID0gam9pbih0ZXN0RGlyLCAnUmVuYW1lZCBGb2xkZXInKTtcblx0XHRjaGFuZ2VGdXR1cmUgPSBQcm9taXNlLmFsbChbXG5cdFx0XHRhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZvbGRlclBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpLFxuXHRcdFx0YXdhaXRFdmVudCh3YXRjaGVyLCByZW5hbWVkRm9sZGVyUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpXG5cdFx0XSk7XG5cdFx0YXdhaXQgUHJvbWlzZXMucmVuYW1lKG5ld0ZvbGRlclBhdGgsIHJlbmFtZWRGb2xkZXJQYXRoKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHQvLyBSZW5hbWUgZmlsZSAoc2FtZSBuYW1lLCBkaWZmZXJlbnQgY2FzZSlcblx0XHRjb25zdCBjYXNlUmVuYW1lZEZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnUmVuYW1lZEZpbGUudHh0Jyk7XG5cdFx0Y2hhbmdlRnV0dXJlID0gUHJvbWlzZS5hbGwoW1xuXHRcdFx0YXdhaXRFdmVudCh3YXRjaGVyLCByZW5hbWVkRmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpLFxuXHRcdFx0YXdhaXRFdmVudCh3YXRjaGVyLCBjYXNlUmVuYW1lZEZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRClcblx0XHRdKTtcblx0XHRhd2FpdCBQcm9taXNlcy5yZW5hbWUocmVuYW1lZEZpbGVQYXRoLCBjYXNlUmVuYW1lZEZpbGVQYXRoKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdFx0cmVuYW1lZEZpbGVQYXRoID0gY2FzZVJlbmFtZWRGaWxlUGF0aDtcblxuXHRcdC8vIFJlbmFtZSBmb2xkZXIgKHNhbWUgbmFtZSwgZGlmZmVyZW50IGNhc2UpXG5cdFx0Y29uc3QgY2FzZVJlbmFtZWRGb2xkZXJQYXRoID0gam9pbih0ZXN0RGlyLCAnUkVuYW1lZCBGb2xkZXInKTtcblx0XHRjaGFuZ2VGdXR1cmUgPSBQcm9taXNlLmFsbChbXG5cdFx0XHRhd2FpdEV2ZW50KHdhdGNoZXIsIHJlbmFtZWRGb2xkZXJQYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSxcblx0XHRcdGF3YWl0RXZlbnQod2F0Y2hlciwgY2FzZVJlbmFtZWRGb2xkZXJQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRClcblx0XHRdKTtcblx0XHRhd2FpdCBQcm9taXNlcy5yZW5hbWUocmVuYW1lZEZvbGRlclBhdGgsIGNhc2VSZW5hbWVkRm9sZGVyUGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHRcdHJlbmFtZWRGb2xkZXJQYXRoID0gY2FzZVJlbmFtZWRGb2xkZXJQYXRoO1xuXG5cdFx0Ly8gTW92ZSBmaWxlXG5cdFx0Y29uc3QgbW92ZWRGaWxlcGF0aCA9IGpvaW4odGVzdERpciwgJ21vdmVkRmlsZS50eHQnKTtcblx0XHRjaGFuZ2VGdXR1cmUgPSBQcm9taXNlLmFsbChbXG5cdFx0XHRhd2FpdEV2ZW50KHdhdGNoZXIsIHJlbmFtZWRGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCksXG5cdFx0XHRhd2FpdEV2ZW50KHdhdGNoZXIsIG1vdmVkRmlsZXBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKVxuXHRcdF0pO1xuXHRcdGF3YWl0IFByb21pc2VzLnJlbmFtZShyZW5hbWVkRmlsZVBhdGgsIG1vdmVkRmlsZXBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIE1vdmUgZm9sZGVyXG5cdFx0Y29uc3QgbW92ZWRGb2xkZXJwYXRoID0gam9pbih0ZXN0RGlyLCAnTW92ZWQgRm9sZGVyJyk7XG5cdFx0Y2hhbmdlRnV0dXJlID0gUHJvbWlzZS5hbGwoW1xuXHRcdFx0YXdhaXRFdmVudCh3YXRjaGVyLCByZW5hbWVkRm9sZGVyUGF0aCwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCksXG5cdFx0XHRhd2FpdEV2ZW50KHdhdGNoZXIsIG1vdmVkRm9sZGVycGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpXG5cdFx0XSk7XG5cdFx0YXdhaXQgUHJvbWlzZXMucmVuYW1lKHJlbmFtZWRGb2xkZXJQYXRoLCBtb3ZlZEZvbGRlcnBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIENvcHkgZmlsZVxuXHRcdGNvbnN0IGNvcGllZEZpbGVwYXRoID0gam9pbih0ZXN0RGlyLCAnY29waWVkRmlsZS50eHQnKTtcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGNvcGllZEZpbGVwYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0YXdhaXQgZnMucHJvbWlzZXMuY29weUZpbGUobW92ZWRGaWxlcGF0aCwgY29waWVkRmlsZXBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIENvcHkgZm9sZGVyXG5cdFx0Y29uc3QgY29waWVkRm9sZGVycGF0aCA9IGpvaW4odGVzdERpciwgJ0NvcGllZCBGb2xkZXInKTtcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGNvcGllZEZvbGRlcnBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRhd2FpdCBQcm9taXNlcy5jb3B5KG1vdmVkRm9sZGVycGF0aCwgY29waWVkRm9sZGVycGF0aCwgeyBwcmVzZXJ2ZVN5bWxpbmtzOiBmYWxzZSB9KTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHQvLyBDaGFuZ2UgZmlsZVxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgY29waWVkRmlsZXBhdGgsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShjb3BpZWRGaWxlcGF0aCwgJ0hlbGxvIENoYW5nZScpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIENyZWF0ZSBuZXcgZmlsZVxuXHRcdGNvbnN0IGFub3RoZXJOZXdGaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2Fub3RoZXJOZXdGaWxlLnR4dCcpO1xuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgYW5vdGhlck5ld0ZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKGFub3RoZXJOZXdGaWxlUGF0aCwgJ0hlbGxvIEFub3RoZXIgV29ybGQnKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHQvLyBEZWxldGUgZmlsZVxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgY29waWVkRmlsZXBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXHRcdGF3YWl0IGZzLnByb21pc2VzLnVubGluayhjb3BpZWRGaWxlcGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gRGVsZXRlIGZvbGRlclxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgY29waWVkRm9sZGVycGF0aCwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCk7XG5cdFx0YXdhaXQgZnMucHJvbWlzZXMucm1kaXIoY29waWVkRm9sZGVycGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0d2F0Y2hlci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Jhc2ljcyAoZmlsZSB3YXRjaCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKTtcblx0XHRjb25zdCByZXF1ZXN0ID0geyBwYXRoOiBmaWxlUGF0aCwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH07XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbcmVxdWVzdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVyLmlzU3VzcGVuZGVkKHJlcXVlc3QpLCBmYWxzZSk7XG5cblx0XHRjb25zdCBpbnN0YW5jZSA9IEFycmF5LmZyb20od2F0Y2hlci53YXRjaGVycylbMF0uaW5zdGFuY2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbmNlLmlzUmV1c2luZ1JlY3Vyc2l2ZVdhdGNoZXIsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFuY2UuZmFpbGVkLCBmYWxzZSk7XG5cblx0XHQvLyBDaGFuZ2UgZmlsZVxuXHRcdGxldCBjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUoZmlsZVBhdGgsICdIZWxsbyBDaGFuZ2UnKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHQvLyBEZWxldGUgZmlsZVxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgZmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXHRcdGF3YWl0IGZzLnByb21pc2VzLnVubGluayhmaWxlUGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gUmVjcmVhdGUgd2F0Y2hlclxuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShmaWxlUGF0aCwgJ0hlbGxvIENoYW5nZScpO1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW10pO1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogZmlsZVBhdGgsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSB9XSk7XG5cblx0XHQvLyBNb3ZlIGZpbGVcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTtcblx0XHRhd2FpdCBQcm9taXNlcy5yZW5hbWUoZmlsZVBhdGgsIGAke2ZpbGVQYXRofS1tb3ZlZGApO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0fSk7XG5cblx0dGVzdCgnYXRvbWljIHdyaXRlcyAoZm9sZGVyIHdhdGNoKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSB9XSk7XG5cblx0XHQvLyBEZWxldGUgKyBSZWNyZWF0ZSBmaWxlXG5cdFx0Y29uc3QgbmV3RmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKTtcblx0XHRjb25zdCBjaGFuZ2VGdXR1cmU6IFByb21pc2U8dW5rbm93bj4gPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKTtcblx0XHRhd2FpdCBmcy5wcm9taXNlcy51bmxpbmsobmV3RmlsZVBhdGgpO1xuXHRcdFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aCwgJ0hlbGxvIEF0b21pYyBXb3JsZCcpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0fSk7XG5cblx0dGVzdCgnYXRvbWljIHdyaXRlcyAoZmlsZSB3YXRjaCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKTtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IGZpbGVQYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfV0pO1xuXG5cdFx0Ly8gRGVsZXRlICsgUmVjcmVhdGUgZmlsZVxuXHRcdGNvbnN0IG5ld0ZpbGVQYXRoID0gam9pbihmaWxlUGF0aCk7XG5cdFx0Y29uc3QgY2hhbmdlRnV0dXJlOiBQcm9taXNlPHVua25vd24+ID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCk7XG5cdFx0YXdhaXQgZnMucHJvbWlzZXMudW5saW5rKG5ld0ZpbGVQYXRoKTtcblx0XHRQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGgsICdIZWxsbyBBdG9taWMgV29ybGQnKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIGV2ZW50cyAoZm9sZGVyIHdhdGNoKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSB9XSk7XG5cblx0XHQvLyBtdWx0aXBsZSBhZGRcblxuXHRcdGNvbnN0IG5ld0ZpbGVQYXRoMSA9IGpvaW4odGVzdERpciwgJ25ld0ZpbGUtMS50eHQnKTtcblx0XHRjb25zdCBuZXdGaWxlUGF0aDIgPSBqb2luKHRlc3REaXIsICduZXdGaWxlLTIudHh0Jyk7XG5cdFx0Y29uc3QgbmV3RmlsZVBhdGgzID0gam9pbih0ZXN0RGlyLCAnbmV3RmlsZS0zLnR4dCcpO1xuXG5cdFx0Y29uc3QgYWRkZWRGdXR1cmUxOiBQcm9taXNlPHVua25vd24+ID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aDEsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRjb25zdCBhZGRlZEZ1dHVyZTI6IFByb21pc2U8dW5rbm93bj4gPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoMiwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGNvbnN0IGFkZGVkRnV0dXJlMzogUHJvbWlzZTx1bmtub3duPiA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgzLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGgxLCAnSGVsbG8gV29ybGQgMScpLFxuXHRcdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoMiwgJ0hlbGxvIFdvcmxkIDInKSxcblx0XHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aDMsICdIZWxsbyBXb3JsZCAzJyksXG5cdFx0XSk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbYWRkZWRGdXR1cmUxLCBhZGRlZEZ1dHVyZTIsIGFkZGVkRnV0dXJlM10pO1xuXG5cdFx0Ly8gbXVsdGlwbGUgY2hhbmdlXG5cblx0XHRjb25zdCBjaGFuZ2VGdXR1cmUxOiBQcm9taXNlPHVua25vd24+ID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aDEsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpO1xuXHRcdGNvbnN0IGNoYW5nZUZ1dHVyZTI6IFByb21pc2U8dW5rbm93bj4gPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoMiwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCk7XG5cdFx0Y29uc3QgY2hhbmdlRnV0dXJlMzogUHJvbWlzZTx1bmtub3duPiA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgzLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aDEsICdIZWxsbyBVcGRhdGUgMScpLFxuXHRcdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoMiwgJ0hlbGxvIFVwZGF0ZSAyJyksXG5cdFx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGgzLCAnSGVsbG8gVXBkYXRlIDMnKSxcblx0XHRdKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtjaGFuZ2VGdXR1cmUxLCBjaGFuZ2VGdXR1cmUyLCBjaGFuZ2VGdXR1cmUzXSk7XG5cblx0XHQvLyBjb3B5IHdpdGggbXVsdGlwbGUgZmlsZXNcblxuXHRcdGNvbnN0IGNvcHlGdXR1cmUxOiBQcm9taXNlPHVua25vd24+ID0gYXdhaXRFdmVudCh3YXRjaGVyLCBqb2luKHRlc3REaXIsICduZXdGaWxlLTEtY29weS50eHQnKSwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGNvbnN0IGNvcHlGdXR1cmUyOiBQcm9taXNlPHVua25vd24+ID0gYXdhaXRFdmVudCh3YXRjaGVyLCBqb2luKHRlc3REaXIsICduZXdGaWxlLTItY29weS50eHQnKSwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGNvbnN0IGNvcHlGdXR1cmUzOiBQcm9taXNlPHVua25vd24+ID0gYXdhaXRFdmVudCh3YXRjaGVyLCBqb2luKHRlc3REaXIsICduZXdGaWxlLTMtY29weS50eHQnKSwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0UHJvbWlzZXMuY29weShqb2luKHRlc3REaXIsICduZXdGaWxlLTEudHh0JyksIGpvaW4odGVzdERpciwgJ25ld0ZpbGUtMS1jb3B5LnR4dCcpLCB7IHByZXNlcnZlU3ltbGlua3M6IGZhbHNlIH0pLFxuXHRcdFx0UHJvbWlzZXMuY29weShqb2luKHRlc3REaXIsICduZXdGaWxlLTIudHh0JyksIGpvaW4odGVzdERpciwgJ25ld0ZpbGUtMi1jb3B5LnR4dCcpLCB7IHByZXNlcnZlU3ltbGlua3M6IGZhbHNlIH0pLFxuXHRcdFx0UHJvbWlzZXMuY29weShqb2luKHRlc3REaXIsICduZXdGaWxlLTMudHh0JyksIGpvaW4odGVzdERpciwgJ25ld0ZpbGUtMy1jb3B5LnR4dCcpLCB7IHByZXNlcnZlU3ltbGlua3M6IGZhbHNlIH0pXG5cdFx0XSk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbY29weUZ1dHVyZTEsIGNvcHlGdXR1cmUyLCBjb3B5RnV0dXJlM10pO1xuXG5cdFx0Ly8gbXVsdGlwbGUgZGVsZXRlXG5cblx0XHRjb25zdCBkZWxldGVGdXR1cmUxOiBQcm9taXNlPHVua25vd24+ID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aDEsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXHRcdGNvbnN0IGRlbGV0ZUZ1dHVyZTI6IFByb21pc2U8dW5rbm93bj4gPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoMiwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCk7XG5cdFx0Y29uc3QgZGVsZXRlRnV0dXJlMzogUHJvbWlzZTx1bmtub3duPiA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgzLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGF3YWl0IGZzLnByb21pc2VzLnVubGluayhuZXdGaWxlUGF0aDEpLFxuXHRcdFx0YXdhaXQgZnMucHJvbWlzZXMudW5saW5rKG5ld0ZpbGVQYXRoMiksXG5cdFx0XHRhd2FpdCBmcy5wcm9taXNlcy51bmxpbmsobmV3RmlsZVBhdGgzKVxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2RlbGV0ZUZ1dHVyZTEsIGRlbGV0ZUZ1dHVyZTIsIGRlbGV0ZUZ1dHVyZTNdKTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgZXZlbnRzIChmaWxlIHdhdGNoKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpO1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogZmlsZVBhdGgsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSB9XSk7XG5cblx0XHQvLyBtdWx0aXBsZSBjaGFuZ2VcblxuXHRcdGNvbnN0IGNoYW5nZUZ1dHVyZTE6IFByb21pc2U8dW5rbm93bj4gPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShmaWxlUGF0aCwgJ0hlbGxvIFVwZGF0ZSAxJyksXG5cdFx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUoZmlsZVBhdGgsICdIZWxsbyBVcGRhdGUgMicpLFxuXHRcdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKGZpbGVQYXRoLCAnSGVsbG8gVXBkYXRlIDMnKSxcblx0XHRdKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtjaGFuZ2VGdXR1cmUxXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIGNhbiBiZSB1cGRhdGVkIChmb2xkZXIgd2F0Y2gpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFsnKionXSwgcmVjdXJzaXZlOiBmYWxzZSB9XSk7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnZmlsZXMtZXhjbHVkZXMudHh0JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdleGNsdWRlcyBhcmUgaWdub3JlZCAoZmlsZSB3YXRjaCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKTtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IGZpbGVQYXRoLCBleGNsdWRlczogWycqKiddLCByZWN1cnNpdmU6IGZhbHNlIH1dKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KGZpbGVQYXRoLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaW5jbHVkZXMgY2FuIGJlIHVwZGF0ZWQgKGZvbGRlciB3YXRjaCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIGluY2x1ZGVzOiBbJ25vdGhpbmcnXSwgcmVjdXJzaXZlOiBmYWxzZSB9XSk7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnZmlsZXMtaW5jbHVkZXMudHh0JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdub24taW5jbHVkZXMgYXJlIGlnbm9yZWQgKGZpbGUgd2F0Y2gpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0Jyk7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiBmaWxlUGF0aCwgZXhjbHVkZXM6IFtdLCBpbmNsdWRlczogWydub3RoaW5nJ10sIHJlY3Vyc2l2ZTogZmFsc2UgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3QoZmlsZVBhdGgsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmNsdWRlcyBhcmUgc3VwcG9ydGVkIChmb2xkZXIgd2F0Y2gpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCBpbmNsdWRlczogWycqKi9maWxlcy1pbmNsdWRlcy50eHQnXSwgcmVjdXJzaXZlOiBmYWxzZSB9XSk7XG5cblx0XHRyZXR1cm4gYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICdmaWxlcy1pbmNsdWRlcy50eHQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY2x1ZGVzIGFyZSBzdXBwb3J0ZWQgKGZvbGRlciB3YXRjaCwgcmVsYXRpdmUgcGF0dGVybiBleHBsaWNpdCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIGluY2x1ZGVzOiBbeyBiYXNlOiB0ZXN0RGlyLCBwYXR0ZXJuOiAnZmlsZXMtaW5jbHVkZXMudHh0JyB9XSwgcmVjdXJzaXZlOiBmYWxzZSB9XSk7XG5cblx0XHRyZXR1cm4gYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICdmaWxlcy1pbmNsdWRlcy50eHQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY2x1ZGVzIGFyZSBzdXBwb3J0ZWQgKGZvbGRlciB3YXRjaCwgcmVsYXRpdmUgcGF0dGVybiBpbXBsaWNpdCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIGluY2x1ZGVzOiBbJ2ZpbGVzLWluY2x1ZGVzLnR4dCddLCByZWN1cnNpdmU6IGZhbHNlIH1dKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KGpvaW4odGVzdERpciwgJ2ZpbGVzLWluY2x1ZGVzLnR4dCcpKTtcblx0fSk7XG5cblx0dGVzdCgnY29ycmVsYXRpb25JZCBpcyBzdXBwb3J0ZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY29ycmVsYXRpb25JZCA9IE1hdGgucmFuZG9tKCk7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBjb3JyZWxhdGlvbklkLCBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnbmV3RmlsZS50eHQnKSwgdW5kZWZpbmVkLCBjb3JyZWxhdGlvbklkKTtcblx0fSk7XG5cblx0KGlzV2luZG93cyAvKiB3aW5kb3dzOiBjYW5ub3QgY3JlYXRlIGZpbGUgc3ltYm9saWMgbGluayB3aXRob3V0IGVsZXZhdGVkIGNvbnRleHQgKi8gPyB0ZXN0LnNraXAgOiB0ZXN0KSgnc3ltbGluayBzdXBwb3J0IChmb2xkZXIgd2F0Y2gpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGxpbmsgPSBqb2luKHRlc3REaXIsICdkZWVwLWxpbmtlZCcpO1xuXHRcdGNvbnN0IGxpbmtUYXJnZXQgPSBqb2luKHRlc3REaXIsICdkZWVwJyk7XG5cdFx0YXdhaXQgZnMucHJvbWlzZXMuc3ltbGluayhsaW5rVGFyZ2V0LCBsaW5rKTtcblxuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogbGluaywgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH1dKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KGpvaW4obGluaywgJ25ld0ZpbGUudHh0JykpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiBiYXNpY0NydWRUZXN0KGZpbGVQYXRoOiBzdHJpbmcsIHNraXBBZGQ/OiBib29sZWFuLCBjb3JyZWxhdGlvbklkPzogbnVtYmVyIHwgbnVsbCwgZXhwZWN0ZWRDb3VudD86IG51bWJlciwgYXdhaXRXYXRjaEFmdGVyQWRkPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBjaGFuZ2VGdXR1cmU6IFByb21pc2U8dW5rbm93bj47XG5cblx0XHQvLyBOZXcgZmlsZVxuXHRcdGlmICghc2tpcEFkZCkge1xuXHRcdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQsIGNvcnJlbGF0aW9uSWQsIGV4cGVjdGVkQ291bnQpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKGZpbGVQYXRoLCAnSGVsbG8gV29ybGQnKTtcblx0XHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0XHRcdGlmIChhd2FpdFdhdGNoQWZ0ZXJBZGQpIHtcblx0XHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHdhdGNoZXIub25EaWRXYXRjaCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hhbmdlIGZpbGVcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVELCBjb3JyZWxhdGlvbklkLCBleHBlY3RlZENvdW50KTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUoZmlsZVBhdGgsICdIZWxsbyBDaGFuZ2UnKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHQvLyBEZWxldGUgZmlsZVxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgZmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQsIGNvcnJlbGF0aW9uSWQsIGV4cGVjdGVkQ291bnQpO1xuXHRcdGF3YWl0IGZzLnByb21pc2VzLnVubGluayhhd2FpdCBQcm9taXNlcy5yZWFscGF0aChmaWxlUGF0aCkpOyAvLyBzdXBwb3J0IHN5bWxpbmtzXG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHR9XG5cblx0KGlzV2luZG93cyAvKiB3aW5kb3dzOiBjYW5ub3QgY3JlYXRlIGZpbGUgc3ltYm9saWMgbGluayB3aXRob3V0IGVsZXZhdGVkIGNvbnRleHQgKi8gPyB0ZXN0LnNraXAgOiB0ZXN0KSgnc3ltbGluayBzdXBwb3J0IChmaWxlIHdhdGNoKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBsaW5rID0gam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0LWxpbmtlZCcpO1xuXHRcdGNvbnN0IGxpbmtUYXJnZXQgPSBqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKTtcblx0XHRhd2FpdCBmcy5wcm9taXNlcy5zeW1saW5rKGxpbmtUYXJnZXQsIGxpbmspO1xuXG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiBsaW5rLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3QobGluaywgdHJ1ZSk7XG5cdH0pO1xuXG5cdCghaXNXaW5kb3dzIC8qIFVOQyBpcyB3aW5kb3dzIG9ubHkgKi8gPyB0ZXN0LnNraXAgOiB0ZXN0KSgndW5jIHN1cHBvcnQgKGZvbGRlciB3YXRjaCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YWRkVU5DSG9zdFRvQWxsb3dsaXN0KCdsb2NhbGhvc3QnKTtcblxuXHRcdC8vIExvY2FsIFVOQyBwYXRocyBhcmUgaW4gdGhlIGZvcm0gb2Y6IFxcXFxsb2NhbGhvc3RcXGMkXFxteV9kaXJcblx0XHRjb25zdCB1bmNQYXRoID0gYFxcXFxcXFxcbG9jYWxob3N0XFxcXCR7Z2V0RHJpdmVMZXR0ZXIodGVzdERpcik/LnRvTG93ZXJDYXNlKCl9JFxcXFwke2x0cmltKHRlc3REaXIuc3Vic3RyKHRlc3REaXIuaW5kZXhPZignOicpICsgMSksICdcXFxcJyl9YDtcblxuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogdW5jUGF0aCwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH1dKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KGpvaW4odW5jUGF0aCwgJ25ld0ZpbGUudHh0JykpO1xuXHR9KTtcblxuXHQoIWlzV2luZG93cyAvKiBVTkMgaXMgd2luZG93cyBvbmx5ICovID8gdGVzdC5za2lwIDogdGVzdCkoJ3VuYyBzdXBwb3J0IChmaWxlIHdhdGNoKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhZGRVTkNIb3N0VG9BbGxvd2xpc3QoJ2xvY2FsaG9zdCcpO1xuXG5cdFx0Ly8gTG9jYWwgVU5DIHBhdGhzIGFyZSBpbiB0aGUgZm9ybSBvZjogXFxcXGxvY2FsaG9zdFxcYyRcXG15X2RpclxuXHRcdGNvbnN0IHVuY1BhdGggPSBgXFxcXFxcXFxsb2NhbGhvc3RcXFxcJHtnZXREcml2ZUxldHRlcih0ZXN0RGlyKT8udG9Mb3dlckNhc2UoKX0kXFxcXCR7bHRyaW0odGVzdERpci5zdWJzdHIodGVzdERpci5pbmRleE9mKCc6JykgKyAxKSwgJ1xcXFwnKX1cXFxcbG9yZW0udHh0YDtcblxuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogdW5jUGF0aCwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH1dKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KHVuY1BhdGgsIHRydWUpO1xuXHR9KTtcblxuXHQoaXNMaW51eCAvKiBsaW51eDogaXMgY2FzZSBzZW5zaXRpdmUgKi8gPyB0ZXN0LnNraXAgOiB0ZXN0KSgnd3JvbmcgY2FzaW5nIChmb2xkZXIgd2F0Y2gpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdyb25nQ2FzZSA9IGpvaW4oZGlybmFtZSh0ZXN0RGlyKSwgYmFzZW5hbWUodGVzdERpcikudG9VcHBlckNhc2UoKSk7XG5cblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHdyb25nQ2FzZSwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH1dKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KGpvaW4od3JvbmdDYXNlLCAnbmV3RmlsZS50eHQnKSk7XG5cdH0pO1xuXG5cdChpc0xpbnV4IC8qIGxpbnV4OiBpcyBjYXNlIHNlbnNpdGl2ZSAqLyA/IHRlc3Quc2tpcCA6IHRlc3QpKCd3cm9uZyBjYXNpbmcgKGZpbGUgd2F0Y2gpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnTE9SRU0udHh0Jyk7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiBmaWxlUGF0aCwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH1dKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KGZpbGVQYXRoLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZCBwYXRoIGRvZXMgbm90IGV4cGxvZGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaW52YWxpZFBhdGggPSBqb2luKHRlc3REaXIsICdpbnZhbGlkJyk7XG5cblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IGludmFsaWRQYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3YXRjaEZpbGVDb250ZW50cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3YXRjaGVkUGF0aCA9IGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpO1xuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHRjb25zdCByZWFkeVByb21pc2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgY2h1bmtQcm9taXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHdhdGNoUHJvbWlzZSA9IHdhdGNoRmlsZUNvbnRlbnRzKHdhdGNoZWRQYXRoLCAoKSA9PiBjaHVua1Byb21pc2UuY29tcGxldGUoKSwgKCkgPT4gcmVhZHlQcm9taXNlLmNvbXBsZXRlKCksIGN0cy50b2tlbik7XG5cblx0XHRhd2FpdCByZWFkeVByb21pc2UucDtcblxuXHRcdFByb21pc2VzLndyaXRlRmlsZSh3YXRjaGVkUGF0aCwgJ0hlbGxvIFdvcmxkJyk7XG5cblx0XHRhd2FpdCBjaHVua1Byb21pc2UucDtcblxuXHRcdGN0cy5jYW5jZWwoKTsgLy8gdGhpcyB3aWxsIHJlc29sdmUgYHdhdGNoUHJvbWlzZWBcblxuXHRcdHJldHVybiB3YXRjaFByb21pc2U7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhdGNoaW5nIHNhbWUgb3Igb3ZlcmxhcHBpbmcgcGF0aHMgc3VwcG9ydGVkIHdoZW4gY29ycmVsYXRpb24gaXMgYXBwbGllZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFtcblx0XHRcdHsgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlLCBjb3JyZWxhdGlvbklkOiAxIH1cblx0XHRdKTtcblxuXHRcdGF3YWl0IGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnbmV3RmlsZV8xLnR4dCcpLCB1bmRlZmluZWQsIG51bGwsIDEpO1xuXG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbXG5cdFx0XHR7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSwgY29ycmVsYXRpb25JZDogMSB9LFxuXHRcdFx0eyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UsIGNvcnJlbGF0aW9uSWQ6IDIsIH0sXG5cdFx0XHR7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSwgY29ycmVsYXRpb25JZDogdW5kZWZpbmVkIH1cblx0XHRdKTtcblxuXHRcdGF3YWl0IGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnbmV3RmlsZV8yLnR4dCcpLCB1bmRlZmluZWQsIG51bGwsIDMpO1xuXHRcdGF3YWl0IGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnb3RoZXJOZXdGaWxlLnR4dCcpLCB1bmRlZmluZWQsIG51bGwsIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCd3YXRjaGluZyBtaXNzaW5nIHBhdGggZW1pdHMgd2F0Y2hlciBmYWlsIGV2ZW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG9uRGlkV2F0Y2hGYWlsID0gRXZlbnQudG9Qcm9taXNlKHdhdGNoZXIub25XYXRjaEZhaWwpO1xuXG5cdFx0Y29uc3QgZm9sZGVyUGF0aCA9IGpvaW4odGVzdERpciwgJ21pc3NpbmcnKTtcblx0XHR3YXRjaGVyLndhdGNoKFt7IHBhdGg6IGZvbGRlclBhdGgsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblxuXHRcdGF3YWl0IG9uRGlkV2F0Y2hGYWlsO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGluZyB3YXRjaGVkIHBhdGggZW1pdHMgd2F0Y2hlciBmYWlsIGFuZCBkZWxldGUgZXZlbnQgd2hlbiBjb3JyZWxhdGVkIChmaWxlIHdhdGNoKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpO1xuXG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiBmaWxlUGF0aCwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlLCBjb3JyZWxhdGlvbklkOiAxIH1dKTtcblxuXHRcdGNvbnN0IGluc3RhbmNlID0gQXJyYXkuZnJvbSh3YXRjaGVyLndhdGNoZXJzKVswXS5pbnN0YW5jZTtcblxuXHRcdGNvbnN0IG9uRGlkV2F0Y2hGYWlsID0gRXZlbnQudG9Qcm9taXNlKHdhdGNoZXIub25XYXRjaEZhaWwpO1xuXHRcdGNvbnN0IGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgZmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQsIDEpO1xuXHRcdGZzLnByb21pc2VzLnVubGluayhmaWxlUGF0aCk7XG5cdFx0YXdhaXQgb25EaWRXYXRjaEZhaWw7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0YW5jZS5mYWlsZWQsIHRydWUpO1xuXHR9KTtcblxuXHQoaXNNYWNpbnRvc2ggfHwgaXNXaW5kb3dzIC8qIG1hY09TOiBkb2VzIG5vdCBzZWVtIHRvIHJlcG9ydCBkZWxldGVzIG9uIGZvbGRlcnMgfCBXaW5kb3dzOiByZXBvcnRzIG9uKCdlcnJvcicpIGV2ZW50IG9ubHkgKi8gPyB0ZXN0LnNraXAgOiB0ZXN0KSgnZGVsZXRpbmcgd2F0Y2hlZCBwYXRoIGVtaXRzIHdhdGNoZXIgZmFpbCBhbmQgZGVsZXRlIGV2ZW50IHdoZW4gY29ycmVsYXRlZCAoZm9sZGVyIHdhdGNoKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmb2xkZXJQYXRoID0gam9pbih0ZXN0RGlyLCAnZGVlcCcpO1xuXG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiBmb2xkZXJQYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UsIGNvcnJlbGF0aW9uSWQ6IDEgfV0pO1xuXG5cdFx0Y29uc3Qgb25EaWRXYXRjaEZhaWwgPSBFdmVudC50b1Byb21pc2Uod2F0Y2hlci5vbldhdGNoRmFpbCk7XG5cdFx0Y29uc3QgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmb2xkZXJQYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVELCAxKTtcblx0XHRQcm9taXNlcy5ybShmb2xkZXJQYXRoLCBSaW1SYWZNb2RlLlVOTElOSyk7XG5cdFx0YXdhaXQgb25EaWRXYXRjaEZhaWw7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHR9KTtcblxuXHR0ZXN0KCd3YXRjaCByZXF1ZXN0cyBzdXBwb3J0IHN1c3BlbmQvcmVzdW1lIChmaWxlLCBkb2VzIG5vdCBleGlzdCBpbiBiZWdpbm5pbmcpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnbm90LWZvdW5kLnR4dCcpO1xuXG5cdFx0Y29uc3Qgb25EaWRXYXRjaEZhaWwgPSBFdmVudC50b1Byb21pc2Uod2F0Y2hlci5vbldhdGNoRmFpbCk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHsgcGF0aDogZmlsZVBhdGgsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSB9O1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3JlcXVlc3RdKTtcblx0XHRhd2FpdCBvbkRpZFdhdGNoRmFpbDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlci5pc1N1c3BlbmRlZChyZXF1ZXN0KSwgJ3BvbGxpbmcnKTtcblxuXHRcdGF3YWl0IGJhc2ljQ3J1ZFRlc3QoZmlsZVBhdGgsIHVuZGVmaW5lZCwgbnVsbCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRhd2FpdCBiYXNpY0NydWRUZXN0KGZpbGVQYXRoLCB1bmRlZmluZWQsIG51bGwsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhdGNoIHJlcXVlc3RzIHN1cHBvcnQgc3VzcGVuZC9yZXN1bWUgKGZpbGUsIGV4aXN0cyBpbiBiZWdpbm5pbmcpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnbG9yZW0udHh0Jyk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHsgcGF0aDogZmlsZVBhdGgsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiBmYWxzZSB9O1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3JlcXVlc3RdKTtcblxuXHRcdGNvbnN0IG9uRGlkV2F0Y2hGYWlsID0gRXZlbnQudG9Qcm9taXNlKHdhdGNoZXIub25XYXRjaEZhaWwpO1xuXHRcdGF3YWl0IGJhc2ljQ3J1ZFRlc3QoZmlsZVBhdGgsIHRydWUpO1xuXHRcdGF3YWl0IG9uRGlkV2F0Y2hGYWlsO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVyLmlzU3VzcGVuZGVkKHJlcXVlc3QpLCAncG9sbGluZycpO1xuXG5cdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChmaWxlUGF0aCwgdW5kZWZpbmVkLCBudWxsLCB1bmRlZmluZWQsIHRydWUpO1xuXHR9KTtcblxuXHQoaXNXaW5kb3dzIC8qIFdpbmRvd3M6IGRvZXMgbm90IHNlZW0gdG8gcmVwb3J0IHRoaXMgKi8gPyB0ZXN0LnNraXAgOiB0ZXN0KSgnd2F0Y2ggcmVxdWVzdHMgc3VwcG9ydCBzdXNwZW5kL3Jlc3VtZSAoZm9sZGVyLCBkb2VzIG5vdCBleGlzdCBpbiBiZWdpbm5pbmcpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBvbkRpZFdhdGNoRmFpbCA9IEV2ZW50LnRvUHJvbWlzZSh3YXRjaGVyLm9uV2F0Y2hGYWlsKTtcblxuXHRcdGNvbnN0IGZvbGRlclBhdGggPSBqb2luKHRlc3REaXIsICdub3QtZm91bmQnKTtcblx0XHRjb25zdCByZXF1ZXN0ID0geyBwYXRoOiBmb2xkZXJQYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UgfTtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFtyZXF1ZXN0XSk7XG5cdFx0YXdhaXQgb25EaWRXYXRjaEZhaWw7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZXIuaXNTdXNwZW5kZWQocmVxdWVzdCksICdwb2xsaW5nJyk7XG5cblx0XHRsZXQgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmb2xkZXJQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0bGV0IG9uRGlkV2F0Y2ggPSBFdmVudC50b1Byb21pc2Uod2F0Y2hlci5vbkRpZFdhdGNoKTtcblx0XHRhd2FpdCBmcy5wcm9taXNlcy5ta2Rpcihmb2xkZXJQYXRoKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdFx0YXdhaXQgb25EaWRXYXRjaDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVyLmlzU3VzcGVuZGVkKHJlcXVlc3QpLCBmYWxzZSk7XG5cblx0XHRpZiAoaXNXaW5kb3dzKSB7IC8vIHNvbWVob3cgZmFpbGluZyBvbiBtYWNPUy9MaW51eFxuXHRcdFx0Y29uc3QgZmlsZVBhdGggPSBqb2luKGZvbGRlclBhdGgsICduZXdGaWxlLnR4dCcpO1xuXHRcdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChmaWxlUGF0aCk7XG5cblx0XHRcdG9uRGlkV2F0Y2hGYWlsID0gRXZlbnQudG9Qcm9taXNlKHdhdGNoZXIub25XYXRjaEZhaWwpO1xuXHRcdFx0YXdhaXQgZnMucHJvbWlzZXMucm1kaXIoZm9sZGVyUGF0aCk7XG5cdFx0XHRhd2FpdCBvbkRpZFdhdGNoRmFpbDtcblxuXHRcdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmb2xkZXJQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0XHRvbkRpZFdhdGNoID0gRXZlbnQudG9Qcm9taXNlKHdhdGNoZXIub25EaWRXYXRjaCk7XG5cdFx0XHRhd2FpdCBmcy5wcm9taXNlcy5ta2Rpcihmb2xkZXJQYXRoKTtcblx0XHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0XHRcdGF3YWl0IG9uRGlkV2F0Y2g7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoNTAwKTsgLy8gc29tZWhvdyBuZWVkZWQgb24gTGludXhcblxuXHRcdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChmaWxlUGF0aCk7XG5cdFx0fVxuXHR9KTtcblxuXHQoaXNNYWNpbnRvc2ggLyogbWFjT1M6IGRvZXMgbm90IHNlZW0gdG8gcmVwb3J0IHRoaXMgKi8gPyB0ZXN0LnNraXAgOiB0ZXN0KSgnd2F0Y2ggcmVxdWVzdHMgc3VwcG9ydCBzdXNwZW5kL3Jlc3VtZSAoZm9sZGVyLCBleGlzdHMgaW4gYmVnaW5uaW5nKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmb2xkZXJQYXRoID0gam9pbih0ZXN0RGlyLCAnZGVlcCcpO1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogZm9sZGVyUGF0aCwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH1dKTtcblxuXHRcdGNvbnN0IGZpbGVQYXRoID0gam9pbihmb2xkZXJQYXRoLCAnbmV3RmlsZS50eHQnKTtcblx0XHRhd2FpdCBiYXNpY0NydWRUZXN0KGZpbGVQYXRoKTtcblxuXHRcdGNvbnN0IG9uRGlkV2F0Y2hGYWlsID0gRXZlbnQudG9Qcm9taXNlKHdhdGNoZXIub25XYXRjaEZhaWwpO1xuXHRcdGF3YWl0IFByb21pc2VzLnJtKGZvbGRlclBhdGgpO1xuXHRcdGF3YWl0IG9uRGlkV2F0Y2hGYWlsO1xuXG5cdFx0Y29uc3QgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmb2xkZXJQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0Y29uc3Qgb25EaWRXYXRjaCA9IEV2ZW50LnRvUHJvbWlzZSh3YXRjaGVyLm9uRGlkV2F0Y2gpO1xuXHRcdGF3YWl0IGZzLnByb21pc2VzLm1rZGlyKGZvbGRlclBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0XHRhd2FpdCBvbkRpZFdhdGNoO1xuXG5cdFx0YXdhaXQgdGltZW91dCg1MDApOyAvLyBzb21laG93IG5lZWRlZCBvbiBMaW51eFxuXG5cdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChmaWxlUGF0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcmNlbCB3YXRjaGVyIHJldXNlZCB3aGVuIHByZXNlbnQgZm9yIG5vbi1yZWN1cnNpdmUgZmlsZSB3YXRjaGluZyAodW5jb3JyZWxhdGVkKScsIGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gdGVzdFBhcmNlbFdhdGNoZXJSZXVzZWQodW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncGFyY2VsIHdhdGNoZXIgcmV1c2VkIHdoZW4gcHJlc2VudCBmb3Igbm9uLXJlY3Vyc2l2ZSBmaWxlIHdhdGNoaW5nIChjb3JyZWxhdGVkKScsIGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gdGVzdFBhcmNlbFdhdGNoZXJSZXVzZWQoMik7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVBhcmNlbFdhdGNoZXIoKSB7XG5cdFx0Y29uc3QgcmVjdXJzaXZlV2F0Y2hlciA9IG5ldyBUZXN0UGFyY2VsV2F0Y2hlcigpO1xuXHRcdHJlY3Vyc2l2ZVdhdGNoZXIuc2V0VmVyYm9zZUxvZ2dpbmcobG9nZ2luZ0VuYWJsZWQpO1xuXHRcdHJlY3Vyc2l2ZVdhdGNoZXIub25EaWRMb2dNZXNzYWdlKGUgPT4ge1xuXHRcdFx0aWYgKGxvZ2dpbmdFbmFibGVkKSB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKGBbcmVjdXJzaXZlIHdhdGNoZXIgdGVzdCBtZXNzYWdlXSAke2UubWVzc2FnZX1gKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJlY3Vyc2l2ZVdhdGNoZXIub25EaWRFcnJvcihlID0+IHtcblx0XHRcdGlmIChsb2dnaW5nRW5hYmxlZCkge1xuXHRcdFx0XHRjb25zb2xlLmxvZyhgW3JlY3Vyc2l2ZSB3YXRjaGVyIHRlc3QgZXJyb3JdICR7ZS5lcnJvcn1gKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiByZWN1cnNpdmVXYXRjaGVyO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdFBhcmNlbFdhdGNoZXJSZXVzZWQoY29ycmVsYXRpb25JZDogbnVtYmVyIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgcmVjdXJzaXZlV2F0Y2hlciA9IGNyZWF0ZVBhcmNlbFdhdGNoZXIoKTtcblx0XHRhd2FpdCByZWN1cnNpdmVXYXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlLCBjb3JyZWxhdGlvbklkOiAxIH1dKTtcblxuXHRcdGNvbnN0IHJlY3Vyc2l2ZUluc3RhbmNlID0gQXJyYXkuZnJvbShyZWN1cnNpdmVXYXRjaGVyLndhdGNoZXJzKVswXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVjdXJzaXZlSW5zdGFuY2Uuc3Vic2NyaXB0aW9uc0NvdW50LCAwKTtcblxuXHRcdGF3YWl0IGNyZWF0ZVdhdGNoZXIocmVjdXJzaXZlV2F0Y2hlcik7XG5cblx0XHRjb25zdCBmaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2RlZXAnLCAnY29ud2F5LmpzJyk7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiBmaWxlUGF0aCwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlLCBjb3JyZWxhdGlvbklkIH1dKTtcblxuXHRcdGNvbnN0IHsgaW5zdGFuY2UgfSA9IEFycmF5LmZyb20od2F0Y2hlci53YXRjaGVycylbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbmNlLmlzUmV1c2luZ1JlY3Vyc2l2ZVdhdGNoZXIsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWN1cnNpdmVJbnN0YW5jZS5zdWJzY3JpcHRpb25zQ291bnQsIDEpO1xuXG5cdFx0bGV0IGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgZmlsZVBhdGgsIGlzTWFjaW50b3NoIC8qIHNvbWVob3cgZnNldmVudHMgc2VlbXMgdG8gcmVwb3J0IHN0aWxsIG9uIHRoZSBpbml0aWFsIGNyZWF0ZSBmcm9tIHRlc3Qgc2V0dXAgKi8gPyBGaWxlQ2hhbmdlVHlwZS5BRERFRCA6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQsIGNvcnJlbGF0aW9uSWQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShmaWxlUGF0aCwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0YXdhaXQgcmVjdXJzaXZlV2F0Y2hlci5zdG9wKCk7XG5cdFx0cmVjdXJzaXZlV2F0Y2hlci5kaXNwb3NlKCk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDUwMCk7IC8vIGdpdmUgdGhlIHdhdGNoZXIgc29tZSB0aW1lIHRvIHJlc3RhcnRcblxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgZmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQsIGNvcnJlbGF0aW9uSWQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShmaWxlUGF0aCwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbmNlLmlzUmV1c2luZ1JlY3Vyc2l2ZVdhdGNoZXIsIGZhbHNlKTtcblx0fVxuXG5cdHRlc3QoJ3dhdGNoIHJlcXVlc3RzIHN1cHBvcnQgc3VzcGVuZC9yZXN1bWUgKGZpbGUsIGRvZXMgbm90IGV4aXN0IGluIGJlZ2lubmluZywgcGFyY2VsIHdhdGNoZXIgcmV1c2VkKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZWN1cnNpdmVXYXRjaGVyID0gY3JlYXRlUGFyY2VsV2F0Y2hlcigpO1xuXHRcdGF3YWl0IHJlY3Vyc2l2ZVdhdGNoZXIud2F0Y2goW3sgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXG5cdFx0YXdhaXQgY3JlYXRlV2F0Y2hlcihyZWN1cnNpdmVXYXRjaGVyKTtcblxuXHRcdGNvbnN0IGZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnbm90LWZvdW5kLTIudHh0Jyk7XG5cblx0XHRjb25zdCBvbkRpZFdhdGNoRmFpbCA9IEV2ZW50LnRvUHJvbWlzZSh3YXRjaGVyLm9uV2F0Y2hGYWlsKTtcblx0XHRjb25zdCByZXF1ZXN0ID0geyBwYXRoOiBmaWxlUGF0aCwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlIH07XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbcmVxdWVzdF0pO1xuXHRcdGF3YWl0IG9uRGlkV2F0Y2hGYWlsO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVyLmlzU3VzcGVuZGVkKHJlcXVlc3QpLCB0cnVlKTtcblxuXHRcdGNvbnN0IGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgZmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUoZmlsZVBhdGgsICdIZWxsbyBXb3JsZCcpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVyLmlzU3VzcGVuZGVkKHJlcXVlc3QpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50IHR5cGUgZmlsdGVyIChmaWxlIHdhdGNoKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2xvcmVtLnR4dCcpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSB7IHBhdGg6IGZpbGVQYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogZmFsc2UsIGZpbHRlcjogRmlsZUNoYW5nZUZpbHRlci5VUERBVEVEIHwgRmlsZUNoYW5nZUZpbHRlci5ERUxFVEVELCBjb3JyZWxhdGlvbklkOiAxIH07XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbcmVxdWVzdF0pO1xuXG5cdFx0Ly8gQ2hhbmdlIGZpbGVcblx0XHRsZXQgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCwgMSk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKGZpbGVQYXRoLCAnSGVsbG8gQ2hhbmdlJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gRGVsZXRlIGZpbGVcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVELCAxKTtcblx0XHRhd2FpdCBmcy5wcm9taXNlcy51bmxpbmsoZmlsZVBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgdHlwZSBmaWx0ZXIgKGZvbGRlciB3YXRjaCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHsgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IGZhbHNlLCBmaWx0ZXI6IEZpbGVDaGFuZ2VGaWx0ZXIuVVBEQVRFRCB8IEZpbGVDaGFuZ2VGaWx0ZXIuREVMRVRFRCwgY29ycmVsYXRpb25JZDogMSB9O1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3JlcXVlc3RdKTtcblxuXHRcdC8vIENoYW5nZSBmaWxlXG5cdFx0Y29uc3QgZmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdsb3JlbS50eHQnKTtcblx0XHRsZXQgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCwgMSk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKGZpbGVQYXRoLCAnSGVsbG8gQ2hhbmdlJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gRGVsZXRlIGZpbGVcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVELCAxKTtcblx0XHRhd2FpdCBmcy5wcm9taXNlcy51bmxpbmsoZmlsZVBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0fSk7XG5cblx0KGlzTGludXggPyB0ZXN0LnNraXAgOiB0ZXN0KSgnaW5jbHVkZXMgYXJlIGNhc2UgaW5zZW5zaXRpdmUgb24gV2luZG93cy9NYWMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIGluY2x1ZGVzOiBbJyouVFhUJ10sIHJlY3Vyc2l2ZTogZmFsc2UgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnbmV3RmlsZS50eHQnKSk7XG5cdH0pO1xuXG5cdChpc0xpbnV4ID8gdGVzdC5za2lwIDogdGVzdCkoJ2V4Y2x1ZGVzIGFyZSBjYXNlIGluc2Vuc2l0aXZlIG9uIFdpbmRvd3MvTWFjJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFsnKi5UWFQnXSwgcmVjdXJzaXZlOiBmYWxzZSB9XSk7XG5cblx0XHQvLyBOZXcgZmlsZSAoc2hvdWxkIGJlIGV4Y2x1ZGVkKVxuXHRcdGNvbnN0IG5ld0ZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnbmV3RmlsZS50eHQnKTtcblx0XHRjb25zdCBjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoLCAnSGVsbG8gV29ybGQnKTtcblxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IFByb21pc2UuYW55KFtcblx0XHRcdHRpbWVvdXQoNTAwKS50aGVuKCgpID0+IHRydWUpLFxuXHRcdFx0Y2hhbmdlRnV0dXJlLnRoZW4oKCkgPT4gZmFsc2UpXG5cdFx0XSk7XG5cblx0XHRpZiAoIXJlcykge1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ1VuZXhwZWN0ZWQgY2hhbmdlIGV2ZW50Jyk7XG5cdFx0fVxuXHR9KTtcblxuXHQoaXNMaW51eCA/IHRlc3Quc2tpcCA6IHRlc3QpKCdleGNsdWRlcyBhcmUgY2FzZSBpbnNlbnNpdGl2ZSBvbiBXaW5kb3dzL01hYycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbJyouVFhUJ10sIHJlY3Vyc2l2ZTogZmFsc2UgfV0pO1xuXG5cdFx0Ly8gTmV3IGZpbGUgKHNob3VsZCBiZSBleGNsdWRlZClcblx0XHRjb25zdCBuZXdGaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ25ld0ZpbGUudHh0Jyk7XG5cdFx0Y29uc3QgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aCwgJ0hlbGxvIFdvcmxkJyk7XG5cblx0XHRjb25zdCByZXMgPSBhd2FpdCBQcm9taXNlLmFueShbXG5cdFx0XHR0aW1lb3V0KDUwMCkudGhlbigoKSA9PiB0cnVlKSxcblx0XHRcdGNoYW5nZUZ1dHVyZS50aGVuKCgpID0+IGZhbHNlKVxuXHRcdF0pO1xuXG5cdFx0aWYgKCFyZXMpIHtcblx0XHRcdGFzc2VydC5mYWlsKCdVbmV4cGVjdGVkIGNoYW5nZSBldmVudCcpO1xuXHRcdH1cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksUUFBUTtBQUNwQixPQUFPLFlBQVk7QUFDbkIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsVUFBVSxTQUFTLFlBQVk7QUFDeEMsU0FBUyxVQUFVLGtCQUFrQjtBQUNyQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQixzQkFBc0I7QUFFakQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWEsaUJBQWlCO0FBQ2hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsV0FBVztBQUNwQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHlCQUF5QjtBQU9sQyxNQUFNLEtBQUssMEJBQTBCLFdBQVk7QUFFaEQs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U0FBUyxVQUFVLGVBQWUsU0FBUyxDQUFDO0FBQ3RFLFVBQU0sR0FBRyxTQUFTLE9BQU8sUUFBUTtBQUNqQyxVQUFNO0FBQUEsRUFDUCxDQUFDO0FBRUQsR0FBQyxVQUFVLEtBQUssT0FBTyxNQUFNLGdEQUFnRCxpQkFBa0I7QUFDOUYsVUFBTSxRQUFRLE1BQU0sQ0FBQyxFQUFFLE1BQU0sU0FBUyxVQUFVLENBQUMsR0FBRyxVQUFVLENBQUMsT0FBTyxHQUFHLFdBQVcsTUFBTSxDQUFDLENBQUM7QUFFNUYsV0FBTyxjQUFjLEtBQUssU0FBUyxhQUFhLENBQUM7QUFBQSxFQUNsRCxDQUFDO0FBRUQsR0FBQyxVQUFVLEtBQUssT0FBTyxNQUFNLGdEQUFnRCxpQkFBa0I7QUFDOUYsVUFBTSxRQUFRLE1BQU0sQ0FBQyxFQUFFLE1BQU0sU0FBUyxVQUFVLENBQUMsT0FBTyxHQUFHLFdBQVcsTUFBTSxDQUFDLENBQUM7QUFHOUUsVUFBTSxjQUFjLEtBQUssU0FBUyxhQUFhO0FBQy9DLFVBQU0sZUFBZSxXQUFXLFNBQVMsYUFBYSxlQUFlLEtBQUs7QUFDMUUsVUFBTSxTQUFTLFVBQVUsYUFBYSxhQUFhO0FBRW5ELFVBQU0sTUFBTSxNQUFNLFFBQVEsSUFBSTtBQUFBLE1BQzdCLFFBQVEsR0FBRyxFQUFFLEtBQUssTUFBTSxJQUFJO0FBQUEsTUFDNUIsYUFBYSxLQUFLLE1BQU0sS0FBSztBQUFBLElBQzlCLENBQUM7QUFFRCxRQUFJLENBQUMsS0FBSztBQUNULGFBQU8sS0FBSyx5QkFBeUI7QUFBQSxJQUN0QztBQUFBLEVBQ0QsQ0FBQztBQUVELEdBQUMsVUFBVSxLQUFLLE9BQU8sTUFBTSxnREFBZ0QsaUJBQWtCO0FBQzlGLFVBQU0sUUFBUSxNQUFNLENBQUMsRUFBRSxNQUFNLFNBQVMsVUFBVSxDQUFDLE9BQU8sR0FBRyxXQUFXLE1BQU0sQ0FBQyxDQUFDO0FBRzlFLFVBQU0sY0FBYyxLQUFLLFNBQVMsYUFBYTtBQUMvQyxVQUFNLGVBQWUsV0FBVyxTQUFTLGFBQWEsZUFBZSxLQUFLO0FBQzFFLFVBQU0sU0FBUyxVQUFVLGFBQWEsYUFBYTtBQUVuRCxVQUFNLE1BQU0sTUFBTSxRQUFRLElBQUk7QUFBQSxNQUM3QixRQUFRLEdBQUcsRUFBRSxLQUFLLE1BQU0sSUFBSTtBQUFBLE1BQzVCLGFBQWEsS0FBSyxNQUFNLEtBQUs7QUFBQSxJQUM5QixDQUFDO0FBRUQsUUFBSSxDQUFDLEtBQUs7QUFDVCxhQUFPLEtBQUsseUJBQXlCO0FBQUEsSUFDdEM7QUFBQSxFQUNELENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJ3YXRjaGVyIl0KfQo=
