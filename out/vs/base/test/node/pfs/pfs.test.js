import assert from "assert";
import * as fs from "fs";
import { tmpdir } from "os";
import { timeout } from "../../../common/async.js";
import { VSBuffer } from "../../../common/buffer.js";
import { randomPath } from "../../../common/extpath.js";
import { FileAccess } from "../../../common/network.js";
import { basename, dirname, join, sep } from "../../../common/path.js";
import { isWindows } from "../../../common/platform.js";
import { configureFlushOnWrite, Promises, realcase, realpathSync, RimRafMode, SymlinkSupport, writeFileSync } from "../../../node/pfs.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../common/utils.js";
import { flakySuite, getRandomTestPath } from "../testUtils.js";
configureFlushOnWrite(false);
flakySuite("PFS", function() {
  let testDir;
  setup(() => {
    testDir = getRandomTestPath(tmpdir(), "vsctests", "pfs");
    return fs.promises.mkdir(testDir, { recursive: true });
  });
  teardown(() => {
    return Promises.rm(testDir);
  });
  test("writeFile", async () => {
    const testFile = join(testDir, "writefile.txt");
    assert.ok(!await Promises.exists(testFile));
    await Promises.writeFile(testFile, "Hello World", null);
    assert.strictEqual((await fs.promises.readFile(testFile)).toString(), "Hello World");
  });
  test("writeFile - parallel write on different files works", async () => {
    const testFile1 = join(testDir, "writefile1.txt");
    const testFile2 = join(testDir, "writefile2.txt");
    const testFile3 = join(testDir, "writefile3.txt");
    const testFile4 = join(testDir, "writefile4.txt");
    const testFile5 = join(testDir, "writefile5.txt");
    await Promise.all([
      Promises.writeFile(testFile1, "Hello World 1", null),
      Promises.writeFile(testFile2, "Hello World 2", null),
      Promises.writeFile(testFile3, "Hello World 3", null),
      Promises.writeFile(testFile4, "Hello World 4", null),
      Promises.writeFile(testFile5, "Hello World 5", null)
    ]);
    assert.strictEqual(fs.readFileSync(testFile1).toString(), "Hello World 1");
    assert.strictEqual(fs.readFileSync(testFile2).toString(), "Hello World 2");
    assert.strictEqual(fs.readFileSync(testFile3).toString(), "Hello World 3");
    assert.strictEqual(fs.readFileSync(testFile4).toString(), "Hello World 4");
    assert.strictEqual(fs.readFileSync(testFile5).toString(), "Hello World 5");
  });
  test("writeFile - parallel write on same files works and is sequentalized", async () => {
    const testFile = join(testDir, "writefile.txt");
    await Promise.all([
      Promises.writeFile(testFile, "Hello World 1", void 0),
      Promises.writeFile(testFile, "Hello World 2", void 0),
      timeout(10).then(() => Promises.writeFile(testFile, "Hello World 3", void 0)),
      Promises.writeFile(testFile, "Hello World 4", void 0),
      timeout(10).then(() => Promises.writeFile(testFile, "Hello World 5", void 0))
    ]);
    assert.strictEqual(fs.readFileSync(testFile).toString(), "Hello World 5");
  });
  test("rimraf - simple - unlink", async () => {
    fs.writeFileSync(join(testDir, "somefile.txt"), "Contents");
    fs.writeFileSync(join(testDir, "someOtherFile.txt"), "Contents");
    await Promises.rm(testDir);
    assert.ok(!fs.existsSync(testDir));
  });
  test("rimraf - simple - move", async () => {
    fs.writeFileSync(join(testDir, "somefile.txt"), "Contents");
    fs.writeFileSync(join(testDir, "someOtherFile.txt"), "Contents");
    await Promises.rm(testDir, RimRafMode.MOVE);
    assert.ok(!fs.existsSync(testDir));
  });
  test("rimraf - simple - move (with moveToPath)", async () => {
    fs.writeFileSync(join(testDir, "somefile.txt"), "Contents");
    fs.writeFileSync(join(testDir, "someOtherFile.txt"), "Contents");
    await Promises.rm(testDir, RimRafMode.MOVE, join(dirname(testDir), `${basename(testDir)}.vsctmp`));
    assert.ok(!fs.existsSync(testDir));
  });
  test("rimraf - path does not exist - move", async () => {
    const nonExistingDir = join(testDir, "unknown-move");
    await Promises.rm(nonExistingDir, RimRafMode.MOVE);
  });
  test("rimraf - path does not exist - unlink", async () => {
    const nonExistingDir = join(testDir, "unknown-unlink");
    await Promises.rm(nonExistingDir, RimRafMode.UNLINK);
  });
  test("rimraf - recursive folder structure - unlink", async () => {
    fs.writeFileSync(join(testDir, "somefile.txt"), "Contents");
    fs.writeFileSync(join(testDir, "someOtherFile.txt"), "Contents");
    fs.mkdirSync(join(testDir, "somefolder"));
    fs.writeFileSync(join(testDir, "somefolder", "somefile.txt"), "Contents");
    await Promises.rm(testDir);
    assert.ok(!fs.existsSync(testDir));
  });
  test("rimraf - recursive folder structure - move", async () => {
    fs.writeFileSync(join(testDir, "somefile.txt"), "Contents");
    fs.writeFileSync(join(testDir, "someOtherFile.txt"), "Contents");
    fs.mkdirSync(join(testDir, "somefolder"));
    fs.writeFileSync(join(testDir, "somefolder", "somefile.txt"), "Contents");
    await Promises.rm(testDir, RimRafMode.MOVE);
    assert.ok(!fs.existsSync(testDir));
  });
  test("rimraf - simple ends with dot - move", async () => {
    fs.writeFileSync(join(testDir, "somefile.txt"), "Contents");
    fs.writeFileSync(join(testDir, "someOtherFile.txt"), "Contents");
    await Promises.rm(testDir, RimRafMode.MOVE);
    assert.ok(!fs.existsSync(testDir));
  });
  test("rimraf - simple ends with dot slash/backslash - move", async () => {
    fs.writeFileSync(join(testDir, "somefile.txt"), "Contents");
    fs.writeFileSync(join(testDir, "someOtherFile.txt"), "Contents");
    await Promises.rm(`${testDir}${sep}`, RimRafMode.MOVE);
    assert.ok(!fs.existsSync(testDir));
  });
  test("copy, rename and delete", async () => {
    const sourceDir = FileAccess.asFileUri("vs/base/test/node/pfs/fixtures").fsPath;
    const parentDir = join(tmpdir(), "vsctests", "pfs");
    const targetDir = randomPath(parentDir);
    const targetDir2 = randomPath(parentDir);
    await Promises.copy(sourceDir, targetDir, { preserveSymlinks: true });
    assert.ok(fs.existsSync(targetDir));
    assert.ok(fs.existsSync(join(targetDir, "index.html")));
    assert.ok(fs.existsSync(join(targetDir, "site.css")));
    assert.ok(fs.existsSync(join(targetDir, "examples")));
    assert.ok(fs.statSync(join(targetDir, "examples")).isDirectory());
    assert.ok(fs.existsSync(join(targetDir, "examples", "small.jxs")));
    await Promises.rename(targetDir, targetDir2);
    assert.ok(!fs.existsSync(targetDir));
    assert.ok(fs.existsSync(targetDir2));
    assert.ok(fs.existsSync(join(targetDir2, "index.html")));
    assert.ok(fs.existsSync(join(targetDir2, "site.css")));
    assert.ok(fs.existsSync(join(targetDir2, "examples")));
    assert.ok(fs.statSync(join(targetDir2, "examples")).isDirectory());
    assert.ok(fs.existsSync(join(targetDir2, "examples", "small.jxs")));
    await Promises.rename(join(targetDir2, "index.html"), join(targetDir2, "index_moved.html"));
    assert.ok(!fs.existsSync(join(targetDir2, "index.html")));
    assert.ok(fs.existsSync(join(targetDir2, "index_moved.html")));
    await Promises.rm(parentDir);
    assert.ok(!fs.existsSync(parentDir));
  });
  test("rename without retry", async () => {
    const sourceDir = FileAccess.asFileUri("vs/base/test/node/pfs/fixtures").fsPath;
    const parentDir = join(tmpdir(), "vsctests", "pfs");
    const targetDir = randomPath(parentDir);
    const targetDir2 = randomPath(parentDir);
    await Promises.copy(sourceDir, targetDir, { preserveSymlinks: true });
    await Promises.rename(targetDir, targetDir2, false);
    assert.ok(!fs.existsSync(targetDir));
    assert.ok(fs.existsSync(targetDir2));
    assert.ok(fs.existsSync(join(targetDir2, "index.html")));
    assert.ok(fs.existsSync(join(targetDir2, "site.css")));
    assert.ok(fs.existsSync(join(targetDir2, "examples")));
    assert.ok(fs.statSync(join(targetDir2, "examples")).isDirectory());
    assert.ok(fs.existsSync(join(targetDir2, "examples", "small.jxs")));
    await Promises.rename(join(targetDir2, "index.html"), join(targetDir2, "index_moved.html"), false);
    assert.ok(!fs.existsSync(join(targetDir2, "index.html")));
    assert.ok(fs.existsSync(join(targetDir2, "index_moved.html")));
    await Promises.rm(parentDir);
    assert.ok(!fs.existsSync(parentDir));
  });
  test("copy handles symbolic links", async () => {
    const symbolicLinkTarget = randomPath(testDir);
    const symLink = randomPath(testDir);
    const copyTarget = randomPath(testDir);
    await fs.promises.mkdir(symbolicLinkTarget, { recursive: true });
    fs.symlinkSync(symbolicLinkTarget, symLink, "junction");
    if (!isWindows) {
      await Promises.copy(symLink, copyTarget, { preserveSymlinks: true });
      assert.ok(fs.existsSync(copyTarget));
      const { symbolicLink } = await SymlinkSupport.stat(copyTarget);
      assert.ok(symbolicLink);
      assert.ok(!symbolicLink.dangling);
      const target = await fs.promises.readlink(copyTarget);
      assert.strictEqual(target, symbolicLinkTarget);
      await Promises.rm(copyTarget);
      await Promises.copy(symLink, copyTarget, { preserveSymlinks: false });
      assert.ok(fs.existsSync(copyTarget));
      const { symbolicLink: symbolicLink2 } = await SymlinkSupport.stat(copyTarget);
      assert.ok(!symbolicLink2);
    }
    await Promises.rm(copyTarget);
    await Promises.rm(symbolicLinkTarget);
    await Promises.copy(symLink, copyTarget, { preserveSymlinks: true });
    if (!isWindows) {
      const { symbolicLink } = await SymlinkSupport.stat(copyTarget);
      assert.ok(symbolicLink?.dangling);
    } else {
      assert.ok(!fs.existsSync(copyTarget));
    }
  });
  test("copy handles symbolic links when the reference is inside source", async () => {
    const sourceFolder = join(randomPath(testDir), "copy-test");
    const sourceLinkTestFolder = join(sourceFolder, "link-test");
    const sourceLinkMD5JSFolder = join(sourceLinkTestFolder, "md5");
    const sourceLinkMD5JSFile = join(sourceLinkMD5JSFolder, "md5.js");
    await fs.promises.mkdir(sourceLinkMD5JSFolder, { recursive: true });
    await Promises.writeFile(sourceLinkMD5JSFile, "Hello from MD5");
    const sourceLinkMD5JSFolderLinked = join(sourceLinkTestFolder, "md5-linked");
    fs.symlinkSync(sourceLinkMD5JSFolder, sourceLinkMD5JSFolderLinked, "junction");
    const targetLinkTestFolder = join(sourceFolder, "link-test copy");
    const targetLinkMD5JSFolder = join(targetLinkTestFolder, "md5");
    const targetLinkMD5JSFile = join(targetLinkMD5JSFolder, "md5.js");
    const targetLinkMD5JSFolderLinked = join(targetLinkTestFolder, "md5-linked");
    if (!isWindows) {
      await Promises.copy(sourceLinkTestFolder, targetLinkTestFolder, { preserveSymlinks: true });
      assert.ok(fs.existsSync(targetLinkTestFolder));
      assert.ok(fs.existsSync(targetLinkMD5JSFolder));
      assert.ok(fs.existsSync(targetLinkMD5JSFile));
      assert.ok(fs.existsSync(targetLinkMD5JSFolderLinked));
      assert.ok(fs.lstatSync(targetLinkMD5JSFolderLinked).isSymbolicLink());
      const linkTarget = await fs.promises.readlink(targetLinkMD5JSFolderLinked);
      assert.strictEqual(linkTarget, targetLinkMD5JSFolder);
      await Promises.rm(targetLinkTestFolder);
    }
    await Promises.copy(sourceLinkTestFolder, targetLinkTestFolder, { preserveSymlinks: false });
    assert.ok(fs.existsSync(targetLinkTestFolder));
    assert.ok(fs.existsSync(targetLinkMD5JSFolder));
    assert.ok(fs.existsSync(targetLinkMD5JSFile));
    assert.ok(fs.existsSync(targetLinkMD5JSFolderLinked));
    assert.ok(fs.lstatSync(targetLinkMD5JSFolderLinked).isDirectory());
  });
  test("readDirsInDir", async () => {
    fs.mkdirSync(join(testDir, "somefolder1"));
    fs.mkdirSync(join(testDir, "somefolder2"));
    fs.mkdirSync(join(testDir, "somefolder3"));
    fs.writeFileSync(join(testDir, "somefile.txt"), "Contents");
    fs.writeFileSync(join(testDir, "someOtherFile.txt"), "Contents");
    const result = await Promises.readDirsInDir(testDir);
    assert.strictEqual(result.length, 3);
    assert.ok(result.indexOf("somefolder1") !== -1);
    assert.ok(result.indexOf("somefolder2") !== -1);
    assert.ok(result.indexOf("somefolder3") !== -1);
  });
  test("stat link", async () => {
    const directory = randomPath(testDir);
    const symbolicLink = randomPath(testDir);
    await fs.promises.mkdir(directory, { recursive: true });
    fs.symlinkSync(directory, symbolicLink, "junction");
    let statAndIsLink = await SymlinkSupport.stat(directory);
    assert.ok(!statAndIsLink?.symbolicLink);
    statAndIsLink = await SymlinkSupport.stat(symbolicLink);
    assert.ok(statAndIsLink?.symbolicLink);
    assert.ok(!statAndIsLink?.symbolicLink?.dangling);
  });
  test("stat link (non existing target)", async () => {
    const directory = randomPath(testDir);
    const symbolicLink = randomPath(testDir);
    await fs.promises.mkdir(directory, { recursive: true });
    fs.symlinkSync(directory, symbolicLink, "junction");
    await Promises.rm(directory);
    const statAndIsLink = await SymlinkSupport.stat(symbolicLink);
    assert.ok(statAndIsLink?.symbolicLink);
    assert.ok(statAndIsLink?.symbolicLink?.dangling);
  });
  test("readdir", async () => {
    const parent = randomPath(join(testDir, "pfs"));
    const newDir = join(parent, "\xF6\xE4\xFC");
    await fs.promises.mkdir(newDir, { recursive: true });
    assert.ok(fs.existsSync(newDir));
    const children = await Promises.readdir(parent);
    assert.strictEqual(children.some((n) => n === "\xF6\xE4\xFC"), true);
  });
  test("readdir (with file types)", async () => {
    const newDir = join(testDir, "\xF6\xE4\xFC");
    await fs.promises.mkdir(newDir, { recursive: true });
    await Promises.writeFile(join(testDir, "somefile.txt"), "contents");
    assert.ok(fs.existsSync(newDir));
    const children = await Promises.readdir(testDir, { withFileTypes: true });
    assert.strictEqual(children.some((n) => n.name === "\xF6\xE4\xFC"), true);
    assert.strictEqual(children.some((n) => n.isDirectory()), true);
    assert.strictEqual(children.some((n) => n.name === "somefile.txt"), true);
    assert.strictEqual(children.some((n) => n.isFile()), true);
  });
  test("writeFile (string)", async () => {
    const smallData = "Hello World";
    const bigData = new Array(100 * 1024).join("Large String\n");
    return testWriteFile(smallData, smallData, bigData, bigData);
  });
  test("writeFile (string) - flush on write", async () => {
    configureFlushOnWrite(true);
    try {
      const smallData = "Hello World";
      const bigData = new Array(100 * 1024).join("Large String\n");
      return await testWriteFile(smallData, smallData, bigData, bigData);
    } finally {
      configureFlushOnWrite(false);
    }
  });
  test("writeFile (Buffer)", async () => {
    const smallData = "Hello World";
    const bigData = new Array(100 * 1024).join("Large String\n");
    return testWriteFile(Buffer.from(smallData), smallData, Buffer.from(bigData), bigData);
  });
  test("writeFile (UInt8Array)", async () => {
    const smallData = "Hello World";
    const bigData = new Array(100 * 1024).join("Large String\n");
    return testWriteFile(VSBuffer.fromString(smallData).buffer, smallData, VSBuffer.fromString(bigData).buffer, bigData);
  });
  async function testWriteFile(smallData, smallDataValue, bigData, bigDataValue) {
    const testFile = join(testDir, "flushed.txt");
    assert.ok(fs.existsSync(testDir));
    await Promises.writeFile(testFile, smallData);
    assert.strictEqual(fs.readFileSync(testFile).toString(), smallDataValue);
    await Promises.writeFile(testFile, bigData);
    assert.strictEqual(fs.readFileSync(testFile).toString(), bigDataValue);
  }
  test("writeFile (string, error handling)", async () => {
    const testFile = join(testDir, "flushed.txt");
    fs.mkdirSync(testFile);
    let expectedError;
    try {
      await Promises.writeFile(testFile, "Hello World");
    } catch (error) {
      expectedError = error;
    }
    assert.ok(expectedError);
  });
  test("writeFileSync", async () => {
    const testFile = join(testDir, "flushed.txt");
    writeFileSync(testFile, "Hello World");
    assert.strictEqual(fs.readFileSync(testFile).toString(), "Hello World");
    const largeString = new Array(100 * 1024).join("Large String\n");
    writeFileSync(testFile, largeString);
    assert.strictEqual(fs.readFileSync(testFile).toString(), largeString);
  });
  test("realcase", async () => {
    if (process.platform === "win32" || process.platform === "darwin") {
      const upper = testDir.toUpperCase();
      const real = await realcase(upper);
      if (real) {
        assert.notStrictEqual(real, upper);
        assert.strictEqual(real.toUpperCase(), upper);
        assert.strictEqual(real, testDir);
      }
    } else {
      let real = await realcase(testDir);
      assert.strictEqual(real, testDir);
      real = await realcase(testDir.toUpperCase());
      assert.strictEqual(real, testDir.toUpperCase());
    }
  });
  test("realpath", async () => {
    const realpathVal = await Promises.realpath(testDir);
    assert.ok(realpathVal);
  });
  test("realpathSync", () => {
    const realpath = realpathSync(testDir);
    assert.ok(realpath);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9ub2RlL3Bmcy9wZnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IHJhbmRvbVBhdGggfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXh0cGF0aC5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUsIGpvaW4sIHNlcCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBjb25maWd1cmVGbHVzaE9uV3JpdGUsIFByb21pc2VzLCByZWFsY2FzZSwgcmVhbHBhdGhTeW5jLCBSaW1SYWZNb2RlLCBTeW1saW5rU3VwcG9ydCwgd3JpdGVGaWxlU3luYyB9IGZyb20gJy4uLy4uLy4uL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBmbGFreVN1aXRlLCBnZXRSYW5kb21UZXN0UGF0aCB9IGZyb20gJy4uL3Rlc3RVdGlscy5qcyc7XG5cbmNvbmZpZ3VyZUZsdXNoT25Xcml0ZShmYWxzZSk7IC8vIHNwZWVkIHVwIGFsbCB1bml0IHRlc3RzIGJ5IGRpc2FibGluZyBmbHVzaCBvbiB3cml0ZVxuXG5mbGFreVN1aXRlKCdQRlMnLCBmdW5jdGlvbiAoKSB7XG5cblx0bGV0IHRlc3REaXI6IHN0cmluZztcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0dGVzdERpciA9IGdldFJhbmRvbVRlc3RQYXRoKHRtcGRpcigpLCAndnNjdGVzdHMnLCAncGZzJyk7XG5cblx0XHRyZXR1cm4gZnMucHJvbWlzZXMubWtkaXIodGVzdERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRyZXR1cm4gUHJvbWlzZXMucm0odGVzdERpcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0RmlsZSA9IGpvaW4odGVzdERpciwgJ3dyaXRlZmlsZS50eHQnKTtcblxuXHRcdGFzc2VydC5vayghKGF3YWl0IFByb21pc2VzLmV4aXN0cyh0ZXN0RmlsZSkpKTtcblxuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZSh0ZXN0RmlsZSwgJ0hlbGxvIFdvcmxkJywgKG51bGwhKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZzLnByb21pc2VzLnJlYWRGaWxlKHRlc3RGaWxlKSkudG9TdHJpbmcoKSwgJ0hlbGxvIFdvcmxkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAtIHBhcmFsbGVsIHdyaXRlIG9uIGRpZmZlcmVudCBmaWxlcyB3b3JrcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0RmlsZTEgPSBqb2luKHRlc3REaXIsICd3cml0ZWZpbGUxLnR4dCcpO1xuXHRcdGNvbnN0IHRlc3RGaWxlMiA9IGpvaW4odGVzdERpciwgJ3dyaXRlZmlsZTIudHh0Jyk7XG5cdFx0Y29uc3QgdGVzdEZpbGUzID0gam9pbih0ZXN0RGlyLCAnd3JpdGVmaWxlMy50eHQnKTtcblx0XHRjb25zdCB0ZXN0RmlsZTQgPSBqb2luKHRlc3REaXIsICd3cml0ZWZpbGU0LnR4dCcpO1xuXHRcdGNvbnN0IHRlc3RGaWxlNSA9IGpvaW4odGVzdERpciwgJ3dyaXRlZmlsZTUudHh0Jyk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRQcm9taXNlcy53cml0ZUZpbGUodGVzdEZpbGUxLCAnSGVsbG8gV29ybGQgMScsIChudWxsISkpLFxuXHRcdFx0UHJvbWlzZXMud3JpdGVGaWxlKHRlc3RGaWxlMiwgJ0hlbGxvIFdvcmxkIDInLCAobnVsbCEpKSxcblx0XHRcdFByb21pc2VzLndyaXRlRmlsZSh0ZXN0RmlsZTMsICdIZWxsbyBXb3JsZCAzJywgKG51bGwhKSksXG5cdFx0XHRQcm9taXNlcy53cml0ZUZpbGUodGVzdEZpbGU0LCAnSGVsbG8gV29ybGQgNCcsIChudWxsISkpLFxuXHRcdFx0UHJvbWlzZXMud3JpdGVGaWxlKHRlc3RGaWxlNSwgJ0hlbGxvIFdvcmxkIDUnLCAobnVsbCEpKVxuXHRcdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcy5yZWFkRmlsZVN5bmModGVzdEZpbGUxKS50b1N0cmluZygpLCAnSGVsbG8gV29ybGQgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcy5yZWFkRmlsZVN5bmModGVzdEZpbGUyKS50b1N0cmluZygpLCAnSGVsbG8gV29ybGQgMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcy5yZWFkRmlsZVN5bmModGVzdEZpbGUzKS50b1N0cmluZygpLCAnSGVsbG8gV29ybGQgMycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcy5yZWFkRmlsZVN5bmModGVzdEZpbGU0KS50b1N0cmluZygpLCAnSGVsbG8gV29ybGQgNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcy5yZWFkRmlsZVN5bmModGVzdEZpbGU1KS50b1N0cmluZygpLCAnSGVsbG8gV29ybGQgNScpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgLSBwYXJhbGxlbCB3cml0ZSBvbiBzYW1lIGZpbGVzIHdvcmtzIGFuZCBpcyBzZXF1ZW50YWxpemVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RGaWxlID0gam9pbih0ZXN0RGlyLCAnd3JpdGVmaWxlLnR4dCcpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0UHJvbWlzZXMud3JpdGVGaWxlKHRlc3RGaWxlLCAnSGVsbG8gV29ybGQgMScsIHVuZGVmaW5lZCksXG5cdFx0XHRQcm9taXNlcy53cml0ZUZpbGUodGVzdEZpbGUsICdIZWxsbyBXb3JsZCAyJywgdW5kZWZpbmVkKSxcblx0XHRcdHRpbWVvdXQoMTApLnRoZW4oKCkgPT4gUHJvbWlzZXMud3JpdGVGaWxlKHRlc3RGaWxlLCAnSGVsbG8gV29ybGQgMycsIHVuZGVmaW5lZCkpLFxuXHRcdFx0UHJvbWlzZXMud3JpdGVGaWxlKHRlc3RGaWxlLCAnSGVsbG8gV29ybGQgNCcsIHVuZGVmaW5lZCksXG5cdFx0XHR0aW1lb3V0KDEwKS50aGVuKCgpID0+IFByb21pc2VzLndyaXRlRmlsZSh0ZXN0RmlsZSwgJ0hlbGxvIFdvcmxkIDUnLCB1bmRlZmluZWQpKVxuXHRcdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcy5yZWFkRmlsZVN5bmModGVzdEZpbGUpLnRvU3RyaW5nKCksICdIZWxsbyBXb3JsZCA1Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JpbXJhZiAtIHNpbXBsZSAtIHVubGluaycsIGFzeW5jICgpID0+IHtcblx0XHRmcy53cml0ZUZpbGVTeW5jKGpvaW4odGVzdERpciwgJ3NvbWVmaWxlLnR4dCcpLCAnQ29udGVudHMnKTtcblx0XHRmcy53cml0ZUZpbGVTeW5jKGpvaW4odGVzdERpciwgJ3NvbWVPdGhlckZpbGUudHh0JyksICdDb250ZW50cycpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMucm0odGVzdERpcik7XG5cdFx0YXNzZXJ0Lm9rKCFmcy5leGlzdHNTeW5jKHRlc3REaXIpKTtcblx0fSk7XG5cblx0dGVzdCgncmltcmFmIC0gc2ltcGxlIC0gbW92ZScsIGFzeW5jICgpID0+IHtcblx0XHRmcy53cml0ZUZpbGVTeW5jKGpvaW4odGVzdERpciwgJ3NvbWVmaWxlLnR4dCcpLCAnQ29udGVudHMnKTtcblx0XHRmcy53cml0ZUZpbGVTeW5jKGpvaW4odGVzdERpciwgJ3NvbWVPdGhlckZpbGUudHh0JyksICdDb250ZW50cycpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMucm0odGVzdERpciwgUmltUmFmTW9kZS5NT1ZFKTtcblx0XHRhc3NlcnQub2soIWZzLmV4aXN0c1N5bmModGVzdERpcikpO1xuXHR9KTtcblxuXHR0ZXN0KCdyaW1yYWYgLSBzaW1wbGUgLSBtb3ZlICh3aXRoIG1vdmVUb1BhdGgpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGZzLndyaXRlRmlsZVN5bmMoam9pbih0ZXN0RGlyLCAnc29tZWZpbGUudHh0JyksICdDb250ZW50cycpO1xuXHRcdGZzLndyaXRlRmlsZVN5bmMoam9pbih0ZXN0RGlyLCAnc29tZU90aGVyRmlsZS50eHQnKSwgJ0NvbnRlbnRzJyk7XG5cblx0XHRhd2FpdCBQcm9taXNlcy5ybSh0ZXN0RGlyLCBSaW1SYWZNb2RlLk1PVkUsIGpvaW4oZGlybmFtZSh0ZXN0RGlyKSwgYCR7YmFzZW5hbWUodGVzdERpcil9LnZzY3RtcGApKTtcblx0XHRhc3NlcnQub2soIWZzLmV4aXN0c1N5bmModGVzdERpcikpO1xuXHR9KTtcblxuXHR0ZXN0KCdyaW1yYWYgLSBwYXRoIGRvZXMgbm90IGV4aXN0IC0gbW92ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBub25FeGlzdGluZ0RpciA9IGpvaW4odGVzdERpciwgJ3Vua25vd24tbW92ZScpO1xuXHRcdGF3YWl0IFByb21pc2VzLnJtKG5vbkV4aXN0aW5nRGlyLCBSaW1SYWZNb2RlLk1PVkUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyaW1yYWYgLSBwYXRoIGRvZXMgbm90IGV4aXN0IC0gdW5saW5rJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG5vbkV4aXN0aW5nRGlyID0gam9pbih0ZXN0RGlyLCAndW5rbm93bi11bmxpbmsnKTtcblx0XHRhd2FpdCBQcm9taXNlcy5ybShub25FeGlzdGluZ0RpciwgUmltUmFmTW9kZS5VTkxJTkspO1xuXHR9KTtcblxuXHR0ZXN0KCdyaW1yYWYgLSByZWN1cnNpdmUgZm9sZGVyIHN0cnVjdHVyZSAtIHVubGluaycsIGFzeW5jICgpID0+IHtcblx0XHRmcy53cml0ZUZpbGVTeW5jKGpvaW4odGVzdERpciwgJ3NvbWVmaWxlLnR4dCcpLCAnQ29udGVudHMnKTtcblx0XHRmcy53cml0ZUZpbGVTeW5jKGpvaW4odGVzdERpciwgJ3NvbWVPdGhlckZpbGUudHh0JyksICdDb250ZW50cycpO1xuXHRcdGZzLm1rZGlyU3luYyhqb2luKHRlc3REaXIsICdzb21lZm9sZGVyJykpO1xuXHRcdGZzLndyaXRlRmlsZVN5bmMoam9pbih0ZXN0RGlyLCAnc29tZWZvbGRlcicsICdzb21lZmlsZS50eHQnKSwgJ0NvbnRlbnRzJyk7XG5cblx0XHRhd2FpdCBQcm9taXNlcy5ybSh0ZXN0RGlyKTtcblx0XHRhc3NlcnQub2soIWZzLmV4aXN0c1N5bmModGVzdERpcikpO1xuXHR9KTtcblxuXHR0ZXN0KCdyaW1yYWYgLSByZWN1cnNpdmUgZm9sZGVyIHN0cnVjdHVyZSAtIG1vdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0ZnMud3JpdGVGaWxlU3luYyhqb2luKHRlc3REaXIsICdzb21lZmlsZS50eHQnKSwgJ0NvbnRlbnRzJyk7XG5cdFx0ZnMud3JpdGVGaWxlU3luYyhqb2luKHRlc3REaXIsICdzb21lT3RoZXJGaWxlLnR4dCcpLCAnQ29udGVudHMnKTtcblx0XHRmcy5ta2RpclN5bmMoam9pbih0ZXN0RGlyLCAnc29tZWZvbGRlcicpKTtcblx0XHRmcy53cml0ZUZpbGVTeW5jKGpvaW4odGVzdERpciwgJ3NvbWVmb2xkZXInLCAnc29tZWZpbGUudHh0JyksICdDb250ZW50cycpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMucm0odGVzdERpciwgUmltUmFmTW9kZS5NT1ZFKTtcblx0XHRhc3NlcnQub2soIWZzLmV4aXN0c1N5bmModGVzdERpcikpO1xuXHR9KTtcblxuXHR0ZXN0KCdyaW1yYWYgLSBzaW1wbGUgZW5kcyB3aXRoIGRvdCAtIG1vdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0ZnMud3JpdGVGaWxlU3luYyhqb2luKHRlc3REaXIsICdzb21lZmlsZS50eHQnKSwgJ0NvbnRlbnRzJyk7XG5cdFx0ZnMud3JpdGVGaWxlU3luYyhqb2luKHRlc3REaXIsICdzb21lT3RoZXJGaWxlLnR4dCcpLCAnQ29udGVudHMnKTtcblxuXHRcdGF3YWl0IFByb21pc2VzLnJtKHRlc3REaXIsIFJpbVJhZk1vZGUuTU9WRSk7XG5cdFx0YXNzZXJ0Lm9rKCFmcy5leGlzdHNTeW5jKHRlc3REaXIpKTtcblx0fSk7XG5cblx0dGVzdCgncmltcmFmIC0gc2ltcGxlIGVuZHMgd2l0aCBkb3Qgc2xhc2gvYmFja3NsYXNoIC0gbW92ZScsIGFzeW5jICgpID0+IHtcblx0XHRmcy53cml0ZUZpbGVTeW5jKGpvaW4odGVzdERpciwgJ3NvbWVmaWxlLnR4dCcpLCAnQ29udGVudHMnKTtcblx0XHRmcy53cml0ZUZpbGVTeW5jKGpvaW4odGVzdERpciwgJ3NvbWVPdGhlckZpbGUudHh0JyksICdDb250ZW50cycpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMucm0oYCR7dGVzdERpcn0ke3NlcH1gLCBSaW1SYWZNb2RlLk1PVkUpO1xuXHRcdGFzc2VydC5vayghZnMuZXhpc3RzU3luYyh0ZXN0RGlyKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcHksIHJlbmFtZSBhbmQgZGVsZXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNvdXJjZURpciA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy9iYXNlL3Rlc3Qvbm9kZS9wZnMvZml4dHVyZXMnKS5mc1BhdGg7XG5cdFx0Y29uc3QgcGFyZW50RGlyID0gam9pbih0bXBkaXIoKSwgJ3ZzY3Rlc3RzJywgJ3BmcycpO1xuXHRcdGNvbnN0IHRhcmdldERpciA9IHJhbmRvbVBhdGgocGFyZW50RGlyKTtcblx0XHRjb25zdCB0YXJnZXREaXIyID0gcmFuZG9tUGF0aChwYXJlbnREaXIpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMuY29weShzb3VyY2VEaXIsIHRhcmdldERpciwgeyBwcmVzZXJ2ZVN5bWxpbmtzOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmModGFyZ2V0RGlyKSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMoam9pbih0YXJnZXREaXIsICdpbmRleC5odG1sJykpKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyhqb2luKHRhcmdldERpciwgJ3NpdGUuY3NzJykpKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyhqb2luKHRhcmdldERpciwgJ2V4YW1wbGVzJykpKTtcblx0XHRhc3NlcnQub2soZnMuc3RhdFN5bmMoam9pbih0YXJnZXREaXIsICdleGFtcGxlcycpKS5pc0RpcmVjdG9yeSgpKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyhqb2luKHRhcmdldERpciwgJ2V4YW1wbGVzJywgJ3NtYWxsLmp4cycpKSk7XG5cblx0XHRhd2FpdCBQcm9taXNlcy5yZW5hbWUodGFyZ2V0RGlyLCB0YXJnZXREaXIyKTtcblxuXHRcdGFzc2VydC5vayghZnMuZXhpc3RzU3luYyh0YXJnZXREaXIpKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyh0YXJnZXREaXIyKSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMoam9pbih0YXJnZXREaXIyLCAnaW5kZXguaHRtbCcpKSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMoam9pbih0YXJnZXREaXIyLCAnc2l0ZS5jc3MnKSkpO1xuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKGpvaW4odGFyZ2V0RGlyMiwgJ2V4YW1wbGVzJykpKTtcblx0XHRhc3NlcnQub2soZnMuc3RhdFN5bmMoam9pbih0YXJnZXREaXIyLCAnZXhhbXBsZXMnKSkuaXNEaXJlY3RvcnkoKSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMoam9pbih0YXJnZXREaXIyLCAnZXhhbXBsZXMnLCAnc21hbGwuanhzJykpKTtcblxuXHRcdGF3YWl0IFByb21pc2VzLnJlbmFtZShqb2luKHRhcmdldERpcjIsICdpbmRleC5odG1sJyksIGpvaW4odGFyZ2V0RGlyMiwgJ2luZGV4X21vdmVkLmh0bWwnKSk7XG5cblx0XHRhc3NlcnQub2soIWZzLmV4aXN0c1N5bmMoam9pbih0YXJnZXREaXIyLCAnaW5kZXguaHRtbCcpKSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMoam9pbih0YXJnZXREaXIyLCAnaW5kZXhfbW92ZWQuaHRtbCcpKSk7XG5cblx0XHRhd2FpdCBQcm9taXNlcy5ybShwYXJlbnREaXIpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFmcy5leGlzdHNTeW5jKHBhcmVudERpcikpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5hbWUgd2l0aG91dCByZXRyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzb3VyY2VEaXIgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvYmFzZS90ZXN0L25vZGUvcGZzL2ZpeHR1cmVzJykuZnNQYXRoO1xuXHRcdGNvbnN0IHBhcmVudERpciA9IGpvaW4odG1wZGlyKCksICd2c2N0ZXN0cycsICdwZnMnKTtcblx0XHRjb25zdCB0YXJnZXREaXIgPSByYW5kb21QYXRoKHBhcmVudERpcik7XG5cdFx0Y29uc3QgdGFyZ2V0RGlyMiA9IHJhbmRvbVBhdGgocGFyZW50RGlyKTtcblxuXHRcdGF3YWl0IFByb21pc2VzLmNvcHkoc291cmNlRGlyLCB0YXJnZXREaXIsIHsgcHJlc2VydmVTeW1saW5rczogdHJ1ZSB9KTtcblx0XHRhd2FpdCBQcm9taXNlcy5yZW5hbWUodGFyZ2V0RGlyLCB0YXJnZXREaXIyLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQub2soIWZzLmV4aXN0c1N5bmModGFyZ2V0RGlyKSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmModGFyZ2V0RGlyMikpO1xuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKGpvaW4odGFyZ2V0RGlyMiwgJ2luZGV4Lmh0bWwnKSkpO1xuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKGpvaW4odGFyZ2V0RGlyMiwgJ3NpdGUuY3NzJykpKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyhqb2luKHRhcmdldERpcjIsICdleGFtcGxlcycpKSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLnN0YXRTeW5jKGpvaW4odGFyZ2V0RGlyMiwgJ2V4YW1wbGVzJykpLmlzRGlyZWN0b3J5KCkpO1xuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKGpvaW4odGFyZ2V0RGlyMiwgJ2V4YW1wbGVzJywgJ3NtYWxsLmp4cycpKSk7XG5cblx0XHRhd2FpdCBQcm9taXNlcy5yZW5hbWUoam9pbih0YXJnZXREaXIyLCAnaW5kZXguaHRtbCcpLCBqb2luKHRhcmdldERpcjIsICdpbmRleF9tb3ZlZC5odG1sJyksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5vayghZnMuZXhpc3RzU3luYyhqb2luKHRhcmdldERpcjIsICdpbmRleC5odG1sJykpKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyhqb2luKHRhcmdldERpcjIsICdpbmRleF9tb3ZlZC5odG1sJykpKTtcblxuXHRcdGF3YWl0IFByb21pc2VzLnJtKHBhcmVudERpcik7XG5cblx0XHRhc3NlcnQub2soIWZzLmV4aXN0c1N5bmMocGFyZW50RGlyKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcHkgaGFuZGxlcyBzeW1ib2xpYyBsaW5rcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzeW1ib2xpY0xpbmtUYXJnZXQgPSByYW5kb21QYXRoKHRlc3REaXIpO1xuXHRcdGNvbnN0IHN5bUxpbmsgPSByYW5kb21QYXRoKHRlc3REaXIpO1xuXHRcdGNvbnN0IGNvcHlUYXJnZXQgPSByYW5kb21QYXRoKHRlc3REaXIpO1xuXG5cdFx0YXdhaXQgZnMucHJvbWlzZXMubWtkaXIoc3ltYm9saWNMaW5rVGFyZ2V0LCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblxuXHRcdGZzLnN5bWxpbmtTeW5jKHN5bWJvbGljTGlua1RhcmdldCwgc3ltTGluaywgJ2p1bmN0aW9uJyk7XG5cblx0XHQvLyBDb3B5IHByZXNlcnZlcyBzeW1saW5rcyBpZiBjb25maWd1cmVkIGFzIHN1Y2hcblx0XHQvL1xuXHRcdC8vIFdpbmRvd3M6IHRoaXMgdGVzdCBkb2VzIG5vdCB3b3JrIGJlY2F1c2UgY3JlYXRpbmcgc3ltbGlua3Ncblx0XHQvLyByZXF1aXJlcyBwcml2aWxlZGdlZCBwZXJtaXNzaW9ucyAoYWRtaW4pLlxuXHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlcy5jb3B5KHN5bUxpbmssIGNvcHlUYXJnZXQsIHsgcHJlc2VydmVTeW1saW5rczogdHJ1ZSB9KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMoY29weVRhcmdldCkpO1xuXG5cdFx0XHRjb25zdCB7IHN5bWJvbGljTGluayB9ID0gYXdhaXQgU3ltbGlua1N1cHBvcnQuc3RhdChjb3B5VGFyZ2V0KTtcblx0XHRcdGFzc2VydC5vayhzeW1ib2xpY0xpbmspO1xuXHRcdFx0YXNzZXJ0Lm9rKCFzeW1ib2xpY0xpbmsuZGFuZ2xpbmcpO1xuXG5cdFx0XHRjb25zdCB0YXJnZXQgPSBhd2FpdCBmcy5wcm9taXNlcy5yZWFkbGluayhjb3B5VGFyZ2V0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQsIHN5bWJvbGljTGlua1RhcmdldCk7XG5cblx0XHRcdC8vIENvcHkgZG9lcyBub3QgcHJlc2VydmUgc3ltbGlua3MgaWYgY29uZmlndXJlZCBhcyBzdWNoXG5cblx0XHRcdGF3YWl0IFByb21pc2VzLnJtKGNvcHlUYXJnZXQpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZXMuY29weShzeW1MaW5rLCBjb3B5VGFyZ2V0LCB7IHByZXNlcnZlU3ltbGlua3M6IGZhbHNlIH0pO1xuXG5cdFx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyhjb3B5VGFyZ2V0KSk7XG5cblx0XHRcdGNvbnN0IHsgc3ltYm9saWNMaW5rOiBzeW1ib2xpY0xpbmsyIH0gPSBhd2FpdCBTeW1saW5rU3VwcG9ydC5zdGF0KGNvcHlUYXJnZXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFzeW1ib2xpY0xpbmsyKTtcblx0XHR9XG5cblx0XHQvLyBDb3B5IGRvZXMgbm90IGZhaWwgb3ZlciBkYW5nbGluZyBzeW1saW5rc1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMucm0oY29weVRhcmdldCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMucm0oc3ltYm9saWNMaW5rVGFyZ2V0KTtcblxuXHRcdGF3YWl0IFByb21pc2VzLmNvcHkoc3ltTGluaywgY29weVRhcmdldCwgeyBwcmVzZXJ2ZVN5bWxpbmtzOiB0cnVlIH0pOyAvLyB0aGlzIHNob3VsZCBub3QgdGhyb3dcblxuXHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRjb25zdCB7IHN5bWJvbGljTGluayB9ID0gYXdhaXQgU3ltbGlua1N1cHBvcnQuc3RhdChjb3B5VGFyZ2V0KTtcblx0XHRcdGFzc2VydC5vayhzeW1ib2xpY0xpbms/LmRhbmdsaW5nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0Lm9rKCFmcy5leGlzdHNTeW5jKGNvcHlUYXJnZXQpKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcHkgaGFuZGxlcyBzeW1ib2xpYyBsaW5rcyB3aGVuIHRoZSByZWZlcmVuY2UgaXMgaW5zaWRlIHNvdXJjZScsIGFzeW5jICgpID0+IHtcblxuXHRcdC8vIFNvdXJjZSBGb2xkZXJcblx0XHRjb25zdCBzb3VyY2VGb2xkZXIgPSBqb2luKHJhbmRvbVBhdGgodGVzdERpciksICdjb3B5LXRlc3QnKTsgXHRcdC8vIGNvcHktdGVzdFxuXHRcdGNvbnN0IHNvdXJjZUxpbmtUZXN0Rm9sZGVyID0gam9pbihzb3VyY2VGb2xkZXIsICdsaW5rLXRlc3QnKTtcdFx0Ly8gY29weS10ZXN0L2xpbmstdGVzdFxuXHRcdGNvbnN0IHNvdXJjZUxpbmtNRDVKU0ZvbGRlciA9IGpvaW4oc291cmNlTGlua1Rlc3RGb2xkZXIsICdtZDUnKTtcdC8vIGNvcHktdGVzdC9saW5rLXRlc3QvbWQ1XG5cdFx0Y29uc3Qgc291cmNlTGlua01ENUpTRmlsZSA9IGpvaW4oc291cmNlTGlua01ENUpTRm9sZGVyLCAnbWQ1LmpzJyk7XHQvLyBjb3B5LXRlc3QvbGluay10ZXN0L21kNS9tZDUuanNcblx0XHRhd2FpdCBmcy5wcm9taXNlcy5ta2Rpcihzb3VyY2VMaW5rTUQ1SlNGb2xkZXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShzb3VyY2VMaW5rTUQ1SlNGaWxlLCAnSGVsbG8gZnJvbSBNRDUnKTtcblxuXHRcdGNvbnN0IHNvdXJjZUxpbmtNRDVKU0ZvbGRlckxpbmtlZCA9IGpvaW4oc291cmNlTGlua1Rlc3RGb2xkZXIsICdtZDUtbGlua2VkJyk7XHQvLyBjb3B5LXRlc3QvbGluay10ZXN0L21kNS1saW5rZWRcblx0XHRmcy5zeW1saW5rU3luYyhzb3VyY2VMaW5rTUQ1SlNGb2xkZXIsIHNvdXJjZUxpbmtNRDVKU0ZvbGRlckxpbmtlZCwgJ2p1bmN0aW9uJyk7XG5cblx0XHQvLyBUYXJnZXQgRm9sZGVyXG5cdFx0Y29uc3QgdGFyZ2V0TGlua1Rlc3RGb2xkZXIgPSBqb2luKHNvdXJjZUZvbGRlciwgJ2xpbmstdGVzdCBjb3B5Jyk7XHRcdFx0XHQvLyBjb3B5LXRlc3QvbGluay10ZXN0IGNvcHlcblx0XHRjb25zdCB0YXJnZXRMaW5rTUQ1SlNGb2xkZXIgPSBqb2luKHRhcmdldExpbmtUZXN0Rm9sZGVyLCAnbWQ1Jyk7XHRcdFx0XHQvLyBjb3B5LXRlc3QvbGluay10ZXN0IGNvcHkvbWQ1XG5cdFx0Y29uc3QgdGFyZ2V0TGlua01ENUpTRmlsZSA9IGpvaW4odGFyZ2V0TGlua01ENUpTRm9sZGVyLCAnbWQ1LmpzJyk7XHRcdFx0XHQvLyBjb3B5LXRlc3QvbGluay10ZXN0IGNvcHkvbWQ1L21kNS5qc1xuXHRcdGNvbnN0IHRhcmdldExpbmtNRDVKU0ZvbGRlckxpbmtlZCA9IGpvaW4odGFyZ2V0TGlua1Rlc3RGb2xkZXIsICdtZDUtbGlua2VkJyk7XHQvLyBjb3B5LXRlc3QvbGluay10ZXN0IGNvcHkvbWQ1LWxpbmtlZFxuXG5cdFx0Ly8gQ29weSB3aXRoIGBwcmVzZXJ2ZVN5bWxpbmtzOiB0cnVlYCBhbmQgdmVyaWZ5IHJlc3VsdFxuXHRcdC8vXG5cdFx0Ly8gV2luZG93czogdGhpcyB0ZXN0IGRvZXMgbm90IHdvcmsgYmVjYXVzZSBjcmVhdGluZyBzeW1saW5rc1xuXHRcdC8vIHJlcXVpcmVzIHByaXZpbGVkZ2VkIHBlcm1pc3Npb25zIChhZG1pbikuXG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdGF3YWl0IFByb21pc2VzLmNvcHkoc291cmNlTGlua1Rlc3RGb2xkZXIsIHRhcmdldExpbmtUZXN0Rm9sZGVyLCB7IHByZXNlcnZlU3ltbGlua3M6IHRydWUgfSk7XG5cblx0XHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKHRhcmdldExpbmtUZXN0Rm9sZGVyKSk7XG5cdFx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyh0YXJnZXRMaW5rTUQ1SlNGb2xkZXIpKTtcblx0XHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKHRhcmdldExpbmtNRDVKU0ZpbGUpKTtcblx0XHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKHRhcmdldExpbmtNRDVKU0ZvbGRlckxpbmtlZCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZzLmxzdGF0U3luYyh0YXJnZXRMaW5rTUQ1SlNGb2xkZXJMaW5rZWQpLmlzU3ltYm9saWNMaW5rKCkpO1xuXG5cdFx0XHRjb25zdCBsaW5rVGFyZ2V0ID0gYXdhaXQgZnMucHJvbWlzZXMucmVhZGxpbmsodGFyZ2V0TGlua01ENUpTRm9sZGVyTGlua2VkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5rVGFyZ2V0LCB0YXJnZXRMaW5rTUQ1SlNGb2xkZXIpO1xuXG5cdFx0XHRhd2FpdCBQcm9taXNlcy5ybSh0YXJnZXRMaW5rVGVzdEZvbGRlcik7XG5cdFx0fVxuXG5cdFx0Ly8gQ29weSB3aXRoIGBwcmVzZXJ2ZVN5bWxpbmtzOiBmYWxzZWAgYW5kIHZlcmlmeSByZXN1bHRcblx0XHRhd2FpdCBQcm9taXNlcy5jb3B5KHNvdXJjZUxpbmtUZXN0Rm9sZGVyLCB0YXJnZXRMaW5rVGVzdEZvbGRlciwgeyBwcmVzZXJ2ZVN5bWxpbmtzOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKHRhcmdldExpbmtUZXN0Rm9sZGVyKSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmModGFyZ2V0TGlua01ENUpTRm9sZGVyKSk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmModGFyZ2V0TGlua01ENUpTRmlsZSkpO1xuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKHRhcmdldExpbmtNRDVKU0ZvbGRlckxpbmtlZCkpO1xuXHRcdGFzc2VydC5vayhmcy5sc3RhdFN5bmModGFyZ2V0TGlua01ENUpTRm9sZGVyTGlua2VkKS5pc0RpcmVjdG9yeSgpKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZERpcnNJbkRpcicsIGFzeW5jICgpID0+IHtcblx0XHRmcy5ta2RpclN5bmMoam9pbih0ZXN0RGlyLCAnc29tZWZvbGRlcjEnKSk7XG5cdFx0ZnMubWtkaXJTeW5jKGpvaW4odGVzdERpciwgJ3NvbWVmb2xkZXIyJykpO1xuXHRcdGZzLm1rZGlyU3luYyhqb2luKHRlc3REaXIsICdzb21lZm9sZGVyMycpKTtcblx0XHRmcy53cml0ZUZpbGVTeW5jKGpvaW4odGVzdERpciwgJ3NvbWVmaWxlLnR4dCcpLCAnQ29udGVudHMnKTtcblx0XHRmcy53cml0ZUZpbGVTeW5jKGpvaW4odGVzdERpciwgJ3NvbWVPdGhlckZpbGUudHh0JyksICdDb250ZW50cycpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgUHJvbWlzZXMucmVhZERpcnNJbkRpcih0ZXN0RGlyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmRleE9mKCdzb21lZm9sZGVyMScpICE9PSAtMSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmRleE9mKCdzb21lZm9sZGVyMicpICE9PSAtMSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmRleE9mKCdzb21lZm9sZGVyMycpICE9PSAtMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXQgbGluaycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXJlY3RvcnkgPSByYW5kb21QYXRoKHRlc3REaXIpO1xuXHRcdGNvbnN0IHN5bWJvbGljTGluayA9IHJhbmRvbVBhdGgodGVzdERpcik7XG5cblx0XHRhd2FpdCBmcy5wcm9taXNlcy5ta2RpcihkaXJlY3RvcnksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXG5cdFx0ZnMuc3ltbGlua1N5bmMoZGlyZWN0b3J5LCBzeW1ib2xpY0xpbmssICdqdW5jdGlvbicpO1xuXG5cdFx0bGV0IHN0YXRBbmRJc0xpbmsgPSBhd2FpdCBTeW1saW5rU3VwcG9ydC5zdGF0KGRpcmVjdG9yeSk7XG5cdFx0YXNzZXJ0Lm9rKCFzdGF0QW5kSXNMaW5rPy5zeW1ib2xpY0xpbmspO1xuXG5cdFx0c3RhdEFuZElzTGluayA9IGF3YWl0IFN5bWxpbmtTdXBwb3J0LnN0YXQoc3ltYm9saWNMaW5rKTtcblx0XHRhc3NlcnQub2soc3RhdEFuZElzTGluaz8uc3ltYm9saWNMaW5rKTtcblx0XHRhc3NlcnQub2soIXN0YXRBbmRJc0xpbms/LnN5bWJvbGljTGluaz8uZGFuZ2xpbmcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGF0IGxpbmsgKG5vbiBleGlzdGluZyB0YXJnZXQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpcmVjdG9yeSA9IHJhbmRvbVBhdGgodGVzdERpcik7XG5cdFx0Y29uc3Qgc3ltYm9saWNMaW5rID0gcmFuZG9tUGF0aCh0ZXN0RGlyKTtcblxuXHRcdGF3YWl0IGZzLnByb21pc2VzLm1rZGlyKGRpcmVjdG9yeSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cblx0XHRmcy5zeW1saW5rU3luYyhkaXJlY3RvcnksIHN5bWJvbGljTGluaywgJ2p1bmN0aW9uJyk7XG5cblx0XHRhd2FpdCBQcm9taXNlcy5ybShkaXJlY3RvcnkpO1xuXG5cdFx0Y29uc3Qgc3RhdEFuZElzTGluayA9IGF3YWl0IFN5bWxpbmtTdXBwb3J0LnN0YXQoc3ltYm9saWNMaW5rKTtcblx0XHRhc3NlcnQub2soc3RhdEFuZElzTGluaz8uc3ltYm9saWNMaW5rKTtcblx0XHRhc3NlcnQub2soc3RhdEFuZElzTGluaz8uc3ltYm9saWNMaW5rPy5kYW5nbGluZyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRkaXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyZW50ID0gcmFuZG9tUGF0aChqb2luKHRlc3REaXIsICdwZnMnKSk7XG5cdFx0Y29uc3QgbmV3RGlyID0gam9pbihwYXJlbnQsICdcdTAwRjZcdTAwRTRcdTAwRkMnKTtcblxuXHRcdGF3YWl0IGZzLnByb21pc2VzLm1rZGlyKG5ld0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyhuZXdEaXIpKTtcblxuXHRcdGNvbnN0IGNoaWxkcmVuID0gYXdhaXQgUHJvbWlzZXMucmVhZGRpcihwYXJlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZHJlbi5zb21lKG4gPT4gbiA9PT0gJ1x1MDBGNlx1MDBFNFx1MDBGQycpLCB0cnVlKTsgLy8gTWFjIGFsd2F5cyBjb252ZXJ0cyB0byBORkQsIHNvXG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRkaXIgKHdpdGggZmlsZSB0eXBlcyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbmV3RGlyID0gam9pbih0ZXN0RGlyLCAnXHUwMEY2XHUwMEU0XHUwMEZDJyk7XG5cdFx0YXdhaXQgZnMucHJvbWlzZXMubWtkaXIobmV3RGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblxuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZShqb2luKHRlc3REaXIsICdzb21lZmlsZS50eHQnKSwgJ2NvbnRlbnRzJyk7XG5cblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyhuZXdEaXIpKTtcblxuXHRcdGNvbnN0IGNoaWxkcmVuID0gYXdhaXQgUHJvbWlzZXMucmVhZGRpcih0ZXN0RGlyLCB7IHdpdGhGaWxlVHlwZXM6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hpbGRyZW4uc29tZShuID0+IG4ubmFtZSA9PT0gJ1x1MDBGNlx1MDBFNFx1MDBGQycpLCB0cnVlKTsgLy8gTWFjIGFsd2F5cyBjb252ZXJ0cyB0byBORkQsIHNvXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoaWxkcmVuLnNvbWUobiA9PiBuLmlzRGlyZWN0b3J5KCkpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZHJlbi5zb21lKG4gPT4gbi5uYW1lID09PSAnc29tZWZpbGUudHh0JyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZHJlbi5zb21lKG4gPT4gbi5pc0ZpbGUoKSksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgKHN0cmluZyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc21hbGxEYXRhID0gJ0hlbGxvIFdvcmxkJztcblx0XHRjb25zdCBiaWdEYXRhID0gKG5ldyBBcnJheSgxMDAgKiAxMDI0KSkuam9pbignTGFyZ2UgU3RyaW5nXFxuJyk7XG5cblx0XHRyZXR1cm4gdGVzdFdyaXRlRmlsZShzbWFsbERhdGEsIHNtYWxsRGF0YSwgYmlnRGF0YSwgYmlnRGF0YSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAoc3RyaW5nKSAtIGZsdXNoIG9uIHdyaXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ3VyZUZsdXNoT25Xcml0ZSh0cnVlKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc21hbGxEYXRhID0gJ0hlbGxvIFdvcmxkJztcblx0XHRcdGNvbnN0IGJpZ0RhdGEgPSAobmV3IEFycmF5KDEwMCAqIDEwMjQpKS5qb2luKCdMYXJnZSBTdHJpbmdcXG4nKTtcblxuXHRcdFx0cmV0dXJuIGF3YWl0IHRlc3RXcml0ZUZpbGUoc21hbGxEYXRhLCBzbWFsbERhdGEsIGJpZ0RhdGEsIGJpZ0RhdGEpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjb25maWd1cmVGbHVzaE9uV3JpdGUoZmFsc2UpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnd3JpdGVGaWxlIChCdWZmZXIpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNtYWxsRGF0YSA9ICdIZWxsbyBXb3JsZCc7XG5cdFx0Y29uc3QgYmlnRGF0YSA9IChuZXcgQXJyYXkoMTAwICogMTAyNCkpLmpvaW4oJ0xhcmdlIFN0cmluZ1xcbicpO1xuXG5cdFx0cmV0dXJuIHRlc3RXcml0ZUZpbGUoQnVmZmVyLmZyb20oc21hbGxEYXRhKSwgc21hbGxEYXRhLCBCdWZmZXIuZnJvbShiaWdEYXRhKSwgYmlnRGF0YSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAoVUludDhBcnJheSknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc21hbGxEYXRhID0gJ0hlbGxvIFdvcmxkJztcblx0XHRjb25zdCBiaWdEYXRhID0gKG5ldyBBcnJheSgxMDAgKiAxMDI0KSkuam9pbignTGFyZ2UgU3RyaW5nXFxuJyk7XG5cblx0XHRyZXR1cm4gdGVzdFdyaXRlRmlsZShWU0J1ZmZlci5mcm9tU3RyaW5nKHNtYWxsRGF0YSkuYnVmZmVyLCBzbWFsbERhdGEsIFZTQnVmZmVyLmZyb21TdHJpbmcoYmlnRGF0YSkuYnVmZmVyLCBiaWdEYXRhKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdGVzdFdyaXRlRmlsZShcblx0XHRzbWFsbERhdGE6IHN0cmluZyB8IEJ1ZmZlciB8IFVpbnQ4QXJyYXksXG5cdFx0c21hbGxEYXRhVmFsdWU6IHN0cmluZyxcblx0XHRiaWdEYXRhOiBzdHJpbmcgfCBCdWZmZXIgfCBVaW50OEFycmF5LFxuXHRcdGJpZ0RhdGFWYWx1ZTogc3RyaW5nXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRlc3RGaWxlID0gam9pbih0ZXN0RGlyLCAnZmx1c2hlZC50eHQnKTtcblxuXHRcdGFzc2VydC5vayhmcy5leGlzdHNTeW5jKHRlc3REaXIpKTtcblxuXHRcdGF3YWl0IFByb21pc2VzLndyaXRlRmlsZSh0ZXN0RmlsZSwgc21hbGxEYXRhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZnMucmVhZEZpbGVTeW5jKHRlc3RGaWxlKS50b1N0cmluZygpLCBzbWFsbERhdGFWYWx1ZSk7XG5cblx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUodGVzdEZpbGUsIGJpZ0RhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcy5yZWFkRmlsZVN5bmModGVzdEZpbGUpLnRvU3RyaW5nKCksIGJpZ0RhdGFWYWx1ZSk7XG5cdH1cblxuXHR0ZXN0KCd3cml0ZUZpbGUgKHN0cmluZywgZXJyb3IgaGFuZGxpbmcpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RGaWxlID0gam9pbih0ZXN0RGlyLCAnZmx1c2hlZC50eHQnKTtcblxuXHRcdGZzLm1rZGlyU3luYyh0ZXN0RmlsZSk7IC8vIHRoaXMgd2lsbCB0cmlnZ2VyIGFuIGVycm9yIGxhdGVyIGJlY2F1c2UgdGVzdEZpbGUgaXMgbm93IGEgZGlyZWN0b3J5IVxuXG5cdFx0bGV0IGV4cGVjdGVkRXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlcy53cml0ZUZpbGUodGVzdEZpbGUsICdIZWxsbyBXb3JsZCcpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRleHBlY3RlZEVycm9yID0gZXJyb3I7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGV4cGVjdGVkRXJyb3IpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGVTeW5jJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RGaWxlID0gam9pbih0ZXN0RGlyLCAnZmx1c2hlZC50eHQnKTtcblxuXHRcdHdyaXRlRmlsZVN5bmModGVzdEZpbGUsICdIZWxsbyBXb3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmcy5yZWFkRmlsZVN5bmModGVzdEZpbGUpLnRvU3RyaW5nKCksICdIZWxsbyBXb3JsZCcpO1xuXG5cdFx0Y29uc3QgbGFyZ2VTdHJpbmcgPSAobmV3IEFycmF5KDEwMCAqIDEwMjQpKS5qb2luKCdMYXJnZSBTdHJpbmdcXG4nKTtcblxuXHRcdHdyaXRlRmlsZVN5bmModGVzdEZpbGUsIGxhcmdlU3RyaW5nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZnMucmVhZEZpbGVTeW5jKHRlc3RGaWxlKS50b1N0cmluZygpLCBsYXJnZVN0cmluZyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWxjYXNlJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0Ly8gYXNzdW1lIGNhc2UgaW5zZW5zaXRpdmUgZmlsZSBzeXN0ZW1cblx0XHRpZiAocHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyB8fCBwcm9jZXNzLnBsYXRmb3JtID09PSAnZGFyd2luJykge1xuXHRcdFx0Y29uc3QgdXBwZXIgPSB0ZXN0RGlyLnRvVXBwZXJDYXNlKCk7XG5cdFx0XHRjb25zdCByZWFsID0gYXdhaXQgcmVhbGNhc2UodXBwZXIpO1xuXG5cdFx0XHRpZiAocmVhbCkgeyAvLyBjYW4gYmUgbnVsbCBpbiBjYXNlIG9mIHBlcm1pc3Npb24gZXJyb3JzXG5cdFx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChyZWFsLCB1cHBlcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFsLnRvVXBwZXJDYXNlKCksIHVwcGVyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWwsIHRlc3REaXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGxpbnV4LCB1bml4LCBldGMuIC0+IGFzc3VtZSBjYXNlIHNlbnNpdGl2ZSBmaWxlIHN5c3RlbVxuXHRcdGVsc2Uge1xuXHRcdFx0bGV0IHJlYWwgPSBhd2FpdCByZWFsY2FzZSh0ZXN0RGlyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFsLCB0ZXN0RGlyKTtcblxuXHRcdFx0cmVhbCA9IGF3YWl0IHJlYWxjYXNlKHRlc3REaXIudG9VcHBlckNhc2UoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhbCwgdGVzdERpci50b1VwcGVyQ2FzZSgpKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWxwYXRoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlYWxwYXRoVmFsID0gYXdhaXQgUHJvbWlzZXMucmVhbHBhdGgodGVzdERpcik7XG5cdFx0YXNzZXJ0Lm9rKHJlYWxwYXRoVmFsKTtcblx0fSk7XG5cblx0dGVzdCgncmVhbHBhdGhTeW5jJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlYWxwYXRoID0gcmVhbHBhdGhTeW5jKHRlc3REaXIpO1xuXHRcdGFzc2VydC5vayhyZWFscGF0aCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsY0FBYztBQUN2QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxVQUFVLFNBQVMsTUFBTSxXQUFXO0FBQzdDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsdUJBQXVCLFVBQVUsVUFBVSxjQUFjLFlBQVksZ0JBQWdCLHFCQUFxQjtBQUNuSCxTQUFTLCtDQUErQztBQUN4RCxTQUFTLFlBQVkseUJBQXlCO0FBRTlDLHNCQUFzQixLQUFLO0FBRTNCLFdBQVcsT0FBTyxXQUFZO0FBRTdCLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCxjQUFVLGtCQUFrQixPQUFPLEdBQUcsWUFBWSxLQUFLO0FBRXZELFdBQU8sR0FBRyxTQUFTLE1BQU0sU0FBUyxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBQUEsRUFDdEQsQ0FBQztBQUVELFdBQVMsTUFBTTtBQUNkLFdBQU8sU0FBUyxHQUFHLE9BQU87QUFBQSxFQUMzQixDQUFDO0FBRUQsT0FBSyxhQUFhLFlBQVk7QUFDN0IsVUFBTSxXQUFXLEtBQUssU0FBUyxlQUFlO0FBRTlDLFdBQU8sR0FBRyxDQUFFLE1BQU0sU0FBUyxPQUFPLFFBQVEsQ0FBRTtBQUU1QyxVQUFNLFNBQVMsVUFBVSxVQUFVLGVBQWdCLElBQU07QUFFekQsV0FBTyxhQUFhLE1BQU0sR0FBRyxTQUFTLFNBQVMsUUFBUSxHQUFHLFNBQVMsR0FBRyxhQUFhO0FBQUEsRUFDcEYsQ0FBQztBQUVELE9BQUssdURBQXVELFlBQVk7QUFDdkUsVUFBTSxZQUFZLEtBQUssU0FBUyxnQkFBZ0I7QUFDaEQsVUFBTSxZQUFZLEtBQUssU0FB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
