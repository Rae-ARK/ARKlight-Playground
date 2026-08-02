import assert from "assert";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { isLinux, isWindows } from "../../../../base/common/platform.js";
import { isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileChangeFilter, FileChangesEvent, FileChangeType } from "../../common/files.js";
import { coalesceEvents, reviveFileChanges, parseWatcherPatterns, isFiltered } from "../../common/watcher.js";
class TestFileWatcher extends Disposable {
  constructor() {
    super();
    this._onDidFilesChange = this._register(new Emitter());
  }
  get onDidFilesChange() {
    return this._onDidFilesChange.event;
  }
  report(changes) {
    this.onRawFileEvents(changes);
  }
  onRawFileEvents(events) {
    const coalescedEvents = coalesceEvents(events);
    if (coalescedEvents.length > 0) {
      this._onDidFilesChange.fire({ raw: reviveFileChanges(coalescedEvents), event: this.toFileChangesEvent(coalescedEvents) });
    }
  }
  toFileChangesEvent(changes) {
    return new FileChangesEvent(reviveFileChanges(changes), !isLinux);
  }
}
var Path = /* @__PURE__ */ ((Path2) => {
  Path2[Path2["UNIX"] = 0] = "UNIX";
  Path2[Path2["WINDOWS"] = 1] = "WINDOWS";
  Path2[Path2["UNC"] = 2] = "UNC";
  return Path2;
})(Path || {});
suite("Watcher", () => {
  (isWindows ? test.skip : test)("parseWatcherPatterns - posix", () => {
    const path = "/users/data/src";
    let parsedPattern = parseWatcherPatterns(path, ["*.js"], false)[0];
    assert.strictEqual(parsedPattern("/users/data/src/foo.js"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.ts"), false);
    assert.strictEqual(parsedPattern("/users/data/src/bar/foo.js"), false);
    parsedPattern = parseWatcherPatterns(path, ["/users/data/src/*.js"], false)[0];
    assert.strictEqual(parsedPattern("/users/data/src/foo.js"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.ts"), false);
    assert.strictEqual(parsedPattern("/users/data/src/bar/foo.js"), false);
    parsedPattern = parseWatcherPatterns(path, ["/users/data/src/bar/*.js"], false)[0];
    assert.strictEqual(parsedPattern("/users/data/src/foo.js"), false);
    assert.strictEqual(parsedPattern("/users/data/src/foo.ts"), false);
    assert.strictEqual(parsedPattern("/users/data/src/bar/foo.js"), true);
    parsedPattern = parseWatcherPatterns(path, ["**/*.js"], false)[0];
    assert.strictEqual(parsedPattern("/users/data/src/foo.js"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.ts"), false);
    assert.strictEqual(parsedPattern("/users/data/src/bar/foo.js"), true);
  });
  (!isWindows ? test.skip : test)("parseWatcherPatterns - windows", () => {
    const path = "c:\\users\\data\\src";
    let parsedPattern = parseWatcherPatterns(path, ["*.js"], true)[0];
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.ts"), false);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\bar/foo.js"), false);
    parsedPattern = parseWatcherPatterns(path, ["c:\\users\\data\\src\\*.js"], true)[0];
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.ts"), false);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\bar\\foo.js"), false);
    parsedPattern = parseWatcherPatterns(path, ["c:\\users\\data\\src\\bar/*.js"], true)[0];
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.js"), false);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.ts"), false);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\bar\\foo.js"), true);
    parsedPattern = parseWatcherPatterns(path, ["**/*.js"], true)[0];
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.ts"), false);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\bar\\foo.js"), true);
  });
  (isWindows ? test.skip : test)("parseWatcherPatterns - posix (case insensitive)", () => {
    const path = "/users/data/src";
    let parsedPattern = parseWatcherPatterns(path, ["*.JS"], false)[0];
    assert.strictEqual(parsedPattern("/users/data/src/foo.js"), false);
    assert.strictEqual(parsedPattern("/users/data/src/foo.JS"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.Js"), false);
    parsedPattern = parseWatcherPatterns(path, ["*.JS"], true)[0];
    assert.strictEqual(parsedPattern("/users/data/src/foo.js"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.JS"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.Js"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.ts"), false);
    parsedPattern = parseWatcherPatterns(path, ["/users/data/src/*.JS"], true)[0];
    assert.strictEqual(parsedPattern("/users/data/src/foo.js"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.JS"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.ts"), false);
    assert.strictEqual(parsedPattern("/users/data/src/bar/foo.js"), false);
    parsedPattern = parseWatcherPatterns(path, ["**/Test*.JS"], true)[0];
    assert.strictEqual(parsedPattern("/users/data/src/test1.js"), true);
    assert.strictEqual(parsedPattern("/users/data/src/Test1.js"), true);
    assert.strictEqual(parsedPattern("/users/data/src/TEST1.JS"), true);
    assert.strictEqual(parsedPattern("/users/data/src/bar/test2.js"), true);
    assert.strictEqual(parsedPattern("/users/data/src/bar/TEST2.JS"), true);
    assert.strictEqual(parsedPattern("/users/data/src/foo.js"), false);
  });
  (!isWindows ? test.skip : test)("parseWatcherPatterns - windows (case insensitive)", () => {
    const path = "c:\\users\\data\\src";
    let parsedPattern = parseWatcherPatterns(path, ["*.JS"], true)[0];
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.JS"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.Js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.ts"), false);
    parsedPattern = parseWatcherPatterns(path, ["*.JS"], true)[0];
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.JS"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.Js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.ts"), false);
    parsedPattern = parseWatcherPatterns(path, ["c:\\users\\data\\src\\*.JS"], true)[0];
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.JS"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.ts"), false);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\bar\\foo.js"), false);
    parsedPattern = parseWatcherPatterns(path, ["**/Test*.JS"], true)[0];
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\test1.js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\Test1.js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\TEST1.JS"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\bar\\test2.js"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\bar\\TEST2.JS"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.js"), false);
    parsedPattern = parseWatcherPatterns(path, ["*.JS"], false)[0];
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.js"), false);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.JS"), true);
    assert.strictEqual(parsedPattern("c:\\users\\data\\src\\foo.Js"), false);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
