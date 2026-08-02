import assert from "assert";
import { DeferredPromise, timeout } from "../../../../base/common/async.js";
import { bufferToReadable, bufferToStream, VSBuffer } from "../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../base/common/resources.js";
import { consumeStream, newWriteableStream } from "../../../../base/common/stream.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileSystemProviderCapabilities, FileType, isFileSystemWatcher, FileChangeType } from "../../common/files.js";
import { FileService } from "../../common/fileService.js";
import { NullFileSystemProvider } from "../common/nullFileSystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
suite("File Service", () => {
  const disposables = new DisposableStore();
  teardown(() => {
    disposables.clear();
  });
  test("provider registration", async () => {
    const service = disposables.add(new FileService(new NullLogService()));
    const resource = URI.parse("test://foo/bar");
    const provider = new NullFileSystemProvider();
    assert.strictEqual(await service.canHandleResource(resource), false);
    assert.strictEqual(service.hasProvider(resource), false);
    assert.strictEqual(service.getProvider(resource.scheme), void 0);
    const registrations = [];
    disposables.add(service.onDidChangeFileSystemProviderRegistrations((e) => {
      registrations.push(e);
    }));
    const capabilityChanges = [];
    disposables.add(service.onDidChangeFileSystemProviderCapabilities((e) => {
      capabilityChanges.push(e);
    }));
    let registrationDisposable;
    let callCount = 0;
    disposables.add(service.onWillActivateFileSystemProvider((e) => {
      callCount++;
      if (e.scheme === "test" && callCount === 1) {
        e.join(new Promise((resolve) => {
          registrationDisposable = service.registerProvider("test", provider);
          resolve();
        }));
      }
    }));
    assert.strictEqual(await service.canHandleResource(resource), true);
    assert.strictEqual(service.hasProvider(resource), true);
    assert.strictEqual(service.getProvider(resource.scheme), provider);
    assert.strictEqual(registrations.length, 1);
    assert.strictEqual(registrations[0].scheme, "test");
    assert.strictEqual(registrations[0].added, true);
    assert.ok(registrationDisposable);
    assert.strictEqual(capabilityChanges.length, 0);
    provider.setCapabilities(FileSystemProviderCapabilities.FileFolderCopy);
    assert.strictEqual(capabilityChanges.length, 1);
    provider.setCapabilities(FileSystemProviderCapabilities.Readonly);
    assert.strictEqual(capabilityChanges.length, 2);
    await service.activateProvider("test");
    assert.strictEqual(callCount, 2);
    assert.strictEqual(service.hasCapability(resource, FileSystemProviderCapabilities.Readonly), true);
    assert.strictEqual(service.hasCapability(resource, FileSystemProviderCapabilities.FileOpenReadWriteClose), false);
    registrationDisposable.dispose();
    assert.strictEqual(await service.canHandleResource(resource), false);
    assert.strictEqual(service.hasProvider(resource), false);
    assert.strictEqual(registrations.length, 2);
    assert.strictEqual(registrations[1].scheme, "test");
    assert.strictEqual(registrations[1].added, false);
  });
  test("watch", async () => {
    const service = disposables.add(new FileService(new NullLogService()));
    let disposeCounter = 0;
    disposables.add(service.registerProvider("test", new NullFileSystemProvider(() => {
      return toDisposable(() => {
        disposeCounter++;
      });
    })));
    await service.activateProvider("test");
    const resource1 = URI.parse("test://foo/bar1");
    const watcher1Disposable = service.watch(resource1);
    await timeout(0);
    assert.strictEqual(disposeCounter, 0);
    watcher1Disposable.dispose();
    assert.strictEqual(disposeCounter, 1);
    disposeCounter = 0;
    const resource2 = URI.parse("test://foo/bar2");
    const watcher2Disposable1 = service.watch(resource2);
    const watcher2Disposable2 = service.watch(resource2);
    const watcher2Disposable3 = service.watch(resource2);
    await timeout(0);
    assert.strictEqual(disposeCounter, 0);
    watcher2Disposable1.dispose();
    assert.strictEqual(disposeCounter, 0);
    watcher2Disposable2.dispose();
    assert.strictEqual(disposeCounter, 0);
    watcher2Disposable3.dispose();
    assert.strictEqual(disposeCounter, 1);
    disposeCounter = 0;
    const resource3 = URI.parse("test://foo/bar3");
    const watcher3Disposable1 = service.watch(resource3);
    const watcher3Disposable2 = service.watch(resource3, { recursive: true, excludes: [] });
    const watcher3Disposable3 = service.watch(resource3, { recursive: false, excludes: [], includes: [] });
    await timeout(0);
    assert.strictEqual(disposeCounter, 0);
    watcher3Disposable1.dispose();
    assert.strictEqual(disposeCounter, 1);
    watcher3Disposable2.dispose();
    assert.strictEqual(disposeCounter, 2);
    watcher3Disposable3.dispose();
    assert.strictEqual(disposeCounter, 3);
    service.dispose();
  });
  test("watch - with corelation", async () => {
    const service = disposables.add(new FileService(new NullLogService()));
    const provider = new class extends NullFileSystemProvider {
      constructor() {
        super(...arguments);
        this._testOnDidChangeFile = new Emitter();
        this.onDidChangeFile = this._testOnDidChangeFile.event;
      }
      fireFileChange(changes) {
        this._testOnDidChangeFile.fire(changes);
      }
    }();
    disposables.add(service.registerProvider("test", provider));
    await service.activateProvider("test");
    const globalEvents = [];
    disposables.add(service.onDidFilesChange((e) => {
      globalEvents.push(e);
    }));
    const watcher0 = disposables.add(service.watch(URI.parse("test://watch/folder1"), { recursive: true, excludes: [], includes: [] }));
    assert.strictEqual(isFileSystemWatcher(watcher0), false);
    const watcher1 = disposables.add(service.watch(URI.parse("test://watch/folder2"), { recursive: true, excludes: [], includes: [], correlationId: 100 }));
    assert.strictEqual(isFileSystemWatcher(watcher1), true);
    const watcher2 = disposables.add(service.watch(URI.parse("test://watch/folder3"), { recursive: true, excludes: [], includes: [], correlationId: 200 }));
    assert.strictEqual(isFileSystemWatcher(watcher2), true);
    const watcher1Events = [];
    disposables.add(watcher1.onDidChange((e) => {
      watcher1Events.push(e);
    }));
    const watcher2Events = [];
    disposables.add(watcher2.onDidChange((e) => {
      watcher2Events.push(e);
    }));
    provider.fireFileChange([{ resource: URI.parse("test://watch/folder1"), type: FileChangeType.ADDED }]);
    provider.fireFileChange([{ resource: URI.parse("test://watch/folder2"), type: FileChangeType.ADDED, cId: 100 }]);
    provider.fireFileChange([{ resource: URI.parse("test://watch/folder2"), type: FileChangeType.ADDED, cId: 100 }]);
    provider.fireFileChange([{ resource: URI.parse("test://watch/folder3/file"), type: FileChangeType.UPDATED, cId: 200 }]);
    provider.fireFileChange([{ resource: URI.parse("test://watch/folder3"), type: FileChangeType.UPDATED, cId: 200 }]);
    provider.fireFileChange([{ resource: URI.parse("test://watch/folder4"), type: FileChangeType.ADDED, cId: 50 }]);
    provider.fireFileChange([{ resource: URI.parse("test://watch/folder4"), type: FileChangeType.ADDED, cId: 60 }]);
    provider.fireFileChange([{ resource: URI.parse("test://watch/folder4"), type: FileChangeType.ADDED, cId: 70 }]);
    assert.strictEqual(globalEvents.length, 1);
    assert.strictEqual(watcher1Events.length, 2);
    assert.strictEqual(watcher2Events.length, 2);
  });
  test("error from readFile bubbles through (https://github.com/microsoft/vscode/issues/118060) - async", async () => {
    testReadErrorBubbles(true);
  });
  test("error from readFile bubbles through (https://github.com/microsoft/vscode/issues/118060)", async () => {
    testReadErrorBubbles(false);
  });
  async function testReadErrorBubbles(async) {
    const service = disposables.add(new FileService(new NullLogService()));
    const provider = new class extends NullFileSystemProvider {
      async stat(resource) {
        return {
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
          type: FileType.File
        };
      }
      readFile(resource) {
        if (async) {
          return timeout(5, CancellationToken.None).then(() => {
            throw new Error("failed");
          });
        }
        throw new Error("failed");
      }
      open(resource, opts) {
        if (async) {
          return timeout(5, CancellationToken.None).then(() => {
            throw new Error("failed");
          });
        }
        throw new Error("failed");
      }
      readFileStream(resource, opts, token) {
        if (async) {
          const stream = newWriteableStream((chunk) => chunk[0]);
          timeout(5, CancellationToken.None).then(() => stream.error(new Error("failed")));
          return stream;
        }
        throw new Error("failed");
      }
    }();
    disposables.add(service.registerProvider("test", provider));
    for (const capabilities of [FileSystemProviderCapabilities.FileReadWrite, FileSystemProviderCapabilities.FileReadStream, FileSystemProviderCapabilities.FileOpenReadWriteClose]) {
      provider.setCapabilities(capabilities);
      let e1;
      try {
        await service.readFile(URI.parse("test://foo/bar"));
      } catch (error) {
        e1 = error;
      }
      assert.ok(e1);
      let e2;
      try {
        const stream = await service.readFileStream(URI.parse("test://foo/bar"));
        await consumeStream(stream.value, (chunk) => chunk[0]);
      } catch (error) {
        e2 = error;
      }
      assert.ok(e2);
    }
  }
  test("readFile/readFileStream supports cancellation (https://github.com/microsoft/vscode/issues/138805)", async () => {
    const service = disposables.add(new FileService(new NullLogService()));
    let readFileStreamReady = void 0;
    const provider = new class extends NullFileSystemProvider {
      async stat(resource) {
        return {
          mtime: Date.now(),
          ctime: Date.now(),
          size: 100,
          type: FileType.File
        };
      }
      readFileStream(resource, opts, token) {
        const stream = newWriteableStream((chunk) => chunk[0]);
        disposables.add(token.onCancellationRequested(() => {
          stream.error(new Error("Expected cancellation"));
          stream.end();
        }));
        readFileStreamReady.complete();
        return stream;
      }
    }();
    disposables.add(service.registerProvider("test", provider));
    provider.setCapabilities(FileSystemProviderCapabilities.FileReadStream);
    let e1;
    try {
      const cts = new CancellationTokenSource();
      readFileStreamReady = new DeferredPromise();
      const promise = service.readFile(URI.parse("test://foo/bar"), void 0, cts.token);
      await Promise.all([readFileStreamReady.p.then(() => cts.cancel()), promise]);
    } catch (error) {
      e1 = error;
    }
    assert.ok(e1);
    let e2;
    try {
      const cts = new CancellationTokenSource();
      readFileStreamReady = new DeferredPromise();
      const stream = await service.readFileStream(URI.parse("test://foo/bar"), void 0, cts.token);
      await Promise.all([readFileStreamReady.p.then(() => cts.cancel()), consumeStream(stream.value, (chunk) => chunk[0])]);
    } catch (error) {
      e2 = error;
    }
    assert.ok(e2);
  });
  test("enforced atomic read/write/delete", async () => {
    const service = disposables.add(new FileService(new NullLogService()));
    const atomicResource = URI.parse("test://foo/bar/atomic");
    const nonAtomicResource = URI.parse("test://foo/nonatomic");
    let atomicReadCounter = 0;
    let atomicWriteCounter = 0;
    let atomicDeleteCounter = 0;
    const provider = new class extends NullFileSystemProvider {
      async stat(resource) {
        return {
          type: FileType.File,
          ctime: Date.now(),
          mtime: Date.now(),
          size: 0
        };
      }
      async readFile(resource, opts) {
        if (opts?.atomic) {
          atomicReadCounter++;
        }
        return new Uint8Array();
      }
      readFileStream(resource, opts, token) {
        return newWriteableStream((chunk) => chunk[0]);
      }
      enforceAtomicReadFile(resource) {
        return isEqual(resource, atomicResource);
      }
      async writeFile(resource, content, opts) {
        if (opts.atomic) {
          atomicWriteCounter++;
        }
      }
      enforceAtomicWriteFile(resource) {
        return isEqual(resource, atomicResource) ? { postfix: ".tmp" } : false;
      }
      async delete(resource, opts) {
        if (opts.atomic) {
          atomicDeleteCounter++;
        }
      }
      enforceAtomicDelete(resource) {
        return isEqual(resource, atomicResource) ? { postfix: ".tmp" } : false;
      }
    }();
    provider.setCapabilities(
      FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileOpenReadWriteClose | FileSystemProviderCapabilities.FileReadStream | FileSystemProviderCapabilities.FileAtomicRead | FileSystemProviderCapabilities.FileAtomicWrite | FileSystemProviderCapabilities.FileAtomicDelete
    );
    disposables.add(service.registerProvider("test", provider));
    await service.readFile(atomicResource);
    await service.readFile(nonAtomicResource);
    await service.readFileStream(atomicResource);
    await service.readFileStream(nonAtomicResource);
    await service.writeFile(atomicResource, VSBuffer.fromString(""));
    await service.writeFile(nonAtomicResource, VSBuffer.fromString(""));
    await service.writeFile(atomicResource, bufferToStream(VSBuffer.fromString("")));
    await service.writeFile(nonAtomicResource, bufferToStream(VSBuffer.fromString("")));
    await service.writeFile(atomicResource, bufferToReadable(VSBuffer.fromString("")));
    await service.writeFile(nonAtomicResource, bufferToReadable(VSBuffer.fromString("")));
    await service.del(atomicResource);
    await service.del(nonAtomicResource);
    assert.strictEqual(atomicReadCounter, 2);
    assert.strictEqual(atomicWriteCounter, 3);
    assert.strictEqual(atomicDeleteCounter, 1);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3QvYnJvd3Nlci9maWxlU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgYnVmZmVyVG9SZWFkYWJsZSwgYnVmZmVyVG9TdHJlYW0sIFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGNvbnN1bWVTdHJlYW0sIG5ld1dyaXRlYWJsZVN0cmVhbSwgUmVhZGFibGVTdHJlYW1FdmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJlYW0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUZpbGVPcGVuT3B0aW9ucywgSUZpbGVSZWFkU3RyZWFtT3B0aW9ucywgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLCBGaWxlVHlwZSwgSUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllc0NoYW5nZUV2ZW50LCBJRmlsZVN5c3RlbVByb3ZpZGVyUmVnaXN0cmF0aW9uRXZlbnQsIElTdGF0LCBJRmlsZUF0b21pY1JlYWRPcHRpb25zLCBJRmlsZUF0b21pY1dyaXRlT3B0aW9ucywgSUZpbGVBdG9taWNEZWxldGVPcHRpb25zLCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVBdG9taWNSZWFkQ2FwYWJpbGl0eSwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlQXRvbWljRGVsZXRlQ2FwYWJpbGl0eSwgSUZpbGVTeXN0ZW1Qcm92aWRlcldpdGhGaWxlQXRvbWljV3JpdGVDYXBhYmlsaXR5LCBJRmlsZUF0b21pY09wdGlvbnMsIElGaWxlQ2hhbmdlLCBpc0ZpbGVTeXN0ZW1XYXRjaGVyLCBGaWxlQ2hhbmdlc0V2ZW50LCBGaWxlQ2hhbmdlVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOdWxsRmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vY29tbW9uL251bGxGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbnN1aXRlKCdGaWxlIFNlcnZpY2UnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb3ZpZGVyIHJlZ2lzdHJhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCd0ZXN0Oi8vZm9vL2JhcicpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IE51bGxGaWxlU3lzdGVtUHJvdmlkZXIoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNhbkhhbmRsZVJlc291cmNlKHJlc291cmNlKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmhhc1Byb3ZpZGVyKHJlc291cmNlKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFByb3ZpZGVyKHJlc291cmNlLnNjaGVtZSksIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCByZWdpc3RyYXRpb25zOiBJRmlsZVN5c3RlbVByb3ZpZGVyUmVnaXN0cmF0aW9uRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyUmVnaXN0cmF0aW9ucyhlID0+IHtcblx0XHRcdHJlZ2lzdHJhdGlvbnMucHVzaChlKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBjYXBhYmlsaXR5Q2hhbmdlczogSUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllc0NoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyhlID0+IHtcblx0XHRcdGNhcGFiaWxpdHlDaGFuZ2VzLnB1c2goZSk7XG5cdFx0fSkpO1xuXG5cdFx0bGV0IHJlZ2lzdHJhdGlvbkRpc3Bvc2FibGU6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjYWxsQ291bnQgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uV2lsbEFjdGl2YXRlRmlsZVN5c3RlbVByb3ZpZGVyKGUgPT4ge1xuXHRcdFx0Y2FsbENvdW50Kys7XG5cblx0XHRcdGlmIChlLnNjaGVtZSA9PT0gJ3Rlc3QnICYmIGNhbGxDb3VudCA9PT0gMSkge1xuXHRcdFx0XHRlLmpvaW4obmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdFx0cmVnaXN0cmF0aW9uRGlzcG9zYWJsZSA9IHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcigndGVzdCcsIHByb3ZpZGVyKTtcblxuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNhbkhhbmRsZVJlc291cmNlKHJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzUHJvdmlkZXIocmVzb3VyY2UpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRQcm92aWRlcihyZXNvdXJjZS5zY2hlbWUpLCBwcm92aWRlcik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cmF0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyYXRpb25zWzBdLnNjaGVtZSwgJ3Rlc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cmF0aW9uc1swXS5hZGRlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlZ2lzdHJhdGlvbkRpc3Bvc2FibGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcGFiaWxpdHlDaGFuZ2VzLmxlbmd0aCwgMCk7XG5cblx0XHRwcm92aWRlci5zZXRDYXBhYmlsaXRpZXMoRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVGb2xkZXJDb3B5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwYWJpbGl0eUNoYW5nZXMubGVuZ3RoLCAxKTtcblx0XHRwcm92aWRlci5zZXRDYXBhYmlsaXRpZXMoRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlJlYWRvbmx5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwYWJpbGl0eUNoYW5nZXMubGVuZ3RoLCAyKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuYWN0aXZhdGVQcm92aWRlcigndGVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsQ291bnQsIDIpOyAvLyBhY3RpdmF0aW9uIGlzIGNhbGxlZCBhZ2FpblxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzQ2FwYWJpbGl0eShyZXNvdXJjZSwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlJlYWRvbmx5KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzQ2FwYWJpbGl0eShyZXNvdXJjZSwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2UpLCBmYWxzZSk7XG5cblx0XHRyZWdpc3RyYXRpb25EaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmNhbkhhbmRsZVJlc291cmNlKHJlc291cmNlKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmhhc1Byb3ZpZGVyKHJlc291cmNlKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJhdGlvbnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cmF0aW9uc1sxXS5zY2hlbWUsICd0ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJhdGlvbnNbMV0uYWRkZWQsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnd2F0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGxldCBkaXNwb3NlQ291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcigndGVzdCcsIG5ldyBOdWxsRmlsZVN5c3RlbVByb3ZpZGVyKCgpID0+IHtcblx0XHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRkaXNwb3NlQ291bnRlcisrO1xuXHRcdFx0fSk7XG5cdFx0fSkpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmFjdGl2YXRlUHJvdmlkZXIoJ3Rlc3QnKTtcblxuXHRcdGNvbnN0IHJlc291cmNlMSA9IFVSSS5wYXJzZSgndGVzdDovL2Zvby9iYXIxJyk7XG5cdFx0Y29uc3Qgd2F0Y2hlcjFEaXNwb3NhYmxlID0gc2VydmljZS53YXRjaChyZXNvdXJjZTEpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTsgLy8gc2VydmljZS53YXRjaCgpIGlzIGFzeW5jXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VDb3VudGVyLCAwKTtcblx0XHR3YXRjaGVyMURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlQ291bnRlciwgMSk7XG5cblx0XHRkaXNwb3NlQ291bnRlciA9IDA7XG5cdFx0Y29uc3QgcmVzb3VyY2UyID0gVVJJLnBhcnNlKCd0ZXN0Oi8vZm9vL2JhcjInKTtcblx0XHRjb25zdCB3YXRjaGVyMkRpc3Bvc2FibGUxID0gc2VydmljZS53YXRjaChyZXNvdXJjZTIpO1xuXHRcdGNvbnN0IHdhdGNoZXIyRGlzcG9zYWJsZTIgPSBzZXJ2aWNlLndhdGNoKHJlc291cmNlMik7XG5cdFx0Y29uc3Qgd2F0Y2hlcjJEaXNwb3NhYmxlMyA9IHNlcnZpY2Uud2F0Y2gocmVzb3VyY2UyKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7IC8vIHNlcnZpY2Uud2F0Y2goKSBpcyBhc3luY1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlQ291bnRlciwgMCk7XG5cdFx0d2F0Y2hlcjJEaXNwb3NhYmxlMS5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VDb3VudGVyLCAwKTtcblx0XHR3YXRjaGVyMkRpc3Bvc2FibGUyLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZUNvdW50ZXIsIDApO1xuXHRcdHdhdGNoZXIyRGlzcG9zYWJsZTMuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlQ291bnRlciwgMSk7XG5cblx0XHRkaXNwb3NlQ291bnRlciA9IDA7XG5cdFx0Y29uc3QgcmVzb3VyY2UzID0gVVJJLnBhcnNlKCd0ZXN0Oi8vZm9vL2JhcjMnKTtcblx0XHRjb25zdCB3YXRjaGVyM0Rpc3Bvc2FibGUxID0gc2VydmljZS53YXRjaChyZXNvdXJjZTMpO1xuXHRcdGNvbnN0IHdhdGNoZXIzRGlzcG9zYWJsZTIgPSBzZXJ2aWNlLndhdGNoKHJlc291cmNlMywgeyByZWN1cnNpdmU6IHRydWUsIGV4Y2x1ZGVzOiBbXSB9KTtcblx0XHRjb25zdCB3YXRjaGVyM0Rpc3Bvc2FibGUzID0gc2VydmljZS53YXRjaChyZXNvdXJjZTMsIHsgcmVjdXJzaXZlOiBmYWxzZSwgZXhjbHVkZXM6IFtdLCBpbmNsdWRlczogW10gfSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApOyAvLyBzZXJ2aWNlLndhdGNoKCkgaXMgYXN5bmNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZUNvdW50ZXIsIDApO1xuXHRcdHdhdGNoZXIzRGlzcG9zYWJsZTEuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlQ291bnRlciwgMSk7XG5cdFx0d2F0Y2hlcjNEaXNwb3NhYmxlMi5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VDb3VudGVyLCAyKTtcblx0XHR3YXRjaGVyM0Rpc3Bvc2FibGUzLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZUNvdW50ZXIsIDMpO1xuXG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhdGNoIC0gd2l0aCBjb3JlbGF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIE51bGxGaWxlU3lzdGVtUHJvdmlkZXIge1xuXHRcdFx0cHJpdmF0ZSByZWFkb25seSBfdGVzdE9uRGlkQ2hhbmdlRmlsZSA9IG5ldyBFbWl0dGVyPHJlYWRvbmx5IElGaWxlQ2hhbmdlW10+KCk7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUZpbGU6IEV2ZW50PHJlYWRvbmx5IElGaWxlQ2hhbmdlW10+ID0gdGhpcy5fdGVzdE9uRGlkQ2hhbmdlRmlsZS5ldmVudDtcblxuXHRcdFx0ZmlyZUZpbGVDaGFuZ2UoY2hhbmdlczogcmVhZG9ubHkgSUZpbGVDaGFuZ2VbXSkge1xuXHRcdFx0XHR0aGlzLl90ZXN0T25EaWRDaGFuZ2VGaWxlLmZpcmUoY2hhbmdlcyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ3Rlc3QnLCBwcm92aWRlcikpO1xuXHRcdGF3YWl0IHNlcnZpY2UuYWN0aXZhdGVQcm92aWRlcigndGVzdCcpO1xuXG5cdFx0Y29uc3QgZ2xvYmFsRXZlbnRzOiBGaWxlQ2hhbmdlc0V2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGUgPT4ge1xuXHRcdFx0Z2xvYmFsRXZlbnRzLnB1c2goZSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgd2F0Y2hlcjAgPSBkaXNwb3NhYmxlcy5hZGQoc2VydmljZS53YXRjaChVUkkucGFyc2UoJ3Rlc3Q6Ly93YXRjaC9mb2xkZXIxJyksIHsgcmVjdXJzaXZlOiB0cnVlLCBleGNsdWRlczogW10sIGluY2x1ZGVzOiBbXSB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRmlsZVN5c3RlbVdhdGNoZXIod2F0Y2hlcjApLCBmYWxzZSk7XG5cdFx0Y29uc3Qgd2F0Y2hlcjEgPSBkaXNwb3NhYmxlcy5hZGQoc2VydmljZS53YXRjaChVUkkucGFyc2UoJ3Rlc3Q6Ly93YXRjaC9mb2xkZXIyJyksIHsgcmVjdXJzaXZlOiB0cnVlLCBleGNsdWRlczogW10sIGluY2x1ZGVzOiBbXSwgY29ycmVsYXRpb25JZDogMTAwIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNGaWxlU3lzdGVtV2F0Y2hlcih3YXRjaGVyMSksIHRydWUpO1xuXHRcdGNvbnN0IHdhdGNoZXIyID0gZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uud2F0Y2goVVJJLnBhcnNlKCd0ZXN0Oi8vd2F0Y2gvZm9sZGVyMycpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZXhjbHVkZXM6IFtdLCBpbmNsdWRlczogW10sIGNvcnJlbGF0aW9uSWQ6IDIwMCB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRmlsZVN5c3RlbVdhdGNoZXIod2F0Y2hlcjIpLCB0cnVlKTtcblxuXHRcdGNvbnN0IHdhdGNoZXIxRXZlbnRzOiBGaWxlQ2hhbmdlc0V2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQod2F0Y2hlcjEub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHR3YXRjaGVyMUV2ZW50cy5wdXNoKGUpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHdhdGNoZXIyRXZlbnRzOiBGaWxlQ2hhbmdlc0V2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQod2F0Y2hlcjIub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHR3YXRjaGVyMkV2ZW50cy5wdXNoKGUpO1xuXHRcdH0pKTtcblxuXHRcdHByb3ZpZGVyLmZpcmVGaWxlQ2hhbmdlKFt7IHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly93YXRjaC9mb2xkZXIxJyksIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVEIH1dKTtcblx0XHRwcm92aWRlci5maXJlRmlsZUNoYW5nZShbeyByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vd2F0Y2gvZm9sZGVyMicpLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5BRERFRCwgY0lkOiAxMDAgfV0pO1xuXHRcdHByb3ZpZGVyLmZpcmVGaWxlQ2hhbmdlKFt7IHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly93YXRjaC9mb2xkZXIyJyksIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVELCBjSWQ6IDEwMCB9XSk7XG5cdFx0cHJvdmlkZXIuZmlyZUZpbGVDaGFuZ2UoW3sgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3dhdGNoL2ZvbGRlcjMvZmlsZScpLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVELCBjSWQ6IDIwMCB9XSk7XG5cdFx0cHJvdmlkZXIuZmlyZUZpbGVDaGFuZ2UoW3sgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3dhdGNoL2ZvbGRlcjMnKSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCwgY0lkOiAyMDAgfV0pO1xuXG5cdFx0cHJvdmlkZXIuZmlyZUZpbGVDaGFuZ2UoW3sgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3dhdGNoL2ZvbGRlcjQnKSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQsIGNJZDogNTAgfV0pO1xuXHRcdHByb3ZpZGVyLmZpcmVGaWxlQ2hhbmdlKFt7IHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly93YXRjaC9mb2xkZXI0JyksIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVELCBjSWQ6IDYwIH1dKTtcblx0XHRwcm92aWRlci5maXJlRmlsZUNoYW5nZShbeyByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vd2F0Y2gvZm9sZGVyNCcpLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5BRERFRCwgY0lkOiA3MCB9XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYmFsRXZlbnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZXIxRXZlbnRzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZXIyRXZlbnRzLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2Vycm9yIGZyb20gcmVhZEZpbGUgYnViYmxlcyB0aHJvdWdoIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4MDYwKSAtIGFzeW5jJywgYXN5bmMgKCkgPT4ge1xuXHRcdHRlc3RSZWFkRXJyb3JCdWJibGVzKHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdlcnJvciBmcm9tIHJlYWRGaWxlIGJ1YmJsZXMgdGhyb3VnaCAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExODA2MCknLCBhc3luYyAoKSA9PiB7XG5cdFx0dGVzdFJlYWRFcnJvckJ1YmJsZXMoZmFsc2UpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiB0ZXN0UmVhZEVycm9yQnViYmxlcyhhc3luYzogYm9vbGVhbikge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIE51bGxGaWxlU3lzdGVtUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgc3RhdChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJU3RhdD4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG10aW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRcdGN0aW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRcdHNpemU6IDEwMCxcblx0XHRcdFx0XHR0eXBlOiBGaWxlVHlwZS5GaWxlXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHtcblx0XHRcdFx0aWYgKGFzeW5jKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRpbWVvdXQoNSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkudGhlbigoKSA9PiB7IHRocm93IG5ldyBFcnJvcignZmFpbGVkJyk7IH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdmYWlsZWQnKTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgb3BlbihyZXNvdXJjZTogVVJJLCBvcHRzOiBJRmlsZU9wZW5PcHRpb25zKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRcdFx0aWYgKGFzeW5jKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRpbWVvdXQoNSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkudGhlbigoKSA9PiB7IHRocm93IG5ldyBFcnJvcignZmFpbGVkJyk7IH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdmYWlsZWQnKTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgcmVhZEZpbGVTdHJlYW0ocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVSZWFkU3RyZWFtT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUmVhZGFibGVTdHJlYW1FdmVudHM8VWludDhBcnJheT4ge1xuXHRcdFx0XHRpZiAoYXN5bmMpIHtcblx0XHRcdFx0XHRjb25zdCBzdHJlYW0gPSBuZXdXcml0ZWFibGVTdHJlYW08VWludDhBcnJheT4oY2h1bmsgPT4gY2h1bmtbMF0pO1xuXHRcdFx0XHRcdHRpbWVvdXQoNSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkudGhlbigoKSA9PiBzdHJlYW0uZXJyb3IobmV3IEVycm9yKCdmYWlsZWQnKSkpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHN0cmVhbTtcblxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdmYWlsZWQnKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcigndGVzdCcsIHByb3ZpZGVyKSk7XG5cblx0XHRmb3IgKGNvbnN0IGNhcGFiaWxpdGllcyBvZiBbRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVSZWFkV3JpdGUsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFN0cmVhbSwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVPcGVuUmVhZFdyaXRlQ2xvc2VdKSB7XG5cdFx0XHRwcm92aWRlci5zZXRDYXBhYmlsaXRpZXMoY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0bGV0IGUxO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgc2VydmljZS5yZWFkRmlsZShVUkkucGFyc2UoJ3Rlc3Q6Ly9mb28vYmFyJykpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0ZTEgPSBlcnJvcjtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0Lm9rKGUxKTtcblxuXHRcdFx0bGV0IGUyO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc3RyZWFtID0gYXdhaXQgc2VydmljZS5yZWFkRmlsZVN0cmVhbShVUkkucGFyc2UoJ3Rlc3Q6Ly9mb28vYmFyJykpO1xuXHRcdFx0XHRhd2FpdCBjb25zdW1lU3RyZWFtKHN0cmVhbS52YWx1ZSwgY2h1bmsgPT4gY2h1bmtbMF0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0ZTIgPSBlcnJvcjtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0Lm9rKGUyKTtcblx0XHR9XG5cdH1cblxuXHR0ZXN0KCdyZWFkRmlsZS9yZWFkRmlsZVN0cmVhbSBzdXBwb3J0cyBjYW5jZWxsYXRpb24gKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMzg4MDUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRsZXQgcmVhZEZpbGVTdHJlYW1SZWFkeTogRGVmZXJyZWRQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBOdWxsRmlsZVN5c3RlbVByb3ZpZGVyIHtcblxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgc3RhdChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJU3RhdD4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG10aW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRcdGN0aW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRcdHNpemU6IDEwMCxcblx0XHRcdFx0XHR0eXBlOiBGaWxlVHlwZS5GaWxlXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIHJlYWRGaWxlU3RyZWFtKHJlc291cmNlOiBVUkksIG9wdHM6IElGaWxlUmVhZFN0cmVhbU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFJlYWRhYmxlU3RyZWFtRXZlbnRzPFVpbnQ4QXJyYXk+IHtcblx0XHRcdFx0Y29uc3Qgc3RyZWFtID0gbmV3V3JpdGVhYmxlU3RyZWFtPFVpbnQ4QXJyYXk+KGNodW5rID0+IGNodW5rWzBdKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0XHRzdHJlYW0uZXJyb3IobmV3IEVycm9yKCdFeHBlY3RlZCBjYW5jZWxsYXRpb24nKSk7XG5cdFx0XHRcdFx0c3RyZWFtLmVuZCgpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0cmVhZEZpbGVTdHJlYW1SZWFkeSEuY29tcGxldGUoKTtcblxuXHRcdFx0XHRyZXR1cm4gc3RyZWFtO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCd0ZXN0JywgcHJvdmlkZXIpKTtcblxuXHRcdHByb3ZpZGVyLnNldENhcGFiaWxpdGllcyhGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWRTdHJlYW0pO1xuXG5cdFx0bGV0IGUxO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHJlYWRGaWxlU3RyZWFtUmVhZHkgPSBuZXcgRGVmZXJyZWRQcm9taXNlKCk7XG5cdFx0XHRjb25zdCBwcm9taXNlID0gc2VydmljZS5yZWFkRmlsZShVUkkucGFyc2UoJ3Rlc3Q6Ly9mb28vYmFyJyksIHVuZGVmaW5lZCwgY3RzLnRva2VuKTtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtyZWFkRmlsZVN0cmVhbVJlYWR5LnAudGhlbigoKSA9PiBjdHMuY2FuY2VsKCkpLCBwcm9taXNlXSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGUxID0gZXJyb3I7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGUxKTtcblxuXHRcdGxldCBlMjtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRyZWFkRmlsZVN0cmVhbVJlYWR5ID0gbmV3IERlZmVycmVkUHJvbWlzZSgpO1xuXHRcdFx0Y29uc3Qgc3RyZWFtID0gYXdhaXQgc2VydmljZS5yZWFkRmlsZVN0cmVhbShVUkkucGFyc2UoJ3Rlc3Q6Ly9mb28vYmFyJyksIHVuZGVmaW5lZCwgY3RzLnRva2VuKTtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtyZWFkRmlsZVN0cmVhbVJlYWR5LnAudGhlbigoKSA9PiBjdHMuY2FuY2VsKCkpLCBjb25zdW1lU3RyZWFtKHN0cmVhbS52YWx1ZSwgY2h1bmsgPT4gY2h1bmtbMF0pXSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGUyID0gZXJyb3I7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGUyKTtcblx0fSk7XG5cblx0dGVzdCgnZW5mb3JjZWQgYXRvbWljIHJlYWQvd3JpdGUvZGVsZXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRjb25zdCBhdG9taWNSZXNvdXJjZSA9IFVSSS5wYXJzZSgndGVzdDovL2Zvby9iYXIvYXRvbWljJyk7XG5cdFx0Y29uc3Qgbm9uQXRvbWljUmVzb3VyY2UgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9mb28vbm9uYXRvbWljJyk7XG5cblx0XHRsZXQgYXRvbWljUmVhZENvdW50ZXIgPSAwO1xuXHRcdGxldCBhdG9taWNXcml0ZUNvdW50ZXIgPSAwO1xuXHRcdGxldCBhdG9taWNEZWxldGVDb3VudGVyID0gMDtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgTnVsbEZpbGVTeXN0ZW1Qcm92aWRlciBpbXBsZW1lbnRzIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZUF0b21pY1JlYWRDYXBhYmlsaXR5LCBJRmlsZVN5c3RlbVByb3ZpZGVyV2l0aEZpbGVBdG9taWNXcml0ZUNhcGFiaWxpdHksIElGaWxlU3lzdGVtUHJvdmlkZXJXaXRoRmlsZUF0b21pY0RlbGV0ZUNhcGFiaWxpdHkge1xuXG5cdFx0XHRvdmVycmlkZSBhc3luYyBzdGF0KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElTdGF0PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogRmlsZVR5cGUuRmlsZSxcblx0XHRcdFx0XHRjdGltZTogRGF0ZS5ub3coKSxcblx0XHRcdFx0XHRtdGltZTogRGF0ZS5ub3coKSxcblx0XHRcdFx0XHRzaXplOiAwXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkksIG9wdHM/OiBJRmlsZUF0b21pY1JlYWRPcHRpb25zKTogUHJvbWlzZTxVaW50OEFycmF5PiB7XG5cdFx0XHRcdGlmIChvcHRzPy5hdG9taWMpIHtcblx0XHRcdFx0XHRhdG9taWNSZWFkQ291bnRlcisrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBuZXcgVWludDhBcnJheSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSByZWFkRmlsZVN0cmVhbShyZXNvdXJjZTogVVJJLCBvcHRzOiBJRmlsZVJlYWRTdHJlYW1PcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBSZWFkYWJsZVN0cmVhbUV2ZW50czxVaW50OEFycmF5PiB7XG5cdFx0XHRcdHJldHVybiBuZXdXcml0ZWFibGVTdHJlYW08VWludDhBcnJheT4oY2h1bmsgPT4gY2h1bmtbMF0pO1xuXHRcdFx0fVxuXG5cdFx0XHRlbmZvcmNlQXRvbWljUmVhZEZpbGUocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gaXNFcXVhbChyZXNvdXJjZSwgYXRvbWljUmVzb3VyY2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBhc3luYyB3cml0ZUZpbGUocmVzb3VyY2U6IFVSSSwgY29udGVudDogVWludDhBcnJheSwgb3B0czogSUZpbGVBdG9taWNXcml0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0aWYgKG9wdHMuYXRvbWljKSB7XG5cdFx0XHRcdFx0YXRvbWljV3JpdGVDb3VudGVyKys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZW5mb3JjZUF0b21pY1dyaXRlRmlsZShyZXNvdXJjZTogVVJJKTogSUZpbGVBdG9taWNPcHRpb25zIHwgZmFsc2Uge1xuXHRcdFx0XHRyZXR1cm4gaXNFcXVhbChyZXNvdXJjZSwgYXRvbWljUmVzb3VyY2UpID8geyBwb3N0Zml4OiAnLnRtcCcgfSA6IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBhc3luYyBkZWxldGUocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVBdG9taWNEZWxldGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGlmIChvcHRzLmF0b21pYykge1xuXHRcdFx0XHRcdGF0b21pY0RlbGV0ZUNvdW50ZXIrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRlbmZvcmNlQXRvbWljRGVsZXRlKHJlc291cmNlOiBVUkkpOiBJRmlsZUF0b21pY09wdGlvbnMgfCBmYWxzZSB7XG5cdFx0XHRcdHJldHVybiBpc0VxdWFsKHJlc291cmNlLCBhdG9taWNSZXNvdXJjZSkgPyB7IHBvc3RmaXg6ICcudG1wJyB9IDogZmFsc2U7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHByb3ZpZGVyLnNldENhcGFiaWxpdGllcyhcblx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlIHxcblx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlT3BlblJlYWRXcml0ZUNsb3NlIHxcblx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFN0cmVhbSB8XG5cdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUF0b21pY1JlYWQgfFxuXHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLkZpbGVBdG9taWNXcml0ZSB8XG5cdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZUF0b21pY0RlbGV0ZVxuXHRcdCk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCd0ZXN0JywgcHJvdmlkZXIpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVhZEZpbGUoYXRvbWljUmVzb3VyY2UpO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVhZEZpbGUobm9uQXRvbWljUmVzb3VyY2UpO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVhZEZpbGVTdHJlYW0oYXRvbWljUmVzb3VyY2UpO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVhZEZpbGVTdHJlYW0obm9uQXRvbWljUmVzb3VyY2UpO1xuXG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUoYXRvbWljUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJycpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShub25BdG9taWNSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnJykpO1xuXG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUoYXRvbWljUmVzb3VyY2UsIGJ1ZmZlclRvU3RyZWFtKFZTQnVmZmVyLmZyb21TdHJpbmcoJycpKSk7XG5cdFx0YXdhaXQgc2VydmljZS53cml0ZUZpbGUobm9uQXRvbWljUmVzb3VyY2UsIGJ1ZmZlclRvU3RyZWFtKFZTQnVmZmVyLmZyb21TdHJpbmcoJycpKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLndyaXRlRmlsZShhdG9taWNSZXNvdXJjZSwgYnVmZmVyVG9SZWFkYWJsZShWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKSkpO1xuXHRcdGF3YWl0IHNlcnZpY2Uud3JpdGVGaWxlKG5vbkF0b21pY1Jlc291cmNlLCBidWZmZXJUb1JlYWRhYmxlKFZTQnVmZmVyLmZyb21TdHJpbmcoJycpKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmRlbChhdG9taWNSZXNvdXJjZSk7XG5cdFx0YXdhaXQgc2VydmljZS5kZWwobm9uQXRvbWljUmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF0b21pY1JlYWRDb3VudGVyLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXRvbWljV3JpdGVDb3VudGVyLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXRvbWljRGVsZXRlQ291bnRlciwgMSk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxpQkFBaUIsZUFBZTtBQUN6QyxTQUFTLGtCQUFrQixnQkFBZ0IsZ0JBQWdCO0FBQzNELFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsaUJBQThCLG9CQUFvQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlLDBCQUFnRDtBQUN4RSxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBbUQsZ0NBQWdDLFVBQXFXLHFCQUF1QyxzQkFBc0I7QUFDcmYsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxzQkFBc0I7QUFFL0IsTUFBTSxnQkFBZ0IsTUFBTTtBQUUzQixRQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFFeEMsV0FBUyxNQUFNO0FBQ2QsZ0JBQVksTUFBTTtBQUFBLEVBQ25CLENBQUM7QUFFRCxP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
