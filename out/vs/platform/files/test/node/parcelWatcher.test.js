import assert from "assert";
import { realpathSync, promises } from "fs";
import { tmpdir } from "os";
import { timeout } from "../../../../base/common/async.js";
import { dirname, join } from "../../../../base/common/path.js";
import { isLinux, isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { Promises, RimRafMode } from "../../../../base/node/pfs.js";
import { getRandomTestPath } from "../../../../base/test/node/testUtils.js";
import { FileChangeFilter, FileChangeType } from "../../common/files.js";
import { ParcelWatcher } from "../../node/watcher/parcel/parcelWatcher.js";
import { getDriveLetter } from "../../../../base/common/extpath.js";
import { ltrim } from "../../../../base/common/strings.js";
import { FileAccess } from "../../../../base/common/network.js";
import { extUriBiasedIgnorePathCase } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { addUNCHostToAllowlist } from "../../../../base/node/unc.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
class TestParcelWatcher extends ParcelWatcher {
  constructor() {
    super(...arguments);
    this.suspendedWatchRequestPollingInterval = 100;
    this._onDidWatch = this._register(new Emitter());
    this.onDidWatch = this._onDidWatch.event;
    this.onWatchFail = this._onDidWatchFail.event;
  }
  async testRemoveDuplicateRequests(paths, excludes = []) {
    const requests = paths.map((path) => {
      return { path, excludes, recursive: true };
    });
    return (await this.removeDuplicateRequests(
      requests,
      false
      /* validate paths skipped for tests */
    )).map((request) => request.path);
  }
  getUpdateWatchersDelay() {
    return 0;
  }
  async doWatch(requests) {
    await super.doWatch(requests);
    await this.whenReady();
    this._onDidWatch.fire();
  }
  async whenReady() {
    for (const watcher of this.watchers) {
      await watcher.ready;
    }
  }
}
suite.skip("File Watcher (parcel)", function() {
  this.timeout(1e4);
  let testDir;
  let watcher;
  let loggingEnabled = false;
  function enableLogging(enable) {
    loggingEnabled = enable;
    watcher?.setVerboseLogging(enable);
  }
  enableLogging(loggingEnabled);
  setup(async () => {
    watcher = new TestParcelWatcher();
    watcher.setVerboseLogging(loggingEnabled);
    watcher.onDidLogMessage((e) => {
      if (loggingEnabled) {
        console.log(`[recursive watcher test message] ${e.message}`);
      }
    });
    watcher.onDidError((e) => {
      if (loggingEnabled) {
        console.log(`[recursive watcher test error] ${e.error}`);
      }
    });
    testDir = URI.file(getRandomTestPath(realpathSync(tmpdir()), "vsctests", "filewatcher")).fsPath;
    const sourceDir = FileAccess.asFileUri("vs/platform/files/test/node/fixtures/service").fsPath;
    await Promises.copy(sourceDir, testDir, { preserveSymlinks: false });
  });
  teardown(async () => {
    const watchers = Array.from(watcher.watchers).length;
    let stoppedInstances = 0;
    for (const instance of watcher.watchers) {
      Event.once(instance.onDidStop)(() => {
        if (instance.stopped) {
          stoppedInstances++;
        }
      });
    }
    await watcher.stop();
    assert.strictEqual(stoppedInstances, watchers, "All watchers must be stopped before the test ends");
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
  async function awaitEvent(watcher2, path, type, failOnEventReason, correlationId, expectedCount) {
    if (loggingEnabled) {
      console.log(`Awaiting change type '${toMsg(type)}' on file '${path}'`);
    }
    const res = await new Promise((resolve, reject) => {
      let counter = 0;
      const disposable = watcher2.onDidChangeFile((events) => {
        for (const event of events) {
          if (extUriBiasedIgnorePathCase.isEqual(event.resource, URI.file(path)) && event.type === type && (correlationId === null || event.cId === correlationId)) {
            counter++;
            if (typeof expectedCount === "number" && counter < expectedCount) {
              continue;
            }
            disposable.dispose();
            if (failOnEventReason) {
              reject(new Error(`Unexpected file event: ${failOnEventReason}`));
            } else {
              setImmediate(() => resolve(events));
            }
            break;
          }
        }
      });
    });
    await timeout(1);
    return res;
  }
  function awaitMessage(watcher2, type) {
    if (loggingEnabled) {
      console.log(`Awaiting message of type ${type}`);
    }
    return new Promise((resolve) => {
      const disposable = watcher2.onDidLogMessage((msg) => {
        if (msg.type === type) {
          disposable.dispose();
          resolve();
        }
      });
    });
  }
  test("basics", async function() {
    const request = { path: testDir, excludes: [], recursive: true };
    await watcher.watch([request]);
    const instance = Array.from(watcher.watchers)[0];
    assert.strictEqual(request, instance.request);
    assert.strictEqual(instance.failed, false);
    assert.strictEqual(instance.stopped, false);
    const disposables = new DisposableStore();
    const subscriptions1 = /* @__PURE__ */ new Map();
    const subscriptions2 = /* @__PURE__ */ new Map();
    const newFilePath = join(testDir, "deep", "newFile.txt");
    disposables.add(instance.subscribe(newFilePath, (change) => subscriptions1.set(change.resource.fsPath, change.type)));
    disposables.add(instance.subscribe(newFilePath, (change) => subscriptions2.set(change.resource.fsPath, change.type)));
    assert.strictEqual(instance.include(newFilePath), true);
    assert.strictEqual(instance.exclude(newFilePath), false);
    let changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newFilePath, "Hello World");
    await changeFuture;
    assert.strictEqual(subscriptions1.get(newFilePath), FileChangeType.ADDED);
    assert.strictEqual(subscriptions2.get(newFilePath), FileChangeType.ADDED);
    const newFolderPath = join(testDir, "deep", "New Folder");
    disposables.add(instance.subscribe(newFolderPath, (change) => subscriptions1.set(change.resource.fsPath, change.type)));
    const disposable = instance.subscribe(newFolderPath, (change) => subscriptions2.set(change.resource.fsPath, change.type));
    disposable.dispose();
    assert.strictEqual(instance.include(newFolderPath), true);
    assert.strictEqual(instance.exclude(newFolderPath), false);
    changeFuture = awaitEvent(watcher, newFolderPath, FileChangeType.ADDED);
    await promises.mkdir(newFolderPath);
    await changeFuture;
    assert.strictEqual(subscriptions1.get(newFolderPath), FileChangeType.ADDED);
    assert.strictEqual(
      subscriptions2.has(newFolderPath),
      false
      /* subscription was disposed before the event */
    );
    let renamedFilePath = join(testDir, "deep", "renamedFile.txt");
    disposables.add(instance.subscribe(renamedFilePath, (change) => subscriptions1.set(change.resource.fsPath, change.type)));
    changeFuture = Promise.all([
      awaitEvent(watcher, newFilePath, FileChangeType.DELETED),
      awaitEvent(watcher, renamedFilePath, FileChangeType.ADDED)
    ]);
    await Promises.rename(newFilePath, renamedFilePath);
    await changeFuture;
    assert.strictEqual(subscriptions1.get(newFilePath), FileChangeType.DELETED);
    assert.strictEqual(subscriptions1.get(renamedFilePath), FileChangeType.ADDED);
    let renamedFolderPath = join(testDir, "deep", "Renamed Folder");
    disposables.add(instance.subscribe(renamedFolderPath, (change) => subscriptions1.set(change.resource.fsPath, change.type)));
    changeFuture = Promise.all([
      awaitEvent(watcher, newFolderPath, FileChangeType.DELETED),
      awaitEvent(watcher, renamedFolderPath, FileChangeType.ADDED)
    ]);
    await Promises.rename(newFolderPath, renamedFolderPath);
    await changeFuture;
    assert.strictEqual(subscriptions1.get(newFolderPath), FileChangeType.DELETED);
    assert.strictEqual(subscriptions1.get(renamedFolderPath), FileChangeType.ADDED);
    const caseRenamedFilePath = join(testDir, "deep", "RenamedFile.txt");
    changeFuture = Promise.all([
      awaitEvent(watcher, renamedFilePath, FileChangeType.DELETED),
      awaitEvent(watcher, caseRenamedFilePath, FileChangeType.ADDED)
    ]);
    await Promises.rename(renamedFilePath, caseRenamedFilePath);
    await changeFuture;
    renamedFilePath = caseRenamedFilePath;
    const caseRenamedFolderPath = join(testDir, "deep", "REnamed Folder");
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
    const copiedFilepath = join(testDir, "deep", "copiedFile.txt");
    changeFuture = awaitEvent(watcher, copiedFilepath, FileChangeType.ADDED);
    await promises.copyFile(movedFilepath, copiedFilepath);
    await changeFuture;
    const copiedFolderpath = join(testDir, "deep", "Copied Folder");
    changeFuture = awaitEvent(watcher, copiedFolderpath, FileChangeType.ADDED);
    await Promises.copy(movedFolderpath, copiedFolderpath, { preserveSymlinks: false });
    await changeFuture;
    changeFuture = awaitEvent(watcher, copiedFilepath, FileChangeType.UPDATED);
    await Promises.writeFile(copiedFilepath, "Hello Change");
    await changeFuture;
    const anotherNewFilePath = join(testDir, "deep", "anotherNewFile.txt");
    changeFuture = awaitEvent(watcher, anotherNewFilePath, FileChangeType.ADDED);
    await Promises.writeFile(anotherNewFilePath, "Hello Another World");
    await changeFuture;
    changeFuture = awaitEvent(watcher, anotherNewFilePath, FileChangeType.UPDATED, "unexpected-event-from-read-file");
    await promises.readFile(anotherNewFilePath);
    await Promise.race([timeout(100), changeFuture]);
    changeFuture = awaitEvent(watcher, anotherNewFilePath, FileChangeType.UPDATED, "unexpected-event-from-stat");
    await promises.stat(anotherNewFilePath);
    await Promise.race([timeout(100), changeFuture]);
    changeFuture = awaitEvent(watcher, copiedFolderpath, FileChangeType.UPDATED, "unexpected-event-from-stat");
    await promises.stat(copiedFolderpath);
    await Promise.race([timeout(100), changeFuture]);
    changeFuture = awaitEvent(watcher, copiedFilepath, FileChangeType.DELETED);
    disposables.add(instance.subscribe(copiedFilepath, (change) => subscriptions1.set(change.resource.fsPath, change.type)));
    await promises.unlink(copiedFilepath);
    await changeFuture;
    assert.strictEqual(subscriptions1.get(copiedFilepath), FileChangeType.DELETED);
    changeFuture = awaitEvent(watcher, copiedFolderpath, FileChangeType.DELETED);
    disposables.add(instance.subscribe(copiedFolderpath, (change) => subscriptions1.set(change.resource.fsPath, change.type)));
    await promises.rmdir(copiedFolderpath);
    await changeFuture;
    assert.strictEqual(subscriptions1.get(copiedFolderpath), FileChangeType.DELETED);
    disposables.dispose();
  });
  (isMacintosh ? test.skip : test)("basics (atomic writes)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], recursive: true }]);
    const newFilePath = join(testDir, "deep", "conway.js");
    const changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.UPDATED);
    await promises.unlink(newFilePath);
    Promises.writeFile(newFilePath, "Hello Atomic World");
    await changeFuture;
  });
  (!isLinux ? test.skip : test)("basics (polling)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], pollingInterval: 100, recursive: true }]);
    return basicCrudTest(join(testDir, "deep", "newFile.txt"));
  });
  async function basicCrudTest(filePath, correlationId, expectedCount) {
    let changeFuture = awaitEvent(watcher, filePath, FileChangeType.ADDED, void 0, correlationId, expectedCount);
    await Promises.writeFile(filePath, "Hello World");
    await changeFuture;
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.UPDATED, void 0, correlationId, expectedCount);
    await Promises.writeFile(filePath, "Hello Change");
    await changeFuture;
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED, void 0, correlationId, expectedCount);
    await promises.unlink(filePath);
    await changeFuture;
  }
  test("multiple events", async function() {
    await watcher.watch([{ path: testDir, excludes: [], recursive: true }]);
    await promises.mkdir(join(testDir, "deep-multiple"));
    const newFilePath1 = join(testDir, "newFile-1.txt");
    const newFilePath2 = join(testDir, "newFile-2.txt");
    const newFilePath3 = join(testDir, "newFile-3.txt");
    const newFilePath4 = join(testDir, "deep-multiple", "newFile-1.txt");
    const newFilePath5 = join(testDir, "deep-multiple", "newFile-2.txt");
    const newFilePath6 = join(testDir, "deep-multiple", "newFile-3.txt");
    const addedFuture1 = awaitEvent(watcher, newFilePath1, FileChangeType.ADDED);
    const addedFuture2 = awaitEvent(watcher, newFilePath2, FileChangeType.ADDED);
    const addedFuture3 = awaitEvent(watcher, newFilePath3, FileChangeType.ADDED);
    const addedFuture4 = awaitEvent(watcher, newFilePath4, FileChangeType.ADDED);
    const addedFuture5 = awaitEvent(watcher, newFilePath5, FileChangeType.ADDED);
    const addedFuture6 = awaitEvent(watcher, newFilePath6, FileChangeType.ADDED);
    await Promise.all([
      await Promises.writeFile(newFilePath1, "Hello World 1"),
      await Promises.writeFile(newFilePath2, "Hello World 2"),
      await Promises.writeFile(newFilePath3, "Hello World 3"),
      await Promises.writeFile(newFilePath4, "Hello World 4"),
      await Promises.writeFile(newFilePath5, "Hello World 5"),
      await Promises.writeFile(newFilePath6, "Hello World 6")
    ]);
    await Promise.all([addedFuture1, addedFuture2, addedFuture3, addedFuture4, addedFuture5, addedFuture6]);
    const changeFuture1 = awaitEvent(watcher, newFilePath1, FileChangeType.UPDATED);
    const changeFuture2 = awaitEvent(watcher, newFilePath2, FileChangeType.UPDATED);
    const changeFuture3 = awaitEvent(watcher, newFilePath3, FileChangeType.UPDATED);
    const changeFuture4 = awaitEvent(watcher, newFilePath4, FileChangeType.UPDATED);
    const changeFuture5 = awaitEvent(watcher, newFilePath5, FileChangeType.UPDATED);
    const changeFuture6 = awaitEvent(watcher, newFilePath6, FileChangeType.UPDATED);
    await Promise.all([
      await Promises.writeFile(newFilePath1, "Hello Update 1"),
      await Promises.writeFile(newFilePath2, "Hello Update 2"),
      await Promises.writeFile(newFilePath3, "Hello Update 3"),
      await Promises.writeFile(newFilePath4, "Hello Update 4"),
      await Promises.writeFile(newFilePath5, "Hello Update 5"),
      await Promises.writeFile(newFilePath6, "Hello Update 6")
    ]);
    await Promise.all([changeFuture1, changeFuture2, changeFuture3, changeFuture4, changeFuture5, changeFuture6]);
    const copyFuture1 = awaitEvent(watcher, join(testDir, "deep-multiple-copy", "newFile-1.txt"), FileChangeType.ADDED);
    const copyFuture2 = awaitEvent(watcher, join(testDir, "deep-multiple-copy", "newFile-2.txt"), FileChangeType.ADDED);
    const copyFuture3 = awaitEvent(watcher, join(testDir, "deep-multiple-copy", "newFile-3.txt"), FileChangeType.ADDED);
    const copyFuture4 = awaitEvent(watcher, join(testDir, "deep-multiple-copy"), FileChangeType.ADDED);
    await Promises.copy(join(testDir, "deep-multiple"), join(testDir, "deep-multiple-copy"), { preserveSymlinks: false });
    await Promise.all([copyFuture1, copyFuture2, copyFuture3, copyFuture4]);
    const deleteFuture1 = awaitEvent(watcher, newFilePath1, FileChangeType.DELETED);
    const deleteFuture2 = awaitEvent(watcher, newFilePath2, FileChangeType.DELETED);
    const deleteFuture3 = awaitEvent(watcher, newFilePath3, FileChangeType.DELETED);
    const deleteFuture4 = awaitEvent(watcher, newFilePath4, FileChangeType.DELETED);
    const deleteFuture5 = awaitEvent(watcher, newFilePath5, FileChangeType.DELETED);
    const deleteFuture6 = awaitEvent(watcher, newFilePath6, FileChangeType.DELETED);
    await Promise.all([
      await promises.unlink(newFilePath1),
      await promises.unlink(newFilePath2),
      await promises.unlink(newFilePath3),
      await promises.unlink(newFilePath4),
      await promises.unlink(newFilePath5),
      await promises.unlink(newFilePath6)
    ]);
    await Promise.all([deleteFuture1, deleteFuture2, deleteFuture3, deleteFuture4, deleteFuture5, deleteFuture6]);
    const deleteFolderFuture1 = awaitEvent(watcher, join(testDir, "deep-multiple"), FileChangeType.DELETED);
    const deleteFolderFuture2 = awaitEvent(watcher, join(testDir, "deep-multiple-copy"), FileChangeType.DELETED);
    await Promise.all([Promises.rm(join(testDir, "deep-multiple"), RimRafMode.UNLINK), Promises.rm(join(testDir, "deep-multiple-copy"), RimRafMode.UNLINK)]);
    await Promise.all([deleteFolderFuture1, deleteFolderFuture2]);
  });
  test("subsequent watch updates watchers (path)", async function() {
    await watcher.watch([{ path: testDir, excludes: [join(realpathSync(testDir), "unrelated")], recursive: true }]);
    let newTextFilePath = join(testDir, "deep", "newFile.txt");
    let changeFuture = awaitEvent(watcher, newTextFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newTextFilePath, "Hello World");
    await changeFuture;
    await watcher.watch([{ path: join(testDir, "deep"), excludes: [join(realpathSync(testDir), "unrelated")], recursive: true }]);
    newTextFilePath = join(testDir, "deep", "newFile2.txt");
    changeFuture = awaitEvent(watcher, newTextFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newTextFilePath, "Hello World");
    await changeFuture;
    await watcher.watch([{ path: join(testDir, "deep"), excludes: [realpathSync(testDir)], recursive: true }]);
    await watcher.watch([{ path: join(testDir, "deep"), excludes: [], recursive: true }]);
    newTextFilePath = join(testDir, "deep", "newFile3.txt");
    changeFuture = awaitEvent(watcher, newTextFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newTextFilePath, "Hello World");
    await changeFuture;
  });
  test("invalid path does not crash watcher", async function() {
    await watcher.watch([
      { path: testDir, excludes: [], recursive: true },
      { path: join(testDir, "invalid-folder"), excludes: [], recursive: true },
      { path: FileAccess.asFileUri("").fsPath, excludes: [], recursive: true }
    ]);
    return basicCrudTest(join(testDir, "deep", "newFile.txt"));
  });
  test("subsequent watch updates watchers (excludes)", async function() {
    await watcher.watch([{ path: testDir, excludes: [realpathSync(testDir)], recursive: true }]);
    await watcher.watch([{ path: testDir, excludes: [], recursive: true }]);
    return basicCrudTest(join(testDir, "deep", "newFile.txt"));
  });
  test("subsequent watch updates watchers (includes)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: ["nothing"], recursive: true }]);
    await watcher.watch([{ path: testDir, excludes: [], recursive: true }]);
    return basicCrudTest(join(testDir, "deep", "newFile.txt"));
  });
  test("includes are supported", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: ["**/deep/**"], recursive: true }]);
    return basicCrudTest(join(testDir, "deep", "newFile.txt"));
  });
  test("includes are supported (relative pattern explicit)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: [{ base: testDir, pattern: "deep/newFile.txt" }], recursive: true }]);
    return basicCrudTest(join(testDir, "deep", "newFile.txt"));
  });
  test("includes are supported (relative pattern implicit)", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: ["deep/newFile.txt"], recursive: true }]);
    return basicCrudTest(join(testDir, "deep", "newFile.txt"));
  });
  test("excludes are supported (path)", async function() {
    return testExcludes([join(realpathSync(testDir), "deep")]);
  });
  test("excludes are supported (glob)", function() {
    return testExcludes(["deep/**"]);
  });
  async function testExcludes(excludes) {
    await watcher.watch([{ path: testDir, excludes, recursive: true }]);
    const newTextFilePath = join(testDir, "deep", "newFile.txt");
    const changeFuture = awaitEvent(watcher, newTextFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newTextFilePath, "Hello World");
    const res = await Promise.any([
      timeout(500).then(() => true),
      changeFuture.then(() => false)
    ]);
    if (!res) {
      assert.fail("Unexpected change event");
    }
  }
  (isWindows ? test.skip : test)("symlink support (root)", async function() {
    const link = join(testDir, "deep-linked");
    const linkTarget = join(testDir, "deep");
    await promises.symlink(linkTarget, link);
    await watcher.watch([{ path: link, excludes: [], recursive: true }]);
    return basicCrudTest(join(link, "newFile.txt"));
  });
  (isWindows ? test.skip : test)("symlink support (via extra watch)", async function() {
    const link = join(testDir, "deep-linked");
    const linkTarget = join(testDir, "deep");
    await promises.symlink(linkTarget, link);
    await watcher.watch([{ path: testDir, excludes: [], recursive: true }, { path: link, excludes: [], recursive: true }]);
    return basicCrudTest(join(link, "newFile.txt"));
  });
  (!isWindows ? test.skip : test)("unc support", async function() {
    addUNCHostToAllowlist("localhost");
    const uncPath = `\\\\localhost\\${getDriveLetter(testDir)?.toLowerCase()}$\\${ltrim(testDir.substr(testDir.indexOf(":") + 1), "\\")}`;
    await watcher.watch([{ path: uncPath, excludes: [], recursive: true }]);
    return basicCrudTest(join(uncPath, "deep", "newFile.txt"));
  });
  (isLinux ? test.skip : test)("wrong casing", async function() {
    const deepWrongCasedPath = join(testDir, "DEEP");
    await watcher.watch([{ path: deepWrongCasedPath, excludes: [], recursive: true }]);
    return basicCrudTest(join(deepWrongCasedPath, "newFile.txt"));
  });
  test("invalid folder does not explode", async function() {
    const invalidPath = join(testDir, "invalid");
    await watcher.watch([{ path: invalidPath, excludes: [], recursive: true }]);
  });
  (isWindows ? test.skip : test)("deleting watched path without correlation restarts watching", async function() {
    const watchedPath = join(testDir, "deep");
    await watcher.watch([{ path: watchedPath, excludes: [], recursive: true }]);
    const warnFuture = awaitMessage(watcher, "warn");
    await Promises.rm(watchedPath, RimRafMode.UNLINK);
    await warnFuture;
    await timeout(1500);
    await promises.mkdir(watchedPath);
    await timeout(1500);
    await watcher.whenReady();
    const newFilePath = join(watchedPath, "newFile.txt");
    const changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newFilePath, "Hello World");
    await changeFuture;
  });
  test("correlationId is supported", async function() {
    const correlationId = Math.random();
    await watcher.watch([{ correlationId, path: testDir, excludes: [], recursive: true }]);
    return basicCrudTest(join(testDir, "newFile.txt"), correlationId);
  });
  test("should not exclude roots that do not overlap", async () => {
    if (isWindows) {
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["C:\\a"]), ["C:\\a"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["C:\\a", "C:\\b"]), ["C:\\a", "C:\\b"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["C:\\a", "C:\\b", "C:\\c\\d\\e"]), ["C:\\a", "C:\\b", "C:\\c\\d\\e"]);
    } else {
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["/a"]), ["/a"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["/a", "/b"]), ["/a", "/b"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["/a", "/b", "/c/d/e"]), ["/a", "/b", "/c/d/e"]);
    }
  });
  test("should remove sub-folders of other paths", async () => {
    if (isWindows) {
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["C:\\a", "C:\\a\\b"]), ["C:\\a"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["C:\\a", "C:\\b", "C:\\a\\b"]), ["C:\\a", "C:\\b"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["C:\\b\\a", "C:\\a", "C:\\b", "C:\\a\\b"]), ["C:\\a", "C:\\b"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["C:\\a", "C:\\a\\b", "C:\\a\\c\\d"]), ["C:\\a"]);
    } else {
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["/a", "/a/b"]), ["/a"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["/a", "/b", "/a/b"]), ["/a", "/b"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["/b/a", "/a", "/b", "/a/b"]), ["/a", "/b"]);
      assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["/a", "/a/b", "/a/c/d"]), ["/a"]);
    }
  });
  test("should ignore when everything excluded", async () => {
    assert.deepStrictEqual(await watcher.testRemoveDuplicateRequests(["/foo/bar", "/bar"], ["**", "something"]), []);
  });
  test("watching same or overlapping paths supported when correlation is applied", async () => {
    await watcher.watch([
      { path: testDir, excludes: [], recursive: true, correlationId: 1 }
    ]);
    await basicCrudTest(join(testDir, "newFile.txt"), null, 1);
    await watcher.watch([
      { path: testDir, excludes: [], recursive: true, correlationId: 1 },
      { path: testDir, excludes: [], recursive: true, correlationId: 2 },
      { path: testDir, excludes: [], recursive: true, correlationId: void 0 }
    ]);
    await basicCrudTest(join(testDir, "newFile.txt"), null, 3);
    await basicCrudTest(join(testDir, "otherNewFile.txt"), null, 3);
    await watcher.watch([
      { path: testDir, excludes: [], recursive: true, correlationId: 1 },
      { path: testDir, excludes: [], recursive: true, correlationId: 2 },
      { path: testDir, excludes: [], recursive: true, correlationId: void 0 },
      { path: testDir, excludes: [join(realpathSync(testDir), "deep")], recursive: true, correlationId: 3 },
      { path: testDir, excludes: [join(realpathSync(testDir), "other")], recursive: true, correlationId: 4 }
    ]);
    await basicCrudTest(join(testDir, "newFile.txt"), null, 5);
    await basicCrudTest(join(testDir, "otherNewFile.txt"), null, 5);
    await watcher.watch([
      { path: dirname(testDir), excludes: [], recursive: true, correlationId: 1 },
      { path: testDir, excludes: [], recursive: true, correlationId: 2 },
      { path: join(testDir, "deep"), excludes: [], recursive: true, correlationId: 3 }
    ]);
    await basicCrudTest(join(testDir, "deep", "newFile.txt"), null, 3);
    await basicCrudTest(join(testDir, "deep", "otherNewFile.txt"), null, 3);
    await watcher.watch([
      { path: dirname(testDir), excludes: [], recursive: true, correlationId: 1 },
      { path: testDir, excludes: [join(realpathSync(testDir), "some")], recursive: true, correlationId: 2 },
      { path: join(testDir, "deep"), excludes: [join(realpathSync(testDir), "other")], recursive: true, correlationId: 3 }
    ]);
    await basicCrudTest(join(testDir, "deep", "newFile.txt"), null, 3);
    await basicCrudTest(join(testDir, "deep", "otherNewFile.txt"), null, 3);
  });
  test("watching missing path emits watcher fail event", async function() {
    const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    const folderPath = join(testDir, "missing");
    watcher.watch([{ path: folderPath, excludes: [], recursive: true }]);
    await onDidWatchFail;
  });
  test("deleting watched path emits watcher fail and delete event if correlated", async function() {
    const folderPath = join(testDir, "deep");
    await watcher.watch([{ path: folderPath, excludes: [], recursive: true, correlationId: 1 }]);
    let failed = false;
    const instance = Array.from(watcher.watchers)[0];
    assert.strictEqual(instance.include(folderPath), true);
    instance.onDidFail(() => failed = true);
    const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    const changeFuture = awaitEvent(watcher, folderPath, FileChangeType.DELETED, void 0, 1);
    Promises.rm(folderPath, RimRafMode.UNLINK);
    await onDidWatchFail;
    await changeFuture;
    assert.strictEqual(failed, true);
    assert.strictEqual(instance.failed, true);
  });
  (!isMacintosh ? test.skip : test)("watch requests support suspend/resume (folder, does not exist in beginning, not reusing watcher)", async () => {
    await testWatchFolderDoesNotExist(false);
  });
  test("watch requests support suspend/resume (folder, does not exist in beginning, reusing watcher)", async () => {
    await testWatchFolderDoesNotExist(true);
  });
  async function testWatchFolderDoesNotExist(reuseExistingWatcher) {
    let onDidWatchFail = Event.toPromise(watcher.onWatchFail);
    const folderPath = join(testDir, "not-found");
    const requests = [];
    if (reuseExistingWatcher) {
      requests.push({ path: testDir, excludes: [], recursive: true });
      await watcher.watch(requests);
    }
    const request = { path: folderPath, excludes: [], recursive: true };
    requests.push(request);
    await watcher.watch(requests);
    await onDidWatchFail;
    if (reuseExistingWatcher) {
      assert.strictEqual(watcher.isSuspended(request), true);
    } else {
      assert.strictEqual(watcher.isSuspended(request), "polling");
    }
    let changeFuture = awaitEvent(watcher, folderPath, FileChangeType.ADDED);
    let onDidWatch = Event.toPromise(watcher.onDidWatch);
    await promises.mkdir(folderPath);
    await changeFuture;
    await onDidWatch;
    assert.strictEqual(watcher.isSuspended(request), false);
    const filePath = join(folderPath, "newFile.txt");
    await basicCrudTest(filePath);
    if (!reuseExistingWatcher) {
      onDidWatchFail = Event.toPromise(watcher.onWatchFail);
      await Promises.rm(folderPath);
      await onDidWatchFail;
      changeFuture = awaitEvent(watcher, folderPath, FileChangeType.ADDED);
      onDidWatch = Event.toPromise(watcher.onDidWatch);
      await promises.mkdir(folderPath);
      await changeFuture;
      await onDidWatch;
      await basicCrudTest(filePath);
    }
  }
  (!isMacintosh ? test.skip : test)("watch requests support suspend/resume (folder, exist in beginning, not reusing watcher)", async () => {
    await testWatchFolderExists(false);
  });
  test("watch requests support suspend/resume (folder, exist in beginning, reusing watcher)", async () => {
    await testWatchFolderExists(true);
  });
  async function testWatchFolderExists(reuseExistingWatcher) {
    const folderPath = join(testDir, "deep");
    const requests = [{ path: folderPath, excludes: [], recursive: true }];
    if (reuseExistingWatcher) {
      requests.push({ path: testDir, excludes: [], recursive: true });
    }
    await watcher.watch(requests);
    const filePath = join(folderPath, "newFile.txt");
    await basicCrudTest(filePath);
    if (!reuseExistingWatcher) {
      const onDidWatchFail = Event.toPromise(watcher.onWatchFail);
      await Promises.rm(folderPath);
      await onDidWatchFail;
      const changeFuture = awaitEvent(watcher, folderPath, FileChangeType.ADDED);
      const onDidWatch = Event.toPromise(watcher.onDidWatch);
      await promises.mkdir(folderPath);
      await changeFuture;
      await onDidWatch;
      await basicCrudTest(filePath);
    }
  }
  test("watch request reuses another recursive watcher even when requests are coming in at the same time", async function() {
    const folderPath1 = join(testDir, "deep", "not-existing1");
    const folderPath2 = join(testDir, "deep", "not-existing2");
    const folderPath3 = join(testDir, "not-existing3");
    const requests = [
      { path: folderPath1, excludes: [], recursive: true, correlationId: 1 },
      { path: folderPath2, excludes: [], recursive: true, correlationId: 2 },
      { path: folderPath3, excludes: [], recursive: true, correlationId: 3 },
      { path: join(testDir, "deep"), excludes: [], recursive: true }
    ];
    await watcher.watch(requests);
    assert.strictEqual(watcher.isSuspended(requests[0]), true);
    assert.strictEqual(watcher.isSuspended(requests[1]), true);
    assert.strictEqual(watcher.isSuspended(requests[2]), "polling");
    assert.strictEqual(watcher.isSuspended(requests[3]), false);
  });
  test("event type filter", async function() {
    const request = { path: testDir, excludes: [], recursive: true, filter: FileChangeFilter.ADDED | FileChangeFilter.DELETED, correlationId: 1 };
    await watcher.watch([request]);
    const filePath = join(testDir, "lorem-newfile.txt");
    let changeFuture = awaitEvent(watcher, filePath, FileChangeType.ADDED, void 0, 1);
    await Promises.writeFile(filePath, "Hello Change");
    await changeFuture;
    changeFuture = awaitEvent(watcher, filePath, FileChangeType.DELETED, void 0, 1);
    await promises.unlink(filePath);
    await changeFuture;
  });
  (isLinux ? test.skip : test)("includes are case insensitive on Windows/Mac", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: ["**/*.TXT"], recursive: true }]);
    const newFilePath = join(testDir, "deep", "newFile.txt");
    let changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newFilePath, "Hello World");
    await changeFuture;
    changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.UPDATED);
    await Promises.writeFile(newFilePath, "Hello Change");
    await changeFuture;
    changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.DELETED);
    await promises.unlink(newFilePath);
    await changeFuture;
  });
  (isLinux ? test.skip : test)("includes are case insensitive on Windows/Mac", async function() {
    await watcher.watch([{ path: testDir, excludes: [], includes: ["**/*.TXT"], recursive: true }]);
    const newFilePath = join(testDir, "deep", "newFile.txt");
    let changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newFilePath, "Hello World");
    await changeFuture;
    changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.UPDATED);
    await Promises.writeFile(newFilePath, "Hello Change");
    await changeFuture;
    changeFuture = awaitEvent(watcher, newFilePath, FileChangeType.DELETED);
    await promises.unlink(newFilePath);
    await changeFuture;
  });
  (isLinux ? test.skip : test)("excludes are case insensitive on Windows/Mac", async function() {
    await watcher.watch([{ path: testDir, excludes: ["**/DEEP/**"], recursive: true }]);
    const newTextFilePath = join(testDir, "deep", "newFile.txt");
    const changeFuture = awaitEvent(watcher, newTextFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newTextFilePath, "Hello World");
    const res = await Promise.any([
      timeout(500).then(() => true),
      changeFuture.then(() => false)
    ]);
    if (!res) {
      assert.fail("Unexpected change event");
    }
  });
  (isLinux ? test.skip : test)("excludes are case insensitive on Windows/Mac", async function() {
    await watcher.watch([{ path: testDir, excludes: ["**/DEEP/**"], recursive: true }]);
    const newTextFilePath = join(testDir, "deep", "newFile.txt");
    const changeFuture = awaitEvent(watcher, newTextFilePath, FileChangeType.ADDED);
    await Promises.writeFile(newTextFilePath, "Hello World");
    const res = await Promise.any([
      timeout(500).then(() => true),
      changeFuture.then(() => false)
    ]);
    if (!res) {
      assert.fail("Unexpected change event");
    }
  });
});
export {
  TestParcelWatcher
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3Qvbm9kZS9wYXJjZWxXYXRjaGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyByZWFscGF0aFN5bmMsIHByb21pc2VzIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzTGludXgsIGlzTWFjaW50b3NoLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcywgUmltUmFmTW9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2Uvbm9kZS9wZnMuanMnO1xuaW1wb3J0IHsgZ2V0UmFuZG9tVGVzdFBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3Qvbm9kZS90ZXN0VXRpbHMuanMnO1xuaW1wb3J0IHsgRmlsZUNoYW5nZUZpbHRlciwgRmlsZUNoYW5nZVR5cGUsIElGaWxlQ2hhbmdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFBhcmNlbFdhdGNoZXIgfSBmcm9tICcuLi8uLi9ub2RlL3dhdGNoZXIvcGFyY2VsL3BhcmNlbFdhdGNoZXIuanMnO1xuaW1wb3J0IHsgSVJlY3Vyc2l2ZVdhdGNoUmVxdWVzdCB9IGZyb20gJy4uLy4uL2NvbW1vbi93YXRjaGVyLmpzJztcbmltcG9ydCB7IGdldERyaXZlTGV0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXh0cGF0aC5qcyc7XG5pbXBvcnQgeyBsdHJpbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGFkZFVOQ0hvc3RUb0FsbG93bGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2Uvbm9kZS91bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5leHBvcnQgY2xhc3MgVGVzdFBhcmNlbFdhdGNoZXIgZXh0ZW5kcyBQYXJjZWxXYXRjaGVyIHtcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVhZG9ubHkgc3VzcGVuZGVkV2F0Y2hSZXF1ZXN0UG9sbGluZ0ludGVydmFsID0gMTAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkV2F0Y2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRXYXRjaCA9IHRoaXMuX29uRGlkV2F0Y2guZXZlbnQ7XG5cblx0cmVhZG9ubHkgb25XYXRjaEZhaWwgPSB0aGlzLl9vbkRpZFdhdGNoRmFpbC5ldmVudDtcblxuXHRhc3luYyB0ZXN0UmVtb3ZlRHVwbGljYXRlUmVxdWVzdHMocGF0aHM6IHN0cmluZ1tdLCBleGNsdWRlczogc3RyaW5nW10gPSBbXSk6IFByb21pc2U8c3RyaW5nW10+IHtcblxuXHRcdC8vIFdvcmsgd2l0aCBzdHJpbmdzIGFzIHBhdGhzIHRvIHNpbXBsaWZ5IHRlc3Rpbmdcblx0XHRjb25zdCByZXF1ZXN0czogSVJlY3Vyc2l2ZVdhdGNoUmVxdWVzdFtdID0gcGF0aHMubWFwKHBhdGggPT4ge1xuXHRcdFx0cmV0dXJuIHsgcGF0aCwgZXhjbHVkZXMsIHJlY3Vyc2l2ZTogdHJ1ZSB9O1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIChhd2FpdCB0aGlzLnJlbW92ZUR1cGxpY2F0ZVJlcXVlc3RzKHJlcXVlc3RzLCBmYWxzZSAvKiB2YWxpZGF0ZSBwYXRocyBza2lwcGVkIGZvciB0ZXN0cyAqLykpLm1hcChyZXF1ZXN0ID0+IHJlcXVlc3QucGF0aCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0VXBkYXRlV2F0Y2hlcnNEZWxheSgpOiBudW1iZXIge1xuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIGRvV2F0Y2gocmVxdWVzdHM6IElSZWN1cnNpdmVXYXRjaFJlcXVlc3RbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHN1cGVyLmRvV2F0Y2gocmVxdWVzdHMpO1xuXHRcdGF3YWl0IHRoaXMud2hlblJlYWR5KCk7XG5cblx0XHR0aGlzLl9vbkRpZFdhdGNoLmZpcmUoKTtcblx0fVxuXG5cdGFzeW5jIHdoZW5SZWFkeSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IHdhdGNoZXIgb2YgdGhpcy53YXRjaGVycykge1xuXHRcdFx0YXdhaXQgd2F0Y2hlci5yZWFkeTtcblx0XHR9XG5cdH1cbn1cblxuLy8gdGhpcyBzdWl0ZSBoYXMgc2hvd24gZmxha3kgcnVucyBpbiBBenVyZSBwaXBlbGluZXMgd2hlcmVcbi8vIHRhc2tzIHdvdWxkIGp1c3QgaGFuZyBhbmQgdGltZW91dCBhZnRlciBhIHdoaWxlIChub3QgaW5cbi8vIG1vY2hhIGJ1dCBnZW5lcmFsbHkpLiBhcyBzdWNoIHRoZXkgd2lsbCBydW4gb25seSBvbiBkZW1hbmRcbi8vIHdoZW5ldmVyIHdlIHVwZGF0ZSB0aGUgd2F0Y2hlciBsaWJyYXJ5LlxuXG5zdWl0ZS5za2lwKCdGaWxlIFdhdGNoZXIgKHBhcmNlbCknLCBmdW5jdGlvbiAoKSB7XG5cblx0dGhpcy50aW1lb3V0KDEwMDAwKTtcblxuXHRsZXQgdGVzdERpcjogc3RyaW5nO1xuXHRsZXQgd2F0Y2hlcjogVGVzdFBhcmNlbFdhdGNoZXI7XG5cblx0bGV0IGxvZ2dpbmdFbmFibGVkID0gZmFsc2U7XG5cblx0ZnVuY3Rpb24gZW5hYmxlTG9nZ2luZyhlbmFibGU6IGJvb2xlYW4pIHtcblx0XHRsb2dnaW5nRW5hYmxlZCA9IGVuYWJsZTtcblx0XHR3YXRjaGVyPy5zZXRWZXJib3NlTG9nZ2luZyhlbmFibGUpO1xuXHR9XG5cblx0ZW5hYmxlTG9nZ2luZyhsb2dnaW5nRW5hYmxlZCk7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdHdhdGNoZXIgPSBuZXcgVGVzdFBhcmNlbFdhdGNoZXIoKTtcblx0XHR3YXRjaGVyLnNldFZlcmJvc2VMb2dnaW5nKGxvZ2dpbmdFbmFibGVkKTtcblxuXHRcdHdhdGNoZXIub25EaWRMb2dNZXNzYWdlKGUgPT4ge1xuXHRcdFx0aWYgKGxvZ2dpbmdFbmFibGVkKSB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKGBbcmVjdXJzaXZlIHdhdGNoZXIgdGVzdCBtZXNzYWdlXSAke2UubWVzc2FnZX1gKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHdhdGNoZXIub25EaWRFcnJvcihlID0+IHtcblx0XHRcdGlmIChsb2dnaW5nRW5hYmxlZCkge1xuXHRcdFx0XHRjb25zb2xlLmxvZyhgW3JlY3Vyc2l2ZSB3YXRjaGVyIHRlc3QgZXJyb3JdICR7ZS5lcnJvcn1gKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIFJ1bGUgb3V0IHN0cmFuZ2UgdGVzdGluZyBjb25kaXRpb25zIGJ5IHVzaW5nIHRoZSByZWFscGF0aFxuXHRcdC8vIGhlcmUuIGZvciBleGFtcGxlLCBvbiBtYWNPUyB0aGUgdG1wIGRpciBpcyBwb3RlbnRpYWxseSBhXG5cdFx0Ly8gc3ltbGluayBpbiBzb21lIG9mIHRoZSByb290IGZvbGRlcnMsIHdoaWNoIGlzIGEgcmF0aGVyXG5cdFx0Ly8gdW5yZWFsaXNpYyBjYXNlIGZvciB0aGUgZmlsZSB3YXRjaGVyLlxuXHRcdHRlc3REaXIgPSBVUkkuZmlsZShnZXRSYW5kb21UZXN0UGF0aChyZWFscGF0aFN5bmModG1wZGlyKCkpLCAndnNjdGVzdHMnLCAnZmlsZXdhdGNoZXInKSkuZnNQYXRoO1xuXG5cdFx0Y29uc3Qgc291cmNlRGlyID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3Qvbm9kZS9maXh0dXJlcy9zZXJ2aWNlJykuZnNQYXRoO1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMuY29weShzb3VyY2VEaXIsIHRlc3REaXIsIHsgcHJlc2VydmVTeW1saW5rczogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3YXRjaGVycyA9IEFycmF5LmZyb20od2F0Y2hlci53YXRjaGVycykubGVuZ3RoO1xuXHRcdGxldCBzdG9wcGVkSW5zdGFuY2VzID0gMDtcblx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIHdhdGNoZXIud2F0Y2hlcnMpIHtcblx0XHRcdEV2ZW50Lm9uY2UoaW5zdGFuY2Uub25EaWRTdG9wKSgoKSA9PiB7XG5cdFx0XHRcdGlmIChpbnN0YW5jZS5zdG9wcGVkKSB7XG5cdFx0XHRcdFx0c3RvcHBlZEluc3RhbmNlcysrO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhd2FpdCB3YXRjaGVyLnN0b3AoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcHBlZEluc3RhbmNlcywgd2F0Y2hlcnMsICdBbGwgd2F0Y2hlcnMgbXVzdCBiZSBzdG9wcGVkIGJlZm9yZSB0aGUgdGVzdCBlbmRzJyk7XG5cdFx0d2F0Y2hlci5kaXNwb3NlKCk7XG5cblx0XHQvLyBQb3NzaWJsZSB0aGF0IHRoZSBmaWxlIHdhdGNoZXIgaXMgc3RpbGwgaG9sZGluZ1xuXHRcdC8vIG9udG8gdGhlIGZvbGRlcnMgb24gV2luZG93cyBzcGVjaWZpY2FsbHkgYW5kIHRoZVxuXHRcdC8vIHVubGluayB3b3VsZCBmYWlsLiBJbiB0aGF0IGNhc2UsIGRvIG5vdCBmYWlsIHRoZVxuXHRcdC8vIHRlc3Qgc3VpdGUuXG5cdFx0cmV0dXJuIFByb21pc2VzLnJtKHRlc3REaXIpLmNhdGNoKGVycm9yID0+IGNvbnNvbGUuZXJyb3IoZXJyb3IpKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gdG9Nc2codHlwZTogRmlsZUNoYW5nZVR5cGUpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSBGaWxlQ2hhbmdlVHlwZS5BRERFRDogcmV0dXJuICdhZGRlZCc7XG5cdFx0XHRjYXNlIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQ6IHJldHVybiAnZGVsZXRlZCc7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gJ2NoYW5nZWQnO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGF3YWl0RXZlbnQod2F0Y2hlcjogVGVzdFBhcmNlbFdhdGNoZXIsIHBhdGg6IHN0cmluZywgdHlwZTogRmlsZUNoYW5nZVR5cGUsIGZhaWxPbkV2ZW50UmVhc29uPzogc3RyaW5nLCBjb3JyZWxhdGlvbklkPzogbnVtYmVyIHwgbnVsbCwgZXhwZWN0ZWRDb3VudD86IG51bWJlcik6IFByb21pc2U8SUZpbGVDaGFuZ2VbXT4ge1xuXHRcdGlmIChsb2dnaW5nRW5hYmxlZCkge1xuXHRcdFx0Y29uc29sZS5sb2coYEF3YWl0aW5nIGNoYW5nZSB0eXBlICcke3RvTXNnKHR5cGUpfScgb24gZmlsZSAnJHtwYXRofSdgKTtcblx0XHR9XG5cblx0XHQvLyBBd2FpdCB0aGUgZXZlbnRcblx0XHRjb25zdCByZXMgPSBhd2FpdCBuZXcgUHJvbWlzZTxJRmlsZUNoYW5nZVtdPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRsZXQgY291bnRlciA9IDA7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gd2F0Y2hlci5vbkRpZENoYW5nZUZpbGUoZXZlbnRzID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBldmVudCBvZiBldmVudHMpIHtcblx0XHRcdFx0XHRpZiAoZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbChldmVudC5yZXNvdXJjZSwgVVJJLmZpbGUocGF0aCkpICYmIGV2ZW50LnR5cGUgPT09IHR5cGUgJiYgKGNvcnJlbGF0aW9uSWQgPT09IG51bGwgfHwgZXZlbnQuY0lkID09PSBjb3JyZWxhdGlvbklkKSkge1xuXHRcdFx0XHRcdFx0Y291bnRlcisrO1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiBleHBlY3RlZENvdW50ID09PSAnbnVtYmVyJyAmJiBjb3VudGVyIDwgZXhwZWN0ZWRDb3VudCkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTsgLy8gbm90IHlldFxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdGlmIChmYWlsT25FdmVudFJlYXNvbikge1xuXHRcdFx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKGBVbmV4cGVjdGVkIGZpbGUgZXZlbnQ6ICR7ZmFpbE9uRXZlbnRSZWFzb259YCkpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0c2V0SW1tZWRpYXRlKCgpID0+IHJlc29sdmUoZXZlbnRzKSk7IC8vIGNvcGllZCBmcm9tIHBhcmNlbCB3YXRjaGVyIHRlc3RzLCBzZWVtcyB0byBkcm9wIHVucmVsYXRlZCBldmVudHMgb24gbWFjT1Ncblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHQvLyBVbndpbmQgZnJvbSB0aGUgZXZlbnQgY2FsbCBzdGFjazogd2UgaGF2ZSBzZWVuIGNyYXNoZXMgaW4gUGFyY2VsXG5cdFx0Ly8gd2hlbiBlLmcuIGNhbGxpbmcgYHVuc3Vic2NyaWJlYCBkaXJlY3RseSBmcm9tIHRoZSBzdGFjayBvZiBhIGZpbGVcblx0XHQvLyBjaGFuZ2UgZXZlbnRcblx0XHQvLyBSZWZzOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTM3NDMwXG5cdFx0YXdhaXQgdGltZW91dCgxKTtcblxuXHRcdHJldHVybiByZXM7XG5cdH1cblxuXHRmdW5jdGlvbiBhd2FpdE1lc3NhZ2Uod2F0Y2hlcjogVGVzdFBhcmNlbFdhdGNoZXIsIHR5cGU6ICd0cmFjZScgfCAnd2FybicgfCAnZXJyb3InIHwgJ2luZm8nIHwgJ2RlYnVnJyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChsb2dnaW5nRW5hYmxlZCkge1xuXHRcdFx0Y29uc29sZS5sb2coYEF3YWl0aW5nIG1lc3NhZ2Ugb2YgdHlwZSAke3R5cGV9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gQXdhaXQgdGhlIG1lc3NhZ2Vcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gd2F0Y2hlci5vbkRpZExvZ01lc3NhZ2UobXNnID0+IHtcblx0XHRcdFx0aWYgKG1zZy50eXBlID09PSB0eXBlKSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHRlc3QoJ2Jhc2ljcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXF1ZXN0ID0geyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSB9O1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3JlcXVlc3RdKTtcblxuXHRcdGNvbnN0IGluc3RhbmNlID0gQXJyYXkuZnJvbSh3YXRjaGVyLndhdGNoZXJzKVswXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdCwgaW5zdGFuY2UucmVxdWVzdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbmNlLmZhaWxlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0YW5jZS5zdG9wcGVkLCBmYWxzZSk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IHN1YnNjcmlwdGlvbnMxID0gbmV3IE1hcDxzdHJpbmcsIEZpbGVDaGFuZ2VUeXBlPigpO1xuXHRcdGNvbnN0IHN1YnNjcmlwdGlvbnMyID0gbmV3IE1hcDxzdHJpbmcsIEZpbGVDaGFuZ2VUeXBlPigpO1xuXG5cdFx0Ly8gTmV3IGZpbGVcblx0XHRjb25zdCBuZXdGaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2RlZXAnLCAnbmV3RmlsZS50eHQnKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoaW5zdGFuY2Uuc3Vic2NyaWJlKG5ld0ZpbGVQYXRoLCBjaGFuZ2UgPT4gc3Vic2NyaXB0aW9uczEuc2V0KGNoYW5nZS5yZXNvdXJjZS5mc1BhdGgsIGNoYW5nZS50eXBlKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChpbnN0YW5jZS5zdWJzY3JpYmUobmV3RmlsZVBhdGgsIGNoYW5nZSA9PiBzdWJzY3JpcHRpb25zMi5zZXQoY2hhbmdlLnJlc291cmNlLmZzUGF0aCwgY2hhbmdlLnR5cGUpKSk7IC8vIGNhbiBzdWJzY3JpYmUgbXVsdGlwbGUgdGltZXNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFuY2UuaW5jbHVkZShuZXdGaWxlUGF0aCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0YW5jZS5leGNsdWRlKG5ld0ZpbGVQYXRoKSwgZmFsc2UpO1xuXHRcdGxldCBjaGFuZ2VGdXR1cmU6IFByb21pc2U8dW5rbm93bj4gPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoLCAnSGVsbG8gV29ybGQnKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1YnNjcmlwdGlvbnMxLmdldChuZXdGaWxlUGF0aCksIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3Vic2NyaXB0aW9uczIuZ2V0KG5ld0ZpbGVQYXRoKSwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXG5cdFx0Ly8gTmV3IGZvbGRlclxuXHRcdGNvbnN0IG5ld0ZvbGRlclBhdGggPSBqb2luKHRlc3REaXIsICdkZWVwJywgJ05ldyBGb2xkZXInKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoaW5zdGFuY2Uuc3Vic2NyaWJlKG5ld0ZvbGRlclBhdGgsIGNoYW5nZSA9PiBzdWJzY3JpcHRpb25zMS5zZXQoY2hhbmdlLnJlc291cmNlLmZzUGF0aCwgY2hhbmdlLnR5cGUpKSk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGluc3RhbmNlLnN1YnNjcmliZShuZXdGb2xkZXJQYXRoLCBjaGFuZ2UgPT4gc3Vic2NyaXB0aW9uczIuc2V0KGNoYW5nZS5yZXNvdXJjZS5mc1BhdGgsIGNoYW5nZS50eXBlKSk7XG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbmNlLmluY2x1ZGUobmV3Rm9sZGVyUGF0aCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0YW5jZS5leGNsdWRlKG5ld0ZvbGRlclBhdGgpLCBmYWxzZSk7XG5cdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGb2xkZXJQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0YXdhaXQgcHJvbWlzZXMubWtkaXIobmV3Rm9sZGVyUGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJzY3JpcHRpb25zMS5nZXQobmV3Rm9sZGVyUGF0aCksIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3Vic2NyaXB0aW9uczIuaGFzKG5ld0ZvbGRlclBhdGgpLCBmYWxzZSAvKiBzdWJzY3JpcHRpb24gd2FzIGRpc3Bvc2VkIGJlZm9yZSB0aGUgZXZlbnQgKi8pO1xuXG5cdFx0Ly8gUmVuYW1lIGZpbGVcblx0XHRsZXQgcmVuYW1lZEZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnZGVlcCcsICdyZW5hbWVkRmlsZS50eHQnKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoaW5zdGFuY2Uuc3Vic2NyaWJlKHJlbmFtZWRGaWxlUGF0aCwgY2hhbmdlID0+IHN1YnNjcmlwdGlvbnMxLnNldChjaGFuZ2UucmVzb3VyY2UuZnNQYXRoLCBjaGFuZ2UudHlwZSkpKTtcblx0XHRjaGFuZ2VGdXR1cmUgPSBQcm9taXNlLmFsbChbXG5cdFx0XHRhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSxcblx0XHRcdGF3YWl0RXZlbnQod2F0Y2hlciwgcmVuYW1lZEZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRClcblx0XHRdKTtcblx0XHRhd2FpdCBQcm9taXNlcy5yZW5hbWUobmV3RmlsZVBhdGgsIHJlbmFtZWRGaWxlUGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJzY3JpcHRpb25zMS5nZXQobmV3RmlsZVBhdGgpLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3Vic2NyaXB0aW9uczEuZ2V0KHJlbmFtZWRGaWxlUGF0aCksIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblxuXHRcdC8vIFJlbmFtZSBmb2xkZXJcblx0XHRsZXQgcmVuYW1lZEZvbGRlclBhdGggPSBqb2luKHRlc3REaXIsICdkZWVwJywgJ1JlbmFtZWQgRm9sZGVyJyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGluc3RhbmNlLnN1YnNjcmliZShyZW5hbWVkRm9sZGVyUGF0aCwgY2hhbmdlID0+IHN1YnNjcmlwdGlvbnMxLnNldChjaGFuZ2UucmVzb3VyY2UuZnNQYXRoLCBjaGFuZ2UudHlwZSkpKTtcblx0XHRjaGFuZ2VGdXR1cmUgPSBQcm9taXNlLmFsbChbXG5cdFx0XHRhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZvbGRlclBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpLFxuXHRcdFx0YXdhaXRFdmVudCh3YXRjaGVyLCByZW5hbWVkRm9sZGVyUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpXG5cdFx0XSk7XG5cdFx0YXdhaXQgUHJvbWlzZXMucmVuYW1lKG5ld0ZvbGRlclBhdGgsIHJlbmFtZWRGb2xkZXJQYXRoKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1YnNjcmlwdGlvbnMxLmdldChuZXdGb2xkZXJQYXRoKSwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1YnNjcmlwdGlvbnMxLmdldChyZW5hbWVkRm9sZGVyUGF0aCksIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblxuXHRcdC8vIFJlbmFtZSBmaWxlIChzYW1lIG5hbWUsIGRpZmZlcmVudCBjYXNlKVxuXHRcdGNvbnN0IGNhc2VSZW5hbWVkRmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdkZWVwJywgJ1JlbmFtZWRGaWxlLnR4dCcpO1xuXHRcdGNoYW5nZUZ1dHVyZSA9IFByb21pc2UuYWxsKFtcblx0XHRcdGF3YWl0RXZlbnQod2F0Y2hlciwgcmVuYW1lZEZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSxcblx0XHRcdGF3YWl0RXZlbnQod2F0Y2hlciwgY2FzZVJlbmFtZWRGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpXG5cdFx0XSk7XG5cdFx0YXdhaXQgUHJvbWlzZXMucmVuYW1lKHJlbmFtZWRGaWxlUGF0aCwgY2FzZVJlbmFtZWRGaWxlUGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHRcdHJlbmFtZWRGaWxlUGF0aCA9IGNhc2VSZW5hbWVkRmlsZVBhdGg7XG5cblx0XHQvLyBSZW5hbWUgZm9sZGVyIChzYW1lIG5hbWUsIGRpZmZlcmVudCBjYXNlKVxuXHRcdGNvbnN0IGNhc2VSZW5hbWVkRm9sZGVyUGF0aCA9IGpvaW4odGVzdERpciwgJ2RlZXAnLCAnUkVuYW1lZCBGb2xkZXInKTtcblx0XHRjaGFuZ2VGdXR1cmUgPSBQcm9taXNlLmFsbChbXG5cdFx0XHRhd2FpdEV2ZW50KHdhdGNoZXIsIHJlbmFtZWRGb2xkZXJQYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSxcblx0XHRcdGF3YWl0RXZlbnQod2F0Y2hlciwgY2FzZVJlbmFtZWRGb2xkZXJQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRClcblx0XHRdKTtcblx0XHRhd2FpdCBQcm9taXNlcy5yZW5hbWUocmVuYW1lZEZvbGRlclBhdGgsIGNhc2VSZW5hbWVkRm9sZGVyUGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHRcdHJlbmFtZWRGb2xkZXJQYXRoID0gY2FzZVJlbmFtZWRGb2xkZXJQYXRoO1xuXG5cdFx0Ly8gTW92ZSBmaWxlXG5cdFx0Y29uc3QgbW92ZWRGaWxlcGF0aCA9IGpvaW4odGVzdERpciwgJ21vdmVkRmlsZS50eHQnKTtcblx0XHRjaGFuZ2VGdXR1cmUgPSBQcm9taXNlLmFsbChbXG5cdFx0XHRhd2FpdEV2ZW50KHdhdGNoZXIsIHJlbmFtZWRGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCksXG5cdFx0XHRhd2FpdEV2ZW50KHdhdGNoZXIsIG1vdmVkRmlsZXBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKVxuXHRcdF0pO1xuXHRcdGF3YWl0IFByb21pc2VzLnJlbmFtZShyZW5hbWVkRmlsZVBhdGgsIG1vdmVkRmlsZXBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIE1vdmUgZm9sZGVyXG5cdFx0Y29uc3QgbW92ZWRGb2xkZXJwYXRoID0gam9pbih0ZXN0RGlyLCAnTW92ZWQgRm9sZGVyJyk7XG5cdFx0Y2hhbmdlRnV0dXJlID0gUHJvbWlzZS5hbGwoW1xuXHRcdFx0YXdhaXRFdmVudCh3YXRjaGVyLCByZW5hbWVkRm9sZGVyUGF0aCwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCksXG5cdFx0XHRhd2FpdEV2ZW50KHdhdGNoZXIsIG1vdmVkRm9sZGVycGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpXG5cdFx0XSk7XG5cdFx0YXdhaXQgUHJvbWlzZXMucmVuYW1lKHJlbmFtZWRGb2xkZXJQYXRoLCBtb3ZlZEZvbGRlcnBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIENvcHkgZmlsZVxuXHRcdGNvbnN0IGNvcGllZEZpbGVwYXRoID0gam9pbih0ZXN0RGlyLCAnZGVlcCcsICdjb3BpZWRGaWxlLnR4dCcpO1xuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgY29waWVkRmlsZXBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRhd2FpdCBwcm9taXNlcy5jb3B5RmlsZShtb3ZlZEZpbGVwYXRoLCBjb3BpZWRGaWxlcGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gQ29weSBmb2xkZXJcblx0XHRjb25zdCBjb3BpZWRGb2xkZXJwYXRoID0gam9pbih0ZXN0RGlyLCAnZGVlcCcsICdDb3BpZWQgRm9sZGVyJyk7XG5cdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBjb3BpZWRGb2xkZXJwYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMuY29weShtb3ZlZEZvbGRlcnBhdGgsIGNvcGllZEZvbGRlcnBhdGgsIHsgcHJlc2VydmVTeW1saW5rczogZmFsc2UgfSk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gQ2hhbmdlIGZpbGVcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGNvcGllZEZpbGVwYXRoLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUoY29waWVkRmlsZXBhdGgsICdIZWxsbyBDaGFuZ2UnKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHQvLyBDcmVhdGUgbmV3IGZpbGVcblx0XHRjb25zdCBhbm90aGVyTmV3RmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdkZWVwJywgJ2Fub3RoZXJOZXdGaWxlLnR4dCcpO1xuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgYW5vdGhlck5ld0ZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKGFub3RoZXJOZXdGaWxlUGF0aCwgJ0hlbGxvIEFub3RoZXIgV29ybGQnKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHQvLyBSZWFkIGZpbGUgZG9lcyBub3QgZW1pdCBldmVudFxuXHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgYW5vdGhlck5ld0ZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVELCAndW5leHBlY3RlZC1ldmVudC1mcm9tLXJlYWQtZmlsZScpO1xuXHRcdGF3YWl0IHByb21pc2VzLnJlYWRGaWxlKGFub3RoZXJOZXdGaWxlUGF0aCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yYWNlKFt0aW1lb3V0KDEwMCksIGNoYW5nZUZ1dHVyZV0pO1xuXG5cdFx0Ly8gU3RhdCBmaWxlIGRvZXMgbm90IGVtaXQgZXZlbnRcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGFub3RoZXJOZXdGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCwgJ3VuZXhwZWN0ZWQtZXZlbnQtZnJvbS1zdGF0Jyk7XG5cdFx0YXdhaXQgcHJvbWlzZXMuc3RhdChhbm90aGVyTmV3RmlsZVBhdGgpO1xuXHRcdGF3YWl0IFByb21pc2UucmFjZShbdGltZW91dCgxMDApLCBjaGFuZ2VGdXR1cmVdKTtcblxuXHRcdC8vIFN0YXQgZm9sZGVyIGRvZXMgbm90IGVtaXQgZXZlbnRcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGNvcGllZEZvbGRlcnBhdGgsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQsICd1bmV4cGVjdGVkLWV2ZW50LWZyb20tc3RhdCcpO1xuXHRcdGF3YWl0IHByb21pc2VzLnN0YXQoY29waWVkRm9sZGVycGF0aCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yYWNlKFt0aW1lb3V0KDEwMCksIGNoYW5nZUZ1dHVyZV0pO1xuXG5cdFx0Ly8gRGVsZXRlIGZpbGVcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGNvcGllZEZpbGVwYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoaW5zdGFuY2Uuc3Vic2NyaWJlKGNvcGllZEZpbGVwYXRoLCBjaGFuZ2UgPT4gc3Vic2NyaXB0aW9uczEuc2V0KGNoYW5nZS5yZXNvdXJjZS5mc1BhdGgsIGNoYW5nZS50eXBlKSkpO1xuXHRcdGF3YWl0IHByb21pc2VzLnVubGluayhjb3BpZWRGaWxlcGF0aCk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJzY3JpcHRpb25zMS5nZXQoY29waWVkRmlsZXBhdGgpLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTtcblxuXHRcdC8vIERlbGV0ZSBmb2xkZXJcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGNvcGllZEZvbGRlcnBhdGgsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChpbnN0YW5jZS5zdWJzY3JpYmUoY29waWVkRm9sZGVycGF0aCwgY2hhbmdlID0+IHN1YnNjcmlwdGlvbnMxLnNldChjaGFuZ2UucmVzb3VyY2UuZnNQYXRoLCBjaGFuZ2UudHlwZSkpKTtcblx0XHRhd2FpdCBwcm9taXNlcy5ybWRpcihjb3BpZWRGb2xkZXJwYXRoKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1YnNjcmlwdGlvbnMxLmdldChjb3BpZWRGb2xkZXJwYXRoKSwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdChpc01hY2ludG9zaCAvKiB0aGlzIHRlc3Qgc2VlbXMgbm90IHBvc3NpYmxlIHdpdGggZnNldmVudHMgYmFja2VuZCAqLyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdiYXNpY3MgKGF0b21pYyB3cml0ZXMpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXG5cdFx0Ly8gRGVsZXRlICsgUmVjcmVhdGUgZmlsZVxuXHRcdGNvbnN0IG5ld0ZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnZGVlcCcsICdjb253YXkuanMnKTtcblx0XHRjb25zdCBjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKTtcblx0XHRhd2FpdCBwcm9taXNlcy51bmxpbmsobmV3RmlsZVBhdGgpO1xuXHRcdFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aCwgJ0hlbGxvIEF0b21pYyBXb3JsZCcpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0fSk7XG5cblx0KCFpc0xpbnV4IC8qIHBvbGxpbmcgaXMgb25seSB1c2VkIGluIGxpbnV4IGVudmlyb25tZW50cyAoV1NMKSAqLyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdiYXNpY3MgKHBvbGxpbmcpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCBwb2xsaW5nSW50ZXJ2YWw6IDEwMCwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KGpvaW4odGVzdERpciwgJ2RlZXAnLCAnbmV3RmlsZS50eHQnKSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGJhc2ljQ3J1ZFRlc3QoZmlsZVBhdGg6IHN0cmluZywgY29ycmVsYXRpb25JZD86IG51bWJlciB8IG51bGwsIGV4cGVjdGVkQ291bnQ/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIE5ldyBmaWxlXG5cdFx0bGV0IGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgZmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVELCB1bmRlZmluZWQsIGNvcnJlbGF0aW9uSWQsIGV4cGVjdGVkQ291bnQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShmaWxlUGF0aCwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gQ2hhbmdlIGZpbGVcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVELCB1bmRlZmluZWQsIGNvcnJlbGF0aW9uSWQsIGV4cGVjdGVkQ291bnQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShmaWxlUGF0aCwgJ0hlbGxvIENoYW5nZScpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIERlbGV0ZSBmaWxlXG5cdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCwgdW5kZWZpbmVkLCBjb3JyZWxhdGlvbklkLCBleHBlY3RlZENvdW50KTtcblx0XHRhd2FpdCBwcm9taXNlcy51bmxpbmsoZmlsZVBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0fVxuXG5cdHRlc3QoJ211bHRpcGxlIGV2ZW50cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblx0XHRhd2FpdCBwcm9taXNlcy5ta2Rpcihqb2luKHRlc3REaXIsICdkZWVwLW11bHRpcGxlJykpO1xuXG5cdFx0Ly8gbXVsdGlwbGUgYWRkXG5cblx0XHRjb25zdCBuZXdGaWxlUGF0aDEgPSBqb2luKHRlc3REaXIsICduZXdGaWxlLTEudHh0Jyk7XG5cdFx0Y29uc3QgbmV3RmlsZVBhdGgyID0gam9pbih0ZXN0RGlyLCAnbmV3RmlsZS0yLnR4dCcpO1xuXHRcdGNvbnN0IG5ld0ZpbGVQYXRoMyA9IGpvaW4odGVzdERpciwgJ25ld0ZpbGUtMy50eHQnKTtcblx0XHRjb25zdCBuZXdGaWxlUGF0aDQgPSBqb2luKHRlc3REaXIsICdkZWVwLW11bHRpcGxlJywgJ25ld0ZpbGUtMS50eHQnKTtcblx0XHRjb25zdCBuZXdGaWxlUGF0aDUgPSBqb2luKHRlc3REaXIsICdkZWVwLW11bHRpcGxlJywgJ25ld0ZpbGUtMi50eHQnKTtcblx0XHRjb25zdCBuZXdGaWxlUGF0aDYgPSBqb2luKHRlc3REaXIsICdkZWVwLW11bHRpcGxlJywgJ25ld0ZpbGUtMy50eHQnKTtcblxuXHRcdGNvbnN0IGFkZGVkRnV0dXJlMSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgxLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0Y29uc3QgYWRkZWRGdXR1cmUyID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aDIsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRjb25zdCBhZGRlZEZ1dHVyZTMgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoMywgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGNvbnN0IGFkZGVkRnV0dXJlNCA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGg0LCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0Y29uc3QgYWRkZWRGdXR1cmU1ID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aDUsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRjb25zdCBhZGRlZEZ1dHVyZTYgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoNiwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoMSwgJ0hlbGxvIFdvcmxkIDEnKSxcblx0XHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aDIsICdIZWxsbyBXb3JsZCAyJyksXG5cdFx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGgzLCAnSGVsbG8gV29ybGQgMycpLFxuXHRcdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoNCwgJ0hlbGxvIFdvcmxkIDQnKSxcblx0XHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aDUsICdIZWxsbyBXb3JsZCA1JyksXG5cdFx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGg2LCAnSGVsbG8gV29ybGQgNicpXG5cdFx0XSk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbYWRkZWRGdXR1cmUxLCBhZGRlZEZ1dHVyZTIsIGFkZGVkRnV0dXJlMywgYWRkZWRGdXR1cmU0LCBhZGRlZEZ1dHVyZTUsIGFkZGVkRnV0dXJlNl0pO1xuXG5cdFx0Ly8gbXVsdGlwbGUgY2hhbmdlXG5cblx0XHRjb25zdCBjaGFuZ2VGdXR1cmUxID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aDEsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpO1xuXHRcdGNvbnN0IGNoYW5nZUZ1dHVyZTIgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoMiwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCk7XG5cdFx0Y29uc3QgY2hhbmdlRnV0dXJlMyA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgzLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKTtcblx0XHRjb25zdCBjaGFuZ2VGdXR1cmU0ID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aDQsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpO1xuXHRcdGNvbnN0IGNoYW5nZUZ1dHVyZTUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoNSwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCk7XG5cdFx0Y29uc3QgY2hhbmdlRnV0dXJlNiA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGg2LCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aDEsICdIZWxsbyBVcGRhdGUgMScpLFxuXHRcdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoMiwgJ0hlbGxvIFVwZGF0ZSAyJyksXG5cdFx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGgzLCAnSGVsbG8gVXBkYXRlIDMnKSxcblx0XHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aDQsICdIZWxsbyBVcGRhdGUgNCcpLFxuXHRcdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoNSwgJ0hlbGxvIFVwZGF0ZSA1JyksXG5cdFx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGg2LCAnSGVsbG8gVXBkYXRlIDYnKVxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2NoYW5nZUZ1dHVyZTEsIGNoYW5nZUZ1dHVyZTIsIGNoYW5nZUZ1dHVyZTMsIGNoYW5nZUZ1dHVyZTQsIGNoYW5nZUZ1dHVyZTUsIGNoYW5nZUZ1dHVyZTZdKTtcblxuXHRcdC8vIGNvcHkgd2l0aCBtdWx0aXBsZSBmaWxlc1xuXG5cdFx0Y29uc3QgY29weUZ1dHVyZTEgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGpvaW4odGVzdERpciwgJ2RlZXAtbXVsdGlwbGUtY29weScsICduZXdGaWxlLTEudHh0JyksIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRjb25zdCBjb3B5RnV0dXJlMiA9IGF3YWl0RXZlbnQod2F0Y2hlciwgam9pbih0ZXN0RGlyLCAnZGVlcC1tdWx0aXBsZS1jb3B5JywgJ25ld0ZpbGUtMi50eHQnKSwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGNvbnN0IGNvcHlGdXR1cmUzID0gYXdhaXRFdmVudCh3YXRjaGVyLCBqb2luKHRlc3REaXIsICdkZWVwLW11bHRpcGxlLWNvcHknLCAnbmV3RmlsZS0zLnR4dCcpLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0Y29uc3QgY29weUZ1dHVyZTQgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGpvaW4odGVzdERpciwgJ2RlZXAtbXVsdGlwbGUtY29weScpLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cblx0XHRhd2FpdCBQcm9taXNlcy5jb3B5KGpvaW4odGVzdERpciwgJ2RlZXAtbXVsdGlwbGUnKSwgam9pbih0ZXN0RGlyLCAnZGVlcC1tdWx0aXBsZS1jb3B5JyksIHsgcHJlc2VydmVTeW1saW5rczogZmFsc2UgfSk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbY29weUZ1dHVyZTEsIGNvcHlGdXR1cmUyLCBjb3B5RnV0dXJlMywgY29weUZ1dHVyZTRdKTtcblxuXHRcdC8vIG11bHRpcGxlIGRlbGV0ZSAoc2luZ2xlIGZpbGVzKVxuXG5cdFx0Y29uc3QgZGVsZXRlRnV0dXJlMSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgxLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTtcblx0XHRjb25zdCBkZWxldGVGdXR1cmUyID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aDIsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXHRcdGNvbnN0IGRlbGV0ZUZ1dHVyZTMgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoMywgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCk7XG5cdFx0Y29uc3QgZGVsZXRlRnV0dXJlNCA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGg0LCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTtcblx0XHRjb25zdCBkZWxldGVGdXR1cmU1ID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aDUsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXHRcdGNvbnN0IGRlbGV0ZUZ1dHVyZTYgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoNiwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRhd2FpdCBwcm9taXNlcy51bmxpbmsobmV3RmlsZVBhdGgxKSxcblx0XHRcdGF3YWl0IHByb21pc2VzLnVubGluayhuZXdGaWxlUGF0aDIpLFxuXHRcdFx0YXdhaXQgcHJvbWlzZXMudW5saW5rKG5ld0ZpbGVQYXRoMyksXG5cdFx0XHRhd2FpdCBwcm9taXNlcy51bmxpbmsobmV3RmlsZVBhdGg0KSxcblx0XHRcdGF3YWl0IHByb21pc2VzLnVubGluayhuZXdGaWxlUGF0aDUpLFxuXHRcdFx0YXdhaXQgcHJvbWlzZXMudW5saW5rKG5ld0ZpbGVQYXRoNilcblx0XHRdKTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtkZWxldGVGdXR1cmUxLCBkZWxldGVGdXR1cmUyLCBkZWxldGVGdXR1cmUzLCBkZWxldGVGdXR1cmU0LCBkZWxldGVGdXR1cmU1LCBkZWxldGVGdXR1cmU2XSk7XG5cblx0XHQvLyBtdWx0aXBsZSBkZWxldGUgKGZvbGRlcilcblxuXHRcdGNvbnN0IGRlbGV0ZUZvbGRlckZ1dHVyZTEgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIGpvaW4odGVzdERpciwgJ2RlZXAtbXVsdGlwbGUnKSwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCk7XG5cdFx0Y29uc3QgZGVsZXRlRm9sZGVyRnV0dXJlMiA9IGF3YWl0RXZlbnQod2F0Y2hlciwgam9pbih0ZXN0RGlyLCAnZGVlcC1tdWx0aXBsZS1jb3B5JyksIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1Byb21pc2VzLnJtKGpvaW4odGVzdERpciwgJ2RlZXAtbXVsdGlwbGUnKSwgUmltUmFmTW9kZS5VTkxJTkspLCBQcm9taXNlcy5ybShqb2luKHRlc3REaXIsICdkZWVwLW11bHRpcGxlLWNvcHknKSwgUmltUmFmTW9kZS5VTkxJTkspXSk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbZGVsZXRlRm9sZGVyRnV0dXJlMSwgZGVsZXRlRm9sZGVyRnV0dXJlMl0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdWJzZXF1ZW50IHdhdGNoIHVwZGF0ZXMgd2F0Y2hlcnMgKHBhdGgpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtqb2luKHJlYWxwYXRoU3luYyh0ZXN0RGlyKSwgJ3VucmVsYXRlZCcpXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblxuXHRcdC8vIE5ldyBmaWxlICgqLnR4dClcblx0XHRsZXQgbmV3VGV4dEZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnZGVlcCcsICduZXdGaWxlLnR4dCcpO1xuXHRcdGxldCBjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld1RleHRGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdUZXh0RmlsZVBhdGgsICdIZWxsbyBXb3JsZCcpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogam9pbih0ZXN0RGlyLCAnZGVlcCcpLCBleGNsdWRlczogW2pvaW4ocmVhbHBhdGhTeW5jKHRlc3REaXIpLCAndW5yZWxhdGVkJyldLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXHRcdG5ld1RleHRGaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2RlZXAnLCAnbmV3RmlsZTIudHh0Jyk7XG5cdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdUZXh0RmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3VGV4dEZpbGVQYXRoLCAnSGVsbG8gV29ybGQnKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IGpvaW4odGVzdERpciwgJ2RlZXAnKSwgZXhjbHVkZXM6IFtyZWFscGF0aFN5bmModGVzdERpcildLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogam9pbih0ZXN0RGlyLCAnZGVlcCcpLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSB9XSk7XG5cdFx0bmV3VGV4dEZpbGVQYXRoID0gam9pbih0ZXN0RGlyLCAnZGVlcCcsICduZXdGaWxlMy50eHQnKTtcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld1RleHRGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdUZXh0RmlsZVBhdGgsICdIZWxsbyBXb3JsZCcpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZCBwYXRoIGRvZXMgbm90IGNyYXNoIHdhdGNoZXInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbXG5cdFx0XHR7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH0sXG5cdFx0XHR7IHBhdGg6IGpvaW4odGVzdERpciwgJ2ludmFsaWQtZm9sZGVyJyksIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH0sXG5cdFx0XHR7IHBhdGg6IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCcnKS5mc1BhdGgsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH1cblx0XHRdKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KGpvaW4odGVzdERpciwgJ2RlZXAnLCAnbmV3RmlsZS50eHQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1YnNlcXVlbnQgd2F0Y2ggdXBkYXRlcyB3YXRjaGVycyAoZXhjbHVkZXMpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtyZWFscGF0aFN5bmModGVzdERpcildLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnZGVlcCcsICduZXdGaWxlLnR4dCcpKTtcblx0fSk7XG5cblx0dGVzdCgnc3Vic2VxdWVudCB3YXRjaCB1cGRhdGVzIHdhdGNoZXJzIChpbmNsdWRlcyknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIGluY2x1ZGVzOiBbJ25vdGhpbmcnXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KGpvaW4odGVzdERpciwgJ2RlZXAnLCAnbmV3RmlsZS50eHQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY2x1ZGVzIGFyZSBzdXBwb3J0ZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIGluY2x1ZGVzOiBbJyoqL2RlZXAvKionXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KGpvaW4odGVzdERpciwgJ2RlZXAnLCAnbmV3RmlsZS50eHQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY2x1ZGVzIGFyZSBzdXBwb3J0ZWQgKHJlbGF0aXZlIHBhdHRlcm4gZXhwbGljaXQpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCBpbmNsdWRlczogW3sgYmFzZTogdGVzdERpciwgcGF0dGVybjogJ2RlZXAvbmV3RmlsZS50eHQnIH1dLCByZWN1cnNpdmU6IHRydWUgfV0pO1xuXG5cdFx0cmV0dXJuIGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnZGVlcCcsICduZXdGaWxlLnR4dCcpKTtcblx0fSk7XG5cblx0dGVzdCgnaW5jbHVkZXMgYXJlIHN1cHBvcnRlZCAocmVsYXRpdmUgcGF0dGVybiBpbXBsaWNpdCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIGluY2x1ZGVzOiBbJ2RlZXAvbmV3RmlsZS50eHQnXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KGpvaW4odGVzdERpciwgJ2RlZXAnLCAnbmV3RmlsZS50eHQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIGFyZSBzdXBwb3J0ZWQgKHBhdGgpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0ZXN0RXhjbHVkZXMoW2pvaW4ocmVhbHBhdGhTeW5jKHRlc3REaXIpLCAnZGVlcCcpXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIGFyZSBzdXBwb3J0ZWQgKGdsb2IpJywgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0ZXN0RXhjbHVkZXMoWydkZWVwLyoqJ10pO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0RXhjbHVkZXMoZXhjbHVkZXM6IHN0cmluZ1tdKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlcywgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblxuXHRcdC8vIE5ldyBmaWxlICgqLnR4dClcblx0XHRjb25zdCBuZXdUZXh0RmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdkZWVwJywgJ25ld0ZpbGUudHh0Jyk7XG5cdFx0Y29uc3QgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdUZXh0RmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3VGV4dEZpbGVQYXRoLCAnSGVsbG8gV29ybGQnKTtcblxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IFByb21pc2UuYW55KFtcblx0XHRcdHRpbWVvdXQoNTAwKS50aGVuKCgpID0+IHRydWUpLFxuXHRcdFx0Y2hhbmdlRnV0dXJlLnRoZW4oKCkgPT4gZmFsc2UpXG5cdFx0XSk7XG5cblx0XHRpZiAoIXJlcykge1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ1VuZXhwZWN0ZWQgY2hhbmdlIGV2ZW50Jyk7XG5cdFx0fVxuXHR9XG5cblx0KGlzV2luZG93cyAvKiB3aW5kb3dzOiBjYW5ub3QgY3JlYXRlIGZpbGUgc3ltYm9saWMgbGluayB3aXRob3V0IGVsZXZhdGVkIGNvbnRleHQgKi8gPyB0ZXN0LnNraXAgOiB0ZXN0KSgnc3ltbGluayBzdXBwb3J0IChyb290KScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBsaW5rID0gam9pbih0ZXN0RGlyLCAnZGVlcC1saW5rZWQnKTtcblx0XHRjb25zdCBsaW5rVGFyZ2V0ID0gam9pbih0ZXN0RGlyLCAnZGVlcCcpO1xuXHRcdGF3YWl0IHByb21pc2VzLnN5bWxpbmsobGlua1RhcmdldCwgbGluayk7XG5cblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IGxpbmssIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KGpvaW4obGluaywgJ25ld0ZpbGUudHh0JykpO1xuXHR9KTtcblxuXHQoaXNXaW5kb3dzIC8qIHdpbmRvd3M6IGNhbm5vdCBjcmVhdGUgZmlsZSBzeW1ib2xpYyBsaW5rIHdpdGhvdXQgZWxldmF0ZWQgY29udGV4dCAqLyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdzeW1saW5rIHN1cHBvcnQgKHZpYSBleHRyYSB3YXRjaCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbGluayA9IGpvaW4odGVzdERpciwgJ2RlZXAtbGlua2VkJyk7XG5cdFx0Y29uc3QgbGlua1RhcmdldCA9IGpvaW4odGVzdERpciwgJ2RlZXAnKTtcblx0XHRhd2FpdCBwcm9taXNlcy5zeW1saW5rKGxpbmtUYXJnZXQsIGxpbmspO1xuXG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSB9LCB7IHBhdGg6IGxpbmssIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KGpvaW4obGluaywgJ25ld0ZpbGUudHh0JykpO1xuXHR9KTtcblxuXHQoIWlzV2luZG93cyAvKiBVTkMgaXMgd2luZG93cyBvbmx5ICovID8gdGVzdC5za2lwIDogdGVzdCkoJ3VuYyBzdXBwb3J0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGFkZFVOQ0hvc3RUb0FsbG93bGlzdCgnbG9jYWxob3N0Jyk7XG5cblx0XHQvLyBMb2NhbCBVTkMgcGF0aHMgYXJlIGluIHRoZSBmb3JtIG9mOiBcXFxcbG9jYWxob3N0XFxjJFxcbXlfZGlyXG5cdFx0Y29uc3QgdW5jUGF0aCA9IGBcXFxcXFxcXGxvY2FsaG9zdFxcXFwke2dldERyaXZlTGV0dGVyKHRlc3REaXIpPy50b0xvd2VyQ2FzZSgpfSRcXFxcJHtsdHJpbSh0ZXN0RGlyLnN1YnN0cih0ZXN0RGlyLmluZGV4T2YoJzonKSArIDEpLCAnXFxcXCcpfWA7XG5cblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHVuY1BhdGgsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KGpvaW4odW5jUGF0aCwgJ2RlZXAnLCAnbmV3RmlsZS50eHQnKSk7XG5cdH0pO1xuXG5cdChpc0xpbnV4IC8qIGxpbnV4OiBpcyBjYXNlIHNlbnNpdGl2ZSAqLyA/IHRlc3Quc2tpcCA6IHRlc3QpKCd3cm9uZyBjYXNpbmcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZGVlcFdyb25nQ2FzZWRQYXRoID0gam9pbih0ZXN0RGlyLCAnREVFUCcpO1xuXG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiBkZWVwV3JvbmdDYXNlZFBhdGgsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KGpvaW4oZGVlcFdyb25nQ2FzZWRQYXRoLCAnbmV3RmlsZS50eHQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ludmFsaWQgZm9sZGVyIGRvZXMgbm90IGV4cGxvZGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaW52YWxpZFBhdGggPSBqb2luKHRlc3REaXIsICdpbnZhbGlkJyk7XG5cblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IGludmFsaWRQYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSB9XSk7XG5cdH0pO1xuXG5cdChpc1dpbmRvd3MgLyogZmxha3kgb24gd2luZG93cyAqLyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdkZWxldGluZyB3YXRjaGVkIHBhdGggd2l0aG91dCBjb3JyZWxhdGlvbiByZXN0YXJ0cyB3YXRjaGluZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB3YXRjaGVkUGF0aCA9IGpvaW4odGVzdERpciwgJ2RlZXAnKTtcblxuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogd2F0Y2hlZFBhdGgsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblxuXHRcdC8vIERlbGV0ZSB3YXRjaGVkIHBhdGggYW5kIGF3YWl0XG5cdFx0Y29uc3Qgd2FybkZ1dHVyZSA9IGF3YWl0TWVzc2FnZSh3YXRjaGVyLCAnd2FybicpO1xuXHRcdGF3YWl0IFByb21pc2VzLnJtKHdhdGNoZWRQYXRoLCBSaW1SYWZNb2RlLlVOTElOSyk7XG5cdFx0YXdhaXQgd2FybkZ1dHVyZTtcblxuXHRcdC8vIFJlc3RvcmUgd2F0Y2hlZCBwYXRoXG5cdFx0YXdhaXQgdGltZW91dCgxNTAwKTsgLy8gbm9kZS5qcyB3YXRjaGVyIHVzZWQgZm9yIG1vbml0b3JpbmcgZm9sZGVyIHJlc3RvcmUgaXMgYXN5bmNcblx0XHRhd2FpdCBwcm9taXNlcy5ta2Rpcih3YXRjaGVkUGF0aCk7XG5cdFx0YXdhaXQgdGltZW91dCgxNTAwKTsgLy8gcmVzdGFydCBpcyBkZWxheWVkXG5cdFx0YXdhaXQgd2F0Y2hlci53aGVuUmVhZHkoKTtcblxuXHRcdC8vIFZlcmlmeSBldmVudHMgY29tZSBpbiBhZ2FpblxuXHRcdGNvbnN0IG5ld0ZpbGVQYXRoID0gam9pbih3YXRjaGVkUGF0aCwgJ25ld0ZpbGUudHh0Jyk7XG5cdFx0Y29uc3QgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdGaWxlUGF0aCwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3JyZWxhdGlvbklkIGlzIHN1cHBvcnRlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjb3JyZWxhdGlvbklkID0gTWF0aC5yYW5kb20oKTtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IGNvcnJlbGF0aW9uSWQsIHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblxuXHRcdHJldHVybiBiYXNpY0NydWRUZXN0KGpvaW4odGVzdERpciwgJ25ld0ZpbGUudHh0JyksIGNvcnJlbGF0aW9uSWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbm90IGV4Y2x1ZGUgcm9vdHMgdGhhdCBkbyBub3Qgb3ZlcmxhcCcsIGFzeW5jICgpID0+IHtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHdhdGNoZXIudGVzdFJlbW92ZUR1cGxpY2F0ZVJlcXVlc3RzKFsnQzpcXFxcYSddKSwgWydDOlxcXFxhJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCB3YXRjaGVyLnRlc3RSZW1vdmVEdXBsaWNhdGVSZXF1ZXN0cyhbJ0M6XFxcXGEnLCAnQzpcXFxcYiddKSwgWydDOlxcXFxhJywgJ0M6XFxcXGInXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHdhdGNoZXIudGVzdFJlbW92ZUR1cGxpY2F0ZVJlcXVlc3RzKFsnQzpcXFxcYScsICdDOlxcXFxiJywgJ0M6XFxcXGNcXFxcZFxcXFxlJ10pLCBbJ0M6XFxcXGEnLCAnQzpcXFxcYicsICdDOlxcXFxjXFxcXGRcXFxcZSddKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCB3YXRjaGVyLnRlc3RSZW1vdmVEdXBsaWNhdGVSZXF1ZXN0cyhbJy9hJ10pLCBbJy9hJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCB3YXRjaGVyLnRlc3RSZW1vdmVEdXBsaWNhdGVSZXF1ZXN0cyhbJy9hJywgJy9iJ10pLCBbJy9hJywgJy9iJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCB3YXRjaGVyLnRlc3RSZW1vdmVEdXBsaWNhdGVSZXF1ZXN0cyhbJy9hJywgJy9iJywgJy9jL2QvZSddKSwgWycvYScsICcvYicsICcvYy9kL2UnXSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmVtb3ZlIHN1Yi1mb2xkZXJzIG9mIG90aGVyIHBhdGhzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgd2F0Y2hlci50ZXN0UmVtb3ZlRHVwbGljYXRlUmVxdWVzdHMoWydDOlxcXFxhJywgJ0M6XFxcXGFcXFxcYiddKSwgWydDOlxcXFxhJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCB3YXRjaGVyLnRlc3RSZW1vdmVEdXBsaWNhdGVSZXF1ZXN0cyhbJ0M6XFxcXGEnLCAnQzpcXFxcYicsICdDOlxcXFxhXFxcXGInXSksIFsnQzpcXFxcYScsICdDOlxcXFxiJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCB3YXRjaGVyLnRlc3RSZW1vdmVEdXBsaWNhdGVSZXF1ZXN0cyhbJ0M6XFxcXGJcXFxcYScsICdDOlxcXFxhJywgJ0M6XFxcXGInLCAnQzpcXFxcYVxcXFxiJ10pLCBbJ0M6XFxcXGEnLCAnQzpcXFxcYiddKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgd2F0Y2hlci50ZXN0UmVtb3ZlRHVwbGljYXRlUmVxdWVzdHMoWydDOlxcXFxhJywgJ0M6XFxcXGFcXFxcYicsICdDOlxcXFxhXFxcXGNcXFxcZCddKSwgWydDOlxcXFxhJ10pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHdhdGNoZXIudGVzdFJlbW92ZUR1cGxpY2F0ZVJlcXVlc3RzKFsnL2EnLCAnL2EvYiddKSwgWycvYSddKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgd2F0Y2hlci50ZXN0UmVtb3ZlRHVwbGljYXRlUmVxdWVzdHMoWycvYScsICcvYicsICcvYS9iJ10pLCBbJy9hJywgJy9iJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCB3YXRjaGVyLnRlc3RSZW1vdmVEdXBsaWNhdGVSZXF1ZXN0cyhbJy9iL2EnLCAnL2EnLCAnL2InLCAnL2EvYiddKSwgWycvYScsICcvYiddKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgd2F0Y2hlci50ZXN0UmVtb3ZlRHVwbGljYXRlUmVxdWVzdHMoWycvYScsICcvYS9iJywgJy9hL2MvZCddKSwgWycvYSddKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBpZ25vcmUgd2hlbiBldmVyeXRoaW5nIGV4Y2x1ZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgd2F0Y2hlci50ZXN0UmVtb3ZlRHVwbGljYXRlUmVxdWVzdHMoWycvZm9vL2JhcicsICcvYmFyJ10sIFsnKionLCAnc29tZXRoaW5nJ10pLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhdGNoaW5nIHNhbWUgb3Igb3ZlcmxhcHBpbmcgcGF0aHMgc3VwcG9ydGVkIHdoZW4gY29ycmVsYXRpb24gaXMgYXBwbGllZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFtcblx0XHRcdHsgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUsIGNvcnJlbGF0aW9uSWQ6IDEgfVxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICduZXdGaWxlLnR4dCcpLCBudWxsLCAxKTtcblxuXHRcdC8vIHNhbWUgcGF0aCwgc2FtZSBvcHRpb25zXG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbXG5cdFx0XHR7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlLCBjb3JyZWxhdGlvbklkOiAxIH0sXG5cdFx0XHR7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlLCBjb3JyZWxhdGlvbklkOiAyLCB9LFxuXHRcdFx0eyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSwgY29ycmVsYXRpb25JZDogdW5kZWZpbmVkIH1cblx0XHRdKTtcblxuXHRcdGF3YWl0IGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnbmV3RmlsZS50eHQnKSwgbnVsbCwgMyk7XG5cdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICdvdGhlck5ld0ZpbGUudHh0JyksIG51bGwsIDMpO1xuXG5cdFx0Ly8gc2FtZSBwYXRoLCBkaWZmZXJlbnQgb3B0aW9uc1xuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW1xuXHRcdFx0eyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSwgY29ycmVsYXRpb25JZDogMSB9LFxuXHRcdFx0eyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSwgY29ycmVsYXRpb25JZDogMiB9LFxuXHRcdFx0eyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSwgY29ycmVsYXRpb25JZDogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbam9pbihyZWFscGF0aFN5bmModGVzdERpciksICdkZWVwJyldLCByZWN1cnNpdmU6IHRydWUsIGNvcnJlbGF0aW9uSWQ6IDMgfSxcblx0XHRcdHsgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtqb2luKHJlYWxwYXRoU3luYyh0ZXN0RGlyKSwgJ290aGVyJyldLCByZWN1cnNpdmU6IHRydWUsIGNvcnJlbGF0aW9uSWQ6IDQgfSxcblx0XHRdKTtcblxuXHRcdGF3YWl0IGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnbmV3RmlsZS50eHQnKSwgbnVsbCwgNSk7XG5cdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICdvdGhlck5ld0ZpbGUudHh0JyksIG51bGwsIDUpO1xuXG5cdFx0Ly8gb3ZlcmxhcHBpbmcgcGF0aHMgKHNhbWUgb3B0aW9ucylcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFtcblx0XHRcdHsgcGF0aDogZGlybmFtZSh0ZXN0RGlyKSwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUsIGNvcnJlbGF0aW9uSWQ6IDEgfSxcblx0XHRcdHsgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUsIGNvcnJlbGF0aW9uSWQ6IDIgfSxcblx0XHRcdHsgcGF0aDogam9pbih0ZXN0RGlyLCAnZGVlcCcpLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSwgY29ycmVsYXRpb25JZDogMyB9LFxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChqb2luKHRlc3REaXIsICdkZWVwJywgJ25ld0ZpbGUudHh0JyksIG51bGwsIDMpO1xuXHRcdGF3YWl0IGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnZGVlcCcsICdvdGhlck5ld0ZpbGUudHh0JyksIG51bGwsIDMpO1xuXG5cdFx0Ly8gb3ZlcmxhcHBpbmcgcGF0aHMgKGRpZmZlcmVudCBvcHRpb25zKVxuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW1xuXHRcdFx0eyBwYXRoOiBkaXJuYW1lKHRlc3REaXIpLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSwgY29ycmVsYXRpb25JZDogMSB9LFxuXHRcdFx0eyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW2pvaW4ocmVhbHBhdGhTeW5jKHRlc3REaXIpLCAnc29tZScpXSwgcmVjdXJzaXZlOiB0cnVlLCBjb3JyZWxhdGlvbklkOiAyIH0sXG5cdFx0XHR7IHBhdGg6IGpvaW4odGVzdERpciwgJ2RlZXAnKSwgZXhjbHVkZXM6IFtqb2luKHJlYWxwYXRoU3luYyh0ZXN0RGlyKSwgJ290aGVyJyldLCByZWN1cnNpdmU6IHRydWUsIGNvcnJlbGF0aW9uSWQ6IDMgfSxcblx0XHRdKTtcblxuXHRcdGF3YWl0IGJhc2ljQ3J1ZFRlc3Qoam9pbih0ZXN0RGlyLCAnZGVlcCcsICduZXdGaWxlLnR4dCcpLCBudWxsLCAzKTtcblx0XHRhd2FpdCBiYXNpY0NydWRUZXN0KGpvaW4odGVzdERpciwgJ2RlZXAnLCAnb3RoZXJOZXdGaWxlLnR4dCcpLCBudWxsLCAzKTtcblx0fSk7XG5cblx0dGVzdCgnd2F0Y2hpbmcgbWlzc2luZyBwYXRoIGVtaXRzIHdhdGNoZXIgZmFpbCBldmVudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBvbkRpZFdhdGNoRmFpbCA9IEV2ZW50LnRvUHJvbWlzZSh3YXRjaGVyLm9uV2F0Y2hGYWlsKTtcblxuXHRcdGNvbnN0IGZvbGRlclBhdGggPSBqb2luKHRlc3REaXIsICdtaXNzaW5nJyk7XG5cdFx0d2F0Y2hlci53YXRjaChbeyBwYXRoOiBmb2xkZXJQYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSB9XSk7XG5cblx0XHRhd2FpdCBvbkRpZFdhdGNoRmFpbDtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRpbmcgd2F0Y2hlZCBwYXRoIGVtaXRzIHdhdGNoZXIgZmFpbCBhbmQgZGVsZXRlIGV2ZW50IGlmIGNvcnJlbGF0ZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZm9sZGVyUGF0aCA9IGpvaW4odGVzdERpciwgJ2RlZXAnKTtcblxuXHRcdGF3YWl0IHdhdGNoZXIud2F0Y2goW3sgcGF0aDogZm9sZGVyUGF0aCwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUsIGNvcnJlbGF0aW9uSWQ6IDEgfV0pO1xuXG5cdFx0bGV0IGZhaWxlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IGluc3RhbmNlID0gQXJyYXkuZnJvbSh3YXRjaGVyLndhdGNoZXJzKVswXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFuY2UuaW5jbHVkZShmb2xkZXJQYXRoKSwgdHJ1ZSk7XG5cdFx0aW5zdGFuY2Uub25EaWRGYWlsKCgpID0+IGZhaWxlZCA9IHRydWUpO1xuXG5cdFx0Y29uc3Qgb25EaWRXYXRjaEZhaWwgPSBFdmVudC50b1Byb21pc2Uod2F0Y2hlci5vbldhdGNoRmFpbCk7XG5cdFx0Y29uc3QgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmb2xkZXJQYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVELCB1bmRlZmluZWQsIDEpO1xuXHRcdFByb21pc2VzLnJtKGZvbGRlclBhdGgsIFJpbVJhZk1vZGUuVU5MSU5LKTtcblx0XHRhd2FpdCBvbkRpZFdhdGNoRmFpbDtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhaWxlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RhbmNlLmZhaWxlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdCghaXNNYWNpbnRvc2ggLyogTGludXgvV2luZG93czogdGltZXMgb3V0IGZvciBzb21lIHJlYXNvbiAqLyA/IHRlc3Quc2tpcCA6IHRlc3QpKCd3YXRjaCByZXF1ZXN0cyBzdXBwb3J0IHN1c3BlbmQvcmVzdW1lIChmb2xkZXIsIGRvZXMgbm90IGV4aXN0IGluIGJlZ2lubmluZywgbm90IHJldXNpbmcgd2F0Y2hlciknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdFdhdGNoRm9sZGVyRG9lc05vdEV4aXN0KGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnd2F0Y2ggcmVxdWVzdHMgc3VwcG9ydCBzdXNwZW5kL3Jlc3VtZSAoZm9sZGVyLCBkb2VzIG5vdCBleGlzdCBpbiBiZWdpbm5pbmcsIHJldXNpbmcgd2F0Y2hlciknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdFdhdGNoRm9sZGVyRG9lc05vdEV4aXN0KHRydWUpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0V2F0Y2hGb2xkZXJEb2VzTm90RXhpc3QocmV1c2VFeGlzdGluZ1dhdGNoZXI6IGJvb2xlYW4pIHtcblx0XHRsZXQgb25EaWRXYXRjaEZhaWwgPSBFdmVudC50b1Byb21pc2Uod2F0Y2hlci5vbldhdGNoRmFpbCk7XG5cblx0XHRjb25zdCBmb2xkZXJQYXRoID0gam9pbih0ZXN0RGlyLCAnbm90LWZvdW5kJyk7XG5cblx0XHRjb25zdCByZXF1ZXN0czogSVJlY3Vyc2l2ZVdhdGNoUmVxdWVzdFtdID0gW107XG5cdFx0aWYgKHJldXNlRXhpc3RpbmdXYXRjaGVyKSB7XG5cdFx0XHRyZXF1ZXN0cy5wdXNoKHsgcGF0aDogdGVzdERpciwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKHJlcXVlc3RzKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXF1ZXN0OiBJUmVjdXJzaXZlV2F0Y2hSZXF1ZXN0ID0geyBwYXRoOiBmb2xkZXJQYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSB9O1xuXHRcdHJlcXVlc3RzLnB1c2gocmVxdWVzdCk7XG5cblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKHJlcXVlc3RzKTtcblx0XHRhd2FpdCBvbkRpZFdhdGNoRmFpbDtcblxuXHRcdGlmIChyZXVzZUV4aXN0aW5nV2F0Y2hlcikge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZXIuaXNTdXNwZW5kZWQocmVxdWVzdCksIHRydWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlci5pc1N1c3BlbmRlZChyZXF1ZXN0KSwgJ3BvbGxpbmcnKTtcblx0XHR9XG5cblx0XHRsZXQgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmb2xkZXJQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0bGV0IG9uRGlkV2F0Y2ggPSBFdmVudC50b1Byb21pc2Uod2F0Y2hlci5vbkRpZFdhdGNoKTtcblx0XHRhd2FpdCBwcm9taXNlcy5ta2Rpcihmb2xkZXJQYXRoKTtcblx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdFx0YXdhaXQgb25EaWRXYXRjaDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVyLmlzU3VzcGVuZGVkKHJlcXVlc3QpLCBmYWxzZSk7XG5cblx0XHRjb25zdCBmaWxlUGF0aCA9IGpvaW4oZm9sZGVyUGF0aCwgJ25ld0ZpbGUudHh0Jyk7XG5cdFx0YXdhaXQgYmFzaWNDcnVkVGVzdChmaWxlUGF0aCk7XG5cblx0XHRpZiAoIXJldXNlRXhpc3RpbmdXYXRjaGVyKSB7XG5cdFx0XHRvbkRpZFdhdGNoRmFpbCA9IEV2ZW50LnRvUHJvbWlzZSh3YXRjaGVyLm9uV2F0Y2hGYWlsKTtcblx0XHRcdGF3YWl0IFByb21pc2VzLnJtKGZvbGRlclBhdGgpO1xuXHRcdFx0YXdhaXQgb25EaWRXYXRjaEZhaWw7XG5cblx0XHRcdGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgZm9sZGVyUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdFx0b25EaWRXYXRjaCA9IEV2ZW50LnRvUHJvbWlzZSh3YXRjaGVyLm9uRGlkV2F0Y2gpO1xuXHRcdFx0YXdhaXQgcHJvbWlzZXMubWtkaXIoZm9sZGVyUGF0aCk7XG5cdFx0XHRhd2FpdCBjaGFuZ2VGdXR1cmU7XG5cdFx0XHRhd2FpdCBvbkRpZFdhdGNoO1xuXG5cdFx0XHRhd2FpdCBiYXNpY0NydWRUZXN0KGZpbGVQYXRoKTtcblx0XHR9XG5cdH1cblxuXHQoIWlzTWFjaW50b3NoIC8qIExpbnV4L1dpbmRvd3M6IHRpbWVzIG91dCBmb3Igc29tZSByZWFzb24gKi8gPyB0ZXN0LnNraXAgOiB0ZXN0KSgnd2F0Y2ggcmVxdWVzdHMgc3VwcG9ydCBzdXNwZW5kL3Jlc3VtZSAoZm9sZGVyLCBleGlzdCBpbiBiZWdpbm5pbmcsIG5vdCByZXVzaW5nIHdhdGNoZXIpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RXYXRjaEZvbGRlckV4aXN0cyhmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhdGNoIHJlcXVlc3RzIHN1cHBvcnQgc3VzcGVuZC9yZXN1bWUgKGZvbGRlciwgZXhpc3QgaW4gYmVnaW5uaW5nLCByZXVzaW5nIHdhdGNoZXIpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RXYXRjaEZvbGRlckV4aXN0cyh0cnVlKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdFdhdGNoRm9sZGVyRXhpc3RzKHJldXNlRXhpc3RpbmdXYXRjaGVyOiBib29sZWFuKSB7XG5cdFx0Y29uc3QgZm9sZGVyUGF0aCA9IGpvaW4odGVzdERpciwgJ2RlZXAnKTtcblxuXHRcdGNvbnN0IHJlcXVlc3RzOiBJUmVjdXJzaXZlV2F0Y2hSZXF1ZXN0W10gPSBbeyBwYXRoOiBmb2xkZXJQYXRoLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSB9XTtcblx0XHRpZiAocmV1c2VFeGlzdGluZ1dhdGNoZXIpIHtcblx0XHRcdHJlcXVlc3RzLnB1c2goeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHR9XG5cblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKHJlcXVlc3RzKTtcblxuXHRcdGNvbnN0IGZpbGVQYXRoID0gam9pbihmb2xkZXJQYXRoLCAnbmV3RmlsZS50eHQnKTtcblx0XHRhd2FpdCBiYXNpY0NydWRUZXN0KGZpbGVQYXRoKTtcblxuXHRcdGlmICghcmV1c2VFeGlzdGluZ1dhdGNoZXIpIHtcblx0XHRcdGNvbnN0IG9uRGlkV2F0Y2hGYWlsID0gRXZlbnQudG9Qcm9taXNlKHdhdGNoZXIub25XYXRjaEZhaWwpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZXMucm0oZm9sZGVyUGF0aCk7XG5cdFx0XHRhd2FpdCBvbkRpZFdhdGNoRmFpbDtcblxuXHRcdFx0Y29uc3QgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmb2xkZXJQYXRoLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCk7XG5cdFx0XHRjb25zdCBvbkRpZFdhdGNoID0gRXZlbnQudG9Qcm9taXNlKHdhdGNoZXIub25EaWRXYXRjaCk7XG5cdFx0XHRhd2FpdCBwcm9taXNlcy5ta2Rpcihmb2xkZXJQYXRoKTtcblx0XHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0XHRcdGF3YWl0IG9uRGlkV2F0Y2g7XG5cblx0XHRcdGF3YWl0IGJhc2ljQ3J1ZFRlc3QoZmlsZVBhdGgpO1xuXHRcdH1cblx0fVxuXG5cdHRlc3QoJ3dhdGNoIHJlcXVlc3QgcmV1c2VzIGFub3RoZXIgcmVjdXJzaXZlIHdhdGNoZXIgZXZlbiB3aGVuIHJlcXVlc3RzIGFyZSBjb21pbmcgaW4gYXQgdGhlIHNhbWUgdGltZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmb2xkZXJQYXRoMSA9IGpvaW4odGVzdERpciwgJ2RlZXAnLCAnbm90LWV4aXN0aW5nMScpO1xuXHRcdGNvbnN0IGZvbGRlclBhdGgyID0gam9pbih0ZXN0RGlyLCAnZGVlcCcsICdub3QtZXhpc3RpbmcyJyk7XG5cdFx0Y29uc3QgZm9sZGVyUGF0aDMgPSBqb2luKHRlc3REaXIsICdub3QtZXhpc3RpbmczJyk7XG5cblx0XHRjb25zdCByZXF1ZXN0czogSVJlY3Vyc2l2ZVdhdGNoUmVxdWVzdFtdID0gW1xuXHRcdFx0eyBwYXRoOiBmb2xkZXJQYXRoMSwgZXhjbHVkZXM6IFtdLCByZWN1cnNpdmU6IHRydWUsIGNvcnJlbGF0aW9uSWQ6IDEgfSxcblx0XHRcdHsgcGF0aDogZm9sZGVyUGF0aDIsIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlLCBjb3JyZWxhdGlvbklkOiAyIH0sXG5cdFx0XHR7IHBhdGg6IGZvbGRlclBhdGgzLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSwgY29ycmVsYXRpb25JZDogMyB9LFxuXHRcdFx0eyBwYXRoOiBqb2luKHRlc3REaXIsICdkZWVwJyksIGV4Y2x1ZGVzOiBbXSwgcmVjdXJzaXZlOiB0cnVlIH1cblx0XHRdO1xuXG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChyZXF1ZXN0cyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlci5pc1N1c3BlbmRlZChyZXF1ZXN0c1swXSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVyLmlzU3VzcGVuZGVkKHJlcXVlc3RzWzFdKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZXIuaXNTdXNwZW5kZWQocmVxdWVzdHNbMl0pLCAncG9sbGluZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVyLmlzU3VzcGVuZGVkKHJlcXVlc3RzWzNdKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdldmVudCB0eXBlIGZpbHRlcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXF1ZXN0ID0geyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIHJlY3Vyc2l2ZTogdHJ1ZSwgZmlsdGVyOiBGaWxlQ2hhbmdlRmlsdGVyLkFEREVEIHwgRmlsZUNoYW5nZUZpbHRlci5ERUxFVEVELCBjb3JyZWxhdGlvbklkOiAxIH07XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbcmVxdWVzdF0pO1xuXG5cdFx0Ly8gQ2hhbmdlIGZpbGVcblx0XHRjb25zdCBmaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2xvcmVtLW5ld2ZpbGUudHh0Jyk7XG5cdFx0bGV0IGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgZmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVELCB1bmRlZmluZWQsIDEpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShmaWxlUGF0aCwgJ0hlbGxvIENoYW5nZScpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIERlbGV0ZSBmaWxlXG5cdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBmaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCwgdW5kZWZpbmVkLCAxKTtcblx0XHRhd2FpdCBwcm9taXNlcy51bmxpbmsoZmlsZVBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0fSk7XG5cblx0KGlzTGludXggPyB0ZXN0LnNraXAgOiB0ZXN0KSgnaW5jbHVkZXMgYXJlIGNhc2UgaW5zZW5zaXRpdmUgb24gV2luZG93cy9NYWMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIGluY2x1ZGVzOiBbJyoqLyouVFhUJ10sIHJlY3Vyc2l2ZTogdHJ1ZSB9XSk7XG5cblx0XHQvLyBOZXcgZmlsZSAobWF0Y2hlcyAqLlRYVCBjYXNlLWluc2Vuc2l0aXZlbHkpXG5cdFx0Y29uc3QgbmV3RmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdkZWVwJywgJ25ld0ZpbGUudHh0Jyk7XG5cdFx0bGV0IGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGgsICdIZWxsbyBXb3JsZCcpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIENoYW5nZSBmaWxlXG5cdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoLCAnSGVsbG8gQ2hhbmdlJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gRGVsZXRlIGZpbGVcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTtcblx0XHRhd2FpdCBwcm9taXNlcy51bmxpbmsobmV3RmlsZVBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0fSk7XG5cblx0KGlzTGludXggPyB0ZXN0LnNraXAgOiB0ZXN0KSgnaW5jbHVkZXMgYXJlIGNhc2UgaW5zZW5zaXRpdmUgb24gV2luZG93cy9NYWMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogW10sIGluY2x1ZGVzOiBbJyoqLyouVFhUJ10sIHJlY3Vyc2l2ZTogdHJ1ZSB9XSk7XG5cblx0XHQvLyBOZXcgZmlsZSAobWF0Y2hlcyAqLlRYVCBjYXNlLWluc2Vuc2l0aXZlbHkpXG5cdFx0Y29uc3QgbmV3RmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdkZWVwJywgJ25ld0ZpbGUudHh0Jyk7XG5cdFx0bGV0IGNoYW5nZUZ1dHVyZSA9IGF3YWl0RXZlbnQod2F0Y2hlciwgbmV3RmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3RmlsZVBhdGgsICdIZWxsbyBXb3JsZCcpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblxuXHRcdC8vIENoYW5nZSBmaWxlXG5cdFx0Y2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMud3JpdGVGaWxlKG5ld0ZpbGVQYXRoLCAnSGVsbG8gQ2hhbmdlJyk7XG5cdFx0YXdhaXQgY2hhbmdlRnV0dXJlO1xuXG5cdFx0Ly8gRGVsZXRlIGZpbGVcblx0XHRjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld0ZpbGVQYXRoLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTtcblx0XHRhd2FpdCBwcm9taXNlcy51bmxpbmsobmV3RmlsZVBhdGgpO1xuXHRcdGF3YWl0IGNoYW5nZUZ1dHVyZTtcblx0fSk7XG5cblx0KGlzTGludXggPyB0ZXN0LnNraXAgOiB0ZXN0KSgnZXhjbHVkZXMgYXJlIGNhc2UgaW5zZW5zaXRpdmUgb24gV2luZG93cy9NYWMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2F0Y2hlci53YXRjaChbeyBwYXRoOiB0ZXN0RGlyLCBleGNsdWRlczogWycqKi9ERUVQLyoqJ10sIHJlY3Vyc2l2ZTogdHJ1ZSB9XSk7XG5cblx0XHQvLyBOZXcgZmlsZSBpbiBleGNsdWRlZCBmb2xkZXIgKHNob3VsZCBub3QgdHJpZ2dlciBldmVudClcblx0XHRjb25zdCBuZXdUZXh0RmlsZVBhdGggPSBqb2luKHRlc3REaXIsICdkZWVwJywgJ25ld0ZpbGUudHh0Jyk7XG5cdFx0Y29uc3QgY2hhbmdlRnV0dXJlID0gYXdhaXRFdmVudCh3YXRjaGVyLCBuZXdUZXh0RmlsZVBhdGgsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUobmV3VGV4dEZpbGVQYXRoLCAnSGVsbG8gV29ybGQnKTtcblxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IFByb21pc2UuYW55KFtcblx0XHRcdHRpbWVvdXQoNTAwKS50aGVuKCgpID0+IHRydWUpLFxuXHRcdFx0Y2hhbmdlRnV0dXJlLnRoZW4oKCkgPT4gZmFsc2UpXG5cdFx0XSk7XG5cblx0XHRpZiAoIXJlcykge1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ1VuZXhwZWN0ZWQgY2hhbmdlIGV2ZW50Jyk7XG5cdFx0fVxuXHR9KTtcblxuXHQoaXNMaW51eCA/IHRlc3Quc2tpcCA6IHRlc3QpKCdleGNsdWRlcyBhcmUgY2FzZSBpbnNlbnNpdGl2ZSBvbiBXaW5kb3dzL01hYycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3YXRjaGVyLndhdGNoKFt7IHBhdGg6IHRlc3REaXIsIGV4Y2x1ZGVzOiBbJyoqL0RFRVAvKionXSwgcmVjdXJzaXZlOiB0cnVlIH1dKTtcblxuXHRcdC8vIE5ldyBmaWxlIGluIGV4Y2x1ZGVkIGZvbGRlciAoc2hvdWxkIG5vdCB0cmlnZ2VyIGV2ZW50KVxuXHRcdGNvbnN0IG5ld1RleHRGaWxlUGF0aCA9IGpvaW4odGVzdERpciwgJ2RlZXAnLCAnbmV3RmlsZS50eHQnKTtcblx0XHRjb25zdCBjaGFuZ2VGdXR1cmUgPSBhd2FpdEV2ZW50KHdhdGNoZXIsIG5ld1RleHRGaWxlUGF0aCwgRmlsZUNoYW5nZVR5cGUuQURERUQpO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShuZXdUZXh0RmlsZVBhdGgsICdIZWxsbyBXb3JsZCcpO1xuXG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgUHJvbWlzZS5hbnkoW1xuXHRcdFx0dGltZW91dCg1MDApLnRoZW4oKCkgPT4gdHJ1ZSksXG5cdFx0XHRjaGFuZ2VGdXR1cmUudGhlbigoKSA9PiBmYWxzZSlcblx0XHRdKTtcblxuXHRcdGlmICghcmVzKSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgnVW5leHBlY3RlZCBjaGFuZ2UgZXZlbnQnKTtcblx0XHR9XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxjQUFjLGdCQUFnQjtBQUN2QyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxZQUFZO0FBQzlCLFNBQVMsU0FBUyxhQUFhLGlCQUFpQjtBQUNoRCxTQUFTLFVBQVUsa0JBQWtCO0FBQ3JDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCLHNCQUFtQztBQUM5RCxTQUFTLHFCQUFxQjtBQUU5QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQXVCO0FBRXpCLE1BQU0sMEJBQTBCLGNBQWM7QUFBQSxFQUE5QztBQUFBO0FBRU4sU0FBNEIsdUNBQXVDO0FBRW5FLFNBQWlCLGNBQWMsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ2pFLFNBQVMsYUFBYSxLQUFLLFlBQVk7QUFFdkMsU0FBUyxjQUFjLEtBQUssZ0JBQWdCO0FBQUE7QUFBQSxFQUU1QyxNQUFNLDRCQUE0QixPQUFpQixXQUFxQixDQUFDLEdBQXNCO0FBRzlGLFVBQU0sV0FBcUMsTUFBTSxJQUFJLFVBQVE7QUFDNUQsYUFBTyxFQUFFLE1BQU0sVUFBVSxXQUFXLEtBQUs7QUFBQSxJQUMxQyxDQUFDO0FBRUQsWUFBUSxNQUFNLEtBQUs7QUFBQSxNQUF3QjtBQUFBLE1BQVU7QUFBQTtBQUFBLElBQTRD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