suite("Watcher Events Normalizer", () => {
  const disposables = new DisposableStore();
  teardown(() => {
    disposables.clear();
  });
  test("simple add/update/delete", (done) => {
    const watch = disposables.add(new TestFileWatcher());
    const added = URI.file("/users/data/src/added.txt");
    const updated = URI.file("/users/data/src/updated.txt");
    const deleted = URI.file("/users/data/src/deleted.txt");
    const raw = [
      { resource: added, type: FileChangeType.ADDED },
      { resource: updated, type: FileChangeType.UPDATED },
      { resource: deleted, type: FileChangeType.DELETED }
    ];
    disposables.add(watch.onDidFilesChange(({ event, raw: raw2 }) => {
      assert.ok(event);
      assert.strictEqual(raw2.length, 3);
      assert.ok(event.contains(added, FileChangeType.ADDED));
      assert.ok(event.contains(updated, FileChangeType.UPDATED));
      assert.ok(event.contains(deleted, FileChangeType.DELETED));
      done();
    }));
    watch.report(raw);
  });
  (isWindows ? [1 /* WINDOWS */, 2 /* UNC */] : [0 /* UNIX */]).forEach((path) => {
    test(`delete only reported for top level folder (${path})`, (done) => {
      const watch = disposables.add(new TestFileWatcher());
      const deletedFolderA = URI.file(path === 0 /* UNIX */ ? "/users/data/src/todelete1" : path === 1 /* WINDOWS */ ? "C:\\users\\data\\src\\todelete1" : "\\\\localhost\\users\\data\\src\\todelete1");
      const deletedFolderB = URI.file(path === 0 /* UNIX */ ? "/users/data/src/todelete2" : path === 1 /* WINDOWS */ ? "C:\\users\\data\\src\\todelete2" : "\\\\localhost\\users\\data\\src\\todelete2");
      const deletedFolderBF1 = URI.file(path === 0 /* UNIX */ ? "/users/data/src/todelete2/file.txt" : path === 1 /* WINDOWS */ ? "C:\\users\\data\\src\\todelete2\\file.txt" : "\\\\localhost\\users\\data\\src\\todelete2\\file.txt");
      const deletedFolderBF2 = URI.file(path === 0 /* UNIX */ ? "/users/data/src/todelete2/more/test.txt" : path === 1 /* WINDOWS */ ? "C:\\users\\data\\src\\todelete2\\more\\test.txt" : "\\\\localhost\\users\\data\\src\\todelete2\\more\\test.txt");
      const deletedFolderBF3 = URI.file(path === 0 /* UNIX */ ? "/users/data/src/todelete2/super/bar/foo.txt" : path === 1 /* WINDOWS */ ? "C:\\users\\data\\src\\todelete2\\super\\bar\\foo.txt" : "\\\\localhost\\users\\data\\src\\todelete2\\super\\bar\\foo.txt");
      const deletedFileA = URI.file(path === 0 /* UNIX */ ? "/users/data/src/deleteme.txt" : path === 1 /* WINDOWS */ ? "C:\\users\\data\\src\\deleteme.txt" : "\\\\localhost\\users\\data\\src\\deleteme.txt");
      const addedFile = URI.file(path === 0 /* UNIX */ ? "/users/data/src/added.txt" : path === 1 /* WINDOWS */ ? "C:\\users\\data\\src\\added.txt" : "\\\\localhost\\users\\data\\src\\added.txt");
      const updatedFile = URI.file(path === 0 /* UNIX */ ? "/users/data/src/updated.txt" : path === 1 /* WINDOWS */ ? "C:\\users\\data\\src\\updated.txt" : "\\\\localhost\\users\\data\\src\\updated.txt");
      const raw = [
        { resource: deletedFolderA, type: FileChangeType.DELETED },
        { resource: deletedFolderB, type: FileChangeType.DELETED },
        { resource: deletedFolderBF1, type: FileChangeType.DELETED },
        { resource: deletedFolderBF2, type: FileChangeType.DELETED },
        { resource: deletedFolderBF3, type: FileChangeType.DELETED },
        { resource: deletedFileA, type: FileChangeType.DELETED },
        { resource: addedFile, type: FileChangeType.ADDED },
        { resource: updatedFile, type: FileChangeType.UPDATED }
      ];
      disposables.add(watch.onDidFilesChange(({ event, raw: raw2 }) => {
        assert.ok(event);
        assert.strictEqual(raw2.length, 5);
        assert.ok(event.contains(deletedFolderA, FileChangeType.DELETED));
        assert.ok(event.contains(deletedFolderB, FileChangeType.DELETED));
        assert.ok(event.contains(deletedFileA, FileChangeType.DELETED));
        assert.ok(event.contains(addedFile, FileChangeType.ADDED));
        assert.ok(event.contains(updatedFile, FileChangeType.UPDATED));
        done();
      }));
      watch.report(raw);
    });
  });
  test("event coalescer: ignore CREATE followed by DELETE", (done) => {
    const watch = disposables.add(new TestFileWatcher());
    const created = URI.file("/users/data/src/related");
    const deleted = URI.file("/users/data/src/related");
    const unrelated = URI.file("/users/data/src/unrelated");
    const raw = [
      { resource: created, type: FileChangeType.ADDED },
      { resource: deleted, type: FileChangeType.DELETED },
      { resource: unrelated, type: FileChangeType.UPDATED }
    ];
    disposables.add(watch.onDidFilesChange(({ event, raw: raw2 }) => {
      assert.ok(event);
      assert.strictEqual(raw2.length, 1);
      assert.ok(event.contains(unrelated, FileChangeType.UPDATED));
      done();
    }));
    watch.report(raw);
  });
  test("event coalescer: flatten DELETE followed by CREATE into CHANGE", (done) => {
    const watch = disposables.add(new TestFileWatcher());
    const deleted = URI.file("/users/data/src/related");
    const created = URI.file("/users/data/src/related");
    const unrelated = URI.file("/users/data/src/unrelated");
    const raw = [
      { resource: deleted, type: FileChangeType.DELETED },
      { resource: created, type: FileChangeType.ADDED },
      { resource: unrelated, type: FileChangeType.UPDATED }
    ];
    disposables.add(watch.onDidFilesChange(({ event, raw: raw2 }) => {
      assert.ok(event);
      assert.strictEqual(raw2.length, 2);
      assert.ok(event.contains(deleted, FileChangeType.UPDATED));
      assert.ok(event.contains(unrelated, FileChangeType.UPDATED));
      done();
    }));
    watch.report(raw);
  });
  test("event coalescer: ignore UPDATE when CREATE received", (done) => {
    const watch = disposables.add(new TestFileWatcher());
    const created = URI.file("/users/data/src/related");
    const updated = URI.file("/users/data/src/related");
    const unrelated = URI.file("/users/data/src/unrelated");
    const raw = [
      { resource: created, type: FileChangeType.ADDED },
      { resource: updated, type: FileChangeType.UPDATED },
      { resource: unrelated, type: FileChangeType.UPDATED }
    ];
    disposables.add(watch.onDidFilesChange(({ event, raw: raw2 }) => {
      assert.ok(event);
      assert.strictEqual(raw2.length, 2);
      assert.ok(event.contains(created, FileChangeType.ADDED));
      assert.ok(!event.contains(created, FileChangeType.UPDATED));
      assert.ok(event.contains(unrelated, FileChangeType.UPDATED));
      done();
    }));
    watch.report(raw);
  });
  test("event coalescer: apply DELETE", (done) => {
    const watch = disposables.add(new TestFileWatcher());
    const updated = URI.file("/users/data/src/related");
    const updated2 = URI.file("/users/data/src/related");
    const deleted = URI.file("/users/data/src/related");
    const unrelated = URI.file("/users/data/src/unrelated");
    const raw = [
      { resource: updated, type: FileChangeType.UPDATED },
      { resource: updated2, type: FileChangeType.UPDATED },
      { resource: unrelated, type: FileChangeType.UPDATED },
      { resource: updated, type: FileChangeType.DELETED }
    ];
    disposables.add(watch.onDidFilesChange(({ event, raw: raw2 }) => {
      assert.ok(event);
      assert.strictEqual(raw2.length, 2);
      assert.ok(event.contains(deleted, FileChangeType.DELETED));
      assert.ok(!event.contains(updated, FileChangeType.UPDATED));
      assert.ok(event.contains(unrelated, FileChangeType.UPDATED));
      done();
    }));
    watch.report(raw);
  });
  test("event coalescer: track case renames", (done) => {
    const watch = disposables.add(new TestFileWatcher());
    const oldPath = URI.file("/users/data/src/added");
    const newPath = URI.file("/users/data/src/ADDED");
    const raw = [
      { resource: newPath, type: FileChangeType.ADDED },
      { resource: oldPath, type: FileChangeType.DELETED }
    ];
    disposables.add(watch.onDidFilesChange(({ event, raw: raw2 }) => {
      assert.ok(event);
      assert.strictEqual(raw2.length, 2);
      for (const r of raw2) {
        if (isEqual(r.resource, oldPath)) {
          assert.strictEqual(r.type, FileChangeType.DELETED);
        } else if (isEqual(r.resource, newPath)) {
          assert.strictEqual(r.type, FileChangeType.ADDED);
        } else {
          assert.fail();
        }
      }
      done();
    }));
    watch.report(raw);
  });
  test("event type filter", () => {
    const resource = URI.file("/users/data/src/related");
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.ADDED }, void 0), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.UPDATED }, void 0), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.DELETED }, void 0), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.ADDED }, FileChangeFilter.UPDATED), true);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.ADDED }, FileChangeFilter.UPDATED | FileChangeFilter.DELETED), true);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.ADDED }, FileChangeFilter.ADDED), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.ADDED }, FileChangeFilter.ADDED | FileChangeFilter.UPDATED), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.ADDED }, FileChangeFilter.ADDED | FileChangeFilter.UPDATED | FileChangeFilter.DELETED), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.DELETED }, FileChangeFilter.UPDATED), true);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.DELETED }, FileChangeFilter.UPDATED | FileChangeFilter.ADDED), true);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.DELETED }, FileChangeFilter.DELETED), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.DELETED }, FileChangeFilter.DELETED | FileChangeFilter.UPDATED), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.DELETED }, FileChangeFilter.ADDED | FileChangeFilter.DELETED | FileChangeFilter.UPDATED), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.UPDATED }, FileChangeFilter.ADDED), true);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.UPDATED }, FileChangeFilter.DELETED | FileChangeFilter.ADDED), true);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.UPDATED }, FileChangeFilter.UPDATED), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.UPDATED }, FileChangeFilter.DELETED | FileChangeFilter.UPDATED), false);
    assert.strictEqual(isFiltered({ resource, type: FileChangeType.UPDATED }, FileChangeFilter.ADDED | FileChangeFilter.DELETED | FileChangeFilter.UPDATED), false);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3QvY29tbW9uL3dhdGNoZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzTGludXgsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRmlsZUNoYW5nZUZpbHRlciwgRmlsZUNoYW5nZXNFdmVudCwgRmlsZUNoYW5nZVR5cGUsIElGaWxlQ2hhbmdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlRXZlbnRzLCByZXZpdmVGaWxlQ2hhbmdlcywgcGFyc2VXYXRjaGVyUGF0dGVybnMsIGlzRmlsdGVyZWQgfSBmcm9tICcuLi8uLi9jb21tb24vd2F0Y2hlci5qcyc7XG5cbmNsYXNzIFRlc3RGaWxlV2F0Y2hlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZpbGVzQ2hhbmdlOiBFbWl0dGVyPHsgcmF3OiBJRmlsZUNoYW5nZVtdOyBldmVudDogRmlsZUNoYW5nZXNFdmVudCB9PjtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fb25EaWRGaWxlc0NoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmF3OiBJRmlsZUNoYW5nZVtdOyBldmVudDogRmlsZUNoYW5nZXNFdmVudCB9PigpKTtcblx0fVxuXG5cdGdldCBvbkRpZEZpbGVzQ2hhbmdlKCk6IEV2ZW50PHsgcmF3OiBJRmlsZUNoYW5nZVtdOyBldmVudDogRmlsZUNoYW5nZXNFdmVudCB9PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkRmlsZXNDaGFuZ2UuZXZlbnQ7XG5cdH1cblxuXHRyZXBvcnQoY2hhbmdlczogSUZpbGVDaGFuZ2VbXSk6IHZvaWQge1xuXHRcdHRoaXMub25SYXdGaWxlRXZlbnRzKGNoYW5nZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblJhd0ZpbGVFdmVudHMoZXZlbnRzOiBJRmlsZUNoYW5nZVtdKTogdm9pZCB7XG5cblx0XHQvLyBDb2FsZXNjZVxuXHRcdGNvbnN0IGNvYWxlc2NlZEV2ZW50cyA9IGNvYWxlc2NlRXZlbnRzKGV2ZW50cyk7XG5cblx0XHQvLyBFbWl0IHRocm91Z2ggZXZlbnQgZW1pdHRlclxuXHRcdGlmIChjb2FsZXNjZWRFdmVudHMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fb25EaWRGaWxlc0NoYW5nZS5maXJlKHsgcmF3OiByZXZpdmVGaWxlQ2hhbmdlcyhjb2FsZXNjZWRFdmVudHMpLCBldmVudDogdGhpcy50b0ZpbGVDaGFuZ2VzRXZlbnQoY29hbGVzY2VkRXZlbnRzKSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRvRmlsZUNoYW5nZXNFdmVudChjaGFuZ2VzOiBJRmlsZUNoYW5nZVtdKTogRmlsZUNoYW5nZXNFdmVudCB7XG5cdFx0cmV0dXJuIG5ldyBGaWxlQ2hhbmdlc0V2ZW50KHJldml2ZUZpbGVDaGFuZ2VzKGNoYW5nZXMpLCAhaXNMaW51eCk7XG5cdH1cbn1cblxuZW51bSBQYXRoIHtcblx0VU5JWCxcblx0V0lORE9XUyxcblx0VU5DXG59XG5cbnN1aXRlKCdXYXRjaGVyJywgKCkgPT4ge1xuXG5cdChpc1dpbmRvd3MgPyB0ZXN0LnNraXAgOiB0ZXN0KSgncGFyc2VXYXRjaGVyUGF0dGVybnMgLSBwb3NpeCcsICgpID0+IHtcblx0XHRjb25zdCBwYXRoID0gJy91c2Vycy9kYXRhL3NyYyc7XG5cdFx0bGV0IHBhcnNlZFBhdHRlcm4gPSBwYXJzZVdhdGNoZXJQYXR0ZXJucyhwYXRoLCBbJyouanMnXSwgZmFsc2UpWzBdO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJy91c2Vycy9kYXRhL3NyYy9mb28uanMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJy91c2Vycy9kYXRhL3NyYy9mb28udHMnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvYmFyL2Zvby5qcycpLCBmYWxzZSk7XG5cblx0XHRwYXJzZWRQYXR0ZXJuID0gcGFyc2VXYXRjaGVyUGF0dGVybnMocGF0aCwgWycvdXNlcnMvZGF0YS9zcmMvKi5qcyddLCBmYWxzZSlbMF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Zvby5qcycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Zvby50cycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJy91c2Vycy9kYXRhL3NyYy9iYXIvZm9vLmpzJyksIGZhbHNlKTtcblxuXHRcdHBhcnNlZFBhdHRlcm4gPSBwYXJzZVdhdGNoZXJQYXR0ZXJucyhwYXRoLCBbJy91c2Vycy9kYXRhL3NyYy9iYXIvKi5qcyddLCBmYWxzZSlbMF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Zvby5qcycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJy91c2Vycy9kYXRhL3NyYy9mb28udHMnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvYmFyL2Zvby5qcycpLCB0cnVlKTtcblxuXHRcdHBhcnNlZFBhdHRlcm4gPSBwYXJzZVdhdGNoZXJQYXR0ZXJucyhwYXRoLCBbJyoqLyouanMnXSwgZmFsc2UpWzBdO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJy91c2Vycy9kYXRhL3NyYy9mb28uanMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJy91c2Vycy9kYXRhL3NyYy9mb28udHMnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvYmFyL2Zvby5qcycpLCB0cnVlKTtcblx0fSk7XG5cblx0KCFpc1dpbmRvd3MgPyB0ZXN0LnNraXAgOiB0ZXN0KSgncGFyc2VXYXRjaGVyUGF0dGVybnMgLSB3aW5kb3dzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhdGggPSAnYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmMnO1xuXHRcdGxldCBwYXJzZWRQYXR0ZXJuID0gcGFyc2VXYXRjaGVyUGF0dGVybnMocGF0aCwgWycqLmpzJ10sIHRydWUpWzBdO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGZvby5qcycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcZm9vLnRzJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcYmFyL2Zvby5qcycpLCBmYWxzZSk7XG5cblx0XHRwYXJzZWRQYXR0ZXJuID0gcGFyc2VXYXRjaGVyUGF0dGVybnMocGF0aCwgWydjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFwqLmpzJ10sIHRydWUpWzBdO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGZvby5qcycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcZm9vLnRzJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcYmFyXFxcXGZvby5qcycpLCBmYWxzZSk7XG5cblx0XHRwYXJzZWRQYXR0ZXJuID0gcGFyc2VXYXRjaGVyUGF0dGVybnMocGF0aCwgWydjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxiYXIvKi5qcyddLCB0cnVlKVswXTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxmb28uanMnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxmb28udHMnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxiYXJcXFxcZm9vLmpzJyksIHRydWUpO1xuXG5cdFx0cGFyc2VkUGF0dGVybiA9IHBhcnNlV2F0Y2hlclBhdHRlcm5zKHBhdGgsIFsnKiovKi5qcyddLCB0cnVlKVswXTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxmb28uanMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGZvby50cycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGJhclxcXFxmb28uanMnKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdChpc1dpbmRvd3MgPyB0ZXN0LnNraXAgOiB0ZXN0KSgncGFyc2VXYXRjaGVyUGF0dGVybnMgLSBwb3NpeCAoY2FzZSBpbnNlbnNpdGl2ZSknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGF0aCA9ICcvdXNlcnMvZGF0YS9zcmMnO1xuXHRcdGxldCBwYXJzZWRQYXR0ZXJuID0gcGFyc2VXYXRjaGVyUGF0dGVybnMocGF0aCwgWycqLkpTJ10sIGZhbHNlKVswXTtcblxuXHRcdC8vIENhc2Ugc2Vuc2l0aXZlIGJ5IGRlZmF1bHQgb24gcG9zaXhcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Zvby5qcycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJy91c2Vycy9kYXRhL3NyYy9mb28uSlMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJy91c2Vycy9kYXRhL3NyYy9mb28uSnMnKSwgZmFsc2UpO1xuXG5cdFx0Ly8gTm93IHRlc3Qgd2l0aCBHbG9iQ2FzZVNlbnNpdGl2aXR5LmNhc2VJbnNlbnNpdGl2ZVxuXHRcdHBhcnNlZFBhdHRlcm4gPSBwYXJzZVdhdGNoZXJQYXR0ZXJucyhwYXRoLCBbJyouSlMnXSwgdHJ1ZSlbMF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Zvby5qcycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Zvby5KUycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Zvby5KcycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Zvby50cycpLCBmYWxzZSk7XG5cblx0XHRwYXJzZWRQYXR0ZXJuID0gcGFyc2VXYXRjaGVyUGF0dGVybnMocGF0aCwgWycvdXNlcnMvZGF0YS9zcmMvKi5KUyddLCB0cnVlKVswXTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvZm9vLmpzJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvZm9vLkpTJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvZm9vLnRzJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Jhci9mb28uanMnKSwgZmFsc2UpO1xuXG5cdFx0cGFyc2VkUGF0dGVybiA9IHBhcnNlV2F0Y2hlclBhdHRlcm5zKHBhdGgsIFsnKiovVGVzdCouSlMnXSwgdHJ1ZSlbMF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL3Rlc3QxLmpzJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCcvdXNlcnMvZGF0YS9zcmMvVGVzdDEuanMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJy91c2Vycy9kYXRhL3NyYy9URVNUMS5KUycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Jhci90ZXN0Mi5qcycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Jhci9URVNUMi5KUycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignL3VzZXJzL2RhdGEvc3JjL2Zvby5qcycpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdCghaXNXaW5kb3dzID8gdGVzdC5za2lwIDogdGVzdCkoJ3BhcnNlV2F0Y2hlclBhdHRlcm5zIC0gd2luZG93cyAoY2FzZSBpbnNlbnNpdGl2ZSknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGF0aCA9ICdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyYyc7XG5cdFx0bGV0IHBhcnNlZFBhdHRlcm4gPSBwYXJzZVdhdGNoZXJQYXR0ZXJucyhwYXRoLCBbJyouSlMnXSwgdHJ1ZSlbMF07XG5cblx0XHQvLyBXaW5kb3dzIGlzIGNhc2UgaW5zZW5zaXRpdmUgYnkgZGVmYXVsdFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxmb28uanMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGZvby5KUycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcZm9vLkpzJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxmb28udHMnKSwgZmFsc2UpO1xuXG5cdFx0Ly8gRXhwbGljaXQgR2xvYkNhc2VTZW5zaXRpdml0eS5jYXNlSW5zZW5zaXRpdmUgc2hvdWxkIHdvcmsgdGhlIHNhbWVcblx0XHRwYXJzZWRQYXR0ZXJuID0gcGFyc2VXYXRjaGVyUGF0dGVybnMocGF0aCwgWycqLkpTJ10sIHRydWUpWzBdO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGZvby5qcycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcZm9vLkpTJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxmb28uSnMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGZvby50cycpLCBmYWxzZSk7XG5cblx0XHRwYXJzZWRQYXR0ZXJuID0gcGFyc2VXYXRjaGVyUGF0dGVybnMocGF0aCwgWydjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFwqLkpTJ10sIHRydWUpWzBdO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGZvby5qcycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcZm9vLkpTJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxmb28udHMnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxiYXJcXFxcZm9vLmpzJyksIGZhbHNlKTtcblxuXHRcdHBhcnNlZFBhdHRlcm4gPSBwYXJzZVdhdGNoZXJQYXR0ZXJucyhwYXRoLCBbJyoqL1Rlc3QqLkpTJ10sIHRydWUpWzBdO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXHRlc3QxLmpzJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxUZXN0MS5qcycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcVEVTVDEuSlMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGJhclxcXFx0ZXN0Mi5qcycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcYmFyXFxcXFRFU1QyLkpTJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQYXR0ZXJuKCdjOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxmb28uanMnKSwgZmFsc2UpO1xuXG5cdFx0Ly8gVGVzdCB3aXRoIGNhc2Ugc2Vuc2l0aXZlIG1vZGUgZXhwbGljaXRseVxuXHRcdHBhcnNlZFBhdHRlcm4gPSBwYXJzZVdhdGNoZXJQYXR0ZXJucyhwYXRoLCBbJyouSlMnXSwgZmFsc2UpWzBdO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGZvby5qcycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBhdHRlcm4oJ2M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGZvby5KUycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGF0dGVybignYzpcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcZm9vLkpzJyksIGZhbHNlKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcblxuc3VpdGUoJ1dhdGNoZXIgRXZlbnRzIE5vcm1hbGl6ZXInLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbXBsZSBhZGQvdXBkYXRlL2RlbGV0ZScsIGRvbmUgPT4ge1xuXHRcdGNvbnN0IHdhdGNoID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0RmlsZVdhdGNoZXIoKSk7XG5cblx0XHRjb25zdCBhZGRlZCA9IFVSSS5maWxlKCcvdXNlcnMvZGF0YS9zcmMvYWRkZWQudHh0Jyk7XG5cdFx0Y29uc3QgdXBkYXRlZCA9IFVSSS5maWxlKCcvdXNlcnMvZGF0YS9zcmMvdXBkYXRlZC50eHQnKTtcblx0XHRjb25zdCBkZWxldGVkID0gVVJJLmZpbGUoJy91c2Vycy9kYXRhL3NyYy9kZWxldGVkLnR4dCcpO1xuXG5cdFx0Y29uc3QgcmF3OiBJRmlsZUNoYW5nZVtdID0gW1xuXHRcdFx0eyByZXNvdXJjZTogYWRkZWQsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVEIH0sXG5cdFx0XHR7IHJlc291cmNlOiB1cGRhdGVkLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEIH0sXG5cdFx0XHR7IHJlc291cmNlOiBkZWxldGVkLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH0sXG5cdFx0XTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh3YXRjaC5vbkRpZEZpbGVzQ2hhbmdlKCh7IGV2ZW50LCByYXcgfSkgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKGV2ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYXcubGVuZ3RoLCAzKTtcblx0XHRcdGFzc2VydC5vayhldmVudC5jb250YWlucyhhZGRlZCwgRmlsZUNoYW5nZVR5cGUuQURERUQpKTtcblx0XHRcdGFzc2VydC5vayhldmVudC5jb250YWlucyh1cGRhdGVkLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKSk7XG5cdFx0XHRhc3NlcnQub2soZXZlbnQuY29udGFpbnMoZGVsZXRlZCwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCkpO1xuXG5cdFx0XHRkb25lKCk7XG5cdFx0fSkpO1xuXG5cdFx0d2F0Y2gucmVwb3J0KHJhdyk7XG5cdH0pO1xuXG5cdChpc1dpbmRvd3MgPyBbUGF0aC5XSU5ET1dTLCBQYXRoLlVOQ10gOiBbUGF0aC5VTklYXSkuZm9yRWFjaChwYXRoID0+IHtcblx0XHR0ZXN0KGBkZWxldGUgb25seSByZXBvcnRlZCBmb3IgdG9wIGxldmVsIGZvbGRlciAoJHtwYXRofSlgLCBkb25lID0+IHtcblx0XHRcdGNvbnN0IHdhdGNoID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0RmlsZVdhdGNoZXIoKSk7XG5cblx0XHRcdGNvbnN0IGRlbGV0ZWRGb2xkZXJBID0gVVJJLmZpbGUocGF0aCA9PT0gUGF0aC5VTklYID8gJy91c2Vycy9kYXRhL3NyYy90b2RlbGV0ZTEnIDogcGF0aCA9PT0gUGF0aC5XSU5ET1dTID8gJ0M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXHRvZGVsZXRlMScgOiAnXFxcXFxcXFxsb2NhbGhvc3RcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcdG9kZWxldGUxJyk7XG5cdFx0XHRjb25zdCBkZWxldGVkRm9sZGVyQiA9IFVSSS5maWxlKHBhdGggPT09IFBhdGguVU5JWCA/ICcvdXNlcnMvZGF0YS9zcmMvdG9kZWxldGUyJyA6IHBhdGggPT09IFBhdGguV0lORE9XUyA/ICdDOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFx0b2RlbGV0ZTInIDogJ1xcXFxcXFxcbG9jYWxob3N0XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXHRvZGVsZXRlMicpO1xuXHRcdFx0Y29uc3QgZGVsZXRlZEZvbGRlckJGMSA9IFVSSS5maWxlKHBhdGggPT09IFBhdGguVU5JWCA/ICcvdXNlcnMvZGF0YS9zcmMvdG9kZWxldGUyL2ZpbGUudHh0JyA6IHBhdGggPT09IFBhdGguV0lORE9XUyA/ICdDOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFx0b2RlbGV0ZTJcXFxcZmlsZS50eHQnIDogJ1xcXFxcXFxcbG9jYWxob3N0XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXHRvZGVsZXRlMlxcXFxmaWxlLnR4dCcpO1xuXHRcdFx0Y29uc3QgZGVsZXRlZEZvbGRlckJGMiA9IFVSSS5maWxlKHBhdGggPT09IFBhdGguVU5JWCA/ICcvdXNlcnMvZGF0YS9zcmMvdG9kZWxldGUyL21vcmUvdGVzdC50eHQnIDogcGF0aCA9PT0gUGF0aC5XSU5ET1dTID8gJ0M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXHRvZGVsZXRlMlxcXFxtb3JlXFxcXHRlc3QudHh0JyA6ICdcXFxcXFxcXGxvY2FsaG9zdFxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFx0b2RlbGV0ZTJcXFxcbW9yZVxcXFx0ZXN0LnR4dCcpO1xuXHRcdFx0Y29uc3QgZGVsZXRlZEZvbGRlckJGMyA9IFVSSS5maWxlKHBhdGggPT09IFBhdGguVU5JWCA/ICcvdXNlcnMvZGF0YS9zcmMvdG9kZWxldGUyL3N1cGVyL2Jhci9mb28udHh0JyA6IHBhdGggPT09IFBhdGguV0lORE9XUyA/ICdDOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFx0b2RlbGV0ZTJcXFxcc3VwZXJcXFxcYmFyXFxcXGZvby50eHQnIDogJ1xcXFxcXFxcbG9jYWxob3N0XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXHRvZGVsZXRlMlxcXFxzdXBlclxcXFxiYXJcXFxcZm9vLnR4dCcpO1xuXHRcdFx0Y29uc3QgZGVsZXRlZEZpbGVBID0gVVJJLmZpbGUocGF0aCA9PT0gUGF0aC5VTklYID8gJy91c2Vycy9kYXRhL3NyYy9kZWxldGVtZS50eHQnIDogcGF0aCA9PT0gUGF0aC5XSU5ET1dTID8gJ0M6XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGRlbGV0ZW1lLnR4dCcgOiAnXFxcXFxcXFxsb2NhbGhvc3RcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcZGVsZXRlbWUudHh0Jyk7XG5cblx0XHRcdGNvbnN0IGFkZGVkRmlsZSA9IFVSSS5maWxlKHBhdGggPT09IFBhdGguVU5JWCA/ICcvdXNlcnMvZGF0YS9zcmMvYWRkZWQudHh0JyA6IHBhdGggPT09IFBhdGguV0lORE9XUyA/ICdDOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFxhZGRlZC50eHQnIDogJ1xcXFxcXFxcbG9jYWxob3N0XFxcXHVzZXJzXFxcXGRhdGFcXFxcc3JjXFxcXGFkZGVkLnR4dCcpO1xuXHRcdFx0Y29uc3QgdXBkYXRlZEZpbGUgPSBVUkkuZmlsZShwYXRoID09PSBQYXRoLlVOSVggPyAnL3VzZXJzL2RhdGEvc3JjL3VwZGF0ZWQudHh0JyA6IHBhdGggPT09IFBhdGguV0lORE9XUyA/ICdDOlxcXFx1c2Vyc1xcXFxkYXRhXFxcXHNyY1xcXFx1cGRhdGVkLnR4dCcgOiAnXFxcXFxcXFxsb2NhbGhvc3RcXFxcdXNlcnNcXFxcZGF0YVxcXFxzcmNcXFxcdXBkYXRlZC50eHQnKTtcblxuXHRcdFx0Y29uc3QgcmF3OiBJRmlsZUNoYW5nZVtdID0gW1xuXHRcdFx0XHR7IHJlc291cmNlOiBkZWxldGVkRm9sZGVyQSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRCB9LFxuXHRcdFx0XHR7IHJlc291cmNlOiBkZWxldGVkRm9sZGVyQiwgdHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRCB9LFxuXHRcdFx0XHR7IHJlc291cmNlOiBkZWxldGVkRm9sZGVyQkYxLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IGRlbGV0ZWRGb2xkZXJCRjIsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogZGVsZXRlZEZvbGRlckJGMywgdHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRCB9LFxuXHRcdFx0XHR7IHJlc291cmNlOiBkZWxldGVkRmlsZUEsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogYWRkZWRGaWxlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5BRERFRCB9LFxuXHRcdFx0XHR7IHJlc291cmNlOiB1cGRhdGVkRmlsZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCB9XG5cdFx0XHRdO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQod2F0Y2gub25EaWRGaWxlc0NoYW5nZSgoeyBldmVudCwgcmF3IH0pID0+IHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGV2ZW50KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhdy5sZW5ndGgsIDUpO1xuXG5cdFx0XHRcdGFzc2VydC5vayhldmVudC5jb250YWlucyhkZWxldGVkRm9sZGVyQSwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCkpO1xuXHRcdFx0XHRhc3NlcnQub2soZXZlbnQuY29udGFpbnMoZGVsZXRlZEZvbGRlckIsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGV2ZW50LmNvbnRhaW5zKGRlbGV0ZWRGaWxlQSwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCkpO1xuXHRcdFx0XHRhc3NlcnQub2soZXZlbnQuY29udGFpbnMoYWRkZWRGaWxlLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCkpO1xuXHRcdFx0XHRhc3NlcnQub2soZXZlbnQuY29udGFpbnModXBkYXRlZEZpbGUsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpKTtcblxuXHRcdFx0XHRkb25lKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHdhdGNoLnJlcG9ydChyYXcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdldmVudCBjb2FsZXNjZXI6IGlnbm9yZSBDUkVBVEUgZm9sbG93ZWQgYnkgREVMRVRFJywgZG9uZSA9PiB7XG5cdFx0Y29uc3Qgd2F0Y2ggPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RGaWxlV2F0Y2hlcigpKTtcblxuXHRcdGNvbnN0IGNyZWF0ZWQgPSBVUkkuZmlsZSgnL3VzZXJzL2RhdGEvc3JjL3JlbGF0ZWQnKTtcblx0XHRjb25zdCBkZWxldGVkID0gVVJJLmZpbGUoJy91c2Vycy9kYXRhL3NyYy9yZWxhdGVkJyk7XG5cdFx0Y29uc3QgdW5yZWxhdGVkID0gVVJJLmZpbGUoJy91c2Vycy9kYXRhL3NyYy91bnJlbGF0ZWQnKTtcblxuXHRcdGNvbnN0IHJhdzogSUZpbGVDaGFuZ2VbXSA9IFtcblx0XHRcdHsgcmVzb3VyY2U6IGNyZWF0ZWQsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVEIH0sXG5cdFx0XHR7IHJlc291cmNlOiBkZWxldGVkLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH0sXG5cdFx0XHR7IHJlc291cmNlOiB1bnJlbGF0ZWQsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQgfSxcblx0XHRdO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdhdGNoLm9uRGlkRmlsZXNDaGFuZ2UoKHsgZXZlbnQsIHJhdyB9KSA9PiB7XG5cdFx0XHRhc3NlcnQub2soZXZlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhdy5sZW5ndGgsIDEpO1xuXG5cdFx0XHRhc3NlcnQub2soZXZlbnQuY29udGFpbnModW5yZWxhdGVkLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKSk7XG5cblx0XHRcdGRvbmUoKTtcblx0XHR9KSk7XG5cblx0XHR3YXRjaC5yZXBvcnQocmF3KTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgY29hbGVzY2VyOiBmbGF0dGVuIERFTEVURSBmb2xsb3dlZCBieSBDUkVBVEUgaW50byBDSEFOR0UnLCBkb25lID0+IHtcblx0XHRjb25zdCB3YXRjaCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEZpbGVXYXRjaGVyKCkpO1xuXG5cdFx0Y29uc3QgZGVsZXRlZCA9IFVSSS5maWxlKCcvdXNlcnMvZGF0YS9zcmMvcmVsYXRlZCcpO1xuXHRcdGNvbnN0IGNyZWF0ZWQgPSBVUkkuZmlsZSgnL3VzZXJzL2RhdGEvc3JjL3JlbGF0ZWQnKTtcblx0XHRjb25zdCB1bnJlbGF0ZWQgPSBVUkkuZmlsZSgnL3VzZXJzL2RhdGEvc3JjL3VucmVsYXRlZCcpO1xuXG5cdFx0Y29uc3QgcmF3OiBJRmlsZUNoYW5nZVtdID0gW1xuXHRcdFx0eyByZXNvdXJjZTogZGVsZXRlZCwgdHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRCB9LFxuXHRcdFx0eyByZXNvdXJjZTogY3JlYXRlZCwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQgfSxcblx0XHRcdHsgcmVzb3VyY2U6IHVucmVsYXRlZCwgdHlwZTogRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCB9LFxuXHRcdF07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQod2F0Y2gub25EaWRGaWxlc0NoYW5nZSgoeyBldmVudCwgcmF3IH0pID0+IHtcblx0XHRcdGFzc2VydC5vayhldmVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmF3Lmxlbmd0aCwgMik7XG5cblx0XHRcdGFzc2VydC5vayhldmVudC5jb250YWlucyhkZWxldGVkLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKSk7XG5cdFx0XHRhc3NlcnQub2soZXZlbnQuY29udGFpbnModW5yZWxhdGVkLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKSk7XG5cblx0XHRcdGRvbmUoKTtcblx0XHR9KSk7XG5cblx0XHR3YXRjaC5yZXBvcnQocmF3KTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgY29hbGVzY2VyOiBpZ25vcmUgVVBEQVRFIHdoZW4gQ1JFQVRFIHJlY2VpdmVkJywgZG9uZSA9PiB7XG5cdFx0Y29uc3Qgd2F0Y2ggPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RGaWxlV2F0Y2hlcigpKTtcblxuXHRcdGNvbnN0IGNyZWF0ZWQgPSBVUkkuZmlsZSgnL3VzZXJzL2RhdGEvc3JjL3JlbGF0ZWQnKTtcblx0XHRjb25zdCB1cGRhdGVkID0gVVJJLmZpbGUoJy91c2Vycy9kYXRhL3NyYy9yZWxhdGVkJyk7XG5cdFx0Y29uc3QgdW5yZWxhdGVkID0gVVJJLmZpbGUoJy91c2Vycy9kYXRhL3NyYy91bnJlbGF0ZWQnKTtcblxuXHRcdGNvbnN0IHJhdzogSUZpbGVDaGFuZ2VbXSA9IFtcblx0XHRcdHsgcmVzb3VyY2U6IGNyZWF0ZWQsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVEIH0sXG5cdFx0XHR7IHJlc291cmNlOiB1cGRhdGVkLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEIH0sXG5cdFx0XHR7IHJlc291cmNlOiB1bnJlbGF0ZWQsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQgfSxcblx0XHRdO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdhdGNoLm9uRGlkRmlsZXNDaGFuZ2UoKHsgZXZlbnQsIHJhdyB9KSA9PiB7XG5cdFx0XHRhc3NlcnQub2soZXZlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhdy5sZW5ndGgsIDIpO1xuXG5cdFx0XHRhc3NlcnQub2soZXZlbnQuY29udGFpbnMoY3JlYXRlZCwgRmlsZUNoYW5nZVR5cGUuQURERUQpKTtcblx0XHRcdGFzc2VydC5vayghZXZlbnQuY29udGFpbnMoY3JlYXRlZCwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGV2ZW50LmNvbnRhaW5zKHVucmVsYXRlZCwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCkpO1xuXG5cdFx0XHRkb25lKCk7XG5cdFx0fSkpO1xuXG5cdFx0d2F0Y2gucmVwb3J0KHJhdyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50IGNvYWxlc2NlcjogYXBwbHkgREVMRVRFJywgZG9uZSA9PiB7XG5cdFx0Y29uc3Qgd2F0Y2ggPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RGaWxlV2F0Y2hlcigpKTtcblxuXHRcdGNvbnN0IHVwZGF0ZWQgPSBVUkkuZmlsZSgnL3VzZXJzL2RhdGEvc3JjL3JlbGF0ZWQnKTtcblx0XHRjb25zdCB1cGRhdGVkMiA9IFVSSS5maWxlKCcvdXNlcnMvZGF0YS9zcmMvcmVsYXRlZCcpO1xuXHRcdGNvbnN0IGRlbGV0ZWQgPSBVUkkuZmlsZSgnL3VzZXJzL2RhdGEvc3JjL3JlbGF0ZWQnKTtcblx0XHRjb25zdCB1bnJlbGF0ZWQgPSBVUkkuZmlsZSgnL3VzZXJzL2RhdGEvc3JjL3VucmVsYXRlZCcpO1xuXG5cdFx0Y29uc3QgcmF3OiBJRmlsZUNoYW5nZVtdID0gW1xuXHRcdFx0eyByZXNvdXJjZTogdXBkYXRlZCwgdHlwZTogRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCB9LFxuXHRcdFx0eyByZXNvdXJjZTogdXBkYXRlZDIsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQgfSxcblx0XHRcdHsgcmVzb3VyY2U6IHVucmVsYXRlZCwgdHlwZTogRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCB9LFxuXHRcdFx0eyByZXNvdXJjZTogdXBkYXRlZCwgdHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRCB9XG5cdFx0XTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh3YXRjaC5vbkRpZEZpbGVzQ2hhbmdlKCh7IGV2ZW50LCByYXcgfSkgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKGV2ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYXcubGVuZ3RoLCAyKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGV2ZW50LmNvbnRhaW5zKGRlbGV0ZWQsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpKTtcblx0XHRcdGFzc2VydC5vayghZXZlbnQuY29udGFpbnModXBkYXRlZCwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGV2ZW50LmNvbnRhaW5zKHVucmVsYXRlZCwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCkpO1xuXG5cdFx0XHRkb25lKCk7XG5cdFx0fSkpO1xuXG5cdFx0d2F0Y2gucmVwb3J0KHJhdyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50IGNvYWxlc2NlcjogdHJhY2sgY2FzZSByZW5hbWVzJywgZG9uZSA9PiB7XG5cdFx0Y29uc3Qgd2F0Y2ggPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RGaWxlV2F0Y2hlcigpKTtcblxuXHRcdGNvbnN0IG9sZFBhdGggPSBVUkkuZmlsZSgnL3VzZXJzL2RhdGEvc3JjL2FkZGVkJyk7XG5cdFx0Y29uc3QgbmV3UGF0aCA9IFVSSS5maWxlKCcvdXNlcnMvZGF0YS9zcmMvQURERUQnKTtcblxuXHRcdGNvbnN0IHJhdzogSUZpbGVDaGFuZ2VbXSA9IFtcblx0XHRcdHsgcmVzb3VyY2U6IG5ld1BhdGgsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVEIH0sXG5cdFx0XHR7IHJlc291cmNlOiBvbGRQYXRoLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH1cblx0XHRdO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdhdGNoLm9uRGlkRmlsZXNDaGFuZ2UoKHsgZXZlbnQsIHJhdyB9KSA9PiB7XG5cdFx0XHRhc3NlcnQub2soZXZlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhdy5sZW5ndGgsIDIpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHIgb2YgcmF3KSB7XG5cdFx0XHRcdGlmIChpc0VxdWFsKHIucmVzb3VyY2UsIG9sZFBhdGgpKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIudHlwZSwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXNFcXVhbChyLnJlc291cmNlLCBuZXdQYXRoKSkge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyLnR5cGUsIEZpbGVDaGFuZ2VUeXBlLkFEREVEKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhc3NlcnQuZmFpbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGRvbmUoKTtcblx0XHR9KSk7XG5cblx0XHR3YXRjaC5yZXBvcnQocmF3KTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgdHlwZSBmaWx0ZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3VzZXJzL2RhdGEvc3JjL3JlbGF0ZWQnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0ZpbHRlcmVkKHsgcmVzb3VyY2UsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVEIH0sIHVuZGVmaW5lZCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNGaWx0ZXJlZCh7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEIH0sIHVuZGVmaW5lZCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNGaWx0ZXJlZCh7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH0sIHVuZGVmaW5lZCksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0ZpbHRlcmVkKHsgcmVzb3VyY2UsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVEIH0sIEZpbGVDaGFuZ2VGaWx0ZXIuVVBEQVRFRCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0ZpbHRlcmVkKHsgcmVzb3VyY2UsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVEIH0sIEZpbGVDaGFuZ2VGaWx0ZXIuVVBEQVRFRCB8IEZpbGVDaGFuZ2VGaWx0ZXIuREVMRVRFRCksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRmlsdGVyZWQoeyByZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQgfSwgRmlsZUNoYW5nZUZpbHRlci5BRERFRCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNGaWx0ZXJlZCh7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5BRERFRCB9LCBGaWxlQ2hhbmdlRmlsdGVyLkFEREVEIHwgRmlsZUNoYW5nZUZpbHRlci5VUERBVEVEKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0ZpbHRlcmVkKHsgcmVzb3VyY2UsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVEIH0sIEZpbGVDaGFuZ2VGaWx0ZXIuQURERUQgfCBGaWxlQ2hhbmdlRmlsdGVyLlVQREFURUQgfCBGaWxlQ2hhbmdlRmlsdGVyLkRFTEVURUQpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNGaWx0ZXJlZCh7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH0sIEZpbGVDaGFuZ2VGaWx0ZXIuVVBEQVRFRCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0ZpbHRlcmVkKHsgcmVzb3VyY2UsIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQgfSwgRmlsZUNoYW5nZUZpbHRlci5VUERBVEVEIHwgRmlsZUNoYW5nZUZpbHRlci5BRERFRCksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRmlsdGVyZWQoeyByZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRCB9LCBGaWxlQ2hhbmdlRmlsdGVyLkRFTEVURUQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRmlsdGVyZWQoeyByZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRCB9LCBGaWxlQ2hhbmdlRmlsdGVyLkRFTEVURUQgfCBGaWxlQ2hhbmdlRmlsdGVyLlVQREFURUQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRmlsdGVyZWQoeyByZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuREVMRVRFRCB9LCBGaWxlQ2hhbmdlRmlsdGVyLkFEREVEIHwgRmlsZUNoYW5nZUZpbHRlci5ERUxFVEVEIHwgRmlsZUNoYW5nZUZpbHRlci5VUERBVEVEKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRmlsdGVyZWQoeyByZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCB9LCBGaWxlQ2hhbmdlRmlsdGVyLkFEREVEKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRmlsdGVyZWQoeyByZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCB9LCBGaWxlQ2hhbmdlRmlsdGVyLkRFTEVURUQgfCBGaWxlQ2hhbmdlRmlsdGVyLkFEREVEKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNGaWx0ZXJlZCh7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEIH0sIEZpbGVDaGFuZ2VGaWx0ZXIuVVBEQVRFRCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNGaWx0ZXJlZCh7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEIH0sIEZpbGVDaGFuZ2VGaWx0ZXIuREVMRVRFRCB8IEZpbGVDaGFuZ2VGaWx0ZXIuVVBEQVRFRCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNGaWx0ZXJlZCh7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEIH0sIEZpbGVDaGFuZ2VGaWx0ZXIuQURERUQgfCBGaWxlQ2hhbmdlRmlsdGVyLkRFTEVURUQgfCBGaWxlQ2hhbmdlRmlsdGVyLlVQREFURUQpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsU0FBUyxpQkFBaUI7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGtCQUFrQixrQkFBa0Isc0JBQW1DO0FBQ2hGLFNBQVMsZ0JBQWdCLG1CQUFtQixzQkFBc0Isa0JBQWtCO0FBRXBGLE1BQU0sd0JBQXdCLFdBQVc7QUFBQSxFQUd4QyxjQUFjO0FBQ2IsVUFBTTtBQUVOLFNBQUssb0JBQW9CLEtBQUssVUFBVSxJQUFJLFFBQXlELENBQUM7QUFBQSxFQUN2RztBQUFBLEVBRUEsSUFBSSxtQkFBMkU7QUFDOUUsV0FBTyxLQUFLLGtCQUFrQjtBQUFBLEVBQy9CO0FBQUEsRUFFQSxPQUFPLFNBQThCO0FBQ3BDLFNBQUssZ0JBQWdCLE9BQU87QUFBQSxFQUM3QjtBQUFBLEVBRVEsZ0JBQWdCLFFBQTZCO0FBR3BELFVBQU0sa0JBQWtCLGVBQWUsTUFBTTtBQUc3QyxRQUFJLGdCQUFnQixTQUFTLEdBQUc7QUFDL0IsV0FBSyxrQkFBa0IsS0FBSyxFQUFFLEtBQUssa0JBQWtCLGVBQWUs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
