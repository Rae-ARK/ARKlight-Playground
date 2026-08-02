import assert from "assert";
import { timeout } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileChangesEvent, FileChangeType } from "../../../files/common/files.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentHostFileMonitorService } from "../../node/agentHostFileMonitorService.js";
suite("AgentHostFileMonitorService", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  function acquire(monitor, folder, callback, options) {
    const registration = monitor.acquire(folder, callback, options);
    assert.ok(registration, "expected file monitor acquisition to succeed");
    return registration;
  }
  test("shares one recursive watcher per folder/options and refcounts callbacks", () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const fileService = new TestFileService();
      const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
      const folder = URI.file("/repo");
      let first = 0;
      let second = 0;
      const firstRegistration = acquire(monitor, folder, () => first++, { debounceMs: 10 });
      const secondRegistration = acquire(monitor, folder, () => second++, { debounceMs: 10 });
      assert.deepStrictEqual(fileService.snapshot(), { watches: 1, disposed: 0 });
      fileService.fire(URI.file("/repo/src/a.ts"));
      await timeout(11);
      assert.deepStrictEqual({ first, second }, { first: 1, second: 1 });
      firstRegistration.dispose();
      fileService.fire(URI.file("/repo/src/b.ts"));
      await timeout(11);
      assert.deepStrictEqual({ first, second, snapshot: fileService.snapshot() }, { first: 1, second: 2, snapshot: { watches: 1, disposed: 0 } });
      secondRegistration.dispose();
      assert.deepStrictEqual(fileService.snapshot(), { watches: 1, disposed: 1 });
    });
  });
  test("filters known repository metadata noise before debouncing", () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const fileService = new TestFileService();
      const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
      let calls = 0;
      disposables.add(acquire(monitor, URI.file("/repo"), () => calls++, { debounceMs: 10 }));
      fileService.fire(URI.file("/repo/.git/objects/12/abcdef"));
      fileService.fire(URI.file("/repo/.git/index.lock"));
      fileService.fire(URI.file("/repo/.watchman-cookie-123"));
      await timeout(11);
      assert.strictEqual(calls, 0);
      fileService.fire(URI.file("/repo/src/a.ts"));
      await timeout(11);
      assert.strictEqual(calls, 1);
    });
  });
  test("filters custom excludes before debouncing", () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const fileService = new TestFileService();
      const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
      let calls = 0;
      disposables.add(acquire(monitor, URI.file("/repo"), () => calls++, { excludes: ["**/generated/**"], debounceMs: 10 }));
      fileService.fire(URI.file("/repo/generated/a.ts"));
      await timeout(11);
      assert.strictEqual(calls, 0);
      fileService.fire(URI.file("/repo/src/a.ts"));
      await timeout(11);
      assert.strictEqual(calls, 1);
    });
  });
  test("sorts excludes when sharing watchers", () => {
    const fileService = new TestFileService();
    const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
    const folder = URI.file("/repo");
    disposables.add(acquire(monitor, folder, () => {
    }, { excludes: ["**/b/**", "**/a/**"], debounceMs: 10 }));
    disposables.add(acquire(monitor, folder, () => {
    }, { excludes: ["**/a/**", "**/b/**"], debounceMs: 10 }));
    assert.deepStrictEqual(fileService.snapshot(), { watches: 1, disposed: 0 });
  });
  test("canonicalizes equivalent folder keys when sharing watchers", () => {
    const fileService = new TestFileService();
    const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
    disposables.add(acquire(monitor, URI.file("/repo"), () => {
    }, { debounceMs: 10 }));
    disposables.add(acquire(monitor, URI.file("/repo/../repo/"), () => {
    }, { debounceMs: 10 }));
    assert.deepStrictEqual(fileService.snapshot(), { watches: 1, disposed: 0 });
  });
  test("returns undefined when watcher acquisition fails", () => {
    const fileService = new TestFileService();
    fileService.failWatch = true;
    const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
    const registration = monitor.acquire(URI.file("/repo"), () => {
    }, { debounceMs: 10 });
    assert.deepStrictEqual({ registration, snapshot: fileService.snapshot() }, { registration: void 0, snapshot: { watches: 1, disposed: 0 } });
  });
  test("uses one file-change listener across monitor entries", () => {
    const fileService = new TestFileService();
    const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
    disposables.add(acquire(monitor, URI.file("/repo-a"), () => {
    }, { debounceMs: 10 }));
    disposables.add(acquire(monitor, URI.file("/repo-b"), () => {
    }, { debounceMs: 10 }));
    assert.deepStrictEqual({ snapshot: fileService.snapshot(), listeners: fileService.fileChangeListenerCount }, {
      snapshot: { watches: 2, disposed: 0 },
      listeners: 1
    });
  });
  test("disposing service cleans up active watchers and pending debounce callbacks", () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const fileService = new TestFileService();
      const monitor = disposables.add(new AgentHostFileMonitorService(fileService.service, new NullLogService()));
      let calls = 0;
      const registration = acquire(monitor, URI.file("/repo"), () => calls++, { debounceMs: 10 });
      fileService.fire(URI.file("/repo/src/a.ts"));
      monitor.dispose();
      registration.dispose();
      await timeout(11);
      fileService.fire(URI.file("/repo/src/b.ts"));
      await timeout(11);
      assert.deepStrictEqual({ calls, snapshot: fileService.snapshot() }, { calls: 0, snapshot: { watches: 1, disposed: 1 } });
    });
  });
});
class TestFileService {
  constructor() {
    this._onDidFilesChange = new Emitter();
    this._onDidWatchError = new Emitter();
    this._watchCount = 0;
    this._disposeCount = 0;
    this._fileChangeListenerCount = 0;
    this.failWatch = false;
    this._onDidFilesChangeEvent = (listener, thisArgs, disposables) => {
      this._fileChangeListenerCount++;
      return this._onDidFilesChange.event(listener, thisArgs, disposables);
    };
    this.service = {
      _serviceBrand: void 0,
      onDidChangeFileSystemProviderRegistrations: Event.None,
      onDidChangeFileSystemProviderCapabilities: Event.None,
      onWillActivateFileSystemProvider: Event.None,
      onDidFilesChange: this._onDidFilesChangeEvent,
      onDidWatchError: this._onDidWatchError.event,
      watch: (_resource, _options) => {
        this._watchCount++;
        if (this.failWatch) {
          throw new Error("watch failed");
        }
        return toDisposable(() => this._disposeCount++);
      },
      dispose: () => {
      }
    };
  }
  fire(resource, type = FileChangeType.UPDATED) {
    this._onDidFilesChange.fire(new FileChangesEvent([{ resource, type }], false));
  }
  snapshot() {
    return { watches: this._watchCount, disposed: this._disposeCount };
  }
  get fileChangeListenerCount() {
    return this._fileChangeListenerCount;
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0RmlsZU1vbml0b3JTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEZpbGVDaGFuZ2VzRXZlbnQsIEZpbGVDaGFuZ2VUeXBlLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZS5qcyc7XG5cbnN1aXRlKCdBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGFjcXVpcmUobW9uaXRvcjogQWdlbnRIb3N0RmlsZU1vbml0b3JTZXJ2aWNlLCBmb2xkZXI6IFVSSSwgY2FsbGJhY2s6ICgpID0+IHZvaWQsIG9wdGlvbnM/OiB7IHJlYWRvbmx5IGV4Y2x1ZGVzPzogcmVhZG9ubHkgc3RyaW5nW107IHJlYWRvbmx5IGRlYm91bmNlTXM/OiBudW1iZXIgfSk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSBtb25pdG9yLmFjcXVpcmUoZm9sZGVyLCBjYWxsYmFjaywgb3B0aW9ucyk7XG5cdFx0YXNzZXJ0Lm9rKHJlZ2lzdHJhdGlvbiwgJ2V4cGVjdGVkIGZpbGUgbW9uaXRvciBhY3F1aXNpdGlvbiB0byBzdWNjZWVkJyk7XG5cdFx0cmV0dXJuIHJlZ2lzdHJhdGlvbjtcblx0fVxuXG5cdHRlc3QoJ3NoYXJlcyBvbmUgcmVjdXJzaXZlIHdhdGNoZXIgcGVyIGZvbGRlci9vcHRpb25zIGFuZCByZWZjb3VudHMgY2FsbGJhY2tzJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBUZXN0RmlsZVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IG1vbml0b3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZShmaWxlU2VydmljZS5zZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3QgZm9sZGVyID0gVVJJLmZpbGUoJy9yZXBvJyk7XG5cdFx0XHRsZXQgZmlyc3QgPSAwO1xuXHRcdFx0bGV0IHNlY29uZCA9IDA7XG5cblx0XHRcdGNvbnN0IGZpcnN0UmVnaXN0cmF0aW9uID0gYWNxdWlyZShtb25pdG9yLCBmb2xkZXIsICgpID0+IGZpcnN0KyssIHsgZGVib3VuY2VNczogMTAgfSk7XG5cdFx0XHRjb25zdCBzZWNvbmRSZWdpc3RyYXRpb24gPSBhY3F1aXJlKG1vbml0b3IsIGZvbGRlciwgKCkgPT4gc2Vjb25kKyssIHsgZGVib3VuY2VNczogMTAgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbGVTZXJ2aWNlLnNuYXBzaG90KCksIHsgd2F0Y2hlczogMSwgZGlzcG9zZWQ6IDAgfSk7XG5cblx0XHRcdGZpbGVTZXJ2aWNlLmZpcmUoVVJJLmZpbGUoJy9yZXBvL3NyYy9hLnRzJykpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgxMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgZmlyc3QsIHNlY29uZCB9LCB7IGZpcnN0OiAxLCBzZWNvbmQ6IDEgfSk7XG5cblx0XHRcdGZpcnN0UmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdGZpbGVTZXJ2aWNlLmZpcmUoVVJJLmZpbGUoJy9yZXBvL3NyYy9iLnRzJykpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgxMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgZmlyc3QsIHNlY29uZCwgc25hcHNob3Q6IGZpbGVTZXJ2aWNlLnNuYXBzaG90KCkgfSwgeyBmaXJzdDogMSwgc2Vjb25kOiAyLCBzbmFwc2hvdDogeyB3YXRjaGVzOiAxLCBkaXNwb3NlZDogMCB9IH0pO1xuXG5cdFx0XHRzZWNvbmRSZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaWxlU2VydmljZS5zbmFwc2hvdCgpLCB7IHdhdGNoZXM6IDEsIGRpc3Bvc2VkOiAxIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWx0ZXJzIGtub3duIHJlcG9zaXRvcnkgbWV0YWRhdGEgbm9pc2UgYmVmb3JlIGRlYm91bmNpbmcnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IFRlc3RGaWxlU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgbW9uaXRvciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0RmlsZU1vbml0b3JTZXJ2aWNlKGZpbGVTZXJ2aWNlLnNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRsZXQgY2FsbHMgPSAwO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWNxdWlyZShtb25pdG9yLCBVUkkuZmlsZSgnL3JlcG8nKSwgKCkgPT4gY2FsbHMrKywgeyBkZWJvdW5jZU1zOiAxMCB9KSk7XG5cdFx0XHRmaWxlU2VydmljZS5maXJlKFVSSS5maWxlKCcvcmVwby8uZ2l0L29iamVjdHMvMTIvYWJjZGVmJykpO1xuXHRcdFx0ZmlsZVNlcnZpY2UuZmlyZShVUkkuZmlsZSgnL3JlcG8vLmdpdC9pbmRleC5sb2NrJykpO1xuXHRcdFx0ZmlsZVNlcnZpY2UuZmlyZShVUkkuZmlsZSgnL3JlcG8vLndhdGNobWFuLWNvb2tpZS0xMjMnKSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDExKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxscywgMCk7XG5cblx0XHRcdGZpbGVTZXJ2aWNlLmZpcmUoVVJJLmZpbGUoJy9yZXBvL3NyYy9hLnRzJykpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgxMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbHMsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWx0ZXJzIGN1c3RvbSBleGNsdWRlcyBiZWZvcmUgZGVib3VuY2luZycsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBuZXcgVGVzdEZpbGVTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBtb25pdG9yID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UoZmlsZVNlcnZpY2Uuc2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdGxldCBjYWxscyA9IDA7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhY3F1aXJlKG1vbml0b3IsIFVSSS5maWxlKCcvcmVwbycpLCAoKSA9PiBjYWxscysrLCB7IGV4Y2x1ZGVzOiBbJyoqL2dlbmVyYXRlZC8qKiddLCBkZWJvdW5jZU1zOiAxMCB9KSk7XG5cdFx0XHRmaWxlU2VydmljZS5maXJlKFVSSS5maWxlKCcvcmVwby9nZW5lcmF0ZWQvYS50cycpKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzLCAwKTtcblxuXHRcdFx0ZmlsZVNlcnZpY2UuZmlyZShVUkkuZmlsZSgnL3JlcG8vc3JjL2EudHMnKSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDExKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxscywgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NvcnRzIGV4Y2x1ZGVzIHdoZW4gc2hhcmluZyB3YXRjaGVycycsICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBUZXN0RmlsZVNlcnZpY2UoKTtcblx0XHRjb25zdCBtb25pdG9yID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UoZmlsZVNlcnZpY2Uuc2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBmb2xkZXIgPSBVUkkuZmlsZSgnL3JlcG8nKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhY3F1aXJlKG1vbml0b3IsIGZvbGRlciwgKCkgPT4geyB9LCB7IGV4Y2x1ZGVzOiBbJyoqL2IvKionLCAnKiovYS8qKiddLCBkZWJvdW5jZU1zOiAxMCB9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjcXVpcmUobW9uaXRvciwgZm9sZGVyLCAoKSA9PiB7IH0sIHsgZXhjbHVkZXM6IFsnKiovYS8qKicsICcqKi9iLyoqJ10sIGRlYm91bmNlTXM6IDEwIH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlsZVNlcnZpY2Uuc25hcHNob3QoKSwgeyB3YXRjaGVzOiAxLCBkaXNwb3NlZDogMCB9KTtcblx0fSk7XG5cblx0dGVzdCgnY2Fub25pY2FsaXplcyBlcXVpdmFsZW50IGZvbGRlciBrZXlzIHdoZW4gc2hhcmluZyB3YXRjaGVycycsICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBUZXN0RmlsZVNlcnZpY2UoKTtcblx0XHRjb25zdCBtb25pdG9yID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UoZmlsZVNlcnZpY2Uuc2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhY3F1aXJlKG1vbml0b3IsIFVSSS5maWxlKCcvcmVwbycpLCAoKSA9PiB7IH0sIHsgZGVib3VuY2VNczogMTAgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhY3F1aXJlKG1vbml0b3IsIFVSSS5maWxlKCcvcmVwby8uLi9yZXBvLycpLCAoKSA9PiB7IH0sIHsgZGVib3VuY2VNczogMTAgfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaWxlU2VydmljZS5zbmFwc2hvdCgpLCB7IHdhdGNoZXM6IDEsIGRpc3Bvc2VkOiAwIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHdhdGNoZXIgYWNxdWlzaXRpb24gZmFpbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBuZXcgVGVzdEZpbGVTZXJ2aWNlKCk7XG5cdFx0ZmlsZVNlcnZpY2UuZmFpbFdhdGNoID0gdHJ1ZTtcblx0XHRjb25zdCBtb25pdG9yID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UoZmlsZVNlcnZpY2Uuc2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IG1vbml0b3IuYWNxdWlyZShVUkkuZmlsZSgnL3JlcG8nKSwgKCkgPT4geyB9LCB7IGRlYm91bmNlTXM6IDEwIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJlZ2lzdHJhdGlvbiwgc25hcHNob3Q6IGZpbGVTZXJ2aWNlLnNuYXBzaG90KCkgfSwgeyByZWdpc3RyYXRpb246IHVuZGVmaW5lZCwgc25hcHNob3Q6IHsgd2F0Y2hlczogMSwgZGlzcG9zZWQ6IDAgfSB9KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBvbmUgZmlsZS1jaGFuZ2UgbGlzdGVuZXIgYWNyb3NzIG1vbml0b3IgZW50cmllcycsICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IG5ldyBUZXN0RmlsZVNlcnZpY2UoKTtcblx0XHRjb25zdCBtb25pdG9yID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UoZmlsZVNlcnZpY2Uuc2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhY3F1aXJlKG1vbml0b3IsIFVSSS5maWxlKCcvcmVwby1hJyksICgpID0+IHsgfSwgeyBkZWJvdW5jZU1zOiAxMCB9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFjcXVpcmUobW9uaXRvciwgVVJJLmZpbGUoJy9yZXBvLWInKSwgKCkgPT4geyB9LCB7IGRlYm91bmNlTXM6IDEwIH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzbmFwc2hvdDogZmlsZVNlcnZpY2Uuc25hcHNob3QoKSwgbGlzdGVuZXJzOiBmaWxlU2VydmljZS5maWxlQ2hhbmdlTGlzdGVuZXJDb3VudCB9LCB7XG5cdFx0XHRzbmFwc2hvdDogeyB3YXRjaGVzOiAyLCBkaXNwb3NlZDogMCB9LFxuXHRcdFx0bGlzdGVuZXJzOiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3Npbmcgc2VydmljZSBjbGVhbnMgdXAgYWN0aXZlIHdhdGNoZXJzIGFuZCBwZW5kaW5nIGRlYm91bmNlIGNhbGxiYWNrcycsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBuZXcgVGVzdEZpbGVTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBtb25pdG9yID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UoZmlsZVNlcnZpY2Uuc2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdGxldCBjYWxscyA9IDA7XG5cblx0XHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IGFjcXVpcmUobW9uaXRvciwgVVJJLmZpbGUoJy9yZXBvJyksICgpID0+IGNhbGxzKyssIHsgZGVib3VuY2VNczogMTAgfSk7XG5cdFx0XHRmaWxlU2VydmljZS5maXJlKFVSSS5maWxlKCcvcmVwby9zcmMvYS50cycpKTtcblx0XHRcdG1vbml0b3IuZGlzcG9zZSgpO1xuXHRcdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMTEpO1xuXG5cdFx0XHRmaWxlU2VydmljZS5maXJlKFVSSS5maWxlKCcvcmVwby9zcmMvYi50cycpKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMTEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGNhbGxzLCBzbmFwc2hvdDogZmlsZVNlcnZpY2Uuc25hcHNob3QoKSB9LCB7IGNhbGxzOiAwLCBzbmFwc2hvdDogeyB3YXRjaGVzOiAxLCBkaXNwb3NlZDogMSB9IH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5jbGFzcyBUZXN0RmlsZVNlcnZpY2Uge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZpbGVzQ2hhbmdlID0gbmV3IEVtaXR0ZXI8RmlsZUNoYW5nZXNFdmVudD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRXYXRjaEVycm9yID0gbmV3IEVtaXR0ZXI8RXJyb3I+KCk7XG5cdHByaXZhdGUgX3dhdGNoQ291bnQgPSAwO1xuXHRwcml2YXRlIF9kaXNwb3NlQ291bnQgPSAwO1xuXHRwcml2YXRlIF9maWxlQ2hhbmdlTGlzdGVuZXJDb3VudCA9IDA7XG5cdGZhaWxXYXRjaCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRmlsZXNDaGFuZ2VFdmVudDogRXZlbnQ8RmlsZUNoYW5nZXNFdmVudD4gPSAobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcykgPT4ge1xuXHRcdHRoaXMuX2ZpbGVDaGFuZ2VMaXN0ZW5lckNvdW50Kys7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkRmlsZXNDaGFuZ2UuZXZlbnQobGlzdGVuZXIsIHRoaXNBcmdzLCBkaXNwb3NhYmxlcyk7XG5cdH07XG5cblx0cmVhZG9ubHkgc2VydmljZSA9IHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0b25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zOiBFdmVudC5Ob25lLFxuXHRcdG9uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzOiBFdmVudC5Ob25lLFxuXHRcdG9uV2lsbEFjdGl2YXRlRmlsZVN5c3RlbVByb3ZpZGVyOiBFdmVudC5Ob25lLFxuXHRcdG9uRGlkRmlsZXNDaGFuZ2U6IHRoaXMuX29uRGlkRmlsZXNDaGFuZ2VFdmVudCxcblx0XHRvbkRpZFdhdGNoRXJyb3I6IHRoaXMuX29uRGlkV2F0Y2hFcnJvci5ldmVudCxcblx0XHR3YXRjaDogKF9yZXNvdXJjZTogVVJJLCBfb3B0aW9ucz86IFBhcmFtZXRlcnM8SUZpbGVTZXJ2aWNlWyd3YXRjaCddPlsxXSk6IElEaXNwb3NhYmxlID0+IHtcblx0XHRcdHRoaXMuX3dhdGNoQ291bnQrKztcblx0XHRcdGlmICh0aGlzLmZhaWxXYXRjaCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3dhdGNoIGZhaWxlZCcpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9kaXNwb3NlQ291bnQrKyk7XG5cdFx0fSxcblx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdH0gYXMgUGFydGlhbDxJRmlsZVNlcnZpY2U+IGFzIElGaWxlU2VydmljZTtcblxuXHRmaXJlKHJlc291cmNlOiBVUkksIHR5cGU6IEZpbGVDaGFuZ2VUeXBlID0gRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkRmlsZXNDaGFuZ2UuZmlyZShuZXcgRmlsZUNoYW5nZXNFdmVudChbeyByZXNvdXJjZSwgdHlwZSB9XSwgZmFsc2UpKTtcblx0fVxuXG5cdHNuYXBzaG90KCk6IHsgd2F0Y2hlczogbnVtYmVyOyBkaXNwb3NlZDogbnVtYmVyIH0ge1xuXHRcdHJldHVybiB7IHdhdGNoZXM6IHRoaXMuX3dhdGNoQ291bnQsIGRpc3Bvc2VkOiB0aGlzLl9kaXNwb3NlQ291bnQgfTtcblx0fVxuXG5cdGdldCBmaWxlQ2hhbmdlTGlzdGVuZXJDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9maWxlQ2hhbmdlTGlzdGVuZXJDb3VudDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGlCQUE4QixvQkFBb0I7QUFDM0QsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsa0JBQWtCLHNCQUFvQztBQUMvRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1DQUFtQztBQUU1QyxNQUFNLCtCQUErQixNQUFNO0FBRTFDLFFBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUV4QyxXQUFTLE1BQU0sWUFBWSxNQUFNLENBQUM7QUFDbEMsMENBQXdDO0FBRXhDLFdBQVMsUUFBUSxTQUFzQyxRQUFhLFVBQXNCLFNBQWdHO0FBQ3pMLFVBQU0sZUFBZSxRQUFRLFFBQVEsUUFBUSxVQUFVLE9BQU87QUFDOUQsV0FBTyxHQUFHLGNBQWMsOENBQThDO0FBQ3RFLFdBQU87QUFBQSxFQUNSO0FBRUEsT0FBSywyRUFBMkUsTUFBTTtBQUNyRixXQUFPLG1CQUFtQixFQUFFLGVBQWUsTUFBTSxjQUFjLElBQU8sR0FBRyxZQUFZO0FBQ3BGLFlBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxZQUFNLFVBQVUsWUFBWSxJQUFJLElBQUksNEJBQTRCLFlBQVksU0FBUyxJQUFJLGVBQWUsQ0FBQyxDQUFDO0FBQzFHLFlBQU0sU0FBUyxJQUFJLEtBQUssT0FBTztBQUMvQixVQUFJLFFBQVE7QUFDWixVQUFJLFNBQVM7QUFFYixZQUFNLG9CQUFvQixRQUFRLFNBQVMsUUFBUSxNQUFNLFNBQVMsRUFBRSxZQUFZLEdBQUcsQ0FBQztBQUNwRixZQUFNLHFCQUFxQixRQUFRLFNBQVMsUUFBUSxNQUFNLFVBQVUsRUFBRSxZQUFZLEdBQUcsQ0FBQztBQUN0RixhQUFPLGdCQUFnQixZQUFZLFNBQVMsR0FBRyxFQUFFLFNBQVMsR0FBRyxVQUFVLEVBQUUsQ0FBQztBQUUxRSxrQkFBWSxLQUFLLElBQUksS0FBSyxnQkFBZ0IsQ0FBQztBQUMzQyxZQUFNLFFBQVEsRUFBRTtBQUNoQixhQUFPLGdCQUFnQixFQUFFLE9BQU8sT0FBTyxHQUFHLEVBQUUsT0FBTyxHQUFHLFFBQVEsRUFBRSxDQUFDO0FBRWpFLHdCQUFrQixRQUFRO0FBQzFCLGtCQUFZLEtBQUssSUFBSSxLQUFLLGdCQUFnQixDQUFDO0FBQzNDLFlBQU0sUUFBUSxFQUFFO0FBQ2hCLGFBQU8sZ0JBQWdCLEVBQUUsT0FBTyxRQUFRLFVBQVUsWUFBWSxTQUFTLEVBQUUsR0FBRyxFQUFFLE9BQU8sR0FBRyxRQUFRLEdBQUcsVUFBVSxFQUFFLFNBQVMsR0FBRyxVQUFVLEVBQUUsRUFBRSxDQUFDO0FBRTFJLHlCQUFtQixRQUFRO0FBQzNCLGFBQU8sZ0JBQWdCLFlBQVksU0FBUyxHQUFHLEVBQUUsU0FBUyxHQUFHLFVBQVUsRUFBRSxDQUFDO0FBQUEsSUFDM0UsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkRBQTZELE1BQU07QUFDdkUsV0FBTyxtQkFBbUIsRUFBRSxlQUFlLE1BQU0sY0FBYyxJQUFPLEdBQUcsWUFBWTtBQUNwRixZQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsWUFBTSxVQUFVLFlBQVksSUFBSSxJQUFJLDRCQUE0QixZQUFZLFNBQVMsSUFBSSxlQUFlLENBQUMsQ0FBQztBQUMxRyxVQUFJLFFBQVE7QUFFWixrQkFBWSxJQUFJLFFBQVEsU0FBUyxJQUFJLEtBQUssT0FBTyxHQUFHLE1BQU0sU0FBUyxFQUFFLFlBQVksR0FBRyxDQUFDLENBQUM7QUFDdEYsa0JBQVksS0FBSyxJQUFJLEtBQUssOEJBQThCLENBQUM7QUFDekQsa0JBQVksS0FBSyxJQUFJLEtBQUssdUJBQXVCLENBQUM7QUFDbEQsa0JBQVksS0FBSyxJQUFJLEtBQUssNEJBQTRCLENBQUM7QUFDdkQsWUFBTSxRQUFRLEVBQUU7QUFDaEIsYUFBTyxZQUFZLE9BQU8sQ0FBQztBQUUzQixrQkFBWSxLQUFLLElBQUksS0FBSyxnQkFBZ0IsQ0FBQztBQUMzQyxZQUFNLFFBQVEsRUFBRTtBQUNoQixhQUFPLFlBQVksT0FBTyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkNBQTZDLE1BQU07QUFDdkQsV0FBTyxtQkFBbUIsRUFBRSxlQUFlLE1BQU0sY0FBYyxJQUFPLEdBQUcsWUFBWTtBQUNwRixZQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsWUFBTSxVQUFVLFlBQVksSUFBSSxJQUFJLDRCQUE0QixZQUFZLFNBQVMsSUFBSSxlQUFlLENBQUMsQ0FBQztBQUMxRyxVQUFJLFFBQVE7QUFFWixrQkFBWSxJQUFJLFFBQVEsU0FBUyxJQUFJLEtBQUssT0FBTyxHQUFHLE1BQU0sU0FBUyxFQUFFLFVBQVUsQ0FBQyxpQkFBaUIsR0FBRyxZQUFZLEdBQUcsQ0FBQyxDQUFDO0FBQ3JILGtCQUFZLEtBQUssSUFBSSxLQUFLLHNCQUFzQixDQUFDO0FBQ2pELFlBQU0sUUFBUSxFQUFFO0FBQ2hCLGFBQU8sWUFBWSxPQUFPLENBQUM7QUFFM0Isa0JBQVksS0FBSyxJQUFJLEtBQUssZ0JBQWdCLENBQUM7QUFDM0MsWUFBTSxRQUFRLEVBQUU7QUFDaEIsYUFBTyxZQUFZLE9BQU8sQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHdDQUF3QyxNQUFNO0FBQ2xELFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxVQUFNLFVBQVUsWUFBWSxJQUFJLElBQUksNEJBQTRCLFlBQVksU0FBUyxJQUFJLGVBQWUsQ0FBQyxDQUFDO0FBQzFHLFVBQU0sU0FBUyxJQUFJLEtBQUssT0FBTztBQUUvQixnQkFBWSxJQUFJLFFBQVEsU0FBUyxRQUFRLE1BQU07QUFBQSxJQUFFLEdBQUcsRUFBRSxVQUFVLENBQUMsV0FBVyxTQUFTLEdBQUcsWUFBWSxHQUFHLENBQUMsQ0FBQztBQUN6RyxnQkFBWSxJQUFJLFFBQVEsU0FBUyxRQUFRLE1BQU07QUFBQSxJQUFFLEdBQUcsRUFBRSxVQUFVLENBQUMsV0FBVyxTQUFTLEdBQUcsWUFBWSxHQUFHLENBQUMsQ0FBQztBQUV6RyxXQUFPLGdCQUFnQixZQUFZLFNBQVMsR0FBRyxFQUFFLFNBQVMsR0FBRyxVQUFVLEVBQUUsQ0FBQztBQUFBLEVBQzNFLENBQUM7QUFFRCxPQUFLLDhEQUE4RCxNQUFNO0FBQ3hFLFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxVQUFNLFVBQVUsWUFBWSxJQUFJLElBQUksNEJBQTRCLFlBQVksU0FBUyxJQUFJLGVBQWUsQ0FBQyxDQUFDO0FBRTFHLGdCQUFZLElBQUksUUFBUSxTQUFTLElBQUksS0FBSyxPQUFPLEdBQUcsTUFBTTtBQUFBLElBQUUsR0FBRyxFQUFFLFlBQVksR0FBRyxDQUFDLENBQUM7QUFDbEYsZ0JBQVksSUFBSSxRQUFRLFNBQVMsSUFBSSxLQUFLLGdCQUFnQixHQUFHLE1BQU07QUFBQSxJQUFFLEdBQUcsRUFBRSxZQUFZLEdBQUcsQ0FBQyxDQUFDO0FBRTNGLFdBQU8sZ0JBQWdCLFlBQVksU0FBUyxHQUFHLEVBQUUsU0FBUyxHQUFHLFVBQVUsRUFBRSxDQUFDO0FBQUEsRUFDM0UsQ0FBQztBQUVELE9BQUssb0RBQW9ELE1BQU07QUFDOUQsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLGdCQUFZLFlBQVk7QUFDeEIsVUFBTSxVQUFVLFlBQVksSUFBSSxJQUFJLDRCQUE0QixZQUFZLFNBQVMsSUFBSSxlQUFlLENBQUMsQ0FBQztBQUUxRyxVQUFNLGVBQWUsUUFBUSxRQUFRLElBQUksS0FBSyxPQUFPLEdBQUcsTUFBTTtBQUFBLElBQUUsR0FBRyxFQUFFLFlBQVksR0FBRyxDQUFDO0FBRXJGLFdBQU8sZ0JBQWdCLEVBQUUsY0FBYyxVQUFVLFlBQVksU0FBUyxFQUFFLEdBQUcsRUFBRSxjQUFjLFFBQVcsVUFBVSxFQUFFLFNBQVMsR0FBRyxVQUFVLEVBQUUsRUFBRSxDQUFDO0FBQUEsRUFDOUksQ0FBQztBQUVELE9BQUssd0RBQXdELE1BQU07QUFDbEUsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFVBQU0sVUFBVSxZQUFZLElBQUksSUFBSSw0QkFBNEIsWUFBWSxTQUFTLElBQUksZUFBZSxDQUFDLENBQUM7QUFFMUcsZ0JBQVksSUFBSSxRQUFRLFNBQVMsSUFBSSxLQUFLLFNBQVMsR0FBRyxNQUFNO0FBQUEsSUFBRSxHQUFHLEVBQUUsWUFBWSxHQUFHLENBQUMsQ0FBQztBQUNwRixnQkFBWSxJQUFJLFFBQVEsU0FBUyxJQUFJLEtBQUssU0FBUyxHQUFHLE1BQU07QUFBQSxJQUFFLEdBQUcsRUFBRSxZQUFZLEdBQUcsQ0FBQyxDQUFDO0FBRXBGLFdBQU8sZ0JBQWdCLEVBQUUsVUFBVSxZQUFZLFNBQVMsR0FBRyxXQUFXLFlBQVksd0JBQXdCLEdBQUc7QUFBQSxNQUM1RyxVQUFVLEVBQUUsU0FBUyxHQUFHLFVBQVUsRUFBRTtBQUFBLE1BQ3BDLFdBQVc7QUFBQSxJQUNaLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDhFQUE4RSxNQUFNO0FBQ3hGLFdBQU8sbUJBQW1CLEVBQUUsZUFBZSxNQUFNLGNBQWMsSUFBTyxHQUFHLFlBQVk7QUFDcEYsWUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFlBQU0sVUFBVSxZQUFZLElBQUksSUFBSSw0QkFBNEIsWUFBWSxTQUFTLElBQUksZUFBZSxDQUFDLENBQUM7QUFDMUcsVUFBSSxRQUFRO0FBRVosWUFBTSxlQUFlLFFBQVEsU0FBUyxJQUFJLEtBQUssT0FBTyxHQUFHLE1BQU0sU0FBUyxFQUFFLFlBQVksR0FBRyxDQUFDO0FBQzFGLGtCQUFZLEtBQUssSUFBSSxLQUFLLGdCQUFnQixDQUFDO0FBQzNDLGNBQVEsUUFBUTtBQUNoQixtQkFBYSxRQUFRO0FBQ3JCLFlBQU0sUUFBUSxFQUFFO0FBRWhCLGtCQUFZLEtBQUssSUFBSSxLQUFLLGdCQUFnQixDQUFDO0FBQzNDLFlBQU0sUUFBUSxFQUFFO0FBQ2hCLGFBQU8sZ0JBQWdCLEVBQUUsT0FBTyxVQUFVLFlBQVksU0FBUyxFQUFFLEdBQUcsRUFBRSxPQUFPLEdBQUcsVUFBVSxFQUFFLFNBQVMsR0FBRyxVQUFVLEVBQUUsRUFBRSxDQUFDO0FBQUEsSUFDeEgsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLGdCQUFnQjtBQUFBLEVBQXRCO0FBQ0MsU0FBaUIsb0JBQW9CLElBQUksUUFBMEI7QUFDbkUsU0FBaUIsbUJBQW1CLElBQUksUUFBZTtBQUN2RCxTQUFRLGNBQWM7QUFDdEIsU0FBUSxnQkFBZ0I7QUFDeEIsU0FBUSwyQkFBMkI7QUFDbkMscUJBQVk7QUFFWixTQUFpQix5QkFBa0QsQ0FBQyxVQUFVLFVBQVUsZ0JBQWdCO0FBQ3ZHLFdBQUs7QUFDTCxhQUFPLEtBQUssa0JBQWtCLE1BQU0sVUFBVSxVQUFVLFdBQVc7QUFBQSxJQUNwRTtBQUVBLFNBQVMsVUFBVTtBQUFBLE1BQ2xCLGVBQWU7QUFBQSxNQUNmLDRDQUE0QyxNQUFNO0FBQUEsTUFDbEQsMkNBQTJDLE1BQU07QUFBQSxNQUNqRCxrQ0FBa0MsTUFBTTtBQUFBLE1BQ3hDLGtCQUFrQixLQUFLO0FBQUEsTUFDdkIsaUJBQWlCLEtBQUssaUJBQWlCO0FBQUEsTUFDdkMsT0FBTyxDQUFDLFdBQWdCLGFBQWlFO0FBQ3hGLGFBQUs7QUFDTCxZQUFJLEtBQUssV0FBVztBQUNuQixnQkFBTSxJQUFJLE1BQU0sY0FBYztBQUFBLFFBQy9CO0FBQ0EsZUFBTyxhQUFhLE1BQU0sS0FBSyxlQUFlO0FBQUEsTUFDL0M7QUFBQSxNQUNBLFNBQVMsTUFBTTtBQUFBLE1BQUU7QUFBQSxJQUNsQjtBQUFBO0FBQUEsRUFFQSxLQUFLLFVBQWUsT0FBdUIsZUFBZSxTQUFlO0FBQ3hFLFNBQUssa0JBQWtCLEtBQUssSUFBSSxpQkFBaUIsQ0FBQyxFQUFFLFVBQVUsS0FBSyxDQUFDLEdBQUcsS0FBSyxDQUFDO0FBQUEsRUFDOUU7QUFBQSxFQUVBLFdBQWtEO0FBQ2pELFdBQU8sRUFBRSxTQUFTLEtBQUssYUFBYSxVQUFVLEtBQUssY0FBYztBQUFBLEVBQ2xFO0FBQUEsRUFFQSxJQUFJLDBCQUFrQztBQUNyQyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
